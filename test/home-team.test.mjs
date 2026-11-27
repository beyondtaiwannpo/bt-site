// 側欄的「我的工作區」與 team 的頁（2026-11-23，Paul：「I don't want my members to be confused if they're in two workspaces」）。
// 跑法：node --test test/*.test.mjs
// 守的是：
//   1. 側欄多一段，一個 team 一行，照這個人被派進哪些工作區畫；好幾個 team 的人只有現在那個 team 展開。
//   2. Co-President 與 Senior Adviser 是六個 team 全部，旁邊一句「你是 …，每個 team 都進得去」。
//   3. team 的頁（/home/#team=…）把那個 team 的專案、活動、申請表、資源收在一起，沒開給我的標「只能看」。
//   4. 這一批只動版面：沒有新的資料庫函式，側欄與這一頁都不決定誰進得去。
// 為什麼這樣做：docs/2026-11-23-工作區怎麼分.md。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as UI from "../home/src/ui.js";
import * as RAIL from "../shared/rail.js";
import { PK_TEAMS } from "../admin/people/src/ui.js";

const INFO = {
  "project:winter": { kind: "project", team: "Curriculum Team", title_zh: "2027 冬令營", title_en: "Winter Camp 2027" },
  "project:intern": { kind: "project", team: "Internship Team", title_zh: "2027 暑期實習", title_en: "Summer Internship 2027" },
  "project:annual": { kind: "project", team: "", title_zh: "年會", title_en: "Annual meeting" },
  "custom:event-camp": { kind: "custom", team: "Curriculum Team", title_zh: "冬令營", title_en: "Camp" },
};
const cadre = (ws, extra) => ({ role: "cadre", board: "member", team: "", name: "N", ws: ws || {}, wsInfo: INFO, ...extra });
const ONE = cadre({ "res:Curriculum Team": "edit", "project:winter": "edit", "custom:records": "view" }, { team: "Curriculum Team" });
const TWO = cadre({ "res:Curriculum Team": "edit", "res:Internship Team": "manage", "project:winter": "edit", "project:intern": "edit", "intern-passport": "edit" }, { team: "Curriculum Team, Internship Team" });
const PRES = cadre({}, { board: "president", team: "Sponsorship Team" });
const SA = cadre({}, { board: "senior_adviser" });

test("一個工作區是哪個 team 的：res／apps 看代號，專案與活動看 info，整個 BT 的東西不算任何 team", () => {
  assert.equal(RAIL.teamOfWs("res:Curriculum Team", {}), "Curriculum Team");
  assert.equal(RAIL.teamOfWs("apps:Mentorship Team", {}), "Mentorship Team");
  assert.equal(RAIL.teamOfWs("intern-passport", {}), "Internship Team");
  assert.equal(RAIL.teamOfWs("custom:marketing-requests", {}), "Marketing Team");
  assert.equal(RAIL.teamOfWs("project:winter", INFO), "Curriculum Team");
  assert.equal(RAIL.teamOfWs("custom:event-camp", INFO), "Curriculum Team");
  assert.equal(RAIL.teamOfWs("project:annual", INFO), "", "整個 BT 的專案");
  assert.equal(RAIL.teamOfWs("project:winter", {}), "", "沒有 info 就不亂猜");
  for (const id of ["passport", "apps", "custom:records", "custom:money", "custom:team-forms", "custom:meeting-templates"]) assert.equal(RAIL.teamOfWs(id, INFO), "", id);
});

