# 校友與「我的故事」實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 校友用專用邀請碼註冊，幹部與校友在 `/settings/` 自己填「我的故事」，Co-President 核可之後出現在 `/alumni/` 航線圖上。

**Architecture:** 邀請碼那張表多一欄說這組碼給什麼身分，`claim_invite()` 照那一欄升級。故事放新的一張表 `alumni_stories`，兩把鑰匙（本人勾、P/VP 核可）都成立才公開，改了文字由資料庫 trigger 自動下架。`/alumni/` 先打一支只回已核可資料的函式，零筆或連不上就退回現有的 `alumni/community.json` 示範資料。

**Tech Stack:** 原生 JS、ES module、零 build step、Supabase（Postgres + RLS + security definer 函式）、`node --test` 的純函式測試、`check.sh` 守門。

**Spec:** `docs/superpowers/specs/2026-09-11-alumni-story-design.md`

## Global Constraints

- **不加框架、不加 build step、不加 npm 套件。** 測試一律 `node --test test/*.test.mjs`。
- **資料夾之間不互相 import。** `settings/`、`admin/`、`app/`、`alumni/` 各自一份，只有 `shared/` 是共用的，而 `shared/` 只能往下依賴（`check.sh` 第 797 行守著）。
- **前端不准有任何「設定角色」的路徑。** 角色只能由 `claim_invite()`（security definer）改。
- **`story_approved` 不發給 `authenticated`**，本人改不動自己的核可狀態。
- **繁體中文，專有名詞英文，不用 emoji，不用破折號。** 使用者看得到的每一句話都照這個規矩。
- **失敗一定要說話。** 存檔失敗不可以畫出一模一樣的畫面。
- 顏色、字體只能用 `shared/brand.css` 的 `var(--...)`，不可以寫死色碼。
- commit 訊息用中文，格式照現有的 `feat(...)`、`fix(...)`、`docs(...)`。
- 每一支遷移檔最後面要有 PASS / FAIL 驗收表，跟 `supabase/migrations/2026-09-13-public-team.sql` 同一個形狀。

---

## 檔案結構

| 檔案 | 責任 |
|---|---|
| `shared/supabase-config.js` | **新**。只有專案網址與公開金鑰兩個常數。不可以 import 任何東西 |
| `shared/supabase.js` | 改成從上面那支拿常數，其他不動 |
| `shared/nav.js` | `settings` 那一項的 `roles` 加 `alumni` |
| `shared/auth.js` | `claimInvite()` 的註解與回傳值說明 |
| `supabase/migrations/2026-09-17-invite-grants.sql` | **新**。`invite_codes.grants` 與 `claim_invite()` 改寫 |
| `supabase/migrations/2026-09-18-alumni-stories.sql` | **新**。故事表、RLS、trigger、三支函式 |
| `app/src/main.js` / `app/src/ui.js` | 校友登入後送進 `/settings/`；邀請碼那顆按鈕改字 |
| `settings/src/ui.js` | `storyHTML()` 與它的純函式（縣市清單、必填檢查、狀態句） |
| `settings/src/main.js` | 讀寫 `alumni_stories`，字面物件的 upsert |
| `admin/src/data.js` / `ui.js` / `main.js` | 「校友頁」分頁與核可 |
| `alumni/index.html` | 先讀資料庫，零筆或失敗退回 JSON |
| `check.sh` | 三條新守門 |
| `test/alumni-story.test.mjs` | **新**。故事的純函式 |
| `test/shared-config.test.mjs` | **新**。金鑰只有一份、config 不 import 東西 |

---

## Task 1: `shared/supabase-config.js`（金鑰只有一份）

**Files:**
- Create: `shared/supabase-config.js`
- Create: `test/shared-config.test.mjs`
- Modify: `shared/supabase.js:21-25`
- Modify: `check.sh:797-805`

**Interfaces:**
- Produces: `export const SUPABASE_URL`、`export const SUPABASE_PUBLISHABLE_KEY`（Task 8 的 `/alumni/` 用動態 import 拿它們）

- [ ] **Step 1: 寫失敗的測試**

`test/shared-config.test.mjs`：

```js
// 金鑰只有一份（2026-09-11）。
// /alumni/ 是對外頁面，不載 supabase 套件，但它要連資料庫就需要那兩個常數。
// 所以常數搬進一支自己不 import 任何東西的小檔，兩邊都從它拿。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "../shared/supabase-config.js";

const cfg = readFileSync(new URL("../shared/supabase-config.js", import.meta.url), "utf8");
const client = readFileSync(new URL("../shared/supabase.js", import.meta.url), "utf8");

// ⚠ 這是這支檔案存在的唯一理由。它一旦 import 了 vendor/supabase-js.js，
// /alumni/ 就會跟著把整包套件載進來，那正是我們在避免的事。
test("★ supabase-config.js 不 import 任何東西", () => {
  assert.equal(/^\s*import\s/m.test(cfg), false, "config 裡出現了 import");
});

test("兩個常數都是非空字串，而且長得像 Supabase 的值", () => {
  assert.match(SUPABASE_URL, /^https:\/\/[a-z0-9]+\.supabase\.co$/);
  assert.match(SUPABASE_PUBLISHABLE_KEY, /^sb_publishable_/);
});

// 金鑰有兩份的話，換專案時漏改一份的表現是「校友名單安靜地空掉」。
test("★ shared/supabase.js 不再自己寫死金鑰，是從 config 拿", () => {
  assert.match(client, /from "\.\/supabase-config\.js"/);
  assert.equal(/sb_publishable_/.test(client), false, "supabase.js 裡還有寫死的金鑰");
});
```

- [ ] **Step 2: 跑測試，確認它失敗**

Run: `node --test test/shared-config.test.mjs`
Expected: FAIL，`Cannot find module '../shared/supabase-config.js'`

- [ ] **Step 3: 建 `shared/supabase-config.js`**

把 `shared/supabase.js` 現有那兩行原封不動搬過來（**值一個字都不要改**）：

```js
// Supabase 的專案網址與公開金鑰。**這支檔案不 import 任何東西，也不要讓它 import。**
//
// 為什麼要單獨一支：/alumni/ 是對外頁面，刻意不載 supabase-js（見那一頁的檔頭），
// 但它要讀已核可的校友名單就需要這兩個值。直接 import shared/supabase.js 的話，
// 那支一被載入就會 createClient，整包套件跟著進來，每一個路人都多下載一份他用不到的東西。
//
// 換專案時只改這裡。後台 Project Settings → API Keys，
// URL 形如 https://xxxxxxxx.supabase.co，key 以 sb_publishable_ 開頭。
//
// publishable key 出現在原始碼裡是正常的，不是外洩 —— 真正的防線是資料庫的 RLS。
// 絕對不要把 sb_secret_ 開頭的金鑰放進這個 repo 的任何地方。
export const SUPABASE_URL = "https://norjaglyaotzewxavmhv.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_Zizio16gUuM97qjhtD4Qaw_Sb_GKkyx";
```

`shared/supabase.js` 把那兩行換成（原本那段解釋金鑰的註解改成一句指路）：

```js
// 專案網址與金鑰在 shared/supabase-config.js，那支檔案不 import 任何東西，
// 所以 /alumni/ 那種不載 supabase 套件的對外頁面也拿得到同一份值。
export { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "./supabase-config.js";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "./supabase-config.js";
```

（`export ... from` 是為了讓現有 `import { SUPABASE_URL } from "../shared/supabase.js"` 的地方不用改。）

- [ ] **Step 4: 跑測試，確認通過**

Run: `node --test test/shared-config.test.mjs`
Expected: PASS，3 tests

- [ ] **Step 5: `check.sh` 加一條守門**

在第 797 行 `SHARED_UP` 那一段後面加：

```sh
# supabase-config.js 存在的唯一理由是「不把整包套件拉進來」（2026-09-11）。
# 它一旦 import 任何東西，/alumni/ 那條輕量的路就沒有了，而且不會有任何錯誤 ——
# 頁面照樣會動，只是每個路人多下載一份 supabase-js。
if grep -qE '^\s*import\s' shared/supabase-config.js 2>/dev/null; then
  bad "shared/supabase-config.js 裡有 import，那支檔案必須只有常數"
else
  ok "shared/supabase-config.js 只有常數，沒有 import"
fi
```

- [ ] **Step 6: 跑守門**

Run: `./check.sh`
Expected: 全綠，而且看得到「shared/supabase-config.js 只有常數」那一行

- [ ] **Step 7: Commit**

```bash
git add shared/supabase-config.js shared/supabase.js test/shared-config.test.mjs check.sh
git commit -m "feat(shared): 金鑰搬進 supabase-config.js，對外頁面拿得到又不用載整包套件"
```

---

## Task 2: 邀請碼多一欄（遷移檔）

**Files:**
- Create: `supabase/migrations/2026-09-17-invite-grants.sql`
- Modify: `supabase/schema.sql:86-92`（`invite_codes` 的欄位說明，跟遷移檔一致）

**Interfaces:**
- Produces: `claim_invite(p_code text)` 回 `'upgraded'` / `'upgraded_alumni'` / `'already_cadre'` / `'already_alumni'`（Task 3 的前端認這四個值）

