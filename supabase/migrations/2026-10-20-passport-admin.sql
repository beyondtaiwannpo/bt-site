-- 幹部護照的後台：Co-President 在 /admin/passports/ 改格子、月份時刻、城市　2026-10-20
--
-- 用法：整份貼進 Supabase SQL Editor 按一次 Run。最後印出 PASS / FAIL 表。
-- **要先跑過 2026-09-08-students.sql**（is_president() 在那一支）。
-- 可以重複執行：create or replace 與 grant 都是重跑同樣的結果。
--
-- ============================================================================
-- 這一支在做什麼
-- ============================================================================
-- Paul 2026-10-15 拍板（docs/2026-10-15-後台重整盤點與設計.md 第 0 段第 4 題）：
-- 「原本的護照活動 Co-President 也都可以改」，而且第一版只給 Co-President，
-- 不開給 team，因為 team 這個欄位本人改得動，那個守門要批 3 才補。
-- 之前改格子要去 Supabase 的 Table Editor（README「怎麼改活動文案」教的就是那條路），
-- 那等於叫每年換屆的人去碰資料庫。這一支開五支函式，後台呼叫它們：
--   save_activity          新增或改一格（標題、說明、要不要主持人、回望哪一格）
--   set_activity_active    停用或恢復一格
--   delete_activity        刪一格，**只有沒人蓋過、沒人寫過心得、沒有別格回望它的才刪得掉**
--   save_month_theme       改一個月右上角那個時刻字串
--   save_destination       加一個城市、改名字、停用或恢復；**沒有刪**
--
-- 門全部在函式本文第一句 require_president()。表本身對前端維持只有 select
-- （2026-08-25 與 2026-10-19 那兩支發的），所以就算有人在 console 直接 update，也會被擋。
--
-- ============================================================================
-- 這一支「不做」什麼，而且為什麼
-- ============================================================================
--   不讓人改編號（activities.id）：stamps 與 entries 靠它對到格子，改了大家蓋過的章就對不上。
--     新格子的編號由這裡照「月份兩位數加一個大寫字母」算出來，後台不讓人打。
--   不讓人改既有格子的月份：章是照月份算入境章的，搬月份等於搬別人的章。
--   不刪城市：visas.code 對 destinations 有外鍵，資料庫本來就擋；後台連那顆按鈕都不畫。
--   不動 months 的 seq 與 month：前端靠 seq 排序，11 列是固定的。
--   不碰 stamps、entries、visas、passports：那是幹部自己的東西（GOALS.md「不動 /passport/ 的隱私界線」）。
--   不碰 milestones：前端 2026-08-27 已經不讀它。
begin;

-- 五支共用的門。寫成一支是為了錯誤碼只有一個地方定義。
-- ⚠ is_president() 自己會再問一次 role = 'cadre'，所以一個 board_role 被誤設的學員進不來。
create or replace function public.require_president()
returns void language plpgsql
set search_path = public, pg_temp
as $$
begin
  if not public.is_president() then
    raise exception 'not_president' using errcode = 'P0001';
  end if;
end $$;
revoke all on function public.require_president() from public, anon, authenticated;

-- ---------- 1. 新增或改一格 ----------
-- 新增：p_id 傳 null，編號由這裡算：月份兩位數加該月下一個還沒用過的大寫字母（09A、09B、09C、09D…）。
-- 改：p_id 傳既有編號，月份不能換（month_locked），其他欄位照傳進來的值蓋過去。
-- seq 一律從 months 表查（學年順序，9 月是 1），不讓人填：填錯的表現是月份頁順序錯掉，而且不會報錯。
create or replace function public.save_activity(
  p_id text, p_month int, p_category text,
  p_title_zh text, p_title_en text, p_description text,
  p_needs_host boolean, p_callback_to text)
returns text language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_id    text := nullif(btrim(coalesce(p_id, '')), '');
  v_seq   int;
  v_month int;
  v_cb    text := nullif(btrim(coalesce(p_callback_to, '')), '');
  v_letter text;
