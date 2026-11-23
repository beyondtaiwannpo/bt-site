// 對外一場活動那一頁的重排，與後台說明的排版工具列（2026-11-23）。跑法：node --test test/*.test.mjs
// Paul（拿 Accupass 的活動頁當樣子）：「If we click into events, there shouldn't be events on top... it's looking really plain... stack by stack.
//   I need the text to be bold, highlight, or in different colors. And then we can insert photos and people can scroll through, scroll left and right.
//   To the right there should be this register now that follows as you scroll down... And I really like how [Accupass] has add to calendar on top.」
// 這一支守六件事：
//   1. 說明的排版：新的記號、可以包在一起、打的 HTML 永遠只是字；對外那一份與後台預覽那一份輸出一字不差。
//   2. 時間：卡片上印台灣時間、帶星期；只知道哪一天就只印日期。
//   3. 加入行事曆：Google 的連結與 .ics 的文字（整天與有時間的、逃脫、折行）。
//   4. 那一頁的骨架：沒有空的框、右邊一張卡、手機最下面一條、照片是橫的一排。
//   5. 後台：工具列按了之後字與選取範圍變成什麼、預覽、提示。
//   6. 約定：main.js、index.html 的樣式、減少動態效果。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as PUB from "../events/src/ui.js";
import * as F from "../admin/src/ui.js";
import * as FS from "../admin/src/strings.js";

F.setLang("zh");
const read = p => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const count = (h, re) => (h.match(re) || []).length;
const TID = "11111111-1111-4111-8111-111111111111";
const E = { slug: "overseas-unpacked", team: "Curriculum Team", title_zh: "寒假探索營", title_en: "Winter College Bootcamp", edition_zh: "Overseas Unpacked", edition_en: "Overseas Unpacked",
  summary_zh: "一天，公立高中生優先，免費。", summary_en: "One day, free.", body_zh: "## 活動資訊\n內容", body_en: "## Details\nBody", cover_url: "https://x/c.jpg",
  starts_at: "2027-01-03T01:00:00Z", ends_at: "2027-01-03T09:00:00Z", place: "台北市大安區", capacity: 40, form_id: "f1",
  signup_open: true, signup_opens_at: null, signup_closes_at: "2026-12-31T15:59:00Z", signed_up: 12, is_full: false, is_past: false, usual_month: 1 };
const DATE_ONLY = { ...E, slug: "winter-bootcamp", starts_at: "2027-01-02T16:00:00Z", ends_at: null, form_id: null, signup_open: false };
const NO_DATE = { ...E, slug: "coffee-chat", starts_at: null, ends_at: null, form_id: null, signup_open: false, usual_month: null };
const X = { photos: [{ url: "https://x/1.jpg" }, { url: "https://x/2.jpg" }], speakers: [{ name: "Annie", subject: "CS", school: "UCLA", photo_url: null }],
  tickets: [{ id: TID, name_zh: "學生", name_en: "Student", note_zh: "", note_en: "", capacity: 20, taken: 3, full: false }] };

// ── 1. 說明的排版 ──────────────────────────────────────────────────────
test("★ richText 的記號：大標題、小標題、粗體、兩種螢光、藍底橘字、引言、清單、分段與換行", () => {
  assert.equal(PUB.richText("## 活動資訊"), "<h3>活動資訊</h3>");
  assert.equal(PUB.richText("### 這一天，你會做什麼？"), "<h4>這一天，你會做什麼？</h4>");
  assert.equal(PUB.richText("**活動時間**｜2027.01.03 9:00 - 17:00"), "<p><b>活動時間</b>｜2027.01.03 9:00 - 17:00</p>");
  assert.equal(PUB.richText("費用｜==完全免費=="), "<p>費用｜<mark>完全免費</mark></p>");
  assert.equal(PUB.richText("{{每一組都有學長姐}}"), '<p><mark class="hl2">每一組都有學長姐</mark></p>');
  assert.equal(PUB.richText("名額有限，[[額滿就不收了]]。"), '<p>名額有限，<span class="rt-c">額滿就不收了</span>。</p>');
  assert.equal(PUB.richText("> 我也可以。\n> 高二學員"), "<blockquote>我也可以。<br>高二學員</blockquote>", "連續幾行是同一段引言");
  assert.equal(PUB.richText("> 第一位\n\n> 第二位"), "<blockquote>第一位</blockquote><blockquote>第二位</blockquote>", "空一行就是兩段引言");
  assert.equal(PUB.richText("- 一\n- 二"), "<ul><li>一</li><li>二</li></ul>");
  assert.equal(PUB.richText("第一行\n第二行\n\n新的一段"), "<p>第一行<br>第二行</p><p>新的一段</p>");
  assert.equal(PUB.richText("前言\n> 引言\n- 清單\n## 標題\n後面"), "<p>前言</p><blockquote>引言</blockquote><ul><li>清單</li></ul><h3>標題</h3><p>後面</p>", "不同的東西接在一起各自成塊");
  assert.equal(PUB.richText("#### 四個井號不算"), "<p>#### 四個井號不算</p>");
});

test("★ richText 可以包在一起：標題、清單、引言、螢光裡的粗體；清單裡的螢光", () => {
  assert.equal(PUB.richText("## **這一天**，你會做什麼？"), "<h3><b>這一天</b>，你會做什麼？</h3>", "標題裡的粗體");
  assert.equal(PUB.richText("### 小標題裡的 **粗體**"), "<h4>小標題裡的 <b>粗體</b></h4>");
  assert.equal(PUB.richText("- **分組**聊科系"), "<ul><li><b>分組</b>聊科系</li></ul>", "清單裡的粗體");
  assert.equal(PUB.richText("> 聽完才知道 **我也可以**。"), "<blockquote>聽完才知道 <b>我也可以</b>。</blockquote>", "引言裡的粗體");
  assert.equal(PUB.richText("==**完全免費**=="), "<p><mark><b>完全免費</b></mark></p>", "螢光裡的粗體");
  assert.equal(PUB.richText("**==完全免費==**"), "<p><b><mark>完全免費</mark></b></p>", "反過來包也行");
  assert.equal(PUB.richText("- ==午餐我們準備==\n- {{每一組}}都有學長姐"), '<ul><li><mark>午餐我們準備</mark></li><li><mark class="hl2">每一組</mark>都有學長姐</li></ul>', "清單裡的螢光");
  assert.equal(PUB.richText("{{**綠底粗體**}} 與 [[**藍底粗體**]]"), '<p><mark class="hl2"><b>綠底粗體</b></mark> 與 <span class="rt-c"><b>藍底粗體</b></span></p>');
  assert.equal(PUB.richText("## ==標題裡的螢光=="), "<h3><mark>標題裡的螢光</mark></h3>");
});

