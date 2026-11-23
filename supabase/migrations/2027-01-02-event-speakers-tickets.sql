-- 活動的講者與報名類型；封面沒勾同意就不對外　2026-11-23
-- （Paul：「there are different types of ticket... And there is this speaker session. We can put photo in, and we can drag from our own database」）
--
-- 用法：整份貼進 Supabase SQL Editor 按一次 Run。可以重跑。最後印一張 PASS / FAIL 表。
-- 要先跑過 2027-01-01-event-photos.sql（順序照日期）。
-- 順序：網站先 push，再跑這一支。這一支還沒跑的時候，後台的活動頁會說講者與報名類型要先跑哪一支，對外的活動頁與 /apply/ 跟原本一模一樣。
-- ⚠ 跑過這一支之後，不要再重跑 2026-12-20-form-engine.sql、2026-12-31-programmes.sql、2027-01-01-event-photos.sql：
--   那三支裡是舊版的 submit_application()、public_events()、public_event_extras()，重跑會把這一支加的門蓋回去
--   （表單引擎那一支還會多留一支四個參數的 submit_application()，前端叫的時候資料庫會說不知道叫哪一支）。
--   不小心重跑了，再跑一次這一支就好，最後那張表會告訴你有沒有回來。
--
-- ============================================================================
-- 這一支在做什麼
-- ============================================================================
--   A. 講者
--      1. 一張表 event_speakers：一場活動的講者。名字（對外只放名字，不放姓）、主題、學校、照片、同意勾選（預設沒勾）、順序。
--         person_id 可以連到紀錄（Records）裡的那個人，也可以空著（直接打字加的）。
--         RLS 開著、一條政策都沒有，表也不發權限給前端：讀與寫都只能走下面的函式。
--      2. 後台用的五支，門都是 can_edit(那場活動的工作區)，跟活動照片那五支同一條：
--         event_speakers_list（讀）、save_event_speaker（加一位或改一位；新加的同意一律沒勾，改了名字或換了照片同意退回沒勾）、
--         set_event_speaker_consent（勾或取消同意）、reorder_event_speakers（排順序）、delete_event_speaker（拿掉，回照片網址）。
--         連到紀錄裡的人（person_id）只有本來就讀得到名錄的人（rc_can_view）連得了，這一支沒有多開任何一條讀名錄的路。
--      3. 紀錄那邊「忘記這個人」（forget_person）的時候，這個人當講者的那幾列跟著刪掉（people 上多一個 trigger）。
--   B. 報名類型（免費的，沒有價錢、沒有金流）
--      1. 一張表 event_tickets：一場活動可以分幾種報名類型，各有自己的名額（0 是不限）。一樣沒有政策、不發權限。
--         applications 多一欄 ticket_id（報名的是哪一種；類型被刪掉就變空的）。
--      2. 後台用的四支，門一樣是 can_edit(那場活動的工作區)：
--         event_tickets_list（讀，含每一種已經報了幾個）、save_event_ticket（加或改）、reorder_event_tickets、delete_event_ticket（已經有人報的刪不掉）。
--         另外一支 form_ticket_names(表單)：看報名名單的人把 ticket_id 對回名字用，門是 form_can_view（看得到那份報名的人）。
--      3. submit_application() 多一個參數 p_ticket（可以不給，舊的叫法照樣能用）。那份表單的活動有設類型的話：
--         沒帶類型擋（ticket_required）、不是這場活動的類型擋（bad_ticket）、那一種滿了擋（ticket_full）。活動本身的名額那道門還在。
--         其他每一行都跟 2026-12-20-form-engine.sql 那一版一樣。舊的四個參數那一支在同一個 transaction 裡拿掉。
--   C. 對外
--      1. public_event_extras(代號) 多兩個鍵：speakers（只回同意勾了的，每一位只有 name、subject、school、photo_url）、
--         tickets（id、中英名稱與說明、名額、已報幾個、滿了沒）。photos 沒變。
--      2. public_form_tickets(表單)：/apply/ 用表單 id 問這份表單的活動有哪些報名類型。跟 form_is_listed() 同一條線：活動還是草稿或待上架就回空的。
--      3. public_events() 的封面：同意沒勾就不回（回空值）。原本已經上架的活動換了封面，同意會退回沒勾，但新封面照樣對外。
--         回傳的欄位沒有變，其他每一行都跟 2026-12-31-programmes.sql 那一版一樣。public_event() 是從它讀的，跟著對。
-- 沒動的：events 表、event_photos 表與它的五支函式、save_event()、set_event_ready()、publish_event()、Storage（講者的照片傳到原本的 events bucket）。
-- ============================================================================

begin;

-- ---------- 0. 前面那兩支跑過沒 ----------
-- 沒跑過的話，下面會在很後面才停下來，而且訊息是一串看不懂的資料庫錯誤。這裡先講清楚要先跑哪一支，整份不會動到任何東西。
do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'events' and column_name = 'usual_month') then
    raise exception '要先跑 2026-12-31-programmes.sql，再跑這一支。' using errcode = 'P0001';
  end if;
  if to_regclass('public.event_photos') is null then
    raise exception '要先跑 2027-01-01-event-photos.sql，再跑這一支。' using errcode = 'P0001';
  end if;
end $$;

