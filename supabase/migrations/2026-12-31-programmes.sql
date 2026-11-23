-- 計畫（programme）：一筆資料餵三頁　2026-11-22（Paul：現在開放、這一年、團隊三頁要讀同一份資料）
--
-- 用法：整份貼進 Supabase SQL Editor 按一次 Run。可以重跑。最後印一張 PASS / FAIL 表。
-- 要先跑過 2026-12-30-island-map.sql（順序照日期）。
-- ⚠ 跑過這一支之後不要再重跑 2026-11-01-events.sql：那一支裡的 public_events() 是舊的欄位，重跑會整支失敗（回傳欄位不一樣，Postgres 不讓它蓋），
--   save_event() 與 set_event_ready() 也會被蓋回舊版。真的重跑了，再跑一次這一支就回來了。
--
-- ============================================================================
-- 這一支在做什麼
-- ============================================================================
-- 不開新表。「計畫」就是 events 表裡的一列，多四個欄位：
--   1. usual_month：通常在幾月（1 到 12，可以空）。沒有確定日期的時候，對外的「這一年」照這一欄排。
--   2. recurring：多數年份都會辦（固定計畫）。勾了會出現在「團隊」頁那個 team 的固定計畫裡。
--   3. edition_zh、edition_en：這一屆叫什麼（例如寒假探索營這一屆叫 Overseas Unpacked）。可以空。
--   4. public_events()、public_event(代號)：原本的 20 欄一欄不少、順序不變，最後面多這四欄。
--      回傳欄位變了，所以要先 drop 再建，權限照原樣重發（沒登入的人與登入的人都叫得到）。
--      兩個小地方跟著改：is_past 不會是空的（沒有開始也沒有結束時間的那一列算「還沒過去」）；排序是 starts_at，沒有日期的排最後。
--   5. set_event_ready()：原本一定要有開始時間才按得了「準備好了」。現在有填「通常在幾月」或勾了「多數年份都會辦」的，沒有日期也可以。
--      其他的門一字不改（要「管」、要中英標題、封面有填要勾同意）。
--   6. save_event()：多收這四個鍵。沒帶這四個鍵的舊呼叫照舊，原本的欄位不動。月份不是 1 到 12 就擋（bad_month）。
--   7. 最後一段是 seed：五筆已知的計畫。用線框起來了，不要的話整段刪掉再跑，前面不受影響。
-- 沒動的：events 表的 RLS、誰能開活動、誰能放上對外頁、create_event()、publish_event()。
-- ============================================================================

begin;

-- ---------- 1. 四個欄位 ----------
alter table public.events add column if not exists usual_month smallint check (usual_month is null or usual_month between 1 and 12);
alter table public.events add column if not exists recurring boolean not null default false;
alter table public.events add column if not exists edition_zh text not null default '';
alter table public.events add column if not exists edition_en text not null default '';
comment on column public.events.usual_month is '通常在幾月（1 到 12）。沒有確定日期的時候，對外的「這一年」照這一欄排。空的 = 沒填。2026-12-31。';
comment on column public.events.recurring is '多數年份都會辦的固定計畫。勾了會出現在「團隊」頁那個 team 的固定計畫裡。2026-12-31。';
comment on column public.events.edition_zh is '這一屆叫什麼（中文）。例如寒假探索營這一屆叫 Overseas Unpacked。空的 = 沒有另外取名。2026-12-31。';
comment on column public.events.edition_en is '這一屆叫什麼（英文）。2026-12-31。';

