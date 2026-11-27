// 首頁行事曆的「日」：每半小時有誰有空（home/src/free.js）與那一天畫出來的樣子（home/src/day.js）。
// 2026-11-26 時間看板的團隊看板拿掉，搬到這裡。以前 test/availability-board.test.mjs 與
// availability-week.test.mjs 守著 boardCounts 的那幾條，換成 dayFree 照樣守著。
import { test } from "node:test";
import assert from "node:assert/strict";
import * as FREE from "../home/src/free.js";
import { dayBodyHTML } from "../home/src/day.js";
import { scheduleHTML, preTicked } from "../home/src/schedule.js";
import * as HUI from "../home/src/ui.js";

const TPE = "Asia/Taipei", DET = "America/Detroit", CHI = "America/Chicago";
// 每天 19:00 到 21:30 開始的六格（他自己的當地時間）。weekday 0 是星期日。
const evening = () => { const s = new Set(); for (let d = 0; d < 7; d++) for (let m = 1140; m <= 1290; m += 30) s.add(d + ":" + m); return s; };
const freeMins = (r, id) => [...r.free.entries()].filter(([, ids]) => ids.includes(id)).map(([m]) => m);

// ★ 2026-09-02 那一個擔心：三十個人裡只要有一個沒設時區，會不會全部人都看不到。
test("★ 有人沒設時區，不影響其他人算得出來", () => {
  const members = [{ id: "w", tz: DET }, { id: "a", tz: null }, { id: "z", tz: TPE }];
  const slots = new Map(members.map(m => [m.id, evening()]));
  const r = FREE.dayFree(members, slots, new Map(), new Map(), "2026-09-02", DET);
  const ids = new Set([...r.free.values()].flat());
  assert.ok(ids.has("w") && ids.has("z"), "有設時區的人都要算得出來");
  assert.ok(!ids.has("a"), "沒設時區的人算不出來（他在 /availability/ 的成員那一頁被催）");
});

test("一天 48 格，一個人六格進去六格出來；台北的人換算到底特律的早上", () => {
  const r = FREE.dayFree([{ id: "w", tz: DET }, { id: "z", tz: TPE }], new Map([["w", evening()], ["z", evening()]]), null, null, "2026-09-02", DET);
  assert.equal(r.rows.length, 48);
  assert.deepEqual(freeMins(r, "w"), [1140, 1170, 1200, 1230, 1260, 1290]);
  assert.deepEqual(freeMins(r, "z"), [420, 450, 480, 510, 540, 570], "台北 19:00 是底特律 07:00");
});

test("同一格兩個人算兩個；同一個人不會被算兩次", () => {
  const two = FREE.dayFree([{ id: "w", tz: DET }, { id: "x", tz: DET }], new Map([["w", new Set(["3:1140"])], ["x", new Set(["3:1140"])]]), null, null, "2026-09-02", DET);
  assert.deepEqual(two.free.get(1140), ["w", "x"]);
  // 夏令時間結束那天 01:00 出現兩次，同一個 min 的兩格合在一起，同一個人只算一次。
  const fb = FREE.dayFree([{ id: "w", tz: DET }], new Map([["w", new Set(["0:60"])]]), null, null, "2026-11-01", DET);
  assert.deepEqual(fb.free.get(60), ["w"]);
});

test("★ 夏令時間：開始那天少兩格、結束那天多兩格，每一格都是那一天裡的瞬間", () => {
  assert.equal(FREE.dayRows("2026-03-08", DET).length, 46);
  const back = FREE.dayRows("2026-11-01", DET);
  assert.equal(back.length, 50);
  assert.equal(back.filter(r => r.min === 60).length, 2, "01:00 出現兩次");
  for (const r of back) assert.equal(HUI.dayKey(r.at, DET), "2026-11-01");
  assert.equal(FREE.dayRows("2026-09-02", TPE)[40].at.toISOString(), "2026-09-02T12:00:00.000Z", "台北 20:00");
});

