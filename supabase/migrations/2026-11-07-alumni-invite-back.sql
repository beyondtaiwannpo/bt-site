-- 把老幹部請回來：名單上沒有帳號的那一筆，直接寄邀請信　2026-11-07
--
-- 用法：整份貼進 Supabase SQL Editor 按一次 Run。可以重跑。最後印一張 PASS / FAIL 表。
-- **要先跑過 2026-11-06-history-milestones.sql**（順序照日期）。
--
-- Paul 2026-11-07 看了「校友碼與刪除紀錄」那一塊之後說搞不清楚：名單紀錄、登入帳號、邀請三件事混在一起，
-- 碼還要自己複製貼上給人。拍板四件：(1) 每一筆紀錄上一顆「寄邀請信請他回來」取代手抄的碼；
-- (2) 名單上勾一批人一次寄，一人一個狀態；(3) 邀請頁打了名字就掛到名單上已經有的那一筆，不再多建一筆重複的人；
-- (4) 校友登入後有一段歡迎。
--
-- ============================================================================
-- 這一支在做什麼
-- ============================================================================
--   1. people 多一欄 email（上次寄邀請信寄到哪，下次預填）；profiles 多一欄 alumni_welcome_dismissed_at（校友關掉歡迎卡的時間）。
--   2. invite_back(紀錄, email, 語言, 一句話)：對一筆沒有帳號的紀錄建一組綁 email 的校友碼（30 天、只能用一次、person_id 綁著），
--      用既有的 outbox 與「邀請信」文案排一封信。有帳號的擋、email 已經是別人的登入擋、
--      這一筆已經有一組活著的邀請就回那一組（existing = true）不再寄。門 require_senior（跟邀請一樣）。
--   3. invite_back_many(jsonb)：一次一批 [{person, email, lang}]，一列一個結果 {person, status, code 或 error}，一列壞了其他照寄。
--   4. roster_invites()：名單上每一筆沒有帳號的紀錄最近那一組邀請的狀態（queued / sent / failed / opened / claimed / expired / revoked）與時間。
--      刻意不改 roster() 的回傳欄位（改了要先 drop，重跑的風險比多一支函式大）。
--   5. invite_person() 多一個十三參數版（最後一個 p_person）：給了名字而名單上**剛好一筆**沒有帳號的人同名（中文或英文、不分大小寫），
--      就掛到那一筆，不再 insert 新的；同名好幾筆就 raise ambiguous_person:id1,id2 讓畫面問；
--      前端選定了就帶 p_person；要硬建新的一筆帶全零的 uuid。舊的十一與十二參數版改成包這一支。
--   6. delete_person()：綁著的邀請已經過期或撤銷的不再擋刪除（原本只看 uses_left）。roster() 的 pending_code 只算手發的碼（邀請信那組由 roster_invites() 講）。
--   7. dismiss_alumni_welcome()：本人關掉歡迎卡，寫時間。
--   8. role_changes.field 多一種 invite_back（單筆與批次都記）。
--
-- claim_invite() 一個字不動：這一支發的碼就是綁 email、綁紀錄的校友碼，認領時它本來就會把人變成校友、把紀錄與歷屆職位歸給他。
-- ⚠ 重跑 2026-10-29-invites.sql 會把 role_changes 的 field 限制建回沒有 invite_back 的版本，那時要再跑這一支。
-- ============================================================================

begin;

-- ---------- 1. 兩欄 ----------
alter table public.people add column if not exists email text;
comment on column public.people.email is '上一次寄邀請信寄到哪（小寫）。只是預填用，不是登入的 email；登入的 email 在 auth.users。';
alter table public.profiles add column if not exists alumni_welcome_dismissed_at timestamptz;
comment on column public.profiles.alumni_welcome_dismissed_at is '校友在設定頁按掉歡迎卡的時間。空的就還會看到那張卡（故事還沒填或還沒勾同意的時候）。';

-- ---------- 8. 變動紀錄多一種 ----------
alter table public.role_changes drop constraint if exists role_changes_field_check;
alter table public.role_changes add constraint role_changes_field_check
  check (field in ('board_role', 'team', 'name', 'role', 'position', 'assignment', 'removed', 'claimed', 'merged', 'term', 'invite', 'invite_back'));

