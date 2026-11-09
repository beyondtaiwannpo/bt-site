-- 2026-12-05：「可能重複」那頁看得出該留哪一個（Paul 2026-11-08：「look first doesn't really help, you just give me one profile to look,
-- how am I supposed to know which to merge to」）。
--   1. rc_duplicates() 每一組多帶兩邊的摘要：有沒有帳號、學校、畢業年、幾場活動（最近五場的名字與年份）、幾組配對、幾筆去向、幾個 email、
--      建立日期，再加一個 suggest（建議留哪一邊：有帳號 > 出席多 > 資料多 > 先建的）。畫面兩欄並排，不一樣的格子標出來。
--   2. 「不是同一個人」：rc_not_same 表記下來，之後 rc_duplicates 不再提示那一組。管的人才記得了。
--   3. 有帳號的幹部、校友、實習生一定在名單上：2026-10-24 那一支只搬了當時的幹部，之後新登入的沒有 people 那一列，
--      名錄上找不到自己、也沒辦法把自己加進某場活動當講者（Paul 2026-11-08 撞到的）。補一支 trigger 加一次回填。
-- 可以重跑。最後印一張驗收表。
begin;

create table if not exists public.rc_not_same (
  a   uuid not null references public.people(id) on delete cascade,
  b   uuid not null references public.people(id) on delete cascade,
  by  uuid references public.profiles(id) on delete set null,
  at  timestamptz not null default now(),
  primary key (a, b),
  check (a < b)
);
comment on table public.rc_not_same is '管的人看過、說「不是同一個人」的兩列。rc_duplicates 不再提示。a < b。';
alter table public.rc_not_same enable row level security;
revoke all on public.rc_not_same from public, anon, authenticated;

create or replace function public.rc_mark_not_same(p_a uuid, p_b uuid)
returns boolean language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if not public.rc_can_manage() then raise exception 'not_records_manager' using errcode = 'P0001'; end if;
  if p_a = p_b then raise exception 'same_person' using errcode = 'P0001'; end if;
  insert into public.rc_not_same (a, b, by) values (least(p_a, p_b), greatest(p_a, p_b), auth.uid()) on conflict do nothing;
  perform public.rc_log_it('person_not_same', least(p_a, p_b), to_jsonb(greatest(p_a, p_b)), null);
  return true;
end $$;
revoke all on function public.rc_mark_not_same(uuid, uuid) from public, anon;
grant execute on function public.rc_mark_not_same(uuid, uuid) to authenticated;

-- 一邊的摘要（內部用）。沒有 email 的值，只有幾個。
create or replace function public.rc_dup_side(p_person uuid)
returns jsonb language sql stable security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'id', pe.id, 'name', public.rc_person_name(pe.id), 'name_zh', coalesce(pr.name_zh, pe.name_zh), 'name_en', coalesce(pr.name_en, pe.name_en),
    'kind', pe.kind, 'school', pe.school, 'grad_year', pe.grad_year, 'has_account', pe.profile_id is not null, 'role', pr.role, 'team', pr.team,
    'created_at', pe.created_at,
    'n_events', (select count(*) from public.rc_participation x where x.person_id = pe.id),
    'events', coalesce((select jsonb_agg(jsonb_build_object('title', coalesce(e.title_en, e.title_zh, e.slug), 'year', extract(year from e.starts_at)::int, 'role', x.role, 'status', x.status) order by e.starts_at desc nulls last)
                       from (select * from public.rc_participation x where x.person_id = pe.id order by recorded_at desc limit 5) x join public.events e on e.id = x.event_id), '[]'::jsonb),
    'n_pairs', (select count(*) from public.rc_pairs r where r.mentor_id = pe.id or r.mentee_id = pe.id),
    'n_outcomes', (select count(*) from public.rc_outcomes o where o.person_id = pe.id),
    'n_emails', (select count(*) from public.rc_identities i where i.person_id = pe.id and i.kind = 'email'),
    'n_answers', (select count(*) from public.rc_responses r where r.person_id = pe.id),
    'score', (pe.profile_id is not null)::int * 1000 + (select count(*) from public.rc_participation x where x.person_id = pe.id) * 10
             + (pe.name_zh is not null)::int + (pe.name_en is not null)::int + (pe.school is not null)::int + (pe.grad_year is not null)::int
             + (select count(*) from public.rc_identities i where i.person_id = pe.id))
    from public.people pe left join public.profiles pr on pr.id = pe.profile_id where pe.id = p_person;
