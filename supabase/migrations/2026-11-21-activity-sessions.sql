-- 護照的一格可以有好幾場　2026-11-21
--
-- 用法：整份貼進 Supabase SQL Editor 按一次 Run。可以重跑。最後印一張 PASS / FAIL 表。
-- **要先跑過 2026-11-15-box-time-and-example.sql**（happens_at 那一欄在那一支）。
--
-- Paul 2026-10-28：「同一個聚會有兩場，我需要放兩個時間。」
--
-- ============================================================================
-- 這一支在做什麼
-- ============================================================================
--   1. activities 多一欄 sessions（時間的陣列，可以是空的）。最多 10 場。
--   2. 原本 happens_at 有填的格子，那個時間搬進 sessions 當第 1 場。只在 sessions 還是空的時候搬，重跑不會重複。
--   3. 新函式 set_activity_sessions(格子, 時間陣列)：要有 passport 工作區「改」以上。
--      存之前排好順序、拿掉重複的、拿掉空的。happens_at 跟著改成第 1 場（還沒更新的舊頁面照樣讀得到一個時間）。
--   happens_at 那一欄留著不刪。RLS、權限政策都不動。
-- ============================================================================

begin;

alter table public.activities add column if not exists sessions timestamptz[] not null default '{}';

update public.activities set sessions = array[happens_at]
 where happens_at is not null and cardinality(sessions) = 0;

create or replace function public.set_activity_sessions(p_id text, p_times timestamptz[])
returns text language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v timestamptz[];
begin
  perform public.require_ws_edit('passport');
  select coalesce(array_agg(t order by t), '{}') into v
    from (select distinct t from unnest(coalesce(p_times, '{}'::timestamptz[])) t where t is not null) x;
  if cardinality(v) > 10 then raise exception 'too_many_sessions' using errcode = 'P0001'; end if;
  update activities set sessions = v, happens_at = v[1] where id = p_id;
  if not found then raise exception 'no_such_activity' using errcode = 'P0001'; end if;
  return p_id;
end $$;
revoke all on function public.set_activity_sessions(text, timestamptz[]) from public, anon;
grant execute on function public.set_activity_sessions(text, timestamptz[]) to authenticated;

commit;

-- ---------- 驗收 ----------
select * from (
  with f as (
    select regexp_replace(prosrc, '--[^\n]*', '', 'g') as body, prosecdef, proconfig
      from pg_proc where proname = 'set_activity_sessions' and pronamespace = 'public'::regnamespace
  ), s as (
    select
      (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'activities' and column_name = 'sessions') as cols,
      (select count(*) from f) = 1 and coalesce((select prosecdef from f), false)
        and coalesce((select array_to_string(proconfig, ',') from f), '') like '%search_path=%public%' as defs,
      coalesce((select body from f), '') like '%perform public.require_ws_edit(''passport'')%' as gate,
      coalesce((select body from f), '') like '%too_many_sessions%' as cap,
      (select count(*) from pg_proc p, aclexplode(p.proacl) x
        where p.proname = 'set_activity_sessions' and x.grantee in (0::regrole, 'anon'::regrole) and x.privilege_type = 'EXECUTE') as anon_n,
      (select count(*) from public.activities where happens_at is not null and not (happens_at = any(sessions))) as lost
  )
  select 0 ord, 'OVERALL' as 項目, null::text as 應該是, null::text as 實際是,
    case when cols = 1 and defs and gate and cap and anon_n = 0 and lost = 0 then 'PASS' else 'FAIL' end as 結果 from s
  union all select 1, 'activities 有 sessions', '1', cols::text, case when cols = 1 then 'PASS' else 'FAIL' end from s
  union all select 2, 'set_activity_sessions 在、是 security definer、search_path 釘死', 'true', defs::text, case when defs then 'PASS' else 'FAIL' end from s
  union all select 3, '★ 第一件事是確認 passport 工作區「改」以上', 'true', gate::text, case when gate then 'PASS' else 'FAIL' end from s
  union all select 4, '最多 10 場', 'true', cap::text, case when cap then 'PASS' else 'FAIL' end from s
  union all select 5, '★ 沒登入叫不動', '0 筆', anon_n::text || ' 筆', case when anon_n = 0 then 'PASS' else 'FAIL' end from s
  union all select 6, '★ 原本的時間都搬進來了（沒有搬丟的）', '0 格', lost::text || ' 格', case when lost = 0 then 'PASS' else 'FAIL' end from s
) t order by ord;
