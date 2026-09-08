-- 批 3：申請與審核的資料層。　2026-09-08
--
-- 用法：整份貼進 Supabase SQL Editor 按一次 Run。包在一個 transaction 裡。
-- **先跑 2026-09-08-students.sql**，這一支要用它建的 is_director_of() 與 board_role。
--
-- ============================================================================
-- 這一支在做什麼
-- ============================================================================
--   四張表：forms（一份申請表）、form_questions（題目）、
--           applications（一份申請）、application_answers（答案）
--   一支送出用的函式 submit_application()
--   RLS：誰看得到哪一份申請，2026-09-07 Paul 拍板的三層
--
-- ============================================================================
-- 為什麼是「表單屬於 team」，不是「申請屬於計畫」
-- ============================================================================
-- 2026-09-07 Paul 的原話：「每個 team 申請表也都不一樣呀」。
-- 所以所屬計畫**是結構本身，不是附加欄位**：
--   表單屬於一個 team → 申請屬於一份表單 → 權限跟著表單的 team 走。
-- 換屆換人不換設計，因為 team 的名字比人的名字穩定。
--
-- ============================================================================
-- 為什麼申請要存快照
-- ============================================================================
-- applications 存了申請人送出當下的姓名、學校、年級、email。
-- 那些欄位 profiles 裡也有，看起來是重複的。三個理由：
--   1. **審核要看他當時填的**，不是他後來改的。三月申請時是高二，
--      六月改成高三，審核紀錄不該跟著變。
--   2. 幹部讀不到學員的 profiles（RLS 只讓人讀自己那一列與幹部那幾列）。
--      不存快照的話，後台就得為了顯示名字而放寬 profiles 的可見範圍 ——
--      那等於為了一個顯示需求打開一整張表。
--   3. 這張表自足。要匯出、要統計、要交接，一張表就夠。
--
-- ============================================================================
-- 為什麼送出走函式不走 insert
-- ============================================================================
-- **email 一定要由伺服器填。** 前端自己填的話，一個人可以把別人的信箱
-- 寫進自己的申請，而我們之後會朝那個信箱寄「恭喜錄取」。
-- 那不是理論風險，那是一封寄給無關的人的信。
-- 函式裡的 email 只有一個來源：auth.users 裡他自己那一列。
-- 順便也讓「必填的題目有沒有填」在伺服器這一端檢查一次。

begin;

-- ---------- 0. 「我在不在這個 team」 ----------
-- is_director_of() 問的是「我管不管得到」，這一支問的是「我看不看得到」。
-- 兩支分開，因為 2026-09-07 拍板的三層裡，這兩件事故意差一級。
create or replace function public.is_on_team(p_team text)
returns boolean language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles
     where id = auth.uid()
       and role = 'cadre'
       and (board_role = 'president' or team is not distinct from p_team)
  );
$$;
revoke execute on function public.is_on_team(text) from public, anon;
grant  execute on function public.is_on_team(text) to authenticated;

