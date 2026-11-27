-- 從首頁行事曆排會：邀請多一段「留言」與「排會的人」　2026-11-26
--
-- 用法：整份貼進 Supabase SQL Editor 按一次 Run。可以重跑。最後印一張 PASS / FAIL 表。
-- **要先跑過 2026-11-22-google-calendar.sql 與 2026-11-23-gcal-rsvp.sql**（這一支換掉那兩支裡的三支函式）。
--
-- Paul 2026-11-26：時間看板那一頁拿掉，改成在首頁的行事曆點一天、看那一天每半小時有幾個人有空、挑時間、勾人、
--   寫標題、議程與一段留言，按「排會」。「The invite includes headline, time, agenda, message, who scheduled it and who is invited.」
--   問他要不要加這一欄、改邀請的字，他說四個建議都照做（2026-11-26）。
--
-- ============================================================================
-- 這一支在做什麼
-- ============================================================================
--   1. meetings 多一欄 message（排會的人寫給大家的一段話，最多 2000 字，可以空著）。
--   2. schedule_meeting 多一個參數 p_message（放最後、預設空的）。舊的八個參數那一版拿掉，
--      不然兩版同時在，前端只給八個參數的時候資料庫分不出要叫哪一版。
--      誰排得了照舊（can_schedule：Co-President、Senior Adviser 什麼都排得了；其他人只排自己是「改」以上的那個 team）。
--      順序：先存會、再寫留言、**最後才建 Google 事件**，Google 那邊的說明才會有留言。
--   3. Google 日曆事件的說明（gcal_body）：留言、議程、會議紀錄連結、排會的人、回站上回覆的連結。
--      邀請了誰 Google 本來就列在事件上（guest list），這裡不重複寫。Meet 連結照舊每一場自動加。
--   4. 網站自己寄的邀請信、更新信、提醒信（queue_meeting_mail_to）：範本那幾段後面多「留言」「排會的人」「邀請的人」三行。
--      取消信不加。範本本身（mail_templates）一個字沒改，後台改過範本的照舊。
--
-- 不動的：RLS、角色、誰讀得到會議（幹部本來就讀得到全部的會）；save_meeting（後台記一場會議與改會）照舊不碰留言欄；
--   既有的會一列都不改（留言是空的，信與 Google 說明跟以前一樣，只多一行「排會的人」）。
--
-- ⚠ 跑過這一支之後，**不要再單獨重跑 2026-11-22-google-calendar.sql**：那一支會把八個參數的 schedule_meeting 裝回來，
--   兩版並存。真的重跑了，接著再跑一次這一支就好（它會把八個參數那一版拿掉）。
-- ============================================================================

begin;

alter table public.meetings add column if not exists message text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'meetings_message_len') then
    alter table public.meetings add constraint meetings_message_len check (message is null or char_length(message) <= 2000);
  end if;
end $$;

-- ---------- 排會的人與受邀的人，給信與 Google 說明用的名字 ----------
-- 「中文名 English」，兩個一樣或只有一個就一個。
create or replace function public.meeting_person_name(p_user uuid)
returns text language sql stable security definer
set search_path = public, pg_temp
as $$
  select case when zh <> '' and en <> '' and zh <> en then zh || ' ' || en else coalesce(nullif(zh, ''), nullif(en, ''), '') end
    from (select coalesce(btrim(name_zh), '') zh, coalesce(btrim(name_en), '') en from profiles where id = p_user) p
$$;
revoke all on function public.meeting_person_name(uuid) from public, anon, authenticated;

-- ---------- 1. 排會：多一段留言 ----------
drop function if exists public.schedule_meeting(text, text, timestamptz, timestamptz, text, text, uuid[], boolean);
create or replace function public.schedule_meeting(
  p_scope text, p_title text, p_starts timestamptz, p_ends timestamptz, p_agenda text, p_doc_url text, p_attendees uuid[],
  p_required boolean default false, p_message text default null)
