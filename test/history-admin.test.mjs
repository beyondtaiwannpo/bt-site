// BT 歷史之路（2026-11-06，docs/2026-11-05-BT-歷史之路計畫.md）批 1：後台 History 分頁的純函式。
// 跑法：node --test test/*.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import * as F from "../admin/src/ui.js";
import * as SITE from "../admin/site/src/ui.js";
import * as PA from "../admin/passports/src/ui.js";
import * as PE from "../admin/people/src/ui.js";
import { MINE } from "../admin/site/src/strings.js";

SITE.setLang("zh");
const ASSOC = { id: "u2", role: "cadre", board: "member", team: "Curriculum Team", name: "小安", senior: false, pres: false, ws: {} };
const MKT = { ...ASSOC, id: "u5", board: "director", team: "Marketing Team", ws: { "res:Marketing Team": "manage" } };
const MKT_EDIT = { ...ASSOC, id: "u6", team: "Marketing Team", ws: { "res:Marketing Team": "edit" } };
const PRES = { ...ASSOC, id: "u1", board: "president", senior: true, pres: true };
const PH_OK = { id: "p1", url: "https://x.supabase.co/storage/v1/object/public/history/m1/a.jpg", caption_zh: "第一屆", caption_en: "First camp", consent: true, sort: 1 };
const PH_NO = { id: "p2", url: "https://x.supabase.co/storage/v1/object/public/history/m1/b.jpg", caption_zh: "", caption_en: "", consent: false, sort: 2 };
const M1 = { id: "m1", slug: "2023-first-college-bootcamp", happened_on: "2023-06-01", title_zh: "第一屆探索營，超過 80 人", title_en: "First College Bootcamp, more than 80 students",
  summary_zh: "", summary_en: "", body_zh: "", body_en: "", sort: 50, status: "draft", published_at: null, photos: [PH_OK] };
const ROWS = [
  { ...M1, id: "m0", slug: "2020-founded", happened_on: "2020-05-01", title_zh: "成立，七個人", title_en: "Founded, seven people", sort: 10, status: "published", photos: [] },
  M1,
  { ...M1, id: "m2", slug: "2025-alumni", happened_on: "2025-05-01", title_zh: "校友帳號超過 85 個", title_en: "More than 85 alumni accounts", sort: 60, status: "ready", photos: [PH_OK, PH_NO] },
];

test("★ 側欄四份都有「歷史之路」，在「對外」那一組，幹部都看得到", () => {
  for (const M of [F, SITE, PA, PE]) {
    const it = M.ITEMS.find(i => i.key === "history");
    assert.ok(it, "ITEMS 少了 history");
    assert.equal(it.group, "site"); assert.equal(it.who, "cadre");
    assert.ok(M.canSee(it, ASSOC));
  }
});

test("誰能編：senior 與 Marketing 資源工作區「管」的人；「改」的人與別的 team 不行（畫面用，門在資料庫）", () => {
  assert.ok(SITE.hiCanEdit(PRES)); assert.ok(SITE.hiCanEdit(MKT));
  assert.ok(!SITE.hiCanEdit(MKT_EDIT)); assert.ok(!SITE.hiCanEdit(ASSOC)); assert.ok(!SITE.hiCanEdit(null));
  assert.equal(SITE.HI_WS, "res:Marketing Team");
});

test("代號：年份加英文標題，小寫、連字號、最多 40 字；沒有英文就只剩年份加中文的拼不出來時回空", () => {
  assert.equal(SITE.hiSlug("First College Bootcamp, more than 80 students", "2023-06-01"), "2023-first-college-bootcamp-more-than-80");
  assert.equal(SITE.hiSlug("Founded, seven people", "2020-05-01"), "2020-founded-seven-people");
  assert.equal(SITE.hiSlug("Today", ""), "today");
  assert.equal(SITE.hiSlug("", "2021-10-01"), "2021");
  assert.equal(SITE.hiSlug("成立", ""), "");
  assert.ok(SITE.hiSlugOk("2023-first-college-bootcamp")); assert.ok(!SITE.hiSlugOk("First Camp")); assert.ok(!SITE.hiSlugOk("x"));
});

test("縮圖：最長邊縮到 1600，小的不放大，比例不變", () => {
  assert.deepEqual(SITE.hiFit(4000, 3000), { w: 1600, h: 1200 });
  assert.deepEqual(SITE.hiFit(3000, 4000), { w: 1200, h: 1600 });
  assert.deepEqual(SITE.hiFit(800, 600), { w: 800, h: 600 });
  assert.deepEqual(SITE.hiFit(1601, 1), { w: 1600, h: 1 }, "高不會變成 0");
  assert.ok(SITE.hiFileOk({ type: "image/jpeg", size: 4 * 1024 * 1024 }));
  assert.ok(!SITE.hiFileOk({ type: "application/pdf", size: 10 }), "只收圖");
  assert.ok(!SITE.hiFileOk({ type: "image/png", size: 30 * 1024 * 1024 }), "原檔超過 25 MB 不收（瀏覽器會卡）");
});

