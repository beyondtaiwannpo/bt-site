-- 2026-12-16：錢與行銷需求單可以掛在一場活動上（Paul 2026-11-10 拍板「Yes, do all 4」的第 4 件）。
--   1. fin_transactions 多一欄 event_id：記一筆收入或支出時可以選「哪一場活動」（轉帳不掛）。活動刪掉，那一筆留著只是沒有活動。
--      fin_add_transaction、fin_update_transaction 收 event_id；fin_event_options() 給財務的人挑活動用（他們不一定看得到每一場的 events 列）。
--   2. requests 多一欄 event_id：從活動頁按「請 Marketing 做貼文或影片」，需求單就掛在那一場。submit_request 收 event_id。
--   3. event_links(活動)：活動頁底下的兩塊。
--      錢：只有 can_view_finance() 的人拿得到（收入、支出、幾筆），其他人拿到 null，**金額不給一般幹部**。
--      需求單：看得到那場活動的人（或 Marketing 需求工作區的人）拿到標題、狀態、日期，不含內容與聯絡方式。
-- 可以重跑。最後印一張驗收表。
begin;

alter table public.fin_transactions add column if not exists event_id uuid references public.events(id) on delete set null;
create index if not exists fin_transactions_event on public.fin_transactions (event_id) where event_id is not null;
alter table public.requests add column if not exists event_id uuid references public.events(id) on delete set null;
create index if not exists requests_event on public.requests (event_id) where event_id is not null;

-- 收到的字串轉成活動 id；空的是沒掛；亂的或不存在的擋下來。
create or replace function public.fin_check_event(p text)
returns uuid language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare v uuid;
begin
  if nullif(btrim(coalesce(p, '')), '') is null then return null; end if;
  begin v := p::uuid; exception when others then raise exception 'no_such_event' using errcode = 'P0001'; end;
  if not exists (select 1 from events where id = v) then raise exception 'no_such_event' using errcode = 'P0001'; end if;
  return v;
