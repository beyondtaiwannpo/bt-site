-- 2027-01-24：整個 BT 的每一樣工具都是一格要派人的，加上「Senior → Internal」。
--
-- Paul 2026-11-27：「calendar, meeting, projects, forms, my passport, venues, application, records, website,
-- all of those should be a project we can assign to people… whole BT is for me to put everybody into that access」。
-- 同一天他選了：新來的幹部「Nothing until I add them」，Internal「Exactly what I have」。
--
-- 這一支做四件事：
--   1. 六個新的工作區，都是整個 BT 的（team 是空的）：
--        custom:calendar（行事曆與時間看板）、custom:meetings（會議）、custom:projects（專案與活動）、
--        custom:forms（表單）、custom:my-passport（我的護照）、custom:venues（場地）。
--      在「人與權限 → 工作區」的「整個 BT」那一欄派人，跟紀錄、對外網站一樣。
--   2. **現在的每一位幹部**（Co-President 與 Senior Adviser 以外，他們靠職級本來就有）六格都先放進去，等級「改」。
--      這樣跑完這一支沒有任何人少看到任何東西。之後新來的幹部不會自動有，要 Paul 在工作區那一頁加。
--   3. 工作區 custom:internal（Senior 那一欄的 Internal，就是「人與權限」）。
--      **被放進去的人（不管哪個等級）跟 Co-President 一樣**：is_president() 與 is_senior() 都認他。
--      所以他可以改任何人的職級、派錢、再把別人放進 Internal。這是 Paul 選的（「Exactly what I have」），名單請留得很短。
--      只有 Co-President（含 Internal 裡的人）派得了 Internal，Senior Adviser 派不了（跟錢那一格同一個形狀）。
--   4. is_internship_team() 原本寫死 board_role = 'president'，改成叫 is_president()，Internal 的人也算。
--
-- 前三格（行事曆、會議、專案、表單、我的護照、場地）**只決定側欄畫不畫與那一頁開不開**，
-- 資料表的 RLS（政策）沒動：會議、活動、表單這些資料誰讀得到，照舊是原本那幾道門。
-- 這一支沒有動任何一張表的 RLS。重跑安全（工作區 on conflict、指派 on conflict do nothing）。
-- 跑完看最下面那一張表，OVERALL 要是 PASS。

begin;

-- ---------- 1. 六個整個 BT 的工具，加 Internal ----------
do $$
declare v_owner uuid;
begin
  select id into v_owner from public.profiles where role = 'cadre' and board_role = 'president' order by updated_at limit 1;
  insert into public.workspaces (id, kind, team, title_zh, title_en, owner) values
    ('custom:calendar',    'custom', null, '行事曆（含時間看板）', 'Calendar (and availability)', v_owner),
    ('custom:meetings',    'custom', null, '會議',               'Meetings',                    v_owner),
    ('custom:projects',    'custom', null, '專案與活動',          'Projects and events',         v_owner),
    ('custom:forms',       'custom', null, '表單',               'Forms',                       v_owner),
    ('custom:my-passport', 'custom', null, '我的護照',            'My passport',                 v_owner),
    ('custom:venues',      'custom', null, '場地',               'Venues',                      v_owner),
    ('custom:internal',    'custom', null, 'Internal（人與權限）', 'Internal (people & permissions)', v_owner)
  on conflict (id) do update set active = true;
end $$;

-- ---------- 2. 現在的幹部六格都先有（不寫 Co-President 與 Senior Adviser，他們靠職級） ----------
insert into public.assignments (user_id, workspace_id, level, granted_by)
select p.id, w.id, 'edit', (select id from public.profiles where role = 'cadre' and board_role = 'president' order by updated_at limit 1)
  from public.profiles p
  cross join (values ('custom:calendar'), ('custom:meetings'), ('custom:projects'), ('custom:forms'), ('custom:my-passport'), ('custom:venues')) as w(id)
 where p.role = 'cadre' and coalesce(p.board_role, 'member') not in ('president', 'senior_adviser')
on conflict (user_id, workspace_id) do nothing;

