#!/usr/bin/env bash
# 在**本機的 Postgres** 上把 supabase/migrations/ 的遷移檔跑一次，然後走一遍流程。
#
# 用法：  ./scripts/db/smoke.sh
# 需要：  本機有 postgres（macOS：brew install postgresql@16 && brew services start postgresql@16）
#
# ── 這支腳本在回答什麼問題 ──
# 2026-09-08 寫完目標 9 的六支遷移檔時，它們一行都沒有在資料庫上跑過。
# 「讀起來對」跟「跑得過」是兩件事，而 SQL 的錯誤多半要跑了才看得到。
#
# ⚠ **跑得過不等於在 Supabase 上會對。**
# 這裡的 auth.users / auth.uid() / vault / net.http_post 都是**替身**，
# 不是 Supabase 真的那幾個。真的寄信也驗不到（net.http_post 是替身）。
#
# ── RLS 一開始驗不到，後來補上了（2026-09-08）──
# 第一版整支用超級使用者跑，而**超級使用者繞過 RLS**，政策一次都沒被評估。
# 檔頭當時老實寫了「RLS 驗不到」，然後 bug 就從那裡掉出去了：
# 那幾條政策會呼叫 is_on_team() / is_director_of()，而那兩支的執行權限
# 當初把 anon 收掉了 —— 於是沒登入的人一打開 /apply/ 就是
# 「permission denied for function is_on_team」，整個查詢失敗。
# 修法見 supabase/migrations/2026-09-14-anon-execute.sql。
#
# **所以下面多了一段用 anon 與 authenticated 的身分去讀的檢查。**
# 「這一段驗不到」寫在註解裡不會讓它變安全，只會讓它變成一個有人簽過名的洞。
set -euo pipefail
cd "$(dirname "$0")/../.."

DB=bt_smoke_$$
PAUL=11111111-1111-1111-1111-111111111111
DIR=22222222-2222-2222-2222-222222222222
STU=33333333-3333-3333-3333-333333333333
OTHER=44444444-4444-4444-4444-444444444444
MEMBER=55555555-5555-5555-5555-555555555555
FORM=aaaaaaaa-0000-0000-0000-000000000001
Q1=bbbbbbbb-0000-0000-0000-000000000001
Q2=bbbbbbbb-0000-0000-0000-000000000002

cleanup() { [ -n "${KEEPDB:-}" ] || psql -d postgres -q -c "drop database if exists $DB;" >/dev/null 2>&1 || true; }
trap cleanup EXIT

pass=0; fail=0
# ⚠ 每一個斷言的 psql 呼叫後面都要 `|| true`。
# `set -euo pipefail` 之下，psql 回非零會讓**整支腳本直接結束**，
# 而不是報一個 FAIL —— 也就是「檢查失敗」變成「後面的檢查安靜地沒跑」。
# 2026-09-08 做破壞測試時就是這樣：故意弄壞一條，畫面上只是變短，
# 沒有任何一行寫著 FAIL。**會安靜消失的測試比沒有測試糟。**
# 一條斷言：跑一句 SQL，比對輸出。
# 比對的是**去掉空白之後的字串**，因為 psql 的欄寬會跟著內容變。
chk() { # chk 名稱 期望 SQL
  local got; got=$(psql -d "$DB" -X -A -t -q -c "$3" 2>&1 | tr -d ' \n' || true)
  if [ "$got" = "$2" ]; then echo "  ok   $1"; pass=$((pass+1));
  else echo "  FAIL ${1}（預期 ${2}，實際 ${got}）"; fail=$((fail+1)); fi
}
# 一條「以某個人的身分」跑的斷言。
# **set_config 要跟被測的那句話在同一個 psql 呼叫裡**（同一個 session 才算數），
# 但不要把它塞進同一個運算式 —— 那會讓回傳值變成布林，斷言就對不上了。
chkas() { # chkas 使用者 名稱 期望 SQL
  local got; got=$(psql -d "${DB}" -X -A -t -q \
    -c "select set_config('test.uid','${1}',false);" -c "${4}" 2>&1 | tail -1 | tr -d ' \n' || true)
  if [ "${got}" = "${3}" ]; then echo "  ok   ${2}"; pass=$((pass+1));
  else echo "  FAIL ${2}（預期 ${3}，實際 ${got}）"; fail=$((fail+1)); fi
}
# 一條「以某個資料庫角色的身分」跑的斷言（anon / authenticated）。
# **這是唯一會真的評估 RLS 的路徑** —— 超級使用者繞過 RLS，
# 用它跑的檢查對政策一無所知。
chkrole() { # chkrole 角色 使用者id 名稱 期望 SQL
  local got; got=$(psql -d "${DB}" -X -A -t -q \
    -c "select set_config('test.uid','${2}',false);" -c "set role ${1}; ${5}" 2>&1 | tail -1 | tr -d ' \n' || true)
  if [ "${got}" = "${4}" ]; then echo "  ok   ${3}"; pass=$((pass+1));
  else echo "  FAIL ${3}（預期 ${4}，實際 ${got}）"; fail=$((fail+1)); fi
}
# 一條「應該要被擋住」的斷言。
chkraise() { # chkraise 名稱 錯誤字串 SQL
  local got; got=$(psql -d "$DB" -X -A -t -q -c "do \$\$ begin $3 raise notice 'NOT_BLOCKED'; exception when others then raise notice '%', SQLERRM; end \$\$;" 2>&1 || true)
  if echo "$got" | grep -q "$2"; then echo "  ok   $1"; pass=$((pass+1));
  else echo "  FAIL ${1}（沒有被擋住或訊息不對：${got}）"; fail=$((fail+1)); fi
}

echo "建立測試資料庫 $DB"
psql -d postgres -q -c "create database $DB;"

echo "裝 Supabase 平台那幾樣東西的替身"
psql -d "$DB" -q -v ON_ERROR_STOP=1 <<'SQL'
create extension if not exists pgcrypto;
create schema auth; create schema vault; create schema net;
create table auth.users (id uuid primary key default gen_random_uuid(), email text);
-- auth.uid() 讀一個 session 變數，測試才扮演得了不同的人。
create or replace function auth.uid() returns uuid language sql stable
  as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
create table vault.decrypted_secrets (name text, decrypted_secret text);
create or replace function net.http_post(url text, headers jsonb default '{}'::jsonb, body jsonb default '{}'::jsonb)
  returns bigint language sql as $$ select 1::bigint $$;
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
end $$;
-- 這兩句在 Supabase 上本來就有。沒有的話 anon 連 auth.uid() 都叫不動，
-- 而那會讓下面的 RLS 檢查全部因為「錯的理由」失敗。
grant usage on schema public, auth to anon, authenticated;
-- Storage 的替身（2026-11-06 歷史之路）：只要 buckets 與 objects 兩張表的那幾欄，遷移檔的 bucket 與四條政策才跑得到、驗得到。
create schema storage;
create table storage.buckets (id text primary key, name text not null, public boolean not null default false, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text, owner uuid, metadata jsonb, created_at timestamptz default now());
alter table storage.objects enable row level security;
grant usage on schema storage to anon, authenticated;
grant select, insert, update, delete on storage.objects to anon, authenticated;
grant select on storage.buckets to anon, authenticated;
SQL

echo "建護照那邊既有的結構（這幾支要接在它後面）"
psql -d "$DB" -q -v ON_ERROR_STOP=1 <<'SQL'
create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  name_zh text, name_en text, team text,
  role text not null default 'student' check (role in ('cadre','student','alumni')),
  tz text, avatar text, updated_at timestamptz not null default now());
create or replace function public.is_cadre() returns boolean language sql stable security definer
  set search_path = public, pg_temp as $$ select exists (select 1 from public.profiles where id = auth.uid() and role='cadre') $$;
-- 照 2026-08-31 那支遷移檔原本的樣子把 anon 收掉。
-- **這一行是重現那個 bug 的關鍵**：少了它，下面的 anon 檢查會假通過。
revoke execute on function public.is_cadre() from public, anon;
grant execute on function public.is_cadre() to authenticated;
create or replace function public.touch_updated_at() returns trigger language plpgsql
  as $$ begin new.updated_at = now(); return new; end $$;
alter table public.profiles enable row level security;
create policy profiles_read on public.profiles for select to authenticated
  using (auth.uid() = id or (public.is_cadre() and profiles.role = 'cadre'));
-- ⚠ 2026-09-17-invite-grants.sql 會 alter invite_codes、把新的 claim_invite()
-- 寫進 passports —— 兩張表都要先在（照 supabase/schema.sql 的樣子縮小版）。
-- 這裡漏過一次：加那支遷移檔的時候忘了在這裡補表，於是 smoke.sh 在
-- 2026-09-17 那一步直接炸掉，「跑得過」跟「有沒有跑」是兩件事（README 第 12 項）。
create table public.invite_codes (
  code text primary key, uses_left int not null default 1,
  note text, created_at timestamptz default now());
create table public.passports (
  id uuid primary key references auth.users on delete cascade,
  name_zh text, name_en text, team text, motto text, avatar text,
  issued date default current_date, intro_seen boolean not null default false,
  updated_at timestamptz default now());
-- 2026-10-19-regrant-passport-tables.sql 要發這兩張表的權限，所以要先在（縮小版）。
create table public.stamps (user_id uuid, act_id text, stamped_on date not null, primary key (user_id, act_id));
create table public.entries (user_id uuid, act_id text, note text, photo text, primary key (user_id, act_id));
-- 2026-10-20-passport-admin.sql 要改這三張表，所以要先在（照 supabase/schema.sql 的樣子縮小版，
-- 連 seed 的 11 個月與 3 格一起放，後台那段要拿它們當對象）。
create table public.months (seq int primary key, month int not null, theme_zh text not null, theme_en text not null);
create table public.activities (
  id text primary key, month int not null, seq int not null,
  category text not null check (category in ('gather','prompt','frame')),
  title_zh text not null, title_en text not null, description text,
  needs_host boolean default false, callback_to text references public.activities, active boolean default true);
create table public.destinations (code text primary key, city text not null, active boolean default true);
create table public.visas (user_id uuid, month int, code text not null references public.destinations(code), primary key (user_id, month));
insert into public.months values (1,9,'07:00',''),(2,10,'08:00',''),(3,11,'08:40',''),(4,12,'10:00',''),(5,1,'12:30',''),
  (6,2,'14:00',''),(7,3,'16:00',''),(8,4,'18:00',''),(9,5,'19:30',''),(10,6,'21:00',''),(11,7,'23:50','');
insert into public.activities (id,month,seq,category,title_zh,title_en,description,needs_host) values
  ('09A',9,1,'gather','開學電影夜','OPENING NIGHT','新學年第一次全員上線',true),
  ('09B',9,1,'prompt','我是怎麼進來的','HOW I GOT HERE','三句話',false),
  ('09C',9,1,'frame','開學第一天','DAY ONE','你的桌子',false);
insert into public.destinations (code,city) values ('TPE','TAIPEI'),('LAX','LOS ANGELES');
revoke all on public.months, public.activities, public.destinations, public.visas from anon, authenticated;
grant select on public.months, public.activities, public.destinations to authenticated;
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
-- 2026-10-21-people-admin.sql 的 trigger 要靠「本人在 /settings/ 改 team」來測，
-- 所以照 2026-08-31 那支的樣子把本人可改的那幾欄與政策放上（縮小版）。
create policy profiles_write on public.profiles for update to authenticated
  using (auth.uid() = id) with check (auth.uid() = id);
grant update (name_zh, name_en, team, tz, avatar) on public.profiles to authenticated;
SQL

echo
echo "跑遷移檔："
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
         supabase/migrations/2026-10-18-intern-admin.sql \
         supabase/migrations/2026-10-19-regrant-passport-tables.sql \
         supabase/migrations/2026-10-20-passport-admin.sql \
         supabase/migrations/2026-10-21-people-admin.sql \
         supabase/migrations/2026-10-22-intern-board.sql \
         supabase/migrations/2026-10-23-intern-pawn.sql ; do
  if psql -d "$DB" -q -v ON_ERROR_STOP=1 -f "$f" >/dev/null 2>&1; then
    echo "  ok   $(basename "$f")"; pass=$((pass+1))
  else
    echo "  FAIL $(basename "$f")"; fail=$((fail+1))
    psql -d "$DB" -v ON_ERROR_STOP=1 -f "$f" 2>&1 | grep -i "error\|LINE" | head -5
  fi
done

echo
echo "放測試資料："
psql -d "$DB" -q -v ON_ERROR_STOP=1 <<SQL
insert into auth.users (id,email) values
 ('$PAUL','paul@example.com'), ('$DIR','director@example.com'),
 ('$STU','student@example.com'), ('$OTHER','other@example.com'), ('$MEMBER','member@example.com');
insert into public.profiles (id,name_zh,team,role,board_role) values
 ('$PAUL','王平','P/VP','cadre','president'),
 ('$DIR','小安','Curriculum','cadre','director'),
 ('$STU','高中生',null,'student','member'),
 ('$OTHER','別組的','Marketing','cadre','director'),
 ('$MEMBER','一般幹部','Curriculum','cadre','member');
update public.profiles set school='臺北市立建國高級中學', grade='高二', newsletter_opt_in=true where id='$STU';
insert into public.forms (id,team,title,status,notify_by)
 values ('$FORM','Curriculum','2027 暑期探索營','open','2026-12-15');
insert into public.form_questions (id,form_id,ord,label,type,required) values
 ('$Q1','$FORM',1,'你為什麼想參加','long',true),
 ('$Q2','$FORM',2,'想讀什麼','short',false);
SQL

# 2026-10-24 那一支要**在有資料之後**才跑：它會把今天的幹部搬成 people / positions / assignments，
# 空資料庫上跑只驗得到結構、驗不到搬資料那一段。所以它不在上面的清單裡，在這裡單獨跑。
echo
echo "跑 2026-10-24-ranks-and-workspaces.sql（在有幹部資料之後）："
rwgot=$(psql -d "${DB}" -X -A -t -q -v ON_ERROR_STOP=1 -f supabase/migrations/2026-10-24-ranks-and-workspaces.sql 2>&1 || true)
if echo "${rwgot}" | grep -q "OVERALL.*PASS" && ! echo "${rwgot}" | grep -q "FAIL"; then
  echo "  ok   職級與指派那支遷移檔跑過，驗收表全部 PASS"; pass=$((pass+1))
else
  echo "  FAIL 職級與指派那支遷移檔沒過："; echo "${rwgot}" | grep -i "FAIL\|error\|LINE" | head -8; fail=$((fail+1))
fi
chk "搬資料：四位幹部各一列 people、各一筆 2026-27 的職位" "4|4" \
  "select (select count(*) from public.people where profile_id is not null)||'|'||(select count(*) from public.positions where term_id='2026-27')"
chk "搬資料：Director 對自己 team 的申請與資源是「管」，一般幹部是「看」" "manage|manage|view" \
  "select (select level from public.assignments where user_id='$DIR' and workspace_id='apps:Curriculum')||'|'||(select level from public.assignments where user_id='$DIR' and workspace_id='res:Curriculum')||'|'||(select level from public.assignments where user_id='$MEMBER' and workspace_id='apps:Curriculum')"
chk "搬資料：Co-President 沒有指派（職級本身就是全部），職位名稱從職級算出來" "0|Co-President|Director,Curriculum" \
  "select (select count(*) from public.assignments where user_id='$PAUL')||'|'||(select title_en from public.positions po join public.people pe on pe.id=po.person_id where pe.profile_id='$PAUL')||'|'||(select title_en from public.positions po join public.people pe on pe.id=po.person_id where pe.profile_id='$DIR')"

echo
echo "走流程："
chk "同意的時間戳由 trigger 蓋（前端寫不到那一欄）" "t" \
  "select newsletter_opt_in_at is not null from public.profiles where id='$STU'"

chkraise "必填留白會被擋，而且說得出是哪一題" "missing:你為什麼想參加" \
  "perform set_config('test.uid','$STU',true);
   perform public.submit_application('$FORM'::uuid,'[{\"q\":\"$Q2\",\"v\":\"理工\"}]'::jsonb,'mom@example.com');"

psql -d "$DB" -q -c "select set_config('test.uid','$STU',false);
  select public.submit_application('$FORM'::uuid,
   '[{\"q\":\"$Q1\",\"v\":\"我從國三就一直在想這件事\"},{\"q\":\"$Q2\",\"v\":\"理工\"}]'::jsonb,'mom@example.com');" >/dev/null

chk "email 由伺服器填，不是前端送的" "student@example.com" \
  "select applicant_email from public.applications"
chk "送出當下的學校有存成快照" "臺北市立建國高級中學" \
  "select applicant_school from public.applications"
chk "家長告知信自動排進 outbox" "guardian|mom@example.com" \
  "select kind||'|'||to_email from public.mail_outbox where kind='guardian'"

psql -d "$DB" -q -c "select set_config('test.uid','$STU',false);
  select public.submit_application('$FORM'::uuid,'[{\"q\":\"$Q1\",\"v\":\"再送一次\"}]'::jsonb,null);" >/dev/null
chk "同一份表單送第二次不會變成兩筆" "1" "select count(*) from public.applications"

chkraise "別的 team 的 Director 按不動（整批擋住）" "not_director_of:Curriculum" \
  "perform set_config('test.uid','$OTHER',true);
   perform public.decide_applications((select array_agg(id) from public.applications),'accepted');"
chkraise "一般幹部按不動" "not_director_of:Curriculum" \
  "perform set_config('test.uid','$MEMBER',true);
   perform public.decide_applications((select array_agg(id) from public.applications),'accepted');"

chkas "$DIR" "自己 team 的 Director 按得動" "1" \
  "select public.decide_applications((select array_agg(id) from public.applications),'accepted')"
chkas "$DIR" "連點兩次不會改第二次，也不會寄第二封" "0" \
  "select public.decide_applications((select array_agg(id) from public.applications),'accepted')"
chk "錄取信只有一封" "1" "select count(*) from public.mail_outbox where kind='accepted'"
chk "錄取信裡有「不要回覆這封信」" "t" \
  "select body like '%不要回覆這封信%' from public.mail_outbox where kind='accepted'"

chkraise "Vault 沒設定的時候，寄信說得出原因" "mail_not_configured" \
  "perform set_config('test.uid','$DIR',true); perform public.send_pending_mail(10);"

psql -d "$DB" -q -c "insert into vault.decrypted_secrets values ('RESEND_API_KEY','re_test'),('BT_MAIL_FROM','BT <noreply@x>');" >/dev/null
chkas "$DIR" "設定好之後寄得出去（兩封：家長告知加錄取）" "(2,0)" \
  "select public.send_pending_mail(10)"
chk "沒有信卡在 outbox 裡" "0" "select count(*) from public.mail_outbox where sent_at is null"

chkraise "一般幹部點不了簽到" "not_director_of:Curriculum" \
  "perform set_config('test.uid','$MEMBER',true);
   perform public.set_check_in((select array_agg(id) from public.applications),true);"
chkas "$DIR" "Director 點得了簽到" "1" \
  "select public.set_check_in((select array_agg(id) from public.applications),true)"

chkas "$DIR" "行前信寄給錄取的人（收件人由資料庫自己撈）" "1" \
  "select public.send_notice('$FORM'::uuid, array['accepted'],'行前通知','九點台大集合。')"

chkraise "Director 核可不了團隊頁（Co-President 與 Senior Adviser 才可以）" "not_senior" \
  "perform set_config('test.uid','$DIR',true);
   perform public.set_public_approved('$DIR'::uuid,true);"
chkraise "president 降級不了自己" "cannot_demote_self" \
  "perform set_config('test.uid','$PAUL',true);
   perform public.set_board_role('$PAUL'::uuid,'member');"
chkraise "president 也不能把學員設成 director" "not_a_cadre" \
  "perform set_config('test.uid','$PAUL',true);
   perform public.set_board_role('$STU'::uuid,'director');"

psql -d "$DB" -q -c "update public.profiles set public_profile=true where id='$DIR';" >/dev/null
chk "只有本人打勾還不會上公開頁面" "0" \
  "select count(*) from public.profiles where public_profile and public_approved"
chkas "$PAUL" "兩把鑰匙都轉了才會出現" "小安" \
  "select public.set_public_approved('$DIR'::uuid,true);
   select name_zh from public.profiles where public_profile and public_approved and role='cadre'"

chkraise "幹部不能自己刪帳號" "cadre_must_ask" \
  "perform set_config('test.uid','$DIR',true); perform public.delete_my_account();"
psql -d "$DB" -q -c "select set_config('test.uid','$STU',false); select public.delete_my_account();" >/dev/null
chk "學員刪帳號之後，申請與答案一起消失" "0|0" \
  "select (select count(*) from public.applications)||'|'||(select count(*) from public.application_answers)"

echo
echo "信件文案："
chkas "${DIR}" "文案是從表裡讀出來的（改表就會改到信）" "1" \
  "select count(*) from public.mail_templates where kind='accepted' and body like '%錄取了%'"
chkraise "Director 改不動文案（那是全組織對外的聲音）" "not_senior" \
  "perform set_config('test.uid','${DIR}',true);
   perform public.set_mail_template('accepted','x','y');"
chkas "${PAUL}" "president 改得動" "accepted" \
  "select public.set_mail_template('accepted','主旨 {活動名稱}','{姓名} 你好，測試一下。')"
chkas "${DIR}" "改完之後，代換符號有被換掉" "陳小明你好，測試一下。" \
  "select replace(split_part(public.mail_body('accepted','陳小明','探索營',null), chr(10), 1), ' ', '')"
# ⚠ 信尾是系統加的，不在文案裡，所以改文案改不掉它。
chkas "${DIR}" "★ 信尾那句改不掉（noreply 沒有 MX，那是必要資訊）" "t" \
  "select public.mail_body('accepted','陳小明','探索營',null) like '%不要回覆這封信%'"
# ⚠ 主旨也要跟著表走。不換的話文案只改得動一半——內文跟著表，主旨還是寫死的，
# 而那種半套最難發現：改了主旨按存檔一切正常，直到信寄出去才看得到。
chkas "${DIR}" "★ 主旨也是從表裡讀的" "主旨探索營" \
  "select public.mail_subject('accepted','陳小明','探索營')"
chkas "${DIR}" "★ 表裡讀不到就退回寫死的那一份（信照樣寄得出去）" "t" \
  "delete from public.mail_templates where kind='accepted';
   select public.mail_body('accepted','陳小明','探索營',null) like '%錄取了%'"

echo
echo "RLS（用 anon 與 authenticated 的身分讀，這一段超級使用者驗不到）："
psql -d "${DB}" -q -c "
  insert into public.forms (id,team,title,status) values
    ('cccccccc-0000-0000-0000-000000000001','Curriculum','還在寫的表單','draft');
  insert into public.resources (title,url,status) values ('公開資源','https://drive/x','published');
  insert into public.resources (title,url,status) values ('還在寫的資源','https://drive/y','draft');
" >/dev/null

chkrole anon "" "沒登入讀得到開放中的申請表" "2027暑期探索營" \
  "select title from public.forms where status='open'"
chkrole anon "" "沒登入讀不到還在寫的表單" "0" \
  "select count(*) from public.forms where status='draft'"
chkrole anon "" "沒登入讀得到資源的標題" "公開資源" \
  "select title from public.resources where status='published' order by title limit 1"
chkrole anon "" "沒登入讀不到還在寫的資源" "0" \
  "select count(*) from public.resources where status='draft'"

# ⚠ 這一條守的是 2026-09-07「標題公開、連結要登入」那個決定。
# 它是**欄位層級**的授權，RLS 做不到，所以它是一個很容易被下一個人
# 「順手」加回去的洞（一句 grant select on resources to anon 就破了）。
# ⚠ `|| true` 是必要的：set -e 之下，賦值裡的指令失敗會讓整支腳本直接結束，
# 而**這一條期待的就是失敗**。少了它，後面幾條檢查會安靜地不執行
# （2026-09-08 就是這樣少跑了四條，而畫面上看起來只是「比較短」）。
rlsgot=$(psql -d "${DB}" -X -A -t -q -c "set role anon; select url from public.resources limit 1;" 2>&1 || true)
if echo "${rlsgot}" | grep -qi "permission denied"; then
  echo "  ok   ★ 沒登入拿不到資源的連結（欄位層級授權）"; pass=$((pass+1))
else
  echo "  FAIL ★ 沒登入居然拿得到資源的連結：${rlsgot}"; fail=$((fail+1))
fi
chkrole authenticated "${STU}" "登入之後拿得到資源的連結" "https://drive/x" \
  "select url from public.resources where title='公開資源'"

chkrole anon "" "沒登入讀得到「兩把鑰匙都轉了」的那個人" "小安" \
  "select name_zh from public.profiles where public_profile and public_approved"
chkrole anon "" "沒登入讀不到沒公開的幹部" "0" \
  "select count(*) from public.profiles where not public_profile"

echo
echo "邀請碼使用紀錄（2026-10-14）："
# 兩位新的學員：NEWB 拿幹部碼，ALUM 拿校友碼。
# **不用 STU**：前面「刪自己的帳號」那一段已經把他刪掉了，拿他來測會在錯的地方失敗。
NEWB=77777777-7777-7777-7777-777777777777
ALUM=66666666-6666-6666-6666-666666666666
psql -d "${DB}" -q -c "
  insert into auth.users (id,email) values ('${ALUM}','alum@example.com'), ('${NEWB}','newb@example.com');
  insert into public.profiles (id,name_zh,role) values ('${ALUM}','老校友','student'), ('${NEWB}','新幹部','student');
  insert into public.invite_codes (code,uses_left,grants,note) values
    ('BT-CADRE',2,'cadre','給新幹部'), ('BT-ALUM',2,'alumni','給校友');
" >/dev/null

# 小寫加空白也要對得回那一組碼，而紀錄存的是那一列原本的寫法。
chkas "${NEWB}" "學員拿幹部碼升級" "upgraded" "select public.claim_invite(' bt-cadre ')"
chk "★ 紀錄存的是碼原本的寫法，不是使用者打的字" "BT-CADRE|cadre" \
  "select code||'|'||grants from public.invite_uses where user_id='${NEWB}'"
chkas "${NEWB}" "幹部再輸入一次" "already_cadre" "select public.claim_invite('BT-CADRE')"
chk "★ 沒扣碼的那一次不記" "1|1" \
  "select (select count(*) from public.invite_uses)||'|'||(select uses_left from public.invite_codes where code='BT-CADRE')"

chkas "${ALUM}" "學員拿校友碼升級" "upgraded_alumni" "select public.claim_invite('BT-ALUM')"
chkas "${ALUM}" "校友再拿一次校友碼" "already_alumni" "select public.claim_invite('BT-ALUM')"
chk "★ 補回去的那一次不記，剩餘次數也對" "1|1" \
  "select (select count(*) from public.invite_uses where code='BT-ALUM')||'|'||(select uses_left from public.invite_codes where code='BT-ALUM')"

chkraise "★ 碼不對整筆回滾，連紀錄一起" "invalid_invite" \
  "perform set_config('test.uid','${MEMBER}',true); update public.profiles set role='student' where id='${MEMBER}';
   perform public.claim_invite('NOPE');"
chk "回滾之後紀錄還是兩筆" "2" "select count(*) from public.invite_uses"

chkrole authenticated "${PAUL}" "★ Co-President 看得到每一組碼" "2" \
  "select count(*) from public.invite_codes_for_review()"
chkrole authenticated "${PAUL}" "Co-President 看得到誰用的、email 與名字" "新幹部|newb@example.com|cadre" \
  "select u->>'name'||'|'||(u->>'email')||'|'||(u->>'role') from public.invite_codes_for_review() r, jsonb_array_elements(r.uses) u where r.code='BT-CADRE'"
chkrole authenticated "${DIR}" "★ Director 叫得動但一列都拿不到" "0" \
  "select count(*) from public.invite_codes_for_review()"
chkrole authenticated "${MEMBER}" "★ 一般幹部一列都拿不到" "0" \
  "select count(*) from public.invite_codes_for_review()"
iugot=$(psql -d "${DB}" -X -A -t -q -c "set role authenticated; select count(*) from public.invite_uses;" 2>&1 || true)
if echo "${iugot}" | grep -qi "permission denied"; then
  echo "  ok   ★ 登入的人直接查 invite_uses 會被擋"; pass=$((pass+1))
else
  echo "  FAIL ★ 登入的人居然直接查得到 invite_uses：${iugot}"; fail=$((fail+1))
fi
iagot=$(psql -d "${DB}" -X -A -t -q -c "set role anon; select count(*) from public.invite_codes_for_review();" 2>&1 || true)
if echo "${iagot}" | grep -qi "permission denied"; then
  echo "  ok   ★ 沒登入叫不動讀取函式"; pass=$((pass+1))
else
  echo "  FAIL ★ 沒登入居然叫得動讀取函式：${iagot}"; fail=$((fail+1))
fi
# 遷移檔最後那張 PASS / FAIL 表。重跑一次沒有副作用（全是 if not exists 與 create or replace）。
avgot=$(psql -d "${DB}" -X -A -t -q -f supabase/migrations/2026-10-14-invite-uses.sql 2>&1 || true)
if echo "${avgot}" | grep -q "OVERALL.*PASS" && ! echo "${avgot}" | grep -q "FAIL"; then
  echo "  ok   遷移檔自己的驗收表全部 PASS"; pass=$((pass+1))
else
  echo "  FAIL 遷移檔自己的驗收表沒全過："; echo "${avgot}" | grep -i "FAIL\|error" | head -5; fail=$((fail+1))
fi
chk "刪帳號時紀錄跟著消失" "1" \
  "delete from auth.users where id='${ALUM}'; select count(*) from public.invite_uses"

echo
echo "後台新增與停用邀請碼（2026-10-14）："
chkas "${PAUL}" "Co-President 建得了碼，前後空白會去掉" "bt-new-01" \
  "select public.create_invite('  bt-new-01 ', 'alumni', 3, '  給校友小明 ')"
chk "存進去的身分、次數、備註都對" "alumni|3|給校友小明" \
  "select grants||'|'||uses_left||'|'||note from public.invite_codes where code='bt-new-01'"
chkraise "★ 只差在大小寫會被擋，而且講得出撞到哪一組" "invite_exists:bt-new-01" \
  "perform set_config('test.uid','${PAUL}',true); perform public.create_invite('BT-NEW-01','cadre',1,null);"
chkraise "碼裡有空白或中文會被擋" "bad_invite_code" \
  "perform set_config('test.uid','${PAUL}',true); perform public.create_invite('bt 新碼','cadre',1,null);"
chkraise "次數超過 100 會被擋" "bad_uses" \
  "perform set_config('test.uid','${PAUL}',true); perform public.create_invite('bt-big','cadre',101,null);"
chkraise "身分亂填會被擋" "bad_grants" \
  "perform set_config('test.uid','${PAUL}',true); perform public.create_invite('bt-x1','student',1,null);"
chkraise "★ Director 建不了碼" "not_president" \
  "perform set_config('test.uid','${DIR}',true); perform public.create_invite('bt-dir','cadre',1,null);"
chkraise "★ 一般幹部建不了碼" "not_president" \
  "perform set_config('test.uid','${MEMBER}',true); perform public.create_invite('bt-mem','cadre',1,null);"
chkraise "★ Director 停用不了碼" "not_president" \
  "perform set_config('test.uid','${DIR}',true); perform public.disable_invite('bt-new-01');"
chk "被擋下來的那幾組都沒有建出來" "0" \
  "select count(*) from public.invite_codes where code in ('bt-dir','bt-mem','bt-big','bt-x1','BT-NEW-01')"
chkas "${PAUL}" "Co-President 停用得了" "0" "select public.disable_invite('bt-new-01')"
chk "停用之後剩餘次數是 0" "0" "select uses_left from public.invite_codes where code='bt-new-01'"
chkraise "停用之後真的不能用" "invalid_invite" \
  "perform set_config('test.uid','${MEMBER}',true); update public.profiles set role='student' where id='${MEMBER}';
   perform public.claim_invite('bt-new-01');"
chkraise "停用不存在的碼會講出來" "no_such_invite" \
  "perform set_config('test.uid','${PAUL}',true); perform public.disable_invite('nope');"
iagot=$(psql -d "${DB}" -X -A -t -q -c "set role anon; select public.create_invite('bt-anon','cadre',1,null);" 2>&1 || true)
if echo "${iagot}" | grep -qi "permission denied"; then
  echo "  ok   ★ 沒登入叫不動新增"; pass=$((pass+1))
else
  echo "  FAIL ★ 沒登入居然叫得動新增：${iagot}"; fail=$((fail+1))
fi
avgot=$(psql -d "${DB}" -X -A -t -q -f supabase/migrations/2026-10-15-invite-admin.sql 2>&1 || true)
if echo "${avgot}" | grep -q "OVERALL.*PASS" && ! echo "${avgot}" | grep -q "FAIL"; then
  echo "  ok   新增與停用那支遷移檔的驗收表全部 PASS"; pass=$((pass+1))
else
  echo "  FAIL 新增與停用那支遷移檔的驗收表沒全過："; echo "${avgot}" | grep -i "FAIL\|error" | head -5; fail=$((fail+1))
fi

echo
echo "實習生身分與實習護照（2026-10-16 / 10-17）："
# ⚠ 上面兩段為了印驗收表，各重跑了一次 2026-10-14 與 2026-10-15，
# 而那兩支會把 claim_invite() 與 create_invite() 蓋回**不認 intern** 的版本。
# 所以這一段先把 2026-10-16 再跑一次（它本來就設計成可以重跑），
# 不然下面「學員拿 intern 碼」會在錯的地方失敗。
irgot=$(psql -d "${DB}" -X -A -t -q -f supabase/migrations/2026-10-16-intern-role.sql 2>&1 || true)
if echo "${irgot}" | grep -q "OVERALL.*PASS" && ! echo "${irgot}" | grep -q "FAIL"; then
  echo "  ok   intern 身分那支遷移檔的驗收表全部 PASS（重跑）"; pass=$((pass+1))
else
  echo "  FAIL intern 身分那支遷移檔的驗收表沒全過："; echo "${irgot}" | grep -i "FAIL\|error" | head -5; fail=$((fail+1))
fi
INT1=88888888-8888-8888-8888-888888888881
INT2=88888888-8888-8888-8888-888888888882
ISTAFF=99999999-9999-9999-9999-999999999991
psql -d "${DB}" -q -c "
  insert into auth.users (id,email) values ('${INT1}','i1@example.com'), ('${INT2}','i2@example.com'), ('${ISTAFF}','istaff@example.com');
  insert into public.profiles (id,name_zh,role) values ('${INT1}','實習一號','student'), ('${INT2}','實習二號','student');
  insert into public.profiles (id,name_zh,team,role,board_role) values ('${ISTAFF}','帶實習的','Curriculum Team, Internship Team','cadre','member');
" >/dev/null
# 2026-10-24 起 team 只是標籤：Internship team 的幹部要靠指派才碰得到實習護照。
# 這就是 README「新人怎麼上線」第 3 步。
chkas "${PAUL}" "Co-President 把帶實習的幹部派進實習護照工作區（改）" "edit" \
  "select public.assign('${ISTAFF}','intern-passport','edit')"

chkas "${PAUL}" "Co-President 發得出 intern 碼" "bt-intern-01" \
  "select public.create_invite('bt-intern-01','intern',5,'給 2026-27 的 intern')"
chkas "${INT1}" "★ 學員拿 intern 碼變成 intern" "upgraded_intern" "select public.claim_invite('bt-intern-01')"
chkas "${INT2}" "第二位也是" "upgraded_intern" "select public.claim_invite(' BT-INTERN-01 ')"
chk "★ 身分真的變了，而且幹部護照那一列沒有多出來" "intern|intern|0" \
  "select (select role from public.profiles where id='${INT1}')||'|'||(select role from public.profiles where id='${INT2}')||'|'||(select count(*) from public.passports where id in ('${INT1}','${INT2}'))"
chk "★ 升級時實習護照建好了，而且掛在 active 的那一屆" "2026-27|2026-27" \
  "select string_agg(term,'|' order by id) from public.intern_passports where id in ('${INT1}','${INT2}')"
chkas "${INT1}" "intern 再拿一次 intern 碼：不扣碼" "already_intern" "select public.claim_invite('bt-intern-01')"
chk "次數剩 3（兩個人各一次，第三次補回去了）" "3" "select uses_left from public.invite_codes where code='bt-intern-01'"
chk "使用紀錄兩筆，身分是 intern" "2" "select count(*) from public.invite_uses where code='bt-intern-01' and grants='intern'"

chkrole authenticated "${INT1}" "intern 讀得到這一屆的格子" "9" "select count(*) from public.intern_tasks where active"
chkrole authenticated "${INT1}" "intern 蓋得了自己的章" "1" \
  "insert into public.intern_stamps (user_id,task_id,stamped_on) values ('${INT1}','T2627-01','2026-10-01');
   insert into public.intern_entries (user_id,task_id,note) values ('${INT1}','T2627-01','第一次會議很緊張');
   select count(*) from public.intern_stamps where user_id='${INT1}'"
chkrole authenticated "${INT1}" "intern 改得了自己護照上的一句話" "一句話" \
  "update public.intern_passports set motto='一句話' where id='${INT1}'; select motto from public.intern_passports where id='${INT1}'"
ipgot=$(psql -d "${DB}" -X -A -t -q -c "select set_config('test.uid','${INT1}',false);" -c "set role authenticated; update public.intern_passports set issued='2020-01-01' where id='${INT1}';" 2>&1 || true)
if echo "${ipgot}" | grep -qi "permission denied"; then
  echo "  ok   ★ intern 改不動核發日（欄位層級授權，只開 motto）"; pass=$((pass+1))
else
  echo "  FAIL ★ intern 居然改得動核發日：${ipgot}"; fail=$((fail+1))
fi
chkrole authenticated "${INT2}" "★ 另一位 intern 看得到他的章，看不到他的心得" "1|0" \
  "select (select count(*) from public.intern_stamps where user_id='${INT1}')||'|'||(select count(*) from public.intern_entries where user_id='${INT1}')"
chkrole authenticated "${INT2}" "另一位 intern 讀得到他的名字（進度牆）" "實習一號" \
  "select name_zh from public.profiles where id='${INT1}'"
# 已經核可上公開團隊頁的那位（小安）任何人都讀得到，那是 2026-09-13 的決定，不是這裡的洞。
chkrole authenticated "${INT2}" "★ intern 讀不到幹部的名字（公開團隊頁上的除外）" "0" \
  "select count(*) from public.profiles where role='cadre' and not (public_profile and public_approved)"
# 寫進別人的列不是「安靜地沒寫進去」，是資料庫直接丟錯 —— 那是對的，所以這裡抓的是錯誤訊息。
isgot=$(psql -d "${DB}" -X -A -t -q -c "select set_config('test.uid','${INT2}',false);" -c "set role authenticated; insert into public.intern_stamps (user_id,task_id,stamped_on) values ('${INT1}','T2627-02','2026-10-02');" 2>&1 || true)
if echo "${isgot}" | grep -qi "row-level security"; then
  echo "  ok   ★ intern 寫不進別人的章"; pass=$((pass+1))
else
  echo "  FAIL ★ intern 居然寫得進別人的章：${isgot}"; fail=$((fail+1))
fi
chkrole authenticated "${ISTAFF}" "★ Internship team 的幹部看得到 intern 的章與名字，看不到心得" "1|實習一號|0" \
  "select (select count(*) from public.intern_stamps)||'|'||(select name_zh from public.profiles where id='${INT1}')||'|'||(select count(*) from public.intern_entries)"
isgot=$(psql -d "${DB}" -X -A -t -q -c "select set_config('test.uid','${ISTAFF}',false);" -c "set role authenticated; insert into public.intern_stamps (user_id,task_id,stamped_on) values ('${ISTAFF}','T2627-02','2026-10-02');" 2>&1 || true)
if echo "${isgot}" | grep -qi "row-level security"; then
  echo "  ok   Internship team 的幹部蓋不了章（intern 自己蓋，Paul 2026-10-15）"; pass=$((pass+1))
else
  echo "  FAIL Internship team 的幹部居然蓋得了章：${isgot}"; fail=$((fail+1))
fi
chkrole authenticated "${PAUL}" "Co-President 也看得到進度牆" "1" "select count(*) from public.intern_stamps"
chkrole authenticated "${OTHER}" "★ 別的 team 的幹部一列都看不到（格子、章、intern 的名字）" "0|0|0" \
  "select (select count(*) from public.intern_tasks)||'|'||(select count(*) from public.intern_stamps)||'|'||(select count(*) from public.profiles where role='intern')"
chkrole authenticated "${INT1}" "★ intern 讀不到幹部護照那邊的邀請碼或申請" "0" \
  "select count(*) from public.applications"
chkas "${INT1}" "intern 拿幹部碼會變幹部（正常升級）" "upgraded" "select public.claim_invite('BT-CADRE')"
chk "變幹部之後有幹部護照了" "1" "select count(*) from public.passports where id='${INT1}'"
chkrole authenticated "${INT1}" "★ 變幹部之後讀不到實習護照（一個人同一時間只有一種身分）" "0" \
  "select count(*) from public.intern_passports where id='${INT1}'"
ipgot=$(psql -d "${DB}" -X -A -t -q -f supabase/migrations/2026-10-17-intern-passport.sql 2>&1 || true)
if echo "${ipgot}" | grep -q "OVERALL.*PASS" && ! echo "${ipgot}" | grep -q "FAIL"; then
  echo "  ok   實習護照那支遷移檔的驗收表全部 PASS（重跑）"; pass=$((pass+1))
else
  echo "  FAIL 實習護照那支遷移檔的驗收表沒全過："; echo "${ipgot}" | grep -i "FAIL\|error" | head -5; fail=$((fail+1))
fi
chk "刪帳號時實習護照、章、心得跟著消失" "0|0|0" \
  "delete from auth.users where id='${INT2}';
   select (select count(*) from public.intern_passports where id='${INT2}')||'|'||(select count(*) from public.intern_stamps where user_id='${INT2}')||'|'||(select count(*) from public.intern_entries where user_id='${INT2}')"

echo
echo "實習護照的後台（2026-10-18）："
# 上面那一段刪了 INT2、INT1 變成幹部了。ISTAFF（Internship team 的幹部）、OTHER（別組）、PAUL 還在。
chkas "${ISTAFF}" "Internship team 的幹部開得了新的一屆" "2027-28" \
  "select public.save_intern_term('2027-28','2027-28 實習','INTERNSHIP 2027-28','2027-09-01','2028-07-31')"
chk "新的一屆還不是 active（開屆與設成目前是兩個動作）" "f" "select active from public.intern_terms where id='2027-28'"
chkraise "起訖日反過來會被擋" "bad_dates" \
  "perform set_config('test.uid','${ISTAFF}',true); perform public.save_intern_term('2028-29','x','X','2029-01-01','2028-01-01');"
chkraise "屆別 id 有空白會被擋" "bad_term_id" \
  "perform set_config('test.uid','${ISTAFF}',true); perform public.save_intern_term('2028 29','x','X','2028-09-01','2029-07-31');"
chkas "${ISTAFF}" "改既有那一屆的標題" "2026-27" \
  "select public.save_intern_term('2026-27','2026-27 第一屆','INTERNSHIP 2026-27','2026-09-01','2027-07-31')"
chk "標題改了，active 沒被動到" "2026-27第一屆|true" "select title_zh||'|'||active from public.intern_terms where id='2026-27'"
chkas "${PAUL}" "Co-President 設成目前這一屆" "2027-28" "select public.activate_intern_term('2027-28')"
chk "★ 只有一屆 active，而且是新的那一屆" "2027-28" "select id from public.intern_terms where active"
chkraise "設一個不存在的屆會講出來" "no_such_term" \
  "perform set_config('test.uid','${PAUL}',true); perform public.activate_intern_term('1999-00');"
chkas "${PAUL}" "切回去" "2026-27" "select public.activate_intern_term('2026-27')"

chkas "${ISTAFF}" "加一格" "T2627-10" \
  "select public.save_intern_task('T2627-10','2026-27',10,'project','第二個任務','SECOND TASK','交出第二個')"
chkas "${ISTAFF}" "改同一格的標題（id 不變）" "T2627-10" \
  "select public.save_intern_task('T2627-10','2026-27',10,'project','第二個任務（改）','SECOND TASK','  交出第二個  ')"
chk "改到了，說明前後空白去掉了" "第二個任務（改）|交出第二個" \
  "select title_zh||'|'||description from public.intern_tasks where id='T2627-10'"
chkraise "★ 既有的格子換不了屆" "term_locked" \
  "perform set_config('test.uid','${ISTAFF}',true); perform public.save_intern_task('T2627-10','2027-28',10,'project','x','X',null);"
chkraise "分類亂填會被擋" "bad_category" \
  "perform set_config('test.uid','${ISTAFF}',true); perform public.save_intern_task('T2627-11','2026-27',11,'party','x','X',null);"
chkraise "標題留白會被擋" "empty_title" \
  "perform set_config('test.uid','${ISTAFF}',true); perform public.save_intern_task('T2627-11','2026-27',11,'project','  ','X',null);"
chkas "${ISTAFF}" "停用一格" "f" "select public.set_intern_task_active('T2627-10', false)"
chk "停用了" "f" "select active from public.intern_tasks where id='T2627-10'"
chkas "${ISTAFF}" "恢復" "t" "select public.set_intern_task_active('T2627-10', true)"
chkas "${ISTAFF}" "沒人蓋過的格子刪得掉" "T2627-10" "select public.delete_intern_task('T2627-10')"
chk "真的刪了" "0" "select count(*) from public.intern_tasks where id='T2627-10'"
# T2627-01 在上一段被 INT1 蓋過（他現在是幹部了，章還在）。
chkraise "★ 蓋過的格子刪不掉，只能停用" "has_stamps" \
  "perform set_config('test.uid','${ISTAFF}',true); perform public.delete_intern_task('T2627-01');"
chk "那一格與那個章都還在" "1|1" \
  "select (select count(*) from public.intern_tasks where id='T2627-01')||'|'||(select count(*) from public.intern_stamps where task_id='T2627-01')"
chkraise "★ 別的 team 的幹部改不了格子" "not_internship_team" \
  "perform set_config('test.uid','${OTHER}',true); perform public.save_intern_task('T2627-12','2026-27',12,'project','x','X',null);"
chkraise "★ 別的 team 的幹部開不了屆" "not_internship_team" \
  "perform set_config('test.uid','${OTHER}',true); perform public.save_intern_term('2028-29','x','X','2028-09-01','2029-07-31');"
chkraise "★ 一般幹部停用不了格子" "not_internship_team" \
  "perform set_config('test.uid','${MEMBER}',true); update public.profiles set role='cadre' where id='${MEMBER}'; perform public.set_intern_task_active('T2627-01', false);"
itgot=$(psql -d "${DB}" -X -A -t -q -c "select set_config('test.uid','${ISTAFF}',false);" -c "set role authenticated; insert into public.intern_tasks (id,term,seq,category,title_zh,title_en) values ('T2627-99','2026-27',99,'project','x','X');" 2>&1 || true)
if echo "${itgot}" | grep -qi "permission denied"; then
  echo "  ok   ★ 繞過函式直接 insert 會被擋（表本身沒有寫入權限）"; pass=$((pass+1))
else
  echo "  FAIL ★ 直接 insert 居然成功：${itgot}"; fail=$((fail+1))
fi
iagot=$(psql -d "${DB}" -X -A -t -q -c "set role anon; select public.save_intern_task('T2627-99','2026-27',99,'project','x','X',null);" 2>&1 || true)
if echo "${iagot}" | grep -qi "permission denied"; then
  echo "  ok   ★ 沒登入叫不動"; pass=$((pass+1))
else
  echo "  FAIL ★ 沒登入居然叫得動：${iagot}"; fail=$((fail+1))
fi
iagot=$(psql -d "${DB}" -X -A -t -q -f supabase/migrations/2026-10-18-intern-admin.sql 2>&1 || true)
if echo "${iagot}" | grep -q "OVERALL.*PASS" && ! echo "${iagot}" | grep -q "FAIL"; then
  echo "  ok   後台那支遷移檔的驗收表全部 PASS（重跑）"; pass=$((pass+1))
else
  echo "  FAIL 後台那支遷移檔的驗收表沒全過："; echo "${iagot}" | grep -i "FAIL\|error" | head -5; fail=$((fail+1))
fi

echo
echo "幹部護照的後台（2026-10-20）："
# PAUL 是 Co-President，OTHER 與 MEMBER 不是。預先放了 9 月三格與兩個城市。
chkas "${PAUL}" "Co-President 加一格：編號由系統算（09 月第四格是 09D）" "09D" \
  "select public.save_activity(null,9,'prompt','新的一題','NEW PROMPT','  寫三句  ',false,null)"
chk "seq 跟著月份表走（9 月是 1），說明前後空白去掉了" "1|寫三句|true" \
  "select seq||'|'||description||'|'||active from public.activities where id='09D'"
chkas "${PAUL}" "改同一格的標題（編號不變）" "09D" \
  "select public.save_activity('09D',9,'prompt','改過的一題','NEW PROMPT','寫三句',false,'09B')"
chk "改到了，回望指到 09B" "改過的一題|09B" "select title_zh||'|'||callback_to from public.activities where id='09D'"
chkraise "★ 既有的格子換不了月份" "month_locked" \
  "perform set_config('test.uid','${PAUL}',true); perform public.save_activity('09D',10,'prompt','x','X',null,false,null);"
chkraise "回望指向不存在的格子會被擋" "bad_callback" \
  "perform set_config('test.uid','${PAUL}',true); perform public.save_activity('09D',9,'prompt','x','X',null,false,'13Z');"
chkraise "回望指向自己會被擋" "bad_callback" \
  "perform set_config('test.uid','${PAUL}',true); perform public.save_activity('09D',9,'prompt','x','X',null,false,'09D');"
chkraise "月份不在 11 個月裡會被擋" "bad_month" \
  "perform set_config('test.uid','${PAUL}',true); perform public.save_activity(null,8,'prompt','x','X',null,false,null);"
chkraise "分類亂填會被擋" "bad_category" \
  "perform set_config('test.uid','${PAUL}',true); perform public.save_activity(null,9,'party','x','X',null,false,null);"
chkraise "標題留白會被擋" "empty_title" \
  "perform set_config('test.uid','${PAUL}',true); perform public.save_activity(null,9,'frame','  ','X',null,false,null);"
chkas "${PAUL}" "停用一格" "f" "select public.set_activity_active('09D', false)"
chk "停用了" "f" "select active from public.activities where id='09D'"
chkas "${PAUL}" "恢復" "t" "select public.set_activity_active('09D', true)"
chkraise "★ 被別格回望的格子刪不掉" "has_callback" \
  "perform set_config('test.uid','${PAUL}',true); perform public.delete_activity('09B');"
chkas "${PAUL}" "沒人蓋過、沒人回望的格子刪得掉" "09D" "select public.delete_activity('09D')"
chk "真的刪了" "0" "select count(*) from public.activities where id='09D'"
chk "放一個章在 09A，一則心得在 09C" "1|1" \
  "insert into public.stamps (user_id,act_id,stamped_on) values ('${DIR}','09A','2026-09-20');
   insert into public.entries (user_id,act_id,note) values ('${DIR}','09C','只有我看得到');
   select (select count(*) from public.stamps where act_id='09A')||'|'||(select count(*) from public.entries where act_id='09C')"
chkraise "★ 蓋過的格子刪不掉，只能停用" "has_stamps" \
  "perform set_config('test.uid','${PAUL}',true); perform public.delete_activity('09A');"
chkraise "★ 只寫過心得還沒蓋章的格子也刪不掉" "has_stamps" \
  "perform set_config('test.uid','${PAUL}',true); perform public.delete_activity('09C');"
chk "那兩格與章、心得都還在" "2|1|1" \
  "select (select count(*) from public.activities where id in ('09A','09C'))||'|'||(select count(*) from public.stamps)||'|'||(select count(*) from public.entries)"
chkas "${PAUL}" "改 9 月的時刻" "1" "select public.save_month_theme(1,' 07:30 ','')"
chk "改到了，seq 與 month 沒動" "07:30|9" "select theme_zh||'|'||month from public.months where seq=1"
chkraise "改不存在的月份會講出來" "no_such_month" \
  "perform set_config('test.uid','${PAUL}',true); perform public.save_month_theme(12,'x','');"
chkas "${PAUL}" "加一個城市：代碼轉大寫" "NRT" "select public.save_destination(' nrt ','TOKYO',true)"
chkas "${PAUL}" "停用一個城市" "LAX" "select public.save_destination('LAX','LOS ANGELES',false)"
chk "停用了，列還在" "false|3" "select (select active::text from public.destinations where code='LAX')||'|'||(select count(*) from public.destinations)"
chkraise "城市代碼有空白或太長會被擋" "bad_code" \
  "perform set_config('test.uid','${PAUL}',true); perform public.save_destination('NEW YORK','x',true);"
chkraise "城市名字留白會被擋" "empty_city" \
  "perform set_config('test.uid','${PAUL}',true); perform public.save_destination('JFK','  ',true);"
chkraise "★ Director 改不了格子（沒被派進 passport 工作區）" "not_ws_edit:passport" \
  "perform set_config('test.uid','${OTHER}',true); perform public.save_activity('09A',9,'gather','x','X',null,true,null);"
chkraise "★ 一般幹部停用不了格子" "not_ws_edit:passport" \
  "perform set_config('test.uid','${MEMBER}',true); perform public.set_activity_active('09A', false);"
chkraise "★ 一般幹部加不了城市" "not_ws_edit:passport" \
  "perform set_config('test.uid','${MEMBER}',true); perform public.save_destination('SYD','SYDNEY',true);"
pagot=$(psql -d "${DB}" -X -A -t -q -c "select set_config('test.uid','${PAUL}',false);" -c "set role authenticated; update public.activities set title_zh='直接改' where id='09A';" 2>&1 || true)
if echo "${pagot}" | grep -qi "permission denied"; then
  echo "  ok   ★ 連 Co-President 繞過函式直接 update 也會被擋（表本身沒有寫入權限）"; pass=$((pass+1))
else
  echo "  FAIL ★ 直接 update 居然成功：${pagot}"; fail=$((fail+1))
fi
pagot=$(psql -d "${DB}" -X -A -t -q -c "set role anon; select public.save_activity(null,9,'frame','x','X',null,false,null);" 2>&1 || true)
if echo "${pagot}" | grep -qi "permission denied"; then
  echo "  ok   ★ 沒登入叫不動"; pass=$((pass+1))
else
  echo "  FAIL ★ 沒登入居然叫得動：${pagot}"; fail=$((fail+1))
fi
pagot=$(psql -d "${DB}" -X -A -t -q -f supabase/migrations/2026-10-20-passport-admin.sql 2>&1 || true)
if echo "${pagot}" | grep -q "OVERALL.*PASS" && ! echo "${pagot}" | grep -q "FAIL"; then
  echo "  ok   幹部護照後台那支遷移檔的驗收表全部 PASS（重跑）"; pass=$((pass+1))
else
  echo "  FAIL 幹部護照後台那支遷移檔的驗收表沒全過："; echo "${pagot}" | grep -i "FAIL\|error" | head -5; fail=$((fail+1))
fi

echo
echo "人與權限的後台（2026-10-21）："
# PAUL 是 Co-President；DIR 是 Curriculum 的 director；MEMBER 是一般幹部（上一段把他的 role 改回 cadre 了）；OTHER 是 Marketing 的 director。
chkrole authenticated "${MEMBER}" "一般幹部自己改名字照常存得了（沒動 team 不經過守門）" "改名" \
  "update public.profiles set name_zh='改名' where id='${MEMBER}'; select name_zh from public.profiles where id='${MEMBER}'"
chkrole authenticated "${MEMBER}" "一般幹部自己勾普通的 team 照常" "CurriculumTeam,MarketingTeam" \
  "update public.profiles set team='Curriculum Team, Marketing Team' where id='${MEMBER}'; select team from public.profiles where id='${MEMBER}'"
# 2026-10-24 起 team 只是標籤，不再長出權限：10-21 那條 trigger 拆掉了，每個人自己勾得了任何 team，
# 勾進 Internship Team 也不會因此碰得到實習護照（那要靠指派）。
chkrole authenticated "${MEMBER}" "一般幹部自己勾進 Internship Team 存得了（只是標籤）" "CurriculumTeam,InternshipTeam" \
  "update public.profiles set team='Curriculum Team, Internship Team' where id='${MEMBER}'; select team from public.profiles where id='${MEMBER}'"
chkas "${MEMBER}" "★ 勾了 Internship Team 還是碰不到實習護照（沒有指派）" "f" "select public.can_edit('intern-passport')"
chkrole authenticated "${DIR}" "Director 自己換 team 也存得了" "Marketing" \
  "update public.profiles set team='Marketing' where id='${DIR}'; select team from public.profiles where id='${DIR}'"
chkas "${DIR}" "★ 換了標籤之後，管的還是原本那個 team 的申請，不是新標籤的" "true|false" \
  "select public.is_director_of('Curriculum')||'|'||public.is_director_of('Marketing')"
chkrole authenticated "${DIR}" "Director 改名字照常" "小安改" \
  "update public.profiles set name_zh='小安改' where id='${DIR}'; select name_zh from public.profiles where id='${DIR}'"
chkas "${PAUL}" "Co-President 替一般幹部改 team 標籤" "CurriculumTeam" \
  "select public.set_team('${MEMBER}','Curriculum Team')"
chkas "${PAUL}" "Co-President 替 Director 改回去" "Curriculum" "select public.set_team('${DIR}','Curriculum')"
chk "兩筆 team 的變動都記下來了（誰改、改誰、從什麼到什麼）" "2|2" \
  "select (select count(*) from public.role_changes where field='team' and changed_by='${PAUL}')||'|'||(select count(*) from public.role_changes where field='team' and old_value in ('Marketing','Curriculum Team, Internship Team'))"
chkas "${PAUL}" "同一個值再存一次不算變動" "Curriculum" "select public.set_team('${DIR}','Curriculum')"
chk "紀錄還是兩筆" "2" "select count(*) from public.role_changes where field='team'"
chkas "${PAUL}" "Co-President 把 Director 升成 Co-President" "president" "select public.set_board_role('${DIR}','president')"
chk "職位的變動記下來了，連名字一起" "director|president|小安改" \
  "select old_value||'|'||new_value||'|'||target_name from public.role_changes where field='board_role' and target='${DIR}'"
chkas "${PAUL}" "降回 director" "director" "select public.set_board_role('${DIR}','director')"
chkraise "★ 自我降級仍然擋著" "cannot_demote_self" \
  "perform set_config('test.uid','${PAUL}',true); perform public.set_board_role('${PAUL}','member');"
chkraise "★ 學員升不了職位（就算 id 對）" "not_a_cadre" \
  "perform set_config('test.uid','${PAUL}',true); perform public.set_board_role('${STU}','director');"
chkraise "★ Director 改不了別人的職位" "not_president" \
  "perform set_config('test.uid','${OTHER}',true); perform public.set_board_role('${MEMBER}','director');"
chkraise "★ Director 改不了別人的 team" "not_senior" \
  "perform set_config('test.uid','${OTHER}',true); perform public.set_team('${MEMBER}','Marketing');"
chkrole authenticated "${PAUL}" "★ Co-President 讀得到紀錄（職位兩筆、team 兩筆）" "4" "select count(*) from public.role_changes where field in ('board_role','team')"
chkrole authenticated "${DIR}" "★ Director 一筆紀錄都讀不到" "0" "select count(*) from public.role_changes"
chkrole authenticated "${MEMBER}" "每個幹部都讀得到哪幾個 team 會長出權限（設定頁要用）" "InternshipTeam" "select name from public.privileged_teams"
ptgot=$(psql -d "${DB}" -X -A -t -q -c "select set_config('test.uid','${PAUL}',false);" -c "set role authenticated; insert into public.role_changes (target, field, old_value, new_value) values ('${DIR}','team','x','y');" 2>&1 || true)
if echo "${ptgot}" | grep -qi "permission denied"; then
  echo "  ok   ★ 連 Co-President 也寫不進紀錄表（只有函式寫得進去）"; pass=$((pass+1))
else
  echo "  FAIL ★ 直接 insert 紀錄居然成功：${ptgot}"; fail=$((fail+1))
fi
ptgot=$(psql -d "${DB}" -X -A -t -q -c "set role anon; select public.set_team('${MEMBER}','x');" 2>&1 || true)
if echo "${ptgot}" | grep -qi "permission denied"; then
  echo "  ok   ★ 沒登入叫不動"; pass=$((pass+1))
else
  echo "  FAIL ★ 沒登入居然叫得動：${ptgot}"; fail=$((fail+1))
fi
ptgot=$(psql -d "${DB}" -X -A -t -q -f supabase/migrations/2026-10-21-people-admin.sql 2>&1 || true)
if echo "${ptgot}" | grep -q "OVERALL.*PASS" && ! echo "${ptgot}" | grep -q "FAIL"; then
  echo "  ok   人與權限那支遷移檔的驗收表全部 PASS（重跑）"; pass=$((pass+1))
else
  echo "  FAIL 人與權限那支遷移檔的驗收表沒全過："; echo "${ptgot}" | grep -i "FAIL\|error" | head -5; fail=$((fail+1))
fi

echo
echo "實習護照的蛇梯棋（2026-10-22）："
# 上面那幾段：INT1 變成幹部、INT2 刪了。這裡再拿一位新的 intern（INT3）走一遍。
# 目前 active 的是 2026-27（人與權限那一段最後切回去的）。
INT3=88888888-8888-8888-8888-888888888883
psql -d "$DB" -q -v ON_ERROR_STOP=1 <<SQL
insert into auth.users (id,email) values ('$INT3','intern3@example.com');
insert into public.profiles (id,name_zh,role) values ('$INT3','實習三號','student');
SQL
chkas "${INT3}" "學員拿 intern 碼變成 intern" "upgraded_intern" "select public.claim_invite('bt-intern-01')"
# 30 格：3 梯（4→14、9→21、17→26）、3 蛇（16→6、24→13、28→19）、任務格 2、7、30（期末 T2627-06）。共 9 個不是空格。
BOARD='[{"pos":2,"kind":"task","task_id":"T2627-01"},{"pos":4,"kind":"ladder","goes_to":14},{"pos":7,"kind":"task","task_id":"T2627-02"},{"pos":9,"kind":"ladder","goes_to":21},{"pos":16,"kind":"snake","goes_to":6},{"pos":17,"kind":"ladder","goes_to":26},{"pos":24,"kind":"snake","goes_to":13},{"pos":28,"kind":"snake","goes_to":19},{"pos":30,"kind":"task","task_id":"T2627-06"}]'
chkas "${ISTAFF}" "Internship team 的幹部排得了棋盤" "2026-27" \
  "select public.save_board('2026-27', 30, '${BOARD}'::jsonb)"
chk "棋盤 30 格、9 個不是空格的格子、還沒開" "30|9|false" \
  "select size||'|'||(select count(*) from public.intern_squares where term='2026-27')||'|'||active from public.intern_boards where term='2026-27'"
chkraise "★ 梯子往下會被擋" "ladder_must_go_up" \
  "perform set_config('test.uid','${ISTAFF}',true); perform public.save_board('2026-27', 30, '[{\"pos\":10,\"kind\":\"ladder\",\"goes_to\":3}]'::jsonb);"
chkraise "★ 蛇往上會被擋" "snake_must_go_down" \
  "perform set_config('test.uid','${ISTAFF}',true); perform public.save_board('2026-27', 30, '[{\"pos\":10,\"kind\":\"snake\",\"goes_to\":20}]'::jsonb);"
chkraise "★ 最後一格不能是蛇頭" "last_square_cannot_be_snake" \
  "perform set_config('test.uid','${ISTAFF}',true); perform public.save_board('2026-27', 30, '[{\"pos\":30,\"kind\":\"snake\",\"goes_to\":2}]'::jsonb);"
chkraise "★ 任務格綁別屆的格子會被擋" "bad_task" \
  "perform set_config('test.uid','${ISTAFF}',true); perform public.save_board('2026-27', 30, '[{\"pos\":3,\"kind\":\"task\",\"task_id\":\"NOPE\"}]'::jsonb);"
chkraise "★ 別的 team 的幹部排不了棋盤" "not_internship_team" \
  "perform set_config('test.uid','${OTHER}',true); perform public.save_board('2026-27', 30, '[]'::jsonb);"
# 上面幾條被擋的 save_board 不該動到棋盤。
chk "被擋的存檔沒有動到棋盤" "9" "select count(*) from public.intern_squares where term='2026-27'"
chkraise "★ 棋盤沒開之前擲不了" "no_board" \
  "perform set_config('test.uid','${INT3}',true); perform public.roll_dice();"
chkas "${PAUL}" "Co-President 把棋盤打開" "2026-27" "select public.set_board_active('2026-27', true)"
chkraise "★ 沒有章就沒有票，擲不了" "no_ticket" \
  "perform set_config('test.uid','${INT3}',true); perform public.roll_dice();"
chkrole authenticated "${INT3}" "intern 蓋一個章" "1" \
  "insert into public.intern_stamps (user_id,task_id,stamped_on) values ('${INT3}','T2627-03','2026-10-20'); select count(*) from public.intern_stamps where user_id='${INT3}'"
chk "一個章一張票" "1" "select public.intern_tickets('${INT3}','2026-27')"
# ⚠ roll_dice() 要包在子查詢裡只叫一次：寫成 between 的話 Postgres 會把那個運算式展開成兩次呼叫，第二次就 no_ticket。
chkas "${INT3}" "★ 有票就擲得了，骰子在 1 到 6 之間" "t" \
  "select ((r->>'rolled')::int between 1 and 6) from (select public.roll_dice() r) x"
chk "寫了一列紀錄" "1" "select count(*) from public.intern_moves where user_id='${INT3}'"
chk "票用掉了" "0" "select public.intern_tickets('${INT3}','2026-27')"
chk "位置從紀錄算：from 0、to 在 1 到 30 之間" "0|true" \
  "select from_pos||'|'||(to_pos between 1 and 30) from public.intern_moves where user_id='${INT3}' order by id desc limit 1"
chkraise "★ 沒票再擲會被擋" "no_ticket" \
  "perform set_config('test.uid','${INT3}',true); perform public.roll_dice();"
chkraise "★ Internship team 的幹部擲不了（骰子是 intern 的）" "not_intern" \
  "perform set_config('test.uid','${ISTAFF}',true); perform public.roll_dice();"
ibgot=$(psql -d "${DB}" -X -A -t -q -c "select set_config('test.uid','${INT3}',false);" -c "set role authenticated; insert into public.intern_moves (user_id,term,rolled,from_pos,landed,to_pos) values ('${INT3}','2026-27',6,0,6,6);" 2>&1 || true)
if echo "${ibgot}" | grep -qi "permission denied"; then
  echo "  ok   ★ intern 自己寫不進擲骰紀錄（只有 roll_dice 寫得進去）"; pass=$((pass+1))
else
  echo "  FAIL ★ intern 居然寫得進擲骰紀錄：${ibgot}"; fail=$((fail+1))
fi
chkrole authenticated "${INT3}" "intern 讀得到棋盤與自己的紀錄" "9|1" \
  "select (select count(*) from public.intern_squares)||'|'||(select count(*) from public.intern_moves)"
chkrole authenticated "${ISTAFF}" "Internship team 看得到大家的位置" "1" \
  "select count(*) from public.intern_positions() where user_id='${INT3}'"
chkrole authenticated "${OTHER}" "★ 別的 team 的幹部一格都看不到（棋盤、紀錄、位置）" "0|0|0" \
  "select (select count(*) from public.intern_squares)||'|'||(select count(*) from public.intern_moves)||'|'||(select count(*) from public.intern_positions())"
chkraise "★ 棋盤開著的時候改蛇梯會被擋" "board_locked" \
  "perform set_config('test.uid','${ISTAFF}',true); perform public.save_board('2026-27', 30, '[{\"pos\":4,\"kind\":\"ladder\",\"goes_to\":15}]'::jsonb);"
chkas "${ISTAFF}" "棋盤開著還是可以改任務格綁哪一格" "2026-27" \
  "select public.save_board('2026-27', 30, '[{\"pos\":2,\"kind\":\"task\",\"task_id\":\"T2627-02\"},{\"pos\":4,\"kind\":\"ladder\",\"goes_to\":14},{\"pos\":9,\"kind\":\"ladder\",\"goes_to\":21},{\"pos\":16,\"kind\":\"snake\",\"goes_to\":6},{\"pos\":17,\"kind\":\"ladder\",\"goes_to\":26},{\"pos\":24,\"kind\":\"snake\",\"goes_to\":13},{\"pos\":28,\"kind\":\"snake\",\"goes_to\":19},{\"pos\":30,\"kind\":\"task\",\"task_id\":\"T2627-06\"}]'::jsonb)"
# 終點規則：直接把人放到第 29 格（用超級使用者寫一列假紀錄；票 = 3 個章 - 2 次 = 1），
# 再擲一次不管擲到幾都會碰到 30，沒蓋期末就停在 29。
psql -d "$DB" -q -c "insert into public.intern_stamps (user_id,task_id,stamped_on) values ('$INT3','T2627-04','2026-10-21'),('$INT3','T2627-05','2026-10-21');" >/dev/null
psql -d "$DB" -q -c "insert into public.intern_moves (user_id,term,rolled,from_pos,landed,to_pos) values ('$INT3','2026-27',1,28,29,29);" >/dev/null
chkas "${INT3}" "★ 期末成果沒蓋章，走到終點會停在倒數第二格" "29|false" \
  "select (r->>'to_pos')||'|'||(r->>'finished') from (select public.roll_dice() r) x"
chkrole authenticated "${INT3}" "蓋了期末成果" "1" \
  "insert into public.intern_stamps (user_id,task_id,stamped_on) values ('${INT3}','T2627-06','2026-10-22'); select count(*) from public.intern_stamps where user_id='${INT3}' and task_id='T2627-06'"
chkas "${INT3}" "★ 蓋了之後再擲就到終點" "30|true" \
  "select (r->>'to_pos')||'|'||(r->>'finished') from (select public.roll_dice() r) x"
chkraise "到終點之後擲不了" "finished" \
  "perform set_config('test.uid','${INT3}',true); perform public.roll_dice();"
ibgot=$(psql -d "${DB}" -X -A -t -q -c "set role anon; select public.roll_dice();" 2>&1 || true)
if echo "${ibgot}" | grep -qi "permission denied"; then
  echo "  ok   ★ 沒登入叫不動"; pass=$((pass+1))
else
  echo "  FAIL ★ 沒登入居然叫得動：${ibgot}"; fail=$((fail+1))
fi
# 棋子（2026-10-23）：本人選得了、只能選那八個、別人改不了、位置那支函式帶出來。
# ⚠ 上面重跑過 2026-10-17-intern-passport.sql，它的 revoke all 會把 pawn 那一欄的授權收掉；
# 正式站也一樣：重跑 10-17 之後要再跑一次 10-23。這裡先重跑 10-23，順便當它的重跑檢查。
pwgot=$(psql -d "${DB}" -X -A -t -q -f supabase/migrations/2026-10-23-intern-pawn.sql 2>&1 || true)
if echo "${pwgot}" | grep -q "OVERALL.*PASS" && ! echo "${pwgot}" | grep -q "FAIL"; then
  echo "  ok   棋子那支遷移檔的驗收表全部 PASS（重跑）"; pass=$((pass+1))
else
  echo "  FAIL 棋子那支遷移檔的驗收表沒全過："; echo "${pwgot}" | grep -i "FAIL\|error" | head -5; fail=$((fail+1))
fi
chkrole authenticated "${INT3}" "intern 選得了自己的棋子" "cat" \
  "update public.intern_passports set pawn='cat' where id='${INT3}'; select pawn from public.intern_passports where id='${INT3}'"
pwgot=$(psql -d "${DB}" -X -A -t -q -c "select set_config('test.uid','${INT3}',false);" -c "set role authenticated; update public.intern_passports set pawn='mario' where id='${INT3}';" 2>&1 || true)
if echo "${pwgot}" | grep -qi "check constraint"; then
  echo "  ok   ★ 棋子只能是那八個之一"; pass=$((pass+1))
else
  echo "  FAIL ★ 亂填的棋子居然存得進去：${pwgot}"; fail=$((fail+1))
fi
chkrole authenticated "${ISTAFF}" "位置那支函式帶出棋子（別人的棋子才畫得出來）" "cat" \
  "select pawn from public.intern_positions() where user_id='${INT3}'"
chkrole authenticated "${ISTAFF}" "★ Internship team 的幹部改不了 intern 的棋子" "cat" \
  "update public.intern_passports set pawn='bird' where id='${INT3}'; select pawn from public.intern_passports where id='${INT3}'"
ibgot=$(psql -d "${DB}" -X -A -t -q -f supabase/migrations/2026-10-22-intern-board.sql 2>&1 || true)
if echo "${ibgot}" | grep -q "OVERALL.*PASS" && ! echo "${ibgot}" | grep -q "FAIL"; then
  echo "  ok   蛇梯棋那支遷移檔的驗收表全部 PASS（重跑）"; pass=$((pass+1))
else
  echo "  FAIL 蛇梯棋那支遷移檔的驗收表沒全過："; echo "${ibgot}" | grep -i "FAIL\|error" | head -5; fail=$((fail+1))
fi

echo
echo "職級與指派（2026-10-24）："
# 上面為了印驗收表重跑了 10-14 到 10-23 好幾支，它們各自把 claim_invite、is_internship_team、
# 幹部護照五支、set_team 蓋回舊版，10-21 還把 team 的 trigger 建回來。
# 正式站也一樣：**這一支之後再跑任何一支舊的，就要把這一支再跑一次。** 這裡先重跑，順便當它的重跑檢查
# （INT1、NEWB、ISTAFF 是搬資料那一段跑完之後才變成幹部的，重跑要替他們補 people 與職位）。
rwgot=$(psql -d "${DB}" -X -A -t -q -v ON_ERROR_STOP=1 -f supabase/migrations/2026-10-24-ranks-and-workspaces.sql 2>&1 || true)
if echo "${rwgot}" | grep -q "OVERALL.*PASS" && ! echo "${rwgot}" | grep -q "FAIL"; then
  echo "  ok   職級與指派那支遷移檔的驗收表全部 PASS（重跑）"; pass=$((pass+1))
else
  echo "  FAIL 職級與指派那支遷移檔的驗收表沒全過："; echo "${rwgot}" | grep -i "FAIL\|error\|LINE" | head -8; fail=$((fail+1))
fi
chk "重跑補齊了後來才變幹部的人（每位幹部一列 people、一筆職位），而且沒有重複" "t" \
  "select (select count(*) from public.people where profile_id is not null) = (select count(*) from public.profiles where role='cadre')
      and (select count(*) from public.positions where term_id='2026-27') = (select count(*) from public.profiles where role='cadre')"
# 現在的人：PAUL Co-President；DIR Curriculum 的 Director（管 apps:Curriculum、res:Curriculum）；OTHER Marketing 的 Director；
# MEMBER 一般幹部（看 apps:Curriculum Team）；ISTAFF 一般幹部（改 intern-passport）；INT1、NEWB 幹部沒指派；INT3 intern。

# ── Senior Adviser：跟 Co-President 一樣的範圍，除了加人、刪人、改名、改職級 ──
chkas "${PAUL}" "Co-President 把 OTHER 升成 Senior Adviser" "senior_adviser" "select public.set_board_role('${OTHER}','senior_adviser')"
chkas "${OTHER}" "★ Senior Adviser 看得到、改得動每一個工作區（不靠指派）" "true|true|true" \
  "select public.can_edit('apps:Curriculum')||'|'||public.can_edit('passport')||'|'||public.can_manage('intern-passport')"
chkas "${OTHER}" "Senior Adviser 核可得了團隊頁" "t" "select public.set_public_approved('${DIR}', true)"
chkas "${OTHER}" "Senior Adviser 派得了人（把 MEMBER 派進 res:Curriculum 當改）" "edit" "select public.assign('${MEMBER}','res:Curriculum','edit')"
chkraise "★ Senior Adviser 發不了邀請碼" "not_president" \
  "perform set_config('test.uid','${OTHER}',true); perform public.create_invite('bt-sa','cadre',1,null);"
chkraise "★ Senior Adviser 改不了職級" "not_president" \
  "perform set_config('test.uid','${OTHER}',true); perform public.set_board_role('${MEMBER}','director');"
chkraise "★ Senior Adviser 改不了名字" "not_president" \
  "perform set_config('test.uid','${OTHER}',true); perform public.rename_person((select id from public.people where profile_id='${MEMBER}'),'x','y');"
chkraise "★ Senior Adviser 刪不了人" "not_president" \
  "perform set_config('test.uid','${OTHER}',true); perform public.remove_member((select id from public.people where profile_id='${MEMBER}'));"
chkraise "★ Senior Adviser 按不了結束這一屆" "not_president" \
  "perform set_config('test.uid','${OTHER}',true); perform public.end_term('2027-28','x','X','2027-08-01','2028-07-31', array['${OTHER}']::uuid[]);"
chkraise "職級亂填會被擋" "bad_role" \
  "perform set_config('test.uid','${PAUL}',true); perform public.set_board_role('${MEMBER}','boss');"

# ── Associate 沒有指派就什麼都碰不到；「管」才派得了人，而且只限自己那個工作區 ──
chkas "${MEMBER}" "一般幹部：看得到自己 team 的申請、改不動；別的 team 連看都看不到" "true|false|false" \
  "select public.is_on_team('Curriculum Team')||'|'||public.is_director_of('Curriculum Team')||'|'||public.is_on_team('Marketing')"
rwgot=$(psql -d "${DB}" -X -A -t -q -c "select set_config('test.uid','${MEMBER}',false);" -c "set role authenticated; insert into public.resources (title,url,status,team) values ('偷放','https://x','draft','Marketing');" 2>&1 || true)
if echo "${rwgot}" | grep -qi "row-level security"; then
  echo "  ok   ★ 一般幹部放不進沒被派的 team 的資源（RLS）"; pass=$((pass+1))
else
  echo "  FAIL ★ 一般幹部居然放得進別的 team 的資源：${rwgot}"; fail=$((fail+1))
fi
chkrole authenticated "${MEMBER}" "被派成「改」的那個 team 就放得進（res:Curriculum）" "1" \
  "insert into public.resources (title,url,status,team) values ('可以放','https://y','draft','Curriculum'); select count(*) from public.resources where title='可以放'"
chkas "${DIR}" "Director 對自己管的工作區派得了人（MEMBER 升成改）" "edit" "select public.assign('${MEMBER}','apps:Curriculum','edit')"
chkas "${MEMBER}" "派了之後改得動了" "t" "select public.is_director_of('Curriculum')"
chkraise "★ Director 派不了別的 team 的工作區" "not_ws_manage:apps:Marketing" \
  "perform set_config('test.uid','${DIR}',true); perform public.assign('${MEMBER}','apps:Marketing','view');"
chkraise "★ 派不了 intern（只派幹部）" "not_a_cadre" \
  "perform set_config('test.uid','${DIR}',true); perform public.assign('${INT3}','apps:Curriculum','view');"
chkraise "等級亂填會被擋" "bad_level" \
  "perform set_config('test.uid','${DIR}',true); perform public.assign('${MEMBER}','apps:Curriculum','owner');"
chkraise "沒有那個工作區會講出來" "no_such_workspace" \
  "perform set_config('test.uid','${PAUL}',true); perform public.assign('${MEMBER}','apps:Nope','view');"
chkas "${DIR}" "Director 看得到自己工作區裡有誰" "2" "select count(*) from public.workspace_members('apps:Curriculum')"
chkas "${MEMBER}" "★ 一般幹部看不到工作區裡有誰（連自己被派進去的也不行，那是管的事）" "0" "select count(*) from public.workspace_members('apps:Curriculum')"
chkas "${DIR}" "移出去" "t" "select public.unassign('${MEMBER}','apps:Curriculum')"
chkas "${MEMBER}" "移出去之後連看都看不到了" "f" "select public.is_on_team('Curriculum')"
chk "派與移出都記了帳" "t" \
  "select count(*) >= 3 from public.role_changes where field='assignment' and target='${MEMBER}' and changed_by in ('${DIR}','${OTHER}')"
chkas "${DIR}" "my_access()：職級加我所有的工作區（給側欄用）" "director|manage" \
  "select (a->>'rank')||'|'||(select w->>'level' from jsonb_array_elements(a->'workspaces') w where w->>'id'='apps:Curriculum') from (select public.my_access() a) x"
chkas "${PAUL}" "Co-President 開一個新的工作區" "custom:summer-camp" \
  "select public.create_workspace('summer-camp','2027 夏令營','Summer camp 2027','${DIR}')"
chk "擁有人記的是 DIR" "1" "select count(*) from public.workspaces where id='custom:summer-camp' and owner='${DIR}' and kind='custom'"
chkas "${DIR}" "擁有人對那個工作區是管" "t" "select public.can_manage('custom:summer-camp')"
chkraise "工作區代號有大寫或空白會被擋" "bad_slug" \
  "perform set_config('test.uid','${PAUL}',true); perform public.create_workspace('Summer Camp','x','X',null);"

# ── 歷屆名單：人的紀錄可以沒有帳號 ──
chkas "${PAUL}" "補過去的一屆" "2024-25" "select public.create_term('2024-25','2024-25 屆','TERM 2024-25','2024-08-01','2025-07-31')"
chk "補的那一屆是 ended，current 還是 2026-27" "ended|2026-27" \
  "select (select status from public.terms where id='2024-25')||'|'||(select id from public.terms where status='current')"
OLD1=$(psql -d "${DB}" -X -A -t -q -c "select set_config('test.uid','${PAUL}',false);" -c "select public.add_person('老幹部','Old Cadre','平台之前的');" | tail -1 | tr -d ' \n')
chk "名單上加了一筆沒有帳號的人" "1" "select count(*) from public.people where id='${OLD1}' and profile_id is null"
chkas "${PAUL}" "給他 2024-25 的職位" "t" \
  "select public.set_position('${OLD1}','2024-25','Curriculum 的 Director','Director, Curriculum Team','Curriculum Team') > 0"
chkas "${OTHER}" "貼一整屆：同名同姓又沒帳號的那一筆重複使用，不同的人新建" "2" \
  "select public.import_positions('2024-25', '[{\"name_zh\":\"老幹部\",\"name_en\":\"old cadre\",\"title_en\":\"Director, Curriculum Team\",\"team\":\"Curriculum Team\"},{\"name_zh\":\"另一位\",\"name_en\":\"Another One\",\"title_en\":\"Associate, Marketing Team\",\"team\":\"Marketing Team\"}]'::jsonb)"
chk "貼完只多了一個人（老幹部對到既有那一筆）" "1|1" \
  "select (select count(*) from public.people where name_zh='老幹部')||'|'||(select count(*) from public.people where name_zh='另一位')"
chk "2024-25 那一屆兩個人" "2" "select count(*) from public.positions where term_id='2024-25'"
chkrole authenticated "${PAUL}" "★ Co-President 的名單看得到沒帳號的人，標成沒有帳號" "t" \
  "select exists (select 1 from public.roster() where person_id='${OLD1}' and profile_id is null)"
chkrole authenticated "${MEMBER}" "★ 一般幹部叫得動名單但一列都拿不到" "0" "select count(*) from public.roster()"
chkrole authenticated "${MEMBER}" "★ 一般幹部直接查 people 只看得到自己那一列" "1" "select count(*) from public.people"
rwgot=$(psql -d "${DB}" -X -A -t -q -c "set role anon; select count(*) from public.people;" 2>&1 || true)
if echo "${rwgot}" | grep -qi "permission denied"; then
  echo "  ok   ★ 沒登入讀不到 people"; pass=$((pass+1))
else
  echo "  FAIL ★ 沒登入居然讀得到 people：${rwgot}"; fail=$((fail+1))
fi
chkas "${PAUL}" "綁著那一筆的校友碼" "bt-old-01" "select public.create_invite_for('${OLD1}','bt-old-01','給老幹部')"
chk "一律 alumni、只能用一次、綁著那一筆" "1|alumni|true" \
  "select uses_left||'|'||grants||'|'||(person_id='${OLD1}') from public.invite_codes where code='bt-old-01'"
chkraise "同一筆還有沒用掉的碼就不再發" "has_unused_invite" \
  "perform set_config('test.uid','${PAUL}',true); perform public.create_invite_for('${OLD1}','bt-old-02',null);"
chkrole authenticated "${PAUL}" "名單上看得到那組還沒用的碼" "bt-old-01" "select pending_code from public.roster() where person_id='${OLD1}'"
OLDU=aaaaaaaa-1111-1111-1111-111111111111
OLDV=aaaaaaaa-1111-1111-1111-111111111112
psql -d "${DB}" -q -c "insert into auth.users (id,email) values ('${OLDU}','old@example.com'),('${OLDV}','other-old@example.com');
  insert into public.profiles (id,name_zh,role) values ('${OLDU}','老幹部本人','student'),('${OLDV}','不是他','student');" >/dev/null
chkas "${OLDU}" "★ 他拿那組碼註冊：變校友，而且認領了那一筆" "upgraded_alumni" "select public.claim_invite('bt-old-01')"
chk "紀錄歸到他身上，歷屆職位跟著來，沒有多出第二筆" "t" \
  "select (select profile_id from public.people where id='${OLD1}') = '${OLDU}'
      and (select count(*) from public.positions where person_id='${OLD1}' and term_id='2024-25') = 1
      and (select count(*) from public.people where profile_id='${OLDU}') = 1"
chk "認領記了帳" "1" "select count(*) from public.role_changes where field='claimed' and target='${OLDU}'"
# 把那組碼的次數手動加回 1，模擬「碼被轉手」：第二個人拿到也認不了那一筆。
psql -d "${DB}" -q -c "update public.invite_codes set uses_left=1 where code='bt-old-01';" >/dev/null
chkraise "★ 已經被認走的紀錄，第二個人拿到碼也認不了" "record_claimed" \
  "perform set_config('test.uid','${OLDV}',true); perform public.claim_invite('bt-old-01');"
chk "整筆回滾：碼沒被燒掉、那個人還是學員" "1|student" \
  "select (select uses_left from public.invite_codes where code='bt-old-01')||'|'||(select role from public.profiles where id='${OLDV}')"
# 兩筆像同一個人：合併
DUP=$(psql -d "${DB}" -X -A -t -q -c "select set_config('test.uid','${PAUL}',false);" -c "select public.add_person('另一位','another one',null);" | tail -1 | tr -d ' \n')
chkrole authenticated "${PAUL}" "名單提示「可能是同一個人」（英文名不分大小寫）" "t" \
  "select '${DUP}' = any(maybe_dup) from public.roster() where name_en='Another One' and person_id<>'${DUP}'"
KEEP=$(psql -d "${DB}" -X -A -t -q -c "select id from public.people where name_en='Another One';" | tr -d ' \n')
chkas "${PAUL}" "合併：留下的那一筆回來" "${KEEP}" "select public.merge_people('${KEEP}','${DUP}')"
chk "職位還在留下的那一筆上，另一筆刪掉了" "1|0" \
  "select (select count(*) from public.positions where person_id='${KEEP}')||'|'||(select count(*) from public.people where id='${DUP}')"
chkraise "兩筆都有帳號就不合併" "both_have_accounts" \
  "perform set_config('test.uid','${PAUL}',true); perform public.merge_people((select id from public.people where profile_id='${DIR}'),(select id from public.people where profile_id='${MEMBER}'));"
chkas "${PAUL}" "Co-President 改名：people 與 profiles 一起改" "小安新|小安新" \
  "select public.rename_person((select id from public.people where profile_id='${DIR}'),'小安新','An Hsiao') ; select (select name_zh from public.profiles where id='${DIR}')||'|'||(select name_zh from public.people where profile_id='${DIR}')"
chkrole anon "" "★ 對外團隊頁：兩把鑰匙都轉、這一屆有職位的人，頭銜從職位算" "小安新|Director,Curriculum|2026-27" \
  "select name_zh||'|'||title_en||'|'||term from public.public_team()"
chkrole anon "" "★ 沒有帳號的人不會出現在對外頁" "0" "select count(*) from public.public_team() where name_zh='另一位'"
psql -d "${DB}" -q -c "insert into public.alumni_stories (id,county,public_story,story_approved,quote) values ('${MEMBER}','台北',true,true,'一句話');" >/dev/null
chkrole anon "" "校友頁多一欄：最後一屆的職位 · 屆別" "Associate,Curriculum·2026-27" \
  "select title from public.public_alumni() where name='改名'"

# ── 刪除成員與結束這一屆（只有 Co-President）──
chkraise "★ 不能刪自己" "cannot_remove_self" \
  "perform set_config('test.uid','${PAUL}',true); perform public.remove_member((select id from public.people where profile_id='${PAUL}'));"
chkas "${PAUL}" "刪除成員：登入帳號沒了，護照跟著沒了，名單上那一筆留著標成沒有帳號" "0|0|1" \
  "select public.remove_member((select id from public.people where profile_id='${NEWB}'));
   select (select count(*) from auth.users where id='${NEWB}')||'|'||(select count(*) from public.passports where id='${NEWB}')||'|'||(select count(*) from public.people where name_zh='新幹部' and profile_id is null)"
chk "刪人記了帳，名字在紀錄裡" "新幹部" "select target_name from public.role_changes where field='removed' and old_value='cadre'"
chkraise "刪名單上的紀錄：有帳號的不行" "has_account" \
  "perform set_config('test.uid','${PAUL}',true); perform public.delete_person((select id from public.people where profile_id='${DIR}'));"
chkas "${PAUL}" "沒帳號的紀錄刪得掉" "t" "select public.delete_person((select id from public.people where name_zh='新幹部'))"
chkraise "★ 結束這一屆：自己不在留下的名單裡會被擋" "must_keep_self" \
  "perform set_config('test.uid','${PAUL}',true); perform public.end_term('2027-28','x','X','2027-08-01','2028-07-31', array['${DIR}']::uuid[]);"
chkraise "屆別代號格式不對會被擋" "bad_term_id" \
  "perform set_config('test.uid','${PAUL}',true); perform public.end_term('next','x','X','2027-08-01','2028-07-31', array['${PAUL}']::uuid[]);"
chk "還沒結束：current 還是 2026-27，沒有人變校友" "2026-27|0" \
  "select (select id from public.terms where status='current')||'|'||(select count(*) from public.role_changes where field='role')"
chkas "${PAUL}" "★ 結束這一屆：留 PAUL、DIR、OTHER、ISTAFF，其他變校友" "2026-27|2027-28|4|2" \
  "select (r->>'ended')||'|'||(r->>'term')||'|'||(r->>'kept')||'|'||(r->>'alumni') from (select public.end_term('2027-28','2027-28 屆','TERM 2027-28','2027-08-01','2028-07-31', array['${PAUL}','${DIR}','${OTHER}','${ISTAFF}']::uuid[]) r) x"
chk "沒留下的：role 變 alumni、職級歸零、指派清掉、團隊頁下架、職位紀錄留著" "alumni|member|0|false|1" \
  "select role||'|'||board_role||'|'||(select count(*) from public.assignments where user_id='${MEMBER}')||'|'||public_approved||'|'||(select count(*) from public.positions po join public.people pe on pe.id=po.person_id where pe.profile_id='${MEMBER}' and term_id='2026-27') from public.profiles where id='${MEMBER}'"
chk "留下的：2027-28 複製了一筆職位、指派沒動、職級沒動" "1|manage|senior_adviser" \
  "select (select count(*) from public.positions po join public.people pe on pe.id=po.person_id where pe.profile_id='${DIR}' and term_id='2027-28')||'|'||(select level from public.assignments where user_id='${DIR}' and workspace_id='apps:Curriculum')||'|'||(select board_role from public.profiles where id='${OTHER}')"
chk "屆別切過去了，舊的一屆是 ended" "2027-28|ended" \
  "select (select id from public.terms where status='current')||'|'||(select status from public.terms where id='2026-27')"
chkas "${MEMBER}" "★ 變校友之後什麼工作區都碰不到" "false|false" "select public.can_view('apps:Curriculum')||'|'||public.is_cadre()"
chkrole anon "" "★ 團隊頁只剩這一屆的人（小安新還在，一般幹部不在）" "1" "select count(*) from public.public_team()"
chkrole anon "" "校友頁的頭銜還在（職位紀錄沒刪）" "Associate,Curriculum·2026-27" \
  "select title from public.public_alumni() where name='改名'"
chk "換屆記了帳（每一位變校友的各一筆，加一筆屆別）" "2|1" \
  "select (select count(*) from public.role_changes where field='role' and new_value='alumni')||'|'||(select count(*) from public.role_changes where field='term' and old_value='2026-27')"
chkraise "同一個屆別代號不能再結束一次" "term_exists" \
  "perform set_config('test.uid','${PAUL}',true); perform public.end_term('2026-27','x','X','2028-08-01','2029-07-31', array['${PAUL}']::uuid[]);"
rwgot=$(psql -d "${DB}" -X -A -t -q -c "set role anon; select count(*) from public.roster();" 2>&1 || true)
if echo "${rwgot}" | grep -qi "permission denied"; then
  echo "  ok   ★ 沒登入叫不動名單"; pass=$((pass+1))
else
  echo "  FAIL ★ 沒登入居然叫得動名單：${rwgot}"; fail=$((fail+1))
fi
rwgot=$(psql -d "${DB}" -X -A -t -q -c "select set_config('test.uid','${PAUL}',false);" -c "set role authenticated; insert into public.assignments (user_id,workspace_id,level) values ('${DIR}','passport','manage');" 2>&1 || true)
if echo "${rwgot}" | grep -qi "permission denied"; then
  echo "  ok   ★ 連 Co-President 也寫不進指派表（只有 assign 寫得進去）"; pass=$((pass+1))
else
  echo "  FAIL ★ 直接 insert 指派居然成功：${rwgot}"; fail=$((fail+1))
fi

# ── 破壞測試：把 Co-President 的門拿掉，驗收表要變紅 ──
# 一條只會變綠的驗收表等於沒有驗收表。這裡把遷移檔裡每一句 require_president() 拿掉再跑一次，
# 第 2 項（人的管理七支的門）與 OVERALL 要變 FAIL；然後把真的那一支跑回來。
BROKEN=$(mktemp -t bt-broken-XXXXXX.sql)
# 只換行首的那幾句（函式本文），不換驗收表裡那一句比對用的字串，不然驗收表會跟著一起壞、看起來還是綠的。
sed 's/^  perform public.require_president();/  perform public.require_senior();/' supabase/migrations/2026-10-24-ranks-and-workspaces.sql > "${BROKEN}"
rwgot=$(psql -d "${DB}" -X -A -t -q -f "${BROKEN}" 2>&1 || true)
rm -f "${BROKEN}"
if echo "${rwgot}" | grep -q "OVERALL.*FAIL" && echo "${rwgot}" | grep "人的管理七支" | grep -q "FAIL"; then
  echo "  ok   ★ 破壞測試：拿掉 Co-President 的門，驗收表第 2 項與 OVERALL 變紅"; pass=$((pass+1))
else
  echo "  FAIL ★ 破壞測試：門拿掉了驗收表還是綠的（驗收表守不住）"; echo "${rwgot}" | grep -i "OVERALL\|七支\|error" | head -5; fail=$((fail+1))
fi
rwgot=$(psql -d "${DB}" -X -A -t -q -f supabase/migrations/2026-10-24-ranks-and-workspaces.sql 2>&1 || true)
if echo "${rwgot}" | grep -q "OVERALL.*PASS" && ! echo "${rwgot}" | grep -q "FAIL"; then
  echo "  ok   真的那一支跑回來，驗收表又全部 PASS"; pass=$((pass+1))
else
  echo "  FAIL 跑回來之後驗收表沒全過："; echo "${rwgot}" | grep -i "FAIL\|error" | head -5; fail=$((fail+1))
fi
chkraise "門回來了：Senior Adviser 又刪不了人" "not_president" \
  "perform set_config('test.uid','${OTHER}',true); perform public.remove_member((select id from public.people where profile_id='${DIR}'));"

echo
echo "拿掉搬走的東西（2026-10-25）："
# 批 3：drop public_title 與 privileged_teams。先確認 public_title 的值真的在職位裡，再 drop。
psql -d "${DB}" -q -c "update public.profiles set public_title='Treasurer 2026-27' where id='${ISTAFF}';" >/dev/null
rwgot=$(psql -d "${DB}" -X -A -t -q -f supabase/migrations/2026-10-24-ranks-and-workspaces.sql 2>&1 || true)
chk "搬值：後來才填的 public_title 不會蓋掉已經有的職位（搬過就不再搬）" "Associate,CurriculumTeam" \
  "select title_en from public.positions po join public.people pe on pe.id=po.person_id where pe.profile_id='${ISTAFF}' and term_id='2027-28'"
rwgot=$(psql -d "${DB}" -X -A -t -q -v ON_ERROR_STOP=1 -f supabase/migrations/2026-10-25-drop-public-title.sql 2>&1 || true)
if echo "${rwgot}" | grep -q "OVERALL.*PASS" && ! echo "${rwgot}" | grep -q "FAIL"; then
  echo "  ok   drop 那支遷移檔跑過，驗收表全部 PASS"; pass=$((pass+1))
else
  echo "  FAIL drop 那支遷移檔沒過："; echo "${rwgot}" | grep -i "FAIL\|error\|LINE" | head -6; fail=$((fail+1))
fi
chk "★ public_title 與 privileged_teams 真的不在了" "0|0" \
  "select (select count(*) from information_schema.columns where table_name='profiles' and column_name='public_title')||'|'||(select count(*) from pg_tables where tablename='privileged_teams')"
chkrole anon "" "團隊頁還是讀得到（頭銜從職位來，不靠那一欄）" "1" "select count(*) from public.public_team()"
chkrole authenticated "${MEMBER}" "設定頁：變校友的人改 team 標籤照常存得了（沒有 trigger 了）" "MarketingTeam" \
  "update public.profiles set team='Marketing Team' where id='${MEMBER}'; select team from public.profiles where id='${MEMBER}'"
# ⚠ drop 之後重跑 10-24 一定要還跑得過（舊遷移檔被重跑之後就得重跑它），它讀 public_title 那幾句是動態 SQL。
rwgot=$(psql -d "${DB}" -X -A -t -q -v ON_ERROR_STOP=1 -f supabase/migrations/2026-10-24-ranks-and-workspaces.sql 2>&1 || true)
if echo "${rwgot}" | grep -q "OVERALL.*PASS" && ! echo "${rwgot}" | grep -q "FAIL"; then
  echo "  ok   ★ public_title 不在了之後，10-24 那支重跑還是全部 PASS"; pass=$((pass+1))
else
  echo "  FAIL ★ public_title 不在了之後 10-24 重跑壞掉："; echo "${rwgot}" | grep -i "FAIL\|error\|LINE" | head -6; fail=$((fail+1))
fi
rwgot=$(psql -d "${DB}" -X -A -t -q -f supabase/migrations/2026-10-25-drop-public-title.sql 2>&1 || true)
if echo "${rwgot}" | grep -q "OVERALL.*PASS"; then
  echo "  ok   drop 那支可以重跑"; pass=$((pass+1))
else
  echo "  FAIL drop 那支重跑沒過："; echo "${rwgot}" | grep -i "FAIL\|error" | head -4; fail=$((fail+1))
fi

echo
echo "同一屆好幾個職位、人的 email（2026-10-26）："
rwgot=$(psql -d "${DB}" -X -A -t -q -v ON_ERROR_STOP=1 -f supabase/migrations/2026-10-26-multi-positions.sql 2>&1 || true)
if echo "${rwgot}" | grep -q "OVERALL.*PASS" && ! echo "${rwgot}" | grep -q "FAIL"; then
  echo "  ok   多職位那支遷移檔跑過，驗收表全部 PASS"; pass=$((pass+1))
else
  echo "  FAIL 多職位那支遷移檔沒過："; echo "${rwgot}" | grep -i "FAIL\|error\|LINE" | head -6; fail=$((fail+1))
fi
# 現在 current 是 2027-28。DIR 在 2027-28 有一筆（從 2026-27 複製的，team Curriculum）。
DIRP=$(psql -d "${DB}" -X -A -t -q -c "select id from public.people where profile_id='${DIR}';" | tr -d ' \n')
chkas "${PAUL}" "同一屆再加一個別的 team 的職位（Sponsorship 的 Adviser）" "t" \
  "select public.set_position('${DIRP}','2027-28','Sponsorship 的 Adviser','Adviser, Sponsorship Team','Sponsorship Team') > 0"
chk "★ 同一屆兩筆都在" "2" "select count(*) from public.positions where person_id='${DIRP}' and term_id='2027-28'"
chkas "${PAUL}" "同一個 team 再存一次是改，不是第三筆" "t" \
  "select public.set_position('${DIRP}','2027-28','', 'Director, Curriculum Team (v2)','Curriculum') > 0"
chk "還是兩筆，Curriculum 那一筆的名稱改了" "2|Director,CurriculumTeam(v2)" \
  "select count(*)||'|'||(select title_en from public.positions where person_id='${DIRP}' and term_id='2027-28' and team='Curriculum') from public.positions where person_id='${DIRP}' and term_id='2027-28'"
chkrole anon "" "★ 團隊頁一筆職位一列：小安新在兩個 team 各出現一次、各印自己的頭銜" "2|Adviser,SponsorshipTeam" \
  "select count(*)||'|'||(select title_en from public.public_team() where team='Sponsorship Team') from public.public_team() where name_zh='小安新'"
chkas "${PAUL}" "刪掉其中一筆（指定 team）" "t" "select public.delete_position('${DIRP}','2027-28','Sponsorship Team')"
chk "剩一筆" "1" "select count(*) from public.positions where person_id='${DIRP}' and term_id='2027-28'"
chkas "${PAUL}" "貼一整屆：同一個人兩行、兩個 team，變成兩筆不是被擋" "2" \
  "select public.import_positions('2024-25', '[{\"name_zh\":\"兼兩個\",\"name_en\":\"Two Hats\",\"title_en\":\"Adviser, Sponsorship Team\",\"team\":\"Sponsorship Team\"},{\"name_zh\":\"兼兩個\",\"name_en\":\"two hats\",\"title_en\":\"Associate, Curriculum Team\",\"team\":\"Curriculum Team\"}]'::jsonb)"
chk "一個人、兩筆職位" "1|2" \
  "select (select count(*) from public.people where name_zh='兼兩個')||'|'||(select count(*) from public.positions po join public.people pe on pe.id=po.person_id where pe.name_zh='兼兩個')"
psql -d "${DB}" -q -c "update public.alumni_stories set public_story=true, story_approved=true where id='${MEMBER}';" >/dev/null
chkrole anon "" "校友頁的頭銜：最後一屆的職位全部接起來" "Associate,Curriculum·2026-27" "select title from public.public_alumni() where name='改名'"
chkas "${PAUL}" "★ Co-President 拿得到一個人註冊用的 email" "director@example.com" "select public.person_email('${DIRP}')"
chkas "${OTHER}" "Senior Adviser 也拿得到" "director@example.com" "select public.person_email('${DIRP}')"
chkas "${ISTAFF}" "★ 一般幹部拿不到（空的）" "" "select coalesce(public.person_email('${DIRP}'),'')"
chk "沒有帳號的人回空的" "" "select coalesce(public.person_email((select id from public.people where name_zh='兼兩個')),'')"
rwgot=$(psql -d "${DB}" -X -A -t -q -c "set role anon; select public.person_email('${DIRP}');" 2>&1 || true)
if echo "${rwgot}" | grep -qi "permission denied"; then
  echo "  ok   ★ 沒登入叫不動 person_email"; pass=$((pass+1))
else
  echo "  FAIL ★ 沒登入居然叫得動 person_email：${rwgot}"; fail=$((fail+1))
fi
rwgot=$(psql -d "${DB}" -X -A -t -q -f supabase/migrations/2026-10-24-ranks-and-workspaces.sql 2>&1 || true)
if echo "${rwgot}" | grep -q "OVERALL.*PASS" && ! echo "${rwgot}" | grep -q "FAIL"; then
  echo "  ok   多職位之後 10-24 重跑還是全部 PASS（數的是有職位的人不是筆數）"; pass=$((pass+1))
else
  echo "  FAIL 多職位之後 10-24 重跑沒過："; echo "${rwgot}" | grep -i "FAIL\|error" | head -5; fail=$((fail+1))
fi

echo
echo "對外頁面不放中文名（2026-10-27）："
rwgot=$(psql -d "${DB}" -X -A -t -q -v ON_ERROR_STOP=1 -f supabase/migrations/2026-10-27-public-names-english.sql 2>&1 || true)
if echo "${rwgot}" | grep -q "OVERALL.*PASS" && ! echo "${rwgot}" | grep -q "FAIL"; then
  echo "  ok   對外英文名那支遷移檔跑過，驗收表全部 PASS"; pass=$((pass+1))
else
  echo "  FAIL 對外英文名那支遷移檔沒過："; echo "${rwgot}" | grep -i "FAIL\|error" | head -4; fail=$((fail+1))
fi
# 那位校友的 display_name 是空的、name_zh 是「改名」、再給他一個英文名：對外要看到英文名。
psql -d "${DB}" -q -c "update public.profiles set name_en='Renamed Person' where id='${MEMBER}';" >/dev/null
chkrole anon "" "★ 校友頁的名字先用英文名，中文名退後" "RenamedPerson" \
  "select replace(name,' ','') from public.public_alumni() where title like 'Associate%' limit 1"
psql -d "${DB}" -q -c "update public.profiles set name_en=null where id='${MEMBER}';" >/dev/null
chkrole anon "" "沒有英文名才退回中文名" "改名" \
  "select name from public.public_alumni() where title like 'Associate%' limit 1"

echo
echo "第五個職級 Adviser（2026-10-28）："
rwgot=$(psql -d "${DB}" -X -A -t -q -v ON_ERROR_STOP=1 -f supabase/migrations/2026-10-28-adviser-rank.sql 2>&1 || true)
if echo "${rwgot}" | grep -q "OVERALL.*PASS" && ! echo "${rwgot}" | grep -q "FAIL"; then
  echo "  ok   adviser 那支遷移檔跑過，驗收表全部 PASS"; pass=$((pass+1))
else
  echo "  FAIL adviser 那支遷移檔沒過："; echo "${rwgot}" | grep -i "FAIL\|error\|LINE" | head -6; fail=$((fail+1))
fi
# OTHER 這時是 Senior Adviser。降成 Adviser：不是 senior、進不了名單、派不了人；職級本身不帶權限，跟 Associate 一樣看指派。
chkas "${PAUL}" "Co-President 把 OTHER 改成 Adviser" "adviser" "select public.set_board_role('${OTHER}','adviser')"
chkas "${OTHER}" "★ Adviser 不是 senior（看不到名單那一組）" "f" "select public.is_senior()"
chkraise "★ Adviser 派不了人（不靠職級，要靠指派）" "not_ws_manage" \
  "perform set_config('test.uid','${OTHER}',true); perform public.assign('${MEMBER}','res:Curriculum','view');"
chk "職級變動記了一筆 senior_adviser → adviser" "1" \
  "select count(*) from public.role_changes where target='${OTHER}' and field='board_role' and old_value='senior_adviser' and new_value='adviser'"
chkraise "沒有的值還是擋（bad_role）" "bad_role" \
  "perform set_config('test.uid','${PAUL}',true); perform public.set_board_role('${OTHER}','chairman');"
chk "★ 10-24 重跑之後 check 還是五個值（已同步）" "1" \
  "select count(*) from pg_constraint where conname='profiles_board_role_check' and pg_get_constraintdef(oid) like '%''adviser''%'"
rwgot=$(psql -d "${DB}" -X -A -t -q -f supabase/migrations/2026-10-28-adviser-rank.sql 2>&1 || true)
if echo "${rwgot}" | grep -q "OVERALL.*PASS"; then
  echo "  ok   adviser 那支可以重跑"; pass=$((pass+1))
else
  echo "  FAIL adviser 那支重跑沒過："; echo "${rwgot}" | grep -i "FAIL\|error" | head -4; fail=$((fail+1))
fi
chkas "${PAUL}" "改回 Senior Adviser（留給後面的人）" "senior_adviser" "select public.set_board_role('${OTHER}','senior_adviser')"

echo
echo "邀請信（2026-10-29）："
rwgot=$(psql -d "${DB}" -X -A -t -q -v ON_ERROR_STOP=1 -f supabase/migrations/2026-10-29-invites.sql 2>&1 || true)
if echo "${rwgot}" | grep -q "OVERALL.*PASS" && ! echo "${rwgot}" | grep -q "FAIL"; then
  echo "  ok   邀請信那支遷移檔跑過，驗收表全部 PASS"; pass=$((pass+1))
else
  echo "  FAIL 邀請信那支遷移檔沒過："; echo "${rwgot}" | grep -i "FAIL\|error\|LINE" | head -8; fail=$((fail+1))
fi
# 這時候：PAUL Co-President、OTHER Senior Adviser、MEMBER 已經是校友。屆別裡 2026-27 已結束、2027-28 是這一屆。
TERM0=$(psql -d "${DB}" -X -A -t -q -c "select id from public.terms order by starts_on limit 1" | tr -d ' \n')
# ── 邀請一位校友：名單多一筆、職位一筆、outbox 一封、碼綁 email ──
IVA=$(psql -d "${DB}" -X -A -t -q -c "select set_config('test.uid','${PAUL}',false);" \
  -c "select public.invite_person('NewAlum@Example.com','alumni',null,'老校友二','Second Alum','Director, Marketing Team','','Marketing Team','${TERM0}','歡迎回來','備註只有後台看')" 2>&1 | tail -1 | tr -d ' \n')
case "${IVA}" in bt-*) echo "  ok   Co-President 邀請一位校友，拿到一組碼（${IVA}）"; pass=$((pass+1));; *) echo "  FAIL 邀請校友沒拿到碼：${IVA}"; fail=$((fail+1));; esac
chk "★ 碼綁 email（小寫存）、單次、30 天、記了誰邀的" "newalum@example.com|1|true|${PAUL}" \
  "select email||'|'||uses_left||'|'||(expires_at > now() + interval '29 days')||'|'||invited_by from public.invite_codes where code='${IVA}'"
chk "名單多了那一筆，還沒有帳號，職位掛在上面" "SecondAlum|Director,MarketingTeam|${TERM0}" \
  "select pe.name_en||'|'||po.title_en||'|'||po.term_id from public.people pe join public.positions po on po.person_id=pe.id join public.invite_codes c on c.person_id=pe.id where c.code='${IVA}' and pe.profile_id is null"
chk "★ outbox 排了一封 invite，信裡有連結、名字、職位、邀請的人、那一句話、不要回覆" "true|true|true|true|true|true" \
  "select (body like '%/app/?invite=${IVA}%')||'|'||(body like '%Second Alum%')||'|'||(body like '%Director, Marketing Team%')||'|'||(body like '%王平%')||'|'||(body like '%歡迎回來%')||'|'||(body like '%不要回覆這封信%') from public.mail_outbox where kind='invite' and invite_code='${IVA}'"
chk "主旨中英都有" "t" "select subject like '%邀請你%' and subject like '%invited%' from public.mail_outbox where invite_code='${IVA}'"
chkraise "同一個 email 還有活的碼就擋（invite_pending）" "invite_pending" \
  "perform set_config('test.uid','${PAUL}',true); perform public.invite_person('newalum@example.com','alumni',null,'','','','','','','','');"
chkraise "已經有帳號的 email 不能邀（email_has_account）" "email_has_account" \
  "perform set_config('test.uid','${PAUL}',true); perform public.invite_person('member@example.com','alumni',null,'','','','','','','','');"
chkraise "壞的 email 擋（bad_email）" "bad_email" \
  "perform set_config('test.uid','${PAUL}',true); perform public.invite_person('not-an-email','alumni',null,'','','','','','','','');"
chkraise "邀幹部一定要有職級（bad_role）" "bad_role" \
  "perform set_config('test.uid','${PAUL}',true); perform public.invite_person('x1@example.com','cadre',null,'','','','','','','','');"
# ── Senior Adviser 邀得了幹部（職級 director），撤不了；校友什麼都叫不動 ──
IVD=$(psql -d "${DB}" -X -A -t -q -c "select set_config('test.uid','${OTHER}',false);" \
  -c "select public.invite_person('newdir@example.com','cadre','director','','New Director','','','Curriculum Team','','','')" 2>&1 | tail -1 | tr -d ' \n')
case "${IVD}" in bt-*) echo "  ok   Senior Adviser 邀得了一位 Director（${IVD}）"; pass=$((pass+1));; *) echo "  FAIL Senior Adviser 邀不了：${IVD}"; fail=$((fail+1));; esac
chk "幹部的碼記著職級" "director|cadre" "select rank||'|'||grants from public.invite_codes where code='${IVD}'"
chkraise "★ Senior Adviser 撤不了（not_president）" "not_president" \
  "perform set_config('test.uid','${OTHER}',true); perform public.revoke_invite('${IVD}');"
chkraise "★ 校友邀不了（not_senior）" "not_senior" \
  "perform set_config('test.uid','${MEMBER}',true); perform public.invite_person('x2@example.com','alumni',null,'','','','','','','','');"
chkrole authenticated "${MEMBER}" "★ 校友看不到邀請清單" "0" "select count(*) from public.invites_for_review()"
chkas "${OTHER}" "Senior Adviser 看得到清單，狀態是 queued（還沒寄）" "queued" "select status from public.invites_for_review() where code='${IVA}'"
# ── 沒登入也能記「開過信」，而且什麼都不回 ──
chkrole anon "" "★ 沒登入的人叫 invite_opened 不會回東西" "" "select public.invite_opened('${IVA}')"
chk "開過信記了時間，再叫一次不會蓋掉" "t" "select opened_at is not null from public.invite_codes where code='${IVA}'"
chkrole anon "" "沒登入的人看得到碼是寄給誰的，但只有遮過的 email" "alumni|n***@example.com|live" "select grants||'|'||email_hint||'|'||status from public.invite_peek('${IVA}')"
chkas "${OTHER}" "清單上狀態變成 opened" "opened" "select status from public.invites_for_review() where code='${IVA}'"
# ── 破壞測試：用別的 email 登入認領，要被擋；用對的 email 才過 ──
WRONG=aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1
RIGHT=aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2
NEWDIR=aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3
psql -d "${DB}" -q -c "
  insert into auth.users (id,email) values ('${WRONG}','someone.else@example.com'), ('${RIGHT}','newalum@example.com'), ('${NEWDIR}','newdir@example.com');
  insert into public.profiles (id,name_zh,name_en,role) values ('${WRONG}','路人','Passer By','student'), ('${RIGHT}','','Second Alum','student'), ('${NEWDIR}','','New Director','student');
" >/dev/null
chkraise "★★ 別的 email 登入認領被擋（invite_wrong_email），碼沒被燒掉" "invite_wrong_email:n\*\*\*@example.com" \
  "perform set_config('test.uid','${WRONG}',true); perform public.claim_invite('${IVA}');"
chk "碼還在（uses_left 還是 1）" "1" "select uses_left from public.invite_codes where code='${IVA}'"
chkas "${RIGHT}" "★ 對的 email 認領成功，變成校友" "upgraded_alumni" "select public.claim_invite('${IVA}')"
chk "名單那一筆歸到他、職位在他身上" "Director,MarketingTeam" \
  "select po.title_en from public.people pe join public.positions po on po.person_id=pe.id where pe.profile_id='${RIGHT}'"
chkas "${OTHER}" "清單上狀態 claimed，印他的名字" "claimed|SecondAlum" "select status||'|'||claimed_name from public.invites_for_review() where code='${IVA}'"
chkas "${NEWDIR}" "★ 幹部的邀請：認領時職級寫進去" "upgraded" "select public.claim_invite('${IVD}')"
chk "職級是 director、記了一筆（改的人算邀請的人）" "director|member|director|${OTHER}" \
  "select p.board_role||'|'||r.old_value||'|'||r.new_value||'|'||r.changed_by from public.profiles p join public.role_changes r on r.target=p.id and r.field='board_role' where p.id='${NEWDIR}'"
chkraise "認領過的碼不能重寄（already_claimed）" "already_claimed" \
  "perform set_config('test.uid','${PAUL}',true); perform public.resend_invite('${IVA}');"
# ── 過期、撤銷、重寄 ──
IVE=$(psql -d "${DB}" -X -A -t -q -c "select set_config('test.uid','${PAUL}',false);" \
  -c "select public.invite_person('late@example.com','alumni',null,'','','','','','','','')" 2>&1 | tail -1 | tr -d ' \n')
psql -d "${DB}" -q -c "update public.invite_codes set expires_at = now() - interval '1 day' where code='${IVE}';" >/dev/null
LATE=aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4
psql -d "${DB}" -q -c "insert into auth.users (id,email) values ('${LATE}','late@example.com'); insert into public.profiles (id,name_zh,role) values ('${LATE}','晚到','student');" >/dev/null
chkraise "★ 過期的碼認領被擋（invite_expired）" "invite_expired" \
  "perform set_config('test.uid','${LATE}',true); perform public.claim_invite('${IVE}');"
chkas "${OTHER}" "清單上狀態 expired" "expired" "select status from public.invites_for_review() where code='${IVE}'"
IVE2=$(psql -d "${DB}" -X -A -t -q -c "select set_config('test.uid','${OTHER}',false);" -c "select public.resend_invite('${IVE}')" 2>&1 | tail -1 | tr -d ' \n')
case "${IVE2}" in bt-*) echo "  ok   重寄換了一組新碼（${IVE2}）"; pass=$((pass+1));; *) echo "  FAIL 重寄沒拿到新碼：${IVE2}"; fail=$((fail+1));; esac
chk "★ 舊碼死了、新碼活著、同一個 email、outbox 多一封" "0|1|late@example.com|2" \
  "select (select uses_left from public.invite_codes where code='${IVE}')||'|'||(select uses_left from public.invite_codes where code='${IVE2}')||'|'||(select email from public.invite_codes where code='${IVE2}')||'|'||(select count(*) from public.mail_outbox where kind='invite' and to_email='late@example.com')"
chkas "${PAUL}" "Co-President 撤銷" "" "select public.revoke_invite('${IVE2}')"
chkraise "★ 撤銷的碼認領被擋（invite_revoked）" "invite_revoked" \
  "perform set_config('test.uid','${LATE}',true); perform public.claim_invite('${IVE2}');"
chkas "${OTHER}" "清單上狀態 revoked" "revoked" "select status from public.invites_for_review() where code='${IVE2}'"
chk "邀請、重寄、撤銷都記在變動紀錄" "3" "select count(*) from public.role_changes where field='invite' and target_name in ('late@example.com')"
# ── 舊的批次碼照舊 ──
chk "批次碼那六欄是空的，還能用" "t" "select email is null and expires_at is null from public.invite_codes where code='BT-ALUM'"
rwgot=$(psql -d "${DB}" -X -A -t -q -f supabase/migrations/2026-10-29-invites.sql 2>&1 || true)
if echo "${rwgot}" | grep -q "OVERALL.*PASS"; then
  echo "  ok   邀請信那支可以重跑（文案不會被蓋）"; pass=$((pass+1))
else
  echo "  FAIL 邀請信那支重跑沒過："; echo "${rwgot}" | grep -i "FAIL\|error" | head -4; fail=$((fail+1))
fi

echo
echo "申請變成整個 BT 一個工作區（2026-10-30）："
# 這時候：DIR 管 apps:Curriculum；INT1、NEWB 幹部沒有任何指派；OTHER Senior Adviser；PAUL Co-President。先給 NEWDIR 一筆 view 看合併取最高。
psql -d "${DB}" -q -c "insert into public.assignments (user_id, workspace_id, level) values ('${DIR}','apps:Marketing','view') on conflict do nothing;" >/dev/null
BEFORE=$(psql -d "${DB}" -X -A -t -q -c "select count(*) from public.assignments where workspace_id like 'apps:%'" | tr -d ' \n')
rwgot=$(psql -d "${DB}" -X -A -t -q -v ON_ERROR_STOP=1 -f supabase/migrations/2026-10-30-applications-org-wide.sql 2>&1 || true)
if echo "${rwgot}" | grep -q "OVERALL.*PASS" && ! echo "${rwgot}" | grep -q "FAIL"; then
  echo "  ok   申請合併那支遷移檔跑過，驗收表全部 PASS（合併前 apps:<team> 上有 ${BEFORE} 筆指派）"; pass=$((pass+1))
else
  echo "  FAIL 申請合併那支遷移檔沒過："; echo "${rwgot}" | grep -i "FAIL\|error\|LINE" | head -8; fail=$((fail+1))
fi
chk "★ DIR 在兩個 team 的 apps 是 manage 與 view，合併後在 apps 上是最高的 manage" "manage" "select level from public.assignments where user_id='${DIR}' and workspace_id='apps'"
chk "舊的 apps:<team> 指派都搬走了、工作區停用、記了一筆合併" "0|0|true" \
  "select (select count(*) from public.assignments where workspace_id like 'apps:%')||'|'||(select count(*) from public.workspaces where id like 'apps:%' and active)||'|'||exists(select 1 from public.role_changes where target='${DIR}' and field='assignment' and new_value='manage@apps')"
chkas "${DIR}" "★ Director 現在看得到**全部** team 的表單（is_on_team 不看 team 了）" "true|true" "select public.is_on_team('Marketing')||'|'||public.is_director_of('Nope')"
chkrole authenticated "${DIR}" "Director 讀得到別的 team 的表單列" "1" "select count(*) from public.forms where id='${FORM}'"
# ── 破壞測試：沒被派進 apps 的幹部什麼都碰不到（NEWDIR 是邀請信那一段進來的 Director，沒有任何指派；NEWB 這時已經是校友） ──
chkas "${NEWDIR}" "★ 沒被派的幹部（Associate 或 Director 都一樣）：is_on_team / is_director_of 都是 false" "false|false" "select public.is_on_team('Curriculum')||'|'||public.is_director_of('Curriculum')"
chkrole authenticated "${NEWDIR}" "★ 沒被派的幹部讀不到還沒開放的表單（開放中的對外本來就看得到）" "0" "select count(*) from public.forms where status<>'open'"
got=$(psql -d "${DB}" -X -A -t -q -c "select set_config('test.uid','${NEWDIR}',false);" \
  -c "set role authenticated; do \$\$ begin insert into public.forms (team,title,status) values ('Curriculum','偷開的表單','draft'); raise notice 'NOT_BLOCKED'; exception when others then raise notice 'BLOCKED %', SQLERRM; end \$\$;" 2>&1 || true)
if echo "${got}" | grep -q "BLOCKED" && ! echo "${got}" | grep -q "NOT_BLOCKED"; then echo "  ok   ★ 沒被派的幹部開不了表單（forms_insert 的 RLS 擋）"; pass=$((pass+1)); else echo "  FAIL ★ 沒被派的幹部開得了表單：${got}"; fail=$((fail+1)); fi
chkas "${PAUL}" "Co-President 把那位 Director 派進 apps 當 edit" "edit" "select public.assign('${NEWDIR}','apps','edit')"
chkas "${NEWDIR}" "派了之後就是全部表單的 Director 式權限" "t" "select public.is_director_of('Whatever')"
chkas "${OTHER}" "Senior Adviser 靠職級" "t" "select public.is_director_of('x')"
chkraise "派不進停用的 apps:Curriculum（no_such_workspace）" "no_such_workspace" \
  "perform set_config('test.uid','${PAUL}',true); perform public.assign('${INT1}','apps:Curriculum','view');"
chk "my_access 回的是 apps 不是 apps:<team>" "apps|manage" \
  "select (w->>'id')||'|'||(w->>'level') from (select set_config('test.uid','${DIR}',true)) s, jsonb_array_elements((select public.my_access())->'workspaces') w where w->>'id' like 'apps%' limit 1"
rwgot=$(psql -d "${DB}" -X -A -t -q -f supabase/migrations/2026-10-30-applications-org-wide.sql 2>&1 || true)
if echo "${rwgot}" | grep -q "OVERALL.*PASS"; then
  echo "  ok   申請合併那支可以重跑"; pass=$((pass+1))
else
  echo "  FAIL 申請合併那支重跑沒過："; echo "${rwgot}" | grep -i "FAIL\|error" | head -4; fail=$((fail+1))
fi


echo "行銷需求單（2026-10-31）："
# 這時候：PAUL Co-President、OTHER Senior Adviser、DIR 管 apps、NEWDIR 改 apps、INT1 幹部沒有任何指派、MEMBER 校友。
# 先讓 DIR 管 res:Marketing Team（遷移檔會把他抄進需求工作區），NEWDIR 當送單的人（別的 team 的幹部）。
psql -d "${DB}" -q -c "insert into public.assignments (user_id, workspace_id, level) values ('${DIR}','res:Marketing Team','manage') on conflict (user_id, workspace_id) do update set level='manage';" >/dev/null
rwgot=$(psql -d "${DB}" -X -A -t -q -v ON_ERROR_STOP=1 -f supabase/migrations/2026-10-31-marketing-requests.sql 2>&1 || true)
if echo "${rwgot}" | grep -q "OVERALL.*PASS" && ! echo "${rwgot}" | grep -q "FAIL"; then
  echo "  ok   行銷需求單那支遷移檔跑過，驗收表全部 PASS"; pass=$((pass+1))
else
  echo "  FAIL 行銷需求單那支遷移檔沒過："; echo "${rwgot}" | grep -i "FAIL\|error\|LINE" | head -8; fail=$((fail+1))
fi
chk "★ res:Marketing 的成員照原等級抄進需求工作區" "manage" "select level from public.assignments where user_id='${DIR}' and workspace_id='custom:marketing-requests'"
RQ=$(psql -d "${DB}" -X -A -t -q -c "select set_config('test.uid','${NEWDIR}',false);" \
  -c "select public.submit_request('poster','冬令營海報','2027 冬令營','2026-12-01','A2 直式，要有報名 QR code','{https://drive.google.com/x,https://canva.com/y}','LINE: newdir')" 2>&1 | tail -1 | tr -d ' \n')
case "${RQ}" in ????????-*) echo "  ok   幹部送了一張需求單（${RQ}）"; pass=$((pass+1));; *) echo "  FAIL 送單失敗：${RQ}"; fail=$((fail+1));; esac
chk "單子存對：種類、狀態 new、送單的人、兩條素材連結" "poster|new|${NEWDIR}|2" "select kind||'|'||status||'|'||requester||'|'||array_length(asset_links,1) from public.requests where id='${RQ}'"
chk "★ 排了一封 request_new 給每一個「管」的人（DIR 一封），信裡有標題、日期、連結、送單的人、不要回覆" "1|true|true|true|true|true" \
  "select count(*)||'|'||bool_and(body like '%冬令營海報%')||'|'||bool_and(body like '%2026-12-01%')||'|'||bool_and(body like '%/admin/#requests/${RQ}%')||'|'||bool_and(body like '%New Director%')||'|'||bool_and(body like '%不要回覆這封信%') from public.mail_outbox where kind='request_new' and request_id='${RQ}'"
chk "信是寄給 DIR 的 email" "director@example.com" "select to_email from public.mail_outbox where kind='request_new' and request_id='${RQ}'"
chkrole authenticated "${NEWDIR}" "送單的人讀得到自己的單" "1" "select count(*) from public.requests where id='${RQ}'"
chkrole authenticated "${DIR}" "Marketing 需求工作區的人讀得到全部" "1" "select count(*) from public.requests"
chkrole authenticated "${INT1}" "★ 破壞測試：沒被派進需求工作區的幹部讀不到別人的單" "0" "select count(*) from public.requests"
chkrole authenticated "${OTHER}" "Senior Adviser 靠職級讀得到" "1" "select count(*) from public.requests"
chkraise "★ 沒被派的幹部改不了狀態（not_allowed）" "not_allowed" \
  "perform set_config('test.uid','${INT1}',true); perform public.set_request_status('${RQ}','in_progress','');"
chkas "${PAUL}" "Co-President 把 ISTAFF（Internship 的幹部）派進需求工作區當「看」" "view" "select public.assign('${ISTAFF}','custom:marketing-requests','view')"
chkrole authenticated "${ISTAFF}" "「看」的人讀得到全部了" "1" "select count(*) from public.requests"
chkraise "★ 只有「看」的人還是改不了狀態（not_allowed）" "not_allowed" \
  "perform set_config('test.uid','${ISTAFF}',true); perform public.set_request_status('${RQ}','in_progress','');"
chkas "${DIR}" "「管」的人改成進行中" "in_progress" "select public.set_request_status('${RQ}','in_progress','')"
chkraise "★ 已經在做了，送單的人收不回（already_started）" "already_started" \
  "perform set_config('test.uid','${NEWDIR}',true); perform public.withdraw_request('${RQ}');"
chkraise "★ 別人收不回不是自己的單（not_yours）" "not_yours" \
  "perform set_config('test.uid','${INT1}',true); perform public.withdraw_request('${RQ}');"
chkas "${DIR}" "標做完了，寫回覆" "done" "select public.set_request_status('${RQ}','done','做好了，檔在 Drive 的 2027 冬令營資料夾')"
chk "★ 寄了一封 request_done 給送單的人，信裡有回覆與連結" "1|newdir@example.com|true|true" \
  "select count(*)||'|'||min(to_email)||'|'||bool_and(body like '%做好了，檔在 Drive%')||'|'||bool_and(body like '%/admin/#request/${RQ}%') from public.mail_outbox where kind='request_done' and request_id='${RQ}'"
chkas "${DIR}" "再標一次 done 不再寄第二封" "done" "select public.set_request_status('${RQ}','done','')"
chk "還是只有一封 request_done" "1" "select count(*) from public.mail_outbox where kind='request_done' and request_id='${RQ}'"
chkrole authenticated "${DIR}" "工作區的人在 outbox 看得到 request 那幾封（總覽才算得到）" "2" "select count(*) from public.mail_outbox where request_id='${RQ}'"
# 第二張：送單的人自己收回
RQ2=$(psql -d "${DB}" -X -A -t -q -c "select set_config('test.uid','${NEWDIR}',false);" \
  -c "select public.submit_request('post','IG 貼文','','2026-11-15','','{}','')" 2>&1 | tail -1 | tr -d ' \n')
chkas "${NEWDIR}" "送單的人在「新的」時收得回" "withdrawn" "select public.withdraw_request('${RQ2}')"
chkraise "收回的單 Marketing 也動不了（withdrawn）" "withdrawn" \
  "perform set_config('test.uid','${DIR}',true); perform public.set_request_status('${RQ2}','in_progress','');"
chkraise "★ 校友送不了單（not_cadre）" "not_cadre" \
  "perform set_config('test.uid','${MEMBER}',true); perform public.submit_request('other','x','','2026-12-01','','{}','');"
chkraise "沒有標題擋（empty_title）" "empty_title" \
  "perform set_config('test.uid','${NEWDIR}',true); perform public.submit_request('other','  ','','2026-12-01','','{}','');"
got=$(psql -d "${DB}" -X -A -t -q -c "select set_config('test.uid','${NEWDIR}',false);" \
  -c "set role authenticated; do \$\$ begin insert into public.requests (kind,title,requester) values ('other','偷插的','${NEWDIR}'); raise notice 'NOT_BLOCKED'; exception when insufficient_privilege then raise notice 'BLOCKED'; end \$\$;" 2>&1 || true)
if echo "${got}" | grep -q "BLOCKED" && ! echo "${got}" | grep -q "NOT_BLOCKED"; then echo "  ok   ★ 沒有人能直接 insert requests（一律走 submit_request）"; pass=$((pass+1)); else echo "  FAIL 直接 insert requests 沒被擋：${got}"; fail=$((fail+1)); fi
rwgot=$(psql -d "${DB}" -X -A -t -q -f supabase/migrations/2026-10-31-marketing-requests.sql 2>&1 || true)
if echo "${rwgot}" | grep -q "OVERALL.*PASS"; then
  echo "  ok   行銷需求單那支可以重跑"; pass=$((pass+1))
else
  echo "  FAIL 行銷需求單那支重跑沒過："; echo "${rwgot}" | grep -i "FAIL\|error" | head -4; fail=$((fail+1))
fi


echo "活動上架（2026-11-01）："
# 這時候：DIR 管 res:Marketing Team（上一段給的）、PAUL Co-President、OTHER Senior Adviser、ISTAFF 只在 Internship、STU 與 WRONG 是學員（有名字）。
rwgot=$(psql -d "${DB}" -X -A -t -q -v ON_ERROR_STOP=1 -f supabase/migrations/2026-11-01-events.sql 2>&1 || true)
if echo "${rwgot}" | grep -q "OVERALL.*PASS" && ! echo "${rwgot}" | grep -q "FAIL"; then
  echo "  ok   活動那支遷移檔跑過，驗收表全部 PASS"; pass=$((pass+1))
else
  echo "  FAIL 活動那支遷移檔沒過："; echo "${rwgot}" | grep -i "FAIL\|error\|LINE" | head -8; fail=$((fail+1))
fi
EV=$(psql -d "${DB}" -X -A -t -q -c "select set_config('test.uid','${DIR}',false);" \
  -c "select public.create_event('Marketing Team','winter-camp-2027','2027 冬令營','Winter Camp 2027',true)" 2>&1 | tail -1 | tr -d ' \n')
case "${EV}" in ????????-*) echo "  ok   Marketing 的 Director 開了一場活動（${EV}）"; pass=$((pass+1));; *) echo "  FAIL 開活動失敗：${EV}"; fail=$((fail+1));; esac
chk "★ 一場活動 = 工作區（team 填 Marketing、開的人是管）+ 報名表（draft）+ 草稿" "custom:event-winter-camp-2027|MarketingTeam|manage|draft|draft" \
  "select e.workspace_id||'|'||w.team||'|'||a.level||'|'||f.status||'|'||e.status from public.events e join public.workspaces w on w.id=e.workspace_id join public.assignments a on a.workspace_id=w.id and a.user_id='${DIR}' join public.forms f on f.id=e.form_id where e.id='${EV}'"
EVF=$(psql -d "${DB}" -X -A -t -q -c "select form_id from public.events where id='${EV}'" | tr -d ' \n')
chkraise "★ 別的 team 的幹部開不了 Marketing 的活動（not_team_manager）" "not_team_manager" \
  "perform set_config('test.uid','${ISTAFF}',true); perform public.create_event('Marketing Team','x-event','x','x',true);"
chkraise "代號撞到擋（slug_taken）" "slug_taken" \
  "perform set_config('test.uid','${DIR}',true); perform public.create_event('Marketing Team','winter-camp-2027','y','y',false);"
chkrole anon "" "★ 破壞測試：沒登入的人看不到草稿" "0" "select count(*) from public.public_events()"
angot=$(psql -d "${DB}" -X -A -t -q -c "set role anon; select count(*) from public.events;" 2>&1 || true)
if echo "${angot}" | grep -qi "permission denied"; then echo "  ok   ★ anon 讀不到 events 表本身"; pass=$((pass+1)); else echo "  FAIL anon 讀得到 events 表：${angot}"; fail=$((fail+1)); fi
chkrole authenticated "${ISTAFF}" "★ 別的 team 的幹部讀不到這場活動（RLS）" "0" "select count(*) from public.events"
chkas "${DIR}" "「改」以上存內容（封面是 https、日期、地點、名額 1）" "${EV}" \
  "select public.save_event('${EV}', '{\"summary_zh\":\"三天兩夜\",\"summary_en\":\"Three days\",\"body_zh\":\"說明\",\"body_en\":\"Body\",\"cover_url\":\"https://drive.google.com/cover.jpg\",\"starts_at\":\"2027-01-20T01:00:00Z\",\"ends_at\":\"2027-01-22T09:00:00Z\",\"place\":\"台北\",\"capacity\":1}'::jsonb)"
chkraise "封面不是 https 擋（cover_not_https）" "cover_not_https" \
  "perform set_config('test.uid','${DIR}',true); perform public.save_event('${EV}', '{\"cover_url\":\"http://x/y.jpg\"}'::jsonb);"
chkraise "★ 封面有填、同意沒勾，按不了準備好了（consent_required）" "consent_required" \
  "perform set_config('test.uid','${DIR}',true); perform public.set_event_ready('${EV}', true);"
chkas "${DIR}" "勾了同意" "${EV}" "select public.save_event('${EV}', '{\"cover_consent\":true}'::jsonb)"
chkas "${DIR}" "準備好了" "ready" "select public.set_event_ready('${EV}', true)"
chkraise "★ 破壞測試：「管」的人自己放不上對外頁（not_senior）" "not_senior" \
  "perform set_config('test.uid','${DIR}',true); perform public.publish_event('${EV}');"
chkrole anon "" "ready 還不是對外，沒登入的人還是看不到" "0" "select count(*) from public.public_events()"
chkas "${PAUL}" "★ Co-President 放上對外頁" "published" "select public.publish_event('${EV}')"
chkrole anon "" "★ 沒登入的人看得到 published 的，而且有標題、封面、名額、報名還沒開" "winter-camp-2027|2027冬令營|WinterCamp2027|https://drive.google.com/cover.jpg|1|false|0|false|false" \
  "select slug||'|'||title_zh||'|'||title_en||'|'||cover_url||'|'||capacity||'|'||signup_open||'|'||signed_up||'|'||is_full||'|'||is_past from public.public_events()"
chkrole anon "" "public_event(slug) 一場" "1" "select count(*) from public.public_event('winter-camp-2027')"
psql -d "${DB}" -X -A -t -q -c "select set_config('test.uid','${DIR}',false);" -c "select public.save_event('${EV}', '{\"cover_url\":\"https://drive.google.com/other.jpg\"}'::jsonb)" >/dev/null 2>&1
chk "換了封面同意自動退回（要重新勾）" "f" "select cover_consent from public.events where id='${EV}'"
psql -d "${DB}" -X -A -t -q -c "select set_config('test.uid','${DIR}',false);" -c "select public.save_event('${EV}', '{\"cover_consent\":true}'::jsonb)" >/dev/null 2>&1
# 額滿硬關：開放報名表、名額 1。報名的人用兩位新的學員（前面的 STU 已經被別段刪掉或改過）。
EVS1=bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1
EVS2=bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2
psql -d "$DB" -q -v ON_ERROR_STOP=1 <<SQL
insert into auth.users (id,email) values ('${EVS1}','evs1@example.com'), ('${EVS2}','evs2@example.com');
insert into public.profiles (id,name_zh,role) values ('${EVS1}','報名一號','student'), ('${EVS2}','報名二號','student');
update public.forms set status='open' where id='${EVF}';
SQL
chkrole anon "" "報名表開了，對外看得到 signup_open" "true" "select signup_open::text from public.public_events()"
APP1=$(psql -d "${DB}" -X -A -t -q -c "select set_config('test.uid','${EVS1}',false);" -c "set role authenticated; select public.submit_application('${EVF}', '[]'::jsonb)" 2>&1 | tail -1 | tr -d ' \n' || true)
case "${APP1}" in ????????-*) echo "  ok   第一位學員報到名"; pass=$((pass+1));; *) echo "  FAIL 第一位報名失敗：${APP1}"; fail=$((fail+1));; esac
chkrole anon "" "★ 對外看得到額滿（1 / 1）" "1|true" "select signed_up||'|'||is_full from public.public_events()"
chkraise "★ 額滿硬關：第二位報不了（full）" "full" \
  "perform set_config('test.uid','${EVS2}',true); perform public.submit_application('${EVF}', '[]'::jsonb);"
chkas "${EVS1}" "報過的人再送回原本那一筆，不算第二個名額" "${APP1}" "select public.submit_application('${EVF}', '[]'::jsonb)"
chkas "${PAUL}" "拒了那一位名額就空出來" "1" "select public.decide_applications(array['${APP1}']::uuid[], 'rejected')"
chkrole anon "" "拒了之後不再額滿" "0|false" "select signed_up||'|'||is_full from public.public_events()"
chkraise "★ 已經 published 的按不了準備好了（already_published）" "already_published" \
  "perform set_config('test.uid','${DIR}',true); perform public.set_event_ready('${EV}', true);"
chkas "${OTHER}" "Senior Adviser 撤下來" "archived" "select public.unpublish_event('${EV}')"
chkrole anon "" "撤了對外就沒有" "0" "select count(*) from public.public_events()"
rwgot=$(psql -d "${DB}" -X -A -t -q -f supabase/migrations/2026-11-01-events.sql 2>&1 || true)
if echo "${rwgot}" | grep -q "OVERALL.*PASS"; then
  echo "  ok   活動那支可以重跑"; pass=$((pass+1))
else
  echo "  FAIL 活動那支重跑沒過："; echo "${rwgot}" | grep -i "FAIL\|error" | head -4; fail=$((fail+1))
fi


echo "會議紀錄與排會（2026-11-02）："
# 這時候：DIR 管 res:Marketing Team（不管 Curriculum）、PAUL Co-President、OTHER Senior Adviser、ISTAFF 是 Internship 的幹部、INT1 幹部沒有指派。
psql -d "${DB}" -q -c "update public.profiles set tz='America/New_York' where id='${ISTAFF}';" >/dev/null
rwgot=$(psql -d "${DB}" -X -A -t -q -v ON_ERROR_STOP=1 -f supabase/migrations/2026-11-02-meetings.sql 2>&1 || true)
if echo "${rwgot}" | grep -q "OVERALL.*PASS" && ! echo "${rwgot}" | grep -q "FAIL"; then
  echo "  ok   會議那支遷移檔跑過，驗收表全部 PASS（本機沒有 pg_cron，提醒靠 tick_mail）"; pass=$((pass+1))
else
  echo "  FAIL 會議那支遷移檔沒過："; echo "${rwgot}" | grep -i "FAIL\|error\|LINE" | head -8; fail=$((fail+1))
fi
MT=$(psql -d "${DB}" -X -A -t -q -c "select set_config('test.uid','${DIR}',false);" \
  -c "select public.schedule_meeting('Marketing Team','Marketing 週會','2027-03-01 02:00+00','2027-03-01 03:00+00','海報進度, 嘖嘖頁','https://docs.google.com/document/d/abc', array['${PAUL}','${ISTAFF}','${DIR}']::uuid[])" 2>&1 | tail -1 | tr -d ' \n' || true)
case "${MT}" in ????????-*) echo "  ok   Marketing 的 Director 排了一場 team 會議（${MT}）"; pass=$((pass+1));; *) echo "  FAIL 排會失敗：${MT}"; fail=$((fail+1));; esac
chk "★ 會議存對：範圍、標題、三位出席、都還沒回" "MarketingTeam|Marketing週會|3|3" \
  "select m.scope||'|'||m.title||'|'||(select count(*) from public.meeting_attendees a where a.meeting_id=m.id)||'|'||(select count(*) from public.meeting_attendees a where a.meeting_id=m.id and a.status='invited') from public.meetings m where m.id='${MT}'"
chk "★ 三封邀請信，每一封附 .ics（VCALENDAR、UID、DTSTART 是 UTC Z、SUMMARY）" "3|true|true|true|true" \
  "select count(*)||'|'||bool_and(ics like 'BEGIN:VCALENDAR'||E'\r\n'||'%')||'|'||bool_and(ics like '%UID:meeting-${MT}'||E'\r\n'||'%')||'|'||bool_and(ics like '%DTSTART:20270301T020000Z%')||'|'||bool_and(ics like '%SUMMARY:Marketing 週會%') from public.mail_outbox where kind='meeting_invite' and meeting_id='${MT}'"
chk "★ 信裡的時間照收信的人的時區：ISTAFF 是紐約（02:00Z = 前一天 21:00）、PAUL 台北 10:00" "true|true" \
  "select (select body like '%2027-02-28 21:00–22:00（America/New_York）%' from public.mail_outbox where kind='meeting_invite' and meeting_id='${MT}' and to_email='istaff@example.com')||'|'||(select body like '%2027-03-01 10:00–11:00（Asia/Taipei）%' from public.mail_outbox where kind='meeting_invite' and meeting_id='${MT}' and to_email='paul@example.com')"
chk "信裡有議程、Drive 連結、回覆連結、不要回覆" "true|true|true|true" \
  "select bool_and(body like '%海報進度, 嘖嘖頁%')||'|'||bool_and(body like '%https://docs.google.com/document/d/abc%')||'|'||bool_and(body like '%/availability/?meeting=${MT}%')||'|'||bool_and(body like '%不要回覆這封信%') from public.mail_outbox where kind='meeting_invite' and meeting_id='${MT}'"
chk "ics 的逗號有跳脫（DESCRIPTION 裡的「, 」變成「\\,」）" "t" "select position(E'\\\\,' in ics) > 0 from public.mail_outbox where kind='meeting_invite' and meeting_id='${MT}' limit 1"
chkraise "★ 破壞測試：沒有「管」任何 team 的幹部（ISTAFF）排不了會（not_allowed）" "not_allowed" \
  "perform set_config('test.uid','${ISTAFF}',true); perform public.schedule_meeting('board','x','2027-03-02 02:00+00','2027-03-02 03:00+00','','',array['${ISTAFF}']::uuid[]);"
chkraise "★ 破壞測試：Director 排不了別的 team 的會（not_allowed）" "not_allowed" \
  "perform set_config('test.uid','${DIR}',true); perform public.schedule_meeting('Curriculum Team','x','2027-03-02 02:00+00','2027-03-02 03:00+00','','',array['${DIR}']::uuid[]);"
chkraise "★ Director 排不了整個 BT 的會（not_allowed）" "not_allowed" \
  "perform set_config('test.uid','${DIR}',true); perform public.schedule_meeting('board','x','2027-03-02 02:00+00','2027-03-02 03:00+00','','',array['${DIR}']::uuid[]);"
chkraise "Drive 以外的紀錄連結擋（bad_doc_url）" "bad_doc_url" \
  "perform set_config('test.uid','${PAUL}',true); perform public.save_meeting(null,'board','x','2027-03-02 02:00+00','2027-03-02 03:00+00','','https://notion.so/x',array['${PAUL}']::uuid[]);"
chkraise "結束要在開始之後（bad_time）" "bad_time" \
  "perform set_config('test.uid','${PAUL}',true); perform public.save_meeting(null,'board','x','2027-03-02 03:00+00','2027-03-02 02:00+00','','',array['${PAUL}']::uuid[]);"
chkas "${ISTAFF}" "★ 出席的人回「會到」" "accepted" "select public.set_rsvp('${MT}','accepted')"
chkraise "★ 不在名單上的人回不了（not_invited）" "not_invited" \
  "perform set_config('test.uid','${INT1}',true); perform public.set_rsvp('${MT}','accepted');"
chkas "${DIR}" "改名單：拿掉 PAUL、加 OTHER；ISTAFF 回過的保留" "${MT}" \
  "select public.save_meeting('${MT}','Marketing Team','Marketing 週會','2027-03-01 02:00+00','2027-03-01 03:00+00','海報進度','https://docs.google.com/document/d/abc', array['${ISTAFF}','${DIR}','${OTHER}']::uuid[])"
chk "名單換了、ISTAFF 還是 accepted" "accepted|false|true" \
  "select (select status from public.meeting_attendees where meeting_id='${MT}' and user_id='${ISTAFF}')||'|'||exists(select 1 from public.meeting_attendees where meeting_id='${MT}' and user_id='${PAUL}')||'|'||exists(select 1 from public.meeting_attendees where meeting_id='${MT}' and user_id='${OTHER}')"
chkrole authenticated "${ISTAFF}" "★ 會議紀錄全部幹部看得到（沒被派進任何工作區的也看得到）" "1" "select count(*) from public.meetings"
mgot=$(psql -d "${DB}" -X -A -t -q -c "set role anon; select count(*) from public.meetings;" 2>&1 || true)
if echo "${mgot}" | grep -qi "permission denied"; then echo "  ok   沒登入讀不到 meetings 表"; pass=$((pass+1)); else echo "  FAIL anon 讀得到 meetings：${mgot}"; fail=$((fail+1)); fi
# 提醒：一場兩小時後開的會 → tick_mail 排了兩封；再叫一次不會再排。
MT2=$(psql -d "${DB}" -X -A -t -q -c "select set_config('test.uid','${PAUL}',false);" \
  -c "select public.schedule_meeting('board','Board 臨時會', now() + interval '2 hours', now() + interval '3 hours','','', array['${PAUL}','${OTHER}']::uuid[])" 2>&1 | tail -1 | tr -d ' \n' || true)
psql -d "${DB}" -q -c "select set_config('test.uid','${OTHER}',false); select public.set_rsvp('${MT2}','declined');" >/dev/null 2>&1
chkas "${PAUL}" "★ tick_mail 排了提醒：兩位出席、一位說不能到，所以 1 封" "1" "select public.tick_mail()"
chk "提醒信是 meeting_reminder、附 ics、那一場記了 reminded_at" "1|true|true" \
  "select count(*)||'|'||bool_and(ics is not null)||'|'||(select reminded_at is not null from public.meetings where id='${MT2}') from public.mail_outbox where kind='meeting_reminder' and meeting_id='${MT2}'"
chkas "${PAUL}" "再叫一次不會再排" "0" "select public.tick_mail()"
chkraise "★ 校友叫不了 tick_mail（not_cadre）" "not_cadre" \
  "perform set_config('test.uid','${MEMBER}',true); perform public.tick_mail();"
chkas "${DIR}" "刪掉那一場（Director 自己 team 的）" "deleted" "select public.delete_meeting('${MT}')"
rwgot=$(psql -d "${DB}" -X -A -t -q -f supabase/migrations/2026-11-02-meetings.sql 2>&1 || true)
if echo "${rwgot}" | grep -q "OVERALL.*PASS"; then
  echo "  ok   會議那支可以重跑"; pass=$((pass+1))
else
  echo "  FAIL 會議那支重跑沒過："; echo "${rwgot}" | grep -i "FAIL\|error" | head -4; fail=$((fail+1))
fi


echo "清掉靠職級的人多餘的指派（2026-11-03）："
# 先種一筆多餘的（PAUL 是 Co-President、OTHER 是 Senior Adviser），遷移檔要把它們清掉並記下來。
psql -d "${DB}" -q -c "insert into public.assignments (user_id, workspace_id, level) values ('${PAUL}','res:Marketing Team','manage'), ('${OTHER}','apps','view') on conflict (user_id, workspace_id) do update set level=excluded.level;" >/dev/null
BEFORE=$(psql -d "${DB}" -X -A -t -q -c "select count(*) from public.assignments a join public.profiles p on p.id=a.user_id where p.board_role in ('president','senior_adviser')" | tr -d ' \n')
rwgot=$(psql -d "${DB}" -X -A -t -q -v ON_ERROR_STOP=1 -f supabase/migrations/2026-11-03-drop-redundant-assignments.sql 2>&1 || true)
if echo "${rwgot}" | grep -q "OVERALL.*PASS" && ! echo "${rwgot}" | grep -q "FAIL"; then
  echo "  ok   清多餘指派那支遷移檔跑過，驗收表全部 PASS（清掉前有 ${BEFORE} 筆）"; pass=$((pass+1))
else
  echo "  FAIL 清多餘指派那支遷移檔沒過："; echo "${rwgot}" | grep -i "FAIL\|error\|LINE" | head -8; fail=$((fail+1))
fi
chk "★ 這兩級身上一筆指派都不剩" "0" "select count(*) from public.assignments a join public.profiles p on p.id=a.user_id where p.board_role in ('president','senior_adviser')"
chk "★ 每一筆刪除都記了（new_value 是 by_rank，old 是等級@工作區）" "t" "select count(*) >= ${BEFORE} and bool_and(old_value like '%@%') from public.role_changes where field='assignment' and new_value='by_rank'"
chkas "${PAUL}" "★ 之後再派 Co-President 進任何工作區：不寫、回 by_rank" "by_rank" "select public.assign('${OTHER}','res:Marketing Team','manage')"
chk "真的沒有寫進去" "0" "select count(*) from public.assignments where user_id='${OTHER}'"
chkas "${PAUL}" "一般幹部照常派得進去" "view" "select public.assign('${ISTAFF}','res:Marketing Team','view')"
rwgot=$(psql -d "${DB}" -X -A -t -q -f supabase/migrations/2026-11-03-drop-redundant-assignments.sql 2>&1 || true)
if echo "${rwgot}" | grep -q "OVERALL.*PASS"; then echo "  ok   清多餘指派那支可以重跑"; pass=$((pass+1)); else echo "  FAIL 清多餘指派那支重跑沒過："; echo "${rwgot}" | grep -i "FAIL\|error" | head -4; fail=$((fail+1)); fi


echo "幹部護照補 passports 那一列（2026-11-04）："
# 重現 Alice 的那條路：幹部有 profiles、沒有 passports。先數有幾位這樣的（這份假資料的幹部幾乎都是直接種的，沒有 passports）。
MISSING=$(psql -d "${DB}" -X -A -t -q -c "select count(*) from public.profiles p where p.role='cadre' and not exists (select 1 from public.passports ps where ps.id=p.id)" | tr -d ' \n')
chkrole authenticated "${PAUL}" "★ 重現：沒有 passports 列的幹部存名字，profiles 影響 1 列" "1" \
  "with a as (update public.profiles set name_zh='王平' where id='${PAUL}' returning id) select count(*) from a"
chkrole authenticated "${PAUL}" "★ 重現：同一個人更新 passports 影響 0 列而且沒有錯（這就是存了卻像沒存）" "0" \
  "with b as (update public.passports set motto='x' where id='${PAUL}' returning id) select count(*) from b"
rwgot=$(psql -d "${DB}" -X -A -t -q -v ON_ERROR_STOP=1 -f supabase/migrations/2026-11-04-passport-self-heal.sql 2>&1 || true)
if echo "${rwgot}" | grep -q "OVERALL.*PASS" && ! echo "${rwgot}" | grep -q "FAIL"; then
  echo "  ok   補護照那支遷移檔跑過，驗收表全部 PASS（補了 ${MISSING} 位）"; pass=$((pass+1))
else
  echo "  FAIL 補護照那支遷移檔沒過："; echo "${rwgot}" | grep -i "FAIL\|error\|LINE" | head -8; fail=$((fail+1))
fi
chk "★ 補完每一位幹部都有 passports 列" "0" "select count(*) from public.profiles p where p.role='cadre' and not exists (select 1 from public.passports ps where ps.id=p.id)"
chkrole authenticated "${PAUL}" "★ 補完之後同一句 update passports 影響 1 列" "1" \
  "with b as (update public.passports set motto='一句話' where id='${PAUL}' returning id) select count(*) from b"
chkas "${PAUL}" "有列的幹部叫 ensure_passport：exists" "exists" "select public.ensure_passport()"
psql -d "${DB}" -q -c "delete from public.passports where id='${ISTAFF}';" >/dev/null
chkas "${ISTAFF}" "★ 之後又少了那一列的幹部自己叫 ensure_passport 就補回來" "created" "select public.ensure_passport()"
chk "真的補了" "1" "select count(*) from public.passports where id='${ISTAFF}'"
chkas "${EVS1}" "學員叫 ensure_passport：not_cadre，不會多一本" "not_cadre" "select public.ensure_passport()"
chk "學員沒有護照" "0" "select count(*) from public.passports where id='${EVS1}'"
rwgot=$(psql -d "${DB}" -X -A -t -q -f supabase/migrations/2026-11-04-passport-self-heal.sql 2>&1 || true)
if echo "${rwgot}" | grep -q "OVERALL.*PASS"; then echo "  ok   補護照那支可以重跑"; pass=$((pass+1)); else echo "  FAIL 補護照那支重跑沒過："; echo "${rwgot}" | grep -i "FAIL\|error" | head -4; fail=$((fail+1)); fi


echo "信長什麼樣（2026-11-05）："
rwgot=$(psql -d "${DB}" -X -A -t -q -v ON_ERROR_STOP=1 -f supabase/migrations/2026-11-05-email-layout.sql 2>&1 || true)
if echo "${rwgot}" | grep -q "OVERALL.*PASS" && ! echo "${rwgot}" | grep -q "FAIL"; then
  echo "  ok   信的版型那支遷移檔跑過，驗收表全部 PASS"; pass=$((pass+1))
else
  echo "  FAIL 信的版型那支遷移檔沒過："; echo "${rwgot}" | grep -i "FAIL\|error\|LINE" | head -8; fail=$((fail+1))
fi
chk "★ 雙語模板自動拆成中英兩份（邀請、需求單兩封、會議兩封）" "5|5" \
  "select count(*) filter (where body_en is not null)||'|'||count(*) filter (where subject_en is not null) from public.mail_templates where kind in ('invite','request_new','request_done','meeting_invite','meeting_reminder')"
chk "拆完中文那一欄不再含英文段落，合併欄 body 兩段都在（排信函式讀的是它）" "false|true|true" "select (body_zh like '%Hi {name}%')||'|'||(body like '%Hi {name}%')||'|'||(body like E'%\\n\\n[[en]]\\n%') from public.mail_templates where kind='invite'"
# 每一種信各排一封（帶 <b> 的使用者字），包起來看按鈕與跳脫。排信的函式沒動，直接種 outbox 列。
psql -d "${DB}" -q -c "insert into public.mail_outbox (to_email, subject, body, kind, invite_code, request_id, meeting_id, application_id, form_id) values
 ('r1@example.com','BT 邀請　Invite','<b>名字</b> 你好，'||E'\n\n'||'https://beyondtaiwannpo.com/app/?invite=bt-zz'||E'\n\n'||'Hi <b>Name</b>,'||E'\n\n'||'https://beyondtaiwannpo.com/app/?invite=bt-zz'||E'\n\n'||'不要回覆這封信，這個信箱沒有人看。','invite','bt-zz',null,null,null,null),
 ('r2@example.com','需求單　Request','內文 <i>x</i>'||E'\n\n'||'Hi team,'||E'\n\n'||'body','request_new',null,'${RQ}',null,null,null),
 ('r3@example.com','需求單做完　Done','內文','request_done',null,'${RQ}',null,null,null),
 ('r4@example.com','會議　Meeting','內文','meeting_invite',null,null,'${MT2}',null,null),
 ('r5@example.com','提醒　Reminder','內文','meeting_reminder',null,null,'${MT2}',null,null),
 ('r6@example.com','家長','您好 <script>','guardian',null,null,null,null,null),
 ('r7@example.com','面試','內文','interview',null,null,null,null,'${FORM}'),
 ('r8@example.com','錄取','內文','accepted',null,null,null,null,null),
 ('r9@example.com','未錄取','內文','rejected',null,null,null,null,null),
 ('r10@example.com','行前','內文','notice',null,null,null,null,null);" >/dev/null
chkas "${PAUL}" "★ 十種信都包得出 HTML（每一種都有 logo、一張照片、信尾）" "10|10|10|10" \
  "select count(*)||'|'||count(*) filter (where (r.html) like '%shared/logo.png%')||'|'||count(*) filter (where (r.html) like '%/photos/%')||'|'||count(*) filter (where (r.html) like '%beyondtaiwan2020@gmail.com%') from public.mail_outbox o cross join lateral public.mail_render(o.id) r where o.to_email like 'r%@example.com'"
chkas "${PAUL}" "★ 按鈕連對：邀請連 /app/?invite=、需求單連那一張、會議連回覆頁、面試連 Cal" "true|true|true|true" \
  "select (select r.html like '%href=\"https://beyondtaiwannpo.com/app/?invite=bt-zz\"%' from public.mail_outbox o cross join lateral public.mail_render(o.id) r where o.to_email='r1@example.com')||'|'||(select r.html like '%href=\"https://beyondtaiwannpo.com/admin/#requests/${RQ}\"%' from public.mail_outbox o cross join lateral public.mail_render(o.id) r where o.to_email='r2@example.com')||'|'||(select r.html like '%href=\"https://beyondtaiwannpo.com/availability/?meeting=${MT2}\"%' from public.mail_outbox o cross join lateral public.mail_render(o.id) r where o.to_email='r4@example.com')||'|'||(select r.html like '%href=\"https://cal.com%' or r.html like '%href=\"https://beyondtaiwannpo.com/apply/\"%' from public.mail_outbox o cross join lateral public.mail_render(o.id) r where o.to_email='r7@example.com')"
chkas "${PAUL}" "★ 使用者的字全部跳脫：沒有一封含原始的 <b>、<i>、<script>" "0" \
  "select count(*) from public.mail_outbox o cross join lateral public.mail_render(o.id) r where o.to_email like 'r%@example.com' and (r.html like '%<b>名字%' or r.html like '%<i>x%' or r.html like '%<script>%')"
chkas "${PAUL}" "一封一種語言：沒有帳號的收件人預設中文，主旨只留中文那一段，按鈕的字是中文預設" "BT邀請|zh|true" \
  "select r.subject||'|'||r.lang||'|'||(r.html like '%>接受邀請</a>%') from public.mail_outbox o cross join lateral public.mail_render(o.id) r where o.to_email='r1@example.com'"
psql -d "${DB}" -q -c "update public.profiles set lang='en' where id='${ISTAFF}'; update public.mail_outbox set to_email='istaff@example.com' where to_email='r4@example.com';" >/dev/null
chkas "${PAUL}" "★ 收信的人 profiles.lang 是 en：主旨與按鈕都是英文" "Meeting|en|true" \
  "select r.subject||'|'||r.lang||'|'||(r.html like '%>Reply</a>%') from public.mail_outbox o cross join lateral public.mail_render(o.id) r where o.to_email='istaff@example.com' and o.kind='meeting_invite'"
psql -d "${DB}" -q -c "update public.mail_settings set value='false' where key='one_lang';" >/dev/null
chkas "${PAUL}" "開關關掉：兩種語言疊在一起（主旨整句、內文兩段都在）" "BT邀請　Invite|both|true" \
  "select r.subject||'|'||r.lang||'|'||(r.html like '%Hi &lt;b&gt;Name&lt;/b&gt;,%') from public.mail_outbox o cross join lateral public.mail_render(o.id) r where o.to_email='r1@example.com'"
psql -d "${DB}" -q -c "update public.mail_settings set value='true' where key='one_lang';" >/dev/null
chkas "${PAUL}" "後台改文案（七個參數）：英文版與按鈕的字存得進去" "invite" \
  "select public.set_mail_template('invite','主旨','內文 {link}','Subject','Body {link}','現在加入','Join now')"
chkas "${PAUL}" "改了按鈕的字就用那個字" "t" "select r.html like '%>現在加入</a>%' from public.mail_outbox o cross join lateral public.mail_render(o.id) r where o.to_email='r1@example.com'"
# 邀請人的介面語言（Paul 2026-10-26）：被邀請的人沒帳號，邀請信照邀請人按下去那一刻的語言；重寄由重寄的人再帶一次。
LCODE=$(psql -d "${DB}" -X -A -t -q -c "select set_config('test.uid','${PAUL}',false);" \
  -c "select public.invite_person('langtest@example.com','alumni',null,'','Lang Test','','','','','','','en')" 2>&1 | tail -1 | tr -d ' \n')
chk "★ 英文介面按「邀請」：碼與那一封信都記 en" "en|en" \
  "select (select lang from public.invite_codes where code='${LCODE}')||'|'||(select lang from public.mail_outbox where invite_code='${LCODE}')"
chkas "${PAUL}" "★ 沒帳號的被邀請人收到英文版（主旨、按鈕，用前一條改過的英文文案）" "Subject|en|true" \
  "select r.subject||'|'||r.lang||'|'||(r.html like '%>Join now</a>%' or r.html like '%>Accept invitation</a>%') from public.mail_outbox o cross join lateral public.mail_render(o.id) r where o.invite_code='${LCODE}'"
LCODE2=$(psql -d "${DB}" -X -A -t -q -c "select set_config('test.uid','${PAUL}',false);" \
  -c "select public.resend_invite('${LCODE}','zh')" 2>&1 | tail -1 | tr -d ' \n')
chkas "${PAUL}" "★ 中文介面重寄：新的那一封變中文" "zh|zh" \
  "select (select lang from public.invite_codes where code='${LCODE2}')||'|'||r.lang from public.mail_outbox o cross join lateral public.mail_render(o.id) r where o.invite_code='${LCODE2}'"
chk "沒帶語言的舊版 invite_person 還在、信照中文" "zh" \
  "select public.mail_lang_for('nobody@example.com', null)"
chk "收信的人自己有帳號有 lang，優先於那一封信帶的提示" "en" "select public.mail_lang_for('istaff@example.com', 'zh')"
psql -d "${DB}" -q -c "delete from public.mail_outbox where invite_code in ('${LCODE}','${LCODE2}'); delete from public.invite_codes where code in ('${LCODE}','${LCODE2}'); delete from public.people where name_en='Lang Test';" >/dev/null
psql -d "${DB}" -q -c "delete from public.mail_outbox where to_email like 'r%@example.com' or to_email='istaff@example.com' and kind='meeting_invite' and subject like '會議%';" >/dev/null
rwgot=$(psql -d "${DB}" -X -A -t -q -f supabase/migrations/2026-11-05-email-layout.sql 2>&1 || true)
if echo "${rwgot}" | grep -q "OVERALL.*PASS"; then echo "  ok   信的版型那支可以重跑"; pass=$((pass+1)); else echo "  FAIL 信的版型那支重跑沒過："; echo "${rwgot}" | grep -i "FAIL\|error" | head -4; fail=$((fail+1)); fi


echo "歷史之路（2026-11-06）："
# 這時候：DIR 與 PAUL 管 res:Marketing Team、OTHER Senior Adviser、ISTAFF 是 Internship 的幹部（不管 Marketing）、STU 是學員。
rwgot=$(psql -d "${DB}" -X -A -t -q -v ON_ERROR_STOP=1 -f supabase/migrations/2026-11-06-history-milestones.sql 2>&1 || true)
if echo "${rwgot}" | grep -q "OVERALL.*PASS" && ! echo "${rwgot}" | grep -q "FAIL"; then
  echo "  ok   歷史之路那支遷移檔跑過，驗收表全部 PASS（含 Storage 那兩列）"; pass=$((pass+1))
else
  echo "  FAIL 歷史之路那支遷移檔沒過："; echo "${rwgot}" | grep -i "FAIL\|error\|LINE" | head -8; fail=$((fail+1))
fi
chkrole anon "" "★ 沒登入拿得到七點 seed 的 JSON，而且沒有 status、沒有誰建的" "7|0|0" \
  "select jsonb_array_length(j)||'|'||(select count(*) from jsonb_array_elements(j) e where e ? 'status')||'|'||(select count(*) from jsonb_array_elements(j) e where e ? 'created_by') from public.public_milestones() j"
angot=$(psql -d "${DB}" -X -A -t -q -c "set role anon; select count(*) from public.history_milestones;" 2>&1 || true)
if echo "${angot}" | grep -qi "permission denied"; then echo "  ok   ★ anon 讀不到 history_milestones 表本身"; pass=$((pass+1)); else echo "  FAIL anon 讀得到 history_milestones 表：${angot}"; fail=$((fail+1)); fi
chkraise "★ 破壞測試：不是 Marketing「管」也不是 senior 的幹部加不了站（not_allowed）" "not_allowed" \
  "perform set_config('test.uid','${ISTAFF}',true); perform public.upsert_milestone('{\"slug\":\"x-stop\",\"happened_on\":\"2024-01-01\",\"title_zh\":\"x\",\"title_en\":\"x\"}'::jsonb);"
chkraise "代號不合格擋（bad_slug）" "bad_slug" \
  "perform set_config('test.uid','${DIR}',true); perform public.upsert_milestone('{\"slug\":\"Bad Slug\",\"happened_on\":\"2024-01-01\",\"title_zh\":\"x\",\"title_en\":\"x\"}'::jsonb);"
HM=$(psql -d "${DB}" -X -A -t -q -c "select set_config('test.uid','${DIR}',false);" \
  -c "select public.upsert_milestone('{\"slug\":\"2024-winter-camp\",\"happened_on\":\"2024-01-20\",\"title_zh\":\"第一次冬令營\",\"title_en\":\"First winter camp\",\"summary_zh\":\"三天\",\"summary_en\":\"Three days\"}'::jsonb)" 2>&1 | tail -1 | tr -d ' \n')
case "${HM}" in ????????-*) echo "  ok   Marketing 的 Director 加了一站（${HM}）"; pass=$((pass+1));; *) echo "  FAIL 加站失敗：${HM}"; fail=$((fail+1));; esac
chk "新的一站是草稿，排在最後（sort 80）" "draft|80" "select status||'|'||sort from public.history_milestones where id='${HM}'"
chkrole anon "" "★ 破壞測試：沒登入的人看不到草稿（還是 7 點）" "7" "select jsonb_array_length(public.public_milestones())"
chkrole authenticated "${ISTAFF}" "別的 team 的幹部讀得到清單（後台看得到，改不動）" "8" "select count(*) from public.history_milestones"
chkrole authenticated "${STU}" "學員什麼都讀不到" "0" "select count(*) from public.history_milestones"
chkraise "照片不是 https 擋（photo_not_https）" "photo_not_https" \
  "perform set_config('test.uid','${DIR}',true); perform public.add_milestone_photo('${HM}','http://x/y.jpg');"
HP=$(psql -d "${DB}" -X -A -t -q -c "select set_config('test.uid','${DIR}',false);" \
  -c "select public.add_milestone_photo('${HM}','https://norjaglyaotzewxavmhv.supabase.co/storage/v1/object/public/history/${HM}/a.jpg','營隊合照','Group photo',false)" 2>&1 | tail -1 | tr -d ' \n')
case "${HP}" in ????????-*) echo "  ok   掛了一張照片，同意還沒勾（${HP}）"; pass=$((pass+1));; *) echo "  FAIL 掛照片失敗：${HP}"; fail=$((fail+1));; esac
chkraise "★ 破壞測試：有照片沒勾同意，按不了準備好了（consent_required）" "consent_required" \
  "perform set_config('test.uid','${DIR}',true); perform public.set_milestone_status('${HM}','ready');"
chkas "${DIR}" "勾了同意" "${HP}" "select public.update_milestone_photo('${HP}', '{\"consent\":true}'::jsonb)"
# 2026-11-07 Paul 回報「照片說明存不起來」。先在這裡重現：改兩句說明、讀回來要是新的。
chkas "${DIR}" "改照片說明（中英）" "${HP}" "select public.update_milestone_photo('${HP}', '{\"caption_zh\":\"第一屆合照\",\"caption_en\":\"First camp group photo\"}'::jsonb)"
chk "照片說明存進去了" "第一屆合照|Firstcampgroupphoto|true" "select caption_zh || '|' || caption_en || '|' || consent from history_photos where id = '${HP}'"
chkas "${DIR}" "只改英文說明，中文不動" "${HP}" "select public.update_milestone_photo('${HP}', '{\"caption_en\":\"Camp 2023\"}'::jsonb)"
chk "中文說明沒被清掉" "第一屆合照|Camp2023" "select caption_zh || '|' || caption_en from history_photos where id = '${HP}'"
# 改回原本的說明，下面對外那一段還要比對它。
chkas "${DIR}" "說明改回去" "${HP}" "select public.update_milestone_photo('${HP}', '{\"caption_zh\":\"營隊合照\",\"caption_en\":\"Group photo\"}'::jsonb)"
chkas "${DIR}" "準備好了" "ready" "select public.set_milestone_status('${HM}','ready')"
chkraise "★ 破壞測試：Marketing 的 Director 自己放不上去（not_senior）" "not_senior" \
  "perform set_config('test.uid','${DIR}',true); perform public.set_milestone_status('${HM}','published');"
chkrole anon "" "ready 還不是對外（還是 7 點）" "7" "select jsonb_array_length(public.public_milestones())"
chkas "${PAUL}" "★ Co-President 放上去" "published" "select public.set_milestone_status('${HM}','published')"
chkrole anon "" "★ 對外多了這一站，照片一張、有說明、沒有名字欄位" "8|1|Groupphoto|false" \
  "select jsonb_array_length(j)||'|'||jsonb_array_length(e->'photos')||'|'||(e->'photos'->0->>'caption_en')||'|'||(e->'photos'->0 ? 'created_by') from public.public_milestones() j, jsonb_array_elements(j) e where e->>'slug'='2024-winter-camp'"
HP2=$(psql -d "${DB}" -X -A -t -q -c "select set_config('test.uid','${OTHER}',false);" \
  -c "select public.add_milestone_photo('${HM}','https://norjaglyaotzewxavmhv.supabase.co/storage/v1/object/public/history/${HM}/b.jpg','','',false)" 2>&1 | tail -1 | tr -d ' \n')
case "${HP2}" in ????????-*) echo "  ok   Senior Adviser 再掛一張（沒勾同意）"; pass=$((pass+1));; *) echo "  FAIL Senior Adviser 掛照片失敗：${HP2}"; fail=$((fail+1));; esac
chkrole anon "" "★ 沒勾同意的那一張對外看不到（這一站照片還是 1 張）" "1" \
  "select jsonb_array_length(e->'photos') from public.public_milestones() j, jsonb_array_elements(j) e where e->>'slug'='2024-winter-camp'"
chkas "${PAUL}" "把第一張的同意取消" "${HP}" "select public.update_milestone_photo('${HP}', '{\"consent\":false}'::jsonb)"
chk "★ 同意一取消，那一站自動退回草稿" "draft" "select status from public.history_milestones where id='${HM}'"
chkrole anon "" "對外立刻少了這一站（7 點）" "7" "select jsonb_array_length(public.public_milestones())"
chkas "${DIR}" "刪照片回它的網址（後台拿去刪 Storage 的檔）" "https://norjaglyaotzewxavmhv.supabase.co/storage/v1/object/public/history/${HM}/b.jpg" "select public.delete_milestone_photo('${HP2}')"
chkraise "不是編的人刪不了照片（not_allowed）" "not_allowed" \
  "perform set_config('test.uid','${ISTAFF}',true); perform public.delete_milestone_photo('${HP}');"
HM0=$(psql -d "${DB}" -X -A -t -q -c "select id from public.history_milestones where slug='2020-founded'" | tr -d ' \n')
chkas "${DIR}" "重排：新的那一站搬到最前面" "2" "select public.reorder_milestones(array['${HM}','${HM0}']::uuid[])"
chk "sort 照傳進來的順序變 10、20" "10|20" "select (select sort from public.history_milestones where id='${HM}')||'|'||(select sort from public.history_milestones where id='${HM0}')"
chkraise "不是編的人重排不了（not_allowed）" "not_allowed" \
  "perform set_config('test.uid','${ISTAFF}',true); perform public.reorder_milestones(array['${HM}']::uuid[]);"
chkas "${DIR}" "改代號與日期" "${HM}" "select public.upsert_milestone('{\"id\":\"${HM}\",\"slug\":\"2024-first-winter-camp\",\"happened_on\":\"2024-01-21\"}'::jsonb)"
chkraise "改成已經有人用的代號擋（slug_taken）" "slug_taken" \
  "perform set_config('test.uid','${DIR}',true); perform public.upsert_milestone('{\"id\":\"${HM}\",\"slug\":\"2020-founded\"}'::jsonb);"
# Storage 政策（替身表）：編的人傳得上 history bucket，別的幹部不行。
chkrole authenticated "${DIR}" "★ Storage：Marketing 的 Director 傳得上 history bucket" "1" \
  "insert into storage.objects (bucket_id, name, owner) values ('history','${HM}/a.jpg','${DIR}'); select count(*) from storage.objects where bucket_id='history'"
stgot=$(psql -d "${DB}" -X -A -t -q -c "select set_config('test.uid','${ISTAFF}',false);" -c "set role authenticated; insert into storage.objects (bucket_id, name, owner) values ('history','${HM}/x.jpg','${ISTAFF}');" 2>&1 || true)
if echo "${stgot}" | grep -qi "row-level security"; then echo "  ok   ★ 破壞測試：別的 team 的幹部傳不上 history bucket（RLS）"; pass=$((pass+1)); else echo "  FAIL 別的幹部傳得上 history bucket：${stgot}"; fail=$((fail+1)); fi
chkrole anon "" "Storage：沒登入的人讀得到 history bucket 的檔（對外頁要用 <img>）" "1" "select count(*) from storage.objects where bucket_id='history'"
psql -d "${DB}" -q -c "delete from storage.objects where bucket_id='history';" >/dev/null
# 破壞測試：把同意那一道門拿掉，驗收表要變紅。
BROKEN=$(mktemp)
sed "s/if not public.milestone_consent_ok(p_id) then raise exception 'consent_required' using errcode = 'P0001'; end if;//" supabase/migrations/2026-11-06-history-milestones.sql > "${BROKEN}"
bkgot=$(psql -d "${DB}" -X -A -t -q -f "${BROKEN}" 2>&1 || true)
if echo "${bkgot}" | grep -q "OVERALL.*FAIL"; then echo "  ok   ★ 破壞測試：拿掉同意那一道門，驗收表變紅"; pass=$((pass+1)); else echo "  FAIL 拿掉同意那一道門驗收表沒變紅"; fail=$((fail+1)); fi
rm -f "${BROKEN}"
rwgot=$(psql -d "${DB}" -X -A -t -q -f supabase/migrations/2026-11-06-history-milestones.sql 2>&1 || true)
if echo "${rwgot}" | grep -q "OVERALL.*PASS" && ! echo "${rwgot}" | grep -q "FAIL"; then echo "  ok   歷史之路那支可以重跑（裝回同意那一道門）"; pass=$((pass+1)); else echo "  FAIL 歷史之路那支重跑沒過："; echo "${rwgot}" | grep -i "FAIL\|error" | head -4; fail=$((fail+1)); fi
chk "重跑不蓋掉改過的字（代號還是改過的）" "2024-first-winter-camp" "select slug from public.history_milestones where id='${HM}'"

echo "把老幹部請回來（2026-11-07）："
# 這時候：PAUL Co-President、OTHER Senior Adviser、MEMBER 校友、STU 學員。OLD1 那一筆 10-24 已經被認領了，所以另外建兩筆沒有帳號的人。
rwgot=$(psql -d "${DB}" -X -A -t -q -v ON_ERROR_STOP=1 -f supabase/migrations/2026-11-07-alumni-invite-back.sql 2>&1 || true)
if echo "${rwgot}" | grep -q "OVERALL.*PASS" && ! echo "${rwgot}" | grep -q "FAIL"; then
  echo "  ok   請回來那支遷移檔跑過，驗收表全部 PASS"; pass=$((pass+1))
else
  echo "  FAIL 請回來那支遷移檔沒過："; echo "${rwgot}" | grep -i "FAIL\|error\|LINE" | head -8; fail=$((fail+1))
fi
IB1=$(psql -d "${DB}" -X -A -t -q -c "select set_config('test.uid','${PAUL}',false);" -c "select public.add_person('陳回來','Comeback Chen','2022 屆的');" | tail -1 | tr -d ' \n')
IB2=$(psql -d "${DB}" -X -A -t -q -c "select set_config('test.uid','${PAUL}',false);" -c "select public.add_person('','Comeback Two','');" | tail -1 | tr -d ' \n')
psql -d "${DB}" -q -c "select set_config('test.uid','${PAUL}',false); select public.set_position('${IB1}','2024-25','','Associate, Marketing Team','Marketing Team');" >/dev/null
IBR=$(psql -d "${DB}" -X -A -t -q -c "select set_config('test.uid','${OTHER}',false);" \
  -c "select public.invite_back('${IB1}','Comeback@Example.com','en','歡迎回來')" 2>&1 | tail -1 | tr -d ' \n')
IBC=$(echo "${IBR}" | sed -n 's/.*"code":"\([^"]*\)".*/\1/p')
case "${IBC}" in bt-*) echo "  ok   Senior Adviser 對一筆沒有帳號的紀錄寄邀請信，拿到一組碼（${IBC}）"; pass=$((pass+1));; *) echo "  FAIL 請回來沒拿到碼：${IBR}"; fail=$((fail+1));; esac
chk "★ 碼是校友碼、綁紀錄、綁 email（小寫）、單次、30 天、記語言" "alumni|true|comeback@example.com|1|true|en" \
  "select grants||'|'||(person_id='${IB1}')||'|'||email||'|'||uses_left||'|'||(expires_at > now() + interval '29 days')||'|'||lang from public.invite_codes where code='${IBC}'"
chk "紀錄上記了 email（下次預填）、outbox 排了一封 invite、信裡有連結與那一句話" "comeback@example.com|1|true|true" \
  "select (select email from public.people where id='${IB1}')||'|'||(select count(*) from public.mail_outbox where invite_code='${IBC}')||'|'||(select body like '%/app/?invite=${IBC}%' from public.mail_outbox where invite_code='${IBC}')||'|'||(select body like '%歡迎回來%' from public.mail_outbox where invite_code='${IBC}')"
chk "變動紀錄記了一筆 invite_back" "1" "select count(*) from public.role_changes where field='invite_back' and new_value='${IBC}'"
chkas "${PAUL}" "★ 同一筆再按一次：回同一組碼、existing = true、沒有再寄第二封" "${IBC}|true|1" \
  "select (r->>'code')||'|'||(r->>'existing')||'|'||(select count(*) from public.mail_outbox where kind='invite' and to_email='comeback@example.com') from (select public.invite_back('${IB1}','other@example.com','zh') r) x"
chkas "${PAUL}" "名單上的邀請狀態：這一筆 queued、有 email" "queued|comeback@example.com" "select status||'|'||email from public.roster_invites() where person_id='${IB1}'"
chkrole authenticated "${MEMBER}" "★ 校友拿不到名單的邀請狀態" "0" "select count(*) from public.roster_invites()"
chkraise "★ 破壞測試：有帳號的紀錄不能請回來（person_has_account）" "person_has_account" \
  "perform set_config('test.uid','${PAUL}',true); perform public.invite_back((select id from public.people where profile_id='${MEMBER}'),'x@example.com','zh');"
chkraise "★ 破壞測試：email 已經是別人的登入擋（email_has_account）" "email_has_account" \
  "perform set_config('test.uid','${PAUL}',true); perform public.invite_back('${IB2}','member@example.com','zh');"
chkraise "壞的 email 擋（bad_email）" "bad_email" \
  "perform set_config('test.uid','${PAUL}',true); perform public.invite_back('${IB2}','nope','zh');"
chkraise "★ 破壞測試：不是 Co-President 也不是 Senior Adviser 叫不動（not_senior）" "not_senior" \
  "perform set_config('test.uid','${MEMBER}',true); perform public.invite_back('${IB2}','x@example.com','zh');"
chkraise "★ 破壞測試：綁著活的邀請的紀錄刪不掉（has_unused_invite）" "has_unused_invite" \
  "perform set_config('test.uid','${PAUL}',true); perform public.delete_person('${IB1}');"
# ── 一批：一列壞 email、一列已經有活的邀請、一列好的 ──
IBM=$(psql -d "${DB}" -X -A -t -q -c "select set_config('test.uid','${PAUL}',false);" \
  -c "select public.invite_back_many('[{\"person\":\"${IB2}\",\"email\":\"bad\",\"lang\":\"zh\"},{\"person\":\"${IB1}\",\"email\":\"comeback@example.com\",\"lang\":\"zh\"},{\"person\":\"${IB2}\",\"email\":\"two@example.com\",\"lang\":\"zh\"}]'::jsonb)" 2>&1 | grep -v '^$' | tail -1)
chk "★ 一批三列：第一列壞 email 回 error 寫原因、第二列 existing、第三列 sent；壞的那一列沒有擋住後面的" "error|true|existing|sent" \
  "select (j->0->>'status')||'|'||((j->0->>'error') like '%bad_email%')||'|'||(j->1->>'status')||'|'||(j->2->>'status') from (select '${IBM}'::jsonb j) x"
chk "第一列真的寄了：碼綁 IB2、outbox 一封；批次本身記一筆 invite_back" "1|1|1" \
  "select (select count(*) from public.invite_codes where person_id='${IB2}' and email='two@example.com' and uses_left>0)||'|'||(select count(*) from public.mail_outbox where kind='invite' and to_email='two@example.com')||'|'||(select count(*) from public.role_changes where field='invite_back' and old_value='bulk')"
# ── 認領：錯的 email 擋、對的 email 變校友並拿回紀錄與職位 ──
IBW=aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaab1
IBX=aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaab2
psql -d "${DB}" -q -c "insert into auth.users (id,email) values ('${IBW}','stranger@example.com'), ('${IBX}','comeback@example.com');
  insert into public.profiles (id,name_zh,name_en,role) values ('${IBW}','','Stranger','student'), ('${IBX}','','Comeback Chen','student');" >/dev/null
chkraise "★★ 破壞測試：用別的 email 登入認領被擋（invite_wrong_email）" "invite_wrong_email" \
  "perform set_config('test.uid','${IBW}',true); perform public.claim_invite('${IBC}');"
chkas "${IBX}" "★ 對的 email 認領：變成校友" "upgraded_alumni" "select public.claim_invite('${IBC}')"
chkas "${PAUL}" "紀錄歸到他、2024-25 的職位在他身上、名單狀態 claimed" "true|1|claimed" \
  "select (select profile_id='${IBX}' from public.people where id='${IB1}')||'|'||(select count(*) from public.positions where person_id='${IB1}' and term_id='2024-25')||'|'||(select status from public.roster_invites() where person_id='${IB1}')"
# ── 邀請頁打名字：同名的沒帳號紀錄剛好一筆就掛上去，不再多建一筆 ──
NP=$(psql -d "${DB}" -X -A -t -q -c "select count(*) from public.people" | tr -d ' \n')
psql -d "${DB}" -q -c "select set_config('test.uid','${PAUL}',false); select public.revoke_invite((select code from public.invite_codes where person_id='${IB2}' and uses_left>0 limit 1));" >/dev/null
IBP=$(psql -d "${DB}" -X -A -t -q -c "select set_config('test.uid','${PAUL}',false);" \
  -c "select public.invite_person('two2@example.com','alumni',null,'','comeback two','','','','','','','zh')" 2>&1 | tail -1 | tr -d ' \n')
case "${IBP}" in bt-*) echo "  ok   邀請頁打了同名（不分大小寫）的名字，拿到碼（${IBP}）"; pass=$((pass+1));; *) echo "  FAIL 邀請頁同名沒成：${IBP}"; fail=$((fail+1));; esac
chk "★ 掛到既有那一筆：people 沒多、碼綁 IB2、紀錄的 email 更新" "${NP}|true|two2@example.com" \
  "select (select count(*) from public.people)||'|'||(select person_id='${IB2}' from public.invite_codes where code='${IBP}')||'|'||(select email from public.people where id='${IB2}')"
IB3=$(psql -d "${DB}" -X -A -t -q -c "select set_config('test.uid','${PAUL}',false);" -c "select public.add_person('','Comeback Chen','另一個同名的');" | tail -1 | tr -d ' \n')
IB4=$(psql -d "${DB}" -X -A -t -q -c "select set_config('test.uid','${PAUL}',false);" -c "select public.add_person('','comeback chen','又一個');" | tail -1 | tr -d ' \n')
chkraise "★ 同名好幾筆就問（ambiguous_person 帶兩個 id）" "ambiguous_person:.*${IB3}.*${IB4}\|ambiguous_person:.*${IB4}.*${IB3}" \
  "perform set_config('test.uid','${PAUL}',true); perform public.invite_person('three@example.com','alumni',null,'','Comeback Chen','','','','','','','zh');"
IBQ=$(psql -d "${DB}" -X -A -t -q -c "select set_config('test.uid','${PAUL}',false);" \
  -c "select public.invite_person('three@example.com','alumni',null,'','Comeback Chen','','','','','','','zh','${IB4}')" 2>&1 | tail -1 | tr -d ' \n')
chk "畫面選定那一筆帶 p_person：碼綁 IB4" "t" "select person_id='${IB4}' from public.invite_codes where code='${IBQ}'"
NP2=$(psql -d "${DB}" -X -A -t -q -c "select count(*) from public.people" | tr -d ' \n')
IBN=$(psql -d "${DB}" -X -A -t -q -c "select set_config('test.uid','${PAUL}',false);" \
  -c "select public.invite_person('four@example.com','alumni',null,'','Comeback Chen','','','','','','','zh','00000000-0000-0000-0000-000000000000')" 2>&1 | tail -1 | tr -d ' \n')
chk "帶全零 uuid 就一定建新的一筆" "$((NP2+1))" "select count(*) from public.people"
chkraise "帶的那一筆有帳號就擋（person_has_account）" "person_has_account" \
  "perform set_config('test.uid','${PAUL}',true); perform public.invite_person('five@example.com','alumni',null,'','','','','','','','','zh','${IB1}');"
# ── 校友的歡迎卡 ──
chkas "${IBX}" "校友關掉歡迎卡：寫了時間" "t" "select public.dismiss_alumni_welcome() is not null"
chkrole authenticated "${IBX}" "自己讀得到那個時間" "t" "select alumni_welcome_dismissed_at is not null from public.profiles where id='${IBX}'"
chkas "${IBX}" "再按一次不會改時間" "t" "select public.dismiss_alumni_welcome() = (select alumni_welcome_dismissed_at from public.profiles where id='${IBX}')"
# 破壞測試：把「有帳號擋」拿掉，驗收表要變紅。
BROKEN=$(mktemp)
sed "s/if v_profile is not null then raise exception 'person_has_account' using errcode = 'P0001'; end if;//" supabase/migrations/2026-11-07-alumni-invite-back.sql > "${BROKEN}"
bkgot=$(psql -d "${DB}" -X -A -t -q -f "${BROKEN}" 2>&1 || true)
if echo "${bkgot}" | grep -q "OVERALL.*FAIL"; then echo "  ok   ★ 破壞測試：拿掉「有帳號擋」，驗收表變紅"; pass=$((pass+1)); else echo "  FAIL 拿掉「有帳號擋」驗收表沒變紅"; fail=$((fail+1)); fi
rm -f "${BROKEN}"
rwgot=$(psql -d "${DB}" -X -A -t -q -f supabase/migrations/2026-11-07-alumni-invite-back.sql 2>&1 || true)
if echo "${rwgot}" | grep -q "OVERALL.*PASS" && ! echo "${rwgot}" | grep -q "FAIL"; then echo "  ok   請回來那支可以重跑（裝回那一道門）"; pass=$((pass+1)); else echo "  FAIL 請回來那支重跑沒過："; echo "${rwgot}" | grep -i "FAIL\|error" | head -4; fail=$((fail+1)); fi
chk "重跑不動資料：紀錄上的 email 還在" "two2@example.com" "select email from public.people where id='${IB2}'"
chkas "${PAUL}" "★ 名單上 pending_code 不再抓邀請信那組碼（IB4 綁著的是邀請信，印空的）" "" "select coalesce(pending_code,'') from public.roster() where person_id='${IB4}'"

echo "財務（2026-11-08）："
# 這時候：PAUL Co-President、OTHER Senior Adviser、MEMBER 校友、STU 學員，當屆是 2027-28（上面結束這一屆那一段切過去的）。
# 另外建兩個人：SD 是這一屆 Sponsorship Team 的 Director（看得到、改得動）、ASSOC 是一般幹部（什麼都碰不到）。
SD=66660000-0000-0000-0000-000000000001
ASSOC=77770000-0000-0000-0000-000000000001
SDP=66660000-0000-0000-0000-0000000000a1
psql -d "${DB}" -q -v ON_ERROR_STOP=1 <<SQL
insert into auth.users (id,email) values ('${SD}','sponsor@example.com'), ('${ASSOC}','assoc@example.com');
insert into public.profiles (id,name_zh,name_en,team,role,board_role) values
  ('${SD}','贊助長','Sponsor Lee','Sponsorship Team','cadre','director'),
  ('${ASSOC}','小幹部','Assoc Wu','Sponsorship Team','cadre','member');
insert into public.people (id,name_zh,name_en,profile_id) values ('${SDP}','贊助長','Sponsor Lee','${SD}');
insert into public.positions (person_id,term_id,title_zh,title_en,team) values ('${SDP}','2027-28','Sponsorship 的 Director','Director, Sponsorship Team','Sponsorship Team');
SQL
rwgot=$(psql -d "${DB}" -X -A -t -q -v ON_ERROR_STOP=1 -f supabase/migrations/2026-11-08-finance.sql 2>&1 || true)
if echo "${rwgot}" | grep -q "OVERALL.*PASS" && ! echo "${rwgot}" | grep -q "FAIL"; then
  echo "  ok   財務那支遷移檔跑過，驗收表全部 PASS"; pass=$((pass+1))
else
  echo "  FAIL 財務那支遷移檔沒過："; echo "${rwgot}" | grep -i "FAIL\|error\|LINE" | head -8; fail=$((fail+1))
fi
# ── 兩道門 ──
chkas "${PAUL}"  "Co-President：看得到、改得動" "true|true" "select public.can_view_finance()||'|'||public.can_edit_finance()"
chkas "${OTHER}" "★ Senior Adviser：看得到、改不動" "true|false" "select public.can_view_finance()||'|'||public.can_edit_finance()"
chkas "${SD}"    "★ Sponsorship 的 Director：看得到、改得動" "true|true" "select public.can_view_finance()||'|'||public.can_edit_finance()"
chkas "${ASSOC}" "★ 一般幹部：都不行" "false|false" "select public.can_view_finance()||'|'||public.can_edit_finance()"
chkas "${STU}"   "學員：都不行" "false|false" "select public.can_view_finance()||'|'||public.can_edit_finance()"
chkas "${SD}"    "★ my_access() 給 Director 一格 finance = edit（側欄靠它）" "edit" "select w->>'level' from public.my_access() a, jsonb_array_elements(a->'workspaces') w where w->>'id'='finance'"
chkas "${OTHER}" "my_access() 給 Senior Adviser 一格 finance = view" "view" "select w->>'level' from public.my_access() a, jsonb_array_elements(a->'workspaces') w where w->>'id'='finance'"
chkas "${ASSOC}" "★ my_access() 不給一般幹部 finance 那一格" "0" "select count(*) from public.my_access() a, jsonb_array_elements(a->'workspaces') w where w->>'id'='finance'"
chkas "${DIR}"   "別的 team 的 Director 也沒有" "0" "select count(*) from public.my_access() a, jsonb_array_elements(a->'workspaces') w where w->>'id'='finance'"
# ── 帳戶 ──
FA1=$(psql -d "${DB}" -X -A -t -q -c "select set_config('test.uid','${SD}',false);" -c "select public.fin_upsert_account('{\"name_zh\":\"玉山活存\",\"name_en\":\"E.Sun checking\",\"kind\":\"bank\",\"opening_balance\":100000,\"opening_on\":\"2027-09-08\"}'::jsonb)" | tail -1 | tr -d ' \n')
FA2=$(psql -d "${DB}" -X -A -t -q -c "select set_config('test.uid','${SD}',false);" -c "select public.fin_upsert_account('{\"name_zh\":\"現金\",\"name_en\":\"Cash box\",\"kind\":\"cash\",\"opening_balance\":5000,\"opening_on\":\"2027-09-08\"}'::jsonb)" | tail -1 | tr -d ' \n')
chk "★ Sponsorship 的 Director 開了兩個帳戶（開帳餘額與開帳日都在）" "2|100000.00|2027-09-08" \
  "select (select count(*) from public.fin_accounts)||'|'||(select opening_balance from public.fin_accounts where id='${FA1}')||'|'||(select opening_on from public.fin_accounts where id='${FA1}')"
chkraise "★ 破壞測試：Senior Adviser 開不了帳戶（not_finance_editor）" "not_finance_editor" \
  "perform set_config('test.uid','${OTHER}',true); perform public.fin_upsert_account('{\"name_zh\":\"x\"}'::jsonb);"
chkraise "★ 破壞測試：一般幹部開不了帳戶（not_finance_editor）" "not_finance_editor" \
  "perform set_config('test.uid','${ASSOC}',true); perform public.fin_upsert_account('{\"name_zh\":\"x\"}'::jsonb);"
chkraise "沒有名字擋（need_name）" "need_name" \
  "perform set_config('test.uid','${SD}',true); perform public.fin_upsert_account('{\"kind\":\"cash\"}'::jsonb);"
chkas "${PAUL}" "Co-President 改名字、改開帳餘額（改了就存那條路）" "玉山活存（協會）|100500.00" \
  "select public.fin_upsert_account('{\"id\":\"${FA1}\",\"name_zh\":\"玉山活存（協會）\",\"opening_balance\":100500}'::jsonb); select name_zh||'|'||opening_balance from public.fin_accounts where id='${FA1}'"
# ── 類別 ──
CI=$(psql -d "${DB}" -X -A -t -q -c "select id from public.fin_categories where code='sponsorship'" | tr -d ' \n')
CC=$(psql -d "${DB}" -X -A -t -q -c "select id from public.fin_categories where code='crowdfunding'" | tr -d ' \n')
CE=$(psql -d "${DB}" -X -A -t -q -c "select id from public.fin_categories where code='venue'" | tr -d ' \n')
CF=$(psql -d "${DB}" -X -A -t -q -c "select id from public.fin_categories where code='food'" | tr -d ' \n')
chk "類別 seed：收入五種、支出八種" "5|8" "select (select count(*) from public.fin_categories where kind='income')||'|'||(select count(*) from public.fin_categories where kind='expense')"
chkas "${SD}" "改一個類別的名字（code 留著，重跑 seed 不會蓋回去）" "場地租借|venue" \
  "select public.fin_upsert_category('{\"id\":\"${CE}\",\"name_zh\":\"場地租借\"}'::jsonb); select name_zh||'|'||code from public.fin_categories where id='${CE}'"
# ── 收支 ──
T1=$(psql -d "${DB}" -X -A -t -q -c "select set_config('test.uid','${SD}',false);" -c "select public.fin_add_transaction('{\"happened_on\":\"2027-09-10\",\"kind\":\"income\",\"amount\":30000,\"currency\":\"TWD\",\"account_id\":\"${FA1}\",\"category_id\":\"${CI}\",\"counterparty\":\"台積電慈善基金會\"}'::jsonb)" | tail -1 | tr -d ' \n')
T2=$(psql -d "${DB}" -X -A -t -q -c "select set_config('test.uid','${SD}',false);" -c "select public.fin_add_transaction('{\"happened_on\":\"2027-09-12\",\"kind\":\"expense\",\"amount\":8000,\"currency\":\"TWD\",\"account_id\":\"${FA1}\",\"category_id\":\"${CE}\",\"counterparty\":\"松菸\"}'::jsonb)" | tail -1 | tr -d ' \n')
T3=$(psql -d "${DB}" -X -A -t -q -c "select set_config('test.uid','${SD}',false);" -c "select public.fin_add_transaction('{\"happened_on\":\"2027-09-15\",\"kind\":\"transfer\",\"amount\":2000,\"currency\":\"TWD\",\"account_id\":\"${FA1}\",\"to_account_id\":\"${FA2}\"}'::jsonb)" | tail -1 | tr -d ' \n')
T4=$(psql -d "${DB}" -X -A -t -q -c "select set_config('test.uid','${PAUL}',false);" -c "select public.fin_add_transaction('{\"happened_on\":\"2027-09-20\",\"kind\":\"expense\",\"amount\":500,\"currency\":\"TWD\",\"account_id\":\"${FA2}\",\"category_id\":\"${CF}\",\"note\":\"便當\"}'::jsonb)" | tail -1 | tr -d ' \n')
T5=$(psql -d "${DB}" -X -A -t -q -c "select set_config('test.uid','${SD}',false);" -c "select public.fin_add_transaction('{\"happened_on\":\"2027-10-01\",\"kind\":\"income\",\"amount\":100,\"currency\":\"USD\",\"fx_rate\":32,\"account_id\":\"${FA1}\",\"category_id\":\"${CI}\"}'::jsonb)" | tail -1 | tr -d ' \n')
T7=$(psql -d "${DB}" -X -A -t -q -c "select set_config('test.uid','${SD}',false);" -c "select public.fin_add_transaction('{\"happened_on\":\"2027-05-01\",\"kind\":\"income\",\"amount\":777,\"currency\":\"TWD\",\"account_id\":\"${FA1}\",\"category_id\":\"${CC}\",\"counterparty\":\"嘖嘖\"}'::jsonb)" | tail -1 | tr -d ' \n')
chk "★ 六筆進去了：屆由日期算（9、10 月是 2027-28，5 月那筆是 2026-27）、誰登的有記" "6|2027-28|2026-27|${SD}|${PAUL}" \
  "select (select count(*) from public.fin_transactions)||'|'||(select term_id from public.fin_transactions where id='${T1}')||'|'||(select term_id from public.fin_transactions where id='${T7}')||'|'||(select entered_by from public.fin_transactions where id='${T1}')||'|'||(select entered_by from public.fin_transactions where id='${T4}')"
chk "★ 美金那筆：存了匯率，台幣 = 100 × 32 = 3200" "100.00|32.000000|3200.00|USD" \
  "select amount||'|'||fx_rate||'|'||amount_twd||'|'||currency from public.fin_transactions where id='${T5}'"
chkraise "★ 破壞測試：美金沒匯率擋（need_fx_rate）" "need_fx_rate" \
  "perform set_config('test.uid','${SD}',true); perform public.fin_add_transaction('{\"happened_on\":\"2027-10-01\",\"kind\":\"income\",\"amount\":100,\"currency\":\"USD\",\"account_id\":\"${FA1}\",\"category_id\":\"${CI}\"}'::jsonb);"
chkraise "破壞測試：轉帳轉給自己擋（same_account）" "same_account" \
  "perform set_config('test.uid','${SD}',true); perform public.fin_add_transaction('{\"happened_on\":\"2027-10-01\",\"kind\":\"transfer\",\"amount\":100,\"account_id\":\"${FA1}\",\"to_account_id\":\"${FA1}\"}'::jsonb);"
chkraise "破壞測試：轉帳少轉入帳戶擋（transfer_needs_two_accounts）" "transfer_needs_two_accounts" \
  "perform set_config('test.uid','${SD}',true); perform public.fin_add_transaction('{\"happened_on\":\"2027-10-01\",\"kind\":\"transfer\",\"amount\":100,\"account_id\":\"${FA1}\"}'::jsonb);"
chkraise "破壞測試：金額 0 擋（bad_amount）" "bad_amount" \
  "perform set_config('test.uid','${SD}',true); perform public.fin_add_transaction('{\"happened_on\":\"2027-10-01\",\"kind\":\"expense\",\"amount\":0,\"account_id\":\"${FA1}\",\"category_id\":\"${CE}\"}'::jsonb);"
chkraise "破壞測試：收入選了支出的類別擋（category_kind_mismatch）" "category_kind_mismatch" \
  "perform set_config('test.uid','${SD}',true); perform public.fin_add_transaction('{\"happened_on\":\"2027-10-01\",\"kind\":\"income\",\"amount\":10,\"account_id\":\"${FA1}\",\"category_id\":\"${CE}\"}'::jsonb);"
chkraise "破壞測試：支出沒選類別擋（need_category）" "need_category" \
  "perform set_config('test.uid','${SD}',true); perform public.fin_add_transaction('{\"happened_on\":\"2027-10-01\",\"kind\":\"expense\",\"amount\":10,\"account_id\":\"${FA1}\"}'::jsonb);"
chkraise "★ 破壞測試：Senior Adviser 加不了（not_finance_editor）" "not_finance_editor" \
  "perform set_config('test.uid','${OTHER}',true); perform public.fin_add_transaction('{\"happened_on\":\"2027-10-01\",\"kind\":\"expense\",\"amount\":10,\"account_id\":\"${FA1}\",\"category_id\":\"${CE}\"}'::jsonb);"
chkraise "★ 破壞測試：一般幹部加不了（not_finance_editor）" "not_finance_editor" \
  "perform set_config('test.uid','${ASSOC}',true); perform public.fin_add_transaction('{\"happened_on\":\"2027-10-01\",\"kind\":\"expense\",\"amount\":10,\"account_id\":\"${FA1}\",\"category_id\":\"${CE}\"}'::jsonb);"
# ── 餘額的算法（跟 test/finance.test.mjs 的 overview 同一條公式）──
chkas "${OTHER}" "★ 餘額：玉山 = 100500 + 30000 − 8000 − 2000 + 3200（5 月那筆在開帳日之前不算）、現金 = 5000 + 2000 − 500" "123700.00|6500.00|130200.00" \
  "select (o->'balances'->0->>'balance')||'|'||(o->'balances'->1->>'balance')||'|'||(o->>'total') from (select public.fin_overview('2027-28') o) x"
chkas "${OTHER}" "★ 這一屆的收入與支出：收入 30000 + 3200、支出 8000 + 500；轉帳兩邊都不算" "33200.00|8500.00" \
  "select (o->>'income')||'|'||(o->>'expense') from (select public.fin_overview('2027-28') o) x"
chkas "${OTHER}" "上一屆只有嘖嘖那 777" "777.00|0" \
  "select (o->>'income')||'|'||(o->>'expense') from (select public.fin_overview('2026-27') o) x"
chkas "${OTHER}" "每月：9 月 30000 / 8500、10 月 3200 / 0" "2027-09|30000.00|8500.00|2027-10|3200.00|0" \
  "select (o->'months'->0->>'ym')||'|'||(o->'months'->0->>'income')||'|'||(o->'months'->0->>'expense')||'|'||(o->'months'->1->>'ym')||'|'||(o->'months'->1->>'income')||'|'||(o->'months'->1->>'expense') from (select public.fin_overview('2027-28') o) x"
chkas "${OTHER}" "照類別：場地租借 8000、餐飲 500" "8000.00|500.00" \
  "select (select c->>'amount' from jsonb_array_elements(o->'categories') c where c->>'category_id'='${CE}')||'|'||(select c->>'amount' from jsonb_array_elements(o->'categories') c where c->>'category_id'='${CF}') from (select public.fin_overview('2027-28') o) x"
chkraise "★ 破壞測試：一般幹部拿不到總覽（not_finance_viewer）" "not_finance_viewer" \
  "perform set_config('test.uid','${ASSOC}',true); perform public.fin_overview('2027-28');"
chkraise "★ 破壞測試：一般幹部拿不到 bootstrap（not_finance_viewer）" "not_finance_viewer" \
  "perform set_config('test.uid','${ASSOC}',true); perform public.fin_bootstrap();"
chkas "${SD}" "bootstrap：兩個帳戶、十三個類別、can_edit = true" "2|13|true" \
  "select jsonb_array_length(b->'accounts')||'|'||jsonb_array_length(b->'categories')||'|'||(b->>'can_edit') from (select public.fin_bootstrap() b) x"
chkas "${OTHER}" "bootstrap 給 Senior Adviser：can_edit = false" "false" "select b->>'can_edit' from (select public.fin_bootstrap() b) x"
# ── RLS：表本身 ──
chkrole authenticated "${OTHER}" "★ Senior Adviser 直接讀表讀得到六筆" "6" "select count(*) from public.fin_transactions"
chkrole authenticated "${ASSOC}" "★ 一般幹部直接讀表是 0 筆（RLS）" "0" "select count(*) from public.fin_transactions"
chkrole authenticated "${ASSOC}" "一般幹部讀帳戶、類別、預算、紀錄全部 0" "0|0|0|0" \
  "select (select count(*) from public.fin_accounts)||'|'||(select count(*) from public.fin_categories)||'|'||(select count(*) from public.fin_budgets)||'|'||(select count(*) from public.fin_log)"
chkrole authenticated "${STU}" "學員也是 0" "0" "select count(*) from public.fin_transactions"
angot=$(psql -d "${DB}" -X -A -t -q -c "set role anon; select count(*) from public.fin_transactions" 2>&1 | tr -d ' \n' || true)
case "${angot}" in *"permissiondenied"*) echo "  ok   ★ anon 讀表被擋（permission denied）"; pass=$((pass+1));; *) echo "  FAIL anon 讀表沒被擋：${angot}"; fail=$((fail+1));; esac
angot=$(psql -d "${DB}" -X -A -t -q -c "set role authenticated; select set_config('test.uid','${SD}',false); insert into public.fin_transactions (happened_on,kind,amount,amount_twd,account_id,category_id) values ('2027-10-01','expense',1,1,'${FA1}','${CE}')" 2>&1 | tr -d ' \n' || true)
case "${angot}" in *"permissiondenied"*) echo "  ok   ★ 能改的人也不能直接 insert 表（只能走函式）"; pass=$((pass+1));; *) echo "  FAIL 直接 insert 沒被擋：${angot}"; fail=$((fail+1));; esac
# ── 改與作廢 ──
chkas "${SD}" "改一筆：對象與備註" "松山文創園區|發票在Drive" \
  "select public.fin_update_transaction('${T2}','{\"counterparty\":\"松山文創園區\",\"note\":\"發票在 Drive\"}'::jsonb); select counterparty||'|'||note from public.fin_transactions where id='${T2}'"
chkas "${SD}" "改一筆：換成美金就重算台幣、換日期就重算屆" "50.00|USD|1600.00|2026-27" \
  "select public.fin_update_transaction('${T4}','{\"amount\":50,\"currency\":\"USD\",\"fx_rate\":32,\"happened_on\":\"2027-06-01\"}'::jsonb); select amount||'|'||currency||'|'||amount_twd||'|'||term_id from public.fin_transactions where id='${T4}'"
chkas "${SD}" "改回來" "500.00|TWD|500.00|2027-28" \
  "select public.fin_update_transaction('${T4}','{\"amount\":500,\"currency\":\"TWD\",\"happened_on\":\"2027-09-20\"}'::jsonb); select amount||'|'||currency||'|'||amount_twd||'|'||term_id from public.fin_transactions where id='${T4}'"
chkas "${SD}" "收據：寫路徑" "${T2}/1.pdf" \
  "select public.fin_update_transaction('${T2}','{\"receipt_path\":\"${T2}/1.pdf\"}'::jsonb); select receipt_path from public.fin_transactions where id='${T2}'"
chkas "${SD}" "收據：再拿掉（patch 帶 null）" "" \
  "select public.fin_update_transaction('${T2}','{\"receipt_path\":null}'::jsonb); select coalesce(receipt_path,'') from public.fin_transactions where id='${T2}'"
T6=$(psql -d "${DB}" -X -A -t -q -c "select set_config('test.uid','${SD}',false);" -c "select public.fin_add_transaction('{\"happened_on\":\"2027-09-25\",\"kind\":\"expense\",\"amount\":999,\"currency\":\"TWD\",\"account_id\":\"${FA1}\",\"category_id\":\"${CE}\"}'::jsonb)" | tail -1 | tr -d ' \n')
chkas "${OTHER}" "多登了一筆 999，總覽跟著變" "9499.00" "select o->>'expense' from (select public.fin_overview('2027-28') o) x"
chkraise "★ 破壞測試：作廢不寫原因擋（need_reason）" "need_reason" \
  "perform set_config('test.uid','${SD}',true); perform public.fin_void_transaction('${T6}','  ');"
chkraise "★ 破壞測試：Senior Adviser 作廢不了（not_finance_editor）" "not_finance_editor" \
  "perform set_config('test.uid','${OTHER}',true); perform public.fin_void_transaction('${T6}','x');"
chkas "${PAUL}" "★ Co-President 作廢那一筆：留著、標了時間、誰、原因" "true|${PAUL}|重複登了" \
  "select public.fin_void_transaction('${T6}','重複登了'); select (voided_at is not null)||'|'||voided_by||'|'||void_reason from public.fin_transactions where id='${T6}'"
chkas "${OTHER}" "★ 作廢的不算：總覽回到 8500、餘額不變" "8500.00|123700.00" \
  "select (o->>'expense')||'|'||(o->'balances'->0->>'balance') from (select public.fin_overview('2027-28') o) x"
chkraise "★★ 破壞測試：作廢過的不能再改（tx_voided）" "tx_voided" \
  "perform set_config('test.uid','${SD}',true); perform public.fin_update_transaction('${T6}','{\"amount\":1}'::jsonb);"
chkraise "作廢過的不能再作廢（tx_voided）" "tx_voided" \
  "perform set_config('test.uid','${SD}',true); perform public.fin_void_transaction('${T6}','再一次');"
# ── 紀錄 ──
chk "★ fin_log：每一次新增、改、作廢都有一列，前後值都在" "7|true|true" \
  "select (select count(*) from public.fin_log where table_name='fin_transactions' and action='insert')||'|'||(select count(*)=1 from public.fin_log where table_name='fin_transactions' and action='void' and row_id='${T6}' and before->>'voided_at' is null and after->>'void_reason'='重複登了')||'|'||(select count(*)>=4 from public.fin_log where table_name='fin_transactions' and action='update' and row_id in ('${T2}','${T4}'))"
chk "fin_log 記了帳戶與類別的改動與誰改的" "true|true" \
  "select (select count(*)=1 from public.fin_log where table_name='fin_accounts' and action='update' and row_id='${FA1}' and who='${PAUL}' and after->>'name_zh'='玉山活存（協會）')||'|'||(select count(*)=1 from public.fin_log where table_name='fin_categories' and action='update' and row_id='${CE}')"
# ── 預算 ──
chkas "${SD}" "設這一屆場地的預算 20000" "20000.00" "select public.fin_set_budget('2027-28','${CE}',20000); select amount_twd from public.fin_budgets where term_id='2027-28' and category_id='${CE}'"
chkas "${SD}" "再設一次是改不是多一列" "1|25000.00" "select public.fin_set_budget('2027-28','${CE}',25000); select (select count(*) from public.fin_budgets)||'|'||(select amount_twd from public.fin_budgets where category_id='${CE}')"
chkraise "★ 破壞測試：Senior Adviser 設不了預算（not_finance_editor）" "not_finance_editor" \
  "perform set_config('test.uid','${OTHER}',true); perform public.fin_set_budget('2027-28','${CE}',1);"
chkraise "收入的類別不能有預算（no_such_category）" "no_such_category" \
  "perform set_config('test.uid','${SD}',true); perform public.fin_set_budget('2027-28','${CI}',1);"
chkas "${OTHER}" "總覽的預算對花掉：場地 25000 對 8000" "25000.00|8000.00" \
  "select (b->>'budget')||'|'||(b->>'spent') from (select public.fin_overview('2027-28') o) x, jsonb_array_elements(o->'budget') b where b->>'category_id'='${CE}'"
# ── 匯出 ──
chkas "${OTHER}" "★ 匯出這一屆：六筆（含作廢的那筆），帶帳戶與類別名字、作廢欄" "6|1|玉山活存（協會）|場地租借" \
  "select (select count(*) from public.fin_export('2027-28'))||'|'||(select count(*) from public.fin_export('2027-28') where voided)||'|'||(select account_zh from public.fin_export('2027-28') where happened_on='2027-09-12')||'|'||(select category_zh from public.fin_export('2027-28') where happened_on='2027-09-12')"
chkas "${OTHER}" "匯出全部、匯出一段日期" "7|2" \
  "select (select count(*) from public.fin_export(null))||'|'||(select count(*) from public.fin_export('2027-28','2027-09-15','2027-09-20'))"
chkraise "★ 破壞測試：一般幹部匯不出（not_finance_viewer）" "not_finance_viewer" \
  "perform set_config('test.uid','${ASSOC}',true); perform count(*) from public.fin_export(null);"
# ── 帳戶封存 ──
chkas "${SD}" "封存現金帳戶：總覽不列它、總額只剩玉山" "true|1|123700.00" \
  "select public.fin_upsert_account('{\"id\":\"${FA2}\",\"archived\":true}'::jsonb); select (select archived_at is not null from public.fin_accounts where id='${FA2}')||'|'||(select jsonb_array_length(o->'balances') from (select public.fin_overview('2027-28') o) x)||'|'||(select o->>'total' from (select public.fin_overview('2027-28') o) x)"
chkas "${SD}" "恢復" "f" "select public.fin_upsert_account('{\"id\":\"${FA2}\",\"archived\":false}'::jsonb); select archived_at is not null from public.fin_accounts where id='${FA2}'"
# ── Storage（替身）──
chk "bucket receipts 是私人的、5 MB、只收圖與 PDF" "false|5242880|4" "select public||'|'||file_size_limit||'|'||array_length(allowed_mime_types,1) from storage.buckets where id='receipts'"
chkrole authenticated "${SD}" "★ Sponsorship 的 Director 傳得上收據" "1" "insert into storage.objects (bucket_id,name,owner) values ('receipts','${T2}/r.pdf','${SD}'); select count(*) from storage.objects where bucket_id='receipts'"
chkrole authenticated "${OTHER}" "★ Senior Adviser 讀得到收據的列" "1" "select count(*) from storage.objects where bucket_id='receipts'"
stgot=$(psql -d "${DB}" -X -A -t -q -c "select set_config('test.uid','${OTHER}',false);" -c "set role authenticated; insert into storage.objects (bucket_id,name,owner) values ('receipts','${T2}/x.pdf','${OTHER}')" 2>&1 | tr -d ' \n' || true)
case "${stgot}" in *"row-levelsecurity"*) echo "  ok   ★ 破壞測試：Senior Adviser 傳收據被 RLS 擋"; pass=$((pass+1));; *) echo "  FAIL Senior Adviser 傳收據沒被擋：${stgot}"; fail=$((fail+1));; esac
chkrole authenticated "${ASSOC}" "★ 一般幹部看不到任何收據" "0" "select count(*) from storage.objects where bucket_id='receipts'"
chkrole anon "" "★ anon 看不到任何收據" "0" "select count(*) from storage.objects where bucket_id='receipts'"
# ── 破壞測試：把「作廢過的擋」拿掉，驗收表要變紅；重跑裝回去、資料不動 ──
BROKEN=$(mktemp)
sed "s/if t.voided_at is not null then raise exception 'tx_voided' using errcode = 'P0001'; end if;//" supabase/migrations/2026-11-08-finance.sql > "${BROKEN}"
bkgot=$(psql -d "${DB}" -X -A -t -q -f "${BROKEN}" 2>&1 || true)
if echo "${bkgot}" | grep -q "OVERALL.*FAIL"; then echo "  ok   ★ 破壞測試：拿掉「作廢過的擋」，驗收表變紅"; pass=$((pass+1)); else echo "  FAIL 拿掉「作廢過的擋」驗收表沒變紅"; fail=$((fail+1)); fi
rm -f "${BROKEN}"
rwgot=$(psql -d "${DB}" -X -A -t -q -f supabase/migrations/2026-11-08-finance.sql 2>&1 || true)
if echo "${rwgot}" | grep -q "OVERALL.*PASS" && ! echo "${rwgot}" | grep -q "FAIL"; then echo "  ok   財務那支可以重跑（裝回那一道門）"; pass=$((pass+1)); else echo "  FAIL 財務那支重跑沒過："; echo "${rwgot}" | grep -i "FAIL\|error" | head -4; fail=$((fail+1)); fi
chk "★ 重跑不動資料：七筆、兩個帳戶、改過的類別名字還在、seed 沒多" "7|2|場地租借|13" \
  "select (select count(*) from public.fin_transactions)||'|'||(select count(*) from public.fin_accounts)||'|'||(select name_zh from public.fin_categories where code='venue')||'|'||(select count(*) from public.fin_categories)"
chkraise "重跑之後作廢過的還是不能改（tx_voided）" "tx_voided" \
  "perform set_config('test.uid','${SD}',true); perform public.fin_update_transaction('${T6}','{\"amount\":1}'::jsonb);"

echo "行銷需求單第二版（2026-11-09）："
# 這時候 requests 裡有第一版那一段留下的兩張：RQ（done）、RQ2（withdrawn）。先用超級使用者塞一張舊的 new，驗對照表。
# 另外建四個人：MKM 管需求工作區、MKE 改需求工作區、RQR 是 Curriculum 的幹部（送單的人）、OUTC 是別的 team 的幹部（什麼都沒被派）。
MKM=88880000-0000-0000-0000-000000000001
MKE=88880000-0000-0000-0000-000000000002
RQR=88880000-0000-0000-0000-000000000003
OUTC=88880000-0000-0000-0000-000000000004
OLDN=88880000-0000-0000-0000-0000000000f1
psql -d "${DB}" -q -v ON_ERROR_STOP=1 <<SQL
insert into auth.users (id,email) values ('${MKM}','mkm@example.com'), ('${MKE}','mke@example.com'), ('${RQR}','rqr@example.com'), ('${OUTC}','outc@example.com');
insert into public.profiles (id,name_zh,name_en,team,role,board_role) values
  ('${MKM}','行銷長','Mark Manage','Marketing Team','cadre','director'),
  ('${MKE}','行銷員','Mia Edit','Marketing Team','cadre','member'),
  ('${RQR}','課程員','Rae Curr','Curriculum Team','cadre','member'),
  ('${OUTC}','路人','Otto Out','Mentorship Team','cadre','member');
insert into public.assignments (user_id, workspace_id, level) values ('${MKM}','custom:marketing-requests','manage'), ('${MKE}','custom:marketing-requests','edit')
  on conflict (user_id, workspace_id) do update set level = excluded.level;
insert into public.requests (id, kind, title, requester, status) values ('${OLDN}','poster','舊的新單','${RQR}','new');
SQL
rwgot=$(psql -d "${DB}" -X -A -t -q -v ON_ERROR_STOP=1 -f supabase/migrations/2026-11-09-marketing-requests-v2.sql 2>&1 || true)
if echo "${rwgot}" | grep -q "OVERALL.*PASS" && ! echo "${rwgot}" | grep -q "FAIL"; then
  echo "  ok   需求單第二版那支遷移檔跑過，驗收表全部 PASS"; pass=$((pass+1))
else
  echo "  FAIL 需求單第二版那支遷移檔沒過："; echo "${rwgot}" | grep -i "FAIL\|error\|LINE" | head -8; fail=$((fail+1))
fi
chk "★ 舊狀態照對照表搬：new→submitted、done→published（記了發布時間）、withdrawn 不變" "submitted|published|true|withdrawn" \
  "select (select status from public.requests where id='${OLDN}')||'|'||(select status from public.requests where id='${RQ}')||'|'||(select published_at is not null from public.requests where id='${RQ}')||'|'||(select status from public.requests where id='${RQ2}')"
chk "舊單的第一版欄位還讀得到（說明、兩條素材連結）" "A2直式，要有報名QRcode|2" "select brief||'|'||array_length(asset_links,1) from public.requests where id='${RQ}'"
chk "★ 已發布那封文案換成第二版，中英兩欄都換（還是第一版預設值的才換）" "true|true|true|true" \
  "select (subject_zh like '%已發布%')::text||'|'||(body_zh like '%已經發布了%')::text||'|'||(subject_en like '%published%')::text||'|'||(body_en like '%is published%')::text from public.mail_templates where kind='request_done'"
RQ3=$(psql -d "${DB}" -X -A -t -q -c "select set_config('test.uid','${RQR}',false);" \
  -c "select public.submit_request('{\"title\":\"C-2 bootcamp 報名倒數\",\"owner_id\":\"${RQR}\",\"owner_team\":\"Curriculum Team\",\"goal_cta\":\"讓高中生點 bio 連結報名\",\"platforms\":[\"ig_carousel\",\"ig_story\"],\"key_line\":\"最後三天\",\"must_have\":[{\"text\":\"截止 12/1 23:59\",\"confirmed_by\":\"Rae\"},{\"text\":\"  \"},{\"text\":\"報名連結\"}],\"draft\":\"- 一\\n- 二\",\"visual_refs\":[{\"url\":\"https://instagram.com/p/x\",\"note\":\"字的排法\"},{\"url\":\"\",\"note\":\"沒網址\"}],\"publish_on\":\"2026-12-01\",\"shots\":[{\"who\":\"結尾的人\",\"what\":\"每人一句\",\"seconds\":\"8\",\"is_closing\":true},{\"who\":\"A\",\"what\":\"縮時做事\",\"seconds\":\"20\"},{\"who\":\"B\",\"what\":\"揮手\",\"seconds\":\"abc\"},{\"who\":\"\",\"what\":\"\"}],\"assignee\":\"${MKE}\"}'::jsonb)" 2>&1 | tail -1 | tr -d ' \n')
case "${RQ3}" in ????????-*) echo "  ok   幹部用第二版送了一張（${RQ3}）"; pass=$((pass+1));; *) echo "  FAIL 第二版送單失敗：${RQ3}"; fail=$((fail+1));; esac
chk "★ 送單的人塞了 assignee 也不算數（接的人是 Marketing 指定的）" "true" "select (assignee is null)::text from public.requests where id='${RQ3}'"
chk "存對：狀態、負責人、兩個平台、一定要有的兩條（空的丟掉）、視覺參考一條、發布日、種類算影片" "submitted|${RQR}|2|2|Rae|1|2026-12-01|video" \
  "select status||'|'||owner_id||'|'||cardinality(platforms)||'|'||jsonb_array_length(must_have)||'|'||(must_have->0->>'confirmed_by')||'|'||jsonb_array_length(visual_refs)||'|'||publish_on||'|'||kind from public.requests where id='${RQ3}'"
chk "★ 拍攝指示：空列丟掉、結尾話排到最後、秒數不是數字的留空" "3|true|A|20|true" \
  "select jsonb_array_length(shots)||'|'||(shots->2->>'is_closing')||'|'||(shots->0->>'who')||'|'||(shots->0->>'seconds')||'|'||((shots->1->'seconds')='null'::jsonb)::text from public.requests where id='${RQ3}'"
chk "送單排了一封 request_new 給 MKM（管的人），信裡有預計發布日" "1|true" \
  "select count(*)||'|'||bool_and(body like '%2026-12-01%') from public.mail_outbox where kind='request_new' and request_id='${RQ3}' and to_email='mkm@example.com'"
chkrole authenticated "${RQR}" "送單的人讀得到自己的單" "1" "select count(*) from public.requests where id='${RQ3}'"
chkrole authenticated "${OUTC}" "★ 破壞測試：別的 team 的幹部讀不到這張單" "0" "select count(*) from public.requests where id='${RQ3}'"
chkrole authenticated "${MKE}" "需求工作區「改」的人讀得到" "1" "select count(*) from public.requests where id='${RQ3}'"
chkraise "★ 破壞測試：送單的人指定不了接的人（not_allowed）" "not_allowed" \
  "perform set_config('test.uid','${RQR}',true); perform public.set_request_assignee('${RQ3}','${RQR}');"
chkraise "★ 別的 team 的幹部也指定不了（not_allowed）" "not_allowed" \
  "perform set_config('test.uid','${OUTC}',true); perform public.set_request_assignee('${RQ3}','${MKE}');"
chkraise "★ 接的人只能是需求工作區裡的人（not_in_workspace）" "not_in_workspace" \
  "perform set_config('test.uid','${MKE}',true); perform public.set_request_assignee('${RQ3}','${OUTC}');"
chkas "${MKE}" "「改」的人指定 MKE 自己接" "${MKE}" "select public.set_request_assignee('${RQ3}','${MKE}')"
chkas "${MKE}" "「接的人」名單：需求工作區的人（MKM、MKE 都在）" "2" "select count(*) from public.request_assignees() where id in ('${MKM}','${MKE}')"
chkraise "★ 別的 team 的幹部拿不到「接的人」名單（not_allowed）" "not_allowed" \
  "perform set_config('test.uid','${OUTC}',true); perform public.request_assignees();"
chkas "${MKE}" "改成進行中" "in_progress" "select public.set_request_status('${RQ3}','in_progress','')"
chkraise "★ 破壞測試：進行中了，送單的人收不回（already_started）" "already_started" \
  "perform set_config('test.uid','${RQR}',true); perform public.withdraw_request('${RQ3}');"
chkas "${MKE}" "改成待審核" "in_review" "select public.set_request_status('${RQ3}','in_review','')"
chkraise "待審核也收不回（already_started）" "already_started" \
  "perform set_config('test.uid','${RQR}',true); perform public.withdraw_request('${RQ3}');"
chkraise "不認得的狀態擋（bad_status）" "bad_status" \
  "perform set_config('test.uid','${MKE}',true); perform public.set_request_status('${RQ3}','bogus','');"
chkas "${MKE}" "標成已發布，寫回覆" "published" "select public.set_request_status('${RQ3}','published','發了，連結在 IG')"
chk "★ 已發布寄一封 request_done 給送單的人，信裡有回覆、連結、「已經發布」" "1|rqr@example.com|true|true|true" \
  "select count(*)||'|'||min(to_email)||'|'||bool_and(body like '%發了，連結在 IG%')||'|'||bool_and(body like '%/admin/#request/${RQ3}%')||'|'||bool_and(body like '%已經發布了%') from public.mail_outbox where kind='request_done' and request_id='${RQ3}'"
chkas "${MKE}" "退回待審核" "in_review" "select public.set_request_status('${RQ3}','in_review','')"
chkas "${MKE}" "再發布一次" "published" "select public.set_request_status('${RQ3}','published','')"
chk "★ 退回再發布不寄第二封" "1" "select count(*) from public.mail_outbox where kind='request_done' and request_id='${RQ3}'"
chkas "${MKE}" "舊頁面送 done 照對照表轉成 published（OLDN 那一張）" "published" "select public.set_request_status('${OLDN}','done','')"
chkas "${MKE}" "舊頁面送 new 轉成 submitted" "submitted" "select public.set_request_status('${OLDN}','new','')"
# 第四張：7 天規則只警告，明天發布照樣送得出去；「已送出」時收得回
RQ4=$(psql -d "${DB}" -X -A -t -q -c "select set_config('test.uid','${RQR}',false);" \
  -c "select public.submit_request(jsonb_build_object('title','明天就要','publish_on',(current_date + 1)::text))" 2>&1 | tail -1 | tr -d ' \n')
case "${RQ4}" in ????????-*) echo "  ok   ★ 發布日只剩一天也送得出去（7 天規則只在畫面警告）"; pass=$((pass+1));; *) echo "  FAIL 發布日太近被擋了：${RQ4}"; fail=$((fail+1));; esac
chkas "${RQR}" "★ 「已送出」時收得回" "withdrawn" "select public.withdraw_request('${RQ4}')"
chkraise "收回的 Marketing 指定不了接的人（withdrawn）" "withdrawn" \
  "perform set_config('test.uid','${MKE}',true); perform public.set_request_assignee('${RQ4}','${MKE}');"
chkraise "不認得的平台擋（bad_platform）" "bad_platform" \
  "perform set_config('test.uid','${RQR}',true); perform public.submit_request('{\"title\":\"x\",\"platforms\":[\"tiktok\"]}'::jsonb);"
chkraise "負責人不是幹部擋（bad_owner）" "bad_owner" \
  "perform set_config('test.uid','${RQR}',true); perform public.submit_request('{\"title\":\"x\",\"owner_id\":\"${MEMBER}\"}'::jsonb);"
chkraise "★ 校友送不了第二版的單（not_cadre）" "not_cadre" \
  "perform set_config('test.uid','${MEMBER}',true); perform public.submit_request('{\"title\":\"x\"}'::jsonb);"
RQ5=$(psql -d "${DB}" -X -A -t -q -c "select set_config('test.uid','${RQR}',false);" \
  -c "select public.submit_request('poster','舊頁面送的','','2026-12-01','','{}','')" 2>&1 | tail -1 | tr -d ' \n')
chk "第一版七個參數那支還送得出去，狀態是 submitted" "submitted" "select status from public.requests where id='${RQ5}'"
# 破壞測試：把「只在已送出時收得回」拿掉，驗收表要變紅；重跑裝回去、資料不動
BROKEN=$(mktemp)
sed "s/if r.status <> 'submitted' then raise exception 'already_started' using errcode = 'P0001'; end if;//" supabase/migrations/2026-11-09-marketing-requests-v2.sql > "${BROKEN}"
bkgot=$(psql -d "${DB}" -X -A -t -q -f "${BROKEN}" 2>&1 || true)
if echo "${bkgot}" | grep -q "OVERALL.*FAIL"; then echo "  ok   ★ 破壞測試：拿掉「只在已送出時收得回」，驗收表變紅"; pass=$((pass+1)); else echo "  FAIL 拿掉「只在已送出時收得回」驗收表沒變紅"; fail=$((fail+1)); fi
rm -f "${BROKEN}"
rwgot=$(psql -d "${DB}" -X -A -t -q -f supabase/migrations/2026-11-09-marketing-requests-v2.sql 2>&1 || true)
if echo "${rwgot}" | grep -q "OVERALL.*PASS" && ! echo "${rwgot}" | grep -q "FAIL"; then echo "  ok   需求單第二版那支可以重跑（裝回那一道門）"; pass=$((pass+1)); else echo "  FAIL 需求單第二版那支重跑沒過："; echo "${rwgot}" | grep -i "FAIL\|error" | head -4; fail=$((fail+1)); fi
chk "★ 重跑不動資料：RQ3 還是已發布、接的人還在、拍攝三列、信沒多寄" "published|${MKE}|3|1" \
  "select status||'|'||assignee||'|'||jsonb_array_length(shots)||'|'||(select count(*) from public.mail_outbox where kind='request_done' and request_id='${RQ3}') from public.requests where id='${RQ3}'"
chkraise "重跑之後收回的門還在（already_started）" "already_started" \
  "perform set_config('test.uid','${RQR}',true); perform public.withdraw_request('${RQ3}');"

echo
echo "── 護照藏月份（2026-11-10-hide-months.sql）──"
hmgot=$(psql -d "${DB}" -X -A -t -q -v ON_ERROR_STOP=1 -f supabase/migrations/2026-11-10-hide-months.sql 2>&1 || true)
if echo "${hmgot}" | grep -q "OVERALL.*PASS" && ! echo "${hmgot}" | grep -q "|FAIL"; then echo "  ok   藏月份那支驗收表全 PASS"; pass=$((pass+1)); else echo "  FAIL 藏月份那支驗收表："; echo "${hmgot}" | head -12; fail=$((fail+1)); fi
chk "第一次跑完藏的是九月、十月" "9,10" "select string_agg(month::text, ',' order by seq) from public.months where hidden"
chkraise "★ Associate 藏不了月份" "not_ws_edit" \
  "perform set_config('test.uid','${ASSOC}',true); perform public.set_month_hidden(11, true);"
chkraise "★ 學員藏不了月份" "not_ws_edit" \
  "perform set_config('test.uid','${STU}',true); perform public.set_month_hidden(11, true);"
chkraise "沒有這個月" "bad_month" \
  "perform set_config('test.uid','${PAUL}',true); perform public.set_month_hidden(13, true);"
chkas "${PAUL}" "Co-President 把九月打開" "" "select public.set_month_hidden(9, false)"
chk "九月打開了，十月還藏著" "10" "select string_agg(month::text, ',' order by seq) from public.months where hidden"
hm2=$(psql -d "${DB}" -X -A -t -q -f supabase/migrations/2026-11-10-hide-months.sql 2>&1 || true)
if echo "${hm2}" | grep -q "OVERALL.*PASS"; then echo "  ok   藏月份那支可以重跑"; pass=$((pass+1)); else echo "  FAIL 藏月份那支重跑沒過"; fail=$((fail+1)); fi
chk "★ 重跑不會把打開的九月又藏回去" "10" "select string_agg(month::text, ',' order by seq) from public.months where hidden"
chk "藏不是刪：月份還是 11 個" "11" "select count(*) from public.months"
# 破壞測試：拿掉那道門，驗收表要變紅
BROKEN=$(mktemp)
sed "s/  perform public.require_ws_edit('passport');//" supabase/migrations/2026-11-10-hide-months.sql > "${BROKEN}"
bk=$(psql -d "${DB}" -X -A -t -q -f "${BROKEN}" 2>&1 || true)
if echo "${bk}" | grep -q "OVERALL.*FAIL"; then echo "  ok   ★ 破壞測試：拿掉 require_ws_edit，驗收表變紅"; pass=$((pass+1)); else echo "  FAIL 拿掉 require_ws_edit 驗收表沒變紅"; fail=$((fail+1)); fi
rm -f "${BROKEN}"
psql -d "${DB}" -X -A -t -q -f supabase/migrations/2026-11-10-hide-months.sql >/dev/null 2>&1 || true
chkraise "裝回去之後 Associate 還是藏不了" "not_ws_edit" \
  "perform set_config('test.uid','${ASSOC}',true); perform public.set_month_hidden(11, true);"

echo "── 寄信修好（2026-11-11-fix-mail-send.sql）──"
# 先證明 bug 在：11-05 那一版的 send_pending_mail 寄一封新信會卡在 cannot cast。
psql -d "${DB}" -X -A -t -q -c "insert into public.mail_outbox (to_email, subject, body, kind) values ('fix1@x.test', 's', 'b', 'invite');" >/dev/null
psql -d "${DB}" -X -A -t -q -c "select set_config('test.uid','${PAUL}',false); select public.send_pending_mail(50);" >/dev/null 2>&1 || true
chk "★ 修之前：新信卡在 cannot cast（重現 Paul 回報的）" "1" "select count(*) from public.mail_outbox where to_email='fix1@x.test' and sent_at is null and error like '%cannot cast type record%'"
fxgot=$(psql -d "${DB}" -X -A -t -q -v ON_ERROR_STOP=1 -f supabase/migrations/2026-11-11-fix-mail-send.sql 2>&1 || true)
if echo "${fxgot}" | grep -q "OVERALL.*PASS" && ! echo "${fxgot}" | grep -q "|FAIL"; then echo "  ok   寄信修好那支驗收表全 PASS"; pass=$((pass+1)); else echo "  FAIL 寄信修好那支驗收表："; echo "${fxgot}" | head -12; fail=$((fail+1)); fi
chk "卡住的那封 tries 歸零了" "0" "select tries from public.mail_outbox where to_email='fix1@x.test'"
psql -d "${DB}" -X -A -t -q -c "insert into public.mail_outbox (to_email, subject, body, kind, ics) values ('fix2@x.test', 's', 'b', 'meeting_invite', 'BEGIN:VCALENDAR');" >/dev/null
psql -d "${DB}" -X -A -t -q -c "select set_config('test.uid','${PAUL}',false); select public.send_pending_mail(50);" >/dev/null 2>&1 || true
chk "★ 修之後：卡住的那封寄出去了" "t" "select sent_at is not null and error is null from public.mail_outbox where to_email='fix1@x.test'"
chk "★ 修之後：帶 .ics 的會議邀請也寄出去了" "t" "select sent_at is not null and error is null from public.mail_outbox where to_email='fix2@x.test'"
fx2=$(psql -d "${DB}" -X -A -t -q -f supabase/migrations/2026-11-11-fix-mail-send.sql 2>&1 || true)
if echo "${fx2}" | grep -q "OVERALL.*PASS"; then echo "  ok   寄信修好那支可以重跑"; pass=$((pass+1)); else echo "  FAIL 寄信修好那支重跑沒過"; fail=$((fail+1)); fi
# 破壞測試：把 r 改回 record，驗收表要變紅
BROKEN=$(mktemp)
sed "s/  r public.mail_outbox%rowtype; v_key text;/  r record; v_key text;/" supabase/migrations/2026-11-11-fix-mail-send.sql > "${BROKEN}"
bk=$(psql -d "${DB}" -X -A -t -q -f "${BROKEN}" 2>&1 || true)
if echo "${bk}" | grep -q "OVERALL.*FAIL"; then echo "  ok   ★ 破壞測試：r 改回 record，驗收表變紅"; pass=$((pass+1)); else echo "  FAIL r 改回 record 驗收表沒變紅"; fail=$((fail+1)); fi
rm -f "${BROKEN}"
psql -d "${DB}" -X -A -t -q -f supabase/migrations/2026-11-11-fix-mail-send.sql >/dev/null 2>&1 || true

echo "── 護照一個月一個月揭曉（2026-11-12-reveal-months.sql）──"
rvgot=$(psql -d "${DB}" -X -A -t -q -v ON_ERROR_STOP=1 -f supabase/migrations/2026-11-12-reveal-months.sql 2>&1 || true)
if echo "${rvgot}" | grep -q "OVERALL.*PASS" && ! echo "${rvgot}" | grep -q "|FAIL"; then echo "  ok   揭曉那支驗收表全 PASS"; pass=$((pass+1)); else echo "  FAIL 揭曉那支驗收表："; echo "${rvgot}" | head -12; fail=$((fail+1)); fi
chk "第一次跑完揭曉的是九、十、十一月" "9,10,11" "select string_agg(month::text, ',' order by seq) from public.months where revealed"
chkraise "★ Associate 揭曉不了" "not_ws_edit" \
  "perform set_config('test.uid','${ASSOC}',true); perform public.set_month_revealed(12, true);"
chkraise "★ 學員揭曉不了" "not_ws_edit" \
  "perform set_config('test.uid','${STU}',true); perform public.set_month_revealed(12, true);"
chkraise "沒有這個月" "bad_month" \
  "perform set_config('test.uid','${PAUL}',true); perform public.set_month_revealed(13, true);"
chkas "${PAUL}" "Co-President 揭曉十二月" "" "select public.set_month_revealed(12, true)"
chk "十二月揭曉了" "9,10,11,12" "select string_agg(month::text, ',' order by seq) from public.months where revealed"
rv2=$(psql -d "${DB}" -X -A -t -q -f supabase/migrations/2026-11-12-reveal-months.sql 2>&1 || true)
if echo "${rv2}" | grep -q "OVERALL.*PASS"; then echo "  ok   揭曉那支可以重跑"; pass=$((pass+1)); else echo "  FAIL 揭曉那支重跑沒過"; fail=$((fail+1)); fi
chk "★ 重跑不會把揭曉的十二月蓋回去" "9,10,11,12" "select string_agg(month::text, ',' order by seq) from public.months where revealed"
chk "藏起來那一欄沒被動到" "10" "select string_agg(month::text, ',' order by seq) from public.months where hidden"
BROKEN=$(mktemp)
sed "s/  perform public.require_ws_edit('passport');//" supabase/migrations/2026-11-12-reveal-months.sql > "${BROKEN}"
bk=$(psql -d "${DB}" -X -A -t -q -f "${BROKEN}" 2>&1 || true)
if echo "${bk}" | grep -q "OVERALL.*FAIL"; then echo "  ok   ★ 破壞測試：拿掉 require_ws_edit，驗收表變紅"; pass=$((pass+1)); else echo "  FAIL 拿掉 require_ws_edit 驗收表沒變紅"; fail=$((fail+1)); fi
rm -f "${BROKEN}"
psql -d "${DB}" -X -A -t -q -f supabase/migrations/2026-11-12-reveal-months.sql >/dev/null 2>&1 || true
chkraise "裝回去之後 Associate 還是揭曉不了" "not_ws_edit" \
  "perform set_config('test.uid','${ASSOC}',true); perform public.set_month_revealed(12, true);"

echo "── 幹部護照的月份全部從後台管（2026-11-13-passport-months-control.sql）──"
pmgot=$(psql -d "${DB}" -X -A -t -q -v ON_ERROR_STOP=1 -f supabase/migrations/2026-11-13-passport-months-control.sql 2>&1 || true)
if echo "${pmgot}" | grep -q "OVERALL.*PASS" && ! echo "${pmgot}" | grep -q "|FAIL"; then echo "  ok   月份那支驗收表全 PASS"; pass=$((pass+1)); else echo "  FAIL 月份那支驗收表："; echo "${pmgot}" | head -12; fail=$((fail+1)); fi
chk "★ 九月有人蓋過章，清理不動：九月、十月都還在" "2" "select count(*) from public.months where month in (9,10)"
chkraise "★ Associate 加不了月份" "not_ws_edit" "perform set_config('test.uid','${ASSOC}',true); perform public.add_month(8);"
chkraise "★ 學員刪不了月份" "not_ws_edit" "perform set_config('test.uid','${STU}',true); perform public.delete_month(9);"
chkraise "★ Associate 搬不了格子" "not_ws_edit" "perform set_config('test.uid','${ASSOC}',true); perform public.move_activity('09B', 11);"
chkraise "★ Associate 排不了順序" "not_ws_edit" "perform set_config('test.uid','${ASSOC}',true); perform public.move_month(9, 1);"
chkraise "已經有的月份加不了第二次" "month_exists" "perform set_config('test.uid','${PAUL}',true); perform public.add_month(9);"
chkraise "13 月不存在" "bad_month" "perform set_config('test.uid','${PAUL}',true); perform public.add_month(13);"
chkas "${PAUL}" "加八月，排在最後面" "12" "select public.add_month(8)"
chk "八月沒揭曉、沒藏、時刻空白" "false|false|" "select revealed||'|'||hidden||'|'||theme_zh from public.months where month=8"
chkas "${PAUL}" "八月往前移一格" "" "select public.move_month(8, -1)"
chk "八月跑到七月前面" "8,7" "select string_agg(month::text, ',' order by seq) from (select * from public.months order by seq desc limit 2) t"
chkas "${PAUL}" "已經在最前面再往前：不動、不報錯" "" "select public.move_month((select month from public.months order by seq limit 1), -1)"
chkas "${PAUL}" "在八月加一格" "08A" "select public.save_activity(null,8,'gather','八月聚會','Aug',null,false,null)"
chkas "${PAUL}" "八月往前再移一格（格子的 seq 跟著走）" "" "select public.move_month(8, -1)"
chk "★ 格子的 seq 等於它的月份的 seq" "0" "select count(*) from public.activities a join public.months m on m.month=a.month where a.seq <> m.seq"
chkraise "★ 還有格子的月份刪不掉" "month_has_boxes" "perform set_config('test.uid','${PAUL}',true); perform public.delete_month(8);"
chkraise "★ 有人蓋過的格子搬不動" "has_stamps" "perform set_config('test.uid','${PAUL}',true); perform public.move_activity('09A', 11);"
chkraise "★ 只寫過心得的格子也搬不動" "has_stamps" "perform set_config('test.uid','${PAUL}',true); perform public.move_activity('09C', 11);"
chkraise "搬到不存在的月份" "bad_month" "perform set_config('test.uid','${PAUL}',true); perform public.move_activity('08A', 13);"
chkas "${PAUL}" "08A 搬到十二月" "08A" "select public.move_activity('08A', 12)"
chk "編號不變、月份與 seq 換成十二月的" "08A|12|true" "select a.id||'|'||a.month||'|'||(a.seq = m.seq) from public.activities a join public.months m on m.month=12 where a.id='08A'"
chkas "${PAUL}" "八月空了，刪得掉" "8" "select public.delete_month(8)"
chk "八月不在了" "0" "select count(*) from public.months where month=8"
psql -d "${DB}" -X -A -t -q -c "insert into public.visas (user_id, month, code) select '${DIR}', 12, code from public.destinations limit 1 on conflict do nothing;" >/dev/null 2>&1 || true
psql -d "${DB}" -X -A -t -q -c "select set_config('test.uid','${PAUL}',false); select public.add_month(8);" >/dev/null 2>&1 || true
psql -d "${DB}" -X -A -t -q -c "insert into public.visas (user_id, month, code) select '${DIR}', 8, code from public.destinations limit 1 on conflict do nothing;" >/dev/null 2>&1 || true
chkraise "★ 有人拿到那個月入境章的月份刪不掉" "month_has_visas" "perform set_config('test.uid','${PAUL}',true); perform public.delete_month(8);"
psql -d "${DB}" -X -A -t -q -c "delete from public.visas where month = 8; delete from public.months where month = 8;" >/dev/null
# 破壞測試：拿掉「還有格子就擋」，驗收表要變紅
BROKEN=$(mktemp)
sed "s/  perform public.require_ws_edit('passport');//" supabase/migrations/2026-11-13-passport-months-control.sql > "${BROKEN}"
bk=$(psql -d "${DB}" -X -A -t -q -f "${BROKEN}" 2>&1 || true)
if echo "${bk}" | grep -q "OVERALL.*FAIL"; then echo "  ok   ★ 破壞測試：拿掉 require_ws_edit，驗收表變紅"; pass=$((pass+1)); else echo "  FAIL 拿掉 require_ws_edit 驗收表沒變紅"; fail=$((fail+1)); fi
rm -f "${BROKEN}"
psql -d "${DB}" -X -A -t -q -f supabase/migrations/2026-11-13-passport-months-control.sql >/dev/null 2>&1 || true
chkraise "裝回去之後 Associate 還是加不了月份" "not_ws_edit" "perform set_config('test.uid','${ASSOC}',true); perform public.add_month(8);"
# 清理那一段：做成跟正式站一樣（九月只有 09B、十月是空的、沒人蓋過），再跑一次。
psql -d "${DB}" -X -A -t -q -c "delete from public.stamps where act_id in (select id from public.activities where month in (9,10));
  delete from public.entries where act_id in (select id from public.activities where month in (9,10));
  delete from public.visas where month in (9,10);
  update public.activities set callback_to = null where callback_to in (select id from public.activities where month in (9,10) and id <> '09B');
  delete from public.activities where month in (9,10) and id <> '09B';
  insert into public.activities (id, month, seq, category, title_zh, title_en, callback_to) select '07B', 7, seq, 'prompt', '現在還算數嗎', 'STILL TRUE?', '09B' from public.months where month = 7 on conflict (id) do update set callback_to = '09B';" >/dev/null
pm2=$(psql -d "${DB}" -X -A -t -q -f supabase/migrations/2026-11-13-passport-months-control.sql 2>&1 || true)
if echo "${pm2}" | grep -q "OVERALL.*PASS"; then echo "  ok   月份那支可以重跑"; pass=$((pass+1)); else echo "  FAIL 月份那支重跑沒過"; fail=$((fail+1)); fi
chk "★ 清理做了：九月、十月不在了" "0" "select count(*) from public.months where month in (9,10)"
chk "★ 09B 搬到十一月，七月那格還回望它" "11|09B" "select coalesce((select month::text from public.activities where id='09B'),'沒有09B')||'|'||coalesce((select callback_to from public.activities where id='07B'),'沒有07B回望')"
pm3=$(psql -d "${DB}" -X -A -t -q -f supabase/migrations/2026-11-13-passport-months-control.sql 2>&1 || true)
if echo "${pm3}" | grep -q "OVERALL.*PASS"; then echo "  ok   清理之後再重跑也沒事"; pass=$((pass+1)); else echo "  FAIL 清理之後重跑沒過"; fail=$((fail+1)); fi

echo "── 實習護照的分類從後台管（2026-11-14-intern-groups.sql）──"
iggot=$(psql -d "${DB}" -X -A -t -q -v ON_ERROR_STOP=1 -f supabase/migrations/2026-11-14-intern-groups.sql 2>&1 || true)
if echo "${iggot}" | grep -q "OVERALL.*PASS" && ! echo "${iggot}" | grep -q "|FAIL"; then echo "  ok   分類那支驗收表全 PASS"; pass=$((pass+1)); else echo "  FAIL 分類那支驗收表："; echo "${iggot}" | head -12; fail=$((fail+1)); fi
chk "原本那三個分類照順序放進去了" "onboard,project,reflect" "select string_agg(key, ',' order by seq) from public.intern_groups"
chkraise "★ 學員（不是 Internship team） 加不了分類" "not_internship_team" "perform set_config('test.uid','${STU}',true); perform public.save_intern_group(null,'x','X','','','','');"
chkraise "★ 學員（不是 Internship team） 刪不了分類" "not_internship_team" "perform set_config('test.uid','${STU}',true); perform public.delete_intern_group('reflect');"
chkraise "★ 學員（不是 Internship team） 排不了順序" "not_internship_team" "perform set_config('test.uid','${STU}',true); perform public.move_intern_group('reflect', -1);"
chkraise "名字留白會被擋" "empty_title" "perform set_config('test.uid','${ISTAFF}',true); perform public.save_intern_group(null,' ','X','','','','');"
igkey=$(psql -d "${DB}" -X -A -t -q -c "select set_config('test.uid','${ISTAFF}',false);" -c "select public.save_intern_group(null,'分享','Share','跟大家說','Tell everyone','說明','Body')" 2>&1 | tail -1 | tr -d ' ')
chk "新增一個分類：代號自己產生、排在最後" "Share|true" "select name_en||'|'||(seq = (select max(seq) from public.intern_groups)) from public.intern_groups where key='${igkey}'"
chkas "${ISTAFF}" "新的分類底下加一格" "T2627-77" "select public.save_intern_task('T2627-77','2026-27',77,'${igkey}','分享一次','SHARE ONCE',null)"
chkraise "★ 不存在的分類放不進格子" "bad_category" "perform set_config('test.uid','${ISTAFF}',true); perform public.save_intern_task('T2627-78','2026-27',78,'nope','x','X',null);"
chkraise "★ 還有格子的分類刪不掉" "group_has_tasks" "perform set_config('test.uid','${ISTAFF}',true); perform public.delete_intern_group('${igkey}');"
chkas "${ISTAFF}" "改名字" "${igkey}" "select public.save_intern_group('${igkey}','分享會','Sharing','','','','')"
chk "改到了，代號沒變" "分享會|Sharing" "select name_zh||'|'||name_en from public.intern_groups where key='${igkey}'"
chkas "${ISTAFF}" "往前移一格" "" "select public.move_intern_group('${igkey}', -1)"
chk "跑到反思前面" "onboard,project,${igkey},reflect" "select string_agg(key, ',' order by seq) from public.intern_groups where key in ('onboard','project','reflect','${igkey}')"
chkas "${ISTAFF}" "格子換回任務" "T2627-77" "select public.save_intern_task('T2627-77','2026-27',77,'project','分享一次','SHARE ONCE',null)"
chkas "${ISTAFF}" "空了的分類刪得掉" "${igkey}" "select public.delete_intern_group('${igkey}')"
chk "刪掉了" "0" "select count(*) from public.intern_groups where key='${igkey}'"
chkrole authenticated "${STU}" "★ 學員讀不到分類（RLS）" "0" "select count(*) from public.intern_groups"
chkrole authenticated "${ISTAFF}" "【對照】Internship team 讀得到分類，跟格子同一條" "true|true" "select ((select count(*) from public.intern_groups) > 0)::text||'|'||((select count(*) from public.intern_tasks) > 0)::text"
ig2=$(psql -d "${DB}" -X -A -t -q -f supabase/migrations/2026-11-14-intern-groups.sql 2>&1 || true)
if echo "${ig2}" | grep -q "OVERALL.*PASS"; then echo "  ok   分類那支可以重跑"; pass=$((pass+1)); else echo "  FAIL 分類那支重跑沒過"; fail=$((fail+1)); fi
BROKEN=$(mktemp)
sed "s/  perform public.require_internship_team();//" supabase/migrations/2026-11-14-intern-groups.sql > "${BROKEN}"
bk=$(psql -d "${DB}" -X -A -t -q -f "${BROKEN}" 2>&1 || true)
if echo "${bk}" | grep -q "OVERALL.*FAIL"; then echo "  ok   ★ 破壞測試：拿掉 require_internship_team，驗收表變紅"; pass=$((pass+1)); else echo "  FAIL 拿掉 require_internship_team 驗收表沒變紅"; fail=$((fail+1)); fi
rm -f "${BROKEN}"
psql -d "${DB}" -X -A -t -q -f supabase/migrations/2026-11-14-intern-groups.sql >/dev/null 2>&1 || true
chkraise "裝回去之後外人還是加不了分類" "not_internship_team" "perform set_config('test.uid','${STU}',true); perform public.save_intern_group(null,'x','X','','','','');"

echo "── 格子的時間與範例照片（2026-11-15-box-time-and-example.sql）──"
bxgot=$(psql -d "${DB}" -X -A -t -q -v ON_ERROR_STOP=1 -f supabase/migrations/2026-11-15-box-time-and-example.sql 2>&1 || true)
if echo "${bxgot}" | grep -q "OVERALL.*PASS" && ! echo "${bxgot}" | grep -q "|FAIL"; then echo "  ok   格子那支驗收表全 PASS"; pass=$((pass+1)); else echo "  FAIL 格子那支驗收表："; echo "${bxgot}" | head -12; fail=$((fail+1)); fi
EXU="https://norjaglyaotzewxavmhv.supabase.co/storage/v1/object/public/passport-examples/09B/1-a.jpg"
chkas "${PAUL}" "存時間與照片" "09B" "select public.set_activity_extras('09B', '2026-11-22 12:00:00+00', '${EXU}')"
chk "存到了" "2026-11-22T12:00|true" "select to_char(happens_at at time zone 'UTC','YYYY-MM-DD\"T\"HH24:MI')||'|'||(example_url = '${EXU}')::text from public.activities where id='09B'"
chkraise "★ 別的網站的照片網址擋掉" "bad_example_url" "perform set_config('test.uid','${PAUL}',true); perform public.set_activity_extras('09B', null, 'https://evil.example.com/a.jpg');"
chkraise "★ 別的 bucket 也擋" "bad_example_url" "perform set_config('test.uid','${PAUL}',true); perform public.set_activity_extras('09B', null, 'https://x.supabase.co/storage/v1/object/public/history/a.jpg');"
chkraise "★ Associate 改不了" "not_ws_edit" "perform set_config('test.uid','${ASSOC}',true); perform public.set_activity_extras('09B', null, null);"
chkas "${PAUL}" "清掉時間與照片" "09B" "select public.set_activity_extras('09B', null, '  ')"
chk "清掉了" "t|t" "select (happens_at is null)::text::char(1)||'|'||(example_url is null)::text::char(1) from public.activities where id='09B'"
BROKEN=$(mktemp)
sed "s/  perform public.require_ws_edit('passport');//" supabase/migrations/2026-11-15-box-time-and-example.sql > "${BROKEN}"
bk=$(psql -d "${DB}" -X -A -t -q -f "${BROKEN}" 2>&1 || true)
if echo "${bk}" | grep -q "OVERALL.*FAIL"; then echo "  ok   ★ 破壞測試：拿掉 require_ws_edit，驗收表變紅"; pass=$((pass+1)); else echo "  FAIL 拿掉 require_ws_edit 驗收表沒變紅"; fail=$((fail+1)); fi
rm -f "${BROKEN}"
psql -d "${DB}" -X -A -t -q -f supabase/migrations/2026-11-15-box-time-and-example.sql >/dev/null 2>&1 || true
bx2=$(psql -d "${DB}" -X -A -t -q -f supabase/migrations/2026-11-15-box-time-and-example.sql 2>&1 || true)
if echo "${bx2}" | grep -q "OVERALL.*PASS"; then echo "  ok   格子那支可以重跑"; pass=$((pass+1)); else echo "  FAIL 格子那支重跑沒過"; fail=$((fail+1)); fi

echo "── 信的語言、照片、刪會不寄信（2026-11-16-mail-language-photo.sql）──"
mlgot=$(psql -d "${DB}" -X -A -t -q -v ON_ERROR_STOP=1 -f supabase/migrations/2026-11-16-mail-language-photo.sql 2>&1 || true)
if echo "${mlgot}" | grep -q "OVERALL.*PASS" && ! echo "${mlgot}" | grep -q "|FAIL"; then echo "  ok   信那支驗收表全 PASS"; pass=$((pass+1)); else echo "  FAIL 信那支驗收表："; echo "${mlgot}" | head -12; fail=$((fail+1)); fi
chk "★ 預設沒有照片：版型裡只有 logo 一張圖" "1" "select (length(h) - length(replace(h, '<img', ''))) / 4 from (select public.mail_html('invite', 's', 'b', null, 'https://x', 'zh') as h) t"
chk "預設照收信的人（auto）" "auto" "select lang_mode from public.mail_templates where kind='invite'"
chkraise "★ Associate 改不了信的選項" "not_senior" "perform set_config('test.uid','${ASSOC}',true); perform public.set_mail_options('invite','en',null);"
chkraise "語言只收四種" "bad_lang_mode" "perform set_config('test.uid','${PAUL}',true); perform public.set_mail_options('invite','jp',null);"
chkraise "★ 別的網址的照片擋掉" "bad_photo_url" "perform set_config('test.uid','${PAUL}',true); perform public.set_mail_options('invite','auto','https://evil.example.com/a.jpg');"
MPU="https://norjaglyaotzewxavmhv.supabase.co/storage/v1/object/public/mail-photos/invite/1-a.jpg"
chkas "${PAUL}" "邀請信只寄英文、放一張照片" "invite" "select public.set_mail_options('invite','en','${MPU}')"
chk "★ 只寄英文：不管收信的人是誰都是 en" "en" "select public.mail_lang_pick('invite', 'nobody@x.test', 'zh')"
chk "★ 放了照片就印那一張" "t" "select position('${MPU}' in public.mail_html('invite', 's', 'b', null, 'https://x', 'en')) > 0"
chkas "${PAUL}" "改回照收信的人、拿掉照片" "invite" "select public.set_mail_options('invite','auto','')"
chk "改回來了" "auto|t" "select lang_mode||'|'||(hero_url is null)::text::char(1) from public.mail_templates where kind='invite'"
MTG=$(psql -d "${DB}" -X -A -t -q -c "insert into public.meetings (scope, title, starts_at, ends_at) values ('board','刪掉的會', now() + interval '1 day', now() + interval '1 day 1 hour') returning id;" | head -1 | tr -d ' ')
psql -d "${DB}" -X -A -t -q -c "insert into public.mail_outbox (to_email, subject, body, kind, meeting_id) values ('gone1@x.test','s','b','meeting_reminder','${MTG}'), ('gone2@x.test','s','b','meeting_invite','${MTG}');
  insert into public.mail_outbox (to_email, subject, body, kind, meeting_id, sent_at) values ('sent@x.test','s','b','meeting_invite','${MTG}', now());" >/dev/null
chkas "${PAUL}" "刪掉這場會" "deleted" "select public.delete_meeting('${MTG}')"
chk "★ 還沒寄的兩封一起拿掉，寄過的那封留著當紀錄" "0|1" "select (select count(*) from public.mail_outbox where to_email in ('gone1@x.test','gone2@x.test'))||'|'||(select count(*) from public.mail_outbox where to_email='sent@x.test')"
ml2=$(psql -d "${DB}" -X -A -t -q -f supabase/migrations/2026-11-16-mail-language-photo.sql 2>&1 || true)
if echo "${ml2}" | grep -q "OVERALL.*PASS"; then echo "  ok   信那支可以重跑"; pass=$((pass+1)); else echo "  FAIL 信那支重跑沒過"; fail=$((fail+1)); fi
BROKEN=$(mktemp)
sed "s/  delete from mail_outbox where meeting_id = p_id and sent_at is null;//" supabase/migrations/2026-11-16-mail-language-photo.sql > "${BROKEN}"
bk=$(psql -d "${DB}" -X -A -t -q -f "${BROKEN}" 2>&1 || true)
if echo "${bk}" | grep -q "OVERALL.*FAIL"; then echo "  ok   ★ 破壞測試：刪會不拿掉信，驗收表變紅"; pass=$((pass+1)); else echo "  FAIL 刪會不拿掉信驗收表沒變紅"; fail=$((fail+1)); fi
rm -f "${BROKEN}"
psql -d "${DB}" -X -A -t -q -f supabase/migrations/2026-11-16-mail-language-photo.sql >/dev/null 2>&1 || true
psql -d "${DB}" -X -A -t -q -c "insert into public.mail_outbox (to_email, subject, body, kind) values ('after@x.test', 's', 'b', 'invite');" >/dev/null
psql -d "${DB}" -X -A -t -q -c "select set_config('test.uid','${PAUL}',false); select public.send_pending_mail(50);" >/dev/null 2>&1 || true
chk "★ 重建之後信照樣寄得出去" "t" "select (sent_at is not null and error is null)::text::char(1) from public.mail_outbox where to_email='after@x.test'"

echo "── 必到、不能到的理由、主辦人總表（2026-11-17-meetings-home.sql）──"
mhgot=$(psql -d "${DB}" -X -A -t -q -v ON_ERROR_STOP=1 -f supabase/migrations/2026-11-17-meetings-home.sql 2>&1 || true)
if echo "${mhgot}" | grep -q "OVERALL.*PASS" && ! echo "${mhgot}" | grep -q "|FAIL"; then echo "  ok   首頁那支驗收表全 PASS"; pass=$((pass+1)); else echo "  FAIL 首頁那支驗收表："; echo "${mhgot}" | head -14; fail=$((fail+1)); fi
MH=$(psql -d "${DB}" -X -A -t -q -c "select set_config('test.uid','${PAUL}',false);" -c "select public.schedule_meeting('board','必到的會', now() + interval '2 days', now() + interval '2 days 1 hour', '', null, array['${DIR}','${ASSOC}']::uuid[], true);" 2>&1 | tail -1 | tr -d ' ')
chk "排會時勾必到就存成必到" "t" "select required::text::char(1) from public.meetings where id='${MH}'"
chkraise "★ 必到的會不能到沒填理由擋下來" "need_reason" "perform set_config('test.uid','${DIR}',true); perform public.set_rsvp('${MH}','declined');"
chkas "${DIR}" "填了理由就能回不能到" "declined" "select public.set_rsvp('${MH}','declined','那天要考試')"
chkas "${ASSOC}" "舊的兩參數叫法照樣能用" "accepted" "select public.set_rsvp('${MH}','accepted')"
chkrole authenticated "${ASSOC}" "★ 其他幹部看不到別人的理由" "0" "select count(*) from public.meeting_rsvp_notes where meeting_id='${MH}'"
chkrole authenticated "${DIR}" "本人看得到自己的理由" "1" "select count(*) from public.meeting_rsvp_notes where meeting_id='${MH}'"
chkrole authenticated "${PAUL}" "排會的人看得到理由" "1" "select count(*) from public.meeting_rsvp_notes where meeting_id='${MH}'"
chkas "${PAUL}" "改會沒給必到" "${MH}" "select public.save_meeting('${MH}','board','必到的會（改）', now() + interval '20 hours', now() + interval '21 hours', '', null, array['${DIR}','${ASSOC}']::uuid[])"
chk "★ 舊的後台存一次不會把必到洗掉" "t" "select required::text::char(1) from public.meetings where id='${MH}'"
chkas "${DIR}" "改成會到，理由一起拿掉" "accepted" "select public.set_rsvp('${MH}','accepted')"
chk "理由拿掉了" "0" "select count(*) from public.meeting_rsvp_notes where meeting_id='${MH}'"
chkas "${DIR}" "再改回不能到" "declined" "select public.set_rsvp('${MH}','declined','臨時要上班')"
psql -d "${DB}" -X -A -t -q -c "select public.queue_meeting_reminders();" >/dev/null 2>&1 || true
chk "★ 24 小時內：主辦人收到一封總表" "1" "select count(*) from public.mail_outbox where kind='meeting_summary' and meeting_id='${MH}'"
chk "★ 總表寫著誰不能到與理由" "t" "select (position('臨時要上班' in body) > 0)::text::char(1) from public.mail_outbox where kind='meeting_summary' and meeting_id='${MH}'"
chk "總表的按鈕到首頁" "t" "select (public.mail_button_url(o) like 'https://beyondtaiwannpo.com/home/?meeting=%')::text::char(1) from public.mail_outbox o where kind='meeting_summary' and meeting_id='${MH}'"
psql -d "${DB}" -X -A -t -q -c "select public.queue_meeting_reminders();" >/dev/null 2>&1 || true
chk "一場只寄一次總表" "1" "select count(*) from public.mail_outbox where kind='meeting_summary' and meeting_id='${MH}'"
mh2=$(psql -d "${DB}" -X -A -t -q -f supabase/migrations/2026-11-17-meetings-home.sql 2>&1 || true)
if echo "${mh2}" | grep -q "OVERALL.*PASS"; then echo "  ok   首頁那支可以重跑"; pass=$((pass+1)); else echo "  FAIL 首頁那支重跑沒過"; fail=$((fail+1)); fi
BROKEN=$(mktemp)
sed "s/  if p_status = 'declined' and v_req and v_note is null then raise exception 'need_reason' using errcode = 'P0001'; end if;//" supabase/migrations/2026-11-17-meetings-home.sql > "${BROKEN}"
bk=$(psql -d "${DB}" -X -A -t -q -f "${BROKEN}" 2>&1 || true)
if echo "${bk}" | grep -q "OVERALL.*FAIL"; then echo "  ok   ★ 破壞測試：拿掉理由檢查，驗收表變紅"; pass=$((pass+1)); else echo "  FAIL 拿掉理由檢查驗收表沒變紅"; fail=$((fail+1)); fi
sed "s/  using (user_id = auth.uid()/  using (true or user_id = auth.uid()/" supabase/migrations/2026-11-17-meetings-home.sql > "${BROKEN}"
psql -d "${DB}" -X -A -t -q -f "${BROKEN}" >/dev/null 2>&1 || true
chkrole authenticated "${ASSOC}" "★ 破壞測試：政策放寬就看得到別人的理由（證明上面那條真的在測 RLS）" "1" "select count(*) from public.meeting_rsvp_notes where meeting_id='${MH}'"
rm -f "${BROKEN}"
psql -d "${DB}" -X -A -t -q -f supabase/migrations/2026-11-17-meetings-home.sql >/dev/null 2>&1 || true
chkrole authenticated "${ASSOC}" "跑回正確版本又看不到了" "0" "select count(*) from public.meeting_rsvp_notes where meeting_id='${MH}'"

echo "── 會議變成真正的日曆邀請（2026-11-18-calendar-invites.sql）──"
cigot=$(psql -d "${DB}" -X -A -t -q -v ON_ERROR_STOP=1 -f supabase/migrations/2026-11-18-calendar-invites.sql 2>&1 || true)
if echo "${cigot}" | grep -q "OVERALL.*PASS" && ! echo "${cigot}" | grep -q "|FAIL"; then echo "  ok   日曆邀請那支驗收表全 PASS"; pass=$((pass+1)); else echo "  FAIL 日曆邀請那支驗收表："; echo "${cigot}" | head -16; fail=$((fail+1)); fi
CI=$(psql -d "${DB}" -X -A -t -q -c "select set_config('test.uid','${PAUL}',false);" -c "select public.schedule_meeting('board','日曆測試', now() + interval '3 days', now() + interval '3 days 1 hour', '議程；第一項, 第二項', null, array['${DIR}','${ASSOC}']::uuid[], true);" 2>&1 | tail -1 | tr -d ' ')
chk "★ 看板排會：名單兩個人加 BT 主帳號，三封邀請" "3" "select count(*) from public.mail_outbox where kind='meeting_invite' and meeting_id='${CI}'"
chk "★ BT 主帳號收到邀請" "1" "select count(*) from public.mail_outbox where kind='meeting_invite' and meeting_id='${CI}' and to_email='beyondtaiwan2020@gmail.com'"
chk "★ 邀請的日曆檔是 REQUEST、主辦人是排會的人" "t" "select (ics like '%METHOD:REQUEST%' and ics like '%ORGANIZER;CN=\"王平\":mailto:paul@example.com%')::text::char(1) from public.mail_outbox where kind='meeting_invite' and meeting_id='${CI}' and to_email='director@example.com'"
chk "★ 來賓名單有名單上的人與 BT 主帳號" "t" "select (ics like '%mailto:director@example.com%' and ics like '%mailto:beyondtaiwan2020@gmail.com%' and ics like '%ROLE=REQ-PARTICIPANT%')::text::char(1) from public.mail_outbox where kind='meeting_invite' and meeting_id='${CI}' and to_email='director@example.com'"
chk "日曆檔每一行都不超過 75 個位元組（中文照位元組折行）" "t" "select bool_and(octet_length(l) <= 75)::text::char(1) from public.mail_outbox o, regexp_split_to_table(o.ics, E'\r\n') l where kind='meeting_invite' and meeting_id='${CI}'"
chk "日曆檔版本號從 0 開始" "t" "select (ics like '%SEQUENCE:0%')::text::char(1) from public.mail_outbox where kind='meeting_invite' and meeting_id='${CI}' and to_email='director@example.com'"
chkrole authenticated "${PAUL}" "★ 網站上的人叫不到 meeting_ics（讀得到每個人的信箱）" "f" "select has_function_privilege('public.meeting_ics(uuid, text)', 'execute')::text::char(1)"
psql -d "${DB}" -X -A -t -q -c "update public.mail_outbox set sent_at = now() where meeting_id='${CI}';" >/dev/null
CIS=$(psql -d "${DB}" -X -A -t -q -c "select to_char(starts_at, 'YYYY-MM-DD HH24:MI:SS.US TZ') from public.meetings where id='${CI}'" | tr -d '\n')
chkas "${PAUL}" "原樣存一次" "${CI}" "select public.save_meeting('${CI}','board','日曆測試', (select starts_at from public.meetings where id='${CI}'), (select ends_at from public.meetings where id='${CI}'), '議程；第一項, 第二項', null, array['${DIR}','${ASSOC}']::uuid[])"
chk "★ 什麼都沒改就不記更新" "t" "select (cal_dirty_at is null)::text::char(1) from public.meetings where id='${CI}'"
chkas "${PAUL}" "改時間、拿掉一個人" "${CI}" "select public.save_meeting('${CI}','board','日曆測試', now() + interval '4 days', now() + interval '4 days 1 hour', '議程；第一項, 第二項', null, array['${DIR}']::uuid[])"
chk "★ 改了先記下來" "t" "select (cal_dirty_at is not null)::text::char(1) from public.meetings where id='${CI}'"
chk "★ 改完不馬上寄（後台改了就存，馬上寄會一格一封）" "0" "select count(*) from public.mail_outbox where kind in ('meeting_update','meeting_cancel') and meeting_id='${CI}'"
psql -d "${DB}" -X -A -t -q -c "select public.queue_meeting_reminders();" >/dev/null 2>&1 || true
chk "停手不到 10 分鐘、離開會還很久：排程跑過也還沒寄" "0" "select count(*) from public.mail_outbox where kind in ('meeting_update','meeting_cancel') and meeting_id='${CI}'"
psql -d "${DB}" -X -A -t -q -c "update public.meetings set cal_dirty_at = now() - interval '11 minutes' where id='${CI}'; select public.queue_meeting_reminders();" >/dev/null 2>&1 || true
chk "★ 停手 10 分鐘後：還在名單上的人與 BT 主帳號各一封更新" "2" "select count(*) from public.mail_outbox where kind='meeting_update' and meeting_id='${CI}'"
chk "★ 被拿掉的人收到取消" "1" "select count(*) from public.mail_outbox where kind='meeting_cancel' and meeting_id='${CI}' and to_email in (select lower(email) from auth.users where id='${ASSOC}')"
chk "更新的版本號加一、取消的日曆檔是 CANCEL" "t" "select (bool_and(case when kind='meeting_update' then ics like '%SEQUENCE:1%' and ics like '%METHOD:REQUEST%' else ics like '%METHOD:CANCEL%' and ics like '%STATUS:CANCELLED%' end))::text::char(1) from public.mail_outbox where kind in ('meeting_update','meeting_cancel') and meeting_id='${CI}'"
chk "寄完記號清掉" "t" "select (cal_dirty_at is null)::text::char(1) from public.meetings where id='${CI}'"
chk "取消信沒有按鈕（會可能已經刪了）" "" "select public.mail_button_url(o) from public.mail_outbox o where kind='meeting_cancel' and meeting_id='${CI}'"
psql -d "${DB}" -X -A -t -q -c "update public.mail_outbox set sent_at = now() where meeting_id='${CI}';" >/dev/null
chkas "${PAUL}" "把人加回來" "${CI}" "select public.save_meeting('${CI}','board','日曆測試', (select starts_at from public.meetings where id='${CI}'), (select ends_at from public.meetings where id='${CI}'), '議程；第一項, 第二項', null, array['${DIR}','${ASSOC}']::uuid[])"
psql -d "${DB}" -X -A -t -q -c "select public.meeting_flush_calendar('${CI}');" >/dev/null 2>&1 || true
chk "★ 被拿掉又加回來的人收到的是邀請，不是更新" "2" "select count(*) from public.mail_outbox where kind='meeting_invite' and meeting_id='${CI}' and to_email in (select lower(email) from auth.users where id='${ASSOC}')"
psql -d "${DB}" -X -A -t -q -c "update public.mail_outbox set sent_at = now() where meeting_id='${CI}';" >/dev/null
chkas "${PAUL}" "刪掉這場會" "deleted" "select public.delete_meeting('${CI}')"
chk "★ 刪會：日曆上有這場的三個信箱各收到取消（加回來的那位是第二封）" "assoc@example.com:2,beyondtaiwan2020@gmail.com:1,director@example.com:1" "select string_agg(to_email || ':' || n, ',' order by to_email) from (select to_email, count(*) n from public.mail_outbox where kind='meeting_cancel' and meeting_id is null and subject like '%日曆測試%' group by to_email) x"
chk "★ BT 主帳號也收到取消" "1" "select count(*) from public.mail_outbox where kind='meeting_cancel' and meeting_id is null and subject like '%日曆測試%' and to_email='beyondtaiwan2020@gmail.com'"
CJ=$(psql -d "${DB}" -X -A -t -q -c "select set_config('test.uid','${PAUL}',false);" -c "select public.save_meeting(null,'board','後台新增的會', now() + interval '5 days', now() + interval '5 days 1 hour', '', null, array['${DIR}']::uuid[]);" 2>&1 | tail -1 | tr -d ' ')
chkas "${PAUL}" "後台新增的會改時間" "${CJ}" "select public.save_meeting('${CJ}','board','後台新增的會', now() + interval '6 days', now() + interval '6 days 1 hour', '', null, array['${DIR}']::uuid[])"
chk "從來沒寄過邀請的會，改了也不記更新" "t" "select (cal_dirty_at is null)::text::char(1) from public.meetings where id='${CJ}'"
ci2=$(psql -d "${DB}" -X -A -t -q -f supabase/migrations/2026-11-18-calendar-invites.sql 2>&1 || true)
if echo "${ci2}" | grep -q "OVERALL.*PASS"; then echo "  ok   日曆邀請那支可以重跑"; pass=$((pass+1)); else echo "  FAIL 日曆邀請那支重跑沒過"; echo "${ci2}" | head -5; fail=$((fail+1)); fi
BROKEN=$(mktemp)
sed "s/      update meetings set cal_dirty_at = now() where id = v_id;//" supabase/migrations/2026-11-18-calendar-invites.sql > "${BROKEN}"
bk=$(psql -d "${DB}" -X -A -t -q -f "${BROKEN}" 2>&1 || true)
if echo "${bk}" | grep -q "OVERALL.*FAIL"; then echo "  ok   ★ 破壞測試：拿掉「改了記下來」，驗收表變紅"; pass=$((pass+1)); else echo "  FAIL 拿掉「改了記下來」驗收表沒變紅"; fail=$((fail+1)); fi
sed "s/  select public.meeting_main_email() where public.meeting_main_email() is not null/  select null::text where false/" supabase/migrations/2026-11-18-calendar-invites.sql > "${BROKEN}"
psql -d "${DB}" -X -A -t -q -f "${BROKEN}" >/dev/null 2>&1 || true
CK=$(psql -d "${DB}" -X -A -t -q -c "select set_config('test.uid','${PAUL}',false);" -c "select public.schedule_meeting('board','破壞測試', now() + interval '3 days', now() + interval '3 days 1 hour', '', null, array['${DIR}']::uuid[], false);" 2>&1 | tail -1 | tr -d ' ')
chk "★ 破壞測試：不加 BT 主帳號就只剩一封（證明上面那條真的在測）" "1" "select count(*) from public.mail_outbox where kind='meeting_invite' and meeting_id='${CK}'"
rm -f "${BROKEN}"
psql -d "${DB}" -X -A -t -q -f supabase/migrations/2026-11-18-calendar-invites.sql >/dev/null 2>&1 || true

echo "── 需求單分三種：貼文、限動、影片（2026-11-19-request-kinds.sql）──"
rkgot=$(psql -d "${DB}" -X -A -t -q -v ON_ERROR_STOP=1 -f supabase/migrations/2026-11-19-request-kinds.sql 2>&1 || true)
if echo "${rkgot}" | grep -q "OVERALL.*PASS" && ! echo "${rkgot}" | grep -q "|FAIL"; then echo "  ok   需求單分三種那支驗收表全 PASS"; pass=$((pass+1)); else echo "  FAIL 需求單分三種那支驗收表："; echo "${rkgot}" | head -10; fail=$((fail+1)); fi
RK1=$(psql -d "${DB}" -X -A -t -q -c "select set_config('test.uid','${RQR}',false);" -c "select public.submit_request('{\"kind\":\"post\",\"title\":\"貼文\",\"platforms\":[\"ig_carousel\",\"fb_single\"],\"shots\":[{\"who\":\"A\",\"what\":\"不該留下來\",\"seconds\":\"5\"}]}'::jsonb)" 2>&1 | tail -1 | tr -d ' \n')
chk "★ 選貼文就存成貼文" "post" "select kind from public.requests where id='${RK1}'"
chk "★ 貼文的拍攝指示丟掉" "0" "select jsonb_array_length(shots) from public.requests where id='${RK1}'"
RK2=$(psql -d "${DB}" -X -A -t -q -c "select set_config('test.uid','${RQR}',false);" -c "select public.submit_request('{\"kind\":\"story\",\"title\":\"限動\",\"platforms\":[\"threads_text\"]}'::jsonb)" 2>&1 | tail -1 | tr -d ' \n')
chk "★ 限動的平台固定是 IG 限動" "story|{ig_story}" "select kind || '|' || platforms::text from public.requests where id='${RK2}'"
RK3=$(psql -d "${DB}" -X -A -t -q -c "select set_config('test.uid','${RQR}',false);" -c "select public.submit_request('{\"kind\":\"video\",\"title\":\"影片\",\"platforms\":[\"ig_reels\",\"long_video\"],\"shots\":[{\"who\":\"A\",\"what\":\"縮時\",\"seconds\":\"20\"}]}'::jsonb)" 2>&1 | tail -1 | tr -d ' \n')
chk "★ 影片：平台與拍攝指示都留著" "video|2|1" "select kind || '|' || cardinality(platforms) || '|' || jsonb_array_length(shots) from public.requests where id='${RK3}'"
chkraise "★ 貼文選了影片的平台擋下來" "bad_platform" "perform set_config('test.uid','${RQR}',true); perform public.submit_request('{\"kind\":\"post\",\"title\":\"x\",\"platforms\":[\"ig_reels\"]}'::jsonb);"
chkraise "影片選了貼文的平台擋下來" "bad_platform" "perform set_config('test.uid','${RQR}',true); perform public.submit_request('{\"kind\":\"video\",\"title\":\"x\",\"platforms\":[\"ig_carousel\"]}'::jsonb);"
chkraise "亂給種類擋下來" "bad_kind" "perform set_config('test.uid','${RQR}',true); perform public.submit_request('{\"kind\":\"poster\",\"title\":\"x\"}'::jsonb);"
RK4=$(psql -d "${DB}" -X -A -t -q -c "select set_config('test.uid','${RQR}',false);" -c "select public.submit_request('{\"title\":\"舊頁面\",\"platforms\":[\"ig_story\"],\"shots\":[{\"who\":\"A\",\"what\":\"拍\",\"seconds\":\"3\"}]}'::jsonb)" 2>&1 | tail -1 | tr -d ' \n')
chk "沒帶種類的舊頁面照第二版的猜法" "video" "select kind from public.requests where id='${RK4}'"
rk2=$(psql -d "${DB}" -X -A -t -q -f supabase/migrations/2026-11-19-request-kinds.sql 2>&1 || true)
if echo "${rk2}" | grep -q "OVERALL.*PASS"; then echo "  ok   需求單分三種那支可以重跑"; pass=$((pass+1)); else echo "  FAIL 需求單分三種那支重跑沒過"; fail=$((fail+1)); fi
BROKEN=$(mktemp)
sed "s/    v_shots := '\[\]'::jsonb;//" supabase/migrations/2026-11-19-request-kinds.sql > "${BROKEN}"
bk=$(psql -d "${DB}" -X -A -t -q -f "${BROKEN}" 2>&1 || true)
if echo "${bk}" | grep -q "OVERALL.*FAIL"; then echo "  ok   ★ 破壞測試：貼文收下拍攝指示，驗收表變紅"; pass=$((pass+1)); else echo "  FAIL 拿掉丟拍攝指示驗收表沒變紅"; fail=$((fail+1)); fi
rm -f "${BROKEN}"
psql -d "${DB}" -X -A -t -q -f supabase/migrations/2026-11-19-request-kinds.sql >/dev/null 2>&1 || true

echo "── 格子的第二張範例照片（2026-11-20-example-photo-2.sql）──"
e2got=$(psql -d "${DB}" -X -A -t -q -v ON_ERROR_STOP=1 -f supabase/migrations/2026-11-20-example-photo-2.sql 2>&1 || true)
if echo "${e2got}" | grep -q "OVERALL.*PASS" && ! echo "${e2got}" | grep -q "|FAIL"; then echo "  ok   第二張照片那支驗收表全 PASS"; pass=$((pass+1)); else echo "  FAIL 第二張照片那支驗收表："; echo "${e2got}" | head -10; fail=$((fail+1)); fi
EXU2="https://norjaglyaotzewxavmhv.supabase.co/storage/v1/object/public/passport-examples/09B/2-b.jpg"
chkas "${PAUL}" "存第一張" "09B" "select public.set_activity_extras('09B', null, '${EXU}')"
chkas "${PAUL}" "存第二張" "09B" "select public.set_activity_example_2('09B', '${EXU2}')"
chk "兩張都在，互不覆蓋" "true|true" "select (example_url = '${EXU}')::text||'|'||(example_url_2 = '${EXU2}')::text from public.activities where id='09B'"
chkas "${PAUL}" "改第一張不動第二張" "09B" "select public.set_activity_extras('09B', null, null)"
chk "第二張還在" "t|t" "select (example_url is null)::text::char(1)||'|'||(example_url_2 = '${EXU2}')::text::char(1) from public.activities where id='09B'"
chkraise "★ 第二張也擋別的網站" "bad_example_url" "perform set_config('test.uid','${PAUL}',true); perform public.set_activity_example_2('09B', 'https://evil.example.com/a.jpg');"
chkraise "★ Associate 改不了第二張" "not_ws_edit" "perform set_config('test.uid','${ASSOC}',true); perform public.set_activity_example_2('09B', null);"
chkraise "沒有這一格" "no_such_activity" "perform set_config('test.uid','${PAUL}',true); perform public.set_activity_example_2('ZZZ', null);"
chkas "${PAUL}" "拿掉第二張" "09B" "select public.set_activity_example_2('09B', ' ')"
chk "拿掉了" "t" "select (example_url_2 is null)::text::char(1) from public.activities where id='09B'"
e22=$(psql -d "${DB}" -X -A -t -q -f supabase/migrations/2026-11-20-example-photo-2.sql 2>&1 || true)
if echo "${e22}" | grep -q "OVERALL.*PASS"; then echo "  ok   第二張照片那支可以重跑"; pass=$((pass+1)); else echo "  FAIL 第二張照片那支重跑沒過"; fail=$((fail+1)); fi
BROKEN=$(mktemp)
sed "s/  perform public.require_ws_edit('passport');//" supabase/migrations/2026-11-20-example-photo-2.sql > "${BROKEN}"
bk=$(psql -d "${DB}" -X -A -t -q -f "${BROKEN}" 2>&1 || true)
if echo "${bk}" | grep -q "OVERALL.*FAIL"; then echo "  ok   ★ 破壞測試：拿掉 require_ws_edit，驗收表變紅"; pass=$((pass+1)); else echo "  FAIL 拿掉 require_ws_edit 驗收表沒變紅"; fail=$((fail+1)); fi
rm -f "${BROKEN}"
psql -d "${DB}" -X -A -t -q -f supabase/migrations/2026-11-20-example-photo-2.sql >/dev/null 2>&1 || true

echo "── 一格好幾場（2026-11-21-activity-sessions.sql）──"
psql -d "${DB}" -X -A -t -q -c "update public.activities set happens_at = '2026-11-15 14:00+00' where id = '09B'" >/dev/null 2>&1 || true
ssgot=$(psql -d "${DB}" -X -A -t -q -v ON_ERROR_STOP=1 -f supabase/migrations/2026-11-21-activity-sessions.sql 2>&1 || true)
if echo "${ssgot}" | grep -q "OVERALL.*PASS" && ! echo "${ssgot}" | grep -q "|FAIL"; then echo "  ok   好幾場那支驗收表全 PASS"; pass=$((pass+1)); else echo "  FAIL 好幾場那支驗收表："; echo "${ssgot}" | head -10; fail=$((fail+1)); fi
chk "★ 原本的時間搬成第 1 場" "1|true" "select cardinality(sessions)::text||'|'||(sessions[1] = happens_at)::text from public.activities where id='09B'"
chkas "${PAUL}" "存三場（亂序、一場重複、一個空的）" "09B" "select public.set_activity_sessions('09B', array['2026-11-28 15:30+00','2026-11-15 14:00+00',null,'2026-11-28 15:30+00','2026-11-22 13:00+00']::timestamptz[])"
chk "排好、去重、去空：三場" "3|2026-11-15T14|2026-11-28T15" "select cardinality(sessions)::text||'|'||to_char(sessions[1] at time zone 'UTC','YYYY-MM-DD\"T\"HH24')||'|'||to_char(sessions[3] at time zone 'UTC','YYYY-MM-DD\"T\"HH24') from public.activities where id='09B'"
chk "happens_at 跟著是第 1 場" "true" "select (happens_at = sessions[1])::text from public.activities where id='09B'"
chkraise "★ Associate 改不了" "not_ws_edit" "perform set_config('test.uid','${ASSOC}',true); perform public.set_activity_sessions('09B', null);"
chkraise "超過 10 場擋下來" "too_many_sessions" "perform set_config('test.uid','${PAUL}',true); perform public.set_activity_sessions('09B', (select array_agg(timestamptz '2026-12-01' + make_interval(hours => g)) from generate_series(1,11) g));"
chkraise "沒有這一格" "no_such_activity" "perform set_config('test.uid','${PAUL}',true); perform public.set_activity_sessions('ZZZ', null);"
chkas "${PAUL}" "全部清掉" "09B" "select public.set_activity_sessions('09B', '{}')"
chk "清掉了，happens_at 也空" "0|t" "select cardinality(sessions)::text||'|'||(happens_at is null)::text::char(1) from public.activities where id='09B'"
ss2=$(psql -d "${DB}" -X -A -t -q -f supabase/migrations/2026-11-21-activity-sessions.sql 2>&1 || true)
if echo "${ss2}" | grep -q "OVERALL.*PASS"; then echo "  ok   好幾場那支可以重跑"; pass=$((pass+1)); else echo "  FAIL 好幾場那支重跑沒過"; fail=$((fail+1)); fi
BROKEN=$(mktemp)
sed "s/  perform public.require_ws_edit('passport');//" supabase/migrations/2026-11-21-activity-sessions.sql > "${BROKEN}"
bk=$(psql -d "${DB}" -X -A -t -q -f "${BROKEN}" 2>&1 || true)
if echo "${bk}" | grep -q "OVERALL.*FAIL"; then echo "  ok   ★ 破壞測試：拿掉 require_ws_edit，驗收表變紅"; pass=$((pass+1)); else echo "  FAIL 拿掉 require_ws_edit 驗收表沒變紅"; fail=$((fail+1)); fi
rm -f "${BROKEN}"
psql -d "${DB}" -X -A -t -q -f supabase/migrations/2026-11-21-activity-sessions.sql >/dev/null 2>&1 || true

echo "── 會議接 Google 日曆（2026-11-22-google-calendar.sql）：本機沒有 http 擴充，走退回的路 ──"
gcgot=$(psql -d "${DB}" -X -A -t -q -v ON_ERROR_STOP=1 -f supabase/migrations/2026-11-22-google-calendar.sql 2>&1 || true)
if echo "${gcgot}" | grep -q "OVERALL.*PASS" && ! echo "${gcgot}" | grep -q "|FAIL"; then echo "  ok   Google 日曆那支驗收表全 PASS（連線那兩列 SKIP）"; pass=$((pass+1)); else echo "  FAIL Google 日曆那支驗收表："; echo "${gcgot}" | head -12; fail=$((fail+1)); fi
chk "沒設定時 gcal_ready 是 false、gcal_sync 回 off" "f|off" "select public.gcal_ready()::text::char(1)||'|'||public.gcal_sync(gen_random_uuid())"
chkrole anon "" "★ 沒登入叫不動 gcal_sync" "denied" "select case when has_function_privilege('anon','public.gcal_sync(uuid)','execute') then 'open' else 'denied' end"
chkrole authenticated "${PAUL}" "★ 幹部也叫不動 gcal_sync（只給資料庫內部）" "denied" "select case when has_function_privilege('authenticated','public.gcal_sync(uuid)','execute') then 'open' else 'denied' end"
GCM=$(psql -d "${DB}" -X -A -t -q -c "select set_config('test.uid','${PAUL}',true); select public.schedule_meeting('board','Google 測試會', now() + interval '3 days', now() + interval '3 days 1 hour', '', null, array['${PAUL}']::uuid[], false);" 2>/dev/null | tail -1)
chk "Google 沒設定：排會照舊寄信、信裡附日曆檔" "t" "select (count(*) > 0 and bool_and(ics is not null))::text::char(1) from public.mail_outbox where meeting_id = '${GCM}' and kind = 'meeting_invite'"
psql -d "${DB}" -X -A -t -q -c "update public.meetings set gcal_event_id = 'evt-test', meet_url = 'https://meet.google.com/abc-defg-hij' where id = '${GCM}'" >/dev/null 2>&1
psql -d "${DB}" -X -A -t -q -c "select public.queue_meeting_mail_to('meeting_reminder','${GCM}','x@example.com')" >/dev/null 2>&1
chk "★ 有 Google 事件：信不附日曆檔、附 Meet 連結" "t" "select (ics is null and body like '%Google Meet: https://meet.google.com/abc-defg-hij%')::text::char(1) from public.mail_outbox where meeting_id = '${GCM}' and to_email = 'x@example.com'"
chkas "${PAUL}" "刪會：Google 連不上就照舊寄取消" "deleted" "select public.delete_meeting('${GCM}')"
gc2=$(psql -d "${DB}" -X -A -t -q -f supabase/migrations/2026-11-22-google-calendar.sql 2>&1 || true)
if echo "${gc2}" | grep -q "OVERALL.*PASS"; then echo "  ok   Google 日曆那支可以重跑"; pass=$((pass+1)); else echo "  FAIL Google 日曆那支重跑沒過"; fail=$((fail+1)); fi
BROKEN=$(mktemp)
sed "s/          case when m.gcal_event_id is not null then null/          case when false then null/" supabase/migrations/2026-11-22-google-calendar.sql > "${BROKEN}"
bk=$(psql -d "${DB}" -X -A -t -q -f "${BROKEN}" 2>&1 || true)
if echo "${bk}" | grep -q "OVERALL.*FAIL"; then echo "  ok   ★ 破壞測試：有 Google 事件還附日曆檔，驗收表變紅"; pass=$((pass+1)); else echo "  FAIL 拿掉不附日曆檔那條驗收表沒變紅"; fail=$((fail+1)); fi
rm -f "${BROKEN}"
psql -d "${DB}" -X -A -t -q -f supabase/migrations/2026-11-22-google-calendar.sql >/dev/null 2>&1 || true

echo "── 回覆跟 Google 雙向同步（2026-11-23-gcal-rsvp.sql）：本機沒有 http 擴充，測規則與退回 ──"
grgot=$(psql -d "${DB}" -X -A -t -q -v ON_ERROR_STOP=1 -f supabase/migrations/2026-11-23-gcal-rsvp.sql 2>&1 || true)
if echo "${grgot}" | grep -q "OVERALL.*PASS" && ! echo "${grgot}" | grep -q "|FAIL"; then echo "  ok   回覆同步那支驗收表全 PASS"; pass=$((pass+1)); else echo "  FAIL 回覆同步那支驗收表："; echo "${grgot}" | head -12; fail=$((fail+1)); fi
GRM=$(psql -d "${DB}" -X -A -t -q -c "select set_config('test.uid','${PAUL}',true); select public.schedule_meeting('board','回覆同步測試', now() + interval '3 days', now() + interval '3 days 1 hour', '', null, array['${PAUL}']::uuid[], true);" 2>/dev/null | tail -1)
psql -d "${DB}" -X -A -t -q -c "update public.meetings set gcal_event_id = 'evt-rsvp' where id = '${GRM}'; update public.meeting_attendees set gcal_status = 'accepted' where meeting_id = '${GRM}'" >/dev/null 2>&1
chkas "${PAUL}" "★ 有 Google 事件也照樣在網站回覆（送不上 Google 不擋）" "accepted" "select public.set_rsvp('${GRM}','accepted')"
chk "★ 送 Google 的內容帶著每個人的回覆（不會把 Google 洗成還沒回）" "accepted" "select x->>'responseStatus' from jsonb_array_elements(public.gcal_body('${GRM}', false)->'attendees') x limit 1"
psql -d "${DB}" -X -A -t -q -c "update public.meeting_attendees set status = 'invited' where meeting_id = '${GRM}'" >/dev/null 2>&1
chk "網站還沒回、Google 上次是參加：送過去還是參加" "accepted" "select x->>'responseStatus' from jsonb_array_elements(public.gcal_body('${GRM}', false)->'attendees') x limit 1"
chkraise "★ 開頁拉回覆只給幹部" "not_cadre" "perform set_config('test.uid','${STU}',true); perform public.gcal_refresh();"
chkas "${PAUL}" "幹部開頁拉回覆：沒設定 Google 就是 0" "0" "select public.gcal_refresh()"
chkraise "★ 再送一次：排不了這場會的人擋下來" "not_allowed" "perform set_config('test.uid','${ASSOC}',true); perform public.gcal_retry('${GRM}');"
chkraise "再送一次：Google 沒設定說清楚" "gcal_not_ready" "perform set_config('test.uid','${PAUL}',true); perform public.gcal_retry('${GRM}');"
psql -d "${DB}" -X -A -t -q -c "update public.meetings set title = '改了' , cal_dirty_at = now() - interval '1 hour' where id = '${GRM}'" >/dev/null 2>&1
psql -d "${DB}" -X -A -t -q -c "delete from public.mail_outbox where meeting_id = '${GRM}'" >/dev/null 2>&1
psql -d "${DB}" -X -A -t -q -c "select public.meeting_flush_calendar('${GRM}')" >/dev/null 2>&1
chk "★ 有 Google 事件送不上：不退回寄日曆檔，記號留著等下一輪" "0|t" "select (select count(*) from public.mail_outbox where meeting_id = '${GRM}')::text||'|'||(cal_dirty_at is not null)::text::char(1) from public.meetings where id = '${GRM}'"
chkas "${PAUL}" "刪會：Google 刪不掉就排進待刪" "deleted" "select public.delete_meeting('${GRM}')"
chk "待刪清單有它、沒寄日曆檔取消" "1|0" "select (select count(*) from public.gcal_pending_deletes where event_id = 'evt-rsvp')::text||'|'||(select count(*) from public.mail_outbox where kind = 'meeting_cancel' and subject like '%回覆同步測試%')::text"
gr2=$(psql -d "${DB}" -X -A -t -q -f supabase/migrations/2026-11-23-gcal-rsvp.sql 2>&1 || true)
if echo "${gr2}" | grep -q "OVERALL.*PASS"; then echo "  ok   回覆同步那支可以重跑"; pass=$((pass+1)); else echo "  FAIL 回覆同步那支重跑沒過"; fail=$((fail+1)); fi
BROKEN=$(mktemp)
sed "s/      if v_new is null or v_new is not distinct from r.gcal_status then continue; end if;/      if v_new is null then continue; end if;/" supabase/migrations/2026-11-23-gcal-rsvp.sql > "${BROKEN}"
bk=$(psql -d "${DB}" -X -A -t -q -f "${BROKEN}" 2>&1 || true)
if echo "${bk}" | grep -q "OVERALL.*FAIL"; then echo "  ok   ★ 破壞測試：Google 沒變也蓋過網站，驗收表變紅"; pass=$((pass+1)); else echo "  FAIL 拿掉只看變化那條驗收表沒變紅"; fail=$((fail+1)); fi
rm -f "${BROKEN}"
psql -d "${DB}" -X -A -t -q -f supabase/migrations/2026-11-23-gcal-rsvp.sql >/dev/null 2>&1 || true

echo
echo "── 需求單接下與退件（2026-11-24-request-accept-reject.sql）──"
argot=$(psql -d "${DB}" -X -A -t -q -v ON_ERROR_STOP=1 -f supabase/migrations/2026-11-24-request-accept-reject.sql 2>&1 || true)
if echo "${argot}" | grep -q "OVERALL.*PASS" && ! echo "${argot}" | grep -q "|FAIL"; then echo "  ok   接下與退件那支驗收表全 PASS"; pass=$((pass+1)); else echo "  FAIL 接下與退件那支驗收表："; echo "${argot}" | head -14; fail=$((fail+1)); fi
AR1=$(psql -d "${DB}" -X -A -t -q -c "select set_config('test.uid','${RQR}',false);" -c "select public.submit_request('{\"title\":\"要接的單\",\"owner_id\":\"${RQR}\"}'::jsonb)" 2>&1 | tail -1 | tr -d ' \n')
AR2=$(psql -d "${DB}" -X -A -t -q -c "select set_config('test.uid','${RQR}',false);" -c "select public.submit_request('{\"title\":\"要退的單\"}'::jsonb)" 2>&1 | tail -1 | tr -d ' \n')
chkraise "★ 破壞測試：送單的人自己接不了（not_allowed）" "not_allowed" "perform set_config('test.uid','${RQR}',true); perform public.accept_request('${AR1}');"
chkraise "★ 破壞測試：別的 team 的幹部退不了（not_allowed）" "not_allowed" "perform set_config('test.uid','${OUTC}',true); perform public.reject_request('${AR2}','不要');"
chkas "${MKE}" "Marketing 接下，狀態變進行中" "in_progress" "select public.accept_request('${AR1}')"
chk "★ 接下的人沒人接就記成接的人" "${MKE}" "select assignee from public.requests where id='${AR1}'"
chkraise "接過的不能再接（not_submitted）" "not_submitted" "perform set_config('test.uid','${MKE}',true); perform public.accept_request('${AR1}');"
chkraise "★ 退件沒寫回覆擋下來（empty_reply）" "empty_reply" "perform set_config('test.uid','${MKE}',true); perform public.reject_request('${AR2}','   ');"
chkas "${MKE}" "退件，寫回覆" "rejected" "select public.reject_request('${AR2}','這週排滿了，下週再送')"
chk "★ 退件寄一封 request_rejected 給送單的人，信裡有回覆與送單人那一頁的連結" "1|rqr@example.com|true|true" \
  "select count(*)||'|'||min(to_email)||'|'||bool_and(body like '%這週排滿了%')||'|'||bool_and(body like '%/admin/#request/${AR2}%') from public.mail_outbox where kind='request_rejected' and request_id='${AR2}'"
chk "退件的信按鈕連到送單人那一頁" "https://beyondtaiwannpo.com/admin/#request/${AR2}" "select public.mail_button_url(o) from public.mail_outbox o where kind='request_rejected' and request_id='${AR2}' limit 1"
chkraise "退過的不能再退（not_open）" "not_open" "perform set_config('test.uid','${MKE}',true); perform public.reject_request('${AR2}','再退');"
chkraise "★ 退件的送單人收不回（already_started）" "already_started" "perform set_config('test.uid','${RQR}',true); perform public.withdraw_request('${AR2}');"
chkas "${MKE}" "按錯了：退件改回進行中" "in_progress" "select public.set_request_status('${AR2}','in_progress',null)"
chkas "${MKE}" "進行中也退得了" "rejected" "select public.reject_request('${AR1}','跟另一張重複了')"
chkraise "已發布的不能退（not_open）" "not_open" "perform set_config('test.uid','${MKE}',true); perform public.reject_request('${RQ3}','x');"
chkrole authenticated "${RQR}" "送單的人讀得到自己退件的單與回覆" "rejected|跟另一張重複了" "select status||'|'||reply from public.requests where id='${AR1}'"
ar2=$(psql -d "${DB}" -X -A -t -q -f supabase/migrations/2026-11-24-request-accept-reject.sql 2>&1 || true)
if echo "${ar2}" | grep -q "OVERALL.*PASS"; then echo "  ok   接下與退件那支可以重跑"; pass=$((pass+1)); else echo "  FAIL 接下與退件那支重跑沒過"; fail=$((fail+1)); fi
chk "重跑不動資料：一張退件、一張改回進行中" "rejected|in_progress" "select (select status from public.requests where id='${AR1}')||'|'||(select status from public.requests where id='${AR2}')"
BROKEN=$(mktemp)
sed "s/  if v_reply = '' then raise exception 'empty_reply' using errcode = 'P0001'; end if;//" supabase/migrations/2026-11-24-request-accept-reject.sql > "${BROKEN}"
bk=$(psql -d "${DB}" -X -A -t -q -f "${BROKEN}" 2>&1 || true)
if echo "${bk}" | grep -q "OVERALL.*FAIL"; then echo "  ok   ★ 破壞測試：拿掉「退件一定要寫回覆」，驗收表變紅"; pass=$((pass+1)); else echo "  FAIL 拿掉「退件要寫回覆」驗收表沒變紅"; fail=$((fail+1)); fi
rm -f "${BROKEN}"
psql -d "${DB}" -X -A -t -q -f supabase/migrations/2026-11-24-request-accept-reject.sql >/dev/null 2>&1 || true

echo
echo "── 會議信沒填的行不印（2026-11-25-meeting-mail-empty-lines.sql）──"
mlgot=$(psql -d "${DB}" -X -A -t -q -v ON_ERROR_STOP=1 -f supabase/migrations/2026-11-25-meeting-mail-empty-lines.sql 2>&1 || true)
if echo "${mlgot}" | grep -q "OVERALL.*PASS" && ! echo "${mlgot}" | grep -q "|FAIL"; then echo "  ok   會議信那支驗收表全 PASS"; pass=$((pass+1)); else echo "  FAIL 會議信那支驗收表："; echo "${mlgot}" | head -8; fail=$((fail+1)); fi
chk "★ 預設邀請信：沒填會議紀錄，信裡沒有「會議紀錄」那一行" "false|true" \
  "select (public.meeting_fill(body_zh, 'A', 'T', 'w', '海報', null, 'L') like '%會議紀錄%')::text||'|'||(public.meeting_fill(body_zh, 'A', 'T', 'w', '海報', null, 'L') like '%議程：海報%')::text from public.mail_templates where kind='meeting_invite'"
ml2=$(psql -d "${DB}" -X -A -t -q -f supabase/migrations/2026-11-25-meeting-mail-empty-lines.sql 2>&1 || true)
if echo "${ml2}" | grep -q "OVERALL.*PASS"; then echo "  ok   會議信那支可以重跑"; pass=$((pass+1)); else echo "  FAIL 會議信那支重跑沒過"; fail=$((fail+1)); fi

echo
echo "── 接上 Instagram（2026-11-26-instagram-connect.sql）：本機沒有 http 擴充，裝一個假的 Instagram 來測 ──"
# 這時候：DIR 與 PAUL 管 res:Marketing Team、MKE 在需求工作區（改）、OUTC 是別的 team 的幹部（什麼都沒被派）、STU 是學員。
igot=$(psql -d "${DB}" -X -A -t -q -v ON_ERROR_STOP=1 -f supabase/migrations/2026-11-26-instagram-connect.sql 2>&1 || true)
if echo "${igot}" | grep -q "OVERALL.*PASS" && ! echo "${igot}" | grep -q "|FAIL"; then echo "  ok   Instagram 那支驗收表全 PASS"; pass=$((pass+1)); else echo "  FAIL Instagram 那支驗收表："; echo "${igot}" | head -14; fail=$((fail+1)); fi
chkraise "★ 別的 team 的幹部看不到 Instagram 狀態（not_marketing）" "not_marketing" "perform set_config('test.uid','${OUTC}',true); perform public.ig_status();"
chkraise "★ 學員看不到（not_marketing）" "not_marketing" "perform set_config('test.uid','${STU}',true); perform public.ig_status();"
chkas "${MKE}" "需求工作區的人看得到：還沒接上、不能按再檢查" "false|false" "select (public.ig_status()->>'ready')||'|'||(public.ig_status()->>'can_manage')"
chkas "${DIR}" "Marketing 資源工作區「管」的人可以按再檢查" "true" "select public.ig_status()->>'can_manage'"
chkraise "★ 只在需求工作區的人按不了再檢查（not_marketing_manager）" "not_marketing_manager" "perform set_config('test.uid','${MKE}',true); perform public.ig_check_now();"
chkraise "還沒設定的時候按再檢查，說清楚（ig_not_ready）" "ig_not_ready" "perform set_config('test.uid','${DIR}',true); perform public.ig_check_now();"
chkrole authenticated "${PAUL}" "★ 連 Co-President 都不能直接讀 ig_connection" "denied" "select case when has_table_privilege('authenticated','public.ig_connection','select') then 'open' else 'denied' end"
chkrole authenticated "${PAUL}" "★ 幹部叫不動 ig_get 與 ig_secret（只給資料庫內部）" "denied|denied" "select (case when has_function_privilege('authenticated','public.ig_get(text,text)','execute') then 'open' else 'denied' end)||'|'||(case when has_function_privilege('authenticated','public.ig_secret()','execute') then 'open' else 'denied' end)"
chkrole anon "" "★ 沒登入叫不動 ig_status" "denied" "select case when has_function_privilege('anon','public.ig_status()','execute') then 'open' else 'denied' end"

# 假的 Instagram：http 擴充套件的替身。網址裡有 refresh_access_token 就給一張新通行證；通行證是 BADTOK 就回過期（code 190），
# 而且故意把網址（含通行證）塞進錯誤訊息，驗「錯誤訊息裡的通行證會被遮掉」。
psql -d "${DB}" -q -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
alter table vault.decrypted_secrets add column if not exists id uuid default gen_random_uuid();
alter table vault.decrypted_secrets add column if not exists updated_at timestamptz default now();
create or replace function vault.update_secret(secret_id uuid, new_secret text, new_name text default null, new_description text default null, new_key_id uuid default null)
  returns void language sql as $$ update vault.decrypted_secrets set decrypted_secret = new_secret, updated_at = now() where id = secret_id $$;
create schema if not exists extensions;
create type extensions.http_header as (field varchar, value varchar);
create type extensions.http_request as (method text, uri varchar, headers extensions.http_header[], content_type varchar, content varchar);
create table extensions.fake_calls (uri text, at timestamptz default clock_timestamp());
create function extensions.http_set_curlopt(text, text) returns boolean language sql as $$ select true $$;
create function extensions.urlencode(text) returns text language sql immutable as $$ select $1 $$;
create function extensions.http(r extensions.http_request) returns table (status int, content text) language plpgsql as $$
begin
  insert into extensions.fake_calls (uri) values (r.uri);
  if r.uri like '%BADTOK%' then
    return query select 400, '{"error":{"message":"Error validating access token for ' || r.uri || '","type":"OAuthException","code":190}}';
  elsif r.uri like '%refresh_access_token%' then
    return query select 200, '{"access_token":"NEWTOK","token_type":"bearer","expires_in":5184000}';
  else
    return query select 200, '{"user_id":"17841400000","username":"beyondtaiwan","account_type":"BUSINESS","followers_count":3999,"media_count":321}';
  end if;
end $$;
insert into vault.decrypted_secrets (name, decrypted_secret, updated_at) values ('INSTAGRAM_TOKEN', 'GOODTOK', now() - interval '2 days');
SQL
chkas "${DIR}" "★ 設定好之後按再檢查：讀到帳號、類型、粉絲數" "true|beyondtaiwan|BUSINESS|3999" "select (s->>'ready')||'|'||(s->>'username')||'|'||(s->>'account_type')||'|'||(s->>'followers') from (select public.ig_check_now() s) x"
chk "人手放的通行證：過期日用放進去那天 + 60 天估、標「大約」，58 天還不換" "GOODTOK|true|58|0" \
  "select (select decrypted_secret from vault.decrypted_secrets where name='INSTAGRAM_TOKEN')||'|'||token_estimated::text||'|'||round(extract(epoch from token_expires_at - now()) / 86400)::int||'|'||(select count(*) from extensions.fake_calls where uri like '%refresh%') from public.ig_connection"
psql -d "${DB}" -q -c "update vault.decrypted_secrets set updated_at = now() - interval '15 days' where name='INSTAGRAM_TOKEN'; update public.ig_connection set token_refreshed_at = null;" >/dev/null
chk "剩不到 50 天：每天那一輪先換再檢查" "ok/ok" "select public.ig_daily()"
chk "★ 換到的新通行證寫回 Vault，過期日照 Instagram 給的（60 天，不再是估的）" "NEWTOK|false|60" \
  "select (select decrypted_secret from vault.decrypted_secrets where name='INSTAGRAM_TOKEN')||'|'||(select token_estimated::text||'|'||round(extract(epoch from token_expires_at - now()) / 86400)::int from public.ig_connection)"
chk "剛換過就不再換" "not_due/ok" "select public.ig_daily()"
chkas "${DIR}" "★ ig_status 回的東西裡沒有通行證" "false" "select (public.ig_status()::text like '%TOK%')::text"
psql -d "${DB}" -q -c "update vault.decrypted_secrets set decrypted_secret = 'BADTOK', updated_at = now() - interval '1 hour' where name='INSTAGRAM_TOKEN'; delete from extensions.fake_calls;" >/dev/null
chk "★ 過期的通行證：記下 code 190，放進去不到 25 小時不去換" "not_due/error|0" "select public.ig_daily()||'|'||(select count(*) from extensions.fake_calls where uri like '%refresh%')"
chk "★ 錯誤訊息裡的通行證被遮掉" "true|false|true" \
  "select (check_error like '%code 190%')::text||'|'||(check_error like '%BADTOK%')::text||'|'||(check_error like '%***%')::text from public.ig_connection"
chk "壞了的時候，上一次讀到的帳號資料還留著" "beyondtaiwan|3999" "select username||'|'||followers_count from public.ig_connection"
ig2=$(psql -d "${DB}" -X -A -t -q -f supabase/migrations/2026-11-26-instagram-connect.sql 2>&1 || true)
if echo "${ig2}" | grep -q "OVERALL.*PASS"; then echo "  ok   Instagram 那支可以重跑"; pass=$((pass+1)); else echo "  FAIL Instagram 那支重跑沒過"; fail=$((fail+1)); fi
chk "重跑不動資料" "beyondtaiwan|1" "select username||'|'||(select count(*) from public.ig_connection) from public.ig_connection"
BROKEN=$(mktemp)
sed "s/  if not public.ig_can_view() then raise exception 'not_marketing' using errcode = 'P0001'; end if;//" supabase/migrations/2026-11-26-instagram-connect.sql > "${BROKEN}"
bk=$(psql -d "${DB}" -X -A -t -q -f "${BROKEN}" 2>&1 || true)
if echo "${bk}" | grep -q "OVERALL.*FAIL"; then echo "  ok   ★ 破壞測試：拿掉「看狀態要是 Marketing 的人」，驗收表變紅"; pass=$((pass+1)); else echo "  FAIL 拿掉看狀態的門驗收表沒變紅"; fail=$((fail+1)); fi
sed "s/^revoke all on function public.ig_get(text, text) from public, anon, authenticated;/grant execute on function public.ig_get(text, text) to authenticated;/" supabase/migrations/2026-11-26-instagram-connect.sql > "${BROKEN}"
bk=$(psql -d "${DB}" -X -A -t -q -f "${BROKEN}" 2>&1 || true)
if echo "${bk}" | grep -q "OVERALL.*FAIL"; then echo "  ok   ★ 破壞測試：把 ig_get 開給幹部，驗收表變紅"; pass=$((pass+1)); else echo "  FAIL 把 ig_get 開給幹部驗收表沒變紅"; fail=$((fail+1)); fi
psql -d "${DB}" -X -A -t -q -f supabase/migrations/2026-11-26-instagram-connect.sql >/dev/null 2>&1 || true
chkrole authenticated "${PAUL}" "破壞之後重跑正確的那支：ig_get 又關起來" "denied" "select case when has_function_privilege('authenticated','public.ig_get(text,text)','execute') then 'open' else 'denied' end"
rm -f "${BROKEN}"
# 假的 Instagram 拆掉，後面要是再加別段，不會以為真的有 http 擴充。
psql -d "${DB}" -q -c "drop function extensions.http(extensions.http_request); drop function extensions.http_set_curlopt(text, text); drop function extensions.urlencode(text); drop table extensions.fake_calls; drop type extensions.http_request; drop type extensions.http_header; delete from vault.decrypted_secrets where name='INSTAGRAM_TOKEN';" >/dev/null
echo
echo "── 大學介紹貼文（2026-11-27-college-posts.sql）──"
# 這時候：MKM 是 Marketing 的 Director（需求工作區管）、MKE 需求工作區改、OUTC 別的 team、STU 學員、PAUL Co-President。
cpgot=$(psql -d "${DB}" -X -A -t -q -v ON_ERROR_STOP=1 -f supabase/migrations/2026-11-27-college-posts.sql 2>&1 || true)
if echo "${cpgot}" | grep -q "OVERALL.*PASS" && ! echo "${cpgot}" | grep -q "|FAIL"; then echo "  ok   貼文那支驗收表全 PASS"; pass=$((pass+1)); else echo "  FAIL 貼文那支驗收表："; echo "${cpgot}" | head -16; fail=$((fail+1)); fi
chk "★ Marketing 的 Director 建好時就被加進核可工作區（等級看）" "view" "select level from public.assignments where user_id='${MKM}' and workspace_id='custom:marketing-approve'"
chkraise "★ 別的 team 的幹部開不了貼文（not_marketing_editor）" "not_marketing_editor" "perform set_config('test.uid','${OUTC}',true); perform public.mkt_post_create('Vanderbilt University');"
chkraise "★ 學員開不了" "not_marketing_editor" "perform set_config('test.uid','${STU}',true); perform public.mkt_post_create('Vanderbilt University');"
CP=$(psql -d "${DB}" -X -A -t -q -c "select set_config('test.uid','${MKE}',false);" -c "select public.mkt_post_create('Vanderbilt University')" 2>&1 | tail -1 | tr -d ' \n')
chk "Marketing 的人開一篇，狀態草稿、作者是他" "draft|${MKE}" "select status||'|'||created_by from public.college_posts where id='${CP}'"
chkraise "★ 同一所學校不能開第二篇（大小寫與符號不算）" "already_in_series" "perform set_config('test.uid','${MKE}',true); perform public.mkt_post_create('vanderbilt-university ');"
chkraise "沒有來源連結勾不了（need_source_url）" "need_source_url" "perform set_config('test.uid','${MKE}',true); perform public.mkt_post_check('${CP}','rank',true);"
D1='{"school":"Vanderbilt University","basic":{"ranking":"National 全國 #16"},"photos":{"campus":{"path":"x/campus.jpg","credit":"Jbaker08","license":"Public domain"}}}'
S1='{"rank":[{"kind":"usnews","url":"https://www.usnews.com/best-colleges/vanderbilt-3535","quote":"#16 in National Universities (tie)"}]}'
chkas "${MKE}" "存內容與來源" "draft" "select public.mkt_post_save('${CP}','${D1}'::jsonb,'${S1}'::jsonb,'cap')"
chkas "${MKE}" "勾排名" "true" "select (public.mkt_post_check('${CP}','rank',true) ? 'rank')::text"
chkas "${MKE}" "還差什麼：空的" "{}" "select public.mkt_post_problems(data,sources,checks)::text from public.college_posts where id='${CP}'"
D2='{"school":"Vanderbilt University","basic":{"ranking":"National 全國 #16"},"apply":{"acceptance":"5.4%"},"photos":{"campus":{"path":"x/campus.jpg","credit":"Jbaker08","license":""}}}'
chkas "${MKE}" "多填一個錄取率、照片沒寫授權" "draft" "select public.mkt_post_save('${CP}','${D2}'::jsonb,'${S1}'::jsonb,'cap')"
chkraise "★ 有沒勾的數字、缺授權的照片就送不了審" "not_ready: photo:campus,unchecked:acceptance" "perform set_config('test.uid','${MKE}',true); perform public.mkt_post_submit('${CP}');"
chkas "${MKE}" "拿掉錄取率、補上授權" "draft" "select public.mkt_post_save('${CP}','${D1}'::jsonb,'${S1}'::jsonb,'cap')"
chkas "${MKE}" "★ 排名沒動，之前的勾還有效，送審" "in_review" "select public.mkt_post_submit('${CP}')"
chkraise "★ 不是核可的人核可不了（not_approver）" "not_approver" "perform set_config('test.uid','${MKE}',true); perform public.mkt_post_approve('${CP}','x');"
psql -d "${DB}" -q -c "insert into public.assignments (user_id, workspace_id, level) values ('${MKE}','custom:marketing-approve','view') on conflict do nothing;" >/dev/null
chkraise "★ 作者就算有核可權限也不能核可自己的（cannot_approve_own）" "cannot_approve_own" "perform set_config('test.uid','${MKE}',true); perform public.mkt_post_approve('${CP}', (select public.mkt_post_hash(data,caption) from public.college_posts where id='${CP}'));"
chkraise "★ 核可的人看到的是舊版本就擋（changed_since_viewed）" "changed_since_viewed" "perform set_config('test.uid','${MKM}',true); perform public.mkt_post_approve('${CP}','oldhash');"
chkas "${MKM}" "★ 別人核可現在這一版" "approved" "select public.mkt_post_approve('${CP}', (select public.mkt_post_hash(data,caption) from public.college_posts where id='${CP}'))"
D3='{"school":"Vanderbilt University","basic":{"ranking":"National 全國 #17"},"photos":{"campus":{"path":"x/campus.jpg","credit":"Jbaker08","license":"Public domain"}}}'
chkas "${MKE}" "★ 核可之後改了排名：自動退回送審" "in_review" "select public.mkt_post_save('${CP}','${D3}'::jsonb,'${S1}'::jsonb,'cap')"
chk "核可清掉了" "true" "select (approved_by is null and approved_hash is null)::text from public.college_posts where id='${CP}'"
chkraise "★ 數字改了，之前的勾失效，核可不了" "not_ready: unchecked:rank" "perform set_config('test.uid','${MKM}',true); perform public.mkt_post_approve('${CP}', (select public.mkt_post_hash(data,caption) from public.college_posts where id='${CP}'));"
chkas "${MKE}" "重新勾" "true" "select (public.mkt_post_check('${CP}','rank',true) ? 'rank')::text"
chkas "${MKM}" "再核可" "approved" "select public.mkt_post_approve('${CP}', (select public.mkt_post_hash(data,caption) from public.college_posts where id='${CP}'))"
chkraise "標已發要貼 IG 連結（need_instagram_url）" "need_instagram_url" "perform set_config('test.uid','${MKE}',true); perform public.mkt_post_mark_posted('${CP}','https://example.com/x');"
chkas "${MKE}" "標成已發" "posted" "select public.mkt_post_mark_posted('${CP}','https://www.instagram.com/p/ABC123/')"
chkraise "★ 發出去的不能再改（post_locked）" "post_locked" "perform set_config('test.uid','${MKE}',true); perform public.mkt_post_save('${CP}','{}'::jsonb,'{}'::jsonb,'');"
chkraise "退回一定要寫原因（need_note）" "need_note" "perform set_config('test.uid','${MKM}',true); perform public.mkt_post_return('${CP}','  ');"
chkrole authenticated "${OUTC}" "★ 別的 team 的幹部讀不到任何一篇" "0" "select count(*) from public.college_posts"
chkrole authenticated "${MKE}" "Marketing 的人讀得到" "1" "select count(*) from public.college_posts"
chkrole authenticated "${MKE}" "★ 連 Marketing 的人都不能直接改表" "denied" "select case when has_table_privilege('authenticated','public.college_posts','update') then 'open' else 'denied' end"
CP2=$(psql -d "${DB}" -X -A -t -q -c "select set_config('test.uid','${MKE}',false);" -c "select public.mkt_post_create('Rice University')" 2>&1 | tail -1 | tr -d ' \n')
chkas "${MKE}" "草稿收起來" "archived" "select public.mkt_post_archive('${CP2}')"
chkas "${MKE}" "收起來之後同一所可以重開" "1" "select count(*) from (select public.mkt_post_create('Rice University')) x"
chkas "${MKE}" "bootstrap：改得動、核可得了（被加進去了）、17 個數字" "true|true|17" "select (b->>'can_edit')||'|'||(b->>'can_approve')||'|'||jsonb_array_length(b->'facts') from (select public.mkt_bootstrap() b) x"
chkraise "★ 別的 team 的幹部拿不到 bootstrap" "not_marketing" "perform set_config('test.uid','${OUTC}',true); perform public.mkt_bootstrap();"
cp2=$(psql -d "${DB}" -X -A -t -q -f supabase/migrations/2026-11-27-college-posts.sql 2>&1 || true)
if echo "${cp2}" | grep -q "OVERALL.*PASS"; then echo "  ok   貼文那支可以重跑"; pass=$((pass+1)); else echo "  FAIL 貼文那支重跑沒過"; fail=$((fail+1)); fi
chk "重跑不動資料" "posted|3" "select (select status from public.college_posts where id='${CP}')||'|'||(select count(*) from public.college_posts)"
BROKEN=$(mktemp)
sed "s/  if r.created_by = auth.uid() then raise exception 'cannot_approve_own' using errcode = 'P0001'; end if;//" supabase/migrations/2026-11-27-college-posts.sql > "${BROKEN}"
bk=$(psql -d "${DB}" -X -A -t -q -f "${BROKEN}" 2>&1 || true)
if echo "${bk}" | grep -q "OVERALL.*FAIL"; then echo "  ok   ★ 破壞測試：拿掉「作者不能核可自己的」，驗收表變紅"; pass=$((pass+1)); else echo "  FAIL 拿掉作者不能核可驗收表沒變紅"; fail=$((fail+1)); fi
sed "s/    if not v_ok then raise exception 'need_source_url' using errcode = 'P0001'; end if;//" supabase/migrations/2026-11-27-college-posts.sql > "${BROKEN}"
bk=$(psql -d "${DB}" -X -A -t -q -f "${BROKEN}" 2>&1 || true)
if echo "${bk}" | grep -q "OVERALL.*FAIL"; then echo "  ok   ★ 破壞測試：拿掉「沒有來源勾不了」，驗收表變紅"; pass=$((pass+1)); else echo "  FAIL 拿掉沒有來源勾不了驗收表沒變紅"; fail=$((fail+1)); fi
rm -f "${BROKEN}"
psql -d "${DB}" -X -A -t -q -f supabase/migrations/2026-11-27-college-posts.sql >/dev/null 2>&1 || true
echo
echo "── 大學介紹貼文的研究按鈕（2026-11-28-college-research.sql）：假的 Claude 與假的網頁 ──"
# 假的 pg_net：記下送了什麼，回應由測試自己塞進 net._http_response。
psql -d "${DB}" -q -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
create table if not exists net.fake_req (id bigserial primary key, method text, url text, body jsonb, headers jsonb);
create table if not exists net._http_response (id bigint, status_code int, content_type text, headers jsonb, content text, timed_out boolean, error_msg text, created timestamptz default now());
create or replace function net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds int)
  returns bigint language sql as $$ insert into net.fake_req (method, url, body, headers) values ('POST', url, body, headers) returning id $$;
create or replace function net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds int)
  returns bigint language sql as $$ insert into net.fake_req (method, url, headers) values ('GET', url, headers) returning id $$;
delete from vault.decrypted_secrets where name = 'ANTHROPIC_API_KEY';
insert into vault.decrypted_secrets (name, decrypted_secret) values ('ANTHROPIC_API_KEY', 'sk-ant-test-SECRET');
SQL
rsgot=$(psql -d "${DB}" -X -A -t -q -v ON_ERROR_STOP=1 -f supabase/migrations/2026-11-28-college-research.sql 2>&1 || true)
if echo "${rsgot}" | grep -q "OVERALL.*PASS" && ! echo "${rsgot}" | grep -q "|FAIL"; then echo "  ok   研究那支驗收表全 PASS"; pass=$((pass+1)); else echo "  FAIL 研究那支驗收表："; echo "${rsgot}" | head -14; fail=$((fail+1)); fi
TPL=$(node -e 'import("./admin/marketing/src/slides.js").then(S=>{const t=S.blankPost("Duke University");t.apply.sat="1400–1500";process.stdout.write(JSON.stringify(t))})')
RP=$(psql -d "${DB}" -X -A -t -q -c "select set_config('test.uid','${MKE}',false);" -c "select public.mkt_post_create('Duke University', \$j\$${TPL}\$j\$::jsonb)" 2>&1 | tail -1 | tr -d ' \n')
chk "★ 新貼文的範本跟資料庫的 mkt_template() 一樣（研究才認得哪些格子還沒動過）" "true|true|false" \
  "select public.mkt_untouched(data, array['timeline','rows'])::text||'|'||public.mkt_untouched(data, array['majors','rows'])::text||'|'||public.mkt_untouched(data, array['apply','sat'])::text from public.college_posts where id='${RP}'"
chkraise "★ 別的 team 的幹部按不了研究（not_marketing_editor）" "not_marketing_editor" "perform set_config('test.uid','${OUTC}',true); perform public.mkt_research_start('${RP}');"
chkas "${MKE}" "Marketing 的人按研究：開五個工作" "5" "select public.mkt_research_start('${RP}')"
chk "★ 五個都送出去了：claude-opus-5-5、開網路搜尋與讀網頁、帶金鑰與 fallback" "5|5|5|5" \
  "select count(*)||'|'||count(*) filter (where body->>'model'='claude-opus-5-5')||'|'||count(*) filter (where body->'tools'->0->>'type'='web_search_20260209' and body->'tools'->1->>'type'='web_fetch_20260209')||'|'||count(*) filter (where headers->>'x-api-key'='sk-ant-test-SECRET' and headers->>'anthropic-beta'='server-side-fallback-2026-07-01' and body->>'fallbacks'='default') from net.fake_req where method='POST'"
chkraise "★ 還在跑的時候不能再按（research_running）" "research_running" "perform set_config('test.uid','${MKE}',true); perform public.mkt_research_start('${RP}');"
# 五個工作各自的回應：basic 正常、admissions 先 pause_turn 再正常、policy 先 429、majors 回的不是 JSON、fun 被擋（refusal）。
RQ() { psql -d "${DB}" -X -A -t -q -c "select request_id from public.mkt_research_jobs where post_id='${RP}' and grp='$1'" | tr -d ' \n'; }
R_BASIC=$(RQ basic); R_ADM=$(RQ admissions); R_POL=$(RQ policy); R_MAJ=$(RQ majors); R_FUN=$(RQ fun)
psql -d "${DB}" -q -v ON_ERROR_STOP=1 >/dev/null <<SQL
insert into net._http_response (id, status_code, content_type, content) values
 (${R_BASIC}, 200, 'application/json', jsonb_build_object('stop_reason','end_turn','usage',jsonb_build_object('input_tokens',100000,'output_tokens',5000,'server_tool_use',jsonb_build_object('web_search_requests',8)),
   'content', jsonb_build_array(jsonb_build_object('type','text','text', E'Here you go.\n\`\`\`json\n' || jsonb_build_object(
     'facts', jsonb_build_object('rank', jsonb_build_object('value','National 全國 #6','sources',jsonb_build_array(jsonb_build_object('kind','usnews','url','https://example.com/rank','quote','#6 in National Universities'))),
                                 'enrollment', jsonb_build_object('value','大學部 6,640人','sources',jsonb_build_array(jsonb_build_object('kind','cds','url','https://example.com/cds','quote','Total all undergraduates 6,640')))),
     'fields', jsonb_build_object('cover.zh','杜克大學','cover.accent','#012169','basic.state','NC','evil.path','x'),
     'notes', jsonb_build_array('U.S. News 2027 edition'))::text || E'\n\`\`\`')))::text),
 (${R_ADM}, 200, 'application/json', jsonb_build_object('stop_reason','pause_turn','usage',jsonb_build_object('input_tokens',50000,'output_tokens',1000),
   'content', jsonb_build_array(jsonb_build_object('type','server_tool_use','id','s1','name','web_search','input',jsonb_build_object('query','duke cds'))))::text),
 (${R_POL}, 429, 'application/json', '{"type":"error","error":{"type":"rate_limit_error","message":"slow down"}}'),
 (${R_MAJ}, 200, 'application/json', jsonb_build_object('stop_reason','end_turn','usage',jsonb_build_object('input_tokens',10,'output_tokens',10),'content',jsonb_build_array(jsonb_build_object('type','text','text','sorry, no json')))::text),
 (${R_FUN}, 200, 'application/json', jsonb_build_object('stop_reason','refusal','stop_details',jsonb_build_object('category','general_harms'),'usage',jsonb_build_object('input_tokens',10,'output_tokens',0),'content','[]'::jsonb)::text);
SQL
psql -d "${DB}" -X -A -t -q -c "select public.mkt_research_tick()" >/dev/null 2>&1
chk "★ basic 好了、admissions 接著送（pause_turn，訊息多一段）、policy 429 重送、majors 不是 JSON 失敗、fun 被擋失敗" \
  "basic:done|admissions:sent:2:2|policy:sent:1|majors:failed:replywasnottheexpectedJSON|fun:failed:stopped:refusal/general_harms" \
  "select string_agg(x, '|' order by o) from (select 1 o, 'basic:'||status x from public.mkt_research_jobs where post_id='${RP}' and grp='basic'
     union all select 2, 'admissions:'||status||':'||step||':'||jsonb_array_length(messages) from public.mkt_research_jobs where post_id='${RP}' and grp='admissions'
     union all select 3, 'policy:'||status||':'||retries from public.mkt_research_jobs where post_id='${RP}' and grp='policy'
     union all select 4, 'majors:'||status||':'||replace(error,' ','') from public.mkt_research_jobs where post_id='${RP}' and grp='majors'
     union all select 5, 'fun:'||status||':'||replace(error,' ','') from public.mkt_research_jobs where post_id='${RP}' and grp='fun') t"
chk "★ 研究結果填進空著的格子（排名、學生數、中文校名、代表色、州），白名單外的不碰" "National全國#6|大學部6,640人|杜克大學|#012169|NC|false" \
  "select replace(data#>>'{basic,ranking}',' ','')||'|'||replace(data#>>'{basic,enrollment}',' ','')||'|'||(data#>>'{cover,zh}')||'|'||(data#>>'{cover,accent}')||'|'||(data#>>'{basic,state}')||'|'||(data ? 'evil')::text from public.college_posts where id='${RP}'"
chk "★ 來源跟著放進去，勾一個都沒有（勾一定是人）" "1|1|{}" "select jsonb_array_length(sources->'rank')||'|'||jsonb_array_length(sources->'enrollment')||'|'||checks::text from public.college_posts where id='${RP}'"
R_ADM2=$(psql -d "${DB}" -X -A -t -q -c "select request_id from public.mkt_research_jobs where post_id='${RP}' and grp='admissions'" | tr -d ' \n')
psql -d "${DB}" -q -v ON_ERROR_STOP=1 >/dev/null <<SQL
insert into net._http_response (id, status_code, content_type, content) values
 (${R_ADM2}, 200, 'application/json', jsonb_build_object('stop_reason','end_turn','usage',jsonb_build_object('input_tokens',60000,'output_tokens',3000,'server_tool_use',jsonb_build_object('web_search_requests',4)),
   'content', jsonb_build_array(jsonb_build_object('type','text','text', jsonb_build_object('facts', jsonb_build_object(
     'acceptance', jsonb_build_object('value','5.1%','sources',jsonb_build_array(jsonb_build_object('kind','cds','url','https://example.com/c1','quote','applied 54,191; admitted 2,766'))),
     'sat', jsonb_build_object('value','1510–1570','sources',jsonb_build_array(jsonb_build_object('kind','cds','url','https://example.com/c9','quote','SAT 1510 1570')))),
     'notes', jsonb_build_array('Fall 2025 class'))::text)))::text);
SQL
psql -d "${DB}" -X -A -t -q -c "select public.mkt_research_tick()" >/dev/null 2>&1
chk "★ 人已經填的 SAT 不被蓋掉；錄取率填進去；用量是兩次加起來" "1400–1500|5.1%|110000" \
  "select (data#>>'{apply,sat}')||'|'||(data#>>'{apply,acceptance}')||'|'||(select usage->>'input' from public.mkt_research_jobs where post_id='${RP}' and grp='admissions') from public.college_posts where id='${RP}'"
chk "每一個來源排了一次頁面檢查，送出去了" "3|3" "select count(*)||'|'||count(*) filter (where status='sent') from public.mkt_source_checks where post_id='${RP}'"
CQ() { psql -d "${DB}" -X -A -t -q -c "select request_id from public.mkt_source_checks where post_id='${RP}' and url='$1'" | tr -d ' \n'; }
psql -d "${DB}" -q -v ON_ERROR_STOP=1 >/dev/null <<SQL
insert into net._http_response (id, status_code, content_type, content) values
 ($(CQ https://example.com/rank), 200, 'text/html; charset=utf-8', '<html><body><h2>#6 in <b>National Universities</b> (tie)</h2></body></html>'),
 ($(CQ https://example.com/cds), 403, 'text/html', 'Forbidden'),
 ($(CQ https://example.com/c1), 200, 'text/html', '<td>Total first-year applicants</td><td>54,191</td><td>Total admits</td><td>2,766</td>');
SQL
psql -d "${DB}" -X -A -t -q -c "select public.mkt_research_tick()" >/dev/null 2>&1
chk "★ 頁面檢查：整句找得到、只找到數字、打不開" "c1:numbers|cds:unreachable|rank:found" "select string_agg(regexp_replace(url,'.*/','')||':'||status, '|' order by url) from public.mkt_source_checks where post_id='${RP}'"
chk "頁面比對：句子不在、數字也不在就是找不到" "not_found|found" "select public.mkt_quote_on_page('SAT 1600 1700', '<p>SAT 1510 to 1570</p>')||'|'||public.mkt_quote_on_page('Total all undergraduates 6,640', 'TOTAL ALL UNDERGRADUATES 6640')"
chkas "${MKE}" "★ 進度：五個工作、花了多少錢（美金）、回給畫面的東西裡沒有金鑰" "5|t|false" \
  "select jsonb_array_length(s->'jobs')||'|'||((s->>'cost_usd')::numeric > 0)::text::char(1)||'|'||(s::text like '%SECRET%')::text from (select public.mkt_research_status('${RP}') s) x"
chkraise "★ 別的 team 的幹部看不到進度" "not_marketing" "perform set_config('test.uid','${OUTC}',true); perform public.mkt_research_status('${RP}');"
chkrole authenticated "${MKE}" "★ 連 Marketing 的人都不能直接讀研究工作表（裡面有整段對話）" "denied" "select case when has_table_privilege('authenticated','public.mkt_research_jobs','select') then 'open' else 'denied' end"
psql -d "${DB}" -q -c "insert into public.mkt_research_jobs (post_id, grp, status) select '${RP}', 'basic', 'done' from generate_series(1,46)" >/dev/null
RP2=$(psql -d "${DB}" -X -A -t -q -c "select set_config('test.uid','${MKE}',false);" -c "select public.mkt_post_create('Emory University')" 2>&1 | tail -1 | tr -d ' \n')
chkraise "★ 一天超過 50 個工作就擋（research_daily_limit）" "research_daily_limit" "perform set_config('test.uid','${MKE}',true); perform public.mkt_research_start('${RP2}');"
psql -d "${DB}" -q -c "delete from vault.decrypted_secrets where name='ANTHROPIC_API_KEY'" >/dev/null
chkraise "Vault 沒有金鑰就說還沒設定（research_not_ready）" "research_not_ready" "perform set_config('test.uid','${MKE}',true); perform public.mkt_research_start('${RP2}');"
rs2=$(psql -d "${DB}" -X -A -t -q -f supabase/migrations/2026-11-28-college-research.sql 2>&1 || true)
if echo "${rs2}" | grep -q "OVERALL.*PASS"; then echo "  ok   研究那支可以重跑"; pass=$((pass+1)); else echo "  FAIL 研究那支重跑沒過"; fail=$((fail+1)); fi
BROKEN=$(mktemp)
sed "s/    if v is null or not public.mkt_untouched(r.data, f.path) then continue; end if;/    if v is null then continue; end if;/" supabase/migrations/2026-11-28-college-research.sql > "${BROKEN}"
bk=$(psql -d "${DB}" -X -A -t -q -f "${BROKEN}" 2>&1 || true)
if echo "${bk}" | grep -q "OVERALL.*FAIL"; then echo "  ok   ★ 破壞測試：拿掉「只填空著的」，驗收表變紅"; pass=$((pass+1)); else echo "  FAIL 拿掉只填空著的驗收表沒變紅"; fail=$((fail+1)); fi
rm -f "${BROKEN}"
psql -d "${DB}" -X -A -t -q -f supabase/migrations/2026-11-28-college-research.sql >/dev/null 2>&1 || true
psql -d "${DB}" -q -c "drop function net.http_post(text, jsonb, jsonb, jsonb, int); drop function net.http_get(text, jsonb, jsonb, int); drop table net.fake_req; drop table net._http_response;" >/dev/null
echo "── 內部表單（2026-11-29-team-forms.sql）──"
# 這時候：PAUL Co-President、OTHER Senior Adviser、MKM Marketing 的 Director、MKE Marketing 的一般幹部、
# RQR Curriculum 的一般幹部、OUTC Mentorship 的一般幹部、STU 學員。資料全是假的。
tfgot=$(psql -d "${DB}" -X -A -t -q -v ON_ERROR_STOP=1 -f supabase/migrations/2026-11-29-team-forms.sql 2>&1 || true)
if echo "${tfgot}" | grep -q "OVERALL.*PASS" && ! echo "${tfgot}" | grep -q "|FAIL"; then echo "  ok   內部表單那支驗收表全 PASS"; pass=$((pass+1)); else echo "  FAIL 內部表單那支驗收表："; echo "${tfgot}" | head -20; fail=$((fail+1)); fi
TFQ='[{"type":"single","label":"Which quarter?","required":true,"options":["Q1","Q2","Q1"]},{"type":"scale","label":"Workload","required":true,"scale_min":1,"scale_max":3},{"type":"long","label":"Anything else?"}]'
chkraise "★ 一般幹部建不了表單（not_form_creator）" "not_form_creator" "perform set_config('test.uid','${OUTC}',true); perform public.tf_save_form(null, '{\"title\":\"x\"}'::jsonb, null);"
chkraise "★ Senior Adviser 沒被加進去也建不了（不自動有）" "not_form_creator" "perform set_config('test.uid','${OTHER}',true); perform public.tf_save_form(null, '{\"title\":\"x\"}'::jsonb, null);"
chkraise "★ 學員建不了" "not_form_creator" "perform set_config('test.uid','${STU}',true); perform public.tf_save_form(null, '{\"title\":\"x\"}'::jsonb, null);"
chkraise "單選少於兩個選項存不了（need_options）" "need_options:1" "perform set_config('test.uid','${PAUL}',true); perform public.tf_save_form(null, '{\"title\":\"x\"}'::jsonb, '[{\"type\":\"single\",\"label\":\"a\",\"options\":[\"only\"]}]'::jsonb);"
chkraise "量表 1 到 11 存不了（bad_scale）" "bad_scale:1" "perform set_config('test.uid','${PAUL}',true); perform public.tf_save_form(null, '{\"title\":\"x\"}'::jsonb, '[{\"type\":\"scale\",\"label\":\"a\",\"scale_max\":11}]'::jsonb);"
TF=$(psql -d "${DB}" -X -A -t -q -c "select set_config('test.uid','${PAUL}',false);" -c "select public.tf_save_form(null, '{\"title\":\"Quarterly check-in (fake)\",\"intro\":\"hi\"}'::jsonb, '${TFQ}'::jsonb)" 2>&1 | tail -1 | tr -d ' \n')
chk "Co-President 建一份：草稿、三題、選項去重" "draft|3|Q1,Q2" "select f.status||'|'||(select count(*) from public.tf_questions where form_id=f.id)||'|'||(select array_to_string(options,',') from public.tf_questions where form_id=f.id and ord=1) from public.tf_forms f where f.id='${TF}'"
TQ1=$(psql -d "${DB}" -X -A -t -q -c "select id from public.tf_questions where form_id='${TF}' and ord=1" | tr -d ' \n')
TQ2=$(psql -d "${DB}" -X -A -t -q -c "select id from public.tf_questions where form_id='${TF}' and ord=2" | tr -d ' \n')
TQ3=$(psql -d "${DB}" -X -A -t -q -c "select id from public.tf_questions where form_id='${TF}' and ord=3" | tr -d ' \n')
chkraise "沒選要給誰就開不了（need_recipients）" "need_recipients" "perform set_config('test.uid','${PAUL}',true); perform public.tf_set_status('${TF}','open');"
chkas "${PAUL}" "給 Marketing Team（寫成小寫也算）" "1" "select public.tf_set_audience('${TF}','recipient','[{\"kind\":\"team\",\"value\":\"marketing team\"}]'::jsonb)"
chkas "${PAUL}" "打開" "open" "select public.tf_set_status('${TF}','open')"
chkas "${MKE}" "★ 名單上的人首頁看得到這一份" "1" "select jsonb_array_length(public.tf_todo())"
chkas "${RQR}" "★ 不在名單上的人首頁看不到" "0" "select jsonb_array_length(public.tf_todo())"
chkraise "★ 不在名單上的人打不開（not_for_you）" "not_for_you" "perform set_config('test.uid','${RQR}',true); perform public.tf_fill('${TF}');"
chkraise "★ 不在名單上的人送不了" "not_for_you" "perform set_config('test.uid','${RQR}',true); perform public.tf_submit('${TF}', '{}'::jsonb);"
chkas "${MKE}" "名單上的人打得開、送得了" "true|3" "select (x->>'can_submit')||'|'||jsonb_array_length(x->'questions') from (select public.tf_fill('${TF}') x) t"
chkraise "必填沒填送不了（required）" "required:1" "perform set_config('test.uid','${MKE}',true); perform public.tf_submit('${TF}', '{}'::jsonb);"
chkraise "選項外的答案送不了（bad_option）" "bad_option:1" "perform set_config('test.uid','${MKE}',true); perform public.tf_submit('${TF}', '{\"${TQ1}\":\"Q9\",\"${TQ2}\":2}'::jsonb);"
chkraise "量表超出範圍送不了（bad_scale_value）" "bad_scale_value:2" "perform set_config('test.uid','${MKE}',true); perform public.tf_submit('${TF}', '{\"${TQ1}\":\"Q1\",\"${TQ2}\":4}'::jsonb);"
chkas "${MKE}" "送出" "1" "select count(*) from (select public.tf_submit('${TF}', '{\"${TQ1}\":\"Q1\",\"${TQ2}\":2,\"${TQ3}\":\"fake comment one\"}'::jsonb)) x"
chk "名字與 team 由伺服器填" "MiaEdit|MarketingTeam|site" "select replace(name,' ','')||'|'||replace(team,' ','')||'|'||source from public.tf_responses where form_id='${TF}' and user_id='${MKE}'"
chkraise "★ 填過就不能再送（already_submitted）" "already_submitted" "perform set_config('test.uid','${MKE}',true); perform public.tf_submit('${TF}', '{\"${TQ1}\":\"Q2\",\"${TQ2}\":3}'::jsonb);"
chkas "${MKE}" "★ 自己看得到自己的答案" "fakecommentone|2" "select replace(x#>>'{mine,answers,${TQ3}}',' ','')||'|'||(x#>>'{mine,answers,${TQ2}}') from (select public.tf_fill('${TF}') x) t"
chkas "${MKE}" "★ 自己的「我填過的」有這一份，首頁那一張卡沒了" "1|0" "select jsonb_array_length(b->'mine')||'|'||jsonb_array_length(b->'todo') from (select public.tf_bootstrap() b) t"
chkraise "★ 填的人看不到所有人的答案（not_form_reader）" "not_form_reader" "perform set_config('test.uid','${MKE}',true); perform public.tf_results('${TF}');"
chkas "${OTHER}" "★ Senior Adviser 不用被加進讀者就看得到（Paul 2026-11-06）" "1" "select jsonb_array_length(public.tf_results('${TF}')->'responses')"
chkraise "★ 同一個 team 的 Director 也看不到" "not_form_reader" "perform set_config('test.uid','${MKM}',true); perform public.tf_results('${TF}');"
chkas "${PAUL}" "★ Co-President 看得到：一份、名字、還沒填的是 MKM" "1|MiaEdit|MarkManage" "select jsonb_array_length(r->'responses')||'|'||replace(r#>>'{responses,0,name}',' ','')||'|'||replace(r#>>'{pending,0,name}',' ','') from (select public.tf_results('${TF}') r) t"
chkas "${PAUL}" "把 Director 這一級加進讀者" "1" "select public.tf_set_audience('${TF}','reader','[{\"kind\":\"rank\",\"value\":\"director\"}]'::jsonb)"
chkas "${MKM}" "★ 加進讀者之後 Director 看得到" "1" "select jsonb_array_length(public.tf_results('${TF}')->'responses')"
chkraise "★ 讀者改不了表單（not_form_editor）" "not_form_editor" "perform set_config('test.uid','${MKM}',true); perform public.tf_set_audience('${TF}','reader','[{\"kind\":\"all\"}]'::jsonb);"
chkas "${PAUL}" "把一個人（RQR）加進讀者，Director 那一級拿掉" "1" "select public.tf_set_audience('${TF}','reader','[{\"kind\":\"person\",\"value\":\"${RQR}\"}]'::jsonb)"
chkraise "★ 拿掉之後 Director 又看不到了" "not_form_reader" "perform set_config('test.uid','${MKM}',true); perform public.tf_results('${TF}');"
chkas "${RQR}" "★ 被點名的讀者看得到" "1" "select jsonb_array_length(public.tf_results('${TF}')->'responses')"
chkas "${RQR}" "讀者的 my_access 有 team-forms（view）" "view" "select e->>'level' from jsonb_array_elements(public.my_access()->'workspaces') e where e->>'id'='team-forms'"
chkas "${MKE}" "填的人的 my_access 沒有 team-forms" "0" "select count(*) from jsonb_array_elements(public.my_access()->'workspaces') e where e->>'id'='team-forms'"
chkraise "不存在的人加不進去（bad_person）" "bad_person" "perform set_config('test.uid','${PAUL}',true); perform public.tf_set_audience('${TF}','reader','[{\"kind\":\"person\",\"value\":\"${STU}\"}]'::jsonb);"
chkraise "編輯名單不收「全部幹部」（editor_not_all）" "editor_not_all" "perform set_config('test.uid','${PAUL}',true); perform public.tf_set_audience('${TF}','editor','[{\"kind\":\"all\"}]'::jsonb);"
chkas "${PAUL}" "把 OUTC 加成編輯" "1" "select public.tf_set_audience('${TF}','editor','[{\"kind\":\"person\",\"value\":\"${OUTC}\"}]'::jsonb)"
chkas "${OUTC}" "★ 編輯也是讀者" "1" "select jsonb_array_length(public.tf_results('${TF}')->'responses')"
chkas "${OUTC}" "編輯改得動要給誰（加上 Curriculum）" "2" "select public.tf_set_audience('${TF}','recipient','[{\"kind\":\"team\",\"value\":\"Marketing Team\"},{\"kind\":\"team\",\"value\":\"Curriculum Team\"}]'::jsonb)"
chkraise "★ 編輯改不了「誰能改這份」（not_form_owner）" "not_form_owner" "perform set_config('test.uid','${OUTC}',true); perform public.tf_set_audience('${TF}','editor','[{\"kind\":\"person\",\"value\":\"${OUTC}\"},{\"kind\":\"person\",\"value\":\"${MKE}\"}]'::jsonb);"
chkraise "★ 編輯刪不了整份（not_form_owner）" "not_form_owner" "perform set_config('test.uid','${OUTC}',true); perform public.tf_delete_form('${TF}');"
chk "每一次改名單都記了一筆" "4" "select count(*) from public.tf_log where form_id='${TF}' and what in ('recipient','reader','editor') and at > now() - interval '1 hour' and what <> 'x' and (what <> 'recipient' or after::text like '%Curriculum%')"
chkraise "有人答過的題目刪不了（question_has_answers）" "question_has_answers" "perform set_config('test.uid','${PAUL}',true); perform public.tf_save_form('${TF}', '{}'::jsonb, '[{\"id\":\"${TQ1}\",\"type\":\"single\",\"label\":\"Which quarter?\",\"options\":[\"Q1\",\"Q2\"]}]'::jsonb);"
chkraise "有人答過的題目不能換題型（question_type_locked）" "question_type_locked:2" "perform set_config('test.uid','${PAUL}',true); perform public.tf_save_form('${TF}', '{}'::jsonb, '[{\"id\":\"${TQ1}\",\"type\":\"single\",\"label\":\"Q\",\"options\":[\"Q1\",\"Q2\"]},{\"id\":\"${TQ2}\",\"type\":\"short\",\"label\":\"W\"},{\"id\":\"${TQ3}\",\"type\":\"long\",\"label\":\"A\"}]'::jsonb);"
chkas "${PAUL}" "改字、加一個選項可以，答案還在" "Q1|1" "select count(*) from (select public.tf_save_form('${TF}', '{}'::jsonb, '[{\"id\":\"${TQ1}\",\"type\":\"single\",\"label\":\"Which quarter is this?\",\"required\":true,\"options\":[\"Q1\",\"Q2\",\"Q3\"]},{\"id\":\"${TQ2}\",\"type\":\"scale\",\"label\":\"Workload\",\"required\":true,\"scale_min\":1,\"scale_max\":3},{\"id\":\"${TQ3}\",\"type\":\"long\",\"label\":\"Anything else?\"}]'::jsonb)) x; select (select value from public.tf_answers where question_id='${TQ1}')||'|'||(select count(*) from public.tf_responses where form_id='${TF}')"
chkas "${PAUL}" "改成匿名" "true" "select count(*)>0 from (select public.tf_save_form('${TF}', '{\"anonymous\":true}'::jsonb, null)) x; select anonymous::text from public.tf_forms where id='${TF}'"
chkas "${RQR}" "★ 匿名之後讀者看不到名字與帳號" "||" "select (r#>>'{responses,0,name}')||'|'||coalesce(r#>>'{responses,0,user_id}','')||'|'||(r#>>'{responses,0,team}') from (select public.tf_results('${TF}') r) t"
chkraise "★ 有人填過之後不能改回具名（anonymous_locked）" "anonymous_locked" "perform set_config('test.uid','${PAUL}',true); perform public.tf_save_form('${TF}', '{\"anonymous\":false}'::jsonb, null);"
chkraise "★ 有人填過之後不能退回草稿（has_responses）" "has_responses" "perform set_config('test.uid','${PAUL}',true); perform public.tf_set_status('${TF}','draft');"
chkas "${PAUL}" "收起來" "closed" "select public.tf_set_status('${TF}','closed')"
chkraise "★ 收起來之後送不了（form_closed）" "form_closed" "perform set_config('test.uid','${MKM}',true); perform public.tf_submit('${TF}', '{\"${TQ1}\":\"Q1\",\"${TQ2}\":2}'::jsonb);"
chkas "${MKE}" "收起來之後自己的答案還看得到" "Q1" "select public.tf_fill('${TF}')#>>'{mine,answers,${TQ1}}'"
# 可以改答案的表單、匯入、接到人
TF2=$(psql -d "${DB}" -X -A -t -q -c "select set_config('test.uid','${PAUL}',false);" -c "select public.tf_save_form(null, '{\"title\":\"Editable (fake)\",\"allow_edit\":true}'::jsonb, '[{\"type\":\"multi\",\"label\":\"Pick\",\"options\":[\"a\",\"b\",\"c\"]},{\"type\":\"short\",\"label\":\"Name\"}]'::jsonb)" 2>&1 | tail -1 | tr -d ' \n')
T2Q1=$(psql -d "${DB}" -X -A -t -q -c "select id from public.tf_questions where form_id='${TF2}' and ord=1" | tr -d ' \n')
psql -d "${DB}" -X -A -t -q -c "select set_config('test.uid','${PAUL}',false);" -c "select public.tf_set_audience('${TF2}','recipient','[{\"kind\":\"all\"}]'::jsonb); select public.tf_set_status('${TF2}','open');" >/dev/null 2>&1
chkas "${MKM}" "多選送兩個" "1" "select count(*) from (select public.tf_submit('${TF2}', ('{\"${T2Q1}\":[\"c\",\"a\"]}')::jsonb)) x"
chk "多選存成換行分隔、照選項順序" "a,c" "select replace(value, E'\n', ',') from public.tf_answers a join public.tf_responses r on r.id=a.response_id where r.form_id='${TF2}' and r.user_id='${MKM}' and a.question_id='${T2Q1}'"
chkas "${MKM}" "★ 開了「可以改」：再送一次是改，不是第二份" "1|b" "select count(*) from (select public.tf_submit('${TF2}', ('{\"${T2Q1}\":[\"b\"]}')::jsonb)) x; select (select count(*) from public.tf_responses where form_id='${TF2}' and user_id='${MKM}')||'|'||(select value from public.tf_answers a join public.tf_responses r on r.id=a.response_id where r.form_id='${TF2}' and r.user_id='${MKM}')"
IMP="[{\"user_id\":\"${RQR}\",\"name\":\"rae curr\",\"submitted_at\":\"2026-10-28T03:04:05Z\",\"answers\":{\"${T2Q1}\":\"a\"}},{\"user_id\":null,\"name\":\"Typed Person\",\"team\":\"Mentorship\",\"submitted_at\":\"2026-10-29T01:00:00Z\",\"answers\":{\"${T2Q1}\":\"zzz not an option\"}}]"
chkraise "★ 填的人匯入不了（not_form_editor）" "not_form_editor" "perform set_config('test.uid','${MKE}',true); perform public.tf_import('${TF2}', '${IMP}'::jsonb);"
chkas "${PAUL}" "匯入兩列（一列對到人、一列留打的名字）" "2" "select public.tf_import('${TF2}', '${IMP}'::jsonb)"
chk "★ 送出時間照 CSV、來源是 import、對到人的用他的名字" "2026-10-28T03:04:05|import|RaeCurr|raecurr" "select to_char(submitted_at at time zone 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS')||'|'||source||'|'||replace(name,' ','')||'|'||replace(typed_name,' ','') from public.tf_responses where form_id='${TF2}' and user_id='${RQR}'"
chk "對不到人的那一列留打的名字，選項外的值照樣收" "TypedPerson|zzznotanoption" "select replace(name,' ','')||'|'||replace(a.value,' ','') from public.tf_responses r join public.tf_answers a on a.response_id=r.id where r.form_id='${TF2}' and r.user_id is null"
chkas "${RQR}" "★ 對到的人在「我填過的」看得到匯入的那一份" "a" "select public.tf_fill('${TF2}')#>>'{mine,answers,${T2Q1}}'"
chkraise "同一個人匯兩次擋（already_answered）" "already_answered" "perform set_config('test.uid','${PAUL}',true); perform public.tf_import('${TF2}', '${IMP}'::jsonb);"
TR=$(psql -d "${DB}" -X -A -t -q -c "select id from public.tf_responses where form_id='${TF2}' and user_id is null" | tr -d ' \n')
chkraise "接到一個已經有答案的人擋（already_answered）" "already_answered" "perform set_config('test.uid','${PAUL}',true); perform public.tf_link_response('${TR}','${MKM}');"
chkas "${PAUL}" "把打的名字接到 OUTC" "OttoOut|TypedPerson" "select count(*) from (select public.tf_link_response('${TR}','${OUTC}')) x; select replace(name,' ','')||'|'||replace(typed_name,' ','') from public.tf_responses where id='${TR}'"
chkas "${PAUL}" "再拿掉，名字回到打的那個" "TypedPerson" "select count(*) from (select public.tf_link_response('${TR}',null)) x; select replace(name,' ','') from public.tf_responses where id='${TR}'"
# 誰能建表單：Paul 在人與權限把人加進 custom:team-forms
psql -d "${DB}" -q -c "insert into public.assignments (user_id, workspace_id, level) values ('${MKM}','custom:team-forms','view') on conflict do nothing;" >/dev/null
TF3=$(psql -d "${DB}" -X -A -t -q -c "select set_config('test.uid','${MKM}',false);" -c "select public.tf_save_form(null, '{\"title\":\"Director form (fake)\"}'::jsonb, '[{\"type\":\"short\",\"label\":\"q\"}]'::jsonb)" 2>&1 | tail -1 | tr -d ' \n')
chk "★ 被加進「誰能建」之後 Director 建得了，他是建立者" "${MKM}" "select owner from public.tf_forms where id='${TF3}'"
chkas "${MKM}" "建得了的人 my_access 是 edit" "edit" "select e->>'level' from jsonb_array_elements(public.my_access()->'workspaces') e where e->>'id'='team-forms'"
chkraise "★ 建得了不等於看得到別人的表單" "not_form_reader" "perform set_config('test.uid','${MKM}',true); perform public.tf_results('${TF}');"
chkas "${PAUL}" "★ Co-President 永遠看得到別人建的" "1" "select count(*) from (select public.tf_form_admin('${TF3}')) x"
chkas "${MKM}" "建立者改得動自己那份的編輯名單" "1" "select public.tf_set_audience('${TF3}','editor','[{\"kind\":\"person\",\"value\":\"${MKE}\"}]'::jsonb)"
chkas "${MKM}" "建立者刪得掉自己那份" "t" "select public.tf_delete_form('${TF3}')"
chkas "${PAUL}" "bootstrap：建得了、選人名單有人、管得到兩份" "true|t|2" "select (b->>'can_create')||'|'||(jsonb_array_length(b->'people')>0)::text::char(1)||'|'||jsonb_array_length(b->'manage') from (select public.tf_bootstrap() b) t"
chkas "${MKE}" "★ 填的人的 bootstrap 沒有選人名單" "false|0" "select (b->>'can_create')||'|'||jsonb_array_length(b->'people') from (select public.tf_bootstrap() b) t"
chkrole authenticated "${PAUL}" "★ 連 Co-President 都不能直接讀答案表（一律走函式）" "denied" "select case when has_table_privilege('authenticated','public.tf_answers','select') then 'open' else 'denied' end"
chkrole authenticated "${MKE}" "★ 直接 select 答案表被擋" "ERROR:permissiondeniedfortabletf_answers" "select count(*) from public.tf_answers" 
chkrole anon "" "★ 沒登入的人叫不到結果" "ERROR:permissiondeniedforfunctiontf_results" "select public.tf_results('${TF}')"
tf2=$(psql -d "${DB}" -X -A -t -q -f supabase/migrations/2026-11-29-team-forms.sql 2>&1 || true)
if echo "${tf2}" | grep -q "OVERALL.*PASS"; then echo "  ok   內部表單那支可以重跑"; pass=$((pass+1)); else echo "  FAIL 內部表單那支重跑沒過"; fail=$((fail+1)); fi
chk "重跑不動資料" "2|4" "select (select count(*) from public.tf_forms)||'|'||(select count(*) from public.tf_responses)"
chkas "${OTHER}" "重跑之後 finance 那一格還在（my_access 抄對了）" "1" "select count(*) from jsonb_array_elements(public.my_access()->'workspaces') e where e->>'id'='finance'"
BROKEN=$(mktemp)
sed "s/  if not public.tf_is_reader(p_form) then raise exception 'not_form_reader' using errcode = 'P0001'; end if;//" supabase/migrations/2026-11-29-team-forms.sql > "${BROKEN}"
bk=$(psql -d "${DB}" -X -A -t -q -f "${BROKEN}" 2>&1 || true)
if echo "${bk}" | grep -q "OVERALL.*FAIL"; then echo "  ok   ★ 破壞測試：拿掉「只有讀者看得到結果」，驗收表變紅"; pass=$((pass+1)); else echo "  FAIL 拿掉讀者門驗收表沒變紅"; fail=$((fail+1)); fi
sed "s/  if v_old.anonymous and not v_anon and v_has > 0 then raise exception 'anonymous_locked' using errcode = 'P0001'; end if;//" supabase/migrations/2026-11-29-team-forms.sql > "${BROKEN}"
bk=$(psql -d "${DB}" -X -A -t -q -f "${BROKEN}" 2>&1 || true)
if echo "${bk}" | grep -q "OVERALL.*FAIL"; then echo "  ok   ★ 破壞測試：拿掉「匿名改不回具名」，驗收表變紅"; pass=$((pass+1)); else echo "  FAIL 拿掉匿名鎖驗收表沒變紅"; fail=$((fail+1)); fi
sed "s/  if not public.tf_is_recipient(p_form) then raise exception 'not_for_you' using errcode = 'P0001'; end if;//" supabase/migrations/2026-11-29-team-forms.sql > "${BROKEN}"
bk=$(psql -d "${DB}" -X -A -t -q -f "${BROKEN}" 2>&1 || true)
if echo "${bk}" | grep -q "OVERALL.*FAIL"; then echo "  ok   ★ 破壞測試：拿掉「只有名單上的人送得了」，驗收表變紅"; pass=$((pass+1)); else echo "  FAIL 拿掉填的人門驗收表沒變紅"; fail=$((fail+1)); fi
sed "s/    or exists (select 1 from public.assignments a where a.workspace_id = 'custom:team-forms' and a.user_id = auth.uid())/    or public.can_view('custom:team-forms')/" supabase/migrations/2026-11-29-team-forms.sql > "${BROKEN}"
bk=$(psql -d "${DB}" -X -A -t -q -f "${BROKEN}" 2>&1 || true)
if echo "${bk}" | grep -q "OVERALL.*FAIL"; then echo "  ok   ★ 破壞測試：「誰能建」改用 can_view（SA 會自動有），驗收表變紅"; pass=$((pass+1)); else echo "  FAIL 改用 can_view 驗收表沒變紅"; fail=$((fail+1)); fi
sed "s/ or public.is_senior() or / or /" supabase/migrations/2026-11-29-team-forms.sql > "${BROKEN}"
bk=$(psql -d "${DB}" -X -A -t -q -f "${BROKEN}" 2>&1 || true)
if echo "${bk}" | grep -q "OVERALL.*FAIL"; then echo "  ok   ★ 破壞測試：拿掉「Senior Adviser 讀得到」，驗收表變紅"; pass=$((pass+1)); else echo "  FAIL 拿掉 SA 讀者驗收表沒變紅"; fail=$((fail+1)); fi
rm -f "${BROKEN}"
psql -d "${DB}" -X -A -t -q -f supabase/migrations/2026-11-29-team-forms.sql >/dev/null 2>&1 || true
chkraise "破壞測試之後裝回正確版本，一般幹部又建不了了" "not_form_creator" "perform set_config('test.uid','${RQR}',true); perform public.tf_save_form(null, '{\"title\":\"x\"}'::jsonb, null);"
echo "── 內部表單拿掉匯入（2026-11-30-team-forms-no-import.sql）──"
tfn=$(psql -d "${DB}" -X -A -t -q -v ON_ERROR_STOP=1 -f supabase/migrations/2026-11-30-team-forms-no-import.sql 2>&1 || true)
# 第 4 列是參考：上面那一段測過匯入，所以本機有匯入的列，那一列印「看一下」不算錯。
if echo "${tfn}" | grep -q "OVERALL.*PASS" && ! echo "${tfn}" | grep -q "|FAIL"; then echo "  ok   拿掉匯入那支驗收表全 PASS"; pass=$((pass+1)); else echo "  FAIL 拿掉匯入那支驗收表："; echo "${tfn}" | head -10; fail=$((fail+1)); fi
chkraise "★ 連 Co-President 都叫不到 tf_import 了" "does not exist" "perform set_config('test.uid','${PAUL}',true); perform public.tf_import('${TF2}', '[]'::jsonb);"
chkraise "★ tf_link_response 也不在了" "does not exist" "perform set_config('test.uid','${PAUL}',true); perform public.tf_link_response('${TR}', null);"
chk "拿掉函式不動已經有的答案" "2|4" "select (select count(*) from public.tf_forms)||'|'||(select count(*) from public.tf_responses)"
chkas "${PAUL}" "結果頁照樣讀得到（tf_results 沒被牽動）" "1" "select count(*) from (select public.tf_results('${TF2}')) x"
tfn2=$(psql -d "${DB}" -X -A -t -q -f supabase/migrations/2026-11-30-team-forms-no-import.sql 2>&1 || true)
if echo "${tfn2}" | grep -q "OVERALL.*PASS"; then echo "  ok   拿掉匯入那支可以重跑"; pass=$((pass+1)); else echo "  FAIL 拿掉匯入那支重跑沒過"; fail=$((fail+1)); fi
BROKEN=$(mktemp)
sed "s/^drop function if exists public.tf_import(uuid, jsonb);//" supabase/migrations/2026-11-30-team-forms-no-import.sql > "${BROKEN}"
psql -d "${DB}" -X -A -t -q -f supabase/migrations/2026-11-29-team-forms.sql >/dev/null 2>&1 || true
bk=$(psql -d "${DB}" -X -A -t -q -f "${BROKEN}" 2>&1 || true)
if echo "${bk}" | grep -q "OVERALL.*FAIL"; then echo "  ok   ★ 破壞測試：漏拿 tf_import，驗收表變紅"; pass=$((pass+1)); else echo "  FAIL 漏拿 tf_import 驗收表沒變紅"; fail=$((fail+1)); fi
rm -f "${BROKEN}"
psql -d "${DB}" -X -A -t -q -f supabase/migrations/2026-11-30-team-forms-no-import.sql >/dev/null 2>&1 || true
chk "破壞測試之後裝回來，兩支都不在" "0" "select count(*) from pg_proc where pronamespace='public'::regnamespace and proname in ('tf_import','tf_link_response')"
echo "── BT Records：人、活動、出席、回饋、配對、去向（2026-12-01-records.sql）──"
# 這時候：PAUL Co-President、OTHER Senior Adviser、DIR 管 winter-camp-2027 那場活動的工作區、MKE Marketing 的一般幹部、
# OUTC Mentorship 的一般幹部（沒有任何指派）、EVS1 報過名又被拒的學員。資料全是假的。
rcgot=$(psql -d "${DB}" -X -A -t -q -v ON_ERROR_STOP=1 -f supabase/migrations/2026-12-01-records.sql 2>&1 || true)
if echo "${rcgot}" | grep -q "OVERALL.*PASS" && ! echo "${rcgot}" | grep -q "|FAIL"; then echo "  ok   紀錄那支驗收表全 PASS"; pass=$((pass+1)); else echo "  FAIL 紀錄那支驗收表："; echo "${rcgot}" | head -20; fail=$((fail+1)); fi
RCEV=$(psql -d "${DB}" -X -A -t -q -c "select id from public.events where slug='winter-camp-2027'" | tr -d ' \n')
RCMEM=$(psql -d "${DB}" -X -A -t -q -c "select set_config('test.uid','${PAUL}',false);" -c "select count(*) from public.roster()" 2>/dev/null | tail -1 | tr -d ' \n')
chkas "${OUTC}" "沒指派的幹部打得開總覽，但管不了、一場活動都看不到" "false|false|0" "select (b->>'can_manage')||'|'||(b->>'can_view')||'|'||jsonb_array_length(b->'events') from (select public.rc_bootstrap() b) t"
chkas "${DIR}" "★ 活動工作區裡的人看得到自己那一場（不是管的人）" "false|1" "select (b->>'can_manage')||'|'||jsonb_array_length(b->'events') from (select public.rc_bootstrap() b) t"
chkas "${DIR}" "活動工作區裡的人的 my_access 有 records（view）" "view" "select e->>'level' from jsonb_array_elements(public.my_access()->'workspaces') e where e->>'id'='records'"
chkas "${OUTC}" "沒指派的幹部 my_access 沒有 records" "0" "select count(*) from jsonb_array_elements(public.my_access()->'workspaces') e where e->>'id'='records'"
chkas "${PAUL}" "Co-President 管得了，my_access 是 edit" "true|edit" "select public.rc_can_manage()||'|'||(select e->>'level' from jsonb_array_elements(public.my_access()->'workspaces') e where e->>'id'='records')"
chkraise "★ 活動以外的人改不了活動的種類（not_event_editor）" "not_event_editor" "perform set_config('test.uid','${OUTC}',true); perform public.rc_save_event_meta('${RCEV}', '{\"kind\":\"bootcamp\"}'::jsonb);"
chkas "${DIR}" "Director 把那場標成探索營、2026-27 屆" "bootcamp|2026-27" "select public.rc_save_event_meta('${RCEV}', '{\"kind\":\"bootcamp\",\"term_id\":\"2026-27\"}'::jsonb); select kind||'|'||term_id from public.events where id='${RCEV}'"
chkraise "沒有的屆別擋（no_such_term）" "no_such_term" "perform set_config('test.uid','${DIR}',true); perform public.rc_save_event_meta('${RCEV}', '{\"term_id\":\"1999-00\"}'::jsonb);"
chkas "${DIR}" "兩個場次" "2" "select public.rc_set_sessions('${RCEV}', '[{\"title\":\"Day 1\",\"starts_at\":\"2027-01-30T01:00:00Z\"},{\"title\":\"Day 2\",\"starts_at\":\"2027-01-31T01:00:00Z\"}]'::jsonb)"
chkas "${DIR}" "★ 從報名表抄出席：一份被拒的 → cancelled，學員變成名單上的一個人（kind student、接上帳號）" "1|cancelled|student|true" "select public.rc_sync_event('${RCEV}'); select (select count(*) from public.rc_participation where event_id='${RCEV}')||'|'||(select x.status||'|'||pe.kind||'|'||(pe.profile_id is not null) from public.rc_participation x join public.people pe on pe.id=x.person_id where x.event_id='${RCEV}' and x.application_id is not null)"
chkas "${PAUL}" "★ 學員不會跑進幹部名單（roster 人數不變）" "${RCMEM}" "select count(*) from public.roster()"
chkas "${DIR}" "抄兩次不會多一列" "1" "select public.rc_sync_event('${RCEV}'); select count(*) from public.rc_participation where event_id='${RCEV}'"
chkraise "★ 活動以外的人記不了出席（not_event_editor）" "not_event_editor" "perform set_config('test.uid','${OUTC}',true); perform public.rc_set_participation('${RCEV}', '{\"email\":\"a@example.com\",\"name_zh\":\"甲\"}'::jsonb);"
psql -d "${DB}" -X -A -t -q -c "select set_config('test.uid','${DIR}',false);" \
  -c "select public.rc_set_participation('${RCEV}', '{\"email\":\"stu-a@example.com\",\"name_zh\":\"學員甲\",\"name_en\":\"Dup Student\",\"school\":\"北一女\",\"grad_year\":2028,\"status\":\"attended\"}'::jsonb)" \
  -c "select public.rc_set_participation('${RCEV}', '{\"email\":\"stu-b@example.com\",\"name_zh\":\"學員乙\",\"status\":\"attended\"}'::jsonb)" \
  -c "select public.rc_set_participation('${RCEV}', '{\"email\":\"stu-c@example.com\",\"name_zh\":\"學員丙\",\"status\":\"no-show\"}'::jsonb)" >/dev/null 2>&1
chkas "${DIR}" "★ 記分卡：報名 3（被拒的不算）、到 2、出席率 66.7" "3|2|66.7" "select (n->>'registered')||'|'||(n->>'attended')||'|'||(n->>'attendance_rate') from (select public.rc_event('${RCEV}')#>'{event,numbers}' n) t"
chkas "${DIR}" "同一個人同一場再記一次只是改狀態" "3|4" "select public.rc_set_participation('${RCEV}', '{\"email\":\"stu-c@example.com\",\"status\":\"attended\"}'::jsonb); select (select count(*) from public.rc_participation where event_id='${RCEV}' and status='attended')||'|'||(select count(*) from public.rc_participation where event_id='${RCEV}')"
chkraise "★ 沒指派的幹部建不了回饋表（not_form_creator）" "not_form_creator" "perform set_config('test.uid','${OUTC}',true); perform public.rc_save_form(null, '{\"title\":\"x\",\"event_id\":\"${RCEV}\"}'::jsonb, null);"
chkraise "★ 活動工作區的人建不了配對回饋（只有管的人）" "not_form_creator" "perform set_config('test.uid','${DIR}',true); perform public.rc_save_form(null, '{\"title\":\"x\",\"kind\":\"pair-mentee\",\"event_id\":\"${RCEV}\"}'::jsonb, null);"
RCQ='[{"key":"recommend","type":"scale","label":"How likely are you to recommend this event?","required":true},{"key":"useful","type":"scale","label":"How useful was today?"},{"key":"best","type":"short","label":"Most useful part?"},{"key":"change","type":"long","label":"What should we change?"},{"key":"first_time","type":"single","label":"First BT event?","options":["Yes","No"]}]'
chkraise "key 只能是小寫字母（bad_key）" "bad_key:1" "perform set_config('test.uid','${DIR}',true); perform public.rc_save_form(null, '{\"title\":\"x\",\"event_id\":\"${RCEV}\"}'::jsonb, '[{\"key\":\"Bad Key\",\"type\":\"short\",\"label\":\"a\"}]'::jsonb);"
RCF=$(psql -d "${DB}" -X -A -t -q -c "select set_config('test.uid','${DIR}',false);" -c "select public.rc_save_form(null, '{\"title\":\"Winter camp feedback (fake)\",\"event_id\":\"${RCEV}\"}'::jsonb, '${RCQ}'::jsonb)" 2>&1 | tail -1 | tr -d ' \n')
chk "活動工作區的人建了一份：草稿、匿名、五題、有 token" "draft|true|5|24" "select f.status||'|'||f.anonymous||'|'||(select count(*) from public.rc_questions where form_id=f.id)||'|'||length(f.token) from public.rc_forms f where f.id='${RCF}'"
RCTOK=$(psql -d "${DB}" -X -A -t -q -c "select token from public.rc_forms where id='${RCF}'" | tr -d ' \n')
RQ1=$(psql -d "${DB}" -X -A -t -q -c "select id from public.rc_questions where form_id='${RCF}' and key='recommend'" | tr -d ' \n')
RQ2=$(psql -d "${DB}" -X -A -t -q -c "select id from public.rc_questions where form_id='${RCF}' and key='useful'" | tr -d ' \n')
RQ3=$(psql -d "${DB}" -X -A -t -q -c "select id from public.rc_questions where form_id='${RCF}' and key='best'" | tr -d ' \n')
chkrole anon "" "★ 草稿沒登入的人拿不到" "true" "select (public.rc_public_form('${RCTOK}') is null)::text"
chkas "${DIR}" "打開" "open" "select public.rc_set_status('${RCF}','open')"
chkrole anon "" "★ 開了之後沒登入的人用 token 拿得到題目，而且裡面沒有別人的答案也沒有 owner" "5|true|false" "select jsonb_array_length(x->'questions')||'|'||(x#>>'{form,open}')||'|'||(x ? 'responses') from (select public.rc_public_form('${RCTOK}') x) t"
chkraise "必填沒填送不了（required）" "required:1" "perform public.rc_public_submit('${RCTOK}', '{}'::jsonb, '{}'::jsonb);"
chkraise "量表超出範圍送不了（bad_scale_value）" "bad_scale_value:1" "perform public.rc_public_submit('${RCTOK}', '{\"${RQ1}\":9}'::jsonb, '{}'::jsonb);"
chkraise "錯的 token 送不了（form_not_found）" "form_not_found" "perform public.rc_public_submit('nope', '{\"${RQ1}\":5}'::jsonb, '{}'::jsonb);"
chkrole anon "" "★ 沒登入的人送出一份（18 歲以下、不留聯絡）" "1" "select count(*) from (select public.rc_public_submit('${RCTOK}', '{\"${RQ1}\":5,\"${RQ2}\":4,\"${RQ3}\":\"the alumni panel\"}'::jsonb, '{\"age_band\":\"under18\"}'::jsonb)) x"
chkrole anon "" "第二份留了 email 而且勾了可以聯絡" "1" "select count(*) from (select public.rc_public_submit('${RCTOK}', '{\"${RQ1}\":3,\"${RQ2}\":2,\"${RQ3}\":\"nothing\"}'::jsonb, '{\"age_band\":\"18plus\",\"contact_ok\":true,\"email\":\"stu-b@example.com\",\"name\":\"學員乙\"}'::jsonb)) x"
chk "★ 沒留 email 的那份不掛人；留了的那份對到既有的學員乙（同一個人，不是新的一列）" "1|1|學員乙" "select (select count(*) from public.rc_responses where form_id='${RCF}' and person_id is null)||'|'||(select count(*) from public.rc_responses where form_id='${RCF}' and person_id is not null)||'|'||(select pe.name_zh from public.rc_responses r join public.people pe on pe.id=r.person_id where r.form_id='${RCF}' and r.contact_ok)"
chkraise "留了 email 但格式錯擋（bad_email）" "bad_email" "perform public.rc_public_submit('${RCTOK}', '{\"${RQ1}\":5}'::jsonb, '{\"contact_ok\":true,\"email\":\"not-an-email\"}'::jsonb);"
angot=$(psql -d "${DB}" -X -A -t -q -c "set role anon; select public.rc_results('${RCF}');" 2>&1 || true)
if echo "${angot}" | grep -qi "permission denied"; then echo "  ok   ★ 沒登入的人叫不到 rc_results"; pass=$((pass+1)); else echo "  FAIL anon 叫得到 rc_results：${angot}"; fail=$((fail+1)); fi
angot=$(psql -d "${DB}" -X -A -t -q -c "set role anon; select count(*) from public.rc_responses;" 2>&1 || true)
if echo "${angot}" | grep -qi "permission denied"; then echo "  ok   ★ anon 讀不到 rc_responses 表本身"; pass=$((pass+1)); else echo "  FAIL anon 讀得到 rc_responses：${angot}"; fail=$((fail+1)); fi
chkraise "★ 沒指派的幹部看不到答案（not_form_reader）" "not_form_reader" "perform set_config('test.uid','${OUTC}',true); perform public.rc_results('${RCF}');"
chkas "${DIR}" "★ 活動工作區「改」以上的人看得到：兩份、匿名所以沒有名字、留 email 的只印「有留」不印 email" "2||true|false" "select jsonb_array_length(r->'responses')||'|'||(r#>>'{responses,0,name}')||'|'||(select bool_or((e->>'contact_ok')::boolean) from jsonb_array_elements(r->'responses') e)||'|'||(r::text like '%stu-b@example.com%') from (select public.rc_results('${RCF}') r) t"
chkas "${OTHER}" "★ Senior Adviser 讀得到活動回饋" "2" "select jsonb_array_length(public.rc_results('${RCF}')->'responses')"
chkas "${DIR}" "★ 記分卡：兩份回饋、推薦平均 4.00、有用 3.00、留言兩則" "2|4.00|3.00|2" "select (x#>>'{event,numbers,responses}')||'|'||(x#>>'{event,numbers,recommend_avg}')||'|'||(x#>>'{event,numbers,useful_avg}')||'|'||jsonb_array_length(x->'comments') from (select public.rc_event('${RCEV}') x) t"
chkraise "★ 有人填過之後不能從匿名改回具名（anonymous_locked）" "anonymous_locked" "perform set_config('test.uid','${DIR}',true); perform public.rc_save_form('${RCF}', '{\"anonymous\":false}'::jsonb, null);"
chkraise "★ 沒指派的幹部看不到記分卡（not_event_viewer）" "not_event_viewer" "perform set_config('test.uid','${OUTC}',true); perform public.rc_event('${RCEV}');"
chkas "${DIR}" "★ 檢討：寫下「下一次我們改什麼」，數字當下抄一份快照" "4.00|2|Shorterday2" "select public.rc_save_review('${RCEV}', '{\"we_change\":\"Shorter day 2\",\"went_well\":\"panel\"}'::jsonb); select recommend_avg||'|'||responses||'|'||we_change from public.rc_reviews where event_id='${RCEV}'"
chkraise "★ 活動以外的人寫不了檢討（not_event_editor）" "not_event_editor" "perform set_config('test.uid','${OUTC}',true); perform public.rc_save_review('${RCEV}', '{\"we_change\":\"x\"}'::jsonb);"
# 導生學期：管的人建一場舊的 mentorship-term 活動，配對，配對回饋只有管的人與點名的讀者看得到。
chkraise "★ 沒指派的幹部建不了舊活動（not_records_manager）" "not_records_manager" "perform set_config('test.uid','${OUTC}',true); perform public.rc_add_past_event('{\"slug\":\"f26-mentorship\",\"kind\":\"mentorship-term\"}'::jsonb);"
RCMT=$(psql -d "${DB}" -X -A -t -q -c "select set_config('test.uid','${PAUL}',false);" -c "select public.rc_add_past_event('{\"slug\":\"f26-mentorship\",\"kind\":\"mentorship-term\",\"term_id\":\"2026-27\",\"title_en\":\"Fall 2026 Mentorship\",\"team\":\"Mentorship Team\"}'::jsonb)" 2>&1 | tail -1 | tr -d ' \n')
chk "舊活動：archived、掛在 custom:records、source import、不上對外頁" "archived|custom:records|import|0" "select e.status||'|'||e.workspace_id||'|'||e.source||'|'||(select count(*) from public.public_events() p where p.slug=e.slug) from public.events e where e.id='${RCMT}'"
RCPAIR=$(psql -d "${DB}" -X -A -t -q -c "select set_config('test.uid','${PAUL}',false);" -c "select public.rc_save_pair(null, '{\"event_id\":\"${RCMT}\",\"mentor_email\":\"mke@example.com\",\"mentee_email\":\"mentee-1@example.com\",\"mentee_name_zh\":\"學員丁\",\"mentee_school\":\"中山女高\",\"mentee_grad_year\":2027}'::jsonb)" 2>&1 | tail -1 | tr -d ' \n')
chk "★ 一對配對：mentor 用 email 對到既有的幹部帳號（名單上原本沒有他那一列，自動建並接上）、mentee 是新的學員，兩個人都算這個學期的出席" "MiaEdit|true|學員丁|2" "select public.rc_person_name(pr.mentor_id)||'|'||(select profile_id='${MKE}' from public.people where id=pr.mentor_id)||'|'||(select name_zh from public.people where id=pr.mentee_id)||'|'||(select count(*) from public.rc_participation where event_id='${RCMT}') from public.rc_pairs pr where pr.id='${RCPAIR}'"
RCMENTEE=$(psql -d "${DB}" -X -A -t -q -c "select mentee_id from public.rc_pairs where id='${RCPAIR}'" | tr -d ' \n')
RCPF=$(psql -d "${DB}" -X -A -t -q -c "select set_config('test.uid','${PAUL}',false);" -c "select public.rc_save_form(null, '{\"title\":\"Mentee check-in (fake)\",\"kind\":\"pair-mentee\",\"event_id\":\"${RCMT}\"}'::jsonb, '[{\"key\":\"comfortable\",\"type\":\"scale\",\"label\":\"Comfortable asking?\"}]'::jsonb)" 2>&1 | tail -1 | tr -d ' \n')
chkraise "★ mentor 加不進配對回饋的讀者（mentor_cannot_read）" "mentor_cannot_read" "perform set_config('test.uid','${PAUL}',true); perform public.rc_set_audience('${RCPF}','reader','[{\"kind\":\"person\",\"value\":\"${MKE}\"}]'::jsonb);"
chkraise "★ 配對回饋的讀者只能點名，不能整個 team（pair_readers_by_person）" "pair_readers_by_person" "perform set_config('test.uid','${PAUL}',true); perform public.rc_set_audience('${RCPF}','reader','[{\"kind\":\"team\",\"value\":\"Mentorship Team\"}]'::jsonb);"
chkas "${PAUL}" "把 Mentorship 的一位幹部（OUTC）點名成讀者" "1" "select public.rc_set_audience('${RCPF}','reader','[{\"kind\":\"person\",\"value\":\"${OUTC}\"}]'::jsonb)"
chkraise "★ Senior Adviser 讀不到配對回饋（not_form_reader）" "not_form_reader" "perform set_config('test.uid','${OTHER}',true); perform public.rc_results('${RCPF}');"
chkraise "★ mentor 自己讀不到" "not_form_reader" "perform set_config('test.uid','${MKE}',true); perform public.rc_results('${RCPF}');"
chkas "${OUTC}" "★ 被點名的讀者讀得到" "0" "select jsonb_array_length(public.rc_results('${RCPF}')->'responses')"
chkas "${PAUL}" "Co-President 當然讀得到" "0" "select jsonb_array_length(public.rc_results('${RCPF}')->'responses')"
# 去向
chkas "${MKE}" "★ 本人替自己填去向（source self）" "self|1" "select public.rc_save_outcome(null, '{\"kind\":\"enrolled\",\"institution\":\"NYU\",\"country\":\"US\",\"major\":\"Econ\",\"year\":2025}'::jsonb); select (select source from public.rc_outcomes o where o.person_id=public.rc_me_person())||'|'||jsonb_array_length(public.rc_my_outcomes())"
chkraise "★ 一般幹部替別人填不了（not_records_manager）" "not_records_manager" "perform set_config('test.uid','${OUTC}',true); perform public.rc_save_outcome(null, '{\"person_id\":\"${RCMENTEE}\",\"kind\":\"admitted\"}'::jsonb);"
chkas "${PAUL}" "管的人替 mentee 填（source mentorship）" "mentorship" "select public.rc_save_outcome(null, '{\"person_id\":\"${RCMENTEE}\",\"kind\":\"admitted\",\"institution\":\"UW\",\"country\":\"US\",\"year\":2027}'::jsonb); select source from public.rc_outcomes where person_id='${RCMENTEE}'"
chkas "${PAUL}" "★ 一個人的時間軸：出席 1、配對 1、去向 1" "1|1|1|mentee" "select jsonb_array_length(x->'participation')||'|'||jsonb_array_length(x->'pairs')||'|'||jsonb_array_length(x->'outcomes')||'|'||(x#>>'{pairs,0,as}') from (select public.rc_person('${RCMENTEE}') x) t"
chkraise "★ 沒指派的幹部看不到人的時間軸（not_records_viewer）" "not_records_viewer" "perform set_config('test.uid','${OUTC}',true); perform public.rc_person('${RCMENTEE}');"
chkas "${OTHER}" "Senior Adviser 看得到時間軸，但看不到 email 那一欄（identities 只給管的人）" "0" "select jsonb_array_length(public.rc_person('${RCMENTEE}')->'identities')"
# 重複與合併
RCDUP0=$(psql -d "${DB}" -X -A -t -q -c "select set_config('test.uid','${PAUL}',false);" -c "select jsonb_array_length(public.rc_duplicates())" | tail -1 | tr -d ' \n')
psql -d "${DB}" -X -A -t -q -c "select set_config('test.uid','${PAUL}',false);" -c "select public.rc_save_person(null, '{\"name_zh\":\"學員甲二\",\"name_en\":\"Dup Student\",\"school\":\"中山女高\",\"kind\":\"student\"}'::jsonb)" >/dev/null 2>&1
chkas "${PAUL}" "★ 同英文名、不同學校：只提示（多一組），不自動合併" "$((RCDUP0+1))|1" "select jsonb_array_length(d)||'|'||(select count(*) from jsonb_array_elements(d) e where e->>'a_name'='Dup Student' and e->>'why'='name_en') from (select public.rc_duplicates() d) t"
RCDA=$(psql -d "${DB}" -X -A -t -q -c "select id from public.people where name_en='Dup Student' and school='北一女'" | tr -d ' \n')
RCDB=$(psql -d "${DB}" -X -A -t -q -c "select id from public.people where name_en='Dup Student' and school='中山女高'" | tr -d ' \n')
chkraise "★ 沒指派的幹部合併不了（not_records_manager）" "not_records_manager" "perform set_config('test.uid','${OUTC}',true); perform public.rc_merge_people('${RCDA}','${RCDB}');"
chkas "${PAUL}" "合併：留一列、出席還在、提示少一組" "1|0|1|${RCDUP0}" "select public.rc_merge_people('${RCDA}','${RCDB}'); select (select count(*) from public.people where id='${RCDA}')||'|'||(select count(*) from public.people where id='${RCDB}')||'|'||(select count(*) from public.rc_participation where person_id='${RCDA}')||'|'||jsonb_array_length(public.rc_duplicates())"
# 忘記一個人
chkraise "★ Director 不能忘記一個人（not_president）" "not_president" "perform set_config('test.uid','${DIR}',true); perform public.forget_person('${RCMENTEE}');"
chkas "${PAUL}" "★ Co-President 忘記 mentee：名字清掉、去向刪掉、配對留空殼、列還在" "|0|true|1" "select public.forget_person('${RCMENTEE}'); select coalesce((select name_zh from public.people where id='${RCMENTEE}'),'')||'|'||(select count(*) from public.rc_outcomes where person_id='${RCMENTEE}')||'|'||(select mentee_id is null from public.rc_pairs where id='${RCPAIR}')||'|'||(select count(*) from public.people where id='${RCMENTEE}')"
chkas "${PAUL}" "年度比較：2026-27 有 bootcamp 與 mentorship-term 兩列，bootcamp 那列帶著「下一次改什麼」" "2|Shorterday2" "select jsonb_array_length(y)||'|'||(select e->'changes'->0->>'we_change' from jsonb_array_elements(y) e where e->>'kind'='bootcamp') from (select public.rc_yearly() y) t"
rc2=$(psql -d "${DB}" -X -A -t -q -f supabase/migrations/2026-12-01-records.sql 2>&1 || true)
if echo "${rc2}" | grep -q "OVERALL.*PASS"; then echo "  ok   紀錄那支可以重跑，資料還在"; pass=$((pass+1)); else echo "  FAIL 紀錄那支重跑沒過"; fail=$((fail+1)); fi
chk "重跑之後答案、配對、檢討都還在" "2|1|1" "select (select count(*) from public.rc_responses where form_id='${RCF}')||'|'||(select count(*) from public.rc_pairs)||'|'||(select count(*) from public.rc_reviews)"
BROKEN=$(mktemp)
sed "s/      or exists (select 1 from public.rc_forms f where f.id = p_form and f.kind not like 'pair-%' and public.is_senior());/      or public.is_senior();/" supabase/migrations/2026-12-01-records.sql > "${BROKEN}"
bk=$(psql -d "${DB}" -X -A -t -q -f "${BROKEN}" 2>&1 || true)
if echo "${bk}" | grep -q "OVERALL.*FAIL"; then echo "  ok   ★ 破壞測試：拿掉「配對回饋 Senior Adviser 讀不到」，驗收表變紅"; pass=$((pass+1)); else echo "  FAIL 拿掉配對規則驗收表沒變紅"; fail=$((fail+1)); fi
sed "s/   where public.is_senior() and pe.kind = 'member'/   where public.is_senior()/" supabase/migrations/2026-12-01-records.sql > "${BROKEN}"
bk=$(psql -d "${DB}" -X -A -t -q -f "${BROKEN}" 2>&1 || true)
if echo "${bk}" | grep -q "OVERALL.*FAIL"; then echo "  ok   ★ 破壞測試：roster() 不再只列成員，驗收表變紅"; pass=$((pass+1)); else echo "  FAIL roster 不過濾驗收表沒變紅"; fail=$((fail+1)); fi
sed "s/grant execute on function public.rc_public_form(text), public.rc_public_submit(text, jsonb, jsonb) to anon, authenticated;/grant execute on function public.rc_public_form(text), public.rc_public_submit(text, jsonb, jsonb), public.rc_results(uuid) to anon, authenticated;/" supabase/migrations/2026-12-01-records.sql > "${BROKEN}"
bk=$(psql -d "${DB}" -X -A -t -q -f "${BROKEN}" 2>&1 || true)
if echo "${bk}" | grep -q "OVERALL.*FAIL"; then echo "  ok   ★ 破壞測試：多開一支給 anon，驗收表變紅"; pass=$((pass+1)); else echo "  FAIL 多開一支給 anon 驗收表沒變紅"; fail=$((fail+1)); fi
rm -f "${BROKEN}"
psql -d "${DB}" -X -A -t -q -f supabase/migrations/2026-12-01-records.sql >/dev/null 2>&1 || true
chkraise "破壞測試之後裝回正確版本，Senior Adviser 又讀不到配對回饋了" "not_form_reader" "perform set_config('test.uid','${OTHER}',true); perform public.rc_results('${RCPF}');"
echo "── 紀錄跟隱私政策對齊（2026-12-02-records-privacy.sql）──"
rpgot=$(psql -d "${DB}" -X -A -t -q -v ON_ERROR_STOP=1 -f supabase/migrations/2026-12-02-records-privacy.sql 2>&1 || true)
if echo "${rpgot}" | grep -q "OVERALL.*PASS" && ! echo "${rpgot}" | grep -q "|FAIL"; then echo "  ok   隱私那支驗收表全 PASS"; pass=$((pass+1)); else echo "  FAIL 隱私那支驗收表："; echo "${rpgot}" | head -20; fail=$((fail+1)); fi
# 去向 public 只有本人；學員誰填都不行。RCDA 是合併後留下的那位學員，MKE 上面替自己填過一筆。
chkraise "★ 管的人替學員填「可以連名字公開」被擋（public_needs_self）" "public_needs_self" "perform set_config('test.uid','${PAUL}',true); perform public.rc_save_outcome(null, '{\"person_id\":\"${RCDA}\",\"kind\":\"admitted\",\"visibility\":\"public\"}'::jsonb);"
RCMKO=$(psql -d "${DB}" -X -A -t -q -c "select o.id from public.rc_outcomes o join public.people pe on pe.id=o.person_id where pe.profile_id='${MKE}' limit 1" | tr -d ' \n')
chkraise "★ 管的人把別人（幹部）的去向改成 public 也被擋" "public_needs_self" "perform set_config('test.uid','${PAUL}',true); perform public.rc_save_outcome('${RCMKO}', '{\"visibility\":\"public\"}'::jsonb);"
chkas "${MKE}" "本人自己勾 public 可以" "public" "select public.rc_save_outcome('${RCMKO}', '{\"visibility\":\"public\"}'::jsonb); select visibility from public.rc_outcomes where id='${RCMKO}'"
chkas "${PAUL}" "管的人替學員填 internal 照樣可以" "internal" "select public.rc_save_outcome(null, '{\"person_id\":\"${RCDA}\",\"kind\":\"admitted\",\"institution\":\"UBC\",\"year\":2028}'::jsonb); select visibility from public.rc_outcomes where person_id='${RCDA}' order by recorded_at desc limit 1"
# 三屆前的具名答案轉匿名：補兩個舊屆別，把 RCF 那份留了 email 的答案改成 2020 年送出的。
psql -d "${DB}" -X -A -t -q -c "insert into public.terms (id, starts_on, ends_on, status) values ('2023-24','2023-08-01','2024-07-31','ended'), ('2024-25','2024-08-01','2025-07-31','ended') on conflict (id) do nothing; update public.rc_responses set submitted_at='2020-11-28T12:00:00+08:00' where form_id='${RCF}' and person_id is not null;" >/dev/null 2>&1
chkraise "★ Director 按不了轉匿名（not_president）" "not_president" "perform set_config('test.uid','${DIR}',true); perform public.rc_anonymise_old(false);"
chkas "${PAUL}" "★ 先算：1 份、還沒做、人還掛著" "1|false|1" "select (a->>'n')||'|'||(a->>'done')||'|'||(select count(*) from public.rc_responses where form_id='${RCF}' and person_id is not null) from (select public.rc_anonymise_old(false) a) t"
# ⚠ 函式與數的那幾句要分兩個 statement：同一句裡的子查詢用的是函式跑之前的快照，數出來永遠是舊的。
chkas "${PAUL}" "★ 真的做：回 1 份、done" "1|true" "select (a->>'n')||'|'||(a->>'done') from (select public.rc_anonymise_old(true) a) t"
chk "★ 做完：答案還在、人拆掉、有留紀錄" "0|2|1" "select (select count(*) from public.rc_responses where form_id='${RCF}' and person_id is not null)||'|'||(select count(*) from public.rc_responses where form_id='${RCF}')||'|'||(select count(*) from public.rc_log where what='responses_anonymise')"
chkas "${PAUL}" "再按一次：0 份、不做" "0|false" "select (a->>'n')||'|'||(a->>'done') from (select public.rc_anonymise_old(true) a) t"
# 學員刪帳號一併清紀錄：EVS1 是報過名的學員，rc_sync_event 之後名單上有他那一列。
RCEVP=$(psql -d "${DB}" -X -A -t -q -c "select id from public.people where profile_id='${EVS1}'" | tr -d ' \n')
chk "刪之前：EVS1 在名單上、有一筆出席" "1|1" "select (select count(*) from public.people where id='${RCEVP}' and forgotten_at is null)||'|'||(select count(*) from public.rc_participation where person_id='${RCEVP}')"
chkraise "幹部仍然不能自己刪帳號（cadre_must_ask）" "cadre_must_ask" "perform set_config('test.uid','${DIR}',true); perform public.delete_my_account();"
chkas "${EVS1}" "★ 學員刪帳號：名字清掉、出席刪掉、列留著、帳號拆開" "true|0|1|true" "select public.delete_my_account(); select (select name_zh is null and forgotten_at is not null from public.people where id='${RCEVP}')||'|'||(select count(*) from public.rc_participation where person_id='${RCEVP}')||'|'||(select count(*) from public.people where id='${RCEVP}')||'|'||(select profile_id is null from public.people where id='${RCEVP}')"
rp2=$(psql -d "${DB}" -X -A -t -q -f supabase/migrations/2026-12-02-records-privacy.sql 2>&1 || true)
if echo "${rp2}" | grep -q "OVERALL.*PASS"; then echo "  ok   隱私那支可以重跑"; pass=$((pass+1)); else echo "  FAIL 隱私那支重跑沒過"; fail=$((fail+1)); fi
BROKEN=$(mktemp)
sed "/raise exception 'public_needs_self'/d" supabase/migrations/2026-12-02-records-privacy.sql > "${BROKEN}"
bk=$(psql -d "${DB}" -X -A -t -q -f "${BROKEN}" 2>&1 || true)
if echo "${bk}" | grep -q "OVERALL.*FAIL"; then echo "  ok   ★ 破壞測試：拿掉「去向 public 只有本人」那道門，驗收表變紅"; pass=$((pass+1)); else echo "  FAIL 拿掉 public 那道門驗收表沒變紅"; fail=$((fail+1)); fi
rm -f "${BROKEN}"
psql -d "${DB}" -X -A -t -q -f supabase/migrations/2026-12-02-records-privacy.sql >/dev/null 2>&1 || true
chkraise "破壞測試之後裝回正確版本，那道門又在了" "public_needs_self" "perform set_config('test.uid','${PAUL}',true); perform public.rc_save_outcome(null, '{\"person_id\":\"${RCDA}\",\"kind\":\"admitted\",\"visibility\":\"public\"}'::jsonb);"
echo "── 名錄（2026-12-03-records-directory.sql）──"
rdgot=$(psql -d "${DB}" -X -A -t -q -v ON_ERROR_STOP=1 -f supabase/migrations/2026-12-03-records-directory.sql 2>&1 || true)
if echo "${rdgot}" | grep -q "OVERALL.*PASS" && ! echo "${rdgot}" | grep -q "|FAIL"; then echo "  ok   名錄那支驗收表全 PASS"; pass=$((pass+1)); else echo "  FAIL 名錄那支驗收表："; echo "${rdgot}" | head -12; fail=$((fail+1)); fi
RCALIVE=$(psql -d "${DB}" -X -A -t -q -c "select count(*) from public.people where forgotten_at is null" | tr -d ' \n')
chkas "${PAUL}" "★ 管的人拿到名錄：每一個還在的人一列、沒有 email 欄、有活動與屆別" "${RCALIVE}|false|true" "select jsonb_array_length(d)||'|'||(d::text like '%@example.com%')||'|'||(select bool_or(jsonb_array_length(e->'events') > 0 and jsonb_array_length(e->'terms') > 0) from jsonb_array_elements(d) e) from (select public.rc_directory() d) t"
chkas "${OTHER}" "Senior Adviser（看的人）也拿得到名錄" "${RCALIVE}" "select jsonb_array_length(public.rc_directory())"
chkas "${DIR}" "★ 只在某場活動工作區的人拿到空的（名錄是整個紀錄的，不是一場的）" "0" "select jsonb_array_length(public.rc_directory())"
chkas "${OUTC}" "★ 沒指派的幹部拿到空的" "0" "select jsonb_array_length(public.rc_directory())"
chkas "${PAUL}" "被移除的人不在名錄上" "0" "select count(*) from jsonb_array_elements(public.rc_directory()) e where e->>'id'='${RCEVP}'"
angot=$(psql -d "${DB}" -X -A -t -q -c "set role anon; select public.rc_directory();" 2>&1 || true)
if echo "${angot}" | grep -qi "permission denied"; then echo "  ok   anon 叫不到名錄"; pass=$((pass+1)); else echo "  FAIL anon 叫得到名錄：${angot}"; fail=$((fail+1)); fi
echo "── 出席預設到了（2026-12-04-records-attendance.sql）──"
ragot=$(psql -d "${DB}" -X -A -t -q -v ON_ERROR_STOP=1 -f supabase/migrations/2026-12-04-records-attendance.sql 2>&1 || true)
if echo "${ragot}" | grep -q "OVERALL.*PASS" && ! echo "${ragot}" | grep -q "|FAIL"; then echo "  ok   出席那支驗收表全 PASS"; pass=$((pass+1)); else echo "  FAIL 出席那支驗收表："; echo "${ragot}" | head -12; fail=$((fail+1)); fi
# RCEV（winter-camp-2027）是 2027 年的活動，還沒辦：registered 的要留著。另外建一場已經結束的來試。
RCOLD=$(psql -d "${DB}" -X -A -t -q -c "select set_config('test.uid','${PAUL}',false);" -c "select public.rc_add_past_event('{\"slug\":\"old-camp-2024\",\"kind\":\"bootcamp\",\"term_id\":\"2024-25\",\"title_en\":\"Old Camp 2024\",\"team\":\"Curriculum Team\",\"starts_at\":\"2024-07-06T01:00:00Z\",\"ends_at\":\"2024-07-07T09:00:00Z\"}'::jsonb)" 2>&1 | tail -1 | tr -d ' \n')
chkas "${PAUL}" "★ 手動加的人沒說狀態就是 attended" "attended" "select public.rc_set_participation('${RCOLD}', '{\"email\":\"old-a@example.com\",\"name_en\":\"Old A\"}'::jsonb); select x.status from public.rc_participation x join public.people pe on pe.id=x.person_id where x.event_id='${RCOLD}' and pe.name_en='Old A'"
psql -d "${DB}" -X -A -t -q -c "select set_config('test.uid','${PAUL}',false);" -c "select public.rc_set_participation('${RCOLD}', '{\"email\":\"old-b@example.com\",\"name_en\":\"Old B\",\"status\":\"registered\"}'::jsonb)" -c "select public.rc_set_participation('${RCOLD}', '{\"email\":\"old-c@example.com\",\"name_en\":\"Old C\",\"status\":\"no-show\"}'::jsonb)" -c "select public.rc_set_participation('${RCEV}', '{\"email\":\"new-d@example.com\",\"name_en\":\"New D\",\"status\":\"registered\"}'::jsonb)" >/dev/null 2>&1
chkraise "★ Director 按不了一次性改狀態（not_president）" "not_president" "perform set_config('test.uid','${DIR}',true); perform public.rc_attendance_default(false);"
chkas "${PAUL}" "★ 先數：已結束的那場 1 列會改，2027 那場不算" "1|1|OldCamp2024" "select (r->>'n')||'|'||jsonb_array_length(r->'rows')||'|'||(r#>>'{rows,0,title}') from (select public.rc_attendance_default(false) r) t"
chkas "${PAUL}" "★ 真的改：registered → attended，no-show 不動，2027 那場的 registered 留著" "1|true" "select (r->>'n')||'|'||(r->>'done') from (select public.rc_attendance_default(true) r) t"
chk "改完的樣子" "attended|no-show|registered" "select (select status from public.rc_participation x join public.people pe on pe.id=x.person_id where x.event_id='${RCOLD}' and pe.name_en='Old B')||'|'||(select status from public.rc_participation x join public.people pe on pe.id=x.person_id where x.event_id='${RCOLD}' and pe.name_en='Old C')||'|'||(select status from public.rc_participation x join public.people pe on pe.id=x.person_id where x.event_id='${RCEV}' and pe.name_en='New D')"
chkas "${PAUL}" "再按一次：0" "0|false" "select (r->>'n')||'|'||(r->>'done') from (select public.rc_attendance_default(true) r) t"
# 從報名表抄的那條規則（錄取的人活動結束後算 attended）：唯一的一份申請在上面「學員刪帳號」那一步跟著帳號消失了，
# 這裡只能驗函式裡有那條規則（驗收表第 2 列），行為在正式站第一次換屆後的 sync 會看到。
chk "★ rc_sync_event 裡有「錄取且活動已結束 → attended」那一條" "t" "select regexp_replace(prosrc, '--[^\n]*', '', 'g') like '%v_ended then ''attended''%' from pg_proc where proname='rc_sync_event' and pronamespace='public'::regnamespace"
echo "── 可能重複看得出該留哪邊（2026-12-05-records-dedupe.sql）──"
rdd=$(psql -d "${DB}" -X -A -t -q -v ON_ERROR_STOP=1 -f supabase/migrations/2026-12-05-records-dedupe.sql 2>&1 || true)
if echo "${rdd}" | grep -q "OVERALL.*PASS" && ! echo "${rdd}" | grep -q "|FAIL"; then echo "  ok   重複那支驗收表全 PASS"; pass=$((pass+1)); else echo "  FAIL 重複那支驗收表："; echo "${rdd}" | head -12; fail=$((fail+1)); fi
psql -d "${DB}" -X -A -t -q -c "select set_config('test.uid','${PAUL}',false);" -c "select public.rc_save_person(null, '{\"name_en\":\"Twin Person\",\"kind\":\"student\",\"school\":\"A High\"}'::jsonb)" -c "select public.rc_save_person(null, '{\"name_en\":\"Twin Person\",\"kind\":\"guest\",\"school\":\"B High\",\"grad_year\":2024}'::jsonb)" >/dev/null 2>&1
RCTA=$(psql -d "${DB}" -X -A -t -q -c "select id from public.people where name_en='Twin Person' and school='A High'" | tr -d ' \n')
RCTB=$(psql -d "${DB}" -X -A -t -q -c "select id from public.people where name_en='Twin Person' and school='B High'" | tr -d ' \n')
psql -d "${DB}" -X -A -t -q -c "select set_config('test.uid','${PAUL}',false);" -c "select public.rc_set_participation('${RCOLD}', '{\"person_id\":\"${RCTB}\",\"role\":\"speaker\"}'::jsonb)" >/dev/null 2>&1
# ⚠ 哪一邊是 a 哪一邊是 b 看 uuid 大小，隨機；所以只看「建議留的那一邊」是不是有活動的那一邊，不看左右。
chkas "${PAUL}" "★ 同名那一組帶兩邊的摘要與建議：建議留有一場活動（講者）的那邊、另一邊 0 場、不同學校、沒有 email 的值" "1|speaker|0|false|false" "select (k#>>'{n_events}')||'|'||(k#>>'{events,0,role}')||'|'||(o#>>'{n_events}')||'|'||(d->>'same_school')||'|'||(d::text like '%@example.com%') from (select d, case when d->>'suggest'='a' then d->'left' else d->'right' end k, case when d->>'suggest'='a' then d->'right' else d->'left' end o from jsonb_array_elements(public.rc_duplicates()) d where d->>'a_name'='Twin Person' limit 1) t"
chkraise "★ 沒指派的幹部記不了「不是同一個人」（not_records_manager）" "not_records_manager" "perform set_config('test.uid','${OUTC}',true); perform public.rc_mark_not_same('${RCTA}','${RCTB}');"
chkas "${PAUL}" "★ 記了「不是同一個人」之後那一組不再出現，兩列都還在" "0|2" "select public.rc_mark_not_same('${RCTA}','${RCTB}'); select (select count(*) from jsonb_array_elements(public.rc_duplicates()) d where d->>'a_name'='Twin Person')||'|'||(select count(*) from public.people where name_en='Twin Person' and forgotten_at is null)"
chk "★ 有帳號的幹部都在名單上（回填），OUTC 也有一列而且是 member" "0|1|member" "select (select count(*) from public.profiles p where p.role in ('cadre','alumni','intern') and not exists (select 1 from public.people pe where pe.profile_id=p.id))||'|'||(select count(*) from public.people where profile_id='${OUTC}')||'|'||(select kind from public.people where profile_id='${OUTC}')"
# 學員變幹部：stu-a@example.com 是上面某場活動的學員（名單上有一列、有 email）。同一個 email 開了幹部帳號，接上那一列、身分變 member，不另開。
RCSTUA=$(psql -d "${DB}" -X -A -t -q -c "select person_id from public.rc_identities where kind='email' and value='stu-a@example.com' limit 1" | tr -d ' \n')
RCN0=$(psql -d "${DB}" -X -A -t -q -c "select count(*) from public.people where forgotten_at is null" | tr -d ' \n')
psql -d "${DB}" -q -v ON_ERROR_STOP=1 -c "insert into auth.users (id,email) values ('99990000-0000-0000-0000-00000000000a','stu-a@example.com'); insert into public.profiles (id,name_zh,name_en,team,role,board_role) values ('99990000-0000-0000-0000-00000000000a','學員甲','Dup Student','Curriculum Team','cadre','member');" >/dev/null 2>&1
chk "★ 學員變幹部：同一個 email 開帳號就接上原本那一列、身分變 member、名單人數不變" "${RCSTUA}|member|${RCN0}" "select (select id::text from public.people where profile_id='99990000-0000-0000-0000-00000000000a')||'|'||(select kind from public.people where profile_id='99990000-0000-0000-0000-00000000000a')||'|'||(select count(*) from public.people where forgotten_at is null)"
angot=$(psql -d "${DB}" -X -A -t -q -c "set role authenticated; select count(*) from public.rc_not_same;" 2>&1 || true)
if echo "${angot}" | grep -qi "permission denied"; then echo "  ok   登入的人直接讀不到 rc_not_same 表"; pass=$((pass+1)); else echo "  FAIL 登入的人讀得到 rc_not_same：${angot}"; fail=$((fail+1)); fi
echo "── 同名一群一張卡（2026-12-06-records-dedupe-groups.sql）──"
rdg=$(psql -d "${DB}" -X -A -t -q -v ON_ERROR_STOP=1 -f supabase/migrations/2026-12-06-records-dedupe-groups.sql 2>&1 || true)
if echo "${rdg}" | grep -q "OVERALL.*PASS" && ! echo "${rdg}" | grep -q "|FAIL"; then echo "  ok   同名一群那支驗收表全 PASS"; pass=$((pass+1)); else echo "  FAIL 同名一群那支驗收表："; echo "${rdg}" | head -12; fail=$((fail+1)); fi
# Twin Person：A 與 B 上面說過不是同一個人。再加一個 C（同名、有 email、有一場活動）：三個都跟某個其他人沒說過不是，所以一群三欄；建議留 C（有活動）；not_same 帶 [A,B]。
psql -d "${DB}" -X -A -t -q -c "select set_config('test.uid','${PAUL}',false);" -c "select public.rc_set_participation('${RCOLD}', '{\"email\":\"twin-c@example.com\",\"name_en\":\"Twin  Person\",\"role\":\"student\"}'::jsonb)" >/dev/null 2>&1
chkas "${PAUL}" "★ 三個同名一群三欄、建議留資料最多那欄（B：有活動、學校、畢業年）、帶說過不是的那一對、email 的值在欄裡" "3|BHigh|1|true|1" "select jsonb_array_length(g->'members')||'|'||coalesce((select m->>'school' from jsonb_array_elements(g->'members') m where m->>'id'=(g->>'suggest')),'-')||'|'||jsonb_array_length(g->'not_same')||'|'||coalesce((g->'not_same'->0)::text like '%${RCTA}%', false)||'|'||(select count(*) from jsonb_array_elements(g->'members') m where m->'emails' ? 'twin-c@example.com') from jsonb_array_elements(public.rc_duplicates()) g where g->>'name' like 'Twin%'"
chkas "${PAUL}" "說過不是的那兩個如果只剩彼此就不印：Twin A 跟 C 也說不是之後，群只剩 B 與 C" "2" "select public.rc_mark_not_same('${RCTA}', (select person_id from public.rc_identities where value='twin-c@example.com')); select jsonb_array_length(g->'members') from jsonb_array_elements(public.rc_duplicates()) g where g->>'name' like 'Twin%'"
chkas "${OUTC}" "沒指派的幹部拿到空的" "0" "select jsonb_array_length(public.rc_duplicates())"
echo "── 我帶的 mentee、我的 mentor（2026-12-07-records-my-pairs.sql）──"
rmp=$(psql -d "${DB}" -X -A -t -q -v ON_ERROR_STOP=1 -f supabase/migrations/2026-12-07-records-my-pairs.sql 2>&1 || true)
if echo "${rmp}" | grep -q "OVERALL.*PASS" && ! echo "${rmp}" | grep -q "|FAIL"; then echo "  ok   我的配對那支驗收表全 PASS"; pass=$((pass+1)); else echo "  FAIL 我的配對那支驗收表："; echo "${rmp}" | head -12; fail=$((fail+1)); fi
chkas "${MKE}" "★ mentor 看得到自己那一組（as mentor、那個學期、那份開著的 mentor check-in 的 token），看不到 email" "1|mentor|Fall2026Mentorship|false" "select jsonb_array_length(x)||'|'||(x->0->>'as')||'|'||(x->0->>'event')||'|'||(x::text like '%@example.com%') from (select public.rc_my_pairs() x) t"
chkas "${OUTC}" "沒配對的幹部拿到空的" "0" "select jsonb_array_length(public.rc_my_pairs())"
angot=$(psql -d "${DB}" -X -A -t -q -c "set role anon; select public.rc_my_pairs();" 2>&1 || true)
if echo "${angot}" | grep -qi "permission denied"; then echo "  ok   anon 叫不到我的配對"; pass=$((pass+1)); else echo "  FAIL anon 叫得到我的配對：${angot}"; fail=$((fail+1)); fi
echo "── 合併時備註接在一起、可能重複的 email 三個來源都看（2026-12-08-records-merge-notes.sql）──"
rmn=$(psql -d "${DB}" -X -A -t -q -v ON_ERROR_STOP=1 -f supabase/migrations/2026-12-08-records-merge-notes.sql 2>&1 || true)
if echo "${rmn}" | grep -q "OVERALL.*PASS" && ! echo "${rmn}" | grep -q "|FAIL"; then echo "  ok   合併留備註那支驗收表全 PASS"; pass=$((pass+1)); else echo "  FAIL 合併留備註那支驗收表："; echo "${rmn}" | head -12; fail=$((fail+1)); fi
# 四個同英文名的人：甲乙有 identities 的 email 與不同備註；丙只有 people.email（沒有 identities 那一列）；丁跟甲備註一模一樣
psql -d "${DB}" -X -A -t -q -c "select set_config('test.uid','${PAUL}',false);" -c "select public.rc_save_person(null, '{\"name_zh\":\"備註甲\",\"name_en\":\"Note Twin\",\"email\":\"note-a@example.com\",\"kind\":\"student\"}'::jsonb)" -c "select public.rc_save_person(null, '{\"name_zh\":\"備註乙\",\"name_en\":\"Note Twin\",\"email\":\"note-b@example.com\",\"kind\":\"student\"}'::jsonb)" >/dev/null 2>&1
psql -d "${DB}" -X -A -t -q -c "insert into public.people (name_zh, name_en, kind, email) values ('備註丙', 'Note Twin', 'student', 'Note-C@example.com'), ('備註丁', 'Note Twin', 'student', null);" -c "update public.people set note = case name_zh when '備註甲' then 'first note' when '備註乙' then 'second note' when '備註丁' then ' first note ' end where name_en = 'Note Twin';" >/dev/null 2>&1
RCNA=$(psql -d "${DB}" -X -A -t -q -c "select id from public.people where name_en='Note Twin' and name_zh='備註甲'" | tr -d ' \n')
RCNB=$(psql -d "${DB}" -X -A -t -q -c "select id from public.people where name_en='Note Twin' and name_zh='備註乙'" | tr -d ' \n')
RCNC=$(psql -d "${DB}" -X -A -t -q -c "select id from public.people where name_en='Note Twin' and name_zh='備註丙'" | tr -d ' \n')
RCND=$(psql -d "${DB}" -X -A -t -q -c "select id from public.people where name_en='Note Twin' and name_zh='備註丁'" | tr -d ' \n')
chkas "${PAUL}" "★ 可能重複那張卡四欄：email 欄 identities 的看得到，只在 people.email 的（丙）也看得到而且小寫，沒 email 的（丁）是空的；中文名照字碼排是丁丙乙甲" "4|-|note-c@example.com|note-b@example.com|note-a@example.com" "select jsonb_array_length(g->'members')||'|'||(select string_agg(coalesce(m->'emails'->>0,'-'), '|' order by m->>'name_zh') from jsonb_array_elements(g->'members') m) from jsonb_array_elements(public.rc_duplicates()) g where g->>'name'='Note Twin'"
chkas "${PAUL}" "★ 乙併進甲：兩邊備註接在一起、乙的 email 搬過來、乙那一列沒了" "firstnote/secondnote|2|0" "select public.rc_merge_people('${RCNA}','${RCNB}'); select (select note from public.people where id='${RCNA}')||'|'||(select count(*) from public.rc_identities where person_id='${RCNA}' and kind='email')||'|'||(select count(*) from public.people where id='${RCNB}')"
chkas "${PAUL}" "丁併進丙（丙沒備註）：直接拿丁的，前後空白去掉" "firstnote" "select public.rc_merge_people('${RCNC}','${RCND}'); select note from public.people where id='${RCNC}'"
chkas "${PAUL}" "丙再併進甲：丙的備註跟甲開頭那句一樣但整句不同，所以接上；一模一樣才只留一份（下一條）" "firstnote/secondnote/firstnote" "select public.rc_merge_people('${RCNA}','${RCNC}'); select note from public.people where id='${RCNA}'"
psql -d "${DB}" -X -A -t -q -c "insert into public.people (name_zh, name_en, kind, note) values ('備註戊', 'Note Twin', 'student', 'first note / second note / first note');" >/dev/null 2>&1
RCNE=$(psql -d "${DB}" -X -A -t -q -c "select id from public.people where name_en='Note Twin' and name_zh='備註戊'" | tr -d ' \n')
chkas "${PAUL}" "★ 戊的備註跟甲一模一樣：併進來只留一份、不重複接" "firstnote/secondnote/firstnote" "select public.rc_merge_people('${RCNA}','${RCNE}'); select note from public.people where id='${RCNA}'"
echo "── 可能重複自己先判斷像不像同一個人（2026-12-09-records-dedupe-verdict.sql）──"
rdv=$(psql -d "${DB}" -X -A -t -q -v ON_ERROR_STOP=1 -f supabase/migrations/2026-12-09-records-dedupe-verdict.sql 2>&1 || true)
if echo "${rdv}" | grep -q "OVERALL.*PASS" && ! echo "${rdv}" | grep -q "|FAIL"; then echo "  ok   判斷那支驗收表全 PASS"; pass=$((pass+1)); else echo "  FAIL 判斷那支驗收表："; echo "${rdv}" | head -12; fail=$((fail+1)); fi
# 四個同英文名：甲乙中文名一樣、email 不同；丙中文名不同、email 不同、學校不同；丁什麼都沒有
psql -d "${DB}" -X -A -t -q -c "insert into public.people (name_zh, name_en, kind, email, school) values ('判一', 'Verdict Twin', 'student', 'v-a@example.com', '北一女'), ('判一', 'Verdict Twin', 'student', 'v-b@example.com', null), ('判二', 'Verdict Twin', 'student', 'v-c@example.com', '中山女高'), (null, 'Verdict Twin', 'student', null, null);" -c "insert into public.rc_identities (person_id, kind, value, source) select id, 'email', email, 'admin' from public.people where name_en='Verdict Twin' and email is not null on conflict do nothing;" >/dev/null 2>&1
RCVA=$(psql -d "${DB}" -X -A -t -q -c "select id from public.people where name_en='Verdict Twin' and email='v-a@example.com'" | tr -d ' \n')
RCVB=$(psql -d "${DB}" -X -A -t -q -c "select id from public.people where name_en='Verdict Twin' and email='v-b@example.com'" | tr -d ' \n')
RCVC=$(psql -d "${DB}" -X -A -t -q -c "select id from public.people where name_en='Verdict Twin' and email='v-c@example.com'" | tr -d ' \n')
RCVD=$(psql -d "${DB}" -X -A -t -q -c "select id from public.people where name_en='Verdict Twin' and email is null and name_zh is null" | tr -d ' \n')
chk "★ 甲乙：中文名一樣、email 不同 → 像同一個人（證據 zh_same、相反 email_disjoint）" "same|zh_same|email_disjoint" "select v->>'verdict'||'|'||(v->'same'->>0)||'|'||(v->'diff'->>0) from (select public.rc_dup_verdict('${RCVA}','${RCVB}') v) t"
chk "★ 甲丙：email 不同而且中文名不同 → 像兩個人" "different|3" "select v->>'verdict'||'|'||jsonb_array_length(v->'diff') from (select public.rc_dup_verdict('${RCVA}','${RCVC}') v) t"
chk "甲丁：丁什麼資料都沒有 → 不夠判斷" "unsure|0|0" "select v->>'verdict'||'|'||jsonb_array_length(v->'same')||'|'||jsonb_array_length(v->'diff') from (select public.rc_dup_verdict('${RCVA}','${RCVD}') v) t"
chkas "${PAUL}" "★ 卡上只剩甲乙丁（丙跟誰都像兩個人，拿掉）、建議留甲（有學校）、乙 same、丁 unsure；set_aside 兩對都是丙" "3|-,判一,判一|unsure,same|2|2" "select jsonb_array_length(g->'members')||'|'||(select string_agg(coalesce(m->>'name_zh','-'), ',' order by (coalesce(m->>'name_zh','')='')::int desc) from jsonb_array_elements(g->'members') m)||'|'||(select string_agg(m->'vs_keep'->>'verdict', ',' order by (coalesce(m->>'name_zh','')='')::int desc) from jsonb_array_elements(g->'members') m where m->>'id'<>(g->>'suggest'))||'|'||jsonb_array_length(g->'set_aside')||'|'||(select count(*) from jsonb_array_elements(g->'set_aside') s where s->>'a'='${RCVC}' or s->>'b'='${RCVC}') from jsonb_array_elements(public.rc_duplicates()) g where g->>'name'='Verdict Twin'"
chkas "${PAUL}" "建議留的是甲" "t" "select (g->>'suggest')='${RCVA}' from jsonb_array_elements(public.rc_duplicates()) g where g->>'name'='Verdict Twin'"
psql -d "${DB}" -X -A -t -q -c "insert into public.rc_participation (person_id, event_id, role, status, source) values ('${RCVA}', '${RCMT}', 'mentee', 'attended', 'import'), ('${RCVD}', '${RCMT}', 'mentee', 'attended', 'import');" >/dev/null 2>&1
chk "★ 甲丁都在同一場活動同一身分的名單上 → 像同一個人（roster_twice）" "same|roster_twice" "select v->>'verdict'||'|'||(v->'same'->>0) from (select public.rc_dup_verdict('${RCVA}','${RCVD}') v) t"
chkas "${PAUL}" "說過丙跟甲不是同一個人之後，set_aside 只剩丙乙那一對" "1" "select public.rc_mark_not_same('${RCVA}','${RCVC}'); select jsonb_array_length(g->'set_aside') from jsonb_array_elements(public.rc_duplicates()) g where g->>'name'='Verdict Twin'"
chkas "${PAUL}" "★ 從 set_aside 直接併：丙併進乙，卡上剩甲乙丁、set_aside 空" "3|0|0" "select public.rc_merge_people('${RCVB}','${RCVC}'); select jsonb_array_length(g->'members')||'|'||jsonb_array_length(g->'set_aside')||'|'||(select count(*) from public.people where id='${RCVC}') from jsonb_array_elements(public.rc_duplicates()) g where g->>'name'='Verdict Twin'"
chkas "${OUTC}" "沒指派的幹部拿到空的" "0" "select jsonb_array_length(public.rc_duplicates())"
echo "── 讀過的學校有紀錄（2026-12-10-records-school-history.sql）──"
rsh=$(psql -d "${DB}" -X -A -t -q -v ON_ERROR_STOP=1 -f supabase/migrations/2026-12-10-records-school-history.sql 2>&1 || true)
if echo "${rsh}" | grep -q "OVERALL.*PASS" && ! echo "${rsh}" | grep -q "|FAIL"; then echo "  ok   學校紀錄那支驗收表全 PASS"; pass=$((pass+1)); else echo "  FAIL 學校紀錄那支驗收表："; echo "${rsh}" | head -14; fail=$((fail+1)); fi
chk "★ 既有的人：有學校的每人一列（backfill），沒學校的沒有" "0|0" "select (select count(*) from public.people pe where nullif(trim(coalesce(pe.school,'')),'') is not null and pe.forgotten_at is null and not exists (select 1 from public.rc_schools s where s.person_id=pe.id))||'|'||(select count(*) from public.rc_schools s join public.people pe on pe.id=s.person_id where pe.school is null and s.source='backfill')"
psql -d "${DB}" -X -A -t -q -c "insert into public.people (name_zh, name_en, kind, email, school) values ('校一', 'School Twin', 'student', 's-a@example.com', '北一女'), ('校一', 'S. Twin', 'student', 's-b@example.com', 'UWC Costa Rica');" -c "insert into public.rc_identities (person_id, kind, value, source) select id, 'email', email, 'admin' from public.people where name_zh='校一' on conflict do nothing;" >/dev/null 2>&1
RCSA=$(psql -d "${DB}" -X -A -t -q -c "select id from public.people where name_zh='校一' and email='s-a@example.com'" | tr -d ' \n')
RCSB=$(psql -d "${DB}" -X -A -t -q -c "select id from public.people where name_zh='校一' and email='s-b@example.com'" | tr -d ' \n')
chk "★ 新建的人一有學校 trigger 就補一列（auto）" "1|北一女|auto" "select count(*)||'|'||min(school)||'|'||min(source) from public.rc_schools where person_id='${RCSA}'"
chkraise "★ 沒指派的幹部加不了學校（not_records_manager）" "not_records_manager" "perform set_config('test.uid','${OUTC}',true); perform public.rc_save_school(null, '{\"person_id\":\"${RCSA}\",\"school\":\"建中\"}'::jsonb);"
chkraise "年份倒過來擋掉（years_backwards）" "years_backwards" "perform set_config('test.uid','${PAUL}',true); perform public.rc_save_school(null, '{\"person_id\":\"${RCSA}\",\"school\":\"建中\",\"year_from\":\"2021\",\"year_to\":\"2019\"}'::jsonb);"
chkas "${PAUL}" "★ 管的人加一所以前的學校（不設成現在的）：兩列、現在的還是北一女" "2|北一女|2018|2020" "select public.rc_save_school(null, '{\"person_id\":\"${RCSA}\",\"school\":\"建中\",\"year_from\":\"2018\",\"year_to\":\"2020\"}'::jsonb); select (select count(*) from public.rc_schools where person_id='${RCSA}')||'|'||(select school from public.people where id='${RCSA}')||'|'||(select year_from||'|'||year_to from public.rc_schools where person_id='${RCSA}' and school='建中')"
chkas "${PAUL}" "同一所再加一次只更新年份，不多一列" "2|2019" "select public.rc_save_school(null, '{\"person_id\":\"${RCSA}\",\"school\":\"建中\",\"year_from\":\"2019\"}'::jsonb); select (select count(*) from public.rc_schools where person_id='${RCSA}')||'|'||(select year_from from public.rc_schools where person_id='${RCSA}' and school='建中')"
chkas "${PAUL}" "★ 乙併進甲：乙的學校 UWC 進甲的紀錄（來源 merge）、乙的英文名變別名、甲現在的學校不變" "3|merge|S.Twin|北一女" "select public.rc_merge_people('${RCSA}','${RCSB}'); select (select count(*) from public.rc_schools where person_id='${RCSA}')||'|'||(select source from public.rc_schools where person_id='${RCSA}' and school='UWC Costa Rica')||'|'||(select string_agg(value, ',') from public.rc_identities where person_id='${RCSA}' and kind='name_en')||'|'||(select school from public.people where id='${RCSA}')"
RCS_UWC=$(psql -d "${DB}" -X -A -t -q -c "select id from public.rc_schools where person_id='${RCSA}' and school='UWC Costa Rica'" | tr -d ' \n')
RCS_CK=$(psql -d "${DB}" -X -A -t -q -c "select id from public.rc_schools where person_id='${RCSA}' and school='建中'" | tr -d ' \n')
chkas "${PAUL}" "★ 把 UWC 設成現在的：people.school 換、頁面上那一列標 current、還是三列（trigger 不重複加）" "UWCCostaRica|UWCCostaRica|3" "select public.rc_set_current_school('${RCS_UWC}'); select (select school from public.people where id='${RCSA}')||'|'||(select s->>'school' from jsonb_array_elements(public.rc_person('${RCSA}')->'schools') s where (s->>'current')::boolean)||'|'||jsonb_array_length(public.rc_person('${RCSA}')->'schools')"
chkas "${PAUL}" "一個人的頁面帶別名；名錄那一列帶 schools 三所與 aliases" "S.Twin|3|1" "select (public.rc_person('${RCSA}')->'aliases'->>0)||'|'||jsonb_array_length(d->'schools')||'|'||jsonb_array_length(d->'aliases') from jsonb_array_elements(public.rc_directory()) d where d->>'id'='${RCSA}'"
chkas "${OTHER}" "Senior Adviser 看得到學校紀錄與別名（不是聯絡方式），identities 還是空的" "3|1|0" "select jsonb_array_length(x->'schools')||'|'||jsonb_array_length(x->'aliases')||'|'||jsonb_array_length(x->'identities') from (select public.rc_person('${RCSA}') x) t"
chkas "${PAUL}" "刪掉建中那一列：剩兩列" "2" "select public.rc_delete_school('${RCS_CK}'); select count(*) from public.rc_schools where person_id='${RCSA}'"
chkas "${PAUL}" "★ 忘記一個人連學校紀錄一起清" "0|true" "select public.forget_person('${RCSA}'); select (select count(*) from public.rc_schools where person_id='${RCSA}')||'|'||(select school is null from public.people where id='${RCSA}')"
echo "── 合併撞到的兩件事：別名撞唯一索引、一個人兩個登入（2026-12-11-records-merge-accounts.sql）──"
rma=$(psql -d "${DB}" -X -A -t -q -v ON_ERROR_STOP=1 -f supabase/migrations/2026-12-11-records-merge-accounts.sql 2>&1 || true)
if echo "${rma}" | grep -q "OVERALL.*PASS" && ! echo "${rma}" | grep -q "|FAIL"; then echo "  ok   合併帳號那支驗收表全 PASS"; pass=$((pass+1)); else echo "  FAIL 合併帳號那支驗收表："; echo "${rma}" | head -12; fail=$((fail+1)); fi
# 同一個人三列：幹部帳號（A）、學員帳號（B，出席比較多）、2023 營隊沒帳號的一列（C，身上有 name_en 的 identity，跟 B 同名）
ACCA=77770000-0000-0000-0000-0000000000a1
ACCB=77770000-0000-0000-0000-0000000000b1
psql -d "${DB}" -X -A -t -q -c "insert into auth.users (id,email) values ('${ACCA}','two-a@example.com'), ('${ACCB}','two-b@example.com');" -c "insert into public.profiles (id,name_zh,name_en,team,role) values ('${ACCA}','雙帳','Two Login','Curriculum','cadre'), ('${ACCB}','雙帳','Two Login',null,'student');" -c "select public.rc_ensure_person('${ACCB}');" 2>&1 | grep -i "error" || true
RCAA=$(psql -d "${DB}" -X -A -t -q -c "select id from public.people where profile_id='${ACCA}'" | tr -d ' \n')
RCAB=$(psql -d "${DB}" -X -A -t -q -c "select id from public.people where profile_id='${ACCB}'" | tr -d ' \n')
psql -d "${DB}" -X -A -t -q -c "update public.people set name_en='Two Login' where id in ('${RCAA}','${RCAB}');" -c "insert into public.people (name_zh, name_en, kind, note) values ('雙帳', 'Two Login', 'student', '2023 bootcamp');" -c "insert into public.rc_identities (person_id, kind, value, source) values ('${RCAB}', 'name_en', 'Two Login', 'import') on conflict do nothing;" -c "insert into public.rc_participation (person_id, event_id, role, status, source) values ('${RCAB}', '${RCMT}', 'mentee', 'attended', 'import'), ('${RCAB}', '${RCMT}', 'student', 'attended', 'import');" -c "insert into public.positions (person_id, term_id, title_zh, title_en, team) values ('${RCAB}', '2026-27', '學員代表', 'Student Rep', 'Curriculum Team') on conflict do nothing;" 2>&1 | grep -i "error" || true
RCAC=$(psql -d "${DB}" -X -A -t -q -c "select id from public.people where name_en='Two Login' and profile_id is null" | tr -d ' \n')
chk "三列都在：A 幹部帳號、B 學員帳號（2 場）、C 沒帳號且 B 身上有同名的 name_en identity" "3|2|1" "select (select count(*) from public.people where name_en='Two Login')||'|'||(select count(*) from public.rc_participation where person_id='${RCAB}')||'|'||(select count(*) from public.rc_identities where kind='name_en' and lower(value)='two login')"
chkas "${PAUL}" "★ 建議留有幹部帳號的 A，就算學員帳號 B 出席比較多" "t" "select (g->>'suggest')='${RCAA}' from jsonb_array_elements(public.rc_duplicates()) g where g->>'name'='Two Login'"
chkraise "★ 兩邊都有帳號，一般合併先擋（both_have_accounts），不會先撞唯一索引" "both_have_accounts" "perform set_config('test.uid','${PAUL}',true); perform public.rc_merge_people('${RCAA}','${RCAB}');"
chkas "${PAUL}" "★ C（沒帳號、同名）併進 A：以前這裡撞 rc_identities_one，現在過，別名不重複寫" "1|2|1" "select public.rc_merge_people('${RCAA}','${RCAC}'); select (select count(*) from public.people where id='${RCAA}')||'|'||(select count(*) from public.people where name_en='Two Login')||'|'||(select count(*) from public.rc_identities where kind='name_en' and lower(value)='two login')"
chkraise "★ 沒指派的幹部併不了帳號（not_president）" "not_president" "perform set_config('test.uid','${OUTC}',true); perform public.rc_merge_accounts('${RCAA}','${RCAB}');"
chkraise "★ Director 也併不了帳號（not_president）" "not_president" "perform set_config('test.uid','${DIR}',true); perform public.rc_merge_accounts('${RCAA}','${RCAB}');"
PAULP=$(psql -d "${DB}" -X -A -t -q -c "select id from public.people where profile_id='${PAUL}'" | tr -d ' \n')
chkraise "★ 不能併掉自己正在用的帳號（cannot_remove_self）" "cannot_remove_self" "perform set_config('test.uid','${PAUL}',true); perform public.rc_merge_accounts('${RCAA}','${PAULP}');"
psql -d "${DB}" -X -A -t -q -c "update public.profiles set board_role='president' where id='${ACCB}';" 2>&1 | grep -i "error" || true
chkraise "★ 不能併掉 Co-President 的帳號（cannot_retire_president）" "cannot_retire_president" "perform set_config('test.uid','${PAUL}',true); perform public.rc_merge_accounts('${RCAA}','${RCAB}');"
psql -d "${DB}" -X -A -t -q -c "update public.profiles set board_role='member' where id='${ACCB}';" 2>&1 | grep -i "error" || true
chkraise "只有一邊有帳號不能走合併帳號（not_both_accounts）" "not_both_accounts" "perform set_config('test.uid','${PAUL}',true); perform public.rc_merge_accounts('${RCAA}', '${RCVA}');"
chkas "${PAUL}" "★ Co-President 把 B 併進 A：B 的列與登入都沒了、兩場出席與職位到 A、B 的 email 留在 A 身上、有紀錄" "1|0|0|2|1|two-b@example.com|1" "select public.rc_merge_accounts('${RCAA}','${RCAB}'); select (select count(*) from public.people where id='${RCAA}')||'|'||(select count(*) from public.people where id='${RCAB}')||'|'||(select count(*) from auth.users where id='${ACCB}')||'|'||(select count(*) from public.rc_participation where person_id='${RCAA}')||'|'||(select count(*) from public.positions where person_id='${RCAA}' and title_en='Student Rep')||'|'||(select value from public.rc_identities where person_id='${RCAA}' and kind='email' and value='two-b@example.com')||'|'||(select count(*) from public.rc_log where what='account_merge' and ref='${RCAA}')"
chkas "${PAUL}" "併完卡上這一組不見了" "0" "select count(*) from jsonb_array_elements(public.rc_duplicates()) g where g->>'name'='Two Login' and jsonb_array_length(g->'members')>=2"
echo "── 聯絡方式：LINE、LinkedIn 從備註搬出來（2026-12-12-records-contacts.sql）──"
psql -d "${DB}" -X -A -t -q -c "insert into public.people (name_zh, name_en, kind, note) values ('聯絡', 'Contact Note', 'student', 'BT: Mentor; LinkedIn: Line: smoke.line.01; HS dept: 國際部; IG: @smoke.ig; Phone: N/A; status: Student'), ('聯絡二', 'Contact Two', 'student', 'Line: smoke.line.01; since 2024');" 2>&1 | grep -i "error" || true
rct=$(psql -d "${DB}" -X -A -t -q -v ON_ERROR_STOP=1 -f supabase/migrations/2026-12-12-records-contacts.sql 2>&1 || true)
if echo "${rct}" | grep -q "OVERALL.*PASS" && ! echo "${rct}" | grep -q "|FAIL"; then echo "  ok   聯絡方式那支驗收表全 PASS"; pass=$((pass+1)); else echo "  FAIL 聯絡方式那支驗收表："; echo "${rct}" | head -14; fail=$((fail+1)); fi
RCN1=$(psql -d "${DB}" -X -A -t -q -c "select id from public.people where name_en='Contact Note'" | tr -d ' \n')
RCN2=$(psql -d "${DB}" -X -A -t -q -c "select id from public.people where name_en='Contact Two'" | tr -d ' \n')
chk "★ 備註裡的 LINE（藏在 LinkedIn: 後面）與 IG 搬出來，空的 Phone 拿掉，其他字留著" "BT:Mentor;HSdept:國際部;status:Student|line:smoke.line.01,ig:smoke.ig" "select coalesce(note,'')||'|'||(select string_agg(kind||':'||value, ',' order by kind desc) from public.rc_identities where person_id='${RCN1}' and source='note') from public.people where id='${RCN1}'"
chk "同一個 LINE 已經是別人的，那一段留在第二個人的備註裡（可能是同一個人）" "Line:smoke.line.01;since2024" "select note from public.people where id='${RCN2}'"
chk "原本的備註有備份" "t" "select note like '%LinkedIn: Line: smoke.line.01%' from public.rc_note_backup where person_id='${RCN1}'"
chk "再跑一次不會再搬" "0" "select (public.rc_notes_to_contacts(false)->>'moved')"
chkas "${PAUL}" "★ 管紀錄的人加一個 LinkedIn（網址尾巴的斜線拿掉）" "linkedin.com/in/smoke" "select public.rc_contact_add('${RCN1}', 'linkedin', ' linkedin.com/in/smoke/ '); select value from public.rc_identities where person_id='${RCN1}' and kind='linkedin'"
chkas "${PAUL}" "同一個人加同一個值不會出錯也不會多一列" "1" "select public.rc_contact_add('${RCN1}', 'linkedin', 'LINKEDIN.com/in/smoke'); select count(*) from public.rc_identities where person_id='${RCN1}' and kind='linkedin'"
chkraise "★ 別人已經有的 LINE 加不上去（contact_taken）" "contact_taken" "perform set_config('test.uid','${PAUL}',true); perform public.rc_contact_add('${RCN2}', 'line', 'smoke.line.01');"
chkraise "空值加不上去（need_value）" "need_value" "perform set_config('test.uid','${PAUL}',true); perform public.rc_contact_add('${RCN2}', 'phone', ' n/a ');"
chkraise "不像 email 的加不上去（bad_email）" "bad_email" "perform set_config('test.uid','${PAUL}',true); perform public.rc_contact_add('${RCN2}', 'email', 'not-an-email');"
chkraise "名字不能從這裡加（bad_contact_kind）" "bad_contact_kind" "perform set_config('test.uid','${PAUL}',true); perform public.rc_contact_add('${RCN2}', 'name_en', 'x');"
chkraise "★ 沒指派的幹部加不了（not_records_manager）" "not_records_manager" "perform set_config('test.uid','${OUTC}',true); perform public.rc_contact_add('${RCN2}', 'phone', '0912345678');"
LOGINID=$(psql -d "${DB}" -X -A -t -q -c "select id from public.rc_identities where person_id='${RCAA}' and kind='email' and lower(value)='two-a@example.com' union all select i.id from public.rc_identities i join public.people pe on pe.id=i.person_id join auth.users u on u.id=pe.profile_id where i.kind='email' and lower(i.value)=lower(u.email) limit 1" | head -1 | tr -d ' \n')
if [ -n "${LOGINID}" ]; then chkraise "★ 登入用的 email 刪不掉（login_email）" "login_email" "perform set_config('test.uid','${PAUL}',true); perform public.rc_contact_del(${LOGINID});"; fi
IGID=$(psql -d "${DB}" -X -A -t -q -c "select id from public.rc_identities where person_id='${RCN1}' and kind='ig'" | tr -d ' \n')
chkraise "★ 沒指派的幹部刪不了（not_records_manager）" "not_records_manager" "perform set_config('test.uid','${OUTC}',true); perform public.rc_contact_del(${IGID});"
chkas "${PAUL}" "管紀錄的人刪掉 IG，有紀錄" "0|1" "select public.rc_contact_del(${IGID}); select (select count(*) from public.rc_identities where id=${IGID})||'|'||(select count(*) from public.rc_log where what='contact_delete' and ref='${RCN1}')"
chkas "${PAUL}" "一個人的頁面帶聯絡方式的 id" "t" "select bool_and(i ? 'id') from jsonb_array_elements(public.rc_person('${RCN1}')->'identities') i"
chkas "${PAUL}" "★ forget_person 連備註備份與聯絡方式一起清" "0|0" "select public.forget_person('${RCN1}'); select (select count(*) from public.rc_note_backup where person_id='${RCN1}')||'|'||(select count(*) from public.rc_identities where person_id='${RCN1}')"
echo "── 去向是學校就進學校紀錄（2026-12-13-records-outcome-schools.sql）──"
ros=$(psql -d "${DB}" -X -A -t -q -v ON_ERROR_STOP=1 -f supabase/migrations/2026-12-13-records-outcome-schools.sql 2>&1 || true)
if echo "${ros}" | grep -q "OVERALL.*PASS" && ! echo "${ros}" | grep -q "|FAIL"; then echo "  ok   去向帶學校那支驗收表全 PASS"; pass=$((pass+1)); else echo "  FAIL 去向帶學校那支驗收表："; echo "${ros}" | head -10; fail=$((fail+1)); fi
psql -d "${DB}" -X -A -t -q -c "insert into public.people (name_zh, name_en, kind) values ('去向', 'Outcome School', 'student');" 2>&1 | grep -i "error" || true
ROS=$(psql -d "${DB}" -X -A -t -q -c "select id from public.people where name_en='Outcome School'" | tr -d ' \n')
chkas "${PAUL}" "★ 錄取（admitted）不進學校紀錄" "0" "select public.rc_save_outcome(null, jsonb_build_object('person_id','${ROS}','kind','admitted','institution','Smoke U','year','2026','visibility','internal')); select count(*) from public.rc_schools where person_id='${ROS}'"
chkas "${PAUL}" "★ 就讀中進學校紀錄，年份填「從」、來源 outcome、不改現在的學校" "SmokeU|2026||outcome|" "select public.rc_save_outcome(null, jsonb_build_object('person_id','${ROS}','kind','enrolled','institution','Smoke U','year','2026','visibility','internal')); select s.school||'|'||coalesce(s.year_from::text,'')||'|'||coalesce(s.year_to::text,'')||'|'||s.source||'|'||coalesce(pe.school,'') from public.rc_schools s join public.people pe on pe.id=s.person_id where s.person_id='${ROS}'"
chkas "${PAUL}" "畢業那一筆補上「到」，不多一列（大小寫不同也算同一所）" "1|2026|2030" "select public.rc_save_outcome(null, jsonb_build_object('person_id','${ROS}','kind','graduated','institution','smoke u','year','2030','visibility','internal')); select count(*)||'|'||max(year_from)||'|'||max(year_to) from public.rc_schools where person_id='${ROS}'"
chkas "${PAUL}" "工作中不進學校紀錄" "1" "select public.rc_save_outcome(null, jsonb_build_object('person_id','${ROS}','kind','working','institution','Smoke Corp','year','2031','visibility','internal')); select count(*) from public.rc_schools where person_id='${ROS}'"
echo "── 場地與聯絡人（2026-12-14-venues.sql）──"
vng=$(psql -d "${DB}" -X -A -t -q -v ON_ERROR_STOP=1 -f supabase/migrations/2026-12-14-venues.sql 2>&1 || true)
if echo "${vng}" | grep -q "OVERALL.*PASS" && ! echo "${vng}" | grep -q "|FAIL"; then echo "  ok   場地那支驗收表全 PASS"; pass=$((pass+1)); else echo "  FAIL 場地那支驗收表："; echo "${vng}" | head -12; fail=$((fail+1)); fi
angot=$(psql -d "${DB}" -X -A -t -q -c "set role anon; select count(*) from public.venues;" 2>&1 || true)
if echo "${angot}" | grep -qi "permission denied"; then echo "  ok   ★ 沒登入的人碰不到場地表"; pass=$((pass+1)); else echo "  FAIL 沒登入的人讀得到場地表：${angot}"; fail=$((fail+1)); fi
chkraise "★ 學員看不到場地（not_cadre）" "not_cadre" "perform set_config('test.uid','${STU}',true); perform public.venues_list();"
chkraise "★ 沒指派的幹部加不了場地（not_venue_editor）" "not_venue_editor" "perform set_config('test.uid','${OUTC}',true); perform public.venue_save(null, '{\"name\":\"Smoke Hall\",\"city\":\"Taipei\"}'::jsonb);"
VN=$(psql -d "${DB}" -X -A -t -q -c "select set_config('test.uid','${PAUL}',false);" -c "select public.venue_save(null, '{\"name\":\"Smoke Hall\",\"kind\":\"university\",\"city\":\"Taipei\",\"capacity\":\"120\"}'::jsonb)" 2>&1 | tail -1 | tr -d ' \n')
case "${VN}" in ????????-*) echo "  ok   Co-President 加了一個場地"; pass=$((pass+1));; *) echo "  FAIL 加場地失敗：${VN}"; fail=$((fail+1));; esac
chkraise "同名同城市加不了第二個（大小寫不同也算，venue_exists）" "venue_exists" "perform set_config('test.uid','${PAUL}',true); perform public.venue_save(null, '{\"name\":\"smoke hall\",\"city\":\"TAIPEI\"}'::jsonb);"
chkraise "容納人數不是數字（bad_capacity）" "bad_capacity" "perform set_config('test.uid','${PAUL}',true); perform public.venue_save('${VN}', '{\"capacity\":\"lots\"}'::jsonb);"
chkraise "名字清空不行（need_venue_name）" "need_venue_name" "perform set_config('test.uid','${PAUL}',true); perform public.venue_save('${VN}', '{\"name\":\"  \"}'::jsonb);"
chkraise "聯絡人什麼都沒填（need_contact）" "need_contact" "perform set_config('test.uid','${PAUL}',true); perform public.venue_contact_save(null, jsonb_build_object('venue_id','${VN}','role','x'));"
chkraise "聯絡人 email 不像 email（bad_email）" "bad_email" "perform set_config('test.uid','${PAUL}',true); perform public.venue_contact_save(null, jsonb_build_object('venue_id','${VN}','email','nope'));"
chkas "${PAUL}" "★ 加一位聯絡人，email 轉小寫" "1|lin@example.com" "select public.venue_contact_save(null, jsonb_build_object('venue_id','${VN}','name','Ms. Lin','email','Lin@Example.com','phone','02 1234')); select count(*)||'|'||max(email) from public.venue_contacts where venue_id='${VN}'"
chkas "${OUTC}" "★ 一般幹部看得到場地與聯絡人，但不能改" "false|1" "select (public.venue_get('${VN}')->>'can_edit')||'|'||jsonb_array_length(public.venue_get('${VN}')->'contacts')"
psql -d "${DB}" -X -A -t -q -c "update public.events set place='', venue_id=null where id='${EV}';" 2>&1 | grep -i "error" || true
chkraise "★ 沒指派的幹部不能把活動接到場地（not_event_venue_editor）" "not_event_venue_editor" "perform set_config('test.uid','${OUTC}',true); perform public.set_event_venue('${EV}', '${VN}');"
chkas "${DIR}" "★ 活動的負責人可以接場地，地點是空的就填場地名" "true|SmokeHall" "select public.set_event_venue('${EV}', '${VN}'); select (venue_id='${VN}')::text||'|'||place from public.events where id='${EV}'"
chkas "${OUTC}" "場地頁看得到在這裡辦過的活動，列表有場次數" "1|1" "select jsonb_array_length(public.venue_get('${VN}')->'events')||'|'||(select v->>'n_events' from jsonb_array_elements(public.venues_list()->'venues') v where v->>'id'='${VN}')"
chkraise "沒指派的幹部刪不了場地（not_venue_editor）" "not_venue_editor" "perform set_config('test.uid','${OUTC}',true); perform public.venue_delete('${VN}');"
chkas "${PAUL}" "★ 刪場地：聯絡人一起刪、活動留著只是沒有場地、地點的字不動" "0|1|SmokeHall" "select public.venue_delete('${VN}'); select (select count(*) from public.venue_contacts where venue_id='${VN}')||'|'||(select count(*) from public.events where id='${EV}' and venue_id is null)||'|'||(select place from public.events where id='${EV}')"
echo "── 活動的人審自己那場的報名（2026-12-15-event-signups.sql）──"
esg=$(psql -d "${DB}" -X -A -t -q -v ON_ERROR_STOP=1 -f supabase/migrations/2026-12-15-event-signups.sql 2>&1 || true)
if echo "${esg}" | grep -q "OVERALL.*PASS" && ! echo "${esg}" | grep -q "|FAIL"; then echo "  ok   活動報名那支驗收表全 PASS"; pass=$((pass+1)); else echo "  FAIL 活動報名那支驗收表："; echo "${esg}" | head -10; fail=$((fail+1)); fi
# EVX：一般幹部，沒有申請工作區，什麼都沒被派。等一下被加進一場活動。
EVX=88880000-0000-0000-0000-0000000000e1
STX=88880000-0000-0000-0000-0000000000e2
psql -d "${DB}" -q -v ON_ERROR_STOP=1 <<SQL
insert into auth.users (id,email) values ('${EVX}','evx@example.com'), ('${STX}','stx@example.com');
insert into public.profiles (id,name_zh,name_en,team,role,board_role) values ('${EVX}','活動員','Eve Event','Mentorship Team','cadre','member');
insert into public.profiles (id,name_zh,role) values ('${STX}','報名學員','student');
SQL
NEV=$(psql -d "${DB}" -X -A -t -q -c "select set_config('test.uid','${PAUL}',false);" -c "select public.create_event('Curriculum Team','smoke-signups','報名測試','Smoke Signups',true)" | tail -1 | tr -d ' \n')
NEVF=$(psql -d "${DB}" -X -A -t -q -c "select form_id from public.events where id='${NEV}'" | tr -d ' \n')
psql -d "${DB}" -X -A -t -q -c "update public.forms set status='open' where id='${NEVF}';" -c "insert into public.applications (form_id, user_id, applicant_name, applicant_email) values ('${NEVF}','${STX}','報名學員','stx@example.com');" 2>&1 | grep -i "error" || true
NAPP=$(psql -d "${DB}" -X -A -t -q -c "select id from public.applications where form_id='${NEVF}'" | tr -d ' \n')
chkrole anon "" "★ 活動還是草稿，報名表就算開著也不對外" "0" "select count(*) from public.forms where id='${NEVF}'"
chkraise "★ 活動還是草稿，送不出申請（form_closed）" "form_closed" "perform set_config('test.uid','${STX}',true); perform public.submit_application('${NEVF}', '[]'::jsonb, null);"
chkrole authenticated "${EVX}" "沒被加進活動的幹部看不到這張報名表與申請" "0|0" "select (select count(*) from public.forms where id='${NEVF}')||'|'||(select count(*) from public.applications where form_id='${NEVF}')"
chkraise "沒被加進活動的幹部不能簽到（not_director_of）" "not_director_of" "perform set_config('test.uid','${EVX}',true); perform public.set_check_in(array['${NAPP}']::uuid[], true);"
psql -d "${DB}" -X -A -t -q -c "insert into public.assignments (user_id, workspace_id, level) values ('${EVX}','custom:event-smoke-signups','view');" 2>&1 | grep -i "error" || true
chkrole authenticated "${EVX}" "★ 這場「看」：看得到報名表與申請" "1|1" "select (select count(*) from public.forms where id='${NEVF}')||'|'||(select count(*) from public.applications where form_id='${NEVF}')"
chkraise "★ 這場「看」：不能簽到、不能審" "not_director_of" "perform set_config('test.uid','${EVX}',true); perform public.decide_applications(array['${NAPP}']::uuid[], 'accepted');"
psql -d "${DB}" -X -A -t -q -c "update public.assignments set level='edit' where user_id='${EVX}' and workspace_id='custom:event-smoke-signups';" 2>&1 | grep -i "error" || true
chkas "${EVX}" "★ 這場「改」：簽得了到" "1|true" "select public.set_check_in(array['${NAPP}']::uuid[], true); select '1|'||(checked_in_at is not null)::text from public.applications where id='${NAPP}'"
chkrole authenticated "${EVX}" "★ 這場「改」：改得動報名表的題目設定（RLS）" "1" "with u as (update public.forms set intro='smoke' where id='${NEVF}' returning 1) select count(*) from u"
chkrole authenticated "${EVX}" "★ 別場與別的計畫申請照舊看不到（只到自己那場）" "0" "select count(*) from public.applications where form_id<>'${NEVF}'"
OTHERAPP=$(psql -d "${DB}" -X -A -t -q -c "select id from public.applications where form_id<>'${NEVF}' limit 1" | tr -d ' \n')
if [ -n "${OTHERAPP}" ]; then chkraise "★ 一次傳兩筆、夾一筆別場的，整批擋下" "not_director_of" "perform set_config('test.uid','${EVX}',true); perform public.set_check_in(array['${NAPP}','${OTHERAPP}']::uuid[], true);"; fi
psql -d "${DB}" -X -A -t -q -c "update public.events set status='published' where id='${NEV}';" 2>&1 | grep -i "error" || true
chkrole anon "" "活動上架之後，開著的報名表就對外" "1" "select count(*) from public.forms where id='${NEVF}'"
NEV2=$(psql -d "${DB}" -X -A -t -q -c "select set_config('test.uid','${PAUL}',false);" -c "select public.create_event('Curriculum Team','smoke-noform','沒報名表','No Form',false)" | tail -1 | tr -d ' \n')
chkraise "沒被加進那場的幹部補不了報名表（not_event_editor）" "not_event_editor" "perform set_config('test.uid','${EVX}',true); perform public.attach_event_form('${NEV2}');"
chkas "${PAUL}" "★ 補一張報名表：草稿、team 跟活動一樣、活動掛上它；再按一次不會多一張" "draft|CurriculumTeam|true|1" "select public.attach_event_form('${NEV2}'); select public.attach_event_form('${NEV2}'); select f.status||'|'||f.team||'|'||(e.form_id=f.id)::text||'|'||(select count(*) from public.forms where title='沒報名表') from public.events e join public.forms f on f.id=e.form_id where e.id='${NEV2}'"
echo "── 錢與需求單掛在活動上（2026-12-16-event-links.sql）──"
elk=$(psql -d "${DB}" -X -A -t -q -v ON_ERROR_STOP=1 -f supabase/migrations/2026-12-16-event-links.sql 2>&1 || true)
if echo "${elk}" | grep -q "OVERALL.*PASS" && ! echo "${elk}" | grep -q "|FAIL"; then echo "  ok   活動連結那支驗收表全 PASS"; pass=$((pass+1)); else echo "  FAIL 活動連結那支驗收表："; echo "${elk}" | head -10; fail=$((fail+1)); fi
chkas "${SD}" "★ 記一筆支出掛在活動上" "true" "select public.fin_add_transaction(jsonb_build_object('happened_on','2027-09-20','kind','expense','amount',500,'currency','TWD','account_id','${FA1}','category_id','${CE}','counterparty','smoke 場地費','event_id','${NEV}')); select (event_id='${NEV}')::text from public.fin_transactions where counterparty='smoke 場地費'"
chkraise "掛一場不存在的活動（no_such_event）" "no_such_event" "perform set_config('test.uid','${SD}',true); perform public.fin_add_transaction(jsonb_build_object('happened_on','2027-09-20','kind','expense','amount',1,'currency','TWD','account_id','${FA1}','category_id','${CE}','event_id','00000000-0000-0000-0000-000000000009'));"
chkas "${SD}" "轉帳不掛活動" "x" "select public.fin_add_transaction(jsonb_build_object('happened_on','2027-09-20','kind','transfer','amount',1,'currency','TWD','account_id','${FA1}','to_account_id',(select id from public.fin_accounts where id<>'${FA1}' and archived_at is null limit 1),'counterparty','smoke 轉帳','event_id','${NEV}')); select 'x'||coalesce(event_id::text,'') from public.fin_transactions where counterparty='smoke 轉帳'"
chkas "${SD}" "★ 看得到財務的人：活動頁有這場的支出" "500.00|1" "select (public.event_links('${NEV}')->'money'->>'expense')||'|'||(public.event_links('${NEV}')->'money'->>'n')"
chkas "${EVX}" "★ 活動的人看不到錢（money 是 null）" "null" "select coalesce(public.event_links('${NEV}')->'money','null'::jsonb)::text"
chkraise "★ 不是財務的人拿不到挑活動的清單（not_finance_viewer）" "not_finance_viewer" "perform set_config('test.uid','${EVX}',true); perform public.fin_event_options();"
chkas "${EVX}" "★ 從活動頁送需求單，掛在那一場，活動頁看得到" "true|1" "select public.submit_request(jsonb_build_object('kind','post','title','Smoke 海報','platforms',jsonb_build_array('ig_carousel'),'event_id','${NEV}')); select (r.event_id='${NEV}')::text||'|'||jsonb_array_length(public.event_links('${NEV}')->'requests') from public.requests r where r.title='Smoke 海報'"
chkas "${OUTC}" "★ 沒被加進那場、也不在 Marketing 的幹部看不到掛在那場的需求單" "0" "select jsonb_array_length(public.event_links('${NEV}')->'requests')"
chkraise "送需求單掛不存在的活動（no_such_event）" "no_such_event" "perform set_config('test.uid','${EVX}',true); perform public.submit_request(jsonb_build_object('kind','post','title','x','event_id','00000000-0000-0000-0000-000000000009'));"
echo "── 名單的「可能是同一個人」跟 Records 同一套判斷（2026-12-17-roster-dup-verdict.sql）──"
rdv=$(psql -d "${DB}" -X -A -t -q -v ON_ERROR_STOP=1 -f supabase/migrations/2026-12-17-roster-dup-verdict.sql 2>&1 || true)
if echo "${rdv}" | grep -q "OVERALL.*PASS" && ! echo "${rdv}" | grep -q "|FAIL"; then echo "  ok   名單判斷那支驗收表全 PASS"; pass=$((pass+1)); else echo "  FAIL 名單判斷那支驗收表："; echo "${rdv}" | head -10; fail=$((fail+1)); fi
# 三對同英文名的成員：一對中文名一樣（像同一個人，要標）、一對中文名不同且學校不同（系統判兩個人，不標）、一對有人按過「不是同一個人」（不標）。
psql -d "${DB}" -X -A -t -q -c "insert into public.people (id, kind, name_en, name_zh, school) values
  ('00000000-0000-0000-0000-00000000d101','member','Smoke Twin','煙一','甲高中'),('00000000-0000-0000-0000-00000000d102','member','smoke twin','煙一',null),
  ('00000000-0000-0000-0000-00000000d201','member','Smoke Apart','煙二','甲高中'),('00000000-0000-0000-0000-00000000d202','member','Smoke Apart','霧二','乙高中'),
  ('00000000-0000-0000-0000-00000000d301','member','Smoke Said','煙三',null),('00000000-0000-0000-0000-00000000d302','member','Smoke Said','煙三',null)
  on conflict (id) do nothing;
  insert into public.rc_not_same (a, b) values ('00000000-0000-0000-0000-00000000d301','00000000-0000-0000-0000-00000000d302') on conflict do nothing;" 2>&1 | grep -i "error" || true
chkrole authenticated "${PAUL}" "★ 中文名一樣的同名成員：名單照樣標「可能是同一個人」" "true" "select ('00000000-0000-0000-0000-00000000d102' = any(maybe_dup))::text from public.roster() where person_id='00000000-0000-0000-0000-00000000d101'"
chkrole authenticated "${PAUL}" "★ 中文名不同、學校不同（Records 判成兩個人）：名單不標" "false" "select coalesce('00000000-0000-0000-0000-00000000d202' = any(maybe_dup), false)::text from public.roster() where person_id='00000000-0000-0000-0000-00000000d201'"
chkrole authenticated "${PAUL}" "★ 按過「不是同一個人」的：名單不標" "false" "select coalesce('00000000-0000-0000-0000-00000000d302' = any(maybe_dup), false)::text from public.roster() where person_id='00000000-0000-0000-0000-00000000d301'"
psql -d "${DB}" -X -A -t -q -c "delete from public.rc_not_same where a='00000000-0000-0000-0000-00000000d301'; delete from public.people where id in ('00000000-0000-0000-0000-00000000d101','00000000-0000-0000-0000-00000000d102','00000000-0000-0000-0000-00000000d201','00000000-0000-0000-0000-00000000d202','00000000-0000-0000-0000-00000000d301','00000000-0000-0000-0000-00000000d302');" 2>&1 | grep -i "error" || true
echo "── 會議範本與會議紀錄（2026-12-18-meeting-templates.sql）──"
mtp=$(psql -d "${DB}" -X -A -t -q -v ON_ERROR_STOP=1 -f supabase/migrations/2026-12-18-meeting-templates.sql 2>&1 || true)
if echo "${mtp}" | grep -q "OVERALL.*PASS" && ! echo "${mtp}" | grep -q "|FAIL"; then echo "  ok   會議範本那支驗收表全 PASS"; pass=$((pass+1)); else echo "  FAIL 會議範本那支驗收表："; echo "${mtp}" | head -12; fail=$((fail+1)); fi
mtp2=$(psql -d "${DB}" -X -A -t -q -v ON_ERROR_STOP=1 -f supabase/migrations/2026-12-18-meeting-templates.sql 2>&1 || true)
if echo "${mtp2}" | grep -q "OVERALL.*PASS"; then echo "  ok   會議範本那支重跑一次也全 PASS"; pass=$((pass+1)); else echo "  FAIL 會議範本重跑：${mtp2}" | head -5; fail=$((fail+1)); fi
chk "重跑不會多塞預設範本" "3" "select count(*) from public.meeting_templates"
chkas "${PAUL}" "Co-President 建得了範本" "true" "select (public.save_meeting_template(null,'Smoke 範本','board','[{\"h\":\"討論\",\"hint\":\"寫下來\"},{\"h\":\"  \",\"hint\":\"\"}]'::jsonb) is not null)::text"
chk "空的段落被丟掉" "1" "select jsonb_array_length(sections) from public.meeting_templates where title='Smoke 範本'"
chkraise "★ 一般幹部不能改範本（not_allowed）" "not_allowed" "perform set_config('test.uid','${ASSOC}',true); perform public.save_meeting_template(null,'x',null,'[{\"h\":\"a\"}]'::jsonb);"
chkraise "沒有段落的範本存不了（no_sections）" "no_sections" "perform set_config('test.uid','${PAUL}',true); perform public.save_meeting_template(null,'x',null,'[]'::jsonb);"
psql -d "${DB}" -X -A -t -q -c "insert into public.assignments (user_id, workspace_id, level) values ('${ASSOC}','custom:meeting-templates','edit') on conflict do nothing;" 2>&1 | grep -i "error" || true
chkas "${ASSOC}" "★ 被派進「會議範本」工作區（edit）之後改得了" "true" "select (public.save_meeting_template(null,'Assoc 範本',null,'[{\"h\":\"a\",\"hint\":\"\"}]'::jsonb) is not null)::text"
chkas "${ASSOC}" "封存一份範本" "t" "select public.archive_meeting_template((select id from public.meeting_templates where title='Assoc 範本')); select archived::text::char(1) from public.meeting_templates where title='Assoc 範本'"
psql -d "${DB}" -X -A -t -q -c "delete from public.assignments where user_id='${ASSOC}' and workspace_id='custom:meeting-templates';" 2>&1 | grep -i "error" || true
chkraise "★ 拿掉之後又改不了" "not_allowed" "perform set_config('test.uid','${ASSOC}',true); perform public.archive_meeting_template((select id from public.meeting_templates where title='Assoc 範本'), false);"
chkrole authenticated "${ASSOC}" "★ 幹部讀得到範本" "5" "select count(*) from public.meeting_templates"
chkrole authenticated "${STU}" "★ 學員讀不到範本" "0" "select count(*) from public.meeting_templates"
mtg=$(psql -d "${DB}" -X -A -t -q -c "set role anon; select count(*) from public.meeting_templates;" 2>&1 || true)
if echo "${mtg}" | grep -qi "permission denied"; then echo "  ok   沒登入讀不到範本表"; pass=$((pass+1)); else echo "  FAIL anon 讀得到範本表：${mtg}"; fail=$((fail+1)); fi
MTM=$(psql -d "${DB}" -X -A -t -q -c "insert into public.meetings (scope, title, starts_at, ends_at) values ('board','紀錄測試', now() + interval '2 day', now() + interval '2 day 1 hour') returning id;" | head -1 | tr -d ' ')
chkas "${PAUL}" "★ 排會的人寫得了紀錄（有標題沒內文的段落留著，範本的樣子不會掉）" "3|討論" "select public.save_meeting_minutes('${MTM}', (select id from public.meeting_templates where title='Smoke 範本'), '[{\"h\":\"討論\",\"text\":\"決定了 A\"},{\"h\":\"其他\",\"text\":\"\"},{\"h\":\"\",\"text\":\"沒標題也留\"}]'::jsonb); select jsonb_array_length(minutes)||'|'||(minutes->0->>'h') from public.meetings where id='${MTM}'"
chk "記住是用哪一份範本" "t" "select (template_id is not null)::text::char(1) from public.meetings where id='${MTM}'"
chkraise "★ 不在名單上的一般幹部寫不了紀錄，建會的人是空的也一樣（not_allowed）" "not_allowed" "perform set_config('test.uid','${ASSOC}',true); perform public.save_meeting_minutes('${MTM}', null, '[]'::jsonb);"
psql -d "${DB}" -X -A -t -q -c "insert into public.meeting_attendees (meeting_id, user_id) values ('${MTM}','${ASSOC}') on conflict do nothing;" 2>&1 | grep -i "error" || true
chkas "${ASSOC}" "★ 在出席名單上就寫得了" "1" "select public.save_meeting_minutes('${MTM}', null, '[{\"h\":\"筆記\",\"text\":\"我記的\"}]'::jsonb); select jsonb_array_length(minutes) from public.meetings where id='${MTM}'"
chkraise "★ 學員寫不了（not_cadre）" "not_cadre" "perform set_config('test.uid','${STU}',true); perform public.save_meeting_minutes('${MTM}', null, '[]'::jsonb);"
chkraise "不存在的範本（no_such_template）" "no_such_template" "perform set_config('test.uid','${PAUL}',true); perform public.save_meeting_minutes('${MTM}', '00000000-0000-0000-0000-000000000009', '[]'::jsonb);"
psql -d "${DB}" -X -A -t -q -c "delete from public.meetings where id='${MTM}'; delete from public.meeting_templates where title in ('Smoke 範本','Assoc 範本');" 2>&1 | grep -i "error" || true
echo "── 權限修正：高職級邀請只有 Co-President 發得出去、幹部都看得到活動清單（2026-12-19-access-fixes.sql）──"
afx=$(psql -d "${DB}" -X -A -t -q -v ON_ERROR_STOP=1 -f supabase/migrations/2026-12-19-access-fixes.sql 2>&1 || true)
if echo "${afx}" | grep -q "OVERALL.*PASS" && ! echo "${afx}" | grep -q "|FAIL"; then echo "  ok   權限修正那支驗收表全 PASS"; pass=$((pass+1)); else echo "  FAIL 權限修正那支驗收表："; echo "${afx}" | head -8; fail=$((fail+1)); fi
afx2=$(psql -d "${DB}" -X -A -t -q -v ON_ERROR_STOP=1 -f supabase/migrations/2026-12-19-access-fixes.sql 2>&1 || true)
if echo "${afx2}" | grep -q "OVERALL.*PASS"; then echo "  ok   權限修正那支重跑一次也全 PASS"; pass=$((pass+1)); else echo "  FAIL 權限修正重跑：${afx2}" | head -5; fail=$((fail+1)); fi
SAWAS=$(psql -d "${DB}" -X -A -t -q -c "select board_role from public.profiles where id='${OTHER}'" | tr -d ' \n')
psql -d "${DB}" -X -A -t -q -c "update public.profiles set role='cadre', board_role='senior_adviser' where id='${OTHER}';" 2>&1 | grep -i "error" || true
chkraise "★ Senior Adviser 發不出 Co-President 的邀請（rank_needs_president）" "rank_needs_president" "perform set_config('test.uid','${OTHER}',true); perform public.invite_person('sa-pres@example.com','cadre','president','','','','','','','','','zh',null);"
chkraise "★ Senior Adviser 也發不出 Senior Adviser 的邀請" "rank_needs_president" "perform set_config('test.uid','${OTHER}',true); perform public.invite_person('sa-sa@example.com','cadre','senior_adviser','','','','','','','','','zh',null);"
chkas "${OTHER}" "Senior Adviser 照樣發得出 Director 的邀請" "director" "select public.invite_person('sa-dir@example.com','cadre','director','','','','','','','','','zh',null); select rank from public.invite_codes where email='sa-dir@example.com'"
chkraise "★ Senior Adviser 也不能把一張邀請改成 Co-President" "rank_needs_president" "perform set_config('test.uid','${OTHER}',true); update public.invite_codes set rank='president' where email='sa-dir@example.com';"
chkas "${PAUL}" "Co-President 發得出 Co-President 的邀請" "president" "select public.invite_person('cp-pres@example.com','cadre','president','','','','','','','','','zh',null); select rank from public.invite_codes where email='cp-pres@example.com'"
chk "在 SQL Editor 直接改（沒有登入的人）不擋" "1" "update public.invite_codes set rank='senior_adviser' where email='sa-dir@example.com' returning 1"
psql -d "${DB}" -X -A -t -q -c "delete from public.mail_outbox where invite_code in (select code from public.invite_codes where email in ('sa-dir@example.com','cp-pres@example.com')); delete from public.invite_codes where email in ('sa-dir@example.com','cp-pres@example.com'); update public.profiles set board_role=nullif('${SAWAS}','') where id='${OTHER}';" 2>&1 | grep -i "error" || true
chk "（前提）測試資料庫裡有活動、而且 ASSOC 沒有被加進任何一場" "t" "select ((select count(*) from public.events) > 0 and not exists (select 1 from public.assignments a join public.events e on e.workspace_id = a.workspace_id where a.user_id = '${ASSOC}'))::text::char(1)"
chkrole authenticated "${ASSOC}" "★ 沒被加進任何一場的幹部也看得到每一場活動" "$(psql -d "${DB}" -X -A -t -q -c "select count(*) from public.events" | tr -d ' \n')" "select count(*) from public.events"
chkrole authenticated "${STU}" "★ 學員還是看不到活動表（學員看的是對外的 public_events）" "0" "select count(*) from public.events"
echo "── 表單引擎：新題型、伺服器驗證、收滿、一個 email 一份、隱藏欄位（2026-12-20-form-engine.sql）──"
fen=$(psql -d "${DB}" -X -A -t -q -v ON_ERROR_STOP=1 -f supabase/migrations/2026-12-20-form-engine.sql 2>&1 || true)
if echo "${fen}" | grep -q "OVERALL.*PASS" && ! echo "${fen}" | grep -q "|FAIL"; then echo "  ok   表單引擎那支驗收表全 PASS"; pass=$((pass+1)); else echo "  FAIL 表單引擎那支驗收表："; echo "${fen}" | head -14; fail=$((fail+1)); fi
fen2=$(psql -d "${DB}" -X -A -t -q -v ON_ERROR_STOP=1 -f supabase/migrations/2026-12-20-form-engine.sql 2>&1 || true)
if echo "${fen2}" | grep -q "OVERALL.*PASS"; then echo "  ok   表單引擎那支重跑一次也全 PASS"; pass=$((pass+1)); else echo "  FAIL 表單引擎重跑：${fen2}" | head -5; fail=$((fail+1)); fi
FEF=cccccccc-fe00-0000-0000-000000000001
FEQ1=cccccccc-fe00-0000-0000-0000000000a1; FEQ2=cccccccc-fe00-0000-0000-0000000000a2; FEQ3=cccccccc-fe00-0000-0000-0000000000a3
FEQ4=cccccccc-fe00-0000-0000-0000000000a4; FEQ5=cccccccc-fe00-0000-0000-0000000000a5; FEQ6=cccccccc-fe00-0000-0000-0000000000a6
FEQ7=cccccccc-fe00-0000-0000-0000000000a7; FEQ8=cccccccc-fe00-0000-0000-0000000000a8
FES1=cccccccc-fe00-0000-0000-0000000000b1; FES2=cccccccc-fe00-0000-0000-0000000000b2; FES3=cccccccc-fe00-0000-0000-0000000000b3
psql -d "$DB" -q -v ON_ERROR_STOP=1 <<SQL
insert into auth.users (id,email) values ('${FES1}','fe1@example.com'), ('${FES2}','FE1@Example.com'), ('${FES3}','fe3@example.com');
insert into public.profiles (id,name_zh,role) values ('${FES1}','引擎一號','student'), ('${FES2}','引擎二號','student'), ('${FES3}','引擎三號','student');
insert into public.forms (id,team,title,status,hidden_fields) values ('${FEF}','Curriculum','引擎測試表','open','{from}');
insert into public.form_questions (id,form_id,ord,label,type,required,options,config,logic) values
 ('${FEQ1}','${FEF}',1,'有沒有參加過','single',true,'{有,沒有}','{}','[{"match":"all","when":[{"q":"${FEQ1}","op":"is","v":"有"}],"do":"show","target":"${FEQ2}"}]'),
 ('${FEQ2}','${FEF}',2,'參加過哪一場','short',true,'{}','{}','[]'),
 ('${FEQ3}','${FEF}',3,'聯絡信箱','email',true,'{}','{}','[]'),
 ('${FEQ4}','${FEF}',4,'幾年級','number',false,'{}','{"min":9,"max":12}','[]'),
 ('${FEQ5}','${FEF}',5,'哪一天方便','date',false,'{}','{}','[]'),
 ('${FEQ6}','${FEF}',6,'附件','file',false,'{}','{}','[]'),
 ('${FEQ7}','${FEF}',7,'關於你','heading',false,'{}','{}','[]'),
 ('${FEQ8}','${FEF}',8,'怎麼知道我們','dropdown',false,'{IG,朋友}','{}','[]');
SQL
fesub() { echo "perform set_config('test.uid','${1}',true); perform public.submit_application('${FEF}', '${2}'::jsonb, null, null);"; }
chkraise "★ 不受規則影響的必填題留白會被擋（missing:聯絡信箱）" "missing:聯絡信箱" "$(fesub "${FES1}" '[{"q":"'"${FEQ1}"'","v":"沒有"}]')"
chkraise "★ 被條件藏起來的必填題（參加過哪一場）不擋，只報信箱" "missing:聯絡信箱$" "$(fesub "${FES1}" '[{"q":"'"${FEQ1}"'","v":"沒有"}]')"
chkraise "★ 信箱格式不對（bad_answer）" "bad_answer:聯絡信箱" "$(fesub "${FES1}" '[{"q":"'"${FEQ1}"'","v":"沒有"},{"q":"'"${FEQ3}"'","v":"not-an-email"}]')"
chkraise "★ 數字超出範圍（bad_answer）" "bad_answer:幾年級" "$(fesub "${FES1}" '[{"q":"'"${FEQ1}"'","v":"沒有"},{"q":"'"${FEQ3}"'","v":"a@b.co"},{"q":"'"${FEQ4}"'","v":"20"}]')"
chkraise "★ 2 月 30 日轉不成日期（bad_answer，不是資料庫錯誤）" "bad_answer:哪一天方便" "$(fesub "${FES1}" '[{"q":"'"${FEQ1}"'","v":"沒有"},{"q":"'"${FEQ3}"'","v":"a@b.co"},{"q":"'"${FEQ5}"'","v":"2027-02-30"}]')"
chkraise "★ 不在選項裡的單選（bad_answer）" "bad_answer:有沒有參加過" "$(fesub "${FES1}" '[{"q":"'"${FEQ1}"'","v":"也許"},{"q":"'"${FEQ3}"'","v":"a@b.co"}]')"
chkraise "★ 不在選項裡的下拉（bad_answer）" "bad_answer:怎麼知道我們" "$(fesub "${FES1}" '[{"q":"'"${FEQ1}"'","v":"沒有"},{"q":"'"${FEQ3}"'","v":"a@b.co"},{"q":"'"${FEQ8}"'","v":"報紙"}]')"
chkraise "★ 檔案路徑指到別人的資料夾（bad_answer）" "bad_answer:附件" "$(fesub "${FES1}" '[{"q":"'"${FEQ1}"'","v":"沒有"},{"q":"'"${FEQ3}"'","v":"a@b.co"},{"q":"'"${FEQ6}"'","v":"'"${FEF}/${FES3}"'/x.pdf"}]')"
chkraise "★ 檔案路徑用 .. 跳出自己的資料夾（bad_answer）" "bad_answer:附件" "$(fesub "${FES1}" '[{"q":"'"${FEQ1}"'","v":"沒有"},{"q":"'"${FEQ3}"'","v":"a@b.co"},{"q":"'"${FEQ6}"'","v":"'"${FEF}/${FES1}"'/../'"${FES3}"'/x.pdf"}]')"
FEA=$(psql -d "${DB}" -X -A -t -q -c "select set_config('test.uid','${FES1}',false);" -c "set role authenticated; select public.submit_application('${FEF}', '[{\"q\":\"${FEQ1}\",\"v\":\"沒有\"},{\"q\":\"${FEQ3}\",\"v\":\"a@b.co\"},{\"q\":\"${FEQ4}\",\"v\":\"11\"},{\"q\":\"${FEQ6}\",\"v\":\"${FEF}/${FES1}/q-1.pdf\"},{\"q\":\"${FEQ7}\",\"v\":\"不該存\"}]'::jsonb, null, '{\"from\":\"ig\",\"evil\":\"x\"}'::jsonb)" 2>&1 | tail -1 | tr -d ' \n' || true)
case "${FEA}" in ????????-*) echo "  ok   ★ 填對的一份送得出去（藏起來的必填題沒填也行）"; pass=$((pass+1));; *) echo "  FAIL 填對的一份送不出去：${FEA}"; fail=$((fail+1));; esac
chk "★ 隱藏欄位只收表單列的名字（from 留著、evil 丟掉）" '{"from":"ig"}' "select meta::text from public.applications where id='${FEA}'"
chk "★ 小標題那一塊就算前端送了也不存答案；沒送的題沒有那一列" "4|0" "select count(*)||'|'||count(*) filter (where question_id in ('${FEQ7}','${FEQ2}')) from public.application_answers where application_id='${FEA}'"
chkraise "★ 同一個 email（大小寫不同）用別的帳號送不了第二份（email_used）" "email_used" "$(fesub "${FES2}" '[{"q":"'"${FEQ1}"'","v":"沒有"},{"q":"'"${FEQ3}"'","v":"a@b.co"}]')"
psql -d "${DB}" -X -A -t -q -c "update public.forms set max_responses=1 where id='${FEF}';" 2>&1 | grep -i "error" || true
chkrole anon "" "★ 沒登入叫得到 form_is_full，收滿是 true" "true" "select public.form_is_full('${FEF}')::text"
chkraise "★ 收滿了別人送不進來（full）" "full" "$(fesub "${FES3}" '[{"q":"'"${FEQ1}"'","v":"沒有"},{"q":"'"${FEQ3}"'","v":"c@d.co"}]')"
chkas "${FES1}" "★ 已經送過的人再按一次拿回原本那一筆，不會被「收滿」擋" "${FEA}" "select public.submit_application('${FEF}', '[{\"q\":\"${FEQ1}\",\"v\":\"沒有\"},{\"q\":\"${FEQ3}\",\"v\":\"a@b.co\"}]'::jsonb)"
fap=$(psql -d "${DB}" -X -A -t -q -c "set role authenticated; select public.form_answer_problem('${FEF}','[]'::jsonb,'${FES1}');" 2>&1 || true)
if echo "${fap}" | grep -qi "permission denied"; then echo "  ok   ★ 登入的人直接叫不到 form_answer_problem"; pass=$((pass+1)); else echo "  FAIL form_answer_problem 對外開著：${fap}"; fail=$((fail+1)); fi
fap2=$(psql -d "${DB}" -X -A -t -q -c "set role anon; select public.submit_application('${FEF}','[]'::jsonb);" 2>&1 || true)
if echo "${fap2}" | grep -qi "permission denied"; then echo "  ok   ★ 沒登入叫不到 submit_application"; pass=$((pass+1)); else echo "  FAIL anon 叫得到 submit_application：${fap2}"; fail=$((fail+1)); fi
sed "s/    if public.event_is_full(p_form_id) or public.form_is_full(p_form_id) then/    if public.event_is_full(p_form_id) then/" supabase/migrations/2026-12-20-form-engine.sql > "${BROKEN}"
bk=$(psql -d "${DB}" -X -A -t -q -f "${BROKEN}" 2>&1 || true)
if echo "${bk}" | grep -q "OVERALL.*FAIL"; then echo "  ok   ★ 破壞測試：拿掉「收滿就關」，驗收表變紅"; pass=$((pass+1)); else echo "  FAIL 拿掉收滿門驗收表沒變紅"; fail=$((fail+1)); fi
sed "s/    raise exception 'email_used' using errcode = 'P0001';/    null;/" supabase/migrations/2026-12-20-form-engine.sql > "${BROKEN}"
bk=$(psql -d "${DB}" -X -A -t -q -f "${BROKEN}" 2>&1 || true)
if echo "${bk}" | grep -q "OVERALL.*FAIL"; then echo "  ok   ★ 破壞測試：拿掉「一個 email 一份」，驗收表變紅"; pass=$((pass+1)); else echo "  FAIL 拿掉 email 門驗收表沒變紅"; fail=$((fail+1)); fi
sed "s/  v_bad := public.form_answer_problem(p_form_id, v_ans, v_uid);/  v_bad := null;/" supabase/migrations/2026-12-20-form-engine.sql > "${BROKEN}"
bk=$(psql -d "${DB}" -X -A -t -q -f "${BROKEN}" 2>&1 || true)
if echo "${bk}" | grep -q "OVERALL.*FAIL"; then echo "  ok   ★ 破壞測試：拿掉伺服器驗證，驗收表變紅"; pass=$((pass+1)); else echo "  FAIL 拿掉伺服器驗證驗收表沒變紅"; fail=$((fail+1)); fi
sed "s/    if q.type = 'file' and (p_uid is null or position(p_form::text || '\/' || p_uid::text || '\/' in v) <> 1 or v like '%..%') then/    if false then/" supabase/migrations/2026-12-20-form-engine.sql > "${BROKEN}"
bk=$(psql -d "${DB}" -X -A -t -q -f "${BROKEN}" 2>&1 || true)
if echo "${bk}" | grep -q "OVERALL.*FAIL"; then echo "  ok   ★ 破壞測試：拿掉「檔案只能是自己的」，驗收表變紅"; pass=$((pass+1)); else echo "  FAIL 拿掉檔案路徑門驗收表沒變紅"; fail=$((fail+1)); fi
fen3=$(psql -d "${DB}" -X -A -t -q -v ON_ERROR_STOP=1 -f supabase/migrations/2026-12-20-form-engine.sql 2>&1 || true)
if echo "${fen3}" | grep -q "OVERALL.*PASS"; then echo "  ok   破壞測試之後裝回正確的那一版"; pass=$((pass+1)); else echo "  FAIL 裝回正確版沒過：${fen3}" | head -5; fail=$((fail+1)); fi
echo "── 送出確認信（2026-12-21-form-received-mail.sql）──"
frm=$(psql -d "${DB}" -X -A -t -q -v ON_ERROR_STOP=1 -f supabase/migrations/2026-12-21-form-received-mail.sql 2>&1 || true)
if echo "${frm}" | grep -q "OVERALL.*PASS" && ! echo "${frm}" | grep -q "|FAIL"; then echo "  ok   確認信那支驗收表全 PASS"; pass=$((pass+1)); else echo "  FAIL 確認信那支驗收表："; echo "${frm}" | head -10; fail=$((fail+1)); fi
psql -d "${DB}" -X -A -t -q -c "update public.mail_templates set subject_zh='Paul 改過的主旨 {活動名稱}' where kind='received';" 2>&1 | grep -i "error" || true
frm2=$(psql -d "${DB}" -X -A -t -q -v ON_ERROR_STOP=1 -f supabase/migrations/2026-12-21-form-received-mail.sql 2>&1 || true)
if echo "${frm2}" | grep -q "OVERALL.*PASS"; then echo "  ok   確認信那支重跑一次也全 PASS"; pass=$((pass+1)); else echo "  FAIL 確認信重跑：${frm2}" | head -5; fail=$((fail+1)); fi
chk "★ 重跑不會蓋掉改過的文案" "Paul改過的主旨{活動名稱}" "select subject_zh from public.mail_templates where kind='received'"
FES4=cccccccc-fe00-0000-0000-0000000000b4; FES5=cccccccc-fe00-0000-0000-0000000000b5
psql -d "$DB" -q -v ON_ERROR_STOP=1 <<SQL
insert into auth.users (id,email) values ('${FES4}','fe4@example.com'), ('${FES5}','fe5@example.com');
insert into public.profiles (id,name_zh,role) values ('${FES4}','引擎四號','student'), ('${FES5}','引擎五號','student');
update public.forms set max_responses=null, confirm_mail=false where id='${FEF}';
SQL
chkas "${FES4}" "表單沒勾：送出不會排確認信" "0" "select public.submit_application('${FEF}', '[{\"q\":\"${FEQ1}\",\"v\":\"沒有\"},{\"q\":\"${FEQ3}\",\"v\":\"secret-answer@x.co\"}]'::jsonb); select count(*) from public.mail_outbox where kind='received'"
psql -d "${DB}" -X -A -t -q -c "update public.forms set confirm_mail=true where id='${FEF}';" 2>&1 | grep -i "error" || true
chkas "${FES5}" "★ 表單勾了：排一封寄到申請人自己的登入信箱" "1|fe5@example.com" "select public.submit_application('${FEF}', '[{\"q\":\"${FEQ1}\",\"v\":\"沒有\"},{\"q\":\"${FEQ3}\",\"v\":\"secret-answer@x.co\"}]'::jsonb); select count(*)||'|'||max(to_email) from public.mail_outbox where kind='received'"
chk "★ 信裡沒有答案，只有姓名與表單名稱" "t|t|f" "select (body like '%引擎五號%')::text::char(1)||'|'||(subject like '%引擎測試表%')::text::char(1)||'|'||(body like '%secret-answer%')::text::char(1) from public.mail_outbox where kind='received'"
chk "確認信的按鈕連到 /app/" "https://beyondtaiwannpo.com/app/" "select public.mail_button_url(m) from public.mail_outbox m where kind='received'"
chkas "${FES5}" "同一個人再按一次送出不會多一封" "1" "select public.submit_application('${FEF}', '[{\"q\":\"${FEQ1}\",\"v\":\"沒有\"},{\"q\":\"${FEQ3}\",\"v\":\"secret-answer@x.co\"}]'::jsonb); select count(*) from public.mail_outbox where kind='received'"
fqm=$(psql -d "${DB}" -X -A -t -q -c "set role authenticated; insert into public.mail_outbox (to_email, subject, body, kind) values ('x@y.co','s','b','received');" 2>&1 || true)
if echo "${fqm}" | grep -qi "permission denied\|row-level security"; then echo "  ok   ★ 登入的人自己塞不了確認信進 outbox"; pass=$((pass+1)); else echo "  FAIL 登入的人塞得進 outbox：${fqm}"; fail=$((fail+1)); fi
sed "s/  if not coalesce(v_form.confirm_mail, false) then return new; end if;//" supabase/migrations/2026-12-21-form-received-mail.sql > "${BROKEN}"
bk=$(psql -d "${DB}" -X -A -t -q -f "${BROKEN}" 2>&1 || true)
if echo "${bk}" | grep -q "OVERALL.*FAIL"; then echo "  ok   ★ 破壞測試：拿掉「表單有勾才寄」，驗收表變紅"; pass=$((pass+1)); else echo "  FAIL 拿掉開關驗收表沒變紅"; fail=$((fail+1)); fi
frm3=$(psql -d "${DB}" -X -A -t -q -v ON_ERROR_STOP=1 -f supabase/migrations/2026-12-21-form-received-mail.sql 2>&1 || true)
if echo "${frm3}" | grep -q "OVERALL.*PASS"; then echo "  ok   破壞測試之後裝回正確的那一版"; pass=$((pass+1)); else echo "  FAIL 裝回正確版沒過：${frm3}" | head -5; fail=$((fail+1)); fi
psql -d "${DB}" -X -A -t -q -c "update public.forms set confirm_mail=false where id='${FEF}';" 2>&1 | grep -i "error" || true
echo "── 申請表單上傳檔案：私人 bucket 與誰讀得到（2026-12-22-form-uploads.sql）──"
fup=$(psql -d "${DB}" -X -A -t -q -v ON_ERROR_STOP=1 -f supabase/migrations/2026-12-22-form-uploads.sql 2>&1 || true)
if echo "${fup}" | grep -q "OVERALL.*PASS" && ! echo "${fup}" | grep -q "|FAIL"; then echo "  ok   上傳那支驗收表全 PASS"; pass=$((pass+1)); else echo "  FAIL 上傳那支驗收表："; echo "${fup}" | head -8; fail=$((fail+1)); fi
fup2=$(psql -d "${DB}" -X -A -t -q -v ON_ERROR_STOP=1 -f supabase/migrations/2026-12-22-form-uploads.sql 2>&1 || true)
if echo "${fup2}" | grep -q "OVERALL.*PASS"; then echo "  ok   上傳那支重跑一次也全 PASS"; pass=$((pass+1)); else echo "  FAIL 上傳重跑：${fup2}" | head -5; fail=$((fail+1)); fi
FES6=cccccccc-fe00-0000-0000-0000000000b6; FES7=cccccccc-fe00-0000-0000-0000000000b7
psql -d "$DB" -q -v ON_ERROR_STOP=1 <<SQL
insert into auth.users (id,email) values ('${FES6}','fe6@example.com'), ('${FES7}','fe7@example.com');
insert into public.profiles (id,name_zh,role) values ('${FES6}','引擎六號','student'), ('${FES7}','引擎七號','student');
update public.forms set status='open', max_responses=null where id='${FEF}';
SQL
UPF="${FEF}/${FES6}/${FEQ6}-r1.pdf"
upins() { echo "insert into storage.objects (bucket_id, name, owner) values ('form-uploads', '${1}', '${2}'); select 'inserted'"; }
updeny() { # updeny 名稱 使用者 路徑
  local got; got=$(psql -d "${DB}" -X -A -t -q -c "select set_config('test.uid','${2}',false);" -c "set role authenticated; insert into storage.objects (bucket_id, name, owner) values ('form-uploads', '${3}', '${2}');" 2>&1 || true)
  if echo "${got}" | grep -qi "row-level security"; then echo "  ok   ${1}"; pass=$((pass+1)); else echo "  FAIL ${1}（沒有被擋：${got}）"; fail=$((fail+1)); fi
}
chkrole authenticated "${FES6}" "★ 學生傳得進自己的資料夾（開著的表單、真的有上傳題）" "inserted" "$(upins "${UPF}" "${FES6}")"
chk "那個檔真的在" "1" "select count(*) from storage.objects where bucket_id='form-uploads' and name='${UPF}'"
updeny "★ 學生傳不進別人的資料夾" "${FES6}" "${FEF}/${FES7}/${FEQ6}-r2.pdf"
updeny "★ 路徑指到不是上傳題的題，傳不進去" "${FES6}" "${FEF}/${FES6}/${FEQ3}-r3.pdf"
updeny "★ 路徑多一層（想繞出自己的資料夾），傳不進去" "${FES6}" "${FEF}/${FES6}/x/${FEQ6}-r4.pdf"
updeny "★ 路徑有 ..，傳不進去" "${FES6}" "${FEF}/${FES6}/${FEQ6}-..r5.pdf"
fan=$(psql -d "${DB}" -X -A -t -q -c "set role anon; insert into storage.objects (bucket_id, name) values ('form-uploads', '${FEF}/${FES6}/${FEQ6}-anon.pdf');" 2>&1 || true)
if echo "${fan}" | grep -qi "row-level security\|permission denied"; then echo "  ok   ★ 沒登入傳不進去"; pass=$((pass+1)); else echo "  FAIL anon 傳得進去：${fan}"; fail=$((fail+1)); fi
chkrole authenticated "${FES6}" "★ 上傳的人自己讀不回來（只有改得動那份表單的人讀得到）" "0" "select count(*) from storage.objects where bucket_id='form-uploads'"
chkrole authenticated "${FES1}" "★ 別的學生讀不到別人的檔" "0" "select count(*) from storage.objects where bucket_id='form-uploads'"
chkrole anon "" "★ 沒登入讀不到" "0" "select count(*) from storage.objects where bucket_id='form-uploads'"
chkrole authenticated "${ASSOC}" "★ 改不動申請表單的一般幹部也讀不到" "0" "select count(*) from storage.objects where bucket_id='form-uploads'"
chkrole authenticated "${PAUL}" "★ Co-President（改得動那份表單）讀得到" "1" "select count(*) from storage.objects where bucket_id='form-uploads'"
chkrole authenticated "${FES6}" "★ 學生改不了檔名（沒有改的政策）" "0" "with u as (update storage.objects set name='${FEF}/${FES6}/${FEQ6}-moved.pdf' where name='${UPF}' returning 1) select count(*) from u"
chkrole authenticated "${FES6}" "★ 學生刪不了（沒有刪的政策）" "0" "with d as (delete from storage.objects where name='${UPF}' returning 1) select count(*) from d"
chkas "${FES6}" "帶著自己的檔送出申請" "1" "select public.submit_application('${FEF}', '[{\"q\":\"${FEQ1}\",\"v\":\"沒有\"},{\"q\":\"${FEQ3}\",\"v\":\"f6@x.co\"},{\"q\":\"${FEQ6}\",\"v\":\"${UPF}\"}]'::jsonb); select count(*) from public.application_answers where value='${UPF}'"
updeny "★ 送出之後就不能再傳" "${FES6}" "${FEF}/${FES6}/${FEQ6}-after.pdf"
psql -d "${DB}" -X -A -t -q -c "update public.forms set status='closed' where id='${FEF}';" 2>&1 | grep -i "error" || true
updeny "★ 表單關了就不能傳" "${FES7}" "${FEF}/${FES7}/${FEQ6}-closed.pdf"
psql -d "${DB}" -X -A -t -q -c "update public.forms set status='open' where id='${FEF}'; insert into storage.objects (bucket_id, name, owner) select 'form-uploads', '${FEF}/${FES7}/${FEQ6}-n' || g || '.pdf', '${FES7}' from generate_series(1,20) g;" 2>&1 | grep -i "error" || true
updeny "★ 一個人一份表單最多 20 個檔" "${FES7}" "${FEF}/${FES7}/${FEQ6}-n21.pdf"
psql -d "${DB}" -X -A -t -q -c "delete from storage.objects where bucket_id='form-uploads';" 2>&1 | grep -i "error" || true
sed "s/  return coalesce((select public.form_can_edit(f.id) from public.forms f/  return coalesce((select true from public.forms f/" supabase/migrations/2026-12-22-form-uploads.sql > "${BROKEN}"
bk=$(psql -d "${DB}" -X -A -t -q -f "${BROKEN}" 2>&1 || true)
if echo "${bk}" | grep -q "OVERALL.*FAIL"; then echo "  ok   ★ 破壞測試：讀的門拿掉「改得動那份表單」，驗收表變紅"; pass=$((pass+1)); else echo "  FAIL 拿掉讀的門驗收表沒變紅"; fail=$((fail+1)); fi
sed "s/  if split_part(p_name, '\/', 2) <> v_uid::text or/  if/" supabase/migrations/2026-12-22-form-uploads.sql > "${BROKEN}"
bk=$(psql -d "${DB}" -X -A -t -q -f "${BROKEN}" 2>&1 || true)
if echo "${bk}" | grep -q "OVERALL.*FAIL"; then echo "  ok   ★ 破壞測試：傳的門拿掉「只能傳進自己的資料夾」，驗收表變紅"; pass=$((pass+1)); else echo "  FAIL 拿掉本人資料夾驗收表沒變紅"; fail=$((fail+1)); fi
fup3=$(psql -d "${DB}" -X -A -t -q -v ON_ERROR_STOP=1 -f supabase/migrations/2026-12-22-form-uploads.sql 2>&1 || true)
if echo "${fup3}" | grep -q "OVERALL.*PASS"; then echo "  ok   破壞測試之後裝回正確的那一版"; pass=$((pass+1)); else echo "  FAIL 裝回正確版沒過：${fup3}" | head -5; fail=$((fail+1)); fi
echo "── 內部表單換上表單引擎（2026-12-23-team-forms-engine.sql）──"
# 這時候：PAUL Co-President、MKE 與 MKM 在 Marketing、RQR 在 Curriculum、OUTC 在 Mentorship。資料全是假的。
tfe=$(psql -d "${DB}" -X -A -t -q -v ON_ERROR_STOP=1 -f supabase/migrations/2026-12-23-team-forms-engine.sql 2>&1 || true)
if echo "${tfe}" | grep -q "OVERALL.*PASS" && ! echo "${tfe}" | grep -q "|FAIL"; then echo "  ok   內部表單引擎那支驗收表全 PASS"; pass=$((pass+1)); else echo "  FAIL 內部表單引擎那支驗收表："; echo "${tfe}" | head -25; fail=$((fail+1)); fi
tfe2=$(psql -d "${DB}" -X -A -t -q -v ON_ERROR_STOP=1 -f supabase/migrations/2026-12-23-team-forms-engine.sql 2>&1 || true)
if echo "${tfe2}" | grep -q "OVERALL.*PASS" && ! echo "${tfe2}" | grep -q "|FAIL"; then echo "  ok   內部表單引擎那支可以重跑"; pass=$((pass+1)); else echo "  FAIL 內部表單引擎那支重跑沒過"; echo "${tfe2}" | head -10; fail=$((fail+1)); fi
chk "重跑不動資料（舊的兩份、四份答案還在）" "2|4" "select (select count(*) from public.tf_forms)||'|'||(select count(*) from public.tf_responses)"
chk "舊的題目 config 補成空物件、logic 補成空陣列" "0" "select count(*) from public.tf_questions where config is null or logic is null or jsonb_typeof(logic) <> 'array'"
chkas "${PAUL}" "★ 舊的五種題型照樣讀得到結果（舊表單沒被牽動，三份）" "3" "select jsonb_array_length(public.tf_results('${TF2}')->'responses')"
# 一份有換頁、條件邏輯、新題型的表單。id 是前端產的（瀏覽器的 crypto.randomUUID），資料庫照用。
E1=cccccccc-0000-4000-8000-000000000001; E2=cccccccc-0000-4000-8000-000000000002; E3=cccccccc-0000-4000-8000-000000000003
E4=cccccccc-0000-4000-8000-000000000004; E5=cccccccc-0000-4000-8000-000000000005; E6=cccccccc-0000-4000-8000-000000000006
EP=cccccccc-0000-4000-8000-000000000007; EH=cccccccc-0000-4000-8000-000000000008; ET=cccccccc-0000-4000-8000-000000000009
E7=cccccccc-0000-4000-8000-000000000010; E8=cccccccc-0000-4000-8000-000000000011; ES=cccccccc-0000-4000-8000-000000000012
E9=cccccccc-0000-4000-8000-000000000013
TEQ="[{\"id\":\"${E1}\",\"type\":\"email\",\"label\":\"Email\",\"required\":true},{\"id\":\"${E2}\",\"type\":\"phone\",\"label\":\"Phone\"},{\"id\":\"${E3}\",\"type\":\"number\",\"label\":\"Hours\",\"config\":{\"min\":1,\"max\":10}},{\"id\":\"${E4}\",\"type\":\"date\",\"label\":\"When\"},{\"id\":\"${E5}\",\"type\":\"consent\",\"label\":\"I agree\",\"required\":true},{\"id\":\"${E6}\",\"type\":\"dropdown\",\"label\":\"Pick\",\"options\":[\"a\",\"b\"],\"logic\":[{\"match\":\"all\",\"when\":[{\"q\":\"${E6}\",\"op\":\"is\",\"v\":\"b\"}],\"do\":\"show\",\"target\":\"${E9}\"}]},{\"id\":\"${EP}\",\"type\":\"page\",\"label\":\"\"},{\"id\":\"${EH}\",\"type\":\"heading\",\"label\":\"Part two\"},{\"id\":\"${ET}\",\"type\":\"text\",\"label\":\"\"},{\"id\":\"${E7}\",\"type\":\"single\",\"label\":\"Role\",\"options\":[\"x\",\"y\"],\"config\":{\"other\":true}},{\"id\":\"${E8}\",\"type\":\"multi\",\"label\":\"Tags\",\"options\":[\"m\",\"n\"]},{\"id\":\"${ES}\",\"type\":\"scale\",\"label\":\"Load\",\"config\":{\"scale_min\":0,\"scale_max\":4,\"min_label\":\"low\"}},{\"id\":\"${E9}\",\"type\":\"short\",\"label\":\"Why b?\",\"required\":true}]"
TE=$(psql -d "${DB}" -X -A -t -q -c "select set_config('test.uid','${PAUL}',false);" -c "select public.tf_save_form(null, '{\"title\":\"Engine form (fake)\"}'::jsonb, '${TEQ}'::jsonb)" 2>&1 | tail -1 | tr -d ' \n')
chk "存得了十三題（新題型、換頁、說明沒有題目字）" "13|2" "select count(*)||'|'||count(*) filter (where label = '') from public.tf_questions where form_id='${TE}'"
chk "★ 新題目照前端給的 id 存（條件邏輯指得到它）" "13" "select count(*) from public.tf_questions where form_id='${TE}' and id::text like 'cccccccc-0000-4000-8000-%'"
chk "條件邏輯存起來了，指向第 13 題" "show|${E9}" "select (logic->0->>'do')||'|'||(logic->0->>'target') from public.tf_questions where id='${E6}'"
chk "分數題只給 config，舊欄位跟著寫（0 到 4）" "0|4|low|4" "select scale_min||'|'||scale_max||'|'||min_label||'|'||(config->>'scale_max') from public.tf_questions where id='${ES}'"
chk "排版區塊一律不是必填" "0" "select count(*) from public.tf_questions where form_id='${TE}' and type in ('heading','text','page') and required"
chkraise "下拉只有一個選項存不了（need_options）" "need_options:1" "perform set_config('test.uid','${PAUL}',true); perform public.tf_save_form(null, '{\"title\":\"x\"}'::jsonb, '[{\"type\":\"dropdown\",\"label\":\"a\",\"options\":[\"only\"]}]'::jsonb);"
chkraise "★ 內部表單不收上傳檔案（bad_question_type）" "bad_question_type:1" "perform set_config('test.uid','${PAUL}',true); perform public.tf_save_form(null, '{\"title\":\"x\"}'::jsonb, '[{\"type\":\"file\",\"label\":\"cv\"}]'::jsonb);"
chkraise "收答案的題沒有題目字存不了（need_question_label）" "need_question_label:1" "perform set_config('test.uid','${PAUL}',true); perform public.tf_save_form(null, '{\"title\":\"x\"}'::jsonb, '[{\"type\":\"email\",\"label\":\"\"}]'::jsonb);"
chkraise "同一份清單裡同一個 id 兩次擋（duplicate_question）" "duplicate_question:2" "perform set_config('test.uid','${PAUL}',true); perform public.tf_save_form(null, '{\"title\":\"x\"}'::jsonb, '[{\"id\":\"dddddddd-0000-4000-8000-000000000001\",\"type\":\"short\",\"label\":\"a\"},{\"id\":\"dddddddd-0000-4000-8000-000000000001\",\"type\":\"short\",\"label\":\"b\"}]'::jsonb);"
TEX=$(psql -d "${DB}" -X -A -t -q -c "select set_config('test.uid','${PAUL}',false);" -c "select public.tf_save_form(null, '{\"title\":\"Copy (fake)\"}'::jsonb, '[{\"id\":\"${E1}\",\"type\":\"short\",\"label\":\"steal\"}]'::jsonb)" 2>&1 | tail -1 | tr -d ' \n')
chk "★ 別份表單已經用掉的 id 不會被搶走（拿一個新的），原本那題沒被改" "1|0|Email|email" "select (select count(*) from public.tf_questions where form_id='${TEX}')||'|'||(select count(*) from public.tf_questions where form_id='${TEX}' and id='${E1}')||'|'||(select label||'|'||type from public.tf_questions where id='${E1}')"
chkas "${PAUL}" "給 Marketing Team 並打開" "open" "select public.tf_set_audience('${TE}','recipient','[{\"kind\":\"team\",\"value\":\"Marketing Team\"}]'::jsonb); select public.tf_set_status('${TE}','open')"
chkas "${MKE}" "填的頁拿得到 config 與 logic" "true|show|4" "select (x->'questions'->0 ? 'config')::text||'|'||(x#>>'{questions,5,logic,0,do}')||'|'||(x#>>'{questions,11,config,scale_max}') from (select public.tf_fill('${TE}') x) t"
OK1="\"${E1}\":\"a@example.com\",\"${E5}\":\"yes\""
chkraise "★ email 格式不對送不了（bad_answer）" "bad_answer:1" "perform set_config('test.uid','${MKE}',true); perform public.tf_submit('${TE}', '{\"${E1}\":\"not-an-email\",\"${E5}\":\"yes\"}'::jsonb);"
chkraise "★ 電話不是電話送不了" "bad_answer:2" "perform set_config('test.uid','${MKE}',true); perform public.tf_submit('${TE}', '{${OK1},\"${E2}\":\"call me\"}'::jsonb);"
chkraise "★ 數字題寫字送不了" "bad_answer:3" "perform set_config('test.uid','${MKE}',true); perform public.tf_submit('${TE}', '{${OK1},\"${E3}\":\"seven\"}'::jsonb);"
chkraise "★ 數字超出題目設的範圍送不了" "bad_answer:3" "perform set_config('test.uid','${MKE}',true); perform public.tf_submit('${TE}', '{${OK1},\"${E3}\":\"20\"}'::jsonb);"
chkraise "★ 不存在的日期送不了" "bad_answer:4" "perform set_config('test.uid','${MKE}',true); perform public.tf_submit('${TE}', '{${OK1},\"${E4}\":\"2026-13-40\"}'::jsonb);"
chkraise "★ 同意題只收 yes" "bad_answer:5" "perform set_config('test.uid','${MKE}',true); perform public.tf_submit('${TE}', '{\"${E1}\":\"a@example.com\",\"${E5}\":\"no\"}'::jsonb);"
chkraise "★ 下拉選項外的答案送不了（下拉沒有「其他」）" "bad_option:6" "perform set_config('test.uid','${MKE}',true); perform public.tf_submit('${TE}', '{${OK1},\"${E6}\":\"zzz\"}'::jsonb);"
chkraise "★ 多選沒開「其他」，選項外的字送不了" "bad_option:11" "perform set_config('test.uid','${MKE}',true); perform public.tf_submit('${TE}', '{${OK1},\"${E8}\":[\"m\",\"zzz\"]}'::jsonb);"
chkraise "★ 開了「其他」的單選，不收 __other__ 這個記號本身" "bad_option:10" "perform set_config('test.uid','${MKE}',true); perform public.tf_submit('${TE}', '{${OK1},\"${E7}\":\"__other__\"}'::jsonb);"
chkraise "★ 沒有規則影響的必填照擋（required）" "required:1" "perform set_config('test.uid','${MKE}',true); perform public.tf_submit('${TE}', '{\"${E5}\":\"yes\"}'::jsonb);"
chkraise "★ 必填的同意題沒勾照擋" "required:5" "perform set_config('test.uid','${MKE}',true); perform public.tf_submit('${TE}', '{\"${E1}\":\"a@example.com\"}'::jsonb);"
chkraise "★ 不在名單上的人送不了（not_for_you）" "not_for_you" "perform set_config('test.uid','${RQR}',true); perform public.tf_submit('${TE}', '{${OK1}}'::jsonb);"
chkas "${MKE}" "★ 被規則影響的必填（第 13 題）沒填照樣送得出去；「其他」自己寫的收" "1" "select count(*) from (select public.tf_submit('${TE}', '{${OK1},\"${E2}\":\"+886 912 345 678\",\"${E3}\":\"7\",\"${E4}\":\"2026-11-20\",\"${E6}\":\"a\",\"${E7}\":\"my own words\",\"${E8}\":[\"n\",\"m\"],\"${ES}\":\"3\",\"${EP}\":\"x\",\"${EH}\":\"x\",\"${ET}\":\"x\"}'::jsonb)) x"
chk "存下來的答案：「其他」的字、多選照選項順序、數字與分數" "myownwords|m,n|7|3" "select replace((select value from public.tf_answers where question_id='${E7}'),' ','')||'|'||(select replace(value,E'\n',',') from public.tf_answers where question_id='${E8}')||'|'||(select value from public.tf_answers where question_id='${E3}')||'|'||(select value from public.tf_answers where question_id='${ES}')"
chk "★ 小標題、說明、換頁送來的值不存" "0|9" "select (select count(*) from public.tf_answers where question_id in ('${EP}','${EH}','${ET}'))||'|'||(select count(*) from public.tf_answers a join public.tf_responses r on r.id=a.response_id where r.form_id='${TE}')"
chkraise "★ 填過就不能再送（already_submitted）" "already_submitted" "perform set_config('test.uid','${MKE}',true); perform public.tf_submit('${TE}', '{${OK1}}'::jsonb);"
chkas "${PAUL}" "結果頁的題目帶 config，答案拿得到" "true|a@example.com" "select (r->'questions'->0 ? 'config')::text||'|'||(r#>>'{responses,0,answers,${E1}}') from (select public.tf_results('${TE}') r) t"
chkraise "★ 有人答過的題目不能換題型（question_type_locked）" "question_type_locked:1" "perform set_config('test.uid','${PAUL}',true); perform public.tf_save_form('${TE}', '{}'::jsonb, '[{\"id\":\"${E1}\",\"type\":\"short\",\"label\":\"Email\"}]'::jsonb);"
chkraise "★ 有人答過的題目刪不了（question_has_answers）" "question_has_answers" "perform set_config('test.uid','${PAUL}',true); perform public.tf_save_form('${TE}', '{}'::jsonb, '[{\"id\":\"${E1}\",\"type\":\"email\",\"label\":\"Email\",\"required\":true}]'::jsonb);"
chkraise "★ 名單上但不是編輯的人改不了表單（not_form_editor）" "not_form_editor" "perform set_config('test.uid','${MKE}',true); perform public.tf_save_form('${TE}', '{\"title\":\"hijack\"}'::jsonb, null);"
chkas "${PAUL}" "改字、把第 13 題改成至少寫 5 個字可以，答案還在" "Youremail|9" "select count(*) from (select public.tf_save_form('${TE}', '{}'::jsonb, (select jsonb_agg(case when e->>'id'='${E1}' then e || '{\"label\":\"Your email\"}'::jsonb when e->>'id'='${E9}' then e || '{\"config\":{\"min_len\":5}}'::jsonb else e end) from jsonb_array_elements('${TEQ}'::jsonb) e))) x; select (select label from public.tf_questions where id='${E1}')||'|'||(select count(*) from public.tf_answers a join public.tf_responses r on r.id=a.response_id where r.form_id='${TE}')"
chkraise "第 13 題有最少字數：有寫就照驗，太短送不了（bad_answer）" "bad_answer:13" "perform set_config('test.uid','${MKM}',true); perform public.tf_submit('${TE}', '{${OK1},\"${E9}\":\"no\"}'::jsonb);"
BROKEN=$(mktemp)
sed "/if not public.tf_is_recipient(p_form) then raise exception 'not_for_you'/d" supabase/migrations/2026-12-23-team-forms-engine.sql > "${BROKEN}"
bk=$(psql -d "${DB}" -X -A -t -q -f "${BROKEN}" 2>&1 || true)
if echo "${bk}" | grep -q "OVERALL.*FAIL"; then echo "  ok   ★ 破壞測試：送出拿掉「只有名單上的人送得了」，驗收表變紅"; pass=$((pass+1)); else echo "  FAIL 拿掉填的人門驗收表沒變紅"; fail=$((fail+1)); fi
sed "/q.type = 'email' and s !~/d" supabase/migrations/2026-12-23-team-forms-engine.sql > "${BROKEN}"
bk=$(psql -d "${DB}" -X -A -t -q -f "${BROKEN}" 2>&1 || true)
if echo "${bk}" | grep -q "OVERALL.*FAIL"; then echo "  ok   ★ 破壞測試：拿掉 email 格式的檢查，驗收表變紅"; pass=$((pass+1)); else echo "  FAIL 拿掉 email 檢查驗收表沒變紅"; fail=$((fail+1)); fi
sed "/raise exception 'question_type_locked:%'/d" supabase/migrations/2026-12-23-team-forms-engine.sql > "${BROKEN}"
bk=$(psql -d "${DB}" -X -A -t -q -f "${BROKEN}" 2>&1 || true)
if echo "${bk}" | grep -q "OVERALL.*FAIL"; then echo "  ok   ★ 破壞測試：拿掉「答過的題不能換題型」，驗收表變紅"; pass=$((pass+1)); else echo "  FAIL 拿掉換題型的鎖驗收表沒變紅"; fail=$((fail+1)); fi
sed "/^        if v_want is not null and not exists/s/not exists (select 1 from public.tf_questions x where x.id = v_want)/true/" supabase/migrations/2026-12-23-team-forms-engine.sql > "${BROKEN}"
bk=$(psql -d "${DB}" -X -A -t -q -f "${BROKEN}" 2>&1 || true)
if echo "${bk}" | grep -q "OVERALL.*FAIL"; then echo "  ok   ★ 破壞測試：前端給的 id 不管有沒有人用過都照用，驗收表變紅"; pass=$((pass+1)); else echo "  FAIL 拿掉 id 撞號檢查驗收表沒變紅"; fail=$((fail+1)); fi
rm -f "${BROKEN}"
tfe3=$(psql -d "${DB}" -X -A -t -q -v ON_ERROR_STOP=1 -f supabase/migrations/2026-12-23-team-forms-engine.sql 2>&1 || true)
if echo "${tfe3}" | grep -q "OVERALL.*PASS"; then echo "  ok   破壞測試之後裝回正確的那一版"; pass=$((pass+1)); else echo "  FAIL 裝回正確版沒過"; echo "${tfe3}" | head -5; fail=$((fail+1)); fi
chkraise "裝回之後，不在名單上的人又送不了" "not_for_you" "perform set_config('test.uid','${RQR}',true); perform public.tf_submit('${TE}', '{${OK1}}'::jsonb);"
chkraise "裝回之後，email 格式又有驗" "bad_answer:1" "perform set_config('test.uid','${MKM}',true); perform public.tf_submit('${TE}', '{\"${E1}\":\"nope\",\"${E5}\":\"yes\"}'::jsonb);"
echo "── 回饋表換上表單引擎（2026-12-24-feedback-engine.sql）──"
# 這時候：DIR 管 winter-camp-2027（RCEV）那場活動、OUTC 是沒指派的 Mentorship 幹部、STU 是學生、RCF 是那場的匿名回饋表（RQ1 是它的分數題）。資料全是假的。
FBA0=$(psql -d "${DB}" -X -A -t -q -c "select (select count(*) from public.rc_questions)||'|'||(select count(*) from public.rc_answers)" | tr -d ' \n')
fbe=$(psql -d "${DB}" -X -A -t -q -v ON_ERROR_STOP=1 -f supabase/migrations/2026-12-24-feedback-engine.sql 2>&1 || true)
if echo "${fbe}" | grep -q "OVERALL.*PASS" && ! echo "${fbe}" | grep -q "|FAIL"; then echo "  ok   回饋表引擎那支驗收表全 PASS"; pass=$((pass+1)); else echo "  FAIL 回饋表引擎那支驗收表："; echo "${fbe}" | head -25; fail=$((fail+1)); fi
fbe2=$(psql -d "${DB}" -X -A -t -q -v ON_ERROR_STOP=1 -f supabase/migrations/2026-12-24-feedback-engine.sql 2>&1 || true)
if echo "${fbe2}" | grep -q "OVERALL.*PASS" && ! echo "${fbe2}" | grep -q "|FAIL"; then echo "  ok   回饋表引擎那支可以重跑"; pass=$((pass+1)); else echo "  FAIL 回饋表引擎那支重跑沒過"; echo "${fbe2}" | head -10; fail=$((fail+1)); fi
chk "重跑不動既有的題目與答案" "${FBA0}" "select (select count(*) from public.rc_questions)||'|'||(select count(*) from public.rc_answers)"
chk "既有的分數題：config 補上兩端，跟舊欄位一樣" "1|5|1|5" "select scale_min||'|'||scale_max||'|'||(config->>'scale_min')||'|'||(config->>'scale_max') from public.rc_questions where id='${RQ1}'"
# 一份有換頁、條件邏輯、新題型的表單（具名的，因為裡面有 email 題）。id 是前端產的（瀏覽器的 crypto.randomUUID），資料庫照用。
G1=dddddddd-0000-4000-8000-000000000001; G2=dddddddd-0000-4000-8000-000000000002; G3=dddddddd-0000-4000-8000-000000000003
GP=dddddddd-0000-4000-8000-000000000004; GH=dddddddd-0000-4000-8000-000000000005; GT=dddddddd-0000-4000-8000-000000000006
G4=dddddddd-0000-4000-8000-000000000007; G5=dddddddd-0000-4000-8000-000000000008; G6=dddddddd-0000-4000-8000-000000000009
G7=dddddddd-0000-4000-8000-000000000010; G8=dddddddd-0000-4000-8000-000000000011; G9=dddddddd-0000-4000-8000-000000000012
FBQ="[{\"id\":\"${G1}\",\"key\":\"recommend\",\"type\":\"scale\",\"label\":\"Recommend?\",\"required\":true,\"config\":{\"scale_min\":0,\"scale_max\":10}},{\"id\":\"${G2}\",\"type\":\"single\",\"label\":\"Again?\",\"required\":true,\"options\":[\"Yes\",\"No\"],\"config\":{\"other\":true},\"logic\":[{\"match\":\"all\",\"when\":[{\"q\":\"${G2}\",\"op\":\"is\",\"v\":\"No\"}],\"do\":\"show\",\"target\":\"${G3}\"}]},{\"id\":\"${G3}\",\"type\":\"long\",\"label\":\"Why not?\",\"required\":true},{\"id\":\"${GP}\",\"type\":\"page\",\"label\":\"\",\"required\":true},{\"id\":\"${GH}\",\"key\":\"part_two\",\"type\":\"heading\",\"label\":\"Part two\"},{\"id\":\"${GT}\",\"type\":\"text\",\"label\":\"\"},{\"id\":\"${G4}\",\"type\":\"email\",\"label\":\"Email\"},{\"id\":\"${G5}\",\"type\":\"number\",\"label\":\"Hours\",\"config\":{\"min\":1,\"max\":10}},{\"id\":\"${G6}\",\"type\":\"date\",\"label\":\"When\"},{\"id\":\"${G7}\",\"type\":\"dropdown\",\"label\":\"Heard from\",\"options\":[\"IG\",\"Friend\"]},{\"id\":\"${G8}\",\"type\":\"consent\",\"label\":\"I agree\",\"required\":true},{\"id\":\"${G9}\",\"type\":\"multi\",\"label\":\"Tags\",\"options\":[\"m\",\"n\"]}]"
FBF=$(psql -d "${DB}" -X -A -t -q -c "select set_config('test.uid','${DIR}',false);" -c "select public.rc_save_form(null, '{\"title\":\"Engine feedback (fake)\",\"event_id\":\"${RCEV}\",\"anonymous\":false}'::jsonb, '${FBQ}'::jsonb)" 2>&1 | tail -1 | tr -d ' \n')
chk "★ 新建：十二題、前端給的 id 照用、換頁與一段說明可以沒有題目字" "12|${G1}|${GT}" "select (select count(*) from public.rc_questions where form_id='${FBF}')||'|'||(select id from public.rc_questions where form_id='${FBF}' and ord=1)||'|'||(select id from public.rc_questions where form_id='${FBF}' and ord=6 and label='')"
chk "分數題的兩端同時寫進 config 與舊欄位（0 到 10）" "0|10|0|10" "select scale_min||'|'||scale_max||'|'||(config->>'scale_min')||'|'||(config->>'scale_max') from public.rc_questions where id='${G1}'"
chk "排版區塊不是必填、沒有代號；非分數題 config 裡沒有分數兩端" "0|0" "select (select count(*) from public.rc_questions where form_id='${FBF}' and type in ('heading','text','page') and (required or key is not null))||'|'||(select count(*) from public.rc_questions where form_id='${FBF}' and type <> 'scale' and config ? 'scale_min')"
chkas "${DIR}" "★ 拿別份表單的題目 id 來存：那個 id 不給，別份表單的題還在原處" "true|true" "select public.rc_save_form(null, '{\"title\":\"Steal (fake)\",\"event_id\":\"${RCEV}\"}'::jsonb, '[{\"id\":\"${RQ1}\",\"type\":\"short\",\"label\":\"x\"}]'::jsonb); select (select q.id <> '${RQ1}' from public.rc_questions q join public.rc_forms f on f.id=q.form_id where f.title='Steal (fake)')||'|'||(select form_id='${RCF}' from public.rc_questions where id='${RQ1}')"
chkraise "★ 沒指派的幹部改不了題目（not_form_editor）" "not_form_editor" "perform set_config('test.uid','${OUTC}',true); perform public.rc_save_form('${FBF}', '{}'::jsonb, '[]'::jsonb);"
chkraise "★ 學生改不了題目（not_form_editor）" "not_form_editor" "perform set_config('test.uid','${STU}',true); perform public.rc_save_form('${FBF}', '{}'::jsonb, '[]'::jsonb);"
angot=$(psql -d "${DB}" -X -A -t -q -c "set role anon; select public.rc_save_form('${FBF}', '{}'::jsonb, '[]'::jsonb);" 2>&1 || true)
if echo "${angot}" | grep -qi "permission denied"; then echo "  ok   ★ 沒登入的人叫不到 rc_save_form"; pass=$((pass+1)); else echo "  FAIL anon 叫得到 rc_save_form：${angot}"; fail=$((fail+1)); fi
chkraise "上傳檔案不收（bad_question_type）" "bad_question_type:1" "perform set_config('test.uid','${DIR}',true); perform public.rc_save_form('${FBF}', '{}'::jsonb, '[{\"type\":\"file\",\"label\":\"CV\"}]'::jsonb);"
chkraise "小標題要有題目字（need_question_label）" "need_question_label:1" "perform set_config('test.uid','${DIR}',true); perform public.rc_save_form('${FBF}', '{}'::jsonb, '[{\"type\":\"heading\",\"label\":\"\"}]'::jsonb);"
chkraise "下拉至少兩個選項（need_options）" "need_options:1" "perform set_config('test.uid','${DIR}',true); perform public.rc_save_form('${FBF}', '{}'::jsonb, '[{\"type\":\"dropdown\",\"label\":\"x\",\"options\":[\"a\"]}]'::jsonb);"
chkraise "★ 匿名的表單不能有 email 題（把有 email 題的表單改成匿名被擋，anon_contact_q）" "anon_contact_q" "perform set_config('test.uid','${DIR}',true); perform public.rc_save_form('${FBF}', '{\"anonymous\":true}'::jsonb, null);"
chkraise "★ 匿名的表單加不了電話題（anon_contact_q）" "anon_contact_q" "perform set_config('test.uid','${DIR}',true); perform public.rc_save_form('${RCF}', '{}'::jsonb, (select jsonb_agg(x) from (select jsonb_build_object('id', id, 'key', coalesce(key, ''), 'type', type, 'label', label, 'options', to_jsonb(options), 'scale_min', scale_min, 'scale_max', scale_max) x from public.rc_questions where form_id='${RCF}' union all select '{\"type\":\"phone\",\"label\":\"Phone\"}'::jsonb) t));"
chk "被擋的那兩次什麼都沒改（還是具名、RCF 還是五題）" "false|5" "select (select anonymous from public.rc_forms where id='${FBF}')||'|'||(select count(*) from public.rc_questions where form_id='${RCF}')"
FBTOK=$(psql -d "${DB}" -X -A -t -q -c "select token from public.rc_forms where id='${FBF}'" | tr -d ' \n')
chkrole anon "" "★ 草稿沒登入的人拿不到，也送不進" "true" "select (public.rc_public_form('${FBTOK}') is null)::text"
chkraise "★ 草稿送不進（form_closed）" "form_closed" "perform public.rc_public_submit('${FBTOK}', '{}'::jsonb, '{}'::jsonb);"
chkas "${DIR}" "打開" "open" "select public.rc_set_status('${FBF}','open')"
chkrole anon "" "★ 填寫頁拿得到 config 與條件邏輯，沒有別人的答案" "true|1|10|false" "select (x#>>'{questions,1,config,other}')||'|'||jsonb_array_length(x#>'{questions,1,logic}')||'|'||(x#>>'{questions,0,config,scale_max}')||'|'||(x ? 'responses') from (select public.rc_public_form('${FBTOK}') x) t"
FBOK="\"${G1}\":7,\"${G2}\":\"Yes\",\"${G8}\":\"yes\""
chkraise "不被規則影響的必填照擋：分數題沒填（required:1）" "required:1" "perform public.rc_public_submit('${FBTOK}', '{\"${G8}\":\"yes\",\"${G2}\":\"Yes\"}'::jsonb, '{}'::jsonb);"
chkraise "同意題沒勾照擋（required:11）" "required:11" "perform public.rc_public_submit('${FBTOK}', '{\"${G1}\":7,\"${G2}\":\"Yes\"}'::jsonb, '{}'::jsonb);"
chkraise "同意題只收 yes（bad_answer:11）" "bad_answer:11" "perform public.rc_public_submit('${FBTOK}', '{\"${G1}\":7,\"${G2}\":\"Yes\",\"${G8}\":\"no\"}'::jsonb, '{}'::jsonb);"
chkraise "分數超出 0 到 10（bad_scale_value:1）" "bad_scale_value:1" "perform public.rc_public_submit('${FBTOK}', '{${FBOK},\"${G1}\":11}'::jsonb, '{}'::jsonb);"
chkraise "★ email 格式錯（bad_answer:7）" "bad_answer:7" "perform public.rc_public_submit('${FBTOK}', '{${FBOK},\"${G4}\":\"nope\"}'::jsonb, '{}'::jsonb);"
chkraise "數字超出範圍（bad_answer:8）" "bad_answer:8" "perform public.rc_public_submit('${FBTOK}', '{${FBOK},\"${G5}\":\"11\"}'::jsonb, '{}'::jsonb);"
chkraise "不存在的日期（bad_answer:9）" "bad_answer:9" "perform public.rc_public_submit('${FBTOK}', '{${FBOK},\"${G6}\":\"2027-02-30\"}'::jsonb, '{}'::jsonb);"
chkraise "下拉不在選項裡（bad_option:10）" "bad_option:10" "perform public.rc_public_submit('${FBTOK}', '{${FBOK},\"${G7}\":\"TV\"}'::jsonb, '{}'::jsonb);"
chkraise "★ 多選沒開「其他」就不收選項以外的字（bad_option:12）" "bad_option:12" "perform public.rc_public_submit('${FBTOK}', '{${FBOK},\"${G9}\":[\"m\",\"zzz\"]}'::jsonb, '{}'::jsonb);"
chkraise "「其他」的代號本身不收（bad_option:2）" "bad_option:2" "perform public.rc_public_submit('${FBTOK}', '{${FBOK},\"${G2}\":\"__other__\"}'::jsonb, '{}'::jsonb);"
chkrole anon "" "★ 被規則影響的必填（Why not? 是 show 規則的目標）伺服器不擋；排版區塊送了也不存" "1" "select count(*) from (select public.rc_public_submit('${FBTOK}', '{${FBOK},\"${G2}\":\"Yes\",\"${GH}\":\"junk\",\"${GT}\":\"junk\",\"${G4}\":\"stu-x@example.com\",\"${G5}\":\"4\",\"${G6}\":\"2027-01-30\",\"${G7}\":\"IG\",\"${G9}\":\"n\\nm\"}'::jsonb, '{\"age_band\":\"under18\"}'::jsonb)) x"
chkrole anon "" "★ 單選開了「其他」就收自己寫的字" "1" "select count(*) from (select public.rc_public_submit('${FBTOK}', '{${FBOK},\"${G2}\":\"Maybe next year\"}'::jsonb, '{}'::jsonb)) x"
chk "存下來的：排版區塊零格、多選照選項順序、「其他」原字" "0|m,n|Maybenextyear" "select (select count(*) from public.rc_answers a join public.rc_responses r on r.id=a.response_id where r.form_id='${FBF}' and a.question_id in ('${GH}','${GT}','${GP}'))||'|'||(select replace(value, E'\n', ',') from public.rc_answers where question_id='${G9}')||'|'||(select replace(value,' ','') from public.rc_answers where question_id='${G2}' and value like 'Maybe%')"
chkraise "★ 沒指派的幹部看不到這份的答案（not_form_reader）" "not_form_reader" "perform set_config('test.uid','${OUTC}',true); perform public.rc_results('${FBF}');"
chkraise "★ 學生看不到這份的答案（not_form_reader）" "not_form_reader" "perform set_config('test.uid','${STU}',true); perform public.rc_results('${FBF}');"
angot=$(psql -d "${DB}" -X -A -t -q -c "set role anon; select public.rc_results('${FBF}');" 2>&1 || true)
if echo "${angot}" | grep -qi "permission denied"; then echo "  ok   ★ 沒登入的人還是叫不到 rc_results"; pass=$((pass+1)); else echo "  FAIL anon 叫得到 rc_results：${angot}"; fail=$((fail+1)); fi
chkas "${DIR}" "活動的人看得到兩份，後台的題目也多 config 與條件邏輯" "2|true|1" "select jsonb_array_length(r->'responses')||'|'||(r#>>'{questions,1,config,other}')||'|'||jsonb_array_length(r#>'{questions,1,logic}') from (select public.rc_results('${FBF}') r) t"
chkraise "★ 有人答過的題不能換題型（question_type_locked）" "question_type_locked" "perform set_config('test.uid','${DIR}',true); perform public.rc_save_form('${FBF}', '{}'::jsonb, '[{\"id\":\"${G1}\",\"type\":\"short\",\"label\":\"Recommend?\"}]'::jsonb);"
BROKEN=$(mktemp)
sed "s/        elsif exists (select 1 from public.rc_questions x where x.id = v_want) then/        elsif false then/" supabase/migrations/2026-12-24-feedback-engine.sql > "${BROKEN}"
bk=$(psql -d "${DB}" -X -A -t -q -f "${BROKEN}" 2>&1 || true)
if echo "${bk}" | grep -q "OVERALL.*FAIL"; then echo "  ok   ★ 破壞測試：拿掉「別份表單的題目 id 不給用」，驗收表變紅"; pass=$((pass+1)); else echo "  FAIL 拿掉題目 id 檢查驗收表沒變紅"; fail=$((fail+1)); fi
sed "/if not public.rc_form_editor(p_form) then raise exception 'not_form_editor'/d" supabase/migrations/2026-12-24-feedback-engine.sql > "${BROKEN}"
bk=$(psql -d "${DB}" -X -A -t -q -f "${BROKEN}" 2>&1 || true)
if echo "${bk}" | grep -q "OVERALL.*FAIL"; then echo "  ok   ★ 破壞測試：拿掉 rc_save_form 的改得動那道門，驗收表變紅"; pass=$((pass+1)); else echo "  FAIL 拿掉改得動的門驗收表沒變紅"; fail=$((fail+1)); fi
sed "s/x.type in ('email', 'phone')) then/x.type in ('nothing')) then/" supabase/migrations/2026-12-24-feedback-engine.sql > "${BROKEN}"
bk=$(psql -d "${DB}" -X -A -t -q -f "${BROKEN}" 2>&1 || true)
if echo "${bk}" | grep -q "OVERALL.*FAIL"; then echo "  ok   ★ 破壞測試：匿名表單又收得了 email 題，驗收表變紅"; pass=$((pass+1)); else echo "  FAIL 拿掉匿名不收 email 題驗收表沒變紅"; fail=$((fail+1)); fi
sed "/q.type = 'email' and s !~/d" supabase/migrations/2026-12-24-feedback-engine.sql > "${BROKEN}"
bk=$(psql -d "${DB}" -X -A -t -q -f "${BROKEN}" 2>&1 || true)
if echo "${bk}" | grep -q "OVERALL.*FAIL"; then echo "  ok   ★ 破壞測試：拿掉 email 格式檢查，驗收表變紅"; pass=$((pass+1)); else echo "  FAIL 拿掉 email 格式檢查驗收表沒變紅"; fail=$((fail+1)); fi
rm -f "${BROKEN}"
fbe3=$(psql -d "${DB}" -X -A -t -q -v ON_ERROR_STOP=1 -f supabase/migrations/2026-12-24-feedback-engine.sql 2>&1 || true)
if echo "${fbe3}" | grep -q "OVERALL.*PASS" && ! echo "${fbe3}" | grep -q "|FAIL"; then echo "  ok   裝回正確版，驗收表又全 PASS"; pass=$((pass+1)); else echo "  FAIL 裝回之後驗收表沒過"; fail=$((fail+1)); fi
chkraise "裝回之後，沒指派的幹部又改不了題目" "not_form_editor" "perform set_config('test.uid','${OUTC}',true); perform public.rc_save_form('${FBF}', '{}'::jsonb, '[]'::jsonb);"
chkraise "裝回之後，email 格式又有驗" "bad_answer:7" "perform public.rc_public_submit('${FBTOK}', '{${FBOK},\"${G4}\":\"nope\"}'::jsonb, '{}'::jsonb);"
chkraise "裝回之後，匿名的表單又不收 email 題" "anon_contact_q" "perform set_config('test.uid','${DIR}',true); perform public.rc_save_form('${FBF}', '{\"anonymous\":true}'::jsonb, null);"
echo "── 權限三級制：看／改／管到處一樣、team 改得了活動與會、錢可以派（2026-12-25-access-model.sql）──"
AMT=77770000-0000-0000-0000-0000000000a1; AMV=77770000-0000-0000-0000-0000000000a2; AMX=77770000-0000-0000-0000-0000000000a3
AMSA=77770000-0000-0000-0000-0000000000a4; AMM=77770000-0000-0000-0000-0000000000a5; AMO=77770000-0000-0000-0000-0000000000a6
AMTEAM=$(psql -d "${DB}" -X -A -t -q -c "select team from public.workspaces where kind='res' and team is not null order by id limit 1" | tr -d '\n')
psql -d "${DB}" -X -A -t -q -v ON_ERROR_STOP=1 <<SQL 2>&1 | grep -i "error" || true
insert into auth.users (id,email) values ('${AMT}','amt@example.com'),('${AMV}','amv@example.com'),('${AMX}','amx@example.com'),('${AMSA}','amsa@example.com'),('${AMM}','amm@example.com'),('${AMO}','amo@example.com') on conflict do nothing;
insert into public.profiles (id,name_zh,role,board_role) values ('${AMT}','三級改','cadre','member'),('${AMV}','三級看','cadre','member'),('${AMX}','三級無','cadre','member'),('${AMSA}','三級顧問','cadre','senior_adviser'),('${AMM}','三級錢','cadre','member'),('${AMO}','三級擁有','cadre','member') on conflict (id) do update set role=excluded.role, board_role=excluded.board_role;
insert into public.assignments (user_id,workspace_id,level) values ('${AMT}','res:${AMTEAM}','edit'),('${AMV}','res:${AMTEAM}','view'),('${AMV}','custom:records','view'),('${AMV}','custom:team-forms','view') on conflict (user_id,workspace_id) do update set level=excluded.level;
-- 跑遷移之前就是擁有人、沒有指派的人（舊的形狀）
insert into public.workspaces (id,kind,title_zh,title_en,owner) values ('custom:am-owned','custom','舊擁有','Old owned','${AMO}') on conflict (id) do update set owner=excluded.owner;
delete from public.assignments where workspace_id='custom:am-owned';
SQL
amx=$(psql -d "${DB}" -X -A -t -q -v ON_ERROR_STOP=1 -f supabase/migrations/2026-12-25-access-model.sql 2>&1 || true)
if echo "${amx}" | grep -q "OVERALL.*PASS" && ! echo "${amx}" | grep -q "|FAIL"; then echo "  ok   權限三級制那支驗收表全 PASS"; pass=$((pass+1)); else echo "  FAIL 權限三級制那支驗收表："; echo "${amx}" | head -30; fail=$((fail+1)); fi
amx2=$(psql -d "${DB}" -X -A -t -q -v ON_ERROR_STOP=1 -f supabase/migrations/2026-12-25-access-model.sql 2>&1 || true)
if echo "${amx2}" | grep -q "OVERALL.*PASS"; then echo "  ok   權限三級制那支重跑一次也全 PASS"; pass=$((pass+1)); else echo "  FAIL 權限三級制重跑：${amx2}" | head -5; fail=$((fail+1)); fi
chk "（前提）有一個 team：${AMTEAM}" "t" "select (length('${AMTEAM}') > 0)::text::char(1)"
# team：改 = 開活動、排會
chkas "${AMT}" "★ team 是「改」就開得了這個 team 的活動（以前要「管」）" "1" "select count(*) from (select public.create_event('${AMTEAM}','am-ev-t','三級測試活動','Access test event',false)) x"
chkraise "★ team 是「看」開不了活動" "not_team_manager" "perform set_config('test.uid','${AMV}',true); perform public.create_event('${AMTEAM}','am-ev-v','不行','No',false);"
chkas "${AMT}" "★ team 是「改」排得了這個 team 的會" "true" "select public.can_schedule('${AMTEAM}')::text"
chkas "${AMV}" "★ team 是「看」排不了會" "false" "select public.can_schedule('${AMTEAM}')::text"
chkas "${AMT}" "★ 誰都排不了全 board 的會（照舊 senior）" "false" "select public.can_schedule('board')::text"
chkas "${PAUL}" "Co-President 開一場同 team 的活動" "1" "select count(*) from (select public.create_event('${AMTEAM}','am-ev-p','三級測試二','Access test two',false)) x"
chkas "${AMT}" "★ 別人開的同 team 活動：team 是「改」的人對那一場是「改」" "edit|true|false" "select public.ws_my_level('custom:event-am-ev-p')||'|'||public.can_edit('custom:event-am-ev-p')::text||'|'||public.can_manage('custom:event-am-ev-p')::text"
chkas "${AMV}" "★ team 是「看」的人不會因此看得到那一場（報名名單有高中生）" "false" "select public.can_view('custom:event-am-ev-p')::text"
chkas "${AMX}" "★ 不在 team 的幹部對那一場什麼都沒有" "false" "select public.can_view('custom:event-am-ev-p')::text"
chkas "${AMT}" "my_access 帶出那一場（畫面才知道他改得動）" "edit" "select x->>'level' from jsonb_array_elements(public.my_access()->'workspaces') x where x->>'id'='custom:event-am-ev-p'"
chkas "${AMT}" "team 是「改」的人改得動場地" "true" "select public.venue_can_edit()::text"
chkas "${AMX}" "沒有 team 的幹部改不了場地" "false" "select public.venue_can_edit()::text"
chkraise "★ team 是「改」標不了「可以上網站」（那是「管」）" "not_allowed" "perform set_config('test.uid','${AMT}',true); perform public.set_event_ready((select id from public.events where slug='am-ev-p'), true);"
# 紀錄、內部表單：看的人真的只能看
chk "★ 跑遷移前在紀錄與內部表單是「看」的人升成「改」（沒有人少掉今天的權力）" "edit|edit" "select string_agg(level, '|' order by workspace_id) from public.assignments where user_id='${AMV}' and workspace_id in ('custom:records','custom:team-forms')"
psql -d "${DB}" -X -A -t -q -c "update public.assignments set level='view' where user_id='${AMV}' and workspace_id in ('custom:records','custom:team-forms');" 2>&1 | grep -i "error" || true
chkas "${AMV}" "★ 紀錄是「看」：讀得到、改不了" "true|false" "select public.rc_can_view()::text||'|'||public.rc_can_manage()::text"
chkas "${AMV}" "★ 內部表單是「看」：建不了" "false" "select public.tf_can_create()::text"
# 錢
chkas "${AMSA}" "★ Senior Adviser：錢讀得到、記不了" "true|false" "select public.can_view_finance()::text||'|'||public.can_edit_finance()::text"
chkraise "★ Senior Adviser 派不了別人進「錢」" "not_ws_manage" "perform set_config('test.uid','${AMSA}',true); perform public.assign('${AMM}','custom:money','edit');"
chkas "${AMM}" "還沒被派的人讀不到錢" "false" "select public.can_view_finance()::text"
chkas "${PAUL}" "Co-President 把一個人派進「錢」是「改」" "edit" "select public.assign('${AMM}','custom:money','edit')"
chkas "${AMM}" "★ 被派「改」的人記得了錢" "true|true" "select public.can_view_finance()::text||'|'||public.can_edit_finance()::text"
chkas "${AMM}" "my_access 的財務那一格是 edit（選單才畫得出錢）" "edit" "select x->>'level' from jsonb_array_elements(public.my_access()->'workspaces') x where x->>'id'='finance'"
chkraise "★「錢」是「改」的人派不了別人" "not_ws_manage" "perform set_config('test.uid','${AMM}',true); perform public.assign('${AMX}','custom:money','view');"
chkas "${PAUL}" "改成「看」" "view" "select public.assign('${AMM}','custom:money','view')"
chkas "${AMM}" "★「錢」是「看」：讀得到、記不了" "true|false" "select public.can_view_finance()::text||'|'||public.can_edit_finance()::text"
chkas "${PAUL}" "移出「錢」" "true" "select public.unassign('${AMM}','custom:money')::text"
# 擁有人
chk "★ 舊的擁有人被寫成一筆「管」" "manage" "select level from public.assignments where user_id='${AMO}' and workspace_id='custom:am-owned'"
chkas "${PAUL}" "★ 擁有人出現在成員名單上" "1" "select count(*) from public.workspace_members('custom:am-owned') where user_id='${AMO}'"
chkas "${PAUL}" "★ 擁有人移得掉" "true" "select public.unassign('${AMO}','custom:am-owned')::text"
chkas "${AMO}" "★ 移掉之後他就不再是「管」（擁有人那一欄不再帶權力）" "false" "select public.can_manage('custom:am-owned')::text"
chkas "${PAUL}" "新建工作區的擁有人寫成一筆「管」" "manage" "select public.create_workspace('am-new','新的','New','${AMX}'); select level from public.assignments where user_id='${AMX}' and workspace_id='custom:am-new'"
# 行銷核可
chkas "${PAUL}" "（準備）三級改在 Marketing 是「改」" "edit" "select public.assign('${AMT}','res:Marketing Team','edit')"
chkas "${AMT}" "★ Marketing 是「改」：核可不了貼文，改得動歷史之路" "false|true" "select public.mkt_can_approve()::text||'|'||public.can_edit_history()::text"
chkas "${PAUL}" "（準備）升成「管」" "manage" "select public.assign('${AMT}','res:Marketing Team','manage')"
chkas "${AMT}" "★ Marketing 是「管」：核可得了" "true" "select public.mkt_can_approve()::text"
# Senior Adviser 的兩個空頁
chkrole authenticated "${AMSA}" "★ Senior Adviser 讀得到變動紀錄" "t" "select (count(*) > 0)::text::char(1) from public.role_changes"
chkrole authenticated "${AMX}" "★ Associate 還是讀不到變動紀錄" "0" "select count(*) from public.role_changes"
chkas "${AMSA}" "Senior Adviser 叫得到校友故事清單（不再是空的那道門）" "t" "select (count(*) >= 0)::text::char(1) from public.stories_for_review()"
# 破壞測試
BROKEN=$(mktemp)
sed "s/a.user_id = auth.uid() and a.level in ('edit', 'manage')$/a.user_id = auth.uid()/" supabase/migrations/2026-12-25-access-model.sql > "${BROKEN}"
bk=$(psql -d "${DB}" -X -A -t -q -f "${BROKEN}" 2>&1 || true)
if echo "${bk}" | grep -q "OVERALL.*FAIL"; then echo "  ok   ★ 破壞測試：team「看」的人也帶進活動，驗收表變紅"; pass=$((pass+1)); else echo "  FAIL 拿掉只帶改與管驗收表沒變紅"; fail=$((fail+1)); fi
sed "s/coalesce(public.ws_my_level('custom:money') in ('edit', 'manage'), false)/public.is_senior()/" supabase/migrations/2026-12-25-access-model.sql > "${BROKEN}"
bk=$(psql -d "${DB}" -X -A -t -q -f "${BROKEN}" 2>&1 || true)
if echo "${bk}" | grep -q "OVERALL.*FAIL"; then echo "  ok   ★ 破壞測試：Senior Adviser 記得了錢，驗收表變紅"; pass=$((pass+1)); else echo "  FAIL Senior Adviser 記錢驗收表沒變紅"; fail=$((fail+1)); fi
rm -f "${BROKEN}"
amx3=$(psql -d "${DB}" -X -A -t -q -v ON_ERROR_STOP=1 -f supabase/migrations/2026-12-25-access-model.sql 2>&1 || true)
if echo "${amx3}" | grep -q "OVERALL.*PASS" && ! echo "${amx3}" | grep -q "|FAIL"; then echo "  ok   裝回正確版，驗收表又全 PASS"; pass=$((pass+1)); else echo "  FAIL 裝回之後驗收表沒過"; fail=$((fail+1)); fi
chkas "${AMV}" "裝回之後，team 是「看」的人又看不到那一場" "false" "select public.can_view('custom:event-am-ev-p')::text"
chkas "${AMSA}" "裝回之後，Senior Adviser 又記不了錢" "false" "select public.can_edit_finance()::text"
echo "── 工作區 → 專案 → 活動：一個專案好幾場活動、好幾份報名表（2026-12-26-projects.sql）──"
OTEAM=$(psql -d "${DB}" -X -A -t -q -c "select team from public.workspaces where kind='res' and team is not null and team <> '${AMTEAM}' order by id limit 1" | tr -d '\n')
prj=$(psql -d "${DB}" -X -A -t -q -v ON_ERROR_STOP=1 -f supabase/migrations/2026-12-26-projects.sql 2>&1 || true)
if echo "${prj}" | grep -q "OVERALL.*PASS" && ! echo "${prj}" | grep -q "|FAIL"; then echo "  ok   專案那支驗收表全 PASS"; pass=$((pass+1)); else echo "  FAIL 專案那支驗收表："; echo "${prj}" | head -30; fail=$((fail+1)); fi
prj2=$(psql -d "${DB}" -X -A -t -q -v ON_ERROR_STOP=1 -f supabase/migrations/2026-12-26-projects.sql 2>&1 || true)
if echo "${prj2}" | grep -q "OVERALL.*PASS"; then echo "  ok   專案那支重跑一次也全 PASS"; pass=$((pass+1)); else echo "  FAIL 專案重跑：${prj2}" | head -5; fail=$((fail+1)); fi
chk "以前「Add a project or camp」建的變成專案（id 不動）" "project|project" "select string_agg(kind, '|' order by id) from public.workspaces where id in ('custom:am-owned','custom:am-new')"
chk "整個 BT 的工具沒有被轉成專案" "0" "select count(*) from public.workspaces where kind='project' and id in ('custom:records','custom:money','custom:meeting-templates','custom:team-forms','custom:marketing-requests')"
# 開專案
chkas "${AMT}" "★ team 是「改」開得了這個 team 的專案" "project:am-proj" "select public.create_project('${AMTEAM}','am-proj','測試專案','Test project')"
chkas "${AMT}" "開的人是那個專案的「管」" "manage" "select public.ws_my_level('project:am-proj')"
chkraise "★ team 是「看」開不了專案" "not_team_editor" "perform set_config('test.uid','${AMV}',true); perform public.create_project('${AMTEAM}','am-proj-v','不行','No');"
chkraise "★ 只有 Co-President 與 Senior Adviser 開得了整個 BT 的專案" "not_senior" "perform set_config('test.uid','${AMT}',true); perform public.create_project(null,'am-proj-bt','不行','No');"
chkraise "同一個代號不能開兩次" "slug_taken" "perform set_config('test.uid','${PAUL}',true); perform public.create_project('${AMTEAM}','am-proj','重複','Dup');"
chkas "${PAUL}" "Co-President 開一個同 team 的專案" "project:am-proj-p" "select public.create_project('${AMTEAM}','am-proj-p','測試專案二','Test project two')"
chkas "${AMT}" "★ 別人開的同 team 專案：team 是「改」的人是「改」" "edit" "select public.ws_my_level('project:am-proj-p')"
chkas "${AMV}" "★ team 是「看」的人不會因此進專案" "false" "select public.can_view('project:am-proj-p')::text"
chkas "${AMT}" "my_access 帶出那個專案" "edit" "select x->>'level' from jsonb_array_elements(public.my_access()->'workspaces') x where x->>'id'='project:am-proj-p'"
# 活動放進專案
chkas "${AMT}" "★ 把一場活動放進專案" "ok" "select public.set_event_project((select id from public.events where slug='am-ev-p'),'project:am-proj-p'); select 'ok'"
chkas "${PAUL}" "（準備）三級無在專案是「改」" "edit" "select public.assign('${AMX}','project:am-proj-p','edit')"
chkas "${AMX}" "★ 專案是「改」→ 專案裡那場活動也是「改」" "edit" "select public.ws_my_level('custom:event-am-ev-p')"
chkas "${AMX}" "my_access 帶出專案裡那場活動" "edit" "select x->>'level' from jsonb_array_elements(public.my_access()->'workspaces') x where x->>'id'='custom:event-am-ev-p'"
chkas "${PAUL}" "（準備）降成「看」" "view" "select public.assign('${AMX}','project:am-proj-p','view')"
chkas "${AMX}" "★ 專案是「看」→ 看不到活動的報名名單（高中生）" "false" "select public.can_view('custom:event-am-ev-p')::text"
chkas "${PAUL}" "（準備）升回「改」" "edit" "select public.assign('${AMX}','project:am-proj-p','edit')"
chkas "${PAUL}" "（準備）另一個 team 的專案" "project:am-proj-o" "select public.create_project('${OTEAM}','am-proj-o','別隊','Other team')"
chkraise "★ 活動不能放進別的 team 的專案" "other_team" "perform set_config('test.uid','${PAUL}',true); perform public.set_event_project((select id from public.events where slug='am-ev-p'),'project:am-proj-o');"
chkraise "★ 專案只是「看」的人放不進去" "not_ws_edit" "perform set_config('test.uid','${AMV}',true); perform public.set_event_project((select id from public.events where slug='am-ev-t'),'project:am-proj-p');"
psql -d "${DB}" -X -A -t -q -c "insert into public.events (slug,team,workspace_id,title_zh,title_en,source) values ('am-imported','${AMTEAM}','custom:records','舊活動','Old','import') on conflict (slug) do nothing;" 2>&1 | grep -i "error" || true
chkraise "★ 紀錄倒進來的舊活動放不進專案（不然專案的人會拿到整個紀錄）" "not_site_event" "perform set_config('test.uid','${PAUL}',true); perform public.set_event_project((select id from public.events where slug='am-imported'),'project:am-proj-p');"
psql -d "${DB}" -X -A -t -q -c "update public.events set project_id='project:am-proj-p' where slug='am-imported';" 2>&1 | grep -i "error" || true
chkas "${AMX}" "★ 就算舊活動被直接寫進專案，專案的人也拿不到紀錄" "false" "select public.can_edit('custom:records')::text"
psql -d "${DB}" -X -A -t -q -c "update public.events set project_id=null where slug='am-imported';" 2>&1 | grep -i "error" || true
# 專案的報名表
PF1=$(psql -d "${DB}" -X -A -t -q -c "select set_config('test.uid','${AMX}',false);" -c "select public.create_project_form('project:am-proj-p','學生報名')" 2>&1 | tail -1 | tr -d ' \n')
PF2=$(psql -d "${DB}" -X -A -t -q -c "select set_config('test.uid','${AMX}',false);" -c "select public.create_project_form('project:am-proj-p','Mentor 報名')" 2>&1 | tail -1 | tr -d ' \n')
chk "★ 專案是「改」建得了兩份報名表" "2" "select count(*) from public.forms where project_id='project:am-proj-p'"
chkas "${AMX}" "★ 那兩份表單他改得動" "true|true" "select public.form_can_edit('${PF1}')::text||'|'||public.form_can_edit('${PF2}')::text"
chkas "${AMV}" "★ 不在專案的人看不到那兩份表單" "false" "select public.form_can_view('${PF1}')::text"
chkraise "★ 專案只是「看」建不了表單" "not_ws_edit" "perform set_config('test.uid','${AMV}',true); perform public.create_project_form('project:am-proj-p','不行');"
chkas "${AMX}" "專案清單：兩場活動之一、兩份表單" "1|2" "select (select jsonb_array_length(x->'events')||'|'||jsonb_array_length(x->'forms') from jsonb_array_elements(public.projects_list()) x where x->>'id'='project:am-proj-p')"
chkas "${AMV}" "★ 每一位幹部看得到有這個專案，但看不到他看不了的表單" "0" "select (select jsonb_array_length(x->'forms') from jsonb_array_elements(public.projects_list()) x where x->>'id'='project:am-proj-p')"
chkrole anon "${AMX}" "★ 沒登入叫不到專案清單" "ERROR:permissiondeniedforfunctionprojects_list" "select public.projects_list()"
chkas "${AMT}" "★ 專案的「管」才改得了名字" "ok" "select public.update_project('project:am-proj','改名','Renamed',true); select 'ok'"
chkraise "★ 專案只是「改」改不了名字" "not_ws_manage" "perform set_config('test.uid','${AMX}',true); perform public.update_project('project:am-proj-p','x','x',true);"
chkas "${AMT}" "★ 把活動拿出專案" "null" "select public.set_event_project((select id from public.events where slug='am-ev-p'),null); select coalesce(project_id,'null') from public.events where slug='am-ev-p'"
chkas "${AMX}" "拿出來之後專案的人就沒有那場了" "false" "select public.can_view('custom:event-am-ev-p')::text"
# 破壞測試
BROKEN=$(mktemp)
sed "s/ and p_ws like 'custom:event-%'$//" supabase/migrations/2026-12-26-projects.sql > "${BROKEN}"
bk=$(psql -d "${DB}" -X -A -t -q -f "${BROKEN}" 2>&1 || true)
if echo "${bk}" | grep -q "OVERALL.*FAIL"; then echo "  ok   ★ 破壞測試：專案的權限漏到紀錄那邊，驗收表變紅"; pass=$((pass+1)); else echo "  FAIL 拿掉活動工作區的限制驗收表沒變紅"; fail=$((fail+1)); fi
sed "/if v_pt is not null and v_pt is distinct from v_ev.team then raise exception 'other_team'/d" supabase/migrations/2026-12-26-projects.sql > "${BROKEN}"
bk=$(psql -d "${DB}" -X -A -t -q -f "${BROKEN}" 2>&1 || true)
if echo "${bk}" | grep -q "OVERALL.*FAIL"; then echo "  ok   ★ 破壞測試：活動跨 team 進專案，驗收表變紅"; pass=$((pass+1)); else echo "  FAIL 拿掉跨 team 檢查驗收表沒變紅"; fail=$((fail+1)); fi
rm -f "${BROKEN}"
prj3=$(psql -d "${DB}" -X -A -t -q -v ON_ERROR_STOP=1 -f supabase/migrations/2026-12-26-projects.sql 2>&1 || true)
if echo "${prj3}" | grep -q "OVERALL.*PASS" && ! echo "${prj3}" | grep -q "|FAIL"; then echo "  ok   裝回正確版，驗收表又全 PASS"; pass=$((pass+1)); else echo "  FAIL 裝回之後驗收表沒過"; fail=$((fail+1)); fi
echo "── 專案一個一個開：在工作區裡不等於看得到每一個專案（2026-12-27-project-scope.sql）──"
psc=$(psql -d "${DB}" -X -A -t -q -v ON_ERROR_STOP=1 -f supabase/migrations/2026-12-27-project-scope.sql 2>&1 || true)
if echo "${psc}" | grep -q "OVERALL.*PASS" && ! echo "${psc}" | grep -q "|FAIL"; then echo "  ok   專案範圍那支驗收表全 PASS"; pass=$((pass+1)); else echo "  FAIL 專案範圍那支驗收表："; echo "${psc}" | head -10; fail=$((fail+1)); fi
chkas "${PAUL}" "（準備）活動放回專案" "ok" "select public.set_event_project((select id from public.events where slug='am-ev-p'),'project:am-proj-p'); select 'ok'"
chkas "${AMT}" "★ team 是「改」不再自動看得到別人開的專案" "null" "select coalesce(public.ws_my_level('project:am-proj-p'),'null')"
chkas "${AMT}" "★ 也看不到那個專案裡的活動（報名名單）" "false" "select public.can_view('custom:event-am-ev-p')::text"
chkas "${AMT}" "my_access 不帶那個專案" "0" "select count(*) from jsonb_array_elements(public.my_access()->'workspaces') x where x->>'id' in ('project:am-proj-p','custom:event-am-ev-p')"
chkas "${PAUL}" "（準備）別人在同 team 開一場不放進專案的活動" "1" "select count(*) from (select public.create_event('${AMTEAM}','am-ev-loose','散的活動','Loose event',false)) x"
chkas "${AMT}" "★ 沒放進專案的活動照舊跟 team 走" "edit" "select public.ws_my_level('custom:event-am-ev-loose')"
chkas "${AMT}" "自己開的專案照舊是「管」" "manage" "select public.ws_my_level('project:am-proj')"
chkas "${AMX}" "★ 被加進專案的人照舊改得動專案裡的活動" "edit" "select public.ws_my_level('custom:event-am-ev-p')"
chkas "${PAUL}" "（準備）把 team 是「看」的人升成 team 的「管」" "manage" "select public.assign('${AMV}','res:${AMTEAM}','manage')"
chkas "${AMV}" "★ team 的「管」（Director）管得到 team 的每一個專案" "manage|manage" "select public.ws_my_level('project:am-proj-p')||'|'||public.ws_my_level('custom:event-am-ev-p')"
chkas "${AMV}" "★ team 的「管」管不到別隊的專案" "null" "select coalesce(public.ws_my_level('project:am-proj-o'),'null')"
chkas "${PAUL}" "（還原）降回「看」" "view" "select public.assign('${AMV}','res:${AMTEAM}','view')"
chkas "${PAUL}" "（準備）把人從專案移出" "ok" "select public.unassign('${AMX}','project:am-proj-p'); select 'ok'"
chkas "${AMX}" "★ 移出專案之後那場活動就沒有了" "false" "select public.can_view('custom:event-am-ev-p')::text"
chkas "${PAUL}" "（還原）加回專案" "edit" "select public.assign('${AMX}','project:am-proj-p','edit')"
BROKEN=$(mktemp)
sed "s/a.level = 'manage'/a.level in ('edit', 'manage')/" supabase/migrations/2026-12-27-project-scope.sql > "${BROKEN}"
bk=$(psql -d "${DB}" -X -A -t -q -f "${BROKEN}" 2>&1 || true)
if echo "${bk}" | grep -q "OVERALL.*FAIL"; then echo "  ok   ★ 破壞測試：team 的「改」又帶到每一個專案，驗收表變紅"; pass=$((pass+1)); else echo "  FAIL 讓 team 的「改」帶到專案驗收表沒變紅"; fail=$((fail+1)); fi
rm -f "${BROKEN}"
psc2=$(psql -d "${DB}" -X -A -t -q -v ON_ERROR_STOP=1 -f supabase/migrations/2026-12-27-project-scope.sql 2>&1 || true)
if echo "${psc2}" | grep -q "OVERALL.*PASS" && ! echo "${psc2}" | grep -q "|FAIL"; then echo "  ok   裝回正確版，驗收表又全 PASS"; pass=$((pass+1)); else echo "  FAIL 裝回之後驗收表沒過"; fail=$((fail+1)); fi
echo "── 校友的故事多一格「在 BT 做過什麼」（2026-12-28-alumni-bt-role.sql）──"
# 這時候：PAUL Co-President、MEMBER 校友，MEMBER 的故事那一列早就在（上面 10-26 那段插的）。先把它放回「已核可」當起點。
psql -d "${DB}" -X -A -t -q -c "update public.alumni_stories set public_story=true, story_approved=true, approved_at=now(), county='台北' where id='${MEMBER}';" 2>&1 | grep -i "error" || true
abr=$(psql -d "${DB}" -X -A -t -q -v ON_ERROR_STOP=1 -f supabase/migrations/2026-12-28-alumni-bt-role.sql 2>&1 || true)
if echo "${abr}" | grep -q "OVERALL.*PASS" && ! echo "${abr}" | grep -q "|FAIL"; then echo "  ok   做過什麼那支驗收表全 PASS"; pass=$((pass+1)); else echo "  FAIL 做過什麼那支驗收表："; echo "${abr}" | head -12; fail=$((fail+1)); fi
abr2=$(psql -d "${DB}" -X -A -t -q -v ON_ERROR_STOP=1 -f supabase/migrations/2026-12-28-alumni-bt-role.sql 2>&1 || true)
if echo "${abr2}" | grep -q "OVERALL.*PASS"; then echo "  ok   做過什麼那支重跑一次也全 PASS"; pass=$((pass+1)); else echo "  FAIL 做過什麼那支重跑：${abr2}" | head -5; fail=$((fail+1)); fi
chk "（前提）MEMBER 的故事已核可" "true|true" "select public_story::text||'|'||story_approved::text from public.alumni_stories where id='${MEMBER}'"
chkrole authenticated "${MEMBER}" "★ 本人自己填得了做過什麼與哪個 team" "ok" "update public.alumni_stories set bt_role='speaker', bt_team='Curriculum Team' where id='${MEMBER}' returning 'ok'"
chk "★ 改了做過什麼就下架（story_approved 掉回 false）" "speaker|CurriculumTeam|false" "select bt_role||'|'||bt_team||'|'||story_approved::text from public.alumni_stories where id='${MEMBER}'"
chkrole anon "" "下架之後對外頁上沒有他" "0" "select count(*) from public.public_alumni() where bt_role='speaker'"
chkas "${PAUL}" "後台核可清單看得到他說自己做過什麼" "speaker|CurriculumTeam" "select bt_role||'|'||bt_team from public.stories_for_review() where id='${MEMBER}'"
chkas "${PAUL}" "Co-President 重新核可" "true" "select public.set_story_approved('${MEMBER}', true)::text"
chkrole anon "" "★ 對外頁多回兩欄：講者、Curriculum Team（/island/ 靠這兩欄讓他走去那座島）" "speaker|CurriculumTeam" "select bt_role||'|'||bt_team from public.public_alumni() where bt_role='speaker'"
chkrole authenticated "${MEMBER}" "改城市不下架（照舊）" "ok" "update public.alumni_stories set city='Madison' where id='${MEMBER}' returning 'ok'"
chk "還在公開頁上" "true" "select story_approved::text from public.alumni_stories where id='${MEMBER}'"
got=$(psql -d "${DB}" -X -A -t -q -c "select set_config('test.uid','${MEMBER}',false);" -c "set role authenticated; update public.alumni_stories set bt_role='president' where id='${MEMBER}';" 2>&1 || true)
if echo "${got}" | grep -qi "check constraint"; then echo "  ok   ★ 做過什麼只收那六種（亂填被 check 擋）"; pass=$((pass+1)); else echo "  FAIL 亂填的 bt_role 沒被擋：${got}"; fail=$((fail+1)); fi
got=$(psql -d "${DB}" -X -A -t -q -c "select set_config('test.uid','${MEMBER}',false);" -c "set role authenticated; update public.alumni_stories set bt_team='Exec Team' where id='${MEMBER}';" 2>&1 || true)
if echo "${got}" | grep -qi "check constraint"; then echo "  ok   ★ team 只收那六個（亂填被 check 擋）"; pass=$((pass+1)); else echo "  FAIL 亂填的 bt_team 沒被擋：${got}"; fail=$((fail+1)); fi
got=$(psql -d "${DB}" -X -A -t -q -c "select set_config('test.uid','${MEMBER}',false);" -c "set role authenticated; update public.alumni_stories set story_approved=true where id='${MEMBER}';" 2>&1 || true)
if echo "${got}" | grep -qi "permission denied"; then echo "  ok   ★ 破壞測試：本人照舊改不了 story_approved（兩把鑰匙還是兩把）"; pass=$((pass+1)); else echo "  FAIL 本人改得了 story_approved：${got}"; fail=$((fail+1)); fi
chkrole authenticated "${MEMBER}" "本人把 team 清空也可以（前端會照做過什麼給預設）" "ok" "update public.alumni_stories set bt_team=null where id='${MEMBER}' returning 'ok'"
chkas "${PAUL}" "（還原）重新核可" "true" "select public.set_story_approved('${MEMBER}', true)::text"
# 破壞測試：少發了那兩欄的權限，驗收表要變紅
BROKEN=$(mktemp)
sed "/^grant update (bt_role, bt_team) on public.alumni_stories to authenticated;$/d" supabase/migrations/2026-12-28-alumni-bt-role.sql > "${BROKEN}"
psql -d "${DB}" -X -A -t -q -c "revoke update (bt_role, bt_team) on public.alumni_stories from authenticated;" >/dev/null 2>&1 || true
bk=$(psql -d "${DB}" -X -A -t -q -f "${BROKEN}" 2>&1 || true)
if echo "${bk}" | grep -q "OVERALL.*FAIL"; then echo "  ok   ★ 破壞測試：少發 update 的欄位權限，驗收表變紅"; pass=$((pass+1)); else echo "  FAIL 少發權限驗收表沒變紅"; fail=$((fail+1)); fi
rm -f "${BROKEN}"
abr3=$(psql -d "${DB}" -X -A -t -q -v ON_ERROR_STOP=1 -f supabase/migrations/2026-12-28-alumni-bt-role.sql 2>&1 || true)
if echo "${abr3}" | grep -q "OVERALL.*PASS" && ! echo "${abr3}" | grep -q "|FAIL"; then echo "  ok   裝回正確版，驗收表又全 PASS"; pass=$((pass+1)); else echo "  FAIL 裝回之後驗收表沒過"; fail=$((fail+1)); fi
echo "── 島上的貼文（2026-12-29-island-posts.sql）──"
# 這時候：PAUL Co-President、DIR 管 res:Marketing Team、AMT 是某個 team 的「改」（AMTEAM）**而且上面 12-26 那段把他升成了 Marketing 的「管」**、AMV 是那個 team 的「看」、ISTAFF 只在 Internship、STU 學員。
ipg=$(psql -d "${DB}" -X -A -t -q -v ON_ERROR_STOP=1 -f supabase/migrations/2026-12-29-island-posts.sql 2>&1 || true)
if echo "${ipg}" | grep -q "OVERALL.*PASS" && ! echo "${ipg}" | grep -q "|FAIL"; then echo "  ok   島上的貼文那支驗收表全 PASS"; pass=$((pass+1)); else echo "  FAIL 島上的貼文那支驗收表："; echo "${ipg}" | head -12; fail=$((fail+1)); fi
ipg2=$(psql -d "${DB}" -X -A -t -q -v ON_ERROR_STOP=1 -f supabase/migrations/2026-12-29-island-posts.sql 2>&1 || true)
if echo "${ipg2}" | grep -q "OVERALL.*PASS"; then echo "  ok   島上的貼文那支重跑一次也全 PASS"; pass=$((pass+1)); else echo "  FAIL 重跑：${ipg2}" | head -5; fail=$((fail+1)); fi
IP1=$(psql -d "${DB}" -X -A -t -q -c "select set_config('test.uid','${AMT}',false);" \
  -c "select public.upsert_island_post('{\"program\":\"database\",\"team\":\"${AMTEAM}\",\"url\":\"https://www.instagram.com/p/abc/\",\"kind\":\"post\",\"caption_zh\":\"東大\",\"caption_en\":\"Tokyo\",\"posted_on\":\"2026-11-12\"}'::jsonb)" 2>&1 | tail -1 | tr -d ' \n')
case "${IP1}" in ????????-*) echo "  ok   team 是「改」的人貼了一則（${IP1}）"; pass=$((pass+1));; *) echo "  FAIL 貼不了：${IP1}"; fail=$((fail+1));; esac
chk "新的一則是草稿" "draft|database" "select status||'|'||program from public.island_posts where id='${IP1}'"
chkraise "★ team 是「看」的人貼不了（not_allowed）" "not_allowed" \
  "perform set_config('test.uid','${AMV}',true); perform public.upsert_island_post('{\"program\":\"database\",\"team\":\"${AMTEAM}\",\"url\":\"https://x/\"}'::jsonb);"
chkraise "★ 別的 team 的幹部貼不了這個 team 的（not_allowed）" "not_allowed" \
  "perform set_config('test.uid','${ISTAFF}',true); perform public.upsert_island_post('{\"program\":\"database\",\"team\":\"${AMTEAM}\",\"url\":\"https://x/\"}'::jsonb);"
chkraise "★ 聚會所（team 空）只有 Marketing「管」或 senior 貼得了：Internship 的幹部不行（not_allowed）" "not_allowed" \
  "perform set_config('test.uid','${ISTAFF}',true); perform public.upsert_island_post('{\"program\":\"meeting\",\"team\":\"\",\"url\":\"https://x/\"}'::jsonb);"
chkas "${DIR}" "Marketing「管」貼得了聚會所的" "1" "select count(*) from (select public.upsert_island_post('{\"program\":\"meeting\",\"team\":\"\",\"url\":\"https://www.instagram.com/p/m/\",\"caption_zh\":\"全員會議\"}'::jsonb)) x"
chkraise "連結不是 https 擋（url_not_https）" "url_not_https" \
  "perform set_config('test.uid','${AMT}',true); perform public.upsert_island_post('{\"program\":\"database\",\"team\":\"${AMTEAM}\",\"url\":\"http://x/\"}'::jsonb);"
chkraise "program 亂填擋（bad_program）" "bad_program" \
  "perform set_config('test.uid','${AMT}',true); perform public.upsert_island_post('{\"program\":\"Bad Program\",\"team\":\"${AMTEAM}\",\"url\":\"https://x/\"}'::jsonb);"
chkrole anon "" "★ 草稿對外看不到" "0" "select jsonb_array_length(public.public_island_posts())"
chkas "${AMT}" "上架（沒有圖，不用同意）" "published" "select public.set_island_post_status('${IP1}','published')"
chkrole anon "" "★ 對外拿得到那一則，而且沒有 team、status、誰貼的" "1|database|0|0" \
  "select jsonb_array_length(j)||'|'||(j->0->>'program')||'|'||(select count(*) from jsonb_array_elements(j) e where e ? 'status')||'|'||(select count(*) from jsonb_array_elements(j) e where e ? 'team') from public.public_island_posts() j"
chkas "${AMT}" "掛一張圖（同意還沒勾）" "${IP1}" "select public.upsert_island_post('{\"id\":\"${IP1}\",\"image_url\":\"https://norjaglyaotzewxavmhv.supabase.co/storage/v1/object/public/island/a.jpg\"}'::jsonb)"
chk "★ 換了圖就退回草稿、同意歸零" "draft|false" "select status||'|'||consent::text from public.island_posts where id='${IP1}'"
chkraise "★ 有圖沒勾同意上不了架（consent_required）" "consent_required" \
  "perform set_config('test.uid','${AMT}',true); perform public.set_island_post_status('${IP1}','published');"
chkas "${AMT}" "勾了同意" "${IP1}" "select public.upsert_island_post('{\"id\":\"${IP1}\",\"consent\":true}'::jsonb)"
chkas "${AMT}" "再上架" "published" "select public.set_island_post_status('${IP1}','published')"
chkrole anon "" "對外那一則帶著圖" "https://norjaglyaotzewxavmhv.supabase.co/storage/v1/object/public/island/a.jpg" "select j->0->>'image' from public.public_island_posts() j"
psql -d "${DB}" -X -A -t -q -c "update public.island_posts set consent=false where id='${IP1}';" >/dev/null
chkrole anon "" "★ 破壞測試：直接把同意改掉，對外那一則就不見（函式裡的門）" "0" "select jsonb_array_length(public.public_island_posts())"
psql -d "${DB}" -X -A -t -q -c "update public.island_posts set consent=true where id='${IP1}';" >/dev/null
chkraise "★ team 是「看」的人撤不了（not_allowed）" "not_allowed" \
  "perform set_config('test.uid','${AMV}',true); perform public.set_island_post_status('${IP1}','archived');"
chkrole authenticated "${STU}" "學員什麼都讀不到" "0" "select count(*) from public.island_posts"
chkrole authenticated "${ISTAFF}" "別的 team 的幹部讀得到清單（後台看得到，改不動）" "2" "select count(*) from public.island_posts"
angot=$(psql -d "${DB}" -X -A -t -q -c "set role anon; select count(*) from public.island_posts;" 2>&1 || true)
if echo "${angot}" | grep -qi "permission denied"; then echo "  ok   ★ anon 讀不到 island_posts 表本身"; pass=$((pass+1)); else echo "  FAIL anon 讀得到表：${angot}"; fail=$((fail+1)); fi
chkraise "★ 別的 team 的幹部刪不了（not_allowed）" "not_allowed" \
  "perform set_config('test.uid','${ISTAFF}',true); perform public.delete_island_post('${IP1}');"
chkas "${PAUL}" "Co-President 刪掉，拿回圖的網址" "https://norjaglyaotzewxavmhv.supabase.co/storage/v1/object/public/island/a.jpg" "select public.delete_island_post('${IP1}')"
chk "刪掉了" "1" "select count(*) from public.island_posts"
BROKEN=$(mktemp)
sed "s/if p_status = 'published' and v.image_url is not null and not v.consent then raise exception 'consent_required' using errcode = 'P0001'; end if;//" supabase/migrations/2026-12-29-island-posts.sql > "${BROKEN}"
bk=$(psql -d "${DB}" -X -A -t -q -f "${BROKEN}" 2>&1 || true)
if echo "${bk}" | grep -q "OVERALL.*FAIL"; then echo "  ok   ★ 破壞測試：拿掉同意的門，驗收表變紅"; pass=$((pass+1)); else echo "  FAIL 拿掉同意的門驗收表沒變紅"; fail=$((fail+1)); fi
rm -f "${BROKEN}"
ipg3=$(psql -d "${DB}" -X -A -t -q -v ON_ERROR_STOP=1 -f supabase/migrations/2026-12-29-island-posts.sql 2>&1 || true)
if echo "${ipg3}" | grep -q "OVERALL.*PASS" && ! echo "${ipg3}" | grep -q "|FAIL"; then echo "  ok   裝回正確版，驗收表又全 PASS"; pass=$((pass+1)); else echo "  FAIL 裝回之後驗收表沒過"; fail=$((fail+1)); fi
echo "── 島、在做的事、協作線搬進資料庫（2026-12-30-island-map.sql）──"
# 這時候：PAUL Co-President、AMT 是 AMTEAM 的「改」也是 Marketing 的「管」、AMV 是 AMTEAM 的「看」、ISTAFF 只在 Internship。
imp=$(psql -d "${DB}" -X -A -t -q -v ON_ERROR_STOP=1 -f supabase/migrations/2026-12-30-island-map.sql 2>&1 || true)
if echo "${imp}" | grep -q "OVERALL.*PASS" && ! echo "${imp}" | grep -q "|FAIL"; then echo "  ok   島那支驗收表全 PASS"; pass=$((pass+1)); else echo "  FAIL 島那支驗收表："; echo "${imp}" | head -12; fail=$((fail+1)); fi
chkas "${PAUL}" "（準備）Curriculum 那座島的工作區是 Curriculum Team" "CurriculumTeam" "select workspace from public.island_teams where id='curriculum'"
psql -d "${DB}" -X -A -t -q -c "insert into public.assignments (user_id,workspace_id,level) values ('${ISTAFF}','res:Curriculum Team','edit') on conflict (user_id,workspace_id) do update set level='edit';" >/dev/null
chkas "${ISTAFF}" "Curriculum「改」的人改得了 Curriculum 島的一句話" "curriculum" "select public.upsert_island_team('{\"id\":\"curriculum\",\"tagline_zh\":\"新的一句話\"}'::jsonb)"
chk "改進去了，別的欄位沒動" "新的一句話|true" "select tagline_zh||'|'||(about_zh<>'')::text from public.island_teams where id='curriculum'"
chkraise "★ Curriculum「改」的人改不了 Mentorship 島（not_allowed）" "not_allowed" \
  "perform set_config('test.uid','${ISTAFF}',true); perform public.upsert_island_team('{\"id\":\"mentorship\",\"tagline_zh\":\"x\"}'::jsonb);"
chkraise "★ 聚會所只有 Marketing 管與 senior 改得了（not_allowed）" "not_allowed" \
  "perform set_config('test.uid','${ISTAFF}',true); perform public.upsert_island_team('{\"id\":\"commons\",\"tagline_zh\":\"x\"}'::jsonb);"
chkraise "沒有這座島（not_found）" "not_found" \
  "perform set_config('test.uid','${PAUL}',true); perform public.upsert_island_team('{\"id\":\"atlantis\"}'::jsonb);"
chkas "${ISTAFF}" "Curriculum「改」的人在 Curriculum 島加一棟" "mock-interview" "select public.upsert_island_program('{\"id\":\"mock-interview\",\"team_id\":\"curriculum\",\"kind\":\"tent\",\"name_zh\":\"模擬面試\",\"name_en\":\"Mock interviews\",\"link\":\"../programs/\"}'::jsonb)"
chkraise "★ 在別座島加不了（not_allowed）" "not_allowed" \
  "perform set_config('test.uid','${ISTAFF}',true); perform public.upsert_island_program('{\"id\":\"x-thing\",\"team_id\":\"mentorship\",\"name_zh\":\"x\"}'::jsonb);"
chkraise "代號亂填擋（bad_slug）" "bad_slug" \
  "perform set_config('test.uid','${ISTAFF}',true); perform public.upsert_island_program('{\"id\":\"Bad Slug\",\"team_id\":\"curriculum\"}'::jsonb);"
chkraise "連結只收站內相對路徑或 https（bad_link）" "bad_link" \
  "perform set_config('test.uid','${ISTAFF}',true); perform public.upsert_island_program('{\"id\":\"mock-interview\",\"link\":\"javascript:alert(1)\"}'::jsonb);"
chkraise "★ 搬去自己管不到的島不行（not_allowed）" "not_allowed" \
  "perform set_config('test.uid','${ISTAFF}',true); perform public.upsert_island_program('{\"id\":\"mock-interview\",\"team_id\":\"mentorship\"}'::jsonb);"
chkrole anon "" "★ 對外的 public_island() 看得到新的那一棟" "1" "select count(*) from jsonb_array_elements(public.public_island()->'teams') t, jsonb_array_elements(t->'programs') p where p->>'id'='mock-interview'"
chkas "${ISTAFF}" "刪掉那一棟" "mock-interview" "select public.delete_island_program('mock-interview')"
chkraise "★ 一座島最後一棟刪不掉（last_program）" "last_program" \
  "perform set_config('test.uid','${PAUL}',true); perform public.delete_island_program('hs-internship');"
chkraise "★ 協作線：team 的人加不了（not_allowed）" "not_allowed" \
  "perform set_config('test.uid','${ISTAFF}',true); perform public.upsert_island_connection('{\"a\":\"curriculum\",\"b\":\"internship\",\"why_zh\":\"x\"}'::jsonb);"
IC=$(psql -d "${DB}" -X -A -t -q -c "select set_config('test.uid','${PAUL}',false);" -c "select public.upsert_island_connection('{\"a\":\"internship\",\"b\":\"sponsorship\",\"why_zh\":\"一起找實習的公司\",\"why_en\":\"Find host companies together\"}'::jsonb)" 2>&1 | tail -1 | tr -d ' \n')
case "${IC}" in ????????-*) echo "  ok   Co-President 加了一條協作線（${IC}）"; pass=$((pass+1));; *) echo "  FAIL 加線失敗：${IC}"; fail=$((fail+1));; esac
chkraise "同一座島連自己擋（bad_team）" "bad_team" \
  "perform set_config('test.uid','${PAUL}',true); perform public.upsert_island_connection('{\"a\":\"commons\",\"b\":\"commons\"}'::jsonb);"
chkas "${PAUL}" "刪掉那條線" "true" "select public.delete_island_connection('${IC}')::text"
chkrole authenticated "${STU}" "學員什麼都讀不到" "0" "select count(*) from public.island_teams"
angot=$(psql -d "${DB}" -X -A -t -q -c "set role anon; select count(*) from public.island_programs;" 2>&1 || true)
if echo "${angot}" | grep -qi "permission denied"; then echo "  ok   ★ anon 讀不到 island_programs 表本身"; pass=$((pass+1)); else echo "  FAIL anon 讀得到表：${angot}"; fail=$((fail+1)); fi
imp2=$(psql -d "${DB}" -X -A -t -q -v ON_ERROR_STOP=1 -f supabase/migrations/2026-12-30-island-map.sql 2>&1 || true)
if echo "${imp2}" | grep -q "OVERALL.*PASS"; then echo "  ok   島那支重跑一次也全 PASS"; pass=$((pass+1)); else echo "  FAIL 重跑：${imp2}" | head -5; fail=$((fail+1)); fi
chk "★ 重跑之後後台改過的字沒被 seed 蓋掉" "新的一句話" "select tagline_zh from public.island_teams where id='curriculum'"
psql -d "${DB}" -X -A -t -q -c "delete from public.assignments where user_id='${ISTAFF}' and workspace_id='res:Curriculum Team';" >/dev/null
echo "── 計畫：一筆資料餵三頁（2026-12-31-programmes.sql）──"
# 這時候：PAUL Co-President、AMT 是 AMTEAM 的「改」、AMX 是不在任何 team 的幹部、ISTAFF 只在 Internship、STU 是學員。
PGSEED="'winter-bootcamp','intern-intake','mentor-matching','coffee-chat','essay-ecosystem'"
PGOLD=$(psql -d "${DB}" -X -A -t -q -c "select count(*) from public.events" | tr -d ' \n')
pgm=$(psql -d "${DB}" -X -A -t -q -v ON_ERROR_STOP=1 -f supabase/migrations/2026-12-31-programmes.sql 2>&1 || true)
if echo "${pgm}" | grep -q "OVERALL.*PASS" && ! echo "${pgm}" | grep -q "|FAIL"; then echo "  ok   計畫那支驗收表全 PASS"; pass=$((pass+1)); else echo "  FAIL 計畫那支驗收表："; echo "${pgm}" | head -14; fail=$((fail+1)); fi
chk "★ 原本的活動一筆沒少，四個新欄位都是預設值（沒月份、不是固定計畫、沒有另外取名）" "${PGOLD}" \
  "select count(*) from public.events where slug not in (${PGSEED}) and usual_month is null and not recurring and edition_zh='' and edition_en=''"
chk "★ public_events() 回 24 欄，原本 20 欄的順序沒動，最後四欄是新的" "24|slug|is_past|usual_month,recurring,edition_zh,edition_en" \
  "select array_length(proargnames,1)||'|'||proargnames[1]||'|'||proargnames[20]||'|'||array_to_string(proargnames[21:24], ',') from pg_proc where proname='public_events' and pronamespace='public'::regnamespace"
chkrole anon "" "★ 沒登入的人看得到 seed 的五筆計畫" "5" "select count(*) from public.public_events() where slug in (${PGSEED})"
chkrole anon "" "寒假探索營：team、中英名稱、這一屆叫什麼、固定計畫、1 月、2027-01-03 台北時間半夜" "CurriculumTeam|寒假探索營|WinterCollegeBootcamp|OverseasUnpacked|OverseasUnpacked|true|1|2027-01-0300:00|false" \
  "select team||'|'||title_zh||'|'||title_en||'|'||edition_zh||'|'||edition_en||'|'||recurring||'|'||usual_month||'|'||to_char(starts_at at time zone 'Asia/Taipei','YYYY-MM-DD HH24:MI')||'|'||is_past from public.public_event('winter-bootcamp')"
chkrole anon "" "★ 沒有日期的四筆：is_past 是 false 不是空的，實習招募是 8 月，其他三筆沒月份" "coffee-chat:-:false,essay-ecosystem:-:false,intern-intake:8:false,mentor-matching:-:false" \
  "select string_agg(slug||':'||coalesce(usual_month::text,'-')||':'||is_past, ',' order by slug) from public.public_events() where starts_at is null and slug in (${PGSEED})"
chkrole anon "" "★ 有日期的排前面，沒有日期的排最後" "true" \
  "select (coalesce(max(n) filter (where starts_at is not null), 0) < min(n) filter (where starts_at is null))::text from (select starts_at, row_number() over () n from public.public_events()) x"
chkrole anon "" "沒有日期的那幾筆彼此照月份再照代號" "intern-intake,coffee-chat,essay-ecosystem,mentor-matching" \
  "select string_agg(slug, ',') from (select slug from public.public_events() where starts_at is null and slug in (${PGSEED})) x"
chk "seed 的工作區照 create_event() 的樣子：custom:event-<代號>、team 填對、沒有擁有人、沒有報名表" "custom|MentorshipTeam|none|none" \
  "select w.kind||'|'||w.team||'|'||coalesce(w.owner::text,'none')||'|'||coalesce(e.form_id::text,'none') from public.events e join public.workspaces w on w.id=e.workspace_id where e.slug='mentor-matching' and w.id='custom:event-mentor-matching'"
psql -d "${DB}" -X -A -t -q -c "insert into public.assignments (user_id,workspace_id,level) values ('${ISTAFF}','res:Curriculum Team','edit') on conflict (user_id,workspace_id) do update set level='edit';" >/dev/null
chkas "${ISTAFF}" "★ Curriculum「改」的人改得動 seed 的寒假探索營，改不動 Mentorship 的" "true|false" "select public.can_edit('custom:event-winter-bootcamp')::text||'|'||public.can_edit('custom:event-coffee-chat')::text"
psql -d "${DB}" -X -A -t -q -c "delete from public.assignments where user_id='${ISTAFF}' and workspace_id='res:Curriculum Team';" >/dev/null
# 一筆沒有日期的計畫從草稿走到對外
PGEV=$(psql -d "${DB}" -X -A -t -q -c "select set_config('test.uid','${PAUL}',false);" -c "select public.create_event('${AMTEAM}','pg-no-date','沒日期的計畫','Programme without a date',false)" 2>&1 | tail -1 | tr -d ' \n')
case "${PGEV}" in ????????-*) echo "  ok   Co-President 開了一筆沒有日期的計畫（${PGEV}）"; pass=$((pass+1));; *) echo "  FAIL 開計畫失敗：${PGEV}"; fail=$((fail+1));; esac
chkraise "★ 沒日期、沒月份、不是固定計畫：按不了準備好了（need_start，跟以前一樣）" "need_start" \
  "perform set_config('test.uid','${PAUL}',true); perform public.set_event_ready('${PGEV}', true);"
chkraise "月份填 13 擋（bad_month）" "bad_month" \
  "perform set_config('test.uid','${AMT}',true); perform public.save_event('${PGEV}', '{\"usual_month\":13}'::jsonb);"
chkraise "月份填不是數字的擋（bad_month）" "bad_month" \
  "perform set_config('test.uid','${AMT}',true); perform public.save_event('${PGEV}', '{\"usual_month\":\"八月\"}'::jsonb);"
chkraise "★ 不在這個 team 的幹部存不了（not_allowed）" "not_allowed" \
  "perform set_config('test.uid','${AMX}',true); perform public.save_event('${PGEV}', '{\"usual_month\":8,\"recurring\":true}'::jsonb);"
chkas "${AMT}" "team 是「改」的人存通常在幾月與這一屆叫什麼" "8|false|第三屆|Thirdedition" \
  "select public.save_event('${PGEV}', '{\"usual_month\":8,\"edition_zh\":\"第三屆\",\"edition_en\":\"Third edition\"}'::jsonb); select coalesce(usual_month::text,'-')||'|'||recurring||'|'||edition_zh||'|'||edition_en from public.events where id='${PGEV}'"
chkas "${AMT}" "★ 沒帶新鍵的舊呼叫不會動那四欄" "8|false|第三屆|Thirdedition|一句話" \
  "select public.save_event('${PGEV}', '{\"summary_zh\":\"一句話\",\"place\":\"\",\"capacity\":0}'::jsonb); select coalesce(usual_month::text,'-')||'|'||recurring||'|'||edition_zh||'|'||edition_en||'|'||summary_zh from public.events where id='${PGEV}'"
chkas "${PAUL}" "★ 有填通常在幾月，沒有日期也按得了準備好了" "ready" "select public.set_event_ready('${PGEV}', true)"
chkas "${PAUL}" "退回草稿" "draft" "select public.set_event_ready('${PGEV}', false)"
chkas "${AMT}" "月份清掉（空字串）、改勾多數年份都會辦" "-|true" \
  "select public.save_event('${PGEV}', '{\"usual_month\":\"\",\"recurring\":true}'::jsonb); select coalesce(usual_month::text,'-')||'|'||recurring from public.events where id='${PGEV}'"
chkas "${PAUL}" "★ 只勾多數年份都會辦，沒有日期也按得了準備好了" "ready" "select public.set_event_ready('${PGEV}', true)"
chkas "${PAUL}" "再退回草稿" "draft" "select public.set_event_ready('${PGEV}', false)"
psql -d "${DB}" -X -A -t -q -c "select set_config('test.uid','${AMT}',false);" -c "select public.save_event('${PGEV}', '{\"recurring\":false}'::jsonb)" >/dev/null 2>&1
chkraise "★ 兩樣都拿掉又擋回來（need_start）" "need_start" \
  "perform set_config('test.uid','${PAUL}',true); perform public.set_event_ready('${PGEV}', true);"
psql -d "${DB}" -X -A -t -q -c "select set_config('test.uid','${AMT}',false);" -c "select public.save_event('${PGEV}', '{\"recurring\":true,\"usual_month\":null}'::jsonb)" >/dev/null 2>&1
chkrole anon "" "還是草稿，沒登入的人看不到" "0" "select count(*) from public.public_event('pg-no-date')"
chkas "${PAUL}" "準備好了" "ready" "select public.set_event_ready('${PGEV}', true)"
chkas "${PAUL}" "★ Co-President 放上對外頁（沒有日期）" "published" "select public.publish_event('${PGEV}')"
chkrole anon "" "★ 沒登入的人看得到那一筆：沒日期、沒月份、固定計畫、還沒過去、這一屆叫什麼帶出來了" "true|-|true|false|第三屆|Thirdedition" \
  "select (starts_at is null)::text||'|'||coalesce(usual_month::text,'-')||'|'||recurring||'|'||is_past||'|'||edition_zh||'|'||edition_en from public.public_event('pg-no-date')"
chkrole anon "" "★ 整份對外清單沒有一筆 is_past 是空的" "0" "select count(*) from public.public_events() where is_past is null"
# 只知道哪一天、還不知道幾點的（台灣今天半夜十二點、沒有結束時間）：整個今天都還不算過去。昨天半夜十二點的就算過去了。
psql -d "${DB}" -X -A -t -q -c "select set_config('test.uid','${AMT}',false);" -c "select public.save_event('${PGEV}', jsonb_build_object('starts_at', date_trunc('day', now() at time zone 'Asia/Taipei') at time zone 'Asia/Taipei'))" >/dev/null 2>&1
chkrole anon "" "★ 只填日期（台灣今天半夜十二點）的活動，當天還不算過去" "false" "select is_past::text from public.public_event('pg-no-date')"
psql -d "${DB}" -X -A -t -q -c "select set_config('test.uid','${AMT}',false);" -c "select public.save_event('${PGEV}', jsonb_build_object('starts_at', (date_trunc('day', now() at time zone 'Asia/Taipei') - interval '1 day') at time zone 'Asia/Taipei'))" >/dev/null 2>&1
chkrole anon "" "只填日期、日期是昨天的，算過去了" "true" "select is_past::text from public.public_event('pg-no-date')"
psql -d "${DB}" -X -A -t -q -c "select set_config('test.uid','${AMT}',false);" -c "select public.save_event('${PGEV}', '{\"starts_at\":\"2020-01-01T00:00:00Z\"}'::jsonb)" >/dev/null 2>&1
chkrole anon "" "填了過去的日期，is_past 照舊是 true" "true" "select is_past::text from public.public_event('pg-no-date')"
chkrole authenticated "${STU}" "登入的學員也叫得到對外那一支" "true" "select (count(*) > 0)::text from public.public_events()"
chkraise "★ 學員存不了（not_allowed）" "not_allowed" \
  "perform set_config('test.uid','${STU}',true); perform public.save_event('${PGEV}', '{\"recurring\":false}'::jsonb);"
pgan=$(psql -d "${DB}" -X -A -t -q -c "set role anon; select public.save_event('${PGEV}', '{\"recurring\":false}'::jsonb);" 2>&1 || true)
if echo "${pgan}" | grep -qi "permission denied"; then echo "  ok   ★ 沒登入的人叫不到 save_event()"; pass=$((pass+1)); else echo "  FAIL 沒登入的人叫得到 save_event()：${pgan}"; fail=$((fail+1)); fi
# 破壞測試
BROKEN=$(mktemp)
# 2026-11-22：is_past 那一行多了「只知道日期的整天都不算過去」，破壞的方法改成把最後那個 false 換成空值（沒有日期的那幾筆就會回空的）。
sed "s/< now(), false) as is_past/< now(), null::boolean) as is_past/" supabase/migrations/2026-12-31-programmes.sql > "${BROKEN}"
bk=$(psql -d "${DB}" -X -A -t -q -f "${BROKEN}" 2>&1 || true)
if echo "${bk}" | grep -q "OVERALL.*FAIL"; then echo "  ok   ★ 破壞測試：is_past 改回會是空的那一版，驗收表變紅"; pass=$((pass+1)); else echo "  FAIL is_past 改回舊版驗收表沒變紅"; fail=$((fail+1)); fi
sed "s/if e.starts_at is null and e.usual_month is null and not e.recurring then raise exception 'need_start' using errcode = 'P0001'; end if;//" supabase/migrations/2026-12-31-programmes.sql > "${BROKEN}"
bk=$(psql -d "${DB}" -X -A -t -q -f "${BROKEN}" 2>&1 || true)
if echo "${bk}" | grep -q "OVERALL.*FAIL"; then echo "  ok   ★ 破壞測試：拿掉「要有日期、月份或固定計畫」那道門，驗收表變紅"; pass=$((pass+1)); else echo "  FAIL 拿掉 need_start 那道門驗收表沒變紅"; fail=$((fail+1)); fi
# seed 整段刪掉也要跑得過：先把 seed 的五筆清掉，跑沒有 seed 的版本，再跑完整的把它們放回來。
psql -d "${DB}" -X -A -t -q -c "delete from public.events where slug in (${PGSEED}); delete from public.workspaces where id in (select 'custom:event-' || s from unnest(array[${PGSEED}]) s);" >/dev/null
sed '/▼▼▼ seed 從這裡開始/,/▲▲▲ seed 到這裡結束/d' supabase/migrations/2026-12-31-programmes.sql > "${BROKEN}"
bk=$(psql -d "${DB}" -X -A -t -q -v ON_ERROR_STOP=1 -f "${BROKEN}" 2>&1 || true)
if echo "${bk}" | grep -q "OVERALL.*PASS" && ! echo "${bk}" | grep -q "|FAIL" && echo "${bk}" | grep -q "沒有 seed"; then echo "  ok   ★ seed 整段刪掉再跑：驗收表照樣全 PASS，一筆都沒灌"; pass=$((pass+1)); else echo "  FAIL seed 刪掉之後："; echo "${bk}" | head -14; fail=$((fail+1)); fi
rm -f "${BROKEN}"
chk "（確認）沒有 seed 的版本真的一筆都沒灌" "0" "select count(*) from public.events where slug in (${PGSEED})"
pgm2=$(psql -d "${DB}" -X -A -t -q -v ON_ERROR_STOP=1 -f supabase/migrations/2026-12-31-programmes.sql 2>&1 || true)
if echo "${pgm2}" | grep -q "OVERALL.*PASS" && ! echo "${pgm2}" | grep -q "|FAIL"; then echo "  ok   裝回正確版，驗收表又全 PASS，五筆回來了"; pass=$((pass+1)); else echo "  FAIL 裝回之後驗收表沒過："; echo "${pgm2}" | head -14; fail=$((fail+1)); fi
chkas "${PAUL}" "後台把寒假探索營這一屆的名字改掉" "改過的名字" \
  "select public.save_event((select id from public.events where slug='winter-bootcamp'), '{\"edition_zh\":\"改過的名字\"}'::jsonb); select edition_zh from public.events where slug='winter-bootcamp'"
pgm3=$(psql -d "${DB}" -X -A -t -q -v ON_ERROR_STOP=1 -f supabase/migrations/2026-12-31-programmes.sql 2>&1 || true)
if echo "${pgm3}" | grep -q "OVERALL.*PASS" && ! echo "${pgm3}" | grep -q "|FAIL"; then echo "  ok   計畫那支重跑一次也全 PASS"; pass=$((pass+1)); else echo "  FAIL 重跑：${pgm3}" | head -5; fail=$((fail+1)); fi
chk "★ 重跑之後後台改過的字沒被 seed 蓋掉，五筆也沒變成十筆" "改過的名字|5|5" \
  "select (select edition_zh from public.events where slug='winter-bootcamp')||'|'||(select count(*) from public.events where slug in (${PGSEED}))||'|'||(select count(*) from public.workspaces where id in (select 'custom:event-' || s from unnest(array[${PGSEED}]) s))"
chkrole anon "" "重跑之後沒登入的人還是叫得到對外兩支" "5|1" "select (select count(*) from public.public_events() where slug in (${PGSEED}))||'|'||(select count(*) from public.public_event('coffee-chat'))"
echo "── 活動的照片（2027-01-01-event-photos.sql）──"
# 這時候：PAUL Co-President、AMT 是 AMTEAM 的「改」、AMV 是 AMTEAM 的「看」、AMX 是不在任何 team 的幹部、STU 是學員。
# PGEV 是上一段那一筆 pg-no-date：AMTEAM 的活動、已經在對外頁上。
EPURL="https://norjaglyaotzewxavmhv.supabase.co/storage/v1/object/public/events/${PGEV}"
epg=$(psql -d "${DB}" -X -A -t -q -v ON_ERROR_STOP=1 -f supabase/migrations/2027-01-01-event-photos.sql 2>&1 || true)
if echo "${epg}" | grep -q "OVERALL.*PASS" && ! echo "${epg}" | grep -q "|FAIL"; then echo "  ok   活動照片那支驗收表全 PASS"; pass=$((pass+1)); else echo "  FAIL 活動照片那支驗收表："; echo "${epg}" | head -14; fail=$((fail+1)); fi
epg2=$(psql -d "${DB}" -X -A -t -q -v ON_ERROR_STOP=1 -f supabase/migrations/2027-01-01-event-photos.sql 2>&1 || true)
if echo "${epg2}" | grep -q "OVERALL.*PASS" && ! echo "${epg2}" | grep -q "|FAIL"; then echo "  ok   活動照片那支重跑一次也全 PASS"; pass=$((pass+1)); else echo "  FAIL 重跑：${epg2}" | head -5; fail=$((fail+1)); fi
chkrole anon "" "還沒有照片的時候，對外那一支回一個空的 photos" "0" "select jsonb_array_length(public.public_event_extras('pg-no-date')->'photos')"
EP1=$(psql -d "${DB}" -X -A -t -q -c "select set_config('test.uid','${AMT}',false);" -c "select public.add_event_photo('${PGEV}','${EPURL}/a.jpg')" 2>&1 | tail -1 | tr -d ' \n')
case "${EP1}" in ????????-*) echo "  ok   team 是「改」的人加了一張照片（${EP1}）"; pass=$((pass+1));; *) echo "  FAIL 加照片失敗：${EP1}"; fail=$((fail+1));; esac
chk "★ 新加的照片同意是沒勾，排在 10" "false|10" "select consent::text||'|'||sort from public.event_photos where id='${EP1}'"
chkraise "★ 不在這個 team 的幹部加不了照片（not_event_editor）" "not_event_editor" \
  "perform set_config('test.uid','${AMX}',true); perform public.add_event_photo('${PGEV}','${EPURL}/x.jpg');"
chkraise "★ team 是「看」的人加不了照片（not_event_editor）" "not_event_editor" \
  "perform set_config('test.uid','${AMV}',true); perform public.add_event_photo('${PGEV}','${EPURL}/x.jpg');"
chkraise "★ 學員加不了照片（not_event_editor）" "not_event_editor" \
  "perform set_config('test.uid','${STU}',true); perform public.add_event_photo('${PGEV}','${EPURL}/x.jpg');"
chkraise "網址不是 https 擋（photo_not_https）" "photo_not_https" \
  "perform set_config('test.uid','${AMT}',true); perform public.add_event_photo('${PGEV}','http://x/a.jpg');"
chkraise "活動不存在擋（no_such_event）" "no_such_event" \
  "perform set_config('test.uid','${AMT}',true); perform public.add_event_photo('00000000-0000-0000-0000-000000000000','${EPURL}/x.jpg');"
chkrole anon "" "★ 沒勾同意的照片對外看不到（photos 還是空的）" "0" "select jsonb_array_length(public.public_event_extras('pg-no-date')->'photos')"
chkraise "★ 不在這個 team 的幹部勾不了同意（not_event_editor）" "not_event_editor" \
  "perform set_config('test.uid','${AMX}',true); perform public.set_event_photo_consent('${EP1}', true);"
chkas "${AMT}" "team 是「改」的人勾同意" "true" "select public.set_event_photo_consent('${EP1}', true)::text"
chkrole anon "" "★ 勾了同意，沒登入的人拿得到那一張，而且只有網址（沒有 id、誰傳的、同意）" "1|${EPURL}/a.jpg|url" \
  "select jsonb_array_length(j->'photos')||'|'||(j->'photos'->0->>'url')||'|'||(select string_agg(k, ',') from jsonb_object_keys(j->'photos'->0) k) from public.public_event_extras('pg-no-date') j"
chkrole anon "" "對外那一支現在只有 photos 一個鍵（之後講者、票種加在旁邊）" "photos" "select string_agg(k, ',') from jsonb_object_keys(public.public_event_extras('pg-no-date')) k"
chkrole authenticated "${STU}" "登入的學員也叫得到對外那一支" "1" "select jsonb_array_length(public.public_event_extras('pg-no-date')->'photos')"
EP2=$(psql -d "${DB}" -X -A -t -q -c "select set_config('test.uid','${PAUL}',false);" -c "select public.add_event_photo('${PGEV}','${EPURL}/b.jpg')" 2>&1 | tail -1 | tr -d ' \n')
case "${EP2}" in ????????-*) echo "  ok   Co-President 再加一張（沒勾同意）"; pass=$((pass+1));; *) echo "  FAIL Co-President 加照片失敗：${EP2}"; fail=$((fail+1));; esac
chkrole anon "" "★ 第二張沒勾同意，對外還是只有一張" "1" "select jsonb_array_length(public.public_event_extras('pg-no-date')->'photos')"
chkas "${AMT}" "後台讀得到兩張（含沒勾同意的），照順序" "2|true|false" \
  "select jsonb_array_length(j)||'|'||(j->0->>'consent')||'|'||(j->1->>'consent') from public.event_photos_list('${PGEV}') j"
chkraise "★ 不在這個 team 的幹部讀不到這一場的照片清單（not_event_editor）" "not_event_editor" \
  "perform set_config('test.uid','${AMX}',true); perform public.event_photos_list('${PGEV}');"
chkas "${PAUL}" "第二張也勾同意" "true" "select public.set_event_photo_consent('${EP2}', true)::text"
chkraise "★ 不在這個 team 的幹部排不了順序（not_event_editor）" "not_event_editor" \
  "perform set_config('test.uid','${AMX}',true); perform public.reorder_event_photos('${PGEV}', array['${EP2}','${EP1}']::uuid[]);"
chkas "${AMT}" "排順序：第二張搬到前面" "2" "select public.reorder_event_photos('${PGEV}', array['${EP2}','${EP1}']::uuid[])"
chkrole anon "" "★ 對外照新的順序" "${EPURL}/b.jpg,${EPURL}/a.jpg" \
  "select string_agg(p->>'url', ',' order by n) from jsonb_array_elements(public.public_event_extras('pg-no-date')->'photos') with ordinality x(p, n)"
# 直接讀表：沒登入的人、登入的幹部、Co-President 都讀不到（沒有政策也沒發權限），只能走函式。
epan=$(psql -d "${DB}" -X -A -t -q -c "set role anon; select count(*) from public.event_photos;" 2>&1 || true)
if echo "${epan}" | grep -qi "permission denied"; then echo "  ok   ★ anon 讀不到 event_photos 表本身"; pass=$((pass+1)); else echo "  FAIL anon 讀得到 event_photos 表：${epan}"; fail=$((fail+1)); fi
epau=$(psql -d "${DB}" -X -A -t -q -c "select set_config('test.uid','${PAUL}',false);" -c "set role authenticated; select count(*) from public.event_photos;" 2>&1 || true)
if echo "${epau}" | grep -qi "permission denied"; then echo "  ok   ★ 登入的人（就算是 Co-President）也讀不到表本身，只能走函式"; pass=$((pass+1)); else echo "  FAIL 登入的人直接讀得到 event_photos 表：${epau}"; fail=$((fail+1)); fi
epaw=$(psql -d "${DB}" -X -A -t -q -c "select set_config('test.uid','${AMT}',false);" -c "set role authenticated; insert into public.event_photos (event_id, url, consent) values ('${PGEV}','${EPURL}/z.jpg', true);" 2>&1 || true)
if echo "${epaw}" | grep -qi "permission denied"; then echo "  ok   ★ 登入的人直接寫不進表（繞不過函式自己把同意寫成勾了）"; pass=$((pass+1)); else echo "  FAIL 登入的人直接寫得進 event_photos 表：${epaw}"; fail=$((fail+1)); fi
epaf=$(psql -d "${DB}" -X -A -t -q -c "set role anon; select public.add_event_photo('${PGEV}','${EPURL}/x.jpg');" 2>&1 || true)
if echo "${epaf}" | grep -qi "permission denied"; then echo "  ok   ★ 沒登入的人叫不到 add_event_photo()"; pass=$((pass+1)); else echo "  FAIL 沒登入的人叫得到 add_event_photo()：${epaf}"; fail=$((fail+1)); fi
epad=$(psql -d "${DB}" -X -A -t -q -c "set role anon; select public.delete_event_photo('${EP1}');" 2>&1 || true)
if echo "${epad}" | grep -qi "permission denied"; then echo "  ok   ★ 沒登入的人叫不到 delete_event_photo()"; pass=$((pass+1)); else echo "  FAIL 沒登入的人叫得到 delete_event_photo()：${epad}"; fail=$((fail+1)); fi
# 破壞測試：有人直接把同意改掉，對外那一張就不見（門在函式裡，不在畫面上）。
psql -d "${DB}" -X -A -t -q -c "update public.event_photos set consent=false where id='${EP2}';" >/dev/null
chkrole anon "" "★ 破壞測試：直接把同意改掉，對外就少那一張" "1|${EPURL}/a.jpg" "select jsonb_array_length(j->'photos')||'|'||(j->'photos'->0->>'url') from public.public_event_extras('pg-no-date') j"
psql -d "${DB}" -X -A -t -q -c "update public.event_photos set consent=true where id='${EP2}';" >/dev/null
# 沒上架的活動：草稿、撤下來的、代號不存在的，一律回空值，就算照片的同意都勾了。
EPD=$(psql -d "${DB}" -X -A -t -q -c "select set_config('test.uid','${PAUL}',false);" -c "select public.create_event('${AMTEAM}','ep-draft','照片測試','Photo test',false)" 2>&1 | tail -1 | tr -d ' \n')
case "${EPD}" in ????????-*) echo "  ok   （準備）開一場草稿活動（${EPD}）"; pass=$((pass+1));; *) echo "  FAIL 開草稿活動失敗：${EPD}"; fail=$((fail+1));; esac
chkas "${AMT}" "草稿活動也可以先放照片、先勾同意" "true" \
  "select public.set_event_photo_consent(public.add_event_photo('${EPD}','https://norjaglyaotzewxavmhv.supabase.co/storage/v1/object/public/events/${EPD}/d.jpg'), true)::text"
chkrole anon "" "★ 草稿活動對外什麼都不回（空值），照片勾了同意也一樣" "true" "select (public.public_event_extras('ml-draft') is null)::text"
chkrole anon "" "代號不存在也是空值" "true" "select (public.public_event_extras('no-such-event') is null)::text"
psql -d "${DB}" -X -A -t -q -c "update public.events set status='archived' where id='${PGEV}';" >/dev/null
chkrole anon "" "★ 活動撤下來之後，對外那一支也回空值" "true" "select (public.public_event_extras('pg-no-date') is null)::text"
psql -d "${DB}" -X -A -t -q -c "update public.events set status='published' where id='${PGEV}';" >/dev/null
chkrole anon "" "（還原）放回對外頁，兩張都回來了" "2" "select jsonb_array_length(public.public_event_extras('pg-no-date')->'photos')"
# 一場最多 30 張。
psql -d "${DB}" -X -A -t -q -c "insert into public.event_photos (event_id, url) select '${EPD}', 'https://x/' || g || '.jpg' from generate_series(1, 29) g;" >/dev/null
chkraise "一場最多 30 張，第 31 張擋（too_many_photos）" "too_many_photos" \
  "perform set_config('test.uid','${AMT}',true); perform public.add_event_photo('${EPD}','https://x/31.jpg');"
# 拿掉一張
chkraise "★ 不在這個 team 的幹部拿不掉照片（not_event_editor）" "not_event_editor" \
  "perform set_config('test.uid','${AMX}',true); perform public.delete_event_photo('${EP1}');"
chkraise "★ team 是「看」的人拿不掉照片（not_event_editor）" "not_event_editor" \
  "perform set_config('test.uid','${AMV}',true); perform public.delete_event_photo('${EP1}');"
chkraise "照片不存在擋（no_such_photo）" "no_such_photo" \
  "perform set_config('test.uid','${AMT}',true); perform public.delete_event_photo('00000000-0000-0000-0000-000000000000');"
chkas "${AMT}" "team 是「改」的人拿掉一張，拿回它的網址（後台拿去刪 Storage 的檔）" "${EPURL}/a.jpg" "select public.delete_event_photo('${EP1}')"
chkrole anon "" "對外剩一張" "1|${EPURL}/b.jpg" "select jsonb_array_length(j->'photos')||'|'||(j->'photos'->0->>'url') from public.public_event_extras('pg-no-date') j"
# 活動刪掉，照片那幾列跟著走（on delete cascade）。
psql -d "${DB}" -X -A -t -q -c "delete from public.events where id='${EPD}';" >/dev/null 2>&1 || true
chk "活動刪掉，它的照片也跟著刪掉" "0|0" "select (select count(*) from public.events where id='${EPD}')||'|'||(select count(*) from public.event_photos where event_id='${EPD}')"
# Storage 政策（替身表）：幹部傳得上 events bucket，學員不行；沒登入的人讀得到（對外頁要用 <img>）。
chk "Storage：events bucket 是公開的，四條政策都在" "true|4" \
  "select (select public::text from storage.buckets where id='events')||'|'||(select count(*) from pg_policies where schemaname='storage' and tablename='objects' and policyname in ('events_read','events_insert','events_update','events_delete'))"
chkrole authenticated "${AMT}" "★ Storage：幹部傳得上 events bucket" "1" \
  "insert into storage.objects (bucket_id, name, owner) values ('events','${PGEV}/a.jpg','${AMT}'); select count(*) from storage.objects where bucket_id='events'"
epst=$(psql -d "${DB}" -X -A -t -q -c "select set_config('test.uid','${STU}',false);" -c "set role authenticated; insert into storage.objects (bucket_id, name, owner) values ('events','${PGEV}/x.jpg','${STU}');" 2>&1 || true)
if echo "${epst}" | grep -qi "row-level security"; then echo "  ok   ★ 破壞測試：學員傳不上 events bucket（RLS）"; pass=$((pass+1)); else echo "  FAIL 學員傳得上 events bucket：${epst}"; fail=$((fail+1)); fi
chkrole anon "" "Storage：沒登入的人讀得到 events bucket 的檔" "1" "select count(*) from storage.objects where bucket_id='events'"
psql -d "${DB}" -q -c "delete from storage.objects where bucket_id='events';" >/dev/null
# 沒動到的：對外原本那兩支的欄位、save_event() 的門。
chk "★ public_events() 還是 24 欄（這一支沒有動它）" "24" "select array_length(proargnames,1) from pg_proc where proname='public_events' and pronamespace='public'::regnamespace"
# 破壞測試
BROKEN=$(mktemp)
sed "s/from event_photos p where p.event_id = e.id and p.consent), '\[\]'::jsonb))/from event_photos p where p.event_id = e.id), '[]'::jsonb))/" supabase/migrations/2027-01-01-event-photos.sql > "${BROKEN}"
bk=$(psql -d "${DB}" -X -A -t -q -f "${BROKEN}" 2>&1 || true)
if echo "${bk}" | grep -q "OVERALL.*FAIL"; then echo "  ok   ★ 破壞測試：對外那一支拿掉「只回同意勾了的」，驗收表變紅"; pass=$((pass+1)); else echo "  FAIL 拿掉同意的門驗收表沒變紅"; fail=$((fail+1)); fi
sed "s/   where e.slug = p_slug and e.status = 'published';/   where e.slug = p_slug;/" supabase/migrations/2027-01-01-event-photos.sql > "${BROKEN}"
bk=$(psql -d "${DB}" -X -A -t -q -f "${BROKEN}" 2>&1 || true)
if echo "${bk}" | grep -q "OVERALL.*FAIL"; then echo "  ok   ★ 破壞測試：對外那一支拿掉「只回 published」，驗收表變紅"; pass=$((pass+1)); else echo "  FAIL 拿掉 published 的門驗收表沒變紅"; fail=$((fail+1)); fi
sed "s/^revoke all on public.event_photos from public, anon, authenticated;$/grant select on public.event_photos to authenticated;/" supabase/migrations/2027-01-01-event-photos.sql > "${BROKEN}"
bk=$(psql -d "${DB}" -X -A -t -q -f "${BROKEN}" 2>&1 || true)
if echo "${bk}" | grep -q "OVERALL.*FAIL"; then echo "  ok   ★ 破壞測試：把表的讀取權限發給登入的人，驗收表變紅"; pass=$((pass+1)); else echo "  FAIL 發了表的權限驗收表沒變紅"; fail=$((fail+1)); fi
rm -f "${BROKEN}"
epg3=$(psql -d "${DB}" -X -A -t -q -v ON_ERROR_STOP=1 -f supabase/migrations/2027-01-01-event-photos.sql 2>&1 || true)
if echo "${epg3}" | grep -q "OVERALL.*PASS" && ! echo "${epg3}" | grep -q "|FAIL"; then echo "  ok   裝回正確版，驗收表又全 PASS"; pass=$((pass+1)); else echo "  FAIL 裝回之後驗收表沒過："; echo "${epg3}" | head -14; fail=$((fail+1)); fi
chkrole anon "" "重跑之後照片還在，沒登入的人照樣拿得到" "1" "select jsonb_array_length(public.public_event_extras('pg-no-date')->'photos')"
echo "── 講者、報名類型、封面沒勾同意不對外（2027-01-02-event-speakers-tickets.sql）──"
# 這時候：PAUL Co-President、AMT 是 AMTEAM 的「改」（讀不到名錄）、AMV 是 AMTEAM 的「看」而且紀錄是「看」（讀得到名錄）、AMX 不在任何 team、STU 學員。
# PGEV 是 pg-no-date：AMTEAM 的活動、在對外頁上、沒有報名表、上一段留了一張勾了同意的照片（b.jpg）。
# 先記下這一支跑之前的樣子：封面沒勾同意的照樣對外（這就是要補的洞）。
psql -d "${DB}" -X -A -t -q -c "update public.events set cover_url='https://x/cover-1.jpg', cover_consent=false where id='${PGEV}';" >/dev/null
chkrole anon "" "（跑這一支之前）封面沒勾同意也對外，洞是真的" "https://x/cover-1.jpg" "select cover_url from public.public_event('pg-no-date')"
stk=$(psql -d "${DB}" -X -A -t -q -v ON_ERROR_STOP=1 -f supabase/migrations/2027-01-02-event-speakers-tickets.sql 2>&1 || true)
if echo "${stk}" | grep -q "OVERALL.*PASS" && ! echo "${stk}" | grep -q "|FAIL"; then echo "  ok   講者與報名類型那支驗收表全 PASS"; pass=$((pass+1)); else echo "  FAIL 講者與報名類型那支驗收表："; echo "${stk}" | head -18; fail=$((fail+1)); fi
stk2=$(psql -d "${DB}" -X -A -t -q -v ON_ERROR_STOP=1 -f supabase/migrations/2027-01-02-event-speakers-tickets.sql 2>&1 || true)
if echo "${stk2}" | grep -q "OVERALL.*PASS" && ! echo "${stk2}" | grep -q "|FAIL"; then echo "  ok   講者與報名類型那支重跑一次也全 PASS"; pass=$((pass+1)); else echo "  FAIL 重跑：${stk2}" | head -5; fail=$((fail+1)); fi
# ── C. 封面的同意，兩個方向 ──
chkrole anon "" "★ 封面沒勾同意：對外兩支都不回封面（空值），那一場還在" "1|true|true" \
  "select count(*)||'|'||bool_and(cover_url is null)||'|'||(select cover_url is null from public.public_events() where slug='pg-no-date') from public.public_event('pg-no-date')"
psql -d "${DB}" -X -A -t -q -c "update public.events set cover_consent=true where id='${PGEV}';" >/dev/null
chkrole anon "" "★ 封面勾了同意：對外兩支都回那張封面" "https://x/cover-1.jpg|https://x/cover-1.jpg" \
  "select (select cover_url from public.public_event('pg-no-date'))||'|'||(select cover_url from public.public_events() where slug='pg-no-date')"
chkas "${AMT}" "★ 已經上架的活動換封面：同意退回沒勾，對外馬上不回封面（新的那張要重新勾才出得去）" "false|true" \
  "select public.save_event('${PGEV}', '{\"cover_url\":\"https://x/cover-2.jpg\"}'::jsonb); select (select cover_consent::text from public.events where id='${PGEV}')||'|'||(select (cover_url is null)::text from public.public_event('pg-no-date'))"
chkas "${AMT}" "重新勾同意，新封面才對外" "https://x/cover-2.jpg" \
  "select public.save_event('${PGEV}', '{\"cover_consent\":true}'::jsonb); select cover_url from public.public_event('pg-no-date')"
chk "★ public_events() 還是 24 欄，順序沒動（create or replace 蓋過去的，沒有 drop）" "24|slug|cover_url|is_past|edition_en" \
  "select array_length(proargnames,1)||'|'||proargnames[1]||'|'||proargnames[9]||'|'||proargnames[20]||'|'||proargnames[24] from pg_proc where proname='public_events' and pronamespace='public'::regnamespace"
psql -d "${DB}" -X -A -t -q -c "update public.events set cover_url=null, cover_consent=false where id='${PGEV}';" >/dev/null
# ── A. 講者 ──
chkrole anon "" "對外那一支現在有三個鍵，照片那一張還在" "photos,speakers,tickets|1|0|0" \
  "select (select string_agg(k, ',' order by k) from jsonb_object_keys(j) k)||'|'||jsonb_array_length(j->'photos')||'|'||jsonb_array_length(j->'speakers')||'|'||jsonb_array_length(j->'tickets') from public.public_event_extras('pg-no-date') j"
SPK1=$(psql -d "${DB}" -X -A -t -q -c "select set_config('test.uid','${AMT}',false);" -c "select public.save_event_speaker('${PGEV}', null, '{\"display_name\":\"Annie\",\"subject\":\"Computer Science\",\"school\":\"UCLA\",\"photo_url\":\"${EPURL}/s1.jpg\"}'::jsonb)" 2>&1 | tail -1 | tr -d ' \n')
case "${SPK1}" in ????????-*) echo "  ok   team 是「改」的人打字加了一位講者（${SPK1}）"; pass=$((pass+1));; *) echo "  FAIL 加講者失敗：${SPK1}"; fail=$((fail+1));; esac
chk "★ 新加的講者同意是沒勾，排在 10，沒有連到紀錄裡的人" "false|10|true" "select consent::text||'|'||sort||'|'||(person_id is null)::text from public.event_speakers where id='${SPK1}'"
chkrole anon "" "★ 沒勾同意的講者對外看不到（speakers 是空的）" "0" "select jsonb_array_length(public.public_event_extras('pg-no-date')->'speakers')"
chkraise "★ 不在這個 team 的幹部加不了講者（not_event_editor）" "not_event_editor" \
  "perform set_config('test.uid','${AMX}',true); perform public.save_event_speaker('${PGEV}', null, '{\"display_name\":\"X\"}'::jsonb);"
chkraise "★ team 是「看」的人加不了講者（not_event_editor）" "not_event_editor" \
  "perform set_config('test.uid','${AMV}',true); perform public.save_event_speaker('${PGEV}', null, '{\"display_name\":\"X\"}'::jsonb);"
chkraise "★ 學員加不了講者（not_event_editor）" "not_event_editor" \
  "perform set_config('test.uid','${STU}',true); perform public.save_event_speaker('${PGEV}', null, '{\"display_name\":\"X\"}'::jsonb);"
chkraise "★ 不在這個 team 的幹部讀不到講者清單（not_event_editor）" "not_event_editor" \
  "perform set_config('test.uid','${AMX}',true); perform public.event_speakers_list('${PGEV}');"
chkraise "★ 不在這個 team 的幹部勾不了講者的同意（not_event_editor）" "not_event_editor" \
  "perform set_config('test.uid','${AMX}',true); perform public.set_event_speaker_consent('${SPK1}', true);"
chkraise "★ 不在這個 team 的幹部拿不掉講者（not_event_editor）" "not_event_editor" \
  "perform set_config('test.uid','${AMX}',true); perform public.delete_event_speaker('${SPK1}');"
chkraise "★ 不在這個 team 的幹部排不了講者的順序（not_event_editor）" "not_event_editor" \
  "perform set_config('test.uid','${AMX}',true); perform public.reorder_event_speakers('${PGEV}', array['${SPK1}']::uuid[]);"
chkraise "名字空的擋（speaker_no_name）" "speaker_no_name" \
  "perform set_config('test.uid','${AMT}',true); perform public.save_event_speaker('${PGEV}', null, '{\"display_name\":\"  \"}'::jsonb);"
chkraise "照片網址不是 https 擋（photo_not_https）" "photo_not_https" \
  "perform set_config('test.uid','${AMT}',true); perform public.save_event_speaker('${PGEV}', null, '{\"display_name\":\"X\",\"photo_url\":\"http://x/a.jpg\"}'::jsonb);"
chkraise "講者不存在擋（no_such_speaker）" "no_such_speaker" \
  "perform set_config('test.uid','${AMT}',true); perform public.save_event_speaker('${PGEV}', '00000000-0000-0000-0000-000000000000', '{\"display_name\":\"X\"}'::jsonb);"
chkas "${AMT}" "team 是「改」的人勾講者的同意" "true" "select public.set_event_speaker_consent('${SPK1}', true)::text"
chkrole anon "" "★ 勾了同意，沒登入的人拿得到那一位，而且只有四個鍵（沒有 id、person_id、同意、誰加的）" "1|Annie|ComputerScience|UCLA|${EPURL}/s1.jpg|name,photo_url,school,subject" \
  "select jsonb_array_length(j->'speakers')||'|'||(j->'speakers'->0->>'name')||'|'||(j->'speakers'->0->>'subject')||'|'||(j->'speakers'->0->>'school')||'|'||(j->'speakers'->0->>'photo_url')||'|'||(select string_agg(k, ',' order by k) from jsonb_object_keys(j->'speakers'->0) k) from public.public_event_extras('pg-no-date') j"
chkrole authenticated "${STU}" "登入的學員也叫得到對外那一支，看到的一樣" "1" "select jsonb_array_length(public.public_event_extras('pg-no-date')->'speakers')"
# 從紀錄挑人：AMT 讀不到名錄，帶了 person_id 也當沒帶；AMV 讀得到名錄但這場只有「看」；Co-President 兩樣都有。
SPKP=$(psql -d "${DB}" -X -A -t -q -c "insert into public.people (name_zh, name_en, kind, email, school) values ('講者甲', 'Speaker Person', 'member', 'speaker-secret@example.com', 'NTU') returning id" | head -1 | tr -d ' \n')
chkas "${AMT}" "★ 讀不到名錄的人（rc_can_view 是 false）帶了 person_id：講者加得成，但沒有連到那個人" "false|true" \
  "select public.save_event_speaker('${PGEV}', null, '{\"display_name\":\"Ben\",\"person_id\":\"${SPKP}\"}'::jsonb); select public.rc_can_view()::text||'|'||(select (person_id is null)::text from public.event_speakers where event_id='${PGEV}' and display_name='Ben')"
chkas "${AMT}" "★ 這一支沒有多開讀名錄的路：這場「改」的人照樣讀不到名錄" "0|0" "select jsonb_array_length(public.rc_directory())||'|'||jsonb_array_length(public.rc_find_people(''))"
SPK2=$(psql -d "${DB}" -X -A -t -q -c "select set_config('test.uid','${PAUL}',false);" -c "select public.save_event_speaker('${PGEV}', null, '{\"display_name\":\"Speaker\",\"subject\":\"Economics\",\"school\":\"NTU\",\"person_id\":\"${SPKP}\"}'::jsonb)" 2>&1 | tail -1 | tr -d ' \n')
case "${SPK2}" in ????????-*) echo "  ok   Co-President 從紀錄挑一個人當講者（${SPK2}）"; pass=$((pass+1));; *) echo "  FAIL 從紀錄挑人失敗：${SPK2}"; fail=$((fail+1));; esac
chk "讀得到名錄的人挑的，連到紀錄裡那個人；同意還是沒勾" "true|false" "select (person_id='${SPKP}')::text||'|'||consent::text from public.event_speakers where id='${SPK2}'"
chkraise "紀錄裡沒有這個人擋（no_such_person）" "no_such_person" \
  "perform set_config('test.uid','${PAUL}',true); perform public.save_event_speaker('${PGEV}', null, '{\"display_name\":\"X\",\"person_id\":\"00000000-0000-0000-0000-000000000000\"}'::jsonb);"
chkas "${PAUL}" "第二位也勾同意" "true" "select public.set_event_speaker_consent('${SPK2}', true)::text"
chkrole anon "" "★ 對外的講者整段沒有紀錄裡的 email、沒有 person_id、沒有任何 id" "0" \
  "select count(*) from public.public_event_extras('pg-no-date') j where j::text like '%speaker-secret%' or j::text like '%${SPKP}%' or j::text like '%${SPK1}%' or j::text like '%${SPK2}%' or j::text like '%person_id%'"
chkas "${AMT}" "後台讀得到三位（含沒勾同意的 Ben），照順序" "3|Annie,Ben,Speaker|true,false,true" \
  "select jsonb_array_length(j)||'|'||(select string_agg(x->>'display_name', ',' order by n) from jsonb_array_elements(j) with ordinality y(x, n))||'|'||(select string_agg(x->>'consent', ',' order by n) from jsonb_array_elements(j) with ordinality y(x, n)) from public.event_speakers_list('${PGEV}') j"
chkrole anon "" "★ 對外只有勾了同意的兩位，Ben 不在" "Annie,Speaker" \
  "select string_agg(x->>'name', ',' order by n) from jsonb_array_elements(public.public_event_extras('pg-no-date')->'speakers') with ordinality y(x, n)"
chkas "${AMT}" "排順序：第二位搬到最前面" "2" "select public.reorder_event_speakers('${PGEV}', array['${SPK2}','${SPK1}']::uuid[])"
chkrole anon "" "★ 對外照新的順序" "Speaker,Annie" \
  "select string_agg(x->>'name', ',' order by n) from jsonb_array_elements(public.public_event_extras('pg-no-date')->'speakers') with ordinality y(x, n)"
chkas "${AMT}" "★ 改了名字，同意退回沒勾，對外就少那一位" "false|Speaker" \
  "select public.save_event_speaker('${PGEV}', '${SPK1}', '{\"display_name\":\"Annie Chen\"}'::jsonb); select (select consent::text from public.event_speakers where id='${SPK1}')||'|'||(select string_agg(x->>'name', ',') from jsonb_array_elements(public.public_event_extras('pg-no-date')->'speakers') x)"
chkas "${AMT}" "只改主題與學校，同意不動" "true|Econ|台大" \
  "select public.save_event_speaker('${PGEV}', '${SPK2}', '{\"subject\":\"Econ\",\"school\":\"台大\"}'::jsonb); select consent::text||'|'||subject||'|'||school from public.event_speakers where id='${SPK2}'"
chkas "${AMT}" "★ 換了照片，同意也退回沒勾" "false" \
  "select public.save_event_speaker('${PGEV}', '${SPK2}', '{\"photo_url\":\"${EPURL}/s2.jpg\"}'::jsonb); select consent::text from public.event_speakers where id='${SPK2}'"
chkas "${PAUL}" "（還原）兩位都重新勾同意" "true|true" "select public.set_event_speaker_consent('${SPK1}', true)::text||'|'||public.set_event_speaker_consent('${SPK2}', true)::text"
# 破壞測試：有人直接把同意改掉，對外那一位就不見（門在函式裡，不在畫面上）。
psql -d "${DB}" -X -A -t -q -c "update public.event_speakers set consent=false where id='${SPK2}';" >/dev/null
chkrole anon "" "★ 破壞測試：直接把講者的同意改掉，對外就少那一位" "1|AnnieChen" "select jsonb_array_length(j->'speakers')||'|'||(j->'speakers'->0->>'name') from public.public_event_extras('pg-no-date') j"
psql -d "${DB}" -X -A -t -q -c "update public.event_speakers set consent=true where id='${SPK2}';" >/dev/null
# 直接讀寫表：沒登入的人、登入的人都不行，只能走函式。
span=$(psql -d "${DB}" -X -A -t -q -c "set role anon; select count(*) from public.event_speakers;" 2>&1 || true)
if echo "${span}" | grep -qi "permission denied"; then echo "  ok   ★ anon 讀不到 event_speakers 表本身"; pass=$((pass+1)); else echo "  FAIL anon 讀得到 event_speakers 表：${span}"; fail=$((fail+1)); fi
spau=$(psql -d "${DB}" -X -A -t -q -c "select set_config('test.uid','${PAUL}',false);" -c "set role authenticated; select count(*) from public.event_speakers;" 2>&1 || true)
if echo "${spau}" | grep -qi "permission denied"; then echo "  ok   ★ 登入的人（就算是 Co-President）也讀不到 event_speakers 表本身"; pass=$((pass+1)); else echo "  FAIL 登入的人直接讀得到 event_speakers 表：${spau}"; fail=$((fail+1)); fi
spaw=$(psql -d "${DB}" -X -A -t -q -c "select set_config('test.uid','${AMT}',false);" -c "set role authenticated; insert into public.event_speakers (event_id, display_name, consent) values ('${PGEV}','直接寫', true);" 2>&1 || true)
if echo "${spaw}" | grep -qi "permission denied"; then echo "  ok   ★ 登入的人直接寫不進 event_speakers（繞不過函式自己把同意寫成勾了）"; pass=$((pass+1)); else echo "  FAIL 登入的人直接寫得進 event_speakers：${spaw}"; fail=$((fail+1)); fi
spaf=$(psql -d "${DB}" -X -A -t -q -c "set role anon; select public.save_event_speaker('${PGEV}', null, '{\"display_name\":\"X\"}'::jsonb);" 2>&1 || true)
if echo "${spaf}" | grep -qi "permission denied"; then echo "  ok   ★ 沒登入的人叫不到 save_event_speaker()"; pass=$((pass+1)); else echo "  FAIL 沒登入的人叫得到 save_event_speaker()：${spaf}"; fail=$((fail+1)); fi
# 紀錄那邊忘記這個人：他當講者的那一列跟著刪，對外馬上不見。
chkas "${PAUL}" "★ 紀錄那邊忘記這個人（forget_person）：他當講者的那一列跟著刪掉，對外只剩另一位" "0|AnnieChen" \
  "select public.forget_person('${SPKP}'); select (select count(*) from public.event_speakers where id='${SPK2}')||'|'||(select string_agg(x->>'name', ',') from jsonb_array_elements(public.public_event_extras('pg-no-date')->'speakers') x)"
chkraise "忘記之後不能再把他連成講者（no_such_person）" "no_such_person" \
  "perform set_config('test.uid','${PAUL}',true); perform public.save_event_speaker('${PGEV}', null, '{\"display_name\":\"X\",\"person_id\":\"${SPKP}\"}'::jsonb);"
chkraise "★ team 是「看」的人拿不掉講者（not_event_editor）" "not_event_editor" \
  "perform set_config('test.uid','${AMV}',true); perform public.delete_event_speaker('${SPK1}');"
chkas "${AMT}" "team 是「改」的人拿掉一位，拿回照片網址（後台拿去刪 Storage 的檔）" "${EPURL}/s1.jpg" "select public.delete_event_speaker('${SPK1}')"
psql -d "${DB}" -X -A -t -q -c "update public.events set status='archived' where id='${PGEV}';" >/dev/null
chkrole anon "" "★ 活動撤下來，對外那一支回空值（講者、類型都不回）" "true" "select (public.public_event_extras('pg-no-date') is null)::text"
psql -d "${DB}" -X -A -t -q -c "update public.events set status='published' where id='${PGEV}';" >/dev/null
# ── B. 報名類型 ──
# 開一場有報名表的活動（AMTEAM），表單開著、活動在對外頁上、活動本身名額 3。四個學員帳號。
TKU1=88880000-0000-0000-0000-0000000000f1; TKU2=88880000-0000-0000-0000-0000000000f2; TKU3=88880000-0000-0000-0000-0000000000f3; TKU4=88880000-0000-0000-0000-0000000000f4; TKU5=88880000-0000-0000-0000-0000000000f5
psql -d "${DB}" -q -v ON_ERROR_STOP=1 <<SQL
insert into auth.users (id,email) values ('${TKU1}','tk1@example.com'), ('${TKU2}','tk2@example.com'), ('${TKU3}','tk3@example.com'), ('${TKU4}','tk4@example.com'), ('${TKU5}','tk5@example.com');
insert into public.profiles (id,name_zh,role) values ('${TKU1}','類型一號','student'), ('${TKU2}','類型二號','student'), ('${TKU3}','類型三號','student'), ('${TKU4}','類型四號','student'), ('${TKU5}','類型五號','student');
SQL
TKEV=$(psql -d "${DB}" -X -A -t -q -c "select set_config('test.uid','${PAUL}',false);" -c "select public.create_event('${AMTEAM}','tk-smoke','類型測試','Ticket smoke',true)" 2>&1 | tail -1 | tr -d ' \n')
TKF=$(psql -d "${DB}" -X -A -t -q -c "select form_id from public.events where id='${TKEV}'" | tr -d ' \n')
TKEV2=$(psql -d "${DB}" -X -A -t -q -c "select set_config('test.uid','${PAUL}',false);" -c "select public.create_event('${AMTEAM}','tk-other','另一場','Other event',true)" 2>&1 | tail -1 | tr -d ' \n')
TKF2=$(psql -d "${DB}" -X -A -t -q -c "select form_id from public.events where id='${TKEV2}'" | tr -d ' \n')
psql -d "${DB}" -X -A -t -q -c "update public.forms set status='open' where id in ('${TKF}','${TKF2}');" -c "update public.events set status='published', capacity=3 where id='${TKEV}';" -c "update public.events set status='published' where id='${TKEV2}';" >/dev/null
case "${TKF}" in ????????-*) echo "  ok   （準備）兩場有報名表的活動都在對外頁上"; pass=$((pass+1));; *) echo "  FAIL 開活動失敗：${TKEV} ${TKF}"; fail=$((fail+1));; esac
# 還沒有類型：舊的叫法（三個、四個參數）照樣送得出去。
chkas "${TKU1}" "★ 活動沒有分類型，舊的叫法（不帶 p_ticket）照樣送得出去，ticket_id 是空的" "true" \
  "select public.submit_application('${TKF}', '[]'::jsonb, null); select (ticket_id is null)::text from public.applications where form_id='${TKF}' and user_id='${TKU1}'"
chkrole authenticated "${TKU1}" "★ 登入的學員用 authenticated 的身分叫得到新的那一支（四個具名參數，沒有兩支對不上）" "true" \
  "select (public.submit_application(p_form_id => '${TKF}', p_answers => '[]'::jsonb, p_guardian_email => null, p_meta => null) is not null)::text"
chk "★ submit_application 只有一支（舊的四個參數那一支拿掉了）" "1|p_form_iduuid,p_answersjsonb,p_guardian_emailtext,p_metajsonb,p_ticketuuid" \
  "select count(*)||'|'||max(pg_get_function_identity_arguments(oid)) from pg_proc where proname='submit_application' and pronamespace='public'::regnamespace"
chkraise "★ 活動沒有分類型卻帶了一個亂寫的類型（bad_ticket）" "bad_ticket" \
  "perform set_config('test.uid','${TKU2}',true); perform public.submit_application('${TKF}', '[]'::jsonb, null, null, '00000000-0000-0000-0000-000000000000');"
chkrole anon "" "還沒有類型：對外兩支都回空陣列" "0|0" "select jsonb_array_length(public.public_event_extras('tk-smoke')->'tickets')||'|'||jsonb_array_length(public.public_form_tickets('${TKF}'))"
# 加類型
TK1=$(psql -d "${DB}" -X -A -t -q -c "select set_config('test.uid','${AMT}',false);" -c "select public.save_event_ticket('${TKEV}', null, '{\"name_zh\":\"學生\",\"name_en\":\"Student\",\"note_zh\":\"高中生\",\"capacity\":\"1\"}'::jsonb)" 2>&1 | tail -1 | tr -d ' \n')
case "${TK1}" in ????????-*) echo "  ok   team 是「改」的人加了一種報名類型（${TK1}）"; pass=$((pass+1));; *) echo "  FAIL 加類型失敗：${TK1}"; fail=$((fail+1));; esac
TK2=$(psql -d "${DB}" -X -A -t -q -c "select set_config('test.uid','${AMT}',false);" -c "select public.save_event_ticket('${TKEV}', null, '{\"name_zh\":\"家長\",\"name_en\":\"Parent\"}'::jsonb)" 2>&1 | tail -1 | tr -d ' \n')
TKO=$(psql -d "${DB}" -X -A -t -q -c "select set_config('test.uid','${AMT}',false);" -c "select public.save_event_ticket('${TKEV2}', null, '{\"name_zh\":\"別場的\"}'::jsonb)" 2>&1 | tail -1 | tr -d ' \n')
chk "第二種沒填名額就是 0（不限），排在第一種後面" "0|20|1" "select capacity||'|'||sort||'|'||(select capacity from public.event_tickets where id='${TK1}') from public.event_tickets where id='${TK2}'"
chkraise "★ 不在這個 team 的幹部加不了類型（not_event_editor）" "not_event_editor" \
  "perform set_config('test.uid','${AMX}',true); perform public.save_event_ticket('${TKEV}', null, '{\"name_zh\":\"X\"}'::jsonb);"
chkraise "★ team 是「看」的人加不了類型（not_event_editor）" "not_event_editor" \
  "perform set_config('test.uid','${AMV}',true); perform public.save_event_ticket('${TKEV}', null, '{\"name_zh\":\"X\"}'::jsonb);"
chkraise "★ 學員加不了類型（not_event_editor）" "not_event_editor" \
  "perform set_config('test.uid','${STU}',true); perform public.save_event_ticket('${TKEV}', null, '{\"name_zh\":\"X\"}'::jsonb);"
chkraise "★ 不在這個 team 的幹部讀不到類型清單（not_event_editor）" "not_event_editor" \
  "perform set_config('test.uid','${AMX}',true); perform public.event_tickets_list('${TKEV}');"
chkraise "★ 不在這個 team 的幹部改不了名額（not_event_editor）" "not_event_editor" \
  "perform set_config('test.uid','${AMX}',true); perform public.save_event_ticket('${TKEV}', '${TK1}', '{\"capacity\":99}'::jsonb);"
chkraise "★ 不在這個 team 的幹部刪不了類型（not_event_editor）" "not_event_editor" \
  "perform set_config('test.uid','${AMX}',true); perform public.delete_event_ticket('${TK2}');"
chkraise "★ 不在這個 team 的幹部排不了類型的順序（not_event_editor）" "not_event_editor" \
  "perform set_config('test.uid','${AMX}',true); perform public.reorder_event_tickets('${TKEV}', array['${TK2}','${TK1}']::uuid[]);"
chkraise "中英名稱都空的擋（ticket_no_name）" "ticket_no_name" \
  "perform set_config('test.uid','${AMT}',true); perform public.save_event_ticket('${TKEV}', null, '{\"name_zh\":\" \",\"name_en\":\"\"}'::jsonb);"
chkraise "名額不是 0 以上的整數擋（bad_capacity）" "bad_capacity" \
  "perform set_config('test.uid','${AMT}',true); perform public.save_event_ticket('${TKEV}', '${TK1}', '{\"capacity\":\"-1\"}'::jsonb);"
chkraise "別場活動的類型用這一場的 id 改不到（no_such_ticket）" "no_such_ticket" \
  "perform set_config('test.uid','${AMT}',true); perform public.save_event_ticket('${TKEV}', '${TKO}', '{\"name_zh\":\"偷改\"}'::jsonb);"
chkrole anon "" "★ 沒登入的人拿得到兩種類型：鍵只有八個，照順序，還沒人報" "2|學生,家長|capacity,full,id,name_en,name_zh,note_en,note_zh,taken|1:0:false,0:0:false" \
  "select jsonb_array_length(j)||'|'||(select string_agg(x->>'name_zh', ',' order by n) from jsonb_array_elements(j) with ordinality y(x, n))||'|'||(select string_agg(k, ',' order by k) from jsonb_object_keys(j->0) k)||'|'||(select string_agg((x->>'capacity')||':'||(x->>'taken')||':'||(x->>'full'), ',' order by n) from jsonb_array_elements(j) with ordinality y(x, n)) from (select public.public_event_extras('tk-smoke')->'tickets' j) q"
chkrole anon "" "★ /apply/ 用表單 id 問，拿到同一份" "true" "select (public.public_form_tickets('${TKF}') = public.public_event_extras('tk-smoke')->'tickets')::text"
# 送出：有類型之後
chkraise "★ 活動有分類型，沒帶類型送不出去（ticket_required）" "ticket_required" \
  "perform set_config('test.uid','${TKU2}',true); perform public.submit_application('${TKF}', '[]'::jsonb, null, null);"
chkraise "★ 帶別場活動的類型送不出去（bad_ticket）" "bad_ticket" \
  "perform set_config('test.uid','${TKU2}',true); perform public.submit_application('${TKF}', '[]'::jsonb, null, null, '${TKO}');"
chkraise "帶一個不存在的類型也送不出去（bad_ticket）" "bad_ticket" \
  "perform set_config('test.uid','${TKU2}',true); perform public.submit_application('${TKF}', '[]'::jsonb, null, null, '00000000-0000-0000-0000-000000000000');"
chkrole authenticated "${TKU2}" "★ 帶對的類型送得出去，報名記著是哪一種" "true" \
  "select public.submit_application(p_form_id => '${TKF}', p_answers => '[]'::jsonb, p_ticket => '${TK1}'); select (ticket_id = '${TK1}')::text from public.applications where form_id='${TKF}' and user_id='${TKU2}'"
chkrole anon "" "★ 那一種名額 1、報了 1：對外說滿了；另一種沒滿" "1:1:true,0:0:false" \
  "select string_agg((x->>'capacity')||':'||(x->>'taken')||':'||(x->>'full'), ',' order by n) from jsonb_array_elements(public.public_form_tickets('${TKF}')) with ordinality y(x, n)"
chkraise "★ 那一種滿了，下一個人送不進來（ticket_full）" "ticket_full" \
  "perform set_config('test.uid','${TKU3}',true); perform public.submit_application('${TKF}', '[]'::jsonb, null, null, '${TK1}');"
TKA2=$(psql -d "${DB}" -X -A -t -q -c "select id from public.applications where form_id='${TKF}' and user_id='${TKU2}'" | tr -d ' \n')
chkas "${TKU2}" "★ 已經報過的人再按一次（那一種已經滿了）拿回原本那一筆，不會被擋" "${TKA2}" "select public.submit_application('${TKF}', '[]'::jsonb, null, null, '${TK1}')"
chkas "${TKU1}" "★ 分類型之前就報了的人再按一次（沒帶類型）也拿回原本那一筆，不會被 ticket_required 擋" "true" \
  "select (public.submit_application('${TKF}', '[]'::jsonb, null) = (select id from public.applications where form_id='${TKF}' and user_id='${TKU1}'))::text"
chkas "${TKU3}" "另一種不限名額，送得進去" "true" \
  "select public.submit_application('${TKF}', '[]'::jsonb, null, null, '${TK2}'); select (ticket_id = '${TK2}')::text from public.applications where form_id='${TKF}' and user_id='${TKU3}'"
# 活動本身的名額那道門還在：活動名額 3、已經 3 個人，不限的那一種也送不進來，而且訊息正好是 full（不是 ticket_full）。
tkfull=$(psql -d "${DB}" -X -A -t -q -c "do \$\$ begin perform set_config('test.uid','${TKU4}',true); perform public.submit_application('${TKF}', '[]'::jsonb, null, null, '${TK2}'); raise notice 'NOT_BLOCKED'; exception when others then raise notice 'GOT[%]', SQLERRM; end \$\$;" 2>&1 || true)
if echo "${tkfull}" | grep -q "GOT\[full\]"; then echo "  ok   ★ 活動本身的名額那道門還在：活動滿了，不限名額的那一種也送不進來，訊息正好是 full"; pass=$((pass+1)); else echo "  FAIL 活動名額的門訊息不對：${tkfull}"; fail=$((fail+1)); fi
# 婉拒的不算名額：把滿的那一種唯一一筆婉拒，位子就空出來；活動名額也空出一個。
psql -d "${DB}" -X -A -t -q -c "update public.applications set status='rejected' where id='${TKA2}';" >/dev/null
chkrole anon "" "被婉拒的不算：那一種又有位子了" "1:0:false" "select (x->>'capacity')||':'||(x->>'taken')||':'||(x->>'full') from jsonb_array_elements(public.public_form_tickets('${TKF}')) x where x->>'id'='${TK1}'"
chkas "${TKU4}" "位子空出來，下一個人送得進那一種" "true" \
  "select public.submit_application('${TKF}', '[]'::jsonb, null, null, '${TK1}'); select (ticket_id = '${TK1}')::text from public.applications where form_id='${TKF}' and user_id='${TKU4}'"
# 後台看每一種報了幾個
chkas "${AMT}" "★ 後台看得到每一種報了幾個（taken 不算婉拒的，used 全算）" "學生:1:2,家長:1:1" \
  "select string_agg((x->>'name_zh')||':'||(x->>'taken')||':'||(x->>'used'), ',' order by n) from jsonb_array_elements(public.event_tickets_list('${TKEV}')) with ordinality y(x, n)"
chkraise "★ 已經有人報的類型刪不掉（ticket_in_use）" "ticket_in_use" \
  "perform set_config('test.uid','${AMT}',true); perform public.delete_event_ticket('${TK1}');"
chkas "${AMT}" "改名字、改名額：其他欄位不動" "Students|5|高中生" \
  "select public.save_event_ticket('${TKEV}', '${TK1}', '{\"name_en\":\"Students\",\"capacity\":5}'::jsonb); select name_en||'|'||capacity||'|'||note_zh from public.event_tickets where id='${TK1}'"
chkas "${AMT}" "排順序：家長搬到前面，對外跟著換" "2|家長,學生" \
  "select public.reorder_event_tickets('${TKEV}', array['${TK2}','${TK1}']::uuid[]); select '2|'||string_agg(x->>'name_zh', ',' order by n) from jsonb_array_elements(public.public_form_tickets('${TKF}')) with ordinality y(x, n)"
TK3=$(psql -d "${DB}" -X -A -t -q -c "select set_config('test.uid','${AMT}',false);" -c "select public.save_event_ticket('${TKEV}', null, '{\"name_zh\":\"沒人報的\"}'::jsonb)" 2>&1 | tail -1 | tr -d ' \n')
chkas "${AMT}" "沒人報的類型刪得掉" "2" "select public.delete_event_ticket('${TK3}'); select count(*) from public.event_tickets where event_id='${TKEV}'"
# 看報名名單的人把 ticket_id 對回名字
chkas "${AMV}" "★ team 是「看」、沒被加進這一場的人看不到這場的報名，類型的名字也拿到空的" "0" "select jsonb_array_length(public.form_ticket_names('${TKF}'))"
psql -d "${DB}" -X -A -t -q -c "insert into public.assignments (user_id, workspace_id, level) values ('${AMV}','custom:event-tk-smoke','view') on conflict (user_id,workspace_id) do update set level='view';" >/dev/null
chkas "${AMV}" "★ 被加進這一場（「看」）的人拿得到類型的名字，用來對報名名單；只有 id 與中英名稱" "2|id,name_en,name_zh" \
  "select jsonb_array_length(j)||'|'||(select string_agg(k, ',' order by k) from jsonb_object_keys(j->0) k) from public.form_ticket_names('${TKF}') j"
chkas "${AMX}" "★ 看不到這場報名的幹部拿到空的" "0" "select jsonb_array_length(public.form_ticket_names('${TKF}'))"
chkraise "★ 這一場只有「看」的人還是改不了類型（not_event_editor）" "not_event_editor" \
  "perform set_config('test.uid','${AMV}',true); perform public.save_event_ticket('${TKEV}', '${TK1}', '{\"capacity\":50}'::jsonb);"
psql -d "${DB}" -X -A -t -q -c "delete from public.assignments where user_id='${AMV}' and workspace_id='custom:event-tk-smoke';" >/dev/null
chkas "${TKU3}" "學員也拿到空的（對外要的走 public_form_tickets）" "0" "select jsonb_array_length(public.form_ticket_names('${TKF}'))"
chkrole authenticated "${TKU3}" "學員讀得到自己那一筆報名的 ticket_id（RLS 照舊只有自己的）" "1|true" "select count(*)||'|'||bool_and(ticket_id = '${TK2}') from public.applications where form_id='${TKF}'"
# 直接讀寫表
tkan=$(psql -d "${DB}" -X -A -t -q -c "set role anon; select count(*) from public.event_tickets;" 2>&1 || true)
if echo "${tkan}" | grep -qi "permission denied"; then echo "  ok   ★ anon 讀不到 event_tickets 表本身"; pass=$((pass+1)); else echo "  FAIL anon 讀得到 event_tickets 表：${tkan}"; fail=$((fail+1)); fi
tkau=$(psql -d "${DB}" -X -A -t -q -c "select set_config('test.uid','${AMT}',false);" -c "set role authenticated; update public.event_tickets set capacity=999 where id='${TK1}';" 2>&1 || true)
if echo "${tkau}" | grep -qi "permission denied"; then echo "  ok   ★ 登入的人直接改不了 event_tickets（只能走函式）"; pass=$((pass+1)); else echo "  FAIL 登入的人直接改得了 event_tickets：${tkau}"; fail=$((fail+1)); fi
tkaf=$(psql -d "${DB}" -X -A -t -q -c "set role anon; select public.save_event_ticket('${TKEV}', null, '{\"name_zh\":\"X\"}'::jsonb);" 2>&1 || true)
if echo "${tkaf}" | grep -qi "permission denied"; then echo "  ok   ★ 沒登入的人叫不到 save_event_ticket()"; pass=$((pass+1)); else echo "  FAIL 沒登入的人叫得到 save_event_ticket()：${tkaf}"; fail=$((fail+1)); fi
tkas=$(psql -d "${DB}" -X -A -t -q -c "set role anon; select public.submit_application('${TKF}','[]'::jsonb, null, null, '${TK2}');" 2>&1 || true)
if echo "${tkas}" | grep -qi "permission denied"; then echo "  ok   ★ 沒登入的人叫不到新的 submit_application()"; pass=$((pass+1)); else echo "  FAIL 沒登入的人叫得到 submit_application()：${tkas}"; fail=$((fail+1)); fi
tkai=$(psql -d "${DB}" -X -A -t -q -c "select set_config('test.uid','${AMT}',false);" -c "set role authenticated; select public.event_tickets_public('${TKEV}');" 2>&1 || true)
if echo "${tkai}" | grep -qi "permission denied"; then echo "  ok   裡面用的 event_tickets_public() 登入的人直接叫不到"; pass=$((pass+1)); else echo "  FAIL event_tickets_public() 直接叫得到：${tkai}"; fail=$((fail+1)); fi
# 活動還沒上架：/apply/ 那一支回空的；撤下來的活動表單還收件，所以類型還回。
psql -d "${DB}" -X -A -t -q -c "update public.events set status='draft' where id='${TKEV}';" >/dev/null
chkrole anon "" "★ 活動退回草稿：兩支對外的都不回類型" "true|0" "select (public.public_event_extras('tk-smoke') is null)::text||'|'||jsonb_array_length(public.public_form_tickets('${TKF}'))"
psql -d "${DB}" -X -A -t -q -c "update public.events set status='published' where id='${TKEV}';" >/dev/null
# 類型整個刪掉（活動刪掉連帶刪）：報名還在，ticket_id 變空的。
psql -d "${DB}" -X -A -t -q -c "delete from public.events where id='${TKEV2}';" >/dev/null 2>&1 || true
chk "活動刪掉，它的類型跟著刪" "0" "select count(*) from public.event_tickets where id='${TKO}'"
psql -d "${DB}" -X -A -t -q -c "delete from public.event_tickets where id='${TK2}';" >/dev/null
chk "★ 類型被刪掉（繞過函式直接刪），報名還在，ticket_id 變空的" "1|true" "select count(*)||'|'||bool_and(ticket_id is null) from public.applications where form_id='${TKF}' and user_id='${TKU3}'"
# 破壞測試
BROKEN=$(mktemp)
sed "s/from event_speakers s where s.event_id = e.id and s.consent), '\[\]'::jsonb),/from event_speakers s where s.event_id = e.id), '[]'::jsonb),/" supabase/migrations/2027-01-02-event-speakers-tickets.sql > "${BROKEN}"
bk=$(psql -d "${DB}" -X -A -t -q -f "${BROKEN}" 2>&1 || true)
if echo "${bk}" | grep -q "OVERALL.*FAIL"; then echo "  ok   ★ 破壞測試：對外拿掉「講者只回同意勾了的」，驗收表變紅"; pass=$((pass+1)); else echo "  FAIL 拿掉講者同意的門驗收表沒變紅"; fail=$((fail+1)); fi
sed "s/         case when e.cover_consent then e.cover_url end, e.starts_at,/         e.cover_url, e.starts_at,/" supabase/migrations/2027-01-02-event-speakers-tickets.sql > "${BROKEN}"
bk=$(psql -d "${DB}" -X -A -t -q -f "${BROKEN}" 2>&1 || true)
if echo "${bk}" | grep -q "OVERALL.*FAIL"; then echo "  ok   ★ 破壞測試：封面改回不看同意，驗收表變紅"; pass=$((pass+1)); else echo "  FAIL 封面改回不看同意驗收表沒變紅"; fail=$((fail+1)); fi
sed "s/        raise exception 'ticket_full' using errcode = 'P0001';/        null;/" supabase/migrations/2027-01-02-event-speakers-tickets.sql > "${BROKEN}"
bk=$(psql -d "${DB}" -X -A -t -q -f "${BROKEN}" 2>&1 || true)
if echo "${bk}" | grep -q "OVERALL.*FAIL"; then echo "  ok   ★ 破壞測試：拿掉「那一種滿了就擋」，驗收表變紅"; pass=$((pass+1)); else echo "  FAIL 拿掉 ticket_full 驗收表沒變紅"; fail=$((fail+1)); fi
sed "s/^revoke all on public.event_speakers from public, anon, authenticated;$/grant select on public.event_speakers to authenticated;/" supabase/migrations/2027-01-02-event-speakers-tickets.sql > "${BROKEN}"
bk=$(psql -d "${DB}" -X -A -t -q -f "${BROKEN}" 2>&1 || true)
if echo "${bk}" | grep -q "OVERALL.*FAIL"; then echo "  ok   ★ 破壞測試：把講者表的讀取權限發給登入的人，驗收表變紅"; pass=$((pass+1)); else echo "  FAIL 發了講者表的權限驗收表沒變紅"; fail=$((fail+1)); fi
psql -d "${DB}" -X -A -t -q -c "revoke all on public.event_speakers from public, anon, authenticated;" >/dev/null
# 有人重跑了舊的表單引擎那一支：會多一支四個參數的 submit_application，這一支的驗收表要紅；再跑一次這一支就回來。
psql -d "${DB}" -X -A -t -q -f supabase/migrations/2026-12-20-form-engine.sql >/dev/null 2>&1 || true
chk "（破壞）重跑舊的表單引擎那一支之後，submit_application 變成兩支" "2" "select count(*) from pg_proc where proname='submit_application' and pronamespace='public'::regnamespace"
rm -f "${BROKEN}"
stk3=$(psql -d "${DB}" -X -A -t -q -v ON_ERROR_STOP=1 -f supabase/migrations/2027-01-02-event-speakers-tickets.sql 2>&1 || true)
if echo "${stk3}" | grep -q "OVERALL.*PASS" && ! echo "${stk3}" | grep -q "|FAIL"; then echo "  ok   ★ 再跑一次這一支：四個參數那一支又拿掉了，驗收表全 PASS"; pass=$((pass+1)); else echo "  FAIL 裝回之後驗收表沒過："; echo "${stk3}" | head -18; fail=$((fail+1)); fi
chk "裝回之後 submit_application 又只有一支" "1" "select count(*) from pg_proc where proname='submit_application' and pronamespace='public'::regnamespace"
chkrole anon "" "重跑之後講者、類型、照片都還在，沒登入的人照樣拿得到" "1|0|1" \
  "select (select jsonb_array_length(public.public_event_extras('pg-no-date')->'photos'))||'|'||(select jsonb_array_length(public.public_event_extras('pg-no-date')->'speakers'))||'|'||(select jsonb_array_length(public.public_event_extras('tk-smoke')->'tickets'))"
echo "── 人的關係網：標籤、profile、個人連結（2027-01-03-people-network.sql）──"
# 這時候：PAUL Co-President（管紀錄）、AMV 紀錄是「看」（讀得到名錄、改不動）、AMT 讀不到名錄、STU 學員。PGEV 是 pg-no-date（對外、沒日期）。
NWM=supabase/migrations/2027-01-03-people-network.sql
nw=$(psql -d "${DB}" -X -A -t -q -v ON_ERROR_STOP=1 -f "${NWM}" 2>&1 || true)
if echo "${nw}" | grep -q "OVERALL.*PASS" && ! echo "${nw}" | grep -q "|FAIL"; then echo "  ok   關係網那支驗收表全 PASS"; pass=$((pass+1)); else echo "  FAIL 關係網那支驗收表："; echo "${nw}" | head -24; fail=$((fail+1)); fi
nw2=$(psql -d "${DB}" -X -A -t -q -v ON_ERROR_STOP=1 -f "${NWM}" 2>&1 || true)
if echo "${nw2}" | grep -q "OVERALL.*PASS" && ! echo "${nw2}" | grep -q "|FAIL"; then echo "  ok   關係網那支重跑一次也全 PASS"; pass=$((pass+1)); else echo "  FAIL 重跑：${nw2}" | head -5; fail=$((fail+1)); fi
# 前面有幾支重跑過的遷移檔會把紀錄的「看」升成「改」，這裡先撥回「看」，後面才測得到「看得到但改不動」那一層。
psql -d "${DB}" -X -A -t -q -c "update public.assignments set level='view' where user_id='${AMV}' and workspace_id='custom:records';" >/dev/null
chkas "${AMV}" "（準備）AMV 在紀錄是「看」：讀得到、改不動" "true|false" "select public.rc_can_view()::text||'|'||public.rc_can_manage()::text"
nwq() { psql -d "${DB}" -X -A -t -q -c "select set_config('test.uid','${PAUL}',false);" -c "$1" 2>&1 | tail -1 | tr -d ' \n'; }
NWP=$(nwq "select public.rc_save_person(null, '{\"name_en\":\"Nina Speaker\",\"email\":\"nina-nw@example.com\",\"kind\":\"guest\"}'::jsonb)")
NWS=$(nwq "select public.rc_save_person(null, '{\"name_zh\":\"小高\",\"name_en\":\"Hs Kid\",\"kind\":\"student\"}'::jsonb)")
NWO=$(nwq "select public.rc_save_person(null, '{\"name_en\":\"Other Contact\",\"email\":\"taken-nw@example.com\",\"kind\":\"guest\"}'::jsonb)")
case "${NWP}${NWS}${NWO}" in ????????-*) echo "  ok   建了三個人（講者、高中生、另一位聯絡人）"; pass=$((pass+1));; *) echo "  FAIL 建人失敗：${NWP} ${NWS} ${NWO}"; fail=$((fail+1));; esac
# ── 標籤 ──
chk "剛加的人沒有任何標籤（guest 不是標籤）" "[]" "select public.rc_labels_of('${NWP}')::text"
chk "★ 算標籤那一支前端叫不到（anon 與登入的人）" "false|false" "select has_function_privilege('anon','public.rc_labels_of(uuid)','execute')::text||'|'||has_function_privilege('authenticated','public.rc_labels_of(uuid)','execute')::text"
chkraise "★ 紀錄只是「看」的人給不了標籤（not_records_manager）" "not_records_manager" "perform set_config('test.uid','${AMV}',true); perform public.rc_label_set('${NWP}','professor',true,'',null,null);"
chkraise "★ 學員給不了標籤（not_records_manager）" "not_records_manager" "perform set_config('test.uid','${STU}',true); perform public.rc_label_set('${NWP}','professor',true,'',null,null);"
chkraise "★ 沒有人能手動給「賺來的」標籤：speaker 不是給得了的（bad_label）" "bad_label" "perform set_config('test.uid','${PAUL}',true); perform public.rc_label_set('${NWP}','speaker',true,'',null,null);"
chkraise "member 也給不了（bad_label）：標籤不是權限" "bad_label" "perform set_config('test.uid','${PAUL}',true); perform public.rc_label_set('${NWP}','member',true,'',null,null);"
chkas "${PAUL}" "管紀錄的人給「教授」，帶一句說明與年份" "professor|given|true|NTUEconomics|2019" \
  "select public.rc_label_set('${NWP}','professor',true,'NTU Economics',2019,null); select (l->>'label')||'|'||(l->>'source')||'|'||(l->>'current')||'|'||(l->>'detail')||'|'||(l->>'since') from jsonb_array_elements(public.rc_labels_of('${NWP}')) l"
chkas "${PAUL}" "結束年份過了的，標成不是現在" "false" \
  "select public.rc_label_set('${NWP}','professor',true,'NTU Economics',2019,2020); select l->>'current' from jsonb_array_elements(public.rc_labels_of('${NWP}')) l"
chkraise "結束年份比開始早擋（bad_years）" "bad_years" "perform set_config('test.uid','${PAUL}',true); perform public.rc_label_set('${NWP}','professor',true,'',2020,2019);"
NWSPK=$(nwq "select public.save_event_speaker('${PGEV}', null, '{\"display_name\":\"Nina\",\"subject\":\"Economics\",\"person_id\":\"${NWP}\"}'::jsonb)")
chk "★ 活動頁的講者連到他，speaker 標籤自己出現（沒有人手動加）" "professor:past,speaker:past" "select string_agg(c, ',' order by c) from jsonb_array_elements_text(public.rc_label_codes('${NWP}')) c"
chk "高中生：student、是現在的" "student|true" "select (l->>'label')||'|'||(l->>'current') from jsonb_array_elements(public.rc_labels_of('${NWS}')) l"
psql -d "${DB}" -X -A -t -q -c "update public.people set grad_year = 2020 where id='${NWS}';" >/dev/null
chk "畢業年過了：同一個標籤變成以前的（畫面叫以前的學員）" "student:past" "select string_agg(c, ',') from jsonb_array_elements_text(public.rc_label_codes('${NWS}')) c"
psql -d "${DB}" -X -A -t -q -c "update public.people set grad_year = null where id='${NWS}';" >/dev/null
chkas "${PAUL}" "一個人可以同時有好幾個：Co-President 自己是 member" "true" "select exists (select 1 from jsonb_array_elements(public.rc_labels_of(public.rc_me_person())) l where l->>'label' = 'member')::text"
chk "★ people.kind 沒被動到（幹部名單靠它）" "guest|student" "select (select kind from public.people where id='${NWP}')||'|'||(select kind from public.people where id='${NWS}')"
# ── profile ──
chkraise "★ 紀錄只是「看」的人改不了 profile（not_records_manager）" "not_records_manager" "perform set_config('test.uid','${AMV}',true); perform public.rc_save_profile('${NWP}', '{\"city\":\"Taipei\"}'::jsonb);"
chkraise "★ 管的人不能替別人勾「可以對外」（consent_needs_self）" "consent_needs_self" "perform set_config('test.uid','${PAUL}',true); perform public.rc_save_profile('${NWP}', '{\"share_profile\":true}'::jsonb);"
chkraise "★ 故事可以引用也一樣（consent_needs_self）" "consent_needs_self" "perform set_config('test.uid','${PAUL}',true); perform public.rc_save_profile('${NWP}', '{\"share_story\":true}'::jsonb);"
chkraise "「多願意幫忙」只收四種（bad_rel_open）" "bad_rel_open" "perform set_config('test.uid','${PAUL}',true); perform public.rc_save_profile('${NWP}', '{\"rel_open\":\"very\"}'::jsonb);"
chkraise "照片網址不是 https 擋（photo_not_https）" "photo_not_https" "perform set_config('test.uid','${PAUL}',true); perform public.rc_save_profile('${NWP}', '{\"photo_url\":\"http://x/a.jpg\"}'::jsonb);"
chkas "${PAUL}" "管的人先幫他填：工作、領域、關係紀錄" "Professor|NTU|Economics|open|metatforum|true" \
  "select public.rc_save_profile('${NWP}', '{\"job_title\":\"Professor\",\"job_org\":\"NTU\",\"field\":\"Economics\",\"rel_open\":\"open\",\"rel_note\":\"met at forum\",\"rel_last_contact\":\"2026-11-01\",\"rel_owner\":\"${NWO}\",\"photo_url\":\"https://x/nina.jpg\"}'::jsonb); select job_title||'|'||job_org||'|'||field||'|'||rel_open||'|'||rel_note||'|'||(rel_owner='${NWO}')::text from public.rc_profiles where person_id='${NWP}'"
chkas "${PAUL}" "只改有給的鍵：改城市不會洗掉工作" "Taipei|Professor" "select public.rc_save_profile('${NWP}', '{\"city\":\"Taipei\"}'::jsonb); select city||'|'||job_title from public.rc_profiles where person_id='${NWP}'"
chk "紀錄只記改了哪幾格，不記關係備註的內容" "0" "select count(*) from public.rc_log where what='profile_edit' and after::text like '%met at forum%'"
chkrole authenticated "${PAUL}" "★ 就算是 Co-President 也不能直接讀 rc_profiles 這張表（只走函式）" "ERROR:permissiondeniedfortablerc_profiles" "select count(*) from public.rc_profiles"
chkrole anon "" "★ 沒登入的人讀不到 rc_profile_links" "ERROR:permissiondeniedfortablerc_profile_links" "select count(*) from public.rc_profile_links"
# ── 個人連結 ──
chkraise "★ 紀錄只是「看」的人開不了連結（not_records_manager）" "not_records_manager" "perform set_config('test.uid','${AMV}',true); perform public.rc_profile_link('${NWP}','create');"
chkraise "★ 還在念高中的學員開不了連結（minor_no_link）" "minor_no_link" "perform set_config('test.uid','${PAUL}',true); perform public.rc_profile_link('${NWS}','create');"
chkrole anon "" "★ 沒登入的人叫不到開連結那一支" "ERROR:permissiondeniedforfunctionrc_profile_link" "select public.rc_profile_link('${NWP}','create')"
NWT0=$(nwq "select public.rc_profile_link('${NWP}','create')->>'token'")
NWT=$(nwq "select public.rc_profile_link('${NWP}','create')->>'token'")
chk "連結是 64 個字的亂碼；再開一次，舊的那條就撤掉，同時只有一條有效" "64|true|1|2" "select length('${NWT}')||'|'||('${NWT}' <> '${NWT0}')::text||'|'||(select count(*) from public.rc_profile_links where person_id='${NWP}' and revoked_at is null)||'|'||(select count(*) from public.rc_profile_links where person_id='${NWP}')"
chkrole anon "" "★ 舊的那條連結打不開了（空值）" "true" "select (public.rc_public_profile('${NWT0}') is null)::text"
chkrole anon "" "★ 亂猜的連結、太短的連結：空值" "true|true" "select (public.rc_public_profile(repeat('a',64)) is null)::text||'|'||(public.rc_public_profile('abc') is null)::text"
chkrole anon "" "★ 沒登入、拿對的連結：讀得到自己的那一份，七個鍵" "career,contacts,education,events,expires_at,person,profile" "select string_agg(k, ',' order by k) from jsonb_object_keys(public.rc_public_profile('${NWT}')) k"
chkrole anon "" "★ 連結讀到的東西裡沒有關係紀錄、沒有內部備註、沒有 id" "0|name_en,name_zh,school" \
  "select (select count(*) from jsonb_object_keys(public.rc_public_profile('${NWT}')->'profile') k where k like 'rel%')||'|'||(select string_agg(k, ',' order by k) from jsonb_object_keys(public.rc_public_profile('${NWT}')->'person') k)"
chkrole anon "" "BT 先填的東西他打開就看得到：工作、email、要講的那一場" "Professor|nina-nw@example.com|1" \
  "select (j->'profile'->>'job_title')||'|'||(j->'contacts'->>'email')||'|'||jsonb_array_length(j->'events') from public.rc_public_profile('${NWT}') j"
chk "打開過就記一筆時間" "true" "select (opened_at is not null)::text from public.rc_profile_links where token='${NWT}'"
chkraise "★ 沒勾「我已滿 18 歲」存不進去（adult_only）" "adult_only" "set local role anon; perform public.rc_public_profile_save('${NWT}', '{\"name_en\":\"Nina\"}'::jsonb);"
chkraise "名字兩個都空的擋（need_name）" "need_name" "set local role anon; perform public.rc_public_profile_save('${NWT}', '{\"adult\":true}'::jsonb);"
chkraise "email 不像樣擋（bad_email）" "bad_email" "set local role anon; perform public.rc_public_profile_save('${NWT}', '{\"adult\":true,\"name_en\":\"Nina\",\"contacts\":{\"email\":\"not-an-email\"}}'::jsonb);"
chkraise "故事一題超過三千字擋（too_long）" "too_long:turning" "set local role anon; perform public.rc_public_profile_save('${NWT}', jsonb_build_object('adult', true, 'name_en', 'Nina', 'story', jsonb_build_object('turning', repeat('x', 3001))));"
chkraise "★ 連結不對存不進去（bad_link）" "bad_link" "set local role anon; perform public.rc_public_profile_save(repeat('b',64), '{\"adult\":true,\"name_en\":\"X\"}'::jsonb);"
# BT 先記的兩筆去向：一筆錄取（不在表單上）、一筆只有本人看得到的。這兩筆不能被他的表單洗掉。
psql -d "${DB}" -X -A -t -q -c "insert into public.rc_outcomes (person_id, kind, institution, source, visibility) values ('${NWP}', 'admitted', 'Somewhere U', 'mentorship', 'internal'), ('${NWP}', 'working', 'Secret Co', 'self', 'private');" >/dev/null
NWSAVE='{"adult":true,"name_en":"Nina Chen","name_zh":"陳妮娜","school":"Taipei First Girls","profile":{"city":"Boston","country":"USA","job_title":"Assistant Professor","job_org":"MIT","field":"Economics","bio":"Hello"},"story":{"highschool":"quiet","turning":"a class","hardest":"visa","decision":"going abroad","wish17":"ask more","first_step":"read","hack":"x"},"contacts":{"email":"taken-nw@example.com","phone":"+1 617 000 0000","linkedin":"https://linkedin.com/in/nina/"},"education":[{"kind":"graduated","institution":"NTU","major":"Economics","title":"BA","year":"2012"},{"kind":"graduated","institution":"MIT","major":"Economics","title":"PhD","year":"2018"}],"career":[{"institution":"MIT","title":"Assistant Professor","year":"2019"}],"offer_speak":true,"contact_ok":true,"share_profile":true,"share_story":false}'
chkrole anon "" "★ 沒登入、拿對的連結、勾了滿 18：存得進去" "true" "select (public.rc_public_profile_save('${NWT}', '${NWSAVE}'::jsonb)->>'ok')"
chk "名字、高中、所在地、工作都是他填的" "NinaChen|陳妮娜|TaipeiFirstGirls|Boston|AssistantProfessor|MIT" "select pe.name_en||'|'||pe.name_zh||'|'||pe.school||'|'||pf.city||'|'||pf.job_title||'|'||pf.job_org from public.people pe join public.rc_profiles pf on pf.person_id = pe.id where pe.id='${NWP}'"
chk "★ 故事只收那六題，別的鍵丟掉" "6|false" "select (select count(*) from jsonb_object_keys(story))||'|'||(story ? 'hack')::text from public.rc_profiles where person_id='${NWP}'"
chk "★ 他自己勾的同意存進去了，而且記了時間；舉的手也是" "true|false|true|true|true|true" "select share_profile::text||'|'||share_story::text||'|'||(consent_at is not null)::text||'|'||offer_speak::text||'|'||contact_ok::text||'|'||(done_at is not null)::text from public.rc_profiles where person_id='${NWP}'"
chk "★ 關係紀錄沒有被他的表單動到" "open|metatforum" "select rel_open||'|'||rel_note from public.rc_profiles where person_id='${NWP}'"
chk "電話與 LinkedIn 進了聯絡方式，來源是本人" "self|self" "select string_agg(source, '|' order by kind) from public.rc_identities where person_id='${NWP}' and kind in ('phone','linkedin')"
chk "★ 他填了別人的 email：不寫到他身上、那個 email 還是原主的、記一筆給管的人" "0|1|1" \
  "select (select count(*) from public.rc_identities where person_id='${NWP}' and lower(value)='taken-nw@example.com')||'|'||(select count(*) from public.rc_identities where person_id='${NWO}' and lower(value)='taken-nw@example.com')||'|'||(select count(*) from public.rc_log where what='profile_contact_conflict' and ref='${NWP}')"
chk "學歷兩筆、經歷一筆，來源本人、內部可見、帶學位與職稱" "3|self|internal|BA,PhD,AssistantProfessor" "select count(*)||'|'||min(source)||'|'||min(visibility)||'|'||string_agg(title, ',' order by year) from public.rc_outcomes where person_id='${NWP}' and source='self' and visibility='internal'"
chk "★ BT 記的錄取那一筆、只有本人看得到的那一筆都還在" "1|1" "select (select count(*) from public.rc_outcomes where person_id='${NWP}' and kind='admitted')||'|'||(select count(*) from public.rc_outcomes where person_id='${NWP}' and visibility='private')"
chk "送出過就記一筆時間" "true" "select (submitted_at is not null)::text from public.rc_profile_links where token='${NWT}'"
NWEDU=$(psql -d "${DB}" -X -A -t -q -c "select id from public.rc_outcomes where person_id='${NWP}' and institution='MIT' and kind='graduated'" | tr -d ' \n')
chkrole anon "" "再存一次：帶 id 的改那一列，沒送回來的那一列是他拿掉的；電話留空就是拿掉" "true" \
  "select (public.rc_public_profile_save('${NWT}', '{\"adult\":true,\"name_en\":\"Nina Chen\",\"contacts\":{\"phone\":\"\"},\"education\":[{\"id\":\"${NWEDU}\",\"kind\":\"graduated\",\"institution\":\"MIT\",\"major\":\"Econ\",\"title\":\"PhD\",\"year\":\"2018\"}],\"career\":[]}'::jsonb)->>'ok')"
chk "學歷剩一筆（同一列、改了科系），經歷清空，電話拿掉，email 還在" "1|true|Econ|0|0|1" \
  "select (select count(*) from public.rc_outcomes where person_id='${NWP}' and kind='graduated')||'|'||(select (id='${NWEDU}')::text from public.rc_outcomes where person_id='${NWP}' and kind='graduated')||'|'||(select major from public.rc_outcomes where id='${NWEDU}')||'|'||(select count(*) from public.rc_outcomes where person_id='${NWP}' and kind='working' and visibility<>'private')||'|'||(select count(*) from public.rc_identities where person_id='${NWP}' and kind='phone')||'|'||(select count(*) from public.rc_identities where person_id='${NWP}' and kind='email')"
chk "★ 這一次沒勾「可以對外」：同意被他自己收回" "false" "select share_profile::text from public.rc_profiles where person_id='${NWP}'"
NWOEDU=$(psql -d "${DB}" -X -A -t -q -c "insert into public.rc_outcomes (person_id, kind, institution, source, visibility) values ('${NWO}', 'graduated', 'Other U', 'import', 'internal') returning id" | head -1 | tr -d ' \n')
chkrole anon "" "帶別人的去向 id 存一次（下一條看有沒有改到別人）" "true" \
  "select (public.rc_public_profile_save('${NWT}', '{\"adult\":true,\"name_en\":\"Nina Chen\",\"education\":[{\"id\":\"${NWOEDU}\",\"kind\":\"graduated\",\"institution\":\"Hacked\"}]}'::jsonb)->>'ok')"
chk "★ 帶別人的去向 id 進來：別人那一列一個字都沒變，當成新的一列加在自己身上" "OtherU|${NWO}|1" \
  "select (select institution from public.rc_outcomes where id='${NWOEDU}')||'|'||(select person_id from public.rc_outcomes where id='${NWOEDU}')||'|'||(select count(*) from public.rc_outcomes where person_id='${NWP}' and institution='Hacked')"
chk "★ 沒送 profile 與 story 那兩段的存檔，不會把工作與故事洗掉" "AssistantProfessor|MIT|Economics|6" "select job_title||'|'||job_org||'|'||field||'|'||(select count(*) from jsonb_object_keys(story)) from public.rc_profiles where person_id='${NWP}'"
chkrole anon "" "換一個 email 存一次" "true" "select (public.rc_public_profile_save('${NWT}', '{\"adult\":true,\"name_en\":\"Nina Chen\",\"contacts\":{\"email\":\"nina-new@example.com\"}}'::jsonb)->>'ok')"
chkrole anon "" "★ 換過 email 之後重開連結，看到的是新的那個（舊的還留在紀錄裡，BT 找得到他）" "nina-new@example.com" "select public.rc_public_profile('${NWT}')->'contacts'->>'email'"
chk "舊的 email 沒有被刪" "2" "select count(*) from public.rc_identities where person_id='${NWP}' and kind='email'"
# ── 誰看得到什麼 ──
chkas "${PAUL}" "★ 管的人在一個人的頁面看得到連結的 token、標籤、profile、他講的場次" "true|true|true|1" \
  "select (j->'link'->>'token' = '${NWT}')::text||'|'||(jsonb_array_length(j->'labels') >= 2)::text||'|'||(j->'profile'->>'rel_note' = 'met at forum')::text||'|'||jsonb_array_length(j->'speaking') from public.rc_person('${NWP}') j"
chkas "${AMV}" "★ 只是「看」的人：看得到 profile 與關係紀錄，拿不到 token" "true|true" "select (j->'link'->>'token' is null)::text||'|'||(j->'profile'->>'rel_open' = 'open')::text from public.rc_person('${NWP}') j"
chkraise "★ 讀不到名錄的幹部打不開一個人的頁面（not_records_viewer）" "not_records_viewer" "perform set_config('test.uid','${AMT}',true); perform public.rc_person('${NWP}');"
chkas "${AMV}" "名錄每一列帶標籤與講者卡要的幾格" "true|Economics|MIT|true" "select (x ? 'labels')::text||'|'||(x->>'field')||'|'||(x->>'job_org')||'|'||(x->>'profile_done') from jsonb_array_elements(public.rc_directory()) x where x->>'id' = '${NWP}'"
chkas "${AMT}" "★ 讀不到名錄的幹部：名錄與找人都是空的" "0|0" "select jsonb_array_length(public.rc_directory())||'|'||jsonb_array_length(public.rc_find_people('Nina'))"
chkas "${AMV}" "找人帶講者卡（挑講者時直接帶進去）" "Economics|MIT|https://x/nina.jpg" "select (x->'card'->>'field')||'|'||(x->'card'->>'job_org')||'|'||(x->'card'->>'photo_url') from jsonb_array_elements(public.rc_find_people('Nina')) x where x->>'id' = '${NWP}'"
# ── 連結失效的三種情況 ──
psql -d "${DB}" -X -A -t -q -c "update public.rc_profile_links set saves = 40, saves_from = now() where token='${NWT}';" >/dev/null
chkraise "★ 一小時存超過 40 次擋（too_many）" "too_many" "set local role anon; perform public.rc_public_profile_save('${NWT}', '{\"adult\":true,\"name_en\":\"Nina Chen\"}'::jsonb);"
psql -d "${DB}" -X -A -t -q -c "update public.rc_profile_links set saves = 0, expires_at = now() - interval '1 minute' where token='${NWT}';" >/dev/null
chkrole anon "" "★ 過期的連結打不開" "true" "select (public.rc_public_profile('${NWT}') is null)::text"
psql -d "${DB}" -X -A -t -q -c "update public.rc_profile_links set expires_at = now() + interval '1 day' where token='${NWT}';" >/dev/null
chkas "${PAUL}" "撤銷之後打不開、存不進去" "true" "select public.rc_profile_link('${NWP}','revoke'); select (public.rc_public_profile('${NWT}') is null)::text"
chkraise "★ 撤銷的連結存不進去（bad_link）" "bad_link" "set local role anon; perform public.rc_public_profile_save('${NWT}', '{\"adult\":true,\"name_en\":\"X\"}'::jsonb);"
# ── 合併、忘記 ──
NWD=$(nwq "select public.rc_save_person(null, '{\"name_en\":\"Nina C\",\"kind\":\"guest\"}'::jsonb)")
psql -d "${DB}" -X -A -t -q -c "select set_config('test.uid','${PAUL}',false);" -c "select public.rc_save_profile('${NWD}', '{\"country\":\"Japan\",\"city\":\"Tokyo\",\"rel_note\":\"second note\"}'::jsonb)" -c "select public.rc_label_set('${NWD}','connection',true,'via alumni',null,null)" -c "select public.rc_profile_link('${NWD}','create')" >/dev/null 2>&1
chkas "${PAUL}" "★ 合併兩個人：留的那個人空的才補、標籤搬過來、被併那一列的連結撤掉" "Boston|USA|metatforum/secondnote|connection,professor|0" \
  "select public.rc_merge_people('${NWP}','${NWD}'); select (select city||'|'||country||'|'||rel_note from public.rc_profiles where person_id='${NWP}')||'|'||(select string_agg(label, ',' order by label) from public.rc_labels where person_id='${NWP}')||'|'||(select count(*) from public.rc_profile_links where person_id='${NWD}' and revoked_at is null)"
NWT2=$(nwq "select public.rc_profile_link('${NWP}','create')->>'token'")
chkas "${PAUL}" "★ 忘記一個人：profile、標籤、連結都清掉，那條連結馬上打不開" "0|0|0|true" \
  "select public.forget_person('${NWP}'); select (select count(*) from public.rc_profiles where person_id='${NWP}')||'|'||(select count(*) from public.rc_labels where person_id='${NWP}')||'|'||(select count(*) from public.rc_profile_links where person_id='${NWP}')||'|'||(public.rc_public_profile('${NWT2}') is null)::text"
chk "他當講者的那一列也跟著刪了（上一支的 trigger 還在）" "0" "select count(*) from public.event_speakers where id='${NWSPK}'"
# ── 破壞測試 ──
BROKEN=$(mktemp)
sed "s/  if not coalesce((p->>'adult')::boolean, false) then raise exception 'adult_only' using errcode = 'P0001'; end if;//" "${NWM}" > "${BROKEN}"
bk=$(psql -d "${DB}" -X -A -t -q -f "${BROKEN}" 2>&1 || true)
if echo "${bk}" | grep -q "OVERALL.*FAIL"; then echo "  ok   ★ 破壞測試：拿掉「要滿 18」，驗收表變紅"; pass=$((pass+1)); else echo "  FAIL 拿掉 adult_only 驗收表沒變紅"; fail=$((fail+1)); fi
sed "s/^revoke all on public.rc_profiles from public, anon, authenticated;$/grant select on public.rc_profiles to authenticated;/" "${NWM}" > "${BROKEN}"
bk=$(psql -d "${DB}" -X -A -t -q -f "${BROKEN}" 2>&1 || true)
if echo "${bk}" | grep -q "OVERALL.*FAIL"; then echo "  ok   ★ 破壞測試：把 profile 表的讀取權限發給登入的人，驗收表變紅"; pass=$((pass+1)); else echo "  FAIL 發了 rc_profiles 的權限驗收表沒變紅"; fail=$((fail+1)); fi
psql -d "${DB}" -X -A -t -q -c "revoke all on public.rc_profiles from public, anon, authenticated;" >/dev/null
sed "s/'profile', public.rc_profile_json(v_person, false),/'profile', public.rc_profile_json(v_person, true),/" "${NWM}" > "${BROKEN}"
bk=$(psql -d "${DB}" -X -A -t -q -f "${BROKEN}" 2>&1 || true)
if echo "${bk}" | grep -q "OVERALL.*FAIL"; then echo "  ok   ★ 破壞測試：讓個人連結讀得到關係紀錄，驗收表變紅"; pass=$((pass+1)); else echo "  FAIL 連結讀得到關係紀錄驗收表沒變紅"; fail=$((fail+1)); fi
sed "s/    if pe.kind = 'student' and (pe.grad_year is null or pe.grad_year >= extract(year from now())::int) then raise exception 'minor_no_link' using errcode = 'P0001'; end if;//" "${NWM}" > "${BROKEN}"
bk=$(psql -d "${DB}" -X -A -t -q -f "${BROKEN}" 2>&1 || true)
if echo "${bk}" | grep -q "OVERALL.*FAIL"; then echo "  ok   ★ 破壞測試：拿掉「高中生開不了連結」，驗收表變紅"; pass=$((pass+1)); else echo "  FAIL 拿掉 minor_no_link 驗收表沒變紅"; fail=$((fail+1)); fi
sed "s/^grant execute on function public.rc_profile_link(uuid, text) to authenticated;$/grant execute on function public.rc_profile_link(uuid, text) to anon, authenticated;/" "${NWM}" > "${BROKEN}"
bk=$(psql -d "${DB}" -X -A -t -q -f "${BROKEN}" 2>&1 || true)
if echo "${bk}" | grep -q "OVERALL.*FAIL"; then echo "  ok   ★ 破壞測試：多開一支函式給沒登入的人，驗收表變紅"; pass=$((pass+1)); else echo "  FAIL 多開給 anon 驗收表沒變紅"; fail=$((fail+1)); fi
psql -d "${DB}" -X -A -t -q -c "revoke all on function public.rc_profile_link(uuid, text) from anon;" >/dev/null
rm -f "${BROKEN}"
nw3=$(psql -d "${DB}" -X -A -t -q -v ON_ERROR_STOP=1 -f "${NWM}" 2>&1 || true)
if echo "${nw3}" | grep -q "OVERALL.*PASS" && ! echo "${nw3}" | grep -q "|FAIL"; then echo "  ok   ★ 裝回去之後驗收表全 PASS"; pass=$((pass+1)); else echo "  FAIL 裝回之後驗收表沒過："; echo "${nw3}" | head -24; fail=$((fail+1)); fi
chkas "${PAUL}" "幹部名單照舊：roster() 沒有把講者與學員帶進來" "0" "select count(*) from jsonb_array_elements(to_jsonb(array(select r from public.roster() r))) x where x->>'person_id' in ('${NWS}','${NWO}')"
echo "── 創辦人：Co-President 標、本人同意、對外才出現（2027-01-04-founders.sql）──"
# Paul 2026-11-24：「add a Founder position so founders show up」，已經離開的創辦人也出現，但要本人同意。
# 這時候：PAUL 是 Co-President。FDU 是隨便一位有帳號、不是 PAUL 的幹部（他的 people 列是 FDP）。
FDM=supabase/migrations/2027-01-04-founders.sql
fd=$(psql -d "${DB}" -X -A -t -q -v ON_ERROR_STOP=1 -f "${FDM}" 2>&1 || true)
if echo "${fd}" | grep -q "OVERALL.*PASS" && ! echo "${fd}" | grep -q "|FAIL"; then echo "  ok   創辦人那支驗收表全 PASS"; pass=$((pass+1)); else echo "  FAIL 創辦人那支驗收表："; echo "${fd}" | head -14; fail=$((fail+1)); fi
fd2=$(psql -d "${DB}" -X -A -t -q -v ON_ERROR_STOP=1 -f "${FDM}" 2>&1 || true)
if echo "${fd2}" | grep -q "OVERALL.*PASS" && ! echo "${fd2}" | grep -q "|FAIL"; then echo "  ok   創辦人那支重跑一次也全 PASS"; pass=$((pass+1)); else echo "  FAIL 重跑：${fd2}" | head -5; fail=$((fail+1)); fi
FDROW=$(psql -d "${DB}" -X -A -t -q -c "select pe.id||'|'||pe.profile_id from public.people pe join public.profiles p on p.id = pe.profile_id where p.role = 'cadre' and p.id <> '${PAUL}' order by pe.id limit 1" | tr -d ' \n')
FDP=${FDROW%%|*}; FDU=${FDROW##*|}
FDNO=$(psql -d "${DB}" -X -A -t -q -c "select id from public.people where profile_id is null order by id limit 1" | tr -d ' \n')
case "${FDP}${FDU}" in ????????-*) echo "  ok   （準備）找到一位有帳號的幹部當創辦人"; pass=$((pass+1));; *) echo "  FAIL 找不到可以拿來測的人：${FDROW}"; fail=$((fail+1));; esac
chkrole anon "" "★ 沒登入的人讀不到 founders 表" "ERROR:permissiondeniedfortablefounders" "select count(*) from public.founders"
chkrole authenticated "${PAUL}" "★ 登入的人（連 Co-President）也不能直接讀寫那張表" "ERROR:permissiondeniedfortablefounders" "update public.founders set consent = true"
chkraise "★ 不是 Co-President 標不了創辦人（not_president）" "not_president" "perform set_config('test.uid','${FDU}',true); perform public.set_founder('${FDP}', true);"
chkraise "學員標不了（not_president）" "not_president" "perform set_config('test.uid','${STU}',true); perform public.set_founder('${FDP}', true);"
if [ -n "${FDNO}" ]; then chkraise "沒有帳號的人標不了：沒有人能替他同意（founder_needs_account）" "founder_needs_account" "perform set_config('test.uid','${PAUL}',true); perform public.set_founder('${FDNO}', true);"; fi
chkraise "沒被標的人勾不了同意（not_a_founder）" "not_a_founder" "perform set_config('test.uid','${FDU}',true); perform public.set_founder_consent(true);"
chkas "${PAUL}" "Co-President 標一位創辦人" "true" "select public.set_founder('${FDP}', true)::text"
chkas "${PAUL}" "後台看得到：標了、本人還沒同意" "true|false" "select (public.founder_status('${FDP}')->>'founder')||'|'||(public.founder_status('${FDP}')->>'consent')"
chkraise "學員讀不到別人的狀態（not_senior）" "not_senior" "perform set_config('test.uid','${STU}',true); perform public.founder_status('${FDP}');"
chkrole anon "" "★ 標了但本人沒勾：對外一個都沒有" "0" "select count(*) from public.public_founders()"
chkraise "★ Co-President 替他勾不了：那一支只改自己那一列，而他自己沒被標（not_a_founder）" "not_a_founder" "perform set_config('test.uid','${PAUL}',true); perform public.set_founder_consent(true);"
chkas "${FDU}" "本人看得到自己被標了" "true|false" "select (public.my_founder()->>'founder')||'|'||(public.my_founder()->>'consent')"
chkas "${FDU}" "本人勾同意" "true" "select public.set_founder_consent(true)::text"
chkrole anon "" "★ 兩把鑰匙都轉了：沒登入的人看得到這一位，只有四欄" "1|id,name_zh,name_en,avatar" "select (select count(*) from public.public_founders())||'|'||(select string_agg(key, ',' order by ord) from (select key, ordinality ord from json_object_keys((select row_to_json(f) from public.public_founders() f limit 1)) with ordinality as k(key, ordinality)) x)"
chkas "${FDU}" "本人把勾拿掉" "false" "select public.set_founder_consent(false)::text"
chkrole anon "" "★ 本人收回：對外馬上沒有" "0" "select count(*) from public.public_founders()"
chkas "${FDU}" "（準備）再勾一次" "true" "select public.set_founder_consent(true)::text"
chkas "${PAUL}" "★ 取消標記再標一次：同意被清掉，要他重新勾" "true|false" "select public.set_founder('${FDP}', false); select public.set_founder('${FDP}', true); select (public.founder_status('${FDP}')->>'founder')||'|'||(public.founder_status('${FDP}')->>'consent')"
chkrole anon "" "重新標之後、他還沒重新勾：對外沒有" "0" "select count(*) from public.public_founders()"
psql -d "${DB}" -X -A -t -q -c "update public.founders set consent = true where profile_id = '${FDU}'; update public.profiles set role = 'student' where id = '${FDU}';" >/dev/null 2>&1 || true
chkrole anon "" "★ 帳號不再是幹部或校友：就算勾過也不對外" "0" "select count(*) from public.public_founders()"
psql -d "${DB}" -X -A -t -q -c "update public.profiles set role = 'cadre' where id = '${FDU}';" >/dev/null 2>&1 || true
chkas "${PAUL}" "public_team() 照舊：沒有多出創辦人那一列" "0" "select count(*) from public.public_team() where title_en = 'Founder'"
sed "s/^   where f\.consent$/   where true/" "${FDM}" > "${BROKEN}"
bk=$(psql -d "${DB}" -X -A -t -q -f "${BROKEN}" 2>&1 || true)
if echo "${bk}" | grep -q "OVERALL.*FAIL"; then echo "  ok   ★ 破壞測試：拿掉「本人同意才對外」，驗收表變紅"; pass=$((pass+1)); else echo "  FAIL 拿掉同意那一行驗收表沒有變紅"; fail=$((fail+1)); fi
sed "s/^revoke all on function public.set_founder_consent(boolean) from public, anon;$/grant execute on function public.set_founder_consent(boolean) to anon;/" "${FDM}" > "${BROKEN}"
bk=$(psql -d "${DB}" -X -A -t -q -f "${BROKEN}" 2>&1 || true)
if echo "${bk}" | grep -q "OVERALL.*FAIL"; then echo "  ok   ★ 破壞測試：把同意那一支開給沒登入的人，驗收表變紅"; pass=$((pass+1)); else echo "  FAIL 同意那一支開給 anon 驗收表沒有變紅"; fail=$((fail+1)); fi
psql -d "${DB}" -X -A -t -q -c "revoke all on function public.set_founder_consent(boolean) from anon;" >/dev/null
rm -f "${BROKEN}"
fd3=$(psql -d "${DB}" -X -A -t -q -v ON_ERROR_STOP=1 -f "${FDM}" 2>&1 || true)
if echo "${fd3}" | grep -q "OVERALL.*PASS" && ! echo "${fd3}" | grep -q "|FAIL"; then echo "  ok   ★ 裝回去之後驗收表全 PASS"; pass=$((pass+1)); else echo "  FAIL 裝回之後驗收表沒有全 PASS"; fail=$((fail+1)); fi
echo "── 地點與場地的 Google 地圖連結（2027-01-05-map-links.sql）──"
# Paul 2026-11-24：「for when and where, for where I need to be able to post Google Map link. Same for the venue.」
# 這時候：PAUL 是 Co-President；AMT 是 PGEV 那個 team「改」的人，AMX 不在那個 team；PGEV（pg-no-date）上架了。
# 草稿的活動與場地這一段自己開（前面幾段開的那幾個，到這裡有的已經被刪掉了）：MLD（ml-draft）是草稿，MLV 是 Map Hall。
MLM=supabase/migrations/2027-01-05-map-links.sql
GM=https://maps.app.goo.gl/AbCdEf123
MLD=$(psql -d "${DB}" -X -A -t -q -c "select set_config('test.uid','${PAUL}',false);" -c "select public.create_event('${AMTEAM}','ml-draft','地圖測試','Map test',false)" 2>&1 | tail -1 | tr -d ' \n')
MLV=$(psql -d "${DB}" -X -A -t -q -c "select set_config('test.uid','${PAUL}',false);" -c "select public.venue_save(null, '{\"name\":\"Map Hall\",\"city\":\"Taipei\"}'::jsonb)" 2>&1 | tail -1 | tr -d ' \n')
case "${MLD}${MLV}" in ????????-*) echo "  ok   （準備）開了一場草稿活動與一個場地"; pass=$((pass+1));; *) echo "  FAIL 開不了測試用的活動或場地：${MLD} ${MLV}"; fail=$((fail+1));; esac
ml=$(psql -d "${DB}" -X -A -t -q -v ON_ERROR_STOP=1 -f "${MLM}" 2>&1 || true)
if echo "${ml}" | grep -q "OVERALL.*PASS" && ! echo "${ml}" | grep -q "|FAIL"; then echo "  ok   地圖連結那支驗收表全 PASS"; pass=$((pass+1)); else echo "  FAIL 地圖連結那支驗收表："; echo "${ml}" | head -14; fail=$((fail+1)); fi
ml2=$(psql -d "${DB}" -X -A -t -q -v ON_ERROR_STOP=1 -f "${MLM}" 2>&1 || true)
if echo "${ml2}" | grep -q "OVERALL.*PASS" && ! echo "${ml2}" | grep -q "|FAIL"; then echo "  ok   地圖連結那支重跑一次也全 PASS"; pass=$((pass+1)); else echo "  FAIL 重跑：${ml2}" | head -5; fail=$((fail+1)); fi
chkrole anon "" "★ 沒登入的人叫不動存連結的那一支" "ERROR:permissiondeniedforfunctionset_event_map_url" "select public.set_event_map_url('${PGEV}', '${GM}')"
chkraise "★ 不在這個 team 的幹部存不了（not_event_editor）" "not_event_editor" "perform set_config('test.uid','${AMX}',true); perform public.set_event_map_url('${PGEV}', '${GM}');"
chkraise "學員存不了（not_event_editor）" "not_event_editor" "perform set_config('test.uid','${STU}',true); perform public.set_event_map_url('${PGEV}', '${GM}');"
chkraise "★ 別的網站的連結存不了（bad_map_url）" "bad_map_url" "perform set_config('test.uid','${PAUL}',true); perform public.set_event_map_url('${PGEV}', 'https://example.com/maps/x');"
chkraise "★ 假的 google 網域存不了（bad_map_url）" "bad_map_url" "perform set_config('test.uid','${PAUL}',true); perform public.set_event_map_url('${PGEV}', 'https://www.google.com.evil.example/maps/x');"
chkraise "http 的存不了（bad_map_url）" "bad_map_url" "perform set_config('test.uid','${PAUL}',true); perform public.set_event_map_url('${PGEV}', 'http://maps.app.goo.gl/abc');"
chkraise "沒有這場活動（no_such_event）" "no_such_event" "perform set_config('test.uid','${PAUL}',true); perform public.set_event_map_url('00000000-0000-0000-0000-000000000000', '${GM}');"
chkrole anon "" "還沒存之前：對外那一格是空的" "true" "select ((public.public_event_extras('pg-no-date')->>'map_url') is null)::text"
chkas "${AMT}" "team 是「改」的人存得了，回存進去的值" "${GM}" "select public.set_event_map_url('${PGEV}', '  ${GM}  ')"
chkrole anon "" "★ 上架的活動：沒登入的人拿得到那一條連結" "${GM}" "select public.public_event_extras('pg-no-date')->>'map_url'"
chkrole anon "" "照片、講者、報名類型那三個鍵都還在" "map_url,photos,speakers,tickets" "select string_agg(k, ',' order by k) from jsonb_object_keys(public.public_event_extras('pg-no-date')) k"
chkas "${PAUL}" "（準備）草稿那一場也存一條" "${GM}" "select public.set_event_map_url('${MLD}', '${GM}')"
chkrole anon "" "★ 沒上架的活動：對外什麼都不回，連結也沒有" "0" "select count(*) from (select public.public_event_extras('ml-draft') x) t where x is not null"
chk "★ 直接改表也塞不進別的網站的連結（檢查掛在欄位上）" "NOTICE:blocked" "do \$\$ begin update public.events set map_url = 'https://example.com/x' where id = '${PGEV}'; raise notice 'NOT_BLOCKED'; exception when check_violation then raise notice 'blocked'; end \$\$;"
chkas "${AMT}" "空字串就是拿掉" "true" "select (public.set_event_map_url('${PGEV}', '') is null)::text"
chkrole anon "" "拿掉之後對外也沒有了" "true" "select ((public.public_event_extras('pg-no-date')->>'map_url') is null)::text"
chk "存與拿掉都留了紀錄" "true" "select (count(*) >= 3)::text from public.rc_log where what = 'event_map_url'"
# 場地
chkraise "★ 沒指派的幹部存不了場地的連結（not_venue_editor）" "not_venue_editor" "perform set_config('test.uid','${OUTC}',true); perform public.venue_save('${MLV}', '{\"map_url\":\"${GM}\"}'::jsonb);"
chkraise "★ 場地：別的網站的連結存不了（bad_map_url）" "bad_map_url" "perform set_config('test.uid','${PAUL}',true); perform public.venue_save('${MLV}', '{\"map_url\":\"https://example.com/maps\"}'::jsonb);"
chkas "${PAUL}" "場地：Google 地圖的連結存得了" "${GM}" "select public.venue_save('${MLV}', '{\"map_url\":\"${GM}\"}'::jsonb); select map_url from public.venues where id = '${MLV}'"
chkas "${PAUL}" "場地：只改別的欄位，連結留著" "${GM}" "select public.venue_save('${MLV}', '{\"cost\":\"free\"}'::jsonb); select map_url from public.venues where id = '${MLV}'"
chkas "${PAUL}" "場地清單多回 map_url 與 has_map" "true|${GM}" "select (public.venues_list()->>'has_map')||'|'||(select v->>'map_url' from jsonb_array_elements(public.venues_list()->'venues') v where v->>'id' = '${MLV}')"
chkas "${PAUL}" "一個場地那一頁也讀得到" "${GM}" "select public.venue_get('${MLV}')->'venue'->>'map_url'"
chkraise "★ 學員讀不到場地（連結也讀不到）" "not_cadre" "perform set_config('test.uid','${STU}',true); perform public.venue_get('${MLV}');"
chkrole anon "" "★ 場地的連結不會自己跑到對外頁：活動那一格是空的就是空的" "true" "select ((public.public_event_extras('pg-no-date')->>'map_url') is null)::text"
BROKEN=$(mktemp)
sed "s/^   where e\.slug = p_slug and e\.status = 'published';$/   where e.slug = p_slug;/" "${MLM}" > "${BROKEN}"
bk=$(psql -d "${DB}" -X -A -t -q -f "${BROKEN}" 2>&1 || true)
if echo "${bk}" | grep -q "OVERALL.*FAIL"; then echo "  ok   ★ 破壞測試：拿掉「上架了才回」，驗收表變紅"; pass=$((pass+1)); else echo "  FAIL 拿掉上架那一條驗收表沒有變紅"; fail=$((fail+1)); fi
sed "s/^revoke all on function public.set_event_map_url(uuid, text) from public, anon;$/grant execute on function public.set_event_map_url(uuid, text) to anon;/" "${MLM}" > "${BROKEN}"
bk=$(psql -d "${DB}" -X -A -t -q -f "${BROKEN}" 2>&1 || true)
if echo "${bk}" | grep -q "OVERALL.*FAIL"; then echo "  ok   ★ 破壞測試：把存連結那一支開給沒登入的人，驗收表變紅"; pass=$((pass+1)); else echo "  FAIL 存連結那一支開給 anon 驗收表沒有變紅"; fail=$((fail+1)); fi
psql -d "${DB}" -X -A -t -q -c "revoke all on function public.set_event_map_url(uuid, text) from anon;" >/dev/null
rm -f "${BROKEN}"
ml3=$(psql -d "${DB}" -X -A -t -q -v ON_ERROR_STOP=1 -f "${MLM}" 2>&1 || true)
if echo "${ml3}" | grep -q "OVERALL.*PASS" && ! echo "${ml3}" | grep -q "|FAIL"; then echo "  ok   ★ 裝回去之後驗收表全 PASS"; pass=$((pass+1)); else echo "  FAIL 裝回之後驗收表沒有全 PASS"; fail=$((fail+1)); fi
echo "── 標籤每一種都可以加；念大學了就不算還在念高中（2027-01-06-labels-and-schools.sql）──"
# Paul 2026-11-25：「Each people should be able to be given label…」「if they're a university student, untick the currently a high school student thing」
# 這時候：PAUL 是 Co-President；OUTC 是沒被派進紀錄的幹部；STU 是學員。四個沒有帳號的學員這一段自己開：
#   LSD 在跑那一支之前就有一筆「就讀」的去向（補資料那一步要抓到他）；LSA 跑完才加「就讀」；LSB 只有「錄取」；LSC「就讀」的年份還沒到。
LSM=supabase/migrations/2027-01-06-labels-and-schools.sql
lsq() { psql -d "${DB}" -X -A -t -q -c "select set_config('test.uid','${PAUL}',false);" -c "$1" 2>&1 | tail -1 | tr -d ' \n'; }
LSD=$(lsq "select public.rc_save_person(null, '{\"name_en\":\"Ls Before\",\"kind\":\"student\",\"school\":\"AIA\"}'::jsonb)")
LSA=$(lsq "select public.rc_save_person(null, '{\"name_en\":\"Ls Angel\",\"kind\":\"student\",\"school\":\"AIA\"}'::jsonb)")
LSB=$(lsq "select public.rc_save_person(null, '{\"name_en\":\"Ls Senior\",\"kind\":\"student\",\"school\":\"TFG\"}'::jsonb)")
LSC=$(lsq "select public.rc_save_person(null, '{\"name_en\":\"Ls Future\",\"kind\":\"student\",\"school\":\"TFG\"}'::jsonb)")
case "${LSD}${LSA}${LSB}${LSC}" in ????????-*) echo "  ok   （準備）開了四個沒有帳號的學員"; pass=$((pass+1));; *) echo "  FAIL 開不了測試用的學員：${LSD} ${LSA}"; fail=$((fail+1));; esac
psql -d "${DB}" -X -A -t -q -c "drop trigger if exists rc_outcomes_left_school on public.rc_outcomes;" >/dev/null 2>&1
lsq "select public.rc_save_outcome(null, '{\"person_id\":\"${LSD}\",\"kind\":\"enrolled\",\"institution\":\"University of Washington\"}'::jsonb)" >/dev/null
chk "（準備）還沒跑那一支：有就讀的去向，還是算念高中" "student" "select kind from public.people where id = '${LSD}'"
chkraise "還沒跑那一支：Mentor 這種標籤加不了（bad_label）" "bad_label" "perform set_config('test.uid','${PAUL}',true); perform public.rc_label_set('${LSA}', 'mentor', true, 'x', null, null);"
ls1=$(psql -d "${DB}" -X -A -t -q -v ON_ERROR_STOP=1 -f "${LSM}" 2>&1 || true)
if echo "${ls1}" | grep -q "OVERALL.*PASS" && ! echo "${ls1}" | grep -q "|FAIL"; then echo "  ok   標籤與學校那一支驗收表全 PASS"; pass=$((pass+1)); else echo "  FAIL 標籤與學校那一支驗收表：${ls1}" | head -20; fail=$((fail+1)); fi
if echo "${ls1}" | grep -Eq "^9\|.*\|[1-9][0-9]*\|PASS"; then echo "  ok   ★ 補資料：這一次有取消到人（LSD，加上前面幾段留下來、已經有就讀去向的學員）"; pass=$((pass+1)); else echo "  FAIL 補資料那一列的數字不對：$(echo "${ls1}" | grep '^9|')"; fail=$((fail+1)); fi
chk "★ 補資料：LSD 不算念高中了（kind 變 guest）" "guest" "select kind from public.people where id = '${LSD}'"
chkas "${PAUL}" "★ LSD 還看得出以前是學員（標籤是 student:past）" '["student:past"]' "select public.rc_label_codes('${LSD}')::text"
chkas "${PAUL}" "LSD 的變動紀錄有一筆 left_high_school" "1" "select count(*) from public.rc_log where ref = '${LSD}' and what = 'left_high_school'"
ls2=$(psql -d "${DB}" -X -A -t -q -v ON_ERROR_STOP=1 -f "${LSM}" 2>&1 || true)
if echo "${ls2}" | grep -q "OVERALL.*PASS" && ! echo "${ls2}" | grep -q "|FAIL" && echo "${ls2}" | grep -q "^9|.*|0|PASS"; then echo "  ok   重跑一次也全 PASS，這一次取消 0 個人"; pass=$((pass+1)); else echo "  FAIL 重跑：${ls2}" | head -20; fail=$((fail+1)); fi
# 之後加去向：四種算、錄取不算、還沒到的年份不算
lsq "select public.rc_save_outcome(null, '{\"person_id\":\"${LSB}\",\"kind\":\"admitted\",\"institution\":\"NTU\",\"year\":\"2026\"}'::jsonb)" >/dev/null
chk "★ 只有錄取：還是算念高中" "student" "select kind from public.people where id = '${LSB}'"
lsq "select public.rc_save_outcome(null, '{\"person_id\":\"${LSC}\",\"kind\":\"enrolled\",\"institution\":\"MIT\",\"year\":\"2099\"}'::jsonb)" >/dev/null
chk "★ 就讀的年份還沒到：還是算念高中" "student" "select kind from public.people where id = '${LSC}'"
chkraise "★ 還算念高中的人照舊開不了個人連結（minor_no_link，這一支沒有動那道門）" "minor_no_link" "perform set_config('test.uid','${PAUL}',true); perform public.rc_profile_link('${LSB}', 'create');"
lsq "select public.rc_save_outcome(null, '{\"person_id\":\"${LSA}\",\"kind\":\"enrolled\",\"institution\":\"University of Washington\",\"year\":\"2022\"}'::jsonb)" >/dev/null
chk "★ 加一筆就讀：不算念高中了" "guest" "select kind from public.people where id = '${LSA}'"
chk "留了一個「學員」標籤，到那一年" "2022" "select until_year from public.rc_labels where person_id = '${LSA}' and label = 'student'"
chkas "${PAUL}" "★ 念大學的人開得了個人連結了" "64" "select length(public.rc_profile_link('${LSA}', 'create')->>'token')"
chk "名單上那一格學校沒有被動到" "AIA" "select school from public.people where id = '${LSA}'"
# 標籤：十一種都加得了，門沒有變
chkas "${PAUL}" "★ Co-President 加得了 Mentor 這種標籤" "true" "select public.rc_label_set('${LSA}', 'mentor', true, 'Fall 2025', 2025, null)::text"
chkas "${PAUL}" "加得了講者，補充說明寫哪一場" "true" "select public.rc_label_set('${LSA}', 'speaker', true, 'Overseas Unpacked 2027', 2027, 2027)::text"
chkas "${PAUL}" "★ 合成一列：BT 加的 Mentor 沒寫到哪一年，算現在還是" 'mentor|true|true|false|Fall2025' "select l->>'label'||'|'||(l->>'current')||'|'||(l->>'given')||'|'||(l->>'earned')||'|'||(l->>'detail') from jsonb_array_elements(public.rc_labels_of('${LSA}')) l where l->>'label' = 'mentor'"
chkas "${PAUL}" "標籤的短版：以前的學員、Mentor、講者" '["student:past","mentor","speaker"]' "select public.rc_label_codes('${LSA}')::text"
chkas "${PAUL}" "★ 光給「學員」標籤不會讓人變成現在的學員（那一格沒勾）" "false" "select public.rc_label_set('${LSA}', 'student', true, '', null, null); select l->>'current' from jsonb_array_elements(public.rc_labels_of('${LSA}')) l where l->>'label' = 'student'"
chkas "${PAUL}" "拿得掉" "false" "select public.rc_label_set('${LSA}', 'speaker', false, '', null, null)::text"
chkraise "★ 沒被派進紀錄的幹部加不了標籤（not_records_manager）" "not_records_manager" "perform set_config('test.uid','${OUTC}',true); perform public.rc_label_set('${LSA}', 'mentor', true, 'x', null, null);"
chkraise "學員加不了標籤（not_records_manager）" "not_records_manager" "perform set_config('test.uid','${STU}',true); perform public.rc_label_set('${LSA}', 'mentor', true, 'x', null, null);"
chkraise "不認得的標籤加不了（bad_label）" "bad_label" "perform set_config('test.uid','${PAUL}',true); perform public.rc_label_set('${LSA}', 'president', true, 'x', null, null);"
chkrole anon "" "★ 沒登入的人叫不動加標籤的那一支" "ERROR:permissiondeniedforfunctionrc_label_set" "select public.rc_label_set('${LSA}', 'mentor', true, 'x', null, null)"
chkrole authenticated "${PAUL}" "★ rc_labels_of 前端叫不到（要經過 rc_person 那幾支）" "ERROR:permissiondeniedforfunctionrc_labels_of" "select public.rc_labels_of('${LSA}')"
BROKEN=$(mktemp)
sed "s/^  if not public.rc_can_manage() then raise exception 'not_records_manager' using errcode = 'P0001'; end if;$/  -- gate removed/" "${LSM}" > "${BROKEN}"
bk=$(psql -d "${DB}" -X -A -t -q -f "${BROKEN}" 2>&1 || true)
if echo "${bk}" | grep -q "OVERALL.*FAIL"; then echo "  ok   ★ 破壞測試：拿掉加標籤的門，驗收表變紅"; pass=$((pass+1)); else echo "  FAIL 拿掉加標籤的門驗收表沒有變紅"; fail=$((fail+1)); fi
sed "s/^  if new.kind not in ('enrolled', 'transferred', 'graduated', 'working') then return new; end if;$/  if new.kind not in ('enrolled', 'transferred', 'graduated', 'working', 'admitted') then return new; end if;/" "${LSM}" > "${BROKEN}"
bk=$(psql -d "${DB}" -X -A -t -q -f "${BROKEN}" 2>&1 || true)
if echo "${bk}" | grep -q "OVERALL.*FAIL"; then echo "  ok   ★ 破壞測試：把「錄取」也算進去，驗收表變紅"; pass=$((pass+1)); else echo "  FAIL 把錄取算進去驗收表沒有變紅"; fail=$((fail+1)); fi
rm -f "${BROKEN}"
psql -d "${DB}" -X -A -t -q -c "update public.people set kind = 'student' where id = '${LSB}';" >/dev/null
ls3=$(psql -d "${DB}" -X -A -t -q -v ON_ERROR_STOP=1 -f "${LSM}" 2>&1 || true)
if echo "${ls3}" | grep -q "OVERALL.*PASS" && ! echo "${ls3}" | grep -q "|FAIL"; then echo "  ok   ★ 裝回去之後驗收表全 PASS"; pass=$((pass+1)); else echo "  FAIL 裝回之後驗收表沒有全 PASS：${ls3}" | head -20; fail=$((fail+1)); fi
chk "裝回去之後，只有錄取的那一位還是算念高中" "student" "select kind from public.people where id = '${LSB}'"
echo "── 對外的講者可以點開看經歷；後台找人看得到中英文名（2027-01-07-speaker-profiles.sql）──"
# Paul 2026-11-25：「I want people to be able to click it and then see their experience. If they have one」「if they have a Chinese name… I should know」
# 這時候：PGEV（pg-no-date）上架了；LSA 是上一段那位念大學的人（沒有帳號）。這一段替他開一張講者卡、放一份個人檔案（先都沒同意）。
SPM=supabase/migrations/2027-01-07-speaker-profiles.sql
SPK=$(psql -d "${DB}" -X -A -t -q -c "select set_config('test.uid','${PAUL}',false);" -c "select public.save_event_speaker('${PGEV}', null, '{\"display_name\":\"Angel\",\"subject\":\"CS\",\"school\":\"UW\",\"person_id\":\"${LSA}\"}'::jsonb)" 2>&1 | tail -1 | tr -d ' \n')
psql -d "${DB}" -X -A -t -q -c "select set_config('test.uid','${PAUL}',false);" -c "select public.set_event_speaker_consent('${SPK}', true)" >/dev/null 2>&1
psql -d "${DB}" -X -A -t -q -c "update public.people set name_zh = '黃安琪' where id = '${LSA}';" \
  -c "insert into public.rc_profiles (person_id, job_title, job_org, bio, field, city, story, share_profile, share_story) values ('${LSA}', 'Research Assistant', 'UW', 'SECRETBIO', 'SECRETFIELD', 'SECRETCITY', '{\"highschool\":\"I was shy.\",\"turning\":\" \",\"evil\":\"x\"}'::jsonb, false, false) on conflict (person_id) do update set job_title = excluded.job_title, job_org = excluded.job_org, bio = excluded.bio, field = excluded.field, city = excluded.city, story = excluded.story, share_profile = false, share_story = false;" >/dev/null 2>&1
case "${SPK}" in ????????-*) echo "  ok   （準備）替 LSA 開了一張講者卡與一份還沒同意的個人檔案"; pass=$((pass+1));; *) echo "  FAIL 開不了測試用的講者卡：${SPK}"; fail=$((fail+1));; esac
SPSEL="select (select string_agg(k, ',' order by k) from jsonb_object_keys(v) k) from jsonb_array_elements(public.public_event_extras('pg-no-date')->'speakers') v where v->>'name' = 'Angel'"
sp1=$(psql -d "${DB}" -X -A -t -q -v ON_ERROR_STOP=1 -f "${SPM}" 2>&1 || true)
if echo "${sp1}" | grep -q "OVERALL.*PASS" && ! echo "${sp1}" | grep -q "|FAIL"; then echo "  ok   講者經歷那一支驗收表全 PASS"; pass=$((pass+1)); else echo "  FAIL 講者經歷那一支驗收表：${sp1}" | head -20; fail=$((fail+1)); fi
sp2=$(psql -d "${DB}" -X -A -t -q -v ON_ERROR_STOP=1 -f "${SPM}" 2>&1 || true)
if echo "${sp2}" | grep -q "OVERALL.*PASS" && ! echo "${sp2}" | grep -q "|FAIL"; then echo "  ok   重跑一次也全 PASS"; pass=$((pass+1)); else echo "  FAIL 重跑：${sp2}" | head -20; fail=$((fail+1)); fi
chkrole anon "" "★ 他兩個都沒同意：沒登入的人拿到的還是只有四個鍵" "name,photo_url,school,subject" "${SPSEL}"
psql -d "${DB}" -X -A -t -q -c "update public.rc_profiles set share_profile = true where person_id = '${LSA}';" >/dev/null
chkrole anon "" "★ 他同意公開職稱：多一個 job，故事還是沒有" "job,name,photo_url,school,subject|ResearchAssistant,UW" "select (select string_agg(k, ',' order by k) from jsonb_object_keys(v) k)||'|'||(v->>'job') from jsonb_array_elements(public.public_event_extras('pg-no-date')->'speakers') v where v->>'name' = 'Angel'"
psql -d "${DB}" -X -A -t -q -c "update public.rc_profiles set share_profile = false, share_story = true where person_id = '${LSA}';" >/dev/null
chkrole anon "" "★ 他只同意引用故事：有 story 沒有 job，而且只有他有寫的、認得的那一題" 'name,photo_url,school,story,subject|{"highschool":"Iwasshy."}' "select (select string_agg(k, ',' order by k) from jsonb_object_keys(v) k)||'|'||(v->'story')::text from jsonb_array_elements(public.public_event_extras('pg-no-date')->'speakers') v where v->>'name' = 'Angel'"
chkrole anon "" "★ 介紹、領域、城市、中文全名不管同不同意都不對外" "0" "select (public.public_event_extras('pg-no-date')::text ~ 'SECRET|黃安琪|person_id')::int"
psql -d "${DB}" -X -A -t -q -c "select set_config('test.uid','${PAUL}',false);" -c "select public.set_event_speaker_consent('${SPK}', false)" >/dev/null 2>&1
chkrole anon "" "★ 後台取消「放在對外頁」：整位都不回，他同意了也一樣" "0" "select count(*) from jsonb_array_elements(public.public_event_extras('pg-no-date')->'speakers') v where v->>'name' = 'Angel'"
psql -d "${DB}" -X -A -t -q -c "select set_config('test.uid','${PAUL}',false);" -c "select public.set_event_speaker_consent('${SPK}', true)" >/dev/null 2>&1
chkas "${PAUL}" "後台找人多回中文名與英文名" "黃安琪|LsAngel" "select (v->>'name_zh')||'|'||(v->>'name_en') from jsonb_array_elements(public.rc_find_people('Ls Angel')) v"
chkas "${OUTC}" "★ 沒被派進紀錄的幹部找人還是空的" "[]" "select public.rc_find_people('Ls Angel')::text"
chkrole anon "" "★ 沒登入的人叫不動找人的那一支" "ERROR:permissiondeniedforfunctionrc_find_people" "select public.rc_find_people('Ls')"
BROKEN=$(mktemp)
sed "s/'job', case when pf.share_profile then /'job', case when true then /" "${SPM}" > "${BROKEN}"
bk=$(psql -d "${DB}" -X -A -t -q -f "${BROKEN}" 2>&1 || true)
if echo "${bk}" | grep -q "OVERALL.*FAIL"; then echo "  ok   ★ 破壞測試：職稱不看他同不同意，驗收表變紅"; pass=$((pass+1)); else echo "  FAIL 職稱不看同意驗收表沒有變紅"; fail=$((fail+1)); fi
sed "s/from event_speakers s where s.event_id = e.id and s.consent)/from event_speakers s where s.event_id = e.id)/" "${SPM}" > "${BROKEN}"
bk=$(psql -d "${DB}" -X -A -t -q -f "${BROKEN}" 2>&1 || true)
if echo "${bk}" | grep -q "OVERALL.*FAIL"; then echo "  ok   ★ 破壞測試：拿掉講者「放在對外頁」那道門，驗收表變紅"; pass=$((pass+1)); else echo "  FAIL 拿掉講者那道門驗收表沒有變紅"; fail=$((fail+1)); fi
rm -f "${BROKEN}"
sp3=$(psql -d "${DB}" -X -A -t -q -v ON_ERROR_STOP=1 -f "${SPM}" 2>&1 || true)
if echo "${sp3}" | grep -q "OVERALL.*PASS" && ! echo "${sp3}" | grep -q "|FAIL"; then echo "  ok   ★ 裝回去之後驗收表全 PASS"; pass=$((pass+1)); else echo "  FAIL 裝回之後驗收表沒有全 PASS：${sp3}" | head -20; fail=$((fail+1)); fi
echo "── 名錄變快：每一個人的標籤一次算完（2027-01-12-fast-directory.sql）──"
# Paul 2026-11-25：「when I am trying to load the directory of people and events, it runs really slowly… I want it to be under a second」
# 正式站量到 rc_directory() 1250 個人一趟 7.6 秒，慢在每一個人叫一次 rc_label_codes()。這一支只換算法，回的東西一個字都不能變，
# 所以這一段先把換之前的那一版回的東西記下來（管的人、看的人各一份），換完逐人對。
FASTM=supabase/migrations/2027-01-12-fast-directory.sql
psql -d "${DB}" -X -A -t -q -c "create table public.fd_old (who text, e jsonb, txt text);" >/dev/null
psql -d "${DB}" -X -A -t -q -c "select set_config('test.uid','${PAUL}',false);" -c "insert into public.fd_old select 'paul', e, e::text from jsonb_array_elements(public.rc_directory()) e" >/dev/null
psql -d "${DB}" -X -A -t -q -c "select set_config('test.uid','${OTHER}',false);" -c "insert into public.fd_old select 'other', e, e::text from jsonb_array_elements(public.rc_directory()) e" >/dev/null
chk "（準備）換之前的名錄記下來了：管的人與看的人各一份，都有人" "true|true" "select (count(*) filter (where who = 'paul') > 5)||'|'||(count(*) filter (where who = 'other') > 5) from public.fd_old"
fd1=$(psql -d "${DB}" -X -A -t -q -v ON_ERROR_STOP=1 -f "${FASTM}" 2>&1 || true)
if echo "${fd1}" | grep -q "OVERALL.*PASS" && ! echo "${fd1}" | grep -q "|FAIL"; then echo "  ok   名錄變快那一支驗收表全 PASS"; pass=$((pass+1)); else echo "  FAIL 名錄變快那一支驗收表：${fd1}" | head -20; fail=$((fail+1)); fi
fd2=$(psql -d "${DB}" -X -A -t -q -v ON_ERROR_STOP=1 -f "${FASTM}" 2>&1 || true)
if echo "${fd2}" | grep -q "OVERALL.*PASS" && ! echo "${fd2}" | grep -q "|FAIL"; then echo "  ok   重跑一次也全 PASS"; pass=$((pass+1)); else echo "  FAIL 重跑：${fd2}" | head -20; fail=$((fail+1)); fi
FDCMP="from (select e, txt from public.fd_old where who = 'WHO') o full join (select e, e::text as txt from jsonb_array_elements(public.rc_directory()) e) n on o.e->>'id' = n.e->>'id' where o.txt is distinct from n.txt"
chkas "${PAUL}" "★ 管的人：換完之後每一個人那一列跟換之前一模一樣（連鍵的順序），對不上的 0 列" "0" "select count(*) ${FDCMP/WHO/paul}"
chkas "${OTHER}" "★ 看的人（Senior Adviser）：一樣 0 列對不上" "0" "select count(*) ${FDCMP/WHO/other}"
chkas "${PAUL}" "名字的排序跟換之前一樣（照名字排）" "t" "select (select jsonb_agg(e->>'name') from jsonb_array_elements(public.rc_directory()) e) = (select jsonb_agg(n order by n) from (select e->>'name' n from public.fd_old where who = 'paul') z)"
chkas "${PAUL}" "★ 逐人對：一次算全部的標籤跟一個人算一次的一樣，而且真的有人有標籤" "0|true" "select (select count(*) from public.people p left join public.rc_label_codes_all() a on a.person_id = p.id where p.forgotten_at is null and coalesce(a.codes, '[]'::jsonb) is distinct from public.rc_label_codes(p.id))||'|'||(select count(*) > 3 from public.rc_label_codes_all())"
chkas "${OUTC}" "★ 沒被派進紀錄的幹部拿到的名錄還是空的" "0" "select jsonb_array_length(public.rc_directory())"
chkas "${DIR}" "★ 只在某場活動工作區的人拿到的還是空的" "0" "select jsonb_array_length(public.rc_directory())"
chkrole anon "" "★ 沒登入的人叫不動名錄" "ERROR:permissiondeniedforfunctionrc_directory" "select public.rc_directory()"
chkrole authenticated "${PAUL}" "★ 一次算全部標籤的那一支不開給前端（Co-President 登入也叫不動）" "ERROR:permissiondeniedforfunctionrc_label_codes_all" "select count(*) from public.rc_label_codes_all()"
# 破壞測試一：把「現在是幹部」那一條算錯（現任的變成以前的），驗收表第 2 列要變紅
BROKEN=$(mktemp)
sed "s/                      coalesce(pos.now, false) or coalesce(pe.acct = 'cadre', false)),/                      false),/" "${FASTM}" > "${BROKEN}"
if cmp -s "${BROKEN}" "${FASTM}"; then echo "  FAIL 破壞測試一沒有改到檔（那一行的字變了）"; fail=$((fail+1)); fi
bk=$(psql -d "${DB}" -X -A -t -q -f "${BROKEN}" 2>&1 || true)
if echo "${bk}" | grep -q "OVERALL.*FAIL" && echo "${bk}" | grep -q "^2|.*|FAIL"; then echo "  ok   ★ 破壞測試：標籤的規則抄錯一條，驗收表第 2 列變紅"; pass=$((pass+1)); else echo "  FAIL 標籤抄錯驗收表沒有變紅"; fail=$((fail+1)); fi
# 破壞測試二：把一次算全部的那一支開給登入的人，驗收表第 8 列要變紅
sed "s/^revoke all on function public.rc_label_codes_all() from public, anon, authenticated;/revoke all on function public.rc_label_codes_all() from public, anon; grant execute on function public.rc_label_codes_all() to authenticated;/" "${FASTM}" > "${BROKEN}"
if cmp -s "${BROKEN}" "${FASTM}"; then echo "  FAIL 破壞測試二沒有改到檔（那一行的字變了）"; fail=$((fail+1)); fi
bk=$(psql -d "${DB}" -X -A -t -q -f "${BROKEN}" 2>&1 || true)
if echo "${bk}" | grep -q "OVERALL.*FAIL" && echo "${bk}" | grep -q "^8|.*|FAIL"; then echo "  ok   ★ 破壞測試：把那一支開給前端，驗收表第 8 列變紅"; pass=$((pass+1)); else echo "  FAIL 開給前端驗收表沒有變紅"; fail=$((fail+1)); fi
rm -f "${BROKEN}"
fd3=$(psql -d "${DB}" -X -A -t -q -v ON_ERROR_STOP=1 -f "${FASTM}" 2>&1 || true)
if echo "${fd3}" | grep -q "OVERALL.*PASS" && ! echo "${fd3}" | grep -q "|FAIL"; then echo "  ok   ★ 裝回去之後驗收表全 PASS"; pass=$((pass+1)); else echo "  FAIL 裝回之後驗收表沒有全 PASS：${fd3}" | head -20; fail=$((fail+1)); fi
chkrole authenticated "${PAUL}" "★ 裝回去之後那一支又不開給前端了" "ERROR:permissiondeniedforfunctionrc_label_codes_all" "select count(*) from public.rc_label_codes_all()"
psql -d "${DB}" -X -A -t -q -c "drop table public.fd_old;" >/dev/null
echo "── 備註變成參與紀錄（2027-01-08-notes-to-participation.sql）──"
# Paul 2026-11-25：「I want every note like this to be gone, but actually into our BT participation record」
# 「whoever has that participation, don't delete their participation, but compare their notes and their participation before you do anything」
# 這一段自己開人與活動（直接寫表，不經過前端那幾支）：2021 秋到 2023 春四期 mentorship、兩場對得到的活動。2020 秋那一期故意不開。
#   NPV 備註講的都已經有紀錄；NPG 只有「S21 Event Attendee」；NPC 備註說 mentor、紀錄是 mentee；NPM 少一筆 mentor、兩種講者；
#   NPN 沒寫哪一期；NPL 標籤本來就有人寫的字；NPX 找不到那一期；NPF 自己寫的字；NPB 2026-12-12 已經備份過；NPK 少一筆參加活動。
NPM_FILE=supabase/migrations/2027-01-08-notes-to-participation.sql
NPV=aaaa0108-0000-0000-0000-000000000001; NPG=aaaa0108-0000-0000-0000-000000000002; NPC=aaaa0108-0000-0000-0000-000000000003
NPM=aaaa0108-0000-0000-0000-000000000004; NPN=aaaa0108-0000-0000-0000-000000000005; NPL=aaaa0108-0000-0000-0000-000000000006
NPX=aaaa0108-0000-0000-0000-000000000007; NPF=aaaa0108-0000-0000-0000-000000000008; NPB=aaaa0108-0000-0000-0000-000000000009
NPK=aaaa0108-0000-0000-0000-00000000000a
npsql() { psql -d "${DB}" -X -A -t -q -v ON_ERROR_STOP=1 "$@" 2>&1; }
chk "（準備）2020 秋到 2023 春沒有別段留下來的 mentorship，也沒有同名的活動" "0" "select count(*) from public.events where (kind = 'mentorship-term' and starts_at >= '2020-08-01' and starts_at < '2023-08-01') or title_en in ('Study Abroad 101 (Fall 2022)', 'Summer Bootcamp 2023') or slug like 'spring-20%'"
np0=$(npsql <<SQL
insert into public.terms (id, title_zh, title_en, starts_on, ends_on, status) values
  ('2020-21', '2020-21', '2020-21', '2020-08-01', '2021-07-31', 'ended'), ('2024-25', '2024-25', '2024-25', '2024-08-01', '2025-07-31', 'ended') on conflict (id) do nothing;
insert into public.events (slug, team, workspace_id, title_en, starts_at, status, kind, source) values
  ('np-ment-f21', '', 'custom:records', 'Fall 2021 Mentorship',   '2021-09-01 00:00+08', 'archived', 'mentorship-term', 'import'),
  ('np-ment-s22', '', 'custom:records', 'Spring 2022 Mentorship', '2022-02-01 00:00+08', 'archived', 'mentorship-term', 'import'),
  ('np-ment-f22', '', 'custom:records', 'Fall 2022 Mentorship',   '2022-09-01 00:00+08', 'archived', 'mentorship-term', 'import'),
  ('np-ment-s23', '', 'custom:records', 'Spring 2023 Mentorship', '2023-02-01 00:00+08', 'archived', 'mentorship-term', 'import'),
  ('np-sa22',     '', 'custom:records', 'Study Abroad 101 (Fall 2022)', '2022-10-15 09:00+08', 'archived', 'info-session', 'import'),
  ('np-sb23',     '', 'custom:records', 'Summer Bootcamp 2023',         '2023-06-10 09:00+08', 'archived', 'bootcamp', 'import');
insert into public.people (id, name_en, kind, note) values
  ('${NPV}', 'Np Vicky',  'member', 'BT: Mentor, Mentee, Board, Event Attendee; since F2021; HS dept: 一般部/普通班; Mentee in F21; Mentor in S22, F22, S23; Board; status: Student'),
  ('${NPG}', 'Np Angel',  'guest',  'BT: Event Attendee; since S2021; S21 Event Attendee; status: Student'),
  ('${NPC}', 'Np Clash',  'guest',  'BT: Mentor; S23 Mentor'),
  ('${NPM}', 'Np Mentor', 'guest',  'BT: Mentor, Event Speaker; mentor F21 c1 c2; F22 Speaker; F23 Speaker; mentor(s): Someone Else; status: Working Professional; LinkedIn: [link removed]'),
  ('${NPN}', 'Np Noterm', 'guest',  'BT: Mentee, Event Attendee; since F2022; past mentee'),
  ('${NPL}', 'Np Label',  'guest',  'F22 Board'),
  ('${NPX}', 'Np Lost',   'guest',  'F20 Mentee; F20 Event Attendee'),
  ('${NPF}', 'Np Free',   'guest',  'Met at the fair; likes robotics'),
  ('${NPB}', 'Np Backup', 'guest',  'BT: Board'),
  ('${NPK}', 'Np Camp',   'guest',  'S23 Event Attendee');
insert into public.rc_participation (person_id, event_id, role, status, source)
  select '${NPV}', id, case when slug = 'np-ment-f21' then 'mentee' when slug = 'np-sb23' then 'student' else 'mentor' end, 'attended', 'sheet'
    from public.events where slug in ('np-ment-f21', 'np-ment-s22', 'np-ment-f22', 'np-ment-s23', 'np-sb23');
insert into public.rc_participation (person_id, event_id, role, status, source, note)
  select '${NPC}', id, 'mentee', 'attended', 'sheet', 'from the pairing sheet' from public.events where slug = 'np-ment-s23';
insert into public.rc_labels (person_id, label, detail) values ('${NPL}', 'member', 'Finance lead');
insert into public.rc_note_backup (person_id, note) values ('${NPB}', 'ORIGINAL 2026');
drop table if exists np_before; create table np_before as select x.id, md5(x::text) as h from public.rc_participation x;
select 'ready';
SQL
)
if [ "$(echo "${np0}" | tail -1)" = "ready" ]; then echo "  ok   （準備）開了十個人、四期 mentorship、兩場活動"; pass=$((pass+1)); else echo "  FAIL 測試資料開不起來：${np0}" | head -8; fail=$((fail+1)); fi
np1=$(psql -d "${DB}" -X -A -t -q -v ON_ERROR_STOP=1 -f "${NPM_FILE}" 2>&1 || true)
if echo "${np1}" | grep -q "OVERALL.*PASS" && ! echo "${np1}" | grep -q "|FAIL"; then echo "  ok   備註變參與紀錄那一支驗收表全 PASS"; pass=$((pass+1)); else echo "  FAIL 備註變參與紀錄那一支驗收表：${np1}" | head -30; fail=$((fail+1)); fi
chk "★ 原本就有的參與紀錄一列都沒少、一列都沒被改" "0|0" "select (select count(*) from np_before b where not exists (select 1 from public.rc_participation x where x.id = b.id))||'|'||(select count(*) from np_before b join public.rc_participation x on x.id = b.id where md5(x::text) <> b.h)"
chk "★ 備註講的都已經有紀錄的人：一列都沒加，還是那五列" "5|0" "select count(*)||'|'||count(*) filter (where note like '%old database note%') from public.rc_participation where person_id = '${NPV}'"
chk "★ 她的備註只剩 HS dept" "HSdept:一般部/普通班" "select note from public.people where id = '${NPV}'"
chk "Board 沒寫哪一期：給一個幹部標籤，年份用 since 那一年" "Olddatabase:Board(termnotrecorded);withBTsinceFall2021|2021|2021" "select detail||'|'||since_year||'|'||until_year from public.rc_labels where person_id = '${NPV}' and label = 'member'"
chk "★ 只有「S21 Event Attendee」的人：掛在新開的 2021 春季活動 1，一列" "spring-2021-event-1|student|attended|import|Fromolddatabasenote:S21EventAttendee" "select e.slug||'|'||x.role||'|'||x.status||'|'||x.source||'|'||x.note from public.rc_participation x join public.events e on e.id = x.event_id where x.person_id = '${NPG}'"
chk "★ 她的備註空了" "true" "select (note is null)::text from public.people where id = '${NPG}'"
chk "★ 新開的活動只有有人要掛的那一場：archived、import、沒有日期、掛在 2020-21" "1|archived|import|true|2020-21" "select (select count(*) from public.events where slug like 'spring-20%')||'|'||status||'|'||source||'|'||(starts_at is null)||'|'||term_id from public.events where slug = 'spring-2021-event-1'"
chk "★ 備註說 mentor、那一期已經記成 mentee：不補，那一段留在備註" "0|S23Mentor" "select (select count(*) from public.rc_participation where person_id = '${NPC}' and role = 'mentor')||'|'||(select note from public.people where id = '${NPC}')"
chk "少的 mentor 補一列，cohort 寫在備註裡" "attended|import|Fromolddatabasenote:F21Mentor;cohort1,2" "select x.status||'|'||x.source||'|'||x.note from public.rc_participation x join public.events e on e.id = x.event_id where x.person_id = '${NPM}' and e.slug = 'np-ment-f21' and x.role = 'mentor'"
chk "那一期對得到一場的講者：補一列，寫 Inferred" "Inferredfromolddatabasenote:F22Speaker(thenotenamestheterm,nottheevent)" "select x.note from public.rc_participation x join public.events e on e.id = x.event_id where x.person_id = '${NPM}' and e.slug = 'np-sa22' and x.role = 'speaker'"
chk "對不到場次的講者：給標籤，寫哪一期" "Olddatabase:Speaker,Fall2023(eventnotrecorded)|2023|2024" "select detail||'|'||since_year||'|'||until_year from public.rc_labels where person_id = '${NPM}' and label = 'speaker'"
chk "★ mentor(s) 的名字、status: Working Professional 留著；同一句 LinkedIn 的空殼拿掉" "mentor(s):SomeoneElse;status:WorkingProfessional" "select note from public.people where id = '${NPM}'"
chk "沒寫哪一期、也沒有紀錄：Mentee 與學員各一個標籤，備註空了" "mentee:Olddatabase:Mentee(termnotrecorded);withBTsinceFall2022,student:Olddatabase:Eventattendee(eventnotrecorded);withBTsinceFall2022|true" "select (select string_agg(label||':'||detail, ',' order by label) from public.rc_labels where person_id = '${NPN}')||'|'||(select note is null from public.people where id = '${NPN}')"
chk "「學員」標籤不寫到哪一年（看的是現在還在念高中那一格）" "true" "select (until_year is null)::text from public.rc_labels where person_id = '${NPN}' and label = 'student'"
chk "★ 標籤本來就有人寫的字：接在後面，不蓋掉" "Financelead;Olddatabase:Board:F22" "select detail from public.rc_labels where person_id = '${NPL}' and label = 'member'"
chk "★ 找不到那一期的 mentorship、沒有對照的活動：什麼都不加，備註一個字不動，也不備份" "0|F20Mentee;F20EventAttendee|0" "select (select count(*) from public.rc_participation where person_id = '${NPX}')||'|'||(select note from public.people where id = '${NPX}')||'|'||(select count(*) from public.rc_note_backup where person_id = '${NPX}')"
chk "★ 自己寫的字一個字不動，也不備份" "Metatthefair;likesrobotics|0" "select (select note from public.people where id = '${NPF}')||'|'||(select count(*) from public.rc_note_backup where person_id = '${NPF}')"
chk "★ 2026-12-12 備份過的人：那一欄不動，今天的原文存在新的一欄" "ORIGINAL2026|BT:Board" "select note||'|'||note_before_convert from public.rc_note_backup where person_id = '${NPB}'"
chk "被動到的人原文都在備份裡" "BT:EventAttendee;sinceS2021;S21EventAttendee;status:Student" "select note_before_convert from public.rc_note_backup where person_id = '${NPG}'"
chk "少的參加活動補在對得到的那一場" "np-sb23|student|Fromolddatabasenote:S23EventAttendee" "select e.slug||'|'||x.role||'|'||x.note from public.rc_participation x join public.events e on e.id = x.event_id where x.person_id = '${NPK}'"
chk "★ 變動紀錄只記加了幾列，沒有備註的字" "1|0" "select (select (after->>'rows_added') from public.rc_log where what = 'note_to_participation' and ref = '${NPG}')||'|'||(select count(*) from public.rc_log where what = 'note_to_participation' and (coalesce(before::text, '')||after::text) ~* 'attendee|hs dept|status')"
NPROWS=$(npsql -c "select count(*) from public.rc_participation" | tr -d ' \n')
np2=$(psql -d "${DB}" -X -A -t -q -v ON_ERROR_STOP=1 -f "${NPM_FILE}" 2>&1 || true)
if echo "${np2}" | grep -q "OVERALL.*PASS" && ! echo "${np2}" | grep -q "|FAIL" && echo "${np2}" | grep -q "^10|.*|0|INFO"; then echo "  ok   ★ 重跑一次也全 PASS，這一次加 0 列"; pass=$((pass+1)); else echo "  FAIL 重跑：${np2}" | head -30; fail=$((fail+1)); fi
chk "★ 重跑之後列數一樣、標籤的字沒有重複接一次、沒有多開活動" "${NPROWS}|Financelead;Olddatabase:Board:F22|1" "select (select count(*) from public.rc_participation)||'|'||(select detail from public.rc_labels where person_id = '${NPL}' and label = 'member')||'|'||(select count(*) from public.events where slug like 'spring-20%')"
chkrole anon "" "★ 沒登入的人讀不到備註的備份" "ERROR:permissiondeniedfortablerc_note_backup" "select count(*) from public.rc_note_backup"
chkrole authenticated "${PAUL}" "★ 登入的人也讀不到備註的備份（只有資料庫管理者）" "ERROR:permissiondeniedfortablerc_note_backup" "select count(*) from public.rc_note_backup"
chkrole anon "" "★ 新開的那一場不在對外的活動清單裡" "0" "select count(*) from public.public_events() x where x.slug like 'spring-20%'"
chkas "${PAUL}" "★ 忘記一個人：備份（含今天存的原文）與這一支加的參與紀錄一起清" "0|0" "select public.forget_person('${NPG}'); select (select count(*) from public.rc_note_backup where person_id = '${NPG}')||'|'||(select count(*) from public.rc_participation where person_id = '${NPG}')"
# 破壞測試一：拿掉「那一場他已經是另一個身分就不補」那一條
BROKEN=$(mktemp)
sed "/^  when exists (select 1 from public.rc_participation x where x.person_id = c.person_id and x.event_id = c.event_id) then 'conflict'$/d" "${NPM_FILE}" > "${BROKEN}"
if cmp -s "${BROKEN}" "${NPM_FILE}"; then echo "  FAIL 破壞測試一沒有改到檔（那一行的字變了）"; fail=$((fail+1)); fi
bk=$(psql -d "${DB}" -X -A -t -q -f "${BROKEN}" 2>&1 || true)
if echo "${bk}" | grep -q "OVERALL.*FAIL" && echo "${bk}" | grep -q "^3|.*|FAIL"; then echo "  ok   ★ 破壞測試：拿掉「已經是另一個身分就不補」，驗收表變紅"; pass=$((pass+1)); else echo "  FAIL 拿掉那一條驗收表沒有變紅：${bk}" | head -12; fail=$((fail+1)); fi
npsql -c "delete from public.rc_participation where person_id = '${NPC}' and note like 'From old database note:%'; update public.people set note = 'S23 Mentor' where id = '${NPC}';" >/dev/null
# 破壞測試二：加的列不標 import
npsql -c "delete from public.rc_participation where person_id = '${NPK}'; update public.people set note = 'S23 Event Attendee' where id = '${NPK}';" >/dev/null
sed "s/^       'attended', 'import',$/       'attended', 'manual',/" "${NPM_FILE}" > "${BROKEN}"
if cmp -s "${BROKEN}" "${NPM_FILE}"; then echo "  FAIL 破壞測試二沒有改到檔（那一行的字變了）"; fail=$((fail+1)); fi
bk=$(psql -d "${DB}" -X -A -t -q -f "${BROKEN}" 2>&1 || true)
if echo "${bk}" | grep -q "OVERALL.*FAIL" && echo "${bk}" | grep -q "^2|.*|FAIL"; then echo "  ok   ★ 破壞測試：加的列不標 import，驗收表變紅"; pass=$((pass+1)); else echo "  FAIL 不標 import 驗收表沒有變紅：${bk}" | head -12; fail=$((fail+1)); fi
rm -f "${BROKEN}"
npsql -c "delete from public.rc_participation where person_id = '${NPK}'; update public.people set note = 'S23 Event Attendee' where id = '${NPK}';" >/dev/null
np3=$(psql -d "${DB}" -X -A -t -q -v ON_ERROR_STOP=1 -f "${NPM_FILE}" 2>&1 || true)
if echo "${np3}" | grep -q "OVERALL.*PASS" && ! echo "${np3}" | grep -q "|FAIL"; then echo "  ok   ★ 裝回去之後驗收表全 PASS"; pass=$((pass+1)); else echo "  FAIL 裝回之後驗收表沒有全 PASS：${np3}" | head -30; fail=$((fail+1)); fi
chk "裝回去之後：衝突的那一位還是沒有 mentor 那一列，少的那一位補回來而且是 import" "0|import" "select (select count(*) from public.rc_participation where person_id = '${NPC}' and role = 'mentor')||'|'||(select source from public.rc_participation where person_id = '${NPK}')"
npsql -c "drop table if exists np_before;" >/dev/null
echo
echo "── 撤下來的活動可以再上去（2027-01-09-relist-events.sql）──"
# Paul 2026-11-25：「how do i push that live agian? lke now I have no where to puch it live again」
# 這時候：PGEV（pg-no-date）在對外頁上。先撤下來，看舊的函式擋不擋得住（就是 Paul 遇到的那個洞），再跑這一支。
RLM=supabase/migrations/2027-01-09-relist-events.sql
rlq() { psql -d "${DB}" -X -A -t -q -c "select set_config('test.uid','${PAUL}',false);" -c "$1" 2>&1 | tail -1 | tr -d ' \n'; }
chk "（準備）PGEV 現在在對外頁上" "published" "select status from public.events where id = '${PGEV}'"
rlq "select public.unpublish_event('${PGEV}')" >/dev/null
chk "（準備）撤下來了，而且記得它上過" "archived|t" "select status, published_at is not null from public.events where id = '${PGEV}'"
chkraise "★ 跑之前：撤下來的按「準備好了」被擋（這就是那個洞）" "already_published" "perform set_config('test.uid','${PAUL}',true); perform public.set_event_ready('${PGEV}', true);"
rl1=$(psql -d "${DB}" -X -A -t -q -v ON_ERROR_STOP=1 -f "${RLM}" 2>&1 || true)
if echo "${rl1}" | grep -q "OVERALL.*PASS" && ! echo "${rl1}" | grep -q "|FAIL"; then echo "  ok   再上去那一支驗收表全 PASS"; pass=$((pass+1)); else echo "  FAIL 再上去那一支驗收表：${rl1}" | head -20; fail=$((fail+1)); fi
rl2=$(psql -d "${DB}" -X -A -t -q -v ON_ERROR_STOP=1 -f "${RLM}" 2>&1 || true)
if echo "${rl2}" | grep -q "OVERALL.*PASS" && ! echo "${rl2}" | grep -q "|FAIL"; then echo "  ok   重跑一次也全 PASS"; pass=$((pass+1)); else echo "  FAIL 重跑：${rl2}" | head -20; fail=$((fail+1)); fi
chkrole anon "" "★ 沒登入的人叫不到" "f" "select has_function_privilege('anon', 'public.set_event_ready(uuid, boolean)', 'execute')"
chk "★ 撤下來的這一場不在對外的清單裡" "0" "select count(*) from public.public_events() where slug = 'pg-no-date'"
psql -d "${DB}" -X -A -t -q -c "insert into public.events (slug, team, workspace_id, title_zh, title_en, status, kind, source) select 'rl-records-only', team, workspace_id, '舊活動', 'Old event', 'archived', 'other', 'import' from public.events where id = '${PGEV}';" >/dev/null
chkraise "★ 只在紀錄裡的舊活動（沒上過對外頁）照舊上不去" "not_relistable" "perform set_config('test.uid','${PAUL}',true); perform public.set_event_ready((select id from public.events where slug = 'rl-records-only'), true);"
chkas "${PAUL}" "★ 跑之後：撤下來的按得了「準備好了」" "ready" "select public.set_event_ready('${PGEV}', true)"
chk "準備好了還不算上架：對外還是看不到" "0" "select count(*) from public.public_events() where slug = 'pg-no-date'"
chkas "${PAUL}" "★ 再按放上對外頁，回到對外頁上" "published" "select public.publish_event('${PGEV}')"
chk "對外的清單又有它了" "1" "select count(*) from public.public_events() where slug = 'pg-no-date'"
chkraise "已經在上面的照舊不能再按準備好了" "already_published" "perform set_config('test.uid','${PAUL}',true); perform public.set_event_ready('${PGEV}', true);"
# 破壞測試：把「沒上過的擋掉」那一行拿掉，驗收表要變紅
BROKEN=$(mktemp)
sed "/then raise exception 'not_relistable'/d" "${RLM}" > "${BROKEN}"
if cmp -s "${BROKEN}" "${RLM}"; then echo "  FAIL 破壞測試沒有改到檔（那一行的字變了）"; fail=$((fail+1)); fi
bk=$(psql -d "${DB}" -X -A -t -q -f "${BROKEN}" 2>&1 || true)
if echo "${bk}" | grep -q "OVERALL.*FAIL" && echo "${bk}" | grep -q "^2|.*|FAIL"; then echo "  ok   ★ 破壞測試：舊活動那一道擋拿掉，驗收表變紅"; pass=$((pass+1)); else echo "  FAIL 破壞測試：擋拿掉了驗收表還是綠的：${bk}" | head -12; fail=$((fail+1)); fi
rm -f "${BROKEN}"
rl3=$(psql -d "${DB}" -X -A -t -q -v ON_ERROR_STOP=1 -f "${RLM}" 2>&1 || true)
if echo "${rl3}" | grep -q "OVERALL.*PASS" && ! echo "${rl3}" | grep -q "|FAIL"; then echo "  ok   ★ 裝回去之後驗收表全 PASS"; pass=$((pass+1)); else echo "  FAIL 裝回之後驗收表沒有變回綠的"; fail=$((fail+1)); fi
echo
echo "── 後台右下角：回報問題、許願功能（2027-01-10-site-feedback.sql）──"
# Paul 2026-11-25：「team members can submit bug, features they want through text and pictures and it goes to me」
# 這時候：PAUL 是 Co-President，DIR 是 Director（幹部、不是 senior），STU 是學生。
FBM=supabase/migrations/2027-01-10-site-feedback.sql
FBKSQL="select count(*) from regexp_matches((select pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.mail_outbox'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%kind%' limit 1), chr(39) || '([a-z_]+)' || chr(39), 'g')"
FBKN=$(psql -d "${DB}" -X -A -t -q -c "${FBKSQL}" | tr -d ' \n')
fb1=$(psql -d "${DB}" -X -A -t -q -v ON_ERROR_STOP=1 -f "${FBM}" 2>&1 || true)
if echo "${fb1}" | grep -q "OVERALL.*PASS" && ! echo "${fb1}" | grep -q "|FAIL"; then echo "  ok   回報那一支驗收表全 PASS"; pass=$((pass+1)); else echo "  FAIL 回報那一支驗收表：${fb1}" | head -20; fail=$((fail+1)); fi
fb2=$(psql -d "${DB}" -X -A -t -q -v ON_ERROR_STOP=1 -f "${FBM}" 2>&1 || true)
if echo "${fb2}" | grep -q "OVERALL.*PASS" && ! echo "${fb2}" | grep -q "|FAIL"; then echo "  ok   重跑一次也全 PASS"; pass=$((pass+1)); else echo "  FAIL 重跑：${fb2}" | head -20; fail=$((fail+1)); fi
chk "★ 信的種類剛好多一種，原本的一種都沒少（重跑也不會再多）" "$((FBKN+1))" "${FBKSQL}"
FBP="${DIR}/1795661014499-ab12cd.jpg"
fbins() { echo "insert into storage.objects (bucket_id, name, owner) values ('feedback', '${1}', '${2}'); select 'inserted'"; }
fbdeny() { # fbdeny 名稱 使用者 路徑
  local got; got=$(psql -d "${DB}" -X -A -t -q -c "select set_config('test.uid','${2}',false);" -c "set role authenticated; insert into storage.objects (bucket_id, name, owner) values ('feedback', '${3}', '${2}');" 2>&1 || true)
  if echo "${got}" | grep -qi "row-level security"; then echo "  ok   ${1}"; pass=$((pass+1)); else echo "  FAIL ${1}（沒有被擋：${got}）"; fail=$((fail+1)); fi
}
chkrole authenticated "${DIR}" "★ 幹部的圖放得進自己的資料夾" "inserted" "$(fbins "${FBP}" "${DIR}")"
fbdeny "★ 放不進別人的資料夾" "${DIR}" "${PAUL}/1795661014499-ab12cd.jpg"
fbdeny "★ 檔名不是程式取的那種，放不進去" "${DIR}" "${DIR}/screenshot.jpg"
fbdeny "★ 路徑多一層，放不進去" "${DIR}" "${DIR}/x/1795661014499-ab12cd.jpg"
fbdeny "★ 不是圖的副檔名，放不進去" "${DIR}" "${DIR}/1795661014499-ab12cd.pdf"
fbdeny "★ 學生放不進去" "${STU}" "${STU}/1795661014499-ab12cd.jpg"
fban=$(psql -d "${DB}" -X -A -t -q -c "set role anon; insert into storage.objects (bucket_id, name) values ('feedback', '${DIR}/1795661014499-zzzzzz.jpg');" 2>&1 || true)
if echo "${fban}" | grep -qi "row-level security\|permission denied"; then echo "  ok   ★ 沒登入放不進去"; pass=$((pass+1)); else echo "  FAIL anon 放得進去：${fban}"; fail=$((fail+1)); fi
chkas "${DIR}" "★ 幹部送得出去（一張圖）" "true" "select (public.send_feedback('{\"kind\":\"bug\",\"body\":\"  SMOKEBUG 存檔沒反應  \",\"page\":\"/admin/#events\",\"photos\":[\"${FBP}\"]}'::jsonb) is not null)::text"
chk "存成一列：種類、去掉頭尾空白的字、哪一頁、一張圖、新的" "bug|SMOKEBUG存檔沒反應|/admin/#events|1|new" "select kind, body, page, cardinality(photos), status from public.site_feedback where author = '${DIR}'"
chk "★ 信排給每一位 Co-President 與 Senior Adviser（至少一位），一位一封" "t|t" "select (select count(*) from public.mail_outbox where kind = 'feedback_new') >= 1, (select count(*) from public.mail_outbox where kind = 'feedback_new') = (select count(*) from public.profiles p join auth.users u on u.id = p.id where p.role = 'cadre' and p.board_role in ('president', 'senior_adviser') and p.id <> '${DIR}' and coalesce(u.email, '') <> '')"
chk "★ 信裡有他寫的字與哪一頁、有收件匣的連結，沒有圖的路徑" "t" "select bool_and(body like '%SMOKEBUG%' and body like '%/admin/#events%' and body like '%/admin/people/#feedback%' and body like '%[[en]]%' and body not like '%1795661014499%') from public.mail_outbox where kind = 'feedback_new'"
chk "★ 沒有任何一封寄給不是 Co-President 也不是 Senior Adviser 的人" "0" "select count(*) from public.mail_outbox m where m.kind = 'feedback_new' and not exists (select 1 from auth.users u join public.profiles p on p.id = u.id where lower(u.email) = lower(m.to_email) and p.role = 'cadre' and p.board_role in ('president', 'senior_adviser'))"
chkas "${PAUL}" "信畫得出來（這一種沒有範本也不會壞）" "t" "select (select subject <> '' and html like '%SMOKEBUG%' from public.mail_render((select id from public.mail_outbox where kind = 'feedback_new' limit 1)) limit 1)"
chkraise "★ 學生送不了" "not_cadre" "perform set_config('test.uid','${STU}',true); perform public.send_feedback('{\"kind\":\"bug\",\"body\":\"x\"}'::jsonb);"
chkraise "種類亂填會被擋" "bad_kind" "perform set_config('test.uid','${DIR}',true); perform public.send_feedback('{\"kind\":\"spam\",\"body\":\"x\"}'::jsonb);"
chkraise "沒寫字會被擋" "empty_body" "perform set_config('test.uid','${DIR}',true); perform public.send_feedback('{\"kind\":\"bug\",\"body\":\"   \"}'::jsonb);"
chkraise "★ 圖指到別人的資料夾會被擋" "bad_photo" "perform set_config('test.uid','${PAUL}',true); perform public.send_feedback('{\"kind\":\"bug\",\"body\":\"x\",\"photos\":[\"${FBP}\"]}'::jsonb);"
chkraise "★ 圖沒有真的傳上去會被擋" "bad_photo" "perform set_config('test.uid','${DIR}',true); perform public.send_feedback('{\"kind\":\"bug\",\"body\":\"x\",\"photos\":[\"${DIR}/1795661014499-nofile.jpg\"]}'::jsonb);"
chkraise "超過四張會被擋" "too_many_photos" "perform set_config('test.uid','${DIR}',true); perform public.send_feedback('{\"kind\":\"bug\",\"body\":\"x\",\"photos\":[\"a\",\"b\",\"c\",\"d\",\"e\"]}'::jsonb);"
chkas "${PAUL}" "Co-President 自己也送得了" "true" "select (public.send_feedback('{\"kind\":\"feature\",\"body\":\"FROMPAUL\"}'::jsonb) is not null)::text"
chk "★ 他自己送的不寄給他自己" "0" "select count(*) from public.mail_outbox m join auth.users u on lower(u.email) = lower(m.to_email) where u.id = '${PAUL}' and m.kind = 'feedback_new' and m.body like '%FROMPAUL%'"
chkas "${PAUL}" "★ Co-President 讀得到全部" "2" "select jsonb_array_length(public.feedback_inbox())"
chkraise "★ 不是 Co-President 也不是 Senior Adviser 的幹部讀不到" "not_senior" "perform set_config('test.uid','${DIR}',true); perform public.feedback_inbox();"
chkas "${PAUL}" "還沒處理的有兩則" "2" "select public.feedback_count()"
chkas "${DIR}" "★ 別人問有幾則拿到 0" "0" "select public.feedback_count()"
chkas "${PAUL}" "★ Co-President 標得了狀態與備註" "done" "select public.feedback_set((select id from public.site_feedback where author = '${DIR}'), 'done', '  修好了  ')"
chk "狀態、備註、誰標的都記下來" "done|修好了|t|t" "select status, note, handled_by = '${PAUL}', handled_at is not null from public.site_feedback where author = '${DIR}'"
chkraise "★ 別的幹部標不了" "not_senior" "perform set_config('test.uid','${DIR}',true); perform public.feedback_set((select id from public.site_feedback where author = '${DIR}'), 'new', '');"
chkraise "狀態亂填會被擋" "bad_status" "perform set_config('test.uid','${PAUL}',true); perform public.feedback_set((select id from public.site_feedback where author = '${DIR}'), 'gone', '');"
chkrole authenticated "${PAUL}" "★ 圖：Co-President 讀得到" "1" "select count(*) from storage.objects where bucket_id = 'feedback'"
chkrole authenticated "${DIR}" "★ 圖：放的人自己讀得到" "1" "select count(*) from storage.objects where bucket_id = 'feedback'"
chkrole authenticated "${ASSOC}" "★ 圖：別的幹部讀不到" "0" "select count(*) from storage.objects where bucket_id = 'feedback'"
fbt=$(psql -d "${DB}" -X -A -t -q -c "select set_config('test.uid','${PAUL}',false);" -c "set role authenticated; select count(*) from public.site_feedback;" 2>&1 || true)
if echo "${fbt}" | grep -qi "permission denied"; then echo "  ok   ★ 那張表前端直接讀不到（連 Co-President 也要走函式）"; pass=$((pass+1)); else echo "  FAIL 表直接讀得到：${fbt}"; fail=$((fail+1)); fi
fba=$(psql -d "${DB}" -X -A -t -q -c "set role anon; select public.feedback_count();" 2>&1 || true)
if echo "${fba}" | grep -qi "permission denied"; then echo "  ok   ★ 沒登入的人連問有幾則都不行"; pass=$((pass+1)); else echo "  FAIL anon 叫得到：${fba}"; fail=$((fail+1)); fi
# 破壞測試一：把「只有 senior 讀得到」那一句拿掉，驗收表要變紅
BROKEN=$(mktemp)
sed "s/  perform public.require_senior();//" "${FBM}" > "${BROKEN}"
if cmp -s "${BROKEN}" "${FBM}"; then echo "  FAIL 破壞測試一沒有改到檔（那一行的字變了）"; fail=$((fail+1)); fi
bk=$(psql -d "${DB}" -X -A -t -q -f "${BROKEN}" 2>&1 || true)
if echo "${bk}" | grep -q "OVERALL.*FAIL" && echo "${bk}" | grep -q "^4|.*|FAIL"; then echo "  ok   ★ 破壞測試：讀的那道門拿掉，驗收表變紅"; pass=$((pass+1)); else echo "  FAIL 破壞測試一：門拿掉了驗收表還是綠的：${bk}" | head -12; fail=$((fail+1)); fi
# 破壞測試二：把表的讀取權限發給登入的人，驗收表要變紅
sed "s/^revoke all on public.site_feedback from public, anon, authenticated;/grant select on public.site_feedback to authenticated;/" "${FBM}" > "${BROKEN}"
if cmp -s "${BROKEN}" "${FBM}"; then echo "  FAIL 破壞測試二沒有改到檔（那一行的字變了）"; fail=$((fail+1)); fi
bk=$(psql -d "${DB}" -X -A -t -q -f "${BROKEN}" 2>&1 || true)
if echo "${bk}" | grep -q "OVERALL.*FAIL" && echo "${bk}" | grep -q "^1|.*|FAIL"; then echo "  ok   ★ 破壞測試：表的讀取權限發出去，驗收表變紅"; pass=$((pass+1)); else echo "  FAIL 破壞測試二：權限發出去了驗收表還是綠的：${bk}" | head -12; fail=$((fail+1)); fi
rm -f "${BROKEN}"
fb3=$(psql -d "${DB}" -X -A -t -q -v ON_ERROR_STOP=1 -f "${FBM}" 2>&1 || true)
if echo "${fb3}" | grep -q "OVERALL.*PASS" && ! echo "${fb3}" | grep -q "|FAIL"; then echo "  ok   ★ 裝回去之後驗收表全 PASS"; pass=$((pass+1)); else echo "  FAIL 裝回之後驗收表沒有變回綠的：${fb3}" | head -12; fail=$((fail+1)); fi
echo
if [ "$fail" -eq 0 ]; then echo "全部通過（$pass 項）。"; else echo "有 $fail 項沒過（通過 $pass 項）。"; fi
exit "$fail"
