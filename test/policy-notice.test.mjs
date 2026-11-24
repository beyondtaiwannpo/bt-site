// 隱私政策更新的公告（2026-11-24）。政策寫了改動會「更新本頁日期並於網站公告」，這裡守兩個地方對得起來：
// privacy/index.html 最上面的「最近的更新」，以及 /app/ 登入頁與學員頁上那一行會自己消失的提醒。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { POLICY_NOTICE, policyNoticeHTML, setLang } from "../app/src/ui.js";

const page = readFileSync(new URL("../privacy/index.html", import.meta.url), "utf8");
const ui = readFileSync(new URL("../app/src/ui.js", import.meta.url), "utf8");

test("提醒在期限內看得到，連到隱私政策的「最近的更新」", () => {
  setLang("zh");
  const zh = policyNoticeHTML(POLICY_NOTICE.date);
  assert.match(zh, /href="\.\.\/privacy\/#changes"/);
  assert.ok(zh.includes(POLICY_NOTICE.date), "中文那一句要寫出政策更新的日期");
  setLang("en");
  assert.match(policyNoticeHTML(POLICY_NOTICE.until), /See what changed/);
  setLang("zh");
});

test("過了 until 那一天提醒自己消失", () => {
  assert.equal(policyNoticeHTML("2027-02-01"), "");
  assert.equal(policyNoticeHTML("2099-01-01"), "");
  assert.ok(POLICY_NOTICE.until > POLICY_NOTICE.date, "until 要在 date 之後");
});

test("登入頁與學員頁都放了這一行", () => {
  assert.equal(ui.split("${policyNoticeHTML()}").length - 1, 2);
});

test("隱私政策頁首的日期、最近的更新第一條、提醒的日期是同一天", () => {
  const meta = page.match(/Last updated: (\d{4}-\d{2}-\d{2})/)[1];
  assert.equal(meta, POLICY_NOTICE.date);
  const block = page.split('id="changes"')[1].split("</div>")[0];
  const first = block.match(/<li><strong>(\d{4}-\d{2}-\d{2})<\/strong>/)[1];
  assert.equal(first, meta, "每次改政策要在最近的更新最上面加一條");
});

test("最近的更新裡每一條連結都跳得到那一節", () => {
  const block = page.split('id="changes"')[1].split("</div>")[0];
  const ids = [...block.matchAll(/href="#([a-z-]+)"/g)].map(m => m[1]);
  assert.ok(ids.length >= 4);
  for (const id of ids) assert.ok(page.includes(`<h3 id="${id}">`), `找不到 #${id}`);
});