-- ---------- 2. 請一個人回來 ----------
-- 回 jsonb：{ code, email, existing }。existing = true 表示這一筆已經有一組活著的邀請，回的是那一組，沒有再寄。
create or replace function public.invite_back(p_person uuid, p_email text, p_lang text, p_line text default null)
returns jsonb language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_lang  text := case when p_lang in ('zh', 'en') then p_lang else 'zh' end;
  v_profile uuid; v_code text; v_live text; v_name text;
begin
  perform public.require_senior();
  select profile_id into v_profile from people where id = p_person;
  if not found then raise exception 'no_such_person' using errcode = 'P0001'; end if;
  if v_profile is not null then raise exception 'person_has_account' using errcode = 'P0001'; end if;
  -- 這一筆已經有一組活著的邀請：回那一組，不再寄第二封。
  select code into v_live from invite_codes
   where person_id = p_person and email is not null and uses_left > 0 and revoked_at is null
     and (expires_at is null or expires_at > now())
   order by created_at desc limit 1;
  if v_live is not null then
    return jsonb_build_object('code', v_live, 'email', (select email from invite_codes where code = v_live), 'existing', true);
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'bad_email' using errcode = 'P0001'; end if;
  if exists (select 1 from auth.users where lower(email) = v_email) then
    raise exception 'email_has_account' using errcode = 'P0001';
  end if;
  -- 同一個 email 綁在別的紀錄上還活著：擋，不然兩筆紀錄搶同一個人。
  if exists (select 1 from invite_codes where lower(email) = v_email and uses_left > 0 and revoked_at is null
               and (expires_at is null or expires_at > now())) then
    raise exception 'invite_pending' using errcode = 'P0001';
  end if;
  loop
    v_code := 'bt-' || substr(md5(random()::text || clock_timestamp()::text), 1, 8);
    exit when not exists (select 1 from invite_codes where upper(btrim(code)) = upper(v_code));
  end loop;
  insert into invite_codes (code, uses_left, grants, note, person_id, email, rank, expires_at, invited_by, lang)
  values (v_code, 1, 'alumni', nullif(btrim(coalesce(p_line, '')), ''), p_person, v_email, null, now() + interval '30 days', auth.uid(), v_lang);
  update people set email = v_email where id = p_person;
  perform public.queue_invite_mail(v_code);
  update mail_outbox set lang = v_lang where invite_code = v_code and sent_at is null;
  v_name := public.person_name(p_person);
  perform public.log_change(null, v_name, 'invite_back', v_email, v_code);
  return jsonb_build_object('code', v_code, 'email', v_email, 'existing', false);
end $$;
revoke all on function public.invite_back(uuid, text, text, text) from public, anon;
grant execute on function public.invite_back(uuid, text, text, text) to authenticated;

-- ---------- 3. 一次一批 ----------
-- p_rows = [{ "person": uuid, "email": "...", "lang": "zh" }, …]。回 [{ person, status: sent | existing | error, code, email, error }, …]。
-- 每一列包在自己的 exception 區塊裡（plpgsql 的子交易）：一列壞了只有那一列回 error，前後的照寄。
create or replace function public.invite_back_many(p_rows jsonb)
returns jsonb language plpgsql security definer
set search_path = public, pg_temp
as $$
declare r jsonb; out jsonb := '[]'::jsonb; v jsonb; n_ok int := 0; n_all int := 0;
begin
  perform public.require_senior();
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then raise exception 'bad_rows' using errcode = 'P0001'; end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    n_all := n_all + 1;
    begin
      v := public.invite_back((r->>'person')::uuid, r->>'email', r->>'lang', r->>'line');
      out := out || jsonb_build_object('person', r->>'person', 'status', case when (v->>'existing')::boolean then 'existing' else 'sent' end,
                                        'code', v->>'code', 'email', v->>'email');
      if not (v->>'existing')::boolean then n_ok := n_ok + 1; end if;
    exception when others then
      out := out || jsonb_build_object('person', r->>'person', 'status', 'error', 'email', lower(btrim(coalesce(r->>'email', ''))), 'error', SQLERRM);
    end;
  end loop;
  if n_all > 1 then
    perform public.log_change(null, '批次邀請 ' || n_all || ' 位', 'invite_back', 'bulk', n_ok::text);
  end if;
  return out;
end $$;
revoke all on function public.invite_back_many(jsonb) from public, anon;
grant execute on function public.invite_back_many(jsonb) to authenticated;

