#!/usr/bin/env bash
# 把本機的 Supabase（supabase start 起來的那一個）從零灌成跟正式站一樣的結構。
#
# 順序照 supabase/schema.sql 檔頭寫的：schema.sql → seed.sql → migrations/ 按日期全部跑一遍。
# **這一支同時在驗那段重建說明是不是真的做得到** —— 哪一支遷移檔在乾淨的資料庫上跑不過，
# 這裡會先紅。
#
# 為什麼不用 supabase 的 migration：CLI 只認 <timestamp>_name.sql 的檔名，
# 而這個 repo 的遷移檔是 2026-09-08-students.sql 這種、README 到處引用，不改名。
# config.toml 裡 [db.seed] 也因此關掉了。
#
# 用法：  ./scripts/e2e/db.sh      （由 scripts/e2e/intern.mjs 自己叫）
# 需要：  supabase start 已經跑起來（Docker）。
set -euo pipefail
cd "$(dirname "$0")/../.."
export PATH="$HOME/.orbstack/bin:/opt/homebrew/bin:$PATH"

# 本機 Supabase 的資料庫。帳密是 CLI 固定的（postgres / postgres），只在這台機器上。
export PGPASSWORD=postgres
psql_() { psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -X -q -v ON_ERROR_STOP=1 "$@"; }

echo "清空本機 Supabase 的資料庫（supabase db reset）"
supabase db reset >/dev/null 2>&1 || { echo "supabase db reset 失敗，supabase start 有跑起來嗎？"; exit 1; }

echo "schema.sql → seed.sql → migrations/："
psql_ -f supabase/schema.sql >/dev/null 2>/tmp/bt-e2e-mig.err && echo "  ok   schema.sql" || { echo "  FAIL schema.sql"; grep -i error /tmp/bt-e2e-mig.err | head -3; exit 1; }
psql_ -f supabase/seed.sql   >/dev/null 2>/tmp/bt-e2e-mig.err && echo "  ok   seed.sql"   || { echo "  FAIL seed.sql";   grep -i error /tmp/bt-e2e-mig.err | head -3; exit 1; }
# ⚠ 「按日期」不是「按檔名」。同一天有兩支的時候字母序會錯：
#   2026-08-31-profiles-and-role-驗收.sql 排在 2026-08-31-profiles-and-role.sql 前面（驗收先於遷移）、
#   2026-09-02-availability-revoke.sql 排在 2026-09-02-availability.sql 前面（收權限先於建表）。
# 2026-10-18 第一次在乾淨的資料庫上照 schema.sql 檔頭那句話跑，就在這兩處紅掉。
# 規則：同一天之內，檔名帶「驗收」或「revoke」的排到那一天的最後。
fail=0
for f in $(ls supabase/migrations/*.sql | python3 -c '
import sys
fs=[l.strip() for l in sys.stdin if l.strip()]
key=lambda f:(f.split("/")[-1][:10], 1 if ("驗收" in f or "revoke" in f) else 0, f)
print("\n".join(sorted(fs,key=key)))'); do
  if psql_ -f "$f" >/dev/null 2>/tmp/bt-e2e-mig.err; then echo "  ok   $(basename "$f")"
  else echo "  FAIL $(basename "$f")"; grep -i "error" /tmp/bt-e2e-mig.err | head -2; fail=1; fi
done
[ "$fail" -eq 0 ] || exit 1
echo "ok 本機 Supabase 的結構跟正式站一樣了"
