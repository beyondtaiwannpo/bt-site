-- 權限重新設計批 3：拿掉搬走的東西　2026-10-25
--
-- 用法：整份貼進 Supabase SQL Editor 按一次 Run。可以重跑。最後印一張 PASS / FAIL 表。
-- **要先跑過 2026-10-24-ranks-and-workspaces.sql**（它把 public_title 的值搬進 positions），
-- 而且前端要已經是批 3 之後的版本（settings、team、admin/site 都不再讀 public_title）。
-- 跟 2026-08-31 拆表那次同一個做法：先搬值、前端改完、Paul 實測過，才單獨 drop。
--
-- ============================================================================
-- 這一支在做什麼
-- ============================================================================
--   1. drop profiles.public_title：團隊頁的頭銜從此只從 positions 算（public_team()）。
--      搬值那一步在 10-24 做過了，驗收表第 15 項當時對過「逐字相等」。
--   2. drop privileged_teams：team 不再長出權限，這張表沒有存在的理由。
--      前端 settings 批 3 已經不讀它。
--   3. 再確認 guard_profile_team 的 trigger 與函式不在（10-24 拆過；萬一 10-21 被重跑過又建回來）。
--
-- ⚠ 跑完這一支之後再重跑 2026-10-21-people-admin.sql 會把 privileged_teams 與 trigger 建回來，
--   那時要再跑一次 10-24 與這一支。10-24 自己對 public_title 不存在是安全的（它用動態 SQL 查那一欄）。
-- ============================================================================

begin;

alter table public.profiles drop column if exists public_title;

drop table if exists public.privileged_teams;

drop trigger if exists guard_profile_team on public.profiles;
drop function if exists public.guard_profile_team();

commit;

select * from (
  with col as (
    select count(*) as n from information_schema.columns
     where table_schema = 'public' and table_name = 'profiles' and column_name = 'public_title'
  ), tbl as (
    select count(*) as n from pg_tables where schemaname = 'public' and tablename = 'privileged_teams'
  ), trg as (
    select count(*) as n from pg_trigger t join pg_class c on c.oid = t.tgrelid
     where c.relname = 'profiles' and t.tgname = 'guard_profile_team' and not t.tgisinternal
  ), fn as (
    select count(*) as n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'guard_profile_team'
  ), pt as (
    select count(*) as n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'public_team'
  ), pos as (
    select count(*) as n from public.positions po join public.terms t on t.id = po.term_id and t.status = 'current'
  ), cadres as (
    select count(*) as n from public.profiles where role = 'cadre'
  )
  select 0 ord, 'OVERALL' as 項目, null::text as 應該是, null::text as 實際是,
    case when (select n from col) = 0 and (select n from tbl) = 0 and (select n from trg) = 0
      and (select n from fn) = 0 and (select n from pt) = 1 and (select n from pos) >= (select n from cadres)
    then 'PASS' else 'FAIL' end as 結果
  union all select 1, '★ profiles.public_title 不在了', '0', (select n from col)::text, case when (select n from col) = 0 then 'PASS' else 'FAIL' end
  union all select 2, '★ privileged_teams 不在了', '0', (select n from tbl)::text, case when (select n from tbl) = 0 then 'PASS' else 'FAIL' end
  union all select 3, '★ guard_profile_team 的 trigger 與函式都不在', '0', ((select n from trg) + (select n from fn))::text, case when (select n from trg) + (select n from fn) = 0 then 'PASS' else 'FAIL' end
  union all select 4, 'public_team() 在（團隊頁改讀它）', '1', (select n from pt)::text, case when (select n from pt) = 1 then 'PASS' else 'FAIL' end
  union all select 5, '★ 這一屆的職位筆數不少於幹部人數（值真的搬走了才准 drop）', '≥ ' || (select n from cadres)::text, (select n from pos)::text, case when (select n from pos) >= (select n from cadres) then 'PASS' else 'FAIL' end
) t order by ord;