-- ---------- 4. 名單上每一筆的邀請狀態 ----------
-- 只看綁著紀錄、有 email 的碼（邀請信與這一支發的），每一筆紀錄取最近的一組。手抄的批次碼不在這裡（那個 roster() 的 pending_code 還印）。
create or replace function public.roster_invites()
returns table (
  person_id uuid, code text, email text, lang text, status text,
  created_at timestamptz, sent_at timestamptz, opened_at timestamptz, claimed_at timestamptz,
  expires_at timestamptz, revoked_at timestamptz, mail_error text, invited_by_name text
) language sql security definer stable
set search_path = public, pg_temp
as $$
  select c.person_id, c.code, c.email, c.lang,
         case when u.user_id is not null then 'claimed'
              when c.revoked_at is not null then 'revoked'
              when c.expires_at is not null and c.expires_at <= now() then 'expired'
              when c.opened_at is not null then 'opened'
              when m.sent_at is not null then 'sent'
              when m.id is not null and m.tries >= 5 then 'failed'
              else 'queued' end,
         c.created_at, m.sent_at, c.opened_at, u.used_at, c.expires_at, c.revoked_at, m.error,
         (select coalesce(nullif(btrim(p.name_en), ''), nullif(btrim(p.name_zh), '')) from profiles p where p.id = c.invited_by)
    from invite_codes c
    left join lateral (select user_id, used_at from invite_uses x where x.code = c.code order by used_at desc limit 1) u on true
    left join lateral (select id, sent_at, error, tries from mail_outbox o where o.invite_code = c.code order by created_at desc limit 1) m on true
   where c.email is not null and c.person_id is not null and public.is_senior()
     and c.created_at = (select max(c2.created_at) from invite_codes c2 where c2.person_id = c.person_id and c2.email is not null)
   order by c.created_at desc;
$$;
revoke all on function public.roster_invites() from public, anon;
grant execute on function public.roster_invites() to authenticated;

-- ---------- 5. invite_person：掛到名單上已經有的那一筆 ----------
-- 十三個參數的版本是本體。p_person：
--   null             → 給了名字就找名單上沒有帳號、同名（中文或英文，不分大小寫）的紀錄：剛好一筆就掛上去，好幾筆就 raise ambiguous_person:id,id,…，沒有就建新的一筆。
--   某一筆的 id       → 掛到那一筆（要沒有帳號、沒有活著的邀請）。
--   全零的 uuid       → 一定建新的一筆（畫面上選了「不是，建新的」）。
create or replace function public.invite_person(
  p_email text, p_grants text, p_rank text,
  p_name_zh text, p_name_en text, p_title_en text, p_title_zh text, p_team text, p_term text,
  p_line text, p_note text, p_lang text, p_person uuid)
returns text language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_lang  text := case when p_lang in ('zh', 'en') then p_lang else 'zh' end;
  v_code text; v_person uuid; v_matches uuid[];
  v_zh text := nullif(btrim(coalesce(p_name_zh, '')), ''); v_en text := nullif(btrim(coalesce(p_name_en, '')), '');
  v_ten text := nullif(btrim(coalesce(p_title_en, '')), ''); v_tzh text := nullif(btrim(coalesce(p_title_zh, '')), '');
  v_team text := nullif(btrim(coalesce(p_team, '')), ''); v_term text := nullif(btrim(coalesce(p_term, '')), '');
  v_nil uuid := '00000000-0000-0000-0000-000000000000';
