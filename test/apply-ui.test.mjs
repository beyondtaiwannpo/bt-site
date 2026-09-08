// /apply/ 與 /admin/ 的畫面（批 3，2026-09-08）。
// 守的是決定，不是長相。
import { test } from "node:test";
import assert from "node:assert/strict";
import * as A from "../apply/src/ui.js";
import * as M from "../admin/src/ui.js";

const form = { id: "f1", kind: "program", title: "2027 暑期探索營", intro: "兩天，免費。",
               closes_at: "2026-12-01T00:00:00Z", notify_by: "2026-12-15", lang: "zh" };
const qs = [
  { id: "q1", label: "你為什麼想參加", help: "三五句就好", type: "long", required: true, options: [] },
  { id: "q2", label: "你想讀什麼", type: "single", required: false, options: ["理工", "人文", "還不知道"] },
];

// ── /apply/ ───────────────────────────────────────────────────────────
test("清單分成「給高中生」與「加入我們的團隊」兩區", () => {
  const h = A.listHTML([form, { ...form, id: "f2", kind: "board", title: "2027 幹部招募" }], false);
  assert.match(h, /給高中生的計畫/);
  assert.match(h, /加入我們的團隊/);
  assert.ok(h.indexOf("2027 暑期探索營") < h.indexOf("2027 幹部招募"), "計畫要排在招募前面");
});

test("什麼都沒開放的時候說一句話，不是留白", () => {
  assert.match(A.listHTML([], false), /現在沒有開放中的申請/);
  assert.match(A.listHTML([], true), /Nothing is open right now/);
});

// ⚠ 沒登入也要看得到題目。這一頁是對外的，路人要能先看過再決定要不要開帳號。
test("★ 沒登入：題目看得到，但填不了，而且有登入的路", () => {
  const h = A.formHTML(form, qs, "needIn", "", false, false);
  assert.match(h, /你為什麼想參加/, "沒登入就看不到題目的話，這一頁對路人沒有用");
  assert.match(h, /data-act="signin"/);
  assert.doesNotMatch(h, /data-act="submit"/, "沒登入不該畫出送出鈕");
  assert.ok((h.match(/disabled/g) || []).length >= 3, "每一格都要鎖住");
});

test("登入而且資料齊了：填得了、送得出、而且問得到家長信箱", () => {
  const h = A.formHTML(form, qs, "signedIn", "", false, false);
  assert.match(h, /data-act="submit"/);
  assert.match(h, /id="guard"/, "未成年的家長 email 是 2026-09-07 拍板的，不能漏");
  assert.doesNotMatch(h, /disabled/);
});

test("資料沒填齊：擋在前面，而且告訴他去哪裡填", () => {
  const h = A.formHTML(form, qs, "needProfile", "", false, false);
  assert.match(h, /姓名、學校、年級/);
  assert.doesNotMatch(h, /data-act="submit"/);
});

test("已經送過了就說出來，不要讓他再填一次", () => {
  assert.match(A.formHTML(form, qs, "already", "", false, false), /已經送出過/);
});

test("必填有星號，選項畫得出來", () => {
  const h = A.formHTML(form, qs, "signedIn", "", false, false);
  assert.match(h, /必填/);
  for (const o of qs[1].options) assert.match(h, new RegExp(o));
  assert.match(h, /type="radio"/, "單選要用 radio");
});

test("多選用 checkbox，長答用 textarea", () => {
  const h = A.formHTML(form, [{ ...qs[1], type: "multi" }, qs[0]], "signedIn", "", false, false);
  assert.match(h, /type="checkbox"/);
  assert.match(h, /<textarea/);
});

test("送出中的時候鎖住按鈕", () => {
  assert.match(A.formHTML(form, qs, "signedIn", "", true, false), /data-act="submit" disabled/);
});

test("★ 失敗一定要說話", () => {
  assert.match(A.formHTML(form, qs, "signedIn", "這幾題還沒填：你為什麼想參加", false, false),
    /這幾題還沒填/);
});

test("英文版走英文字串", () => {
  const h = A.formHTML(form, qs, "needIn", "", false, true);
  assert.match(h, /You need a Beyond Taiwan account/);
  assert.doesNotMatch(h, /送出申請/);
});

test("跳脫：表單標題裡的角括號不會變成標籤", () => {
  const h = A.listHTML([{ ...form, title: '<img src=x onerror="alert(1)">' }], false);
  assert.ok(!h.includes("<img src=x"));
});

// ── /admin/ ───────────────────────────────────────────────────────────
const af = { id: "f1", team: "Curriculum", kind: "program", title: "探索營",
             status: "draft", lang: "zh", counts: { total: 3, received: 2 } };

test("清單顯示狀態與收到幾件", () => {
  const h = M.listHTML([af], true, "");
  assert.match(h, /還在寫/);
  assert.match(h, />3</, "收到幾件沒有顯示");
  assert.match(h, /2 件還沒處理/);
});

