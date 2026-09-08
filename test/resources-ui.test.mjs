// /resources/ 與後台的資源那一頁（批 5，2026-09-08）。
import { test } from "node:test";
import assert from "node:assert/strict";
import * as R from "../resources/src/ui.js";
import * as M from "../admin/src/ui.js";

const items = [
  { id: "1", kind: "book", title: "College Resource Book", blurb: "從高一到送出申請的完整時程。",
    url: "https://drive.google.com/x" },
  { id: "2", kind: "pdf", title: "申請文書怎麼開頭", blurb: "六個真的被錄取的開頭段落。" },
];

// ⚠ 這一條守的是 2026-09-07「全部要登入」那個決定的**補償設計**：
// 標題與介紹公開，只有連結要登入。全部鎖起來的話 Google 就搜不到，
// 而那是外人找到 BT 最有效的一條路。
test("★ 沒登入：標題與介紹看得到，連結沒有", () => {
  const h = R.listHTML(items, false, false);
  assert.match(h, /College Resource Book/);
  assert.match(h, /從高一到送出申請的完整時程/);
  assert.ok(!h.includes("drive.google.com"), "沒登入不該出現連結");
  assert.match(h, /登入就拿得到/);
  assert.match(h, /data-act="signin"/);
});

test("登入了：連結變成真的可以點的按鈕，而且開新分頁", () => {
  const h = R.listHTML(items, true, false);
  assert.match(h, /href="https:\/\/drive\.google\.com\/x"/);
  assert.match(h, /rel="noopener noreferrer"/, "開新分頁一定要有 noopener");
  assert.doesNotMatch(h, /這些東西是免費的/, "已經登入就不要再勸他登入");
});

test("登入了但那一筆沒有連結，還是不畫一顆點不下去的按鈕", () => {
  const h = R.listHTML([items[1]], true, false);
  assert.match(h, /登入就拿得到/);
  assert.doesNotMatch(h, /<a class="btn"/);
});

test("類型用文字不用圖示", () => {
  assert.match(R.listHTML(items, false, false), /手冊/);
  assert.match(R.listHTML(items, false, true), /Book/);
});

test("什麼都沒有的時候說一句話", () => {
  assert.match(R.listHTML([], false, false), /還沒有放上來的東西/);
  assert.match(R.listHTML([], true, true), /Nothing here yet/);
});

test("跳脫：標題與連結都要跳脫", () => {
  const h = R.listHTML([{ id: "x", kind: "pdf", title: '<img src=x>',
    blurb: "", url: 'https://a"onmouseover="alert(1)' }], true, false);
  assert.ok(!h.includes("<img src=x"));
  assert.ok(!h.includes('"onmouseover='));
});

// ── 後台 ──────────────────────────────────────────────────────────────
test("後台的資源清單：草稿與已發布分得出來，連結看得到", () => {
  const h = M.resListHTML([{ ...items[0], status: "published" },
                           { ...items[1], url: "https://x", status: "draft" }], true, "");
  assert.match(h, /已發布/);
  assert.match(h, /還在寫/);
  assert.match(h, /drive\.google\.com/);
});

test("一般幹部改不動資源", () => {
  const h = M.resListHTML([{ ...items[0], status: "published" }], false, "");
  assert.doesNotMatch(h, /data-act="res-new"/);
  assert.doesNotMatch(h, /data-act="res-edit"/);
});

// ⚠ Drive 的分享權限設錯，網站看不出來，而學生看到的是一頁「你需要存取權」。
test("★ 編輯頁一定要有那句「用無痕視窗自己點一次」", () => {
  const h = M.resEditHTML(null, "", false);
  assert.match(h, /無痕視窗/);
  assert.match(h, /你需要存取權/);
});

test("編輯頁講清楚介紹是公開的（那是搜尋引擎唯一看得到的東西）", () => {
  assert.match(M.resEditHTML(null, "", false), /Google 也看得到/);
});

test("兩個大分頁：申請表與資源，當前的那一個有標記", () => {
  assert.match(M.tabsHTML("res"), /data-t="res"[^>]*class|class="chip wide on" data-act="tab" data-t="res"/);
  const h = M.tabsHTML("forms");
  assert.ok(h.includes('data-t="forms"') && h.includes('data-t="res"'));
});
