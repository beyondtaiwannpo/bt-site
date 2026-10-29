-- 幹部首頁與行事曆要的資料庫那一半：必到／選擇參加、不能到的理由、主辦人的會前總表。　2026-11-17
--
-- 用法：整份貼進 Supabase SQL Editor 按一次 Run。可以重跑。最後印出 PASS / FAIL 表。
-- **先跑 2026-11-16-mail-language-photo.sql**（順序照日期）。
--
-- ============================================================================
-- 這一支在做什麼
-- ============================================================================
-- Paul 2026-10-28：「我按了會到，主辦人什麼都沒收到」「遊戲夜這種要標選擇參加，其他是必到」。
--
--   1. meetings 多一欄 required（必到 true／選擇參加 false，既有的會一律當選擇參加）。
--   2. 新表 meeting_rsvp_notes：必到的會按「不能到」要填的那一句理由。
--      **理由另開一張表**，因為 meeting_attendees 全部幹部都讀得到；理由可能是私事，
--      只給本人、排這場會的人、能排這個範圍的人看（RLS）。
--   3. set_rsvp(會, 狀態, 理由)：必到的會不能到沒填理由就擋（need_reason）。舊的兩參數叫法照樣能用。
--   4. save_meeting / schedule_meeting 多 p_required。**沒給就不改**（舊的後台存一次不會把必到洗成選擇參加）；新的會沒給就是選擇參加。
--   5. 主辦人的總表信 meeting_summary：開會前 24 小時，跟提醒信同一刻，寄給排這場會的人，
--      列出誰會到、誰不能到（附理由）、誰還沒回。文案在後台「信的文字」改得動。
--   6. 會議信的連結改到新的幹部首頁 /home/?meeting=…（舊信裡的 /availability/?meeting=… 照樣打得開）。
--
-- 門：寫的路全部走函式；meeting_rsvp_notes 沒有寫的政策。
-- 不碰別人的回覆：set_rsvp 只改 auth.uid() 自己那一列。

begin;

-- ---------- 1. 欄與表 ----------
alter table public.meetings add column if not exists required boolean not null default false;

create table if not exists public.meeting_rsvp_notes (
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  note       text not null check (char_length(note) between 1 and 300),
  updated_at timestamptz not null default now(),
  primary key (meeting_id, user_id)
);
alter table public.meeting_rsvp_notes enable row level security;
revoke all on public.meeting_rsvp_notes from anon, authenticated;
grant select on public.meeting_rsvp_notes to authenticated;
drop policy if exists rsvp_notes_read on public.meeting_rsvp_notes;
create policy rsvp_notes_read on public.meeting_rsvp_notes for select to authenticated
  using (user_id = auth.uid()
      or exists (select 1 from public.meetings m where m.id = meeting_id and (m.created_by = auth.uid() or public.can_schedule(m.scope))));

-- ---------- 2. 回覆 ----------
drop function if exists public.set_rsvp(uuid, text);
create or replace function public.set_rsvp(p_meeting uuid, p_status text, p_note text default null)
returns text language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_req boolean; v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if p_status not in ('accepted', 'declined', 'invited') then raise exception 'bad_status' using errcode = 'P0001'; end if;
  select required into v_req from meetings where id = p_meeting;
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
  return p_status;
end $$;
revoke all on function public.set_rsvp(uuid, text, text) from public, anon;
grant execute on function public.set_rsvp(uuid, text, text) to authenticated;

-- ---------- 3. 建會、改會（多 p_required） ----------
drop function if exists public.schedule_meeting(text, text, timestamptz, timestamptz, text, text, uuid[]);
drop function if exists public.save_meeting(uuid, text, text, timestamptz, timestamptz, text, text, uuid[]);

create or replace function public.save_meeting(
  p_id uuid, p_scope text, p_title text, p_starts timestamptz, p_ends timestamptz, p_agenda text, p_doc_url text, p_attendees uuid[],
  p_required boolean default null)
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
  return v_id;
