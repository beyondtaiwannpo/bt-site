-- 邀請信：打一個 email 跟他之後的職位，寄一封信把人請進來　2026-10-29
--
-- 用法：整份貼進 Supabase SQL Editor 按一次 Run。可以重跑。最後印一張 PASS / FAIL 表。
-- **要先跑過 2026-10-28-adviser-rank.sql**（順序照日期）。
-- 設計與 Paul 拍板的七題：docs/2026-10-24-邀請信.md。
--
-- ============================================================================
-- 這一支在做什麼
-- ============================================================================
--   1. invite_codes 加六欄：email（綁定）、rank（認領時寫進 board_role）、expires_at、opened_at、revoked_at、invited_by。
--      舊的批次碼這六欄都是空的，照常能用。
--   2. mail_outbox 與 mail_templates 的 kind 多一個值 invite；mail_outbox 多一欄 invite_code（哪一封信是哪一組碼的）。
--      invite 那一列的預設文案種進 mail_templates（on conflict do nothing，Paul 改過的不會被蓋）。
--   3. 六支函式：invite_person（邀請）、resend_invite（重寄換新碼）、revoke_invite（撤銷）、
--      invites_for_review（清單）、invite_opened（開過信，沒登入也能叫，只寫時間回 void）、invite_fill（五個代換符號）。
--   4. claim_invite() 多三道檢查（撤銷、過期、email 對不對），認領成功且是幹部就把 rank 寫進 board_role 並記一筆。
--      其餘本文跟 2026-10-24 那一版一字不差。
--
-- 刻意不動的：send_pending_mail()（它不分種類，照 outbox 排隊寄；門仍是 is_cadre，10-24 記著的已知事項）、
-- create_invite / disable_invite（批次碼照舊）、invite_codes 與 invite_uses 的表權限（仍然只有函式碰得到）。
--
-- ⚠ 重跑 2026-10-24-ranks-and-workspaces.sql 會把 claim_invite 建回沒有三道檢查的版本，那時要再跑這一支。
-- ============================================================================

begin;

-- ---------- 1. invite_codes 六欄 ----------
alter table public.invite_codes add column if not exists email       text;
alter table public.invite_codes add column if not exists rank        text;
alter table public.invite_codes add column if not exists expires_at  timestamptz;
alter table public.invite_codes add column if not exists opened_at   timestamptz;
alter table public.invite_codes add column if not exists revoked_at  timestamptz;
alter table public.invite_codes add column if not exists invited_by  uuid references public.profiles(id) on delete set null;
alter table public.invite_codes drop constraint if exists invite_codes_rank_check;
alter table public.invite_codes add constraint invite_codes_rank_check
  check (rank is null or rank in ('member', 'adviser', 'director', 'senior_adviser', 'president'));
comment on column public.invite_codes.email is '邀請信寄到哪裡，碼也只有用這個 email 登入的人認領得了（小寫存）。批次碼是空的。';
comment on column public.invite_codes.rank is '認領時寫進 profiles.board_role 的職級，只有 grants = cadre 才有。';

-- ---------- 2. 信的種類多一個 invite ----------
do $$
declare v text;
begin
  select conname into v from pg_constraint where conrelid = 'public.mail_outbox'::regclass and contype = 'c'
    and pg_get_constraintdef(oid) like '%kind%';
  if v is not null then execute format('alter table public.mail_outbox drop constraint %I', v); end if;
  alter table public.mail_outbox add constraint mail_outbox_kind_check
    check (kind in ('guardian', 'interview', 'accepted', 'rejected', 'notice', 'invite'));
  select conname into v from pg_constraint where conrelid = 'public.mail_templates'::regclass and contype = 'c'
    and pg_get_constraintdef(oid) like '%kind%';
  if v is not null then execute format('alter table public.mail_templates drop constraint %I', v); end if;
  alter table public.mail_templates add constraint mail_templates_kind_check
    check (kind in ('guardian', 'interview', 'accepted', 'rejected', 'invite'));
end $$;
alter table public.mail_outbox add column if not exists invite_code text;