-- ---------- 2. 準備好了：有「通常在幾月」或「多數年份都會辦」的，沒有日期也可以 ----------
-- 2026-11-01 那一版整支重建，唯一的差別是 need_start 那一行。
create or replace function public.set_event_ready(p_id uuid, p_ready boolean)
returns text language plpgsql security definer
set search_path = public, pg_temp
as $$
declare e record;
begin
  select * into e from events where id = p_id;
  if e.id is null then raise exception 'no_such_event' using errcode = 'P0001'; end if;
  if not public.can_manage(e.workspace_id) then raise exception 'not_allowed' using errcode = 'P0001'; end if;
  if p_ready then
    if e.status not in ('draft', 'ready') then raise exception 'already_published' using errcode = 'P0001'; end if;
    if coalesce(btrim(e.title_zh), '') = '' or coalesce(btrim(e.title_en), '') = '' then raise exception 'need_both_titles' using errcode = 'P0001'; end if;
    -- 2026-12-31：計畫可以沒有日期，但要嘛有「通常在幾月」，要嘛是「多數年份都會辦」。三樣都沒有的照舊擋。
    if e.starts_at is null and e.usual_month is null and not e.recurring then raise exception 'need_start' using errcode = 'P0001'; end if;
    if e.cover_url is not null and not e.cover_consent then raise exception 'consent_required' using errcode = 'P0001'; end if;
    update events set status = 'ready', updated_at = now() where id = p_id;
    return 'ready';
  else
    if e.status <> 'ready' then raise exception 'not_ready' using errcode = 'P0001'; end if;
    update events set status = 'draft', updated_at = now() where id = p_id;
    return 'draft';
  end if;
end $$;
revoke all on function public.set_event_ready(uuid, boolean) from public, anon;
grant execute on function public.set_event_ready(uuid, boolean) to authenticated;

-- ---------- 3. 改內容：多收四個鍵 ----------
-- 2026-11-01 那一版整支重建。原本的鍵一字不改；多 usual_month、recurring、edition_zh、edition_en。
-- usual_month 給空字串或 null 是清掉；不是 1 到 12 的整數就擋（bad_month）。
create or replace function public.save_event(p_id uuid, p_patch jsonb)
returns uuid language plpgsql security definer
set search_path = public, pg_temp
as $$
declare e record; v_cover text; v_month text;
begin
  select * into e from events where id = p_id;
  if e.id is null then raise exception 'no_such_event' using errcode = 'P0001'; end if;
  if not public.can_edit(e.workspace_id) then raise exception 'not_allowed' using errcode = 'P0001'; end if;
  v_cover := nullif(btrim(coalesce(p_patch->>'cover_url', e.cover_url, '')), '');
  if v_cover is not null and v_cover !~ '^https://' then raise exception 'cover_not_https' using errcode = 'P0001'; end if;
  v_month := nullif(btrim(coalesce(p_patch->>'usual_month', '')), '');
  if v_month is not null and v_month !~ '^([1-9]|1[0-2])$' then raise exception 'bad_month' using errcode = 'P0001'; end if;
  update events set
    title_zh   = coalesce(p_patch->>'title_zh', title_zh),
    title_en   = coalesce(p_patch->>'title_en', title_en),
    summary_zh = coalesce(p_patch->>'summary_zh', summary_zh),
    summary_en = coalesce(p_patch->>'summary_en', summary_en),
    body_zh    = coalesce(p_patch->>'body_zh', body_zh),
    body_en    = coalesce(p_patch->>'body_en', body_en),
    cover_url  = case when p_patch ? 'cover_url' then v_cover else cover_url end,
    -- 換了封面就要重新勾同意（同意是對那一張照片的）。
    cover_consent = case when p_patch ? 'cover_url' and v_cover is distinct from cover_url then false
                         when p_patch ? 'cover_consent' then (p_patch->>'cover_consent')::boolean else cover_consent end,
    starts_at  = case when p_patch ? 'starts_at' then nullif(p_patch->>'starts_at', '')::timestamptz else starts_at end,
    ends_at    = case when p_patch ? 'ends_at' then nullif(p_patch->>'ends_at', '')::timestamptz else ends_at end,
    place      = coalesce(p_patch->>'place', place),
    capacity   = coalesce((p_patch->>'capacity')::int, capacity),
    -- 2026-12-31 計畫的四欄。沒帶鍵就不動。
    usual_month = case when p_patch ? 'usual_month' then v_month::smallint else usual_month end,
    recurring   = case when p_patch ? 'recurring' then coalesce((p_patch->>'recurring')::boolean, false) else recurring end,
    edition_zh  = coalesce(btrim(p_patch->>'edition_zh'), edition_zh),
    edition_en  = coalesce(btrim(p_patch->>'edition_en'), edition_en),
    updated_at = now()
  where id = p_id;
  return p_id;
