// BT Records（2026-12-01）的純函式：記分卡怎麼算、固定題目怎麼變成題目清單、結果怎麼統計、CSV、名單。
// 資料庫那一半（誰讀得到、誰改得動）在 scripts/db/smoke.sh 的「BT Records」那一段。資料全是假的。
// 跑法：node --test test/*.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import * as UI from "../admin/records/src/ui.js";

UI.setLang("en");

test("記分卡：四個數字從資料庫回的 numbers 來，沒資料是 null 不是 0；跟上一場比正數是進步", () => {
  const n = UI.scorecard({ registered: 40, attended: 30, attendance_rate: "75.0", recommend_avg: "4.25", recommend_n: 20, useful_avg: null, responses: 22, response_rate: "73.3" });
  assert.equal(n.attendance, 75); assert.equal(n.recommend, 4.25); assert.equal(n.useful, null); assert.equal(n.responses, 22);
  assert.equal(UI.scorecard(null).responses, 0);
  assert.equal(UI.delta(4.25, 4.0), 0.25); assert.equal(UI.delta(3.5, 4.0), -0.5); assert.equal(UI.delta(4, null), null);
  assert.equal(UI.fmtDelta(0.25), "+0.25"); assert.equal(UI.fmtDelta(-5, "%"), "-5%"); assert.equal(UI.fmtDelta(null), "");
  assert.equal(UI.fmtPct(null), "–"); assert.equal(UI.fmtPct(66.7), "67%"); assert.equal(UI.fmtNum(4), "4.00");
});

test("★ 固定題目：每一種回饋表都有 recommend 或 useful 那種跨年可以比的 key，照語言出字，選項也跟著語言", () => {
  for (const kind of ["post-event", "alumni-yearly", "pair-mentee", "pair-mentor"]) {
    const zh = UI.templateQuestions(kind, "zh"), en = UI.templateQuestions(kind, "en");
    assert.ok(zh.length >= 5, kind);
    assert.deepEqual(zh.map(q => q.key), en.map(q => q.key), `${kind} 兩個語言的 key 一樣`);
    assert.ok(zh.every(q => /^[a-z][a-z0-9_]{0,29}$/.test(q.key)), `${kind} 的 key 合法`);
    assert.ok(zh.every(q => q.label && q.label !== en.find(x => x.key === q.key).label), `${kind} 中英文字不一樣`);
    for (const q of zh) if (q.type === "single" || q.type === "multi") assert.ok(q.options.length >= 2, `${kind}.${q.key} 有選項`);
  }
  const pe = UI.templateQuestions("post-event", "en");
  assert.ok(pe.some(q => q.key === "recommend" && q.type === "scale" && q.required), "活動後回饋的 recommend 是必填的分數題");
  assert.ok(pe.some(q => q.key === "change" && q.type === "long"));
  assert.deepEqual(UI.templateQuestions("nope", "en"), []);
  // 年齡不是題目：填寫頁另外問「18 歲以下嗎」，不問生日（計畫 6b）。
  assert.ok(!pe.some(q => /birth|生日/i.test(q.label)));
});

test("結果統計：分數題平均與分布、單選計票、文字題列出來；CSV 匿名不印名字、印 key", () => {
  const qs = [{ id: "q1", key: "recommend", type: "scale", label: "Recommend?", scale_min: 1, scale_max: 5 }, { id: "q2", key: "first_time", type: "single", label: "First?", options: ["Yes", "No"] }, { id: "q3", key: "change", type: "long", label: "Change?" }];
  const rs = [{ id: "r1", answers: { q1: "5", q2: "Yes", q3: "shorter day" }, submitted_at: "2026-11-07", age_band: "under18" }, { id: "r2", answers: { q1: "3", q2: "No" }, submitted_at: "2026-11-07", age_band: "18plus", contact_ok: true }];
  const s = UI.summarize(qs, rs);
  assert.equal(s[0].avg, 4); assert.deepEqual(s[0].dist.map(d => d.n), [0, 0, 1, 0, 1]);
  assert.deepEqual(s[1].counts, [{ option: "Yes", n: 1 }, { option: "No", n: 1 }]);
  assert.equal(s[2].texts.length, 1);
  const csv = UI.resultsCSV(qs, rs, true);
  assert.match(csv, /^﻿When,Age,Contact ok,recommend · Recommend\?/);
  assert.doesNotMatch(csv, /Who/);
  assert.match(csv, /Under 18/); assert.match(csv, /yes/);
  assert.equal(UI.csvFilename("Winter Bootcamp 2027 · feedback"), "bt-winter-bootcamp-2027-feedback.csv");
  assert.match(UI.yearlyCSV([{ term_id: "2026-27", kind: "bootcamp", events: 1, registered: 40, attended: 30, responses: 22, recommend_avg: 4.3, useful_avg: null, changes: [{ event: "Winter", we_change: "shorter" }] }]), /2026-27,bootcamp,1,40,30,22,4.3,,Winter: shorter/);
});