-- ---------- 1. 表單 ----------
create table if not exists public.forms (
  id          uuid primary key default gen_random_uuid(),
  team        text not null,
  kind        text not null default 'program' check (kind in ('program', 'board')),
  title       text not null,
  intro       text,
  lang        text not null default 'zh' check (lang in ('zh', 'en')),
  status      text not null default 'draft' check (status in ('draft', 'open', 'closed')),
  opens_at    timestamptz,
  closes_at   timestamptz,
  notify_by   date,
  interview_url text,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.forms is
  '一份申請表。屬於一個 team，權限跟著 team 走。';
comment on column public.forms.kind is
  'program = 給高中生的計畫申請；board = 每年的幹部招募。
   兩種走同一套系統（招募就是另一份表單，擁有者是 P/VP 而不是某個 team），
   分開只是為了在 /apply/ 上排成兩區 —— 那兩區的讀者不是同一群人。';
comment on column public.forms.lang is
  '一份表單一種語言。**題目沒有雙語欄位**（2026-09-07 拍板）：
   雙語欄位的成本是 Director 每加一題都要填兩次，而英文誰寫沒有答案，
   實務上會變成「英文欄位永遠空著」。要中英都收就開兩份表單。';
comment on column public.forms.status is
  'draft 還在寫，只有自己 team 看得到；open 對外開放；closed 收起來。
   **draft 不會出現在 /apply/ 上**，所以編輯到一半不會被人看到。';
comment on column public.forms.notify_by is
  '預計通知日。申請人的狀態會顯示成「已收到，X 月 X 日前會通知你」。
   2026-09-07 Paul 選了這句而不是「審核中」：
   「審核中」誠實但會讓人一直刷新，一個日期換掉的是他最焦慮的那件事。
   **沒填的話那句話就只剩「已收到」** —— 不要編一個日期出來。';
comment on column public.forms.interview_url is
  'Cal.com 的預約連結（批 4 用）。BT 不自己做面試排程：
   時區與搶位最容易寫出 bug 又最難自己測，而面試官分布七個國家，
   時區算錯的表現是「學生準時到，沒有人在」。';

-- ---------- 2. 題目 ----------
create table if not exists public.form_questions (
  id        uuid primary key default gen_random_uuid(),
  form_id   uuid not null references public.forms(id) on delete cascade,
  ord       smallint not null,
  label     text not null,
  help      text,
  type      text not null check (type in ('short', 'long', 'single', 'multi')),
  required  boolean not null default false,
  options   text[] not null default '{}'
);

-- ord 不做 unique(form_id, ord)。**上下移動題目時，中間一定會有一瞬間撞號**，
-- 有 unique 的話就得先搬到一個暫時的號碼再搬回來，那是三句 SQL 換一個
-- 沒有人在意的性質。排序用 order by ord, id，撞號時的表現是「兩題順序不定」，
-- 不是「存不進去」。
create index if not exists form_questions_form_ord on public.form_questions (form_id, ord);

comment on column public.form_questions.type is
  '只有四種：short 短答、long 長答、single 單選、multi 多選。
   **不做跳題與條件邏輯，不做檔案上傳**（2026-09-07 寫進 GOALS 的「明確不做」）。
   做完題目編輯器一定會有人想要那些，一開始就做會沒完。';
comment on column public.form_questions.options is
  'single / multi 的選項。short / long 用不到，留空陣列。';

-- ---------- 3. 申請 ----------
create table if not exists public.applications (
  id           uuid primary key default gen_random_uuid(),
  form_id      uuid not null references public.forms(id) on delete cascade,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  -- 送出當下的快照，理由見檔頭。
  applicant_name   text not null,
  applicant_school text,
  applicant_grade  text,
  applicant_email  text not null,
  guardian_email   text,
  status       text not null default 'received'
               check (status in ('received', 'interview', 'accepted', 'rejected')),
  submitted_at timestamptz not null default now(),
  decided_at   timestamptz,
  decided_by   uuid references public.profiles(id) on delete set null,
  -- 一個人對一份表單只有一筆。連點兩下不會變成兩筆申請。
  unique (form_id, user_id)
);

comment on column public.applications.guardian_email is
  '未滿 18 歲的法定代理人信箱（2026-09-07 拍板）。系統會寄一封**告知信**，
   不是要簽名。**填錯或亂填不擋申請** —— 寄不出去就算了，
   不要因為這個卡住一個高中生的申請。';
comment on column public.applications.status is
  'received 已收到 / interview 邀請面試 / accepted 錄取 / rejected 婉拒。
   **審核的判斷留在人身上，這裡只記錄結果**（2026-09-07 拍板）：
   選人的標準每屆都會變，寫進系統就變成下一屆要跟系統吵架。';

-- ---------- 4. 答案 ----------
create table if not exists public.application_answers (
  application_id uuid not null references public.applications(id) on delete cascade,
  question_id    uuid not null references public.form_questions(id) on delete cascade,
  value          text not null default '',
  primary key (application_id, question_id)
);

comment on column public.application_answers.value is
  '一律存成文字。多選存成用換行分隔的字串。
   **不用 jsonb**：查詢與匯出都要多一層解包，而我們從來不需要對答案做結構化查詢。
   答案是給人讀的，不是給程式算的。';

-- ---------- 5. updated_at ----------
drop trigger if exists forms_touch on public.forms;
create trigger forms_touch before update on public.forms
  for each row execute function public.touch_updated_at();

-- ---------- 6. RLS ----------
alter table public.forms                enable row level security;
alter table public.form_questions       enable row level security;
alter table public.applications         enable row level security;
alter table public.application_answers  enable row level security;

-- 表單：開放中的**任何人都讀得到**，包含沒登入的人。
-- /apply/ 是對外頁面，路人要看得到現在開放什麼才有意義。
-- draft 與 closed 只有自己 team（與 president）看得到。
drop policy if exists forms_read on public.forms;
create policy forms_read on public.forms
  for select using (status = 'open' or public.is_on_team(team));

-- 寫：只有那個 team 的 Director（president 一律算）。
-- with check 也要有：沒有的話，Director 可以把表單的 team 改成別人的 team，
-- 改完就變成他管不到的東西，而那一步是合法的。
drop policy if exists forms_write  on public.forms;
drop policy if exists forms_insert on public.forms;
drop policy if exists forms_delete on public.forms;
create policy forms_insert on public.forms
  for insert to authenticated with check (public.is_director_of(team));
create policy forms_write on public.forms
  for update to authenticated using (public.is_director_of(team))
                               with check (public.is_director_of(team));
create policy forms_delete on public.forms
  for delete to authenticated using (public.is_director_of(team));

-- 題目：跟著它的表單走。子查詢問 forms，而 forms 自己的政策會再套一次，
-- 所以「看得到表單」與「看得到題目」永遠一致 —— 不是靠兩邊寫一樣的條件維持。
drop policy if exists fq_read   on public.form_questions;
drop policy if exists fq_write  on public.form_questions;
drop policy if exists fq_insert on public.form_questions;
drop policy if exists fq_delete on public.form_questions;
create policy fq_read on public.form_questions
  for select using (exists (select 1 from public.forms f where f.id = form_id));
create policy fq_insert on public.form_questions
  for insert to authenticated with check (
    exists (select 1 from public.forms f where f.id = form_id and public.is_director_of(f.team)));
create policy fq_write on public.form_questions
  for update to authenticated using (
    exists (select 1 from public.forms f where f.id = form_id and public.is_director_of(f.team)));
create policy fq_delete on public.form_questions
  for delete to authenticated using (
    exists (select 1 from public.forms f where f.id = form_id and public.is_director_of(f.team)));

-- 申請：**自己的永遠讀得到；其餘只有那份表單所屬 team 的幹部讀得到。**
-- 2026-09-07 Paul 選的可見範圍。不是「所有幹部」——
-- 三十個幹部裡有高中生，而申請人可能是同校學弟妹，
-- 「我在後台看到我認識的人寫他爸媽不支持他出國」發生一次，
-- 就再也收不到誠實的申請。這跟護照的隱私界線是同一件事。
drop policy if exists apps_read on public.applications;
create policy apps_read on public.applications
  for select to authenticated using (
    user_id = auth.uid()
    or exists (select 1 from public.forms f where f.id = form_id and public.is_on_team(f.team)));

-- **沒有 insert 政策**：送出只能走 submit_application()。
-- **沒有 delete 政策**：申請跟著帳號走，刪帳號才會一起消失。
-- update 只給狀態那一段，而且走批 4 的函式，這裡先不開。

drop policy if exists ans_read on public.application_answers;
create policy ans_read on public.application_answers
  for select to authenticated using (
    exists (select 1 from public.applications a where a.id = application_id));

-- ---------- 7. 授權 ----------
-- ⚠ 先 revoke。Supabase 對 public schema 的新表預設把 ALL 發給 anon 與
-- authenticated，不收回的話下面的 grant 只是裝飾（2026-09-02 踩過）。
revoke all on public.forms               from anon, authenticated;
revoke all on public.form_questions      from anon, authenticated;
revoke all on public.applications        from anon, authenticated;
revoke all on public.application_answers from anon, authenticated;

-- anon 也要讀得到，/apply/ 是對外頁面。政策把它限制在 status = 'open'。
grant select on public.forms          to anon, authenticated;
grant select on public.form_questions to anon, authenticated;
grant insert, update, delete on public.forms          to authenticated;
grant insert, update, delete on public.form_questions to authenticated;
grant select on public.applications        to authenticated;
grant select on public.application_answers to authenticated;

-- ---------- 8. 送出 ----------
-- p_answers 長這樣：[{"q": "<question_id>", "v": "答案"}, ...]
--
-- ⚠ **email 由這支函式填，不收前端送的值。** 前端填得動的話，
-- 一個人可以把別人的信箱寫進自己的申請，而我們之後會朝那個信箱寄「恭喜錄取」。
create or replace function public.submit_application(
  p_form_id uuid, p_answers jsonb, p_guardian_email text default null)
returns uuid language plpgsql security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_uid   uuid := auth.uid();
  v_form  public.forms%rowtype;
  v_app   uuid;
  v_name  text; v_school text; v_grade text; v_email text;
  v_missing text;
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = 'P0001'; end if;

  select * into v_form from public.forms where id = p_form_id;
  if not found then raise exception 'no_such_form' using errcode = 'P0001'; end if;

  -- 開放中才收。三個條件都要：狀態、開始時間、結束時間。
  -- **時間是在這裡判斷的，不是在前端。** 前端那一份是為了不要畫出一顆
  -- 按了會失敗的按鈕，這一份才是門。
  if v_form.status <> 'open'
     or (v_form.opens_at  is not null and now() < v_form.opens_at)
     or (v_form.closes_at is not null and now() > v_form.closes_at)
  then raise exception 'form_closed' using errcode = 'P0001'; end if;

  select coalesce(name_zh, name_en, ''), school, grade
    into v_name, v_school, v_grade
    from public.profiles where id = v_uid;
  if coalesce(v_name, '') = '' then
    raise exception 'profile_incomplete' using errcode = 'P0001';
  end if;
  select email into v_email from auth.users where id = v_uid;

  -- 必填的題目有沒有填。**在伺服器這一端也檢查一次**：
  -- 前端那一份是為了讓他當下就看到哪一格沒填，不是門。
  select string_agg(q.label, '、' order by q.ord) into v_missing
    from public.form_questions q
   where q.form_id = p_form_id and q.required
     and coalesce(btrim((
       select a->>'v' from jsonb_array_elements(coalesce(p_answers, '[]'::jsonb)) a
        where a->>'q' = q.id::text limit 1)), '') = '';
  if v_missing is not null then
    raise exception 'missing:%', v_missing using errcode = 'P0001';
  end if;

  insert into public.applications
    (form_id, user_id, applicant_name, applicant_school, applicant_grade,
     applicant_email, guardian_email)
  values (p_form_id, v_uid, v_name, v_school, v_grade, v_email,
          nullif(btrim(coalesce(p_guardian_email, '')), ''))
  returning id into v_app;

  -- 只寫這份表單真的有的題目。前端送了不存在的 question_id 就直接被忽略，
  -- 而不是變成一列指不到任何題目的答案。
  insert into public.application_answers (application_id, question_id, value)
  select v_app, q.id,
         coalesce((select a->>'v' from jsonb_array_elements(coalesce(p_answers, '[]'::jsonb)) a
                    where a->>'q' = q.id::text limit 1), '')
    from public.form_questions q
   where q.form_id = p_form_id;

  return v_app;
exception
  -- 同一份表單送第二次。這不是錯誤，是他按了兩下或開了兩個分頁。
  -- 回原本那一筆的 id，畫面就會跳到「已收到」，跟第一次送出一模一樣。
  when unique_violation then
    select id into v_app from public.applications
     where form_id = p_form_id and user_id = v_uid;
    return v_app;
end $$;

revoke all on function public.submit_application(uuid, jsonb, text) from public, anon;
grant execute on function public.submit_application(uuid, jsonb, text) to authenticated;

commit;
