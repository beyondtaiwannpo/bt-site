// shared/forms.js 的純函式（2026-11-13，表單引擎）。守的是規格，不是長相。
import { test } from "node:test";
import assert from "node:assert/strict";
import * as F from "../shared/forms.js";

const Q = (id, type, extra) => Object.assign({ id, type, label: "題目 " + id, required: false, options: [] }, extra || {});

test("normalize：缺的欄位補上，分數題的兩端有預設，壞的題型變短答", () => {
  const a = F.normalize({ id: 1, type: "scale" });
  assert.equal(a.id, "1");
  assert.deepEqual([a.config.scale_min, a.config.scale_max], [1, 5]);
  assert.equal(F.normalize({ id: "x", type: "nope" }).type, "short");
  // 回饋表的分數題把兩端放在自己的欄位
  const b = F.normalize({ id: "b", type: "scale", scale_min: 0, scale_max: 10, min_label: "差" });
  assert.deepEqual([b.config.scale_min, b.config.scale_max, b.config.min_label], [0, 10, "差"]);
  assert.equal(F.normalize({ id: "h", type: "heading", required: true }).required, false, "標題不會是必填");
});

test("分頁：換頁那一塊切出新的一頁；第一塊就是換頁的話變成第一頁的標題", () => {
  const items = [Q("a", "short"), Q("p1", "page", { label: "第二頁" }), Q("b", "short")].map(F.normalize);
  const pg = F.pages(items);
  assert.equal(pg.length, 2);
  assert.deepEqual(pg.map(p => p.items.map(i => i.id)), [["a"], ["b"]]);
  assert.equal(pg[1].title, "第二頁");
  const lead = F.pages([Q("p0x", "page", { label: "開頭" }), Q("a", "short")].map(F.normalize));
  assert.equal(lead.length, 1); assert.equal(lead[0].title, "開頭");
});

test("條件：is / is_not / any_of / contains / empty / not_empty / gt / lt", () => {
  const q = F.normalize(Q("s", "single", { options: ["是", "否"], config: { other: true } }));
  assert.ok(F.condHolds({ op: "is", v: "是" }, "是", q));
  assert.ok(F.condHolds({ op: "is_not", v: "是" }, "否", q));
  assert.ok(F.condHolds({ op: "any_of", v: ["否", "是"] }, "否", q));
  assert.ok(F.condHolds({ op: "any_of", v: "否、是" }, "是", q), "any_of 也吃頓號分隔的字串");
  assert.ok(F.condHolds({ op: "is", v: F.OTHER }, "我自己寫的", q), "「其他」：答案不在選項裡就算");
  assert.ok(!F.condHolds({ op: "is", v: F.OTHER }, "是", q));
  assert.ok(F.condHolds({ op: "contains", v: "台北" }, "我在台北讀書", null));
  assert.ok(F.condHolds({ op: "contains", v: "a" }, ["xa", "b"], null), "多選：任一個包含就算");
  assert.ok(F.condHolds({ op: "empty" }, "", null) && F.condHolds({ op: "empty" }, [], null));
  assert.ok(F.condHolds({ op: "not_empty" }, ["x"], null));
  assert.ok(F.condHolds({ op: "gt", v: "17" }, "18", null) && !F.condHolds({ op: "gt", v: "18" }, "18", null));
  assert.ok(F.condHolds({ op: "lt", v: "18" }, "16", null));
  assert.ok(!F.condHolds({ op: "gt", v: "1" }, "", null), "沒填的不算大於");
  assert.ok(F.condHolds({ op: "is", v: "Yes" }, "yes", null), "比對不分大小寫");
});

test("顯示：有「顯示」規則的題，條件沒成立就藏起來；成立才出現", () => {
  const items = [
    Q("grade", "single", { options: ["高一", "高二", "高三"] }),
    Q("why", "long", { required: true }),
  ];
  items[0].logic = [{ match: "all", when: [{ q: "grade", op: "is", v: "高三" }], do: "show", target: "why" }];
  let ev = F.evaluate(items, {});
  assert.ok(ev.hidden.has("why"));
  assert.ok(!ev.required.has("why"), "★ 藏起來的題不必填");
  ev = F.evaluate(items, { grade: "高三" });
  assert.ok(!ev.hidden.has("why"));
  assert.ok(ev.required.has("why"));
});

