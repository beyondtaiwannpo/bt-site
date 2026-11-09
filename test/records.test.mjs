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
  assert.match(UI.yearlyCSV([{ term_id: "2026-27", kind: "bootcamp", title_en: "Winter", numbers: { registered: 40, attended: 30, responses: 22, recommend_avg: 4.3, recommend_n: 20 }, review: { we_change: "shorter" } }]), /2026-27,bootcamp,1,40,30,75,22,4.3,,Winter: shorter/);
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
  const EV = [
    { id: "w", term_id: "2026-27", kind: "bootcamp", team: "Curriculum Team", title_en: "W", numbers: { registered: 40, attended: 30, responses: 25, recommend_avg: 4.0, recommend_n: 20 }, review: { we_change: "a", change_happened: true } },
    { id: "s", term_id: "2026-27", kind: "bootcamp", team: "Curriculum Team", title_en: "S", numbers: { registered: 30, attended: 20, responses: 15, recommend_avg: 4.5, recommend_n: 10 }, review: { we_change: "b", change_happened: false } },
    { id: "f", term_id: "2025-26", kind: "bootcamp", team: "Curriculum Team", title_en: "F", numbers: { registered: 20, attended: 10, responses: 0 } },
    { id: "m", term_id: "2025-26", kind: "mentorship-term", team: "Mentorship Team", title_en: "M", numbers: { registered: 12, attended: 12 } },
  ];
  const y = UI.yearlyHTML({ boot: { events: EV }, yf: {}, msg: "" });
  assert.match(y, /a ✓/); assert.match(y, /b ✗/); assert.match(y, /50\/70/); assert.match(y, /10\/20/);
});

// 名錄（2026-12-03）：搜尋與篩選是純函式，假資料，沒有真人。
test("★ 名錄：搜尋忽略大小寫與空格；篩選身分、帳號、team、學校、畢業年、屆別、活動、國家；選項帶人數", () => {
  const L = [
    { id: "a", name: "En Lo", name_en: "En Lo", kind: "student", school: "TFG", grad_year: 2027, has_account: false, role: null, team: null, terms: ["2025-26"], events: ["e1"], countries: [], n: 1 },
    { id: "b", name: "Ann Chen", name_en: "Ann Chen", name_zh: "陳安", kind: "member", school: "", has_account: true, role: "cadre", team: "Curriculum Team, Marketing Team", terms: ["2025-26", "2026-27"], events: ["e1", "e2"], countries: ["US"], n: 2 },
    { id: "c", name: "Guest One", name_en: "Guest One", kind: "guest", school: "Wagor", has_account: true, role: "alumni", team: "", terms: ["2024-25"], events: [], countries: ["US", "Canada"], n: 0 },
  ];
  const ids = (q, f) => UI.filterDirectory(L, q, f).map(p => p.id);
  assert.deepEqual(ids("enlo"), ["a"]); assert.deepEqual(ids("陳"), ["b"]); assert.deepEqual(ids("wag"), ["c"]);
  assert.deepEqual(ids("", { kind: "member" }), ["b"]);
  assert.deepEqual(ids("", { role: "none" }), ["a"]); assert.deepEqual(ids("", { role: "alumni" }), ["c"]);
  assert.deepEqual(ids("", { team: "Marketing Team" }), ["b"]);
  assert.deepEqual(ids("", { school: "TFG" }), ["a"]); assert.deepEqual(ids("", { grad: "2027" }), ["a"]);
  assert.deepEqual(ids("", { term: "2025-26" }), ["a", "b"]); assert.deepEqual(ids("", { event: "e2" }), ["b"]);
  assert.deepEqual(ids("", { country: "US" }), ["b", "c"]); assert.deepEqual(ids("ann", { country: "Canada" }), []);
  const o = UI.dirOptions(L, [{ id: "e1", slug: "camp", title_en: "Camp" }, { id: "e2", slug: "fair", title_en: "Fair" }]);
  assert.deepEqual(o.team, [["Curriculum Team", 1], ["Marketing Team", 1]]);
  assert.deepEqual(o.event.map(x => [x[0], x[1], x[2]]), [["e1", 2, "Camp"], ["e2", 1, "Fair"]]);
  assert.deepEqual(o.role, [["alumni", 1], ["cadre", 1], ["none", 1]], "人數一樣就照字母排");
  assert.deepEqual(o.country, [["US", 2], ["Canada", 1]]);
});

