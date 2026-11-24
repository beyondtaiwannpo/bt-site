-- 2027-01-03：人的名錄變成關係網（Paul 2026-11-23：「turn BT's people database… into a relationship network」，
-- 第一個要用的場合是 2027-01-03 那一場約九位講者）。五件事：
--   1. 標籤取代「種類」。一個人以前只能是 member、student、guest 其中一種；現在標籤從紀錄算出來，一個人可以有好幾個、每一個有年份：
--      出席過活動 → student；當過講者（出席紀錄的 speaker，或活動頁的講者連到他）→ speaker；有職位 → member；配對 → mentor、mentee；
--      志工、主辦照出席紀錄；實習生照帳號。這些是「賺來的」，沒有人手動改，也沒有人能替自己加（rc_labels_of()，只讀）。
--      另外三種講的是他在 BT 外面是誰，只有管紀錄的人加得了（rc_labels 表、rc_label_set()）：professor、admission_officer、connection。
--      people.kind 那一欄留著不動：roster() 靠它把學員擋在幹部名單外，rc_save_outcome 靠它擋學員的去向連名字公開。畫面不再印它。
--      **標籤不給任何權限**：誰進得了後台、讀得到什麼，還是帳號的 role 與工作區，這一支一條都沒動。
--   2. 一個人多一份 profile（rc_profiles）：照片、現在在哪、現在的工作、專長領域、一段介紹、六題故事、他自己舉的手（願意演講、願意當 mentor、
--      可以聯絡）、他自己給的兩個同意（名字照片可以對外、故事可以引用），以及 BT 這邊的關係紀錄（團隊裡誰認識他、上次聯絡、多願意幫忙、備註）。
--      **不放進 people 表**：people 開了 select 政策給登入的人（本人與 senior 讀得到整列），新欄位放那裡等於多開一條路。
--      rc_profiles 跟其他 rc_ 表一樣沒有政策、不發權限，讀寫都走函式。
--      兩個同意只有本人勾得了（走下面那條連結）；管的人只能替他取消（consent_needs_self），跟去向的 public_needs_self 同一個原則。
--   3. 個人連結（rc_profile_links）：管紀錄的人替一個人開一條不用登入的連結（/profile/?t=…），他打開只看得到、改得動自己的那一份。
--      九十天過期、可以撤銷、一個人同時只有一條有效；一條連結一小時最多存 40 次。開給 anon 的只有兩支：rc_public_profile、rc_public_profile_save。
--      **還在念高中的學員開不了連結**（minor_no_link：kind = student 而且畢業年是空的或還沒到）：未成年不對外，這條路是給成年人的。
--      存的時候要勾「我已滿 18 歲」（adult_only）。他填的聯絡方式如果已經在別人身上，不告訴他（不能讓拿連結的人探出誰的 email 在名單上），
--      記一筆 profile_contact_conflict 給管的人看。
--   4. 去向多一欄 title（學位或職稱），連結上填的學歷與經歷存成去向（來源 self、內部可見）。
--   5. 接上既有的函式：rc_person 多 profile、labels、given、link、speaking；rc_directory 與 rc_find_people 多標籤與講者卡要的幾格；
--      合併（rc_move_records）把 profile、標籤、連結、講者那幾列一起搬；忘記一個人（forgotten_at）時這三張表跟著清。
--      Storage 多一個 bucket people（公開讀、5 MB、只收圖），上傳與刪除只給管紀錄的人。
-- 接在 2027-01-02-event-speakers-tickets.sql 後面跑。可以重跑，不動既有資料。最後印一張驗收表。
-- ⚠ 之後如果重跑 2026-12-10、2026-12-11 或 2026-12-12（裡面是舊版的 rc_directory、rc_move_records、rc_person），要再跑一次這一支。
begin;

-- ---------- 1. 表 ----------
create table if not exists public.rc_profiles (
  person_id        uuid primary key references public.people(id) on delete cascade,
  photo_url        text check (photo_url is null or photo_url ~ '^https://'),
  city             text not null default '' check (char_length(city) <= 80),
  country          text not null default '' check (char_length(country) <= 80),
  job_title        text not null default '' check (char_length(job_title) <= 120),
  job_org          text not null default '' check (char_length(job_org) <= 120),
  field            text not null default '' check (char_length(field) <= 120),
  bio              text not null default '' check (char_length(bio) <= 600),
  story            jsonb not null default '{}'::jsonb,
  offer_speak      boolean not null default false,
  offer_mentor     boolean not null default false,
  contact_ok       boolean not null default false,
  share_profile    boolean not null default false,
  share_story      boolean not null default false,
  consent_at       timestamptz,
  done_at          timestamptz,
  rel_owner        uuid references public.people(id) on delete set null,
  rel_last_contact date,
  rel_open         text not null default 'unknown' check (rel_open in ('unknown', 'open', 'maybe', 'closed')),
  rel_note         text not null default '' check (char_length(rel_note) <= 2000),
  updated_at       timestamptz not null default now()
);
alter table public.rc_profiles enable row level security;
revoke all on public.rc_profiles from public, anon, authenticated;
comment on table public.rc_profiles is '一個人的 profile：照片、所在地、工作、故事、他自己舉的手與同意、BT 這邊的關係紀錄。沒有政策、不發權限，讀寫都走函式。2027-01-03。';
comment on column public.rc_profiles.story is '六題故事：highschool、turning、hardest、decision、wish17、first_step。他自己在個人連結上寫的。';
comment on column public.rc_profiles.share_profile is '本人同意名字、照片、職稱可以放在對外頁。只有本人勾得了，管的人只能取消。';
comment on column public.rc_profiles.share_story is '本人同意故事可以被引用（介紹、貼文、給學員的材料）。只有本人勾得了。';
comment on column public.rc_profiles.rel_note is 'BT 內部的關係備註。個人連結永遠讀不到這一格。';

create table if not exists public.rc_labels (
  id         bigint generated always as identity primary key,
  person_id  uuid not null references public.people(id) on delete cascade,
  label      text not null check (label in ('professor', 'admission_officer', 'connection')),
  detail     text not null default '' check (char_length(detail) <= 160),
  since_year smallint check (since_year is null or since_year between 1950 and 2100),
  until_year smallint check (until_year is null or until_year between 1950 and 2100),
  set_by     uuid references public.profiles(id) on delete set null,
  set_at     timestamptz not null default now(),
  unique (person_id, label)
);
alter table public.rc_labels enable row level security;
revoke all on public.rc_labels from public, anon, authenticated;
comment on table public.rc_labels is 'BT 給的標籤（他在 BT 外面是誰）：教授、招生官、其他聯絡人。賺來的標籤不存在這裡，是 rc_labels_of() 從紀錄算的。2027-01-03。';

create table if not exists public.rc_profile_links (
  id           uuid primary key default gen_random_uuid(),
  person_id    uuid not null references public.people(id) on delete cascade,
  token        text not null unique,
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null,
  revoked_at   timestamptz,
  opened_at    timestamptz,
  submitted_at timestamptz,
  saves        int not null default 0,
  saves_from   timestamptz
);
create unique index if not exists rc_profile_links_one_live on public.rc_profile_links (person_id) where revoked_at is null;
alter table public.rc_profile_links enable row level security;
revoke all on public.rc_profile_links from public, anon, authenticated;
comment on table public.rc_profile_links is '不用登入的個人連結（/profile/?t=token）。一個人同時只有一條沒撤銷的，九十天過期。2027-01-03。';

alter table public.rc_outcomes add column if not exists title text not null default '' check (char_length(title) <= 120);
comment on column public.rc_outcomes.title is '學位（就讀、畢業）或職稱（工作中）。2027-01-03。';

