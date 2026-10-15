// 實習護照的後台分頁（/admin/，2026-10-18）：Internship team 自己改格子、開新的一屆。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { tabsHTML, setInternStaff, internAdminHTML, internTermEditHTML, internTaskEditHTML,
         suggestTaskId, INTERN_CATS } from "../admin/src/ui.js";
import { says } from "../admin/src/data.js";

const DATA = {
  terms: [
    { id: "2026-27", title_zh: "2026-27 實習", title_en: "INTERNSHIP 2026-27", starts_on: "2026-09-01", ends_on: "2027-07-31", active: true },
    { id: "2027-28", title_zh: "2027-28 實習", title_en: "INTERNSHIP 2027-28", starts_on: "2027-09-01", ends_on: "2028-07-31", active: false },
  ],
  tasks: [
    { id: "T2627-01", term: "2026-27", seq: 1, category: "onboard", title_zh: "認識 BT", title_en: "MEET BT", description: "看介紹", active: true },
    { id: "T2627-04", term: "2026-27", seq: 4, category: "project", title_zh: "第一個任務", title_en: "FIRST TASK", description: null, active: false },
    { id: "T2728-01", term: "2027-28", seq: 1, category: "reflect", title_zh: "明年的", title_en: "NEXT YEAR", description: "", active: true },
  ],
  stamped: { "T2627-01": 3 },
  interns: 4,
};

test("Co-President 在實習護照分頁上，其他分頁不會不見", () => {
  const h = internAdminHTML(DATA, null, "", false, true);
  assert.match(h, /data-t="invites"/);
  assert.doesNotMatch(internAdminHTML(DATA, null, "", false, false), /data-t="invites"/);
});

test("分頁：Internship team 的幹部看得到，別的 team 看不到，Co-President 一律看得到", () => {
  setInternStaff(false);
  assert.doesNotMatch(tabsHTML("forms", false), /data-t="interns"/);
  assert.match(tabsHTML("forms", true), /data-t="interns"/);
  assert.match(tabsHTML("forms", false, true), /data-t="interns"/);
  setInternStaff(true);
  assert.match(tabsHTML("forms", false), /data-t="interns"/, "setInternStaff 之後，每一個分頁列都該有這一項");
  setInternStaff(false);
});