-- ---------- 3. Internal 的人跟 Co-President 一樣 ----------
-- 在 Internal 裡（任何等級）的幹部。直接查 assignments，不經過 ws_my_level（避免繞回 is_senior）。
create or replace function public.in_internal()
returns boolean language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.assignments a join public.profiles p on p.id = a.user_id and p.role = 'cadre'
     where a.user_id = auth.uid() and a.workspace_id = 'custom:internal'
  );
$$;
revoke all on function public.in_internal() from public, anon;
grant execute on function public.in_internal() to authenticated;

create or replace function public.is_president()
returns boolean language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles
     where id = auth.uid() and role = 'cadre' and board_role = 'president'
  ) or public.in_internal();
$$;

create or replace function public.is_senior()
returns boolean language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles
     where id = auth.uid() and role = 'cadre'
       and board_role in ('president', 'senior_adviser')
  ) or public.in_internal();
$$;

create or replace function public.is_internship_team()
returns boolean language sql stable security definer
set search_path = public, pg_temp
as $$
  select public.is_president() or exists (
    select 1 from public.profiles
     where id = auth.uid() and role = 'cadre'
       and position('Internship Team' in coalesce(team, '')) > 0
  );
$$;

-- 派人與移出：Internal 跟錢一樣只有 Co-President（含 Internal 裡的人）派得了。其他照 2026-12-25-access-model.sql 原樣。
create or replace function public.assign(p_target uuid, p_ws text, p_level text)
returns text language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_old text;
begin
  if not public.can_manage(p_ws) then
    raise exception 'not_ws_manage:%', p_ws using errcode = 'P0001';
  end if;
  if p_ws = 'custom:money' and not (public.is_president() or coalesce(public.ws_my_level(p_ws) = 'manage', false)) then
    raise exception 'not_ws_manage:%', p_ws using errcode = 'P0001';
  end if;
  if p_ws = 'custom:internal' and not public.is_president() then
    raise exception 'not_ws_manage:%', p_ws using errcode = 'P0001';
  end if;
  if p_level not in ('view', 'edit', 'manage') then
    raise exception 'bad_level' using errcode = 'P0001';
  end if;
  if not exists (select 1 from workspaces where id = p_ws and active) then
    raise exception 'no_such_workspace' using errcode = 'P0001';
  end if;
  if not exists (select 1 from profiles where id = p_target and role = 'cadre') then
    raise exception 'not_a_cadre' using errcode = 'P0001';
  end if;
  -- 2026-11-03：Co-President 與 Senior Adviser 靠職級就有一切，不寫指派（寫了只會變成名單上一筆劃掉的多餘列）。
  if exists (select 1 from profiles where id = p_target and board_role in ('president', 'senior_adviser')) then
    raise notice 'by_rank: % already has every workspace by rank; nothing written', p_target;
    return 'by_rank';
  end if;
  select level into v_old from assignments where user_id = p_target and workspace_id = p_ws;
  if v_old = p_level then return p_level; end if;
  insert into assignments (user_id, workspace_id, level, granted_by)
  values (p_target, p_ws, p_level, auth.uid())
  on conflict (user_id, workspace_id) do update set level = excluded.level, granted_by = excluded.granted_by;
  perform public.log_role_change(p_target, 'assignment', coalesce(v_old, '') || '@' || p_ws, p_level || '@' || p_ws);
  return p_level;
end $$;

create or replace function public.unassign(p_target uuid, p_ws text)
returns boolean language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_old text;
begin
  if not public.can_manage(p_ws) then
    raise exception 'not_ws_manage:%', p_ws using errcode = 'P0001';
  end if;
  if p_ws = 'custom:money' and not (public.is_president() or coalesce(public.ws_my_level(p_ws) = 'manage', false)) then
    raise exception 'not_ws_manage:%', p_ws using errcode = 'P0001';
  end if;
  if p_ws = 'custom:internal' and not public.is_president() then
    raise exception 'not_ws_manage:%', p_ws using errcode = 'P0001';
  end if;
  delete from assignments where user_id = p_target and workspace_id = p_ws returning level into v_old;
  if not found then return false; end if;
  perform public.log_role_change(p_target, 'assignment', v_old || '@' || p_ws, '@' || p_ws);
  return true;
end $$;

commit;

