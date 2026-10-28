-- 實習護照的分類（一頁一個分類）改成從後台管：加、改名、刪、排順序。　2026-11-14
--
-- 用法：整份貼進 Supabase SQL Editor 按一次 Run。最後印出 PASS / FAIL 表。
-- **先跑 2026-11-13-passport-months-control.sql**（順序照日期；這一支用到 2026-10-24 的 require_internship_team()）。
--
-- ============================================================================
-- 這一支在做什麼
-- ============================================================================
-- Paul 2026-10-28：「實習護照也一樣，我要全部自己管。」實習護照一個分類一頁，
-- 之前三個分類（入門、任務、反思）寫死在程式裡，格子只能放進這三個。
--
--   1. 新表 intern_groups：代號、順序、中英名字、一行副標（中英）、一段說明（中英）。
--      第一次建表時放進現在那三個，文案跟畫面上現在的一字不差，所以跑完畫面不會變。
--   2. intern_tasks.category 原本的 check（只准三個）拿掉，改成外鍵指到 intern_groups。
--   3. save_intern_group：新增（代號由這裡產生）或改一個分類的字。
--      delete_intern_group：**那個分類底下還有格子（任何一屆）就擋**，先把格子換分類或刪掉。
--      move_intern_group：跟前一個或後一個對調順序。
--   4. save_intern_task 重建，唯一的差別是分類改成「intern_groups 裡有的」。
--
-- 門：跟改格子同一道，require_internship_team()（Internship team 與 Co-President）。
-- 讀：跟格子同一條，intern 本人與 Internship team 讀得到。

begin;

create table if not exists public.intern_groups (
  key        text primary key check (key ~ '^[a-z0-9_-]{2,24}$'),
  seq        int  not null,
  name_zh    text not null,
  name_en    text not null,
  tagline_zh text not null default '',
  tagline_en text not null default '',
  body_zh    text not null default '',
  body_en    text not null default ''
);
comment on table public.intern_groups is
  '實習護照的分類，一個分類一頁。後台「實習護照」改，不用改程式。代號建了就不改（格子靠它對到分類）。';

insert into public.intern_groups (key, seq, name_zh, name_en, tagline_zh, tagline_en, body_zh, body_en) values
  ('onboard', 1, '入門', 'Onboard', '第一個月做的事', 'What you do in the first month',
   '認識 BT、認識帶你的人、第一次開會。這幾格是這一期的起點，第一個月蓋完。',
   'Meet BT, meet the person guiding you, sit in on your first meeting. These boxes are the start of the term. Finish them in the first month.'),
  ('project', 2, '任務', 'Project', '工作本身', 'The work itself',
   '你實際交出去的東西。第一個任務、期中、期末，每交一次蓋一格。',
   'The work you actually hand in. First task, midterm, final. One stamp per delivery.'),
  ('reflect', 3, '反思', 'Reflect', '寫給自己的', 'Written to yourself',
   '寫給自己的。只有你看得到這幾格裡寫了什麼，帶你的人也看不到，所以可以誠實寫。',
   'Written to yourself. Only you can see what is in these boxes, not even the person guiding you, so you can be honest.')
on conflict (key) do nothing;

alter table public.intern_groups enable row level security;
drop policy if exists intern_groups_read on public.intern_groups;
create policy intern_groups_read on public.intern_groups
  for select to authenticated using (public.is_intern() or public.is_internship_team());
revoke all on public.intern_groups from anon;
grant select on public.intern_groups to authenticated;

-- 分類的 check 換成外鍵。
do $$
declare v text;
begin
  for v in select conname from pg_constraint
            where conrelid = 'public.intern_tasks'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%category%'
  loop
    execute format('alter table public.intern_tasks drop constraint %I', v);
  end loop;
  if not exists (select 1 from pg_constraint where conrelid = 'public.intern_tasks'::regclass and conname = 'intern_tasks_category_fkey') then
    alter table public.intern_tasks add constraint intern_tasks_category_fkey
      foreign key (category) references public.intern_groups(key) on update cascade;
  end if;
end $$;

create or replace function public.save_intern_group(
  p_key text, p_name_zh text, p_name_en text, p_tagline_zh text, p_tagline_en text, p_body_zh text, p_body_en text)
returns text language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_key text := nullif(btrim(coalesce(p_key, '')), '');
begin
  perform public.require_internship_team();
  if nullif(btrim(coalesce(p_name_zh, '')), '') is null or nullif(btrim(coalesce(p_name_en, '')), '') is null then
    raise exception 'empty_title' using errcode = 'P0001';
  end if;
  if v_key is null then
    loop
      v_key := 'g' || substr(md5(random()::text || clock_timestamp()::text), 1, 6);
      exit when not exists (select 1 from intern_groups where key = v_key);
    end loop;
    insert into intern_groups (key, seq, name_zh, name_en, tagline_zh, tagline_en, body_zh, body_en)
    values (v_key, (select coalesce(max(seq), 0) + 1 from intern_groups), btrim(p_name_zh), btrim(p_name_en),
            btrim(coalesce(p_tagline_zh, '')), btrim(coalesce(p_tagline_en, '')), btrim(coalesce(p_body_zh, '')), btrim(coalesce(p_body_en, '')));
  else
    update intern_groups set name_zh = btrim(p_name_zh), name_en = btrim(p_name_en),
      tagline_zh = btrim(coalesce(p_tagline_zh, '')), tagline_en = btrim(coalesce(p_tagline_en, '')),
      body_zh = btrim(coalesce(p_body_zh, '')), body_en = btrim(coalesce(p_body_en, ''))
     where key = v_key;
    if not found then raise exception 'no_such_group' using errcode = 'P0001'; end if;
  end if;
  return v_key;
