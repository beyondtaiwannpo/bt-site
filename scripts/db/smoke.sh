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

cleanup() { psql -d postgres -q -c "drop database if exists $DB;" >/dev/null 2>&1 || true; }
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
         supabase/migrations/2026-10-20-passport-admin.sql ; do
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

chkraise "Director 核可不了團隊頁（只有 president 可以）" "not_president" \
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
chkraise "Director 改不動文案（那是全組織對外的聲音）" "not_president" \
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
chkraise "★ Director 改不了格子" "not_president" \
  "perform set_config('test.uid','${OTHER}',true); perform public.save_activity('09A',9,'gather','x','X',null,true,null);"
chkraise "★ 一般幹部停用不了格子" "not_president" \
  "perform set_config('test.uid','${MEMBER}',true); perform public.set_activity_active('09A', false);"
chkraise "★ 一般幹部加不了城市" "not_president" \
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
if [ "$fail" -eq 0 ]; then echo "全部通過（$pass 項）。"; else echo "有 $fail 項沒過（通過 $pass 項）。"; fi
exit "$fail"