-- 預設文案。中英各一段（校友在七個國家）。五個代換符號：{name} {position} {term} {link} {sender}。
-- 信尾「不要回覆這封信」那一段由 mail_tail() 自己加，不在這裡。
insert into public.mail_templates (kind, subject, body) values
('invite',
 'Beyond Taiwan 邀請你加入後台　You are invited to Beyond Taiwan',
 '{name} 你好，' || E'\n\n' ||
 '{sender} 邀請你加入 Beyond Taiwan 的後台，你的身分會是 {position}。' || E'\n' ||
 '點這個連結，用收到這封信的 email 登入（用 Google 登入也可以，選同一個 email），就完成了：' || E'\n\n' ||
 '{link}' || E'\n\n' ||
 '進去之後第一眼是「總覽」：你被派進哪些工作區、今天要處理的事。護照、時間看板、設定在最上面那一條。' || E'\n' ||
 '這個連結 30 天內有效，只有你能用。' || E'\n\n' ||
 'Hi {name},' || E'\n\n' ||
 '{sender} has invited you to the Beyond Taiwan admin as {position}.' || E'\n' ||
 'Open this link and sign in with the email this was sent to (Google sign-in works too, pick the same email):' || E'\n\n' ||
 '{link}' || E'\n\n' ||
 'The first thing you will see is the Overview: your workspaces and what needs handling today. Passport, availability and settings are in the top bar.' || E'\n' ||
 'The link is valid for 30 days and works only for you.')
on conflict (kind) do nothing;

-- ---------- 3. 代換 ----------
create or replace function public.invite_fill(p_text text, p_name text, p_position text, p_term text, p_link text, p_sender text)
returns text language sql immutable
as $$
  select replace(replace(replace(replace(replace(coalesce(p_text, ''),
           '{name}', coalesce(p_name, '')),
           '{position}', coalesce(p_position, '')),
           '{term}', coalesce(p_term, '')),
           '{link}', coalesce(p_link, '')),
           '{sender}', coalesce(p_sender, ''))
$$;

-- 排一封邀請信進 outbox。內部用，前端叫不動。
create or replace function public.queue_invite_mail(p_code text)
returns uuid language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  c record; v_name text; v_pos text; v_term text; v_sender text; v_sub text; v_body text; v_id uuid;
begin
  select * into c from invite_codes where code = p_code;
  if c.email is null then raise exception 'not_an_invite' using errcode = 'P0001'; end if;
  select coalesce(nullif(btrim(pe.name_en), ''), nullif(btrim(pe.name_zh), ''), '') into v_name from people pe where pe.id = c.person_id;
  select coalesce(po.title_en, po.title_zh), po.term_id into v_pos, v_term
    from positions po join terms t on t.id = po.term_id where po.person_id = c.person_id
   order by t.starts_on desc limit 1;
  if v_pos is null then
    v_pos := case c.grants when 'alumni' then 'Alumni' when 'intern' then 'Intern'
             else case c.rank when 'president' then 'Co-President' when 'senior_adviser' then 'Senior Adviser'
                              when 'director' then 'Director' when 'adviser' then 'Adviser' else 'Associate' end end;
  end if;
  select coalesce(nullif(btrim(name_en), ''), nullif(btrim(name_zh), ''), 'Beyond Taiwan') into v_sender from profiles where id = c.invited_by;
  select subject, body into v_sub, v_body from mail_templates where kind = 'invite';
  if v_sub is null then v_sub := 'Beyond Taiwan 邀請你加入後台'; v_body := '{name} 你好，' || E'\n\n' || '{sender} 邀請你加入 Beyond Taiwan 的後台：' || E'\n\n' || '{link}'; end if;
  v_sub  := public.invite_fill(v_sub,  v_name, v_pos, v_term, 'https://beyondtaiwannpo.com/app/?invite=' || c.code, v_sender);
  v_body := public.invite_fill(v_body, v_name, v_pos, v_term, 'https://beyondtaiwannpo.com/app/?invite=' || c.code, v_sender)
         || coalesce(E'\n\n' || nullif(btrim(coalesce(c.note, '')), ''), '')
         || public.mail_tail('invite');
  insert into mail_outbox (to_email, subject, body, kind, invite_code) values (c.email, v_sub, v_body, 'invite', c.code) returning id into v_id;
  return v_id;
end $$;
revoke all on function public.queue_invite_mail(text) from public, anon, authenticated;

-- ---------- 4. 邀請 ----------
-- 一次做完：email 檢查、同一個 email 有活的碼就擋、有名字或職位就建名單紀錄與職位、建碼、排信。回那組碼。
-- p_line 是「給他的一句話」，存在 invite_codes.note 的前面一段，印在信裡；p_note 只有後台看得到。
create or replace function public.invite_person(
  p_email text, p_grants text, p_rank text,
  p_name_zh text, p_name_en text, p_title_en text, p_title_zh text, p_team text, p_term text,
  p_line text, p_note text)
