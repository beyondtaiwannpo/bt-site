// 護照一個月一個月揭曉（2026-10-28 Paul：現在是十一月，還沒揭曉的月份蓋起來，群組公布之後才打開）。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { visibleOf, stampsShown, pagesOf, monthPageHTML, pendingVisasOf, wallHTML, isCovered, setLang as setPassLang } from "../passport/src/ui.js";
import { passportAdminHTML, setLang } from "../admin/passports/src/ui.js";
setLang("zh"); setPassLang("zh");

const MONTHS = [
  { seq: 1, month: 9, hidden: true, revealed: true }, { seq: 3, month: 11, hidden: false, revealed: true },
  { seq: 4, month: 12, hidden: false, revealed: false, theme_zh: "驚喜主題" }, { seq: 5, month: 1, hidden: false, revealed: false },
];
const ACTS = [
  { id: "09B", month: 9, category: "gather", title_zh: "九", title_en: "S" },
  { id: "11A", month: 11, category: "gather", title_zh: "十一", title_en: "N" },
  { id: "12A", month: 12, category: "gather", title_zh: "祕密題目", title_en: "Secret" },
];

test("還沒揭曉的月份：那一頁還在，但格子拿掉、不算進總數", () => {
  const v = visibleOf(MONTHS, ACTS);
  assert.deepEqual(v.months.map(m => m.month), [11, 12, 1], "頁還在（藏起來的九月不在）");
  assert.deepEqual(v.activities.map(a => a.id), ["11A"], "十二月的格子不算");
  assert.deepEqual(pagesOf({ months: v.months }).filter(p => p.kind === "month").map(p => p.month.month), [11, 12, 1]);
});

test("沒有 revealed 欄（遷移檔還沒跑）的時候全部當作已揭曉", () => {
  const v = visibleOf(MONTHS.map(({ revealed, ...m }) => m), ACTS);
  assert.deepEqual(v.activities.map(a => a.id), ["11A", "12A"]);
  assert.equal(isCovered({ month: 12 }), false);
});

test("★ 蓋起來的那一頁：月份數字與名字、未揭曉的章、群組公布那句；看不到主題與題目", () => {
  const v = visibleOf(MONTHS, ACTS);
  const S = { months: v.months, activities: v.activities, stamps: {}, entries: {}, visas: {}, destinations: [], profile: { id: "u1" } };
  const h = monthPageHTML(S, MONTHS[2]);
  assert.match(h, /class="veil"/); assert.match(h, /未揭曉/); assert.match(h, /在群組公布之後，這一頁才會打開/);
  assert.match(h, />12</);
  assert.doesNotMatch(h, /驚喜主題/); assert.doesNotMatch(h, /祕密題目/); assert.doesNotMatch(h, /class="slots"/);
});

test("★ 蓋起來的月份就算那一格已經有章也不算 N、不發入境章", () => {
  const stamps = { "11A": { date: "2026-11-02" }, "12A": { date: "2026-12-01" } };
  assert.deepEqual(Object.keys(stampsShown(stamps, ACTS, MONTHS)), ["11A"]);
  const v = visibleOf(MONTHS, ACTS);
  const S = { months: v.months, activities: v.activities, stamps: stampsShown(stamps, ACTS, MONTHS), visas: { 11: "TPE" }, destinations: [{ code: "TPE" }, { code: "NYC" }], profile: { id: "u1" } };
  assert.deepEqual(pendingVisasOf(S), []);
});

test("全體進度那一條沒有蓋起來的月份", () => {
  const v = visibleOf(MONTHS, ACTS);
  const S = { months: v.months, activities: v.activities, stamps: {}, profile: { id: "u1" }, wall: [{ id: "u2", name_zh: "A", name_en: "A", team: "", stamps: [], count: 0 }], feed: [] };
  const h = wallHTML(S);
  assert.equal((h.match(/<i data-on=/g) || []).length, 1, "只有十一月一格");
});

test("後台：還沒揭曉的月份標「還沒揭曉」、有說明、一顆「揭曉這個月」；已揭曉的是「蓋回去」；藏起來的沒有這顆", () => {
  const h = passportAdminHTML({ months: MONTHS, activities: ACTS, destinations: [], stamped: {} }, "", false, null, []);
  const dec = h.slice(h.indexOf('id="m12"'), h.indexOf('id="m1"'));
  assert.match(dec, /還沒揭曉/); assert.match(dec, /data-act="month-reveal"[^>]*data-reveal="1"/); assert.match(dec, /揭曉這個月/);
  const nov = h.slice(h.indexOf('id="m11"'), h.indexOf('id="m12"'));
  assert.match(nov, /data-act="month-reveal"[^>]*data-reveal="0"/); assert.doesNotMatch(nov, /還沒揭曉/);
  const sep = h.slice(h.indexOf('id="m9"'), h.indexOf('id="m11"'));
  assert.doesNotMatch(sep, /month-reveal/);
  const m = readFileSync(new URL("../admin/passports/src/main.js", import.meta.url), "utf8");
  const i = m.indexOf('act === "month-reveal"');
  assert.match(m.slice(i, i + 600), /needAsk\(S, b, T\(reveal \? "confirm\.revealMonth" : "confirm\.coverMonth"/, "兩個方向都先問");
  assert.match(readFileSync(new URL("../admin/passports/src/data.js", import.meta.url), "utf8"), /hidden, revealed"\)/);
});

test("遷移檔：第一次加欄才把九、十、十一月設成已揭曉，門是 require_ws_edit('passport')", () => {
  const sql = readFileSync(new URL("../supabase/migrations/2026-11-12-reveal-months.sql", import.meta.url), "utf8");
  assert.match(sql, /if not exists \(select 1 from information_schema\.columns[\s\S]*column_name = 'revealed'[\s\S]*update public\.months set revealed = true where month in \(9, 10, 11\)/);
  assert.match(sql, /perform public\.require_ws_edit\('passport'\)/);
  assert.match(sql, /revoke all on function public\.set_month_revealed\(int, boolean\) from public, anon/);
});