test("藏起來與變成必填；all 與 any", () => {
  const items = [Q("a", "short"), Q("b", "short"), Q("c", "short")];
  items[0].logic = [
    { match: "any", when: [{ q: "a", op: "is", v: "x" }, { q: "b", op: "is", v: "y" }], do: "hide", target: "c" },
    { match: "all", when: [{ q: "a", op: "is", v: "r" }, { q: "b", op: "not_empty" }], do: "require", target: "c" },
  ];
  assert.ok(F.evaluate(items, { b: "y" }).hidden.has("c"), "any：其中一個成立就藏");
  assert.ok(!F.evaluate(items, { a: "r" }).required.has("c"), "all：只成立一個不算");
  assert.ok(F.evaluate(items, { a: "r", b: "1" }).required.has("c"));
});

test("★ 被藏起來的題的答案不算數：靠它當條件的題跟著藏，答案也不送", () => {
  const items = [Q("a", "single", { options: ["要", "不要"] }), Q("b", "single", { options: ["是", "否"] }), Q("c", "short")];
  items[0].logic = [{ match: "all", when: [{ q: "a", op: "is", v: "要" }], do: "show", target: "b" }];
  items[1].logic = [{ match: "all", when: [{ q: "b", op: "is", v: "是" }], do: "show", target: "c" }];
  // a 改成「不要」之後 b 藏起來，b 之前填的「是」就不算，c 也要跟著藏
  const ev = F.evaluate(items, { a: "不要", b: "是", c: "還留著的字" });
  assert.ok(ev.hidden.has("b") && ev.hidden.has("c"));
  const sent = F.collect(ev, { a: "不要", b: "是", c: "還留著的字" });
  assert.deepEqual(sent.map(x => x.q), ["a"], "只送看得到的題");
});

test("跳頁：成立就跳過中間那一頁，跳過的頁上的題不必填也不送；只准往後跳", () => {
  const items = [
    Q("in", "single", { options: ["台灣", "海外"] }),
    Q("p2", "page", { label: "在台灣" }), Q("school", "short", { required: true }),
    Q("p3", "page", { label: "最後" }), Q("end", "short"),
  ];
  items[0].logic = [{ match: "all", when: [{ q: "in", op: "is", v: "海外" }], do: "jump", target: "p3" }];
  let ev = F.evaluate(items, { in: "海外" });
  assert.deepEqual(ev.path, [0, 2]);
  assert.ok(ev.hidden.has("school") && !ev.required.has("school"));
  ev = F.evaluate(items, { in: "台灣" });
  assert.deepEqual(ev.path, [0, 1, 2]);
  // 往回跳的規則不理
  const back = items.map(x => Object.assign({}, x));
  back[4] = Object.assign({}, back[4], { logic: [{ match: "all", when: [{ q: "end", op: "not_empty" }], do: "jump", target: "p2" }] });
  assert.deepEqual(F.evaluate(back, { end: "x" }).path, [0, 1, 2]);
  // 跳到最後送出
  const toEnd = items.map(x => Object.assign({}, x));
  toEnd[0] = Object.assign({}, toEnd[0], { logic: [{ match: "all", when: [{ q: "in", op: "is", v: "海外" }], do: "jump", target: "end" }] });
  assert.deepEqual(F.evaluate(toEnd, { in: "海外" }).path, [0]);
});

test("沒有條件的半成品規則不作用；指到不見的題要被編輯器講出來", () => {
  const items = [Q("a", "short", { logic: [{ do: "hide", target: "b", when: [] }] }), Q("b", "short")];
  assert.ok(!F.evaluate(items, {}).hidden.has("b"));
  const broken = F.brokenRules([Q("a", "short", { logic: [{ do: "show", target: "gone", when: [{ q: "a", op: "empty" }] }] })]);
  assert.equal(broken.length, 1);
});

