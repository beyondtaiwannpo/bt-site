// 側欄重分（2026-11-27 Paul）：滑過去看得到裡面的頁、組織那一段拿掉、錢在 Sponsorship 底下、
// 對外網站收進歷史之路與 BT 島、一般幹部（Associate）只看到他用得到的東西。
// 跑法：node --test test/*.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as RAIL from "../shared/rail.js";

const ASSOC = { role: "cadre", board: "member", team: "Curriculum Team", name: "小安", ws: {} };
const ED = { ...ASSOC, ws: { "res:Curriculum Team": "edit" } };
const PRES = { role: "cadre", board: "president", team: "", name: "P", ws: {} };
const rows = h => [...h.matchAll(/class="rail-item rail-area(?: (?:on|here))?" [^>]*>[\s\S]*?<b>([^<]+)<\/b>/g)].map(m => m[1]);

test("★ Associate 的「整個 BT」只有搜尋、專案、表單、場地；表單只有要我填的", () => {
  const h = RAIL.railHTML("forms", "projects", ASSOC, {}, "zh");
  const work = h.slice(h.indexOf('<div class="rail-group">整個 BT</div>'));
  assert.deepEqual(rows(work), ["搜尋", "專案", "表單", "場地"]);
  assert.deepEqual(RAIL.visibleItems("forms", ASSOC).map(i => i.key), ["fill"]);
  for (const no of ["行銷", "對外網站", "紀錄", "護照", "人與權限", "錢"]) assert.ok(!rows(h).includes(no), `Associate 沒有${no}`);
  // 提需求照舊在最上面的「新增」裡。
  assert.match(h, /<details class="rail-new">[\s\S]*跟 Marketing 提需求/);
});

test("★ 對外網站是對外的每一樣東西：歷史之路與 BT 島搬進來，只畫給改得動的人", () => {
  for (const k of ["history", "island", "island-map"]) assert.equal(RAIL.ITEMS.find(i => i.group === "site" && i.key === k).area, "website", k);
  assert.deepEqual(RAIL.visibleItems("marketing", { ...ASSOC, ws: { "res:Marketing Team": "view" } }).map(i => i.key), ["request", "posts", "ig"]);
  assert.deepEqual(RAIL.visibleItems("website", ED).map(i => i.key), ["res", "island", "island-map"], "某個 team「改」的人：資源庫與 BT 島");
  assert.deepEqual(RAIL.visibleItems("website", { ...ASSOC, ws: { "res:Marketing Team": "edit" } }).map(i => i.key), ["res", "history", "island", "island-map"], "Marketing「改」的人多歷史之路");
  assert.deepEqual(RAIL.visibleItems("website", { ...ASSOC, ws: { "res:Curriculum Team": "view" } }), [], "只能看的人沒有");
  assert.deepEqual(RAIL.visibleItems("website", PRES).map(i => i.key), ["events", "res", "team", "stories", "mail", "history", "island", "island-map"]);
  // edit:／editany: 兩條新規則
  assert.ok(RAIL.allowed("edit:res:Marketing Team", { ...ASSOC, ws: { "res:Marketing Team": "manage" } }));
  assert.ok(!RAIL.allowed("edit:res:Marketing Team", { ...ASSOC, ws: { "res:Marketing Team": "view" } }));
  assert.ok(RAIL.allowed("editany:res:", ED)); assert.ok(!RAIL.allowed("editany:res:", ASSOC)); assert.ok(RAIL.allowed("editany:res:", PRES));
  assert.ok(!RAIL.allowed("editany:res:", { role: "student", ws: { "res:Curriculum Team": "edit" } }), "學員永遠不行");
});

test("★ 回饋表在專案底下，實習生進度牆在護照底下", () => {
  assert.equal(RAIL.ITEMS.find(i => i.group === "records" && i.key === "forms").area, "events");
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