test("★ 名錄是主畫面：三個分頁帶人數，重複的在自己那頁，篩選下拉與人數都在；沒跑遷移檔時說哪一支", () => {
  const dir = [{ id: "a", name: "Someone", kind: "student", school: "S", has_account: false, terms: [], events: [], countries: [], n: 0 }];
  const boot = { can_manage: true, duplicates: [{ a: "x", a_name: "A", a_kind: "student", b: "y", b_name: "A", b_kind: "guest" }], events: [], counts: { people: 1 } };
  const h = UI.peopleHTML(boot, { boot, dir, df: {}, pq: "", msg: "", ptab: "dir" });
  assert.match(h, /data-act="ptab" data-t="dups"/); assert.match(h, /Directory \(1\)|名錄（1）/); assert.match(h, /duplicates \(1\)|可能重複（1）/);
  assert.match(h, /class="rc-dfilter"/); assert.match(h, /data-dir-count/); assert.match(h, /data-act="open-person" data-id="a"/);
  assert.doesNotMatch(h, /data-act="dup-merge"/, "重複那一組不在名錄分頁上");
  const d = UI.peopleHTML(boot, { boot, dir, df: {}, pq: "", msg: "", ptab: "dups" });
  assert.match(d, /data-act="dup-merge"/); assert.doesNotMatch(d, /rc-dfilter/);
  const v = UI.peopleHTML({ ...boot, can_manage: false }, { boot: { ...boot, can_manage: false }, dir, df: {}, pq: "", msg: "", ptab: "dir" });
  assert.doesNotMatch(v, /data-t="add"/, "看的人沒有「加一個人」");
  const e = UI.peopleHTML(boot, { boot, dir: null, dirErr: UI.T("dir.noFn"), df: {}, pq: "", msg: "", ptab: "dir" });
  assert.match(e, /2026-12-03-records-directory\.sql/);
  const f = UI.peopleHTML(boot, { boot, dir, df: { kind: "member" }, pq: "", msg: "", ptab: "dir" });
  assert.match(f, /data-act="dir-clear"/); assert.match(f, /0 of 1|0 個人（全部 1）/);
});

// 年度比較（2026-12-04 改版）：篩選、每屆每種一列、合計、同一種活動一屆一欄；空的列與欄不印。
test("★ 年度比較：每屆每種一列加權平均、合計、篩選、比較表只留有數字的欄", () => {
  const EV = [
    { id: "w", term_id: "2026-27", kind: "bootcamp", team: "Curriculum Team", title_en: "W", numbers: { registered: 40, attended: 30, responses: 25, recommend_avg: 4.0, recommend_n: 20 }, review: { we_change: "a", change_happened: true } },
    { id: "s", term_id: "2026-27", kind: "bootcamp", team: "Curriculum Team", title_en: "S", numbers: { registered: 30, attended: 20, responses: 15, recommend_avg: 4.5, recommend_n: 10 } },
    { id: "f", term_id: "2025-26", kind: "bootcamp", team: "Curriculum Team", title_en: "F", numbers: { registered: 20, attended: 10, responses: 0 } },
    { id: "m", term_id: "2025-26", kind: "mentorship-term", team: "Mentorship Team", title_en: "M", numbers: { registered: 12, attended: 12 } },
    { id: "x", term_id: "", kind: "other", team: "", title_en: "X", numbers: {} },
  ];
  const rows = UI.yearlyRows(EV);
  assert.deepEqual(rows.map(r => [r.term_id, r.kind, r.events, r.registered, r.attended, r.rate, r.recommend_avg]), [
    ["2026-27", "bootcamp", 2, 70, 50, 71.4, 4.17], ["2025-26", "bootcamp", 1, 20, 10, 50, null], ["2025-26", "mentorship-term", 1, 12, 12, 100, null], ["", "other", 1, 0, 0, null, null]]);
  const t = UI.yearlyTotals(rows); assert.equal(t.events, 5); assert.equal(t.registered, 102); assert.equal(t.rate, 70.6);
  assert.deepEqual(UI.yearlyFilter(EV, { team: "Mentorship Team" }).map(e => e.id), ["m"]);
  assert.deepEqual(UI.yearlyFilter(EV, { term: "2026-27", kind: "bootcamp" }).map(e => e.id), ["w", "s"]);
  const c = UI.compareTable(rows, "attended");
  assert.deepEqual(c.terms, ["2026-27", "2025-26", ""]); assert.deepEqual(c.kinds, ["bootcamp", "mentorship-term", "other"]);
  assert.deepEqual(c.cells, [[50, 10, null], [null, 12, null], [null, null, 0]]);
  const r = UI.compareTable(rows, "recommend");
  assert.deepEqual(r.terms, ["2026-27"], "沒有推薦分數的屆別不印那一欄"); assert.deepEqual(r.kinds, ["bootcamp"]); assert.deepEqual(r.cells, [[4.17]]);
  const h = UI.yearlyHTML({ boot: { events: EV }, yf: { kind: "bootcamp", metric: "rate" }, msg: "" });
  assert.match(h, /class="rc-yfilter"/); assert.match(h, /data-act="yr-clear"/); assert.match(h, /3 events in this view|3 場活動/); assert.match(h, /class="total"/);
  assert.match(h, /rc-compare/); assert.match(h, /71\.4/); assert.doesNotMatch(h, /<td><span class="tag">Mentorship term/, "篩掉的種類不在表裡（下拉裡還在）");
  const one = UI.yearlyHTML({ boot: { events: EV.slice(0, 2) }, yf: {}, msg: "" });
  assert.doesNotMatch(one, /class="total"/, "只有一列就不印合計"); assert.doesNotMatch(one, /rc-compare/, "只有一屆沒有東西可以比");
});