test("我在哪幾個 team：照指派算，順序固定，專案跟著它的 team", () => {
  assert.deepEqual(RAIL.myTeams(ONE), [{ team: "Curriculum Team", level: "edit", some: false,
    projects: [{ id: "project:winter", title_zh: "2027 冬令營", title_en: "Winter Camp 2027", level: "edit" }] }]);
  const two = RAIL.myTeams(TWO);
  assert.deepEqual(two.map(t => [t.team, t.level]), [["Curriculum Team", "edit"], ["Internship Team", "manage"]]);
  assert.deepEqual(two[1].projects.map(p => p.id), ["project:intern"]);
  // 只被開進一個專案、沒被派進 team 自己的工作區：那個 team 還是有一行，標「部分」。
  const only = RAIL.myTeams(cadre({ "project:winter": "edit" }));
  assert.deepEqual(only.map(t => [t.team, t.level, t.some]), [["Curriculum Team", "", true]]);
  // 設定裡勾了、但沒被派進去：有一行，沒有等級（畫面標「看」）。
  const tag = RAIL.myTeams(cadre({}, { team: "Marketing Team、Curriculum Team" }));
  assert.deepEqual(tag.map(t => [t.team, t.level, t.some]), [["Curriculum Team", "", false], ["Marketing Team", "", false]]);
  // 整個 BT 的工作區不會長出 team。
  assert.deepEqual(RAIL.myTeams(cadre({ "custom:records": "edit", passport: "manage", "project:annual": "edit" })), []);
  // 依職級的人是六個 team、都是「管」，不看他勾了什麼。
  for (const top of [PRES, SA]) assert.deepEqual(RAIL.myTeams(top).map(t => [t.team, t.level]), RAIL.TEAMS.map(t => [t, "manage"]));
  // 六個 team 的清單跟人與權限那一頁同一份、同一個順序。多一個 team 兩邊都要加。
  assert.deepEqual(RAIL.TEAMS, PK_TEAMS);
  // 學員、實習生、沒登入：沒有。
  assert.deepEqual(RAIL.myTeams({ role: "student", ws: { "res:Curriculum Team": "manage" } }), []);
  assert.deepEqual(RAIL.myTeams(null), []);
});

// 2026-11-27 第二版：「我的」與「整個 BT」合成最上面一段（不加標題），「我的工作區」在下面。
test("側欄：最上面一段每個人都一樣，下面是「我的工作區」，一個 team 一行，右邊是等級", () => {
  const h = RAIL.railHTML("forms", "projects", TWO, {}, "zh");
  assert.match(h, /<b>場地<\/b>[\s\S]*<div class="rail-group">我的工作區<\/div>/);
  assert.doesNotMatch(h, /<div class="rail-group">(我的|整個 BT)<\/div>/);
  assert.match(h, /<a class="rail-item rail-area rail-team" href="\/home\/\?lang=zh#team=Curriculum%20Team">.*?<b>Curriculum<\/b><\/span><span class="rail-lv"[^>]*>改<\/span><\/a>/);
  assert.match(h, /href="\/home\/\?lang=zh#team=Internship%20Team">.*?<b>Internship<\/b><\/span><span class="rail-lv"[^>]*>管<\/span>/);
  assert.equal((h.match(/rail-team/g) || []).length, 2);
  // 英文也一樣。
  assert.match(RAIL.railHTML("forms", "projects", TWO, {}, "en"), /My workspaces<\/div>[\s\S]*<span class="rail-lv"[^>]*>Edit<\/span>/);
  // 專案那一行在最上面那一段（工作區上面），說明是「每個 team 的…」。
  assert.match(h, /<b>專案<\/b><small>每個 team 的專案與活動<\/small>[\s\S]*<div class="rail-group">我的工作區<\/div>/);
});