-- ---------- 2. 標籤：從紀錄算（賺來的）加 rc_labels（給的）----------
-- 回 [{ label, source: earned|given, since, until, current, n, detail }]。current 是「現在還是」：
--   member 現在這一屆有職位（或帳號是幹部）；不是 current 的 member 畫面上叫校友。
--   student kind 是 student 而且還沒畢業；不是 current 的 student 畫面上叫以前的學員。
--   mentor、mentee 這一屆有還沒結束的配對；speaker 有還沒到的那一場。
-- 不看權限，不開給前端：rc_person、rc_directory 自己守門之後才叫它。
create or replace function public.rc_labels_of(p_person uuid)
returns jsonb language sql stable security definer
set search_path = public, pg_temp
as $$
  with pe as (select p.id, p.kind, p.grad_year, pr.role as acct from public.people p left join public.profiles pr on pr.id = p.profile_id where p.id = p_person),
  cur as (select (select id from public.terms where status = 'current' limit 1) as id, extract(year from now())::int as y),
  part as (select x.role, e.id as event_id, e.starts_at, e.term_id from public.rc_participation x join public.events e on e.id = x.event_id where x.person_id = p_person),
  spk as (select e.id as event_id, e.starts_at from public.event_speakers s join public.events e on e.id = s.event_id where s.person_id = p_person
          union select event_id, starts_at from part where role = 'speaker'),
  prs as (select case when pr.mentor_id = p_person then 'mentor' else 'mentee' end as side, pr.matched_on, pr.ended_on, e.term_id, e.starts_at
            from public.rc_pairs pr left join public.events e on e.id = pr.event_id where pr.mentor_id = p_person or pr.mentee_id = p_person
          union all select role, null::date, null::date, term_id, starts_at from part where role in ('mentor', 'mentee')),
  pos as (select po.term_id, po.team, t.starts_on from public.positions po left join public.terms t on t.id = po.term_id where po.person_id = p_person),
  l as (
    select 1 as ord, 'member' as label, 'earned' as source, (select min(extract(year from starts_on))::int from pos) as since, null::int as until,
           (exists (select 1 from pos, cur where pos.term_id = cur.id) or (select acct = 'cadre' from pe)) as current,
           (select count(distinct term_id)::int from pos) as n,
           coalesce((select string_agg(distinct team, ', ') from pos where coalesce(team, '') <> ''), '') as detail
     where exists (select 1 from pos) or (select kind = 'member' or acct in ('cadre', 'alumni') from pe)
    union all
    select 2, 'intern', 'earned', null, null, true, 0, '' where (select acct = 'intern' from pe)
    union all
    select 3, 'student', 'earned', (select min(extract(year from starts_at))::int from part where role = 'student'), null,
           (select kind = 'student' and (grad_year is null or grad_year >= cur.y) from pe, cur),
           (select count(distinct event_id)::int from part where role = 'student'), ''
     where exists (select 1 from part where role = 'student') or (select kind = 'student' from pe)
    union all
    select 4, 'mentee', 'earned', (select min(coalesce(extract(year from matched_on), extract(year from starts_at)))::int from prs where side = 'mentee'), null,
           exists (select 1 from prs, cur where side = 'mentee' and matched_on is not null and ended_on is null and prs.term_id = cur.id),
           (select count(*)::int from prs where side = 'mentee'), ''
     where exists (select 1 from prs where side = 'mentee')
    union all
    select 5, 'mentor', 'earned', (select min(coalesce(extract(year from matched_on), extract(year from starts_at)))::int from prs where side = 'mentor'), null,
           exists (select 1 from prs, cur where side = 'mentor' and matched_on is not null and ended_on is null and prs.term_id = cur.id),
           (select count(*)::int from prs where side = 'mentor'), ''
     where exists (select 1 from prs where side = 'mentor')
    union all
    select 6, 'speaker', 'earned', (select min(extract(year from starts_at))::int from spk), null,
           exists (select 1 from spk where starts_at >= now()), (select count(distinct event_id)::int from spk), ''
     where exists (select 1 from spk)
    union all
    select 7, 'volunteer', 'earned', (select min(extract(year from starts_at))::int from part where role = 'volunteer'), null, false,
           (select count(distinct event_id)::int from part where role = 'volunteer'), ''
     where exists (select 1 from part where role = 'volunteer')
    union all
    select 8, 'organizer', 'earned', (select min(extract(year from starts_at))::int from part where role = 'organizer'), null, false,
           (select count(distinct event_id)::int from part where role = 'organizer'), ''
     where exists (select 1 from part where role = 'organizer')
    union all
    select 10 + row_number() over (order by g.label)::int, g.label, 'given', g.since_year::int, g.until_year::int,
           (g.until_year is null or g.until_year >= (select y from cur)), 0, g.detail
      from public.rc_labels g where g.person_id = p_person
  )
  select coalesce(jsonb_agg(jsonb_build_object('label', label, 'source', source, 'since', since, 'until', until, 'current', coalesce(current, false), 'n', n, 'detail', detail) order by ord), '[]'::jsonb) from l;
$$;
revoke all on function public.rc_labels_of(uuid) from public, anon, authenticated;

-- 名錄與搜尋用的短版：['speaker', 'student:past', …]
create or replace function public.rc_label_codes(p_person uuid)
returns jsonb language sql stable security definer
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg((l->>'label') || case when (l->>'current')::boolean then '' else ':past' end), '[]'::jsonb)
    from jsonb_array_elements(public.rc_labels_of(p_person)) l;
$$;
revoke all on function public.rc_label_codes(uuid) from public, anon, authenticated;

-- 管紀錄的人加、改、拿掉「給的」標籤。p_on = false 是拿掉。
create or replace function public.rc_label_set(p_person uuid, p_label text, p_on boolean, p_detail text, p_since int, p_until int)
returns boolean language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if not public.rc_can_manage() then raise exception 'not_records_manager' using errcode = 'P0001'; end if;
  if p_label not in ('professor', 'admission_officer', 'connection') then raise exception 'bad_label' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.people where id = p_person and forgotten_at is null) then raise exception 'no_such_person' using errcode = 'P0001'; end if;
  if not coalesce(p_on, false) then
    delete from public.rc_labels where person_id = p_person and label = p_label;
    perform public.rc_log_it('label_remove', p_person, jsonb_build_object('label', p_label), null);
    return false;
  end if;
  if p_since is not null and p_until is not null and p_until < p_since then raise exception 'bad_years' using errcode = 'P0001'; end if;
  insert into public.rc_labels (person_id, label, detail, since_year, until_year, set_by)
  values (p_person, p_label, left(btrim(coalesce(p_detail, '')), 160), p_since, p_until, auth.uid())
  on conflict (person_id, label) do update set detail = excluded.detail, since_year = excluded.since_year, until_year = excluded.until_year, set_by = excluded.set_by, set_at = now();
  perform public.rc_log_it('label_set', p_person, null, jsonb_build_object('label', p_label, 'detail', left(btrim(coalesce(p_detail, '')), 160)));
  return true;
end $$;
revoke all on function public.rc_label_set(uuid, text, boolean, text, int, int) from public, anon;
grant execute on function public.rc_label_set(uuid, text, boolean, text, int, int) to authenticated;

-- ---------- 3. profile：讀成 JSON、管的人存 ----------
-- p_internal = true 多回 BT 這邊的關係紀錄（rel_*）。個人連結那一支一律給 false。不看權限，不開給前端。
create or replace function public.rc_profile_json(p_person uuid, p_internal boolean)
returns jsonb language sql stable security definer
set search_path = public, pg_temp
as $$
  select coalesce((
    select jsonb_build_object('photo_url', pf.photo_url, 'city', pf.city, 'country', pf.country, 'job_title', pf.job_title, 'job_org', pf.job_org, 'field', pf.field,
                              'bio', pf.bio, 'story', pf.story, 'offer_speak', pf.offer_speak, 'offer_mentor', pf.offer_mentor, 'contact_ok', pf.contact_ok,
                              'share_profile', pf.share_profile, 'share_story', pf.share_story, 'consent_at', pf.consent_at, 'done_at', pf.done_at, 'updated_at', pf.updated_at)
           || case when p_internal then jsonb_build_object('rel_owner', pf.rel_owner, 'rel_owner_name', public.rc_person_name(pf.rel_owner),
                                                           'rel_last_contact', pf.rel_last_contact, 'rel_open', pf.rel_open, 'rel_note', pf.rel_note)
                   else '{}'::jsonb end
      from public.rc_profiles pf where pf.person_id = p_person),
    jsonb_build_object('photo_url', null, 'city', '', 'country', '', 'job_title', '', 'job_org', '', 'field', '', 'bio', '', 'story', '{}'::jsonb,
                       'offer_speak', false, 'offer_mentor', false, 'contact_ok', false, 'share_profile', false, 'share_story', false,
                       'consent_at', null, 'done_at', null, 'updated_at', null)
      || case when p_internal then jsonb_build_object('rel_owner', null, 'rel_owner_name', null, 'rel_last_contact', null, 'rel_open', 'unknown', 'rel_note', '') else '{}'::jsonb end);