test("conditional：被規則影響的題（伺服器那一端不擋必填）", () => {
  const items = [Q("a", "short", { logic: [{ do: "show", target: "b", when: [{ q: "a", op: "empty" }] }] }), Q("b", "short"), Q("c", "short")];
  assert.ok(F.conditional(items, "b"));
  assert.ok(!F.conditional(items, "c"));
  const jump = [Q("a", "short", { logic: [{ do: "jump", target: "p", when: [{ q: "a", op: "empty" }] }] }), Q("p", "page"), Q("c", "short")];
  assert.ok(F.conditional(jump, "c"), "跳頁規則後面的題都算");
  assert.ok(!F.conditional(jump, "a"));
});

test("驗證：必填、email、電話、數字範圍、字數、日期、選項、分數、同意", () => {
  const en = false;
  assert.match(F.validate(Q("a", "short", { required: true }), "  ", en), /要填/);
  assert.equal(F.validate(Q("a", "short"), "", en), "");
  assert.match(F.validate(Q("e", "email"), "abc", en), /email/);
  assert.equal(F.validate(Q("e", "email"), "a@b.tw", en), "");
  assert.match(F.validate(Q("p", "phone"), "12", en), /電話/);
  assert.equal(F.validate(Q("p", "phone"), "+886 912-345-678", en), "");
  assert.match(F.validate(Q("n", "number", { config: { min: 1, max: 10 } }), "11", en), /最大是 10/);
  assert.match(F.validate(Q("n", "number"), "abc", en), /數字/);
  assert.match(F.validate(Q("s", "short", { config: { min_len: 5 } }), "四個字啊", en), /至少寫 5 個字/);
  assert.match(F.validate(Q("s", "short", { config: { max_len: 3 } }), "四個字啊", en), /最多 3 個字/);
  assert.match(F.validate(Q("s", "short"), "x".repeat(501), en), /最多 500/, "短答預設上限 500");
  assert.match(F.validate(Q("d", "date"), "2026-02-30", en), /日期/);
  assert.equal(F.validate(Q("d", "date"), "2028-02-29", en), "");
  assert.match(F.validate(Q("o", "single", { options: ["a"] }), "z", en), /選項/);
  assert.equal(F.validate(Q("o", "single", { options: ["a"], config: { other: true } }), "z", en), "", "有「其他」就收自己寫的");
  assert.match(F.validate(Q("m", "multi", { options: ["a"] }), ["a", "z"], en), /選項/);
  assert.match(F.validate(Q("k", "scale"), "6", en), /分數/);
  assert.match(F.validate(Q("c", "consent", { required: true }), "", en), /勾/);
  assert.equal(F.validate(Q("c", "consent", { required: true }), "yes", en), "");
  assert.match(F.validate(Q("a", "short", { required: true }), "", true), /required/, "英文訊息");
  assert.equal(F.validate(Q("h", "heading", { required: true }), "", en), "", "排版的區塊不驗");
  // 規則算出來的必填蓋過題目本身的設定
  assert.match(F.validate(Q("a", "short"), "", en, true), /要填/);
});

test("validateAll：只驗看得到的題，可以只驗一頁", () => {
  const items = [Q("a", "short", { required: true }), Q("p", "page"), Q("b", "short", { required: true })];
  const ev = F.evaluate(items, {});
  assert.deepEqual(Object.keys(F.validateAll(ev, {}, false, 0)), ["a"]);
  assert.deepEqual(Object.keys(F.validateAll(ev, {}, false, null)).sort(), ["a", "b"]);
});

test("送出：多選用換行接、排版的區塊不送", () => {
  const items = [Q("h", "heading"), Q("m", "multi", { options: ["x", "y"] }), Q("t", "text")];
  const ev = F.evaluate(items, {});
  assert.deepEqual(F.collect(ev, { m: ["x", "y"] }), [{ q: "m", v: "x\ny" }]);
  assert.deepEqual(F.fromText({ type: "multi" }, "x\ny"), ["x", "y"]);
});

test("網址帶入：?q_代號=值；選項外的值不帶，同意不能被網址勾", () => {
  const items = [Q("s", "short", { key: "school" }), Q("g", "single", { key: "grade", options: ["高一", "高二"] }),
    Q("m", "multi", { key: "topics", options: ["a", "b"] }), Q("c", "consent", { key: "ok" }), Q("n", "short")];
  const got = F.prefill(items, "?q_school=建國中學&q_grade=高三&q_topics=a,b,z&q_ok=yes");
  assert.deepEqual(got, { s: "建國中學", m: ["a", "b"] });
});