// 可能重複兩欄並排、一個人的頁面加進活動、活動頁從名單選人（2026-12-05）。假資料。
test("★ 同名一群一張卡：N 欄、不一樣的格子標 diff、建議留的那欄有 tag、radio 留哪欄、checkbox 預設只勾判成 same 的（說過不是的不勾）；dupPick 讀得回來；沒有摘要退回名字", () => {
  const g = { key: "k", name: "Same Name", suggest: "y", not_same: [["x", "z"]],
    members: [
      { id: "x", name: "Same Name", name_en: "Same Name", kind: "student", school: "TFG", grad_year: 2027, has_account: false, emails: ["a@x.io"], vs_keep: { verdict: "same", same: ["school_same"], diff: [] }, n_events: 1, events: [{ title: "Camp", year: 2025, role: "student" }], n_pairs: 0, n_outcomes: 0, n_answers: 0, created_at: "2026-11-07T00:00:00Z" },
      { id: "y", name: "Same Name", name_zh: "同名", name_en: "Same Name", kind: "member", school: "TFG", has_account: true, role: "cadre", emails: [], n_events: 3, events: [], n_pairs: 1, n_outcomes: 1, n_answers: 2, created_at: "2026-11-01T00:00:00Z" },
      { id: "z", name: "same name", name_en: "same name", kind: "guest", school: "Wagor", has_account: false, emails: ["b@x.io", "c@x.io"], vs_keep: { verdict: "same", same: ["roster_twice"], diff: [] }, n_events: 0, events: [], n_pairs: 0, n_outcomes: 0, n_answers: 0, created_at: "2026-11-08T00:00:00Z" },
    ] };
  const h = UI.dupGroupHTML(g, false);
  assert.equal((h.match(/<thead><tr><th><\/th>(<th[\s\S]*?<\/th>){3}<\/tr>/g) || []).length, 1, "三欄");
  assert.match(h, /class="kept"[^>]*><a href="#people\/y"/); assert.match(h, /Suggested to keep|建議留這一欄/);
  assert.match(h, /name="keep-k" value="y"[^>]*checked/); assert.match(h, /name="merge-k" value="x"[^>]*checked/);
  assert.match(h, /name="merge-k" value="z" data-noauto="1" checked/);
  assert.match(h, /name="merge-k" value="y"[^>]*disabled/);
  assert.match(h, /a@x\.io/); assert.match(h, /b@x\.io<br>c@x\.io/); assert.match(h, /同名/);
  assert.match(h, /data-act="dup-merge" data-group="k"/); assert.match(h, /data-act="dup-not-same" data-group="k"/);
  assert.ok((h.match(/<tr class="diff">/g) || []).length >= 6);
  // dupPick 用假的 DOM
  const fake = { querySelector: sel => sel.includes("radio") ? { value: "y" } : null, querySelectorAll: () => [{ value: "x" }, { value: "z" }, { value: "y" }] };
  assert.deepEqual(UI.dupPick(fake), { keep: "y", drops: ["x", "z"] });
  // 2026-12-09：每欄跟建議留的那欄比的結果（資料庫的 vs_keep）決定預設勾不勾：same 勾、unsure 與 different 不勾；
  // 沒有 vs_keep（遷移檔還沒跑）退回瀏覽器的粗略版：email 跟中文名都不同算 different，中文名一樣算 same，其他 unsure。
  const g2 = { key: "k2", suggest: "y", members: [
      { id: "y", name: "Anika", name_zh: "安妮卡", emails: ["anika@a.io"] },
      { id: "p", name: "Anika", name_zh: "安妮可", emails: ["other@b.io"] },          // 兩樣都不同 → different，不勾
      { id: "q", name: "Anika", name_zh: "安妮卡", emails: ["other@b.io"] },          // 中文名一樣 → same，勾
      { id: "r", name: "Anika", name_zh: "安妮可", emails: ["ANIKA@a.io "] },         // 粗略版看不出 → unsure，不勾
      { id: "s", name: "Anika", name_zh: "安妮可", emails: [] },                      // 資料不夠 → unsure，不勾
      { id: "t", name: "Anika", emails: [], vs_keep: { verdict: "same", same: ["roster_twice", "school_same"], diff: [] } },   // 資料庫說 same → 勾
    ] };
  const h2 = UI.dupGroupHTML(g2, false);
  assert.match(h2, /name="merge-k2" value="p" data-noauto="1" aria-label/, "p 不預設勾");
  assert.match(h2, /name="merge-k2" value="q" data-noauto="1" checked/); assert.match(h2, /name="merge-k2" value="t" data-noauto="1" checked/);
  assert.match(h2, /name="merge-k2" value="r" data-noauto="1" aria-label/); assert.match(h2, /name="merge-k2" value="s" data-noauto="1" aria-label/);
  assert.equal((h2.match(/class="other"/g) || []).length, 1);
  assert.match(h2, /looks like someone else|像兩個人/); assert.match(h2, /not enough to tell|資料不夠判斷/); assert.match(h2, /on the same roster twice|同一場活動同一身分出現兩次/);
  assert.match(h2, /class="rc-verdict">2 columns look like the same person|class="rc-verdict">2 欄像同一個人/);
  assert.match(h2, /Column 4, 5 has too little data|第 4、5 欄資料不夠/); assert.match(h2, /Column 2 looks like someone else|第 2 欄像是別人/);
  assert.match(h2, /Merge 2 ticked columns into column 1|把勾起來的 2 欄併進第 1 欄/);
  assert.equal(UI.verdictOf(g2.members[1], g2.members[0]).verdict, "different"); assert.equal(UI.verdictOf(g2.members[5], g2.members[0]).verdict, "same"); assert.equal(UI.verdictOf(g2.members[0], g2.members[0]).verdict, "keep");
  assert.equal(UI.likelyOther(g2.members[1], g2.members[0]), true); assert.equal(UI.likelyOther(g2.members[3], g2.members[0]), false);
  // 鈕的字跟著勾選變；沒勾就叫人先勾
  const fakeBox = (ki, n) => ({ querySelectorAll: sel => sel.includes("radio") ? [{ checked: ki === 0, value: "y" }, { checked: ki === 1, value: "p" }, { checked: ki === 2, value: "q" }] : Array.from({ length: n }, (_, i) => ({ value: "d" + i })) });
  assert.match(UI.dupBtnLabel(fakeBox(2, 1)), /Merge 1 ticked column into column 3|把勾起來的 1 欄併進第 3 欄/);
  assert.match(UI.dupBtnLabel(fakeBox(0, 0)), /Tick a column to merge in first|先勾要併進去的那一欄/);
  // 判成兩個人的那幾對列在最下面，有「其實是同一個人」那顆鈕（act merge，左邊留）；只剩 set_aside 的群不算一張卡
  const aside = UI.dupAsideHTML([{ key: "k3", members: [], set_aside: [{ a: "m", b: "n", a_name: "Anika", b_name: "Anika", a_zh: "安一", b_zh: "安二", a_school: "TFG", b_school: null, a_emails: ["a@x.io"], b_emails: ["c@x.io"], why: ["email_disjoint", "zh_diff"] }] }], false);
  assert.match(aside, /data-act="merge" data-keep="m" data-drop="n"/); assert.match(aside, /different email|email 不同/); assert.match(aside, /安一/); assert.match(aside, /c@x\.io/);
  assert.equal(UI.dupAsideHTML([{ members: [], set_aside: [] }], false), "");
  const pp = UI.peopleHTML({ duplicates: [{ key: "k3", members: [], set_aside: [{ a: "m", b: "n", a_name: "A", b_name: "A", why: [] }] }], counts: {}, can_manage: true }, { ptab: "dups", dir: [] });
  assert.match(pp, /Possible duplicates \(0\)|可能重複（0）/); assert.match(pp, /kept apart \(1\)|沒放在一起（1 對）/);
  const plain = UI.dupGroupHTML({ a: "x", b: "y", a_name: "N", b_name: "N", a_kind: "student", b_kind: "guest" }, false);
  assert.match(plain, /data-act="dup-merge"/); assert.match(plain, /name="keep-x,y" value="x"[^>]*checked/);
});

