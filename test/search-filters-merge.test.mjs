// 後台的搜尋框與篩選、名錄上自己挑人合併、去向那一列刪得掉（2026-11-25）。跑法：node --test test/*.test.mjs
// Paul 2026-11-25：
//   「these are great, but like they're not supposed to be there. Instead, can you build maybe a filter icon to the right… Anything that has a search box should consist this function.」
//   「if I see two possible people that I think they're the same person, I can merge them by myself… there's no need to show this section, like the same name, different person. Just delete that.」
//   「how do I delete a school? For example, I see two Northwestern University from this person.」
// 這一支守：
//   1. 四個有篩選的搜尋框（紀錄的名錄、Internal 的名單、Money 的收支、活動清單）都是同一個樣子：一行搜尋框加右邊一顆「篩選」，
//      收著的時候不印任何下拉或 chip 選項；開著的篩選印成搜尋框底下可以按掉的 chip；那一顆上面有個數。
//   2. 名錄的合併：管的人才有；挑人的樣子每一列多一格勾選；比一比那張卡每一欄預設都勾、沒有「不是同一個人」那顆。
//   3. 一個人的頁面：去向那幾列也有刪除鈕（管的人才有）。
// 資料全是假的，沒有真人。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as UI from "../admin/records/src/ui.js";
import * as PE from "../admin/people/src/ui.js";
import * as FIN from "../admin/finance/src/ui.js";
import * as F from "../admin/src/ui.js";

const read = p => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const en = () => { UI.setLang("en"); PE.setLang("en"); FIN.setLang("en"); F.setLang("en"); };
en();

const DIR = [
  { id: "a", name: "Eva Sample", kind: "guest", labels: ["mentor"], school: "First High", has_account: false, terms: ["2023-24"], events: ["e1"], countries: [], n: 2, latest: "Tech A" },
  { id: "b", name: "Eva Sample", kind: "guest", labels: ["mentor", "speaker"], school: "FH", has_account: false, terms: ["2024-25"], events: [], countries: [], n: 2, latest: "Tech B", offer_speak: true },
  { id: "c", name: "Cy Other", kind: "member", labels: ["member"], school: "", has_account: true, role: "cadre", terms: [], events: [], countries: [], n: 0 },
];
const BOOT = { can_manage: true, events: [{ id: "e1", title: "January talk", title_en: "January talk", term_id: "2026-27" }], duplicates: [], counts: { people: 3 } };
const S0 = { boot: BOOT, me: { pres: true }, dir: DIR, df: {}, pq: "", msg: "", ptab: "dir", busy: false };