end $$;
revoke all on function public.save_event(uuid, jsonb) from public, anon;
grant execute on function public.save_event(uuid, jsonb) to authenticated;

-- ---------- 4. 對外：原本 20 欄照舊，最後面多四欄 ----------
-- 回傳欄位變了，create or replace 蓋不過去，要先 drop。drop 與重建在同一個 transaction 裡，中間沒有一刻是叫不到的。
-- 一樣只回 published 的、只回對外要印的欄位。
drop function if exists public.public_event(text);
drop function if exists public.public_events();
create function public.public_events()
returns table (
  slug text, team text, title_zh text, title_en text, summary_zh text, summary_en text, body_zh text, body_en text,
  cover_url text, starts_at timestamptz, ends_at timestamptz, place text, capacity int,
  form_id uuid, signup_open boolean, signup_opens_at timestamptz, signup_closes_at timestamptz, signed_up int, is_full boolean, is_past boolean,
  usual_month smallint, recurring boolean, edition_zh text, edition_en text)
language sql stable security definer
set search_path = public, pg_temp
as $$
  select e.slug, e.team, e.title_zh, e.title_en, e.summary_zh, e.summary_en, e.body_zh, e.body_en,
         e.cover_url, e.starts_at, e.ends_at, e.place, e.capacity,
         e.form_id,
         (f.id is not null and f.status = 'open' and (f.opens_at is null or now() >= f.opens_at) and (f.closes_at is null or now() <= f.closes_at)) as signup_open,
         f.opens_at, f.closes_at,
         coalesce((select count(*)::int from applications a where a.form_id = f.id and a.status <> 'rejected'), 0) as signed_up,
         (e.capacity > 0 and coalesce((select count(*) from applications a where a.form_id = f.id and a.status <> 'rejected'), 0) >= e.capacity) as is_full,
         -- 沒有開始也沒有結束時間的（只有「通常在幾月」或固定計畫）算還沒過去，不回空的。
         -- 只知道哪一天、還不知道幾點的（後台時間填台灣的半夜十二點、沒有結束時間），整個那一天都還不算過去，隔天半夜才算。
         -- 不這樣的話，寒假探索營在活動當天一過半夜就會從「近期活動」消失。
         coalesce(coalesce(e.ends_at,
                           case when (e.starts_at at time zone 'Asia/Taipei')::time = time '00:00' then e.starts_at + interval '1 day' else e.starts_at end) < now(), false) as is_past,
         e.usual_month, e.recurring, e.edition_zh, e.edition_en
    from events e left join forms f on f.id = e.form_id
   where e.status = 'published'
   -- 有日期的照日期，沒有日期的排最後；沒有日期的那幾筆彼此照「通常在幾月」再照代號，每次回來順序一樣。
   order by e.starts_at nulls last, e.usual_month nulls last, e.slug
$$;
create function public.public_event(p_slug text)
returns table (
  slug text, team text, title_zh text, title_en text, summary_zh text, summary_en text, body_zh text, body_en text,
  cover_url text, starts_at timestamptz, ends_at timestamptz, place text, capacity int,
  form_id uuid, signup_open boolean, signup_opens_at timestamptz, signup_closes_at timestamptz, signed_up int, is_full boolean, is_past boolean,
  usual_month smallint, recurring boolean, edition_zh text, edition_en text)
language sql stable security definer
set search_path = public, pg_temp
as $$ select * from public.public_events() where slug = p_slug $$;
revoke all on function public.public_events(), public.public_event(text) from public;
grant execute on function public.public_events(), public.public_event(text) to anon, authenticated;

commit;

-- ============================================================================
-- ▼▼▼ seed 從這裡開始：五筆已知的計畫。不要的話從這一行刪到「seed 到這裡結束」那一行，前面與後面的驗收都不受影響。▼▼▼
-- ============================================================================
-- 只放確定的事：哪個 team、中英名稱、這一屆叫什麼、是不是固定計畫、通常幾月、確定的日期。說明、地點、時間都沒填，後台再補。
-- 直接是 published，跑完就會出現在對外頁。代號已經有人用（on conflict）就整筆跳過，後台改過的字不會被蓋掉。
-- 每一筆照 create_event() 的做法配一個工作區 custom:event-<代號>，team 欄填那個 team，所以那個 team「改」以上的人在後台改得動。
-- 沒有擁有人、沒有報名表（要開放報名，到後台那一場按「加一張報名表」）。
-- 寒假探索營的日期確定是 2027-01-03，時間還不知道，所以填台北時間 00:00（對外頁把台北時間半夜當成「只有日期」）。
begin;

