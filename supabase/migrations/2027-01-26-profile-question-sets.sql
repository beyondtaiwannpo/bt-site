-- 個人連結的故事題，每一種人一套，自己改得動　2027-01-26（寫於 2026-11-28）
--
-- 用法：整份貼進 Supabase SQL Editor 按一次 Run。可以重跑，不動既有資料。最後印一張 PASS / FAIL 表，每一列都要是 PASS。
-- **接在 2027-01-25-profile-link-account.sql 後面跑**（順序照日期）。
--
-- Paul 2026-11-27 的原話：
--   「this applies to a lot of different people, we can send a link to speaker, they get to share their story. We can send a link to
--    past mentee… college professor… I need to be able to edit those questions as well, because not every link is gonna be the same
--    questions, because the link goes to different person.」
--   2026-11-28 看完提案：「Yes, build it」。
--
-- ============================================================================
-- 這一支在做什麼
-- ============================================================================
--   1. 一套故事題就是一份表單：rc_forms 多一種 kind = 'profile'（畫面叫「個人連結的故事題」），用紀錄那邊既有的表單編輯器改，
--      十幾種題型與條件邏輯都有，**不另做一個編輯器**。只有管紀錄的人建得了；不掛活動、不掛屆、不匿名、不收換頁
--      （故事那一步前後還有四步，換頁會跟外面那五步打架）。
--      rc_forms 多一欄 for_labels：這一套給哪些標籤的人（講者、教授、以前的 mentee…），開連結的時候照它自己挑。
--   2. 回饋表那兩條不登入的路（rc_public_form、rc_public_submit）認得這一種，**一律不給**：故事題只能從個人連結填，
--      不能拿表單的 token 當成一份匿名回饋表來灌。
--   3. 個人連結多一欄 form_id：這一條用哪一套。null 就是內建的六題（中英都有，跟以前一模一樣）。
--      rc_profile_link_set(人, 動作, 哪一套)：開一條新的時候挑一套（'' 照標籤挑、'builtin' 內建六題、或一套的 id），
--      也可以只換現在那一條的題目（動作 'set'，連結本身不變）。原本的 rc_profile_link(人, 動作) 留著，等於「照標籤挑」。
--      登入的人自己拿連結（rc_my_profile_link）沿用上一條的那一套。
--   4. rc_public_profile 多回 'set'（這一套的名稱、說明、語言、題目）。rc_public_profile_save 照那一套存：
--      每一題的答案用回饋表同一支 rc_norm_answer 檢查；存進 rc_profiles.story（鍵是題目代號，沒有代號用題目 id），
--      同時把那一題當時的題目與題型抄一份進 rc_profiles.story_q（新欄）：之後題目被改了，已經寫的答案還是對著當時問的那一句。
--      **只換這一套的題目**，別套留下來的答案不動：BT 換給他另一套題目，他之前寫的不會不見。
--   5. 三套起手的題目（講者、教授與招生官、以前的 mentee），中文，開放中。用固定的 id，重跑不會多一份、也不會蓋掉改過的字
--      （被刪掉的那一套重跑會再出現，不要的話把它「關閉」就好）。
--   6. rc_person 的個人連結多回 form_id、form_title（後台那個人的頁面看得到他那一條用哪一套）；rc_profile_json 多回 story_q；
--      rc_form_json 多回 for_labels。
--
-- 誰看得到什麼，改了的與沒改的：
--   - **沒有新的表、沒有動任何一條 RLS 政策**。三欄新欄位跟原本的表一樣只走函式讀寫。
--   - 拿連結的人多拿到的只有**他那一條連結那一套**的題目（題目本來就是要給他看的），沒有別套、沒有別人的答案、沒有 owner。
--   - 一套題目誰改得動：跟回饋表一樣（rc_form_editor），建只有管紀錄的人（Co-President 與紀錄工作區「改」以上）。
--
-- ⚠ 重跑順序：這一支重新定義了下面這幾支，之後重跑它們原本所在的那一支，要再跑一次這一支：
--     rc_form_json（2026-12-01-records.sql）、rc_save_form、rc_public_form、rc_public_submit（2026-12-24-feedback-engine.sql）、
--     rc_profile_json、rc_public_profile、rc_public_profile_save、rc_profile_link、rc_person（2027-01-03-people-network.sql）、
--     rc_my_profile_link（2027-01-25-profile-link-account.sql）。
--   每一支都是從原本那一份**一字不差抄過來**，只加這一支要的那幾處（每一處都寫了 2027-01-26）。

begin;

