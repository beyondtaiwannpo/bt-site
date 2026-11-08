// 設定頁的「我的去向」（2026-11-08，BT Records 計畫 Phase 4）：幹部與校友自己填現在在哪。
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { settingsHTML, outcomesHTML, outcomeRowHTML, cleanOutcome, OUTCOME_KINDS, OUTCOME_VIS, setLang } from "../settings/src/ui.js";

setLang("zh");
const ALUM = { role: "alumni", email: "a@x.io", name_zh: "王小明", name_en: "Ming" };
const ONE = { id: "o-1", kind: "enrolled", institution: "UBC", country: "Canada", major: "Econ", year: 2024, note: "", visibility: "internal", source: "self" };

test("★ 八種狀態與四種可見範圍跟遷移檔的 check constraint 一模一樣", () => {
  const sql = readFileSync(new URL("../supabase/migrations/2026-12-01-records.sql", import.meta.url), "utf8");
  const fn = sql.slice(sql.indexOf("function public.rc_save_outcome("));
  const kinds = fn.match(/v_kind not in \(([^)]*)\)/)[1].match(/'([a-z]+)'/g).map(x => x.replace(/'/g, ""));
  const vis = sql.slice(sql.indexOf("create table if not exists public.rc_outcomes")).match(/visibility in \(([^)]*)\)/)[1].match(/'([a-z]+)'/g).map(x => x.replace(/'/g, ""));
  assert.deepEqual([...OUTCOME_KINDS].sort(), kinds.sort());
  assert.deepEqual([...OUTCOME_VIS].sort(), vis.sort());
});

test("幹部與校友有「我的去向」，學員與實習生沒有", () => {
  assert.match(settingsHTML(ALUM, "", false, null, []), /data-outcomes/);
  assert.match(settingsHTML({ ...ALUM, role: "cadre", ws: {} }, "", false, null, []), /data-outcomes/);
  assert.doesNotMatch(settingsHTML({ ...ALUM, role: "intern" }, "", false, null, []), /data-outcomes/);
  assert.doesNotMatch(settingsHTML({ role: "student", email: "s@x.io" }, "", false, null, []), /data-outcomes/);
});

test("沒有半筆就說還沒填並給「加一筆」；有的話一筆一個 data-autosave=outcome 容器帶 id", () => {
  const empty = outcomesHTML([]);
  assert.match(empty, /還沒有填/); assert.match(empty, /data-act="outcome-add"/);
  const h = outcomesHTML([ONE, { ...ONE, id: "o-2", source: "mentorship" }]);
  assert.equal((h.match(/data-autosave="outcome"/g) || []).length, 2);
  assert.match(h, /data-id="o-1"/); assert.match(h, /data-id="o-2"/);
  assert.match(h, /data-act="outcome-del" data-id="o-1"/);
  assert.equal((h.match(/Mentorship 幫你記的/g) || []).length, 1, "別人記的那一筆要標出來，自己填的不標");
});

test("一筆畫出來：選到的狀態與可見範圍、年份、文字欄位都在；使用者的字有 esc", () => {
  const h = outcomeRowHTML({ ...ONE, institution: '<b>"x"</b>' });
  assert.match(h, /<option value="enrolled" selected>/);
  assert.match(h, /<option value="internal" selected>/);
  assert.match(h, /name="year"[^>]*value="2024"/);
  assert.match(h, /&lt;b&gt;&quot;x&quot;&lt;\/b&gt;/);
  assert.doesNotMatch(h, /<b>"x"<\/b>/);
  for (const n of ["kind", "year", "institution", "country", "major", "visibility", "note"]) assert.match(h, new RegExp(`name="${n}"`), n);
});

test("cleanOutcome：年份只收 2000 到 2100 的整數，文字去空白，選單外的值退回預設", () => {
  assert.deepEqual(cleanOutcome({ kind: "enrolled", year: " 2024 ", institution: " UBC ", country: "", major: "x", note: "n", visibility: "public" }),
    { kind: "enrolled", year: 2024, institution: "UBC", country: "", major: "x", note: "n", visibility: "public" });
  assert.equal(cleanOutcome({ year: "" }).year, null);
  assert.equal(cleanOutcome({ year: "1999" }).year, null);
  assert.equal(cleanOutcome({ year: "abc" }).year, null);
  assert.equal(cleanOutcome({ kind: "hacker" }).kind, "other");
  assert.equal(cleanOutcome({ visibility: "everyone" }).visibility, "internal");
  assert.deepEqual(cleanOutcome({}), {}, "沒給的欄位不送，函式那邊就不改");
});

test("★ main.js 走 rc_save_outcome / rc_delete_outcome / rc_my_outcomes，不直接寫 rc_outcomes 那張表", () => {
  const src = readFileSync(new URL("../settings/src/main.js", import.meta.url), "utf8");
  assert.match(src, /supabase\.rpc\("rc_my_outcomes"\)/);
  assert.match(src, /supabase\.rpc\("rc_save_outcome"/);
  assert.match(src, /supabase\.rpc\("rc_delete_outcome"/);
  assert.doesNotMatch(src, /from\("rc_outcomes"\)/, "去向只准走函式，表對登入的人零直接權限");
  assert.match(src, /act === "outcome-del"[\s\S]*?confirm\(/, "刪是不可逆的，要問一句");
});