test("★ 一個人的頁面：管的人有「加進一場活動」（活動、身分、狀態），成員預設講者；看的人沒有", () => {
  const boot = { can_manage: true, events: [{ id: "e1", title_en: "Camp", term_id: "2025-26", starts_at: "2025-06-01" }, { id: "e2", title_en: "Fair", term_id: "2026-27", starts_at: "2026-06-01" }] };
  const h = UI.personHTML({ person: { id: "p1", name: "Someone", kind: "member" }, participation: [], pairs: [], outcomes: [], responses: [] }, { boot, me: { pres: true }, msg: "" });
  assert.match(h, /data-paddev/); assert.match(h, /data-act="person-add-event"/); assert.match(h, /<option value="speaker" selected>/);
  assert.ok(h.indexOf('value="e2"') < h.indexOf('value="e1"'), "活動照日期新到舊");
  const v = UI.personHTML({ person: { id: "p1", name: "Someone", kind: "student" }, participation: [], pairs: [], outcomes: [], responses: [] }, { boot: { ...boot, can_manage: false }, me: {}, msg: "" });
  assert.doesNotMatch(v, /data-paddev/);
});

test("★ 活動頁加人：先有「名單上已經有的人」的清單，選到那一行就對得回 id", () => {
  const dir = [{ id: "a", name: "Ann Chen", kind: "student", school: "TFG", grad_year: 2027 }, { id: "b", name: "Ann Chen", kind: "guest", school: "Wagor" }, { id: "c", name: "No School", kind: "member" }];
  assert.equal(UI.dirLabel(dir[0]), "Ann Chen · TFG · 2027"); assert.equal(UI.dirLabel(dir[2]), "No School · Member");
  assert.equal(UI.dirMatch(dir, "Ann Chen · Wagor").id, "b"); assert.equal(UI.dirMatch(dir, "Ann Chen"), null, "只打名字沒選到不算（兩個 Ann Chen）");
  const ev = { event: { id: "e1", kind: "bootcamp", title_en: "Camp" }, can_edit: true, participation: [], forms: [], sessions: [] };
  const h = UI.eventHTML(ev, { boot: { terms: [], events: [] }, dir, msg: "", busy: false });
  assert.match(h, /list="rc-dir-list"/); assert.match(h, /<option value="Ann Chen · TFG · 2027">/);
});

test("★ 配對表單也有名單清單：mentor 與 mentee 各一格，選到就帶 id", () => {
  const dir = [{ id: "m", name: "Mentor One", kind: "member" }, { id: "s", name: "Student One", kind: "student", school: "TFG" }];
  const ev = { event: { id: "t1", kind: "mentorship-term", title_en: "Fall" }, can_edit: true, participation: [], forms: [], sessions: [], pairs: [] };
  const h = UI.eventHTML(ev, { boot: { terms: [], events: [], can_manage: true }, dir, msg: "", busy: false });
  assert.match(h, /name="mentor_who"[^>]*list="rc-dir-list"/); assert.match(h, /name="mentee_who"/);
  assert.equal(UI.dirMatch(dir, "Mentor One · Member").id, "m");
});
