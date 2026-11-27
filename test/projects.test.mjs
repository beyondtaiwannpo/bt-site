// 工作區 → 專案 → 活動（2026-12-26，Paul 2026-11-14：「in one workspace, there can be multiple projects.
// And in one project, there can be multiple forms, registration, records」）。跑法：node --test test/*.test.mjs
// 資料庫那一半（誰開得了、權限往下傳、跨 team、紀錄的舊活動）在 scripts/db/smoke.sh 的「工作區 → 專案 → 活動」那一段。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as F from "../admin/src/ui.js";
import * as RAIL from "../shared/rail.js";

F.setLang("zh");
const ME = { id: "u2", role: "cadre", board: "member", team: "Curriculum Team", name: "小安", senior: false, ws: { "res:Curriculum Team": "edit", "custom:event-camp-day1": "edit", "custom:event-info": "edit" } };
const EV = (id, slug, team, extra) => ({ id, slug, team, workspace_id: "custom:event-" + slug, title_zh: slug, title_en: slug, status: "draft", source: "site", ...extra });
const EVENTS = [EV("e1", "camp-day1", "Curriculum Team"), EV("e2", "info", "Curriculum Team"), EV("e3", "mkt-fair", "Marketing Team"),
  EV("e4", "old", "Curriculum Team", { workspace_id: "custom:records", source: "import" })];
const P1 = { id: "project:camp-27", team: "Curriculum Team", title_zh: "2027 冬令營", title_en: "Winter Camp 2027", active: true, level: "edit",
  events: ["e1"], forms: [{ id: "f1", title: "學生報名", status: "open", received: 3, total: 5 }, { id: "f2", title: "Mentor 報名", status: "draft", received: 0, total: 0 }] };
const P2 = { id: "project:gala", team: null, title_zh: "年會", title_en: "Gala", active: true, level: null, events: [], forms: [] };
const P3 = { id: "project:mkt", team: "Marketing Team", title_zh: "行銷週", title_en: "Marketing week", active: true, level: "edit", events: ["e3"], forms: [] };
const PROJECTS = [P1, P2, P3];

test("★ 專案清單：整個 BT 在最前面，接著照 team 的固定順序；每一個寫幾場活動、幾份報名表", () => {
  assert.deepEqual(F.pjGroups(PROJECTS).map(g => g[0]), ["", "Curriculum Team", "Marketing Team"]);
  const h = F.projectsListHTML(PROJECTS, ["Curriculum Team"], null, "", false, false);
  assert.ok(h.indexOf("整個 BT") < h.indexOf("Curriculum") && h.indexOf("Curriculum") < h.indexOf(">Marketing<"), "分組順序");
  assert.match(h, /href="#projects\/project%3Acamp-27" data-act="pj-open" data-id="project:camp-27">2027 冬令營</);
  assert.match(h, /1 場活動・2 份報名表/);
  assert.match(h, /<b>開一個專案<\/b>[\s\S]*<select id="pj-team"><option value="Curriculum Team">Curriculum<\/option><\/select>/, "只列開得了的工作區");
  assert.doesNotMatch(F.projectsListHTML(PROJECTS, [], null, "", false, false), /開一個專案/, "開不了就不畫那一格");
  assert.match(F.projectsListHTML(null, [], null, "", false, false), /2026-12-26-projects\.sql/, "★ 遷移檔還沒跑：講清楚要先跑哪一支，不是空白");
});

