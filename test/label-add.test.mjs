// 加一個標籤的時候問真正的紀錄；有紀錄了就不再印舊資料庫留下來的那一句（2026-11-26）。跑法：node --test test/*.test.mjs
// Paul：「i add a participation into this person as a speaker but the label doesn't show up like adding a label should interact with our stuff
//   for example if I add a member label it should asked me what terms and what teams, student, what events she attends, mentee what year what pairs」
// 這一支守三件事：
//   1. 畫面：選了哪一種就問那一種的紀錄（幹部問屆別與 team、學員／講者／志工／主辦問哪一場、mentor／mentee 問哪一期與對象），
//      紀錄裡沒有的時候可以退回只記一句；教授、招生官、聯絡人、實習生照舊只有那三格。
//   2. 主程式：存的是那一筆紀錄（職位、參與紀錄、配對），不另外寫一個標籤。
//   3. 遷移檔：同一種標籤有紀錄了，補充說明、年份、現在還是不是都照紀錄，不看「Old database:」那一句；那一句不刪。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as UI from "../admin/records/src/ui.js";

const read = p => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const PERSON = { person: { id: "p1", kind: "guest" }, labels: [], given: [] };
const EVENTS = [{ id: "e1", title_en: "Summer Bootcamp 2025", kind: "bootcamp", starts_at: "2025-06-07", term_id: "2024-25" }, { id: "e2", title_en: "Fall 2024 Mentorship", kind: "mentorship-term", starts_at: "2024-09-01", term_id: "2024-25" }];
const PT = { can_edit: true, terms: [{ id: "2026-27", status: "current" }, { id: "2025-26", status: "ended" }], teams: ["Curriculum Team"], positions: [] };
const base = { busy: false, boot: { events: EVENTS }, personTerms: PT, dir: [{ id: "p1", name: "Self", labels: [] }, { id: "p2", name: "Other Person", school: "TFG", labels: [] }] };
const addBlock = (S, person = PERSON) => { const h = UI.personLabelsHTML(person, S, true); return h.slice(h.indexOf('data-glabel="new"')); };

test("問什麼：幹部問屆別、四種活動身分問哪一場、mentor 與 mentee 問配對，其他四種只記一句", () => {
  assert.deepEqual(UI.LABELS.map(UI.labelHow), ["term", "note", "event", "pair", "pair", "event", "event", "event", "note", "note", "note"]);
  for (const k of Object.keys(UI.LABEL_HOW)) assert.ok(UI.LABELS.includes(k), k);
});

test("★ 幹部：問哪一屆、哪一季、team、職位；存的按鈕是 label-record，不是寫一個標籤", () => {
  const h = addBlock({ ...base, labNew: { label: "member" } });
  assert.match(h, /<select name="label" data-labnew>/); assert.match(h, /<option value="member" selected>/);
  assert.match(h, /<select name="term">/); assert.match(h, /<option value="2025-26" selected>/, "預設最近一個已經結束的屆");
  assert.match(h, /<select name="season">/); assert.match(h, /name="team" list="rc-lab-teams"/); assert.match(h, /name="title"/);
  assert.match(h, /data-act="label-record"/); assert.doesNotMatch(h, /data-act="label-save"/);
  assert.match(h, /name="note_only" data-labnote/, "紀錄裡沒有那一屆的時候可以只記一句");
});

test("★ 講者（學員、志工、主辦一樣）：問哪一場活動與到了沒", () => {
  for (const k of ["speaker", "student", "volunteer", "organizer"]) {
    const h = addBlock({ ...base, labNew: { label: k } });
    assert.match(h, /<select name="event_id">/, k); assert.match(h, /<option value="e1">Summer Bootcamp 2025/, k);
    assert.match(h, /<select name="status">/, k); assert.match(h, /data-act="label-record"/, k);
    assert.doesNotMatch(h, /name="detail"/, k + "：不問補充說明");
  }
});