-- ---------- 驗收 ----------
select * from (
  with s as (
    select
      (select count(*) from public.workspaces where id in ('custom:calendar', 'custom:meetings', 'custom:projects', 'custom:forms',
                                                         'custom:my-passport', 'custom:venues', 'custom:internal') and kind = 'custom' and active and team is null) as ws,
      (select count(*) from public.profiles where role = 'cadre' and coalesce(board_role, 'member') not in ('president', 'senior_adviser')) as cadres,
      (select count(*) from public.profiles p where p.role = 'cadre' and coalesce(p.board_role, 'member') not in ('president', 'senior_adviser')
          and (select count(*) from public.assignments a where a.user_id = p.id
                 and a.workspace_id in ('custom:calendar', 'custom:meetings', 'custom:projects', 'custom:forms', 'custom:my-passport', 'custom:venues')) = 6) as seeded,
      (select prosrc from pg_proc where proname = 'is_president' and pronamespace = 'public'::regnamespace) as pres_src,
      (select prosrc from pg_proc where proname = 'is_senior' and pronamespace = 'public'::regnamespace) as sen_src,
      (select prosrc from pg_proc where proname = 'is_internship_team' and pronamespace = 'public'::regnamespace) as intern_src,
      (select prosrc from pg_proc where proname = 'assign' and pronamespace = 'public'::regnamespace) as assign_src,
      (select prosrc from pg_proc where proname = 'unassign' and pronamespace = 'public'::regnamespace) as unassign_src,
      coalesce(has_function_privilege('anon', 'public.in_internal()', 'execute'), false) as anon_ok,
      (select count(*) from public.assignments where workspace_id = 'custom:internal') as internal_n,
      (select count(*) from pg_policies where schemaname = 'public') as policies
  ),
  t as (
    select *,
      pres_src like '%board_role = ''president''%' and pres_src like '%in_internal()%' as pres_ok,
      sen_src like '%''president'', ''senior_adviser''%' and sen_src like '%in_internal()%' as sen_ok,
      intern_src like '%is_president()%' and intern_src like '%Internship Team%' as intern_ok,
      assign_src like '%custom:internal%' and assign_src like '%custom:money%' and assign_src like '%by_rank%'
        and unassign_src like '%custom:internal%' and unassign_src like '%custom:money%' as gate_ok
    from s
  )
  select 0 ord, 'OVERALL' as 項目, null::text as 應該是, null::text as 實際是,
    case when ws = 7 and seeded = cadres and pres_ok and sen_ok and intern_ok and gate_ok and not anon_ok then 'PASS' else 'FAIL' end as 結果 from t
  union all select 1, '七個新工作區都在、都是整個 BT 的（team 空的）', '7', ws::text, case when ws = 7 then 'PASS' else 'FAIL' end from t
  union all select 2, '★ 現在的每一位幹部六格都有（沒有人少看到東西）', cadres::text, seeded::text, case when seeded = cadres then 'PASS' else 'FAIL' end from t
  union all select 3, '★ is_president：原本的 Co-President 還在，多認 Internal', 'true', pres_ok::text, case when pres_ok then 'PASS' else 'FAIL' end from t
  union all select 4, '★ is_senior：原本的 Co-President、Senior Adviser 還在，多認 Internal', 'true', sen_ok::text, case when sen_ok then 'PASS' else 'FAIL' end from t
  union all select 5, 'is_internship_team 改叫 is_president()', 'true', intern_ok::text, case when intern_ok then 'PASS' else 'FAIL' end from t
  union all select 6, '★ 派 Internal 與錢只有 Co-President；職級的人照舊不寫', 'true', gate_ok::text, case when gate_ok then 'PASS' else 'FAIL' end from t
  union all select 7, 'in_internal 沒登入的人叫不動', 'false', anon_ok::text, case when not anon_ok then 'PASS' else 'FAIL' end from t
  union all select 8, 'Internal 裡現在有幾個人（剛跑完應該是 0，Paul 自己加）', '0', internal_n::text, 'INFO' from t
  union all select 9, '整個資料庫的 RLS 政策有幾條（這一支沒動，跑前跑後一樣）', '', policies::text, 'INFO' from t
) x order by ord;