create temp table _programme_seed (
  slug text, team text, title_zh text, title_en text, edition_zh text, edition_en text,
  recurring boolean, usual_month smallint, starts_at timestamptz
) on commit drop;
insert into _programme_seed values
  ('winter-bootcamp', 'Curriculum Team', '寒假探索營',     'Winter College Bootcamp',  'Overseas Unpacked', 'Overseas Unpacked', true, 1,    '2027-01-03 00:00+08'),
  ('intern-intake',   'Internship Team', '高中生實習招募', 'High school intern intake', '',                  '',                  true, 8,    null),
  ('mentor-matching', 'Mentorship Team', 'Mentor 配對',    'Mentor matching',          '',                  '',                  true, null, null),
  ('coffee-chat',     'Mentorship Team', 'Coffee chat',    'Coffee chat',              '',                  '',                  true, null, null),
  ('essay-ecosystem', 'Mentorship Team', 'Essay ecosystem', 'Essay ecosystem',         '',                  '',                  true, null, null);

-- 代號還沒有人用的才建工作區（已經有那個代號的活動，就用它原本的工作區）。
insert into public.workspaces (id, kind, team, title_zh, title_en)
select 'custom:event-' || s.slug, 'custom', s.team, s.title_zh, s.title_en
  from _programme_seed s
 where not exists (select 1 from public.events e where e.slug = s.slug)
on conflict (id) do nothing;

insert into public.events (slug, team, workspace_id, title_zh, title_en, edition_zh, edition_en, recurring, usual_month, starts_at, status, published_at)
select s.slug, s.team, 'custom:event-' || s.slug, s.title_zh, s.title_en, s.edition_zh, s.edition_en, s.recurring, s.usual_month, s.starts_at, 'published', now()
  from _programme_seed s
on conflict (slug) do nothing;

commit;
-- ============================================================================
-- ▲▲▲ seed 到這裡結束 ▲▲▲
-- ============================================================================

