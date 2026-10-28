-- 2026-11-11：修好寄信（Paul 2026-10-28 回報「排會並寄邀請按了沒反應」）。
--
-- 症狀：會議存進去了，但每一封信都卡在 outbox，error 欄寫「cannot cast type record to mail_outbox」。
-- 原因：2026-11-05-email-layout.sql 重建 send_pending_mail() 時，迴圈變數 r 宣告成 record，
--       再交給 mail_button_url(r public.mail_outbox)。PostgreSQL 不肯把泛用的 record 轉成那張表的型別，
--       所以 11-05 之後經過這支函式的每一封信都會失敗（邀請、需求單、會議，全部）。
--       smoke 沒抓到，是因為它只在 11-05 之前叫過一次 send_pending_mail。
-- 修法：r 改宣告成 public.mail_outbox%rowtype，其他一個字都沒改。
--       然後把被這個錯誤卡住的信的 tries 歸零，下一次寄信（排會、後台開頁、每 15 分鐘的排程）就會寄出去。
--
-- 接在 2026-11-10-hide-months.sql 後面跑，可以重跑。最後印 PASS 表。

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

-- 卡住的信重來（tries 歸零、error 清掉）。只動被這個錯誤卡住、還沒寄出的。
update public.mail_outbox set tries = 0, error = null
 where sent_at is null and error like '%cannot cast type record to mail_outbox%';

-- ---------- 驗收 ----------
with t as (
  select (select regexp_replace(prosrc, '--[^\n]*', '', 'g') from pg_proc where proname = 'send_pending_mail' and pronamespace = 'public'::regnamespace) as src,
         (select count(*) from public.mail_outbox where sent_at is null and error like '%cannot cast type record%') as stuck
), rows as (
  select 1 as n, '★ send_pending_mail 的 r 是 mail_outbox 的型別' as check_name, 'true' as expected,
         (src like '%r public.mail_outbox\%rowtype%')::text as got,
         case when src like '%r public.mail_outbox\%rowtype%' then 'PASS' else 'FAIL' end as result from t
  union all select 2, '還帶 html 與 ics 附件', 'true / true',
         (src like '%''html'', v_html%')::text || ' / ' || (src like '%attachments%')::text,
         case when src like '%''html'', v_html%' and src like '%attachments%' then 'PASS' else 'FAIL' end from t
  union all select 3, '沒有信還卡在這個錯誤', '0', stuck::text, case when stuck = 0 then 'PASS' else 'FAIL' end from t
  union all select 4, 'anon 叫不到 send_pending_mail', 'false',
         has_function_privilege('anon', 'public.send_pending_mail(int)', 'execute')::text,
         case when not has_function_privilege('anon', 'public.send_pending_mail(int)', 'execute') then 'PASS' else 'FAIL' end
)
select * from rows
union all select 99, 'OVERALL', 'PASS', '', case when bool_and(result = 'PASS') then 'PASS' else 'FAIL' end from rows
order by 1;
