-- 活動上架　2026-11-01（批 1：資料庫）
--
-- 用法：整份貼進 Supabase SQL Editor 按一次 Run。可以重跑。最後印一張 PASS / FAIL 表。
-- **要先跑過 2026-10-31-marketing-requests.sql**（順序照日期）。
--
-- Paul 2026-10-24：「所有活動都要上線，各 team 自己設計自己的活動，而且要出現在對外首頁。」設計在 docs/2026-10-24-活動上架.md。
-- 五題 Paul 都照建議：兩道鑰匙上對外頁、首頁多一段近期活動、過去的留 12 個月、報名要登入、額滿硬關。
--
-- ============================================================================
-- 這一支在做什麼
-- ============================================================================
--   1. 一張表 events：一場活動 = 那個 team 底下一個工作區（custom:event-<代號>）加一份報名表（forms，可以沒有）。
--      狀態 draft → ready（「管」的人按準備好了）→ published（Co-President 或 Senior Adviser 放上對外頁）；archived 是撤下來。
--      「過去了」不存，用 ends_at < now() 算。
--   2. 五支函式：create_event()（team 的 Director 或 senior；建工作區、建表單、建活動）、save_event()（「改」以上改內容）、
--      set_event_ready()（「管」以上；封面有填就要勾同意）、publish_event() / unpublish_event()（senior）。
--   3. 對外：public_events()、public_event(slug)，anon 叫得到，**只回 published 的、只回對外要印的欄位**；表本身不開給 anon。
--   4. 額滿硬關：submit_application() 多一道門，報名表綁著活動、活動有名額、沒被拒的申請數到了名額就擋（full）。
--   5. RLS：工作區「看」以上讀自己那場（senior 全部）；沒有寫的政策，一律走函式。
-- ============================================================================

begin;

