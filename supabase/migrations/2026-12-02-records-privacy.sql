-- 2026-12-02：隱私政策「回饋與紀錄」那一節寫了三件事，這一支把程式補到跟政策一樣（Paul 2026-11-08 Approve all）。
--   1. 具名的回饋答案保存三屆（約三年），之後轉匿名：rc_anonymise_old(p_do)。Co-President 在後台「回饋表」那頁按，
--      p_do = false 只算有幾份、界線是哪一天；p_do = true 才真的清（person_id、participation_id、typed_name、contact_ok）。
--      「三屆」照 terms 表算：由新到舊第三屆的開始日之前送出的都算舊。屆別不到三個就什麼都不清。
--   2. 去向「可以連名字公開」只有本人勾得了；學員（kind student）的去向誰填都不能 public：rc_save_outcome 多一道門（public_needs_self）。
--   3. 學員自己刪帳號時，紀錄那邊的名字、email、出席、配對、去向一併清掉（跟 forget_person 同一支清法 rc_forget_rows），
--      答案留著但不掛人。delete_my_account 重寫，其他行為不變（幹部仍然擋 cadre_must_ask）。
-- 可以重跑。最後印一張驗收表，全部 PASS 才算跑完。
begin;

-- ---------- 1. 清一個人的紀錄（內部用，forget_person 與 delete_my_account 共用） ----------
create or replace function public.rc_forget_rows(p_person uuid)
returns void language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  delete from public.rc_identities where person_id = p_person;
  delete from public.rc_participation where person_id = p_person;
  delete from public.rc_outcomes where person_id = p_person;
  update public.rc_responses set person_id = null, participation_id = null, typed_name = '', contact_ok = false where person_id = p_person;
  update public.rc_pairs set mentor_id = null where mentor_id = p_person;
  update public.rc_pairs set mentee_id = null where mentee_id = p_person;
  delete from public.positions where person_id = p_person;
  update public.invite_codes set person_id = null where person_id = p_person;
  update public.people set name_zh = null, name_en = null, email = null, note = null, school = null, grad_year = null, forgotten_at = now() where id = p_person;
end $$;
revoke all on function public.rc_forget_rows(uuid) from public, anon, authenticated;

-- forget_person 照舊（只有 Co-President、有帳號的先刪帳號），清的那幾行改成叫上面那一支。
create or replace function public.forget_person(p_person uuid)
returns boolean language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  perform public.require_president();
  if not exists (select 1 from public.people where id = p_person) then raise exception 'no_such_person' using errcode = 'P0001'; end if;
  if exists (select 1 from public.people where id = p_person and profile_id is not null) then raise exception 'has_account' using errcode = 'P0001'; end if;
  perform public.rc_forget_rows(p_person);
  perform public.rc_log_it('person_forget', p_person, null, null);
  return true;
end $$;

-- ---------- 3. 學員刪帳號一併清紀錄 ----------
-- 2026-09-08 那一版只刪 auth.users。people.profile_id 是 on delete set null，所以那一列的名字、出席、配對、去向都會留下來，
-- 而學員多半未成年，「刪了帳號以為都刪了」比「多留一列」更傷（隱私政策 2026-11-08 的決定 3）。
create or replace function public.delete_my_account()
returns void language plpgsql security definer
set search_path = public, auth, pg_temp
as $$
declare v_uid uuid := auth.uid(); v_person uuid;
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = 'P0001'; end if;
  if public.is_cadre() then raise exception 'cadre_must_ask' using errcode = 'P0001'; end if;
  select id into v_person from public.people where profile_id = v_uid;
  if v_person is not null then
    perform public.rc_forget_rows(v_person);
    update public.people set profile_id = null where id = v_person;
    perform public.rc_log_it('person_forget', v_person, null, to_jsonb('self'::text));
  end if;
  delete from auth.users where id = v_uid;
