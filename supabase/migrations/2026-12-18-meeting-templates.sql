-- 2026-12-18：會議範本與會議紀錄（Paul 2026-11-13：「Log a meeting 沒有地方打字，不同的會開法不一樣，
-- 我要能編一份範本，記會議的時候選那份範本然後直接打」）。
--
-- 用法：整份貼進 Supabase SQL Editor 按一次 Run。可以重跑。最後印一張 PASS / FAIL 表。
-- 依賴：2026-11-02-meetings.sql（meetings、can_schedule）、2026-10-24-ranks-and-workspaces.sql（workspaces、can_edit）。
--
-- ============================================================================
-- 這一支在做什麼
-- ============================================================================
--   1. 一張新表 meeting_templates：標題、適用範圍（board、某個 team，或空的＝每一種會都能用）、
--      幾段小標題（sections，每段一個標題 h 加一句提示 hint）、封存。
--   2. meetings 多兩欄：template_id（用哪一份範本開的）、minutes（會議紀錄，每段一個標題 h 加內文 text）。
--      **不叫 notes**：前端的 m.notes 已經是出席回覆的理由。
--   3. 一個工作區 custom:meeting-templates（擁有人是 Co-President）。誰能改範本由 Paul 在後台「工作區」派：
--      edit 或 manage 就能新增、改、封存範本。Co-President 與 Senior Adviser 本來就可以。
--   4. 函式：save_meeting_template、archive_meeting_template、save_meeting_minutes。
--      會議紀錄誰能寫：排得了這種會的人（can_schedule）、這場會的出席名單上的人、建這場會的人。
--   5. RLS：幹部讀範本（跟會議紀錄本來就全部幹部看得到一樣）；沒有寫的政策，一律走函式。
--   6. 三份預設範本（週會、team 會、活動檢討），Paul 可以直接改或封存。
-- 不動既有資料：既有會議的 minutes 是空陣列。
-- ============================================================================

begin;

-- ---------- 1. 誰能改範本的工作區 ----------
do $$
declare v_owner uuid;
begin
  select id into v_owner from public.profiles where role = 'cadre' and board_role = 'president' order by updated_at limit 1;
  insert into public.workspaces (id, kind, team, title_zh, title_en, owner)
  values ('custom:meeting-templates', 'custom', null, '會議範本（誰能改）', 'Meeting templates (who can edit)', v_owner)
  on conflict (id) do nothing;
end $$;

-- ---------- 2. 表 ----------
create table if not exists public.meeting_templates (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (btrim(title) <> ''),
  scope       text,
  sections    jsonb not null default '[]'::jsonb check (jsonb_typeof(sections) = 'array'),
  archived    boolean not null default false,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
comment on table public.meeting_templates is
  '會議範本。scope 空的＝每一種會都能選；board 或 team 名＝只在那種會的下拉選單排前面（其他會還是選得到）。
   sections 是 [{h: 小標題, hint: 一句提示}]，記會議時每段變成一個打字的大框。';

alter table public.meetings add column if not exists template_id uuid references public.meeting_templates(id) on delete set null;
alter table public.meetings add column if not exists minutes jsonb not null default '[]'::jsonb;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'meetings_minutes_array') then
    alter table public.meetings add constraint meetings_minutes_array check (jsonb_typeof(minutes) = 'array');
  end if;
end $$;

alter table public.meeting_templates enable row level security;
revoke all on public.meeting_templates from anon, authenticated;
grant select on public.meeting_templates to authenticated;
drop policy if exists meeting_templates_read on public.meeting_templates;
create policy meeting_templates_read on public.meeting_templates for select to authenticated using (public.is_cadre());

-- ---------- 3. 門 ----------
create or replace function public.can_edit_meeting_templates()
returns boolean language sql stable security definer
set search_path = public, pg_temp
as $$ select public.is_cadre() and public.can_edit('custom:meeting-templates') $$;
revoke all on function public.can_edit_meeting_templates() from public, anon;
grant execute on function public.can_edit_meeting_templates() to authenticated;

-- 把前端送來的段落洗乾淨：只留 h 與另一個欄位（hint 或 text），去頭尾空白，最多 20 段，每段內文最多 20000 字。
create or replace function public.clean_meeting_sections(p jsonb, p_body text)
returns jsonb language sql immutable
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(jsonb_build_object('h', left(btrim(coalesce(e->>'h', '')), 120),
                                               p_body, left(coalesce(e->>p_body, ''), 20000)) order by o), '[]'::jsonb)
    from jsonb_array_elements(case when jsonb_typeof(p) = 'array' then p else '[]'::jsonb end) with ordinality as x(e, o)
   where o <= 20 and jsonb_typeof(e) = 'object'
     and (btrim(coalesce(e->>'h', '')) <> '' or btrim(coalesce(e->>p_body, '')) <> '');
