-- 2026-12-25：權限三級制（Paul 2026-11-14 說「Yes, go ahead」，計畫第 2 步）。
-- 計畫與理由：~/Anson/outputs/beyond-taiwan/website/docs/2026-11-13-admin-restructure-plan/bt-admin-plan.html
--
-- 用法：整份貼進 Supabase SQL Editor 按一次 Run。可以重跑。最後印一張 PASS / FAIL 表。
-- ⚠ 之後重跑任何一支更早的遷移檔（09-19、10-24、11-01、11-02、11-06、11-08、11-27、11-29、12-01、12-14）會把這裡改過的函式蓋回舊版，那時要再跑這一支。
-- 依賴：2026-10-24-ranks-and-workspaces.sql、2026-11-01-events.sql、2026-11-02-meetings.sql、2026-11-06-history-milestones.sql、
--       2026-11-08-finance.sql、2026-11-27-college-posts.sql、2026-11-29-team-forms.sql、2026-12-01-records.sql、2026-12-14-venues.sql。
--
-- ============================================================================
-- 這一支在做什麼
-- ============================================================================
-- 一條規則：每一個地方都是三級，意思到處一樣。
--   看（Viewer）：讀得到，什麼都改不了。
--   改（Editor）：在那裡新增、修改。大部分的人要的就是這一級。
--   管（Manager）：改，再加上在那裡加人、改別人的等級、移出。通常是 Director。
--
--   1. 一個 team（res:<team>，畫面上就叫那個 team）：
--      改 = 開這個 team 的活動、排這個 team 的會、改資源。以前開活動與排會要「管」。
--      這個 team 的每一場活動：team 是「改」的人對那一場也是「改」，「管」的人也是「管」。
--      **team 是「看」的人不會因此看到報名名單**（報名的人多是高中生），要看名單就把他加進那一場。
--   2. 紀錄（custom:records）、內部表單（custom:team-forms）：以前被派進去就是全部權力，
--      「看」也改得動。改成跟別的地方一樣。今天在裡面是「看」的人一律升成「改」，所以沒有人少掉任何東西。
--   3. 貼文核可併進 Marketing 的「管」：核可的人 = Co-President、Senior Adviser、Marketing Team 是「管」的人。
--      今天在「行銷貼文核可」名單上的人升成 Marketing Team 的「管」，那張名單停用。升了誰印在驗收表最後。
--      BT 歷史之路從「管」放寬到「改」（計畫：Marketing 的 Editor 改得動歷史之路）。
--   4. 錢可以派了（custom:money）。以前只看職位名稱裡有沒有「Sponsorship」加「Director」。
--      職位名稱那條照舊算（Sponsorship Director 還是改得動），多一條：被派進「錢」的人。
--      看：讀得到；改：記收支、改預算；管：再加上派別人。
--      **Senior Adviser 照舊只讀得到、記不了帳，也派不了別人進「錢」**（計畫：記錢留給 Co-President 與被派的人）。
--   5. Senior Adviser 看得到校友故事與變動紀錄（以前選單上有、點進去是空的，因為資料庫只給 Co-President 讀）。
--   6. 工作區的「擁有人」以前有「管」的權力，卻不在成員名單上、也移不掉。
--      改成：擁有人一律寫成一筆「管」的指派（Co-President 與 Senior Adviser 本來就全部都有，不寫），
--      之後權限只看指派。擁有人那一欄留著當「誰建的」，不再帶權力。
--   7. 場地：開得了一個 team 的活動的人也改得動場地（以前只有紀錄那邊的人）。
--   8. Co-President 與 Senior Adviser 照舊全部都有（Senior Adviser 除了錢、職級、人與權限那三件）。
-- ============================================================================

begin;

-- ---------- 0. 我在一個工作區是哪一級（不算職級）----------
-- 只看指派。一場活動（custom:event-…）多算它那個 team：team 是「改」以上的人，對那一場是同一級。
-- 回 'view' / 'edit' / 'manage'，沒有就是 null。
create or replace function public.ws_my_level(p_ws text)
returns text language sql stable security definer
set search_path = public, pg_temp
as $$
  select case max(r) when 3 then 'manage' when 2 then 'edit' when 1 then 'view' end from (
    select case a.level when 'manage' then 3 when 'edit' then 2 else 1 end as r
      from public.assignments a join public.profiles p on p.id = a.user_id and p.role = 'cadre'
     where a.workspace_id = p_ws and a.user_id = auth.uid()
    union all
    -- team「看」的人不帶：報名名單裡多是高中生，要看名單就被加進那一場。
    select case a.level when 'manage' then 3 else 2 end
      from public.workspaces w
      join public.assignments a on a.workspace_id = 'res:' || w.team and a.user_id = auth.uid() and a.level in ('edit', 'manage')
      join public.profiles p on p.id = a.user_id and p.role = 'cadre'
     where w.id = p_ws and w.id like 'custom:event-%' and w.team is not null
  ) x;
