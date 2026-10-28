-- BT 財務　2026-11-08
--
-- 用法：整份貼進 Supabase SQL Editor 按一次 Run。可以重跑，不會動既有資料。最後印一張 PASS / FAIL 表。
-- **要先跑過 2026-11-07-alumni-invite-back.sql**（順序照日期；這一支用到 2026-10-24 的 is_senior()、terms、people、positions，
-- 以及 2026-09-08 的 is_president()）。
-- ⚠ 這一支**重新定義了 my_access()**（多一格 finance）。之後要是重跑 2026-10-24 那一支，記得再跑一次這一支，不然側欄的「財務」會不見。
--
-- Paul 2026-11-07：「總共多少錢、花在哪、收入，全部」。他拍板的預設：
--   看：Co-President、Senior Adviser、Sponsorship 的 Director。改：Co-President、Sponsorship 的 Director。
--   從今天每個帳戶的餘額開始記（開帳餘額），不補舊帳。嘖嘖撥款整筆當一筆收入。
-- 設計與理由在 docs/2026-11-08-財務設計.md，後台在 /admin/finance/。
--
-- ============================================================================
-- 這一支在做什麼
-- ============================================================================
--   1. 兩道門：can_view_finance()（is_senior 或這一屆 Sponsorship Team 的 Director）、can_edit_finance()（is_president 或那位 Director）。
--      「Sponsorship 的 Director」看 positions：這一屆（terms.status = current）、team 是 Sponsorship Team、title_en 含 director。
--      改 my_access()：能看的人多一格 { id: 'finance', level: 'view' | 'edit' }，側欄靠它決定「財務」那一組亮不亮。
--   2. 五張表：fin_accounts（錢放哪：銀行、現金、平台）、fin_categories（收支分哪幾種）、fin_transactions（每一筆）、
--      fin_budgets（每屆每類支出的預算）、fin_log（每一次新增、改、作廢的前後值，trigger 寫，沒有人改得動）。
--   3. RLS：五張表只有 can_view_finance() 的人讀得到；**沒有任何寫的政策**，寫一律走函式。anon 什麼都碰不到。
--   4. 寫的函式（第一句都問 can_edit_finance）：fin_upsert_account、fin_upsert_category、fin_add_transaction、
--      fin_update_transaction（作廢過的擋）、fin_void_transaction（要原因）、fin_set_budget。
--      台幣由資料庫算（金額 × 匯率，四捨五入到分），不信前端算的。哪一屆由日期算。
--   5. 讀的函式（問 can_view_finance）：fin_bootstrap()（屆、帳戶、類別、預算，一趟）、fin_overview(屆)（每個帳戶的餘額、
--      每月與每類的合計、預算對花掉）、fin_export(屆, 從, 到)（給 CSV 的列，帶名字）。
--      餘額 = 開帳餘額 + 開帳日起的收入 − 支出 − 轉出 + 轉入，作廢的不算。轉帳不是收入也不是支出。
--   6. Storage bucket receipts：**私人**（沒有公開讀）、5 MB、只收 jpeg／png／webp／pdf。讀給 can_view_finance、傳與刪給 can_edit_finance。
--      本機 smoke 的 Postgres 用替身的 storage schema；正式站上是真的。
--   7. 類別 seed：收入五種（贊助、捐款、募資、補助、其他）、支出八種（場地、餐飲、印刷、軟體、交通、回饋品與寄送、手續費、其他）。
--      on conflict (code) do nothing，重跑不會把後台改過的名字蓋回來。
-- ============================================================================

begin;

-- ---------- 1. 兩道門 ----------
-- 這一屆 Sponsorship Team 的 Director。people.profile_id 對帳號，positions 對屆與 team，terms.status = current 是「這一屆」。
-- team 比對寬一點（^sponsorship，不分大小寫）：2026-10-24 搬資料時有的 team 沒有「 Team」字尾。
create or replace function public.is_sponsorship_director()
returns boolean language sql stable security definer
set search_path = public, pg_temp
as $$
  select public.is_cadre() and exists (
    select 1 from public.positions po
      join public.people pe on pe.id = po.person_id
      join public.terms t on t.id = po.term_id
     where pe.profile_id = auth.uid() and t.status = 'current'
       and coalesce(po.team, '') ~* '^sponsorship'
       and coalesce(po.title_en, '') ~* 'director'
  );
$$;
create or replace function public.can_view_finance()
returns boolean language sql stable security definer
set search_path = public, pg_temp
as $$ select public.is_senior() or public.is_sponsorship_director(); $$;
create or replace function public.can_edit_finance()
returns boolean language sql stable security definer
set search_path = public, pg_temp
as $$ select public.is_president() or public.is_sponsorship_director(); $$;
revoke all on function public.is_sponsorship_director(), public.can_view_finance(), public.can_edit_finance() from public;
grant execute on function public.is_sponsorship_director(), public.can_view_finance(), public.can_edit_finance() to anon, authenticated;

create or replace function public.fin_require_view()
returns void language plpgsql
set search_path = public, pg_temp
as $$ begin if not public.can_view_finance() then raise exception 'not_finance_viewer' using errcode = 'P0001'; end if; end $$;
create or replace function public.fin_require_edit()
returns void language plpgsql
set search_path = public, pg_temp
as $$ begin if not public.can_edit_finance() then raise exception 'not_finance_editor' using errcode = 'P0001'; end if; end $$;
revoke all on function public.fin_require_view(), public.fin_require_edit() from public, anon, authenticated;

