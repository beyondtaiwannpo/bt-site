// 研究按鈕（2026-11-28）。資料庫那一半（送 Claude、收答案、只填空著的、頁面檢查）在 scripts/db/smoke.sh 的「研究按鈕」一段，
// 那裡用假的 Claude 與假的網頁跑。這裡驗畫面：幾種狀態、錯誤講人話、照片只認 Wikimedia、範本跟資料庫一樣。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as SL from "../admin/marketing/src/slides.js";
import * as UI from "../admin/marketing/src/ui.js";

UI.setLang("zh");
const SQL = readFileSync("supabase/migrations/2026-11-28-college-research.sql", "utf8");
const VANDY = JSON.parse(readFileSync(new URL("./fixtures/vanderbilt-post.json", import.meta.url), "utf8"));
const P = { id: "p1", school: "Duke University", status: "draft", data: SL.blankPost("Duke University"), sources: {}, checks: {}, caption: "", created_by: "u" };
const BOOT = { can_edit: true, can_approve: true, me: "u", problems: { p1: [] }, hashes: {}, names: {} };

test("★ 新貼文的範本跟資料庫的 mkt_template() 一模一樣（研究靠它認「還沒動過的格子」）", () => {
  const m = SQL.match(/select \$j\$([\s\S]*?)\$j\$::jsonb/);
  const t = SL.blankPost("x"); delete t.school; delete t.photos;
  assert.deepEqual(JSON.parse(m[1]), t);
});

test("★ 研究的白名單欄位，編輯畫面都有那一格（不然研究填進去的東西下次存檔就不見）", () => {
  const body = SQL.slice(SQL.indexOf("function public.mkt_research_fields()"), SQL.indexOf("revoke all on function public.mkt_research_fields()"));
  const paths = [...body.matchAll(/array\[([^\]]+)\]/g)].map(m => m[1].split(",").map(x => x.trim().replace(/'/g, "")).join("."));
  const html = UI.postEditorHTML(P, BOOT, "", false, {}, {}, null);
  for (const p of paths) assert.match(html, new RegExp(`name="d\\.${p.replace(/\./g, "\\.")}"`), p);
});

test("還沒設定：說要做什麼、連到設定步驟、沒有按鈕", () => {
  const h = UI.researchHTML(P, BOOT, { ready: false, jobs: [], checks: [] }, false);
  assert.match(h, /Vault/);
  assert.match(h, /docs\/2026-10-31-research-setup\.md/);
  assert.doesNotMatch(h, /data-act="cp-research"/);
});

test("★ 設定好、草稿、改得動：有按鈕；不是草稿或改不動就沒有", () => {
  const rs = { ready: true, jobs: [], checks: [], today: 5, daily_limit: 50 };
  assert.match(UI.researchHTML(P, BOOT, rs, false), /data-act="cp-research"[^>]*>幫我研究這所學校/);
  assert.match(UI.researchHTML(P, BOOT, rs, false), /今天已經用了 5／50 個工作/);
  assert.doesNotMatch(UI.researchHTML({ ...P, status: "in_review" }, BOOT, rs, false), /data-act="cp-research"/);
  assert.doesNotMatch(UI.researchHTML(P, { ...BOOT, can_edit: false }, rs, false), /data-act="cp-research"/);
});

test("★ 跑的時候：五組的進度、沒有按鈕、表單鎖住", () => {
  const rs = { ready: true, checks: [], jobs: [{ grp: "basic", status: "done" }, { grp: "admissions", status: "sent" }, { grp: "policy", status: "queued" },
    { grp: "majors", status: "sent" }, { grp: "fun", status: "sent" }] };
  const h = UI.researchHTML(P, BOOT, rs, false);
  assert.match(h, /學校資訊<\/b> <span class="cp-ok">好了/);
  assert.match(h, /申請數字<\/b> <span class="tag">查詢中/);
  assert.doesNotMatch(h, /data-act="cp-research"/);
  assert.equal(UI.canEditPost(P, BOOT, rs), false);
  assert.match(UI.postEditorHTML(P, BOOT, "", false, {}, {}, rs), /name="d\.apply\.sat" value="" placeholder="[^"]*" disabled/);
});

test("★ 跑完：錯誤講人話、筆記、錢、建議照片只認 Wikimedia、按鈕變成「再研究一次」", () => {
  const rs = { ready: true, checks: [], cost_usd: 3.42, today: 10, daily_limit: 50, jobs: [
    { grp: "basic", status: "done", notes: ["U.S. News 2027 edition"], facts: { rank: { note: "tie with Brown" } } },
    { grp: "admissions", status: "failed", error: "stopped: refusal / general_harms" },
    { grp: "policy", status: "failed", error: "no reply after 15 minutes" },
    { grp: "majors", status: "failed", error: "HTTP 401: invalid x-api-key" },
    { grp: "fun", status: "done", photos: { campus: { url: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/aa/X.jpg/1280px-X.jpg", credit: "A", license: "CC BY 4.0" },
                                          city1: { url: "https://evil.example.com/x.jpg", credit: "B", license: "?" } } }] };
  const h = UI.researchHTML(P, BOOT, rs, false);
  assert.match(h, /Claude 這一題不回答/);
  assert.match(h, /等太久沒回來/);
  assert.match(h, /API key 不能用了/);
  assert.match(h, /US\$3\.42/);
  assert.match(h, /U\.S\. News 2027 edition/);
  assert.match(h, /<b>排名<\/b>：tie with Brown/);
  assert.match(h, /data-act="cp-use-photo" data-slot="campus"/);
  assert.doesNotMatch(h, /evil\.example\.com/, "不是 Wikimedia 的照片不給用");
  assert.match(h, /再研究一次/);
});

test("★ 每個來源旁邊印頁面檢查的結果", () => {
  const p = { ...P, data: VANDY.data, sources: VANDY.sources };
  const s0 = VANDY.sources.sat[0];
  const rs = { ready: true, jobs: [], checks: [{ key: "sat", url: s0.url, quote: s0.quote, status: "not_found" }] };
  assert.equal(UI.sourceCheck(rs, "sat", s0), "not_found");
  assert.match(UI.postEditorHTML(p, BOOT, "", false, {}, {}, rs), /cp-chk-not_found">頁面上找不到，一定要點開看/);
});

test("★ 英文畫出來不剩中文", () => {
  UI.setLang("en");
  try {
    const rs = { ready: true, checks: [], cost_usd: 1, jobs: [{ grp: "basic", status: "done", notes: ["n"] }, { grp: "admissions", status: "failed", error: "HTTP 500" },
      { grp: "policy", status: "sent" }, { grp: "majors", status: "queued" }, { grp: "fun", status: "done", photos: { campus: { url: "https://upload.wikimedia.org/x.jpg", credit: "A", license: "B" } } }] };
    for (const h of [UI.researchHTML(P, BOOT, rs, false), UI.researchHTML(P, BOOT, { ready: false, jobs: [] }, false), UI.researchHTML(P, BOOT, { ready: true, jobs: [] }, false)]) {
      const m = h.match(/[　-鿿＀-￯]/);
      assert.equal(m, null, m ? h.slice(Math.max(0, m.index - 50), m.index + 20) : "");
    }
  } finally { UI.setLang("zh"); }
});
