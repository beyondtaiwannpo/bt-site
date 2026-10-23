-- 權限重新設計批 1：職級與指派分開　2026-10-24
--
-- 用法：整份貼進 Supabase SQL Editor 按一次 Run。包在一個 transaction 裡，
-- 中途任何一句失敗整份回滾。可以重跑。最後印一張 PASS / FAIL 表。
--
-- 設計與拍板：docs/2026-10-23-權限重新設計.md（Paul 2026-10-23 十一題全照建議）。
-- 要先跑過 2026-10-21-people-admin.sql（role_changes、set_team 在那一支）
-- 與 2026-10-20-passport-admin.sql（幹部護照那五支函式在那一支）。
--
-- ============================================================================
-- 這一支在做什麼
-- ============================================================================
--   1. 職級四級：president / senior_adviser / director / member（畫面叫 Associate）。
--      Director 與 Associate 自己不帶權限，權限全部來自「指派」。
--   2. 五張新表：terms（屆別）、people（人，可以沒有帳號）、positions（每人每屆的職位）、
--      workspaces（工作區）、assignments（人 × 工作區 × 看／改／管）。
--   3. 三支新的判斷函式 can_view / can_edit / can_manage。**既有的
--      is_on_team / is_director_of / is_internship_team 名字不變、本文改成查指派**，
--      所以申請、信件、實習護照的每一條 RLS 一行都不用動。
--      只有 resources 那四條 policy 要重寫（申請與資源從此是兩個工作區）。
--   4. 把今天的資料搬過去，一筆都不丟：每位幹部一列 people、一筆 2026-27 的職位
--      （public_title 原封不動搬進去）、照 team 字串拆開搬成指派
--      （Director 管、Associate 看、Internship Team 的人改）。
--   5. 拆掉 2026-10-21 那條 guard_profile_team trigger：team 不再長出權限，
--      它就只是一個標籤，回到每個人自己勾。
--   6. 人的管理（只有 Co-President）：改名、刪除成員、合併兩筆、綁紀錄的校友碼、結束這一屆。
--
-- ============================================================================
-- 這一支「不做」什麼
-- ============================================================================
--   不 drop profiles.public_title（值搬走了，欄位留到前端改完再單獨 drop）。
--   不 drop privileged_teams（/settings/ 現在的程式還會讀它，前端改完再 drop）。
--   不動 profiles.role 的意思，不動 claim_invite 以外的邀請碼那條路。
--   不動 intern 那條路（只有 is_internship_team() 的定義換掉）。
--   不碰 stamps / entries / intern_stamps / intern_entries：指派表碰不到任何人的心得。
--
-- ============================================================================
-- ⚠ 重跑舊遷移檔會把這一支蓋掉一部分
-- ============================================================================
-- 下面這幾支用 create or replace 重建了同名的函式或 policy，在這一支**之後**
-- 再跑任何一支，就要把這一支再跑一次（它可以重跑）：
--   2026-09-08-students.sql（is_director_of）、2026-09-09-applications.sql（is_on_team）、
--   2026-09-11-resources.sql（resources 四條 policy）、2026-09-13-public-team.sql（set_public_approved）、
--   2026-09-16-mail-templates.sql（set_mail_template）、2026-09-18-alumni-stories.sql（set_story_approved、public_alumni）、
--   2026-10-14 / 10-15 / 10-16（claim_invite）、2026-10-17-intern-passport.sql（is_internship_team）、
--   2026-10-18-intern-admin.sql（require_internship_team）、2026-10-20-passport-admin.sql（五支）、
--   2026-10-21-people-admin.sql（set_board_role、set_team，而且會把 trigger 建回來）。
-- scripts/db/smoke.sh 最後那一段就是這樣做的。
-- ============================================================================

begin;

-- ---------- 0. 職級 ----------
-- 2026-09-08 那支把 board_role 鎖在三個值，這裡換成四個。
alter table public.profiles drop constraint if exists profiles_board_role_check;
alter table public.profiles add constraint profiles_board_role_check
  check (board_role in ('member', 'director', 'senior_adviser', 'president'));
comment on column public.profiles.board_role is
  '職級：president（Co-President）/ senior_adviser（Senior Adviser）/ director / member（畫面叫 Associate）。
   2026-10-24 起 director 與 member 自己不帶任何權限，權限看 assignments。只有 set_board_role() 改得動。';

-- 「我是 Co-President 或 Senior Adviser」：這兩級不靠指派，全部寫在這一句。
create or replace function public.is_senior()
returns boolean language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles
     where id = auth.uid() and role = 'cadre'
       and board_role in ('president', 'senior_adviser')
  );
$$;
revoke execute on function public.is_senior() from public;
grant  execute on function public.is_senior() to anon, authenticated;

create or replace function public.require_senior()
returns void language plpgsql
set search_path = public, pg_temp
as $$
begin
  if not public.is_senior() then
    raise exception 'not_senior' using errcode = 'P0001';
  end if;
end $$;
revoke all on function public.require_senior() from public, anon, authenticated;

-- ---------- 1. 五張表 ----------
create table if not exists public.terms (
  id         text primary key,                 -- 2026-27
  title_zh   text,
  title_en   text,
  starts_on  date not null,
  ends_on    date not null,
  status     text not null default 'ended' check (status in ('current', 'ended')),
  created_at timestamptz not null default now(),
  check (ends_on > starts_on)
);
create unique index if not exists terms_one_current on public.terms ((status)) where status = 'current';
comment on table public.terms is 'BT 的屆別，一年一屆。同一時間只有一筆 current（partial unique index 守著）。';