$$;
revoke all on function public.rc_profile_json(uuid, boolean) from public, anon, authenticated;

-- 管紀錄的人改 profile。p 只改有給的鍵：photo_url、city、country、job_title、job_org、field、bio、
-- offer_speak、offer_mentor、contact_ok、share_profile、share_story（這兩個只能改成 false）、rel_owner、rel_last_contact、rel_open、rel_note。
-- 故事不在這裡：那是他自己的話，只有他自己在個人連結上寫。
create or replace function public.rc_save_profile(p_person uuid, p jsonb)
returns boolean language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_photo text; v_owner uuid; v_open text; k text;
begin
  if not public.rc_can_manage() then raise exception 'not_records_manager' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.people where id = p_person and forgotten_at is null) then raise exception 'no_such_person' using errcode = 'P0001'; end if;
  if coalesce((p->>'share_profile')::boolean, false) or coalesce((p->>'share_story')::boolean, false) then raise exception 'consent_needs_self' using errcode = 'P0001'; end if;
  foreach k in array array['city', 'country'] loop if char_length(btrim(coalesce(p->>k, ''))) > 80 then raise exception 'too_long:%', k using errcode = 'P0001'; end if; end loop;
  foreach k in array array['job_title', 'job_org', 'field'] loop if char_length(btrim(coalesce(p->>k, ''))) > 120 then raise exception 'too_long:%', k using errcode = 'P0001'; end if; end loop;
  if char_length(btrim(coalesce(p->>'bio', ''))) > 600 then raise exception 'too_long:bio' using errcode = 'P0001'; end if;
  if char_length(btrim(coalesce(p->>'rel_note', ''))) > 2000 then raise exception 'too_long:rel_note' using errcode = 'P0001'; end if;
  v_photo := nullif(btrim(coalesce(p->>'photo_url', '')), '');
  if v_photo is not null and v_photo !~ '^https://' then raise exception 'photo_not_https' using errcode = 'P0001'; end if;
  v_open := coalesce(nullif(p->>'rel_open', ''), 'unknown');
  if v_open not in ('unknown', 'open', 'maybe', 'closed') then raise exception 'bad_rel_open' using errcode = 'P0001'; end if;
  if nullif(p->>'rel_owner', '') is not null then
    v_owner := (p->>'rel_owner')::uuid;
    if not exists (select 1 from public.people where id = v_owner and forgotten_at is null) then raise exception 'no_such_person' using errcode = 'P0001'; end if;
  end if;
  insert into public.rc_profiles (person_id) values (p_person) on conflict (person_id) do nothing;
  update public.rc_profiles set
    photo_url        = case when p ? 'photo_url' then v_photo else photo_url end,
    city             = case when p ? 'city' then btrim(coalesce(p->>'city', '')) else city end,
    country          = case when p ? 'country' then btrim(coalesce(p->>'country', '')) else country end,
    job_title        = case when p ? 'job_title' then btrim(coalesce(p->>'job_title', '')) else job_title end,
    job_org          = case when p ? 'job_org' then btrim(coalesce(p->>'job_org', '')) else job_org end,
    field            = case when p ? 'field' then btrim(coalesce(p->>'field', '')) else field end,
    bio              = case when p ? 'bio' then btrim(coalesce(p->>'bio', '')) else bio end,
    offer_speak      = case when p ? 'offer_speak' then coalesce((p->>'offer_speak')::boolean, false) else offer_speak end,
    offer_mentor     = case when p ? 'offer_mentor' then coalesce((p->>'offer_mentor')::boolean, false) else offer_mentor end,
    contact_ok       = case when p ? 'contact_ok' then coalesce((p->>'contact_ok')::boolean, false) else contact_ok end,
    share_profile    = case when p ? 'share_profile' then false else share_profile end,
    share_story      = case when p ? 'share_story' then false else share_story end,
    rel_owner        = case when p ? 'rel_owner' then v_owner else rel_owner end,
    rel_last_contact = case when p ? 'rel_last_contact' then nullif(p->>'rel_last_contact', '')::date else rel_last_contact end,
    rel_open         = case when p ? 'rel_open' then v_open else rel_open end,
    rel_note         = case when p ? 'rel_note' then btrim(coalesce(p->>'rel_note', '')) else rel_note end,
    updated_at       = now()
   where person_id = p_person;
  -- 紀錄只記改了哪幾格，不記內容（關係備註是私下的話）。
  perform public.rc_log_it('profile_edit', p_person, null, jsonb_build_object('keys', (select jsonb_agg(x) from jsonb_object_keys(p) x)));
  return true;
end $$;
revoke all on function public.rc_save_profile(uuid, jsonb) from public, anon;
grant execute on function public.rc_save_profile(uuid, jsonb) to authenticated;

-- ---------- 4. 個人連結 ----------
-- 管紀錄的人開或撤銷。p_action：create（把舊的撤掉、開一條新的，回 token）、revoke。
create or replace function public.rc_profile_link(p_person uuid, p_action text)
returns jsonb language plpgsql security definer
set search_path = public, pg_temp
as $$
declare pe public.people%rowtype; v_token text; v_exp timestamptz;
begin
  if not public.rc_can_manage() then raise exception 'not_records_manager' using errcode = 'P0001'; end if;
  select * into pe from public.people where id = p_person and forgotten_at is null;
  if not found then raise exception 'no_such_person' using errcode = 'P0001'; end if;
  if p_action = 'revoke' then
    update public.rc_profile_links set revoked_at = now() where person_id = p_person and revoked_at is null;
    perform public.rc_log_it('profile_link_revoke', p_person, null, null);
    return jsonb_build_object('token', null);
  elsif p_action = 'create' then
    -- 還在念高中的學員（多半未滿 18 歲）不開：這條路會問他同不同意對外，而未成年一律不對外。畢業年沒填的也擋，先去補畢業年。
    if pe.kind = 'student' and (pe.grad_year is null or pe.grad_year >= extract(year from now())::int) then raise exception 'minor_no_link' using errcode = 'P0001'; end if;
    update public.rc_profile_links set revoked_at = now() where person_id = p_person and revoked_at is null;
    v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
    v_exp := now() + interval '90 days';
    insert into public.rc_profile_links (person_id, token, created_by, expires_at) values (p_person, v_token, auth.uid(), v_exp);
    perform public.rc_log_it('profile_link_create', p_person, null, jsonb_build_object('expires_at', v_exp));
    return jsonb_build_object('token', v_token, 'expires_at', v_exp);
  end if;
  raise exception 'bad_action' using errcode = 'P0001';
end $$;
revoke all on function public.rc_profile_link(uuid, text) from public, anon;
grant execute on function public.rc_profile_link(uuid, text) to authenticated;

-- 連結對不對、還有沒有效。對就回那個人的 id，不對回 null。內部用。
create or replace function public.rc_link_person(p_token text)
returns uuid language sql stable security definer
set search_path = public, pg_temp
as $$
  select l.person_id from public.rc_profile_links l join public.people pe on pe.id = l.person_id
   where l.token = p_token and char_length(coalesce(p_token, '')) >= 32 and l.revoked_at is null and l.expires_at > now() and pe.forgotten_at is null;
