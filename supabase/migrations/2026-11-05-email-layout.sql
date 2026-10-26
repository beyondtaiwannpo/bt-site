-- 信長什麼樣：每一種信同一套 HTML 版型　2026-11-05
--
-- 用法：整份貼進 Supabase SQL Editor 按一次 Run。可以重跑。最後印一張 PASS / FAIL 表。
-- **要先跑過 2026-11-04-passport-self-heal.sql**（順序照日期）。
--
-- Paul 2026-10-26 把邀請信跟一封設計過的電子報放在一起看：「信真的很醜、不專業，要多一點圖，連結要是一顆按鈕，沒有人會按那條連結。」
-- 設計重點（docs 見 README「信長什麼樣」）：
--   一套 table 排版的 HTML（600 寬、紙色底、頂上 BT logo、顯示字型的標題、內文段落、一顆橘色主按鈕、每種信一張既有的照片、信尾那句不要回覆），
--   每一種信都套（邀請、會議兩封、需求單兩封、申請那五封）。寄給 Resend 的時候 html 與 text 一起送（text 就是原本那段純文字）。
--   **文案還是 cadre 在後台「信件文案」改：主旨、內文、按鈕的字；版型是寫死的程式。**
--   語言（Paul 2026-10-26 拍板）：一封信一種語言，照收信的人的語言（profiles.lang）；被邀請的人還沒有帳號，就用邀請人按下「邀請」那一刻的介面語言
--   （前端帶 p_lang 進來，存在 invite_codes.lang 與 mail_outbox.lang）。兩個都沒有就中文。要兩種疊在一起只要把 mail_settings.one_lang 關掉，預設關著那個選項。
--
-- ============================================================================
-- 這一支在做什麼
-- ============================================================================
--   1. mail_templates 改成 subject_zh / body_zh / subject_en / body_en 四欄各存一種語言，加 button_label / button_label_en（按鈕的字；空的用每種信的預設）；
--      subject 與 body 變成自動合併的欄（排信的函式照舊讀它們）。
--      既有的雙語文案自動拆：主旨用全形空格「　」分、內文用英文那一段的開頭（Hi {name}, / Hi Marketing team,）分。
--   2. profiles 多一欄 lang（zh / en，可以空）；mail_settings 一張小表（one_lang 開關，預設開）。
--   3. mail_html(kind, subject, body, button_label, button_url, lang)：把純文字包成 HTML。所有使用者的字都跳脫。
--      mail_button_url(outbox 那一列)：按鈕連到哪，從那一列的 invite_code / request_id / meeting_id / application_id 推。
--   4. send_pending_mail() 整支重建：寄之前算 lang、按鈕、html；Resend 收 html 加 text。
--      **排信的那幾支函式一個字不動**（它們排的還是純文字；英文版的文案由 send 這一步換）。
--   5. set_mail_template() 多一個版本收七個參數（舊的三參數版改成寫中文那兩欄）。mail_render(outbox_id) 給 smoke 與預覽看包好的 HTML。
--   6. invite_person() 多一個十二參數版、resend_invite() 多一個兩參數版：帶邀請人的介面語言（舊的留著）。
-- ============================================================================

begin;