test("★ 一個專案：好幾場活動、好幾份報名表；只列得出能加進來的活動", () => {
  const h = F.projectHTML(P1, PROJECTS, EVENTS, ME, "", false, { evTeams: ["Curriculum Team"] });
  assert.match(h, /<h1>2027 冬令營<\/h1><div class="lede">工作區：Curriculum/);
  assert.match(h, /data-act="ev-open" data-slug="camp-day1"/);
  assert.match(h, /href="\/admin\/records\/#overview\/e1">記分卡/, "紀錄：每一場連到它的記分卡");
  assert.match(h, /data-act="open-apps" data-id="f1">學生報名[\s\S]*3 份待審・共 5 份/);
  assert.match(h, /data-act="open-apps" data-id="f2">Mentor 報名/, "★ 兩份報名表");
  assert.match(h, /data-act="pj-form-new" data-id="project:camp-27"/);
  // 能加進來的：同 team、網站上開的、還沒在別的專案、改得動。info 可以；camp-day1 已經在裡面；mkt-fair 別隊；old 是紀錄倒進來的。
  assert.deepEqual(F.pjAddable(EVENTS, PROJECTS, P1, ME).map(e => e.id), ["e2"]);
  assert.match(h, /<select id="pj-ev-pick"[^>]*><option value="e2">/);
  assert.match(h, /data-act="pj-ev-create" data-id="project:camp-27"/, "在專案裡開一場活動");
  assert.doesNotMatch(h, /pj-save|誰在這個專案/, "只是「改」看不到設定與成員");
  const mgr = F.projectHTML({ ...P1, level: "manage" }, PROJECTS, EVENTS, ME, "", false, {});
  assert.match(mgr, /data-act="members-open" data-ws="project:camp-27"/);
  assert.match(mgr, /data-act="pj-archive" data-id="project:camp-27" data-on="0">收起來/);
  const ro = F.projectHTML({ ...P1, level: null }, PROJECTS, EVENTS, ME, "", false, { evTeams: ["Curriculum Team"] });
  assert.doesNotMatch(ro, /pj-form-new|pj-ev-pick|pj-ev-create|pj-ev-out/, "看得到、改不了的人沒有任何按鈕");
  assert.match(ro, /你只看得到，改不了/);
});

test("★ 活動頁的專案：同 team 或整個 BT、改得動的才列；紀錄的舊活動不能放", () => {
  const e1 = EVENTS[0];
  assert.equal(F.pjOf(PROJECTS, "e1"), P1);
  // 整個 BT 的 Gala 我是 null，不列；別隊的行銷週不列；現在那一個一定在。
  assert.deepEqual(F.pjChoices(PROJECTS, e1, P1).map(p => p.id), ["project:camp-27"]);
  const h = F.eventProjectHTML(e1, PROJECTS, ME, false);
  assert.match(h, /data-act="pj-open" data-id="project:camp-27">2027 冬令營<\/a>（Curriculum）/);
  assert.match(h, /<select id="ev-project" data-id="e1">\s*<option value="">不放進專案<\/option><option value="project:camp-27" selected>/);
  assert.doesNotMatch(F.eventProjectHTML(EVENTS[3], PROJECTS, ME, false), /ev-project/, "紀錄倒進來的舊活動沒有下拉");
  assert.equal(F.eventProjectHTML(e1, null, ME, false), "", "遷移檔還沒跑：不畫那一格");
  // 收起來的專案不收新的活動
  assert.deepEqual(F.pjChoices([{ ...P1, active: false }], EVENTS[1], null), []);
  // 活動清單上寫在哪個專案
  assert.match(F.eventsListHTML(EVENTS, ME, [], null, "", false, [], null, false, PROJECTS), /專案：2027 冬令營/);
});

test("專案的報名表：回專案、頁首寫是哪個專案的", () => {
  const h = F.formHeadHTML({ id: "f2", title: "Mentor 報名", status: "draft", team: "Curriculum Team", _pj: P1 }, "apps", 0);
  assert.match(h, /data-act="pj-open" data-id="project:camp-27">← 回專案「2027 冬令營」/);
  assert.match(h, /專案「2027 冬令營」的報名表/);
});

test("★ 側欄：「專案」那一行點下去是專案清單；場地在最上面那一段", () => {
  const me = { role: "cadre", board: "member", team: "", ws: {} };
  assert.equal(RAIL.visibleItems("events", me)[0].key, "projects");
  assert.equal(RAIL.areaOf("forms", "projects"), "events");
  assert.equal(RAIL.areaOf("forms", "venues"), "venues");
  assert.equal(RAIL.AREAS.find(a => a.key === "venues").sec, "me", "2026-11-27 第二版：我的與整個 BT 合成一段，場地在裡面");
  const main = readFileSync("admin/src/main.js", "utf8");
  assert.match(main, /const pj = \/\^projects\(\?:\\\/\(\.\+\)\)\?\$\/\.exec\(t \|\| ""\);/, "#projects 與 #projects/<id> 有自己的網址");
  assert.match(main, /\(S\.view === "projects" \|\| S\.view === "project"\) \? "projects"/, "側欄亮「專案」");
});