// ★ 印度差半小時、尼泊爾差四十五分。往後取到第一個整點或半點，才不會差一格。
test("★ slotOf：尼泊爾與印度落在他自己的哪一格、哪一週", () => {
  const at = new Date("2026-09-02T12:00:00Z");   // 台北星期三 20:00
  assert.deepEqual(FREE.slotOf(at, "Asia/Kathmandu"), { key: "3:1080", week: "2026-08-31" }, "17:45 往後取到 18:00");
  assert.deepEqual(FREE.slotOf(at, "Asia/Kolkata"), { key: "3:1050", week: "2026-08-31" }, "17:30 剛好一格");
  assert.deepEqual(FREE.slotOf(new Date("2026-09-06T23:00:00Z"), TPE), { key: "1:420", week: "2026-09-07" }, "星期一早上是新的一週");
});

// ── 某一週的例外：取代，不是疊加（以前 availability-week.test.mjs 守著 boardCounts 的那幾條）──
const M = [{ id: "u1", tz: TPE }];
const base = new Map([["u1", new Set(["3:1200"])]]);   // 每週三 20:00

test("沒有例外時，照平常的時間", () => {
  assert.deepEqual(FREE.dayFree(M, base, null, null, "2026-09-09", TPE).free.get(1200), ["u1"]);
});

test("★ 那一週有例外時，平常的時段不算", () => {
  const weekSlots = new Map([["u1", new Map([["2026-09-07", new Set(["4:1200"])]])]]);
  const weekMarks = new Map([["u1", new Set(["2026-09-07"])]]);
  assert.deepEqual(freeMins(FREE.dayFree(M, base, weekSlots, weekMarks, "2026-09-09", TPE), "u1"), [], "星期三那一格不在了");
  assert.deepEqual(freeMins(FREE.dayFree(M, base, weekSlots, weekMarks, "2026-09-10", TPE), "u1"), [1200], "只剩星期四");
});

test("★ 有 mark 但沒有格子，那一週他完全沒空；例外只影響那一週", () => {
  const empty = new Map([["u1", new Set(["2026-09-07"])]]);
  assert.deepEqual(freeMins(FREE.dayFree(M, base, new Map(), empty, "2026-09-09", TPE), "u1"), []);
  const other = new Map([["u1", new Set(["2026-09-14"])]]);
  assert.deepEqual(freeMins(FREE.dayFree(M, base, new Map([["u1", new Map([["2026-09-14", new Set()]])]]), other, "2026-09-09", TPE), "u1"), [1200]);
});

// ★ 逐格判斷，不是逐人逐週：台北的星期一裡，休士頓的人前半天是他的星期日（上一週）、後半天是他的星期一（這一週）。
test("★ 跨時區：觀看者的一天橫跨成員的兩個本地週，例外只蓋掉屬於那一週的格子", () => {
  const houston = [{ id: "h", tz: CHI }];
  const slots = new Map([["h", new Set(["0:690", "1:480"])]]);   // 他的週日 11:30、週一 08:00
  assert.deepEqual(FREE.slotOf(new Date("2026-09-06T16:30:00Z"), CHI).week, "2026-08-31");
  assert.deepEqual(FREE.slotOf(new Date("2026-09-07T13:00:00Z"), CHI).week, "2026-09-07");
  assert.deepEqual(freeMins(FREE.dayFree(houston, slots, null, null, "2026-09-07", TPE), "h"), [30, 1260], "沒有例外時兩格都在");
  const marks = new Map([["h", new Set(["2026-08-31"])]]);
  assert.deepEqual(freeMins(FREE.dayFree(houston, slots, new Map(), marks, "2026-09-07", TPE), "h"), [1260],
    "只有週日那一格消失；改成整個人整週用同一份的話兩格都會不見");
});

test("freeThrough 是整段都有空、freeAny 是有一格有空；shade 是 0 到 1", () => {
  const free = new Map([[600, ["a", "b"]], [630, ["a"]], [660, []]]);
  assert.deepEqual(FREE.freeThrough(free, 600, 60), ["a"]);
  assert.deepEqual(FREE.freeThrough(free, 600, 90), []);
  assert.deepEqual(FREE.freeAny(free, 600, 60).sort(), ["a", "b"]);
  assert.deepEqual(FREE.freeThrough(free, 1410, 60), [], "那一天沒有的格子不算");
  assert.deepEqual(preTicked(free, 600, 30), ["a", "b"]);
  assert.equal(FREE.shade(2, 4), 0.5); assert.equal(FREE.shade(0, 0), 0);
});

