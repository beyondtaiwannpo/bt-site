-- 實習護照的後台：Internship team 自己改格子、開新的一屆　2026-10-18
--
-- 用法：整份貼進 Supabase SQL Editor 按一次 Run。最後印出 PASS / FAIL 表。
-- **要先跑過 2026-10-17-intern-passport.sql**（五張表與 is_internship_team() 在那一支）。
--
-- ============================================================================
-- 這一支在做什麼
-- ============================================================================
-- Paul 2026-10-17：「做一個後台讓 BT 成員自己 edit 護照」。
-- 之前改格子要去 Supabase 的 Table Editor，那等於叫每年換屆的 Director 去碰資料庫。
-- 這一支開五支函式，/admin/ 多一個「實習護照」分頁呼叫它們：
--   save_intern_term        新增或改一屆（標題、起訖日）
--   activate_intern_term    把某一屆設成目前這一屆（同時把其他屆的 active 拿掉）
--   save_intern_task        新增或改一格
--   set_intern_task_active  停用或恢復一格
--   delete_intern_task      刪一格，**只有沒人蓋過的才刪得掉**，蓋過的只能停用
--
-- 門全部在函式本文第一句 is_internship_team()：Internship team 的幹部與 Co-President。
-- 表本身對前端仍然只有 select 權限（2026-10-17 那支發的），
-- 所以就算有人在 console 直接 insert，也會被擋。
--
-- ============================================================================
-- 這一支「不做」什麼
-- ============================================================================
--   不刪屆別：章與護照都掛在它底下，刪了對不回來。不要的屆別拿掉 active 就好。
--   不動 intern_stamps / intern_entries：那是 intern 自己的東西，後台看得到章、碰不到。
--   不改任何一條既有的 RLS。
begin;

-- 五支共用的門。寫成一支是為了錯誤碼只有一個地方定義。
create or replace function public.require_internship_team()
returns void language plpgsql
set search_path = public, pg_temp
as $$
begin
  if not public.is_internship_team() then
    raise exception 'not_internship_team' using errcode = 'P0001';
  end if;
end $$;
revoke all on function public.require_internship_team() from public, anon, authenticated;

-- ---------- 1. 新增或改一屆 ----------
-- id 是人看得懂的字串（2026-27），建了就不能改：格子與護照都靠它對應。
-- active 不在這裡改，要用下面那支，不然會出現兩屆同時 active 的瞬間。
create or replace function public.save_intern_term(
  p_id text, p_title_zh text, p_title_en text, p_starts date, p_ends date)
returns text language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_id text := btrim(coalesce(p_id, ''));
begin
  perform public.require_internship_team();
  if v_id !~ '^[A-Za-z0-9-]{2,32}$' then
    raise exception 'bad_term_id' using errcode = 'P0001';
  end if;
  if nullif(btrim(coalesce(p_title_zh, '')), '') is null
     or nullif(btrim(coalesce(p_title_en, '')), '') is null then
    raise exception 'empty_title' using errcode = 'P0001';
  end if;
  if p_starts is null or p_ends is null or p_ends <= p_starts then
    raise exception 'bad_dates' using errcode = 'P0001';
  end if;
  insert into intern_terms (id, title_zh, title_en, starts_on, ends_on)
  values (v_id, btrim(p_title_zh), btrim(p_title_en), p_starts, p_ends)
  on conflict (id) do update set
    title_zh = excluded.title_zh, title_en = excluded.title_en,
    starts_on = excluded.starts_on, ends_on = excluded.ends_on;
  return v_id;
end $$;
revoke all on function public.save_intern_term(text, text, text, date, date) from public, anon;
grant execute on function public.save_intern_term(text, text, text, date, date) to authenticated;

-- ---------- 2. 設成目前這一屆 ----------
-- 兩句在同一個交易裡：先全部關掉再開這一屆，唯一索引擋著「兩屆同時 active」。
create or replace function public.activate_intern_term(p_id text)
returns text language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  perform public.require_internship_team();
  if not exists (select 1 from intern_terms where id = p_id) then
    raise exception 'no_such_term' using errcode = 'P0001';
  end if;
  update intern_terms set active = false where active and id <> p_id;
  update intern_terms set active = true where id = p_id;
  return p_id;
end $$;
revoke all on function public.activate_intern_term(text) from public, anon;
grant execute on function public.activate_intern_term(text) to authenticated;

-- ---------- 3. 新增或改一格 ----------
-- id 建了就不能改（章靠它對應）。改既有的格子時 term 也不能換：
-- 已經蓋過的章會跟著跑到另一屆，而那一屆的 intern 根本沒做過那件事。
create or replace function public.save_intern_task(
  p_id text, p_term text, p_seq int, p_category text,
  p_title_zh text, p_title_en text, p_description text)
returns text language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_id   text := btrim(coalesce(p_id, ''));
  v_term text;
