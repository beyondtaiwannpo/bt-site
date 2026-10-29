-- 行銷需求單：Marketing 先接或退，接了才改進度　2026-11-24
--
-- 用法：整份貼進 Supabase SQL Editor 按一次 Run。可以重跑。最後印一張 PASS / FAIL 表。
-- 要先跑過 2026-11-19-request-kinds.sql 與 2026-11-18-calendar-invites.sql。
--
-- Paul 2026-10-29：「Marketing 要能退件、附回覆。接了之後要有地方改狀態。」
--
-- ============================================================================
-- 這一支在做什麼
-- ============================================================================
--   1. requests 的狀態多一個 rejected（退件）。
--   2. 新函式 accept_request(單)：「已送出」的單 Marketing 按「接下」，狀態變「進行中」；
--      還沒有人接的話，按的人就是接的人（他要在需求工作區裡）。
--   3. 新函式 reject_request(單, 回覆)：還沒發布的單都可以退，**一定要寫回覆**（送單的人要知道為什麼）。
--      退件寄一封信給送單的人，信裡有回覆。新的信叫 request_rejected，後台「信件文案」改得到。
--   4. 退件的單 Marketing 可以再改回「進行中」（按錯了救得回來），走原本的 set_request_status。
--   5. queue_request_mail、mail_defaults、mail_button_url 認得新的信（連結開送單的人那一頁）。
--   RLS、權限政策都不動。誰讀得到哪張單跟原本一樣。
-- ============================================================================

begin;

-- ---------- 1. 狀態多一個 rejected ----------
do $$
declare v text;
begin
  for v in select conname from pg_constraint where conrelid = 'public.requests'::regclass and contype = 'c'
             and pg_get_constraintdef(oid) like '%status%' loop
    execute format('alter table public.requests drop constraint %I', v);
  end loop;
  alter table public.requests add constraint requests_status_v3
    check (status in ('submitted', 'in_progress', 'in_review', 'published', 'withdrawn', 'rejected'));
end $$;

-- ---------- 2. 信的種類多一個 request_rejected ----------
do $$
declare v text;
begin
  select conname into v from pg_constraint where conrelid = 'public.mail_outbox'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%kind%';
  if v is not null then execute format('alter table public.mail_outbox drop constraint %I', v); end if;
  alter table public.mail_outbox add constraint mail_outbox_kind_check
    check (kind in ('guardian', 'interview', 'accepted', 'rejected', 'notice', 'invite', 'request_new', 'request_done', 'request_rejected',
                    'meeting_invite', 'meeting_reminder', 'meeting_summary', 'meeting_update', 'meeting_cancel'));
  select conname into v from pg_constraint where conrelid = 'public.mail_templates'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%kind%';
  if v is not null then execute format('alter table public.mail_templates drop constraint %I', v); end if;
  alter table public.mail_templates add constraint mail_templates_kind_check
    check (kind in ('guardian', 'interview', 'accepted', 'rejected', 'invite', 'request_new', 'request_done', 'request_rejected',
                    'meeting_invite', 'meeting_reminder', 'meeting_summary', 'meeting_update', 'meeting_cancel'));
end $$;

-- 預設文案。代換符號跟已發布那封一樣：{requester} {title} {needed_by} {link} {reply}。
insert into public.mail_templates (kind, subject_zh, body_zh, subject_en, body_en, button_label, button_label_en) values
('request_rejected',
 'Marketing 這次接不了：{title}',
 '{requester} 你好，' || E'\n\n' ||
 '你送給 Marketing 的需求單「{title}」，這次 Marketing 沒辦法接。他們的說明：' || E'\n\n' ||
 '{reply}' || E'\n\n' ||
 '照說明改好可以再送一張新的。完整內容在這裡：' || E'\n' ||
 '{link}',
 'Marketing can''t take this one: {title}',
 'Hi {requester},' || E'\n\n' ||
 'Marketing can''t take your request "{title}" this time. Their note:' || E'\n\n' ||
 '{reply}' || E'\n\n' ||
 'You can send a new request once it is sorted. Full details:' || E'\n' ||
 '{link}',
 '看說明', 'Read the note')
on conflict (kind) do nothing;