test("隱藏欄位：只收表單設定列的名字，名字要乾淨，值最多 200 字", () => {
  assert.deepEqual(F.cleanHiddenNames("from, utm_source 壞名字 1x"), ["from", "utm_source"]);
  assert.deepEqual(F.hiddenFrom(["from"], "?from=ig&other=1"), { from: "ig" });
  assert.equal(F.hiddenFrom(["from"], "?from=" + "x".repeat(300)).from.length, 200);
});

test("表單自己關起來：狀態、開放時間、截止時間、收滿", () => {
  const now = Date.parse("2026-12-01T00:00:00Z");
  assert.equal(F.closedReason({ status: "draft" }, now), "closed");
  assert.equal(F.closedReason({ status: "open" }, now), "");
  assert.equal(F.closedReason({ status: "open", opens_at: "2026-12-02T00:00:00Z" }, now), "not_yet");
  assert.equal(F.closedReason({ status: "open", closes_at: "2026-11-30T00:00:00Z" }, now), "closed");
  assert.equal(F.closedReason({ status: "open", max_responses: 3 }, now, 3), "full");
  assert.equal(F.closedReason({ status: "open", max_responses: 3 }, now, 2), "");
  assert.equal(F.closedReason({ status: "open", is_full: true }, now), "full");
});

test("草稿：沒有 localStorage 的環境不會丟例外", () => {
  assert.equal(F.draftLoad("x"), null);
  assert.equal(F.draftSave("x", { a: 1 }), false);
  F.draftClear("x");
});

test("檔案：太大、種類不對擋下來；路徑不放原本的檔名", () => {
  const q = Q("f", "file", { config: { accept: "pdf", max_mb: 2 } });
  assert.match(F.fileProblem(q, { size: 3 * 1024 * 1024, type: "application/pdf", name: "a.pdf" }, false), /2 MB/);
  assert.match(F.fileProblem(q, { size: 10, type: "image/png", name: "a.png" }, false), /PDF/);
  assert.equal(F.fileProblem(q, { size: 10, type: "application/pdf", name: "a.pdf" }, false), "");
  const p = F.uploadPath("form1", "user1", "q1", "王小明的履歷.PDF", "abc");
  assert.equal(p, "form1/user1/q1-abc.pdf");
  assert.doesNotMatch(p, /王小明/);
  assert.equal(F.normalize(Q("f", "file", { config: { max_mb: 99 } })).config.max_mb, F.FILE_MAX_MB, "上限不能超過 bucket 的");
});

test("畫一題：每一種題型都畫得出來，標籤與錯誤訊息接在一起（螢幕閱讀器）", () => {
  for (const t of F.TYPES) {
    const h = F.questionHTML(Q("q", t.v, { options: ["a", "b"] }), "", { en: false, err: t.input ? "錯了" : "" });
    if (t.v === "page") { assert.equal(h, ""); continue; }
    assert.ok(h.includes('data-fx="q"'), t.v);
    if (t.input) assert.match(h, /aria-describedby="fx-q-err"/, t.v);
  }
  assert.match(F.questionHTML(Q("q", "short", { required: true }), "", {}), /\*必填/);
  assert.match(F.questionHTML(Q("q", "single", { options: ["a"], config: { other: true } }), "我寫的", {}), /value="我寫的"/, "「其他」的字放回去");
  assert.match(F.questionHTML(Q("q", "short", { label: "<b>x</b>" }), "", {}), /&lt;b&gt;/, "題目要跳脫");
});

test("進度條：只有一頁不畫；數字照路徑算", () => {
  assert.equal(F.progressHTML(1, 1, false), "");
  assert.match(F.progressHTML(2, 3, false), /第 2 頁，共 3 頁/);
  assert.match(F.progressHTML(2, 3, false), /width:67%/);
});

