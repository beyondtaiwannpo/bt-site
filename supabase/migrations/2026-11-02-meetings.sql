-- 會議紀錄與排會　2026-11-02（批 1：資料庫）
--
-- 用法：整份貼進 Supabase SQL Editor 按一次 Run。可以重跑。最後印一張 PASS / FAIL 表。
-- **要先跑過 2026-11-01-events.sql**（順序照日期）。
-- **pg_cron**：這一支不會自己開擴充（開擴充要專案擁有人在 Dashboard → Database → Extensions 打開 pg_cron）。
--   已經開了的話這一支會排一條「每 15 分鐘」的工作；沒開就跳過，提醒信改靠下一個進後台的人（tick_mail()）。
--   先跑這一支、之後才開 pg_cron 的話，**再跑一次這一支**就會排上。
--
-- Paul 2026-10-24：會議紀錄進後台、從看板排會、信裡附 .ics 加「加到 Google 日曆」連結、24 小時前提醒、senior 與自己 team 的 Director 能排、
-- 出席的人登入後回「會到／不能到」、紀錄全部幹部看得到。設計在 docs/2026-10-24-會議與排程.md。
--
-- ============================================================================
-- 這一支在做什麼
-- ============================================================================
--   1. 兩張表：meetings（範圍 board 或 team 名、標題、時間、一行議程、Drive 連結）、meeting_attendees（誰、會不會到）。
--   2. 信：mail_outbox 多 ics 與 meeting_id 兩欄；kind 多 meeting_invite、meeting_reminder；兩封預設文案。
--      send_pending_mail() 整支重建，唯一的差別是 outbox 那一列有 ics 就當附件（meeting.ics，base64）送給 Resend。
--   3. 函式：can_schedule(scope)、save_meeting()（建或改、連出席名單）、delete_meeting()、schedule_meeting()（存完排邀請信並直接寄）、
--      set_rsvp()（出席的人改自己那一筆）、queue_meeting_reminders()（24 小時內要開的排提醒信，一場只排一次）、tick_mail()（後台開頁叫：排提醒加寄信）。
--   4. RLS：幹部讀兩張表；沒有寫的政策，一律走函式。
-- ============================================================================

begin;

