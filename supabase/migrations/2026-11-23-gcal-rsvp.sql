-- 會議回覆跟 Google 日曆雙向同步，後台看得到 Google 的狀態　2026-11-23
--
-- 用法：整份貼進 Supabase SQL Editor 按一次 Run。可以重跑。最後印一張 PASS / FAIL 表。
-- **要先跑過 2026-11-22-google-calendar.sql**。
--
-- Paul 2026-10-29：「做回覆同步跟後台。」
--
-- ============================================================================
-- 這一支在做什麼
-- ============================================================================
--   1. 從 Google 拉回覆：在 Google 日曆按「參加／不參加」，網站上那個人的回覆跟著變。
--      每個人記住上一次在 Google 看到的回覆（meeting_attendees.gcal_status），**只有 Google 那邊變了才蓋過網站**。
--      所以在網站上改了回覆，不會被 Google 那邊舊的狀態蓋回去。Google 的「可能」與「還沒回」不動網站。
--      必到的會在 Google 按不參加：理由用他在 Google 寫的備註，沒寫就記「在 Google 日曆回覆不參加」。
--   2. 網站的回覆送到 Google：在網站按了，Google 日曆上那個人也跟著變（不寄信給任何人）。
--   3. 什麼時候拉：每 15 分鐘的排程一次；有人打開首頁或後台的會議也會叫一次（同一場 2 分鐘內不重拉）。
--   4. 改會之前先拉一次再送，Google 那邊的回覆不會被網站洗成「還沒回」。
--   5. 有 Google 事件的會，改了但送不上 Google：**不再退回寄日曆檔**（那會讓日曆上多一場），
--      留著等下一輪再送，原因寫在 gcal_error。刪會時 Google 刪不掉，記下來下一輪再刪。
--   6. 後台的「再送一次」：gcal_retry(會議)，排得了這場會的人才能按。
-- ============================================================================

begin;

alter table public.meeting_attendees add column if not exists gcal_status text;
alter table public.meetings add column if not exists gcal_pulled_at timestamptz;

-- 刪會時 Google 刪不掉的事件，排程會再試（最多 20 次）。任何角色都讀不到。
create table if not exists public.gcal_pending_deletes (
  event_id text primary key,
  tries int not null default 0,
  created_at timestamptz not null default now()
);
alter table public.gcal_pending_deletes enable row level security;
revoke all on public.gcal_pending_deletes from public, anon, authenticated;

-- ---------- 1. 從 Google 拉回覆 ----------
create or replace function public.gcal_pull(p_meeting uuid)
returns int language plpgsql security definer
set search_path = public, pg_temp
as $$
declare m record; v_status int; v_content text; a jsonb; n int := 0; r record; v_new text; v_note text;
begin
  select * into m from meetings where id = p_meeting;
  if m.id is null or m.gcal_event_id is null or not public.gcal_ready() then return 0; end if;
  begin
    select * into v_status, v_content from public.gcal_http('GET',
      'https://www.googleapis.com/calendar/v3/calendars/primary/events/' || m.gcal_event_id, null, public.gcal_access_token()) as (s int, c text);
  exception when others then
    update meetings set gcal_error = left(sqlerrm, 300) where id = m.id;
    return 0;
  end;
  update meetings set gcal_pulled_at = now() where id = m.id;
  if v_status not between 200 and 299 then return 0; end if;
  for a in select x from jsonb_array_elements(coalesce(v_content::jsonb->'attendees', '[]')) x loop
    for r in select ma.user_id, ma.status, ma.gcal_status from meeting_attendees ma join auth.users u on u.id = ma.user_id
              where ma.meeting_id = m.id and lower(u.email) = lower(a->>'email') loop
      v_new := a->>'responseStatus';
      if v_new is null or v_new is not distinct from r.gcal_status then continue; end if;
      update meeting_attendees set gcal_status = v_new where meeting_id = m.id and user_id = r.user_id;
      if v_new = 'accepted' and r.status <> 'accepted' then
        update meeting_attendees set status = 'accepted', replied_at = now() where meeting_id = m.id and user_id = r.user_id;
        delete from meeting_rsvp_notes where meeting_id = m.id and user_id = r.user_id;
        n := n + 1;
      elsif v_new = 'declined' and r.status <> 'declined' then
        update meeting_attendees set status = 'declined', replied_at = now() where meeting_id = m.id and user_id = r.user_id;
        v_note := left(coalesce(nullif(btrim(a->>'comment'), ''), case when m.required then '在 Google 日曆回覆不參加 / Declined on Google Calendar' end), 300);
        if v_note is not null then
          insert into meeting_rsvp_notes (meeting_id, user_id, note) values (m.id, r.user_id, v_note)
          on conflict (meeting_id, user_id) do update set note = excluded.note, updated_at = now();
        end if;
        n := n + 1;
      end if;
    end loop;
  end loop;
  return n;