-- my_access()：原本那一段一字不改（2026-10-24），後面多接 finance 那一格。前端 shared/auth.js 把 workspaces 陣列變成 { id: level }，
-- 所以側欄的 who: "ws:finance" 不用改任何前端的讀取路徑。
create or replace function public.my_access()
returns jsonb language sql stable security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'role',  p.role,
    'rank',  p.board_role,
    'senior', p.role = 'cadre' and p.board_role in ('president', 'senior_adviser'),
    'workspaces', coalesce((
      select jsonb_agg(jsonb_build_object('id', x.id, 'level', x.level, 'kind', w.kind, 'team', w.team,
                                          'title_zh', w.title_zh, 'title_en', w.title_en) order by x.id)
        from (
          select a.workspace_id as id, a.level from assignments a where a.user_id = p.id
          union
          select w.id, 'manage' from workspaces w where w.owner = p.id and w.active
        ) x join workspaces w on w.id = x.id
    ), '[]'::jsonb)
    || case when public.can_view_finance()
            then jsonb_build_array(jsonb_build_object('id', 'finance', 'level', case when public.can_edit_finance() then 'edit' else 'view' end,
                                                      'kind', 'finance', 'team', null, 'title_zh', '財務', 'title_en', 'Finance'))
            else '[]'::jsonb end)
    from profiles p where p.id = auth.uid();
$$;
revoke all on function public.my_access() from public, anon;
grant execute on function public.my_access() to authenticated;

-- ---------- 2. 五張表 ----------
create table if not exists public.fin_accounts (
  id              uuid primary key default gen_random_uuid(),
  name_zh         text not null default '',
  name_en         text not null default '',
  kind            text not null default 'bank' check (kind in ('bank', 'cash', 'platform')),
  currency        text not null default 'TWD',
  opening_balance numeric(14,2) not null default 0,
  opening_on      date not null default current_date,
  sort            int  not null default 100,
  archived_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (name_zh <> '' or name_en <> '')
);
comment on table public.fin_accounts is '錢放在哪裡。開帳餘額是「開始記帳那一天帳戶裡的數字」，那一天之前的收支不補登也不算進餘額（Paul 2026-11-07：從今天的餘額開始）。';

create table if not exists public.fin_categories (
  id          uuid primary key default gen_random_uuid(),
  code        text unique,                                   -- seed 用的代號，後台加的沒有
  kind        text not null check (kind in ('income', 'expense')),
  name_zh     text not null default '',
  name_en     text not null default '',
  sort        int  not null default 100,
  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (name_zh <> '' or name_en <> '')
);

create table if not exists public.fin_transactions (
  id            uuid primary key default gen_random_uuid(),
  happened_on   date not null,
  kind          text not null check (kind in ('income', 'expense', 'transfer')),
  amount        numeric(14,2) not null check (amount > 0),
  currency      text not null default 'TWD',
  amount_twd    numeric(14,2) not null check (amount_twd > 0),
  fx_rate       numeric(12,6) check (fx_rate is null or fx_rate > 0),
  account_id    uuid not null references public.fin_accounts(id),
  to_account_id uuid references public.fin_accounts(id),
  category_id   uuid references public.fin_categories(id),
  counterparty  text not null default '',
  note          text not null default '',
  receipt_path  text,
  term_id       text references public.terms(id),
  entered_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  voided_at     timestamptz,
  voided_by     uuid references public.profiles(id) on delete set null,
  void_reason   text,
  -- 轉帳一定有兩個不同的帳戶、沒有類別；收入與支出沒有轉入帳戶。函式會先擋，這裡是第二道。
  check ((kind = 'transfer' and to_account_id is not null and to_account_id <> account_id and category_id is null)
      or (kind <> 'transfer' and to_account_id is null)),
  check (currency = 'TWD' or fx_rate is not null),
  check (voided_at is null or coalesce(void_reason, '') <> '')
);
create index if not exists fin_transactions_date on public.fin_transactions (happened_on desc, created_at desc);
create index if not exists fin_transactions_term on public.fin_transactions (term_id);
comment on table public.fin_transactions is '每一筆進出。登錯的不刪，作廢（voided_at 加原因）留著；作廢過的不能再改。台幣 amount_twd 由函式算（金額 × 匯率）。';

create table if not exists public.fin_budgets (
  term_id     text not null references public.terms(id),
  category_id uuid not null references public.fin_categories(id),
  amount_twd  numeric(14,2) not null default 0 check (amount_twd >= 0),
  updated_by  uuid references public.profiles(id) on delete set null,
  updated_at  timestamptz not null default now(),
  primary key (term_id, category_id)
);

create table if not exists public.fin_log (
  id         bigserial primary key,
  table_name text not null,
  row_id     text not null,
  action     text not null,                 -- insert | update | void
  who        uuid,
  at         timestamptz not null default now(),
  before     jsonb,
  after      jsonb
);
create index if not exists fin_log_row on public.fin_log (table_name, row_id, at desc);