end $$;
revoke all on function public.save_meeting(uuid, text, text, timestamptz, timestamptz, text, text, uuid[], boolean) from public, anon;
grant execute on function public.save_meeting(uuid, text, text, timestamptz, timestamptz, text, text, uuid[], boolean) to authenticated;

create or replace function public.schedule_meeting(
  p_scope text, p_title text, p_starts timestamptz, p_ends timestamptz, p_agenda text, p_doc_url text, p_attendees uuid[],
  p_required boolean default false)
returns uuid language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_id uuid; u uuid; n int := 0;
begin
  v_id := public.save_meeting(null, p_scope, p_title, p_starts, p_ends, p_agenda, p_doc_url, p_attendees, coalesce(p_required, false));
  for u in select user_id from meeting_attendees where meeting_id = v_id loop
    perform public.queue_meeting_mail('meeting_invite', v_id, u); n := n + 1;
  end loop;
  if n > 0 then perform public.meeting_try_send(); end if;
  return v_id;
end $$;
revoke all on function public.schedule_meeting(text, text, timestamptz, timestamptz, text, text, uuid[], boolean) from public, anon;
grant execute on function public.schedule_meeting(text, text, timestamptz, timestamptz, text, text, uuid[], boolean) to authenticated;

-- ---------- 4. 信：新的一種 meeting_summary、連結改到首頁 ----------
do $$
declare v text;
begin
  select conname into v from pg_constraint where conrelid = 'public.mail_outbox'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%kind%';
  if v is not null then execute format('alter table public.mail_outbox drop constraint %I', v); end if;
  alter table public.mail_outbox add constraint mail_outbox_kind_check
    check (kind in ('guardian', 'interview', 'accepted', 'rejected', 'notice', 'invite', 'request_new', 'request_done', 'meeting_invite', 'meeting_reminder', 'meeting_summary'));
  select conname into v from pg_constraint where conrelid = 'public.mail_templates'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%kind%';
  if v is not null then execute format('alter table public.mail_templates drop constraint %I', v); end if;
  alter table public.mail_templates add constraint mail_templates_kind_check
    check (kind in ('guardian', 'interview', 'accepted', 'rejected', 'invite', 'request_new', 'request_done', 'meeting_invite', 'meeting_reminder', 'meeting_summary'));
end $$;

-- 預設文案。代換符號：{name} 主辦人、{title}、{when} 主辦人自己時區的時間、{yes} 會到的人、{no} 不能到的人（附理由）、{pending} 還沒回的人、{link} 看這場會的連結。
insert into public.mail_templates (kind, subject_zh, body_zh, subject_en, body_en, button_label, button_label_en) values
('meeting_summary',
 '明天的會誰會到：{title}',
 '{name} 你好，' || E'\n\n' ||
 '你排的「{title}」在 {when}（你的時區）。到現在為止的回覆：' || E'\n\n' ||
 '會到：{yes}' || E'\n' ||
 '不能到：{no}' || E'\n' ||
 '還沒回：{pending}' || E'\n\n' ||
 '打開這場會看最新的回覆：' || E'\n' ||
 '{link}',
 'Who is coming tomorrow: {title}',
 'Hi {name},' || E'\n\n' ||
 '"{title}", which you scheduled, is at {when} (your time zone). Replies so far:' || E'\n\n' ||
 'Coming: {yes}' || E'\n' ||
 'Can''t make it: {no}' || E'\n' ||
 'No reply yet: {pending}' || E'\n\n' ||
 'Open the meeting for the latest replies:' || E'\n' ||
 '{link}',
 '看這場會', 'Open meeting')
on conflict (kind) do nothing;

