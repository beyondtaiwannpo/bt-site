// 活動與計畫（/programs/）、對外頁共用的 shared/public.js、2026-11-21 那次重整的幾條不能壞的事。跑法：node --test test/*.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as L from "../programs/src/logic.js";

const NOW = new Date("2026-11-21T04:00:00Z");
const f = (id, title, extra) => Object.assign({ id, kind: "program", status: "open", title, opens_at: null, closes_at: null }, extra);

test("認計畫：看標題裡的關鍵字，中英都認，認不出來回空字串", () => {
  assert.equal(L.progOf("2027 寒假探索營報名"), "bootcamp");
  assert.equal(L.progOf("College Bootcamp Winter 2027"), "bootcamp");
  assert.equal(L.progOf("導生配對計畫 2027 春"), "mentorship");
  assert.equal(L.progOf("Mentorship Program application"), "mentorship");
  assert.equal(L.progOf("高中生實習計劃 第三期"), "internship");
  assert.equal(L.progOf("留學說明會"), "talks");
  assert.equal(L.progOf("校友之夜"), "");
  assert.equal(L.progOf(null), "");
});

test("開放中的表單：只算給高中生的、過了開放時間、還沒截止；幹部招募不算", () => {
  const forms = [f("a", "探索營"), f("b", "幹部招募", { kind: "board" }), f("c", "導生", { opens_at: "2026-12-01T00:00:00Z" }),
    f("d", "實習", { closes_at: "2026-11-20T00:00:00Z" }), f("e", "講座", { status: "closed" }), f("g", "導生", { closes_at: "2026-12-05T15:59:00Z" })];
  assert.deepEqual(L.openForms(forms, NOW).map(x => x.id), ["a", "g"]);
  assert.deepEqual(L.openForms(null, NOW), []);
});

test("下一輪：三月到八月說八月，九月到二月說二月（每個 team 學期開始開一輪）", () => {
  const m = d => L.nextTerm(new Date(d));
  assert.equal(m("2026-11-21T00:00:00"), 2); assert.equal(m("2027-01-15T00:00:00"), 2); assert.equal(m("2027-02-10T00:00:00"), 2);
  assert.equal(m("2027-03-01T00:00:00"), 8); assert.equal(m("2027-08-20T00:00:00"), 8); assert.equal(m("2027-09-01T00:00:00"), 2);
  assert.equal(L.termLabel(2, false), "下一輪大約二月開放"); assert.equal(L.termLabel(8, true), "Next round opens around August");
});

test("★ 每張卡的狀態：對到的亮、掛在活動上的表單不算計畫的、同一個計畫兩份取先截止的", () => {
  const forms = [f("late", "探索營 夏", { closes_at: "2027-01-10T00:00:00Z" }), f("soon", "探索營 冬", { closes_at: "2026-12-01T00:00:00Z" }),
    f("ev", "導生說明會報名"), f("x", "校友之夜")];
  const events = [{ form_id: "ev" }];
  const st = L.statusByProg(forms, events, NOW);
  assert.equal(st.bootcamp.form.id, "soon");
  assert.equal(st.mentorship, null, "那份表單是某一場活動的報名表，跟著活動卡走");
  assert.equal(st.internship, null); assert.equal(st.talks, null);
  assert.deepEqual(L.looseForms(forms, events, NOW).map(x => x.id).sort(), ["late", "soon", "x"], "認不出來的表單照樣排在最上面，不會不見");
});

test("截止日期一律用台灣的日期", () => {
  assert.equal(L.fmtDay("2026-12-05T15:59:00Z", false), "12 月 5 日");
  assert.equal(L.fmtDay("2026-12-05T16:01:00Z", true), "6 Dec");
  assert.equal(L.fmtDay("not a date", true), "");
});

test("★ /programs/：四張卡都在、每張有狀態與通知按鈕、沒有資料庫也讀得完、語言切換不吃掉 ?f=", () => {
  const h = readFileSync("programs/index.html", "utf8");
  for (const k of L.PROGS) assert.equal((h.match(new RegExp(`<article class="prog" data-prog="${k}">`, "g")) || []).length, 2, k + " 中英各一張");
  assert.equal((h.match(/<p class="prog-st">/g) || []).length, 8);
  assert.equal((h.match(/<p class="prog-act"><a class="cta sm" href="\.\.\/app\/(\?lang=en)?">/g) || []).length, 8, "沒開的時候每張卡都有「開放時通知我」");
  assert.match(h, /<div class="body" id="open-zh">\s*<p>/, "問不到資料的時候「現在開放」那一段有字");
  assert.match(h, /u\.searchParams\.set\("lang", l\)/, "只改 lang，不把 ? 後面整段換掉");
  assert.match(h, /<script type="module" src="\.\/src\/main\.js"><\/script>/);
  const main = readFileSync("programs/src/main.js", "utf8");
  assert.doesNotMatch(main, /sb_publishable_|supabase\.co|shared\/supabase\.js/, "不抄金鑰、不載 supabase-js");
  assert.match(main, /status=eq\.open/);
});

