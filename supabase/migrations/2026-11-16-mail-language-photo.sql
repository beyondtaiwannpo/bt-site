-- 信：每一封自己選語言、照片預設只有 logo、刪掉的會不再寄信。　2026-11-16
--
-- 用法：整份貼進 Supabase SQL Editor 按一次 Run。最後印出 PASS / FAIL 表。
-- **先跑 2026-11-15-box-time-and-example.sql**（順序照日期）。
--
-- ============================================================================
-- 這一支在做什麼
-- ============================================================================
-- Paul 2026-10-28 三件事：
--   1. 「我要能選這一封只寄一種語言」：mail_templates 多 lang_mode（auto 照收信的人、zh 只中文、en 只英文、both 兩種疊）。
--      預設 auto，跟現在一樣。寄信與預覽改問 mail_lang_pick(那一封, 收信的人)：那一封選了就照它，auto 才照收信的人。
--   2. 「信上的照片預設只要 logo，以後我可以自己放一張」：mail_templates 多 hero_url，**預設空的，空的就不印照片**。
--      後台那一封信傳一張就印那一張。照片放在 Storage bucket mail-photos（公開讀、5 MB、只收圖），上傳與刪除只給 senior。
--   3. 「點信裡的連結說找不到這場會」：那場會被刪了，但提醒信還在 outbox 裡照寄。delete_meeting 重建，
--      刪會的時候把那場會還沒寄出去的信一起拿掉。
--
-- 重建的函式：mail_html（照片那一段）、mail_render 與 send_pending_mail（語言那一行，其他一字未改，2026-11-11 那一版）、delete_meeting。
-- 新的函式：mail_lang_pick、set_mail_options（後台用，門是 require_senior()，跟改信的文字同一道）。

begin;

alter table public.mail_templates add column if not exists lang_mode text not null default 'auto';
alter table public.mail_templates add column if not exists hero_url text;
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.mail_templates'::regclass and conname = 'mail_templates_lang_mode_check') then
    alter table public.mail_templates add constraint mail_templates_lang_mode_check check (lang_mode in ('auto', 'zh', 'en', 'both'));
  end if;
end $$;

-- 這一封信寄哪一種語言：那一封選了 zh / en / both 就照它，auto 照收信的人（mail_lang_for，2026-11-05）。
create or replace function public.mail_lang_pick(p_kind text, p_email text, p_hint text default null)
returns text language sql stable
set search_path = public, pg_temp
as $$
  select case
    when (select lang_mode from mail_templates where kind = p_kind) in ('zh', 'en', 'both') then (select lang_mode from mail_templates where kind = p_kind)
    else public.mail_lang_for(p_email, p_hint) end
$$;

create or replace function public.set_mail_options(p_kind text, p_lang_mode text, p_hero_url text)
returns text language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_url text := nullif(btrim(coalesce(p_hero_url, '')), '');
begin
  perform public.require_senior();
  if coalesce(p_lang_mode, '') not in ('auto', 'zh', 'en', 'both') then
    raise exception 'bad_lang_mode' using errcode = 'P0001';
  end if;
  if v_url is not null and v_url !~ '^https://[a-z0-9]+\.supabase\.co/storage/v1/object/public/mail-photos/[A-Za-z0-9/_.-]+$' then
    raise exception 'bad_photo_url' using errcode = 'P0001';
  end if;
  update mail_templates set lang_mode = p_lang_mode, hero_url = v_url where kind = p_kind;
  if not found then raise exception 'no_such_template' using errcode = 'P0001'; end if;
  return p_kind;
end $$;
revoke all on function public.set_mail_options(text, text, text) from public, anon;
grant execute on function public.set_mail_options(text, text, text) to authenticated;

create or replace function public.mail_html(p_kind text, p_subject text, p_body text, p_button_label text, p_button_url text, p_lang text)
returns text language plpgsql stable
set search_path = public, pg_temp
as $$
declare
  v_paras text := ''; v_p text; v_hero text; v_label text; v_tail text; v_lang text := case when p_lang = 'en' then 'en' else 'zh' end;
  v_contact text;
begin
  select coalesce(nullif(btrim(p_button_label), ''), d.button_label) into v_label from public.mail_defaults(p_kind, v_lang) d;
  -- 2026-11-16：照片預設沒有（只有 logo），後台那一封信放了照片才印。
  select nullif(btrim(t.hero_url), '') into v_hero from public.mail_templates t where t.kind = p_kind;
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
    || case when v_hero is not null then '<tr><td style="padding:0;"><img src="' || public.html_escape(v_hero) || '" width="600" alt="" style="display:block;width:100%;height:auto;border:0;"></td></tr>' else '' end
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
  v_lang := public.mail_lang_pick(r.kind, r.to_email, r.lang);
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

create or replace function public.send_pending_mail(p_limit int default 40)
returns table (sent int, failed int) language plpgsql security definer
set search_path = public, extensions, net, vault, auth, pg_temp
as $$
declare
  r public.mail_outbox%rowtype; v_key text; v_from text; v_sent int := 0; v_failed int := 0; v_req bigint; v_have text; v_body jsonb;
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
      v_lang := public.mail_lang_pick(r.kind, r.to_email, r.lang);
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

