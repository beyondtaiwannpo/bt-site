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
  assert.match(zh, /<a class="ev-card" href="\.\/#camp" data-l="zh">/); assert.match(zh, /<b>2027 冬令營<\/b>/); assert.match(en, /<b>Winter Camp 2027<\/b>/);
  assert.match(zh, /<img src="https:\/\/x\/y.jpg" alt="" loading="lazy" onerror=/);
  assert.match(zh, /<span class="tk-go on"><span class="tk-bars" aria-hidden="true"><\/span><span class="tk-go-t">立即報名<\/span><\/span>/); assert.match(zh, /<span class="tk-go off">[\s\S]*?<span class="tk-go-t">額滿<\/span>/);
  assert.doesNotMatch(zh, /太久以前/);
  const home = U.homeCardsHTML(EVS, "zh");
  assert.equal((home.match(/class="ev-card"/g) || []).length, 3); assert.match(home, /href="\.\/events\/#info"/);
  assert.equal(U.homeCardsHTML([], "zh"), ""); assert.equal(U.homeCardsHTML([EVS[3]], "zh"), "", "只有過去的也不出現");
  assert.match(U.listHTML([], "en"), /No public events right now\./);
});

test("一場活動：主辦、時間、地點、說明保留換行、報名按鈕連到 /apply/?f=、額滿與還沒開各一句、找不到", () => {
  const h = U.detailHTML(EVS[0], "zh");
  assert.match(h, /<p class="ev-by">Marketing 主辦<\/p>/); assert.match(h, /<h1>2027 冬令營<\/h1>/);
  assert.match(h, /<img class="ev-cover" src="https:\/\/x\/y.jpg"/); assert.match(h, /<li><b>地點<\/b><span>台北<\/span><\/li>/);
  // 2026-11-23 重排：報名那一顆叫「立即報名」，在右邊那張卡裡；下面一行寫還有幾個名額，再一行「報名要先登入」（細節在 test/event-page.test.mjs）。
  assert.match(h, /說明<br>第二行/); assert.match(h, /<a class="cta ev-go" href="..\/apply\/\?f=f1">立即報名<\/a>/); assert.match(h, /<p class="ev-note">還有 28 個名額<\/p><p class="ev-note">報名要先登入，一分鐘。<\/p>/);
  assert.match(U.detailHTML(EVS[1], "zh"), /<b>額滿<\/b>・12 \/ 40 人/);
  assert.match(U.detailHTML(EVS[2], "en"), /Sign-up opens \d{4}-\d{2}-\d{2}/);
  assert.match(U.detailHTML(EVS[3], "en"), /<b>Ended<\/b>/);
  assert.doesNotMatch(U.detailHTML(EVS[5], "zh"), /apply\//, "沒有表單就沒有報名");
  assert.match(U.notFoundHTML("zh"), /找不到這場活動/);
  assert.equal(U.esc("<b>"), "&lt;b&gt;");
});

test("★ 首頁「現在開放」：第一屏下面第一段、問不到也有字、程式 import 設定檔不抄金鑰、三秒逾時；/events/ 同樣；check.sh 守著", () => {
  const idx = readFileSync("index.html", "utf8"), ev = readFileSync("events/index.html", "utf8"), main = readFileSync("events/src/main.js", "utf8"), chk = readFileSync("check.sh", "utf8");
  // 2026-11-21：原本是「近期活動」（沒有活動就整段 hidden），現在是「現在開放」，一直都在：有東西畫卡片與報名表，沒有就是 HTML 裡那幾句。
  assert.match(idx, /<section class="now" id="now" aria-labelledby="now-h">[\s\S]*?<h2 id="now-h"><span class="zh">現在開放<\/span><span class="en">Open now<\/span><\/h2>/);
  assert.match(idx, /<div class="zh" id="now-zh"><\/div>\s*<div class="en" id="now-en"><\/div>\s*<p class="now-note">/, "兩個空的容器後面接著問不到時也對的那一句");
  // 2026-11-24 首頁第三次重整：第一屏、我們做什麼、現在開放、數字、從哪裡開始（test/whats-on.test.mjs 有整頁的那一條）。
  assert.ok(idx.indexOf("</header>") < idx.indexOf('id="what"') && idx.indexOf('id="what"') < idx.indexOf('id="now"') && idx.indexOf('id="now"') < idx.indexOf('id="numbers"'), "第一屏、我們做什麼、現在開放、數字");
  assert.match(idx, /import \{ looseForms, fmtDay \} from "\.\/year\/src\/logic\.js"/, "哪些表單算開放的判斷在 year/src/logic.js");
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
  assert.match(U.cardHTML({ ...EVS[0], cover_url: null }, "zh", "./"), /<span class="ev-noimg"><span class="tk-big"><small>[^<]+<\/small>[^<]+<\/span><\/span>/, "沒有封面：日期當海報");
  assert.match(U.cardHTML({ ...EVS[0], cover_url: null, starts_at: null }, "zh", "./"), /<span class="ev-noimg"><\/span>/, "連日期都沒有：只有色塊");
  const one = U.detailHTML(EVS[0], "zh");
  // 2026-11-23 重排：封面在左邊那一欄的最上面，壞掉就只拿掉那一張圖（它自己就是一塊，不用連外面一起拿）。
  assert.match(one, /<header class="ev-head">\s*<img class="ev-cover" src="https:\/\/x\/y\.jpg" alt="" onerror="this\.remove\(\)">/);
  assert.doesNotMatch(U.detailHTML({ ...EVS[0], cover_url: null }, "zh"), /ev-cover/);
  for (const f of ["index.html", "events/index.html"]) {
    const css = readFileSync(f, "utf8");
    // 2026-11-24 票卡：不再寫死三欄、兩欄、一欄，照放得下幾張自己排（一張至少 280px，窄到放不下就一張一排）。
    assert.match(css, /\.ev-cards\{display:grid;grid-template-columns:repeat\(auto-fill,minmax\(min\(100%,280px\),1fr\)\)/, `${f} 卡片照寬度自己排`);
    assert.match(css, /\.ev-card\{[^}]*max-width:400px/, `${f} 只有一張的時候不會拉成一整排`);
  }
});

// ── 活動的卡片是一張機票（2026-11-24）──────────────────────────────────
const read = p => readFileSync(p, "utf8");
test("票卡：日期與時間一律台灣時間，英文像票上印的、中文是數字；跨天印頭尾；只知道哪一天就不印幾點", () => {
  const one = { starts_at: "2027-01-02T16:00:00Z" };                 // 台灣 2027-01-03 00:00，只知道哪一天
  assert.equal(U.ticketDate(one, "en"), "SUN JAN 3 · 2027"); assert.equal(U.ticketDate(one, "zh"), "2027.01.03（日）");
  assert.equal(U.ticketTime(one), "", "半夜十二點、沒有結束時間：時間還沒定");
  const timed = { starts_at: "2027-01-20T01:00:00Z", ends_at: "2027-01-20T09:00:00Z" };
  assert.equal(U.ticketTime(timed), "09:00"); assert.equal(U.ticketDate(timed, "en"), "WED JAN 20 · 2027");
  assert.equal(U.ticketDate({ starts_at: "2027-01-20T01:00:00Z", ends_at: "2027-01-22T09:00:00Z" }, "en"), "JAN 20 – 22 · 2027");
  assert.equal(U.ticketDate({ starts_at: "2027-01-30T01:00:00Z", ends_at: "2027-02-02T09:00:00Z" }, "en"), "JAN 30 – FEB 2 · 2027");
  assert.equal(U.ticketDate({ starts_at: "2027-01-30T01:00:00Z", ends_at: "2027-02-02T09:00:00Z" }, "zh"), "2027.01.30 – 02.02");
  assert.equal(U.ticketDate({ usual_month: 8 }, "zh"), "大約 8 月"); assert.equal(U.ticketDate({}, "en"), "Date to be confirmed");
});

test("票卡最下面那一條：報得了名是橘色的立即報名，額滿、截止、結束是淡的，還沒開寫幾月幾號開放，沒有報名表寫看這場活動", () => {
  const f = { form_id: "f1" };
  assert.deepEqual(U.ticketAction({ ...f, signup_open: true }, "zh"), { cls: "on", text: "立即報名" });
  assert.deepEqual(U.ticketAction({ ...f, signup_open: true }, "en"), { cls: "on", text: "Register now" });
  assert.deepEqual(U.ticketAction({ ...f, is_full: true }, "en"), { cls: "off", text: "Full" });
  assert.deepEqual(U.ticketAction({ ...f, is_past: true }, "zh"), { cls: "off", text: "已結束" });
  assert.deepEqual(U.ticketAction({ ...f }, "zh"), { cls: "off", text: "報名已截止" });
  const soon = U.ticketAction({ ...f, signup_opens_at: "2099-03-04T16:00:00Z" }, "zh");
  assert.deepEqual(soon, { cls: "", text: "03.05 開放報名" });
  assert.deepEqual(U.ticketAction({}, "en"), { cls: "", text: "View event" });
  assert.deepEqual(U.ticketAction({ is_past: true }, "zh"), { cls: "off", text: "看這場活動" });
});

test("票卡的四塊照順序：海報、日期與名字、票根、條碼那一條；時間還沒定的票根不印箭頭；活動名字裡的 HTML 只是字", () => {
  const e = { slug: "x", title_zh: "<b>壞</b>", title_en: "T", starts_at: "2027-01-20T01:00:00Z", ends_at: "2027-01-20T09:00:00Z", place: "台北", form_id: "f", signup_open: true };
  const h = U.cardHTML(e, "zh", "./"), at = k => h.indexOf(k);
  assert.ok(at("ev-noimg") < at('class="ev-body"') && at('class="ev-body"') < at('class="tk-stub"') && at('class="tk-stub"') < at('class="tk-go on"'));
  assert.match(h, /<span class="tk-date">2027\.01\.20（三）<\/span><b>&lt;b&gt;壞&lt;\/b&gt;<\/b><span class="tk-place">台北<\/span>/);
  assert.match(h, /<i>開始<\/i><span class="tk-arrow" aria-hidden="true">→<\/span><b>09:00<\/b><small>台灣時間<\/small>/);
  assert.match(h, /<span class="tk-ico"><svg viewBox="0 0 24 24" aria-hidden="true">/);
  const tbc = U.cardHTML({ ...e, starts_at: "2027-01-02T16:00:00Z", ends_at: null }, "en", "./");
  assert.match(tbc, /<span class="tk-time"><i>Time to be confirmed<\/i><\/span>/); assert.doesNotMatch(tbc, /tk-arrow/);
  assert.doesNotMatch(h, /<a[^>]*>[\s\S]*<a /, "卡片是一條連結，裡面不能再有連結");
});

test("票卡的樣式三頁各一份（首頁、/events/、/apply/），一個字都要一樣；缺口的高度等於票根加條碼那一條", () => {
  const block = p => { const s = read(p), a = s.indexOf(".ev-cards{display:grid"), b = s.indexOf(".tk-go-t{"); assert.ok(a > 0 && b > a, p + " 找不到票卡的樣式"); return s.slice(a, s.indexOf("\n", b)); };
  const home = block("index.html");
  assert.equal(block("events/index.html"), home, "/events/ 跟首頁不一樣"); assert.equal(block("apply/index.html"), home, "/apply/ 跟首頁不一樣");
  const h = sel => Number(home.match(new RegExp(sel.replace(".", "\\.") + "\\{[^}]*height:(\\d+)px"))[1]);
  assert.equal(Number(home.match(/--tk-cut:(\d+)px/)[1]), h(".tk-stub") + h(".tk-go") + 1, "缺口離底部的高度要跟著票根與條碼那一條改");
  for (const p of ["events/index.html", "apply/index.html"]) assert.match(read(p), /\.sec-cards \.sec-in\{grid-template-columns:1fr/, p + " 放票卡的那一段要用整個寬度");
  assert.match(read("apply/index.html"), /<section class="sec sec-cards" id="upcoming" hidden>/);
  assert.match(U.listHTML([], "zh"), /<section class="sec sec-cards">/);
});
