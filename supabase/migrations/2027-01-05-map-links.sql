-- 活動的地點與場地可以貼 Google 地圖的連結（2026-11-24）。
--
-- Paul 的原話（貼著後台「時間與地點」那一塊的截圖）：
--   「for when and where, for where I need to be able to post Google Map link. Same for the venue.」
--
-- 這一支做什麼：
--   1. events 多一欄 map_url（這場活動地點的 Google 地圖連結，可以是空的）。
--      venues 多一欄 map_url（這個場地的 Google 地圖連結，可以是空的）。
--   2. 一支檢查用的函式 map_url_ok()：只收 Google 地圖的連結（maps.app.goo.gl、goo.gl/maps、google.com/maps、google.com.tw/maps、maps.google.com），
--      一定要 https，最長 600 個字。兩欄都掛這一條，所以不管從哪一條路寫進來，別的網站的連結都進不來。
--      理由：活動那一欄會印在對外的活動頁上，那一頁不該變成可以連到任何地方。
--   3. 一支新的函式 set_event_map_url(活動, 連結)：存活動那一欄。門跟 save_event 一樣是「這場活動改得動」（can_edit）。
--      **沒有重寫 save_event**：那一支很長，為了一欄重抄一次風險比較大；後台那一格是「改了就存」，自己叫這一支。
--   4. venue_save 重寫一次，多認得 map_url 這個鍵（其他一行都沒動，門還是 venue_can_edit）。
--      venues_list 重寫一次，每一個場地多回 map_url（活動編輯頁要用：場地有連結、活動還沒有的時候，一顆按鈕帶過來）。
--      venue_get 不用動：它本來就是把整列回出去。
--   5. public_event_extras 重寫一次，多回一個 map_url（對外的活動頁，地點那一行後面多一條「在 Google 地圖上看」）。
--      照片與講者那兩道門（p.consent、s.consent）、「上架了才回」（e.status = 'published'）一個字都沒動。
--
-- 誰看得到、誰改得動，有沒有變：
--   - 活動的連結：上架的活動，任何人在對外頁上看得到（跟地點那一行字一樣）。沒上架的活動對外什麼都不回，跟以前一樣。
--   - 場地的連結：跟場地其他資料一樣，只有幹部看得到（venues_list、venue_get 的門是 is_cadre），**不會出現在對外頁**。
--     場地的連結要出現在對外頁，要有人在活動那一格按「用場地的連結」把它抄到活動那一欄，那是那個人的決定。
--   - 沒有新的表，沒有動 RLS，沒有動角色。
--
-- 可以重跑。⚠ 之後如果重跑 2027-01-02-event-speakers-tickets.sql 或 2026-12-14-venues.sql，要再跑一次這一支，
--   不然 public_event_extras、venue_save、venues_list 會被換回沒有 map_url 的版本（資料還在，只是讀不到、存不了）。
-- 還沒跑這一支之前：後台那兩格不會出現，對外頁沒有那條連結，其他照舊。

begin;

-- ---------- 1. 檢查用的函式 ----------
create or replace function public.map_url_ok(p text)
returns boolean language sql immutable
set search_path = public, pg_temp
as $$
  select p is null or p = ''
      or (length(p) <= 600
          and p ~ '^https://(maps\.app\.goo\.gl/|goo\.gl/maps/|(www\.)?google\.com(\.tw)?/maps[/?]|maps\.google\.com(\.tw)?/)[^[:space:]<>"''`\\]*$');
$$;
revoke all on function public.map_url_ok(text) from public, anon;
grant execute on function public.map_url_ok(text) to authenticated;

-- ---------- 2. 兩欄 ----------
alter table public.events add column if not exists map_url text;
alter table public.venues add column if not exists map_url text not null default '';
comment on column public.events.map_url is '這場活動地點的 Google 地圖連結（可以是空的）。上架的活動會印在對外的活動頁上。只收 Google 地圖的連結（map_url_ok）。2027-01-05。';
comment on column public.venues.map_url is '這個場地的 Google 地圖連結（可以是空的）。只有幹部看得到，不會出現在對外頁。2027-01-05。';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'events_map_url_ok' and conrelid = 'public.events'::regclass) then
    alter table public.events add constraint events_map_url_ok check (public.map_url_ok(map_url));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'venues_map_url_ok' and conrelid = 'public.venues'::regclass) then
    alter table public.venues add constraint venues_map_url_ok check (public.map_url_ok(map_url));
  end if;
end $$;

