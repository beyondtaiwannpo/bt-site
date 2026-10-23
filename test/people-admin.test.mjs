// 人與權限的後台（/admin/people/，2026-10-24 權限重新設計批 2）：
// 幹部名單（職級四級、職位與屆別、沒有帳號的人）、工作區與指派、屆別與結束這一屆、刪除成員。
// 設計：docs/2026-10-23-權限重新設計.md。跑法：node --test test/*.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { tabsHTML, rosterHTML, changesHTML, personEditHTML, personNewHTML, workspacesHTML, termsHTML,
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

test("★ 職級四級，畫面上不出現 board_role、member 這些字", () => {
  assert.deepEqual(BOARD_ROLES.map(r => r.v), ["member", "director", "senior_adviser", "president"]);
  assert.equal(boardLabel("member"), "Associate");
  assert.equal(boardLabel("senior_adviser"), "Senior Adviser");
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
  assert.match(cur, /apps:Curriculum Team・管/);
  assert.match(cur, /intern-passport・改/);
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
  assert.match(other, /apps:Curriculum Team・管/);
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
  assert.match(h, /class="rail-item on" href="#workspaces" data-act="ws-pick" data-ws="apps:Curriculum Team"/);
  assert.doesNotMatch(h, /custom:old/, "停用的工作區不列");
  assert.match(h, /擁有人 小安/);
  assert.match(h, /<select data-act="ws-level" data-id="22222222-2222-2222-2222-222222222222">/);
  assert.match(h, /<option value="manage" selected>管/);
  assert.match(h, /data-act="ws-unassign" data-id="22222222-2222-2222-2222-222222222222"/);
  const pick = h.slice(h.indexOf('id="ws-person"'), h.indexOf("</select>", h.indexOf('id="ws-person"')));
  assert.match(pick, /<option value="33333333-3333-3333-3333-333333333333"/, "Mei 還沒在裡面，選得到");
  assert.doesNotMatch(pick, /22222222-2222-2222-2222-222222222222/, "已經在裡面的不再列");
  assert.doesNotMatch(pick, /畢業的/, "校友派不了");
  assert.doesNotMatch(pick, /老幹部/, "沒帳號的派不了");
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
  assert.deepEqual(r.rows.map(x => [x.name_zh, x.name_en, x.title_en, x.team]), [["王小明", "Ming Wang", "Director", "Curriculum Team"], ["李小華", "Hua Lee", "Associate", ""]]);
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
  assert.match(roster, /Adviser, Sponsorship Team · Associate, Curriculum Team/);
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
