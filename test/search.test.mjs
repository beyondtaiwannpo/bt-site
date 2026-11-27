// 後台的搜尋（2026-11-26，admin/search）：網址怎麼存搜尋、每一筆連到哪、字怎麼標、整理怎麼畫。
// 讀不讀得到是資料庫的門（scripts/db/smoke.sh「後台的搜尋」那一段）；這裡守的是畫面。
// 跑法：node --test test/*.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as UI from "../admin/search/src/ui.js";
import * as RAIL from "../shared/rail.js";

UI.setLang("zh");
const ID = "29de7ece-afc6-470e-ada2-3597dac50e62";

test("★ 網址存得下搜尋的字與篩選，認不得的值當成沒填", () => {
  const f = { sources: ["meeting", "feedback"], kind: "post-event", event: ID, from: "2026-01-01", to: "2026-06-30" };
  const h = UI.queryHash("bootcamp 場地", f);
  assert.deepEqual(UI.parseQuery("#" + h), { q: "bootcamp 場地", f });
  const bad = UI.parseQuery("#q=x&src=meeting,pair,evil,meeting&kind=pair-mentee&event=1;drop&from=2026-13&to=yesterday");
  assert.deepEqual(bad.f, { sources: ["meeting"], kind: "", event: "", from: "", to: "" }, "配對回饋不是一種可以篩的來源");
  assert.equal(UI.queryHash("", { sources: [] }), "");
  assert.equal(UI.parseQuery("#q=" + "x".repeat(300)).q.length, 200);
});

test("送給資料庫的篩選：空的不送", () => {
  assert.deepEqual(UI.filtersOf({ sources: [], kind: "", event: "", from: "", to: "" }), {});
  assert.deepEqual(UI.filtersOf({ sources: ["review"], kind: "", event: ID, from: "", to: "2026-02-01" }), { sources: ["review"], event: ID, to: "2026-02-01" });
  assert.equal(UI.hasFilters({ sources: [] }), false);
  assert.equal(UI.hasFilters({ from: "2026-01-01" }), true);
});

test("★ 每一筆連回原本那一頁（會議、回饋表的結果、內部表單的結果、活動的記分卡）", () => {
  assert.equal(UI.hitHref({ source: "meeting", ref: ID }), `../?lang=zh#meetings/${ID}`);
  assert.equal(UI.hitHref({ source: "feedback", ref: ID }), `../records/?lang=zh#forms/${ID}/results`);
  assert.equal(UI.hitHref({ source: "internal", ref: ID }), `../team-forms/?lang=zh#build/${ID}/results`);
  assert.equal(UI.hitHref({ source: "review", ref: ID }), `../records/?lang=zh#overview/${ID}`);
  assert.equal(UI.hitHref({ source: "evil", ref: ID }), "");
  // 那幾頁真的認得這幾個分頁（改了那邊的網址，這裡要跟著改）。
  assert.ok(RAIL.ITEMS.some(i => i.group === "forms" && i.key === "meetings"));
  assert.ok(RAIL.ITEMS.some(i => i.group === "records" && i.key === "forms"));
  assert.ok(RAIL.ITEMS.some(i => i.group === "records" && i.key === "overview"));
  assert.match(readFileSync("admin/team-forms/src/main.js", "utf8"), /parts\[0\] === "build"/);
});

test("★ 找到的字包 <mark>，其他字一律跳脫（使用者寫的字不會變成 HTML）", () => {
  assert.equal(UI.markHTML("Bootcamp <img src=x onerror=alert(1)> camp", ["camp"]), "Boot<mark>camp</mark> &lt;img src=x onerror=alert(1)&gt; <mark>camp</mark>");
  assert.equal(UI.markHTML("a.b (c)", [".", "(c)"]), "a<mark>.</mark>b <mark>(c)</mark>", "詞裡的符號照字面找");
  assert.equal(UI.markHTML("營隊改到七月", ["七月", "七"]), "營隊改到<mark>七月</mark>", "長的詞先標");
  assert.equal(UI.markHTML("<b>", []), "&lt;b&gt;");
  assert.equal(UI.markHTML(null, ["x"]), "");
});