-- 每一次新增、改、作廢都留一列前後值。trigger 寫，不靠函式記得呼叫。
create or replace function public.fin_log_row()
returns trigger language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_action text; v_id text; v_new jsonb; v_old jsonb;
begin
  -- 四張表共用一支，欄位不一樣，所以一律先轉成 jsonb 再取（直接寫 new.term_id 在沒有那一欄的表上會炸）。
  v_new := to_jsonb(new);
  v_old := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  if tg_op = 'INSERT' then v_action := 'insert';
  elsif tg_table_name = 'fin_transactions' and v_new->>'voided_at' is not null and v_old->>'voided_at' is null then v_action := 'void';
  else v_action := 'update'; end if;
  v_id := case when tg_table_name = 'fin_budgets' then (v_new->>'term_id') || ':' || (v_new->>'category_id') else v_new->>'id' end;
  insert into fin_log (table_name, row_id, action, who, before, after)
  values (tg_table_name, v_id, v_action, auth.uid(), v_old, v_new);
  return new;
end $$;
revoke all on function public.fin_log_row() from public, anon, authenticated;
do $$
declare t text;
begin
  foreach t in array array['fin_accounts', 'fin_categories', 'fin_transactions', 'fin_budgets'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_log', t);
    execute format('create trigger %I after insert or update on public.%I for each row execute function public.fin_log_row()', t || '_log', t);
  end loop;
end $$;

-- ---------- 3. RLS ----------
alter table public.fin_accounts     enable row level security;
alter table public.fin_categories   enable row level security;
alter table public.fin_transactions enable row level security;
alter table public.fin_budgets      enable row level security;
alter table public.fin_log          enable row level security;
revoke all on public.fin_accounts, public.fin_categories, public.fin_transactions, public.fin_budgets, public.fin_log from anon, authenticated;
grant select on public.fin_accounts, public.fin_categories, public.fin_transactions, public.fin_budgets, public.fin_log to authenticated;
revoke all on sequence public.fin_log_id_seq from anon, authenticated;
do $$
declare t text;
begin
  foreach t in array array['fin_accounts', 'fin_categories', 'fin_transactions', 'fin_budgets', 'fin_log'] loop
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.can_view_finance())', t || '_read', t);
  end loop;
end $$;

-- ---------- 4. 寫 ----------
-- 新增或改一個帳戶。p_patch 有 id 就是改（只收它認得的欄位；archived: true/false 是封存與恢復），沒有就是新增（回 id）。
create or replace function public.fin_upsert_account(p_patch jsonb)
returns uuid language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_id uuid; a record; v_kind text; v_on date;
begin
  perform public.fin_require_edit();
  v_id := nullif(p_patch->>'id', '')::uuid;
  v_kind := nullif(btrim(coalesce(p_patch->>'kind', '')), '');
  if v_kind is not null and v_kind not in ('bank', 'cash', 'platform') then raise exception 'bad_kind' using errcode = 'P0001'; end if;
  if p_patch ? 'opening_on' and nullif(p_patch->>'opening_on', '') is not null then
    begin v_on := (p_patch->>'opening_on')::date; exception when others then raise exception 'bad_date' using errcode = 'P0001'; end;
  end if;
  if v_id is null then
    if coalesce(btrim(p_patch->>'name_zh'), '') = '' and coalesce(btrim(p_patch->>'name_en'), '') = '' then raise exception 'need_name' using errcode = 'P0001'; end if;
    insert into fin_accounts (name_zh, name_en, kind, currency, opening_balance, opening_on, sort)
    values (coalesce(btrim(p_patch->>'name_zh'), ''), coalesce(btrim(p_patch->>'name_en'), ''), coalesce(v_kind, 'bank'),
            upper(coalesce(nullif(btrim(p_patch->>'currency'), ''), 'TWD')), coalesce((p_patch->>'opening_balance')::numeric, 0), coalesce(v_on, current_date),
            coalesce((select max(sort) from fin_accounts), 0) + 10)
    returning id into v_id;
    return v_id;
  end if;
  select * into a from fin_accounts where id = v_id;
  if a.id is null then raise exception 'no_such_account' using errcode = 'P0001'; end if;
  if (p_patch ? 'name_zh' or p_patch ? 'name_en')
     and coalesce(btrim(coalesce(p_patch->>'name_zh', a.name_zh)), '') = '' and coalesce(btrim(coalesce(p_patch->>'name_en', a.name_en)), '') = '' then
    raise exception 'need_name' using errcode = 'P0001';
  end if;
  update fin_accounts set
    name_zh         = coalesce(btrim(p_patch->>'name_zh'), name_zh),
    name_en         = coalesce(btrim(p_patch->>'name_en'), name_en),
    kind            = coalesce(v_kind, kind),
    opening_balance = coalesce((p_patch->>'opening_balance')::numeric, opening_balance),
    opening_on      = coalesce(v_on, opening_on),
    sort            = coalesce((p_patch->>'sort')::int, sort),
    archived_at     = case when p_patch ? 'archived' then (case when (p_patch->>'archived')::boolean then coalesce(archived_at, now()) else null end) else archived_at end,
    updated_at      = now()
  where id = v_id;
  return v_id;
end $$;
revoke all on function public.fin_upsert_account(jsonb) from public, anon;
grant execute on function public.fin_upsert_account(jsonb) to authenticated;

