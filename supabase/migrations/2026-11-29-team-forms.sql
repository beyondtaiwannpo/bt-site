-- 內部表單（給幹部填的表單，像 Tally）　2026-11-29
--
-- 用法：整份貼進 Supabase SQL Editor 按一次 Run。可以重跑，不會動既有資料。最後印一張 PASS / FAIL 表。
-- **要先跑過 2026-11-28-college-research.sql**（順序照日期；這一支用到 2026-10-24 的 assignments、workspaces、
-- 2026-09-08 的 is_president()、2026-11-08 的 can_view_finance() / can_edit_finance()）。
-- ⚠ 這一支**重新定義了 my_access()**（在 finance 那一格後面多一格 team-forms）。之後重跑 2026-10-24 或 2026-11-08，
--   記得再跑一次這一支，不然側欄的「內部表單 → 建表單與看結果」會不見。
--
-- Paul 2026-11-05：「I need to build a internal form for all of us, it will come from co-president to all members like a tally form」，
-- 接著「make everything changeable like who's able to read, sending it out to who, all that」。
--
-- ============================================================================
-- 為什麼不沿用申請表（forms / applications）
-- ============================================================================
-- 申請表是給外面的高中生的：開放中的表單**沒登入的人也讀得到**（/apply/ 是對外頁），
-- 答案給「申請」工作區裡的每一個人看。這裡的答案是幹部對自己 team、對 Director 與 Adviser 的真心話，
-- 可見範圍剛好相反：預設只有 Co-President 看得到。在申請那一套裡開例外要改六條政策、五支函式，
-- 那是整個 repo 最敏感的一條界線，改錯一次兩邊一起漏。所以另開五張表，寫法照申請表（題目、一人一份、答案存文字）。
--
-- ============================================================================
-- 誰能做什麼（每一份表單自己設，Paul：「everything changeable」）
-- ============================================================================
--   每一份表單有三張名單，存在 tf_audience，每一列是「誰」：
--     recipient 填的人、reader 看得到所有人答案的人、editor 改得動這份表單的人。
--     「誰」有四種寫法：all（全部幹部）、rank（一個職級）、team（一個 team）、person（一個人）。
--   **Co-President 永遠是讀者與編輯**，表單的建立者（owner）也是。其他人一律照名單。
--   誰能「建」新表單：Co-President，加上被派進工作區 custom:team-forms 的人（任何等級）。
--     Paul 在「人與權限 → 誰能改什麼」加人減人。**Senior Adviser 不自動有**，要被加進去，
--     因為建立者讀得到自己那份的所有答案。
--   改「誰能改這份表單」（editor 名單）只有建立者與 Co-President；editor 名單不收 all。
--   匿名：讀者看不到是誰寫的。**已經有人填過之後不能從匿名改回具名**（anonymous_locked），
--     不然一個開關就把「這是匿名的」那句承諾收回去了。從具名改成匿名隨時可以。
--   每一次改名單、改狀態、改匿名都記一筆 tf_log（誰、什麼時候、前後值），編輯者看得到。
--
-- ============================================================================
-- 這一支在做什麼
-- ============================================================================
--   1. 工作區 custom:team-forms（誰能建表單），擁有人是一位 Co-President。
--   2. 六張表：tf_forms、tf_questions（短答、長答、單選、多選、1 到 N 的量表）、tf_audience、
--      tf_responses（一人一份，存送出當下的名字與 team）、tf_answers（一律存文字，多選用換行分隔）、tf_log。
--   3. 六張表都開 RLS 而且**一條政策都沒有**、anon 與 authenticated 的表權限全部收回。
--      讀和寫一律走下面的函式，每一支第一句先問門。
--   4. 門：tf_can_create()、tf_is_editor(表單)、tf_is_reader(表單)、tf_is_recipient(表單)。
--   5. 函式：tf_bootstrap、tf_todo、tf_form_admin、tf_save_form、tf_set_audience、tf_set_status、tf_delete_form、
--      tf_fill、tf_submit、tf_results、tf_import（匯入 Tally 匯出的 CSV，瀏覽器解析，資料庫只收列）、tf_link_response。
--   6. my_access() 多一格 team-forms：建得了是 edit，只是某一份的讀者或編輯是 view。
-- ============================================================================

begin;

-- ---------- 1. 誰能建表單的工作區 ----------
do $$
declare v_owner uuid;
begin
  select id into v_owner from public.profiles where role = 'cadre' and board_role = 'president' order by updated_at limit 1;
  insert into public.workspaces (id, kind, team, title_zh, title_en, owner)
  values ('custom:team-forms', 'custom', null, '內部表單（誰能建）', 'Team forms (who can create)', v_owner)
  on conflict (id) do nothing;
end $$;

