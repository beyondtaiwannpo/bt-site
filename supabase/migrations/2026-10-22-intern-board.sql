-- 實習護照的蛇梯棋　2026-10-22
--
-- 用法：整份貼進 Supabase SQL Editor 按一次 Run。最後印出 PASS / FAIL 表。
-- **要先跑過 2026-10-17-intern-passport.sql 與 2026-10-18-intern-admin.sql**
-- （intern_* 五張表、is_intern()、is_internship_team()、require_internship_team() 都在那兩支）。
--
-- ============================================================================
-- 這一支在做什麼
-- ============================================================================
-- Paul 2026-10-19 拍板（docs/2026-10-19-實習護照蛇梯棋計畫.md）：護照底層不動，上面加一層棋盤。
--   intern_boards    一屆一張棋盤：幾格、開了沒。
--   intern_squares   棋盤上的一格：第幾格、種類（空格、任務格、梯子底、蛇頭）、綁哪一個格子、通到第幾格。
--   intern_moves     一次擲骰：誰、擲到幾、落在哪、蛇梯算完到哪。**只有 roll_dice() 寫得進去。**
--
-- 規則（五題照建議）：
--   蓋一個章拿一張票；落在還沒做的任務格、之後做完，多一張票（同一格只算一次）。
--   任務隨時能做，棋盤不綁順序。走到最後一格算終點；最後一格綁的那個格子（期末成果）沒蓋章，
--   棋子停在倒數第二格等。蛇只讓人後退，不減票。票不過期。
--   位置不另外存，永遠從 intern_moves 最後一列算。
--
-- ============================================================================
-- 骰子在這裡擲，不在瀏覽器
-- ============================================================================
-- roll_dice() 用 random() 擲，瀏覽器只收結果。intern_moves 沒有任何 insert 政策，
-- 連本人也寫不進去。改一行 JavaScript 擲不出 6。
--
-- ============================================================================
-- 這一支「不做」什麼
-- ============================================================================
--   不碰既有五張 intern_* 表與它們的 RLS，一個字都不動。不讀 intern_entries。
--   別的 intern 只看得到你「現在在第幾格」（intern_positions()），擲骰的流水只有本人與 Internship team。
begin;

-- ---------- 1. 三張表 ----------
create table if not exists public.intern_boards (
  term       text primary key references public.intern_terms(id) on delete cascade,
  size       int  not null default 30 check (size between 10 and 60),
  active     boolean not null default false,
  updated_at timestamptz not null default now()
);
comment on table public.intern_boards is
  '一屆一張蛇梯棋的棋盤。active = false 的時候 intern 看到的還是原本的護照，排好再開。
   開了之後 size 與蛇梯鎖住（save_board 會擋），只能改空格與任務格綁哪一格。';
drop trigger if exists intern_boards_touch on public.intern_boards;
create trigger intern_boards_touch before update on public.intern_boards
  for each row execute function public.touch_updated_at();

create table if not exists public.intern_squares (
  term    text not null references public.intern_boards(term) on delete cascade,
  pos     int  not null check (pos >= 1),
  kind    text not null check (kind in ('plain', 'task', 'ladder', 'snake')),
  task_id text references public.intern_tasks(id),
  goes_to int,
  primary key (term, pos)
);
comment on table public.intern_squares is
  '棋盤上的一格。plain 空格；task 任務格（task_id 綁這一屆的格子）；ladder 梯子底（goes_to 往上）；snake 蛇頭（goes_to 往下）。
   沒有列的格子就是空格。最後一格（pos = size）通常是 task，綁期末成果。';

create table if not exists public.intern_moves (
  id         bigserial primary key,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  term       text not null references public.intern_terms(id) on delete cascade,
  rolled     int  not null check (rolled between 1 and 6),
  from_pos   int  not null,
  landed     int  not null,        -- 擲完先落在哪（蛇梯算之前）
  to_pos     int  not null,        -- 蛇梯算完、終點規則算完，真的停在哪
  created_at timestamptz not null default now()
);
comment on table public.intern_moves is
  '一次擲骰。只有 roll_dice() 寫得進去。位置 = 這個人最後一列的 to_pos，沒有列就是 0（起點）。';
create index if not exists intern_moves_user_idx on public.intern_moves (user_id, term, id);

-- ---------- 2. 票與位置（兩支內部用的純函式）----------
-- 票 = 這一屆蓋的章 + 落過的任務格裡後來做完的（每格一次）- 已經擲過的次數。
create or replace function public.intern_tickets(p_user uuid, p_term text)
returns int language sql stable security definer
set search_path = public, pg_temp
as $$
  select
    (select count(*) from public.intern_stamps s join public.intern_tasks t on t.id = s.task_id
      where s.user_id = p_user and t.term = p_term)::int
  + (select count(distinct sq.task_id) from public.intern_moves m
      join public.intern_squares sq on sq.term = m.term and sq.pos = m.landed and sq.kind = 'task'
      join public.intern_stamps s on s.user_id = m.user_id and s.task_id = sq.task_id
      where m.user_id = p_user and m.term = p_term)::int
  - (select count(*) from public.intern_moves where user_id = p_user and term = p_term)::int;