- [ ] **Step 1: 寫遷移檔**

`supabase/migrations/2026-09-17-invite-grants.sql`：

```sql
-- 校友專用邀請碼。　2026-09-11
--
-- 用法：整份貼進 Supabase SQL Editor 按一次 Run。最後印出 PASS / FAIL 表。
--
-- ============================================================================
-- 這一支在做什麼
-- ============================================================================
-- invite_codes 多一欄 grants，說這組碼發出去會變成什麼身分。
-- 預設 'cadre'，所以**既有的每一組碼行為完全不變**。
--
-- 為什麼身分由碼決定、不由使用者選：讓人自己選一定有人選錯，而選錯是權限問題。
-- 前端因此仍然沒有任何一條「設定角色」的路徑（規格 §3-5 第 4 點）。

begin;

alter table public.invite_codes add column if not exists grants text not null default 'cadre';

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'invite_codes_grants_check') then
    alter table public.invite_codes add constraint invite_codes_grants_check
      check (grants in ('cadre', 'alumni'));
  end if;
end $$;

comment on column public.invite_codes.grants is
  '這組碼用掉之後那個人變成什麼身分：cadre（預設）或 alumni。
   校友沒有護照，所以 claim_invite() 只有 cadre 那條路會建 passports 那一列。';

-- ---------- claim_invite 改寫 ----------
-- ⚠ 參數仍然必須叫 p_code。改成 code 的話下面那句比對會變成「拿參數跟自己比」，
-- 恆為真，任何字串都能把自己升級 —— 而且不會報錯。理由原封不動留在
-- 2026-09-01-claim-invite.sql 的檔頭，不重複。
--
-- 兩個競態的防法**一個字都沒有改**：
--   for update 鎖自己那一列（防同一個人連點兩下）
--   update ... where uses_left > 0 加 if not found（防兩個人搶同一組碼）
create or replace function public.claim_invite(p_code text)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid    uuid := auth.uid();
  v_role   text;
  v_grants text;
begin
  if v_uid is null then
    raise exception 'not_signed_in' using errcode = 'P0001';
  end if;

  select role into v_role from profiles where id = v_uid for update;

  if v_role is null then
    raise exception 'no_profile' using errcode = 'P0001';
  end if;

  -- 已經是幹部：**不扣碼**，直接回報。手滑按兩下不該燒掉一組碼。
  -- 幹部拿校友碼也走這一條 —— 不降級，那會是一個沒有人預期的副作用。
  if v_role = 'cadre' then
    return 'already_cadre';
  end if;

  -- 扣碼，**同時把這組碼給什麼身分拿出來**。身分來自那一列，不是來自參數。
  update invite_codes set uses_left = uses_left - 1
   where upper(btrim(code)) = upper(btrim(p_code)) and uses_left > 0
   returning grants into v_grants;
  if not found then
    raise exception 'invalid_invite' using errcode = 'P0001';
  end if;

  -- 已經是校友又拿了一組校友碼：這裡已經扣掉了，把它補回去再回報。
  -- （放在扣碼之後是因為要先知道這組碼給什麼身分；校友拿幹部碼是正常的升級。）
  if v_role = 'alumni' and v_grants = 'alumni' then
    update invite_codes set uses_left = uses_left + 1
     where upper(btrim(code)) = upper(btrim(p_code));
    return 'already_alumni';
  end if;

  update profiles set role = v_grants where id = v_uid;

  -- **只有幹部有護照。** 校友走不到這一行。
  -- on conflict do nothing：這個人可能曾經是幹部、被降級、又升回來。
  if v_grants = 'cadre' then
    insert into passports (id) values (v_uid) on conflict (id) do nothing;
  end if;

  return case when v_grants = 'alumni' then 'upgraded_alumni' else 'upgraded' end;
end $$;

revoke execute on function public.claim_invite(text) from public, anon;
grant  execute on function public.claim_invite(text) to authenticated;

commit;

-- ---------- 驗收 ----------
-- 查 prosrc 的幾條一律先把 SQL 註解剝掉再比對，理由見 2026-09-01-claim-invite.sql：
-- 這個 repo 的註解會解釋規則本身，不剝的話註解會餵飽比對式。
select * from (
  with src as (
    select regexp_replace(prosrc, '--[^\n]*', '', 'g') as body
      from pg_proc where proname = 'claim_invite'
  )
  select 1 as n, 'invite_codes 有 grants 欄位' as item, 'true' as want,
         (exists (select 1 from information_schema.columns
                   where table_schema='public' and table_name='invite_codes'
                     and column_name='grants'))::text as got,
         (exists (select 1 from information_schema.columns
                   where table_schema='public' and table_name='invite_codes'
                     and column_name='grants')) as pass
  union all select 2, 'grants 的預設仍是 cadre', 'cadre',
    coalesce((select column_default from information_schema.columns
               where table_schema='public' and table_name='invite_codes'
                 and column_name='grants'), '（無）'),
    coalesce((select column_default from information_schema.columns
               where table_schema='public' and table_name='invite_codes'
                 and column_name='grants'), '') like '%cadre%'
  union all select 3, '★ 參數名仍然是 p_code', 'true',
    (select (body like '%btrim(p_code)%')::text from src),
    (select body like '%btrim(p_code)%' from src)
  union all select 4, '★ 防連點兩下那把鎖還在', 'true',
    (select (body like '%for update%')::text from src),
    (select body like '%for update%' from src)
  union all select 5, '★ 防搶碼那句還在', 'true',
    (select (body like '%uses_left > 0%')::text from src),
    (select body like '%uses_left > 0%' from src)
  union all select 6, '★ 身分來自那一列（returning grants）', 'true',
    (select (body like '%returning grants%')::text from src),
    (select body like '%returning grants%' from src)
  union all select 7, '★ 只有 cadre 建護照', 'true',
    (select (body like '%v_grants = ''cadre''%' and body like '%insert into passports%')::text from src),
    (select body like '%v_grants = ''cadre''%' and body like '%insert into passports%' from src)
  union all select 8, '★ role 仍然不是使用者改得動的欄位', '0 筆',
    (select count(*) from information_schema.column_privileges x
      where x.table_name='profiles' and x.column_name='role'
        and x.grantee='authenticated' and x.privilege_type='UPDATE')::text || ' 筆',
    (select count(*) from information_schema.column_privileges x
      where x.table_name='profiles' and x.column_name='role'
        and x.grantee='authenticated' and x.privilege_type='UPDATE') = 0
  union all select 9, 'anon 仍然叫不動 claim_invite', '0 筆',
    (select count(*) from information_schema.routine_privileges
      where routine_name='claim_invite' and grantee in ('anon','PUBLIC'))::text || ' 筆',
    (select count(*) from information_schema.routine_privileges
      where routine_name='claim_invite' and grantee in ('anon','PUBLIC')) = 0
) t order by n;

-- ============================================================================
-- 跑完之後怎麼發一組校友碼
-- ============================================================================
-- Table Editor → invite_codes → Insert row，四欄：
--   code       bt-alumni-01
--   uses_left  1
--   grants     alumni      ← 不填的話是幹部碼
--   note       給 2024 屆的誰
```

- [ ] **Step 2: `supabase/schema.sql` 的 `invite_codes` 補上同一欄**

新專案照 `schema.sql` 建起來時要跟遷移檔跑完的結果一樣，不然「重建一個測試專案」會少一欄。在 `create table if not exists invite_codes (...)` 裡加：

```sql
  grants     text not null default 'cadre'
             check (grants in ('cadre', 'alumni')),   -- 這組碼給什麼身分。校友沒有護照
```

- [ ] **Step 3: 靜態檢查**