-- ---------- 3. 排信：退件那封的連結跟已發布一樣，開送單的人那一頁 ----------
create or replace function public.queue_request_mail(p_kind text, p_to text, p_req uuid)
returns uuid language plpgsql security definer
set search_path = public, pg_temp
as $$
declare r record; v_sub text; v_body text; v_link text; v_id uuid; v_date date;
begin
  select * into r from requests where id = p_req;
  if r.id is null then raise exception 'no_such_request' using errcode = 'P0001'; end if;
  v_link := 'https://beyondtaiwannpo.com/admin/#' || case when p_kind in ('request_done', 'request_rejected') then 'request/' else 'requests/' end || r.id::text;
  v_date := coalesce(r.publish_on, r.needed_by);
  select subject, body into v_sub, v_body from mail_templates where kind = p_kind;
  if v_sub is null then
    v_sub := case when p_kind = 'request_done' then '你的需求單已發布：{title}'
                  when p_kind = 'request_rejected' then 'Marketing 這次接不了：{title}'
                  else 'Marketing 需求單：{title}' end;
    v_body := '{requester}：「{title}」' || E'\n\n' || case when p_kind = 'request_rejected' then '{reply}' || E'\n\n' else '' end || '{link}';
  end if;
  v_sub  := public.request_fill(v_sub,  public.request_name(r.requester), r.title, v_date, v_link, r.reply);
  v_body := public.request_fill(v_body, public.request_name(r.requester), r.title, v_date, v_link, r.reply)
         || public.mail_tail(p_kind);
  insert into mail_outbox (to_email, subject, body, kind, request_id) values (p_to, v_sub, v_body, p_kind, r.id) returning id into v_id;
  return v_id;
end $$;
revoke all on function public.queue_request_mail(text, text, uuid) from public, anon, authenticated;

-- ---------- 4. 信的按鈕與照片（照 2026-11-18 那一份，多 request_rejected） ----------
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
      when 'request_rejected' then case when p_lang = 'en' then 'Read the note' else '看說明' end
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
      when 'request_rejected' then 'sharing-mic.jpg'
      when 'guardian' then 'hero-listening.jpg'
      when 'accepted' then 'three-at-laptop.jpg'
      else 'hero-listening.jpg' end
$$;

create or replace function public.mail_button_url(r public.mail_outbox)
returns text language sql stable
set search_path = public, pg_temp
as $$
  select case
    when r.kind = 'invite' and r.invite_code is not null then 'https://beyondtaiwannpo.com/app/?invite=' || r.invite_code
    when r.kind in ('meeting_invite', 'meeting_reminder', 'meeting_summary', 'meeting_update') and r.meeting_id is not null then 'https://beyondtaiwannpo.com/home/?meeting=' || r.meeting_id::text
    when r.kind = 'request_new' and r.request_id is not null then 'https://beyondtaiwannpo.com/admin/#requests/' || r.request_id::text
    when r.kind in ('request_done', 'request_rejected') and r.request_id is not null then 'https://beyondtaiwannpo.com/admin/#request/' || r.request_id::text
    when r.kind = 'interview' and r.form_id is not null then coalesce((select f.interview_url from forms f where f.id = r.form_id), 'https://beyondtaiwannpo.com/apply/')
    when r.kind in ('accepted', 'rejected', 'notice', 'guardian') then 'https://beyondtaiwannpo.com/apply/'
    else '' end
$$;

-- ---------- 5. 接下 ----------
-- 「改」以上，只有「已送出」的單。還沒有人接、按的人又在需求工作區裡，就把他記成接的人。不寄信。
create or replace function public.accept_request(p_id uuid)
returns text language plpgsql security definer
set search_path = public, pg_temp
as $$
declare r record;
begin
  if not public.can_edit('custom:marketing-requests') then raise exception 'not_allowed' using errcode = 'P0001'; end if;
  select * into r from requests where id = p_id;
  if r.id is null then raise exception 'no_such_request' using errcode = 'P0001'; end if;
  if r.status <> 'submitted' then raise exception 'not_submitted' using errcode = 'P0001'; end if;
  update requests set status = 'in_progress', updated_at = now(),
         assignee = coalesce(assignee, case when exists (
           select 1 from assignments a join profiles p on p.id = a.user_id and p.role = 'cadre'
            where a.workspace_id = 'custom:marketing-requests' and a.user_id = auth.uid()) then auth.uid() end)
   where id = p_id;
  return 'in_progress';
end $$;
revoke all on function public.accept_request(uuid) from public, anon;
grant execute on function public.accept_request(uuid) to authenticated;