$$;
revoke all on function public.ws_my_level(text) from public, anon, authenticated;

-- ---------- 6. 擁有人寫成「管」的指派（要在改 can_* 之前，才不會有人一瞬間少掉權限）----------
insert into public.assignments (user_id, workspace_id, level, granted_by)
select w.owner, w.id, 'manage', null
  from public.workspaces w join public.profiles p on p.id = w.owner and p.role = 'cadre'
 where coalesce(p.board_role, '') not in ('president', 'senior_adviser')
on conflict (user_id, workspace_id) do update set level = 'manage' where public.assignments.level <> 'manage';

create or replace function public.can_view(p_ws text)
returns boolean language sql stable security definer
set search_path = public, pg_temp
as $$ select public.is_senior() or public.ws_my_level(p_ws) is not null $$;

create or replace function public.can_edit(p_ws text)
returns boolean language sql stable security definer
set search_path = public, pg_temp
as $$ select public.is_senior() or coalesce(public.ws_my_level(p_ws) in ('edit', 'manage'), false) $$;

create or replace function public.can_manage(p_ws text)
returns boolean language sql stable security definer
set search_path = public, pg_temp
as $$ select public.is_senior() or coalesce(public.ws_my_level(p_ws) = 'manage', false) $$;

-- create_workspace：擁有人同時寫一筆「管」，他才會出現在成員名單上、也移得掉。
create or replace function public.create_workspace(p_slug text, p_title_zh text, p_title_en text, p_owner uuid)
returns text language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_id text;
begin
  perform public.require_senior();
  if coalesce(p_slug, '') !~ '^[a-z0-9-]{2,40}$' then
    raise exception 'bad_slug' using errcode = 'P0001';
  end if;
  if coalesce(btrim(p_title_zh), '') = '' and coalesce(btrim(p_title_en), '') = '' then
    raise exception 'empty_title' using errcode = 'P0001';
  end if;
  if p_owner is not null and not exists (select 1 from profiles where id = p_owner and role = 'cadre') then
    raise exception 'not_a_cadre' using errcode = 'P0001';
  end if;
  v_id := 'custom:' || p_slug;
  insert into workspaces (id, kind, title_zh, title_en, owner)
  values (v_id, 'custom', nullif(btrim(p_title_zh), ''), nullif(btrim(p_title_en), ''), p_owner)
  on conflict (id) do update set title_zh = excluded.title_zh, title_en = excluded.title_en, owner = excluded.owner, active = true;
  if p_owner is not null and not exists (select 1 from profiles where id = p_owner and board_role in ('president', 'senior_adviser')) then
    insert into assignments (user_id, workspace_id, level, granted_by) values (p_owner, v_id, 'manage', auth.uid())
    on conflict (user_id, workspace_id) do update set level = 'manage';
  end if;
  return v_id;
end $$;

-- ---------- 1. team：改 = 開活動、排會 ----------
update public.workspaces set title_zh = team, title_en = team where kind = 'res' and team is not null
   and (title_zh is distinct from team or title_en is distinct from team);

create or replace function public.can_schedule(p_scope text)
returns boolean language sql stable security definer
set search_path = public, pg_temp
as $$ select public.is_senior() or (coalesce(p_scope, 'board') <> 'board' and public.can_edit('res:' || p_scope)) $$;