-- 一列是一個人，**不是一個帳號**。profile_id 空的就是「沒有帳號」：
-- 平台之前的歷屆幹部由 Co-President 手動補進來，之後拿綁著這一筆的校友碼註冊就認領。
create table if not exists public.people (
  id         uuid primary key default gen_random_uuid(),
  name_zh    text,
  name_en    text,
  note       text,
  profile_id uuid unique references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
comment on table public.people is
  '名單上的人，跨屆的完整成員史。有帳號的 profile_id 指到 profiles；沒有的就是「沒有帳號」，
   算進該屆人數、永遠不上對外頁（對外兩頁都從帳號那一端出發）。刪帳號時這一列留著。';

create table if not exists public.positions (
  id         bigserial primary key,
  person_id  uuid not null references public.people(id) on delete cascade,
  term_id    text not null references public.terms(id),
  title_zh   text,
  title_en   text,
  team       text,
  created_at timestamptz not null default now(),
  unique (person_id, term_id)
);
comment on table public.positions is
  '每人每屆一筆：職位名稱（自由文字，例如 Director, Internship Team）與 team。
   團隊頁的頭銜從這裡算：title · term。職位是對外怎麼稱呼，不是職級。';

create table if not exists public.workspaces (
  id         text primary key,                 -- passport / intern-passport / apps:<team> / res:<team> / custom:<slug>
  kind       text not null check (kind in ('passport', 'intern-passport', 'apps', 'res', 'custom')),
  team       text,
  title_zh   text,
  title_en   text,
  owner      uuid references public.profiles(id) on delete set null,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);
comment on table public.workspaces is
  '一塊可以被派人進去做事的東西。擁有人自動算「管」。
   哪個功能守哪個工作區：apps:<team> 守 forms/applications/mail_outbox，res:<team> 守 resources，
   passport 守 activities/months/destinations，intern-passport 守 intern_* 的改動與讀取。
   custom:<slug> 建的時候什麼都不守，之後的功能自己寫 can_edit(''custom:…'')。';

create table if not exists public.assignments (
  user_id      uuid not null references public.profiles(id) on delete cascade,
  workspace_id text not null references public.workspaces(id) on delete cascade,
  level        text not null check (level in ('view', 'edit', 'manage')),
  granted_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  primary key (user_id, workspace_id)
);
comment on table public.assignments is
  '人 × 工作區 × 等級。只有 assign() / unassign() 寫得進去，每一筆都記 role_changes。
   Co-President 與 Senior Adviser 不需要這張表（is_senior() 一句涵蓋）。';

-- 綁著名單紀錄的邀請碼：用掉的那一刻認領那一筆。
alter table public.invite_codes add column if not exists person_id uuid references public.people(id) on delete set null;

alter table public.role_changes drop constraint if exists role_changes_field_check;
alter table public.role_changes add constraint role_changes_field_check
  check (field in ('board_role', 'team', 'name', 'role', 'position', 'assignment', 'removed', 'claimed', 'merged', 'term'));

-- ---------- 2. 新表的 RLS 與授權（先全部收回，再一項一項發）----------
alter table public.terms       enable row level security;
alter table public.people      enable row level security;
alter table public.positions   enable row level security;
alter table public.workspaces  enable row level security;
alter table public.assignments enable row level security;
revoke all on public.terms, public.people, public.positions, public.workspaces, public.assignments from anon, authenticated;
grant select on public.terms to anon, authenticated;
grant select on public.people, public.positions, public.workspaces, public.assignments to authenticated;

drop policy if exists terms_read on public.terms;
create policy terms_read on public.terms for select using (true);
-- 歷屆名單裡有從來沒同意公開任何事的人的名字：一般幹部只讀得到自己那一列。
drop policy if exists people_read on public.people;
create policy people_read on public.people for select to authenticated
  using (profile_id = auth.uid() or public.is_senior());
drop policy if exists positions_read on public.positions;
create policy positions_read on public.positions for select to authenticated
  using (public.is_senior() or exists (select 1 from public.people p where p.id = person_id and p.profile_id = auth.uid()));
drop policy if exists workspaces_read on public.workspaces;
create policy workspaces_read on public.workspaces for select to authenticated
  using (public.is_senior() or owner = auth.uid()
         or exists (select 1 from public.assignments a where a.workspace_id = id and a.user_id = auth.uid()));
-- assignments 的 policy 用到 can_manage()，放在第 3 節定義完之後。

-- ---------- 3. 三支判斷函式 ----------
-- 四件事任一成立就算：Co-President 或 Senior Adviser；工作區的擁有人；有指派。
-- **一定要是幹部**：指派只派幹部，但換屆變校友的人指派已清掉，這一句是第二道保險。
create or replace function public.can_view(p_ws text)
returns boolean language sql stable security definer
set search_path = public, pg_temp
as $$
  select public.is_senior()
      or exists (select 1 from public.workspaces w
                  where w.id = p_ws and w.owner = auth.uid()
                    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'cadre'))
      or exists (select 1 from public.assignments a
                  join public.profiles p on p.id = a.user_id and p.role = 'cadre'
                 where a.workspace_id = p_ws and a.user_id = auth.uid());
$$;
create or replace function public.can_edit(p_ws text)
returns boolean language sql stable security definer
set search_path = public, pg_temp
as $$
  select public.is_senior()
      or exists (select 1 from public.workspaces w
                  where w.id = p_ws and w.owner = auth.uid()
                    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'cadre'))
      or exists (select 1 from public.assignments a
                  join public.profiles p on p.id = a.user_id and p.role = 'cadre'
                 where a.workspace_id = p_ws and a.user_id = auth.uid() and a.level in ('edit', 'manage'));
$$;
create or replace function public.can_manage(p_ws text)
returns boolean language sql stable security definer
set search_path = public, pg_temp
as $$
  select public.is_senior()
      or exists (select 1 from public.workspaces w
                  where w.id = p_ws and w.owner = auth.uid()
                    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'cadre'))
      or exists (select 1 from public.assignments a
                  join public.profiles p on p.id = a.user_id and p.role = 'cadre'
                 where a.workspace_id = p_ws and a.user_id = auth.uid() and a.level = 'manage');
$$;
-- 給 anon 也能叫：forms_read 與 res_read 對沒登入的人也會評估這幾支（2026-09-14 那個 bug）。
-- 沒登入 auth.uid() 是 null，三支都回 false。
revoke execute on function public.can_view(text), public.can_edit(text), public.can_manage(text) from public;
grant  execute on function public.can_view(text), public.can_edit(text), public.can_manage(text) to anon, authenticated;

drop policy if exists assignments_read on public.assignments;
create policy assignments_read on public.assignments for select to authenticated
  using (user_id = auth.uid() or public.is_senior() or public.can_manage(workspace_id));

create or replace function public.require_ws_edit(p_ws text)
returns void language plpgsql
set search_path = public, pg_temp
as $$
begin
  if not public.can_edit(p_ws) then
    raise exception 'not_ws_edit:%', p_ws using errcode = 'P0001';
  end if;
end $$;
revoke all on function public.require_ws_edit(text) from public, anon, authenticated;

-- ---------- 4. 既有判斷函式換本文（名字、參數、授權都不變）----------
-- create or replace 會保留原本的 grant（2026-09-14 發給 anon 的那幾句還在）。
create or replace function public.is_on_team(p_team text)
returns boolean language sql stable security definer
set search_path = public, pg_temp
as $$ select public.can_view('apps:' || p_team); $$;

create or replace function public.is_director_of(p_team text)
returns boolean language sql stable security definer
set search_path = public, pg_temp
as $$ select public.can_edit('apps:' || p_team); $$;

create or replace function public.is_internship_team()
returns boolean language sql stable security definer
set search_path = public, pg_temp
as $$ select public.can_view('intern-passport'); $$;

-- 寫入那一側要「改」。錯誤碼維持 not_internship_team，前端的 says() 表與測試都認它。
create or replace function public.require_internship_team()
returns void language plpgsql
set search_path = public, pg_temp
as $$
begin
  if not public.can_edit('intern-passport') then
    raise exception 'not_internship_team' using errcode = 'P0001';
  end if;
end $$;

-- resources：申請與資源從此是兩個工作區，這四條不能再共用 is_director_of。
-- 「看」這一級看得到草稿；「改」才能動。已發布的任何人都讀得到（欄位授權才是那道門，沒動）。
drop policy if exists res_read   on public.resources;
drop policy if exists res_insert on public.resources;
drop policy if exists res_write  on public.resources;
drop policy if exists res_delete on public.resources;
create policy res_read on public.resources
  for select using (status = 'published' or public.can_view('res:' || team));
create policy res_insert on public.resources
  for insert to authenticated with check (public.can_edit('res:' || team));
create policy res_write on public.resources
  for update to authenticated using (public.can_edit('res:' || team))
                                with check (public.can_edit('res:' || team));
