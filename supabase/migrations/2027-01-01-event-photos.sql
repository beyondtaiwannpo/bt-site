-- 活動的照片：封面用檔案上傳、一場活動可以放好幾張　2026-11-23
-- （Paul：「I need the photo and cover photo upload by file. Right now it's a link... I also need multiple photos」）
--
-- 用法：整份貼進 Supabase SQL Editor 按一次 Run。可以重跑。最後印一張 PASS / FAIL 表。
-- 要先跑過 2026-12-31-programmes.sql（順序照日期）。
-- 順序：網站先 push，再跑這一支。這一支還沒跑的時候，後台的活動頁會說照片那一塊要先跑哪一支，對外的活動頁跟原本一模一樣。
-- ⚠ 跑過 2027-01-02-event-speakers-tickets.sql 之後不要再重跑這一支：那一支把 public_event_extras() 換成有講者與報名類型的版本，
--   重跑這一支會蓋回只有照片的。不小心重跑了，再跑一次 2027-01-02 那一支就好。
--
-- ============================================================================
-- 這一支在做什麼
-- ============================================================================
--   1. 一張表 event_photos：一場活動的好幾張照片。每一張有自己的同意勾選（consent），預設沒勾。
--      RLS 開著、一條政策都沒有，表也不發權限給前端：讀與寫都只能走下面的函式。
--   2. 後台用的五支函式，門都是 can_edit(那場活動的工作區)，跟 save_event() 同一條：
--      event_photos_list（讀）、add_event_photo（加一張，同意一律從沒勾開始）、set_event_photo_consent（勾或取消同意）、
--      reorder_event_photos（排順序）、delete_event_photo（拿掉一張，回它的網址，前端拿去把 Storage 的檔也刪掉）。
--   3. 對外的一支 public_event_extras(代號)：只回 published 的活動，照片只回同意勾了的，照順序。
--      回 {"photos": [{"url": "..."}]}。活動沒上架或代號不存在，回空值（null）。
--      講者與報名類型（'speakers'、'tickets' 兩個鍵）是 2027-01-02-event-speakers-tickets.sql 加在同一個物件裡的，對外頁原本讀的 photos 沒有變。
--   4. Storage：bucket events（公開讀、5 MB、只收圖），上傳與刪除給任何幹部。跟 island、history 兩個 bucket 同一個做法：
--      檔案傳得上去不代表掛得上去，哪一張掛到哪一場，門在上面的函式。封面也傳到這個 bucket，網址照舊存在 events.cover_url（走原本的 save_event）。
--      本機 smoke 沒有 storage schema 的時候，這一段包在 to_regclass 判斷裡跳過。
-- 沒動的：events 表、save_event()、set_event_ready()、publish_event()、public_events()、public_event()。
-- ============================================================================

begin;

-- ---------- 1. 表 ----------
create table if not exists public.event_photos (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references public.events(id) on delete cascade,
  url         text not null check (url ~ '^https://'),
  consent     boolean not null default false,
  sort        int not null default 100,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists event_photos_event on public.event_photos (event_id, sort);
comment on table public.event_photos is '一場活動的照片（封面另外存在 events.cover_url）。沒有政策、不發權限，讀寫都走函式。2027-01-01。';
comment on column public.event_photos.consent is '這張照片裡的人與那場活動都在拍攝同意範圍內。沒勾的不會出現在對外頁（public_event_extras 只回勾了的）。';
alter table public.event_photos enable row level security;
revoke all on public.event_photos from public, anon, authenticated;

-- ---------- 2. 後台用的函式（門：can_edit(那場活動的工作區)，跟 save_event() 同一條）----------
-- 讀這一場的照片（含還沒勾同意的）。回 JSON 陣列，照順序。
create or replace function public.event_photos_list(p_event uuid)
returns jsonb language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare e record;
begin
  select * into e from events where id = p_event;
  if e.id is null then raise exception 'no_such_event' using errcode = 'P0001'; end if;
  if not public.can_edit(e.workspace_id) then raise exception 'not_event_editor' using errcode = 'P0001'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'url', p.url, 'consent', p.consent, 'sort', p.sort, 'created_at', p.created_at)
                                    order by p.sort, p.created_at, p.id)
                     from event_photos p where p.event_id = p_event), '[]'::jsonb);
end $$;
revoke all on function public.event_photos_list(uuid) from public, anon;
grant execute on function public.event_photos_list(uuid) to authenticated;

-- 加一張。同意一律從沒勾開始（同意是看過那一張照片之後才勾的）。排在最後。一場最多 30 張。
create or replace function public.add_event_photo(p_event uuid, p_url text)
returns uuid language plpgsql security definer
set search_path = public, pg_temp
as $$
declare e record; v_id uuid;
begin
  select * into e from events where id = p_event;
  if e.id is null then raise exception 'no_such_event' using errcode = 'P0001'; end if;
  if not public.can_edit(e.workspace_id) then raise exception 'not_event_editor' using errcode = 'P0001'; end if;
  if coalesce(btrim(p_url), '') !~ '^https://' then raise exception 'photo_not_https' using errcode = 'P0001'; end if;
  if (select count(*) from event_photos where event_id = p_event) >= 30 then raise exception 'too_many_photos' using errcode = 'P0001'; end if;
  insert into event_photos (event_id, url, consent, sort, created_by)
  values (p_event, btrim(p_url), false, coalesce((select max(sort) from event_photos where event_id = p_event), 0) + 10, auth.uid())
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.add_event_photo(uuid, text) from public, anon;
grant execute on function public.add_event_photo(uuid, text) to authenticated;