-- 新增或改一個類別。種類（收入／支出）只在新增時定，之後不換（換了舊的筆就對不上）。
create or replace function public.fin_upsert_category(p_patch jsonb)
returns uuid language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_id uuid; c record; v_kind text;
begin
  perform public.fin_require_edit();
  v_id := nullif(p_patch->>'id', '')::uuid;
  v_kind := nullif(btrim(coalesce(p_patch->>'kind', '')), '');
  if v_id is null then
    if v_kind is null or v_kind not in ('income', 'expense') then raise exception 'bad_kind' using errcode = 'P0001'; end if;
    if coalesce(btrim(p_patch->>'name_zh'), '') = '' and coalesce(btrim(p_patch->>'name_en'), '') = '' then raise exception 'need_name' using errcode = 'P0001'; end if;
    insert into fin_categories (kind, name_zh, name_en, sort)
    values (v_kind, coalesce(btrim(p_patch->>'name_zh'), ''), coalesce(btrim(p_patch->>'name_en'), ''),
            coalesce((select max(sort) from fin_categories where kind = v_kind), 0) + 10)
    returning id into v_id;
    return v_id;
  end if;
  select * into c from fin_categories where id = v_id;
  if c.id is null then raise exception 'no_such_category' using errcode = 'P0001'; end if;
  if (p_patch ? 'name_zh' or p_patch ? 'name_en')
     and coalesce(btrim(coalesce(p_patch->>'name_zh', c.name_zh)), '') = '' and coalesce(btrim(coalesce(p_patch->>'name_en', c.name_en)), '') = '' then
    raise exception 'need_name' using errcode = 'P0001';
  end if;
  update fin_categories set
    name_zh     = coalesce(btrim(p_patch->>'name_zh'), name_zh),
    name_en     = coalesce(btrim(p_patch->>'name_en'), name_en),
    sort        = coalesce((p_patch->>'sort')::int, sort),
    archived_at = case when p_patch ? 'archived' then (case when (p_patch->>'archived')::boolean then coalesce(archived_at, now()) else null end) else archived_at end,
    updated_at  = now()
  where id = v_id;
  return v_id;
end $$;
revoke all on function public.fin_upsert_category(jsonb) from public, anon;
grant execute on function public.fin_upsert_category(jsonb) to authenticated;

-- 日期落在哪一屆就是哪一屆；都不在就是 current。
create or replace function public.fin_term_for(p_date date)
returns text language sql stable
set search_path = public, pg_temp
as $$
  select coalesce((select id from terms where p_date between starts_on and ends_on order by starts_on desc limit 1),
                  (select id from terms where status = 'current' limit 1));
$$;
revoke all on function public.fin_term_for(date) from public, anon, authenticated;

-- 一筆的欄位檢查與台幣換算，新增與改都走這裡。回 (amount_twd)。
create or replace function public.fin_check_row(
  p_kind text, p_amount numeric, p_currency text, p_fx numeric, p_account uuid, p_to uuid, p_category uuid)
returns numeric language plpgsql stable
set search_path = public, pg_temp
as $$
declare v_twd numeric; v_cat_kind text;
begin
  if p_kind not in ('income', 'expense', 'transfer') then raise exception 'bad_kind' using errcode = 'P0001'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'bad_amount' using errcode = 'P0001'; end if;
  if p_account is null or not exists (select 1 from fin_accounts where id = p_account) then raise exception 'no_such_account' using errcode = 'P0001'; end if;
  if p_kind = 'transfer' then
    if p_to is null then raise exception 'transfer_needs_two_accounts' using errcode = 'P0001'; end if;
    if p_to = p_account then raise exception 'same_account' using errcode = 'P0001'; end if;
    if not exists (select 1 from fin_accounts where id = p_to) then raise exception 'no_such_account' using errcode = 'P0001'; end if;
  else
    if p_category is null then raise exception 'need_category' using errcode = 'P0001'; end if;
    select kind into v_cat_kind from fin_categories where id = p_category;
    if v_cat_kind is null then raise exception 'no_such_category' using errcode = 'P0001'; end if;
    if v_cat_kind <> p_kind then raise exception 'category_kind_mismatch' using errcode = 'P0001'; end if;
  end if;
  if p_currency = 'TWD' then v_twd := round(p_amount, 2);
  else
    if p_fx is null or p_fx <= 0 then raise exception 'need_fx_rate' using errcode = 'P0001'; end if;
    v_twd := round(p_amount * p_fx, 2);
  end if;
  return v_twd;
end $$;
revoke all on function public.fin_check_row(text, numeric, text, numeric, uuid, uuid, uuid) from public, anon, authenticated;

-- 加一筆。p_row = { happened_on, kind, amount, currency, fx_rate, account_id, to_account_id, category_id, counterparty, note }。
create or replace function public.fin_add_transaction(p_row jsonb)
returns uuid language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_id uuid; v_kind text; v_cur text; v_date date; v_twd numeric; v_fx numeric;
        v_to uuid; v_cat uuid;
