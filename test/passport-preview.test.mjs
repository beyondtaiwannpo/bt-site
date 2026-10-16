// 後台的「看它在護照上長什麼樣」（2026-10-16）：真的 /passport/ 嵌進後台，帶 ?month=N 翻到那一月。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pageForMonth } from "../passport/src/ui.js";
import { passportAdminHTML, passportPreviewHTML } from "../admin/passports/src/ui.js";

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
  assert.match(h, /<iframe[^>]*src="\.\.\/\.\.\/passport\/\?month=10"/);
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