-- ---------- A1. 講者的表 ----------
create table if not exists public.event_speakers (
  id           uuid primary key default gen_random_uuid(),
  event_id     uuid not null references public.events(id) on delete cascade,
  person_id    uuid references public.people(id) on delete set null,
  display_name text not null check (btrim(display_name) <> '' and char_length(display_name) <= 60),
  subject      text not null default '' check (char_length(subject) <= 120),
  school       text not null default '' check (char_length(school) <= 120),
  photo_url    text check (photo_url is null or photo_url ~ '^https://'),
  consent      boolean not null default false,
  sort         int not null default 100,
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index if not exists event_speakers_event on public.event_speakers (event_id, sort);
create index if not exists event_speakers_person on public.event_speakers (person_id) where person_id is not null;
comment on table public.event_speakers is '一場活動的講者。沒有政策、不發權限，讀寫都走函式。2027-01-02。';
comment on column public.event_speakers.display_name is '對外頁上印的名字。只放名字不放姓，未成年的人不放。';
comment on column public.event_speakers.consent is '這個人同意把名字與照片放在對外頁。沒勾的不會出現在對外頁（public_event_extras 只回勾了的）。';
comment on column public.event_speakers.person_id is '連到紀錄（Records）裡的那個人，可以是空的。對外的函式不回這一欄。';
alter table public.event_speakers enable row level security;
revoke all on public.event_speakers from public, anon, authenticated;

-- ---------- B1. 報名類型的表 ----------
create table if not exists public.event_tickets (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references public.events(id) on delete cascade,
  name_zh     text not null default '' check (char_length(name_zh) <= 60),
  name_en     text not null default '' check (char_length(name_en) <= 60),
  note_zh     text not null default '' check (char_length(note_zh) <= 200),
  note_en     text not null default '' check (char_length(note_en) <= 200),
  capacity    int not null default 0 check (capacity >= 0),
  sort        int not null default 100,
  created_at  timestamptz not null default now(),
  check (btrim(name_zh) <> '' or btrim(name_en) <> '')
);
create index if not exists event_tickets_event on public.event_tickets (event_id, sort);
comment on table public.event_tickets is '一場活動的報名類型（免費的，沒有價錢）。沒有政策、不發權限，讀寫都走函式。2027-01-02。';
comment on column public.event_tickets.capacity is '這一種收幾個人。0 是不限。算的是沒被婉拒的報名。';
alter table public.event_tickets enable row level security;
revoke all on public.event_tickets from public, anon, authenticated;

alter table public.applications add column if not exists ticket_id uuid references public.event_tickets(id) on delete set null;
create index if not exists applications_ticket on public.applications (ticket_id) where ticket_id is not null;
comment on column public.applications.ticket_id is '報名的是哪一種類型（event_tickets）。活動沒有分類型就是空的；類型被刪掉也變空的。';

-- ---------- A2. 講者：後台用的函式（門：can_edit(那場活動的工作區)）----------
-- 讀這一場的講者（含還沒勾同意的）。回 JSON 陣列，照順序。
create or replace function public.event_speakers_list(p_event uuid)
returns jsonb language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare e record;
begin
  select * into e from events where id = p_event;
  if e.id is null then raise exception 'no_such_event' using errcode = 'P0001'; end if;
  if not public.can_edit(e.workspace_id) then raise exception 'not_event_editor' using errcode = 'P0001'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'person_id', s.person_id, 'display_name', s.display_name, 'subject', s.subject,
                                                       'school', s.school, 'photo_url', s.photo_url, 'consent', s.consent, 'sort', s.sort)
                                    order by s.sort, s.created_at, s.id)
                     from event_speakers s where s.event_id = p_event), '[]'::jsonb);
end $$;
revoke all on function public.event_speakers_list(uuid) from public, anon;
grant execute on function public.event_speakers_list(uuid) to authenticated;

-- 加一位（p_id 給 null）或改一位。p 的鍵：display_name、subject、school、photo_url、person_id，沒帶的鍵不動。
-- 新加的同意一律從沒勾開始。改了名字或換了照片，同意退回沒勾（同意的是「這個名字與這張照片」）。一場最多 40 位。
-- person_id：只有本來就讀得到名錄的人（rc_can_view）連得了；其他人帶了也當沒帶，原本連著的不動。
create or replace function public.save_event_speaker(p_event uuid, p_id uuid, p jsonb)
returns uuid language plpgsql security definer
set search_path = public, pg_temp
as $$
declare e record; s public.event_speakers%rowtype; v_id uuid; v_name text; v_photo text; v_person uuid;
begin
  select * into e from events where id = p_event;
  if e.id is null then raise exception 'no_such_event' using errcode = 'P0001'; end if;
  if not public.can_edit(e.workspace_id) then raise exception 'not_event_editor' using errcode = 'P0001'; end if;
  if p_id is not null then
    select * into s from event_speakers where id = p_id and event_id = p_event;
    if s.id is null then raise exception 'no_such_speaker' using errcode = 'P0001'; end if;
  end if;
  v_name := btrim(coalesce(p->>'display_name', s.display_name, ''));
  if v_name = '' then raise exception 'speaker_no_name' using errcode = 'P0001'; end if;
  if char_length(v_name) > 60 then raise exception 'speaker_name_long' using errcode = 'P0001'; end if;
  v_photo := case when p ? 'photo_url' then nullif(btrim(coalesce(p->>'photo_url', '')), '') else s.photo_url end;
  if v_photo is not null and v_photo !~ '^https://' then raise exception 'photo_not_https' using errcode = 'P0001'; end if;
  v_person := s.person_id;
  if p ? 'person_id' and public.rc_can_view() then
    if coalesce(p->>'person_id', '') = '' then v_person := null;
    elsif (p->>'person_id') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'no_such_person' using errcode = 'P0001';
    else
      v_person := (p->>'person_id')::uuid;
      if not exists (select 1 from people pe where pe.id = v_person and pe.forgotten_at is null) then raise exception 'no_such_person' using errcode = 'P0001'; end if;
    end if;
  end if;
  if p_id is null then
    if (select count(*) from event_speakers where event_id = p_event) >= 40 then raise exception 'too_many_speakers' using errcode = 'P0001'; end if;
    insert into event_speakers (event_id, person_id, display_name, subject, school, photo_url, consent, sort, created_by)
    values (p_event, v_person, v_name, left(btrim(coalesce(p->>'subject', '')), 120), left(btrim(coalesce(p->>'school', '')), 120), v_photo, false,
            coalesce((select max(sort) from event_speakers where event_id = p_event), 0) + 10, auth.uid())
    returning id into v_id;
  else
    update event_speakers set
      person_id = v_person,
      subject = case when p ? 'subject' then left(btrim(coalesce(p->>'subject', '')), 120) else subject end,
      school  = case when p ? 'school'  then left(btrim(coalesce(p->>'school', '')), 120)  else school end,
      consent = case when v_name is distinct from display_name or v_photo is distinct from photo_url then false else consent end,
      display_name = v_name,
      photo_url = v_photo
    where id = p_id;
    v_id := p_id;
  end if;
  return v_id;