$$;
revoke all on function public.clean_meeting_sections(jsonb, text) from public, anon;

-- ---------- 4. 範本：建或改、封存 ----------
create or replace function public.save_meeting_template(p_id uuid, p_title text, p_scope text, p_sections jsonb)
returns uuid language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_id uuid; v_scope text := nullif(btrim(coalesce(p_scope, '')), '');
begin
  if not public.can_edit_meeting_templates() then raise exception 'not_allowed' using errcode = 'P0001'; end if;
  if coalesce(btrim(p_title), '') = '' then raise exception 'empty_title' using errcode = 'P0001'; end if;
  if jsonb_array_length(public.clean_meeting_sections(p_sections, 'hint')) = 0 then raise exception 'no_sections' using errcode = 'P0001'; end if;
  if p_id is null then
    insert into public.meeting_templates (title, scope, sections, created_by)
    values (left(btrim(p_title), 120), v_scope, public.clean_meeting_sections(p_sections, 'hint'), auth.uid())
    returning id into v_id;
  else
    update public.meeting_templates
       set title = left(btrim(p_title), 120), scope = v_scope,
           sections = public.clean_meeting_sections(p_sections, 'hint'), updated_at = now()
     where id = p_id returning id into v_id;
    if v_id is null then raise exception 'no_such_template' using errcode = 'P0001'; end if;
  end if;
  return v_id;
end $$;
revoke all on function public.save_meeting_template(uuid, text, text, jsonb) from public, anon;
grant execute on function public.save_meeting_template(uuid, text, text, jsonb) to authenticated;

-- 封存（不刪：用過這份範本的會議還指著它）。p_archived = false 是拿回來。
create or replace function public.archive_meeting_template(p_id uuid, p_archived boolean default true)
returns void language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if not public.can_edit_meeting_templates() then raise exception 'not_allowed' using errcode = 'P0001'; end if;
  update public.meeting_templates set archived = coalesce(p_archived, true), updated_at = now() where id = p_id;
  if not found then raise exception 'no_such_template' using errcode = 'P0001'; end if;
end $$;
revoke all on function public.archive_meeting_template(uuid, boolean) from public, anon;
grant execute on function public.archive_meeting_template(uuid, boolean) to authenticated;

-- ---------- 5. 會議紀錄 ----------
-- 誰能寫：排得了這種會的人、出席名單上的人、建這場會的人。只改 template_id 與 minutes，不碰時間與名單、不寄信。
create or replace function public.save_meeting_minutes(p_id uuid, p_template uuid, p_minutes jsonb)
returns void language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_m record;
begin
  if not public.is_cadre() then raise exception 'not_cadre' using errcode = 'P0001'; end if;
  select id, scope, created_by into v_m from public.meetings where id = p_id;
  if v_m.id is null then raise exception 'no_such_meeting' using errcode = 'P0001'; end if;
  -- coalesce 不能拿掉：created_by 是空的（舊會、補記的會）時 = 會得到 null，整句 not (…) 變 null，if 就不會擋。
  if not (public.can_schedule(v_m.scope)
          or coalesce(v_m.created_by = auth.uid(), false)
          or exists (select 1 from public.meeting_attendees a where a.meeting_id = p_id and a.user_id = auth.uid())) then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  if p_template is not null and not exists (select 1 from public.meeting_templates t where t.id = p_template) then
    raise exception 'no_such_template' using errcode = 'P0001';
  end if;
  update public.meetings
     set template_id = p_template, minutes = public.clean_meeting_sections(p_minutes, 'text'), updated_at = now()
   where id = p_id;
end $$;
revoke all on function public.save_meeting_minutes(uuid, uuid, jsonb) from public, anon;
grant execute on function public.save_meeting_minutes(uuid, uuid, jsonb) to authenticated;