test("★ richText 的記號不會跟平常寫的字撞在一起：單一個的等號、括號、星號都只是字；記號不跨行", () => {
  assert.equal(PUB.richText("a = b，x == y 只有一組，[註 1]、{備註}、5 * 3 * 2"), "<p>a = b，x == y 只有一組，[註 1]、{備註}、5 * 3 * 2</p>");
  assert.equal(PUB.richText("C++ 與 C#、100%、^^、~~、!!、50/50"), "<p>C++ 與 C#、100%、^^、~~、!!、50/50</p>", "常見的符號都不是記號");
  assert.equal(PUB.richText("==第一行\n第二行=="), "<p>==第一行<br>第二行==</p>", "跨行的不認");
  assert.equal(PUB.richText("====、{{}}、[[]]、****"), "<p>====、{{}}、[[]]、****</p>", "中間沒有字的不認");
  assert.equal(PUB.richText("[連結](https://x.example) ![圖](https://x.example/a.png) https://x.example"), "<p>[連結](https://x.example) ![圖](https://x.example/a.png) https://x.example</p>", "沒有連結、沒有圖");
  assert.equal(PUB.richText("2 > 1 是對的\n>沒有空白不算引言"), "<p>2 &gt; 1 是對的<br>&gt;沒有空白不算引言</p>");
});

