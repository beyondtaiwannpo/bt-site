-- 行銷需求單第二版　2026-11-09
--
-- 用法：整份貼進 Supabase SQL Editor 按一次 Run。可以重跑。最後印一張 PASS / FAIL 表。
-- **要先跑過 2026-10-31-marketing-requests.sql 與 2026-11-08-finance.sql**（順序照日期）。
-- ⚠ 跑過這一支之後**不要再重跑 2026-10-31 那支**：它會把三支函式蓋回第一版（只認 new／done 的那一版）。
--   真的不小心重跑了，再跑一次這一支就裝回來。
--
-- Paul 2026-11-08 把 Marketing 自己用的 Google Sheet 貼過來：「這些是我要人家送需求時填的」。
-- 欄位、狀態、7 天規則都在 docs/2026-11-08-行銷需求單-第二版欄位.md。
--
-- ============================================================================
-- 這一支在做什麼
-- ============================================================================
--   1. requests 多十五欄（Sheet 的 11 格加拍攝指示），**第一版的欄一欄都不刪**，舊的單照樣讀得到。Sheet 的 11 格對到：
--        1 Tag 與貼文名稱    → title（沿用第一版的欄，信裡的 {title} 不用改）
--        2 需求負責人        → owner_team、owner_id
--        3 目標與 CTA        → goal_cta
--        4 平台與類型        → platforms（ig_carousel／ig_story／fb_single／threads_text／other）、platform_other
--        5 一句話重點        → key_line
--        6 一定要有的資訊    → must_have，jsonb 陣列，一條是 {text, confirmed_by}（誰確認過是選填）
--        7 文案草稿或 bullet → draft、draft_doc_url
--        8 視覺參考          → visual_refs，jsonb 陣列，一條是 {url, note}
--        9 預計發布日        → publish_on（舊單沒有就看第一版的 needed_by；7 天規則只在畫面警告，這裡不擋）
--       10 其他備註          → other_notes
--       11 狀態              → status、assignee（接的人，只有 Marketing 那一邊設得了）
--      拍攝指示 → shots，jsonb 陣列，一列是 {who, what, seconds, note, is_closing}。
--      為什麼不另開一張表：拍攝列跟著單一起送、一起讀，不會單獨改；一欄 jsonb 不用多一套 RLS。
--      固定的「結尾話」那一列 is_closing = true，資料庫保證最多一列、一定排在最後。
--   2. 狀態改成 Sheet 的四個：submitted 已送出、in_progress 進行中、in_review 待審核、published 已發布，withdrawn 留著。
--      舊的列照對照表搬：new → submitted、done → published（in_progress 與 withdrawn 不變）。
--   3. submit_request(p_req jsonb)：新的送單函式，一包 jsonb 送進來（十幾個參數排成一排太容易對錯位置）。
--      第一版七個參數那支留著，網站還沒更新的那幾分鐘舊頁面照樣送得出去。
--   4. set_request_status()：認四個新狀態（舊頁面送 new／done 也照對照表轉）；第一次變成 published 寄信給送單的人，只寄一次。
--   5. set_request_assignee()：Marketing 那一邊（「改」以上）指定接的人，只能指定需求工作區裡的人。送單的人不行。
--   6. withdraw_request()：只有「已送出」時收得回。
--   7. request_assignees()：佇列上「接的人」下拉要的名單（需求工作區的成員）。
--   8. 兩封信：文案還是第一版預設值的換成第二版（「做完了」改「已發布」）；Paul 改過的不動。
--      信的種類名字 request_done 不改：它寫在 mail_outbox 的舊列、信件版型（2026-11-05）與後台好幾個地方，改名只會多一堆搬家。
--   RLS 不動：送單的人讀自己的、工作區「看」以上讀全部、沒有人直接寫。
-- ============================================================================

begin;