end $$;
revoke all on function public.fin_check_event(text) from public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.fin_add_transaction(p_row jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_id uuid; v_kind text; v_cur text; v_date date; v_twd numeric; v_fx numeric;
        v_to uuid; v_cat uuid; v_ev uuid;
begin
  perform public.fin_require_edit();
  begin v_date := nullif(p_row->>'happened_on', '')::date; exception when others then raise exception 'bad_date' using errcode = 'P0001'; end;
  if v_date is null then raise exception 'bad_date' using errcode = 'P0001'; end if;
  v_kind := coalesce(p_row->>'kind', '');
  v_cur := upper(coalesce(nullif(btrim(p_row->>'currency'), ''), 'TWD'));
  v_fx := case when v_cur = 'TWD' then null else nullif(p_row->>'fx_rate', '')::numeric end;
  v_to := case when v_kind = 'transfer' then nullif(p_row->>'to_account_id', '')::uuid else null end;
  v_cat := case when v_kind = 'transfer' then null else nullif(p_row->>'category_id', '')::uuid end;
  v_ev := case when v_kind = 'transfer' then null else public.fin_check_event(p_row->>'event_id') end;
  v_twd := public.fin_check_row(v_kind, nullif(p_row->>'amount', '')::numeric, v_cur, v_fx, nullif(p_row->>'account_id', '')::uuid, v_to, v_cat);
  insert into fin_transactions (happened_on, kind, amount, currency, amount_twd, fx_rate, account_id, to_account_id, category_id, counterparty, note, term_id, entered_by, event_id)
  values (v_date, v_kind, round((p_row->>'amount')::numeric, 2), v_cur, v_twd, v_fx, (p_row->>'account_id')::uuid, v_to, v_cat,
          coalesce(btrim(p_row->>'counterparty'), ''), coalesce(btrim(p_row->>'note'), ''), public.fin_term_for(v_date), auth.uid(), v_ev)
  returning id into v_id;
  return v_id;
end $function$;

CREATE OR REPLACE FUNCTION public.fin_update_transaction(p_id uuid, p_patch jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare t record; v_kind text; v_cur text; v_date date; v_amount numeric; v_fx numeric; v_acc uuid; v_to uuid; v_cat uuid; v_twd numeric; v_ev uuid;
begin
  perform public.fin_require_edit();
  select * into t from fin_transactions where id = p_id;
  if t.id is null then raise exception 'no_such_transaction' using errcode = 'P0001'; end if;
  if t.voided_at is not null then raise exception 'tx_voided' using errcode = 'P0001'; end if;
  v_kind := coalesce(nullif(p_patch->>'kind', ''), t.kind);
  v_cur := upper(coalesce(nullif(btrim(p_patch->>'currency'), ''), t.currency));
  v_amount := coalesce(nullif(p_patch->>'amount', '')::numeric, t.amount);
  v_fx := case when v_cur = 'TWD' then null when p_patch ? 'fx_rate' then nullif(p_patch->>'fx_rate', '')::numeric else t.fx_rate end;
  v_acc := coalesce(nullif(p_patch->>'account_id', '')::uuid, t.account_id);
  v_to := case when v_kind <> 'transfer' then null when p_patch ? 'to_account_id' then nullif(p_patch->>'to_account_id', '')::uuid else t.to_account_id end;
  v_cat := case when v_kind = 'transfer' then null when p_patch ? 'category_id' then nullif(p_patch->>'category_id', '')::uuid else t.category_id end;
  if p_patch ? 'happened_on' then
    begin v_date := nullif(p_patch->>'happened_on', '')::date; exception when others then raise exception 'bad_date' using errcode = 'P0001'; end;
  end if;
  v_date := coalesce(v_date, t.happened_on);
  v_ev := case when v_kind = 'transfer' then null when p_patch ? 'event_id' then public.fin_check_event(p_patch->>'event_id') else t.event_id end;
  v_twd := public.fin_check_row(v_kind, v_amount, v_cur, v_fx, v_acc, v_to, v_cat);
  update fin_transactions set
    happened_on = v_date, kind = v_kind, amount = round(v_amount, 2), currency = v_cur, amount_twd = v_twd, fx_rate = v_fx,
    account_id = v_acc, to_account_id = v_to, category_id = v_cat,
    counterparty = coalesce(btrim(p_patch->>'counterparty'), counterparty),
    note         = coalesce(btrim(p_patch->>'note'), note),
    receipt_path = case when p_patch ? 'receipt_path' then nullif(btrim(p_patch->>'receipt_path'), '') else receipt_path end,
    term_id      = public.fin_term_for(v_date),
    event_id     = v_ev,
    updated_at   = now()
  where id = p_id;
  return p_id;
end $function$;

CREATE OR REPLACE FUNCTION public.submit_request(p_req jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_id uuid; v_to text; v_n int := 0; v_owner uuid; v_pf text[]; v_date date; v_shots jsonb; v_kind text; v_ev uuid;
begin
  if not public.is_cadre() then raise exception 'not_cadre' using errcode = 'P0001'; end if;
  if jsonb_typeof(p_req) is distinct from 'object' then raise exception 'bad_request' using errcode = 'P0001'; end if;
  if coalesce(btrim(p_req->>'title'), '') = '' then raise exception 'empty_title' using errcode = 'P0001'; end if;
  begin v_owner := nullif(p_req->>'owner_id', '')::uuid;
  exception when others then raise exception 'bad_owner' using errcode = 'P0001'; end;
  if v_owner is not null and not exists (select 1 from profiles where id = v_owner and role = 'cadre') then
    raise exception 'bad_owner' using errcode = 'P0001';
  end if;
  select coalesce(array_agg(distinct x), '{}') into v_pf
    from jsonb_array_elements_text(case when jsonb_typeof(p_req->'platforms') = 'array' then p_req->'platforms' else '[]'::jsonb end) x;
  begin v_date := nullif(p_req->>'publish_on', '')::date;
  exception when others then raise exception 'bad_date' using errcode = 'P0001'; end;
  begin v_ev := nullif(p_req->>'event_id', '')::uuid;
  exception when others then raise exception 'no_such_event' using errcode = 'P0001'; end;
  if v_ev is not null and not exists (select 1 from events where id = v_ev) then raise exception 'no_such_event' using errcode = 'P0001'; end if;
  v_shots := public.rq_clean_shots(p_req->'shots');
  v_kind := nullif(btrim(coalesce(p_req->>'kind', '')), '');
  if v_kind is not null and v_kind not in ('post', 'story', 'video') then raise exception 'bad_kind' using errcode = 'P0001'; end if;
  if v_kind = 'post' then
    if not v_pf <@ array['ig_carousel', 'fb_single', 'threads_text', 'other']::text[] then raise exception 'bad_platform' using errcode = 'P0001'; end if;
    v_shots := '[]'::jsonb;
  elsif v_kind = 'story' then
    v_pf := array['ig_story']::text[];
    v_shots := '[]'::jsonb;
  elsif v_kind = 'video' then
    if not v_pf <@ array['long_video', 'ig_reels', 'ig_story_video', 'other']::text[] then raise exception 'bad_platform' using errcode = 'P0001'; end if;
  else
    -- 沒帶種類：舊頁面。平台照第二版那五個，種類照第二版的猜法（有拍攝指示算影片，有選平台算貼文，其他算其他）。
    if not v_pf <@ array['ig_carousel', 'ig_story', 'fb_single', 'threads_text', 'other']::text[] then raise exception 'bad_platform' using errcode = 'P0001'; end if;
    v_kind := case when exists (select 1 from jsonb_array_elements(v_shots) s where not (s->>'is_closing')::boolean) then 'video'
                   when cardinality(v_pf) > 0 then 'post' else 'other' end;
  end if;
  insert into requests (kind, title, purpose, needed_by, brief, asset_links, contact, requester,
                        owner_id, owner_team, goal_cta, platforms, platform_other, key_line, must_have, draft, draft_doc_url,
                        visual_refs, publish_on, other_notes, shots, event_id)
  values (v_kind, left(btrim(p_req->>'title'), 200), '', null, '', '{}', left(coalesce(btrim(p_req->>'contact'), ''), 200), auth.uid(),
          v_owner, left(coalesce(btrim(p_req->>'owner_team'), ''), 100), left(coalesce(btrim(p_req->>'goal_cta'), ''), 500), v_pf,
          case when 'other' = any(v_pf) then left(coalesce(btrim(p_req->>'platform_other'), ''), 200) else '' end,
          left(coalesce(btrim(p_req->>'key_line'), ''), 500),
          public.rq_clean_must(p_req->'must_have'), left(coalesce(p_req->>'draft', ''), 20000), left(coalesce(btrim(p_req->>'draft_doc_url'), ''), 1000),
          public.rq_clean_refs(p_req->'visual_refs'), v_date, left(coalesce(p_req->>'other_notes', ''), 5000), v_shots, v_ev)
  returning id into v_id;
  for v_to in
    select distinct u.email from assignments a join auth.users u on u.id = a.user_id
     where a.workspace_id = 'custom:marketing-requests' and a.level = 'manage' and u.email is not null
  loop
    perform public.queue_request_mail('request_new', v_to, v_id); v_n := v_n + 1;
  end loop;
  if v_n > 0 then perform public.request_try_send(); end if;
  return v_id;
end $function$;

-- 財務的人挑活動用：每一場的 id、名字、日期（新的在前）。
create or replace function public.fin_event_options()
returns jsonb language plpgsql stable security definer
set search_path = public, pg_temp
as $$
begin
  perform public.fin_require_view();
  return coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'slug', e.slug, 'title_zh', e.title_zh, 'title_en', e.title_en, 'starts_at', e.starts_at)
                     order by e.starts_at desc nulls last) from events e), '[]'::jsonb);
