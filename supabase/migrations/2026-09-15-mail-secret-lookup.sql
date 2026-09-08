-- 修：Vault 的 secret 名字差一點點，錯誤訊息卻看不出是哪裡差。　2026-09-08
--
-- 用法：整份貼進 Supabase SQL Editor 按一次 Run。
--
-- ============================================================================
-- 發生了什麼
-- ============================================================================
-- Paul 照步驟在 Vault 加了兩個 secret，但名字打成 `Resend API`，
-- 而 send_pending_mail() 找的是 `RESEND_API_KEY`。對不上，於是它說
-- 「信件還沒設定好」—— 而那句話**看起來像他什麼都沒做**。
--
-- 他做了。差的只是一個名字，而錯誤訊息沒有給他任何線索去發現這件事。
--
-- ============================================================================
-- 兩個修法，都做
-- ============================================================================
-- 1. **找的時候寬鬆一點。** 名字先正規化（去掉非英數字、轉大寫）再比對，
--    所以 `Resend API key` / `resend-api-key` / `RESEND_API_KEY` 都對得上。
--    **不用 like '%resend%' 那種模糊比對** —— 那會在 Vault 裡有第二個
--    含 resend 的 secret 時挑錯一個，而挑錯的後果是拿一把錯的金鑰去寄信。
--    正規化之後比對一組**明確列出來的**寫法，寬鬆但不含糊。
--
-- 2. **錯誤訊息要說出它看到什麼。**
--    「找不到 RESEND_API_KEY。Vault 裡現在有：Resend API、BT_MAIL_FROM」
--    比「信件還沒設定好」有用一百倍 —— 前者一眼就看得出差在哪。
--    **只印名字，不印值。**
--
--    這是這個 repo 一路上的同一課的另一面：失敗要說話，而且要說**實話**，
--    不是說一句聽起來像那麼回事的話。

begin;

-- 名字正規化：去掉所有非英數字，轉大寫。`Resend API key` → `RESENDAPIKEY`。
create or replace function public.norm_secret_name(p text)
returns text language sql immutable
as $$ select upper(regexp_replace(coalesce(p, ''), '[^a-zA-Z0-9]+', '', 'g')) $$;

create or replace function public.send_pending_mail(p_limit int default 40)
returns table (sent int, failed int) language plpgsql security definer
set search_path = public, extensions, net, vault, pg_temp
as $$
declare
  r record;
  v_key text;
  v_from text;
  v_sent int := 0;
  v_failed int := 0;
  v_req bigint;
  v_have text;
begin
  if not public.is_cadre() then raise exception 'not_cadre' using errcode = 'P0001'; end if;

  -- 這幾種寫法都算數。列出來而不是用模糊比對，理由見檔頭。
  select decrypted_secret into v_key from vault.decrypted_secrets
   where public.norm_secret_name(name) in ('RESENDAPIKEY', 'RESENDAPI', 'RESENDKEY', 'RESEND')
   limit 1;
  select decrypted_secret into v_from from vault.decrypted_secrets
   where public.norm_secret_name(name) in ('BTMAILFROM', 'MAILFROM', 'BTFROM', 'FROM')
   limit 1;

  if v_key is null or v_from is null then
    -- **說出它看到什麼。** 只印名字，不印值。
    select coalesce(string_agg(name, '、' order by name), '（一個都沒有）')
      into v_have from vault.decrypted_secrets;
    raise exception 'mail_not_configured：缺 %。Vault 裡現在有：%',
      case when v_key is null and v_from is null then 'RESEND_API_KEY 與 BT_MAIL_FROM'
           when v_key is null then 'RESEND_API_KEY'
           else 'BT_MAIL_FROM' end,
      v_have
      using errcode = 'P0001',
      hint = '到 Supabase 的 Vault 把名字改成 RESEND_API_KEY 與 BT_MAIL_FROM（大小寫與底線要一樣）。';
  end if;

  for r in
    select * from public.mail_outbox
     where sent_at is null and tries < 5
     order by created_at
     limit greatest(1, least(coalesce(p_limit, 40), 200))
  loop
    begin
      select net.http_post(
        url := 'https://api.resend.com/emails',
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || v_key,
          'Content-Type', 'application/json'),
        body := jsonb_build_object(
          'from', v_from,
          'to', jsonb_build_array(r.to_email),
          'subject', r.subject,
          'text', r.body)
      ) into v_req;
      -- pg_net 是非同步的：這裡拿到的是請求 id，不是結果。
      -- **「寄出去了」在這裡的意思是「送進佇列了」**，不是「對方收到了」。
      update public.mail_outbox
         set sent_at = now(), tries = tries + 1, error = null
       where id = r.id;
      v_sent := v_sent + 1;
    exception when others then
      update public.mail_outbox
         set tries = tries + 1, error = left(SQLERRM, 500)
       where id = r.id;
      v_failed := v_failed + 1;
    end;
  end loop;
  return query select v_sent, v_failed;
end $$;

revoke all on function public.send_pending_mail(int) from public, anon;
grant execute on function public.send_pending_mail(int) to authenticated;

commit;
