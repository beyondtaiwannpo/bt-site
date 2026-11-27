// 後台右下角「怎麼用」導覽（2026-11-26）。跑法：node --test test/*.test.mjs
// Paul 2026-11-26（開車時口述）：一位幹部說新平台很難學。每一頁內建一段 3 到 6 步的導覽，右下角一顆按了才跑（原本第一次登入會自動跑，Paul 同一天改成只在按下去時開），
//   一次框住一塊、有下一步上一步跳過，也講頁面之間怎麼接。引擎與步驟都在 shared/rail.js 最下面（TOURS），樣式在 shared/rail.css。
// 這一支守兩件事：步驟資料（中英文都有、每頁 3 到 6 步、指到的頁面真的存在）與引擎的純函式（挑哪一段、哪幾步、盒子放哪），以及它不會自己跑。
// 每一步在真的頁面上找不找得到，是在本機瀏覽器裡一頁一頁對過的（README「後台導覽」那一節有怎麼對）。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as RAIL from "../shared/rail.js";

const read = p => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const PAGES = new Set(RAIL.ITEMS.map(i => `${i.group}:${i.key}`));

test("★ 每一段導覽：id 不重複、3 到 6 步、每一步中英文都有標題與內文", () => {
  const ids = RAIL.TOURS.map(t => t.id);
  assert.equal(new Set(ids).size, ids.length, "id 重複了：看過了沒是照 id 記的");
  for (const t of RAIL.TOURS) {
    assert.match(t.id, /^[a-z][a-z-]*$/, t.id);
    assert.ok(t.steps.length >= 3 && t.steps.length <= 6, `${t.id} 有 ${t.steps.length} 步（要 3 到 6 步）`);
    for (const [i, s] of t.steps.entries()) {
      for (const k of ["t", "b"]) for (const L of ["zh", "en"]) {
        const v = s[k] && s[k][L];
        assert.ok(typeof v === "string" && v.trim().length > 0, `${t.id} 第 ${i + 1} 步少了 ${k}.${L}`);
        assert.doesNotMatch(v, /[—–]|\p{Extended_Pictographic}/u, `${t.id} 第 ${i + 1} 步 ${k}.${L} 有破折號或 emoji`);
      }
      assert.ok(s.b.zh.length <= 110, `${t.id} 第 ${i + 1} 步的中文太長（${s.b.zh.length} 字），一個盒子放不下`);
      assert.ok(s.b.en.length <= 240, `${t.id} 第 ${i + 1} 步的英文太長（${s.b.en.length} 字）`);
      assert.doesNotMatch(s.b.zh + " " + s.t.zh, /[\u4e00-\u9fff][,.;:!?]|[，。]{2}/, `${t.id} 第 ${i + 1} 步的中文用了半形標點`);
      for (const sel of RAIL.tourSels(s.at)) assert.equal(typeof sel, "string", `${t.id} 第 ${i + 1} 步的 at`);
    }
  }
});

test("★ 導覽指到的頁面都在側欄的 ITEMS 裡（頁面改名或拿掉時，這裡會紅）", () => {
  for (const t of RAIL.TOURS) {
    if (t.id === "welcome") { assert.equal(t.page, "*"); continue; }
    for (const p of [].concat(t.page)) assert.ok(PAGES.has(p), `${t.id} 指到 ${p}，ITEMS 裡沒有這一頁`);
  }
});

test("★ 這一次要寫的頁面都有導覽", () => {
  const want = ["forms:events", "forms:projects", "people:roster", "people:invites", "forms:forms",
    "records:overview", "records:people", "records:yearly", "site:events", "site:res", "site:team", "site:stories", "site:mail",
    "passports:cadre", "passports:cities", "passports:interns", "passports:board",
    "finance:overview", "finance:tx", "finance:accounts", "finance:budget", "finance:export",
    "home:home", "home:calendar", "search:search"];
  const none = () => false;
  for (const p of want) assert.ok(RAIL.pickTour(p, none), `${p} 沒有導覽`);
  // 活動編輯頁跟活動清單同一個 page，靠 #ev-tabs 分開
  assert.equal(RAIL.pickTour("forms:events", s => s === "#ev-tabs").id, "event-editor");
  assert.equal(RAIL.pickTour("forms:events", none).id, "events");
  // 行事曆的「日」跟月、週同一個 page，靠 .cal .dgrid 分開
  assert.equal(RAIL.pickTour("home:calendar", s => s === ".cal .dgrid").id, "calendar-day");
  assert.equal(RAIL.pickTour("home:calendar", none).id, "calendar");
  assert.equal(RAIL.pickTour("nope:nope", none), null, "沒有導覽的頁面回 null");
  assert.equal(RAIL.pickTour("*", () => true), null, "歡迎那一段不會被當成某一頁的導覽");
});

