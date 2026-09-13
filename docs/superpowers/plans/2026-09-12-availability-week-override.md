# 時間看板：某一週的例外　實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓幹部除了「每週固定有空的時段」之外，還能為某一週單獨填一份時間，那一週以那一份為準。

**Architecture:** 現有的 `availability`（平常的時間）完全不動。新增兩張表：一張放某一週的格子、一張標記「這個人動過這一週」（後者讓「整週清空」與「沒填過」分得出來）。看板顯示時**逐格**判斷那一格落在成員自己時區的哪一週，那一週有標記就用例外的格子，沒有就用平常的。

**Tech Stack:** 原生 JS、ES module、零 build step、沒有 npm 套件、`node --test`、Supabase（Postgres + RLS）。

**Spec:** `docs/superpowers/specs/2026-09-12-availability-week-override-design.md`

## Global Constraints

- **不加框架、不加 build step、不加任何 npm 套件。** 測試一律 `node --test test/*.test.mjs`。
- **不要重寫 `availability/src/tz.js` 的 `partsIn` / `offsetOf` / `toInstant`。** 那三支是規格逐字沿用、已在正式環境驗證過的，檔頭明寫「不要自己重寫，也不要引進 moment 或 dayjs」。要新功能就在下面加。
- **週的邊界一律 `firstWeekday = 1`（星期一）**，跟畫面欄位一致。
- **`weekday` 0 = 星期日**（跟 `Date.getDay()` 與資料庫 `availability.weekday` 一致），不是 ISO 的 1 = 星期一。
- **格子的鍵一律 `"weekday:minute"`**（`edit.js` 的 `key(wd, min)`）。
- **不准用 `.upsert()`**：欄位層級授權的表會整句被拒，症狀是「按了存檔沒反應」。`scripts/check-upsert.mjs` 守著，`availability/src` 已在掃描範圍內。
- **存檔一律算差集只寫差的那幾格**，不要先刪光再寫回。
- **兩張新表都只有 insert 與 delete，沒有 update 政策、沒有 update 授權。**
- **遷移檔一定要先 `revoke all ... from anon, authenticated` 再 grant**：Supabase 的 default privileges 會自動把新表全部權限發給那兩個角色。
- 遷移檔的驗收表用 `aclexplode()` 加 `::regrole` 查系統目錄，**不可以用 `information_schema`**（它在權限不足時回零列，會讓安全檢查因為「什麼都看不到」而 PASS）。PASS/FAIL 欄位用 `case when ... then 'PASS' else 'FAIL' end`，形狀照 `supabase/migrations/2026-09-18-alumni-stories.sql`。
- 註解與使用者看得到的字一律繁體中文（台灣用語），專有名詞保留英文，不用 emoji。註解解釋「為什麼」。
- **失敗一定要說話。** 存檔失敗不可以畫出一模一樣的畫面。
- commit 訊息用中文，格式照現有的 `feat(...)` / `fix(...)` / `docs(...)`。

---

## 檔案結構

| 檔案 | 責任 |
|---|---|
| `availability/src/weekkey.js` | **新**。把一個瞬間換算成「那個人的哪一週」，以及判斷某一週是不是過去。純函式，不碰 DOM 也不碰資料庫 |
| `supabase/migrations/2026-09-20-availability-week.sql` | **新**。兩張表、RLS、授權、驗收表 |
| `availability/src/board.js` | `boardCounts()` 多收例外資料，逐格決定用哪一份 |
| `availability/src/data.js` | 多讀兩張表；新增存某一週、取消某一週 |
| `availability/src/ui.js` | `mineHTML()` 多一個「平常的時間 / 某一週」切換與已設定清單 |
| `availability/src/main.js` | 狀態與事件接線；看板往後翻不限 |
| `check.sh` | 兩張新表的欄位對帳守門 |
| `supabase/rls-test.sql` | 四種身分對兩張新表的讀寫矩陣 |
| `test/availability-week.test.mjs` | **新**。週鍵、合併規則、畫面的純函式 |

---

## Task 1: 週鍵（純函式）

**Files:**
- Create: `availability/src/weekkey.js`
- Create: `test/availability-week.test.mjs`

**Interfaces:**
- Produces:
  - `weekKeyOf(instant, tz)` → `"YYYY-MM-DD"`，那個瞬間所在那一週的**星期一**在 `tz` 當地的日期
  - `isPastWeek(weekKey, now, tz)` → boolean，那一週是否早於 `now` 所在的那一週
  - `weekKeyLabel(weekKey)` → `"9/8 – 9/14"` 給畫面用

- [ ] **Step 1: 寫失敗的測試**