-- ---------- 2. 六張表 ----------
create table if not exists public.tf_forms (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (title <> ''),
  intro       text not null default '',
  status      text not null default 'draft' check (status in ('draft', 'open', 'closed')),
  closes_at   timestamptz,
  allow_edit  boolean not null default false,
  anonymous   boolean not null default false,
  owner       uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
comment on table public.tf_forms is
  '內部表單（給幹部填）。draft 只有編輯者看得到；open 收答案；closed 不收但填過的人還看得到自己的。
   allow_edit：收答案期間可以回去改自己的。anonymous：讀者看不到是誰寫的，有人填過之後不能改回具名。';

create table if not exists public.tf_questions (
  id         uuid primary key default gen_random_uuid(),
  form_id    uuid not null references public.tf_forms(id) on delete cascade,
  ord        smallint not null,
  label      text not null check (label <> ''),
  help       text not null default '',
  type       text not null check (type in ('short', 'long', 'single', 'multi', 'scale')),
  required   boolean not null default false,
  options    text[] not null default '{}',
  scale_min  smallint not null default 1,
  scale_max  smallint not null default 5,
  min_label  text not null default '',
  max_label  text not null default ''
);
create index if not exists tf_questions_form on public.tf_questions (form_id, ord);
comment on column public.tf_questions.type is
  'short 短答、long 長答、single 單選、multi 多選、scale 量表（scale_min 到 scale_max 的整數，兩端可以各寫一句）。';

create table if not exists public.tf_audience (
  form_id  uuid not null references public.tf_forms(id) on delete cascade,
  role     text not null check (role in ('recipient', 'reader', 'editor')),
  kind     text not null check (kind in ('all', 'rank', 'team', 'person')),
  value    text not null default '',
  primary key (form_id, role, kind, value)
);
comment on table public.tf_audience is
  '每一份表單的三張名單。recipient 填、reader 讀所有答案、editor 改表單。
   kind：all 全部幹部（value 空）、rank 職級（member / adviser / director / senior_adviser / president）、
   team 一個 team 的名字、person 一個人的 profile id。Co-President 與建立者不用寫在這裡，永遠是讀者與編輯。';

create table if not exists public.tf_responses (
  id            uuid primary key default gen_random_uuid(),
  form_id       uuid not null references public.tf_forms(id) on delete cascade,
  user_id       uuid references public.profiles(id) on delete set null,
  name          text not null default '',
  team          text not null default '',
  typed_name    text not null default '',
  source        text not null default 'site' check (source in ('site', 'import')),
  submitted_at  timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
-- 一個人對一份表單只有一份。匯入的列對不到人時 user_id 是 null，不受這一條限制。
create unique index if not exists tf_responses_one on public.tf_responses (form_id, user_id) where user_id is not null;
comment on column public.tf_responses.name is '送出當下的名字（快照）。對不到人的匯入列就是 CSV 上打的名字。';
comment on column public.tf_responses.typed_name is '匯入時 CSV 上打的名字，原樣留著，之後對錯人可以查回來。';

create table if not exists public.tf_answers (
  response_id  uuid not null references public.tf_responses(id) on delete cascade,
  question_id  uuid not null references public.tf_questions(id) on delete cascade,
  value        text not null default '',
  primary key (response_id, question_id)
);

create table if not exists public.tf_log (
  id       bigserial primary key,
  form_id  uuid references public.tf_forms(id) on delete cascade,
  who      uuid,
  at       timestamptz not null default now(),
  what     text not null,
  before   jsonb,
  after    jsonb
);
create index if not exists tf_log_form on public.tf_log (form_id, at desc);

-- ---------- 3. 鎖起來：RLS 開著、一條政策都沒有、表權限全部收回 ----------
alter table public.tf_forms     enable row level security;
alter table public.tf_questions enable row level security;
alter table public.tf_audience  enable row level security;
alter table public.tf_responses enable row level security;
alter table public.tf_answers   enable row level security;
alter table public.tf_log       enable row level security;
revoke all on public.tf_forms, public.tf_questions, public.tf_audience, public.tf_responses, public.tf_answers, public.tf_log
  from public, anon, authenticated;
revoke all on sequence public.tf_log_id_seq from public, anon, authenticated;

-- ---------- 4. 門 ----------
-- 一個人符不符合名單上的一列。team 欄可能是逗號字串（一個人在好幾個 team）。
create or replace function public.tf_match(p_uid uuid, p_kind text, p_value text)
returns boolean language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles p
     where p.id = p_uid and p.role = 'cadre'
       and (p_kind = 'all'
         or (p_kind = 'rank' and p.board_role = p_value)
         or (p_kind = 'team' and exists (
               select 1 from regexp_split_to_table(coalesce(p.team, ''), '\s*[,、;；]\s*') t
                where t <> '' and lower(trim(t)) = lower(trim(p_value))))
         or (p_kind = 'person' and p.id::text = p_value)));
$$;
create or replace function public.tf_in(p_form uuid, p_role text, p_uid uuid)
returns boolean language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from public.tf_audience a where a.form_id = p_form and a.role = p_role
                    and public.tf_match(p_uid, a.kind, a.value));
$$;
create or replace function public.tf_is_cadre()
returns boolean language sql stable security definer
set search_path = public, pg_temp
as $$ select exists (select 1 from public.profiles where id = auth.uid() and role = 'cadre'); $$;

-- 建得了新表單：Co-President，或被派進 custom:team-forms（任何等級），或那個工作區的擁有人。
-- **不用 can_view()**：can_view 對 Senior Adviser 一律回 true，而這一格 Paul 要能自己決定。
create or replace function public.tf_can_create()
returns boolean language sql stable security definer
set search_path = public, pg_temp
as $$
  select public.tf_is_cadre() and (
    public.is_president()
    or exists (select 1 from public.assignments a where a.workspace_id = 'custom:team-forms' and a.user_id = auth.uid())
    or exists (select 1 from public.workspaces w where w.id = 'custom:team-forms' and w.owner = auth.uid() and w.active));
$$;
create or replace function public.tf_is_editor(p_form uuid)
returns boolean language sql stable security definer
set search_path = public, pg_temp
as $$
  select public.tf_is_cadre() and (
    public.is_president()
    or exists (select 1 from public.tf_forms f where f.id = p_form and f.owner = auth.uid())
    or public.tf_in(p_form, 'editor', auth.uid()));
$$;
create or replace function public.tf_is_reader(p_form uuid)
returns boolean language sql stable security definer
set search_path = public, pg_temp
as $$
  select public.tf_is_editor(p_form) or (public.tf_is_cadre() and public.tf_in(p_form, 'reader', auth.uid()));
$$;
create or replace function public.tf_is_recipient(p_form uuid)
returns boolean language sql stable security definer
set search_path = public, pg_temp
as $$ select public.tf_is_cadre() and public.tf_in(p_form, 'recipient', auth.uid()); $$;

-- 填的名單上現在有誰（給「誰還沒填」與人數用）。
create or replace function public.tf_recipient_ids(p_form uuid)
returns setof uuid language sql stable security definer
set search_path = public, pg_temp
as $$
  select p.id from public.profiles p where p.role = 'cadre' and public.tf_in(p_form, 'recipient', p.id);