-- ---------- 1. 欄位 ----------
-- rc_forms.kind 多 profile：讀現在的清單再加，原本的一個都不拿掉。
do $$
declare c record; v_vals text;
begin
  for c in select conname, pg_get_constraintdef(oid) as def from pg_constraint
            where conrelid = 'public.rc_forms'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%kind%' loop
    if c.def not like '%''profile''%' then
      select string_agg(quote_literal(m[1]), ', ') into v_vals from regexp_matches(c.def, '''([^'']+)''', 'g') m;
      execute format('alter table public.rc_forms drop constraint %I', c.conname);
      execute format('alter table public.rc_forms add constraint %I check (kind in (%s, %L))', c.conname, v_vals, 'profile');
    end if;
  end loop;
end $$;

alter table public.rc_forms add column if not exists for_labels text[] not null default '{}';
alter table public.rc_forms drop constraint if exists rc_forms_for_labels_check;
alter table public.rc_forms add constraint rc_forms_for_labels_check check (for_labels <@ array['member', 'intern', 'student', 'mentee', 'mentor', 'speaker',
  'volunteer', 'organizer', 'professor', 'admission_officer', 'connection']);
comment on column public.rc_forms.for_labels is
  '2027-01-26：只有 kind = profile（個人連結的故事題）用。這一套給哪些標籤的人；開個人連結的時候照它自己挑（rc_profile_set_for）。';

alter table public.rc_profile_links add column if not exists form_id uuid references public.rc_forms(id) on delete set null;
comment on column public.rc_profile_links.form_id is
  '2027-01-26：這一條連結的故事那一步用哪一套題目（rc_forms，kind = profile）。null 是內建的六題。那一套被刪掉就變回 null。';

alter table public.rc_profiles add column if not exists story_q jsonb not null default '{}'::jsonb;
comment on column public.rc_profiles.story_q is
  '2027-01-26：story 每一個鍵當時問的是哪一句。{ 鍵: { label, type, ord, set（那一套的名稱）, form_id } }。內建六題的鍵不在這裡（題目寫在程式裡）。';

-- ---------- 2. 照標籤挑一套、一套題目給前端的樣子（內部用） ----------
-- 他身上有哪個標籤（現在的優先，過去的也算），挑一套開放中、for_labels 對得上的；好幾套都對得上就挑最近改過的那一套。都沒有回 null（內建六題）。
create or replace function public.rc_profile_set_for(p_person uuid)
returns uuid language sql stable security definer
set search_path = public, pg_temp
as $$
  with codes as (
    select split_part(c, ':', 1) as label, c not like '%:past' as now_
      from jsonb_array_elements_text(public.rc_label_codes(p_person)) c
  )
  select f.id from public.rc_forms f
   where f.kind = 'profile' and f.status = 'open' and exists (select 1 from codes where codes.label = any (f.for_labels))
   order by exists (select 1 from codes where codes.now_ and codes.label = any (f.for_labels)) desc, f.updated_at desc, f.id
   limit 1;
$$;
revoke all on function public.rc_profile_set_for(uuid) from public, anon, authenticated;

-- 一套題目畫在個人連結上要的東西：名稱、說明、語言、題目（跟 rc_public_form 回的題目同一個形狀）。不是 profile 那一種回 null。
create or replace function public.rc_profile_set_json(p_form uuid)
returns jsonb language sql stable security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object('id', f.id, 'title', f.title, 'intro', f.intro, 'lang', f.lang,
    'questions', (select coalesce(jsonb_agg(jsonb_build_object('id', q.id, 'ord', q.ord, 'key', q.key, 'label', q.label, 'help', q.help, 'type', q.type,
                    'required', q.required, 'options', to_jsonb(q.options), 'scale_min', q.scale_min, 'scale_max', q.scale_max, 'min_label', q.min_label, 'max_label', q.max_label,
                    'config', q.config, 'logic', q.logic)
                    order by q.ord, q.id), '[]'::jsonb) from public.rc_questions q where q.form_id = f.id))
    from public.rc_forms f where f.id = p_form and f.kind = 'profile';
$$;
revoke all on function public.rc_profile_set_json(uuid) from public, anon, authenticated;

-- ---------- 3. 抄過來的函式（每一處改動都標了 2027-01-26） ----------
create or replace function public.rc_form_json(p_form uuid)
returns jsonb language sql stable security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object('id', f.id, 'title', f.title, 'intro', f.intro, 'kind', f.kind, 'event_id', f.event_id, 'term_id', f.term_id, 'lang', f.lang,
                            'status', f.status, 'closes_at', f.closes_at, 'for_labels', to_jsonb(f.for_labels), 'anonymous', f.anonymous, 'token', f.token, 'source', f.source, 'owner', f.owner,
                            'event_title', (select coalesce(nullif(e.title_zh, ''), e.title_en) from public.events e where e.id = f.event_id),
                            'responses', (select count(*) from public.rc_responses r where r.form_id = f.id),
                            'created_at', f.created_at, 'updated_at', f.updated_at)
    from public.rc_forms f where f.id = p_form;
$$;

