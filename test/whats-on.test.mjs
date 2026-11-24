// 對外頁的結構（2026-11-21 兩次重整、2026-11-22 拆掉 /programs/ 加上 /year/）幾條不能壞的事。跑法：node --test test/*.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import * as L from "../year/src/logic.js";
import { rowHTML } from "../team/src/programmes.js";
import { split, fmtWhen, names, whenText, cardHTML, detailHTML } from "../events/src/ui.js";
import * as AP from "../apply/src/ui.js";

const NOW = new Date("2026-11-22T04:00:00Z");
const f = (id, title, extra) => Object.assign({ id, kind: "program", status: "open", title, opens_at: null, closes_at: null }, extra);
const ev = (slug, team, extra) => Object.assign({ slug, team, title_zh: slug, title_en: slug, starts_at: null, ends_at: null, is_past: false, signup_open: false, is_full: false, form_id: null }, extra);

test("開放中的表單：只算給高中生的、過了開放時間、還沒截止；掛在活動上的由活動卡帶", () => {
  const forms = [f("a", "探索營"), f("b", "幹部招募", { kind: "board" }), f("c", "導生", { opens_at: "2026-12-01T00:00:00Z" }),
    f("d", "實習", { closes_at: "2026-11-20T00:00:00Z" }), f("e", "講座", { status: "closed" }), f("g", "導生", { closes_at: "2026-12-05T15:59:00Z" })];
  assert.deepEqual(L.openForms(forms, NOW).map(x => x.id), ["a", "g"]);
  assert.deepEqual(L.looseForms(forms, [{ form_id: "a" }], NOW).map(x => x.id), ["g"]);
  assert.deepEqual(L.openForms(null, NOW), []);
});

test("日期一律用台灣的日期", () => {
  assert.equal(L.fmtDay("2026-12-05T15:59:00Z", false), "12 月 5 日");
  assert.equal(L.fmtDay("2026-12-05T16:01:00Z", true), "6 Dec");
  assert.equal(L.fmtDay("not a date", true), "");
});

test("一屆是八月到隔年七月；這一筆算不算這一屆", () => {
  assert.deepEqual(L.TERM, [8, 9, 10, 11, 12, 1, 2, 3, 4, 5, 6, 7]);
  assert.equal(L.termIndex(8), 0); assert.equal(L.termIndex(7), 11); assert.equal(L.termIndex(0), -1);
  assert.equal(L.termStart(NOW), 2026); assert.equal(L.termStart(new Date("2027-03-01T00:00:00Z")), 2026); assert.equal(L.termStart(new Date("2027-08-02T00:00:00Z")), 2027);
  assert.equal(L.inTerm(ev("a", "Curriculum", { starts_at: "2027-01-02T16:00:00Z" }), NOW), true);
  assert.equal(L.inTerm(ev("b", "Curriculum", { starts_at: "2026-06-10T02:00:00Z" }), NOW), false, "上一屆六月的不算");
  assert.equal(L.inTerm(ev("c", "Curriculum", { starts_at: "2027-08-05T02:00:00Z" }), NOW), false, "下一屆八月的不算");
  assert.equal(L.inTerm(ev("d", "Curriculum", { usual_month: 10 }), NOW), true, "沒有日期的計畫每一屆都算");
});

