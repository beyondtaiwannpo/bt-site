-- 清掉靠職級就有一切的人身上多餘的指派　2026-11-03
--
-- 用法：整份貼進 Supabase SQL Editor 按一次 Run。可以重跑。最後印一張 PASS / FAIL 表。
-- 跟 2026-11-02-meetings.sql 互不相干，先後都可以；照日期的話接在 11-02 後面。
--
-- Paul 2026-10-24 看名單：Co-President 與 Senior Adviser 的工作區欄還印著劃掉的舊指派（真的存在的列）。
-- 這兩級靠職級（is_senior()）就到得了每一個工作區，assignments 裡的那幾筆是歷史留下來的（10-24 種的、10-30 合併搬的），沒有任何作用。
--
-- ============================================================================
-- 這一支在做什麼
-- ============================================================================
--   1. 刪掉 board_role 是 president 或 senior_adviser 的人身上所有 assignments，每一筆記進 role_changes（field assignment、new 是 'by_rank'）。
--   2. assign() 整支重建（2026-10-24 那一版加一道門）：目標是這兩級的人就**不寫**，印一個 notice、回 'by_rank'。
--      這樣之後再怎麼派、怎麼合併，都不會再長出這種多餘的列。
--   ⚠ 重跑 2026-10-24-ranks-and-workspaces.sql 會把 assign() 建回舊版，那時要再跑一次這一支。
-- ============================================================================

begin;

do $$
declare r record; v_by uuid;
begin
  select id into v_by from profiles where role = 'cadre' and board_role = 'president' order by updated_at limit 1;
  for r in
    select a.user_id, a.workspace_id, a.level from assignments a join profiles p on p.id = a.user_id
     where p.board_role in ('president', 'senior_adviser')
  loop
    insert into role_changes (changed_by, target, target_name, field, old_value, new_value)
    values (coalesce(auth.uid(), v_by), r.user_id, public.person_name((select id from people where profile_id = r.user_id limit 1)), 'assignment', r.level || '@' || r.workspace_id, 'by_rank');
    delete from assignments where user_id = r.user_id and workspace_id = r.workspace_id;
  end loop;
end $$;

create or replace function public.assign(p_target uuid, p_ws text, p_level text)
returns text language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_old text;
begin
  if not public.can_manage(p_ws) then
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
revoke all on function public.assign(uuid, text, text) from public, anon;
grant execute on function public.assign(uuid, text, text) to authenticated;

commit;

select * from (
  with t as (
    select (select count(*) from public.assignments a join public.profiles p on p.id = a.user_id where p.board_role in ('president', 'senior_adviser')) as leftover,
           (select regexp_replace(prosrc, '--[^\n]*', '', 'g') like '%by_rank%' from pg_proc where proname = 'assign') as gated,
           (select count(*) from public.role_changes where field = 'assignment' and new_value = 'by_rank') as logged
  )
  select 0 ord, 'OVERALL' as 項目, null::text as 應該是, null::text as 實際是, case when leftover = 0 and gated then 'PASS' else 'FAIL' end as 結果 from t
  union all select 1, '★ 這兩級身上沒有任何指派了', '0', leftover::text, case when leftover = 0 then 'PASS' else 'FAIL' end from t
  union all select 2, '★ assign() 對這兩級不寫、回 by_rank', 'true', gated::text, case when gated then 'PASS' else 'FAIL' end from t
  union all select 3, '資訊：這一支加歷次總共記了幾筆刪除', '（看一眼）', logged::text, 'PASS' from t
) x order by ord;
