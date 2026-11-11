-- 2026-12-15：活動的人看得到、審得了自己那場的報名（Paul 2026-11-10 拍板「Yes, do all 4」的第 1 件）。
--   問題：報名表、申請、審核、簽到、行前信的門都是 is_on_team / is_director_of，2026-10-30 起等於「整個 BT 的申請工作區 apps」。
--   開活動只給開的人那場活動自己的工作區（custom:event-<代號>），沒給 apps。所以被加進「誰能改這場活動」的人
--   打不開自己那場的報名表、看不到誰報了、當天不能簽到，活動頁還會誤寫「這場不開放報名」（其實是資料庫把表藏起來了）。
--   1. form_can_view(表單) = apps 看得到，或這張表綁的活動工作區看得到。form_can_edit 同理是「改」以上。
--      報名表、題目、申請、寄信紀錄的讀寫規則，與審核、簽到、行前信三支函式，都改看這兩個。
--      **範圍只到那一場**：活動工作區的人看得到的只有自己那場的報名，別場、別的計畫申請照舊只有 apps 的人看得到。
--   2. form_is_listed(表單)：綁著活動、活動還是草稿或待上架，報名表就不對外（/apply/ 列不到、送不出去），即使表單本身是開的。
--   3. attach_event_form(活動)：建活動時沒勾報名表的，之後可以補一張（那場「改」以上的人）。
-- 可以重跑。最後印一張驗收表。
begin;

create or replace function public.form_can_view(p_form uuid)
returns boolean language sql stable security definer
set search_path = public, pg_temp
as $$ select public.can_view('apps') or exists (select 1 from public.events e where e.form_id = p_form and public.can_view(e.workspace_id)); $$;

create or replace function public.form_can_edit(p_form uuid)
returns boolean language sql stable security definer
set search_path = public, pg_temp
as $$ select public.can_edit('apps') or exists (select 1 from public.events e where e.form_id = p_form and public.can_edit(e.workspace_id)); $$;

create or replace function public.form_is_listed(p_form uuid)
returns boolean language sql stable security definer
set search_path = public, pg_temp
as $$ select not exists (select 1 from public.events e where e.form_id = p_form and e.status in ('draft', 'ready')); $$;

-- 讀寫規則（policy 裡叫的函式，沒登入的人也要叫得到，三支只回 true／false）。
revoke all on function public.form_can_view(uuid), public.form_can_edit(uuid), public.form_is_listed(uuid) from public;
grant execute on function public.form_can_view(uuid), public.form_can_edit(uuid), public.form_is_listed(uuid) to anon, authenticated;

drop policy if exists forms_read on public.forms;
create policy forms_read on public.forms for select
  using ((status = 'open' and public.form_is_listed(id)) or public.form_can_view(id));
drop policy if exists forms_write on public.forms;
create policy forms_write on public.forms for update
  using (public.form_can_edit(id)) with check (public.form_can_edit(id));
drop policy if exists forms_delete on public.forms;
create policy forms_delete on public.forms for delete
  using (public.form_can_edit(id) and not exists (select 1 from public.events e where e.form_id = forms.id));

drop policy if exists fq_insert on public.form_questions;
create policy fq_insert on public.form_questions for insert
  with check (public.form_can_edit(form_id));
drop policy if exists fq_write on public.form_questions;
create policy fq_write on public.form_questions for update
  using (public.form_can_edit(form_id));
drop policy if exists fq_delete on public.form_questions;
create policy fq_delete on public.form_questions for delete
  using (public.form_can_edit(form_id));

drop policy if exists apps_read on public.applications;
create policy apps_read on public.applications for select
  using (user_id = auth.uid() or public.form_can_view(form_id));

drop policy if exists mail_read on public.mail_outbox;
create policy mail_read on public.mail_outbox for select
  using ((form_id is not null and public.form_can_view(form_id)) or public.is_president());

