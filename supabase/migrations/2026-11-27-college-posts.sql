-- 後台 Marketing 區：大學介紹貼文產生器（COLLEGE INTRO SERIES）　2026-11-27
--
-- 用法：整份貼進 Supabase SQL Editor 按一次 Run。可以重跑，不動既有資料。最後印一張 PASS / FAIL 表。
-- 要先跑過 2026-10-24-ranks-and-workspaces.sql 與 2026-11-26-instagram-connect.sql。
--
-- Paul 2026-10-31：「我還是要你把 Marketing dashboard 做在網站上，貼文產生器是裡面的一個功能。」
-- 計畫在 ~/Anson/outputs/beyond-taiwan/website/docs/2026-10-29-marketing-dashboard-plan/plan.md，Paul 的決定記在 ~/Anson/decisions/log.md。
--
-- ============================================================================
-- 這一支在做什麼
-- ============================================================================
--   1. 一張表 college_posts：一所學校一篇貼文。投影片上的每一個字（data）、每個數字的來源（sources）、
--      每個數字「我點開看過」的勾（checks）、caption、狀態。表沒有任何寫的政策，寫一律走下面的函式。
--   2. 狀態：draft（草稿）→ in_review（送審）→ approved（核可）→ posted（已經發到 IG，貼上連結）。
--      也可以 archived（收起來，不刪）。核可之後只要內容改了一個字，就自動退回 in_review，要重新核可。
--   3. 誰能做什麼：
--        看：senior，或被派進 Marketing 資源工作區、行銷需求單工作區、Marketing 貼文核可工作區（任何等級）。
--        做貼文、改、勾來源、送審、收起來：senior，或 Marketing 資源工作區、行銷需求單工作區「改」以上。
--        核可、退回：senior，或被派進新的工作區 custom:marketing-approve（任何等級）。**作者自己不能核可。**
--      custom:marketing-approve 的擁有人是一位 Co-President。誰能核可由 Co-President 在「人與權限 → 誰能改什麼」加人減人
--     （Paul 2026-10-29：「我要能自己決定誰可以核可」）。建好時把 Marketing 的 Director 加進去（等級「看」）。
--   4. 每個數字的勾記下「勾的時候那個數字與來源長什麼樣」（雜湊）。之後數字或來源被改了，勾自動失效，要重新點開確認。
--      核可前資料庫檢查：每一個有填值的數字都有有效的勾、每一張用到的照片都有作者與授權。
--   5. 私人 bucket marketing-media 放照片（8 MB、jpeg／png／webp）。看得到的人讀、改得動的人傳。
--   6. ig_can_view() 也認新的核可工作區（只被派去核可的人，打開 Instagram 那一頁不會出錯）。
--
-- 不發文：這一支跟 Instagram 沒有關係。核可之後由人下載、自己發，再回來貼上連結標成已發。
-- ============================================================================

begin;

-- ---------- 1. 核可工作區 ----------
do $$
declare v_owner uuid;
begin
  select id into v_owner from profiles where role = 'cadre' and board_role = 'president' order by updated_at limit 1;
  insert into workspaces (id, kind, team, title_zh, title_en, owner)
  values ('custom:marketing-approve', 'custom', 'Marketing Team', 'Marketing 貼文核可', 'Marketing post approvals', v_owner)
  on conflict (id) do nothing;
  -- Marketing 的 Director（這一屆職級是 director、team 勾了 Marketing 的人）先加進去，等級「看」（能核可、不能再加人）。
  insert into assignments (user_id, workspace_id, level)
  select p.id, 'custom:marketing-approve', 'view' from profiles p
   where p.role = 'cadre' and p.board_role = 'director' and p.team like '%Marketing%'
  on conflict (user_id, workspace_id) do nothing;
end $$;

-- ---------- 2. 三道門 ----------
create or replace function public.mkt_can_view()
returns boolean language sql stable security definer
set search_path = public, pg_temp
as $$
  select public.is_senior() or public.can_view('res:Marketing Team') or public.can_view('custom:marketing-requests')
      or public.can_view('custom:marketing-approve');
