#!/usr/bin/env bash
# pre-commit 的一段（2026-11-06）：commit 動到登入後的頁面或 shared/、vendor/ 的時候自動換版本號。
# 從 .git/hooks/pre-commit 叫（那支不在 repo 裡；裝法見 README「後台速度」）。
#
# 它只 git add 「在跑之前沒有任何未暫存改動」的那幾個檔（version.json 與九個 index.html）：
# 別的 session 在同一個 repo 改到一半的檔不會被帶進這個 commit（~/.claude/CLAUDE.md 那條規矩）。
# 有改到一半的就印出來叫你自己加。
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
WATCH='^(admin|settings|passport|intern-passport|availability|app|shared|vendor)/'
if ! git diff --cached --name-only | grep -Eq "$WATCH"; then exit 0; fi
# 這次已經換過版本號（version.json 在暫存區）就不再換，不然每次 commit --amend 都會再跳一號。
if git diff --cached --name-only | grep -q '^version.json$'; then exit 0; fi
TARGETS="version.json admin/index.html admin/site/index.html admin/people/index.html admin/passports/index.html settings/index.html passport/index.html intern-passport/index.html availability/index.html app/index.html"
clean=""; dirty=""
for f in $TARGETS; do
  if git diff --quiet -- "$f"; then clean="$clean $f"; else dirty="$dirty $f"; fi
done
./scripts/bump-version.sh >/dev/null
git add $clean
if [ -n "$dirty" ]; then
  printf 'pre-commit: 版本號換好了，但這幾個檔有你改到一半的東西，沒幫你 git add：%s\n  看過之後自己 git add 它們再 commit 一次。\n' "$dirty"
  exit 1
fi
printf 'pre-commit: 版本號換成 %s，version.json 與九個 index.html 已經一起進這個 commit。\n' "$(sed -n 's/.*"v": *"\([^"]*\)".*/\1/p' version.json)"