create or replace function public.mail_defaults(p_kind text, p_lang text)
returns table (button_label text, hero text)
language sql immutable
as $$
  select case p_kind
      when 'invite' then case when p_lang = 'en' then 'Accept invitation' else '接受邀請' end
      when 'meeting_invite' then case when p_lang = 'en' then 'Reply' else '回覆出席' end
      when 'meeting_reminder' then case when p_lang = 'en' then 'Reply' else '回覆出席' end
      when 'meeting_summary' then case when p_lang = 'en' then 'Open meeting' else '看這場會' end
      when 'request_new' then case when p_lang = 'en' then 'Open request' else '打開需求單' end
      when 'request_done' then case when p_lang = 'en' then 'Open request' else '看回覆' end
      when 'interview' then case when p_lang = 'en' then 'Pick a time' else '挑一個時段' end
      else case when p_lang = 'en' then 'Open Beyond Taiwan' else '打開 Beyond Taiwan' end end,
    'https://beyondtaiwannpo.com/photos/' || case p_kind
      when 'invite' then 'group-photo.jpg'
      when 'meeting_invite' then 'talking-laptop.jpg'
      when 'meeting_reminder' then 'talking-laptop.jpg'
      when 'meeting_summary' then 'talking-laptop.jpg'
      when 'request_new' then 'sharing-mic.jpg'
      when 'request_done' then 'sharing-mic.jpg'
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
    when r.kind in ('meeting_invite', 'meeting_reminder', 'meeting_summary') and r.meeting_id is not null then 'https://beyondtaiwannpo.com/home/?meeting=' || r.meeting_id::text
    when r.kind = 'request_new' and r.request_id is not null then 'https://beyondtaiwannpo.com/admin/#requests/' || r.request_id::text
    when r.kind = 'request_done' and r.request_id is not null then 'https://beyondtaiwannpo.com/admin/#request/' || r.request_id::text
    when r.kind = 'interview' and r.form_id is not null then coalesce((select f.interview_url from forms f where f.id = r.form_id), 'https://beyondtaiwannpo.com/apply/')
    when r.kind in ('accepted', 'rejected', 'notice', 'guardian') then 'https://beyondtaiwannpo.com/apply/'
    else '' end
$$;

-- 2026-11-02 那一版，唯一的差別是 {link} 改到 /home/。
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
  v_link := 'https://beyondtaiwannpo.com/home/?meeting=' || m.id::text;
  select subject, body into v_sub, v_body from mail_templates where kind = p_kind;
  if v_sub is null then v_sub := '{title}'; v_body := '{name}：{title}，{when}' || E'\n' || '{link}'; end if;
  v_sub  := public.meeting_fill(v_sub,  v_name, m.title, v_when, m.agenda, m.doc_url, v_link);
  v_body := public.meeting_fill(v_body, v_name, m.title, v_when, m.agenda, m.doc_url, v_link) || public.mail_tail(p_kind);
  insert into mail_outbox (to_email, subject, body, kind, meeting_id, ics) values (v_to, v_sub, v_body, p_kind, m.id, public.meeting_ics(m.id)) returning id into v_id;
  return v_id;
end $$;
revoke all on function public.queue_meeting_mail(text, uuid, uuid) from public, anon, authenticated;

-- 主辦人那一封。排這場會的人沒有了（帳號刪掉）就不寄。回那一封的 id。
create or replace function public.queue_meeting_summary(p_meeting uuid)
returns uuid language plpgsql security definer
set search_path = public, pg_temp
as $$
declare m record; v_to text; v_name text; v_tz text; v_when text; v_sub text; v_body text; v_link text; v_id uuid;
        v_yes text; v_no text; v_pending text;
