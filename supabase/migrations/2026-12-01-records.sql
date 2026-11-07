-- BT Records：人、活動、出席、回饋、導生配對、去向，收成一個資料集　2026-12-01
--
-- 用法：整份貼進 Supabase SQL Editor 按一次 Run。可以重跑，不會動既有資料。最後印一張 PASS / FAIL 表。
-- **要先跑過 2026-11-30-team-forms-no-import.sql**（順序照日期；這一支用到 2026-10-24 的 people / terms / workspaces /
-- assignments / can_view() / can_edit() / is_senior()、2026-11-01 的 events、2026-11-07 的 roster()、2026-11-29 的 tf_match() 與 my_access()）。
-- ⚠ 這一支**重新定義了 roster()**（多一個條件：只列成員，不列學員）與 **my_access()**（多一格 records）。
--   之後重跑 2026-11-07 或 2026-11-29，記得再跑一次這一支。
--
-- Paul 2026-11-06：「I want to build a data set that specifically for those especially for alumni, people, and also events feedback
-- and also ... is there a way to systematically improve our work through tracking old data」，2026-11-07：「build the thing first」。
-- 完整計畫在 ~/Anson/outputs/beyond-taiwan/general/docs/2026-11-06-bt-data-set-plan/（Artifact 給 Co-President 看的那一份）。
--
-- ============================================================================
-- 這一支在做什麼（照計畫第 2 節的資料模型）
-- ============================================================================
--   1. 人是脊椎：people 多三欄（kind：member 成員 / student 學員 / guest 講者等；school；grad_year），
--      另一張 rc_identities 記一個人出現過的每一種寫法（email、中文名、英文名、LINE 名、表單上打的名字），
--      舊表單對人就靠它。**roster() 只列 kind = member**，學員不會跑進幹部名單。
--   2. 活動多兩欄（kind：bootcamp / workshop / roundtable / meetup / clinic / info-session / mentorship-term / other，term_id）
--      與一張 rc_sessions（一場活動的第一天、第二天）。
--   3. rc_participation：誰、哪一場、什麼身分（student / mentee / mentor / speaker / organizer / volunteer / alumni）、
--      報名了還是到了。網站上報名的，rc_sync_event() 從 applications（含簽到）抄過來，不用重打。
--   4. 回饋五張表（rc_forms / rc_questions / rc_audience / rc_responses / rc_answers），形狀照內部表單（tf_），兩個差別：
--      (a) 題目多一個 key（recommend / useful / clarity / best / change…），同一個 key 跨年可以比；
--      (b) 填的人是外面的學生，**不登入**，用表單的 token 連結填（rc_public_form / rc_public_submit 開給 anon）。
--      tf_questions 也多一欄 key，季回饋的固定題目一樣能跨季比。
--   5. rc_pairs：導生配對（mentor、mentee、哪一個學期的活動、怎麼結束）。配對的期中／期末回饋就是 kind = pair-mentor / pair-mentee 的回饋表。
--   6. rc_outcomes：一個人後來去了哪（錄取、就讀、畢業、工作），一人多筆，自己填或 Mentorship 填。
--   7. rc_reviews：每一場活動檢討後那一句「下一次我們改什麼」，整套東西有沒有用就看這一張表。
--   8. forget_person()：一個人要求被移除，一支函式清乾淨，留一個沒有名字的空殼讓人數不變。
--
-- ============================================================================
-- 誰看得到什麼（計畫第 6c 節）
-- ============================================================================
--   管（rc_can_manage）：Co-President，或被派進工作區 custom:records 的人（任何等級）。能建表單、改人、合併、填去向、寫檢討。
--   看（rc_can_view）：管的人，加 Senior Adviser。看得到每一場的記分卡與人的時間軸。
--   一場活動的記分卡（四個數字）：看的人，加那場活動工作區裡的人（can_view）。
--   回饋的原始答案（留言）：管的人、那一份的編輯／讀者名單、那場活動工作區裡「改」以上的人；
--     **配對回饋（pair-*）例外：只有管的人與那一份的讀者名單**，Senior Adviser 與活動工作區都不算，
--     因為裡面是未成年學員對一位 mentor 講的話（計畫 6c）。mentor 永遠不在讀者名單上，rc_set_audience 擋。
--   去向：本人（people.profile_id = 自己）、看的人。公開頁從來不直接讀這張表。
--   五張回饋表、出席、配對、去向、檢討、身分對照：對登入的人**沒有任何直接權限**，讀寫全走 rc_ 函式。
-- ============================================================================

begin;

-- ---------- 1. 工作區 custom:records ----------
do $$
declare v_owner uuid;
begin
  select id into v_owner from public.profiles where role = 'cadre' and board_role = 'president' order by updated_at limit 1;
  insert into public.workspaces (id, kind, team, title_zh, title_en, owner)
  values ('custom:records', 'custom', null, 'BT Records（紀錄）', 'BT Records', v_owner)
  on conflict (id) do nothing;
end $$;

-- ---------- 2. 人：people 多三欄、身分對照表 ----------
alter table public.people add column if not exists kind      text not null default 'member' check (kind in ('member', 'student', 'guest'));
alter table public.people add column if not exists school    text;
alter table public.people add column if not exists grad_year smallint check (grad_year is null or grad_year between 2000 and 2100);
alter table public.people add column if not exists forgotten_at timestamptz;
comment on column public.people.kind is
  'member 幹部或校友（原本的名單）、student 學員或申請者、guest 講者或來賓。roster() 只列 member。';
comment on column public.people.forgotten_at is '本人要求移除的時間（forget_person）。名字、email、身分、答案都清掉，列留著讓人數不變。';