end $$;
revoke all on function public.gcal_pull(uuid) from public, anon, authenticated;

-- ---------- 2. 事件的內容：每個人的回覆一起送，Google 那邊才不會被洗成「還沒回」 ----------
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
  select coalesce(jsonb_agg(jsonb_build_object('email', e) || case when m.required then '{}'::jsonb else '{"optional": true}'::jsonb end
                            || case when rs is not null then jsonb_build_object('responseStatus', rs) else '{}'::jsonb end), '[]')
    into v_att
    from (
      select lower(u.email) e,
             case ma.status when 'accepted' then 'accepted' when 'declined' then 'declined' else coalesce(ma.gcal_status, 'needsAction') end rs
        from meeting_attendees ma join auth.users u on u.id = ma.user_id where ma.meeting_id = m.id and u.email is not null
      union
      select lower(u.email), null from auth.users u
       where u.id = m.created_by and u.email is not null
         and not exists (select 1 from meeting_attendees x where x.meeting_id = m.id and x.user_id = m.created_by)
    ) x
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

-- ---------- 3. 建或改事件：多一個「要不要通知大家」。改之前先拉回覆。 ----------
drop function if exists public.gcal_sync(uuid);
create or replace function public.gcal_sync(p_meeting uuid, p_notify boolean default true)
returns text language plpgsql security definer
set search_path = public, pg_temp
as $$
declare m record; v_tok text; v_status int; v_content text; j jsonb; v_link text;
        v_base text := 'https://www.googleapis.com/calendar/v3/calendars/primary/events';
        v_send text := case when p_notify then 'all' else 'none' end;
begin
  if not public.gcal_ready() then return 'off'; end if;
  select * into m from meetings where id = p_meeting;
  if m.id is null then return 'off'; end if;
  if m.gcal_event_id is not null then perform public.gcal_pull(m.id); end if;
  begin
    v_tok := public.gcal_access_token();
    if m.gcal_event_id is not null then
      select * into v_status, v_content from public.gcal_http('PATCH', v_base || '/' || m.gcal_event_id || '?sendUpdates=' || v_send || '&conferenceDataVersion=1',
        public.gcal_body(m.id, false), v_tok) as (s int, c text);
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
revoke all on function public.gcal_sync(uuid, boolean) from public, anon, authenticated;

-- ---------- 4. 網站的回覆送到 Google（不寄信） ----------
create or replace function public.set_rsvp(p_meeting uuid, p_status text, p_note text default null)
returns text language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_req boolean; v_ev text; v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if p_status not in ('accepted', 'declined', 'invited') then raise exception 'bad_status' using errcode = 'P0001'; end if;
  select required, gcal_event_id into v_req, v_ev from meetings where id = p_meeting;
  if v_req is null then raise exception 'no_such_meeting' using errcode = 'P0001'; end if;
  if v_note is not null and char_length(v_note) > 300 then raise exception 'note_too_long' using errcode = 'P0001'; end if;
  if p_status = 'declined' and v_req and v_note is null then raise exception 'need_reason' using errcode = 'P0001'; end if;
  update meeting_attendees set status = p_status, replied_at = case when p_status = 'invited' then null else now() end
   where meeting_id = p_meeting and user_id = auth.uid();
  if not found then raise exception 'not_invited' using errcode = 'P0001'; end if;
  if p_status = 'declined' and v_note is not null then
    insert into meeting_rsvp_notes (meeting_id, user_id, note) values (p_meeting, auth.uid(), v_note)
    on conflict (meeting_id, user_id) do update set note = excluded.note, updated_at = now();
  else
    delete from meeting_rsvp_notes where meeting_id = p_meeting and user_id = auth.uid();
  end if;
  -- 2026-11-23：有 Google 事件就把這個回覆送過去。送不上不擋（網站的回覆已經存好了）。
  if v_ev is not null then perform public.gcal_sync(p_meeting, false); end if;
  return p_status;
