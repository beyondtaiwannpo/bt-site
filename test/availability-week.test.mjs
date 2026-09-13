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