-- ---------- 1. 新欄位 ----------
alter table public.requests add column if not exists owner_id       uuid references public.profiles(id) on delete set null;
alter table public.requests add column if not exists owner_team     text not null default '';
alter table public.requests add column if not exists goal_cta       text not null default '';
alter table public.requests add column if not exists platforms      text[] not null default '{}';
alter table public.requests add column if not exists platform_other text not null default '';
alter table public.requests add column if not exists key_line       text not null default '';
alter table public.requests add column if not exists must_have      jsonb not null default '[]'::jsonb;
alter table public.requests add column if not exists draft          text not null default '';
alter table public.requests add column if not exists draft_doc_url  text not null default '';
alter table public.requests add column if not exists visual_refs    jsonb not null default '[]'::jsonb;
alter table public.requests add column if not exists publish_on     date;
alter table public.requests add column if not exists other_notes    text not null default '';
alter table public.requests add column if not exists assignee       uuid references public.profiles(id) on delete set null;
alter table public.requests add column if not exists shots          jsonb not null default '[]'::jsonb;
alter table public.requests add column if not exists published_at   timestamptz;  -- 第一次變成已發布的時間（信只寄這一次）

-- 平台只收這五個代號（畫面上的字在 admin/src/strings.js 的 rq.pf.*）。
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.requests'::regclass and conname = 'requests_platforms_check') then
    alter table public.requests add constraint requests_platforms_check
      check (platforms <@ array['ig_carousel', 'ig_story', 'fb_single', 'threads_text', 'other']::text[]);
  end if;
end $$;

-- ---------- 2. 狀態換成四個 ----------
do $$
declare v text;
begin
  for v in select conname from pg_constraint where conrelid = 'public.requests'::regclass and contype = 'c'
             and pg_get_constraintdef(oid) like '%status%' and conname <> 'requests_status_v2' loop
    execute format('alter table public.requests drop constraint %I', v);
  end loop;
end $$;
update public.requests set status = 'submitted' where status = 'new';
update public.requests set status = 'published', published_at = coalesce(published_at, updated_at) where status = 'done';
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.requests'::regclass and conname = 'requests_status_v2') then
    alter table public.requests add constraint requests_status_v2
      check (status in ('submitted', 'in_progress', 'in_review', 'published', 'withdrawn'));
  end if;
end $$;
alter table public.requests alter column status set default 'submitted';
create index if not exists requests_assignee on public.requests (assignee) where assignee is not null;

-- ---------- 3. 信：{needed_by} 現在是「預計發布日」，舊單沒有就用第一版的「什麼時候要」 ----------
create or replace function public.queue_request_mail(p_kind text, p_to text, p_req uuid)
returns uuid language plpgsql security definer
set search_path = public, pg_temp
as $$
declare r record; v_sub text; v_body text; v_link text; v_id uuid; v_date date;
begin
  select * into r from requests where id = p_req;
  if r.id is null then raise exception 'no_such_request' using errcode = 'P0001'; end if;
  v_link := 'https://beyondtaiwannpo.com/admin/#' || case when p_kind = 'request_done' then 'request/' else 'requests/' end || r.id::text;
  v_date := coalesce(r.publish_on, r.needed_by);
  select subject, body into v_sub, v_body from mail_templates where kind = p_kind;
  if v_sub is null then
    v_sub := case when p_kind = 'request_done' then '你的需求單已發布：{title}' else 'Marketing 需求單：{title}' end;
    v_body := '{requester}：「{title}」' || E'\n\n' || '{link}';
  end if;
  v_sub  := public.request_fill(v_sub,  public.request_name(r.requester), r.title, v_date, v_link, r.reply);
  v_body := public.request_fill(v_body, public.request_name(r.requester), r.title, v_date, v_link, r.reply)
         || public.mail_tail(p_kind);
  insert into mail_outbox (to_email, subject, body, kind, request_id) values (p_to, v_sub, v_body, p_kind, r.id) returning id into v_id;
  return v_id;
end $$;
revoke all on function public.queue_request_mail(text, text, uuid) from public, anon, authenticated;

-- 文案：還是第一版預設值（一字不差）的那一欄才換，Paul 在後台改過的不動。
-- 2026-11-05 起模板是中英分開四欄（subject_zh／body_zh／subject_en／body_en），subject 與 body 是算出來的、寫不進去。
-- 比對前去掉頭尾的換行：11-05 拆中英時，中文那段尾巴與英文那段開頭各留了一個換行。
update public.mail_templates set subject_zh = '你的需求單已發布：{title}'
 where kind = 'request_done' and subject_zh = '你的需求單做完了：{title}';
