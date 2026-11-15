-- 2026-12-26：工作區 → 專案 → 活動（Paul 2026-11-14：「in one workspace, there can be multiple projects.
-- And in one project, there can be multiple forms, registration, records」，同一天回答：一個專案有好幾場活動、好幾份報名表，場地照舊大家改得動）。
--
-- 用法：整份貼進 Supabase SQL Editor 按一次 Run。可以重跑。最後印一張 PASS / FAIL 表。
-- 依賴：2026-12-25-access-model.sql（ws_my_level、my_access、create_workspace）、2026-12-15-event-signups.sql（form_can_view / form_can_edit）。
-- ⚠ 之後重跑 2026-12-25-access-model.sql 或 2026-12-15-event-signups.sql 會把這裡改過的 ws_my_level、my_access、form_can_view、form_can_edit 蓋回舊版，那時要再跑這一支，再跑 2026-12-27-project-scope.sql。
-- ⚠ 2026-12-27 起 ws_my_level 以 2026-12-27-project-scope.sql 為準（team 的「改」不再帶到專案）。重跑這一支之後要再跑那一支。
--
-- ============================================================================
-- 這一支在做什麼
-- ============================================================================
-- 名字（畫面上）：
--   工作區（Workspace）：六個 team 各一個（res:<team>），加一個「整個 BT」（紀錄、錢、場地、會議範本、內部表單、申請、兩本護照）。
--   專案（Project）：放在一個工作區裡，底下有好幾場活動、好幾份報名表。例：Curriculum 的「2027 冬令營」。
--   活動（Event）：跟以前一樣。可以不屬於任何專案（以前開的活動都是這樣，不用搬）。
--
-- 資料：
--   1. 專案就是 workspaces 的一列，kind = 'project'，id = 'project:<代號>'，team 是它在哪個工作區（null = 整個 BT）。
--      所以專案自己有成員名單、三級權限，跟其他地方一樣，指派照舊走 assign()。
--      以前「Add a project or camp」建的 custom:<代號>（不是活動、也不是整個 BT 的那幾個）改成 kind = 'project'，id 不動。
--   2. events.project_id、forms.project_id：這場活動、這份表單屬於哪個專案。可以是空的。
--
-- 誰能做什麼：
--   3. 開專案（create_project）：Co-President、Senior Adviser，或那個 team 是「改」以上的人（跟開活動同一條）。
--      「整個 BT」的專案只有 Co-President 與 Senior Adviser 開得了。開的人自動是那個專案的「管」。
--   4. 權限往下傳（ws_my_level）：
--      team 是「改」或「管」→ 那個 team 的每一個專案同一級（「看」不往下傳，跟活動一樣）。
--      專案是「改」或「管」→ 專案裡每一場活動同一級（「看」不往下傳：報名的人多是高中生，要看名單就被加進那一場或那個專案是「改」）。
--   5. 專案的報名表（create_project_form）：專案是「改」以上就建得了；那份表單的看與改跟著專案走（form_can_view / form_can_edit 多一條）。
--   6. 把活動放進專案（set_event_project）：那場活動與那個專案都要是「改」以上；專案要在同一個工作區或整個 BT。
--   7. 每一位幹部看得到有哪些專案（名字、在哪個工作區，跟每一位幹部看得到每一場活動一樣）。表單只回看得到的。
--   8. 場地不動（Paul：Keep it open），只是畫面上搬到「整個 BT」。
-- ============================================================================

begin;

-- ---------- 1. 專案是一種工作區 ----------
alter table public.workspaces drop constraint if exists workspaces_kind_check;
alter table public.workspaces add constraint workspaces_kind_check
  check (kind in ('passport', 'intern-passport', 'apps', 'res', 'custom', 'project'));

-- 以前「Add a project or camp」建的那幾個：不是活動、也不是整個 BT 的工具，就是專案。id 不改（指派掛在 id 上）。
update public.workspaces set kind = 'project'
 where kind = 'custom' and id not like 'custom:event-%'
   and id not in ('custom:records', 'custom:money', 'custom:meeting-templates', 'custom:team-forms',
                  'custom:marketing-requests', 'custom:marketing-approve');

