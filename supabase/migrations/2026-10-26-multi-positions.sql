-- 權限重新設計批 4：同一屆可以有好幾個職位，加人的 email　2026-10-26
--
-- 用法：整份貼進 Supabase SQL Editor 按一次 Run。可以重跑。最後印一張 PASS / FAIL 表。
-- 要先跑過 2026-10-24-ranks-and-workspaces.sql。
--
-- Paul 2026-10-23（看了 /admin/people/ 的截圖）：一個人同一屆可以兼好幾個職位，
-- 例如 Sponsorship Team 的 Adviser 兼 Curriculum Team 的 Associate。職級還是一個人一個。
--
-- ============================================================================
-- 這一支在做什麼
-- ============================================================================
--   1. positions 的唯一鍵從 人 × 屆 改成 人 × 屆 × team（沒有 team 的職位，例如 Co-President，彼此算同一筆）。
--   2. set_position / delete_position / import_positions / merge_people / end_term 跟著改：
--      存檔對的是「那一屆那個 team 的那一筆」，刪的也是那一筆；換屆複製全部；貼一整屆同一個人第二行變第二筆。
--      delete_position 多一個參數 p_team，舊的兩個參數那一版拿掉（PostgREST 不喜歡同名不同參數）。
--   3. public_team() 一筆職位一列：兼兩個 team 的人，團隊頁兩組各出現一次、各印那一組的頭銜。
--      public_alumni() 的 title 把最後一屆所有職位用「 · 」接起來。
--   4. person_email(person)：「改一個人」那一頁印他註冊用的 email，只有 Co-President 與 Senior Adviser 拿得到。
--
-- 這些函式的本文跟 2026-10-24 那支裡的**一模一樣**（10-24 已經同步改成這一版，重跑 10-24 不會把這一支蓋回去）。
-- ============================================================================

begin;

alter table public.positions drop constraint if exists positions_person_id_term_id_key;
create unique index if not exists positions_one_per_team on public.positions (person_id, term_id, (coalesce(team, '')));
comment on table public.positions is
  '每人每屆每個 team 一筆：職位名稱（自由文字，例如 Director, Internship Team）與 team。
   一個人同一屆可以有好幾筆（2026-10-26）。團隊頁的頭銜從這裡算：title · term。職位是對外怎麼稱呼，不是職級。';

create or replace function public.set_position(p_person uuid, p_term text, p_title_zh text, p_title_en text, p_team text)
returns bigint language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_id bigint; v_old text;
begin
  perform public.require_senior();
  if not exists (select 1 from people where id = p_person) then
    raise exception 'no_such_person' using errcode = 'P0001';
  end if;
  if not exists (select 1 from terms where id = p_term) then
    raise exception 'no_such_term' using errcode = 'P0001';
  end if;
  if coalesce(btrim(p_title_zh), '') = '' and coalesce(btrim(p_title_en), '') = '' then
    raise exception 'empty_title' using errcode = 'P0001';
  end if;
  select coalesce(title_en, title_zh) || '/' || coalesce(team, '') into v_old
    from positions where person_id = p_person and term_id = p_term and coalesce(team, '') = coalesce(nullif(btrim(p_team), ''), '');
  insert into positions (person_id, term_id, title_zh, title_en, team)
  values (p_person, p_term, nullif(btrim(p_title_zh), ''), nullif(btrim(p_title_en), ''), nullif(btrim(p_team), ''))
  on conflict (person_id, term_id, (coalesce(team, ''))) do update
    set title_zh = excluded.title_zh, title_en = excluded.title_en, team = excluded.team
  returning id into v_id;
  perform public.log_change((select profile_id from people where id = p_person), public.person_name(p_person),
    'position', v_old, p_term || ':' || coalesce(nullif(btrim(p_title_en), ''), btrim(p_title_zh)) || '/' || coalesce(btrim(p_team), ''));
  return v_id;
end $$;
revoke all on function public.set_position(uuid, text, text, text, text) from public, anon;
grant execute on function public.set_position(uuid, text, text, text, text) to authenticated;

drop function if exists public.delete_position(uuid, text);
create or replace function public.delete_position(p_person uuid, p_term text, p_team text)
returns boolean language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_old text;
begin
  perform public.require_senior();
  delete from positions where person_id = p_person and term_id = p_term and coalesce(team, '') = coalesce(nullif(btrim(p_team), ''), '')
    returning coalesce(title_en, title_zh) || '/' || coalesce(team, '') into v_old;
  if not found then return false; end if;
  perform public.log_change((select profile_id from people where id = p_person), public.person_name(p_person),
    'position', p_term || ':' || v_old, null);
  return true;