-- ---------- 驗收 ----------
select * from (
  with fn as (
    select p.proname, p.prosecdef, p.proargnames, p.proconfig, regexp_replace(p.prosrc, '--[^\n]*', '', 'g') as body
      from pg_proc p where p.pronamespace = 'public'::regnamespace
       and p.proname in ('public_events', 'public_event', 'save_event', 'set_event_ready')
  ), t as (
    select (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'events'
              and column_name in ('usual_month', 'recurring', 'edition_zh', 'edition_en')) as cols,
           exists (select 1 from pg_constraint c where c.conrelid = 'public.events'::regclass and c.contype = 'c'
                     and pg_get_constraintdef(c.oid) like '%usual_month%') as month_check,
           (select proargnames = array['slug', 'team', 'title_zh', 'title_en', 'summary_zh', 'summary_en', 'body_zh', 'body_en',
                                       'cover_url', 'starts_at', 'ends_at', 'place', 'capacity',
                                       'form_id', 'signup_open', 'signup_opens_at', 'signup_closes_at', 'signed_up', 'is_full', 'is_past',
                                       'usual_month', 'recurring', 'edition_zh', 'edition_en']::text[] from fn where proname = 'public_events') as sig_all,
           (select proargnames[2:25] = (select proargnames from fn where proname = 'public_events') from fn where proname = 'public_event') as sig_one,
           (select bool_and(prosecdef and proconfig::text like '%search_path=public, pg_temp%') from fn) as definer,
           (select body like '%e.status = ''published''%' and body like '%then e.starts_at + interval ''1 day'' else e.starts_at end) < now(), false) as is_past%'
                   and body like '%order by e.starts_at nulls last%' from fn where proname = 'public_events') as pub_body,
           (select count(*) from public.public_events() where is_past is null) as past_null,
           (select count(*) from public.public_events() x join public.events e on e.slug = x.slug where e.status <> 'published') as leaked,
           has_function_privilege('anon', 'public.public_events()', 'execute') and has_function_privilege('anon', 'public.public_event(text)', 'execute')
             and has_function_privilege('authenticated', 'public.public_events()', 'execute') and has_function_privilege('authenticated', 'public.public_event(text)', 'execute') as pub_exec,
           not has_table_privilege('anon', 'public.events', 'select') as anon_no_table,
           not has_function_privilege('anon', 'public.save_event(uuid, jsonb)', 'execute') and not has_function_privilege('anon', 'public.set_event_ready(uuid, boolean)', 'execute') as anon_no_write,
           (select count(*) from pg_policies where schemaname = 'public' and tablename = 'events' and cmd <> 'SELECT') as write_pols,
           (select body like '%e.starts_at is null and e.usual_month is null and not e.recurring%' and body like '%can_manage(e.workspace_id)%'
                   and body like '%need_both_titles%' and body like '%consent_required%' from fn where proname = 'set_event_ready') as ready_gate,
           (select body like '%can_edit(e.workspace_id)%' and body like '%bad_month%' and body like '%p_patch ? ''usual_month''%' and body like '%p_patch ? ''recurring''%'
                   and body like '%edition_zh%' and body like '%edition_en%' and body like '%cover_not_https%' from fn where proname = 'save_event') as save_keys,
           (select count(*) from public.events where slug in ('winter-bootcamp', 'intern-intake', 'mentor-matching', 'coffee-chat', 'essay-ecosystem')) as seeded
  )
  select 0 ord, 'OVERALL' as 項目, null::text as 應該是, null::text as 實際是,
    case when cols = 4 and month_check and sig_all and sig_one and definer and pub_body and past_null = 0 and leaked = 0 and pub_exec and anon_no_table and anon_no_write
              and write_pols = 0 and ready_gate and save_keys then 'PASS' else 'FAIL' end as 結果 from t
  union all select 1, 'events 多四個欄位，月份只收 1 到 12', '4|true', cols::text || '|' || month_check::text, case when cols = 4 and month_check then 'PASS' else 'FAIL' end from t
  union all select 2, '★ public_events() 原本 20 欄照舊，最後多四欄；public_event() 同一份', 'true|true', sig_all::text || '|' || sig_one::text, case when sig_all and sig_one then 'PASS' else 'FAIL' end from t
  union all select 3, '★ 對外兩支只回 published、is_past 不會是空的、沒有日期的排最後', 'true|0|0', pub_body::text || '|' || past_null::text || '|' || leaked::text, case when pub_body and past_null = 0 and leaked = 0 then 'PASS' else 'FAIL' end from t
  union all select 4, '四支函式都是 security definer、search_path 鎖著', 'true', definer::text, case when definer then 'PASS' else 'FAIL' end from t
  union all select 5, '★ 沒登入叫得到對外兩支；讀不到 events 表、叫不到寫的兩支', 'true|true|true', pub_exec::text || '|' || anon_no_table::text || '|' || anon_no_write::text, case when pub_exec and anon_no_table and anon_no_write then 'PASS' else 'FAIL' end from t
  union all select 6, '★ events 還是沒有寫的政策（寫一律走函式）', '0', write_pols::text, case when write_pols = 0 then 'PASS' else 'FAIL' end from t
  union all select 7, '準備好了：沒有日期要有「通常在幾月」或「多數年份都會辦」，其他的門都還在', 'true', ready_gate::text, case when ready_gate then 'PASS' else 'FAIL' end from t
  union all select 8, 'save_event() 收四個新的鍵，原本的門都還在', 'true', save_keys::text, case when save_keys then 'PASS' else 'FAIL' end from t
  -- seed 那一段可以整段刪掉，所以這一列不算進 OVERALL。5 = 五筆都在；少於 5 = seed 被拿掉了。
  union all select 9, '（參考）seed 的五筆計畫在不在', '5', seeded::text, case when seeded = 5 then 'PASS' else '沒有 seed' end from t
) x order by ord;
