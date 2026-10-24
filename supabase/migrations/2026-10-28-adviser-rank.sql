-- 第五個職級：Adviser　2026-10-28
--
-- 用法：整份貼進 Supabase SQL Editor 按一次 Run。可以重跑。最後印一張 PASS / FAIL 表。
-- **要先跑過 2026-10-27-public-names-english.sql**（順序照日期，這一支排在它後面）。
--
-- Paul 2026-10-24 定的：
--   Senior Adviser 是資深的老成員，不屬於哪一個 team，範圍跟 Co-President 一樣（除了加人、刪人、改名、改職級）。這一級不動。
--   Adviser 是跟著某一個 team 的顧問，**職級本身不帶任何權限**，跟 Director、Associate 一樣看指派。
--
-- ============================================================================
-- 這一支在做什麼（只有兩件）
-- ============================================================================
--   1. profiles.board_role 的 check 從四個值放成五個：member、adviser、director、senior_adviser、president。
--   2. set_board_role() 接受 'adviser'。本文跟 2026-10-24 那一支一字不差，只有那一行的清單多一個值。
--
-- 刻意不動的：is_senior() / require_senior()（adviser **不是** senior，驗收表第 3 項守著）、
-- my_access()、roster()、end_term()（換屆時 adviser 跟 director 一樣歸 member）、對外兩頁的函式（頭銜從職位來，跟職級無關）。
--
-- ⚠ 2026-10-24 那一支已經同步改成五個值（重跑它不會把這一支蓋回去）。
--   但重跑 2026-10-21-people-admin.sql 會把 set_board_role 建回三個值的版本，那時要再跑 10-24 與這一支。
-- ============================================================================

begin;

alter table public.profiles drop constraint if exists profiles_board_role_check;
alter table public.profiles add constraint profiles_board_role_check
  check (board_role in ('member', 'adviser', 'director', 'senior_adviser', 'president'));
comment on column public.profiles.board_role is
  '幹部裡的職級：member（畫面叫 Associate）、adviser（跟著一個 team 的顧問）、director、senior_adviser、president。
   2026-10-24 起 director、adviser 與 member 自己不帶任何權限，權限看 assignments。只有 set_board_role() 改得動。';

create or replace function public.set_board_role(p_target uuid, p_role text)
returns text language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_old text;
begin
  perform public.require_president();
  if p_role not in ('member', 'adviser', 'director', 'senior_adviser', 'president') then
    raise exception 'bad_role' using errcode = 'P0001';
  end if;
  if p_target = auth.uid() and p_role <> 'president' then
    raise exception 'cannot_demote_self' using errcode = 'P0001';
  end if;
  select board_role into v_old from profiles where id = p_target and role = 'cadre';
  if v_old is null then
    raise exception 'not_a_cadre' using errcode = 'P0001';
  end if;
  if v_old = p_role then
    return p_role;
  end if;
  update profiles set board_role = p_role where id = p_target;
  perform public.log_role_change(p_target, 'board_role', v_old, p_role);
  return p_role;
end $$;
revoke all on function public.set_board_role(uuid, text) from public, anon;
grant execute on function public.set_board_role(uuid, text) to authenticated;

commit;

select * from (
  with con as (
    select pg_get_constraintdef(oid) as def from pg_constraint where conname = 'profiles_board_role_check'
  ), sbr as (
    select regexp_replace(prosrc, '--[^\n]*', '', 'g') as body, prosecdef
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'set_board_role'
  ), sen as (
    select regexp_replace(prosrc, '--[^\n]*', '', 'g') as body
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'is_senior'
  ), bad as (
    select count(*) as n from public.profiles
     where board_role is not null and board_role not in ('member', 'adviser', 'director', 'senior_adviser', 'president')
  )
  select 0 ord, 'OVERALL' as 項目, null::text as 應該是, null::text as 實際是,
    case when (select count(*) from con) = 1 and (select def from con) like '%''adviser''%'
          and (select count(*) from sbr) = 1 and (select prosecdef from sbr)
          and (select body from sbr) like '%''adviser''%' and (select body from sbr) like '%require_president()%'
          and (select count(*) from sen) = 1 and (select body from sen) not like '%''adviser''%'
          and (select n from bad) = 0
    then 'PASS' else 'FAIL' end as 結果
  union all select 1, '★ board_role 的 check 有五個值（含 adviser）', 'true',
    coalesce((select (def like '%''adviser''%' and def like '%''senior_adviser''%')::text from con), '（沒有這條 check）'),
    coalesce((select case when def like '%''adviser''%' and def like '%''senior_adviser''%' then 'PASS' end from con), 'FAIL')
  union all select 2, '★ set_board_role 接受 adviser，而且第一句還是 require_president', 'true',
    coalesce((select (body like '%''adviser''%' and body like '%require_president()%')::text from sbr), '（函式不存在）'),
    coalesce((select case when body like '%''adviser''%' and body like '%require_president()%' then 'PASS' end from sbr), 'FAIL')
  union all select 3, '★ is_senior 沒有 adviser（Adviser 不是 senior，權限看指派）', 'true',
    coalesce((select (body not like '%''adviser''%')::text from sen), '（函式不存在）'),
    coalesce((select case when body not like '%''adviser''%' then 'PASS' end from sen), 'FAIL')
  union all select 4, '既有幹部的職級都在五個值裡', '0', (select n from bad)::text, case when (select n from bad) = 0 then 'PASS' else 'FAIL' end
) t order by ord;