begin
  select * into m from meetings where id = p_meeting;
  if m.id is null or m.created_by is null then return null; end if;
  select u.email, coalesce(nullif(btrim(p.name_zh), ''), nullif(btrim(p.name_en), ''), ''), coalesce(nullif(p.tz, ''), 'Asia/Taipei')
    into v_to, v_name, v_tz from auth.users u join profiles p on p.id = u.id where u.id = m.created_by;
  if v_to is null then return null; end if;
  begin
    v_when := to_char(m.starts_at at time zone v_tz, 'YYYY-MM-DD HH24:MI') || '–' || to_char(m.ends_at at time zone v_tz, 'HH24:MI') || '（' || v_tz || '）';
  exception when others then
    v_when := to_char(m.starts_at at time zone 'Asia/Taipei', 'YYYY-MM-DD HH24:MI') || '–' || to_char(m.ends_at at time zone 'Asia/Taipei', 'HH24:MI') || '（Asia/Taipei）';
  end;
  -- 名字：中文名優先、沒有就英文名。一行用頓號分。沒有人就寫一個「無」/ none。
  select coalesce(string_agg(coalesce(nullif(btrim(p.name_zh), ''), nullif(btrim(p.name_en), ''), '?'), '、' order by p.name_en), '—')
    into v_yes from meeting_attendees a join profiles p on p.id = a.user_id where a.meeting_id = m.id and a.status = 'accepted';
  select coalesce(string_agg(coalesce(nullif(btrim(p.name_zh), ''), nullif(btrim(p.name_en), ''), '?')
           || coalesce('（' || n.note || '）', ''), '、' order by p.name_en), '—')
    into v_no from meeting_attendees a join profiles p on p.id = a.user_id
    left join meeting_rsvp_notes n on n.meeting_id = a.meeting_id and n.user_id = a.user_id
   where a.meeting_id = m.id and a.status = 'declined';
  select coalesce(string_agg(coalesce(nullif(btrim(p.name_zh), ''), nullif(btrim(p.name_en), ''), '?'), '、' order by p.name_en), '—')
    into v_pending from meeting_attendees a join profiles p on p.id = a.user_id where a.meeting_id = m.id and a.status = 'invited';
  v_link := 'https://beyondtaiwannpo.com/home/?meeting=' || m.id::text;
  select subject, body into v_sub, v_body from mail_templates where kind = 'meeting_summary';
  if v_sub is null then v_sub := '{title}'; v_body := '{yes}' || E'\n' || '{no}' || E'\n' || '{pending}' || E'\n' || '{link}'; end if;
  v_sub  := replace(replace(v_sub, '{title}', m.title), '{name}', v_name);
  v_body := replace(replace(replace(replace(replace(replace(replace(v_body,
              '{name}', v_name), '{title}', m.title), '{when}', v_when), '{yes}', v_yes), '{no}', v_no), '{pending}', v_pending), '{link}', v_link)
            || public.mail_tail('meeting_summary');
  insert into mail_outbox (to_email, subject, body, kind, meeting_id) values (v_to, v_sub, v_body, 'meeting_summary', m.id) returning id into v_id;
  return v_id;
end $$;
revoke all on function public.queue_meeting_summary(uuid) from public, anon, authenticated;

-- 2026-11-02 那一版，多一封給主辦人的總表（同一刻、一場只一次，靠同一個 reminded_at）。
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
    if public.queue_meeting_summary(m.id) is not null then n := n + 1; end if;
    update meetings set reminded_at = now() where id = m.id;
  end loop;
  return n;
end $$;
revoke all on function public.queue_meeting_reminders() from public, anon, authenticated;

commit;

