-- 2026-12-20：申請表單的引擎（Paul 2026-11-13：「每一個表單編輯器都要像 Tally」，對外的報名表要「看起來完美」）。
-- 接在 2026-12-19-access-fixes.sql 後面跑。可以重跑，不動既有的題目與申請。最後印一張驗收表，全 PASS 才算跑成功。
--
-- 做了什麼：
--   1. form_questions 多三欄：config（題型自己的設定：字數、數字範圍、分數兩端、「其他」、檔案上限…）、
--      logic（條件邏輯的規則）、key（網址帶入用的代號）。題型從四種變十五種（多的是 email、電話、數字、日期、
--      下拉、1 到 N 的分數、同意勾選、上傳檔案，加三種不收答案的排版區塊：小標題、一段說明、換頁）。
--   2. forms 多兩欄：max_responses（收滿就自己關）、hidden_fields（隱藏欄位的名字，例如 from）。
--      applications 多一欄 meta：隱藏欄位的值跟著那一份存（例如 ?from=ig）。
--   3. form_answer_problem()：伺服器那一端的驗證（必填、格式、字數、選項、範圍）。submit_application() 叫它。
--   4. submit_application() 多一個參數 p_meta、多兩道門：收滿（full）與同一個 email 送過（email_used）。
--      只存送進來的題的答案：被條件藏起來的題前端不送，這裡就不會有那一列。
--   5. form_is_full()：/apply/ 用，沒登入也叫得到，只回 true / false（不回幾份）。
--
-- ⚠ 條件邏輯在伺服器這一端怎麼算：**不重算。** 被規則影響的必填題（有規則會藏它、顯示它、叫它必填，
--   或它在一條「跳頁」規則後面）這裡不擋必填，交給前端（shared/forms.js 的 evaluate）。不被影響的必填題照樣擋。
--   在 SQL 裡再寫一份條件邏輯，兩份一定會分岔，而分岔的表現是「申請人填完了卻送不出去」，那比少擋一題糟。
--   格式（email、數字、字數、選項）不管藏不藏，只要有值就照樣驗。
begin;

-- ---------- 1. 題目 ----------
alter table public.form_questions add column if not exists config jsonb not null default '{}'::jsonb;
alter table public.form_questions add column if not exists logic  jsonb not null default '[]'::jsonb;
alter table public.form_questions add column if not exists key    text;
alter table public.form_questions drop constraint if exists form_questions_type_check;
alter table public.form_questions add constraint form_questions_type_check check (type in
  ('short', 'long', 'email', 'phone', 'number', 'date', 'single', 'multi', 'dropdown', 'scale', 'consent', 'file',
   'heading', 'text', 'page'));
alter table public.form_questions drop constraint if exists form_questions_key_check;
alter table public.form_questions add constraint form_questions_key_check check (key is null or key ~ '^[A-Za-z0-9_-]{1,40}$');
alter table public.form_questions drop constraint if exists form_questions_logic_check;
alter table public.form_questions add constraint form_questions_logic_check check (jsonb_typeof(logic) = 'array' and jsonb_typeof(config) = 'object');
create unique index if not exists form_questions_key on public.form_questions (form_id, key) where key is not null;
comment on column public.form_questions.type is
  '2026-11-13 起十五種（2026-12-20-form-engine.sql）。會收答案的：short、long、email、phone、number、date、
   single、multi、dropdown、scale、consent、file。不收答案的排版區塊：heading 小標題、text 一段說明、page 換頁。
   畫法與驗證在 shared/forms.js，三套表單共用。';
comment on column public.form_questions.config is
  '題型自己的設定。短答長答：min_len、max_len、placeholder；數字：min、max；分數：scale_min、scale_max、min_label、max_label；
   單選多選：other（多一個「其他」可以自己寫）；檔案：accept（pdf、image、doc、any）、max_mb。沒寫的用 shared/forms.js 的預設。';
comment on column public.form_questions.logic is
  '條件邏輯，一個陣列，每一條：{ match: all|any, when: [{ q: 題目 id, op, v }], do: show|hide|require|jump, target }。
   存在「打開那個邏輯面板的題」上，target 是被影響的那一題，跳頁時是換頁那一塊的 id 或 end。
   op：is、is_not、any_of、contains、empty、not_empty、gt、lt。藏起來的題不必填，答案也不送。';
