-- 2026-12-11：合併撞到的兩件事（Paul 2026-11-10 在可能重複那張卡上：一個人三列，幹部帳號、學員帳號、2023 營隊沒帳號的一列，
-- 留學員帳號、勾另外兩列，跳出「duplicate key value violates unique constraint rc_identities_one」與「Both have accounts」）。
--   1. 那個 SQL 原文錯誤的來源：rc_identities 的唯一索引是全表的（同一個 kind 同一個值只能屬於一個人），2026-12-10 合併時把被併那列的
--      英文名／中文名寫進 rc_identities 當別名，只檢查了留的那個人有沒有，沒檢查別人有沒有，第三列有同名的 identity 就撞。
--      現在寫別名一律 on conflict (kind, lower(value)) do nothing。搬紀錄那一段抽成 rc_move_records()，合併人與合併帳號共用。
--   2. 一個人兩個登入帳號（例如先用 gmail 當幹部、又用 nyu.edu 註冊成學員）：新函式 rc_merge_accounts(留, 併)，只有 Co-President 能按。
--      被併那個帳號的出席、配對、去向、答案、學校紀錄、職位、邀請碼全部搬到留的那個帳號，email 留在這個人身上當 identity（之後名單用那個
--      email 還對得到他），然後把那個登入刪掉（跟「刪除成員」remove_member 一樣直接刪 auth.users，那個 email 從此登不進來；要再用得重新註冊，
--      註冊會因為 email 已在名單上而接不到帳號，不會再生出一列）。不能併自己正在用的帳號，不能併 Co-President 的帳號。
--   3. 「建議留」改成有幹部帳號的那一欄優先（原本只看有沒有帳號、出席多少）。
-- 可以重跑。最後印一張驗收表。
begin;

-- 搬紀錄：被併那列的一切歸到留的那列。不看權限（兩支對外函式自己守），不刪 people 那一列（呼叫的人決定怎麼收尾）。
create or replace function public.rc_move_records(p_keep uuid, p_drop uuid)
returns void language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_keep public.people%rowtype; v_drop public.people%rowtype;
begin
  select * into v_keep from public.people where id = p_keep; if not found then raise exception 'no_such_person' using errcode = 'P0001'; end if;
  select * into v_drop from public.people where id = p_drop; if not found then raise exception 'no_such_person' using errcode = 'P0001'; end if;
  -- identities 全表唯一：留的那個人沒有的搬過去，其餘刪掉
  update public.rc_identities set person_id = p_keep where person_id = p_drop
     and not exists (select 1 from public.rc_identities k where k.person_id = p_keep and k.kind = rc_identities.kind and lower(k.value) = lower(rc_identities.value));
  delete from public.rc_identities where person_id = p_drop;
  update public.rc_schools set person_id = p_keep, source = 'merge' where person_id = p_drop
     and not exists (select 1 from public.rc_schools k where k.person_id = p_keep and lower(trim(k.school)) = lower(trim(rc_schools.school)));
  delete from public.rc_schools where person_id = p_drop;
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
         note = case when nullif(trim(coalesce(v_drop.note, '')), '') is null then note
                     when nullif(trim(coalesce(note, '')), '') is null then trim(v_drop.note)
                     when trim(note) = trim(v_drop.note) then note
                     else trim(note) || ' / ' || trim(v_drop.note) end
   where id = p_keep;
  -- 被併那列的學校與名字不丟：學校進學校紀錄，名字不同的當別名（全表唯一，別人已經有同樣的就不寫）
  if nullif(trim(coalesce(v_drop.school, '')), '') is not null then perform public.rc_school_add(p_keep, v_drop.school, 'merge'); end if;
  if nullif(trim(coalesce(v_drop.name_en, '')), '') is not null and lower(trim(v_drop.name_en)) <> lower(trim(coalesce(v_keep.name_en, ''))) then
    insert into public.rc_identities (person_id, kind, value, source) values (p_keep, 'name_en', trim(v_drop.name_en), 'merge') on conflict (kind, lower(value)) do nothing;
  end if;
  if nullif(trim(coalesce(v_drop.name_zh, '')), '') is not null and trim(v_drop.name_zh) <> trim(coalesce(v_keep.name_zh, '')) then
    insert into public.rc_identities (person_id, kind, value, source) values (p_keep, 'name_zh', trim(v_drop.name_zh), 'merge') on conflict (kind, lower(value)) do nothing;
  end if;
end $$;
revoke all on function public.rc_move_records(uuid, uuid) from public, anon, authenticated;