update public.mail_templates set subject_en = 'Your request is published: {title}'
 where kind = 'request_done' and subject_en = 'Your request is done: {title}';
update public.mail_templates set body_zh =
         '{requester} 你好，' || E'\n\n' ||
         '你送給 Marketing 的需求單「{title}」已經發布了。Marketing 的回覆：' || E'\n\n' ||
         '{reply}' || E'\n\n' ||
         '完整內容在這裡：' || E'\n' ||
         '{link}'
 where kind = 'request_done' and btrim(body_zh, E' \n') =
         '{requester} 你好，' || E'\n\n' ||
         '你送給 Marketing 的需求單「{title}」做完了。Marketing 的回覆：' || E'\n\n' ||
         '{reply}' || E'\n\n' ||
         '完整內容在這裡：' || E'\n' ||
         '{link}';
update public.mail_templates set body_en =
         'Hi {requester},' || E'\n\n' ||
         'Your request to Marketing, "{title}", is published. Their reply:' || E'\n\n' ||
         '{reply}' || E'\n\n' ||
         'Full details:' || E'\n' ||
         '{link}'
 where kind = 'request_done' and btrim(body_en, E' \n') =
         'Hi {requester},' || E'\n\n' ||
         'Your request to Marketing, "{title}", is done. Their reply:' || E'\n\n' ||
         '{reply}' || E'\n\n' ||
         'Full details:' || E'\n' ||
         '{link}';
update public.mail_templates set body_zh =
         'Marketing 的夥伴你好，' || E'\n\n' ||
         '{requester} 送了一張需求單給 Marketing：「{title}」，預計 {needed_by} 發布。' || E'\n' ||
         '全部欄位與拍攝指示都在這裡。先指定接的人、把狀態改成「進行中」，發布之後按「標成已發布」，對方會收到一封信：' || E'\n\n' ||
         '{link}'
 where kind = 'request_new' and btrim(body_zh, E' \n') =
         'Marketing 的夥伴你好，' || E'\n\n' ||
         '{requester} 送了一張需求單給 Marketing：「{title}」，希望 {needed_by} 前拿到。' || E'\n' ||
         '內容、素材連結與聯絡方式都在這裡，看完先把狀態改成「進行中」，做完標「做完了」，對方會收到一封信：' || E'\n\n' ||
         '{link}';
update public.mail_templates set body_en =
         'Hi Marketing team,' || E'\n\n' ||
         '{requester} sent a request to Marketing: "{title}", planned to publish on {needed_by}.' || E'\n' ||
         'Every field and the shooting plan are here. Pick who takes it, set it to "In progress", and press "Mark published" once it is out; the requester gets an email:' || E'\n\n' ||
         '{link}'
 where kind = 'request_new' and btrim(body_en, E' \n') =
         'Hi Marketing team,' || E'\n\n' ||
         '{requester} sent a request to Marketing: "{title}", needed by {needed_by}.' || E'\n' ||
         'The brief, asset links and contact are here. Set it to "In progress" when you pick it up and "Done" when it ships; the requester gets an email:' || E'\n\n' ||
         '{link}';

-- ---------- 4. 把送進來的 jsonb 整理乾淨（內部用） ----------
-- 一定要有的資訊：[{text, confirmed_by}]，空的那一列丟掉，最多 30 列。
create or replace function public.rq_clean_must(p jsonb)
returns jsonb language sql immutable
as $$
  select coalesce(jsonb_agg(jsonb_build_object('text', t, 'confirmed_by', c) order by n), '[]'::jsonb)
    from (select btrim(coalesce(e->>'text', '')) t, btrim(coalesce(e->>'confirmed_by', '')) c, n
            from jsonb_array_elements(case when jsonb_typeof(p) = 'array' then p else '[]'::jsonb end) with ordinality x(e, n)
           where jsonb_typeof(e) = 'object' and n <= 30) y
   where t <> '';
$$;
-- 視覺參考：[{url, note}]，沒有網址的那一列丟掉，最多 30 列。
create or replace function public.rq_clean_refs(p jsonb)
returns jsonb language sql immutable
as $$
  select coalesce(jsonb_agg(jsonb_build_object('url', u, 'note', t) order by n), '[]'::jsonb)
    from (select btrim(coalesce(e->>'url', '')) u, btrim(coalesce(e->>'note', '')) t, n
            from jsonb_array_elements(case when jsonb_typeof(p) = 'array' then p else '[]'::jsonb end) with ordinality x(e, n)
           where jsonb_typeof(e) = 'object' and n <= 30) y
   where u <> '';