-- ---------- 1. 模板中英各一欄、subject 與 body 改成自動合併 ----------
-- 為什麼這樣做：排信的那幾支函式（queue_invite_mail、需求單、會議）都是 select subject, body from mail_templates。
-- 模板拆成中英之後它們若只讀到中文，英文收件人就永遠收到中文（2026-11-05 smoke 抓到的）。
-- 所以真正存的是 subject_zh / body_zh / subject_en / body_en，subject 與 body 變成資料庫自己算的合併欄（generated column）：
-- 主旨「中文　英文」（全形空格分），內文「中文 \n\n[[en]]\n 英文」。排信的函式一個字不用動，寄之前再依收信的人的語言切回一種。
alter table public.mail_templates add column if not exists subject_en text;
alter table public.mail_templates add column if not exists body_en text;
alter table public.mail_templates add column if not exists button_label text;
alter table public.mail_templates add column if not exists button_label_en text;
do $$
declare r record; v_pos int; v_marker text;
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'mail_templates' and column_name = 'subject_zh') then
    alter table public.mail_templates rename column subject to subject_zh;
    alter table public.mail_templates rename column body to body_zh;
    -- 既有的雙語模板拆開：英文那一段從 Hi / Dear 那一行開始，主旨用全形空格分。
    for r in select * from mail_templates where body_en is null loop
      foreach v_marker in array array[E'\nHi {name},', E'\nHi Marketing team,', E'\nHi {requester},', E'\nHi {姓名},', E'\nDear '] loop
        v_pos := position(v_marker in r.body_zh);
        if v_pos > 0 then
          update mail_templates set body_en = btrim(substring(r.body_zh from v_pos)), body_zh = rtrim(substring(r.body_zh from 1 for v_pos - 1)) where kind = r.kind;
          exit;
        end if;
      end loop;
      if position('　' in r.subject_zh) > 0 and r.subject_en is null then
        update mail_templates set subject_en = btrim(split_part(r.subject_zh, '　', 2)), subject_zh = btrim(split_part(r.subject_zh, '　', 1)) where kind = r.kind;
      end if;
    end loop;
    alter table public.mail_templates add column subject text generated always as
      (case when nullif(btrim(coalesce(subject_en, '')), '') is null then subject_zh else subject_zh || '　' || btrim(subject_en) end) stored;
    alter table public.mail_templates add column body text generated always as
      (case when nullif(btrim(coalesce(body_en, '')), '') is null then body_zh else body_zh || E'\n\n[[en]]\n' || btrim(body_en) end) stored;
  end if;
end $$;

-- 舊的三參數版改成寫中文那兩欄（subject 與 body 現在是算出來的，寫不進去）。
create or replace function public.set_mail_template(p_kind text, p_subject text, p_body text)
returns text language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  perform public.require_senior();
  if coalesce(btrim(p_subject), '') = '' or coalesce(btrim(p_body), '') = '' then raise exception 'empty_mail' using errcode = 'P0001'; end if;
  update public.mail_templates set subject_zh = p_subject, body_zh = p_body, updated_by = auth.uid() where kind = p_kind;
  if not found then raise exception 'no_such_template' using errcode = 'P0001'; end if;
  return p_kind;
end $$;

-- ---------- 2. 語言與開關 ----------
alter table public.profiles add column if not exists lang text check (lang is null or lang in ('zh', 'en'));
do $$ begin
  if not exists (select 1 from information_schema.column_privileges where table_schema = 'public' and table_name = 'profiles' and column_name = 'lang' and grantee = 'authenticated' and privilege_type = 'UPDATE') then
    grant update (lang) on public.profiles to authenticated;
  end if;
end $$;
create table if not exists public.mail_settings (key text primary key, value text not null, updated_at timestamptz not null default now());
insert into public.mail_settings (key, value) values ('one_lang', 'true') on conflict (key) do nothing;

-- 邀請人按「邀請」那一刻的介面語言，跟著那組碼走；重寄時由重寄的人再帶一次。mail_outbox.lang 是那一封信的提示，收信的人自己有帳號有 lang 的話優先。
alter table public.invite_codes add column if not exists lang text check (lang in ('zh', 'en'));
alter table public.mail_outbox  add column if not exists lang text check (lang in ('zh', 'en'));
revoke all on public.mail_settings from anon, authenticated;
grant select on public.mail_settings to authenticated;
alter table public.mail_settings enable row level security;
drop policy if exists mail_settings_read on public.mail_settings;
create policy mail_settings_read on public.mail_settings for select to authenticated using (public.is_cadre());

