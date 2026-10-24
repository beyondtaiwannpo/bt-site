// 人與權限的後台（/admin/people/，2026-10-24 權限重新設計批 2）：
// 幹部名單（職級四級、職位與屆別、沒有帳號的人）、工作區與指派、屆別與結束這一屆、刪除成員。
// 設計：docs/2026-10-23-權限重新設計.md。跑法：node --test test/*.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { tabsHTML, rosterHTML, changesHTML, personEditHTML, personNewHTML, workspacesHTML, termsHTML, invitesPageHTML,
  accessGridHTML, afterEndHTML, wsName, slugify, findByPickName, deriveTitle, rankOfTitle, rankByName, RANK_CHOICES,
  BOARD_ROLES, boardLabel, LEVELS, levelLabel, pasteParse, nextTermId, positionFor, positionsFor, positionsLine, currentTerm, TEAMS as PEOPLE_TEAMS, setLang, T } from "../admin/people/src/ui.js";
// 後台 2026-10-19 起有中英切換，字典預設英文；這一支斷言的是中文，所以先切成中文。
setLang("zh");
import { says } from "../admin/people/src/data.js";
import { teamPickHTML, TEAMS as SETTINGS_TEAMS, setLang as settingsLang } from "../settings/src/ui.js";
settingsLang("zh");

const ME = "11111111-1111-1111-1111-111111111111";
const TERMS = [
  { id: "2026-27", title_zh: "2026-27 屆", title_en: "TERM 2026-27", starts_on: "2026-08-01", ends_on: "2027-07-31", status: "current" },
  { id: "2025-26", title_zh: "", title_en: "", starts_on: "2025-08-01", ends_on: "2026-07-31", status: "ended" },
];
const PEOPLE = [
  { person_id: "p1", profile_id: ME, name_zh: "王平", name_en: "Paul", role: "cadre", board_role: "president", team: "P/VP",
    positions: [{ term: "2026-27", title_zh: "Co-President", title_en: "Co-President", team: "" }], workspaces: [], maybe_dup: null },
  { person_id: "p2", profile_id: "22222222-2222-2222-2222-222222222222", name_zh: "小安", name_en: "", role: "cadre", board_role: "director", team: "Curriculum Team",
    positions: [{ term: "2026-27", title_zh: "", title_en: "Director, Curriculum Team", team: "Curriculum Team" }, { term: "2025-26", title_en: "Associate, Curriculum Team", team: "Curriculum Team" }],
    workspaces: [{ id: "apps:Curriculum Team", level: "manage" }, { id: "res:Curriculum Team", level: "manage" }], maybe_dup: null },
  { person_id: "p3", profile_id: "33333333-3333-3333-3333-333333333333", name_zh: "", name_en: "Mei", role: "cadre", board_role: "member", team: "Marketing Team, Internship Team",
    positions: [{ term: "2026-27", title_en: "Associate, Marketing Team", team: "Marketing Team" }], workspaces: [{ id: "intern-passport", level: "edit" }], maybe_dup: null },
  { person_id: "p4", profile_id: null, name_zh: "老幹部", name_en: "Old Cadre", role: null, board_role: null, team: null,
    positions: [{ term: "2025-26", title_en: "Director, Marketing Team", team: "Marketing Team" }], workspaces: [], pending_code: "bt-old-01", maybe_dup: ["p5"] },
  { person_id: "p5", profile_id: null, name_zh: "老幹部", name_en: "old cadre", positions: [], workspaces: [], maybe_dup: ["p4"] },
  { person_id: "p6", profile_id: "66666666-6666-6666-6666-666666666666", name_zh: "畢業的", name_en: "", role: "alumni", board_role: "member", team: "",
    positions: [{ term: "2025-26", title_en: "Associate", team: "" }], workspaces: [], maybe_dup: null },
];
const CHANGES = [
  { id: 3, changed_by: ME, target: PEOPLE[2].profile_id, target_name: "Mei", field: "assignment", old_value: "@intern-passport", new_value: "edit@intern-passport", created_at: "2026-10-24T03:00:00+00:00" },
  { id: 2, changed_by: ME, target: PEOPLE[1].profile_id, target_name: "小安", field: "board_role", old_value: "member", new_value: "director", created_at: "2026-10-21T03:00:00+00:00" },
  { id: 1, changed_by: ME, target: null, target_name: "已刪帳號的人", field: "removed", old_value: "cadre", new_value: "p9", created_at: "2026-10-20T03:00:00+00:00" },
];

test("五個分頁都在，幹部名單是第一個，邀請碼只有 Co-President 看得到", () => {
  const h = tabsHTML("roster");
  assert.match(h, /class="rail-item on" href="#roster" data-act="tab" data-t="roster"/);
  for (const k of ["workspaces", "terms", "invites", "changes"]) assert.match(h, new RegExp(`data-t="${k}"`));
  assert.doesNotMatch(tabsHTML("roster", false), /data-t="invites"/);
});

test("★ 職級五級、固定順序，畫面上不出現 board_role、member 這些字", () => {
  // 2026-10-28 第五級 Adviser。順序就是下拉與名單的順序。
  assert.deepEqual(BOARD_ROLES.map(r => r.v), ["president", "senior_adviser", "director", "adviser", "member"]);
  assert.equal(boardLabel("member"), "Associate");
  assert.equal(boardLabel("senior_adviser"), "Senior Adviser");
  assert.equal(boardLabel("adviser"), "顧問");
  assert.equal(boardLabel("nonsense"), "Associate", "不認得的值退回 Associate，不是清單第一個");
  const h = rosterHTML(PEOPLE, TERMS, ME, true, "", false, null);
  assert.doesNotMatch(h, /board_role|\bmember\b|\bsenior_adviser\b|\bpresident\b/);
  assert.match(h, /Associate/); assert.match(h, /Director/); assert.match(h, /Co-President/);
  assert.deepEqual(LEVELS, ["view", "edit", "manage"]);
  assert.equal(levelLabel("manage"), "管");
});

test("★ 名單預設只列這一屆有職位的人；歷屆全部才看得到沒有帳號的人與校友", () => {
  const cur = rosterHTML(PEOPLE, TERMS, ME, true, "", false, null);
  assert.equal((cur.match(/data-act="person-edit"/g) || []).length, 3, "這一屆三個人");
  assert.doesNotMatch(cur, /老幹部/);
  assert.match(cur, /2026-27：3 人/);
  assert.match(cur, /這是你/);
  // 2026-10-23 批 2：名單印人看的名字，不印代號。
  assert.match(cur, /Curriculum Team 的申請・管/);
  assert.match(cur, /實習護照（格子與棋盤）・改/, "名單的徽章用長名稱");
  assert.doesNotMatch(cur, /apps:Curriculum Team・/);
  assert.match(cur, /<input id="ro-search" type="search"/, "名單有找名字的框");
  assert.match(cur, /Director, Curriculum Team/);
  const all = rosterHTML(PEOPLE, TERMS, ME, true, "", false, { term: "all", team: "" });
  assert.equal((all.match(/data-act="person-edit"/g) || []).length, 6);
  assert.match(all, /沒有帳號/);
  assert.match(all, /可能是同一個人/);
  assert.match(all, /校友碼 bt-old-01 還沒用/);
  assert.match(all, /校友/);
  const past = rosterHTML(PEOPLE, TERMS, ME, true, "", false, { term: "2025-26", team: "Marketing Team" });
  assert.match(past, /老幹部/);
  assert.doesNotMatch(past, /Mei/);
  // Senior Adviser 看到的提醒不一樣，但一樣有「加一筆過去的紀錄」。
  const sa = rosterHTML(PEOPLE, TERMS, ME, false, "", false, null);
  assert.match(sa, /你是 Senior Adviser/);
  assert.match(sa, /data-act="person-new"/);
});