begin
  perform public.require_senior();
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'bad_email' using errcode = 'P0001'; end if;
  if p_grants is null or p_grants not in ('cadre', 'alumni', 'intern') then raise exception 'bad_grants' using errcode = 'P0001'; end if;
  if p_grants = 'cadre' and (p_rank is null or p_rank not in ('member', 'adviser', 'director', 'senior_adviser', 'president')) then
    raise exception 'bad_role' using errcode = 'P0001';
  end if;
  if exists (select 1 from invite_codes where lower(email) = v_email and uses_left > 0 and revoked_at is null
               and (expires_at is null or expires_at > now())) then
    raise exception 'invite_pending' using errcode = 'P0001';
  end if;
  if exists (select 1 from auth.users where lower(email) = v_email) then
    raise exception 'email_has_account' using errcode = 'P0001';
  end if;
  -- 名單紀錄：幹部與校友才進名單（實習生不進，10-23 的規矩）。
  if p_grants in ('cadre', 'alumni') then
    if p_person is not null and p_person <> v_nil then
      -- 畫面上選定了那一筆。
      if not exists (select 1 from people where id = p_person) then raise exception 'no_such_person' using errcode = 'P0001'; end if;
      if exists (select 1 from people where id = p_person and profile_id is not null) then raise exception 'person_has_account' using errcode = 'P0001'; end if;
      if exists (select 1 from invite_codes where person_id = p_person and uses_left > 0 and revoked_at is null
                   and (expires_at is null or expires_at > now())) then
        raise exception 'invite_pending' using errcode = 'P0001';
      end if;
      v_person := p_person;
    elsif p_person is null and (v_zh is not null or v_en is not null) then
      -- 沒選：名字對得上名單上沒有帳號的人就掛上去。
      select array_agg(id order by created_at) into v_matches from people
       where profile_id is null
         and ((v_en is not null and lower(btrim(coalesce(name_en, ''))) = lower(v_en))
           or (v_zh is not null and btrim(coalesce(name_zh, '')) = v_zh));
      if coalesce(array_length(v_matches, 1), 0) = 1 then
        v_person := v_matches[1];
        if exists (select 1 from invite_codes where person_id = v_person and uses_left > 0 and revoked_at is null
                     and (expires_at is null or expires_at > now())) then
          raise exception 'invite_pending' using errcode = 'P0001';
        end if;
      elsif coalesce(array_length(v_matches, 1), 0) > 1 then
        raise exception 'ambiguous_person:%', array_to_string(v_matches, ',') using errcode = 'P0001';
      end if;
    end if;
    if v_person is null and (v_zh is not null or v_en is not null or v_ten is not null) then
      insert into people (name_zh, name_en, note) values (v_zh, v_en, nullif(btrim(coalesce(p_note, '')), '')) returning id into v_person;
    end if;
    if v_person is not null then
      -- 掛上去的那一筆：名字空的補上、email 記下來；職位有給就加（同一屆同一個 team 已經有就不動）。
      update people set name_zh = coalesce(name_zh, v_zh), name_en = coalesce(name_en, v_en), email = v_email where id = v_person;
      if v_ten is not null or v_tzh is not null then
        if v_term is null then raise exception 'term_required' using errcode = 'P0001'; end if;
        if not exists (select 1 from terms where id = v_term) then raise exception 'no_such_term' using errcode = 'P0001'; end if;
        insert into positions (person_id, term_id, title_zh, title_en, team) values (v_person, v_term, coalesce(v_tzh, v_ten), coalesce(v_ten, v_tzh), v_team)
        on conflict (person_id, term_id, (coalesce(team, ''))) do nothing;
      end if;
    end if;
  end if;
  loop
    v_code := 'bt-' || substr(md5(random()::text || clock_timestamp()::text), 1, 8);
    exit when not exists (select 1 from invite_codes where upper(btrim(code)) = upper(v_code));
  end loop;
  insert into invite_codes (code, uses_left, grants, note, person_id, email, rank, expires_at, invited_by, lang)
  values (v_code, 1, p_grants, nullif(btrim(coalesce(p_line, '')), ''), v_person, v_email,
          case when p_grants = 'cadre' then p_rank end, now() + interval '30 days', auth.uid(), v_lang);
  perform public.queue_invite_mail(v_code);
  update mail_outbox set lang = v_lang where invite_code = v_code and sent_at is null;
  perform public.log_change(null, v_email, 'invite', null, v_code);
  return v_code;
end $$;
revoke all on function public.invite_person(text, text, text, text, text, text, text, text, text, text, text, text, uuid) from public, anon;
grant execute on function public.invite_person(text, text, text, text, text, text, text, text, text, text, text, text, uuid) to authenticated;

-- 舊的十二參數版（11-05）與十一參數版（10-29）改成包本體：行為一樣（含同名就掛上去）。
create or replace function public.invite_person(
  p_email text, p_grants text, p_rank text,
  p_name_zh text, p_name_en text, p_title_en text, p_title_zh text, p_team text, p_term text,
  p_line text, p_note text, p_lang text)
returns text language sql security definer
set search_path = public, pg_temp
as $$
  select public.invite_person(p_email, p_grants, p_rank, p_name_zh, p_name_en, p_title_en, p_title_zh, p_team, p_term, p_line, p_note, p_lang, null::uuid)
$$;
create or replace function public.invite_person(
  p_email text, p_grants text, p_rank text,
  p_name_zh text, p_name_en text, p_title_en text, p_title_zh text, p_team text, p_term text,
  p_line text, p_note text)
