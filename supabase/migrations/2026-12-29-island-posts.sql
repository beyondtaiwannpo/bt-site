-- BT 島上的貼文　2026-11-17（Paul：「when we post something onto it, it just goes to here… how am I supposed to edit it?」）
--
-- 用法：整份貼進 Supabase SQL Editor 按一次 Run。可以重跑。最後印一張 PASS / FAIL 表。
-- 要先跑過 2026-12-25-access-model.sql（這一支用 is_senior()、is_cadre()、can_edit()、can_manage()）。
--
-- ============================================================================
-- 這一支在做什麼
-- ============================================================================
-- /island/ 每一棟（teams.json 裡「在做的事」）底下掛幾則貼文：Instagram 的連結、一句話、日期、一張圖。
-- 之前是改 island/posts.json 加圖檔進 repo，不會寫程式的人做不了。這一支把它搬進資料庫，後台 /admin/site/#island 可以貼。
--
--   1. 一張表 island_posts：program（哪一棟）、team（那一棟屬於哪個 team 的工作區標籤，例如 Curriculum Team；聚會所是空的）、
--      url（只收 https）、kind（post reel link）、caption 中英、posted_on、image_url（Storage 的公開網址，可空）、
--      consent（圖裡有人就要勾）、status（draft → published → archived）、sort。
--   2. 誰能貼：那個 team 的工作區是「改」以上的人、Marketing「管」的人、senior。寫在 can_edit_island_post(team) 一支裡。
--      聚會所（team 空）只有 Marketing「管」與 senior。
--   3. 四支函式：upsert_island_post、set_island_post_status、delete_island_post、public_island_posts。寫一律走函式。
--   4. **圖的同意寫在資料庫不是 UI**：有圖而 consent 沒勾，published 擋（consent_required）；對外的 public_island_posts() 也只回
--      沒有圖或 consent=true 的，就算有人直接改了狀態也漏不出去。
--   5. 對外：public_island_posts() 回 JSON 陣列，anon 叫得到；只回 published；表本身不開給 anon。
--   6. Storage：bucket island（公開讀、5 MB、只收圖），上傳與刪除給任何幹部（哪一張圖掛到哪一則，門在 upsert 那一支）。
--      本機 smoke 沒有 storage schema，包在 to_regclass 判斷裡。
-- ============================================================================

begin;