-- ---------- 3. 包版型 ----------
create or replace function public.html_escape(p text)
returns text language sql immutable
as $$ select replace(replace(replace(replace(replace(coalesce(p, ''), '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;'), '''', '&#39;') $$;

-- 每一種信的預設：按鈕的字（中／英）、照片（網站上本來就有的，絕對網址，不當附件）。
create or replace function public.mail_defaults(p_kind text, p_lang text)
returns table (button_label text, hero text)
language sql immutable
as $$
  select case p_kind
      when 'invite' then case when p_lang = 'en' then 'Accept invitation' else '接受邀請' end
      when 'meeting_invite' then case when p_lang = 'en' then 'Reply' else '回覆出席' end
      when 'meeting_reminder' then case when p_lang = 'en' then 'Reply' else '回覆出席' end
      when 'request_new' then case when p_lang = 'en' then 'Open request' else '打開需求單' end
      when 'request_done' then case when p_lang = 'en' then 'Open request' else '看回覆' end
      when 'interview' then case when p_lang = 'en' then 'Pick a time' else '挑一個時段' end
      else case when p_lang = 'en' then 'Open Beyond Taiwan' else '打開 Beyond Taiwan' end end,
    'https://beyondtaiwannpo.com/photos/' || case p_kind
      when 'invite' then 'group-photo.jpg'
      when 'meeting_invite' then 'talking-laptop.jpg'
      when 'meeting_reminder' then 'talking-laptop.jpg'
      when 'request_new' then 'sharing-mic.jpg'
      when 'request_done' then 'sharing-mic.jpg'
      when 'guardian' then 'hero-listening.jpg'
      when 'accepted' then 'three-at-laptop.jpg'
      else 'hero-listening.jpg' end
$$;

-- 按鈕連到哪：從 outbox 那一列推（排信的函式不用改）。推不出來就回空字串，版型就不畫按鈕。
create or replace function public.mail_button_url(r public.mail_outbox)
returns text language sql stable
set search_path = public, pg_temp
as $$
  select case
    when r.kind = 'invite' and r.invite_code is not null then 'https://beyondtaiwannpo.com/app/?invite=' || r.invite_code
    when r.kind in ('meeting_invite', 'meeting_reminder') and r.meeting_id is not null then 'https://beyondtaiwannpo.com/availability/?meeting=' || r.meeting_id::text
    when r.kind = 'request_new' and r.request_id is not null then 'https://beyondtaiwannpo.com/admin/#requests/' || r.request_id::text
    when r.kind = 'request_done' and r.request_id is not null then 'https://beyondtaiwannpo.com/admin/#request/' || r.request_id::text
    when r.kind = 'interview' and r.form_id is not null then coalesce((select f.interview_url from forms f where f.id = r.form_id), 'https://beyondtaiwannpo.com/apply/')
    when r.kind in ('accepted', 'rejected', 'notice', 'guardian') then 'https://beyondtaiwannpo.com/apply/'
    else '' end
$$;

-- 收信的人的語言：profiles.lang；沒有帳號就用那一封信帶的提示（邀請信是邀請人的介面語言）；都沒有就中文。
-- one_lang 關掉就回 both（兩種疊在一起，跟以前一樣）。
create or replace function public.mail_lang_for(p_email text, p_hint text default null)
returns text language sql stable
set search_path = public, auth, pg_temp
as $$
  select case
    when coalesce((select value from mail_settings where key = 'one_lang'), 'true') <> 'true' then 'both'
    else coalesce((select p.lang from auth.users u join profiles p on p.id = u.id where lower(u.email) = lower(p_email) limit 1),
                  case when p_hint in ('zh', 'en') then p_hint end, 'zh') end
$$;

-- 邀請：多一個 p_lang（邀請人當下的介面語言）。原本十一個參數的版本留著，這一支包它，再把語言記到碼與那一封信上。
create or replace function public.invite_person(
  p_email text, p_grants text, p_rank text,
  p_name_zh text, p_name_en text, p_title_en text, p_title_zh text, p_team text, p_term text,
  p_line text, p_note text, p_lang text)
returns text language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_code text; v_lang text := case when p_lang in ('zh', 'en') then p_lang else 'zh' end;
begin
  v_code := public.invite_person(p_email, p_grants, p_rank, p_name_zh, p_name_en, p_title_en, p_title_zh, p_team, p_term, p_line, p_note);
  update invite_codes set lang = v_lang where code = v_code;
  update mail_outbox set lang = v_lang where invite_code = v_code and sent_at is null;
  return v_code;
end $$;
revoke all on function public.invite_person(text, text, text, text, text, text, text, text, text, text, text, text) from public, anon;
grant execute on function public.invite_person(text, text, text, text, text, text, text, text, text, text, text, text) to authenticated;

create or replace function public.resend_invite(p_code text, p_lang text)
returns text language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_code text; v_lang text := case when p_lang in ('zh', 'en') then p_lang else 'zh' end;
begin
  v_code := public.resend_invite(p_code);
  update invite_codes set lang = v_lang where code = v_code;
  update mail_outbox set lang = v_lang where invite_code = v_code and sent_at is null;
  return v_code;
end $$;
revoke all on function public.resend_invite(text, text) from public, anon;
grant execute on function public.resend_invite(text, text) to authenticated;

-- 純文字 → HTML。段落用空行分；一行裡只有按鈕那個網址的話不印（按鈕就是它）。所有字先跳脫。
create or replace function public.mail_html(p_kind text, p_subject text, p_body text, p_button_label text, p_button_url text, p_lang text)
returns text language plpgsql immutable
as $$
declare
  v_paras text := ''; v_p text; v_hero text; v_label text; v_tail text; v_lang text := case when p_lang = 'en' then 'en' else 'zh' end;
  v_contact text;
begin
  select d.hero, coalesce(nullif(btrim(p_button_label), ''), d.button_label) into v_hero, v_label from public.mail_defaults(p_kind, v_lang) d;
  foreach v_p in array regexp_split_to_array(coalesce(p_body, ''), E'\n\\s*\n') loop
    v_p := btrim(v_p, E' \r\n');
    if v_p = '' then continue; end if;
    if p_button_url <> '' and v_p = p_button_url then continue; end if;
    v_paras := v_paras || '<p style="margin:0 0 14px;font-family:Helvetica,Arial,sans-serif;font-size:16px;line-height:1.7;color:#102A86;">'
            || replace(public.html_escape(v_p), E'\n', '<br>') || '</p>';
  end loop;
  v_contact := case when p_kind = 'guardian'
    then case when v_lang = 'en' then 'This email is for your information; no reply or signature is needed. Questions: beyondtaiwan2020@gmail.com' else '這封信是告知，不需要回覆或簽名。有任何問題請寄到 beyondtaiwan2020@gmail.com。' end
    else case when v_lang = 'en' then 'Please do not reply to this email; nobody reads this mailbox. Questions: beyondtaiwan2020@gmail.com' else '不要回覆這封信，這個信箱沒有人看。有問題請寄到 beyondtaiwan2020@gmail.com。' end end;
  return '<!doctype html><html lang="' || case when v_lang = 'en' then 'en' else 'zh-Hant' end || '"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
    || '<title>' || public.html_escape(p_subject) || '</title>'
    || '<style>@media only screen and (max-width:620px){.bt-wrap{width:100%!important}.bt-pad{padding:20px!important}.bt-btn{display:block!important;width:100%!important;box-sizing:border-box!important}}</style>'
    || '</head><body style="margin:0;padding:0;background:#EDE5D8;">'
    || '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#EDE5D8;"><tr><td align="center" style="padding:24px 12px;">'
    || '<table role="presentation" class="bt-wrap" width="600" cellspacing="0" cellpadding="0" border="0" style="width:600px;max-width:600px;background:#FFFFFF;border-radius:16px;overflow:hidden;">'
    || '<tr><td align="left" style="padding:24px 32px 8px;"><img src="https://beyondtaiwannpo.com/shared/logo.png" width="140" alt="Beyond Taiwan" style="display:block;width:140px;height:auto;border:0;"></td></tr>'
    || '<tr><td style="padding:0;"><img src="' || v_hero || '" width="600" alt="" style="display:block;width:100%;height:auto;border:0;"></td></tr>'
    || '<tr><td class="bt-pad" style="padding:28px 32px 8px;"><h1 style="margin:0 0 16px;font-family:''Barlow Condensed'',''Arial Narrow'',Arial,sans-serif;font-size:30px;line-height:1.15;font-weight:700;color:#102A86;">' || public.html_escape(p_subject) || '</h1>'
    || v_paras || '</td></tr>'
    || case when p_button_url <> '' then
         '<tr><td class="bt-pad" align="left" style="padding:8px 32px 28px;"><a class="bt-btn" href="' || public.html_escape(p_button_url) || '" style="display:inline-block;background:#FFC46C;color:#102A86;text-decoration:none;font-family:Helvetica,Arial,sans-serif;font-size:17px;font-weight:700;line-height:48px;height:48px;padding:0 32px;border-radius:999px;">' || public.html_escape(v_label) || '</a>'
         || '<p style="margin:12px 0 0;font-family:Helvetica,Arial,sans-serif;font-size:12px;line-height:1.5;color:#6B6B6B;word-break:break-all;">' || public.html_escape(p_button_url) || '</p></td></tr>'
       else '' end
    || '<tr><td class="bt-pad" style="padding:20px 32px 28px;border-top:1px solid #C6C6C6;font-family:Helvetica,Arial,sans-serif;font-size:12px;line-height:1.6;color:#6B6B6B;">'
    || v_contact || '<br>Beyond Taiwan · beyondtaiwannpo.com</td></tr>'
    || '</table></td></tr></table></body></html>';
end $$;

-- outbox 那一列要寄什麼：lang、主旨、純文字、html。英文版：模板有 subject_en / body_en 就重新代換一次（把這一列的值從中文版裡對出來做不到，
-- 所以英文版的「代換」靠原本的函式再跑一次）。這一版先做得老實：one_lang 開著而且收信的人是 en、而且那種信有英文版的時候，
-- 用 body_en 當內文但**不做代換符號**的換，只有邀請與會議、需求單那幾支函式排信時已經把值代進中文版；
-- 所以英文版的做法是：排信的函式照舊代換整段雙語；這裡從已經代換好的 body 裡把英文那一段切出來（跟拆模板同一個記號）。
create or replace function public.mail_pick_lang_part(p_body text, p_lang text)
returns text language plpgsql immutable
as $$
declare v_pos int; v_marker text;
begin
  -- 新模板合併時放了 [[en]] 這一行，切這個最準；舊的信（沒有那一行）退回用 Hi / Dear 那一行。
  if p_lang = 'both' then return replace(p_body, E'\n\n[[en]]\n', E'\n\n'); end if;
  v_pos := position(E'\n\n[[en]]\n' in p_body);
  if v_pos > 0 then
    return case when p_lang = 'en' then btrim(substring(p_body from v_pos + 8)) else rtrim(substring(p_body from 1 for v_pos - 1)) end;
  end if;
  foreach v_marker in array array[E'\nHi ', E'\nDear '] loop
    v_pos := position(v_marker in p_body);
    if v_pos > 0 then
      return case when p_lang = 'en' then btrim(substring(p_body from v_pos)) else rtrim(substring(p_body from 1 for v_pos - 1)) end;
    end if;
  end loop;
  return p_body;
end $$;
create or replace function public.mail_pick_lang_subject(p_subject text, p_lang text)
returns text language sql immutable
as $$ select case when p_lang = 'both' or position('　' in p_subject) = 0 then p_subject when p_lang = 'en' then btrim(split_part(p_subject, '　', 2)) else btrim(split_part(p_subject, '　', 1)) end $$;

create or replace function public.mail_render(p_id uuid)
returns table (lang text, subject text, text_body text, html text)
language plpgsql stable security definer
set search_path = public, auth, pg_temp
as $$
declare r public.mail_outbox%rowtype; v_lang text; v_sub text; v_body text; v_label text; v_url text; v_tail_pos int;
begin
  if not public.is_cadre() then raise exception 'not_cadre' using errcode = 'P0001'; end if;
  select * into r from mail_outbox where id = p_id;
  if r.id is null then raise exception 'no_such_mail' using errcode = 'P0001'; end if;
  v_lang := public.mail_lang_for(r.to_email, r.lang);
  v_sub := public.mail_pick_lang_subject(r.subject, v_lang);
  -- 信尾那句（mail_tail）在純文字裡是最後一段，HTML 自己有 footer，切掉它再切語言。
  v_body := r.body;
  v_tail_pos := greatest(position(E'\n\n不要回覆這封信' in v_body), position(E'\n\n這封信是告知' in v_body));
  if v_tail_pos > 0 then v_body := substring(v_body from 1 for v_tail_pos - 1); end if;
  v_body := public.mail_pick_lang_part(v_body, v_lang);
  select case when v_lang = 'en' then t.button_label_en else t.button_label end into v_label from mail_templates t where t.kind = r.kind;
  v_url := public.mail_button_url(r);
  return query select v_lang, v_sub, r.body, public.mail_html(r.kind, v_sub, v_body, v_label, v_url, case when v_lang = 'en' then 'en' else 'zh' end);
end $$;
revoke all on function public.mail_render(uuid) from public, anon;
grant execute on function public.mail_render(uuid) to authenticated;

-- ---------- 4. 寄：html 加 text ----------
create or replace function public.send_pending_mail(p_limit int default 40)
returns table (sent int, failed int) language plpgsql security definer
set search_path = public, extensions, net, vault, auth, pg_temp
as $$
declare
  r record; v_key text; v_from text; v_sent int := 0; v_failed int := 0; v_req bigint; v_have text; v_body jsonb;
  v_lang text; v_sub text; v_txt text; v_label text; v_url text; v_html text; v_tail_pos int;
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
      v_lang := public.mail_lang_for(r.to_email, r.lang);
      v_sub := public.mail_pick_lang_subject(r.subject, v_lang);
      v_txt := r.body;
      v_tail_pos := greatest(position(E'\n\n不要回覆這封信' in v_txt), position(E'\n\n這封信是告知' in v_txt));
      v_txt := case when v_tail_pos > 0 then public.mail_pick_lang_part(substring(v_txt from 1 for v_tail_pos - 1), v_lang) || substring(r.body from v_tail_pos) else public.mail_pick_lang_part(v_txt, v_lang) end;
      select case when v_lang = 'en' then t.button_label_en else t.button_label end into v_label from mail_templates t where t.kind = r.kind;
      v_url := public.mail_button_url(r);
      v_html := public.mail_html(r.kind, v_sub, case when v_tail_pos > 0 then public.mail_pick_lang_part(substring(r.body from 1 for v_tail_pos - 1), v_lang) else public.mail_pick_lang_part(r.body, v_lang) end, v_label, v_url, case when v_lang = 'en' then 'en' else 'zh' end);
      v_body := jsonb_build_object('from', v_from, 'to', jsonb_build_array(r.to_email), 'subject', v_sub, 'text', v_txt, 'html', v_html);
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

-- ---------- 5. 後台改文案：七個參數的版本 ----------
create or replace function public.set_mail_template(p_kind text, p_subject text, p_body text, p_subject_en text, p_body_en text, p_button_label text, p_button_label_en text)
returns text language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  perform public.require_senior();
  if coalesce(btrim(p_subject), '') = '' or coalesce(btrim(p_body), '') = '' then raise exception 'empty_mail' using errcode = 'P0001'; end if;
  update public.mail_templates
     set subject_zh = p_subject, body_zh = p_body, subject_en = nullif(btrim(coalesce(p_subject_en, '')), ''), body_en = nullif(btrim(coalesce(p_body_en, '')), ''),
         button_label = nullif(btrim(coalesce(p_button_label, '')), ''), button_label_en = nullif(btrim(coalesce(p_button_label_en, '')), ''), updated_by = auth.uid()
   where kind = p_kind;
  if not found then raise exception 'no_such_template' using errcode = 'P0001'; end if;
  return p_kind;
end $$;
revoke all on function public.set_mail_template(text, text, text, text, text, text, text) from public, anon;
grant execute on function public.set_mail_template(text, text, text, text, text, text, text) to authenticated;

commit;

select * from (
  with t as (
    select (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'mail_templates' and column_name in ('subject_zh', 'body_zh', 'subject_en', 'body_en', 'button_label', 'button_label_en')) as cols,
           (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'mail_templates' and column_name in ('subject', 'body') and is_generated = 'ALWAYS') as gen_cols,
           (select count(*) from pg_proc where proname in ('mail_html', 'mail_button_url', 'mail_lang_for', 'mail_render', 'mail_defaults', 'html_escape', 'mail_pick_lang_part', 'mail_pick_lang_subject')) as fns,
           (select regexp_replace(prosrc, '--[^\n]*', '', 'g') like '%''html'', v_html%' from pg_proc where proname = 'send_pending_mail') as sends_html,
           (select count(*) from mail_templates where body_en is not null) as split_en,
           (select value from mail_settings where key = 'one_lang') as one_lang,
           (select count(*) from information_schema.columns where table_schema = 'public' and column_name = 'lang' and table_name in ('invite_codes', 'mail_outbox', 'profiles')) as lang_cols,
           (select count(*) from pg_proc where (proname = 'invite_person' and pronargs = 12) or (proname = 'resend_invite' and pronargs = 2)) as invite_fns,
           (select public.mail_html('invite', 'T', 'a <b>x</b>', null, 'https://x/y', 'zh') like '%&lt;b&gt;%') as escapes,
           length(public.mail_html('invite', 'T', repeat('段落。', 200), null, 'https://x/y', 'zh')) as size
  )
  select 0 ord, 'OVERALL' as 項目, null::text as 應該是, null::text as 實際是, case when cols = 6 and gen_cols = 2 and fns = 8 and sends_html and escapes and lang_cols = 3 and invite_fns = 2 then 'PASS' else 'FAIL' end as 結果 from t
  union all select 1, '★ 模板中英各一欄加按鈕的字（六欄）', '6', cols::text, case when cols = 6 then 'PASS' else 'FAIL' end from t
  union all select 11, '★ subject 與 body 變成自動合併欄（排信函式不用改）', '2', gen_cols::text, case when gen_cols = 2 then 'PASS' else 'FAIL' end from t
  union all select 2, '★ 八支函式在', '8', fns::text, case when fns = 8 then 'PASS' else 'FAIL' end from t
  union all select 3, '★ send_pending_mail 送 html 加 text', 'true', sends_html::text, case when sends_html then 'PASS' else 'FAIL' end from t
  union all select 4, '★ 使用者的字有跳脫', 'true', escapes::text, case when escapes then 'PASS' else 'FAIL' end from t
  union all select 45, '★ 三張表各多一欄 lang（profiles、invite_codes、mail_outbox）', '3', lang_cols::text, case when lang_cols = 3 then 'PASS' else 'FAIL' end from t
  union all select 46, '★ 邀請與重寄多了帶語言的版本', '2', invite_fns::text, case when invite_fns = 2 then 'PASS' else 'FAIL' end from t
  union all select 5, '資訊：自動拆出英文版的模板數（其餘英文收件人會看到中文版）', '（看一眼）', split_en::text, 'PASS' from t
  union all select 6, '資訊：one_lang 開關（true 一封一種語言；false 兩種疊）', 'true', one_lang, 'PASS' from t
  union all select 7, '資訊：一封很長的信包起來幾個字（Gmail 超過 102KB 會剪）', '< 100000', size::text, case when size < 100000 then 'PASS' else 'FAIL' end from t
) x order by ord;