returns text language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_code text; v_person uuid;
  v_zh text := nullif(btrim(coalesce(p_name_zh, '')), ''); v_en text := nullif(btrim(coalesce(p_name_en, '')), '');
  v_ten text := nullif(btrim(coalesce(p_title_en, '')), ''); v_tzh text := nullif(btrim(coalesce(p_title_zh, '')), '');
  v_team text := nullif(btrim(coalesce(p_team, '')), ''); v_term text := nullif(btrim(coalesce(p_term, '')), '');
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
  -- 名單紀錄：幹部與校友才進名單（實習生不進，10-23 的規矩）。有名字或職位才建；沒有就等他註冊自己填。
  if p_grants in ('cadre', 'alumni') and (v_zh is not null or v_en is not null or v_ten is not null) then
    insert into people (name_zh, name_en, note) values (v_zh, v_en, nullif(btrim(coalesce(p_note, '')), '')) returning id into v_person;
    if v_ten is not null or v_tzh is not null then
      if v_term is null then raise exception 'term_required' using errcode = 'P0001'; end if;
      if not exists (select 1 from terms where id = v_term) then raise exception 'no_such_term' using errcode = 'P0001'; end if;
      insert into positions (person_id, term_id, title_zh, title_en, team) values (v_person, v_term, coalesce(v_tzh, v_ten), coalesce(v_ten, v_tzh), v_team);
    end if;
  end if;
  -- 碼：bt- 加 8 個隨機十六進位字元。不是人打的，所以不用想。
  loop
    v_code := 'bt-' || substr(md5(random()::text || clock_timestamp()::text), 1, 8);
    exit when not exists (select 1 from invite_codes where upper(btrim(code)) = upper(v_code));
  end loop;
  insert into invite_codes (code, uses_left, grants, note, person_id, email, rank, expires_at, invited_by)
  values (v_code, 1, p_grants, nullif(btrim(coalesce(p_line, '')), ''), v_person, v_email,
          case when p_grants = 'cadre' then p_rank end, now() + interval '30 days', auth.uid());
  perform public.queue_invite_mail(v_code);
  perform public.log_change(null, v_email, 'invite', null, v_code);
  return v_code;
end $$;
revoke all on function public.invite_person(text, text, text, text, text, text, text, text, text, text, text) from public, anon;
grant execute on function public.invite_person(text, text, text, text, text, text, text, text, text, text, text) to authenticated;

-- 重寄：舊碼作廢，新碼綁同一個 email、同一筆紀錄、同一個職級，重算 30 天，再排一封信。回新碼。
create or replace function public.resend_invite(p_code text)
returns text language plpgsql security definer
set search_path = public, pg_temp
as $$
declare c record; v_code text;
begin
  perform public.require_senior();
  select * into c from invite_codes where code = p_code and email is not null;
  if not found then raise exception 'not_an_invite' using errcode = 'P0001'; end if;
  if exists (select 1 from invite_uses where code = c.code) then raise exception 'already_claimed' using errcode = 'P0001'; end if;
  update invite_codes set uses_left = 0, revoked_at = coalesce(revoked_at, now()) where code = c.code;
  loop
    v_code := 'bt-' || substr(md5(random()::text || clock_timestamp()::text), 1, 8);
    exit when not exists (select 1 from invite_codes where upper(btrim(code)) = upper(v_code));
  end loop;
  insert into invite_codes (code, uses_left, grants, note, person_id, email, rank, expires_at, invited_by)
  values (v_code, 1, c.grants, c.note, c.person_id, c.email, c.rank, now() + interval '30 days', auth.uid());
  perform public.queue_invite_mail(v_code);
  perform public.log_change(null, c.email, 'invite', c.code, v_code);
  return v_code;
end $$;
revoke all on function public.resend_invite(text) from public, anon;
grant execute on function public.resend_invite(text) to authenticated;

-- 撤銷：只有 Co-President。碼立刻失效，名單紀錄留著。
create or replace function public.revoke_invite(p_code text)
returns void language plpgsql security definer
set search_path = public, pg_temp
as $$
declare c record;
begin
  perform public.require_president();
  select * into c from invite_codes where code = p_code and email is not null;
  if not found then raise exception 'not_an_invite' using errcode = 'P0001'; end if;
  update invite_codes set uses_left = 0, revoked_at = coalesce(revoked_at, now()) where code = c.code;
  perform public.log_change(null, c.email, 'invite', c.code, 'revoked');
