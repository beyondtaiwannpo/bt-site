-- 免費資源的大標：在後台自己取名字（2026-11-25）。
--
-- Paul 的原話：
--   「at the backstage you can just let us name what resources, the big heading is… right now under resources
--     there's resources book, but I'm trying to rename resources into maybe, I don't know, college intro,
--     mentee mentor story, and stuff like that.」
--
-- 現在 /resources/ 只有一個大標「資源」，底下一整排。這一支讓資源可以分在幾個大標底下，
-- 大標叫什麼、排第幾個，在後台「資源」那一頁自己改，不用動程式。
--
-- 這一支做什麼：
--   1. 新的一張表 resource_sections：一列是一個大標（中文名、英文名、排序）。
--      大標是對外的字，沒登入的人也讀得到；寫只能走下面那兩支函式，前端直接寫不進去。
--   2. resources 多一欄 section_id：這一筆放在哪一個大標底下。空的就是「沒有分」，
--      對外頁把它放在原本那個「資源」底下。刪掉一個大標，底下的資源不會被刪，只是變回沒有分。
--   3. 兩支函式：save_resource_section（加一個或改一個）、delete_resource_section（刪一個）。
--      按得了的人：Co-President、Senior Adviser，或是至少在一個 team（res: 工作區）裡是「管」的人。
--      判斷只有一份，在 can_manage_resource_sections()，用的是原本就有的 is_senior() 與 can_manage()。
--
-- 沒有動的：
--   - **連結（url）還是只有登入的人讀得到。** 沒登入的人多讀得到的只有 section_id 這一欄，
--     下面那張表第 1 列會驗一次。
--   - resources 的四條政策一行都沒改：誰改得了哪一筆資源，照舊看那一筆的 team。
--     把一筆資源放進哪一個大標，走的就是原本改資源的那條路。
--   - 沒有預先放任何大標。現有的資源 section_id 都是空的，對外頁跑完之後跟跑之前長得一樣，
--     直到有人在後台加第一個大標、把資源放進去。
--   - 沒有動任何人的角色與職級。
--
-- 可以重跑。跑完看最後那張表，前 8 列都要是 PASS，第 9、10 列是數字。
-- 要整個還原：
--   alter table public.resources drop column if exists section_id;
--   drop function if exists public.save_resource_section(uuid, text, text, integer);
--   drop function if exists public.delete_resource_section(uuid);
--   drop function if exists public.can_manage_resource_sections();
--   drop table if exists public.resource_sections;

begin;

-- ---------- 1. 大標 ----------
create table if not exists public.resource_sections (
  id         uuid primary key default gen_random_uuid(),
  name_zh    text not null check (btrim(name_zh) <> '' and char_length(name_zh) <= 60),
  name_en    text check (name_en is null or (btrim(name_en) <> '' and char_length(name_en) <= 60)),
  ord        int not null default 100,
  created_at timestamptz not null default now()
);
comment on table public.resource_sections is
  '/resources/ 上的大標（例如「大學介紹」「Mentee 與 Mentor 的故事」）。對外的字，誰都讀得到。
   寫只能走 save_resource_section() 與 delete_resource_section()。';
comment on column public.resource_sections.name_en is
  '英文版的大標。空的話英文版就用中文名。';
comment on column public.resource_sections.ord is
  '排序，小的在前。跟 resources.ord 同一個做法：插一個到中間給 55 就好。';

alter table public.resource_sections enable row level security;
revoke all on public.resource_sections from public, anon, authenticated;
grant select on public.resource_sections to anon, authenticated;
drop policy if exists rsec_read on public.resource_sections;
create policy rsec_read on public.resource_sections for select using (true);

-- ---------- 2. 資源放在哪一個大標底下 ----------
alter table public.resources
  add column if not exists section_id uuid references public.resource_sections(id) on delete set null;
comment on column public.resources.section_id is
  '這一筆放在哪一個大標底下。空的就是沒有分，對外頁放在原本的「資源」底下。大標被刪掉會自己變回空的。';
create index if not exists resources_section_idx on public.resources (section_id);

-- 沒登入的人多讀得到這一欄，對外頁才分得了組。**url 不在這裡面**，也不准加進來。
grant select (section_id) on public.resources to anon;

