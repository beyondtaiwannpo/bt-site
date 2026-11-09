-- 2026-12-09：「可能重複」自己先判斷是不是同一個人（Paul 2026-11-09：「if you think they are not the same person don't put them in
-- duplicates anymore… based on email and Chinese name and what they've attended, identify the real duplicates for me」）。
--   1. rc_emails(人)：一個人所有的 email（rc_identities、people.email、登入帳號），小寫去重。給下面兩支用。
--   2. rc_dup_verdict(甲, 乙)：兩個同名的人比 email、中文名、學校、畢業年、有沒有在同一場活動同一個身分出現過兩次，
--      回 same（像同一個人）、unsure（資料不夠）、different（像兩個人），加上每一項證據的代號。
--      different 的條件：email 兩邊都有而且沒有一個相同「而且」中文名兩邊都有而且不同；或中文名不同而且學校也不同；
--      或 email 不同、學校不同、畢業年也不同。same 的條件：中文名一樣、或共用 email、或同一場活動同一身分出現兩次、或同學校同畢業年，
--      而且沒有 different 那些相反的證據。其他都是 unsure。
--   3. rc_duplicates()：判成 different 的那一對跟「說過不是同一個人」一樣，不再並排；一個人跟同名群裡其他每一個都是 different 就離開這張卡。
--      一個人跟某些同名的判成 different、又跟誰都不像同一個人，就離開這張卡；資料太少（跟誰都 unsure）的留著給人看。
--      離開的那幾對放在 set_aside 裡（兩邊的名字、中文名、email 與理由），畫面最下面列出來，人覺得其實是同一個還是併得了。
--      每一欄多帶 vs_keep：跟建議留的那欄比的結果與證據，卡上印成一句話與小標籤。
-- 可以重跑。最後印一張驗收表。
begin;

create or replace function public.rc_emails(p_person uuid)
returns text[] language sql stable security definer
set search_path = public, pg_temp
as $$
  select coalesce(array_agg(distinct v order by v), '{}'::text[]) from (
    select lower(trim(i.value)) as v from public.rc_identities i where i.person_id = p_person and i.kind = 'email'
    union all select lower(trim(pe.email)) from public.people pe where pe.id = p_person
    union all select lower(trim(u.email::text)) from public.people pe join auth.users u on u.id = pe.profile_id where pe.id = p_person
  ) x where nullif(trim(coalesce(x.v, '')), '') is not null;
$$;
revoke all on function public.rc_emails(uuid) from public, anon, authenticated;

create or replace function public.rc_dup_verdict(p_a uuid, p_b uuid)
returns jsonb language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  a public.people%rowtype; b public.people%rowtype;
  ea text[]; eb text[];
  za text; zb text;
  same text[] := '{}'; diff text[] := '{}';
  email_shared boolean := false; email_disjoint boolean := false;
  zh_same boolean := false; zh_diff boolean := false;
  school_same boolean := false; school_diff boolean := false;
  grad_same boolean := false; grad_diff boolean := false;
  roster_twice boolean := false;
  v text;
begin
  select * into a from public.people where id = p_a; select * into b from public.people where id = p_b;
  if a.id is null or b.id is null then return jsonb_build_object('verdict', 'unsure', 'same', '[]'::jsonb, 'diff', '[]'::jsonb); end if;
  ea := public.rc_emails(p_a); eb := public.rc_emails(p_b);
  if cardinality(ea) > 0 and cardinality(eb) > 0 then
    email_shared := ea && eb; email_disjoint := not email_shared;
  end if;
  za := nullif(regexp_replace(coalesce(a.name_zh, ''), '\s+', '', 'g'), ''); zb := nullif(regexp_replace(coalesce(b.name_zh, ''), '\s+', '', 'g'), '');
  if za is not null and zb is not null then zh_same := za = zb; zh_diff := not zh_same; end if;
  if nullif(trim(coalesce(a.school, '')), '') is not null and nullif(trim(coalesce(b.school, '')), '') is not null then
    school_same := lower(trim(a.school)) = lower(trim(b.school)); school_diff := not school_same;
  end if;
  if a.grad_year is not null and b.grad_year is not null then grad_same := a.grad_year = b.grad_year; grad_diff := abs(a.grad_year - b.grad_year) >= 2; end if;
  -- 同一場活動、同一個身分、兩個人都在名單上：多半是同一份名單倒了兩次
  roster_twice := exists (select 1 from public.rc_participation x join public.rc_participation y on y.event_id = x.event_id and y.role = x.role
                           where x.person_id = p_a and y.person_id = p_b);
  if email_shared then same := array_append(same, 'email_shared'); end if;
  if zh_same then same := array_append(same, 'zh_same'); end if;
  if roster_twice then same := array_append(same, 'roster_twice'); end if;
  if school_same then same := array_append(same, 'school_same'); end if;
  if grad_same then same := array_append(same, 'grad_same'); end if;
  if email_disjoint then diff := array_append(diff, 'email_disjoint'); end if;
  if zh_diff then diff := array_append(diff, 'zh_diff'); end if;
  if school_diff then diff := array_append(diff, 'school_diff'); end if;
  if grad_diff then diff := array_append(diff, 'grad_diff'); end if;
  if (email_disjoint and zh_diff) or (zh_diff and school_diff) or (email_disjoint and school_diff and grad_diff) then v := 'different';
  elsif (email_shared or zh_same or roster_twice or (school_same and grad_same)) and not (zh_diff or email_disjoint) then v := 'same';
  elsif (email_shared or zh_same or roster_twice) then v := 'same';   -- 有一項相反（例如換了信箱）但中文名或名單對得上，還是像同一個人
  else v := 'unsure'; end if;
  return jsonb_build_object('verdict', v, 'same', to_jsonb(same), 'diff', to_jsonb(diff));
