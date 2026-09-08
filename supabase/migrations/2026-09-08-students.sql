-- 批 2：帳號地基。學員可以註冊、有資料、有 dashboard。　2026-09-08
--
-- 用法：整份貼進 Supabase SQL Editor 按一次 Run。包在一個 transaction 裡。
--
-- 這一支是 GOALS.md 目標 9 的第二批。訪談紀錄與二十條決定在
-- ~/Anson/brainstorms/2026-09-07-bt-site-對外功能盤點.md（不在這個 public repo）。
--
-- ============================================================================
-- 這一支在做什麼
-- ============================================================================
--   1. profiles 加四欄：school、grade、newsletter_opt_in、newsletter_opt_in_at
--   2. 電子報同意的時間戳由資料庫蓋，前端寫不到
--   3. profiles 加 board_role（member / director / president），
--      這是批 4「誰可以按下會寄信的按鈕」的權限來源
--   4. 兩支判斷用的函式：is_president()、is_director_of(team)
--
-- ============================================================================
-- 這一支「不做」什麼
-- ============================================================================
--   **不建申請相關的任何表。** 那是批 3。
--   **不改任何一條既有的 RLS。** 學員仍然什麼都看不到，
--     這一支只是讓他有名字、有學校、有一個同意過的紀錄。
--   **不動 profiles.role 的 default**（2026-09-01 已經是 'student'，
--     也就是任何人自己註冊出來都是學員，這正是我們要的）。
--
-- ============================================================================
-- ⚠ 學校清單不在資料庫裡
-- ============================================================================
-- 「就讀學校」是自由文字，不是外鍵。自動完成的來源是 app/schools.json，
-- 由 scripts/schools/build.mjs 從教育部統計處的名錄產生，一學年重跑一次。
--
-- 為什麼不做成一張表加外鍵：清單外的學校（高職、海外、實驗教育、體制外）
-- 一定會出現，做成外鍵就等於把那些人擋在門外，而他們正是最需要這個資訊的人。
-- 代價是同一間學校會有幾種寫法。用自動完成把大多數人收斂到同一個字串，
-- 剩下的在後台看得到，需要的時候再整理。**擋住一個真的想申請的人，
-- 比資料庫裡多幾種寫法貴得多。**

begin;

-- ---------- 1. profiles 加四欄 ----------
-- 為什麼加在 profiles 而不是另開一張 student_profiles：
-- 這四欄講的是「這個人」，跟 name_zh、avatar 同一層。
-- 幹部也可能有母校，之後要用也用得到。多一張表就多一次 join、
-- 多一組 RLS、多一個「有沒有那一列」的分支。
alter table public.profiles add column if not exists school text;
alter table public.profiles add column if not exists grade  text;
alter table public.profiles add column if not exists newsletter_opt_in    boolean not null default false;
alter table public.profiles add column if not exists newsletter_opt_in_at timestamptz;

comment on column public.profiles.school is
  '就讀學校，自由文字。自動完成來自 app/schools.json（教育部一般高級中等學校名錄），
   但**不限定在清單內** —— 高職、海外、實驗教育的學生要填得進來。';
comment on column public.profiles.grade is
  '年級，自由文字（高一 / 高二 / 高三 / 已畢業 / 其他）。
   不用數字，因為「已畢業」與「重考」都是真實情況，而數字表達不了。';
comment on column public.profiles.newsletter_opt_in is
  '願不願意收 BT 的活動通知與資源更新。**這是寄電子報的唯一依據。**
   沒有勾的人不准出現在任何一份寄信名單裡，不管那份名單是怎麼匯出來的。';
comment on column public.profiles.newsletter_opt_in_at is
  '勾選的時刻。**前端寫不到這一欄**，由下面的 trigger 蓋。
   同意什麼時候拿到的，是這件事唯一有用的證據；讓客戶端填等於沒有證據。';

