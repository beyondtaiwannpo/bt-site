// 後台 Marketing 區批 1（2026-11-26）：Instagram 連線狀態那一頁。
// 資料庫那一半（門、通行證只在 Vault、換新的時機）在 scripts/db/smoke.sh 的「接上 Instagram」一段。
// 這裡驗畫面：四種狀態畫得對、錯誤講人話、英文畫出來不剩中文、誰進得來。跑法：node --test test/*.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as UI from "../admin/marketing/src/ui.js";

UI.setLang("zh");
const NOW = Date.parse("2026-11-26T12:00:00Z");
const READY = { ready: true, username: "beyondtaiwan", account_type: "BUSINESS", followers: 3999, media: 321,
  checked_at: "2026-11-26T03:17:00Z", check_error: null, expires_at: "2027-01-20T00:00:00Z", estimated: false,
  refresh_error: null, cron: true, can_manage: true };

test("★ 誰進得來：senior、Marketing 資源工作區或需求工作區（任何等級）；只有 team 標籤不算", () => {
  assert.equal(UI.canViewMkt({ role: "cadre", board: "president" }), true);
  assert.equal(UI.canViewMkt({ role: "cadre", board: "senior_adviser" }), true);
  assert.equal(UI.canViewMkt({ role: "cadre", board: "member", ws: { "res:Marketing Team": "view" } }), true);
  assert.equal(UI.canViewMkt({ role: "cadre", board: "member", ws: { "custom:marketing-requests": "edit" } }), true);
  assert.equal(UI.canViewMkt({ role: "cadre", board: "director", team: "Marketing Team", ws: {} }), false);
  assert.equal(UI.canViewMkt({ role: "cadre", board: "member", ws: { "res:Curriculum Team": "manage" } }), false);
  assert.equal(UI.canViewMkt({ role: "student", board: "president", ws: { "res:Marketing Team": "manage" } }), false);
});

test("還沒接上：說要做什麼、連到設定文件；不是管的人另外說請 Co-President 處理；沒有再檢查的鈕", () => {
  const h = UI.igPageHTML({ ready: false, can_manage: false }, "", false, NOW);
  assert.match(h, /還沒接上 Instagram/);
  assert.match(h, /INSTAGRAM_TOKEN/);
  assert.match(h, /docs\/2026-10-29-instagram-setup\.md/);
  assert.match(h, /請 Co-President 處理/);
  assert.doesNotMatch(h, /data-act="ig-check"/);
  const m = UI.igPageHTML({ ready: false, can_manage: true }, "", false, NOW);
  assert.doesNotMatch(m, /請 Co-President 處理/, "管的人自己就能處理");
  assert.doesNotMatch(m, /data-act="ig-check"/, "還沒設定就按不了再檢查");
});

test("★ 接上了：帳號、類型、粉絲、貼文、最後檢查、通行證用到哪天；管的人有再檢查", () => {
  const h = UI.igPageHTML(READY, "", false, NOW);
  assert.match(h, /href="https:\/\/www\.instagram\.com\/beyondtaiwan\/"[^>]*>@beyondtaiwan/);
  assert.match(h, /商業帳號/);
  assert.match(h, /<dd>3,999<\/dd>/);
  assert.match(h, /<dd>321<\/dd>/);
  assert.match(h, /用到 2027-01-(19|20)/);
  assert.match(h, /data-act="ig-check"/);
  assert.doesNotMatch(h, /class="msg err"/, "一切正常就沒有橘色");
  assert.doesNotMatch(h, /pg_cron/, "cron 開著就不提");
  const viewer = UI.igPageHTML({ ...READY, can_manage: false }, "", false, NOW);
  assert.doesNotMatch(viewer, /data-act="ig-check"/);
  assert.match(viewer, /只有 Marketing 資源工作區「管」的人/);
  const busy = UI.igPageHTML(READY, "", true, NOW);
  assert.match(busy, /data-act="ig-check" disabled>檢查中…/);
});

