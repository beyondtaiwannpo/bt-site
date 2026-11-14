// 回饋表換上表單引擎（2026-11-13，遷移檔 2026-12-24-feedback-engine.sql）：
// 後台畫布那一半（admin/records/src/ui.js）與填寫頁那一半（feedback/src/ui.js）的純函式。資料全是假的。
// 資料庫那一半（誰改得動、格式怎麼驗、匿名不收 email 題）在 scripts/db/smoke.sh 的「回饋表換上表單引擎」那一段。
// 跑法：node --test test/*.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as RC from "../admin/records/src/ui.js";
import * as FB from "../feedback/src/ui.js";
import * as F from "../shared/forms.js";

RC.setLang("en");

test("★ 回饋表收得了的題型：引擎全部減掉上傳檔案；還沒跑新遷移檔的資料庫只有舊的五種", () => {
  assert.ok(!RC.TYPES.includes("file"));
  for (const t of ["short", "long", "email", "phone", "number", "date", "single", "multi", "dropdown", "scale", "consent", "heading", "text", "page"]) assert.ok(RC.TYPES.includes(t), t);
  assert.equal(RC.TYPES.length, 14);
  assert.deepEqual(RC.OLD_TYPES, ["short", "long", "single", "multi", "scale"]);
  assert.equal(RC.isOldDb([{ id: "a", type: "short" }]), true);
  assert.equal(RC.isOldDb([{ id: "a", type: "short", config: {} }]), false);
  assert.equal(RC.isOldDb([]), false);
});

test("資料庫的一列 ↔ 引擎的一題：分數題兩端收進 config，存回去時舊的四欄跟 config 一樣", () => {
  const row = { id: "q1", ord: 1, key: "recommend", type: "scale", label: "Recommend?", required: true, options: [], scale_min: 1, scale_max: 5, min_label: "No", max_label: "Yes", answered: true };
  const q = RC.fromRow(row);
  assert.equal(q.config.scale_min, 1); assert.equal(q.config.scale_max, 5); assert.equal(q.config.max_label, "Yes");
  assert.equal(q.ord, 1); assert.equal(q.answered, true);
  const back = RC.toRow(q);
  assert.equal(back.id, "q1"); assert.equal(back.key, "recommend");
  assert.equal(back.scale_min, 1); assert.equal(back.scale_max, 5); assert.equal(back.min_label, "No"); assert.equal(back.max_label, "Yes");
  assert.equal(back.config.scale_min, back.scale_min);
  assert.ok(!("ord" in back) && !("answered" in back), "順序以送出的陣列為準，有人答過是資料庫算的");
  const s = RC.toRow(RC.fromRow({ id: "q2", type: "single", label: "Again?", options: ["Yes", "No"], config: { other: true }, logic: [{ match: "all", when: [{ q: "q2", op: "is", v: "No" }], do: "show", target: "q3" }] }));
  assert.equal(s.config.other, true); assert.equal(s.logic.length, 1); assert.ok(!("scale_min" in s));
});