$$;

create or replace function public.tf_person(p_uid uuid)
returns jsonb language sql stable security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object('id', p.id, 'name', coalesce(nullif(trim(p.name_en), ''), nullif(trim(p.name_zh), ''), ''),
                            'name_zh', coalesce(p.name_zh, ''), 'name_en', coalesce(p.name_en, ''),
                            'team', coalesce(p.team, ''), 'rank', coalesce(p.board_role, 'member'))
    from public.profiles p where p.id = p_uid;
$$;

revoke all on function public.tf_match(uuid, text, text), public.tf_in(uuid, text, uuid), public.tf_is_cadre(),
  public.tf_can_create(), public.tf_is_editor(uuid), public.tf_is_reader(uuid), public.tf_is_recipient(uuid),
  public.tf_recipient_ids(uuid), public.tf_person(uuid) from public, anon, authenticated;
grant execute on function public.tf_can_create(), public.tf_is_editor(uuid), public.tf_is_reader(uuid), public.tf_is_recipient(uuid) to authenticated;

-- ---------- 5. 讀的函式 ----------
-- 首頁的那一張卡：開著、還沒截止、我在填的名單上、我還沒填。
create or replace function public.tf_todo()
returns jsonb language sql stable security definer
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'title', f.title, 'closes_at', f.closes_at) order by f.closes_at nulls last, f.created_at), '[]'::jsonb)
    from public.tf_forms f
   where public.tf_is_recipient(f.id)
     and f.status = 'open' and (f.closes_at is null or f.closes_at > now())
     and not exists (select 1 from public.tf_responses r where r.form_id = f.id and r.user_id = auth.uid());
$$;

create or replace function public.tf_bootstrap()
returns jsonb language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare v_create boolean; v_manage jsonb; v_people jsonb := '[]'::jsonb;
begin
  if not public.tf_is_cadre() then raise exception 'not_cadre' using errcode = 'P0001'; end if;
  v_create := public.tf_can_create();
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', f.id, 'title', f.title, 'status', f.status, 'closes_at', f.closes_at, 'anonymous', f.anonymous,
           'role', case when public.tf_is_editor(f.id) then 'editor' else 'reader' end,
           'owner_name', coalesce((select public.tf_person(f.owner)->>'name'), ''),
           'responses', (select count(*) from public.tf_responses r where r.form_id = f.id),
           'recipients', (select count(*) from public.tf_recipient_ids(f.id)),
           'updated_at', f.updated_at) order by f.updated_at desc), '[]'::jsonb)
    into v_manage
    from public.tf_forms f where public.tf_is_reader(f.id);
  -- 選人用的名單：建得了表單或編得了某一份的人才拿得到（名字、team、職級，沒有 email）。
  if v_create or exists (select 1 from public.tf_forms f where public.tf_is_editor(f.id)) then
    select coalesce(jsonb_agg(public.tf_person(p.id) order by coalesce(nullif(p.name_en, ''), p.name_zh)), '[]'::jsonb)
      into v_people from public.profiles p where p.role = 'cadre';
  end if;
  return jsonb_build_object(
    'can_create', v_create,
    'todo', public.tf_todo(),
    'mine', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'title', f.title, 'status', f.status,
                         'submitted_at', r.submitted_at, 'updated_at', r.updated_at,
                         'can_change', f.allow_edit and f.status = 'open' and (f.closes_at is null or f.closes_at > now()))
                         order by r.submitted_at desc)
                        from public.tf_responses r join public.tf_forms f on f.id = r.form_id
                       where r.user_id = auth.uid()), '[]'::jsonb),
    'manage', v_manage,
    'people', v_people);
end $$;

create or replace function public.tf_questions_json(p_form uuid)
returns jsonb language sql stable security definer
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', q.id, 'ord', q.ord, 'label', q.label, 'help', q.help, 'type', q.type,
                    'required', q.required, 'options', to_jsonb(q.options), 'scale_min', q.scale_min, 'scale_max', q.scale_max,
                    'min_label', q.min_label, 'max_label', q.max_label,
                    'answered', exists (select 1 from public.tf_answers a where a.question_id = q.id)) order by q.ord, q.id), '[]'::jsonb)
    from public.tf_questions q where q.form_id = p_form;
$$;
create or replace function public.tf_form_json(p_form uuid)
returns jsonb language sql stable security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object('id', f.id, 'title', f.title, 'intro', f.intro, 'status', f.status, 'closes_at', f.closes_at,
                            'allow_edit', f.allow_edit, 'anonymous', f.anonymous, 'owner', f.owner,
                            'owner_name', coalesce((select public.tf_person(f.owner)->>'name'), ''),
                            'created_at', f.created_at, 'updated_at', f.updated_at)
    from public.tf_forms f where f.id = p_form;
$$;
revoke all on function public.tf_questions_json(uuid), public.tf_form_json(uuid) from public, anon, authenticated;

-- 編輯畫面：表單、題目、三張名單、紀錄。讀者也叫得到（看設定，不能改）。
create or replace function public.tf_form_admin(p_form uuid)
returns jsonb language plpgsql stable security definer
set search_path = public, pg_temp
as $$
begin
  if not public.tf_is_reader(p_form) then raise exception 'not_form_reader' using errcode = 'P0001'; end if;
  return jsonb_build_object(
    'form', public.tf_form_json(p_form),
    'questions', public.tf_questions_json(p_form),
    'audience', coalesce((select jsonb_agg(jsonb_build_object('role', a.role, 'kind', a.kind, 'value', a.value) order by a.role, a.kind, a.value)
                            from public.tf_audience a where a.form_id = p_form), '[]'::jsonb),
    'can_edit', public.tf_is_editor(p_form),
    'can_edit_editors', public.is_president() or exists (select 1 from public.tf_forms f where f.id = p_form and f.owner = auth.uid()),
    'responses', (select count(*) from public.tf_responses r where r.form_id = p_form),
    'recipients', (select count(*) from public.tf_recipient_ids(p_form)),
    'log', coalesce((select jsonb_agg(jsonb_build_object('at', l.at, 'what', l.what, 'who', coalesce(public.tf_person(l.who)->>'name', ''),
                                                         'before', l.before, 'after', l.after) order by l.at desc)
                       from (select * from public.tf_log where form_id = p_form order by at desc limit 50) l), '[]'::jsonb));