`test/availability-week.test.mjs`：

```js
// 某一週的例外（2026-09-12）。這一支守的是整個功能最容易錯的一段：
// **「哪一週」必須用那個人自己的時區算**，因為他填的星期幾與時間本來就是他的當地時間。
import { test } from "node:test";
import assert from "node:assert/strict";
import { weekKeyOf, isPastWeek, weekKeyLabel } from "../availability/src/weekkey.js";
import { toInstant } from "../availability/src/tz.js";

// 2026-09-09 是星期三，那一週的星期一是 09-07。
test("週鍵是那一週的星期一", () => {
  const inst = toInstant(2026, 9, 9, 12, 0, "Asia/Taipei");
  assert.equal(weekKeyOf(inst, "Asia/Taipei"), "2026-09-07");
});

test("星期一當天回自己", () => {
  const inst = toInstant(2026, 9, 7, 0, 0, "Asia/Taipei");
  assert.equal(weekKeyOf(inst, "Asia/Taipei"), "2026-09-07");
});

test("星期日算前一個星期一那一週（不是 ISO 的下一週）", () => {
  const inst = toInstant(2026, 9, 13, 23, 0, "Asia/Taipei");
  assert.equal(weekKeyOf(inst, "Asia/Taipei"), "2026-09-07");
});

// ★ 這一條是這個檔案存在的理由。
// 同一個瞬間，對台北的人與對休士頓的人可能落在不同的週。
test("★ 同一個瞬間，兩個時區可能屬於不同的週", () => {
  // 台北 2026-09-07 星期一 08:00 = 休士頓 2026-09-06 星期日 19:00（前一週）
  const inst = toInstant(2026, 9, 7, 8, 0, "Asia/Taipei");
  assert.equal(weekKeyOf(inst, "Asia/Taipei"), "2026-09-07");
  assert.equal(weekKeyOf(inst, "America/Chicago"), "2026-08-31");
});

test("跨年也對", () => {
  const inst = toInstant(2027, 1, 1, 12, 0, "Asia/Taipei");   // 星期五
  assert.equal(weekKeyOf(inst, "Asia/Taipei"), "2026-12-28");
});

// 過去的週不能編輯，所以這個判斷要準。
test("isPastWeek：本週不算過去，上一週算", () => {
  const now = toInstant(2026, 9, 9, 12, 0, "Asia/Taipei");
  assert.equal(isPastWeek("2026-09-07", now, "Asia/Taipei"), false);
  assert.equal(isPastWeek("2026-08-31", now, "Asia/Taipei"), true);
  assert.equal(isPastWeek("2026-09-14", now, "Asia/Taipei"), false);
});

test("weekKeyLabel 給人看得懂的範圍", () => {
  assert.equal(weekKeyLabel("2026-09-07"), "9/7 – 9/13");
});
```

- [ ] **Step 2: 跑測試，確認失敗**

Run: `node --test test/availability-week.test.mjs`
Expected: FAIL，`Cannot find module '../availability/src/weekkey.js'`

- [ ] **Step 3: 實作**

`availability/src/weekkey.js`：

```js
// 「哪一週」的運算。純函式，不碰 DOM、不碰資料庫。
//
// ⚠ **這一支的每一個函式都要收時區，而且那個時區是「那個人自己的」。**
// availability.weekday 與 minute 存的本來就是他自己時區的當地時間
//（那一欄的註解寫著同一句話），週的邊界必須用同一把尺 ——
// 否則一個在休士頓的人與一個在台北的人，「同一週」會指到不同的七天。
//
// 底層一律用 tz.js 既有的三支（partsIn / toInstant 與它們之上的 startOfWeek），
// **不要自己寫日期運算**，理由見 tz.js 的檔頭。
import { partsIn, startOfWeek, addDays } from "./tz.js";

const pad = n => String(n).padStart(2, "0");

// 某個瞬間落在 tz 當地的哪一週。回那一週**星期一**的當地日期，"YYYY-MM-DD"。
//
// 回字串而不是 Date 是刻意的：它是一個曆法上的標籤，不是時間點。
// 資料庫那一欄也是 date，兩邊同一個意思，比對就是字串比對。
export function weekKeyOf(instant, tz) {
  // firstWeekday = 1：一週從星期一開始，跟畫面欄位一致。
  const mon = startOfWeek(instant, tz, 1);
  const p = partsIn(mon, tz);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

// 那一週是不是已經過去（比 now 所在的那一週早）。
// 過去的週不能編輯 —— 改已經過去的時間沒有意義，而且會讓人以為自己在改未來。
export function isPastWeek(weekKey, now, tz) {
  return weekKey < weekKeyOf(now, tz);   // "YYYY-MM-DD" 的字串序就是日期序
}

// 給畫面看的範圍，例如 "9/7 – 9/13"。
export function weekKeyLabel(weekKey) {
  const [y, m, d] = weekKey.split("-").map(Number);
  const e = addDays(y, m, d, 6);
  return `${m}/${d} – ${e.month}/${e.day}`;
}
```

