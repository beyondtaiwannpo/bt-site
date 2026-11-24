// 內部表單（2026-11-29；2026-12-23 換成 shared/forms.js 那支引擎）的純函式：名單怎麼算、結果怎麼統計、找人、匯出、填的頁與編輯器畫什麼。
// 資料庫那一半（誰讀得到、誰改得動）在 scripts/db/smoke.sh 的「內部表單」那一段。資料全是假的。
// 跑法：node --test test/*.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import * as UI from "../admin/team-forms/src/ui.js";

UI.setLang("en");

const PEOPLE = [
  { id: "p1", name: "Alex Chen", name_en: "Alex Chen", name_zh: "陳小明", team: "Marketing Team", rank: "member" },
  { id: "p2", name: "Bea Lin", name_en: "Bea Lin", name_zh: "", team: "Marketing Team, Internship Team", rank: "director" },
  { id: "p3", name: "Cody Wu", name_en: "Cody Wu", name_zh: "", team: "Curriculum Team", rank: "senior_adviser" },
  { id: "p4", name: "Alex Huang", name_en: "Alex Huang", name_zh: "", team: "Mentorship Team", rank: "member" },
  { id: "p5", name: "Dana Ko", name_en: "Dana Ko", name_zh: "", team: "", rank: "president" },
];

test("名單：全部、職級、team（一人多個 team、不分大小寫）、指定的人", () => {
  assert.equal(UI.peopleIn(PEOPLE, [{ kind: "all", value: "" }]).length, 5);
  assert.deepEqual(UI.peopleIn(PEOPLE, [{ kind: "rank", value: "director" }]).map(p => p.id), ["p2"]);
  assert.deepEqual(UI.peopleIn(PEOPLE, [{ kind: "team", value: "internship team" }]).map(p => p.id), ["p2"]);
  assert.deepEqual(UI.peopleIn(PEOPLE, [{ kind: "team", value: "Marketing Team" }, { kind: "person", value: "p5" }]).map(p => p.id), ["p1", "p2", "p5"]);
  assert.equal(UI.peopleIn(PEOPLE, []).length, 0, "空名單是零個人，不是全部");
});

test("名單的開關與比對：加了再按一次是拿掉、順序不同算一樣", () => {
  let it = UI.toggleItem([], { kind: "rank", value: "member" });
  it = UI.toggleItem(it, { kind: "team", value: "Marketing Team" });
  assert.equal(it.length, 2);
  it = UI.toggleItem(it, { kind: "rank", value: "member" });
  assert.deepEqual(it, [{ kind: "team", value: "Marketing Team" }]);
  assert.ok(UI.sameItems([{ kind: "a", value: "1" }, { kind: "b", value: "" }], [{ kind: "b", value: "" }, { kind: "a", value: "1" }]));
  assert.deepEqual(UI.audOf([{ role: "reader", kind: "rank", value: "senior_adviser" }, { role: "recipient", kind: "all", value: "" }], "reader"), [{ kind: "rank", value: "senior_adviser" }]);
});

test("找人：打名字的一部分、中文名也找得到、已經選的不再列", () => {
  assert.deepEqual(UI.findPeople(PEOPLE, "alex").map(p => p.id), ["p1", "p4"]);
  assert.deepEqual(UI.findPeople(PEOPLE, "小明").map(p => p.id), ["p1"]);
  assert.deepEqual(UI.findPeople(PEOPLE, "alex", ["p1"]).map(p => p.id), ["p4"]);
  assert.deepEqual(UI.findPeople(PEOPLE, "  "), []);
});

const QS = [
  { id: "q1", type: "single", label: "Quarter", options: ["Q1", "Q2"] },
  { id: "q2", type: "multi", label: "Pick", options: ["a", "b", "c"] },
  { id: "q3", type: "scale", label: "Workload", scale_min: 1, scale_max: 3 },
  { id: "q4", type: "long", label: "Comments" },
];
const RS = [
  { name: "Alex Chen", team: "Marketing Team", submitted_at: "2026-10-21T10:30:07Z", answers: { q1: "Q1", q2: "a\nc", q3: "3", q4: "fake comment" } },
  { name: "Bea Lin", team: "Marketing Team", submitted_at: "2026-10-22T10:30:07Z", answers: { q1: "Q1", q2: "c", q3: "2" } },
  { name: "Cody Wu", team: "", submitted_at: "2026-10-23T10:30:07Z", answers: { q1: "Q9 old option", q3: "2", q4: "=HYPERLINK(\"x\")" } },
];