$$;
revoke all on function public.intern_tickets(uuid, text) from public, anon, authenticated;

create or replace function public.intern_pos(p_user uuid, p_term text)
returns int language sql stable security definer
set search_path = public, pg_temp
as $$
  select coalesce((select to_pos from public.intern_moves
                    where user_id = p_user and term = p_term order by id desc limit 1), 0);
$$;
revoke all on function public.intern_pos(uuid, text) from public, anon, authenticated;

-- ---------- 3. roll_dice() ----------
-- 第一句：你是 intern。第二句：這一屆有開著的棋盤。第三句：你有票。然後才擲。
-- 回傳 json：{ rolled, landed, to_pos, kind, goes_to, tickets_left, finished }
create or replace function public.roll_dice()
returns jsonb language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_user   uuid := auth.uid();
  v_term   text;
  v_size   int;
  v_pos    int;
  v_tix    int;
  v_roll   int;
  v_landed int;
  v_to     int;
  v_kind   text := 'plain';
  v_goes   int;
  v_final  text;
begin
  if not public.is_intern() then
    raise exception 'not_intern' using errcode = 'P0001';
  end if;
  select b.term, b.size into v_term, v_size
    from public.intern_boards b join public.intern_terms t on t.id = b.term
   where t.active and b.active limit 1;
  if v_term is null then
    raise exception 'no_board' using errcode = 'P0001';
  end if;
  v_pos := public.intern_pos(v_user, v_term);
  if v_pos >= v_size then
    raise exception 'finished' using errcode = 'P0001';
  end if;
  v_tix := public.intern_tickets(v_user, v_term);
  if v_tix <= 0 then
    raise exception 'no_ticket' using errcode = 'P0001';
  end if;

  v_roll := floor(random() * 6)::int + 1;
  v_landed := least(v_pos + v_roll, v_size);
  v_to := v_landed;
  select kind, goes_to into v_kind, v_goes from public.intern_squares where term = v_term and pos = v_landed;
  if v_kind in ('ladder', 'snake') and v_goes is not null then
    v_to := v_goes;
  end if;
  v_kind := coalesce(v_kind, 'plain');
  -- 終點規則：最後一格綁的那個格子（期末成果）沒蓋章，棋子停在倒數第二格等。
  if v_to >= v_size then
    select task_id into v_final from public.intern_squares where term = v_term and pos = v_size and kind = 'task';
    if v_final is not null and not exists (
         select 1 from public.intern_stamps where user_id = v_user and task_id = v_final) then
      v_to := v_size - 1;
    else
      v_to := v_size;
    end if;
  end if;

  insert into public.intern_moves (user_id, term, rolled, from_pos, landed, to_pos)
  values (v_user, v_term, v_roll, v_pos, v_landed, v_to);

  return jsonb_build_object(
    'rolled', v_roll, 'landed', v_landed, 'to_pos', v_to, 'kind', v_kind, 'goes_to', v_goes,
    'tickets_left', public.intern_tickets(v_user, v_term), 'finished', v_to >= v_size);
end $$;
revoke all on function public.roll_dice() from public, anon;
grant execute on function public.roll_dice() to authenticated;

-- ---------- 4. 大家在第幾格（進度牆用）----------
-- 別的 intern 只拿得到「在第幾格、擲過幾次、幾張票」，拿不到流水。門：intern 或 Internship team。
create or replace function public.intern_positions()
returns table (user_id uuid, pos int, rolls int, tickets int)
language sql stable security definer
set search_path = public, pg_temp
as $$
  select p.id, public.intern_pos(p.id, t.id),
         (select count(*) from public.intern_moves m where m.user_id = p.id and m.term = t.id)::int,
         public.intern_tickets(p.id, t.id)
    from public.profiles p, public.intern_terms t
   where t.active and p.role = 'intern'
     and (public.is_intern() or public.is_internship_team());
$$;
revoke all on function public.intern_positions() from public, anon;
grant execute on function public.intern_positions() to authenticated;

-- ---------- 5. save_board() 與 set_board_active() ----------
-- squares 是 json 陣列：[{ "pos": 3, "kind": "ladder", "goes_to": 11 }, { "pos": 7, "kind": "task", "task_id": "T2627-02" }, ...]
-- 沒列到的格子就是空格。存之前檢查：梯子往上、蛇往下、通到的格子存在、最後一格不是蛇頭、任務格綁的格子是這一屆的。
-- 棋盤開著的時候 size 與蛇梯鎖住（intern 已經在走），只能改空格與任務格。
create or replace function public.save_board(p_term text, p_size int, p_squares jsonb)
returns text language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  r jsonb;
  v_pos int; v_kind text; v_goes int; v_task text;
  v_active boolean;
  v_old_size int;
  v_old_sl text; v_new_sl text;