- [ ] **Step 4: 跑測試，確認通過**

Run: `node --test test/availability-week.test.mjs`
Expected: PASS，7 tests

- [ ] **Step 5: 全部測試與守門**

Run: `node --test test/*.test.mjs && ./check.sh`
Expected: 全綠

- [ ] **Step 6: Commit**

```bash
git add availability/src/weekkey.js test/availability-week.test.mjs
git commit -m "feat(availability): 週鍵的純函式，用每個人自己的時區算哪一週"
```

---

## Task 2: 兩張新表（遷移檔）

**Files:**
- Create: `supabase/migrations/2026-09-20-availability-week.sql`

**Interfaces:**
- Produces: 表 `availability_week`（`user_id, week_start, weekday, minute`）與 `availability_week_mark`（`user_id, week_start`）

- [ ] **Step 1: 寫遷移檔**

檔頭要有「用法」與「這一支在做什麼」，結尾要有 PASS / FAIL 驗收表。主體：

```sql
begin;

-- 某一週的例外格子。形狀跟 availability 一模一樣，多一個 week_start。
create table if not exists public.availability_week (
  user_id    uuid     not null references public.profiles(id) on delete cascade,
  week_start date     not null,
  weekday    smallint not null check (weekday between 0 and 6),
  minute     smallint not null check (minute >= 0 and minute < 1440 and minute % 30 = 0),
  primary key (user_id, week_start, weekday, minute)
);

comment on table public.availability_week is
  '某個人在某一週的時段。有這一週的 mark 時，看板那一週只看這裡，不看 availability。';
comment on column public.availability_week.week_start is
  '那一週星期一的日期，**以那個人自己的 profiles.tz 算出來的當地日期**。
   跟 weekday/minute 用同一把尺 —— 不然跨時區的人「同一週」會指到不同的七天。';

-- 「這個人動過這一週」。**沒有這張表就分不出「整週清空」與「沒填過例外」。**
create table if not exists public.availability_week_mark (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  week_start date not null,
  primary key (user_id, week_start)
);

comment on table public.availability_week_mark is
  '哪幾週被特別設定過。整週清空 = 有這一列但 availability_week 沒有任何格子。';

alter table public.availability_week      enable row level security;
alter table public.availability_week_mark enable row level security;

-- ⚠⚠ **先 revoke 再 grant。** Supabase 在 public schema 設了 default privileges，
-- 每一張新表自動把全部權限發給 anon 與 authenticated。
-- 2026-09-02 的 availability 與 2026-09-11 的 alumni_stories 都踩過這一顆釘子：
-- 少了這兩句，下面的 grant 全部變成裝飾。
revoke all on public.availability_week      from anon, authenticated;
revoke all on public.availability_week_mark from anon, authenticated;

-- 讀：只有登入的幹部（看板需要看到所有人的）。學員與未登入的人一列都讀不到。
create policy availability_week_read on public.availability_week
  for select to authenticated using (public.is_cadre());
create policy availability_week_mark_read on public.availability_week_mark
  for select to authenticated using (public.is_cadre());

-- 寫：只能寫自己的，而且必須是幹部。兩個條件都要。
create policy availability_week_insert on public.availability_week
  for insert to authenticated with check (auth.uid() = user_id and public.is_cadre());
create policy availability_week_delete on public.availability_week
  for delete to authenticated using (auth.uid() = user_id and public.is_cadre());
create policy availability_week_mark_insert on public.availability_week_mark
  for insert to authenticated with check (auth.uid() = user_id and public.is_cadre());
create policy availability_week_mark_delete on public.availability_week_mark
  for delete to authenticated using (auth.uid() = user_id and public.is_cadre());

-- **兩張表都刻意沒有 update 政策、也不發 update 授權。**
-- 兩張表除了主鍵都沒有別的欄位：「改時間」就是刪掉舊格子再插入新格子，
-- 「取消某一週」就是刪掉 mark 與那一週的格子。
-- 所以「改到別人的列」這個 bug class 在這兩張表上不存在 —— 不是被政策擋住，是不存在。
-- 以後真的加了欄位，update 會直接失敗：大聲壞掉比安靜放行好。
grant select, insert, delete on public.availability_week      to authenticated;
grant select, insert, delete on public.availability_week_mark to authenticated;

commit;
```

