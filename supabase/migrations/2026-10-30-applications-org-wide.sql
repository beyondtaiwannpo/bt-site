-- 申請變成整個 BT 一個工作區　2026-10-30
--
-- 用法：整份貼進 Supabase SQL Editor 按一次 Run。可以重跑。最後印一張 PASS / FAIL 表。
-- **要先跑過 2026-10-29-invites.sql**（順序照日期）。
--
-- Paul 2026-10-24：BT 不再分 team 辦計畫，六個「apps:<team>」工作區合併成一個整個 BT 的「apps」，屬於 Board。
-- Co-President 與 Senior Adviser 靠職級就有；其他人要被派進這一個工作區（看／改／管）才碰得到申請表與審核。
-- 表單上的 team 欄留著，只是標籤。
--
-- ============================================================================
-- 這一支在做什麼
-- ============================================================================
--   1. 建一個工作區 apps（kind apps、沒有 team、擁有人是一位 Co-President）。
--   2. 把 apps:<team> 上的每一筆指派搬到 apps：同一個人有好幾筆取最高的等級（manage > edit > view）。
--      每搬一個人記一筆變動紀錄（assignment、old「<等級>@apps:<team>,…」、new「<等級>@apps」）。舊指派刪掉，六個 apps:<team> 工作區設成 active = false（不刪，歷史對得回）。
--   3. is_on_team(p_team) 改成 can_view('apps')、is_director_of(p_team) 改成 can_edit('apps')，**參數留著不看**。
--      申請那一側所有的門（forms / form_questions / applications / application_answers / mail_outbox 的 RLS，
--      decide_applications、send_notice、set_check_in）都是經過這兩支判斷的，所以全部跟著搬到那一個工作區，一條 policy 都不用重寫。
--      submit_application 是學員那一側（自己的申請），沒有 team 的門；send_pending_mail 的門仍是 is_cadre（10-24 記著的已知事項）。
--
-- ⚠ 重跑 2026-10-24-ranks-and-workspaces.sql 會把 is_on_team / is_director_of 建回「apps:<team>」那一版，
--   而且會照 team 標籤再種一次 apps:<team> 的指派。那時要再跑這一支（它會再把那些指派合併過來）。
-- ============================================================================

begin;

do $$
declare
  v_pres uuid;
  r record;
  v_old text;
begin
  select id into v_pres from profiles where role = 'cadre' and board_role = 'president' order by updated_at limit 1;
  insert into workspaces (id, kind, team, title_zh, title_en, owner)
  values ('apps', 'apps', null, '申請（表單與審核）', 'Applications (forms & review)', v_pres)
  on conflict (id) do nothing;

  -- 同一個人在幾個 team 的 apps 工作區就取最高的那一級。
  for r in
    select a.user_id,
           max(case a.level when 'manage' then 3 when 'edit' then 2 else 1 end) as lv,
           string_agg(a.level || '@' || a.workspace_id, ',' order by a.workspace_id) as olds
      from assignments a
     where a.workspace_id like 'apps:%'
     group by a.user_id
  loop
    v_old := case r.lv when 3 then 'manage' when 2 then 'edit' else 'view' end;
    insert into assignments (user_id, workspace_id, level, granted_by)
    values (r.user_id, 'apps', v_old, v_pres)
    on conflict (user_id, workspace_id) do update
      set level = case when (case excluded.level when 'manage' then 3 when 'edit' then 2 else 1 end)
                          > (case assignments.level when 'manage' then 3 when 'edit' then 2 else 1 end)
                       then excluded.level else assignments.level end;
    insert into role_changes (changed_by, target, target_name, field, old_value, new_value)
    values (v_pres, r.user_id, public.person_name((select id from people where profile_id = r.user_id limit 1)), 'assignment', r.olds, v_old || '@apps');
  end loop;
  delete from assignments where workspace_id like 'apps:%';
  update workspaces set active = false where id like 'apps:%' and active;
end $$;

-- 參數留著（幾十條 policy 都還是 is_on_team(team) 這樣叫），但不看它：申請從此是整個 BT 一個工作區。
create or replace function public.is_on_team(p_team text)
returns boolean language sql stable security definer
set search_path = public, pg_temp
as $$ select public.can_view('apps'); $$;

create or replace function public.is_director_of(p_team text)
returns boolean language sql stable security definer
set search_path = public, pg_temp
as $$ select public.can_edit('apps'); $$;

commit;

select * from (
  with ws as (
    select count(*) filter (where id = 'apps' and active) as one,
           count(*) filter (where id like 'apps:%' and active) as olds,
           count(*) filter (where id = 'apps' and team is null) as noteam
      from public.workspaces
  ), asg as (
    select count(*) filter (where workspace_id like 'apps:%') as olds,
           count(*) filter (where workspace_id = 'apps') as news
      from public.assignments
  ), fn as (
    select p.proname, regexp_replace(p.prosrc, '--[^\n]*', '', 'g') as body
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname in ('is_on_team', 'is_director_of')
  )
  select 0 ord, 'OVERALL' as 項目, null::text as 應該是, null::text as 實際是,
    case when (select one from ws) = 1 and (select olds from ws) = 0 and (select noteam from ws) = 1
          and (select olds from asg) = 0
          and (select body like '%can_view(''apps'')%' from fn where proname = 'is_on_team')
          and (select body like '%can_edit(''apps'')%' from fn where proname = 'is_director_of')
    then 'PASS' else 'FAIL' end as 結果
  union all select 1, '★ 工作區 apps 在、屬於整個 BT（沒有 team）', '1 / 1', (select one from ws)::text || ' / ' || (select noteam from ws)::text,
    case when (select one from ws) = 1 and (select noteam from ws) = 1 then 'PASS' else 'FAIL' end
  union all select 2, '★ 六個 apps:<team> 都停用了', '0', (select olds from ws)::text, case when (select olds from ws) = 0 then 'PASS' else 'FAIL' end
  union all select 3, '★ apps:<team> 上沒有任何指派了（搬到 apps 上，見第 4 列）', '0', (select olds from asg)::text, case when (select olds from asg) = 0 then 'PASS' else 'FAIL' end
  union all select 4, '資訊：現在被派進 apps 的人數', '（看一眼）', (select news from asg)::text, 'PASS'
  union all select 5, '★ is_on_team 看的是 apps 這一個工作區', 'true',
    coalesce((select (body like '%can_view(''apps'')%')::text from fn where proname = 'is_on_team'), '（函式不在）'),
    case when (select body like '%can_view(''apps'')%' from fn where proname = 'is_on_team') then 'PASS' else 'FAIL' end
  union all select 6, '★ is_director_of 看的是 apps 這一個工作區', 'true',
    coalesce((select (body like '%can_edit(''apps'')%')::text from fn where proname = 'is_director_of'), '（函式不在）'),
    case when (select body like '%can_edit(''apps'')%' from fn where proname = 'is_director_of') then 'PASS' else 'FAIL' end
) t order by ord;