end $$;
revoke all on function public.save_event_speaker(uuid, uuid, jsonb) from public, anon;
grant execute on function public.save_event_speaker(uuid, uuid, jsonb) to authenticated;

-- 勾或取消一位講者的同意。回存進去的值。
create or replace function public.set_event_speaker_consent(p_id uuid, p_consent boolean)
returns boolean language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v record;
begin
  select s.id, e.workspace_id into v from event_speakers s join events e on e.id = s.event_id where s.id = p_id;
  if v.id is null then raise exception 'no_such_speaker' using errcode = 'P0001'; end if;
  if not public.can_edit(v.workspace_id) then raise exception 'not_event_editor' using errcode = 'P0001'; end if;
  update event_speakers set consent = coalesce(p_consent, false) where id = p_id;
  return coalesce(p_consent, false);
end $$;
revoke all on function public.set_event_speaker_consent(uuid, boolean) from public, anon;
grant execute on function public.set_event_speaker_consent(uuid, boolean) to authenticated;

-- 排順序：p_ids 是這一場講者的 id，照要的順序。不是這一場的 id 不會被動到。回改了幾位。
create or replace function public.reorder_event_speakers(p_event uuid, p_ids uuid[])
returns int language plpgsql security definer
set search_path = public, pg_temp
as $$
declare e record; n int;
begin
  select * into e from events where id = p_event;
  if e.id is null then raise exception 'no_such_event' using errcode = 'P0001'; end if;
  if not public.can_edit(e.workspace_id) then raise exception 'not_event_editor' using errcode = 'P0001'; end if;
  update event_speakers s set sort = x.ord * 10
    from unnest(p_ids) with ordinality as x(id, ord) where s.id = x.id and s.event_id = p_event;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.reorder_event_speakers(uuid, uuid[]) from public, anon;
grant execute on function public.reorder_event_speakers(uuid, uuid[]) to authenticated;

-- 拿掉一位，回他的照片網址（前端拿去把 Storage 的檔也刪掉；沒有照片回空值）。
create or replace function public.delete_event_speaker(p_id uuid)
returns text language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v record;
begin
  select s.id, s.photo_url, e.workspace_id into v from event_speakers s join events e on e.id = s.event_id where s.id = p_id;
  if v.id is null then raise exception 'no_such_speaker' using errcode = 'P0001'; end if;
  if not public.can_edit(v.workspace_id) then raise exception 'not_event_editor' using errcode = 'P0001'; end if;
  delete from event_speakers where id = p_id;
  return v.photo_url;
end $$;
revoke all on function public.delete_event_speaker(uuid) from public, anon;
grant execute on function public.delete_event_speaker(uuid) to authenticated;

-- ---------- A3. 紀錄那邊忘記一個人，他當講者的那幾列跟著刪 ----------
-- forget_person() 與 delete_my_account() 最後都是把 people.forgotten_at 填上時間（rc_forget_rows）。掛在那一欄上，不用重建那幾支。
create or replace function public.event_speakers_forget_trg()
returns trigger language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if new.forgotten_at is not null and old.forgotten_at is null then
    delete from public.event_speakers where person_id = new.id;
  end if;
  return new;
end $$;
revoke all on function public.event_speakers_forget_trg() from public, anon, authenticated;
drop trigger if exists event_speakers_forget on public.people;
create trigger event_speakers_forget after update of forgotten_at on public.people
  for each row execute function public.event_speakers_forget_trg();

-- ---------- B2. 報名類型：後台用的函式（門：can_edit(那場活動的工作區)）----------
-- 讀這一場的報名類型。taken 是沒被婉拒的報名數（名額算這個），used 是所有掛在這一種上的報名（大於 0 就刪不掉）。
create or replace function public.event_tickets_list(p_event uuid)
returns jsonb language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare e record;
begin
  select * into e from events where id = p_event;
  if e.id is null then raise exception 'no_such_event' using errcode = 'P0001'; end if;
  if not public.can_edit(e.workspace_id) then raise exception 'not_event_editor' using errcode = 'P0001'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'name_zh', t.name_zh, 'name_en', t.name_en, 'note_zh', t.note_zh, 'note_en', t.note_en,
                                                       'capacity', t.capacity, 'sort', t.sort,
                                                       'taken', (select count(*) from applications a where a.ticket_id = t.id and a.status <> 'rejected'),
                                                       'used', (select count(*) from applications a where a.ticket_id = t.id))
                                    order by t.sort, t.created_at, t.id)
                     from event_tickets t where t.event_id = p_event), '[]'::jsonb);