create policy res_delete on public.resources
  for delete to authenticated using (public.can_edit('res:' || team));

-- ---------- 5. 原本 Co-President 專用、現在 Senior Adviser 也能的四支 ----------
create or replace function public.set_public_approved(p_target uuid, p_ok boolean)
returns boolean language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  perform public.require_senior();
  update public.profiles set public_approved = p_ok
   where id = p_target and role = 'cadre';
  if not found then raise exception 'not_a_cadre' using errcode = 'P0001'; end if;
  return p_ok;
end $$;

create or replace function public.set_story_approved(p_target uuid, p_ok boolean)
returns boolean language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  perform public.require_senior();
  update public.alumni_stories s
     set story_approved = p_ok,
         approved_at = case when p_ok then now() else null end
    from public.profiles p
   where s.id = p_target and p.id = s.id and p.role in ('cadre', 'alumni');
  if not found then raise exception 'not_alumni_or_cadre' using errcode = 'P0001'; end if;
  return p_ok;
end $$;

create or replace function public.set_mail_template(p_kind text, p_subject text, p_body text)
returns text language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  perform public.require_senior();
  if coalesce(btrim(p_subject), '') = '' or coalesce(btrim(p_body), '') = '' then
    raise exception 'empty_mail' using errcode = 'P0001';
  end if;
  update public.mail_templates
     set subject = p_subject, body = p_body, updated_by = auth.uid()
   where kind = p_kind;
  if not found then raise exception 'no_such_template' using errcode = 'P0001'; end if;
  return p_kind;
end $$;

-- team 只是標籤了。Senior Adviser 也改得動，仍然記帳（名單上看得到誰改的）。
create or replace function public.set_team(p_target uuid, p_team text)
returns text language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_old text;
  v_new text := nullif(btrim(coalesce(p_team, '')), '');
begin
  perform public.require_senior();
  select team into v_old from profiles where id = p_target and role = 'cadre';
  if not found then
    raise exception 'not_a_cadre' using errcode = 'P0001';
  end if;
  if v_old is not distinct from v_new then
    return coalesce(v_new, '');
  end if;
  update profiles set team = v_new where id = p_target;
  perform public.log_role_change(p_target, 'team', v_old, v_new);
  return coalesce(v_new, '');
end $$;

-- 職級四級。其餘跟 2026-10-21 一模一樣：只有 Co-President、擋自我降級、只對幹部、記帳。
create or replace function public.set_board_role(p_target uuid, p_role text)
returns text language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_old text;
begin
  perform public.require_president();
  if p_role not in ('member', 'director', 'senior_adviser', 'president') then
    raise exception 'bad_role' using errcode = 'P0001';
  end if;
  if p_target = auth.uid() and p_role <> 'president' then
    raise exception 'cannot_demote_self' using errcode = 'P0001';
  end if;
  select board_role into v_old from profiles where id = p_target and role = 'cadre';
  if v_old is null then
    raise exception 'not_a_cadre' using errcode = 'P0001';
  end if;
  if v_old = p_role then
    return p_role;
  end if;
  update profiles set board_role = p_role where id = p_target;
  perform public.log_role_change(p_target, 'board_role', v_old, p_role);
  return p_role;
end $$;

-- ---------- 6. 幹部護照那五支：門從 Co-President 換成「passport 工作區的改」----------
-- 本文跟 2026-10-20-passport-admin.sql 一字不差，只有第一句的門換掉。
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
  perform public.require_ws_edit('passport');
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
  perform public.require_ws_edit('passport');
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
  perform public.require_ws_edit('passport');
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
  perform public.require_ws_edit('passport');
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
  perform public.require_ws_edit('passport');
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

-- ---------- 7. team 不再長出權限：拆掉 10-21 的 trigger ----------
drop trigger if exists guard_profile_team on public.profiles;
drop function if exists public.guard_profile_team();

-- ---------- 8. 記帳：沒有帳號的人也記得了 ----------
-- log_role_change() 要 target 在 profiles 裡；名單上沒帳號的紀錄用這一支，名字直接給。
create or replace function public.log_change(
  p_target uuid, p_name text, p_field text, p_old text, p_new text)
returns void language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  insert into role_changes (changed_by, target, target_name, field, old_value, new_value)
  values (auth.uid(), p_target, p_name, p_field, p_old, p_new);
end $$;
revoke all on function public.log_change(uuid, text, text, text, text) from public, anon, authenticated;

-- 名單上顯示的名字：有帳號用帳號的，沒有用紀錄上的。
create or replace function public.person_name(p_person uuid)
returns text language sql stable security definer
set search_path = public, pg_temp
as $$
  select coalesce(nullif(btrim(pr.name_zh), ''), nullif(btrim(pr.name_en), ''),
                  nullif(btrim(pe.name_zh), ''), nullif(btrim(pe.name_en), ''), '（沒有名字）')
    from people pe left join profiles pr on pr.id = pe.profile_id
   where pe.id = p_person;
$$;
revoke all on function public.person_name(uuid) from public, anon, authenticated;

-- ---------- 9. 指派 ----------
-- 門：Co-President、Senior Adviser，或對這個工作區是「管」（擁有人算管）。
-- 只派幹部：派學員進申請工作區，他就讀得到別人的申請。校友要進工作區當 mentor 先問 Paul。
create or replace function public.assign(p_target uuid, p_ws text, p_level text)
returns text language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_old text;
begin
  if not public.can_manage(p_ws) then
    raise exception 'not_ws_manage:%', p_ws using errcode = 'P0001';
  end if;
  if p_level not in ('view', 'edit', 'manage') then
    raise exception 'bad_level' using errcode = 'P0001';
  end if;
  if not exists (select 1 from workspaces where id = p_ws and active) then
    raise exception 'no_such_workspace' using errcode = 'P0001';
  end if;
  if not exists (select 1 from profiles where id = p_target and role = 'cadre') then
    raise exception 'not_a_cadre' using errcode = 'P0001';
  end if;
  select level into v_old from assignments where user_id = p_target and workspace_id = p_ws;
  if v_old = p_level then return p_level; end if;
  insert into assignments (user_id, workspace_id, level, granted_by)
  values (p_target, p_ws, p_level, auth.uid())
  on conflict (user_id, workspace_id) do update set level = excluded.level, granted_by = excluded.granted_by;
  perform public.log_role_change(p_target, 'assignment', coalesce(v_old, '') || '@' || p_ws, p_level || '@' || p_ws);
  return p_level;
end $$;
revoke all on function public.assign(uuid, text, text) from public, anon;
grant execute on function public.assign(uuid, text, text) to authenticated;

create or replace function public.unassign(p_target uuid, p_ws text)
returns boolean language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_old text;
begin
  if not public.can_manage(p_ws) then
    raise exception 'not_ws_manage:%', p_ws using errcode = 'P0001';
  end if;
  delete from assignments where user_id = p_target and workspace_id = p_ws returning level into v_old;
  if not found then return false; end if;
  perform public.log_role_change(p_target, 'assignment', v_old || '@' || p_ws, '@' || p_ws);
  return true;
end $$;
revoke all on function public.unassign(uuid, text) from public, anon;
grant execute on function public.unassign(uuid, text) to authenticated;