create or replace function public.create_event(p_team text, p_slug text, p_title_zh text, p_title_en text, p_with_form boolean default true)
returns uuid language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_ws text; v_form uuid; v_id uuid; v_uid uuid := auth.uid();
begin
  if not public.is_cadre() then raise exception 'not_cadre' using errcode = 'P0001'; end if;
  -- 2026-12-25：team 是「改」就開得了（以前要「管」）。錯誤代號沿用 not_team_manager，畫面那句改了。
  if not (public.is_senior() or public.can_edit('res:' || coalesce(p_team, ''))) then
    raise exception 'not_team_manager' using errcode = 'P0001';
  end if;
  if coalesce(p_slug, '') !~ '^[a-z0-9-]{2,40}$' then raise exception 'bad_slug' using errcode = 'P0001'; end if;
  if coalesce(btrim(p_title_zh), '') = '' and coalesce(btrim(p_title_en), '') = '' then raise exception 'empty_title' using errcode = 'P0001'; end if;
  if exists (select 1 from events where slug = p_slug) then raise exception 'slug_taken' using errcode = 'P0001'; end if;
  v_ws := 'custom:event-' || p_slug;
  insert into workspaces (id, kind, team, title_zh, title_en, owner)
  values (v_ws, 'custom', p_team, nullif(btrim(p_title_zh), ''), nullif(btrim(p_title_en), ''), v_uid)
  on conflict (id) do update set team = excluded.team, title_zh = excluded.title_zh, title_en = excluded.title_en, owner = excluded.owner, active = true;
  insert into assignments (user_id, workspace_id, level, granted_by) values (v_uid, v_ws, 'manage', v_uid)
  on conflict (user_id, workspace_id) do update set level = 'manage';
  if p_with_form then
    insert into forms (team, kind, title, status, created_by)
    values (p_team, 'program', coalesce(nullif(btrim(p_title_zh), ''), btrim(p_title_en)), 'draft', v_uid)
    returning id into v_form;
  end if;
  insert into events (slug, team, workspace_id, form_id, title_zh, title_en, created_by)
  values (p_slug, p_team, v_ws, v_form, coalesce(btrim(p_title_zh), ''), coalesce(btrim(p_title_en), ''), v_uid)
  returning id into v_id;
  return v_id;
end $$;

-- ---------- 7. 場地：開得了活動的人改得動 ----------
create or replace function public.venue_can_edit()
returns boolean language sql stable security definer
set search_path = public, pg_temp
as $$
  select public.rc_can_manage() or exists (
    select 1 from public.assignments a join public.profiles p on p.id = a.user_id and p.role = 'cadre'
     where a.user_id = auth.uid() and a.level in ('edit', 'manage')
       and (a.workspace_id like 'res:%' or a.workspace_id like 'custom:event-%'));
$$;

-- ---------- 2. 紀錄、內部表單：三級跟別的地方一樣 ----------
update public.assignments set level = 'edit' where workspace_id in ('custom:records', 'custom:team-forms') and level = 'view';

create or replace function public.rc_can_manage()
returns boolean language sql stable security definer
set search_path = public, pg_temp
as $$ select public.is_senior() or coalesce(public.ws_my_level('custom:records') in ('edit', 'manage'), false) $$;

create or replace function public.rc_can_view()
returns boolean language sql stable security definer
set search_path = public, pg_temp
as $$ select public.rc_can_manage() or public.is_senior() or public.ws_my_level('custom:records') is not null $$;

create or replace function public.tf_can_create()
returns boolean language sql stable security definer
set search_path = public, pg_temp
as $$ select public.tf_is_cadre() and (public.is_senior() or coalesce(public.ws_my_level('custom:team-forms') in ('edit', 'manage'), false)) $$;

-- ---------- 3. 貼文核可併進 Marketing 的「管」----------
-- 名單上的人（不是 Co-President／Senior Adviser、還不是 Marketing「管」的）先記一筆，再升，再清名單。
insert into public.role_changes (changed_by, target, target_name, field, old_value, new_value)
select null, a.user_id, coalesce(nullif(p.name_zh, ''), p.name_en), 'assignment',
       a.level || '@custom:marketing-approve', 'manage@res:Marketing Team（2026-12-25 核可併進 Marketing 的管）'
  from public.assignments a join public.profiles p on p.id = a.user_id and p.role = 'cadre'
 where a.workspace_id = 'custom:marketing-approve'
   and coalesce(p.board_role, '') not in ('president', 'senior_adviser')
   and not exists (select 1 from public.assignments m where m.user_id = a.user_id and m.workspace_id = 'res:Marketing Team' and m.level = 'manage');
insert into public.assignments (user_id, workspace_id, level, granted_by)
select a.user_id, 'res:Marketing Team', 'manage', null
  from public.assignments a join public.profiles p on p.id = a.user_id and p.role = 'cadre'
 where a.workspace_id = 'custom:marketing-approve'
   and coalesce(p.board_role, '') not in ('president', 'senior_adviser')
   and exists (select 1 from public.workspaces w where w.id = 'res:Marketing Team')
on conflict (user_id, workspace_id) do update set level = 'manage';
delete from public.assignments where workspace_id = 'custom:marketing-approve';
update public.workspaces set active = false where id = 'custom:marketing-approve' and active;