test("★ 工作區的四支小工具八份一樣：專案在它的工作區那一列、連到專案頁、排在工具後面", () => {
  assert.equal(F.wsTeamOf({ id: "project:gala", kind: "project", team: null, owner: "p1" }, [{ profile_id: "p1", team: "Sponsorship Team" }]), "", "整個 BT 的專案不看擁有人");
  assert.equal(F.wsTeamOf({ id: "custom:old-camp", kind: "project", team: "Curriculum Team" }), "Curriculum Team");
  assert.equal(F.wsCellHref({ id: "project:camp-27", kind: "project" }), "/admin/#projects/project%3Acamp-27");
  const rows = F.wsRows([{ id: "project:a", kind: "project", team: "Curriculum Team", active: true }, { id: "res:Curriculum Team", kind: "res", team: "Curriculum Team", active: true }], ["Curriculum Team"], []);
  assert.deepEqual(rows.find(r => r.team === "Curriculum Team").cells.map(c => c.id), ["res:Curriculum Team", "project:a"]);
});

// 2026-12-27 Paul：「I should be able to add people into whole BT… I get to pick whatever project I want to add or remove people from」。
test("★ 整個工作區：標題點得下去；加人時勾要開哪幾樣；一個人一列、每一樣一格開關", async () => {
  const P = await import("../admin/people/src/ui.js");
  P.setLang && P.setLang("zh");
  const WS = [{ id: "res:Curriculum Team", kind: "res", team: "Curriculum Team", active: true },
    { id: "project:camp", kind: "project", team: "Curriculum Team", title_zh: "冬令營", title_en: "Camp", active: true },
    { id: "project:fair", kind: "project", team: "Curriculum Team", title_zh: "說明會", title_en: "Fair", active: true },
    { id: "apps", kind: "apps", active: true }, { id: "custom:money", kind: "custom", active: true }];
  const cells = P.wsGroupCells(WS, "Curriculum Team", []);
  assert.deepEqual(cells.map(c => c.id), ["res:Curriculum Team", "project:camp", "project:fair"], "team 自己的工具在前、專案在後");
  assert.deepEqual(P.wsGroupCells(WS, "", []).map(c => c.id), ["apps", "custom:money"], "整個 BT 那一塊（場地不用派人，不在裡面）");
  const grp = { "res:Curriculum Team": [{ user_id: "u1", name_zh: "小安", level: "edit" }, { user_id: "u2", name_zh: "小明", level: "view" }],
    "project:camp": [{ user_id: "u1", name_zh: "小安", level: "manage" }] };
  const rows = P.grpUnion(cells, grp);
  assert.deepEqual(rows.map(r => [r.user_id, r.level, Object.keys(r.has).join(",")]), [["u1", "manage", "res:Curriculum Team,project:camp"], ["u2", "view", "res:Curriculum Team"]]);
  const h = P.wsGroupHTML("Curriculum Team", cells, grp, [], { off: ["project:fair"] }, false);
  assert.match(h, /<h2>Curriculum<span class="hint">整個工作區・3 樣/);
  assert.match(h, /data-act="grp-item" value="project:fair">/, "★ 取消勾的那一樣加人時不開");
  assert.match(h, /data-act="grp-item" value="project:camp" checked>/);
  assert.match(h, /data-act="grp-cell" data-id="u2" data-ws="project:camp"[^>]*>/, "★ 小明沒有冬令營，那一格可以勾");
  assert.doesNotMatch(h, /data-id="u2" data-ws="project:camp"[^>]* checked/);
  assert.match(h, /data-act="grp-cell" data-id="u1" data-ws="project:camp"[^>]* checked>/);
  assert.match(h, /data-act="grp-assign"[^>]*data-ws="group:Curriculum Team"/);
  assert.match(h, /data-act="grp-level"/, "左邊的等級一次改全部");
  const page = P.workspacesHTML(WS, "group:Curriculum Team", rows, [], "", false, {}, true, grp);
  assert.match(page, /<a class="rail-group wshead on" href="#ws=group%3ACurriculum%20Team" data-act="ws-pick" data-ws="group:Curriculum Team">Curriculum<\/a>/);
  assert.match(page, /id="ws-panel">[\s\S]*整個工作區/);
  // 資料庫那一半：team 的「改」不再帶到專案，只有「管」帶。
  const mig = readFileSync("supabase/migrations/2026-12-27-project-scope.sql", "utf8");
  assert.match(mig, /a.level = 'manage'[\s\S]*w.kind = 'project'/);
  assert.match(readFileSync("scripts/db/smoke.sh", "utf8"), /2026-12-27-project-scope\.sql/);
});

