-- 2026-12-21：送出申請之後的確認信（Paul 2026-11-13：表單要像 Tally，要有送出確認信）。
-- 接在 2026-12-20-form-engine.sql 後面跑。可以重跑，不動既有的信與申請。最後印一張驗收表，全 PASS 才算跑成功。
--
-- 做了什麼：
--   1. 信的種類多一個 received（「我們收到你的申請了」）。mail_outbox 與 mail_templates 的種類清單都加。
--   2. forms 多一欄 confirm_mail：這份表單送出之後要不要寄確認信。**預設不寄**，在後台表單設定打勾才寄，
--      理由是現在已經開著的表單不會突然開始寄信給人。
--   3. 一份預設文案（中英兩版），Co-President 在後台「網站 → 信件文案」改得到，跟其他信同一個地方。
--      代換符號跟錄取信一樣：{姓名} {活動名稱}。
--   4. applications 新增一筆之後的 trigger：表單有勾才排一封進 mail_outbox，寄到申請人自己的登入信箱。
--      寄信的那一段（Resend）跟其他信同一條路，這裡只排進去。
--
-- ⚠ 信裡**不帶任何答案**，只有姓名與表單名稱。申請人多半是高中生，答案留在網站上，登入才看得到。
--   要在信裡放答案的話先問 Paul（信寄出去就收不回來，轉寄也擋不了）。
begin;

-- ---------- 1. 信的種類 ----------
do $$
declare v text;
begin
  select conname into v from pg_constraint where conrelid = 'public.mail_outbox'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%kind%';
  if v is not null then execute format('alter table public.mail_outbox drop constraint %I', v); end if;
  alter table public.mail_outbox add constraint mail_outbox_kind_check
    check (kind in ('guardian', 'interview', 'accepted', 'rejected', 'notice', 'invite', 'request_new', 'request_done', 'request_rejected',
                    'meeting_invite', 'meeting_reminder', 'meeting_summary', 'meeting_update', 'meeting_cancel', 'received'));
  select conname into v from pg_constraint where conrelid = 'public.mail_templates'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%kind%';
  if v is not null then execute format('alter table public.mail_templates drop constraint %I', v); end if;
  alter table public.mail_templates add constraint mail_templates_kind_check
    check (kind in ('guardian', 'interview', 'accepted', 'rejected', 'invite', 'request_new', 'request_done', 'request_rejected',
                    'meeting_invite', 'meeting_reminder', 'meeting_summary', 'meeting_update', 'meeting_cancel', 'received'));
end $$;

-- ---------- 2. 表單的開關 ----------
alter table public.forms add column if not exists confirm_mail boolean not null default false;
comment on column public.forms.confirm_mail is
  '送出之後要不要寄確認信給申請人（2026-12-21）。預設不寄。文案在 mail_templates 的 received 那一列。';

-- ---------- 3. 預設文案 ----------
-- on conflict do nothing：重跑不會蓋掉 Co-President 改過的字。
insert into public.mail_templates (kind, subject_zh, body_zh, subject_en, body_en) values
('received',
 '我們收到你的申請了：{活動名稱}',
 '{姓名} 你好，' || E'\n\n' ||
 '我們收到你申請「{活動名稱}」的資料了，謝謝你花時間填。' || E'\n\n' ||
 '每一份申請我們都會看過，有結果會再寄信給你。想知道現在到哪一步，登入 Beyond Taiwan 就看得到。',
 'We got your application: {活動名稱}',
 'Hi {姓名},' || E'\n\n' ||
 'Thanks for applying to {活動名稱}. Your application is in.' || E'\n\n' ||
 'We read every application and will email you when there is news. To see where it stands, sign in to Beyond Taiwan.')
on conflict (kind) do nothing;

-- 退路：mail_templates 讀不到這一列時（被刪掉）也寄得出去。其他種類的退路照舊。
create or replace function public.mail_subject(p_kind text, p_name text, p_title text)
returns text language plpgsql stable
set search_path = public, pg_temp
as $$
declare v text;
begin
  select subject into v from public.mail_templates where kind = p_kind;
  -- 讀不到就退回寫死的那一份（2026-09-16-mail-templates.sql 檔頭第 2 點）。
  if v is null then
    v := case p_kind
      when 'guardian' then 'Beyond Taiwan：{姓名} 報名了活動'
      when 'accepted' then 'Beyond Taiwan：「{活動名稱}」錄取通知'
      when 'received' then 'Beyond Taiwan：我們收到你的申請了'
      else 'Beyond Taiwan：關於你申請的「{活動名稱}」' end;
  end if;
  return public.mail_fill(v, p_name, p_title);
end $$;

