-- 幹部招募：錄取了就寄邀請（2026-11-26）。
--
-- Paul 的原話（看著後台「專案」底下的「計畫與招募」與「各 team」）：
--   「when I first designed this, I had that program and recruitment to recruit our board member. Like, it should be a separated form…
--    it's kind of different than the usual event people sign up with. It's recruiting for our board members… is there a better way to do what I said, the board recruitment stuff?」
-- Claude 建議把幹部招募搬到「人與權限」底下自己一頁，錄取之後接到寄邀請。問他錄取要接到哪裡，他選「Fully automatic」：
--   錄取的那一下，邀請碼建好、邀請信寄出去，一步做完。
--
-- 這一支做什麼：兩支新的函式，都只有 Co-President 與 Senior Adviser 叫得動（require_senior，跟原本寄邀請的 invite_person 同一道門）。
--   1. recruit_invite(申請的 id 們, 設定)：對每一筆「幹部招募表單、已經錄取」的申請，建一組綁著他 email 的邀請碼、排一封邀請信。
--      設定是 { rank, title_en, title_zh, team, term, lang }：職級只收 member、adviser、director（更高的照舊去「邀請新的人」那一頁）；
--      有給職稱就一定要給屆別，會在名單上先放好那一屆的職位。
--      回 { sent: 幾封, skipped: [{ id, why }] }。一筆有狀況只跳過那一筆、講原因，不會整批失敗。
--   2. recruit_status(表單)：那一份表單每一筆已經錄取的申請，邀請現在是哪一種：joined（已經是幹部）、pending（邀請還有效）、
--      expired（寄過，過期或撤銷了）、on_roster（名單上已經有他，要從名單處理）、none（還沒寄）。
--
-- 跟 invite_person 不一樣的地方只有一個，講清楚：
--   **申請的人本來就有帳號**（要登入才能送申請），invite_person 遇到已經有帳號的 email 會擋（email_has_account）。
--   這一支不擋：碼綁著他的 email，他登入之後用那一組碼把自己的帳號升成幹部（claim_invite 本來就是這樣做的，那一支沒有動）。
--
-- 誰看得到什麼、誰做得了什麼，改了的與沒改的：
--   - **誰能寄邀請沒有變**：還是只有 Co-President 與 Senior Adviser。審申請的人（form_can_edit 那份表單）錄取得了，但寄不了邀請；
--     他們錄取的人會停在「還沒寄邀請」，等 Co-President 或 Senior Adviser 按。
--   - **只認幹部招募的表單**（forms.kind = 'board'）而且**只認已經錄取的申請**。活動報名表、給高中生的計畫，錄取了也不會寄邀請（not_recruitment）。
--   - 邀請碼的規矩跟原本一樣：一組用一次、30 天到期、綁 email（別的帳號用不了）、可以在「邀請新的人」那一頁撤銷或重寄。
--   - 人只有在自己登入、用了那一組碼之後才變成幹部。這一支不直接改任何人的角色。
--   - 名單（people）：他的 email 對得上名單裡一筆還沒有帳號的紀錄就掛上去（例如以前參加過活動的學員），對不上就建新的一筆；
--     他的帳號已經在名單上（例如校友）就跳過，回 on_roster，那一種要從名單那一頁處理。
--   - 沒有新的表、沒有新的欄位、沒有動 RLS。decide_applications、invite_person、claim_invite、queue_invite_mail 一行都沒改。
--
-- 可以重跑。跑完看最後那張表，每一列都要是 PASS。

begin;

-- ---------- 1. 錄取的申請 → 邀請碼加邀請信 ----------
create or replace function public.recruit_invite(p_ids uuid[], p jsonb)
returns jsonb language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_rank text := coalesce(nullif(btrim(coalesce(p->>'rank', '')), ''), 'member');
  v_ten  text := nullif(btrim(coalesce(p->>'title_en', '')), '');
  v_tzh  text := nullif(btrim(coalesce(p->>'title_zh', '')), '');
  v_team text := nullif(btrim(coalesce(p->>'team', '')), '');
  v_term text := nullif(btrim(coalesce(p->>'term', '')), '');
  v_lang text := case when p->>'lang' in ('zh', 'en') then p->>'lang' else 'zh' end;
  r record; v_email text; v_role text; v_person uuid; v_matches uuid[]; v_code text; v_zh text; v_en text;
  v_sent int := 0; v_skipped jsonb := '[]'::jsonb; v_id uuid;