$$;
revoke all on function public.rc_dup_side(uuid) from public, anon, authenticated;

create or replace function public.rc_duplicates()
returns jsonb language sql stable security definer
set search_path = public, pg_temp
as $$
  select case when public.rc_can_manage() then coalesce((
    select jsonb_agg(jsonb_build_object('a', a.id, 'a_name', public.rc_person_name(a.id), 'a_kind', a.kind, 'a_school', a.school,
                                        'b', b.id, 'b_name', public.rc_person_name(b.id), 'b_kind', b.kind, 'b_school', b.school,
                                        'why', case when a.name_en is not null and lower(regexp_replace(a.name_en, '\s+', '', 'g')) = lower(regexp_replace(coalesce(b.name_en, ''), '\s+', '', 'g')) then 'name_en' else 'name_zh' end,
                                        'same_school', a.school is not null and b.school is not null and lower(trim(a.school)) = lower(trim(b.school)),
                                        'left', public.rc_dup_side(a.id), 'right', public.rc_dup_side(b.id),
                                        'suggest', case when (public.rc_dup_side(a.id)->>'score')::int >= (public.rc_dup_side(b.id)->>'score')::int then 'a' else 'b' end)
                     order by public.rc_person_name(a.id))
      from public.people a join public.people b on b.id > a.id
     where a.forgotten_at is null and b.forgotten_at is null
       and not exists (select 1 from public.rc_not_same n where n.a = a.id and n.b = b.id)
       and ((a.name_en is not null and lower(regexp_replace(a.name_en, '\s+', '', 'g')) = lower(regexp_replace(coalesce(b.name_en, ''), '\s+', '', 'g')))
         or (a.name_zh is not null and regexp_replace(a.name_zh, '\s+', '', 'g') = regexp_replace(coalesce(b.name_zh, ''), '\s+', '', 'g')))), '[]'::jsonb)
  else '[]'::jsonb end;
$$;

-- ---------- 3. 有帳號的成員一定在名單上 ----------
create or replace function public.rc_ensure_person(p_profile uuid)
returns uuid language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v uuid; pr public.profiles%rowtype; v_email text;
begin
  select * into pr from public.profiles where id = p_profile; if not found then return null; end if;
  select id into v from public.people where profile_id = p_profile;
  if v is null then
    select lower(email) into v_email from auth.users where id = p_profile;
    -- 同一個 email 已經在名單上（例如先當過學員）：接上那一列，不另開一列。
    if v_email is not null then select person_id into v from public.rc_identities where kind = 'email' and lower(value) = v_email limit 1; end if;
    if v is not null then
      update public.people set profile_id = p_profile, kind = case when pr.role in ('cadre', 'alumni', 'intern') then 'member' else kind end where id = v and profile_id is null;
    else
      insert into public.people (name_zh, name_en, kind, profile_id)
      values (nullif(pr.name_zh, ''), nullif(pr.name_en, ''), case when pr.role in ('cadre', 'alumni', 'intern') then 'member' else 'student' end, p_profile)
      returning id into v;
    end if;
    if v_email is not null then
      insert into public.rc_identities (person_id, kind, value, source, verified) values (v, 'email', v_email, 'login', true) on conflict do nothing;
    end if;
  end if;
  return v;
end $$;
revoke all on function public.rc_ensure_person(uuid) from public, anon, authenticated;

