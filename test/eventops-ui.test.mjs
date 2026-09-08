// 批 6：簽到與寄信（2026-09-08）。
import { test } from "node:test";
import assert from "node:assert/strict";
import * as M from "../admin/src/ui.js";

const form = { id: "f1", title: "2027 暑期探索營" };
const apps = [
  { id: "a1", applicant_name: "陳小安", applicant_school: "建中", applicant_grade: "高二",
    status: "accepted", checked_in_at: "2027-07-01T01:00:00Z" },
  { id: "a2", applicant_name: "林大維", applicant_school: "北一女", applicant_grade: "高三",
    status: "accepted", checked_in_at: null },
  { id: "a3", applicant_name: "黃品叡", applicant_school: "中一中", applicant_grade: "高二",
    status: "rejected", checked_in_at: null },
];

// ⚠ 沒錄取的人不會來。把他們放進點名單只會讓現場那個人多滑一百列。
test("★ 簽到只列錄取的人", () => {
  const h = M.checkinHTML(form, apps, true, "", false);
  assert.match(h, /陳小安/);
  assert.match(h, /林大維/);
  assert.ok(!h.includes("黃品叡"), "沒錄取的人不該出現在點名單上");
});

test("簽到頁一眼看得到到了幾個人", () => {
  const h = M.checkinHTML(form, apps, true, "", false);
  assert.match(h, /錄取 2 人/);
  assert.match(h, /到了 1 人/);
  assert.match(h, /已到/);
  assert.match(h, /還沒到/);
});

test("★ 一般幹部看得到名單但點不了", () => {
  const h = M.checkinHTML(form, apps, false, "", false);
  assert.match(h, /陳小安/);
  assert.doesNotMatch(h, /data-act="checkin"/);
  assert.match(h, /點不了/);
});

test("還沒有人錄取的時候說一句話", () => {
  const h = M.checkinHTML(form, [apps[2]], true, "", false);
  assert.match(h, /還沒有人錄取/);
});

// ── 寄一封信 ──────────────────────────────────────────────────────────
test("★ 沒選收件人的時候寄不出去", () => {
  const h = M.noticeHTML(form, apps, new Set(), "", false);
  assert.match(h, /data-act="notice-send"[^>]*disabled/);
  assert.match(h, /先選要寄給誰/);
});

test("選了之後按鈕上寫著要寄給幾個人", () => {
  const h = M.noticeHTML(form, apps, new Set(["accepted"]), "", false);
  assert.match(h, /寄給這 2 個人/);
  assert.doesNotMatch(h, /data-act="notice-send"[^>]*disabled/);
});

test("三種收件對象都在，選到的有標記", () => {
  const h = M.noticeHTML(form, apps, new Set(["accepted"]), "", false);
  for (const t of M.NOTICE_TO) assert.match(h, new RegExp(t.label));
  assert.match(h, /class="chip wide on"[^>]*data-t="accepted"/);
});

test("★ 講清楚系統會自己加什麼（不然有人會自己再寫一次署名）", () => {
  const h = M.noticeHTML(form, apps, new Set(["accepted"]), "", false);
  assert.match(h, /不要回覆這封信/);
  assert.match(h, /你只要寫中間那一段/);
});

test("寄出中會鎖住按鈕", () => {
  assert.match(M.noticeHTML(form, apps, new Set(["accepted"]), "", true),
    /data-act="notice-send"[^>]*disabled/);
});