-- 審核、行前信、簽到：每一筆各自看那張表單（一次傳一百個 id、夾一個別場的，那一筆照樣擋）。錯誤字串沿用 not_director_of，前端那句話不用改。
CREATE OR REPLACE FUNCTION public.decide_applications(p_ids uuid[], p_status text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_uid uuid := auth.uid();
  r record;
  v_n int := 0;
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = 'P0001'; end if;
  if p_status not in ('received', 'interview', 'accepted', 'rejected') then
    raise exception 'bad_status' using errcode = 'P0001';
  end if;

  for r in
    select a.id, a.applicant_name, a.applicant_email, a.form_id, a.status as old_status,
           f.title, f.team, f.interview_url
      from public.applications a
      join public.forms f on f.id = a.form_id
     where a.id = any(p_ids)
  loop
    -- **每一筆各自檢查權限。** 一次傳一百個 id 進來、其中夾一個別的 team 的，
    -- 只檢查第一筆的話那一筆就會被偷偷改掉。
    if not public.form_can_edit(r.form_id) then
      raise exception 'not_director_of:%', r.team using errcode = 'P0001';
    end if;
    -- 狀態沒有變就不做事，也不寄信。**這是防連點的核心。**
    continue when r.old_status = p_status;

    update public.applications
       set status = p_status, decided_at = now(), decided_by = v_uid
     where id = r.id;
    v_n := v_n + 1;

    if p_status in ('interview', 'accepted', 'rejected') then
      insert into public.mail_outbox (to_email, subject, body, kind, application_id, form_id)
      values (r.applicant_email,
              public.mail_subject(p_status, r.applicant_name, r.title),
              public.mail_body(p_status, r.applicant_name, r.title,
                case when p_status = 'interview' and coalesce(r.interview_url, '') <> ''
                     then '請從這個連結挑一個你方便的時段：' || E'\n' || r.interview_url
                     else null end),
              p_status, r.id, r.form_id);
    end if;
  end loop;
  return v_n;
end $function$;

CREATE OR REPLACE FUNCTION public.send_notice(p_form_id uuid, p_statuses text[], p_subject text, p_body text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_uid uuid := auth.uid(); v_team text; v_title text; v_n int;
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = 'P0001'; end if;
  if coalesce(btrim(p_subject), '') = '' or coalesce(btrim(p_body), '') = '' then
    raise exception 'empty_mail' using errcode = 'P0001';
  end if;
  select team, title into v_team, v_title from public.forms where id = p_form_id;
  if v_team is null then raise exception 'no_such_form' using errcode = 'P0001'; end if;
  if not public.form_can_edit(p_form_id) then
    raise exception 'not_director_of:%', v_team using errcode = 'P0001';
  end if;

  insert into public.mail_outbox (to_email, subject, body, kind, application_id, form_id)
  select a.applicant_email,
         p_subject,
         -- 收信的是高中生，所以信尾那兩句一定要在：
         -- **「不要回覆這封信」是必要資訊，不是禮貌用語**（noreply 沒有 MX）。
         a.applicant_name || ' 你好，' || E'\n\n' || p_body || E'\n\n' ||
         '（這封信是關於「' || v_title || '」。）' || E'\n' ||
         '不要回覆這封信，這個信箱沒有人看。有問題請寄到 beyondtaiwan2020@gmail.com。' || E'\n\n' ||
         'Beyond Taiwan',
         'notice', a.id, a.form_id
    from public.applications a
   where a.form_id = p_form_id
     and a.status = any(coalesce(p_statuses, array['accepted']));
  get diagnostics v_n = row_count;
  return v_n;
end $function$;

CREATE OR REPLACE FUNCTION public.set_check_in(p_ids uuid[], p_present boolean)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_uid uuid := auth.uid(); r record; v_n int := 0;
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = 'P0001'; end if;
  for r in
    select a.id, a.form_id, f.team from public.applications a
      join public.forms f on f.id = a.form_id
     where a.id = any(p_ids)
  loop
    -- 每一筆各自檢查。一次傳一百個 id 進來、其中夾一個別的 team 的，
    -- 只檢查第一筆的話那一筆就會被偷偷改掉（跟 decide_applications 同一個理由）。
    if not public.form_can_edit(r.form_id) then
      raise exception 'not_director_of:%', r.team using errcode = 'P0001';
    end if;
    update public.applications
       set checked_in_at = case when p_present then now() else null end,
           checked_in_by = case when p_present then v_uid else null end
     where id = r.id;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $function$;

-- 送出申請：多一道「活動還沒上架就不收」。
CREATE OR REPLACE FUNCTION public.submit_application(p_form_id uuid, p_answers jsonb, p_guardian_email text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_uid   uuid := auth.uid();
  v_form  public.forms%rowtype;
  v_app   uuid;
  v_name  text; v_school text; v_grade text; v_email text;
  v_missing text;
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = 'P0001'; end if;
  select * into v_form from public.forms where id = p_form_id;
  if not found then raise exception 'no_such_form' using errcode = 'P0001'; end if;
  if v_form.status <> 'open'
     or (v_form.opens_at  is not null and now() < v_form.opens_at)
     or (v_form.closes_at is not null and now() > v_form.closes_at)
  then raise exception 'form_closed' using errcode = 'P0001'; end if;
  -- 2026-12-15：綁著活動的報名表，活動還沒上架（draft、ready）就不收。
  if not public.form_is_listed(p_form_id) then raise exception 'form_closed' using errcode = 'P0001'; end if;
  -- 2026-11-01 額滿硬關：報名表綁著活動、活動有名額、沒被拒的申請數到了就擋。已經報過的人走到底下 unique_violation 那條回原本那一筆。
  if public.event_is_full(p_form_id) and not exists (select 1 from public.applications where form_id = p_form_id and user_id = v_uid) then
    raise exception 'full' using errcode = 'P0001';
  end if;
  select coalesce(name_zh, name_en, ''), school, grade into v_name, v_school, v_grade from public.profiles where id = v_uid;
  if coalesce(v_name, '') = '' then raise exception 'profile_incomplete' using errcode = 'P0001'; end if;
  select email into v_email from auth.users where id = v_uid;
  select string_agg(q.label, '、' order by q.ord) into v_missing
    from public.form_questions q
   where q.form_id = p_form_id and q.required
     and coalesce(btrim((
       select a->>'v' from jsonb_array_elements(coalesce(p_answers, '[]'::jsonb)) a
        where a->>'q' = q.id::text limit 1)), '') = '';
  if v_missing is not null then raise exception 'missing:%', v_missing using errcode = 'P0001'; end if;
  insert into public.applications
    (form_id, user_id, applicant_name, applicant_school, applicant_grade, applicant_email, guardian_email)
  values (p_form_id, v_uid, v_name, v_school, v_grade, v_email, nullif(btrim(coalesce(p_guardian_email, '')), ''))
  returning id into v_app;
  insert into public.application_answers (application_id, question_id, value)
  select v_app, q.id,
         coalesce((select a->>'v' from jsonb_array_elements(coalesce(p_answers, '[]'::jsonb)) a
                    where a->>'q' = q.id::text limit 1), '')
    from public.form_questions q
   where q.form_id = p_form_id;
  return v_app;
exception
  when unique_violation then
    select id into v_app from public.applications where form_id = p_form_id and user_id = v_uid;
    return v_app;
end $function$;

-- 補一張報名表給沒有報名表的活動。
create or replace function public.attach_event_form(p_event uuid)
returns uuid language plpgsql security definer
set search_path = public, pg_temp
as $$
declare e record; v_form uuid;
begin
  select * into e from public.events where id = p_event;
  if e.id is null then raise exception 'no_such_event' using errcode = 'P0001'; end if;
  if not public.can_edit(e.workspace_id) then raise exception 'not_event_editor' using errcode = 'P0001'; end if;
  if e.form_id is not null then return e.form_id; end if;
  insert into public.forms (team, kind, title, status, created_by)
  values (e.team, 'program', coalesce(nullif(btrim(e.title_zh), ''), nullif(btrim(e.title_en), ''), e.slug), 'draft', auth.uid())
  returning id into v_form;
  update public.events set form_id = v_form where id = p_event;
  return v_form;
end $$;
revoke all on function public.attach_event_form(uuid) from public, anon;
grant execute on function public.attach_event_form(uuid) to authenticated;

commit;

-- ---------- 驗收 ----------
select * from (
  with fn as (select proname, regexp_replace(prosrc, '--[^\n]*', '', 'g') as body from pg_proc where pronamespace = 'public'::regnamespace),
  pol as (select tablename, policyname, coalesce(qual, '') || ' ' || coalesce(with_check, '') as q from pg_policies where schemaname = 'public'),
  t as (
    select (select count(*) = 3 from fn where proname in ('form_can_view', 'form_can_edit', 'form_is_listed')) as helpers,
           (select bool_and(q like '%form_can_%') from pol where (tablename, policyname) in (('forms','forms_read'),('forms','forms_write'),('forms','forms_delete'),('form_questions','fq_insert'),('form_questions','fq_write'),('form_questions','fq_delete'),('applications','apps_read'),('mail_outbox','mail_read'))) as policies,
           (select q like '%form_is_listed%' from pol where tablename = 'forms' and policyname = 'forms_read') as listed_read,
           (select bool_and(body like '%form_can_edit(%' and body not like '%is_director_of%') from fn where proname in ('decide_applications', 'send_notice', 'set_check_in')) as fns,
           (select body like '%form_is_listed(p_form_id)%' from fn where proname = 'submit_application') as submit_gate,
           (select body like '%can_edit(e.workspace_id)%' from fn where proname = 'attach_event_form') as attach_gate,
           (select not has_function_privilege('anon', 'public.attach_event_form(uuid)', 'execute')) as anon_out
  )
  select 0 ord, 'OVERALL' as 項目, null::text as 應該是, null::text as 實際是,
    case when helpers and policies and listed_read and fns and submit_gate and attach_gate and anon_out then 'PASS' else 'FAIL' end as 結果 from t
  union all select 1, '三支判斷函式在', 'true', helpers::text, case when helpers then 'PASS' else 'FAIL' end from t
  union all select 2, '★ 報名表、題目、申請、寄信紀錄八條規則都看表單本身', 'true', policies::text, case when policies then 'PASS' else 'FAIL' end from t
  union all select 3, '★ 活動還沒上架，報名表不對外', 'true', listed_read::text, case when listed_read then 'PASS' else 'FAIL' end from t
  union all select 4, '★ 審核、行前信、簽到每一筆看那張表單', 'true', fns::text, case when fns then 'PASS' else 'FAIL' end from t
  union all select 5, '送出申請也擋還沒上架的活動', 'true', submit_gate::text, case when submit_gate then 'PASS' else 'FAIL' end from t
  union all select 6, '補報名表要那場「改」以上', 'true', attach_gate::text, case when attach_gate then 'PASS' else 'FAIL' end from t
  union all select 7, 'anon 叫不到補報名表', 'true', anon_out::text, case when anon_out then 'PASS' else 'FAIL' end from t
) x order by ord;
