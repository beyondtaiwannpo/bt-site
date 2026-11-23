// 活動的講者、報名類型、對外那一頁的排版（2026-11-23）。跑法：node --test test/*.test.mjs
// Paul：「there are different types of ticket... And there is this speaker session. We can put photo in, and we can drag from our own database」
//       「Why is text like all the way to the left? And also I need the text to be like on a bold headline and stuff.」
// 這一支守五件事：
//   1. 後台新加的純函式（猜名字、圓圈裡的字、打到一半的值、講者與報名類型的 patch、報了幾個）。
//   2. 後台的畫面：講者一塊、報名類型一塊，誰看得到哪一顆；報名名單上的類型標籤；說明底下那一行怎麼打的提示。
//   3. 對外的活動頁：說明的排版（先逃脫再加標籤）、講者只印四樣、報名類型一種一顆按鈕、那一頁是一欄。
//   4. /apply/：先選一種再填表、p_ticket 只在選了的時候帶、三個新的錯誤講人話、換語言 f 與 ticket 都留著。
//   5. 約定：遷移檔、資料層、main.js、smoke.sh 之間的名字對得上（讀檔比對，不連資料庫；資料庫那一半在 scripts/db/smoke.sh）。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as F from "../admin/src/ui.js";
import * as FS from "../admin/src/strings.js";
import * as PUB from "../events/src/ui.js";
import * as A from "../apply/src/ui.js";

F.setLang("zh");
const read = p => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const count = (h, re) => (h.match(re) || []).length;
const WS = "custom:event-winter-camp-2027";
const ASSOC = { id: "u2", role: "cadre", board: "member", team: "Curriculum Team", name: "小安", senior: false, pres: false, ws: {} };
const VIEWER = { ...ASSOC, id: "u7", ws: { [WS]: "view" } };
const EDITOR = { ...ASSOC, id: "u6", ws: { [WS]: "edit" } };
const RECORDS = { ...ASSOC, id: "u8", ws: { [WS]: "edit", "custom:records": "view" } };
const SENIOR = { ...ASSOC, id: "u9", board: "president", senior: true, pres: true };
const EV = { id: "e1", slug: "winter-camp-2027", team: "Marketing Team", workspace_id: WS, form_id: "f1", title_zh: "2027 冬令營", title_en: "Winter Camp 2027",
  summary_zh: "", summary_en: "", body_zh: "", body_en: "", cover_url: null, cover_consent: false,
  starts_at: new Date(Date.now() + 864e5 * 30).toISOString(), ends_at: null, place: "台北", capacity: 40, status: "draft", published_at: null, kind: "bootcamp" };
const FORM = { id: "f1", status: "open", opens_at: null, closes_at: null, title: "2027 冬令營" };
const PIC = "https://abc.supabase.co/storage/v1/object/public/events/e1/1700000000000-sp1.jpg";
const SPEAKERS = [
  { id: "s1", person_id: "p1", display_name: "Annie", subject: "Computer Science", school: "UCLA", photo_url: PIC, consent: true, sort: 10 },
  { id: "s2", person_id: null, display_name: "小安", subject: "心理系", school: "台灣大學", photo_url: null, consent: false, sort: 20 },
];
const TICKETS = [
  { id: "11111111-1111-4111-8111-111111111111", name_zh: "學生", name_en: "Student", note_zh: "高中生本人", note_en: "For high school students", capacity: 20, taken: 3, used: 4, full: false, sort: 10 },
  { id: "22222222-2222-4222-8222-222222222222", name_zh: "家長", name_en: "Parent", note_zh: "", note_en: "", capacity: 0, taken: 0, used: 0, full: false, sort: 20 },
  { id: "33333333-3333-4333-8333-333333333333", name_zh: "老師", name_en: "Teacher", note_zh: "", note_en: "", capacity: 1, taken: 1, used: 1, full: true, sort: 30 },
];

// ── 1. 純函式 ──────────────────────────────────────────────────────────
test("evFirstName：英文名字取第一段，中文名字與單一個字的原樣帶入（讓編輯的人自己改短）", () => {
  assert.equal(F.evFirstName("Paul Wang"), "Paul");
  assert.equal(F.evFirstName("  Mary   Jane  O'Neil "), "Mary");
  assert.equal(F.evFirstName("Annie"), "Annie");
  assert.equal(F.evFirstName("王小明"), "王小明", "中文名字不亂切");
  assert.equal(F.evFirstName("小安 Chen"), "小安 Chen", "中英夾在一起的不猜");
  assert.equal(F.evFirstName(null), ""); assert.equal(F.evFirstName(""), "");
});

test("evInitial：圓圈裡印名字的第一個字，英文轉大寫，沒有名字是空的", () => {
  assert.equal(F.evInitial("annie"), "A"); assert.equal(F.evInitial("小安"), "小"); assert.equal(F.evInitial("  ben"), "B");
  assert.equal(F.evInitial(""), ""); assert.equal(F.evInitial(null), "");
});

test("evRowVals：畫面上打到一半的字蓋過資料庫的；沒打過就是資料庫的；都沒有是空字串", () => {
  assert.deepEqual(F.evRowVals({ display_name: "Annie", subject: "CS", school: null }, ["display_name", "subject", "school"]), { display_name: "Annie", subject: "CS", school: "" });
  assert.deepEqual(F.evRowVals({ display_name: "Annie", typed: { display_name: "An" } }, ["display_name", "subject"]), { display_name: "An", subject: "" });
  assert.deepEqual(F.evRowVals({ capacity: 20, typed: { capacity: "" } }, ["capacity"]), { capacity: "" }, "打成空的就是空的，不會跳回資料庫的值");
  assert.deepEqual(F.evRowVals(null, ["a"]), { a: "" });
});

test("evSpeakerPatch：名字空的回 null（畫面先擋）；頭尾的空白拿掉", () => {
  assert.equal(F.evSpeakerPatch({ display_name: "   " }), null); assert.equal(F.evSpeakerPatch(null), null);
  assert.deepEqual(F.evSpeakerPatch({ display_name: " Annie ", subject: " CS ", school: "" }), { display_name: "Annie", subject: "CS", school: "" });
  assert.deepEqual(Object.keys(F.evSpeakerPatch({ display_name: "A", person_id: "p1", consent: true })), ["display_name", "subject", "school"], "同意與連到誰不從這裡帶");
});

test("evTicketPatch：中英名稱至少一個；名額是 0 以上的整數，空的當 0；其他的講得出是哪裡不對", () => {
  assert.deepEqual(F.evTicketPatch({ name_zh: " 學生 ", name_en: "", capacity: "20", note_zh: " 高中生 " }).patch, { name_zh: "學生", name_en: "", note_zh: "高中生", note_en: "", capacity: 20 });
  assert.equal(F.evTicketPatch({ name_en: "Student", capacity: "" }).patch.capacity, 0, "名額沒填就是不限");
  assert.equal(F.evTicketPatch({ name_zh: " ", name_en: "" }).err, "err.evTkName");
  for (const bad of ["-1", "1.5", "abc", "1e3", "1234567"]) assert.equal(F.evTicketPatch({ name_zh: "學生", capacity: bad }).err, "err.evTkCap", bad);
  assert.equal(F.evTicketPatch(null).err, "err.evTkName");
  assert.ok(FS.STRINGS["err.evTkName"] && FS.STRINGS["err.evTkCap"]);
});