create or replace function public.rc_profile_to_people()
returns trigger language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if new.role in ('cadre', 'alumni', 'intern') then perform public.rc_ensure_person(new.id); end if;
  return new;
end $$;
drop trigger if exists rc_profile_to_people on public.profiles;
create trigger rc_profile_to_people after insert or update of role on public.profiles for each row execute function public.rc_profile_to_people();

-- 回填：現在就有帳號、還不在名單上的幹部、校友、實習生。
do $$ declare r record; begin
  for r in select p.id from public.profiles p where p.role in ('cadre', 'alumni', 'intern') and not exists (select 1 from public.people pe where pe.profile_id = p.id) loop
    perform public.rc_ensure_person(r.id);
  end loop;
end $$;

commit;

-- ---------- 驗收 ----------
select * from (
  with t as (
    select exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'rc_not_same') as tbl,
           (select rowsecurity from pg_tables where schemaname = 'public' and tablename = 'rc_not_same') as rls,
           (select bool_and(not has_table_privilege(r, 'public.rc_not_same', pr)) from unnest(array['anon', 'authenticated']) r, unnest(array['select', 'insert', 'update', 'delete']) pr) as no_priv,
           (select regexp_replace(prosrc, '--[^\n]*', '', 'g') like '%rc_not_same%' and regexp_replace(prosrc, '--[^\n]*', '', 'g') like '%suggest%' from pg_proc where proname = 'rc_duplicates' and pronamespace = 'public'::regnamespace) as dup_rule,
           (select regexp_replace(prosrc, '--[^\n]*', '', 'g') like '%not public.rc_can_manage()%' from pg_proc where proname = 'rc_mark_not_same' and pronamespace = 'public'::regnamespace) as mark_gate,
           (select regexp_replace(prosrc, '--[^\n]*', '', 'g') not like '%i.value%' from pg_proc where proname = 'rc_dup_side' and pronamespace = 'public'::regnamespace) as no_email,
           (select not has_function_privilege('anon', p.oid, 'execute') and not has_function_privilege('authenticated', p.oid, 'execute') from pg_proc p where p.proname = 'rc_dup_side' and p.pronamespace = 'public'::regnamespace) as side_private,
           exists (select 1 from pg_trigger where tgname = 'rc_profile_to_people' and not tgisinternal) as trg,
           (select count(*) from public.profiles p where p.role in ('cadre', 'alumni', 'intern') and not exists (select 1 from public.people pe where pe.profile_id = p.id)) as missing
  )
  select 0 ord, 'OVERALL' as 項目, null::text as 應該是, null::text as 實際是,
    case when tbl and rls and no_priv and dup_rule and mark_gate and no_email and side_private and trg and missing = 0 then 'PASS' else 'FAIL' end as 結果 from t
  union all select 1, '★ rc_not_same 表在、開 RLS、沒有人直接碰得到', 'true', (tbl and rls and no_priv)::text, case when tbl and rls and no_priv then 'PASS' else 'FAIL' end from t
  union all select 2, '★ rc_duplicates 跳過說過「不是同一個人」的、帶建議', 'true', dup_rule::text, case when dup_rule then 'PASS' else 'FAIL' end from t
  union all select 3, '★ 記「不是同一個人」先問 rc_can_manage', 'true', mark_gate::text, case when mark_gate then 'PASS' else 'FAIL' end from t
  union all select 4, '摘要裡沒有 email 的值', 'true', no_email::text, case when no_email then 'PASS' else 'FAIL' end from t
  union all select 5, '摘要那支沒有人直接叫得到', 'true', side_private::text, case when side_private then 'PASS' else 'FAIL' end from t
  union all select 6, '★ 新登入的幹部、校友、實習生自動進名單（trigger）', 'true', trg::text, case when trg then 'PASS' else 'FAIL' end from t
  union all select 7, '★ 有帳號卻不在名單上的成員', '0', missing::text, case when missing = 0 then 'PASS' else 'FAIL' end from t
) x order by ord;