test("★ 變動紀錄：指派、刪人、換屆都翻成人話，刪了帳號的人還看得到名字", () => {
  const h = changesHTML(CHANGES, PEOPLE, "");
  assert.match(h, /Mei<\/b>\s*<span class="tag">指派<\/span>/);
  assert.match(h, /（沒有） @ intern-passport → <b>改 @ intern-passport<\/b>/);
  assert.match(h, /Associate → <b>Director<\/b>/);
  assert.match(h, /已刪帳號的人/);
  assert.match(h, /<span class="tag">刪除<\/span>/);
  assert.match(h, /王平 改的/);
  assert.match(changesHTML([], PEOPLE, ""), /還沒有任何變動/);
});

test("★ 改一個人：自己的職級關著；Senior Adviser 改不了職級與名字；沒帳號的人沒有職級、有發碼與刪紀錄", () => {
  const me = personEditHTML(PEOPLE[0], TERMS, ME, true, "", false, null, PEOPLE, null);
  assert.match(me, /<select id="pk-role" disabled>/);
  assert.match(me, /不能自我降級/);
  assert.doesNotMatch(me, /data-act="member-remove"/, "不能刪自己");
  const other = personEditHTML(PEOPLE[1], TERMS, ME, true, "", false, null, PEOPLE, null);
  assert.match(other, /<select id="pk-role">/);
  assert.match(other, /value="director" selected/);
  assert.match(other, /value="senior_adviser"/);
  assert.match(other, /value="Curriculum Team" checked/);
  assert.match(other, /id="pk-ten-0" value="Director, Curriculum Team"/, "這一屆的職位帶進表單");
  assert.match(other, /data-act="position-row-add"/, "可以再加一個職位");
  assert.match(other, /data-act="position-delete" data-id="p2" data-term="2026-27" data-team="Curriculum Team"/);
  assert.match(other, /歷屆：/);
  assert.match(other, /data-act="member-remove" data-id="p2"/);
  assert.match(other, /data-act="person-save" data-id="p2"/);
  // 2026-10-23 批 2：工作區那一塊是改得動的存取格，一格一個下拉，改了就存（main.js 接 grid-level）。
  const grid = other.slice(other.indexOf('class="table grid"'), other.indexOf("</table>", other.indexOf('class="table grid"')));
  assert.match(grid, /data-act="grid-level" data-id="22222222-2222-2222-2222-222222222222" data-ws="apps:Curriculum Team"[^>]*><option value="">無<\/option><option value="view">看<\/option><option value="edit">改<\/option><option value="manage" selected>管/);
  assert.match(grid, /data-ws="res:Curriculum Team"/);
  assert.match(grid, /data-ws="apps:Mentorship Team"[^>]*><option value="" selected>無/, "沒派的那一格是「無」");
  assert.match(grid, /data-ws="passport"/); assert.match(grid, /data-ws="intern-passport"/);
  assert.doesNotMatch(other, /data-act="tab" data-t="workspaces"/, "不再叫人去工作區那一頁改");
  const sa = personEditHTML(PEOPLE[1], TERMS, ME, false, "", false, null, PEOPLE, null);
  assert.match(sa, /<select id="pk-role" disabled>/);
  assert.match(sa, /<input id="pk-zh" value="小安" disabled>/);
  assert.doesNotMatch(sa, /data-act="member-remove"/);
  assert.match(sa, /id="pk-ten-0"/, "職位 Senior Adviser 改得了");
  const old = personEditHTML(PEOPLE[3], TERMS, ME, true, "", false, null, PEOPLE, null);
  assert.doesNotMatch(old, /id="pk-role"/);
  assert.match(old, /bt-old-01/);
  assert.match(old, /data-act="record-delete" data-id="p4"/);
  assert.match(old, /data-act="person-merge" data-keep="p4" data-drop="p5"/);
  const noCode = personEditHTML(PEOPLE[4], TERMS, ME, true, "", false, null, PEOPLE, null);
  assert.match(noCode, /data-act="person-code" data-id="p5"/);
});

test("★ 刪除成員是兩步：第二步列出會刪掉的東西、要把名字打一次", () => {
  const h = personEditHTML(PEOPLE[1], TERMS, ME, true, "", false, null, PEOPLE, { typed: "小" });
  assert.match(h, /護照與所有的章和心得/);
  assert.match(h, /<input id="pk-confirm" value="小"/);
  assert.match(h, /data-act="member-remove-go" data-id="p2" data-name="小安"/);
  assert.doesNotMatch(h, /data-act="member-remove"[^-]/);
});

test("存檔被擋之後剛填的東西要留在畫面上，換屆別表單換成那一屆的職位", () => {
  const h = personEditHTML(PEOPLE[1], TERMS, ME, true, "存不起來：x", false, { board_role: "president", team: "Marketing Team", rows: [{ orig: "Curriculum Team", title_zh: "", title_en: "Boss", team: "Curriculum Team" }, { orig: null, title_zh: "", title_en: "", team: "" }] }, PEOPLE, null);
  assert.match(h, /value="president" selected/);
  assert.match(h, /value="Marketing Team" checked/);
  assert.doesNotMatch(h, /value="Curriculum Team" checked/);
  assert.match(h, /id="pk-ten-0" value="Boss"/);
  assert.match(h, /data-posrow="1" data-orig="" data-isnew="1"/, "新加的那一列也留著");
  assert.match(h, /data-act="position-row-drop" data-i="1"/);
  const past = personEditHTML(PEOPLE[1], TERMS, ME, true, "", false, { term: "2025-26" }, PEOPLE, null);
  assert.match(past, /<option value="2025-26" selected>/);
  assert.match(past, /id="pk-ten-0" value="Associate, Curriculum Team"/);
  assert.equal(positionFor(PEOPLE[1], "2025-26").title_en, "Associate, Curriculum Team");
  assert.equal(currentTerm(TERMS).id, "2026-27");
});

test("加一筆過去的紀錄：預設選已經結束的那一屆，名字與職位都要有", () => {
  const h = personNewHTML(TERMS, "", false, null);
  assert.match(h, /<option value="2025-26" selected>/);
  assert.match(h, /data-act="person-create"/);
  assert.match(h, /貼一整屆/);
});

