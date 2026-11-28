// 新的側欄（我的／BT／組織）與合併後的首頁（2026-11-14，Paul：「do the new menu and merged home」）。跑法：node --test test/*.test.mjs
// 守的是：首頁那一張「等你處理」照日期排、只列這個人真的要動手的事（跟後台那幾頁同一條權限規則）、點下去到那件事；
// 側欄的樣式在 shared/rail.css、八個後台與首頁都讀；後台沒有 # 的時候開活動，舊的「待辦」改叫「各 team」。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import * as UI from "../home/src/ui.js";
import * as RAIL from "../shared/rail.js";
import { positionsFor } from "../admin/people/src/ui.js";
UI.setLang("zh");

const ME = "u-me", OTHER = "u-o";
const now = new Date("2026-11-10T00:00:00Z");
const mt = (id, start, extra) => Object.assign({ id, title: id, scope: "board", starts_at: start, ends_at: new Date(new Date(start).getTime() + 3600000).toISOString(),
  agenda: "", doc_url: null, created_by: OTHER, required: false, attendees: [], notes: [] }, extra);
const items = UI.itemsOf([mt("wait", "2026-11-12T12:00:00Z", { attendees: [{ user_id: ME, status: "invited" }] })], [], ME);
const base = { me: ME, tz: "Asia/Taipei", now, name: "王平", senior: false, board: "member", ws: {}, people: [], forms: [], feedback: [] };
const W = {
  forms: [{ id: "f-ev", title: "冬令營報名" }, { id: "f-prog", title: "Mentorship 招募", closes_at: "2026-11-30T15:59:00Z" }, { id: "f-none", title: "沒人報" }],
  received: [{ form_id: "f-ev" }, { form_id: "f-ev" }, { form_id: "f-prog" }],
  events: [
    { id: "e1", slug: "camp", team: "Curriculum Team", workspace_id: "custom:event-camp", form_id: "f-ev", title_zh: "冬令營", starts_at: "2026-11-14T01:00:00Z", status: "published" },
    { id: "e2", slug: "far", team: "Curriculum Team", workspace_id: "custom:event-far", form_id: null, title_zh: "很久以後", starts_at: "2026-12-30T01:00:00Z", status: "ready" },
    { id: "e3", slug: "other", team: "Marketing Team", workspace_id: "custom:event-other", form_id: null, title_zh: "別人的", starts_at: "2026-11-11T01:00:00Z", status: "published" },
  ],
  requests: [
    { id: "r-new", title: "新單", status: "submitted", assignee: null, requester: OTHER, needed_by: "2026-11-20" },
    { id: "r-mine", title: "派給我", status: "in_progress", assignee: ME, requester: OTHER, publish_on: "2026-11-11" },
    { id: "r-sent", title: "我送的", status: "in_review", assignee: OTHER, requester: ME, publish_on: "2026-11-25", updated_at: "2026-11-09T00:00:00Z" },
    { id: "r-old", title: "早就退了", status: "rejected", requester: ME, updated_at: "2026-09-01T00:00:00Z" },
  ],
  posts: [{ id: "p1", school: "UW", created_by: OTHER }, { id: "p2", school: "自己的", created_by: ME }],
  stamps: 12, boxes: 33,
};

const DAY = { "custom:calendar": "edit", "custom:meetings": "edit", "custom:projects": "edit", "custom:forms": "edit", "custom:my-passport": "edit", "custom:venues": "edit" };  // 2027-01-24：整個 BT 每天用的六樣

test("首頁：一張清單，照日期排，最急的在最上面；沒有日期的排最後", () => {
  const ctx = { ...base, w: W, ws: { "res:Curriculum Team": "edit", "custom:marketing-requests": "edit" } };
  const L = UI.waitingList(items, ctx);
  const due = L.filter(o => o.due).map(o => +o.due);
  assert.deepEqual(due, [...due].sort((a, b) => a - b), "有日期的照日期排");
  const firstNull = L.findIndex(o => !o.due);
  assert.ok(firstNull < 0 || L.slice(firstNull).every(o => !o.due), "沒有日期的全部在後面");
  assert.equal(L[0].kind, "rq", "11/11 要發的那一張派給我的需求最急");
  assert.ok(L.some(o => o.kind === "rsvp" && o.it.id === "wait"), "等回覆的會在同一張清單裡");
});

