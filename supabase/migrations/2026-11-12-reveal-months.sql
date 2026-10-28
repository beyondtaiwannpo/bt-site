-- 護照一個月一個月揭曉。　2026-11-12
--
-- 用法：整份貼進 Supabase SQL Editor 按一次 Run。最後印出 PASS / FAIL 表。
-- **先跑 2026-11-11-fix-mail-send.sql**（順序照日期；這一支用到 2026-10-24 的 require_ws_edit()）。
--
-- ============================================================================
-- 這一支在做什麼
-- ============================================================================
-- Paul 2026-10-28：「一個月一個月揭曉。現在是十一月，還沒揭曉的月份蓋起來，
-- 寫『在群組公布之後才會打開』，讓整件事多一點驚喜。」
--
--   1. months 多一欄 revealed（預設 false）。還沒揭曉的月份：護照上那一頁還在，
--      但內容蓋起來（看不到主題與格子）；那個月的格子不算進「N / 總數」、
--      全體進度那一條沒有那一格、入境章不發。
--   2. **只有第一次加這一欄的時候**把九月、十月、十一月設成已揭曉（九、十月本來就藏起來了）。
--      之後重跑不會再改，所以已經揭曉的不會被蓋回去，還沒揭曉的也不會被打開。
--   3. set_month_revealed(月份, true/false)：後台「幹部護照」每個月旁邊一顆「揭曉」鈕。
--      誰能按：跟改格子、藏月份同一道門，passport 工作區「改」以上。
--
-- 蓋起來不刪任何東西。跟「藏起來」的差別：藏起來是那一頁整個不見；蓋起來是那一頁在，只是還不能翻開。
-- ⚠ 蓋起來是畫面上的驚喜，不是保密：幹部讀得到 activities 表，懂得叫 API 的人看得到題目。

begin;

do $$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'months' and column_name = 'revealed') then
    alter table public.months add column revealed boolean not null default false;
    update public.months set revealed = true where month in (9, 10, 11);
  end if;
end $$;

create or replace function public.set_month_revealed(p_month int, p_revealed boolean)
returns void language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  perform public.require_ws_edit('passport');
  update months set revealed = coalesce(p_revealed, false) where month = p_month;
  if not found then
    raise exception 'bad_month' using errcode = 'P0001';
  end if;
end $$;

revoke all on function public.set_month_revealed(int, boolean) from public, anon;
grant execute on function public.set_month_revealed(int, boolean) to authenticated;

commit;

-- ---------- 驗收 ----------
select * from (
  with f as (
    select regexp_replace(prosrc, '--[^\n]*', '', 'g') as body, prosecdef, proconfig
      from pg_proc where proname = 'set_month_revealed'
  ), g as (
    select
      exists (select 1 from information_schema.columns
               where table_schema = 'public' and table_name = 'months' and column_name = 'revealed') as col,
      (select count(*) from f) = 1 and coalesce((select prosecdef from f), false)
        and coalesce((select array_to_string(proconfig, ',') from f), '') like '%search_path=%public%' as defs,
      coalesce((select body from f), '') like '%perform public.require_ws_edit(''passport'')%' as gate,
      (select count(*) from pg_proc p, aclexplode(p.proacl) x
        where p.proname = 'set_month_revealed' and x.grantee in (0::regrole, 'anon'::regrole) and x.privilege_type = 'EXECUTE') as anon_n,
      (select count(*) from pg_proc p, aclexplode(p.proacl) x
        where p.proname = 'set_month_revealed' and x.grantee = 'authenticated'::regrole and x.privilege_type = 'EXECUTE') as auth_n,
      (select count(*) from months) as months_n
  )
  select 0 ord, 'OVERALL' as 項目, null::text as 應該是, null::text as 實際是,
    case when col and defs and gate and anon_n = 0 and auth_n = 1 and months_n = 11 then 'PASS' else 'FAIL' end as 結果 from g
  union all select 1, 'months 有 revealed 這一欄', 'true', col::text, case when col then 'PASS' else 'FAIL' end from g
  union all select 2, 'set_month_revealed 在、是 security definer、search_path 釘死', 'true', defs::text, case when defs then 'PASS' else 'FAIL' end from g
  union all select 3, '★ 第一件事是確認 passport 工作區「改」以上', 'true', gate::text, case when gate then 'PASS' else 'FAIL' end from g
  union all select 4, '★ 沒登入叫不動', '0 筆', anon_n::text || ' 筆', case when anon_n = 0 then 'PASS' else 'FAIL' end from g
  union all select 5, '【對照】登入的人叫得到（門在函式裡）', '1 筆', auth_n::text || ' 筆', case when auth_n = 1 then 'PASS' else 'FAIL' end from g
  union all select 6, '月份還是 11 個', '11', months_n::text, case when months_n = 11 then 'PASS' else 'FAIL' end from g
  -- 這一條只是告訴你現在揭曉了哪幾個月，不算 PASS / FAIL：第一次跑完應該是 9,10,11。
  union all select 7, '現在揭曉的月份（第一次跑完應該是 9,10,11）', '9,10,11',
    coalesce((select string_agg(month::text, ',' order by seq) from months where revealed), '沒有'), '看一眼' from g
) t order by ord;