test("★ 工作區：左邊清單、右邊誰在裡面與等級、加人只列還沒在裡面的幹部，沒帳號與校友不在選單", () => {
  const ws = [{ id: "apps:Curriculum Team", kind: "apps", team: "Curriculum Team", title_zh: "Curriculum Team 的申請", title_en: "", owner: PEOPLE[1].profile_id, active: true },
              { id: "passport", kind: "passport", title_zh: "幹部護照", title_en: "", owner: ME, active: true },
              { id: "custom:old", kind: "custom", title_zh: "舊的", active: false }];
  const members = [{ user_id: PEOPLE[1].profile_id, name_zh: "小安", name_en: "", board_role: "director", level: "manage" }];
  const h = workspacesHTML(ws, "apps:Curriculum Team", members, PEOPLE, "", false, null, true);
  assert.match(h, /class="rail-item on" href="#ws=apps%3ACurriculum%20Team" data-act="ws-pick" data-ws="apps:Curriculum Team"/, "每個工作區有自己的網址");
  assert.doesNotMatch(h, /custom:old/, "停用的工作區不列");
  assert.match(h, /擁有人 小安/);
  assert.match(h, /<select data-act="ws-level" data-id="22222222-2222-2222-2222-222222222222">/);
  assert.match(h, /<option value="manage" selected>管/);
  assert.match(h, /data-act="ws-unassign" data-id="22222222-2222-2222-2222-222222222222"/);
  // 2026-10-23 批 2：找人改成打字（datalist），選項值是「名字 (英文名)」，main.js 用 findByPickName 對回去。
  const pick = h.slice(h.indexOf('<datalist id="ws-people">'), h.indexOf("</datalist>"));
  assert.match(h, /<input id="ws-person-q" list="ws-people"/);
  assert.match(pick, /<option value="Mei">/, "Mei 還沒在裡面，選得到");
  assert.doesNotMatch(pick, /小安/, "已經在裡面的不再列");
  assert.doesNotMatch(pick, /畢業的/, "校友派不了");
  assert.doesNotMatch(pick, /老幹部/, "沒帳號的派不了");
  assert.equal(findByPickName(PEOPLE, "mei").person_id, "p3");
  assert.equal(findByPickName(PEOPLE, "王平 (Paul)").person_id, "p1");
  assert.equal(findByPickName(PEOPLE, "nobody"), null);
  // 新增工作區是一張表單，不收在摺疊裡：名稱、擁有人、代號、一開始就放進去的人各自一個等級。
  assert.match(h, /<input id="wsn-en"/); assert.match(h, /<input id="wsn-slug"/);
  assert.match(h, /name="wsn-member" value="33333333-3333-3333-3333-333333333333"/);
  assert.match(h, /<select id="wsn-lv-33333333-3333-3333-3333-333333333333"/);
  assert.doesNotMatch(h, /<details/, "新增工作區不再收在摺疊裡");
  assert.equal(slugify("Winter camp 2027!"), "winter-camp-2027");
  assert.equal(wsName("apps:Curriculum Team", []), "Curriculum Team 的申請");
  assert.equal(wsName("apps:Curriculum Team", ws), "Curriculum Team 的申請");
  assert.equal(wsName("intern-passport", []), "實習護照（格子與棋盤）");
  assert.equal(wsName("custom:camp", []), "camp");
  assert.match(h, /data-act="ws-assign" data-ws="apps:Curriculum Team"/);
  assert.match(h, /data-act="ws-create"/);
  assert.doesNotMatch(workspacesHTML(ws, null, [], PEOPLE, "", false, null, false), /data-act="ws-create"/);
  assert.match(workspacesHTML([], null, [], [], "", false, null, true), /還沒有任何工作區/);
});

test("★ 屆別：人數含沒帳號的；結束這一屆三步，自己勾死、預設沒人勾、最後一步要打代號", () => {
  const h = termsHTML(TERMS, PEOPLE, ME, true, "", false, null, null);
  assert.match(h, /2026-27<\/b><span class="tag open">這一屆/);
  assert.match(h, /3 人（1 位沒有帳號）/, "2025-26：小安、畢業的有帳號，老幹部沒有");
  assert.match(h, /data-act="end-start"/);
  assert.match(h, /data-act="term-create"/);
  assert.match(h, /data-act="paste-preview"/);
  assert.doesNotMatch(termsHTML(TERMS, PEOPLE, ME, false, "", false, null, null), /data-act="end-start"/, "Senior Adviser 按不了結束這一屆");
  const s1 = termsHTML(TERMS, PEOPLE, ME, true, "", false, null, { step: 1, next: {}, keep: [], typed: "" });
  assert.match(s1, /id="en-id" value="2027-28"/, "下一屆的代號自動算");
  const s2 = termsHTML(TERMS, PEOPLE, ME, true, "", false, null, { step: 2, next: { id: "2027-28" }, keep: [], typed: "" });
  assert.match(s2, new RegExp(`value="${ME}" checked disabled`), "自己勾死");
  assert.match(s2, /value="22222222-2222-2222-2222-222222222222">/, "別人預設沒勾");
  assert.doesNotMatch(s2, /畢業的/, "校友不在名單上");
  assert.match(s2, /1 位留下/); assert.match(s2, /2 位變成校友/);
  assert.match(s2, /data-act="end-keep-all"/);
  const s3 = termsHTML(TERMS, PEOPLE, ME, true, "", false, null, { step: 3, next: { id: "2027-28" }, keep: [PEOPLE[1].profile_id], typed: "" });
  assert.match(s3, /2 位留下，1 位變成校友/);
  assert.match(s3, /id="en-typed"/);
  assert.match(s3, /data-act="end-go"/);
  // 貼一整屆的預覽
  const pv = termsHTML(TERMS, PEOPLE, ME, true, "", false, { paste: { term: "2025-26", text: "x", preview: pasteParse("王小明, Ming Wang, Director, Curriculum Team\n\n, , Associate\n李小華") } }, null);
  assert.match(pv, /讀到 2 人/);
  assert.match(pv, /第 3 行連一個名字都沒有/);
  assert.match(pv, /data-act="paste-go"/);
});

test("純函式：貼上解析、下一屆代號", () => {
  const r = pasteParse("王小明\tMing Wang\tDirector\tCurriculum Team\n李小華，Hua Lee，Associate");
  // 2026-10-24 起第三欄是職級名就推成「職級, team」，不是就當自訂文字原樣存。
  assert.deepEqual(r.rows.map(x => [x.name_zh, x.name_en, x.title_en, x.team]), [["王小明", "Ming Wang", "Director, Curriculum Team", "Curriculum Team"], ["李小華", "Hua Lee", "Associate", ""]]);
  const custom = pasteParse("林小花, Flower Lin, Head of Fun, Marketing Team");
  assert.equal(custom.rows[0].title_en, "Head of Fun"); assert.equal(custom.rows[0].title_zh, "Head of Fun");
  assert.deepEqual(r.bad, []);
  assert.equal(nextTermId("2026-27"), "2027-28");
  assert.equal(nextTermId("2099-00"), "2100-01");
  assert.equal(nextTermId("x"), "");
});

