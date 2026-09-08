-- 批 6：活動營運（簽到、行前信、通知）。　2026-09-08
--
-- 用法：整份貼進 Supabase SQL Editor 按一次 Run。
-- **先跑前面四支**（students、applications、decisions-and-mail、resources）。
--
-- ============================================================================
-- 這一支在做什麼
-- ============================================================================
--   1. applications 加簽到那兩欄
--   2. set_check_in()：現場點名
--   3. send_notice()：對一場活動的某一群人寄一封信（行前信、通知）
--
-- ============================================================================
-- 為什麼簽到是 applications 上的兩欄，不是另一張表
-- ============================================================================
-- 一份申請對應一場活動，一場活動一個人只到不到一次。
-- 另開一張 attendance 表就要多一組 RLS、多一次 join、多一個「有沒有那一列」的分支，
-- 而換到的是「同一個人在同一場活動裡有多筆出席紀錄」這個我們用不到的能力。
--
-- **哪天真的要記多場次（例如兩天的營隊各簽一次），那時候再開表。**
-- 現在就開等於為了一個沒有發生的需求付每天的維護成本。
--
-- ============================================================================
-- 為什麼寄信要走函式，而且不能自己填收件人
-- ============================================================================
-- send_notice 的參數裡**沒有收件人**，只有「哪一場活動」與「哪幾種狀態」。
-- 收件人由資料庫自己從 applications 撈出來。
--
-- 有收件人參數的話，這支函式就是一台任何幹部都能用的群發機 ——
-- 而它跟正確的版本只差一個參數。

begin;

-- ---------- 1. 簽到 ----------
alter table public.applications add column if not exists checked_in_at timestamptz;
alter table public.applications add column if not exists checked_in_by uuid
  references public.profiles(id) on delete set null;

comment on column public.applications.checked_in_at is
  '活動當天到場的時刻。**沒到的人是 null，不是 false** ——
   「還沒點到」與「點過了而且沒來」在現場是兩回事，
   而中途才開始點名的那一場，前半段的人全部會是 null。
   要區分的話看 forms 有沒有辦過（那是人知道的事），不要在這一欄上發明第三種值。';

-- ---------- 2. 現場點名 ----------
-- ⚠ **Director 與 President 才能點。** 一般幹部看得到名單，但點不了 ——
-- 簽到紀錄之後會拿來排下一場的名額，不是一個隨手可以改的東西。
create or replace function public.set_check_in(p_ids uuid[], p_present boolean)
returns int language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_uid uuid := auth.uid(); r record; v_n int := 0;
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = 'P0001'; end if;
  for r in
    select a.id, f.team from public.applications a
      join public.forms f on f.id = a.form_id
     where a.id = any(p_ids)
  loop
    -- 每一筆各自檢查。一次傳一百個 id 進來、其中夾一個別的 team 的，
    -- 只檢查第一筆的話那一筆就會被偷偷改掉（跟 decide_applications 同一個理由）。
    if not public.is_director_of(r.team) then
      raise exception 'not_director_of:%', r.team using errcode = 'P0001';
    end if;
    update public.applications
       set checked_in_at = case when p_present then now() else null end,
           checked_in_by = case when p_present then v_uid else null end
     where id = r.id;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

revoke all on function public.set_check_in(uuid[], boolean) from public, anon;
grant execute on function public.set_check_in(uuid[], boolean) to authenticated;

-- ---------- 3. 行前信與通知 ----------
-- p_statuses 是要寄給哪幾種人，例如 array['accepted']。
-- **沒有收件人參數**，理由見檔頭。
--
-- 信一樣先落地成 mail_outbox 的一列，由 send_pending_mail() 送出去 ——
-- 跟錄取通知走同一條路，所以「還有 N 封沒寄出去」那一塊也照樣看得到。
create or replace function public.send_notice(
  p_form_id uuid, p_statuses text[], p_subject text, p_body text)
returns int language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_uid uuid := auth.uid(); v_team text; v_title text; v_n int;
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = 'P0001'; end if;
  if coalesce(btrim(p_subject), '') = '' or coalesce(btrim(p_body), '') = '' then
    raise exception 'empty_mail' using errcode = 'P0001';
  end if;
  select team, title into v_team, v_title from public.forms where id = p_form_id;
  if v_team is null then raise exception 'no_such_form' using errcode = 'P0001'; end if;
  if not public.is_director_of(v_team) then
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
end $$;

revoke all on function public.send_notice(uuid, text[], text, text) from public, anon;
grant execute on function public.send_notice(uuid, text[], text, text) to authenticated;

commit;
