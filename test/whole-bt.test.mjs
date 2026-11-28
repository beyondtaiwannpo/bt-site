// 2027-01-24：整個 BT 每一樣都是一格要派的、Senior → Internal、錢在 Sponsorship、實習護照在 Internship、「誰開了哪幾樣」加人只補少的。
// Paul 2026-11-27：「calendar, meeting, projects, forms, my passport, venues… all of those should be a project we can assign to people」
// 「I add everyone into whole BT and they should just have application, cadre, meeting and everything… it doesn't show the correct ticking」
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as RAIL from "../shared/rail.js";
import { internalRow } from "../shared/auth.js";
import * as P from "../admin/people/src/ui.js";
import { setLang } from "../admin/people/src/strings.js";
setLang("zh");  // 後台字典預設英文，這一支斷言中文

const MIG = readFileSync("supabase/migrations/2027-01-24-whole-bt-tools.sql", "utf8");

test("★ 六樣每天用的：rail 與人與權限同一份清單，遷移檔六個都建、現在的幹部都先有", () => {
  assert.deepEqual(RAIL.WHOLE_BT_TOOLS, P.WHOLE_BT_TOOLS);
  for (const id of RAIL.WHOLE_BT_TOOLS) {
    assert.match(MIG, new RegExp(`\\('${id}',\\s+'custom', null,`), id);
    assert.ok(RAIL.ITEMS.some(i => i.who === "ws:" + id), `${id} 決定側欄某一頁`);
  }
  assert.match(MIG, /cross join \(values \('custom:calendar'\), \('custom:meetings'\), \('custom:projects'\), \('custom:forms'\), \('custom:my-passport'\), \('custom:venues'\)\)/);
  assert.match(MIG, /not in \('president', 'senior_adviser'\)\s+on conflict \(user_id, workspace_id\) do nothing;/, "職級的人不寫、重跑不重複");
  assert.doesNotMatch(MIG, /create policy|drop policy|alter table/i, "沒有動任何一張表的 RLS 或欄位");
});

test("★ Internal 跟 Co-President 一樣：資料庫認、畫面認，真的職級留著", () => {
  assert.match(MIG, /function public\.is_president\(\)[\s\S]*?board_role = 'president'[\s\S]*?or public\.in_internal\(\);/);
  assert.match(MIG, /function public\.is_senior\(\)[\s\S]*?'president', 'senior_adviser'[\s\S]*?or public\.in_internal\(\);/);
  assert.match(MIG, /p_ws = 'custom:internal' and not public\.is_president\(\)/, "只有 Co-President 派得了 Internal");
  assert.match(MIG, /revoke all on function public\.in_internal\(\) from public, anon;/);
  const row = { role: "cadre", board_role: "director", name_zh: "a" };
  assert.deepEqual(internalRow(row, { "custom:internal": "view" }), { role: "cadre", board_role: "president", rank_real: "director", name_zh: "a" });
  assert.equal(internalRow(row, {}), row, "沒在 Internal 的不變");
  assert.equal(internalRow({ role: "student", board_role: "member" }, { "custom:internal": "edit" }).board_role, "member", "學員永遠不會變");
  assert.equal(internalRow(null, {}), null);
  assert.equal(P.wsTeamOf({ id: "custom:internal" }), "Senior");
  assert.equal(P.wsRows([{ id: "custom:internal" }], P.TEAMS || [])[1].label, "Senior");
});

test("★ 沒被派的幹部最上面只有首頁；有六樣的跟以前一樣", () => {
  const rows = h => [...h.matchAll(/class="rail-item rail-area(?: (?:on|here))?" [^>]*>[\s\S]*?<b>([^<]+)<\/b>/g)].map(m => m[1]);
  const day = Object.fromEntries(RAIL.WHOLE_BT_TOOLS.map(id => [id, "edit"]));
  assert.deepEqual(rows(RAIL.railHTML("home", "home", { role: "cadre", board: "member", team: "", name: "n", ws: {} }, {}, "zh")), ["首頁"]);
  assert.deepEqual(rows(RAIL.railHTML("home", "home", { role: "cadre", board: "member", team: "", name: "n", ws: day }, {}, "zh")), ["首頁", "行事曆", "會議", "專案", "表單", "我的護照", "紀錄"], "場地在紀錄那一行裡（2026-11-28）");
  // 只開行事曆給他：就只有行事曆。
  assert.deepEqual(rows(RAIL.railHTML("home", "home", { role: "cadre", board: "member", team: "", name: "n", ws: { "custom:calendar": "view" } }, {}, "zh")), ["首頁", "行事曆"]);
});