驗收表至少要有這幾條（形狀照 `2026-09-18-alumni-stories.sql`，權限一律走 `aclexplode` 加 `::regrole`）：

1. 兩張表都存在
2. 兩張表的 RLS 都開著
3. `anon` 對兩張表**零權限**
4. 兩張表都**沒有** UPDATE 授權給 `authenticated`
5. `authenticated` 有 SELECT / INSERT / DELETE（對照組：沒有這一條的話第 3、4 條會因為「誰都沒有權限」而假性通過）
6. 政策數量：`availability_week` 三條、`availability_week_mark` 三條

- [ ] **Step 2: 靜態檢查**

Run: `node --test test/*.test.mjs && ./check.sh`
Expected: 全綠（這一步沒動前端，主要確認沒誤觸其他守門）

- [ ] **Step 3: 本機跑一次**

Run: `./scripts/db/smoke.sh`
Expected: 全部通過。**這支腳本的遷移檔清單是寫死的，記得把這一支加進去**（見 `scripts/db/smoke.sh` 的 `for f in` 那一段；`check.sh` 有一條守門會抓漏）。

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/2026-09-20-availability-week.sql scripts/db/smoke.sh
git commit -m "feat(db): 某一週的例外，兩張表都只有新增與刪除"
```

---

## Task 3: 合併規則（看板）

**Files:**
- Modify: `availability/src/board.js`
- Modify: `test/availability-week.test.mjs`（加合併規則的測試）

**Interfaces:**
- Consumes: Task 1 的 `weekKeyOf(instant, tz)`
- Produces: `boardCounts(members, slots, weekStart, viewerTz, weekSlots, weekMarks)`
  - `weekSlots`: `Map(userId → Map(weekKey → Set("wd:min")))`
  - `weekMarks`: `Map(userId → Set(weekKey))`
  - 後兩個參數省略時行為跟現在完全一樣（沒有例外）

- [ ] **Step 1: 寫失敗的測試**

加進 `test/availability-week.test.mjs`：

```js
import { boardCounts } from "../availability/src/board.js";
import { startOfWeek } from "../availability/src/tz.js";

const TPE = "Asia/Taipei";
// 2026-09-09 那一週（星期一是 09-07）
const WEEK = startOfWeek(toInstant(2026, 9, 9, 12, 0, TPE), TPE, 1);
const M = [{ id: "u1", tz: TPE }];
const base = new Map([["u1", new Set(["3:1200"])]]);   // 每週三 20:00

test("沒有例外時，行為跟以前一樣", () => {
  const c = boardCounts(M, base, WEEK, TPE);
  assert.equal([...c.values()].flat().includes("u1"), true);
});

// ★ 取代，不是疊加。
test("★ 那一週有例外時，平常的時段不算", () => {
  const weekSlots = new Map([["u1", new Map([["2026-09-07", new Set(["4:1200"])]])]]);
  const weekMarks = new Map([["u1", new Set(["2026-09-07"])]]);
  const c = boardCounts(M, base, WEEK, TPE, weekSlots, weekMarks);
  const all = [...c.entries()].filter(([, v]) => v.includes("u1")).map(([k]) => k);
  // 只剩星期四那一格，星期三那一格不在了
  assert.equal(all.length, 1);
  assert.match(all[0], /^3:1200$/);   // dayIndex 3 = 星期四（週一起算），minute 1200
});

// ★ 空例外 = 那一週他完全沒空。
test("★ 有 mark 但沒有格子，那一週看板上沒有他", () => {
  const weekMarks = new Map([["u1", new Set(["2026-09-07"])]]);
  const c = boardCounts(M, base, WEEK, TPE, new Map(), weekMarks);
  assert.equal([...c.values()].flat().includes("u1"), false);
});

test("例外只影響那一週，別的週照樣用平常的", () => {
  const weekSlots = new Map([["u1", new Map([["2026-09-14", new Set()]])]]);
  const weekMarks = new Map([["u1", new Set(["2026-09-14"])]]);
  const c = boardCounts(M, base, WEEK, TPE, weekSlots, weekMarks);
  assert.equal([...c.values()].flat().includes("u1"), true);   // 這一週是 09-07，不受影響
});
```

- [ ] **Step 2: 跑測試，確認失敗**

Run: `node --test test/availability-week.test.mjs`
Expected: FAIL（`boardCounts` 還不認得第 5、6 個參數，取代那兩條會紅）

- [ ] **Step 3: 改 `boardCounts()`**

```js
import { slotInstants, cellOf } from "./tz.js";
import { weekKeyOf } from "./weekkey.js";