// ── 那一天畫出來 ───────────────────────────────────────────────
const ctx = (canSchedule, now = new Date("2026-11-26T00:00:00Z")) => ({ now, tz: TPE, canSchedule });
const data = key => {
  const members = [{ id: "u1", name: "<b>Amy</b>", team: "Marketing Team", tz: TPE }, { id: "u2", name: "Ben", team: "Curriculum Team", tz: TPE }];
  const r = FREE.dayFree(members, new Map([["u1", new Set(["1:1200"])], ["u2", new Set(["1:1200"])]]), null, null, key, TPE);
  return { ...r, members, all: members, noTz: ["Cy"] };
};

test("★ 能排會的人：還沒過去的每半小時是一顆按鈕；過去的是灰的，點不了", () => {
  HUI.setLang("en");
  const fut = dayBodyHTML([], ctx(true), { at: "2099-01-05", mode: "mine" }, data("2099-01-05"));
  assert.equal((fut.match(/data-act="day-pick"/g) || []).length, 48);
  assert.match(fut, /data-act="day-pick" data-m="1200" style="top:880px;--a:1"/, "兩個人都有空的那一格最深");
  assert.match(fut, /title="2 free: &lt;b&gt;Amy&lt;\/b&gt;, Ben"/, "名字跳脫");
  const past = dayBodyHTML([], ctx(true), { at: "2020-01-06", mode: "mine" }, data("2020-01-06"));
  assert.doesNotMatch(past, /data-act="day-pick"/);
  assert.equal((past.match(/class="fb past"/g) || []).length, 48);
});

test("★ 不能排會的人看得到人數，點不了", () => {
  const h = dayBodyHTML([], ctx(false), { at: "2099-01-05", mode: "mine" }, data("2099-01-05"));
  assert.doesNotMatch(h, /data-act="day-pick"/);
  assert.match(h, /<div class="fb" style="top:880px;--a:1"[^>]*><span>2 free<\/span>/);
});

test("讀不到、讀到一半、有人沒設時區，每一種都講一句；team 的按鈕從名單長出來", () => {
  const cal = { at: "2099-01-05", mode: "mine" };
  assert.match(dayBodyHTML([], ctx(true), cal, null), /Loading when people are free/);
  assert.match(dayBodyHTML([], ctx(true), cal, { failed: true }), /Couldn't load when people are free/);
  const h = dayBodyHTML([], ctx(true), cal, data("2099-01-05"));
  assert.match(h, /1 person has no time zone yet, so they aren&#39;t counted: Cy/);
  assert.deepEqual([...h.matchAll(/data-act="day-team" data-v="([^"]*)"/g)].map(m => m[1]), ["", "Curriculum Team", "Marketing Team"]);
  assert.match(h, /href="\.\.\/availability\/"/, "連回去填自己的時間");
});

test("★ 英文畫出來不剩中文（那一天與排會那一塊）", () => {
  HUI.setLang("en");
  try {
    const d = data("2099-01-05");
    const sch = scheduleHTML({ min: 1200, ticked: ["u1"], title: "Weekly" }, { key: "2099-01-05", rows: d.rows, free: d.free, members: d.members, scopes: ["board", "Marketing Team"], now: new Date("2026-11-26T00:00:00Z") }, false)
      + scheduleHTML({ min: 1200, msg: "x" }, { key: "2099-01-05", rows: d.rows, free: d.free, members: d.members, scopes: ["Marketing Team"], now: new Date() }, true);
    const day = dayBodyHTML([], ctx(true), { at: "2099-01-05", mode: "mine" }, d) + dayBodyHTML([], ctx(false), { at: "2099-01-05", mode: "mine" }, { failed: true });
    for (const [name, h] of [["sch", sch], ["day", day]]) {
      const left = h.replace(/ placeholder="[^"]*"/g, "").match(/[一-鿿]/);
      assert.equal(left, null, `${name} 用英文畫還剩中文`);
    }
  } finally { HUI.setLang("zh"); }
});