test("上下移：回一整串新順序的 id；到頂了往上、到底了往下都回 null", () => {
  assert.deepEqual(SITE.hiMove(ROWS, "m1", "up"), ["m1", "m0", "m2"]);
  assert.deepEqual(SITE.hiMove(ROWS, "m1", "down"), ["m0", "m2", "m1"]);
  assert.equal(SITE.hiMove(ROWS, "m0", "up"), null);
  assert.equal(SITE.hiMove(ROWS, "m2", "down"), null);
  assert.equal(SITE.hiMove(ROWS, "nope", "up"), null);
});

test("資料整形：資料庫回的 history_photos 巢狀欄位整成 photos 並照 sort 排；沒有就是空陣列", () => {
  const rows = SITE.hiRows([{ id: "a", sort: 20, history_photos: [{ id: "p2", sort: 2 }, { id: "p1", sort: 1 }] }, { id: "b", sort: 10, history_photos: null }]);
  assert.deepEqual(rows.map(r => r.id), ["b", "a"], "站照 sort 排");
  assert.deepEqual(rows[1].photos.map(p => p.id), ["p1", "p2"]);
  assert.deepEqual(rows[0].photos, []);
  assert.ok(!("history_photos" in rows[0]));
  assert.ok(SITE.hiConsentOk(M1)); assert.ok(!SITE.hiConsentOk(ROWS[2])); assert.ok(SITE.hiConsentOk(ROWS[0]), "沒有照片也算過");
});

test("清單：每一站有日期、標題、狀態、照片數；能編的人有上下移與加一站，別人沒有", () => {
  const h = SITE.historyListHTML(ROWS, MKT, "", false);
  assert.match(h, /data-act="hi-open" data-id="m1"/);
  assert.match(h, /2023-06-01/); assert.match(h, /第一屆探索營，超過 80 人/);
  assert.match(h, /<span class="tag open">在路上<\/span>/, "published 是綠的");
  assert.match(h, /<span class="tag warn">準備好了<\/span>/);
  assert.match(h, /<span class="tag draft">草稿<\/span>/);
  assert.match(h, /1 張照片/); assert.match(h, /2 張照片/);
  assert.match(h, /1 張沒勾同意/, "沒勾同意的張數要在清單上就看得到");
  assert.match(h, /data-act="hi-move" data-id="m1" data-dir="up"/); assert.match(h, /data-act="hi-move" data-id="m1" data-dir="down"/);
  assert.match(h, /data-act="hi-move" data-id="m0" data-dir="up" disabled/, "第一站的往上是停用的");
  assert.match(h, /data-act="hi-new"/);
  const ro = SITE.historyListHTML(ROWS, ASSOC, "", false);
  assert.doesNotMatch(ro, /hi-move/); assert.doesNotMatch(ro, /hi-new/);
  assert.match(ro, /data-act="hi-open" data-id="m1"/, "不能編的人還是點得進去看");
  assert.match(SITE.historyListHTML([], MKT, "", false), /還沒有任何一站/);
});