// members: [{id, tz}]、slots: Map(id → Set("wd:min")）
// weekSlots: Map(id → Map(weekKey → Set("wd:min")））、weekMarks: Map(id → Set(weekKey)）
// 回 Map("dayIndex:minute" → [id]）。
//
// ⚠ **逐格判斷，不是逐人逐週判斷。**
// 觀看者的一週，對一個時差半天以上的成員來說可能橫跨他的兩個本地週：
// 一個在休士頓的人，他的「週日晚上」落在台北觀看者這一週的星期一凌晨，
// 那一格屬於他的**上一個**本地週。用「這個成員這一週有沒有例外」一次判斷的話，
// 跨週邊界那幾格會取錯那一邊，而畫面上只會看起來像「這個人的時間怪怪的」。
export function boardCounts(members, slots, weekStart, viewerTz,
                            weekSlots = new Map(), weekMarks = new Map()) {
  const counts = new Map();
  for (const m of members) {
    if (!m.tz) continue;
    const marks = weekMarks.get(m.id) || new Set();
    const byWeek = weekSlots.get(m.id) || new Map();

    // 候選格子 = 平常的，加上這個人所有例外週的（跨週邊界時兩邊都可能用得到）。
    const cand = new Set(slots.get(m.id) || []);
    for (const set of byWeek.values()) for (const k of set) cand.add(k);

    for (const k of cand) {
      const [wd, min] = k.split(":").map(Number);
      for (const inst of slotInstants(weekStart, wd, min, m.tz)) {
        // 這一格落在這個人自己時區的哪一週。
        const wk = weekKeyOf(inst, m.tz);
        // 那一週被動過就只看例外，沒動過就只看平常的。**取代，不是疊加。**
        const eff = marks.has(wk) ? (byWeek.get(wk) || new Set()) : (slots.get(m.id) || new Set());
        if (!eff.has(k)) continue;

        const c = cellOf(inst, weekStart, viewerTz);
        if (!c) continue;
        const key = c.dayIndex + ":" + c.minute;
        if (!counts.has(key)) counts.set(key, []);
        if (!counts.get(key).includes(m.id)) counts.get(key).push(m.id);
      }
    }
  }
  return counts;
}
```

- [ ] **Step 4: 跑測試，確認通過**

Run: `node --test test/*.test.mjs`
Expected: PASS，含既有的 `test/availability-board.test.mjs`（它呼叫四個參數，所以預設值不可以壞）

- [ ] **Step 5: Commit**

```bash
git add availability/src/board.js test/availability-week.test.mjs
git commit -m "feat(availability): 看板逐格決定要用平常的時間還是那一週的例外"
```

---

## Task 4: 資料層

**Files:**
- Modify: `availability/src/data.js`

**Interfaces:**
- Produces:
  - `loadAll()` 回的物件多兩個：`weekSlots`、`weekMarks`（形狀同 Task 3）
  - `saveWeek(userId, weekKey, wanted, current)` → `{add, del}`，差集寫入，並確保 mark 存在
  - `clearWeek(userId, weekKey)` → 刪掉那一週的格子與 mark

- [ ] **Step 1: `loadAll()` 多讀兩張表**

在既有那兩句 `supabase.from(...)` 旁邊加兩句，並把結果整理成 Map：

```js
    supabase.from("availability_week").select("user_id, week_start, weekday, minute"),
    supabase.from("availability_week_mark").select("user_id, week_start"),
```

整理：

```js
  // Map(user_id → Map(weekKey → Set("wd:min")））
  const weekSlots = new Map();
  for (const r of weekRows || []) {
    if (!weekSlots.has(r.user_id)) weekSlots.set(r.user_id, new Map());
    const byWeek = weekSlots.get(r.user_id);
    if (!byWeek.has(r.week_start)) byWeek.set(r.week_start, new Set());
    byWeek.get(r.week_start).add(key(r.weekday, r.minute));
  }
  // Map(user_id → Set(weekKey)）
  const weekMarks = new Map();
  for (const r of markRows || []) {
    if (!weekMarks.has(r.user_id)) weekMarks.set(r.user_id, new Set());
    weekMarks.get(r.user_id).add(r.week_start);
  }
```

⚠ `week_start` 從 Postgres 的 `date` 欄位回來就是 `"YYYY-MM-DD"` 字串，跟 `weekKeyOf()` 回的格式一樣，**不要再做任何轉換**（轉一次就有機會差一天）。

- [ ] **Step 2: 存某一週**

```js
// 存某一週的例外。**差集寫法**，理由跟 saveMine() 一樣：
// 先刪光再寫回的話，刪成功而插入失敗等於他那一週的資料沒了，而他以為只是存檔失敗。
//
// ⚠ **不准用 .upsert()**（欄位層級授權的表會整句被拒，症狀是「按了沒反應」）。
// mark 先 insert，撞主鍵代表本來就有，那不是錯誤。
export async function saveWeek(userId, weekKey, wanted, current) {
  const add = [...wanted].filter(k => !current.has(k));
  const del = [...current].filter(k => !wanted.has(k));

  // mark 一定要在，**就算一格都沒勾** —— 那正是「這一週我完全沒空」。
  const m = await supabase.from("availability_week_mark")
    .insert({ user_id: userId, week_start: weekKey });
  // 23505 = 主鍵重複，代表這一週本來就被動過，不是錯誤。
  if (m.error && m.error.code !== "23505") throw m.error;

  if (del.length) {
    for (const [wd, mins] of groupByWeekday(del)) {
      const { error } = await supabase.from("availability_week")
        .delete().eq("user_id", userId).eq("week_start", weekKey)
        .eq("weekday", wd).in("minute", mins);
      if (error) throw error;
    }
  }
  if (add.length) {
    const rows = add.map(k => {
      const [wd, min] = k.split(":").map(Number);
      return { user_id: userId, week_start: weekKey, weekday: wd, minute: min };
    });
    const { error } = await supabase.from("availability_week").insert(rows);
    if (error) throw error;
  }
  return { add: add.length, del: del.length };
}

// 取消某一週的例外，回到平常的時間。格子先刪、mark 後刪 ——
// 反過來的話中間失敗會留下「有格子沒有 mark」的狀態，而那些格子永遠不會被讀到。
export async function clearWeek(userId, weekKey) {
  const a = await supabase.from("availability_week")
    .delete().eq("user_id", userId).eq("week_start", weekKey);
  if (a.error) throw a.error;
  const b = await supabase.from("availability_week_mark")
    .delete().eq("user_id", userId).eq("week_start", weekKey);
  if (b.error) throw b.error;
}
```

- [ ] **Step 3: 測試與守門**

Run: `node --test test/*.test.mjs && ./check.sh`
Expected: 全綠

- [ ] **Step 4: Commit**

```bash
git add availability/src/data.js
git commit -m "feat(availability): 讀寫某一週的例外，差集寫入不用 upsert"
```

---

## Task 5: 畫面

**Files:**
- Modify: `availability/src/ui.js`（`mineHTML()`）
- Modify: `test/availability-week.test.mjs`

**Interfaces:**
- Consumes: Task 1 的 `weekKeyLabel()`、`isPastWeek()`
- Produces: `mineHTML(S)` 依 `S.mineMode`（`"usual"` 或 `"week"`）畫兩種畫面

- [ ] **Step 1: 寫失敗的測試**

```js
import { mineHTML } from "../availability/src/ui.js";

const baseS = {
  mine: new Set(), saved: new Set(), dirty: false, mineMsg: "",
  chips: new Set(), bfrom: 1140, bto: 1320, copyFrom: 1,
  myTz: "Asia/Taipei", mineMode: "usual", weekStart: WEEK,
  weekMine: new Set(), weekMarksMine: new Set(),
};

test("★ 預設是「平常的時間」，畫面講的是每週固定", () => {
  const h = mineHTML({ ...baseS });
  assert.match(h, /每週固定/);
  assert.equal(/這一週/.test(h), false);
});

test("★ 切到某一週時，說清楚不會影響平常的時間", () => {
  const h = mineHTML({ ...baseS, mineMode: "week" });
  assert.match(h, /不會影響你平常的時間/);
  assert.match(h, /9\/7 – 9\/13/);
});

test("★ 過去的週不能編輯，而且要說為什麼", () => {
  const past = startOfWeek(toInstant(2020, 1, 8, 12, 0, TPE), TPE, 1);
  const h = mineHTML({ ...baseS, mineMode: "week", weekStart: past });
  assert.match(h, /過去的週不能改/);
  assert.equal(/data-act="toggle"/.test(h), false, "過去的週不該畫出可以點的格子");
});

test("已經設定過例外的週會列出來，每一個都可以回到平常的時間", () => {
  const h = mineHTML({ ...baseS, mineMode: "week", weekMarksMine: new Set(["2026-09-07"]) });
  assert.match(h, /回到平常的時間/);
  assert.match(h, /data-act="clear-week"/);
});
```

- [ ] **Step 2: 跑測試，確認失敗**

Run: `node --test test/availability-week.test.mjs`
Expected: FAIL

- [ ] **Step 3: 實作**

`mineHTML()` 開頭加模式判斷，標題與說明跟著分岔：

```js
export function mineHTML(S) {
  const week = S.mineMode === "week";
  const wk = week ? weekKeyOf(S.weekStart, S.myTz) : null;
  const past = week && isPastWeek(wk, new Date(), S.myTz);
  const grid = week ? S.weekMine : S.mine;
```

標題那一段：

```js
    <h2>${week ? "這一週的時間" : "我的每週時間"}</h2>
    <div class="sub">${week
      ? `${esc(weekKeyLabel(wk))} 這一週會用這裡的設定，<b>不會影響你平常的時間</b>。`
      : "填「每週固定有空」的時段，不是特定日期。改一次可以用一整個學期。"}</div>
    <div class="row">
      <button class="btn quiet sm${week ? "" : " on"}" data-act="mine-mode" data-m="usual">平常的時間</button>
      <button class="btn quiet sm${week ? " on" : ""}" data-act="mine-mode" data-m="week">某一週</button>
    </div>
    ${week ? `<div class="row">
      <button class="btn quiet sm" data-act="week" data-d="-1">上一週</button>
      <button class="btn quiet sm" data-act="week" data-d="1">下一週</button>
    </div>` : ""}
```

過去的週**不畫格子也不畫批次工具**，只畫一句話：

```js
    ${past ? `<div class="wnote big">過去的週不能改。<br>
      改已經過去的時間沒有意義，而且會讓人以為自己在改未來。
      要改就往後翻到本週或以後。</div>` : `（原本的批次工具與格子，格子的資料來源改成 grid）`}
```

已設定的週清單（只在 `week` 模式下畫）：

```js
    ${week && S.weekMarksMine.size ? `<div class="wnote" style="margin-top:14px">
      你已經為這幾週特別設定過：
      <ul class="flist">${[...S.weekMarksMine].sort().map(k => `<li>
        ${esc(weekKeyLabel(k))}
        <button class="btn quiet sm" data-act="clear-week" data-w="${esc(k)}">回到平常的時間</button>
      </li>`).join("")}</ul>
    </div>` : ""}
```

⚠ 格子那一段原本讀 `S.mine`，改成讀上面算好的 `grid`，**兩種模式共用同一段畫格子的程式碼**（不要複製一份，那會變成兩份慢慢不一樣的東西）。

- [ ] **Step 4: 跑測試，確認通過**

Run: `node --test test/*.test.mjs`
Expected: PASS，含既有的 `test/availability-ui.test.mjs`

- [ ] **Step 5: Commit**

```bash
git add availability/src/ui.js test/availability-week.test.mjs
git commit -m "feat(availability): 我的時間多一個「某一週」模式"
```

---

## Task 6: 接線

**Files:**
- Modify: `availability/src/main.js`

**Interfaces:**
- Consumes: Task 3 的 `boardCounts(...)` 新簽名、Task 4 的 `saveWeek` / `clearWeek`、Task 1 的 `weekKeyOf`

- [ ] **Step 1: 狀態加四個**

```js
  mineMode: "usual",        // "usual" = 平常的時間、"week" = 某一週
  weekMine: new Set(),      // 目前這一週的例外格子（編輯中）
  weekSaved: new Set(),     // 目前這一週存起來的樣子，算差集用
  weekMarksMine: new Set(), // 我自己設定過例外的那幾週
```

- [ ] **Step 2: 看板往後翻不限**

`act === "week"` 那一段的夾限改成只夾前面：

```js
    // 往前四週（Paul 2026-09-02 裁定，往前只是回顧而且不能改）；
    // 往後不限（Paul 2026-09-12：本週加未來全部都可以填，看板要看得到那麼遠）。
    const next = d === 0 ? 0 : Math.max(-4, S.weekOffset + d);
    if (next === S.weekOffset && d !== 0) {
      S.msg = "只能往前看四週。";
      render(); return;
    }
```

- [ ] **Step 3: 三個新的 handler**

```js
  if (act === "mine-mode") {
    S.mineMode = b.dataset.m; S.mineMsg = ""; render(); return;
  }
  if (act === "clear-week") {
    const wk = b.dataset.w;
    S.busy = true; render();
    try {
      await D.clearWeek(S.user.id, wk);
      S.weekMarksMine.delete(wk);
      if (wk === weekKeyOf(S.weekStart, S.myTz)) { S.weekMine = new Set(); S.weekSaved = new Set(); }
      S.busy = false; S.mineMsg = "那一週回到你平常的時間了。";
    } catch (err) { S.busy = false; S.mineMsg = "取消不了：" + D.says(err); }
    render(); return;
  }
```

`act === "save"` 那一段依模式分岔：例外模式呼叫 `saveWeek(S.user.id, wk, S.weekMine, S.weekSaved)`，成功之後 `S.weekSaved = new Set(S.weekMine)` 並把 `wk` 加進 `S.weekMarksMine`。

- [ ] **Step 4: 切到某一週時要帶出起點**

切模式或翻週之後，若那一週還沒有例外，`S.weekMine` 預先帶出**平常的時段**；已經有例外就帶出例外。這正是規格說的「預先帶出當起點」。

- [ ] **Step 5: 手動看一次**

Run: `python3 -m http.server 8000`，開 `http://localhost:8000/availability/`
Expected: 兩種模式切得動、翻週有反應、過去的週顯示那一句話。（沒有瀏覽器就說明無法做這一步，不要假裝做過。）

- [ ] **Step 6: Commit**

```bash
git add availability/src/main.js
git commit -m "feat(availability): 接上某一週的例外，看板往後翻不限"
```

---

## Task 7: 守門與 RLS 測試

**Files:**
- Modify: `check.sh`
- Modify: `supabase/rls-test.sql`

- [ ] **Step 1: `check.sh` 加欄位對帳**

照 `PROFILE_WRITABLE` 那一段的形狀，為兩張新表各加一份清單與寫入點數量，比對前端實際寫進去的欄位。**寫入點的數量寫死**，增減寫入路徑就要回來改（那是刻意的摩擦）。

- [ ] **Step 2: `supabase/rls-test.sql` 加一節**

**每一條負向（0 列）都要配一條正向對照** —— 受測帳號其實什麼都讀不到的時候，所有負向斷言都會通過，那時整份測試證明的是「這個帳號什麼都看不到」，不是「隔離有效」。至少：

| 負向 | 正向對照 |
|---|---|
| 乙寫不進甲的 `availability_week` | 乙寫得進自己的 |
| 學員讀不到任何一列 | 幹部讀得到 |
| 沒有人 update 得動（沒有政策） | 同一個人 delete 得動自己的 |

- [ ] **Step 3: 跑**

Run: `./check.sh && ./scripts/db/smoke.sh`
Expected: 全綠

- [ ] **Step 4: Commit**

```bash
git add check.sh supabase/rls-test.sql
git commit -m "feat(availability): 兩張新表的欄位守門與 RLS 測試"
```

---

## Task 8: 文件

**Files:**
- Modify: `README.md`
- Modify: `~/Anson/decisions/log.md`

- [ ] **Step 1: README 加一節**

標題 `## 時間看板：某一週的例外（2026-09-12）`，接在帶日期的功能敘述那一區最後面
（`## 官網首頁的照片：可以放的依據是什麼` 之前），**不要加在整份檔案最後面**（那裡是不帶日期的操作手冊區）。

至少要涵蓋：取代不是疊加、本週加未來全部可填、過去不能改、整週清空代表那一週沒空、
「哪一週」是用每個人自己的時區算的、兩張表為什麼都沒有 update、看板往後翻不限。

- [ ] **Step 2: decisions log append 一行**

格式 `[2026-09-12] DECISION: ... | REASONING: ... | CONTEXT: ...`，加在最下面，不要動既有的行，不要 `git add`（那個檔案在 repo 外面）。

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: 時間看板某一週的例外"
```

---

## Task 9: 整份驗一次

- [ ] **Step 1:** `node --test test/*.test.mjs` 全綠、**0 skipped**
- [ ] **Step 2:** `./check.sh` 全綠
- [ ] **Step 3:** `node check-motion.mjs` 通過
- [ ] **Step 4:** `./scripts/db/smoke.sh` 全綠（確認新的遷移檔在清單裡）
- [ ] **Step 5:** 把要 Paul 自己做的事整理成步驟寫進報告：跑新的遷移檔、填一週的例外、翻到那一週確認只顯示例外、清空某一週確認那一週沒有他、「回到平常的時間」確認例外消失

---

## 自我檢查

- **規格覆蓋**：資料模型（T2）、週的定義（T1）、合併規則（T3）、權限（T2、T7）、畫面（T5、T6）、看板範圍（T6）、邊界情況（T1、T3、T5）、測試（T1、T3、T5、T7）、文件（T8）、上線步驟（T9）。規格八節都有對應任務。
- **型別一致**：`weekKey` 一律是 `"YYYY-MM-DD"` 字串，從 `weekKeyOf()` 來、存進 `date` 欄位、從資料庫回來時原樣使用；格子的鍵一律 `"wd:min"`。
- **沒有佔位符**：每一步都有實際程式碼或實際要寫的字。T5 的「原本的批次工具與格子」是指既有程式碼原地保留、只換資料來源，不是待辦。
