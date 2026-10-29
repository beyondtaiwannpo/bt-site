-- 行銷需求單分三種：貼文、限動、影片　2026-11-19
--
-- 用法：整份貼進 Supabase SQL Editor 按一次 Run。可以重跑。最後印一張 PASS / FAIL 表。
-- **要先跑過 2026-11-09-marketing-requests-v2.sql**（順序照日期）。
--
-- Paul 2026-10-28：「我想像的是先選這是貼文還是影片，然後需求單長得不一樣，貼文不需要拍攝指示。」
-- 他定的三種：貼文、限動、影片。影片的平台：長影片、IG Reels、IG 限動影片。
--
-- ============================================================================
-- 這一支在做什麼
-- ============================================================================
--   1. requests.kind 多一種 story（原本是第一版的 poster／post／video／other，舊單照樣讀得到）。
--   2. 平台多三個代號給影片：long_video 長影片、ig_reels IG Reels、ig_story_video IG 限動影片。
--   3. submit_request() 重建：
--        - 送單時帶 kind（post／story／video）就照它存。沒帶（網站還沒更新的那幾分鐘的舊頁面）照第二版的猜法。
--        - 平台要對得上種類：貼文是 IG 輪播、FB 單圖、Threads 純文字、其他；影片是長影片、IG Reels、IG 限動影片、其他；
--          限動不用選，固定是 IG 限動。對不上就擋（bad_platform）。
--        - 貼文與限動不收拍攝指示（畫面上也沒有那一段），送進來也丟掉。
--   RLS、狀態、寄信都不動。
-- ============================================================================

begin;

-- ---------- 1. 種類多 story ----------
do $$
declare v text;
begin
  for v in select conname from pg_constraint where conrelid = 'public.requests'::regclass and contype = 'c'
             and pg_get_constraintdef(oid) like '%kind%' and conname <> 'requests_kind_v3' loop
    execute format('alter table public.requests drop constraint %I', v);
  end loop;
  if not exists (select 1 from pg_constraint where conrelid = 'public.requests'::regclass and conname = 'requests_kind_v3') then
    alter table public.requests add constraint requests_kind_v3 check (kind in ('poster', 'post', 'story', 'video', 'other'));
  end if;
end $$;

-- ---------- 2. 平台多三個 ----------
alter table public.requests drop constraint if exists requests_platforms_check;
alter table public.requests add constraint requests_platforms_check
  check (platforms <@ array['ig_carousel', 'ig_story', 'fb_single', 'threads_text', 'other', 'long_video', 'ig_reels', 'ig_story_video']::text[]);

-- ---------- 3. 送單 ----------
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
  begin v_date := nullif(p_req->>'publish_on', '')::date;
  exception when others then raise exception 'bad_date' using errcode = 'P0001'; end;
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
                        visual_refs, publish_on, other_notes, shots)
  values (v_kind, left(btrim(p_req->>'title'), 200), '', null, '', '{}', left(coalesce(btrim(p_req->>'contact'), ''), 200), auth.uid(),
          v_owner, left(coalesce(btrim(p_req->>'owner_team'), ''), 100), left(coalesce(btrim(p_req->>'goal_cta'), ''), 500), v_pf,
          case when 'other' = any(v_pf) then left(coalesce(btrim(p_req->>'platform_other'), ''), 200) else '' end,
          left(coalesce(btrim(p_req->>'key_line'), ''), 500),
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

commit;

-- ---------- 驗收 ----------
select * from (
  with t as (
    select (select pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.requests'::regclass and conname = 'requests_kind_v3') like '%story%' as kind_ok,
           (select count(*) from pg_constraint where conrelid = 'public.requests'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%kind%') as kind_checks,
           (select pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.requests'::regclass and conname = 'requests_platforms_check') like '%ig_reels%' as pf_ok,
           (select prosrc from pg_proc where proname = 'submit_request' and pronargs = 1 limit 1) as src,
           (select count(*) from public.requests) as n_rows
  )
  select 0 ord, 'OVERALL' as 項目, null::text as 應該是, null::text as 實際是,
    case when kind_ok and kind_checks = 1 and pf_ok and src like '%bad_kind%' and src like '%v_shots := ''[]''::jsonb%' and src like '%ig_story_video%'
         then 'PASS' else 'FAIL' end as 結果 from t
  union all select 1, '種類多 story、只剩一條種類的檢查', 'true / 1', kind_ok::text || ' / ' || kind_checks::text, case when kind_ok and kind_checks = 1 then 'PASS' else 'FAIL' end from t
  union all select 2, '平台多影片的三個', 'true', pf_ok::text, case when pf_ok then 'PASS' else 'FAIL' end from t
  union all select 3, '★ 送單認種類，亂給的擋下來', 'true', (src like '%bad_kind%')::text, case when src like '%bad_kind%' then 'PASS' else 'FAIL' end from t
  union all select 4, '★ 貼文與限動不收拍攝指示', 'true', (src like '%v_shots := ''[]''::jsonb%')::text, case when src like '%v_shots := ''[]''::jsonb%' then 'PASS' else 'FAIL' end from t
  union all select 5, '影片的平台照影片那一組檢查', 'true', (src like '%ig_story_video%')::text, case when src like '%ig_story_video%' then 'PASS' else 'FAIL' end from t
  union all select 6, '資訊：requests 現在幾張單（舊單一張都沒動）', '（看一眼）', n_rows::text, 'PASS' from t
) x order by ord;
