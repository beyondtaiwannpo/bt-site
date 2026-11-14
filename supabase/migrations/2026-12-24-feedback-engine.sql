-- 2026-12-24：回饋表換上表單引擎（Paul 2026-11-13：「每一個表單編輯器都要像 Tally」）。
-- 接在 2026-12-01-records.sql 後面跑（跟 2026-12-20 到 12-23 那幾支動的表互不相干，誰先誰後都可以）。
-- 可以重跑，不動既有的題目與答案。最後印一張驗收表，全 PASS 才算跑成功。
-- ⚠ 這一支重新定義了 rc_save_form、rc_public_form、rc_public_submit、rc_questions_json、rc_norm_answer。
--   之後重跑 2026-12-01-records.sql，記得再跑一次這一支（不然那五支會退回五種題型的版本）。
--
-- 做了什麼：
--   1. rc_questions 多兩欄：config（題型自己的設定：字數、數字範圍、分數兩端、「其他」…）、logic（條件邏輯）。
--      題型從五種變十四種：多 email、電話、數字、日期、下拉、同意勾選，加三種不收答案的排版區塊：
--      小標題（heading）、一段說明（text）、換頁（page）。**不收上傳檔案**：回饋是不登入填的，
--      檔案沒有地方放、也沒有人管得到誰讀得到，所以這一套不開 file。
--      text 與 page 可以沒有題目字（一段說明的字寫在 label，換頁的標題選填）。
--   2. rc_save_form 收 config、logic、新題型。新題目前端可以先給一個 uuid（條件邏輯要指得到還沒存進去的題），
--      **那個 id 在任何一份表單都不存在才用**，不然照舊讓資料庫配一個（不能拿別人表單的題目 id 來蓋）。
--      分數題的兩端同時寫進舊的四欄（scale_min、scale_max、min_label、max_label）與 config，兩邊永遠一樣：
--      記分卡與年度比較讀的是舊欄位，引擎讀的是 config。
--      **匿名的表單不收 email 題與電話題**（anon_contact_q）：那種題的答案會原樣印在結果上，
--      匿名表單「email 本身不印」的承諾就破了。要聯絡就用填寫頁最後那一格「可以用 email 通知我」。
--   3. rc_public_submit 依新題型驗格式（email、電話、數字範圍、日期、下拉、同意、字數）。
--      單選與多選的 config.other 是 true 時，收選項以外的字（「其他」自己寫的）。
--      排版區塊不收答案（前端送了也不存）。
--   4. rc_questions_json、rc_public_form 多回 config、logic，引擎才畫得出條件邏輯與換頁。
--
-- ⚠ 條件邏輯在伺服器這一端**不重算**（跟申請表單 2026-12-20-form-engine.sql 同一個原則）：
--   被規則影響的必填題（是某條非跳頁規則的 target，或排在某條跳頁規則擁有者之後）這裡不擋必填，交給前端
--   （shared/forms.js 的 evaluate）。不被影響的必填題照樣擋。格式不管藏不藏，有值就驗。
--   在 SQL 裡再寫一份條件邏輯，兩份一定會分岔，分岔的表現是「學員填完了卻送不出去」，那比少擋一題糟。
--
-- 權限一個字都沒放寬：rc_public_form / rc_public_submit 還是唯二開給 anon 的 rc_ 函式，用 token 開門，
-- 草稿拿不到、關了送不進、一小時最多 200 份；rc_save_form 第一句照舊先問 rc_form_editor（新建先問能不能建）。
-- 回饋的填寫人多半是未成年的學員，這一支沒有讓任何人多看到任何一格答案。
begin;

-- ---------- 1. 題目 ----------
alter table public.rc_questions add column if not exists config jsonb not null default '{}'::jsonb;
alter table public.rc_questions add column if not exists logic  jsonb not null default '[]'::jsonb;
alter table public.rc_questions drop constraint if exists rc_questions_type_check;
alter table public.rc_questions add constraint rc_questions_type_check check (type in
  ('short', 'long', 'email', 'phone', 'number', 'date', 'single', 'multi', 'dropdown', 'scale', 'consent',
   'heading', 'text', 'page'));