-- ---------- 2. 活動與表單屬於哪個專案 ----------
alter table public.events add column if not exists project_id text references public.workspaces(id) on delete set null;
alter table public.forms  add column if not exists project_id text references public.workspaces(id) on delete set null;
create index if not exists events_project on public.events (project_id) where project_id is not null;
create index if not exists forms_project  on public.forms  (project_id) where project_id is not null;
comment on column public.events.project_id is '這場活動屬於哪個專案（workspaces.kind = project）。空的 = 直接在 team 底下。2026-12-26。';
comment on column public.forms.project_id  is '這份報名表屬於哪個專案。看與改跟著專案走（form_can_view / form_can_edit）。2026-12-26。';

-- ---------- 4. 權限往下傳 ----------
create or replace function public.ws_my_level(p_ws text)
returns text language sql stable security definer
set search_path = public, pg_temp
as $$
  select case max(r) when 3 then 'manage' when 2 then 'edit' when 1 then 'view' end from (
    select case a.level when 'manage' then 3 when 'edit' then 2 else 1 end as r
      from public.assignments a join public.profiles p on p.id = a.user_id and p.role = 'cadre'
     where a.workspace_id = p_ws and a.user_id = auth.uid()
    union all
    -- 一場活動或一個專案跟它的 team 走。team「看」的人不帶：報名名單裡多是高中生。
    select case a.level when 'manage' then 3 else 2 end
      from public.workspaces w
      join public.assignments a on a.workspace_id = 'res:' || w.team and a.user_id = auth.uid() and a.level in ('edit', 'manage')
      join public.profiles p on p.id = a.user_id and p.role = 'cadre'
     where w.id = p_ws and (w.id like 'custom:event-%' or w.kind = 'project') and w.team is not null
    union all
    -- 一場活動跟它的專案走（2026-12-26）。專案「看」的人不帶，理由同上。
    select case a.level when 'manage' then 3 else 2 end
      from public.events e
      join public.assignments a on a.workspace_id = e.project_id and a.user_id = auth.uid() and a.level in ('edit', 'manage')
      join public.profiles p on p.id = a.user_id and p.role = 'cadre'
     where e.workspace_id = p_ws and e.project_id is not null and p_ws like 'custom:event-%'
    union all
    -- 專案的 team 是「改」以上 → 專案裡的活動也是（專案沒有直接指派也算，跟 team → 活動那一條一樣）。
    select case a.level when 'manage' then 3 else 2 end
      from public.events e
      join public.workspaces pw on pw.id = e.project_id and pw.team is not null
      join public.assignments a on a.workspace_id = 'res:' || pw.team and a.user_id = auth.uid() and a.level in ('edit', 'manage')
      join public.profiles p on p.id = a.user_id and p.role = 'cadre'
     where e.workspace_id = p_ws and p_ws like 'custom:event-%'
  ) x;
$$;
revoke all on function public.ws_my_level(text) from public, anon, authenticated;