-- 之後的營隊或專案：建的時候什麼都不守，那個功能的 RLS 寫 can_edit('custom:<slug>') 才接上。
create or replace function public.create_workspace(p_slug text, p_title_zh text, p_title_en text, p_owner uuid)
returns text language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_id text;
begin
  perform public.require_senior();
  if coalesce(p_slug, '') !~ '^[a-z0-9-]{2,40}$' then
    raise exception 'bad_slug' using errcode = 'P0001';
  end if;
  if coalesce(btrim(p_title_zh), '') = '' and coalesce(btrim(p_title_en), '') = '' then
    raise exception 'empty_title' using errcode = 'P0001';
  end if;
  if p_owner is not null and not exists (select 1 from profiles where id = p_owner and role = 'cadre') then
    raise exception 'not_a_cadre' using errcode = 'P0001';
  end if;
  v_id := 'custom:' || p_slug;
  insert into workspaces (id, kind, title_zh, title_en, owner)
  values (v_id, 'custom', nullif(btrim(p_title_zh), ''), nullif(btrim(p_title_en), ''), p_owner)
  on conflict (id) do update set title_zh = excluded.title_zh, title_en = excluded.title_en, owner = excluded.owner, active = true;
  return v_id;
end $$;
revoke all on function public.create_workspace(text, text, text, uuid) from public, anon;
grant execute on function public.create_workspace(text, text, text, uuid) to authenticated;

-- ---------- 10. 屆別與職位 ----------
-- 補過去的一屆（status 固定 ended）。現在這一屆由遷移檔建、之後由 end_term() 建，不從這裡建。
create or replace function public.create_term(p_id text, p_title_zh text, p_title_en text, p_starts date, p_ends date)
returns text language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  perform public.require_senior();
  if coalesce(p_id, '') !~ '^[0-9]{4}-[0-9]{2}$' then
    raise exception 'bad_term_id' using errcode = 'P0001';
  end if;
  if p_starts is null or p_ends is null or p_ends <= p_starts then
    raise exception 'bad_dates' using errcode = 'P0001';
  end if;
  insert into terms (id, title_zh, title_en, starts_on, ends_on, status)
  values (p_id, nullif(btrim(p_title_zh), ''), nullif(btrim(p_title_en), ''), p_starts, p_ends, 'ended')
  on conflict (id) do update set title_zh = excluded.title_zh, title_en = excluded.title_en,
    starts_on = excluded.starts_on, ends_on = excluded.ends_on;
  return p_id;
end $$;
revoke all on function public.create_term(text, text, text, date, date) from public, anon;
grant execute on function public.create_term(text, text, text, date, date) to authenticated;

-- 名單上加一筆沒有帳號的人（平台之前的幹部）。
create or replace function public.add_person(p_name_zh text, p_name_en text, p_note text)
returns uuid language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_id uuid;
begin
  perform public.require_senior();
  if coalesce(btrim(p_name_zh), '') = '' and coalesce(btrim(p_name_en), '') = '' then
    raise exception 'empty_name' using errcode = 'P0001';
  end if;
  insert into people (name_zh, name_en, note)
  values (nullif(btrim(p_name_zh), ''), nullif(btrim(p_name_en), ''), nullif(btrim(p_note), ''))
  returning id into v_id;
  perform public.log_change(null, public.person_name(v_id), 'name', null, v_id::text);
  return v_id;
end $$;
revoke all on function public.add_person(text, text, text) from public, anon;
grant execute on function public.add_person(text, text, text) to authenticated;

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
    from positions where person_id = p_person and term_id = p_term;
  insert into positions (person_id, term_id, title_zh, title_en, team)
  values (p_person, p_term, nullif(btrim(p_title_zh), ''), nullif(btrim(p_title_en), ''), nullif(btrim(p_team), ''))
  on conflict (person_id, term_id) do update
    set title_zh = excluded.title_zh, title_en = excluded.title_en, team = excluded.team
  returning id into v_id;
  perform public.log_change((select profile_id from people where id = p_person), public.person_name(p_person),
    'position', v_old, p_term || ':' || coalesce(nullif(btrim(p_title_en), ''), btrim(p_title_zh)) || '/' || coalesce(btrim(p_team), ''));
  return v_id;
end $$;
revoke all on function public.set_position(uuid, text, text, text, text) from public, anon;
grant execute on function public.set_position(uuid, text, text, text, text) to authenticated;

create or replace function public.delete_position(p_person uuid, p_term text)
returns boolean language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_old text;
begin
  perform public.require_senior();
  delete from positions where person_id = p_person and term_id = p_term
    returning coalesce(title_en, title_zh) || '/' || coalesce(team, '') into v_old;
  if not found then return false; end if;
  perform public.log_change((select profile_id from people where id = p_person), public.person_name(p_person),
    'position', p_term || ':' || v_old, null);
  return true;
end $$;
revoke all on function public.delete_position(uuid, text) from public, anon;
grant execute on function public.delete_position(uuid, text) to authenticated;

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
    on conflict (person_id, term_id) do update
      set title_zh = excluded.title_zh, title_en = excluded.title_en, team = excluded.team;
    n := n + 1;
  end loop;
  perform public.log_change(null, null, 'term', null, p_term || ':imported:' || n);
  return n;
end $$;
revoke all on function public.import_positions(text, jsonb) from public, anon;
grant execute on function public.import_positions(text, jsonb) to authenticated;

-- ---------- 11. 人的管理（只有 Co-President）----------
create or replace function public.rename_person(p_person uuid, p_name_zh text, p_name_en text)
returns uuid language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_profile uuid; v_old text;
begin
  perform public.require_president();
  if coalesce(btrim(p_name_zh), '') = '' and coalesce(btrim(p_name_en), '') = '' then
    raise exception 'empty_name' using errcode = 'P0001';
  end if;
  select profile_id into v_profile from people where id = p_person;
  if not found then
    raise exception 'no_such_person' using errcode = 'P0001';
  end if;
  v_old := public.person_name(p_person);
  update people set name_zh = nullif(btrim(p_name_zh), ''), name_en = nullif(btrim(p_name_en), '') where id = p_person;
  if v_profile is not null then
    update profiles set name_zh = nullif(btrim(p_name_zh), ''), name_en = nullif(btrim(p_name_en), '') where id = v_profile;
  end if;
  perform public.log_change(v_profile, v_old, 'name', v_old,
    coalesce(nullif(btrim(p_name_zh), ''), '') || '/' || coalesce(nullif(btrim(p_name_en), ''), ''));
  return p_person;
end $$;
revoke all on function public.rename_person(uuid, text, text) from public, anon;
grant execute on function public.rename_person(uuid, text, text) to authenticated;