create table if not exists public.rc_identities (
  id         bigserial primary key,
  person_id  uuid not null references public.people(id) on delete cascade,
  kind       text not null check (kind in ('email', 'name_zh', 'name_en', 'line', 'ig', 'typed')),
  value      text not null check (value <> ''),
  source     text not null default '',
  verified   boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index if not exists rc_identities_one on public.rc_identities (kind, lower(value));
create index if not exists rc_identities_person on public.rc_identities (person_id);
comment on table public.rc_identities is
  '一個人出現過的每一種寫法。email 一個只能屬於一個人（自動對人靠它）；名字可能撞，只提示不自動合併。
   verified：這個 email 真的用來登入過。source：哪一份表單或名單帶進來的。';

-- ---------- 3. 活動：多兩欄、場次 ----------
alter table public.events add column if not exists kind text not null default 'other'
  check (kind in ('bootcamp', 'workshop', 'roundtable', 'meetup', 'clinic', 'info-session', 'mentorship-term', 'fair', 'other'));
alter table public.events add column if not exists term_id text references public.terms(id);
alter table public.events add column if not exists source text not null default 'site' check (source in ('site', 'import'));
comment on column public.events.kind is '年度比較照這一欄分組。mentorship-term：一個導生學期本身就是一場活動，配對與配對回饋掛在它底下。';

create table if not exists public.rc_sessions (
  id        uuid primary key default gen_random_uuid(),
  event_id  uuid not null references public.events(id) on delete cascade,
  ord       smallint not null default 1,
  title     text not null default '',
  starts_at timestamptz,
  ends_at   timestamptz
);
create index if not exists rc_sessions_event on public.rc_sessions (event_id, ord);

-- ---------- 4. 出席 ----------
create table if not exists public.rc_participation (
  id          uuid primary key default gen_random_uuid(),
  person_id   uuid not null references public.people(id) on delete cascade,
  event_id    uuid not null references public.events(id) on delete cascade,
  session_id  uuid references public.rc_sessions(id) on delete set null,
  role        text not null default 'student' check (role in ('student', 'mentee', 'mentor', 'speaker', 'organizer', 'volunteer', 'alumni')),
  status      text not null default 'registered' check (status in ('registered', 'attended', 'no-show', 'cancelled')),
  source      text not null default 'manual' check (source in ('site', 'sheet', 'import', 'manual')),
  application_id uuid references public.applications(id) on delete set null,
  note        text not null default '',
  recorded_by uuid references public.profiles(id) on delete set null,
  recorded_at timestamptz not null default now()
);
create unique index if not exists rc_participation_one on public.rc_participation (person_id, event_id, role, (coalesce(session_id, '00000000-0000-0000-0000-000000000000'::uuid)));
create index if not exists rc_participation_event on public.rc_participation (event_id);
comment on table public.rc_participation is
  '誰以什麼身分在哪一場。網站報名的由 rc_sync_event() 從 applications 抄來（application_id 指回去，簽到過就是 attended）。
   舊活動與沒走網站的人直接寫（source sheet / import / manual）。記分卡的出席率 = attended / (registered + attended + no-show)。';

-- ---------- 5. 回饋五張表 ----------
create table if not exists public.rc_forms (
  id         uuid primary key default gen_random_uuid(),
  title      text not null check (title <> ''),
  intro      text not null default '',
  kind       text not null default 'post-event' check (kind in ('post-event', 'alumni-yearly', 'pair-mentor', 'pair-mentee', 'other')),
  event_id   uuid references public.events(id) on delete set null,
  term_id    text references public.terms(id),
  lang       text not null default 'zh' check (lang in ('zh', 'en')),
  status     text not null default 'draft' check (status in ('draft', 'open', 'closed')),
  closes_at  timestamptz,
  anonymous  boolean not null default true,
  token      text not null unique default substr(md5(random()::text || clock_timestamp()::text), 1, 24),
  source     text not null default 'site' check (source in ('site', 'import')),
  owner      uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.rc_forms is
  '對外的回饋表。token 是不登入就能填的連結（/feedback/?t=token）。anonymous 預設 true：答案不掛人，
   除非填的人自己留 email（contact_ok）。有人填過之後不能從匿名改回具名（anonymous_locked，跟 tf_ 一樣）。
   kind 決定誰讀得到：pair-* 只有管的人與讀者名單。';

create table if not exists public.rc_questions (
  id        uuid primary key default gen_random_uuid(),
  form_id   uuid not null references public.rc_forms(id) on delete cascade,
  ord       smallint not null,
  key       text check (key is null or key ~ '^[a-z][a-z0-9_]{0,29}$'),
  label     text not null check (label <> ''),
  help      text not null default '',
  type      text not null check (type in ('short', 'long', 'single', 'multi', 'scale')),
  required  boolean not null default false,
  options   text[] not null default '{}',
  scale_min smallint not null default 1,
  scale_max smallint not null default 5,
  min_label text not null default '',
  max_label text not null default ''
);
create index if not exists rc_questions_form on public.rc_questions (form_id, ord);
create unique index if not exists rc_questions_key on public.rc_questions (form_id, key) where key is not null;
comment on column public.rc_questions.key is
  '固定題目的代號（recommend、useful、clarity、best、change、first_time、meetings、comfortable…）。
   同一個 key 在 2025 與 2027 的表單上就是同一題，年度比較靠它；沒有 key 的題目只屬於那一份。';
alter table public.tf_questions add column if not exists key text check (key is null or key ~ '^[a-z][a-z0-9_]{0,29}$');
create unique index if not exists tf_questions_key on public.tf_questions (form_id, key) where key is not null;

create table if not exists public.rc_audience (
  form_id uuid not null references public.rc_forms(id) on delete cascade,
  role    text not null check (role in ('reader', 'editor')),
  kind    text not null check (kind in ('rank', 'team', 'person')),
  value   text not null default '',
  primary key (form_id, role, kind, value)
);

create table if not exists public.rc_responses (
  id            uuid primary key default gen_random_uuid(),
  form_id       uuid not null references public.rc_forms(id) on delete cascade,
  person_id     uuid references public.people(id) on delete set null,
  participation_id uuid references public.rc_participation(id) on delete set null,
  age_band      text not null default 'unknown' check (age_band in ('under18', '18plus', 'unknown')),
  contact_ok    boolean not null default false,
  typed_name    text not null default '',
  source        text not null default 'site' check (source in ('site', 'import')),
  submitted_at  timestamptz not null default now()
);
create index if not exists rc_responses_form on public.rc_responses (form_id);
create index if not exists rc_responses_person on public.rc_responses (person_id);
comment on column public.rc_responses.age_band is '只問「18 歲以下嗎」，不問生日（計畫 6b）。';

create table if not exists public.rc_answers (
  response_id uuid not null references public.rc_responses(id) on delete cascade,
  question_id uuid not null references public.rc_questions(id) on delete cascade,
  value       text not null default '',
  primary key (response_id, question_id)
);

-- ---------- 6. 配對、去向、檢討、紀錄 ----------
create table if not exists public.rc_pairs (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references public.events(id) on delete cascade,
  mentor_id  uuid references public.people(id) on delete set null,
  mentee_id  uuid references public.people(id) on delete set null,
  matched_on date,
  ended_on   date,
  end_reason text not null default '' check (end_reason in ('', 'completed', 'mentor_left', 'mentee_left', 'rematched', 'other')),
  note       text not null default '',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index if not exists rc_pairs_one on public.rc_pairs (event_id, mentor_id, mentee_id) where mentor_id is not null and mentee_id is not null;
create index if not exists rc_pairs_event on public.rc_pairs (event_id);
comment on table public.rc_pairs is '導生配對。event_id 是那個學期（events.kind = mentorship-term）。mentor_id / mentee_id 可以是 null：forget_person 清掉之後留空殼。';

create table if not exists public.rc_outcomes (
  id          uuid primary key default gen_random_uuid(),
  person_id   uuid not null references public.people(id) on delete cascade,
  kind        text not null check (kind in ('applied', 'admitted', 'enrolled', 'transferred', 'graduated', 'working', 'gap', 'other')),
  institution text not null default '',
  country     text not null default '',
  major       text not null default '',
  year        smallint check (year is null or year between 2000 and 2100),
  note        text not null default '',
  source      text not null default 'self' check (source in ('self', 'mentorship', 'public', 'import')),
  visibility  text not null default 'internal' check (visibility in ('private', 'internal', 'aggregate', 'public')),
  recorded_by uuid references public.profiles(id) on delete set null,
  recorded_at timestamptz not null default now()
);
create index if not exists rc_outcomes_person on public.rc_outcomes (person_id, year desc);
comment on column public.rc_outcomes.visibility is
  'private 只有本人；internal 看的人；aggregate 可以算進對外的總數（五人以上）；public 可以連名字一起用（本人勾的）。';

create table if not exists public.rc_reviews (
  event_id        uuid primary key references public.events(id) on delete cascade,
  reviewed_on     date not null default current_date,
  attendance_rate numeric(5, 2),
  recommend_avg   numeric(4, 2),
  useful_avg      numeric(4, 2),
  responses       int not null default 0,
  went_well       text not null default '',
  we_change       text not null default '',
  change_happened boolean,
  owner_id        uuid references public.profiles(id) on delete set null,
  follow_up_event uuid references public.events(id) on delete set null,
  updated_by      uuid references public.profiles(id) on delete set null,
  updated_at      timestamptz not null default now()
);
comment on table public.rc_reviews is
  '每一場檢討完那一句「下一次我們改什麼」（we_change）。四個數字是檢討當天的快照。
   change_happened 在下一場同類活動的檢討時回頭填：上次說要改的，改了沒。';

create table if not exists public.rc_log (
  id     bigserial primary key,
  what   text not null,
  ref    uuid,
  who    uuid,
  at     timestamptz not null default now(),
  before jsonb,
  after  jsonb
);
create index if not exists rc_log_ref on public.rc_log (ref, at desc);

-- ---------- 7. 鎖起來：RLS 開著、一條政策都沒有、表權限全部收回 ----------
alter table public.rc_identities enable row level security;
alter table public.rc_sessions enable row level security;
alter table public.rc_participation enable row level security;
alter table public.rc_forms enable row level security;
alter table public.rc_questions enable row level security;
alter table public.rc_audience enable row level security;
alter table public.rc_responses enable row level security;
alter table public.rc_answers enable row level security;
alter table public.rc_pairs enable row level security;
alter table public.rc_outcomes enable row level security;
alter table public.rc_reviews enable row level security;
alter table public.rc_log enable row level security;
revoke all on public.rc_identities, public.rc_sessions, public.rc_participation, public.rc_forms, public.rc_questions, public.rc_audience, public.rc_responses, public.rc_answers, public.rc_pairs, public.rc_outcomes, public.rc_reviews, public.rc_log
  from public, anon, authenticated;
revoke all on sequence public.rc_identities_id_seq, public.rc_log_id_seq from public, anon, authenticated;

-- ---------- 8. 門 ----------
create or replace function public.rc_can_manage()
returns boolean language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'cadre') and (
    public.is_president()
    or exists (select 1 from public.assignments a where a.workspace_id = 'custom:records' and a.user_id = auth.uid())
    or exists (select 1 from public.workspaces w where w.id = 'custom:records' and w.owner = auth.uid() and w.active));
$$;
create or replace function public.rc_can_view()
returns boolean language sql stable security definer
set search_path = public, pg_temp
as $$ select public.rc_can_manage() or public.is_senior(); $$;
-- 一場活動的記分卡：看的人，加那場活動工作區裡的人。
create or replace function public.rc_event_viewer(p_event uuid)
returns boolean language sql stable security definer
set search_path = public, pg_temp
as $$
  select public.rc_can_view()
      or exists (select 1 from public.events e where e.id = p_event and public.can_view(e.workspace_id));
$$;
create or replace function public.rc_event_editor(p_event uuid)
returns boolean language sql stable security definer
set search_path = public, pg_temp
as $$
  select public.rc_can_manage()
      or exists (select 1 from public.events e where e.id = p_event and public.can_edit(e.workspace_id));
$$;
create or replace function public.rc_in(p_form uuid, p_role text, p_uid uuid)
returns boolean language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from public.rc_audience a where a.form_id = p_form and a.role = p_role and public.tf_match(p_uid, a.kind, a.value));
$$;
create or replace function public.rc_form_editor(p_form uuid)
returns boolean language sql stable security definer
set search_path = public, pg_temp
as $$
  select public.rc_can_manage()
      or exists (select 1 from public.rc_forms f where f.id = p_form and (
           f.owner = auth.uid()
           or public.rc_in(p_form, 'editor', auth.uid())
           or (f.kind not like 'pair-%' and f.event_id is not null and public.rc_event_editor(f.event_id))));
$$;
-- 讀原始答案。配對回饋（pair-*）：只有管的人與讀者名單，Senior Adviser 與活動工作區都不算。
create or replace function public.rc_form_reader(p_form uuid)
returns boolean language sql stable security definer
set search_path = public, pg_temp
as $$
  select public.rc_form_editor(p_form)
      or public.rc_in(p_form, 'reader', auth.uid())
      or exists (select 1 from public.rc_forms f where f.id = p_form and f.kind not like 'pair-%' and public.is_senior());
$$;
create or replace function public.rc_me_person()
returns uuid language sql stable security definer
set search_path = public, pg_temp
as $$ select id from public.people where profile_id = auth.uid() limit 1; $$;
revoke all on function public.rc_can_manage(), public.rc_can_view(), public.rc_event_viewer(uuid), public.rc_event_editor(uuid),
  public.rc_in(uuid, text, uuid), public.rc_form_editor(uuid), public.rc_form_reader(uuid), public.rc_me_person() from public, anon, authenticated;
grant execute on function public.rc_can_manage(), public.rc_can_view(), public.rc_event_viewer(uuid), public.rc_form_reader(uuid) to authenticated;

create or replace function public.rc_log_it(p_what text, p_ref uuid, p_before jsonb, p_after jsonb)
returns void language sql security definer
set search_path = public, pg_temp
as $$ insert into public.rc_log (what, ref, who, before, after) values (p_what, p_ref, auth.uid(), p_before, p_after); $$;
revoke all on function public.rc_log_it(text, uuid, jsonb, jsonb) from public, anon, authenticated;

-- ---------- 9. 人：找、建、對、合併、忘記 ----------
create or replace function public.rc_person_name(p_person uuid)
returns text language sql stable security definer
set search_path = public, pg_temp
as $$
  select coalesce(nullif(trim(coalesce(pr.name_en, pe.name_en, '')), ''), nullif(trim(coalesce(pr.name_zh, pe.name_zh, '')), ''), '')
    from public.people pe left join public.profiles pr on pr.id = pe.profile_id where pe.id = p_person;
$$;
revoke all on function public.rc_person_name(uuid) from public, anon, authenticated;

-- 用 email 找人（小寫、去空白）。找不到回 null。
create or replace function public.rc_find_by_email(p_email text)
returns uuid language sql stable security definer
set search_path = public, pg_temp
as $$
  select person_id from public.rc_identities where kind = 'email' and lower(value) = lower(trim(p_email)) limit 1;
$$;
revoke all on function public.rc_find_by_email(text) from public, anon, authenticated;

-- 建一個人或找到既有的（內部用）。規則照計畫 2a：email 完全一樣就是同一人；
-- 名字 + 學校 + 畢業年都一樣也算（matched = rule）；只有名字一樣**不**自動合併，留給 rc_duplicates() 提示。
create or replace function public.rc_upsert_person(p_email text, p_name_zh text, p_name_en text, p_kind text, p_school text, p_grad_year int, p_source text)
returns uuid language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_id uuid; v_email text := nullif(lower(trim(coalesce(p_email, ''))), ''); v_zh text := nullif(trim(coalesce(p_name_zh, '')), ''); v_en text := nullif(trim(coalesce(p_name_en, '')), '');
begin
  if v_email is not null then v_id := public.rc_find_by_email(v_email); end if;
  if v_id is null and v_email is not null then
    select pe.id into v_id from public.people pe join auth.users u on u.id = pe.profile_id where lower(u.email) = v_email limit 1;
  end if;
  -- 有帳號但名單上還沒有這個人（一般幹部、學員）：建那一列並接上帳號，之後他登入看到的就是自己。
  if v_id is null and v_email is not null then
    insert into public.people (name_zh, name_en, kind, school, grad_year, email, profile_id)
    select coalesce(nullif(pr.name_zh, ''), v_zh), coalesce(nullif(pr.name_en, ''), v_en),
           case when pr.role in ('cadre', 'alumni') then 'member' else 'student' end, coalesce(pr.school, p_school), p_grad_year, v_email, pr.id
      from auth.users u join public.profiles pr on pr.id = u.id
     where lower(u.email) = v_email and not exists (select 1 from public.people x where x.profile_id = u.id)
     limit 1 returning id into v_id;
  end if;
  if v_id is null and (v_zh is not null or v_en is not null) and p_school is not null and p_grad_year is not null then
    select id into v_id from public.people
     where kind = coalesce(p_kind, 'student') and school = p_school and grad_year = p_grad_year
       and ((v_zh is not null and name_zh = v_zh) or (v_en is not null and lower(name_en) = lower(v_en)))
     limit 1;
  end if;
  if v_id is null then
    if v_zh is null and v_en is null and v_email is null then raise exception 'need_name_or_email' using errcode = 'P0001'; end if;
    insert into public.people (name_zh, name_en, kind, school, grad_year, email)
    values (v_zh, v_en, coalesce(p_kind, 'student'), p_school, p_grad_year, v_email) returning id into v_id;
  else
    update public.people set name_zh = coalesce(name_zh, v_zh), name_en = coalesce(name_en, v_en),
           school = coalesce(school, p_school), grad_year = coalesce(grad_year, p_grad_year), email = coalesce(email, v_email)
     where id = v_id;
  end if;
  if v_email is not null then insert into public.rc_identities (person_id, kind, value, source) values (v_id, 'email', v_email, coalesce(p_source, '')) on conflict do nothing; end if;
  if v_zh is not null then insert into public.rc_identities (person_id, kind, value, source) values (v_id, 'name_zh', v_zh, coalesce(p_source, '')) on conflict do nothing; end if;
  if v_en is not null then insert into public.rc_identities (person_id, kind, value, source) values (v_id, 'name_en', v_en, coalesce(p_source, '')) on conflict do nothing; end if;
  return v_id;
end $$;
revoke all on function public.rc_upsert_person(text, text, text, text, text, int, text) from public, anon, authenticated;

-- 後台：加一個人（管的人）。p：{ email, name_zh, name_en, kind, school, grad_year, note }
create or replace function public.rc_save_person(p_person uuid, p jsonb)
returns uuid language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_id uuid; v_kind text := coalesce(nullif(p->>'kind', ''), 'student');
begin
  if not public.rc_can_manage() then raise exception 'not_records_manager' using errcode = 'P0001'; end if;
  if v_kind not in ('member', 'student', 'guest') then raise exception 'bad_kind' using errcode = 'P0001'; end if;
  if p_person is null then
    v_id := public.rc_upsert_person(p->>'email', p->>'name_zh', p->>'name_en', v_kind, nullif(p->>'school', ''), nullif(p->>'grad_year', '')::int, 'admin');
    perform public.rc_log_it('person_add', v_id, null, p - 'email');
  else
    if not exists (select 1 from public.people where id = p_person) then raise exception 'no_such_person' using errcode = 'P0001'; end if;
    v_id := p_person;
    update public.people set
      name_zh   = case when p ? 'name_zh' then nullif(trim(p->>'name_zh'), '') else name_zh end,
      name_en   = case when p ? 'name_en' then nullif(trim(p->>'name_en'), '') else name_en end,
      school    = case when p ? 'school' then nullif(trim(p->>'school'), '') else school end,
      grad_year = case when p ? 'grad_year' then nullif(p->>'grad_year', '')::int else grad_year end,
      note      = case when p ? 'note' then nullif(trim(p->>'note'), '') else note end,
      kind      = case when p ? 'kind' and profile_id is null then v_kind else kind end
     where id = v_id;
    if nullif(trim(coalesce(p->>'email', '')), '') is not null then
      if public.rc_find_by_email(p->>'email') is not null and public.rc_find_by_email(p->>'email') <> v_id then raise exception 'email_taken' using errcode = 'P0001'; end if;
      insert into public.rc_identities (person_id, kind, value, source) values (v_id, 'email', lower(trim(p->>'email')), 'admin') on conflict do nothing;
      update public.people set email = coalesce(email, lower(trim(p->>'email'))) where id = v_id;
    end if;
    perform public.rc_log_it('person_edit', v_id, null, p - 'email');
  end if;
  return v_id;
end $$;

-- 合併：把 drop 的出席、答案、配對、去向、身分全搬到 keep，再刪 drop。
-- 兩個都是成員（kind member）就交給既有的 merge_people（職位、邀請碼、帳號那些它會搬）。
create or replace function public.rc_merge_people(p_keep uuid, p_drop uuid)
returns uuid language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_keep public.people%rowtype; v_drop public.people%rowtype;
begin
  if not public.rc_can_manage() then raise exception 'not_records_manager' using errcode = 'P0001'; end if;
  if p_keep = p_drop then raise exception 'same_person' using errcode = 'P0001'; end if;
  select * into v_keep from public.people where id = p_keep; if not found then raise exception 'no_such_person' using errcode = 'P0001'; end if;
  select * into v_drop from public.people where id = p_drop; if not found then raise exception 'no_such_person' using errcode = 'P0001'; end if;
  if v_keep.profile_id is not null and v_drop.profile_id is not null then raise exception 'both_have_accounts' using errcode = 'P0001'; end if;
  update public.rc_identities set person_id = p_keep where person_id = p_drop
     and not exists (select 1 from public.rc_identities k where k.person_id = p_keep and k.kind = rc_identities.kind and lower(k.value) = lower(rc_identities.value));
  delete from public.rc_identities where person_id = p_drop;
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
         kind = case when kind = 'member' or v_drop.kind = 'member' then 'member' else kind end
   where id = p_keep;
  if v_drop.kind = 'member' or v_drop.profile_id is not null or exists (select 1 from public.positions where person_id = p_drop) then
    if not public.is_president() then raise exception 'not_president' using errcode = 'P0001'; end if;
    perform public.merge_people(p_keep, p_drop);
  else
    delete from public.people where id = p_drop;
  end if;
  perform public.rc_log_it('person_merge', p_keep, to_jsonb(p_drop), null);
  return p_keep;
end $$;

-- 一個人要求被移除（計畫 6e）。只有 Co-President。有登入帳號的先用「刪除成員」把帳號刪掉，這一支再把紀錄清乾淨。
-- 答案留著但不掛人，出席刪掉，配對那一格留空，去向刪掉，名字與 email 清掉，列留著讓歷年人數不變。
create or replace function public.forget_person(p_person uuid)
returns boolean language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  perform public.require_president();
  if not exists (select 1 from public.people where id = p_person) then raise exception 'no_such_person' using errcode = 'P0001'; end if;
  if exists (select 1 from public.people where id = p_person and profile_id is not null) then raise exception 'has_account' using errcode = 'P0001'; end if;
  delete from public.rc_identities where person_id = p_person;
  delete from public.rc_participation where person_id = p_person;
  delete from public.rc_outcomes where person_id = p_person;
  update public.rc_responses set person_id = null, participation_id = null, typed_name = '', contact_ok = false where person_id = p_person;
  update public.rc_pairs set mentor_id = null where mentor_id = p_person;
  update public.rc_pairs set mentee_id = null where mentee_id = p_person;
  delete from public.positions where person_id = p_person;
  update public.invite_codes set person_id = null where person_id = p_person;
  update public.people set name_zh = null, name_en = null, email = null, note = null, school = null, grad_year = null, forgotten_at = now() where id = p_person;
  perform public.rc_log_it('person_forget', p_person, null, null);
  return true;
end $$;

-- 可能是同一個人：同名（任一語言）而且不是同一列。只提示，合併是人按的。
create or replace function public.rc_duplicates()
returns jsonb language sql stable security definer
set search_path = public, pg_temp
as $$
  select case when public.rc_can_manage() then coalesce((
    select jsonb_agg(jsonb_build_object('a', a.id, 'a_name', public.rc_person_name(a.id), 'a_kind', a.kind, 'a_school', a.school,
                                        'b', b.id, 'b_name', public.rc_person_name(b.id), 'b_kind', b.kind, 'b_school', b.school,
                                        'why', case when a.name_en is not null and lower(a.name_en) = lower(b.name_en) then 'name_en' else 'name_zh' end))
      from public.people a join public.people b on b.id > a.id
     where a.forgotten_at is null and b.forgotten_at is null
       and ((a.name_en is not null and lower(a.name_en) = lower(b.name_en)) or (a.name_zh is not null and a.name_zh = b.name_zh))), '[]'::jsonb)
  else '[]'::jsonb end;
$$;

-- ---------- 10. 活動：場次、出席、從報名表抄 ----------
create or replace function public.rc_save_event_meta(p_event uuid, p jsonb)
returns uuid language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_kind text; v_term text;
begin
  if not public.rc_event_editor(p_event) then raise exception 'not_event_editor' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.events where id = p_event) then raise exception 'no_such_event' using errcode = 'P0001'; end if;
  v_kind := coalesce(nullif(p->>'kind', ''), null);
  v_term := nullif(p->>'term_id', '');
  if v_term is not null and not exists (select 1 from public.terms where id = v_term) then raise exception 'no_such_term' using errcode = 'P0001'; end if;
  update public.events set kind = coalesce(v_kind, kind), term_id = case when p ? 'term_id' then v_term else term_id end, updated_at = now() where id = p_event;
  return p_event;
