-- 個人連結填完，就有一個帳號，而且就是名單上那一個人　2027-01-25（寫於 2026-11-27）
--
-- 用法：整份貼進 Supabase SQL Editor 按一次 Run。可以重跑，不動既有資料。最後印一張 PASS / FAIL 表，每一列都要是 PASS。
-- **接在 2027-01-24-whole-bt-tools.sql 後面跑**（順序照日期）。
--
-- Paul 2026-11-27 的原話：
--   「once they fill out the form, they should get their account. They should be able to come to our website, use that account,
--    and log in, and then continue editing their story and updating their profile and everything, and especially their email…
--    we can use their email, and then they can log in using their email, and later on in the future we can use their email to reach them.」
--   看完提案說照建議做，再加一句：
--   「the link that they have is because we have a record in our databases, and their account should be linked to that databases,
--    and they can just edit that profile… I don't want them to be creating another account or another person just appearing in
--    our databases and now there's two person. No, it's that account.」
--
-- ============================================================================
-- 這一支在做什麼
-- ============================================================================
--   1. 帳號多一種身分 connection（畫面叫「BT 的朋友」）：講者、教授、招生官、以前的 mentee 這些在 BT 外面的人。
--      登得進來、改得動自己的檔案與故事、看得到公開的活動，**沒有後台、沒有任何工作區**。is_cadre() 不認它，所以每一條幹部的門照舊擋。
--      profiles.role、invite_codes.grants、invite_uses.grants 三個清單各多一個值（讀現在的清單再加，原本的一個都不拿掉）。
--   2. rc_public_profile_account(連結, 語言)：沒登入也叫得動（拿連結的人）。存過一次之後，畫面叫它一次：
--      - 這個人在名單上已經有帳號 → has_account（叫他登入就好）。
--      - 名單上這個人沒有 email → no_email。
--      - 這個 email 已經有帳號、而那個帳號已經是名單上**另一個人** → login，記一筆給管紀錄的人合併（不自動合併、不新增任何一列）。
--      - 其他 → 建一組**綁著這個人、綁著這個 email** 的邀請碼（30 天、用一次），寄一封信，回那組碼（畫面上有一顆馬上開帳號的鈕）。
--        同一個 email 已經有一組活著的就回那一組、不再寄。一個人一天最多開三組（擋拿連結的人拿來亂寄信）。
--      email 永遠是名單上這個人自己的那個（他在連結上填的優先），所以回的東西不會洩漏任何別人的資料。
--   3. claim_invite() 多一個分支：grants = connection 的碼走 rc_claim_connection()。它跟原本那條路差在一件事：
--      **它不新增、不刪除名單上的任何一列。** 登入的帳號接到碼上的那一個人；帳號已經是名單上另一個人的話，
--      碼不燒、什麼都不接，記一筆 profile_account_conflict，回 record_conflict（畫面說 BT 會幫他合併）。
--      身分：本來是幹部、校友、實習生、BT 的朋友就不動；剛註冊（student）的變成 BT 的朋友，
--      名單上這個人以前當過幹部（有職位）就變成校友（跟 2026-10-23 的定義一樣）；已經送過申請的學員維持學員。
--   4. rc_my_profile_link()：登入的人拿自己的那一條個人連結（沒有活著的就開一條新的），/profile/ 登入之後用它，
--      所以登入之後改的是同一份表單、同一個人，不是另一份。幹部不走這條（他們的東西在 /settings/），還在念高中的學員也不行（跟開連結同一道門）。
--   5. 信：mail_outbox 與 mail_templates 的種類多一個 profile_account，預設文案一列（後台「信件文案」改得動，重跑不蓋掉），
--      mail_button_url 多一行（按鈕連到 /app/?invite=碼&lang=語言）。照片、語言、寄送都走原本那一套，send_pending_mail 一個字沒動。
--   6. rc_profile_to_people（新帳號自動進名單的 trigger）多認 connection。它本來就先用 email 對名單上已經有的那一列，對到就接上，不另開一列。
--
-- 誰看得到什麼，改了的與沒改的：
--   - **沒有新的表、沒有動任何一條 RLS 政策**，people、rc_profiles 的讀寫照舊只走函式。
--   - 拿連結的人多拿到的只有：他自己的 email（連結上本來就讀得到）、一組綁著那個 email 的邀請碼（只有用那個 email 登入的人用得了）。
--   - 寄信：只寄到名單上這個人自己的 email，一個人一組碼只寄一封。
--
-- ⚠ 重跑順序：這一支重新定義了 claim_invite（2026-10-29）、rc_profile_to_people（2026-12-05）、mail_button_url（2026-12-21）。
--   之後重跑那三支其中一支，要再跑一次這一支。重跑 2026-10-16-intern-role.sql 會因為已經有 connection 的帳號而失敗（這是好事：它會把這種身分拿掉）。
-- ============================================================================

