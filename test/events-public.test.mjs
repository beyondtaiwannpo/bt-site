// 活動上架批 3：對外的 /events/ 與首頁「近期活動」。跑法：node --test test/*.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as U from "../events/src/ui.js";

const soon = new Date(Date.now() + 10 * 86400000).toISOString(), later = new Date(Date.now() + 40 * 86400000).toISOString();
const ago = new Date(Date.now() - 20 * 86400000).toISOString(), longAgo = new Date(Date.now() - 400 * 86400000).toISOString();
const base = { team: "Marketing Team", summary_zh: "三天兩夜", summary_en: "Three days", body_zh: "說明\n第二行", body_en: "Body", cover_url: "https://x/y.jpg", place: "台北", capacity: 40, form_id: "f1", signup_open: true, signup_opens_at: null, signup_closes_at: null, signed_up: 12, is_full: false, is_past: false };
const EVS = [
  { ...base, slug: "camp", title_zh: "2027 冬令營", title_en: "Winter Camp 2027", starts_at: later, ends_at: later },
  { ...base, slug: "info", title_zh: "說明會", title_en: "Info Session", starts_at: soon, ends_at: soon, is_full: true },
  { ...base, slug: "night", title_zh: "校友之夜", title_en: "Mentor Night", starts_at: soon, ends_at: soon, signup_open: false, signup_opens_at: later, form_id: "f3" },
  { ...base, slug: "old", title_zh: "去年的", title_en: "Last year", starts_at: ago, ends_at: ago, is_past: true },
  { ...base, slug: "ancient", title_zh: "太久以前", title_en: "Ancient", starts_at: longAgo, ends_at: longAgo, is_past: true },
  { ...base, slug: "noform", title_zh: "只公告", title_en: "Notice only", starts_at: later, ends_at: null, form_id: null },
];

test("★ 分近期與過去：過去只留最近 12 個月；近期照開始時間、過去照新到舊", () => {
  const { upcoming, past } = U.split(EVS);
  assert.deepEqual(upcoming.map(e => e.slug), ["info", "night", "camp", "noform"]);
  assert.deepEqual(past.map(e => e.slug), ["old"], "400 天前的不列");
});

test("報名那一行的狀態：開放、額滿、還沒開、截止、已結束、沒有表單", () => {
  assert.equal(U.signupState(EVS[0]), "open"); assert.equal(U.signupState(EVS[1]), "full"); assert.equal(U.signupState(EVS[2]), "soon");
  assert.equal(U.signupState(EVS[3]), "ended"); assert.equal(U.signupState(EVS[5]), "none");
  assert.equal(U.signupState({ ...base, signup_open: false, signup_opens_at: null }), "closed");
});

test("清單：卡片連到 ./#代號（不用 ?e=，語言切換會把 ? 換掉）、標題照語言、封面、標籤；首頁最多三張、沒有就空字串", () => {
  const zh = U.listHTML(EVS, "zh"), en = U.listHTML(EVS, "en");
  assert.match(zh, /<h2>近期活動<\/h2>/); assert.match(zh, /<h2>過去的活動<\/h2>/);
  assert.match(zh, /<a class="ev-card" href="\.\/#camp">/); assert.match(zh, /<b>2027 冬令營<\/b>/); assert.match(en, /<b>Winter Camp 2027<\/b>/);
  assert.match(zh, /<img src="https:\/\/x\/y.jpg" alt="" loading="lazy" onerror=/);
  assert.match(zh, /<span class="ev-tag on">報名<\/span>/); assert.match(zh, /<span class="ev-tag">額滿<\/span>/);
  assert.doesNotMatch(zh, /太久以前/);
  const home = U.homeCardsHTML(EVS, "zh");
  assert.equal((home.match(/ev-card/g) || []).length, 3); assert.match(home, /href="\.\/events\/#info"/);
  assert.equal(U.homeCardsHTML([], "zh"), ""); assert.equal(U.homeCardsHTML([EVS[3]], "zh"), "", "只有過去的也不出現");
  assert.match(U.listHTML([], "en"), /No public events right now\./);
});