test("首頁：報名等審核只列改得動的那幾份；活動的跟著那一場或那個 team，其他申請跟著 apps", () => {
  const ed = UI.waitingList([], { ...base, w: W, ws: { "res:Curriculum Team": "edit" } }).filter(o => o.kind === "apps");
  assert.deepEqual(ed.map(o => o.title), ["冬令營"]);
  assert.equal(ed[0].sub, "2 份還沒看");
  assert.match(ed[0].href, /^\/admin\/\?lang=zh#forms\/f-ev$/);
  assert.equal(UI.waitingList([], { ...base, w: W, ws: { "res:Curriculum Team": "view" } }).filter(o => o.kind === "apps").length, 0, "team 只能看的人不列");
  assert.deepEqual(UI.waitingList([], { ...base, w: W, ws: { apps: "edit" } }).filter(o => o.kind === "apps").map(o => o.title), ["Mentorship 招募"]);
  assert.equal(UI.waitingList([], { ...base, w: W, senior: true, board: "president" }).filter(o => o.kind === "apps").length, 2, "senior 全部");
});

test("首頁：行銷需求。派給我的一定列；新單只有 Marketing（需求工作區改以上）列；我送的在跑或在審也列，退件太久的不列", () => {
  const plain = UI.waitingList([], { ...base, w: W });
  assert.deepEqual(plain.filter(o => o.kind === "rq").map(o => o.title), ["派給我"]);
  assert.deepEqual(plain.filter(o => o.kind === "myrq").map(o => o.title), ["我送的"]);
  assert.equal(plain.find(o => o.kind === "myrq").sub, "現在是「待審核」");
  assert.match(plain.find(o => o.kind === "myrq").href, /#request\/r-sent$/);
  const mkt = UI.waitingList([], { ...base, w: W, ws: { "custom:marketing-requests": "edit" } });
  assert.deepEqual(mkt.filter(o => o.kind === "rq").map(o => o.title).sort(), ["新單", "派給我"].sort());
  assert.match(mkt.find(o => o.title === "新單").href, /#requests\/r-new$/);
});

test("首頁：貼文核可不列自己開的那一篇；活動七天內、改得動的才列，有報名表的連到簽到", () => {
  const L = UI.waitingList([], { ...base, w: W, ws: { "res:Curriculum Team": "edit" } });
  assert.deepEqual(L.filter(o => o.kind === "post").map(o => o.title), ["UW"]);
  assert.match(L.find(o => o.kind === "post").href, /^\/admin\/marketing\/\?lang=zh#post\/p1$/);
  const ev = L.filter(o => o.kind === "event");
  assert.deepEqual(ev.map(o => o.title), ["冬令營"], "別的 team 的不列、一個月後的不列");
  assert.match(ev[0].href, /#forms\/f-ev\/checkin$/);
});

test("首頁：senior 多四種（團隊頁、校友故事、等上線的活動、寄不出去的信、沒填 team 的人）；一般幹部一個都沒有", () => {
  const w = { ...W, team: [{ id: "a" }], stories: [{ story_approved: false }, { story_approved: true }], stuck: [{ id: 1 }], roster: [{ id: "x", team: "" }, { id: "y", team: "Curriculum Team" }] };
  const sen = UI.waitingList([], { ...base, w, senior: true, board: "president" });
  for (const k of ["team", "stories", "ready", "mail", "roster"]) assert.ok(sen.some(o => o.kind === k), k);
  assert.equal(sen.find(o => o.kind === "stories").title, "1 篇等你核可");
  assert.equal(sen.find(o => o.kind === "roster").title, "1 位還沒填 team");
  const mem = UI.waitingList([], { ...base, w });
  for (const k of ["team", "stories", "ready", "mail", "roster"]) assert.ok(!mem.some(o => o.kind === k), k);
});

test("首頁：讀不到（null）就當沒有，不會整頁壞掉", () => {
  const w = { forms: null, received: null, events: null, requests: null, stamps: null, boxes: null };
  assert.deepEqual(UI.waitingList([], { ...base, w }), []);
  assert.equal(UI.passportHTML(w), "");
  assert.doesNotThrow(() => UI.homeHTML([], { ...base, w: null }));
});

// 2026-11-27 第二版：側欄的「新增」拿掉，提需求、記一場會議、排一場會回到首頁與 team 頁的標題底下（test/home.test.mjs 守）。
test("首頁的樣子：等你處理、接下來、我的護照；最常做的事在標題底下", () => {
  const h = UI.homeHTML(items, { ...base, w: W });
  assert.match(h, /<nav class="quick"[\s\S]*?#request"/, "提需求在標題底下");
  assert.match(h, /<h2>等你處理 <span class="count">\d+<\/span><\/h2>/);
  assert.ok(h.indexOf("等你處理") < h.indexOf("接下來") && h.indexOf("接下來") < h.indexOf("我的護照"), "順序：等你處理、接下來、護照");
  assert.match(h, /蓋了 12 格，一共 33 格/);
  assert.doesNotMatch(h, /class="dos"/);
  assert.match(h, /data-act="rsvp" data-st="accepted" data-id="wait"/, "等回覆的會照舊直接按");
  assert.match(UI.homeHTML([], { ...base, w: {} }), /現在沒有等你處理的事/);
  const evil = UI.homeHTML([], { ...base, w: { ...W, posts: [{ id: "p", school: "<img src=x>", created_by: OTHER }] }, ws: {} });
  assert.ok(!evil.includes("<img src=x>"), "標題一律跳脫");
});

// 2026-11-27 第二版（Paul：「me and whole BT, essentially they're the same thing」）：最上面一段不加標題，是每個人都一樣的那幾行；
// 下面是「我的工作區」：我的 team，接著被派進去的（對外網站、行銷、護照、紀錄），標「指派」。
test("側欄：最上面一段（首頁、行事曆、會議、專案、表單、紀錄；我的護照 2026-11-28 搬到頂欄），下面「我的工作區」；行事曆底下是行事曆、時間看板，會議底下是會議、會議範本", () => {
  assert.deepEqual(RAIL.SECTIONS.map(s => s.key), ["me", "ws"]);
  assert.equal(RAIL.SECTIONS[0].label, null, "最上面一段沒有標題");
  // 2027-01-24：整個 BT 的東西（含被派才有的紀錄、幹部護照、對外網站）都在最上面那一段；「我的工作區」只剩 team 與 Marketing。實習護照在 Internship 底下。
  assert.deepEqual(RAIL.AREAS.map(a => a.key), ["home", "calendar", "meetings", "events", "forms", "records", "passports", "website", "marketing", "search", "people", "money", "interns"]);
  for (const k of ["home", "calendar", "meetings", "events", "forms", "records", "passports", "website"]) assert.equal(RAIL.AREAS.find(a => a.key === k).sec, "me", k);
  assert.equal(RAIL.AREAS.find(a => a.key === "marketing").sec, "ws");
  assert.equal(RAIL.AREAS.find(a => a.key === "interns").team, "Internship Team");
  // 搜尋在頂欄的框，人與權限在頂欄（Co-President 與 Senior Adviser），錢在 Sponsorship 那一行後面。
  assert.equal(RAIL.AREAS.find(a => a.key === "search").sec, "top");
  assert.equal(RAIL.AREAS.find(a => a.key === "people").sec, "top");
  assert.equal(RAIL.AREAS.find(a => a.key === "money").team, "Sponsorship Team");
  const recruiter = { role: "cadre", board: "member", team: "", name: "r", ws: { apps: "edit" } };
  assert.match(RAIL.railHTML("forms", "projects", recruiter, {}, "zh"), /<b>人與權限<\/b>/, "頂欄沒有人與權限的人，看得到幹部招募就畫在側欄，不然沒有入口");
  assert.doesNotMatch(RAIL.railHTML("forms", "projects", { ...recruiter, board: "president" }, {}, "zh"), /<b>人與權限<\/b>/, "Co-President 的人與權限在頂欄，側欄不重複");
  // 紀錄在最上面那一段，跟大家都有的那幾行排在一起，不再標「指派」（2027-01-24）。
  const rec = RAIL.railHTML("home", "home", { ...recruiter, ws: { ...DAY, records: "view" } }, {}, "zh");
  assert.match(rec, /<b>表單<\/b>[\s\S]*<b>紀錄<\/b>[\s\S]*<div class="rail-group">我的工作區<\/div>/);
  assert.doesNotMatch(rec, /指派/);
  // 2026-12-26：專案那一行底下是專案、活動…；場地是整個 BT 的，自己一行。
  // 2026-11-26：「各 team」拿掉了，「計畫與招募」改叫「幹部招募」搬到「人與權限」底下（被派進申請工作區的人與 Co-President、Senior Adviser 才看得到）。
  assert.deepEqual(RAIL.visibleItems("events", { role: "cadre", board: "member", team: "", ws: DAY }).map(i => i.key), ["projects", "events"]);
  assert.deepEqual(RAIL.visibleItems("events", { role: "cadre", board: "member", team: "", ws: {} }).map(i => i.key), [], "沒被派進專案的看不到");
  // 回饋表第二版搬到「表單」底下（三種表單一個入口），看得到的人照舊是被派進紀錄的人。
  assert.deepEqual(RAIL.visibleItems("forms", { role: "cadre", board: "member", team: "", ws: { ...DAY, records: "view" } }).map(i => i.key), ["fill", "all", "forms"]);
  assert.deepEqual(RAIL.visibleItems("forms", { role: "cadre", board: "member", team: "", ws: DAY }).map(i => i.key), ["fill", "all"], "一般幹部的表單：要我填的、所有表單");
  assert.deepEqual(RAIL.visibleItems("people", { role: "cadre", board: "member", team: "", ws: {} }).map(i => i.key), [], "沒被派進申請工作區的幹部，側欄沒有幹部招募");
  assert.deepEqual(RAIL.visibleItems("people", { role: "cadre", board: "member", team: "", ws: { apps: "edit" } }).map(i => i.key), ["forms"], "被派進申請工作區的人看得到幹部招募，看不到名單");
  assert.deepEqual(RAIL.visibleItems("people", { role: "cadre", board: "president", senior: true, team: "", ws: {} }).map(i => i.key).slice(0, 3), ["roster", "invites", "forms"]);
  assert.equal(RAIL.ITEMS.find(i => i.group === "forms" && i.key === "forms").label.en, "Recruitment"); assert.equal(RAIL.ITEMS.find(i => i.key === "teams"), undefined);
  // 2026-11-28 Paul：「put venue into records」。場地是紀錄的最後一個分頁，誰看得到照舊是 custom:venues。
  assert.deepEqual(RAIL.visibleItems("records", { role: "cadre", board: "member", team: "", ws: DAY }).map(i => i.key), ["venues"], "沒被派進紀錄的人：紀錄那一行只有場地");
  assert.deepEqual(RAIL.visibleItems("records", { role: "cadre", board: "member", team: "", ws: { ...DAY, records: "view" } }).map(i => i.key), ["overview", "people", "yearly", "venues"]);
  assert.deepEqual(RAIL.visibleItems("records", { role: "cadre", board: "member", team: "", ws: { records: "view" } }).map(i => i.key), ["overview", "people", "yearly"], "沒開場地的人沒有那一頁");
  const me = { role: "cadre", board: "member", team: "Curriculum Team", name: "a", ws: { ...DAY, "custom:meeting-templates": "edit" } };
  assert.deepEqual(RAIL.visibleItems("calendar", me).map(i => i.label.zh), ["行事曆", "時間看板"]);
  assert.deepEqual(RAIL.visibleItems("meetings", me).map(i => i.label.zh), ["會議", "會議範本"]);
  const tabs = RAIL.areaTabsHTML("forms", "meetings", me, "zh");
  assert.match(tabs, /class="area-tab on" href="#meetings" data-act="tab" data-t="meetings"/);
  assert.match(tabs, /href="#mtemplates" data-act="tab" data-t="mtemplates">會議範本/);
  assert.doesNotMatch(tabs, /時間看板/);
  assert.match(RAIL.areaTabsHTML("home", "calendar", me, "zh"), /href="\/availability\/\?lang=zh">時間看板/);
  // 首頁那一頁上：首頁與行事曆是同一個資料夾，換 # 就好
  const h = RAIL.railHTML("home", "home", me, {}, "zh");
  assert.match(h, /class="rail-item rail-area on" href="#home" data-act="tab" data-t="home" aria-current="page"/);
  assert.match(h, /href="#calendar" data-act="tab" data-t="calendar"/);
  assert.ok(!RAIL.railHTML("home", "home", { role: "student", ws: {} }, {}, "zh").includes("rail-area"), "學員沒有側欄的任何一行");
  // 各 team（以前的待辦）2026-11-26 拿掉了；幹部招募掛在「人與權限」底下，頁面還是 /admin/ 那一個資料夾
  assert.equal(RAIL.ITEMS.find(i => i.group === "forms" && i.key === "forms").area, "people");
  assert.ok(!RAIL.ITEMS.some(i => i.area === "todo"));
});

test("側欄的樣式在 shared/rail.css：九個後台資料夾與首頁都讀，admin.css 不再有一份", () => {
  const pages = ["admin/index.html", ...readdirSync("admin", { withFileTypes: true }).filter(d => d.isDirectory() && !["src"].includes(d.name)).map(d => `admin/${d.name}/index.html`).filter(f => { try { readFileSync(f); return true; } catch (e) { return false; } }), "home/index.html"];
  assert.equal(pages.length, 10, "2026-11-26 多了 admin/search");
  for (const f of pages) assert.match(readFileSync(f, "utf8"), /<link rel="stylesheet" href="(\.\.\/)+shared\/rail\.css\?v=/, f);
  const css = readFileSync("shared/rail.css", "utf8");
  for (const sel of [".shell{", ".rail{", ".area-tabs{", ".rail-burger{"]) assert.ok(css.includes(sel), sel);
  const admin = readFileSync("admin/admin.css", "utf8");
  assert.doesNotMatch(admin, /^\.area-tabs\{|^\.rail\{|^\.shell\{/m);
});

test("★ 時間看板與我的護照也有側欄（2026-11-14 Paul：add the sidebar to availability and passport too）", () => {
  for (const [dir, group] of [["availability", "availability"], ["passport", "passport"]]) {
    assert.match(readFileSync(`${dir}/index.html`, "utf8"), /<link rel="stylesheet" href="\.\.\/shared\/rail\.css\?v=/, dir);
    const main = readFileSync(`${dir}/src/main.js`, "utf8");
    assert.ok(main.includes(`RAIL.railHTML("${group}", ""`), `${dir} 畫側欄`);
    assert.match(main, /act === "lang"/, `${dir} 接得住側欄的中英切換`);
  }
  // 後台的護照預覽框（?bare=1）不畫側欄
  assert.match(readFileSync("passport/src/main.js", "utf8"), /if \(bare\) \{ el\.innerHTML = body; return; \}/);
  // 側欄在這兩頁展開成對的那一區
  const me = { role: "cadre", board: "member", team: "", ws: DAY };
  assert.match(RAIL.railHTML("availability", "", me, {}, "en"), /rail-sub on"[^>]*aria-current="page">Availability</);
  // 我的護照 2026-11-28 搬到頂欄：那一頁照樣有側欄，只是側欄沒有一行亮著（頂欄的「我的護照」亮）。
  assert.doesNotMatch(RAIL.railHTML("passport", "", me, {}, "en"), /aria-current="page"/);
});

test("後台：沒有 # 開活動；舊的 #teams 與 #home 也開活動（2026-11-26「各 team」那一頁拿掉了）", () => {
  const main = readFileSync("admin/src/main.js", "utf8");
  assert.match(main, /else \{ history\.replaceState\(null, "", location\.pathname \+ location\.search \+ "#events"\); await openTab\("events"\); if \(defer\) secondWave\(\); return; \}/);
  assert.match(main, /if \(t === "teams" \|\| t === "home"\) \{ history\.replaceState\(null, "", location\.pathname \+ location\.search \+ "#events"\); return openTab\("events"\); \}/);
  assert.doesNotMatch(main, /S\.view = [^;]*"home"/, "沒有那一頁了");
  const home = readFileSync("home/src/main.js", "utf8");
  assert.match(home, /RAIL\.shellHTML\(nav, RAIL\.railHTML\("home", tab, rme, \{\}, lang\(\)\)/);
});

test("名單：同一屆好幾個職位照職級排，兩位 Co-President 的職位都在第一行（Paul 2026-11-14）", () => {
  const p = { positions: [
    { term: "2026-27", title_en: "Associate, Sponsorship Team", team: "Sponsorship Team" },
    { term: "2026-27", title_en: "Co-President", team: "" },
    { term: "2025-26", title_en: "Director, Curriculum Team", team: "Curriculum Team" }] };
  assert.deepEqual(positionsFor(p, "2026-27").map(x => x.title_en), ["Co-President", "Associate, Sponsorship Team"]);
  const q = { positions: [
    { term: "2026-27", title_en: "Associate, Sponsorship Team", team: "Sponsorship Team" },
    { term: "2026-27", title_en: "Adviser, Curriculum Team", team: "Curriculum Team" },
    { term: "2026-27", title_en: "Senior Adviser", team: "" }] };
  assert.deepEqual(positionsFor(q, "2026-27").map(x => x.title_en), ["Senior Adviser", "Adviser, Curriculum Team", "Associate, Sponsorship Team"]);
});
