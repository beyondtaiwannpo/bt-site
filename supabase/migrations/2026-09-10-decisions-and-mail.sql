-- 批 4：審核與寄信。　2026-09-08
--
-- 用法：整份貼進 Supabase SQL Editor 按一次 Run。包在一個 transaction 裡。
-- **先跑 2026-09-08-students.sql 與 2026-09-09-applications.sql。**
--
-- ⚠⚠ 這一支跑完之後**還要做兩件手動設定**，不做的話信寄不出去
--    （而且會安靜地寄不出去，只是 outbox 一直累積）。步驟寫在這份檔案的最後面。
--
-- ============================================================================
-- 這一支在做什麼
-- ============================================================================
--   1. mail_outbox：**每一封要寄的信先落地成一列**，寄成功才蓋 sent_at
--   2. decide_application()：改狀態、記下是誰改的、產生對應的那封信
--   3. send_pending_mail()：把還沒寄的信送到 Resend
--
-- ============================================================================
-- 為什麼要 outbox，不直接在按下按鈕的時候寄
-- ============================================================================
-- 因為**寄信會失敗，而失敗必須看得見**。
--
-- 直接寄的話，網路斷一秒、Resend 回一個 429，那封「恭喜錄取」就永遠不存在了，
-- 而後台上那個人的狀態明明是「已錄取」。沒有人會發現，直到那個高中生
-- 三個星期後寫信來問「我是不是沒上」。
--
-- 落地成一列之後：狀態改成功了就是改成功了（那是資料庫的事），
-- 信寄不出去是另一件事，而且後台看得到「還有 N 封沒寄出去」。
-- 兩件事分開，各自誠實。
--
-- ============================================================================
-- 為什麼用 pg_net 從資料庫寄，不做一支 Edge Function
-- ============================================================================
-- Edge Function 要用 supabase CLI 部署，那是這個 repo 目前沒有的一道步驟，
-- 而北極星是「換屆的幹部接得住」。多一道部署步驟就多一個沒有人會的東西。
-- pg_net 是資料庫裡的擴充功能，跟這個專案其他的邏輯放在同一個地方。
--
-- **代價要說清楚**：這一段是整個系統裡最「看不見」的地方。
-- 所以 outbox 上有 error 與 tries 兩欄，後台看得到，而且可以按重試。
-- 沒有那兩欄的話這個取捨就不成立。

begin;

-- ---------- 1. outbox ----------
create table if not exists public.mail_outbox (
  id          uuid primary key default gen_random_uuid(),
  to_email    text not null,
  subject     text not null,
  body        text not null,
  kind        text not null check (kind in ('guardian', 'interview', 'accepted', 'rejected', 'notice')),
  application_id uuid references public.applications(id) on delete set null,
  form_id     uuid references public.forms(id) on delete set null,
  created_at  timestamptz not null default now(),
  sent_at     timestamptz,
  tries       int not null default 0,
  error       text
);

create index if not exists mail_outbox_pending on public.mail_outbox (created_at)
  where sent_at is null;

comment on table public.mail_outbox is
  '每一封要寄的信先落地成一列，寄成功才蓋 sent_at。
   **不要把這張表當成寄件備份**：body 裡有申請人的名字與活動名稱，
   它跟 applications 一樣屬於「該 team 看得到」的範圍。';
comment on column public.mail_outbox.error is
  '上一次寄失敗的原因。**後台看得到這一欄**，那是用資料庫寄信這個取捨成立的前提。';

alter table public.mail_outbox enable row level security;
drop policy if exists mail_read on public.mail_outbox;
-- 看得到的人跟看得到那份申請的人一樣。沒有對應申請的信（notice）只有 president 看得到。
create policy mail_read on public.mail_outbox
  for select to authenticated using (
    exists (select 1 from public.forms f where f.id = form_id and public.is_on_team(f.team))
    or public.is_president());
revoke all on public.mail_outbox from anon, authenticated;
grant select on public.mail_outbox to authenticated;
-- **沒有 insert / update / delete 的授權。** 信只由下面那兩支函式產生與更新。
-- 前端寫得動的話，一個幹部就能用這個系統朝任何信箱寄任何內容。