// 2026-12-27 Paul：「I have to change everyone from view to edit, just one by one… I want everything to work that way」。
test("★ 成員區左欄多選：勾、全選、一次改等級、一次移出；八份後台一樣、四個地方接得住", async () => {
  const P = await import("../admin/people/src/ui.js");
  P.setLang("en");
  const people = [{ id: "u1", name_en: "Ann", board_role: "member" }, { id: "u2", name_en: "Bo", board_role: "member" }, { id: "u3", name_en: "Cy", board_role: "president" }];
  const rows = [{ user_id: "u1", name_en: "Ann", board_role: "member", level: "view" }, { user_id: "u2", name_en: "Bo", board_role: "member", level: "view" }];
  const acts = { level: "members-level", remove: "members-unassign", bulk: "members-bulk" };
  let pk = P.pkReduce({}, people, ["u1", "u2"], { dataset: { act: "pk-selall", ids: "u1,u2" } });
  assert.deepEqual(pk.sel, ["u1", "u2"]);
  pk = P.pkReduce(pk, people, [], { dataset: { act: "pk-sel" }, value: "u2", checked: false });
  assert.deepEqual(pk.sel, ["u1"]);
  pk = P.pkReduce(pk, people, [], { dataset: { act: "pk-blevel" }, value: "manage" });
  const h = P.membersAreaHTML("mp", { rows, people, pk, busy: false, acts, go: { act: "members-assign", ws: "apps" } });
  assert.match(h, /data-act="pk-selall" data-ns="mp" data-ids="u1,u2"/, "全選只選一般的人，不選依職級的");
  assert.match(h, /class="ma-sel" data-act="pk-sel" data-ns="mp" value="u1"[^>]* checked/);
  assert.doesNotMatch(h, /value="u2"[^>]* checked/);
  assert.match(h, /<option value="manage" selected>Manage<\/option><\/select>\s*<button type="button" class="btn sm" data-act="members-bulk" data-op="level" data-ns="mp">Set 1 person/);
  assert.match(h, /data-act="members-bulk" data-op="remove" data-ns="mp">Remove 1 person/);
  assert.doesNotMatch(P.membersAreaHTML("mp", { rows, people, pk: {}, busy: false, acts: { level: "x", remove: "y" } }), /pk-selall/, "沒給 bulk 就不畫");
  assert.match(P.membersAreaHTML("mp", { rows, people, pk: {}, busy: false, acts }), /data-op="level" data-ns="mp" disabled/, "沒勾人按鈕是灰的");
  for (const f of ["admin/src/main.js", "admin/passports/src/main.js", "admin/site/src/main.js"]) assert.match(readFileSync(f, "utf8"), /act === "members-bulk" && S\.mp/, f);
  const pm = readFileSync("admin/people/src/main.js", "utf8");
  assert.match(pm, /act === "ws-bulk" \|\| act === "grp-bulk"/);
  assert.match(readFileSync("admin/people/src/ui.js", "utf8"), /bulk: "grp-bulk"[\s\S]*|bulk: "ws-bulk"/);
});
