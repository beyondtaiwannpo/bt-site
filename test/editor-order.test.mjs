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
  assert.match(ui, /\+ reviewHTML \+ sessHTML \+ partHTML \+ formsHTML \+ scalesHTML \+ commentsHTML \+ pairsHTML \+ settings;/, "分類用的那一段不再擋在檢討與出席前面");
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

test("★ 申請表與報名表的編輯頁：名稱與說明 → 題目 → 開放時間與狀態；兩個存檔的框都是 save-form", () => {
  const form = { id: "f1", title: "報名", intro: "", kind: "program", lang: "zh", status: "open", team: "Curriculum Team",
    opens_at: null, closes_at: null, notify_by: null, interview_url: "", max_responses: null, hidden_fields: [], confirm_mail: true };
  const h = ADM.formHTML(form, [], true, ["Curriculum Team"], "", false);
  assert.ok(at(h, 'id="ftitle"') < at(h, 'id="fintro"') && at(h, 'id="fintro"') < at(h, 'id="flang"'), "名稱、說明、語言在最上面那一段");
  const q = at(h, "<h2>題目");
  assert.ok(at(h, 'id="flang"') < q && at(h, 'id="fteam"') < q, "種類、語言、team 在題目前面（語言決定題目用哪一種寫）");
  for (const id of ["fopen", "fclose", "fnotify", "fcal", "fmax", "fhidden", "fconfirm", "fstatus"]) assert.ok(q < at(h, `id="${id}"`), `${id} 在題目後面`);
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
