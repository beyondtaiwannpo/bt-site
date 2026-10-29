-- 會議變成真正的日曆邀請　2026-11-18
--
-- 用法：整份貼進 Supabase SQL Editor 按一次 Run。可以重跑。最後印一張 PASS / FAIL 表。
-- **要先跑過 2026-11-17-meetings-home.sql**（順序照日期）。
-- ⚠ 跑過這一支之後**不要再重跑 2026-11-17 那支**：它會把排會、改會、寄信那幾支函式蓋回沒有日曆邀請的版本，
--   而且它重建信的種類檢查時會因為 outbox 裡已經有 meeting_update／meeting_cancel 的列而失敗。
--   真的不小心重跑了，再跑一次這一支就裝回來。
--
-- Paul 2026-10-28：「排會應該要把 BT 主帳號也加進去。現在排會寄邀請，大家在網站上按接受，
-- 但 Google 日曆上沒有這場會。我要會議出現在 Google 日曆上，大家才能拿來排自己的生活。」
-- 他選的做法：不接 Google 的 API，把邀請信附的日曆檔改成「真正的邀請」；主辦人是排會的人，
-- BT 主帳號永遠在來賓名單裡；改時間重寄更新、刪會寄取消；Google 不另外寄信，回覆還是在網站上按。
--
-- ============================================================================
-- 這一支在做什麼
-- ============================================================================
--   1. 日曆檔從「公告」（METHOD:PUBLISH，Gmail 只當附件）改成「邀請」（METHOD:REQUEST）：
--      有主辦人（排會的人）、有來賓名單（名單上每個人加 BT 主帳號）、有版本號（SEQUENCE）。
--      同一場會的編號（UID）不變，所以改時間寄出去的是「更新」，大家日曆上那一筆跟著改，不會多一筆。
--      附件的類型帶 method=REQUEST／CANCEL，Gmail 才會顯示成「要參加嗎」的邀請。
--   2. BT 主帳號：信箱放在 mail_settings 的 calendar_main（預設 beyondtaiwan2020@gmail.com），
--      換人改那一列就好，不用改程式。每場從看板排的會，它都收一封邀請，所以它的日曆上會有每一場。
--   3. 改會（save_meeting）：已經寄過邀請的會，改了標題、時間、議程、紀錄連結、必到或名單，
--      **先記下來不馬上寄**（meetings.cal_dirty_at）。後台是改了就存，一場會改三格就會存三次，
--      馬上寄的話每個人會收到三封「會議有更新」。停手 10 分鐘之後（或那場會 24 小時內就要開）才一次寄出：
--        - 還在名單上、日曆上已經有的人：一封「更新」。
--        - 新加進名單的人：一封邀請。
--        - 從名單上拿掉、日曆上還有的人：一封「取消」，那一筆從他的日曆上拿掉。
--      寄的時機跟提醒信同一個排程（pg_cron 每 15 分鐘，或有人打開後台時的 tick_mail）。
--   4. 刪會（delete_meeting）：日曆上已經有這場的人（含 BT 主帳號）馬上各收一封「取消」。
--      還沒寄出去的邀請照 11-16 那一版一起拿掉。
--   5. 兩種新的信：meeting_update（會議有更新）、meeting_cancel（不在你的行事曆上了）。後台「信的文字」改得到。
--   6. send_pending_mail 重建，唯一的差別是附件：檔名 invite.ics，類型帶 method。
--   7. meeting_ics 讀得到每個人的信箱，所以**只給資料庫內部叫**，網站上的人叫不到（驗收表第 11 條守著）。
--
--   不做的：在 Gmail 的邀請上按「參加」，回覆會寄到主辦人的信箱，不會回到網站。網站上的回覆還是準的那一份。
--   從後台新增、沒有從看板排的會，跟以前一樣不寄邀請，也就不會進大家的日曆。
-- ============================================================================

begin;

-- ---------- 1. 欄位與設定 ----------
alter table public.meetings add column if not exists ics_seq int not null default 0;          -- 日曆檔的版本號，每寄一次更新或取消加一
alter table public.meetings add column if not exists cal_dirty_at timestamptz;                  -- 改了還沒寄更新；寄完清掉
insert into public.mail_settings (key, value) values ('calendar_main', 'beyondtaiwan2020@gmail.com') on conflict (key) do nothing;

create or replace function public.meeting_main_email()
returns text language sql stable
set search_path = public, pg_temp
as $$ select lower(nullif(btrim((select value from mail_settings where key = 'calendar_main')), '')) $$;