-- ---------- 2. 信的內容 ----------
-- 純文字，沒有 HTML。理由跟 supabase/email-templates/README.md 那三條一樣：
-- 版型越花俏越容易被判成垃圾信，而我們花了一整個階段把 SPF / DKIM / DMARC
-- 弄成三項全 pass，不值得在這裡賠掉。
--
-- ⚠ **「不要回覆這封信」那一句是必要資訊，不是禮貌用語。**
-- noreply 那個信箱沒有 MX 紀錄，按回覆會被退回，而那個人只會覺得沒有人理他。
-- 一個學生放棄的方式通常不是抱怨，是安靜地不再試。
create or replace function public.mail_body(p_kind text, p_name text, p_title text, p_extra text)
returns text language sql immutable
as $$
  select case p_kind
    when 'guardian' then
      '您好，' || E'\n\n' ||
      p_name || ' 剛剛向 Beyond Taiwan 報名了「' || p_title || '」。' || E'\n\n' ||
      'Beyond Taiwan 是由台灣學生組成的教育非營利組織，活動免費。' || E'\n' ||
      '我們會保存他填寫的姓名、就讀學校、年級、email 與申請內容，' || E'\n' ||
      '只有負責這個計畫的團隊看得到。完整說明在 https://beyondtaiwannpo.com/privacy/' || E'\n\n' ||
      '這封信是告知，不需要回覆或簽名。有任何問題請寄到 beyondtaiwan2020@gmail.com。' || E'\n\n' ||
      'Beyond Taiwan'
    when 'interview' then
      p_name || ' 你好，' || E'\n\n' ||
      '關於你申請的「' || p_title || '」，我們想跟你聊聊。' || E'\n\n' ||
      coalesce(nullif(p_extra, ''),
               '我們會另外跟你約時間。') || E'\n\n' ||
      '不要回覆這封信，這個信箱沒有人看。有問題請寄到 beyondtaiwan2020@gmail.com。' || E'\n\n' ||
      'Beyond Taiwan'
    when 'accepted' then
      p_name || ' 你好，' || E'\n\n' ||
      '你申請的「' || p_title || '」錄取了。' || E'\n\n' ||
      '我們會再寄一封信給你，說明時間、地點與要帶什麼。' || E'\n\n' ||
      '不要回覆這封信，這個信箱沒有人看。有問題請寄到 beyondtaiwan2020@gmail.com。' || E'\n\n' ||
      'Beyond Taiwan'
    when 'rejected' then
      p_name || ' 你好，' || E'\n\n' ||
      '謝謝你申請「' || p_title || '」。這一次我們沒有辦法把名額給你。' || E'\n\n' ||
      '名額有限，而每一年報名的人都比名額多，所以這不代表你寫得不好。' || E'\n' ||
      '我們之後還會辦，也歡迎你再來。活動都會先公布在 Instagram @beyondtaiwan。' || E'\n\n' ||
      '不要回覆這封信，這個信箱沒有人看。有問題請寄到 beyondtaiwan2020@gmail.com。' || E'\n\n' ||
      'Beyond Taiwan'
    else coalesce(p_extra, '')
  end;
$$;

-- ---------- 3. 送出時的家長告知信 ----------
-- 掛在 applications 的 insert 上，不是寫在 submit_application 裡面，
-- 理由：**以後如果多了一條建立申請的路，這封信不會漏掉。**
-- 把它寫在函式裡就等於「記得也要寄信」，而那種記憶會失效。
create or replace function public.queue_guardian_notice()
returns trigger language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_title text;
begin
  -- 沒填家長信箱就什麼都不做。**填錯或亂填不擋申請**（2026-09-07 拍板）：
  -- 寄不出去就算了，不要因為這個卡住一個高中生的申請。
  if coalesce(btrim(new.guardian_email), '') = '' then return new; end if;
  select title into v_title from public.forms where id = new.form_id;
  insert into public.mail_outbox (to_email, subject, body, kind, application_id, form_id)
  values (new.guardian_email,
          'Beyond Taiwan：' || new.applicant_name || ' 報名了活動',
          public.mail_body('guardian', new.applicant_name, coalesce(v_title, '一個活動'), null),
          'guardian', new.id, new.form_id);
  return new;
end $$;

drop trigger if exists applications_guardian_notice on public.applications;
create trigger applications_guardian_notice
  after insert on public.applications
  for each row execute function public.queue_guardian_notice();

