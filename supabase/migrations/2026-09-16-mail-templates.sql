-- 信件文案改成後台編輯得動。　2026-09-08
--
-- 用法：整份貼進 Supabase SQL Editor 按一次 Run。前面幾支都要先跑過。
--
-- ============================================================================
-- 為什麼要做這件事
-- ============================================================================
-- 四封信的文字原本寫死在 mail_body() 裡，改一句話要跑一支遷移檔。
-- 對 Paul 沒差，但對明年那個幹部來說，「改一句信的文案」變成要碰 SQL ——
-- **那跟北極星（換屆的幹部接得住）是有張力的。**
--
-- ============================================================================
-- 這一支的形狀
-- ============================================================================
--   mail_templates：一種信一列，主旨與內文可以改。
--   mail_body()：改成去讀那張表，**讀不到就退回寫死的那一份**。
--   set_mail_template()：只有 president 改得動。
--
-- ============================================================================
-- 三個刻意的限制
-- ============================================================================
-- 1. **信尾那一段不給改。** 「不要回覆這封信，這個信箱沒有人看」是必要資訊，
--    不是禮貌用語 —— noreply 沒有 MX，按回覆會被退回，而那個人只會覺得
--    沒有人理他。它由系統加在每一封信的最後面。
--
-- 2. **讀不到就退回寫死的那一份。** 有人手滑刪掉一列、或是這張表還沒建起來的時候，
--    信照樣寄得出去。**寄不出「恭喜錄取」的成本，遠高於那封信用的是舊文案。**
--
-- 3. **只有 president 改得動。** 這四封信是全組織對外的聲音，
--    不是某個 team 自己的東西。六個 team 各自改一句，那四封信就會慢慢變成六種語氣。

begin;

create table if not exists public.mail_templates (
  kind        text primary key check (kind in ('guardian', 'interview', 'accepted', 'rejected')),
  subject     text not null,
  body        text not null,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references public.profiles(id) on delete set null
);

comment on table public.mail_templates is
  '四封系統信的文案。**信尾那一段不在這裡**，由 mail_body() 自己加。';
comment on column public.mail_templates.body is
  '信的中間那一段。可以用兩個代換符號：
     {姓名}     申請人的名字（家長信裡是孩子的名字）
     {活動名稱} 那份表單的標題
   打錯或刪掉不會壞掉，只是那個位置會空著 —— 所以後台上有即時預覽。';
comment on column public.mail_templates.subject is
  '主旨。同樣可以用 {姓名} 與 {活動名稱}。';

drop trigger if exists mail_templates_touch on public.mail_templates;
create trigger mail_templates_touch before update on public.mail_templates
  for each row execute function public.touch_updated_at();

-- 種子：跟原本寫死的那四份一字不差。
-- **on conflict do nothing** —— 重跑這一支不會把 Paul 改過的文案蓋回去。
insert into public.mail_templates (kind, subject, body) values
('guardian',
 'Beyond Taiwan：{姓名} 報名了活動',
 '您好，' || E'\n\n' ||
 '{姓名} 剛剛向 Beyond Taiwan 報名了「{活動名稱}」。' || E'\n\n' ||
 'Beyond Taiwan 是由台灣學生組成的教育非營利組織，活動免費。' || E'\n' ||
 '我們會保存他填寫的姓名、就讀學校、年級、email 與申請內容，' || E'\n' ||
 '只有負責這個計畫的團隊看得到。完整說明在 https://beyondtaiwannpo.com/privacy/'),
('interview',
 'Beyond Taiwan：關於你申請的「{活動名稱}」',
 '{姓名} 你好，' || E'\n\n' ||
 '關於你申請的「{活動名稱}」，我們想跟你聊聊。'),
('accepted',
 'Beyond Taiwan：「{活動名稱}」錄取通知',
 '{姓名} 你好，' || E'\n\n' ||
 '你申請的「{活動名稱}」錄取了。' || E'\n\n' ||
 '我們會再寄一封信給你，說明時間、地點與要帶什麼。'),
('rejected',
 'Beyond Taiwan：關於你申請的「{活動名稱}」',
 '{姓名} 你好，' || E'\n\n' ||
 '謝謝你申請「{活動名稱}」。這一次我們沒有辦法把名額給你。' || E'\n\n' ||
 '名額有限，而每一年報名的人都比名額多，所以這不代表你寫得不好。' || E'\n' ||
 '我們之後還會辦，也歡迎你再來。活動都會先公布在 Instagram @beyondtaiwan。')
on conflict (kind) do nothing;

alter table public.mail_templates enable row level security;
drop policy if exists mt_read on public.mail_templates;
-- 所有幹部都看得到（他們會想知道系統以他們的名義寄了什麼出去）。改不動。
create policy mt_read on public.mail_templates for select to authenticated using (public.is_cadre());
revoke all on public.mail_templates from anon, authenticated;
grant select on public.mail_templates to authenticated;
-- **沒有 insert / update / delete 的授權。** 只走 set_mail_template()。