// ⚠ 2026-09-07 拍板的三層：一般幹部看得到自己 team 的申請，但改不動表單。
test("★ 一般幹部是唯讀的：沒有新增鈕，而且說清楚為什麼", () => {
  const h = M.listHTML([af], false, "");
  assert.doesNotMatch(h, /data-act="new-form"/);
  assert.match(h, /改不動/);
  assert.match(h, /看這份表單/, "按鈕的字要說實話");
});

test("表單頁：唯讀的時候每一格都鎖住，也沒有存檔與刪除", () => {
  const h = M.formHTML({ ...af, intro: "", opens_at: null, closes_at: null, notify_by: null,
                         interview_url: null }, [], false, [], "", false);
  assert.doesNotMatch(h, /data-act="save-form"/);
  assert.doesNotMatch(h, /data-act="del-form"/);
  assert.doesNotMatch(h, /data-act="q-new"/);
  assert.ok((h.match(/disabled/g) || []).length >= 6);
});

test("表單頁：四種題型都在，而且說明了哪一種是什麼", () => {
  const h = M.questionHTML(null, "", false);
  for (const t of M.TYPES) assert.match(h, new RegExp(`>${t.label}</option>`));
  assert.match(h, /一行一個/, "選項怎麼填要講");
});

test("★ 日期格式：datetime-local 與 date 都不能塞整串 ISO 進去", () => {
  assert.equal(M.dtVal("2026-12-01T09:30:00+00:00"), "2026-12-01T09:30");
  assert.equal(M.dateVal("2026-12-15"), "2026-12-15");
  assert.equal(M.dtVal(null), "");
  assert.equal(M.dateVal(undefined), "");
});

test("題目列有上下移動，第一題不能上移、最後一題不能下移", () => {
  const h = M.formHTML(af, [{ id: "a", label: "一", type: "short", required: false, options: [] },
                            { id: "b", label: "二", type: "short", required: false, options: [] }],
                       true, [], "", false);
  const ups = h.match(/data-act="q-up"[^>]*/g);
  assert.ok(ups[0].includes("disabled"), "第一題還能往上移");
  const downs = h.match(/data-act="q-down"[^>]*/g);
  assert.ok(downs[1].includes("disabled"), "最後一題還能往下移");
});

test("學員走到 /admin/ 的時候不說「你沒有權限」", () => {
  const h = M.notCadreHTML();
  assert.doesNotMatch(h, /權限/, "他沒有做錯任何事，只是走錯地方");
  assert.match(h, /回我的帳號/);
});

// ⚠ 這一條是實測抓到的。只有日期的字串交給 new Date() 會被當成 UTC 午夜，
// 再用本地的 getDate() 讀出來，在台灣以西的時區就少一天 ——
// 而畫面上那是一個看起來完全正常的日期。
// 2026-09-08 在 headless Chrome（美西時區）上把 12/15 畫成 12/14。
test("★ 只有日期的字串不可以少一天，不管跑在哪個時區", () => {
  assert.equal(A.fmtDate("2026-12-15", false), "2026 年 12 月 15 日");
  assert.equal(A.fmtDate("2026-12-15", true), "15 Dec 2026");
  assert.equal(A.fmtDate("2027-01-01", false), "2027 年 1 月 1 日");
  assert.equal(A.fmtDate("", false), "");
  assert.equal(A.fmtDate(null, true), "");
});

test("學員頁的日期用同一套規則（兩邊各寫一份會分岔）", async () => {
  const S = await import("../app/src/ui.js");
  assert.equal(S.fmtDay("2026-12-15"), "2026 年 12 月 15 日");
  assert.equal(S.statusLine({ status: "received", notify_by: "2026-12-15" }),
    "已收到，2026 年 12 月 15 日 前會通知你");
  assert.equal(S.statusLine({ status: "received" }), "已收到",
    "沒有預計通知日就不要編一個出來");
  assert.equal(S.statusLine({ status: "interview" }), "邀請你面試");
  assert.equal(S.statusLine({ status: "accepted" }), "錄取了");
  assert.equal(S.statusLine({ status: "rejected" }), "這次沒有錄取");
});

test("學員頁畫得出我的申請與現在開放的，而且已經申請過的不再列一次", async () => {
  const S = await import("../app/src/ui.js");
  const p = { name: "王小明", school: "建中", grade: "高二", newsletter: true };
  const apps = [{ id: "a1", form_id: "f1", status: "interview", title: "探索營",
                  interview_url: "https://cal.com/bt" }];
  const opens = [{ id: "f1", title: "探索營" }, { id: "f2", title: "導生配對" }];
  const h = S.studentHTML(p, "", apps, opens);
  assert.match(h, /邀請你面試/);
  assert.match(h, /cal\.com\/bt/, "面試那張卡要放得到 Cal 連結");
  assert.match(h, /你還沒約時間/);
  assert.match(h, /導生配對/);
  assert.equal((h.match(/探索營/g) || []).length, 1, "已經申請過的又出現在「現在開放」裡");
});