begin
  perform public.require_internship_team();
  if v_id !~ '^[A-Za-z0-9-]{2,32}$' then
    raise exception 'bad_task_id' using errcode = 'P0001';
  end if;
  if not exists (select 1 from intern_terms where id = p_term) then
    raise exception 'no_such_term' using errcode = 'P0001';
  end if;
  if p_category is null or p_category not in ('onboard', 'project', 'reflect') then
    raise exception 'bad_category' using errcode = 'P0001';
  end if;
  if nullif(btrim(coalesce(p_title_zh, '')), '') is null
     or nullif(btrim(coalesce(p_title_en, '')), '') is null then
    raise exception 'empty_title' using errcode = 'P0001';
  end if;
  select term into v_term from intern_tasks where id = v_id;
  if v_term is not null and v_term <> p_term then
    raise exception 'term_locked' using errcode = 'P0001';
  end if;
  insert into intern_tasks (id, term, seq, category, title_zh, title_en, description)
  values (v_id, p_term, coalesce(p_seq, 100), p_category,
          btrim(p_title_zh), btrim(p_title_en), nullif(btrim(coalesce(p_description, '')), ''))
  on conflict (id) do update set
    seq = excluded.seq, category = excluded.category,
    title_zh = excluded.title_zh, title_en = excluded.title_en, description = excluded.description;
  return v_id;
end $$;
revoke all on function public.save_intern_task(text, text, int, text, text, text, text) from public, anon;
grant execute on function public.save_intern_task(text, text, int, text, text, text, text) to authenticated;

-- ---------- 4. 停用或恢復一格 ----------
create or replace function public.set_intern_task_active(p_id text, p_active boolean)
returns boolean language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  perform public.require_internship_team();
  update intern_tasks set active = coalesce(p_active, true) where id = p_id;
  if not found then
    raise exception 'no_such_task' using errcode = 'P0001';
  end if;
  return coalesce(p_active, true);
end $$;
revoke all on function public.set_intern_task_active(text, boolean) from public, anon;
grant execute on function public.set_intern_task_active(text, boolean) to authenticated;

-- ---------- 5. 刪一格（沒人蓋過才行） ----------
-- 蓋過的格子刪掉，那個人的章會跟著不見而他不會收到任何通知。所以蓋過的只能停用。
create or replace function public.delete_intern_task(p_id text)
returns text language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  perform public.require_internship_team();
  if exists (select 1 from intern_stamps where task_id = p_id) then
    raise exception 'has_stamps' using errcode = 'P0001';
  end if;
  delete from intern_entries where task_id = p_id;
  delete from intern_tasks where id = p_id;
  if not found then
    raise exception 'no_such_task' using errcode = 'P0001';
  end if;
  return p_id;
end $$;
revoke all on function public.delete_intern_task(text) from public, anon;
grant execute on function public.delete_intern_task(text) to authenticated;

commit;

-- ============================================================================
-- 驗收。全部 PASS 才算跑完。
-- ============================================================================
select * from (
  with fn as (
    select proname, prosecdef, proconfig, proacl,
           regexp_replace(prosrc, '--[^\n]*', '', 'g') as body
      from pg_proc
     where proname in ('save_intern_term','activate_intern_term','save_intern_task',
                       'set_intern_task_active','delete_intern_task')
  ), gated as (
    select count(*) as n from fn where body like '%perform public.require_internship_team();%'
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
     where table_schema = 'public' and table_name in ('intern_terms','intern_tasks')
       and grantee in ('anon','authenticated') and privilege_type in ('INSERT','UPDATE','DELETE')
  )
  select 0 ord, 'OVERALL' as 項目, null::text as 應該是, null::text as 實際是,
    case when (select count(*) from fn) = 5 and (select n from gated) = 5
      and (select n from secdef) = 5 and (select n from anon_n) = 0 and (select n from auth_n) = 5
      and (select n from tbl_w) = 0
      and (select body from fn where proname = 'delete_intern_task') like '%has_stamps%'
      and (select body from fn where proname = 'save_intern_task') like '%term_locked%'
    then 'PASS' else 'FAIL' end as 結果
  union all select 1, '五支函式都在', '5', (select count(*) from fn)::text,
    case when (select count(*) from fn) = 5 then 'PASS' else 'FAIL' end
  union all select 2, '★ 五支第一句都是 Internship team 的門', '5', (select n from gated)::text,
    case when (select n from gated) = 5 then 'PASS' else 'FAIL' end
  union all select 3, '五支都是 security definer 而且 search_path 釘死', '5', (select n from secdef)::text,
    case when (select n from secdef) = 5 then 'PASS' else 'FAIL' end
  union all select 4, '★ 沒登入叫不動任何一支', '0', (select n from anon_n)::text,
    case when (select n from anon_n) = 0 then 'PASS' else 'FAIL' end
  union all select 5, '登入的人叫得動（門在裡面）', '5', (select n from auth_n)::text,
    case when (select n from auth_n) = 5 then 'PASS' else 'FAIL' end
  union all select 6, '★ 表本身對前端仍然沒有寫入權限（只能走函式）', '0', (select n from tbl_w)::text,
    case when (select n from tbl_w) = 0 then 'PASS' else 'FAIL' end
  union all select 7, '★ 蓋過的格子刪不掉', 'true',
    ((select body from fn where proname = 'delete_intern_task') like '%has_stamps%')::text,
    case when (select body from fn where proname = 'delete_intern_task') like '%has_stamps%' then 'PASS' else 'FAIL' end
  union all select 8, '★ 既有的格子換不了屆', 'true',
    ((select body from fn where proname = 'save_intern_task') like '%term_locked%')::text,
    case when (select body from fn where proname = 'save_intern_task') like '%term_locked%' then 'PASS' else 'FAIL' end
) t order by ord;
