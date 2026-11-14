-- 2026-12-23：內部表單換上表單引擎（Paul 2026-11-13：「每一個表單編輯器都要像 Tally」）。
-- 接在 2026-12-22-form-uploads.sql 後面跑（真正要先跑過的是 2026-11-29-team-forms.sql 與 2026-12-01-records.sql）。
-- 可以重跑，不動既有的題目與答案。最後印一張驗收表，第一列 OVERALL 是 PASS 才算跑成功。
--
-- 做了什麼：
--   1. tf_questions 多兩欄：config（題型自己的設定：字數、數字範圍、分數兩端、「其他」）、logic（條件邏輯的規則）。
--      形狀跟申請表單的 form_questions 一樣（2026-12-20-form-engine.sql），畫法與驗證都在 shared/forms.js。
--   2. 題型從五種變十四種：多了 email、電話、數字、日期、下拉、同意勾選，加三種不收答案的排版區塊：
--      小標題、一段說明、換頁。**不收上傳檔案**（內部表單沒有放檔案的地方，要收檔案用申請表單）。
--      「一段說明」與「換頁」可以沒有題目字。
--   3. tf_save_form 收 config、logic 與新題型。選項題（單選、多選、下拉）要兩個以上選項。
--      **新的一題可以帶前端先產好的 id**：條件邏輯可能指到一題還沒存過的題，存完 id 不變，規則才不會斷。
--      那個 id 在任何一份表單都還沒有人用，才照它的；否則照舊自己產一個。
--      分數題的兩端同時寫進舊的四欄（scale_min、scale_max、min_label、max_label）與 config，兩邊永遠一樣。
--   4. tf_norm_answer 依新題型驗格式（email、電話、數字範圍、日期、字數、選項、同意）。
--      單選與多選只有 config.other 是 true 時才收選項外的字（那是「其他」自己寫的）。排版區塊送什麼都當沒有。
--   5. tf_submit 的必填：被規則影響的必填題不擋（理由見下）。不被影響的照擋。
--   6. tf_questions_json 多回 config 與 logic。
--   權限門與既有行為（匿名、allow_edit、already_submitted、form_closed、not_for_you、有人答過的題不能刪不能換題型）全部不變。
--
-- ⚠ 條件邏輯在伺服器這一端**不重算**，跟申請表單同一個原則：被規則影響的必填題（是某一條「顯示／藏／變必填」規則的目標，
--   或排在某一條「跳頁」規則的那一題後面）這裡不擋必填，交給前端（shared/forms.js 的 evaluate）。
--   在 SQL 裡再寫一份條件邏輯，兩份一定會分岔，而分岔的表現是「填完了卻送不出去」，那比少擋一題糟。
--   格式不管藏不藏，只要有值就照樣驗。藏起來的題前端不送，所以不會留下答案。
--
-- ⚠ 之後如果重跑 2026-11-29-team-forms.sql，它會把這裡改過的五支函式蓋回舊版（只認五種題型），記得再跑一次這一支。
begin;

-- ---------- 1. 題目多兩欄、題型放寬 ----------
alter table public.tf_questions add column if not exists config jsonb not null default '{}'::jsonb;
alter table public.tf_questions add column if not exists logic  jsonb not null default '[]'::jsonb;
alter table public.tf_questions drop constraint if exists tf_questions_shape_check;
alter table public.tf_questions add constraint tf_questions_shape_check check (jsonb_typeof(config) = 'object' and jsonb_typeof(logic) = 'array');
alter table public.tf_questions drop constraint if exists tf_questions_type_check;
alter table public.tf_questions add constraint tf_questions_type_check check (type in
  ('short', 'long', 'email', 'phone', 'number', 'date', 'single', 'multi', 'dropdown', 'scale', 'consent',
   'heading', 'text', 'page'));
alter table public.tf_questions drop constraint if exists tf_questions_label_check;
alter table public.tf_questions add constraint tf_questions_label_check check (label <> '' or type in ('text', 'page'));
comment on column public.tf_questions.type is
  '2026-12-23 起十四種（2026-12-23-team-forms-engine.sql）。會收答案的：short、long、email、phone、number、date、
   single、multi、dropdown、scale、consent。不收答案的排版區塊：heading 小標題、text 一段說明、page 換頁。
   內部表單不收上傳檔案。畫法與驗證在 shared/forms.js，三套表單共用。';
