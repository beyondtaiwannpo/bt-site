-- 2026-12-14：場地資料庫（Paul 2026-11-10：「build a venue database，I wanna document all the venue and their point of contacts for future uses」）。
--   1. venues：一個場地一列（名字、種類、城市、地址、容納人數、費用、備註）。venue_contacts：那個場地的聯絡人，可以好幾位
--      （名字、職稱、email、電話、LINE、備註）。events 多一欄 venue_id，一場活動掛一個場地。
--   2. 誰看得到：每一位幹部（辦活動的人都要找場地）。誰改得動：Co-President 與被派進紀錄工作區的人（rc_can_manage），
--      Paul 2026-11-10 照提案拍板。聯絡人是場地方的大人，不是學員，但還是個資，所以表不開給前端，一律走下面的函式；anon 什麼都拿不到。
--   3. 一場活動掛哪個場地：那場活動工作區「改」以上的人，或改得動場地的人（set_event_venue）。活動的「地點」那一格是空的，
--      就順手填場地名字（對外頁面印的是「地點」，不是聯絡人）。
-- 可以重跑。最後印一張驗收表。
begin;

create table if not exists public.venues (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (trim(name) <> ''),
  kind       text not null default 'other' check (kind in ('school', 'university', 'coworking', 'cafe', 'company', 'government', 'hotel', 'online', 'other')),
  city       text not null default '',
  address    text not null default '',
  capacity   int check (capacity is null or capacity >= 0),
  cost       text not null default '',
  url        text not null default '',
  notes      text not null default '',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists venues_name_city on public.venues (lower(trim(name)), lower(trim(city)));
comment on table public.venues is '場地（2026-12-14）。每一位幹部看得到，Co-President 與紀錄工作區的人改得動。前端只走 venue_* 函式。';

create table if not exists public.venue_contacts (
  id         uuid primary key default gen_random_uuid(),
  venue_id   uuid not null references public.venues(id) on delete cascade,
  name       text not null default '',
  role       text not null default '',
  email      text not null default '',
  phone      text not null default '',
  line       text not null default '',
  note       text not null default '',
  created_at timestamptz not null default now(),
  check (trim(name) <> '' or trim(email) <> '' or trim(phone) <> '' or trim(line) <> '')
);
create index if not exists venue_contacts_venue on public.venue_contacts (venue_id);

alter table public.events add column if not exists venue_id uuid references public.venues(id) on delete set null;
create index if not exists events_venue on public.events (venue_id);

alter table public.venues enable row level security;
alter table public.venue_contacts enable row level security;
revoke all on public.venues, public.venue_contacts from public, anon, authenticated;

create or replace function public.venue_can_edit()
returns boolean language sql stable security definer
set search_path = public, pg_temp
as $$ select public.rc_can_manage(); $$;

-- 清單：每一個場地加用過幾場、最後一次、聯絡人幾位
create or replace function public.venues_list()
returns jsonb language plpgsql stable security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_cadre() then raise exception 'not_cadre' using errcode = 'P0001'; end if;
  return jsonb_build_object(
    'can_edit', public.venue_can_edit(),
    'venues', coalesce((select jsonb_agg(jsonb_build_object(
        'id', v.id, 'name', v.name, 'kind', v.kind, 'city', v.city, 'capacity', v.capacity, 'cost', v.cost,
        'n_events', (select count(*) from public.events e where e.venue_id = v.id),
        'last_used', (select max(e.starts_at) from public.events e where e.venue_id = v.id),
        'n_contacts', (select count(*) from public.venue_contacts c where c.venue_id = v.id)) order by lower(v.name))
      from public.venues v), '[]'::jsonb));
end $$;

-- 一個場地：資料、聯絡人、在這裡辦過的活動
create or replace function public.venue_get(p_id uuid)
returns jsonb language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare v public.venues%rowtype;
begin
  if not public.is_cadre() then raise exception 'not_cadre' using errcode = 'P0001'; end if;
  select * into v from public.venues where id = p_id;
  if not found then raise exception 'no_such_venue' using errcode = 'P0001'; end if;
  return jsonb_build_object(
    'can_edit', public.venue_can_edit(),
    'venue', to_jsonb(v) - 'created_by',
    'contacts', coalesce((select jsonb_agg(to_jsonb(c) - 'venue_id' order by c.created_at) from public.venue_contacts c where c.venue_id = v.id), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'slug', e.slug, 'title', coalesce(nullif(e.title_en, ''), e.title_zh), 'title_zh', e.title_zh,
                         'team', e.team, 'starts_at', e.starts_at, 'source', e.source) order by e.starts_at desc nulls last)
                       from public.events e where e.venue_id = v.id), '[]'::jsonb));