end $$;
revoke all on function public.rc_dup_verdict(uuid, uuid) from public, anon, authenticated;

create or replace function public.rc_dup_side(p_person uuid)
returns jsonb language sql stable security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'id', pe.id, 'name', public.rc_person_name(pe.id), 'name_zh', coalesce(pr.name_zh, pe.name_zh), 'name_en', coalesce(pr.name_en, pe.name_en),
    'kind', pe.kind, 'school', pe.school, 'grad_year', pe.grad_year, 'has_account', pe.profile_id is not null, 'role', pr.role, 'team', pr.team, 'note', pe.note,
    'created_at', pe.created_at,
    'emails', to_jsonb(public.rc_emails(pe.id)),
    'n_events', (select count(*) from public.rc_participation x where x.person_id = pe.id),
    'events', coalesce((select jsonb_agg(jsonb_build_object('title', coalesce(e.title_en, e.title_zh, e.slug), 'year', extract(year from e.starts_at)::int, 'role', x.role, 'status', x.status) order by e.starts_at desc nulls last)
                       from (select * from public.rc_participation x where x.person_id = pe.id order by recorded_at desc limit 6) x join public.events e on e.id = x.event_id), '[]'::jsonb),
    'n_pairs', (select count(*) from public.rc_pairs r where r.mentor_id = pe.id or r.mentee_id = pe.id),
    'n_outcomes', (select count(*) from public.rc_outcomes o where o.person_id = pe.id),
    'n_emails', cardinality(public.rc_emails(pe.id)),
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
  grp as (
    select a.id, a.created_at,
           least(a.k, coalesce((select min(b.k) from pe b where b.id <> a.id and a.kz <> '' and b.kz = a.kz), a.k)) as gkey
      from pe a
  ),
  -- 群裡每一對：說過不是、或判成 different，就不並排
  pairs as (
    select g.gkey, g.id as a, o.id as b,
           exists (select 1 from public.rc_not_same n where n.a = least(g.id, o.id) and n.b = greatest(g.id, o.id)) as marked,
           public.rc_dup_verdict(g.id, o.id) as vd
      from grp g join grp o on o.gkey = g.gkey and o.id > g.id
  ),
  -- 留在卡上的人：還有沒說過不是的同名對象，而且（跟某一個像同一個人，或者跟誰都沒判成不同人）。
  -- 跟某些人判成不同、又跟誰都不像同一個人的，離開這張卡（去 set_aside）；資料太少、跟誰都是 unsure 的留著給人看。
  keep as (
    select g.* from grp g
     where exists (select 1 from pairs p where (p.a = g.id or p.b = g.id) and not p.marked)
       and (exists (select 1 from pairs p where (p.a = g.id or p.b = g.id) and not p.marked and p.vd->>'verdict' = 'same')
            or not exists (select 1 from pairs p where (p.a = g.id or p.b = g.id) and not p.marked and p.vd->>'verdict' = 'different'))
  ),
  groups as (
    select gkey, array_agg(id order by created_at) as ids from keep group by gkey having count(*) >= 2
  ),
  aside as (
    select gkey, jsonb_agg(jsonb_build_object('a', a, 'b', b, 'a_name', public.rc_person_name(a), 'b_name', public.rc_person_name(b),
                  'a_zh', (select name_zh from public.people where id = a), 'b_zh', (select name_zh from public.people where id = b),
                  'a_school', (select school from public.people where id = a), 'b_school', (select school from public.people where id = b),
                  'a_emails', to_jsonb(public.rc_emails(a)), 'b_emails', to_jsonb(public.rc_emails(b)),
                  'why', vd->'diff') order by public.rc_person_name(a)) as items
      from pairs where not marked and vd->>'verdict' = 'different'
       and (a not in (select id from keep) or b not in (select id from keep))   -- 兩邊都還在卡上的不重複列（卡上那一欄會標 different）
     group by gkey
  ),
  allk as (select gkey from groups union select gkey from aside)
  select case when public.rc_can_manage() then coalesce((
    select jsonb_agg(jsonb_build_object(
             'key', k.gkey,
             'name', public.rc_person_name(coalesce(g.ids[1], (select a from pairs p where p.gkey = k.gkey limit 1))),
             'members', coalesce((select jsonb_agg(public.rc_dup_side(x.id) || jsonb_build_object('vs_keep', public.rc_dup_verdict(x.id, sg.suggest)) order by x.ord)
                                    from unnest(g.ids) with ordinality x(id, ord)), '[]'::jsonb),
             'suggest', sg.suggest,
             'not_same', coalesce((select jsonb_agg(jsonb_build_array(n.a, n.b)) from public.rc_not_same n where n.a = any(g.ids) and n.b = any(g.ids)), '[]'::jsonb),
             'set_aside', coalesce(s.items, '[]'::jsonb))
           order by 1)
      from allk k
      left join groups g on g.gkey = k.gkey
      left join aside s on s.gkey = k.gkey
      left join lateral (select (select x.id from unnest(g.ids) x(id) order by (public.rc_dup_side(x.id)->>'score')::int desc limit 1) as suggest) sg on true), '[]'::jsonb)
  else '[]'::jsonb end;