-- ---------- 1. 表 ----------
create table if not exists public.events (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique check (slug ~ '^[a-z0-9-]{2,40}$'),
  team          text not null,
  workspace_id  text not null references public.workspaces(id),
  form_id       uuid references public.forms(id) on delete set null,
  title_zh      text not null default '',
  title_en      text not null default '',
  summary_zh    text not null default '',
  summary_en    text not null default '',
  body_zh       text not null default '',
  body_en       text not null default '',
  cover_url     text,
  cover_consent boolean not null default false,
  starts_at     timestamptz,
  ends_at       timestamptz,
  place         text not null default '',
  capacity      int not null default 0 check (capacity >= 0),
  status        text not null default 'draft' check (status in ('draft', 'ready', 'published', 'archived')),
  published_by  uuid references public.profiles(id) on delete set null,
  published_at  timestamptz,
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists events_status_starts on public.events (status, starts_at);
alter table public.events enable row level security;
revoke all on public.events from anon, authenticated;
grant select on public.events to authenticated;

-- ---------- 2. 函式 ----------
-- 開一場活動。誰：那個 team 的資源工作區「管」的人（team 的 Director）或 senior。
-- 做三件事：工作區 custom:event-<代號>（team 欄填那個 team、擁有人是開的人、開的人是「管」）、報名表（p_with_form）、活動一列。
create or replace function public.create_event(
  p_team text, p_slug text, p_title_zh text, p_title_en text, p_with_form boolean default true)
returns uuid language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_ws text; v_form uuid; v_id uuid; v_uid uuid := auth.uid();
begin
  if not public.is_cadre() then raise exception 'not_cadre' using errcode = 'P0001'; end if;
  if not (public.is_senior() or public.can_manage('res:' || coalesce(p_team, ''))) then
    raise exception 'not_team_manager' using errcode = 'P0001';
  end if;
  if coalesce(p_slug, '') !~ '^[a-z0-9-]{2,40}$' then raise exception 'bad_slug' using errcode = 'P0001'; end if;
  if coalesce(btrim(p_title_zh), '') = '' and coalesce(btrim(p_title_en), '') = '' then raise exception 'empty_title' using errcode = 'P0001'; end if;
  if exists (select 1 from events where slug = p_slug) then raise exception 'slug_taken' using errcode = 'P0001'; end if;
  v_ws := 'custom:event-' || p_slug;
  insert into workspaces (id, kind, team, title_zh, title_en, owner)
  values (v_ws, 'custom', p_team, nullif(btrim(p_title_zh), ''), nullif(btrim(p_title_en), ''), v_uid)
  on conflict (id) do update set team = excluded.team, title_zh = excluded.title_zh, title_en = excluded.title_en, owner = excluded.owner, active = true;
  insert into assignments (user_id, workspace_id, level, granted_by) values (v_uid, v_ws, 'manage', v_uid)
  on conflict (user_id, workspace_id) do update set level = 'manage';
  if p_with_form then
    insert into forms (team, kind, title, status, created_by)
    values (p_team, 'program', coalesce(nullif(btrim(p_title_zh), ''), btrim(p_title_en)), 'draft', v_uid)
    returning id into v_form;
  end if;
  insert into events (slug, team, workspace_id, form_id, title_zh, title_en, created_by)
  values (p_slug, p_team, v_ws, v_form, coalesce(btrim(p_title_zh), ''), coalesce(btrim(p_title_en), ''), v_uid)
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.create_event(text, text, text, text, boolean) from public, anon;
grant execute on function public.create_event(text, text, text, text, boolean) to authenticated;

-- 改內容。誰：這場活動工作區「改」以上。p_patch 只收下面這幾個鍵，別的忽略。已經 published 的改了照樣是 published（文案修錯字不用重新放）。
create or replace function public.save_event(p_id uuid, p_patch jsonb)
returns uuid language plpgsql security definer
set search_path = public, pg_temp
as $$
declare e record; v_cover text;
begin
  select * into e from events where id = p_id;
  if e.id is null then raise exception 'no_such_event' using errcode = 'P0001'; end if;
  if not public.can_edit(e.workspace_id) then raise exception 'not_allowed' using errcode = 'P0001'; end if;
  v_cover := nullif(btrim(coalesce(p_patch->>'cover_url', e.cover_url, '')), '');
  if v_cover is not null and v_cover !~ '^https://' then raise exception 'cover_not_https' using errcode = 'P0001'; end if;
  update events set
    title_zh   = coalesce(p_patch->>'title_zh', title_zh),
    title_en   = coalesce(p_patch->>'title_en', title_en),
    summary_zh = coalesce(p_patch->>'summary_zh', summary_zh),
    summary_en = coalesce(p_patch->>'summary_en', summary_en),
    body_zh    = coalesce(p_patch->>'body_zh', body_zh),
    body_en    = coalesce(p_patch->>'body_en', body_en),
    cover_url  = case when p_patch ? 'cover_url' then v_cover else cover_url end,
    -- 換了封面就要重新勾同意（同意是對那一張照片的）。
    cover_consent = case when p_patch ? 'cover_url' and v_cover is distinct from cover_url then false
                         when p_patch ? 'cover_consent' then (p_patch->>'cover_consent')::boolean else cover_consent end,
    starts_at  = case when p_patch ? 'starts_at' then nullif(p_patch->>'starts_at', '')::timestamptz else starts_at end,
    ends_at    = case when p_patch ? 'ends_at' then nullif(p_patch->>'ends_at', '')::timestamptz else ends_at end,
    place      = coalesce(p_patch->>'place', place),
    capacity   = coalesce((p_patch->>'capacity')::int, capacity),
    updated_at = now()
  where id = p_id;
  return p_id;
end $$;
revoke all on function public.save_event(uuid, jsonb) from public, anon;
grant execute on function public.save_event(uuid, jsonb) to authenticated;

-- 準備好了 / 收回草稿。誰：工作區「管」以上。要有中英標題、開始時間；封面有填就要勾同意。
create or replace function public.set_event_ready(p_id uuid, p_ready boolean)
returns text language plpgsql security definer
set search_path = public, pg_temp
as $$
declare e record;
begin
  select * into e from events where id = p_id;
  if e.id is null then raise exception 'no_such_event' using errcode = 'P0001'; end if;
  if not public.can_manage(e.workspace_id) then raise exception 'not_allowed' using errcode = 'P0001'; end if;
  if p_ready then
    if e.status not in ('draft', 'ready') then raise exception 'already_published' using errcode = 'P0001'; end if;
    if coalesce(btrim(e.title_zh), '') = '' or coalesce(btrim(e.title_en), '') = '' then raise exception 'need_both_titles' using errcode = 'P0001'; end if;
    if e.starts_at is null then raise exception 'need_start' using errcode = 'P0001'; end if;
    if e.cover_url is not null and not e.cover_consent then raise exception 'consent_required' using errcode = 'P0001'; end if;
    update events set status = 'ready', updated_at = now() where id = p_id;
    return 'ready';
  else
    if e.status <> 'ready' then raise exception 'not_ready' using errcode = 'P0001'; end if;
    update events set status = 'draft', updated_at = now() where id = p_id;
    return 'draft';
  end if;
end $$;
revoke all on function public.set_event_ready(uuid, boolean) from public, anon;
grant execute on function public.set_event_ready(uuid, boolean) to authenticated;

-- 放上對外頁 / 撤下來。誰：Co-President 或 Senior Adviser（第二道鑰匙）。只有 ready 的放得上去。
create or replace function public.publish_event(p_id uuid)
returns text language plpgsql security definer
set search_path = public, pg_temp
as $$
declare e record;
begin
  perform public.require_senior();
  select * into e from events where id = p_id;
  if e.id is null then raise exception 'no_such_event' using errcode = 'P0001'; end if;
  if e.status <> 'ready' then raise exception 'not_ready' using errcode = 'P0001'; end if;
  if e.cover_url is not null and not e.cover_consent then raise exception 'consent_required' using errcode = 'P0001'; end if;
  update events set status = 'published', published_by = auth.uid(), published_at = now(), updated_at = now() where id = p_id;
  return 'published';
end $$;
create or replace function public.unpublish_event(p_id uuid)
returns text language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  perform public.require_senior();
  update events set status = 'archived', updated_at = now() where id = p_id and status = 'published';
  if not found then raise exception 'not_published' using errcode = 'P0001'; end if;
  return 'archived';
end $$;
revoke all on function public.publish_event(uuid), public.unpublish_event(uuid) from public, anon;
grant execute on function public.publish_event(uuid), public.unpublish_event(uuid) to authenticated;

-- ---------- 3. 對外 ----------
-- 只回 published 的、只回對外要印的欄位。報名的狀況也在這裡算（表單開不開、幾個人報了、滿了沒），對外頁不用再查別的表。
create or replace function public.public_events()
returns table (
  slug text, team text, title_zh text, title_en text, summary_zh text, summary_en text, body_zh text, body_en text,
  cover_url text, starts_at timestamptz, ends_at timestamptz, place text, capacity int,
  form_id uuid, signup_open boolean, signup_opens_at timestamptz, signup_closes_at timestamptz, signed_up int, is_full boolean, is_past boolean)
language sql stable security definer
set search_path = public, pg_temp
as $$
  select e.slug, e.team, e.title_zh, e.title_en, e.summary_zh, e.summary_en, e.body_zh, e.body_en,
         e.cover_url, e.starts_at, e.ends_at, e.place, e.capacity,
         e.form_id,
         (f.id is not null and f.status = 'open' and (f.opens_at is null or now() >= f.opens_at) and (f.closes_at is null or now() <= f.closes_at)) as signup_open,
         f.opens_at, f.closes_at,
         coalesce((select count(*)::int from applications a where a.form_id = f.id and a.status <> 'rejected'), 0) as signed_up,
         (e.capacity > 0 and coalesce((select count(*) from applications a where a.form_id = f.id and a.status <> 'rejected'), 0) >= e.capacity) as is_full,
         (coalesce(e.ends_at, e.starts_at) < now()) as is_past
    from events e left join forms f on f.id = e.form_id
   where e.status = 'published'
   order by e.starts_at
$$;
create or replace function public.public_event(p_slug text)
returns table (
  slug text, team text, title_zh text, title_en text, summary_zh text, summary_en text, body_zh text, body_en text,
  cover_url text, starts_at timestamptz, ends_at timestamptz, place text, capacity int,
  form_id uuid, signup_open boolean, signup_opens_at timestamptz, signup_closes_at timestamptz, signed_up int, is_full boolean, is_past boolean)
language sql stable security definer
set search_path = public, pg_temp
as $$ select * from public.public_events() where slug = p_slug $$;
revoke all on function public.public_events(), public.public_event(text) from public;
grant execute on function public.public_events(), public.public_event(text) to anon, authenticated;

-- ---------- 4. 額滿硬關 ----------
create or replace function public.event_is_full(p_form_id uuid)
returns boolean language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from events e where e.form_id = p_form_id and e.capacity > 0
                   and (select count(*) from applications a where a.form_id = p_form_id and a.status <> 'rejected') >= e.capacity)
