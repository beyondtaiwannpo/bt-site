#!/usr/bin/env bash
# 給端對端測試（scripts/e2e/intern.mjs）用的本機資料庫。
#
# 跟 scripts/db/smoke.sh 同一套替身，差一件事：auth.uid() 不再讀 test.uid，
# 改讀 PostgREST 放進來的 JWT（request.jwt.claims 的 sub）。這樣瀏覽器裡
# 真的 supabase-js 送出來的請求，會以真的 RLS 被評估 —— 不是超級使用者、不是替身。
#
# 用法：  ./scripts/e2e/db.sh bt_e2e
# 需要：  本機 postgres（brew install postgresql@16）
set -euo pipefail
cd "$(dirname "$0")/../.."
DB="${1:-bt_e2e}"

psql -d postgres -q -c "drop database if exists $DB;"
psql -d postgres -q -c "create database $DB;"

psql -d "$DB" -q -v ON_ERROR_STOP=1 <<'SQL'
create extension if not exists pgcrypto;
create schema auth; create schema vault; create schema net;
create table auth.users (id uuid primary key default gen_random_uuid(), email text);
-- PostgREST 把 JWT 的 claims 放在 request.jwt.claims。Supabase 上的 auth.uid() 就是讀這個。
create or replace function auth.uid() returns uuid language sql stable
  as $$ select (nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'sub')::uuid $$;
create table vault.decrypted_secrets (name text, decrypted_secret text);
create or replace function net.http_post(url text, headers jsonb default '{}'::jsonb, body jsonb default '{}'::jsonb)
  returns bigint language sql as $$ select 1::bigint $$;
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticator') then
    create role authenticator login password 'authenticator' noinherit;
  end if;
end $$;
grant anon, authenticated to authenticator;
grant usage on schema public, auth to anon, authenticated;
SQL

# 護照那邊既有的結構（跟 smoke.sh 同一份縮小版，多了名字欄位的 update 授權：
# 實習生領護照時要改自己的 name_zh / name_en，那條授權在 2026-08-31 的遷移檔裡，
# 而那一支不在 smoke.sh 的清單裡）。
psql -d "$DB" -q -v ON_ERROR_STOP=1 <<'SQL'
create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  name_zh text, name_en text, team text,
  role text not null default 'student' check (role in ('cadre','student','alumni')),
  tz text, avatar text, updated_at timestamptz not null default now());
create or replace function public.is_cadre() returns boolean language sql stable security definer
  set search_path = public, pg_temp as $$ select exists (select 1 from public.profiles where id = auth.uid() and role='cadre') $$;
revoke execute on function public.is_cadre() from public, anon;
grant execute on function public.is_cadre() to authenticated;
create or replace function public.touch_updated_at() returns trigger language plpgsql
  as $$ begin new.updated_at = now(); return new; end $$;
create trigger profiles_touch_updated_at before update on public.profiles
  for each row execute function public.touch_updated_at();
alter table public.profiles enable row level security;
create policy profiles_read on public.profiles for select to authenticated
  using (auth.uid() = id or (public.is_cadre() and profiles.role = 'cadre'));
create policy profiles_write on public.profiles for update to authenticated
  using (auth.uid() = id) with check (auth.uid() = id);
create table public.invite_codes (
  code text primary key, uses_left int not null default 1,
  note text, created_at timestamptz default now());
create table public.passports (
  id uuid primary key references auth.users on delete cascade,
  name_zh text, name_en text, team text, motto text, avatar text,
  issued date default current_date, intro_seen boolean not null default false,
  updated_at timestamptz default now());
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (name_zh, name_en, team, tz, avatar) on public.profiles to authenticated;
-- 幹部護照的六張表（縮小版，照 schema.sql 加 2026-08-31 的 is_cadre() 政策）。
-- 第一輪端對端少了這幾張：intern 打 /passport/ 時 loadAll 查不到表就整頁變成「資料庫休眠中」，
-- 而正式站上那幾張表都在、RLS 回空的、然後把他導回 /app/。測試的世界要跟正式站一樣。
create table public.months (seq int primary key, month int not null, theme_zh text not null, theme_en text not null);
create table public.activities (id text primary key, month int not null, seq int not null, category text not null,
  title_zh text not null, title_en text not null, description text, needs_host boolean default false,
  callback_to text, active boolean default true);
