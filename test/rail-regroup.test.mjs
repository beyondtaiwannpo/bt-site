// 側欄重分（2026-11-27 Paul）：滑過去看得到裡面的頁、錢在 Sponsorship 底下、一般幹部（Associate）只看到他用得到的東西。
// 同一天的第二版：我的與整個 BT 合成一段、對外網站變成要派人的工作區、側欄的「新增」拿掉、搜尋與帳號到頂欄。
// 跑法：node --test test/*.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as RAIL from "../shared/rail.js";

const ASSOC = { role: "cadre", board: "member", team: "Curriculum Team", name: "小安", ws: {} };
const ED = { ...ASSOC, ws: { "res:Curriculum Team": "edit" } };
const PRES = { role: "cadre", board: "president", team: "", name: "P", ws: {} };
const rows = h => [...h.matchAll(/class="rail-item rail-area(?: (?:on|here))?" [^>]*>[\s\S]*?<b>([^<]+)<\/b>/g)].map(m => m[1]);

// 2026-11-27 第二版：「我的」與「整個 BT」合成最上面一段；被派進去的東西在「我的工作區」，標「指派」。
test("★ Associate 的側欄：最上面那一段，加上他的 team；表單是要我填的與所有表單", () => {
  const h = RAIL.railHTML("forms", "projects", ASSOC, {}, "zh");
  assert.deepEqual(rows(h), ["首頁", "行事曆", "會議", "專案", "表單", "我的護照", "場地"]);
  assert.match(h, /<b>Curriculum<\/b>/);
  assert.deepEqual(RAIL.visibleItems("forms", ASSOC).map(i => i.key), ["fill", "all"]);
  for (const no of ["行銷", "對外網站", "紀錄", "護照", "人與權限", "錢", "搜尋"]) assert.ok(!rows(h).includes(no), `Associate 沒有${no}`);
  assert.doesNotMatch(h, /rail-new/, "側欄的「新增」拿掉了（提需求在首頁與 team 頁的標題底下）");
});

test("★ 對外網站是一個要派人的工作區（custom:website）；資源庫與 BT 島在改得動的那個 team 底下", () => {
  for (const k of ["history", "island", "island-map", "res"]) assert.equal(RAIL.ITEMS.find(i => i.group === "site" && i.key === k).area, "website", k);
  const web = RAIL.AREAS.find(a => a.key === "website");
  assert.equal(web.areaWho, "ws:custom:website");
  assert.ok(!RAIL.areaShown(web, ED), "某個 team「改」的人沒有對外網站那一行");
  assert.ok(!RAIL.areaShown(web, { ...ASSOC, ws: { "res:Marketing Team": "edit" } }), "Marketing「改」的人也沒有（歷史之路在 Marketing 那一行底下）");
  const WEB = { ...ASSOC, ws: { "custom:website": "edit" } };
  assert.ok(RAIL.areaShown(web, WEB) && RAIL.areaShown(web, PRES));
  assert.ok(!RAIL.areaShown(web, { ...ASSOC, ws: { "custom:website": "view" } }), "只能看的人改不動，不畫");
  assert.deepEqual(RAIL.visibleItems("website", WEB).map(i => i.key), ["history", "island-map", "island"], "被派進對外網站的人：歷史之路與 BT 島（資源庫照舊是各 team 的）");
  assert.match(RAIL.railHTML("home", "home", WEB, {}, "zh"), /<b>對外網站<\/b>[\s\S]*?<span class="rail-lv dim"[^>]*>指派<\/span>/);
  // team 底下：資源庫、BT 島的貼文、BT 島；Marketing 多歷史之路。只能看的沒有。
  assert.deepEqual(RAIL.teamSiteItems(ED, "Curriculum Team").map(i => i.key), ["res", "island", "island-map"]);
  assert.deepEqual(RAIL.teamSiteItems({ ...ASSOC, ws: { "res:Marketing Team": "edit" } }, "Marketing Team").map(i => i.key), ["res", "history", "island", "island-map"]);
  assert.deepEqual(RAIL.teamSiteItems({ ...ASSOC, ws: { "res:Curriculum Team": "view" } }, "Curriculum Team"), []);
  assert.deepEqual(RAIL.teamSiteItems({ role: "student", ws: { "res:Curriculum Team": "edit" } }, "Curriculum Team"), [], "學員永遠不行");
  // 規則：edit:／editany:，加上 2026-11-27 的逗號（任何一個過就算）。
  assert.ok(RAIL.allowed("edit:res:Marketing Team", { ...ASSOC, ws: { "res:Marketing Team": "manage" } }));
  assert.ok(!RAIL.allowed("edit:res:Marketing Team", { ...ASSOC, ws: { "res:Marketing Team": "view" } }));
  assert.ok(RAIL.allowed("editany:res:", ED)); assert.ok(!RAIL.allowed("editany:res:", ASSOC)); assert.ok(RAIL.allowed("editany:res:", PRES));
  assert.ok(!RAIL.allowed("editany:res:", { role: "student", ws: { "res:Curriculum Team": "edit" } }), "學員永遠不行");
  assert.ok(RAIL.allowed("editany:res:,edit:custom:website", WEB)); assert.ok(RAIL.allowed("editany:res:,edit:custom:website", ED));
  assert.ok(!RAIL.allowed("editany:res:,edit:custom:website", ASSOC));
  // 畫面的門跟著認對外網站（真正的門在資料庫：can_edit_history、can_edit_island_post）。
  const site = readFileSync("admin/site/src/ui.js", "utf8");
  assert.match(site, /const SITE_WS = "custom:website"/);
});