-- 勾或取消一張照片的同意。回存進去的值。
create or replace function public.set_event_photo_consent(p_id uuid, p_consent boolean)
returns boolean language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v record;
begin
  select p.id, e.workspace_id into v from event_photos p join events e on e.id = p.event_id where p.id = p_id;
  if v.id is null then raise exception 'no_such_photo' using errcode = 'P0001'; end if;
  if not public.can_edit(v.workspace_id) then raise exception 'not_event_editor' using errcode = 'P0001'; end if;
  update event_photos set consent = coalesce(p_consent, false) where id = p_id;
  return coalesce(p_consent, false);
end $$;
revoke all on function public.set_event_photo_consent(uuid, boolean) from public, anon;
grant execute on function public.set_event_photo_consent(uuid, boolean) to authenticated;

-- 排順序：p_ids 是這一場照片的 id，照要的順序。不是這一場的 id 不會被動到。回改了幾張。
create or replace function public.reorder_event_photos(p_event uuid, p_ids uuid[])
returns int language plpgsql security definer
set search_path = public, pg_temp
as $$
declare e record; n int;
begin
  select * into e from events where id = p_event;
  if e.id is null then raise exception 'no_such_event' using errcode = 'P0001'; end if;
  if not public.can_edit(e.workspace_id) then raise exception 'not_event_editor' using errcode = 'P0001'; end if;
  update event_photos p set sort = x.ord * 10
    from unnest(p_ids) with ordinality as x(id, ord) where p.id = x.id and p.event_id = p_event;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.reorder_event_photos(uuid, uuid[]) from public, anon;
grant execute on function public.reorder_event_photos(uuid, uuid[]) to authenticated;

-- 拿掉一張，回它的網址（前端拿去把 Storage 的檔也刪掉）。
create or replace function public.delete_event_photo(p_id uuid)
returns text language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v record;
begin
  select p.id, p.url, e.workspace_id into v from event_photos p join events e on e.id = p.event_id where p.id = p_id;
  if v.id is null then raise exception 'no_such_photo' using errcode = 'P0001'; end if;
  if not public.can_edit(v.workspace_id) then raise exception 'not_event_editor' using errcode = 'P0001'; end if;
  delete from event_photos where id = p_id;
  return v.url;
end $$;
revoke all on function public.delete_event_photo(uuid) from public, anon;
grant execute on function public.delete_event_photo(uuid) to authenticated;

-- ---------- 3. 對外 ----------
-- 一場活動除了 public_event() 那一列之外要印的東西。現在只有照片；之後講者與票種加在同一個物件裡（多兩個鍵）。
-- 只回 published 的活動；照片只回同意勾了的、只回網址（沒有誰傳的、沒有 id）。活動沒上架或代號不存在回空值。
create or replace function public.public_event_extras(p_slug text)
returns jsonb language sql stable security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'photos', coalesce((select jsonb_agg(jsonb_build_object('url', p.url) order by p.sort, p.created_at, p.id)
                          from event_photos p where p.event_id = e.id and p.consent), '[]'::jsonb))
    from events e
   where e.slug = p_slug and e.status = 'published';
$$;
revoke all on function public.public_event_extras(text) from public;
grant execute on function public.public_event_extras(text) to anon, authenticated;