test("★ 名錄：篩選收在搜尋框右邊那一顆裡；收著不印下拉，開著印八個；開著的篩選印成可以按掉的 chip，那一顆上有個數", () => {
  const shut = UI.directoryHTML(S0);
  assert.match(shut, /<div class="fbx-row"><input type="search" id="rc-pfind"[^>]*aria-label="Search name or school"[^>]*><button type="button" class="fbx-btn" data-act="dir-filters" aria-expanded="false" aria-controls="rc-dfilters"><svg class="fbx-ic"/);
  assert.doesNotMatch(shut, /rc-dfilter"/, "收著的時候沒有任何下拉"); assert.doesNotMatch(shut, /data-act="dir-quick"/); assert.doesNotMatch(shut, /fbx-n/); assert.doesNotMatch(shut, /fbx-chips/);
  const open = UI.directoryHTML({ ...S0, dfOpen: true });
  assert.match(open, /aria-expanded="true"/); assert.match(open, /<div class="fbx-panel" id="rc-dfilters">/);
  for (const k of ["label", "role", "team", "school", "grad", "term", "event", "country"]) assert.match(open, new RegExp(`<select name="${k}" class="rc-dfilter"`), k);
  assert.equal((open.match(/class="rc-dfilter"/g) || []).length, 8); assert.match(open, /data-act="dir-quick" data-k="speak"/);
  assert.match(open, /<button type="button" class="btn ghost sm" data-act="dir-filters">Done<\/button>/);
  // 選了兩個：面板收著也看得到篩了什麼
  const on = UI.directoryHTML({ ...S0, df: { label: "speaker", speak: "1" } });
  assert.match(on, /class="fbx-btn on"[^>]*>[\s\S]*?<b class="fbx-n">2<\/b>/);
  assert.match(on, /<button type="button" class="chip sm on" data-act="dir-unset" data-k="label" aria-label="Remove filter: Label: Speaker">Label: Speaker ×<\/button>/);
  assert.match(on, /data-act="dir-unset" data-k="speak"[^>]*>Open to speaking ×</); assert.match(on, /1 of 3/); assert.match(on, /data-act="dir-clear"/);
  assert.deepEqual(UI.dirActive({ event: "e1", grad: "2020", role: "none" }, BOOT.events).map(c => c.text), ["Account: No account", "Graduation year: 2020", "Attended: January talk"]);
  assert.deepEqual(UI.dirActive({}, []), []); assert.deepEqual(UI.dirActive(null, null), []);
  const m = read("admin/records/src/main.js");
  assert.match(m, /if \(act === "dir-filters"\) \{ S\.dfOpen = !S\.dfOpen; render\(\); return; \}/);
  assert.match(m, /if \(act === "dir-unset"\) \{ const k = b\.dataset\.k; if \(UI\.DIR_FILTERS\.includes\(k\)\)/, "只拿掉認得的那幾個篩選");
});

test("★ 名錄的合併：管的人才有那一顆；挑人的樣子每一列多一格勾選；勾兩個才比得了；比一比那張卡每一欄都勾、沒有「不是同一個人」", () => {
  const plain = UI.directoryHTML(S0);
  assert.match(plain, /<button type="button" class="btn ghost sm rc-mergego" data-act="dir-merge-mode">Merge people<\/button>/); assert.doesNotMatch(plain, /rc-pick"/);
  assert.doesNotMatch(UI.directoryHTML({ ...S0, boot: { ...BOOT, can_manage: false } }), /dir-merge-mode/, "只看得到的人沒有");
  assert.doesNotMatch(UI.directoryHTML({ ...S0, boot: { ...BOOT, can_manage: false }, mergeMode: true, pick: ["a", "b"] }), /rc-pick"|rc-mergebar/, "就算狀態被改成在挑，看的人也不印");
  const mm = UI.directoryHTML({ ...S0, mergeMode: true, pick: ["a"] });
  assert.equal((mm.match(/class="rc-pick"/g) || []).length, 3); assert.match(mm, /<input type="checkbox" class="rc-pick" value="a" data-noauto="1" checked aria-label="Pick this row: Eva Sample">/);
  assert.match(mm, /data-act="dir-compare" disabled>Tick two people first</); assert.match(mm, /data-act="dir-unpick" data-id="a"/); assert.doesNotMatch(mm, /rc-mergego/);
  const two = UI.directoryHTML({ ...S0, mergeMode: true, pick: ["a", "b"] });
  assert.match(two, /data-act="dir-compare">Compare these 2</); assert.doesNotMatch(two, /data-dup="manual"/, "還沒比之前沒有那張卡");
  // rc_person 回的那一包轉成卡上的一欄
  const pa = UI.mergeMember({ person: { id: "a", name: "Eva Sample", name_en: "Eva Sample", kind: "guest", school: "First High", created_at: "2026-01-02T00:00:00Z" }, identities: [{ kind: "email", value: "Eva@X.io" }, { kind: "line", value: "eva" }],
    schools: [{ school: "First High" }], participation: [{ event: "January talk", starts_at: "2027-01-03T02:00:00Z", role: "mentor" }], pairs: [{}], outcomes: [{}, {}] });
  assert.deepEqual(pa.emails, ["eva@x.io"]); assert.deepEqual(pa.events, [{ title: "January talk", year: "2027", role: "mentor" }]); assert.equal(pa.n_pairs, 1); assert.equal(pa.n_outcomes, 2);
  const pb = UI.mergeMember({ person: { id: "b", name: "Eva Sample", kind: "guest", has_account: true, role: "alumni", login_email: "eva@y.io", created_at: "2026-03-01T00:00:00Z" } });
  assert.deepEqual(pb.emails, ["eva@y.io"]); assert.deepEqual(UI.mergeMember(null).events, []);
  assert.equal(UI.mergeSuggest([pa, pb]), "b", "有登入帳號的優先留"); assert.equal(UI.mergeSuggest([pa, { ...pb, has_account: false }]), "a", "再來是參與紀錄多的"); assert.equal(UI.mergeSuggest([]), "");
  const manual = { key: "manual", members: [pa, { ...pb, has_account: false }], suggest: "a" };
  const card = UI.directoryHTML({ ...S0, mergeMode: true, pick: ["a", "b"], manual });
  assert.match(card, /<div class="card dup" data-dup="manual">/); assert.match(card, /class="rc-verdict">You picked these\. Choose the column to keep \(now column 1\)/);
  assert.match(card, /name="merge-manual" value="b" data-noauto="1" checked/, "他自己挑的，預設就勾"); assert.match(card, /name="merge-manual" value="a" data-noauto="1" disabled/);
  assert.match(card, /data-act="dup-merge" data-group="manual">Merge 1 ticked column into column 1</); assert.doesNotMatch(card, /dup-not-same/);
  // 兩邊都有登入：不是 Co-President 的併不了（跟「可能重複」同一條規則），那一欄不勾
  const both = { key: "manual", members: [{ ...pa, has_account: true }, pb], suggest: "a" };
  assert.match(UI.dupGroupHTML(both, false, false, true), /name="merge-manual" value="b" data-noauto="1" disabled/); assert.match(UI.dupGroupHTML(both, false, true, true), /name="merge-manual" value="b" data-noauto="1" checked/);
  // 原本「可能重複」的卡沒有變：只勾判成 same 的，照舊有「不是同一個人」
  const auto = UI.dupGroupHTML({ key: "k", members: [pa, { ...pb, has_account: false }], suggest: "a" }, false, true);
  assert.doesNotMatch(auto, /name="merge-k" value="b" data-noauto="1" checked/); assert.match(auto, /dup-not-same/);
  const m = read("admin/records/src/main.js");
  assert.match(m, /const manual = b\.dataset\.group === "manual";/); assert.match(m, /const ids = \(S\.pick \|\| \[\]\)\.slice\(0, 6\); if \(ids\.length < 2\) return;/);
  assert.match(m, /if \(manual\) \{ S\.manual = null; S\.pick = \[\]; S\.mergeMode = false; \}/, "併完就離開挑人的樣子");
  assert.doesNotMatch(read("admin/records/src/ui.js"), /export function dupAsideHTML/, "「同名但不是同一個人」那一段拿掉了");
  assert.doesNotMatch(read("admin/records/src/strings.js"), /"dup\.aside/);
});

test("★ 一個人的頁面：去向那幾列也刪得掉（兩筆一樣的大學可以刪一筆），看的人沒有", () => {
  const d = { person: { id: "p", name: "Sam", kind: "guest" }, labels: [], profile: {}, identities: [],
    schools: [{ id: "s1", school: "KCIS", year_from: null, year_to: null, note: "", source: "import", current: true }],
    outcomes: [{ id: "o1", kind: "enrolled", institution: "Northwestern University", year: 2026, title: "", major: "Economics" }, { id: "o2", kind: "enrolled", institution: "Northwestern University", year: null, title: "", major: "Data Science" }],
    participation: [], pairs: [] };
  const h = UI.personHTML(d, { ...S0, view: "people", id: "p" });
  assert.match(h, /<b>Northwestern University<\/b> <span class="tag open">now<\/span>[\s\S]*?data-act="out-del" data-id="o1"/);
  assert.match(h, /data-act="out-del" data-id="o2"/); assert.match(h, /data-act="school-del" data-id="s1"/);
  const v = UI.personHTML(d, { ...S0, boot: { ...BOOT, can_manage: false }, view: "people", id: "p" });
  assert.doesNotMatch(v, /out-del|school-del/);
});

test("Internal 的名單：屆別、team、沒有帳號收在篩選那一顆裡；這一屆本身不算篩選", () => {
  const TERMS = [{ id: "2025-26", status: "past" }, { id: "2026-27", status: "current" }];
  const people = [
    { person_id: "p1", profile_id: "u1", name_en: "Ann One", role: "cadre", board_role: "member", team: "Marketing Team", positions: [{ term: "2026-27", title_en: "Associate, Marketing Team", team: "Marketing Team" }], workspaces: [] },
    { person_id: "p2", profile_id: null, name_en: "Ben Two", role: "", board_role: "", team: "", positions: [{ term: "2025-26", title_en: "Associate, Events Team", team: "Events Team" }], workspaces: [] },
  ];
  const shut = PE.rosterHTML(people, TERMS, "u9", true, "", false, null, []);
  assert.match(shut, /<div class="fbx-row"><input id="ro-search" type="search"[^>]*><button type="button" class="fbx-btn" data-act="roster-filters" aria-expanded="false" aria-controls="ro-filters">/);
  assert.doesNotMatch(shut, /class="chip[^"]*" data-act="roster-term"/); assert.doesNotMatch(shut, /fbx-chips/, "這一屆不算篩選");
  const open = PE.rosterHTML(people, TERMS, "u9", true, "", false, { open: true }, []);
  assert.match(open, /<div class="fbx-panel" id="ro-filters"><div class="fbx-group"><i>Term<\/i><div class="chips">/); assert.match(open, /<div class="fbx-group"><i>Team<\/i>/);
  assert.match(open, /data-act="roster-term" data-v="all"/);
  const on = PE.rosterHTML(people, TERMS, "u9", true, "", false, { term: "all", team: "Events Team", noacc: true }, []);
  assert.match(on, /<b class="fbx-n">3<\/b>/);
  assert.match(on, /class="chip sm on" data-act="roster-term" data-v="2026-27"[^>]*>Term: All terms ×</, "屆別拿掉是回到這一屆");
  assert.match(on, /class="chip sm on" data-act="roster-team" data-v=""[^>]*>Team: Events ×</); assert.match(on, /class="chip sm on" data-act="roster-noacc" data-v=""/);
  assert.match(read("admin/people/src/main.js"), /if \(act === "roster-filters"\) \{ S\.filter\.open = !S\.filter\.open; render\(\); return; \}/);
});

test("Money 的收支：五個下拉收在篩選那一顆裡；開著的篩選印成 chip，拿掉種類連類別一起清", () => {
  const ctx = { terms: [{ id: "2026-27", status: "current", starts_on: "2026-08-01", ends_on: "2027-07-31" }, { id: "2025-26", status: "past", starts_on: "2025-08-01", ends_on: "2026-07-31" }],
    accounts: [{ id: "a1", name_zh: "台新", name_en: "Taishin" }], categories: [{ id: "c1", kind: "expense", name_zh: "場地", name_en: "Venue" }], today: "2026-11-25" };
  const shut = FIN.txFiltersHTML({ term: "2026-27" }, ctx, 0, []);
  assert.match(shut, /<div class="fbx-row"><input id="f-q" type="search"[^>]*><button type="button" class="fbx-btn" data-act="f-filters" aria-expanded="false" aria-controls="fin-filters">/);
  assert.doesNotMatch(shut, /<select/); assert.doesNotMatch(shut, /fbx-chips/); assert.match(shut, /class="mini fin-count"/);
  const open = FIN.txFiltersHTML({ term: "2026-27", open: true }, ctx, 0, []);
  for (const a of ["f-term", "f-month", "f-kind", "f-account", "f-category"]) assert.match(open, new RegExp(`<select data-act="${a}"`), a);
  const on = FIN.txFiltersHTML({ term: "2025-26", month: "2026-03", kind: "expense", account: "a1", category: "c1" }, ctx, 0, []);
  assert.match(on, /<b class="fbx-n">5<\/b>/);
  for (const k of ["term", "month", "kind", "account", "category"]) assert.match(on, new RegExp(`class="chip sm on" data-act="f-unset" data-k="${k}"`), k);
  assert.match(on, /Taishin ×</); assert.match(on, /Venue ×</);
  const m = read("admin/finance/src/main.js");
  assert.match(m, /if \(act === "f-filters"\) \{ S\.filter\.open = !S\.filter\.open; render\(\); return; \}/);
  assert.match(m, /else if \(k === "kind"\) \{ S\.filter\.kind = ""; S\.filter\.category = ""; \}/);
});

test("四個地方用同一套樣式（.fbx），樣式只有 admin.css 一份；舊的那幾條拿掉了", () => {
  const css = read("admin/admin.css");
  for (const c of [".fbx-row{", ".fbx-btn{", ".fbx-n{", ".fbx-chips{", ".fbx-panel{", ".fbx-grid{", ".fbx-group{", ".fbx-foot{", ".rc-mergebar{", ".rc-pickrow{"]) assert.ok(css.includes(c), c);
  assert.doesNotMatch(css, /\.fin-filters|\.ev-find|\.rc-aside/);
  assert.match(css, /@media \(max-width:520px\)\{\.fbx-grid\{grid-template-columns:1fr\}/, "手機上一欄");
  for (const f of ["admin/records/src/ui.js", "admin/people/src/ui.js", "admin/finance/src/ui.js", "admin/src/ui.js"]) assert.match(read(f), /class="fbx-btn\$\{/, f);
});