begin
  perform public.require_internship_team();
  if not exists (select 1 from public.intern_terms where id = p_term) then
    raise exception 'no_such_term' using errcode = 'P0001';
  end if;
  if p_size is null or p_size < 10 or p_size > 60 then
    raise exception 'bad_size' using errcode = 'P0001';
  end if;
  if p_squares is null or jsonb_typeof(p_squares) <> 'array' then
    raise exception 'bad_squares' using errcode = 'P0001';
  end if;
  for r in select * from jsonb_array_elements(p_squares) loop
    v_pos  := (r->>'pos')::int;
    v_kind := r->>'kind';
    v_goes := nullif(r->>'goes_to', '')::int;
    v_task := nullif(r->>'task_id', '');
    if v_pos is null or v_pos < 1 or v_pos > p_size then
      raise exception 'bad_pos' using errcode = 'P0001';
    end if;
    if v_kind not in ('plain', 'task', 'ladder', 'snake') then
      raise exception 'bad_kind' using errcode = 'P0001';
    end if;
    if v_kind = 'ladder' and (v_goes is null or v_goes <= v_pos or v_goes > p_size) then
      raise exception 'ladder_must_go_up' using errcode = 'P0001';
    end if;
    if v_kind = 'snake' and (v_goes is null or v_goes >= v_pos or v_goes < 1) then
      raise exception 'snake_must_go_down' using errcode = 'P0001';
    end if;
    if v_kind = 'snake' and v_pos = p_size then
      raise exception 'last_square_cannot_be_snake' using errcode = 'P0001';
    end if;
    if v_kind = 'task' and (v_task is null or not exists (
         select 1 from public.intern_tasks where id = v_task and term = p_term)) then
      raise exception 'bad_task' using errcode = 'P0001';
    end if;
  end loop;

  select active, size into v_active, v_old_size from public.intern_boards where term = p_term;
  if v_active then
    if v_old_size <> p_size then
      raise exception 'board_locked' using errcode = 'P0001';
    end if;
    select coalesce(string_agg(pos || ':' || kind || ':' || goes_to, ',' order by pos), '') into v_old_sl
      from public.intern_squares where term = p_term and kind in ('ladder', 'snake');
    select coalesce(string_agg((x->>'pos') || ':' || (x->>'kind') || ':' || (x->>'goes_to'), ',' order by (x->>'pos')::int), '') into v_new_sl
      from jsonb_array_elements(p_squares) x where x->>'kind' in ('ladder', 'snake');
    if v_old_sl <> v_new_sl then
      raise exception 'board_locked' using errcode = 'P0001';
    end if;
  end if;

  insert into public.intern_boards (term, size) values (p_term, p_size)
  on conflict (term) do update set size = excluded.size;
  delete from public.intern_squares where term = p_term;
  insert into public.intern_squares (term, pos, kind, task_id, goes_to)
  select p_term, (x->>'pos')::int, x->>'kind',
         case when x->>'kind' = 'task' then nullif(x->>'task_id', '') end,
         case when x->>'kind' in ('ladder', 'snake') then nullif(x->>'goes_to', '')::int end
    from jsonb_array_elements(p_squares) x
   where x->>'kind' <> 'plain';
  return p_term;
end $$;
revoke all on function public.save_board(text, int, jsonb) from public, anon;
grant execute on function public.save_board(text, int, jsonb) to authenticated;

create or replace function public.set_board_active(p_term text, p_active boolean)
returns text language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  perform public.require_internship_team();
  if not exists (select 1 from public.intern_boards where term = p_term) then
    raise exception 'no_board' using errcode = 'P0001';
  end if;
  update public.intern_boards set active = coalesce(p_active, false) where term = p_term;
  return p_term;
end $$;
revoke all on function public.set_board_active(text, boolean) from public, anon;
grant execute on function public.set_board_active(text, boolean) to authenticated;

-- ---------- 6. RLS 與權限 ----------
alter table public.intern_boards  enable row level security;
alter table public.intern_squares enable row level security;
alter table public.intern_moves   enable row level security;

drop policy if exists intern_boards_read on public.intern_boards;
create policy intern_boards_read on public.intern_boards
  for select to authenticated using (public.is_intern() or public.is_internship_team());
drop policy if exists intern_squares_read on public.intern_squares;
create policy intern_squares_read on public.intern_squares
  for select to authenticated using (public.is_intern() or public.is_internship_team());