begin
  perform public.require_senior();
  if v_rank not in ('member', 'adviser', 'director') then raise exception 'bad_role' using errcode = 'P0001'; end if;
  if v_ten is not null or v_tzh is not null then
    if v_term is null then raise exception 'term_required' using errcode = 'P0001'; end if;
    if not exists (select 1 from terms where id = v_term) then raise exception 'no_such_term' using errcode = 'P0001'; end if;
  end if;
  if coalesce(array_length(p_ids, 1), 0) = 0 then return jsonb_build_object('sent', 0, 'skipped', v_skipped); end if;
  if array_length(p_ids, 1) > 100 then raise exception 'too_many' using errcode = 'P0001'; end if;

  foreach v_id in array p_ids loop
    select a.id, a.user_id, a.applicant_name, a.applicant_email, a.status, f.kind, f.team as form_team
      into r from applications a join forms f on f.id = a.form_id where a.id = v_id;
    if r.id is null then v_skipped := v_skipped || jsonb_build_object('id', v_id, 'why', 'no_such_application'); continue; end if;
    -- 不是幹部招募的表單：整批擋，這是按錯地方，不是某一筆有狀況。
    if r.kind is distinct from 'board' then raise exception 'not_recruitment' using errcode = 'P0001'; end if;
    if r.status <> 'accepted' then v_skipped := v_skipped || jsonb_build_object('id', v_id, 'why', 'not_accepted'); continue; end if;
    v_email := lower(btrim(coalesce(r.applicant_email, '')));
    if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then v_skipped := v_skipped || jsonb_build_object('id', v_id, 'why', 'bad_email'); continue; end if;
    select role into v_role from profiles where id = r.user_id;
    if v_role = 'cadre' then v_skipped := v_skipped || jsonb_build_object('id', v_id, 'why', 'already_cadre'); continue; end if;
    if exists (select 1 from invite_codes where lower(email) = v_email and uses_left > 0 and revoked_at is null
                 and (expires_at is null or expires_at > now())) then
      v_skipped := v_skipped || jsonb_build_object('id', v_id, 'why', 'invite_pending'); continue;
    end if;
    -- 他的帳號已經在名單上（校友）：claim_invite 掛不上第二筆，交給名單那一頁。
    if r.user_id is not null and exists (select 1 from people where profile_id = r.user_id) then
      v_skipped := v_skipped || jsonb_build_object('id', v_id, 'why', 'on_roster'); continue;
    end if;
    -- 名單紀錄：email 對得上一筆還沒有帳號的就掛上去；兩筆以上不猜；沒有就建新的。
    select array_agg(id order by created_at) into v_matches from people
     where profile_id is null and forgotten_at is null and lower(btrim(coalesce(email, ''))) = v_email;
    if coalesce(array_length(v_matches, 1), 0) > 1 then
      v_skipped := v_skipped || jsonb_build_object('id', v_id, 'why', 'ambiguous_person'); continue;
    end if;
    select nullif(btrim(coalesce(name_zh, '')), ''), nullif(btrim(coalesce(name_en, '')), '') into v_zh, v_en from profiles where id = r.user_id;
    if v_zh is null and v_en is null then
      -- 帳號上沒有名字：用申請表上填的那一個。有中文字就當中文名，不然當英文名。
      if coalesce(r.applicant_name, '') ~ '[一-鿿]' then v_zh := nullif(btrim(r.applicant_name), ''); else v_en := nullif(btrim(coalesce(r.applicant_name, '')), ''); end if;
    end if;
    if coalesce(array_length(v_matches, 1), 0) = 1 then
      v_person := v_matches[1];
      update people set name_zh = coalesce(name_zh, v_zh), name_en = coalesce(name_en, v_en) where id = v_person;
    else
      insert into people (name_zh, name_en, email) values (v_zh, v_en, v_email) returning id into v_person;
    end if;
    if v_ten is not null or v_tzh is not null then
      insert into positions (person_id, term_id, title_zh, title_en, team)
      values (v_person, v_term, coalesce(v_tzh, v_ten), coalesce(v_ten, v_tzh), coalesce(v_team, nullif(btrim(coalesce(r.form_team, '')), '')))
      on conflict (person_id, term_id, (coalesce(team, ''))) do nothing;
    end if;
    loop
      v_code := 'bt-' || substr(md5(random()::text || clock_timestamp()::text), 1, 8);
      exit when not exists (select 1 from invite_codes where upper(btrim(code)) = upper(v_code));
    end loop;
    insert into invite_codes (code, uses_left, grants, note, person_id, email, rank, expires_at, invited_by, lang)
    values (v_code, 1, 'cadre', null, v_person, v_email, v_rank, now() + interval '30 days', auth.uid(), v_lang);
    perform public.queue_invite_mail(v_code);
    update mail_outbox set lang = v_lang where invite_code = v_code and sent_at is null;
    perform public.log_change(null, v_email, 'invite', null, v_code);
    v_sent := v_sent + 1;
  end loop;
  return jsonb_build_object('sent', v_sent, 'skipped', v_skipped);