create or replace function public.mkt_can_approve()
returns boolean language sql stable security definer
set search_path = public, pg_temp
as $$ select public.is_senior() or public.can_manage('res:Marketing Team') $$;

create or replace function public.can_edit_history()
returns boolean language sql stable security definer
set search_path = public, pg_temp
as $$ select public.is_senior() or public.can_edit('res:Marketing Team') $$;

-- ---------- 4. 錢可以派 ----------
insert into public.workspaces (id, kind, title_zh, title_en)
values ('custom:money', 'custom', '錢（收支與預算）', 'Money (income, spending, budget)')
on conflict (id) do update set active = true;

create or replace function public.can_view_finance()
returns boolean language sql stable security definer
set search_path = public, pg_temp
as $$ select public.is_senior() or public.is_sponsorship_director() or public.ws_my_level('custom:money') is not null $$;

-- Senior Adviser 不在這裡（記錢留給 Co-President 與被派的人）。
create or replace function public.can_edit_finance()
returns boolean language sql stable security definer
set search_path = public, pg_temp
as $$ select public.is_president() or public.is_sponsorship_director() or coalesce(public.ws_my_level('custom:money') in ('edit', 'manage'), false) $$;

-- assign / unassign：「錢」那一格只有 Co-President 或「錢」是「管」的人派得了（Senior Adviser 不行）。
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
  delete from assignments where user_id = p_target and workspace_id = p_ws returning level into v_old;
  if not found then return false; end if;
  perform public.log_role_change(p_target, 'assignment', v_old || '@' || p_ws, '@' || p_ws);
  return true;
end $$;

-- ---------- my_access：活動多帶 team 那一層，擁有人不再另算 ----------
create or replace function public.my_access()
returns jsonb language sql stable security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'role',  p.role,
    'rank',  p.board_role,
    'senior', p.role = 'cadre' and p.board_role in ('president', 'senior_adviser'),
    'workspaces', coalesce((
      select jsonb_agg(jsonb_build_object('id', x.id, 'level', x.level, 'kind', w.kind, 'team', w.team,
                                          'title_zh', w.title_zh, 'title_en', w.title_en) order by x.id)
        from (
          select w2.id, public.ws_my_level(w2.id) as level
            from workspaces w2
           where w2.id in (select a.workspace_id from assignments a where a.user_id = p.id)
              or (w2.id like 'custom:event-%' and ('res:' || w2.team) in (select a.workspace_id from assignments a where a.user_id = p.id and a.level in ('edit', 'manage')))
        ) x join workspaces w on w.id = x.id
       where x.level is not null
    ), '[]'::jsonb)
    || case when public.can_view_finance()
            then jsonb_build_array(jsonb_build_object('id', 'finance', 'level', case when public.can_edit_finance() then 'edit' else 'view' end,
                                                      'kind', 'finance', 'team', null, 'title_zh', '財務', 'title_en', 'Finance'))
            else '[]'::jsonb end
    || case when public.tf_can_create() or exists (select 1 from public.tf_forms f where public.tf_is_reader(f.id))
            then jsonb_build_array(jsonb_build_object('id', 'team-forms', 'level', case when public.tf_can_create() then 'edit' else 'view' end,
                                                      'kind', 'team-forms', 'team', null, 'title_zh', '內部表單', 'title_en', 'Team forms'))
            else '[]'::jsonb end
    || case when public.rc_can_view() or exists (select 1 from public.events e where public.can_edit(e.workspace_id))
            then jsonb_build_array(jsonb_build_object('id', 'records', 'level', case when public.rc_can_manage() then 'edit' else 'view' end,
                                                      'kind', 'records', 'team', null, 'title_zh', '紀錄', 'title_en', 'Records'))
            else '[]'::jsonb end)
    from profiles p where p.id = auth.uid();
$$;

-- ---------- 5. Senior Adviser 看得到校友故事與變動紀錄（核可照舊 require_senior）----------
create or replace function public.stories_for_review()
returns table(id uuid, name text, school text, county text, city text, country text, place text, quote text, note text,
              public_story boolean, story_approved boolean, updated_at timestamptz, approved_at timestamptz)