comment on column public.tf_questions.config is
  '題型自己的設定。短答長答：min_len、max_len、placeholder；數字：min、max；分數：scale_min、scale_max、min_label、max_label
   （跟同名的四欄一樣，tf_save_form 兩邊一起寫）；單選多選：other（多一個「其他」可以自己寫）。';
comment on column public.tf_questions.logic is
  '條件邏輯，一個陣列，每一條：{ match: all|any, when: [{ q: 題目 id, op, v }], do: show|hide|require|jump, target }。
   存在「打開那個邏輯面板的題」上，target 是被影響的那一題，跳頁時是換頁那一塊的 id 或 end。藏起來的題不必填，答案也不送。';

-- ---------- 2. 讀題目：多回 config 與 logic ----------
create or replace function public.tf_questions_json(p_form uuid)
returns jsonb language sql stable security definer
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', q.id, 'ord', q.ord, 'label', q.label, 'help', q.help, 'type', q.type,
                    'required', q.required, 'options', to_jsonb(q.options), 'scale_min', q.scale_min, 'scale_max', q.scale_max,
                    'min_label', q.min_label, 'max_label', q.max_label, 'config', q.config, 'logic', q.logic,
                    'answered', exists (select 1 from public.tf_answers a where a.question_id = q.id)) order by q.ord, q.id), '[]'::jsonb)
    from public.tf_questions q where q.form_id = p_form;
$$;
revoke all on function public.tf_questions_json(uuid) from public, anon, authenticated;