end $$;
revoke all on function public.delete_position(uuid, text, text) from public, anon;
grant execute on function public.delete_position(uuid, text, text) to authenticated;

-- 貼一整屆：[{name_zh, name_en, title_zh, title_en, team}, …]。
-- 同一個中英文名、而且還沒有帳號的那一筆會重複使用（同一個人跨兩屆貼兩次不該變兩個人）；
-- 名字只對到一半的不合併，名單頁會提示「可能是同一個人」讓人決定。
create or replace function public.import_positions(p_term text, p_rows jsonb)
returns int language plpgsql security definer
set search_path = public, pg_temp
as $$
declare r jsonb; v_person uuid; v_zh text; v_en text; n int := 0;
begin
  perform public.require_senior();
  if not exists (select 1 from terms where id = p_term) then
    raise exception 'no_such_term' using errcode = 'P0001';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'bad_rows' using errcode = 'P0001';
  end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    v_zh := nullif(btrim(coalesce(r->>'name_zh', '')), '');
    v_en := nullif(btrim(coalesce(r->>'name_en', '')), '');
    if v_zh is null and v_en is null then
      raise exception 'empty_name' using errcode = 'P0001';
    end if;
    select id into v_person from people
     where profile_id is null
       and name_zh is not distinct from v_zh
       and lower(coalesce(name_en, '')) = lower(coalesce(v_en, ''))
     limit 1;
    if v_person is null then
      insert into people (name_zh, name_en) values (v_zh, v_en) returning id into v_person;
    end if;
    insert into positions (person_id, term_id, title_zh, title_en, team)
    values (v_person, p_term, nullif(btrim(coalesce(r->>'title_zh', '')), ''),
            nullif(btrim(coalesce(r->>'title_en', '')), ''), nullif(btrim(coalesce(r->>'team', '')), ''))
    on conflict (person_id, term_id, (coalesce(team, ''))) do update
      set title_zh = excluded.title_zh, title_en = excluded.title_en, team = excluded.team;
    n := n + 1;
  end loop;
  perform public.log_change(null, null, 'term', null, p_term || ':imported:' || n);
  return n;
end $$;
revoke all on function public.import_positions(text, jsonb) from public, anon;
grant execute on function public.import_positions(text, jsonb) to authenticated;

-- 兩筆是同一個人：把 drop 的職位搬到 keep（同一屆兩邊都有的保留 keep 那一筆），帳號跟著搬，再刪 drop。
create or replace function public.merge_people(p_keep uuid, p_drop uuid)
returns uuid language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_keep_profile uuid; v_drop_profile uuid; v_drop_name text;
begin
  perform public.require_president();
  if p_keep = p_drop then
    raise exception 'same_person' using errcode = 'P0001';
  end if;
  select profile_id into v_keep_profile from people where id = p_keep;
  if not found then raise exception 'no_such_person' using errcode = 'P0001'; end if;
  select profile_id into v_drop_profile from people where id = p_drop;
  if not found then raise exception 'no_such_person' using errcode = 'P0001'; end if;
  if v_keep_profile is not null and v_drop_profile is not null then
    raise exception 'both_have_accounts' using errcode = 'P0001';
  end if;
  if exists (select 1 from invite_codes where person_id = p_drop and uses_left > 0) then
    raise exception 'has_unused_invite' using errcode = 'P0001';
  end if;
  v_drop_name := public.person_name(p_drop);
  insert into positions (person_id, term_id, title_zh, title_en, team)
  select p_keep, term_id, title_zh, title_en, team from positions where person_id = p_drop
  on conflict (person_id, term_id, (coalesce(team, ''))) do nothing;
  update invite_codes set person_id = p_keep where person_id = p_drop;
  if v_keep_profile is null and v_drop_profile is not null then
    update people set profile_id = null where id = p_drop;
    update people set profile_id = v_drop_profile where id = p_keep;
  end if;
  delete from people where id = p_drop;
  perform public.log_change(coalesce(v_keep_profile, v_drop_profile), public.person_name(p_keep), 'merged', v_drop_name, p_keep::text);
  return p_keep;
end $$;
revoke all on function public.merge_people(uuid, uuid) from public, anon;
grant execute on function public.merge_people(uuid, uuid) to authenticated;

-- ---------- 12. 結束這一屆（只有 Co-President）----------
-- 沒留下的幹部：role 變 alumni、職級歸 member、指派全清、從團隊頁下架；職位紀錄留著。
-- 留下的：在新的一屆複製一筆職位（名稱照舊，之後再改），指派不動。
-- 自己一定要在 keep 裡：不然按下去的人下一秒就是校友。
create or replace function public.end_term(
  p_next_id text, p_next_title_zh text, p_next_title_en text, p_starts date, p_ends date, p_keep uuid[])