begin;

-- ---------- 1. 身分多一種 connection（讀現在的清單再加一個） ----------
do $$
declare t record; v_def text; v_vals text[];
begin
  for t in select * from (values ('public.profiles', 'profiles_role_check', 'role'),
                                 ('public.invite_codes', 'invite_codes_grants_check', 'grants'),
                                 ('public.invite_uses', 'invite_uses_grants_check', 'grants')) x(tbl, con, col) loop
    select pg_get_constraintdef(oid) into v_def from pg_constraint where conrelid = t.tbl::regclass and conname = t.con;
    continue when v_def like '%''connection''%';
    select coalesce(array_agg(distinct m[1]), '{}') into v_vals from regexp_matches(coalesce(v_def, ''), '''([a-z_]+)''', 'g') m;
    if v_def is not null then execute format('alter table %s drop constraint %I', t.tbl, t.con); end if;
    execute format('alter table %s add constraint %I check (%I in (%s))', t.tbl, t.con, t.col,
      (select string_agg(quote_literal(k), ', ' order by k) from unnest(v_vals || array['connection']) k));
  end loop;
end $$;
comment on column public.profiles.role is
  '平台身分：cadre 幹部 / student 學員 / alumni 校友 / intern 實習生（2026-10-16）/ connection BT 的朋友（2027-01-25，個人連結開出來的帳號）。
   自己註冊出來一律是 student，拿邀請碼呼叫 claim_invite() 才會變。前端改不動這一欄。';

-- ---------- 2. 信的種類多一個 profile_account（讀現在的清單再加一個，原本的一種都不拿掉） ----------
do $$
declare t record; v_name text; v_def text; v_kinds text[];
begin
  for t in select * from (values ('public.mail_outbox', 'mail_outbox_kind_check'), ('public.mail_templates', 'mail_templates_kind_check')) x(tbl, con) loop
    select conname, pg_get_constraintdef(oid) into v_name, v_def from pg_constraint
     where conrelid = t.tbl::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%kind%' limit 1;
    continue when v_def like '%''profile_account''%';
    select coalesce(array_agg(distinct m[1]), '{}') into v_kinds from regexp_matches(coalesce(v_def, ''), '''([a-z_]+)''', 'g') m;
    if v_name is not null then execute format('alter table %s drop constraint %I', t.tbl, v_name); end if;
    execute format('alter table %s add constraint %I check (kind in (%s))', t.tbl, t.con,
      (select string_agg(quote_literal(k), ', ' order by k) from unnest(v_kinds || array['profile_account']) k));
  end loop;
end $$;

-- 預設文案。on conflict do nothing：重跑不會蓋掉 Co-President 在後台改過的字。{name} 是名單上的名字，{link} 是開帳號的連結。
insert into public.mail_templates (kind, subject_zh, body_zh, subject_en, body_en, button_label, button_label_en) values
('profile_account',
 '你的 Beyond Taiwan 帳號：用這個 email 登入',
 '{name} 你好，' || E'\n\n' ||
 '謝謝你填了 BT 的個人檔案。我們用你留的這個 email 幫你開好一個帳號，之後想改檔案、補你的故事、看 BT 最近在做什麼，登入就好，不用再等我們傳連結給你。' || E'\n\n' ||
 '按下面的按鈕，用收到這封信的 email 登入，第一次會請你設一組密碼（用 Google 登入也可以，選同一個 email）。這個連結 30 天內有效，只有你用得了。' || E'\n\n' ||
 '{link}',
 'Your Beyond Taiwan account: sign in with this email',
 'Hi {name},' || E'\n\n' ||
 'Thanks for filling in your BT profile. We set up an account for the email you gave us, so you can sign in any time to update your profile, add to your story and see what BT is up to, without waiting for us to send you a link.' || E'\n\n' ||
 'Use the button below and sign in with the email this was sent to; the first time, you will set a password (Google sign-in works too, pick the same email). The link works for 30 days and only for you.' || E'\n\n' ||
 '{link}',
 '開我的帳號', 'Set up my account')