end $$;
revoke all on function public.revoke_invite(text) from public, anon;
grant execute on function public.revoke_invite(text) to authenticated;

-- 清單：每一組邀請（email 不是空的那些）加算好的狀態。Co-President 與 Senior Adviser。
create or replace function public.invites_for_review()
returns table (
  code text, email text, grants text, rank text, person_id uuid, person_name text, title text, term text,
  note text, created_at timestamptz, expires_at timestamptz, opened_at timestamptz, revoked_at timestamptz,
  invited_by_name text, mail_sent_at timestamptz, mail_error text, claimed_by uuid, claimed_name text, claimed_at timestamptz, status text
) language sql security definer stable
set search_path = public, pg_temp
as $$
  select c.code, c.email, c.grants, c.rank, c.person_id,
         (select public.person_name(c.person_id)),
         (select coalesce(po.title_en, po.title_zh) from positions po join terms t on t.id = po.term_id where po.person_id = c.person_id order by t.starts_on desc limit 1),
         (select po.term_id from positions po join terms t on t.id = po.term_id where po.person_id = c.person_id order by t.starts_on desc limit 1),
         c.note, c.created_at, c.expires_at, c.opened_at, c.revoked_at,
         (select coalesce(nullif(btrim(p.name_en), ''), nullif(btrim(p.name_zh), '')) from profiles p where p.id = c.invited_by),
         m.sent_at, m.error,
         u.user_id,
         (select coalesce(nullif(btrim(p.name_en), ''), nullif(btrim(p.name_zh), '')) from profiles p where p.id = u.user_id),
         u.used_at,
         case when u.user_id is not null then 'claimed'
              when c.revoked_at is not null then 'revoked'
              when c.expires_at is not null and c.expires_at <= now() then 'expired'
              when c.opened_at is not null then 'opened'
              when m.sent_at is not null then 'sent'
              when m.id is not null and m.tries >= 5 then 'failed'
              else 'queued' end
    from invite_codes c
    left join lateral (select user_id, used_at from invite_uses x where x.code = c.code order by used_at desc limit 1) u on true
    left join lateral (select id, sent_at, error, tries from mail_outbox o where o.invite_code = c.code order by created_at desc limit 1) m on true
   where c.email is not null and public.is_senior()
   order by c.created_at desc;
$$;
revoke all on function public.invites_for_review() from public, anon;
grant execute on function public.invites_for_review() to authenticated;

-- 開過信：連結打開的那一刻記一次時間。沒登入也能叫，只寫、只第一次、回 void，什麼都不說。
create or replace function public.invite_opened(p_code text)
returns void language sql security definer volatile
set search_path = public, pg_temp
as $$
  update invite_codes set opened_at = now()
   where upper(btrim(code)) = upper(btrim(coalesce(p_code, ''))) and email is not null and opened_at is null;
$$;
revoke all on function public.invite_opened(text) from public;
grant execute on function public.invite_opened(text) to anon, authenticated;

-- 登入的人看自己這一組碼是寄給誰的（印在登入頁：「這組碼是寄給 x***@ 的」）。只回遮過的 email。
create or replace function public.invite_peek(p_code text)
returns table (grants text, email_hint text, status text) language sql security definer stable
set search_path = public, pg_temp
as $$
  select c.grants,
         left(c.email, 1) || '***' || substr(c.email, position('@' in c.email)),
         case when exists (select 1 from invite_uses x where x.code = c.code) then 'claimed'
              when c.revoked_at is not null then 'revoked'
              when c.expires_at is not null and c.expires_at <= now() then 'expired'
              else 'live' end
    from invite_codes c
   where upper(btrim(c.code)) = upper(btrim(coalesce(p_code, ''))) and c.email is not null;
$$;
revoke all on function public.invite_peek(text) from public;
grant execute on function public.invite_peek(text) to anon, authenticated;

-- ---------- 5. claim_invite：三道檢查加寫職級 ----------
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

-- 變動紀錄的 field 多一種 invite。
alter table public.role_changes drop constraint if exists role_changes_field_check;
alter table public.role_changes add constraint role_changes_field_check
  check (field in ('board_role', 'team', 'name', 'role', 'position', 'assignment', 'removed', 'claimed', 'merged', 'term', 'invite'));

commit;

