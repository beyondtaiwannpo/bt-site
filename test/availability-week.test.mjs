// 某一週的例外（2026-09-12）。這一支守的是整個功能最容易錯的一段：
// **「哪一週」必須用那個人自己的時區算**，因為他填的星期幾與時間本來就是他的當地時間。
import { test } from "node:test";
import assert from "node:assert/strict";
import { weekKeyOf, isPastWeek, weekKeyLabel } from "../availability/src/weekkey.js";
import { toInstant, startOfWeek } from "../availability/src/tz.js";
import { boardCounts } from "../availability/src/board.js";

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

// ── 看板的合併規則：取代不是疊加 ──────────────────────────────────
// weekday 0 = 星期日（跟 Date.getDay() 一致），dayIndex 0 = 星期一
//（weekStart 用 firstWeekday=1）。下面 "3:1200" 的 3 是 weekday（星期三），
// 斷言裡的 "3:1200" 的 3 是 dayIndex（星期四）—— 兩個座標系剛好都是小數字，
// 不是同一天，見 board.js 與 tz.js 的註解。
const TPE2 = "Asia/Taipei";
// 2026-09-09 那一週（星期一是 09-07）
const WEEK = startOfWeek(toInstant(2026, 9, 9, 12, 0, TPE2), TPE2, 1);
const M = [{ id: "u1", tz: TPE2 }];
const base = new Map([["u1", new Set(["3:1200"])]]);   // 每週三 20:00

test("沒有例外時，行為跟以前一樣", () => {
  const c = boardCounts(M, base, WEEK, TPE2);
  assert.equal([...c.values()].flat().includes("u1"), true);
});

// ★ 取代，不是疊加。
test("★ 那一週有例外時，平常的時段不算", () => {
  const weekSlots = new Map([["u1", new Map([["2026-09-07", new Set(["4:1200"])]])]]);
  const weekMarks = new Map([["u1", new Set(["2026-09-07"])]]);
  const c = boardCounts(M, base, WEEK, TPE2, weekSlots, weekMarks);
  const all = [...c.entries()].filter(([, v]) => v.includes("u1")).map(([k]) => k);
  // 只剩星期四那一格，星期三那一格不在了
  assert.equal(all.length, 1);
  assert.match(all[0], /^3:1200$/);   // dayIndex 3 = 星期四（週一起算），minute 1200
});

// ★ 空例外 = 那一週他完全沒空。
test("★ 有 mark 但沒有格子，那一週看板上沒有他", () => {
  const weekMarks = new Map([["u1", new Set(["2026-09-07"])]]);
  const c = boardCounts(M, base, WEEK, TPE2, new Map(), weekMarks);
  assert.equal([...c.values()].flat().includes("u1"), false);
});

test("例外只影響那一週，別的週照樣用平常的", () => {
  const weekSlots = new Map([["u1", new Map([["2026-09-14", new Set()]])]]);
  const weekMarks = new Map([["u1", new Set(["2026-09-14"])]]);
  const c = boardCounts(M, base, WEEK, TPE2, weekSlots, weekMarks);
  assert.equal([...c.values()].flat().includes("u1"), true);   // 這一週是 09-07，不受影響
});