on conflict (kind) do nothing;

-- 按鈕連到哪：2026-12-21 那一版一字不差，多 profile_account 一行。
create or replace function public.mail_button_url(r public.mail_outbox)
returns text language sql stable
set search_path = public, pg_temp
as $$
  select case
    when r.kind = 'invite' and r.invite_code is not null then 'https://beyondtaiwannpo.com/app/?invite=' || r.invite_code
    when r.kind = 'profile_account' and r.invite_code is not null then 'https://beyondtaiwannpo.com/app/?invite=' || r.invite_code || case when r.lang = 'en' then '&lang=en' else '&lang=zh' end
    when r.kind in ('meeting_invite', 'meeting_reminder', 'meeting_summary', 'meeting_update') and r.meeting_id is not null then 'https://beyondtaiwannpo.com/home/?meeting=' || r.meeting_id::text
    when r.kind = 'request_new' and r.request_id is not null then 'https://beyondtaiwannpo.com/admin/#requests/' || r.request_id::text
    when r.kind in ('request_done', 'request_rejected') and r.request_id is not null then 'https://beyondtaiwannpo.com/admin/#request/' || r.request_id::text
    when r.kind = 'interview' and r.form_id is not null then coalesce((select f.interview_url from forms f where f.id = r.form_id), 'https://beyondtaiwannpo.com/apply/')
    when r.kind = 'received' then 'https://beyondtaiwannpo.com/app/'
    when r.kind in ('accepted', 'rejected', 'notice', 'guardian') then 'https://beyondtaiwannpo.com/apply/'
    else '' end
$$;

-- 排一封開帳號的信。內部用，前端叫不到。文案讀 mail_templates 的 profile_account，讀不到就用寫死的那一份。
create or replace function public.rc_queue_account_mail(p_code text)
returns uuid language plpgsql security definer
set search_path = public, pg_temp
as $$
declare c record; v_name text; v_sub text; v_body text; v_link text; v_id uuid;
begin
  select * into c from invite_codes where code = p_code;
  if c.email is null or c.grants <> 'connection' then raise exception 'not_an_account_invite' using errcode = 'P0001'; end if;
  select coalesce(nullif(btrim(pe.name_zh), ''), nullif(btrim(pe.name_en), ''), '') into v_name from people pe where pe.id = c.person_id;
  -- 帶語言：登入那一頁跟他填連結時用的語言一樣（/app/ 沒有 ?lang= 就是英文）。
  v_link := 'https://beyondtaiwannpo.com/app/?invite=' || c.code || case when c.lang = 'en' then '&lang=en' else '&lang=zh' end;
  select subject, body into v_sub, v_body from mail_templates where kind = 'profile_account';
  if v_sub is null then v_sub := '你的 Beyond Taiwan 帳號'; v_body := '{name} 你好，' || E'\n\n' || '用收到這封信的 email 登入：' || E'\n\n' || '{link}'; end if;
  v_sub  := public.invite_fill(v_sub, v_name, '', '', v_link, 'Beyond Taiwan');
  v_body := public.invite_fill(v_body, v_name, '', '', v_link, 'Beyond Taiwan') || public.mail_tail('profile_account');
  insert into mail_outbox (to_email, subject, body, kind, invite_code, lang)
  values (c.email, v_sub, v_body, 'profile_account', c.code, c.lang) returning id into v_id;
  return v_id;
end $$;
revoke all on function public.rc_queue_account_mail(text) from public, anon, authenticated;

-- ---------- 3. 新帳號自動進名單：多認 connection（2026-12-05 那一版只多這一個字） ----------
-- rc_ensure_person 先用登入的 email 對名單上已經有的那一列，對到就接上，不另開一列。
create or replace function public.rc_profile_to_people()
returns trigger language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if new.role in ('cadre', 'alumni', 'intern', 'connection') then perform public.rc_ensure_person(new.id); end if;
  return new;
end $$;
drop trigger if exists rc_profile_to_people on public.profiles;
create trigger rc_profile_to_people after insert or update of role on public.profiles for each row execute function public.rc_profile_to_people();

