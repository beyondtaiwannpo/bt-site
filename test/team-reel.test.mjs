// /team/ 最上面那一排大照片（2026-11-24）。跑法：node --test test/team-reel.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { indexAt, step } from "../team/src/reel.js";
import { splitGroups, crewHTML, groupsHTML, teamSlug, toPerson, isLeadership, leadRank, leadHeading, LEAD_KEY, TEAM_ORDER } from "../team/src/ui.js";

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

test("★ 中英兩版各七張（六個 team 加 Leadership）、七格、七塊，順序一樣", () => {
  for (const l of ["zh", "en"]) {
    const h = part(l);
    const slides = order(h, /<figure class="slide[^"]*" data-team="([a-z]+)">/g), panels = order(h, /<article class="tm" data-team="([a-z]+)">/g);
    assert.equal(slides.length, 7, l); assert.deepEqual(slides, panels, l + " 照片與介紹的順序要一樣，第幾張就是第幾塊");
    assert.equal((h.match(/<div class="rail"[\s\S]*?<\/div>/)[0].match(/<button /g) || []).length, 7, l);
    assert.equal((h.match(/<div class="tm-people" hidden><\/div>/g) || []).length, 7, l + " 人那一格預設不出現");
    assert.equal((h.match(/class="arw (prev|next)" aria-label="[^"]+"/g) || []).length, 2, l + " 兩顆箭頭都有名字");
    for (const m of h.matchAll(/<img [^>]*>/g)) assert.match(m[0], /alt="[^"]+"/, "照片要有說明文字");
  }
  const keys = order(part("zh"), /<figure class="slide[^"]*" data-team="([a-z]+)">/g);
  assert.equal(keys[6], "leadership", "Leadership 排最後一張");
  assert.deepEqual(keys.slice(0, 6).sort(), TEAM_ORDER.map(teamSlug).sort(), "前六張就是那六個 team");
  assert.match(page, /grid-template-columns:repeat\(7,minmax\(0,1fr\)\)/, "下面那一排是七格");
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

test("★ 人分兩個地方：六個 team 的進那個 team，Co-President 與沒填 team 的進 Leadership 那一張", () => {
  const row = (name_en, team, title_en) => toPerson({ name_en, team, title_en, term: "2026-27" });
  const { teams, rest } = splitGroups([row("A", "Curriculum Team", "Director, Curriculum Team"), row("B", "Community Relations Team", "Associate, CR"),
    row("C", "Sponsorship Team", "Co-President"), row("D", "", "Associate"), row("E", "Design", "Associate, Design")]);
  assert.deepEqual(teams.map(g => teamSlug(g.key)), ["curriculum", "cr"]);
  assert.deepEqual(rest.map(g => g.key), [LEAD_KEY, "Design", ""]);
  assert.equal(crewHTML([]), ""); assert.match(crewHTML(teams[0].people), /^<ul class="crew"><li>/);
  assert.doesNotMatch(groupsHTML(rest, "en", true), /Leadership/, "下面那一段的 h2 已經寫了，不再印一次");
  assert.match(groupsHTML(rest, "en"), /<h3>Leadership<\/h3>/);
});

test("★ Paul 2026-11-24：Co-President 與 Senior Adviser 不在每個 team 底下，只在 Leadership 那一張", () => {
  for (const x of ["sec-people", "faces-zh", "faces-en"]) assert.ok(!page.includes(x), "每個 team 底下那一排又回來了：" + x);
  const main = readFileSync("team/src/main.js", "utf8");
  assert.match(main, /fill\("leadership"/, "Leadership 的人要畫進第七塊");
  assert.match(page, /html:not\(\[data-tm\]\) \.tm\[data-team="leadership"\]\{display:none\}/, "沒有 JavaScript 的時候名單載不到，那一塊不要留一個空標題");
  // 誰算 Leadership、誰排前面、標題只寫真的有的職位
  assert.equal(isLeadership("Co-President"), true); assert.equal(isLeadership("Founder"), true); assert.equal(isLeadership("Adviser, Curriculum Team"), false);
  assert.ok(leadRank("Founder") < leadRank("Co-President · 2026-27") && leadRank("Co-President") < leadRank("Senior Adviser"));
  const P = title => ({ title });
  assert.equal(leadHeading([P("Co-President · 2026-27"), P("Senior Adviser · 2026-27")], "en"), "Co-Presidents and Senior Advisers");
  assert.equal(leadHeading([P("Founder"), P("Co-President"), P("Senior Adviser")], "en"), "Founders, Co-Presidents and Senior Advisers");
  assert.equal(leadHeading([P("Co-President"), P("Senior Adviser")], "zh"), "Co-President 與 Senior Adviser");
  assert.equal(leadHeading([], "en"), "");
});

test("★ /team/ 的檔案都帶版本號，新的 HTML 不會配到舊的程式（Paul 2026-11-24 看到每個 team 的人疊在一起）", () => {
  for (const m of page.matchAll(/<script[^>]* src="(\.[^"]+)"/g)) assert.match(m[1], /\.js\?v=[\w-]+$/, m[1] + " 沒帶版本號");
  assert.match(page, /<link rel="stylesheet" href="\.\.\/shared\/brand\.css\?v=[\w-]+">/);
  const map = page.match(/<script type="importmap">(.*?)<\/script>/s);
  assert.ok(map, "沒有 importmap"); const imports = JSON.parse(map[1]).imports;
  assert.ok(page.indexOf('<script type="importmap">') < page.indexOf('<script type="module"'), "importmap 要在第一支模組之前");
  // team/src 裡每一支 import 到的檔，importmap 都要有：少一支，那一支就會是快取裡的舊版
  for (const f of ["main.js", "programmes.js", "reel.js", "ui.js"]) {
    assert.ok(imports["/team/src/" + f], f);
    for (const m of readFileSync("team/src/" + f, "utf8").matchAll(/^import [^"]*"([^"]+)"/gm)) {
      const abs = new URL(m[1], "https://x/team/src/" + f).pathname;
      assert.ok(imports[abs], f + " import 的 " + abs + " 不在 importmap 裡（加進 scripts/bump-version.sh 的 extra）");
    }
  }
  assert.match(readFileSync("scripts/bump-version.sh", "utf8"), /FOLDERS="[^"]* team"/);
  const hook = readFileSync("scripts/pre-commit-bump.sh", "utf8");
  assert.match(hook, /team\/index\.html/); assert.match(hook, /WATCH='[^']*\|team\)/);
});