returns jsonb language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_cur text; v_kept int := 0; v_alumni int := 0; r record; v_person uuid;
begin
  perform public.require_president();
  select id into v_cur from terms where status = 'current' for update;
  if not found then
    raise exception 'no_current_term' using errcode = 'P0001';
  end if;
  if coalesce(p_next_id, '') !~ '^[0-9]{4}-[0-9]{2}$' then
    raise exception 'bad_term_id' using errcode = 'P0001';
  end if;
  if exists (select 1 from terms where id = p_next_id) then
    raise exception 'term_exists' using errcode = 'P0001';
  end if;
  if p_starts is null or p_ends is null or p_ends <= p_starts then
    raise exception 'bad_dates' using errcode = 'P0001';
  end if;
  if p_keep is null or not (auth.uid() = any (p_keep)) then
    raise exception 'must_keep_self' using errcode = 'P0001';
  end if;
  update terms set status = 'ended' where id = v_cur;
  insert into terms (id, title_zh, title_en, starts_on, ends_on, status)
  values (p_next_id, nullif(btrim(p_next_title_zh), ''), nullif(btrim(p_next_title_en), ''), p_starts, p_ends, 'current');
  for r in select id, name_zh, name_en from profiles where role = 'cadre' loop
    select id into v_person from people where profile_id = r.id;
    if v_person is null then
      insert into people (name_zh, name_en, profile_id) values (r.name_zh, r.name_en, r.id) returning id into v_person;
    end if;
    if r.id = any (p_keep) then
      insert into positions (person_id, term_id, title_zh, title_en, team)
      select v_person, p_next_id, title_zh, title_en, team from positions
       where person_id = v_person and term_id = v_cur
      on conflict (person_id, term_id, (coalesce(team, ''))) do nothing;
      v_kept := v_kept + 1;
    else
      update profiles set role = 'alumni', board_role = 'member', public_profile = false, public_approved = false
       where id = r.id;
      delete from assignments where user_id = r.id;
      perform public.log_role_change(r.id, 'role', 'cadre', 'alumni');
      v_alumni := v_alumni + 1;
    end if;
  end loop;
  perform public.log_change(null, null, 'term', v_cur, p_next_id || ':kept:' || v_kept || ':alumni:' || v_alumni);
  return jsonb_build_object('ended', v_cur, 'term', p_next_id, 'kept', v_kept, 'alumni', v_alumni);
end $$;
revoke all on function public.end_term(text, text, text, date, date, uuid[]) from public, anon;
grant execute on function public.end_term(text, text, text, date, date, uuid[]) to authenticated;

-- 對外團隊頁：兩把鑰匙都轉、而且在 current 那一屆有職位的幹部。頭銜從職位算，不再讀 public_title。
-- **一筆職位一列**（2026-10-26）：同一個人兼兩個 team 的職位，團隊頁兩組各出現一次，各印那一組的頭銜。
-- 換屆之後沒留下的人自然消失（end_term 也把他的核可撤了，雙重保險）。
create or replace function public.public_team()
returns table (id uuid, name_zh text, name_en text, team text, avatar text, title_zh text, title_en text, term text)
language sql stable security definer
set search_path = public, pg_temp
as $$
  select p.id, p.name_zh, p.name_en,
         coalesce(po.team, nullif(btrim(split_part(coalesce(p.team, ''), ',', 1)), '')),
         p.avatar, po.title_zh, po.title_en, t.id
    from profiles p
    join people pe on pe.profile_id = p.id
    join positions po on po.person_id = pe.id
    join terms t on t.id = po.term_id and t.status = 'current'
   where p.public_profile and p.public_approved and p.role = 'cadre'
   order by p.name_en, po.team nulls first;
$$;
revoke all on function public.public_team() from public;
grant execute on function public.public_team() to anon, authenticated;