-- ---------- 1. 表 ----------
create table if not exists public.island_posts (
  id          uuid primary key default gen_random_uuid(),
  program     text not null check (program ~ '^[a-z0-9-]{2,40}$'),
  team        text not null default '',
  url         text not null check (url ~ '^https://'),
  kind        text not null default 'post' check (kind in ('post', 'reel', 'link')),
  caption_zh  text not null default '',
  caption_en  text not null default '',
  posted_on   date,
  image_url   text check (image_url is null or image_url ~ '^https://'),
  consent     boolean not null default false,
  status      text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  sort        int not null default 100,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists island_posts_program on public.island_posts (program, status, posted_on desc);
alter table public.island_posts enable row level security;
revoke all on public.island_posts from anon, authenticated;
grant select on public.island_posts to authenticated;
drop trigger if exists island_posts_touch on public.island_posts;
create trigger island_posts_touch before update on public.island_posts for each row execute function public.touch_updated_at();

-- ---------- 2. 誰能貼 ----------
create or replace function public.can_edit_island_post(p_team text)
returns boolean language sql stable security definer
set search_path = public, pg_temp
as $$
  select public.is_senior()
      or public.can_manage('res:Marketing Team')
      or (coalesce(p_team, '') <> '' and public.can_edit('res:' || p_team));
$$;
revoke all on function public.can_edit_island_post(text) from public;
grant execute on function public.can_edit_island_post(text) to anon, authenticated;

-- ---------- 3. 函式 ----------
-- 新增或改一則。p_patch 有 id 就是改（只收它認得的欄位），沒有就是新增（回 id）。
create or replace function public.upsert_island_post(p_patch jsonb)
returns uuid language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid := nullif(p_patch->>'id', '')::uuid;
  v_team text := coalesce(p_patch->>'team', '');
  v_old record;
begin
  if v_id is null then
    if not public.can_edit_island_post(v_team) then raise exception 'not_allowed' using errcode = 'P0001'; end if;
    if coalesce(p_patch->>'program', '') !~ '^[a-z0-9-]{2,40}$' then raise exception 'bad_program' using errcode = 'P0001'; end if;
    if coalesce(p_patch->>'url', '') !~ '^https://' then raise exception 'url_not_https' using errcode = 'P0001'; end if;
    insert into public.island_posts (program, team, url, kind, caption_zh, caption_en, posted_on, image_url, consent, sort, created_by)
    values (p_patch->>'program', v_team, p_patch->>'url', coalesce(nullif(p_patch->>'kind', ''), 'post'),
            coalesce(p_patch->>'caption_zh', ''), coalesce(p_patch->>'caption_en', ''), nullif(p_patch->>'posted_on', '')::date,
            nullif(p_patch->>'image_url', ''), coalesce((p_patch->>'consent')::boolean, false), coalesce((p_patch->>'sort')::int, 100), auth.uid())
    returning id into v_id;
    return v_id;
  end if;
  select * into v_old from public.island_posts where id = v_id;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  -- 改的人要對舊的 team 有權，換 team 的話對新的也要有。
  if not public.can_edit_island_post(v_old.team) then raise exception 'not_allowed' using errcode = 'P0001'; end if;
  if p_patch ? 'team' and v_team <> v_old.team and not public.can_edit_island_post(v_team) then raise exception 'not_allowed' using errcode = 'P0001'; end if;
  if p_patch ? 'url' and coalesce(p_patch->>'url', '') !~ '^https://' then raise exception 'url_not_https' using errcode = 'P0001'; end if;
  update public.island_posts set
    program    = case when p_patch ? 'program'    then p_patch->>'program' else program end,
    team       = case when p_patch ? 'team'       then v_team else team end,
    url        = case when p_patch ? 'url'        then p_patch->>'url' else url end,
    kind       = case when p_patch ? 'kind'       then coalesce(nullif(p_patch->>'kind', ''), 'post') else kind end,
    caption_zh = case when p_patch ? 'caption_zh' then coalesce(p_patch->>'caption_zh', '') else caption_zh end,
    caption_en = case when p_patch ? 'caption_en' then coalesce(p_patch->>'caption_en', '') else caption_en end,
    posted_on  = case when p_patch ? 'posted_on'  then nullif(p_patch->>'posted_on', '')::date else posted_on end,
    image_url  = case when p_patch ? 'image_url'  then nullif(p_patch->>'image_url', '') else image_url end,
    sort       = case when p_patch ? 'sort'       then coalesce((p_patch->>'sort')::int, 100) else sort end,
    -- 換了圖就把同意拿掉：那是另一張圖，要重新確認。
    consent    = case when p_patch ? 'image_url' and nullif(p_patch->>'image_url', '') is distinct from image_url then false
                      when p_patch ? 'consent' then coalesce((p_patch->>'consent')::boolean, false) else consent end,
    -- 上架中的一則換了圖或連結就退回草稿（對外的那一則變了，要重看一次）。
    status     = case when status = 'published' and ((p_patch ? 'image_url' and nullif(p_patch->>'image_url', '') is distinct from image_url) or (p_patch ? 'url' and p_patch->>'url' <> url)) then 'draft' else status end
  where id = v_id;
  return v_id;
end $$;
revoke all on function public.upsert_island_post(jsonb) from public, anon;
grant execute on function public.upsert_island_post(jsonb) to authenticated;

-- 上架、撤下、退回草稿。有圖而同意沒勾，上不了架。
create or replace function public.set_island_post_status(p_id uuid, p_status text)
returns text language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v record;
begin
  if p_status not in ('draft', 'published', 'archived') then raise exception 'bad_status' using errcode = 'P0001'; end if;
  select * into v from public.island_posts where id = p_id;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  if not public.can_edit_island_post(v.team) then raise exception 'not_allowed' using errcode = 'P0001'; end if;
  if p_status = 'published' and v.image_url is not null and not v.consent then raise exception 'consent_required' using errcode = 'P0001'; end if;
  update public.island_posts set status = p_status where id = p_id;
  return p_status;
end $$;
revoke all on function public.set_island_post_status(uuid, text) from public, anon;
grant execute on function public.set_island_post_status(uuid, text) to authenticated;

-- 刪一則，回它的圖的網址（前端拿去把 Storage 的檔也刪掉）。
create or replace function public.delete_island_post(p_id uuid)
returns text language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v record;
begin
  select * into v from public.island_posts where id = p_id;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  if not public.can_edit_island_post(v.team) then raise exception 'not_allowed' using errcode = 'P0001'; end if;
  delete from public.island_posts where id = p_id;
  return v.image_url;
end $$;
revoke all on function public.delete_island_post(uuid) from public, anon;
grant execute on function public.delete_island_post(uuid) to authenticated;

-- 對外：只回 published、只回沒有圖或同意勾了的、只回對外要印的欄位。新的在前。
create or replace function public.public_island_posts()
returns jsonb language sql stable security definer
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'program', p.program, 'url', p.url, 'kind', p.kind, 'date', p.posted_on,
    'caption_zh', p.caption_zh, 'caption_en', p.caption_en, 'image', p.image_url
  ) order by p.sort, p.posted_on desc nulls last, p.created_at desc), '[]'::jsonb)
  from island_posts p
  where p.status = 'published' and (p.image_url is null or p.consent);