begin
  perform public.fin_require_edit();
  begin v_date := nullif(p_row->>'happened_on', '')::date; exception when others then raise exception 'bad_date' using errcode = 'P0001'; end;
  if v_date is null then raise exception 'bad_date' using errcode = 'P0001'; end if;
  v_kind := coalesce(p_row->>'kind', '');
  v_cur := upper(coalesce(nullif(btrim(p_row->>'currency'), ''), 'TWD'));
  v_fx := case when v_cur = 'TWD' then null else nullif(p_row->>'fx_rate', '')::numeric end;
  v_to := case when v_kind = 'transfer' then nullif(p_row->>'to_account_id', '')::uuid else null end;
  v_cat := case when v_kind = 'transfer' then null else nullif(p_row->>'category_id', '')::uuid end;
  v_twd := public.fin_check_row(v_kind, nullif(p_row->>'amount', '')::numeric, v_cur, v_fx, nullif(p_row->>'account_id', '')::uuid, v_to, v_cat);
  insert into fin_transactions (happened_on, kind, amount, currency, amount_twd, fx_rate, account_id, to_account_id, category_id, counterparty, note, term_id, entered_by)
  values (v_date, v_kind, round((p_row->>'amount')::numeric, 2), v_cur, v_twd, v_fx, (p_row->>'account_id')::uuid, v_to, v_cat,
          coalesce(btrim(p_row->>'counterparty'), ''), coalesce(btrim(p_row->>'note'), ''), public.fin_term_for(v_date), auth.uid())
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.fin_add_transaction(jsonb) from public, anon;
grant execute on function public.fin_add_transaction(jsonb) to authenticated;

-- 改一筆。作廢過的擋（tx_voided）。只改 p_patch 裡有的欄位；金額、幣別、匯率任一改了就重算台幣；日期改了就重算屆。
-- receipt_path 可以傳 null（拿掉收據）。
create or replace function public.fin_update_transaction(p_id uuid, p_patch jsonb)
returns uuid language plpgsql security definer
set search_path = public, pg_temp
as $$
declare t record; v_kind text; v_cur text; v_date date; v_amount numeric; v_fx numeric; v_acc uuid; v_to uuid; v_cat uuid; v_twd numeric;
begin
  perform public.fin_require_edit();
  select * into t from fin_transactions where id = p_id;
  if t.id is null then raise exception 'no_such_transaction' using errcode = 'P0001'; end if;
  if t.voided_at is not null then raise exception 'tx_voided' using errcode = 'P0001'; end if;
  v_kind := coalesce(nullif(p_patch->>'kind', ''), t.kind);
  v_cur := upper(coalesce(nullif(btrim(p_patch->>'currency'), ''), t.currency));
  v_amount := coalesce(nullif(p_patch->>'amount', '')::numeric, t.amount);
  v_fx := case when v_cur = 'TWD' then null when p_patch ? 'fx_rate' then nullif(p_patch->>'fx_rate', '')::numeric else t.fx_rate end;
  v_acc := coalesce(nullif(p_patch->>'account_id', '')::uuid, t.account_id);
  v_to := case when v_kind <> 'transfer' then null when p_patch ? 'to_account_id' then nullif(p_patch->>'to_account_id', '')::uuid else t.to_account_id end;
  v_cat := case when v_kind = 'transfer' then null when p_patch ? 'category_id' then nullif(p_patch->>'category_id', '')::uuid else t.category_id end;
  if p_patch ? 'happened_on' then
    begin v_date := nullif(p_patch->>'happened_on', '')::date; exception when others then raise exception 'bad_date' using errcode = 'P0001'; end;
  end if;
  v_date := coalesce(v_date, t.happened_on);
  v_twd := public.fin_check_row(v_kind, v_amount, v_cur, v_fx, v_acc, v_to, v_cat);
  update fin_transactions set
    happened_on = v_date, kind = v_kind, amount = round(v_amount, 2), currency = v_cur, amount_twd = v_twd, fx_rate = v_fx,
    account_id = v_acc, to_account_id = v_to, category_id = v_cat,
    counterparty = coalesce(btrim(p_patch->>'counterparty'), counterparty),
    note         = coalesce(btrim(p_patch->>'note'), note),
    receipt_path = case when p_patch ? 'receipt_path' then nullif(btrim(p_patch->>'receipt_path'), '') else receipt_path end,
    term_id      = public.fin_term_for(v_date),
    updated_at   = now()
  where id = p_id;
  return p_id;
end $$;
revoke all on function public.fin_update_transaction(uuid, jsonb) from public, anon;
grant execute on function public.fin_update_transaction(uuid, jsonb) to authenticated;

-- 作廢。要原因；作廢過的再作廢也擋。
create or replace function public.fin_void_transaction(p_id uuid, p_reason text)
returns uuid language plpgsql security definer
set search_path = public, pg_temp
as $$
declare t record;
begin
  perform public.fin_require_edit();
  if coalesce(btrim(p_reason), '') = '' then raise exception 'need_reason' using errcode = 'P0001'; end if;
  select * into t from fin_transactions where id = p_id;
  if t.id is null then raise exception 'no_such_transaction' using errcode = 'P0001'; end if;
  if t.voided_at is not null then raise exception 'tx_voided' using errcode = 'P0001'; end if;
  update fin_transactions set voided_at = now(), voided_by = auth.uid(), void_reason = btrim(p_reason), updated_at = now() where id = p_id;
  return p_id;
end $$;
revoke all on function public.fin_void_transaction(uuid, text) from public, anon;
grant execute on function public.fin_void_transaction(uuid, text) to authenticated;

-- 預算：某一屆某一類支出。0 等於沒填。
create or replace function public.fin_set_budget(p_term text, p_category uuid, p_amount numeric)
returns void language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  perform public.fin_require_edit();
  if not exists (select 1 from terms where id = p_term) then raise exception 'no_such_term' using errcode = 'P0001'; end if;
  if not exists (select 1 from fin_categories where id = p_category and kind = 'expense') then raise exception 'no_such_category' using errcode = 'P0001'; end if;
  if p_amount is null or p_amount < 0 then raise exception 'bad_amount' using errcode = 'P0001'; end if;
  insert into fin_budgets (term_id, category_id, amount_twd, updated_by) values (p_term, p_category, round(p_amount, 2), auth.uid())
  on conflict (term_id, category_id) do update set amount_twd = excluded.amount_twd, updated_by = auth.uid(), updated_at = now();