-- 合併兩列（最多一邊有帳號）。先守權限與帳號，再搬，不會搬到一半才撞錯。
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
  if (v_drop.kind = 'member' or v_drop.profile_id is not null or exists (select 1 from public.positions where person_id = p_drop)) and not public.is_president() then
    raise exception 'not_president' using errcode = 'P0001';
  end if;
  perform public.rc_move_records(p_keep, p_drop);
  if v_drop.kind = 'member' or v_drop.profile_id is not null or exists (select 1 from public.positions where person_id = p_drop) then
    perform public.merge_people(p_keep, p_drop);   -- 職位、邀請碼、帳號接到留的那列，刪掉被併那列
  else
    delete from public.people where id = p_drop;
  end if;
  perform public.rc_log_it('person_merge', p_keep, to_jsonb(p_drop), null);
  return p_keep;
end $$;

-- 合併兩個登入帳號：紀錄全部歸到留的那個，被併那個登入刪掉。只有 Co-President。
create or replace function public.rc_merge_accounts(p_keep uuid, p_drop uuid)
returns uuid language plpgsql security definer
set search_path = public, auth, pg_temp
as $$
declare v_keep public.people%rowtype; v_drop public.people%rowtype; v_email text; v_drop_name text;
begin
  perform public.require_president();
  if p_keep = p_drop then raise exception 'same_person' using errcode = 'P0001'; end if;
  select * into v_keep from public.people where id = p_keep; if not found then raise exception 'no_such_person' using errcode = 'P0001'; end if;
  select * into v_drop from public.people where id = p_drop; if not found then raise exception 'no_such_person' using errcode = 'P0001'; end if;
  if v_keep.profile_id is null or v_drop.profile_id is null then raise exception 'not_both_accounts' using errcode = 'P0001'; end if;
  if v_drop.profile_id = auth.uid() then raise exception 'cannot_remove_self' using errcode = 'P0001'; end if;
  if exists (select 1 from public.profiles where id = v_drop.profile_id and board_role = 'president') then raise exception 'cannot_retire_president' using errcode = 'P0001'; end if;
  if exists (select 1 from public.invite_codes where person_id = p_drop and uses_left > 0) then raise exception 'has_unused_invite' using errcode = 'P0001'; end if;
  select lower(email) into v_email from auth.users where id = v_drop.profile_id;
  v_drop_name := public.person_name(p_drop);
  perform public.rc_move_records(p_keep, p_drop);
  insert into public.positions (person_id, term_id, title_zh, title_en, team)
  select p_keep, term_id, title_zh, title_en, team from public.positions where person_id = p_drop
  on conflict (person_id, term_id, (coalesce(team, ''))) do nothing;
  update public.invite_codes set person_id = p_keep where person_id = p_drop;
  -- 被刪那個登入的 email 留在這個人身上，之後名單、報名用這個 email 還對得到他
  if v_email is not null then
    insert into public.rc_identities (person_id, kind, value, source, verified) values (p_keep, 'email', v_email, 'login', true) on conflict (kind, lower(value)) do nothing;
  end if;
  delete from public.people where id = p_drop;
  delete from auth.users where id = v_drop.profile_id;
  perform public.log_change(v_keep.profile_id, public.person_name(p_keep), 'merged', coalesce(v_drop_name, '') || ' <' || coalesce(v_email, '') || '>', p_keep::text);
  perform public.rc_log_it('account_merge', p_keep, jsonb_build_object('dropped_person', p_drop, 'dropped_profile', v_drop.profile_id, 'email', v_email), null);
  return p_keep;
end $$;
revoke all on function public.rc_merge_accounts(uuid, uuid) from public, anon;
grant execute on function public.rc_merge_accounts(uuid, uuid) to authenticated;