end $$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- ---------- 1. 三屆前的具名答案轉匿名 ----------
create or replace function public.rc_anonymise_old(p_do boolean)
returns jsonb language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_cutoff date; v_n int := 0;
begin
  perform public.require_president();
  -- 由新到舊第三屆的開始日：現在這一屆加前兩屆留著，再往前的都算舊。
  select starts_on into v_cutoff from public.terms order by starts_on desc offset 2 limit 1;
  if v_cutoff is null then return jsonb_build_object('cutoff', null, 'n', 0, 'done', false); end if;
  select count(*) into v_n from public.rc_responses where person_id is not null and submitted_at < v_cutoff;
  if p_do and v_n > 0 then
    update public.rc_responses set person_id = null, participation_id = null, typed_name = '', contact_ok = false
     where person_id is not null and submitted_at < v_cutoff;
    perform public.rc_log_it('responses_anonymise', null, to_jsonb(v_cutoff), to_jsonb(v_n));
  end if;
  return jsonb_build_object('cutoff', v_cutoff, 'n', v_n, 'done', p_do and v_n > 0);
end $$;
revoke all on function public.rc_anonymise_old(boolean) from public, anon;
grant execute on function public.rc_anonymise_old(boolean) to authenticated;

-- ---------- 2. 去向：public 只有本人、學員不行 ----------
create or replace function public.rc_save_outcome(p_outcome uuid, p jsonb)
returns uuid language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_person uuid; v_me uuid := public.rc_me_person(); v_id uuid; v_kind text := coalesce(nullif(p->>'kind', ''), 'enrolled'); v_vis text := coalesce(nullif(p->>'visibility', ''), 'internal');
begin
  if v_me is null and nullif(p->>'person_id', '') is null and auth.uid() is not null then
    -- 本人還沒有名單上的那一列（一般幹部、學員、校友都可能）：建一列接上帳號。
    insert into public.people (name_zh, name_en, kind, profile_id)
    select nullif(pr.name_zh, ''), nullif(pr.name_en, ''), case when pr.role in ('cadre', 'alumni') then 'member' else 'student' end, pr.id
      from public.profiles pr where pr.id = auth.uid() and not exists (select 1 from public.people x where x.profile_id = pr.id)
    returning id into v_me;
  end if;
  v_person := coalesce(nullif(p->>'person_id', '')::uuid, v_me);
  if p_outcome is not null then select person_id into v_person from public.rc_outcomes where id = p_outcome; end if;
  if v_person is null then raise exception 'no_such_person' using errcode = 'P0001'; end if;
  -- v_me 可能是 null（本人還沒有名單上那一列）：null = uuid 是 null，not null 不會擋，所以要 coalesce。
  if not (public.rc_can_manage() or coalesce(v_person = v_me, false)) then raise exception 'not_records_manager' using errcode = 'P0001'; end if;
  if v_kind not in ('applied', 'admitted', 'enrolled', 'transferred', 'graduated', 'working', 'gap', 'other') then raise exception 'bad_kind' using errcode = 'P0001'; end if;
  if v_vis not in ('private', 'internal', 'aggregate', 'public') then raise exception 'bad_visibility' using errcode = 'P0001'; end if;
  -- 2026-12-02 隱私政策那一句：「可以連名字公開」只有本人自己勾得了，管的人替別人填不了 public；
  -- 而學員（people.kind = student，多半未滿 18 歲）的去向不管誰填都不能連名字公開。
  if v_vis = 'public' and (not coalesce(v_person = v_me, false) or exists (select 1 from public.people x where x.id = v_person and x.kind = 'student')) then
    raise exception 'public_needs_self' using errcode = 'P0001';
  end if;
  if p_outcome is null then
    insert into public.rc_outcomes (person_id, kind, institution, country, major, year, note, source, visibility, recorded_by)
    values (v_person, v_kind, coalesce(p->>'institution', ''), coalesce(p->>'country', ''), coalesce(p->>'major', ''), nullif(p->>'year', '')::int, coalesce(p->>'note', ''),
            case when v_person = v_me and not public.rc_can_manage() then 'self' when p->>'source' in ('self', 'mentorship', 'public', 'import') then p->>'source' else 'mentorship' end,
            v_vis, auth.uid())
    returning id into v_id;
  else
    update public.rc_outcomes set
      kind = case when p ? 'kind' then v_kind else kind end,
      institution = case when p ? 'institution' then coalesce(p->>'institution', '') else institution end,
      country = case when p ? 'country' then coalesce(p->>'country', '') else country end,
      major = case when p ? 'major' then coalesce(p->>'major', '') else major end,
      year = case when p ? 'year' then nullif(p->>'year', '')::int else year end,
      note = case when p ? 'note' then coalesce(p->>'note', '') else note end,
      visibility = case when p ? 'visibility' then v_vis else visibility end,
      recorded_by = auth.uid(), recorded_at = now()
     where id = p_outcome returning id into v_id;
  end if;
  return v_id;
