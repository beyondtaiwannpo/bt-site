// /team/ 最上面那一排大照片（2026-11-24）。跑法：node --test test/team-reel.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { indexAt, step } from "../team/src/reel.js";
import { splitGroups, crewHTML, groupsHTML, teamSlug, toPerson, LEAD_KEY, TEAM_ORDER } from "../team/src/ui.js";

const page = readFileSync("team/index.html", "utf8");
const part = l => page.slice(page.indexOf(`<div class="${l}" lang=`), l === "zh" ? page.indexOf('<div class="en" lang=') : page.indexOf("</main>"));
const order = (h, re) => [...h.matchAll(re)].map(m => m[1]);

test("第幾張：照捲了多少算，夾在頭尾之間；寬度是 0（那一排藏著）回 0", () => {
  assert.equal(indexAt(0, 390, 6), 0); assert.equal(indexAt(780, 390, 6), 2); assert.equal(indexAt(590, 390, 6), 2);
  assert.equal(indexAt(99999, 390, 6), 5); assert.equal(indexAt(-40, 390, 6), 0); assert.equal(indexAt(500, 0, 6), 0);
});
test("上一個、下一個到頭就停，不繞回去", () => {
  assert.equal(step(0, -1, 6), 0); assert.equal(step(5, 1, 6), 5); assert.equal(step(2, 1, 6), 3);
});

test("★ 中英兩版各六張照片、六格、六塊介紹，順序一樣", () => {
  for (const l of ["zh", "en"]) {
    const h = part(l);
    const slides = order(h, /<figure class="slide[^"]*" data-team="([a-z]+)">/g), panels = order(h, /<article class="tm" data-team="([a-z]+)">/g);
    assert.equal(slides.length, 6, l); assert.deepEqual(slides, panels, l + " 照片與介紹的順序要一樣，第幾張就是第幾塊");
    assert.equal((h.match(/<div class="rail"[\s\S]*?<\/div>/)[0].match(/<button /g) || []).length, 6, l);
    assert.equal((h.match(/<div class="tm-people" hidden><\/div>/g) || []).length, 6, l + " 人那一格預設不出現");
    assert.equal((h.match(/class="arw (prev|next)" aria-label="[^"]+"/g) || []).length, 2, l + " 兩顆箭頭都有名字");
    for (const m of h.matchAll(/<img [^>]*>/g)) assert.match(m[0], /alt="[^"]+"/, "照片要有說明文字");
  }
  assert.deepEqual(order(part("zh"), /<figure class="slide[^"]*" data-team="([a-z]+)">/g).sort(), TEAM_ORDER.map(teamSlug).sort(), "六張就是那六個 team");
});

test("★ 現在是哪一個 team 在 <head> 就定好，六個代號跟照片的一樣；沒有 JavaScript 六塊都在", () => {
  const head = page.slice(0, page.indexOf("</head>"));
  const m = head.match(/\/\^\(([a-z|]+)\)\$\/\.test\(h\)/);
  assert.ok(m, "找不到 <head> 裡認代號的那一行");
  assert.deepEqual(m[1].split("|"), order(part("zh"), /<figure class="slide[^"]*" data-team="([a-z]+)">/g));
  for (const k of m[1].split("|")) assert.ok(page.includes(`html[data-tm="${k}"] .tm[data-team="${k}"]`), k + " 那一塊沒有對應的顯示規則，選到它下面會是空的");
  assert.match(page, /html:not\(\[data-tm\]\) \.ctl\{display:none\}/, "沒有 JavaScript 的時候不要畫按了沒反應的箭頭");
  assert.match(page, /\.slide\{[^}]*scroll-snap-align:start/);
});

test("★ Paul 2026-11-24 拿掉的三樣不要回來：三十個人的大標、BT 島那一塊、怎麼運作", () => {
  for (const s of ["三十個人，全部是學生", "Thirty people. All students.", "isle-block", "走進 BT 島", "Step onto BT Island", "<h2>怎麼運作</h2>", "<h2>How it works</h2>"])
    assert.ok(!page.includes(s), "又出現了：" + s);
  assert.match(part("zh"), /<h2>校友去了哪<\/h2>/); assert.match(part("en"), /<h2>Where they went<\/h2>/);
});

test("★ 人分兩個地方：六個 team 的進那個 team，Co-President 與沒填 team 的留在下面", () => {
  const row = (name_en, team, title_en) => toPerson({ name_en, team, title_en, term: "2026-27" });
  const { teams, rest } = splitGroups([row("A", "Curriculum Team", "Director, Curriculum Team"), row("B", "Community Relations Team", "Associate, CR"),
    row("C", "Sponsorship Team", "Co-President"), row("D", "", "Associate"), row("E", "Design", "Associate, Design")]);
  assert.deepEqual(teams.map(g => teamSlug(g.key)), ["curriculum", "cr"]);
  assert.deepEqual(rest.map(g => g.key), [LEAD_KEY, "Design", ""]);
  assert.equal(crewHTML([]), ""); assert.match(crewHTML(teams[0].people), /^<ul class="crew"><li>/);
  assert.doesNotMatch(groupsHTML(rest, "en", true), /Leadership/, "下面那一段的 h2 已經寫了，不再印一次");
  assert.match(groupsHTML(rest, "en"), /<h3>Leadership<\/h3>/);
});