-- ---------- 3. 存活動的連結 ----------
-- p_url 給 null 或空字串就是拿掉。回存進去的值（拿掉回 null）。
create or replace function public.set_event_map_url(p_event uuid, p_url text)
returns text language plpgsql security definer
set search_path = public, pg_temp
as $$
declare e public.events%rowtype; v_url text := nullif(trim(coalesce(p_url, '')), '');
begin
  select * into e from public.events where id = p_event;
  if not found then raise exception 'no_such_event' using errcode = 'P0001'; end if;
  if not public.can_edit(e.workspace_id) then raise exception 'not_event_editor' using errcode = 'P0001'; end if;
  if not public.map_url_ok(v_url) then raise exception 'bad_map_url' using errcode = 'P0001'; end if;
  update public.events set map_url = v_url, updated_at = now() where id = p_event;
  perform public.rc_log_it('event_map_url', p_event, jsonb_build_object('map_url', e.map_url), jsonb_build_object('map_url', v_url));
  return v_url;
end $$;
revoke all on function public.set_event_map_url(uuid, text) from public, anon;
grant execute on function public.set_event_map_url(uuid, text) to authenticated;

-- ---------- 4. 場地：存與清單 ----------
-- 跟 2026-12-14-venues.sql 那一版比，只多了 map_url 那幾行（檢查、insert、update）。
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
  if p ? 'map_url' and not public.map_url_ok(trim(coalesce(p->>'map_url', ''))) then raise exception 'bad_map_url' using errcode = 'P0001'; end if;
  v_cap := nullif(p->>'capacity', '')::int;
  if p_id is null then
    if nullif(trim(coalesce(p->>'name', '')), '') is null then raise exception 'need_venue_name' using errcode = 'P0001'; end if;
    if exists (select 1 from public.venues where lower(trim(name)) = lower(trim(p->>'name')) and lower(trim(city)) = lower(trim(coalesce(p->>'city', '')))) then
      raise exception 'venue_exists' using errcode = 'P0001';
    end if;
    insert into public.venues (name, kind, city, address, capacity, cost, url, notes, map_url, created_by)
    values (trim(p->>'name'), coalesce(nullif(p->>'kind', ''), 'other'), trim(coalesce(p->>'city', '')), trim(coalesce(p->>'address', '')), v_cap,
            trim(coalesce(p->>'cost', '')), trim(coalesce(p->>'url', '')), coalesce(p->>'notes', ''), trim(coalesce(p->>'map_url', '')), auth.uid())
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
        map_url  = case when p ? 'map_url' then trim(coalesce(p->>'map_url', '')) else map_url end,
        updated_at = now()
       where id = v_id;
    exception when unique_violation then raise exception 'venue_exists' using errcode = 'P0001';
    end;
  end if;
  perform public.rc_log_it('venue_save', v_id, null, p);
  return v_id;
end $$;

-- 清單：跟原本那一版比，每一個場地多回 map_url，最外面多一個 has_map（後台靠它知道這一支跑過了，才畫那一格）。
create or replace function public.venues_list()
returns jsonb language plpgsql stable security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_cadre() then raise exception 'not_cadre' using errcode = 'P0001'; end if;
  return jsonb_build_object(
    'can_edit', public.venue_can_edit(),
    'has_map', true,
    'venues', coalesce((select jsonb_agg(jsonb_build_object(
        'id', v.id, 'name', v.name, 'kind', v.kind, 'city', v.city, 'capacity', v.capacity, 'cost', v.cost, 'map_url', v.map_url,
        'n_events', (select count(*) from public.events e where e.venue_id = v.id),
        'last_used', (select max(e.starts_at) from public.events e where e.venue_id = v.id),
        'n_contacts', (select count(*) from public.venue_contacts c where c.venue_id = v.id)) order by lower(v.name))
      from public.venues v), '[]'::jsonb));
end $$;
revoke all on function public.venue_save(uuid, jsonb), public.venues_list() from public, anon;
grant execute on function public.venue_save(uuid, jsonb), public.venues_list() to authenticated;

-- ---------- 5. 對外的活動頁 ----------
-- 跟 2027-01-02-event-speakers-tickets.sql 那一版比，只多最後一個鍵 map_url。照片與講者的同意、上架了才回，都沒動。
create or replace function public.public_event_extras(p_slug text)
returns jsonb language sql stable security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'photos', coalesce((select jsonb_agg(jsonb_build_object('url', p.url) order by p.sort, p.created_at, p.id)
                          from event_photos p where p.event_id = e.id and p.consent), '[]'::jsonb),
    'speakers', coalesce((select jsonb_agg(jsonb_build_object('name', s.display_name, 'subject', s.subject, 'school', s.school, 'photo_url', s.photo_url)
                                           order by s.sort, s.created_at, s.id)
                            from event_speakers s where s.event_id = e.id and s.consent), '[]'::jsonb),
    'tickets', public.event_tickets_public(e.id),
    'map_url', e.map_url)
    from events e
   where e.slug = p_slug and e.status = 'published';
$$;
revoke all on function public.public_event_extras(text) from public;
grant execute on function public.public_event_extras(text) to anon, authenticated;

commit;