$$;
revoke all on function public.rc_link_person(text) from public, anon, authenticated;

-- 不登入：拿連結的人讀自己的那一份。回的東西裡沒有 BT 的關係紀錄、沒有內部備註、沒有別人的任何資料。連結不對回 null。
create or replace function public.rc_public_profile(p_token text)
returns jsonb language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_person uuid := public.rc_link_person(p_token); pe public.people%rowtype;
begin
  if v_person is null then return null; end if;
  select * into pe from public.people where id = v_person;
  update public.rc_profile_links set opened_at = coalesce(opened_at, now()) where token = p_token;
  return jsonb_build_object(
    'person', jsonb_build_object('name_zh', pe.name_zh, 'name_en', pe.name_en, 'school', pe.school),
    'profile', public.rc_profile_json(v_person, false),
    'contacts', coalesce((select jsonb_object_agg(k.kind, k.value) from (
                   select distinct on (i.kind) i.kind, i.value from public.rc_identities i
                    where i.person_id = v_person and i.kind in ('email', 'phone', 'linkedin', 'ig', 'line', 'website')
                    -- 一種只回一個：他自己填的優先（換過 email 就看到新的那個），再來是登入用的，再來是最後加的。
                    order by i.kind, (i.source = 'self') desc, i.verified desc, i.id desc) k), '{}'::jsonb),
    'education', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'kind', o.kind, 'institution', o.institution, 'major', o.major, 'title', o.title, 'year', o.year)
                                            order by o.year nulls last, o.recorded_at)
                             from public.rc_outcomes o where o.person_id = v_person and o.kind in ('enrolled', 'graduated') and o.visibility <> 'private'), '[]'::jsonb),
    'career', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'institution', o.institution, 'title', coalesce(nullif(o.title, ''), o.note), 'year', o.year)
                                         order by o.year desc nulls last, o.recorded_at desc)
                          from public.rc_outcomes o where o.person_id = v_person and o.kind = 'working' and o.visibility <> 'private'), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(jsonb_build_object('title_zh', e.title_zh, 'title_en', e.title_en, 'starts_at', e.starts_at) order by e.starts_at)
                          from public.event_speakers s join public.events e on e.id = s.event_id where s.person_id = v_person and e.status = 'published'), '[]'::jsonb),
    'expires_at', (select expires_at from public.rc_profile_links where token = p_token));
end $$;
revoke all on function public.rc_public_profile(text) from public;
grant execute on function public.rc_public_profile(text) to anon, authenticated;

-- 不登入：拿連結的人存自己的那一份。p 的鍵：adult（一定要 true）、name_zh、name_en、school、
-- profile { city, country, job_title, job_org, field, bio }、story { 六題 }、contacts { email, phone, linkedin, ig, line, website }、
-- education [{ id?, kind, institution, major, title, year }]、career [{ id?, institution, title, year }]、
-- offer_speak、offer_mentor、contact_ok、share_profile、share_story。
-- 照片不在這裡：不登入的人沒有地方上傳檔案（跟回饋表同一條線），照片由 BT 在後台放。
create or replace function public.rc_public_profile_save(p_token text, p jsonb)
returns jsonb language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_person uuid := public.rc_link_person(p_token); lk public.rc_profile_links%rowtype; pf jsonb := coalesce(p->'profile', '{}'::jsonb);
  st jsonb := coalesce(p->'story', '{}'::jsonb); ct jsonb := coalesce(p->'contacts', '{}'::jsonb);
  v_zh text := nullif(btrim(coalesce(p->>'name_zh', '')), ''); v_en text := nullif(btrim(coalesce(p->>'name_en', '')), '');
  v_story jsonb := '{}'::jsonb; k text; v text; it jsonb; v_keep uuid[] := '{}'; v_id uuid; v_year int; v_kind text; v_owner uuid; v_sp boolean; v_ss boolean;
  v_old_sp boolean; v_old_ss boolean;