test("★ mentor 與 mentee：問哪一期 mentorship（只列 mentorship 的活動）與配對的對象（名單裡的人，不含自己）", () => {
  const h = addBlock({ ...base, labNew: { label: "mentee" } });
  const evSel = h.slice(h.indexOf('<select name="event_id">'), h.indexOf("</select>", h.indexOf('<select name="event_id">')));
  assert.match(evSel, /Fall 2024 Mentorship/); assert.doesNotMatch(evSel, /Summer Bootcamp/, "有 mentorship 的活動就只列那幾場");
  assert.match(h, /name="other_who"[^>]*list="rc-lab-dir"/);
  const dl = h.slice(h.indexOf('<datalist id="rc-lab-dir">'), h.indexOf("</datalist>", h.indexOf('<datalist id="rc-lab-dir">')));
  assert.match(dl, /Other Person/); assert.doesNotMatch(dl, /value="Self/, "不能跟自己配對");
  // 一場 mentorship 的活動都沒有：列全部的活動，還是選得到
  const none = addBlock({ ...base, boot: { events: [EVENTS[0]] }, labNew: { label: "mentor" } });
  assert.match(none, /<option value="e1">Summer Bootcamp 2025/);
});

test("★ 退回只記一句：勾了、做不到、或本來就沒有對應紀錄的那四種", () => {
  const note = h => /name="detail"/.test(h) && /data-act="label-save" data-label=""/.test(h) && !/data-act="label-record"/.test(h);
  assert.ok(note(addBlock({ ...base, labNew: { label: "speaker", noteOnly: true } })), "勾了只記一句");
  assert.match(addBlock({ ...base, labNew: { label: "speaker", noteOnly: true } }), /data-labnote data-noauto="1" checked/);
  for (const k of ["professor", "admission_officer", "connection", "intern"]) { const h = addBlock({ ...base, labNew: { label: k } }); assert.ok(note(h), k); assert.doesNotMatch(h, /data-labnote/, k + "：沒有那個勾"); }
  // 不是 Co-President 或 Senior Adviser（或那一支遷移檔還沒跑）：幹部加不了職位，講一句，退回只記一句
  const cant = addBlock({ ...base, personTerms: { ...PT, can_edit: false }, labNew: { label: "member" } });
  assert.ok(note(cant)); assert.match(cant, /2027-01-17-term-seasons\.sql/);
  assert.ok(note(addBlock({ ...base, personTerms: null, labNew: { label: "member" } })));
  // 一場活動都沒有：講者沒得選
  assert.ok(note(addBlock({ ...base, boot: { events: [] }, labNew: { label: "speaker" } })));
  // 沒選過（預設是幹部）也畫得出來
  assert.match(addBlock({ ...base }), /<option value="member" selected>/);
});

test("★ 這一種 BT 已經給過一句了：這裡只補紀錄，不會出現第二個「只記一句」", () => {
  const person = { ...PERSON, given: [{ label: "speaker", detail: "Old database: Speaker, Spring 2025 (event not recorded)", since: 2025, until: 2025 }] };
  const h = addBlock({ ...base, labNew: { label: "speaker" } }, person);
  assert.match(h, /data-act="label-record"/); assert.doesNotMatch(h, /data-act="label-save"|data-labnote/);
  // 上面那一塊（改、拿掉那一句）還在
  const whole = UI.personLabelsHTML(person, { ...base, labNew: { label: "speaker" } }, true);
  assert.match(whole, /data-act="label-del" data-label="speaker"/);
  // 教授已經給過：講一句到上面改
  const prof = addBlock({ ...base, labNew: { label: "professor" } }, { ...PERSON, given: [{ label: "professor", detail: "NTU", since: null, until: null }] });
  assert.doesNotMatch(prof, /data-act="label-save"|data-act="label-record"/);
});

test("★ 主程式：label-record 存的是職位、參與紀錄或配對；換種類與勾只記一句只改畫面", () => {
  const m = read("admin/records/src/main.js");
  const h = m.slice(m.indexOf('if (act === "label-record")'), m.indexOf('if (act === "label-save" || act === "label-del")'));
  assert.match(h, /await D\.setPosition\(S\.id, v\.term, t\.zh, t\.en, v\.team\);\s*if \(v\.season\) await D\.setPositionSeason\(S\.id, v\.term, v\.team, v\.season\);/);
  assert.match(h, /await D\.savePair\(null, \{ event_id: v\.event_id, mentor_id: label === "mentor" \? S\.id : other\.id, mentee_id: label === "mentee" \? S\.id : other\.id \}\);/);
  assert.match(h, /await D\.setParticipation\(v\.event_id, \{ person_id: S\.id, role: label, status: how === "event" \? \(v\.status \|\| "attended"\) : "attended" \}\);/);
  assert.doesNotMatch(h, /setLabel/, "不另外寫 rc_labels，標籤從紀錄算");
  assert.match(h, /if \(how !== "term" && !v\.event_id\)/, "沒選活動不送");
  assert.match(h, /String\(v\.other_who \|\| ""\)\.trim\(\) && !other/, "對象打了字但不在名單上：不送，講一聲");
  assert.match(m, /e\.target\.closest\("select\[data-labnew\]"\)/); assert.match(m, /e\.target\.closest\("input\[data-labnote\]"\)/);
  assert.match(m, /S\.labNew = pick \? \{ label: pick\.value, noteOnly: false \}/, "換種類就把「只記一句」取消");
});

test("★ 遷移檔：有紀錄就照紀錄，舊的那一句不刪；兩份規則同一條；2027-01-16 的規則還在", () => {
  const src = read("supabase/migrations/2027-01-19-labels-prefer-records.sql"), sql = src.replace(/--[^\n]*/g, "");
  const of = sql.slice(sql.indexOf("function public.rc_labels_of(p_person uuid)"), sql.indexOf("function public.rc_label_codes_all()"));
  const all = sql.slice(sql.indexOf("function public.rc_label_codes_all()"), sql.indexOf("commit;"));
  const PH = "(e.label is not null and coalesce(g.detail like 'Old database:%', false))";
  assert.ok(of.includes(`case when ${PH} then e.since else coalesce(g.since, e.since) end as since`));
  assert.ok(of.includes(`case when ${PH} then null else g.until end as until`));
  assert.ok(of.includes(`when g.until is not null and not ${PH} then g.until >= cur.y`));
  assert.ok(of.includes(`case when ${PH} then coalesce(e.detail, '') else coalesce(nullif(g.detail, ''), e.detail, '') end as detail`));
  assert.ok(all.includes("when g.until_year is not null and not (e.has and coalesce(g.detail like 'Old database:%', false)) then g.until_year >= cur.y"));
  assert.doesNotMatch(sql.slice(0, sql.indexOf("commit;")), /\b(update|delete from|insert into|alter table)\b/i, "這一支不改資料");
  assert.doesNotMatch(sql, /kind = 'member' or/, "2027-01-16 的規則還在：kind 是 member 不算");
  assert.ok(of.includes("+ 3 <= cur.sy") && all.includes("e.first_sy + 3 <= cur.sy"), "三個學年以前的學員那一條還在");
  // 除了這一支加的那幾處，兩支函式跟 2027-01-16 那一版一字不差
  const strip = s => s.replace(/--[^\n]*/g, "").replace(/\s+/g, " ");
  const prev = read("supabase/migrations/2027-01-16-member-label-rule.sql");
  const cut = (s, a, b) => strip(s.slice(s.indexOf(a), s.indexOf(b)));
  const back = cut(src, "create or replace function public.rc_labels_of(p_person uuid)", "revoke all on function public.rc_labels_of(uuid)")
    .replace(`case when ${PH} then e.since else coalesce(g.since, e.since) end as since, case when ${PH} then null else g.until end as until,`, "coalesce(g.since, e.since) as since, g.until as until,")
    .replace(`and (${PH} or g.until is null or g.until >= cur.y)`, "and (g.until is null or g.until >= cur.y)")
    .replace(`when g.until is not null and not ${PH} then`, "when g.until is not null then")
    .replace(`case when ${PH} then coalesce(e.detail, '') else coalesce(nullif(g.detail, ''), e.detail, '') end as detail`, "coalesce(nullif(g.detail, ''), e.detail, '') as detail");
  assert.equal(back, cut(prev, "create or replace function public.rc_labels_of(p_person uuid)", "revoke all on function public.rc_labels_of(uuid)"));
  assert.match(read("scripts/db/smoke.sh"), /LPM=supabase\/migrations\/2027-01-19-labels-prefer-records\.sql/, "smoke.sh 有跑這一支");
});