-- 流水：本人全部、Internship team 全部。**沒有 insert / update / delete 政策，連本人也沒有。**
drop policy if exists intern_moves_read on public.intern_moves;
create policy intern_moves_read on public.intern_moves
  for select to authenticated
  using ((auth.uid() = user_id and public.is_intern()) or public.is_internship_team());

revoke all on public.intern_boards, public.intern_squares, public.intern_moves from anon, authenticated;
grant select on public.intern_boards, public.intern_squares, public.intern_moves to authenticated;
revoke all on sequence public.intern_moves_id_seq from anon, authenticated;

commit;

-- ============================================================================
-- 驗收：跑完看這張表，全部 PASS 才算。
-- ============================================================================
select 項目, 應該是, 實際是, 結果 from (
  with tbl as (
    select count(*) as n from pg_tables where schemaname = 'public'
       and tablename in ('intern_boards', 'intern_squares', 'intern_moves')
  ), rls as (
    select count(*) as n from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname in ('intern_boards', 'intern_squares', 'intern_moves') and c.relrowsecurity
  ), mv_write as (
    select count(*) as n from pg_policies where schemaname = 'public' and tablename = 'intern_moves' and cmd <> 'SELECT'
  ), fn as (
    select proname, prosecdef, proconfig, proacl, pg_get_functiondef(oid) as body
      from pg_proc where proname in ('roll_dice', 'save_board', 'set_board_active', 'intern_positions')
  ), anon_n as (
    select count(*) as n from fn f, aclexplode(f.proacl) x
     where x.grantee in (0::regrole, 'anon'::regrole) and x.privilege_type = 'EXECUTE'
  ), tbl_w as (
    select count(*) as n from information_schema.role_table_grants
     where table_schema = 'public' and table_name in ('intern_boards', 'intern_squares', 'intern_moves')
       and grantee in ('anon', 'authenticated') and privilege_type in ('INSERT', 'UPDATE', 'DELETE')
  ), ent as (
    select count(*) as n from fn where body like '%intern_entries%'
  )
  select 0 ord, 'OVERALL' as 項目, null::text as 應該是, null::text as 實際是,
    case when (select n from tbl) = 3 and (select n from rls) = 3 and (select n from mv_write) = 0
      and (select count(*) from fn) = 4 and (select n from anon_n) = 0 and (select n from tbl_w) = 0
      and (select n from ent) = 0
      and (select body from fn where proname = 'roll_dice') like '%no_ticket%'
      and (select body from fn where proname = 'roll_dice') like '%is_intern()%'
      and (select body from fn where proname = 'save_board') like '%require_internship_team%'
    then 'PASS' else 'FAIL' end as 結果
  union all select 1, '三張表都在', '3', (select n from tbl)::text, case when (select n from tbl) = 3 then 'PASS' else 'FAIL' end
  union all select 2, '三張表都開了 RLS', '3', (select n from rls)::text, case when (select n from rls) = 3 then 'PASS' else 'FAIL' end
  union all select 3, '★ intern_moves 沒有任何寫入政策（只有 roll_dice 寫得進去）', '0', (select n from mv_write)::text, case when (select n from mv_write) = 0 then 'PASS' else 'FAIL' end
  union all select 4, '四支函式都在', '4', (select count(*) from fn)::text, case when (select count(*) from fn) = 4 then 'PASS' else 'FAIL' end
  union all select 5, '★ 沒登入叫不動任何一支', '0', (select n from anon_n)::text, case when (select n from anon_n) = 0 then 'PASS' else 'FAIL' end
  union all select 6, '★ 三張表對前端沒有寫入權限', '0', (select n from tbl_w)::text, case when (select n from tbl_w) = 0 then 'PASS' else 'FAIL' end
  union all select 7, '★ 骰子在資料庫擲，沒票擲不了', 'true', ((select body from fn where proname = 'roll_dice') like '%no_ticket%')::text,
    case when (select body from fn where proname = 'roll_dice') like '%no_ticket%' then 'PASS' else 'FAIL' end
  union all select 8, '★ 只有 intern 擲得了', 'true', ((select body from fn where proname = 'roll_dice') like '%is_intern()%')::text,
    case when (select body from fn where proname = 'roll_dice') like '%is_intern()%' then 'PASS' else 'FAIL' end
  union all select 9, '★ 排棋盤的門是 Internship team', 'true', ((select body from fn where proname = 'save_board') like '%require_internship_team%')::text,
    case when (select body from fn where proname = 'save_board') like '%require_internship_team%' then 'PASS' else 'FAIL' end
  union all select 10, '★ 四支函式都不碰心得（intern_entries）', '0', (select n from ent)::text, case when (select n from ent) = 0 then 'PASS' else 'FAIL' end
) t order by ord;