begin
  if v_person is null then raise exception 'bad_link' using errcode = 'P0001'; end if;
  select * into lk from public.rc_profile_links where token = p_token for update;
  -- 一條連結一小時最多存 40 次（擋灌水，不擋真人）
  if lk.saves_from is null or lk.saves_from < now() - interval '1 hour' then
    update public.rc_profile_links set saves = 1, saves_from = now() where id = lk.id;
  elsif lk.saves >= 40 then raise exception 'too_many' using errcode = 'P0001';
  else update public.rc_profile_links set saves = saves + 1 where id = lk.id;
  end if;
  if not coalesce((p->>'adult')::boolean, false) then raise exception 'adult_only' using errcode = 'P0001'; end if;
  if v_zh is null and v_en is null then raise exception 'need_name' using errcode = 'P0001'; end if;
  if char_length(coalesce(v_zh, '')) > 40 or char_length(coalesce(v_en, '')) > 80 then raise exception 'too_long:name' using errcode = 'P0001'; end if;
  if char_length(btrim(coalesce(p->>'school', ''))) > 120 then raise exception 'too_long:school' using errcode = 'P0001'; end if;
  foreach k in array array['city', 'country'] loop if char_length(btrim(coalesce(pf->>k, ''))) > 80 then raise exception 'too_long:%', k using errcode = 'P0001'; end if; end loop;
  foreach k in array array['job_title', 'job_org', 'field'] loop if char_length(btrim(coalesce(pf->>k, ''))) > 120 then raise exception 'too_long:%', k using errcode = 'P0001'; end if; end loop;
  if char_length(btrim(coalesce(pf->>'bio', ''))) > 600 then raise exception 'too_long:bio' using errcode = 'P0001'; end if;
  foreach k in array array['highschool', 'turning', 'hardest', 'decision', 'wish17', 'first_step'] loop
    v := btrim(coalesce(st->>k, ''));
    if char_length(v) > 3000 then raise exception 'too_long:%', k using errcode = 'P0001'; end if;
    if v <> '' then v_story := v_story || jsonb_build_object(k, v); end if;
  end loop;
  if jsonb_typeof(coalesce(p->'education', '[]'::jsonb)) <> 'array' or jsonb_typeof(coalesce(p->'career', '[]'::jsonb)) <> 'array' then raise exception 'bad_list' using errcode = 'P0001'; end if;
  if jsonb_array_length(coalesce(p->'education', '[]'::jsonb)) > 10 or jsonb_array_length(coalesce(p->'career', '[]'::jsonb)) > 10 then raise exception 'too_many_rows' using errcode = 'P0001'; end if;

  update public.people set name_zh = v_zh, name_en = v_en,
         school = case when p ? 'school' then nullif(btrim(coalesce(p->>'school', '')), '') else school end
   where id = v_person;

  -- 聯絡方式：一種一格。email 空的不動（BT 至少要有一條找得到他的路）；其他空的就是他要拿掉。
  -- 值已經在別人身上：不寫、不告訴他，記一筆給管的人。
  foreach k in array array['email', 'phone', 'linkedin', 'ig', 'line', 'website'] loop
    continue when not (ct ? k);
    begin v := public.rc_contact_norm(k, ct->>k);
    exception when others then
      if k = 'email' then raise exception 'bad_email' using errcode = 'P0001'; end if;
      raise exception 'too_long:%', k using errcode = 'P0001';
    end;
    if v is null then
      if k <> 'email' then delete from public.rc_identities where person_id = v_person and kind = k; end if;
      continue;
    end if;
    select person_id into v_owner from public.rc_identities where kind = k and lower(value) = lower(v);
    if v_owner is not null and v_owner <> v_person then
      perform public.rc_log_it('profile_contact_conflict', v_person, null, jsonb_build_object('kind', k));
      continue;
    end if;
    if k <> 'email' then delete from public.rc_identities where person_id = v_person and kind = k and lower(value) <> lower(v); end if;
    if v_owner is null then
      insert into public.rc_identities (person_id, kind, value, source) values (v_person, k, v, 'self') on conflict do nothing;
      if k = 'email' then update public.people set email = coalesce(email, v) where id = v_person; end if;
    end if;
  end loop;

  -- 學歷（enrolled、graduated）與經歷（working）。帶 id 的改那一列（要是他自己的），沒帶的加一列；這次沒送回來的就是他拿掉的。
  for it in select * from jsonb_array_elements(coalesce(p->'education', '[]'::jsonb)) union all
            select x || jsonb_build_object('kind', 'working') from jsonb_array_elements(coalesce(p->'career', '[]'::jsonb)) x loop
    v := btrim(coalesce(it->>'institution', ''));
    continue when v = '';
    if char_length(v) > 160 or char_length(btrim(coalesce(it->>'major', ''))) > 120 or char_length(btrim(coalesce(it->>'title', ''))) > 120 then raise exception 'too_long:row' using errcode = 'P0001'; end if;
    v_kind := case when it->>'kind' in ('enrolled', 'graduated', 'working') then it->>'kind' else 'graduated' end;
    v_year := case when coalesce(it->>'year', '') ~ '^\d{4}$' and (it->>'year')::int between 1950 and 2100 then (it->>'year')::int end;
    v_id := null;
    if coalesce(it->>'id', '') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      select id into v_id from public.rc_outcomes where id = (it->>'id')::uuid and person_id = v_person and kind in ('enrolled', 'graduated', 'working') and visibility <> 'private';
    end if;
    if v_id is null then
      insert into public.rc_outcomes (person_id, kind, institution, major, title, year, source, visibility)
      values (v_person, v_kind, v, btrim(coalesce(it->>'major', '')), btrim(coalesce(it->>'title', '')), v_year, 'self', 'internal') returning id into v_id;
    else
      update public.rc_outcomes set kind = v_kind, institution = v, major = btrim(coalesce(it->>'major', '')), title = btrim(coalesce(it->>'title', '')), year = v_year where id = v_id;
    end if;
    v_keep := array_append(v_keep, v_id);
  end loop;
  if p ? 'education' then delete from public.rc_outcomes where person_id = v_person and kind in ('enrolled', 'graduated') and visibility <> 'private' and not (id = any (v_keep)); end if;
  if p ? 'career' then delete from public.rc_outcomes where person_id = v_person and kind = 'working' and visibility <> 'private' and not (id = any (v_keep)); end if;

  v_sp := coalesce((p->>'share_profile')::boolean, false); v_ss := coalesce((p->>'share_story')::boolean, false);
  insert into public.rc_profiles (person_id) values (v_person) on conflict (person_id) do nothing;
  select share_profile, share_story into v_old_sp, v_old_ss from public.rc_profiles where person_id = v_person;
  -- profile 與 story 兩段：這次有送那一段才整段換掉（跟學歷、經歷同一個規矩），沒送的那一段不動。
  -- 舉的手與同意每一次都照這次送的算：沒勾就是沒有，同意不會因為少送一個鍵就留著。
  update public.rc_profiles set
    city = case when p ? 'profile' then btrim(coalesce(pf->>'city', '')) else city end,
    country = case when p ? 'profile' then btrim(coalesce(pf->>'country', '')) else country end,
    job_title = case when p ? 'profile' then btrim(coalesce(pf->>'job_title', '')) else job_title end,
    job_org = case when p ? 'profile' then btrim(coalesce(pf->>'job_org', '')) else job_org end,
    field = case when p ? 'profile' then btrim(coalesce(pf->>'field', '')) else field end,
    bio = case when p ? 'profile' then btrim(coalesce(pf->>'bio', '')) else bio end,
    story = case when p ? 'story' then v_story else story end,
    offer_speak = coalesce((p->>'offer_speak')::boolean, false), offer_mentor = coalesce((p->>'offer_mentor')::boolean, false),
    contact_ok = coalesce((p->>'contact_ok')::boolean, false), share_profile = v_sp, share_story = v_ss,
    consent_at = case when v_sp is distinct from v_old_sp or v_ss is distinct from v_old_ss or consent_at is null then now() else consent_at end,
    done_at = now(), updated_at = now()
   where person_id = v_person;
  update public.rc_profile_links set submitted_at = now() where id = lk.id;
  perform public.rc_log_it('profile_self', v_person, null, jsonb_build_object('share_profile', v_sp, 'share_story', v_ss));
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.rc_public_profile_save(text, jsonb) from public;
grant execute on function public.rc_public_profile_save(text, jsonb) to anon, authenticated;

-- ---------- 5. 忘記一個人、合併 ----------
-- forget_person() 與 delete_my_account() 最後都把 people.forgotten_at 填上時間。掛在那一欄上，不用重建那幾支。
create or replace function public.rc_network_forget_trg()
returns trigger language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if new.forgotten_at is not null and old.forgotten_at is null then
    delete from public.rc_profiles where person_id = new.id;
    delete from public.rc_labels where person_id = new.id;
    delete from public.rc_profile_links where person_id = new.id;
    update public.rc_profiles set rel_owner = null where rel_owner = new.id;
  end if;
  return new;
end $$;
revoke all on function public.rc_network_forget_trg() from public, anon, authenticated;
drop trigger if exists rc_network_forget on public.people;
create trigger rc_network_forget after update of forgotten_at on public.people
  for each row execute function public.rc_network_forget_trg();

-- 合併時搬 profile、標籤、連結、講者。留的那個人已經有的不蓋，空的才補。
create or replace function public.rc_move_network(p_keep uuid, p_drop uuid)
returns void language plpgsql security definer
set search_path = public, pg_temp
as $$
declare d public.rc_profiles%rowtype;
begin
  select * into d from public.rc_profiles where person_id = p_drop;
  if found then
    insert into public.rc_profiles (person_id) values (p_keep) on conflict (person_id) do nothing;
    update public.rc_profiles k set
      photo_url = coalesce(k.photo_url, d.photo_url), city = coalesce(nullif(k.city, ''), d.city), country = coalesce(nullif(k.country, ''), d.country),
      job_title = coalesce(nullif(k.job_title, ''), d.job_title), job_org = coalesce(nullif(k.job_org, ''), d.job_org), field = coalesce(nullif(k.field, ''), d.field),
      bio = coalesce(nullif(k.bio, ''), d.bio), story = d.story || k.story,
      offer_speak = k.offer_speak or d.offer_speak, offer_mentor = k.offer_mentor or d.offer_mentor, contact_ok = k.contact_ok or d.contact_ok,
      -- 同意不合併成「有」：兩列都勾了才算，不然留的那個人要自己再勾一次。
      share_profile = k.share_profile and d.share_profile, share_story = k.share_story and d.share_story,
      done_at = coalesce(k.done_at, d.done_at), rel_owner = coalesce(k.rel_owner, d.rel_owner),
      rel_last_contact = greatest(k.rel_last_contact, d.rel_last_contact),
      rel_open = case when k.rel_open = 'unknown' then d.rel_open else k.rel_open end,
      rel_note = case when k.rel_note = '' then d.rel_note when d.rel_note = '' or d.rel_note = k.rel_note then k.rel_note else k.rel_note || ' / ' || d.rel_note end,
      updated_at = now()
     where k.person_id = p_keep;
    delete from public.rc_profiles where person_id = p_drop;
  end if;
  update public.rc_profiles set rel_owner = p_keep where rel_owner = p_drop;
  update public.rc_labels set person_id = p_keep where person_id = p_drop
     and not exists (select 1 from public.rc_labels k where k.person_id = p_keep and k.label = rc_labels.label);
  delete from public.rc_labels where person_id = p_drop;
  -- 連結不搬：那條連結是發給被併那一列的，合併之後撤掉，要的話替留的那個人重開。
  update public.rc_profile_links set revoked_at = now() where person_id = p_drop and revoked_at is null;
  update public.event_speakers set person_id = p_keep where person_id = p_drop;
end $$;
revoke all on function public.rc_move_network(uuid, uuid) from public, anon, authenticated;

