// 2027-01-24：整個 BT 每一樣都是一格要派的、Senior → Internal、錢在 Sponsorship、實習護照在 Internship、「誰開了哪幾樣」加人只補少的。
// Paul 2026-11-27：「calendar, meeting, projects, forms, my passport, venues… all of those should be a project we can assign to people」
// 「I add everyone into whole BT and they should just have application, cadre, meeting and everything… it doesn't show the correct ticking」
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as NAV from "../shared/nav.js";
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
    // 我的護照 2026-11-28 搬到頂欄：那一格決定頂欄畫不畫（shared/nav.js 的 barWs）。
    assert.ok(RAIL.ITEMS.some(i => i.who === "ws:" + id) || NAV.FEATURES.some(f => f.barWs === id), `${id} 決定側欄或頂欄某一項`);
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
  assert.deepEqual(rows(RAIL.railHTML("home", "home", { role: "cadre", board: "member", team: "", name: "n", ws: day }, {}, "zh")), ["首頁", "行事曆", "會議", "專案", "表單", "紀錄"], "場地在紀錄那一行裡、我的護照在頂欄（2026-11-28）");
  // 只開行事曆給他：就只有行事曆。
  assert.deepEqual(rows(RAIL.railHTML("home", "home", { role: "cadre", board: "member", team: "", name: "n", ws: { "custom:calendar": "view" } }, {}, "zh")), ["首頁", "行事曆"]);
});

// 2026-11-28 Paul：「I only need one thing… when I press that people, it's gonna pop on in the middle… I can find a way for me to change everyone in that workspaces at the same time」。
test("★ 整個工作區：一張名單，點一個人在畫面中間跳出每一樣跟他的等級；存的時候只寫有改的", () => {
  const cells = [{ id: "custom:calendar" }, { id: "custom:meetings" }, { id: "apps" }, { id: "project:x", kind: "project", title_zh: "X" }];
  const grp = { "custom:calendar": [{ user_id: "a", name_zh: "A", board_role: "member", level: "edit" }], apps: [{ user_id: "a", name_zh: "A", board_role: "member", level: "view" }] };
  const people = [{ id: "a", name_zh: "A", board_role: "member" }, { id: "z", name_zh: "Z", board_role: "member" }];
  const h = P.wsGroupHTML("", cells, grp, people, {}, false);
  assert.match(h, /在這個工作區 1 人・名單共 2 人/);
  assert.match(h, /data-ids="a">[\s\S]*?<span class="mini ro-sum">4 樣裡有 2 樣・改<\/span>/);
  assert.match(h, /<div class="ma-row ro-row out">[\s\S]*?value="z"[\s\S]*?<span class="mini ro-sum">不在裡面<\/span>/, "不在裡面的人列著，一樣點得到");
  // 點 a：每一樣四顆，亮的是他現在的等級；分段跟以前一樣（每天用的、要特別派的、專案）。
  const one = P.wsGroupHTML("", cells, grp, people, { dlg: { ids: ["a"], set: {} } }, false);
  assert.match(one, /<div class="ro-dlg-bg"><div class="ro-dlg" role="dialog" aria-modal="true" aria-labelledby="ro-dlg-h"/);
  assert.match(one, /<h2 id="ro-dlg-h">「A」在 整個 BT 的權限<\/h2><div class="mini">現在 4 樣裡有 2 樣。/);
  assert.match(one, /<div class="ro-dlg-sec">每天用的<\/div>[\s\S]*<div class="ro-dlg-sec">要特別派的<\/div>[\s\S]*<div class="ro-dlg-sec">專案<\/div>/);
  assert.match(one, /data-act="dlg-set" data-ws="custom:calendar" data-lv="edit" aria-pressed="true"/);
  assert.match(one, /data-act="dlg-set" data-ws="custom:meetings" data-lv="none" aria-pressed="true"/);
  assert.doesNotMatch(one, /data-lv="" /, "一個人沒有「不動」");
  assert.match(one, /data-act="dlg-save" disabled>存（0 處要改）/, "沒改就不能存");
  // 全部改成「改」：日曆本來就是改不寫；會議、專案加進來；申請從看變改。
  const all = { ids: ["a"], set: Object.fromEntries(cells.map(c => [c.id, "edit"])) };
  assert.deepEqual(P.wsDialogOps(cells, grp, all), [{ id: "a", ws: "custom:meetings", level: "edit" }, { id: "a", ws: "apps", level: "edit" }, { id: "a", ws: "project:x", level: "edit" }]);
  assert.match(P.wsGroupHTML("", cells, grp, people, { dlg: all }, false), /data-act="dlg-all" data-lv="edit" aria-pressed="true"[\s\S]*存（3 處要改）/);
  assert.deepEqual(P.wsDialogOps(cells, grp, { ids: ["a"], set: { apps: "none" } }), [{ id: "a", ws: "apps", level: null }], "「沒有」是移出");
  // 一次改兩個人：多一顆「不動」，預設全部不動；選了「管」提醒一句。
  const two = P.wsGroupHTML("", cells, grp, people, { dlg: { ids: ["a", "z"], set: { apps: "manage" } } }, false);
  assert.match(two, /一次改 2 個人（整個 BT）/);
  assert.match(two, /data-act="dlg-set" data-ws="custom:calendar" data-lv="" aria-pressed="true">不動/);
  assert.match(two, /<div class="ro-dlg-row chg"><span class="lab"><b>[^<]+<\/b><\/span><div class="seg"[^>]*>[\s\S]*?data-ws="apps" data-lv="manage" aria-pressed="true"/);
  assert.match(two, /「管」的人可以再把別人加進這個工作區。/);
  assert.deepEqual(P.wsDialogOps(cells, grp, { ids: ["a", "z"], set: { apps: "view" } }), [{ id: "z", ws: "apps", level: "view" }], "a 已經是看，不重寫");
  const css = readFileSync("admin/admin.css", "utf8");
  assert.match(css, /\.ro-dlg-bg\{position:fixed;inset:0/); assert.match(css, /body:has\(\.ro-dlg-bg\)\{overflow:hidden\}/);
});

test("★ 錢在 Sponsorship、實習護照在 Internship 那一行", () => {
  assert.equal(P.wsTeamOf({ id: "custom:money" }), "Sponsorship Team");
  assert.equal(RAIL.AREAS.find(a => a.key === "interns").team, "Internship Team");
});