$$;
create or replace function public.mkt_can_edit()
returns boolean language sql stable security definer
set search_path = public, pg_temp
as $$
  select public.is_senior() or public.can_edit('res:Marketing Team') or public.can_edit('custom:marketing-requests');
$$;
create or replace function public.mkt_can_approve()
returns boolean language sql stable security definer
set search_path = public, pg_temp
as $$
  select public.is_senior() or public.can_view('custom:marketing-approve');
$$;
revoke all on function public.mkt_can_view(), public.mkt_can_edit(), public.mkt_can_approve() from public, anon;
grant execute on function public.mkt_can_view(), public.mkt_can_edit(), public.mkt_can_approve() to authenticated;

-- Instagram 那一頁也認核可工作區（2026-11-26 那一支的 ig_can_view 加一個條件，其他不動）。
create or replace function public.ig_can_view()
returns boolean language sql stable security definer
set search_path = public, pg_temp
as $$
  select public.is_senior() or public.can_view('res:Marketing Team') or public.can_view('custom:marketing-requests')
      or public.can_view('custom:marketing-approve');
$$;

-- ---------- 3. 表 ----------
create table if not exists public.college_posts (
  id uuid primary key default gen_random_uuid(),
  school text not null check (length(btrim(school)) between 2 and 120),
  -- 拿來擋重複：只留英數小寫（"UW-Madison" 與 "uw madison" 算同一所）。
  school_key text generated always as (lower(regexp_replace(school, '[^A-Za-z0-9]+', '', 'g'))) stored,
  status text not null default 'draft' check (status in ('draft', 'in_review', 'approved', 'posted', 'archived')),
  data jsonb not null default '{}'::jsonb,
  sources jsonb not null default '{}'::jsonb,
  checks jsonb not null default '{}'::jsonb,
  caption text not null default '',
  review_note text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  submitted_at timestamptz,
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  approved_hash text,
  posted_by uuid references public.profiles(id) on delete set null,
  posted_at timestamptz,
  posted_url text
);
create unique index if not exists college_posts_school_once on public.college_posts (school_key) where status <> 'archived';
alter table public.college_posts enable row level security;
revoke all on public.college_posts from public, anon, authenticated;
grant select on public.college_posts to authenticated;
drop policy if exists college_posts_read on public.college_posts;
create policy college_posts_read on public.college_posts for select to authenticated using (public.mkt_can_view());

-- ---------- 4. 數字與它在 data 裡的位置 ----------
-- 每一個要附來源、要有人勾「我點開看過」的數字。前端 admin/marketing/src/slides.js 的 FACTS 是同一份清單（test 比對）。
create or replace function public.mkt_facts()
returns table (key text, path text[]) language sql immutable
set search_path = public, pg_temp
as $$
  values ('rank', array['basic','ranking']), ('type', array['basic','type']), ('setting', array['basic','setting']),
         ('enrollment', array['basic','enrollment']), ('acceptance', array['apply','acceptance']), ('applicants', array['apply','applicants']),
         ('gpa', array['apply','gpa']), ('sat', array['apply','sat']), ('act', array['apply','act']), ('test_note', array['apply','test_note']),
         ('toefl', array['apply','toefl']), ('ielts', array['apply','ielts']), ('duolingo', array['apply','duolingo']),
         ('timeline', array['timeline','rows']), ('majors', array['majors','rows']), ('alumni', array['fun','alumni']),
         ('cover_rank', array['cover','tags1']);