-- ---------- 驗收 ----------
select * from (
  with fns as (
    select p.proname, pg_get_function_identity_arguments(p.oid) as args, regexp_replace(p.prosrc, '--[^\n]*', '', 'g') as body, p.prosecdef, p.proconfig
      from pg_proc p where p.pronamespace = 'public'::regnamespace
       and p.proname in ('set_rsvp', 'save_meeting', 'schedule_meeting', 'queue_meeting_summary', 'queue_meeting_reminders', 'queue_meeting_mail')
  ), g as (
    select
      exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'meetings' and column_name = 'required') as col,
      coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.meeting_rsvp_notes')), false) as rls,
      (select count(*) from pg_policies where schemaname = 'public' and tablename = 'meeting_rsvp_notes' and cmd <> 'SELECT') as write_pol,
      coalesce((select qual from pg_policies where schemaname = 'public' and tablename = 'meeting_rsvp_notes' and policyname = 'rsvp_notes_read'), '') as read_qual,
      (select count(*) from fns where proname = 'set_rsvp') as n_rsvp,
      coalesce((select body from fns where proname = 'set_rsvp'), '') as rsvp_body,
      (select count(*) from fns where proname = 'save_meeting') as n_save,
      (select count(*) from fns where proname = 'schedule_meeting') as n_sched,
      coalesce((select body from fns where proname = 'save_meeting'), '') as save_body,
      coalesce((select body from fns where proname = 'queue_meeting_reminders'), '') as rem_body,
      coalesce((select body from fns where proname = 'queue_meeting_mail'), '') as mail_body,
      (select count(*) from fns where prosecdef and array_to_string(proconfig, ',') like '%search_path=%public%') as n_defs,
      (select count(*) from fns) as n_fns,
      (select count(*) from pg_proc p, aclexplode(p.proacl) x
        where p.pronamespace = 'public'::regnamespace and p.proname in ('set_rsvp', 'save_meeting', 'schedule_meeting', 'queue_meeting_summary')
          and x.grantee in (0::regrole, 'anon'::regrole) and x.privilege_type = 'EXECUTE') as anon_n,
      exists (select 1 from mail_templates where kind = 'meeting_summary') as tpl
  )
  select 0 ord, 'OVERALL' as 項目, null::text as 應該是, null::text as 實際是,
    case when col and rls and write_pol = 0 and read_qual like '%auth.uid()%' and read_qual like '%can_schedule%'
          and n_rsvp = 1 and rsvp_body like '%need_reason%' and rsvp_body like '%auth.uid()%'
          and n_save = 1 and n_sched = 1 and save_body like '%coalesce(p_required, required)%'
          and rem_body like '%queue_meeting_summary%' and mail_body like '%/home/?meeting=%'
          and n_defs = n_fns and anon_n = 0 and tpl then 'PASS' else 'FAIL' end as 結果 from g
  union all select 1, 'meetings 有 required', 'true', col::text, case when col then 'PASS' else 'FAIL' end from g
  union all select 2, '★ 理由那張表開了 RLS、沒有寫的政策', 'true / 0', rls::text || ' / ' || write_pol::text, case when rls and write_pol = 0 then 'PASS' else 'FAIL' end from g
  union all select 3, '★ 理由只給本人與排會的人看', 'auth.uid() 與 can_schedule', case when read_qual like '%auth.uid()%' and read_qual like '%can_schedule%' then '有' else '沒有' end,
    case when read_qual like '%auth.uid()%' and read_qual like '%can_schedule%' then 'PASS' else 'FAIL' end from g
  union all select 4, '★ set_rsvp 只剩一支、必到沒理由擋、只改自己那一列', '1 / true', n_rsvp::text || ' / ' || (rsvp_body like '%need_reason%' and rsvp_body like '%auth.uid()%')::text,
    case when n_rsvp = 1 and rsvp_body like '%need_reason%' and rsvp_body like '%auth.uid()%' then 'PASS' else 'FAIL' end from g
  union all select 5, 'save_meeting、schedule_meeting 各只剩一支；沒給必到就不改', '1 / 1 / true', n_save::text || ' / ' || n_sched::text || ' / ' || (save_body like '%coalesce(p_required, required)%')::text,
    case when n_save = 1 and n_sched = 1 and save_body like '%coalesce(p_required, required)%' then 'PASS' else 'FAIL' end from g
  union all select 6, '提醒那一刻也排主辦人的總表', 'true', (rem_body like '%queue_meeting_summary%')::text, case when rem_body like '%queue_meeting_summary%' then 'PASS' else 'FAIL' end from g
  union all select 7, '會議信的連結到 /home/', 'true', (mail_body like '%/home/?meeting=%')::text, case when mail_body like '%/home/?meeting=%' then 'PASS' else 'FAIL' end from g
  union all select 8, '函式都是 security definer、search_path 釘死', n_fns::text, n_defs::text, case when n_defs = n_fns then 'PASS' else 'FAIL' end from g
  union all select 9, '★ 沒登入叫不動', '0 筆', anon_n::text || ' 筆', case when anon_n = 0 then 'PASS' else 'FAIL' end from g
  union all select 10, '總表信的預設文案在', 'true', tpl::text, case when tpl then 'PASS' else 'FAIL' end from g
) t order by ord;