-- 搬紀錄（從 2026-12-11 那版來，一字不差，最後多叫一次 rc_move_network）
create or replace function public.rc_move_records(p_keep uuid, p_drop uuid)
returns void language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_keep public.people%rowtype; v_drop public.people%rowtype;
begin
  select * into v_keep from public.people where id = p_keep; if not found then raise exception 'no_such_person' using errcode = 'P0001'; end if;
  select * into v_drop from public.people where id = p_drop; if not found then raise exception 'no_such_person' using errcode = 'P0001'; end if;
  -- identities 全表唯一：留的那個人沒有的搬過去，其餘刪掉
  update public.rc_identities set person_id = p_keep where person_id = p_drop
     and not exists (select 1 from public.rc_identities k where k.person_id = p_keep and k.kind = rc_identities.kind and lower(k.value) = lower(rc_identities.value));
  delete from public.rc_identities where person_id = p_drop;
  update public.rc_schools set person_id = p_keep, source = 'merge' where person_id = p_drop
     and not exists (select 1 from public.rc_schools k where k.person_id = p_keep and lower(trim(k.school)) = lower(trim(rc_schools.school)));
  delete from public.rc_schools where person_id = p_drop;
  update public.rc_participation set person_id = p_keep where person_id = p_drop
     and not exists (select 1 from public.rc_participation k where k.person_id = p_keep and k.event_id = rc_participation.event_id and k.role = rc_participation.role
                        and coalesce(k.session_id, '00000000-0000-0000-0000-000000000000') = coalesce(rc_participation.session_id, '00000000-0000-0000-0000-000000000000'));
  delete from public.rc_participation where person_id = p_drop;
  update public.rc_responses set person_id = p_keep where person_id = p_drop;
  update public.rc_pairs set mentor_id = p_keep where mentor_id = p_drop;
  update public.rc_pairs set mentee_id = p_keep where mentee_id = p_drop;
  update public.rc_outcomes set person_id = p_keep where person_id = p_drop;
  update public.people set name_zh = coalesce(name_zh, v_drop.name_zh), name_en = coalesce(name_en, v_drop.name_en),
         school = coalesce(school, v_drop.school), grad_year = coalesce(grad_year, v_drop.grad_year), email = coalesce(email, v_drop.email),
         kind = case when kind = 'member' or v_drop.kind = 'member' then 'member' else kind end,
         note = case when nullif(trim(coalesce(v_drop.note, '')), '') is null then note
                     when nullif(trim(coalesce(note, '')), '') is null then trim(v_drop.note)
                     when trim(note) = trim(v_drop.note) then note
                     else trim(note) || ' / ' || trim(v_drop.note) end
   where id = p_keep;
  -- 被併那列的學校與名字不丟：學校進學校紀錄，名字不同的當別名（全表唯一，別人已經有同樣的就不寫）
  if nullif(trim(coalesce(v_drop.school, '')), '') is not null then perform public.rc_school_add(p_keep, v_drop.school, 'merge'); end if;
  if nullif(trim(coalesce(v_drop.name_en, '')), '') is not null and lower(trim(v_drop.name_en)) <> lower(trim(coalesce(v_keep.name_en, ''))) then
    insert into public.rc_identities (person_id, kind, value, source) values (p_keep, 'name_en', trim(v_drop.name_en), 'merge') on conflict (kind, lower(value)) do nothing;
  end if;
  if nullif(trim(coalesce(v_drop.name_zh, '')), '') is not null and trim(v_drop.name_zh) <> trim(coalesce(v_keep.name_zh, '')) then
    insert into public.rc_identities (person_id, kind, value, source) values (p_keep, 'name_zh', trim(v_drop.name_zh), 'merge') on conflict (kind, lower(value)) do nothing;
  end if;
  perform public.rc_move_network(p_keep, p_drop);
end $$;
revoke all on function public.rc_move_records(uuid, uuid) from public, anon, authenticated;

-- ---------- 6. 一個人的頁面、名錄、搜尋 ----------
-- 一個人的頁面（從 2026-12-12 那版來）：多 profile（看的人就看得到，含關係紀錄）、labels、given（給的標籤，改用）、
-- link（個人連結的狀態；token 只給管的人）、speaking（他當講者的活動）；去向多 title。
create or replace function public.rc_person(p_person uuid)
returns jsonb language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare pe public.people%rowtype;
begin
  if not public.rc_can_view() then raise exception 'not_records_viewer' using errcode = 'P0001'; end if;
  select * into pe from public.people where id = p_person;
  if not found then raise exception 'no_such_person' using errcode = 'P0001'; end if;
  return jsonb_build_object(
    'profile', public.rc_profile_json(pe.id, true),
    'labels', public.rc_labels_of(pe.id),
    'given', coalesce((select jsonb_agg(jsonb_build_object('label', g.label, 'detail', g.detail, 'since', g.since_year, 'until', g.until_year) order by g.label)
                         from public.rc_labels g where g.person_id = pe.id), '[]'::jsonb),
    'link', (select jsonb_build_object('token', case when public.rc_can_manage() then l.token end, 'created_at', l.created_at, 'expires_at', l.expires_at,
                                       'expired', l.expires_at <= now(), 'opened_at', l.opened_at, 'submitted_at', l.submitted_at)
               from public.rc_profile_links l where l.person_id = pe.id and l.revoked_at is null),
    'speaking', coalesce((select jsonb_agg(jsonb_build_object('event_id', e.id, 'slug', e.slug, 'event', coalesce(nullif(e.title_zh, ''), e.title_en), 'starts_at', e.starts_at,
                                 'subject', s.subject, 'consent', s.consent) order by e.starts_at desc nulls last)
                            from public.event_speakers s join public.events e on e.id = s.event_id where s.person_id = pe.id), '[]'::jsonb),
    'person', jsonb_build_object('id', pe.id, 'name', public.rc_person_name(pe.id), 'name_zh', pe.name_zh, 'name_en', pe.name_en, 'kind', pe.kind, 'school', pe.school,
                                 'grad_year', pe.grad_year, 'note', pe.note, 'has_account', pe.profile_id is not null, 'forgotten_at', pe.forgotten_at,
                                 'role', (select role from public.profiles where id = pe.profile_id),
                                 'login_email', case when public.rc_can_manage() then (select lower(u.email) from auth.users u where u.id = pe.profile_id) end),
    'schools', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'school', s.school, 'year_from', s.year_from, 'year_to', s.year_to, 'source', s.source, 'note', s.note,
                                 'current', lower(trim(s.school)) = lower(trim(coalesce(pe.school, ''))))
                                 order by s.year_from nulls last, s.recorded_at) from public.rc_schools s where s.person_id = pe.id), '[]'::jsonb),
    'aliases', coalesce((select jsonb_agg(i.value order by i.kind, i.value) from public.rc_identities i where i.person_id = pe.id and i.kind in ('name_en', 'name_zh')
                           and lower(i.value) not in (lower(coalesce(pe.name_en, '')), lower(coalesce(pe.name_zh, '')))), '[]'::jsonb),
    'identities', case when public.rc_can_manage() then coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'kind', i.kind, 'value', i.value, 'source', i.source, 'verified', i.verified) order by i.kind, i.value) from public.rc_identities i where i.person_id = pe.id), '[]'::jsonb) else '[]'::jsonb end,
    'positions', coalesce((select jsonb_agg(jsonb_build_object('term', po.term_id, 'title_zh', po.title_zh, 'title_en', po.title_en, 'team', po.team) order by po.term_id desc) from public.positions po where po.person_id = pe.id), '[]'::jsonb),
    'participation', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'event_id', e.id, 'event', coalesce(nullif(e.title_zh, ''), e.title_en), 'kind', e.kind, 'term_id', e.term_id, 'starts_at', e.starts_at, 'role', x.role, 'status', x.status)
                                  order by e.starts_at desc nulls last) from public.rc_participation x join public.events e on e.id = x.event_id where x.person_id = pe.id), '[]'::jsonb),
    'pairs', coalesce((select jsonb_agg(jsonb_build_object('id', pr.id, 'event_id', pr.event_id, 'event', (select coalesce(nullif(e.title_zh, ''), e.title_en) from public.events e where e.id = pr.event_id),
                                 'as', case when pr.mentor_id = pe.id then 'mentor' else 'mentee' end,
                                 'with', public.rc_person_name(case when pr.mentor_id = pe.id then pr.mentee_id else pr.mentor_id end),
                                 'with_id', case when pr.mentor_id = pe.id then pr.mentee_id else pr.mentor_id end,
                                 'matched_on', pr.matched_on, 'ended_on', pr.ended_on, 'end_reason', pr.end_reason) order by pr.matched_on desc nulls last)
                         from public.rc_pairs pr where pr.mentor_id = pe.id or pr.mentee_id = pe.id), '[]'::jsonb),
    'outcomes', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'kind', o.kind, 'institution', o.institution, 'country', o.country, 'major', o.major, 'year', o.year, 'note', o.note, 'title', o.title,
                                 'source', o.source, 'visibility', o.visibility, 'recorded_at', o.recorded_at) order by o.year desc nulls last, o.recorded_at desc)
                           from public.rc_outcomes o where o.person_id = pe.id and (o.visibility <> 'private' or public.rc_can_manage())), '[]'::jsonb),
    'responses', coalesce((select jsonb_agg(jsonb_build_object('form_id', f.id, 'title', f.title, 'kind', f.kind, 'submitted_at', r.submitted_at,
                                 'answers', (select jsonb_agg(jsonb_build_object('key', q.key, 'label', q.label, 'value', a.value) order by q.ord) from public.rc_answers a join public.rc_questions q on q.id = a.question_id where a.response_id = r.id))
                                 order by r.submitted_at desc)
                            from public.rc_responses r join public.rc_forms f on f.id = r.form_id where r.person_id = pe.id and not f.anonymous and public.rc_form_reader(f.id)), '[]'::jsonb));
