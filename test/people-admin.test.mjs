// 人與權限的後台（/admin/people/ 的「幹部名單」分頁，2026-10-21，批 3）：
// Co-President 改職位與 team，每一筆留紀錄；設定頁對 Director 鎖住 team。跑法：node --test test/*.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { tabsHTML, rosterHTML, changesHTML, personEditHTML, BOARD_ROLES, boardLabel, TEAMS as PEOPLE_TEAMS, setLang, T } from "../admin/people/src/ui.js";
// 後台 2026-10-19 起有中英切換，字典預設英文；這一支斷言的是中文，所以先切成中文。
setLang("zh");
import { says } from "../admin/people/src/data.js";
import { teamPickHTML, teamLocked, saveFailMessage, TEAMS as SETTINGS_TEAMS, setLang as settingsLang } from "../settings/src/ui.js";
settingsLang("zh");

const ME = "11111111-1111-1111-1111-111111111111";
const ROWS = [
  { id: ME, name_zh: "王平", name_en: "Paul", team: "P/VP", board_role: "president" },
  { id: "22222222-2222-2222-2222-222222222222", name_zh: "小安", name_en: "", team: "Curriculum Team", board_role: "director" },
  { id: "33333333-3333-3333-3333-333333333333", name_zh: "", name_en: "Mei", team: "Marketing Team, Internship Team", board_role: "member" },
];
const CHANGES = [
  { id: 2, changed_by: ME, target: ROWS[1].id, target_name: "小安", field: "board_role", old_value: "member", new_value: "director", created_at: "2026-10-21T03:00:00+00:00" },
  { id: 1, changed_by: ME, target: "99999999-9999-9999-9999-999999999999", target_name: "已刪帳號的人", field: "team", old_value: "Curriculum Team", new_value: "Marketing Team", created_at: "2026-10-20T03:00:00+00:00" },
];
const PRIV = [{ name: "Internship Team", note: "" }];

test("兩個分頁都在，幹部名單是第一個", () => {
  const h = tabsHTML("roster");
  assert.match(h, /class="rail-item on" href="#roster" data-act="tab" data-t="roster"/);
  assert.match(h, /data-t="invites"/);
});

test("★ 畫面上不出現 board_role 這個字，職位一律用中文", () => {
  const h = rosterHTML(ROWS, CHANGES, PRIV, ME, "", false);
  assert.doesNotMatch(h, /board_role|\bmember\b|\bdirector\b|\bpresident\b/);
  assert.match(h, /一般幹部/);
  assert.match(h, /Director/);
  assert.match(h, /Co-President/);
  assert.equal(boardLabel("member"), "一般幹部");
  assert.deepEqual(BOARD_ROLES.map(r => r.v), ["member", "director", "president"]);
});

test("名單：每個人一列、有後台權限的 team 標出來、自己那一列標「這是你」", () => {
  const h = rosterHTML(ROWS, CHANGES, PRIV, ME, "", false);
  assert.match(h, /王平<span class="alt">Paul<\/span>/);
  assert.match(h, /Mei/);
  assert.match(h, /Internship Team（有後台權限）/);
  assert.match(h, /這是你/);
  assert.match(h, /3 位幹部/);
  assert.equal((h.match(/data-act="person-edit"/g) || []).length, 3);
});

// 變動紀錄 2026-10-19 起自己一頁（changesHTML）。
test("★ 變動紀錄：誰改、改誰、從什麼到什麼，刪了帳號的人還看得到名字", () => {
  const h = changesHTML(CHANGES, ROWS, "");
  assert.match(h, /小安<\/b>\s*<span class="tag">職位<\/span>/);
  assert.match(h, /一般幹部 → <b>Director<\/b>/);
  assert.match(h, /王平 改的/);
  assert.match(h, /已刪帳號的人/);
  assert.match(h, /Curriculum Team → <b>Marketing Team<\/b>/);
  assert.match(h, /2026-10-21 03:00/);
  // 沒有紀錄不是錯，但要說從哪一天開始記。
  assert.match(changesHTML([], ROWS, ""), /還沒有任何變動/);
  // 名單那一頁：表格、team 篩選、沒有名字的排最後並標出來。
  const r = rosterHTML(ROWS, CHANGES, PRIV, ME, "", false, "");
  assert.match(r, /<table class="table"/);
  assert.match(r, /data-act="roster-team" data-team=""/);
  const only = rosterHTML(ROWS, CHANGES, PRIV, ME, "", false, "Internship Team");
  assert.ok((only.match(/data-act="person-edit"/g) || []).length < 3, "篩選之後列數變少");
});