test("名單：配對回饋只點名；名單的開關與比對跟內部表單一樣", () => {
  const PEOPLE = [{ id: "p1", name: "Alex Chen", team: "Marketing Team", rank: "member" }, { id: "p2", name: "Bea Lin", team: "Mentorship Team", rank: "director" }];
  assert.deepEqual(UI.peopleIn(PEOPLE, [{ kind: "team", value: "mentorship team" }]).map(p => p.id), ["p2"]);
  assert.deepEqual(UI.peopleIn(PEOPLE, [{ kind: "person", value: "p1" }, { kind: "rank", value: "director" }]).map(p => p.id), ["p1", "p2"]);
  let it = UI.toggleItem([], { kind: "person", value: "p1" }); it = UI.toggleItem(it, { kind: "person", value: "p1" });
  assert.deepEqual(it, []);
  assert.deepEqual(UI.audOf([{ role: "reader", kind: "person", value: "p2" }, { role: "editor", kind: "rank", value: "director" }], "reader"), [{ kind: "person", value: "p2" }]);
  assert.deepEqual(UI.findPeople(PEOPLE, "bea").map(p => p.id), ["p2"]);
});

test("畫面：記分卡頁印四個數字與上一場的差；一場活動的頁面有檢討框；配對回饋的名單頁沒有職級與 team 的 chip", () => {
  const ev = { id: "e1", kind: "bootcamp", term_id: "2026-27", title_zh: "冬令營", title_en: "Winter camp", starts_at: "2027-01-30T01:00:00Z", numbers: { registered: 40, attended: 30, attendance_rate: 75, recommend_avg: 4.2, recommend_n: 20, useful_avg: 3.9, responses: 22 }, review: { we_change: "shorter day 2" } };
  const prev = { id: "e0", kind: "bootcamp", title_en: "Summer camp", starts_at: "2026-06-06T01:00:00Z", numbers: { registered: 30, attended: 20, attendance_rate: 66.7, recommend_avg: 4.0, recommend_n: 15, useful_avg: 4.1, responses: 18 }, review: { we_change: "more alumni" } };
  const ov = UI.overviewHTML({ can_view: true, counts: { people: 250 }, events: [ev] }, "");
  assert.match(ov, /75%/); assert.match(ov, /4\.20/); assert.match(ov, /shorter day 2/); assert.match(ov, /2026-27/);
  const page = UI.eventHTML({ event: ev, previous: prev, can_edit: true, sessions: [], participation: [], forms: [], comments: [], scales: [], review: {} }, { boot: { terms: [], can_manage: true }, msg: "", busy: false });
  assert.match(page, /\+8%/, "出席率跟上一場比");
  assert.match(page, /\+0\.20/, "推薦分數跟上一場比");
  assert.match(page, /more alumni/, "上一場說要改的印出來問改了沒");
  assert.match(page, /name="we_change"/);
  assert.match(page, /data-act="part-add"/);
  const aud = UI.audienceHTML({ form: { kind: "pair-mentee", owner_name: "x" }, can_edit: true, can_manage: true }, [{ id: "p1", name: "A", team: "Mentorship Team", rank: "member" }], { reader: [], editor: [] }, { reader: [], editor: [] }, {}, "", false);
  assert.doesNotMatch(aud, /data-kind="team"/); assert.doesNotMatch(aud, /data-kind="rank"/);
  assert.match(aud, /tf-find/);
  const aud2 = UI.audienceHTML({ form: { kind: "post-event" }, can_edit: true, can_manage: true }, [{ id: "p1", name: "A", team: "Mentorship Team", rank: "member" }], { reader: [], editor: [] }, { reader: [], editor: [] }, {}, "", false);
  assert.match(aud2, /data-kind="team"/);
});

test("畫面：結果頁匿名不印名字、印未成年提醒；人的頁面有去向與移除；年度比較印 ✓ ✗", () => {
  const r = { form: { id: "f1", title: "Feedback", kind: "post-event", status: "open", anonymous: true, token: "abc", responses: 1 }, questions: [{ id: "q1", key: "recommend", type: "scale", label: "R", scale_min: 1, scale_max: 5 }], responses: [{ id: "r1", name: "", answers: { q1: "4" }, submitted_at: "2026-11-07", age_band: "under18" }], can_edit: true };
  const res = UI.resultsHTML(r, "", {});
  assert.doesNotMatch(res, /<th>Who<\/th>/); assert.match(res, /minors/i); assert.match(res, /Average 4/);
  assert.match(UI.formHeadHTML(r, "results"), /\/feedback\/\?t=abc/);
  const p = UI.personHTML({ person: { id: "p1", name: "學員丁", kind: "student", school: "中山女高" }, participation: [], pairs: [], outcomes: [{ id: "o1", kind: "admitted", institution: "UW", year: 2027, visibility: "internal", source: "mentorship" }], responses: [] }, { boot: { can_manage: true }, me: { pres: true }, msg: "" });
  assert.match(p, /UW/); assert.match(p, /data-act="forget"/); assert.match(p, /data-oadd/);
  const y = UI.yearlyHTML([{ term_id: "2026-27", kind: "bootcamp", events: 2, registered: 70, attended: 50, responses: 40, recommend_avg: 4.1, useful_avg: 3.8, changes: [{ event: "W", we_change: "a", change_happened: true }, { event: "S", we_change: "b", change_happened: false }] }], "");
  assert.match(y, /a ✓/); assert.match(y, /b ✗/); assert.match(y, /50\/70/);
});