test("★ 整個工作區加人：已經有其中幾樣的人照樣列在右欄，加的時候只補他少的、原本的等級不動", () => {
  const cells = [{ id: "passport" }, { id: "apps" }, { id: "custom:meetings" }];
  const grp = {
    passport: [{ user_id: "a", name_zh: "A", board_role: "member", level: "edit" }, { user_id: "b", name_zh: "B", board_role: "member", level: "edit" }],
    apps: [{ user_id: "b", name_zh: "B", board_role: "member", level: "view" }],
    "custom:meetings": [{ user_id: "b", name_zh: "B", board_role: "member", level: "view" }, { user_id: "p", name_zh: "P", board_role: "president", level: "manage" }],
  };
  assert.deepEqual(P.grpFullIds(cells, grp, []).sort(), ["b", "p"], "a 只有幹部護照，還沒全部有");
  assert.deepEqual(P.grpFullIds(cells, grp, ["apps", "custom:meetings"]).sort(), ["a", "b", "p"], "只勾幹部護照的話，a 已經有了");
  assert.deepEqual(P.grpAddOps(["a", "z"], cells, grp, [], "view"), [
    { id: "a", ws: "apps", level: "view" }, { id: "a", ws: "custom:meetings", level: "view" },
    { id: "z", ws: "passport", level: "view" }, { id: "z", ws: "apps", level: "view" }, { id: "z", ws: "custom:meetings", level: "view" }]);
  assert.deepEqual(P.grpAddOps(["a"], cells, grp, ["apps"], "edit"), [{ id: "a", ws: "custom:meetings", level: "edit" }], "沒勾的那一樣不加");
  // 畫出來：右欄標題是「勾起來的還沒全部有」，a 在右欄。
  const people = [{ id: "a", name_zh: "A", board_role: "member" }, { id: "b", name_zh: "B", board_role: "member" }];
  const h = P.wsGroupHTML("", cells, grp, people, {}, false);
  assert.match(h, /勾起來的還沒全部有（1）/);
  assert.match(h, /name="ws-member" value="a"/);
  assert.doesNotMatch(h, /name="ws-member" value="b"/);
});

test("★ 誰開了哪幾樣：分段、每一欄幾個人、名字固定在左邊；錢在 Sponsorship、實習護照在 Internship 那一行", () => {
  const cells = [{ id: "custom:calendar" }, { id: "custom:meetings" }, { id: "apps" }, { id: "project:x", kind: "project", title_zh: "X" }];
  const grp = { "custom:calendar": [{ user_id: "a", name_zh: "A", board_role: "member", level: "edit" }], apps: [{ user_id: "a", name_zh: "A", board_role: "member", level: "view" }] };
  const h = P.wsGroupHTML("", cells, grp, [{ id: "a", name_zh: "A", board_role: "member" }], {}, false);
  assert.match(h, /<tr class="wsg-sec"><th><\/th><th scope="colgroup" colspan="2">每天用的<\/th><th scope="colgroup" colspan="1" class="gap">要特別派的<\/th><th scope="colgroup" colspan="1" class="gap">專案<\/th><\/tr>/);
  assert.match(h, /<th scope="col" class="wsg-who">人<\/th>/);
  assert.match(h, /1\/1 人<\/span><\/th>/);
  assert.match(h, /<td class="y"><label><input type="checkbox" data-act="grp-cell" data-id="a" data-ws="custom:calendar"[^>]*checked><\/label><\/td>/, "跟他主要的等級一樣就不寫等級");
  assert.match(h, /data-ws="apps"[^>]*checked><span class="mini">看<\/span>/, "不一樣才寫");
  const css = readFileSync("admin/admin.css", "utf8");
  assert.match(css, /\.wsg \.wsg-who\{position:sticky;left:0/); assert.match(css, /\.wsg thead th\{position:sticky;top:0/);
  assert.equal(P.wsTeamOf({ id: "custom:money" }), "Sponsorship Team");
  assert.equal(RAIL.AREAS.find(a => a.key === "interns").team, "Internship Team");
});