begin
  perform public.require_president();
  if p_category is null or p_category not in ('gather', 'prompt', 'frame') then
    raise exception 'bad_category' using errcode = 'P0001';
  end if;
  if nullif(btrim(coalesce(p_title_zh, '')), '') is null
     or nullif(btrim(coalesce(p_title_en, '')), '') is null then
    raise exception 'empty_title' using errcode = 'P0001';
  end if;
  if v_id is null then
    -- 新格子。月份一定要在 months 表裡（那 11 列就是整本護照的骨架）。
    select seq into v_seq from months where month = p_month;
    if v_seq is null then
      raise exception 'bad_month' using errcode = 'P0001';
    end if;
    v_month := p_month;
    -- 下一個沒用過的字母。Z 都用完了就擋下來，一個月 26 格已經不是護照了。
    select chr(ascii('A') + count(*)::int) into v_letter from activities where month = p_month;
    if v_letter > 'Z' then
      raise exception 'month_full' using errcode = 'P0001';
    end if;
    v_id := lpad(p_month::text, 2, '0') || v_letter;
    while exists (select 1 from activities where id = v_id) loop
      v_letter := chr(ascii(v_letter) + 1);
      if v_letter > 'Z' then
        raise exception 'month_full' using errcode = 'P0001';
      end if;
      v_id := lpad(p_month::text, 2, '0') || v_letter;
    end loop;
  else
    select month, seq into v_month, v_seq from activities where id = v_id;
    if v_month is null then
      raise exception 'no_such_activity' using errcode = 'P0001';
    end if;
    if p_month is not null and p_month <> v_month then
      raise exception 'month_locked' using errcode = 'P0001';
    end if;
  end if;
  -- 回望只能指向另一格，而且那一格要存在。指向自己沒有意義。
  if v_cb is not null then
    if v_cb = v_id or not exists (select 1 from activities where id = v_cb) then
      raise exception 'bad_callback' using errcode = 'P0001';
    end if;
  end if;
  insert into activities (id, month, seq, category, title_zh, title_en, description, needs_host, callback_to)
  values (v_id, v_month, v_seq, p_category, btrim(p_title_zh), btrim(p_title_en),
          nullif(btrim(coalesce(p_description, '')), ''), coalesce(p_needs_host, false), v_cb)
  on conflict (id) do update set
    category = excluded.category, title_zh = excluded.title_zh, title_en = excluded.title_en,
    description = excluded.description, needs_host = excluded.needs_host, callback_to = excluded.callback_to;
  return v_id;
end $$;
revoke all on function public.save_activity(text, int, text, text, text, text, boolean, text) from public, anon;
grant execute on function public.save_activity(text, int, text, text, text, text, boolean, text) to authenticated;

-- ---------- 2. 停用或恢復一格 ----------
-- 停用之後護照上看不到那一格（前端只讀 active = true），已經蓋過的章還在，恢復就回來。
create or replace function public.set_activity_active(p_id text, p_active boolean)
returns boolean language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  perform public.require_president();
  update activities set active = coalesce(p_active, true) where id = p_id;
  if not found then
    raise exception 'no_such_activity' using errcode = 'P0001';
  end if;
  return coalesce(p_active, true);
end $$;
revoke all on function public.set_activity_active(text, boolean) from public, anon;
grant execute on function public.set_activity_active(text, boolean) to authenticated;

-- ---------- 3. 刪一格（沒人蓋過、沒人寫過、沒人回望它才行） ----------
-- 蓋過的格子刪掉，那個人的章會跟著不見而他不會收到任何通知。所以蓋過的只能停用。
-- entries 也要查：有人可能寫了心得還沒蓋章（前端允許先寫）。
-- 被別格 callback_to 指著的也不能刪，不然那一格打開會找不到回望的對象。
create or replace function public.delete_activity(p_id text)
returns text language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  perform public.require_president();
  if exists (select 1 from stamps where act_id = p_id)
     or exists (select 1 from entries where act_id = p_id) then
    raise exception 'has_stamps' using errcode = 'P0001';
  end if;
  if exists (select 1 from activities where callback_to = p_id) then
    raise exception 'has_callback' using errcode = 'P0001';
  end if;
  delete from activities where id = p_id;
  if not found then
    raise exception 'no_such_activity' using errcode = 'P0001';
  end if;
  return p_id;
end $$;
revoke all on function public.delete_activity(text) from public, anon;
grant execute on function public.delete_activity(text) to authenticated;

-- ---------- 4. 改一個月右上角的時刻 ----------
-- theme_zh 這個欄位名稱沒改，但它放的是時刻（2026-08-23 起），空字串就是不顯示。
-- seq 與 month 不給改。
create or replace function public.save_month_theme(p_seq int, p_theme_zh text, p_theme_en text)
returns int language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  perform public.require_president();
  update months set theme_zh = btrim(coalesce(p_theme_zh, '')), theme_en = btrim(coalesce(p_theme_en, ''))
   where seq = p_seq;
  if not found then
    raise exception 'no_such_month' using errcode = 'P0001';
  end if;
  return p_seq;
end $$;
revoke all on function public.save_month_theme(int, text, text) from public, anon;
grant execute on function public.save_month_theme(int, text, text) to authenticated;

-- ---------- 5. 加一個城市、改名字、停用或恢復 ----------
-- 代碼照機場代碼的習慣三個大寫字母（TPE、LAX），這裡只要求 2 到 8 個英數字，一律轉大寫。
-- **沒有刪**：visas.code 對這張表有外鍵，有人抽到過的城市資料庫會擋；
-- 沒人抽到過的也不刪，停用就好，少一條會出錯的路。
create or replace function public.save_destination(p_code text, p_city text, p_active boolean)
returns text language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_code text := upper(btrim(coalesce(p_code, '')));
begin
  perform public.require_president();
  if v_code !~ '^[A-Z0-9]{2,8}$' then
    raise exception 'bad_code' using errcode = 'P0001';
  end if;
  if nullif(btrim(coalesce(p_city, '')), '') is null then
    raise exception 'empty_city' using errcode = 'P0001';
  end if;
  insert into destinations (code, city, active)
  values (v_code, btrim(p_city), coalesce(p_active, true))
  on conflict (code) do update set city = excluded.city, active = excluded.active;
  return v_code;
