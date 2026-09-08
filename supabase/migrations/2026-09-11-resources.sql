-- 批 5：資源庫。　2026-09-08
--
-- 用法：整份貼進 Supabase SQL Editor 按一次 Run。
-- **先跑 2026-09-08-students.sql**（要用它建的 is_director_of()）。
--
-- ============================================================================
-- 這一支在做什麼
-- ============================================================================
--   一張 resources 表，加上一個**欄位層級**的可見範圍：
--   標題與介紹任何人都讀得到，**連結只有登入的人讀得到**。
--
-- ============================================================================
-- 為什麼是「目錄」不是「檔案主機」
-- ============================================================================
-- 2026-09-07 Paul 拍板。這張表存的是**一條連結**，不是檔案。
-- 檔案留在 BT 本來就在用的地方（Google Drive、YouTube、Canva）。
--
-- 放進 repo 的話，新增一份資源就變成「上傳檔案到 GitHub 再改一個 JSON」，
-- 那正是不能交給每年換屆的 Director 做的事。
-- 放 Supabase Storage 是另一個工程（上傳、權限、簽章連結），
-- 而那些檔案本來就已經在 Drive 裡了。
--
-- ⚠ **代價**：Drive 的權限設錯就是外洩或打不開，而網站看不出來。
-- 所以後台新增資源的時候有一句提醒，上線前要用無痕視窗自己點一次。
-- 這是人的流程，不是程式，README 有寫。
--
-- ============================================================================
-- 為什麼標題公開、連結要登入
-- ============================================================================
-- Paul 2026-09-07：「要登入 畢竟我還是要知道是誰跟哪裡人」。
--
-- 但全部鎖起來的話，Google 就搜不到，而「一個高中生半夜搜『美國大學 申請文書
-- 怎麼寫』搜到 BT」是外人找到這個組織最有效的路 —— 那條路整條消失的代價太大。
--
-- 所以切在**欄位**上：標題與介紹公開（搜尋得到、看得懂），
-- 只有 url 那一欄要登入。想拿東西才註冊。
--
-- ⚠ RLS 是「列」層級的，做不到這件事。這裡用的是 Postgres 的**欄位授權**：
-- anon 拿到除了 url 以外的欄位，authenticated 才拿得到 url。
-- anon 去 select url 會直接被拒。**前端因此要分兩種查詢**，那是刻意的，
-- 不是重複 —— 一份查詢兩種身分共用的話，遲早有人把 url 加進公開那一份。

begin;

create table if not exists public.resources (
  id         uuid primary key default gen_random_uuid(),
  title      text not null,
  blurb      text,
  kind       text not null default 'link'
             check (kind in ('pdf', 'video', 'slides', 'sheet', 'link', 'book')),
  url        text not null,
  team       text,
  status     text not null default 'draft' check (status in ('draft', 'published')),
  ord        int not null default 100,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.resources is
  'BT 產出的免費資源的**目錄**。存的是一條連結，不是檔案。';
comment on column public.resources.blurb is
  '公開的介紹：這是什麼、為什麼有用。**這一欄是搜尋引擎唯一看得到的東西**，
   所以要寫得像一句對高中生講的話，不是一行檔名。';
comment on column public.resources.url is
  '外部連結。**只有登入的人讀得到**（欄位層級授權，見檔頭）。
   ⚠ Drive 的分享權限設錯，這裡看不出來。上線前用無痕視窗自己點一次。';
comment on column public.resources.ord is
  '排序，小的在前。刻意用 int 不用序號：插一個到中間只要給 55，
   不用把後面每一列都往後推。';

drop trigger if exists resources_touch on public.resources;
create trigger resources_touch before update on public.resources
  for each row execute function public.touch_updated_at();

alter table public.resources enable row level security;

drop policy if exists res_read   on public.resources;
drop policy if exists res_insert on public.resources;
drop policy if exists res_write  on public.resources;
drop policy if exists res_delete on public.resources;

-- 已發布的任何人都看得到（欄位授權才是那道門）。draft 只有管得動的人看得到。
create policy res_read on public.resources
  for select using (status = 'published' or public.is_director_of(team));
create policy res_insert on public.resources
  for insert to authenticated with check (public.is_director_of(team));
create policy res_write on public.resources
  for update to authenticated using (public.is_director_of(team))
                                with check (public.is_director_of(team));
create policy res_delete on public.resources
  for delete to authenticated using (public.is_director_of(team));

-- ---------- 授權 ----------
-- ⚠ 先 revoke（Supabase 的 default privileges 會把 ALL 發給 anon 與 authenticated）。
revoke all on public.resources from anon, authenticated;

-- **anon 沒有 url。** 這一行就是「標題公開、連結要登入」那個決定本身。
-- 加 url 進去等於把整個資源庫變成公開的，而且畫面上完全看不出來。
grant select (id, title, blurb, kind, team, status, ord, updated_at)
  on public.resources to anon;
grant select on public.resources to authenticated;
grant insert, update, delete on public.resources to authenticated;

commit;