end $$;

-- 填的畫面：我在填的名單上（而且不是草稿），或我是讀者（預覽）。回表單、題目、我自己的答案。
create or replace function public.tf_fill(p_form uuid)
returns jsonb language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare f public.tf_forms%rowtype; v_rec boolean; v_read boolean; r public.tf_responses%rowtype;
begin
  select * into f from public.tf_forms where id = p_form;
  if not found then raise exception 'form_not_found' using errcode = 'P0001'; end if;
  v_rec := public.tf_is_recipient(p_form);
  v_read := public.tf_is_reader(p_form);
  select * into r from public.tf_responses where form_id = p_form and user_id = auth.uid();
  if not (v_read or r.id is not null or (v_rec and f.status <> 'draft')) then
    raise exception 'not_for_you' using errcode = 'P0001';
  end if;
  return jsonb_build_object(
    'form', public.tf_form_json(p_form) - 'owner',
    'questions', public.tf_questions_json(p_form),
    'preview', not v_rec,
    'mine', case when r.id is null then null else jsonb_build_object('submitted_at', r.submitted_at, 'updated_at', r.updated_at,
              'answers', coalesce((select jsonb_object_agg(a.question_id, a.value) from public.tf_answers a where a.response_id = r.id), '{}'::jsonb)) end,
    'can_submit', v_rec and f.status = 'open' and (f.closes_at is null or f.closes_at > now()) and (r.id is null or f.allow_edit));
end $$;

-- 結果：只有讀者。匿名的表單不回名字、team、帳號，日期只到哪一天。
create or replace function public.tf_results(p_form uuid)
returns jsonb language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare f public.tf_forms%rowtype;
begin
  if not public.tf_is_reader(p_form) then raise exception 'not_form_reader' using errcode = 'P0001'; end if;
  select * into f from public.tf_forms where id = p_form;
  return jsonb_build_object(
    'form', public.tf_form_json(p_form),
    'questions', public.tf_questions_json(p_form),
    'can_edit', public.tf_is_editor(p_form),
    'responses', coalesce((select jsonb_agg(case when f.anonymous then
                      jsonb_build_object('id', r.id, 'name', '', 'team', '', 'user_id', null, 'source', r.source,
                                         'submitted_at', to_char(r.submitted_at at time zone 'Asia/Taipei', 'YYYY-MM-DD'),
                                         'answers', coalesce((select jsonb_object_agg(a.question_id, a.value) from public.tf_answers a where a.response_id = r.id), '{}'::jsonb))
                    else
                      jsonb_build_object('id', r.id, 'name', r.name, 'team', r.team, 'user_id', r.user_id, 'typed_name', r.typed_name,
                                         'source', r.source, 'submitted_at', r.submitted_at, 'updated_at', r.updated_at,
                                         'answers', coalesce((select jsonb_object_agg(a.question_id, a.value) from public.tf_answers a where a.response_id = r.id), '{}'::jsonb))
                    end order by case when f.anonymous then md5(r.id::text) else to_char(r.submitted_at, 'YYYYMMDDHH24MISSUS') end)
                  from public.tf_responses r where r.form_id = p_form), '[]'::jsonb),
    'pending', coalesce((select jsonb_agg(public.tf_person(x.id) order by public.tf_person(x.id)->>'name')
                  from public.tf_recipient_ids(p_form) x(id)
                 where not exists (select 1 from public.tf_responses r where r.form_id = p_form and r.user_id = x.id)), '[]'::jsonb),
    'recipients', (select count(*) from public.tf_recipient_ids(p_form)));
end $$;

-- ---------- 6. 寫的函式 ----------
create or replace function public.tf_log_it(p_form uuid, p_what text, p_before jsonb, p_after jsonb)
returns void language sql security definer
set search_path = public, pg_temp
as $$ insert into public.tf_log (form_id, who, what, before, after) values (p_form, auth.uid(), p_what, p_before, p_after); $$;
revoke all on function public.tf_log_it(uuid, text, jsonb, jsonb) from public, anon, authenticated;

-- 新建（p_form 為 null）或存。p_data：{ title, intro, closes_at, allow_edit, anonymous }。
-- p_questions：整份題目的清單（照順序），舊題目帶 id。不在清單裡的舊題目會刪掉，**有人答過的刪不了**（question_has_answers），
-- 有人答過的也不能換題型（question_type_locked），改字可以。p_questions 傳 null 就不動題目。
create or replace function public.tf_save_form(p_form uuid, p_data jsonb, p_questions jsonb)
returns uuid language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid; v_old public.tf_forms%rowtype; v_has int := 0; v_anon boolean; v_title text;
  q jsonb; i int := 0; v_qid uuid; v_keep uuid[] := '{}'; v_type text; v_opts text[]; v_min int; v_max int; v_prev public.tf_questions%rowtype;