end $$;
revoke all on function public.save_destination(text, text, boolean) from public, anon;
grant execute on function public.save_destination(text, text, boolean) to authenticated;

commit;

-- ============================================================================
-- 驗收。全部 PASS 才算跑完。
-- ============================================================================
select * from (
  with fn as (
    select proname, prosecdef, proconfig, proacl,
           regexp_replace(prosrc, '--[^\n]*', '', 'g') as body
      from pg_proc
     where proname in ('save_activity','set_activity_active','delete_activity',
                       'save_month_theme','save_destination')
  ), gated as (
    select count(*) as n from fn where body like '%perform public.require_president();%'
  ), secdef as (
    select count(*) as n from fn where prosecdef
       and coalesce(array_to_string(proconfig, ','), '') like '%search_path=%public%'
  ), anon_n as (
    select count(*) as n from fn f, aclexplode(f.proacl) x
     where x.grantee in (0::regrole, 'anon'::regrole) and x.privilege_type = 'EXECUTE'
  ), auth_n as (
    select count(*) as n from fn f, aclexplode(f.proacl) x
     where x.grantee = 'authenticated'::regrole and x.privilege_type = 'EXECUTE'
  ), tbl_w as (
    select count(*) as n from information_schema.role_table_grants
     where table_schema = 'public' and table_name in ('months','activities','destinations')
       and grantee in ('anon','authenticated') and privilege_type in ('INSERT','UPDATE','DELETE')
  ), gate_body as (
    select regexp_replace(prosrc, '--[^\n]*', '', 'g') as body from pg_proc where proname = 'require_president'
  )
  select 0 ord, 'OVERALL' as 項目, null::text as 應該是, null::text as 實際是,
    case when (select count(*) from fn) = 5 and (select n from gated) = 5
      and (select n from secdef) = 5 and (select n from anon_n) = 0 and (select n from auth_n) = 5
      and (select n from tbl_w) = 0
      and (select body from gate_body) like '%public.is_president()%'
      and (select body from fn where proname = 'delete_activity') like '%has_stamps%'
      and (select body from fn where proname = 'save_activity') like '%month_locked%'
      and (select count(*) from pg_proc where proname = 'delete_destination') = 0
    then 'PASS' else 'FAIL' end as 結果
  union all select 1, '五支函式都在', '5', (select count(*) from fn)::text,
    case when (select count(*) from fn) = 5 then 'PASS' else 'FAIL' end
  union all select 2, '★ 五支第一句都是 Co-President 的門', '5', (select n from gated)::text,
    case when (select n from gated) = 5 then 'PASS' else 'FAIL' end
  union all select 3, '★ 那道門問的真的是 is_president()', 'true',
    ((select body from gate_body) like '%public.is_president()%')::text,
    case when (select body from gate_body) like '%public.is_president()%' then 'PASS' else 'FAIL' end
  union all select 4, '五支都是 security definer 而且 search_path 釘死', '5', (select n from secdef)::text,
    case when (select n from secdef) = 5 then 'PASS' else 'FAIL' end
  union all select 5, '★ 沒登入叫不動任何一支', '0', (select n from anon_n)::text,
    case when (select n from anon_n) = 0 then 'PASS' else 'FAIL' end
  union all select 6, '登入的人叫得動（門在裡面）', '5', (select n from auth_n)::text,
    case when (select n from auth_n) = 5 then 'PASS' else 'FAIL' end
  union all select 7, '★ 三張表對前端仍然沒有寫入權限（只能走函式）', '0', (select n from tbl_w)::text,
    case when (select n from tbl_w) = 0 then 'PASS' else 'FAIL' end
  union all select 8, '★ 蓋過或寫過的格子刪不掉', 'true',
    ((select body from fn where proname = 'delete_activity') like '%has_stamps%')::text,
    case when (select body from fn where proname = 'delete_activity') like '%has_stamps%' then 'PASS' else 'FAIL' end
  union all select 9, '★ 既有的格子換不了月份', 'true',
    ((select body from fn where proname = 'save_activity') like '%month_locked%')::text,
    case when (select body from fn where proname = 'save_activity') like '%month_locked%' then 'PASS' else 'FAIL' end
  union all select 10, '★ 沒有刪城市的函式', '0', (select count(*) from pg_proc where proname = 'delete_destination')::text,
    case when (select count(*) from pg_proc where proname = 'delete_destination') = 0 then 'PASS' else 'FAIL' end
) t order by ord;