$$;
revoke all on function public.event_is_full(uuid) from public, anon;
grant execute on function public.event_is_full(uuid) to authenticated;

-- submit_application 整支重建（2026-09-09 那一版加一道門）。唯一的差別是「額滿」那一段，其他一字不改。
create or replace function public.submit_application(
  p_form_id uuid, p_answers jsonb, p_guardian_email text default null)
returns uuid language plpgsql security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_uid   uuid := auth.uid();
  v_form  public.forms%rowtype;
  v_app   uuid;
  v_name  text; v_school text; v_grade text; v_email text;
  v_missing text;
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = 'P0001'; end if;
  select * into v_form from public.forms where id = p_form_id;
  if not found then raise exception 'no_such_form' using errcode = 'P0001'; end if;
  if v_form.status <> 'open'
     or (v_form.opens_at  is not null and now() < v_form.opens_at)
     or (v_form.closes_at is not null and now() > v_form.closes_at)
  then raise exception 'form_closed' using errcode = 'P0001'; end if;
  -- 2026-11-01 額滿硬關：報名表綁著活動、活動有名額、沒被拒的申請數到了就擋。已經報過的人走到底下 unique_violation 那條回原本那一筆。
  if public.event_is_full(p_form_id) and not exists (select 1 from public.applications where form_id = p_form_id and user_id = v_uid) then
    raise exception 'full' using errcode = 'P0001';
  end if;
  select coalesce(name_zh, name_en, ''), school, grade into v_name, v_school, v_grade from public.profiles where id = v_uid;
  if coalesce(v_name, '') = '' then raise exception 'profile_incomplete' using errcode = 'P0001'; end if;
  select email into v_email from auth.users where id = v_uid;
  select string_agg(q.label, '、' order by q.ord) into v_missing
    from public.form_questions q
   where q.form_id = p_form_id and q.required
     and coalesce(btrim((
       select a->>'v' from jsonb_array_elements(coalesce(p_answers, '[]'::jsonb)) a
        where a->>'q' = q.id::text limit 1)), '') = '';
  if v_missing is not null then raise exception 'missing:%', v_missing using errcode = 'P0001'; end if;
  insert into public.applications
    (form_id, user_id, applicant_name, applicant_school, applicant_grade, applicant_email, guardian_email)
  values (p_form_id, v_uid, v_name, v_school, v_grade, v_email, nullif(btrim(coalesce(p_guardian_email, '')), ''))
  returning id into v_app;
  insert into public.application_answers (application_id, question_id, value)
  select v_app, q.id,
         coalesce((select a->>'v' from jsonb_array_elements(coalesce(p_answers, '[]'::jsonb)) a
                    where a->>'q' = q.id::text limit 1), '')
    from public.form_questions q
   where q.form_id = p_form_id;
  return v_app;