-- ---------- 4. 存完個人連結之後：開帳號 ----------
-- 回 { state, email?, code?, sent? }。state：has_account、no_email、login、pending、invited。理由見檔頭第 2 點。
create or replace function public.rc_public_profile_account(p_token text, p_lang text)
returns jsonb language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_person uuid := public.rc_link_person(p_token); pe public.people%rowtype; v_email text; v_uid uuid; v_other uuid;
  c public.invite_codes%rowtype; v_code text; n int;
  v_lang text := case when p_lang in ('zh', 'en') then p_lang else 'zh' end;
begin
  if v_person is null then raise exception 'bad_link' using errcode = 'P0001'; end if;
  -- 要先存過一次（存的那一支擋了「我已滿 18 歲」），才開帳號。
  if not exists (select 1 from public.rc_profile_links where token = p_token and submitted_at is not null) then
    raise exception 'not_saved' using errcode = 'P0001';
  end if;
  -- for update：同一個人連點兩下只會開一組碼、寄一封信。
  select * into pe from public.people where id = v_person for update;
  if pe.profile_id is not null then return jsonb_build_object('state', 'has_account'); end if;
  -- email 跟連結上讀到的是同一個：他自己填的優先，再來是登入用的，再來是最後加的。
  select lower(btrim(i.value)) into v_email from public.rc_identities i
   where i.person_id = v_person and i.kind = 'email'
   order by (i.source = 'self') desc, i.verified desc, i.id desc limit 1;
  if v_email is null or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then return jsonb_build_object('state', 'no_email'); end if;
  -- 這個人已經有一組活著的邀請。
  select * into c from public.invite_codes
   where person_id = v_person and email is not null and uses_left > 0 and revoked_at is null and (expires_at is null or expires_at > now())
   order by created_at desc limit 1;
  if found then
    if lower(c.email) = v_email then return jsonb_build_object('state', 'invited', 'email', v_email, 'code', c.code, 'sent', false); end if;
    -- BT 的人寄的那一組（例如「邀請回來」）不動，叫他用那一封。
    if c.grants <> 'connection' then return jsonb_build_object('state', 'pending'); end if;
    -- 他在連結上換了 email：舊的那一組作廢，底下開新的。
    update public.invite_codes set uses_left = 0, revoked_at = now() where code = c.code;
  end if;
  -- 這個 email 已經有帳號，而且那個帳號已經是名單上另一個人：不接、不合併、不新增，記一筆給管紀錄的人。
  select u.id into v_uid from auth.users u where lower(u.email) = v_email limit 1;
  if v_uid is not null then
    select id into v_other from public.people where profile_id = v_uid and id <> v_person limit 1;
    if v_other is not null then
      perform public.rc_log_it('profile_account_conflict', v_person, null, jsonb_build_object('other', v_other));
      return jsonb_build_object('state', 'login', 'email', v_email);
    end if;
  end if;
  -- 同一個 email 綁在名單上另一個人活著的邀請上：不搶。
  if exists (select 1 from public.invite_codes where lower(email) = v_email and person_id is distinct from v_person
               and uses_left > 0 and revoked_at is null and (expires_at is null or expires_at > now())) then
    return jsonb_build_object('state', 'pending');
  end if;
  -- 一個人一天最多開三組（他換 email 才會開新的；擋的是拿連結的人拿來亂寄）。
  select count(*) into n from public.invite_codes where person_id = v_person and grants = 'connection' and created_at > now() - interval '1 day';
  if n >= 3 then raise exception 'too_many' using errcode = 'P0001'; end if;
  loop
    v_code := 'bt-' || substr(md5(random()::text || clock_timestamp()::text), 1, 8);
    exit when not exists (select 1 from public.invite_codes where upper(btrim(code)) = upper(v_code));
  end loop;
  insert into public.invite_codes (code, uses_left, grants, person_id, email, expires_at, invited_by, lang)
  values (v_code, 1, 'connection', v_person, v_email, now() + interval '30 days', null, v_lang);
  perform public.rc_queue_account_mail(v_code);
  perform public.rc_log_it('profile_account_invite', v_person, null, jsonb_build_object('lang', v_lang));
  -- 試著馬上寄（只有幹部的身分叫得動，沒登入的人叫不動就等排程，每 15 分鐘一次）。
  begin perform public.meeting_try_send(); exception when others then null; end;
  return jsonb_build_object('state', 'invited', 'email', v_email, 'code', v_code, 'sent', true);
