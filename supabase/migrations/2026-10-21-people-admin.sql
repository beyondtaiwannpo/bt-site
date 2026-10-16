-- 人與權限的後台：改職位留紀錄、team 的守門、Co-President 改幹部的 team　2026-10-21
--
-- 用法：整份貼進 Supabase SQL Editor 按一次 Run。最後印出 PASS / FAIL 表。
-- **要先跑過 2026-09-08-students.sql**（is_president()、set_board_role() 在那一支）。
-- 可以重複執行。
--
-- ============================================================================
-- 這一支在做什麼（Paul 2026-10-15 拍板第 2、3 題，docs/2026-10-15-後台重整盤點與設計.md）
-- ============================================================================
-- 盤點抓到一個現在就存在的洞：後台的權限是 board_role 加 team 兩個欄位一起算的
-- （is_director_of() 看「你是 director 而且 team 對得上」，is_internship_team() 看
-- 「你的 team 字串裡有沒有 Internship Team」），而 team 是本人在 /settings/ 隨時改得動的。
-- 一位 Director 把自己勾到別的 team，就能審那個 team 的申請；任何幹部把自己勾進
-- Internship Team，就能改實習護照的格子。
--
-- 三件事：
--   1. role_changes 表：誰改了誰的職位或 team、從什麼到什麼、什麼時候。只有 Co-President 讀得到。
--      改職位不做雙人核可（第 3 題選甲）：一位就能改，但另一位登入後台就看得到。
--   2. privileged_teams 表：哪幾個 team 一勾就會長出權限（現在只有 Internship Team）。
--      列在表裡不寫死在程式，之後 Curriculum Team 接護照活動時加一列就好。
--   3. 一條 trigger 守 profiles.team：
--      - board_role 是 director 或 president 的人，team 只能走 set_team()（Co-President 在後台改）。
--      - 一般幹部仍然自己勾，但勾進 privileged_teams 裡的 team 要走 set_team()。
--      - set_team() 與 set_board_role() 每一筆都寫進 role_changes。
--
-- ============================================================================
-- 這一支「不做」什麼
-- ============================================================================
--   不改 role（cadre / student / alumni / intern）：那只走邀請碼，每一次變動都對得回 invite_uses。
--   不改 is_director_of() 與 is_internship_team()：它們看 team 的邏輯沒變，變的是 team 誰改得動。
--   不加雙人核可，不寄信，不做站內通知：role_changes 是帳本，不是通知。
--   不擋 Co-President 把另一位 Co-President 降級：換屆要用。自我降級本來就擋著（2026-09-08）。
begin;

-- ---------- 0. 共用的門 ----------
-- 2026-10-20-passport-admin.sql 也建過同一支；這裡再寫一次是讓這一支可以單獨跑。
create or replace function public.require_president()
returns void language plpgsql
set search_path = public, pg_temp
as $$
begin
  if not public.is_president() then
    raise exception 'not_president' using errcode = 'P0001';
  end if;
end $$;
revoke all on function public.require_president() from public, anon, authenticated;

-- ---------- 1. 變動紀錄 ----------
-- target_name 存當時的名字：那個人之後刪了帳號，紀錄還看得出來是誰。
create table if not exists public.role_changes (
  id          bigserial primary key,
  changed_by  uuid references public.profiles(id) on delete set null,
  target      uuid references public.profiles(id) on delete set null,
  target_name text,
  field       text not null check (field in ('board_role', 'team')),
  old_value   text,
  new_value   text,
  created_at  timestamptz not null default now()
);
comment on table public.role_changes is
  '誰改了誰的職位或 team。只有 Co-President 讀得到，只有 set_board_role() 與 set_team() 寫得進去。
   這是帳本不是通知：兩位 Co-President 其中一位改了什麼，另一位登入後台就看得到。';
alter table public.role_changes enable row level security;
drop policy if exists role_changes_read on public.role_changes;
create policy role_changes_read on public.role_changes
  for select to authenticated using (public.is_president());
revoke all on public.role_changes from anon, authenticated;
grant select on public.role_changes to authenticated;
-- 沒有 insert / update / delete 的授權：只有下面兩支 security definer 函式寫得進去。

create or replace function public.log_role_change(
  p_target uuid, p_field text, p_old text, p_new text)
returns void language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  insert into role_changes (changed_by, target, target_name, field, old_value, new_value)
  select auth.uid(), p_target, coalesce(nullif(p.name_zh, ''), p.name_en), p_field, p_old, p_new
    from profiles p where p.id = p_target;