test("★ richText：打的 HTML 一律只是字（先逃脫再加標籤），新的記號裡面也一樣；只會出現白名單裡的標籤", () => {
  const evil = "<script>alert(1)</script>\n## <img src=x onerror=alert(1)>\n### <svg onload=alert(1)>\n- <a href=\"javascript:alert(1)\">點我</a>\n> <iframe src=//evil.example></iframe>\n"
    + "==<b onclick=x>螢光</b>==\n{{<style>*{display:none}</style>}}\n[[\" onmouseover=\"alert(1)]]\n**<u>粗</u>**\n<mark class=\"hl2\">自己打的標籤</mark>";
  const h = PUB.richText(evil);
  assert.doesNotMatch(h, /<script|<img|<svg|<a |<iframe|<style|<u>|<b onclick|onmouseover="alert/, "原本的標籤一個都沒有活下來");
  assert.match(h, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(h, /<h3>&lt;img src=x onerror=alert\(1\)&gt;<\/h3>/); assert.match(h, /<h4>&lt;svg onload=alert\(1\)&gt;<\/h4>/);
  assert.match(h, /<blockquote>&lt;iframe src=\/\/evil\.example&gt;&lt;\/iframe&gt;<\/blockquote>/);
  assert.match(h, /<mark>&lt;b onclick=x&gt;螢光&lt;\/b&gt;<\/mark>/);
  assert.match(h, /<mark class="hl2">&lt;style&gt;\*\{display:none\}&lt;\/style&gt;<\/mark>/);
  assert.match(h, /<span class="rt-c">&quot; onmouseover=&quot;alert\(1\)<\/span>/, "引號逃脫了，跳不出屬性");
  assert.match(h, /&lt;mark class=&quot;hl2&quot;&gt;自己打的標籤&lt;\/mark&gt;/, "自己打一個長得一樣的標籤也只是字");
  for (const t of [...h.matchAll(/<\/?[a-z0-9]+[^>]*>/g)].map(m => m[0]))
    assert.match(t, /^(<\/?(h3|h4|p|b|ul|li|mark|blockquote|span)>|<br>|<mark class="hl2">|<span class="rt-c">)$/, `多了一個不該有的標籤：${t}`);
});

test("★ 後台預覽那一份（evRichText）跟對外那一份（richText）輸出一字不差", () => {
  const corpus = [
    "", null, undefined, "\n\n  \n", "純文字", "第一行\n第二行\n\n新的一段", "說明\r\n第二行",
    "## 活動資訊\n**活動時間**｜2027.01.03 9:00 - 17:00\n**活動地點**｜台北市\n**費用**｜==完全免費==，午餐我們準備",
    "### 這一天，你會做什麼？\n- 聽學長姐講他們怎麼申請\n- **分組**聊你想讀的科系，{{每一組都有一位在海外讀書的學長姐}}\n- 帶一份自己的時間表回家",
    "## 報名資訊\n名額有限，[[額滿就不收了]]。報名之後會收到一封確認信。",
    "## 以前的學員怎麼說？\n> 原本以為出國讀書離我很遠，聽完才知道 **我也可以**。\n> 高二學員\n\n> 第一次有人把申請的時間表講得這麼清楚。",
    "==**雙**== **==雙==** {{**綠**}} [[**藍**]] ## 不在行首 - 不在行首 > 不在行首",
    "a = b，x == y，[註]、{備註}、C++、5 * 3、====、{{}}、[[]]、****",
    "  ## 有縮排的標題  \n   - 有縮排的清單\n > 有縮排的引言",
    "<script>alert(1)</script>\n## <img src=x onerror=alert(1)>\n==<b onclick=x>螢光</b>==\n[[\" onmouseover=\"alert(1)]]\n& < > \" '",
    "#### 四個井號\n##沒有空白\n-沒有空白\n>沒有空白", "==第一行\n第二行==", "- 一\n\n- 二\n## 標題\n- 三\n> 引言\n後面",
    "## Event details\n**When**｜3 Jan 2027, 9:00 - 17:00\n### What you will do\n- Hear how older students applied\n> I can too.",
  ];
  for (const t of corpus) assert.equal(F.evRichText(t), PUB.richText(t), JSON.stringify(t));
  for (const t of ["**a** ==b== {{c}} [[d]]", "<b>&\"'", "", null]) assert.equal(F.evRichInline(t), PUB.richInline(t), JSON.stringify(t));
  // 兩份的本體連寫法都一樣（把函式名字換掉之後一字不差）：哪一邊改了、另一邊沒改，這裡會紅
  const body = (src, name, next) => src.slice(src.indexOf(`export function ${name}(`), src.indexOf(next)).replace(/\s+/g, " ").trim();
  const pub = read("events/src/ui.js"), adm = read("admin/src/ui.js");
  assert.equal(body(adm, "evRichInline", "export function evRichText(").replace(/evRichInline/g, "richInline"), body(pub, "richInline", "export function richText("));
  assert.equal(body(adm, "evRichText", "// 工具列的八顆按鈕").replace(/evRichText/g, "richText").replace(/evRichInline/g, "richInline"), body(pub, "richText", "// ── 時間（台灣時間，帶星期）"));
  assert.doesNotMatch(adm + read("admin/src/main.js"), /from "\.\.\/\.\.\/events\//, "後台不 import 對外頁");
});

// ── 2. 時間 ────────────────────────────────────────────────────────────
test("★ 卡片上的時間：台灣時間、帶星期；同一天印幾點到幾點、跨天兩邊都印日期；只知道哪一天就只印日期；沒有日期照舊", () => {
  assert.equal(PUB.whenLong(E, "zh"), "2027.01.03（日）09:00 - 17:00（台灣時間）");
  assert.equal(PUB.whenLong(E, "en"), "2027.01.03 (Sun) 09:00 - 17:00 (Taiwan time, GMT+8)");
  assert.equal(PUB.whenLong({ ...E, ends_at: "2027-01-04T09:00:00Z" }, "zh"), "2027.01.03（日）09:00 - 2027.01.04（一）17:00（台灣時間）");
  assert.equal(PUB.whenLong({ ...E, ends_at: null }, "zh"), "2027.01.03（日）09:00（台灣時間）", "沒有結束時間只印開始");
  assert.equal(PUB.whenLong(DATE_ONLY, "zh"), "2027.01.03（日）", "台灣半夜十二點、沒有結束：只印日期，不印 00:00");
  assert.equal(PUB.whenLong(DATE_ONLY, "en"), "2027.01.03 (Sun)");
  assert.equal(PUB.whenLong({ ...E, starts_at: "2027-01-02T16:00:00Z", ends_at: "2027-01-03T09:00:00Z" }, "zh"), "2027.01.03（日）00:00 - 17:00（台灣時間）", "半夜十二點但有結束時間的是真的時間");
  assert.equal(PUB.whenLong({ ...NO_DATE, usual_month: 8 }, "zh"), "大約 8 月"); assert.equal(PUB.whenLong({ ...NO_DATE, usual_month: 8 }, "en"), "Around August");
  assert.equal(PUB.whenLong(NO_DATE, "zh"), "日期還沒定"); assert.equal(PUB.whenLong(NO_DATE, "en"), "Date to be confirmed");
  assert.equal(PUB.whenLong({ ...E, starts_at: "不是日期" }, "zh"), "大約 1 月", "日期壞掉當成沒有日期");
  assert.equal(PUB.dateOnly("2027-01-02T16:00:00Z", null), true); assert.equal(PUB.dateOnly("2027-01-02T16:00:00Z", "2027-01-03T09:00:00Z"), false);
  assert.equal(PUB.dateOnly("2027-01-03T01:00:00Z", null), false); assert.equal(PUB.dateOnly(null, null), false);
  assert.equal(PUB.stampText("2026-12-31T15:59:00Z", "zh"), "2026.12.31（四）23:59"); assert.equal(PUB.stampText("2026-12-31T15:59:00Z", "en"), "2026.12.31 (Thu) 23:59");
  assert.equal(PUB.stampText("", "zh"), ""); assert.equal(PUB.stampText("壞的", "zh"), "");
  // 不管跑測試的機器在哪個時區，印出來的都是台灣時間
  assert.equal(PUB.whenLong({ ...E, starts_at: "2027-01-03T15:30:00Z", ends_at: "2027-01-03T17:00:00Z" }, "zh"), "2027.01.03（日）23:30 - 2027.01.04（一）01:00（台灣時間）");
});

// ── 3. 加入行事曆 ──────────────────────────────────────────────────────
const URL_ = "https://beyondtaiwannpo.com/events/#overseas-unpacked";
test("★ 行事曆的資料：有時間的用 UTC 的時間點、只知道哪一天的是整天、沒有日期的沒有；沒有結束時間不亂猜", () => {
  const c = PUB.calData(E, "zh", URL_);
  assert.equal(c.title, "Overseas Unpacked"); assert.equal(c.allDay, false); assert.equal(c.place, "台北市大安區"); assert.equal(c.uid, "event-overseas-unpacked.beyondtaiwannpo.com");
  assert.equal(c.details, "一天，公立高中生優先，免費。\n\n" + URL_, "說明是一句話加這一頁的網址");
  assert.deepEqual(PUB.calDates(c), ["20270103T010000Z", "20270103T090000Z"]);
  const d = PUB.calData(DATE_ONLY, "en", URL_);
  assert.equal(d.allDay, true); assert.deepEqual(PUB.calDates(d), ["20270103", "20270104"], "整天：台灣那一天與隔天（結束那一天不算在內）");
  assert.equal(d.details, "One day, free.\n\n" + URL_);
  const noEnd = PUB.calData({ ...E, ends_at: null }, "zh", URL_);
  assert.equal(noEnd.end, null); assert.deepEqual(PUB.calDates(noEnd), ["20270103T010000Z", "20270103T010000Z"], "沒有結束時間：結束等於開始，不編一個長度");
  assert.equal(PUB.calData({ ...E, ends_at: "2027-01-02T00:00:00Z" }, "zh", URL_).end, null, "結束比開始早的當成沒有");
  assert.equal(PUB.calData(NO_DATE, "zh", URL_), null); assert.equal(PUB.calData({ ...E, starts_at: "壞的" }, "zh", URL_), null); assert.equal(PUB.calData(null, "zh", URL_), null);
  assert.equal(PUB.calData({ ...E, edition_zh: "", edition_en: "" }, "zh", URL_).title, "寒假探索營");
});

test("★ Google 日曆的連結：action=TEMPLATE、text、dates、location、details，每一格都編碼過", () => {
  const u = new URL(PUB.gcalUrl(PUB.calData({ ...E, summary_zh: "免費 & 好玩，名額 100%？#標籤\n第二行", place: "台北市, 大安區 & 信義區" }, "zh", URL_)));
  assert.equal(u.origin + u.pathname, "https://calendar.google.com/calendar/render");
  assert.equal(u.searchParams.get("action"), "TEMPLATE"); assert.equal(u.searchParams.get("text"), "Overseas Unpacked");
  assert.equal(u.searchParams.get("dates"), "20270103T010000Z/20270103T090000Z");
  assert.equal(u.searchParams.get("location"), "台北市, 大安區 & 信義區", "逗號與 & 解回來一字不差");
  assert.equal(u.searchParams.get("details"), "免費 & 好玩，名額 100%？#標籤\n第二行\n\n" + URL_);
  assert.equal([...u.searchParams.keys()].join(","), "action,text,dates,location,details", "& 與 # 沒有把網址切壞（沒有多出來的參數）");
  assert.doesNotMatch(PUB.gcalUrl(PUB.calData(E, "zh", URL_)), /[\u4e00-\u9fff\s#]|&amp;/, "網址裡沒有沒編碼的中文、空白、井號");
  const all = new URL(PUB.gcalUrl(PUB.calData(DATE_ONLY, "en", URL_)));
  assert.equal(all.searchParams.get("dates"), "20270103/20270104", "整天的活動只有日期");
  assert.equal(new URL(PUB.gcalUrl(PUB.calData({ ...E, place: "" }, "zh", ""))).searchParams.has("location"), false, "沒有地點就沒有那一格");
  assert.equal(PUB.gcalUrl(null), "");
});

test("★ .ics：整天與有時間的、CRLF、逗號分號反斜線換行都逃脫、一行不超過 75 個位元組（中文不會被切成兩半）", () => {
  const now = new Date("2026-11-23T04:05:06Z");
  const t = PUB.icsText(PUB.calData({ ...E, summary_zh: "帶筆電, 帶護照; 不用錢\\沒有例外\n第二行", place: "台北市, 大安區; 3 樓" }, "zh", URL_), now);
  assert.ok(t.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Beyond Taiwan//Events//EN\r\n"), "開頭");
  assert.ok(t.endsWith("END:VEVENT\r\nEND:VCALENDAR\r\n"), "結尾");
  assert.doesNotMatch(t.replace(/\r\n/g, ""), /[\r\n]/, "行尾只有 CRLF，沒有落單的換行");
  const lines = t.replace(/\r\n /g, "").split("\r\n");   // 折行接回去再看
  assert.ok(lines.includes("UID:event-overseas-unpacked.beyondtaiwannpo.com")); assert.ok(lines.includes("DTSTAMP:20261123T040506Z"));
  assert.ok(lines.includes("DTSTART:20270103T010000Z")); assert.ok(lines.includes("DTEND:20270103T090000Z"));
  assert.ok(lines.includes("SUMMARY:Overseas Unpacked"));
  assert.ok(lines.includes("LOCATION:台北市\\, 大安區\\; 3 樓"), "地點的逗號與分號");
  assert.ok(lines.includes("DESCRIPTION:帶筆電\\, 帶護照\\; 不用錢\\\\沒有例外\\n第二行\\n\\n" + URL_), "說明的逗號、分號、反斜線、換行");
  assert.ok(lines.includes("URL:" + URL_));
  assert.equal(count(t, /BEGIN:VEVENT/g), 1);
  const enc = new TextEncoder();
  for (const l of t.split("\r\n")) assert.ok(enc.encode(l).length <= 75, `這一行太長（${enc.encode(l).length} 位元組）：${l}`);
  assert.doesNotMatch(t, /\uFFFD/, "沒有被切壞的字");
  const long = PUB.icsText(PUB.calData({ ...E, summary_zh: "很長的一句話".repeat(40) }, "zh", URL_), now);
  assert.ok(long.includes("\r\n "), "太長的那一行有折行");
  assert.equal(long.replace(/\r\n /g, "").split("\r\n").find(l => l.startsWith("DESCRIPTION:")), "DESCRIPTION:" + "很長的一句話".repeat(40) + "\\n\\n" + URL_, "折行接回去一個字都沒少");
  // 整天的
  const d = PUB.icsText(PUB.calData(DATE_ONLY, "zh", URL_), now).split("\r\n");
  assert.ok(d.includes("DTSTART;VALUE=DATE:20270103")); assert.ok(d.includes("DTEND;VALUE=DATE:20270104"));
  // 沒有結束時間：不寫 DTEND
  assert.doesNotMatch(PUB.icsText(PUB.calData({ ...E, ends_at: null }, "zh", URL_), now), /DTEND/);
  assert.equal(PUB.icsText(null), "");
  assert.equal(PUB.icsEscape("a,b;c\\d\ne\r\nf"), "a\\,b\\;c\\\\d\\ne\\nf"); assert.equal(PUB.icsEscape(null), "");
});

test("★ 卡片上的「加入行事曆」：有日期才有；Google 是開新分頁的連結、.ics 是真的按鈕；沒有日期整段不畫", () => {
  const h = PUB.calendarHTML(E, "zh", URL_);
  assert.match(h, /^<div class="ev-cal"><b>加入行事曆<\/b>/);
  assert.match(h, /<a class="ev-cal-a" href="https:\/\/calendar\.google\.com\/calendar\/render\?action=TEMPLATE&amp;text=Overseas\+Unpacked&amp;dates=[^"]+" target="_blank" rel="noopener">Google 日曆<\/a>/, "& 在 HTML 裡寫成 &amp;");
  assert.match(h, /<button type="button" class="ev-cal-a" data-act="ics" data-slug="overseas-unpacked" data-l="zh">下載行事曆檔（Apple、Outlook）<\/button>/);
  const en = PUB.calendarHTML(E, "en", URL_);
  assert.match(en, /<b>Add to calendar<\/b>/); assert.match(en, />Google Calendar<\/a>/); assert.match(en, /data-l="en">Download calendar file \(Apple, Outlook\)<\/button>/);
  assert.equal(PUB.calendarHTML(NO_DATE, "zh", URL_), ""); assert.match(PUB.calendarHTML(DATE_ONLY, "zh", URL_), /dates=20270103%2F20270104/);
});

// ── 4. 那一頁的骨架 ────────────────────────────────────────────────────
test("★ 一場活動那一頁：最上面一行回清單、左邊標題與內容、右邊一張卡；順序是 標題 → 卡 → 內容（手機上卡就在活動名稱下面）", () => {
  const h = PUB.detailHTML(E, "zh", X, { url: URL_ });
  assert.match(h, /^<article class="ev-page body has-bar">\s*<p class="ev-back"><a href="\.\/">← 所有活動<\/a><\/p>\s*<div class="ev-grid">/);
  assert.doesNotMatch(h, /class="hero|class="sec|sec-in/, "不是清單那種一段一段的版面，也沒有大標題那一塊");
  const at = s => { const i = h.indexOf(s); assert.ok(i >= 0, `找不到 ${s}`); return i; };
  assert.ok(at('<header class="ev-head">') < at('<aside class="ev-side">') && at('<aside class="ev-side">') < at('<div class="ev-rest">'), "DOM 的順序：標題、卡、其他");
  assert.match(h, /<header class="ev-head">\s*<img class="ev-cover" src="https:\/\/x\/c\.jpg" alt="" onerror="this\.remove\(\)">\s*<p class="ev-by">Curriculum 主辦・寒假探索營<\/p><h1>Overseas Unpacked<\/h1><p class="lead">一天，公立高中生優先，免費。<\/p>/);
  assert.equal(count(h, /<h1>/g), 1, "活動名稱只有一個 h1（卡片上那一個是 p）");
  // 卡
  assert.match(h, /<div class="ev-card2" data-ev-card>\s*<p class="ev-card-by">Curriculum 主辦<\/p><p class="ev-card-t">Overseas Unpacked<\/p>/);
  assert.match(h, /<li><b>時間<\/b><span>2027\.01\.03（日）09:00 - 17:00（台灣時間）<\/span><\/li><li><b>地點<\/b><span>台北市大安區<\/span><\/li>/);
  assert.ok(at("data-ev-card") < at("data-ev-signup") && at("data-ev-signup") < at('class="ev-cal"') && at('class="ev-cal"') < at('<div class="ev-rest">'), "卡裡：時間地點、報名、加入行事曆");
  // 其他
  assert.ok(at('class="ev-text"') < at('class="ev-speakers"') && at('class="ev-speakers"') < at('class="ev-photos"') && at('class="ev-photos"') < h.lastIndexOf("所有活動"), "說明、講者、照片、回清單");
  assert.match(h, /<div class="ev-text"><h3>活動資訊<\/h3><p>內容<\/p><\/div>/);
  assert.match(PUB.detailHTML(E, "en", X, { url: URL_ }), /<p class="ev-card-t">Overseas Unpacked<\/p>[\s\S]*<li><b>When<\/b><span>2027\.01\.03 \(Sun\) 09:00 - 17:00 \(Taiwan time, GMT\+8\)<\/span><\/li>/);
});

test("★ 沒有資料的那幾塊整塊不畫，不留空的框（畫出來之後版面不會再跳）：沒有講者、照片、說明、封面、地點、報名表、日期", () => {
  const bare = PUB.detailHTML({ slug: "coffee-chat", team: "Mentorship Team", title_zh: "Coffee chat", title_en: "Coffee chat" }, "zh");
  assert.doesNotMatch(bare, /ev-text|ev-speakers|ev-photos|ev-cover|ev-cal|ev-bar|<img|hidden|立即報名|地點/);
  assert.match(bare, /<li><b>時間<\/b><span>日期還沒定<\/span><\/li><\/ul>/);
  assert.match(bare, /<div class="ev-signup" data-ev-signup><\/div>/, "沒有報名表：那一格是空的");
  assert.match(bare, /^<article class="ev-page body">/, "沒有手機最下面那一條");
  for (const x of [undefined, null, {}, { photos: [], speakers: [], tickets: [] }, { message: "Could not find the function" }])
    assert.equal(PUB.detailHTML(E, "zh", x, { url: URL_ }), PUB.detailHTML(E, "zh", null, { url: URL_ }), "問不到跟沒有資料畫出來一樣：" + JSON.stringify(x));
  const dateOnly = PUB.detailHTML(DATE_ONLY, "zh", null, { url: URL_ });
  assert.match(dateOnly, /<li><b>時間<\/b><span>2027\.01\.03（日）<\/span><\/li>/); assert.match(dateOnly, /dates=20270103%2F20270104/, "只知道哪一天的活動有行事曆，是整天的");
  assert.doesNotMatch(dateOnly, /立即報名|ev-bar/);
});

test("★ 卡片上報名那一段：開放中是「立即報名」加還有幾個名額與報名到什麼時候；有類型就一種一列；其他是一句現況", () => {
  const open = PUB.signupHTML(E, null, "zh");
  assert.equal(open, '<a class="cta ev-go" href="../apply/?f=f1">立即報名</a><p class="ev-note">還有 28 個名額・報名到 2026.12.31（四）23:59 截止</p><p class="ev-note">報名要先登入，一分鐘。</p>');
  assert.equal(PUB.signupHTML(E, null, "en"), '<a class="cta ev-go" href="../apply/?f=f1">Register now</a><p class="ev-note">28 places left・Sign-up closes 2026.12.31 (Thu) 23:59</p><p class="ev-note">Signing up takes a one-minute login.</p>');
  assert.equal(PUB.signupHTML({ ...E, capacity: 0, signup_closes_at: null }, null, "zh"), '<a class="cta ev-go" href="../apply/?f=f1">立即報名</a><p class="ev-note">報名要先登入，一分鐘。</p>', "沒有名額也沒有截止時間：只有按鈕與那一句");
  assert.match(PUB.signupHTML({ ...E, signed_up: 99 }, null, "zh"), /還有 0 個名額/, "不會印負的");
  const types = PUB.signupHTML(E, X, "zh");
  assert.match(types, /^<b class="ev-card-h">報名類型<\/b><ul class="ev-types"><li>[\s\S]*<a class="cta" href="\.\.\/apply\/\?f=f1&amp;ticket=11111111-1111-4111-8111-111111111111">報名<\/a><\/li><\/ul><p class="ev-note">還有 28 個名額/);
  assert.doesNotMatch(types, /ev-go/, "有類型就沒有那一顆大的「立即報名」");
  assert.equal(PUB.signupHTML({ ...E, is_full: true }, X, "zh"), '<p class="ev-note"><b>額滿</b>・12 / 40 人</p>');
  assert.equal(PUB.signupHTML({ ...E, is_past: true }, X, "en"), '<p class="ev-note"><b>Ended</b>・12 / 40 signed up</p>');
  assert.match(PUB.signupHTML({ ...E, signup_open: false, signup_opens_at: "2099-01-01T00:00:00Z" }, null, "zh"), /<b>20(98|99)-\d\d-\d\d \d\d:\d\d 開放報名<\/b>/);
  assert.match(PUB.signupHTML({ ...E, signup_open: false }, null, "zh"), /<b>報名已截止<\/b>/);
  assert.equal(PUB.signupHTML({ ...E, form_id: null }, X, "zh"), "");
});

test("★ 手機最下面那一條：現在報得了名才有；一顆「立即報名」直接去報名，有類型的時候是按鈕、捲到卡片上的類型", () => {
  const one = PUB.detailHTML(E, "zh", null, { url: URL_ });
  assert.match(one, /<div class="ev-bar"><span class="ev-bar-t"><b>Overseas Unpacked<\/b><span>2027\.01\.03（日）09:00 - 17:00（台灣時間）<\/span><\/span><a class="cta" href="\.\.\/apply\/\?f=f1">立即報名<\/a><\/div>\s*<\/article>$/);
  const types = PUB.detailHTML(E, "zh", X, { url: URL_ });
  assert.match(types, /<div class="ev-bar">[\s\S]*<button type="button" class="cta" data-act="to-signup">立即報名<\/button><\/div>/);
  assert.match(PUB.detailHTML(E, "en", X, { url: URL_ }), /data-act="to-signup">Register now<\/button>/);
  for (const closed of [{ ...E, is_full: true }, { ...E, is_past: true }, { ...E, signup_open: false }, { ...E, form_id: null }]) assert.doesNotMatch(PUB.detailHTML(closed, "zh", X, { url: URL_ }), /ev-bar|has-bar/);
  assert.match(PUB.detailHTML({ ...E, edition_zh: '<b>"壞"</b>', edition_en: "" }, "zh", null, {}), /<span class="ev-bar-t"><b>&lt;b&gt;&quot;壞&quot;&lt;\/b&gt;<\/b>/, "名稱逃脫");
});

test("★ 照片是橫的一排：左右兩顆是有名字的真按鈕、那一排鍵盤也捲得到、每一張捲到才載；壞掉的只拿掉那一張", () => {
  const h = PUB.galleryHTML(X, "zh");
  assert.match(h, /^<h3>活動照片<\/h3><div class="ev-strip"><button type="button" class="ev-strip-b" data-act="strip" data-dir="-1" aria-label="看前面的照片">←<\/button><ul class="ev-strip-list" tabindex="0" aria-label="活動照片">/);
  assert.match(h, /<\/ul><button type="button" class="ev-strip-b" data-act="strip" data-dir="1" aria-label="看後面的照片">→<\/button><\/div>$/);
  assert.equal(count(h, /<li><img src="https:\/\/x\/[12]\.jpg" alt="" loading="lazy" decoding="async" onerror="this\.closest\('li'\)\.remove\(\)"><\/li>/g), 2);
  const en = PUB.galleryHTML(X, "en");
  assert.match(en, /<h3>Photos<\/h3>/); assert.match(en, /aria-label="Previous photos"/); assert.match(en, /aria-label="Next photos"/);
  assert.equal(PUB.galleryHTML({ photos: [] }, "zh"), ""); assert.equal(PUB.galleryHTML(null, "en"), "");
});

// ── 5. 後台：工具列、預覽 ──────────────────────────────────────────────
test("★ 工具列，一行裡面的：把選到的字包起來，選取範圍連記號一起；再按一次拿掉；沒選字放一組空的、游標在中間", () => {
  const t = "費用是完全免費的";
  assert.deepEqual(F.evFmtApply(t, 3, 7, "b"), { text: "費用是**完全免費**的", start: 3, end: 11 });
  assert.deepEqual(F.evFmtApply(t, 3, 7, "hl"), { text: "費用是==完全免費==的", start: 3, end: 11 });
  assert.deepEqual(F.evFmtApply(t, 3, 7, "hl2"), { text: "費用是{{完全免費}}的", start: 3, end: 11 });
  assert.deepEqual(F.evFmtApply(t, 3, 7, "c"), { text: "費用是[[完全免費]]的", start: 3, end: 11 });
  // 再按一次同一顆（選取範圍連記號一起）就是拿掉
  assert.deepEqual(F.evFmtApply("費用是**完全免費**的", 3, 11, "b"), { text: t, start: 3, end: 7 });
  assert.deepEqual(F.evFmtApply("費用是{{完全免費}}的", 3, 11, "hl2"), { text: t, start: 3, end: 7 });
  // 只選到裡面的字、外面剛好已經包著同一組，也是拿掉
  assert.deepEqual(F.evFmtApply("費用是==完全免費==的", 5, 9, "hl"), { text: t, start: 3, end: 7 });
  // 已經是粗體的字再加螢光：包在外面，兩種都在
  assert.deepEqual(F.evFmtApply("費用是**完全免費**的", 3, 11, "hl"), { text: "費用是==**完全免費**==的", start: 3, end: 15 });
  assert.equal(PUB.richText("費用是==**完全免費**==的"), "<p>費用是<mark><b>完全免費</b></mark>的</p>", "按出來的東西對外頁認得");
  // 沒選字
  assert.deepEqual(F.evFmtApply(t, 3, 3, "b"), { text: "費用是****完全免費的", start: 5, end: 5 });
  assert.deepEqual(F.evFmtApply("", 0, 0, "c"), { text: "[[]]", start: 2, end: 2 });
  // 選到的字前後的空白留在記號外面（記號貼著字，對外頁才認）
  assert.deepEqual(F.evFmtApply("a  完全免費  b", 1, 9, "b"), { text: "a  **完全免費**  b", start: 1, end: 13 });
  // 選了好幾行：一行一行包，空白行不動
  assert.deepEqual(F.evFmtApply("第一行\n\n第二行", 0, 8, "hl"), { text: "==第一行==\n\n==第二行==", start: 0, end: 16 });
  assert.equal(PUB.richText("==第一行==\n\n==第二行=="), "<p><mark>第一行</mark></p><p><mark>第二行</mark></p>");
});

test("★ 工具列，整行的：選到的每一行行首加記號；本來是別種就換掉；全部都是這一種就拿掉；沒選字是游標那一行", () => {
  const t = "活動資訊\n第一點\n第二點\n結尾";
  assert.deepEqual(F.evFmtApply(t, 2, 2, "h2"), { text: "## 活動資訊\n第一點\n第二點\n結尾", start: 0, end: 7 }, "游標在第一行中間：整行變大標題");
  assert.deepEqual(F.evFmtApply(t, 5, 12, "ul"), { text: "活動資訊\n- 第一點\n- 第二點\n結尾", start: 5, end: 16 }, "選了兩行：兩行都變清單");
  assert.deepEqual(F.evFmtApply("活動資訊\n- 第一點\n- 第二點\n結尾", 5, 16, "ul"), { text: t, start: 5, end: 12 }, "再按一次拿掉");
  assert.deepEqual(F.evFmtApply("活動資訊\n- 第一點\n- 第二點\n結尾", 5, 16, "q"), { text: "活動資訊\n> 第一點\n> 第二點\n結尾", start: 5, end: 16 }, "清單換成引言：記號換掉，不會疊在一起");
  assert.deepEqual(F.evFmtApply("## 活動資訊", 0, 0, "h3"), { text: "### 活動資訊", start: 0, end: 8 }, "大標題換成小標題");
  assert.deepEqual(F.evFmtApply("### 活動資訊", 4, 4, "h2"), { text: "## 活動資訊", start: 0, end: 7 }, "小標題換成大標題（### 不會被當成已經是 ##）");
  assert.deepEqual(F.evFmtApply("## 活動資訊", 3, 7, "h2"), { text: "活動資訊", start: 0, end: 4 }, "已經是大標題再按一次：拿掉");
  assert.deepEqual(F.evFmtApply("- 一\n二", 0, 5, "ul"), { text: "- 一\n- 二", start: 0, end: 7 }, "有一行還不是清單：全部變成清單，不是拿掉");
  assert.deepEqual(F.evFmtApply("一\n\n二", 0, 4, "q"), { text: "> 一\n\n> 二", start: 0, end: 8 }, "中間的空白行不動");
  assert.deepEqual(F.evFmtApply("一\n二\n三", 0, 2, "ul"), { text: "- 一\n二\n三", start: 0, end: 3 }, "選取剛好停在下一行的行首：下一行不算");
  assert.deepEqual(F.evFmtApply("", 0, 0, "ul"), { text: "- ", start: 2, end: 2 }, "空的格子：放記號，游標在後面");
  assert.deepEqual(F.evFmtApply("一\n\n二", 2, 2, "h2"), { text: "一\n## \n二", start: 5, end: 5 }, "游標在空白行：那一行放記號");
  assert.deepEqual(F.evFmtApply("  有縮排", 0, 5, "h2"), { text: "## 有縮排", start: 0, end: 6 }, "行首的空白拿掉（對外頁本來就不看）");
  assert.equal(PUB.richText(F.evFmtApply(t, 5, 12, "ul").text), "<p>活動資訊</p><ul><li>第一點</li><li>第二點</li></ul><p>結尾</p>", "按出來的東西對外頁認得");
  // 亂給的值不會壞
  assert.deepEqual(F.evFmtApply("abc", 99, -5, "b"), { text: "abc****", start: 5, end: 5 });
  assert.deepEqual(F.evFmtApply("abc", 1, 2, "nope"), { text: "abc", start: 1, end: 2 });
  assert.deepEqual(F.evFmtApply(null, 0, 0, "b"), { text: "****", start: 2, end: 2 });
  assert.deepEqual(F.EV_FMT.map(f => f.k), ["h2", "h3", "b", "hl", "hl2", "c", "ul", "q"], "八顆：大標題、小標題、粗體、兩種螢光、藍底橘字、清單、引言");
});

test("★ 後台說明那一格：上面八顆真的按鈕、下面一行提示、最下面是預覽；中英兩格都有；唯讀的人只有字", () => {
  const ev = { id: "e1", body_zh: "## 活動資訊\n==免費==", body_en: "" };
  const zh = F.eventDescHTML(ev, "zh", true, false), en = F.eventDescHTML(ev, "en", true, false);
  assert.match(zh, /^<div class="ev-desc"><label for="ev-bzh"><i>說明（中）<\/i><\/label><div class="ev-tb" role="toolbar" aria-label="排版的按鈕">/);
  assert.equal(count(zh, /<button type="button" class="ev-tb-b" data-act="ev-fmt" data-k="[a-z0-9]+" data-for="ev-bzh" title="[^"]+">[^<]+<\/button>/g), 8);
  for (const [k, label] of [["h2", "大標題"], ["h3", "小標題"], ["b", "粗體"], ["hl", "橘色螢光"], ["hl2", "綠色螢光"], ["c", "藍底橘字"], ["ul", "清單"], ["q", "引言"]])
    assert.match(zh, new RegExp(`data-k="${k}" data-for="ev-bzh" title="[^"]+">${label}</button>`), `少了 ${label}`);
  assert.match(zh, /<textarea id="ev-bzh" name="body_zh" style="min-height:170px">## 活動資訊\n==免費==<\/textarea>/, "打字那一格的 id 與 name 沒變（自動儲存與 readEvent 照舊）");
  assert.match(zh, /<div class="ev-prev"><i>對外頁上會長這樣<\/i><div class="ev-rt" id="ev-bzh-prev"><h3>活動資訊<\/h3><p><mark>免費<\/mark><\/p><\/div><\/div><\/div>$/);
  assert.match(en, /<label for="ev-ben"><i>說明（英）<\/i><\/label>/); assert.equal(count(en, /data-for="ev-ben"/g), 8);
  assert.match(en, /<textarea id="ev-ben" name="body_en"/); assert.match(en, /id="ev-ben-prev"><p class="mini">還沒有字。<\/p><\/div>/, "沒有字的時候預覽是一句話");
  assert.equal(F.evPreviewHTML("**粗**"), "<p><b>粗</b></p>"); assert.equal(F.evPreviewHTML(""), '<p class="mini">還沒有字。</p>');
  assert.match(F.eventDescHTML({ id: "e1", body_zh: "<script>x</script>" }, "zh", true, false), /<textarea[^>]*>&lt;script&gt;x&lt;\/script&gt;<\/textarea>[\s\S]*id="ev-bzh-prev"><p>&lt;script&gt;x&lt;\/script&gt;<\/p>/, "預覽裡打的 HTML 也只是字");
  const ro = F.eventDescHTML(ev, "zh", false, false);
  assert.doesNotMatch(ro, /ev-tb|ev-prev|ev-fmt|class="mini"/); assert.match(ro, /<textarea id="ev-bzh" name="body_zh" style="min-height:170px" readonly>/);
  assert.equal(count(F.eventDescHTML(ev, "zh", true, true), /data-for="ev-bzh" title="[^"]+" disabled>/g), 8, "忙的時候按鈕按不了");
  // 字典：八顆的名字與說明中英都有，沒有破折號與 emoji
  const keys = ["ev.fmt.bar", "ev.prev", "ev.prevEmpty", "ev.bodyHelp", ...F.EV_FMT.flatMap(f => ["ev.fmt." + f.k, "ev.fmt.tip." + f.k])];
  for (const k of keys) { assert.ok(FS.STRINGS[k] && FS.STRINGS[k].zh && FS.STRINGS[k].en, `字典裡沒有 ${k}`); for (const l of ["zh", "en"]) { assert.doesNotMatch(FS.STRINGS[k][l], /[—–]/, `${k} 有破折號`); assert.doesNotMatch(FS.STRINGS[k][l], /\p{Extended_Pictographic}/u, `${k} 有 emoji`); } }
  F.setLang("en"); assert.match(F.eventDescHTML(ev, "en", true, false), />Heading<\/button>[\s\S]*>Orange on navy<\/button>[\s\S]*<i>How it will look on the public page<\/i>/); F.setLang("zh");
});

test("★ 後台 main.js：按工具列的按鈕改字、留住選取、丟一個 input（自動儲存與預覽都聽它）；打字的時候只換預覽那一格", () => {
  const m = read("admin/src/main.js"), css = read("admin/admin.css");
  assert.match(m, /if \(act === "ev-fmt"\) \{\s*const ta = document\.getElementById\(b\.dataset\.for\); if \(!ta \|\| ta\.readOnly \|\| ta\.disabled\) return;\s*const r = UI\.evFmtApply\(ta\.value, ta\.selectionStart, ta\.selectionEnd, b\.dataset\.k\);\s*ta\.value = r\.text; ta\.focus\(\); ta\.setSelectionRange\(r\.start, r\.end\);\s*ta\.dispatchEvent\(new Event\("input", \{ bubbles: true \}\)\);/);
  assert.match(m, /if \(S\.view === "event" && e\.target && \(e\.target\.id === "ev-bzh" \|\| e\.target\.id === "ev-ben"\)\) \{\s*const prev = document\.getElementById\(e\.target\.id \+ "-prev"\); if \(prev\) prev\.innerHTML = UI\.evPreviewHTML\(e\.target\.value\);/);
  assert.match(read("admin/src/ui.js"), /root\.addEventListener\("input", e => \{ const m = saveMode\(e\.target\); if \(m === "typed"\) schedule\(e\.target, false\); \}\);/, "自動儲存聽的就是 input");
  const block = css.slice(css.indexOf("/* 說明那一格（2026-11-23）"), css.indexOf("/* 講者與報名類型（2027-01-02）"));
  assert.ok(block.length > 1500, "抓得到這一批的樣式");
  for (const sel of [".ev-tb-b{", ".ev-rt h3{", ".ev-rt h4{", ".ev-rt mark{", ".ev-rt mark.hl2{", ".ev-rt .rt-c{", ".ev-rt blockquote{"]) assert.ok(block.includes(sel), `少了 ${sel}`);
  for (const c of block.match(/rgba\([^)]*\)/g) || []) assert.match(c, /^rgba\((16,42,134|255,255,255),/, `${c} 不是品牌色`);
  assert.doesNotMatch(block, /#[0-9a-fA-F]{3,8}\b/, "不寫死色碼");
});

// ── 6. 約定 ────────────────────────────────────────────────────────────
test("★ 對外 main.js：一場活動等資料回來才畫（版面不會再跳）、清單不用等、網址上有代號就跟清單同時問；行事曆檔在瀏覽器裡產生", () => {
  const m = read("events/src/main.js");
  assert.match(m, /const \[events\] = await Promise\.all\(\[load\(\), slug \? loadExtras\(slug\) : null\]\);/, "兩個同時問，不多等一趟");
  assert.match(m, /if \(!slug\) \{ paint\(cache, "", null\); shown = ""; return; \}\s*const x = \(cache \|\| \[\]\)\.some\(v => v\.slug === slug\) \? await loadExtras\(slug\) : null;\s*if \(slugOf\(\) !== slug\) return;\s*paint\(cache, slug, x\);/, "等的時候人已經換到別場，就不畫");
  assert.match(m, /if \(shown !== null && shown !== slug\) window\.scrollTo\(\{ top: 0, behavior: "auto" \}\);/, "從清單點進來回到最上面（第一次載入不動）");
  assert.match(m, /if \(extras\.has\(slug\)\) return extras\.get\(slug\);/, "問過的不再問（換語言、按上一頁）");
  assert.match(m, /UI\.detailHTML\(e, l, x, \{ url: pageUrl\(slug\) \}\)/);
  assert.match(m, /const pageUrl = slug => location\.origin \+ location\.pathname \+ "#" \+ slug;/, "行事曆裡的網址不帶 ?lang=");
  assert.match(m, /document\.documentElement\.classList\.toggle\("ev-single", !!slug\);/); assert.match(m, /classList\.toggle\("ev-bar-on", !!document\.querySelector\("\.ev-page\.has-bar"\)\);/);
  assert.match(m, /if \(c\) download\(`\$\{e\.slug\}\.ics`, UI\.icsText\(c\), "text\/calendar;charset=utf-8"\);/);
  assert.match(m, /URL\.createObjectURL\(new Blob\(\[text\], \{ type \}\)\)/, "檔案是瀏覽器自己產生的");
  assert.equal(count(m, /fetch\(/g), 1, "只有打 Supabase 那一個 fetch，行事曆沒有打任何伺服器");
  assert.match(m, /const reduce = typeof matchMedia === "function" && matchMedia\("\(prefers-reduced-motion: reduce\)"\)\.matches;/);
  assert.equal(count(m, /behavior: reduce \? "auto" : "smooth"/g), 2, "照片往前往後與捲到報名類型，開了減少動態效果都是直接跳");
  assert.match(m, /if \(typeof window\.btKeepLang === "function"\) window\.btKeepLang\(\);/, "新畫的連結補上語言");
  assert.doesNotMatch(m, /sb_publishable_|supabase\.co|localStorage|sessionStorage/);
});

test("★ index.html：一場活動那一頁沒有最上面那一大塊標題；桌機兩欄、卡片黏在頂欄下面；手機一條固定的報名、頁尾多留一段", () => {
  const page = read("events/index.html");
  assert.equal(count(page, /<header class="hero ev-list-hero">/g), 2, "清單的大標題中英各一塊，還在（清單那一頁照舊）");
  assert.match(page, /html\.ev-single \.ev-list-hero\{display:none\}/);
  assert.match(page, /if \(location\.hash\.slice\(1\)\.split\("\?"\)\[0\] \|\| new URLSearchParams\(location\.search\)\.get\("e"\)\) document\.documentElement\.classList\.add\("ev-single"\);/, "<head> 先判斷，那一塊不會閃一下");
  assert.ok(page.indexOf('classList.add("ev-single")') < page.indexOf("<style>"), "在樣式之前就決定了");
  assert.match(page, /@media \(min-width:900px\)\{\s*\.ev-grid\{grid-template-columns:minmax\(0,1fr\) minmax\(300px,360px\);grid-template-areas:"head side" "rest side";/);
  assert.match(page, /\.ev-side\{grid-area:side;align-self:stretch\}\s*\.ev-card2\{position:sticky;top:92px;/, "卡片那一欄撐滿兩列，卡才有地方黏");
  assert.match(page, /\.ev-grid\{display:grid;grid-template-columns:minmax\(0,1fr\);gap:22px\}/, "手機一欄，順序就是 DOM 的順序");
  assert.match(page, /\.ev-head h1\{font-size:clamp\(28px,3\.8vw,48px\)/, "活動名稱比清單的大標題（最大 96px）收斂");
  assert.match(page, /\.ev-bar\{display:none\}\s*@media \(max-width:899px\)\{[\s\S]*?\.ev-bar\{display:flex;[^}]*position:fixed;left:0;right:0;bottom:0;/);
  assert.match(page, /html\.ev-bar-on footer\{padding-bottom:calc\(clamp\(44px,7vh,84px\) \+ 76px \+ env\(safe-area-inset-bottom\)\)\}/, "頁尾多留一段，最下面的連結不會被那一條蓋住");
  assert.match(page, /\.sec-in\{display:grid;grid-template-columns:minmax\(0,\.62fr\) minmax\(0,1\.38fr\);/, "清單用的兩欄那一條沒有動");
  assert.doesNotMatch(page, /\.ev-one |ev-cover-sec/, "上一版一欄的樣式拿掉了");
});

test("★ index.html：說明的樣式、照片那一排、減少動態效果；這一批只用品牌色", () => {
  const page = read("events/index.html");
  for (const sel of [".ev-text h4{", ".ev-text mark{", ".ev-text mark.hl2{", ".ev-text .rt-c{", ".ev-text blockquote{", ".ev-text ul{"]) assert.ok(page.includes(sel), `少了 ${sel}`);
  assert.match(page, /\.ev-text h3,\.ev-speakers h3,\.ev-photos h3\{[^}]*border-left:6px solid var\(--bt-orange\)\}/, "大標題左邊一道橘色，講者與照片的標題同一個樣子");
  assert.match(page, /\.ev-text mark\{background:var\(--bt-orange\);color:var\(--ink\);/, "橘色只當底色，字是深藍");
  assert.match(page, /\.ev-text mark\.hl2\{background:var\(--bt-teal\)\}/);
  assert.match(page, /\.ev-text \.rt-c\{background:var\(--bt-navy\);color:var\(--bt-orange\);/, "「不同顏色的字」是深藍底配橘字");
  assert.doesNotMatch(page, /\.ev-text (mark|h3|h4|p|li|ul|blockquote)[^{]*\{[^}]*[;{]color:var\(--bt-(orange|teal|yellow|sand)\)/, "淺色不直接當米白底上的字色");
  assert.match(page, /\.ev-strip-list\{[^}]*overflow-x:auto;[^}]*scroll-snap-type:x mandatory;scroll-behavior:smooth;/);
  assert.match(page, /\.ev-strip-list li\{flex:none;width:min\(78%,440px\);aspect-ratio:4\/3;scroll-snap-align:start;/, "每一格固定 4:3，照片還沒載到版面也不會跳");
  assert.match(page, /\.ev-strip-b\{display:none\}\s*@media \(min-width:900px\)\{\s*\.ev-strip-b\{display:flex;/, "左右的按鈕桌機才出現");
  assert.match(page, /@media \(prefers-reduced-motion:reduce\)\{\.ev-strip-list\{scroll-behavior:auto\}\}/);
  assert.match(page, /@media \(prefers-reduced-motion:reduce\)\{html\{scroll-behavior:auto\}\*\{animation:none!important;transition:none!important\}\}/, "整頁原本那一條還在");
  const block = page.slice(page.indexOf("/* ───────── 一場活動那一頁（2026-11-23 重排"), page.indexOf("/* ═════════ 頂欄那顆橘色按鈕與頁尾的全站連結"));
  assert.ok(block.length > 6000, "抓得到這一批的樣式");
  for (const c of block.match(/rgba\([^)]*\)/g) || []) assert.match(c, /^rgba\((16,42,134|255,196,108|255,255,255|237,229,216),/, `${c} 不是品牌色`);
  assert.doesNotMatch(block, /#[0-9a-fA-F]{3,8}\b/, "不寫死色碼");
  assert.doesNotMatch(block, /transition:|animation:|@keyframes/, "這一批沒有加任何過渡或動畫");
});
