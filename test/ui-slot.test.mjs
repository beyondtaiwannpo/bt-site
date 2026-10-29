// 格子在「未蓋章／已蓋章」兩種狀態下該有什麼（2026-10-28 改版：不再翻面，封面、場次、虛線圈）。
// 跑法：node --test test/*.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { slotHTML, monthPageHTML, sessionsOf, sessionsHTML, sessionCalUrl, coverHTML, setLang } from "../passport/src/ui.js";
// 護照有中英切換，字典預設英文；這一支斷言的是中文，所以先切成中文。
setLang("zh");

const act = {
  id: "09A", month: 9, seq: 1, category: "gather",
  title_zh: "開學電影夜", title_en: "OPENING NIGHT",
  description: "新學年第一次全員上線，選片權給今年的新幹部"
};
const state = (stamps = {}, entries = {}) => ({ stamps, entries, justStamped: null, activities: [act] });
const ONE = { "09A": { date: "2026-09-05" } };

test("未蓋章：說明、「蓋章 →」、蓋在這裡的虛線圈都在，沒有章", () => {
  const html = slotHTML(state(), act);
  assert.ok(html.includes(act.description));
  assert.ok(html.includes("蓋章 →"));
  assert.ok(html.includes('class="spot"'));
  assert.ok(html.includes('class="en"'));
  assert.ok(!html.includes("stampwrap"));
  assert.match(html, /data-done="0"/);
});

test("★ 不再有翻面：沒有 flip 按鈕、沒有背面", () => {
  for (const S of [state(), state(ONE, { "09A": { note: "x" } })]) {
    const html = slotHTML(S, act);
    assert.ok(!html.includes('data-act="flip"'));
    assert.ok(!html.includes("face back"));
  }
});

test("蓋過章、沒放照片：章當主角蓋在中間，心得印在卡片上，沒有「蓋章 →」", () => {
  const html = slotHTML(state(ONE, { "09A": { note: "那天我遲到了十分鐘" } }), act);
  assert.match(html, /class="slot done nophoto c-gather"/);
  assert.match(html, /<div class="hero"><div class="stampwrap">/);
  assert.ok(html.includes('<span class="note">那天我遲到了十分鐘</span>'));
  assert.ok(!html.includes("蓋章 →"));
  assert.ok(html.includes("2026.09.05"), "底下印入境日期");
});

test("蓋過章、有照片：自己的照片當封面（標「我的」），章在底下", () => {
  const html = slotHTML(state(ONE, { "09A": { note: "", photo: "data:image/jpeg;base64,AAAA" } }), act);
  assert.match(html, /class="slot done c-gather"/);
  assert.match(html, /<span class="cover"><img src="data:image\/jpeg;base64,AAAA"/);
  assert.match(html, /class="lbl mine">我的</);
  assert.match(html, /<div class="foot"><div class="stampwrap">/);
  assert.ok(!html.includes('class="note"'), "沒寫心得就不印空的框");
});

test("章不是按鈕的子孫：按鈕不能巢狀，章也不能放進 <button>", () => {
  const html = slotHTML(state(ONE), act);
  const open = html.indexOf('<button class="faceopen"'), close = html.indexOf("</button>", open);
  assert.ok(html.indexOf("stampwrap") > close);
});

test("一格只有一個 .slot", () => {
  assert.equal((slotHTML(state(ONE), act).match(/class="slot[ "]/g) || []).length, 1);
});

test("範例照片當封面：一張滿版、兩張對開、標「範例」；蓋過章就換成自己的照片或不放", () => {
  const one = slotHTML(state(), { ...act, example_url: "https://x/a.jpg" });
  assert.match(one, /<span class="cover"><img src="https:\/\/x\/a\.jpg"/);
  assert.match(one, /class="lbl">範例</);
  const two = slotHTML(state(), { ...act, example_url: "https://x/a.jpg", example_url_2: "https://x/b.jpg" });
  assert.match(two, /class="cover two"/);
  assert.equal((two.match(/<img /g) || []).length, 2);
  assert.ok(!slotHTML(state(ONE), { ...act, example_url: "https://x/a.jpg" }).includes("x/a.jpg"));
  assert.equal(coverHTML([]), "");
});

test("場次：sessions 優先，沒有就用 happens_at，排好序、丟掉壞的", () => {
  assert.deepEqual(sessionsOf({ sessions: ["2026-11-28T15:30:00Z", "2026-11-15T14:00:00Z", "壞的"] }), ["2026-11-15T14:00:00Z", "2026-11-28T15:30:00Z"]);
  assert.deepEqual(sessionsOf({ sessions: [], happens_at: "2026-11-15T14:00:00Z" }), ["2026-11-15T14:00:00Z"]);
  assert.deepEqual(sessionsOf({}), []);
});

test("★ 場次：過去的劃掉，好幾場時最近要到的標「下一場」，只有一場就不標", () => {
  const a = { ...act, sessions: ["2026-11-15T14:00:00Z", "2026-11-28T15:30:00Z"] };
  const h = sessionsHTML(a, { now: Date.parse("2026-11-20T00:00:00Z"), tz: "Asia/Taipei" });
  assert.equal((h.match(/class="s past"/g) || []).length, 1);
  assert.equal((h.match(/下一場/g) || []).length, 1);
  assert.ok(h.includes("第 1 場") && h.includes("第 2 場"));
  assert.ok(h.includes("<b>15</b>") && h.includes("22:00"), "照看的人的時區：台北 22:00");
  const solo = sessionsHTML({ ...act, sessions: ["2026-11-28T15:30:00Z"] }, { now: 0 });
  assert.ok(!solo.includes("下一場") && !solo.includes("第 1 場"));
  assert.equal(sessionsHTML(act), "");
});

test("★ 打開一格的場次：還沒到的每一場有「加進日曆」，過去的沒有", () => {
  const a = { ...act, sessions: ["2026-11-15T14:00:00Z", "2026-11-28T15:30:00Z"] };
  const h = sessionsHTML(a, { now: Date.parse("2026-11-20T00:00:00Z"), cal: true });
  assert.equal((h.match(/class="cal"/g) || []).length, 1);
  assert.ok(!sessionsHTML(a, { now: 0 }).includes('class="cal"'), "卡片上不放日曆連結");
  const u = sessionCalUrl(a, "2026-11-28T15:30:00Z");
  assert.match(u, /^https:\/\/calendar\.google\.com\/calendar\/render\?action=TEMPLATE/);
  assert.ok(u.includes("dates=20261128T153000Z/20261128T163000Z"), "一小時");
  assert.ok(u.includes(encodeURIComponent("開學電影夜")));
});

test("★ 一頁幾格就標幾格（data-n），CSS 照它排，右邊不空一塊", () => {
  const S = { stamps: {}, entries: {}, activities: [act, { ...act, id: "09B", category: "prompt" }], months: [{ month: 9 }], visas: {}, destinations: [], profile: { id: "u" } };
  assert.match(monthPageHTML(S, { month: 9 }), /class="slots" data-n="2"/);
});