$$;
-- 拍攝指示：[{who, what, seconds, note, is_closing}]。誰拍、拍什麼都空的列丟掉；秒數要是 0 到 600 的整數，不是就留空；
-- 結尾話最多一列、一定放最後（前端怎麼送都一樣）。最多 40 列。
create or replace function public.rq_clean_shots(p jsonb)
returns jsonb language sql immutable
as $$
  with raw as (
    select btrim(coalesce(e->>'who', '')) who, btrim(coalesce(e->>'what', '')) what, btrim(coalesce(e->>'note', '')) note,
           case when coalesce(e->>'seconds', '') ~ '^\s*\d{1,3}\s*$'
                then case when btrim(e->>'seconds')::int <= 600 then btrim(e->>'seconds')::int end end secs,
           coalesce(e->>'is_closing', '') in ('true', 't', '1') closing, n
      from jsonb_array_elements(case when jsonb_typeof(p) = 'array' then p else '[]'::jsonb end) with ordinality x(e, n)
     where jsonb_typeof(e) = 'object' and n <= 40
  ), body as (
    select * from raw where not closing and (who <> '' or what <> '')
  ), closing as (
    select * from raw where closing order by n limit 1
  ), all_rows as (
    select who, what, note, secs, false c, n from body
    union all
    select who, what, note, secs, true, 100000 from closing
  )
  select coalesce(jsonb_agg(jsonb_build_object('who', who, 'what', what, 'seconds', secs, 'note', note, 'is_closing', c) order by n), '[]'::jsonb)
    from all_rows;
$$;

-- ---------- 5. 送單（第二版） ----------
-- p_req 的鍵：title owner_id owner_team goal_cta platforms platform_other key_line must_have draft draft_doc_url
--             visual_refs publish_on other_notes shots contact。**assignee 不收**：接的人是 Marketing 那一邊指定的。
-- 7 天規則（Paul 2026-11-08）：只在畫面上警告，這裡不擋。
create or replace function public.submit_request(p_req jsonb)
returns uuid language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_id uuid; v_to text; v_n int := 0; v_owner uuid; v_pf text[]; v_date date; v_shots jsonb; v_kind text;
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
  if not v_pf <@ array['ig_carousel', 'ig_story', 'fb_single', 'threads_text', 'other']::text[] then
    raise exception 'bad_platform' using errcode = 'P0001';
  end if;
  begin v_date := nullif(p_req->>'publish_on', '')::date;
  exception when others then raise exception 'bad_date' using errcode = 'P0001'; end;
  v_shots := public.rq_clean_shots(p_req->'shots');
  -- 第一版的 kind 還在（舊的讀法用得到）：有拍攝指示算影片，有選平台算貼文，其他算其他。
  v_kind := case when exists (select 1 from jsonb_array_elements(v_shots) s where not (s->>'is_closing')::boolean) then 'video'
                 when cardinality(v_pf) > 0 then 'post' else 'other' end;
  insert into requests (kind, title, purpose, needed_by, brief, asset_links, contact, requester,
                        owner_id, owner_team, goal_cta, platforms, platform_other, key_line, must_have, draft, draft_doc_url,
                        visual_refs, publish_on, other_notes, shots)
  values (v_kind, left(btrim(p_req->>'title'), 200), '', null, '', '{}', left(coalesce(btrim(p_req->>'contact'), ''), 200), auth.uid(),
          v_owner, left(coalesce(btrim(p_req->>'owner_team'), ''), 100), left(coalesce(btrim(p_req->>'goal_cta'), ''), 500), v_pf,
          left(coalesce(btrim(p_req->>'platform_other'), ''), 200), left(coalesce(btrim(p_req->>'key_line'), ''), 500),
          public.rq_clean_must(p_req->'must_have'), left(coalesce(p_req->>'draft', ''), 20000), left(coalesce(btrim(p_req->>'draft_doc_url'), ''), 1000),
          public.rq_clean_refs(p_req->'visual_refs'), v_date, left(coalesce(p_req->>'other_notes', ''), 5000), v_shots)
  returning id into v_id;
  for v_to in
    select distinct u.email from assignments a join auth.users u on u.id = a.user_id
     where a.workspace_id = 'custom:marketing-requests' and a.level = 'manage' and u.email is not null
  loop
    perform public.queue_request_mail('request_new', v_to, v_id); v_n := v_n + 1;
  end loop;
  if v_n > 0 then perform public.request_try_send(); end if;
  return v_id;
