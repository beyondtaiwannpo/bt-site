-- 2026-12-07：登入的人自己看得到「我帶的 mentee」與「我的 mentor」，以及「我該填的活動回饋」（2026-11-09 走一遍 mentor 與 mentee 的流程撞到的：
-- 配對只在紀錄後台，管的人才進得去；mentor 在網站上沒有任何一頁看得到自己帶的是誰，mentee 也一樣）。
-- 一支函式 rc_my_pairs()：只回本人在裡面的配對（mentor 或 mentee 是自己），另一邊只給名字（兩個人本來就認識），
-- 加那個學期、配對日、結束日，以及還開著、給我這一邊填的 check-in 連結 token（pair-mentor 給 mentor、pair-mentee 給 mentee）。
-- 不回 email、不回別人的答案。可以重跑。最後印一張驗收表。
begin;

create or replace function public.rc_my_pairs()
returns jsonb language sql stable security definer
set search_path = public, pg_temp
as $$
  with me as (select public.rc_me_person() as id)
  select coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', p.id,
             'as', case when p.mentor_id = me.id then 'mentor' else 'mentee' end,
             'with', case when p.mentor_id = me.id then public.rc_person_name(p.mentee_id) else public.rc_person_name(p.mentor_id) end,
             'event_id', e.id, 'event', coalesce(e.title_en, e.title_zh, e.slug), 'event_zh', coalesce(e.title_zh, e.title_en, e.slug), 'term_id', e.term_id,
             'matched_on', p.matched_on, 'ended_on', p.ended_on,
             'forms', coalesce((select jsonb_agg(jsonb_build_object('title', f.title, 'token', f.token, 'closes_at', f.closes_at,
                                                                     'done', exists (select 1 from public.rc_responses r where r.form_id = f.id and r.person_id = me.id)) order by f.created_at)
                                  from public.rc_forms f where f.event_id = e.id and f.status = 'open'
                                   and f.kind = case when p.mentor_id = me.id then 'pair-mentor' else 'pair-mentee' end), '[]'::jsonb))
           order by e.starts_at desc nulls last, p.created_at desc)
      from public.rc_pairs p join public.events e on e.id = p.event_id, me
     where me.id is not null and (p.mentor_id = me.id or p.mentee_id = me.id)), '[]'::jsonb);
$$;
revoke all on function public.rc_my_pairs() from public, anon;
grant execute on function public.rc_my_pairs() to authenticated;

-- ---------- 我該填的活動回饋（2026-11-09 第四輪）----------
-- 登入的人參加過（名單上有出席或報名）的活動，還開著的活動後回饋表：標題、token、活動名、填過了沒。
-- 學員 dashboard 與幹部首頁直接放連結，不用等 LINE 群貼。只回本人的；填過了沒看 rc_responses 有沒有掛到本人那一列。
create or replace function public.rc_my_feedback()
returns jsonb language sql stable security definer
set search_path = public, pg_temp
as $$
  with me as (select public.rc_me_person() as id)
  select coalesce((
    select jsonb_agg(jsonb_build_object('title', f.title, 'token', f.token, 'closes_at', f.closes_at,
                                        'event', coalesce(e.title_en, e.title_zh, e.slug), 'event_zh', coalesce(e.title_zh, e.title_en, e.slug), 'event_id', e.id,
                                        'done', exists (select 1 from public.rc_responses r where r.form_id = f.id and r.person_id = me.id))
                     order by f.closes_at nulls last, f.created_at desc)
      from public.rc_forms f join public.events e on e.id = f.event_id, me
     where me.id is not null and f.status = 'open' and f.kind = 'post-event'
       and exists (select 1 from public.rc_participation x where x.event_id = e.id and x.person_id = me.id and x.status in ('registered', 'attended'))), '[]'::jsonb);
$$;
revoke all on function public.rc_my_feedback() from public, anon;
grant execute on function public.rc_my_feedback() to authenticated;

commit;

-- ---------- 驗收 ----------
select * from (
  with t as (
    select (select regexp_replace(prosrc, '--[^\n]*', '', 'g') like '%rc_me_person()%' and regexp_replace(prosrc, '--[^\n]*', '', 'g') like '%p.mentor_id = me.id or p.mentee_id = me.id%' from pg_proc where proname = 'rc_my_pairs' and pronamespace = 'public'::regnamespace) as mine_only,
           (select regexp_replace(prosrc, '--[^\n]*', '', 'g') not like '%rc_identities%' and regexp_replace(prosrc, '--[^\n]*', '', 'g') not like '%rc_answers%' from pg_proc where proname = 'rc_my_pairs' and pronamespace = 'public'::regnamespace) as no_leak,
           (select not has_function_privilege('anon', p.oid, 'execute') and has_function_privilege('authenticated', p.oid, 'execute') from pg_proc p where p.proname = 'rc_my_pairs' and p.pronamespace = 'public'::regnamespace) as grants_ok,
           (select regexp_replace(prosrc, '--[^\n]*', '', 'g') like '%rc_me_person()%' and regexp_replace(prosrc, '--[^\n]*', '', 'g') like '%x.person_id = me.id%' and not has_function_privilege('anon', p.oid, 'execute') from pg_proc p where p.proname = 'rc_my_feedback' and p.pronamespace = 'public'::regnamespace) as fb_ok
  )
  select 0 ord, 'OVERALL' as 項目, null::text as 應該是, null::text as 實際是,
    case when mine_only and no_leak and grants_ok and fb_ok then 'PASS' else 'FAIL' end as 結果 from t
  union all select 1, '★ 只回本人在裡面的配對', 'true', mine_only::text, case when mine_only then 'PASS' else 'FAIL' end from t
  union all select 2, '★ 不回 email、不回別人的答案', 'true', no_leak::text, case when no_leak then 'PASS' else 'FAIL' end from t
  union all select 3, '登入的人叫得到、anon 不行', 'true', grants_ok::text, case when grants_ok then 'PASS' else 'FAIL' end from t
  union all select 4, '★ 我該填的回饋只看本人參加過的活動、anon 不行', 'true', fb_ok::text, case when fb_ok then 'PASS' else 'FAIL' end from t
) x order by ord;