returns text language sql security definer
set search_path = public, pg_temp
as $$
  select public.invite_person(p_email, p_grants, p_rank, p_name_zh, p_name_en, p_title_en, p_title_zh, p_team, p_term, p_line, p_note, 'zh', null::uuid)
$$;

-- ---------- 6. delete_person：過期或撤銷的邀請不再擋 ----------
create or replace function public.delete_person(p_person uuid)
returns boolean language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_name text;
begin
  perform public.require_president();
  if exists (select 1 from people where id = p_person and profile_id is not null) then
    raise exception 'has_account' using errcode = 'P0001';
  end if;
  if exists (select 1 from invite_codes where person_id = p_person and uses_left > 0 and revoked_at is null
               and (expires_at is null or expires_at > now())) then
    raise exception 'has_unused_invite' using errcode = 'P0001';
  end if;
  v_name := public.person_name(p_person);
  delete from people where id = p_person;
  if not found then
    raise exception 'no_such_person' using errcode = 'P0001';
  end if;
  perform public.log_change(null, v_name, 'removed', 'record', p_person::text);
  return true;
end $$;
revoke all on function public.delete_person(uuid) from public, anon;
grant execute on function public.delete_person(uuid) to authenticated;

-- ---------- 6b. roster()：pending_code 只算手發的碼 ----------
-- 原本抓任何 uses_left > 0 的碼，邀請信那組（含過期的）也會被抓進去，名單上就同時印「過期」徽章跟「校友碼 xxx 還沒用」。
-- 現在只算沒綁 email 的手發碼；邀請信那組的狀態由 roster_invites() 講。回傳欄位一個都沒變。
create or replace function public.roster()
returns table (
  person_id uuid, profile_id uuid, name_zh text, name_en text, role text, board_role text, team text,
  positions jsonb, workspaces jsonb, note text, pending_code text, maybe_dup uuid[]
) language sql stable security definer
set search_path = public, pg_temp
as $$
  select pe.id, pe.profile_id,
         coalesce(pr.name_zh, pe.name_zh), coalesce(pr.name_en, pe.name_en),
         pr.role, pr.board_role, pr.team,
         coalesce((select jsonb_agg(jsonb_build_object('term', po.term_id, 'title_zh', po.title_zh, 'title_en', po.title_en, 'team', po.team)
                                    order by t.starts_on desc)
                     from positions po join terms t on t.id = po.term_id where po.person_id = pe.id), '[]'::jsonb),
         coalesce((select jsonb_agg(jsonb_build_object('id', a.workspace_id, 'level', a.level) order by a.workspace_id)
                     from assignments a where a.user_id = pe.profile_id), '[]'::jsonb),
         pe.note,
         (select c.code from invite_codes c where c.person_id = pe.id and c.uses_left > 0 and c.email is null and c.revoked_at is null limit 1),
         (select array_agg(o.id) from people o
           where o.id <> pe.id and pe.name_en is not null and lower(o.name_en) = lower(pe.name_en))
    from people pe left join profiles pr on pr.id = pe.profile_id
   where public.is_senior()
   order by (pr.role = 'cadre') desc nulls last, pr.board_role, coalesce(pr.name_en, pe.name_en);
$$;
revoke all on function public.roster() from public, anon;
grant execute on function public.roster() to authenticated;

-- ---------- 7. 校友關掉歡迎卡 ----------
create or replace function public.dismiss_alumni_welcome()
returns timestamptz language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v timestamptz := now();
begin
  if auth.uid() is null then raise exception 'not_signed_in' using errcode = 'P0001'; end if;
  update profiles set alumni_welcome_dismissed_at = coalesce(alumni_welcome_dismissed_at, v) where id = auth.uid() returning alumni_welcome_dismissed_at into v;
  return v;
end $$;
revoke all on function public.dismiss_alumni_welcome() from public, anon;
grant execute on function public.dismiss_alumni_welcome() to authenticated;

commit;

