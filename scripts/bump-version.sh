#!/usr/bin/env bash
# 換版本號（2026-11-06，後台速度與版本提示）。
#
# 為什麼要有這一支：GitHub Pages 把每個檔案快取 10 分鐘。改了程式推上去之後的十分鐘內，
# 幹部的瀏覽器可能拿到新的 index.html 配舊的 ui.js（或反過來），畫面就是「有時候有、重整又不見」
#（Paul 2026-11-06 遇到的側欄新項目）。解法是每一次改動都換一個版本號，所有模組的網址都帶著它
#（?v=版本號），版本一換整個資料夾一起換新，不會新舊混著用。
#
# 它改哪些檔：
#   version.json                 線上現在是哪一版（頁面開著會用 cache: no-store 讀它，不一樣就提醒重整）
#   九個登入後頁面的 index.html   <meta name="bt-version">、<script type="importmap">（模組名稱對到帶版本的網址）、
#                                modulepreload 與 <script src> 的 ?v=
# 它**不改任何 .js**：模組之間的 import 還是乾淨的 "./ui.js"，是 index.html 裡那張 importmap 把它對到 "./ui.js?v=…"。
# 所以 node 的測試照樣直接 import 原始檔，不用知道版本這件事。
#
# 用法：
#   ./scripts/bump-version.sh           換一個新版本號（現在的日期時間），改上面那些檔
#   ./scripts/bump-version.sh --check   只檢查：九個 index.html 裡每一個 ?v= 都要跟 version.json 一樣（check.sh 會叫）
#
# 平常不用自己跑：.git/hooks/pre-commit 會在你 commit 動到這些資料夾的時候自動跑（見 scripts/pre-commit-bump.sh）。
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

FOLDERS="admin admin/site admin/people admin/passports admin/finance settings passport intern-passport availability app home"
# 每一頁都會 import 的共用模組。它們也走 importmap，這樣 shared/auth.js 裡的 "./supabase.js" 跟
# data.js 裡的 "../../shared/supabase.js" 會對到**同一個**網址，瀏覽器只建一份 client（shared/supabase.js 檔頭的要求）。
SHARED="/shared/auth.js /shared/supabase.js /shared/supabase-config.js /shared/nav.js /vendor/supabase-js.js"

current() { sed -n 's/.*"v": *"\([^"]*\)".*/\1/p' version.json; }

if [ "${1:-}" = "--check" ]; then
  v="$(current)"
  [ -n "$v" ] || { echo "FAIL  version.json 讀不到版本號"; exit 1; }
  bad=0
  for d in $FOLDERS; do
    f="$d/index.html"
    stray=$(grep -o '?v=[^"&]*' "$f" | sort -u | grep -v "?v=$v$" || true)
    if [ -n "$stray" ]; then echo "FAIL  ${f} 的版本號跟 version.json（${v}）不一樣：${stray}"; bad=1; fi
    grep -q "name=\"bt-version\" content=\"$v\"" "$f" || { echo "FAIL  ${f} 的 <meta name=\"bt-version\"> 不是 ${v}"; bad=1; }
    grep -q '<script type="importmap">' "$f" || { echo "FAIL  ${f} 沒有 importmap"; bad=1; }
    # 自己的 CSS 也要帶版本號（2026-10-28）：沒帶的話改了樣式，瀏覽器照用快取裡的舊檔，新畫面沒有樣式。
    nov=$(grep -o '<link rel="stylesheet" href="[^"]*\.css"' "$f" || true)
    if [ -n "$nov" ]; then echo "FAIL  ${f} 的 CSS 沒帶 ?v=：${nov}"; bad=1; fi
    for m in "$d"/src/*.js; do
      grep -q "\"/$m\": \"/$m?v=$v\"" "$f" || { echo "FAIL  ${f} 的 importmap 少了 /${m}"; bad=1; }
    done
  done
  [ $bad = 0 ] && echo "ok    九個登入後頁面的版本號都是 ${v}，importmap 都齊"
  exit $bad
fi

V="$(date +%Y-%m-%d-%H%M)"
printf '{ "v": "%s" }\n' "$V" > version.json

for d in $FOLDERS; do
  f="$d/index.html"
  # importmap 整段重寫（兩個標記之間），這樣新加的模組會自動進來。
  map='<script type="importmap">{ "imports": {'
  sep=""
  for m in "$d"/src/*.js; do map="$map$sep \"/$m\": \"/$m?v=$V\""; sep=","; done
  for m in $SHARED; do map="$map$sep \"$m\": \"$m?v=$V\""; sep=","; done
  map="$map } }</script>"
  perl -0pi -e 's{<!-- bt-importmap -->.*?<!-- /bt-importmap -->}{<!-- bt-importmap -->\n'"$map"'\n<!-- /bt-importmap -->}s' "$f"
  # meta、modulepreload、<script src> 的 ?v=
  perl -pi -e 's{(name="bt-version" content=")[^"]*}{${1}'"$V"'}; s{\?v=[A-Za-z0-9-]+}{?v='"$V"'}g' "$f"
done
echo "版本號換成 ${V}（version.json 與九個 index.html）。接著 git add 這幾個檔再 commit。"
