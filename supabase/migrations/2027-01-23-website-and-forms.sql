-- 2027-01-23：對外網站變成一個要派人的工作區，加上「所有表單」那一頁要的一支讀取函式（2026-11-27 Paul 看過第二版提案說照建議做）。
--
-- Paul 2026-11-27：「websites should be something that they assign to」「for forms… they should be able to know like what's going on and like what form is for what」。
--
-- 這一支做三件事：
--   1. 工作區 custom:website（對外網站）。在「人與權限 → 工作區」派人，跟紀錄、錢一樣。
--   2. 被派進對外網站「改」以上的人，改得動 BT 歷史之路與 BT 島（每一座島、島上的貼文、協作線）。
--      **只有加，沒有拿掉**：原本改得動的人（Co-President、Senior Adviser、Marketing「改」以上改歷史之路、
--      某個 team「改」以上改自己那座島、Marketing「管」改每一座島）照舊改得動。
--      網站上的活動、團隊頁、校友故事、信的文字照舊只有 Co-President 與 Senior Adviser。資源庫照舊是那個 team「改」以上。
--   3. my_forms()：「所有表單」那一頁（/admin/team-forms/#all）一次拿到三種表單，每一份標是哪一種、哪一場活動的、開著沒、收了幾份。
--      **它不多給任何人任何東西**：每一種都用原本那一套的門過濾（報名表 form_can_view、回饋表 rc_form_reader、內部表單 tf_is_reader），
--      回的只有標題、狀態、份數這些清單上本來就看得到的欄位，沒有任何一份答案。
--      另外回「我改得動的活動」（can_edit(那場的工作區)），給「建一份」選要掛在哪一場上；真的建的時候照舊是 attach_event_form 與 rc_save_form 自己擋。
--
-- 沒有動任何一張表的 RLS（政策），也沒有改任何資料。重跑安全。
-- 跑完看最下面那一張表，OVERALL 要是 PASS。

begin;

-- ---------- 1. 工作區 custom:website ----------
do $$
declare v_owner uuid;
begin
  select id into v_owner from public.profiles where role = 'cadre' and board_role = 'president' order by updated_at limit 1;
  insert into public.workspaces (id, kind, team, title_zh, title_en, owner)
  values ('custom:website', 'custom', null, '對外網站（歷史之路、BT 島）', 'Website (history road, BT Island)', v_owner)
  on conflict (id) do update set active = true;
end $$;

-- ---------- 2. 歷史之路與 BT 島多認對外網站那一格 ----------
create or replace function public.can_edit_history()
returns boolean language sql stable security definer
set search_path = public, pg_temp
as $$ select public.is_senior() or public.can_edit('res:Marketing Team') or public.can_edit('custom:website') $$;

-- BT 島的每一個門（貼文、每一座島、協作線與聚會所）都走這一支（2026-12-29、2026-12-30 那兩支），改這裡一次就全部有。
create or replace function public.can_edit_island_post(p_team text)
returns boolean language sql stable security definer
set search_path = public, pg_temp
as $$
  select public.is_senior()
      or public.can_manage('res:Marketing Team')
      or public.can_edit('custom:website')
      or (coalesce(p_team, '') <> '' and public.can_edit('res:' || p_team));
$$;
revoke all on function public.can_edit_island_post(text) from public;
grant execute on function public.can_edit_island_post(text) to anon, authenticated;

-- ---------- 3. 所有表單：my_forms() ----------
-- 回 { signup: [...], feedback: [...], internal: [...], events: [...], can_create_internal }。
--   signup：報名表（forms 表）。看得到的那幾份（form_can_view：申請工作區，或那場活動、那個專案的工作區）。
--           event 是掛在哪一場活動上（沒有就是 null），project 是哪個專案。received 是還沒審的份數，total 是全部。
--   feedback：回饋表（rc_forms）。讀得到答案的那幾份（rc_form_reader），配對回饋照舊只有管的人與讀者名單。
--   internal：內部表單（tf_forms）。讀得到結果的那幾份（tf_is_reader）。
--   events：我改得動的活動（不含匯入的舊活動），最新的在前面。has_form 是已經有報名表了。
--   每一份都帶 can_edit：改得動才是 true，畫面上「改」的連結只畫給他。
create or replace function public.my_forms()
returns jsonb language plpgsql stable security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'cadre') then raise exception 'not_cadre' using errcode = 'P0001'; end if;
  return jsonb_build_object(
    'signup', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', f.id, 'title', f.title, 'status', f.status, 'team', f.team, 'kind', f.kind, 'updated_at', f.updated_at,
               'event', (select jsonb_build_object('id', e.id, 'slug', e.slug, 'title_zh', e.title_zh, 'title_en', e.title_en, 'status', e.status, 'starts_at', e.starts_at)
                           from public.events e where e.form_id = f.id limit 1),
               'project', (select jsonb_build_object('id', w.id, 'title_zh', w.title_zh, 'title_en', w.title_en) from public.workspaces w where w.id = f.project_id),
               'received', (select count(*) from public.applications a where a.form_id = f.id and a.status = 'received'),
               'total', (select count(*) from public.applications a where a.form_id = f.id),
               'can_edit', public.form_can_edit(f.id)) order by f.updated_at desc)
        from public.forms f where public.form_can_view(f.id)), '[]'::jsonb),
    'feedback', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', f.id, 'title', f.title, 'status', f.status, 'kind', f.kind, 'updated_at', f.updated_at, 'closes_at', f.closes_at,
               'event', (select jsonb_build_object('id', e.id, 'slug', e.slug, 'title_zh', e.title_zh, 'title_en', e.title_en, 'status', e.status, 'starts_at', e.starts_at)
                           from public.events e where e.id = f.event_id),
               'responses', (select count(*) from public.rc_responses r where r.form_id = f.id),
               'can_edit', public.rc_form_editor(f.id)) order by f.updated_at desc)
        from public.rc_forms f where public.rc_form_reader(f.id)), '[]'::jsonb),
    'internal', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', f.id, 'title', f.title, 'status', f.status, 'updated_at', f.updated_at, 'closes_at', f.closes_at, 'anonymous', f.anonymous,
               'responses', (select count(*) from public.tf_responses r where r.form_id = f.id),
               'recipients', (select count(*) from public.tf_recipient_ids(f.id)),
               'can_edit', public.tf_is_editor(f.id)) order by f.updated_at desc)
        from public.tf_forms f where public.tf_is_reader(f.id)), '[]'::jsonb),
    'events', coalesce((
      select jsonb_agg(jsonb_build_object('id', e.id, 'slug', e.slug, 'team', e.team, 'title_zh', e.title_zh, 'title_en', e.title_en,
                                          'status', e.status, 'starts_at', e.starts_at, 'has_form', e.form_id is not null)
                       order by e.starts_at desc nulls first, e.created_at desc)
        from public.events e where e.source <> 'import' and public.can_edit(e.workspace_id)), '[]'::jsonb),
    'can_create_internal', public.tf_can_create());