end $$;

-- 新增（p_id null）或改一個場地
create or replace function public.venue_save(p_id uuid, p jsonb)
returns uuid language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_id uuid; v_cap int;
begin
  if not public.venue_can_edit() then raise exception 'not_venue_editor' using errcode = 'P0001'; end if;
  if p ? 'name' and nullif(trim(coalesce(p->>'name', '')), '') is null then raise exception 'need_venue_name' using errcode = 'P0001'; end if;
  if p ? 'kind' and coalesce(p->>'kind', '') not in ('school', 'university', 'coworking', 'cafe', 'company', 'government', 'hotel', 'online', 'other') then raise exception 'bad_kind' using errcode = 'P0001'; end if;
  if nullif(p->>'capacity', '') is not null and (p->>'capacity') !~ '^\d{1,6}$' then raise exception 'bad_capacity' using errcode = 'P0001'; end if;
  v_cap := nullif(p->>'capacity', '')::int;
  if p_id is null then
    if nullif(trim(coalesce(p->>'name', '')), '') is null then raise exception 'need_venue_name' using errcode = 'P0001'; end if;
    if exists (select 1 from public.venues where lower(trim(name)) = lower(trim(p->>'name')) and lower(trim(city)) = lower(trim(coalesce(p->>'city', '')))) then
      raise exception 'venue_exists' using errcode = 'P0001';
    end if;
    insert into public.venues (name, kind, city, address, capacity, cost, url, notes, created_by)
    values (trim(p->>'name'), coalesce(nullif(p->>'kind', ''), 'other'), trim(coalesce(p->>'city', '')), trim(coalesce(p->>'address', '')), v_cap,
            trim(coalesce(p->>'cost', '')), trim(coalesce(p->>'url', '')), coalesce(p->>'notes', ''), auth.uid())
    returning id into v_id;
  else
    select id into v_id from public.venues where id = p_id;
    if v_id is null then raise exception 'no_such_venue' using errcode = 'P0001'; end if;
    begin
      update public.venues set
        name     = case when p ? 'name' then trim(p->>'name') else name end,
        kind     = case when p ? 'kind' then p->>'kind' else kind end,
        city     = case when p ? 'city' then trim(coalesce(p->>'city', '')) else city end,
        address  = case when p ? 'address' then trim(coalesce(p->>'address', '')) else address end,
        capacity = case when p ? 'capacity' then v_cap else capacity end,
        cost     = case when p ? 'cost' then trim(coalesce(p->>'cost', '')) else cost end,
        url      = case when p ? 'url' then trim(coalesce(p->>'url', '')) else url end,
        notes    = case when p ? 'notes' then coalesce(p->>'notes', '') else notes end,
        updated_at = now()
       where id = v_id;
    exception when unique_violation then raise exception 'venue_exists' using errcode = 'P0001';
    end;
  end if;
  perform public.rc_log_it('venue_save', v_id, null, p);
  return v_id;
end $$;