exception
  when unique_violation then
    select id into v_app from public.applications where form_id = p_form_id and user_id = v_uid;
    return v_app;
end $$;
revoke all on function public.submit_application(uuid, jsonb, text) from public, anon;
grant execute on function public.submit_application(uuid, jsonb, text) to authenticated;

-- ---------- 5. RLS ----------
drop policy if exists events_read on public.events;
create policy events_read on public.events for select to authenticated
  using (public.can_view(workspace_id));

commit;

-- ---------- 驗收 ----------
select * from (
  with t as (
    select to_regclass('public.events') is not null as has_table,
           (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'
              and p.proname in ('create_event', 'save_event', 'set_event_ready', 'publish_event', 'unpublish_event', 'public_events', 'public_event', 'event_is_full')) as fns,
           (select count(*) from pg_policies where schemaname = 'public' and tablename = 'events') as pols,
           (select regexp_replace(prosrc, '--[^\n]*', '', 'g') like '%event_is_full%' from pg_proc where proname = 'submit_application') as gated,
           has_function_privilege('anon', 'public.public_events()', 'execute') as anon_ok,
           not has_table_privilege('anon', 'public.events', 'select') as anon_no_table
  )
  select 0 ord, 'OVERALL' as 項目, null::text as 應該是, null::text as 實際是,
    case when has_table and fns = 8 and pols = 1 and gated and anon_ok and anon_no_table then 'PASS' else 'FAIL' end as 結果 from t
  union all select 1, '★ events 表在', 'true', has_table::text, case when has_table then 'PASS' else 'FAIL' end from t
  union all select 2, '★ 八支函式在', '8', fns::text, case when fns = 8 then 'PASS' else 'FAIL' end from t
  union all select 3, '★ events 一條讀的政策、沒有寫的', '1', pols::text, case when pols = 1 then 'PASS' else 'FAIL' end from t
  union all select 4, '★ submit_application 有額滿那一道門', 'true', gated::text, case when gated then 'PASS' else 'FAIL' end from t
  union all select 5, '★ anon 叫得到 public_events()', 'true', anon_ok::text, case when anon_ok then 'PASS' else 'FAIL' end from t
  union all select 6, '★ anon 讀不到 events 表本身', 'true', anon_no_table::text, case when anon_no_table then 'PASS' else 'FAIL' end from t
) x order by ord;
