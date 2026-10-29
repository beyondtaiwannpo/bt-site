-- 會議接 Google 日曆 API：BT 主帳號建立、自動 Meet 連結、Google 寄邀請　2026-11-22
--
-- 用法：整份貼進 Supabase SQL Editor 按一次 Run。可以重跑。最後印一張 PASS / FAIL 表。
-- **先做完 docs/2026-10-29-google-calendar-setup.md**（http 擴充套件打開、Vault 三個值），再跑這支。
-- **要先跑過 2026-11-18-calendar-invites.sql**。
--
-- Paul 2026-10-29：「排會的人送出去，大家收到信可以登入回覆，同時他們自己的 Google 日曆也出現這場會，
-- 就像在 Google 日曆排 Google Meet 一樣。」決定記在 ~/Anson/decisions/log.md 2026-10-29。
--
-- ============================================================================
-- 這一支在做什麼
-- ============================================================================
--   1. meetings 多三欄：gcal_event_id（Google 那邊的事件編號）、meet_url（Meet 連結）、gcal_error（最後一次失敗的原因）。
--   2. 跟 Google 拿通行證：用 Vault 的 GOOGLE_CLIENT_ID／GOOGLE_CLIENT_SECRET／GOOGLE_REFRESH_TOKEN 換一張
--      一小時有效的 access token，存在一張誰都讀不到的表（gcal_token），快過期才換新的。
--   3. gcal_sync(會議)：還沒有事件就在 BT 主帳號的日曆建一個（附 Meet 連結），有了就改它。
--      來賓是名單上每個人加排會的人。sendUpdates=all：Google 負責寄邀請、改時間的通知、取消。
--   4. 排會（schedule_meeting）：先建 Google 事件，再照舊寄網站自己的信（讓大家登入回覆），
--      但信裡**不再附日曆檔**（不然每個人日曆上會有兩場），改成附 Meet 連結。
--   5. 改會：停手 10 分鐘後（或 24 小時內的會馬上）改 Google 事件，Google 通知所有人。
--      網站只寄邀請信給新加進來的人，不再寄「時間改了」與「取消」的信（Google 寄了）。
--   6. 刪會：刪 Google 事件（Google 寄取消）。
--   7. **Google 連不上的時候，照 2026-11-18 的做法走**（信裡附日曆檔），不會因此排不了會。
--      失敗原因記在 gcal_error。這支之前就排好的會，也一直走舊的做法，不會突然多一場。
-- ============================================================================

begin;

alter table public.meetings add column if not exists gcal_event_id text;
alter table public.meetings add column if not exists meet_url text;
alter table public.meetings add column if not exists gcal_error text;

-- 通行證的快取：一列。任何角色都讀不到。
create table if not exists public.gcal_token (
  id int primary key default 1 check (id = 1),
  token text not null,
  expires_at timestamptz not null
);
alter table public.gcal_token enable row level security;
revoke all on public.gcal_token from public, anon, authenticated;

-- ---------- 1. 準備好了沒：http 擴充套件在、Vault 三個值都在 ----------
create or replace function public.gcal_ready()
returns boolean language plpgsql security definer stable
set search_path = public, vault, pg_temp
as $$
begin
  if to_regprocedure('extensions.http(extensions.http_request)') is null then return false; end if;
  return (select count(distinct name) from vault.decrypted_secrets
           where name in ('GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REFRESH_TOKEN') and coalesce(decrypted_secret, '') <> '') = 3;
exception when others then return false;
end $$;
revoke all on function public.gcal_ready() from public, anon, authenticated;

-- ---------- 2. 叫 Google（一個地方叫，逾時 8 秒） ----------
create or replace function public.gcal_http(p_method text, p_url text, p_body jsonb default null, p_token text default null)
returns record language plpgsql security definer
set search_path = public, extensions, pg_temp
as $$
-- 變數不宣告成 extensions.http_response：沒開 http 擴充的資料庫（本機 smoke）連建這支函式都會失敗。
declare r record;
begin
  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS', '8000');
  select status, content into r from extensions.http((p_method, p_url,
         case when p_token is null then '{}'::extensions.http_header[] else array[extensions.http_header('Authorization', 'Bearer ' || p_token)] end,
         'application/json', case when p_body is null then null else p_body::text end)::extensions.http_request);
  return (r.status::int, r.content::text);
