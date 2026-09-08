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
         supabase/migrations/2026-09-14-anon-execute.sql ; do
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
if [ "$fail" -eq 0 ]; then echo "全部通過（$pass 項）。"; else echo "有 $fail 項沒過（通過 $pass 項）。"; fi
exit "$fail"
