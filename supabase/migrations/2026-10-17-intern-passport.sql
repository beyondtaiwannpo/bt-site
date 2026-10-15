-- 實習護照的四張表　2026-10-17
--
-- 用法：整份貼進 Supabase SQL Editor 按一次 Run。最後印出 PASS / FAIL 表。
-- **要先跑過 2026-10-16-intern-role.sql**（is_intern() 與 intern 身分都在那一支）。
--
-- ============================================================================
-- 這一支在做什麼
-- ============================================================================
-- 方案 C（docs/2026-10-15-實習生護照盤點與設計.md）：實習生有自己的一本護照，
-- 跟幹部護照**完全分開的表**，前端在 /intern-passport/。
--   intern_terms      哪一屆。每年一批，一年一本。Internship team 開新的一屆時加一列。
--   intern_tasks      這一屆的格子（任務），對應幹部護照的 activities。
--   intern_passports  一人一本，對應 passports。由 claim_invite() 建，前端只 update。
--   intern_stamps     章。Internship team 的幹部與 intern 看得到彼此的（進度牆）。
--   intern_entries    心得與照片。**只有本人**，跟幹部護照同一條線。
--
-- 另外在 profiles 上**加一條**讀取政策：intern 與 Internship team 的幹部
-- 讀得到 intern 那幾列的名字與大頭照（進度牆要用）。只加不改：
-- 既有的 profiles_read 一個字都沒動，幹部那幾列對 intern 仍然關著。
--
-- ============================================================================
-- 誰看得到什麼（Paul 2026-10-15 拍板）
-- ============================================================================
--   intern 自己        自己的護照全部；其他 intern 的名字、大頭照、蓋了哪幾格
--   Internship team    每個 intern 的名字、大頭照、蓋了哪幾格（進度牆）。**看不到心得與照片。**
--   Co-President       跟 Internship team 一樣（is_internship_team() 把 president 算進去）
--   其他幹部、學員、校友  一列都讀不到
--
-- Internship team 的判斷用 profiles.team 那個欄位（含 'Internship Team' 就算）。
-- 一個人可以在好幾個 team（逗號字串，2026-09-10 起），所以用 position 不用等號。
--
-- ============================================================================
-- 這一支「不做」什麼
-- ============================================================================
--   不碰幹部護照的任何表與政策。不做入境章、里程碑、匯出匯入（第一版刻意簡單）。
--   不做「帶的人核可」：intern 自己蓋，跟幹部一樣（Paul 2026-10-15）。
begin;

-- ---------- 0. is_internship_team() ----------
-- 「我是不是 Internship team 的幹部，或當屆 Co-President」。
-- 跟 is_director_of() 同一個形狀。⚠ 要先問 role = 'cadre'：一個 team 欄位
-- 被誤填成 Internship Team 的學員不能因此看到 intern 的進度。
create or replace function public.is_internship_team()
returns boolean language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles
     where id = auth.uid() and role = 'cadre'
       and (board_role = 'president'
            or position('Internship Team' in coalesce(team, '')) > 0)
  );
$$;
revoke execute on function public.is_internship_team() from public;
grant  execute on function public.is_internship_team() to anon, authenticated;

-- ---------- 1. 哪一屆 ----------
create table if not exists public.intern_terms (
  id        text primary key,          -- '2026-27'，人看得懂又穩定
  title_zh  text not null,
  title_en  text not null,
  starts_on date not null,
  ends_on   date not null,
  active    boolean not null default false,
  check (ends_on > starts_on)
);
comment on table public.intern_terms is
  '實習的屆別。每年一批、一年一本。開新的一屆：加一列、把 active 勾起來、舊的那一列 active 拿掉。
   只能有一列 active（下面的唯一索引擋著）。舊的一屆不要刪，章與護照都掛在它底下。';
create unique index if not exists intern_terms_one_active on public.intern_terms (active) where active;

-- ---------- 2. 格子 ----------
create table if not exists public.intern_tasks (
  id          text primary key,        -- 'T2627-01'，不要改，章是靠它對到格子的
  term        text not null references public.intern_terms(id),
  seq         int  not null,
  category    text not null check (category in ('onboard', 'project', 'reflect')),
  title_zh    text not null,
  title_en    text not null,
  description text,
  active      boolean not null default true
);
comment on table public.intern_tasks is
  '實習護照的格子。Internship team 在 Table Editor 直接改，不用改程式。
   三種分類：onboard 入門（第一個月要做完的）、project 任務（實際的工作）、reflect 反思（寫給自己的）。
   前端一個分類一頁，格子數量不限。已經有人蓋過的格子請停用（active = false），不要刪。';