end $$;
revoke all on function public.fin_set_budget(text, uuid, numeric) from public, anon;
grant execute on function public.fin_set_budget(text, uuid, numeric) to authenticated;

-- ---------- 5. 讀 ----------
-- 屆、帳戶、類別、預算，一趟。筆本身前端直接讀表（RLS）。
create or replace function public.fin_bootstrap()
returns jsonb language plpgsql stable security definer
set search_path = public, pg_temp
as $$
begin
  perform public.fin_require_view();
  return jsonb_build_object(
    'can_edit', public.can_edit_finance(),
    'terms', coalesce((select jsonb_agg(to_jsonb(t) order by t.starts_on desc) from terms t), '[]'::jsonb),
    'accounts', coalesce((select jsonb_agg(to_jsonb(a) order by a.sort, a.created_at) from fin_accounts a), '[]'::jsonb),
    'categories', coalesce((select jsonb_agg(to_jsonb(c) order by c.kind, c.sort, c.created_at) from fin_categories c), '[]'::jsonb),
    'budgets', coalesce((select jsonb_agg(to_jsonb(b)) from fin_budgets b), '[]'::jsonb));
end $$;
revoke all on function public.fin_bootstrap() from public, anon;
grant execute on function public.fin_bootstrap() to authenticated;

-- 一個帳戶現在的餘額：開帳餘額 + 開帳日起的收入 − 支出 − 轉出 + 轉入，作廢的不算。
create or replace function public.fin_balance(p_account uuid)
returns numeric language sql stable
set search_path = public, pg_temp
as $$
  select a.opening_balance
       + coalesce((select sum(case when t.kind = 'income' and t.account_id = a.id then t.amount_twd
                                   when t.kind = 'expense' and t.account_id = a.id then -t.amount_twd
                                   when t.kind = 'transfer' and t.account_id = a.id then -t.amount_twd
                                   when t.kind = 'transfer' and t.to_account_id = a.id then t.amount_twd
                                   else 0 end)
                     from fin_transactions t
                    where t.voided_at is null and t.happened_on >= a.opening_on
                      and (t.account_id = a.id or t.to_account_id = a.id)), 0)
    from fin_accounts a where a.id = p_account;
$$;
revoke all on function public.fin_balance(uuid) from public, anon, authenticated;

-- 總覽：每個帳戶的餘額與總額；那一屆每月、每類的合計；預算對花掉。前端的 UI.overview() 是同一條公式（test/finance.test.mjs 驗它、smoke 驗這裡）。
create or replace function public.fin_overview(p_term text)
returns jsonb language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare v jsonb;
begin
  perform public.fin_require_view();
  select jsonb_build_object(
    'term', p_term,
    'balances', coalesce((select jsonb_agg(jsonb_build_object('account_id', a.id, 'name_zh', a.name_zh, 'name_en', a.name_en, 'kind', a.kind, 'balance', public.fin_balance(a.id)) order by a.sort)
                           from fin_accounts a where a.archived_at is null), '[]'::jsonb),
    'total', coalesce((select sum(public.fin_balance(a.id)) from fin_accounts a where a.archived_at is null), 0),
    'income', coalesce((select sum(amount_twd) from fin_transactions where voided_at is null and term_id = p_term and kind = 'income'), 0),
    'expense', coalesce((select sum(amount_twd) from fin_transactions where voided_at is null and term_id = p_term and kind = 'expense'), 0),
    'months', coalesce((select jsonb_agg(jsonb_build_object('ym', ym, 'income', inc, 'expense', exp) order by ym) from (
                 select to_char(happened_on, 'YYYY-MM') ym,
                        sum(case when kind = 'income' then amount_twd else 0 end) inc,
                        sum(case when kind = 'expense' then amount_twd else 0 end) exp
                   from fin_transactions where voided_at is null and term_id = p_term and kind <> 'transfer' group by 1) m), '[]'::jsonb),
    'categories', coalesce((select jsonb_agg(jsonb_build_object('category_id', c.id, 'kind', c.kind, 'name_zh', c.name_zh, 'name_en', c.name_en, 'amount', coalesce(s.total, 0)) order by c.kind, coalesce(s.total, 0) desc, c.sort)
                 from fin_categories c left join (select category_id, sum(amount_twd) total from fin_transactions where voided_at is null and term_id = p_term group by 1) s on s.category_id = c.id
                where c.archived_at is null or s.total is not null), '[]'::jsonb),
    'budget', coalesce((select jsonb_agg(jsonb_build_object('category_id', c.id, 'name_zh', c.name_zh, 'name_en', c.name_en, 'budget', coalesce(b.amount_twd, 0),
                        'spent', coalesce((select sum(amount_twd) from fin_transactions t where t.voided_at is null and t.term_id = p_term and t.kind = 'expense' and t.category_id = c.id), 0)) order by c.sort)
                 from fin_categories c left join fin_budgets b on b.category_id = c.id and b.term_id = p_term
                where c.kind = 'expense' and c.archived_at is null), '[]'::jsonb))
  into v;
  return v;