-- ---------- 6. 退件 ----------
-- 「改」以上。已送出、進行中、待審核都可以退；已發布、收回的、已經退過的不行。回覆一定要寫。每退一次寄一封。
create or replace function public.reject_request(p_id uuid, p_reply text)
returns text language plpgsql security definer
set search_path = public, pg_temp
as $$
declare r record; v_to text; v_reply text := left(btrim(coalesce(p_reply, '')), 5000);
begin
  if not public.can_edit('custom:marketing-requests') then raise exception 'not_allowed' using errcode = 'P0001'; end if;
  if v_reply = '' then raise exception 'empty_reply' using errcode = 'P0001'; end if;
  select * into r from requests where id = p_id;
  if r.id is null then raise exception 'no_such_request' using errcode = 'P0001'; end if;
  if r.status not in ('submitted', 'in_progress', 'in_review') then raise exception 'not_open' using errcode = 'P0001'; end if;
  update requests set status = 'rejected', reply = v_reply, updated_at = now() where id = p_id;
  select email into v_to from auth.users where id = r.requester;
  if v_to is not null then
    perform public.queue_request_mail('request_rejected', v_to, p_id);
    perform public.request_try_send();
  end if;
  return 'rejected';
end $$;
revoke all on function public.reject_request(uuid, text) from public, anon;
grant execute on function public.reject_request(uuid, text) to authenticated;

commit;

-- ---------- 驗收 ----------
select * from (
  with f as (
    select proname, regexp_replace(prosrc, '--[^\n]*', '', 'g') as body, prosecdef, proconfig, proacl
      from pg_proc where proname in ('accept_request', 'reject_request') and pronamespace = 'public'::regnamespace
  ), s as (
    select
      coalesce((select pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.requests'::regclass and conname = 'requests_status_v3'), '') like '%rejected%' as st_ok,
      (select count(*) from pg_constraint where conrelid = 'public.requests'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%status%') as st_checks,
      coalesce((select pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.mail_outbox'::regclass and conname = 'mail_outbox_kind_check'), '') like '%request_rejected%'
        and coalesce((select pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.mail_templates'::regclass and conname = 'mail_templates_kind_check'), '') like '%request_rejected%' as kind_ok,
      (select count(*) from public.mail_templates where kind = 'request_rejected' and body_zh like '%{reply}%' and body_en like '%{reply}%') as tpl,
      (select count(*) from f where prosecdef and array_to_string(proconfig, ',') like '%search_path=%public%') as defs,
      (select count(*) from f where body like '%can_edit(''custom:marketing-requests'')%') as gates,
      coalesce((select body from f where proname = 'reject_request'), '') like '%empty_reply%' as need_reply,
      coalesce((select body from f where proname = 'accept_request'), '') like '%r.status <> ''submitted''%' as only_submitted,
      (select count(*) from pg_proc p, aclexplode(p.proacl) x
        where p.proname in ('accept_request', 'reject_request') and p.pronamespace = 'public'::regnamespace
          and x.grantee in (0::regrole, 'anon'::regrole) and x.privilege_type = 'EXECUTE') as anon_n,
      (select button_label from public.mail_defaults('request_rejected', 'zh')) = '看說明' as btn_ok
  )
  select 0 ord, 'OVERALL' as 項目, null::text as 應該是, null::text as 實際是,
    case when st_ok and st_checks = 1 and kind_ok and tpl = 1 and defs = 2 and gates = 2 and need_reply and only_submitted and anon_n = 0 and btn_ok then 'PASS' else 'FAIL' end as 結果 from s
  union all select 1, '需求單狀態多了退件（只剩一條狀態檢查）', 'true|1', st_ok::text || '|' || st_checks, case when st_ok and st_checks = 1 then 'PASS' else 'FAIL' end from s
  union all select 2, '信的種類認得 request_rejected', 'true', kind_ok::text, case when kind_ok then 'PASS' else 'FAIL' end from s
  union all select 3, '退件那封的文案在，中英都帶回覆', '1', tpl::text, case when tpl = 1 then 'PASS' else 'FAIL' end from s
  union all select 4, '兩支新函式是 security definer、search_path 釘死', '2', defs::text, case when defs = 2 then 'PASS' else 'FAIL' end from s
  union all select 5, '★ 兩支都要需求工作區「改」以上', '2', gates::text, case when gates = 2 then 'PASS' else 'FAIL' end from s
  union all select 6, '★ 退件一定要寫回覆', 'true', need_reply::text, case when need_reply then 'PASS' else 'FAIL' end from s
  union all select 7, '接下只對「已送出」的單', 'true', only_submitted::text, case when only_submitted then 'PASS' else 'FAIL' end from s
  union all select 8, '★ 沒登入叫不動', '0 筆', anon_n::text || ' 筆', case when anon_n = 0 then 'PASS' else 'FAIL' end from s
  union all select 9, '退件信的按鈕是「看說明」', 'true', btn_ok::text, case when btn_ok then 'PASS' else 'FAIL' end from s
) t order by ord;