end $$;

-- 整份場次一次換（照順序）。p_sessions：[{ id?, title, starts_at, ends_at }]
create or replace function public.rc_set_sessions(p_event uuid, p_sessions jsonb)
returns int language plpgsql security definer
set search_path = public, pg_temp
as $$
declare s jsonb; i int := 0; v_id uuid; v_keep uuid[] := '{}';
begin
  if not public.rc_event_editor(p_event) then raise exception 'not_event_editor' using errcode = 'P0001'; end if;
  if jsonb_typeof(coalesce(p_sessions, '[]'::jsonb)) <> 'array' then raise exception 'bad_sessions' using errcode = 'P0001'; end if;
  for s in select value from jsonb_array_elements(coalesce(p_sessions, '[]'::jsonb)) loop
    i := i + 1; v_id := null;
    if nullif(s->>'id', '') is not null then
      update public.rc_sessions set ord = i, title = coalesce(s->>'title', ''), starts_at = nullif(s->>'starts_at', '')::timestamptz, ends_at = nullif(s->>'ends_at', '')::timestamptz
       where id = (s->>'id')::uuid and event_id = p_event returning id into v_id;
    end if;
    if v_id is null then
      insert into public.rc_sessions (event_id, ord, title, starts_at, ends_at)
      values (p_event, i, coalesce(s->>'title', ''), nullif(s->>'starts_at', '')::timestamptz, nullif(s->>'ends_at', '')::timestamptz) returning id into v_id;
    end if;
    v_keep := v_keep || v_id;
  end loop;
  delete from public.rc_sessions where event_id = p_event and not (id = any(v_keep));
  return i;
end $$;

-- 記一筆出席（或改狀態）。p：{ person_id | email+name_zh+name_en+school+grad_year, role, status, session_id, note }
create or replace function public.rc_set_participation(p_event uuid, p jsonb)
returns uuid language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_person uuid; v_role text := coalesce(nullif(p->>'role', ''), 'student'); v_status text := coalesce(nullif(p->>'status', ''), 'registered'); v_sess uuid; v_id uuid;
begin
  if not public.rc_event_editor(p_event) then raise exception 'not_event_editor' using errcode = 'P0001'; end if;
  if v_role not in ('student', 'mentee', 'mentor', 'speaker', 'organizer', 'volunteer', 'alumni') then raise exception 'bad_role' using errcode = 'P0001'; end if;
  if v_status not in ('registered', 'attended', 'no-show', 'cancelled') then raise exception 'bad_status' using errcode = 'P0001'; end if;
  v_person := nullif(p->>'person_id', '')::uuid;
  if v_person is null then
    v_person := public.rc_upsert_person(p->>'email', p->>'name_zh', p->>'name_en', case when v_role in ('mentor', 'speaker', 'organizer', 'volunteer', 'alumni') then 'guest' else 'student' end,
                                        nullif(p->>'school', ''), nullif(p->>'grad_year', '')::int, 'event:' || p_event::text);
  elsif not exists (select 1 from public.people where id = v_person) then raise exception 'no_such_person' using errcode = 'P0001';
  end if;
  v_sess := nullif(p->>'session_id', '')::uuid;
  if v_sess is not null and not exists (select 1 from public.rc_sessions where id = v_sess and event_id = p_event) then raise exception 'no_such_session' using errcode = 'P0001'; end if;
  insert into public.rc_participation (person_id, event_id, session_id, role, status, source, note, recorded_by)
  values (v_person, p_event, v_sess, v_role, v_status, coalesce(nullif(p->>'source', ''), 'manual'), coalesce(p->>'note', ''), auth.uid())
  on conflict (person_id, event_id, role, (coalesce(session_id, '00000000-0000-0000-0000-000000000000'::uuid)))
  do update set status = excluded.status, note = case when excluded.note <> '' then excluded.note else rc_participation.note end, recorded_by = auth.uid(), recorded_at = now()
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.rc_remove_participation(p_id uuid)
returns boolean language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_event uuid;
begin
  select event_id into v_event from public.rc_participation where id = p_id;
  if v_event is null or not public.rc_event_editor(v_event) then raise exception 'not_event_editor' using errcode = 'P0001'; end if;
  delete from public.rc_participation where id = p_id;
  return found;
end $$;

-- 從網站的報名表抄出席：每一份非拒絕的 application 一筆（簽到過 = attended）。可以重跑，不會重複。
create or replace function public.rc_sync_event(p_event uuid)
returns int language plpgsql security definer
set search_path = public, pg_temp
as $$
declare r record; v_person uuid; n int := 0; v_form uuid;
begin
  if not public.rc_event_viewer(p_event) then raise exception 'not_event_viewer' using errcode = 'P0001'; end if;
  select form_id into v_form from public.events where id = p_event;
  if v_form is null then return 0; end if;
  for r in select a.id, a.user_id, a.applicant_name, a.applicant_email, a.applicant_school, a.applicant_grade, a.status, a.checked_in_at
             from public.applications a where a.form_id = v_form loop
    v_person := (select id from public.people where profile_id = r.user_id limit 1);
    if v_person is null then
      v_person := public.rc_upsert_person(r.applicant_email, r.applicant_name, null, 'student', nullif(r.applicant_school, ''), null, 'application');
      if not exists (select 1 from public.people where id = v_person and profile_id is not null) then
        update public.people set profile_id = r.user_id where id = v_person and profile_id is null
           and not exists (select 1 from public.people o where o.profile_id = r.user_id);
      end if;
      insert into public.rc_identities (person_id, kind, value, source, verified)
      select v_person, 'email', lower(u.email), 'login', true from auth.users u where u.id = r.user_id and u.email is not null on conflict do nothing;
    end if;
    insert into public.rc_participation (person_id, event_id, role, status, source, application_id, recorded_by)
    values (v_person, p_event, 'student',
            case when r.checked_in_at is not null then 'attended' when r.status = 'rejected' then 'cancelled' else 'registered' end,
            'site', r.id, auth.uid())
    on conflict (person_id, event_id, role, (coalesce(session_id, '00000000-0000-0000-0000-000000000000'::uuid)))
    do update set status = case when rc_participation.source = 'site' then excluded.status else rc_participation.status end, application_id = excluded.application_id;
    n := n + 1;
  end loop;
  return n;
end $$;

-- ---------- 11. 回饋表：建、改、名單、狀態、填（不登入）、看結果 ----------
create or replace function public.rc_questions_json(p_form uuid)
returns jsonb language sql stable security definer
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', q.id, 'ord', q.ord, 'key', q.key, 'label', q.label, 'help', q.help, 'type', q.type,
                    'required', q.required, 'options', to_jsonb(q.options), 'scale_min', q.scale_min, 'scale_max', q.scale_max,
                    'min_label', q.min_label, 'max_label', q.max_label,
                    'answered', exists (select 1 from public.rc_answers a where a.question_id = q.id)) order by q.ord, q.id), '[]'::jsonb)
    from public.rc_questions q where q.form_id = p_form;