test("★ 排在哪個月、什麼狀態、怎麼寫時間", () => {
  const dated = ev("ou", "Curriculum Team", { starts_at: "2027-01-02T16:00:00Z", usual_month: 1, edition_zh: "Overseas Unpacked", edition_en: "Overseas Unpacked", title_zh: "寒假探索營", title_en: "Winter College Bootcamp" });
  assert.equal(L.monthOf(dated), 1, "有日期看日期（台灣 1 月 3 日）");
  assert.equal(L.whenLabel(dated, false), "1 月 3 日"); assert.equal(L.whenLabel(dated, true), "3 Jan");
  assert.deepEqual(L.nameOf(dated, "zh"), { main: "Overseas Unpacked", sub: "寒假探索營" }, "這一屆有自己的名字就用它，計畫的名字放後面");
  const month = ev("intake", "Internship", { usual_month: 8 });
  assert.equal(L.monthOf(month), 8); assert.equal(L.whenLabel(month, false), "大約 8 月"); assert.equal(L.whenLabel(month, true), "Around August");
  assert.equal(L.stateOf(month, NOW), "past", "十一月看八月的，已經過了");
  assert.equal(L.stateOf(ev("x", "CR", { usual_month: 3 }), NOW), "upcoming");
  const none = ev("coffee", "Mentorship");
  assert.equal(L.monthOf(none), 0); assert.equal(L.whenLabel(none, false), ""); assert.equal(L.stateOf(none, NOW), "upcoming");
  assert.deepEqual(L.nameOf(none, "en"), { main: "coffee", sub: "" });
  assert.equal(L.stateOf(ev("o", "CR", { signup_open: true }), NOW), "open");
  assert.equal(L.stateOf(ev("full", "CR", { signup_open: true, is_full: true, starts_at: "2027-02-01T00:00:00Z" }), NOW), "upcoming", "滿了不算報得了名");
  assert.equal(L.stateOf(ev("p", "CR", { starts_at: "2026-09-01T00:00:00Z", is_past: true }), NOW), "past");
  // 那四格是新的：資料庫還沒跑那支遷移檔的時候不會有，不能壞
  assert.equal(L.monthOf({ slug: "old", team: "Curriculum" }), 0); assert.deepEqual(L.nameOf({ title_zh: "舊", title_en: "Old" }, "zh"), { main: "舊", sub: "" });
});

test("六個 team：後台那一格是字，認成六個代號；認不出來不排進去", () => {
  for (const [t, k] of [["Curriculum Team", "curriculum"], ["curriculum", "curriculum"], ["Sponsorship", "sponsorship"], ["Internship Team", "internship"],
    ["Mentorship", "mentorship"], ["Marketing Team", "marketing"], ["CR", "cr"], ["CR Team", "cr"], ["Community Relations", "cr"], ["Board", ""], ["", ""], [null, ""]]) assert.equal(L.teamKey(t), k, String(t));
  assert.deepEqual(L.TEAMS, ["sponsorship", "curriculum", "internship", "mentorship", "marketing", "cr"]);
});

test("★ 這一年的版面：照 team 分列、照月份排、沒有月份的另外放、別屆的不算", () => {
  const evs = [ev("ou", "Curriculum", { starts_at: "2027-01-02T16:00:00Z" }), ev("intake", "Internship", { usual_month: 8 }), ev("match", "Mentorship"),
    ev("talk", "Curriculum", { usual_month: 10 }), ev("old", "Curriculum", { starts_at: "2026-03-01T00:00:00Z", is_past: true }), ev("who", "Board", { usual_month: 9 })];
  const p = L.yearPlan(evs, NOW);
  assert.equal(p.count, 4, "上一屆的與認不出 team 的不算");
  assert.deepEqual(p.teams.curriculum.placed.map(x => x.slug), ["talk", "ou"], "十月排在一月前面（一屆從八月開始）");
  assert.deepEqual(p.teams.mentorship.loose.map(x => x.slug), ["match"]); assert.deepEqual(p.loose.map(x => x.slug), ["match"]);
  assert.deepEqual(p.months[8].map(x => x.slug), ["intake"]); assert.equal(p.teams.internship.placed[0].state, "past");
  assert.equal(L.yearPlan([], NOW).count, 0); assert.equal(L.yearPlan(null, NOW).count, 0);
});

test("★ 團隊頁的固定計畫：只拿勾了「多數年份都會辦」的，這一屆的版本一行", () => {
  const evs = [ev("ou", "Curriculum", { recurring: true, starts_at: "2027-01-02T16:00:00Z", title_zh: "寒假探索營", edition_zh: "Overseas Unpacked" }),
    ev("once", "Curriculum", { usual_month: 10 }), ev("match", "Mentorship", { recurring: true, title_zh: "Mentor 配對" }), ev("intake", "Internship", { recurring: true, usual_month: 8, title_zh: "高中生實習招募" })];
  const by = L.teamProgrammes(evs, NOW);
  assert.deepEqual(by.curriculum.map(x => x.slug), ["ou"]); assert.deepEqual(by.sponsorship, [], "後台還沒有資料的 team 是空的，頁面那一格不出現");
  assert.match(rowHTML(by.curriculum[0], "zh"), /<b>寒假探索營<\/b><span>這一屆：Overseas Unpacked，1 月 3 日<\/span>/);
  assert.match(rowHTML(by.mentorship[0], "zh"), /<b>Mentor 配對<\/b><span>這一屆的時間還沒定<\/span>/);
  assert.match(rowHTML(by.internship[0], "zh"), /這一屆：大約 8 月<em>已結束<\/em>/);
  assert.match(rowHTML(by.curriculum[0], "en"), /href="\.\.\/events\/\?lang=en#ou"/);
});