end $$;
revoke all on function public.event_tickets_list(uuid) from public, anon;
grant execute on function public.event_tickets_list(uuid) to authenticated;

-- 加一種（p_id 給 null）或改一種。p 的鍵：name_zh、name_en、note_zh、note_en、capacity，沒帶的鍵不動。
-- 中英名稱至少要有一個。名額是 0 以上的整數（0 是不限）。一場最多 12 種。
create or replace function public.save_event_ticket(p_event uuid, p_id uuid, p jsonb)
returns uuid language plpgsql security definer
set search_path = public, pg_temp
as $$
declare e record; t public.event_tickets%rowtype; v_id uuid; v_zh text; v_en text; v_cap int;
begin
  select * into e from events where id = p_event;
  if e.id is null then raise exception 'no_such_event' using errcode = 'P0001'; end if;
  if not public.can_edit(e.workspace_id) then raise exception 'not_event_editor' using errcode = 'P0001'; end if;
  if p_id is not null then
    select * into t from event_tickets where id = p_id and event_id = p_event;
    if t.id is null then raise exception 'no_such_ticket' using errcode = 'P0001'; end if;
  end if;
  v_zh := left(btrim(coalesce(p->>'name_zh', t.name_zh, '')), 60);
  v_en := left(btrim(coalesce(p->>'name_en', t.name_en, '')), 60);
  if v_zh = '' and v_en = '' then raise exception 'ticket_no_name' using errcode = 'P0001'; end if;
  if p ? 'capacity' then
    if coalesce(p->>'capacity', '') !~ '^[0-9]{1,6}$' then raise exception 'bad_capacity' using errcode = 'P0001'; end if;
    v_cap := (p->>'capacity')::int;
  else
    v_cap := coalesce(t.capacity, 0);
  end if;
  if p_id is null then
    if (select count(*) from event_tickets where event_id = p_event) >= 12 then raise exception 'too_many_tickets' using errcode = 'P0001'; end if;
    insert into event_tickets (event_id, name_zh, name_en, note_zh, note_en, capacity, sort)
    values (p_event, v_zh, v_en, left(btrim(coalesce(p->>'note_zh', '')), 200), left(btrim(coalesce(p->>'note_en', '')), 200), v_cap,
            coalesce((select max(sort) from event_tickets where event_id = p_event), 0) + 10)
    returning id into v_id;
  else
    update event_tickets set
      name_zh = v_zh, name_en = v_en,
      note_zh = case when p ? 'note_zh' then left(btrim(coalesce(p->>'note_zh', '')), 200) else note_zh end,
      note_en = case when p ? 'note_en' then left(btrim(coalesce(p->>'note_en', '')), 200) else note_en end,
      capacity = v_cap
    where id = p_id;
    v_id := p_id;
  end if;
  return v_id;
end $$;
revoke all on function public.save_event_ticket(uuid, uuid, jsonb) from public, anon;
grant execute on function public.save_event_ticket(uuid, uuid, jsonb) to authenticated;

-- 排順序。跟講者、照片同一個做法。
create or replace function public.reorder_event_tickets(p_event uuid, p_ids uuid[])
returns int language plpgsql security definer
set search_path = public, pg_temp
as $$
declare e record; n int;
begin
  select * into e from events where id = p_event;
  if e.id is null then raise exception 'no_such_event' using errcode = 'P0001'; end if;
  if not public.can_edit(e.workspace_id) then raise exception 'not_event_editor' using errcode = 'P0001'; end if;
  update event_tickets t set sort = x.ord * 10
    from unnest(p_ids) with ordinality as x(id, ord) where t.id = x.id and t.event_id = p_event;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.reorder_event_tickets(uuid, uuid[]) from public, anon;
grant execute on function public.reorder_event_tickets(uuid, uuid[]) to authenticated;

-- 拿掉一種。已經有人報這一種（不管審核結果）就不給刪：刪了那些人的報名會變成「沒有類型」，名單就對不回來了。
create or replace function public.delete_event_ticket(p_id uuid)
returns uuid language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v record;
begin
  select t.id, e.workspace_id into v from event_tickets t join events e on e.id = t.event_id where t.id = p_id;
  if v.id is null then raise exception 'no_such_ticket' using errcode = 'P0001'; end if;
  if not public.can_edit(v.workspace_id) then raise exception 'not_event_editor' using errcode = 'P0001'; end if;
  if exists (select 1 from applications a where a.ticket_id = p_id) then raise exception 'ticket_in_use' using errcode = 'P0001'; end if;
  delete from event_tickets where id = p_id;
  return p_id;
end $$;
revoke all on function public.delete_event_ticket(uuid) from public, anon;
grant execute on function public.delete_event_ticket(uuid) to authenticated;

-- 看報名名單的人把 ticket_id 對回名字用。門是 form_can_view（看得到那份報名的人，跟 applications 的讀取規則同一條）；看不到的回空陣列。
create or replace function public.form_ticket_names(p_form uuid)
returns jsonb language sql stable security definer
set search_path = public, pg_temp
as $$
  select case when public.form_can_view(p_form) then coalesce((
    select jsonb_agg(jsonb_build_object('id', t.id, 'name_zh', t.name_zh, 'name_en', t.name_en) order by t.sort, t.created_at, t.id)
      from event_tickets t join events e on e.id = t.event_id where e.form_id = p_form), '[]'::jsonb) else '[]'::jsonb end;
$$;
revoke all on function public.form_ticket_names(uuid) from public, anon;
grant execute on function public.form_ticket_names(uuid) to authenticated;

