// 某一週的例外（2026-09-12）。這一支守的是整個功能最容易錯的一段：
// **「哪一週」必須用那個人自己的時區算**，因為他填的星期幾與時間本來就是他的當地時間。
import { test } from "node:test";
import assert from "node:assert/strict";
import { weekKeyOf, isPastWeek, weekKeyLabel } from "../availability/src/weekkey.js";
import { toInstant, startOfWeek } from "../availability/src/tz.js";
import { boardCounts } from "../availability/src/board.js";
import { mineHTML } from "../availability/src/ui.js";

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

// ── I2（2026-09-12 總審查）：跨時區逐格判斷 ──────────────────────────
// 規格 §二自己說這是「這次最需要測試的一段」，而在這條加進來之前，
// 所有穿過 boardCounts() 的測試成員與觀看者都用同一個時區，完全沒有東西
// 守著「逐格判斷，不是逐人逐週判斷」這件事（見 board.js 檔頭那段註解）。
//
// 案例（前一輪審查手推驗證過）：休士頓（Chicago）的成員平常週日 11:30、
// 週三 20:00（他自己當地時間）有空。台北的觀看者看 2026-09-07 那一週。
// 週日那一格换算回 Chicago 當地，屬於他自己時區的 2026-08-31 那一週
// （台北的星期一早上是他的星期日晚上，跨到了他的上一週）；
// 週三那一格屬於 2026-09-07 那一週，跟觀看者同一週。
const CHI = "America/Chicago";
test("★ 跨時區：觀看者的一週橫跨成員的兩個本地週，例外只蓋掉屬於那一週的格子", () => {
  const houston = [{ id: "houston", tz: CHI }];
  const slots = new Map([["houston", new Set(["0:690", "3:1200"])]]);   // 週日 11:30、週三 20:00（Chicago 當地）

  // 先釘住兩格各自屬於哪一週，不然下面的斷言等於憑空假設。
  assert.equal(weekKeyOf(toInstant(2026, 9, 6, 11, 30, CHI), CHI), "2026-08-31");
  assert.equal(weekKeyOf(toInstant(2026, 9, 9, 20, 0, CHI), CHI), "2026-09-07");

  // 只把「2026-08-31」那一週標成例外，而且設為空集合（那一週他完全沒空）；
  // 「2026-09-07」那一週沒被動過，照舊看平常的時段。
  const weekMarks = new Map([["houston", new Set(["2026-08-31"])]]);
  const weekSlots = new Map();   // 空集合：沒有任何一格記錄在「2026-08-31」底下

  const c = boardCounts(houston, slots, WEEK, TPE2, weekSlots, weekMarks);
  const hits = [...c.entries()].filter(([, v]) => v.includes("houston")).map(([k]) => k);

  // 正確結果：週日那一格消失（屬於被標成空的那一週），週三那一格保留。
  // ⚠ 如果實作改成「整個成員這一週用同一份」而不是逐格判斷，
  // houston 會整週消失（兩格都不見），這條斷言就會翻紅 —— 已經手動驗證過。
  assert.equal(hits.length, 1, `houston 出現在 ${hits.length} 格，應該只剩週三那一格`);
});

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

test("已經設定過例外的週會列出來，每一個都可以回到平常的時間", () => {
  const h = mineHTML({ ...baseS, mineMode: "week", weekMarksMine: new Set(["2026-09-07"]) });
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