test("三個分類跟 intern_tasks 的 check 一字不差（後台的下拉選單不能多也不能少）", () => {
  const sql = readFileSync("supabase/migrations/2026-10-17-intern-passport.sql", "utf8");
  const m = sql.match(/category\s+text not null check \(category in \(([^)]+)\)\)/);
  const db = m[1].split(",").map(x => x.trim().replace(/'/g, "")).sort();
  assert.deepEqual(INTERN_CATS.map(c => c.v).sort(), db);
});

test("主畫面：屆別列出來、目前這一屆有標記、預設看 active 那一屆的格子", () => {
  const h = internAdminHTML(DATA, null, "", false);
  assert.match(h, /2026-27 實習/); assert.match(h, /2027-28 實習/);
  assert.equal((h.match(/>目前這一屆</g) || []).length, 1, "標記應該只有 active 那一屆有");
  assert.match(h, /認識 BT/);
  assert.doesNotMatch(h, /明年的/, "預設該看 active 那一屆，不該看到另一屆的格子");
  assert.match(h, /目前 4 位 intern/);
});

test("★ 蓋過的格子沒有刪掉按鈕，只有停用；沒人蓋過的才有刪掉", () => {
  const h = internAdminHTML(DATA, "2026-27", "", false);
  assert.match(h, /3 人蓋過/);
  assert.doesNotMatch(h, /data-act="intern-task-del" data-id="T2627-01"/);
  assert.match(h, /data-act="intern-task-off" data-id="T2627-01"/);
  assert.match(h, /data-act="intern-task-del" data-id="T2627-04"/);
  assert.match(h, /data-act="intern-task-on" data-id="T2627-04"/, "停用中的要有恢復");
  assert.match(h, /停用中/);
});

test("切到另一屆看得到那一屆的格子，而且那一屆有「設成目前這一屆」", () => {
  const h = internAdminHTML(DATA, "2027-28", "", false);
  assert.match(h, /明年的/);
  assert.doesNotMatch(h, /認識 BT/);
  assert.match(h, /data-act="intern-term-activate" data-id="2027-28"/);
  assert.doesNotMatch(h, /data-act="intern-term-activate" data-id="2026-27"/, "已經是目前這一屆的不該再有那顆");
});

test("★ 忙的時候每一顆按鈕都按不下去，訊息會顯示", () => {
  const h = internAdminHTML(DATA, "2026-27", "存好了。", true);
  assert.match(h, /存好了。/);
  const buttons = h.match(/<button[^>]*data-act="intern-[^"]*"[^>]*>/g) || [];
  assert.ok(buttons.length >= 5);
  for (const b of buttons) assert.match(b, /disabled/, `忙的時候還按得下去：${b}`);
});

test("沒有任何一屆時說清楚下一步", () => {
  const h = internAdminHTML({ terms: [], tasks: [], stamped: {}, interns: 0 }, null, "", false);
  assert.match(h, /先開一屆/);
  assert.match(h, /data-act="intern-term-new"/);
  assert.doesNotMatch(h, /data-act="intern-task-new"/);
});

test("改一屆：代號鎖住；開新的一屆：代號可以填", () => {
  const edit = internTermEditHTML(DATA.terms[0], "", false);
  assert.match(edit, /id="it-id" value="2026-27"[^>]*disabled/);
  assert.match(edit, /data-act="intern-term-save" data-id="2026-27"/);
  const fresh = internTermEditHTML(null, "", false);
  assert.match(fresh, /id="it-id" value=""/);
  assert.doesNotMatch(fresh, /id="it-id" value=""[^>]*disabled/);
  assert.match(fresh, /開新的一屆/);
});

test("改一格：代號鎖住、分類選到對的、存檔中按鈕變字", () => {
  const edit = internTaskEditHTML(DATA.tasks[0], "2026-27", "T2627-05", "", false);
  assert.match(edit, /id="ik-id" value="T2627-01" disabled/);
  assert.match(edit, /<option value="onboard" selected>/);
  assert.match(edit, /data-act="intern-task-save" data-term="2026-27" data-id="T2627-01"/);
  const busy = internTaskEditHTML(null, "2026-27", "T2627-05", "", true);
  assert.match(busy, /存檔中…/);
  assert.match(busy, /id="ik-id" value="T2627-05"/, "新格子要先填好建議的代號");
});

test("建議的代號：屆別四個數字加流水號，跳過已經用掉的", () => {
  assert.equal(suggestTaskId("2026-27", DATA.tasks), "T2627-03");
  assert.equal(suggestTaskId("2027-28", DATA.tasks), "T2728-02");
  assert.equal(suggestTaskId("2028-29", []), "T2829-01");
});

test("後台的錯誤碼都翻成人話，而且函式還沒跑進資料庫時說得出該跑哪一支", () => {
  for (const code of ["not_internship_team", "bad_term_id", "bad_task_id", "bad_dates", "empty_title",
                      "bad_category", "no_such_term", "no_such_task", "term_locked", "has_stamps"]) {
    const t = says(new Error(code));
    assert.notEqual(t, code, `${code} 沒有翻譯`);
    assert.ok(!t.includes(code), `${code} 的翻譯裡還夾著英文代碼：${t}`);
  }
  assert.match(says(new Error("Could not find the function public.save_intern_task")), /2026-10-18-intern-admin\.sql/);
});

test("★ 主程式每一個實習護照的動作成功或失敗都會寫 S.msg（畫面要有回饋）", () => {
  const src = readFileSync("admin/src/main.js", "utf8");
  for (const act of ["intern-term-save", "intern-term-activate", "intern-task-save", "intern-task-off", "intern-task-del"]) {
    const i = src.indexOf(`act === "${act}"`);
    assert.ok(i > 0, `找不到 ${act}`);
    const body = src.slice(i, src.indexOf("return;", src.indexOf("catch", i)));
    assert.match(body, /S\.busy = true/, `${act} 按下去沒有 busy`);
    assert.match(body, /S\.msg = /, `${act} 沒有回饋訊息`);
    assert.match(body, /D\.says\(err\)/, `${act} 失敗沒有翻譯錯誤`);
  }
});

test("★ 後台資料層寫入只走函式，不直接 insert / update intern_* 表", () => {
  const src = readFileSync("admin/src/data.js", "utf8").replace(/\/\/[^\n]*/g, "");
  assert.doesNotMatch(src, /from\("intern_[a-z]+"\)\s*\.(insert|update|upsert|delete)/);
  for (const fn of ["save_intern_term", "activate_intern_term", "save_intern_task", "set_intern_task_active", "delete_intern_task"])
    assert.ok(src.includes(`rpc("${fn}"`), `沒有呼叫 ${fn}`);
});