test("★ 信念、使命、願景、價值：Paul 2026-11-21 的定稿，首頁與 /about/ 一字不差", () => {
  const home = readFileSync("index.html", "utf8"), about = readFileSync("about/index.html", "utf8");
  const BELIEF = ["我們相信，人人都有選擇自己教育的權利。", "We believe that everyone has the right to choose their own education."];
  for (const s of BELIEF) { assert.ok(home.includes(`<h1>${s}</h1>`), "首頁大標題：" + s); assert.ok(about.includes(`<h1>${s}</h1>`), "/about/ 大標題：" + s); }
  const VALUES = ["你無法選擇你從未看見的東西。", "選擇的權利，不該取決於出身或家庭的資源。", "沒有人該獨自摸索。走過的人，拉下一個人一把。",
    "You can't choose what you've never seen.", "The right to choose shouldn't depend on where you come from or what your family has.",
    "No one should have to figure it out alone. Those who've walked the road pull the next person up."];
  const VISION = ["一個台灣，升學不再只有一條路。每個學生，無論來自哪裡，都能看見自己的選項，並擁有選擇的權利與勇氣。",
    "A Taiwan where success is no longer defined by a single path, where every student, wherever they come from, can see their options and has the right, and the courage, to choose."];
  for (const s of [...VALUES, ...VISION]) { assert.ok(home.includes(s), "首頁少了：" + s); assert.ok(about.includes(s), "/about/ 少了：" + s); }
  for (const s of ["因此，我們為台灣公立學校的學生打開被忽略的可能，讓他們看見「唯一一條路」之外的選項。那可能是走向世界去留學，也可能是留在台灣，用更開闊的方式學習與生活。",
    "我們同時維繫一個由「選擇了自己道路的人」所組成的社群，讓走過的人成為後來者的引路人，也讓這個網絡長久地延續下去。",
    "Therefore, we help students in Taiwan's public schools discover the possibilities they were never shown: the options beyond the single path they'd been told to follow.",
    "And we're building a lasting community of people who chose their own path, where those who went before can guide the ones coming after."]) assert.ok(about.includes(s), "/about/ 的使命少了：" + s);
  for (const s of ["never shown —", "single path —"]) assert.ok(!about.includes(s) && !home.includes(s), "英文的使命與願景不用破折號（Paul 同意換成冒號與逗號）");
});

test("★ 首頁搬走的六段長文，每一句都還在某一個內頁上", () => {
  const pages = ["about", "programs", "team", "partner"].map(d => readFileSync(d + "/index.html", "utf8")).join("\n") + readFileSync("index.html", "utf8");
  for (const s of ["這不完全是錯覺。留學代辦的費用不低", "於是很多人在還沒認真了解之前，就先把這個選項刪掉了。", "Beyond Taiwan 處理的就是這一段落差。",
    "我們會事先問你想讀什麼，再去找對應背景的人回來。", "有些配對從申請季開始，到現在超過兩年還在聯絡。",
    "多數人只比你早走一兩步，有些人剛申請完不久，還記得那種不知道從哪裡開始的感覺。", "追蹤 <a href=\"https://www.instagram.com/beyondtaiwan/\">@beyondtaiwan</a>，或直接私訊問我們，看到都會回。",
    "我們持續在找願意一起做這件事的個人、企業與學校。", "That impression is not baseless.", "That gap is the reason Beyond Taiwan exists.",
    "Some finished their own applications recently enough to still remember not knowing where to start.", "We read everything.",
    "收到超過 150 份申請，協助超過 100 位國內高中生"]) assert.ok(pages.includes(s), "找不到：" + s);
});

test("★ 首頁的動畫：三個價值那一段不動的時候四句都看得到；module 只發訊號不碰動畫", () => {
  const h = readFileSync("index.html", "utf8");
  assert.equal((h.match(/<article class="val( val-vision)?">/g) || []).length, 4);
  assert.match(h, /vals\.classList\.add\("vals-on"\)/, "疊在一起的版面是 motion() 加的 class，不是預設");
  assert.doesNotMatch(h.slice(0, h.indexOf("</style>")).replace(/\.vals-on[^{]*\{[^}]*\}/g, ""), /\.val\{[^}]*position:absolute/, "預設的 .val 不是疊在一起的");
  assert.match(h, /document\.dispatchEvent\(new Event\("bt:layout"\)\)/);
  assert.doesNotMatch(h, /<script type="module">[\s\S]*ScrollTrigger/, "首頁的 module 不碰動畫");
});

test("★ shared/public.js：募資橫條預設關著、日期含頭含尾、開了減少動態效果就不動", () => {
  const src = readFileSync("shared/public.js", "utf8");
  assert.match(src, /url: "",/, "網址是空的，橫條不出現");
  assert.match(src, /from: "2027-01-26", to: "2027-04-21"/);
  assert.ok(src.indexOf("if (reduce ||") < src.indexOf("new IntersectionObserver("), "先看 reduce 再做任何會動的事");
  assert.match(src, /if \(el\.getBoundingClientRect\(\)\.top < vh \* 0\.92\) continue;/, "一開頁就看得到的東西不藏");
});

test("★ BT 島掛的是全站那一條頂欄；語言鈕還是同一顆", () => {
  const h = readFileSync("island/index.html", "utf8"), css = readFileSync("island/island.css", "utf8");
  assert.match(h, /<nav class="topbar" aria-label="網站導覽">\s*<a class="home" id="home" href="\.\.\/"/);
  assert.equal((h.match(/id="lang"/g) || []).length, 1); assert.equal((h.match(/id="home"/g) || []).length, 1);
  assert.match(h, /<div class="navlinks" id="navlinks">\s*<a class="nav-cta" href="\.\.\/programs\/"><svg class="flame"/, "活動與計畫排第一個，前面是畫出來的火");
  assert.doesNotMatch(css, /\.navlinks \.nav-cta\{[^}]*background:var\(--bt-orange\)/, "不是橘色藥丸");
  assert.match(css, /\.topbar\{position:fixed;top:12px;left:var\(--gut\);right:calc\(var\(--side-w\) \+ var\(--gut\)\)/);
  assert.match(css, /\.brand,\.toolbar\{background:linear-gradient\(180deg,rgba\(255,255,255,\.78\),rgba\(237,229,216,\.6\)\);backdrop-filter:blur\(20px\) saturate\(180%\)/, "牌子與工具列跟頂欄同一種玻璃");
});
