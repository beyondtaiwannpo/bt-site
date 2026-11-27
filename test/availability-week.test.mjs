// 某一週的例外（2026-09-12）。這一支守的是整個功能最容易錯的一段：
// **「哪一週」必須用那個人自己的時區算**，因為他填的星期幾與時間本來就是他的當地時間。
import { test } from "node:test";
import assert from "node:assert/strict";
import { weekKeyOf, isPastWeek, weekKeyLabel } from "../availability/src/weekkey.js";
import { toInstant, startOfWeek } from "../availability/src/tz.js";
import { mineHTML, setLang } from "../availability/src/ui.js";
// 時間看板 2026-10-19 起有中英切換，字典預設英文；這一支斷言的是中文，所以先切成中文。
setLang("zh");

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

// ── 「取代，不是疊加」與跨時區逐格判斷 ─────────────────────────────
// 以前在這裡守著看板的 boardCounts。2026-11-26 看板搬到首頁行事曆點一天，
// 同一套規則改由 home/src/free.js 的 dayFree 算，那幾條搬到 test/home-day.test.mjs。
const TPE2 = "Asia/Taipei";
// 2026-09-09 那一週（星期一是 09-07）
const WEEK = startOfWeek(toInstant(2026, 9, 9, 12, 0, TPE2), TPE2, 1);

// ── 畫面：mineHTML 的「平常的時間 / 某一週」切換 ──────────────────────
const baseS = {
  mine: new Set(), saved: new Set(), dirty: false, mineMsg: "",
  chips: new Set(), bfrom: 1140, bto: 1320, copyFrom: 1,
  myTz: TPE2, mineMode: "usual", weekStart: WEEK,
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
  const past = startOfWeek(toInstant(2020, 1, 8, 12, 0, TPE2), TPE2, 1);
  const h = mineHTML({ ...baseS, mineMode: "week", weekStart: past });
  assert.match(h, /過去的週不能改/);
  assert.equal(/data-act="toggle"/.test(h), false, "過去的週不該畫出可以點的格子");
});

// 這裡要的是「還沒過去的週」。mineHTML 用真實的今天判斷過去與否，
// 原本寫 2026-09-07，那一週一過這條就壞了（2026-10-14 發現），所以改用遠在未來的週，
// 跟下面那條用 2020 年當「一定已經過去」是同一個道理。2099-01-05 是星期一。
test("已經設定過例外的週會列出來，每一個都可以回到平常的時間", () => {
  const h = mineHTML({ ...baseS, mineMode: "week", weekMarksMine: new Set(["2099-01-05"]) });
  assert.match(h, /回到平常的時間/);
  assert.match(h, /data-act="clear-week"/);
});

// I3（2026-09-12 總審查）：過去的週仍然要出現在這份清單裡（讓他知道自己設過），
// 但不能按 clear-week ——取消例外也是一種編輯，過去的週不能編輯的規則要一致。
test("★ 清單裡過去的週不能按 clear-week，只有一句「已經過去」", () => {
  const h = mineHTML({ ...baseS, mineMode: "week", weekMarksMine: new Set(["2020-01-06"]) });
  assert.match(h, /已經過去/);
  assert.equal(/data-act="clear-week"/.test(h), false, "過去的週不該畫出可以按的按鈕");
});