end $$;
revoke all on function public.submit_request(jsonb) from public, anon;
grant execute on function public.submit_request(jsonb) to authenticated;

-- ---------- 6. 改狀態、寫回覆 ----------
-- 「改」以上。舊頁面送 new／done 照對照表轉。第一次變成 published 寄一封給送單的人（published_at 記著，退回再發布不重寄）。
create or replace function public.set_request_status(p_id uuid, p_status text, p_reply text)
returns text language plpgsql security definer
set search_path = public, pg_temp
as $$
declare r record; v_to text; v_st text;
begin
  if not public.can_edit('custom:marketing-requests') then raise exception 'not_allowed' using errcode = 'P0001'; end if;
  v_st := case p_status when 'new' then 'submitted' when 'done' then 'published' else p_status end;
  if v_st not in ('submitted', 'in_progress', 'in_review', 'published') then raise exception 'bad_status' using errcode = 'P0001'; end if;
  select * into r from requests where id = p_id;
  if r.id is null then raise exception 'no_such_request' using errcode = 'P0001'; end if;
  if r.status = 'withdrawn' then raise exception 'withdrawn' using errcode = 'P0001'; end if;
  update requests set status = v_st, reply = coalesce(p_reply, reply), updated_at = now(),
         published_at = case when v_st = 'published' then coalesce(published_at, now()) else published_at end
   where id = p_id;
  if v_st = 'published' and r.published_at is null then
    select email into v_to from auth.users where id = r.requester;
    if v_to is not null then
      perform public.queue_request_mail('request_done', v_to, p_id);
      perform public.request_try_send();
    end if;
  end if;
  return v_st;
end $$;
revoke all on function public.set_request_status(uuid, text, text) from public, anon;
grant execute on function public.set_request_status(uuid, text, text) to authenticated;

-- ---------- 7. 指定接的人 ----------
-- 「改」以上。只能指定需求工作區裡的幹部（任何等級），或清空（null）。
create or replace function public.set_request_assignee(p_id uuid, p_assignee uuid)
returns uuid language plpgsql security definer
set search_path = public, pg_temp
as $$
declare r record;
begin
  if not public.can_edit('custom:marketing-requests') then raise exception 'not_allowed' using errcode = 'P0001'; end if;
  select * into r from requests where id = p_id;
  if r.id is null then raise exception 'no_such_request' using errcode = 'P0001'; end if;
  if r.status = 'withdrawn' then raise exception 'withdrawn' using errcode = 'P0001'; end if;
  if p_assignee is not null and not exists (
       select 1 from assignments a join profiles p on p.id = a.user_id and p.role = 'cadre'
        where a.workspace_id = 'custom:marketing-requests' and a.user_id = p_assignee) then
    raise exception 'not_in_workspace' using errcode = 'P0001';
  end if;
  update requests set assignee = p_assignee, updated_at = now() where id = p_id;
  return p_assignee;
end $$;
revoke all on function public.set_request_assignee(uuid, uuid) from public, anon;
grant execute on function public.set_request_assignee(uuid, uuid) to authenticated;

-- 佇列「接的人」下拉要的名單。「看」以上才拿得到。
create or replace function public.request_assignees()
returns table (id uuid, name_zh text, name_en text, level text)
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
begin
  if not public.can_view('custom:marketing-requests') then raise exception 'not_allowed' using errcode = 'P0001'; end if;
  return query
    select p.id, p.name_zh, p.name_en, a.level from assignments a join profiles p on p.id = a.user_id and p.role = 'cadre'
     where a.workspace_id = 'custom:marketing-requests' order by coalesce(nullif(p.name_en, ''), p.name_zh);
end $$;
revoke all on function public.request_assignees() from public, anon;
grant execute on function public.request_assignees() to authenticated;