end $$;
revoke all on function public.fin_event_options() from public, anon;
grant execute on function public.fin_event_options() to authenticated;

create or replace function public.event_links(p_event uuid)
returns jsonb language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare e record; v_money jsonb := null; v_req jsonb := '[]'::jsonb;
begin
  if not public.is_cadre() then raise exception 'not_cadre' using errcode = 'P0001'; end if;
  select * into e from events where id = p_event;
  if e.id is null then raise exception 'no_such_event' using errcode = 'P0001'; end if;
  if public.can_view_finance() then
    select jsonb_build_object(
             'income',  coalesce(sum(amount_twd) filter (where kind = 'income'), 0),
             'expense', coalesce(sum(amount_twd) filter (where kind = 'expense'), 0),
             'n', count(*))
      into v_money from fin_transactions where event_id = p_event and voided_at is null;
  end if;
  if public.can_view(e.workspace_id) or public.can_view('custom:marketing-requests') then
    select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'title', r.title, 'kind', r.kind, 'status', r.status, 'publish_on', r.publish_on, 'created_at', r.created_at)
             order by r.created_at desc), '[]'::jsonb)
      into v_req from requests r where r.event_id = p_event;
  end if;
  return jsonb_build_object('money', v_money, 'requests', v_req);
end $$;
revoke all on function public.event_links(uuid) from public, anon;
grant execute on function public.event_links(uuid) to authenticated;