begin
  v_title := trim(coalesce(p_data->>'title', ''));
  if p_form is null then
    if not public.tf_can_create() then raise exception 'not_form_creator' using errcode = 'P0001'; end if;
    if v_title = '' then raise exception 'need_title' using errcode = 'P0001'; end if;
    insert into public.tf_forms (title, owner) values (v_title, auth.uid()) returning id into v_id;
    select * into v_old from public.tf_forms where id = v_id;
    perform public.tf_log_it(v_id, 'create', null, jsonb_build_object('title', v_title));
  else
    if not public.tf_is_editor(p_form) then raise exception 'not_form_editor' using errcode = 'P0001'; end if;
    select * into v_old from public.tf_forms where id = p_form for update;
    if not found then raise exception 'form_not_found' using errcode = 'P0001'; end if;
    v_id := p_form;
    if p_data ? 'title' and v_title = '' then raise exception 'need_title' using errcode = 'P0001'; end if;
  end if;
  select count(*) into v_has from public.tf_responses where form_id = v_id;
  v_anon := coalesce((p_data->>'anonymous')::boolean, v_old.anonymous);
  if v_old.anonymous and not v_anon and v_has > 0 then raise exception 'anonymous_locked' using errcode = 'P0001'; end if;
  if v_anon is distinct from v_old.anonymous then
    perform public.tf_log_it(v_id, 'anonymous', to_jsonb(v_old.anonymous), to_jsonb(v_anon));
  end if;
  update public.tf_forms set
    title      = case when p_data ? 'title' then v_title else title end,
    intro      = case when p_data ? 'intro' then coalesce(p_data->>'intro', '') else intro end,
    closes_at  = case when p_data ? 'closes_at' then nullif(p_data->>'closes_at', '')::timestamptz else closes_at end,
    allow_edit = coalesce((p_data->>'allow_edit')::boolean, allow_edit),
    anonymous  = v_anon,
    updated_at = now()
  where id = v_id;

  if p_questions is not null then
    if jsonb_typeof(p_questions) <> 'array' then raise exception 'bad_questions' using errcode = 'P0001'; end if;
    for q in select value from jsonb_array_elements(p_questions) loop
      i := i + 1;
      v_type := coalesce(q->>'type', '');
      if v_type not in ('short', 'long', 'single', 'multi', 'scale') then raise exception 'bad_question_type:%', i using errcode = 'P0001'; end if;
      if trim(coalesce(q->>'label', '')) = '' then raise exception 'need_question_label:%', i using errcode = 'P0001'; end if;
      select coalesce(array_agg(distinct_o order by first_at), '{}') into v_opts from (
        select trim(o) as distinct_o, min(n) as first_at
          from jsonb_array_elements_text(coalesce(case when jsonb_typeof(q->'options') = 'array' then q->'options' end, '[]'::jsonb)) with ordinality t(o, n)
         where trim(o) <> '' group by trim(o)) s;
      if v_type in ('single', 'multi') and cardinality(v_opts) < 2 then raise exception 'need_options:%', i using errcode = 'P0001'; end if;
      if v_type not in ('single', 'multi') then v_opts := '{}'; end if;
      v_min := coalesce(nullif(q->>'scale_min', '')::int, 1);
      v_max := coalesce(nullif(q->>'scale_max', '')::int, 5);
      if v_type = 'scale' and (v_min not in (0, 1) or v_max < 2 or v_max > 10 or v_max <= v_min) then
        raise exception 'bad_scale:%', i using errcode = 'P0001';
      end if;
      v_qid := null;
      if nullif(q->>'id', '') is not null then
        select * into v_prev from public.tf_questions where id = (q->>'id')::uuid and form_id = v_id;
        if found then
          v_qid := v_prev.id;
          if v_prev.type <> v_type and exists (select 1 from public.tf_answers a where a.question_id = v_qid) then
            raise exception 'question_type_locked:%', i using errcode = 'P0001';
          end if;
          update public.tf_questions set ord = i, label = trim(q->>'label'), help = coalesce(q->>'help', ''), type = v_type,
                 required = coalesce((q->>'required')::boolean, false), options = v_opts, scale_min = v_min, scale_max = v_max,
                 min_label = coalesce(q->>'min_label', ''), max_label = coalesce(q->>'max_label', '')
           where id = v_qid;
        end if;
      end if;
      if v_qid is null then
        insert into public.tf_questions (form_id, ord, label, help, type, required, options, scale_min, scale_max, min_label, max_label)
        values (v_id, i, trim(q->>'label'), coalesce(q->>'help', ''), v_type, coalesce((q->>'required')::boolean, false), v_opts,
                v_min, v_max, coalesce(q->>'min_label', ''), coalesce(q->>'max_label', ''))
        returning id into v_qid;
      end if;
      v_keep := v_keep || v_qid;
    end loop;
    if exists (select 1 from public.tf_questions tq where tq.form_id = v_id and not (tq.id = any(v_keep))
                  and exists (select 1 from public.tf_answers a where a.question_id = tq.id)) then
      raise exception 'question_has_answers' using errcode = 'P0001';
    end if;
    delete from public.tf_questions where form_id = v_id and not (id = any(v_keep));
  end if;
  return v_id;
end $$;