-- 刪一個場地：聯絡人一起刪，掛著的活動變成沒有場地（地點那一格的字留著）
create or replace function public.venue_delete(p_id uuid)
returns boolean language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v jsonb;
begin
  if not public.venue_can_edit() then raise exception 'not_venue_editor' using errcode = 'P0001'; end if;
  select to_jsonb(x) into v from public.venues x where id = p_id;
  if v is null then return false; end if;
  delete from public.venues where id = p_id;
  perform public.rc_log_it('venue_delete', p_id, v, null);
  return true;
end $$;

-- 聯絡人：新增（p_id null，p 帶 venue_id）或改
create or replace function public.venue_contact_save(p_id uuid, p jsonb)
returns uuid language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_id uuid; v_venue uuid; v_email text := lower(trim(coalesce(p->>'email', '')));
begin
  if not public.venue_can_edit() then raise exception 'not_venue_editor' using errcode = 'P0001'; end if;
  if v_email <> '' and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'bad_email' using errcode = 'P0001'; end if;
  if p_id is null then
    v_venue := nullif(p->>'venue_id', '')::uuid;
    if not exists (select 1 from public.venues where id = v_venue) then raise exception 'no_such_venue' using errcode = 'P0001'; end if;
    if trim(coalesce(p->>'name', '')) = '' and v_email = '' and trim(coalesce(p->>'phone', '')) = '' and trim(coalesce(p->>'line', '')) = '' then
      raise exception 'need_contact' using errcode = 'P0001';
    end if;
    insert into public.venue_contacts (venue_id, name, role, email, phone, line, note)
    values (v_venue, trim(coalesce(p->>'name', '')), trim(coalesce(p->>'role', '')), v_email, trim(coalesce(p->>'phone', '')), trim(coalesce(p->>'line', '')), coalesce(p->>'note', ''))
    returning id into v_id;
  else
    select id, venue_id into v_id, v_venue from public.venue_contacts where id = p_id;
    if v_id is null then raise exception 'no_such_contact' using errcode = 'P0001'; end if;
    begin
      update public.venue_contacts set
        name  = case when p ? 'name' then trim(coalesce(p->>'name', '')) else name end,
        role  = case when p ? 'role' then trim(coalesce(p->>'role', '')) else role end,
        email = case when p ? 'email' then v_email else email end,
        phone = case when p ? 'phone' then trim(coalesce(p->>'phone', '')) else phone end,
        line  = case when p ? 'line' then trim(coalesce(p->>'line', '')) else line end,
        note  = case when p ? 'note' then coalesce(p->>'note', '') else note end
       where id = v_id;
    exception when check_violation then raise exception 'need_contact' using errcode = 'P0001';
    end;
  end if;
  perform public.rc_log_it('venue_contact_save', v_venue, null, p);
  return v_id;
end $$;

create or replace function public.venue_contact_delete(p_id uuid)
returns boolean language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_venue uuid; v jsonb;
begin
  if not public.venue_can_edit() then raise exception 'not_venue_editor' using errcode = 'P0001'; end if;
  select venue_id, to_jsonb(c) into v_venue, v from public.venue_contacts c where id = p_id;
  if v_venue is null then return false; end if;
  delete from public.venue_contacts where id = p_id;
  perform public.rc_log_it('venue_contact_delete', v_venue, v, null);
  return true;
end $$;

-- 一場活動掛場地（p_venue null 就拿掉）。那場「改」以上，或改得動場地的人。
create or replace function public.set_event_venue(p_event uuid, p_venue uuid)
returns boolean language plpgsql security definer
set search_path = public, pg_temp
as $$
declare e public.events%rowtype; v_name text;
begin
  select * into e from public.events where id = p_event;
  if not found then raise exception 'no_such_event' using errcode = 'P0001'; end if;
  if not (public.venue_can_edit() or public.can_edit(e.workspace_id)) then raise exception 'not_event_venue_editor' using errcode = 'P0001'; end if;
  if p_venue is not null then
    select name into v_name from public.venues where id = p_venue;
    if v_name is null then raise exception 'no_such_venue' using errcode = 'P0001'; end if;
  end if;
  update public.events set venue_id = p_venue,
         place = case when p_venue is not null and trim(coalesce(place, '')) = '' then v_name else place end,
         updated_at = now()
   where id = p_event;
  perform public.rc_log_it('event_venue', p_event, jsonb_build_object('venue', e.venue_id), jsonb_build_object('venue', p_venue));
  return true;