-- ---------- 2. 信的種類多兩個 ----------
do $$
declare v text;
begin
  select conname into v from pg_constraint where conrelid = 'public.mail_outbox'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%kind%';
  if v is not null then execute format('alter table public.mail_outbox drop constraint %I', v); end if;
  alter table public.mail_outbox add constraint mail_outbox_kind_check
    check (kind in ('guardian', 'interview', 'accepted', 'rejected', 'notice', 'invite', 'request_new', 'request_done',
                    'meeting_invite', 'meeting_reminder', 'meeting_summary', 'meeting_update', 'meeting_cancel'));
  select conname into v from pg_constraint where conrelid = 'public.mail_templates'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%kind%';
  if v is not null then execute format('alter table public.mail_templates drop constraint %I', v); end if;
  alter table public.mail_templates add constraint mail_templates_kind_check
    check (kind in ('guardian', 'interview', 'accepted', 'rejected', 'invite', 'request_new', 'request_done',
                    'meeting_invite', 'meeting_reminder', 'meeting_summary', 'meeting_update', 'meeting_cancel'));
end $$;

-- 預設文案。代換符號跟邀請信一樣：{name}、{title}、{when}（收信的人的時區）、{agenda}、{doc}、{link}。
insert into public.mail_templates (kind, subject_zh, body_zh, subject_en, body_en, button_label, button_label_en) values
('meeting_update',
 '會議有更新：{title}',
 '{name} 你好，' || E'\n\n' ||
 '「{title}」改過了，這是最新的：' || E'\n' ||
 '時間（你的時區）：{when}' || E'\n' ||
 '議程：{agenda}' || E'\n' ||
 '會議紀錄：{doc}' || E'\n\n' ||
 '附件是更新過的日曆邀請，你日曆上那一筆會跟著改。會不會到，還是登入網站按一下：' || E'\n' ||
 '{link}',
 'Meeting updated: {title}',
 'Hi {name},' || E'\n\n' ||
 '"{title}" has changed. Here is the latest:' || E'\n' ||
 'When (your time zone): {when}' || E'\n' ||
 'Agenda: {agenda}' || E'\n' ||
 'Notes: {doc}' || E'\n\n' ||
 'The attached invite updates the event on your calendar. Let us know if you can make it on the site (sign in first):' || E'\n' ||
 '{link}',
 '回覆出席', 'Reply'),
('meeting_cancel',
 '這場會不在你的日曆上了：{title}',
 '{name} 你好，' || E'\n\n' ||
 '「{title}」（原本在 {when}，你的時區）取消了，或是你已經不在這場會的名單上。' || E'\n' ||
 '附件會把它從你的日曆上拿掉。' || E'\n\n' ||
 '有問題請直接問排這場會的人。',
 'Off your calendar: {title}',
 'Hi {name},' || E'\n\n' ||
 '"{title}" (was {when}, your time zone) was cancelled, or you are no longer on the list for it.' || E'\n' ||
 'The attachment removes it from your calendar.' || E'\n\n' ||
 'Questions go to whoever scheduled it.',
 '打開首頁', 'Open home')
on conflict (kind) do nothing;

create or replace function public.mail_defaults(p_kind text, p_lang text)
returns table (button_label text, hero text)
language sql immutable
as $$
  select case p_kind
      when 'invite' then case when p_lang = 'en' then 'Accept invitation' else '接受邀請' end
      when 'meeting_invite' then case when p_lang = 'en' then 'Reply' else '回覆出席' end
      when 'meeting_reminder' then case when p_lang = 'en' then 'Reply' else '回覆出席' end
      when 'meeting_update' then case when p_lang = 'en' then 'Reply' else '回覆出席' end
      when 'meeting_summary' then case when p_lang = 'en' then 'Open meeting' else '看這場會' end
      when 'request_new' then case when p_lang = 'en' then 'Open request' else '打開需求單' end
      when 'request_done' then case when p_lang = 'en' then 'Open request' else '看回覆' end
      when 'interview' then case when p_lang = 'en' then 'Pick a time' else '挑一個時段' end
      else case when p_lang = 'en' then 'Open Beyond Taiwan' else '打開 Beyond Taiwan' end end,
    'https://beyondtaiwannpo.com/photos/' || case p_kind
      when 'invite' then 'group-photo.jpg'
      when 'meeting_invite' then 'talking-laptop.jpg'
      when 'meeting_reminder' then 'talking-laptop.jpg'
      when 'meeting_update' then 'talking-laptop.jpg'
      when 'meeting_cancel' then 'talking-laptop.jpg'
      when 'meeting_summary' then 'talking-laptop.jpg'
      when 'request_new' then 'sharing-mic.jpg'
      when 'request_done' then 'sharing-mic.jpg'
      when 'guardian' then 'hero-listening.jpg'
      when 'accepted' then 'three-at-laptop.jpg'
      else 'hero-listening.jpg' end
$$;

