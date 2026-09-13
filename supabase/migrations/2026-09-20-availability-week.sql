-- 時間看板：某一週的例外（兩張新表）。2026-09-12
--
-- 用法：整份貼進 Supabase SQL Editor 按一次 Run。最後印出 PASS / FAIL 表。
-- 只需要 public.profiles 與 public.is_cadre() 已經存在
-- （2026-08-31-profiles-and-role.sql）。這一支不碰既有的 availability /
-- availability_meta，兩邊互相獨立。
--
-- ============================================================================
-- 這一支在做什麼
-- ============================================================================
-- 時間看板現在只存「每週固定有空」的格子（availability 表：user_id / weekday /
-- minute，**沒有日期**）。成員反映想為某一週單獨填一份例外。這一支加兩張表：
--
--   availability_week       某一週的格子。形狀跟 availability 一模一樣，
--                            多一個 week_start（那一週星期一的日期，用那個人
--                            自己的時區算出來——跟純函式 weekKeyOf() 回的字串
--                            同一個格式，同一把尺）。
--   availability_week_mark  「這個人動過這一週」。**不能省**——沒有它，
--                            「整週清空（這一週我完全沒空）」跟「沒填過例外」
--                            會是同一種資料庫狀態（兩邊在 availability_week
--                            都是零列），畫面沒有辦法分出來。
--
-- 看板顯示某一週時：那一週有 mark 就只看 availability_week（不管那週有沒有
-- 格子），沒有 mark 就照舊看 availability。**這一支只建表，不寫這段判斷邏輯**
-- ——那是看板前端的事，不屬於這支遷移檔。
--
-- ============================================================================
-- 跟既有的 availability 一樣：不給 update
-- ============================================================================
-- 兩張表除了主鍵都沒有別的欄位：「改時間」就是刪掉舊格子、插入新格子；
-- 「取消某一週」就是刪掉 mark 與那一週的格子。所以「改到別人的列」這個
-- bug class 在這兩張表上**不存在**——不是被政策擋住，是不存在。
-- 以後真的加了欄位，update 會直接失敗：大聲壞掉比安靜放行好
-- （抄 2026-09-02-availability.sql 的理由，同一個設計，同一個原因）。
--
-- ============================================================================
-- ⚠⚠ 先 revoke 再 grant，順序不能反
-- ============================================================================
-- Supabase 在 public schema 設了 default privileges，**每一張新表自動把全部
-- 權限發給 anon 與 authenticated**。2026-09-02 的 availability 當天就補了一份
-- 修補檔（2026-09-02-availability-revoke.sql）、2026-09-11 的 alumni_stories
-- 也踩過同一顆釘子。這一支把 revoke 直接寫在同一份檔案裡，不留給修補檔。

begin;

-- ─────────────────────────────────────────────────────────────────────
-- 1. 某一週的格子
-- ─────────────────────────────────────────────────────────────────────
create table if not exists public.availability_week (
  user_id    uuid     not null references public.profiles(id) on delete cascade,
  week_start date     not null,
  weekday    smallint not null check (weekday between 0 and 6),
  minute     smallint not null check (minute >= 0 and minute < 1440 and minute % 30 = 0),
  primary key (user_id, week_start, weekday, minute)
);

comment on table public.availability_week is
  '某個人在某一週的時段。有這一週的 mark 時，看板那一週只看這裡，不看 availability。';
comment on column public.availability_week.week_start is
  '那一週星期一的日期，**以那個人自己的 profiles.tz 算出來的當地日期**。
   跟 weekday/minute 用同一把尺——不然跨時區的人「同一週」會指到不同的七天。';

-- ─────────────────────────────────────────────────────────────────────
-- 2. 「這個人動過這一週」
-- ─────────────────────────────────────────────────────────────────────
create table if not exists public.availability_week_mark (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  week_start date not null,
  primary key (user_id, week_start)
);

comment on table public.availability_week_mark is
  '哪幾週被特別設定過。整週清空 = 有這一列但 availability_week 沒有任何格子。';

-- ─────────────────────────────────────────────────────────────────────
-- 3. RLS
-- ─────────────────────────────────────────────────────────────────────
alter table public.availability_week      enable row level security;
alter table public.availability_week_mark enable row level security;

