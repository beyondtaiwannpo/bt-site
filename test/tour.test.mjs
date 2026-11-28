// 後台右下角「怎麼用」導覽（2026-11-26）。跑法：node --test test/*.test.mjs
// Paul 2026-11-26（開車時口述）：一位幹部說新平台很難學。每一頁內建一段 3 到 6 步的導覽，右下角一顆按了才跑（原本第一次登入會自動跑，Paul 同一天改成只在按下去時開），
//   一次框住一塊、有下一步上一步跳過，也講頁面之間怎麼接。引擎與步驟都在 shared/rail.js 最下面（TOURS），樣式在 shared/rail.css。
// 2026-11-27 第二版（Paul：「you're supposed to say like how the actual pages work」）：每一頁、每一種畫面（清單、編輯頁、審核）都有一段講怎麼做事的導覽，到 8 步，用 go 走進分頁。
// 這一支守兩件事：步驟資料（中英文都有、每頁 3 到 8 步、指到的頁面真的存在）與引擎的純函式（挑哪一段、哪幾步、盒子放哪），以及它不會自己跑。
// 每一步在真的頁面上找不找得到，是在本機瀏覽器裡一頁一頁對過的（README「後台導覽」那一節有怎麼對）。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as RAIL from "../shared/rail.js";

const read = p => readFileSync(new URL("../" + p, import.meta.url), "utf8");
// team 的頁不在 ITEMS 裡（側欄是畫出來的），page 是 home:team:<team 全名>
// 2026-11-28：我的護照搬到頂欄、設定與我的故事也有「怎麼用」，這三頁不在 ITEMS 裡，另外列在 OFF_RAIL_PAGES。
const PAGES = new Set([...RAIL.ITEMS.map(i => `${i.group}:${i.key}`), ...RAIL.TEAMS.map(t => "home:team:" + t), ...RAIL.OFF_RAIL_PAGES]);

