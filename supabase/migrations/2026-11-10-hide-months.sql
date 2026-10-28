-- 護照可以藏掉某幾個月。　2026-11-10
--
-- 用法：整份貼進 Supabase SQL Editor 按一次 Run。最後印出 PASS / FAIL 表。
-- **先跑 2026-11-09-marketing-requests-v2.sql**（順序照日期；這一支用到 2026-10-24 的 require_ws_edit()）。
--
-- ============================================================================
-- 這一支在做什麼
-- ============================================================================
-- Paul 2026-11-08：「這一屆的幹部護照從十一月開始，九月跟十月那兩頁藏起來」。
-- 這一屆的護照是十月底才真的發出去，九月、十月那兩頁空著只會讓人以為自己漏了什麼。
--
--   1. months 多一欄 hidden（預設 false）。藏起來的月份：護照上沒有那一頁、
--      那個月的格子不算進「N / 總數」、全體進度那一條沒有那一格、入境章不發、
--      台北那一枚（TPE）改給第一個沒藏的月份。
--   2. **只有第一次加這一欄的時候**把九月、十月設成藏起來。之後重跑不會再改，
--      所以明年有人在後台把九月打開，重跑這一支不會把它又藏回去。
--   3. set_month_hidden(月份, true/false)：後台「幹部護照」每個月旁邊一顆鈕。
--      誰能按：跟改格子同一道門，passport 工作區「改」以上（Co-President 與 Senior Adviser 本來就有）。
--
-- 藏起來不刪任何東西：那個月的格子、已經蓋的章、心得、照片、入境章全部留著，打開就回來。

begin;

do $$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'months' and column_name = 'hidden') then
    alter table public.months add column hidden boolean not null default false;
    update public.months set hidden = true where month in (9, 10);
  end if;
end $$;

create or replace function public.set_month_hidden(p_month int, p_hidden boolean)
returns void language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  perform public.require_ws_edit('passport');
  update months set hidden = coalesce(p_hidden, false) where month = p_month;
  if not found then
    raise exception 'bad_month' using errcode = 'P0001';
  end if;
end $$;

revoke all on function public.set_month_hidden(int, boolean) from public, anon;
grant execute on function public.set_month_hidden(int, boolean) to authenticated;

commit;

-- ---------- 驗收 ----------
select * from (
  with f as (
    select regexp_replace(prosrc, '--[^\n]*', '', 'g') as body, prosecdef, proconfig
      from pg_proc where proname = 'set_month_hidden'
  ), g as (
    select
      exists (select 1 from information_schema.columns
               where table_schema = 'public' and table_name = 'months' and column_name = 'hidden') as col,
      (select count(*) from f) = 1 and coalesce((select prosecdef from f), false)
        and coalesce((select array_to_string(proconfig, ',') from f), '') like '%search_path=%public%' as defs,
      coalesce((select body from f), '') like '%perform public.require_ws_edit(''passport'')%' as gate,
      (select count(*) from pg_proc p, aclexplode(p.proacl) x
        where p.proname = 'set_month_hidden' and x.grantee in (0::regrole, 'anon'::regrole) and x.privilege_type = 'EXECUTE') as anon_n,
      (select count(*) from pg_proc p, aclexplode(p.proacl) x
        where p.proname = 'set_month_hidden' and x.grantee = 'authenticated'::regrole and x.privilege_type = 'EXECUTE') as auth_n,
      (select count(*) from months) as months_n
  )
  select 0 ord, 'OVERALL' as 項目, null::text as 應該是, null::text as 實際是,
    case when col and defs and gate and anon_n = 0 and auth_n = 1 and months_n = 11 then 'PASS' else 'FAIL' end as 結果 from g
  union all select 1, 'months 有 hidden 這一欄', 'true', col::text, case when col then 'PASS' else 'FAIL' end from g
  union all select 2, 'set_month_hidden 在、是 security definer、search_path 釘死', 'true', defs::text, case when defs then 'PASS' else 'FAIL' end from g
  union all select 3, '★ 第一件事是確認 passport 工作區「改」以上', 'true', gate::text, case when gate then 'PASS' else 'FAIL' end from g
  union all select 4, '★ 沒登入叫不動', '0 筆', anon_n::text || ' 筆', case when anon_n = 0 then 'PASS' else 'FAIL' end from g
  union all select 5, '【對照】登入的人叫得到（門在函式裡）', '1 筆', auth_n::text || ' 筆', case when auth_n = 1 then 'PASS' else 'FAIL' end from g
  union all select 6, '月份還是 11 個（藏不是刪）', '11', months_n::text, case when months_n = 11 then 'PASS' else 'FAIL' end from g
  -- 這一條只是告訴你現在藏了哪幾個月，不算 PASS / FAIL：第一次跑完應該是 9,10。
  union all select 7, '現在藏起來的月份（第一次跑完應該是 9,10）', '9,10',
    coalesce((select string_agg(month::text, ',' order by seq) from months where hidden), '沒有'), '看一眼' from g
) t order by ord;
