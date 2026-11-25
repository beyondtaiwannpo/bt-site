// 權限三級制的畫面那一半（2026-12-25，supabase/migrations/2026-12-25-access-model.sql）。跑法：node --test test/*.test.mjs
// 門在資料庫；這裡守的是「畫面跟資料庫講同一條規則」，不要畫出按了才被退回的鈕，也不要藏掉做得到的事。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as RAIL from "../shared/rail.js";
import * as F from "../admin/src/ui.js";
import * as PE from "../admin/people/src/ui.js";
import * as PA from "../admin/passports/src/ui.js";
import * as SCH from "../availability/src/schedule.js";

F.setLang("zh");
import { setLang as peLang } from "../admin/people/src/strings.js";
peLang("zh");
const base = { role: "cadre", board: "member", team: "Curriculum Team", senior: false, ws: {} };
const PRES = { ...base, board: "president", senior: true };
const SA = { ...base, board: "senior_adviser", senior: true };
const ED = { ...base, ws: { "res:Curriculum Team": "edit" } };
const VW = { ...base, ws: { "res:Curriculum Team": "view" } };

test("team 是「改」就排得了會、開得了活動（跟 can_schedule、create_event 同一條）；「看」不行", () => {
  assert.deepEqual(F.mtScopes(ED, []), ["Curriculum Team"]);
  assert.deepEqual(F.mtScopes(VW, []), []);
  assert.deepEqual(SCH.scopesFor(false, ED.ws, []), ["Curriculum Team"]);
  assert.deepEqual(SCH.scopesFor(false, VW.ws, []), []);
  const main = readFileSync(new URL("../admin/src/main.js", import.meta.url), "utf8");
  assert.match(main, /function evTeams\(\)[\s\S]{0,400}\["edit", "manage"\]\.includes\(lv\)/, "開活動的 team 下拉：改以上");
});

test("「誰在這裡」：那一區是「管」的人才有，錢那一格 Senior Adviser 沒有（跟 assign() 同一條）", () => {
  assert.equal(RAIL.canManageWs(PRES, "custom:money"), true);
  assert.equal(RAIL.canManageWs(SA, "custom:money"), false);
  assert.equal(RAIL.canManageWs({ ...base, ws: { "custom:money": "manage" } }, "custom:money"), true);
  assert.equal(RAIL.canManageWs({ ...base, ws: { "custom:money": "edit" } }, "custom:money"), false);
  assert.equal(RAIL.canManageWs(SA, "custom:records"), true);
  assert.equal(RAIL.canManageWs(ED, "res:Curriculum Team"), false);
  assert.equal(RAIL.canManageWs({ ...base, ws: { "res:Curriculum Team": "manage" } }, "res:Curriculum Team"), true);
  assert.equal(RAIL.canManageWs({ role: "student", ws: { "custom:records": "manage" } }, "custom:records"), false);
});

