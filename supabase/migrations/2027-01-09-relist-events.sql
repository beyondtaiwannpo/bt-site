-- 撤下來的活動可以再上去（2026-11-25）。
--
-- Paul 的原話（貼著後台「上架」那一塊的截圖，上面只有一句「Unpublished; not visible publicly. Mark ready again to relist it.」，沒有任何按鈕）：
--   「how do i push that live agian? lke now I have no where to puch it live again」
--
-- 原因：一場活動從對外頁撤下來之後狀態是 archived。畫面上那一句叫人「先按準備好了」，
--   可是 set_event_ready() 只收 draft 與 ready，archived 的會被擋（already_published），畫面也沒有畫那顆按鈕。
--   所以撤下來的活動沒有任何一條路回得去，這是一開始（2026-11-01）就有的洞。
--
-- 這一支做什麼：
--   set_event_ready() 重寫一次，只多一件事：**上過對外頁、後來被撤下來的**（status = archived 而且 published_at 有值）也可以按「準備好了」，
--   變回 ready。接下來跟第一次一樣：Co-President 或 Senior Adviser 按「放上對外頁」才真的上去。
--
-- 沒有動的：
--   - 誰按得了沒有變：「準備好了」還是那個工作區「管」的人（can_manage），「放上對外頁」還是 Co-President 與 Senior Adviser（publish_event 沒有動）。
--   - 按「準備好了」的那幾項檢查照舊再跑一次：中英文名稱都要有、要有開始時間（或通常在幾月、或多數年份都會辦）、封面要有同意。
--   - **只在紀錄裡的舊活動上不去。** 它們也是 archived，可是從來沒上過對外頁（published_at 是空的），
--     這一支照舊擋，換一個講得清楚的代號 not_relistable。2027-01-08 那三場「名稱沒有紀錄」的過去活動也是這一種。
--   - 沒有新的表、沒有新的欄位、沒有動 RLS，publish_event、unpublish_event、save_event 一行都沒改。
--
-- 可以重跑。跑完看最後那張表，每一列都要是 PASS。
-- ⚠ 之後如果重跑 2026-12-31-programmes.sql 或 2026-11-01-events.sql，要再跑一次這一支，不然 set_event_ready 會被換回舊的版本（撤下來的活動又回不去）。

begin;

-- 跟 2026-12-31-programmes.sql 那一版只差 p_ready 那一段最前面的那個判斷。
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
    -- 2027-01-09：撤下來的（archived 而且上過對外頁）可以再按一次。從來沒上過的 archived 是只在紀錄裡的舊活動，上不去。
    if e.status = 'archived' and e.published_at is null then raise exception 'not_relistable' using errcode = 'P0001'; end if;
    if e.status not in ('draft', 'ready', 'archived') then raise exception 'already_published' using errcode = 'P0001'; end if;
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

commit;

-- ---------- 驗收 ----------
select * from (
  with fn as (select proname, oid, regexp_replace(prosrc, '--[^\n]*', '', 'g') as body from pg_proc where pronamespace = 'public'::regnamespace),
  t as (
    select
      (select body like '%if not public.can_manage(e.workspace_id) then raise exception ''not_allowed''%' from fn where proname = 'set_event_ready') as gate_ok,
      (select body like '%e.status = ''archived'' and e.published_at is null then raise exception ''not_relistable''%'
              and body like '%e.status not in (''draft'', ''ready'', ''archived'') then raise exception ''already_published''%' from fn where proname = 'set_event_ready') as relist_ok,
      (select body like '%need_both_titles%' and body like '%need_start%' and body like '%consent_required%' and body like '%e.usual_month is null and not e.recurring%' from fn where proname = 'set_event_ready') as checks_ok,
      (select body like '%if e.status <> ''ready'' then raise exception ''not_ready''%' and body like '%status = ''draft''%' from fn where proname = 'set_event_ready') as unready_ok,
      (select body like '%perform public.require_senior()%' and body like '%if e.status <> ''ready'' then raise exception ''not_ready''%' from fn where proname = 'publish_event') as publish_untouched,
      (select not has_function_privilege('anon', oid, 'execute') and has_function_privilege('authenticated', oid, 'execute') from fn where proname = 'set_event_ready') as grants_ok,
      (select count(*) from public.public_events() x join public.events e on e.slug = x.slug where e.status <> 'published') = 0 as public_untouched,
      (select count(*)::int from public.events where status = 'archived' and published_at is not null) as can_relist,
      (select count(*)::int from public.events where status = 'archived' and published_at is null) as records_only
  )
  select 0 ord, 'OVERALL' as 項目, null::text as 應該是, null::text as 實際是,
    case when gate_ok and relist_ok and checks_ok and unready_ok and publish_untouched and grants_ok and public_untouched then 'PASS' else 'FAIL' end as 結果 from t
  union all select 1, '★ 按得了的人沒有變：那個工作區「管」的人', 'true', coalesce(gate_ok, false)::text, case when gate_ok then 'PASS' else 'FAIL' end from t
  union all select 2, '★ 撤下來的（上過對外頁）可以再準備好；從來沒上過的舊活動照舊擋', 'true', coalesce(relist_ok, false)::text, case when relist_ok then 'PASS' else 'FAIL' end from t
  union all select 3, '名稱、開始時間、封面同意那幾項檢查都還在', 'true', coalesce(checks_ok, false)::text, case when checks_ok then 'PASS' else 'FAIL' end from t
  union all select 4, '退回草稿那一半沒有變', 'true', coalesce(unready_ok, false)::text, case when unready_ok then 'PASS' else 'FAIL' end from t
  union all select 5, '★ 放上對外頁那一支沒有動：還是 Co-President 與 Senior Adviser，而且要先準備好', 'true', coalesce(publish_untouched, false)::text, case when publish_untouched then 'PASS' else 'FAIL' end from t
  union all select 6, '★ 沒登入的人叫不到', 'true', coalesce(grants_ok, false)::text, case when grants_ok then 'PASS' else 'FAIL' end from t
  union all select 7, '對外的活動清單只回上架的', 'true', public_untouched::text, case when public_untouched then 'PASS' else 'FAIL' end from t
  union all select 8, '（數字）現在撤下來、可以再上去的活動有幾場', '', can_relist::text, 'INFO' from t
  union all select 9, '（數字）只在紀錄裡、上不去的舊活動有幾場', '', records_only::text, 'INFO' from t
) x order by ord;