comment on column public.form_questions.key is
  '網址帶入用的代號（英文、數字、底線、減號）。連結加 ?q_<key>=值 就會先幫人填好這一題。同一份表單裡不能重複。';

-- ---------- 2. 表單與申請 ----------
alter table public.forms add column if not exists max_responses int;
alter table public.forms add column if not exists hidden_fields text[] not null default '{}';
alter table public.forms drop constraint if exists forms_max_responses_check;
alter table public.forms add constraint forms_max_responses_check check (max_responses is null or max_responses > 0);
comment on column public.forms.max_responses is
  '收幾份就自己關（含被婉拒的，算的是「送進來幾份」）。空的是不限。跟活動的名額是兩件事：活動名額不算被婉拒的。';
comment on column public.forms.hidden_fields is
  '隱藏欄位的名字，例如 {from}。連結上 ?from=ig 的值會跟著那一份申請存進 applications.meta，申請人看不到這一格。';
alter table public.applications add column if not exists meta jsonb not null default '{}'::jsonb;
comment on column public.applications.meta is
  '隱藏欄位的值（只收表單 hidden_fields 列的名字，每個值最多 200 字）。看得到申請的人才看得到。';

-- ---------- 3. 伺服器那一端的驗證 ----------
-- 回 null 是沒問題；否則回一個代碼：missing:<題目、題目>、bad_answer:<題目>。前端把它翻成人話。
create or replace function public.form_answer_problem(p_form uuid, p_answers jsonb, p_uid uuid)
returns text language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  q record; v text; c jsonb; v_max int; n numeric; line text;
  v_missing text[] := '{}';
  v_rules jsonb;
  v_ans jsonb := case when jsonb_typeof(p_answers) = 'array' then p_answers else '[]'::jsonb end;
