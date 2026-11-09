-- 2026-12-03：後台「人」那頁從「只有同名提示」變成一份翻得動的名錄（Paul 2026-11-08：「I click into people there's nothing but
-- these duplicate people. Am I supposed to have people I can find and filters so I can go see the group of people I wanna see?」）。
-- 一支新函式 rc_directory()：名單上還在的每一個人一列，帶著篩選要用的欄位（身分、帳號角色、team、學校、畢業年、
-- 參加過的活動與屆別、去向的國家）。看的人（rc_can_view）拿得到；email 不在裡面（那是管的人在一個人的頁面才看得到的）。
-- 去向的國家只算 visibility 不是 private 的，除非是管的人。可以重跑。最後印一張驗收表。
begin;

create or replace function public.rc_directory()
returns jsonb language sql stable security definer
set search_path = public, pg_temp
as $$
  select case when public.rc_can_view() then coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', pe.id,
             'name', public.rc_person_name(pe.id),
             'name_zh', coalesce(pr.name_zh, pe.name_zh),
             'name_en', coalesce(pr.name_en, pe.name_en),
             'kind', pe.kind,
             'role', pr.role,
             'team', pr.team,
             'school', pe.school,
             'grad_year', pe.grad_year,
             'has_account', pe.profile_id is not null,
             'terms', coalesce((select jsonb_agg(distinct t) from (
                        select e.term_id as t from public.rc_participation x join public.events e on e.id = x.event_id where x.person_id = pe.id and e.term_id is not null
                        union select po.term_id from public.positions po where po.person_id = pe.id) z), '[]'::jsonb),
             'events', coalesce((select jsonb_agg(distinct x.event_id) from public.rc_participation x where x.person_id = pe.id), '[]'::jsonb),
             'roles', coalesce((select jsonb_agg(distinct x.role) from public.rc_participation x where x.person_id = pe.id), '[]'::jsonb),
             'countries', coalesce((select jsonb_agg(distinct o.country) from public.rc_outcomes o where o.person_id = pe.id and o.country <> '' and (o.visibility <> 'private' or public.rc_can_manage())), '[]'::jsonb),
             'latest', (select o.institution from public.rc_outcomes o where o.person_id = pe.id and (o.visibility <> 'private' or public.rc_can_manage()) order by o.year desc nulls last, o.recorded_at desc limit 1),
             'n', (select count(*) from public.rc_participation x where x.person_id = pe.id)
           ) order by public.rc_person_name(pe.id))
      from public.people pe left join public.profiles pr on pr.id = pe.profile_id
     where pe.forgotten_at is null), '[]'::jsonb) else '[]'::jsonb end;
$$;
revoke all on function public.rc_directory() from public, anon;
grant execute on function public.rc_directory() to authenticated;

commit;

-- ---------- 驗收 ----------
select * from (
  with t as (
    select (select regexp_replace(prosrc, '--[^\n]*', '', 'g') like '%rc_can_view()%' from pg_proc where proname = 'rc_directory' and pronamespace = 'public'::regnamespace) as view_gate,
           (select regexp_replace(prosrc, '--[^\n]*', '', 'g') not like '%rc_identities%' and regexp_replace(prosrc, '--[^\n]*', '', 'g') not like '%email%' from pg_proc where proname = 'rc_directory' and pronamespace = 'public'::regnamespace) as no_email,
           (select regexp_replace(prosrc, '--[^\n]*', '', 'g') like '%forgotten_at is null%' from pg_proc where proname = 'rc_directory' and pronamespace = 'public'::regnamespace) as skips_forgotten,
           (select regexp_replace(prosrc, '--[^\n]*', '', 'g') like '%visibility <> ''private'' or public.rc_can_manage()%' from pg_proc where proname = 'rc_directory' and pronamespace = 'public'::regnamespace) as private_rule,
           (select not has_function_privilege('anon', p.oid, 'execute') and has_function_privilege('authenticated', p.oid, 'execute') from pg_proc p where p.proname = 'rc_directory' and p.pronamespace = 'public'::regnamespace) as grants_ok
  )
  select 0 ord, 'OVERALL' as 項目, null::text as 應該是, null::text as 實際是,
    case when view_gate and no_email and skips_forgotten and private_rule and grants_ok then 'PASS' else 'FAIL' end as 結果 from t
  union all select 1, '★ 名錄先問 rc_can_view', 'true', view_gate::text, case when view_gate then 'PASS' else 'FAIL' end from t
  union all select 2, '★ 名錄裡沒有 email', 'true', no_email::text, case when no_email then 'PASS' else 'FAIL' end from t
  union all select 3, '被移除的人不在名錄上', 'true', skips_forgotten::text, case when skips_forgotten then 'PASS' else 'FAIL' end from t
  union all select 4, '★ 只有本人看得到的去向不進名錄（管的人除外）', 'true', private_rule::text, case when private_rule then 'PASS' else 'FAIL' end from t
  union all select 5, '登入的人叫得到、anon 不行', 'true', grants_ok::text, case when grants_ok then 'PASS' else 'FAIL' end from t
) x order by ord;
