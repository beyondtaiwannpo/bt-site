-- 幹部護照的月份全部從後台管：加一個月、刪一個月、排順序、把格子搬到別的月份。　2026-11-13
--
-- 用法：整份貼進 Supabase SQL Editor 按一次 Run。最後印出 PASS / FAIL 表。
-- **先跑 2026-11-12-reveal-months.sql**（順序照日期；這一支用到 2026-10-24 的 require_ws_edit()）。
--
-- ============================================================================
-- 這一支在做什麼
-- ============================================================================
-- Paul 2026-10-28：「九月、十月可以刪掉。我要能自己加、自己刪，整本幹部護照都我說了算。」
--
--   1. months.month 加唯一索引（一個月份只能出現一次；正式站本來就沒有重複）。
--   2. add_month(月份)：加在最後面，時刻空白、還沒揭曉（揭曉要另外按）。
--   3. delete_month(月份)：**那個月還有格子就擋**（先把格子搬走或刪掉），
--      已經有人拿到那個月的入境章也擋（章是寫進資料庫、改不掉的，月份不見那枚章就沒有頁可以放）。
--   4. move_month(月份, -1 或 1)：跟前一個或後一個月份對調順序。格子的 seq 跟著月份走。
--   5. move_activity(格子, 月份)：把一格搬到別的月份。**有人蓋過或寫過的不能搬**
--      （搬了等於把別人的章搬到另一個月，入境章會算錯），跟「有人蓋過的不能刪」同一條規則。
--      格子的編號不變（09B 搬到十一月還是叫 09B）：章與心得靠編號對到格子。
--   6. 一次性的清理（Paul 同一天說的）：09B「今年我想要的」搬到十一月
--      （七月那一格「現在還算數嗎」回望它，所以搬不刪），然後刪掉九月、十月。
--      **只在九月、十月還在、而且刪得掉的時候做**；有任何一個條件不成立就不動，PASS 表會說為什麼。
--      重跑不會再做一次（九月、十月已經不在了）。
--
-- 門：五支函式第一句都是 require_ws_edit('passport')，跟改格子、藏月份、揭曉同一道門。
-- 不碰 stamps、entries、visas、passports：那是幹部自己的東西。

begin;

create unique index if not exists months_month_key on public.months (month);

create or replace function public.add_month(p_month int)
returns int language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_seq int;
begin
  perform public.require_ws_edit('passport');
  if p_month is null or p_month < 1 or p_month > 12 then
    raise exception 'bad_month' using errcode = 'P0001';
  end if;
  if exists (select 1 from months where month = p_month) then
    raise exception 'month_exists' using errcode = 'P0001';
  end if;
  select coalesce(max(seq), 0) + 1 into v_seq from months;
  insert into months (seq, month, theme_zh, theme_en, hidden, revealed) values (v_seq, p_month, '', '', false, false);
  return v_seq;
end $$;
revoke all on function public.add_month(int) from public, anon;
grant execute on function public.add_month(int) to authenticated;

create or replace function public.delete_month(p_month int)
returns int language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  perform public.require_ws_edit('passport');
  if not exists (select 1 from months where month = p_month) then
    raise exception 'bad_month' using errcode = 'P0001';
  end if;
  if exists (select 1 from activities where month = p_month) then
    raise exception 'month_has_boxes' using errcode = 'P0001';
  end if;
  if exists (select 1 from visas where month = p_month) then
    raise exception 'month_has_visas' using errcode = 'P0001';
  end if;
  delete from months where month = p_month;
  return p_month;
end $$;
revoke all on function public.delete_month(int) from public, anon;
grant execute on function public.delete_month(int) to authenticated;

create or replace function public.move_month(p_month int, p_dir int)
returns void language plpgsql security definer
set search_path = public, pg_temp
as $$
declare a int; b int;
begin
  perform public.require_ws_edit('passport');
  select seq into a from months where month = p_month;
  if a is null then raise exception 'bad_month' using errcode = 'P0001'; end if;
  if p_dir = -1 then
    select seq into b from months where seq < a order by seq desc limit 1;
  elsif p_dir = 1 then
    select seq into b from months where seq > a order by seq limit 1;
  else
    raise exception 'bad_dir' using errcode = 'P0001';
  end if;
  if b is null then return; end if;  -- 已經在最前面或最後面
  -- seq 是主鍵，對調要先借一個不會撞到的號碼。
  update months set seq = -a where seq = a;
  update months set seq = a where seq = b;
  update months set seq = b where seq = -a;
  update activities x set seq = m.seq from months m where m.month = x.month and x.seq is distinct from m.seq;
end $$;
revoke all on function public.move_month(int, int) from public, anon;
grant execute on function public.move_month(int, int) to authenticated;