alter table public.rc_questions drop constraint if exists rc_questions_label_check;
alter table public.rc_questions add constraint rc_questions_label_check check (label <> '' or type in ('text', 'page'));
alter table public.rc_questions drop constraint if exists rc_questions_shape_check;
alter table public.rc_questions add constraint rc_questions_shape_check check (jsonb_typeof(logic) = 'array' and jsonb_typeof(config) = 'object');
-- 既有的分數題：兩端抄進 config 一份（只補還沒有的），之後兩邊一樣。
update public.rc_questions
   set config = config || jsonb_build_object('scale_min', scale_min, 'scale_max', scale_max, 'min_label', min_label, 'max_label', max_label)
 where type = 'scale' and not (config ? 'scale_min');
comment on column public.rc_questions.type is
  '2026-11-13 起十四種（2026-12-24-feedback-engine.sql）。會收答案的：short、long、email、phone、number、date、
   single、multi、dropdown、scale、consent。不收答案的排版區塊：heading 小標題、text 一段說明、page 換頁。
   沒有 file：回饋不登入填，檔案沒有地方放。畫法與驗證在 shared/forms.js。';
comment on column public.rc_questions.config is
  '題型自己的設定。短答長答：min_len、max_len、placeholder；數字：min、max；分數：scale_min、scale_max、min_label、max_label
   （跟同名的四欄永遠一樣，rc_save_form 兩邊一起寫）；單選多選：other（多一個「其他」可以自己寫）。';
comment on column public.rc_questions.logic is
  '條件邏輯，一個陣列，每一條：{ match: all|any, when: [{ q: 題目 id, op, v }], do: show|hide|require|jump, target }。
   跟 form_questions.logic 同一個形狀（shared/forms.js）。藏起來的題不必填，答案也不送。伺服器不重算。';

-- ---------- 2. 讀題目 ----------
create or replace function public.rc_questions_json(p_form uuid)
returns jsonb language sql stable security definer
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', q.id, 'ord', q.ord, 'key', q.key, 'label', q.label, 'help', q.help, 'type', q.type,
                    'required', q.required, 'options', to_jsonb(q.options), 'scale_min', q.scale_min, 'scale_max', q.scale_max,
                    'min_label', q.min_label, 'max_label', q.max_label, 'config', q.config, 'logic', q.logic,
                    'answered', exists (select 1 from public.rc_answers a where a.question_id = q.id)) order by q.ord, q.id), '[]'::jsonb)
    from public.rc_questions q where q.form_id = p_form;
$$;
revoke all on function public.rc_questions_json(uuid) from public, anon, authenticated;

-- 不登入的填寫：用 token。草稿拿不到；回的東西裡沒有任何別人的答案、沒有 owner。
create or replace function public.rc_public_form(p_token text)
returns jsonb language sql stable security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'form', jsonb_build_object('id', f.id, 'title', f.title, 'intro', f.intro, 'kind', f.kind, 'lang', f.lang, 'anonymous', f.anonymous,
                               'event_title', (select coalesce(nullif(e.title_zh, ''), e.title_en) from public.events e where e.id = f.event_id),
                               'open', f.status = 'open' and (f.closes_at is null or f.closes_at > now())),
    'questions', (select coalesce(jsonb_agg(jsonb_build_object('id', q.id, 'ord', q.ord, 'key', q.key, 'label', q.label, 'help', q.help, 'type', q.type,
                    'required', q.required, 'options', to_jsonb(q.options), 'scale_min', q.scale_min, 'scale_max', q.scale_max, 'min_label', q.min_label, 'max_label', q.max_label,
                    'config', q.config, 'logic', q.logic)
                    order by q.ord, q.id), '[]'::jsonb) from public.rc_questions q where q.form_id = f.id))
    from public.rc_forms f where f.token = p_token and f.status <> 'draft';