-- 取消信沒有按鈕：那場會可能已經刪了，點進去只會看到「找不到」。
create or replace function public.mail_button_url(r public.mail_outbox)
returns text language sql stable
set search_path = public, pg_temp
as $$
  select case
    when r.kind = 'invite' and r.invite_code is not null then 'https://beyondtaiwannpo.com/app/?invite=' || r.invite_code
    when r.kind in ('meeting_invite', 'meeting_reminder', 'meeting_summary', 'meeting_update') and r.meeting_id is not null then 'https://beyondtaiwannpo.com/home/?meeting=' || r.meeting_id::text
    when r.kind = 'request_new' and r.request_id is not null then 'https://beyondtaiwannpo.com/admin/#requests/' || r.request_id::text
    when r.kind = 'request_done' and r.request_id is not null then 'https://beyondtaiwannpo.com/admin/#request/' || r.request_id::text
    when r.kind = 'interview' and r.form_id is not null then coalesce((select f.interview_url from forms f where f.id = r.form_id), 'https://beyondtaiwannpo.com/apply/')
    when r.kind in ('accepted', 'rejected', 'notice', 'guardian') then 'https://beyondtaiwannpo.com/apply/'
    else '' end
$$;

-- ---------- 3. 日曆檔 ----------
-- 一行超過 75 個位元組要折行（RFC 5545）：在 74 個位元組前斷開，下一行開頭一個空白。中文一個字三個位元組，照位元組算才不會切壞字。
create or replace function public.ics_fold(p text)
returns text language plpgsql immutable
as $$
declare v_out text := ''; v_cur text := ''; ch text; i int;
begin
  for i in 1 .. coalesce(char_length(p), 0) loop
    ch := substr(p, i, 1);
    if octet_length(v_cur) + octet_length(ch) > 74 then v_out := v_out || v_cur || E'\r\n '; v_cur := ch;
    else v_cur := v_cur || ch; end if;
  end loop;
  return v_out || v_cur || E'\r\n';
end $$;

-- 名字放進 CN="..." 裡：拿掉雙引號與換行，其他照原樣。
create or replace function public.ics_cn(p text)
returns text language sql immutable
as $$ select btrim(translate(coalesce(p, ''), E'"\r\n;:', '     ')) $$;

drop function if exists public.meeting_ics(uuid);
create or replace function public.meeting_ics(p_id uuid, p_method text default 'REQUEST')
returns text language plpgsql stable
set search_path = public, pg_temp
as $$
declare m record; v text; a record; z text := to_char(now() at time zone 'UTC', 'YYYYMMDD"T"HH24MISS"Z"');
        v_main text := public.meeting_main_email(); v_org_mail text; v_org_name text; v_role text; v_has_main boolean := false;
        v_method text := case when upper(coalesce(p_method, '')) = 'CANCEL' then 'CANCEL' else 'REQUEST' end;
        v_desc text;
begin
  select * into m from meetings where id = p_id;
  if m.id is null then return null; end if;
  select lower(u.email), coalesce(nullif(btrim(p.name_zh), ''), nullif(btrim(p.name_en), ''), u.email) into v_org_mail, v_org_name
    from auth.users u left join profiles p on p.id = u.id where u.id = m.created_by;
  if v_org_mail is null then v_org_mail := v_main; v_org_name := 'Beyond Taiwan'; end if;
  v_role := case when m.required then 'REQ-PARTICIPANT' else 'OPT-PARTICIPANT' end;
  v_desc := case when coalesce(btrim(m.agenda), '') <> '' then m.agenda || E'\n\n' else '' end
         || '回覆出席 / Reply: https://beyondtaiwannpo.com/home/?meeting=' || m.id::text;
  v := 'BEGIN:VCALENDAR' || E'\r\n' || 'VERSION:2.0' || E'\r\n' || 'PRODID:-//Beyond Taiwan//bt-site//EN' || E'\r\n'
    || 'METHOD:' || v_method || E'\r\n'
    || 'BEGIN:VEVENT' || E'\r\n'
    || 'UID:meeting-' || m.id::text || '@beyondtaiwannpo.com' || E'\r\n'
    || 'SEQUENCE:' || m.ics_seq::text || E'\r\n'
    || 'DTSTAMP:' || z || E'\r\n'
    || 'DTSTART:' || to_char(m.starts_at at time zone 'UTC', 'YYYYMMDD"T"HH24MISS"Z"') || E'\r\n'
    || 'DTEND:' || to_char(m.ends_at at time zone 'UTC', 'YYYYMMDD"T"HH24MISS"Z"') || E'\r\n'
    || public.ics_fold('SUMMARY:' || public.ics_escape(m.title))
    || public.ics_fold('DESCRIPTION:' || public.ics_escape(v_desc))
    || case when m.doc_url is not null then public.ics_fold('URL:' || m.doc_url) else '' end
    || 'STATUS:' || case when v_method = 'CANCEL' then 'CANCELLED' else 'CONFIRMED' end || E'\r\n';
  if v_org_mail is not null then
    v := v || public.ics_fold('ORGANIZER;CN="' || public.ics_cn(v_org_name) || '":mailto:' || v_org_mail);
  end if;
  for a in select lower(u.email) as email, coalesce(nullif(btrim(p.name_zh), ''), nullif(btrim(p.name_en), ''), u.email) as name, ma.status
             from meeting_attendees ma join auth.users u on u.id = ma.user_id left join profiles p on p.id = ma.user_id
            where ma.meeting_id = m.id and u.email is not null order by 1 loop
    if a.email = v_main then v_has_main := true; end if;
    v := v || public.ics_fold('ATTENDEE;CN="' || public.ics_cn(a.name) || '";ROLE=' || v_role || ';PARTSTAT='
      || case a.status when 'accepted' then 'ACCEPTED' when 'declined' then 'DECLINED' else 'NEEDS-ACTION' end
      || ';RSVP=TRUE:mailto:' || a.email);
  end loop;
  if v_main is not null and not v_has_main then
    v := v || public.ics_fold('ATTENDEE;CN="Beyond Taiwan";ROLE=NON-PARTICIPANT;PARTSTAT=ACCEPTED;RSVP=FALSE:mailto:' || v_main);
  end if;
  return v || 'END:VEVENT' || E'\r\n' || 'END:VCALENDAR' || E'\r\n';
