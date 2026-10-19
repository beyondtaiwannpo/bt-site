// 後台的「看它在護照上長什麼樣」（2026-10-16）：真的 /passport/ 嵌進後台，帶 ?month=N 翻到那一月。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pageForMonth } from "../passport/src/ui.js";
import { passportAdminHTML, passportPreviewHTML, internAdminHTML, internPreviewHTML, setLang } from "../admin/passports/src/ui.js";
// 後台 2026-10-19 起有中英切換，字典預設英文；這一支斷言的是中文，所以先切成中文。
setLang("zh");
import { pageForCat, sampleProfile, idPageHTML, barHTML, setLang as internLang } from "../intern-passport/src/ui.js";
internLang("zh");

const S = { months: [{ seq: 1, month: 9 }, { seq: 2, month: 10 }, { seq: 3, month: 11 }] };
const DATA = { months: S.months, activities: [], destinations: [], stamped: {} };

test("?month 對到正確的頁：前面有資料頁與怎麼用兩頁", () => {
  assert.equal(pageForMonth(S, "9"), 2);
  assert.equal(pageForMonth(S, "11"), 4);
});

test("沒帶、亂帶、不存在的月份都開在資料頁", () => {
  for (const v of [null, "", "abc", "13", "9.5", "0"]) assert.equal(pageForMonth(S, v), 0, String(v));
});

test("每個月都有一顆預覽按鈕，沒按之前沒有框", () => {
  const h = passportAdminHTML(DATA, "", false, null);
  assert.equal((h.match(/data-act="preview"/g) || []).length, 3);
  assert.doesNotMatch(h, /<iframe/);
});

test("按了之後框出現，iframe 指到真的護照並帶 ?month", () => {
  const h = passportAdminHTML(DATA, "", false, 10);
  // 框裡帶 &bare=1（2026-10-19，Paul 拍板）：那一頁不畫頂欄與子欄。
  assert.match(h, /<iframe[^>]*src="\.\.\/\.\.\/passport\/\?month=10&bare=1"/);
  assert.match(h, /護照預覽：10 月/);
  assert.match(h, /data-act="preview-reload"/);
  assert.match(h, /data-act="preview-close"/);
  assert.match(h, /href="\.\.\/\.\.\/passport\/\?month=10" target="_blank"/);
});

test("後台沒有自己畫一份護照（只有 iframe，沒有 import passport/）", () => {
  assert.equal(passportPreviewHTML(null, S.months), "");
  // admin/passports 不准 import passport/，資料夾之間不互相依賴。
  const src = readFileSync(new URL("../admin/passports/src/ui.js", import.meta.url), "utf8");
  assert.doesNotMatch(src, /from "\.\.\/\.\.\/\.\.\/passport\//);
});

// ── 實習護照的預覽（樣書）──
const IS = { tasks: [{ id: "T1-01", category: "onboard" }, { id: "T1-02", category: "project" }], stamps: {}, entries: {},
             term: { id: "2026-27", title_zh: "2026-27 屆", title_en: "TERM 2026-27" }, staff: true, view: "sample", page: 0 };
const IDATA = { terms: [{ id: "2026-27", title_zh: "2026-27 屆", title_en: "T", starts_on: "2026-09-01", ends_on: "2027-01-31", active: true },
                        { id: "2025-26", title_zh: "2025-26 屆", title_en: "T", starts_on: "2025-09-01", ends_on: "2026-01-31", active: false }],
                tasks: [{ id: "T1-01", term: "2026-27", category: "onboard", title_zh: "a", title_en: "A", seq: 1, active: true },
                        { id: "T1-02", term: "2026-27", category: "project", title_zh: "b", title_en: "B", seq: 1, active: true }],
                stamped: {}, interns: 0 };

test("?cat 對到正確的頁；沒帶或不存在開在資料頁", () => {
  assert.equal(pageForCat(IS, "onboard"), 2);
  assert.equal(pageForCat(IS, "project"), 3);
  assert.equal(pageForCat(IS, "reflect"), 0);
  assert.equal(pageForCat(IS, null), 0);
});

test("★ 樣書的資料頁：假的人、沒有編輯鈕、大頭照不是連去設定的連結", () => {
  const h = idPageHTML({ ...IS, sample: true, profile: sampleProfile(IS.term) });
  assert.match(h, /實習生姓名/);
  assert.match(h, /這是樣書/);
  assert.doesNotMatch(h, /data-act="edit"/);
  assert.doesNotMatch(h, /href="\.\.\/settings\/"/);
});

test("樣書那個分頁選起來時進度牆沒選", () => {
  const h = barHTML({ ...IS, view: "sample" });
  assert.match(h, /aria-selected="true" data-act="tab" data-v="sample"/);
  assert.match(h, /aria-selected="false" data-act="tab" data-v="wall"/);
});

test("後台的實習護照頁：上面一顆、每個分類一顆預覽鈕，沒按之前沒有框", () => {
  const h = internAdminHTML(IDATA, "2026-27", "", false, true, null);
  assert.equal((h.match(/data-act="ipreview"/g) || []).length, 3);
  assert.doesNotMatch(h, /<iframe/);
});

test("按了之後 iframe 指到實習護照的樣書並帶 ?cat", () => {
  const h = internAdminHTML(IDATA, "2026-27", "", false, true, "project");
  assert.match(h, /<iframe[^>]*src="\.\.\/\.\.\/intern-passport\/\?view=sample&cat=project&bare=1"/);
  assert.match(h, /實習護照預覽：任務/);
  const h0 = internAdminHTML(IDATA, "2026-27", "", false, true, "");
  assert.match(h0, /src="\.\.\/\.\.\/intern-passport\/\?view=sample&bare=1"/);
  // 兩頁真的認 bare=1，不畫頂欄（讀得到什麼仍然是 RLS 決定的）。
  for (const f of ["passport/src/main.js", "intern-passport/src/main.js"]) {
    assert.match(readFileSync(f, "utf8"), /get\("bare"\) === "1"/, `${f} 要認 ?bare=1`);
  }
});

test("★ 正在看的不是目前這一屆時，預覽框會提醒樣書只畫目前這一屆", () => {
  assert.match(internAdminHTML(IDATA, "2025-26", "", false, true, ""), /你現在在看的不是那一屆/);
  assert.doesNotMatch(internAdminHTML(IDATA, "2026-27", "", false, true, ""), /你現在在看的不是那一屆/);
  assert.equal(internPreviewHTML(null, true), "");
});