test("每一題的統計：單選與多選照選項數、選項外的另外列、量表平均與分布、文字題幾個人寫", () => {
  const [s1, s2, s3, s4] = UI.summarize(QS, RS);
  assert.deepEqual(s1.counts, [{ option: "Q1", n: 2 }, { option: "Q2", n: 0 }]);
  assert.deepEqual(s1.other, [{ option: "Q9 old option", n: 1 }]);
  assert.deepEqual(s2.counts.map(c => c.n), [1, 0, 2], "多選每個選項各算一次");
  assert.equal(s3.avg, 2.33);
  assert.deepEqual(s3.dist, [{ v: 1, n: 0 }, { v: 2, n: 2 }, { v: 3, n: 1 }]);
  assert.equal(s4.n, 2);
  assert.equal(s4.texts[0].name, "Alex Chen");
});

test("匯出 CSV：有 BOM、具名的有名字欄、匿名的沒有、= 開頭的格子不會變成公式", () => {
  const named = UI.resultsCSV(QS, RS, false);
  assert.ok(named.startsWith("﻿Who,Team,Submitted,Quarter"));
  assert.match(named, /Alex Chen,Marketing Team/);
  assert.match(named, /a; c/, "多選的換行變成分號");
  assert.match(named, /"'=HYPERLINK\(""x""\)"/);
  const anon = UI.resultsCSV(QS, RS, true);
  assert.ok(anon.startsWith("﻿Submitted,Quarter"));
  assert.doesNotMatch(anon, /Alex Chen|Bea Lin|Cody Wu/);
  assert.equal(UI.csvFilename("Quarterly Check-In 2026"), "bt-quarterly-check-in-2026.csv");
});

test("填的頁：資料庫的文字答案變成引擎的值（多選是陣列、排版區塊不帶），送出的 [{q, v}] 變回 { 題目: 值 }", () => {
  const qs = [...QS, { id: "h1", type: "heading", label: "Part 2" }, { id: "pg", type: "page", label: "" }];
  const a = UI.engineAnswers(qs, { q1: "Q1", q2: "a\nc", q3: "3", q4: "", h1: "x", pg: "y" });
  assert.deepEqual(a, { q1: "Q1", q2: ["a", "c"], q3: "3" }, "空的不帶、小標題與換頁不帶");
  assert.deepEqual(UI.toAnswerMap([{ q: "q1", v: "Q1" }, { q: "q2", v: "a\nc" }, { q: "q3", v: 3 }, { q: "", v: "x" }, null]),
    { q1: "Q1", q2: "a\nc", q3: "3" });
});