test("報名類型的名字照語言、報了幾個、滿了沒；誰看得到「從紀錄裡找人」", () => {
  assert.equal(F.evTicketName(TICKETS[0]), "學生"); assert.equal(F.evTicketName({ name_zh: "", name_en: "Guest" }), "Guest"); assert.equal(F.evTicketName(null), "");
  F.setLang("en"); assert.equal(F.evTicketName(TICKETS[0]), "Student"); assert.equal(F.evTicketName({ name_zh: "來賓", name_en: "" }), "來賓"); F.setLang("zh");
  assert.equal(F.evTicketFacts(TICKETS[0]), "已報名 3 / 20 人"); assert.equal(F.evTicketFacts(TICKETS[1]), "已報名 0 人");
  assert.equal(F.evTicketFull(TICKETS[2]), true); assert.equal(F.evTicketFull(TICKETS[0]), false); assert.equal(F.evTicketFull(TICKETS[1]), false, "不限名額的不會滿");
  assert.equal(F.evCanPickPeople(EDITOR), false, "只是這場活動「改」的人讀不到名錄，那一格不畫");
  assert.equal(F.evCanPickPeople(RECORDS), true); assert.equal(F.evCanPickPeople(SENIOR), true); assert.equal(F.evCanPickPeople(null), false);
});

// ── 2. 後台的畫面 ──────────────────────────────────────────────────────
test("★ 講者：每一位自己勾同意（沒勾的對外看不到）、可以改、可以放照片、可以排、可以拿掉；改不動的人整塊不畫", () => {
  const h = F.eventSpeakersHTML(EV, SPEAKERS, true, false, {});
  assert.match(h, /id="ev-speakers"><h2>講者<span class="hint">2<\/span>/);
  assert.match(h, /對外頁只放名字，不放姓，未成年的人不要放。每一位都要本人同意，勾了才會出現在對外頁。/, "那一行提醒");
  assert.equal(count(h, /<li class="ev-sp" data-sp-row data-id="s[12]">/g), 2);
  assert.match(h, new RegExp(`<img class="ev-sp-pic" src="${PIC.replace(/[.?/]/g, "\\$&")}" alt="">`), "有照片的印照片");
  assert.match(h, /<span class="ev-sp-pic" aria-hidden="true">小<\/span>/, "沒有照片的是一個圓加名字的第一個字");
  assert.match(h, /<input data-f="display_name" value="Annie" maxlength="60"/); assert.match(h, /<input data-f="subject" value="Computer Science"/); assert.match(h, /<input data-f="school" value="UCLA"/);
  assert.match(h, /data-act="ev-sp-consent" data-id="s1" checked><span>這個人同意把名字與照片放在對外頁<\/span>/);
  assert.match(h, /data-act="ev-sp-consent" data-id="s2"><span>/, "沒勾的就是沒勾");
  assert.match(h, /<span class="tag ok">活動上架後對外看得到<\/span> <span class="mini">從紀錄挑的<\/span>/, "活動還沒上架：勾了同意的寫上架後才看得到；從紀錄挑的有標");
  assert.match(h, /<span class="tag draft">對外看不到<\/span><\/div>/);
  assert.match(F.eventSpeakersHTML({ ...EV, status: "published" }, SPEAKERS, true, false, {}), /<span class="tag open">對外看得到<\/span>/);
  assert.match(h, /data-act="ev-sp-photo" data-id="s1">/); assert.match(h, /換一張照片/); assert.match(h, /加照片/);
  assert.equal(count(h, /data-act="ev-sp-photo-clear"/g), 1, "有照片的那一位才有「拿掉照片」");
  assert.match(h, /data-act="ev-sp-move" data-id="s1" data-dir="-1" disabled>往前/, "第一位不能再往前");
  assert.match(h, /data-act="ev-sp-move" data-id="s2" data-dir="1" disabled>往後/, "最後一位不能再往後");
  assert.equal(count(h, /data-act="ev-sp-save"/g), 2); assert.equal(count(h, /data-act="ev-sp-del"/g), 2);
  // 加一位：收著的一格，名字、主題、學校三格加一顆按鈕
  assert.match(h, /<details class="fold rc-fold" id="ev-sp-new"><summary>[\s\S]*加一位講者/);
  assert.match(h, /<div id="ev-sp-new-box" data-ev="e1">/); assert.match(h, /id="ev-sp-new-name" value=""/); assert.match(h, /data-act="ev-sp-add" data-id="e1">加進來/);
  // 打到一半的字重畫後還在
  assert.match(F.eventSpeakersHTML(EV, [{ ...SPEAKERS[0], typed: { display_name: "An", subject: "CS", school: "UCLA" } }], true, false, {}), /data-f="display_name" value="An"/);
  // 上傳中：那一位是進度條，沒有選檔那一格
  const up = F.eventSpeakersHTML(EV, SPEAKERS, true, true, { spUp: { id: "s2", pct: 45, name: "a.jpg" } });
  assert.match(up, /<progress value="45" max="100">/); assert.equal(count(up, /data-act="ev-sp-photo"/g), 1);
  // 還在載、遷移檔還沒跑、改不動
  assert.match(F.eventSpeakersHTML(EV, undefined, true, false, {}), /id="ev-speakers"><h2>講者<\/h2><div class="mini">載入中/);
  const noSql = F.eventSpeakersHTML(EV, null, true, false, {});
  assert.match(noSql, /2027-01-02-event-speakers-tickets\.sql/); assert.doesNotMatch(noSql, /ev-sp-add/);
  assert.equal(F.eventSpeakersHTML(EV, SPEAKERS, false, false, {}), "", "只有「看」的人整塊不畫（讀的門也是「改」）");
  assert.match(F.eventSpeakersHTML(EV, [], true, false, {}), /還沒有講者。/);
});

test("★ 從紀錄裡找人：讀得到名錄的人才有那一格；挑了只帶名字與學校進「加一位」；學員標「可能未成年」", () => {
  assert.doesNotMatch(F.eventSpeakersHTML(EV, SPEAKERS, true, false, { canPick: false }), /ev-sp-find|ev-sp-q|從紀錄裡找人/, "讀不到名錄的人沒有那一格，直接打字");
  const h = F.eventSpeakersHTML(EV, SPEAKERS, true, false, { canPick: true, spOpen: true, spQ: "wang",
    spFound: [{ id: "p9", name: "Paul Wang", school: "NTU", kind: "member" }, { id: "p8", name: "王小明", school: "建中", kind: "student" }],
    spDraft: { display_name: "Paul", school: "NTU", person_id: "p9", from: "Paul Wang" } });
  assert.match(h, /id="ev-sp-new" open>/);
  assert.match(h, /<input id="ev-sp-q" type="search" value="wang"/); assert.match(h, /data-act="ev-sp-find" data-id="e1">找/);
  assert.match(h, /<b>Paul Wang<\/b> <span class="mini">NTU<\/span> <span class="tag">成員<\/span> <button class="btn ghost sm" data-act="ev-sp-pick" data-id="p9">帶入/);
  assert.match(h, /<span class="tag warn">學員，可能未成年<\/span>/, "學員那一列有警告的標籤");
  assert.match(h, /帶入的是紀錄裡的「Paul Wang」。 <button class="btn quiet sm" data-act="ev-sp-unpick">不連到這個人/);
  assert.match(h, /id="ev-sp-new-name" value="Paul"/); assert.match(h, /<input data-f="school" value="NTU"/);
  assert.doesNotMatch(h, /data-f="person_id"/, "連到誰不是一格可以打的字，放在 main.js 的草稿裡");
  assert.match(F.eventSpeakersHTML(EV, [], true, false, { canPick: true, spFound: [] }), /紀錄裡沒有找到。直接在下面打名字也可以。/);
  assert.doesNotMatch(F.eventSpeakersHTML(EV, [], true, false, { canPick: true }), /ev-sp-found|紀錄裡沒有找到/, "還沒找過就不印結果");
  assert.match(F.eventSpeakersHTML(EV, [], true, false, { canPick: true, spFound: [{ id: "p1", name: '<img src=x onerror=1>', school: "", kind: "weird" }] }), /<b>&lt;img src=x onerror=1&gt;<\/b>/, "紀錄裡的名字也要逃脫");
});