end $$;

commit;

-- ---------- 驗收 ----------
select * from (
  with t as (
    select (select regexp_replace(prosrc, '--[^\n]*', '', 'g') like '%public_needs_self%' from pg_proc where proname = 'rc_save_outcome' and pronamespace = 'public'::regnamespace) as public_gate,
           (select regexp_replace(prosrc, '--[^\n]*', '', 'g') like '%rc_forget_rows%' from pg_proc where proname = 'delete_my_account' and pronamespace = 'public'::regnamespace) as delete_clears,
           (select regexp_replace(prosrc, '--[^\n]*', '', 'g') like '%cadre_must_ask%' from pg_proc where proname = 'delete_my_account' and pronamespace = 'public'::regnamespace) as delete_cadre,
           (select regexp_replace(prosrc, '--[^\n]*', '', 'g') like '%require_president()%' and regexp_replace(prosrc, '--[^\n]*', '', 'g') like '%has_account%' from pg_proc where proname = 'forget_person' and pronamespace = 'public'::regnamespace) as forget_rule,
           (select regexp_replace(prosrc, '--[^\n]*', '', 'g') like '%require_president()%' and regexp_replace(prosrc, '--[^\n]*', '', 'g') like '%offset 2%' from pg_proc where proname = 'rc_anonymise_old' and pronamespace = 'public'::regnamespace) as anon_rule,
           (select not has_function_privilege('anon', p.oid, 'execute') and not has_function_privilege('authenticated', p.oid, 'execute') from pg_proc p where p.proname = 'rc_forget_rows' and p.pronamespace = 'public'::regnamespace) as rows_private,
           (select not has_function_privilege('anon', p.oid, 'execute') and has_function_privilege('authenticated', p.oid, 'execute') from pg_proc p where p.proname = 'rc_anonymise_old' and p.pronamespace = 'public'::regnamespace) as anon_grant
  )
  select 0 ord, 'OVERALL' as 項目, null::text as 應該是, null::text as 實際是,
    case when public_gate and delete_clears and delete_cadre and forget_rule and anon_rule and rows_private and anon_grant then 'PASS' else 'FAIL' end as 結果 from t
  union all select 1, '★ 去向 public 只有本人、學員不行（public_needs_self）', 'true', public_gate::text, case when public_gate then 'PASS' else 'FAIL' end from t
  union all select 2, '★ 學員刪帳號一併清紀錄（rc_forget_rows）', 'true', delete_clears::text, case when delete_clears then 'PASS' else 'FAIL' end from t
  union all select 3, '幹部仍然不能自己刪帳號', 'true', delete_cadre::text, case when delete_cadre then 'PASS' else 'FAIL' end from t
  union all select 4, 'forget_person 仍然只有 Co-President、有帳號的先刪帳號', 'true', forget_rule::text, case when forget_rule then 'PASS' else 'FAIL' end from t
  union all select 5, '★ 轉匿名只有 Co-President、照第三屆的開始日算', 'true', anon_rule::text, case when anon_rule then 'PASS' else 'FAIL' end from t
  union all select 6, '★ 清紀錄那一支沒有人直接叫得到', 'true', rows_private::text, case when rows_private then 'PASS' else 'FAIL' end from t
  union all select 7, '轉匿名登入的人叫得到、anon 不行', 'true', anon_grant::text, case when anon_grant then 'PASS' else 'FAIL' end from t
) x order by ord;