drop policy if exists availability_week_read        on public.availability_week;
drop policy if exists availability_week_insert      on public.availability_week;
drop policy if exists availability_week_delete      on public.availability_week;
drop policy if exists availability_week_mark_read   on public.availability_week_mark;
drop policy if exists availability_week_mark_insert on public.availability_week_mark;
drop policy if exists availability_week_mark_delete on public.availability_week_mark;

-- 讀：只有登入的幹部（看板需要看到所有人的）。學員與未登入的人一列都讀不到。
create policy availability_week_read on public.availability_week
  for select to authenticated using (public.is_cadre());
create policy availability_week_mark_read on public.availability_week_mark
  for select to authenticated using (public.is_cadre());

-- 寫：只能寫自己的，而且必須是幹部。兩個條件都要。
create policy availability_week_insert on public.availability_week
  for insert to authenticated with check (auth.uid() = user_id and public.is_cadre());
create policy availability_week_delete on public.availability_week
  for delete to authenticated using (auth.uid() = user_id and public.is_cadre());
create policy availability_week_mark_insert on public.availability_week_mark
  for insert to authenticated with check (auth.uid() = user_id and public.is_cadre());
create policy availability_week_mark_delete on public.availability_week_mark
  for delete to authenticated using (auth.uid() = user_id and public.is_cadre());

-- **兩張表都刻意沒有 update 政策、也不發 update 授權。** 理由見檔頭那一段。

-- ─────────────────────────────────────────────────────────────────────
-- 4. 授權：先 revoke 再 grant
-- ─────────────────────────────────────────────────────────────────────
revoke all on public.availability_week      from anon, authenticated;
revoke all on public.availability_week_mark from anon, authenticated;

grant select, insert, delete on public.availability_week      to authenticated;
grant select, insert, delete on public.availability_week_mark to authenticated;

-- anon 什麼都不給。讀取政策是 is_cadre()，未登入的人本來就不該碰到這兩張表，
-- 而「政策會擋」跟「他連權限都沒有」是兩層——兩層都要在（同一個坑
-- 2026-08-31-profiles-and-role.sql 第 136 行已經寫過一次）。

commit;

-- ============================================================================
-- 驗收
-- ============================================================================
-- ⚠ 權限一律查系統目錄（pg_class.relacl 用 aclexplode 展開），**不用
-- information_schema**——那些檢視只列出「跟目前使用者有關」的授權，某些身分
-- 執行時會安靜地回零列，讓「沒有發給任何人」跟「查不到」變成同一個結果，一個
-- 因為看不到而通過的安全檢查比沒有檢查更糟（抄 2026-09-18-alumni-stories.sql
-- 檔尾那段說明，同一個理由）。
--
-- ⚠ 第 8、9 條（【對照】authenticated 有 SELECT/INSERT/DELETE）不能省：
-- 少了它們，第 4～7 條在「這張表整個沒發任何權限」的時候也會 PASS，而那時候
-- 看板整個是壞的，不是安全的。
with
  pk_week as (
    select string_agg(a.attname, ',' order by k.ord) as cols
    from pg_constraint c
    cross join lateral unnest(c.conkey) with ordinality as k(attnum, ord)
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
    where c.conrelid = 'public.availability_week'::regclass and c.contype = 'p'
  ),
  pk_mark as (
    select string_agg(a.attname, ',' order by k.ord) as cols
    from pg_constraint c
    cross join lateral unnest(c.conkey) with ordinality as k(attnum, ord)
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
    where c.conrelid = 'public.availability_week_mark'::regclass and c.contype = 'p'
  ),
  pol_week_insert as (
    select with_check from pg_policies
    where schemaname = 'public' and tablename = 'availability_week'
      and policyname = 'availability_week_insert'
  ),
  pol_week_delete as (
    select qual from pg_policies
    where schemaname = 'public' and tablename = 'availability_week'
      and policyname = 'availability_week_delete'
  ),
  pol_mark_insert as (
    select with_check from pg_policies
    where schemaname = 'public' and tablename = 'availability_week_mark'
      and policyname = 'availability_week_mark_insert'
  ),
  pol_mark_delete as (
    select qual from pg_policies
    where schemaname = 'public' and tablename = 'availability_week_mark'
      and policyname = 'availability_week_mark_delete'
  )