language sql stable security definer
set search_path = public, pg_temp
as $$
  select s.id,
         coalesce(nullif(btrim(s.display_name), ''), p.name_zh, p.name_en, '（沒有名字）'),
         s.school, s.county, s.city, s.country, s.place,
         s.quote, s.note, s.public_story, s.story_approved, s.updated_at, s.approved_at
    from public.alumni_stories s
    join public.profiles p on p.id = s.id
   where s.public_story
     and p.role in ('cadre', 'alumni')
     and public.is_senior()
   order by s.story_approved, s.updated_at desc;
$$;

drop policy if exists role_changes_read on public.role_changes;
create policy role_changes_read on public.role_changes for select to authenticated using (public.is_senior());

commit;

-- ---------- 驗收 ----------
select * from (
  with fn as (select proname, regexp_replace(prosrc, '--[^\n]*', '', 'g') as body from pg_proc where pronamespace = 'public'::regnamespace),
  t as (
    select
      exists (select 1 from fn where proname = 'ws_my_level') as lvl_fn,
      not has_function_privilege('anon', 'public.ws_my_level(text)', 'execute')
        and not has_function_privilege('authenticated', 'public.ws_my_level(text)', 'execute') as lvl_locked,
      (select bool_and(body like '%ws_my_level(p_ws)%' and body not like '%owner%') from fn where proname in ('can_view', 'can_edit', 'can_manage')) as cans,
      (select body like '%coalesce(public.ws_my_level(p_ws) in (''edit'', ''manage''), false)%' from fn where proname = 'can_edit') as edit_rule,
      (select body like '%a.level in (''edit'', ''manage'')%' and body like '%custom:event-%' from fn where proname = 'ws_my_level') as inherit_rule,
      (select count(*) from public.workspaces w join public.profiles p on p.id = w.owner and p.role = 'cadre'
        where coalesce(p.board_role, '') not in ('president', 'senior_adviser')
          and not exists (select 1 from public.assignments a where a.user_id = w.owner and a.workspace_id = w.id and a.level = 'manage')) as owners_missing,
      (select body like '%insert into assignments%' from fn where proname = 'create_workspace') as cw_assign,
      (select body like '%can_edit(''res:'' || p_scope)%' from fn where proname = 'can_schedule') as sched,
      (select body like '%can_edit(''res:'' || coalesce(p_team%' and body not like '%can_manage(''res:''%' from fn where proname = 'create_event') as ce,
      (select count(*) from public.workspaces where kind = 'res' and team is not null and (title_en is distinct from team)) as res_titles,
      (select count(*) from public.assignments where workspace_id in ('custom:records', 'custom:team-forms') and level = 'view') as view_left,
      (select body like '%ws_my_level(''custom:records'') in (''edit'', ''manage'')%' from fn where proname = 'rc_can_manage') as rc,
      (select body like '%ws_my_level(''custom:team-forms'') in (''edit'', ''manage'')%' from fn where proname = 'tf_can_create') as tf,
      (select count(*) from public.assignments where workspace_id = 'custom:marketing-approve') as approve_left,
      not coalesce((select active from public.workspaces where id = 'custom:marketing-approve'), false) as approve_off,
      (select body like '%can_manage(''res:Marketing Team'')%' and body not like '%marketing-approve%' from fn where proname = 'mkt_can_approve') as approve_rule,
      (select body like '%can_edit(''res:Marketing Team'')%' from fn where proname = 'can_edit_history') as hist,
      coalesce((select active from public.workspaces where id = 'custom:money'), false) as money_ws,
      (select body like '%ws_my_level(''custom:money'')%' and body not like '%is_senior%' from fn where proname = 'can_edit_finance') as money_edit,
      (select body like '%is_sponsorship_director()%' from fn where proname = 'can_edit_finance') as money_title,
      (select bool_and(body like '%p_ws = ''custom:money'' and not (public.is_president()%') from fn where proname in ('assign', 'unassign')) as money_assign,
      (select body like '%res:%' and body like '%custom:event-%' from fn where proname = 'venue_can_edit') as venue,
      (select body like '%is_senior()%' from fn where proname = 'stories_for_review') as stories,
      (select qual like '%is_senior()%' from pg_policies where schemaname = 'public' and tablename = 'role_changes' and policyname = 'role_changes_read') as changes,
      (select body like '%ws_my_level%' and body not like '%w.owner = p.id%' from fn where proname = 'my_access') as access,
      (select string_agg(distinct target_name, '、') from public.role_changes where old_value like '%@custom:marketing-approve' and new_value like 'manage@res:Marketing Team%') as raised
  )
  select 0 ord, 'OVERALL' as 項目, null::text as 應該是, null::text as 實際是,
    case when lvl_fn and lvl_locked and cans and edit_rule and inherit_rule and owners_missing = 0 and cw_assign and sched and ce and res_titles = 0
          and view_left = 0 and rc and tf and approve_left = 0 and approve_off and approve_rule and hist and money_ws and money_edit and money_title
          and money_assign and venue and stories and changes and access then 'PASS' else 'FAIL' end as 結果 from t
  union all select 1,  '我在一個工作區是哪一級（ws_my_level）', 'true', lvl_fn::text, case when lvl_fn then 'PASS' else 'FAIL' end from t
  union all select 2,  '★ 前端叫不到 ws_my_level', 'true', lvl_locked::text, case when lvl_locked then 'PASS' else 'FAIL' end from t
  union all select 3,  '★ 看／改／管只看指派，擁有人不再帶權力', 'true', cans::text, case when cans then 'PASS' else 'FAIL' end from t
  union all select 4,  '★「改」要 edit 或 manage（看的人改不了）', 'true', edit_rule::text, case when edit_rule then 'PASS' else 'FAIL' end from t
  union all select 5,  '★ 活動跟 team 走，只帶「改」與「管」（team 看的人看不到報名名單）', 'true', inherit_rule::text, case when inherit_rule then 'PASS' else 'FAIL' end from t
  union all select 6,  '★ 每一位擁有人都有一筆「管」（沒有人少掉權限）', '0', owners_missing::text, case when owners_missing = 0 then 'PASS' else 'FAIL' end from t
  union all select 7,  '新建工作區的擁有人寫成一筆「管」', 'true', cw_assign::text, case when cw_assign then 'PASS' else 'FAIL' end from t
  union all select 8,  'team 是「改」就排得了這個 team 的會', 'true', sched::text, case when sched then 'PASS' else 'FAIL' end from t
  union all select 9,  'team 是「改」就開得了這個 team 的活動', 'true', ce::text, case when ce then 'PASS' else 'FAIL' end from t
  union all select 10, 'team 那一格的名字就是 team', '0', res_titles::text, case when res_titles = 0 then 'PASS' else 'FAIL' end from t
  union all select 11, '紀錄與內部表單裡「看」的人都升成「改」', '0', view_left::text, case when view_left = 0 then 'PASS' else 'FAIL' end from t
  union all select 12, '★ 紀錄：看的人改不了', 'true', rc::text, case when rc then 'PASS' else 'FAIL' end from t
  union all select 13, '★ 內部表單：看的人建不了', 'true', tf::text, case when tf then 'PASS' else 'FAIL' end from t
  union all select 14, '貼文核可名單清空並停用', '0|true', approve_left::text || '|' || approve_off::text, case when approve_left = 0 and approve_off then 'PASS' else 'FAIL' end from t
  union all select 15, '★ 核可 = Marketing Team 的「管」', 'true', approve_rule::text, case when approve_rule then 'PASS' else 'FAIL' end from t
  union all select 16, '歷史之路：Marketing 是「改」就改得動', 'true', hist::text, case when hist then 'PASS' else 'FAIL' end from t
  union all select 17, '「錢」那一格在', 'true', money_ws::text, case when money_ws then 'PASS' else 'FAIL' end from t
  union all select 18, '★ 記錢：被派「改」以上的人，Senior Adviser 照舊不行', 'true', money_edit::text, case when money_edit then 'PASS' else 'FAIL' end from t
  union all select 19, 'Sponsorship Director 照舊記得了錢', 'true', money_title::text, case when money_title then 'PASS' else 'FAIL' end from t
  union all select 20, '★ 派別人進「錢」：Co-President 或「錢」是「管」的人', 'true', coalesce(money_assign, false)::text, case when money_assign then 'PASS' else 'FAIL' end from t
  union all select 21, '場地：開得了活動的人也改得動', 'true', venue::text, case when venue then 'PASS' else 'FAIL' end from t
  union all select 22, 'Senior Adviser 讀得到校友故事', 'true', stories::text, case when stories then 'PASS' else 'FAIL' end from t
  union all select 23, 'Senior Adviser 讀得到變動紀錄', 'true', changes::text, case when changes then 'PASS' else 'FAIL' end from t
  union all select 24, 'my_access 帶活動的 team 那一層', 'true', access::text, case when access then 'PASS' else 'FAIL' end from t
  union all select 25, '（資訊）從核可名單升成 Marketing「管」的人', '（看一眼）', coalesce(raised, '（沒有）'), 'PASS' from t
) x order by ord;