test("一場活動：主辦、時間、地點、說明保留換行、報名按鈕連到 /apply/?f=、額滿與還沒開各一句、找不到", () => {
  const h = U.detailHTML(EVS[0], "zh");
  assert.match(h, /<p class="ev-by">Marketing 主辦<\/p>/); assert.match(h, /<h1>2027 冬令營<\/h1>/);
  assert.match(h, /<img class="ev-cover" src="https:\/\/x\/y.jpg"/); assert.match(h, /<li><b>地點<\/b><span>台北<\/span><\/li>/);
  assert.match(h, /說明<br>第二行/); assert.match(h, /<a class="cta" href="..\/apply\/\?f=f1">報名<\/a>/); assert.match(h, /12 \/ 40 人。報名要先登入/);
  assert.match(U.detailHTML(EVS[1], "zh"), /<b>額滿<\/b>・12 \/ 40 人/);
  assert.match(U.detailHTML(EVS[2], "en"), /Sign-up opens \d{4}-\d{2}-\d{2}/);
  assert.match(U.detailHTML(EVS[3], "en"), /<b>Ended<\/b>/);
  assert.doesNotMatch(U.detailHTML(EVS[5], "zh"), /apply\//, "沒有表單就沒有報名");
  assert.match(U.notFoundHTML("zh"), /找不到這場活動/);
  assert.equal(U.esc("<b>"), "&lt;b&gt;");
});

test("★ 首頁：兩段 hidden、標題只有「近期活動」「Upcoming」、程式 import 設定檔不抄金鑰、三秒逾時；/events/ 同樣；check.sh 守著", () => {
  const idx = readFileSync("index.html", "utf8"), ev = readFileSync("events/index.html", "utf8"), main = readFileSync("events/src/main.js", "utf8"), chk = readFileSync("check.sh", "utf8");
  assert.match(idx, /<section class="sec sec-events" id="events" hidden>\s*<div class="sec-in">\s*<h2>近期活動<\/h2>/);
  assert.match(idx, /<section class="sec sec-events" id="events-en" hidden>\s*<div class="sec-in">\s*<h2>Upcoming<\/h2>/);
  assert.ok(idx.indexOf('id="what"') < idx.indexOf('id="events"') && idx.indexOf('id="events"') < idx.indexOf('id="join"'), "在「我們做什麼」之後、「加入我們」之前");
  assert.ok(idx.indexOf('id="what-en"') < idx.indexOf('id="events-en"') && idx.indexOf('id="events-en"') < idx.indexOf('id="join-en"'));
  for (const f of [idx, ev, main]) assert.doesNotMatch(f, /sb_publishable_|supabase\.co/, "不抄金鑰");
  assert.match(idx, /import \{ SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY \} from "\.\/shared\/supabase-config\.js"/);
  assert.match(main, /from "\.\.\/\.\.\/shared\/supabase-config\.js"/);
  assert.match(idx, /setTimeout\(\(\) => ctl\.abort\(\), 3000\)/);
  assert.doesNotMatch(idx, /<script type="module">[\s\S]*gsap/, "首頁的 module 不碰動畫");
  assert.match(ev, /<div id="ev-zh">/); assert.match(ev, /<div id="ev-en">/); assert.match(ev, /<script type="module" src="\.\/src\/main\.js">/);
  assert.match(chk, /sb_publishable_/, "check.sh 守著金鑰只在設定檔");
});

test("封面連結壞掉：卡片的 img 帶 onerror 換成色塊、沒有封面直接色塊；一場活動的封面壞掉整塊拿掉、沒有封面不留空位", () => {
  const card = U.cardHTML(EVS[0], "zh", "./");
  assert.match(card, /<img src="https:\/\/x\/y.jpg" alt="" loading="lazy" onerror="this.outerHTML='<span class=&quot;ev-noimg&quot;><\/span>'">/);
  assert.match(U.cardHTML({ ...EVS[0], cover_url: null }, "zh", "./"), /<span class="ev-noimg"><\/span>/);
  const one = U.detailHTML(EVS[0], "zh");
  assert.match(one, /<section class="sec ev-cover-sec">[\s\S]*onerror="this\.closest\('section'\)\.remove\(\)"/);
  assert.doesNotMatch(U.detailHTML({ ...EVS[0], cover_url: null }, "zh"), /ev-cover/);
  for (const f of ["index.html", "events/index.html"]) {
    const css = readFileSync(f, "utf8");
    assert.match(css, /\.ev-cards\{display:grid;grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/, `${f} 桌機三欄`);
    assert.match(css, /@media \(max-width:900px\)\{\.ev-cards\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)\}\}/, `${f} 平板兩欄`);
    assert.match(css, /@media \(max-width:600px\)\{\.ev-cards\{grid-template-columns:1fr\}\}/, `${f} 手機一欄`);
  }
});