-- ---------- 3. 開專案 ----------
create or replace function public.create_project(p_team text, p_slug text, p_title_zh text, p_title_en text)
returns text language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_id text; v_uid uuid := auth.uid(); v_team text := nullif(btrim(coalesce(p_team, '')), '');
begin
  if not public.is_cadre() then raise exception 'not_cadre' using errcode = 'P0001'; end if;
  if v_team is null then
    if not public.is_senior() then raise exception 'not_senior' using errcode = 'P0001'; end if;
  else
    if not exists (select 1 from workspaces where id = 'res:' || v_team) then raise exception 'no_such_team' using errcode = 'P0001'; end if;
    if not (public.is_senior() or public.can_edit('res:' || v_team)) then raise exception 'not_team_editor' using errcode = 'P0001'; end if;
  end if;
  if coalesce(p_slug, '') !~ '^[a-z0-9-]{2,40}$' then raise exception 'bad_slug' using errcode = 'P0001'; end if;
  if coalesce(btrim(p_title_zh), '') = '' and coalesce(btrim(p_title_en), '') = '' then raise exception 'empty_title' using errcode = 'P0001'; end if;
  v_id := 'project:' || p_slug;
  if exists (select 1 from workspaces where id = v_id) then raise exception 'slug_taken' using errcode = 'P0001'; end if;
  insert into workspaces (id, kind, team, title_zh, title_en, owner)
  values (v_id, 'project', v_team, nullif(btrim(p_title_zh), ''), nullif(btrim(p_title_en), ''), v_uid);
  if not public.is_senior() then
    insert into assignments (user_id, workspace_id, level, granted_by) values (v_uid, v_id, 'manage', v_uid)
    on conflict (user_id, workspace_id) do update set level = 'manage';
  end if;
  perform public.log_role_change(v_uid, 'assignment', '', 'manage@' || v_id);
  return v_id;
end $$;
revoke all on function public.create_project(text, text, text, text) from public, anon;
grant execute on function public.create_project(text, text, text, text) to authenticated;

-- 改名、收起來（不刪：底下的活動與表單還掛著）。「管」以上。
create or replace function public.update_project(p_id text, p_title_zh text, p_title_en text, p_active boolean)
returns void language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (select 1 from workspaces where id = p_id and kind = 'project') then raise exception 'no_such_project' using errcode = 'P0001'; end if;
  if not public.can_manage(p_id) then raise exception 'not_ws_manage:%', p_id using errcode = 'P0001'; end if;
  if coalesce(btrim(p_title_zh), '') = '' and coalesce(btrim(p_title_en), '') = '' then raise exception 'empty_title' using errcode = 'P0001'; end if;
  update workspaces set title_zh = nullif(btrim(p_title_zh), ''), title_en = nullif(btrim(p_title_en), ''), active = coalesce(p_active, active)
   where id = p_id;
end $$;
revoke all on function public.update_project(text, text, text, boolean) from public, anon;
grant execute on function public.update_project(text, text, text, boolean) to authenticated;

-- ---------- 6. 把活動放進專案（p_project 空的 = 拿出來，直接放在 team 底下）----------
create or replace function public.set_event_project(p_event uuid, p_project text)
returns void language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_ev events%rowtype; v_pt text; v_pk text;
begin
  select * into v_ev from events where id = p_event;
  if not found then raise exception 'no_such_event' using errcode = 'P0001'; end if;
  -- 紀錄那邊倒進來的舊活動（workspace_id 是 custom:records）不能放進專案：權限是跟著 workspace_id 往下傳的，
  -- 放進去等於把整個紀錄工作區交給專案的人。
  if v_ev.workspace_id not like 'custom:event-%' then raise exception 'not_site_event' using errcode = 'P0001'; end if;
  if not public.can_edit(v_ev.workspace_id) then raise exception 'not_ws_edit:%', v_ev.workspace_id using errcode = 'P0001'; end if;
  if nullif(p_project, '') is not null then
    select team, kind into v_pt, v_pk from workspaces where id = p_project and active;
    if v_pk is distinct from 'project' then raise exception 'no_such_project' using errcode = 'P0001'; end if;
    if not public.can_edit(p_project) then raise exception 'not_ws_edit:%', p_project using errcode = 'P0001'; end if;
    if v_pt is not null and v_pt is distinct from v_ev.team then raise exception 'other_team' using errcode = 'P0001'; end if;
  end if;
  update events set project_id = nullif(p_project, '') where id = p_event;
end $$;
revoke all on function public.set_event_project(uuid, text) from public, anon;
grant execute on function public.set_event_project(uuid, text) to authenticated;