create or replace function public.rc_save_form(p_form uuid, p_data jsonb, p_questions jsonb)
returns uuid language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid; v_old public.rc_forms%rowtype; v_has int := 0; v_anon boolean; v_title text; v_kind text; v_event uuid;
  q jsonb; i int := 0; v_qid uuid; v_want uuid; v_keep uuid[] := '{}'; v_type text; v_opts text[]; v_min int; v_max int;
  v_prev public.rc_questions%rowtype; v_key text; v_label text; v_cfg jsonb; v_logic jsonb; v_lmin text; v_lmax text; v_s text;
  v_labels text[];
begin
  v_title := trim(coalesce(p_data->>'title', ''));
  v_event := nullif(p_data->>'event_id', '')::uuid;
  if p_form is null then
    v_kind := coalesce(nullif(p_data->>'kind', ''), 'post-event');
    if v_kind not in ('post-event', 'alumni-yearly', 'pair-mentor', 'pair-mentee', 'other', 'profile') then raise exception 'bad_kind' using errcode = 'P0001'; end if;
    -- 2027-01-26：個人連結的題目只有管紀錄的人建得了，而且不掛在任何一場活動上。
    if v_kind = 'profile' then
      if not public.rc_can_manage() then raise exception 'not_form_creator' using errcode = 'P0001'; end if;
      v_event := null;
    end if;
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
    v_kind := v_old.kind;
    if p_data ? 'title' and v_title = '' then raise exception 'need_title' using errcode = 'P0001'; end if;
    if p_data ? 'event_id' and v_event is not null and not exists (select 1 from public.events where id = v_event) then raise exception 'no_such_event' using errcode = 'P0001'; end if;
  end if;
  select count(*) into v_has from public.rc_responses where form_id = v_id;
  v_anon := coalesce((p_data->>'anonymous')::boolean, v_old.anonymous);
  -- 2027-01-26：個人連結的題目不匿名（答案本來就是那個人自己的檔案）、不掛活動、不掛屆。
  if v_kind = 'profile' then
    v_anon := false;
    if p_data ? 'event_id' then v_event := null; end if;
    if jsonb_typeof(p_data->'for_labels') = 'array' then
      select coalesce(array_agg(distinct x order by x), '{}') into v_labels from jsonb_array_elements_text(p_data->'for_labels') x;
      if not (v_labels <@ array['member', 'intern', 'student', 'mentee', 'mentor', 'speaker', 'volunteer', 'organizer', 'professor', 'admission_officer', 'connection']) then
        raise exception 'bad_label' using errcode = 'P0001';
      end if;
    end if;
  end if;
  if v_old.anonymous and not v_anon and v_has > 0 then raise exception 'anonymous_locked' using errcode = 'P0001'; end if;
  if p_data ? 'term_id' and nullif(p_data->>'term_id', '') is not null and not exists (select 1 from public.terms where id = p_data->>'term_id') then raise exception 'no_such_term' using errcode = 'P0001'; end if;
  update public.rc_forms set
    title     = case when p_data ? 'title' then v_title else title end,
    intro     = case when p_data ? 'intro' then coalesce(p_data->>'intro', '') else intro end,
    event_id  = case when p_data ? 'event_id' then v_event else event_id end,
    term_id   = case when v_kind = 'profile' then null when p_data ? 'term_id' then nullif(p_data->>'term_id', '') else term_id end,
    for_labels = case when v_kind = 'profile' and v_labels is not null then v_labels else for_labels end,
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
      -- 2027-01-26：個人連結的故事那一步只有一頁（前後還有四步），不收換頁。
      if v_kind = 'profile' and v_type = 'page' then raise exception 'bad_question_type:%', i using errcode = 'P0001'; end if;
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
    from public.rc_forms f where f.token = p_token and f.status <> 'draft' and f.kind <> 'profile';
$$;

create or replace function public.rc_public_submit(p_token text, p_answers jsonb, p_meta jsonb)
returns uuid language plpgsql security definer
set search_path = public, pg_temp
as $$
declare f public.rc_forms%rowtype; q public.rc_questions; v_rid uuid; v_val text; v_vals jsonb := '{}'::jsonb; v_person uuid; v_band text; v_ok boolean; v_email text; v_name text;
        v_rules jsonb;
begin
  select * into f from public.rc_forms where token = p_token;
  -- 2027-01-26：個人連結的題目不是回饋表，用這條路送不進來（它的答案只從個人連結存）。
  if not found or f.kind = 'profile' then raise exception 'form_not_found' using errcode = 'P0001'; end if;
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