-- 換掉一張名單（整張換）。p_items：[{kind, value}]。
-- editor 名單只有建立者與 Co-President 改得動，而且不收 all（全部幹部都能改等於全部幹部都讀得到）。
create or replace function public.tf_set_audience(p_form uuid, p_role text, p_items jsonb)
returns int language plpgsql security definer
set search_path = public, pg_temp
as $$
declare it jsonb; v_kind text; v_val text; v_before jsonb; v_after jsonb; n int := 0;
begin
  if not public.tf_is_editor(p_form) then raise exception 'not_form_editor' using errcode = 'P0001'; end if;
  if p_role not in ('recipient', 'reader', 'editor') then raise exception 'bad_role' using errcode = 'P0001'; end if;
  if p_role = 'editor' and not (public.is_president() or exists (select 1 from public.tf_forms f where f.id = p_form and f.owner = auth.uid())) then
    raise exception 'not_form_owner' using errcode = 'P0001';
  end if;
  if jsonb_typeof(coalesce(p_items, '[]'::jsonb)) <> 'array' then raise exception 'bad_items' using errcode = 'P0001'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('kind', kind, 'value', value) order by kind, value), '[]'::jsonb) into v_before
    from public.tf_audience where form_id = p_form and role = p_role;
  delete from public.tf_audience where form_id = p_form and role = p_role;
  for it in select value from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    v_kind := coalesce(it->>'kind', '');
    v_val := trim(coalesce(it->>'value', ''));
    if v_kind not in ('all', 'rank', 'team', 'person') then raise exception 'bad_kind' using errcode = 'P0001'; end if;
    if v_kind = 'all' then
      if p_role = 'editor' then raise exception 'editor_not_all' using errcode = 'P0001'; end if;
      v_val := '';
    elsif v_kind = 'rank' and v_val not in ('member', 'adviser', 'director', 'senior_adviser', 'president') then
      raise exception 'bad_rank' using errcode = 'P0001';
    elsif v_kind = 'team' and v_val = '' then
      raise exception 'bad_team' using errcode = 'P0001';
    elsif v_kind = 'person' and not exists (select 1 from public.profiles where id::text = v_val and role = 'cadre') then
      raise exception 'bad_person' using errcode = 'P0001';
    end if;
    insert into public.tf_audience (form_id, role, kind, value) values (p_form, p_role, v_kind, v_val) on conflict do nothing;
    n := n + 1;
  end loop;
  select coalesce(jsonb_agg(jsonb_build_object('kind', kind, 'value', value) order by kind, value), '[]'::jsonb) into v_after
    from public.tf_audience where form_id = p_form and role = p_role;
  if v_after is distinct from v_before then perform public.tf_log_it(p_form, p_role, v_before, v_after); end if;
  update public.tf_forms set updated_at = now() where id = p_form;
  return n;
end $$;

create or replace function public.tf_set_status(p_form uuid, p_status text)
returns text language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_old text;
begin
  if not public.tf_is_editor(p_form) then raise exception 'not_form_editor' using errcode = 'P0001'; end if;
  if p_status not in ('draft', 'open', 'closed') then raise exception 'bad_status' using errcode = 'P0001'; end if;
  select status into v_old from public.tf_forms where id = p_form for update;
  if p_status = 'open' then
    if not exists (select 1 from public.tf_questions where form_id = p_form) then raise exception 'need_questions' using errcode = 'P0001'; end if;
    if not exists (select 1 from public.tf_audience where form_id = p_form and role = 'recipient') then raise exception 'need_recipients' using errcode = 'P0001'; end if;
  end if;
  if p_status = 'draft' and exists (select 1 from public.tf_responses where form_id = p_form) then
    raise exception 'has_responses' using errcode = 'P0001';
  end if;
  update public.tf_forms set status = p_status, updated_at = now() where id = p_form;
  if v_old is distinct from p_status then perform public.tf_log_it(p_form, 'status', to_jsonb(v_old), to_jsonb(p_status)); end if;
  return p_status;
end $$;

-- 刪掉整份（連答案）。只有建立者與 Co-President。
create or replace function public.tf_delete_form(p_form uuid)
returns boolean language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if not (public.tf_is_cadre() and (public.is_president() or exists (select 1 from public.tf_forms f where f.id = p_form and f.owner = auth.uid()))) then
    raise exception 'not_form_owner' using errcode = 'P0001';
  end if;
  delete from public.tf_forms where id = p_form;
  return found;
end $$;

-- 一題的答案檢查與正規化。v 是 JSON：字串、數字、或（多選）字串陣列。回存進去的文字，空字串表示沒答。
create or replace function public.tf_norm_answer(q public.tf_questions, v jsonb)
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
revoke all on function public.tf_norm_answer(public.tf_questions, jsonb) from public, anon, authenticated;

-- 送出（或在 allow_edit 的表單上改自己的）。p_answers：{ "<題目 id>": 值 }。名字與 team 由伺服器填。
create or replace function public.tf_submit(p_form uuid, p_answers jsonb)
returns uuid language plpgsql security definer
set search_path = public, pg_temp
as $$
declare f public.tf_forms%rowtype; q public.tf_questions; v_rid uuid; v_val text; v_me jsonb; v_vals jsonb := '{}'::jsonb;
begin
  if not public.tf_is_recipient(p_form) then raise exception 'not_for_you' using errcode = 'P0001'; end if;
  select * into f from public.tf_forms where id = p_form for update;
  if f.status <> 'open' or (f.closes_at is not null and f.closes_at <= now()) then raise exception 'form_closed' using errcode = 'P0001'; end if;
  select id into v_rid from public.tf_responses where form_id = p_form and user_id = auth.uid();
  if v_rid is not null and not f.allow_edit then raise exception 'already_submitted' using errcode = 'P0001'; end if;
  if jsonb_typeof(coalesce(p_answers, '{}'::jsonb)) <> 'object' then raise exception 'bad_answers' using errcode = 'P0001'; end if;
  for q in select * from public.tf_questions where form_id = p_form order by ord, id loop
    v_val := public.tf_norm_answer(q, p_answers->(q.id::text));
    if q.required and v_val = '' then raise exception 'required:%', q.ord using errcode = 'P0001'; end if;
    v_vals := v_vals || jsonb_build_object(q.id::text, v_val);
  end loop;
  v_me := public.tf_person(auth.uid());
  if v_rid is null then
    insert into public.tf_responses (form_id, user_id, name, team, source)
    values (p_form, auth.uid(), v_me->>'name', v_me->>'team', 'site') returning id into v_rid;
  else
    update public.tf_responses set updated_at = now(), name = v_me->>'name', team = v_me->>'team' where id = v_rid;
    delete from public.tf_answers where response_id = v_rid;
  end if;
  insert into public.tf_answers (response_id, question_id, value)
  select v_rid, key::uuid, value #>> '{}' from jsonb_each(v_vals) where value #>> '{}' <> '';
  return v_rid;
end $$;