test("★ 主程式：升成 Co-President 先問一次；刪人要名字打一樣；結束這一屆要代號打一樣；自己永遠在留下的名單裡", () => {
  const src = readFileSync("admin/people/src/main.js", "utf8");
  const save = src.slice(src.indexOf('act === "person-save"'), src.indexOf('act === "position-delete"'));
  assert.match(save, /f\.board_role === "president" && UI\.needAsk\(S, b, /, "升成 Co-President 要先問一次（inline confirm）");
  assert.match(save, /done\.length \? T\("msg\.partial"/, "一半成功一半失敗要講出哪一半");
  const rm = src.slice(src.indexOf('act === "member-remove-go"'), src.indexOf('act === "person-merge"'));
  assert.match(rm, /typed !== b\.dataset\.name/);
  const end = src.slice(src.indexOf('act === "end-go"'), src.indexOf("邀請碼的新增與停用"));
  assert.match(end, /typed !== n\.id/);
  assert.match(end, /S\.end\.keep\.concat\(\[S\.user\.id\]\)/);
  assert.match(src, /isSenior\(\)/, "整組開給 Co-President 與 Senior Adviser");
});

test("★ 資料層：新表只讀、寫全部走函式，不直接 update profiles，也不寫 role_changes", () => {
  const src = readFileSync("admin/people/src/data.js", "utf8").replace(/\/\/[^\n]*/g, "");
  assert.doesNotMatch(src, /from\("(profiles|role_changes|people|positions|assignments|workspaces|terms)"\)\s*\.(insert|update|upsert|delete)/);
  for (const fn of ["set_board_role", "set_team", "roster", "assign", "unassign", "rename_person", "remove_member", "delete_person",
                    "merge_people", "create_invite_for", "set_position", "import_positions", "create_term", "end_term", "create_workspace"]) {
    assert.ok(src.includes(`rpc("${fn}"`) || src.includes(`rpc(fn`) && src.includes(`"${fn}"`), `data.js 沒有叫 ${fn}`);
  }
});

test("★ 錯誤碼翻成人話，指到對的遷移檔", () => {
  for (const code of ["bad_role", "cannot_demote_self", "not_a_cadre", "not_president", "not_senior", "not_ws_manage:apps:X", "not_ws_edit:passport",
                      "cannot_remove_self", "has_unused_invite", "record_claimed", "both_have_accounts", "must_keep_self", "term_exists", "no_account", "has_account"]) {
    const m = says(new Error(code));
    assert.ok(!/[a-z]_[a-z]/.test(m), `${code} 翻出來的句子裡還有代碼：${m}`);
  }
  assert.match(says(new Error("Could not find the function public.roster(")), /2026-10-24-ranks-and-workspaces\.sql/);
  assert.match(says(new Error('relation "public.terms" does not exist')), /2026-10-24-ranks-and-workspaces\.sql/);
  assert.match(says(new Error('relation "public.role_changes" does not exist')), /2026-10-21-people-admin\.sql/);
});

// ── 設定頁那一側 ─────────────────────────────────────────────────────
// 2026-10-24 起 team 只是標籤：沒有鎖、沒有「要 Co-President 加」的格子，每個人自己勾。
test("★ 設定頁的 team 勾選：每一格都開著、本來就有的照樣勾著、清單外的值原樣留著", () => {
  const h = teamPickHTML("Marketing Team, Odd Team");
  assert.doesNotMatch(h, /disabled/);
  assert.match(h, /value="Internship Team"/);
  assert.match(h, /value="Marketing Team" checked/);
  assert.match(h, /value="Odd Team" checked/);
  assert.match(h, /只是標籤/);
  assert.match(h, /工作區/);
});

test("★ 設定頁存檔：team 一律送勾的那幾格，不再送 public_title", () => {
  const src = readFileSync("settings/src/main.js", "utf8");
  assert.match(src, /team: pickedTeams\(\) \|\| null/);
  assert.doesNotMatch(src.replace(/\/\/[^\n]*/g, ""), /public_title/);
});

test("★ people 的 TEAMS 跟設定頁那一份逐字一樣", () => {
  assert.deepEqual(PEOPLE_TEAMS, SETTINGS_TEAMS);
});

test("★ 遷移檔：兩支函式第一句是門、都寫紀錄、trigger 擋兩件事、紀錄表只有 Co-President 讀", () => {
  const sql = readFileSync("supabase/migrations/2026-10-21-people-admin.sql", "utf8").replace(/--[^\n]*/g, "");
  for (const fn of ["set_board_role", "set_team"]) {
    const i = sql.indexOf(`create or replace function public.${fn}(`);
    assert.ok(i > 0, `找不到 ${fn}`);
    const body = sql.slice(i, sql.indexOf("end $$;", i));
    assert.match(body, /begin\s+perform public\.require_president\(\);/, `${fn} 第一句不是門`);
    assert.match(body, /perform public\.log_role_change\(/, `${fn} 沒寫紀錄`);
  }
  assert.match(sql, /raise exception 'cannot_demote_self'/);
  assert.match(sql, /raise exception 'team_locked'/);
  assert.match(sql, /raise exception 'team_needs_president'/);
  assert.match(sql, /create policy role_changes_read on public\.role_changes\s+for select to authenticated using \(public\.is_president\(\)\)/);
  assert.doesNotMatch(sql, /grant (insert|update|delete)[^\n]*role_changes/);
  assert.match(sql, /before update of team on public\.profiles/);
});

// 2026-10-26：同一屆可以兼好幾個職位（Paul 10-23）。
test("★ 同一屆好幾個職位：名單接成一句、改一個人一列一筆、各自刪得掉；email 只在改一個人那一頁", () => {
  const two = { ...PEOPLE[1], positions: [
    { term: "2026-27", title_en: "Adviser, Sponsorship Team", team: "Sponsorship Team" },
    { term: "2026-27", title_en: "Associate, Curriculum Team", team: "Curriculum Team" },
    { term: "2025-26", title_en: "Associate", team: "" }] };
  assert.equal(positionsFor(two, "2026-27").length, 2);
  assert.equal(positionsLine(two, "2026-27"), "Adviser, Sponsorship Team · Associate, Curriculum Team");
  const roster = rosterHTML([two], TERMS, ME, true, "", false, null);
  // 2026-10-24：名單裡一筆職位一行，不再用「 · 」接成一句（職級是左邊那一欄，職位是字，分開看）。positionsLine 留給歷屆那一行。
  // 職位的字已經含 team，後面不再接一次 team；每一筆都不標（兼職位是正常的）。他的職級是 Director，而兩筆職位都不是 Director，所以底下一句「沒有這個職級的職位」。
  assert.match(roster, /<div>Adviser, Sponsorship Team<\/div><div>Associate, Curriculum Team<\/div><div class="mini"><span class="tag warn"[^>]*>沒有這個職級的職位<\/span><\/div>/);
  assert.doesNotMatch(roster, /Sponsorship Team<span class="mini"> Sponsorship Team/, "team 不重複印");
  assert.doesNotMatch(roster, /director@example\.com/, "名單表格上不印 email");
  const h = personEditHTML(two, TERMS, ME, true, "", false, null, [two], null, "director@example.com");
  assert.equal((h.match(/data-posrow=/g) || []).length, 2);
  assert.match(h, /data-act="position-delete" data-id="p2" data-term="2026-27" data-team="Sponsorship Team"/);
  assert.match(h, /data-act="position-delete" data-id="p2" data-term="2026-27" data-team="Curriculum Team"/);
  assert.match(h, /歷屆：2025-26: Associate/);
  assert.match(h, /director@example\.com/);
  assert.match(h, /data-act="copy-email" data-email="director@example.com"/);
  assert.match(personEditHTML(two, TERMS, ME, true, "", false, null, [two], null, undefined), /載入中/);
  assert.match(personEditHTML(PEOPLE[3], TERMS, ME, true, "", false, null, PEOPLE, null, null), /註冊用的 email：沒有帳號/);
  const src = readFileSync("admin/people/src/main.js", "utf8");
  const save = src.slice(src.indexOf('act === "person-save"'), src.indexOf('act === "position-delete"'));
  assert.match(save, /before\.team \|\| ""\) !== r\.team\) posOps\.push\(\{ del: r\.orig \}\)/, "換了 team 要先刪舊的那一筆");
  assert.match(save, /err\.posTeamDup/, "同一個 team 兩筆要擋");
  assert.match(src, /D\.personEmail\(/);
});

// 2026-10-23 第三次重整批 2：存取格、列上改 team、結束之後要做的事。
test("★ 存取格：六個 team 兩欄加兩本護照加自訂；還沒載到工作區清單每一格都畫；載到了只畫存在的", () => {
  const all = accessGridHTML(PEOPLE[2], [], false);
  assert.equal((all.match(/data-act="grid-level"/g) || []).length, 6 * 2 + 2);
  assert.match(all, /data-ws="intern-passport"[^>]*><option value="">無<\/option><option value="view">看<\/option><option value="edit" selected>改/);
  const some = accessGridHTML(PEOPLE[2], [{ id: "apps:Curriculum Team", kind: "apps", active: true }, { id: "custom:camp", kind: "custom", title_en: "Winter camp", active: true }], false);
  assert.equal((some.match(/data-act="grid-level"/g) || []).length, 2, "只有存在的工作區有下拉，其他是一條橫線");
  assert.match(some, /Winter camp/);
  assert.match(accessGridHTML(PEOPLE[2], [], true), /disabled/);
});

test("名單：還沒填 team 的幹部列上直接有 team 下拉；找名字縮清單", () => {
  const noTeam = Object.assign({}, PEOPLE[2], { team: "" });
  const h = rosterHTML([PEOPLE[0], noTeam], TERMS, ME, true, "", false, null, []);
  assert.match(h, /<select data-act="row-team" data-id="33333333-3333-3333-3333-333333333333"/);
  assert.doesNotMatch(h, /data-act="row-team" data-id="11111111/, "有 team 的沒有那個下拉");
  const q = rosterHTML(PEOPLE, TERMS, ME, true, "", false, { q: "mei" }, []);
  assert.equal((q.match(/data-act="person-edit"/g) || []).length, 1);
  assert.match(q, /Mei/);
});

test("結束這一屆之後：留下的人一列一顆「改」，有收起來的鈕", () => {
  const h = afterEndHTML({ term: "2026-27", kept: [PEOPLE[1].profile_id, PEOPLE[2].profile_id] }, PEOPLE, false);
  assert.match(h, /2026-27 結束了/);
  assert.match(h, /data-act="person-edit" data-id="p2"/); assert.match(h, /data-act="person-edit" data-id="p3"/);
  assert.doesNotMatch(h, /data-id="p1"/);
  assert.match(h, /data-act="after-dismiss"/);
  assert.equal(afterEndHTML(null, PEOPLE, false), "");
});

test("★ 主程式：存取格改了就送、送反向的那一筆當復原；存了 Director 的職位問一句配兩個工作區；工作區有自己的網址", () => {
  const src = readFileSync("admin/people/src/main.js", "utf8");
  const grid = src.slice(src.indexOf('dataset.act === "grid-level"'), src.indexOf('dataset.act === "row-team"'));
  assert.match(grid, /D\.unassign\(id, ws\)/); assert.match(grid, /D\.assign\(id, ws, lv\)/);
  assert.match(grid, /S\.undo = /, "存取格要有復原");
  assert.match(src, /T\("pe\.grantBoth"/, "Director 職位存完要問配兩個工作區");
  assert.doesNotMatch(src.slice(src.indexOf("const dirTeam"), src.indexOf("S.undo = { label: T(\"pe.grantBoth\"")), /await D\.assign/, "配工作區不能自動送，要等他按");
  assert.match(src.slice(src.indexOf("S.undo = { label: T(\"pe.grantBoth\""), src.indexOf("await reopenPerson(p.person_id, T(\"msg.personSaved\"")), /fn: async \(\) => \{[\s\S]*await D\.assign\(pid, "apps:" \+ dirTeam, "manage"\)/, "按了那顆鈕才送兩筆");
  assert.match(src, /"#ws=" \+ encodeURIComponent/); assert.match(src, /"#person=" \+ encodeURIComponent/);
  assert.match(src, /key\.startsWith\("ws="\)/); assert.match(src, /key\.startsWith\("person="\)/);
});

// 2026-10-24 Paul：「不要用打的，給一個下拉列我們的職級」。標題從職級加 team 推出來；對不上的既有紀錄是「自訂」，文字不丟。
test("★ 職位下拉：四級有 team 沒 team 推出來的字；既有紀錄對得上就選那一級、對不上是自訂；貼一整屆認職級名", () => {
  const want = { president: "Co-President", senior_adviser: "Senior Adviser", director: "Director", adviser: "Adviser", member: "Associate" };
  const wantZh = { ...want, adviser: "顧問" };
  // Paul 2026-10-24：Co-President 與 Senior Adviser 不綁 team，推出來的字只有職級；其他三級接「, team」。
  const orgWide = ["president", "senior_adviser"];
  for (const r of RANK_CHOICES) {
    assert.deepEqual(deriveTitle(r, ""), { title_en: want[r], title_zh: wantZh[r] });
    if (orgWide.includes(r)) assert.deepEqual(deriveTitle(r, "Curriculum Team"), { title_en: want[r], title_zh: wantZh[r] }, r + " 不接 team");
    else assert.deepEqual(deriveTitle(r, "Curriculum Team"), { title_en: want[r] + ", Curriculum Team", title_zh: wantZh[r] + ", Curriculum Team" });
    assert.equal(rankOfTitle(deriveTitle(r, "Marketing Team").title_en, "Marketing Team"), r, "推出來的字反推得回那一級");
    assert.equal(rankByName(want[r].toUpperCase()), r);
  }
  assert.equal(rankOfTitle("Co-President", "Sponsorship Team"), "president", "舊紀錄帶著 team 也認得出是 Co-President");
  assert.equal(rankOfTitle("Co-President, Sponsorship Team", "Sponsorship Team"), "custom", "舊的「Co-President, Team」照存的印，不改");
  const pasted = pasteParse("王平, Paul Wang, Co-President, Sponsorship Team\n小安, Ann, Director, Curriculum Team");
  assert.deepEqual(pasted.rows.map(x => [x.title_en, x.team]), [["Co-President", ""], ["Director, Curriculum Team", "Curriculum Team"]], "貼一整屆：這兩級忽略 team 那一欄");
  assert.equal(rankOfTitle("Director, Curriculum Team", "Marketing Team"), "custom", "team 對不上就不是那一級");
  assert.equal(rankOfTitle("Head of Fun", ""), "custom");
  assert.equal(rankOfTitle("", ""), "");
  assert.equal(rankByName("Boss"), "");
  assert.equal(rankByName("顧問"), "adviser", "貼一整屆也認中文的職級名");
  // title_en 不看畫面語言：切到英文畫面推出來的字一樣。
  setLang("en"); assert.equal(deriveTitle("adviser", "Sponsorship Team").title_en, "Adviser, Sponsorship Team"); assert.equal(deriveTitle("adviser", "").title_zh, "顧問"); setLang("zh");
  // 畫面：對得上的列下拉預選、文字框藏著（值還在）；對不上的列選「自訂」、文字框露出來。
  const other = personEditHTML(PEOPLE[1], TERMS, ME, true, "", false, null, PEOPLE, null);
  assert.match(other, /<select id="pk-rank-0" data-act="pos-rank"[^>]*>[\s\S]*?<option value="director" selected>Director/);
  assert.match(other, /<div class="two" hidden>\s*<label><i>[^<]*<\/i><input id="pk-ten-0" value="Director, Curriculum Team"/);
  const custom = personEditHTML(PEOPLE[1], TERMS, ME, true, "", false, { rows: [{ orig: "Curriculum Team", title_zh: "", title_en: "Boss", team: "Curriculum Team" }] }, PEOPLE, null);
  assert.match(custom, /<option value="custom" selected>/);
  assert.match(custom, /<div class="two">\s*<label><i>[^<]*<\/i><input id="pk-ten-0" value="Boss"/, "自訂的文字框露出來、值還在");
  assert.match(personNewHTML(TERMS, "", false, null), /<select id="pn-rank" data-act="pos-rank"/);
  // 主程式：下拉選了職級就推標題，自訂才讀文字框。
  const src = readFileSync("admin/people/src/main.js", "utf8");
  assert.match(src, /rank && rank !== "custom" \? UI\.deriveTitle\(rank, team\)/);
  assert.match(src, /dataset\.act === "pos-rank"/);
});

// 2026-10-28：Adviser 職級。遷移檔有五個值、set_board_role 收 adviser、is_senior 不含 adviser；/team/ 組內 Director、Adviser、Associate。
test("★ Adviser：遷移檔與 10-24 同步成五個值、is_senior 不變；名單照職級排；Director 職位的那顆鈕不給 Adviser；/team/ 組內順序", async () => {
  const mig = readFileSync("supabase/migrations/2026-10-28-adviser-rank.sql", "utf8");
  assert.match(mig, /check \(board_role in \('member', 'adviser', 'director', 'senior_adviser', 'president'\)\)/);
  assert.match(mig, /if p_role not in \('member', 'adviser', 'director', 'senior_adviser', 'president'\)/);
  assert.match(mig, /perform public\.require_president\(\);/);
  assert.doesNotMatch(mig, /create or replace function public\.is_senior/, "is_senior 不動");
  assert.match(mig, /要先跑過 2026-10-27-public-names-english\.sql/);
  const m24 = readFileSync("supabase/migrations/2026-10-24-ranks-and-workspaces.sql", "utf8");
  assert.match(m24, /check \(board_role in \('member', 'adviser', 'director', 'senior_adviser', 'president'\)\)/, "10-24 同步，重跑不會蓋回四個值");
  assert.match(m24, /and board_role in \('president', 'senior_adviser'\)/, "is_senior 還是兩個值");
  assert.match(readFileSync("scripts/db/smoke.sh", "utf8"), /2026-10-28-adviser-rank\.sql/);
  const adv = { person_id: "p7", profile_id: "77777777-7777-7777-7777-777777777777", name_zh: "顧小問", name_en: "Ad Viser", role: "cadre", board_role: "adviser", team: "Sponsorship Team",
    positions: [{ term: "2026-27", title_en: "Adviser, Sponsorship Team", title_zh: "顧問, Sponsorship Team", team: "Sponsorship Team" }], workspaces: [], maybe_dup: null };
  const h = rosterHTML([PEOPLE[2], adv, PEOPLE[1], PEOPLE[0]], TERMS, ME, true, "", false, null, []);
  const order = [...h.matchAll(/data-act="person-edit" data-id="(p\d)"/g)].map(m => m[1]);
  assert.deepEqual(order, ["p1", "p2", "p7", "p3"], "Co-President、Director、Adviser、Associate");
  assert.match(h, /<span class="tag">顧問<\/span>/);
  const edit = personEditHTML(adv, TERMS, ME, true, "", false, null, [adv], null);
  assert.match(edit, /<option value="adviser" selected>顧問/);
  assert.match(edit, /<select id="pk-rank-0"[^>]*>[\s\S]*?<option value="adviser" selected>/, "既有的「Adviser, Sponsorship Team」對得回 Adviser 那一級");
  const src = readFileSync("admin/people/src/main.js", "utf8");
  assert.match(src, /const dirTeam = f\.board_role === "director" \?/, "配兩個工作區那顆鈕只給 Director");
  const { rankWeight } = await import("../team/src/ui.js");
  assert.deepEqual(["Associate, X · 2026-27", "Adviser, X · 2026-27", "Director, X · 2026-27"].sort((a, b) => rankWeight(a) - rankWeight(b)), ["Director, X · 2026-27", "Adviser, X · 2026-27", "Associate, X · 2026-27"]);
});

// 2026-10-29 邀請信（docs/2026-10-24-邀請信.md）。表單、清單狀態、重寄與撤銷、批次碼收在摺疊裡；主程式寄完立刻 send_pending_mail。
test("★ 邀請頁：表單六格、職位下拉共用、清單五種狀態、撤銷只給 Co-President、認領了的沒有重寄、批次碼在摺疊裡", async () => {
  const { invitesPageHTML, INVITE_WHO, whoLabel } = await import("../admin/people/src/ui.js");
  assert.deepEqual(INVITE_WHO, ["cadre:president", "cadre:senior_adviser", "cadre:director", "cadre:adviser", "cadre:member", "alumni", "intern"]);
  assert.equal(whoLabel("cadre:adviser"), "幹部：顧問"); assert.equal(whoLabel("alumni"), "校友");
  const rows = [
    { code: "bt-aaaa1111", email: "a@example.com", grants: "alumni", rank: null, person_id: "p9", person_name: "Second Alum", title: "Director, Marketing Team", status: "sent", created_at: "2026-10-29T01:00:00Z", expires_at: "2026-11-28T01:00:00Z", invited_by_name: "Paul Wang" },
    { code: "bt-bbbb2222", email: "b@example.com", grants: "cadre", rank: "director", status: "claimed", created_at: "2026-10-20T01:00:00Z", claimed_name: "New Director", claimed_at: "2026-10-21T01:00:00Z", invited_by_name: "Paul Wang" },
    { code: "bt-cccc3333", email: "c@example.com", grants: "cadre", rank: "member", status: "failed", mail_error: "boom", created_at: "2026-10-22T01:00:00Z", invited_by_name: "Paul Wang" },
    { code: "bt-dddd4444", email: "d@example.com", grants: "intern", status: "expired", created_at: "2026-09-01T01:00:00Z", invited_by_name: "Paul Wang" },
  ];
  const h = invitesPageHTML(rows, [], TERMS, "", false, null, null, true);
  for (const id of ["in-email", "in-who", "in-rank", "in-team", "in-term", "in-zh", "in-en", "in-line", "in-note"]) assert.match(h, new RegExp(`id="${id}"`), id);
  assert.match(h, /<select id="in-rank" data-act="pos-rank"/, "職位下拉跟改一個人那一頁同一個");
  assert.match(h, /data-act="invite-send"/);
  assert.match(h, /<b>a@example\.com<\/b><span class="tag open">寄出<\/span>/);
  assert.match(h, /校友・Director, Marketing Team/);
  assert.match(h, /2026-11-28 到期/);
  assert.match(h, /data-act="invite-resend" data-code="bt-aaaa1111"/);
  assert.match(h, /data-act="invite-revoke" data-code="bt-aaaa1111"/);
  assert.match(h, /href="#person=p9"/, "有名單紀錄的連過去");
  assert.match(h, /<span class="tag done">認領了<\/span>/);
  assert.match(h, /New Director 在 2026-10-21 認領了/);
  assert.doesNotMatch(h, /data-act="invite-resend" data-code="bt-bbbb2222"/, "認領了的不能重寄");
  assert.doesNotMatch(h, /data-act="invite-revoke" data-code="bt-bbbb2222"/);
  assert.match(h, /寄失敗<\/span>/); assert.match(h, /寄信的錯誤：boom/);
  assert.match(h, /過期<\/span>/); assert.match(h, /data-act="invite-resend" data-code="bt-dddd4444"/, "過期的可以重寄");
  assert.match(h, /<details class="ans" id="batch"><summary>批次碼/);
  assert.match(h, /id="ic-code"/, "舊的批次碼表單在摺疊裡");
  const sa = invitesPageHTML(rows, [], TERMS, "", false, null, null, false);
  assert.doesNotMatch(sa, /data-act="invite-revoke"/, "Senior Adviser 沒有撤銷");
  assert.doesNotMatch(sa, /id="batch"/, "Senior Adviser 看不到批次碼");
  assert.match(sa, /data-act="invite-resend"/, "但重寄得了");
  assert.match(invitesPageHTML([], [], TERMS, "", false, null, null, true), /還沒有邀請任何人/);
  assert.match(invitesPageHTML(rows, [], TERMS, "", true, null, null, true), /data-act="invite-send" disabled/);
  const src = readFileSync("admin/people/src/main.js", "utf8");
  const send = src.slice(src.indexOf('act === "invite-send"'), src.indexOf('act === "invite-resend"'));
  assert.match(send, /D\.invitePerson\(/); assert.match(send, /await D\.sendMail\(\)/, "排進 outbox 之後立刻寄");
  assert.match(src.slice(src.indexOf('act === "invite-revoke"'), src.indexOf("邀請碼的新增與停用")), /UI\.needAsk\(S, b, T\("confirm\.revokeInvite"/);
  const d = readFileSync("admin/people/src/data.js", "utf8");
  for (const fn of ["invites_for_review", "invite_person", "resend_invite", "revoke_invite", "send_pending_mail"]) assert.match(d, new RegExp(`rpc\\("${fn}"`), fn);
  // 側欄：邀請那一行 Senior Adviser 也看得到。
  const { ITEMS, canSee } = await import("../admin/people/src/ui.js");
  const row = ITEMS.find(i => i.key === "invites");
  assert.equal(row.who, "senior"); assert.equal(T(row.label), "邀請");
  assert.equal(canSee(row, { role: "cadre", board: "senior_adviser" }), true);
  assert.equal(canSee(row, { role: "cadre", board: "director" }), false);
});

test("★ 邀請信的遷移檔：六欄、兩張表的 kind 收 invite、六支函式的門、claim_invite 三道檢查、預設文案中英都有 {link}", () => {
  const mig = readFileSync("supabase/migrations/2026-10-29-invites.sql", "utf8");
  for (const c of ["email", "rank", "expires_at", "opened_at", "revoked_at", "invited_by"]) assert.match(mig, new RegExp(`add column if not exists ${c}`), c);
  assert.match(mig, /check \(kind in \('guardian', 'interview', 'accepted', 'rejected', 'notice', 'invite'\)\)/);
  assert.match(mig, /check \(kind in \('guardian', 'interview', 'accepted', 'rejected', 'invite'\)\)/);
  const fn = name => { const i = mig.indexOf(`create or replace function public.${name}(`); return mig.slice(i, mig.indexOf("$$;", i)); };
  assert.match(fn("invite_person"), /perform public\.require_senior\(\);/);
  assert.match(fn("resend_invite"), /perform public\.require_senior\(\);/);
  assert.match(fn("revoke_invite"), /perform public\.require_president\(\);/);
  assert.match(fn("invites_for_review"), /and public\.is_senior\(\)/);
  assert.match(mig, /grant execute on function public\.invite_opened\(text\) to anon, authenticated;/);
  assert.match(mig, /revoke all on function public\.invites_for_review\(\) from public, anon;/);
  const claim = fn("claim_invite");
  for (const e of ["invite_revoked", "invite_expired", "invite_wrong_email", "for update", "uses_left > 0", "uses_left = uses_left + 1", "insert into invite_uses"]) assert.ok(claim.includes(e), `claim_invite 少了 ${e}`);
  assert.match(claim, /select lower\(email\) into v_bound from auth\.users where id = v_uid/, "email 比的是登入帳號的 email，不是前端說的");
  assert.match(claim, /update profiles set board_role = v_rank where id = v_uid/, "認領時把邀請定的職級寫進去");
  assert.match(mig, /interval '30 days'/);
  const tpl = mig.slice(mig.indexOf("('invite',"), mig.indexOf("on conflict (kind) do nothing"));
  assert.ok((tpl.match(/\{link\}/g) || []).length >= 2, "中英各一段都有 {link}");
  for (const p of ["{name}", "{position}", "{sender}"]) assert.ok(tpl.includes(p), p);
  assert.match(mig, /要先跑過 2026-10-28-adviser-rank\.sql/);
  assert.match(readFileSync("scripts/db/smoke.sh", "utf8"), /2026-10-29-invites\.sql/);
  assert.match(readFileSync("scripts/db/smoke.sh", "utf8"), /invite_wrong_email/, "smoke 有 email 綁定的破壞測試");
});

// Paul 2026-10-24：Co-President 與 Senior Adviser 的職位不綁 team（表單鎖住印「全部 team」）；存取格對這兩級印「全部（職級）」；
// 工作區成員清單把這兩級置頂標「依職級」、沒有下拉與移出。
test("★ 不綁 team 的兩級：表單 team 鎖住、名單印「全部 team」、存取格鎖住、成員清單置頂「依職級」", async () => {
  const { isOrgWide, ORG_WIDE } = await import("../admin/people/src/ui.js");
  assert.deepEqual(ORG_WIDE, ["president", "senior_adviser"]); assert.equal(isOrgWide("adviser"), false, "Adviser 綁 team");
  const pres = personEditHTML(PEOPLE[0], TERMS, ME, true, "", false, null, PEOPLE, null, undefined, []);
  assert.match(pres, /<select id="pk-pteam-0" disabled data-orgwide="1"><option value="" selected>全部 team<\/option><\/select>/, "Co-President 那一列 team 鎖住");
  assert.match(pres, /<select class="byrank" disabled[^>]*><option selected>全部（職級）<\/option><\/select>/, "存取格每一格印全部（職級）");
  assert.doesNotMatch(pres, /data-act="grid-level"/, "沒有可以改的格");
  assert.match(pres, /本來就看得到、改得動每一個工作區/, "那一句說明留著");
  const dir = personEditHTML(PEOPLE[1], TERMS, ME, true, "", false, null, PEOPLE, null, undefined, []);
  assert.match(dir, /<select id="pk-pteam-0">/); assert.match(dir, /data-act="grid-level"/);
  const ro = rosterHTML(PEOPLE, TERMS, ME, true, "", false, null, []);
  assert.match(ro, /<div>Co-President<span class="mini"> 全部 team<\/span><\/div>/, "名單：Co-President 全部 team");
  const ws = [{ id: "apps:Curriculum Team", kind: "apps", title_zh: "Curriculum Team 的申請", active: true }];
  const h = workspacesHTML(ws, "apps:Curriculum Team", [{ user_id: PEOPLE[2].profile_id, name_zh: "", name_en: "Mei", board_role: "member", level: "view" }], PEOPLE, "", false, null, true);
  const lead = h.indexOf('class="byrank"'), mei = h.indexOf('data-act="ws-level"');
  assert.ok(lead > 0 && lead < mei, "Co-President 置頂");
  assert.match(h, /<tr class="byrank">[\s\S]*?王平[\s\S]*?全部（職級）/);
  assert.doesNotMatch(h.slice(lead, mei), /ws-unassign|ws-level/, "依職級那一列沒有下拉與移出");
  const src = readFileSync("admin/people/src/main.js", "utf8");
  assert.match(src, /team = UI\.isOrgWide\(rank\) \? "" : val\(`pk-pteam-\$\{i\}`\)/, "存的時候 team 是空的");
});

// Paul 2026-10-24 的規矩：一個概念改了，畫它的每一個面同一筆一起改。這裡一面一條。
test("★ 依職級的每一個面：名單工作區欄、team 篩選、側欄那一行、職級與職位分開、對不上的標出來", () => {
  const pres = { ...PEOPLE[0], workspaces: [{ id: "apps:Community Relations Team", level: "manage" }], team: "Sponsorship Team" };
  const h = rosterHTML([pres, PEOPLE[1], PEOPLE[2]], TERMS, ME, true, "", false, null, []);
  // 面：名單的工作區欄。先「全部（職級）」，明寫的指派淡掉留著（不藏，藏了就沒人會去清），而且不再印「沒有被派進任何工作區」。
  const presRow = h.slice(h.indexOf("<tbody>"), h.indexOf("</tr>", h.indexOf("<tbody>")));
  assert.match(presRow, /<span class="tag open">全部（職級）<\/span> <span class="tag off"[^>]*>Community Relations Team 的申請・管<\/span>/);
  assert.doesNotMatch(presRow, /沒有被派進任何工作區/);
    // 面：team 的篩選 chip。Co-President 勾了 Sponsorship 標籤、但職位沒有 team，不算在 Sponsorship 底下（跟 /team/ 的領導組一致）。
  assert.doesNotMatch(h, /data-v="Sponsorship Team"/, "沒有人真的在 Sponsorship，chip 不出現");
  assert.match(h, /data-act="roster-team" data-v="">全部 3/);
  const withTeamPos = { ...pres, positions: [{ term: "2026-27", title_en: "Co-President", team: "" }, { term: "2026-27", title_en: "Associate, Sponsorship Team", team: "Sponsorship Team" }] };
  assert.match(rosterHTML([withTeamPos], TERMS, ME, true, "", false, null, []), /data-v="Sponsorship Team">Sponsorship 1/, "另外有一筆帶 team 的職位才算進那個 team");
  // 面：職級與職位分開畫，但兼職位是正常的（Paul 2026-10-24：「我是 president 也是 Sponsorship 的 associate」），每一筆都不標。
  const multi = { ...PEOPLE[0], positions: [{ term: "2026-27", title_en: "Co-President", team: "" }, { term: "2026-27", title_en: "Associate, Sponsorship Team", team: "Sponsorship Team" }] };
  const m = rosterHTML([multi], TERMS, ME, true, "", false, null, []);
  assert.match(m, /<td><span class="tag open">Co-President<\/span><\/td>/, "職級欄是 Co-President");
  assert.match(m, /<div>Co-President<span class="mini"> 全部 team<\/span><\/div><div>Associate, Sponsorship Team<\/div>/, "兩筆各一行，team 不重複印");
  assert.doesNotMatch(m, /tag warn/, "Co-President 兼 Associate 不標任何東西");
  // 職位寫 Senior Adviser、職級是 Co-President：只是印出來，也不標（領導那兩級互相不算衝突）。
  const sa = rosterHTML([{ ...PEOPLE[0], positions: [{ term: "2026-27", title_en: "Senior Adviser", team: "" }, { term: "2026-27", title_en: "Co-President", team: "" }] }], TERMS, ME, true, "", false, null, []);
  assert.doesNotMatch(sa, /tag warn/);
  // 唯一的提醒：這一屆沒有任何一筆職位對得上職級，每人一句、只一句。
  const none = { ...PEOPLE[0], positions: [{ term: "2026-27", title_en: "Associate, Sponsorship Team", team: "Sponsorship Team" }, { term: "2026-27", title_en: "Adviser, Marketing Team", team: "Marketing Team" }] };
  const n = rosterHTML([none], TERMS, ME, true, "", false, null, []);
  assert.equal((n.match(/沒有這個職級的職位/g) || []).length, 1);
  assert.doesNotMatch(rosterHTML([PEOPLE[1]], TERMS, ME, true, "", false, null, []), /沒有這個職級的職位/, "Director 有 Director 的職位，不提醒");
  assert.doesNotMatch(m, /跟職級不同/, "舊的那顆標籤不在了");
  // 面：屆別「誰留下」的清單印的是職級徽章，不是職位，所以不受影響；確認還在。
  const t = termsHTML(TERMS, [PEOPLE[0], PEOPLE[1]], ME, true, "", false, null, { step: 2, next: {}, keep: [] });
  assert.match(t, /Co-President/); assert.match(t, /Director/);
  // 面：邀請表單「他會是」是職級的字，跟職位分開。
  assert.match(invitesPageHTML([], [], TERMS, "", false, { who: "cadre:president" }, null, true), /<option value="cadre:president" selected>幹部：Co-President/);
});

// 2026-10-24 工作區照 team 分組：存取格一列一個 team、Workspaces 左邊分組、「加一個專案或營隊」先選 team。
test("★ 存取格照 team 分組：整個 BT 一列放幹部護照、Internship 多一格實習護照、格子的標題連到那個東西、三句說明", async () => {
  const { defaultWorkspaces } = await import("../admin/people/src/ui.js");
  const g = accessGridHTML(PEOPLE[2], [], false);
  const heads = [...g.matchAll(/<th scope="row">([^<]+)<\/th>/g)].map(m => m[1]);
  assert.deepEqual(heads.slice(0, 2), ["整個 BT", "Curriculum"]); assert.ok(heads.includes("Internship"));
  const board = g.slice(g.indexOf("整個 BT"), g.indexOf("<th scope=\"row\">Curriculum"));
  assert.match(board, /href="\/admin\/passports\/\?lang=zh#cadre">幹部護照（格子與城市）<\/a>/);
  assert.doesNotMatch(board, /實習護照/);
  const intern = g.slice(g.indexOf("<th scope=\"row\">Internship"), g.indexOf("<th scope=\"row\">Community"));
  assert.match(intern, /申請（表單與審核）[\s\S]*資源[\s\S]*href="\/admin\/passports\/\?lang=zh#interns">實習護照（格子與棋盤）/);
  assert.match(intern, /data-ws="intern-passport"[^>]*><option value="">無<\/option><option value="view">看<\/option><option value="edit" selected>改/);
  assert.equal((g.match(/data-act="grid-level"/g) || []).length, 14, "十四個工作區十四個下拉");
  for (const s of ["看：讀得到", "玩護照是身分帶來的", "時間看板沒有指派"]) assert.match(g, new RegExp(s));
  assert.equal(defaultWorkspaces().length, 14);
  // 自訂的掛在它的 team 那一列（靠擁有人的 team）。
  const ws = defaultWorkspaces().concat([{ id: "custom:camp", kind: "custom", title_en: "Winter camp", owner: PEOPLE[1].profile_id, active: true }]);
  const g2 = accessGridHTML(PEOPLE[2], ws, false, PEOPLE);
  const cur = g2.slice(g2.indexOf("<th scope=\"row\">Curriculum"), g2.indexOf("<th scope=\"row\">Mentorship"));
  assert.match(cur, /Winter camp/, "小安是 Curriculum 的人，她擁有的營隊掛在 Curriculum 那一列");
  // Workspaces 頁：左邊分組、右邊標題用長名稱加屬於哪一列；「加一個專案或營隊」先選 team。
  const h = workspacesHTML(ws, "intern-passport", [], PEOPLE, "", false, { team: "Curriculum Team" }, true);
  assert.match(h, /<div class="rail-group">整個 BT<\/div><div class="wslist">[^]*?幹部護照（格子與城市）/);
  assert.match(h, /<div class="rail-group">Internship<\/div>/);
  assert.match(h, /<h2>實習護照（格子與棋盤）<span class="hint">Internship Team・intern-passport/);
  assert.match(h, /<h2>加一個專案或營隊<\/h2>/); assert.match(h, /<select id="wsn-team" data-act="wsn-team"/);
  const owners = h.slice(h.indexOf('id="wsn-owner"'), h.indexOf("</select>", h.indexOf('id="wsn-owner"')));
  assert.match(owners, /小安/); assert.doesNotMatch(owners, /Mei/, "選了 Curriculum，擁有人只列 Curriculum 的人");
  assert.match(h, /會排在 Curriculum 那一列底下/);
  assert.match(h, /一份成員清單/, "表單上寫它今天是什麼");
  assert.doesNotMatch(h, /新增工作區/);
});