$$;
create or replace function public.rc_form_json(p_form uuid)
returns jsonb language sql stable security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object('id', f.id, 'title', f.title, 'intro', f.intro, 'kind', f.kind, 'event_id', f.event_id, 'term_id', f.term_id, 'lang', f.lang,
                            'status', f.status, 'closes_at', f.closes_at, 'anonymous', f.anonymous, 'token', f.token, 'source', f.source, 'owner', f.owner,
                            'event_title', (select coalesce(nullif(e.title_zh, ''), e.title_en) from public.events e where e.id = f.event_id),
                            'responses', (select count(*) from public.rc_responses r where r.form_id = f.id),
                            'created_at', f.created_at, 'updated_at', f.updated_at)
    from public.rc_forms f where f.id = p_form;
$$;
revoke all on function public.rc_questions_json(uuid), public.rc_form_json(uuid) from public, anon, authenticated;

-- 新建（p_form 為 null）或存。p_data：{ title, intro, kind, event_id, term_id, lang, closes_at, anonymous }。
-- p_questions 跟 tf_save_form 一樣的規矩（有人答過的題目刪不了、不能換題型），多一個 key。
create or replace function public.rc_save_form(p_form uuid, p_data jsonb, p_questions jsonb)
returns uuid language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid; v_old public.rc_forms%rowtype; v_has int := 0; v_anon boolean; v_title text; v_kind text; v_event uuid;
  q jsonb; i int := 0; v_qid uuid; v_keep uuid[] := '{}'; v_type text; v_opts text[]; v_min int; v_max int; v_prev public.rc_questions%rowtype; v_key text;
begin
  v_title := trim(coalesce(p_data->>'title', ''));
  v_event := nullif(p_data->>'event_id', '')::uuid;
  if p_form is null then
    v_kind := coalesce(nullif(p_data->>'kind', ''), 'post-event');
    if v_kind not in ('post-event', 'alumni-yearly', 'pair-mentor', 'pair-mentee', 'other') then raise exception 'bad_kind' using errcode = 'P0001'; end if;
    -- 建：管的人；或掛在一場活動上而且是那場活動「改」以上的人（配對回饋除外，那個只有管的人）。
    if not (public.rc_can_manage() or (v_event is not null and v_kind not like 'pair-%' and public.rc_event_editor(v_event))) then
      raise exception 'not_form_creator' using errcode = 'P0001';
    end if;
    if v_title = '' then raise exception 'need_title' using errcode = 'P0001'; end if;
    if v_event is not null and not exists (select 1 from public.events where id = v_event) then raise exception 'no_such_event' using errcode = 'P0001'; end if;
    insert into public.rc_forms (title, kind, event_id, owner) values (v_title, v_kind, v_event, auth.uid()) returning id into v_id;
    select * into v_old from public.rc_forms where id = v_id;
    perform public.rc_log_it('form_create', v_id, null, jsonb_build_object('title', v_title, 'kind', v_kind));
  else
    if not public.rc_form_editor(p_form) then raise exception 'not_form_editor' using errcode = 'P0001'; end if;
    select * into v_old from public.rc_forms where id = p_form for update;
    if not found then raise exception 'form_not_found' using errcode = 'P0001'; end if;
    v_id := p_form;
    if p_data ? 'title' and v_title = '' then raise exception 'need_title' using errcode = 'P0001'; end if;
    if p_data ? 'event_id' and v_event is not null and not exists (select 1 from public.events where id = v_event) then raise exception 'no_such_event' using errcode = 'P0001'; end if;
  end if;
  select count(*) into v_has from public.rc_responses where form_id = v_id;
  v_anon := coalesce((p_data->>'anonymous')::boolean, v_old.anonymous);
  if v_old.anonymous and not v_anon and v_has > 0 then raise exception 'anonymous_locked' using errcode = 'P0001'; end if;
  if p_data ? 'term_id' and nullif(p_data->>'term_id', '') is not null and not exists (select 1 from public.terms where id = p_data->>'term_id') then raise exception 'no_such_term' using errcode = 'P0001'; end if;
  update public.rc_forms set
    title     = case when p_data ? 'title' then v_title else title end,
    intro     = case when p_data ? 'intro' then coalesce(p_data->>'intro', '') else intro end,
    event_id  = case when p_data ? 'event_id' then v_event else event_id end,
    term_id   = case when p_data ? 'term_id' then nullif(p_data->>'term_id', '') else term_id end,
    lang      = case when p_data->>'lang' in ('zh', 'en') then p_data->>'lang' else lang end,
    closes_at = case when p_data ? 'closes_at' then nullif(p_data->>'closes_at', '')::timestamptz else closes_at end,
    anonymous = v_anon,
    updated_at = now()
  where id = v_id;

  if p_questions is not null then
    if jsonb_typeof(p_questions) <> 'array' then raise exception 'bad_questions' using errcode = 'P0001'; end if;
    for q in select value from jsonb_array_elements(p_questions) loop
      i := i + 1;
      v_type := coalesce(q->>'type', '');
      if v_type not in ('short', 'long', 'single', 'multi', 'scale') then raise exception 'bad_question_type:%', i using errcode = 'P0001'; end if;
      if trim(coalesce(q->>'label', '')) = '' then raise exception 'need_question_label:%', i using errcode = 'P0001'; end if;
      v_key := nullif(lower(trim(coalesce(q->>'key', ''))), '');
      if v_key is not null and v_key !~ '^[a-z][a-z0-9_]{0,29}$' then raise exception 'bad_key:%', i using errcode = 'P0001'; end if;
      select coalesce(array_agg(distinct_o order by first_at), '{}') into v_opts from (
        select trim(o) as distinct_o, min(n) as first_at
          from jsonb_array_elements_text(coalesce(case when jsonb_typeof(q->'options') = 'array' then q->'options' end, '[]'::jsonb)) with ordinality t(o, n)
         where trim(o) <> '' group by trim(o)) s;
      if v_type in ('single', 'multi') and cardinality(v_opts) < 2 then raise exception 'need_options:%', i using errcode = 'P0001'; end if;
      if v_type not in ('single', 'multi') then v_opts := '{}'; end if;
      v_min := coalesce(nullif(q->>'scale_min', '')::int, 1);
      v_max := coalesce(nullif(q->>'scale_max', '')::int, 5);
      if v_type = 'scale' and (v_min not in (0, 1) or v_max < 2 or v_max > 10 or v_max <= v_min) then raise exception 'bad_scale:%', i using errcode = 'P0001'; end if;
      v_qid := null;
      if nullif(q->>'id', '') is not null then
        select * into v_prev from public.rc_questions where id = (q->>'id')::uuid and form_id = v_id;
        if found then
          v_qid := v_prev.id;
          if v_prev.type <> v_type and exists (select 1 from public.rc_answers a where a.question_id = v_qid) then raise exception 'question_type_locked:%', i using errcode = 'P0001'; end if;
          update public.rc_questions set ord = i, key = v_key, label = trim(q->>'label'), help = coalesce(q->>'help', ''), type = v_type,
                 required = coalesce((q->>'required')::boolean, false), options = v_opts, scale_min = v_min, scale_max = v_max,
                 min_label = coalesce(q->>'min_label', ''), max_label = coalesce(q->>'max_label', '')
           where id = v_qid;
        end if;
      end if;
      if v_qid is null then
        insert into public.rc_questions (form_id, ord, key, label, help, type, required, options, scale_min, scale_max, min_label, max_label)
        values (v_id, i, v_key, trim(q->>'label'), coalesce(q->>'help', ''), v_type, coalesce((q->>'required')::boolean, false), v_opts, v_min, v_max,
                coalesce(q->>'min_label', ''), coalesce(q->>'max_label', ''))
        returning id into v_qid;
      end if;
      v_keep := v_keep || v_qid;
    end loop;
    if exists (select 1 from public.rc_questions tq where tq.form_id = v_id and not (tq.id = any(v_keep)) and exists (select 1 from public.rc_answers a where a.question_id = tq.id)) then
      raise exception 'question_has_answers' using errcode = 'P0001';
    end if;
    delete from public.rc_questions where form_id = v_id and not (id = any(v_keep));
  end if;
  return v_id;
end $$;

-- 名單（reader / editor）整張換。配對回饋的讀者不能是那個學期的任何一位 mentor（計畫 6c：mentor 永遠看不到 mentee 的答案）。
create or replace function public.rc_set_audience(p_form uuid, p_role text, p_items jsonb)
returns int language plpgsql security definer
set search_path = public, pg_temp
as $$
declare it jsonb; v_kind text; v_val text; n int := 0; f public.rc_forms%rowtype; v_before jsonb; v_after jsonb;
begin
  if not public.rc_form_editor(p_form) then raise exception 'not_form_editor' using errcode = 'P0001'; end if;
  if p_role not in ('reader', 'editor') then raise exception 'bad_role' using errcode = 'P0001'; end if;
  select * into f from public.rc_forms where id = p_form;
  if p_role = 'editor' and not (public.rc_can_manage() or f.owner = auth.uid()) then raise exception 'not_form_owner' using errcode = 'P0001'; end if;
  if jsonb_typeof(coalesce(p_items, '[]'::jsonb)) <> 'array' then raise exception 'bad_items' using errcode = 'P0001'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('kind', kind, 'value', value) order by kind, value), '[]'::jsonb) into v_before from public.rc_audience where form_id = p_form and role = p_role;
  delete from public.rc_audience where form_id = p_form and role = p_role;
  for it in select value from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    v_kind := coalesce(it->>'kind', ''); v_val := trim(coalesce(it->>'value', ''));
    if v_kind not in ('rank', 'team', 'person') then raise exception 'bad_kind' using errcode = 'P0001'; end if;
    if f.kind like 'pair-%' and v_kind <> 'person' then raise exception 'pair_readers_by_person' using errcode = 'P0001'; end if;
    if v_kind = 'rank' and v_val not in ('member', 'adviser', 'director', 'senior_adviser', 'president') then raise exception 'bad_rank' using errcode = 'P0001';
    elsif v_kind = 'team' and v_val = '' then raise exception 'bad_team' using errcode = 'P0001';
    elsif v_kind = 'person' then
      if not exists (select 1 from public.profiles where id::text = v_val and role = 'cadre') then raise exception 'bad_person' using errcode = 'P0001'; end if;
      if f.kind like 'pair-%' and exists (select 1 from public.rc_pairs pr join public.people pe on pe.id = pr.mentor_id where pr.event_id = f.event_id and pe.profile_id::text = v_val) then
        raise exception 'mentor_cannot_read' using errcode = 'P0001';
      end if;
    end if;
    insert into public.rc_audience (form_id, role, kind, value) values (p_form, p_role, v_kind, v_val) on conflict do nothing;
    n := n + 1;
  end loop;
  select coalesce(jsonb_agg(jsonb_build_object('kind', kind, 'value', value) order by kind, value), '[]'::jsonb) into v_after from public.rc_audience where form_id = p_form and role = p_role;
  if v_after is distinct from v_before then perform public.rc_log_it('form_' || p_role, p_form, v_before, v_after); end if;
  update public.rc_forms set updated_at = now() where id = p_form;
  return n;
end $$;

create or replace function public.rc_set_status(p_form uuid, p_status text)
returns text language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_old text;
begin
  if not public.rc_form_editor(p_form) then raise exception 'not_form_editor' using errcode = 'P0001'; end if;
  if p_status not in ('draft', 'open', 'closed') then raise exception 'bad_status' using errcode = 'P0001'; end if;
  select status into v_old from public.rc_forms where id = p_form for update;
  if p_status = 'open' and not exists (select 1 from public.rc_questions where form_id = p_form) then raise exception 'need_questions' using errcode = 'P0001'; end if;
  if p_status = 'draft' and exists (select 1 from public.rc_responses where form_id = p_form) then raise exception 'has_responses' using errcode = 'P0001'; end if;
  update public.rc_forms set status = p_status, updated_at = now() where id = p_form;
  if v_old is distinct from p_status then perform public.rc_log_it('form_status', p_form, to_jsonb(v_old), to_jsonb(p_status)); end if;
  return p_status;
end $$;

create or replace function public.rc_delete_form(p_form uuid)
returns boolean language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if not (public.rc_can_manage() or exists (select 1 from public.rc_forms f where f.id = p_form and f.owner = auth.uid())) then raise exception 'not_form_owner' using errcode = 'P0001'; end if;
  delete from public.rc_forms where id = p_form;
  return found;
end $$;