end $$;
revoke all on function public.recruit_invite(uuid[], jsonb) from public, anon;
grant execute on function public.recruit_invite(uuid[], jsonb) to authenticated;

-- ---------- 2. 那一份表單每一筆已經錄取的申請，邀請現在是哪一種 ----------
create or replace function public.recruit_status(p_form uuid)
returns jsonb language plpgsql stable security definer
set search_path = public, pg_temp
as $$
begin
  perform public.require_senior();
  if not exists (select 1 from forms where id = p_form and kind = 'board') then raise exception 'not_recruitment' using errcode = 'P0001'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', a.id, 'state',
      case
        when (select pr.role from profiles pr where pr.id = a.user_id) = 'cadre' then 'joined'
        when exists (select 1 from invite_codes c where lower(c.email) = lower(btrim(a.applicant_email)) and c.uses_left > 0 and c.revoked_at is null
                       and (c.expires_at is null or c.expires_at > now())) then 'pending'
        when a.user_id is not null and exists (select 1 from people pe where pe.profile_id = a.user_id) then 'on_roster'
        when exists (select 1 from invite_codes c where lower(c.email) = lower(btrim(a.applicant_email))) then 'expired'
        else 'none' end) order by a.submitted_at, a.id)
      from applications a where a.form_id = p_form and a.status = 'accepted'), '[]'::jsonb);
end $$;
revoke all on function public.recruit_status(uuid) from public, anon;
grant execute on function public.recruit_status(uuid) to authenticated;

commit;