const noFly = h => h.replace(/<div class="rail-fly"[^>]*><div class="rail-fly-m">[\s\S]*?<\/div><\/div>/g, "");
test("側欄：好幾個 team 的人，team 那幾行收著；現在在哪個 team 的頁，那一行才展開（Paul：「maybe we can fold them」）", () => {
  const away = RAIL.railHTML("forms", "projects", TWO, {}, "zh");
  // 收著的那幾行，底下的頁只在滑過去才跳出來的那一塊（rail-fly，2026-11-27）裡，不展開在側欄上。
  assert.doesNotMatch(noFly(away), /2027 冬令營|2027 暑期實習|>總覽</, "不在 team 的頁上：兩個 team 都收著");
  assert.match(away, /<div class="rail-row"><a class="rail-item rail-area rail-team" href="\/home\/\?lang=zh#team=Internship%20Team">[\s\S]*?<\/a><div class="rail-fly" role="group" aria-label="Internship"><div class="rail-fly-m"><a class="rail-item rail-sub" href="\/home\/\?lang=zh#team=Internship%20Team">總覽<\/a><a class="rail-item rail-sub" href="\/admin\/\?lang=zh#projects\/project%3Aintern">2027 暑期實習<\/a>/, "滑過去看得到總覽與專案");
  const at = RAIL.railHTML("home", "team:Internship Team", TWO, {}, "zh");
  assert.match(at, /<a class="rail-item rail-area rail-team here" href="#team=Internship%20Team">/, "同一個資料夾只換 #");
  assert.match(at, /<div class="rail-subs"><a class="rail-item rail-sub on" href="#team=Internship%20Team" aria-current="page">總覽<\/a><a class="rail-item rail-sub" href="\/admin\/\?lang=zh#projects\/project%3Aintern">2027 暑期實習<\/a><a class="rail-item rail-sub" href="\/admin\/site\/\?lang=zh#res">資源庫<\/a><a class="rail-item rail-sub" href="\/admin\/site\/\?lang=zh#island">BT 島的貼文<\/a><a class="rail-item rail-sub" href="\/admin\/site\/\?lang=zh#island-map">BT 島<\/a><a class="rail-item rail-sub rail-people" href="\/admin\/\?lang=zh#members=res%3AInternship%20Team"/,
    "改得動這個 team 的人：資源庫與 BT 島在 team 底下（2026-11-27 第二版）");
  // 在資源庫那一頁：沒有「對外網站」那一行的人，亮他第一個改得動的 team，另一個收著，「資源庫」只亮一次。
  const res = RAIL.railHTML("site", "res", TWO, {}, "zh");
  assert.match(res, /rail-team here" href="\/home\/\?lang=zh#team=Curriculum%20Team">/);
  assert.equal((res.match(/rail-sub on" href="#res"/g) || []).length, 1);
  assert.doesNotMatch(noFly(at), /2027 冬令營/, "另一個 team 還是收著");
  assert.equal((at.match(/rail-subs/g) || []).length, 1);
  assert.doesNotMatch(at, /rail-area on"/, "首頁那一行不亮");
  // 「改」的人沒有「誰在這裡」。
  assert.doesNotMatch(RAIL.railHTML("home", "team:Curriculum Team", TWO, {}, "zh"), /members=res%3ACurriculum/);
});

test("側欄：只在一個 team 的人，那一行一直開著，底下是總覽與他進得去的專案", () => {
  const h = RAIL.railHTML("records", "overview", ONE, {}, "en");
  assert.match(h, /rail-team" href="\/home\/\?lang=en#team=Curriculum%20Team">[\s\S]*?<div class="rail-subs"><a class="rail-item rail-sub" href="\/home\/\?lang=en#team=Curriculum%20Team">Overview<\/a><a class="rail-item rail-sub" href="\/admin\/\?lang=en#projects\/project%3Awinter">Winter Camp 2027<\/a><a class="rail-item rail-sub" href="\/admin\/site\/\?lang=en#res">Resources<\/a><a class="rail-item rail-sub" href="\/admin\/site\/\?lang=en#island">Island posts<\/a><a class="rail-item rail-sub" href="\/admin\/site\/\?lang=en#island-map">BT Island<\/a><\/div>/);
  // 只能看的人沒有資源庫與 BT 島那幾條（改不動）。
  assert.doesNotMatch(RAIL.railHTML("home", "home", cadre({ "res:Curriculum Team": "view" }), {}, "zh"), /#island-map/);
  // 一個 team、底下沒有東西可列（只勾了標籤）：不展開，就是一行。
  const tag = RAIL.railHTML("site", "res", cadre({}, { team: "Curriculum Team" }), {}, "zh");
  assert.match(tag, /rail-team" href="[^"]*">.*?<span class="rail-lv dim"[^>]*>看<\/span>/);
  assert.doesNotMatch(tag, /rail-subs/);
  // 只開了一個專案：標「部分」。
  assert.match(RAIL.railHTML("site", "res", cadre({ "project:winter": "edit" }), {}, "zh"), /<span class="rail-lv dim"[^>]*>部分<\/span>/);
});

// 2026-11-27 第二版：Co-President 與 Senior Adviser 的六個 team 收成一行「所有 team」，滑過去選 team，錢接在 Sponsorship 後面。
test("側欄：Co-President 與 Senior Adviser 的六個 team 收成一行；沒有 team 的幹部看到一句找誰；學員沒有這一段", () => {
  const p = RAIL.railHTML("forms", "projects", PRES, {}, "en");
  assert.equal((p.match(/class="rail-item rail-area rail-team/g) || []).length, 1);
  assert.match(p, /My workspaces<\/div><div class="rail-row"><a class="rail-item rail-area rail-team" href="\/home\/\?lang=en#team=Curriculum%20Team">[\s\S]*?<b>Teams<\/b>[\s\S]*?<span class="rail-lv" title="You are Co-President, so every team is open to you\.">6<\/span>/);
  assert.match(p, /aria-label="Teams"><div class="rail-fly-m"><a class="rail-item rail-sub" href="\/home\/\?lang=en#team=Curriculum%20Team">Curriculum<\/a>[\s\S]*?>Sponsorship<\/a><a class="rail-item rail-sub rail-sub2" href="\/admin\/finance\/\?lang=en#overview">Money<\/a>[\s\S]*?>Community Relations<\/a><\/div>/);
  assert.match(RAIL.railHTML("forms", "projects", SA, {}, "zh"), /title="你是 Senior Adviser，每個 team 都進得去。"/);
  assert.equal((p.match(/rail-subs/g) || []).length, 1, "只有專案那一區展開");
  // 在某個 team 的頁：那一行展開，六個 team 都列出來，現在那一個亮著；沒有「誰在這裡」（他在「人與權限 → 工作區」管）。
  const mk = RAIL.railHTML("home", "team:Marketing Team", PRES, {}, "zh");
  assert.match(mk, /rail-team here"[\s\S]*?<div class="rail-subs">[\s\S]*?<a class="rail-item rail-sub on" href="#team=Marketing%20Team" aria-current="page">Marketing<\/a>/);
  assert.doesNotMatch(mk, /rail-people|#members=/);
  assert.match(RAIL.railHTML("finance", "budget", PRES, {}, "zh"), /<a class="rail-item rail-sub rail-sub2 on" href="#overview" data-act="tab" data-t="overview" aria-current="page">錢<\/a>/, "在錢那幾頁，Sponsorship 後面的「錢」亮著");
  const none = RAIL.railHTML("home", "home", cadre({ "custom:records": "view" }), {}, "zh");
  assert.match(none, /我的工作區<\/div><div class="rail-foot rail-none">你還沒被派進任何 team。/);
  assert.doesNotMatch(none, /rail-team/);
  const stu = RAIL.railHTML("home", "home", { role: "student", ws: {} }, {}, "zh");
  assert.doesNotMatch(stu, /我的工作區|rail-team|rail-none/);
});

test("側欄：team 的名字與專案名字一律跳脫", () => {
  const evil = cadre({ "res:<img src=x>": "edit", "project:x": "edit" }, { wsInfo: { "project:x": { kind: "project", team: "<img src=x>", title_zh: "<b>壞</b>", title_en: "<b>bad</b>" } } });
  const h = RAIL.railHTML("home", "team:<img src=x>", evil, {}, "zh");
  assert.ok(!h.includes("<img src=x>") && !h.includes("<b>壞</b>"));
});

// ── team 的頁 ──────────────────────────────────────────────────────────
const DATA = {
  projects: [
    { id: "project:winter", team: "Curriculum Team", title_zh: "2027 冬令營", title_en: "Winter Camp 2027", active: true, level: "edit", events: ["e1", "e2"], forms: [{ id: "f-mentor", title: "Mentor 報名", status: "draft" }] },
    { id: "project:old", team: "Curriculum Team", title_zh: "舊專案", title_en: "Old", active: false, level: null, events: [], forms: [] },
    { id: "project:intern", team: "Internship Team", title_zh: "2027 暑期實習", title_en: "Summer Internship 2027", active: true, level: null, events: [], forms: [] },
  ],
  events: [
    { id: "e1", slug: "camp", team: "Curriculum Team", workspace_id: "custom:event-camp", form_id: "f-camp", title_zh: "冬令營", title_en: "Camp", status: "published", starts_at: "2026-12-19T01:00:00Z", project_id: "project:winter", source: "site" },
    { id: "e2", slug: "pre", team: "Curriculum Team", workspace_id: "custom:event-pre", form_id: null, title_zh: "行前會", title_en: "Pre-camp", status: "draft", starts_at: null, project_id: "project:winter", source: "site" },
    { id: "e3", slug: "talk", team: "Curriculum Team", workspace_id: "custom:event-talk", form_id: null, title_zh: "分享會", title_en: "Talk", status: "ready", starts_at: "2027-01-05T10:00:00Z", project_id: null, source: "site" },
    { id: "e4", slug: "old-camp", team: "Curriculum Team", workspace_id: "custom:records", form_id: null, title_zh: "2024 營隊", title_en: "Camp 2024", status: "archived", starts_at: "2024-01-05T10:00:00Z", project_id: null, source: "import" },
  ],
  forms: [
    { id: "f-camp", team: "Curriculum Team", kind: "event", title: "冬令營報名", status: "open" },
    { id: "f-mentor", team: "Curriculum Team", kind: "program", title: "Mentor 報名", status: "draft" },
    { id: "f-recruit", team: "Curriculum Team", kind: "board", title: "Curriculum 招募", status: "open" },
    { id: "f-fb", team: "Curriculum Team", kind: "post-event", title: "活動後回饋", status: "open" },
  ],
  resources: [{ id: "r1", title: "申請時間表", team: "Curriculum Team", status: "published" }, { id: "r2", title: "草稿", team: "Curriculum Team", status: "draft" }],
  people: [{ id: "p1", name_zh: "導", name_en: "Dee", team: "Curriculum Team", title_en: "Director of Curriculum" }, { id: "p2", name_zh: "員", name_en: "Em", team: "Curriculum Team", title_en: "Associate" },
    { id: "p3", name_zh: "別", name_en: "Bea", team: "Marketing Team", title_en: "Director" }],
};
const ME1 = cadre({ "res:Curriculum Team": "edit", "project:winter": "edit", "custom:event-camp": "edit", "custom:event-pre": "edit", "custom:event-talk": "edit" });

test("team 的頁：專案底下列它的活動，其他活動另外一塊；舊活動、別的 team、活動自己的報名表不算進來", () => {
  UI.setLang("zh");
  const v = UI.teamView("Curriculum Team", DATA, ME1);
  assert.deepEqual(v.projects.map(p => [p.id, p.level, p.active, p.forms, p.events.map(e => e.slug)]),
    [["project:winter", "edit", true, 1, ["camp", "pre"]], ["project:old", "", false, 0, []]]);
  assert.deepEqual(v.loose.map(e => [e.slug, e.level]), [["talk", "edit"]]);
  assert.equal(v.old, 1, "紀錄倒進來的那一場只算數，不列");
  assert.deepEqual(v.forms.map(f => f.id), ["f-recruit"], "活動的報名表、專案的報名表、活動後回饋都不在這一塊");
  assert.deepEqual(v.directors, ["導"]);
  assert.equal(v.mine.level, "edit");
  assert.equal(v.resources.length, 2);
});

test("team 的頁：沒開給我的標「只能看」，改得動的才有「開一個專案」；依職級的人每一樣都是「管」", () => {
  UI.setLang("zh");
  // 只勾了標籤、沒被派進去的人。
  const outsider = cadre({}, { team: "Curriculum Team" });
  // projects_list() 回的 level 是「看的人」自己的等級，所以沒被派進去的人每一個專案都是 null。
  const o = UI.teamHTML("Curriculum Team", { ...DATA, projects: DATA.projects.map(p => ({ ...p, level: null })) }, outsider, "Asia/Taipei");
  assert.match(o, /你沒被派進這個 team 的工作區/);
  assert.doesNotMatch(o, /開一個專案|開一場活動|誰在這個 team/);
  assert.equal((o.match(/class="tag lv dim">只能看/g) || []).length, 5, "兩個專案加三場活動都是只能看");
  // 「改」的人：開給他的標等級，沒開給他的那個專案還是只能看。
  const h = UI.teamHTML("Curriculum Team", DATA, ME1, "Asia/Taipei");
  assert.match(h, /<h1>Curriculum<\/h1>/);
  assert.match(h, /你在這個 team 是「改」。team 自己的活動、會議、資源你改得動。專案要另外開給你/);
  assert.match(h, /Director：導/);
  assert.match(h, /href="\/admin\/\?lang=zh#projects\/project%3Awinter">2027 冬令營<\/a><span class="tag lv" title="你的">改<\/span>/);
  assert.match(h, /舊專案<\/a><span class="tag lv dim">只能看<\/span><span class="tag st archived">收起來了<\/span>/);
  assert.match(h, /href="\/admin\/\?lang=zh#events\/camp">冬令營<\/a><span class="tag st published">對外中<\/span><span class="tag lv" title="你的">改<\/span><span class="mini">12\/19/);
  assert.match(h, /行前會<\/a><span class="tag st draft">草稿<\/span>.*?日期還沒定/);
  assert.match(h, /1 份報名表/);
  assert.match(h, /另外有 1 場舊活動只在紀錄裡。/);
  assert.match(h, /開一個專案<\/a>/);
  assert.match(h, /href="\/admin\/site\/\?lang=zh#res">到資源庫<\/a>/);
  assert.doesNotMatch(h, /誰在這個 team/, "「改」的人派不了人");
  // 「管」的人多一顆誰在這個 team。
  assert.match(UI.teamHTML("Curriculum Team", DATA, cadre({ "res:Curriculum Team": "manage" }), "Asia/Taipei"), /href="\/admin\/\?lang=zh#members=res%3ACurriculum%20Team">誰在這個 team<\/a>/);
  // Co-President：一句依職級，每一樣都是「管」。
  const p = UI.teamHTML("Curriculum Team", DATA, PRES, "Asia/Taipei");
  assert.match(p, /你是 Co-President，這個 team 的每一樣你都改得動。/);
  assert.doesNotMatch(p, /只能看/);
  assert.equal((p.match(/class="tag lv" title="你的">管</g) || []).length, 5);
});

test("team 的頁：還沒讀到是載入中；哪一塊讀不到就寫載不到，其他照畫；空的 team 每一塊有一句話；標題一律跳脫", () => {
  UI.setLang("zh");
  assert.match(UI.teamHTML("Curriculum Team", undefined, ME1), /<h1>Curriculum<\/h1>[\s\S]*empty loading/);
  const half = UI.teamHTML("Curriculum Team", { ...DATA, projects: null, resources: null }, ME1, "Asia/Taipei");
  assert.equal((half.match(/這一塊現在載不到/g) || []).length, 2);
  assert.match(half, /分享會/);
  const empty = UI.teamHTML("Sponsorship Team", { projects: [], events: [], forms: [], resources: [], people: [] }, PRES, "Asia/Taipei");
  for (const s of ["這個 team 還沒有專案。", "這個 team 的活動都在專案裡，或還沒開活動。", "活動的報名表在那一場活動的頁面上。", "這個 team 還沒有放資源。", "Director：還沒有"]) assert.ok(empty.includes(s), s);
  const evil = UI.teamHTML("<img src=x>", { projects: [{ id: "project:x", team: "<img src=x>", title_zh: "<script>", title_en: "", active: true, level: "edit", events: [], forms: [] }],
    events: [], forms: [{ id: "f", kind: "program", title: "<img src=y>", status: "open" }], resources: [{ id: "r", title: "<img src=z>", status: "draft" }], people: [] }, ME1, "Asia/Taipei");
  for (const bad of ["<img src=x>", "<script>", "<img src=y>", "<img src=z>"]) assert.ok(!evil.includes(bad), bad);
  UI.setLang("en");
  assert.match(UI.teamHTML("Curriculum Team", DATA, ME1, "Asia/Taipei"), /Your level on this team is Edit\.[\s\S]*1 sign-up form[\s\S]*1 older event exists only in Records\./);
  UI.setLang("zh");
});

test("這一批只動版面：team 的頁只讀不寫、沒有新的資料庫函式；每一頁都把工作區的 team 傳給側欄", () => {
  const data = readFileSync("home/src/data.js", "utf8");
  const from = data.indexOf("export async function loadTeam"), fn = data.slice(from, data.indexOf("export async function", from + 1));   // 只看 loadTeam 自己那一段
  assert.doesNotMatch(fn, /\.(insert|update|delete|upsert)\(/, "loadTeam 只讀");
  assert.deepEqual([...fn.matchAll(/rpc\("(\w+)"/g)].map(m => m[1]).sort(), ["projects_list", "public_team"], "只叫本來就有的兩支函式");
  // whoAmI() 把每個工作區的 team 與名字留下來（info），十一個畫側欄的地方都傳成 me.wsInfo。
  assert.match(readFileSync("shared/auth.js", "utf8"), /return \{ row: pr\.data \|\| null, ws, info, cached: false \}/);
  for (const dir of ["admin", "admin/site", "admin/people", "admin/passports", "admin/finance", "admin/marketing", "admin/team-forms", "admin/records"])
    assert.match(readFileSync(`${dir}/src/data.js`, "utf8"), /wsInfo: info \|\| \{\}/, `${dir}/src/data.js 的 loadMe 要帶 wsInfo`);
  for (const dir of ["home", "passport", "availability"]) assert.match(readFileSync(`${dir}/src/main.js`, "utf8"), /wsInfo:/, `${dir}/src/main.js`);
  // 側欄不 import 任何東西（純資料與純函式），這一條沒有變。
  assert.doesNotMatch(readFileSync("shared/rail.js", "utf8"), /^import /m);
});