select * from (
  with cols as (
    select count(*) as n from information_schema.columns
     where table_schema = 'public' and table_name = 'invite_codes'
       and column_name in ('email', 'rank', 'expires_at', 'opened_at', 'revoked_at', 'invited_by')
  ), ok as (
    select (select pg_get_constraintdef(oid) from pg_constraint where conname = 'mail_outbox_kind_check') like '%''invite''%' as outbox,
           (select pg_get_constraintdef(oid) from pg_constraint where conname = 'mail_templates_kind_check') like '%''invite''%' as tpl
  ), tpl as (
    select count(*) as n from public.mail_templates where kind = 'invite'
  ), fn as (
    select p.proname, regexp_replace(p.prosrc, '--[^\n]*', '', 'g') as body, p.prosecdef,
           (select count(*) from aclexplode(p.proacl) x where x.grantee = 'anon'::regrole and x.privilege_type = 'EXECUTE') as anon_exec
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname in ('invite_person', 'resend_invite', 'revoke_invite', 'invites_for_review', 'invite_opened', 'invite_peek', 'invite_fill', 'claim_invite', 'queue_invite_mail')
  )
  select 0 ord, 'OVERALL' as 項目, null::text as 應該是, null::text as 實際是,
    case when (select n from cols) = 6 and (select outbox and tpl from ok) and (select n from tpl) = 1
          and (select count(*) from fn) = 9
          and (select body like '%require_senior()%' from fn where proname = 'invite_person')
          and (select body like '%require_senior()%' from fn where proname = 'resend_invite')
          and (select body like '%require_president()%' from fn where proname = 'revoke_invite')
          and (select body like '%public.is_senior()%' from fn where proname = 'invites_for_review')
          and (select anon_exec = 1 from fn where proname = 'invite_opened')
          and (select anon_exec = 0 from fn where proname = 'invites_for_review')
          and (select body like '%invite_wrong_email%' and body like '%invite_expired%' and body like '%invite_revoked%' and body like '%for update%' from fn where proname = 'claim_invite')
    then 'PASS' else 'FAIL' end as 結果
  union all select 1, '★ invite_codes 六欄都在', '6', (select n from cols)::text, case when (select n from cols) = 6 then 'PASS' else 'FAIL' end
  union all select 2, '★ outbox 與 mail_templates 的 kind 都收 invite', 'true', (select (outbox and tpl)::text from ok), case when (select outbox and tpl from ok) then 'PASS' else 'FAIL' end
  union all select 3, 'invite 的預設文案在', '1', (select n from tpl)::text, case when (select n from tpl) = 1 then 'PASS' else 'FAIL' end
  union all select 4, '★ 邀請與重寄的門是 require_senior、撤銷是 require_president、清單是 is_senior', 'true',
    coalesce((select ((select body like '%require_senior()%' from fn where proname = 'invite_person') and (select body like '%require_senior()%' from fn where proname = 'resend_invite')
      and (select body like '%require_president()%' from fn where proname = 'revoke_invite') and (select body like '%public.is_senior()%' from fn where proname = 'invites_for_review'))::text), '（函式不在）'),
    case when (select body like '%require_senior()%' from fn where proname = 'invite_person') and (select body like '%require_senior()%' from fn where proname = 'resend_invite')
      and (select body like '%require_president()%' from fn where proname = 'revoke_invite') and (select body like '%public.is_senior()%' from fn where proname = 'invites_for_review') then 'PASS' else 'FAIL' end
  union all select 5, '★ invite_opened 沒登入叫得動、清單沒登入叫不動', '1 / 0',
    coalesce((select anon_exec::text from fn where proname = 'invite_opened'), '?') || ' / ' || coalesce((select anon_exec::text from fn where proname = 'invites_for_review'), '?'),
    case when (select anon_exec = 1 from fn where proname = 'invite_opened') and (select anon_exec = 0 from fn where proname = 'invites_for_review') then 'PASS' else 'FAIL' end
  union all select 6, '★ claim_invite 有三道新檢查，鎖還在', 'true',
    coalesce((select (body like '%invite_wrong_email%' and body like '%invite_expired%' and body like '%invite_revoked%' and body like '%for update%')::text from fn where proname = 'claim_invite'), '（函式不在）'),
    case when (select body like '%invite_wrong_email%' and body like '%invite_expired%' and body like '%invite_revoked%' and body like '%for update%' from fn where proname = 'claim_invite') then 'PASS' else 'FAIL' end
  union all select 7, '九支函式都在', '9', (select count(*)::text from fn), case when (select count(*) from fn) = 9 then 'PASS' else 'FAIL' end
) t order by ord;