create index if not exists intern_tasks_term_idx on public.intern_tasks (term, seq);

-- ---------- 3. 一人一本 ----------
create table if not exists public.intern_passports (
  id         uuid primary key references public.profiles(id) on delete cascade,
  term       text references public.intern_terms(id),   -- null = 升級時還沒有開任何一屆
  motto      text,
  issued     date not null default current_date,
  updated_at timestamptz not null default now()
);
comment on table public.intern_passports is
  '一位 intern 一本。由 claim_invite() 在升級成 intern 時建，前端沒有 insert 權限。
   term 是他屬於哪一屆；升級當下沒有 active 的屆別就會是 null，前端會提示。';
drop trigger if exists intern_passports_touch on public.intern_passports;
create trigger intern_passports_touch before update on public.intern_passports
  for each row execute function public.touch_updated_at();

-- 這一支在 2026-10-16-intern-role.sql 之後跑：那一支跑的時候這張表還不在，
-- 已經升級的 intern（如果有）沒有拿到護照那一列。補上。
insert into public.intern_passports (id, term)
select p.id, (select id from public.intern_terms where active order by starts_on desc limit 1)
  from public.profiles p where p.role = 'intern'
on conflict (id) do nothing;

-- ---------- 4. 章與心得 ----------
-- 分兩張表的理由跟幹部護照一樣：章要給進度牆看，心得只有本人；
-- RLS 沒有「同一列這幾欄看得到那幾欄看不到」這種東西。
-- user_id 指向 profiles 不是 intern_passports：進度牆那句關聯查詢
-- （profiles → intern_stamps）靠的是這條外鍵。
create table if not exists public.intern_stamps (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  task_id    text not null references public.intern_tasks(id),
  stamped_on date not null,
  created_at timestamptz not null default now(),
  primary key (user_id, task_id)
);
create table if not exists public.intern_entries (
  user_id uuid not null references public.profiles(id) on delete cascade,
  task_id text not null references public.intern_tasks(id),
  note    text,
  photo   text,                        -- base64 jpeg，前端壓到 640px
  primary key (user_id, task_id)
);
comment on table public.intern_entries is
  '心得與照片。**只有本人讀得到**，Internship team 也不行。跟幹部護照的 entries 同一條線：
   願意誠實寫的前提是沒有別人看得到。';

-- ---------- 5. RLS ----------
alter table public.intern_terms     enable row level security;
alter table public.intern_tasks     enable row level security;
alter table public.intern_passports enable row level security;
alter table public.intern_stamps    enable row level security;
alter table public.intern_entries   enable row level security;

-- 參考資料：intern 與 Internship team 讀，沒有人從前端寫（後台改）。
drop policy if exists intern_terms_read on public.intern_terms;
create policy intern_terms_read on public.intern_terms
  for select to authenticated using (public.is_intern() or public.is_internship_team());
drop policy if exists intern_tasks_read on public.intern_tasks;
create policy intern_tasks_read on public.intern_tasks
  for select to authenticated using (public.is_intern() or public.is_internship_team());

-- 護照本身：本人與 Internship team 讀，本人改。沒有 insert 政策（claim_invite 建）。
drop policy if exists intern_passports_read on public.intern_passports;
create policy intern_passports_read on public.intern_passports
  for select to authenticated
  using ((auth.uid() = id and public.is_intern()) or public.is_internship_team());
drop policy if exists intern_passports_write on public.intern_passports;
create policy intern_passports_write on public.intern_passports
  for update to authenticated
  using (auth.uid() = id and public.is_intern()) with check (auth.uid() = id and public.is_intern());

-- 章：intern 彼此看得到，Internship team 看得到；寫只有本人。
drop policy if exists intern_stamps_read on public.intern_stamps;
create policy intern_stamps_read on public.intern_stamps
  for select to authenticated using (public.is_intern() or public.is_internship_team());
drop policy if exists intern_stamps_insert on public.intern_stamps;
create policy intern_stamps_insert on public.intern_stamps
  for insert to authenticated with check (auth.uid() = user_id and public.is_intern());