test("活動卡：只知道日期的不印 00:00；沒有日期的計畫不排進近期活動", () => {
  assert.equal(fmtWhen("2027-01-02T16:00:00Z", null, "zh"), "2027-01-03");
  assert.match(fmtWhen("2027-01-03T06:30:00Z", null, "zh"), /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
  const s = split([{ slug: "a", is_past: false, starts_at: null }, { slug: "b", is_past: false, starts_at: "2099-01-01T00:00:00Z" }]);
  assert.deepEqual(s.upcoming.map(e => e.slug), ["b"]);
});

test("★ 頂欄：十一個檔同一份，現在開放、這一年、團隊、免費資源、關於我們、合作；沒有藥丸也沒有圖示", () => {
  const want = ["apply|現在開放|Open now", "year|活動與計畫|Programmes", "team|團隊|Teams", "resources|免費資源|Resources", "about|關於我們|About", "partner|合作|Partner"];
  for (const p of ["index.html", "about/index.html", "alumni/index.html", "apply/index.html", "events/index.html", "impact/index.html", "year/index.html", "partner/index.html", "resources/index.html", "team/index.html", "island/index.html"]) {
    const h = readFileSync(p, "utf8"), nav = h.match(/<div class="navlinks" id="navlinks">([\s\S]*?)<\/div>/)[1];
    const got = [...nav.matchAll(/href="\.\.?\/([a-z]+)\/"[^>]*><span class="zh">([^<]*)<\/span><span class="en">([^<]*)<\/span>/g)].map(m => m[1] + "|" + m[2] + "|" + m[3]);
    assert.deepEqual(got, want, p); assert.doesNotMatch(nav, /<svg|flame/, p);
  }
  const css = readFileSync("island/island.css", "utf8"), isl = readFileSync("island/index.html", "utf8");
  assert.doesNotMatch(css, /\.navlinks \.nav-cta\{[^}]*background:var\(--bt-orange\)/, "不是橘色藥丸");
  assert.match(css, /\.topbar\{position:fixed;top:12px;left:var\(--gut\);right:calc\(var\(--side-w\) \+ var\(--gut\)\)/);
  assert.match(css, /\.brand,\.toolbar\{background:linear-gradient\(180deg,rgba\(255,255,255,\.78\),rgba\(237,229,216,\.6\)\);backdrop-filter:blur\(20px\) saturate\(180%\)/, "牌子與工具列跟頂欄同一種玻璃");
  assert.equal((isl.match(/id="lang"/g) || []).length, 1); assert.equal((isl.match(/id="home"/g) || []).length, 1);
});

test("★ 每一頁只做一件事：現在開放、這一年、團隊、關於我們、數字；/programs/ 只剩轉址", () => {
  const ap = readFileSync("apply/index.html", "utf8"), yr = readFileSync("year/index.html", "utf8"), tm = readFileSync("team/index.html", "utf8");
  const ab = readFileSync("about/index.html", "utf8"), im = readFileSync("impact/index.html", "utf8"), pr = readFileSync("programs/index.html", "utf8"), home = readFileSync("index.html", "utf8");
  assert.match(ap, /<title>現在開放 \/ Beyond Taiwan<\/title>/); assert.match(ap, /<h2><span class="zh">想參加的還沒開放<\/span>/, "什麼都沒開的時候還是有下一步");
  assert.match(yr, /<div id="yr-zh">\s*<p>這一屆的行程還在排。/, "沒有資料的時候是幾句話，不是一張空表"); assert.match(yr, /<script type="module" src="\.\/src\/main\.js"><\/script>/);
  for (const k of L.TEAMS) assert.equal((tm.match(new RegExp(`<article class="tm" data-team="${k}">`, "g")) || []).length, 2, k + " 中英各一塊");
  assert.equal((tm.match(/<div class="tm-live" hidden><\/div>/g) || []).length, 12, "後台畫的那一格預設不出現");
  // 2026-11-24：/team/ 的檔案帶版本號了（?v=…），這裡認得帶與不帶兩種。
  assert.match(tm, /<script type="module" src="\.\/src\/programmes\.js(\?v=[\w-]+)?"><\/script>/);
  assert.deepEqual([...ab.slice(ab.indexOf('<div class="zh"'), ab.indexOf('<div class="en"')).matchAll(/<h2>([^<]*)<\/h2>/g)].map(m => m[1]), ["我們在處理的是資訊落差。", "使命", "願景", "價值", "免費是刻意的", "五年下來"], "/about/ 瘦身之後的順序");
  assert.doesNotMatch(ab, /class="nums"|class="tl"/, "數字與時間軸不在 /about/ 了");
  for (const s of ["五年，這些是真的發生過的事。", "這些數字怎麼來的", "收到超過 150 份申請"]) assert.ok(im.includes(s), "/impact/ 少了：" + s);
  assert.match(pr, /<meta http-equiv="refresh" content="0; url=\.\.\/year\/">/); assert.match(pr, /location\.replace\("\.\.\/year\/" \+ location\.search\)/); assert.match(pr, /<a href="\.\.\/year\/">/);
  assert.ok(!existsSync("programs/src"), "/programs/ 底下沒有程式了，判斷搬到 year/src/logic.js");
  assert.equal((home.match(/<p class="hero-act"><a class="cta warm" href="\.\/apply\/">/g) || []).length, 2, "首頁第一屏的按鈕到現在開放");
  assert.doesNotMatch(home + ap + tm + ab + yr, /href="\.\.?\/programs\//, "沒有連結還指到拆掉的那一頁");
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
  // 2026-11-24 首頁第三次重整：三個價值與願景不再放首頁（那一段會把捲動停住三個螢幕），只在 /about/。首頁留信念那一句大標題。
  for (const s of [...VALUES, ...VISION]) assert.ok(about.includes(s), "/about/ 少了：" + s);
  for (const s of ["因此，我們為台灣公立學校的學生打開被忽略的可能，讓他們看見「唯一一條路」之外的選項。那可能是走向世界去留學，也可能是留在台灣，用更開闊的方式學習與生活。",
    "我們同時維繫一個由「選擇了自己道路的人」所組成的社群，讓走過的人成為後來者的引路人，也讓這個網絡長久地延續下去。",
    "Therefore, we help students in Taiwan's public schools discover the possibilities they were never shown: the options beyond the single path they'd been told to follow.",
    "And we're building a lasting community of people who chose their own path, where those who went before can guide the ones coming after."]) assert.ok(about.includes(s), "/about/ 的使命少了：" + s);
  for (const s of ["never shown —", "single path —"]) assert.ok(!about.includes(s) && !home.includes(s), "英文的使命與願景不用破折號（Paul 同意換成冒號與逗號）");
});

test("★ 首頁搬走的六段長文與原本 /programs/ 的字，每一句都還在某一頁上", () => {
  const pages = ["about", "team", "partner", "apply", "impact"].map(d => readFileSync(d + "/index.html", "utf8")).join("\n") + readFileSync("index.html", "utf8");
  for (const s of ["這不完全是錯覺。留學代辦的費用不低", "於是很多人在還沒認真了解之前，就先把這個選項刪掉了。", "Beyond Taiwan 處理的就是這一段落差。",
    "我們會事先問你想讀什麼，再去找對應背景的人回來。", "有些配對從申請季開始，到現在超過兩年還在聯絡。", "第一屆在 2023 年六月，超過 80 位高中生參加。", "導生制度從 2020 年九月開始，第一批 36 人。",
    "不定期舉辦，也不收費。場次同樣會在 Instagram 公布。", "實習生進 BT 的各個 team 做真的事，有自己的實習護照記錄做過什麼。",
    "多數人只比你早走一兩步，有些人剛申請完不久，還記得那種不知道從哪裡開始的感覺。", "追蹤 <a href=\"https://www.instagram.com/beyondtaiwan/\">@beyondtaiwan</a>，或直接私訊問我們，看到都會回。",
    "我們持續在找願意一起做這件事的個人、企業與學校。", "That impression is not baseless.", "That gap is the reason Beyond Taiwan exists.", "No two years have the same line-up.",
    "Some finished their own applications recently enough to still remember not knowing where to start.", "We read everything.",
    "收到超過 150 份申請，協助超過 100 位國內高中生"]) assert.ok(pages.includes(s), "找不到：" + s);
});

test("★ 首頁的動畫：沒有任何一段會把捲動停住；module 只發訊號不碰動畫", () => {
  const h = readFileSync("index.html", "utf8");
  // 2026-11-24：三個價值那一段（停住三個螢幕、一句一句換）拿掉了。首頁剩下的動畫只有第一屏那座島。
  assert.doesNotMatch(h, /pin:\s*true/, "首頁不再有停住的段落");
  assert.doesNotMatch(h, /vals-on|class="val\b/);
  assert.match(h, /document\.dispatchEvent\(new Event\("bt:layout"\)\)/);
  assert.doesNotMatch(h, /<script type="module">[\s\S]*ScrollTrigger/, "首頁的 module 不碰動畫");
});

test("★ 首頁只留五個畫面（2026-11-24）：信念、我們做什麼、現在開放、數字、從哪裡開始；拿掉的都還在自己的那一頁", () => {
  const h = readFileSync("index.html", "utf8"), body = h.slice(h.indexOf("<main"), h.indexOf("</main>"));
  const at = k => { const i = body.indexOf(k); assert.ok(i >= 0, "找不到 " + k); return i; };
  assert.ok(at("</header>") < at('id="what"') && at('id="what"') < at('id="now"') && at('id="now"') < at('id="numbers"') && at('id="numbers"') < at('id="start"'), "五段的順序");
  // 沒有藏起來的段落只有這五個（宣傳影片那兩段沒填影片編號的時候是 hidden）
  const shown = [...body.matchAll(/<(?:header|section)\b[^>]*>/g)].map(m => m[0]).filter(t => !/\bhidden\b/.test(t));
  assert.equal(shown.length, 5, "首頁多了一段？加之前先看 README「首頁只留五個畫面」：" + shown.join(" "));
  // 我們做什麼：三行，各連到自己的那一頁
  assert.deepEqual([...body.matchAll(/<a class="wrow" href="([^"]+)">/g)].map(m => m[1]), ["./year/", "./year/", "./resources/"]);
  // 數字：三個，中英各一份
  assert.equal((body.match(/<span class="fig">/g) || []).length, 6);
  for (const s of ["250+", "100+"]) assert.equal(body.split(`<span class="fig">${s}</span>`).length - 1, 2, s + " 中英各一次");
  assert.match(body, /<p class="nums-src"><a href="\.\/impact\/">/, "完整的數字與來源在 /impact/");
  // 從哪裡開始：三條路，第一條是高中生
  assert.deepEqual([...body.matchAll(/<a class="pcard(?: main)?" href="([^"]+)">/g)].map(m => m[1]), ["./apply/", "./team/", "./partner/"]);
  assert.match(body, /<a class="pcard main" href="\.\/apply\/">/, "最重的那一顆是給高中生的");
  // 拿掉的東西不在首頁，但都還在自己的那一頁
  for (const gone of ["isle-block", "pstrip", "photo-lead", "vals-stage", "走進 BT 島", "Step onto BT Island"]) assert.ok(!h.includes(gone), "首頁不該再有 " + gone);
  assert.match(h, /<a href="\.\/island\/">/, "BT 島在頁尾還有連結");
  assert.ok(readFileSync("about/index.html", "utf8").includes("你無法選擇你從未看見的東西。"), "三個價值在 /about/");
  // 介紹的句子是從內頁搬來的，那一頁改了這裡要跟著看
  const res = readFileSync("resources/index.html", "utf8");
  for (const s of ["申請文書怎麼寫、選校怎麼看、時程怎麼排。這些是 BT 五年下來一次一次講給學生聽的東西，寫下來讓更多人拿得到。", "How to write your essays, how to read a school list, how to plan the timeline."]) { assert.ok(body.includes(s)); assert.ok(res.includes(s), "/resources/ 的那一句改了，首頁要跟著看"); }
  // 首頁的照片只剩一張
  assert.equal((body.match(/<picture/g) || []).length, 1);
});

test("★ shared/public.js：募資橫條預設關著、日期含頭含尾、開了減少動態效果就不動", () => {
  const src = readFileSync("shared/public.js", "utf8");
  assert.match(src, /url: "",/, "網址是空的，橫條不出現");
  assert.match(src, /from: "2027-01-26", to: "2027-04-21"/);
  assert.ok(src.indexOf("if (reduce ||") < src.indexOf("new IntersectionObserver("), "先看 reduce 再做任何會動的事");
  assert.match(src, /if \(el\.getBoundingClientRect\(\)\.top < vh \* 0\.92\) continue;/, "一開頁就看得到的東西不藏");
});

test("★ 活動卡與活動頁：這一屆有自己的名字就用它，計畫的名字放旁邊；沒有日期的寫大約幾月", () => {
  const ou = { slug: "winter-bootcamp", team: "Curriculum Team", title_zh: "寒假探索營", title_en: "Winter College Bootcamp", edition_zh: "Overseas Unpacked", edition_en: "Overseas Unpacked", starts_at: "2027-01-02T16:00:00Z", is_past: false };
  assert.deepEqual(names(ou, "zh"), { main: "Overseas Unpacked", sub: "寒假探索營" });
  assert.deepEqual(names({ title_zh: "講座", title_en: "Talk" }, "en"), { main: "Talk", sub: "" }, "沒有那一格就照舊");
  assert.match(cardHTML(ou, "en", "./"), /<span class="tk-date">SUN JAN 3 · 2027<\/span><b>Overseas Unpacked<\/b><span class="ev-when">Winter College Bootcamp<\/span>/);   // 2026-11-24 票卡：日期在名字上面
  assert.match(detailHTML(ou, "zh"), /<p class="ev-by">Curriculum 主辦・寒假探索營<\/p><h1>Overseas Unpacked<\/h1>/);
  assert.equal(whenText({ usual_month: 8 }, "zh"), "大約 8 月"); assert.equal(whenText({ usual_month: 8 }, "en"), "Around August");
  assert.equal(whenText({}, "zh"), "日期還沒定"); assert.equal(whenText(ou, "zh"), "2027-01-03");
  assert.match(detailHTML({ slug: "coffee-chat", team: "Mentorship Team", title_zh: "Coffee chat", title_en: "Coffee chat" }, "en"), /<li><b>When<\/b><span>Date to be confirmed<\/span><\/li>/);
});

test("★ 從活動頁按立即報名：/apply/?f= 只有那一張表，回去那顆回那一場活動（Paul 2026-11-23）", () => {
  const html = readFileSync("apply/index.html", "utf8"), main = readFileSync("apply/src/main.js", "utf8");
  assert.match(html, /if \(new URLSearchParams\(location\.search\)\.get\("f"\)\) document\.documentElement\.classList\.add\("ap-one"\);/, "在 head 就加 class，大標題不會先閃出來");
  assert.match(html, /html\.ap-one main > \.hero, html\.ap-one #upcoming, html\.ap-one \.ap-more, html\.ap-one #ap-sec \.sec-in > h2\{display:none\}/);
  assert.match(html, /<section class="sec" id="ap-sec">/); assert.match(html, /<section class="sec ap-more">/);
  assert.match(main, /if \(S\.event && S\.event\.slug\) \{ location\.href = "\.\.\/events\/\?lang="/, "活動的報名表按回去，回那一場");
  assert.match(main, /document\.documentElement\.classList\.remove\("ap-one"\);/, "回清單的時候把只填一張表的樣子拿掉");
  const form = { id: "f1", title: "報名表", intro: "", notify_by: null, closes_at: null }, ev = { slug: "overseas-unpacked", starts_at: "2027-01-03T01:00:00Z", place: "Taipei" };
  const withEv = AP.formHTML(form, [], "needIn", "", false, false, "", "", null, ev), plain = AP.formHTML(form, [], "needIn", "", false, false, "", "", null, null);
  assert.match(withEv, /data-act="back">← 回到這場活動<\/button>/); assert.match(withEv, /<p class="ap-ev">[^<]*Taipei<\/p>/);
  assert.match(plain, /data-act="back">← 看全部開放中的<\/button>/); assert.doesNotMatch(plain, /class="ap-ev"/);
  assert.match(withEv, /報名要先登入，或開一個免費的 BT 帳號，一分鐘。登入之後會回到這張表。/);
  assert.match(withEv, /<p class="ap-pre">這張表會問的問題（現在還不能填）<\/p>/, "還不能填的時候講清楚底下只是先給他看");
  assert.match(AP.formHTML(form, [], "needProfile", "", false, false, "", "", null, ev), /填我的資料，填完會回到這張表/);
  assert.doesNotMatch(AP.formHTML(form, [], "signedIn", "", false, false, "", "", null, ev), /class="ap-pre"/, "可以填的時候沒有那一行");
});
