-- 2026-12-27：在工作區裡，專案要一個一個開給人（Paul 2026-11-14：「when I add people into a workspace, I get to pick whatever
-- project to open up to them. So, for example, if you're in curriculum and then you're in charge for one project, you're not supposed
-- to see the other project. So I can remove you from that project, but you're still in the same workspace.」）。
--
-- 用法：整份貼進 Supabase SQL Editor 按一次 Run。可以重跑。最後印一張 PASS / FAIL 表。
-- 依賴：2026-12-26-projects.sql（先跑那一支）。
-- ⚠ 之後重跑 2026-12-25-access-model.sql 或 2026-12-26-projects.sql 會把 ws_my_level 蓋回舊版，那時要再跑這一支。
--
-- 改了什麼（只有 ws_my_level 一支，資料一行都不動）：
--   以前：team 是「改」→ 那個 team 的每一個專案、專案裡每一場活動都是「改」。在 Curriculum 就看得到 Curriculum 所有專案。
--   現在：team 是「改」或「看」→ 只有 team 自己的東西（team 的頁、會、資源、沒有放進專案的活動）。專案要另外被加進去。
--         team 是「管」（Director 那一級）→ 照舊管得到那個 team 的每一個專案與專案裡的活動，不然沒有人派得了人進專案。
--   不變：專案是「改」或「管」→ 專案裡的每一場活動同一級。「看」不往下傳（報名名單裡多是高中生）。
--   不變：紀錄倒進來的舊活動（工作區是 custom:records）拿不到任何往下傳的權限。
--
-- 畫面那一半在後台 → 人與權限 → 工作區：點 team 或「整個 BT」的標題，加人時勾要開哪幾樣（預設全部），之後一格一格開關。
-- 那是一次派好幾支 assign()，資料庫沒有新的函式。

begin;

create or replace function public.ws_my_level(p_ws text)
returns text language sql stable security definer
set search_path = public, pg_temp
as $$
  select case max(r) when 3 then 'manage' when 2 then 'edit' when 1 then 'view' end from (
    select case a.level when 'manage' then 3 when 'edit' then 2 else 1 end as r
      from public.assignments a join public.profiles p on p.id = a.user_id and p.role = 'cadre'
     where a.workspace_id = p_ws and a.user_id = auth.uid()
    union all
    -- 沒有放進專案的活動跟它的 team 走（2026-12-25 那一條）。team「看」的人不帶：報名名單裡多是高中生。
    select case a.level when 'manage' then 3 else 2 end
      from public.workspaces w
      join public.assignments a on a.workspace_id = 'res:' || w.team and a.user_id = auth.uid() and a.level in ('edit', 'manage')
      join public.profiles p on p.id = a.user_id and p.role = 'cadre'
     where w.id = p_ws and w.id like 'custom:event-%' and w.team is not null
       and not exists (select 1 from public.events e where e.workspace_id = p_ws and e.project_id is not null)
    union all
    -- team 是「管」→ 那個 team 的每一個專案（2026-12-27：「改」不再帶，專案要一個一個開）。
    select 3
      from public.workspaces w
      join public.assignments a on a.workspace_id = 'res:' || w.team and a.user_id = auth.uid() and a.level = 'manage'
      join public.profiles p on p.id = a.user_id and p.role = 'cadre'
     where w.id = p_ws and w.kind = 'project' and w.team is not null
    union all
    -- 一場活動跟它的專案走（2026-12-26）。專案「看」的人不帶，理由同上。
    select case a.level when 'manage' then 3 else 2 end
      from public.events e
      join public.assignments a on a.workspace_id = e.project_id and a.user_id = auth.uid() and a.level in ('edit', 'manage')
      join public.profiles p on p.id = a.user_id and p.role = 'cadre'
     where e.workspace_id = p_ws and e.project_id is not null and p_ws like 'custom:event-%'
    union all
    -- 專案的 team 是「管」→ 專案裡的活動也是「管」。
    select 3
      from public.events e
      join public.workspaces pw on pw.id = e.project_id and pw.team is not null
      join public.assignments a on a.workspace_id = 'res:' || pw.team and a.user_id = auth.uid() and a.level = 'manage'
      join public.profiles p on p.id = a.user_id and p.role = 'cadre'
     where e.workspace_id = p_ws and p_ws like 'custom:event-%'
  ) x;
$$;
revoke all on function public.ws_my_level(text) from public, anon, authenticated;

commit;

-- ---------- 驗收 ----------
with fn as (select proname, prosrc as body from pg_proc where pronamespace = 'public'::regnamespace and proname = 'ws_my_level'),
t as (
  select
    (select body like '%a.level = ''manage''%' and body not like '%w.kind = ''project'') and w.team is not null%' from fn) as mgr_only,
    (select body like '%e.project_id is not null)%' from fn) as loose_events,
    (select body like '%p_ws like ''custom:event-%%' from fn) as event_guard,
    not has_function_privilege('authenticated', 'public.ws_my_level(text)', 'execute') as lvl_locked
)
select 1 as n, '★ team 只有「管」才帶到專案' as "check", 'true' as expect, mgr_only::text as got, case when mgr_only then 'PASS' else 'FAIL' end as result from t
union all select 2, '★ team 的「改」只帶到沒放進專案的活動', 'true', loose_events::text, case when loose_events then 'PASS' else 'FAIL' end from t
union all select 3, '★ 紀錄倒進來的舊活動拿不到往下傳的權限', 'true', event_guard::text, case when event_guard then 'PASS' else 'FAIL' end from t
union all select 4, '★ 前端叫不到 ws_my_level', 'true', lvl_locked::text, case when lvl_locked then 'PASS' else 'FAIL' end from t
union all select 99, 'OVERALL', 'PASS', '', case when (select mgr_only and loose_events and event_guard and lvl_locked from t) then 'PASS' else 'FAIL' end
order by 1;