$$;
revoke all on function public.public_island_posts() from public;
grant execute on function public.public_island_posts() to anon, authenticated;

-- ---------- 4. RLS ----------
drop policy if exists island_posts_read on public.island_posts;
create policy island_posts_read on public.island_posts for select to authenticated using (public.is_cadre());

-- ---------- 5. Storage ----------
do $$
begin
  if to_regclass('storage.buckets') is null or to_regclass('storage.objects') is null then
    raise notice 'storage schema 不在（本機 smoke），略過 bucket 與政策';
    return;
  end if;
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('island', 'island', true, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/avif'])
  on conflict (id) do update set public = true, file_size_limit = 5242880, allowed_mime_types = excluded.allowed_mime_types;
  execute 'drop policy if exists island_read on storage.objects';
  execute 'create policy island_read on storage.objects for select to public using (bucket_id = ''island'')';
  execute 'drop policy if exists island_insert on storage.objects';
  execute 'create policy island_insert on storage.objects for insert to authenticated with check (bucket_id = ''island'' and public.is_cadre())';
  execute 'drop policy if exists island_update on storage.objects';
  execute 'create policy island_update on storage.objects for update to authenticated using (bucket_id = ''island'' and public.is_cadre())';
  execute 'drop policy if exists island_delete on storage.objects';
  execute 'create policy island_delete on storage.objects for delete to authenticated using (bucket_id = ''island'' and public.is_cadre())';
end $$;

commit;

-- ---------- 驗收 ----------
select * from (
  with t as (
    select to_regclass('public.island_posts') is not null as tbl,
           (select count(*) from pg_proc p where p.pronamespace = 'public'::regnamespace
             and p.proname in ('can_edit_island_post', 'upsert_island_post', 'set_island_post_status', 'delete_island_post', 'public_island_posts')) as fns,
           (select regexp_replace(prosrc, '--[^\n]*', '', 'g') like '%consent_required%' from pg_proc where proname = 'set_island_post_status') as consent_gate,
           (select regexp_replace(prosrc, '--[^\n]*', '', 'g') like '%p.image_url is null or p.consent%' from pg_proc where proname = 'public_island_posts') as public_gate,
           (select count(*) from pg_proc p, aclexplode(p.proacl) x where p.proname = 'public_island_posts' and x.grantee = 'anon'::regrole and x.privilege_type = 'EXECUTE') = 1 as anon_ok,
           (select count(*) from pg_proc p, aclexplode(p.proacl) x where p.proname in ('upsert_island_post', 'set_island_post_status', 'delete_island_post') and x.grantee = 'anon'::regrole) = 0 as anon_no_write,
           (select count(*) from information_schema.table_privileges where table_name = 'island_posts' and grantee = 'anon') = 0 as anon_no_table,
           to_regclass('storage.buckets') is not null as has_storage,
           case when to_regclass('storage.buckets') is null then null else (select count(*) from storage.buckets where id = 'island' and public) = 1 end as bucket_ok
  )
  select 0 ord, 'OVERALL' as 項目, null::text as 應該是, null::text as 實際是,
    case when tbl and fns = 5 and consent_gate and public_gate and anon_ok and anon_no_write and anon_no_table and (not has_storage or bucket_ok) then 'PASS' else 'FAIL' end as 結果 from t
  union all select 1, 'island_posts 表在', 'true', tbl::text, case when tbl then 'PASS' else 'FAIL' end from t
  union all select 2, '五支函式在', '5', fns::text, case when fns = 5 then 'PASS' else 'FAIL' end from t
  union all select 3, '★ 有圖沒同意上不了架', 'true', coalesce(consent_gate::text, '（函式不存在）'), case when consent_gate then 'PASS' else 'FAIL' end from t
  union all select 4, '★ 對外只回沒有圖或同意勾了的', 'true', coalesce(public_gate::text, '（函式不存在）'), case when public_gate then 'PASS' else 'FAIL' end from t
  union all select 5, '沒登入叫得動 public_island_posts()', 'true', anon_ok::text, case when anon_ok then 'PASS' else 'FAIL' end from t
  union all select 6, '★ 沒登入叫不動寫的三支、讀不到表', 'true|true', anon_no_write::text || '|' || anon_no_table::text, case when anon_no_write and anon_no_table then 'PASS' else 'FAIL' end from t
  union all select 7, 'Storage bucket island（公開讀）', 'true', coalesce(bucket_ok::text, '沒有 storage schema'), case when bucket_ok is null then 'SKIP' when bucket_ok then 'PASS' else 'FAIL' end from t
) q order by ord;