returns uuid language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_id uuid; e text; n int := 0; v_g text; v_main text := public.meeting_main_email();
begin
  if char_length(coalesce(p_message, '')) > 2000 then raise exception 'message_too_long' using errcode = 'P0001'; end if;
  v_id := public.save_meeting(null, p_scope, p_title, p_starts, p_ends, p_agenda, p_doc_url, p_attendees, coalesce(p_required, false));
  update meetings set message = nullif(btrim(coalesce(p_message, '')), '') where id = v_id;
  v_g := public.gcal_sync(v_id);
  for e in select x from public.meeting_should_have(v_id) x loop
    -- Google 那邊建好了：BT 主帳號是主辦人，不用再寄網站的信給它。
    if v_g = 'ok' and e = v_main then continue; end if;
    perform public.queue_meeting_mail_to('meeting_invite', v_id, e); n := n + 1;
  end loop;
  if n > 0 then perform public.meeting_try_send(); end if;
  return v_id;
end $$;
revoke all on function public.schedule_meeting(text, text, timestamptz, timestamptz, text, text, uuid[], boolean, text) from public, anon;
grant execute on function public.schedule_meeting(text, text, timestamptz, timestamptz, text, text, uuid[], boolean, text) to authenticated;

-- ---------- 2. Google 事件的說明：留言、議程、紀錄、排會的人、回覆連結（其他照 2026-11-23 那一版） ----------
create or replace function public.gcal_body(p_meeting uuid, p_create boolean)
returns jsonb language plpgsql security definer stable
set search_path = public, pg_temp
as $$
declare m record; v_desc text; v_att jsonb; v jsonb; v_main text := public.meeting_main_email(); v_by text;
begin
  select * into m from meetings where id = p_meeting;
  if m.id is null then return null; end if;
  v_by := coalesce(public.meeting_person_name(m.created_by), '');
  v_desc := case when coalesce(btrim(m.message), '') <> '' then m.message || E'\n\n' else '' end
         || case when coalesce(btrim(m.agenda), '') <> '' then '議程 / Agenda:' || E'\n' || m.agenda || E'\n\n' else '' end
         || case when m.doc_url is not null then '會議紀錄 / Notes: ' || m.doc_url || E'\n' else '' end
         || case when v_by <> '' then '排會的人 / Scheduled by: ' || v_by || E'\n' else '' end
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

-- ---------- 3. 網站的信：範本後面多留言、排會的人、邀請的人（其他照 2026-11-22 那一版） ----------
create or replace function public.queue_meeting_mail_to(p_kind text, p_meeting uuid, p_to text)
returns uuid language plpgsql security definer
set search_path = public, pg_temp
as $$
declare m record; v_to text := lower(btrim(coalesce(p_to, ''))); v_name text; v_tz text; v_when text; v_sub text; v_body text; v_link text; v_id uuid;
        v_by text; v_who text; v_more text := '';
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
  -- 邀請、更新、提醒：多留言、排會的人、邀請的人三行（取消信不加）。名字照中文名排。
  if p_kind in ('meeting_invite', 'meeting_update', 'meeting_reminder') then
    v_by := coalesce(public.meeting_person_name(m.created_by), '');
    select string_agg(n, '、' order by n) into v_who
      from (select nullif(public.meeting_person_name(ma.user_id), '') n from meeting_attendees ma where ma.meeting_id = m.id) z where n is not null;
    v_more := case when coalesce(btrim(m.message), '') <> '' then E'\n\n' || '留言 / Message:' || E'\n' || m.message else '' end
           || case when v_by <> '' then E'\n\n' || '排會的人 / Scheduled by: ' || v_by else '' end
           || case when coalesce(v_who, '') <> '' then case when v_by <> '' then E'\n' else E'\n\n' end || '邀請的人 / Invited: ' || v_who else '' end;
  end if;
  select subject, body into v_sub, v_body from mail_templates where kind = p_kind;
  if v_sub is null then v_sub := '{title}'; v_body := '{name}：{title}，{when}' || E'\n' || '{link}'; end if;
  v_sub  := public.meeting_fill(v_sub,  v_name, m.title, v_when, m.agenda, m.doc_url, v_link);
  v_body := public.meeting_fill(v_body, v_name, m.title, v_when, m.agenda, m.doc_url, v_link)
         || v_more
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

commit;