end $$;
revoke all on function public.rc_public_profile_account(text, text) from public;
grant execute on function public.rc_public_profile_account(text, text) to anon, authenticated;

-- ---------- 5. 認領：connection 的碼 ----------
-- 內部用（claim_invite 叫它，呼叫的人已經鎖住自己那一列 profiles）。**這一支不新增、不刪除 people 的任何一列。**
create or replace function public.rc_claim_connection(p_code text)
returns text language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid(); v_role text; c public.invite_codes%rowtype; pe public.people%rowtype; v_bound text; v_mine text;
  v_other uuid; v_new text;
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = 'P0001'; end if;
  select role into v_role from public.profiles where id = v_uid;
  select * into c from public.invite_codes where upper(btrim(code)) = upper(btrim(p_code)) for update;
  if not found or c.grants <> 'connection' then raise exception 'invalid_invite' using errcode = 'P0001'; end if;
  if c.revoked_at is not null then raise exception 'invite_revoked' using errcode = 'P0001'; end if;
  if c.expires_at is not null and c.expires_at <= now() then raise exception 'invite_expired' using errcode = 'P0001'; end if;
  v_mine := lower(c.email);
  select lower(email) into v_bound from auth.users where id = v_uid;
  if v_bound is distinct from v_mine then
    raise exception 'invite_wrong_email:%', left(v_mine, 1) || '***' || substr(v_mine, position('@' in v_mine)) using errcode = 'P0001';
  end if;
  select * into pe from public.people where id = c.person_id and forgotten_at is null for update;
  if not found then raise exception 'invalid_invite' using errcode = 'P0001'; end if;
  -- 已經接好了（點了兩次、或在別的分頁接過）：把碼收掉，當作成功。
  if pe.profile_id = v_uid then
    if c.uses_left > 0 then
      update public.invite_codes set uses_left = 0 where code = c.code;
      insert into public.invite_uses (code, user_id, grants) values (c.code, v_uid, 'connection');
    end if;
    return 'claimed_record';
  end if;
  if c.uses_left <= 0 then raise exception 'invalid_invite' using errcode = 'P0001'; end if;
  if pe.profile_id is not null then raise exception 'record_claimed' using errcode = 'P0001'; end if;
  -- 這個帳號已經是名單上另一個人：碼不燒、什麼都不接、不刪任何一列，記一筆給管紀錄的人合併。
  select id into v_other from public.people where profile_id = v_uid and id <> pe.id limit 1;
  if v_other is not null then
    perform public.rc_log_it('profile_account_conflict', pe.id, null, jsonb_build_object('other', v_other));
    return 'record_conflict';
  end if;
  update public.invite_codes set uses_left = uses_left - 1 where code = c.code;
  update public.people set profile_id = v_uid where id = pe.id and profile_id is null;
  insert into public.rc_identities (person_id, kind, value, source, verified)
  select pe.id, 'email', lower(u.email), 'login', true from auth.users u where u.id = v_uid and u.email is not null
  on conflict do nothing;
  update public.rc_identities set verified = true where person_id = pe.id and kind = 'email' and lower(value) = v_bound;
  -- 身分：見檔頭第 3 點。
  v_new := case
    when v_role in ('cadre', 'alumni', 'intern', 'connection') then v_role
    when pe.kind = 'member' or exists (select 1 from public.positions po where po.person_id = pe.id) then 'alumni'
    when exists (select 1 from public.applications a where a.user_id = v_uid) then 'student'
    else 'connection' end;
  if v_new is distinct from v_role then update public.profiles set role = v_new where id = v_uid; end if;
  insert into public.invite_uses (code, user_id, grants) values (c.code, v_uid, 'connection');
  perform public.log_change(v_uid, public.person_name(pe.id), 'claimed', null, pe.id::text);
  perform public.rc_log_it('profile_account_claim', pe.id, null, jsonb_build_object('role', v_new));
  return case when v_new is distinct from v_role then 'upgraded_' || v_new else 'claimed_record' end;
end $$;
revoke all on function public.rc_claim_connection(text) from public, anon, authenticated;

-- claim_invite：2026-10-29 那一版一字不差，只在讀完自己的身分之後多一段（connection 的碼交給上面那一支）。
create or replace function public.claim_invite(p_code text)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid    uuid := auth.uid();
  v_role   text;
  v_grants text;
  v_code   text;
  v_person uuid;
  v_rank   text;
  v_revoked boolean;
  v_expired boolean;
  v_mine   text;
  v_bound  text;
  v_old    text;
  v_by     uuid;
  v_claimed boolean := false;