-- ---------- 4. 審核 ----------
-- ⚠ **只有 Director 與 President 叫得動。**（2026-09-07 拍板：
-- 「看得到」與「按得下去」差一級。寄出去收不回來，而 team 裡可能有高一的幹部。）
--
-- 一次可以處理很多筆。理由是實務：探索營一次一百多份申請，
-- 一筆一筆按一百次的介面，第五十次就會有人按錯。
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
    -- **每一筆各自檢查權限。** 一次傳一百個 id 進來，其中夾一個別的 team 的，
    -- 只檢查第一筆的話那一筆就會被偷偷改掉。
    if not public.is_director_of(r.team) then
      raise exception 'not_director_of:%', r.team using errcode = 'P0001';
    end if;
    -- 狀態沒有變就不做事，也不寄信。**這是防連點的核心**：
    -- 按兩次「錄取」不會寄兩封「恭喜錄取」。
    continue when r.old_status = p_status;

    update public.applications
       set status = p_status, decided_at = now(), decided_by = v_uid
     where id = r.id;
    v_n := v_n + 1;

    if p_status in ('interview', 'accepted', 'rejected') then
      insert into public.mail_outbox (to_email, subject, body, kind, application_id, form_id)
      values (r.applicant_email,
              case p_status
                when 'interview' then 'Beyond Taiwan：關於你申請的「' || r.title || '」'
                when 'accepted'  then 'Beyond Taiwan：「' || r.title || '」錄取通知'
                else 'Beyond Taiwan：關於你申請的「' || r.title || '」'
              end,
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

-- ---------- 5. 真的把信送出去 ----------
-- 用 pg_net 打 Resend 的 HTTP API。金鑰放在 Supabase 的 Vault，
-- **不要寫在這份檔案裡**（這個 repo 是公開的）。
--
-- ⚠ 這一支是 security definer，但它**不接受任何收件人參數** ——
-- 收件人只能來自 outbox，而 outbox 只由上面那兩段產生。
-- 加一個 p_to 參數就等於做出一支「朝任何信箱寄任何內容」的 API。
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
begin
  if not public.is_cadre() then raise exception 'not_cadre' using errcode = 'P0001'; end if;

  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'RESEND_API_KEY';
  select decrypted_secret into v_from from vault.decrypted_secrets where name = 'BT_MAIL_FROM';
  if v_key is null or v_from is null then
    -- **講清楚是設定沒做，不是程式壞了。** 這兩句話會一路顯示到後台上，
    -- 而看到它的人多半是一個沒有設定過 Vault 的學生。
    raise exception 'mail_not_configured' using errcode = 'P0001',
      hint = '到 Supabase 的 Vault 加 RESEND_API_KEY 與 BT_MAIL_FROM 兩個 secret，步驟見這支遷移檔的檔尾。';
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
      -- pg_net 是非同步的：這裡拿到的是一個請求 id，不是結果。
      -- **所以「寄出去了」在這裡的意思是「送進佇列了」**，不是「對方收到了」。
      -- 真正的失敗（信箱不存在、被退信）只有 Resend 的後台看得到。
      -- 這件事寫在這裡，免得有人以為 sent_at 等於送達。
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

-- ============================================================================
-- 跑完之後要做的兩件手動設定
-- ============================================================================
-- 不做的話信會一直躺在 mail_outbox 裡寄不出去（後台看得到「還有 N 封沒寄出去」）。
--
-- 1. 開 pg_net 擴充功能
--      Supabase → Database → Extensions → 搜尋 pg_net → 打開
--    或是在 SQL Editor 跑：  create extension if not exists pg_net with schema extensions;
--
-- 2. 在 Vault 放兩個 secret
--      Supabase → Project Settings → Vault → New secret
--      名稱 RESEND_API_KEY，值是 Resend 後台的 API key（re_ 開頭）
--      名稱 BT_MAIL_FROM，值是寄件者，例如：Beyond Taiwan <noreply@beyondtaiwannpo.com>
--
--    ⚠ **金鑰不要寫進這個 repo 的任何檔案，它是公開的。**
--    ⚠ 寄件網域要在 Resend 那邊驗證過（SPF / DKIM / DMARC 三項），
--      不然信會進垃圾桶。那三項在 2026-09 已經為 beyondtaiwannpo.com 設好。
--
-- 3. 設定完之後，用這一句自己測一封：
--      select public.send_pending_mail(1);
--    回 (1,0) 代表送進佇列了。**送進佇列不等於對方收到** ——
--    真正的送達要去 Resend 後台的 Logs 看。