commit;

-- ---------- 驗收 ----------
select * from (
  -- submit_request 有兩支（舊頁面那支不收 event_id），只看收 jsonb 的那一支。
  with fn as (select proname, regexp_replace(prosrc, '--[^\n]*', '', 'g') as body from pg_proc where pronamespace = 'public'::regnamespace
               and not (proname = 'submit_request' and pg_get_function_identity_arguments(oid) <> 'p_req jsonb')),
  t as (
    select (select count(*) = 2 from information_schema.columns where table_schema = 'public' and column_name = 'event_id' and table_name in ('fin_transactions', 'requests')) as cols,
           (select bool_and(body like '%event_id%') from fn where proname in ('fin_add_transaction', 'fin_update_transaction', 'submit_request')) as writes,
           (select bool_and(body like '%fin_require_edit()%') from fn where proname in ('fin_add_transaction', 'fin_update_transaction')) as fin_gate,
           (select body like '%can_view_finance()%' and body like '%can_view(e.workspace_id)%' from fn where proname = 'event_links') as links_gate,
           (select body like '%fin_require_view()%' from fn where proname = 'fin_event_options') as opts_gate,
           (select bool_and(not has_function_privilege('anon', p.oid, 'execute')) from pg_proc p where p.pronamespace = 'public'::regnamespace
              and p.proname in ('event_links', 'fin_event_options', 'fin_check_event')) as anon_out
  )
  select 0 ord, 'OVERALL' as 項目, null::text as 應該是, null::text as 實際是,
    case when cols and writes and fin_gate and links_gate and opts_gate and anon_out then 'PASS' else 'FAIL' end as 結果 from t
  union all select 1, '收支與需求單各多一欄 event_id', 'true', cols::text, case when cols then 'PASS' else 'FAIL' end from t
  union all select 2, '記一筆、改一筆、送需求單都收 event_id', 'true', writes::text, case when writes then 'PASS' else 'FAIL' end from t
  union all select 3, '★ 記錢的門沒變（fin_require_edit）', 'true', fin_gate::text, case when fin_gate then 'PASS' else 'FAIL' end from t
  union all select 4, '★ 活動頁的錢只給看得到財務的人，需求單只給看得到那場的人', 'true', links_gate::text, case when links_gate then 'PASS' else 'FAIL' end from t
  union all select 5, '財務挑活動要看得到財務', 'true', opts_gate::text, case when opts_gate then 'PASS' else 'FAIL' end from t
  union all select 6, '★ anon 一支都叫不到', 'true', anon_out::text, case when anon_out then 'PASS' else 'FAIL' end from t
) x order by ord;