-- ---------- 2. 同意的時間戳由資料庫蓋 ----------
-- 為什麼要分開一支 trigger、不併進 touch_updated_at：
-- 那一支每次 update 都會動 updated_at，而同意的時間只有在**同意狀態改變**
-- 的時候才該動。混在一起的話，改個名字就會讓「什麼時候同意的」跟著跳。
create or replace function public.touch_newsletter_consent()
returns trigger
language plpgsql
as $$
begin
  if new.newsletter_opt_in is distinct from old.newsletter_opt_in then
    -- 取消訂閱就把時間清掉。留著一個舊時間比沒有時間更容易誤導：
    -- 有時間看起來像「他同意過而且還算數」。
    new.newsletter_opt_in_at := case when new.newsletter_opt_in then now() else null end;
  end if;
  return new;
end $$;

drop trigger if exists profiles_touch_newsletter on public.profiles;
create trigger profiles_touch_newsletter
  before update on public.profiles
  for each row execute function public.touch_newsletter_consent();

-- ---------- 3. 欄位層級授權 ----------
-- Postgres 的欄位授權是累加的，這一句不會蓋掉 2026-08-31 那一句。
-- **newsletter_opt_in_at 不在裡面**，理由見上面那條欄位註解。
-- **board_role 也不在裡面**，理由見下面第 4 節。
grant update (school, grade, newsletter_opt_in) on public.profiles to authenticated;

-- ---------- 4. board_role：後台的權限來源 ----------
-- 三層，對得上 BT 現有的組織形狀（2026-09-07 Paul 拍板）：
--   member    該 team 的一般幹部。看得到自己 team 收到的申請。
--   director  該 team 的 Director。管理自己 team 的申請。
--   president 當屆 Co-President。看得到全部，而且是**會寄信那幾顆按鈕**的持有者。
--
-- **為什麼「看得到」與「按得下去」要分兩層**：寄出去收不回來，
-- 而 team 裡可能有高一的幹部。權限窄一級的成本是多問一個人，
-- 誤寄一封「恭喜錄取」給沒錄取的高中生的成本收不回來。
--
-- 這一欄**不在任何 grant update 的清單裡**，前端改不動。
-- 要改只能透過下面那支 set_board_role()，而那支只有 president 叫得動。
alter table public.profiles add column if not exists board_role text not null default 'member';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_board_role_check') then
    alter table public.profiles add constraint profiles_board_role_check
      check (board_role in ('member', 'director', 'president'));
  end if;
end $$;

comment on column public.profiles.board_role is
  '後台權限：member / director / president。**跟 role（cadre/student/alumni）是兩件事。**
   role 說「他是不是幹部」，board_role 說「他在幹部裡管到哪」。
   學員的 board_role 永遠是 member，而且沒有意義 —— 判斷式一律先問 is_cadre()。';

-- ---------- 5. 兩支判斷用的函式 ----------
-- 跟 is_cadre() 同一個形狀與同一組理由（security definer 避免遞迴、
-- stable 讓同一個查詢只算一次、search_path 釘死避免被同名暫存表換掉）。
-- 詳細的理由寫在 2026-08-31-profiles-and-role.sql 的 is_cadre() 上面，不重複。
--
-- ⚠ 兩支都自己再問一次 role = 'cadre'。少了那一句，
-- 一個 board_role 被誤設成 director 的學員就會拿到幹部的權限。
-- 「反正學員的 board_role 不會被設成 director」是一個假設，不是一道門。
create or replace function public.is_president()
returns boolean language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles
     where id = auth.uid() and role = 'cadre' and board_role = 'president'
  );
$$;

-- 「我是不是這個 team 的 Director」。president 一律算是。
-- 參數是 team 名稱而不是 team id，因為 profiles.team 本來就是文字
--（BT 每年換屆，team 的名字比 team 的 id 穩定）。
create or replace function public.is_director_of(p_team text)
returns boolean language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles
     where id = auth.uid()
       and role = 'cadre'
       and (board_role = 'president'
            or (board_role = 'director' and team is not distinct from p_team))
  );
$$;

revoke execute on function public.is_president()          from public, anon;
revoke execute on function public.is_director_of(text)    from public, anon;
grant  execute on function public.is_president()          to authenticated;
grant  execute on function public.is_director_of(text)    to authenticated;