begin
  if v_uid is null then
    raise exception 'not_signed_in' using errcode = 'P0001';
  end if;
  -- for update 是防「同一個人連點兩下」的鎖。**不要拿掉。**
  select role into v_role from profiles where id = v_uid for update;
  if v_role is null then
    raise exception 'no_profile' using errcode = 'P0001';
  end if;
  -- 2027-01-25：個人連結開出來的碼（grants = connection）走 rc_claim_connection，它不新增、不刪除名單上的任何一列。
  if exists (select 1 from invite_codes where upper(btrim(code)) = upper(btrim(p_code)) and grants = 'connection') then
    return public.rc_claim_connection(p_code);
  end if;
  if v_role = 'cadre' then
    return 'already_cadre';
  end if;
  -- 2026-10-29：邀請信的三道檢查，放在扣碼之前。撤銷、過期、email 對不對。
  select revoked_at is not null, (expires_at is not null and expires_at <= now()), lower(email), rank, invited_by
    into v_revoked, v_expired, v_mine, v_rank, v_by
    from invite_codes where upper(btrim(code)) = upper(btrim(p_code));
  if coalesce(v_revoked, false) then raise exception 'invite_revoked' using errcode = 'P0001'; end if;
  if coalesce(v_expired, false) then raise exception 'invite_expired' using errcode = 'P0001'; end if;
  if v_mine is not null then
    select lower(email) into v_bound from auth.users where id = v_uid;
    if v_bound is distinct from v_mine then
      raise exception 'invite_wrong_email:%', left(v_mine, 1) || '***' || substr(v_mine, position('@' in v_mine)) using errcode = 'P0001';
    end if;
  end if;
  update invite_codes set uses_left = uses_left - 1
   where upper(btrim(code)) = upper(btrim(p_code)) and uses_left > 0
   returning grants, code, person_id into v_grants, v_code, v_person;
  if not found then
    raise exception 'invalid_invite' using errcode = 'P0001';
  end if;
  if v_person is not null then
    update people set profile_id = v_uid where id = v_person and profile_id is null;
    if not found then
      raise exception 'record_claimed' using errcode = 'P0001';
    end if;
    insert into positions (person_id, term_id, title_zh, title_en, team)
    select v_person, term_id, title_zh, title_en, team from positions
     where person_id in (select id from people where profile_id = v_uid and id <> v_person)
    on conflict (person_id, term_id, (coalesce(team, ''))) do nothing;
    delete from people where profile_id = v_uid and id <> v_person;
    perform public.log_change(v_uid, public.person_name(v_person), 'claimed', null, v_person::text);
    v_claimed := true;
  end if;
  if v_role = v_grants then
    if v_claimed then
      insert into invite_uses (code, user_id, grants) values (v_code, v_uid, v_grants);
      return 'claimed_record';
    end if;
    update invite_codes set uses_left = uses_left + 1 where code = v_code;
    return 'already_' || v_role;
  end if;
  update profiles set role = v_grants where id = v_uid;
  if v_grants = 'cadre' then
    insert into passports (id) values (v_uid) on conflict (id) do nothing;
    -- 邀請時定的職級，認領的這一刻寫進去，記一筆（誰邀的就算誰改的）。
    if v_rank is not null then
      select board_role into v_old from profiles where id = v_uid;
      update profiles set board_role = v_rank where id = v_uid;
      insert into role_changes (changed_by, target, target_name, field, old_value, new_value)
      values (coalesce(v_by, v_uid), v_uid, public.person_name(coalesce(v_person, (select id from people where profile_id = v_uid limit 1))), 'board_role', coalesce(v_old, 'member'), v_rank);
    end if;
  end if;
  if v_grants = 'intern' and to_regclass('public.intern_passports') is not null then
    insert into intern_passports (id, term)
    values (v_uid, (select id from intern_terms where active order by starts_on desc limit 1))
    on conflict (id) do nothing;
  end if;
  if v_grants in ('cadre', 'alumni') and not exists (select 1 from people where profile_id = v_uid) then
    insert into people (name_zh, name_en, profile_id)
    select name_zh, name_en, id from profiles where id = v_uid;
  end if;
  insert into invite_uses (code, user_id, grants) values (v_code, v_uid, v_grants);
  return case v_grants when 'alumni' then 'upgraded_alumni'
                       when 'intern' then 'upgraded_intern'
                       else 'upgraded' end;
