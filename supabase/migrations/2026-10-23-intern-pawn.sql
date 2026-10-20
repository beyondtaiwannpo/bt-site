-- 實習護照的棋子　2026-10-23
--
-- 用法：整份貼進 Supabase SQL Editor 按一次 Run。最後印出 PASS / FAIL 表。
-- **要先跑過 2026-10-22-intern-board.sql**（intern_positions() 在那一支，這裡改寫它）。
--
-- Internship team 2026-10-20：每個 intern 要像有自己的角色棋子。
-- 做法：intern_passports 多一欄 pawn（棋子的代號，八個固定選項之一，null 就用大頭照或名字第一個字），
-- 本人改得動（跟 motto 一樣只開這一欄）。intern_positions() 多回傳 pawn，
-- 別人的棋子才畫得出來（intern_passports 那一列別的 intern 本來就讀不到，走函式）。
begin;

alter table public.intern_passports add column if not exists pawn text;
alter table public.intern_passports drop constraint if exists intern_passports_pawn_check;
alter table public.intern_passports add constraint intern_passports_pawn_check
  check (pawn is null or pawn in ('meeple', 'checker', 'cat', 'bird', 'fish', 'star', 'boat', 'kite'));
comment on column public.intern_passports.pawn is
  '棋子的代號（intern-passport/src/ui.js 的 PAWNS 那八個鍵之一），null 用大頭照。本人在護照資料頁選。';

-- 只多開 pawn 這一欄，motto 那一欄的授權照舊。
grant update (pawn) on public.intern_passports to authenticated;

-- intern_positions() 多一欄 pawn。回傳的欄位變了，要先 drop 再建。
drop function if exists public.intern_positions();
create or replace function public.intern_positions()
returns table (user_id uuid, pos int, rolls int, tickets int, pawn text)
language sql stable security definer
set search_path = public, pg_temp
as $$
  select p.id, public.intern_pos(p.id, t.id),
         (select count(*) from public.intern_moves m where m.user_id = p.id and m.term = t.id)::int,
         public.intern_tickets(p.id, t.id),
         (select ip.pawn from public.intern_passports ip where ip.id = p.id)
    from public.profiles p, public.intern_terms t
   where t.active and p.role = 'intern'
     and (public.is_intern() or public.is_internship_team());
$$;
revoke all on function public.intern_positions() from public, anon;
grant execute on function public.intern_positions() to authenticated;

commit;

-- ============================================================================
-- 驗收：跑完看這張表，全部 PASS 才算。
-- ============================================================================
select 項目, 應該是, 實際是, 結果 from (
  with col as (
    select count(*) as n from information_schema.columns
     where table_schema = 'public' and table_name = 'intern_passports' and column_name = 'pawn'
  ), upd as (
    select string_agg(column_name, ',' order by column_name) as cols from information_schema.column_privileges
     where table_schema = 'public' and table_name = 'intern_passports' and grantee = 'authenticated' and privilege_type = 'UPDATE'
  ), chk as (
    select count(*) as n from pg_constraint where conname = 'intern_passports_pawn_check'
  ), fn as (
    select pg_get_functiondef(oid) as body, proacl from pg_proc where proname = 'intern_positions'
  ), anon_n as (
    select count(*) as n from fn f, aclexplode(f.proacl) x
     where x.grantee in (0::regrole, 'anon'::regrole) and x.privilege_type = 'EXECUTE'
  )
  select 0 ord, 'OVERALL' as 項目, null::text as 應該是, null::text as 實際是,
    case when (select n from col) = 1 and (select cols from upd) = 'motto,pawn' and (select n from chk) = 1
      and (select body from fn) like '%pawn%' and (select n from anon_n) = 0
    then 'PASS' else 'FAIL' end as 結果
  union all select 1, 'pawn 欄位在', '1', (select n from col)::text, case when (select n from col) = 1 then 'PASS' else 'FAIL' end
  union all select 2, '★ 前端只改得動 motto 與 pawn 兩欄', 'motto,pawn', (select cols from upd), case when (select cols from upd) = 'motto,pawn' then 'PASS' else 'FAIL' end
  union all select 3, '★ 棋子只能是那八個之一', '1', (select n from chk)::text, case when (select n from chk) = 1 then 'PASS' else 'FAIL' end
  union all select 4, 'intern_positions() 回傳 pawn', 'true', ((select body from fn) like '%pawn%')::text, case when (select body from fn) like '%pawn%' then 'PASS' else 'FAIL' end
  union all select 5, '★ 沒登入叫不動', '0', (select n from anon_n)::text, case when (select n from anon_n) = 0 then 'PASS' else 'FAIL' end
) t order by ord;