$$;
-- 一個數字現在的樣子（值加來源）的雜湊。勾的時候存一份，之後比對，不一樣就是勾失效了。
create or replace function public.mkt_fact_hash(p_data jsonb, p_sources jsonb, p_key text)
returns text language sql immutable
set search_path = public, pg_temp
as $$
  select md5(coalesce((select p_data #> f.path from public.mkt_facts() f where f.key = p_key), 'null'::jsonb)::text
             || '|' || coalesce(p_sources -> p_key, '[]'::jsonb)::text);
$$;
-- 這個數字有沒有填值（空字串、空陣列、null 都算沒填，沒填的不用勾）。
create or replace function public.mkt_fact_filled(p_data jsonb, p_key text)
returns boolean language sql immutable
set search_path = public, pg_temp
as $$
  select coalesce((select case jsonb_typeof(v) when 'string' then btrim(v #>> '{}') <> '' when 'array' then jsonb_array_length(v) > 0
                                               when 'null' then false else true end
                     from (select p_data #> f.path as v from public.mkt_facts() f where f.key = p_key) x where v is not null), false);
$$;
-- 整篇的雜湊：核可時存，發布前比對。
create or replace function public.mkt_post_hash(p_data jsonb, p_caption text)
returns text language sql immutable
set search_path = public, pg_temp
as $$ select md5(coalesce(p_data, '{}'::jsonb)::text || '|' || coalesce(p_caption, '')); $$;

-- 還沒好的地方（核可前要是空的）：沒勾或勾失效的數字、缺作者或授權的照片。前端也叫它畫「還差什麼」。
create or replace function public.mkt_post_problems(p_data jsonb, p_sources jsonb, p_checks jsonb)
returns text[] language sql stable
set search_path = public, pg_temp
as $$
  select coalesce(array_agg(x order by x), '{}') from (
    select 'unchecked:' || f.key as x from public.mkt_facts() f
     where public.mkt_fact_filled(p_data, f.key)
       and coalesce(p_checks -> f.key ->> 'h', '') <> public.mkt_fact_hash(p_data, p_sources, f.key)
    union all
    select 'photo:' || k from jsonb_each(coalesce(p_data -> 'photos', '{}'::jsonb)) as ph(k, v)
     where jsonb_typeof(v) = 'object' and coalesce(v ->> 'path', '') <> ''
       and (coalesce(btrim(v ->> 'credit'), '') = '' or coalesce(btrim(v ->> 'license'), '') = '')
  ) t;
$$;

-- ---------- 5. 寫：每一支第一句是門 ----------
-- 開一篇。同一所學校（沒收起來的）只能有一篇。
create or replace function public.mkt_post_create(p_school text, p_data jsonb default '{}'::jsonb, p_sources jsonb default '{}'::jsonb, p_caption text default '')
returns uuid language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_id uuid; v_school text := btrim(coalesce(p_school, ''));
begin
  if not public.mkt_can_edit() then raise exception 'not_marketing_editor' using errcode = 'P0001'; end if;
  if length(v_school) < 2 then raise exception 'need_school' using errcode = 'P0001'; end if;
  if exists (select 1 from college_posts where status <> 'archived'
              and school_key = lower(regexp_replace(v_school, '[^A-Za-z0-9]+', '', 'g'))) then
    raise exception 'already_in_series' using errcode = 'P0001';
  end if;
  insert into college_posts (school, data, sources, caption, created_by, updated_by)
  values (v_school, coalesce(p_data, '{}'::jsonb), coalesce(p_sources, '{}'::jsonb), coalesce(p_caption, ''), auth.uid(), auth.uid())
  returning id into v_id;
  return v_id;
end $$;

-- 存。核可過的內容一改，退回 in_review、清掉核可。已經發出去的不能改（要改就是另一篇）。
create or replace function public.mkt_post_save(p_id uuid, p_data jsonb, p_sources jsonb, p_caption text)
returns text language plpgsql security definer
set search_path = public, pg_temp
as $$
declare r college_posts;
begin
  if not public.mkt_can_edit() then raise exception 'not_marketing_editor' using errcode = 'P0001'; end if;
  select * into r from college_posts where id = p_id for update;
  if r.id is null then raise exception 'no_such_post' using errcode = 'P0001'; end if;
  if r.status in ('posted', 'archived') then raise exception 'post_locked' using errcode = 'P0001'; end if;
  update college_posts set data = coalesce(p_data, '{}'::jsonb), sources = coalesce(p_sources, '{}'::jsonb), caption = coalesce(p_caption, ''),
         school = coalesce(nullif(btrim(p_data ->> 'school'), ''), school),
         updated_by = auth.uid(), updated_at = now(),
         status = case when r.status = 'approved' and public.mkt_post_hash(p_data, p_caption) is distinct from r.approved_hash then 'in_review' else r.status end,
         approved_by = case when r.status = 'approved' and public.mkt_post_hash(p_data, p_caption) is distinct from r.approved_hash then null else r.approved_by end,
         approved_at = case when r.status = 'approved' and public.mkt_post_hash(p_data, p_caption) is distinct from r.approved_hash then null else r.approved_at end,
         approved_hash = case when r.status = 'approved' and public.mkt_post_hash(p_data, p_caption) is distinct from r.approved_hash then null else r.approved_hash end
   where id = p_id
  returning status into r.status;
  return r.status;
end $$;

-- 勾「我點開看過、數字對得上」。至少要有一個來源連結才勾得了。p_on = false 取消。
create or replace function public.mkt_post_check(p_id uuid, p_key text, p_on boolean)
returns jsonb language plpgsql security definer
set search_path = public, pg_temp
as $$
declare r college_posts; v_ok boolean;
begin
  if not public.mkt_can_edit() then raise exception 'not_marketing_editor' using errcode = 'P0001'; end if;
  select * into r from college_posts where id = p_id for update;
  if r.id is null then raise exception 'no_such_post' using errcode = 'P0001'; end if;
  if r.status in ('posted', 'archived') then raise exception 'post_locked' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.mkt_facts() where key = p_key) then raise exception 'no_such_fact' using errcode = 'P0001'; end if;
  if p_on then
    select exists (select 1 from jsonb_array_elements(case when jsonb_typeof(r.sources -> p_key) = 'array' then r.sources -> p_key else '[]'::jsonb end) s
                    where coalesce(s ->> 'url', '') ~ '^https?://') into v_ok;
    if not v_ok then raise exception 'need_source_url' using errcode = 'P0001'; end if;
    update college_posts set checks = checks || jsonb_build_object(p_key, jsonb_build_object(
             'by', auth.uid(), 'at', now(), 'h', public.mkt_fact_hash(r.data, r.sources, p_key)))
     where id = p_id returning checks into r.checks;
  else
    update college_posts set checks = checks - p_key where id = p_id returning checks into r.checks;
  end if;
  return r.checks;
end $$;

-- 送審：草稿才送得了，還沒好的地方要是空的。
create or replace function public.mkt_post_submit(p_id uuid)
returns text language plpgsql security definer
set search_path = public, pg_temp
as $$
declare r college_posts; v text[];
begin
  if not public.mkt_can_edit() then raise exception 'not_marketing_editor' using errcode = 'P0001'; end if;
  select * into r from college_posts where id = p_id for update;
  if r.id is null then raise exception 'no_such_post' using errcode = 'P0001'; end if;
  if r.status <> 'draft' then raise exception 'not_draft' using errcode = 'P0001'; end if;
  v := public.mkt_post_problems(r.data, r.sources, r.checks);
  if array_length(v, 1) > 0 then raise exception 'not_ready: %', array_to_string(v, ',') using errcode = 'P0001'; end if;
  update college_posts set status = 'in_review', submitted_at = now(), review_note = null where id = p_id;
  return 'in_review';
end $$;

-- 核可：要是核可的人、不是作者、送審中、還沒好的地方是空的，而且核可的人看到的版本就是現在的版本（p_hash）。
create or replace function public.mkt_post_approve(p_id uuid, p_hash text)
returns text language plpgsql security definer
set search_path = public, pg_temp
as $$
declare r college_posts; v text[];
begin
  if not public.mkt_can_approve() then raise exception 'not_approver' using errcode = 'P0001'; end if;
  select * into r from college_posts where id = p_id for update;
  if r.id is null then raise exception 'no_such_post' using errcode = 'P0001'; end if;
  if r.created_by = auth.uid() then raise exception 'cannot_approve_own' using errcode = 'P0001'; end if;
  if r.status <> 'in_review' then raise exception 'not_in_review' using errcode = 'P0001'; end if;
  if p_hash is distinct from public.mkt_post_hash(r.data, r.caption) then raise exception 'changed_since_viewed' using errcode = 'P0001'; end if;
  v := public.mkt_post_problems(r.data, r.sources, r.checks);
  if array_length(v, 1) > 0 then raise exception 'not_ready: %', array_to_string(v, ',') using errcode = 'P0001'; end if;
  update college_posts set status = 'approved', approved_by = auth.uid(), approved_at = now(), approved_hash = p_hash, review_note = null where id = p_id;
  return 'approved';
end $$;

-- 退回草稿（核可的人用），一定要寫原因。
create or replace function public.mkt_post_return(p_id uuid, p_note text)
returns text language plpgsql security definer
set search_path = public, pg_temp
as $$
declare r college_posts;
begin
  if not public.mkt_can_approve() then raise exception 'not_approver' using errcode = 'P0001'; end if;
  if coalesce(btrim(p_note), '') = '' then raise exception 'need_note' using errcode = 'P0001'; end if;
  select * into r from college_posts where id = p_id for update;
  if r.id is null then raise exception 'no_such_post' using errcode = 'P0001'; end if;
  if r.status not in ('in_review', 'approved') then raise exception 'not_in_review' using errcode = 'P0001'; end if;
  update college_posts set status = 'draft', review_note = btrim(p_note), approved_by = null, approved_at = null, approved_hash = null where id = p_id;
  return 'draft';
end $$;

-- 已經發到 IG：核可過的才標得了，貼上貼文連結。
create or replace function public.mkt_post_mark_posted(p_id uuid, p_url text)
returns text language plpgsql security definer
set search_path = public, pg_temp
as $$
declare r college_posts;
begin
  if not (public.mkt_can_edit() or public.mkt_can_approve()) then raise exception 'not_marketing_editor' using errcode = 'P0001'; end if;
  if coalesce(p_url, '') !~ '^https://(www\.)?instagram\.com/' then raise exception 'need_instagram_url' using errcode = 'P0001'; end if;
  select * into r from college_posts where id = p_id for update;
  if r.id is null then raise exception 'no_such_post' using errcode = 'P0001'; end if;
  if r.status <> 'approved' then raise exception 'not_approved' using errcode = 'P0001'; end if;
  if public.mkt_post_hash(r.data, r.caption) is distinct from r.approved_hash then raise exception 'changed_since_approved' using errcode = 'P0001'; end if;
  update college_posts set status = 'posted', posted_by = auth.uid(), posted_at = now(), posted_url = btrim(p_url) where id = p_id;
  return 'posted';
end $$;

-- 收起來（不刪）：草稿或送審中才收得了。收起來之後同一所學校可以重新開一篇。
create or replace function public.mkt_post_archive(p_id uuid)
returns text language plpgsql security definer
set search_path = public, pg_temp
as $$
declare r college_posts;
begin
  if not public.mkt_can_edit() then raise exception 'not_marketing_editor' using errcode = 'P0001'; end if;
  select * into r from college_posts where id = p_id for update;
  if r.id is null then raise exception 'no_such_post' using errcode = 'P0001'; end if;
  if r.status not in ('draft', 'in_review') then raise exception 'post_locked' using errcode = 'P0001'; end if;
  update college_posts set status = 'archived' where id = p_id;
  return 'archived';
end $$;

-- 這一頁要的東西一趟拿：我能做什麼、每一篇還差什麼、人名。
create or replace function public.mkt_bootstrap()
returns jsonb language plpgsql stable security definer
set search_path = public, pg_temp
as $$
begin
  if not public.mkt_can_view() then raise exception 'not_marketing' using errcode = 'P0001'; end if;
  return jsonb_build_object(
    'can_edit', public.mkt_can_edit(), 'can_approve', public.mkt_can_approve(), 'me', auth.uid(),
    'facts', (select jsonb_agg(jsonb_build_object('key', key, 'path', path)) from public.mkt_facts()),
    'problems', coalesce((select jsonb_object_agg(id, public.mkt_post_problems(data, sources, checks)) from college_posts), '{}'::jsonb),
    'hashes', coalesce((select jsonb_object_agg(id, public.mkt_post_hash(data, caption)) from college_posts), '{}'::jsonb),
    'names', coalesce((select jsonb_object_agg(p.id, coalesce(nullif(p.name_zh, ''), p.name_en, '')) from profiles p
                        where p.id in (select created_by from college_posts union select approved_by from college_posts
                                       union select updated_by from college_posts union select posted_by from college_posts)), '{}'::jsonb));
end $$;

do $$
declare f text;
begin
  foreach f in array array['mkt_post_create(text, jsonb, jsonb, text)', 'mkt_post_save(uuid, jsonb, jsonb, text)', 'mkt_post_check(uuid, text, boolean)',
                           'mkt_post_submit(uuid)', 'mkt_post_approve(uuid, text)', 'mkt_post_return(uuid, text)', 'mkt_post_mark_posted(uuid, text)',
                           'mkt_post_archive(uuid)', 'mkt_bootstrap()'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
revoke all on function public.mkt_facts(), public.mkt_fact_hash(jsonb, jsonb, text), public.mkt_fact_filled(jsonb, text),
                       public.mkt_post_hash(jsonb, text), public.mkt_post_problems(jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.mkt_facts(), public.mkt_fact_hash(jsonb, jsonb, text), public.mkt_fact_filled(jsonb, text),
                          public.mkt_post_hash(jsonb, text), public.mkt_post_problems(jsonb, jsonb, jsonb) to authenticated;

-- ---------- 6. Storage：私人 bucket marketing-media ----------
-- 路徑 <貼文 id>/<哪一張>-<時間>-<亂數>.<副檔名>。看用簽名網址。本機沒有 storage schema 就跳過（驗收表印 SKIP）。
do $$
begin
  if to_regclass('storage.buckets') is null or to_regclass('storage.objects') is null then
    raise notice 'storage schema 不在（本機 smoke），略過 bucket 與政策';
    return;
  end if;
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('marketing-media', 'marketing-media', false, 8388608, array['image/jpeg', 'image/png', 'image/webp'])
  on conflict (id) do update set public = false, file_size_limit = 8388608, allowed_mime_types = excluded.allowed_mime_types;
  execute 'drop policy if exists mkt_media_read on storage.objects';
  execute 'create policy mkt_media_read on storage.objects for select to authenticated using (bucket_id = ''marketing-media'' and public.mkt_can_view())';
  execute 'drop policy if exists mkt_media_insert on storage.objects';
  execute 'create policy mkt_media_insert on storage.objects for insert to authenticated with check (bucket_id = ''marketing-media'' and public.mkt_can_edit())';
  execute 'drop policy if exists mkt_media_update on storage.objects';
  execute 'create policy mkt_media_update on storage.objects for update to authenticated using (bucket_id = ''marketing-media'' and public.mkt_can_edit())';
  execute 'drop policy if exists mkt_media_delete on storage.objects';
  execute 'create policy mkt_media_delete on storage.objects for delete to authenticated using (bucket_id = ''marketing-media'' and public.mkt_can_edit())';
end $$;

commit;

-- ---------- 驗收 ----------
select * from (
  with f as (
    select proname, regexp_replace(prosrc, '--[^\n]*', '', 'g') as body, prosecdef
      from pg_proc where pronamespace = 'public'::regnamespace and proname like 'mkt\_%'
  ), s as (
    select
      exists (select 1 from workspaces where id = 'custom:marketing-approve' and kind = 'custom' and team = 'Marketing Team') as ws_ok,
      (select relrowsecurity from pg_class where oid = 'public.college_posts'::regclass) as rls,
      (select count(*) from pg_policies where schemaname = 'public' and tablename = 'college_posts' and cmd <> 'SELECT') as write_pols,
      not has_table_privilege('anon', 'public.college_posts', 'select')
        and not has_table_privilege('authenticated', 'public.college_posts', 'insert')
        and not has_table_privilege('authenticated', 'public.college_posts', 'update')
        and not has_table_privilege('authenticated', 'public.college_posts', 'delete') as no_direct,
      (select count(*) from f where proname in ('mkt_post_create', 'mkt_post_save', 'mkt_post_check', 'mkt_post_submit', 'mkt_post_archive')
          and prosecdef and body like '%if not public.mkt_can_edit() then raise%') as edit_gates,
      (select count(*) from f where proname in ('mkt_post_approve', 'mkt_post_return') and prosecdef and body like '%if not public.mkt_can_approve() then raise%') as approve_gates,
      coalesce((select body from f where proname = 'mkt_post_approve'), '') like '%cannot_approve_own%' as not_own,
      coalesce((select body from f where proname = 'mkt_post_approve'), '') like '%changed_since_viewed%' as same_version,
      coalesce((select body from f where proname = 'mkt_post_save'), '') like '%then ''in_review''%' as edit_unapproves,
      coalesce((select body from f where proname = 'mkt_post_check'), '') like '%need_source_url%' as need_url,
      (select count(*) from pg_proc p, aclexplode(p.proacl) x
        where p.pronamespace = 'public'::regnamespace and p.proname like 'mkt\_%'
          and x.grantee in (0::regrole, 'anon'::regrole) and x.privilege_type = 'EXECUTE') as anon_n,
      (select count(*) from public.mkt_facts()) as facts,
      regexp_replace((select prosrc from pg_proc where proname = 'ig_can_view' and pronamespace = 'public'::regnamespace), '--[^\n]*', '', 'g') like '%marketing-approve%' as ig_ok,
      case when to_regclass('storage.buckets') is null then null
           else exists (select 1 from storage.buckets where id = 'marketing-media' and not public) end as bucket_ok
  )
  select 0 ord, 'OVERALL' as 項目, null::text as 應該是, null::text as 實際是,
    case when ws_ok and rls and write_pols = 0 and no_direct and edit_gates = 5 and approve_gates = 2 and not_own and same_version
              and edit_unapproves and need_url and anon_n = 0 and facts = 17 and ig_ok and coalesce(bucket_ok, true) then 'PASS' else 'FAIL' end as 結果 from s
  union all select 1, '核可工作區 custom:marketing-approve 在 Marketing 那一列', 'true', ws_ok::text, case when ws_ok then 'PASS' else 'FAIL' end from s
  union all select 2, '★ college_posts 開了 RLS、沒有任何寫的政策、網站上的人不能直接寫', 'true|0|true', rls::text || '|' || write_pols || '|' || no_direct, case when rls and write_pols = 0 and no_direct then 'PASS' else 'FAIL' end from s
  union all select 3, '★ 開、存、勾、送審、收起來五支都先問「改得動嗎」', '5', edit_gates::text, case when edit_gates = 5 then 'PASS' else 'FAIL' end from s
  union all select 4, '★ 核可、退回兩支都先問「是核可的人嗎」', '2', approve_gates::text, case when approve_gates = 2 then 'PASS' else 'FAIL' end from s
  union all select 5, '★ 作者不能核可自己的貼文', 'true', not_own::text, case when not_own then 'PASS' else 'FAIL' end from s
  union all select 6, '★ 核可的是核可的人看到的那一版', 'true', same_version::text, case when same_version then 'PASS' else 'FAIL' end from s
  union all select 7, '★ 核可過的內容一改就退回送審', 'true', edit_unapproves::text, case when edit_unapproves then 'PASS' else 'FAIL' end from s
  union all select 8, '★ 沒有來源連結勾不了「點開看過」', 'true', need_url::text, case when need_url then 'PASS' else 'FAIL' end from s
  union all select 9, '★ 沒登入叫不動任何一支', '0 筆', anon_n::text || ' 筆', case when anon_n = 0 then 'PASS' else 'FAIL' end from s
  union all select 10, '要勾的數字 17 個（跟前端 slides.js 的 FACTS 同一份）', '17', facts::text, case when facts = 17 then 'PASS' else 'FAIL' end from s
  union all select 11, 'Instagram 那一頁也認核可工作區', 'true', ig_ok::text, case when ig_ok then 'PASS' else 'FAIL' end from s
  union all select 12, '私人 bucket marketing-media（本機沒有 storage 印 SKIP）', 'true', coalesce(bucket_ok::text, 'SKIP'), case when bucket_ok is null then 'SKIP' when bucket_ok then 'PASS' else 'FAIL' end from s
) t order by ord;
