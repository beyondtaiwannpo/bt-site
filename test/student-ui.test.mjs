// 學員那幾頁（批 2，2026-09-08）。
//
// 這一份守的是「決定」，不是「長相」。每一條對應盤點時拍板的一件事，
// 而且都是**改壞了畫面上看不出來**的那種：
// 預設打勾的同意、少了刪除入口、送出時多送一欄。
import { test } from "node:test";
import assert from "node:assert/strict";
import { completeHTML, studentHTML, deleteHTML, profileComplete, GRADES } from "../app/src/ui.js";

const full = { name: "王小明", school: "臺北市立建國高級中學", grade: "高二", newsletter: true };

test("profileComplete：三個欄位都要有值", () => {
  assert.equal(profileComplete(full), true);
  assert.equal(profileComplete(null), false);
  assert.equal(profileComplete({ ...full, name: "" }), false);
  assert.equal(profileComplete({ ...full, school: "  " }), false, "只有空白不算填了");
  assert.equal(profileComplete({ ...full, grade: "" }), false);
  assert.equal(profileComplete({ name: "a", school: "b", grade: "c" }), true,
    "沒訂電子報不影響「資料齊了沒有」——那是同意，不是資料");
});

// ⚠ 這一條守的是同意的意義。預設打勾等於沒有同意。
test("★ 電子報那個勾預設不打", () => {
  const h = completeHTML(null, "", false);
  assert.match(h, /id="pnl" type="checkbox">/, "沒有資料的時候不可以有 checked");
  assert.doesNotMatch(h, /id="pnl"[^>]*checked/);
});

test("已經訂閱過的人回來改資料，那個勾是打著的", () => {
  assert.match(completeHTML(full, "", false), /id="pnl" type="checkbox" checked/);
});

test("補完資料頁：三個欄位、年級選項齊全、學校那格接到 datalist", () => {
  const h = completeHTML(null, "", false);
  for (const id of ["pn", "ps", "pg"]) assert.match(h, new RegExp(`id="${id}"`), id + " 不見了");
  assert.match(h, /<datalist id="schools">/, "沒有 datalist 的話自動完成接不上");
  assert.match(h, /list="schools"/);
  for (const g of GRADES) assert.match(h, new RegExp(`>${g}</option>`), g + " 這個年級選項不見了");
});

test("學校那格關掉自動更正（跟邀請碼同一個理由：看不見的竄改）", () => {
  const h = completeHTML(null, "", false);
  const tag = h.match(/<input id="ps"[^>]*>/)[0];
  for (const a of ["autocapitalize=\"off\"", "autocorrect=\"off\"", "spellcheck=\"false\""])
    assert.ok(tag.includes(a), "學校那格少了 " + a);
});

test("存檔中的時候按鈕會鎖住，而且字會變", () => {
  assert.match(completeHTML(full, "", true), /data-act="save-profile" disabled/);
  assert.match(completeHTML(full, "", true), /存檔中…/);
  assert.doesNotMatch(completeHTML(full, "", false), /disabled/);
});

// ⚠ 這一條守的是 2026-09-07 那個決定的對價：
// 資料不設保存期限，所以當事人一定要能自己刪掉。
test("★ 學員頁上一定找得到刪除帳號的入口", () => {
  assert.match(studentHTML(full, ""), /data-act="ask-delete"/);
});

test("學員頁不放還不存在的東西", () => {
  const h = studentHTML(full, "");
  for (const gone of ["申請", "資源", "護照"])
    assert.ok(!h.includes(gone + "</b>"), `「${gone}」還沒做出來，不該出現成一個入口`);
  assert.doesNotMatch(h, /disabled/, "灰掉的入口比沒有入口更糟");
});

test("學員頁：沒填的欄位說「還沒填」，不是留白", () => {
  const h = studentHTML({ name: "王小明", school: "", grade: "", newsletter: false }, "");
  assert.equal((h.match(/還沒填/g) || []).length, 2, "學校與年級各一個");
  assert.match(h, /沒有訂閱/);
});

test("學員頁有回幹部升級的入口，升級頁有回得來的路", () => {
  assert.match(studentHTML(full, ""), /data-act="show-claim"/);
});

// ⚠ 打字確認，不是按兩次。按兩次擋不住誤按，因為誤按的人第二次也會按。
test("★ 刪除帳號要打字確認，而且講清楚會刪掉什麼", () => {
  const h = deleteHTML("", false);
  assert.match(h, /id="dc"/, "沒有那格輸入就變成按一下就刪");
  assert.match(h, /data-act="do-delete"/);
  assert.match(h, /data-act="back-account"/, "一定要有一條反悔的路");
  assert.match(h, /沒有辦法復原/);
});

test("刪除中的時候按鈕鎖住", () => {
  assert.match(deleteHTML("", true), /data-act="do-delete" disabled/);
});

test("三頁的錯誤訊息都畫得出來（失敗一定要說話）", () => {
  for (const [name, h] of [["補完", completeHTML(null, "壞了", false)],
                           ["學員", studentHTML(full, "壞了")],
                           ["刪除", deleteHTML("壞了", false)]]) {
    assert.match(h, /壞了/, name + "頁吞掉了訊息");
    assert.equal((h.match(/class="wnote"/g) || []).length >= 1, true, name + "頁沒有畫出橘框");
  }
});

test("沒有訊息的時候不出現任何橘色框", () => {
  assert.equal((completeHTML(full, "", false).match(/class="wnote"/g) || []).length, 0);
  assert.equal((studentHTML(full, "").match(/class="wnote"/g) || []).length, 0);
});

test("跳脫：名字裡的角括號不會變成標籤", () => {
  const evil = { ...full, name: '<img src=x onerror="alert(1)">' };
  const h = studentHTML(evil, "");
  assert.ok(!h.includes("<img src=x"), "名字沒有跳脫");
  assert.match(h, /&lt;img/);
});
