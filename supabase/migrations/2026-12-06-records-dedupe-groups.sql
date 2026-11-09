-- 2026-12-06：「可能重複」改成一組同名一張卡（Paul 2026-11-08：「there are 3 Anika pairings, what if I wanna pair the first left to the second right?
-- also more info needed like email and Chinese names」）。
--   1. rc_duplicates() 回的是「同名的一群」不是「兩兩一組」：三個同名就是一張卡三欄，要留哪個、哪幾個併進來，在卡上勾。
--   2. 每一欄多帶中文名、英文名、email（值）、備註。可能重複這一頁只有管紀錄的人看得到（rc_can_manage），email 本來就是管的人在一個人的頁面看得到的東西。
--   3. 說過「不是同一個人」的（rc_not_same）：一個人跟同名群裡其他每一個都說過不是，就不再出現在那一群；群剩一個人就不印。
-- 可以重跑。最後印一張驗收表。
begin;

create or replace function public.rc_dup_side(p_person uuid)
returns jsonb language sql stable security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'id', pe.id, 'name', public.rc_person_name(pe.id), 'name_zh', coalesce(pr.name_zh, pe.name_zh), 'name_en', coalesce(pr.name_en, pe.name_en),
    'kind', pe.kind, 'school', pe.school, 'grad_year', pe.grad_year, 'has_account', pe.profile_id is not null, 'role', pr.role, 'team', pr.team, 'note', pe.note,
    'created_at', pe.created_at,
    'emails', coalesce((select jsonb_agg(i.value order by i.value) from public.rc_identities i where i.person_id = pe.id and i.kind = 'email'), '[]'::jsonb),
    'n_events', (select count(*) from public.rc_participation x where x.person_id = pe.id),
    'events', coalesce((select jsonb_agg(jsonb_build_object('title', coalesce(e.title_en, e.title_zh, e.slug), 'year', extract(year from e.starts_at)::int, 'role', x.role, 'status', x.status) order by e.starts_at desc nulls last)
                       from (select * from public.rc_participation x where x.person_id = pe.id order by recorded_at desc limit 6) x join public.events e on e.id = x.event_id), '[]'::jsonb),
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
  with pe as (
    select p.id, p.created_at,
           coalesce(nullif(lower(regexp_replace(coalesce(p.name_en, ''), '\s+', '', 'g')), ''), 'zh:' || regexp_replace(coalesce(p.name_zh, ''), '\s+', '', 'g')) as k,
           regexp_replace(coalesce(p.name_zh, ''), '\s+', '', 'g') as kz
      from public.people p where p.forgotten_at is null and (p.name_en is not null or p.name_zh is not null)
  ),
  -- 同名：英文名一樣（忽略空格大小寫），或英文名都沒有但中文名一樣。中文名一樣而英文名不同的也算同一群（以英文名那一邊的 key 歸）。
  grp as (
    select a.id, a.created_at,
           least(a.k, coalesce((select min(b.k) from pe b where b.id <> a.id and a.kz <> '' and b.kz = a.kz), a.k)) as gkey
      from pe a
  ),
  keep as (
    -- 跟群裡其他每一個都說過「不是同一個人」的，不印
    select g.* from grp g
     where exists (select 1 from grp o where o.gkey = g.gkey and o.id <> g.id
                     and not exists (select 1 from public.rc_not_same n where n.a = least(g.id, o.id) and n.b = greatest(g.id, o.id)))
  ),
  groups as (
    select gkey, array_agg(id order by created_at) as ids from keep group by gkey having count(*) >= 2
  )
  select case when public.rc_can_manage() then coalesce((
    select jsonb_agg(jsonb_build_object(
             'key', g.gkey,
             'name', public.rc_person_name(g.ids[1]),
             'members', (select jsonb_agg(public.rc_dup_side(x.id) order by x.ord) from unnest(g.ids) with ordinality x(id, ord)),
             'suggest', (select x.id from unnest(g.ids) x(id) order by (public.rc_dup_side(x.id)->>'score')::int desc limit 1),
             'not_same', coalesce((select jsonb_agg(jsonb_build_array(n.a, n.b)) from public.rc_not_same n where n.a = any(g.ids) and n.b = any(g.ids)), '[]'::jsonb))
           order by public.rc_person_name(g.ids[1]))
      from groups g), '[]'::jsonb)
  else '[]'::jsonb end;
$$;

commit;

-- ---------- 驗收 ----------
select * from (
  with t as (
    select (select regexp_replace(prosrc, '--[^\n]*', '', 'g') like '%rc_not_same%' and regexp_replace(prosrc, '--[^\n]*', '', 'g') like '%''members''%' and regexp_replace(prosrc, '--[^\n]*', '', 'g') like '%public.rc_can_manage()%' from pg_proc where proname = 'rc_duplicates' and pronamespace = 'public'::regnamespace) as dup_rule,
           (select regexp_replace(prosrc, '--[^\n]*', '', 'g') like '%''emails''%' and regexp_replace(prosrc, '--[^\n]*', '', 'g') like '%''name_zh''%' from pg_proc where proname = 'rc_dup_side' and pronamespace = 'public'::regnamespace) as side_fields,
           (select not has_function_privilege('anon', p.oid, 'execute') and not has_function_privilege('authenticated', p.oid, 'execute') from pg_proc p where p.proname = 'rc_dup_side' and p.pronamespace = 'public'::regnamespace) as side_private,
           (select not has_function_privilege('anon', p.oid, 'execute') from pg_proc p where p.proname = 'rc_duplicates' and p.pronamespace = 'public'::regnamespace) as anon_no
  )
  select 0 ord, 'OVERALL' as 項目, null::text as 應該是, null::text as 實際是,
    case when dup_rule and side_fields and side_private and anon_no then 'PASS' else 'FAIL' end as 結果 from t
  union all select 1, '★ 同名一群一張卡、跳過說過不是的、只有管的人', 'true', dup_rule::text, case when dup_rule then 'PASS' else 'FAIL' end from t
  union all select 2, '每一欄帶中文名與 email', 'true', side_fields::text, case when side_fields then 'PASS' else 'FAIL' end from t
  union all select 3, '摘要那支沒有人直接叫得到', 'true', side_private::text, case when side_private then 'PASS' else 'FAIL' end from t
  union all select 4, 'anon 叫不到 rc_duplicates', 'true', anon_no::text, case when anon_no then 'PASS' else 'FAIL' end from t
) x order by ord;
