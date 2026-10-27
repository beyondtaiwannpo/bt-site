-- BT 歷史之路　2026-11-06（批 1：資料庫）
--
-- 用法：整份貼進 Supabase SQL Editor 按一次 Run。可以重跑。最後印一張 PASS / FAIL 表。
-- **要先跑過 2026-11-01-events.sql**（順序照日期；這一支用到 2026-10-24 的 is_senior() / can_manage()）。
--
-- Paul 2026-11-05 看了 asklex.law/journey 之後定的：做一頁 /history/，捲動沿一條路走，每一站可以點開看那一年的說明與照片，
-- 後台可以自己加站。計畫與三批在 docs/2026-11-05-BT-歷史之路計畫.md。這一支是批 1 的資料庫那一半。
--
-- ============================================================================
-- 這一支在做什麼
-- ============================================================================
--   1. 兩張表 history_milestones（一站）與 history_photos（一站底下的照片）。
--      ⚠ 計畫裡寫的是 milestones / milestone_photos，**表名加了 history_ 前綴**：
--      milestones 這個名字 2026-08-25 護照的里程碑已經用掉了（功能從前端拿掉了，表還在）。函式名照計畫不加前綴。
--      狀態 draft → ready（編的人按）→ published（Co-President 或 Senior Adviser 按）；archived 是撤下來。
--   2. 誰能編：Marketing 資源工作區「管」的人加 senior，寫在 can_edit_history() 一支裡，底下每一支函式都問它。
--   3. 七支函式：upsert_milestone、set_milestone_status、add_milestone_photo、update_milestone_photo、delete_milestone_photo、
--      reorder_milestones、public_milestones。寫一律走函式，表沒有寫的政策。
--   4. **照片同意寫在資料庫不是 UI**：這一站有任何一張照片 consent 沒勾，ready 與 published 都擋（consent_required）。
--      對外的 public_milestones() 也只回 consent=true 的照片，就算有人直接改了狀態也漏不出去。照片不標名字（沒有那個欄位）。
--   5. 對外：public_milestones() 回一個 JSON 陣列，anon 叫得到；只回 published 的站、只回對外要印的欄位；表本身不開給 anon。
--   6. Storage：bucket history（公開讀、5 MB、只收圖），上傳與刪除只給 can_edit_history() 的人。
--      本機 smoke 的 Postgres 沒有 storage schema，所以這一段包在 to_regclass 判斷裡，沒有就跳過並在驗收表印出來。
--   7. 七點 seed：/impact/「五年走過來」那七點，中英文一字不改，published，沒有照片。on conflict do nothing，重跑不會蓋掉後台改過的字。
-- ============================================================================

begin;

