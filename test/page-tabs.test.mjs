// 一頁裡面的分頁（2026-11-24）：shared/rail.js 的 pageTabsHTML，後台每一頁共用。
// Paul 看過活動編輯頁的分頁之後：「I want you to do the same thing, but like for the whole BT… make it more efficient and easier for us to add」。
// 跑法：node --test test/page-tabs.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as RAIL from "../shared/rail.js";
import * as PE from "../admin/people/src/ui.js";

const read = f => readFileSync(new URL("../" + f, import.meta.url), "utf8");
const count = (h, re) => (h.match(re) || []).length;
const TABS = [{ key: "a", label: "甲", body: "<section>A</section>" }, { key: "b", label: "乙", body: "<section>B</section>", n: 3 }, { key: "c", label: "丙", body: "<section>C</section>", n: 0 }];

test("★ pageTabsHTML：一排按鈕加每個分頁一塊；沒選到的只是藏起來（hidden），每一塊都在畫面裡", () => {
  const h = RAIL.pageTabsHTML("t1", TABS, { aria: "這一頁的分頁" });
  assert.match(h, /^<nav class="subtabs ptabs" id="t1-tabs" aria-label="這一頁的分頁">/);
  assert.deepEqual([...h.matchAll(/<button type="button" data-ptab="t1" class="subtab( on)?" data-tab="([a-z])"( aria-current="page")?>/g)].map(m => m[2] + (m[1] ? "*" : "")), ["a*", "b", "c"], "第一次進來開第一個");
  assert.deepEqual([...h.matchAll(/<div class="tabp" data-ptabs="t1" data-tabp="([a-z])"( hidden)?>/g)].map(m => m[1] + (m[2] ? "-" : "")), ["a", "b-", "c-"]);
  for (const s of ["<section>A</section>", "<section>B</section>", "<section>C</section>"]) assert.ok(h.includes(s), "每一塊都在畫面裡，不能改成不畫");
  assert.match(h, /data-tab="b">乙<span class="subtab-n">3<\/span>/, "小數字"); assert.doesNotMatch(h, /丙<span/, "0 不印");
  assert.doesNotMatch(h, /data-act=/, "沒給 act 就不帶 data-act，這一支自己聽");
});

test("★ pageTabsHTML：空的那一塊不畫分頁；只剩一個就不畫那一排；一個都沒有回空字串", () => {
  const h = RAIL.pageTabsHTML("t2", [TABS[0], { key: "x", label: "空的", body: "" }, null, TABS[1]]);
  assert.deepEqual([...h.matchAll(/data-tab="([a-z])"/g)].map(m => m[1]), ["a", "b"]);
  assert.doesNotMatch(h, /空的/);
  assert.equal(RAIL.pageTabsHTML("t2", [TABS[0], { key: "x", label: "空的", body: "" }]), "<section>A</section>", "只剩一個：內容照樣出來，沒有那一排");
  assert.equal(RAIL.pageTabsHTML("t2", [{ key: "x", label: "空的", body: "" }]), "");
  assert.equal(RAIL.pageTabsHTML("t2", null), "");
  // keepEmpty：內容還在載的那種（活動編輯頁），空的也畫
  assert.equal(count(RAIL.pageTabsHTML("t2", [TABS[0], { key: "x", label: "載入中", body: "" }], { keepEmpty: true }), /<div class="tabp"/g), 2);
});

test("★ 開著哪一個：照 id 記著（setPageTab），重畫還在同一個；記著的那一個不在了就回預設；opts.on 與 opts.start", () => {
  assert.equal(RAIL.pageTabOf("t3", ["a", "b", "c"]), "a");
  assert.equal(RAIL.pageTabOf("t3", ["a", "b", "c"], "b"), "b", "start");
  RAIL.setPageTab("t3", "c");
  assert.equal(RAIL.pageTabOf("t3", ["a", "b", "c"], "b"), "c", "記著的贏過 start");
  assert.match(RAIL.pageTabsHTML("t3", TABS), /<div class="tabp" data-ptabs="t3" data-tabp="c">/);
  assert.match(RAIL.pageTabsHTML("t3", TABS.slice(0, 2)), /<div class="tabp" data-ptabs="t3" data-tabp="a">/, "記著的那個分頁這個人看不到（不在清單裡）就開第一個");
  assert.equal(RAIL.pageTabOf("other", ["a", "b"]), "a", "一種頁面記一個，互不影響");
  assert.match(RAIL.pageTabsHTML("t3", TABS, { on: "b" }), /<div class="tabp" data-ptabs="t3" data-tabp="b">/, "opts.on 直接指定");
  assert.equal(RAIL.pageTabOf("t3", []), "");
});