create or replace function public.rc_profile_json(p_person uuid, p_internal boolean)
returns jsonb language sql stable security definer
set search_path = public, pg_temp
as $$
  select coalesce((
    select jsonb_build_object('photo_url', pf.photo_url, 'city', pf.city, 'country', pf.country, 'job_title', pf.job_title, 'job_org', pf.job_org, 'field', pf.field,
                              'bio', pf.bio, 'story', pf.story, 'story_q', pf.story_q, 'offer_speak', pf.offer_speak, 'offer_mentor', pf.offer_mentor, 'contact_ok', pf.contact_ok,
                              'share_profile', pf.share_profile, 'share_story', pf.share_story, 'consent_at', pf.consent_at, 'done_at', pf.done_at, 'updated_at', pf.updated_at)
           || case when p_internal then jsonb_build_object('rel_owner', pf.rel_owner, 'rel_owner_name', public.rc_person_name(pf.rel_owner),
                                                           'rel_last_contact', pf.rel_last_contact, 'rel_open', pf.rel_open, 'rel_note', pf.rel_note)
                   else '{}'::jsonb end
      from public.rc_profiles pf where pf.person_id = p_person),
    jsonb_build_object('photo_url', null, 'city', '', 'country', '', 'job_title', '', 'job_org', '', 'field', '', 'bio', '', 'story', '{}'::jsonb, 'story_q', '{}'::jsonb,
                       'offer_speak', false, 'offer_mentor', false, 'contact_ok', false, 'share_profile', false, 'share_story', false,
                       'consent_at', null, 'done_at', null, 'updated_at', null)
      || case when p_internal then jsonb_build_object('rel_owner', null, 'rel_owner_name', null, 'rel_last_contact', null, 'rel_open', 'unknown', 'rel_note', '') else '{}'::jsonb end);
$$;

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
    'expires_at', (select expires_at from public.rc_profile_links where token = p_token),
    -- 2027-01-26：這一條連結用哪一套故事題。null 是內建的六題（中英都有）。
    'set', public.rc_profile_set_json((select form_id from public.rc_profile_links where token = p_token)));
end $$;

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
  v_keys text[] := array['highschool', 'turning', 'hardest', 'decision', 'wish17', 'first_step']; v_q jsonb := '{}'::jsonb; v_set text; q public.rc_questions;
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
  -- 2027-01-26：故事題照這一條連結的那一套。沒有（null，或那一套被刪了）就是內建的六題，跟以前一樣。
  -- 一套題目：每一題用代號當鍵（沒填代號就用題目的 id），答案照回饋表同一支 rc_norm_answer 檢查（選項、分數、長度、格式）。
  -- 這一套每一題的題目與題型抄一份進 story_q：題目之後被改了，已經寫的答案還是對著當時問的那一句。
  -- 必填交給前端（條件邏輯會讓題目藏起來，伺服器不重算，跟回饋表同一個理由）。
  if lk.form_id is not null and exists (select 1 from public.rc_forms where id = lk.form_id and kind = 'profile') then
    select title into v_set from public.rc_forms where id = lk.form_id;
    v_keys := '{}';
    for q in select * from public.rc_questions where form_id = lk.form_id and type not in ('heading', 'text', 'page') order by ord, id loop
      k := coalesce(q.key, q.id::text);
      v_keys := v_keys || k;
      v := public.rc_norm_answer(q, st->k);
      if v <> '' then
        v_story := v_story || jsonb_build_object(k, v);
        v_q := v_q || jsonb_build_object(k, jsonb_build_object('label', q.label, 'type', q.type, 'ord', q.ord, 'set', v_set, 'form_id', lk.form_id));
      end if;
    end loop;
  else
    foreach k in array v_keys loop
      v := btrim(coalesce(st->>k, ''));
      if char_length(v) > 3000 then raise exception 'too_long:%', k using errcode = 'P0001'; end if;
      if v <> '' then v_story := v_story || jsonb_build_object(k, v); end if;
    end loop;
  end if;
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
    -- 這一套的題目整段換掉（沒寫的那一題就是拿掉），別套留下來的答案不動：BT 換給他另一套題目，之前寫的不會不見。
    story = case when p ? 'story' then (coalesce(story, '{}'::jsonb) - v_keys) || v_story else story end,
    story_q = case when p ? 'story' then (coalesce(story_q, '{}'::jsonb) - v_keys) || v_q else story_q end,
    offer_speak = coalesce((p->>'offer_speak')::boolean, false), offer_mentor = coalesce((p->>'offer_mentor')::boolean, false),
    contact_ok = coalesce((p->>'contact_ok')::boolean, false), share_profile = v_sp, share_story = v_ss,
    consent_at = case when v_sp is distinct from v_old_sp or v_ss is distinct from v_old_ss or consent_at is null then now() else consent_at end,
    done_at = now(), updated_at = now()
   where person_id = v_person;
  update public.rc_profile_links set submitted_at = now() where id = lk.id;
  perform public.rc_log_it('profile_self', v_person, null, jsonb_build_object('share_profile', v_sp, 'share_story', v_ss));
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.rc_profile_link_set(p_person uuid, p_action text, p_set text)
returns jsonb language plpgsql security definer
set search_path = public, pg_temp
as $$
declare pe public.people%rowtype; v_token text; v_exp timestamptz; v_form uuid;
begin
  if not public.rc_can_manage() then raise exception 'not_records_manager' using errcode = 'P0001'; end if;
  select * into pe from public.people where id = p_person and forgotten_at is null;
  if not found then raise exception 'no_such_person' using errcode = 'P0001'; end if;
  -- 用哪一套題目：'' 是照標籤自己挑，'builtin' 是內建的六題，其他是一套題目的 id（要是個人連結的題目、而且開放中）。
  if coalesce(p_set, '') = '' then v_form := public.rc_profile_set_for(p_person);
  elsif p_set = 'builtin' then v_form := null;
  elsif p_set ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        and exists (select 1 from public.rc_forms where id = p_set::uuid and kind = 'profile' and status = 'open') then v_form := p_set::uuid;
  else raise exception 'set_not_open' using errcode = 'P0001';
  end if;
  if p_action = 'set' then
    -- 換掉現在那一條的題目，連結本身不變（已經傳出去的那一條照樣能開）。
    update public.rc_profile_links set form_id = v_form where person_id = p_person and revoked_at is null;
    if not found then raise exception 'no_link' using errcode = 'P0001'; end if;
    perform public.rc_log_it('profile_link_set', p_person, null, jsonb_build_object('form_id', v_form));
    return jsonb_build_object('form_id', v_form);
  elsif p_action = 'revoke' then
    update public.rc_profile_links set revoked_at = now() where person_id = p_person and revoked_at is null;
    perform public.rc_log_it('profile_link_revoke', p_person, null, null);
    return jsonb_build_object('token', null);
  elsif p_action = 'create' then
    -- 還在念高中的學員（多半未滿 18 歲）不開：這條路會問他同不同意對外，而未成年一律不對外。畢業年沒填的也擋，先去補畢業年。
    if pe.kind = 'student' and (pe.grad_year is null or pe.grad_year >= extract(year from now())::int) then raise exception 'minor_no_link' using errcode = 'P0001'; end if;
    update public.rc_profile_links set revoked_at = now() where person_id = p_person and revoked_at is null;
    v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
    v_exp := now() + interval '90 days';
    insert into public.rc_profile_links (person_id, token, created_by, expires_at, form_id) values (p_person, v_token, auth.uid(), v_exp, v_form);
    perform public.rc_log_it('profile_link_create', p_person, null, jsonb_build_object('expires_at', v_exp));
    return jsonb_build_object('token', v_token, 'expires_at', v_exp, 'form_id', v_form);
  end if;
  raise exception 'bad_action' using errcode = 'P0001';
