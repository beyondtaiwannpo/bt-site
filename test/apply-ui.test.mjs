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

// ── /admin/ 審核（批 4）───────────────────────────────────────────────
const apps = [
  { id: "a1", applicant_name: "陳小安", applicant_school: "建中", applicant_grade: "高二",
    applicant_email: "a@example.com", guardian_email: "mom@example.com",
    status: "received", submitted_at: "2026-11-01T02:00:00Z", answers: new Map([["q1", "因為我想出國"]]) },
  { id: "a2", applicant_name: "林大維", applicant_school: "北一女", applicant_grade: "高三",
    applicant_email: "b@example.com", guardian_email: null,
    status: "accepted", submitted_at: "2026-11-02T02:00:00Z", answers: new Map() },
];
const aq = [{ id: "q1", label: "你為什麼想參加", type: "long", required: true, options: [] }];
const aform = { id: "f1", title: "探索營" };

test("審核頁：每一件都看得到名字、學校、送出日期與狀態", () => {
  const h = M.appsHTML(aform, apps, aq, true, new Set(), "all", [], "", false);
  assert.match(h, /陳小安/);
  assert.match(h, /建中/);
  assert.match(h, /還沒處理/);
  assert.match(h, /錄取/);
  assert.match(h, /mom@example\.com/, "家長信箱要看得到，那是要寄告知信的地方");
});

test("答案是收起來的，但已經在頁面上（點開不打網路）", () => {
  const h = M.appsHTML(aform, apps, aq, true, new Set(), "all", [], "", false);
  assert.match(h, /<details class="ans">/);
  assert.match(h, /因為我想出國/, "答案沒有畫進頁面，那就會變成點開才查");
  assert.match(h, /（沒填）/, "沒填的題目要說出來，不是留白");
});

// ⚠ 這三顆按鈕會寄信給未成年人，而且收不回來。
test("★ 沒有選人的時候，三顆會寄信的按鈕是鎖住的", () => {
  const h = M.appsHTML(aform, apps, aq, true, new Set(), "all", [], "", false);
  for (const s of ["interview", "accepted", "rejected"])
    assert.match(h, new RegExp(`data-act="decide" data-s="${s}"[^>]*disabled`), s + " 沒有鎖住");
});

test("選了人之後按鈕開得動，而且說出選了幾個", () => {
  const h = M.appsHTML(aform, apps, aq, true, new Set(["a1"]), "all", [], "", false);
  assert.match(h, /選了 1 個人/);
  assert.doesNotMatch(h, /data-act="decide" data-s="accepted"[^>]*disabled/);
});

test("★ 一般幹部看得到申請，但沒有任何會寄信的按鈕", () => {
  const h = M.appsHTML(aform, apps, aq, false, new Set(), "all", [], "", false);
  assert.match(h, /陳小安/, "看不到申請的話這一頁對他沒有用");
  assert.doesNotMatch(h, /data-act="decide"/);
  assert.doesNotMatch(h, /data-act="pick"/);
});

test("篩選：每一格都顯示數量，選到的那一格有標記", () => {
  const h = M.appsHTML(aform, apps, aq, true, new Set(), "accepted", [], "", false);
  assert.match(h, /全部 2/);
  assert.match(h, /還沒處理 1/);
  assert.match(h, /data-f="accepted"[^>]*>/);
  assert.doesNotMatch(h, /陳小安/, "篩選成「錄取」之後不該看到還沒處理的人");
});

// ⚠ 這是「用資料庫寄信」那個取捨成立的前提：看不見的東西壞掉沒有人會發現。
test("★ 有信沒寄出去就一定要說，而且給得出重試的路", () => {
  const h = M.appsHTML(aform, apps, aq, true, new Set(), "all",
    [{ id: "m1", kind: "accepted", tries: 2, error: "mail_not_configured" }], "", false);
  assert.match(h, /還有 <b>1<\/b> 封信沒有寄出去/);
  assert.match(h, /mail_not_configured/, "失敗原因要顯示出來");
  assert.match(h, /data-act="send-mail"/);
});

test("沒有待寄的信就完全不畫那一塊（永遠顯示 0 的區塊是雜訊）", () => {
  const h = M.appsHTML(aform, apps, aq, true, new Set(), "all", [], "", false);
  assert.doesNotMatch(h, /沒有寄出去/);
  assert.doesNotMatch(h, /data-act="send-mail"/);
});