end $$;
-- 讀得到每個人的信箱：只給資料庫內部（security definer 的函式）叫。
revoke all on function public.meeting_ics(uuid, text) from public, anon, authenticated;
revoke all on function public.ics_fold(text) from public, anon;
revoke all on function public.ics_cn(text) from public, anon;
revoke all on function public.meeting_main_email() from public, anon, authenticated;

-- ---------- 4. 排隊寄信：照信箱寄（BT 主帳號沒有帳號） ----------
create or replace function public.queue_meeting_mail_to(p_kind text, p_meeting uuid, p_to text)
returns uuid language plpgsql security definer
set search_path = public, pg_temp
as $$
declare m record; v_to text := lower(btrim(coalesce(p_to, ''))); v_name text; v_tz text; v_when text; v_sub text; v_body text; v_link text; v_id uuid;
begin
  if v_to = '' then return null; end if;
  select * into m from meetings where id = p_meeting;
  if m.id is null then raise exception 'no_such_meeting' using errcode = 'P0001'; end if;
  select coalesce(nullif(btrim(p.name_zh), ''), nullif(btrim(p.name_en), ''), ''), coalesce(nullif(p.tz, ''), 'Asia/Taipei')
    into v_name, v_tz from auth.users u join profiles p on p.id = u.id where lower(u.email) = v_to limit 1;
  if v_name is null or v_name = '' then v_name := case when v_to = public.meeting_main_email() then 'Beyond Taiwan' else '' end; end if;
  v_tz := coalesce(v_tz, 'Asia/Taipei');
  begin
    v_when := to_char(m.starts_at at time zone v_tz, 'YYYY-MM-DD HH24:MI') || '–' || to_char(m.ends_at at time zone v_tz, 'HH24:MI') || '（' || v_tz || '）';
  exception when others then
    v_when := to_char(m.starts_at at time zone 'Asia/Taipei', 'YYYY-MM-DD HH24:MI') || '–' || to_char(m.ends_at at time zone 'Asia/Taipei', 'HH24:MI') || '（Asia/Taipei）';
  end;
  v_link := 'https://beyondtaiwannpo.com/home/?meeting=' || m.id::text;
  select subject, body into v_sub, v_body from mail_templates where kind = p_kind;
  if v_sub is null then v_sub := '{title}'; v_body := '{name}：{title}，{when}' || E'\n' || '{link}'; end if;
  v_sub  := public.meeting_fill(v_sub,  v_name, m.title, v_when, m.agenda, m.doc_url, v_link);
  v_body := public.meeting_fill(v_body, v_name, m.title, v_when, m.agenda, m.doc_url, v_link) || public.mail_tail(p_kind);
  insert into mail_outbox (to_email, subject, body, kind, meeting_id, ics)
  values (v_to, v_sub, v_body, p_kind, m.id,
          case when p_kind = 'meeting_cancel' then public.meeting_ics(m.id, 'CANCEL')
               when p_kind in ('meeting_invite', 'meeting_reminder', 'meeting_update') then public.meeting_ics(m.id, 'REQUEST')
               else null end)
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.queue_meeting_mail_to(text, uuid, text) from public, anon, authenticated;

-- 原本照人寄的那支留著（提醒信、看板排會都叫它），裡面改成查信箱再交給上面那支。
create or replace function public.queue_meeting_mail(p_kind text, p_meeting uuid, p_user uuid)
returns uuid language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_to text;
begin
  if not exists (select 1 from meetings where id = p_meeting) then raise exception 'no_such_meeting' using errcode = 'P0001'; end if;
  select u.email into v_to from auth.users u join profiles p on p.id = u.id where u.id = p_user;
  if v_to is null then return null; end if;
  return public.queue_meeting_mail_to(p_kind, p_meeting, v_to);
end $$;

