// 後台其他編輯頁的順序與樣子（2026-11-23）。跑法：node --test test/*.test.mjs
// Paul 看完活動編輯頁之後說：「I want you to examine everything on all the pages that kind of do this... check for similar stuff in our website and fix them.」
// 活動編輯頁自己的順序在 test/event-editor.test.mjs。這一支守其他幾頁同一次重排改掉的地方：
//   1. 歷史之路的一站、BT 島的一則貼文：內容 → 照片 → 上線（以前上線在最上面，可是要照片勾了同意才按得下去）。
//   2. Records 的一場活動：「種類與屆別」在最下面；「加一場舊活動」的表單在頁首正下面。
//   3. 說明放在它講的那一格底下：信件文案的代換符號、補一筆舊紀錄的那一句、護照新的一格那一句。
//   4. 實習護照的分組編輯頁外殼跟其他編輯頁一樣。
//   5. Records 與內部表單那幾格本來就是台灣時間，標題要寫出來。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as SITE from "../admin/site/src/ui.js";
import * as RC from "../admin/records/src/ui.js";
import * as RCS from "../admin/records/src/strings.js";
import * as TFS from "../admin/team-forms/src/strings.js";
import * as PA from "../admin/passports/src/ui.js";
import * as PE from "../admin/people/src/ui.js";

const read = p => readFileSync(new URL("../" + p, import.meta.url), "utf8");
for (const M of [SITE, RC, PA, PE]) M.setLang("zh");
const PRES = { id: "u1", role: "cadre", board: "president", team: "Marketing Team", name: "P", senior: true, pres: true, ws: {} };
const at = (h, s) => { const i = h.indexOf(s); assert.ok(i >= 0, `找不到 ${s}`); return i; };