test("跳脫：申請人的名字裡有角括號也不會變成標籤", () => {
  const evil = [{ ...apps[0], applicant_name: '<img src=x onerror="alert(1)">' }];
  const h = M.appsHTML(aform, evil, aq, true, new Set(), "all", [], "", false);
  assert.ok(!h.includes("<img src=x"));
});

test("★ 錯誤代碼要翻成人話（看到它的多半是沒設定過 Vault 的學生）", async () => {
  const D = await import("../admin/src/data.js");
  assert.match(D.says(new Error("mail_not_configured")), /Vault/);
  assert.match(D.says(new Error("mail_not_configured")), /pg_net/);
  // ⚠ 2026-09-08：資料庫會說「缺哪一個、Vault 裡實際有什麼」，
  // **那段細節一定要傳到畫面上**。罐頭訊息蓋掉它的話，
  // 看的人就少了唯一能看出「我名字打錯了」的線索。
  const detailed = D.says(new Error(
    "mail_not_configured：缺 RESEND_API_KEY。Vault 裡現在有：Resend API、BT_MAIL_FROM"));
  assert.match(detailed, /Vault 裡現在有：Resend API、BT_MAIL_FROM/, "資料庫講的細節被蓋掉了");
  assert.match(detailed, /修法/, "細節之外也要說怎麼修");
  assert.doesNotMatch(detailed, /mail_not_configured/, "代碼本身不該留在畫面上");
  assert.match(D.says({ message: "not_director_of:Marketing" }), /不是你這個 team/);
  assert.match(D.says(new Error("form_closed")), /已經關閉/);
  assert.equal(D.says(new Error("某個沒見過的錯")), "某個沒見過的錯",
    "沒對到的錯誤要原樣顯示，不要吞掉");
});

// ── 信件文案（2026-09-08）────────────────────────────────────────────
const tpl = { kind: "accepted", subject: "Beyond Taiwan：「{活動名稱}」錄取通知",
              body: "{姓名} 你好，\n\n你申請的「{活動名稱}」錄取了。" };

test("四封信都列得出來，而且說得出什麼時候會寄", () => {
  const h = M.mailListHTML([tpl], "");
  for (const k of M.MAIL_KINDS) {
    assert.match(h, new RegExp(k.label));
    assert.match(h, new RegExp(k.when.slice(0, 6)));
  }
});

// ⚠ 這一頁的價值全在預覽：代換符號打錯不會壞掉、只會空著。
test("★ 預覽要把代換符號換成範例，而且跟資料庫同一套規則", () => {
  assert.equal(M.fillMail("{姓名} 你好，{活動名稱}", "陳小安", "探索營"), "陳小安 你好，探索營");
  assert.equal(M.fillMail("{姓名}{姓名}", "A", "B"), "AA", "同一個符號出現兩次都要換");
  assert.equal(M.fillMail(null, "A", "B"), "");
  const h = M.mailEditHTML("accepted", tpl, "", false);
  assert.match(h, /陳小安 你好/, "預覽沒有把 {姓名} 換掉");
  assert.doesNotMatch(h.split("寄出去會長這樣")[1], /\{姓名\}/, "預覽裡還留著沒換的符號");
});

// ⚠ 「不要回覆這封信」是必要資訊不是禮貌用語：noreply 沒有 MX。
test("★ 信尾是系統加的，預覽看得到但改不掉", () => {
  const h = M.mailEditHTML("accepted", tpl, "", false);
  assert.match(h, /不要回覆這封信/);
  assert.match(h, /class="tail"/, "系統加的那段要跟可編輯的內文分開顯示");
  assert.match(h, /改不掉/, "要說出來它改不掉，不然人會以為自己刪得掉");
  // 家長那封的結尾不一樣（它不是「不要回覆」，是「不需要回覆或簽名」）
  assert.match(M.mailTail("guardian"), /不需要回覆或簽名/);
  assert.match(M.mailTail("accepted"), /不要回覆這封信/);
});

test("邀請面試那封的預覽要帶出 Cal 連結那一段（那是系統加的）", () => {
  assert.match(M.mailEditHTML("interview", { kind: "interview", subject: "x", body: "y" }, "", false),
    /cal\.com/);
});

test("信件文案那個分頁只有 Co-President 看得到", () => {
  assert.doesNotMatch(M.tabsHTML("forms", false), /data-t="mail"/);
  assert.match(M.tabsHTML("forms", true), /data-t="mail"/);
});

test("存檔中會鎖住按鈕", () => {
  assert.match(M.mailEditHTML("accepted", tpl, "", true), /data-act="mail-save"[^>]*disabled/);
});
