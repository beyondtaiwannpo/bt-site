// 後台的「邀請碼」分頁（2026-10-14）。只有 Co-President 看得到，只能看。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { inviteCodesHTML, tabsHTML } from "../admin/src/ui.js";

const ROWS = [
  { code: "BT-CADRE", grants: "cadre", uses_left: 1, note: "給新幹部", created_at: "2026-10-01T03:00:00+00:00",
    uses: [{ name: "新幹部", email: "newb@example.com", role: "cadre", grants: "cadre", used_at: "2026-10-14T05:00:00+00:00" }] },
  { code: "BT-ALUM", grants: "alumni", uses_left: 0, note: null, created_at: null,
    uses: [{ name: "老校友", email: "alum@example.com", role: "cadre", grants: "alumni", used_at: "2026-10-14T06:00:00+00:00" }] },
];

test("分頁只出現在 Co-President 那一列", () => {
  assert.match(tabsHTML("forms", true), /data-t="invites"/);
  assert.doesNotMatch(tabsHTML("forms", false), /data-t="invites"/);
});

test("每一組碼畫出剩幾次、身分、備註與誰用過", () => {
  const h = inviteCodesHTML(ROWS, "");
  assert.match(h, /BT-CADRE/);
  assert.match(h, /還剩 1 次/);
  assert.match(h, /幹部碼/);
  assert.match(h, /備註：給新幹部/);
  assert.match(h, /newb@example\.com・2026-10-14/);
  assert.match(h, /用完了/);
  assert.match(h, /校友碼/);
});

// role 是現在的身分，grants 是那一次換到的。不一樣要講出來。
test("後來換過身分的人會多一句「現在是」", () => {
  const h = inviteCodesHTML(ROWS, "");
  assert.match(h, /換成校友/);
  assert.match(h, /現在是幹部/);
  assert.equal((h.match(/現在是/g) || []).length, 1);
});

// 沒有這句，看的人會以為「沒有紀錄」等於「沒有人用過」。
test("★ 紀錄從哪一天開始的提醒一定在", () => {
  assert.match(inviteCodesHTML([], ""), /使用紀錄從 2026-10-14 開始/);
});

// 第一版只做看（Paul 2026-10-14）。哪天有人加了按鈕，這一條會提醒他先問。
test("★ 這一頁沒有任何改動邀請碼的按鈕或輸入框", () => {
  const h = inviteCodesHTML(ROWS, "");
  assert.doesNotMatch(h, /<input|<textarea|data-act="(?!tab")/);
});

test("載入失敗時拿到 undefined 也畫得出東西", () => {
  assert.match(inviteCodesHTML(undefined, "邀請碼載不到"), /還沒有任何邀請碼/);
});

test("碼、名字、email 都有跳脫", () => {
  const h = inviteCodesHTML([{ code: "<b>x", grants: "cadre", uses_left: 1,
    uses: [{ name: "<img>", email: "a\"b", grants: "cadre", role: "cadre" }] }], "");
  assert.doesNotMatch(h, /<b>x|<img>/);
  assert.match(h, /&lt;b&gt;x/);
});

// 欄位名就是前後端的介面。遷移檔那一串改了、這裡沒跟上，畫面會是一排空白而且不報錯。
test("★ 遷移檔回傳的欄位名跟畫面讀的一樣", () => {
  const sql = readFileSync(new URL("../supabase/migrations/2026-10-14-invite-uses.sql", import.meta.url), "utf8");
  assert.match(sql, /returns table \(\s*code text, grants text, uses_left int, note text, created_at timestamptz, uses jsonb\s*\)/);
  for (const k of ["name", "email", "role", "grants", "used_at"]) assert.match(sql, new RegExp(`'${k}',`));
});