end $$;
revoke all on function public.fin_overview(text) from public, anon;
grant execute on function public.fin_overview(text) to authenticated;

-- 匯出：那一屆（或 null 全部）在日期範圍內的每一筆，帶帳戶與類別的名字。作廢的也在，最後兩欄標著。
create or replace function public.fin_export(p_term text default null, p_from date default null, p_to date default null)
returns table (
  happened_on date, kind text, amount numeric, currency text, fx_rate numeric, amount_twd numeric,
  account_zh text, account_en text, to_account_zh text, to_account_en text, category_zh text, category_en text,
  counterparty text, note text, has_receipt boolean, voided boolean, void_reason text, term_id text, entered_by_name text
) language plpgsql stable security definer
set search_path = public, pg_temp
as $$
begin
  perform public.fin_require_view();
  return query
    select t.happened_on, t.kind, t.amount, t.currency, t.fx_rate, t.amount_twd,
           a.name_zh, a.name_en, b.name_zh, b.name_en, c.name_zh, c.name_en,
           t.counterparty, t.note, t.receipt_path is not null, t.voided_at is not null, t.void_reason, t.term_id,
           coalesce(nullif(p.name_zh, ''), p.name_en)
      from fin_transactions t
      join fin_accounts a on a.id = t.account_id
      left join fin_accounts b on b.id = t.to_account_id
      left join fin_categories c on c.id = t.category_id
      left join profiles p on p.id = t.entered_by
     where (p_term is null or t.term_id = p_term)
       and (p_from is null or t.happened_on >= p_from)
       and (p_to is null or t.happened_on <= p_to)
     order by t.happened_on desc, t.created_at desc;
end $$;
revoke all on function public.fin_export(text, date, date) from public, anon;
grant execute on function public.fin_export(text, date, date) to authenticated;