-- ---------- 1. 表 ----------
create table if not exists public.history_milestones (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique check (slug ~ '^[a-z0-9-]{2,40}$'),
  happened_on   date not null,
  title_zh      text not null default '',
  title_en      text not null default '',
  summary_zh    text not null default '',
  summary_en    text not null default '',
  body_zh       text not null default '',
  body_en       text not null default '',
  sort          int  not null default 100,
  status        text not null default 'draft' check (status in ('draft', 'ready', 'published', 'archived')),
  published_by  uuid references public.profiles(id) on delete set null,
  published_at  timestamptz,
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists history_milestones_sort on public.history_milestones (sort, happened_on);

create table if not exists public.history_photos (
  id            uuid primary key default gen_random_uuid(),
  milestone_id  uuid not null references public.history_milestones(id) on delete cascade,
  url           text not null check (url ~ '^https://'),
  caption_zh    text not null default '',
  caption_en    text not null default '',
  consent       boolean not null default false,
  sort          int not null default 100,
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now()
);
create index if not exists history_photos_milestone on public.history_photos (milestone_id, sort);

alter table public.history_milestones enable row level security;
alter table public.history_photos     enable row level security;
revoke all on public.history_milestones, public.history_photos from anon, authenticated;
grant select on public.history_milestones, public.history_photos to authenticated;

-- ---------- 2. 誰能編 ----------
-- Marketing 資源工作區「管」的人（Marketing 的 Director）加 senior（Co-President、Senior Adviser）。跟 Events 同一套。
create or replace function public.can_edit_history()
returns boolean language sql stable security definer
set search_path = public, pg_temp
as $$
  select public.is_senior() or public.can_manage('res:Marketing Team');
$$;
revoke all on function public.can_edit_history() from public;
grant execute on function public.can_edit_history() to anon, authenticated;

-- ---------- 3. 函式 ----------
-- 新增或改一站。p_patch 有 id 就是改，沒有就是新增（回 id）。只收它認得的欄位。
create or replace function public.upsert_milestone(p_patch jsonb)
returns uuid language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_id uuid; v_slug text; v_date date; m record;
begin
  if not public.can_edit_history() then raise exception 'not_allowed' using errcode = 'P0001'; end if;
  v_id := nullif(p_patch->>'id', '')::uuid;
  v_slug := nullif(btrim(coalesce(p_patch->>'slug', '')), '');
  if v_slug is not null and v_slug !~ '^[a-z0-9-]{2,40}$' then raise exception 'bad_slug' using errcode = 'P0001'; end if;
  if p_patch ? 'happened_on' then
    begin v_date := nullif(p_patch->>'happened_on', '')::date;
    exception when others then raise exception 'bad_date' using errcode = 'P0001'; end;
  end if;
  if v_id is null then
    if v_slug is null then raise exception 'bad_slug' using errcode = 'P0001'; end if;
    if v_date is null then raise exception 'need_date' using errcode = 'P0001'; end if;
    if coalesce(btrim(p_patch->>'title_zh'), '') = '' and coalesce(btrim(p_patch->>'title_en'), '') = '' then raise exception 'empty_title' using errcode = 'P0001'; end if;
    if exists (select 1 from history_milestones where slug = v_slug) then raise exception 'slug_taken' using errcode = 'P0001'; end if;
    insert into history_milestones (slug, happened_on, title_zh, title_en, summary_zh, summary_en, body_zh, body_en, sort, created_by)
    values (v_slug, v_date,
      coalesce(btrim(p_patch->>'title_zh'), ''), coalesce(btrim(p_patch->>'title_en'), ''),
      coalesce(btrim(p_patch->>'summary_zh'), ''), coalesce(btrim(p_patch->>'summary_en'), ''),
      coalesce(p_patch->>'body_zh', ''), coalesce(p_patch->>'body_en', ''),
      coalesce((select max(sort) from history_milestones), 0) + 10, auth.uid())
    returning id into v_id;
    return v_id;
  end if;
  select * into m from history_milestones where id = v_id;
  if m.id is null then raise exception 'no_such_milestone' using errcode = 'P0001'; end if;
  if v_slug is not null and v_slug <> m.slug and exists (select 1 from history_milestones where slug = v_slug) then raise exception 'slug_taken' using errcode = 'P0001'; end if;
  update history_milestones set
    slug        = coalesce(v_slug, slug),
    happened_on = case when p_patch ? 'happened_on' and v_date is not null then v_date else happened_on end,
    title_zh    = coalesce(btrim(p_patch->>'title_zh'), title_zh),
    title_en    = coalesce(btrim(p_patch->>'title_en'), title_en),
    summary_zh  = coalesce(btrim(p_patch->>'summary_zh'), summary_zh),
    summary_en  = coalesce(btrim(p_patch->>'summary_en'), summary_en),
    body_zh     = coalesce(p_patch->>'body_zh', body_zh),
    body_en     = coalesce(p_patch->>'body_en', body_en),
    updated_at  = now()
  where id = v_id;
  return v_id;
end $$;
revoke all on function public.upsert_milestone(jsonb) from public, anon;
grant execute on function public.upsert_milestone(jsonb) to authenticated;

-- 這一站的照片是不是每一張都勾了同意。沒有照片也算過。
create or replace function public.milestone_consent_ok(p_id uuid)
returns boolean language sql stable security definer
set search_path = public, pg_temp
as $$
  select not exists (select 1 from history_photos where milestone_id = p_id and not consent);
$$;
revoke all on function public.milestone_consent_ok(uuid) from public, anon;
grant execute on function public.milestone_consent_ok(uuid) to authenticated;

-- 狀態。兩把鑰匙：ready 與退回 draft 是編的人；published 與撤下來（archived）只有 senior。
-- published 只能從 ready 來。ready 可以從 draft 或 archived 來（撤下來的要再上去，先按一次準備好了）。
-- **同意沒勾就上不了**：ready 與 published 兩道都擋，不靠人記得。
create or replace function public.set_milestone_status(p_id uuid, p_status text)
returns text language plpgsql security definer
set search_path = public, pg_temp
as $$
declare m record;
begin
  select * into m from history_milestones where id = p_id;
  if m.id is null then raise exception 'no_such_milestone' using errcode = 'P0001'; end if;
  if p_status = 'ready' then
    if not public.can_edit_history() then raise exception 'not_allowed' using errcode = 'P0001'; end if;
    if m.status not in ('draft', 'archived') then raise exception 'already_published' using errcode = 'P0001'; end if;
    if coalesce(btrim(m.title_zh), '') = '' or coalesce(btrim(m.title_en), '') = '' then raise exception 'need_both_titles' using errcode = 'P0001'; end if;
    if not public.milestone_consent_ok(p_id) then raise exception 'consent_required' using errcode = 'P0001'; end if;
    update history_milestones set status = 'ready', updated_at = now() where id = p_id;
  elsif p_status = 'draft' then
    if not public.can_edit_history() then raise exception 'not_allowed' using errcode = 'P0001'; end if;
    if m.status <> 'ready' then raise exception 'not_ready' using errcode = 'P0001'; end if;
    update history_milestones set status = 'draft', updated_at = now() where id = p_id;
  elsif p_status = 'published' then
    perform public.require_senior();
    if m.status <> 'ready' then raise exception 'not_ready' using errcode = 'P0001'; end if;
    if not public.milestone_consent_ok(p_id) then raise exception 'consent_required' using errcode = 'P0001'; end if;
    update history_milestones set status = 'published', published_by = auth.uid(), published_at = now(), updated_at = now() where id = p_id;
  elsif p_status = 'archived' then
    perform public.require_senior();
    if m.status <> 'published' then raise exception 'not_published' using errcode = 'P0001'; end if;
    update history_milestones set status = 'archived', updated_at = now() where id = p_id;
  else
    raise exception 'bad_status' using errcode = 'P0001';
  end if;
  return p_status;
end $$;
revoke all on function public.set_milestone_status(uuid, text) from public, anon;
grant execute on function public.set_milestone_status(uuid, text) to authenticated;

-- 掛一張照片。url 一定是 https（Storage 的公開網址）。新的一張 consent 照傳進來的值，預設 false。
create or replace function public.add_milestone_photo(p_milestone uuid, p_url text, p_caption_zh text default '', p_caption_en text default '', p_consent boolean default false)
returns uuid language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_id uuid;
begin
  if not public.can_edit_history() then raise exception 'not_allowed' using errcode = 'P0001'; end if;
  if not exists (select 1 from history_milestones where id = p_milestone) then raise exception 'no_such_milestone' using errcode = 'P0001'; end if;
  if coalesce(p_url, '') !~ '^https://' then raise exception 'photo_not_https' using errcode = 'P0001'; end if;
  insert into history_photos (milestone_id, url, caption_zh, caption_en, consent, sort, created_by)
  values (p_milestone, btrim(p_url), coalesce(btrim(p_caption_zh), ''), coalesce(btrim(p_caption_en), ''), coalesce(p_consent, false),
          coalesce((select max(sort) from history_photos where milestone_id = p_milestone), 0) + 10, auth.uid())
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.add_milestone_photo(uuid, text, text, text, boolean) from public, anon;
grant execute on function public.add_milestone_photo(uuid, text, text, text, boolean) to authenticated;

-- 改一張照片的說明、同意、順序。url 不給改（換照片就是刪掉再傳，同意是對那一張的）。
-- 把 consent 從 true 改回 false 而那一站已經 ready 或 published：**那一站自動退回 draft**，對外立刻看不到這一站。
create or replace function public.update_milestone_photo(p_id uuid, p_patch jsonb)
returns uuid language plpgsql security definer
set search_path = public, pg_temp
as $$
declare ph record; v_consent boolean;
begin
  if not public.can_edit_history() then raise exception 'not_allowed' using errcode = 'P0001'; end if;
  select * into ph from history_photos where id = p_id;
  if ph.id is null then raise exception 'no_such_photo' using errcode = 'P0001'; end if;
  v_consent := case when p_patch ? 'consent' then (p_patch->>'consent')::boolean else ph.consent end;
  update history_photos set
    caption_zh = coalesce(btrim(p_patch->>'caption_zh'), caption_zh),
    caption_en = coalesce(btrim(p_patch->>'caption_en'), caption_en),
    consent    = v_consent,
    sort       = coalesce((p_patch->>'sort')::int, sort)
  where id = p_id;
  if ph.consent and not v_consent then
    update history_milestones set status = 'draft', updated_at = now() where id = ph.milestone_id and status in ('ready', 'published');
  end if;
  return p_id;
end $$;
revoke all on function public.update_milestone_photo(uuid, jsonb) from public, anon;
grant execute on function public.update_milestone_photo(uuid, jsonb) to authenticated;

create or replace function public.delete_milestone_photo(p_id uuid)
returns text language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_url text;
begin
  if not public.can_edit_history() then raise exception 'not_allowed' using errcode = 'P0001'; end if;
  delete from history_photos where id = p_id returning url into v_url;
  if v_url is null then raise exception 'no_such_photo' using errcode = 'P0001'; end if;
  return v_url;   -- 後台拿它去 Storage 把檔案也刪掉（刪不掉只是多佔一點空間，不擋）。
end $$;
revoke all on function public.delete_milestone_photo(uuid) from public, anon;
grant execute on function public.delete_milestone_photo(uuid) to authenticated;

-- 整串重排：傳進來的順序就是新的 sort（10、20、30…）。沒在串裡的站不動。
create or replace function public.reorder_milestones(p_ids uuid[])
returns int language plpgsql security definer
set search_path = public, pg_temp
as $$
declare n int;
begin
  if not public.can_edit_history() then raise exception 'not_allowed' using errcode = 'P0001'; end if;
  update history_milestones m set sort = x.ord * 10, updated_at = now()
    from unnest(p_ids) with ordinality as x(id, ord) where m.id = x.id;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.reorder_milestones(uuid[]) from public, anon;
grant execute on function public.reorder_milestones(uuid[]) to authenticated;

-- ---------- 4. 對外 ----------
-- 一個 JSON 陣列：只回 published 的站、照 sort 排；每一站帶 consent=true 的照片。沒有名字、沒有誰建的、沒有狀態。
create or replace function public.public_milestones()
returns jsonb language sql stable security definer
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'slug', m.slug, 'happened_on', m.happened_on,
    'title_zh', m.title_zh, 'title_en', m.title_en,
    'summary_zh', m.summary_zh, 'summary_en', m.summary_en,
    'body_zh', m.body_zh, 'body_en', m.body_en,
    'photos', coalesce((
      select jsonb_agg(jsonb_build_object('url', p.url, 'caption_zh', p.caption_zh, 'caption_en', p.caption_en) order by p.sort, p.created_at)
        from history_photos p where p.milestone_id = m.id and p.consent), '[]'::jsonb)
  ) order by m.sort, m.happened_on), '[]'::jsonb)
  from history_milestones m where m.status = 'published';