-- 不登入的填寫：用 token。開著、還沒截止才回題目；回的東西裡沒有任何別人的答案、沒有 owner。
create or replace function public.rc_public_form(p_token text)
returns jsonb language sql stable security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'form', jsonb_build_object('id', f.id, 'title', f.title, 'intro', f.intro, 'kind', f.kind, 'lang', f.lang, 'anonymous', f.anonymous,
                               'event_title', (select coalesce(nullif(e.title_zh, ''), e.title_en) from public.events e where e.id = f.event_id),
                               'open', f.status = 'open' and (f.closes_at is null or f.closes_at > now())),
    'questions', (select coalesce(jsonb_agg(jsonb_build_object('id', q.id, 'ord', q.ord, 'key', q.key, 'label', q.label, 'help', q.help, 'type', q.type,
                    'required', q.required, 'options', to_jsonb(q.options), 'scale_min', q.scale_min, 'scale_max', q.scale_max, 'min_label', q.min_label, 'max_label', q.max_label)
                    order by q.ord, q.id), '[]'::jsonb) from public.rc_questions q where q.form_id = f.id))
    from public.rc_forms f where f.token = p_token and f.status <> 'draft';
$$;

create or replace function public.rc_norm_answer(q public.rc_questions, v jsonb)
returns text language plpgsql immutable
set search_path = public, pg_temp
as $$
declare s text; arr text[]; x text; n int;
begin
  if v is null or jsonb_typeof(v) = 'null' then return ''; end if;
  if q.type = 'multi' then
    if jsonb_typeof(v) = 'array' then select coalesce(array_agg(trim(e)), '{}') into arr from jsonb_array_elements_text(v) e where trim(e) <> '';
    else arr := case when trim(v #>> '{}') = '' then '{}' else string_to_array(v #>> '{}', E'\n') end; end if;
    foreach x in array arr loop
      if not (x = any(q.options)) then raise exception 'bad_option:%', q.ord using errcode = 'P0001'; end if;
    end loop;
    select coalesce(string_agg(o, E'\n' order by i), '') into s from unnest(q.options) with ordinality t(o, i) where o = any(arr);
    return s;
  end if;
  s := trim(v #>> '{}');
  if s = '' then return ''; end if;
  if q.type = 'single' and not (s = any(q.options)) then raise exception 'bad_option:%', q.ord using errcode = 'P0001'; end if;
  if q.type = 'scale' then
    if s !~ '^\d+$' then raise exception 'bad_scale_value:%', q.ord using errcode = 'P0001'; end if;
    n := s::int;
    if n < q.scale_min or n > q.scale_max then raise exception 'bad_scale_value:%', q.ord using errcode = 'P0001'; end if;
  end if;
  if q.type = 'short' and length(s) > 500 then raise exception 'too_long:%', q.ord using errcode = 'P0001'; end if;
  if length(s) > 10000 then raise exception 'too_long:%', q.ord using errcode = 'P0001'; end if;
  return s;
end $$;
revoke all on function public.rc_norm_answer(public.rc_questions, jsonb) from public, anon, authenticated;

-- 送出（不登入）。p_meta：{ age_band: under18|18plus|unknown, contact_ok: bool, email, name }。
-- 匿名表單：留 email 的人才會對到人（他自己勾的）；沒留就完全不掛人。一個 token 一小時最多 200 份（擋灌水，不擋真人）。
create or replace function public.rc_public_submit(p_token text, p_answers jsonb, p_meta jsonb)
returns uuid language plpgsql security definer
set search_path = public, pg_temp
as $$
declare f public.rc_forms%rowtype; q public.rc_questions; v_rid uuid; v_val text; v_vals jsonb := '{}'::jsonb; v_person uuid; v_band text; v_ok boolean; v_email text; v_name text;
begin
  select * into f from public.rc_forms where token = p_token;
  if not found then raise exception 'form_not_found' using errcode = 'P0001'; end if;
  if f.status <> 'open' or (f.closes_at is not null and f.closes_at <= now()) then raise exception 'form_closed' using errcode = 'P0001'; end if;
  if (select count(*) from public.rc_responses r where r.form_id = f.id and r.submitted_at > now() - interval '1 hour') >= 200 then raise exception 'too_many' using errcode = 'P0001'; end if;
  if jsonb_typeof(coalesce(p_answers, '{}'::jsonb)) <> 'object' then raise exception 'bad_answers' using errcode = 'P0001'; end if;
  for q in select * from public.rc_questions where form_id = f.id order by ord, id loop
    v_val := public.rc_norm_answer(q, p_answers->(q.id::text));
    if q.required and v_val = '' then raise exception 'required:%', q.ord using errcode = 'P0001'; end if;
    v_vals := v_vals || jsonb_build_object(q.id::text, v_val);
  end loop;
  v_band := coalesce(nullif(p_meta->>'age_band', ''), 'unknown');
  if v_band not in ('under18', '18plus', 'unknown') then v_band := 'unknown'; end if;
  v_ok := coalesce((p_meta->>'contact_ok')::boolean, false);
  v_email := nullif(lower(trim(coalesce(p_meta->>'email', ''))), '');
  v_name := nullif(trim(coalesce(p_meta->>'name', '')), '');
  if v_ok and v_email is not null then
    if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'bad_email' using errcode = 'P0001'; end if;
    v_person := public.rc_upsert_person(v_email, v_name, null, 'student', null, null, 'feedback:' || f.id::text);
  elsif not f.anonymous and v_email is not null then
    v_person := public.rc_upsert_person(v_email, v_name, null, 'student', null, null, 'feedback:' || f.id::text);
  end if;
  insert into public.rc_responses (form_id, person_id, age_band, contact_ok, typed_name, source)
  values (f.id, v_person, v_band, v_ok and v_email is not null, case when v_person is null then '' else coalesce(v_name, '') end, 'site')
  returning id into v_rid;
  insert into public.rc_answers (response_id, question_id, value)
  select v_rid, key::uuid, value #>> '{}' from jsonb_each(v_vals) where value #>> '{}' <> '';
  return v_rid;
end $$;

-- 匯入舊表單的答案（管的人）。p_rows：[{ email?, name?, submitted_at?, age_band?, answers: { "<題目 id>": 值 } }]
-- 匯入的答案不檢查選項（舊表單的選項可能跟現在不一樣）。有 email 才對人；沒有就是匿名的一列。
create or replace function public.rc_import_responses(p_form uuid, p_rows jsonb)
returns int language plpgsql security definer
set search_path = public, pg_temp
as $$
declare r jsonb; v_rid uuid; v_person uuid; n int := 0; k text; v text; f public.rc_forms%rowtype;
begin
  if not public.rc_can_manage() then raise exception 'not_records_manager' using errcode = 'P0001'; end if;
  select * into f from public.rc_forms where id = p_form;
  if not found then raise exception 'form_not_found' using errcode = 'P0001'; end if;
  if jsonb_typeof(coalesce(p_rows, '[]'::jsonb)) <> 'array' then raise exception 'bad_rows' using errcode = 'P0001'; end if;
  for r in select value from jsonb_array_elements(p_rows) loop
    v_person := null;
    if nullif(trim(coalesce(r->>'email', '')), '') is not null then
      v_person := public.rc_upsert_person(r->>'email', r->>'name', null, 'student', null, null, 'import:' || p_form::text);
    end if;
    insert into public.rc_responses (form_id, person_id, age_band, typed_name, source, submitted_at)
    values (p_form, v_person, case when r->>'age_band' in ('under18', '18plus') then r->>'age_band' else 'unknown' end,
            case when v_person is null then '' else coalesce(r->>'name', '') end, 'import', coalesce(nullif(r->>'submitted_at', '')::timestamptz, now()))
    returning id into v_rid;
    for k, v in select key, case when jsonb_typeof(value) = 'array' then (select string_agg(e, E'\n') from jsonb_array_elements_text(value) e) else value #>> '{}' end
                  from jsonb_each(coalesce(r->'answers', '{}'::jsonb)) loop
      if not exists (select 1 from public.rc_questions where id::text = k and form_id = p_form) then raise exception 'bad_question' using errcode = 'P0001'; end if;
      if trim(coalesce(v, '')) <> '' then insert into public.rc_answers (response_id, question_id, value) values (v_rid, k::uuid, left(trim(v), 10000)); end if;
    end loop;
    n := n + 1;
  end loop;
  update public.rc_forms set source = 'import', updated_at = now() where id = p_form and source = 'site' and n > 0;
  perform public.rc_log_it('form_import', p_form, null, to_jsonb(n));
  return n;
end $$;

-- 結果：只有讀者。匿名的表單不回名字；留了 email 的那幾份只回「有留聯絡方式」不回 email。
create or replace function public.rc_results(p_form uuid)
returns jsonb language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare f public.rc_forms%rowtype;
begin
  if not public.rc_form_reader(p_form) then raise exception 'not_form_reader' using errcode = 'P0001'; end if;
  select * into f from public.rc_forms where id = p_form;
  return jsonb_build_object(
    'form', public.rc_form_json(p_form),
    'questions', public.rc_questions_json(p_form),
    'can_edit', public.rc_form_editor(p_form),
    'audience', coalesce((select jsonb_agg(jsonb_build_object('role', a.role, 'kind', a.kind, 'value', a.value) order by a.role, a.kind, a.value) from public.rc_audience a where a.form_id = p_form), '[]'::jsonb),
    'responses', coalesce((select jsonb_agg(jsonb_build_object(
                      'id', r.id,
                      'name', case when f.anonymous then '' else coalesce(public.rc_person_name(r.person_id), r.typed_name, '') end,
                      'person_id', case when f.anonymous then null else r.person_id end,
                      'contact_ok', r.contact_ok, 'age_band', r.age_band, 'source', r.source,
                      'submitted_at', case when f.anonymous then to_char(r.submitted_at at time zone 'Asia/Taipei', 'YYYY-MM-DD') else r.submitted_at::text end,
                      'answers', coalesce((select jsonb_object_agg(a.question_id, a.value) from public.rc_answers a where a.response_id = r.id), '{}'::jsonb))
                    order by case when f.anonymous then md5(r.id::text) else to_char(r.submitted_at, 'YYYYMMDDHH24MISSUS') end)
                  from public.rc_responses r where r.form_id = p_form), '[]'::jsonb),
    'log', coalesce((select jsonb_agg(jsonb_build_object('at', l.at, 'what', l.what, 'who', coalesce(public.tf_person(l.who)->>'name', ''), 'before', l.before, 'after', l.after) order by l.at desc)
                       from (select * from public.rc_log where ref = p_form order by at desc limit 50) l), '[]'::jsonb));
end $$;

-- ---------- 12. 配對、去向、檢討 ----------
create or replace function public.rc_save_pair(p_pair uuid, p jsonb)
returns uuid language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_id uuid; v_event uuid; v_mentor uuid; v_mentee uuid;
begin
  if not public.rc_can_manage() then raise exception 'not_records_manager' using errcode = 'P0001'; end if;
  v_event := nullif(p->>'event_id', '')::uuid;
  if p_pair is null then
    if v_event is null or not exists (select 1 from public.events where id = v_event) then raise exception 'no_such_event' using errcode = 'P0001'; end if;
    v_mentor := nullif(p->>'mentor_id', '')::uuid; v_mentee := nullif(p->>'mentee_id', '')::uuid;
    if v_mentor is null then v_mentor := public.rc_upsert_person(p->>'mentor_email', p->>'mentor_name_zh', p->>'mentor_name_en', 'member', null, null, 'pair'); end if;
    if v_mentee is null then v_mentee := public.rc_upsert_person(p->>'mentee_email', p->>'mentee_name_zh', p->>'mentee_name_en', 'student', nullif(p->>'mentee_school', ''), nullif(p->>'mentee_grad_year', '')::int, 'pair'); end if;
    if v_mentor = v_mentee then raise exception 'same_person' using errcode = 'P0001'; end if;
    insert into public.rc_pairs (event_id, mentor_id, mentee_id, matched_on, note, created_by)
    values (v_event, v_mentor, v_mentee, coalesce(nullif(p->>'matched_on', '')::date, current_date), coalesce(p->>'note', ''), auth.uid())
    on conflict (event_id, mentor_id, mentee_id) where mentor_id is not null and mentee_id is not null do update set note = excluded.note
    returning id into v_id;
    insert into public.rc_participation (person_id, event_id, role, status, source, recorded_by) values (v_mentor, v_event, 'mentor', 'attended', 'manual', auth.uid()) on conflict do nothing;
    insert into public.rc_participation (person_id, event_id, role, status, source, recorded_by) values (v_mentee, v_event, 'mentee', 'attended', 'manual', auth.uid()) on conflict do nothing;
  else
    update public.rc_pairs set
      ended_on   = case when p ? 'ended_on' then nullif(p->>'ended_on', '')::date else ended_on end,
      end_reason = case when p ? 'end_reason' and coalesce(p->>'end_reason', '') in ('', 'completed', 'mentor_left', 'mentee_left', 'rematched', 'other') then coalesce(p->>'end_reason', '') else end_reason end,
      matched_on = case when p ? 'matched_on' then nullif(p->>'matched_on', '')::date else matched_on end,
      note       = case when p ? 'note' then coalesce(p->>'note', '') else note end
     where id = p_pair returning id into v_id;
    if v_id is null then raise exception 'no_such_pair' using errcode = 'P0001'; end if;
  end if;
  return v_id;
end $$;

create or replace function public.rc_delete_pair(p_pair uuid)
returns boolean language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if not public.rc_can_manage() then raise exception 'not_records_manager' using errcode = 'P0001'; end if;
  delete from public.rc_pairs where id = p_pair;
  return found;
end $$;

-- 去向。管的人替任何人填（source mentorship / import）；本人替自己填（source self，visibility 自己選）。
create or replace function public.rc_save_outcome(p_outcome uuid, p jsonb)
returns uuid language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_person uuid; v_me uuid := public.rc_me_person(); v_id uuid; v_kind text := coalesce(nullif(p->>'kind', ''), 'enrolled'); v_vis text := coalesce(nullif(p->>'visibility', ''), 'internal');
begin
  if v_me is null and nullif(p->>'person_id', '') is null and auth.uid() is not null then
    -- 本人還沒有名單上的那一列（一般幹部、學員、校友都可能）：建一列接上帳號。
    insert into public.people (name_zh, name_en, kind, profile_id)
    select nullif(pr.name_zh, ''), nullif(pr.name_en, ''), case when pr.role in ('cadre', 'alumni') then 'member' else 'student' end, pr.id
      from public.profiles pr where pr.id = auth.uid() and not exists (select 1 from public.people x where x.profile_id = pr.id)
    returning id into v_me;
  end if;
  v_person := coalesce(nullif(p->>'person_id', '')::uuid, v_me);
  if p_outcome is not null then select person_id into v_person from public.rc_outcomes where id = p_outcome; end if;
  if v_person is null then raise exception 'no_such_person' using errcode = 'P0001'; end if;
  -- v_me 可能是 null（本人還沒有名單上那一列）：null = uuid 是 null，not null 不會擋，所以要 coalesce。
  if not (public.rc_can_manage() or coalesce(v_person = v_me, false)) then raise exception 'not_records_manager' using errcode = 'P0001'; end if;
  if v_kind not in ('applied', 'admitted', 'enrolled', 'transferred', 'graduated', 'working', 'gap', 'other') then raise exception 'bad_kind' using errcode = 'P0001'; end if;
  if v_vis not in ('private', 'internal', 'aggregate', 'public') then raise exception 'bad_visibility' using errcode = 'P0001'; end if;
  if p_outcome is null then
    insert into public.rc_outcomes (person_id, kind, institution, country, major, year, note, source, visibility, recorded_by)
    values (v_person, v_kind, coalesce(p->>'institution', ''), coalesce(p->>'country', ''), coalesce(p->>'major', ''), nullif(p->>'year', '')::int, coalesce(p->>'note', ''),
            case when v_person = v_me and not public.rc_can_manage() then 'self' when p->>'source' in ('self', 'mentorship', 'public', 'import') then p->>'source' else 'mentorship' end,
            v_vis, auth.uid())
    returning id into v_id;
  else
    update public.rc_outcomes set
      kind = case when p ? 'kind' then v_kind else kind end,
      institution = case when p ? 'institution' then coalesce(p->>'institution', '') else institution end,
      country = case when p ? 'country' then coalesce(p->>'country', '') else country end,
      major = case when p ? 'major' then coalesce(p->>'major', '') else major end,
      year = case when p ? 'year' then nullif(p->>'year', '')::int else year end,
      note = case when p ? 'note' then coalesce(p->>'note', '') else note end,
      visibility = case when p ? 'visibility' then v_vis else visibility end,
      recorded_by = auth.uid(), recorded_at = now()
     where id = p_outcome returning id into v_id;
  end if;
  return v_id;
end $$;

create or replace function public.rc_delete_outcome(p_outcome uuid)
returns boolean language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_person uuid;
begin
  select person_id into v_person from public.rc_outcomes where id = p_outcome;
  if v_person is null then return false; end if;
  if not (public.rc_can_manage() or coalesce(v_person = public.rc_me_person(), false)) then raise exception 'not_records_manager' using errcode = 'P0001'; end if;
  delete from public.rc_outcomes where id = p_outcome;
  return true;
end $$;

-- 本人看自己的去向（之後 /settings/ 用）。
create or replace function public.rc_my_outcomes()
returns jsonb language sql stable security definer
set search_path = public, pg_temp
as $$
  select coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'kind', o.kind, 'institution', o.institution, 'country', o.country, 'major', o.major,
                                                       'year', o.year, 'note', o.note, 'visibility', o.visibility, 'source', o.source, 'recorded_at', o.recorded_at)
                                    order by o.year desc nulls last, o.recorded_at desc)
                    from public.rc_outcomes o where o.person_id = public.rc_me_person()), '[]'::jsonb);