end $$;

create or replace function public.rc_my_profile_link()
returns jsonb language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_uid uuid := auth.uid(); v_role text; pe public.people%rowtype; v_token text; v_exp timestamptz; v_form uuid;
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = 'P0001'; end if;
  select role into v_role from public.profiles where id = v_uid;
  -- 幹部的東西在 /settings/；而且幹部裡有高中生，這一頁會問他同不同意對外。
  if v_role is null or v_role = 'cadre' then raise exception 'not_for_cadre' using errcode = 'P0001'; end if;
  select * into pe from public.people where profile_id = v_uid and forgotten_at is null limit 1;
  if not found then return null; end if;
  -- 跟開連結同一道門：還在念高中的學員（多半未滿 18 歲）不行，畢業年沒填的也擋。
  if pe.kind = 'student' and (pe.grad_year is null or pe.grad_year >= extract(year from now())::int) then raise exception 'minor_no_link' using errcode = 'P0001'; end if;
  -- BT 給過他連結的人，或個人連結開出來的帳號，才有這一頁。
  if v_role <> 'connection' and not exists (select 1 from public.rc_profile_links where person_id = pe.id) then return null; end if;
  select token into v_token from public.rc_profile_links
   where person_id = pe.id and revoked_at is null and expires_at > now() order by created_at desc limit 1;
  if v_token is null then
    -- 2027-01-26：新的那一條沿用上一條的題目（那一套還在、還開著）；沒有就照標籤挑。
    select l.form_id into v_form from public.rc_profile_links l join public.rc_forms f on f.id = l.form_id and f.kind = 'profile' and f.status = 'open'
     where l.person_id = pe.id order by l.created_at desc limit 1;
    if v_form is null and not exists (select 1 from public.rc_profile_links where person_id = pe.id) then v_form := public.rc_profile_set_for(pe.id); end if;
    update public.rc_profile_links set revoked_at = now() where person_id = pe.id and revoked_at is null;
    v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
    v_exp := now() + interval '90 days';
    insert into public.rc_profile_links (person_id, token, created_by, expires_at, form_id) values (pe.id, v_token, v_uid, v_exp, v_form);
    perform public.rc_log_it('profile_link_self', pe.id, null, jsonb_build_object('expires_at', v_exp));
  end if;
  return jsonb_build_object('token', v_token);