create or replace function public.mail_body(p_kind text, p_name text, p_title text, p_extra text)
returns text language plpgsql stable
set search_path = public, pg_temp
as $$
declare v text;
begin
  select body into v from public.mail_templates where kind = p_kind;
  if v is null then
    -- 退路。**刻意只留最短的一份**，它的工作是「信寄得出去」，不是好看。
    v := case p_kind
      when 'guardian' then '您好，' || E'\n\n' || '{姓名} 剛剛向 Beyond Taiwan 報名了「{活動名稱}」。'
      when 'accepted' then '{姓名} 你好，' || E'\n\n' || '你申請的「{活動名稱}」錄取了。'
      when 'rejected' then '{姓名} 你好，' || E'\n\n' || '謝謝你申請「{活動名稱}」。這一次我們沒有辦法把名額給你。'
      when 'received' then '{姓名} 你好，' || E'\n\n' || '我們收到你申請「{活動名稱}」的資料了。有結果會再寄信給你。'
      else '{姓名} 你好，' || E'\n\n' || '關於你申請的「{活動名稱}」，我們想跟你聊聊。' end;
  end if;
  return public.mail_fill(v, p_name, p_title)
       || coalesce(E'\n\n' || nullif(btrim(coalesce(p_extra, '')), ''), '')
       || public.mail_tail(p_kind);
end $$;

-- 按鈕的字與信頭的照片（跟 2026-11-24-request-accept-reject.sql 那一版一樣，多 received 一種）。
create or replace function public.mail_defaults(p_kind text, p_lang text)
returns table(button_label text, hero text) language sql immutable
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
      when 'received' then case when p_lang = 'en' then 'See my application' else '看我的申請' end
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
      when 'received' then 'hero-listening.jpg'
      else 'hero-listening.jpg' end
$$;

-- 按鈕連到哪：確認信連到申請人自己的頁面（/app/ 最上面就是「我的申請」）。
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
    when r.kind = 'received' then 'https://beyondtaiwannpo.com/app/'
    when r.kind in ('accepted', 'rejected', 'notice', 'guardian') then 'https://beyondtaiwannpo.com/apply/'
    else '' end
$$;

-- ---------- 4. 送出之後排一封 ----------
create or replace function public.queue_received_mail()
returns trigger language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_form public.forms%rowtype;
begin
  select * into v_form from public.forms where id = new.form_id;
  -- 表單沒勾就什麼都不做。沒有信箱（理論上不會）也不做，不擋申請。
  if not coalesce(v_form.confirm_mail, false) then return new; end if;
  if coalesce(btrim(new.applicant_email), '') = '' then return new; end if;
  insert into public.mail_outbox (to_email, subject, body, kind, application_id, form_id, lang)
  values (new.applicant_email,
          public.mail_subject('received', new.applicant_name, coalesce(v_form.title, '一個活動')),
          public.mail_body('received', new.applicant_name, coalesce(v_form.title, '一個活動'), null),
          'received', new.id, new.form_id, nullif(v_form.lang, ''));
  return new;
end $$;
revoke all on function public.queue_received_mail() from public, anon, authenticated;
drop trigger if exists applications_received_mail on public.applications;
create trigger applications_received_mail after insert on public.applications
  for each row execute function public.queue_received_mail();

commit;

-- ---------- 驗收 ----------
select * from (
  with t as (
    select coalesce((select pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.mail_outbox'::regclass and conname = 'mail_outbox_kind_check'), '') like '%received%'
             and coalesce((select pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.mail_templates'::regclass and conname = 'mail_templates_kind_check'), '') like '%received%' as kinds,
           exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'forms' and column_name = 'confirm_mail' and column_default = 'false') as toggle,
           exists (select 1 from public.mail_templates where kind = 'received' and subject_zh like '%{活動名稱}%' and coalesce(body_en, '') <> '') as template,
           exists (select 1 from pg_trigger where tgrelid = 'public.applications'::regclass and tgname = 'applications_received_mail' and not tgisinternal) as trig,
           (select prosrc like '%coalesce(v_form.confirm_mail, false)%' and prosecdef from pg_proc where proname = 'queue_received_mail' and pronamespace = 'public'::regnamespace) as gated,
           (select button_label from public.mail_defaults('received', 'zh')) = '看我的申請' as button,
           public.mail_body('received', '測試', '測試表單', null) like '%測試表單%' as body,
           not has_function_privilege('authenticated', 'public.queue_received_mail()', 'execute') as private
  )
  select 0 ord, 'OVERALL' as 項目, null::text as 應該是, null::text as 實際是,
    case when kinds and toggle and template and trig and gated and button and body and private then 'PASS' else 'FAIL' end as 結果 from t
  union all select 1, '信的種類多 received（outbox 與文案兩邊）', 'true', kinds::text, case when kinds then 'PASS' else 'FAIL' end from t
  union all select 2, '★ 表單多「寄確認信」開關，預設不寄', 'true', toggle::text, case when toggle then 'PASS' else 'FAIL' end from t
  union all select 3, '預設文案在（中英兩版）', 'true', template::text, case when template then 'PASS' else 'FAIL' end from t
  union all select 4, '送出之後的 trigger 在', 'true', trig::text, case when trig then 'PASS' else 'FAIL' end from t
  union all select 5, '★ 只有表單勾了才寄', 'true', gated::text, case when gated then 'PASS' else 'FAIL' end from t
  union all select 6, '按鈕寫「看我的申請」', 'true', button::text, case when button then 'PASS' else 'FAIL' end from t
  union all select 7, '信的內文代換得出表單名稱', 'true', body::text, case when body then 'PASS' else 'FAIL' end from t
  union all select 8, '排信那支誰都不能直接叫', 'true', private::text, case when private then 'PASS' else 'FAIL' end from t
) x order by ord;