end $$;
revoke all on function public.log_role_change(uuid, text, text, text) from public, anon, authenticated;

-- ---------- 2. 會長出權限的 team ----------
create table if not exists public.privileged_teams (
  name text primary key,
  note text
);
comment on table public.privileged_teams is
  '一勾就會長出後台權限的 team。一般幹部勾這幾個要 Co-President 在後台改（trigger 擋著）。
   之後某個 team 接了後台的功能（例如 Curriculum Team 接護照活動）就加一列，程式不用改。';
insert into public.privileged_teams (name, note)
  values ('Internship Team', '改得動實習護照的格子與屆別（is_internship_team）')
  on conflict (name) do nothing;
alter table public.privileged_teams enable row level security;
drop policy if exists privileged_teams_read on public.privileged_teams;
create policy privileged_teams_read on public.privileged_teams
  for select to authenticated using (true);
revoke all on public.privileged_teams from anon, authenticated;
grant select on public.privileged_teams to authenticated;

-- ---------- 3. 改職位：原本那支加紀錄 ----------
-- 原本的三道門一個都沒拿掉：不是 president 不能叫、不能把自己降級、只發給幹部。
-- 沒有變化就不寫紀錄（同一個值存兩次不是一筆變動）。
create or replace function public.set_board_role(p_target uuid, p_role text)
returns text language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_old text;
begin
  perform public.require_president();
  if p_role not in ('member', 'director', 'president') then
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

-- ---------- 4. Co-President 改幹部的 team ----------
-- 這是 Director、Co-President 與「要勾進會長出權限的 team」唯一的一條路。
-- 先在這個交易裡立一面旗子，下面那條 trigger 看到旗子就放行；旗子是交易內的（第三個參數 true），
-- 交易結束自動消失，別人的 session 看不到。
create or replace function public.set_team(p_target uuid, p_team text)
returns text language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_old text;
  v_new text := nullif(btrim(coalesce(p_team, '')), '');
begin
  perform public.require_president();
  select team into v_old from profiles where id = p_target and role = 'cadre';
  if not found then
    raise exception 'not_a_cadre' using errcode = 'P0001';
  end if;
  if v_old is not distinct from v_new then
    return coalesce(v_new, '');
  end if;
  perform set_config('bt.team_via_function', '1', true);
  update profiles set team = v_new where id = p_target;
  perform public.log_role_change(p_target, 'team', v_old, v_new);
  return coalesce(v_new, '');
end $$;
revoke all on function public.set_team(uuid, text) from public, anon;
grant execute on function public.set_team(uuid, text) to authenticated;

-- ---------- 5. 守 profiles.team 的 trigger ----------
-- 本人在 /settings/ 存檔會走到這裡。沒有改 team 就直接放行（名字、大頭照照常存）。
-- security definer：要讀 privileged_teams，而這條會以存檔那個人的身分跑。
create or replace function public.guard_profile_team()
returns trigger language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if new.team is not distinct from old.team then
    return new;
  end if;
  if current_setting('bt.team_via_function', true) = '1' then
    return new;
  end if;
  if old.board_role in ('director', 'president') then
    raise exception 'team_locked' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from privileged_teams p
     where position(p.name in coalesce(new.team, '')) > 0
       and position(p.name in coalesce(old.team, '')) = 0
  ) then
    raise exception 'team_needs_president' using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke all on function public.guard_profile_team() from public, anon, authenticated;
drop trigger if exists guard_profile_team on public.profiles;
create trigger guard_profile_team
  before update of team on public.profiles
  for each row execute function public.guard_profile_team();

commit;

