// 後台的「邀請碼」分頁（2026-10-14，2026-10-15 搬到 /admin/people/）。只有 Co-President 看得到。
// 同一天加了新增與停用，不做刪除（Paul 拍板）。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { inviteCodesHTML, inviteFormHTML, suggestCode, tabsHTML, noAccessHTML, canEnter, GROUPS } from "../admin/people/src/ui.js";
import { says } from "../admin/people/src/data.js";

const ROWS = [
  { code: "BT-CADRE", grants: "cadre", uses_left: 1, note: "給新幹部", created_at: "2026-10-01T03:00:00+00:00",
    uses: [{ name: "新幹部", email: "newb@example.com", role: "cadre", grants: "cadre", used_at: "2026-10-14T05:00:00+00:00" }] },
  { code: "BT-ALUM", grants: "alumni", uses_left: 0, note: null, created_at: null,
    uses: [{ name: "老校友", email: "alum@example.com", role: "cadre", grants: "alumni", used_at: "2026-10-14T06:00:00+00:00" }] },
];

// 2026-10-15 後台拆資料夾：邀請碼在 /admin/people/，整組只有 Co-President 進得去。
// 分組列上那一格對其他人是灰字，硬打網址進來看到的是 noAccessHTML，上面沒有任何按鈕。
test("「人與權限」那一組只有 Co-President 進得去", () => {
  const people = GROUPS.find(g => g.key === "people");
  assert.equal(canEnter(people, { role: "cadre", board: "president", team: "" }), true);
  assert.equal(canEnter(people, { role: "cadre", board: "director", team: "Internship Team" }), false);
  assert.equal(canEnter(people, { role: "student", board: "president", team: "" }), false, "學員就算 board_role 被誤設也進不去");
  const h = noAccessHTML({ role: "cadre", board: "member", team: "" });
  assert.match(h, /Co-President/);
  assert.doesNotMatch(h, /data-act="invite-new"/);
  assert.match(tabsHTML("invites"), /data-t="invites"/);
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

// 不做刪除（Paul 2026-10-14）。哪天有人加了刪除按鈕，這一條會提醒他先問。
test("★ 這一頁沒有刪除邀請碼的按鈕", () => {
  const h = inviteCodesHTML(ROWS, "", false, null);
  assert.doesNotMatch(h, /data-act="invite-(delete|remove)"|刪除這組|刪掉這組/);
});

test("還有次數的碼有停用按鈕，用完的沒有", () => {
  const h = inviteCodesHTML(ROWS, "", false, null);
  assert.match(h, /data-act="invite-disable"\s+data-code="BT-CADRE"/);
  assert.doesNotMatch(h, /data-code="BT-ALUM"/);
});

test("忙的時候新增與停用都按不下去", () => {
  const h = inviteCodesHTML(ROWS, "", true, null);
  assert.match(h, /data-act="invite-new" disabled/);
  assert.match(h, /data-act="invite-disable"[^>]*disabled/);
});

test("新增表單把剛才填的值放回去（建失敗時不用重填）", () => {
  const h = inviteFormHTML({ code: "bt-abc", grants: "alumni", uses: 3, note: "給<小明>" }, false);
  assert.match(h, /id="ic-code" value="bt-abc"/);
  assert.match(h, /value="alumni" selected/);
  assert.match(h, /id="ic-uses"[^>]*value="3"/);
  assert.match(h, /給&lt;小明&gt;/);
});

test("系統想的碼是 bt- 加六個字，而且沒有容易看錯的字", () => {
  for (let i = 0; i < 200; i++) assert.match(suggestCode(), /^bt-[a-hjkmnp-z2-9]{6}$/);
  assert.equal(suggestCode(() => 0), "bt-aaaaaa");
  assert.equal(suggestCode(() => 0.9999999), "bt-999999");
});

// 資料庫說撞到哪一組，那一組的名字要留在畫面上。
test("錯誤訊息翻成人話，撞碼時講得出是哪一組", () => {
  assert.match(says({ message: "invite_exists:bt-new-01" }), /已經有一組「bt-new-01」/);
  assert.match(says({ message: "bad_invite_code" }), /英文字母、數字和連字號/);
  assert.match(says({ message: "bad_uses" }), /1 到 100/);
  assert.match(says({ message: "no_such_invite" }), /找不到這組碼/);
  assert.match(says({ message: "not_president" }), /Co-President/);
});

// 碼的格式規則前後端要一致：系統想出來的碼一定要通過資料庫那一關。
test("★ 系統想的碼符合資料庫的格式檢查", () => {
  const sql = readFileSync(new URL("../supabase/migrations/2026-10-15-invite-admin.sql", import.meta.url), "utf8");
  assert.match(sql, /\^\[A-Za-z0-9-\]\{2,64\}\$/);
  const re = /^[A-Za-z0-9-]{2,64}$/;
  for (let i = 0; i < 50; i++) assert.match(suggestCode(), re);
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
