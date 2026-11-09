-- 2026-12-04：出席預設「到了」（Paul 2026-11-08：「most of the student did come to events so put them as attended」）。
--   1. rc_set_participation：手動加的人沒說狀態就是 attended（原本 registered）。
--   2. rc_sync_event：從報名表抄的時候，錄取的人在活動結束之後算 attended；還沒辦的活動照樣是 registered，被拒的照樣 cancelled。
--   3. rc_attendance_default(p_do)：一次性的函式，只有 Co-President。p_do = false 只數「已經結束的活動裡還是 registered 的」有幾列、在哪幾場；
--      p_do = true 才把那些列改成 attended（no-show、cancelled 不動），rc_log 記一筆。之後個別的 no-show 在那場活動的頁面改狀態就好。
-- 可以重跑。最後印一張驗收表，底下接著列每一場會改幾列（只有場名與數字，沒有名字）。
begin;

create or replace function public.rc_set_participation(p_event uuid, p jsonb)
returns uuid language plpgsql security definer
set search_path = public, pg_temp
as $$
-- 2026-12-04：手動加的人沒說狀態就是 attended（原本 registered）。
declare v_person uuid; v_role text := coalesce(nullif(p->>'role', ''), 'student'); v_status text := coalesce(nullif(p->>'status', ''), 'attended'); v_sess uuid; v_id uuid;
begin
  if not public.rc_event_editor(p_event) then raise exception 'not_event_editor' using errcode = 'P0001'; end if;
  if v_role not in ('student', 'mentee', 'mentor', 'speaker', 'organizer', 'volunteer', 'alumni') then raise exception 'bad_role' using errcode = 'P0001'; end if;
  if v_status not in ('registered', 'attended', 'no-show', 'cancelled') then raise exception 'bad_status' using errcode = 'P0001'; end if;
  v_person := nullif(p->>'person_id', '')::uuid;
  if v_person is null then
    v_person := public.rc_upsert_person(p->>'email', p->>'name_zh', p->>'name_en', case when v_role in ('mentor', 'speaker', 'organizer', 'volunteer', 'alumni') then 'guest' else 'student' end,
                                        nullif(p->>'school', ''), nullif(p->>'grad_year', '')::int, 'event:' || p_event::text);
  elsif not exists (select 1 from public.people where id = v_person) then raise exception 'no_such_person' using errcode = 'P0001';
  end if;
  v_sess := nullif(p->>'session_id', '')::uuid;
  if v_sess is not null and not exists (select 1 from public.rc_sessions where id = v_sess and event_id = p_event) then raise exception 'no_such_session' using errcode = 'P0001'; end if;
  insert into public.rc_participation (person_id, event_id, session_id, role, status, source, note, recorded_by)
  values (v_person, p_event, v_sess, v_role, v_status, coalesce(nullif(p->>'source', ''), 'manual'), coalesce(p->>'note', ''), auth.uid())
  on conflict (person_id, event_id, role, (coalesce(session_id, '00000000-0000-0000-0000-000000000000'::uuid)))
  do update set status = excluded.status, note = case when excluded.note <> '' then excluded.note else rc_participation.note end, recorded_by = auth.uid(), recorded_at = now()
  returning id into v_id;
  return v_id;
end $$;


create or replace function public.rc_sync_event(p_event uuid)
returns int language plpgsql security definer
set search_path = public, pg_temp
as $$
declare r record; v_person uuid; n int := 0; v_form uuid; v_ended boolean;
begin
  if not public.rc_event_viewer(p_event) then raise exception 'not_event_viewer' using errcode = 'P0001'; end if;
  select form_id, coalesce(ends_at, starts_at) < now() into v_form, v_ended from public.events where id = p_event;
  if v_form is null then return 0; end if;
  for r in select a.id, a.user_id, a.applicant_name, a.applicant_email, a.applicant_school, a.applicant_grade, a.status, a.checked_in_at
             from public.applications a where a.form_id = v_form loop
    v_person := (select id from public.people where profile_id = r.user_id limit 1);
    if v_person is null then
      v_person := public.rc_upsert_person(r.applicant_email, r.applicant_name, null, 'student', nullif(r.applicant_school, ''), null, 'application');
      if not exists (select 1 from public.people where id = v_person and profile_id is not null) then
        update public.people set profile_id = r.user_id where id = v_person and profile_id is null
           and not exists (select 1 from public.people o where o.profile_id = r.user_id);
      end if;
      insert into public.rc_identities (person_id, kind, value, source, verified)
      select v_person, 'email', lower(u.email), 'login', true from auth.users u where u.id = r.user_id and u.email is not null on conflict do nothing;
    end if;
    insert into public.rc_participation (person_id, event_id, role, status, source, application_id, recorded_by)
    values (v_person, p_event, 'student',
            -- 2026-12-04（Paul：most of the students did come）：錄取的人，活動結束之後就當到了；還沒辦的活動仍然是報名。
            case when r.checked_in_at is not null then 'attended'
                 when r.status = 'rejected' then 'cancelled'
                 when r.status = 'accepted' and v_ended then 'attended'
                 else 'registered' end,
            'site', r.id, auth.uid())
    on conflict (person_id, event_id, role, (coalesce(session_id, '00000000-0000-0000-0000-000000000000'::uuid)))
    do update set status = case when rc_participation.source = 'site' then excluded.status else rc_participation.status end, application_id = excluded.application_id;
    n := n + 1;
  end loop;
  return n;
