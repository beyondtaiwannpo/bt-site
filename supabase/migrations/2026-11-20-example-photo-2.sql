-- 護照格子可以放第二張範例照片　2026-11-20
--
-- 用法：整份貼進 Supabase SQL Editor 按一次 Run。可以重跑。最後印一張 PASS / FAIL 表。
-- **要先跑過 2026-11-15-box-time-and-example.sql**（照片的 bucket 與第一張的欄位在那一支）。
--
-- Paul 2026-10-28：「我想要放兩張照片上去。」
--
-- ============================================================================
-- 這一支在做什麼
-- ============================================================================
--   1. activities 多一欄 example_url_2（第二張範例照片的網址，可以空著）。舊資料一筆都不動。
--   2. 新函式 set_activity_example_2(格子, 網址)：只改第二張。規矩跟第一張一樣：
--      要有 passport 工作區「改」以上；網址只收自己的 passport-examples bucket；空字串就是拿掉。
--   第一張照舊走 set_activity_extras，那支不動。RLS、bucket、權限政策都不動。
-- ============================================================================

begin;

alter table public.activities add column if not exists example_url_2 text;

create or replace function public.set_activity_example_2(p_id text, p_url text)
returns text language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_url text := nullif(btrim(coalesce(p_url, '')), '');
begin
  perform public.require_ws_edit('passport');
  if v_url is not null and v_url !~ '^https://[a-z0-9]+\.supabase\.co/storage/v1/object/public/passport-examples/[A-Za-z0-9/_.-]+$' then
    raise exception 'bad_example_url' using errcode = 'P0001';
  end if;
  update activities set example_url_2 = v_url where id = p_id;
  if not found then raise exception 'no_such_activity' using errcode = 'P0001'; end if;
  return p_id;
end $$;
revoke all on function public.set_activity_example_2(text, text) from public, anon;
grant execute on function public.set_activity_example_2(text, text) to authenticated;

commit;

-- ---------- 驗收 ----------
select * from (
  with f as (
    select regexp_replace(prosrc, '--[^\n]*', '', 'g') as body, prosecdef, proconfig
      from pg_proc where proname = 'set_activity_example_2' and pronamespace = 'public'::regnamespace
  ), s as (
    select
      (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'activities' and column_name = 'example_url_2') as cols,
      (select count(*) from f) = 1 and coalesce((select prosecdef from f), false)
        and coalesce((select array_to_string(proconfig, ',') from f), '') like '%search_path=%public%' as defs,
      coalesce((select body from f), '') like '%perform public.require_ws_edit(''passport'')%' as gate,
      coalesce((select body from f), '') like '%bad_example_url%' as url_guard,
      (select count(*) from pg_proc p, aclexplode(p.proacl) x
        where p.proname = 'set_activity_example_2' and x.grantee in (0::regrole, 'anon'::regrole) and x.privilege_type = 'EXECUTE') as anon_n
  )
  select 0 ord, 'OVERALL' as 項目, null::text as 應該是, null::text as 實際是,
    case when cols = 1 and defs and gate and url_guard and anon_n = 0 then 'PASS' else 'FAIL' end as 結果 from s
  union all select 1, 'activities 有 example_url_2', '1', cols::text, case when cols = 1 then 'PASS' else 'FAIL' end from s
  union all select 2, 'set_activity_example_2 在、是 security definer、search_path 釘死', 'true', defs::text, case when defs then 'PASS' else 'FAIL' end from s
  union all select 3, '★ 第一件事是確認 passport 工作區「改」以上', 'true', gate::text, case when gate then 'PASS' else 'FAIL' end from s
  union all select 4, '★ 照片網址只收自己的 bucket', 'true', url_guard::text, case when url_guard then 'PASS' else 'FAIL' end from s
  union all select 5, '★ 沒登入叫不動', '0 筆', anon_n::text || ' 筆', case when anon_n = 0 then 'PASS' else 'FAIL' end from s
) t order by ord;