-- 匯入（Tally 的 CSV，瀏覽器解析好再送）。p_rows：[{ user_id 或 null, name, submitted_at, answers: { "<題目 id>": 值 } }]。
-- 只有編輯者。對到人的列算那個人自己的答案（他在「我填過的」看得到）；對不到的留 CSV 上打的名字。
-- 匯入的答案不檢查選項（舊表單的選項可能跟現在的不一樣），只檢查題目屬於這一份。
create or replace function public.tf_import(p_form uuid, p_rows jsonb)
returns int language plpgsql security definer
set search_path = public, pg_temp
as $$
declare r jsonb; v_uid uuid; v_rid uuid; v_name text; v_at timestamptz; n int := 0; v_p jsonb; k text; v text;
begin
  if not public.tf_is_editor(p_form) then raise exception 'not_form_editor' using errcode = 'P0001'; end if;
  if jsonb_typeof(coalesce(p_rows, '[]'::jsonb)) <> 'array' then raise exception 'bad_rows' using errcode = 'P0001'; end if;
  for r in select value from jsonb_array_elements(p_rows) loop
    v_uid := nullif(r->>'user_id', '')::uuid;
    v_name := trim(coalesce(r->>'name', ''));
    v_at := coalesce(nullif(r->>'submitted_at', '')::timestamptz, now());
    if v_uid is not null then
      if not exists (select 1 from public.profiles where id = v_uid and role = 'cadre') then raise exception 'bad_person' using errcode = 'P0001'; end if;
      if exists (select 1 from public.tf_responses where form_id = p_form and user_id = v_uid) then
        raise exception 'already_answered:%', coalesce(nullif(v_name, ''), v_uid::text) using errcode = 'P0001';
      end if;
      v_p := public.tf_person(v_uid);
    elsif v_name = '' then
      raise exception 'need_name' using errcode = 'P0001';
    end if;
    insert into public.tf_responses (form_id, user_id, name, team, typed_name, source, submitted_at, updated_at)
    values (p_form, v_uid, coalesce(v_p->>'name', v_name), coalesce(v_p->>'team', trim(coalesce(r->>'team', ''))), v_name, 'import', v_at, v_at)
    returning id into v_rid;
    for k, v in select key, case when jsonb_typeof(value) = 'array' then (select string_agg(e, E'\n') from jsonb_array_elements_text(value) e) else value #>> '{}' end
                  from jsonb_each(coalesce(r->'answers', '{}'::jsonb)) loop
      if not exists (select 1 from public.tf_questions where id::text = k and form_id = p_form) then raise exception 'bad_question' using errcode = 'P0001'; end if;
      if trim(coalesce(v, '')) <> '' then
        insert into public.tf_answers (response_id, question_id, value) values (v_rid, k::uuid, trim(v));
      end if;
    end loop;
    v_p := null;
    n := n + 1;
  end loop;
  perform public.tf_log_it(p_form, 'import', null, to_jsonb(n));
  return n;
end $$;

-- 把一份（多半是匯入的）答案接到一個人身上，或拿掉（p_user 為 null）。只有編輯者。
create or replace function public.tf_link_response(p_response uuid, p_user uuid)
returns boolean language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_form uuid; v_typed text; v_old uuid; v_p jsonb;
begin
  select form_id, typed_name, user_id into v_form, v_typed, v_old from public.tf_responses where id = p_response;
  if v_form is null or not public.tf_is_editor(v_form) then raise exception 'not_form_editor' using errcode = 'P0001'; end if;
  if p_user is not null then
    if not exists (select 1 from public.profiles where id = p_user and role = 'cadre') then raise exception 'bad_person' using errcode = 'P0001'; end if;
    if exists (select 1 from public.tf_responses where form_id = v_form and user_id = p_user and id <> p_response) then
      raise exception 'already_answered' using errcode = 'P0001';
    end if;
    v_p := public.tf_person(p_user);
    update public.tf_responses set user_id = p_user, name = v_p->>'name', team = v_p->>'team' where id = p_response;
  else
    update public.tf_responses set user_id = null, name = coalesce(nullif(v_typed, ''), name) where id = p_response;
  end if;
  perform public.tf_log_it(v_form, 'link', to_jsonb(v_old), to_jsonb(p_user));
  return true;
end $$;

-- ---------- 7. 授權 ----------
revoke all on function public.tf_todo(), public.tf_bootstrap(), public.tf_form_admin(uuid), public.tf_fill(uuid), public.tf_results(uuid),
  public.tf_save_form(uuid, jsonb, jsonb), public.tf_set_audience(uuid, text, jsonb), public.tf_set_status(uuid, text),
  public.tf_delete_form(uuid), public.tf_submit(uuid, jsonb), public.tf_import(uuid, jsonb), public.tf_link_response(uuid, uuid)
  from public, anon;
grant execute on function public.tf_todo(), public.tf_bootstrap(), public.tf_form_admin(uuid), public.tf_fill(uuid), public.tf_results(uuid),
  public.tf_save_form(uuid, jsonb, jsonb), public.tf_set_audience(uuid, text, jsonb), public.tf_set_status(uuid, text),
  public.tf_delete_form(uuid), public.tf_submit(uuid, jsonb), public.tf_import(uuid, jsonb), public.tf_link_response(uuid, uuid)
  to authenticated;

-- ---------- 8. my_access() 多一格 team-forms ----------
-- 照 2026-11-08 那一版抄，finance 那一格原樣留著，後面接 team-forms。
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
            else '[]'::jsonb end)
    from profiles p where p.id = auth.uid();
$$;
revoke all on function public.my_access() from public, anon;
grant execute on function public.my_access() to authenticated;

commit;