end $$;


-- ---------- 3. 已經結束的活動：還是 registered 的改成 attended ----------
create or replace function public.rc_attendance_default(p_do boolean)
returns jsonb language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_rows jsonb; v_n int;
begin
  perform public.require_president();
  select coalesce(jsonb_agg(jsonb_build_object('event_id', e.id, 'slug', e.slug, 'title', coalesce(e.title_en, e.title_zh, e.slug), 'ends_at', coalesce(e.ends_at, e.starts_at), 'n', c.n) order by coalesce(e.ends_at, e.starts_at) desc), '[]'::jsonb), coalesce(sum(c.n), 0)
    into v_rows, v_n
    from public.events e join (select event_id, count(*) as n from public.rc_participation where status = 'registered' group by event_id) c on c.event_id = e.id
   where coalesce(e.ends_at, e.starts_at) < now();
  if p_do and v_n > 0 then
    update public.rc_participation x set status = 'attended'
      from public.events e where e.id = x.event_id and x.status = 'registered' and coalesce(e.ends_at, e.starts_at) < now();
    perform public.rc_log_it('attendance_default', null, null, to_jsonb(v_n));
  end if;
  return jsonb_build_object('rows', v_rows, 'n', v_n, 'done', p_do and v_n > 0);
end $$;
revoke all on function public.rc_attendance_default(boolean) from public, anon;
grant execute on function public.rc_attendance_default(boolean) to authenticated;

commit;

-- ---------- 驗收，底下接著「會改幾列」的預覽（只數，不改） ----------
select * from (
  with t as (
    select (select regexp_replace(prosrc, '--[^\n]*', '', 'g') like '%''attended'');%' from pg_proc where proname = 'rc_set_participation' and pronamespace = 'public'::regnamespace) as default_attended,
           (select regexp_replace(prosrc, '--[^\n]*', '', 'g') like '%v_ended then ''attended''%' from pg_proc where proname = 'rc_sync_event' and pronamespace = 'public'::regnamespace) as sync_rule,
           (select regexp_replace(prosrc, '--[^\n]*', '', 'g') like '%require_president()%' and regexp_replace(prosrc, '--[^\n]*', '', 'g') like '%status = ''registered''%' from pg_proc where proname = 'rc_attendance_default' and pronamespace = 'public'::regnamespace) as flip_rule,
           (select not has_function_privilege('anon', p.oid, 'execute') and has_function_privilege('authenticated', p.oid, 'execute') from pg_proc p where p.proname = 'rc_attendance_default' and p.pronamespace = 'public'::regnamespace) as grants_ok,
           (select regexp_replace(prosrc, '--[^\n]*', '', 'g') like '%not public.rc_event_editor(%' from pg_proc where proname = 'rc_set_participation' and pronamespace = 'public'::regnamespace) as editor_gate
  ), preview as (
    select x->>'title' as title, (x->>'n')::int as n from jsonb_array_elements((select coalesce((select jsonb_agg(jsonb_build_object('title', coalesce(e.title_en, e.title_zh, e.slug), 'n', c.n) order by coalesce(e.ends_at, e.starts_at) desc)
      from public.events e join (select event_id, count(*) as n from public.rc_participation where status = 'registered' group by event_id) c on c.event_id = e.id
     where coalesce(e.ends_at, e.starts_at) < now()), '[]'::jsonb))) x
  )
  select 0 ord, 'OVERALL' as 項目, null::text as 應該是, null::text as 實際是,
    case when default_attended and sync_rule and flip_rule and grants_ok and editor_gate then 'PASS' else 'FAIL' end as 結果 from t
  union all select 1, '★ 手動加的人預設 attended', 'true', default_attended::text, case when default_attended then 'PASS' else 'FAIL' end from t
  union all select 2, '★ 從報名表抄：錄取的人活動結束後算 attended', 'true', sync_rule::text, case when sync_rule then 'PASS' else 'FAIL' end from t
  union all select 3, '★ 一次性改狀態只有 Co-President、只動 registered', 'true', flip_rule::text, case when flip_rule then 'PASS' else 'FAIL' end from t
  union all select 4, '登入的人叫得到、anon 不行', 'true', grants_ok::text, case when grants_ok then 'PASS' else 'FAIL' end from t
  union all select 5, 'rc_set_participation 仍然先問 rc_event_editor', 'true', editor_gate::text, case when editor_gate then 'PASS' else 'FAIL' end from t
  union all select 10, '── 跑 flip-attendance.sql 會改的（還沒改）：總共 ──', '', (select coalesce(sum(n), 0)::text from preview), '預覽' from t
  union all select 11 + row_number() over (order by n desc), '  ' || title, '', n::text, '預覽' from preview
) x order by ord;