end $$;
revoke execute on function public.claim_invite(text) from public, anon;
grant  execute on function public.claim_invite(text) to authenticated;

-- ---------- 6. 登入之後改自己的檔案：拿自己的那一條連結 ----------
-- 回 { token } 或 null（名單上沒有這個人）。/profile/ 登入之後拿它讀寫，跟拿連結的人走同一兩支，改的是同一個人。
create or replace function public.rc_my_profile_link()
returns jsonb language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_uid uuid := auth.uid(); v_role text; pe public.people%rowtype; v_token text; v_exp timestamptz;
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = 'P0001'; end if;
  select role into v_role from public.profiles where id = v_uid;
  -- 幹部的東西在 /settings/；而且幹部裡有高中生，這一頁會問他同不同意對外。
  if v_role is null or v_role = 'cadre' then raise exception 'not_for_cadre' using errcode = 'P0001'; end if;
  select * into pe from public.people where profile_id = v_uid and forgotten_at is null limit 1;
  if not found then return null; end if;
  -- 跟開連結同一道門：還在念高中的學員（多半未滿 18 歲）不行，畢業年沒填的也擋。
  if pe.kind = 'student' and (pe.grad_year is null or pe.grad_year >= extract(year from now())::int) then raise exception 'minor_no_link' using errcode = 'P0001'; end if;
  -- BT 給過他連結的人，或個人連結開出來的帳號，才有這一頁。
  if v_role <> 'connection' and not exists (select 1 from public.rc_profile_links where person_id = pe.id) then return null; end if;
  select token into v_token from public.rc_profile_links
   where person_id = pe.id and revoked_at is null and expires_at > now() order by created_at desc limit 1;
  if v_token is null then
    update public.rc_profile_links set revoked_at = now() where person_id = pe.id and revoked_at is null;
    v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
    v_exp := now() + interval '90 days';
    insert into public.rc_profile_links (person_id, token, created_by, expires_at) values (pe.id, v_token, v_uid, v_exp);
    perform public.rc_log_it('profile_link_self', pe.id, null, jsonb_build_object('expires_at', v_exp));
  end if;
  return jsonb_build_object('token', v_token);
end $$;
revoke all on function public.rc_my_profile_link() from public, anon;
grant execute on function public.rc_my_profile_link() to authenticated;

commit;

