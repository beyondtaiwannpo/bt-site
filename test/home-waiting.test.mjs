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

test("首頁的樣子：跟 Marketing 提需求是一顆按鈕、等你處理、接下來、我的護照；「我要…」那一排拿掉了（都在側欄）", () => {
  const h = UI.homeHTML(items, { ...base, w: W });
  assert.match(h, /<a class="btn sm" href="\/admin\/\?lang=zh#request">跟 Marketing 提需求<\/a>/);
  assert.match(h, /<h2>等你處理 <span class="count">\d+<\/span><\/h2>/);
  assert.ok(h.indexOf("等你處理") < h.indexOf("接下來") && h.indexOf("接下來") < h.indexOf("我的護照"), "順序：等你處理、接下來、護照");
  assert.match(h, /蓋了 12 格，一共 33 格/);
  assert.doesNotMatch(h, /class="dos"/);
  assert.match(h, /data-act="rsvp" data-st="accepted" data-id="wait"/, "等回覆的會照舊直接按");
  assert.match(UI.homeHTML([], { ...base, w: {} }), /現在沒有等你處理的事/);
  const evil = UI.homeHTML([], { ...base, w: { ...W, posts: [{ id: "p", school: "<img src=x>", created_by: OTHER }] }, ws: {} });
  assert.ok(!evil.includes("<img src=x>"), "標題一律跳脫");
});

test("側欄：我的（首頁、行事曆、我的護照）、BT、組織三段；行事曆底下是行事曆、會議、時間看板、會議範本", () => {
  // 2026-11-23：「我的」底下多一段「我的工作區」（ws），一個 team 一行，照人畫，不在 AREAS 裡（test/home-team.test.mjs）。
  assert.deepEqual(RAIL.SECTIONS.map(s => s.key), ["me", "ws", "work", "org"]);
  assert.deepEqual(RAIL.AREAS.map(a => a.key), ["home", "calendar", "mypassport", "events", "forms", "marketing", "website", "passports", "people", "records", "money", "venues"]);
  // 2026-12-26：專案那一行底下是專案、活動、計畫與招募、各 team；場地是整個 BT 的，自己一行。
  assert.deepEqual(RAIL.visibleItems("events", { role: "cadre", board: "member", team: "", ws: {} }).map(i => i.key), ["projects", "events", "forms", "teams"]);
  assert.deepEqual(RAIL.visibleItems("venues", { role: "cadre", board: "member", team: "", ws: {} }).map(i => i.key), ["venues"]);
  const me = { role: "cadre", board: "member", team: "Curriculum Team", name: "a", ws: { "custom:meeting-templates": "edit" } };
  assert.deepEqual(RAIL.visibleItems("calendar", me).map(i => i.label.zh), ["行事曆", "會議", "時間看板", "會議範本"]);
  const tabs = RAIL.areaTabsHTML("forms", "meetings", me, "zh");
  assert.match(tabs, /href="\/home\/\?lang=zh#calendar">行事曆/);
  assert.match(tabs, /class="area-tab on" href="#meetings" data-act="tab" data-t="meetings"/);
  assert.match(tabs, /href="\/availability\/\?lang=zh">時間看板/);
  // 首頁那一頁上：首頁與行事曆是同一個資料夾，換 # 就好
  const h = RAIL.railHTML("home", "home", me, {}, "zh");
  assert.match(h, /class="rail-item rail-area on" href="#home" data-act="tab" data-t="home" aria-current="page"/);
  assert.match(h, /href="#calendar" data-act="tab" data-t="calendar"/);
  assert.ok(!RAIL.railHTML("home", "home", { role: "student", ws: {} }, {}, "zh").includes("rail-area"), "學員沒有側欄的任何一行");
  // 各 team（以前的待辦）在活動底下
  assert.equal(RAIL.ITEMS.find(i => i.key === "teams").area, "events");
  assert.ok(!RAIL.ITEMS.some(i => i.area === "todo" || i.area === "meetings"));
});

test("側欄的樣式在 shared/rail.css：八個後台資料夾與首頁都讀，admin.css 不再有一份", () => {
  const pages = ["admin/index.html", ...readdirSync("admin", { withFileTypes: true }).filter(d => d.isDirectory() && !["src"].includes(d.name)).map(d => `admin/${d.name}/index.html`).filter(f => { try { readFileSync(f); return true; } catch (e) { return false; } }), "home/index.html"];
  assert.equal(pages.length, 9);
  for (const f of pages) assert.match(readFileSync(f, "utf8"), /<link rel="stylesheet" href="(\.\.\/)+shared\/rail\.css\?v=/, f);
  const css = readFileSync("shared/rail.css", "utf8");
  for (const sel of [".shell{", ".rail{", ".area-tabs{", ".rail-lang{", ".rail-burger{"]) assert.ok(css.includes(sel), sel);
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
  const me = { role: "cadre", board: "member", team: "", ws: {} };
  assert.match(RAIL.railHTML("availability", "", me, {}, "en"), /rail-sub on"[^>]*aria-current="page">Availability</);
  assert.match(RAIL.railHTML("passport", "", me, {}, "en"), /rail-area on"[^>]*aria-current="page">/);
});

test("後台：沒有 # 開活動；#teams 與舊的 #home 開各 team", () => {
  const main = readFileSync("admin/src/main.js", "utf8");
  assert.match(main, /else if \(!\/\^\(teams\|home\)\$\/\.test\(location\.hash\.slice\(1\)\)\) \{ history\.replaceState\(null, "", location\.pathname \+ location\.search \+ "#events"\); await openTab\("events"\); return; \}/);
  assert.match(main, /S\.view = \(t === "teams" \|\| t === "home"\) \? "home" : "list"/);
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