end $$;
revoke all on function public.my_forms() from public, anon;
grant execute on function public.my_forms() to authenticated;

commit;

-- ---------- 驗收 ----------
select * from (
  with s as (
    select
      (select count(*) from public.workspaces where id = 'custom:website' and kind = 'custom' and active) as ws,
      (select prosrc from pg_proc where proname = 'can_edit_history' and pronamespace = 'public'::regnamespace) as hist_src,
      (select prosrc from pg_proc where proname = 'can_edit_island_post' and pronamespace = 'public'::regnamespace) as isl_src,
      to_regprocedure('public.my_forms()') is not null as has_fn,
      coalesce(has_function_privilege('authenticated', 'public.my_forms()', 'execute'), false) as auth_ok,
      coalesce(has_function_privilege('anon', 'public.my_forms()', 'execute'), false) as anon_ok,
      (select prosrc from pg_proc where proname = 'my_forms' and pronamespace = 'public'::regnamespace) as mf_src,
      (select count(*) from pg_policies where schemaname = 'public' and tablename in ('forms', 'rc_forms', 'tf_forms', 'history_milestones', 'island_posts')) as policies
  ),
  t as (
    select *,
      hist_src like '%res:Marketing Team%' and hist_src like '%custom:website%' and hist_src like '%is_senior%' as hist_ok,
      isl_src like '%can_manage(''res:Marketing Team'')%' and isl_src like '%custom:website%' and isl_src like '%''res:'' || p_team%' as isl_ok,
      mf_src like '%not_cadre%' and mf_src like '%form_can_view(f.id)%' and mf_src like '%rc_form_reader(f.id)%' and mf_src like '%tf_is_reader(f.id)%'
        and mf_src like '%can_edit(e.workspace_id)%' as gates_ok,
      mf_src not like '%answers%' and mf_src not like '%email%' as no_answers
    from s
  )
  select 0 ord, 'OVERALL' as 項目, null::text as 應該是, null::text as 實際是,
    case when ws = 1 and hist_ok and isl_ok and has_fn and auth_ok and not anon_ok and gates_ok and no_answers then 'PASS' else 'FAIL' end as 結果 from t
  union all select 1, '工作區 custom:website 在（人與權限 → 工作區派得了人）', '1', ws::text, case when ws = 1 then 'PASS' else 'FAIL' end from t
  union all select 2, '★ 歷史之路：原本的 senior 與 Marketing「改」還在，多認對外網站', 'true', hist_ok::text, case when hist_ok then 'PASS' else 'FAIL' end from t
  union all select 3, '★ BT 島：原本的 Marketing「管」與那個 team「改」還在，多認對外網站', 'true', isl_ok::text, case when isl_ok then 'PASS' else 'FAIL' end from t
  union all select 4, '★ my_forms 登入的人叫得動、沒登入的叫不動', 'true / false', auth_ok::text || ' / ' || anon_ok::text,
    case when has_fn and auth_ok and not anon_ok then 'PASS' else 'FAIL' end from t
  union all select 5, '★ my_forms 三種表單各用原本那一套的門過濾，活動只列改得動的', 'true', gates_ok::text, case when gates_ok then 'PASS' else 'FAIL' end from t
  union all select 6, '★ my_forms 不回任何答案與 email', 'true', no_answers::text, case when no_answers then 'PASS' else 'FAIL' end from t
  union all select 7, '這幾張表的 RLS 政策有幾條（這一支沒動，跑前跑後一樣）', '', policies::text, 'INFO' from t
) x order by ord;