test("人手放的通行證寫「大約」；快過期與已過期是橘的，連到設定文件", () => {
  assert.match(UI.igPageHTML({ ...READY, estimated: true }, "", false, NOW), /大約用到/);
  assert.equal(UI.tokenState({ expires_at: "2026-12-01T00:00:00Z" }, NOW), "soon");
  assert.equal(UI.tokenState({ expires_at: "2026-11-20T00:00:00Z" }, NOW), "gone");
  assert.equal(UI.tokenState({ expires_at: null }, NOW), "ok");
  assert.match(UI.igPageHTML({ ...READY, expires_at: "2026-12-01T00:00:00Z" }, "", false, NOW), /class="msg err">通行證快過期了/);
  assert.match(UI.igPageHTML({ ...READY, expires_at: "2026-11-20T00:00:00Z" }, "", false, NOW), /class="msg err">通行證已經過期/);
});

test("★ 錯誤講人話：190 是通行證不能用、網路是明天再試、沒看過的原樣印出來", () => {
  assert.equal(UI.igErrorKind("HTTP 400 code 190: Error validating access token"), "190");
  assert.equal(UI.igErrorKind("network: Operation timed out"), "net");
  assert.equal(UI.igErrorKind("HTTP 500 code 2: Service temporarily unavailable"), "other");
  assert.equal(UI.igErrorKind(""), "");
  const h190 = UI.igPageHTML({ ...READY, check_error: "HTTP 400 code 190: Error validating access token" }, "", false, NOW);
  assert.match(h190, /通行證不能用了/);
  assert.doesNotMatch(h190, /<pre/, "看得懂的錯誤不印原文");
  assert.match(h190, /<dd>不能用了，見下面<\/dd>/, "190 的時候通行證那一行不再寫用到哪天");
  assert.doesNotMatch(h190, /用到 2027/);
  const other = UI.igPageHTML({ ...READY, check_error: "HTTP 500 code 2: <b>x</b>" }, "", false, NOW);
  assert.match(other, /<pre class="mini">HTTP 500 code 2: &lt;b&gt;x&lt;\/b&gt;<\/pre>/, "原文要跳脫");
  assert.match(UI.igPageHTML({ ...READY, refresh_error: "HTTP 400 code 10: nope" }, "", false, NOW), /自動換通行證沒成功/);
  assert.match(UI.igPageHTML({ ...READY, cron: false }, "", false, NOW), /pg_cron/);
});

test("★ 英文畫出來不剩中文", () => {
  UI.setLang("en");
  try {
    const CJK = /[一-鿿]/;
    for (const st of [{ ready: false, can_manage: false }, { ready: false, can_manage: true }, READY,
      { ...READY, estimated: true, can_manage: false, cron: false, check_error: "HTTP 400 code 190: x", refresh_error: "x", expires_at: "2026-11-20T00:00:00Z" },
      { ...READY, account_type: "MEDIA_CREATOR", check_error: "network: x" }]) {
      const h = UI.igPageHTML(st, "", false, NOW);
      const m = h.match(CJK);
      assert.equal(m, null, m ? h.slice(Math.max(0, m.index - 40), m.index + 40) : "");
    }
  } finally { UI.setLang("zh"); }
});

test("★ 這一頁的程式碼不碰通行證：沒有任何地方讀 INSTAGRAM_TOKEN 的值或直接讀 ig_connection", () => {
  for (const f of ["admin/marketing/src/main.js", "admin/marketing/src/data.js", "admin/marketing/src/ui.js"]) {
    const s = readFileSync(f, "utf8");
    assert.doesNotMatch(s, /from\("ig_connection"\)/, f);
    assert.doesNotMatch(s, /access_token/, f);
    assert.doesNotMatch(s, /graph\.instagram\.com/, f + "：叫 Instagram 只在資料庫裡");
  }
});