$$;
revoke all on function public.public_milestones() from public;
grant execute on function public.public_milestones() to anon, authenticated;

-- ---------- 5. RLS ----------
-- 幹部讀全部（後台清單要看草稿）；沒有寫的政策，一律走函式。anon 什麼都讀不到，只能叫 public_milestones()。
drop policy if exists history_milestones_read on public.history_milestones;
create policy history_milestones_read on public.history_milestones for select to authenticated using (public.is_cadre());
drop policy if exists history_photos_read on public.history_photos;
create policy history_photos_read on public.history_photos for select to authenticated using (public.is_cadre());

-- ---------- 6. Storage ----------
-- bucket history：公開讀（對外頁直接用 <img>）、5 MB、只收圖。路徑 <站的 id>/<檔名>。
-- 上傳、改、刪只給 can_edit_history() 的人。本機 Postgres 沒有 storage schema 就整段跳過（驗收表會印 storage 那一列是 SKIP）。
do $$
begin
  if to_regclass('storage.buckets') is null or to_regclass('storage.objects') is null then
    raise notice 'storage schema 不在（本機 smoke），略過 bucket 與政策';
    return;
  end if;
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('history', 'history', true, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/avif'])
  on conflict (id) do update set public = true, file_size_limit = 5242880, allowed_mime_types = excluded.allowed_mime_types;
  execute 'drop policy if exists history_read on storage.objects';
  execute 'create policy history_read on storage.objects for select to public using (bucket_id = ''history'')';
  execute 'drop policy if exists history_insert on storage.objects';
  execute 'create policy history_insert on storage.objects for insert to authenticated with check (bucket_id = ''history'' and public.can_edit_history())';
  execute 'drop policy if exists history_update on storage.objects';
  execute 'create policy history_update on storage.objects for update to authenticated using (bucket_id = ''history'' and public.can_edit_history())';
  execute 'drop policy if exists history_delete on storage.objects';
  execute 'create policy history_delete on storage.objects for delete to authenticated using (bucket_id = ''history'' and public.can_edit_history())';
end $$;

-- ---------- 7. 七點 seed ----------
-- /impact/「五年走過來」的七點，中英一字不改（句尾的句號拿掉當標題）。published，沒有照片。
-- 「現在」沒有一個日期，用這一屆開始的那個月（2026-08-01）；之後後台改得動。
-- on conflict (slug) do nothing：重跑不會把後台改過的字蓋回來。
insert into public.history_milestones (slug, happened_on, title_zh, title_en, sort, status, published_at) values
  ('2020-founded',           '2020-05-01', '成立，七個人',                         'Founded, seven people',                                    10, 'published', now()),
  ('2020-mentorship-begins', '2020-09-01', '導生制度開始，第一批 36 人',           'Mentorship began, 36 students in the first round',         20, 'published', now()),
  ('2021-online-fair',       '2021-06-01', '線上博覽會，超過 400 人參加',          'Online fair, more than 400 attendees',                     30, 'published', now()),
  ('2021-campus-ambassadors','2021-10-01', '校園大使 18 位',                       '18 campus ambassadors',                                    40, 'published', now()),
  ('2023-first-bootcamp',    '2023-06-01', '第一屆探索營，超過 80 人',             'First College Bootcamp, more than 80 students',            50, 'published', now()),
  ('2025-alumni-accounts',   '2025-05-01', '校友帳號超過 85 個',                   'More than 85 alumni accounts',                             60, 'published', now()),
  ('today',                  '2026-08-01', '接近三十位幹部，全部是學生，分布七個國家', 'Close to thirty organisers, all students, across seven countries', 70, 'published', now())
on conflict (slug) do nothing;

commit;

-- ---------- 驗收 ----------
select * from (
  with t as (
    select to_regclass('public.history_milestones') is not null and to_regclass('public.history_photos') is not null as has_tables,
           (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'
              and p.proname in ('can_edit_history', 'upsert_milestone', 'set_milestone_status', 'add_milestone_photo', 'update_milestone_photo',
                                'delete_milestone_photo', 'reorder_milestones', 'public_milestones', 'milestone_consent_ok')) as fns,
           (select count(*) from pg_policies where schemaname = 'public' and tablename in ('history_milestones', 'history_photos')) as pols,
           has_function_privilege('anon', 'public.public_milestones()', 'execute') as anon_ok,
           not has_table_privilege('anon', 'public.history_milestones', 'select') and not has_table_privilege('anon', 'public.history_photos', 'select') as anon_no_table,
           not has_function_privilege('anon', 'public.upsert_milestone(jsonb)', 'execute') as anon_no_write,
           (select regexp_replace(prosrc, '--[^\n]*', '', 'g') like '%consent_required%' from pg_proc where proname = 'set_milestone_status') as consent_gate,
           (select regexp_replace(prosrc, '--[^\n]*', '', 'g') like '%require_senior%' from pg_proc where proname = 'set_milestone_status') as senior_gate,
           (select count(*) from public.history_milestones where status = 'published') >= 7 as seeded,
           jsonb_array_length(public.public_milestones()) >= 7 as public_has_seven,
           to_regclass('storage.buckets') is not null as has_storage,
           case when to_regclass('storage.buckets') is null then null
                else (select count(*) from storage.buckets where id = 'history' and public) = 1 end as bucket_ok,
           case when to_regclass('storage.objects') is null then null
                else (select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'history_%') = 4 end as storage_pols
  )
  select 0 ord, 'OVERALL' as 項目, null::text as 應該是, null::text as 實際是,
    case when has_tables and fns = 9 and pols = 2 and anon_ok and anon_no_table and anon_no_write and consent_gate and senior_gate and seeded and public_has_seven
          and (not has_storage or (bucket_ok and storage_pols)) then 'PASS' else 'FAIL' end as 結果 from t
  union all select 1,  '★ 兩張表在', 'true', has_tables::text, case when has_tables then 'PASS' else 'FAIL' end from t
  union all select 2,  '★ 九支函式在（七支加 can_edit_history、milestone_consent_ok）', '9', fns::text, case when fns = 9 then 'PASS' else 'FAIL' end from t
  union all select 3,  '★ 兩條讀的政策、沒有寫的', '2', pols::text, case when pols = 2 then 'PASS' else 'FAIL' end from t
  union all select 4,  '★ anon 叫得到 public_milestones()', 'true', anon_ok::text, case when anon_ok then 'PASS' else 'FAIL' end from t
  union all select 5,  '★ anon 讀不到兩張表本身', 'true', anon_no_table::text, case when anon_no_table then 'PASS' else 'FAIL' end from t
  union all select 6,  '★ anon 叫不到寫的函式', 'true', anon_no_write::text, case when anon_no_write then 'PASS' else 'FAIL' end from t
  union all select 7,  '★ 狀態函式裡有同意那一道門（consent_required）', 'true', consent_gate::text, case when consent_gate then 'PASS' else 'FAIL' end from t
  union all select 8,  '★ 上架那一道門是 senior（require_senior）', 'true', senior_gate::text, case when senior_gate then 'PASS' else 'FAIL' end from t
  union all select 9,  '七點 seed 在而且是 published', 'true', seeded::text, case when seeded then 'PASS' else 'FAIL' end from t
  union all select 10, '對外 JSON 拿得到那七點', 'true', public_has_seven::text, case when public_has_seven then 'PASS' else 'FAIL' end from t
  union all select 11, 'Storage bucket history（公開讀）', 'true', coalesce(bucket_ok::text, '沒有 storage schema'), case when bucket_ok is null then 'SKIP' when bucket_ok then 'PASS' else 'FAIL' end from t
  union all select 12, 'Storage 四條政策（讀公開、上傳改刪只給編的人）', '4 條', coalesce(storage_pols::text, '沒有 storage schema'), case when storage_pols is null then 'SKIP' when storage_pols then 'PASS' else 'FAIL' end from t
) x order by ord;