end $$;
revoke all on function public.set_rsvp(uuid, text, text) from public, anon;
grant execute on function public.set_rsvp(uuid, text, text) to authenticated;

-- ---------- 5. 拉回覆：排程拉全部，開頁拉一下（同一場 2 分鐘內不重拉） ----------
create or replace function public.gcal_pull_due(p_min_age interval default interval '2 minutes')
returns int language plpgsql security definer
set search_path = public, pg_temp
as $$
declare m record; n int := 0; e record;
begin
  if not public.gcal_ready() then return 0; end if;
  for m in select id from meetings
            where gcal_event_id is not null and ends_at > now() - interval '1 day'
              and (gcal_pulled_at is null or gcal_pulled_at < now() - p_min_age)
            order by starts_at limit 30 loop
    n := n + public.gcal_pull(m.id);
  end loop;
  -- 上一輪 Google 刪不掉的事件再刪一次。
  for e in select event_id, tries from gcal_pending_deletes order by created_at limit 10 loop
    if public.gcal_cancel(e.event_id) = 'ok' or e.tries >= 20 then delete from gcal_pending_deletes where event_id = e.event_id;
    else update gcal_pending_deletes set tries = tries + 1 where event_id = e.event_id; end if;
  end loop;
  return n;
end $$;
revoke all on function public.gcal_pull_due(interval) from public, anon, authenticated;

create or replace function public.gcal_refresh()
returns int language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_cadre() then raise exception 'not_cadre' using errcode = 'P0001'; end if;
  return public.gcal_pull_due(interval '2 minutes');
end $$;
revoke all on function public.gcal_refresh() from public, anon;
grant execute on function public.gcal_refresh() to authenticated;

-- ---------- 6. 後台的「再送一次」 ----------
create or replace function public.gcal_retry(p_meeting uuid)
returns text language plpgsql security definer
set search_path = public, pg_temp
as $$
declare m record; v text;
begin
  select * into m from meetings where id = p_meeting;
  if m.id is null then raise exception 'no_such_meeting' using errcode = 'P0001'; end if;
  if not (public.can_schedule(m.scope) or m.created_by = auth.uid()) then raise exception 'not_allowed' using errcode = 'P0001'; end if;
  if m.gcal_event_id is null then raise exception 'gcal_no_event' using errcode = 'P0001'; end if;
  if not public.gcal_ready() then raise exception 'gcal_not_ready' using errcode = 'P0001'; end if;
  v := public.gcal_sync(p_meeting, m.gcal_error is not null);
  if v = 'ok' then update meetings set cal_dirty_at = null where id = p_meeting; end if;
  return v;
end $$;
revoke all on function public.gcal_retry(uuid) from public, anon;
grant execute on function public.gcal_retry(uuid) to authenticated;

-- ---------- 7. 改會：有 Google 事件的會送不上就等下一輪，不退回寄日曆檔 ----------
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
    if m.gcal_event_id is not null then
      if public.gcal_sync(m.id, true) <> 'ok' then
        -- 送不上：記號往後挪，10 分鐘後的排程再試。原因已經寫在 gcal_error。
        update meetings set cal_dirty_at = now() where id = m.id;
        continue;
      end if;
      delete from mail_outbox where meeting_id = m.id and sent_at is null and kind in ('meeting_invite', 'meeting_update', 'meeting_cancel');
      select coalesce(array_agg(x), '{}') into v_on from public.meeting_on_calendar(m.id) x;
      select coalesce(array_agg(x), '{}') into v_should from public.meeting_should_have(m.id) x;
      update meetings set cal_dirty_at = null where id = m.id;
      foreach e in array v_should loop
        if not e = any(v_on) and e is distinct from v_main then perform public.queue_meeting_mail_to('meeting_invite', m.id, e); n := n + 1; end if;
      end loop;
      continue;
    end if;
    -- 沒有 Google 事件（2026-10-29 之前排的會，或建的時候 Google 連不上）：照 2026-11-18 的做法。
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

-- ---------- 8. 刪會：Google 刪不掉就記下來，排程再刪 ----------
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
    if m.gcal_event_id is not null then
      if public.gcal_cancel(m.gcal_event_id) <> 'ok' then
        insert into gcal_pending_deletes (event_id) values (m.gcal_event_id) on conflict do nothing;
      end if;
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