create or replace function public.delete_meeting(p_id uuid)
returns text language plpgsql security definer
set search_path = public, pg_temp
as $$
declare m record;
begin
  select * into m from meetings where id = p_id;
  if m.id is null then raise exception 'no_such_meeting' using errcode = 'P0001'; end if;
  if not public.can_schedule(m.scope) then raise exception 'not_allowed' using errcode = 'P0001'; end if;
  -- 2026-11-16：還沒寄出去的邀請與提醒一起拿掉，不然收到信的人點連結會看到「找不到這場會」。
  delete from mail_outbox where meeting_id = p_id and sent_at is null;
  delete from meetings where id = p_id;
  return 'deleted';
end $$;
revoke all on function public.delete_meeting(uuid) from public, anon;
grant execute on function public.delete_meeting(uuid) to authenticated;

commit;

-- bucket mail-photos。本機 Postgres 沒有 storage schema 就整段跳過（驗收表那一列印 SKIP）。
do $$
begin
  if to_regclass('storage.buckets') is null or to_regclass('storage.objects') is null then
    raise notice 'storage schema 不在（本機 smoke），略過 bucket 與政策';
    return;
  end if;
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('mail-photos', 'mail-photos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
  on conflict (id) do update set public = true, file_size_limit = 5242880, allowed_mime_types = excluded.allowed_mime_types;
  execute 'drop policy if exists mph_read on storage.objects';
  execute 'create policy mph_read on storage.objects for select to public using (bucket_id = ''mail-photos'')';
  execute 'drop policy if exists mph_insert on storage.objects';
  execute 'create policy mph_insert on storage.objects for insert to authenticated with check (bucket_id = ''mail-photos'' and public.is_senior())';
  execute 'drop policy if exists mph_update on storage.objects';
  execute 'create policy mph_update on storage.objects for update to authenticated using (bucket_id = ''mail-photos'' and public.is_senior())';
  execute 'drop policy if exists mph_delete on storage.objects';
  execute 'create policy mph_delete on storage.objects for delete to authenticated using (bucket_id = ''mail-photos'' and public.is_senior())';
end $$;

-- ---------- 驗收 ----------
with src as (
  select proname, regexp_replace(prosrc, '--[^\n]*', '', 'g') as body from pg_proc
   where pronamespace = 'public'::regnamespace and proname in ('mail_html', 'mail_render', 'send_pending_mail', 'delete_meeting', 'set_mail_options', 'mail_lang_pick')
), g as (
  select
    (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'mail_templates' and column_name in ('lang_mode', 'hero_url')) as cols,
    (select count(*) from public.mail_templates where hero_url is not null) as heroes,
    (select body from src where proname = 'mail_html') like '%when v_hero is not null%' as html_ok,
    (select count(*) from src where proname in ('mail_render', 'send_pending_mail') and body like '%mail_lang_pick(r.kind%') as lang_n,
    (select body from src where proname = 'send_pending_mail') like '%r public.mail_outbox\%rowtype%' as send_row,
    (select body from src where proname = 'delete_meeting') like '%delete from mail_outbox where meeting_id = p_id and sent_at is null%' as del_ok,
    (select body from src where proname = 'set_mail_options') like '%perform public.require_senior()%' as gate,
    (select count(*) from pg_proc p, aclexplode(p.proacl) x where p.proname = 'set_mail_options' and x.grantee in (0::regrole, 'anon'::regrole) and x.privilege_type = 'EXECUTE') as anon_n,
    case when to_regclass('storage.buckets') is null then null else (select count(*) from storage.buckets where id = 'mail-photos' and public) = 1 end as bucket_ok
), rows as (
  select 1 as n, '信多 lang_mode 與 hero_url 兩欄' as check_name, '2' as expected, cols::text as got, case when cols = 2 then 'PASS' else 'FAIL' end as result from g
  union all select 2, '照片預設沒有：hero 空的就不印那一列', 'true', html_ok::text, case when html_ok then 'PASS' else 'FAIL' end from g
  union all select 3, '寄信與預覽都照那一封選的語言', '2', lang_n::text, case when lang_n = 2 then 'PASS' else 'FAIL' end from g
  union all select 4, '★ send_pending_mail 還是 2026-11-11 修好的那一版（r 是 mail_outbox 型別）', 'true', send_row::text, case when send_row then 'PASS' else 'FAIL' end from g
  union all select 5, '★ 刪會的時候連還沒寄的信一起拿掉', 'true', del_ok::text, case when del_ok then 'PASS' else 'FAIL' end from g
  union all select 6, '★ 改選項的門是 senior、沒登入叫不動', 'true / 0', gate::text || ' / ' || anon_n::text, case when gate and anon_n = 0 then 'PASS' else 'FAIL' end from g
  union all select 7, 'Storage bucket mail-photos（公開讀）', 'true', coalesce(bucket_ok::text, '沒有 storage schema'), case when bucket_ok is null then 'SKIP' when bucket_ok then 'PASS' else 'FAIL' end from g
  -- 只是告訴你現在幾封信有放照片，不算 PASS / FAIL：第一次跑完應該是 0（全部只有 logo）。
  union all select 8, '放了照片的信（第一次跑完應該是 0）', '0', heroes::text, '看一眼' from g
)
select * from rows
union all select 99, 'OVERALL', 'PASS', '', case when bool_and(result in ('PASS', 'SKIP', '看一眼')) then 'PASS' else 'FAIL' end from rows
order by 1;