-- ---------- B3. 送出報名：多一個 p_ticket ----------
-- 舊的四個參數那一支要先拿掉：留著的話，前端沒帶 p_ticket 叫的時候兩支都對得上，資料庫會說不知道叫哪一支。
-- drop 與重建在同一個 transaction 裡，中間沒有一刻是叫不到的。
-- 跟 2026-12-20-form-engine.sql 那一版比，只多三個地方：宣告裡的 v_tcap、「報名類型」那一段、insert 多寫一欄 ticket_id。其他一字不改。
drop function if exists public.submit_application(uuid, jsonb, text, jsonb);
create or replace function public.submit_application(
  p_form_id uuid, p_answers jsonb, p_guardian_email text default null, p_meta jsonb default null, p_ticket uuid default null)
returns uuid language plpgsql security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_uid   uuid := auth.uid();
  v_form  public.forms%rowtype;
  v_app   uuid;
  v_name  text; v_school text; v_grade text; v_email text;
  v_bad   text;
  v_meta  jsonb := '{}'::jsonb;
  v_ans   jsonb := case when jsonb_typeof(p_answers) = 'array' then p_answers else '[]'::jsonb end;
  k text;
  v_tcap  int;
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = 'P0001'; end if;
  select * into v_form from public.forms where id = p_form_id;
  if not found then raise exception 'no_such_form' using errcode = 'P0001'; end if;
  if v_form.status <> 'open'
     or (v_form.opens_at  is not null and now() < v_form.opens_at)
     or (v_form.closes_at is not null and now() > v_form.closes_at)
  then raise exception 'form_closed' using errcode = 'P0001'; end if;
  if not public.form_is_listed(p_form_id) then raise exception 'form_closed' using errcode = 'P0001'; end if;
  -- 已經送過的人不擋，走到最底下 unique_violation 那條回原本那一筆（按兩下、開兩個分頁）。
  if not exists (select 1 from public.applications where form_id = p_form_id and user_id = v_uid) then
    if public.event_is_full(p_form_id) or public.form_is_full(p_form_id) then
      raise exception 'full' using errcode = 'P0001';
    end if;
  end if;
  -- 2027-01-02 報名類型：這份表單的活動有分類型，就一定要帶一種，而且要是這場活動的；那一種有名額、滿了就擋。
  -- 已經送過的人一樣不擋（回原本那一筆）。活動沒有分類型、也沒帶 p_ticket 的，這一段什麼都不做，跟以前一樣。
  -- for update：同一種類型同時進來兩個人，排隊一個一個數，不會兩個都數到「還有一個位子」。
  if not exists (select 1 from public.applications where form_id = p_form_id and user_id = v_uid) then
    if p_ticket is null then
      if exists (select 1 from public.event_tickets t join public.events e on e.id = t.event_id where e.form_id = p_form_id) then
        raise exception 'ticket_required' using errcode = 'P0001';
      end if;
    else
      select t.capacity into v_tcap from public.event_tickets t join public.events e on e.id = t.event_id
       where t.id = p_ticket and e.form_id = p_form_id for update of t;
      if not found then raise exception 'bad_ticket' using errcode = 'P0001'; end if;
      if v_tcap > 0 and (select count(*) from public.applications a where a.ticket_id = p_ticket and a.status <> 'rejected') >= v_tcap then
        raise exception 'ticket_full' using errcode = 'P0001';
      end if;
    end if;
  end if;
  select coalesce(name_zh, name_en, ''), school, grade into v_name, v_school, v_grade from public.profiles where id = v_uid;
  if coalesce(v_name, '') = '' then raise exception 'profile_incomplete' using errcode = 'P0001'; end if;
  select email into v_email from auth.users where id = v_uid;
  -- 一個 email 一份：同一個信箱用別的帳號（例如改過登入信箱）也送不了第二份。
  if exists (select 1 from public.applications where form_id = p_form_id and user_id <> v_uid
                and lower(applicant_email) = lower(coalesce(v_email, ''))) then
    raise exception 'email_used' using errcode = 'P0001';
  end if;
  v_bad := public.form_answer_problem(p_form_id, v_ans, v_uid);
  if v_bad like 'missing:%' then raise exception '%', v_bad using errcode = 'P0001'; end if;
  if v_bad is not null then raise exception '%', v_bad using errcode = 'P0001'; end if;
  -- 隱藏欄位：只收表單設定列的名字，值是文字、最多 200 字。
  if jsonb_typeof(p_meta) = 'object' then
    foreach k in array coalesce(v_form.hidden_fields, '{}') loop
      if p_meta ? k and jsonb_typeof(p_meta->k) in ('string', 'number') then
        v_meta := v_meta || jsonb_build_object(k, left(p_meta->>k, 200));
      end if;
    end loop;
  end if;
  insert into public.applications
    (form_id, user_id, applicant_name, applicant_school, applicant_grade, applicant_email, guardian_email, meta, ticket_id)
  values (p_form_id, v_uid, v_name, v_school, v_grade, v_email, nullif(btrim(coalesce(p_guardian_email, '')), ''), v_meta, p_ticket)
  returning id into v_app;
  -- 只存這份表單真的有、會收答案、而且有送進來的題。被條件藏起來的題前端不送，這裡就沒有那一列。
  insert into public.application_answers (application_id, question_id, value)
  select v_app, q.id, left(btrim(coalesce(a.value->>'v', '')), 10000)
    from public.form_questions q
    join lateral (select x as value from jsonb_array_elements(v_ans) x where x->>'q' = q.id::text limit 1) a on true
   where q.form_id = p_form_id and q.type not in ('heading', 'text', 'page');
  return v_app;
