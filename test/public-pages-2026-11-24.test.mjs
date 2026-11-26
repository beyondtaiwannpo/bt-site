// /partner/ 與 /about/ 2026-11-24 的改版：只換版面，不換字、不加新數字。/about/ 2026-11-25 再改成捲動的故事，守門在這個檔的後半。跑法：node --test test/public-pages-2026-11-24.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const partner = readFileSync("partner/index.html", "utf8"), about = readFileSync("about/index.html", "utf8"), impact = readFileSync("impact/index.html", "utf8");
const body = h => h.slice(h.indexOf("<main"), h.indexOf("</main>"));

test("★ /partner/ 上的數字每一格都跟 /impact/ 一字不差（不在這一頁另外寫一份會走鐘的數字）", () => {
  const nums = [...body(partner).matchAll(/<li><b>[^<]*<\/b><i>[^<]*<\/i><span>[^<]*<\/span><\/li>/g)].map(m => m[0]);
  assert.equal(nums.length, 8, "中英各四格");
  for (const n of nums) assert.ok(impact.includes(n), "這一格 /impact/ 上沒有：" + n);
  assert.equal((body(partner).match(/<a href="\.\.\/impact\/">(這些數字怎麼來的|Where these numbers come from)<\/a>/g) || []).length, 2, "數字底下要連到怎麼算的那一頁");
});

test("★ /partner/ 的用語紅線：只有贊助與支持", () => {
  for (const w of ["捐款", "善款", "愛心", "donat", "charity"]) assert.ok(!body(partner).toLowerCase().includes(w), "出現了不准用的字：" + w);
  for (const s of ["美國在臺協會 AIT", "EducationUSA", "TRÈS BON 好伴 café", "臺北市立第一女子高級中學", "日常營運", "暑期探索營", "導生配對計畫",
    "學員不收費是刻意的設計，不是還沒開始收。", "我們是學生組織，幹部都在上學，回信可能不會太快，但每一封都會看。", "Support us so the programmes keep running."])
    assert.ok(partner.includes(s), "原本的字不見了：" + s);
  assert.equal((partner.match(/href="mailto:beyondtaiwan2020@gmail\.com"/g) || []).length, 6, "中英各三個寫信的地方：最上面那顆、大字的信箱、句子裡的");
  assert.ok(!/<img[^>]*logo(?!\.png)/.test(body(partner)), "合作單位的 logo 要對方同意才放");
});

test("★ /about/ 換版面不換字：每一段原本的字都在，照片還是站上本來就有的那兩張", () => {
  // 2026-11-25 改成捲動的故事。最上面那一句拆成三格（字與順序都沒變），所以這裡分三段對。
  for (const s of ["在台灣，「出國念書」常被當成一件家裡有錢才能想的事。", "「我們不是老師，也不是顧問。多數人只比你早走一兩步。」", "學員不收費。這不是還沒開始收，是刻意的設計。",
    "Beyond Taiwan 從 2020 年五月開始，七個人。", "到現在五年，接近三十位幹部，全部是學生，", "分布在七個國家。",
    "Beyond Taiwan started in May 2020 with seven people.", "Five years on, we are close to thirty organisers, all of us students,", "spread across seven countries.",
    "In Taiwan, studying abroad is still widely treated as something only well-off families get to consider.",
    "Students pay nothing. This is not a fee we have yet to introduce. It is a deliberate design choice.", "<li><b>看見</b><span>你無法選擇你從未看見的東西。</span></li>", "<li><b>Company</b><span>"])
    assert.ok(about.includes(s), "原本的字不見了：" + s);
  assert.deepEqual([...new Set([...body(about).matchAll(/src="\.\.\/photos\/([a-z-]+)\.jpg"/g)].map(m => m[1]))].sort(), ["hero-listening", "talking-laptop"]);
  for (const m of body(about).matchAll(/<img [^>]*>/g)) assert.match(m[0], /alt="[^"]+"/);
  assert.equal((about.match(/<p class="a-zero" aria-hidden="true">0<\/p>/g) || []).length, 2, "那個大 0 是裝飾，讀螢幕的軟體不唸");
  assert.match(about, /@media \(prefers-reduced-motion:reduce\)\{html\{scroll-behavior:auto\}\*\{animation:none!important;transition:none!important\}\}/, "減少動態效果要全關");
});