$$;

-- 四個數字（記分卡）。看的人與那場活動工作區的人。
create or replace function public.rc_numbers(p_event uuid)
returns jsonb language sql stable security definer
set search_path = public, pg_temp
as $$
  with p as (
    select count(*) filter (where status in ('registered', 'attended', 'no-show') and role in ('student', 'mentee')) as registered,
           count(*) filter (where status = 'attended' and role in ('student', 'mentee')) as attended,
           count(*) filter (where status = 'no-show' and role in ('student', 'mentee')) as no_show,
           count(*) filter (where role = 'mentor') as mentors,
           count(*) filter (where role = 'speaker') as speakers
      from public.rc_participation where event_id = p_event),
  r as (
    select count(distinct r.id) as responses,
           avg(case when q.key = 'recommend' and a.value ~ '^\d+$' then a.value::numeric end) as recommend,
           avg(case when q.key = 'useful' and a.value ~ '^\d+$' then a.value::numeric end) as useful,
           avg(case when q.key = 'clarity' and a.value ~ '^\d+$' then a.value::numeric end) as clarity,
           count(*) filter (where q.key = 'recommend' and a.value ~ '^\d+$') as recommend_n
      from public.rc_responses r join public.rc_forms f on f.id = r.form_id
      left join public.rc_answers a on a.response_id = r.id left join public.rc_questions q on q.id = a.question_id
     where f.event_id = p_event and f.kind = 'post-event')
  select jsonb_build_object('registered', p.registered, 'attended', p.attended, 'no_show', p.no_show, 'mentors', p.mentors, 'speakers', p.speakers,
                            'attendance_rate', case when p.registered > 0 then round(100.0 * p.attended / p.registered, 1) end,
                            'responses', r.responses, 'response_rate', case when p.attended > 0 then round(100.0 * r.responses / p.attended, 1) end,
                            'recommend_avg', round(r.recommend, 2), 'recommend_n', r.recommend_n, 'useful_avg', round(r.useful, 2), 'clarity_avg', round(r.clarity, 2))
    from p, r;
$$;
revoke all on function public.rc_numbers(uuid) from public, anon, authenticated;

-- 檢討那一句。只有那場活動「改」以上的人（Director）與管的人。數字當下抄一份快照。
create or replace function public.rc_save_review(p_event uuid, p jsonb)
returns uuid language plpgsql security definer
set search_path = public, pg_temp
as $$
declare n jsonb;
begin
  if not public.rc_event_editor(p_event) then raise exception 'not_event_editor' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.events where id = p_event) then raise exception 'no_such_event' using errcode = 'P0001'; end if;
  n := public.rc_numbers(p_event);
  insert into public.rc_reviews (event_id, reviewed_on, attendance_rate, recommend_avg, useful_avg, responses, went_well, we_change, change_happened, owner_id, follow_up_event, updated_by)
  values (p_event, coalesce(nullif(p->>'reviewed_on', '')::date, current_date), (n->>'attendance_rate')::numeric, (n->>'recommend_avg')::numeric, (n->>'useful_avg')::numeric,
          coalesce((n->>'responses')::int, 0), coalesce(p->>'went_well', ''), coalesce(p->>'we_change', ''), (p->>'change_happened')::boolean,
          coalesce(nullif(p->>'owner_id', '')::uuid, auth.uid()), nullif(p->>'follow_up_event', '')::uuid, auth.uid())
  on conflict (event_id) do update set
    reviewed_on = coalesce(nullif(p->>'reviewed_on', '')::date, rc_reviews.reviewed_on),
    attendance_rate = (n->>'attendance_rate')::numeric, recommend_avg = (n->>'recommend_avg')::numeric, useful_avg = (n->>'useful_avg')::numeric, responses = coalesce((n->>'responses')::int, 0),
    went_well = case when p ? 'went_well' then coalesce(p->>'went_well', '') else rc_reviews.went_well end,
    we_change = case when p ? 'we_change' then coalesce(p->>'we_change', '') else rc_reviews.we_change end,
    change_happened = case when p ? 'change_happened' then (p->>'change_happened')::boolean else rc_reviews.change_happened end,
    owner_id = coalesce(nullif(p->>'owner_id', '')::uuid, rc_reviews.owner_id),
    follow_up_event = case when p ? 'follow_up_event' then nullif(p->>'follow_up_event', '')::uuid else rc_reviews.follow_up_event end,
    updated_by = auth.uid(), updated_at = now();
  perform public.rc_log_it('review', p_event, null, p);
  return p_event;
end $$;

-- 屆別：匯入舊活動用（2024-25 這種）。只有管的人；不碰 current 那一筆。
create or replace function public.rc_save_term(p_id text, p_title_zh text, p_title_en text, p_starts date, p_ends date)
returns text language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if not public.rc_can_manage() then raise exception 'not_records_manager' using errcode = 'P0001'; end if;
  if p_id !~ '^\d{4}-\d{2}$' then raise exception 'bad_term' using errcode = 'P0001'; end if;
  insert into public.terms (id, title_zh, title_en, starts_on, ends_on, status) values (p_id, p_title_zh, p_title_en, p_starts, p_ends, 'ended')
  on conflict (id) do update set title_zh = coalesce(excluded.title_zh, terms.title_zh), title_en = coalesce(excluded.title_en, terms.title_en);
  return p_id;
end $$;

-- 舊活動（沒走網站的）：管的人建一場 archived 的活動，掛在 custom:records 工作區，不上對外頁。
create or replace function public.rc_add_past_event(p jsonb)
returns uuid language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_id uuid; v_slug text := lower(trim(coalesce(p->>'slug', ''))); v_kind text := coalesce(nullif(p->>'kind', ''), 'other'); v_term text := nullif(p->>'term_id', '');
begin
  if not public.rc_can_manage() then raise exception 'not_records_manager' using errcode = 'P0001'; end if;
  if v_slug !~ '^[a-z0-9-]{2,40}$' then raise exception 'bad_slug' using errcode = 'P0001'; end if;
  if exists (select 1 from public.events where slug = v_slug) then raise exception 'slug_taken' using errcode = 'P0001'; end if;
  if v_term is not null and not exists (select 1 from public.terms where id = v_term) then raise exception 'no_such_term' using errcode = 'P0001'; end if;
  insert into public.events (slug, team, workspace_id, title_zh, title_en, starts_at, ends_at, place, status, kind, term_id, source, created_by)
  values (v_slug, coalesce(nullif(p->>'team', ''), ''), 'custom:records', coalesce(p->>'title_zh', ''), coalesce(p->>'title_en', ''),
          nullif(p->>'starts_at', '')::timestamptz, nullif(p->>'ends_at', '')::timestamptz, coalesce(p->>'place', ''), 'archived', v_kind, v_term, 'import', auth.uid())
  returning id into v_id;
  perform public.rc_log_it('event_import', v_id, null, p);
  return v_id;
end $$;

-- ---------- 13. 讀：總覽、一場、一個人、年度 ----------
create or replace function public.rc_event_card(e public.events)
returns jsonb language sql stable security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object('id', e.id, 'slug', e.slug, 'team', e.team, 'kind', e.kind, 'term_id', e.term_id, 'source', e.source, 'status', e.status,
                            'title_zh', e.title_zh, 'title_en', e.title_en, 'starts_at', e.starts_at, 'ends_at', e.ends_at, 'place', e.place,
                            'numbers', public.rc_numbers(e.id),
                            'review', (select jsonb_build_object('reviewed_on', r.reviewed_on, 'we_change', r.we_change, 'went_well', r.went_well, 'change_happened', r.change_happened,
                                                                 'owner', coalesce(public.tf_person(r.owner_id)->>'name', ''))
                                         from public.rc_reviews r where r.event_id = e.id),
                            'forms', (select count(*) from public.rc_forms f where f.event_id = e.id));