Run: `./check.sh`
Expected: 全綠（這一步沒有動前端，主要是確認沒有誤觸其他守門）

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/2026-09-17-invite-grants.sql supabase/schema.sql
git commit -m "feat(db): 邀請碼多一欄 grants，校友碼跟幹部碼分開"
```

---

## Task 3: 前端認得校友這個身分

**Files:**
- Modify: `shared/nav.js:34`
- Modify: `shared/auth.js:345-362`（只有註解與回傳值說明）
- Modify: `app/src/main.js:39-45`
- Modify: `app/src/ui.js:160-163`、`app/src/ui.js:362`
- Test: `test/nav.test.mjs`、`test/app-ui.test.mjs`

**Interfaces:**
- Consumes: Task 2 的 `claim_invite()` 四種回傳值
- Produces: `role === "alumni"` 的人登入後被送到 `/settings/`，頂欄只有「設定」

- [ ] **Step 1: 寫失敗的測試**

`test/nav.test.mjs` 加（放在現有「學員的頂欄」那條旁邊）：

```js
// 校友（2026-09-11）。校友沒有護照、沒有時間看板、沒有申請管理，
// 他在這個站上唯一的事情是「我的故事」，而那在設定裡面。
test("★ 校友的頂欄只有設定，一項都不能多", () => {
  const keys = featuresFor("alumni").map(f => f.key);
  assert.deepEqual(keys, ["settings"]);
});
```

`test/app-ui.test.mjs` 加：

```js
// 2026-09-11：同一個輸入框現在收兩種碼，按鈕的字不能只講幹部，
// 不然校友拿到碼會以為自己走錯地方。
test("★ 邀請碼那一頁的按鈕同時講幹部與校友", () => {
  const h = notCadreHTML("");
  assert.match(h, /我是幹部或校友，我有邀請碼/);
});
```

- [ ] **Step 2: 跑測試，確認它失敗**

Run: `node --test test/nav.test.mjs test/app-ui.test.mjs`
Expected: FAIL，兩條新的都紅（`featuresFor("alumni")` 回空陣列、按鈕字串找不到）

- [ ] **Step 3: 改四個地方**

`shared/nav.js` 第 34 行：

```js
  // 2026-09-11：校友也用同一頁（他的「我的故事」在裡面）。
  { key: "settings",     label: "設定",     href: "/settings/",     roles: ["cadre", "student", "alumni"],
```

`app/src/main.js` 的 `render()`，把 `if (S.role === "cadre")` 改成：

```js
  // 2026-09-11：校友跟幹部一樣直接進設定。
  // **校友不走學員那條補資料的路** —— 就讀學校與年級是問高中生的，
  // 對一個已經出發的人沒有意義，而且那一頁沒填完會把他擋在外面。
  if (S.role === "cadre" || S.role === "alumni") {
```

`app/src/ui.js` 第 163 行那顆按鈕與第 160 行的提示：

```js
    <label><i>邀請碼 / Invite code</i><input id="ci" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="跟組長或 BT 拿"></label>
```
```js
      <button class="btn" data-act="do-claim">我是幹部或校友，我有邀請碼</button>
```

第 362 行學員帳號頁上那顆也一起改成「我是幹部或校友，我有邀請碼」。

`shared/auth.js` 的 `claimInvite()` 上面那段註解補一句（**程式碼不動**，它本來就只是把回傳值丟回去）：

```js
// 回傳 'upgraded'（升成幹部）、'upgraded_alumni'（變成校友）、
// 'already_cadre'、'already_alumni'。後兩者不是錯誤，也不會扣掉一組碼。
// **身分由碼決定**（invite_codes.grants），前端說不出自己想變成什麼。
```

- [ ] **Step 4: 跑測試，確認通過**

Run: `node --test test/*.test.mjs`
Expected: PASS，全部

- [ ] **Step 5: Commit**

```bash
git add shared/nav.js shared/auth.js app/src/main.js app/src/ui.js test/nav.test.mjs test/app-ui.test.mjs
git commit -m "feat(app): 校友登入後直接進設定，邀請碼那一頁同時講幹部與校友"
```

---

## Task 4: `alumni_stories`（遷移檔）

**Files:**
- Create: `supabase/migrations/2026-09-18-alumni-stories.sql`
- Modify: `supabase/schema.sql`（表的定義，跟遷移檔一致）
- Modify: `supabase/rls-test.sql`（四種身分的讀寫矩陣）

**Interfaces:**
- Produces:
  - 表 `alumni_stories`（欄位見下）
  - `set_story_approved(p_target uuid, p_ok boolean) returns boolean`
  - `public_alumni()` → `setof record`：`id, name, school, county, city, country, place, quote, note, school_en, country_en, quote_en, note_en`
  - `public_alumni_avatar(p_key text) returns text`
  - **`public_alumni()` 回的欄位名跟 `alumni/community.json` 的 key 完全一樣**，Task 8 因此不用轉換。

- [ ] **Step 1: 寫遷移檔**

`supabase/migrations/2026-09-18-alumni-stories.sql`：

```sql
-- 校友的「我的故事」。　2026-09-11
--
-- 用法：整份貼進 Supabase SQL Editor 按一次 Run。**先跑 2026-09-17-invite-grants.sql。**
--
-- ============================================================================
-- 兩把鑰匙，跟 /team/ 同一套
-- ============================================================================
--   public_story    **本人自己打的勾**。他改得動，別人改不動。
--   story_approved  **P/VP 核可**。只有 president 改得動，本人改不動。
-- 兩個都是 true 才會出現在對外的 /alumni/ 上。
--
-- ⚠ **核可之後改了文字會自動下架。** 那一段文字是用 BT 的名義公開的，
-- 不重審的話，核可一次之後可以改成任何內容。改名字與城市不觸發。
--
-- ⚠ 系統沒有生日欄位，「未滿 18 不放」技術上擋不住，靠 P/VP 那把鑰匙。
-- /admin/ 的核可頁上第一句話就是它。
--
-- ⚠ 故事公開到網路上超出現行 /privacy/ 的告知範圍，政策要跟著改。
-- 名字撤得下來，被搜尋引擎存過的快取撤不乾淨。

begin;

create table if not exists public.alumni_stories (
  id             uuid primary key references public.profiles(id) on delete cascade,
  display_name   text,     -- 公開顯示的名字，可以遮字。空的話退回 profiles.name_zh
  school         text,     -- 高中全名
  county         text,     -- 島上的起飛點。只能是那 16 個，填錯的人會安靜地不出現在圖上
  city           text,     -- 現在在哪個城市
  country        text,     -- 中文國名
  place          text,     -- 現在念哪間學校或在哪裡工作
  quote          text,     -- 他自己的一句話（Iansui 手寫體那一句）
  note           text,     -- 兩三句介紹
  school_en      text,
  country_en     text,
  quote_en       text,
  note_en        text,
  public_story   boolean not null default false,
  story_approved boolean not null default false,
  approved_at    timestamptz,
  updated_at     timestamptz not null default now()
);

-- 縣市擋在資料庫，因為**填錯的後果特別安靜**：那個人只會不出現在圖上，
-- 沒有任何錯誤訊息。這 16 個要跟 scripts/taiwan/cities.json 一致（check.sh 守著）。
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'alumni_stories_county_check') then
    alter table public.alumni_stories add constraint alumni_stories_county_check
      check (county is null or county in
        ('台北','新竹','台中','彰化','嘉義','台南','高雄','屏東',
         '花蓮','宜蘭','台東','桃園','苗栗','雲林','南投','基隆'));
  end if;
end $$;

alter table public.alumni_stories enable row level security;

-- ---------- 本人 ----------
drop policy if exists story_own on public.alumni_stories;
create policy story_own on public.alumni_stories
  for all using (auth.uid() = id) with check (auth.uid() = id);

-- ---------- Co-President ----------
-- 核可要看內容，所以 president 讀得到全部。**其他幹部一列都看不到** ——
-- 核可是 P/VP 的鑰匙，不是全體幹部的。
drop policy if exists story_president_read on public.alumni_stories;
create policy story_president_read on public.alumni_stories
  for select using (public.is_president());

grant select, insert, update on public.alumni_stories to authenticated;

-- ⚠ **RLS 是列層級的，擋不住欄位。** story_approved 與 approved_at 不在下面這句裡，
-- 本人因此改不動自己的核可狀態（跟 profiles.public_approved 同一個做法）。
revoke update on public.alumni_stories from authenticated;
grant update (display_name, school, county, city, country, place, quote, note,
              school_en, country_en, quote_en, note_en, public_story)
  on public.alumni_stories to authenticated;

-- ---------- 改了文字就下架 ----------
create or replace function public.alumni_story_recheck()
returns trigger language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  -- is distinct from：null 換成字串、字串換成 null 都算改過（= 對 null 是 null）。
  if new.quote    is distinct from old.quote
  or new.note     is distinct from old.note
  or new.quote_en is distinct from old.quote_en
  or new.note_en  is distinct from old.note_en then
    new.story_approved := false;
    new.approved_at := null;
  end if;
  return new;
end $$;

drop trigger if exists alumni_story_recheck on public.alumni_stories;
create trigger alumni_story_recheck before update on public.alumni_stories
  for each row execute function public.alumni_story_recheck();

-- ---------- P/VP 那一把 ----------
create or replace function public.set_story_approved(p_target uuid, p_ok boolean)
returns boolean language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_president() then
    raise exception 'not_president' using errcode = 'P0001';
  end if;
  -- 學員沒有故事。他被放上校友頁是一個一定會被誤解的狀態。
  update public.alumni_stories s
     set story_approved = p_ok,
         approved_at = case when p_ok then now() else null end
    from public.profiles p
   where s.id = p_target and p.id = s.id and p.role in ('cadre', 'alumni');
  if not found then raise exception 'not_alumni_or_cadre' using errcode = 'P0001'; end if;
  return p_ok;
end $$;

revoke all on function public.set_story_approved(uuid, boolean) from public, anon;
grant execute on function public.set_story_approved(uuid, boolean) to authenticated;

-- ---------- 對外讀得到的那幾列 ----------
-- **不開放整張表給 anon。** 只有這支函式，只回兩把鑰匙都轉了的那幾列。
--
-- id 回的是 md5(帳號 id)，**不是 uuid**。uuid 是帳號的識別碼，
-- 沒有理由出現在公開頁面的 HTML 裡，而航線圖只需要一個穩定又唯一的 key。
--
-- ⚠ 欄位名**刻意跟 alumni/community.json 的 key 一模一樣**，
-- 前端因此不用寫一層轉換。多一層轉換就多一個會慢慢漂移的地方。
create or replace function public.public_alumni()
returns table (
  id text, name text, school text, county text, city text, country text, place text,
  quote text, note text, school_en text, country_en text, quote_en text, note_en text
) language sql security definer stable
set search_path = public, pg_temp
as $$
  select md5(s.id::text),
         coalesce(nullif(btrim(s.display_name), ''), p.name_zh, p.name_en),
         s.school, s.county, s.city, s.country, s.place,
         s.quote, s.note, s.school_en, s.country_en, s.quote_en, s.note_en
    from public.alumni_stories s
    join public.profiles p on p.id = s.id
   where s.public_story and s.story_approved
     and p.role in ('cadre', 'alumni')
     and s.county is not null
   order by s.approved_at nulls last, s.updated_at;
$$;

-- 大頭照分開一支。照片是 data URL，一張二十到六十 KB，二十個人就是一 MB
-- 壓在一個對外頁面上，而那一頁的手機分數本來只有 79。
-- 航線圖是「點了才飛、飛到才出卡片」，**照片本來就不必一開始就載**。
create or replace function public.public_alumni_avatar(p_key text)
returns text language sql security definer stable
set search_path = public, pg_temp
as $$
  select p.avatar
    from public.alumni_stories s
    join public.profiles p on p.id = s.id
   where md5(s.id::text) = p_key
     and s.public_story and s.story_approved
     and p.role in ('cadre', 'alumni');
$$;

grant execute on function public.public_alumni() to anon, authenticated;
grant execute on function public.public_alumni_avatar(text) to anon, authenticated;

commit;

-- ---------- 驗收 ----------
select * from (
  select 1 as n, '★ story_approved 沒有發給 authenticated' as item, '0 筆' as want,
    (select count(*) from information_schema.column_privileges
      where table_name='alumni_stories' and column_name='story_approved'
        and grantee='authenticated' and privilege_type='UPDATE')::text || ' 筆' as got,
    (select count(*) from information_schema.column_privileges
      where table_name='alumni_stories' and column_name='story_approved'
        and grantee='authenticated' and privilege_type='UPDATE') = 0 as pass
  union all select 2, '★ anon 對這張表沒有任何權限', '0 筆',
    (select count(*) from information_schema.table_privileges
      where table_name='alumni_stories' and grantee='anon')::text || ' 筆',
    (select count(*) from information_schema.table_privileges
      where table_name='alumni_stories' and grantee='anon') = 0
  union all select 3, 'RLS 開著', 'true',
    (select relrowsecurity::text from pg_class where oid='public.alumni_stories'::regclass),
    (select relrowsecurity from pg_class where oid='public.alumni_stories'::regclass)
  union all select 4, '★ 改文字下架的 trigger 在', 'true',
    (exists (select 1 from pg_trigger where tgname='alumni_story_recheck'))::text,
    exists (select 1 from pg_trigger where tgname='alumni_story_recheck')
  union all select 5, '★ 對外函式只回已核可的列', 'true',
    (select (prosrc like '%story_approved%' and prosrc like '%public_story%')::text
       from pg_proc where proname='public_alumni'),
    (select prosrc like '%story_approved%' and prosrc like '%public_story%'
       from pg_proc where proname='public_alumni')
  union all select 6, '★ 對外函式不回 uuid', 'true',
    (select (prosrc like '%md5(s.id::text)%')::text from pg_proc where proname='public_alumni'),
    (select prosrc like '%md5(s.id::text)%' from pg_proc where proname='public_alumni')
  union all select 7, 'set_story_approved 只有登入的人叫得動', '0 筆',
    (select count(*) from information_schema.routine_privileges
      where routine_name='set_story_approved' and grantee in ('anon','PUBLIC'))::text || ' 筆',
    (select count(*) from information_schema.routine_privileges
      where routine_name='set_story_approved' and grantee in ('anon','PUBLIC')) = 0
) t order by n;
```

- [ ] **Step 2: 同一張表加進 `supabase/schema.sql`**

把上面 `create table ... alumni_stories`、constraint、RLS、policy、grant、trigger、三支函式原樣抄進 `schema.sql` 對應的段落（表定義放在 `profiles` 之後，函式放在檔案下半的函式區），**內容一個字都不要改**。新專案照 `schema.sql` 建起來要跟跑完遷移檔一樣。

- [ ] **Step 3: `supabase/rls-test.sql` 加讀寫矩陣**

照那份檔案現有的寫法（設一個假的 `auth.uid()` 再查）加五條：

```sql
-- alumni_stories（2026-09-11）
-- 1. 本人讀得到自己那一列
-- 2. 一般幹部讀不到別人的故事（核可是 P/VP 的鑰匙）
-- 3. president 讀得到全部
-- 4. 本人 update story_approved 會被拒（欄位沒有授權）
-- 5. 核可之後改 quote，story_approved 會自己變回 false
```

- [ ] **Step 4: 靜態檢查**

Run: `./check.sh && node --test test/*.test.mjs`
Expected: 全綠

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/2026-09-18-alumni-stories.sql supabase/schema.sql supabase/rls-test.sql
git commit -m "feat(db): alumni_stories，兩把鑰匙加改文字自動下架"
```

---

## Task 5: 設定頁的「我的故事」畫面（純函式先行）

**Files:**
- Modify: `settings/src/ui.js`
- Create: `test/alumni-story.test.mjs`
- Modify: `settings/index.html`（`.story` 那幾條樣式）

**Interfaces:**
- Consumes: Task 4 的欄位名
- Produces:
  - `export const COUNTIES`（16 個字串，順序跟 `scripts/taiwan/cities.json` 一致）
  - `export function storyMissing(story)` → 缺的欄位名陣列（空陣列表示齊了）
  - `export function storyStatus(story)` → 給人看的一句話
  - `export function storyHTML(me, story)` → 那一區的 HTML
  - `settingsHTML(me, msg, busy, story)` 多收第四個參數

- [ ] **Step 1: 寫失敗的測試**

`test/alumni-story.test.mjs`：

```js
// 「我的故事」（2026-09-11）。幹部與校友填，Co-President 核可，出現在 /alumni/ 上。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { COUNTIES, storyMissing, storyStatus, storyHTML, settingsHTML } from "../settings/src/ui.js";

const FULL = {
  display_name: "張 O 睿", school: "高雄中學", county: "高雄", city: "Vancouver",
  country: "加拿大", place: "UBC", quote: "現在換我回去講。", note: "第一次接觸 BT 是在高雄的一場講座。",
  public_story: false, story_approved: false,
};

// 縣市填錯的後果特別安靜：那個人只會不出現在圖上，沒有任何錯誤訊息。
// 所以選單的 16 個必須跟島上的點完全一樣。
test("★ 縣市清單跟 scripts/taiwan/cities.json 完全一致", () => {
  const cities = JSON.parse(readFileSync(new URL("../scripts/taiwan/cities.json", import.meta.url), "utf8"));
  assert.deepEqual([...COUNTIES].sort(), Object.keys(cities).sort());
});

test("必填缺了會被指出來，而且講的是人看得懂的名字", () => {
  assert.deepEqual(storyMissing(FULL), []);
  assert.deepEqual(storyMissing({ ...FULL, county: "" }), ["縣市"]);
  assert.deepEqual(storyMissing({ ...FULL, quote: "", city: "" }), ["現在的城市", "一句話"]);
});

// 英文是選填的，沒有就顯示中文那一份（/alumni/ 本來就是這樣）。
test("英文欄位不填也算填齊了", () => {
  assert.deepEqual(storyMissing({ ...FULL, quote_en: "", note_en: "" }), []);
});

test("四種狀態各有一句話", () => {
  assert.match(storyStatus({ ...FULL, public_story: false }), /還沒有勾/);
  assert.match(storyStatus({ ...FULL, public_story: true, story_approved: false }), /等 Co-President/);
  assert.match(storyStatus({ ...FULL, public_story: true, story_approved: true }), /已經在公開的校友頁上/);
});

test("畫得出每一格，而且值會填回去", () => {
  const h = storyHTML({ role: "alumni", name_zh: "張小睿" }, FULL);
  assert.match(h, /張 O 睿/);
  assert.match(h, /高雄中學/);
  assert.match(h, /UBC/);
  assert.match(h, /現在換我回去講/);
  // 16 個縣市都要在選單裡
  for (const c of COUNTIES) assert.match(h, new RegExp(">" + c + "<"));
});

// 名字沒填就用 profiles 的中文姓名，不要逼他再打一次。
test("公開顯示的名字空著時，提示帶的是他的中文姓名", () => {
  const h = storyHTML({ role: "alumni", name_zh: "張小睿" }, { ...FULL, display_name: "" });
  assert.match(h, /張小睿/);
});

// ⚠ 高中生還沒出發，這一區對他沒有意義。
test("★ 學員看不到「我的故事」這一區", () => {
  const h = settingsHTML({ role: "student", email: "a@b.c" }, "", false, null);
  assert.equal(/我的故事/.test(h), false);
});

test("★ 幹部與校友都看得到", () => {
  for (const role of ["cadre", "alumni"]) {
    const h = settingsHTML({ role, email: "a@b.c" }, "", false, FULL);
    assert.match(h, /我的故事/);
  }
});

// 同意的時候要看得到自己正在公開什麼，逐項列出來，不是一句「公開個人資料」。
test("★ 同意那一句逐項列出會公開的東西", () => {
  const h = storyHTML({ role: "alumni", name_zh: "張小睿" }, FULL);
  for (const w of ["名字", "大頭照", "高中", "城市", "一句話", "介紹"]) assert.match(h, new RegExp(w));
});

// 離島現在不在島的資料裡。選不到就要說為什麼，不然那個人會以為是壞掉。
test("★ 離島的人看得到一句說明", () => {
  const h = storyHTML({ role: "alumni", name_zh: "張小睿" }, FULL);
  assert.match(h, /澎湖|金門|馬祖/);
});
```

- [ ] **Step 2: 跑測試，確認它失敗**

Run: `node --test test/alumni-story.test.mjs`
Expected: FAIL，`COUNTIES` 等等都還不存在

- [ ] **Step 3: 實作 `settings/src/ui.js`**

加在 `TEAMS` 底下：

```js
// 島上的 16 個起飛點。**順序與內容跟 scripts/taiwan/cities.json 一致**
// （test/alumni-story.test.mjs 逐字比對）。
// 填錯或填了表上沒有的縣市，那個人只會**安靜地不出現**在航線圖上，
// 所以這裡是選單不是文字框，資料庫那邊還有一條 check constraint。
export const COUNTIES = ["台北", "桃園", "新竹", "苗栗", "台中", "彰化", "南投",
                         "雲林", "嘉義", "台南", "高雄", "屏東", "宜蘭", "花蓮",
                         "台東", "基隆"];

// 必填的六格加一句話。**英文是選填的** —— /alumni/ 沒有英文就顯示中文那一份。
const STORY_NEED = [
  ["school", "高中"], ["county", "縣市"], ["city", "現在的城市"],
  ["country", "國家"], ["place", "學校或公司"], ["quote", "一句話"], ["note", "介紹"],
];

export function storyMissing(story) {
  const s = story || {};
  return STORY_NEED.filter(([k]) => !String(s[k] || "").trim()).map(([, label]) => label);
}

// 狀態一句話。**「勾了但還沒核可」跟「已經公開」要看得出差別** ——
// 看不出來的話，那個人會以為自己已經在網站上了。
export function storyStatus(story) {
  const s = story || {};
  if (!s.public_story) return "還沒有勾同意，所以這一段只有你自己看得到。";
  if (!s.story_approved) return "已經送出，等 Co-President 核可才會出現在公開的校友頁上。";
  return "已經在公開的校友頁上了。改了那一句話或介紹，會自動下架等重新核可。";
}
```

`storyHTML()`（放在 `avatarHTML()` 後面）：

```js
// 「我的故事」。幹部與校友都有，學員沒有（高中生還沒出發）。
//
// 欄位順序**照 /alumni/ 卡片上的順序**：名字、從哪裡、到哪裡、那一句話、介紹。
// 填的時候就看得出成品長什麼樣，不用另外做預覽。
export function storyHTML(me, story) {
  const s = story || {};
  const v = k => esc(s[k] || "");
  const on = !!s.public_story;
  return `<h3 class="sec-h">我的故事</h3>
    <p class="sec-note">填完並且勾同意、Co-President 核可之後，
      你會出現在<a href="../alumni/">公開的校友頁</a>那張航線圖上：
      從你的高中飛到你現在的城市。</p>
    <label><i>公開顯示的名字</i><input id="sname" value="${v("display_name")}"
      placeholder="${esc(me.name_zh || me.name_en || "")}">
      </label>
    <p class="sec-note">想遮字就寫成「張 O 睿」。空著的話用你上面填的姓名。</p>
    <div class="two">
      <label><i>高中</i><input id="sschool" list="schools" value="${v("school")}"
        autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false"
        placeholder="打兩個字就會跳出來"></label>
      <label><i>高中在哪個縣市</i><select id="scounty">
        <option value="">請選擇</option>
        ${COUNTIES.map(c => `<option${s.county === c ? " selected" : ""}>${esc(c)}</option>`).join("")}
      </select></label>
    </div>
    <p class="sec-note">選了高中之後這一格會自己跳出來。
      新北的高中選「台北」，圖上的起飛點畫在台北。
      高中在澎湖、金門、馬祖的話先寫信給我們，那三個地方還不在圖上。</p>
    <div class="two">
      <label><i>現在的城市</i><input id="scity" value="${v("city")}" placeholder="Vancouver"></label>
      <label><i>國家</i><input id="scountry" value="${v("country")}" placeholder="加拿大"></label>
    </div>
    <label><i>現在念哪間學校或在哪裡工作</i><input id="splace" value="${v("place")}" placeholder="UBC"></label>
    <label><i>你自己的一句話</i><input id="squote" value="${v("quote")}"
      placeholder="現在換我回去講。台下坐的就是三年前的我。"></label>
    <p class="sec-note">這一句在那一頁上用手寫體排出來，是整頁最重要的地方。</p>
    <label><i>一段介紹</i><input id="snote" value="${v("note")}"
      placeholder="兩三句：從哪裡出發、現在在做什麼。"></label>
    <details class="enfold"><summary>英文版（選填）</summary>
      <p class="sec-note">那一頁有中英切換。沒填的話英文版就顯示中文這一份，畫面不會壞。</p>
      <div class="two">
        <label><i>高中（英文）</i><input id="sschoolen" value="${v("school_en")}"></label>
        <label><i>國家（英文）</i><input id="scountryen" value="${v("country_en")}"></label>
      </div>
      <label><i>那一句話（英文）</i><input id="squoteen" value="${v("quote_en")}"></label>
      <label><i>介紹（英文）</i><input id="snoteen" value="${v("note_en")}"></label>
    </details>
    <label class="check">
      <input id="spub" type="checkbox"${on ? " checked" : ""}>
      <span>我同意把我的<b>名字、大頭照、高中、現在的城市與學校、上面那一句話與介紹</b>
        放上<a href="../alumni/">公開的校友頁</a>。那一頁任何人都看得到，也會被搜尋引擎收錄。
        隨時可以把這個勾拿掉，拿掉就會從那一頁消失。</span>
    </label>
    <p class="sec-note">${esc(storyStatus(s))}</p>`;
}
```

`settingsHTML()` 改成收第四個參數，並在大頭照那一區後面插進去：

```js
export function settingsHTML(me, msg, busy, story) {
  const cadre = me.role === "cadre";
  const teller = cadre || me.role === "alumni";   // 誰有「我的故事」
```
```js
    ${cadre ? avatarHTML(me) : ""}
    ${teller ? storyHTML(me, story) : ""}
```

`settings/index.html` 加兩條樣式（放在 `.check` 後面）：

```css
  /* 英文版那一折。summary 的樣式全站一致，不另外發明一個。 */
  .enfold{margin:0 0 16px}
  .enfold summary{font-size:13.5px;font-weight:600;color:rgba(16,42,134,.8);padding:6px 0}
```

- [ ] **Step 4: 跑測試，確認通過**

Run: `node --test test/alumni-story.test.mjs`
Expected: PASS，10 tests

- [ ] **Step 5: Commit**

```bash
git add settings/src/ui.js settings/index.html test/alumni-story.test.mjs
git commit -m "feat(settings): 幹部與校友多一區「我的故事」"
```

---

## Task 6: 設定頁真的存得起來

**Files:**
- Modify: `settings/src/main.js`
- Modify: `check.sh:1001`（`PROFILE_WRITE_FILES` 的數量）與新的一條 `STORY_WRITABLE`
- Test: `test/alumni-story.test.mjs`（加兩條）

**Interfaces:**
- Consumes: Task 4 的表與欄位授權、Task 5 的 `storyMissing()`
- Produces: 設定頁那顆「存起來」同時存 `profiles` 與 `alumni_stories`

- [ ] **Step 1: 寫失敗的測試**

`test/alumni-story.test.mjs` 加：

```js
// ⚠ check.sh 那條守門是用比對式讀原始碼的，`.upsert(patch)` 它看不懂。
// 寫成字面物件是為了讓守門守得到（2026-09-08 profiles 那邊學到的同一件事）。
test("★ settings/src/main.js 寫 alumni_stories 用字面物件", () => {
  const src = readFileSync(new URL("../settings/src/main.js", import.meta.url), "utf8");
  assert.match(src, /\.from\("alumni_stories"\)[\s\S]{0,80}?\.upsert\(\{/);
  assert.equal(/\.from\("alumni_stories"\)[\s\S]{0,80}?\.(?:update|upsert)\(\s*[^{\s]/.test(src), false);
});

// story_approved 由資料庫管。前端送它的話整句會被拒，而且那是在偷轉另一把鑰匙。
test("★ 前端不送 story_approved 與 approved_at", () => {
  const src = readFileSync(new URL("../settings/src/main.js", import.meta.url), "utf8")
    .split("\n").filter(l => !/^\s*\/\//.test(l)).join("\n");
  assert.equal(/story_approved\s*:/.test(src), false);
  assert.equal(/approved_at\s*:/.test(src), false);
});
```

- [ ] **Step 2: 跑測試，確認它失敗**

Run: `node --test test/alumni-story.test.mjs`
Expected: FAIL，前兩條新的紅（`alumni_stories` 還沒有被寫進 main.js）

- [ ] **Step 3: 實作 `settings/src/main.js`**

`boot()` 裡多讀一次故事（幹部與校友才讀）：

```js
    S.me = { ...(data || {}), email: S.user.email };
    // 「我的故事」是另一張表。學員沒有這一區，所以也不用查。
    if (S.me.role === "cadre" || S.me.role === "alumni") {
      const { data: st, error: e2 } = await supabase.from("alumni_stories")
        .select("display_name, school, county, city, country, place, quote, note, " +
                "school_en, country_en, quote_en, note_en, public_story, story_approved, updated_at")
        .eq("id", S.user.id).maybeSingle();
      // 讀不到故事**不擋整頁**：姓名與大頭照照樣改得動。
      if (e2) console.warn("故事讀不到，先當作還沒填：", e2);
      S.story = st || null;
    }
```

`render()` 把故事傳下去：`UI.settingsHTML(S.me, S.msg, S.busy, S.story)`。

選高中自動帶縣市（接在 `fillSchools` 旁邊）：

```js
// 選了高中就把縣市帶出來。**只在縣市還空著的時候帶** ——
// 蓋掉他自己選的那一個會很嚇人，尤其是高中在新北、起飛點要選台北的人。
// 對不上就不動，那一格他自己選得了。
function countyOf(label) {
  const hit = (SCHOOLS || []).find(s => s.label === label);
  if (!hit) return "";
  const c = String(hit.county || "").replace(/[市縣]$/, "").replace(/^臺/, "台");
  if (c === "新北") return "台北";           // 圖上沒有新北，起飛點畫在台北
  return UI.COUNTIES.includes(c) ? c : "";
}
```

（`fillSchools()` 把 `data.schools` 存進模組層的 `SCHOOLS` 變數；`school` 那一格的
`change` 事件呼叫 `countyOf()`，縣市那格空著才填。`settings` 的學校 datalist
原本只有學員那一格在用，現在幹部與校友那一格也 `list="schools"`，
所以 `render()` 裡掛 `focus` 事件的選擇器要同時認 `#school` 與 `#sschool`。）

`save` 那一段，在現有的兩條路後面接一句故事的 upsert：

```js
    // 「我的故事」。**另一張表，所以是第二句。**
    // ⚠ 寫成字面物件，理由跟上面那兩句一模一樣（check.sh 讀得懂才守得到）。
    if (S.me.role === "cadre" || S.me.role === "alumni") {
      const story = {
        display_name: val("sname") || null,
        school: val("sschool") || null,
        county: (document.getElementById("scounty") || {}).value || null,
        city: val("scity") || null,
        country: val("scountry") || null,
        place: val("splace") || null,
        quote: val("squote") || null,
        note: val("snote") || null,
        school_en: val("sschoolen") || null,
        country_en: val("scountryen") || null,
        quote_en: val("squoteen") || null,
        note_en: val("snoteen") || null,
        public_story: !!(document.getElementById("spub") || {}).checked,
      };
      // 勾了同意才要求填齊。還沒勾的人是在慢慢填，不要擋他存檔。
      const missing = UI.storyMissing(story);
      if (story.public_story && missing.length) {
        S.busy = false;
        S.msg = "要公開的話這幾格還沒填：" + missing.join("、");
        render(); return;
      }
      const { error: e3 } = await supabase.from("alumni_stories").upsert({
        id: S.user.id,
        display_name: story.display_name, school: story.school, county: story.county,
        city: story.city, country: story.country, place: story.place,
        quote: story.quote, note: story.note,
        school_en: story.school_en, country_en: story.country_en,
        quote_en: story.quote_en, note_en: story.note_en,
        public_story: story.public_story,
      });
      if (e3) throw e3;
      S.story = { ...(S.story || {}), ...story };
    }
```

存檔成功那句訊息：故事勾了同意但還沒核可的話，講清楚下一步是什麼。

```js
      S.msg = (S.story && S.story.public_story && !S.story.story_approved)
        ? "存好了。你的故事還要等 Co-President 核可才會出現在校友頁上。"
        : "存好了。";
```

- [ ] **Step 4: 跑測試，確認通過**

Run: `node --test test/*.test.mjs`
Expected: PASS

- [ ] **Step 5: `check.sh` 加新表的欄位對帳**

照 `PROFILE_WRITABLE` 那一段複製一份給新表（掃 `settings/src/main.js` 的 1 個寫入點）：

```sh
# 前端寫進 alumni_stories 的欄位（2026-09-11）。跟 profiles 那條同一個形狀。
# story_approved / approved_at / updated_at 出現在清單裡一律 FAIL：
# 前者是 P/VP 那把鑰匙，後兩者由資料庫的 trigger 蓋。
STORY_WRITABLE="city country country_en county display_name id note note_en place public_story quote quote_en school school_en"
STORY_WRITE_FILES="settings/src/main.js:1"
```

（比對的 node 片段整段照 `profileCols` 那一段改表名即可，連「不是字面物件就大聲說看不懂」那一段一起帶過來。）

同時把 `PROFILE_WRITE_FILES` 的 `settings/src/main.js:3` 確認仍然正確（這一輪沒有新增寫進 `profiles` 的路徑，數字不變）。

- [ ] **Step 6: 跑守門**

Run: `./check.sh`
Expected: 全綠，看得到「前端寫進 alumni_stories 的欄位都在允許清單裡」

- [ ] **Step 7: Commit**

```bash
git add settings/src/main.js check.sh test/alumni-story.test.mjs
git commit -m "feat(settings): 我的故事存得起來，加一條欄位權限守門"
```

---

## Task 7: 後台的「校友頁」分頁

**Files:**
- Modify: `admin/src/data.js`（接在 `setApproved` 後面）
- Modify: `admin/src/ui.js`（`tabsHTML` 與新的 `alumniStoriesHTML`）
- Modify: `admin/src/main.js`（`openStories`、tab 分派、核可 handler）
- Test: `test/alumni-story.test.mjs`（加四條）

**Interfaces:**
- Consumes: Task 4 的 `set_story_approved()`
- Produces: `loadStories()`、`setStoryApproved(id, ok)`、`alumniStoriesHTML(rows, msg, busy)`

- [ ] **Step 1: 寫失敗的測試**

```js
import { alumniStoriesHTML, tabsHTML } from "../admin/src/ui.js";

const ROW = { id: "u1", name: "張 O 睿", school: "高雄中學", city: "Vancouver",
  country: "加拿大", place: "UBC", quote: "現在換我回去講。", note: "第一次接觸 BT 是在高雄。",
  public_story: true, story_approved: false, updated_at: "2026-09-11T02:00:00Z" };

// 核可的是內容不是名字。看不到那段文字就沒辦法判斷能不能用 BT 的名義公開。
test("★ 核可清單上看得到完整內容", () => {
  const h = alumniStoriesHTML([ROW], "", false);
  for (const w of ["張 O 睿", "高雄中學", "Vancouver", "現在換我回去講", "第一次接觸 BT"])
    assert.match(h, new RegExp(w));
});

// 系統沒有生日欄位，「未滿 18 不放」只有人擋得住，而這裡是唯一會被看到的地方。
test("★ 核可前要確認的三件事都寫在頁面上", () => {
  const h = alumniStoriesHTML([ROW], "", false);
  assert.match(h, /18/);
  assert.match(h, /校友/);
  assert.match(h, /BT 的名義|公開/);
});

test("等核可的排在已經公開的前面", () => {
  const h = alumniStoriesHTML([
    { ...ROW, id: "a", name: "已公開的人", story_approved: true },
    { ...ROW, id: "b", name: "等核可的人", story_approved: false },
  ], "", false);
  assert.ok(h.indexOf("等核可的人") < h.indexOf("已公開的人"), "等核可的沒有排在最上面");
});

// 沒有人勾的時候不要畫一份「還沒有人問過」的名單，那會讓人很想直接核可。
test("★ 一個人都沒勾的時候說清楚下一步在哪", () => {
  const h = alumniStoriesHTML([], "", false);
  assert.match(h, /還沒有人/);
  assert.match(h, /設定/);
});

test("★ 校友頁分頁只有 Co-President 看得到", () => {
  assert.match(tabsHTML("stories", true), /data-t="stories"/);
  assert.equal(/data-t="stories"/.test(tabsHTML("forms", false)), false);
});
```

- [ ] **Step 2: 跑測試，確認它失敗**

Run: `node --test test/alumni-story.test.mjs`
Expected: FAIL，`alumniStoriesHTML is not a function`

- [ ] **Step 3: 實作三支**

`admin/src/data.js`：

```js
// ── 校友頁的核可（2026-09-11）────────────────────────────────────────
// 只列**已經自己打過勾**的人，理由跟團隊頁那一份一模一樣：
// 沒打勾的人出現在這裡，會變成一份「還沒有人問過他們」的名單。
//
// 等核可的排最上面 —— 這一頁的工作就是處理那幾個。
export async function loadStories() {
  need();
  const { data, error } = await supabase.from("alumni_stories")
    .select("id, display_name, school, county, city, country, place, quote, note, " +
            "public_story, story_approved, updated_at")
    .eq("public_story", true);
  if (error) throw error;
  const rows = data || [];
  // 名字要另外查 profiles：故事那張表只存「公開顯示的名字」，可能是空的。
  const ids = rows.map(r => r.id);
  let names = {};
  if (ids.length) {
    const { data: ps } = await supabase.from("profiles").select("id, name_zh, name_en").in("id", ids);
    for (const p of ps || []) names[p.id] = p.name_zh || p.name_en || "";
  }
  return rows
    .map(r => ({ ...r, name: (r.display_name || "").trim() || names[r.id] || "（沒有名字）" }))
    .sort((a, b) => Number(a.story_approved) - Number(b.story_approved));
}

export async function setStoryApproved(id, ok) {
  need();
  const { error } = await supabase.rpc("set_story_approved", { p_target: id, p_ok: ok });
  if (error) throw error;
}
```

`admin/src/data.js` 的 `says()` 錯誤對照表加一條：

```js
  ["not_alumni_or_cadre", "這個人不是幹部也不是校友，不能放上校友頁。"],
```

`admin/src/ui.js` 的 `tabsHTML()` 在 president 那一段加：

```js
    <button class="chip wide${tab === "stories" ? " on" : ""}" data-act="tab" data-t="stories">校友頁</button>
```

新函式（放在 `publicTeamHTML` 後面）：

```js
// 校友頁的核可（2026-09-11）。**只有 Co-President 看得到**（核可是他們的鑰匙）。
//
// ⚠ 這裡要看到的是**內容**，不是名字。核可的意思是
// 「這段文字可以用 BT 的名義公開」，看不到文字就沒辦法判斷。
export function alumniStoriesHTML(rows, msg, busy) {
  const on = rows.filter(r => r.story_approved).length;
  return `<div class="card">
    <h2>校友頁</h2>
    <div class="sub">誰出現在對外的 /alumni/ 航線圖上。已經公開 ${on} 人。</div>
    ${msg ? `<div class="wnote big">${esc(msg)}</div>` : ""}
    <div class="wnote big">核可之前確認三件事：<br>
      1. <b>他滿 18 歲了嗎。</b>未滿一律不放。系統沒有生日欄位，這一條只有你擋得住。<br>
      2. <b>他真的是 BT 校友嗎。</b>邀請碼可能被轉給別人。<br>
      3. <b>這段文字可以用 BT 的名義公開嗎。</b>核可之後他再改那一句話或介紹，
         系統會自動下架，重新回到這份清單上。</div>
    ${rows.length ? `<ul class="flist">${rows.map(r => `<li>
        <div class="arow">
          <label class="apick"><input type="checkbox" data-act="approve-story" data-id="${esc(r.id)}"
            ${r.story_approved ? "checked" : ""}${busy ? " disabled" : ""}
            aria-label="核可 ${esc(r.name)}"></label>
          <div class="abody">
            <div class="fhead"><b>${esc(r.name)}</b>
              ${r.story_approved ? `<span class="tag open">在公開頁面上</span>`
                                 : `<span class="tag">等核可</span>`}</div>
            <div class="fmeta">${esc([r.school, r.county].filter(Boolean).join("・"))}
              → ${esc([r.country, r.city, r.place].filter(Boolean).join("・"))}</div>
            <p class="fquote">${esc(r.quote || "")}</p>
            <p class="fmeta">${esc(r.note || "")}</p>
            <div class="fmeta">內容最後改過：${esc(String(r.updated_at || "").slice(0, 10))}</div>
          </div>
        </div>
      </li>`).join("")}</ul>` : `<div class="empty">還沒有人勾同意。<br>
      幹部與校友要先到「設定」把故事填完並勾同意，才會出現在這裡。</div>`}
  </div>`;
}
```

`admin/index.html` 加一條樣式：`.fquote{font-size:14.5px;margin:6px 0 4px}`。

`admin/src/main.js`：

```js
async function openStories() {
  S.busy = true; render();
  try {
    S.stories = await D.loadStories();
    S.view = "stories"; S.busy = false;
  } catch (e) { S.busy = false; S.msg = "校友名單載不到：" + D.says(e); }
  render();
}
```
tab 分派加 `else if (b.dataset.t === "stories") { await openStories(); }`；
`render()` 裡加 `else if (S.view === "stories") { ... UI.alumniStoriesHTML(S.stories, S.msg, S.busy) ... }`；
handler 加：

```js
  if (act === "approve-story") {
    const ok = b.checked;
    S.busy = true; render();
    try {
      await D.setStoryApproved(id, ok);
      const r = S.stories.find(x => x.id === id);
      if (r) r.story_approved = ok;
      S.busy = false; S.msg = "";
    } catch (err) { S.busy = false; S.msg = "改不了：" + D.says(err); }
    render();
    return;
  }
```

- [ ] **Step 4: 跑測試，確認通過**

Run: `node --test test/*.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add admin/src/data.js admin/src/ui.js admin/src/main.js admin/index.html test/alumni-story.test.mjs
git commit -m "feat(admin): 校友頁分頁，Co-President 核可故事"
```

---

## Task 8: `/alumni/` 先讀資料庫

**Files:**
- Modify: `alumni/index.html:733-742`（載入那一段）、`826-830`（示範標示）、`882-885`（照片）
- Modify: `alumni/community.json`（`_readme` 改寫）
- Modify: `check.sh:338-395`（community.json 那條守門的說明）
- Test: `test/alumni-story.test.mjs`（加三條讀 HTML 的）

**Interfaces:**
- Consumes: Task 1 的 `shared/supabase-config.js`、Task 4 的 `public_alumni()` 與 `public_alumni_avatar()`

- [ ] **Step 1: 寫失敗的測試**

```js
const page = readFileSync(new URL("../alumni/index.html", import.meta.url), "utf8");

// 這一頁是對外頁面，載整包 supabase-js 會讓每個路人多下載一份他用不到的東西。
test("★ /alumni/ 仍然不載 supabase 套件", () => {
  assert.equal(/vendor\/supabase-js/.test(page), false);
  assert.equal(/from "\.\.\/shared\/supabase\.js"/.test(page), false);
});

// 金鑰只有一份。這一頁用動態 import 去拿那支只有常數的小檔。
test("★ 金鑰是 import 來的，不是又寫死一份", () => {
  assert.match(page, /import\("\.\.\/shared\/supabase-config\.js"\)/);
  assert.equal(/sb_publishable_/.test(page), false);
});

// 資料庫空的或連不上的時候，對外頁面不能空著，也不該講內部狀態。
test("★ 讀不到資料庫就退回 community.json", () => {
  assert.match(page, /public_alumni/);
  assert.match(page, /community\.json/);
});
```

- [ ] **Step 2: 跑測試，確認它失敗**

Run: `node --test test/alumni-story.test.mjs`
Expected: FAIL，後兩條紅

- [ ] **Step 3: 換掉載入那一段**

把現有的 `fetch("./community.json")...` 換成：

```js
  /* 資料來源：**先問資料庫，沒有真人才退回 community.json**（2026-09-11）。
     這推翻了 2026-09-07「這一頁不接 Supabase」那個決定，理由是名單的維護者
     從「寫程式的人」變成「校友本人」，記在 GOALS.md 與 decisions log。

     ⚠ **這一頁仍然不載 supabase 套件。** 用動態 import 只拿那兩個常數
     （shared/supabase-config.js 不 import 任何東西，check.sh 守著），
     然後用瀏覽器內建的 fetch 打 REST 端點。

     public_alumni() 回的欄位名跟 community.json 的 key 一模一樣，
     所以下面不用寫任何轉換 —— 多一層轉換就多一個會慢慢漂移的地方。 */
  function fromDB() {
    return import("../shared/supabase-config.js").then(function (cfg) {
      return fetch(cfg.SUPABASE_URL + "/rest/v1/rpc/public_alumni", {
        method: "POST",
        headers: { "Content-Type": "application/json",
                   apikey: cfg.SUPABASE_PUBLISHABLE_KEY,
                   Authorization: "Bearer " + cfg.SUPABASE_PUBLISHABLE_KEY },
        body: "{}",
      });
    }).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    }).then(function (rows) {
      /* 一位都還沒核可就當作沒有資料，退回示範那一份。
         **這件事不對使用者說任何話**：對他來說沒有壞掉。 */
      if (!Array.isArray(rows) || !rows.length) return null;
      return { demo: false, people: rows };
    });
  }

  function fromJSON() {
    return fetch("./community.json")
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); });
  }

  fromDB()
    .catch(function (e) {
      if (window.console) console.warn("校友名單讀不到資料庫，改用示範資料。", e);
      return null;
    })
    .then(function (d) { return d || fromJSON(); })
    .then(function (d) { DATA = d; draw(d); })
    .catch(function (e) {
      /* 兩條路都失敗才說話。留一張空白的圖會讓人以為是自己網路的問題。 */
      card.innerHTML = '<p class="hint">名單一時讀不到，請重新整理看看。' +
        '如果一直這樣，寫信給我們：<a href="mailto:beyondtaiwan2020@gmail.com">beyondtaiwan2020@gmail.com</a></p>';
      if (window.console) console.error("校友名單讀取失敗", e);
    });
```

照片改成點到才拿（`select()` 裡那段 `var face = ...` 前面）：

```js
      /* 大頭照是點到那個人才去拿的（2026-09-11）。照片是 data URL，
         一張二十到六十 KB，一開始全部載會壓垮這一頁的手機分數。
         卡片本來就是「飛到了」才出現，所以這趟飛行的時間剛好夠拿。
         拿不到就維持姓氏的單字圖示，畫面一樣完整。 */
      if (!data.demo && p.photo === undefined) {
        p.photo = "";
        import("../shared/supabase-config.js").then(function (cfg) {
          return fetch(cfg.SUPABASE_URL + "/rest/v1/rpc/public_alumni_avatar", {
            method: "POST",
            headers: { "Content-Type": "application/json",
                       apikey: cfg.SUPABASE_PUBLISHABLE_KEY,
                       Authorization: "Bearer " + cfg.SUPABASE_PUBLISHABLE_KEY },
            body: JSON.stringify({ p_key: p.id }),
          });
        }).then(function (r) { return r.ok ? r.json() : null; })
          .then(function (url) {
            if (!url) return;
            p.photo = url;
            /* 已經畫出來的話就把圖片補上去，沒有的話下次點到就有了。 */
            var slot = card.querySelector(".who .avatar");
            if (slot && card.dataset.id === p.id) {
              var img = new Image(72, 72);
              img.className = "avatar"; img.src = url; img.alt = p.name;
              slot.replaceWith(img);
            }
          }).catch(function () { /* 沒有照片不是錯誤 */ });
      }
```

（`card.innerHTML = html` 的兩處後面各加一行 `card.dataset.id = p.id;`。）

- [ ] **Step 4: 改 `community.json` 的 `_readme`**

第一段改成：

```
"這一份現在是**示範資料**。真正的名單在資料庫裡，由校友自己在 /settings/ 填、",
"Co-President 在 /admin/ 核可（2026-09-11 起）。",
"這一頁會先問資料庫，一位真人都還沒核可、或連不上的時候才顯示下面這幾筆。",
"所以這幾筆不用刪，它是退路，也是「這一頁長什麼樣」的範例。",
```

- [ ] **Step 5: 跑測試與守門**

Run: `node --test test/*.test.mjs && ./check.sh`
Expected: 全綠。`check.sh` 那條 community.json 守門照樣要通過（示範資料還在，欄位沒變）

- [ ] **Step 6: 手動看一次**

Run: `python3 -m http.server 8000`，開 `http://localhost:8000/alumni/`
Expected: 畫面跟現在一模一樣（資料庫還沒有真人，退回示範資料），
Console 有一行 warn 說改用示範資料，**畫面上不出現任何內部狀態**。

- [ ] **Step 7: Commit**

```bash
git add alumni/index.html alumni/community.json check.sh test/alumni-story.test.mjs
git commit -m "feat(alumni): 航線圖先讀資料庫，沒有真人才退回示範資料"
```

---

## Task 9: 隱私政策、文件、決定紀錄

**Files:**
- Modify: `privacy/index.html`（草稿，**要 Paul 點頭才算完成**）
- Modify: `README.md`（新增一節「校友與我的故事」）
- Modify: `GOALS.md`（目標 8 那一格的「還沒完的一件」、明確不做補兩條）
- Modify: `~/Anson/decisions/log.md`（append 一行）

- [ ] **Step 1: 寫 `/privacy/` 那一段的草稿**

在現有「大頭照」那一段後面加一段，**先不要 commit，貼給 Paul 看**：

```html
<h3>校友頁上的個人故事</h3>
<p>幹部與校友可以在設定裡填一段自己的故事。勾了同意、而且經過 Co-President 核可之後，
下面這些會出現在任何人都看得到的校友頁上，也會被搜尋引擎收錄：
公開顯示的名字（可以自己遮字）、大頭照、高中、現在所在的城市與國家、
現在就讀的學校或工作的地方、你自己寫的一句話與一段介紹。</p>
<p>隨時可以到設定把那個勾拿掉，拿掉之後會立刻從公開頁面上消失。
但搜尋引擎存過的快取不會立刻跟著消失，那不是我們控制得了的。</p>
<p>不填、不勾完全沒有關係，也不影響你在 BT 的任何事。</p>
```

- [ ] **Step 2: Paul 看過之後才寫進去並 commit**

```bash
git add privacy/index.html
git commit -m "docs(privacy): 校友故事的公開範圍（Paul 過稿）"
```

- [ ] **Step 3: `README.md` 加一節**

標題「校友與「我的故事」（2026-09-11）」，內容至少要有：

- 兩把鑰匙的表（誰改得動、在哪裡），跟團隊頁那一節同一個形狀
- **怎麼發一組校友碼**（`invite_codes` 的 `grants` 填 `alumni`），接在現有「怎麼發新邀請碼」那一節後面
- 核可前要確認的三件事
- 改了文字會自動下架這件事，以及它為什麼寫在資料庫裡
- `/alumni/` 的資料來源順序：資料庫 → 示範 JSON
- 新北併台北、離島還不在圖上這兩個已知缺口
- 兩支遷移檔要跑，而且要照 README 那四步驗

- [ ] **Step 4: `GOALS.md` 更新**

- 目標 8 那一格「還沒完的一件」改成：alumni 名單改由校友自己填，程式 2026-09-11 完成，等第一位真人核可。
- 「明確不做」加兩條：**不做校友之間互相看得到的名錄**、**不做核可通知信**（狀態變了不寄信，因為這一頁的使用者一年來不了幾次）。

- [ ] **Step 5: `~/Anson/decisions/log.md` append 一行**

```
[2026-09-11] DECISION: BT 官網加校友身分與「我的故事」。校友用專用邀請碼註冊（invite_codes.grants 分 cadre/alumni），幹部與校友在 /settings/ 自己填故事，兩把鑰匙（本人勾同意、Co-President 核可）都成立才出現在 /alumni/ 航線圖上，核可後改了那一句話或介紹會自動下架重審。**推翻 2026-09-07「/alumni/ 不接 Supabase、資料走 community.json」**，改成先讀資料庫、零筆或連不上才退回示範 JSON。 | REASONING: 原本那條決定的前提是「名單由寫程式的人維護」，而真名單一直上不去正是因為那條路要 Paul 一個一個收資料與同意。改成本人自己填自己同意之後，加一位校友的成本對換屆的人是零。 | CONTEXT: 同日 Paul 也同意在 shared/ 加一支只有常數的 supabase-config.js，讓對外頁面連得到資料庫又不用載整包套件。已知缺口：新北的高中起飛點畫在台北，澎湖金門馬祖還不在圖上。
```

- [ ] **Step 6: Commit**

```bash
git add README.md GOALS.md
git commit -m "docs: 校友與我的故事，兩個已知缺口與發碼方式"
```

---

## Task 10: 整份驗一次

- [ ] **Step 1: 全部測試**

Run: `node --test test/*.test.mjs`
Expected: PASS，沒有 skip

- [ ] **Step 2: 全部守門**

Run: `./check.sh`
Expected: 全綠

- [ ] **Step 3: 動畫守門**

Run: `node check-motion.mjs`
Expected: 通過（`/alumni/` 的動畫沒有動，但載入路徑改了，確認沒有誤傷）

- [ ] **Step 4: 把要 Paul 自己做的事整理成三步交給他**

1. 到 Supabase SQL Editor 依序跑 `2026-09-17-invite-grants.sql`、`2026-09-18-alumni-stories.sql`，看驗收表全 PASS
2. 建一組 `grants = 'alumni'` 的測試碼，自己註冊一個新帳號走完：輸碼 → 填故事 → 勾同意 → 換回自己的帳號到 `/admin/` 核可 → 開 `/alumni/` 看那個人在不在圖上
3. 確認沒問題之後才 push，並且開始邀請真的校友

⚠ 這兩支遷移檔跟前面那五支一樣，**在 Paul 跑之前沒有任何一行在真的 Supabase 上跑過**。

---

## 自我檢查

- **規格覆蓋**：身分（Task 2、3）、資料表（4）、設定頁（5、6）、`/alumni/`（8）、
  後台（7）、隱私政策與文件（9）、測試與守門（1、5、6、8、10）、金鑰（1）。規格九節都有對應任務。
- **型別一致**：`public_alumni()` 的欄位名 = `community.json` 的 key = 頁面上 `p.xxx` 的用法；
  `storyMissing()` 在 Task 5 定義、Task 6 使用；`setStoryApproved(id, ok)` 名稱前後一致。
- **沒有佔位符**：每一步都有實際的程式碼或實際要寫的字。
  唯一「等人」的一步是 Task 9 Step 2（隱私政策要 Paul 過稿），那是刻意的守門不是待辦。
