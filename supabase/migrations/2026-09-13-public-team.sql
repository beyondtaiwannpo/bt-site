-- 補批 1 漏掉的一件：/team/ 上的三十個人。　2026-09-08
--
-- 用法：整份貼進 Supabase SQL Editor 按一次 Run。
-- **先跑 2026-09-08-students.sql**（要用它建的 is_president()）。
--
-- ============================================================================
-- 這一支在做什麼
-- ============================================================================
-- profiles 加三欄，讓幹部的姓名、team、大頭照可以出現在對外的 /team/ 頁上。
--
-- **預設全部不公開。** 跑完這一支之後 /team/ 上仍然一個名字都沒有，
-- 跟現在一模一樣。要放誰是之後一個一個決定的事。
--
-- ============================================================================
-- 兩把鑰匙（2026-09-07 Paul 拍板「先做出來，要不要放我們決定」）
-- ============================================================================
--   public_profile   **本人自己打的勾**。他改得動，別人改不動。
--   public_approved  **P/VP 核可**。只有 president 改得動，本人改不動。
--
-- 兩個都是 true 才會出現在對外頁面上。
--
-- 為什麼要兩把：只有本人打勾的話，一個高一的幹部可以自己把自己放上去，
-- 而 CLAUDE.md 的紅線是「未成年一律不放」；只有 P/VP 核可的話，
-- 就變成別人替他決定要不要公開自己的臉。**兩件事都要成立。**
--
-- ⚠ **系統沒有生日欄位，所以「未滿 18 不放」技術上擋不住。**
-- 那一條靠 P/VP 那把鑰匙，而且要寫進 README 的核可清單。
-- 不要為了擋它而去收生日 —— 為了一個一年用兩次的檢查去存全體幹部的出生日期，
-- 是拿一個更大的隱私成本換一個小的方便。
--
-- ============================================================================
-- ⚠ 大頭照對外公開超出現行隱私政策的告知範圍
-- ============================================================================
-- `/privacy/` 現在寫的是「大頭照將顯示於進度牆供其他幹部查看」。
-- 對外公開是**新用途**，政策要跟著改，而且要重新告知每一個人。
-- **名字撤得下來，照片被搜尋引擎存過撤不乾淨。**
-- 這一段留在這裡，是因為跑這支 SQL 的人就是該知道這件事的人。

begin;

alter table public.profiles add column if not exists public_profile  boolean not null default false;
alter table public.profiles add column if not exists public_approved boolean not null default false;
alter table public.profiles add column if not exists public_title    text;

comment on column public.profiles.public_profile is
  '本人同不同意把自己的姓名、team、大頭照放上對外的 /team/。**他自己改得動。**';
comment on column public.profiles.public_approved is
  'P/VP 核可。**只有 president 改得動**（走 set_public_approved()）。
   未滿 18 歲一律不核可 —— 系統沒有生日欄位，這一條靠人。';
comment on column public.profiles.public_title is
  '對外顯示的頭銜，例如「Co-President 2026-27」。空的話就只顯示 team。
   自由文字，因為 BT 每年換屆，頭銜的寫法不該寫死在程式裡。';

-- ---------- 本人那一把 ----------
-- 加進欄位授權（Postgres 的欄位授權是累加的，不會蓋掉之前那幾句）。
-- **public_approved 不在裡面**，本人改不動自己的核可狀態。
grant update (public_profile, public_title) on public.profiles to authenticated;

-- ---------- P/VP 那一把 ----------
create or replace function public.set_public_approved(p_target uuid, p_ok boolean)
returns boolean language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_president() then
    raise exception 'not_president' using errcode = 'P0001';
  end if;
  -- 只核可幹部。學員被放上團隊頁沒有意義，而且是一個一定會被誤解的狀態。
  update public.profiles set public_approved = p_ok
   where id = p_target and role = 'cadre';
  if not found then raise exception 'not_a_cadre' using errcode = 'P0001'; end if;
  return p_ok;
end $$;

revoke all on function public.set_public_approved(uuid, boolean) from public, anon;
grant execute on function public.set_public_approved(uuid, boolean) to authenticated;

-- ---------- 對外讀得到「兩個都 true」的那幾列 ----------
-- 原本的政策：自己那一列，加上幹部看得到所有幹部。這裡多一條 or。
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles
  for select
  using (
    auth.uid() = id
    or (public.is_cadre() and profiles.role = 'cadre')
    -- 兩把鑰匙都轉了才對外。**沒有登入的人也讀得到這幾列**，
    -- 但只讀得到下面 grant 給 anon 的那幾欄。
    or (public_profile and public_approved and profiles.role = 'cadre')
  );

-- ⚠ **RLS 是「列」層級的，擋不住欄位。**
-- 沒有下面這句欄位授權的話，anon 會連那個人的 school、grade、tz 一起讀到。
-- 這跟 resources 那張表用的是同一個技巧（見 2026-09-11-resources.sql）。
grant select (id, name_zh, name_en, team, avatar, public_title, public_profile, public_approved)
  on public.profiles to anon;

commit;

-- ============================================================================
-- 跑完之後
-- ============================================================================
-- /team/ 上仍然一個名字都沒有，跟現在一模一樣。**那是對的。**
-- 要放人的流程是：
--   1. 那個人自己到 /app/ 打勾（他同意公開）
--   2. Co-President 到 /admin/ 的「團隊頁」核可
-- 兩步都做完才會出現。
--
-- ⚠ 核可之前要確認的兩件事，寫在 /admin/ 那一頁上，也寫在 README：
--   1. **他滿 18 歲了嗎**（未滿一律不放，不管職位）
--   2. **隱私政策改了嗎**（大頭照對外是新用途，現行政策只說進度牆）