test("★ 報名類型：一種一列、報了幾個、滿了有標；已經有人報的沒有「拿掉」的按鈕；改不動的人不畫", () => {
  const h = F.eventTicketsHTML(EV, TICKETS, true, false, {});
  assert.match(h, /<div class="ev-panel" id="ev-tickets"><h3>報名類型 <span class="hint">3<\/span><\/h3>/);
  assert.match(h, /都是免費的，沒有價錢。/, "講清楚這不是賣票");
  assert.equal(count(h, /<li class="ev-tk" data-tk-row data-id="/g), 3);
  assert.match(h, /<b>學生<\/b>・已報名 3 \/ 20 人<\/p>/); assert.match(h, /<b>家長<\/b>・已報名 0 人<\/p>/);
  assert.match(h, /<b>老師<\/b>・已報名 1 \/ 1 人 <span class="tag warn">額滿<\/span>/);
  assert.match(h, /<input data-f="name_zh" value="學生" maxlength="60"/); assert.match(h, /<input data-f="name_en" value="Student"/);
  assert.match(h, /<input data-f="capacity" type="number" min="0" step="1" inputmode="numeric" value="20">/);
  assert.match(h, /<input data-f="capacity" type="number" min="0" step="1" inputmode="numeric" value="0">/, "不限的印 0");
  assert.match(h, /已經有 4 人報這一種，刪不掉。不想再收就把名額改成現在的人數。/);
  assert.equal(count(h, /data-act="ev-tk-del"/g), 1, "只有沒人報的那一種有「拿掉」");
  assert.match(h, /data-act="ev-tk-del" data-id="22222222-2222-4222-8222-222222222222">拿掉這一種/);
  assert.equal(count(h, /data-act="ev-tk-save"/g), 3); assert.equal(count(h, /data-act="ev-tk-move"/g), 6);
  assert.match(h, /<details class="fold rc-fold" id="ev-tk-new"><summary>[\s\S]*加一種報名類型[\s\S]*<div id="ev-tk-new-box" data-ev="e1">[\s\S]*data-act="ev-tk-add" data-id="e1">加進來/);
  assert.match(F.eventTicketsHTML(EV, [], true, false, {}), /還沒有分類型，大家報的是同一種。/);
  assert.match(F.eventTicketsHTML(EV, [], true, false, { tkOpen: true, tkDraft: { name_zh: "學生", capacity: "5" } }), /id="ev-tk-new" open>[\s\S]*id="ev-tk-new-zh" value="學生"[\s\S]*data-f="capacity"[^>]*value="5"/, "填到一半的重畫後還在");
  assert.match(F.eventTicketsHTML(EV, null, true, false, {}), /2027-01-02-event-speakers-tickets\.sql/);
  assert.equal(F.eventTicketsHTML(EV, TICKETS, false, false, {}), ""); assert.equal(F.eventTicketsHTML(EV, undefined, true, false, {}), "", "還在載不畫");
});

test("★ 整頁：講者在內容與活動照片中間；報名類型在報名表那一塊下面、行前與當天上面；沒有報名表的活動沒有報名類型", () => {
  const rc = { event: { numbers: {} }, review: null, forms: [] };
  const h = F.eventEditHTML(EV, FORM, 3, EDITOR, "", false, [], [], null, rc, null, { photos: [], speakers: SPEAKERS, tickets: TICKETS });
  const at = s => { const i = h.indexOf(s); assert.ok(i >= 0, `找不到 ${s}`); return i; };
  assert.ok(at('data-autosave="ev-save"') < at('id="ev-speakers"') && at('id="ev-speakers"') < at('id="ev-photos"'), "講者在內容後面、照片前面");
  assert.ok(at('data-act="ev-form-status"') < at('id="ev-tickets"') && at('id="ev-tickets"') < at("行前與當天"), "報名類型接在報名表那一塊下面");
  assert.ok(at('id="ev-speakers"') > at('class="autosave" data-for="ev-save"'), "講者不在自動儲存的框裡（那幾格要按「存這一位」）");
  assert.doesNotMatch(F.eventEditHTML({ ...EV, form_id: null }, null, null, EDITOR, "", false, [], [], null, rc, null, { photos: [], speakers: [], tickets: TICKETS }), /id="ev-tickets"/, "沒有報名表就沒有報名類型");
  const viewer = F.eventEditHTML(EV, FORM, 3, VIEWER, "", false, [], [], null, rc, null, { photos: [], speakers: SPEAKERS, tickets: TICKETS });
  assert.doesNotMatch(viewer, /id="ev-speakers"|id="ev-tickets"|ev-sp-|ev-tk-/, "只有「看」的人兩塊都沒有");
  assert.doesNotMatch(F.eventEditHTML(EV, FORM, 3, EDITOR, "", false), /id="ev-tickets"/, "x 沒給也畫得出來（還在載，報名類型先不畫）");
  assert.match(F.eventEditHTML(EV, FORM, 3, EDITOR, "", false), /id="ev-speakers"><h2>講者<\/h2><div class="mini">載入中/);
});

test("★ 說明底下有一行怎麼打的提示（中英兩格各一行），唯讀的人沒有；報名名單上有類型的標籤", () => {
  const rc = { event: { numbers: {} }, review: null, forms: [] };
  const h = F.eventEditHTML(EV, FORM, 3, EDITOR, "", false, [], [], null, rc, null, {});
  assert.equal(count(h, /<\/textarea><span class="mini">一行開頭打「## 」會變成標題，前後各兩個星號 \*\*這樣\*\* 會變粗體，一行開頭打「- 」會變成清單，空一行是新的一段。<\/span><\/label>/g), 2);
  assert.doesNotMatch(F.eventEditHTML(EV, FORM, 3, VIEWER, "", false, [], [], null, rc, null, {}), /會變成標題/);
  assert.match(FS.STRINGS["ev.bodyHelp"].en, /Start a line with "## " for a heading, wrap words in two asterisks \*\*like this\*\* for bold, start a line with "- " for a list/);
  assert.doesNotMatch(read("admin/src/ui.js") + read("admin/src/main.js"), /from "\.\.\/\.\.\/events\//, "後台只要那一行提示，不 import 對外頁的排版函式");
  const app = { id: "a1", applicant_name: "小明", applicant_school: "建中", applicant_grade: "高二", applicant_email: "a@b.co", status: "received", submitted_at: "2026-11-01T00:00:00Z", answers: new Map() };
  const withT = F.appsHTML(FORM, [{ ...app, ticket_id: TICKETS[0].id, ticket: TICKETS[0] }, { ...app, id: "a2", ticket: null }], [], true, new Set(), "all", [], "", false);
  assert.equal(count(withT, /<span class="tag" data-ticket>報名類型：學生<\/span>/g), 1, "有類型的那一筆有標籤，分類型之前報的沒有");
  assert.match(F.appsHTML(FORM, [{ ...app, ticket: { id: "x", name_zh: '<b>壞</b>', name_en: "" } }], [], true, new Set(), "all", [], "", false), /報名類型：&lt;b&gt;壞&lt;\/b&gt;/);
});

test("★ 這一批新的字中英都有、沒有破折號、沒有 emoji；程式裡用到的鍵字典裡都有", () => {
  const src = read("admin/src/ui.js") + read("admin/src/main.js");
  const keys = new Set([...src.matchAll(/T\("((?:ev\.(?:sp|tk)|msg\.ev(?:Sp|Tk)|err\.ev(?:Sp|Tk)|confirm\.ev(?:Sp|Tk)|apps\.ticket|ev\.bodyHelp)[A-Za-z.]*)"/g)].map(m => m[1]));
  for (const k of ["ev.spPublic", "ev.spReady", "ev.spHidden", "ev.spPhotoPick", "ev.spPhotoChange", "ev.spKind.member", "ev.spKind.student", "ev.spKind.guest",
    "msg.evSpAdded", "msg.evSpSaved", "msg.evSpSavedReset", "msg.evSpConsentOn", "msg.evSpConsentOff", "msg.evSpMoved", "msg.evSpDeleted", "msg.evSpPhotoCleared",
    "msg.evTkAdded", "msg.evTkSaved", "msg.evTkMoved", "msg.evTkDeleted", "ev.tkCount", "ev.tkCountCap", "err.evTkName", "err.evTkCap"]) keys.add(k);
  assert.ok(keys.size > 60, `抓得到鍵（這條檢查自己沒壞），抓到 ${keys.size}`);
  for (const k of keys) { if (k.endsWith(".")) continue; assert.ok(FS.STRINGS[k], `字典裡沒有 ${k}`); assert.ok(FS.STRINGS[k].zh && FS.STRINGS[k].en, `${k} 少一種語言`); }
  const mine = Object.entries(FS.STRINGS).filter(([k]) => /^(ev\.(sp|tk|bodyHelp)|msg\.ev(Sp|Tk)|err\.ev(Sp|Tk)|confirm\.ev(Sp|Tk)|apps\.ticket)/.test(k));
  assert.ok(mine.length >= 70, `這一批的字抓到 ${mine.length} 句`);
  for (const [k, row] of mine) for (const l of ["zh", "en"]) {
    assert.doesNotMatch(row[l], /[—–]/, `${k} 的 ${l} 有破折號`);
    assert.doesNotMatch(row[l], /\p{Extended_Pictographic}/u, `${k} 的 ${l} 有 emoji`);
  }
  assert.doesNotMatch(mine.map(([, r]) => r.zh + r.en).join(""), /價格|票價|付款|NT\$|price is|pay /i, "報名類型沒有任何跟錢有關的字（只有一句說「沒有價錢」）");
});

// ── 3. 對外的活動頁 ────────────────────────────────────────────────────
test("★ richText：## 是小標題、**粗體**、連續的 - 是清單、空一行是新的一段、單一個換行還是換行", () => {
  assert.equal(PUB.richText("## 關於這一天\n第一行\n第二行\n\n新的一段"), "<h3>關於這一天</h3><p>第一行<br>第二行</p><p>新的一段</p>");
  assert.equal(PUB.richText("這是 **粗體** 和 **另一個**。"), "<p>這是 <b>粗體</b> 和 <b>另一個</b>。</p>");
  assert.equal(PUB.richText("- 一\n- 二\n- 三"), "<ul><li>一</li><li>二</li><li>三</li></ul>");
  assert.equal(PUB.richText("前言\n- 一\n- 二\n後面"), "<p>前言</p><ul><li>一</li><li>二</li></ul><p>後面</p>", "清單前後的字各自成段");
  assert.equal(PUB.richText("- 一\n\n- 二"), "<ul><li>一</li></ul><ul><li>二</li></ul>", "中間空一行就是兩份清單");
  assert.equal(PUB.richText("## **這一天**，你會做什麼？"), "<h3><b>這一天</b>，你會做什麼？</h3>", "標題裡的粗體");
  assert.equal(PUB.richText("- **分組**聊科系\n- 帶 **時間表** 回家"), "<ul><li><b>分組</b>聊科系</li><li>帶 <b>時間表</b> 回家</li></ul>", "清單裡的粗體");
  assert.equal(PUB.richText("說明\r\n第二行"), "<p>說明<br>第二行</p>", "Windows 的換行也認得");
  assert.equal(PUB.richText("  ## 有縮排的標題  "), "<h3>有縮排的標題</h3>");
  assert.equal(PUB.richText("##沒有空白不算標題\n-沒有空白不算清單\n#一個井號也不算"), "<p>##沒有空白不算標題<br>-沒有空白不算清單<br>#一個井號也不算</p>");
  assert.equal(PUB.richText("只有一個 ** 星號組不算，* 單顆也不算"), "<p>只有一個 ** 星號組不算，* 單顆也不算</p>");
  assert.equal(PUB.richText(""), ""); assert.equal(PUB.richText(null), ""); assert.equal(PUB.richText("\n\n  \n"), "");
});

test("★ richText：說明裡打的 HTML 一律只是字（先逃脫再加標籤）；沒有連結、沒有圖、沒有別的標籤", () => {
  const evil = "<script>alert(1)</script>\n## <img src=x onerror=alert(1)>\n- <a href=\"javascript:alert(1)\">點我</a>\n**<b onclick=x>粗</b>**\n[連結](https://evil.example) ![圖](https://evil.example/a.png) https://evil.example";
  const h = PUB.richText(evil);
  assert.doesNotMatch(h, /<script|<img|<a |onerror=alert\(1\)>|<b onclick/, "原本的標籤一個都沒有活下來");
  assert.match(h, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/); assert.match(h, /<h3>&lt;img src=x onerror=alert\(1\)&gt;<\/h3>/);
  assert.match(h, /<li>&lt;a href=&quot;javascript:alert\(1\)&quot;&gt;點我&lt;\/a&gt;<\/li>/);
  assert.match(h, /<b>&lt;b onclick=x&gt;粗&lt;\/b&gt;<\/b>/, "粗體裡面的字也是逃脫過的");
  assert.match(h, /\[連結\]\(https:\/\/evil\.example\) !\[圖\]\(https:\/\/evil\.example\/a\.png\) https:\/\/evil\.example/, "Markdown 的連結與圖不認，網址也不會自己變成連結");
  const tags = [...h.matchAll(/<\/?([a-z0-9]+)[^>]*>/g)].map(m => m[0]);
  for (const t of tags) assert.match(t, /^<\/?(h3|p|b|ul|li|br)>$/, `多了一個不該有的標籤：${t}`);
  assert.equal(PUB.richText("**a < b** & \"c\""), "<p><b>a &lt; b</b> &amp; &quot;c&quot;</p>");
});

test("★ 對外：一場活動那一頁是一欄；說明走 richText；多三個框（講者、報名、照片），沒有資料的時候跟原本一樣只有說明與報名按鈕", () => {
  const e = { slug: "info", team: "Curriculum Team", title_zh: "說明會", title_en: "Info session", summary_zh: "", summary_en: "", body_zh: "## 關於說明會\n內容 **重點**", body_en: "Body", cover_url: "https://x/c.jpg",
    starts_at: "2027-01-20T02:00:00Z", ends_at: null, place: "台北", capacity: 40, form_id: "f1", signup_open: true, signed_up: 12, is_full: false, is_past: false };
  const h = PUB.detailHTML(e, "zh");
  assert.match(h, /<section class="sec ev-one"><div class="sec-in"><div class="body">/, "那一段有 ev-one，CSS 把它排成一欄");
  assert.match(h, /<section class="sec ev-cover-sec">/);
  assert.match(h, /<div class="ev-text"><h3>關於說明會<\/h3><p>內容 <b>重點<\/b><\/p><\/div>/);
  assert.equal(count(h, /<div class="ev-speakers" data-ev-speakers hidden><\/div>/g), 1); assert.equal(count(h, /<div class="ev-photos" data-ev-gallery hidden><\/div>/g), 1);
  assert.match(h, /<div class="ev-signup" data-ev-signup><p><a class="cta" href="\.\.\/apply\/\?f=f1">報名<\/a> <span class="ev-note">12 \/ 40 人。報名要先登入，一分鐘。<\/span><\/p><\/div>/, "原本那一顆報名按鈕原樣包在框裡");
  const at = s => h.indexOf(s);
  assert.ok(at('class="ev-text"') < at("data-ev-speakers") && at("data-ev-speakers") < at("data-ev-signup") && at("data-ev-signup") < at("data-ev-gallery") && at("data-ev-gallery") < at("所有活動"), "說明、講者、報名、照片、回清單");
  assert.doesNotMatch(PUB.listHTML([e], "zh"), /ev-one|ev-speakers|ev-signup/, "清單那一頁沒動（它有 h2，照舊兩欄）");
  assert.match(PUB.detailHTML({ ...e, form_id: null }, "zh"), /<div class="ev-signup" data-ev-signup><\/div>/, "沒有報名表：那個框是空的");
  const page = read("events/index.html");
  assert.match(page, /\.ev-one \.sec-in,\.ev-cover-sec \.sec-in\{grid-template-columns:minmax\(0,1fr\)\}/, "一欄");
  assert.match(page, /\.ev-one \.rows,\.ev-one \.ev-text\{max-width:40em\}/, "字的那幾塊最寬 40em");
  assert.match(page, /\.sec-in\{display:grid;grid-template-columns:minmax\(0,\.62fr\) minmax\(0,1\.38fr\);/, "清單用的兩欄那一條沒有動");
  assert.match(page, /\.ev-text h3\{/); assert.match(page, /\.ev-text ul\{/); assert.match(page, /\.ev-text b\{font-weight:700\}/);
});

test("★ 對外：講者只印名字、主題、學校、照片四樣；沒有照片是一個圓加第一個字；沒有、載不到、形狀不對都回空字串", () => {
  const x = { speakers: [
    { name: "Annie", subject: "Computer Science", school: "UCLA", photo_url: "https://x/a.jpg", person_id: "p-secret", id: "s-secret", email: "annie@example.com", consent: true },
    { name: "小安", subject: "", school: "台灣大學", photo_url: null },
    { name: "Ben", subject: "Econ", school: "", photo_url: "http://x/not-https.jpg" },
    { name: "  ", subject: "沒有名字的不畫", school: "", photo_url: null }, null ] };
  const h = PUB.speakersHTML(x, "zh");
  assert.match(h, /^<h3>講者<\/h3><ul class="ev-sp-grid">/); assert.match(PUB.speakersHTML(x, "en"), /^<h3>Speakers<\/h3>/);
  assert.equal(count(h, /<li>/g), 3, "沒有名字的那一筆與空的那一筆不畫");
  assert.match(h, /<li><span class="ev-sp-face"><span aria-hidden="true">A<\/span><img src="https:\/\/x\/a\.jpg" alt="" loading="lazy" decoding="async" onerror="this\.remove\(\)"><\/span><b>Annie<\/b><span>Computer Science<\/span><span class="ev-sp-school">UCLA<\/span><\/li>/);
  assert.match(h, /<li><span class="ev-sp-face"><span aria-hidden="true">小<\/span><\/span><b>小安<\/b><span class="ev-sp-school">台灣大學<\/span><\/li>/, "沒有照片：圓裡是第一個字；沒有主題就不留空行");
  assert.match(h, /<span aria-hidden="true">B<\/span><\/span><b>Ben<\/b>/, "不是 https 的照片不畫");
  assert.doesNotMatch(h, /p-secret|s-secret|annie@example\.com|consent|person_id/, "物件裡就算多了別的鍵也不會被印出來");
  for (const bad of [null, undefined, {}, { speakers: [] }, { speakers: null }, { speakers: "x" }, [], { message: "Could not find the function" }, { photos: [{ url: "https://x/a.jpg" }] }]) assert.equal(PUB.speakersHTML(bad, "zh"), "", JSON.stringify(bad));
  assert.match(PUB.speakersHTML({ speakers: [{ name: '<script>x</script>', subject: '"><b>', school: "&", photo_url: 'https://x/a.jpg"><script>' }] }, "zh"),
    /<b>&lt;script&gt;x&lt;\/script&gt;<\/b><span>&quot;&gt;&lt;b&gt;<\/span><span class="ev-sp-school">&amp;<\/span>/, "每一格都逃脫");
  const page = read("events/index.html");
  assert.match(page, /\.ev-sp-grid\{[^}]*grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/, "桌機一排四位");
  assert.match(page, /@media \(max-width:600px\)\{\.ev-sp-grid\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/, "手機一排兩位");
  assert.match(page, /\.ev-sp-grid li > \*\{max-width:100%;overflow-wrap:anywhere\}/, "字太長就換行，不會往旁邊捲");
  assert.match(page, /\.ev-speakers\[hidden\]\{display:none\}/);
  assert.match(page, /\.ev-sp-face\{[^}]*border-radius:50%/, "照片是圓的");
});

test("★ 對外：報名類型一種一顆報名按鈕（帶 f 與 ticket）、有名額寫還有幾個、滿了寫額滿沒有按鈕；沒有類型或現在報不了就不畫", () => {
  const e = { slug: "camp", form_id: "f1", signup_open: true, is_full: false, is_past: false, signed_up: 4, capacity: 40 };
  const x = { tickets: TICKETS };
  const zh = PUB.ticketsHTML(e, x, "zh"), en = PUB.ticketsHTML(e, x, "en");
  assert.match(zh, /^<h3>報名類型<\/h3><ul class="ev-types">/); assert.match(en, /^<h3>Sign-up types<\/h3>/);
  assert.match(zh, /<b>學生<\/b><span>高中生本人<\/span><span class="ev-note">還有 17 個名額<\/span><\/span><a class="cta" href="\.\.\/apply\/\?f=f1&amp;ticket=11111111-1111-4111-8111-111111111111">報名<\/a>/);
  assert.match(en, /<b>Student<\/b><span>For high school students<\/span><span class="ev-note">17 places left<\/span>/);
  assert.match(zh, /<b>家長<\/b><\/span><a class="cta" href="\.\.\/apply\/\?f=f1&amp;ticket=22222222-2222-4222-8222-222222222222">報名<\/a>/, "不限名額的不寫還有幾個");
  assert.match(zh, /<b>老師<\/b><\/span><span class="ev-tag">額滿<\/span><\/li>/, "滿了的那一種沒有按鈕");
  assert.equal(count(zh, /class="cta"/g), 2);
  assert.match(zh, /<p class="ev-note">4 \/ 40 人。報名要先登入，一分鐘。<\/p>$/);
  assert.match(PUB.ticketsHTML(e, { tickets: [{ ...TICKETS[0], capacity: 4, taken: 3 }] }, "en"), /1 place left/);
  assert.match(PUB.ticketsHTML(e, { tickets: [{ ...TICKETS[0], capacity: 3, taken: 3, full: false }] }, "zh"), /<span class="ev-tag">額滿<\/span>/, "數字到了就算滿，不只看 full");
  // 不畫的時候回空字串，main.js 就不動原本那一顆報名按鈕
  for (const bad of [null, {}, { tickets: [] }, { tickets: null }, { photos: [] }]) assert.equal(PUB.ticketsHTML(e, bad, "zh"), "", JSON.stringify(bad));
  assert.equal(PUB.ticketsHTML({ ...e, signup_open: false }, x, "zh"), "", "還沒開放或關了：照原本那一行");
  assert.equal(PUB.ticketsHTML({ ...e, is_full: true }, x, "zh"), "", "活動整場額滿：照原本那一行");
  assert.equal(PUB.ticketsHTML({ ...e, is_past: true }, x, "zh"), ""); assert.equal(PUB.ticketsHTML({ ...e, form_id: null }, x, "zh"), "");
  assert.equal(PUB.ticketsHTML(e, { tickets: [{ id: 'x"><script>', name_zh: "壞" }] }, "zh"), "", "id 不是 uuid 的樣子就不畫");
  assert.match(PUB.ticketsHTML(e, { tickets: [{ ...TICKETS[1], name_zh: "<i>", note_zh: "<b>" }] }, "zh"), /<b>&lt;i&gt;<\/b><span>&lt;b&gt;<\/span>/);
  const m = read("events/src/main.js");
  assert.match(m, /put\(root\.querySelector\("\[data-ev-speakers\]"\), UI\.speakersHTML\(x, l\)\);/);
  assert.match(m, /const types = e \? UI\.ticketsHTML\(e, x, l\) : "", box = root\.querySelector\("\[data-ev-signup\]"\);\s*if \(types && box\) box\.innerHTML = types;/, "有類型才換掉，沒有就不動");
  assert.match(m, /if \(typeof window\.btKeepLang === "function"\) window\.btKeepLang\(\);\s*\}\s*function render/, "新畫的報名按鈕也補上語言");
  const page = read("events/index.html");
  assert.match(page, /u\.searchParams\.set\("lang", l\);/, "語言只改 lang 這一個參數，f 與 ticket 留著");
  const block = page.slice(page.indexOf("/* 一場活動那一頁是一欄"), page.indexOf("/* 活動照片（2026-11-23）"));
  assert.ok(block.length > 2000, "抓得到這一批的樣式");
  for (const c of block.match(/rgba\([^)]*\)/g) || []) assert.match(c, /^rgba\((16,42,134|255,196,108),/, `${c} 不是品牌色`);
  assert.doesNotMatch(block, /#[0-9a-fA-F]{3,8}\b/, "不寫死色碼");
});

// ── 4. /apply/ ────────────────────────────────────────────────────────
const AFORM = { id: "f1", kind: "program", title: "2027 冬令營", intro: "", closes_at: null, notify_by: null };
const AQS = [{ id: "q1", label: "你為什麼想參加", type: "long", required: true, options: [] }];

test("★ /apply/：活動有分類型，還沒選就只畫「先選一種」，沒有表單也沒有登入按鈕；滿了的沒有按鈕", () => {
  const h = A.formHTML(AFORM, AQS, "needIn", "", false, false, "", "", { tickets: TICKETS, picked: null });
  assert.match(h, /<div class="warn">這場活動分成幾種報名，先選一種。<\/div>/);
  assert.match(h, /<b>學生<\/b><span>高中生本人<\/span><span class="when">還有 17 個名額<\/span>/);
  assert.match(h, /<button class="btn sm" data-act="ticket-pick" data-id="11111111-1111-4111-8111-111111111111">選這一種<\/button>/);
  assert.equal(count(h, /data-act="ticket-pick"/g), 2); assert.match(h, /<b>老師<\/b><\/span>\s*<span class="tagline">額滿<\/span>/);
  assert.doesNotMatch(h, /你為什麼想參加|data-act="signin"|fx-run/, "還沒選之前不畫題目、不畫登入");
  assert.doesNotMatch(A.formHTML(AFORM, AQS, "signedIn", "", false, false, "", "", { tickets: TICKETS, picked: null }), /fx-run/, "登入的人也是先選");
  const en = A.formHTML(AFORM, AQS, "needIn", "", false, true, "", "", { tickets: TICKETS, picked: null });
  assert.match(en, /This event has more than one way to sign up\. Pick one first\./); assert.match(en, /<b>Student<\/b>/); assert.match(en, /17 places left/); assert.match(en, />Choose this<\/button>/); assert.match(en, />Full<\/span>/);
  const allFull = A.formHTML(AFORM, AQS, "needIn", "", false, false, "", "", { tickets: [TICKETS[2]], picked: null });
  assert.match(allFull, /每一種都額滿了，謝謝你想參加。/); assert.doesNotMatch(allFull, /ticket-pick/);
});

test("★ /apply/：選好了印一行「你報名的是」加「換一種」，下面照原本的畫；沒有分類型的活動這一頁一個字都沒變", () => {
  const picked = { tickets: TICKETS, picked: TICKETS[1].id };
  const needIn = A.formHTML(AFORM, AQS, "needIn", "", false, false, "", "", picked);
  assert.match(needIn, /<p class="tk-yours">你報名的是：<b>家長<\/b> <button class="quiet" data-act="ticket-clear">換一種<\/button><\/p>/);
  assert.match(needIn, /data-act="signin"/); assert.match(needIn, /你為什麼想參加/); assert.doesNotMatch(needIn, /ticket-pick/);
  const run = A.formHTML(AFORM, AQS, "signedIn", "", false, true, "", "", picked);
  assert.match(run, /You are signing up as: <b>Parent<\/b> <button class="quiet" data-act="ticket-clear">Change<\/button><\/p><div id="fx-run">/);
  assert.doesNotMatch(A.formHTML(AFORM, AQS, "signedIn", "", false, false, "", "", { tickets: [TICKETS[0]], picked: TICKETS[0].id }), /ticket-clear/, "只有一種就沒有「換一種」");
  for (const st of ["needIn", "signedIn", "needProfile", "already", "closed"]) {
    const before = A.formHTML(AFORM, AQS, st, "", false, false, "", "full");
    assert.equal(A.formHTML(AFORM, AQS, st, "", false, false, "", "full", { tickets: [], picked: null }), before, `${st}：沒有分類型跟原本一模一樣`);
    assert.equal(A.formHTML(AFORM, AQS, st, "", false, false, "", "full", undefined), before);
  }
  assert.doesNotMatch(A.formHTML(AFORM, AQS, "already", "", false, false, "", "", { tickets: TICKETS, picked: null }), /tklist|tk-yours/, "已經送過的不再請他選");
  assert.doesNotMatch(A.formHTML(AFORM, AQS, "closed", "", false, false, "", "full", { tickets: TICKETS, picked: null }), /tklist|tk-yours/);
  assert.match(A.ticketsHTML([{ ...TICKETS[1], name_zh: "<i>x</i>" }], null, false), /<b>&lt;i&gt;x&lt;\/i&gt;<\/b>/);
});

test("ticketFromUrl、ticketLeft、ticketIsFull：網址上的類型要是這份表單的、還沒滿才算數", () => {
  assert.equal(A.ticketFromUrl(TICKETS, TICKETS[0].id), TICKETS[0].id);
  assert.equal(A.ticketFromUrl(TICKETS, TICKETS[2].id), null, "滿了的不算，回去先選一種");
  assert.equal(A.ticketFromUrl(TICKETS, "00000000-0000-0000-0000-000000000000"), null, "不是這份表單的不算");
  assert.equal(A.ticketFromUrl(TICKETS, null), null); assert.equal(A.ticketFromUrl([], TICKETS[0].id), null); assert.equal(A.ticketFromUrl(null, "x"), null);
  assert.equal(A.ticketLeft(TICKETS[0], false), "還有 17 個名額"); assert.equal(A.ticketLeft(TICKETS[0], true), "17 places left");
  assert.equal(A.ticketLeft({ capacity: 2, taken: 1 }, true), "1 place left"); assert.equal(A.ticketLeft(TICKETS[1], false), "", "不限的不寫");
  assert.equal(A.ticketLeft({ capacity: 2, taken: 5 }, false), "還有 0 個名額", "不會印負的");
  assert.equal(A.ticketIsFull(TICKETS[2]), true); assert.equal(A.ticketIsFull({ capacity: 2, taken: 2, full: false }), true); assert.equal(A.ticketIsFull(TICKETS[1]), false); assert.equal(A.ticketIsFull(null), false);
});

test("★ /apply/：三個新的錯誤講人話（中英都有）；ticket_full 不會被當成整場額滿", () => {
  assert.equal(A.says({ message: "ticket_required" }, false), "這場活動要先選一種報名類型，選好再送出。");
  assert.equal(A.says({ message: "ticket_required" }, true), "Pick a sign-up type for this event, then submit again.");
  assert.equal(A.says({ message: "bad_ticket" }, false), "這個報名類型不是這場活動的，重新選一次。");
  assert.equal(A.says({ message: "bad_ticket" }, true), "That sign-up type does not belong to this event. Please pick again.");
  assert.equal(A.says({ message: "ticket_full" }, false), "你選的那一種剛剛額滿了，換一種試試看。你填的答案還在。");
  assert.equal(A.says({ message: "ticket_full" }, true), "The type you picked has just filled up. Try another one. Your answers are still here.");
  assert.match(A.says({ message: "full" }, false), /這一份已經收滿了/, "整場額滿那一句照舊");
  assert.match(A.says({ message: "email_used" }, false), /這個 email 已經送過/);
});

test("★ /apply/ 的 main.js：有選才帶 p_ticket；選了寫進網址；換語言只改 lang，f 與 ticket 都留著；出錯回到先選一種", () => {
  const m = read("apply/src/main.js"), page = read("apply/index.html");
  assert.match(m, /if \(S\.ticket\) args\.p_ticket = S\.ticket;/, "活動沒有分類型的時候不帶，舊的資料庫也收得到");
  assert.match(m, /supabase\.rpc\("public_form_tickets", \{ p_form: id \}\)/);
  assert.match(m, /return !error && Array\.isArray\(data\) \? data : \[\];\s*\} catch \(e\) \{ return \[\]; \}/, "問不到就是沒有類型，照原本直接填表");
  assert.match(m, /S\.tickets = await loadTickets\(id\);\s*S\.ticket = UI\.ticketFromUrl\(S\.tickets, ticketId\(\)\);/);
  assert.match(m, /if \(id\) u\.searchParams\.set\("ticket", id\); else u\.searchParams\.delete\("ticket"\);\s*u\.searchParams\.set\("lang", isEn\(\) \? "en" : "zh"\);\s*history\.pushState\(\{\}, "", u\.pathname \+ u\.search\);/, "只動 ticket 與 lang，f 留著");
  assert.match(m, /if \(u\.searchParams\.get\("lang"\) !== l\) \{ u\.searchParams\.set\("lang", l\); history\.replaceState\(history\.state, "", u\.pathname \+ u\.search \+ u\.hash\); \}/, "換語言：網址只改 lang");
  assert.match(m, /if \(\/ticket_full\|bad_ticket\|ticket_required\/\.test\(String\(err && err\.message\)\)\) \{/);
  assert.match(m, /S\.tickets = await loadTickets\(S\.form\.id\); S\.ticket = null; ticketToUrl\(null\);/);
  assert.match(m, /UI\.formHTML\(S\.form, S\.questions, st, S\.msg, S\.busy, isEn\(\), "", S\.reason, \{ tickets: S\.tickets, picked: S\.ticket \}\)/);
  for (const act of ["ticket-pick", "ticket-clear"]) assert.match(m, new RegExp(`act === "${act}"`));
  assert.match(m, /function render\(\) \{\s*paint\(\);\s*if \(typeof window\.btKeepLang === "function"\) window\.btKeepLang\(\);\s*\}/, "每次畫完把語言補進新的連結");
  // 這一頁的 keepLang 原本會把 ? 後面整段換掉（f 就不見了），改成只動 lang
  assert.doesNotMatch(page, /h\.split\("\?"\)\[0\] \+ "\?lang=" \+ l/, "不再把問號後面整段換掉");
  assert.match(page, /var u = new URL\(h, location\.href\); u\.searchParams\.set\("lang", l\);\s*as\[i\]\.setAttribute\("href", u\.pathname \+ u\.search \+ u\.hash\);/);
  assert.match(page, /window\.btKeepLang = function \(\) \{ keepLang\(html\.getAttribute\("data-lang"\) === "en" \? "en" : "zh"\); \};/);
  assert.match(page, /\.tklist li\{display:flex;[^}]*flex-wrap:wrap/, "手機上按鈕掉到下一行，不會往旁邊捲");
  assert.doesNotMatch(m, /localStorage|sessionStorage/, "選的類型不存在裝置上，只在網址裡");
});

// ── 5. 約定：名字對得上 ────────────────────────────────────────────────
test("★ 遷移檔：兩張表沒有政策也不發權限；後台九支的門是 can_edit；對外只回同意勾了的講者與四個鍵；submit_application 舊的那一支拿掉", () => {
  const sql = read("supabase/migrations/2027-01-02-event-speakers-tickets.sql");
  const code = sql.replace(/--[^\n]*/g, "");
  for (const t of ["event_speakers", "event_tickets"]) {
    assert.match(code, new RegExp(`create table if not exists public\\.${t} \\(`));
    assert.match(code, new RegExp(`alter table public\\.${t} enable row level security;`));
    assert.match(code, new RegExp(`revoke all on public\\.${t} from public, anon, authenticated;`));
    assert.doesNotMatch(code, new RegExp(`create policy [a-z_]+ on public\\.${t}`), `${t} 一條政策都沒有`);
    assert.doesNotMatch(code, new RegExp(`grant [a-z, ]+ on public\\.${t} `), `${t} 不發任何權限`);
  }
  assert.match(code, /event_id\s+uuid not null references public\.events\(id\) on delete cascade,\s*person_id\s+uuid references public\.people\(id\) on delete set null/);
  assert.match(code, /consent\s+boolean not null default false/);
  assert.match(code, /capacity\s+int not null default 0 check \(capacity >= 0\)/);
  assert.match(code, /alter table public\.applications add column if not exists ticket_id uuid references public\.event_tickets\(id\) on delete set null;/);
  assert.doesNotMatch(code, /price|amount|currency|paid|fee\b/i, "沒有任何跟錢有關的欄位");
  const gated = [["event_speakers_list", "uuid"], ["save_event_speaker", "uuid, uuid, jsonb"], ["set_event_speaker_consent", "uuid, boolean"], ["reorder_event_speakers", "uuid, uuid\\[\\]"], ["delete_event_speaker", "uuid"],
    ["event_tickets_list", "uuid"], ["save_event_ticket", "uuid, uuid, jsonb"], ["reorder_event_tickets", "uuid, uuid\\[\\]"], ["delete_event_ticket", "uuid"]];
  for (const [fn, args] of gated) {
    const body = code.slice(code.indexOf(`function public.${fn}(`), code.indexOf(`grant execute on function public.${fn}(`));
    assert.match(body, /security definer\s+set search_path = public, pg_temp/, `${fn} 要 security definer 而且鎖 search_path`);
    assert.match(body, /if not public\.can_edit\((e|v)\.workspace_id\) then raise exception 'not_event_editor'/, `${fn} 的門`);
    assert.match(code, new RegExp(`revoke all on function public\\.${fn}\\(${args}\\) from public, anon;\\s*grant execute on function public\\.${fn}\\(${args}\\) to authenticated;`), `${fn} 只給登入的人`);
  }
  assert.match(code, /if p \? 'person_id' and public\.rc_can_view\(\) then/, "連到紀錄裡的人要本來就讀得到名錄");
  assert.match(code, /if exists \(select 1 from applications a where a\.ticket_id = p_id\) then raise exception 'ticket_in_use'/);
  assert.match(code, /select case when public\.form_can_view\(p_form\) then/, "對名字那一支的門是看得到那份報名");
  // 對外
  assert.match(code, /'speakers', coalesce\(\(select jsonb_agg\(jsonb_build_object\('name', s\.display_name, 'subject', s\.subject, 'school', s\.school, 'photo_url', s\.photo_url\)/);
  assert.match(code, /from event_speakers s where s\.event_id = e\.id and s\.consent\)/);
  assert.match(code, /from event_photos p where p\.event_id = e\.id and p\.consent\)/, "照片那一段照舊");
  assert.match(code, /'tickets', public\.event_tickets_public\(e\.id\)\)\s*from events e\s*where e\.slug = p_slug and e\.status = 'published';/);
  assert.match(code, /revoke all on function public\.event_tickets_public\(uuid\) from public, anon, authenticated;/);
  assert.match(code, /grant execute on function public\.public_form_tickets\(uuid\) to anon, authenticated;/);
  // 送出
  assert.match(code, /drop function if exists public\.submit_application\(uuid, jsonb, text, jsonb\);\s*create or replace function public\.submit_application\(\s*p_form_id uuid, p_answers jsonb, p_guardian_email text default null, p_meta jsonb default null, p_ticket uuid default null\)/);
  assert.match(code, /revoke all on function public\.submit_application\(uuid, jsonb, text, jsonb, uuid\) from public, anon;\s*grant execute on function public\.submit_application\(uuid, jsonb, text, jsonb, uuid\) to authenticated;/);
  for (const c of ["ticket_required", "bad_ticket", "ticket_full"]) assert.match(code, new RegExp(`raise exception '${c}' using errcode = 'P0001';`));
  assert.match(code, /for update of t;/, "同一種同時進來兩個人要排隊數");
  // submit_application 跟上一版（2026-12-20）比：把這一支多的三個地方拿掉之後，函式本體一字不差
  const strip = s => s.replace(/--[^\n]*/g, "").replace(/\s+/g, " ").trim();
  const bodyOf = (text, sig) => { const a = text.indexOf("as $$", text.indexOf(sig)) + 5; return text.slice(a, text.indexOf("end $$;", a)); };
  const old = strip(bodyOf(read("supabase/migrations/2026-12-20-form-engine.sql"), "create or replace function public.submit_application("));
  let now = bodyOf(sql, "create or replace function public.submit_application(");
  const a = now.indexOf("  -- 2027-01-02 報名類型"), b = now.indexOf("  select coalesce(name_zh, name_en, ''), school, grade into");
  assert.ok(a > 0 && b > a, "找得到報名類型那一段");
  now = strip((now.slice(0, a) + now.slice(b)).replace("  v_tcap  int;\n", "").replace("guardian_email, meta, ticket_id)", "guardian_email, meta)").replace("v_meta, p_ticket)", "v_meta)"));
  assert.equal(now, old, "除了報名類型那一段、一個宣告、insert 多一欄，其他跟 2026-12-20 那一版一字不差");
  // public_events：跟 2026-12-31 那一版只差封面那一行
  const pe = t => strip(t.slice(t.indexOf("as $$", t.indexOf("function public.public_events()")) + 5, t.indexOf("$$;", t.indexOf("order by e.starts_at nulls last, e.usual_month nulls last, e.slug"))));
  assert.equal(pe(sql).replace("case when e.cover_consent then e.cover_url end, e.starts_at", "e.cover_url, e.starts_at"), pe(read("supabase/migrations/2026-12-31-programmes.sql")), "public_events() 只差封面那一行");
  assert.match(code, /case when e\.cover_consent then e\.cover_url end/);
  assert.doesNotMatch(code, /drop function if exists public\.public_events?\(/, "回傳的欄位沒變，不用 drop");
  assert.match(sql, /union all select 13, '★ 現有的資料：沒勾同意的講者沒有一位漏到對外/, "驗收表有查現有的資料");
});

test("★ 資料層與 main.js：叫的函式名字與參數跟遷移檔一樣；從紀錄找人用 Records 原本那一支；錯誤講人話而且順序對", () => {
  const d = read("admin/src/data.js"), m = read("admin/src/main.js"), sql = read("supabase/migrations/2027-01-02-event-speakers-tickets.sql");
  const calls = [["event_speakers_list", "p_event"], ["save_event_speaker", "p_id"], ["set_event_speaker_consent", "p_consent"], ["reorder_event_speakers", "p_ids"], ["delete_event_speaker", "p_id"],
    ["event_tickets_list", "p_event"], ["save_event_ticket", "p_id"], ["reorder_event_tickets", "p_ids"], ["delete_event_ticket", "p_id"]];
  for (const [fn, arg] of calls) {
    assert.match(d, new RegExp(`rpcV\\("${fn}", \\{[^}]*${arg}:`), `data.js 沒叫 ${fn} 或參數名字不對`);
    assert.match(sql, new RegExp(`function public\\.${fn}\\([^)]*${arg} `), `遷移檔裡 ${fn} 沒有 ${arg}`);
  }
  assert.match(d, /supabase\.rpc\("form_ticket_names", \{ p_form: formId \}\)/); assert.match(sql, /function public\.form_ticket_names\(p_form uuid\)/);
  assert.match(d, /rpcV\("rc_find_people", \{ p_q: q \|\| "" \}\)/, "找人叫的是 Records 原本那一支，沒有新的讀取函式");
  assert.doesNotMatch(sql.replace(/--[^\n]*/g, ""), /function public\.rc_(find_people|directory|can_view)\(/, "這一支沒有重建 Records 讀名錄的函式");
  assert.match(d, /let r = await q\(APP_COLS \+ ", meta, ticket_id"\);\s*if \(r\.error && r\.error\.code === "42703"\) r = await q\(APP_COLS \+ ", meta"\);/, "還沒跑這一支的資料庫少讀那一欄，名單照樣打得開");
  assert.match(d, /if \(\(ap\.data \|\| \[\]\)\.some\(a => a\.ticket_id\)\) for \(const t of await loadTicketNames\(formId\)\) names\.set\(t\.id, t\);/, "有人帶著類型才問名字");
  for (const k of ["speaker_no_name", "too_many_speakers", "no_such_speaker", "no_such_person", "ticket_no_name", "bad_capacity", "too_many_tickets", "no_such_ticket", "ticket_in_use", "ticket_full", "event_speakers_list", "event_tickets_list"])
    assert.match(d, new RegExp(`\\["${k}", "`), `says() 沒有 ${k}`);
  assert.ok(d.indexOf('["ticket_full"') < d.indexOf('["full", "額滿了。"'), "ticket_full 要排在 full 前面，不然會被那一句蓋掉");
  assert.ok(d.indexOf('["event_speakers_list"') < d.indexOf('["Could not find the function"'), "排在通用那一句前面");
  for (const act of ["ev-sp-find", "ev-sp-pick", "ev-sp-unpick", "ev-sp-add", "ev-sp-save", "ev-sp-move", "ev-sp-del", "ev-sp-photo-clear", "ev-tk-add", "ev-tk-save", "ev-tk-move", "ev-tk-del"])
    assert.match(m, new RegExp(`act === "${act}"`), `main.js 沒接 ${act}`);
  assert.match(m, /e\.target\.dataset\.act === "ev-sp-photo"/); assert.match(m, /e\.target\.dataset\.act === "ev-sp-consent"/);
  assert.match(m, /if \(adding && S\.evSpDraft && S\.evSpDraft\.person_id\) patch\.person_id = S\.evSpDraft\.person_id;/, "連到誰只在「加一位」的時候帶");
  assert.match(m, /url = await D\.uploadEventImage\(ev\.id, blob\);[\s\S]{0,200}await D\.saveEventSpeaker\(ev\.id, speakerId, \{ photo_url: url \}\);/, "講者的照片用原本那一支上傳（同一個 bucket）");
  assert.match(m, /else if \(act === "ev-sp-del"\) await D\.removeEventFile\(UI\.evStoragePath\(await D\.deleteEventSpeaker\(id\)\)\);/, "拿掉講者，Storage 的檔也刪");
  assert.match(m, /function keepEventTyped\(\) \{\s*keepPanelsTyped\(\);/, "每一條會重畫的路都先把講者與報名類型打到一半的字收起來");
  assert.match(m, /await Promise\.all\(\[reloadEventPhotos\(one\.id\), reloadEventSpeakers\(one\.id\), reloadEventTickets\(one\.id\)\]\);/);
});

test("★ smoke.sh 有跑這一支，反向的斷言都在", () => {
  const sm = read("scripts/db/smoke.sh");
  assert.match(sm, /supabase\/migrations\/2027-01-02-event-speakers-tickets\.sql/);
  for (const s of ["anon 讀不到 event_speakers 表本身", "anon 讀不到 event_tickets 表本身", "不在這個 team 的幹部加不了講者（not_event_editor）", "team 是「看」的人加不了類型（not_event_editor）",
    "沒勾同意的講者對外看不到", "只有四個鍵（沒有 id、person_id、同意、誰加的）", "沒帶類型送不出去（ticket_required）", "那一種滿了，下一個人送不進來（ticket_full）",
    "帶別場活動的類型送不出去（bad_ticket）", "舊的叫法（不帶 p_ticket）照樣送得出去", "封面沒勾同意：對外兩支都不回封面", "封面勾了同意：對外兩支都回那張封面",
    "已經有人報的類型刪不掉（ticket_in_use）", "這一支沒有多開讀名錄的路", "紀錄那邊忘記這個人"]) assert.ok(sm.includes(s), `smoke.sh 少了：${s}`);
});