-- ---------- 8. 收回：只在「已送出」 ----------
create or replace function public.withdraw_request(p_id uuid)
returns text language plpgsql security definer
set search_path = public, pg_temp
as $$
declare r record;
begin
  select * into r from requests where id = p_id;
  if r.id is null or r.requester <> auth.uid() then raise exception 'not_yours' using errcode = 'P0001'; end if;
  if r.status <> 'submitted' then raise exception 'already_started' using errcode = 'P0001'; end if;
  update requests set status = 'withdrawn', updated_at = now() where id = p_id;
  return 'withdrawn';
end $$;
revoke all on function public.withdraw_request(uuid) from public, anon;
grant execute on function public.withdraw_request(uuid) to authenticated;

commit;

-- ---------- 驗收 ----------
select * from (
  with t as (
    select (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'requests'
              and column_name in ('owner_id', 'owner_team', 'goal_cta', 'platforms', 'platform_other', 'key_line', 'must_have', 'draft',
                                  'draft_doc_url', 'visual_refs', 'publish_on', 'other_notes', 'assignee', 'shots', 'published_at')) as cols,
           (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'requests'
              and column_name in ('kind', 'purpose', 'needed_by', 'brief', 'asset_links', 'contact')) as old_cols,
           (select count(*) from public.requests where status in ('new', 'done')) as old_status,
           exists (select 1 from pg_constraint where conrelid = 'public.requests'::regclass and conname = 'requests_status_v2') as has_check,
           (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'
              and p.proname in ('submit_request', 'set_request_status', 'set_request_assignee', 'withdraw_request', 'request_assignees',
                                'rq_clean_must', 'rq_clean_refs', 'rq_clean_shots')) as fns,
           position('''submitted''' in (select prosrc from pg_proc where proname = 'withdraw_request' limit 1)) > 0 as withdraw_v2,
           position('published_at is null' in (select prosrc from pg_proc where proname = 'set_request_status' limit 1)) > 0 as mail_once,
           position('not_in_workspace' in (select prosrc from pg_proc where proname = 'set_request_assignee' limit 1)) > 0 as assignee_gate,
           (select count(*) from pg_policies where schemaname = 'public' and tablename = 'requests') as pols,
           (select count(*) from public.requests) as n_rows
  )
  select 0 ord, 'OVERALL' as 項目, null::text as 應該是, null::text as 實際是,
    case when cols = 15 and old_cols = 6 and old_status = 0 and has_check and fns = 9 and withdraw_v2 and mail_once and assignee_gate and pols = 2
         then 'PASS' else 'FAIL' end as 結果 from t
  union all select 1, '★ 新的十五欄在', '15', cols::text, case when cols = 15 then 'PASS' else 'FAIL' end from t
  union all select 2, '★ 第一版的六欄還在（舊單讀得到）', '6', old_cols::text, case when old_cols = 6 then 'PASS' else 'FAIL' end from t
  union all select 3, '★ 沒有列還是舊狀態（new／done 都搬了）', '0', old_status::text, case when old_status = 0 then 'PASS' else 'FAIL' end from t
  union all select 4, '狀態的新檢查在', 'true', has_check::text, case when has_check then 'PASS' else 'FAIL' end from t
  union all select 5, '★ 函式在（兩支送單、改狀態、指定、收回、名單、三支整理）', '9', fns::text, case when fns = 9 then 'PASS' else 'FAIL' end from t
  union all select 6, '★ 收回只在「已送出」', 'true', withdraw_v2::text, case when withdraw_v2 then 'PASS' else 'FAIL' end from t
  union all select 7, '★ 已發布的信只寄一次', 'true', mail_once::text, case when mail_once then 'PASS' else 'FAIL' end from t
  union all select 8, '★ 接的人只能是需求工作區裡的人', 'true', assignee_gate::text, case when assignee_gate then 'PASS' else 'FAIL' end from t
  union all select 9, 'requests 還是只有兩條讀的政策、沒有寫的政策', '2', pols::text, case when pols = 2 then 'PASS' else 'FAIL' end from t
  union all select 10, '資訊：requests 現在幾張單', '（看一眼）', n_rows::text, 'PASS' from t
) x order by ord;
