// 內部表單（2026-11-29）的純函式：名單怎麼算、結果怎麼統計、找人、匯出。
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

test("必填檢查回第幾題（從 1 算），多選空陣列也算沒填", () => {
  const qs = [{ id: "a", required: false }, { id: "b", required: true }, { id: "c", required: true }];
  assert.equal(UI.missingRequired(qs, { b: "x", c: ["y"] }), 0);
  assert.equal(UI.missingRequired(qs, { b: " ", c: ["y"] }), 2);
  assert.equal(UI.missingRequired(qs, { b: "x", c: [] }), 3);
});

test("畫面：填的頁說誰看得到、匿名的有寫；預覽送不出去；結果頁匿名不印名字", () => {
  const fill = UI.fillHTML({ form: { id: "f1", title: "Check-in", intro: "Hi", anonymous: true, status: "open" }, questions: QS, can_submit: true, preview: false, mine: null }, "", false);
  assert.match(fill, /Who can read your answers: the Co-Presidents/);
  assert.match(fill, /anonymous/);
  assert.match(fill, /data-act="fill-send"/);
  assert.match(fill, /type="radio" name="q_q3" value="3"/);
  const pre = UI.fillHTML({ form: { id: "f1", title: "x", status: "draft" }, questions: QS, can_submit: false, preview: true, mine: null }, "", false);
  assert.doesNotMatch(pre, /data-act="fill-send"/);
  assert.match(pre, /Preview/);
  const res = UI.resultsHTML({ form: { id: "f1", title: "x", anonymous: true }, questions: QS, responses: RS.map(r => ({ ...r, name: "", team: "" })), pending: [], recipients: 3, can_edit: false }, "", {});
  assert.doesNotMatch(res, /Alex Chen|<th>Who<\/th>/);
  assert.match(res, /Average 2\.33/);
});

test("畫面：使用者填的字一律跳脫", () => {
  const evil = "<img src=x onerror=alert(1)>";
  const list = UI.buildListHTML({ can_create: true, manage: [{ id: "f1", title: evil, status: "open", responses: 1, recipients: 2, owner_name: evil, role: "editor" }] }, "", false, null);
  assert.doesNotMatch(list, /<img/);
  const fill = UI.fillHTML({ form: { id: "f1", title: evil, intro: evil, status: "open" }, questions: [{ id: "q", type: "single", label: evil, options: [evil, "b"] }], can_submit: true, mine: null }, "", false);
  assert.doesNotMatch(fill, /<img/);
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