test("★ 自己接的那一種（活動編輯頁）：按鈕帶 data-act，這一支不管；label 原樣放、id 與 key 跳脫", () => {
  const h = RAIL.pageTabsHTML("ev", TABS, { on: "b", act: "ev-tab" });
  assert.match(h, /<button type="button" data-ptab="ev" class="subtab on" data-act="ev-tab" data-tab="b" aria-current="page">乙/);
  const src = read("shared/rail.js");
  assert.match(src, /if \(!b \|\| b\.dataset\.act\) return;/, "帶 data-act 的那一排這一支不動");
  assert.match(src, /if \(!o\.act && !ptBound && typeof document !== "undefined"\) \{ ptBound = true; document\.addEventListener\("click", ptClick\); \}/, "只掛一次，沒有 document（測試）就不掛");
  assert.match(src, /p\.hidden = p\.dataset\.tabp !== key;/, "換分頁只改 hidden，不重畫");
  assert.match(RAIL.pageTabsHTML('a"b', [{ key: "k<", label: "<b>x</b>", body: "1" }, { key: "k2", label: "y", body: "2" }]), /data-ptab="a&quot;b"[^>]*data-tab="k&lt;"[^>]*><b>x<\/b>/);
});

test("★ 樣式：.tabp 不能自己設 display（不然 hidden 藏不住）；那一排放不下就左右捲；後台每一頁都載 admin.css", () => {
  const css = read("admin/admin.css");
  assert.doesNotMatch(css, /\.tabp\{[^}]*display:/);
  assert.match(css, /\.ptabs\{overflow-x:auto;/); assert.match(css, /a\.subtab\{text-decoration:none\}/);
  for (const d of ["", "finance/", "marketing/", "passports/", "people/", "records/", "site/", "team-forms/"])
    assert.match(read(`admin/${d}index.html`), /admin\.css\?v=/, `admin/${d} 沒有載 admin.css`);
});

test("★ 人與權限的一個人：三個分頁（基本資料、工作區、帳號）；存檔的那個框整個在「基本資料」裡；每一格都在畫面裡", () => {
  const terms = [{ id: "2026-27", status: "current" }];
  const p = { person_id: "p1", profile_id: "u2", role: "cadre", board_role: "member", name_zh: "王小明", name_en: "Ming", team: "Marketing Team", positions: [], workspaces: [] };
  PE.setLang("zh");
  const h = PE.personEditHTML(p, terms, "u1", true, "", false, null, [p], null, "a@example.com", []);
  assert.deepEqual([...h.matchAll(/data-ptab="pe-person" class="subtab(?: on)?" data-tab="([a-z]+)"[^>]*>([^<]+)</g)].map(m => m[1] + ":" + m[2]), ["profile:基本資料", "ws:工作區", "account:帳號"]);
  const at = s => { const i = h.indexOf(s); assert.ok(i >= 0, `找不到 ${s}`); return i; };
  const prof = at('data-tabp="profile"'), ws = at('data-tabp="ws"'), acc = at('data-tabp="account"');
  assert.ok(prof < at('data-autosave="person-save"') && at('id="pk-zh"') < at('id="pk-role"') && at('id="pk-term"') < ws, "姓名、職級、職位都在「基本資料」");
  assert.ok(at('class="autosave" data-for="person-save"') < ws, "「改了就存」那一行也在");
  assert.equal(count(h, /data-autosave="person-save"/g), 1, "存檔的框只有一個，沒有被拆開");
  assert.ok(acc < at('data-act="member-remove"'), "從平台移除在「帳號」");
  // 自己看自己、沒有帳號的紀錄：少幾塊，分頁跟著少，不留空的
  const noAcct = PE.personEditHTML({ person_id: "p9", profile_id: null, role: null, name_zh: "沒帳號", name_en: "", positions: [], workspaces: [] }, terms, "u1", true, "", false, null, [], null, "", []);
  assert.doesNotMatch(noAcct, /data-tab="ws"/, "沒有帳號的人沒有「工作區」分頁");
  assert.match(noAcct, /data-tab="account"/);
});