begin
  select coalesce(jsonb_agg(r || jsonb_build_object('owner_ord', fq.ord)), '[]'::jsonb) into v_rules
    from public.form_questions fq,
         jsonb_array_elements(case when jsonb_typeof(fq.logic) = 'array' then fq.logic else '[]'::jsonb end) r
   where fq.form_id = p_form;
  for q in select * from public.form_questions
            where form_id = p_form and type not in ('heading', 'text', 'page') order by ord, id loop
    v := btrim(coalesce((select a->>'v' from jsonb_array_elements(v_ans) a where a->>'q' = q.id::text limit 1), ''));
    c := coalesce(q.config, '{}'::jsonb);
    if v = '' or (q.type = 'consent' and v <> 'yes') then
      -- 必填，而且沒有任何規則會影響它（影響它的交給前端，理由見檔頭）。
      if q.required and not exists (
           select 1 from jsonb_array_elements(v_rules) r
            where (r->>'target' = q.id::text and coalesce(r->>'do', 'show') <> 'jump')
               or (r->>'do' = 'jump' and coalesce((r->>'owner_ord')::int, 0) < q.ord))
      then v_missing := v_missing || q.label; end if;
      continue;
    end if;
    v_max := case q.type when 'short' then 500 when 'long' then 10000 when 'email' then 200 when 'phone' then 40
                         when 'number' then 40 when 'date' then 10 when 'file' then 300 else 2000 end;
    if q.type in ('short', 'long') and jsonb_typeof(c->'max_len') = 'number' then v_max := least(v_max, (c->>'max_len')::numeric::int); end if;
    if char_length(v) > v_max then return 'bad_answer:' || q.label; end if;
    if q.type in ('short', 'long') and jsonb_typeof(c->'min_len') = 'number' and char_length(v) < (c->>'min_len')::numeric then return 'bad_answer:' || q.label; end if;
    if q.type = 'email' and v !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]{2,}$' then return 'bad_answer:' || q.label; end if;
    if q.type = 'phone' and (v !~ '^\+?[0-9 ().-]{7,22}$' or length(regexp_replace(v, '[^0-9]', '', 'g')) < 7) then return 'bad_answer:' || q.label; end if;
    if q.type in ('number', 'scale') then
      if v !~ '^-?[0-9]+(\.[0-9]+)?$' then return 'bad_answer:' || q.label; end if;
      n := v::numeric;
      if q.type = 'number' and ((jsonb_typeof(c->'min') = 'number' and n < (c->>'min')::numeric)
                             or (jsonb_typeof(c->'max') = 'number' and n > (c->>'max')::numeric)) then return 'bad_answer:' || q.label; end if;
      if q.type = 'scale' and (n <> round(n) or n < coalesce((c->>'scale_min')::numeric, 1) or n > coalesce((c->>'scale_max')::numeric, 5)) then return 'bad_answer:' || q.label; end if;
    end if;
    if q.type = 'date' then
      if v !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then return 'bad_answer:' || q.label; end if;
      -- 2 月 30 日這種轉不成日期的，轉的那一步會丟錯誤，接住當成格式不對（不然申請人看到的是一串資料庫的錯誤）。
      begin
        if to_char(v::date, 'YYYY-MM-DD') <> v then return 'bad_answer:' || q.label; end if;
      exception when others then return 'bad_answer:' || q.label;
      end;
    end if;
    if q.type = 'dropdown' and not (v = any(q.options)) then return 'bad_answer:' || q.label; end if;
    if q.type = 'single' and not (v = any(q.options)) and not coalesce((c->>'other')::boolean, false) then return 'bad_answer:' || q.label; end if;
    if q.type = 'multi' and not coalesce((c->>'other')::boolean, false) then
      foreach line in array string_to_array(v, E'\n') loop
        if btrim(line) <> '' and not (btrim(line) = any(q.options)) then return 'bad_answer:' || q.label; end if;
      end loop;
    end if;
    -- 上傳的檔案只能是自己放進這一份表單資料夾的（路徑是 <表單>/<本人>/…），不能指到別人的檔案。
    if q.type = 'file' and (p_uid is null or position(p_form::text || '/' || p_uid::text || '/' in v) <> 1 or v like '%..%') then
      return 'bad_answer:' || q.label;
    end if;
  end loop;
  if coalesce(array_length(v_missing, 1), 0) > 0 then return 'missing:' || array_to_string(v_missing, '、'); end if;
  return null;
end $$;
revoke all on function public.form_answer_problem(uuid, jsonb, uuid) from public, anon, authenticated;

-- 收滿了沒有。/apply/ 沒登入也要知道（畫「已經收滿」而不是一顆按了會失敗的按鈕），所以 anon 叫得到，只回 true / false。
create or replace function public.form_is_full(p_form uuid)
returns boolean language sql stable security definer
set search_path = public, pg_temp
as $$
  select coalesce((select f.max_responses is not null
                      and (select count(*) from public.applications a where a.form_id = f.id) >= f.max_responses
                     from public.forms f where f.id = p_form), false)
$$;
revoke all on function public.form_is_full(uuid) from public;
grant execute on function public.form_is_full(uuid) to anon, authenticated;

-- ---------- 4. 送出 ----------
-- 舊的三個參數那一支要先拿掉：留著的話，前端用三個具名參數叫的時候兩支都對得上，Postgres 會說「不知道叫哪一支」。
drop function if exists public.submit_application(uuid, jsonb, text);
create or replace function public.submit_application(
  p_form_id uuid, p_answers jsonb, p_guardian_email text default null, p_meta jsonb default null)
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
    (form_id, user_id, applicant_name, applicant_school, applicant_grade, applicant_email, guardian_email, meta)
  values (p_form_id, v_uid, v_name, v_school, v_grade, v_email, nullif(btrim(coalesce(p_guardian_email, '')), ''), v_meta)
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
revoke all on function public.submit_application(uuid, jsonb, text, jsonb) from public, anon;
grant execute on function public.submit_application(uuid, jsonb, text, jsonb) to authenticated;

commit;