-- 校友頁多一欄 title（最後一屆的職位 · 屆別）。其餘跟 2026-09-18 一字不差；欄位加在最後，
-- alumni/community.json 的 key 不變。回傳的欄位變了，Postgres 不准 replace，要先 drop 再建，
-- 所以底下要把 anon 的執行權限重新發一次（drop 會連授權一起掉）。
drop function if exists public.public_alumni();
create or replace function public.public_alumni()
returns table (
  id text, name text, school text, county text, city text, country text, place text,
  quote text, note text, school_en text, country_en text, quote_en text, note_en text, title text
) language sql security definer stable
set search_path = public, pg_temp
as $$
  select md5(s.id::text),
         coalesce(nullif(btrim(s.display_name), ''), p.name_zh, p.name_en),
         s.school, s.county, s.city, s.country, s.place,
         s.quote, s.note, s.school_en, s.country_en, s.quote_en, s.note_en,
         -- 最後一屆的所有職位用「 · 」接起來，最後接屆別（10-26 起一屆可以有好幾筆）。
         (select string_agg(coalesce(po.title_en, po.title_zh), ' · ' order by po.team nulls first) || ' · ' || po.term_id
            from people pe join positions po on po.person_id = pe.id join terms t on t.id = po.term_id
           where pe.profile_id = p.id
             and t.id = (select t2.id from people pe2 join positions po2 on po2.person_id = pe2.id join terms t2 on t2.id = po2.term_id
                          where pe2.profile_id = p.id order by t2.starts_on desc limit 1)
           group by po.term_id)
    from public.alumni_stories s
    join public.profiles p on p.id = s.id
   where s.public_story and s.story_approved
     and p.role in ('cadre', 'alumni')
     and s.county is not null
   order by s.approved_at nulls last, s.updated_at;
$$;
revoke all on function public.public_alumni() from public;
grant execute on function public.public_alumni() to anon, authenticated;

-- 一個人註冊用的 email（2026-10-26，Paul 10-23）：只在「改一個人」那一頁印，只有 Co-President 與 Senior Adviser 拿得到，
-- 名單表格上不印。跟 invite_codes_for_review() 一樣從 auth.users 拿。沒有帳號回 null。
create or replace function public.person_email(p_person uuid)
returns text language sql stable security definer
set search_path = public, auth, pg_temp
as $$
  select u.email from public.people pe join auth.users u on u.id = pe.profile_id
   where pe.id = p_person and public.is_senior();
$$;
revoke all on function public.person_email(uuid) from public, anon;
grant execute on function public.person_email(uuid) to authenticated;

commit;

select * from (
  with fn as (
    select proname, oidvectortypes(proargtypes) as args, regexp_replace(prosrc, '--[^\n]*', '', 'g') as body
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'
  ), idx as (
    select count(*) as n from pg_indexes where schemaname = 'public' and tablename = 'positions' and indexname = 'positions_one_per_team'
  ), oldc as (
    select count(*) as n from pg_constraint where conname = 'positions_person_id_term_id_key'
  ), del2 as (
    select count(*) as n from fn where proname = 'delete_position' and args = 'uuid, text'
  ), del3 as (
    select count(*) as n from fn where proname = 'delete_position' and args = 'uuid, text, text'
  ), conf as (
    select count(*) as n from fn where proname in ('set_position', 'import_positions', 'merge_people', 'end_term')
       and body like '%on conflict (person_id, term_id, (coalesce(team, ''''))) do%'
  ), pe as (
    select count(*) as n from fn where proname = 'person_email' and body like '%public.is_senior()%'
  ), pt as (
    select count(*) as n from fn where proname = 'public_team' and body like '%po.team nulls first%'
  ), pa as (
    select count(*) as n from fn where proname = 'public_alumni' and body like '%string_agg%'
  )
  select 0 ord, 'OVERALL' as 項目, null::text as 應該是, null::text as 實際是,
    case when (select n from idx) = 1 and (select n from oldc) = 0 and (select n from del2) = 0 and (select n from del3) = 1
      and (select n from conf) = 4 and (select n from pe) = 1 and (select n from pt) = 1 and (select n from pa) = 1
    then 'PASS' else 'FAIL' end as 結果
  union all select 1, '★ 唯一鍵是 人 × 屆 × team（index 在、舊 constraint 不在）', '1|0', (select n from idx)::text || '|' || (select n from oldc)::text, case when (select n from idx) = 1 and (select n from oldc) = 0 then 'PASS' else 'FAIL' end
  union all select 2, 'delete_position 只剩三個參數那一版', '0|1', (select n from del2)::text || '|' || (select n from del3)::text, case when (select n from del2) = 0 and (select n from del3) = 1 then 'PASS' else 'FAIL' end
  union all select 3, '★ 四支寫職位的函式都對新的唯一鍵', '4', (select n from conf)::text, case when (select n from conf) = 4 then 'PASS' else 'FAIL' end
  union all select 4, '★ person_email 的門是 is_senior', '1', (select n from pe)::text, case when (select n from pe) = 1 then 'PASS' else 'FAIL' end
  union all select 5, 'public_team 一筆職位一列、public_alumni 把職位接起來', '1|1', (select n from pt)::text || '|' || (select n from pa)::text, case when (select n from pt) = 1 and (select n from pa) = 1 then 'PASS' else 'FAIL' end
) t order by ord;