test("每一區的分頁列：「管」的人多一顆「誰在這裡」連到 /admin/#members=", () => {
  const rec = { ...base, ws: { records: "edit", "custom:records": "manage" } };
  const h = RAIL.areaTabsHTML("records", "overview", rec, "zh");
  assert.match(h, /class="area-tab area-people" href="\/admin\/\?lang=zh#members=custom%3Arecords"/);
  const plain = RAIL.areaTabsHTML("records", "overview", { ...base, ws: { records: "edit", "custom:records": "edit" } }, "zh");
  assert.doesNotMatch(plain, /area-people/);
  // 2026-11-25 Paul：「for every workspaces, take out the people here. I can just go to workspaces and manage people there」。
  // Co-President 與 Senior Adviser 不畫這一顆（他們在「人與權限 → 工作區」管）；只管自己那一區的人照舊有，不然他沒有地方加人。
  assert.doesNotMatch(RAIL.areaTabsHTML("finance", "overview", PRES, "zh"), /area-people|#members=/);
  assert.doesNotMatch(RAIL.areaTabsHTML("records", "overview", SA, "zh"), /area-people|#members=/);
  assert.match(RAIL.areaTabsHTML("finance", "overview", { ...base, ws: { finance: "edit", "custom:money": "manage" } }, "zh"), /#members=custom%3Amoney/);
  assert.equal(RAIL.showPeopleHere(PRES, "custom:money"), false); assert.equal(RAIL.showPeopleHere(SA, "custom:records"), false);
  assert.equal(RAIL.showPeopleHere({ ...base, ws: { "custom:money": "manage" } }, "custom:money"), true);
  assert.equal(RAIL.showPeopleHere({ ...base, ws: { "custom:money": "edit" } }, "custom:money"), false);
  assert.equal(RAIL.canManageWs(PRES, "custom:money"), true, "門沒有變，只是那一條連結不畫");
  assert.doesNotMatch(RAIL.areaTabsHTML("finance", "overview", SA, "zh"), /area-people/, "Senior Adviser 派不了人進錢");
  // 只有一頁、但有「誰在這裡」的區也要畫出那一排
  const tpl = RAIL.areaTabsHTML("forms", "mtemplates", { ...base, ws: { "custom:meeting-templates": "manage" } }, "zh");
  assert.match(tpl, /#members=custom%3Ameeting-templates/);
});

test("後台首頁接 #members=<工作區>，回上一頁回到連過來的那一區", () => {
  const main = readFileSync(new URL("../admin/src/main.js", import.meta.url), "utf8");
  assert.match(main, /match\(\/\^members=\(\.\+\)\$\/\)/);
  assert.match(main, /if \(S\.mp && S\.mp\.fromLink && S\.mp\.canBack\) \{ history\.back\(\); return; \}/);
});

test("人的那一張卡：錢有一格、活動不畫成格子而是列一行、team 那一格叫「活動、會議、資源」（team 名字在那一列的列頭）", () => {
  const ws = [{ id: "apps", kind: "apps" }, { id: "passport", kind: "passport" }, { id: "res:Curriculum Team", kind: "res", team: "Curriculum Team" },
    { id: "custom:money", kind: "custom", title_zh: "錢（收支與預算）" }, { id: "custom:event-camp", kind: "custom", team: "Curriculum Team", title_zh: "冬令營" }];
  const p = { profile_id: "u1", board_role: "member", workspaces: [{ id: "custom:event-camp", level: "edit" }, { id: "custom:money", level: "view" }] };
  const h = PE.accessGridHTML(p, ws, false, []);
  assert.match(h, /data-ws="custom:money"/);
  assert.doesNotMatch(h, /data-ws="custom:event-camp"/);
  assert.match(h, /也在這幾場活動：<a href="\/admin\/\?lang=zh#events\/camp">冬令營<\/a>（改）/);
  assert.match(h, />活動、會議、資源</);
  assert.match(h, /Sponsorship 的 Director/);
  assert.equal(PE.wsCellHref({ id: "custom:money" }), "/admin/finance/#overview");
});

test("護照：「看」的人進得來但改不了；放行的只有換頁、預覽、回上一頁這種", () => {
  for (const ok of ["tab", "jump", "preview", "preview-close", "members-open", "cadre-back"]) assert.ok(PA.RO_OK.has(ok), ok);
  for (const no of ["act-edit", "act-del", "month-add", "dest-save", "intern-task-save", "board-apply", "ig-new"]) assert.ok(!PA.RO_OK.has(no), no);
  const main = readFileSync(new URL("../admin/passports/src/main.js", import.meta.url), "utf8");
  assert.match(main, /if \(readOnlyView\(\)\) UI\.lockReadOnly\(el\.querySelector\("\.main"\)\);/);
  assert.match(main, /CADRE_VIEWS\.includes\(S\.view\)\) return !UI\.canEditWs\(S\.me, "passport"\)/);
});

test("Senior Adviser 看得到校友故事與變動紀錄；核可名單那一格不再出現在行銷的門口", () => {
  assert.ok(RAIL.canSee(RAIL.ITEMS.find(i => i.key === "stories"), SA));
  assert.ok(RAIL.canSee(RAIL.ITEMS.find(i => i.key === "changes"), SA));
  assert.ok(!RAIL.canSee(RAIL.ITEMS.find(i => i.key === "changes"), base));
  assert.doesNotMatch(JSON.stringify(RAIL.GROUPS), /marketing-approve/);
});

test("遷移檔：team「看」的人不帶進活動、Senior Adviser 記不了錢、smoke 有跑這一支", () => {
  const sql = readFileSync(new URL("../supabase/migrations/2026-12-25-access-model.sql", import.meta.url), "utf8");
  assert.match(sql, /a\.user_id = auth\.uid\(\) and a\.level in \('edit', 'manage'\)\n/);
  assert.match(sql, /function public\.can_edit_finance\(\)[\s\S]{0,200}is_president\(\) or public\.is_sponsorship_director\(\) or coalesce\(public\.ws_my_level\('custom:money'\)/);
  assert.match(readFileSync(new URL("../scripts/db/smoke.sh", import.meta.url), "utf8"), /2026-12-25-access-model\.sql/);
});