-- ---------- 信尾：系統加，不給改 ----------
create or replace function public.mail_tail(p_kind text)
returns text language sql immutable
as $$
  select case p_kind
    when 'guardian' then
      E'\n\n' || '這封信是告知，不需要回覆或簽名。有任何問題請寄到 beyondtaiwan2020@gmail.com。'
        || E'\n\n' || 'Beyond Taiwan'
    else
      E'\n\n' || '不要回覆這封信，這個信箱沒有人看。有問題請寄到 beyondtaiwan2020@gmail.com。'
        || E'\n\n' || 'Beyond Taiwan'
  end;
$$;

-- ---------- 代換 ----------
create or replace function public.mail_fill(p_text text, p_name text, p_title text)
returns text language sql immutable
as $$
  select replace(replace(coalesce(p_text, ''), '{姓名}', coalesce(p_name, '')),
                 '{活動名稱}', coalesce(p_title, ''))
$$;

-- ---------- 主旨 ----------
create or replace function public.mail_subject(p_kind text, p_name text, p_title text)
returns text language plpgsql stable
set search_path = public, pg_temp
as $$
declare v text;
begin
  select subject into v from public.mail_templates where kind = p_kind;
  -- 讀不到就退回寫死的那一份，理由見檔頭第 2 點。
  if v is null then
    v := case p_kind
      when 'guardian' then 'Beyond Taiwan：{姓名} 報名了活動'
      when 'accepted' then 'Beyond Taiwan：「{活動名稱}」錄取通知'
      else 'Beyond Taiwan：關於你申請的「{活動名稱}」' end;
  end if;
  return public.mail_fill(v, p_name, p_title);
end $$;

-- ---------- 內文 ----------
-- 簽章跟原本一樣（p_extra 給面試那封放 Cal 連結），呼叫端不用改。
create or replace function public.mail_body(p_kind text, p_name text, p_title text, p_extra text)
returns text language plpgsql stable
set search_path = public, pg_temp
as $$
declare v text;
begin
  select body into v from public.mail_templates where kind = p_kind;
  if v is null then
    -- 退路。**刻意只留最短的一份** —— 它的工作是「信寄得出去」，不是好看。
    v := case p_kind
      when 'guardian' then '您好，' || E'\n\n' || '{姓名} 剛剛向 Beyond Taiwan 報名了「{活動名稱}」。'
      when 'accepted' then '{姓名} 你好，' || E'\n\n' || '你申請的「{活動名稱}」錄取了。'
      when 'rejected' then '{姓名} 你好，' || E'\n\n' || '謝謝你申請「{活動名稱}」。這一次我們沒有辦法把名額給你。'
      else '{姓名} 你好，' || E'\n\n' || '關於你申請的「{活動名稱}」，我們想跟你聊聊。' end;
  end if;
  return public.mail_fill(v, p_name, p_title)
       || coalesce(E'\n\n' || nullif(btrim(coalesce(p_extra, '')), ''), '')
       || public.mail_tail(p_kind);
end $$;

-- ---------- 改文案 ----------
create or replace function public.set_mail_template(p_kind text, p_subject text, p_body text)
returns text language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_president() then
    raise exception 'not_president' using errcode = 'P0001';
  end if;
  if coalesce(btrim(p_subject), '') = '' or coalesce(btrim(p_body), '') = '' then
    raise exception 'empty_mail' using errcode = 'P0001';
  end if;
  update public.mail_templates
     set subject = p_subject, body = p_body, updated_by = auth.uid()
   where kind = p_kind;
  if not found then raise exception 'no_such_template' using errcode = 'P0001'; end if;
  return p_kind;
end $$;

revoke all on function public.set_mail_template(text, text, text) from public, anon;
grant execute on function public.set_mail_template(text, text, text) to authenticated;

-- ---------- 主旨的兩個呼叫端也要換 ----------
-- ⚠ **不換的話文案只改得動一半**：內文跟著表走，主旨還是寫死的。
-- 那種半套最難發現 —— 改了主旨按存檔，一切正常，直到信寄出去才看得到。
create or replace function public.queue_guardian_notice()
returns trigger language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_title text;
begin
  -- 沒填家長信箱就什麼都不做。填錯或亂填不擋申請（2026-09-07 拍板）。
  if coalesce(btrim(new.guardian_email), '') = '' then return new; end if;
  select title into v_title from public.forms where id = new.form_id;
  insert into public.mail_outbox (to_email, subject, body, kind, application_id, form_id)
  values (new.guardian_email,
          public.mail_subject('guardian', new.applicant_name, coalesce(v_title, '一個活動')),
          public.mail_body('guardian', new.applicant_name, coalesce(v_title, '一個活動'), null),
          'guardian', new.id, new.form_id);
  return new;
end $$;

create or replace function public.decide_applications(p_ids uuid[], p_status text)
returns int language plpgsql security definer
set search_path = public, pg_temp
as $$
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
    if not public.is_director_of(r.team) then
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
end $$;

revoke all on function public.decide_applications(uuid[], text) from public, anon;
grant execute on function public.decide_applications(uuid[], text) to authenticated;

commit;