select * from (
  select 0 ord, 'OVERALL' as 項目, null::text as 應該是, null::text as 實際是,
    case when
      (select to_regclass('public.availability_week') is not null)
      and (select to_regclass('public.availability_week_mark') is not null)
      and (select relrowsecurity from pg_class where oid = 'public.availability_week'::regclass)
      and (select relrowsecurity from pg_class where oid = 'public.availability_week_mark'::regclass)
      and (select count(*) from pg_class c, aclexplode(c.relacl) x
            where c.oid = 'public.availability_week'::regclass and x.grantee = 'anon'::regrole) = 0
      and (select count(*) from pg_class c, aclexplode(c.relacl) x
            where c.oid = 'public.availability_week_mark'::regclass and x.grantee = 'anon'::regrole) = 0
      and (select count(distinct x.privilege_type) from pg_class c, aclexplode(c.relacl) x
            where c.oid = 'public.availability_week'::regclass and x.grantee = 'authenticated'::regrole
              and x.privilege_type in ('SELECT','INSERT','DELETE')) = 3
      and (select count(distinct x.privilege_type) from pg_class c, aclexplode(c.relacl) x
            where c.oid = 'public.availability_week_mark'::regclass and x.grantee = 'authenticated'::regrole
              and x.privilege_type in ('SELECT','INSERT','DELETE')) = 3
      and (select count(*) from pg_class c, aclexplode(c.relacl) x
            where c.oid = 'public.availability_week'::regclass and x.grantee = 'authenticated'::regrole
              and x.privilege_type = 'UPDATE') = 0
      and (select count(*) from pg_class c, aclexplode(c.relacl) x
            where c.oid = 'public.availability_week_mark'::regclass and x.grantee = 'authenticated'::regrole
              and x.privilege_type = 'UPDATE') = 0
      and (select count(*) from pg_policies where schemaname = 'public' and tablename = 'availability_week') = 3
      and (select count(*) from pg_policies where schemaname = 'public' and tablename = 'availability_week_mark') = 3
      and (select cols from pk_week) = 'user_id,week_start,weekday,minute'
      and (select cols from pk_mark) = 'user_id,week_start'
      and (select count(*) from pg_policies where schemaname = 'public' and tablename = 'availability_week'
            and policyname = 'availability_week_read' and qual like '%is_cadre%') = 1
      and (select count(*) from pg_policies where schemaname = 'public' and tablename = 'availability_week_mark'
            and policyname = 'availability_week_mark_read' and qual like '%is_cadre%') = 1
      and (select (with_check like '%auth.uid()%') and (with_check like '%user_id%') and (with_check like '%is_cadre%')
            from pol_week_insert)
      and (select (qual like '%auth.uid()%') and (qual like '%user_id%') and (qual like '%is_cadre%')
            from pol_week_delete)
      and (select (with_check like '%auth.uid()%') and (with_check like '%user_id%') and (with_check like '%is_cadre%')
            from pol_mark_insert)
      and (select (qual like '%auth.uid()%') and (qual like '%user_id%') and (qual like '%is_cadre%')
            from pol_mark_delete)
    then 'PASS' else 'FAIL' end as 結果

  union all select 1, '兩張表都存在', 'true,true',
    (to_regclass('public.availability_week') is not null)::text || ',' ||
    (to_regclass('public.availability_week_mark') is not null)::text,
    case when to_regclass('public.availability_week') is not null
          and to_regclass('public.availability_week_mark') is not null
    then 'PASS' else 'FAIL' end

  union all select 2, 'availability_week 的 RLS 開著', 'true',
    coalesce((select relrowsecurity::text from pg_class where oid = 'public.availability_week'::regclass),
      '（表不存在）'),
    case when (select relrowsecurity from pg_class where oid = 'public.availability_week'::regclass)
    then 'PASS' else 'FAIL' end

  union all select 3, 'availability_week_mark 的 RLS 開著', 'true',
    coalesce((select relrowsecurity::text from pg_class where oid = 'public.availability_week_mark'::regclass),
      '（表不存在）'),
    case when (select relrowsecurity from pg_class where oid = 'public.availability_week_mark'::regclass)
    then 'PASS' else 'FAIL' end

  union all select 4, '★ anon 對 availability_week 零權限', '0 種',
    (select count(*) from pg_class c, aclexplode(c.relacl) x
      where c.oid = 'public.availability_week'::regclass and x.grantee = 'anon'::regrole)::text || ' 種',
    case when (select count(*) from pg_class c, aclexplode(c.relacl) x
                where c.oid = 'public.availability_week'::regclass and x.grantee = 'anon'::regrole) = 0
    then 'PASS' else 'FAIL' end

  union all select 5, '★ anon 對 availability_week_mark 零權限', '0 種',
    (select count(*) from pg_class c, aclexplode(c.relacl) x
      where c.oid = 'public.availability_week_mark'::regclass and x.grantee = 'anon'::regrole)::text || ' 種',
    case when (select count(*) from pg_class c, aclexplode(c.relacl) x
                where c.oid = 'public.availability_week_mark'::regclass and x.grantee = 'anon'::regrole) = 0
    then 'PASS' else 'FAIL' end

  union all select 6, '★ availability_week 沒有 UPDATE 授權給 authenticated', '0 筆',
    (select count(*) from pg_class c, aclexplode(c.relacl) x
      where c.oid = 'public.availability_week'::regclass and x.grantee = 'authenticated'::regrole
        and x.privilege_type = 'UPDATE')::text || ' 筆',
    case when (select count(*) from pg_class c, aclexplode(c.relacl) x
                where c.oid = 'public.availability_week'::regclass and x.grantee = 'authenticated'::regrole
                  and x.privilege_type = 'UPDATE') = 0
    then 'PASS' else 'FAIL' end

  union all select 7, '★ availability_week_mark 沒有 UPDATE 授權給 authenticated', '0 筆',
    (select count(*) from pg_class c, aclexplode(c.relacl) x
      where c.oid = 'public.availability_week_mark'::regclass and x.grantee = 'authenticated'::regrole
        and x.privilege_type = 'UPDATE')::text || ' 筆',
    case when (select count(*) from pg_class c, aclexplode(c.relacl) x
                where c.oid = 'public.availability_week_mark'::regclass and x.grantee = 'authenticated'::regrole
                  and x.privilege_type = 'UPDATE') = 0
    then 'PASS' else 'FAIL' end

  -- ↓ 對照。沒有它，上面兩條在「這張表整個沒發權限」的時候也會通過，
  --   而那時候看板整個是壞的，不是安全的。
  union all select 8, '【對照】authenticated 對 availability_week 有 SELECT/INSERT/DELETE', '3 種',
    (select count(distinct x.privilege_type) from pg_class c, aclexplode(c.relacl) x
      where c.oid = 'public.availability_week'::regclass and x.grantee = 'authenticated'::regrole
        and x.privilege_type in ('SELECT','INSERT','DELETE'))::text || ' 種',
    case when (select count(distinct x.privilege_type) from pg_class c, aclexplode(c.relacl) x
                where c.oid = 'public.availability_week'::regclass and x.grantee = 'authenticated'::regrole
                  and x.privilege_type in ('SELECT','INSERT','DELETE')) = 3
    then 'PASS' else 'FAIL' end

  union all select 9, '【對照】authenticated 對 availability_week_mark 有 SELECT/INSERT/DELETE', '3 種',
    (select count(distinct x.privilege_type) from pg_class c, aclexplode(c.relacl) x
      where c.oid = 'public.availability_week_mark'::regclass and x.grantee = 'authenticated'::regrole
        and x.privilege_type in ('SELECT','INSERT','DELETE'))::text || ' 種',
    case when (select count(distinct x.privilege_type) from pg_class c, aclexplode(c.relacl) x
                where c.oid = 'public.availability_week_mark'::regclass and x.grantee = 'authenticated'::regrole
                  and x.privilege_type in ('SELECT','INSERT','DELETE')) = 3
    then 'PASS' else 'FAIL' end

  union all select 10, 'availability_week 的政策數量是 3（read/insert/delete）', '3 條',
    (select count(*) from pg_policies where schemaname = 'public' and tablename = 'availability_week')::text || ' 條',
    case when (select count(*) from pg_policies where schemaname = 'public' and tablename = 'availability_week') = 3
    then 'PASS' else 'FAIL' end

  union all select 11, 'availability_week_mark 的政策數量是 3（read/insert/delete）', '3 條',
    (select count(*) from pg_policies where schemaname = 'public' and tablename = 'availability_week_mark')::text
      || ' 條',
    case when (select count(*) from pg_policies where schemaname = 'public' and tablename = 'availability_week_mark')
          = 3
    then 'PASS' else 'FAIL' end

  union all select 12, '★ availability_week 主鍵欄位順序是 user_id,week_start,weekday,minute',
    'user_id,week_start,weekday,minute',
    coalesce((select cols from pk_week), '（查不到）'),
    case when (select cols from pk_week) = 'user_id,week_start,weekday,minute' then 'PASS' else 'FAIL' end

  union all select 13, '★ availability_week_mark 主鍵欄位順序是 user_id,week_start', 'user_id,week_start',
    coalesce((select cols from pk_mark), '（查不到）'),
    case when (select cols from pk_mark) = 'user_id,week_start' then 'PASS' else 'FAIL' end

  union all select 14, '★ availability_week 讀取政策問的是 is_cadre()', '1 條',
    (select count(*) from pg_policies where schemaname = 'public' and tablename = 'availability_week'
      and policyname = 'availability_week_read' and qual like '%is_cadre%')::text || ' 條',
    case when (select count(*) from pg_policies where schemaname = 'public' and tablename = 'availability_week'
                and policyname = 'availability_week_read' and qual like '%is_cadre%') = 1
    then 'PASS' else 'FAIL' end

  union all select 15, '★ availability_week_mark 讀取政策問的是 is_cadre()', '1 條',
    (select count(*) from pg_policies where schemaname = 'public' and tablename = 'availability_week_mark'
      and policyname = 'availability_week_mark_read' and qual like '%is_cadre%')::text || ' 條',
    case when (select count(*) from pg_policies where schemaname = 'public' and tablename = 'availability_week_mark'
                and policyname = 'availability_week_mark_read' and qual like '%is_cadre%') = 1
    then 'PASS' else 'FAIL' end

  union all select 16, '★ availability_week 的 insert 政策同時檢查 auth.uid()=user_id 與 is_cadre()', 'true',
    coalesce((select (with_check like '%auth.uid()%') and (with_check like '%user_id%')
                and (with_check like '%is_cadre%') from pol_week_insert)::text, '（查不到政策）'),
    coalesce((select case when (with_check like '%auth.uid()%') and (with_check like '%user_id%')
                           and (with_check like '%is_cadre%') then 'PASS' else 'FAIL' end
               from pol_week_insert), 'FAIL')

  union all select 17, '★ availability_week 的 delete 政策同時檢查 auth.uid()=user_id 與 is_cadre()', 'true',
    coalesce((select (qual like '%auth.uid()%') and (qual like '%user_id%') and (qual like '%is_cadre%')
               from pol_week_delete)::text, '（查不到政策）'),
    coalesce((select case when (qual like '%auth.uid()%') and (qual like '%user_id%') and (qual like '%is_cadre%')
                           then 'PASS' else 'FAIL' end
               from pol_week_delete), 'FAIL')

  union all select 18, '★ availability_week_mark 的 insert 政策同時檢查 auth.uid()=user_id 與 is_cadre()', 'true',
    coalesce((select (with_check like '%auth.uid()%') and (with_check like '%user_id%')
                and (with_check like '%is_cadre%') from pol_mark_insert)::text, '（查不到政策）'),
    coalesce((select case when (with_check like '%auth.uid()%') and (with_check like '%user_id%')
                           and (with_check like '%is_cadre%') then 'PASS' else 'FAIL' end
               from pol_mark_insert), 'FAIL')

  union all select 19, '★ availability_week_mark 的 delete 政策同時檢查 auth.uid()=user_id 與 is_cadre()', 'true',
    coalesce((select (qual like '%auth.uid()%') and (qual like '%user_id%') and (qual like '%is_cadre%')
               from pol_mark_delete)::text, '（查不到政策）'),
    coalesce((select case when (qual like '%auth.uid()%') and (qual like '%user_id%') and (qual like '%is_cadre%')
                           then 'PASS' else 'FAIL' end
               from pol_mark_delete), 'FAIL')
) x order by ord;

-- ============================================================================
-- 跑完之後
-- ============================================================================
-- 兩張表都是空的，那是對的：這一支只建結構，不寫任何一列。
-- 看板讀寫某一週例外的判斷邏輯（「有 mark 就只看 availability_week」）
-- 屬於前端，不在這支遷移檔的範圍內，見時間看板：某一週的例外那份規格。