-- 從平台移除：刪登入帳號，外鍵把 profiles、護照、章、心得、時間看板、故事、指派一起帶走。
-- 名單上那一筆留著（profile_id 變 null，標成「沒有帳號」），歷屆人數還算得到他。
-- **先記帳再刪**：刪完人就不在 profiles 裡了。不能刪自己：最後一位 Co-President 刪掉自己就回到只能下 SQL。
-- 沒有參數能指定「用誰的身分」：跟 delete_my_account() 同一個理由。
create or replace function public.remove_member(p_person uuid)
returns boolean language plpgsql security definer
set search_path = public, auth, pg_temp
as $$
declare v_profile uuid; v_name text; v_role text;
begin
  perform public.require_president();
  select profile_id into v_profile from people where id = p_person;
  if not found then
    raise exception 'no_such_person' using errcode = 'P0001';
  end if;
  if v_profile is null then
    raise exception 'no_account' using errcode = 'P0001';
  end if;
  if v_profile = auth.uid() then
    raise exception 'cannot_remove_self' using errcode = 'P0001';
  end if;
  select role into v_role from public.profiles where id = v_profile;
  v_name := public.person_name(p_person);
  perform public.log_change(null, v_name, 'removed', v_role, p_person::text);
  delete from auth.users where id = v_profile;
  return true;
end $$;
revoke all on function public.remove_member(uuid) from public, anon;
grant execute on function public.remove_member(uuid) to authenticated;

-- 連名單上那一筆也刪（只限沒有帳號的）。綁著還沒用的碼的那一筆要先停用那組碼。
create or replace function public.delete_person(p_person uuid)
returns boolean language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_name text;
begin
  perform public.require_president();
  if exists (select 1 from people where id = p_person and profile_id is not null) then
    raise exception 'has_account' using errcode = 'P0001';
  end if;
  if exists (select 1 from invite_codes where person_id = p_person and uses_left > 0) then
    raise exception 'has_unused_invite' using errcode = 'P0001';
  end if;
  v_name := public.person_name(p_person);
  delete from people where id = p_person;
  if not found then
    raise exception 'no_such_person' using errcode = 'P0001';
  end if;
  perform public.log_change(null, v_name, 'removed', 'record', p_person::text);
  return true;
end $$;
revoke all on function public.delete_person(uuid) from public, anon;
grant execute on function public.delete_person(uuid) to authenticated;

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
  on conflict (person_id, term_id) do nothing;
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

-- 綁著名單紀錄的校友碼：一律 alumni、一律只能用一次（轉手的風險，見設計文件第二輪第 4 件）。
create or replace function public.create_invite_for(p_person uuid, p_code text, p_note text)
returns text language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_code text := btrim(coalesce(p_code, ''));
begin
  perform public.require_president();
  if not exists (select 1 from people where id = p_person and profile_id is null) then
    raise exception 'person_has_account' using errcode = 'P0001';
  end if;
  if exists (select 1 from invite_codes where person_id = p_person and uses_left > 0) then
    raise exception 'has_unused_invite' using errcode = 'P0001';
  end if;
  if v_code !~ '^[A-Za-z0-9-]{2,64}$' then
    raise exception 'bad_invite_code' using errcode = 'P0001';
  end if;
  if exists (select 1 from invite_codes where upper(btrim(code)) = upper(v_code)) then
    raise exception 'invite_exists:%', v_code using errcode = 'P0001';
  end if;
  insert into invite_codes (code, uses_left, grants, note, person_id)
  values (v_code, 1, 'alumni', nullif(btrim(coalesce(p_note, '')), ''), p_person);
  return v_code;
end $$;
revoke all on function public.create_invite_for(uuid, text, text) from public, anon;
grant execute on function public.create_invite_for(uuid, text, text) to authenticated;

-- claim_invite()：2026-10-16 那一版加兩段（認領綁著的紀錄；變成幹部或校友就進名單）。
create or replace function public.claim_invite(p_code text)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid    uuid := auth.uid();
  v_role   text;
  v_grants text;
  v_code   text;
  v_person uuid;
  v_claimed boolean := false;
begin
  if v_uid is null then
    raise exception 'not_signed_in' using errcode = 'P0001';
  end if;
  -- for update 是防「同一個人連點兩下」的鎖。**不要拿掉。**
  select role into v_role from profiles where id = v_uid for update;
  if v_role is null then
    raise exception 'no_profile' using errcode = 'P0001';
  end if;
  if v_role = 'cadre' then
    return 'already_cadre';
  end if;
  update invite_codes set uses_left = uses_left - 1
   where upper(btrim(code)) = upper(btrim(p_code)) and uses_left > 0
   returning grants, code, person_id into v_grants, v_code, v_person;
  if not found then
    raise exception 'invalid_invite' using errcode = 'P0001';
  end if;
  -- 綁著名單紀錄的碼：那一筆還沒有人認走，就歸到這個帳號。
  -- 這一段放在「已經是校友」的判斷之前：用一般校友碼進來過的老校友，拿到綁紀錄的碼也要認得了。
  if v_person is not null then
    update people set profile_id = v_uid where id = v_person and profile_id is null;
    if not found then
      -- raise 會把上面扣掉的那一次一起回滾，碼不會被燒掉。
      raise exception 'record_claimed' using errcode = 'P0001';
    end if;
    -- 這個帳號原本自己的那一筆（例如用一般校友碼進來時建的）併進認領的那一筆。
    insert into positions (person_id, term_id, title_zh, title_en, team)
    select v_person, term_id, title_zh, title_en, team from positions
     where person_id in (select id from people where profile_id = v_uid and id <> v_person)
    on conflict (person_id, term_id) do nothing;
    delete from people where profile_id = v_uid and id <> v_person;
    perform public.log_change(v_uid, public.person_name(v_person), 'claimed', null, v_person::text);
    v_claimed := true;
  end if;
  if v_role = v_grants then
    if v_claimed then
      insert into invite_uses (code, user_id, grants) values (v_code, v_uid, v_grants);
      return 'claimed_record';
    end if;
    update invite_codes set uses_left = uses_left + 1 where code = v_code;
    return 'already_' || v_role;
  end if;
  update profiles set role = v_grants where id = v_uid;
  if v_grants = 'cadre' then
    insert into passports (id) values (v_uid) on conflict (id) do nothing;
  end if;
  if v_grants = 'intern' and to_regclass('public.intern_passports') is not null then
    insert into intern_passports (id, term)
    values (v_uid, (select id from intern_terms where active order by starts_on desc limit 1))
    on conflict (id) do nothing;
  end if;
  -- 幹部與校友進名單；學員與實習生不進。
  if v_grants in ('cadre', 'alumni') and not exists (select 1 from people where profile_id = v_uid) then
    insert into people (name_zh, name_en, profile_id)
    select name_zh, name_en, id from profiles where id = v_uid;
  end if;
  insert into invite_uses (code, user_id, grants) values (v_code, v_uid, v_grants);
  return case v_grants when 'alumni' then 'upgraded_alumni'
                       when 'intern' then 'upgraded_intern'
                       else 'upgraded' end;
end $$;
revoke execute on function public.claim_invite(text) from public, anon;
grant  execute on function public.claim_invite(text) to authenticated;

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
      on conflict (person_id, term_id) do nothing;
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

-- ---------- 13. 讀取：給後台與對外頁 ----------
-- 我是誰、能進哪裡。側欄用這個藏分頁；真正的門還是每一支函式與 RLS。
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
    ), '[]'::jsonb))
    from profiles p where p.id = auth.uid();
$$;
revoke all on function public.my_access() from public, anon;
grant execute on function public.my_access() to authenticated;