test("★ 每一段導覽：id 不重複、3 到 8 步、每一步中英文都有標題與內文", () => {
  const ids = RAIL.TOURS.map(t => t.id);
  assert.equal(new Set(ids).size, ids.length, "id 重複了：看過了沒是照 id 記的");
  for (const t of RAIL.TOURS) {
    assert.match(t.id, /^[a-z][a-z-]*$/, t.id);
    assert.ok(t.steps.length >= 3 && t.steps.length <= 8, `${t.id} 有 ${t.steps.length} 步（要 3 到 8 步）`);
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

test("★ 側欄每一頁都有導覽，一頁好幾種畫面時挑對那一段", () => {
  const none = () => false;
  // 實習生進度牆不掛側欄，沒有「怎麼用」那一顆。設定與我的故事 2026-11-28 起有（mountHelp）。
  const skip = new Set(["internwall:"]);
  for (const p of PAGES) if (!skip.has(p)) assert.ok(RAIL.pickTour(p, none), `${p} 沒有導覽`);
  const pick = (page, ...on) => RAIL.pickTour(page, s => on.includes(s)).id;
  assert.equal(pick("forms:events", "#ev-tabs"), "event-editor");
  assert.equal(pick("forms:events"), "events");
  assert.equal(pick("forms:events", ".tabp[data-ptabs='form']", "#ev-tabs"), "form-editor", "活動的報名表編輯頁不是活動編輯頁");
  assert.equal(pick("forms:projects", ".tabp[data-ptabs='form']"), "form-editor");
  assert.equal(pick("forms:forms", ".main nav.ptabs > .subtab.on[data-act='open-apps']"), "form-apps");
  assert.equal(pick("forms:forms", ".main nav.ptabs > .subtab.on[data-act='open-checkin']", "#nsub"), "form-notice");
  assert.equal(pick("forms:forms", ".main nav.ptabs > .subtab.on[data-act='open-checkin']"), "form-checkin");
  assert.equal(pick("forms:forms"), "recruitment");
  assert.equal(pick("forms:projects", "[data-act='pj-back']"), "project");
  assert.equal(pick("forms:meetings", "[data-act='mt-back']"), "meeting-new");
  assert.equal(pick("forms:meetings", "[data-act='mt-back']", ".rq-dl"), "meeting");
  assert.equal(pick("forms:meetings"), "meetings");
  assert.equal(pick("forms:request", "#rq-q"), "request-queue");
  assert.equal(pick("forms:request", ".rq-print", "#rq-q"), "request-one");
  assert.equal(pick("forms:request"), "request");
  assert.equal(pick("home:calendar", ".cal .dgrid"), "calendar-day");
  assert.equal(pick("home:calendar", "#sch-modal", ".cal .dgrid"), "schedule", "排會那一塊開著的時候講排會");
  assert.equal(pick("home:calendar"), "calendar");
  assert.equal(pick("home:team:Marketing Team"), "team-home");
  assert.equal(pick("availability:", "#tzq"), "availability-tz");
  assert.equal(pick("availability:"), "availability");
  assert.equal(pick("passport:", ".main .book"), "passport");
  assert.equal(pick("passport:", ".main .wall"), "passport-wall");
  assert.equal(pick("records:overview", "#rc-event-tabs"), "record");
  assert.equal(pick("records:people", "#rc-person-tabs"), "record-person");
  assert.equal(pick("records:forms", ".main .rc-setnote", ".main a.subtab[data-act='sub']"), "question-set", "個人連結的故事題不是回饋表");
  assert.equal(pick("records:forms", ".main a.subtab[data-act='sub']"), "feedback-form");
  assert.equal(pick("settings:settings"), "settings");
  assert.equal(pick("settings:story"), "my-story");
  assert.equal(pick("teamforms:build", ".main a.subtab[data-act='sub']"), "internal-form");
  assert.equal(pick("people:roster", "[data-autosave='person-save']"), "person");
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

test("★ go：導覽先按一個分頁再框裡面的東西；go 只准是分頁或切換畫面的鈕，不准是存、寄、刪", () => {
  const steps = [
    { at: ".head", t: { en: "head" } },
    { at: ".gone", t: { en: "missing before any go" } },
    { go: "[data-tab=\"forms\"]", at: ".inside", t: { en: "in forms" } },
    { at: ".also-inside", t: { en: "after go" } },
    { go: "[data-tab=\"results\"]", t: { en: "results, centred" } },
  ];
  assert.deepEqual(RAIL.tourDeferred(steps), [false, false, true, true, true]);
  const got = RAIL.tourPlan(steps, s => (s === ".head" ? {} : null));
  assert.deepEqual(got.map(s => s.t.en), ["head", "in forms", "after go", "results, centred"], "go 前面找不到的跳過，go 之後的先留著等輪到它");
  assert.deepEqual(got.map(s => !!s.later), [false, true, true, true]);
  assert.equal(RAIL.tourGoAt(steps, 0), "");
  assert.equal(RAIL.tourGoAt(steps, 3), "[data-tab=\"forms\"]", "退回去的時候回到最近的那一個分頁");
  assert.equal(RAIL.tourGoAt(steps, 4), "[data-tab=\"results\"]");
  for (const t of RAIL.TOURS) for (const [i, s] of t.steps.entries()) {
    if (!s.go) continue;
    assert.match(s.go, RAIL.TOUR_GO, `${t.id} 第 ${i + 1} 步的 go 不是分頁鈕：${s.go}`);
    assert.doesNotMatch(s.go, /save|send|del|remove|publish|submit|ready|void|approve|reject|new|add/i, `${t.id} 第 ${i + 1} 步的 go 看起來會改資料：${s.go}`);
  }
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
  assert.match(src, /me\.role === "cadre"\) \{ mountFeedback\(L\); mountTour\(group, tab, me, L\); bindFly\(\); \}/);
  // 設定與我的故事沒有側欄，main.js 每次重畫叫 mountHelp（也只給幹部）。
  assert.match(src, /export function mountHelp\(group, tab, me, L\) \{\s*if \(typeof document !== "undefined" && me && me\.role === "cadre"\) \{ mountFeedback\(L\); mountTour\(group, tab, me, L\); \}/);
  assert.match(read("settings/src/main.js"), /mountHelp\("settings", S\.view === "story" && teller \? "story" : "settings", S\.me, lang\(\)\);/);
  assert.doesNotMatch(src.replace(/\/\/.*$/gm, ""), /requestAnimationFrame\(/);
  // 在 node 裡（沒有 document）畫側欄不會出錯
  assert.match(RAIL.railHTML("people", "roster", { id: "u", role: "cadre", board: "president", name: "P", ws: {} }, {}, "en"), /class="rail"/);
});