-- ---------- 9. 每 15 分鐘的排程順便拉回覆 ----------
create or replace function public.queue_meeting_reminders()
returns int language plpgsql security definer
set search_path = public, pg_temp
as $$
declare m record; u uuid; n int := 0;
begin
  n := public.meeting_flush_calendar();
  begin perform public.gcal_pull_due(interval '5 minutes'); exception when others then null; end;
  for m in select * from meetings where reminded_at is null and starts_at > now() and starts_at <= now() + interval '24 hours' loop
    for u in select user_id from meeting_attendees where meeting_id = m.id and status <> 'declined' loop
      perform public.queue_meeting_mail('meeting_reminder', m.id, u); n := n + 1;
    end loop;
    if public.queue_meeting_summary(m.id) is not null then n := n + 1; end if;
    update meetings set reminded_at = now() where id = m.id;
  end loop;
  return n;
end $$;

commit;

-- ---------- 驗收 ----------
select * from (
  with s as (
    select
      (select count(*) from information_schema.columns where table_schema = 'public'
         and ((table_name = 'meeting_attendees' and column_name = 'gcal_status') or (table_name = 'meetings' and column_name = 'gcal_pulled_at'))) as cols,
      (select count(*) from information_schema.role_table_grants where table_schema = 'public' and table_name = 'gcal_pending_deletes'
         and grantee in ('anon', 'authenticated', 'PUBLIC')) as tbl_grants,
      (select count(*) from pg_proc p, aclexplode(p.proacl) x
        where p.pronamespace = 'public'::regnamespace and p.proname in ('gcal_pull', 'gcal_pull_due', 'gcal_sync', 'gcal_body')
          and x.grantee in (0::regrole, 'anon'::regrole, 'authenticated'::regrole) and x.privilege_type = 'EXECUTE') as fn_grants,
      (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname = 'gcal_sync') as n_sync,
      (select prosrc from pg_proc where proname = 'gcal_pull' and pronamespace = 'public'::regnamespace) like '%is not distinct from r.gcal_status then continue%' as only_changes,
      (select prosrc from pg_proc where proname = 'set_rsvp' and pronamespace = 'public'::regnamespace) like '%gcal_sync(p_meeting, false)%' as push_rsvp,
      (select prosrc from pg_proc where proname = 'gcal_refresh' and pronamespace = 'public'::regnamespace) like '%is_cadre()%' as refresh_gate,
      (select prosrc from pg_proc where proname = 'gcal_retry' and pronamespace = 'public'::regnamespace) like '%can_schedule(m.scope)%' as retry_gate,
      (select prosrc from pg_proc where proname = 'meeting_flush_calendar' and pronamespace = 'public'::regnamespace) like '%update meetings set cal_dirty_at = now() where id = m.id;%' as no_fallback
  )
  select 0 ord, 'OVERALL' as 項目, null::text as 應該是, null::text as 實際是,
    case when cols = 2 and tbl_grants = 0 and fn_grants = 0 and n_sync = 1 and only_changes and push_rsvp and refresh_gate and retry_gate and no_fallback
         then 'PASS' else 'FAIL' end as 結果 from s
  union all select 1, '多兩欄（每個人在 Google 的回覆、上次拉的時間）', '2', cols::text, case when cols = 2 then 'PASS' else 'FAIL' end from s
  union all select 2, '★ 待刪清單誰都讀不到、叫 Google 的函式只給資料庫內部', '0 / 0', tbl_grants || ' / ' || fn_grants, case when tbl_grants = 0 and fn_grants = 0 then 'PASS' else 'FAIL' end from s
  union all select 3, 'gcal_sync 只剩一支', '1', n_sync::text, case when n_sync = 1 then 'PASS' else 'FAIL' end from s
  union all select 4, '★ Google 那邊變了才蓋過網站的回覆', 'true', only_changes::text, case when only_changes then 'PASS' else 'FAIL' end from s
  union all select 5, '網站的回覆送到 Google（不寄信）', 'true', push_rsvp::text, case when push_rsvp then 'PASS' else 'FAIL' end from s
  union all select 6, '★ 開頁拉回覆只給幹部、再送一次只給排得了這場的人', 'true / true', refresh_gate::text || ' / ' || retry_gate::text, case when refresh_gate and retry_gate then 'PASS' else 'FAIL' end from s
  union all select 7, '★ 有 Google 事件的會送不上不退回寄日曆檔（不會多一場）', 'true', no_fallback::text, case when no_fallback then 'PASS' else 'FAIL' end from s
) t order by ord;