-- ---------- 驗收 ----------
select * from (
  with s as (
    select
      (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'meetings' and column_name = 'message') as col,
      (select count(*) from pg_proc where proname = 'schedule_meeting' and pronamespace = 'public'::regnamespace) as versions,
      to_regprocedure('public.schedule_meeting(text, text, timestamptz, timestamptz, text, text, uuid[], boolean, text)') is not null as has_new,
      coalesce(has_function_privilege('authenticated', 'public.schedule_meeting(text, text, timestamptz, timestamptz, text, text, uuid[], boolean, text)', 'execute'), false) as auth_ok,
      coalesce(has_function_privilege('anon', 'public.schedule_meeting(text, text, timestamptz, timestamptz, text, text, uuid[], boolean, text)', 'execute'), false) as anon_ok,
      (select prosrc from pg_proc where proname = 'schedule_meeting' and pronamespace = 'public'::regnamespace limit 1) as sched_src,
      (select prosrc from pg_proc where proname = 'gcal_body' and pronamespace = 'public'::regnamespace) as body_src,
      (select prosrc from pg_proc where proname = 'queue_meeting_mail_to' and pronamespace = 'public'::regnamespace) as mail_src,
      (select count(*) from pg_proc p, aclexplode(p.proacl) x
        where p.pronamespace = 'public'::regnamespace and p.proname in ('gcal_body', 'queue_meeting_mail_to', 'meeting_person_name')
          and x.grantee in (0::regrole, 'anon'::regrole, 'authenticated'::regrole) and x.privilege_type = 'EXECUTE') as inner_grants,
      (select count(*) from public.meetings where message is not null) as with_msg
  ),
  t as (
    select *,
      position('set message' in sched_src) > 0 and position('set message' in sched_src) < position('gcal_sync(v_id)' in sched_src) as order_ok,
      body_src like '%m.message%' and body_src like '%Scheduled by%' as body_ok,
      mail_src like '%m.message%' and mail_src like '%Scheduled by%' and mail_src like '%Invited%' as mail_ok,
      mail_src like '%gcal_event_id is not null then null%' as no_double
    from s
  )
  select 0 ord, 'OVERALL' as 項目, null::text as 應該是, null::text as 實際是,
    case when col = 1 and versions = 1 and has_new and auth_ok and not anon_ok and order_ok and body_ok and mail_ok and no_double and inner_grants = 0
         then 'PASS' else 'FAIL' end as 結果 from t
  union all select 1, 'meetings 多一欄 message', '1', col::text, case when col = 1 then 'PASS' else 'FAIL' end from t
  union all select 2, '★ schedule_meeting 只有一版（多了留言那一版），八個參數那一版拿掉了', '1 / true', versions::text || ' / ' || has_new::text,
    case when versions = 1 and has_new then 'PASS' else 'FAIL' end from t
  union all select 3, '★ 登入的人叫得動、沒登入的叫不動（誰排得了照舊由 can_schedule 擋）', 'true / false', auth_ok::text || ' / ' || anon_ok::text,
    case when auth_ok and not anon_ok then 'PASS' else 'FAIL' end from t
  union all select 4, '★ 先寫留言才建 Google 事件（Google 那邊的說明才有留言）', 'true', order_ok::text, case when order_ok then 'PASS' else 'FAIL' end from t
  union all select 5, '★ Google 事件的說明有留言與排會的人', 'true', body_ok::text, case when body_ok then 'PASS' else 'FAIL' end from t
  union all select 6, '★ 網站的信有留言、排會的人、邀請的人', 'true', mail_ok::text, case when mail_ok then 'PASS' else 'FAIL' end from t
  union all select 7, '★ 有 Google 事件的會，網站的信照舊不附日曆檔（不會出現兩場）', 'true', no_double::text, case when no_double then 'PASS' else 'FAIL' end from t
  union all select 8, '★ 寫信與 Google 說明的三支只給資料庫內部', '0', inner_grants::text, case when inner_grants = 0 then 'PASS' else 'FAIL' end from t
  union all select 9, '有留言的會有幾場（剛跑完是 0）', '', with_msg::text, 'INFO' from t
) x order by ord;