drop policy if exists intern_stamps_update on public.intern_stamps;
create policy intern_stamps_update on public.intern_stamps
  for update to authenticated
  using (auth.uid() = user_id and public.is_intern()) with check (auth.uid() = user_id and public.is_intern());
drop policy if exists intern_stamps_delete on public.intern_stamps;
create policy intern_stamps_delete on public.intern_stamps
  for delete to authenticated using (auth.uid() = user_id and public.is_intern());

-- 心得：四種操作全部限本人。**連 Internship team 也不行**，讀也一樣。
drop policy if exists intern_entries_read on public.intern_entries;
create policy intern_entries_read on public.intern_entries
  for select to authenticated using (auth.uid() = user_id and public.is_intern());
drop policy if exists intern_entries_insert on public.intern_entries;
create policy intern_entries_insert on public.intern_entries
  for insert to authenticated with check (auth.uid() = user_id and public.is_intern());
drop policy if exists intern_entries_update on public.intern_entries;
create policy intern_entries_update on public.intern_entries
  for update to authenticated
  using (auth.uid() = user_id and public.is_intern()) with check (auth.uid() = user_id and public.is_intern());
drop policy if exists intern_entries_delete on public.intern_entries;
create policy intern_entries_delete on public.intern_entries
  for delete to authenticated using (auth.uid() = user_id and public.is_intern());

-- 進度牆要讀得到其他 intern 的名字與大頭照。**只加一條，不動 profiles_read。**
-- 這條只開 role = 'intern' 的那幾列，而且只開給 intern 與 Internship team；
-- 幹部那幾列對 intern 仍然只有 profiles_read 管，而它不認 intern。
drop policy if exists profiles_read_interns on public.profiles;
create policy profiles_read_interns on public.profiles
  for select to authenticated
  using (profiles.role = 'intern' and (public.is_intern() or public.is_internship_team()));

-- ---------- 6. 權限（先全部收回，再一項一項發）----------
-- 理由見 schema.sql 權限段：Supabase 預設把 ALL 發給 anon 與 authenticated，
-- 而 ALL 裡有 RLS 管不到的 TRUNCATE。
revoke all on public.intern_terms, public.intern_tasks, public.intern_passports,
              public.intern_stamps, public.intern_entries from anon, authenticated;
grant select on public.intern_terms, public.intern_tasks to authenticated;
grant select, update (motto) on public.intern_passports to authenticated;
grant select, insert, update, delete on public.intern_stamps, public.intern_entries to authenticated;

-- ---------- 7. 第一屆與範例格子 ----------
-- 文案是暫定的，Internship team 到 Table Editor 改 title_zh / title_en / description。
-- 重跑這一支會把它們蓋回這裡的值（on conflict do update），所以**改過文案之後不要重跑這一段**，
-- 要重跑就先把這一段刪掉。屆別那一列只在不存在時建，不會把 active 改回來。
insert into public.intern_terms (id, title_zh, title_en, starts_on, ends_on, active)
values ('2026-27', '2026-27 實習', 'INTERNSHIP 2026-27', '2026-09-01', '2027-07-31', true)
on conflict (id) do nothing;

insert into public.intern_tasks (id, term, seq, category, title_zh, title_en, description) values
  ('T2627-01', '2026-27', 1, 'onboard', '認識 BT',        'MEET BT',        '看完 BT 的介紹與去年的成果，寫下一句你最有感覺的事'),
  ('T2627-02', '2026-27', 2, 'onboard', '第一次會議',     'FIRST MEETING',  '參加第一次 Internship team 的會議'),
  ('T2627-03', '2026-27', 3, 'onboard', '認識帶你的人',   'YOUR MENTOR',    '跟帶你的幹部聊過一次，知道這一期你要做什麼'),
  ('T2627-04', '2026-27', 4, 'project', '第一個任務',     'FIRST TASK',     '交出你的第一個任務'),
  ('T2627-05', '2026-27', 5, 'project', '期中成果',       'MIDTERM',        '期中跟 team 分享你做到哪裡'),
  ('T2627-06', '2026-27', 6, 'project', '期末成果',       'FINAL',          '期末成果交出去'),
  ('T2627-07', '2026-27', 7, 'reflect', '我為什麼來',     'WHY I CAME',     '三句話，寫下你當初為什麼申請'),
  ('T2627-08', '2026-27', 8, 'reflect', '卡住的一次',     'WHERE I STUCK',  '這一期最卡的一次，後來怎麼過的'),
  ('T2627-09', '2026-27', 9, 'reflect', '帶走的一件事',   'ONE THING',      '離開之前，你帶走的一件事')