-- ---------- 驗收 ----------
select * from (
  with fn as (select proname, oid, regexp_replace(prosrc, '--[^\n]*', '', 'g') as body from pg_proc where pronamespace = 'public'::regnamespace),
  t as (
    select
      (select count(*) = 2 from information_schema.columns where table_schema = 'public' and column_name = 'map_url' and table_name in ('events', 'venues')) as cols_ok,
      (select count(*) = 2 from pg_constraint where conname in ('events_map_url_ok', 'venues_map_url_ok')) as checks_ok,
      public.map_url_ok('https://maps.app.goo.gl/AbCdEf123') and public.map_url_ok('https://www.google.com/maps/place/Taipei+Main+Station/@25.04,121.51,17z')
        and public.map_url_ok('https://goo.gl/maps/abc') and public.map_url_ok('https://maps.google.com/?q=25.04,121.51') and public.map_url_ok('https://www.google.com.tw/maps?q=x')
        and public.map_url_ok(null) and public.map_url_ok('') as good_ok,
      not public.map_url_ok('http://maps.app.goo.gl/abc') and not public.map_url_ok('https://example.com/maps') and not public.map_url_ok('https://www.google.com.evil.com/maps/x')
        and not public.map_url_ok('https://www.google.com/search?q=maps') and not public.map_url_ok('javascript:alert(1)') and not public.map_url_ok('https://maps.app.goo.gl/a b')
        and not public.map_url_ok('https://maps.app.goo.gl/a"><script>') and not public.map_url_ok('https://maps.app.goo.gl/' || repeat('a', 600)) as bad_ok,
      (select body like '%can_edit(e.workspace_id)%' and body like '%not_event_editor%' and body like '%map_url_ok(v_url)%' and body like '%bad_map_url%' from fn where proname = 'set_event_map_url') as set_gate,
      (select body like '%venue_can_edit()%' and body like '%not_venue_editor%' and body like '%bad_map_url%' and body like '%need_venue_name%' and body like '%venue_exists%' from fn where proname = 'venue_save') as venue_gate,
      (select body like '%is_cadre()%' and body like '%not_cadre%' and body like '%''map_url'', v.map_url%' from fn where proname = 'venues_list') as list_gate,
      (select body like '%e.status = ''published''%' and body like '%p.consent%' and body like '%s.consent%' and body like '%''map_url'', e.map_url%' from fn where proname = 'public_event_extras') as public_gate,
      (select array_agg(proname::text order by proname) from fn
        where proname in ('set_event_map_url', 'venue_save', 'venues_list', 'map_url_ok', 'public_event_extras') and has_function_privilege('anon', oid, 'execute')) as anon_fns,
      (select count(*) from public.public_events() x join public.events e on e.slug = x.slug where e.status <> 'published') = 0 as list_untouched
  )
  select 0 ord, 'OVERALL' as 項目, null::text as 應該是, null::text as 實際是,
    case when cols_ok and checks_ok and good_ok and bad_ok and set_gate and venue_gate and list_gate and public_gate and anon_fns = array['public_event_extras'] and list_untouched
         then 'PASS' else 'FAIL' end as 結果 from t
  union all select 1, 'events 與 venues 都有 map_url 那一欄', 'true', cols_ok::text, case when cols_ok then 'PASS' else 'FAIL' end from t
  union all select 2, '兩欄都掛了「只收 Google 地圖連結」的檢查', 'true', checks_ok::text, case when checks_ok then 'PASS' else 'FAIL' end from t
  union all select 3, 'Google 地圖的五種連結都收，空的也收', 'true', good_ok::text, case when good_ok then 'PASS' else 'FAIL' end from t
  union all select 4, '★ 別的網站、http、假的 google 網域、帶空白或引號的、太長的都不收', 'true', bad_ok::text, case when bad_ok then 'PASS' else 'FAIL' end from t
  union all select 5, '★ 存活動的連結：這場活動「改」以上，而且先過檢查', 'true', set_gate::text, case when set_gate then 'PASS' else 'FAIL' end from t
  union all select 6, '★ 存場地：門還是 venue_can_edit，原本的檢查都還在', 'true', venue_gate::text, case when venue_gate then 'PASS' else 'FAIL' end from t
  union all select 7, '場地清單：門還是幹部，多回 map_url', 'true', list_gate::text, case when list_gate then 'PASS' else 'FAIL' end from t
  union all select 8, '★ 對外：上架了才回，照片與講者的同意那兩道門還在，多回 map_url', 'true', public_gate::text, case when public_gate then 'PASS' else 'FAIL' end from t
  union all select 9, '★ 這幾支裡沒登入叫得到的只有 public_event_extras', '{public_event_extras}', coalesce(anon_fns::text, '{}'), case when anon_fns = array['public_event_extras'] then 'PASS' else 'FAIL' end from t
  union all select 10, '對外的活動清單沒有被動到（只回上架的）', 'true', list_untouched::text, case when list_untouched then 'PASS' else 'FAIL' end from t
) x order by ord;
