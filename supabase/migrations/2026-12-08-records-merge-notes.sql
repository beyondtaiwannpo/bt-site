-- 2026-12-08：合併兩個人時備註不再丟掉，可能重複那張卡的 email 欄看得更齊（Paul 2026-11-09 問「合併是不是把另一個人整個刪掉？
-- 有不同 email 跟不同中文名的大概是不同人」）。
--   1. rc_merge_people：原本只把留的那一列空著的欄位補上，被併進來那一列的「備註」整句不見。現在兩邊的備註接在一起（中間用「 / 」），
--      一樣的只留一份。出席、答案、配對、去向、email 本來就會搬過去，這一支沒有動那些。
--   2. rc_dup_side：email 那一欄原本只看 rc_identities；現在把 people.email 與登入帳號的 email 也算進去（去重、小寫），
--      兩欄 email 不一樣、中文名也不一樣的，卡上會標「可能是不同人」而且不預設勾（那一段在 admin/records/src/ui.js，不在資料庫）。
-- 可以重跑。最後印一張驗收表。
begin;

create or replace function public.rc_merge_people(p_keep uuid, p_drop uuid)
returns uuid language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_keep public.people%rowtype; v_drop public.people%rowtype;
begin
  if not public.rc_can_manage() then raise exception 'not_records_manager' using errcode = 'P0001'; end if;
  if p_keep = p_drop then raise exception 'same_person' using errcode = 'P0001'; end if;
  select * into v_keep from public.people where id = p_keep; if not found then raise exception 'no_such_person' using errcode = 'P0001'; end if;
  select * into v_drop from public.people where id = p_drop; if not found then raise exception 'no_such_person' using errcode = 'P0001'; end if;
  if v_keep.profile_id is not null and v_drop.profile_id is not null then raise exception 'both_have_accounts' using errcode = 'P0001'; end if;
  update public.rc_identities set person_id = p_keep where person_id = p_drop
     and not exists (select 1 from public.rc_identities k where k.person_id = p_keep and k.kind = rc_identities.kind and lower(k.value) = lower(rc_identities.value));
  delete from public.rc_identities where person_id = p_drop;
  update public.rc_participation set person_id = p_keep where person_id = p_drop
     and not exists (select 1 from public.rc_participation k where k.person_id = p_keep and k.event_id = rc_participation.event_id and k.role = rc_participation.role
                        and coalesce(k.session_id, '00000000-0000-0000-0000-000000000000') = coalesce(rc_participation.session_id, '00000000-0000-0000-0000-000000000000'));
  delete from public.rc_participation where person_id = p_drop;
  update public.rc_responses set person_id = p_keep where person_id = p_drop;
  update public.rc_pairs set mentor_id = p_keep where mentor_id = p_drop;
  update public.rc_pairs set mentee_id = p_keep where mentee_id = p_drop;
  update public.rc_outcomes set person_id = p_keep where person_id = p_drop;
  update public.people set name_zh = coalesce(name_zh, v_drop.name_zh), name_en = coalesce(name_en, v_drop.name_en),
         school = coalesce(school, v_drop.school), grad_year = coalesce(grad_year, v_drop.grad_year), email = coalesce(email, v_drop.email),
         kind = case when kind = 'member' or v_drop.kind = 'member' then 'member' else kind end,
         -- 備註接在一起：留的在前、併進來的在後，一樣的（忽略前後空白）只留一份
         note = case when nullif(trim(coalesce(v_drop.note, '')), '') is null then note
                     when nullif(trim(coalesce(note, '')), '') is null then trim(v_drop.note)
                     when trim(note) = trim(v_drop.note) then note
                     else trim(note) || ' / ' || trim(v_drop.note) end
   where id = p_keep;
  if v_drop.kind = 'member' or v_drop.profile_id is not null or exists (select 1 from public.positions where person_id = p_drop) then
    if not public.is_president() then raise exception 'not_president' using errcode = 'P0001'; end if;
    perform public.merge_people(p_keep, p_drop);
  else
    delete from public.people where id = p_drop;
  end if;
  perform public.rc_log_it('person_merge', p_keep, to_jsonb(p_drop), null);
  return p_keep;