-- 誰的日曆上現在有這一場：寄出去的邀請、更新、取消裡，每個信箱看最後一封；最後一封不是取消就算有。
create or replace function public.meeting_on_calendar(p_meeting uuid)
returns setof text language sql stable
set search_path = public, pg_temp
as $$
  select e from (
    select distinct on (lower(to_email)) lower(to_email) as e, kind
      from mail_outbox
     where meeting_id = p_meeting and sent_at is not null and kind in ('meeting_invite', 'meeting_update', 'meeting_cancel')
     order by lower(to_email), created_at desc
  ) x where kind <> 'meeting_cancel'
$$;
revoke all on function public.meeting_on_calendar(uuid) from public, anon, authenticated;

-- 現在應該在日曆上的人：名單上每個人加 BT 主帳號。
create or replace function public.meeting_should_have(p_meeting uuid)
returns setof text language sql stable
set search_path = public, pg_temp
as $$
  select lower(u.email) from meeting_attendees a join auth.users u on u.id = a.user_id where a.meeting_id = p_meeting and u.email is not null
  union
  select public.meeting_main_email() where public.meeting_main_email() is not null
$$;
revoke all on function public.meeting_should_have(uuid) from public, anon, authenticated;

-- ---------- 5. 寄更新：改完停手 10 分鐘，或 24 小時內就要開 ----------
create or replace function public.meeting_flush_calendar(p_meeting uuid default null)
returns int language plpgsql security definer
set search_path = public, pg_temp
as $$
declare m record; e text; n int := 0; v_on text[]; v_should text[];
begin
  for m in select * from meetings
            where cal_dirty_at is not null
              and (p_meeting is null or id = p_meeting)
              and (p_meeting is not null or cal_dirty_at <= now() - interval '10 minutes' or starts_at <= now() + interval '24 hours')
  loop
    -- 已經開完的會（例如會後才補會議紀錄連結）不寄任何更新或取消，記號清掉就好。
    if m.ends_at <= now() then update meetings set cal_dirty_at = null where id = m.id; continue; end if;
    -- 還沒寄出去的那幾封是舊的內容，拿掉重排。
    delete from mail_outbox where meeting_id = m.id and sent_at is null and kind in ('meeting_invite', 'meeting_update', 'meeting_cancel');
    select coalesce(array_agg(x), '{}') into v_on from public.meeting_on_calendar(m.id) x;
    select coalesce(array_agg(x), '{}') into v_should from public.meeting_should_have(m.id) x;
    update meetings set ics_seq = ics_seq + 1, cal_dirty_at = null where id = m.id;
    foreach e in array v_should loop
      perform public.queue_meeting_mail_to(case when e = any(v_on) then 'meeting_update' else 'meeting_invite' end, m.id, e); n := n + 1;
    end loop;
    foreach e in array v_on loop
      if not e = any(v_should) then perform public.queue_meeting_mail_to('meeting_cancel', m.id, e); n := n + 1; end if;
    end loop;
  end loop;
  return n;
end $$;
revoke all on function public.meeting_flush_calendar(uuid) from public, anon, authenticated;

-- ---------- 6. 改會：寄過邀請的會改了就記下來 ----------
create or replace function public.save_meeting(
  p_id uuid, p_scope text, p_title text, p_starts timestamptz, p_ends timestamptz, p_agenda text, p_doc_url text, p_attendees uuid[],
  p_required boolean default null)