end $$;
revoke all on function public.save_intern_group(text, text, text, text, text, text, text) from public, anon;
grant execute on function public.save_intern_group(text, text, text, text, text, text, text) to authenticated;

create or replace function public.delete_intern_group(p_key text)
returns text language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  perform public.require_internship_team();
  if exists (select 1 from intern_tasks where category = p_key) then
    raise exception 'group_has_tasks' using errcode = 'P0001';
  end if;
  delete from intern_groups where key = p_key;
  if not found then raise exception 'no_such_group' using errcode = 'P0001'; end if;
  return p_key;
end $$;
revoke all on function public.delete_intern_group(text) from public, anon;
grant execute on function public.delete_intern_group(text) to authenticated;

create or replace function public.move_intern_group(p_key text, p_dir int)
returns void language plpgsql security definer
set search_path = public, pg_temp
as $$
declare a int; b text;
begin
  perform public.require_internship_team();
  select seq into a from intern_groups where key = p_key;
  if a is null then raise exception 'no_such_group' using errcode = 'P0001'; end if;
  if p_dir = -1 then
    select key into b from intern_groups where seq < a order by seq desc limit 1;
  elsif p_dir = 1 then
    select key into b from intern_groups where seq > a order by seq limit 1;
  else
    raise exception 'bad_dir' using errcode = 'P0001';
  end if;
  if b is null then return; end if;
  update intern_groups set seq = (select seq from intern_groups where key = b) where key = p_key;
  update intern_groups set seq = a where key = b;
end $$;
revoke all on function public.move_intern_group(text, int) from public, anon;
grant execute on function public.move_intern_group(text, int) to authenticated;

-- save_intern_task 重建（2026-10-18 那一版）：唯一的差別是分類改成 intern_groups 裡有的。
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
  if p_category is null or not exists (select 1 from intern_groups where key = p_category) then
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

commit;

-- ---------- 驗收 ----------
select * from (
  with fns as (
    select p.proname, regexp_replace(p.prosrc, '--[^\n]*', '', 'g') as body, p.prosecdef, p.proconfig
      from pg_proc p where p.pronamespace = 'public'::regnamespace
       and p.proname in ('save_intern_group', 'delete_intern_group', 'move_intern_group', 'save_intern_task')
  ), g as (
    select
      (select count(*) from fns) as n_fns,
      (select count(*) from fns where prosecdef and array_to_string(proconfig, ',') like '%search_path=%public%') as n_defs,
      (select count(*) from fns where body like '%perform public.require_internship_team()%') as n_gate,
      (select count(*) from pg_proc p, aclexplode(p.proacl) x
        where p.pronamespace = 'public'::regnamespace and p.proname in ('save_intern_group', 'delete_intern_group', 'move_intern_group', 'save_intern_task')
          and x.grantee in (0::regrole, 'anon'::regrole) and x.privilege_type = 'EXECUTE') as anon_n,
      (select relrowsecurity from pg_class where oid = 'public.intern_groups'::regclass) as rls,
      exists (select 1 from pg_constraint where conrelid = 'public.intern_tasks'::regclass and conname = 'intern_tasks_category_fkey') as fk,
      not exists (select 1 from pg_constraint where conrelid = 'public.intern_tasks'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%category%') as no_check,
      (select body from fns where proname = 'delete_intern_group') like '%group_has_tasks%' as del_guard,
      (select count(*) from intern_groups where key in ('onboard', 'project', 'reflect')) as base_n
  )
  select 0 ord, 'OVERALL' as 項目, null::text as 應該是, null::text as 實際是,
    case when n_fns = 4 and n_defs = 4 and n_gate = 4 and anon_n = 0 and rls and fk and no_check and del_guard then 'PASS' else 'FAIL' end as 結果 from g
  union all select 1, '四支函式都在、security definer、search_path 釘死', '4 / 4', n_fns::text || ' / ' || n_defs::text, case when n_fns = 4 and n_defs = 4 then 'PASS' else 'FAIL' end from g
  union all select 2, '★ 四支第一件事都是確認 Internship team', '4', n_gate::text, case when n_gate = 4 then 'PASS' else 'FAIL' end from g
  union all select 3, '★ 沒登入叫不動', '0 筆', anon_n::text || ' 筆', case when anon_n = 0 then 'PASS' else 'FAIL' end from g
  union all select 4, '★ intern_groups 開了 RLS', 'true', rls::text, case when rls then 'PASS' else 'FAIL' end from g
  union all select 5, '格子的分類改成外鍵、舊的 check 拿掉了', 'true / true', fk::text || ' / ' || no_check::text, case when fk and no_check then 'PASS' else 'FAIL' end from g
  union all select 6, '★ 還有格子的分類刪不掉', 'true', del_guard::text, case when del_guard then 'PASS' else 'FAIL' end from g
  -- 這一條只是告訴你原本那三個分類還在不在，不算 PASS / FAIL（後台刪掉其中一個之後就不是 3）。
  union all select 7, '原本那三個分類（第一次跑完應該是 3）', '3', base_n::text, '看一眼' from g
) t order by ord;