test("★ 歷史之路的一站：這一站 → 照片 → 上線；狀態寫在標題旁邊；新的一站只有內容", () => {
  const photo = { id: "p1", url: "https://x.supabase.co/storage/v1/object/public/history/m1/a.jpg", caption_zh: "", caption_en: "", consent: false, sort: 1 };
  const m = { id: "m1", slug: "2023-first", happened_on: "2023-06-01", title_zh: "第一屆探索營", title_en: "First", summary_zh: "", summary_en: "", body_zh: "", body_en: "", status: "draft", photos: [photo] };
  const h = SITE.historyEditHTML(m, PRES, "", false, null);
  assert.ok(at(h, 'data-autosave="hi-save"') < at(h, 'id="hi-file"') && at(h, 'id="hi-file"') < at(h, 'data-act="hi-ready"'), "內容 → 照片 → 上線");
  assert.ok(at(h, 'data-act="hi-ph-consent"') < at(h, 'data-act="hi-ready"'), "勾同意的地方在「準備好了」前面（沒勾按不下去）");
  assert.match(h, /<h1>第一屆探索營 <span class="tag draft">[^<]+<\/span><\/h1>/, "現在是什麼狀態寫在標題旁邊");
  assert.match(SITE.historyEditHTML({ ...m, status: "published", photos: [] }, PRES, "", false, null), /<h1>第一屆探索營 <span class="tag open">/);
  const fresh = SITE.historyEditHTML(null, PRES, "", false, null);
  assert.doesNotMatch(fresh, /hi-ready|hi-file|<h1>[^<]*<span class="tag/, "新的一站還沒有照片、上線、狀態");
});

test("★ BT 島的一則貼文：這一則 → 圖 → 放上島；狀態寫在標題旁邊", () => {
  const programs = [{ id: "pr1", team: "Marketing Team", teamId: "marketing", island_zh: "行銷島", island_en: "Marketing", name_zh: "IG", name_en: "IG" }];
  const r = { id: "r1", program: "pr1", team: "Marketing Team", url: "https://www.instagram.com/p/x/", kind: "post", caption_zh: "一句話", caption_en: "", posted_on: "2026-11-01", image_url: "https://x/a.jpg", consent: false, status: "draft" };
  const h = SITE.islandEditHTML(r, PRES, "", false, programs, null);
  assert.ok(at(h, 'data-autosave="ip-save"') < at(h, 'data-act="ip-consent"') && at(h, 'data-act="ip-consent"') < at(h, 'data-act="ip-publish"'), "內容 → 圖與同意 → 放上島");
  assert.ok(at(h, 'data-act="ip-publish"') < at(h, 'data-act="ip-del"'), "刪除還是在最後面");
  assert.match(h, /<h1>一句話 <span class="tag draft">[^<]+<\/span><\/h1>/);
  assert.doesNotMatch(SITE.islandEditHTML(null, PRES, "", false, programs, null), /ip-publish|ip-file/);
});

test("★ Records 的一場活動：「種類與屆別」排在最後；「加一場舊活動」的表單在頁首正下面", () => {
  const ui = read("admin/records/src/ui.js");
  // 2026-11-23 第二輪：檢討搬到留言後面（先看大家說了什麼再寫要改什麼），配對跟出席排在一起。
  // 2026-11-24：同一個順序收成四個分頁（出席、回饋、檢討、設定），那一排數字留在分頁外面。
  assert.match(ui, /key: "attendance",[^\n]*body: sessHTML \+ partHTML \+ pairsHTML,[^\n]*\n\s*\{ key: "feedback",[^\n]*body: formsHTML \+ scalesHTML \+ commentsHTML,[^\n]*\n\s*\{ key: "review",[^\n]*body: reviewHTML \},\n\s*\{ key: "settings",[^\n]*body: settings \},/, "誰來了 → 他們說了什麼 → 檢討 → 分類");
  const ev = RC.eventHTML({ event: { id: "e1", title_zh: "營隊", kind: "bootcamp", numbers: {} }, can_edit: true, sessions: [], participation: [], forms: [], review: null }, { boot: { terms: [], can_manage: true }, msg: "" });
  assert.deepEqual([...ev.matchAll(/<div class="tabp" data-ptabs="rc-event" data-tabp="([a-z]+)"( hidden)?>/g)].map(m => m[1] + (m[2] || "")), ["attendance", "feedback hidden", "review hidden", "settings hidden"]);
  for (const k of ["data-evmeta", "data-review", 'data-act="part-add"']) assert.ok(ev.includes(k), `${k} 還在畫面裡（藏起來，不是不畫）`);
  assert.ok(at(ev, "</header>") < at(ev, 'id="rc-event-tabs"'), "分頁那一排在頁首底下");
  const form = RC.pastEventFormHTML([], { kind: "bootcamp" }, false);
  const ov = RC.overviewHTML({ can_view: true, can_manage: true, counts: { people: 3 }, events: [{ id: "e1", title_zh: "營隊", numbers: {}, term_id: "2026-27", starts_at: "2026-07-01T00:00:00Z" }] }, "", form);
  assert.ok(at(ov, "</header>") < at(ov, "data-past") && at(ov, "data-past") < at(ov, '<table class="table rc-table"'), "表單在頁首與清單中間，不是在整頁最下面");
  assert.doesNotMatch(RC.overviewHTML({ can_view: true, counts: {}, events: [] }, ""), /data-past/, "沒按就沒有");
  assert.match(read("admin/records/src/main.js"), /UI\.overviewHTML\(S\.boot, S\.msg, S\.pastDraft \? UI\.pastEventFormHTML\(S\.boot\.terms, S\.pastDraft, S\.busy\) : ""\)/);
});

test("★ 說明放在它講的那一格底下：信件的代換符號在內文底下；補舊紀錄與護照新的一格那一句自己一行、在前面", () => {
  const mail = SITE.mailEditHTML("accepted", { subject: "s", body: "b" }, "", false);
  assert.ok(at(mail, 'id="mbody"') < at(mail, "{姓名}") && at(mail, "{姓名}") < at(mail, 'id="mbtn"'), "代換符號的說明在內文與按鈕那一格中間");
  const pn = PE.personNewHTML([{ id: "2025-26", status: "past" }], "", false, null);
  assert.ok(at(pn, "貼一整屆") < at(pn, 'id="pn-zh"'), "「貼一整屆比較快」在填任何一格之前就看得到");
  assert.equal((pn.match(/貼一整屆/g) || []).length, 1);
  const act = PA.activityEditHTML(null, 9, [{ month: 9 }], "", false, null);
  assert.match(act, /<div class="note">時間與範例照片，存好這一格之後再加。<\/div>/);
  assert.ok(at(act, 'id="ak-desc"') < at(act, "時間與範例照片") && at(act, "時間與範例照片") < at(act, 'id="ak-cb"'), "在說明底下，不是塞在「回頭看哪一格」的旁邊");
  assert.doesNotMatch(act, /<div class="two">\s*<div class="fmeta">/);
});

test("★ 實習護照的分組編輯頁：外殼跟其他編輯頁一樣（一個 section，按鈕在底部那一排）", () => {
  const h = PA.internGroupEditHTML({ key: "onboard", name_zh: "入門", name_en: "Onboard", tagline_zh: "", tagline_en: "", body_zh: "", body_en: "" }, "", false);
  assert.match(h, /<section class="section"><div class="two">/); assert.match(h, /<div class="form-foot"><button class="btn" data-act="ig-save" data-key="onboard">/);
  assert.doesNotMatch(h, /<div class="form">/, "沒有樣式的那個外殼拿掉了");
});

test("★ 本來就是台灣時間的那幾格，標題寫出來（Records 的開始、結束、截止；內部表單的截止）", () => {
  for (const [S, k] of [[RCS, "past.starts"], [RCS, "past.ends"], [RCS, "ed.closes"], [TFS, "ed.closes"]]) {
    assert.match(S.STRINGS[k].zh, /台灣時間/, k); assert.match(S.STRINGS[k].en, /Taiwan time/, k);
    for (const l of ["zh", "en"]) assert.doesNotMatch(S.STRINGS[k][l], /[—–]|\p{Extended_Pictographic}/u, k);
  }
  // 那幾格填的與印的本來就是固定 +08:00（這次沒有動），所以標題寫台灣時間是對的
  for (const p of ["admin/records/src/ui.js", "admin/team-forms/src/ui.js"]) assert.match(read(p), /export const fromLocal = s => s \? `\$\{s\}:00\+08:00` : "";/, p);
});

// ── 2026-11-23 第二輪：Paul 看過九件裡的三件建議，說「Yes, do those three」 ──
import * as ADM from "../admin/src/ui.js";
ADM.setLang("zh");

test("★ 申請表與報名表的編輯頁：題目一個分頁；「設定」分頁裡名稱與說明 → 開放時間與狀態；兩個存檔的框都是 save-form", () => {
  const form = { id: "f1", title: "報名", intro: "", kind: "program", lang: "zh", status: "open", team: "Curriculum Team",
    opens_at: null, closes_at: null, notify_by: null, interview_url: "", max_responses: null, hidden_fields: [], confirm_mail: true };
  const h = ADM.formHTML(form, [], true, ["Curriculum Team"], "", false);
  assert.ok(at(h, 'id="ftitle"') < at(h, 'id="fintro"') && at(h, 'id="fintro"') < at(h, 'id="flang"'), "名稱、說明、語言在最上面那一段");
  // 2026-11-24：題目自己一個分頁（Paul：「sign up form should be like that」），名稱與開關那兩段在「設定」分頁。兩塊都在畫面裡（readForm 照 id 讀整頁）。
  const qp = at(h, '<div class="tabp" data-ptabs="form" data-tabp="questions"'), sp = at(h, '<div class="tabp" data-ptabs="form" data-tabp="settings"');
  assert.ok(qp < at(h, "<h2>題目") && at(h, "<h2>題目") < sp, "題目在「題目」分頁裡");
  for (const id of ["ftitle", "fintro", "fkind", "flang", "fteam", "fopen", "fclose", "fnotify", "fcal", "fmax", "fhidden", "fconfirm", "fstatus"]) assert.ok(sp < at(h, `id="${id}"`), `${id} 在「設定」分頁裡`);
  assert.ok(at(h, 'id="fteam"') < at(h, 'id="fopen"'), "名稱與說明那一段在開放時間那一段上面");
  assert.ok(at(h, 'id="fopen"') < at(h, 'id="fstatus"'), "先填時間，最後才選狀態");
  assert.ok(at(h, 'id="fstatus"') < at(h, "/apply/?f=f1") && at(h, "/apply/?f=f1") < at(h, 'data-act="del-form"'), "對外連結在狀態底下，刪除在最底");
  assert.equal(h.split('<div data-autosave="save-form" data-id="f1">').length - 1, 2, "上下兩段各一個存檔的框");
  assert.equal(h.split('class="autosave" data-for="save-form"').length - 1, 2, "兩個框各有一行「改了就存」，存了才看得到回饋");
  const ro = ADM.formHTML(form, [], false, [], "", false);
  assert.doesNotMatch(ro, /class="autosave"|del-form/, "唯讀的沒有那行小字也沒有刪除");
  // main.js 照 id 讀整頁，所以哪一個框動了都存整份；這一句不成立的話，動上面那一段會把下面那一段存成空的。
  assert.match(read("admin/src/main.js"), /function readForm\(\) \{\s*const val = id => \{ const el = document\.getElementById\(id\)/);
});

test("★ 一個人的編輯頁：姓名在職級前面；頁面中間沒有第二顆「回名單」", () => {
  const terms = [{ id: "2026-27", status: "current" }];
  const p = { person_id: "p1", profile_id: "u2", role: "cadre", board_role: "member", name_zh: "王小明", name_en: "Ming", team: "Marketing Team", positions: [], workspaces: [] };
  const h = PE.personEditHTML(p, terms, "u1", true, "", false, null, [p], null, "a@example.com", []);
  assert.ok(at(h, 'id="pk-zh"') < at(h, 'id="pk-role"') && at(h, 'id="pk-role"') < at(h, 'id="pk-term"'), "姓名 → 職級 → 這一屆的職位");
  assert.equal(h.split('data-act="roster-back"').length - 1, 1, "只剩頁首那一顆");
  assert.match(h, /class="autosave" data-for="person-save"/);
});

test("★ 資源的編輯頁：名字 → 介紹 → 連結，種類、順序、team 在後面", () => {
  for (const r of [null, { id: "r1", title: "SAT 指南", blurb: "一句話", kind: "pdf", url: "https://drive.google.com/x", team: "", status: "draft", ord: 100 }]) {
    const h = SITE.resEditHTML(r, "", false);
    assert.ok(at(h, 'id="rtitle"') < at(h, 'id="rblurb"') && at(h, 'id="rblurb"') < at(h, 'id="rurl"'), "名字、介紹、連結");
    assert.ok(at(h, 'id="rurl"') < at(h, 'id="rkind"') && at(h, 'id="rkind"') < at(h, 'class="form-foot"'), "連結在種類前面");
    assert.equal(h.split('id="rurl"').length - 1, 1);
  }
});

// ── 2026-11-23 第三輪：剩下的六件，Paul 說「do all of them」 ──
import * as TF from "../admin/team-forms/src/ui.js";
import * as MK from "../admin/marketing/src/ui.js";
TF.setLang("zh"); MK.setLang("zh");
const n = (h, s) => h.split(s).length - 1;
// 假的畫面：兩個存檔的框，各有自己的格子。allValues 要兩個一起讀。
const fakeBox = (act, fields, doc) => ({ dataset: { autosave: act }, ownerDocument: doc, querySelectorAll: () => fields });
const fakeDoc = boxes => { const d = { querySelectorAll: sel => boxes.filter(b => sel === `[data-autosave="${b.dataset.autosave}"]`) }; for (const b of boxes) b.ownerDocument = d; return d; };

test("★ Records 的回饋表編輯頁：題目一個分頁；「設定」分頁裡名稱與說明 → 截止時間；兩個框一起讀，動哪一個都存整份", () => {
  const r = { form: { id: "f1", title: "回饋", intro: "", kind: "post-event", status: "draft", lang: "zh", anonymous: false, closes_at: null, responses: 0 }, can_edit: true, questions: [] };
  const S0 = { boot: { events: [], terms: [], can_manage: true }, questions: [], fx: {}, msg: "" };
  // 2026-11-24：「題目與設定」拆成兩個分頁。題目那一頁沒有設定的框，設定那一頁沒有畫布。
  const qv = RC.formEditHTML(r, { ...S0, sub: "questions" }), h = RC.formEditHTML(r, { ...S0, sub: "settings" });
  assert.match(qv, /<h2>題目/); assert.doesNotMatch(qv, /data-autosave="rc-save"|name="closes_at"|form-delete/);
  assert.doesNotMatch(h, /<h2>題目|data-fx-canvas/);
  assert.deepEqual(RC.SUBS, ["questions", "settings", "people", "results", "log"]);
  assert.deepEqual([...RC.formHeadHTML(r, "settings").matchAll(/class="subtab( on)?"[^>]*data-t="([a-z]+)">([^<]+)</g)].map(m => m[2] + (m[1] || "") + ":" + m[3]), ["questions:題目", "settings on:設定", "people:誰看得到", "results:結果", "log:改過什麼"]);
  assert.ok(at(h, 'name="title"') < at(h, 'name="lang"') && at(h, 'name="lang"') < at(h, 'name="anonymous"'), "名稱、語言、匿名");
  assert.ok(at(h, 'name="anonymous"') < at(h, 'name="closes_at"') && at(h, 'name="closes_at"') < at(h, 'data-act="form-delete"'), "截止時間在後面，刪除在最底");
  assert.equal(n(h, 'data-autosave="rc-save"'), 2); assert.equal(n(h, 'class="autosave" data-for="rc-save"'), 2);
  assert.match(h, /data-autosave="rc-save" data-part="top"/); assert.match(h, /data-autosave="rc-save" data-part="bottom"/);
  assert.match(read("admin/records/src/main.js"), /liveBox\(`\[data-autosave="rc-save"\]\[data-part="\$\{box\.dataset\.part \|\| "top"\}"\]`, box\)/, "存完把「存好了」印回動的那一個框");
  const top = fakeBox("rc-save", [{ name: "title", value: " 回饋 ", type: "text" }, { name: "anonymous", type: "checkbox", checked: true }]);
  const bottom = fakeBox("rc-save", [{ name: "closes_at", value: "2027-01-10T18:00", type: "datetime-local" }]);
  const canvas = fakeBox("q-save", [{ name: "title", value: "不該被讀到", type: "text" }]);
  fakeDoc([top, bottom, canvas]);
  const fromBottom = RC.readFormEditor(bottom).data, fromTop = RC.readFormEditor(top).data;
  assert.equal(fromBottom.title, "回饋", "從下面那個框存，名稱沒有被存成空的"); assert.equal(fromBottom.anonymous, true);
  assert.ok(fromTop.closes_at, "從上面那個框存，截止時間也在");
  assert.deepEqual(fromTop, fromBottom);
});

test("★ 內部表單的編輯頁：題目一個分頁；「設定」分頁裡名稱與說明 → 截止時間與規則；兩個框一起讀", () => {
  const a = { form: { id: "f1", title: "x", status: "draft", anonymous: false, allow_edit: true }, can_edit: true, can_edit_editors: true, engine: true, responses: 0, recipients: 0, questions: [] };
  const fx = { mode: "edit", logicOpen: new Set() };
  const qv = TF.questionsEditHTML(a, "", false, fx, "questions"), h = TF.questionsEditHTML(a, "", false, fx, "settings");
  assert.match(qv, /<h2>題目/); assert.doesNotMatch(qv, /data-autosave="tf-save"|name="closes_at"|tf-delete/);
  assert.equal(TF.questionsEditHTML(a, "", false, fx), qv, "沒說哪一個分頁就是「題目」");
  assert.doesNotMatch(h, /<h2>題目|data-fx-canvas/);
  assert.deepEqual(TF.SUBS, ["questions", "settings", "people", "results", "log"]);
  assert.deepEqual([...TF.editorHeadHTML(a, "questions").matchAll(/class="subtab( on)?"[^>]*data-t="([a-z]+)">([^<]+)</g)].map(m => m[2] + (m[1] || "")), ["questions on", "settings", "people", "results", "log"]);
  assert.match(read("admin/team-forms/src/main.js"), /UI\.questionsEditHTML\(S\.admin, S\.msg, S\.busy, S\.fx, S\.sub\)/);
  assert.ok(at(h, 'name="title"') < at(h, 'name="anonymous"') && at(h, 'name="anonymous"') < at(h, 'name="closes_at"'), "名稱與匿名在上面");
  assert.ok(at(h, 'name="closes_at"') < at(h, 'name="allow_edit"') && at(h, 'name="allow_edit"') < at(h, 'data-act="tf-delete"'), "截止時間與「可以改答案」在後面，刪除在最底");
  assert.equal(n(h, 'data-autosave="tf-save"'), 2); assert.equal(n(h, 'class="autosave" data-for="tf-save"'), 2);
  const top = fakeBox("tf-save", [{ name: "title", value: "x", type: "text" }, { name: "anonymous", type: "checkbox", checked: false }]);
  const bottom = fakeBox("tf-save", [{ name: "closes_at", value: "", type: "datetime-local" }, { name: "allow_edit", type: "checkbox", checked: true }]);
  fakeDoc([top, bottom]);
  assert.deepEqual(TF.readSettings(bottom), TF.readSettings(top));
  assert.equal(TF.readSettings(bottom).title, "x"); assert.equal(TF.readSettings(top).allow_edit, true);
});

test("★ 大學介紹貼文：最上面只有狀態那一行，送審、核可、下載在內容與預覽下面", () => {
  const p = { id: "p1", school: "Vanderbilt University", status: "in_review", data: {}, sources: {}, checks: {}, caption: "", created_by: "someone", review_note: "" };
  const boot = { can_edit: true, can_approve: true, me: "me", problems: { p1: [] }, hashes: {}, names: {} };
  const h = MK.postEditorHTML(p, boot, "", false, {}, {});
  assert.ok(at(h, 'id="cp-status"') < at(h, 'data-autosave="cp-save"'), "狀態在最上面");
  assert.ok(at(h, 'data-autosave="cp-save"') < at(h, 'class="cp-prev"') && at(h, 'class="cp-prev"') < at(h, 'id="cp-actions"'), "按鈕那一塊在內容與預覽下面");
  for (const act of ["cp-approve", "cp-return-open", "cp-dl-png", "cp-dl-pptx"]) assert.ok(at(h, 'id="cp-actions"') < at(h, `data-act="${act}"`), `${act} 在下面那一塊`);
  const top = h.slice(at(h, 'id="cp-status"'), at(h, 'data-autosave="cp-save"'));
  assert.doesNotMatch(top, /data-act="cp-(approve|submit|return-open|dl-png)"/, "最上面那一行沒有按鈕");
  assert.match(top, /data-act="cp-to-actions"/, "最上面有一顆直接捲到送審與下載的");
  assert.match(read("admin/marketing/src/main.js"), /act === "cp-to-actions"\) \{ const el = document\.getElementById\("cp-actions"\); if \(el\) el\.scrollIntoView/);
  const back = MK.postEditorHTML({ ...p, status: "draft", review_note: "SAT 要再查" }, boot, "", false, {}, {});
  assert.ok(at(back, "SAT 要再查") < at(back, 'data-autosave="cp-save"'), "被退回的原因留在最上面");
  const m = read("admin/marketing/src/main.js");
  assert.match(m, /st\.outerHTML = UI\.statusLineHTML\(np, S\.mkt\)/); assert.match(m, /ac\.outerHTML = UI\.statusPanel\(np, S\.mkt, S\.ui, S\.busy\)/, "存完兩塊都換");
});

test("★ 實習生的遊戲板：選格數 → 排棋盤 → 打開；開著的時候最上面有一行狀態", () => {
  const term = { id: "2026-27", title_zh: "這一屆" };
  const off = PA.boardAdminHTML(term, [], { term: "2026-27", size: 30, active: false }, null, null, "", false);
  assert.ok(at(off, 'id="bd-size"') < at(off, 'class="bgrid"') && at(off, 'class="bgrid"') < at(off, 'data-act="board-toggle" data-on="1"'), "打開的按鈕在棋盤後面");
  assert.doesNotMatch(off, /class="tag open"/);
  const on = PA.boardAdminHTML(term, [], { term: "2026-27", size: 30, active: true }, null, null, "", false);
  assert.ok(at(on, 'class="tag open"') < at(on, 'id="bd-size"') && at(on, 'class="bgrid"') < at(on, 'data-act="board-toggle" data-on="0"'), "開著：上面一行狀態，關掉的按鈕在最下面");
  const fresh = PA.boardAdminHTML(term, [], null, null, null, "", false);
  assert.doesNotMatch(fresh, /board-toggle/); assert.match(fresh, /存好之後這裡才有打開的按鈕/, "還沒存過的棋盤說清楚為什麼沒有按鈕");
});

test("★ 收支新增一筆：嘖嘖那一句自己一行，在按鈕上面", () => {
  const ui = read("admin/finance/src/ui.js");
  assert.match(ui, /<div class="mini fin-tip">\$\{esc\(T\("tx\.zeczec"\)\)\}<\/div>\s*<div class="form-foot"><button class="btn" data-act="tx-add"/);
  assert.doesNotMatch(ui, /<span class="sp"><\/span><span class="mini">\$\{esc\(T\("tx\.zeczec"\)\)\}/);
  assert.match(read("admin/admin.css"), /\.fin-tip\{/);
});