end $$;

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
                                       'expired', l.expires_at <= now(), 'opened_at', l.opened_at, 'submitted_at', l.submitted_at,
                                       'form_id', l.form_id, 'form_title', (select f.title from public.rc_forms f where f.id = l.form_id))
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

-- 原本的兩個參數那一支：等於「照標籤挑一套」。後台改叫 rc_profile_link_set，留著這一支給還沒換的地方。
create or replace function public.rc_profile_link(p_person uuid, p_action text)
returns jsonb language sql security definer
set search_path = public, pg_temp
as $$ select public.rc_profile_link_set(p_person, p_action, ''); $$;

revoke all on function public.rc_form_json(uuid) from public, anon, authenticated;
revoke all on function public.rc_save_form(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.rc_save_form(uuid, jsonb, jsonb) to authenticated;
revoke all on function public.rc_public_form(text) from public;
grant execute on function public.rc_public_form(text) to anon, authenticated;
revoke all on function public.rc_public_submit(text, jsonb, jsonb) from public;
grant execute on function public.rc_public_submit(text, jsonb, jsonb) to anon, authenticated;
revoke all on function public.rc_profile_json(uuid, boolean) from public, anon, authenticated;
revoke all on function public.rc_public_profile(text) from public;
grant execute on function public.rc_public_profile(text) to anon, authenticated;
revoke all on function public.rc_public_profile_save(text, jsonb) from public;
grant execute on function public.rc_public_profile_save(text, jsonb) to anon, authenticated;
revoke all on function public.rc_profile_link_set(uuid, text, text) from public, anon;
grant execute on function public.rc_profile_link_set(uuid, text, text) to authenticated;
revoke all on function public.rc_profile_link(uuid, text) from public, anon;
grant execute on function public.rc_profile_link(uuid, text) to authenticated;
revoke all on function public.rc_my_profile_link() from public, anon;
grant execute on function public.rc_my_profile_link() to authenticated;
revoke all on function public.rc_person(uuid) from public, anon;
grant execute on function public.rc_person(uuid) to authenticated;

-- ---------- 4. 三套起手的題目 ----------
-- 固定的 id：已經在了（不管改過沒有）就不動，題目也不補。中文；要英文版就在後台複製一份改成英文。
with s(id, title, intro, labels) as (values
  ('b7a1c0de-0000-4000-8000-000000000001', '講者的故事題',
   '謝謝你來 BT 分享。下面每一題都可以不寫，短短幾句老實話就很好。BT 要用這些內容之前，一定要你在下一步同意才行。', '{speaker}'),
  ('b7a1c0de-0000-4000-8000-000000000002', '教授與招生官的故事題',
   '謝謝你願意幫台灣的學生。下面每一題都可以不寫，寫的時候可以想像對面是一位第一次申請國外大學的公立高中生。BT 要用這些內容之前，一定要你在下一步同意才行。', '{professor,admission_officer}'),
  ('b7a1c0de-0000-4000-8000-000000000003', '以前的 mentee 的故事題',
   '好久不見。想聽聽你一路走到現在的經過，給正在申請的學弟妹看。下面每一題都可以不寫，BT 要用這些內容之前，一定要你在下一步同意才行。', '{mentee}')
), ins as (
  insert into public.rc_forms (id, title, intro, kind, lang, status, anonymous, for_labels)
  select id::uuid, title, intro, 'profile', 'zh', 'open', false, labels::text[] from s
  on conflict (id) do nothing returning id
)
insert into public.rc_questions (form_id, ord, key, label, help, type, options)
select q.form_id::uuid, q.ord, q.key, q.label, q.help, q.type, q.options::text[]
  from (values
    ('b7a1c0de-0000-4000-8000-000000000001', 1, 'talk_topic', '你在 BT 講過、或想講的主題是什麼？', '', 'short', '{}'),
    ('b7a1c0de-0000-4000-8000-000000000001', 2, 'turning', '是哪一個轉捩點，讓你走上現在這條路？', '', 'long', '{}'),
    ('b7a1c0de-0000-4000-8000-000000000001', 3, 'student_q', '台灣的高中生最常問你什麼？你通常怎麼回答？', '', 'long', '{}'),
    ('b7a1c0de-0000-4000-8000-000000000001', 4, 'wish17', '你希望 17 歲的時候有人告訴你什麼？', '', 'long', '{}'),
    ('b7a1c0de-0000-4000-8000-000000000001', 5, 'first_step', '如果一個台灣學生想走你這條路，他第一步該做什麼？', '', 'long', '{}'),
    ('b7a1c0de-0000-4000-8000-000000000001', 6, 'share_how', '之後你方便用哪些方式跟學生分享？', '可以複選。勾了只代表你有意願，BT 會先問過你。', 'multi',
     '{線上演講,實體演講,小組座談,一對一聊聊,寫一段話給學生看}'),
    ('b7a1c0de-0000-4000-8000-000000000002', 1, 'role_now', '你現在在哪一所學校、負責什麼？', '', 'short', '{}'),
    ('b7a1c0de-0000-4000-8000-000000000002', 2, 'look_for', '看申請資料的時候，你最想從學生身上看到什麼？', '', 'long', '{}'),
    ('b7a1c0de-0000-4000-8000-000000000002', 3, 'common_miss', '台灣學生最常漏掉、或誤會的是哪一件事？', '', 'long', '{}'),
    ('b7a1c0de-0000-4000-8000-000000000002', 4, 'public_school', '對資源比較少的公立高中生，你會給什麼建議？', '', 'long', '{}'),
    ('b7a1c0de-0000-4000-8000-000000000002', 5, 'first_step', '如果一個台灣學生想走你這條路，他第一步該做什麼？', '', 'long', '{}'),
    ('b7a1c0de-0000-4000-8000-000000000002', 6, 'help_how', '你願意用哪些方式幫 BT 的學生？', '可以複選。勾了只代表你有意願，BT 會先問過你。', 'multi',
     '{線上講座,回答學生的問題,看申請文件,介紹你們學校的資源}'),
    ('b7a1c0de-0000-4000-8000-000000000003', 1, 'where_now', '你現在在哪裡？念書或工作都可以寫。', '', 'short', '{}'),
    ('b7a1c0de-0000-4000-8000-000000000003', 2, 'before_bt', '參加 BT 之前，你對出國念書最擔心的是什麼？', '', 'long', '{}'),
    ('b7a1c0de-0000-4000-8000-000000000003', 3, 'bt_helped', '回頭看，BT 真的幫到你的是哪一件事？', '', 'long', '{}'),
    ('b7a1c0de-0000-4000-8000-000000000003', 4, 'hardest', '最難的一刻是什麼？你怎麼走過來的？', '', 'long', '{}'),
    ('b7a1c0de-0000-4000-8000-000000000003', 5, 'wish17', '你希望 17 歲的時候有人告訴你什麼？', '', 'long', '{}'),
    ('b7a1c0de-0000-4000-8000-000000000003', 6, 'give_back', '你願意怎麼回來幫學弟妹？', '可以複選。勾了只代表你有意願，BT 會先問過你。', 'multi',
     '{當 mentor,分享經驗,幫忙看申請文件,現在還不行}')
  ) q(form_id, ord, key, label, help, type, options)
 where q.form_id::uuid in (select id from ins);

commit;

-- ---------- 驗收 ----------
select * from (
  with fn as (
    select p.proname, regexp_replace(p.prosrc, '--[^\n]*', '', 'g') as body, pg_get_function_identity_arguments(p.oid) as args,
           has_function_privilege('anon', p.oid, 'execute') as anon_x, has_function_privilege('authenticated', p.oid, 'execute') as auth_x
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname in ('rc_public_form', 'rc_public_submit', 'rc_save_form', 'rc_public_profile', 'rc_public_profile_save',
                                                  'rc_profile_link_set', 'rc_profile_link', 'rc_my_profile_link', 'rc_profile_set_for', 'rc_profile_set_json',
                                                  'rc_person', 'rc_profile_json', 'rc_form_json')
  ), t as (
    select
      (select count(*) from pg_constraint where conrelid = 'public.rc_forms'::regclass and contype = 'c'
          and pg_get_constraintdef(oid) like '%''profile''%' and pg_get_constraintdef(oid) like '%''post-event''%' and pg_get_constraintdef(oid) like '%''pair-mentee''%') as kinds,
      (select count(*) from information_schema.columns where table_schema = 'public' and
          ((table_name = 'rc_forms' and column_name = 'for_labels') or (table_name = 'rc_profile_links' and column_name = 'form_id') or (table_name = 'rc_profiles' and column_name = 'story_q'))) as cols,
      exists (select 1 from pg_constraint where conrelid = 'public.rc_profile_links'::regclass and contype = 'f' and confrelid = 'public.rc_forms'::regclass and confdeltype = 'n') as fk_null,
      (select count(*) from public.rc_forms where id in ('b7a1c0de-0000-4000-8000-000000000001', 'b7a1c0de-0000-4000-8000-000000000002', 'b7a1c0de-0000-4000-8000-000000000003') and kind = 'profile') as seeds,
      (select bool_and(body like '%kind <> ''profile''%' or body like '%f.kind = ''profile''%') and bool_and(anon_x) from fn where proname in ('rc_public_form', 'rc_public_submit')) as fb_closed,
      (select body like '%v_kind = ''profile''%' and body like '%rc_can_manage()%' and body like '%v_type = ''page''%' and body like '%bad_label%' from fn where proname = 'rc_save_form') as save_rules,
      (select anon_x and body like '%rc_profile_set_json%' from fn where proname = 'rc_public_profile') as pub_set,
      (select anon_x and body like '%rc_norm_answer(q, st->k)%' and body like '%story_q%' and body like '%- v_keys%' and body like '%adult_only%'
              and body not like '%insert into public.people%' from fn where proname = 'rc_public_profile_save') as save_set,
      (select not anon_x and auth_x and body like '%rc_can_manage()%' and body like '%set_not_open%' and body like '%status = ''open''%' and body like '%minor_no_link%' from fn where proname = 'rc_profile_link_set') as link_set,
      (select not anon_x and auth_x and body like '%rc_profile_link_set(p_person, p_action, '''')%' from fn where proname = 'rc_profile_link') as link_old,
      (select not anon_x and auth_x and body like '%minor_no_link%' and body like '%not_for_cadre%' and body like '%form_id%' from fn where proname = 'rc_my_profile_link') as mine,
      (select bool_and(not anon_x and not auth_x) from fn where proname in ('rc_profile_set_for', 'rc_profile_set_json', 'rc_profile_json', 'rc_form_json')) as internal,
      (select body like '%form_title%' and not anon_x from fn where proname = 'rc_person') as person,
      (select count(*) from pg_policies where schemaname = 'public' and tablename in ('rc_forms', 'rc_questions', 'rc_profile_links', 'rc_profiles', 'people')) as pol
  )
  select 0 ord, 'OVERALL' as 項目, null::text as 應該是, null::text as 實際是,
    case when kinds = 1 and cols = 3 and fk_null and seeds = 3 and fb_closed and save_rules and pub_set and save_set and link_set and link_old and mine
              and internal and person then 'PASS' else 'FAIL' end as 結果 from t
  union all select 1, '表單種類多 profile（個人連結的故事題），原本的還在', '1', kinds::text, case when kinds = 1 then 'PASS' else 'FAIL' end from t
  union all select 2, '三欄新欄位：一套給哪些標籤、連結用哪一套、答案當時問的那一句', '3', cols::text, case when cols = 3 then 'PASS' else 'FAIL' end from t
  union all select 3, '一套被刪掉，用它的連結變回內建六題（不會連結跟著被刪）', 'true', fk_null::text, case when fk_null then 'PASS' else 'FAIL' end from t
  union all select 4, '三套起手的題目在（講者、教授與招生官、以前的 mentee）', '3', seeds::text, case when seeds = 3 then 'PASS' else 'FAIL' end from t
  union all select 5, '★ 回饋表那兩條不登入的路不給故事題', 'true', coalesce(fb_closed::text, '（函式不在）'), case when fb_closed then 'PASS' else 'FAIL' end from t
  union all select 6, '★ 故事題只有管紀錄的人建得了、不收換頁、標籤只收認得的', 'true', coalesce(save_rules::text, '（函式不在）'), case when save_rules then 'PASS' else 'FAIL' end from t
  union all select 7, '★ 拿連結的人讀得到他那一套的題目', 'true', coalesce(pub_set::text, '（函式不在）'), case when pub_set then 'PASS' else 'FAIL' end from t
  union all select 8, '★ 存：照那一套檢查每一格、抄下當時的題目、只換這一套的答案、照舊要滿 18 歲、不新增任何人', 'true', coalesce(save_set::text, '（函式不在）'), case when save_set then 'PASS' else 'FAIL' end from t
  union all select 9, '★ 開連結挑一套：只有管紀錄的人、只收開放中的那幾套、高中生照舊開不了', 'true', coalesce(link_set::text, '（函式不在）'), case when link_set then 'PASS' else 'FAIL' end from t
  union all select 10, '原本那一支開連結還在，等於照標籤挑', 'true', coalesce(link_old::text, '（函式不在）'), case when link_old then 'PASS' else 'FAIL' end from t
  union all select 11, '★ 登入的人拿自己的連結：照舊登入才叫得動、幹部與高中生不行，沿用上一條的那一套', 'true', coalesce(mine::text, '（函式不在）'), case when mine then 'PASS' else 'FAIL' end from t
  union all select 12, '★ 挑一套、一套給前端的樣子、讀檔案、讀表單那四支前端叫不到', 'true', coalesce(internal::text, '（函式不在）'), case when internal then 'PASS' else 'FAIL' end from t
  union all select 13, '後台那個人的頁面看得到他那一條用哪一套', 'true', coalesce(person::text, '（函式不在）'), case when person then 'PASS' else 'FAIL' end from t
  union all select 14, '（參考）這五張表的 RLS 政策條數，這一支沒有動', '（跑之前一樣）', pol::text, 'PASS' from t
) x order by ord;