-- ---------- 驗收 ----------
select * from (
  with fn as (select proname, oid, regexp_replace(prosrc, '--[^\n]*', '', 'g') as body from pg_proc where pronamespace = 'public'::regnamespace),
  t as (
    select
      (select body like '%perform public.require_senior();%' from fn where proname = 'recruit_invite')
        and (select body like '%perform public.require_senior();%' from fn where proname = 'recruit_status') as senior_ok,
      (select body like '%if r.kind is distinct from ''board'' then raise exception ''not_recruitment''%'
              and body like '%if r.status <> ''accepted'' then%''not_accepted''%' from fn where proname = 'recruit_invite') as scope_ok,
      (select body like '%if v_rank not in (''member'', ''adviser'', ''director'') then raise exception ''bad_role''%' from fn where proname = 'recruit_invite') as rank_ok,
      (select body like '%values (v_code, 1, ''cadre'', null, v_person, v_email, v_rank, now() + interval ''30 days'', auth.uid(), v_lang);%'
              and body like '%perform public.queue_invite_mail(v_code);%' from fn where proname = 'recruit_invite') as code_ok,
      (select body not like '%update profiles%' and body not like '%insert into profiles%' and body not like '%assignments%' from fn where proname = 'recruit_invite') as no_role_write,
      (select body like '%''already_cadre''%' and body like '%''invite_pending''%' and body like '%''on_roster''%' and body like '%''ambiguous_person''%' from fn where proname = 'recruit_invite') as skips_ok,
      (select count(*) from fn where proname in ('recruit_invite', 'recruit_status') and has_function_privilege('anon', oid, 'execute')) = 0
        and (select count(*) from fn where proname in ('recruit_invite', 'recruit_status') and has_function_privilege('authenticated', oid, 'execute')) = 2 as grants_ok,
      (select bool_or(body like '%perform public.require_senior();%' and body like '%raise exception ''email_has_account''%') from fn where proname = 'invite_person') as invite_person_untouched,
      (select body like '%if not public.form_can_edit(r.form_id) then%' and body not like '%recruit_invite%' and body not like '%invite_codes%' from fn where proname = 'decide_applications') as decide_untouched,
      (select body like '%if v_bound is distinct from v_mine then%' from fn where proname = 'claim_invite') as claim_untouched,
      (select count(*)::int from public.forms where kind = 'board') as board_forms
  )
  select 0 ord, 'OVERALL' as 項目, null::text as 應該是, null::text as 實際是,
    case when senior_ok and scope_ok and rank_ok and code_ok and no_role_write and skips_ok and grants_ok and invite_person_untouched and decide_untouched and claim_untouched then 'PASS' else 'FAIL' end as 結果 from t
  union all select 1, '★ 兩支都只有 Co-President 與 Senior Adviser 叫得動（誰能寄邀請沒有變）', 'true', coalesce(senior_ok, false)::text, case when senior_ok then 'PASS' else 'FAIL' end from t
  union all select 2, '★ 只認幹部招募的表單，而且只認已經錄取的申請', 'true', coalesce(scope_ok, false)::text, case when scope_ok then 'PASS' else 'FAIL' end from t
  union all select 3, '★ 職級只收 member、adviser、director', 'true', coalesce(rank_ok, false)::text, case when rank_ok then 'PASS' else 'FAIL' end from t
  union all select 4, '邀請碼的規矩跟原本一樣：一組一次、30 天、綁 email，信走原本那一支', 'true', coalesce(code_ok, false)::text, case when code_ok then 'PASS' else 'FAIL' end from t
  union all select 5, '★ 這一支不直接改任何人的角色、職級、工作區（本人用了碼才會變）', 'true', coalesce(no_role_write, false)::text, case when no_role_write then 'PASS' else 'FAIL' end from t
  union all select 6, '已經是幹部、邀請還有效、已經在名單上、對到兩筆紀錄：各自跳過並講原因', 'true', coalesce(skips_ok, false)::text, case when skips_ok then 'PASS' else 'FAIL' end from t
  union all select 7, '★ 沒登入的人兩支都叫不到', 'true', coalesce(grants_ok, false)::text, case when grants_ok then 'PASS' else 'FAIL' end from t
  union all select 8, '原本寄邀請那一支沒有動（已經有帳號的 email 照舊擋）', 'true', coalesce(invite_person_untouched, false)::text, case when invite_person_untouched then 'PASS' else 'FAIL' end from t
  union all select 9, '錄取那一支沒有動（它不會自己寄邀請）', 'true', coalesce(decide_untouched, false)::text, case when decide_untouched then 'PASS' else 'FAIL' end from t
  union all select 10, '用邀請碼那一支沒有動（email 對不上照舊擋）', 'true', coalesce(claim_untouched, false)::text, case when claim_untouched then 'PASS' else 'FAIL' end from t
  union all select 11, '（數字）現在有幾份幹部招募的表單', '', board_forms::text, 'INFO' from t
) x order by ord;