test("新的一題：前端配 uuid、空題目先給一個字（資料庫不收沒有題目的題，而每次存都是整份送）", () => {
  assert.match(RC.newId(), /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  assert.notEqual(RC.newId(), RC.newId());
  assert.equal(RC.withLabel(F.blankBlock("short", false), false).label, "新的一題");
  assert.equal(RC.withLabel(F.blankBlock("email", true), true).label, "New question");
  assert.equal(RC.withLabel(F.blankBlock("page", false), false).label, "", "換頁的標題選填，不補字");
  assert.equal(RC.withLabel(F.blankBlock("text", false), false).label, "");
  assert.equal(RC.withLabel(F.blankBlock("heading", false), false).label, "一個段落");
  assert.equal(RC.blockProblem({ type: "short", label: " " }), "says.needLabel");
  assert.equal(RC.blockProblem({ type: "page", label: "" }), "");
  assert.equal(RC.blockProblem({ type: "dropdown", label: "Pick", options: ["A"] }), "says.needOptions");
  assert.equal(RC.blockProblem({ type: "dropdown", label: "Pick", options: ["A", "B"] }), "");
});

test("★ 畫布：沒有上傳檔案；匿名的表單加不了 email 題、電話題；有人答過的題刪不掉；代號那一格在每一題上", () => {
  const S = { questions: [RC.fromRow({ id: "q1", ord: 1, key: "recommend", type: "scale", label: "Recommend?", scale_min: 1, scale_max: 5, config: {}, answered: true }),
                          RC.fromRow({ id: "q2", ord: 2, type: "page", label: "", config: {} })], fx: { mode: "edit", menuAt: 2, filter: "", logicOpen: new Set() } };
  const base = { form: { id: "f1", kind: "post-event", lang: "en", anonymous: false }, can_edit: true, questions: [{ id: "q1", config: {} }] };
  const html = RC.questionsHTML(base, S);
  assert.match(html, /data-fx-canvas/);
  assert.doesNotMatch(html, /data-type="file"/);
  assert.match(html, /data-type="email"/);
  assert.match(html, /class="rc-key"[\s\S]*name="key" value="recommend"/);
  assert.doesNotMatch(html.split('data-fx-blk="q1"')[1].split('data-fx-blk="q2"')[0], /data-act="fx-del"/, "答過的那一題沒有「刪掉」");
  assert.match(html.split('data-fx-blk="q2"')[1], /data-act="fx-del"/);
  const anon = RC.questionsHTML(Object.assign({}, base, { form: Object.assign({}, base.form, { anonymous: true }) }), S);
  assert.doesNotMatch(anon, /data-type="email"|data-type="phone"/);
  assert.match(anon, /data-type="scale"/);
  const old = RC.questionsHTML(Object.assign({}, base, { questions: [{ id: "q1" }] }), S);
  assert.doesNotMatch(old, /data-type="dropdown"/, "舊資料庫只給舊的五種");
  assert.match(old, /data-type="single"/);
  const view = RC.questionsHTML(Object.assign({}, base, { can_edit: false }), S);
  assert.doesNotMatch(view, /data-fx-slash|data-act="fx-insert"/);
  const pv = RC.questionsHTML(base, Object.assign({}, S, { fx: Object.assign({}, S.fx, { mode: "preview" }) }));
  assert.match(pv, /id="fx-pv"/); assert.doesNotMatch(pv, /data-fx-canvas/);
});

test("結果：排版區塊不列；下拉照單選計票；同意題印「同意」", () => {
  const qs = [{ id: "h", type: "heading", label: "Part 2" }, { id: "p", type: "page", label: "" }, { id: "t", type: "text", label: "Read me" },
              { id: "d", type: "dropdown", label: "How did you hear?", options: ["IG", "Friend"] }, { id: "c", type: "consent", label: "I agree" }, { id: "e", type: "short", label: "Anything else?" }];
  const rs = [{ id: "r1", answers: { d: "IG", c: "yes", e: "more breaks" }, submitted_at: "2026-11-07", age_band: "18plus" }, { id: "r2", answers: { d: "IG", c: "yes" }, submitted_at: "2026-11-07" }];
  const s = RC.summarize(qs, rs);
  assert.deepEqual(s.map(x => x.q.id), ["d", "c", "e"]);
  assert.deepEqual(s[0].counts, [{ option: "IG", n: 2 }, { option: "Friend", n: 0 }]);
  assert.deepEqual(s[1].counts, [{ option: "Agreed", n: 2 }]);
  const csv = RC.resultsCSV(qs, rs, true);
  assert.doesNotMatch(csv, /Part 2|Read me/);
  assert.match(csv, /,Agreed/); assert.doesNotMatch(csv, /,yes,/);
});

test("★ 引擎讀回一塊：規則只算 .fx-rule 那一格（按鈕身上也有 data-rule，算進去會每存一次多出空規則）", () => {
  const src = readFileSync(new URL("../shared/forms.js", import.meta.url), "utf8");
  assert.match(src, /querySelectorAll\("\.fx-rule\[data-rule\]"\)/);
  assert.match(src, /querySelectorAll\("\.fx-cond\[data-cond\]"\)/);
  const items = [F.normalize({ id: "a", type: "single", label: "Again?", options: ["Yes", "No"], logic: [{ match: "all", when: [{ q: "a", op: "is", v: "No" }, { q: "a", op: "not_empty", v: "" }], do: "show", target: "b" }] }),
                 F.normalize({ id: "b", type: "long", label: "Why?" })];
  const html = F.blockHTML(items[0], items, { canEdit: true, en: true });
  assert.equal((html.match(/class="fx-rule" data-rule=/g) || []).length, 1);
  assert.ok((html.match(/data-rule="0"/g) || []).length > 1, "按鈕也帶 data-rule，所以讀回來時一定要限定 .fx-rule");
  assert.equal((html.match(/class="fx-cond" data-cond=/g) || []).length, 2);
});

test("填寫頁：題目轉成引擎形狀；答案轉成 rc_public_submit 要的樣子，多選送陣列", () => {
  const items = FB.itemsOf({ questions: [{ id: "s", ord: 1, type: "scale", label: "1 to 5", scale_min: 0, scale_max: 10 }, { id: "m", ord: 2, type: "multi", label: "Which?", options: ["A", "B"] }, { id: "l", ord: 3, type: "long", label: "Why?" }] });
  assert.equal(items[0].config.scale_min, 0); assert.equal(items[0].config.scale_max, 10);
  assert.deepEqual(items[1].logic, []);
  const out = FB.toAnswers([{ q: "s", v: "7" }, { q: "m", v: "A\nmy own" }, { q: "l", v: "long text" }, { q: "ghost", v: "x" }], items);
  assert.deepEqual(out, { s: "7", m: ["A", "my own"], l: "long text" });
  assert.equal(FB.errorTarget({ message: "bad_answer:3" }, items), "l");
  assert.equal(FB.errorTarget({ message: "required:2" }, items), "m");
  assert.equal(FB.errorTarget({ message: "too_long:9" }, items), null);
  assert.equal(FB.errorTarget({ message: "form_closed" }, items), null);
  assert.match(FB.says({ message: "bad_answer:3" }, false), /格式不對/);
  assert.match(FB.says({ message: "form_closed" }, true), /closed/);
});

test("★ 填寫頁最後那一段：沒勾「可以 email 我」就不送 email 與名字；勾了要一個格式對的 email", () => {
  assert.deepEqual(FB.metaOut({ age_band: "under18", contact_ok: false, email: "kid@example.com", name: "Test" }), { age_band: "under18", contact_ok: false, email: "", name: "" });
  assert.deepEqual(FB.metaOut({ contact_ok: true, email: " a@example.com ", name: " T " }), { age_band: "unknown", contact_ok: true, email: "a@example.com", name: "T" });
  assert.equal(FB.metaOut({ age_band: "whatever" }).age_band, "unknown");
  assert.equal(FB.metaProblem({ contact_ok: true, email: "nope" }), "bad_email");
  assert.equal(FB.metaProblem({ contact_ok: true, email: "" }), "bad_email");
  assert.equal(FB.metaProblem({ contact_ok: false, email: "nope" }), "");
  const zh = FB.metaHTML({}, false), en = FB.metaHTML({ contact_ok: true, age_band: "18plus" }, true);
  assert.match(zh, /你 18 歲以下嗎/); assert.match(zh, /value="unknown" checked/); assert.match(zh, /id="fb-contact-box" hidden/);
  assert.match(en, /Are you under 18/); assert.match(en, /value="18plus" checked/); assert.doesNotMatch(en, /id="fb-contact-box" hidden/);
  assert.doesNotMatch(zh + en, /<span class="en">|<span class="zh">/, "引擎那一塊只印一種語言");
});

test("★ 填到一半的答案只放這個分頁（sessionStorage 的位置），送出就清；壞掉的儲存空間不會讓頁面掛掉", () => {
  const mem = new Map(), store = { getItem: k => mem.has(k) ? mem.get(k) : null, setItem: (k, v) => mem.set(k, v), removeItem: k => mem.delete(k) };
  FB.draftSave("f1", { a: "1" }, 1, store);
  assert.deepEqual(FB.draftLoad("f1", store), { answers: { a: "1" }, page: 1 });
  assert.ok(!/email|name|age_band/.test(mem.get(FB.draftKey("f1"))), "草稿裡沒有聯絡資料");
  FB.draftClear("f1", store);
  assert.equal(FB.draftLoad("f1", store), null);
  const broken = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); }, removeItem() { throw new Error("blocked"); } };
  assert.equal(FB.draftLoad("f1", broken), null);
  assert.doesNotThrow(() => FB.draftSave("f1", {}, 0, broken));
  assert.doesNotThrow(() => FB.draftClear("f1", broken));
  const main = readFileSync(new URL("../feedback/src/main.js", import.meta.url), "utf8");
  assert.doesNotMatch(main, /localStorage|draftKey:/, "不交給引擎的 localStorage 草稿");
});

test("填寫頁外框：資料告知一定在；收起來的表單只印一句，不畫題目", () => {
  const open = FB.shellHTML({ form: { title: "Winter feedback", open: true, intro: "Two minutes." } }, "");
  assert.match(open, /id="fx-run"/); assert.match(open, /beyondtaiwan2020@gmail\.com/); assert.match(open, /Two minutes\./);
  const closed = FB.shellHTML({ form: { title: "Winter feedback", open: false } }, "");
  assert.doesNotMatch(closed, /fx-run/); assert.match(closed, /收起來了/);
  assert.match(FB.shellHTML({ form: { title: "<b>x</b>", open: true } }, ""), /&lt;b&gt;x/);
});