end $$;

-- 名錄（從 2026-12-10 那版來）：多 labels 與講者卡、篩選要的幾格。
create or replace function public.rc_directory()
returns jsonb language sql stable security definer
set search_path = public, pg_temp
as $$
  select case when public.rc_can_view() then coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', pe.id,
             'name', public.rc_person_name(pe.id),
             'name_zh', coalesce(pr.name_zh, pe.name_zh),
             'name_en', coalesce(pr.name_en, pe.name_en),
             'kind', pe.kind,
             'labels', public.rc_label_codes(pe.id),
             'field', coalesce(pf.field, ''), 'job_title', coalesce(pf.job_title, ''), 'job_org', coalesce(pf.job_org, ''),
             'city', coalesce(pf.city, ''), 'country_now', coalesce(pf.country, ''), 'photo_url', pf.photo_url,
             'offer_speak', coalesce(pf.offer_speak, false), 'offer_mentor', coalesce(pf.offer_mentor, false),
             'profile_done', pf.done_at is not null, 'rel_open', coalesce(pf.rel_open, 'unknown'),
             'role', pr.role,
             'team', pr.team,
             'school', pe.school,
             'grad_year', pe.grad_year,
             'schools', coalesce((select jsonb_agg(distinct s.school) from public.rc_schools s where s.person_id = pe.id), '[]'::jsonb),
             'aliases', coalesce((select jsonb_agg(distinct i.value) from public.rc_identities i where i.person_id = pe.id and i.kind in ('name_en', 'name_zh')
                           and lower(i.value) not in (lower(coalesce(pr.name_en, pe.name_en, '')), lower(coalesce(pr.name_zh, pe.name_zh, '')))), '[]'::jsonb),
             'has_account', pe.profile_id is not null,
             'terms', coalesce((select jsonb_agg(distinct t) from (
                        select e.term_id as t from public.rc_participation x join public.events e on e.id = x.event_id where x.person_id = pe.id and e.term_id is not null
                        union select po.term_id from public.positions po where po.person_id = pe.id) z), '[]'::jsonb),
             'events', coalesce((select jsonb_agg(distinct x.event_id) from public.rc_participation x where x.person_id = pe.id), '[]'::jsonb),
             'roles', coalesce((select jsonb_agg(distinct x.role) from public.rc_participation x where x.person_id = pe.id), '[]'::jsonb),
             'countries', coalesce((select jsonb_agg(distinct o.country) from public.rc_outcomes o where o.person_id = pe.id and o.country <> '' and (o.visibility <> 'private' or public.rc_can_manage())), '[]'::jsonb),
             'latest', (select o.institution from public.rc_outcomes o where o.person_id = pe.id and (o.visibility <> 'private' or public.rc_can_manage()) order by o.year desc nulls last, o.recorded_at desc limit 1),
             'n', (select count(*) from public.rc_participation x where x.person_id = pe.id)
           ) order by public.rc_person_name(pe.id))
      from public.people pe left join public.profiles pr on pr.id = pe.profile_id left join public.rc_profiles pf on pf.person_id = pe.id
     where pe.forgotten_at is null), '[]'::jsonb) else '[]'::jsonb end;
$$;

-- 找人（從 2026-12-01 那版來）：多 labels 與講者卡要的幾格（活動編輯頁挑講者時直接帶進去，不用再打一次）。
create or replace function public.rc_find_people(p_q text)
returns jsonb language sql stable security definer
set search_path = public, pg_temp
as $$
  select case when public.rc_can_view() then coalesce((
    select jsonb_agg(jsonb_build_object('id', pe.id, 'name', public.rc_person_name(pe.id), 'kind', pe.kind, 'school', pe.school, 'grad_year', pe.grad_year, 'has_account', pe.profile_id is not null,
             'labels', public.rc_label_codes(pe.id),
             'card', (select jsonb_build_object('field', pf.field, 'job_title', pf.job_title, 'job_org', pf.job_org, 'photo_url', pf.photo_url) from public.rc_profiles pf where pf.person_id = pe.id),
             'latest', (select o.institution from public.rc_outcomes o where o.person_id = pe.id and o.visibility <> 'private' order by o.year desc nulls last, o.recorded_at desc limit 1)) order by public.rc_person_name(pe.id))
      from (select * from public.people pe
             where pe.forgotten_at is null and (
               trim(coalesce(p_q, '')) = ''
               or pe.name_zh ilike '%' || trim(p_q) || '%' or pe.name_en ilike '%' || trim(p_q) || '%'
               or (public.rc_can_manage() and exists (select 1 from public.rc_identities i where i.person_id = pe.id and i.value ilike '%' || trim(p_q) || '%')))
             order by pe.created_at desc limit 50) pe), '[]'::jsonb) else '[]'::jsonb end;
$$;

-- ---------- 7. Storage：bucket people ----------
do $$
begin
  if to_regclass('storage.buckets') is null or to_regclass('storage.objects') is null then
    raise notice 'storage schema 不在（本機 smoke），略過 bucket 與政策';
    return;
  end if;
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('people', 'people', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
  on conflict (id) do update set public = true, file_size_limit = 5242880, allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];
  execute 'drop policy if exists people_read on storage.objects';
  execute 'create policy people_read on storage.objects for select to public using (bucket_id = ''people'')';
  execute 'drop policy if exists people_insert on storage.objects';
  execute 'create policy people_insert on storage.objects for insert to authenticated with check (bucket_id = ''people'' and public.rc_can_manage())';
  execute 'drop policy if exists people_update on storage.objects';
  execute 'create policy people_update on storage.objects for update to authenticated using (bucket_id = ''people'' and public.rc_can_manage())';
  execute 'drop policy if exists people_delete on storage.objects';
  execute 'create policy people_delete on storage.objects for delete to authenticated using (bucket_id = ''people'' and public.rc_can_manage())';
end $$;

commit;