$$;
grant execute on function public.rc_duplicates() to authenticated;

commit;

-- ---------- 驗收 ----------
select * from (
  with t as (
    select (select regexp_replace(prosrc, '--[^\n]*', '', 'g') like '%email_disjoint and zh_diff%' from pg_proc where proname = 'rc_dup_verdict' and pronamespace = 'public'::regnamespace) as rule_ok,
           (select regexp_replace(prosrc, '--[^\n]*', '', 'g') like '%roster_twice%' and regexp_replace(prosrc, '--[^\n]*', '', 'g') like '%rc_participation%' from pg_proc where proname = 'rc_dup_verdict' and pronamespace = 'public'::regnamespace) as roster_ok,
           (select regexp_replace(prosrc, '--[^\n]*', '', 'g') like '%= ''different''%' and regexp_replace(prosrc, '--[^\n]*', '', 'g') like '%= ''same''%' and regexp_replace(prosrc, '--[^\n]*', '', 'g') like '%set_aside%' and regexp_replace(prosrc, '--[^\n]*', '', 'g') like '%vs_keep%' from pg_proc where proname = 'rc_duplicates' and pronamespace = 'public'::regnamespace) as dups_ok,
           (select bool_and(not has_function_privilege('anon', p.oid, 'execute') and not has_function_privilege('authenticated', p.oid, 'execute')) from pg_proc p where p.proname in ('rc_dup_verdict', 'rc_emails', 'rc_dup_side') and p.pronamespace = 'public'::regnamespace) as grants_ok,
           (select has_function_privilege('authenticated', p.oid, 'execute') and not has_function_privilege('anon', p.oid, 'execute') from pg_proc p where p.proname = 'rc_duplicates' and p.pronamespace = 'public'::regnamespace) as dup_grant_ok
  )
  select 0 ord, 'OVERALL' as 項目, null::text as 應該是, null::text as 實際是,
    case when rule_ok and roster_ok and dups_ok and grants_ok and dup_grant_ok then 'PASS' else 'FAIL' end as 結果 from t
  union all select 1, '★ email 不同而且中文名不同就判成不同人', 'true', rule_ok::text, case when rule_ok then 'PASS' else 'FAIL' end from t
  union all select 2, '同一場活動同一身分出現兩次算同一個人的證據', 'true', roster_ok::text, case when roster_ok then 'PASS' else 'FAIL' end from t
  union all select 3, '★ 判成不同人的不再並排，放到 set_aside；每欄帶 vs_keep', 'true', dups_ok::text, case when dups_ok then 'PASS' else 'FAIL' end from t
  union all select 4, '三支內部函式前端叫不到', 'true', grants_ok::text, case when grants_ok then 'PASS' else 'FAIL' end from t
  union all select 5, 'rc_duplicates 登入的人叫得到、anon 不行（裡面再看 rc_can_manage）', 'true', dup_grant_ok::text, case when dup_grant_ok then 'PASS' else 'FAIL' end from t
) x order by ord;
