// 護照藏月份（2026-11-10，Paul：這一屆的幹部護照從十一月開始，九月、十月藏起來）。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { visibleOf, stampsShown, pagesOf, visasOf, pendingVisasOf } from "../passport/src/ui.js";
import { passportAdminHTML, setLang } from "../admin/passports/src/ui.js";
setLang("zh");

const MONTHS = [
  { seq: 1, month: 9, hidden: true }, { seq: 2, month: 10, hidden: true },
  { seq: 3, month: 11, hidden: false }, { seq: 4, month: 12, hidden: false },
];
const ACTS = [
  { id: "09B", month: 9 }, { id: "10A", month: 10 },
  { id: "11A", month: 11 }, { id: "11B", month: 11 }, { id: "12A", month: 12 },
];

test("藏起來的月份沒有那一頁，那個月的格子也不算", () => {
  const v = visibleOf(MONTHS, ACTS);
  assert.deepEqual(v.months.map(m => m.month), [11, 12]);
  assert.deepEqual(v.activities.map(a => a.id), ["11A", "11B", "12A"]);
  const pages = pagesOf({ months: v.months });
  assert.deepEqual(pages.filter(p => p.kind === "month").map(p => p.month.month), [11, 12]);
});

test("沒有 hidden 欄（遷移檔還沒跑）的時候什麼都不藏", () => {
  const v = visibleOf(MONTHS.map(({ hidden, ...m }) => m), ACTS);
  assert.equal(v.months.length, 4);
  assert.equal(v.activities.length, 5);
});

test("★ 藏起來那幾個月蓋過的章不算進 N，資料本身不動", () => {
  const stamps = { "09B": { date: "2026-09-10" }, "11A": { date: "2026-11-02" } };
  const out = stampsShown(stamps, ACTS, MONTHS);
  assert.deepEqual(Object.keys(out), ["11A"]);
  assert.ok(stamps["09B"], "原本那一份沒有被改");
});

test("台北那一枚入境章給第一個沒藏的月份（十一月）", () => {
  const v = visibleOf(MONTHS, ACTS);
  const S = { months: v.months, destinations: [{ code: "TPE" }, { code: "NYC" }, { code: "LAX" }], visas: {}, profile: { id: "u1" } };
  assert.equal(visasOf(S)[11].code, "TPE");
});

test("藏起來的月份就算格子全蓋滿也不發入境章", () => {
  const S = { months: visibleOf(MONTHS, ACTS).months, activities: visibleOf(MONTHS, ACTS).activities,
    stamps: { "09B": {} }, visas: {}, destinations: [{ code: "TPE" }], profile: { id: "u1" } };
  assert.equal(pendingVisasOf(S).length, 0);
});

test("後台：藏起來的月份標「藏起來了」、有說明、一顆「這個月打開」、沒有預覽鈕", () => {
  const h = passportAdminHTML({ months: MONTHS, activities: ACTS, destinations: [], stamped: {} }, "", false, null, []);
  const sep = h.slice(h.indexOf('id="m9"'), h.indexOf('id="m10"'));
  assert.match(sep, /藏起來了/);
  assert.match(sep, /data-act="month-hide"[^>]*data-hide="0"/);
  assert.match(sep, /這個月打開/);
  assert.doesNotMatch(sep, /data-act="preview"/);
  const nov = h.slice(h.indexOf('id="m11"'), h.indexOf('id="m12"'));
  assert.match(nov, /data-act="month-hide"[^>]*data-hide="1"/);
  assert.match(nov, /data-act="preview"/);
  assert.doesNotMatch(nov, /藏起來了/);
});

test("遷移檔：第一次加欄才藏九、十月，門是 require_ws_edit('passport')", () => {
  const sql = readFileSync(new URL("../supabase/migrations/2026-11-10-hide-months.sql", import.meta.url), "utf8");
  assert.match(sql, /if not exists \(select 1 from information_schema\.columns[\s\S]*update public\.months set hidden = true where month in \(9, 10\)/);
  assert.match(sql, /perform public\.require_ws_edit\('passport'\)/);
  assert.match(sql, /revoke all on function public\.set_month_hidden\(int, boolean\) from public, anon/);
});

test("★ 月份那一排不改網址的 #（# 後面是分頁名，m9 會被當成未知分頁丟去實習護照）", () => {
  const h = passportAdminHTML({ months: MONTHS, activities: ACTS, destinations: [], stamped: {} }, "", false, null, []);
  const nav = h.slice(h.indexOf('class="jump"'), h.indexOf("</nav>", h.indexOf('class="jump"')));
  assert.doesNotMatch(nav, /href="#m\d/);
  assert.match(nav, /data-act="jump" data-to="m9"/);
});