test("pickTour：when／unless 照順序挑，has 丟錯當成找不到", () => {
  const tours = [
    { id: "a", page: "x:y", when: ".edit", steps: [] },
    { id: "b", page: ["x:y", "x:z"], unless: ".edit", steps: [] },
  ];
  assert.equal(RAIL.pickTour("x:y", s => s === ".edit", tours).id, "a");
  assert.equal(RAIL.pickTour("x:y", () => false, tours).id, "b");
  assert.equal(RAIL.pickTour("x:z", () => false, tours).id, "b", "page 可以是陣列");
  assert.equal(RAIL.pickTour("x:y", () => { throw new Error("bad selector"); }, tours).id, "b");
});

test("★ tourStepsOn：找不到的那一步跳過、沒有 at 的留著、陣列用第一個找得到的", () => {
  const steps = [
    { t: { en: "intro" } },
    { at: ".missing", t: { en: "gone" } },
    { at: [".nope", ".b", ".c"], t: { en: "fallback" } },
    { at: "!!bad((", t: { en: "bad selector" } },
    { at: ".c", t: { en: "last" } },
  ];
  const on = new Set([".b", ".c"]);
  const find = s => { if (s.startsWith("!")) throw new SyntaxError("bad"); return on.has(s) ? {} : null; };
  const got = RAIL.tourStepsOn(steps, find);
  assert.deepEqual(got.map(s => s.t.en), ["intro", "fallback", "last"]);
  assert.deepEqual(got.map(s => s.sel), ["", ".b", ".c"]);
  assert.deepEqual(RAIL.tourStepsOn(undefined, find), []);
});

test("tourPlace：寬螢幕放在下面、上面、右邊、左邊；手機貼上緣或下緣；沒有框就置中；永遠在螢幕裡", () => {
  const vw = 1200, vh = 800, bw = 360, bh = 180;
  const r = (top, left, h = 40, w = 200) => ({ top, left, bottom: top + h, right: left + w });
  assert.equal(RAIL.tourPlace(r(100, 300), bw, bh, vw, vh).side, "below");
  assert.equal(RAIL.tourPlace(r(700, 300), bw, bh, vw, vh).side, "above");
  assert.equal(RAIL.tourPlace(r(20, 40, 760, 300), bw, bh, vw, vh).side, "right");
  assert.equal(RAIL.tourPlace(r(20, 700, 760, 480), bw, bh, vw, vh).side, "left");
  assert.equal(RAIL.tourPlace(r(10, 10, 780, 1180), bw, bh, vw, vh).side, "bottom");
  const c = RAIL.tourPlace(null, bw, bh, vw, vh);
  assert.deepEqual([c.side, c.left, c.top], ["center", 420, 310]);
  assert.equal(RAIL.tourPlace(r(100, 20), 351, bh, 375, 812).side, "bottom", "手機上那一塊在上半部：盒子貼下緣");
  const top = RAIL.tourPlace(r(600, 20), 351, bh, 375, 812);
  assert.deepEqual([top.side, top.top], ["top", 12], "手機上那一塊在下半部：盒子貼上緣");
  for (const box of [r(0, 1100), r(790, 0), r(400, -50)]) {
    const p = RAIL.tourPlace(box, bw, bh, vw, vh);
    assert.ok(p.left >= 12 && p.left + bw <= vw - 12 + 0.001 && p.top >= 12 && p.top + bh <= vh, JSON.stringify([box, p]));
  }
});