-- ---------- 3. 誰改得了大標 ----------
create or replace function public.can_manage_resource_sections()
returns boolean language sql stable security definer
set search_path = public, pg_temp
as $$
  select public.is_senior()
      or exists (select 1 from public.workspaces w where w.kind = 'res' and w.active and public.can_manage(w.id));
$$;
revoke all on function public.can_manage_resource_sections() from public, anon;
grant execute on function public.can_manage_resource_sections() to authenticated;

-- p_id 是空的就是加一個；有值就是改那一個。回那一個大標的 id。
create or replace function public.save_resource_section(p_id uuid, p_name_zh text, p_name_en text, p_ord integer)
returns uuid language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_zh text := btrim(coalesce(p_name_zh, ''));
  v_en text := nullif(btrim(coalesce(p_name_en, '')), '');
  v_id uuid;
begin
  if not public.can_manage_resource_sections() then raise exception 'not_section_manager' using errcode = 'P0001'; end if;
  if v_zh = '' then raise exception 'section_name_required' using errcode = 'P0001'; end if;
  if char_length(v_zh) > 60 or char_length(coalesce(v_en, '')) > 60 then raise exception 'section_name_too_long' using errcode = 'P0001'; end if;
  if p_id is null then
    if (select count(*) from resource_sections) >= 40 then raise exception 'too_many_sections' using errcode = 'P0001'; end if;
    insert into resource_sections (name_zh, name_en, ord) values (v_zh, v_en, coalesce(p_ord, 100)) returning id into v_id;
  else
    update resource_sections set name_zh = v_zh, name_en = v_en, ord = coalesce(p_ord, ord) where id = p_id returning id into v_id;
    if v_id is null then raise exception 'no_such_section' using errcode = 'P0001'; end if;
  end if;
  return v_id;
end $$;
revoke all on function public.save_resource_section(uuid, text, text, integer) from public, anon;
grant execute on function public.save_resource_section(uuid, text, text, integer) to authenticated;

-- 刪一個大標。底下的資源不刪，section_id 自己變回空的（外鍵 on delete set null）。回底下原本有幾筆資源。
create or replace function public.delete_resource_section(p_id uuid)
returns integer language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_n integer;
begin
  if not public.can_manage_resource_sections() then raise exception 'not_section_manager' using errcode = 'P0001'; end if;
  if not exists (select 1 from resource_sections where id = p_id) then raise exception 'no_such_section' using errcode = 'P0001'; end if;
  select count(*) into v_n from resources where section_id = p_id;
  delete from resource_sections where id = p_id;
  return v_n;
end $$;
revoke all on function public.delete_resource_section(uuid) from public, anon;
grant execute on function public.delete_resource_section(uuid) to authenticated;

commit;