end $$;

create or replace function public.rc_dup_side(p_person uuid)
returns jsonb language sql stable security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'id', pe.id, 'name', public.rc_person_name(pe.id), 'name_zh', coalesce(pr.name_zh, pe.name_zh), 'name_en', coalesce(pr.name_en, pe.name_en),
    'kind', pe.kind, 'school', pe.school, 'grad_year', pe.grad_year, 'has_account', pe.profile_id is not null, 'role', pr.role, 'team', pr.team, 'note', pe.note,
    'created_at', pe.created_at,
    -- rc_identities 的 email、people.email、登入帳號的 email，三個來源合起來去重
    'emails', coalesce((select jsonb_agg(v order by v) from (
                 select distinct lower(trim(x.v)) as v from (
                   select i.value as v from public.rc_identities i where i.person_id = pe.id and i.kind = 'email'
                   union all select pe.email
                   union all select u.email::text from auth.users u where u.id = pe.profile_id
                 ) x where nullif(trim(coalesce(x.v, '')), '') is not null) s), '[]'::jsonb),
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

-- 跟 2026-12-06 一樣：這一支只給 rc_duplicates() 在裡面叫，前端不直接叫
revoke all on function public.rc_dup_side(uuid) from public, anon, authenticated;

commit;

-- ---------- 驗收 ----------
select * from (
  with t as (
    select (select regexp_replace(prosrc, '--[^\n]*', '', 'g') like '%v_drop.note%' and regexp_replace(prosrc, '--[^\n]*', '', 'g') like '%'' / ''%' from pg_proc where proname = 'rc_merge_people' and pronamespace = 'public'::regnamespace) as note_joined,
           (select regexp_replace(prosrc, '--[^\n]*', '', 'g') like '%rc_participation set person_id = p_keep%' and regexp_replace(prosrc, '--[^\n]*', '', 'g') like '%rc_responses set person_id = p_keep%' and regexp_replace(prosrc, '--[^\n]*', '', 'g') like '%rc_outcomes set person_id = p_keep%' from pg_proc where proname = 'rc_merge_people' and pronamespace = 'public'::regnamespace) as moves_history,
           (select regexp_replace(prosrc, '--[^\n]*', '', 'g') like '%pe.email%' and regexp_replace(prosrc, '--[^\n]*', '', 'g') like '%auth.users%' from pg_proc where proname = 'rc_dup_side' and pronamespace = 'public'::regnamespace) as emails_all,
           (select not has_function_privilege('anon', p.oid, 'execute') and not has_function_privilege('authenticated', p.oid, 'execute') from pg_proc p where p.proname = 'rc_dup_side' and p.pronamespace = 'public'::regnamespace) as grants_ok
  )
  select 0 ord, 'OVERALL' as 項目, null::text as 應該是, null::text as 實際是,
    case when note_joined and moves_history and emails_all and grants_ok then 'PASS' else 'FAIL' end as 結果 from t
  union all select 1, '★ 合併時兩邊的備註接在一起', 'true', note_joined::text, case when note_joined then 'PASS' else 'FAIL' end from t
  union all select 2, '★ 合併是搬出席、答案、去向，不是刪人', 'true', moves_history::text, case when moves_history then 'PASS' else 'FAIL' end from t
  union all select 3, '可能重複那張卡的 email 三個來源都看', 'true', emails_all::text, case when emails_all then 'PASS' else 'FAIL' end from t
  union all select 4, '前端叫不到，只有 rc_duplicates() 在裡面用', 'true', grants_ok::text, case when grants_ok then 'PASS' else 'FAIL' end from t
) x order by ord;