test("★ 回饋表在「表單」底下，實習生進度牆在護照底下", () => {
  assert.equal(RAIL.ITEMS.find(i => i.group === "records" && i.key === "forms").area, "forms");
  const w = RAIL.ITEMS.find(i => i.group === "internwall");
  assert.equal(w.area, "passports");
  assert.ok(RAIL.canSee(w, { ...ASSOC, ws: { "intern-passport": "view" } })); assert.ok(!RAIL.canSee(w, ASSOC)); assert.ok(RAIL.canSee(w, PRES));
  assert.match(RAIL.railHTML("passports", "interns", { ...ASSOC, ws: { "intern-passport": "edit" } }, {}, "zh"), /href="\/intern-passport\/\?lang=zh">實習生進度牆/);
});

test("★ 滑過去看得到裡面有哪幾頁：沒展開、又不只一頁的那一行才有；現在這一行展開就不再畫", () => {
  const me = { ...ASSOC, ws: { "custom:meeting-templates": "edit" } };
  const h = RAIL.railHTML("home", "home", me, {}, "zh");
  // 會議那一行：滑過去是會議、會議範本，直接點得到範本（Paul：「hover onto meetings, I can see meeting template」）。
  assert.match(h, /<div class="rail-row"><a class="rail-item rail-area" href="\/admin\/\?lang=zh#meetings">[\s\S]*?<\/a><div class="rail-fly" role="group" aria-label="會議"><div class="rail-fly-m"><a class="rail-item rail-sub" href="\/admin\/\?lang=zh#meetings">會議<\/a><a class="rail-item rail-sub" href="\/admin\/\?lang=zh#mtemplates">會議範本<\/a><\/div><\/div><\/div>/);
  assert.match(h, /aria-label="行事曆"><div class="rail-fly-m"><a class="rail-item rail-sub" href="#calendar" data-act="tab" data-t="calendar">行事曆<\/a><a class="rail-item rail-sub" href="\/availability\/\?lang=zh">時間看板<\/a>/);
  // 只有一頁的（首頁、我的護照、場地）沒有。
  assert.doesNotMatch(h, /aria-label="首頁"|aria-label="我的護照"|aria-label="場地"/);
  // 現在在行事曆：那一行展開在側欄上，不再畫滑過去那一塊。
  const c = RAIL.railHTML("home", "calendar", me, {}, "zh");
  assert.doesNotMatch(c, /aria-label="行事曆"><div class="rail-fly-m">/);
  assert.match(c, /<div class="rail-subs"><a class="rail-item rail-sub on" href="#calendar"/);
  // 樣式：只在有滑鼠的寬螢幕；位置是 position:fixed（側欄自己會捲，絕對定位會被切掉）。
  const css = readFileSync("shared/rail.css", "utf8");
  assert.match(css, /\.rail-fly\{display:none\}/);
  assert.match(css, /@media \(hover:hover\) and \(min-width:721px\)\{[\s\S]*?\.rail\{z-index:20\}[\s\S]*?\.rail-row:hover > \.rail-fly,\.rail-row:focus-within > \.rail-fly\{display:block;position:fixed/,
    "側欄要墊高一層，不然內容區的卡片會蓋在跳出來那一塊上面（2026-11-27 本機瀏覽器看到的）");
  // 鍵盤也到得了（focus-within），監聽只掛一次。
  const src = readFileSync("shared/rail.js", "utf8");
  assert.match(src, /document\.addEventListener\("focusin", placeFly\)/);
  assert.match(src, /if \(flyBound \|\| typeof document === "undefined"\) return;/);
});

test("★ 錢在 Sponsorship 底下一條，它的五頁在內容區上方那一排（寬螢幕也畫）", () => {
  const sp = { ...ASSOC, team: "Sponsorship Team", ws: { "res:Sponsorship Team": "edit", finance: "edit" } };
  const h = RAIL.railHTML("finance", "budget", sp, {}, "zh");
  assert.match(h, /<a class="rail-item rail-area rail-team here"[^>]*>[\s\S]*?<b>Sponsorship<\/b>/);
  assert.match(h, /<a class="rail-item rail-sub on" href="#overview" data-act="tab" data-t="overview" aria-current="page">錢<\/a>/);
  assert.equal((h.match(/>總覽</g) || []).length, 1, "Sponsorship 底下只有一個總覽（team 的），錢的五頁不重列");
  const tabs = RAIL.areaTabsHTML("finance", "budget", sp, "zh");
  assert.match(tabs, /<nav class="area-tabs keep"/);
  assert.match(tabs, /class="area-tab on" href="#budget" data-act="tab" data-t="budget" aria-current="page">預算/);
  // 沒有錢的 Sponsorship 成員：那一行沒有錢。
  assert.doesNotMatch(RAIL.railHTML("home", "team:Sponsorship Team", { ...sp, ws: { "res:Sponsorship Team": "edit" } }, {}, "zh"), />錢<\/a>/);
  // 寬螢幕上一般的區（側欄已經列出每一頁）照舊不畫那一排。
  assert.doesNotMatch(RAIL.areaTabsHTML("home", "calendar", ASSOC, "zh"), /keep/);
});

test("★ 頂欄有人與權限的人，側欄不畫；頂欄的每一頁都把職級傳給 navHTML", () => {
  assert.doesNotMatch(RAIL.railHTML("people", "roster", PRES, {}, "zh"), /<b>人與權限<\/b>/);
  for (const f of ["admin/src/main.js", "admin/people/src/main.js", "admin/site/src/main.js", "admin/finance/src/main.js", "admin/records/src/main.js",
                   "admin/marketing/src/main.js", "admin/passports/src/main.js", "admin/team-forms/src/main.js", "admin/search/src/main.js",
                   "home/src/main.js", "passport/src/main.js", "availability/src/main.js", "settings/src/main.js"]) {
    const calls = readFileSync(f, "utf8").match(/navHTML\(\{[^}]*\}\)/g) || [];
    const cadre = calls.filter(c => !/current: null/.test(c));
    assert.ok(cadre.length, f);
    for (const c of cadre) assert.match(c, /board: /, `${f}：${c}`);
  }
});

// 2026-11-27 第三版：搜尋框從頂欄搬到側欄最上面（Paul：「I want you to find somewhere else to put that search box」），按 / 跳過去。
test("★ 搜尋框在側欄最上面、首頁上面；搜尋那一頁不畫（頁面裡有一格大的）；按 / 跳過去，正在打字不搶", () => {
  const h = RAIL.railHTML("home", "home", ASSOC, {}, "zh");
  assert.match(h, /<\/span><\/div>\s*<form class="rail-q" role="search" action="\/admin\/search\/" method="get">[\s\S]*?<input type="search" name="q" maxlength="200" placeholder="搜尋紀錄、表單" aria-label="[^"]*按 \/ 跳到這裡[^"]*"[\s\S]*?<input type="hidden" name="lang" value="zh">\s*<\/form>\s*<a class="rail-item rail-area on" href="#home"/);
  assert.doesNotMatch(RAIL.railHTML("search", "search", ASSOC, {}, "zh"), /rail-q/);
  assert.match(RAIL.searchBoxHTML("home", "en"), /placeholder="Search"[\s\S]*value="en"/);
  const box = { tagName: "INPUT" }, doc = (active) => ({ activeElement: active, querySelector: sel => sel.startsWith(".rail-q") ? box : null });
  assert.equal(RAIL.slashTarget({ key: "/" }, doc({ tagName: "BODY" })), box);
  assert.equal(RAIL.slashTarget({ key: "/" }, doc({ tagName: "TEXTAREA" })), null, "正在打字");
  assert.equal(RAIL.slashTarget({ key: "/" }, doc({ tagName: "DIV", isContentEditable: true })), null);
  assert.equal(RAIL.slashTarget({ key: "/", metaKey: true }, doc({ tagName: "BODY" })), null);
  assert.equal(RAIL.slashTarget({ key: "a" }, doc({ tagName: "BODY" })), null);
  assert.match(readFileSync("shared/rail.js", "utf8"), /document\.addEventListener\("keydown", jumpToSearch\)/);
});