-- ---------- 驗收 ----------
select * from (
  with fn as (select proname, oid, regexp_replace(prosrc, '--[^\n]*', '', 'g') as body from pg_proc where pronamespace = 'public'::regnamespace),
  pol as (select tablename, policyname, cmd, coalesce(qual, '') || ' ' || coalesce(with_check, '') as body from pg_policies where schemaname = 'public'),
  t as (
    select
      (select string_agg(column_name, ', ' order by column_name) from information_schema.column_privileges
        where table_schema = 'public' and table_name = 'resources' and grantee = 'anon' and privilege_type = 'SELECT') as anon_cols,
      not has_column_privilege('anon', 'public.resources', 'url', 'select') as url_hidden,
      has_column_privilege('anon', 'public.resources', 'section_id', 'select') as anon_section,
      not has_table_privilege('anon', 'public.resources', 'insert') and not has_table_privilege('anon', 'public.resources', 'update')
        and not has_table_privilege('anon', 'public.resources', 'delete') as anon_no_write,
      has_column_privilege('authenticated', 'public.resources', 'url', 'select') as member_url,
      (select relrowsecurity from pg_class where oid = 'public.resource_sections'::regclass) as rls_on,
      (select count(*) = 1 and bool_and(cmd = 'SELECT') from pol where tablename = 'resource_sections') as one_read_policy,
      has_table_privilege('anon', 'public.resource_sections', 'select') and has_table_privilege('authenticated', 'public.resource_sections', 'select') as sec_read,
      not has_table_privilege('anon', 'public.resource_sections', 'insert') and not has_table_privilege('anon', 'public.resource_sections', 'update')
        and not has_table_privilege('anon', 'public.resource_sections', 'delete')
        and not has_table_privilege('authenticated', 'public.resource_sections', 'insert') and not has_table_privilege('authenticated', 'public.resource_sections', 'update')
        and not has_table_privilege('authenticated', 'public.resource_sections', 'delete') as sec_no_write,
      (select bool_and(body like '%if not public.can_manage_resource_sections() then raise exception ''not_section_manager''%') and count(*) = 2
         from fn where proname in ('save_resource_section', 'delete_resource_section')) as gate_ok,
      (select body like '%public.is_senior()%' and body like '%w.kind = ''res''%' and body like '%public.can_manage(w.id)%' from fn where proname = 'can_manage_resource_sections') as rule_ok,
      (select bool_and(not has_function_privilege('anon', oid, 'execute') and has_function_privilege('authenticated', oid, 'execute')) and count(*) = 3
         from fn where proname in ('save_resource_section', 'delete_resource_section', 'can_manage_resource_sections')) as grants_ok,
      (select count(*) = 1 from pg_constraint where conrelid = 'public.resources'::regclass and contype = 'f'
          and confrelid = 'public.resource_sections'::regclass and confdeltype = 'n') as fk_set_null,
      (select count(*) = 4 and bool_and(body like '%''res:''%') and bool_or(cmd = 'SELECT' and body like '%published%')
         from pol where tablename = 'resources') as res_policies,
      (select count(*)::int from public.resource_sections) as n_sections,
      (select count(*)::int from public.resources where section_id is not null) as n_in,
      (select count(*)::int from public.resources where section_id is null) as n_out
  )
  select 0 ord, 'OVERALL' as 項目, null::text as 應該是, null::text as 實際是,
    case when url_hidden and anon_section and anon_no_write and member_url and rls_on and one_read_policy and sec_read and sec_no_write
              and gate_ok and rule_ok and grants_ok and fk_set_null and res_policies then 'PASS' else 'FAIL' end as 結果 from t
  union all select 1, '★ 沒登入的人還是讀不到連結（url），多讀得到的只有 section_id', 'id, title, blurb, kind, team, status, ord, updated_at, section_id（沒有 url）', anon_cols,
    case when url_hidden and anon_section and anon_no_write then 'PASS' else 'FAIL' end from t
  union all select 2, '登入的人照舊讀得到連結', 'true', coalesce(member_url, false)::text, case when member_url then 'PASS' else 'FAIL' end from t
  union all select 3, '大標那張表開了 RLS，只有一條讀的政策，誰都讀得到', 'true', coalesce(rls_on and one_read_policy and sec_read, false)::text, case when rls_on and one_read_policy and sec_read then 'PASS' else 'FAIL' end from t
  union all select 4, '★ 大標那張表前端直接寫不進去（沒登入與登入的人都沒有寫的權限）', 'true', coalesce(sec_no_write, false)::text, case when sec_no_write then 'PASS' else 'FAIL' end from t
  union all select 5, '★ 加、改、刪大標都先過同一道門', 'true', coalesce(gate_ok, false)::text, case when gate_ok then 'PASS' else 'FAIL' end from t
  union all select 6, '那道門：Co-President、Senior Adviser，或至少一個 team 的「管」', 'true', coalesce(rule_ok, false)::text, case when rule_ok then 'PASS' else 'FAIL' end from t
  union all select 7, '★ 三支函式沒登入的人都叫不到', 'true', coalesce(grants_ok, false)::text, case when grants_ok then 'PASS' else 'FAIL' end from t
  union all select 8, '刪掉大標，底下的資源留著（外鍵 on delete set null）；resources 的四條政策沒有動', 'true', coalesce(fk_set_null and res_policies, false)::text, case when fk_set_null and res_policies then 'PASS' else 'FAIL' end from t
  union all select 9, '（數字）現在有幾個大標', '', n_sections::text, 'INFO' from t
  union all select 10, '（數字）放進大標的資源有幾筆／還沒分的有幾筆', '', n_in::text || ' / ' || n_out::text, 'INFO' from t
) x order by ord;