-- ---------- 6. 三份預設範本（只在一份都沒有的時候放） ----------
insert into public.meeting_templates (title, scope, sections)
select x.title, x.scope, x.sections::jsonb
  from (values
    ('週會 Weekly board meeting', 'board',
     '[{"h":"上週進度 Last week","hint":"每個 team 一兩句：做完什麼、卡在哪"},
       {"h":"這週要決定的事 Decisions","hint":"一件一行，寫清楚決定了什麼"},
       {"h":"誰做什麼 Action items","hint":"誰／做什麼／哪天前"},
       {"h":"下次會議 Next meeting","hint":"時間、要先準備什麼"}]'),
    ('Team 會議 Team meeting', null,
     '[{"h":"這週做了什麼 Updates","hint":"每個人一兩句"},
       {"h":"卡住的地方 Blockers","hint":"需要誰幫忙"},
       {"h":"誰做什麼 Action items","hint":"誰／做什麼／哪天前"}]'),
    ('活動檢討 Event debrief', null,
     '[{"h":"做得好的 What went well","hint":""},
       {"h":"下次要改的 What to change","hint":"具體到下次怎麼做"},
       {"h":"數字 Numbers","hint":"到了幾人、回饋、花了多少"},
       {"h":"誰做什麼 Action items","hint":"誰／做什麼／哪天前"}]')
  ) as x(title, scope, sections)
 where not exists (select 1 from public.meeting_templates);

commit;

-- ---------- 驗收 ----------
select * from (
  with t as (
    select (select count(*) from pg_tables where schemaname = 'public' and tablename = 'meeting_templates' and rowsecurity) = 1 as rls_on,
           (select count(*) from pg_policies where schemaname = 'public' and tablename = 'meeting_templates' and cmd <> 'SELECT') = 0 as no_write_pol,
           (select not has_table_privilege('anon', 'public.meeting_templates', 'select')
               and not has_table_privilege('authenticated', 'public.meeting_templates', 'insert')
               and not has_table_privilege('authenticated', 'public.meeting_templates', 'update')) as no_table_priv,
           (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'meetings' and column_name in ('template_id', 'minutes')) = 2 as cols,
           exists (select 1 from public.workspaces where id = 'custom:meeting-templates') as ws,
           (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname in ('save_meeting_template', 'archive_meeting_template')
              and regexp_replace(prosrc, '--[^\n]*', '', 'g') like '%not public.can_edit_meeting_templates()%') = 2 as tpl_gates,
           (select regexp_replace(prosrc, '--[^\n]*', '', 'g') like '%can_schedule(v_m.scope)%' and prosrc like '%meeting_attendees%' and prosrc like '%coalesce(v_m.created_by = auth.uid(), false)%'
              from pg_proc where pronamespace = 'public'::regnamespace and proname = 'save_meeting_minutes') as min_gate,
           (select count(*) from pg_proc p where p.pronamespace = 'public'::regnamespace
              and p.proname in ('save_meeting_template', 'archive_meeting_template', 'save_meeting_minutes', 'can_edit_meeting_templates')
              and has_function_privilege('anon', p.oid, 'execute')) = 0 as anon_out,
           (select count(*) from public.meeting_templates) >= 1 as seeded
  )
  select 0 ord, 'OVERALL' as 項目, null::text as 應該是, null::text as 實際是,
    case when rls_on and no_write_pol and no_table_priv and cols and ws and tpl_gates and min_gate and anon_out and seeded then 'PASS' else 'FAIL' end as 結果 from t
  union all select 1, '★ 範本表開了 RLS', 'true', rls_on::text, case when rls_on then 'PASS' else 'FAIL' end from t
  union all select 2, '★ 範本表沒有寫的政策', 'true', no_write_pol::text, case when no_write_pol then 'PASS' else 'FAIL' end from t
  union all select 3, '★ 沒登入讀不到、登入也不能直接寫', 'true', no_table_priv::text, case when no_table_priv then 'PASS' else 'FAIL' end from t
  union all select 4, '會議多了 template_id 與 minutes 兩欄', 'true', cols::text, case when cols then 'PASS' else 'FAIL' end from t
  union all select 5, '「會議範本」工作區在（Paul 可以派人）', 'true', ws::text, case when ws then 'PASS' else 'FAIL' end from t
  union all select 6, '★ 改範本的兩支函式第一句問門', 'true', tpl_gates::text, case when tpl_gates then 'PASS' else 'FAIL' end from t
  union all select 7, '★ 寫紀錄只給排會的人、出席的人、建會的人', 'true', min_gate::text, case when min_gate then 'PASS' else 'FAIL' end from t
  union all select 8, '★ anon 叫不到任何一支', 'true', anon_out::text, case when anon_out then 'PASS' else 'FAIL' end from t
  union all select 9, '有預設範本', 'true', seeded::text, case when seeded then 'PASS' else 'FAIL' end from t
) x order by ord;