create table public.stamps (user_id uuid references public.profiles on delete cascade, act_id text references public.activities,
  stamped_on date not null, created_at timestamptz default now(), primary key (user_id, act_id));
create table public.entries (user_id uuid references public.profiles on delete cascade, act_id text references public.activities,
  note text, photo text, primary key (user_id, act_id));
create table public.destinations (code text primary key, city text not null, active boolean default true);
create table public.visas (user_id uuid not null references auth.users on delete cascade, month int not null,
  code text not null references public.destinations(code), created_at timestamptz not null default now(), primary key (user_id, month));
alter table public.months enable row level security; alter table public.activities enable row level security;
alter table public.stamps enable row level security; alter table public.entries enable row level security;
alter table public.destinations enable row level security; alter table public.visas enable row level security;
alter table public.passports enable row level security;
create policy months_read on public.months for select to authenticated using (public.is_cadre());
create policy activities_read on public.activities for select to authenticated using (public.is_cadre());
create policy destinations_read on public.destinations for select to authenticated using (public.is_cadre());
create policy passports_read on public.passports for select to authenticated using (public.is_cadre());
create policy stamps_read on public.stamps for select to authenticated using (public.is_cadre());
create policy entries_read on public.entries for select to authenticated using (auth.uid() = user_id and public.is_cadre());
create policy visas_read on public.visas for select to authenticated using (auth.uid() = user_id and public.is_cadre());
revoke all on public.months, public.activities, public.stamps, public.entries, public.destinations, public.visas, public.passports from anon, authenticated;
grant select on public.months, public.activities, public.destinations to authenticated;
grant select, insert, update, delete on public.passports, public.stamps, public.entries to authenticated;
grant select, insert, delete on public.visas to authenticated;
SQL

for f in supabase/migrations/2026-09-08-students.sql \
         supabase/migrations/2026-09-09-applications.sql \
         supabase/migrations/2026-09-10-decisions-and-mail.sql \
         supabase/migrations/2026-09-11-resources.sql \
         supabase/migrations/2026-09-12-event-ops.sql \
         supabase/migrations/2026-09-13-public-team.sql \
         supabase/migrations/2026-09-14-anon-execute.sql \
         supabase/migrations/2026-09-15-mail-secret-lookup.sql \
         supabase/migrations/2026-09-16-mail-templates.sql \
         supabase/migrations/2026-09-17-invite-grants.sql \
         supabase/migrations/2026-09-18-alumni-stories.sql \
         supabase/migrations/2026-09-19-stories-for-review.sql \
         supabase/migrations/2026-09-20-availability-week.sql \
         supabase/migrations/2026-10-14-invite-uses.sql \
         supabase/migrations/2026-10-15-invite-admin.sql \
         supabase/migrations/2026-10-16-intern-role.sql \
         supabase/migrations/2026-10-17-intern-passport.sql \
         supabase/migrations/2026-10-18-intern-admin.sql ; do
  psql -d "$DB" -q -v ON_ERROR_STOP=1 -f "$f" >/dev/null
done

# 三個既有的幹部。密碼在 server.mjs 的 SEED 裡，這裡只放身分。
psql -d "$DB" -q -v ON_ERROR_STOP=1 <<'SQL'
insert into auth.users (id,email) values
 ('11111111-1111-1111-1111-111111111111','paul@example.com'),
 ('99999999-9999-9999-9999-999999999991','istaff@example.com'),
 ('44444444-4444-4444-4444-444444444444','other@example.com');
insert into public.profiles (id,name_zh,name_en,team,role,board_role) values
 ('11111111-1111-1111-1111-111111111111','王平','Paul Wang','Sponsorship Team','cadre','president'),
 ('99999999-9999-9999-9999-999999999991','帶實習的','Mentor Lin','Curriculum Team, Internship Team','cadre','member'),
 ('44444444-4444-4444-4444-444444444444','別組的','Other Chen','Marketing Team','cadre','director');
insert into public.passports (id) values
 ('11111111-1111-1111-1111-111111111111'),
 ('99999999-9999-9999-9999-999999999991'),
 ('44444444-4444-4444-4444-444444444444');
SQL
echo "ok $DB"