on conflict (id) do update set
  term = excluded.term, seq = excluded.seq, category = excluded.category,
  title_zh = excluded.title_zh, title_en = excluded.title_en, description = excluded.description;

commit;

-- ============================================================================
-- 驗收。全部 PASS 才算跑完。
-- ============================================================================
select * from (
  with pol as (
    select tablename, policyname, cmd, qual, with_check from pg_policies
     where schemaname = 'public' and tablename like 'intern_%'
  ), ent as (
    select count(*) as n from pol where tablename = 'intern_entries'
       and (qual not like '%auth.uid() = user_id%' and coalesce(with_check, '') not like '%auth.uid() = user_id%')
  ), tbl as (
    select count(*) as n from information_schema.tables
     where table_schema = 'public'
       and table_name in ('intern_terms','intern_tasks','intern_passports','intern_stamps','intern_entries')
  ), rls as (
    select count(*) as n from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname like 'intern_%' and c.relkind = 'r' and c.relrowsecurity
  ), ins as (
    select count(*) as n from pol where tablename = 'intern_passports' and cmd = 'INSERT'
  ), upd as (
    select count(*) as n from information_schema.column_privileges
     where table_schema = 'public' and table_name = 'intern_passports'
       and grantee = 'authenticated' and privilege_type = 'UPDATE'
  ), cadre as (
    select count(*) as n from pg_policies where schemaname = 'public'
       and tablename in ('months','activities','passports','stamps','entries')
       and (qual like '%is_intern%' or qual like '%is_internship_team%')
  ), pr as (
    select qual from pg_policies where schemaname = 'public' and tablename = 'profiles' and policyname = 'profiles_read_interns'
  )
  select 0 ord, 'OVERALL' as 項目, null::text as 應該是, null::text as 實際是,
    case when (select n from tbl) = 5 and (select n from rls) = 5
      and (select n from ent) = 0
      and (select count(*) from pol where tablename = 'intern_entries') = 4
      and (select n from ins) = 0
      and (select n from upd) = 1
      and (select n from cadre) = 0
      and (select qual from pr) like '%role = ''intern''%'
      and (select count(*) from public.intern_terms where active) = 1
    then 'PASS' else 'FAIL' end as 結果
  union all select 1, '五張表都在', '5', (select n from tbl)::text,
    case when (select n from tbl) = 5 then 'PASS' else 'FAIL' end
  union all select 2, '五張表都開了 RLS', '5', (select n from rls)::text,
    case when (select n from rls) = 5 then 'PASS' else 'FAIL' end
  union all select 3, '★ intern_entries 四條政策全部綁本人', '0 條沒綁', (select n from ent)::text || ' 條沒綁',
    case when (select n from ent) = 0 and (select count(*) from pol where tablename = 'intern_entries') = 4 then 'PASS' else 'FAIL' end
  union all select 4, '★ intern_passports 沒有 insert 政策（那一列由 claim_invite 建）', '0', (select n from ins)::text,
    case when (select n from ins) = 0 then 'PASS' else 'FAIL' end
  union all select 5, '★ intern_passports 前端只改得動 motto 一欄', '1 欄', (select n from upd)::text || ' 欄',
    case when (select n from upd) = 1 then 'PASS' else 'FAIL' end
  union all select 6, '★ 幹部護照的五張表沒有任何一條政策提到 intern', '0 條', (select n from cadre)::text || ' 條',
    case when (select n from cadre) = 0 then 'PASS' else 'FAIL' end
  union all select 7, '★ profiles 多的那一條只開 intern 的列', '含 role = intern',
    coalesce((select qual from pr), '（沒有這條政策）'),
    case when (select qual from pr) like '%role = ''intern''%' then 'PASS' else 'FAIL' end
  union all select 8, '剛好一屆是 active', '1', (select count(*) from public.intern_terms where active)::text,
    case when (select count(*) from public.intern_terms where active) = 1 then 'PASS' else 'FAIL' end
  union all select 9, '範例格子有進去', '9 格以上', (select count(*) from public.intern_tasks)::text || ' 格',
    case when (select count(*) from public.intern_tasks) >= 9 then 'PASS' else 'FAIL' end
) t order by ord;