test("一站：欄位、代號自動算的提示、照片卡（同意勾選、刪除、說明）、上傳格；狀態按鈕照角色", () => {
  const draft = SITE.historyEditHTML(M1, MKT, "", false, null);
  for (const id of ["hi-tzh", "hi-ten", "hi-szh", "hi-sen", "hi-bzh", "hi-ben", "hi-date", "hi-slug"]) assert.match(draft, new RegExp(`id="${id}"`), id);
  assert.match(draft, /<input id="hi-date" name="happened_on" type="date" value="2023-06-01"/);
  assert.match(draft, /<input id="hi-slug" name="slug" value="2023-first-college-bootcamp"/);
  // 2026-11-06 自動儲存：既有的一站沒有「存起來」鈕，八格在 data-autosave 容器裡，旁邊是那個小字。
  assert.match(draft, /<div data-autosave="hi-save" data-id="m1">/); assert.doesNotMatch(draft, /data-act="hi-save"/);
  assert.match(draft, /<span class="autosave" data-for="hi-save">/);
  assert.match(draft, /data-act="hi-ready" data-id="m1"/); assert.doesNotMatch(draft, /hi-publish/);
  assert.match(draft, /<input type="file" id="hi-file" accept="image\/\*"/);
  assert.match(draft, /data-act="hi-ph-del" data-id="p1"/);
  // 照片說明兩格改了就存（容器是那張卡，data-id 是照片），同意勾選標 data-noauto（它本來就是勾了就送），「存照片說明」鈕沒有了。
  assert.match(draft, /<div class="hi-photo-f" data-autosave="hi-ph-save" data-id="p1">/); assert.doesNotMatch(draft, /hi-ph-save"[^>]*>存/);
  assert.match(draft, /data-act="hi-ph-consent" data-noauto="1" data-id="p1" checked/);
  assert.match(draft, /<span class="autosave" data-for="hi-ph-save">/);
  assert.match(draft, /id="hi-ph-czh-p1" name="caption_zh" value="第一屆"/); assert.match(draft, /id="hi-ph-cen-p1" name="caption_en" value="First camp"/);
  assert.match(draft, /<img[^>]*src="https:\/\/x\.supabase\.co\/storage\/v1\/object\/public\/history\/m1\/a\.jpg"[^>]*alt=""/, "照片不標名字，alt 留空");
  const ready = SITE.historyEditHTML({ ...M1, status: "ready" }, MKT, "", false, null);
  assert.match(ready, /data-act="hi-unready"/); assert.doesNotMatch(ready, /hi-publish/); assert.match(ready, /等 Co-President/);
  const readyPres = SITE.historyEditHTML({ ...M1, status: "ready" }, PRES, "", false, null);
  assert.match(readyPres, /data-act="hi-publish" data-id="m1"/);
  const live = SITE.historyEditHTML({ ...M1, status: "published" }, PRES, "", false, null);
  assert.match(live, /data-act="hi-unpublish" data-id="m1"/); assert.doesNotMatch(live, /hi-ready"/);
  const archived = SITE.historyEditHTML({ ...M1, status: "archived" }, MKT, "", false, null);
  assert.match(archived, /data-act="hi-ready"/, "撤下來的可以再按準備好了");
  // 沒勾同意的照片：編輯頁上有一句警告，而且「準備好了」停用。
  const noConsent = SITE.historyEditHTML(ROWS[2], MKT, "", false, null);
  assert.match(noConsent, /還有 1 張照片沒勾同意/);
  assert.match(noConsent, /data-act="hi-unready"[^>]*>/);
  const noConsentDraft = SITE.historyEditHTML({ ...ROWS[2], status: "draft" }, MKT, "", false, null);
  assert.match(noConsentDraft, /data-act="hi-ready" data-id="m2" disabled/);
  // 不能編的人：唯讀、沒有上傳、沒有刪除、沒有存。
  const ro = SITE.historyEditHTML(M1, ASSOC, "", false, null);
  assert.doesNotMatch(ro, /hi-file/); assert.doesNotMatch(ro, /hi-ph-del/); assert.doesNotMatch(ro, /hi-save/); assert.doesNotMatch(ro, /hi-ready/);
  assert.doesNotMatch(ro, /data-autosave/, "不能編的人沒有自動儲存的容器");
  assert.match(ro, /<input id="hi-tzh" name="title_zh" value="第一屆探索營，超過 80 人" readonly/);
  // 新的一站：沒有照片區（要先存才有 id 可以掛照片），留一顆「存起來」鈕（沒有 data-id），不自動存；「先存一次」那句只在這裡。
  const fresh = SITE.historyEditHTML(null, MKT, "", false, null);
  assert.match(fresh, /data-act="hi-save" data-id=""/); assert.doesNotMatch(fresh, /hi-file/); assert.match(fresh, /先存一次/);
  assert.doesNotMatch(fresh, /data-autosave/); assert.doesNotMatch(draft, /先存一次/);
  // 上傳中：進度條。
  const up = SITE.historyEditHTML(M1, MKT, "", true, { pct: 40, name: "IMG_1.jpg" });
  assert.match(up, /<progress[^>]*value="40"[^>]*max="100"/); assert.match(up, /IMG_1\.jpg/);
});

test("字典：hi. 開頭的每一句都有中英；中文沒有破折號", () => {
  const keys = Object.keys(MINE).filter(k => k.startsWith("hi.") || /^(msg|err|confirm)\.hi/.test(k));
  assert.ok(keys.length >= 40, `只有 ${keys.length} 句`);
  for (const k of keys) {
    assert.ok(MINE[k].zh && MINE[k].en, `${k} 少一種語言`);
    assert.doesNotMatch(MINE[k].zh, /[—–]/, `${k} 中文有破折號`);
  }
  SITE.setLang("en");
  assert.match(SITE.historyListHTML(ROWS, MKT, "", false), /On the road/);
  SITE.setLang("zh");
});