-- ---------- 驗收 ----------
select * from (
  with fn as (select proname, pg_get_function_identity_arguments(oid) as args, regexp_replace(prosrc, '--[^\n]*', '', 'g') as body
                from pg_proc where pronamespace = 'public'::regnamespace),
  t as (
    select (select count(*) = 3 from information_schema.columns where table_schema = 'public' and table_name = 'form_questions' and column_name in ('config', 'logic', 'key')) as qcols,
           (select count(*) = 2 from information_schema.columns where table_schema = 'public' and table_name = 'forms' and column_name in ('max_responses', 'hidden_fields')) as fcols,
           exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'applications' and column_name = 'meta') as acol,
           (select pg_get_constraintdef(oid) like '%consent%' and pg_get_constraintdef(oid) like '%page%' from pg_constraint where conname = 'form_questions_type_check') as types,
           (select count(*) = 1 from fn where proname = 'submit_application') as one_submit,
           (select args like '%p_meta%' from fn where proname = 'submit_application') as meta_arg,
           (select body like '%form_answer_problem(%' and body like '%form_is_full(%' and body like '%email_used%' and body like '%form_is_listed(%' and body like '%event_is_full(%' from fn where proname = 'submit_application') as gates,
           (select body like '%bad_answer%' and body like '%owner_ord%' from fn where proname = 'form_answer_problem') as checker,
           (select body like '%position(p_form::text || ''/'' || p_uid::text%' and body like '%..%' from fn where proname = 'form_answer_problem') as own_files,
           not has_function_privilege('anon', 'public.form_answer_problem(uuid, jsonb, uuid)', 'execute')
             and not has_function_privilege('authenticated', 'public.form_answer_problem(uuid, jsonb, uuid)', 'execute') as checker_private,
           has_function_privilege('anon', 'public.form_is_full(uuid)', 'execute') as full_public,
           not has_function_privilege('anon', 'public.submit_application(uuid, jsonb, text, jsonb)', 'execute') as anon_no_submit
  )
  select 0 ord, 'OVERALL' as 項目, null::text as 應該是, null::text as 實際是,
    case when qcols and fcols and acol and types and one_submit and meta_arg and gates and checker and own_files and checker_private and full_public and anon_no_submit then 'PASS' else 'FAIL' end as 結果 from t
  union all select 1, '題目多 config、logic、key 三欄', 'true', qcols::text, case when qcols then 'PASS' else 'FAIL' end from t
  union all select 2, '表單多「收滿」與「隱藏欄位」兩欄', 'true', fcols::text, case when fcols then 'PASS' else 'FAIL' end from t
  union all select 3, '申請多 meta 一欄（隱藏欄位的值）', 'true', acol::text, case when acol then 'PASS' else 'FAIL' end from t
  union all select 4, '題型收得了十五種', 'true', types::text, case when types then 'PASS' else 'FAIL' end from t
  union all select 5, '★ 送出只剩一支（舊的三個參數那支拿掉了，不然前端會叫不到）', 'true', one_submit::text, case when one_submit then 'PASS' else 'FAIL' end from t
  union all select 6, '送出收得了隱藏欄位', 'true', meta_arg::text, case when meta_arg then 'PASS' else 'FAIL' end from t
  union all select 7, '★ 送出的門：驗證、收滿、一個 email 一份、活動上架、活動名額', 'true', gates::text, case when gates then 'PASS' else 'FAIL' end from t
  union all select 8, '伺服器那一端的驗證在，會跳過被規則影響的必填題', 'true', checker::text, case when checker then 'PASS' else 'FAIL' end from t
  union all select 9, '★ 驗證函式誰都不能直接叫（只給送出用）', 'true', checker_private::text, case when checker_private then 'PASS' else 'FAIL' end from t
  union all select 10, '「收滿了沒」沒登入也叫得到', 'true', full_public::text, case when full_public then 'PASS' else 'FAIL' end from t
  union all select 11, '沒登入送不了申請', 'true', anon_no_submit::text, case when anon_no_submit then 'PASS' else 'FAIL' end from t
  union all select 12, '★ 上傳的檔案只能指到自己的資料夾（不能填別人的檔案路徑）', 'true', own_files::text, case when own_files then 'PASS' else 'FAIL' end from t
) x order by ord;