select * from (
  with cols as (
    select (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'people' and column_name = 'email')
         + (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'alumni_welcome_dismissed_at') as n
  ), fn as (
    select p.proname, p.pronargs, regexp_replace(p.prosrc, '--[^\n]*', '', 'g') as body,
           (select count(*) from aclexplode(p.proacl) x where x.grantee = 'anon'::regrole and x.privilege_type = 'EXECUTE') as anon_exec
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname in ('invite_back', 'invite_back_many', 'roster_invites', 'dismiss_alumni_welcome', 'invite_person', 'delete_person', 'roster')
  ), ck as (
    select (select pg_get_constraintdef(oid) from pg_constraint where conname = 'role_changes_field_check') like '%''invite_back''%' as ok
  )
  select 0 ord, 'OVERALL' as 項目, null::text as 應該是, null::text as 實際是,
    case when (select n from cols) = 2
          and (select count(*) from fn where proname = 'invite_person' and pronargs = 13) = 1
          and (select count(*) from fn where proname in ('invite_back', 'invite_back_many', 'roster_invites', 'dismiss_alumni_welcome')) = 4
          and (select body like '%require_senior()%' and body like '%person_has_account%' and body like '%email_has_account%' and body like '%existing%' from fn where proname = 'invite_back')
          and (select body like '%require_senior()%' and body like '%exception when others%' from fn where proname = 'invite_back_many')
          and (select body like '%ambiguous_person%' and body like '%profile_id is null%' from fn where proname = 'invite_person' and pronargs = 13)
          and (select body like '%public.is_senior()%' from fn where proname = 'roster_invites')
          and (select body like '%revoked_at is null%' from fn where proname = 'delete_person')
          and (select body like '%c.email is null%' from fn where proname = 'roster')
          and (select ok from ck)
          and (select coalesce(sum(anon_exec), 0) from fn) = 0
    then 'PASS' else 'FAIL' end as 結果
  union all select 1, '★ people.email 與 profiles.alumni_welcome_dismissed_at 兩欄都在', '2', (select n from cols)::text, case when (select n from cols) = 2 then 'PASS' else 'FAIL' end
  union all select 2, '★ invite_back 的門是 require_senior，有帳號擋、email 已是登入擋、活著的邀請回同一組', 'true',
    coalesce((select (body like '%require_senior()%' and body like '%person_has_account%' and body like '%email_has_account%' and body like '%existing%')::text from fn where proname = 'invite_back'), '（函式不在）'),
    case when (select body like '%require_senior()%' and body like '%person_has_account%' and body like '%email_has_account%' and body like '%existing%' from fn where proname = 'invite_back') then 'PASS' else 'FAIL' end
  union all select 3, '★ invite_back_many 一列一個結果（有 exception 區塊）', 'true',
    coalesce((select (body like '%require_senior()%' and body like '%exception when others%')::text from fn where proname = 'invite_back_many'), '（函式不在）'),
    case when (select body like '%require_senior()%' and body like '%exception when others%' from fn where proname = 'invite_back_many') then 'PASS' else 'FAIL' end
  union all select 4, '★ invite_person 十三參數版在，同名掛上去、好幾筆就問（ambiguous_person）', 'true',
    coalesce((select (body like '%ambiguous_person%' and body like '%profile_id is null%')::text from fn where proname = 'invite_person' and pronargs = 13), '（函式不在）'),
    case when (select body like '%ambiguous_person%' and body like '%profile_id is null%' from fn where proname = 'invite_person' and pronargs = 13) then 'PASS' else 'FAIL' end
  union all select 5, 'roster_invites 的門是 is_senior', 'true', coalesce((select (body like '%public.is_senior()%')::text from fn where proname = 'roster_invites'), '（函式不在）'),
    case when (select body like '%public.is_senior()%' from fn where proname = 'roster_invites') then 'PASS' else 'FAIL' end
  union all select 6, 'delete_person 只被活著的邀請擋', 'true', coalesce((select (body like '%revoked_at is null%')::text from fn where proname = 'delete_person'), '（函式不在）'),
    case when (select body like '%revoked_at is null%' from fn where proname = 'delete_person') then 'PASS' else 'FAIL' end
  union all select 9, 'roster() 的 pending_code 只算手發的碼', 'true', coalesce((select (body like '%c.email is null%')::text from fn where proname = 'roster'), '（函式不在）'),
    case when (select body like '%c.email is null%' from fn where proname = 'roster') then 'PASS' else 'FAIL' end
  union all select 7, '變動紀錄的 field 收 invite_back', 'true', (select ok::text from ck), case when (select ok from ck) then 'PASS' else 'FAIL' end
  union all select 8, '★ 沒登入的人叫不動任何一支', '0', (select coalesce(sum(anon_exec), 0)::text from fn), case when (select coalesce(sum(anon_exec), 0) from fn) = 0 then 'PASS' else 'FAIL' end
) t order by ord;