test("清單用哪一份：懂意思的那一次有結果了就用它的，還在找就先用認字的", () => {
  const res = { terms: ["camp"], results: [{ source: "meeting", ref: "a" }] };
  const more = [{ source: "meeting", ref: "a" }, { source: "internal", ref: "b", near: true }];
  assert.equal(UI.hitsOf({ res, ask: { status: "retrieving" } }), res.results);
  assert.equal(UI.hitsOf({ res, ask: { status: "summarizing", hits: more } }), more);
  assert.equal(UI.hitsOf({ res, ask: { status: "failed", hits: more } }), more);
  assert.equal(UI.hitsOf({ res, ask: { status: "done", hits: [] } }), res.results);
  assert.deepEqual(UI.termsOf({ res, ask: { status: "done", terms: ["camp", "營隊"] } }), ["camp", "營隊"]);
  assert.equal(UI.citeTarget([{ cite: [1, 2] }, { cite: [3] }], 3), 1);
  assert.equal(UI.citeTarget([{}], 1), -1);
});

const HIT = { source: "feedback", ref: ID, title: "Winter Bootcamp 2027 feedback", event_zh: "冬令營", date: "2027-01-12", n: 3,
  snippets: [{ q: "What should we change next time?", t: "Shorter afternoon." }] };

test("★ 一筆：哪一種、名稱、日期、活動、幾則回答、哪一題與那一段字；沒有誰寫的", () => {
  const h = UI.hitHTML(HIT, 0, ["afternoon"]);
  assert.match(h, /<span class="tag sx-feedback">回饋表<\/span>/);
  assert.match(h, /href="\.\.\/records\/\?lang=zh#forms\/[^"]+\/results"/);
  assert.match(h, /2027-01-12 · 冬令營 · 3 則回答提到/);
  assert.match(h, /<span class="sx-qn">What should we change next time\?<\/span>Shorter <mark>afternoon<\/mark>\./);
  assert.doesNotMatch(h, /under18|person|typed_name/);
  assert.match(UI.hitHTML({ ...HIT, near: true }, 0, []), /意思接近/);
  assert.match(UI.hitHTML({ ...HIT, snippets: [] }, 0, []), /標題對上了/);
  assert.match(UI.hitHTML({ ...HIT, title: "<script>" }, 0, []), /&lt;script&gt;/);
});

test("清單的三種空的樣子：還沒打字、找不到、有結果", () => {
  assert.match(UI.resultsHTML({ q: "" }), /從上面那一格開始/);
  assert.match(UI.resultsHTML({ q: "x", res: { terms: ["x"], results: [] } }), /找不到/);
  const r = UI.resultsHTML({ q: "x", res: { terms: ["x"], results: [HIT, { ...HIT, ref: "b" }] } });
  assert.match(r, /找到 2 筆/);
  assert.equal((r.match(/class="sx-hit"/g) || []).length, 2);
});

test("★ 最上面的整理：沒開的時候只有 Co-President 看到一句怎麼開；開了照狀態畫", () => {
  assert.equal(UI.summaryHTML({ q: "x", opts: { claude: false, can_settings: false } }), "", "一般幹部看不到「還沒開」那一句");
  assert.match(UI.summaryHTML({ q: "x", opts: { claude: false, can_settings: true } }), /ANTHROPIC_API_KEY/);
  const opts = { claude: true, limit: 60, used_today: 2, ai_sources: ["meeting", "internal"] };
  assert.match(UI.summaryHTML({ q: "x", opts, ask: { status: "summarizing" } }), /正在整理/);
  assert.match(UI.summaryHTML({ q: "x", opts, ask: { status: "failed" } }), /這一次整理不出來/);
  assert.match(UI.summaryHTML({ q: "x", opts, ask: { status: "done", summary: { empty: true } } }), /會議紀錄、內部表單/);
  const done = UI.summaryHTML({ q: "x", opts, ask: { status: "done", hits: [{ cite: [1] }, { cite: [2] }], summary: { points: [{ text: "營隊改到七月。<b>", cites: [2, 9] }], note: "" } } });
  assert.match(done, /<li>營隊改到七月。&lt;b&gt; <span class="sx-cites"><button type="button" class="sx-cite" data-act="cite" data-i="1"/);
  assert.doesNotMatch(done, /data-i="-1"/, "對不到的引用不畫");
  assert.match(done, /你今天整理了 2 次，上限 60 次。/);
  assert.match(done, /可能讀錯/);
  assert.match(UI.summaryHTML({ q: "x", opts, ask: { status: "done", hits: [], summary: { points: [], note: "" } } }), /沒有真的在講這件事/);
});