// ── 2026-11-25：/about/ 改成捲動的故事（Paul 的一位 mentor 給的原型，Paul：「Can you build the about page something like this?」）──
const beats = [...body(about).replace(/<!--[\s\S]*?-->/g, "").matchAll(/<section class="beat[^"]*"([^>]*)>([\s\S]*?)<\/section>/g)].map(m => ({ attrs: m[1], html: m[2] }));
const attr = (b, k) => (b.attrs.match(new RegExp(" " + k + '="([^"]*)"')) || [])[1];

test("★ /about/ 的時間軸七格跟 /impact/ 一字不差（兩頁各一份，不能各走各的）", () => {
  const rows = [...body(about).matchAll(/<li><b>[^<]*<\/b><span>[^<]*<\/span><\/li>/g)].map(m => m[0]).filter(r => !/看見|平等|陪伴|Seeing|Equality|Company/.test(r));
  assert.equal(rows.length, 14, "中英各七格");
  const tl = [...impact.matchAll(/<ul class="tl">([\s\S]*?)<\/ul>/g)].map(m => [...m[1].matchAll(/<li>.*?<\/li>/g)].map(x => x[0]));
  assert.equal(tl.length, 2);
  assert.deepEqual(rows.slice(0, 7), tl[0], "中文那七格跟 /impact/ 順序與字都一樣");
  assert.deepEqual(rows.slice(7), tl[1], "英文那七格跟 /impact/ 順序與字都一樣");
  assert.equal((body(about).match(/<h2>五年走過來<\/h2>|<h2>Five years<\/h2>/g) || []).length, 2, "標題也用 /impact/ 那一個");
  assert.ok(impact.includes("<h2>五年走過來</h2>") && impact.includes("<h2>Five years</h2>"));
});

test("★ /about/ 每一格都是中文一塊、英文一塊，字在 HTML 裡不在程式裡", () => {
  assert.equal(beats.length, 16);
  for (const b of beats) {
    assert.equal((b.html.match(/<div class="zh" lang="zh-Hant">/g) || []).length, 1, "這一格少了中文那一塊：" + b.html.slice(0, 60));
    assert.equal((b.html.match(/<div class="en" lang="en">/g) || []).length, 1, "這一格少了英文那一塊：" + b.html.slice(0, 60));
    assert.equal(!!attr(b, "data-ch-zh"), !!attr(b, "data-ch-en"), "章名要中英都寫");
  }
  assert.deepEqual(beats.map(b => attr(b, "data-ch-zh")).filter(Boolean), ["關於我們", "五年走過來", "我們在處理的是資訊落差。", "使命", "願景", "價值", "免費是刻意的", "五年下來"], "右邊那一排的章名都是頁面上本來就有的字");
  const js = about.slice(about.lastIndexOf("<script>"));
  assert.doesNotMatch(js, /textContent = "[^"]*[\u4e00-\u9fffA-Za-z]{2,}/, "程式裡不寫給人看的字");
  assert.doesNotMatch(body(about), /\[[^\]]*\]|Play the story|See what's open|→/, "原型的佔位文字、播放鈕、箭頭都沒有拿過來");
  assert.doesNotMatch(body(about), /Bootcamp 探索營|Mentorship Program|高中生實習/, "活動與計畫那一章沒有搬過來（那些字在 /team/ 與 /year/）");
});

test("★ /about/ 的點：HTML 上寫的每一個形狀，程式裡都有", () => {
  const js = about.slice(about.lastIndexOf("<script>"));
  const shapes = new Set([...js.slice(js.indexOf("function shapes() {")).matchAll(/^ {8}([a-z]+): function \(i/gm)].map(m => m[1]));
  assert.ok(shapes.size >= 12, "形狀表讀不到");
  for (const b of beats) for (const name of (attr(b, "data-dots") || "field").split(/\s+/)) assert.ok(shapes.has(name), "data-dots 寫了程式裡沒有的形狀：" + name);
  const values = beats.find(b => b.attrs.includes('id="values"'));
  assert.equal(attr(values, "data-dots").split(/\s+/).length, 3, "價值那一格停三步，一步一個價值");
  assert.equal((values.html.match(/<ul class="a-vals steps">/g) || []).length, 2);
  assert.match(js, /var N = 30, FOUNDERS = 7;/, "三十個點、前七個是創辦的那七個人，跟頁面上的字同一組數字");
});

test("★ /about/ 的捲動故事關得掉：減少動態效果、?motion=off、程式出錯，都退回一格接一格的文章", () => {
  const head = about.slice(0, about.indexOf("<style>"));
  assert.match(head, /if \(!reduce && !off && window\.innerHeight >= 520\) document\.documentElement\.classList\.add\("story-on"\);/);
  assert.match(head, /matchMedia\("\(prefers-reduced-motion: reduce\)"\)\.matches/);
  const js = about.slice(about.lastIndexOf("<script>"));
  assert.match(js, /if \(!html\.classList\.contains\("story-on"\)\) return;/);
  assert.match(js, /try \{ start\(\); \} catch \(e\) \{ html\.classList\.remove\("story-on"\);/, "程式出錯就把 story-on 拿掉");
  assert.doesNotMatch(js, /\b(gsap|ScrollTrigger|localStorage|fetch\()/, "這一頁的動態不用 GSAP、不存東西、不連任何地方");
  // 停在原地、疊在一起、藏起來的樣式全部掛在 html.story-on 底下：沒有這個 class 的時候每一格都是普通的一段。
  const css = about.slice(about.indexOf("<style>"), about.indexOf("</style>"));
  for (const rule of css.match(/[^{}]*\{[^{}]*\}/g) || [])
    if (/position:(sticky|absolute)[^}]*inset:0|opacity:0;pointer-events:none;will-change/.test(rule) && /\.(beat|stage|shot)\b/.test(rule.split("{")[0]))
      assert.match(rule.split("{")[0], /html\.story-on/, "這一條會把字疊起來或藏起來，要掛在 html.story-on 底下：" + rule.slice(0, 80));
});