test("編輯器：每一塊有題型、必填、工具列、邏輯面板；唯讀時沒有工具列", () => {
  const items = [Q("a", "single", { options: ["x", "y"] }), Q("b", "short")];
  const h = F.canvasHTML(items, { canEdit: true, en: false });
  assert.match(h, /data-autosave="q-save" data-id="a"/);
  assert.match(h, /data-act="fx-dup"/);
  assert.match(h, /條件邏輯/);
  assert.match(h, /打 \/ 選題型/);
  const ro = F.canvasHTML(items, { canEdit: false, en: false });
  assert.doesNotMatch(ro, /data-act="fx-dup"/);
  assert.doesNotMatch(ro, /fx-slash/);
  const locked = F.canvasHTML(items, { canEdit: true, lockedIds: new Set(["a"]) });
  assert.match(locked, /有人填過了/);
});

test("編輯器的邏輯按鈕：加一條規則預設「這一題有填就顯示下一題」，可以加條件、拿掉", () => {
  const items = [Q("a", "short"), Q("b", "short")];
  let a = F.logicAction("fx-add-rule", items[0], items);
  assert.deepEqual(a.logic[0], { match: "all", when: [{ q: "a", op: "not_empty", v: "" }], do: "show", target: "b" });
  a = F.logicAction("fx-add-cond", a, items, 0);
  assert.equal(a.logic[0].when.length, 2);
  a = F.logicAction("fx-del-cond", a, items, 0, 1);
  assert.equal(a.logic[0].when.length, 1);
  a = F.logicAction("fx-del-rule", a, items, 0);
  assert.equal(a.logic.length, 0);
});

test("插入選單：打 / 後面的字可以篩（中英都行）", () => {
  const h = F.insertMenuHTML(F.ALL_TYPES, 0, false, "email");
  assert.match(h, /data-type="email"/);
  assert.doesNotMatch(h, /data-type="long"/);
  assert.match(F.insertMenuHTML(F.ALL_TYPES, 0, false, "下拉"), /data-type="dropdown"/);
  assert.doesNotMatch(F.insertMenuHTML(["short", "long"], 0, false, ""), /data-type="file"/, "這一套收不了的題型不出現");
});

test("排序：拖曳之後只改真的變了的 ord", () => {
  const items = [{ id: "a", ord: 1 }, { id: "b", ord: 2 }, { id: "c", ord: 3 }];
  const ids = F.moveId(["a", "b", "c"], "c", "a");
  assert.deepEqual(ids, ["c", "a", "b"]);
  assert.deepEqual(F.reorderPatch(items, ids), [{ id: "c", ord: 1 }, { id: "a", ord: 2 }, { id: "b", ord: 3 }]);
  assert.deepEqual(F.reorderPatch(items, ["a", "b", "c"]), []);
});

test("複製：題目加（複本），規則與代號不帶過去", () => {
  const d = F.duplicateOf(Q("a", "short", { key: "k", logic: [{ do: "show", target: "b", when: [{ q: "a", op: "empty" }] }] }), false);
  assert.equal(d.id, ""); assert.equal(d.key, ""); assert.equal(d.logic.length, 0);
  assert.match(d.label, /（複本）$/);
});

test("shared/forms.js 不 import 任何東西（引擎不依賴功能資料夾，也不碰資料庫）", async () => {
  const src = (await import("node:fs")).readFileSync(new URL("../shared/forms.js", import.meta.url), "utf8");
  assert.doesNotMatch(src, /^\s*import\s/m);
  assert.doesNotMatch(src, /supabase/i);
  assert.doesNotMatch(src, /#[0-9a-f]{6}\b/i, "顏色只用 brand.css 的 token");
});

test("單選選了「其他」還沒寫字：圓點留著、文字框是空的、訊息說要寫一下是什麼", () => {
  const q = Q("s", "single", { options: ["有", "沒有"], config: { other: true }, required: true });
  assert.equal(F.validate(q, F.OTHER, false), "選了「其他」就寫一下是什麼。");
  assert.equal(F.validate(q, F.OTHER, false, false), "選了「其他」就寫一下是什麼。");
  assert.equal(F.validate(q, "自己寫的", false), "");
  const html = F.questionHTML(q, F.OTHER, { en: false });
  assert.match(html, /value="__other__" checked/);
  assert.match(html, /class="fx-other-in"[^>]*value=""/);
  assert.equal(F.condHolds({ q: "s", op: "is", v: F.OTHER }, { s: F.OTHER }, [q]), true);
});