-- 可能重複那張卡的一欄（從 2026-12-10 那版來，建議留的分數多「幹部帳號 +500」）
create or replace function public.rc_dup_side(p_person uuid)
returns jsonb language sql stable security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'id', pe.id, 'name', public.rc_person_name(pe.id), 'name_zh', coalesce(pr.name_zh, pe.name_zh), 'name_en', coalesce(pr.name_en, pe.name_en),
    'kind', pe.kind, 'school', pe.school, 'grad_year', pe.grad_year, 'has_account', pe.profile_id is not null, 'role', pr.role, 'team', pr.team, 'note', pe.note,
    'created_at', pe.created_at,
    'emails', to_jsonb(public.rc_emails(pe.id)),
    'schools', coalesce((select jsonb_agg(s.school order by s.year_from nulls last, s.recorded_at) from public.rc_schools s where s.person_id = pe.id), '[]'::jsonb),
    'n_events', (select count(*) from public.rc_participation x where x.person_id = pe.id),
    'events', coalesce((select jsonb_agg(jsonb_build_object('title', coalesce(e.title_en, e.title_zh, e.slug), 'year', extract(year from e.starts_at)::int, 'role', x.role, 'status', x.status) order by e.starts_at desc nulls last)
                       from (select * from public.rc_participation x where x.person_id = pe.id order by recorded_at desc limit 6) x join public.events e on e.id = x.event_id), '[]'::jsonb),
    'n_pairs', (select count(*) from public.rc_pairs r where r.mentor_id = pe.id or r.mentee_id = pe.id),
    'n_outcomes', (select count(*) from public.rc_outcomes o where o.person_id = pe.id),
    'n_emails', cardinality(public.rc_emails(pe.id)),
    'n_answers', (select count(*) from public.rc_responses r where r.person_id = pe.id),
    'score', (pe.profile_id is not null)::int * 1000 + coalesce(pr.role = 'cadre', false)::int * 500 + (select count(*) from public.rc_participation x where x.person_id = pe.id) * 10
             + (pe.name_zh is not null)::int + (pe.name_en is not null)::int + (pe.school is not null)::int + (pe.grad_year is not null)::int
             + (select count(*) from public.rc_identities i where i.person_id = pe.id))
    from public.people pe left join public.profiles pr on pr.id = pe.profile_id where pe.id = p_person;
$$;

revoke all on function public.rc_dup_side(uuid) from public, anon, authenticated;

commit;

-- ---------- 驗收 ----------
select * from (
  with fn as (select proname, regexp_replace(prosrc, '--[^\n]*', '', 'g') as body from pg_proc where pronamespace = 'public'::regnamespace),
  t as (
    select (select count(*) from fn where proname = 'rc_move_records') = 1
           and (select body like '%on conflict (kind, lower(value)) do nothing%' from fn where proname = 'rc_move_records') as alias_safe,
           (select body like '%rc_move_records(p_keep, p_drop)%' and body like '%both_have_accounts%' from fn where proname = 'rc_merge_people') as merge_uses_move,
           (select position('both_have_accounts' in body) < position('rc_move_records' in body) and position('not_president' in body) < position('rc_move_records' in body) from fn where proname = 'rc_merge_people') as checks_first,
           (select body like '%require_president()%' and body like '%cannot_remove_self%' and body like '%cannot_retire_president%' and body like '%delete from auth.users where id = v_drop.profile_id%' and body like '%rc_move_records(p_keep, p_drop)%' from fn where proname = 'rc_merge_accounts') as accounts_ok,
           (select body like '%coalesce(pr.role = ''cadre'', false)::int * 500%' from fn where proname = 'rc_dup_side') as suggest_cadre,
           (select has_function_privilege('authenticated', p.oid, 'execute') and not has_function_privilege('anon', p.oid, 'execute') from pg_proc p where p.proname = 'rc_merge_accounts' and p.pronamespace = 'public'::regnamespace)
             and (select not has_function_privilege('authenticated', p.oid, 'execute') from pg_proc p where p.proname = 'rc_move_records' and p.pronamespace = 'public'::regnamespace) as grants_ok
  )
  select 0 ord, 'OVERALL' as 項目, null::text as 應該是, null::text as 實際是,
    case when alias_safe and merge_uses_move and checks_first and accounts_ok and suggest_cadre and grants_ok then 'PASS' else 'FAIL' end as 結果 from t
  union all select 1, '★ 別名寫進 identities 不再撞全表唯一（on conflict do nothing）', 'true', alias_safe::text, case when alias_safe then 'PASS' else 'FAIL' end from t
  union all select 2, '合併人走共用的搬紀錄', 'true', merge_uses_move::text, case when merge_uses_move then 'PASS' else 'FAIL' end from t
  union all select 3, '★ 帳號與權限先檢查，再搬任何東西', 'true', checks_first::text, case when checks_first then 'PASS' else 'FAIL' end from t
  union all select 4, '★ 合併帳號：只有 Co-President、不能併自己、不能併 Co-President、刪掉被併的登入', 'true', accounts_ok::text, case when accounts_ok then 'PASS' else 'FAIL' end from t
  union all select 5, '建議留有幹部帳號的那一欄', 'true', suggest_cadre::text, case when suggest_cadre then 'PASS' else 'FAIL' end from t
  union all select 6, '合併帳號登入的人叫得到、anon 不行；搬紀錄那支前端叫不到', 'true', grants_ok::text, case when grants_ok then 'PASS' else 'FAIL' end from t
) x order by ord;