-- ---------- 3. 存表單與題目 ----------
-- 新建（p_form 為 null）或存。p_data：{ title, intro, closes_at, allow_edit, anonymous }，沒給的欄位不動。
-- p_questions：整份題目的清單（照順序），每一題 { id, type, label, help, required, options, config, logic }
-- （舊的前端送 scale_min、scale_max、min_label、max_label 在最外層，也收）。舊題目帶自己的 id。
-- 不在清單裡的舊題目會刪掉，**有人答過的刪不了**（question_has_answers），有人答過的也不能換題型（question_type_locked）。
-- p_questions 傳 null 就不動題目。
create or replace function public.tf_save_form(p_form uuid, p_data jsonb, p_questions jsonb)
returns uuid language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid; v_old public.tf_forms%rowtype; v_has int := 0; v_anon boolean; v_title text;
  q jsonb; i int := 0; v_qid uuid; v_want uuid; v_new uuid; v_keep uuid[] := '{}'; v_type text; v_label text; v_opts text[];
  v_min int; v_max int; v_minl text; v_maxl text; v_cfg jsonb; v_logic jsonb; v_req boolean; v_prev public.tf_questions%rowtype;
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
    if jsonb_array_length(p_questions) > 200 then raise exception 'too_many_questions' using errcode = 'P0001'; end if;
    for q in select value from jsonb_array_elements(p_questions) loop
      i := i + 1;
      if jsonb_typeof(q) <> 'object' then raise exception 'bad_questions' using errcode = 'P0001'; end if;
      v_type := coalesce(q->>'type', '');
      if v_type not in ('short', 'long', 'email', 'phone', 'number', 'date', 'single', 'multi', 'dropdown', 'scale', 'consent', 'heading', 'text', 'page') then raise exception 'bad_question_type:%', i using errcode = 'P0001'; end if;
      v_label := trim(coalesce(q->>'label', ''));
      if v_label = '' and v_type not in ('text', 'page') then raise exception 'need_question_label:%', i using errcode = 'P0001'; end if;
      select coalesce(array_agg(distinct_o order by first_at), '{}') into v_opts from (
        select trim(o) as distinct_o, min(n) as first_at
          from jsonb_array_elements_text(coalesce(case when jsonb_typeof(q->'options') = 'array' then q->'options' end, '[]'::jsonb)) with ordinality t(o, n)
         where trim(o) <> '' group by trim(o)) s;
      if v_type in ('single', 'multi', 'dropdown') and cardinality(v_opts) < 2 then raise exception 'need_options:%', i using errcode = 'P0001'; end if;
      if v_type not in ('single', 'multi', 'dropdown') then v_opts := '{}'; end if;
      v_cfg := case when jsonb_typeof(q->'config') = 'object' then q->'config' else '{}'::jsonb end;
      v_logic := case when jsonb_typeof(q->'logic') = 'array' then q->'logic' else '[]'::jsonb end;
      if length(v_cfg::text) > 4000 or length(v_logic::text) > 20000 then raise exception 'bad_question_config:%', i using errcode = 'P0001'; end if;
      -- 分數題的兩端：最外層（舊的前端）先，再看 config（引擎）。只收整數的寫法，其他的當沒給。
      v_min := coalesce(case when q->>'scale_min' ~ '^-?[0-9]{1,3}$' then (q->>'scale_min')::int end,
                        case when v_cfg->>'scale_min' ~ '^-?[0-9]{1,3}$' then (v_cfg->>'scale_min')::int end, 1);
      v_max := coalesce(case when q->>'scale_max' ~ '^-?[0-9]{1,3}$' then (q->>'scale_max')::int end,
                        case when v_cfg->>'scale_max' ~ '^-?[0-9]{1,3}$' then (v_cfg->>'scale_max')::int end, 5);
      if v_type = 'scale' and (v_min not in (0, 1) or v_max < 2 or v_max > 10 or v_max <= v_min) then
        raise exception 'bad_scale:%', i using errcode = 'P0001';
      end if;
      v_minl := left(coalesce(q->>'min_label', v_cfg->>'min_label', ''), 80);
      v_maxl := left(coalesce(q->>'max_label', v_cfg->>'max_label', ''), 80);
      if v_type = 'scale' then
        v_cfg := v_cfg || jsonb_build_object('scale_min', v_min, 'scale_max', v_max, 'min_label', v_minl, 'max_label', v_maxl);
      else
        v_cfg := v_cfg - 'scale_min' - 'scale_max' - 'min_label' - 'max_label';
      end if;
      -- 排版區塊不收答案，所以也不會是必填。
      v_req := coalesce((q->>'required')::boolean, false) and v_type not in ('heading', 'text', 'page');
      v_qid := null;
      v_want := case when coalesce(q->>'id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then (q->>'id')::uuid end;
      if v_want is not null then
        if v_want = any(v_keep) then raise exception 'duplicate_question:%', i using errcode = 'P0001'; end if;
        select * into v_prev from public.tf_questions where id = v_want and form_id = v_id;
        if found then
          v_qid := v_prev.id;
          if v_prev.type <> v_type and exists (select 1 from public.tf_answers a where a.question_id = v_qid) then raise exception 'question_type_locked:%', i using errcode = 'P0001'; end if;
          update public.tf_questions set ord = i, label = v_label, help = coalesce(q->>'help', ''), type = v_type,
                 required = v_req, options = v_opts, scale_min = v_min, scale_max = v_max,
                 min_label = v_minl, max_label = v_maxl, config = v_cfg, logic = v_logic
           where id = v_qid and form_id = v_id;
        end if;
      end if;
      if v_qid is null then
        -- 新的一題。前端先產好的 id 在任何表單都還沒有人用，就照它的（條件邏輯可能已經指到它）；否則自己產。
        if v_want is not null and not exists (select 1 from public.tf_questions x where x.id = v_want) then v_new := v_want; else v_new := gen_random_uuid(); end if;
        insert into public.tf_questions (id, form_id, ord, label, help, type, required, options, scale_min, scale_max, min_label, max_label, config, logic)
        values (v_new, v_id, i, v_label, coalesce(q->>'help', ''), v_type, v_req, v_opts, v_min, v_max, v_minl, v_maxl, v_cfg, v_logic)
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

-- ---------- 4. 一題的答案檢查與正規化 ----------
-- v 是 JSON：字串、數字、或（多選）字串陣列，也收換行分隔的字串。回存進去的文字，空字串表示沒答。
-- 錯誤代碼：bad_option（不在選項裡）、bad_scale_value（分數超出範圍）、too_long、bad_answer（格式不對），後面接第幾題（ord）。
create or replace function public.tf_norm_answer(q public.tf_questions, v jsonb)
returns text language plpgsql immutable
set search_path = public, pg_temp
as $$
declare s text; arr text[]; x text; n numeric; c jsonb := coalesce(q.config, '{}'::jsonb); v_other boolean; v_max int;
begin
  -- 排版區塊（小標題、一段說明、換頁）不收答案：送了什麼都當作沒有。
  if q.type in ('heading', 'text', 'page') then return ''; end if;
  if v is null or jsonb_typeof(v) = 'null' then return ''; end if;
  v_other := coalesce(case when jsonb_typeof(c->'other') = 'boolean' then (c->>'other')::boolean end, false);
  if q.type = 'multi' then
    if jsonb_typeof(v) = 'array' then
      select coalesce(array_agg(trim(e) order by k), '{}') into arr from jsonb_array_elements_text(v) with ordinality t(e, k) where trim(e) <> '';
    else
      select coalesce(array_agg(trim(e) order by k), '{}') into arr from unnest(string_to_array(v #>> '{}', E'\n')) with ordinality t(e, k) where trim(e) <> '';
    end if;
    foreach x in array arr loop
      if not (x = any(q.options)) and (not v_other or x = '__other__') then raise exception 'bad_option:%', q.ord using errcode = 'P0001'; end if;
      if char_length(x) > 500 then raise exception 'too_long:%', q.ord using errcode = 'P0001'; end if;
    end loop;
    -- 照選項的順序存，「其他」自己寫的接在最後面。
    select coalesce(string_agg(o, E'\n' order by k), '') into s from (
      select o, k from unnest(q.options) with ordinality t(o, k) where o = any(arr)
      union all
      select e, 100000 + k from unnest(arr) with ordinality t(e, k) where not (e = any(q.options))) z;
    if char_length(s) > 10000 then raise exception 'too_long:%', q.ord using errcode = 'P0001'; end if;
    return s;
  end if;
  s := trim(v #>> '{}');
  if s = '' then return ''; end if;
  if q.type in ('single', 'dropdown') then
    if s = '__other__' or (not (s = any(q.options)) and not (q.type = 'single' and v_other)) then raise exception 'bad_option:%', q.ord using errcode = 'P0001'; end if;
  end if;
  if q.type = 'scale' then
    if s !~ '^\d+$' then raise exception 'bad_scale_value:%', q.ord using errcode = 'P0001'; end if;
    if s::numeric < q.scale_min or s::numeric > q.scale_max then raise exception 'bad_scale_value:%', q.ord using errcode = 'P0001'; end if;
  end if;
  if q.type = 'consent' and s <> 'yes' then raise exception 'bad_answer:%', q.ord using errcode = 'P0001'; end if;
  if q.type = 'email' and s !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]{2,}$' then raise exception 'bad_answer:%', q.ord using errcode = 'P0001'; end if;
  if q.type = 'phone' and (s !~ '^\+?[0-9 ().-]{7,22}$' or length(regexp_replace(s, '[^0-9]', '', 'g')) < 7) then raise exception 'bad_answer:%', q.ord using errcode = 'P0001'; end if;
  if q.type = 'number' then
    if s !~ '^[-+]?([0-9]+(\.[0-9]*)?|\.[0-9]+)([eE][-+]?[0-9]{1,3})?$' then raise exception 'bad_answer:%', q.ord using errcode = 'P0001'; end if;
    n := s::numeric;
    if (jsonb_typeof(c->'min') = 'number' and n < (c->>'min')::numeric) or (jsonb_typeof(c->'max') = 'number' and n > (c->>'max')::numeric) then
      raise exception 'bad_answer:%', q.ord using errcode = 'P0001';
    end if;
  end if;
  if q.type = 'date' then
    if s !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'bad_answer:%', q.ord using errcode = 'P0001'; end if;
    -- 2 月 30 日這種轉不成日期的，轉的那一步會丟錯誤，接住當成格式不對。
    begin
      if to_char(s::date, 'YYYY-MM-DD') <> s then raise exception 'bad_date'; end if;
    exception when others then raise exception 'bad_answer:%', q.ord using errcode = 'P0001';
    end;
  end if;
  -- 字數：每一種題型有自己的上限，短答長答可以在 config 再設小一點，也可以設最少幾個字。
  v_max := case q.type when 'short' then 500 when 'long' then 10000 when 'email' then 200 when 'phone' then 40
                       when 'number' then 40 when 'date' then 10 else 2000 end;
  if q.type in ('short', 'long') and jsonb_typeof(c->'max_len') = 'number' and (c->>'max_len')::numeric >= 1 then v_max := least(v_max, (c->>'max_len')::numeric::int); end if;
  if char_length(s) > v_max then raise exception 'too_long:%', q.ord using errcode = 'P0001'; end if;
  if q.type in ('short', 'long') and jsonb_typeof(c->'min_len') = 'number' and char_length(s) < (c->>'min_len')::numeric then
    raise exception 'bad_answer:%', q.ord using errcode = 'P0001';
  end if;
  return s;
end $$;
revoke all on function public.tf_norm_answer(public.tf_questions, jsonb) from public, anon, authenticated;

-- ---------- 5. 送出 ----------
-- 送出（或在 allow_edit 的表單上改自己的）。p_answers：{ "<題目 id>": 值 }。名字與 team 由伺服器填。
-- 前端只送看得到的題（藏起來的不送），所以改答案時被藏起來的那幾題的舊答案會一起拿掉。
create or replace function public.tf_submit(p_form uuid, p_answers jsonb)
returns uuid language plpgsql security definer
set search_path = public, pg_temp
as $$
declare f public.tf_forms%rowtype; q public.tf_questions; v_rid uuid; v_val text; v_me jsonb; v_vals jsonb := '{}'::jsonb; v_rules jsonb;
begin
  if not public.tf_is_recipient(p_form) then raise exception 'not_for_you' using errcode = 'P0001'; end if;
  select * into f from public.tf_forms where id = p_form for update;
  if f.status <> 'open' or (f.closes_at is not null and f.closes_at <= now()) then raise exception 'form_closed' using errcode = 'P0001'; end if;
  select id into v_rid from public.tf_responses where form_id = p_form and user_id = auth.uid();
  if v_rid is not null and not f.allow_edit then raise exception 'already_submitted' using errcode = 'P0001'; end if;
  if jsonb_typeof(coalesce(p_answers, '{}'::jsonb)) <> 'object' then raise exception 'bad_answers' using errcode = 'P0001'; end if;
  -- 這份表單所有的規則，加上「擁有那一條規則的題排第幾」（跳頁規則看的是排在它後面的題）。
  select coalesce(jsonb_agg(r || jsonb_build_object('owner_ord', tq.ord)), '[]'::jsonb) into v_rules
    from public.tf_questions tq,
         jsonb_array_elements(case when jsonb_typeof(tq.logic) = 'array' then tq.logic else '[]'::jsonb end) r
   where tq.form_id = p_form and jsonb_typeof(r) = 'object';
  for q in select * from public.tf_questions where form_id = p_form order by ord, id loop
    v_val := public.tf_norm_answer(q, p_answers->(q.id::text));
    if q.type in ('heading', 'text', 'page') then continue; end if;
    -- 必填，而且沒有任何規則會影響它（影響它的交給前端，理由見檔頭）。
    if coalesce(q.required, false) and v_val = '' and not exists (
         select 1 from jsonb_array_elements(v_rules) r
          where (r->>'target' = q.id::text and coalesce(r->>'do', 'show') <> 'jump')
             or (r->>'do' = 'jump' and coalesce((r->>'owner_ord')::int, 0) < q.ord))
    then raise exception 'required:%', q.ord using errcode = 'P0001'; end if;
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

-- ---------- 6. 授權（簽名沒變，照 2026-11-29 那一份再寫一次）----------
revoke all on function public.tf_save_form(uuid, jsonb, jsonb), public.tf_submit(uuid, jsonb) from public, anon;
grant execute on function public.tf_save_form(uuid, jsonb, jsonb), public.tf_submit(uuid, jsonb) to authenticated;

commit;

-- ---------- 驗收 ----------
select * from (
  with fn as (select proname, regexp_replace(prosrc, '--[^\n]*', '', 'g') as body
                from pg_proc where pronamespace = 'public'::regnamespace),
  t as (
    select (select count(*) = 2 from information_schema.columns where table_schema = 'public' and table_name = 'tf_questions' and column_name in ('config', 'logic')) as cols,
           exists (select 1 from pg_constraint where conname = 'tf_questions_shape_check' and conrelid = 'public.tf_questions'::regclass) as shape,
           (select pg_get_constraintdef(oid) like '%dropdown%' and pg_get_constraintdef(oid) like '%consent%' and pg_get_constraintdef(oid) like '%''page''%'
                   and pg_get_constraintdef(oid) not like '%file%'
              from pg_constraint where conname = 'tf_questions_type_check' and conrelid = 'public.tf_questions'::regclass) as types,
           (select pg_get_constraintdef(oid) like '%''text''%' and pg_get_constraintdef(oid) like '%''page''%'
              from pg_constraint where conname = 'tf_questions_label_check' and conrelid = 'public.tf_questions'::regclass) as label_rule,
           (select body like '%''config'', q.config%' and body like '%''logic'', q.logic%' from fn where proname = 'tf_questions_json') as json_out,
           (select body ~ 'not public\.tf_is_editor\(' and body ~ 'not public\.tf_can_create\(\)' from fn where proname = 'tf_save_form') as save_gates,
           (select body like '%question_type_locked%' and body like '%question_has_answers%' from fn where proname = 'tf_save_form') as answered_lock,
           (select body like '%anonymous_locked%' from fn where proname = 'tf_save_form') as anon_lock,
           (select body like '%''dropdown'', ''scale'', ''consent'', ''heading'', ''text'', ''page''%' and body not like '%''file''%'
                   and body like '%v_type in (''single'', ''multi'', ''dropdown'') and cardinality(v_opts) < 2%' from fn where proname = 'tf_save_form') as save_types,
           (select body like '%not exists (select 1 from public.tf_questions x where x.id = v_want)%' and body like '%where id = v_qid and form_id = v_id%'
                   and body like '%duplicate_question%' from fn where proname = 'tf_save_form') as new_ids,
           (select body like '%jsonb_build_object(''scale_min'', v_min, ''scale_max'', v_max%' and body like '%scale_min = v_min%' from fn where proname = 'tf_save_form') as scale_sync,
           (select body like '%if q.type in (''heading'', ''text'', ''page'') then return ''''; end if;%' from fn where proname = 'tf_norm_answer') as norm_layout,
           (select body like '%q.type = ''email'' and s !~%' and body like '%q.type = ''phone''%' and body like '%q.type = ''date''%'
                   and body like '%q.type = ''number''%' and body like '%q.type = ''consent'' and s <> ''yes''%' from fn where proname = 'tf_norm_answer') as norm_format,
           (select body like '%v_other := coalesce(case when jsonb_typeof(c->''other'') = ''boolean''%' and body like '%not v_other%'
                   and body like '%q.type in (''single'', ''dropdown'')%' from fn where proname = 'tf_norm_answer') as norm_other,
           (select body ~ 'not public\.tf_is_recipient\(' and body like '%already_submitted%' and body like '%form_closed%' from fn where proname = 'tf_submit') as submit_gates,
           (select body like '%owner_ord%' and body like '%tf_norm_answer(q,%' from fn where proname = 'tf_submit') as cond_required,
           (select count(*) = 2 from fn where proname in ('tf_results', 'tf_form_admin') and body ~ 'not public\.tf_is_reader\(') as read_gates,
           (select bool_and(not has_function_privilege('anon', p.oid, 'execute'))
              from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname like 'tf\_%') as anon_no_fn,
           not has_function_privilege('authenticated', 'public.tf_norm_answer(public.tf_questions, jsonb)', 'execute')
             and not has_function_privilege('authenticated', 'public.tf_questions_json(uuid)', 'execute') as helpers_private,
           (select count(*) from pg_policies where schemaname = 'public' and tablename = 'tf_questions') as pols
  )
  select 0 ord, 'OVERALL' as 項目, null::text as 應該是, null::text as 實際是,
    case when cols and shape and types and label_rule and json_out and save_gates and answered_lock and anon_lock and save_types and new_ids
          and scale_sync and norm_layout and norm_format and norm_other and submit_gates and cond_required and read_gates and anon_no_fn
          and helpers_private and pols = 0
         then 'PASS' else 'FAIL' end as 結果 from t
  union all select 1,  '題目多 config、logic 兩欄，形狀有 check', 'true', (cols and shape)::text, case when cols and shape then 'PASS' else 'FAIL' end from t
  union all select 2,  '題型收得了十四種（沒有上傳檔案）', 'true', types::text, case when types then 'PASS' else 'FAIL' end from t
  union all select 3,  '「一段說明」與「換頁」可以沒有題目字', 'true', label_rule::text, case when label_rule then 'PASS' else 'FAIL' end from t
  union all select 4,  '讀題目多回 config 與 logic', 'true', json_out::text, case when json_out then 'PASS' else 'FAIL' end from t
  union all select 5,  '★ 存表單還是先問 tf_is_editor／新建先問 tf_can_create', 'true', save_gates::text, case when save_gates then 'PASS' else 'FAIL' end from t
  union all select 6,  '★ 有人答過的題目不能換題型、刪不了', 'true', answered_lock::text, case when answered_lock then 'PASS' else 'FAIL' end from t
  union all select 7,  '★ 有人填過之後不能從匿名改回具名', 'true', anon_lock::text, case when anon_lock then 'PASS' else 'FAIL' end from t
  union all select 8,  '存得了新題型，選項題（含下拉）要兩個以上選項', 'true', save_types::text, case when save_types then 'PASS' else 'FAIL' end from t
  union all select 9,  '★ 新題目照前端給的 id（沒人用過才用），舊題目只改這一份表單的', 'true', new_ids::text, case when new_ids then 'PASS' else 'FAIL' end from t
  union all select 10, '分數題的兩端 config 與舊欄位一起寫', 'true', scale_sync::text, case when scale_sync then 'PASS' else 'FAIL' end from t
  union all select 11, '排版區塊不收答案', 'true', norm_layout::text, case when norm_layout then 'PASS' else 'FAIL' end from t
  union all select 12, '★ 答案的格式有驗（email、電話、日期、數字、同意）', 'true', norm_format::text, case when norm_format then 'PASS' else 'FAIL' end from t
  union all select 13, '「其他」只在題目開了 config.other 才收選項外的字（下拉不收）', 'true', norm_other::text, case when norm_other then 'PASS' else 'FAIL' end from t
  union all select 14, '★ 送出還是先問 tf_is_recipient，填過、收起來照擋', 'true', submit_gates::text, case when submit_gates then 'PASS' else 'FAIL' end from t
  union all select 15, '被規則影響的必填題伺服器不擋（交給前端），其他照擋', 'true', cond_required::text, case when cond_required then 'PASS' else 'FAIL' end from t
  union all select 16, '★ 看結果與看設定還是先問 tf_is_reader', 'true', read_gates::text, case when read_gates then 'PASS' else 'FAIL' end from t
  union all select 17, '★ anon 叫不到任何一支 tf_ 函式', 'true', anon_no_fn::text, case when anon_no_fn then 'PASS' else 'FAIL' end from t
  union all select 18, '★ 驗答案與讀題目的兩支內部函式，登入的人也不能直接叫', 'true', helpers_private::text, case when helpers_private then 'PASS' else 'FAIL' end from t
  union all select 19, '★ 題目表還是零條政策（讀寫一律走函式）', '0', pols::text, case when pols = 0 then 'PASS' else 'FAIL' end from t
) x order by ord;