-- ---------- 4. Storage ----------
do $$
begin
  if to_regclass('storage.buckets') is null or to_regclass('storage.objects') is null then
    raise notice 'storage schema 不在（本機 smoke），略過 bucket 與政策';
    return;
  end if;
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('events', 'events', true, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/avif'])
  on conflict (id) do update set public = true, file_size_limit = 5242880, allowed_mime_types = excluded.allowed_mime_types;
  execute 'drop policy if exists events_read on storage.objects';
  execute 'create policy events_read on storage.objects for select to public using (bucket_id = ''events'')';
  execute 'drop policy if exists events_insert on storage.objects';
  execute 'create policy events_insert on storage.objects for insert to authenticated with check (bucket_id = ''events'' and public.is_cadre())';
  execute 'drop policy if exists events_update on storage.objects';
  execute 'create policy events_update on storage.objects for update to authenticated using (bucket_id = ''events'' and public.is_cadre())';
  execute 'drop policy if exists events_delete on storage.objects';
  execute 'create policy events_delete on storage.objects for delete to authenticated using (bucket_id = ''events'' and public.is_cadre())';
end $$;

commit;

-- ---------- 驗收 ----------
select * from (
  with fn as (
    select p.proname, p.prosecdef, p.proconfig, p.provolatile, regexp_replace(p.prosrc, '--[^\n]*', '', 'g') as body
      from pg_proc p where p.pronamespace = 'public'::regnamespace
       and p.proname in ('event_photos_list', 'add_event_photo', 'set_event_photo_consent', 'reorder_event_photos', 'delete_event_photo', 'public_event_extras')
  ), t as (
    select to_regclass('public.event_photos') is not null as tbl,
           (select relrowsecurity from pg_class where oid = 'public.event_photos'::regclass) as rls_on,
           (select count(*) from pg_policies where schemaname = 'public' and tablename = 'event_photos') as pols,
           (select count(*) from information_schema.table_privileges where table_schema = 'public' and table_name = 'event_photos' and grantee in ('anon', 'authenticated', 'PUBLIC')) as tbl_grants,
           (select count(*) from fn) as fns,
           (select bool_and(prosecdef and proconfig::text like '%search_path=public, pg_temp%') from fn) as definer,
           (select bool_and(body like '%can_edit(%workspace_id)%' and body like '%not_event_editor%') from fn where proname <> 'public_event_extras') as gate,
           (select body like '%e.status = ''published''%' and body like '%p.consent%' and provolatile = 's' from fn where proname = 'public_event_extras') as public_gate,
           (select body like '%p_event, btrim(p_url), false,%' from fn where proname = 'add_event_photo') as starts_unticked,
           has_function_privilege('anon', 'public.public_event_extras(text)', 'execute') and has_function_privilege('authenticated', 'public.public_event_extras(text)', 'execute') as pub_exec,
           not has_function_privilege('anon', 'public.event_photos_list(uuid)', 'execute') and not has_function_privilege('anon', 'public.add_event_photo(uuid, text)', 'execute')
             and not has_function_privilege('anon', 'public.set_event_photo_consent(uuid, boolean)', 'execute') and not has_function_privilege('anon', 'public.reorder_event_photos(uuid, uuid[])', 'execute')
             and not has_function_privilege('anon', 'public.delete_event_photo(uuid)', 'execute') as anon_no_write,
           (select count(*) from public.event_photos p join public.events e on e.id = p.event_id
             where e.status = 'published' and not p.consent
               and public.public_event_extras(e.slug)->'photos' @> jsonb_build_array(jsonb_build_object('url', p.url))
               and not exists (select 1 from public.event_photos q where q.event_id = p.event_id and q.url = p.url and q.consent)) as leaked,
           (select count(*) from public.events e where e.status <> 'published' and public.public_event_extras(e.slug) is not null) as unpublished_out,
           to_regclass('storage.buckets') is not null as has_storage,
           case when to_regclass('storage.buckets') is null then null else (select count(*) from storage.buckets where id = 'events' and public) = 1 end as bucket_ok
  )
  select 0 ord, 'OVERALL' as 項目, null::text as 應該是, null::text as 實際是,
    case when tbl and rls_on and pols = 0 and tbl_grants = 0 and fns = 6 and definer and gate and public_gate and starts_unticked and pub_exec and anon_no_write
              and leaked = 0 and unpublished_out = 0 and (not has_storage or bucket_ok) then 'PASS' else 'FAIL' end as 結果 from t
  union all select 1, 'event_photos 表在、RLS 開著', 'true|true', tbl::text || '|' || coalesce(rls_on::text, '沒有表'), case when tbl and rls_on then 'PASS' else 'FAIL' end from t
  union all select 2, '★ 表沒有任何政策、沒發任何權限給前端（讀寫都走函式）', '0|0', pols::text || '|' || tbl_grants::text, case when pols = 0 and tbl_grants = 0 then 'PASS' else 'FAIL' end from t
  union all select 3, '六支函式在，都是 security definer、search_path 鎖著', '6|true', fns::text || '|' || coalesce(definer::text, '沒有函式'), case when fns = 6 and definer then 'PASS' else 'FAIL' end from t
  union all select 4, '★ 後台五支的門都是 can_edit(那場活動的工作區)', 'true', coalesce(gate::text, '沒有函式'), case when gate then 'PASS' else 'FAIL' end from t
  union all select 5, '★ 對外那一支只回 published 的活動、只回同意勾了的照片', 'true', coalesce(public_gate::text, '沒有函式'), case when public_gate then 'PASS' else 'FAIL' end from t
  union all select 6, '★ 新加的照片同意一律從沒勾開始', 'true', coalesce(starts_unticked::text, '沒有函式'), case when starts_unticked then 'PASS' else 'FAIL' end from t
  union all select 7, '★ 沒登入叫得到對外那一支，叫不到後台五支', 'true|true', pub_exec::text || '|' || anon_no_write::text, case when pub_exec and anon_no_write then 'PASS' else 'FAIL' end from t
  union all select 8, '★ 現有的資料：沒勾同意的照片沒有一張漏到對外、沒上架的活動沒有一場回得出東西', '0|0', leaked::text || '|' || unpublished_out::text, case when leaked = 0 and unpublished_out = 0 then 'PASS' else 'FAIL' end from t
  union all select 9, 'Storage bucket events（公開讀）', 'true', coalesce(bucket_ok::text, '沒有 storage schema'), case when bucket_ok is null then 'SKIP' when bucket_ok then 'PASS' else 'FAIL' end from t
) q order by ord;