-- 幹部名單（含沒有帳號的人與歷屆）。只有 Co-President 與 Senior Adviser 拿得到列。
create or replace function public.roster()
returns table (
  person_id uuid, profile_id uuid, name_zh text, name_en text, role text, board_role text, team text,
  positions jsonb, workspaces jsonb, note text, pending_code text, maybe_dup uuid[]
) language sql stable security definer
set search_path = public, pg_temp
as $$
  select pe.id, pe.profile_id,
         coalesce(pr.name_zh, pe.name_zh), coalesce(pr.name_en, pe.name_en),
         pr.role, pr.board_role, pr.team,
         coalesce((select jsonb_agg(jsonb_build_object('term', po.term_id, 'title_zh', po.title_zh, 'title_en', po.title_en, 'team', po.team)
                                    order by t.starts_on desc)
                     from positions po join terms t on t.id = po.term_id where po.person_id = pe.id), '[]'::jsonb),
         coalesce((select jsonb_agg(jsonb_build_object('id', a.workspace_id, 'level', a.level) order by a.workspace_id)
                     from assignments a where a.user_id = pe.profile_id), '[]'::jsonb),
         pe.note,
         (select c.code from invite_codes c where c.person_id = pe.id and c.uses_left > 0 limit 1),
         (select array_agg(o.id) from people o
           where o.id <> pe.id and pe.name_en is not null and lower(o.name_en) = lower(pe.name_en))
    from people pe left join profiles pr on pr.id = pe.profile_id
   where public.is_senior()
   order by (pr.role = 'cadre') desc nulls last, pr.board_role, coalesce(pr.name_en, pe.name_en);
$$;
revoke all on function public.roster() from public, anon;
grant execute on function public.roster() to authenticated;

-- 一個工作區裡有誰。對它是「管」的人才拿得到。
create or replace function public.workspace_members(p_ws text)
returns table (user_id uuid, name_zh text, name_en text, board_role text, level text, granted_by uuid, created_at timestamptz)
language sql stable security definer
set search_path = public, pg_temp
as $$
  select a.user_id, p.name_zh, p.name_en, p.board_role, a.level, a.granted_by, a.created_at
    from assignments a join profiles p on p.id = a.user_id
   where a.workspace_id = p_ws and public.can_manage(p_ws)
   order by a.level desc, p.name_en;
$$;
revoke all on function public.workspace_members(text) from public, anon;
grant execute on function public.workspace_members(text) to authenticated;

-- 對外團隊頁：兩把鑰匙都轉、而且在 current 那一屆有職位的幹部。頭銜從職位算，不再讀 public_title。
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
   order by p.name_en;
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
         (select coalesce(po.title_en, po.title_zh) || ' · ' || po.term_id
            from people pe join positions po on po.person_id = pe.id join terms t on t.id = po.term_id
           where pe.profile_id = p.id order by t.starts_on desc limit 1)
    from public.alumni_stories s
    join public.profiles p on p.id = s.id
   where s.public_story and s.story_approved
     and p.role in ('cadre', 'alumni')
     and s.county is not null
   order by s.approved_at nulls last, s.updated_at;
$$;
revoke all on function public.public_alumni() from public;
grant execute on function public.public_alumni() to anon, authenticated;

-- ---------- 14. 把今天的資料搬過去（零遺失；重跑不會重複）----------
do $$
declare
  v_pres uuid;
  r record; t text; v_person uuid; v_owner uuid; v_title text; v_level text; v_has_pt boolean;
  teams text[] := array['Curriculum Team', 'Mentorship Team', 'Marketing Team',
                        'Sponsorship Team', 'Internship Team', 'Community Relations Team'];
begin
  select id into v_pres from profiles where role = 'cadre' and board_role = 'president' order by updated_at limit 1;

  -- 這一屆。Paul 2026-10-23 確認：2026-08-01 到 2027-07-31。
  if not exists (select 1 from terms where status = 'current') then
    insert into terms (id, title_zh, title_en, starts_on, ends_on, status)
    values ('2026-27', '2026-27 屆', 'TERM 2026-27', '2026-08-01', '2027-07-31', 'current')
    on conflict (id) do update set status = 'current';
  end if;

  -- 兩本護照。
  insert into workspaces (id, kind, title_zh, title_en, owner) values
    ('passport', 'passport', '幹部護照', 'Cadre passport', v_pres),
    ('intern-passport', 'intern-passport', '實習護照', 'Intern passport',
      (select id from profiles where role = 'cadre' and board_role = 'director'
         and position('Internship Team' in coalesce(team, '')) > 0 order by updated_at limit 1))
  on conflict (id) do nothing;
  update workspaces set owner = v_pres where id = 'intern-passport' and owner is null;

  -- 六個 team，加上今天資料裡真的出現過的 team 字串（正式站跟表單上的寫法可能不一樣）。
  for t in
    select distinct x from (
      select unnest(teams) as x
      union select btrim(u) from profiles, unnest(string_to_array(team, ',')) u where role = 'cadre' and team is not null
      union select team from forms where team is not null
      union select team from resources where team is not null
    ) s where x <> ''
  loop
    select id into v_owner from profiles
     where role = 'cadre' and board_role = 'director'
       and t = any (array(select btrim(u) from unnest(string_to_array(coalesce(team, ''), ',')) u))
     order by updated_at limit 1;
    insert into workspaces (id, kind, team, title_zh, title_en, owner) values
      ('apps:' || t, 'apps', t, t || ' 的申請', t || ' applications', coalesce(v_owner, v_pres)),
      ('res:'  || t, 'res',  t, t || ' 的資源', t || ' resources',    coalesce(v_owner, v_pres))
    on conflict (id) do nothing;
  end loop;

  -- public_title 這一欄 2026-10-25 那支會 drop。這裡用動態 SQL 讀它，欄位不在就當成空的，
  -- 所以這一支在 10-25 之後還是跑得過（重跑舊遷移檔之後要再跑它，見檔頭）。
  v_has_pt := exists (select 1 from information_schema.columns
                       where table_schema = 'public' and table_name = 'profiles' and column_name = 'public_title');
  for r in select id, name_zh, name_en, team, board_role from profiles where role = 'cadre' loop
    -- 一列 people
    select id into v_person from people where profile_id = r.id;
    if v_person is null then
      insert into people (name_zh, name_en, profile_id) values (r.name_zh, r.name_en, r.id) returning id into v_person;
    end if;
    -- 這一屆的職位：public_title 原封不動；沒填的從職級加 team 算。
    v_title := null;
    if v_has_pt then
      execute 'select nullif(btrim(coalesce(public_title, '''')), '''') from public.profiles where id = $1' into v_title using r.id;
    end if;
    if v_title is null then
      v_title := case r.board_role when 'president' then 'Co-President'
                                   when 'senior_adviser' then 'Senior Adviser'
                                   when 'director' then 'Director' else 'Associate' end
               || case when nullif(btrim(split_part(coalesce(r.team, ''), ',', 1)), '') is not null
                       and r.board_role <> 'president'
                       then ', ' || btrim(split_part(r.team, ',', 1)) else '' end;
    end if;
    insert into positions (person_id, term_id, title_zh, title_en, team)
    values (v_person, (select id from terms where status = 'current'), v_title, v_title,
            nullif(btrim(split_part(coalesce(r.team, ''), ',', 1)), ''))
    on conflict (person_id, term_id) do nothing;
    -- 指派：Co-President 與 Senior Adviser 不派（職級本身就是全部）。
    if r.board_role in ('president', 'senior_adviser') then continue; end if;
    for t in select btrim(x) from unnest(string_to_array(coalesce(r.team, ''), ',')) x where btrim(x) <> '' loop
      if r.board_role = 'director' then
        insert into assignments (user_id, workspace_id, level) values (r.id, 'apps:' || t, 'manage'), (r.id, 'res:' || t, 'manage')
        on conflict do nothing;
      else
        insert into assignments (user_id, workspace_id, level) values (r.id, 'apps:' || t, 'view')
        on conflict do nothing;
      end if;
      if t = 'Internship Team' then
        v_level := case when r.board_role = 'director' then 'manage' else 'edit' end;
        insert into assignments (user_id, workspace_id, level) values (r.id, 'intern-passport', v_level)
        on conflict do nothing;
      end if;
    end loop;
    if not exists (select 1 from role_changes where target = r.id and field = 'assignment' and old_value = 'migrated')
       and exists (select 1 from assignments where user_id = r.id) then
      insert into role_changes (changed_by, target, target_name, field, old_value, new_value)
      values (null, r.id, coalesce(r.name_zh, r.name_en), 'assignment', 'migrated',
              (select string_agg(level || '@' || workspace_id, ', ' order by workspace_id) from assignments where user_id = r.id));
    end if;
  end loop;