returns uuid language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_id uuid; v_scope text := coalesce(nullif(btrim(p_scope), ''), 'board'); v_old record; v_before uuid[]; v_after uuid[];
begin
  if not public.is_cadre() then raise exception 'not_cadre' using errcode = 'P0001'; end if;
  if not public.can_schedule(v_scope) then raise exception 'not_allowed' using errcode = 'P0001'; end if;
  if coalesce(btrim(p_title), '') = '' then raise exception 'empty_title' using errcode = 'P0001'; end if;
  if p_starts is null or p_ends is null or p_ends <= p_starts then raise exception 'bad_time' using errcode = 'P0001'; end if;
  if p_doc_url is not null and btrim(p_doc_url) <> '' and p_doc_url !~ '^https://(docs|drive)\.google\.com/' then raise exception 'bad_doc_url' using errcode = 'P0001'; end if;
  if p_id is not null then
    select * into v_old from meetings where id = p_id;
    if v_old.id is null then raise exception 'no_such_meeting' using errcode = 'P0001'; end if;
    if not public.can_schedule(v_old.scope) then raise exception 'not_allowed' using errcode = 'P0001'; end if;
    select coalesce(array_agg(user_id order by user_id), '{}') into v_before from meeting_attendees where meeting_id = p_id;
    update meetings set scope = v_scope, title = btrim(p_title), starts_at = p_starts, ends_at = p_ends, agenda = coalesce(p_agenda, ''),
      doc_url = nullif(btrim(coalesce(p_doc_url, '')), ''), required = coalesce(p_required, required), updated_at = now() where id = p_id;
    v_id := p_id;
  else
    insert into meetings (scope, title, starts_at, ends_at, agenda, doc_url, created_by, required)
    values (v_scope, btrim(p_title), p_starts, p_ends, coalesce(p_agenda, ''), nullif(btrim(coalesce(p_doc_url, '')), ''), auth.uid(), coalesce(p_required, false))
    returning id into v_id;
  end if;
  -- 名單：新的加進去，拿掉的刪掉，留著的不動（回覆過的不會被洗掉）。只收幹部。
  delete from meeting_attendees where meeting_id = v_id and not (user_id = any(coalesce(p_attendees, '{}')));
  delete from meeting_rsvp_notes where meeting_id = v_id and not (user_id = any(coalesce(p_attendees, '{}')));
  insert into meeting_attendees (meeting_id, user_id)
  select v_id, u from unnest(coalesce(p_attendees, '{}')) u join profiles p on p.id = u and p.role = 'cadre'
  on conflict (meeting_id, user_id) do nothing;
  -- 2026-11-18：寄過邀請的會，內容或名單改了，記下來等停手再寄更新（見 meeting_flush_calendar）。
  if p_id is not null and exists (select 1 from mail_outbox where meeting_id = v_id and kind in ('meeting_invite', 'meeting_update')) then
    select coalesce(array_agg(user_id order by user_id), '{}') into v_after from meeting_attendees where meeting_id = v_id;
    if v_old.title is distinct from btrim(p_title) or v_old.starts_at is distinct from p_starts or v_old.ends_at is distinct from p_ends
       or v_old.agenda is distinct from coalesce(p_agenda, '') or v_old.doc_url is distinct from nullif(btrim(coalesce(p_doc_url, '')), '')
       or v_old.required is distinct from coalesce(p_required, v_old.required) or v_before is distinct from v_after then
      update meetings set cal_dirty_at = now() where id = v_id;
    end if;
  end if;
  return v_id;
end $$;
revoke all on function public.save_meeting(uuid, text, text, timestamptz, timestamptz, text, text, uuid[], boolean) from public, anon;
grant execute on function public.save_meeting(uuid, text, text, timestamptz, timestamptz, text, text, uuid[], boolean) to authenticated;

-- ---------- 7. 從看板排會：名單上每個人加 BT 主帳號各一封邀請 ----------
create or replace function public.schedule_meeting(
  p_scope text, p_title text, p_starts timestamptz, p_ends timestamptz, p_agenda text, p_doc_url text, p_attendees uuid[],
  p_required boolean default false)
returns uuid language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_id uuid; e text; n int := 0;
begin
  v_id := public.save_meeting(null, p_scope, p_title, p_starts, p_ends, p_agenda, p_doc_url, p_attendees, coalesce(p_required, false));
  for e in select x from public.meeting_should_have(v_id) x loop
    perform public.queue_meeting_mail_to('meeting_invite', v_id, e); n := n + 1;
  end loop;
  if n > 0 then perform public.meeting_try_send(); end if;
  return v_id;
end $$;
revoke all on function public.schedule_meeting(text, text, timestamptz, timestamptz, text, text, uuid[], boolean) from public, anon;
grant execute on function public.schedule_meeting(text, text, timestamptz, timestamptz, text, text, uuid[], boolean) to authenticated;

-- ---------- 8. 刪會：日曆上有這場的人各一封取消 ----------
create or replace function public.delete_meeting(p_id uuid)
returns text language plpgsql security definer
set search_path = public, pg_temp
as $$
declare m record; e text; n int := 0;
begin
  select * into m from meetings where id = p_id;
  if m.id is null then raise exception 'no_such_meeting' using errcode = 'P0001'; end if;
  if not public.can_schedule(m.scope) then raise exception 'not_allowed' using errcode = 'P0001'; end if;
  -- 2026-11-16：還沒寄出去的邀請與提醒一起拿掉，不然收到信的人點連結會看到「找不到這場會」。
  delete from mail_outbox where meeting_id = p_id and sent_at is null;
  -- 2026-11-18：已經在日曆上的人寄取消（會已經開完的不寄）。信先排進去，會刪掉之後 meeting_id 變空的，信照寄。
  if m.ends_at > now() then
    update meetings set ics_seq = ics_seq + 1 where id = p_id;
    for e in select x from public.meeting_on_calendar(p_id) x loop
      perform public.queue_meeting_mail_to('meeting_cancel', p_id, e); n := n + 1;
    end loop;
  end if;
  delete from meetings where id = p_id;
  if n > 0 then perform public.meeting_try_send(); end if;
  return 'deleted';
end $$;
revoke all on function public.delete_meeting(uuid) from public, anon;
grant execute on function public.delete_meeting(uuid) to authenticated;