-- ---------- 1. 表 ----------
create table if not exists public.meetings (
  id          uuid primary key default gen_random_uuid(),
  scope       text not null default 'board',
  title       text not null,
  starts_at   timestamptz not null,
  ends_at     timestamptz not null,
  agenda      text not null default '',
  doc_url     text,
  reminded_at timestamptz,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (ends_at > starts_at),
  check (doc_url is null or doc_url ~ '^https://(docs|drive)\.google\.com/')
);
create index if not exists meetings_starts on public.meetings (starts_at);
create table if not exists public.meeting_attendees (
  meeting_id  uuid not null references public.meetings(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  status      text not null default 'invited' check (status in ('invited', 'accepted', 'declined')),
  invited_at  timestamptz not null default now(),
  replied_at  timestamptz,
  primary key (meeting_id, user_id)
);
alter table public.meetings enable row level security;
alter table public.meeting_attendees enable row level security;
revoke all on public.meetings, public.meeting_attendees from anon, authenticated;
grant select on public.meetings, public.meeting_attendees to authenticated;
drop policy if exists meetings_read on public.meetings;
create policy meetings_read on public.meetings for select to authenticated using (public.is_cadre());
drop policy if exists meeting_attendees_read on public.meeting_attendees;
create policy meeting_attendees_read on public.meeting_attendees for select to authenticated using (public.is_cadre());

-- ---------- 2. 信 ----------
alter table public.mail_outbox add column if not exists ics text;
alter table public.mail_outbox add column if not exists meeting_id uuid references public.meetings(id) on delete set null;
do $$
declare v text;
begin
  select conname into v from pg_constraint where conrelid = 'public.mail_outbox'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%kind%';
  if v is not null then execute format('alter table public.mail_outbox drop constraint %I', v); end if;
  alter table public.mail_outbox add constraint mail_outbox_kind_check
    check (kind in ('guardian', 'interview', 'accepted', 'rejected', 'notice', 'invite', 'request_new', 'request_done', 'meeting_invite', 'meeting_reminder'));
  select conname into v from pg_constraint where conrelid = 'public.mail_templates'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%kind%';
  if v is not null then execute format('alter table public.mail_templates drop constraint %I', v); end if;
  alter table public.mail_templates add constraint mail_templates_kind_check
    check (kind in ('guardian', 'interview', 'accepted', 'rejected', 'invite', 'request_new', 'request_done', 'meeting_invite', 'meeting_reminder'));
end $$;
-- 幹部在 outbox 看得到自己這場會的信（總覽「還沒寄出的信」才算得到）。
drop policy if exists mail_read_meetings on public.mail_outbox;
create policy mail_read_meetings on public.mail_outbox for select to authenticated
  using (meeting_id is not null and public.is_cadre());

-- 預設文案，中英各一段。代換符號：{name} 收信的人、{title}、{when} 他自己時區的時間、{agenda}、{doc} Drive 連結、{link} 回站上回覆的連結。
insert into public.mail_templates (kind, subject, body) values
('meeting_invite',
 'BT 會議邀請：{title}　Meeting invite: {title}',
 '{name} 你好，' || E'\n\n' ||
 '邀請你參加「{title}」。' || E'\n' ||
 '時間（你的時區）：{when}' || E'\n' ||
 '議程：{agenda}' || E'\n' ||
 '會議紀錄：{doc}' || E'\n\n' ||
 '這封信附了一個 .ics 檔，點開就能加進你的日曆。會不會到，登入後按一下：' || E'\n' ||
 '{link}' || E'\n\n' ||
 'Hi {name},' || E'\n\n' ||
 'You are invited to "{title}".' || E'\n' ||
 'When (your time zone): {when}' || E'\n' ||
 'Agenda: {agenda}' || E'\n' ||
 'Notes: {doc}' || E'\n\n' ||
 'The attached .ics adds it to your calendar. Let us know if you can make it (sign in first):' || E'\n' ||
 '{link}'),
('meeting_reminder',
 '明天開會：{title}　Reminder: {title} tomorrow',
 '{name} 你好，' || E'\n\n' ||
 '提醒你「{title}」在 {when}（你的時區）。' || E'\n' ||
 '議程：{agenda}' || E'\n' ||
 '會議紀錄：{doc}' || E'\n\n' ||
 '還沒回會不會到的話，登入後按一下：' || E'\n' ||
 '{link}' || E'\n\n' ||
 'Hi {name},' || E'\n\n' ||
 'A reminder that "{title}" is at {when} (your time zone).' || E'\n' ||
 'Agenda: {agenda}' || E'\n' ||
 'Notes: {doc}' || E'\n\n' ||
 'If you have not replied yet, sign in and let us know:' || E'\n' ||
 '{link}')
on conflict (kind) do nothing;

create or replace function public.meeting_fill(p_text text, p_name text, p_title text, p_when text, p_agenda text, p_doc text, p_link text)
returns text language sql immutable
as $$
  select replace(replace(replace(replace(replace(replace(coalesce(p_text, ''),
           '{name}', coalesce(p_name, '')), '{title}', coalesce(p_title, '')), '{when}', coalesce(p_when, '')),
           '{agenda}', coalesce(nullif(btrim(p_agenda), ''), '（還沒寫）')), '{doc}', coalesce(nullif(btrim(p_doc), ''), '（開完會再補）')),
           '{link}', coalesce(p_link, ''))
$$;

-- .ics 的字（RFC 5545 最基本的那幾行）。每一行 CRLF 結尾；逗號、分號、反斜線、換行要跳脫；長度不折行（這幾個欄位都短）。
create or replace function public.ics_escape(p text)
returns text language sql immutable
as $$ select replace(replace(replace(replace(coalesce(p, ''), E'\\', E'\\\\'), ';', E'\;'), ',', E'\\,'), E'\n', E'\\n') $$;
create or replace function public.meeting_ics(p_id uuid)
returns text language plpgsql stable
set search_path = public, pg_temp
as $$
declare m record; v text; z text := to_char(now() at time zone 'UTC', 'YYYYMMDD"T"HH24MISS"Z"');
begin
  select * into m from meetings where id = p_id;
  if m.id is null then return null; end if;
  v := 'BEGIN:VCALENDAR' || E'\r\n' || 'VERSION:2.0' || E'\r\n' || 'PRODID:-//Beyond Taiwan//bt-site//EN' || E'\r\n' || 'METHOD:PUBLISH' || E'\r\n'
    || 'BEGIN:VEVENT' || E'\r\n'
    || 'UID:meeting-' || m.id::text || E'\r\n'
    || 'DTSTAMP:' || z || E'\r\n'
    || 'DTSTART:' || to_char(m.starts_at at time zone 'UTC', 'YYYYMMDD"T"HH24MISS"Z"') || E'\r\n'
    || 'DTEND:' || to_char(m.ends_at at time zone 'UTC', 'YYYYMMDD"T"HH24MISS"Z"') || E'\r\n'
    || 'SUMMARY:' || public.ics_escape(m.title) || E'\r\n'
    || case when coalesce(btrim(m.agenda), '') <> '' then 'DESCRIPTION:' || public.ics_escape(m.agenda) || E'\r\n' else '' end
    || case when m.doc_url is not null then 'URL:' || m.doc_url || E'\r\n' else '' end
    || 'END:VEVENT' || E'\r\n' || 'END:VCALENDAR' || E'\r\n';
  return v;
end $$;

-- 排一封會議的信（內部用）。{when} 照收信的人 profiles.tz 印；沒有時區就台北。
create or replace function public.queue_meeting_mail(p_kind text, p_meeting uuid, p_user uuid)
returns uuid language plpgsql security definer
set search_path = public, pg_temp
as $$
declare m record; v_to text; v_name text; v_tz text; v_when text; v_sub text; v_body text; v_link text; v_id uuid;
begin
  select * into m from meetings where id = p_meeting;
  if m.id is null then raise exception 'no_such_meeting' using errcode = 'P0001'; end if;
  select u.email, coalesce(nullif(btrim(p.name_zh), ''), nullif(btrim(p.name_en), ''), ''), coalesce(nullif(p.tz, ''), 'Asia/Taipei')
    into v_to, v_name, v_tz from auth.users u join profiles p on p.id = u.id where u.id = p_user;
  if v_to is null then return null; end if;
  begin
    v_when := to_char(m.starts_at at time zone v_tz, 'YYYY-MM-DD HH24:MI') || '–' || to_char(m.ends_at at time zone v_tz, 'HH24:MI') || '（' || v_tz || '）';
  exception when others then
    v_when := to_char(m.starts_at at time zone 'Asia/Taipei', 'YYYY-MM-DD HH24:MI') || '–' || to_char(m.ends_at at time zone 'Asia/Taipei', 'HH24:MI') || '（Asia/Taipei）';
  end;
  v_link := 'https://beyondtaiwannpo.com/availability/?meeting=' || m.id::text;
  select subject, body into v_sub, v_body from mail_templates where kind = p_kind;
  if v_sub is null then v_sub := '{title}'; v_body := '{name}：{title}，{when}' || E'\n' || '{link}'; end if;
  v_sub  := public.meeting_fill(v_sub,  v_name, m.title, v_when, m.agenda, m.doc_url, v_link);
  v_body := public.meeting_fill(v_body, v_name, m.title, v_when, m.agenda, m.doc_url, v_link) || public.mail_tail(p_kind);
  insert into mail_outbox (to_email, subject, body, kind, meeting_id, ics) values (v_to, v_sub, v_body, p_kind, m.id, public.meeting_ics(m.id)) returning id into v_id;
  return v_id;
end $$;
revoke all on function public.queue_meeting_mail(text, uuid, uuid) from public, anon, authenticated;

-- send_pending_mail 整支重建（2026-09-15 那一版）：唯一的差別是有 ics 就帶附件。
create or replace function public.send_pending_mail(p_limit int default 40)
returns table (sent int, failed int) language plpgsql security definer
set search_path = public, extensions, net, vault, pg_temp
as $$
declare
  r record; v_key text; v_from text; v_sent int := 0; v_failed int := 0; v_req bigint; v_have text; v_body jsonb;
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
      v_body := jsonb_build_object('from', v_from, 'to', jsonb_build_array(r.to_email), 'subject', r.subject, 'text', r.body);
      -- 2026-11-02：會議的信附 .ics（Resend 的 attachments 要 base64）。
      if r.ics is not null then
        v_body := v_body || jsonb_build_object('attachments', jsonb_build_array(jsonb_build_object(
          'filename', 'meeting.ics', 'content', translate(encode(convert_to(r.ics, 'UTF8'), 'base64'), E'\n', ''), 'content_type', 'text/calendar')));
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
revoke all on function public.send_pending_mail(int) from public, anon;
grant execute on function public.send_pending_mail(int) to authenticated;

-- ---------- 3. 函式 ----------
-- 誰能排會或記會議：senior 全部；scope 是 team 名的話，那個 team 資源工作區「管」的人（Director）。board 只有 senior。
create or replace function public.can_schedule(p_scope text)
returns boolean language sql stable security definer
set search_path = public, pg_temp
as $$ select public.is_senior() or (coalesce(p_scope, 'board') <> 'board' and public.can_manage('res:' || p_scope)) $$;
revoke all on function public.can_schedule(text) from public, anon;
grant execute on function public.can_schedule(text) to authenticated;

-- 建或改一場會議（p_id 空就是新的）。出席名單整份換（只收幹部）。回 id。不寄信。
create or replace function public.save_meeting(
  p_id uuid, p_scope text, p_title text, p_starts timestamptz, p_ends timestamptz, p_agenda text, p_doc_url text, p_attendees uuid[])
returns uuid language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_id uuid; v_scope text := coalesce(nullif(btrim(p_scope), ''), 'board'); v_old record;
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
    update meetings set scope = v_scope, title = btrim(p_title), starts_at = p_starts, ends_at = p_ends, agenda = coalesce(p_agenda, ''),
      doc_url = nullif(btrim(coalesce(p_doc_url, '')), ''), updated_at = now() where id = p_id;
    v_id := p_id;
  else
    insert into meetings (scope, title, starts_at, ends_at, agenda, doc_url, created_by)
    values (v_scope, btrim(p_title), p_starts, p_ends, coalesce(p_agenda, ''), nullif(btrim(coalesce(p_doc_url, '')), ''), auth.uid()) returning id into v_id;
  end if;
  -- 名單：新的加進去，拿掉的刪掉，留著的不動（回覆過的不會被洗掉）。只收幹部。
  delete from meeting_attendees where meeting_id = v_id and not (user_id = any(coalesce(p_attendees, '{}')));
  insert into meeting_attendees (meeting_id, user_id)
  select v_id, u from unnest(coalesce(p_attendees, '{}')) u join profiles p on p.id = u and p.role = 'cadre'
  on conflict (meeting_id, user_id) do nothing;
  return v_id;
end $$;
revoke all on function public.save_meeting(uuid, text, text, timestamptz, timestamptz, text, text, uuid[]) from public, anon;
grant execute on function public.save_meeting(uuid, text, text, timestamptz, timestamptz, text, text, uuid[]) to authenticated;

create or replace function public.delete_meeting(p_id uuid)
returns text language plpgsql security definer
set search_path = public, pg_temp
as $$
declare m record;
begin
  select * into m from meetings where id = p_id;
  if m.id is null then raise exception 'no_such_meeting' using errcode = 'P0001'; end if;
  if not public.can_schedule(m.scope) then raise exception 'not_allowed' using errcode = 'P0001'; end if;
  delete from meetings where id = p_id;
  return 'deleted';
end $$;
revoke all on function public.delete_meeting(uuid) from public, anon;
grant execute on function public.delete_meeting(uuid) to authenticated;

-- 排完就寄（Paul 2026-10-24）。Resend 沒設好會丟 mail_not_configured，信留在 outbox，總覽那張卡看得到。
create or replace function public.meeting_try_send()
returns void language plpgsql security definer
set search_path = public, pg_temp
as $$ begin begin perform public.send_pending_mail(20); exception when others then null; end; end $$;
revoke all on function public.meeting_try_send() from public, anon, authenticated;

-- 從看板排會：存一場、每一位出席的人一封邀請（附 .ics）、直接寄。回 id。
create or replace function public.schedule_meeting(
  p_scope text, p_title text, p_starts timestamptz, p_ends timestamptz, p_agenda text, p_doc_url text, p_attendees uuid[])
returns uuid language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_id uuid; u uuid; n int := 0;
begin
  v_id := public.save_meeting(null, p_scope, p_title, p_starts, p_ends, p_agenda, p_doc_url, p_attendees);
  for u in select user_id from meeting_attendees where meeting_id = v_id loop
    perform public.queue_meeting_mail('meeting_invite', v_id, u); n := n + 1;
  end loop;
  if n > 0 then perform public.meeting_try_send(); end if;
  return v_id;
end $$;
revoke all on function public.schedule_meeting(text, text, timestamptz, timestamptz, text, text, uuid[]) from public, anon;
grant execute on function public.schedule_meeting(text, text, timestamptz, timestamptz, text, text, uuid[]) to authenticated;

-- 出席的人回會不會到。只能改自己那一筆。
create or replace function public.set_rsvp(p_meeting uuid, p_status text)
returns text language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if p_status not in ('accepted', 'declined', 'invited') then raise exception 'bad_status' using errcode = 'P0001'; end if;
  update meeting_attendees set status = p_status, replied_at = case when p_status = 'invited' then null else now() end
   where meeting_id = p_meeting and user_id = auth.uid();
  if not found then raise exception 'not_invited' using errcode = 'P0001'; end if;
  return p_status;
end $$;
revoke all on function public.set_rsvp(uuid, text) from public, anon;
grant execute on function public.set_rsvp(uuid, text) to authenticated;

-- 24 小時內要開、還沒提醒過的會：每一位沒說不能到的出席者一封提醒。一場只排一次（reminded_at）。回排了幾封。
create or replace function public.queue_meeting_reminders()
returns int language plpgsql security definer
set search_path = public, pg_temp
as $$
declare m record; u uuid; n int := 0;
begin
  for m in select * from meetings where reminded_at is null and starts_at > now() and starts_at <= now() + interval '24 hours' loop
    for u in select user_id from meeting_attendees where meeting_id = m.id and status <> 'declined' loop
      perform public.queue_meeting_mail('meeting_reminder', m.id, u); n := n + 1;
    end loop;
    update meetings set reminded_at = now() where id = m.id;
  end loop;
  return n;
end $$;
revoke all on function public.queue_meeting_reminders() from public, anon, authenticated;

-- 後台開頁叫一次（退路）：排提醒、把 outbox 寄出去。pg_cron 有開的話同一支每 15 分鐘也會跑。
create or replace function public.tick_mail()
returns int language plpgsql security definer
set search_path = public, pg_temp
as $$
declare n int;
begin
  if not public.is_cadre() then raise exception 'not_cadre' using errcode = 'P0001'; end if;
  n := public.queue_meeting_reminders();
  perform public.meeting_try_send();
  return n;
end $$;
revoke all on function public.tick_mail() from public, anon;
grant execute on function public.tick_mail() to authenticated;

-- pg_cron 有開才排；沒開就跳過（提醒靠 tick_mail）。cron 跑的是 postgres 身分，不經過 is_cadre，所以直接叫內部那兩支。
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'bt-meeting-mail';
    perform cron.schedule('bt-meeting-mail', '*/15 * * * *',
      $job$ select public.queue_meeting_reminders(); select public.meeting_try_send(); $job$);
  end if;
end $$;

commit;

-- ---------- 驗收 ----------
select * from (
  with t as (
    select to_regclass('public.meetings') is not null and to_regclass('public.meeting_attendees') is not null as has_tables,
           (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'
              and p.proname in ('can_schedule', 'save_meeting', 'delete_meeting', 'schedule_meeting', 'set_rsvp', 'queue_meeting_reminders', 'tick_mail', 'meeting_ics', 'queue_meeting_mail')) as fns,
           (select count(*) from public.mail_templates where kind in ('meeting_invite', 'meeting_reminder')) as tpls,
           exists(select 1 from information_schema.columns where table_schema = 'public' and table_name = 'mail_outbox' and column_name = 'ics') as has_ics,
           (select regexp_replace(prosrc, '--[^\n]*', '', 'g') like '%attachments%' from pg_proc where proname = 'send_pending_mail') as attach,
           exists(select 1 from pg_extension where extname = 'pg_cron') as cron_on,
           (select count(*) from pg_policies where schemaname = 'public' and tablename in ('meetings', 'meeting_attendees')) as pols
  )
  select 0 ord, 'OVERALL' as 項目, null::text as 應該是, null::text as 實際是,
    case when has_tables and fns = 9 and tpls = 2 and has_ics and attach and pols = 2 then 'PASS' else 'FAIL' end as 結果 from t
  union all select 1, '★ 兩張表在', 'true', has_tables::text, case when has_tables then 'PASS' else 'FAIL' end from t
  union all select 2, '★ 九支函式在', '9', fns::text, case when fns = 9 then 'PASS' else 'FAIL' end from t
  union all select 3, '★ 兩封預設文案', '2', tpls::text, case when tpls = 2 then 'PASS' else 'FAIL' end from t
  union all select 4, '★ outbox 有 ics、send_pending_mail 會帶附件', 'true / true', has_ics::text || ' / ' || attach::text, case when has_ics and attach then 'PASS' else 'FAIL' end from t
  union all select 5, '★ 兩張表各一條讀的政策、沒有寫的', '2', pols::text, case when pols = 2 then 'PASS' else 'FAIL' end from t
  union all select 6, '資訊：pg_cron 有沒有開（沒開提醒靠 tick_mail；開了之後再跑一次這一支）', '（看一眼）', case when cron_on then '開了，排了每 15 分鐘一條' else '沒開' end, 'PASS' from t
) x order by ord;