end $$;
revoke all on function public.gcal_http(text, text, jsonb, text) from public, anon, authenticated;

create or replace function public.gcal_access_token()
returns text language plpgsql security definer
set search_path = public, extensions, vault, pg_temp
as $$
declare v_tok text; v_id text; v_secret text; v_refresh text; r record; j jsonb;
begin
  select token into v_tok from gcal_token where id = 1 and expires_at > now() + interval '2 minutes';
  if v_tok is not null then return v_tok; end if;
  select decrypted_secret into v_id from vault.decrypted_secrets where name = 'GOOGLE_CLIENT_ID' limit 1;
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'GOOGLE_CLIENT_SECRET' limit 1;
  select decrypted_secret into v_refresh from vault.decrypted_secrets where name = 'GOOGLE_REFRESH_TOKEN' limit 1;
  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS', '8000');
  select status, content into r from extensions.http(('POST', 'https://oauth2.googleapis.com/token', '{}'::extensions.http_header[], 'application/x-www-form-urlencoded',
         'client_id=' || extensions.urlencode(btrim(v_id)) || '&client_secret=' || extensions.urlencode(btrim(v_secret))
         || '&refresh_token=' || extensions.urlencode(btrim(v_refresh)) || '&grant_type=refresh_token')::extensions.http_request);
  if r.status <> 200 then raise exception 'gcal_token_failed: % %', r.status, left(coalesce(r.content, ''), 300) using errcode = 'P0001'; end if;
  j := r.content::jsonb;
  insert into gcal_token (id, token, expires_at) values (1, j->>'access_token', now() + make_interval(secs => coalesce((j->>'expires_in')::int, 3600)))
  on conflict (id) do update set token = excluded.token, expires_at = excluded.expires_at;
  return j->>'access_token';
end $$;
revoke all on function public.gcal_access_token() from public, anon, authenticated;

