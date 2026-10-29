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

echo
if [ "$fail" -eq 0 ]; then echo "全部通過（$pass 項）。"; else echo "有 $fail 項沒過（通過 $pass 項）。"; fi
exit "$fail"