end $$;

revoke all on function public.venue_can_edit(), public.venues_list(), public.venue_get(uuid), public.venue_save(uuid, jsonb), public.venue_delete(uuid),
  public.venue_contact_save(uuid, jsonb), public.venue_contact_delete(uuid), public.set_event_venue(uuid, uuid) from public, anon;
grant execute on function public.venues_list(), public.venue_get(uuid), public.venue_save(uuid, jsonb), public.venue_delete(uuid),
  public.venue_contact_save(uuid, jsonb), public.venue_contact_delete(uuid), public.set_event_venue(uuid, uuid) to authenticated;
revoke all on function public.venue_can_edit() from authenticated;

commit;

-- ---------- 驗收 ----------
select * from (
  with fn as (select proname, regexp_replace(prosrc, '--[^\n]*', '', 'g') as body from pg_proc where pronamespace = 'public'::regnamespace),
  t as (
    select (select count(*) = 2 from pg_tables where schemaname = 'public' and tablename in ('venues', 'venue_contacts') and rowsecurity) as tables_ok,
           (select count(*) = 1 from information_schema.columns where table_schema = 'public' and table_name = 'events' and column_name = 'venue_id') as event_col,
           (select not has_table_privilege('authenticated', 'public.venues', 'select') and not has_table_privilege('anon', 'public.venues', 'select')
               and not has_table_privilege('authenticated', 'public.venue_contacts', 'select') and not has_table_privilege('anon', 'public.venue_contacts', 'select')) as tables_closed,
           (select bool_and(body like '%is_cadre()%') from fn where proname in ('venues_list', 'venue_get')) as read_cadre,
           (select bool_and(body like '%venue_can_edit()%') from fn where proname in ('venue_save', 'venue_delete', 'venue_contact_save', 'venue_contact_delete')) as write_gate,
           (select body like '%venue_can_edit() or public.can_edit(e.workspace_id)%' from fn where proname = 'set_event_venue') as link_gate,
           (select bool_and(not has_function_privilege('anon', p.oid, 'execute')) from pg_proc p where p.pronamespace = 'public'::regnamespace
              and p.proname in ('venues_list', 'venue_get', 'venue_save', 'venue_delete', 'venue_contact_save', 'venue_contact_delete', 'set_event_venue')) as anon_out
  )
  select 0 ord, 'OVERALL' as 項目, null::text as 應該是, null::text as 實際是,
    case when tables_ok and event_col and tables_closed and read_cadre and write_gate and link_gate and anon_out then 'PASS' else 'FAIL' end as 結果 from t
  union all select 1, '兩張表在、RLS 開著', 'true', tables_ok::text, case when tables_ok then 'PASS' else 'FAIL' end from t
  union all select 2, '活動多一欄 venue_id', 'true', event_col::text, case when event_col then 'PASS' else 'FAIL' end from t
  union all select 3, '★ 表不開給前端（聯絡人是個資，只走函式）', 'true', tables_closed::text, case when tables_closed then 'PASS' else 'FAIL' end from t
  union all select 4, '★ 看場地要是幹部', 'true', read_cadre::text, case when read_cadre then 'PASS' else 'FAIL' end from t
  union all select 5, '★ 改場地與聯絡人只有 Co-President 與紀錄工作區的人', 'true', write_gate::text, case when write_gate then 'PASS' else 'FAIL' end from t
  union all select 6, '活動掛場地：那場「改」以上或改得動場地的人', 'true', link_gate::text, case when link_gate then 'PASS' else 'FAIL' end from t
  union all select 7, '★ anon 一支都叫不到', 'true', anon_out::text, case when anon_out then 'PASS' else 'FAIL' end from t
) x order by ord;