$$;
revoke all on function public.rc_event_card(public.events) from public, anon, authenticated;

create or replace function public.rc_bootstrap()
returns jsonb language plpgsql stable security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'cadre') then raise exception 'not_cadre' using errcode = 'P0001'; end if;
  return jsonb_build_object(
    'can_manage', public.rc_can_manage(),
    'can_view', public.rc_can_view(),
    'terms', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'title_zh', t.title_zh, 'title_en', t.title_en, 'status', t.status, 'starts_on', t.starts_on) order by t.starts_on desc) from public.terms t), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(public.rc_event_card(e) order by e.starts_at desc nulls last, e.created_at desc) from public.events e where public.rc_event_viewer(e.id)), '[]'::jsonb),
    'forms', coalesce((select jsonb_agg(public.rc_form_json(f.id) order by f.updated_at desc) from public.rc_forms f where public.rc_form_reader(f.id)), '[]'::jsonb),
    'duplicates', public.rc_duplicates(),
    'people', case when public.rc_can_manage() then
                coalesce((select jsonb_agg(public.tf_person(p.id) order by coalesce(nullif(p.name_en, ''), p.name_zh)) from public.profiles p where p.role = 'cadre'), '[]'::jsonb)
              else '[]'::jsonb end,
    'counts', case when public.rc_can_view() then jsonb_build_object(
                'people', (select count(*) from public.people where forgotten_at is null),
                'students', (select count(*) from public.people where kind = 'student' and forgotten_at is null),
                'participation', (select count(*) from public.rc_participation),
                'responses', (select count(*) from public.rc_responses),
                'pairs', (select count(*) from public.rc_pairs),
                'outcomes', (select count(*) from public.rc_outcomes)) else '{}'::jsonb end);
end $$;

-- 一場活動：記分卡、場次、出席名單、回饋表、留言（只有讀者看得到留言）、檢討。
create or replace function public.rc_event(p_event uuid)
returns jsonb language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare e public.events%rowtype; v_prev uuid;
begin
  if not public.rc_event_viewer(p_event) then raise exception 'not_event_viewer' using errcode = 'P0001'; end if;
  select * into e from public.events where id = p_event;
  if not found then raise exception 'no_such_event' using errcode = 'P0001'; end if;
  select id into v_prev from public.events x where x.kind = e.kind and x.id <> e.id and coalesce(x.starts_at, x.created_at) < coalesce(e.starts_at, e.created_at)
     and public.rc_event_viewer(x.id) order by coalesce(x.starts_at, x.created_at) desc limit 1;
  return jsonb_build_object(
    'event', public.rc_event_card(e),
    'can_edit', public.rc_event_editor(p_event),
    'previous', case when v_prev is null then null else public.rc_event_card((select x from public.events x where x.id = v_prev)) end,
    'sessions', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'ord', s.ord, 'title', s.title, 'starts_at', s.starts_at, 'ends_at', s.ends_at) order by s.ord) from public.rc_sessions s where s.event_id = p_event), '[]'::jsonb),
    'participation', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'person_id', x.person_id, 'name', public.rc_person_name(x.person_id),
                                   'school', (select school from public.people where id = x.person_id), 'role', x.role, 'status', x.status, 'source', x.source, 'session_id', x.session_id, 'note', x.note)
                                   order by x.role, public.rc_person_name(x.person_id)) from public.rc_participation x where x.event_id = p_event), '[]'::jsonb),
    'forms', coalesce((select jsonb_agg(public.rc_form_json(f.id) || jsonb_build_object('can_read', public.rc_form_reader(f.id)) order by f.created_at) from public.rc_forms f where f.event_id = p_event), '[]'::jsonb),
    'comments', coalesce((select jsonb_agg(jsonb_build_object('key', q.key, 'label', q.label, 'value', a.value, 'form_id', f.id) order by f.created_at, q.ord, md5(a.response_id::text))
                            from public.rc_forms f join public.rc_questions q on q.form_id = f.id join public.rc_answers a on a.question_id = q.id
                           where f.event_id = p_event and q.type in ('short', 'long') and public.rc_form_reader(f.id)), '[]'::jsonb),
    'scales', coalesce((select jsonb_agg(jsonb_build_object('key', s.key, 'label', s.label, 'avg', s.avg, 'n', s.n, 'max', s.max) order by s.ord)
                          from (select q.key, q.label, q.scale_max as max, min(q.ord) as ord, round(avg(a.value::numeric), 2) as avg, count(*) as n
                                  from public.rc_forms f join public.rc_questions q on q.form_id = f.id join public.rc_answers a on a.question_id = q.id
                                 where f.event_id = p_event and q.type = 'scale' and a.value ~ '^\d+$' group by q.key, q.label, q.scale_max) s), '[]'::jsonb),
    'pairs', coalesce((select jsonb_agg(jsonb_build_object('id', pr.id, 'mentor_id', pr.mentor_id, 'mentor', public.rc_person_name(pr.mentor_id), 'mentee_id', pr.mentee_id, 'mentee', public.rc_person_name(pr.mentee_id),
                                 'matched_on', pr.matched_on, 'ended_on', pr.ended_on, 'end_reason', pr.end_reason, 'note', pr.note) order by public.rc_person_name(pr.mentor_id))
                         from public.rc_pairs pr where pr.event_id = p_event and public.rc_can_view()), '[]'::jsonb),
    'review', (select jsonb_build_object('reviewed_on', r.reviewed_on, 'attendance_rate', r.attendance_rate, 'recommend_avg', r.recommend_avg, 'useful_avg', r.useful_avg, 'responses', r.responses,
                                         'went_well', r.went_well, 'we_change', r.we_change, 'change_happened', r.change_happened, 'owner_id', r.owner_id,
                                         'owner', coalesce(public.tf_person(r.owner_id)->>'name', ''), 'follow_up_event', r.follow_up_event, 'updated_at', r.updated_at)
                 from public.rc_reviews r where r.event_id = p_event));
end $$;

-- 一個人的時間軸：職位、出席、配對、去向、回饋（只有具名的、而且我是那一份的讀者）。看的人。
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
    'person', jsonb_build_object('id', pe.id, 'name', public.rc_person_name(pe.id), 'name_zh', pe.name_zh, 'name_en', pe.name_en, 'kind', pe.kind, 'school', pe.school,
                                 'grad_year', pe.grad_year, 'note', pe.note, 'has_account', pe.profile_id is not null, 'forgotten_at', pe.forgotten_at,
                                 'role', (select role from public.profiles where id = pe.profile_id)),
    'identities', case when public.rc_can_manage() then coalesce((select jsonb_agg(jsonb_build_object('kind', i.kind, 'value', i.value, 'source', i.source, 'verified', i.verified) order by i.kind, i.value) from public.rc_identities i where i.person_id = pe.id), '[]'::jsonb) else '[]'::jsonb end,
    'positions', coalesce((select jsonb_agg(jsonb_build_object('term', po.term_id, 'title_zh', po.title_zh, 'title_en', po.title_en, 'team', po.team) order by po.term_id desc) from public.positions po where po.person_id = pe.id), '[]'::jsonb),
    'participation', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'event_id', e.id, 'event', coalesce(nullif(e.title_zh, ''), e.title_en), 'kind', e.kind, 'term_id', e.term_id, 'starts_at', e.starts_at, 'role', x.role, 'status', x.status)
                                  order by e.starts_at desc nulls last) from public.rc_participation x join public.events e on e.id = x.event_id where x.person_id = pe.id), '[]'::jsonb),
    'pairs', coalesce((select jsonb_agg(jsonb_build_object('id', pr.id, 'event_id', pr.event_id, 'event', (select coalesce(nullif(e.title_zh, ''), e.title_en) from public.events e where e.id = pr.event_id),
                                 'as', case when pr.mentor_id = pe.id then 'mentor' else 'mentee' end,
                                 'with', public.rc_person_name(case when pr.mentor_id = pe.id then pr.mentee_id else pr.mentor_id end),
                                 'with_id', case when pr.mentor_id = pe.id then pr.mentee_id else pr.mentor_id end,
                                 'matched_on', pr.matched_on, 'ended_on', pr.ended_on, 'end_reason', pr.end_reason) order by pr.matched_on desc nulls last)
                         from public.rc_pairs pr where pr.mentor_id = pe.id or pr.mentee_id = pe.id), '[]'::jsonb),
    'outcomes', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'kind', o.kind, 'institution', o.institution, 'country', o.country, 'major', o.major, 'year', o.year, 'note', o.note,
                                 'source', o.source, 'visibility', o.visibility, 'recorded_at', o.recorded_at) order by o.year desc nulls last, o.recorded_at desc)
                           from public.rc_outcomes o where o.person_id = pe.id and (o.visibility <> 'private' or public.rc_can_manage())), '[]'::jsonb),
    'responses', coalesce((select jsonb_agg(jsonb_build_object('form_id', f.id, 'title', f.title, 'kind', f.kind, 'submitted_at', r.submitted_at,
                                 'answers', (select jsonb_agg(jsonb_build_object('key', q.key, 'label', q.label, 'value', a.value) order by q.ord) from public.rc_answers a join public.rc_questions q on q.id = a.question_id where a.response_id = r.id))
                                 order by r.submitted_at desc)
                            from public.rc_responses r join public.rc_forms f on f.id = r.form_id where r.person_id = pe.id and not f.anonymous and public.rc_form_reader(f.id)), '[]'::jsonb));
end $$;

-- 找人（看的人）：名字或 email 片段。最多 50 筆。
create or replace function public.rc_find_people(p_q text)
returns jsonb language sql stable security definer
set search_path = public, pg_temp
as $$
  select case when public.rc_can_view() then coalesce((
    select jsonb_agg(jsonb_build_object('id', pe.id, 'name', public.rc_person_name(pe.id), 'kind', pe.kind, 'school', pe.school, 'grad_year', pe.grad_year, 'has_account', pe.profile_id is not null) order by public.rc_person_name(pe.id))
      from (select * from public.people pe
             where pe.forgotten_at is null and (
               trim(coalesce(p_q, '')) = ''
               or pe.name_zh ilike '%' || trim(p_q) || '%' or pe.name_en ilike '%' || trim(p_q) || '%'
               or (public.rc_can_manage() and exists (select 1 from public.rc_identities i where i.person_id = pe.id and i.value ilike '%' || trim(p_q) || '%')))
             order by pe.created_at desc limit 50) pe), '[]'::jsonb) else '[]'::jsonb end;
$$;

-- 年度比較：每一屆、每一種活動一列。看的人。
create or replace function public.rc_yearly()
returns jsonb language sql stable security definer
set search_path = public, pg_temp
as $$
  select case when public.rc_can_view() then coalesce((
    select jsonb_agg(row_to_json(x)::jsonb order by x.term_id desc nulls last, x.kind) from (
      select e.term_id, e.kind, count(*) as events,
             sum((public.rc_numbers(e.id)->>'registered')::int) as registered,
             sum((public.rc_numbers(e.id)->>'attended')::int) as attended,
             sum((public.rc_numbers(e.id)->>'responses')::int) as responses,
             round(avg((public.rc_numbers(e.id)->>'recommend_avg')::numeric), 2) as recommend_avg,
             round(avg((public.rc_numbers(e.id)->>'useful_avg')::numeric), 2) as useful_avg,
             coalesce(jsonb_agg(jsonb_build_object('event', coalesce(nullif(e.title_zh, ''), e.title_en), 'we_change', r.we_change, 'change_happened', r.change_happened)) filter (where r.we_change <> ''), '[]'::jsonb) as changes
        from public.events e left join public.rc_reviews r on r.event_id = e.id
       where public.rc_event_viewer(e.id)
       group by e.term_id, e.kind) x), '[]'::jsonb) else '[]'::jsonb end;
$$;

-- ---------- 14. 授權 ----------
revoke all on function
  public.rc_save_person(uuid, jsonb), public.rc_merge_people(uuid, uuid), public.forget_person(uuid), public.rc_duplicates(),
  public.rc_save_event_meta(uuid, jsonb), public.rc_set_sessions(uuid, jsonb), public.rc_set_participation(uuid, jsonb), public.rc_remove_participation(uuid), public.rc_sync_event(uuid),
  public.rc_save_form(uuid, jsonb, jsonb), public.rc_set_audience(uuid, text, jsonb), public.rc_set_status(uuid, text), public.rc_delete_form(uuid),
  public.rc_import_responses(uuid, jsonb), public.rc_results(uuid),
  public.rc_save_pair(uuid, jsonb), public.rc_delete_pair(uuid), public.rc_save_outcome(uuid, jsonb), public.rc_delete_outcome(uuid), public.rc_my_outcomes(),
  public.rc_save_review(uuid, jsonb), public.rc_save_term(text, text, text, date, date), public.rc_add_past_event(jsonb),
  public.rc_bootstrap(), public.rc_event(uuid), public.rc_person(uuid), public.rc_find_people(text), public.rc_yearly()
  from public, anon;