-- ---------- 驗收 ----------
select * from (
  with fn as (select proname, oid, regexp_replace(prosrc, '--[^\n]*', '', 'g') as body from pg_proc where pronamespace = 'public'::regnamespace),
  t as (
    select
      (select count(*) from information_schema.tables where table_schema = 'public' and table_name in ('rc_profiles', 'rc_labels', 'rc_profile_links')) = 3 as tables_ok,
      (select bool_and(not has_table_privilege(r, c, 'select') and not has_table_privilege(r, c, 'insert') and not has_table_privilege(r, c, 'update') and not has_table_privilege(r, c, 'delete'))
         from unnest(array['anon', 'authenticated']) r, unnest(array['public.rc_profiles', 'public.rc_labels', 'public.rc_profile_links']) c) as private_ok,
      (select count(*) from pg_policies where schemaname = 'public' and tablename in ('rc_profiles', 'rc_labels', 'rc_profile_links')) = 0
        and (select bool_and(relrowsecurity) from pg_class where oid in ('public.rc_profiles'::regclass, 'public.rc_labels'::regclass, 'public.rc_profile_links'::regclass)) as rls_ok,
      (select array_agg(proname::text order by proname) from fn where proname in ('rc_labels_of', 'rc_label_codes', 'rc_label_set', 'rc_profile_json', 'rc_save_profile', 'rc_profile_link',
         'rc_link_person', 'rc_public_profile', 'rc_public_profile_save', 'rc_network_forget_trg', 'rc_move_network', 'rc_move_records', 'rc_person', 'rc_directory', 'rc_find_people')
         and has_function_privilege('anon', oid, 'execute')) as anon_fns,
      (select bool_and(not has_function_privilege('authenticated', oid, 'execute')) from fn where proname in ('rc_labels_of', 'rc_label_codes', 'rc_profile_json', 'rc_link_person', 'rc_move_network', 'rc_move_records', 'rc_network_forget_trg')) as internal_ok,
      (select bool_and(body like '%rc_can_manage()%') from fn where proname in ('rc_label_set', 'rc_save_profile', 'rc_profile_link')) as manage_gate,
      (select body like '%consent_needs_self%' from fn where proname = 'rc_save_profile') as consent_gate,
      (select body like '%minor_no_link%' from fn where proname = 'rc_profile_link') as minor_gate,
      (select body like '%rc_link_person(p_token)%' and body like '%adult_only%' and body like '%too_many%' and body like '%bad_link%' from fn where proname = 'rc_public_profile_save') as save_gates,
      (select body like '%rc_link_person(p_token)%' and body like '%rc_profile_json(v_person, false)%' and body not like '%rel\_%' and body not like '%pe.note%' and body not like '%pe.email%'
         from fn where proname = 'rc_public_profile') as read_clean,
      (select body like '%revoked_at is null%' and body like '%expires_at > now()%' and body like '%forgotten_at is null%' from fn where proname = 'rc_link_person') as link_gate,
      (select body like '%rc_move_network(p_keep, p_drop)%' from fn where proname = 'rc_move_records') as merge_ok,
      (select count(*) from pg_trigger where tgname = 'rc_network_forget' and not tgisinternal) = 1 as forget_ok,
      (select body like '%rc_can_view()%' and body like '%rc_labels_of(pe.id)%' and body like '%rc_profile_json(pe.id, true)%' and body like '%case when public.rc_can_manage() then l.token end%'
         from fn where proname = 'rc_person') as person_ok,
      (select body like '%rc_can_view()%' and body like '%rc_label_codes(pe.id)%' from fn where proname = 'rc_directory')
        and (select body like '%rc_can_view()%' and body like '%rc_label_codes(pe.id)%' from fn where proname = 'rc_find_people') as lists_ok,
      (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'rc_outcomes' and column_name = 'title') = 1 as title_ok,
      (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'people' and column_name = 'kind') = 1 as kind_kept,
      to_regclass('storage.buckets') is not null as has_storage
  ),
  s as (select case when not (select has_storage from t) then null else (select count(*) from pg_policies where schemaname = 'storage' and policyname in ('people_insert', 'people_update', 'people_delete') and (qual like '%rc_can_manage%' or with_check like '%rc_can_manage%')) = 3 end as bucket_ok)
  select 0 ord, 'OVERALL' as 項目, null::text as 應該是, null::text as 實際是,
    case when tables_ok and private_ok and rls_ok and anon_fns = array['rc_public_profile', 'rc_public_profile_save'] and internal_ok and manage_gate and consent_gate and minor_gate
              and save_gates and read_clean and link_gate and merge_ok and forget_ok and person_ok and lists_ok and title_ok and kind_kept and coalesce(bucket_ok, true)
         then 'PASS' else 'FAIL' end as 結果 from t, s
  union all select 1, '三張新表都在', 'true', tables_ok::text, case when tables_ok then 'PASS' else 'FAIL' end from t
  union all select 2, '★ 三張新表前端讀寫都不行（anon 與登入的人）', 'true', private_ok::text, case when private_ok then 'PASS' else 'FAIL' end from t
  union all select 3, '三張新表開了 RLS、沒有任何政策', 'true', rls_ok::text, case when rls_ok then 'PASS' else 'FAIL' end from t
  union all select 4, '★ 這一支的函式裡，沒登入叫得到的只有兩支', '{rc_public_profile,rc_public_profile_save}', coalesce(anon_fns::text, '{}'), case when anon_fns = array['rc_public_profile', 'rc_public_profile_save'] then 'PASS' else 'FAIL' end from t
  union all select 5, '內部函式前端叫不到（算標籤、讀 profile、對連結、搬紀錄）', 'true', internal_ok::text, case when internal_ok then 'PASS' else 'FAIL' end from t
  union all select 6, '★ 給標籤、改 profile、開連結：只有管紀錄的人', 'true', manage_gate::text, case when manage_gate then 'PASS' else 'FAIL' end from t
  union all select 7, '★ 兩個同意只有本人勾得了，管的人只能取消', 'true', consent_gate::text, case when consent_gate then 'PASS' else 'FAIL' end from t
  union all select 8, '★ 還在念高中的學員開不了個人連結', 'true', minor_gate::text, case when minor_gate then 'PASS' else 'FAIL' end from t
  union all select 9, '★ 存的門：連結要對、要滿 18、一小時 40 次', 'true', save_gates::text, case when save_gates then 'PASS' else 'FAIL' end from t
  union all select 10, '★ 個人連結讀不到關係紀錄、內部備註、名單上的 email 欄', 'true', read_clean::text, case when read_clean then 'PASS' else 'FAIL' end from t
  union all select 11, '★ 連結撤銷、過期、那個人被忘記之後就失效', 'true', link_gate::text, case when link_gate then 'PASS' else 'FAIL' end from t
  union all select 12, '合併兩個人時 profile、標籤、講者一起搬', 'true', merge_ok::text, case when merge_ok then 'PASS' else 'FAIL' end from t
  union all select 13, '★ 忘記一個人時 profile、標籤、連結跟著清', 'true', forget_ok::text, case when forget_ok then 'PASS' else 'FAIL' end from t
  union all select 14, '一個人的頁面：先問看不看得到；token 只給管的人', 'true', person_ok::text, case when person_ok then 'PASS' else 'FAIL' end from t
  union all select 15, '名錄與搜尋帶標籤，照舊先問看不看得到', 'true', lists_ok::text, case when lists_ok then 'PASS' else 'FAIL' end from t
  union all select 16, '去向多一欄 title', 'true', title_ok::text, case when title_ok then 'PASS' else 'FAIL' end from t
  union all select 17, 'people.kind 還在（幹部名單與去向的門靠它）', 'true', kind_kept::text, case when kind_kept then 'PASS' else 'FAIL' end from t
  union all select 18, 'Storage bucket people：上傳與刪除只給管紀錄的人', 'true', coalesce(bucket_ok::text, '沒有 storage schema'), case when bucket_ok is null then 'SKIP' when bucket_ok then 'PASS' else 'FAIL' end from s
) x order by ord;