-- ---------- 5. 專案的報名表 ----------
-- 表單的 team 填專案的工作區；整個 BT 的專案填開的人自己的第一個 team（forms.team 不能空，畫面上看專案不看這一欄）。
create or replace function public.create_project_form(p_project text, p_title text)
returns uuid language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_team text; v_kind text; v_id uuid; v_uid uuid := auth.uid();
begin
  select team, kind into v_team, v_kind from workspaces where id = p_project and active;
  if v_kind is distinct from 'project' then raise exception 'no_such_project' using errcode = 'P0001'; end if;
  if not public.can_edit(p_project) then raise exception 'not_ws_edit:%', p_project using errcode = 'P0001'; end if;
  if coalesce(btrim(p_title), '') = '' then raise exception 'empty_title' using errcode = 'P0001'; end if;
  if v_team is null then
    select nullif(btrim(split_part(regexp_replace(coalesce(team, ''), '[、;；]', ',', 'g'), ',', 1)), '') into v_team from profiles where id = v_uid;
  end if;
  insert into forms (team, kind, title, status, created_by, project_id)
  values (coalesce(v_team, 'Board'), 'program', btrim(p_title), 'draft', v_uid, p_project)
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.create_project_form(text, text) from public, anon;
grant execute on function public.create_project_form(text, text) to authenticated;

create or replace function public.form_can_view(p_form uuid)
returns boolean language sql stable security definer
set search_path = public, pg_temp
as $$ select public.can_view('apps')
          or exists (select 1 from public.events e where e.form_id = p_form and public.can_view(e.workspace_id))
          or exists (select 1 from public.forms f where f.id = p_form and f.project_id is not null and public.can_view(f.project_id)); $$;
create or replace function public.form_can_edit(p_form uuid)
returns boolean language sql stable security definer
set search_path = public, pg_temp
as $$ select public.can_edit('apps')
          or exists (select 1 from public.events e where e.form_id = p_form and public.can_edit(e.workspace_id))
          or exists (select 1 from public.forms f where f.id = p_form and f.project_id is not null and public.can_edit(f.project_id)); $$;

-- ---------- 7. 專案清單：每一位幹部看得到有哪些專案；表單只回看得到的 ----------
-- 回 [{ id, team, title_zh, title_en, active, level, events: [活動 id], forms: [{ id, title, status, received, total }] }]。
create or replace function public.projects_list()
returns jsonb language sql stable security definer
set search_path = public, pg_temp
as $$
  select case when not public.is_cadre() then '[]'::jsonb else coalesce(jsonb_agg(jsonb_build_object(
    'id', w.id, 'team', w.team, 'title_zh', w.title_zh, 'title_en', w.title_en, 'active', w.active,
    'level', case when public.is_senior() then 'manage' else public.ws_my_level(w.id) end,
    'events', coalesce((select jsonb_agg(e.id order by e.starts_at nulls last, e.created_at) from events e where e.project_id = w.id), '[]'::jsonb),
    'forms', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'title', f.title, 'status', f.status,
                                'received', (select count(*) from applications a where a.form_id = f.id and a.status = 'received'),
                                'total', (select count(*) from applications a where a.form_id = f.id)) order by f.created_at)
                         from forms f where f.project_id = w.id and public.form_can_view(f.id)), '[]'::jsonb)
  ) order by w.team nulls first, w.created_at), '[]'::jsonb) end
  from workspaces w where w.kind = 'project';
$$;
revoke all on function public.projects_list() from public, anon;
grant execute on function public.projects_list() to authenticated;

-- ---------- my_access：專案與專案裡的活動也帶 team／專案那一層 ----------
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
              or ((w2.id like 'custom:event-%' or w2.kind = 'project') and ('res:' || w2.team) in (select a.workspace_id from assignments a where a.user_id = p.id and a.level in ('edit', 'manage')))
              or w2.id in (select e.workspace_id from events e
                            join workspaces pw on pw.id = e.project_id
                           where e.project_id in (select a.workspace_id from assignments a where a.user_id = p.id and a.level in ('edit', 'manage'))
                              or ('res:' || pw.team) in (select a.workspace_id from assignments a where a.user_id = p.id and a.level in ('edit', 'manage')))
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

commit;