end $$;

commit;

-- 驗收表第 15 項（public_title 逐字搬進職位）要讀 public_title，而那一欄 10-25 之後不在了，
-- 靜態 SQL 會直接報錯。所以先用動態 SQL 算好放進暫存表，欄位不在就算 0（沒有東西可以對不上）。
do $$
declare n int := 0;
begin
  create temp table if not exists bt_title_check (n int);
  delete from bt_title_check;
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'profiles' and column_name = 'public_title') then
    execute $q$
      select count(*) from public.profiles pr join public.people pe on pe.profile_id = pr.id
        join public.positions po on po.person_id = pe.id join public.terms t on t.id = po.term_id and t.status = 'current'
       where pr.role = 'cadre' and nullif(btrim(coalesce(pr.public_title, '')), '') is not null
         and po.title_en is distinct from btrim(pr.public_title)
    $q$ into n;
  end if;
  insert into bt_title_check values (n);
end $$;

-- ============================================================================
-- 驗收：查 prosrc 的幾條先剝掉 SQL 註解再比對（理由見 2026-09-01-claim-invite.sql）。
-- 權限那幾條直接查系統目錄（pg_proc.proacl），不用 information_schema。
-- 最後幾條是**資料對照**：搬過去的人、職位、指派要對得上今天的 profiles。
-- ============================================================================
select * from (
  with fn as (
    select proname, prosecdef, proconfig, proacl,
           regexp_replace(prosrc, '--[^\n]*', '', 'g') as body
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'
  ), tbls as (
    select count(*) as n from pg_tables where schemaname = 'public'
       and tablename in ('terms', 'people', 'positions', 'workspaces', 'assignments')
  ), pres_gated as (
    select count(*) as n from fn
     where proname in ('rename_person', 'remove_member', 'delete_person', 'merge_people', 'create_invite_for', 'end_term', 'set_board_role')
       and body like '%perform public.require_president();%'
  ), senior_gated as (
    select count(*) as n from fn
     where proname in ('set_public_approved', 'set_story_approved', 'set_mail_template', 'set_team',
                       'create_workspace', 'create_term', 'add_person', 'set_position', 'delete_position', 'import_positions')
       and body like '%perform public.require_senior();%'
  ), ws_gated as (
    select count(*) as n from fn
     where proname in ('save_activity', 'set_activity_active', 'delete_activity', 'save_month_theme', 'save_destination')
       and body like '%require_ws_edit(''passport'')%'
  ), anon_can as (
    select count(*) as n from fn f, aclexplode(f.proacl) x
     where f.proname in ('can_view', 'can_edit', 'can_manage', 'is_senior', 'public_team')
       and x.grantee = 'anon'::regrole and x.privilege_type = 'EXECUTE'
  ), anon_bad as (
    select count(*) as n from fn f, aclexplode(f.proacl) x
     where f.proname in ('assign', 'unassign', 'rename_person', 'remove_member', 'delete_person', 'merge_people',
                         'create_invite_for', 'end_term', 'my_access', 'roster', 'workspace_members', 'import_positions')
       and x.grantee in (0::regrole, 'anon'::regrole) and x.privilege_type = 'EXECUTE'
  ), tbl_w as (
    select count(*) as n from information_schema.role_table_grants
     where table_schema = 'public' and table_name in ('terms', 'people', 'positions', 'workspaces', 'assignments')
       and grantee in ('anon', 'authenticated') and privilege_type in ('INSERT', 'UPDATE', 'DELETE')
  ), trg as (
    select count(*) as n from pg_trigger t join pg_class c on c.oid = t.tgrelid
     where c.relname = 'profiles' and t.tgname = 'guard_profile_team' and not t.tgisinternal
  ), res_pol as (
    select count(*) as n from pg_policies where schemaname = 'public' and tablename = 'resources'
       and (qual like '%res:%' or with_check like '%res:%')
  ), cadres as (
    select count(*) as n from public.profiles where role = 'cadre'
  ), ppl as (
    select count(*) as n from public.people pe join public.profiles pr on pr.id = pe.profile_id where pr.role = 'cadre'
  ), pos as (
    select count(*) as n from public.positions po join public.terms t on t.id = po.term_id and t.status = 'current'
      join public.people pe on pe.id = po.person_id join public.profiles pr on pr.id = pe.profile_id where pr.role = 'cadre'
  ), title_ok as (
    -- 由上面那個 DO 區塊用動態 SQL 算好放在暫存表裡（public_title 被 10-25 drop 之後這裡不能直接寫那一欄）。
    select n from pg_temp.bt_title_check
  ), dir_ok as (
    -- 每一位 director 對他 team 字串裡的每一個 team 都 can_edit（用指派表直接對，不靠 auth.uid()）
    select count(*) as n from public.profiles pr, unnest(string_to_array(coalesce(pr.team, ''), ',')) x
     where pr.role = 'cadre' and pr.board_role = 'director' and btrim(x) <> ''
       and not exists (select 1 from public.assignments a where a.user_id = pr.id and a.workspace_id = 'apps:' || btrim(x) and a.level = 'manage')
  ), mem_bad as (
    -- 一般幹部除了 intern-passport 之外沒有任何「改」
    select count(*) as n from public.assignments a join public.profiles pr on pr.id = a.user_id
     where pr.board_role = 'member' and a.level <> 'view' and a.workspace_id <> 'intern-passport'
  ), mem_view as (
    select count(*) as n from public.profiles pr, unnest(string_to_array(coalesce(pr.team, ''), ',')) x
     where pr.role = 'cadre' and pr.board_role = 'member' and btrim(x) <> ''
       and not exists (select 1 from public.assignments a where a.user_id = pr.id and a.workspace_id = 'apps:' || btrim(x))
  ), cur as (
    select count(*) as n from public.terms where status = 'current'
  ), grew as (
    -- 資訊列：一個人在兩個 team 的 director，昨天 is_director_of 整串相等所以什麼都管不到，今天兩個都管得到
    select string_agg(coalesce(name_zh, name_en), '、') as who from public.profiles
     where role = 'cadre' and board_role = 'director' and position(',' in coalesce(team, '')) > 0
  )
  select 0 ord, 'OVERALL' as 項目, null::text as 應該是, null::text as 實際是,
    case when (select n from tbls) = 5 and (select n from pres_gated) = 7 and (select n from senior_gated) = 10
      and (select n from ws_gated) = 5 and (select n from anon_can) = 5 and (select n from anon_bad) = 0
      and (select n from tbl_w) = 0 and (select n from trg) = 0 and (select n from res_pol) = 4
      and (select body from fn where proname = 'is_director_of') like '%can_edit(''apps:''%'
      and (select body from fn where proname = 'is_on_team') like '%can_view(''apps:''%'
      and (select body from fn where proname = 'is_internship_team') like '%can_view(''intern-passport'')%'
      and (select body from fn where proname = 'require_internship_team') like '%can_edit(''intern-passport'')%'
      and (select body from fn where proname = 'claim_invite') like '%record_claimed%'
      and (select body from fn where proname = 'set_board_role') like '%senior_adviser%'
      and (select body from fn where proname = 'end_term') like '%must_keep_self%'
      and (select body from fn where proname = 'remove_member') like '%cannot_remove_self%'
      and (select body from fn where proname = 'assign') like '%not_a_cadre%'
      and (select n from ppl) = (select n from cadres) and (select n from pos) = (select n from cadres)
      and (select n from title_ok) = 0 and (select n from dir_ok) = 0 and (select n from mem_bad) = 0
      and (select n from mem_view) = 0 and (select n from cur) = 1
    then 'PASS' else 'FAIL' end as 結果
  union all select 1, '五張新表都在', '5', (select n from tbls)::text, case when (select n from tbls) = 5 then 'PASS' else 'FAIL' end
  union all select 2, '★ 人的管理七支第一句都是 Co-President 的門', '7', (select n from pres_gated)::text, case when (select n from pres_gated) = 7 then 'PASS' else 'FAIL' end
  union all select 3, '★ Senior Adviser 也能的十支第一句都是 require_senior', '10', (select n from senior_gated)::text, case when (select n from senior_gated) = 10 then 'PASS' else 'FAIL' end
  union all select 4, '★ 幹部護照五支的門換成 passport 工作區', '5', (select n from ws_gated)::text, case when (select n from ws_gated) = 5 then 'PASS' else 'FAIL' end
  union all select 5, '判斷函式對沒登入的人也叫得動（policy 要評估）', '5', (select n from anon_can)::text, case when (select n from anon_can) = 5 then 'PASS' else 'FAIL' end
  union all select 6, '★ 寫入與名單那幾支沒登入叫不動', '0', (select n from anon_bad)::text, case when (select n from anon_bad) = 0 then 'PASS' else 'FAIL' end
  union all select 7, '★ 五張新表對前端沒有寫入權限', '0', (select n from tbl_w)::text, case when (select n from tbl_w) = 0 then 'PASS' else 'FAIL' end
  union all select 8, '★ team 的 trigger 拆掉了（team 只是標籤）', '0', (select n from trg)::text, case when (select n from trg) = 0 then 'PASS' else 'FAIL' end
  union all select 9, 'resources 四條 policy 改看 res: 工作區', '4', (select n from res_pol)::text, case when (select n from res_pol) = 4 then 'PASS' else 'FAIL' end
  union all select 10, '★ is_director_of / is_on_team / is_internship_team 改查指派', 'true',
    ((select body from fn where proname = 'is_director_of') like '%can_edit(''apps:''%'
     and (select body from fn where proname = 'is_on_team') like '%can_view(''apps:''%'
     and (select body from fn where proname = 'is_internship_team') like '%can_view(''intern-passport'')%'
     and (select body from fn where proname = 'require_internship_team') like '%can_edit(''intern-passport'')%')::text,
    case when (select body from fn where proname = 'is_director_of') like '%can_edit(''apps:''%'
     and (select body from fn where proname = 'is_on_team') like '%can_view(''apps:''%'
     and (select body from fn where proname = 'is_internship_team') like '%can_view(''intern-passport'')%'
     and (select body from fn where proname = 'require_internship_team') like '%can_edit(''intern-passport'')%' then 'PASS' else 'FAIL' end
  union all select 11, 'claim_invite 認得綁紀錄的碼；set_board_role 認得 senior_adviser', 'true',
    ((select body from fn where proname = 'claim_invite') like '%record_claimed%' and (select body from fn where proname = 'set_board_role') like '%senior_adviser%')::text,
    case when (select body from fn where proname = 'claim_invite') like '%record_claimed%' and (select body from fn where proname = 'set_board_role') like '%senior_adviser%' then 'PASS' else 'FAIL' end
  union all select 12, '★ end_term 擋不留自己、remove_member 擋刪自己、assign 只派幹部', 'true',
    ((select body from fn where proname = 'end_term') like '%must_keep_self%' and (select body from fn where proname = 'remove_member') like '%cannot_remove_self%' and (select body from fn where proname = 'assign') like '%not_a_cadre%')::text,
    case when (select body from fn where proname = 'end_term') like '%must_keep_self%' and (select body from fn where proname = 'remove_member') like '%cannot_remove_self%' and (select body from fn where proname = 'assign') like '%not_a_cadre%' then 'PASS' else 'FAIL' end
  union all select 13, '★ 每一位幹部都有一列 people（資料對照）', (select n from cadres)::text, (select n from ppl)::text, case when (select n from ppl) = (select n from cadres) then 'PASS' else 'FAIL' end
  union all select 14, '★ 每一位幹部這一屆都有一筆職位', (select n from cadres)::text, (select n from pos)::text, case when (select n from pos) = (select n from cadres) then 'PASS' else 'FAIL' end
  union all select 15, '★ public_title 有填的人，職位名稱逐字相等（對不上的筆數）', '0', (select n from title_ok)::text, case when (select n from title_ok) = 0 then 'PASS' else 'FAIL' end
  union all select 16, '★ 每一位 Director 對他每一個 team 的申請都是「管」（少的筆數）', '0', (select n from dir_ok)::text, case when (select n from dir_ok) = 0 then 'PASS' else 'FAIL' end
  union all select 17, '★ 一般幹部除了實習護照沒有任何「改」（多的筆數）', '0', (select n from mem_bad)::text, case when (select n from mem_bad) = 0 then 'PASS' else 'FAIL' end
  union all select 18, '★ 一般幹部對他每一個 team 的申請都是「看」（少的筆數）', '0', (select n from mem_view)::text, case when (select n from mem_view) = 0 then 'PASS' else 'FAIL' end
  union all select 19, '剛好一屆是 current', '1', (select n from cur)::text, case when (select n from cur) = 1 then 'PASS' else 'FAIL' end
  union all select 20, '（資訊）權限比昨天多的人：在兩個 team 的 Director', '（看一眼）', coalesce((select who from grew), '（沒有）'), 'PASS'
) t order by ord;