$$;
revoke all on function public.rc_public_form(text) from public;
grant execute on function public.rc_public_form(text) to anon, authenticated;

-- ---------- 3. 存 ----------
-- 新建（p_form 為 null）或存。p_data：{ title, intro, kind, event_id, term_id, lang, closes_at, anonymous }，只改有給的鍵。
-- p_questions 是整份題目（null 是不動題目）：有人答過的題目刪不了、不能換題型；每一題多 config、logic，可以帶自己的 id。
create or replace function public.rc_save_form(p_form uuid, p_data jsonb, p_questions jsonb)
returns uuid language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid; v_old public.rc_forms%rowtype; v_has int := 0; v_anon boolean; v_title text; v_kind text; v_event uuid;
  q jsonb; i int := 0; v_qid uuid; v_want uuid; v_keep uuid[] := '{}'; v_type text; v_opts text[]; v_min int; v_max int;
  v_prev public.rc_questions%rowtype; v_key text; v_label text; v_cfg jsonb; v_logic jsonb; v_lmin text; v_lmax text; v_s text;
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
      if v_type not in ('short', 'long', 'email', 'phone', 'number', 'date', 'single', 'multi', 'dropdown', 'scale', 'consent', 'heading', 'text', 'page') then
        raise exception 'bad_question_type:%', i using errcode = 'P0001';
      end if;
      v_label := trim(coalesce(q->>'label', ''));
      if v_label = '' and v_type not in ('text', 'page') then raise exception 'need_question_label:%', i using errcode = 'P0001'; end if;
      v_key := nullif(lower(trim(coalesce(q->>'key', ''))), '');
      if v_key is not null and v_key !~ '^[a-z][a-z0-9_]{0,29}$' then raise exception 'bad_key:%', i using errcode = 'P0001'; end if;
      -- 排版區塊與同意勾選不會被記分卡比，不留代號。
      if v_type in ('heading', 'text', 'page') then v_key := null; end if;
      select coalesce(array_agg(distinct_o order by first_at), '{}') into v_opts from (
        select trim(o) as distinct_o, min(n) as first_at
          from jsonb_array_elements_text(coalesce(case when jsonb_typeof(q->'options') = 'array' then q->'options' end, '[]'::jsonb)) with ordinality t(o, n)
         where trim(o) <> '' group by trim(o)) s;
      if v_type in ('single', 'multi', 'dropdown') and cardinality(v_opts) < 2 then raise exception 'need_options:%', i using errcode = 'P0001'; end if;
      if v_type not in ('single', 'multi', 'dropdown') then v_opts := '{}'; end if;
      v_cfg := case when jsonb_typeof(q->'config') = 'object' then q->'config' else '{}'::jsonb end;
      v_logic := case when jsonb_typeof(q->'logic') = 'array' then q->'logic' else '[]'::jsonb end;
      if length(v_cfg::text) > 4000 then raise exception 'bad_config:%', i using errcode = 'P0001'; end if;
      if length(v_logic::text) > 20000 or jsonb_array_length(v_logic) > 30 then raise exception 'bad_logic:%', i using errcode = 'P0001'; end if;
      -- 分數題的兩端：config 有就用 config 的，沒有就用舊欄位（還沒換上引擎的前端只送舊欄位），兩邊寫成一樣。
      v_s := coalesce(nullif(v_cfg->>'scale_min', ''), nullif(q->>'scale_min', ''), '1');
      if v_s !~ '^-?[0-9]+$' then raise exception 'bad_scale:%', i using errcode = 'P0001'; end if;
      v_min := v_s::int;
      v_s := coalesce(nullif(v_cfg->>'scale_max', ''), nullif(q->>'scale_max', ''), '5');
      if v_s !~ '^-?[0-9]+$' then raise exception 'bad_scale:%', i using errcode = 'P0001'; end if;
      v_max := v_s::int;
      v_lmin := left(coalesce(v_cfg->>'min_label', q->>'min_label', ''), 80);
      v_lmax := left(coalesce(v_cfg->>'max_label', q->>'max_label', ''), 80);
      if v_type = 'scale' then
        if v_min not in (0, 1) or v_max < 2 or v_max > 10 or v_max <= v_min then raise exception 'bad_scale:%', i using errcode = 'P0001'; end if;
        v_cfg := v_cfg || jsonb_build_object('scale_min', v_min, 'scale_max', v_max, 'min_label', v_lmin, 'max_label', v_lmax);
      else
        v_min := 1; v_max := 5; v_lmin := ''; v_lmax := '';
        v_cfg := v_cfg - 'scale_min' - 'scale_max' - 'min_label' - 'max_label';
      end if;
      v_qid := null; v_want := null;
      if coalesce(q->>'id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        v_want := (q->>'id')::uuid;
        select * into v_prev from public.rc_questions where id = v_want and form_id = v_id;
        if found then
          v_qid := v_prev.id;
          if v_prev.type <> v_type and exists (select 1 from public.rc_answers a where a.question_id = v_qid) then raise exception 'question_type_locked:%', i using errcode = 'P0001'; end if;
          update public.rc_questions set ord = i, key = v_key, label = v_label, help = coalesce(q->>'help', ''), type = v_type,
                 required = coalesce((q->>'required')::boolean, false) and v_type not in ('heading', 'text', 'page'), options = v_opts,
                 scale_min = v_min, scale_max = v_max, min_label = v_lmin, max_label = v_lmax, config = v_cfg, logic = v_logic
           where id = v_qid;
        -- 前端先給的 id：**任何一份表單都沒有這個 id 才用**，不然當作沒給（不能拿別份表單的題目 id 來佔）。
        elsif exists (select 1 from public.rc_questions x where x.id = v_want) then
          v_want := null;
        end if;
      end if;
      if v_qid is null then
        insert into public.rc_questions (id, form_id, ord, key, label, help, type, required, options, scale_min, scale_max, min_label, max_label, config, logic)
        values (coalesce(v_want, gen_random_uuid()), v_id, i, v_key, v_label, coalesce(q->>'help', ''), v_type,
                coalesce((q->>'required')::boolean, false) and v_type not in ('heading', 'text', 'page'), v_opts, v_min, v_max, v_lmin, v_lmax, v_cfg, v_logic)
        returning id into v_qid;
      end if;
      v_keep := v_keep || v_qid;
    end loop;
    if exists (select 1 from public.rc_questions tq where tq.form_id = v_id and not (tq.id = any(v_keep)) and exists (select 1 from public.rc_answers a where a.question_id = tq.id)) then
      raise exception 'question_has_answers' using errcode = 'P0001';
    end if;
    delete from public.rc_questions where form_id = v_id and not (id = any(v_keep));
  end if;
  -- 匿名的表單不收 email 題、電話題：結果頁對匿名表單的承諾是「email 本身不印」，
  -- 一題 email 題的答案會照原樣印在結果上，等於繞過去。要聯絡就用填寫頁最後那一格「可以用 email 通知我」。
  -- 放在最後檢查：改題目與把表單改成匿名兩條路都會經過這裡，丟錯整個呼叫一起退回。
  if v_anon and exists (select 1 from public.rc_questions x where x.form_id = v_id and x.type in ('email', 'phone')) then
    raise exception 'anon_contact_q' using errcode = 'P0001';
  end if;
  return v_id;
end $$;
revoke all on function public.rc_save_form(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.rc_save_form(uuid, jsonb, jsonb) to authenticated;

-- ---------- 4. 一格答案整理成要存的字，不對就丟錯 ----------
-- 錯誤代碼後面接題號（ord），前端用它把錯誤放到那一題底下：
--   bad_option（不在選項裡）、bad_scale_value（分數不在範圍）、too_long（太長）、bad_answer（格式不對）。
create or replace function public.rc_norm_answer(q public.rc_questions, v jsonb)
returns text language plpgsql stable
set search_path = public, pg_temp
as $$
declare s text; arr text[]; x text; n numeric; c jsonb; v_other boolean; v_max int; v_extra text;
begin
  if q.type in ('heading', 'text', 'page') then return ''; end if;
  if v is null or jsonb_typeof(v) = 'null' then return ''; end if;
  c := coalesce(q.config, '{}'::jsonb);
  v_other := coalesce(c->>'other', '') = 'true' and q.type in ('single', 'multi');
  if q.type = 'multi' then
    if jsonb_typeof(v) = 'array' then select coalesce(array_agg(trim(e)), '{}') into arr from jsonb_array_elements_text(v) e where trim(e) <> '';
    else select coalesce(array_agg(trim(e)), '{}') into arr from unnest(string_to_array(v #>> '{}', E'\n')) e where trim(e) <> ''; end if;
    foreach x in array arr loop
      if not (x = any(q.options)) and (not v_other or x = '__other__') then raise exception 'bad_option:%', q.ord using errcode = 'P0001'; end if;
      if char_length(x) > 500 then raise exception 'too_long:%', q.ord using errcode = 'P0001'; end if;
    end loop;
    -- 選項照表單上的順序排；「其他」自己寫的接在後面（照填的順序、重複的只留一份）。
    select coalesce(string_agg(o, E'\n' order by i), '') into s from unnest(q.options) with ordinality t(o, i) where o = any(arr);
    select string_agg(e, E'\n' order by k) into v_extra
      from (select e, min(k) as k from unnest(arr) with ordinality u(e, k) where not (e = any(q.options)) group by e) w;
    if v_extra is not null then s := case when s = '' then v_extra else s || E'\n' || v_extra end; end if;
    if char_length(s) > 10000 then raise exception 'too_long:%', q.ord using errcode = 'P0001'; end if;
    return s;
  end if;
  s := trim(v #>> '{}');
  if s = '' then return ''; end if;
  if q.type = 'single' and (s = '__other__' or (not (s = any(q.options)) and not v_other)) then raise exception 'bad_option:%', q.ord using errcode = 'P0001'; end if;
  if q.type = 'dropdown' and not (s = any(q.options)) then raise exception 'bad_option:%', q.ord using errcode = 'P0001'; end if;
  if q.type = 'scale' then
    if s !~ '^\d+$' then raise exception 'bad_scale_value:%', q.ord using errcode = 'P0001'; end if;
    if s::int < q.scale_min or s::int > q.scale_max then raise exception 'bad_scale_value:%', q.ord using errcode = 'P0001'; end if;
  end if;
  v_max := case q.type when 'short' then 500 when 'long' then 10000 when 'email' then 200 when 'phone' then 40
                       when 'number' then 40 when 'date' then 10 when 'consent' then 3 else 500 end;
  if q.type in ('short', 'long') and jsonb_typeof(c->'max_len') = 'number' then v_max := least(v_max, (c->>'max_len')::numeric::int); end if;
  if char_length(s) > v_max then raise exception 'too_long:%', q.ord using errcode = 'P0001'; end if;
  if q.type in ('short', 'long') and jsonb_typeof(c->'min_len') = 'number' and char_length(s) < (c->>'min_len')::numeric then raise exception 'bad_answer:%', q.ord using errcode = 'P0001'; end if;
  if q.type = 'email' and s !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]{2,}$' then raise exception 'bad_answer:%', q.ord using errcode = 'P0001'; end if;
  if q.type = 'phone' and (s !~ '^\+?[0-9 ().-]{7,22}$' or length(regexp_replace(s, '[^0-9]', '', 'g')) < 7) then raise exception 'bad_answer:%', q.ord using errcode = 'P0001'; end if;
  if q.type = 'number' then
    if s !~ '^-?[0-9]+(\.[0-9]+)?$' then raise exception 'bad_answer:%', q.ord using errcode = 'P0001'; end if;
    n := s::numeric;
    if (jsonb_typeof(c->'min') = 'number' and n < (c->>'min')::numeric) or (jsonb_typeof(c->'max') = 'number' and n > (c->>'max')::numeric) then
      raise exception 'bad_answer:%', q.ord using errcode = 'P0001';
    end if;
  end if;
  if q.type = 'date' then
    if s !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'bad_answer:%', q.ord using errcode = 'P0001'; end if;
    -- 2 月 30 日這種轉不成日期的，轉的那一步會丟錯誤，接住當成格式不對（不然學員看到的是一串資料庫的錯誤）。
    begin
      if to_char(s::date, 'YYYY-MM-DD') <> s then raise exception 'bad_answer:%', q.ord using errcode = 'P0001'; end if;
    exception when others then raise exception 'bad_answer:%', q.ord using errcode = 'P0001';
    end;
  end if;
  if q.type = 'consent' and s <> 'yes' then raise exception 'bad_answer:%', q.ord using errcode = 'P0001'; end if;
  return s;
end $$;
revoke all on function public.rc_norm_answer(public.rc_questions, jsonb) from public, anon, authenticated;

-- ---------- 5. 送出（不登入）----------
-- p_answers：{ "<題目 id>": 值 }（多選可以是陣列或換行接起來的字）。p_meta：{ age_band, contact_ok, email, name }。
-- 匿名表單：留 email 的人才會對到人（他自己勾的）；沒留就完全不掛人。一個 token 一小時最多 200 份（擋灌水，不擋真人）。
create or replace function public.rc_public_submit(p_token text, p_answers jsonb, p_meta jsonb)
returns uuid language plpgsql security definer
set search_path = public, pg_temp
as $$
declare f public.rc_forms%rowtype; q public.rc_questions; v_rid uuid; v_val text; v_vals jsonb := '{}'::jsonb; v_person uuid; v_band text; v_ok boolean; v_email text; v_name text;
        v_rules jsonb;
begin
  select * into f from public.rc_forms where token = p_token;
  if not found then raise exception 'form_not_found' using errcode = 'P0001'; end if;
  if f.status <> 'open' or (f.closes_at is not null and f.closes_at <= now()) then raise exception 'form_closed' using errcode = 'P0001'; end if;
  if (select count(*) from public.rc_responses r where r.form_id = f.id and r.submitted_at > now() - interval '1 hour') >= 200 then raise exception 'too_many' using errcode = 'P0001'; end if;
  if jsonb_typeof(coalesce(p_answers, '{}'::jsonb)) <> 'object' then raise exception 'bad_answers' using errcode = 'P0001'; end if;
  -- 這份表單所有的規則，帶著擁有者的題號（跳頁規則後面的題可能被跳過）。
  select coalesce(jsonb_agg(r || jsonb_build_object('owner_ord', rq.ord)), '[]'::jsonb) into v_rules
    from public.rc_questions rq,
         jsonb_array_elements(case when jsonb_typeof(rq.logic) = 'array' then rq.logic else '[]'::jsonb end) r
   where rq.form_id = f.id;
  -- 排版區塊（小標題、一段說明、換頁）不收答案：前端送了也不看。
  for q in select * from public.rc_questions where form_id = f.id and type not in ('heading', 'text', 'page') order by ord, id loop
    v_val := public.rc_norm_answer(q, p_answers->(q.id::text));
    -- 必填，而且沒有任何規則會影響它（影響它的交給前端，理由見檔頭）。
    if q.required and v_val = '' and not exists (
         select 1 from jsonb_array_elements(v_rules) r
          where (r->>'target' = q.id::text and coalesce(r->>'do', 'show') <> 'jump')
             or (r->>'do' = 'jump' and coalesce((r->>'owner_ord')::int, 0) < q.ord))
    then raise exception 'required:%', q.ord using errcode = 'P0001'; end if;
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
revoke all on function public.rc_public_submit(text, jsonb, jsonb) from public;
grant execute on function public.rc_public_submit(text, jsonb, jsonb) to anon, authenticated;

commit;

-- ---------- 驗收 ----------
select * from (
  with fn as (select proname, regexp_replace(prosrc, '--[^\n]*', '', 'g') as body
                from pg_proc where pronamespace = 'public'::regnamespace),
  t as (
    select (select count(*) = 2 from information_schema.columns where table_schema = 'public' and table_name = 'rc_questions' and column_name in ('config', 'logic')) as qcols,
           (select pg_get_constraintdef(oid) like '%consent%' and pg_get_constraintdef(oid) like '%dropdown%' and pg_get_constraintdef(oid) like '%page%'
                   and pg_get_constraintdef(oid) not like '%file%'
              from pg_constraint where conname = 'rc_questions_type_check' and conrelid = 'public.rc_questions'::regclass) as types,
           (select pg_get_constraintdef(oid) like '%text%' and pg_get_constraintdef(oid) like '%page%' and pg_get_constraintdef(oid) not like '%heading%'
              from pg_constraint where conname = 'rc_questions_label_check' and conrelid = 'public.rc_questions'::regclass) as labels,
           (select count(*) = 0 from public.rc_questions where type = 'scale'
               and (config->>'scale_min' is distinct from scale_min::text or config->>'scale_max' is distinct from scale_max::text)) as scale_same,
           (select body ~ 'if not public\.rc_form_editor\(p_form\) then raise exception ''not_form_editor''' and body like '%not_form_creator%'
                   and body like '%anonymous_locked%' and body like '%question_type_locked%' and body like '%question_has_answers%'
              from fn where proname = 'rc_save_form') as save_gates,
           (select body like '%if v_anon and exists (select 1 from public.rc_questions x where x.form_id = v_id and x.type in (''email'', ''phone'')) then%'
              from fn where proname = 'rc_save_form') as anon_contact,
           (select body like '%elsif exists (select 1 from public.rc_questions x where x.id = v_want) then%'
                   and body like '%coalesce(v_want, gen_random_uuid())%' from fn where proname = 'rc_save_form') as own_ids,
           (select body like '%config = v_cfg, logic = v_logic%'
                   and body like '%jsonb_build_object(''scale_min'', v_min, ''scale_max'', v_max%' from fn where proname = 'rc_save_form') as save_shape,
           (select body like '%form_not_found%' and body like '%form_closed%' and body like '%too_many%' from fn where proname = 'rc_public_submit') as submit_gates,
           (select body like '%owner_ord%' and body like '%<> ''jump''%' from fn where proname = 'rc_public_submit') as req_rule,
           (select body like '%type not in (''heading'', ''text'', ''page'') order by ord%' from fn where proname = 'rc_public_submit') as no_layout,
           (select body like '%bad_answer%' and body like '%[^[:space:]@]+@%' and body like '%to_char(s::date%' and body like '%v_other%'
                   and body like '%if q.type = ''dropdown'' and not (s = any(q.options))%' from fn where proname = 'rc_norm_answer') as formats,
           (select body like '%''config'', q.config, ''logic'', q.logic%' and body like '%status <> ''draft''%' from fn where proname = 'rc_public_form') as pub_form,
           (select body like '%''config'', q.config, ''logic'', q.logic%' from fn where proname = 'rc_questions_json') as qjson,
           (select count(*) from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname like 'rc\_%' and p.prorettype <> 'trigger'::regtype
               and has_function_privilege('anon', p.oid, 'execute')) as anon_fns,
           has_function_privilege('anon', 'public.rc_public_submit(text, jsonb, jsonb)', 'execute')
             and has_function_privilege('anon', 'public.rc_public_form(text)', 'execute') as anon_two,
           not has_function_privilege('anon', 'public.rc_save_form(uuid, jsonb, jsonb)', 'execute')
             and not has_function_privilege('anon', 'public.rc_norm_answer(public.rc_questions, jsonb)', 'execute')
             and not has_function_privilege('authenticated', 'public.rc_norm_answer(public.rc_questions, jsonb)', 'execute')
             and not has_function_privilege('authenticated', 'public.rc_questions_json(uuid)', 'execute') as private_fns
  )
  select 0 ord, 'OVERALL' as 項目, null::text as 應該是, null::text as 實際是,
    case when qcols and types and labels and scale_same and save_gates and anon_contact and own_ids and save_shape and submit_gates and req_rule and no_layout
          and formats and pub_form and qjson and anon_fns = 2 and anon_two and private_fns then 'PASS' else 'FAIL' end as 結果 from t
  union all select 1, '回饋題目多 config、logic 兩欄', 'true', qcols::text, case when qcols then 'PASS' else 'FAIL' end from t
  union all select 2, '題型收得了十四種，沒有上傳檔案', 'true', types::text, case when types then 'PASS' else 'FAIL' end from t
  union all select 3, '只有一段說明與換頁可以沒有題目字（小標題要有）', 'true', labels::text, case when labels then 'PASS' else 'FAIL' end from t
  union all select 4, '既有的分數題 config 跟舊欄位一樣', 'true', scale_same::text, case when scale_same then 'PASS' else 'FAIL' end from t
  union all select 5, '★ 存檔的門都還在：改得動才能改、建得了才能建、匿名鎖、答過的題換不了題型也刪不掉', 'true', save_gates::text, case when save_gates then 'PASS' else 'FAIL' end from t
  union all select 5, '★ 匿名表單沒有 email 題、電話題（答案會原樣印在結果上）', 'true', anon_contact::text, case when anon_contact then 'PASS' else 'FAIL' end from t
  union all select 6, '★ 前端給的題目 id 只有在任何表單都沒有時才用（不能佔別份表單的題）', 'true', own_ids::text, case when own_ids then 'PASS' else 'FAIL' end from t
  union all select 7, '存得進 config 與條件邏輯，分數題兩端同時寫進 config 與舊欄位', 'true', save_shape::text, case when save_shape then 'PASS' else 'FAIL' end from t
  union all select 8, '★ 送出的門還在：錯的 token、關了、一小時 200 份', 'true', submit_gates::text, case when submit_gates then 'PASS' else 'FAIL' end from t
  union all select 9, '被規則影響的必填題伺服器不擋，其他照擋', 'true', req_rule::text, case when req_rule then 'PASS' else 'FAIL' end from t
  union all select 10, '★ 排版區塊不收答案', 'true', no_layout::text, case when no_layout then 'PASS' else 'FAIL' end from t
  union all select 11, '★ 依題型驗格式：email、電話、數字、日期、下拉、同意；「其他」要表單有開才收', 'true', formats::text, case when formats then 'PASS' else 'FAIL' end from t
  union all select 12, '填寫頁拿得到 config 與條件邏輯，草稿照樣拿不到', 'true', pub_form::text, case when pub_form then 'PASS' else 'FAIL' end from t
  union all select 13, '後台讀題目也多 config 與條件邏輯', 'true', qjson::text, case when qjson then 'PASS' else 'FAIL' end from t
  union all select 14, '★ anon 還是只叫得到兩支 rc_ 函式（拿題目、送出；trigger 不算，那個沒辦法直接叫）', '2', anon_fns::text, case when anon_fns = 2 and anon_two then 'PASS' else 'FAIL' end from t
  union all select 15, '★ 存檔、整理答案、讀題目那幾支沒登入叫不到（整理答案連登入的人都叫不到）', 'true', private_fns::text, case when private_fns then 'PASS' else 'FAIL' end from t
) x order by ord;