-- ---------- 驗收 ----------
select * from (
  with fn as (select proname, prosrc as body from pg_proc where pronamespace = 'public'::regnamespace),
  t as (select
      (select pg_get_constraintdef(oid) like '%project%' from pg_constraint where conname = 'workspaces_kind_check') as kind_ok,
      exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'events' and column_name = 'project_id') as ev_col,
      exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'forms' and column_name = 'project_id') as fm_col,
      (select body like '%e.project_id%' and body like '%w.kind = ''project''%' and body like '%p_ws like ''custom:event-%%' from fn where proname = 'ws_my_level') as inherit,
      not has_function_privilege('authenticated', 'public.ws_my_level(text)', 'execute') as lvl_locked,
      (select body like '%can_edit(''res:'' || v_team)%' and body like '%not_senior%' from fn where proname = 'create_project') as cp,
      (select bool_and(body like '%f.project_id%') from fn where proname in ('form_can_view', 'form_can_edit')) as forms_rule,
      (select body like '%other_team%' and body like '%can_edit(p_project)%' and body like '%not_site_event%' from fn where proname = 'set_event_project') as sep,
      has_function_privilege('authenticated', 'public.projects_list()', 'execute')
        and not has_function_privilege('anon', 'public.projects_list()', 'execute') as list_ok,
      (select body like '%w2.kind = ''project''%' from fn where proname = 'my_access') as access,
      (select count(*) from public.workspaces where kind = 'custom' and id not like 'custom:event-%'
          and id not in ('custom:records', 'custom:money', 'custom:meeting-templates', 'custom:team-forms', 'custom:marketing-requests', 'custom:marketing-approve')) as loose_left,
      (select string_agg(id, '、' order by id) from public.workspaces where kind = 'project') as projects
  )
  select 0 ord, 'OVERALL' as 項目, null::text as 應該是, null::text as 實際是,
    case when kind_ok and ev_col and fm_col and inherit and lvl_locked and cp and forms_rule and sep and list_ok and access and loose_left = 0
         then 'PASS' else 'FAIL' end as 結果 from t
  union all select 1,  '工作區可以是專案（kind = project）', 'true', kind_ok::text, case when kind_ok then 'PASS' else 'FAIL' end from t
  union all select 2,  '活動有 project_id', 'true', ev_col::text, case when ev_col then 'PASS' else 'FAIL' end from t
  union all select 3,  '表單有 project_id（一個專案好幾份報名表）', 'true', fm_col::text, case when fm_col then 'PASS' else 'FAIL' end from t
  union all select 4,  '★ team →專案、專案 → 活動，只帶「改」與「管」', 'true', inherit::text, case when inherit then 'PASS' else 'FAIL' end from t
  union all select 5,  '★ 前端叫不到 ws_my_level', 'true', lvl_locked::text, case when lvl_locked then 'PASS' else 'FAIL' end from t
  union all select 6,  '★ 開專案：team 是「改」以上；整個 BT 只有 senior', 'true', cp::text, case when cp then 'PASS' else 'FAIL' end from t
  union all select 7,  '★ 專案的報名表跟著專案的權限走', 'true', coalesce(forms_rule, false)::text, case when forms_rule then 'PASS' else 'FAIL' end from t
  union all select 8,  '★ 活動放進專案：兩邊都要「改」，不能跨 team，紀錄的舊活動不行', 'true', sep::text, case when sep then 'PASS' else 'FAIL' end from t
  union all select 9,  '專案清單給幹部，不給沒登入的人', 'true', list_ok::text, case when list_ok then 'PASS' else 'FAIL' end from t
  union all select 10, 'my_access 帶專案那一層', 'true', access::text, case when access then 'PASS' else 'FAIL' end from t
  union all select 11, '以前的 custom 專案都轉成專案了', '0', loose_left::text, case when loose_left = 0 then 'PASS' else 'FAIL' end from t
  union all select 12, '（資訊）現在有哪些專案', '（看一眼）', coalesce(projects, '（還沒有）'), 'PASS' from t
) x order by ord;