exception
  when unique_violation then
    select id into v_app from public.applications where form_id = p_form_id and user_id = v_uid;
    if v_app is null then raise; end if;
    return v_app;
end $$;
revoke all on function public.submit_application(uuid, jsonb, text, jsonb, uuid) from public, anon;
grant execute on function public.submit_application(uuid, jsonb, text, jsonb, uuid) to authenticated;

-- ---------- C. 對外 ----------
-- 一場活動的報名類型，對外的樣子。這一支不發給任何人，只給下面兩支對外的函式叫（它們是 security definer）。
-- taken 算沒被婉拒的報名；full 是有名額而且到了。
create or replace function public.event_tickets_public(p_event uuid)
returns jsonb language sql stable security definer
set search_path = public, pg_temp
as $$
  select coalesce((
    select jsonb_agg(jsonb_build_object('id', t.id, 'name_zh', t.name_zh, 'name_en', t.name_en, 'note_zh', t.note_zh, 'note_en', t.note_en,
                                        'capacity', t.capacity, 'taken', x.taken, 'full', t.capacity > 0 and x.taken >= t.capacity)
                     order by t.sort, t.created_at, t.id)
      from event_tickets t
      cross join lateral (select count(*)::int as taken from applications a where a.ticket_id = t.id and a.status <> 'rejected') x
     where t.event_id = p_event), '[]'::jsonb);
$$;
revoke all on function public.event_tickets_public(uuid) from public, anon, authenticated;

-- 一場活動除了 public_event() 那一列之外要印的東西：照片、講者、報名類型。
-- 只回 published 的活動。照片與講者只回同意勾了的。講者只有四個鍵：name、subject、school、photo_url（沒有 id、沒有連到紀錄的 person_id、沒有 email）。
-- 活動沒上架或代號不存在回空值。photos 那一段跟 2027-01-01-event-photos.sql 一字不差。
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
    'tickets', public.event_tickets_public(e.id))
    from events e
   where e.slug = p_slug and e.status = 'published';
$$;
revoke all on function public.public_event_extras(text) from public;
grant execute on function public.public_event_extras(text) to anon, authenticated;

-- /apply/ 手上只有表單 id：這份表單的活動有哪些報名類型。跟 form_is_listed() 同一條線，活動還是草稿或待上架就回空陣列
-- （那時候表單本來就不對外）。沒有活動、活動沒有分類型也是空陣列。
create or replace function public.public_form_tickets(p_form uuid)
returns jsonb language sql stable security definer
set search_path = public, pg_temp
as $$
  select coalesce((select public.event_tickets_public(e.id) from events e
                    where e.form_id = p_form and e.status not in ('draft', 'ready')
                    order by e.created_at limit 1), '[]'::jsonb);
$$;
revoke all on function public.public_form_tickets(uuid) from public;
grant execute on function public.public_form_tickets(uuid) to anon, authenticated;

-- 封面：同意沒勾就不對外。回傳的欄位跟 2026-12-31-programmes.sql 一模一樣，所以 create or replace 蓋得過去，不用 drop。
-- 跟那一版比只差 cover_url 那一行；其他一字不改。public_event(代號) 是從這一支讀的，不用動。
create or replace function public.public_events()
returns table (
  slug text, team text, title_zh text, title_en text, summary_zh text, summary_en text, body_zh text, body_en text,
  cover_url text, starts_at timestamptz, ends_at timestamptz, place text, capacity int,
  form_id uuid, signup_open boolean, signup_opens_at timestamptz, signup_closes_at timestamptz, signed_up int, is_full boolean, is_past boolean,
  usual_month smallint, recurring boolean, edition_zh text, edition_en text)
language sql stable security definer
set search_path = public, pg_temp
as $$
  select e.slug, e.team, e.title_zh, e.title_en, e.summary_zh, e.summary_en, e.body_zh, e.body_en,
         case when e.cover_consent then e.cover_url end, e.starts_at, e.ends_at, e.place, e.capacity,
         e.form_id,
         (f.id is not null and f.status = 'open' and (f.opens_at is null or now() >= f.opens_at) and (f.closes_at is null or now() <= f.closes_at)) as signup_open,
         f.opens_at, f.closes_at,
         coalesce((select count(*)::int from applications a where a.form_id = f.id and a.status <> 'rejected'), 0) as signed_up,
         (e.capacity > 0 and coalesce((select count(*) from applications a where a.form_id = f.id and a.status <> 'rejected'), 0) >= e.capacity) as is_full,
         -- 沒有開始也沒有結束時間的（只有「通常在幾月」或固定計畫）算還沒過去，不回空的。
         -- 只知道哪一天、還不知道幾點的（後台時間填台灣的半夜十二點、沒有結束時間），整個那一天都還不算過去，隔天半夜才算。
         -- 不這樣的話，寒假探索營在活動當天一過半夜就會從「近期活動」消失。
         coalesce(coalesce(e.ends_at,
                           case when (e.starts_at at time zone 'Asia/Taipei')::time = time '00:00' then e.starts_at + interval '1 day' else e.starts_at end) < now(), false) as is_past,
         e.usual_month, e.recurring, e.edition_zh, e.edition_en
    from events e left join forms f on f.id = e.form_id
   where e.status = 'published'
   -- 有日期的照日期，沒有日期的排最後；沒有日期的那幾筆彼此照「通常在幾月」再照代號，每次回來順序一樣。
   order by e.starts_at nulls last, e.usual_month nulls last, e.slug
$$;
revoke all on function public.public_events() from public;
grant execute on function public.public_events() to anon, authenticated;