-- ---------- 6. Storage ----------
-- bucket receipts：**私人**（public = false，沒有任何人能用公開網址開）、5 MB、只收圖與 PDF。路徑 <筆的 id>/<時間>-<亂數>.<副檔名>。
-- 讀給 can_view_finance（後台用簽名網址開），傳、改、刪給 can_edit_finance。本機 Postgres 沒有 storage schema 就跳過（驗收表印 SKIP）。
do $$
begin
  if to_regclass('storage.buckets') is null or to_regclass('storage.objects') is null then
    raise notice 'storage schema 不在（本機 smoke），略過 bucket 與政策';
    return;
  end if;
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('receipts', 'receipts', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
  on conflict (id) do update set public = false, file_size_limit = 5242880, allowed_mime_types = excluded.allowed_mime_types;
  execute 'drop policy if exists receipts_read on storage.objects';
  execute 'create policy receipts_read on storage.objects for select to authenticated using (bucket_id = ''receipts'' and public.can_view_finance())';
  execute 'drop policy if exists receipts_insert on storage.objects';
  execute 'create policy receipts_insert on storage.objects for insert to authenticated with check (bucket_id = ''receipts'' and public.can_edit_finance())';
  execute 'drop policy if exists receipts_update on storage.objects';
  execute 'create policy receipts_update on storage.objects for update to authenticated using (bucket_id = ''receipts'' and public.can_edit_finance())';
  execute 'drop policy if exists receipts_delete on storage.objects';
  execute 'create policy receipts_delete on storage.objects for delete to authenticated using (bucket_id = ''receipts'' and public.can_edit_finance())';
end $$;

-- ---------- 7. 類別 seed ----------
insert into public.fin_categories (code, kind, name_zh, name_en, sort) values
  ('sponsorship',      'income',  '贊助',       'Sponsorship',        10),
  ('donation',         'income',  '捐款',       'Donation',           20),
  ('crowdfunding',     'income',  '募資',       'Crowdfunding',       30),
  ('grant',            'income',  '補助',       'Grant',              40),
  ('other_income',     'income',  '其他收入',   'Other income',       90),
  ('venue',            'expense', '場地',       'Venue',              10),
  ('food',             'expense', '餐飲',       'Food',               20),
  ('printing',         'expense', '印刷',       'Printing',           30),
  ('software',         'expense', '軟體與網域', 'Software & domains', 40),
  ('transport',        'expense', '交通',       'Transport',          50),
  ('rewards_shipping', 'expense', '回饋品與寄送', 'Rewards & shipping', 60),
  ('fees',             'expense', '手續費',     'Fees',               70),
  ('other_expense',    'expense', '其他支出',   'Other expenses',     90)
on conflict (code) do nothing;

commit;

-- ---------- 驗收 ----------
select * from (
  with t as (
    select (select count(*) from pg_tables where schemaname = 'public' and tablename in ('fin_accounts', 'fin_categories', 'fin_transactions', 'fin_budgets', 'fin_log')) as tables,
           (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'
              and p.proname in ('is_sponsorship_director', 'can_view_finance', 'can_edit_finance', 'fin_require_view', 'fin_require_edit', 'fin_log_row',
                                'fin_upsert_account', 'fin_upsert_category', 'fin_term_for', 'fin_check_row', 'fin_add_transaction', 'fin_update_transaction',
                                'fin_void_transaction', 'fin_set_budget', 'fin_bootstrap', 'fin_balance', 'fin_overview', 'fin_export')) as fns,
           (select count(*) from pg_policies where schemaname = 'public' and tablename like 'fin\_%') as pols,
           (select count(*) from pg_policies where schemaname = 'public' and tablename like 'fin\_%' and cmd <> 'SELECT') as write_pols,
           (select count(*) from pg_trigger where tgname like 'fin\_%\_log' and not tgisinternal) as trgs,
           not has_table_privilege('anon', 'public.fin_transactions', 'select') and not has_table_privilege('anon', 'public.fin_accounts', 'select')
             and not has_table_privilege('anon', 'public.fin_log', 'select') as anon_no_table,
           not has_table_privilege('authenticated', 'public.fin_transactions', 'insert') and not has_table_privilege('authenticated', 'public.fin_transactions', 'update')
             and not has_table_privilege('authenticated', 'public.fin_transactions', 'delete') and not has_table_privilege('authenticated', 'public.fin_log', 'insert') as no_direct_write,
           not has_function_privilege('anon', 'public.fin_add_transaction(jsonb)', 'execute') and not has_function_privilege('anon', 'public.fin_bootstrap()', 'execute')
             and not has_function_privilege('anon', 'public.fin_overview(text)', 'execute') as anon_no_fn,
           (select count(*) from pg_proc where proname in ('fin_upsert_account', 'fin_upsert_category', 'fin_add_transaction', 'fin_update_transaction', 'fin_void_transaction', 'fin_set_budget')
              and regexp_replace(prosrc, '--[^\n]*', '', 'g') like '%fin_require_edit%') as edit_gates,
           (select count(*) from pg_proc where proname in ('fin_bootstrap', 'fin_overview', 'fin_export')
              and regexp_replace(prosrc, '--[^\n]*', '', 'g') like '%fin_require_view%') as view_gates,
           (select regexp_replace(prosrc, '--[^\n]*', '', 'g') like '%tx_voided%' from pg_proc where proname = 'fin_update_transaction') as void_gate,
           (select regexp_replace(prosrc, '--[^\n]*', '', 'g') like '%finance%' from pg_proc where proname = 'my_access') as access_cell,
           (select count(*) from public.fin_categories where code is not null) as seeded,
           to_regclass('storage.buckets') is not null as has_storage,
           case when to_regclass('storage.buckets') is null then null
                else (select count(*) from storage.buckets where id = 'receipts' and not public) = 1 end as bucket_private,
           case when to_regclass('storage.objects') is null then null
                else (select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'receipts\_%') = 4 end as storage_pols
  )
  select 0 ord, 'OVERALL' as 項目, null::text as 應該是, null::text as 實際是,
    case when tables = 5 and fns = 18 and pols = 5 and write_pols = 0 and trgs = 4 and anon_no_table and no_direct_write and anon_no_fn
          and edit_gates = 6 and view_gates = 3 and void_gate and access_cell and seeded = 13
          and (not has_storage or (bucket_private and storage_pols)) then 'PASS' else 'FAIL' end as 結果 from t
  union all select 1,  '★ 五張表在', '5', tables::text, case when tables = 5 then 'PASS' else 'FAIL' end from t
  union all select 2,  '★ 十八支函式在', '18', fns::text, case when fns = 18 then 'PASS' else 'FAIL' end from t
  union all select 3,  '★ 五條讀的政策、零條寫的（寫一律走函式）', '5 / 0', pols::text || ' / ' || write_pols::text, case when pols = 5 and write_pols = 0 then 'PASS' else 'FAIL' end from t
  union all select 4,  '★ 四張表都有寫紀錄的 trigger', '4', trgs::text, case when trgs = 4 then 'PASS' else 'FAIL' end from t
  union all select 5,  '★ anon 讀不到任何一張財務的表', 'true', anon_no_table::text, case when anon_no_table then 'PASS' else 'FAIL' end from t
  union all select 6,  '★ 登入的人也不能直接寫表（insert / update / delete 都沒有）', 'true', no_direct_write::text, case when no_direct_write then 'PASS' else 'FAIL' end from t
  union all select 7,  '★ anon 叫不到任何一支財務的函式', 'true', anon_no_fn::text, case when anon_no_fn then 'PASS' else 'FAIL' end from t
  union all select 8,  '★ 六支寫的函式第一句都問 can_edit_finance', '6', edit_gates::text, case when edit_gates = 6 then 'PASS' else 'FAIL' end from t
  union all select 9,  '★ 三支讀的函式都問 can_view_finance', '3', view_gates::text, case when view_gates = 3 then 'PASS' else 'FAIL' end from t
  union all select 10, '★ 作廢過的不能改（tx_voided）', 'true', void_gate::text, case when void_gate then 'PASS' else 'FAIL' end from t
  union all select 11, '★ my_access() 多了 finance 那一格（側欄靠它）', 'true', access_cell::text, case when access_cell then 'PASS' else 'FAIL' end from t
  union all select 12, '十三個類別 seed 在', '13', seeded::text, case when seeded = 13 then 'PASS' else 'FAIL' end from t
  union all select 13, '★ Storage bucket receipts 是私人的', 'true', coalesce(bucket_private::text, '沒有 storage schema'), case when bucket_private is null then 'SKIP' when bucket_private then 'PASS' else 'FAIL' end from t
  union all select 14, 'Storage 四條政策（讀給能看的人、傳改刪給能改的人）', '4 條', coalesce(storage_pols::text, '沒有 storage schema'), case when storage_pols is null then 'SKIP' when storage_pols then 'PASS' else 'FAIL' end from t
) x order by ord;