-- ---------- 驗收 ----------
select * from (
  with t as (
    select (select count(*) from pg_tables where schemaname = 'public' and tablename in ('tf_forms', 'tf_questions', 'tf_audience', 'tf_responses', 'tf_answers', 'tf_log')) as tables,
           (select count(*) from pg_tables where schemaname = 'public' and tablename like 'tf\_%' and rowsecurity) as rls_on,
           (select count(*) from pg_policies where schemaname = 'public' and tablename like 'tf\_%') as pols,
           (select bool_and(not has_table_privilege(r, 'public.' || tb, pr))
              from unnest(array['anon', 'authenticated']) r, unnest(array['tf_forms', 'tf_questions', 'tf_audience', 'tf_responses', 'tf_answers', 'tf_log']) tb,
                   unnest(array['select', 'insert', 'update', 'delete']) pr) as no_table_priv,
           (select bool_and(not has_function_privilege('anon', p.oid, 'execute'))
              from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname like 'tf\_%') as anon_no_fn,
           (select count(*) from pg_proc where pronamespace = 'public'::regnamespace
              and proname in ('tf_save_form', 'tf_set_audience', 'tf_set_status', 'tf_import', 'tf_link_response')
              and regexp_replace(prosrc, '--[^\n]*', '', 'g') ~ 'not public\.tf_is_editor\(') as edit_gates,
           (select regexp_replace(prosrc, '--[^\n]*', '', 'g') ~ 'not public\.tf_can_create\(\)' from pg_proc where proname = 'tf_save_form' and pronamespace = 'public'::regnamespace) as create_gate,
           (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname in ('tf_results', 'tf_form_admin')
              and regexp_replace(prosrc, '--[^\n]*', '', 'g') ~ 'not public\.tf_is_reader\(') as read_gates,
           (select regexp_replace(prosrc, '--[^\n]*', '', 'g') ~ 'not public\.tf_is_recipient\(' from pg_proc where proname = 'tf_submit' and pronamespace = 'public'::regnamespace) as submit_gate,
           (select regexp_replace(prosrc, '--[^\n]*', '', 'g') like '%already_submitted%' from pg_proc where proname = 'tf_submit' and pronamespace = 'public'::regnamespace) as once_gate,
           (select regexp_replace(prosrc, '--[^\n]*', '', 'g') like '%anonymous_locked%' from pg_proc where proname = 'tf_save_form' and pronamespace = 'public'::regnamespace) as anon_lock,
           (select regexp_replace(prosrc, '--[^\n]*', '', 'g') ~ 'when f\.anonymous then' from pg_proc where proname = 'tf_results' and pronamespace = 'public'::regnamespace) as anon_hide,
           (select regexp_replace(prosrc, '--[^\n]*', '', 'g') like '%not_form_owner%' from pg_proc where proname = 'tf_set_audience' and pronamespace = 'public'::regnamespace) as owner_gate,
           (select regexp_replace(prosrc, '--[^\n]*', '', 'g') !~ 'can_view\(' and prosrc like '%is_president()%' from pg_proc where proname = 'tf_can_create' and pronamespace = 'public'::regnamespace) as create_rule,
           (select prosrc like '%team-forms%' and prosrc like '%finance%' from pg_proc where proname = 'my_access' and pronamespace = 'public'::regnamespace) as access_cell,
           exists (select 1 from public.workspaces where id = 'custom:team-forms' and kind = 'custom') as ws_ok
  )
  select 0 ord, 'OVERALL' as 項目, null::text as 應該是, null::text as 實際是,
    case when tables = 6 and rls_on = 6 and pols = 0 and no_table_priv and anon_no_fn and edit_gates = 5 and create_gate and read_gates = 2
          and submit_gate and once_gate and anon_lock and anon_hide and owner_gate and create_rule and access_cell and ws_ok
         then 'PASS' else 'FAIL' end as 結果 from t
  union all select 1,  '★ 六張表在', '6', tables::text, case when tables = 6 then 'PASS' else 'FAIL' end from t
  union all select 2,  '★ 六張表都開 RLS、零條政策（讀寫一律走函式）', '6 / 0', rls_on::text || ' / ' || pols::text, case when rls_on = 6 and pols = 0 then 'PASS' else 'FAIL' end from t
  union all select 3,  '★ anon 與登入的人對六張表沒有任何直接權限', 'true', no_table_priv::text, case when no_table_priv then 'PASS' else 'FAIL' end from t
  union all select 4,  '★ anon 叫不到任何一支 tf_ 函式', 'true', anon_no_fn::text, case when anon_no_fn then 'PASS' else 'FAIL' end from t
  union all select 5,  '★ 五支改東西的函式都先問 tf_is_editor', '5', edit_gates::text, case when edit_gates = 5 then 'PASS' else 'FAIL' end from t
  union all select 6,  '★ 新建表單先問 tf_can_create', 'true', create_gate::text, case when create_gate then 'PASS' else 'FAIL' end from t
  union all select 7,  '★ 看結果與看設定都先問 tf_is_reader', '2', read_gates::text, case when read_gates = 2 then 'PASS' else 'FAIL' end from t
  union all select 8,  '★ 送出先問 tf_is_recipient', 'true', submit_gate::text, case when submit_gate then 'PASS' else 'FAIL' end from t
  union all select 9,  '★ 填過就不能再送（沒開「可以改」時，already_submitted）', 'true', once_gate::text, case when once_gate then 'PASS' else 'FAIL' end from t
  union all select 10, '★ 有人填過之後不能從匿名改回具名（anonymous_locked）', 'true', anon_lock::text, case when anon_lock then 'PASS' else 'FAIL' end from t
  union all select 11, '★ 匿名的表單結果不回名字', 'true', anon_hide::text, case when anon_hide then 'PASS' else 'FAIL' end from t
  union all select 12, '★ 改「誰能改這份表單」只有建立者與 Co-President（not_form_owner）', 'true', owner_gate::text, case when owner_gate then 'PASS' else 'FAIL' end from t
  union all select 13, '★ 誰能建表單不靠 can_view（Senior Adviser 不自動有）', 'true', create_rule::text, case when create_rule then 'PASS' else 'FAIL' end from t
  union all select 14, '★ my_access() 有 team-forms 那一格，finance 那一格還在', 'true', access_cell::text, case when access_cell then 'PASS' else 'FAIL' end from t
  union all select 15, '工作區 custom:team-forms 在', 'true', ws_ok::text, case when ws_ok then 'PASS' else 'FAIL' end from t
) x order by ord;