-- ---------- 9. 提醒信的排程順便寄更新 ----------
create or replace function public.queue_meeting_reminders()
returns int language plpgsql security definer
set search_path = public, pg_temp
as $$
declare m record; u uuid; n int := 0;
begin
  n := public.meeting_flush_calendar();
  for m in select * from meetings where reminded_at is null and starts_at > now() and starts_at <= now() + interval '24 hours' loop
    for u in select user_id from meeting_attendees where meeting_id = m.id and status <> 'declined' loop
      perform public.queue_meeting_mail('meeting_reminder', m.id, u); n := n + 1;
    end loop;
    if public.queue_meeting_summary(m.id) is not null then n := n + 1; end if;
    update meetings set reminded_at = now() where id = m.id;
  end loop;
  return n;
end $$;

-- ---------- 10. 寄信：附件改成真正的邀請 ----------
-- 2026-11-16 那一版整支，唯一的差別是附件：檔名 invite.ics、類型帶 method（Gmail 看這個決定要不要顯示成邀請）。
create or replace function public.send_pending_mail(p_limit int default 40)
returns table (sent int, failed int) language plpgsql security definer
set search_path = public, extensions, net, vault, auth, pg_temp
as $$
declare
  r public.mail_outbox%rowtype; v_key text; v_from text; v_sent int := 0; v_failed int := 0; v_req bigint; v_have text; v_body jsonb;
  v_lang text; v_sub text; v_txt text; v_label text; v_url text; v_html text; v_tail_pos int; v_method text;
begin
  if not public.is_cadre() then raise exception 'not_cadre' using errcode = 'P0001'; end if;
  select decrypted_secret into v_key from vault.decrypted_secrets
   where public.norm_secret_name(name) in ('RESENDAPIKEY', 'RESENDAPI', 'RESENDKEY', 'RESEND') limit 1;
  select decrypted_secret into v_from from vault.decrypted_secrets
   where public.norm_secret_name(name) in ('BTMAILFROM', 'MAILFROM', 'BTFROM', 'FROM') limit 1;
  if v_key is null or v_from is null then
    select coalesce(string_agg(name, '、' order by name), '（一個都沒有）') into v_have from vault.decrypted_secrets;
    raise exception 'mail_not_configured：缺 %。Vault 裡現在有：%',
      case when v_key is null and v_from is null then 'RESEND_API_KEY 與 BT_MAIL_FROM' when v_key is null then 'RESEND_API_KEY' else 'BT_MAIL_FROM' end, v_have
      using errcode = 'P0001', hint = '到 Supabase 的 Vault 把名字改成 RESEND_API_KEY 與 BT_MAIL_FROM（大小寫與底線要一樣）。';
  end if;
  for r in select * from public.mail_outbox where sent_at is null and tries < 5 order by created_at limit greatest(1, least(coalesce(p_limit, 40), 200))
  loop
    begin
      -- 2026-11-05：寄之前包版型。語言照收信的人；主旨與純文字也只留那一種語言（one_lang 關掉就兩種都留）。
      v_lang := public.mail_lang_pick(r.kind, r.to_email, r.lang);
      v_sub := public.mail_pick_lang_subject(r.subject, v_lang);
      v_txt := r.body;
      v_tail_pos := greatest(position(E'\n\n不要回覆這封信' in v_txt), position(E'\n\n這封信是告知' in v_txt));
      v_txt := case when v_tail_pos > 0 then public.mail_pick_lang_part(substring(v_txt from 1 for v_tail_pos - 1), v_lang) || substring(r.body from v_tail_pos) else public.mail_pick_lang_part(v_txt, v_lang) end;
      select case when v_lang = 'en' then t.button_label_en else t.button_label end into v_label from mail_templates t where t.kind = r.kind;
      v_url := public.mail_button_url(r);
      v_html := public.mail_html(r.kind, v_sub, case when v_tail_pos > 0 then public.mail_pick_lang_part(substring(r.body from 1 for v_tail_pos - 1), v_lang) else public.mail_pick_lang_part(r.body, v_lang) end, v_label, v_url, case when v_lang = 'en' then 'en' else 'zh' end);
      v_body := jsonb_build_object('from', v_from, 'to', jsonb_build_array(r.to_email), 'subject', v_sub, 'text', v_txt, 'html', v_html);
      if r.ics is not null then
        -- 2026-11-18：類型帶 method，Gmail 才會顯示成「要參加嗎」的邀請並放進日曆。
        v_method := coalesce(substring(r.ics from 'METHOD:([A-Z]+)'), 'PUBLISH');
        v_body := v_body || jsonb_build_object('attachments', jsonb_build_array(jsonb_build_object(
          'filename', 'invite.ics', 'content', translate(encode(convert_to(r.ics, 'UTF8'), 'base64'), E'\n', ''),
          'content_type', 'text/calendar; charset=utf-8; method=' || v_method)));
      end if;
      select net.http_post(url := 'https://api.resend.com/emails',
        headers := jsonb_build_object('Authorization', 'Bearer ' || v_key, 'Content-Type', 'application/json'),
        body := v_body) into v_req;
      update public.mail_outbox set sent_at = now(), tries = tries + 1, error = null where id = r.id;
      v_sent := v_sent + 1;
    exception when others then
      update public.mail_outbox set tries = tries + 1, error = left(SQLERRM, 500) where id = r.id;
      v_failed := v_failed + 1;
    end;
  end loop;
  return query select v_sent, v_failed;