-- ---------- 3. 事件的內容 ----------
create or replace function public.gcal_body(p_meeting uuid, p_create boolean)
returns jsonb language plpgsql security definer stable
set search_path = public, pg_temp
as $$
declare m record; v_desc text; v_att jsonb; v jsonb; v_main text := public.meeting_main_email();
begin
  select * into m from meetings where id = p_meeting;
  if m.id is null then return null; end if;
  v_desc := case when coalesce(btrim(m.agenda), '') <> '' then m.agenda || E'\n\n' else '' end
         || case when m.doc_url is not null then '會議紀錄 / Notes: ' || m.doc_url || E'\n' else '' end
         || '回覆出席 / Reply on the BT site: https://beyondtaiwannpo.com/home/?meeting=' || m.id::text;
  -- 來賓：名單上每個人，加排會的人。BT 主帳號是主辦人，不用再列。
  select coalesce(jsonb_agg(jsonb_build_object('email', e) || case when m.required then '{}'::jsonb else '{"optional": true}'::jsonb end), '[]')
    into v_att
    from (select lower(u.email) e from meeting_attendees a join auth.users u on u.id = a.user_id where a.meeting_id = m.id and u.email is not null
          union select lower(u.email) from auth.users u where u.id = m.created_by and u.email is not null) x
   where e is distinct from v_main;
  v := jsonb_build_object(
    'summary', m.title,
    'description', v_desc,
    'start', jsonb_build_object('dateTime', to_char(m.starts_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')),
    'end', jsonb_build_object('dateTime', to_char(m.ends_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')),
    'attendees', v_att,
    'source', jsonb_build_object('title', 'Beyond Taiwan', 'url', 'https://beyondtaiwannpo.com/home/?meeting=' || m.id::text));
  if p_create then
    v := v || jsonb_build_object('conferenceData', jsonb_build_object('createRequest',
           jsonb_build_object('requestId', 'bt-' || m.id::text, 'conferenceSolutionKey', jsonb_build_object('type', 'hangoutsMeet'))));
  end if;
  return v;
end $$;
revoke all on function public.gcal_body(uuid, boolean) from public, anon, authenticated;

-- ---------- 4. 建或改事件。回 'ok'、'off'（還沒設定）或 'error'（原因寫進 gcal_error） ----------
create or replace function public.gcal_sync(p_meeting uuid)
returns text language plpgsql security definer
set search_path = public, extensions, pg_temp
as $$
declare m record; v_tok text; v_status int; v_content text; j jsonb; v_link text;
        v_base text := 'https://www.googleapis.com/calendar/v3/calendars/primary/events';
begin
  if not public.gcal_ready() then return 'off'; end if;
  select * into m from meetings where id = p_meeting;
  if m.id is null then return 'off'; end if;
  begin
    v_tok := public.gcal_access_token();
    if m.gcal_event_id is not null then
      select * into v_status, v_content from public.gcal_http('PATCH', v_base || '/' || m.gcal_event_id || '?sendUpdates=all&conferenceDataVersion=1',
        public.gcal_body(m.id, false), v_tok) as (s int, c text);
      -- Google 那邊被刪掉了：重建一個。
      if v_status in (404, 410) then
        update meetings set gcal_event_id = null where id = m.id;
        m.gcal_event_id := null;
      end if;
    end if;
    if m.gcal_event_id is null then
      select * into v_status, v_content from public.gcal_http('POST', v_base || '?sendUpdates=all&conferenceDataVersion=1',
        public.gcal_body(m.id, true), v_tok) as (s int, c text);
    end if;
    if v_status not between 200 and 299 then
      update meetings set gcal_error = 'HTTP ' || v_status || ': ' || left(coalesce(v_content, ''), 300) where id = m.id;
      return 'error';
    end if;
    j := v_content::jsonb;
    v_link := coalesce(j->>'hangoutLink',
                (select e->>'uri' from jsonb_array_elements(coalesce(j->'conferenceData'->'entryPoints', '[]')) e where e->>'entryPointType' = 'video' limit 1));
    update meetings set gcal_event_id = j->>'id', meet_url = coalesce(v_link, meet_url), gcal_error = null where id = m.id;
    return 'ok';
  exception when others then
    update meetings set gcal_error = left(sqlerrm, 300) where id = m.id;
    return 'error';
  end;
end $$;
revoke all on function public.gcal_sync(uuid) from public, anon, authenticated;

-- 刪事件（Google 寄取消給所有來賓）。失敗就算了，網站上的會照刪。
create or replace function public.gcal_cancel(p_event text)
returns text language plpgsql security definer
set search_path = public, extensions, pg_temp
as $$
declare v_status int; v_content text;
begin
  if p_event is null or not public.gcal_ready() then return 'off'; end if;
  select * into v_status, v_content from public.gcal_http('DELETE',
    'https://www.googleapis.com/calendar/v3/calendars/primary/events/' || p_event || '?sendUpdates=all', null, public.gcal_access_token()) as (s int, c text);
  return case when v_status between 200 and 299 or v_status in (404, 410) then 'ok' else 'error' end;
exception when others then return 'error';
end $$;
revoke all on function public.gcal_cancel(text) from public, anon, authenticated;

-- 設定完跑一次：拿通行證、讀 BT 主帳號的日曆。回 'ok'、'off' 或錯誤原因。
create or replace function public.gcal_ping()
returns text language plpgsql security definer
set search_path = public, extensions, pg_temp
as $$
declare v_status int; v_content text;
begin
  if not public.gcal_ready() then return 'off'; end if;
  select * into v_status, v_content from public.gcal_http('GET',
    'https://www.googleapis.com/calendar/v3/calendars/primary', null, public.gcal_access_token()) as (s int, c text);
  return case when v_status = 200 then 'ok' else 'HTTP ' || v_status || ': ' || left(coalesce(v_content, ''), 200) end;
exception when others then return left(sqlerrm, 300);
end $$;
revoke all on function public.gcal_ping() from public, anon, authenticated;

-- ---------- 5. 網站的信：有 Google 事件就不附日曆檔，改附 Meet 連結 ----------
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
  v_body := public.meeting_fill(v_body, v_name, m.title, v_when, m.agenda, m.doc_url, v_link)
         || case when m.meet_url is not null and p_kind <> 'meeting_cancel' then E'\n\nGoogle Meet: ' || m.meet_url else '' end
         || public.mail_tail(p_kind);
  insert into mail_outbox (to_email, subject, body, kind, meeting_id, ics)
  values (v_to, v_sub, v_body, p_kind, m.id,
          case when m.gcal_event_id is not null then null
               when p_kind = 'meeting_cancel' then public.meeting_ics(m.id, 'CANCEL')
               when p_kind in ('meeting_invite', 'meeting_reminder', 'meeting_update') then public.meeting_ics(m.id, 'REQUEST')
               else null end)
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.queue_meeting_mail_to(text, uuid, text) from public, anon, authenticated;

-- ---------- 6. 排會：先建 Google 事件，再寄網站的信 ----------
create or replace function public.schedule_meeting(
  p_scope text, p_title text, p_starts timestamptz, p_ends timestamptz, p_agenda text, p_doc_url text, p_attendees uuid[],
  p_required boolean default false)
returns uuid language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_id uuid; e text; n int := 0; v_g text; v_main text := public.meeting_main_email();
begin
  v_id := public.save_meeting(null, p_scope, p_title, p_starts, p_ends, p_agenda, p_doc_url, p_attendees, coalesce(p_required, false));
  v_g := public.gcal_sync(v_id);
  for e in select x from public.meeting_should_have(v_id) x loop
    -- Google 那邊建好了：BT 主帳號是主辦人，不用再寄網站的信給它。
    if v_g = 'ok' and e = v_main then continue; end if;
    perform public.queue_meeting_mail_to('meeting_invite', v_id, e); n := n + 1;
  end loop;
  if n > 0 then perform public.meeting_try_send(); end if;
  return v_id;
end $$;
revoke all on function public.schedule_meeting(text, text, timestamptz, timestamptz, text, text, uuid[], boolean) from public, anon;
grant execute on function public.schedule_meeting(text, text, timestamptz, timestamptz, text, text, uuid[], boolean) to authenticated;

-- ---------- 7. 改會：有 Google 事件就改它，網站只寄邀請給新加的人 ----------
create or replace function public.meeting_flush_calendar(p_meeting uuid default null)
returns int language plpgsql security definer
set search_path = public, pg_temp
as $$
declare m record; e text; n int := 0; v_on text[]; v_should text[]; v_main text := public.meeting_main_email();
begin
  for m in select * from meetings
            where cal_dirty_at is not null
              and (p_meeting is null or id = p_meeting)
              and (p_meeting is not null or cal_dirty_at <= now() - interval '10 minutes' or starts_at <= now() + interval '24 hours')
  loop
    if m.ends_at <= now() then update meetings set cal_dirty_at = null where id = m.id; continue; end if;
    delete from mail_outbox where meeting_id = m.id and sent_at is null and kind in ('meeting_invite', 'meeting_update', 'meeting_cancel');
    select coalesce(array_agg(x), '{}') into v_on from public.meeting_on_calendar(m.id) x;
    select coalesce(array_agg(x), '{}') into v_should from public.meeting_should_have(m.id) x;
    update meetings set ics_seq = ics_seq + 1, cal_dirty_at = null where id = m.id;
    if m.gcal_event_id is not null and public.gcal_sync(m.id) = 'ok' then
      -- Google 已經通知所有人（時間改了、新加的、被拿掉的）。網站只寄登入回覆的邀請信給新加的人。
      foreach e in array v_should loop
        if not e = any(v_on) and e is distinct from v_main then perform public.queue_meeting_mail_to('meeting_invite', m.id, e); n := n + 1; end if;
      end loop;
      continue;
    end if;
    -- 沒有 Google 事件（這支之前排的會），或 Google 連不上：照 2026-11-18 的做法。
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

-- ---------- 8. 刪會：有 Google 事件就刪它（Google 寄取消） ----------
create or replace function public.delete_meeting(p_id uuid)
returns text language plpgsql security definer
set search_path = public, pg_temp
as $$
declare m record; e text; n int := 0;
begin
  select * into m from meetings where id = p_id;
  if m.id is null then raise exception 'no_such_meeting' using errcode = 'P0001'; end if;
  if not public.can_schedule(m.scope) then raise exception 'not_allowed' using errcode = 'P0001'; end if;
  delete from mail_outbox where meeting_id = p_id and sent_at is null;
  if m.ends_at > now() then
    if m.gcal_event_id is not null and public.gcal_cancel(m.gcal_event_id) = 'ok' then
      null;  -- Google 寄了取消，網站不另外寄。
    else
      update meetings set ics_seq = ics_seq + 1 where id = p_id;
      for e in select x from public.meeting_on_calendar(p_id) x loop
        perform public.queue_meeting_mail_to('meeting_cancel', p_id, e); n := n + 1;
      end loop;
    end if;
  end if;
  delete from meetings where id = p_id;
  if n > 0 then perform public.meeting_try_send(); end if;
  return 'deleted';
end $$;
revoke all on function public.delete_meeting(uuid) from public, anon;
grant execute on function public.delete_meeting(uuid) to authenticated;

commit;

-- ---------- 驗收 ----------
select * from (
  with s as (
    select
      (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'meetings'
         and column_name in ('gcal_event_id', 'meet_url', 'gcal_error')) as cols,
      (select count(*) from information_schema.role_table_grants where table_schema = 'public' and table_name = 'gcal_token'
         and grantee in ('anon', 'authenticated', 'PUBLIC')) as tok_grants,
      (select count(*) from pg_proc p, aclexplode(p.proacl) x
        where p.pronamespace = 'public'::regnamespace and p.proname in ('gcal_ready', 'gcal_http', 'gcal_access_token', 'gcal_body', 'gcal_sync', 'gcal_cancel', 'gcal_ping')
          and x.grantee in (0::regrole, 'anon'::regrole, 'authenticated'::regrole) and x.privilege_type = 'EXECUTE') as fn_grants,
      (select prosrc from pg_proc where proname = 'queue_meeting_mail_to' and pronamespace = 'public'::regnamespace) like '%gcal_event_id is not null then null%' as no_double,
      (select prosrc from pg_proc where proname = 'schedule_meeting' and pronamespace = 'public'::regnamespace) like '%gcal_sync(v_id)%' as sched,
      to_regprocedure('extensions.http(extensions.http_request)') is not null as has_http,
      public.gcal_ready() as ready,
      public.gcal_ping() as ping
  )
  select 0 ord, 'OVERALL' as 項目, null::text as 應該是, null::text as 實際是,
    case when cols = 3 and tok_grants = 0 and fn_grants = 0 and no_double and sched and (not has_http or ping = 'ok') then 'PASS' else 'FAIL' end as 結果 from s
  union all select 1, 'meetings 多三欄', '3', cols::text, case when cols = 3 then 'PASS' else 'FAIL' end from s
  union all select 2, '★ 通行證那張表誰都讀不到', '0', tok_grants::text, case when tok_grants = 0 then 'PASS' else 'FAIL' end from s
  union all select 3, '★ 叫 Google 的函式只給資料庫內部', '0', fn_grants::text, case when fn_grants = 0 then 'PASS' else 'FAIL' end from s
  union all select 4, '★ 有 Google 事件的會，網站的信不附日曆檔（不會出現兩場）', 'true', no_double::text, case when no_double then 'PASS' else 'FAIL' end from s
  union all select 5, '排會先建 Google 事件', 'true', sched::text, case when sched then 'PASS' else 'FAIL' end from s
  union all select 6, 'http 擴充套件、Vault 三個值', 'true / true', has_http::text || ' / ' || ready::text,
    case when not has_http then 'SKIP' when ready then 'PASS' else 'FAIL' end from s
  union all select 7, '★ 連得到 Google（拿通行證、讀 BT 主帳號的日曆）', 'ok', ping,
    case when not has_http then 'SKIP' when ping = 'ok' then 'PASS' else 'FAIL' end from s
) t order by ord;