-- ---------- 驗收 ----------
select * from (
  with fn as (
    select p.proname, regexp_replace(p.prosrc, '--[^\n]*', '', 'g') as body,
           has_function_privilege('anon', p.oid, 'execute') as anon_x, has_function_privilege('authenticated', p.oid, 'execute') as auth_x
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname in ('rc_public_profile_account', 'rc_claim_connection', 'claim_invite', 'rc_my_profile_link',
                                                  'rc_queue_account_mail', 'mail_button_url', 'rc_profile_to_people')
  ), t as (
    select
      (select count(*) from pg_constraint where conname in ('profiles_role_check', 'invite_codes_grants_check', 'invite_uses_grants_check')
          and pg_get_constraintdef(oid) like '%''connection''%') as roles,
      (select count(*) from pg_constraint where conrelid in ('public.mail_outbox'::regclass, 'public.mail_templates'::regclass) and contype = 'c'
          and pg_get_constraintdef(oid) like '%''profile_account''%' and pg_get_constraintdef(oid) like '%''invite''%' and pg_get_constraintdef(oid) like '%''received''%') as kinds,
      (select count(*) from public.mail_templates where kind = 'profile_account') as tpl,
      (select body like '%profile_account%' from fn where proname = 'mail_button_url') as btn,
      (select body like '%''connection''%' from fn where proname = 'rc_profile_to_people') as trg_fn,
      exists (select 1 from pg_trigger where tgname = 'rc_profile_to_people' and not tgisinternal) as trg,
      (select anon_x and auth_x from fn where proname = 'rc_public_profile_account') as acct_open,
      (select body like '%rc_link_person(p_token)%' and body like '%submitted_at is not null%' and body like '%profile_id is not null%'
              and body like '%too_many%' and body like '%for update%' and body not like '%insert into public.people%' from fn where proname = 'rc_public_profile_account') as acct_gates,
      (select not anon_x and not auth_x from fn where proname = 'rc_claim_connection') as claim_closed,
      (select body not like '%delete from public.people%' and body not like '%insert into public.people%' and body like '%record_conflict%'
              and body like '%invite_wrong_email%' and body like '%invite_expired%' and body like '%invite_revoked%' from fn where proname = 'rc_claim_connection') as claim_safe,
      (select body like '%rc_claim_connection(p_code)%' and body like '%invite_wrong_email%' and body like '%for update%' and body like '%already_cadre%' from fn where proname = 'claim_invite') as claim_branch,
      (select not anon_x and auth_x from fn where proname = 'rc_my_profile_link') as mine_open,
      (select body like '%minor_no_link%' and body like '%not_for_cadre%' from fn where proname = 'rc_my_profile_link') as mine_gates,
      (select not anon_x and not auth_x from fn where proname = 'rc_queue_account_mail') as mail_closed,
      (select count(*) from pg_policies where schemaname = 'public' and tablename in ('people', 'rc_profiles', 'rc_profile_links', 'invite_codes', 'profiles')) as pol
  )
  select 0 ord, 'OVERALL' as 項目, null::text as 應該是, null::text as 實際是,
    case when roles = 3 and kinds = 2 and tpl = 1 and btn and trg_fn and trg and acct_open and acct_gates and claim_closed and claim_safe
              and claim_branch and mine_open and mine_gates and mail_closed then 'PASS' else 'FAIL' end as 結果 from t
  union all select 1, '★ 三個身分清單都多了 connection', '3', roles::text, case when roles = 3 then 'PASS' else 'FAIL' end from t
  union all select 2, '信的種類多 profile_account，原本的還在', '2', kinds::text, case when kinds = 2 then 'PASS' else 'FAIL' end from t
  union all select 3, '開帳號那封信的預設文案在', '1', tpl::text, case when tpl = 1 then 'PASS' else 'FAIL' end from t
  union all select 4, '信上的按鈕連到開帳號的連結', 'true', coalesce(btn::text, '（函式不在）'), case when btn then 'PASS' else 'FAIL' end from t
  union all select 5, '新帳號自動進名單多認 connection（先對 email，不另開一列）', 'true / true', coalesce(trg_fn::text, '?') || ' / ' || trg::text, case when trg_fn and trg then 'PASS' else 'FAIL' end from t
  union all select 6, '★ 開帳號那一支拿連結的人叫得動', 'true', coalesce(acct_open::text, '（函式不在）'), case when acct_open then 'PASS' else 'FAIL' end from t
  union all select 7, '★ 開帳號：要先存過、有帳號就不開、一天三組、鎖住那個人、不新增任何人', 'true', coalesce(acct_gates::text, '（函式不在）'), case when acct_gates then 'PASS' else 'FAIL' end from t
  union all select 8, '★ 認領 connection 那一支前端叫不到（只從 claim_invite 進來）', 'true', coalesce(claim_closed::text, '（函式不在）'), case when claim_closed then 'PASS' else 'FAIL' end from t
  union all select 9, '★ 認領 connection：不新增、不刪除名單上的任何一列；三道檢查都在；撞到另一個人回 record_conflict', 'true', coalesce(claim_safe::text, '（函式不在）'), case when claim_safe then 'PASS' else 'FAIL' end from t
  union all select 10, '★ claim_invite 把 connection 的碼交出去，原本的檢查與鎖都還在', 'true', coalesce(claim_branch::text, '（函式不在）'), case when claim_branch then 'PASS' else 'FAIL' end from t
  union all select 11, '★ 拿自己的連結：登入才叫得動', 'true', coalesce(mine_open::text, '（函式不在）'), case when mine_open then 'PASS' else 'FAIL' end from t
  union all select 12, '★ 拿自己的連結：幹部與高中生不行', 'true', coalesce(mine_gates::text, '（函式不在）'), case when mine_gates then 'PASS' else 'FAIL' end from t
  union all select 13, '排信那一支前端叫不到', 'true', coalesce(mail_closed::text, '（函式不在）'), case when mail_closed then 'PASS' else 'FAIL' end from t
  union all select 14, '（參考）這五張表的 RLS 政策條數，這一支沒有動', '（跑之前一樣）', pol::text, 'PASS' from t
) x order by ord;