grant execute on function
  public.rc_save_person(uuid, jsonb), public.rc_merge_people(uuid, uuid), public.forget_person(uuid), public.rc_duplicates(),
  public.rc_save_event_meta(uuid, jsonb), public.rc_set_sessions(uuid, jsonb), public.rc_set_participation(uuid, jsonb), public.rc_remove_participation(uuid), public.rc_sync_event(uuid),
  public.rc_save_form(uuid, jsonb, jsonb), public.rc_set_audience(uuid, text, jsonb), public.rc_set_status(uuid, text), public.rc_delete_form(uuid),
  public.rc_import_responses(uuid, jsonb), public.rc_results(uuid),
  public.rc_save_pair(uuid, jsonb), public.rc_delete_pair(uuid), public.rc_save_outcome(uuid, jsonb), public.rc_delete_outcome(uuid), public.rc_my_outcomes(),
  public.rc_save_review(uuid, jsonb), public.rc_save_term(text, text, text, date, date), public.rc_add_past_event(jsonb),
  public.rc_bootstrap(), public.rc_event(uuid), public.rc_person(uuid), public.rc_find_people(text), public.rc_yearly()
  to authenticated;
-- 不登入的填寫：只有這兩支開給 anon（跟 /apply/ 的 public_events 同一種做法）。
revoke all on function public.rc_public_form(text), public.rc_public_submit(text, jsonb, jsonb) from public;
grant execute on function public.rc_public_form(text), public.rc_public_submit(text, jsonb, jsonb) to anon, authenticated;

-- ---------- 15. roster() 只列成員 ----------
-- 照 2026-11-07 那一版抄，where 多一句 pe.kind = 'member'，maybe_dup 也只在成員裡找。回傳欄位一個都沒變。
create or replace function public.roster()
returns table (
  person_id uuid, profile_id uuid, name_zh text, name_en text, role text, board_role text, team text,
  positions jsonb, workspaces jsonb, note text, pending_code text, maybe_dup uuid[]
) language sql stable security definer
set search_path = public, pg_temp
as $$
  select pe.id, pe.profile_id,
         coalesce(pr.name_zh, pe.name_zh), coalesce(pr.name_en, pe.name_en),
         pr.role, pr.board_role, pr.team,
         coalesce((select jsonb_agg(jsonb_build_object('term', po.term_id, 'title_zh', po.title_zh, 'title_en', po.title_en, 'team', po.team)
                                    order by t.starts_on desc)
                     from positions po join terms t on t.id = po.term_id where po.person_id = pe.id), '[]'::jsonb),
         coalesce((select jsonb_agg(jsonb_build_object('id', a.workspace_id, 'level', a.level) order by a.workspace_id)
                     from assignments a where a.user_id = pe.profile_id), '[]'::jsonb),
         pe.note,
         (select c.code from invite_codes c where c.person_id = pe.id and c.uses_left > 0 and c.email is null and c.revoked_at is null limit 1),
         (select array_agg(o.id) from people o
           where o.id <> pe.id and o.kind = 'member' and pe.name_en is not null and lower(o.name_en) = lower(pe.name_en))
    from people pe left join profiles pr on pr.id = pe.profile_id
   where public.is_senior() and pe.kind = 'member'
   order by (pr.role = 'cadre') desc nulls last, pr.board_role, coalesce(pr.name_en, pe.name_en);
$$;
revoke all on function public.roster() from public, anon;
grant execute on function public.roster() to authenticated;

-- ---------- 16. my_access() 多一格 records ----------
-- 照 2026-11-29 那一版抄，finance 與 team-forms 原樣留著，後面接 records（管是 edit、看是 view）。
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
          select a.workspace_id as id, a.level from assignments a where a.user_id = p.id
          union
          select w.id, 'manage' from workspaces w where w.owner = p.id and w.active
        ) x join workspaces w on w.id = x.id
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
revoke all on function public.my_access() from public, anon;
grant execute on function public.my_access() to authenticated;

commit;

-- ---------- 驗收 ----------
select * from (
  with t as (
    select (select count(*) from pg_tables where schemaname = 'public' and tablename in ('rc_identities', 'rc_sessions', 'rc_participation', 'rc_forms', 'rc_questions', 'rc_audience', 'rc_responses', 'rc_answers', 'rc_pairs', 'rc_outcomes', 'rc_reviews', 'rc_log')) as tables,
           (select count(*) from pg_tables where schemaname = 'public' and tablename like 'rc\_%' and rowsecurity) as rls_on,
           (select count(*) from pg_policies where schemaname = 'public' and tablename like 'rc\_%') as pols,
           (select bool_and(not has_table_privilege(r, 'public.' || tb, pr))
              from unnest(array['anon', 'authenticated']) r,
                   unnest(array['rc_identities', 'rc_sessions', 'rc_participation', 'rc_forms', 'rc_questions', 'rc_audience', 'rc_responses', 'rc_answers', 'rc_pairs', 'rc_outcomes', 'rc_reviews', 'rc_log']) tb,
                   unnest(array['select', 'insert', 'update', 'delete']) pr) as no_table_priv,
           (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname like 'rc\_%' and has_function_privilege('anon', p.oid, 'execute')) as anon_fns,
           (select count(*) from pg_proc where pronamespace = 'public'::regnamespace
              and proname in ('rc_save_person', 'rc_merge_people', 'rc_import_responses', 'rc_save_pair', 'rc_delete_pair', 'rc_save_term', 'rc_add_past_event')
              and regexp_replace(prosrc, '--[^\n]*', '', 'g') ~ 'not public\.rc_can_manage\(\)') as manage_gates,
           (select count(*) from pg_proc where pronamespace = 'public'::regnamespace
              and proname in ('rc_save_event_meta', 'rc_set_sessions', 'rc_set_participation', 'rc_save_review')
              and regexp_replace(prosrc, '--[^\n]*', '', 'g') ~ 'not public\.rc_event_editor\(') as event_gates,
           (select count(*) from pg_proc where pronamespace = 'public'::regnamespace
              and proname in ('rc_save_form', 'rc_set_audience', 'rc_set_status')
              and regexp_replace(prosrc, '--[^\n]*', '', 'g') ~ 'not public\.rc_form_editor\(') as form_gates,
           (select regexp_replace(prosrc, '--[^\n]*', '', 'g') ~ 'not public\.rc_form_reader\(' from pg_proc where proname = 'rc_results' and pronamespace = 'public'::regnamespace) as results_gate,
           (select regexp_replace(prosrc, '--[^\n]*', '', 'g') ~ 'pair-%' from pg_proc where proname = 'rc_form_reader' and pronamespace = 'public'::regnamespace) as pair_rule,
           (select regexp_replace(prosrc, '--[^\n]*', '', 'g') like '%mentor_cannot_read%' from pg_proc where proname = 'rc_set_audience' and pronamespace = 'public'::regnamespace) as mentor_rule,
           (select regexp_replace(prosrc, '--[^\n]*', '', 'g') like '%anonymous_locked%' from pg_proc where proname = 'rc_save_form' and pronamespace = 'public'::regnamespace) as anon_lock,
           (select regexp_replace(prosrc, '--[^\n]*', '', 'g') ~ 'when f\.anonymous then' from pg_proc where proname = 'rc_results' and pronamespace = 'public'::regnamespace) as anon_hide,
           (select regexp_replace(prosrc, '--[^\n]*', '', 'g') like '%require_president()%' and regexp_replace(prosrc, '--[^\n]*', '', 'g') like '%has_account%' from pg_proc where proname = 'forget_person' and pronamespace = 'public'::regnamespace) as forget_rule,
           (select regexp_replace(prosrc, '--[^\n]*', '', 'g') ~ 'pe\.kind = ''member''' from pg_proc where proname = 'roster' and pronamespace = 'public'::regnamespace) as roster_members,
           (select prosrc like '%records%' and prosrc like '%team-forms%' and prosrc like '%finance%' from pg_proc where proname = 'my_access' and pronamespace = 'public'::regnamespace) as access_cell,
           (select regexp_replace(prosrc, '--[^\n]*', '', 'g') like '%too_many%' from pg_proc where proname = 'rc_public_submit' and pronamespace = 'public'::regnamespace) as flood_rule,
           (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname in ('rc_save_outcome', 'rc_delete_outcome')
              and regexp_replace(prosrc, '--[^\n]*', '', 'g') ~ 'coalesce\(v_person = ') as self_gates,
           exists (select 1 from public.workspaces where id = 'custom:records' and kind = 'custom') as ws_ok,
           exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'people' and column_name = 'kind') as people_kind,
           exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'tf_questions' and column_name = 'key') as tf_key
  )
  select 0 ord, 'OVERALL' as 項目, null::text as 應該是, null::text as 實際是,
    case when tables = 12 and rls_on = 12 and pols = 0 and no_table_priv and anon_fns = 2 and manage_gates = 7 and event_gates = 4 and form_gates = 3
          and results_gate and pair_rule and mentor_rule and anon_lock and anon_hide and forget_rule and roster_members and access_cell and flood_rule and self_gates = 2 and ws_ok and people_kind and tf_key
         then 'PASS' else 'FAIL' end as 結果 from t
  union all select 1,  '★ 十二張 rc_ 表在', '12', tables::text, case when tables = 12 then 'PASS' else 'FAIL' end from t
  union all select 2,  '★ 十二張表都開 RLS、零條政策（讀寫一律走函式）', '12 / 0', rls_on::text || ' / ' || pols::text, case when rls_on = 12 and pols = 0 then 'PASS' else 'FAIL' end from t
  union all select 3,  '★ anon 與登入的人對十二張表沒有任何直接權限', 'true', no_table_priv::text, case when no_table_priv then 'PASS' else 'FAIL' end from t
  union all select 4,  '★ anon 只叫得到兩支（rc_public_form、rc_public_submit）', '2', anon_fns::text, case when anon_fns = 2 then 'PASS' else 'FAIL' end from t
  union all select 5,  '★ 七支只有管的人能用的函式都先問 rc_can_manage', '7', manage_gates::text, case when manage_gates = 7 then 'PASS' else 'FAIL' end from t
  union all select 6,  '★ 四支改活動的函式都先問 rc_event_editor', '4', event_gates::text, case when event_gates = 4 then 'PASS' else 'FAIL' end from t
  union all select 7,  '★ 三支改表單的函式都先問 rc_form_editor', '3', form_gates::text, case when form_gates = 3 then 'PASS' else 'FAIL' end from t
  union all select 8,  '★ 看原始答案先問 rc_form_reader', 'true', results_gate::text, case when results_gate then 'PASS' else 'FAIL' end from t
  union all select 9,  '★ 配對回饋（pair-*）Senior Adviser 與活動工作區都讀不到', 'true', pair_rule::text, case when pair_rule then 'PASS' else 'FAIL' end from t
  union all select 10, '★ mentor 加不進配對回饋的讀者名單（mentor_cannot_read）', 'true', mentor_rule::text, case when mentor_rule then 'PASS' else 'FAIL' end from t
  union all select 11, '★ 有人填過之後不能從匿名改回具名（anonymous_locked）', 'true', anon_lock::text, case when anon_lock then 'PASS' else 'FAIL' end from t
  union all select 12, '★ 匿名的表單結果不回名字', 'true', anon_hide::text, case when anon_hide then 'PASS' else 'FAIL' end from t
  union all select 13, '★ forget_person 只有 Co-President，有帳號的先刪帳號（has_account）', 'true', forget_rule::text, case when forget_rule then 'PASS' else 'FAIL' end from t
  union all select 14, '★ roster() 只列成員，學員不會跑進幹部名單', 'true', roster_members::text, case when roster_members then 'PASS' else 'FAIL' end from t
  union all select 15, '★ my_access() 有 records 那一格，finance 與 team-forms 還在', 'true', access_cell::text, case when access_cell then 'PASS' else 'FAIL' end from t
  union all select 16, '不登入的送出一小時最多 200 份（too_many）', 'true', flood_rule::text, case when flood_rule then 'PASS' else 'FAIL' end from t
  union all select 17, '工作區 custom:records 在', 'true', ws_ok::text, case when ws_ok then 'PASS' else 'FAIL' end from t
  union all select 19, '★ 本人填去向的門用 coalesce（沒有名單那一列的人 null = uuid 不會放行）', '2', self_gates::text, case when self_gates = 2 then 'PASS' else 'FAIL' end from t
  union all select 18, 'people 多了 kind 欄、tf_questions 多了 key 欄', 'true', (people_kind and tf_key)::text, case when people_kind and tf_key then 'PASS' else 'FAIL' end from t
) x order by ord;