-- ---------- 6. 發權限的唯一一條路 ----------
-- 只有 president 叫得動，而且**不能把自己降級**。
--
-- 為什麼要擋自我降級：兩位 Co-President 如果其中一位手滑把自己改成 member，
-- 而另一位剛好畢業或帳號出問題，這個系統就再也沒有人能發權限，
-- 只能回去下 SQL —— 而北極星是「不用回去下 SQL」。
-- 擋住自我降級，至少永遠留得住一個 president。
--
-- 為什麼不擋「把別的 president 降級」：那是真實需求（換屆要交接），
-- 而且兩位互相看得見，不是無聲的。
create or replace function public.set_board_role(p_target uuid, p_role text)
returns text language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_president() then
    raise exception 'not_president' using errcode = 'P0001';
  end if;
  if p_role not in ('member', 'director', 'president') then
    raise exception 'bad_role' using errcode = 'P0001';
  end if;
  if p_target = auth.uid() and p_role <> 'president' then
    raise exception 'cannot_demote_self' using errcode = 'P0001';
  end if;
  -- 只發給幹部。學員拿到 director 沒有意義，而且是一個一定會被誤解的狀態。
  update public.profiles set board_role = p_role
   where id = p_target and role = 'cadre';
  if not found then
    raise exception 'not_a_cadre' using errcode = 'P0001';
  end if;
  return p_role;
end $$;

revoke all on function public.set_board_role(uuid, text) from public, anon;
grant execute on function public.set_board_role(uuid, text) to authenticated;

-- ---------- 7. 自己刪掉自己的帳號 ----------
-- 2026-09-07 Paul 決定申請資料不設保存期限（一直留著）。
-- **那個決定的對價就是當事人隨時拿得回控制權**，所以這一支不是加分項，是必要項。
--
-- 為什麼要 security definer：auth.users 不是我們的表，一般使用者沒有 delete 權限。
-- 這是唯一一條讓人刪掉自己帳號的路。
--
-- 為什麼刪 auth.users 而不是刪 profiles：profiles.id 是
-- `references auth.users on delete cascade`，只刪 profiles 的話 auth 那一列還在，
-- 他用同一個 email 再登入會拿到一個沒有 profiles 的殭屍帳號 ——
-- 那種帳號什麼都做不了，而且他自己修不了。從最上面刪，一路 cascade 下去乾淨。
--
-- ⚠ **沒有參數，身分只有 auth.uid() 一個來源。**（跟 confirm_availability_unchanged
--   同一個形式與同一個理由。）加一個 p_user_id 參數就等於做出一支
--   「刪掉任何人」的 API，而它跟正確的版本只差一行。
create or replace function public.delete_my_account()
returns void language plpgsql security definer
set search_path = public, auth, pg_temp
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = 'P0001'; end if;
  -- 幹部不走這一條。護照裡有蓋章紀錄與別人看得到的進度，
  -- 幹部要離開是換屆交接的事，不是一個按鈕。
  -- 擋在這裡而不是只擋在前端：前端的按鈕本來就不會出現在幹部那一頁，
  -- 但「前端沒有那個按鈕」不是一道門。
  if public.is_cadre() then raise exception 'cadre_must_ask' using errcode = 'P0001'; end if;
  delete from auth.users where id = v_uid;
end $$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

commit;

-- ============================================================================
-- 跑完之後要做一次的事（只有第一次）
-- ============================================================================
-- 上面沒有任何一句會把某個人設成 president —— 沒有人是 president 的話，
-- set_board_role() 誰都叫不動，這是一個雞生蛋的狀態。
-- **第一位 president 只能用 SQL 指定**，換掉下面的信箱之後單獨執行一次：
--
--   update public.profiles set board_role = 'president'
--    where id = (select id from auth.users where email = '把信箱換成這裡');
--
-- 兩位 Co-President 都要跑一次（各換一次信箱）。
-- 之後換屆就在後台互相指定，不用再回來下 SQL。
-- ⚠ 跑完用這一句確認，應該剛好兩列：
--   select id, name_zh, team, board_role from public.profiles where board_role <> 'member';