test("編輯器的新題目：瀏覽器先給 id、要收答案的先有一句題目、換頁與說明可以沒有；存之前擋沒題目與選項不到兩個", () => {
  const nb = UI.newBlock("dropdown");
  assert.match(nb.id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.ok(nb.label, "下拉題先有一句題目");
  assert.ok(nb.options.length >= 2);
  assert.notEqual(UI.newBlock("short").id, UI.newBlock("short").id);
  assert.equal(UI.blockProblem(UI.newBlock("page")), "", "換頁可以沒有標題");
  assert.equal(UI.blockProblem(UI.newBlock("text")), "");
  assert.match(UI.blockProblem({ type: "short", label: " " }), /needs text/);
  assert.match(UI.blockProblem({ type: "dropdown", label: "x", options: ["only"] }), /two options/i);
  const cp = UI.copyBlock({ id: "q1", type: "single", label: "Quarter", options: ["Q1", "Q2"], logic: [] });
  assert.notEqual(cp.id, "q1");
  assert.equal(cp.type, "single");
  assert.ok(!UI.TYPES.includes("file"), "內部表單不收檔案");
  assert.ok(UI.TYPES.includes("page") && UI.TYPES.includes("consent") && UI.TYPES.includes("dropdown"));
});

test("結果：小標題、說明、換頁不列也不進 CSV；下拉跟單選一樣算票；同意題算幾個人勾", () => {
  const qs = [
    { id: "d1", type: "dropdown", label: "City", options: ["Taipei", "Tainan"] },
    { id: "h1", type: "heading", label: "Section two" },
    { id: "t1", type: "text", label: "Some words" },
    { id: "p1", type: "page", label: "Next" },
    { id: "c1", type: "consent", label: "I agree" },
    { id: "e1", type: "email", label: "Email" },
  ];
  const rs = [
    { name: "A", team: "", submitted_at: "2026-10-21T10:30:07Z", answers: { d1: "Taipei", c1: "yes", e1: "a@example.com" } },
    { name: "B", team: "", submitted_at: "2026-10-22T10:30:07Z", answers: { d1: "Taipei", c1: "yes" } },
    { name: "C", team: "", submitted_at: "2026-10-23T10:30:07Z", answers: { d1: "Elsewhere" } },
  ];
  const sum = UI.summarize(qs, rs);
  assert.deepEqual(sum.map(s => s.q.id), ["d1", "c1", "e1"]);
  assert.deepEqual(sum[0].counts, [{ option: "Taipei", n: 2 }, { option: "Tainan", n: 0 }]);
  assert.deepEqual(sum[0].other, [{ option: "Elsewhere", n: 1 }]);
  assert.equal(sum[1].consent, 2);
  assert.equal(sum[2].n, 1);
  assert.equal(sum[2].texts[0].v, "a@example.com");
  const csv = UI.resultsCSV(qs, rs, true);
  assert.ok(csv.startsWith("\uFEFFSubmitted,City,I agree,Email\r\n"));
  assert.doesNotMatch(csv, /Section two|Some words|Next/);
  const res = UI.resultsHTML({ form: { id: "f1", title: "x", anonymous: true }, questions: qs, responses: rs, pending: [], recipients: 3, can_edit: false }, "", {});
  assert.match(res, /Dropdown/, "題型名稱用引擎的");
  assert.doesNotMatch(res, /Section two/);
});

test("畫面：填的頁說誰看得到、匿名的有寫；第一頁先畫好給引擎接手；預覽也是引擎；填過不能改的看自己的答案；結果頁匿名不印名字", () => {
  const qs = [...QS.slice(0, 2), { id: "pg", type: "page", label: "Page two" }, ...QS.slice(2)];
  const fill = UI.fillHTML({ form: { id: "f1", title: "Check-in", intro: "Hi", anonymous: true, status: "open" }, questions: qs, can_submit: true, preview: false, mine: null }, "", false);
  assert.match(fill, /Who can read your answers: the Co-Presidents/);
  assert.match(fill, /anonymous/);
  assert.match(fill, /id="tf-run"/);
  assert.match(fill, /data-fxnav="next"/, "有換頁，第一頁是「下一頁」");
  assert.doesNotMatch(fill, /name="q_q3"/, "量表在第二頁，第一頁不畫");
  const last = UI.fillHTML({ form: { id: "f1", title: "x", status: "open" }, questions: qs, can_submit: true, mine: null }, "", false, { answers: {}, page: 1 });
  assert.match(last, /data-fxnav="submit"/);
  assert.match(last, /Workload/);
  const pre = UI.fillHTML({ form: { id: "f1", title: "x", status: "draft" }, questions: QS, can_submit: false, preview: true, mine: null }, "", false);
  assert.match(pre, /Preview/);
  assert.match(pre, /id="tf-run"/, "讀者預覽也是引擎，條件邏輯照樣會動");
  const done = UI.fillHTML({ form: { id: "f1", title: "x", status: "closed" }, questions: qs, can_submit: false, preview: false,
    mine: { submitted_at: "2026-10-21T10:30:07Z", answers: { q1: "Q2", q2: "b", q3: "2" } } }, "", false);
  assert.doesNotMatch(done, /id="tf-run"|data-fxnav/);
  assert.match(done, /value="Q2"[^>]*checked|checked[^>]*value="Q2"/);
  assert.match(done, /disabled/);
  assert.match(done, /\(no answer\)/, "沒答的那題寫出來");
  assert.match(done, /Page two/, "多頁的話印頁名");
  const res = UI.resultsHTML({ form: { id: "f1", title: "x", anonymous: true }, questions: QS, responses: RS.map(r => ({ ...r, name: "", team: "" })), pending: [], recipients: 3, can_edit: false }, "", {});
  assert.doesNotMatch(res, /Alex Chen|<th>Who<\/th>/);
  assert.match(res, /Average 2\.33/);
});

test("畫面：題目是引擎的畫布，一塊一塊各自存；有人答過的題鎖刪除；舊資料庫只給舊的五種題型", () => {
  const a = { form: { id: "f1", title: "x", status: "open", anonymous: false }, can_edit: true, engine: true, responses: 1, recipients: 2,
    questions: [{ id: "q1", type: "short", label: "Name", answered: true, logic: [] }, { id: "q2", type: "long", label: "More", answered: false, logic: [] }] };
  const fx = { mode: "edit", menuAt: 2, filter: "", logicOpen: new Set() };
  const ed = UI.questionsEditHTML(a, "", false, fx);
  assert.doesNotMatch(ed, /data-autosave="tf-save"/, "設定那一塊搬到「設定」分頁了（2026-11-24）");
  assert.match(UI.questionsEditHTML(a, "", false, fx, "settings"), /data-autosave="tf-save"/);
  assert.equal((ed.match(/data-autosave="tf-q"/g) || []).length, 2);
  assert.match(ed, /data-fx-slash/);
  assert.doesNotMatch(ed, /data-type="file"/, "沒有上傳檔案");
  assert.match(ed, /data-type="page"/);
  assert.doesNotMatch(ed, /data-act="fx-del" data-id="q1"/, "答過的題不能刪");
  assert.match(ed, /data-act="fx-del" data-id="q2"/);
  const old = UI.questionsEditHTML(Object.assign({}, a, { engine: false }), "", false, fx);
  assert.match(old, /database isn&#39;t updated yet/);
  assert.doesNotMatch(old, /data-type="page"|data-type="dropdown"/);
  assert.match(old, /data-type="scale"/);
  const pv = UI.questionsEditHTML(a, "", false, Object.assign({}, fx, { mode: "preview" }));
  assert.match(pv, /id="fx-pv"/);
  assert.doesNotMatch(pv, /data-autosave="tf-q"/);
});

test("畫面：使用者填的字一律跳脫", () => {
  const evil = "<img src=x onerror=alert(1)>";
  const list = UI.buildListHTML({ can_create: true, manage: [{ id: "f1", title: evil, status: "open", responses: 1, recipients: 2, owner_name: evil, role: "editor" }] }, "", false, null);
  assert.doesNotMatch(list, /<img/);
  const fill = UI.fillHTML({ form: { id: "f1", title: evil, intro: evil, status: "open" }, questions: [{ id: "q", type: "single", label: evil, options: [evil, "b"] }], can_submit: true, mine: null }, "", false);
  assert.doesNotMatch(fill, /<img/);
  const done = UI.answeredHTML([{ id: "q", type: "short", label: evil }], { q: evil });
  assert.doesNotMatch(done, /<img/);
});

test("★ 匯入 Tally 拿掉了（Paul 2026-11-06：不會用）：畫面沒有那顆按鈕，程式不叫 tf_import／tf_link_response", async () => {
  const { readFileSync } = await import("node:fs");
  const list = UI.buildListHTML({ can_create: true, manage: [] }, "", false, null);
  assert.doesNotMatch(list, /tf-import|Tally/);
  for (const f of ["ui", "main", "data", "strings"]) {
    const src = readFileSync(new URL(`../admin/team-forms/src/${f}.js`, import.meta.url), "utf8");
    assert.doesNotMatch(src, /tf_import|tf_link_response|importHTML|parseCSV|Tally/, f);
  }
});

test("資料層：存回去的題目帶 config 與 logic，分數題兩端也放最外層（舊資料庫只認那四欄）；看得出資料庫跑過 2026-12-23 沒", async () => {
  const D = await import("../admin/team-forms/src/data.js");
  const p = D.qPayload({ id: "q3", type: "scale", label: "Workload", scale_min: 0, scale_max: 4, min_label: "low" });
  assert.equal(p.scale_min, 0);
  assert.equal(p.scale_max, 4);
  assert.equal(p.min_label, "low");
  assert.equal(p.config.scale_max, 4);
  assert.deepEqual(p.logic, []);
  const s = D.qPayload({ id: "q1", type: "single", label: "x", options: ["a", "b"], config: { other: true } });
  assert.equal(s.config.other, true);
  assert.ok(!("scale_min" in s));
  assert.equal(D.engineReady([]), true, "一題都沒有看不出來，當作有");
  assert.equal(D.engineReady([{ id: "a", type: "short", label: "x" }]), false, "舊資料庫回的題目沒有 config");
  assert.equal(D.engineReady([{ id: "a", type: "short", label: "x", config: {} }]), true);
  const n = D.normQuestions([{ id: "a", type: "scale", label: "x", scale_min: 1, scale_max: 3, ord: 2, answered: true }]);
  assert.equal(n[0].config.scale_max, 3);
  assert.equal(n[0].ord, 2);
  assert.equal(n[0].answered, true);
  assert.match(D.says({ message: "bad_answer:q1" }), /format|格式/i);
  assert.match(D.says({ message: 'new row for relation "tf_questions" violates check constraint "tf_questions_type_check"' }), /2026-12-23/);
});