-- ============================================================================
-- 驗收。全部 PASS 才算跑完。
-- ============================================================================
select * from (
  with fn as (
    select proname, prosecdef, proconfig, proacl,
           regexp_replace(prosrc, '--[^\n]*', '', 'g') as body
      from pg_proc
     where proname in ('set_board_role', 'set_team')
  ), gated as (
    select count(*) as n from fn where body like '%perform public.require_president();%'
  ), logged as (
    select count(*) as n from fn where body like '%perform public.log_role_change(%'
  ), secdef as (
    select count(*) as n from fn where prosecdef
       and coalesce(array_to_string(proconfig, ','), '') like '%search_path=%public%'
  ), anon_n as (
    select count(*) as n from fn f, aclexplode(f.proacl) x
     where x.grantee in (0::regrole, 'anon'::regrole) and x.privilege_type = 'EXECUTE'
  ), auth_n as (
    select count(*) as n from fn f, aclexplode(f.proacl) x
     where x.grantee = 'authenticated'::regrole and x.privilege_type = 'EXECUTE'
  ), log_w as (
    select count(*) as n from information_schema.role_table_grants
     where table_schema = 'public' and table_name in ('role_changes', 'privileged_teams')
       and grantee in ('anon','authenticated') and privilege_type in ('INSERT','UPDATE','DELETE')
  ), log_pol as (
    select count(*) as n from pg_policies
     where schemaname = 'public' and tablename = 'role_changes' and cmd = 'SELECT'
       and qual like '%is_president()%'
  ), trg as (
    select count(*) as n from pg_trigger t join pg_class c on c.oid = t.tgrelid
     where c.relname = 'profiles' and t.tgname = 'guard_profile_team' and not t.tgisinternal
  ), trg_body as (
    select regexp_replace(prosrc, '--[^\n]*', '', 'g') as body from pg_proc where proname = 'guard_profile_team'
  ), priv as (
    select count(*) as n from public.privileged_teams where name = 'Internship Team'
  )
  select 0 ord, 'OVERALL' as 項目, null::text as 應該是, null::text as 實際是,
    case when (select count(*) from fn) = 2 and (select n from gated) = 2 and (select n from logged) = 2
      and (select n from secdef) = 2 and (select n from anon_n) = 0 and (select n from auth_n) = 2
      and (select n from log_w) = 0 and (select n from log_pol) = 1 and (select n from trg) = 1
      and (select body from trg_body) like '%team_locked%'
      and (select body from trg_body) like '%team_needs_president%'
      and (select body from fn where proname = 'set_board_role') like '%cannot_demote_self%'
      and (select n from priv) = 1
    then 'PASS' else 'FAIL' end as 結果
  union all select 1, '兩支函式都在', '2', (select count(*) from fn)::text,
    case when (select count(*) from fn) = 2 then 'PASS' else 'FAIL' end
  union all select 2, '★ 兩支第一句都是 Co-President 的門', '2', (select n from gated)::text,
    case when (select n from gated) = 2 then 'PASS' else 'FAIL' end
  union all select 3, '★ 兩支都寫紀錄', '2', (select n from logged)::text,
    case when (select n from logged) = 2 then 'PASS' else 'FAIL' end
  union all select 4, '兩支都是 security definer 而且 search_path 釘死', '2', (select n from secdef)::text,
    case when (select n from secdef) = 2 then 'PASS' else 'FAIL' end
  union all select 5, '★ 沒登入叫不動', '0', (select n from anon_n)::text,
    case when (select n from anon_n) = 0 then 'PASS' else 'FAIL' end
  union all select 6, '登入的人叫得動（門在裡面）', '2', (select n from auth_n)::text,
    case when (select n from auth_n) = 2 then 'PASS' else 'FAIL' end
  union all select 7, '★ 紀錄表與 team 清單對前端沒有寫入權限', '0', (select n from log_w)::text,
    case when (select n from log_w) = 0 then 'PASS' else 'FAIL' end
  union all select 8, '★ 紀錄只有 Co-President 讀得到', '1', (select n from log_pol)::text,
    case when (select n from log_pol) = 1 then 'PASS' else 'FAIL' end
  union all select 9, '★ profiles.team 上有守門的 trigger', '1', (select n from trg)::text,
    case when (select n from trg) = 1 then 'PASS' else 'FAIL' end
  union all select 10, '★ trigger 擋 Director 自改 team、擋一般幹部自勾會長出權限的 team', 'true',
    ((select body from trg_body) like '%team_locked%' and (select body from trg_body) like '%team_needs_president%')::text,
    case when (select body from trg_body) like '%team_locked%' and (select body from trg_body) like '%team_needs_president%' then 'PASS' else 'FAIL' end
  union all select 11, '★ 自我降級仍然擋著', 'true',
    ((select body from fn where proname = 'set_board_role') like '%cannot_demote_self%')::text,
    case when (select body from fn where proname = 'set_board_role') like '%cannot_demote_self%' then 'PASS' else 'FAIL' end
  union all select 12, 'Internship Team 在會長出權限的清單裡', '1', (select n from priv)::text,
    case when (select n from priv) = 1 then 'PASS' else 'FAIL' end
) t order by ord;