create or replace function public.move_activity(p_id text, p_month int)
returns text language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_seq int;
begin
  perform public.require_ws_edit('passport');
  if not exists (select 1 from activities where id = p_id) then
    raise exception 'no_such_activity' using errcode = 'P0001';
  end if;
  select seq into v_seq from months where month = p_month;
  if v_seq is null then raise exception 'bad_month' using errcode = 'P0001'; end if;
  if exists (select 1 from stamps where act_id = p_id) or exists (select 1 from entries where act_id = p_id) then
    raise exception 'has_stamps' using errcode = 'P0001';
  end if;
  update activities set month = p_month, seq = v_seq where id = p_id;
  return p_id;
end $$;
revoke all on function public.move_activity(text, int) from public, anon;
grant execute on function public.move_activity(text, int) to authenticated;

-- ---------- 一次性的清理：09B 搬到十一月，刪九月、十月 ----------
do $$
begin
  if exists (select 1 from months where month in (9, 10))
     and exists (select 1 from months where month = 11)
     and not exists (select 1 from stamps s join activities a on a.id = s.act_id where a.month in (9, 10))
     and not exists (select 1 from entries e join activities a on a.id = e.act_id where a.month in (9, 10))
     and not exists (select 1 from visas where month in (9, 10))
     and (select count(*) from activities where month in (9, 10) and id <> '09B') = 0 then
    update activities set month = 11, seq = (select seq from months where month = 11) where id = '09B';
    delete from months where month in (9, 10);
  end if;
end $$;

commit;

-- ---------- 驗收 ----------
select * from (
  with fns as (
    select p.proname, regexp_replace(p.prosrc, '--[^\n]*', '', 'g') as body, p.prosecdef, p.proconfig
      from pg_proc p where p.pronamespace = 'public'::regnamespace
       and p.proname in ('add_month', 'delete_month', 'move_month', 'move_activity')
  ), g as (
    select
      (select count(*) from fns) as n_fns,
      (select count(*) from fns where prosecdef and array_to_string(proconfig, ',') like '%search_path=%public%') as n_defs,
      (select count(*) from fns where body like '%perform public.require_ws_edit(''passport'')%') as n_gate,
      (select count(*) from pg_proc p, aclexplode(p.proacl) x
        where p.pronamespace = 'public'::regnamespace and p.proname in ('add_month', 'delete_month', 'move_month', 'move_activity')
          and x.grantee in (0::regrole, 'anon'::regrole) and x.privilege_type = 'EXECUTE') as anon_n,
      exists (select 1 from pg_indexes where schemaname = 'public' and tablename = 'months' and indexname = 'months_month_key') as uniq,
      (select body from fns where proname = 'delete_month') like '%month_has_boxes%' as del_guard,
      (select body from fns where proname = 'move_activity') like '%has_stamps%' as move_guard
  )
  select 0 ord, 'OVERALL' as 項目, null::text as 應該是, null::text as 實際是,
    case when n_fns = 4 and n_defs = 4 and n_gate = 4 and anon_n = 0 and uniq and del_guard and move_guard then 'PASS' else 'FAIL' end as 結果 from g
  union all select 1, '四支函式都在、security definer、search_path 釘死', '4 / 4', n_fns::text || ' / ' || n_defs::text, case when n_fns = 4 and n_defs = 4 then 'PASS' else 'FAIL' end from g
  union all select 2, '★ 四支第一件事都是確認 passport 工作區「改」以上', '4', n_gate::text, case when n_gate = 4 then 'PASS' else 'FAIL' end from g
  union all select 3, '★ 沒登入叫不動', '0 筆', anon_n::text || ' 筆', case when anon_n = 0 then 'PASS' else 'FAIL' end from g
  union all select 4, '一個月份只能出現一次（唯一索引）', 'true', uniq::text, case when uniq then 'PASS' else 'FAIL' end from g
  union all select 5, '★ 還有格子的月份刪不掉、有人蓋過的格子搬不動', 'true / true', del_guard::text || ' / ' || move_guard::text, case when del_guard and move_guard then 'PASS' else 'FAIL' end from g
  -- 下面兩條只是告訴你清理做了沒，不算 PASS / FAIL。第一次跑完應該是「11,12,1,…,7」與「11」。
  union all select 6, '現在的月份順序（第一次跑完九、十月應該不在了）', '11,12,1,2,3,4,5,6,7',
    (select string_agg(month::text, ',' order by seq) from months), '看一眼' from g
  union all select 7, '09B 現在在哪個月（應該是 11）', '11',
    coalesce((select month::text from activities where id = '09B'), '沒有這一格'), '看一眼' from g
) t order by ord;