test("★ 哪幾種給 AI 讀：只有 Co-President 有那一格；勾了回饋表就提醒先補隱私政策", () => {
  const admin = { asks_30d: 4, usd_30d: 0.2, chunks: 10, embedded: 8, embed_error: null };
  assert.equal(UI.settingsHTML({ opts: { can_settings: false, admin: null } }), "");
  const s = UI.settingsHTML({ opts: { can_settings: true, admin, ai_sources: ["meeting", "internal"], claude: true, voyage: true } });
  assert.match(s, /value="meeting" checked/);
  assert.match(s, /value="feedback">/);
  assert.doesNotMatch(s, /隱私政策/);
  assert.match(s, /最近 30 天：4 次整理，大約 US\$0\.20。/);
  assert.match(s, /換成數字的小段：8／10。/);
  assert.match(UI.settingsHTML({ aiSel: ["feedback"], opts: { can_settings: true, admin, ai_sources: [], voyage: false } }), /隱私政策[\s\S]*Voyage 關掉/);
});

test("篩選：一般幹部（活動清單是空的）只有來源與日期；讀得到回饋的人多兩格", () => {
  const plain = UI.filtersHTML({ f: { sources: ["meeting"] }, opts: { events: [] } });
  assert.match(plain, /data-v="meeting" aria-pressed="true"/);
  assert.doesNotMatch(plain, /data-act="kind"|data-act="event"/);
  const full = UI.filtersHTML({ f: { sources: [], event: ID }, opts: { events: [{ id: ID, zh: "冬令營", en: "Winter", date: "2027-01-10" }] } });
  assert.match(full, new RegExp(`<option value="${ID}" selected>冬令營 · 2027-01</option>`));
  assert.match(full, /會議與內部表單沒有掛活動/);
});

test("★ 側欄：每一位幹部都有搜尋，學員沒有；只有一頁所以點下去不帶 #", () => {
  const item = RAIL.ITEMS.find(i => i.group === "search");
  assert.ok(item);
  assert.equal(RAIL.GROUPS.find(g => g.key === "search").href, "/admin/search/");
  assert.ok(RAIL.canSee(item, { role: "cadre", board: "member", team: "", ws: {} }));
  assert.ok(!RAIL.canSee(item, { role: "student", board: "member", team: "", ws: {} }));
  assert.equal(RAIL.itemHref(item, "zh"), "/admin/search/?lang=zh");
});

test("資料層：資料庫的代碼都翻得成人話", async () => {
  const D = await import("../admin/search/src/data.js").catch(() => null);
  if (!D) return; // 沒有瀏覽器的 supabase 也 import 得進來的話才驗（跟其他資料夾一樣）
  for (const code of ["not_cadre", "not_president", "ai_not_ready", "too_many_today", "too_short", "not_found"]) {
    assert.notEqual(D.says(new Error(code)), code, code);
  }
});

test("★ 遷移檔裡每一個 delete 都有 where（Supabase 從前端呼叫時會擋沒有 where 的，本機 psql 擋不到）", () => {
  const sql = readFileSync("supabase/migrations/2027-01-21-smart-search.sql", "utf8");
  const bare = [...sql.matchAll(/delete\s+from\s+[\w.]+(\s+\w+)?\s*;/gi)].map(m => m[0]);
  assert.deepEqual(bare, []);
});

test("★ 頁面照後台的規矩：一個資料夾、讀三個共用檔、不 import 別的功能資料夾", () => {
  const html = readFileSync("admin/search/index.html", "utf8");
  assert.match(html, /shared\/rail\.css\?v=/);
  assert.match(html, /<script type="module" src="\.\/src\/main\.js\?v=/);
  for (const f of ["main.js", "ui.js", "data.js", "strings.js"]) {
    const body = readFileSync(`admin/search/src/${f}`, "utf8");
    for (const m of body.matchAll(/from "([^"]+)"/g)) assert.match(m[1], /^\.\/|^\.\.\/\.\.\/\.\.\/shared\//, `${f} import 了 ${m[1]}`);
  }
  assert.match(readFileSync("app/src/nav.js", "utf8"), /"admin-search": "\.\.\/admin\/search\/"/, "登入完回得來");
});
