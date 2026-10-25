-- 幹部護照：沒有 passports 那一列的幹部補一列，之後也補得回來　2026-11-04
--
-- 用法：整份貼進 Supabase SQL Editor 按一次 Run。可以重跑。最後印一張 PASS / FAIL 表。
-- 跟 11-02、11-03 互不相干，先後都可以。
--
-- 2026-10-25 Alice（Curriculum 的 Associate）在 /passport/ 填了基本資料按儲存，欄位清空、什麼都沒存。
-- 本機重現：幹部有 profiles 那一列、**沒有 passports 那一列**的時候，
--   update profiles … 影響 1 列（名字其實存進去了），update passports … 影響 0 列而且 PostgREST 不報錯，
--   接著頁面重讀，passport/src/data.js 只在 passports 那一列存在時才組出 profile，所以又回到空的申請畫面。
-- passports 那一列只有 claim_invite()（拿碼升級成幹部那一刻）會建；用別的路變成幹部的人就沒有。
--
-- ============================================================================
-- 這一支在做什麼
-- ============================================================================
--   1. 補：每一位 role = cadre 卻沒有 passports 列的人，補一列（issued 預設）。印補了幾個。
--   2. ensure_passport()：登入的幹部叫一下，自己沒有那一列就補。前端開頁與存檔時都會叫，之後不管誰怎麼變成幹部都補得回來。
--   3. 資訊：auth.users 裡有帳號、profiles 沒有那一列的人數（那是另一種壞法：存檔會影響 0 列；這一支不補，因為不知道他該是什麼身分）。
-- ============================================================================

begin;

do $$
declare n int;
begin
  insert into passports (id)
  select p.id from profiles p where p.role = 'cadre' and not exists (select 1 from passports ps where ps.id = p.id);
  get diagnostics n = row_count;
  raise notice 'backfilled % passports', n;
end $$;

create or replace function public.ensure_passport()
returns text language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = 'P0001'; end if;
  if not exists (select 1 from profiles where id = v_uid and role = 'cadre') then return 'not_cadre'; end if;
  if exists (select 1 from passports where id = v_uid) then return 'exists'; end if;
  insert into passports (id) values (v_uid) on conflict (id) do nothing;
  return 'created';
end $$;
revoke all on function public.ensure_passport() from public, anon;
grant execute on function public.ensure_passport() to authenticated;

commit;

select * from (
  with t as (
    select (select count(*) from public.profiles p where p.role = 'cadre' and not exists (select 1 from public.passports ps where ps.id = p.id)) as missing,
           (select count(*) from pg_proc where proname = 'ensure_passport') as fn,
           (select count(*) from auth.users u where not exists (select 1 from public.profiles p where p.id = u.id)) as no_profile
  )
  select 0 ord, 'OVERALL' as 項目, null::text as 應該是, null::text as 實際是, case when missing = 0 and fn = 1 then 'PASS' else 'FAIL' end as 結果 from t
  union all select 1, '★ 每一位幹部都有 passports 那一列', '0 個沒有', missing::text, case when missing = 0 then 'PASS' else 'FAIL' end from t
  union all select 2, '★ ensure_passport() 在', '1', fn::text, case when fn = 1 then 'PASS' else 'FAIL' end from t
  union all select 3, '資訊：有帳號但 profiles 沒有那一列的人數（有的話那個人存什麼都是 0 列，要另外查）', '0', no_profile::text, 'PASS' from t
) x order by ord;
