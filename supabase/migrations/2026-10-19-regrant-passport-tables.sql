-- 把幹部護照三張表的權限發回去　2026-10-19
--
-- 用法：整份貼進 Supabase SQL Editor 按一次 Run。最後印出 PASS / FAIL 表。
-- 在正式站上跑是安全的：那三張表的權限本來就在，這一支只是再發一次（grant 可以重複）。
--
-- ============================================================================
-- 為什麼要有這一支
-- ============================================================================
-- 2026-10-18 第一次照 schema.sql 檔頭那句「schema.sql → seed.sql → migrations/ 按日期全部跑一遍」
-- 在一個乾淨的本機 Supabase 上重建，端對端測試跑出來：**任何人打開 /passport/ 都是「資料庫休眠中」。**
-- 查到的原因：2026-08-25-milestones.sql 第 84 行
--   revoke all on months, activities, milestones, passports, stamps, entries from anon, authenticated;
-- 收回了六張表的權限，接著只把 months / activities / milestones 的 select 發回去，
-- **passports / stamps / entries 那一句 grant 沒有跟著寫**（schema.sql 第 245 行有，那支遷移檔沒有）。
-- 它檔頭說「對既有的權限沒有影響」，那句話是錯的。
--
-- 正式站沒事，是因為那支遷移檔當初跑完之後 schema.sql 又被整份貼過（它可以重跑），
-- 權限被 schema.sql 的第 245 行補回來了。但「從零重建」這條路走不到那一步。
-- 這一支把那三張表的權限發回去，放在遷移檔的最後，從零重建的順序就對了。
-- 2026-08-25 那一支不改：它是歷史，而且在正式站上已經跑過。
--
-- ⚠ 同一個坑還有一個形狀：同一天兩支遷移檔的順序。「按日期」不是「按檔名」，
-- 2026-08-31-profiles-and-role-驗收.sql 字母序排在它要驗的那一支前面，
-- 2026-09-02-availability-revoke.sql 排在建表的那一支前面。scripts/e2e/db.sh 處理了，
-- 手動重建的人看 README「從零重建資料庫」那一節。

grant select, insert, update, delete on public.passports, public.stamps, public.entries to authenticated;

select * from (
  with g as (
    select table_name, string_agg(privilege_type, ',' order by privilege_type) as privs
      from information_schema.role_table_grants
     where grantee = 'authenticated' and table_schema = 'public'
       and table_name in ('passports', 'stamps', 'entries')
     group by table_name
  )
  select 0 ord, 'OVERALL' as 項目, null::text as 應該是, null::text as 實際是,
    case when (select count(*) from g where privs = 'DELETE,INSERT,SELECT,UPDATE') = 3 then 'PASS' else 'FAIL' end as 結果
  union all select 1, '★ passports 四種權限都在', 'DELETE,INSERT,SELECT,UPDATE',
    coalesce((select privs from g where table_name = 'passports'), '（一個都沒有）'),
    case when (select privs from g where table_name = 'passports') = 'DELETE,INSERT,SELECT,UPDATE' then 'PASS' else 'FAIL' end
  union all select 2, '★ stamps 四種權限都在', 'DELETE,INSERT,SELECT,UPDATE',
    coalesce((select privs from g where table_name = 'stamps'), '（一個都沒有）'),
    case when (select privs from g where table_name = 'stamps') = 'DELETE,INSERT,SELECT,UPDATE' then 'PASS' else 'FAIL' end
  union all select 3, '★ entries 四種權限都在（RLS 另外把列限在本人）', 'DELETE,INSERT,SELECT,UPDATE',
    coalesce((select privs from g where table_name = 'entries'), '（一個都沒有）'),
    case when (select privs from g where table_name = 'entries') = 'DELETE,INSERT,SELECT,UPDATE' then 'PASS' else 'FAIL' end
) t order by ord;