commit;

-- ---------- 驗收 ----------
select * from (
  with fn as (
    select p.proname, p.prosecdef, p.proconfig, p.provolatile, pg_get_function_identity_arguments(p.oid) as args, regexp_replace(p.prosrc, '--[^\n]*', '', 'g') as body
      from pg_proc p where p.pronamespace = 'public'::regnamespace
       and p.proname in ('event_speakers_list', 'save_event_speaker', 'set_event_speaker_consent', 'reorder_event_speakers', 'delete_event_speaker',
                         'event_tickets_list', 'save_event_ticket', 'reorder_event_tickets', 'delete_event_ticket',
                         'form_ticket_names', 'event_tickets_public', 'public_form_tickets', 'public_event_extras', 'event_speakers_forget_trg',
                         'submit_application', 'public_events')
  ), t as (
    select to_regclass('public.event_speakers') is not null and to_regclass('public.event_tickets') is not null as tbl,
           (select bool_and(relrowsecurity) from pg_class where oid in ('public.event_speakers'::regclass, 'public.event_tickets'::regclass)) as rls_on,
           (select count(*) from pg_policies where schemaname = 'public' and tablename in ('event_speakers', 'event_tickets')) as pols,
           (select count(*) from information_schema.table_privileges where table_schema = 'public' and table_name in ('event_speakers', 'event_tickets') and grantee in ('anon', 'authenticated', 'PUBLIC')) as tbl_grants,
           exists (select 1 from pg_constraint c where c.conrelid = 'public.applications'::regclass and c.contype = 'f' and c.confrelid = 'public.event_tickets'::regclass and c.confdeltype = 'n') as ticket_fk,
           (select count(*) from fn) as fns,
           (select bool_and(prosecdef and proconfig::text like '%search_path=public,%pg_temp%') from fn) as definer,
           (select bool_and(body like '%can_edit(%workspace_id)%' and body like '%not_event_editor%') from fn
             where proname in ('event_speakers_list', 'save_event_speaker', 'set_event_speaker_consent', 'reorder_event_speakers', 'delete_event_speaker',
                               'event_tickets_list', 'save_event_ticket', 'reorder_event_tickets', 'delete_event_ticket')) as gate,
           (select body like '%form_can_view(p_form)%' from fn where proname = 'form_ticket_names') as names_gate,
           (select body like '%e.status = ''published''%' and body like '%p.consent%' and body like '%s.consent%' and provolatile = 's'
                   and body like '%jsonb_build_object(''name'', s.display_name, ''subject'', s.subject, ''school'', s.school, ''photo_url'', s.photo_url)%'
                   and body not like '%person_id%' and body not like '%created_by%' from fn where proname = 'public_event_extras') as public_gate,
           (select body like '%v_photo, false,%' and body like '%v_name is distinct from display_name or v_photo is distinct from photo_url then false%'
                   and body like '%rc_can_view()%' from fn where proname = 'save_event_speaker') as speaker_rules,
           (select body like '%ticket_in_use%' from fn where proname = 'delete_event_ticket') as in_use_gate,
           (select count(*) = 1 from fn where proname = 'submit_application') as one_submit,
           (select args like '%p_meta%' and args like '%p_ticket uuid' from fn where proname = 'submit_application') as ticket_arg,
           (select body like '%form_answer_problem(%' and body like '%form_is_full(%' and body like '%email_used%' and body like '%form_is_listed(%' and body like '%event_is_full(%'
                   and body like '%ticket_required%' and body like '%bad_ticket%' and body like '%ticket_full%' and body like '%v_meta, p_ticket)%'
              from fn where proname = 'submit_application') as submit_gates,
           (select body like '%case when e.cover_consent then e.cover_url end%' and body like '%e.status = ''published''%' and body like '%order by e.starts_at nulls last%'
              from fn where proname = 'public_events') as cover_gate,
           has_function_privilege('anon', 'public.public_event_extras(text)', 'execute') and has_function_privilege('authenticated', 'public.public_event_extras(text)', 'execute')
             and has_function_privilege('anon', 'public.public_form_tickets(uuid)', 'execute') and has_function_privilege('authenticated', 'public.public_form_tickets(uuid)', 'execute')
             and has_function_privilege('anon', 'public.public_events()', 'execute') and has_function_privilege('authenticated', 'public.public_events()', 'execute') as pub_exec,
           not has_function_privilege('anon', 'public.event_speakers_list(uuid)', 'execute') and not has_function_privilege('anon', 'public.save_event_speaker(uuid, uuid, jsonb)', 'execute')
             and not has_function_privilege('anon', 'public.set_event_speaker_consent(uuid, boolean)', 'execute') and not has_function_privilege('anon', 'public.reorder_event_speakers(uuid, uuid[])', 'execute')
             and not has_function_privilege('anon', 'public.delete_event_speaker(uuid)', 'execute') and not has_function_privilege('anon', 'public.event_tickets_list(uuid)', 'execute')
             and not has_function_privilege('anon', 'public.save_event_ticket(uuid, uuid, jsonb)', 'execute') and not has_function_privilege('anon', 'public.reorder_event_tickets(uuid, uuid[])', 'execute')
             and not has_function_privilege('anon', 'public.delete_event_ticket(uuid)', 'execute') and not has_function_privilege('anon', 'public.form_ticket_names(uuid)', 'execute')
             and not has_function_privilege('anon', 'public.submit_application(uuid, jsonb, text, jsonb, uuid)', 'execute') as anon_no_write,
           not has_function_privilege('anon', 'public.event_tickets_public(uuid)', 'execute') and not has_function_privilege('authenticated', 'public.event_tickets_public(uuid)', 'execute')
             and not has_function_privilege('authenticated', 'public.event_speakers_forget_trg()', 'execute') as inner_private,
           has_function_privilege('authenticated', 'public.submit_application(uuid, jsonb, text, jsonb, uuid)', 'execute') as auth_submit,
           exists (select 1 from pg_trigger where tgrelid = 'public.people'::regclass and tgname = 'event_speakers_forget' and not tgisinternal) as forget_trg,
           (select count(*) from public.event_speakers s join public.events e on e.id = s.event_id
             where e.status = 'published' and not s.consent
               and public.public_event_extras(e.slug)->'speakers' @> jsonb_build_array(jsonb_build_object('name', s.display_name, 'subject', s.subject, 'school', s.school, 'photo_url', s.photo_url))
               and not exists (select 1 from public.event_speakers q where q.event_id = s.event_id and q.consent and q.display_name = s.display_name and q.subject = s.subject
                                  and q.school = s.school and q.photo_url is not distinct from s.photo_url)) as leaked,
           (select count(*) from public.public_events() x join public.events e on e.slug = x.slug where x.cover_url is not null and not e.cover_consent) as cover_leaked,
           (select count(*) from public.events e where e.status <> 'published' and public.public_event_extras(e.slug) is not null) as unpublished_out
  )
  select 0 ord, 'OVERALL' as 項目, null::text as 應該是, null::text as 實際是,
    case when tbl and rls_on and pols = 0 and tbl_grants = 0 and ticket_fk and fns = 16 and definer and gate and names_gate and public_gate and speaker_rules and in_use_gate
              and one_submit and ticket_arg and submit_gates and cover_gate and pub_exec and anon_no_write and inner_private and auth_submit and forget_trg
              and leaked = 0 and cover_leaked = 0 and unpublished_out = 0 then 'PASS' else 'FAIL' end as 結果 from t
  union all select 1, 'event_speakers、event_tickets 兩張表在、RLS 開著', 'true|true', tbl::text || '|' || coalesce(rls_on::text, '沒有表'), case when tbl and rls_on then 'PASS' else 'FAIL' end from t
  union all select 2, '★ 兩張表沒有任何政策、沒發任何權限給前端（讀寫都走函式）', '0|0', pols::text || '|' || tbl_grants::text, case when pols = 0 and tbl_grants = 0 then 'PASS' else 'FAIL' end from t
  union all select 3, 'applications 多一欄 ticket_id，類型被刪掉就變空的', 'true', ticket_fk::text, case when ticket_fk then 'PASS' else 'FAIL' end from t
  union all select 4, '十六支函式在（submit_application 只有一支），都是 security definer、search_path 鎖著', '16|true|true', fns::text || '|' || coalesce(one_submit::text, '沒有函式') || '|' || coalesce(definer::text, '沒有函式'), case when fns = 16 and one_submit and definer then 'PASS' else 'FAIL' end from t
  union all select 5, '★ 後台講者五支、報名類型四支的門都是 can_edit(那場活動的工作區)；對名字那一支看 form_can_view', 'true|true', coalesce(gate::text, '沒有函式') || '|' || coalesce(names_gate::text, '沒有函式'), case when gate and names_gate then 'PASS' else 'FAIL' end from t
  union all select 6, '★ 對外那一支只回 published 的活動；講者只回同意勾了的、只有四個鍵', 'true', coalesce(public_gate::text, '沒有函式'), case when public_gate then 'PASS' else 'FAIL' end from t
  union all select 7, '★ 新加的講者同意從沒勾開始；改名字或換照片同意退回沒勾；連到紀錄的人要讀得到名錄', 'true', coalesce(speaker_rules::text, '沒有函式'), case when speaker_rules then 'PASS' else 'FAIL' end from t
  union all select 8, '已經有人報的類型刪不掉（ticket_in_use）', 'true', coalesce(in_use_gate::text, '沒有函式'), case when in_use_gate then 'PASS' else 'FAIL' end from t
  union all select 9, '★ submit_application() 多一個 p_ticket，原本五道門都在，多三道（要帶、要是這場的、滿了擋）', 'true|true', coalesce(ticket_arg::text, '沒有函式') || '|' || coalesce(submit_gates::text, '沒有函式'), case when ticket_arg and submit_gates then 'PASS' else 'FAIL' end from t
  union all select 10, '★ public_events() 的封面同意勾了才回', 'true', coalesce(cover_gate::text, '沒有函式'), case when cover_gate then 'PASS' else 'FAIL' end from t
  union all select 11, '★ 沒登入叫得到對外三支，叫不到後台那十支與送出報名；登入的人送得出報名', 'true|true|true', pub_exec::text || '|' || anon_no_write::text || '|' || auth_submit::text, case when pub_exec and anon_no_write and auth_submit then 'PASS' else 'FAIL' end from t
  union all select 12, '裡面用的兩支（event_tickets_public、忘記的人那個 trigger 的函式）誰都直接叫不到；trigger 掛在 people 上', 'true|true', inner_private::text || '|' || forget_trg::text, case when inner_private and forget_trg then 'PASS' else 'FAIL' end from t
  union all select 13, '★ 現有的資料：沒勾同意的講者沒有一位漏到對外、沒勾同意的封面沒有一張對外、沒上架的活動沒有一場回得出東西', '0|0|0', leaked::text || '|' || cover_leaked::text || '|' || unpublished_out::text, case when leaked = 0 and cover_leaked = 0 and unpublished_out = 0 then 'PASS' else 'FAIL' end from t
) q order by ord;