test("★ 不會自己跑：只有按「怎麼用」才開，不記看過了沒、不碰 localStorage（Paul 2026-11-26）", () => {
  const src = read("shared/rail.js"), engine = src.slice(src.indexOf("export const TOURS"));
  for (const gone of ["tourAutoOK", "tourSeenKey", "tourSeenParse", "tourAutoPlan"]) assert.equal(RAIL[gone], undefined, gone);
  assert.doesNotMatch(engine, /localStorage|tAuto|tour=auto/);
  assert.match(engine, /if \(a === "open"\) \{[^}]*tStart\(/, "按下那一顆才開");
  assert.equal((engine.match(/tStart\(/g) || []).length, 2, "只有定義與按鈕那一處叫 tStart");
  assert.equal(RAIL.welcomeTour().id, "welcome", "沒有導覽的頁面，按了看歡迎那一段");
});

test("★ 盒子：第幾步、上一步只在第二步之後、最後一步是「完成」不是「下一步」；字會跳脫", () => {
  const s = { t: { zh: "標題", en: "A <b> title" }, b: { zh: "內文", en: "Body & more" } };
  const first = RAIL.tourBoxHTML(s, 0, 3, "en"), mid = RAIL.tourBoxHTML(s, 1, 3, "en"), last = RAIL.tourBoxHTML(s, 2, 3, "zh");
  assert.match(first, /role="dialog" aria-modal="true" aria-labelledby="tour-h" aria-describedby="tour-b"/);
  assert.match(first, /Step 1 of 3/); assert.match(first, /A &lt;b&gt; title/); assert.match(first, /Body &amp; more/);
  assert.doesNotMatch(first, /data-tour="back"/); assert.match(first, /data-tour="skip">Skip</); assert.match(first, /data-tour="next">Next</);
  assert.match(mid, /data-tour="back">Back</);
  assert.match(last, /第 3 步，共 3 步/); assert.match(last, /data-tour="back">上一步</);
  assert.doesNotMatch(last, /data-tour="next"/); assert.match(last, /class="tour-btn" data-tour="skip">完成</);
  assert.doesNotMatch(last, />跳過</, "最後一步不再放「跳過」");
});

test("那一顆按鈕：中英文、有名字給螢幕報讀", () => {
  assert.match(RAIL.tourFabHTML("en"), /<button type="button" class="tour-fab" data-tour="open" aria-label="Show me how this page works"/);
  assert.match(RAIL.tourFabHTML("en"), /<span class="tour-fab-t">How to use<\/span>/);
  assert.match(RAIL.tourFabHTML("zh"), /怎麼用/);
});

test("★ 兩顆不會疊在一起：「怎麼用」在回報那一顆的正上方，寬螢幕與手機都是；導覽蓋在頂欄與 toast 上面", () => {
  const css = read("shared/rail.css");
  const num = (re) => { const m = css.match(re); assert.ok(m, String(re)); return Number(m[1]); };
  const fbBottom = num(/\.fb-fab\{position:fixed;right:20px;bottom:(\d+)px/), fbH = num(/\.fb-fab\{[^}]*height:(\d+)px/);
  assert.ok(num(/\.tour-fab\{position:fixed;right:20px;bottom:(\d+)px/) >= fbBottom + fbH + 8, "寬螢幕");
  const fbPhone = num(/@media \(max-width:520px\)\{\.fb-fab\{right:14px;bottom:(\d+)px\}/);
  assert.ok(num(/@media \(max-width:520px\)\{\.tour-fab\{right:18px;bottom:(\d+)px\}/) >= fbPhone + fbH + 8, "手機");
  assert.ok(num(/\.tour-layer\{position:fixed;inset:0;z-index:(\d+)\}/) > 50, "頂欄與 toast 是 50");
  assert.match(css, /@media \(prefers-reduced-motion:reduce\)\{\.tour-spot\{transition:none\}\}/);
});

test("引擎只在幹部的頁面掛上，而且不准有每一幀的迴圈（check.sh 也守）", () => {
  const src = read("shared/rail.js");
  assert.match(src, /me\.role === "cadre"\) \{ mountFeedback\(L\); mountTour\(group, tab, me, L\); \}/);
  assert.doesNotMatch(src.replace(/\/\/.*$/gm, ""), /requestAnimationFrame\(/);
  // 在 node 裡（沒有 document）畫側欄不會出錯
  assert.match(RAIL.railHTML("people", "roster", { id: "u", role: "cadre", board: "president", name: "P", ws: {} }, {}, "en"), /class="rail"/);
});