end $$;

commit;

-- ---------- 驗收 ----------
select * from (
  with t as (
    select (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'meetings'
              and column_name in ('ics_seq', 'cal_dirty_at')) as cols,
           public.meeting_main_email() as main,
           (select pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.mail_outbox'::regclass and conname = 'mail_outbox_kind_check') like '%meeting_cancel%' as outbox_kinds,
           (select pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.mail_templates'::regclass and conname = 'mail_templates_kind_check') like '%meeting_update%' as tpl_kinds,
           (select count(*) from public.mail_templates where kind in ('meeting_update', 'meeting_cancel')) as tpls,
           (select prosrc from pg_proc where proname = 'meeting_ics' limit 1) as ics_src,
           position('meeting_should_have' in (select prosrc from pg_proc where proname = 'schedule_meeting' limit 1)) > 0 as sched_main,
           position('cal_dirty_at = now()' in (select prosrc from pg_proc where proname = 'save_meeting' limit 1)) > 0 as save_dirty,
           position('meeting_cancel' in (select prosrc from pg_proc where proname = 'delete_meeting' limit 1)) > 0 as del_cancel,
           position('method=' in (select prosrc from pg_proc where proname = 'send_pending_mail' limit 1)) > 0 as send_method,
           position('meeting_flush_calendar' in (select prosrc from pg_proc where proname = 'queue_meeting_reminders' limit 1)) > 0 as flush_hook,
           not has_function_privilege('authenticated', 'public.meeting_ics(uuid, text)', 'execute')
             and not has_function_privilege('anon', 'public.meeting_ics(uuid, text)', 'execute')
             and not has_function_privilege('authenticated', 'public.queue_meeting_mail_to(text, uuid, text)', 'execute') as ics_private,
           (select count(*) from pg_proc where proname = 'meeting_ics') as ics_fns
  )
  select 0 ord, 'OVERALL' as 項目, null::text as 應該是, null::text as 實際是,
    case when cols = 2 and main is not null and outbox_kinds and tpl_kinds and tpls = 2
              and ics_src like '%METHOD:%' and ics_src like '%ORGANIZER%' and ics_src like '%ATTENDEE%' and ics_src like '%SEQUENCE%'
              and sched_main and save_dirty and del_cancel and send_method and flush_hook and ics_private and ics_fns = 1
         then 'PASS' else 'FAIL' end as 結果 from t
  union all select 1, '會議多兩欄（版本號、改了還沒寄）', '2', cols::text, case when cols = 2 then 'PASS' else 'FAIL' end from t
  union all select 2, '★ BT 主帳號的信箱設好了', '（一個信箱）', coalesce(main, '（空的）'), case when main is not null then 'PASS' else 'FAIL' end from t
  union all select 3, '信的種類多 meeting_update、meeting_cancel', 'true / true', outbox_kinds::text || ' / ' || tpl_kinds::text, case when outbox_kinds and tpl_kinds then 'PASS' else 'FAIL' end from t
  union all select 4, '兩封新信的預設文案在', '2', tpls::text, case when tpls = 2 then 'PASS' else 'FAIL' end from t
  union all select 5, '★ 日曆檔是邀請：有主辦人、來賓、版本號', 'true', (ics_src like '%METHOD:%' and ics_src like '%ORGANIZER%' and ics_src like '%ATTENDEE%' and ics_src like '%SEQUENCE%')::text,
    case when ics_src like '%METHOD:%' and ics_src like '%ORGANIZER%' and ics_src like '%ATTENDEE%' and ics_src like '%SEQUENCE%' then 'PASS' else 'FAIL' end from t
  union all select 6, '★ 看板排會時 BT 主帳號也收一封邀請', 'true', sched_main::text, case when sched_main then 'PASS' else 'FAIL' end from t
  union all select 7, '★ 改會先記下來，停手再寄更新', 'true', save_dirty::text, case when save_dirty then 'PASS' else 'FAIL' end from t
  union all select 8, '★ 刪會寄取消', 'true', del_cancel::text, case when del_cancel then 'PASS' else 'FAIL' end from t
  union all select 9, '附件的類型帶 method', 'true', send_method::text, case when send_method then 'PASS' else 'FAIL' end from t
  union all select 10, '提醒信的排程順便寄更新', 'true', flush_hook::text, case when flush_hook then 'PASS' else 'FAIL' end from t
  union all select 11, '★ 日曆檔與照信箱寄信只給資料庫內部（讀得到每個人的信箱）', 'true', ics_private::text, case when ics_private then 'PASS' else 'FAIL' end from t
  union all select 12, '舊的一個參數那支拿掉了', '1', ics_fns::text, case when ics_fns = 1 then 'PASS' else 'FAIL' end from t
) x order by ord;