test("★ 自己那一列的職位選單是關的（不能自我降級），別人的開著", () => {
  const me = personEditHTML(ROWS[0], PRIV, ME, "", false, null);
  assert.match(me, /<select id="pk-role" disabled>/);
  assert.match(me, /不能自我降級/);
  const other = personEditHTML(ROWS[1], PRIV, ME, "", false, null);
  assert.match(other, /<select id="pk-role">/);
  assert.match(other, /value="director" selected/);
  assert.match(other, /value="Curriculum Team" checked/);
  assert.match(other, /Internship（有後台權限）/);
  assert.match(other, /data-act="person-save" data-id="22222222-2222-2222-2222-222222222222"/);
});

test("存檔被擋之後剛填的東西要留在畫面上", () => {
  const h = personEditHTML(ROWS[1], PRIV, ME, "存不起來：x", false, { board_role: "president", team: "Marketing Team" });
  assert.match(h, /value="president" selected/);
  assert.match(h, /value="Marketing Team" checked/);
  assert.doesNotMatch(h, /value="Curriculum Team" checked/);
});

test("★ 主程式：升成 Co-President 先問一次，成功失敗都寫 S.msg，一半成功一半失敗要講清楚", () => {
  const src = readFileSync("admin/people/src/main.js", "utf8");
  const i = src.indexOf('act === "person-save"');
  assert.ok(i > 0);
  const body = src.slice(i, src.indexOf("return;", src.indexOf("catch", i)));
  assert.match(body, /role === "president" &&\s*!confirm\(/);
  assert.match(body, /S\.busy = true/);
  assert.match(body, /D\.says\(err\)/);
  assert.match(body, /done\.length \? T\("msg\.partial"/, "一半成功一半失敗要講出哪一半");
});

test("★ 資料層只走 set_board_role 與 set_team，不直接 update profiles，也不寫 role_changes", () => {
  const src = readFileSync("admin/people/src/data.js", "utf8").replace(/\/\/[^\n]*/g, "");
  assert.doesNotMatch(src, /from\("profiles"\)\s*\.(insert|update|upsert|delete)/);
  assert.doesNotMatch(src, /from\("role_changes"\)\s*\.(insert|update|upsert|delete)/);
  assert.ok(src.includes('rpc("set_board_role"') && src.includes('rpc("set_team"'));
});

test("★ 錯誤碼翻成人話，指到對的遷移檔", () => {
  for (const code of ["bad_role", "cannot_demote_self", "team_locked", "team_needs_president", "not_a_cadre", "not_president"]) {
    const m = says(new Error(code));
    assert.ok(!/[a-z]_[a-z]/.test(m), `${code} 翻出來的句子裡還有代碼`);
  }
  assert.match(says(new Error("Could not find the function public.set_team(p_target")), /2026-10-21-people-admin\.sql/);
  assert.match(says(new Error('relation "public.role_changes" does not exist')), /2026-10-21-people-admin\.sql/);
});

// ── 設定頁那一側 ─────────────────────────────────────────────────────
test("★ Director 與 Co-President 的 team 在設定頁是唯讀的，一般幹部不是", () => {
  assert.equal(teamLocked({ role: "cadre", board_role: "director" }), true);
  assert.equal(teamLocked({ role: "cadre", board_role: "president" }), true);
  assert.equal(teamLocked({ role: "cadre", board_role: "member" }), false);
  assert.equal(teamLocked({ role: "student", board_role: "president" }), false, "學員沒有 team 那一塊，鎖不鎖無所謂，但不該算成鎖");
  const locked = teamPickHTML("Curriculum Team", true, ["Internship Team"]);
  assert.doesNotMatch(locked, /<input/);
  assert.match(locked, /Curriculum Team/);
  assert.match(locked, /由 Co-President 在後台改/);
});

test("★ 一般幹部：會長出權限的 team 沒勾的那一格關掉，本來就在裡面的照樣勾著", () => {
  const h = teamPickHTML("Marketing Team", false, ["Internship Team"]);
  assert.match(h, /value="Internship Team" disabled/);
  assert.match(h, /Internship（要 Co-President 加）/);
  assert.match(h, /value="Marketing Team" checked/);
  assert.doesNotMatch(h, /value="Marketing Team" checked disabled/);
  const already = teamPickHTML("Internship Team", false, ["Internship Team"]);
  assert.match(already, /value="Internship Team" checked/);
  assert.doesNotMatch(already, /value="Internship Team" checked disabled/, "本來就在裡面的要退得出來");
  // 沒傳 privileged 的舊呼叫端照樣能用。
  assert.doesNotMatch(teamPickHTML("Marketing Team"), /disabled/);
});

test("設定頁把 trigger 的兩個代碼翻成人話", () => {
  assert.match(saveFailMessage(false, new Error("team_locked")), /Co-President/);
  assert.doesNotMatch(saveFailMessage(false, new Error("team_needs_president")), /team_needs_president/);
});

test("★ 設定頁存檔：team 鎖住時送原值，不送 null", () => {
  const src = readFileSync("settings/src/main.js", "utf8");
  assert.match(src, /team: UI\.teamLocked\(S\.me\) \? \(S\.me\.team \|\| null\) : \(pickedTeams\(\) \|\| null\)/);
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
