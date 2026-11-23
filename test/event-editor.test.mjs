// 活動編輯頁的下半與照片（2026-11-23）。跑法：node --test test/*.test.mjs
// Paul：「I need the photo and cover photo upload by file... I also need multiple photos... Can you make these look better?
//        Right now they're just links hanging in there... Can you just press create here」
// 這一支守四件事：
//   1. 後台新加的純函式（縮圖尺寸、選檔、Storage 路徑、照片排序、報名表的狀態與那一行字、回饋表的固定題目）。
//   2. 畫面：報名、封面、活動照片、回饋表、記分卡各自是一塊，裡面是真的按鈕；誰看得到哪一顆。
//   3. 對外的活動頁：照片只畫 https 的、捲到才載、沒有就跟原本一模一樣。
//   4. 約定：遷移檔、資料層、main.js、smoke.sh 之間的名字對得上（讀檔比對，不連資料庫；資料庫那一半在 scripts/db/smoke.sh）。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as F from "../admin/src/ui.js";
import * as FS from "../admin/src/strings.js";
import * as RC from "../admin/records/src/ui.js";
import * as PUB from "../events/src/ui.js";

F.setLang("zh");
const read = p => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const WS = "custom:event-winter-camp-2027";
const ASSOC = { id: "u2", role: "cadre", board: "member", team: "Curriculum Team", name: "小安", senior: false, pres: false, ws: {} };
const VIEWER = { ...ASSOC, id: "u7", ws: { [WS]: "view" } };
const EDITOR = { ...ASSOC, id: "u6", ws: { [WS]: "edit" } };
const DIR = { ...ASSOC, id: "u5", board: "director", ws: { [WS]: "manage" } };
const UP = "https://abc.supabase.co/storage/v1/object/public/events/e1/1700000000000-ab12cd.jpg";
const EV = { id: "e1", slug: "winter-camp-2027", team: "Marketing Team", workspace_id: WS, form_id: "f1", title_zh: "2027 冬令營", title_en: "Winter Camp 2027",
  summary_zh: "", summary_en: "", body_zh: "", body_en: "", cover_url: null, cover_consent: false,
  starts_at: new Date(Date.now() + 864e5 * 30).toISOString(), ends_at: null, place: "台北", capacity: 40, status: "draft", published_at: null, kind: "bootcamp" };
const FORM = { id: "f1", status: "draft", opens_at: null, closes_at: null, title: "2027 冬令營" };
const PHOTOS = [{ id: "p1", url: UP, consent: true, sort: 10 }, { id: "p2", url: UP.replace("ab12cd", "ef34gh"), consent: false, sort: 20 }, { id: "p3", url: UP.replace("ab12cd", "ij56kl"), consent: false, sort: 30 }];
const count = (h, re) => (h.match(re) || []).length;

// ── 1. 純函式 ──────────────────────────────────────────────────────────
test("evFit：最長邊縮到 1600，小的不放大，比例不變，邊長最少 1", () => {
  assert.deepEqual(F.evFit(4000, 3000), { w: 1600, h: 1200 });
  assert.deepEqual(F.evFit(3000, 4000), { w: 1200, h: 1600 });
  assert.deepEqual(F.evFit(800, 600), { w: 800, h: 600 }, "小的不放大");
  assert.deepEqual(F.evFit(1600, 1600), { w: 1600, h: 1600 });
  assert.deepEqual(F.evFit(10000, 2), { w: 1600, h: 1 }, "很扁的圖，短邊不會變成 0");
  assert.deepEqual(F.evFit(2000, 1000, 500), { w: 500, h: 250 });
  assert.equal(F.EV_IMG_MAX, 1600);
});

test("evFileOk：只收圖、原檔 25 MB 以內", () => {
  assert.ok(F.evFileOk({ type: "image/jpeg", size: 3e6 }));
  assert.ok(F.evFileOk({ type: "image/heic", size: 25 * 1024 * 1024 }));
  assert.ok(!F.evFileOk({ type: "application/pdf", size: 1000 }));
  assert.ok(!F.evFileOk({ type: "image/png", size: 25 * 1024 * 1024 + 1 }));
  assert.ok(!F.evFileOk({ type: "", size: 10 })); assert.ok(!F.evFileOk(null));
});

test("evStoragePath：只有 events bucket 的公開網址算我們的檔；貼的連結、別的 bucket 回空字串（不會去刪別人的檔）", () => {
  assert.equal(F.evStoragePath(UP), "e1/1700000000000-ab12cd.jpg");
  assert.equal(F.evStoragePath(UP + "?v=2"), "e1/1700000000000-ab12cd.jpg", "問號後面的不算路徑");
  assert.equal(F.evStoragePath("https://abc.supabase.co/storage/v1/object/public/events/e1/a%20b.jpg"), "e1/a b.jpg");
  assert.equal(F.evStoragePath("https://abc.supabase.co/storage/v1/object/public/history/x/a.jpg"), "", "歷史之路的 bucket 不是這一頁的");
  assert.equal(F.evStoragePath("https://drive.google.com/uc?id=abc"), "");
  assert.equal(F.evStoragePath("https://abc.supabase.co/storage/v1/object/public/events/%E0%A4%A"), "", "解不開的網址當成不是我們的檔");
  assert.equal(F.evStoragePath(null), ""); assert.equal(F.evStoragePath(""), "");
  assert.ok(F.evCoverOk(UP), "傳上去的封面過得了原本「像不像一張圖」那一關");
});

test("evPhotoMove：往前往後一格回整串新順序；頭尾動不了、找不到那一張都回 null；原本的陣列不動", () => {
  assert.deepEqual(F.evPhotoMove(PHOTOS, "p2", -1), ["p2", "p1", "p3"]);
  assert.deepEqual(F.evPhotoMove(PHOTOS, "p2", 1), ["p1", "p3", "p2"]);
  assert.deepEqual(F.evPhotoMove(PHOTOS, "p2", "1"), ["p1", "p3", "p2"], "按鈕上的 data-dir 是字串");
  assert.equal(F.evPhotoMove(PHOTOS, "p1", -1), null); assert.equal(F.evPhotoMove(PHOTOS, "p3", 1), null);
  assert.equal(F.evPhotoMove(PHOTOS, "nope", 1), null); assert.equal(F.evPhotoMove(null, "p1", 1), null);
  assert.deepEqual(PHOTOS.map(p => p.id), ["p1", "p2", "p3"]);
});

test("evFormState：沒有表、草稿、關了；開放中再分還沒到時間、過了截止、額滿、收得到", () => {
  const now = new Date("2026-12-10T00:00:00Z");
  assert.equal(F.evFormState(null), "none");
  assert.equal(F.evFormState({ status: "draft" }, 0, 40, now), "draft");
  assert.equal(F.evFormState({ status: "closed" }, 0, 40, now), "closed");
  assert.equal(F.evFormState({ status: "open" }, 3, 40, now), "open");
  assert.equal(F.evFormState({ status: "open", opens_at: "2026-12-20T00:00:00Z" }, 0, 40, now), "soon");
  assert.equal(F.evFormState({ status: "open", closes_at: "2026-12-01T00:00:00Z" }, 3, 40, now), "over");
  assert.equal(F.evFormState({ status: "open" }, 40, 40, now), "full");
  assert.equal(F.evFormState({ status: "open" }, 99, 0, now), "open", "名額 0 是不限，不會額滿");
  assert.equal(F.evFormState({ status: "open" }, null, 40, now), "open", "報名數載不到不當成額滿");
  assert.equal(F.evFormState({ status: "draft", opens_at: "2026-12-20T00:00:00Z" }, 0, 0, now), "draft", "草稿不看時間");
});

test("evFormFacts：開放與截止時間有填才寫；有名額寫幾分之幾，沒有名額只寫人數；報名數載不到印問號不印 0", () => {
  assert.deepEqual(F.evFormFacts(null, 3, 40), []);
  assert.deepEqual(F.evFormFacts(FORM, 3, 40), ["已報名 3 / 40 人"]);
  assert.deepEqual(F.evFormFacts(FORM, 3, 0), ["已報名 3 人"]);
  assert.deepEqual(F.evFormFacts(FORM, null, 40), ["已報名 ? / 40 人"]);
  assert.deepEqual(F.evFormFacts(FORM, 0, 40), ["已報名 0 / 40 人"], "0 個人是 0，不是問號");
  const both = F.evFormFacts({ ...FORM, opens_at: "2026-12-01T01:00:00Z", closes_at: "2026-12-20T15:59:00Z" }, 3, 40);
  assert.equal(both.length, 3);
  assert.match(both[0], /^\d{4}-\d{2}-\d{2} \d{2}:\d{2} 開放$/); assert.match(both[1], /^\d{4}-\d{2}-\d{2} \d{2}:\d{2} 截止$/);
  F.setLang("en");
  assert.deepEqual(F.evFormFacts(FORM, 3, 40), ["3 of 40 signed up"]); assert.deepEqual(F.evFormFacts(FORM, 3, 0), ["3 signed up"]);
  F.setLang("zh");
});

test("★ 回饋表的固定題目跟 Records 那一份一字不差（同一個 key 才比得了年度數字）；名字也跟 Records 開出來的一樣", () => {
  for (const l of ["zh", "en"]) assert.deepEqual(F.evFeedbackQuestions(l), RC.templateQuestions("post-event", l), `${l} 那一份跟 Records 的不一樣了`);
  const qs = F.evFeedbackQuestions("zh");
  assert.equal(qs.length, 6);
  assert.deepEqual(qs.map(q => q.key), ["recommend", "useful", "clarity", "best", "change", "first_time"]);
  assert.ok(qs[0].required && qs[0].type === "scale", "記分卡的「會推薦」靠這一題");
  assert.equal(F.evFeedbackTitle(EV), "2027 冬令營 · 活動後回饋");
  F.setLang("en"); RC.setLang && RC.setLang("en");
  assert.equal(F.evFeedbackTitle(EV), "Winter Camp 2027 · Post-event feedback");
  assert.equal(F.T("ev.fb.kind"), RC.T ? RC.T("fkind.post-event") : "Post-event feedback", "「活動後回饋」這幾個字兩邊一樣");
  F.setLang("zh"); RC.setLang && RC.setLang("zh");
});

// ── 2. 畫面 ────────────────────────────────────────────────────────────
test("★ 報名與現場：一塊一塊的，動作都是按鈕不是連結；狀態、人數、開放與關閉", () => {
  const h = F.eventSignupHTML(EV, FORM, 3, DIR, false);
  assert.match(h, /<div class="ev-panel"><h3>報名表 <span class="tag draft">還在寫<\/span><\/h3>/);
  assert.match(h, /<p class="ev-line">已報名 3 \/ 40 人<\/p>/);
  assert.match(h, /報名表還在寫，外面的人看不到/);
  for (const act of ["open-form", "open-apps", "open-notice", "open-checkin"]) assert.match(h, new RegExp(`<button class="btn ghost sm" data-act="${act}" data-id="f1"`), `${act} 要是按鈕`);
  assert.match(h, /<button class="btn sm" data-act="ev-form-status" data-id="f1" data-v="open">開放報名<\/button>/);
  assert.match(h, /<button class="btn ghost sm" data-act="members-open" data-ws="custom:event-winter-camp-2027" data-name="2027 冬令營">誰能改這場活動<\/button>/);
  assert.doesNotMatch(h, /<a /, "這一塊沒有連結了"); assert.doesNotMatch(h, /class="plain"/);
  // 開放中、活動還沒上架：提醒一句；按鈕變成關閉
  const open = F.eventSignupHTML(EV, { ...FORM, status: "open" }, 3, DIR, false);
  assert.match(open, /<span class="tag open">開放中<\/span>/); assert.match(open, /活動上架之後報名表才會出現在 \/apply\//);
  assert.match(open, /data-act="ev-form-status" data-id="f1" data-v="closed">關閉報名<\/button>/); assert.doesNotMatch(open, /data-v="open"/);
  // 上架了、收得到
  assert.match(F.eventSignupHTML({ ...EV, status: "published" }, { ...FORM, status: "open" }, 3, DIR, false), /現在收得到報名。/);
  // 額滿、過了截止、還沒到時間：旁邊多一個標籤，不說「現在收得到」
  const full = F.eventSignupHTML({ ...EV, status: "published" }, { ...FORM, status: "open" }, 40, DIR, false);
  assert.match(full, /<span class="tag warn">額滿了<\/span>/); assert.doesNotMatch(full, /現在收得到報名/);
  assert.match(F.eventSignupHTML({ ...EV, status: "published" }, { ...FORM, status: "open", closes_at: "2020-01-01T00:00:00Z" }, 3, DIR, false), /<span class="tag warn">過了截止時間<\/span>/);
  assert.match(F.eventSignupHTML({ ...EV, status: "published" }, { ...FORM, status: "open", opens_at: "2099-01-01T00:00:00Z" }, 0, DIR, false), /<span class="tag warn">還沒到開放時間<\/span>/);
  assert.match(F.eventSignupHTML(EV, { ...FORM, status: "closed" }, 3, DIR, false), /<span class="tag closed">已關閉<\/span>[\s\S]*報名關了，已經收到的還在。[\s\S]*data-v="open">開放報名/);
  assert.match(F.eventSignupHTML(EV, FORM, 3, DIR, true), /data-act="ev-form-status" data-id="f1" data-v="open" disabled>/, "忙的時候按不了");
});

test("★ 報名與現場：誰看得到哪一顆（「看」沒有開關、「改」沒有成員、沒被加進來的只有一句話）", () => {
  const view = F.eventSignupHTML(EV, FORM, 3, VIEWER, false);
  assert.match(view, /data-act="open-apps"/); assert.match(view, /data-act="open-form"/);
  assert.doesNotMatch(view, /ev-form-status|members-open|ev-attach-form/);
  const edit = F.eventSignupHTML(EV, FORM, 3, EDITOR, false);
  assert.match(edit, /data-act="ev-form-status"/); assert.doesNotMatch(edit, /members-open/, "成員要「管」");
  const out = F.eventSignupHTML(EV, FORM, 3, ASSOC, false);
  assert.match(out, /找這個 team 的 Director/); assert.doesNotMatch(out, /data-act=/);
});

test("★ 沒有報名表：一句話加一顆「加一張報名表」（用原本的 ev-attach-form）；「看」的人沒有那顆", () => {
  const noForm = { ...EV, form_id: null };
  const h = F.eventSignupHTML(noForm, null, null, EDITOR, false);
  assert.match(h, /這場還沒有報名表。/);
  assert.match(h, /<button class="btn sm" data-act="ev-attach-form" data-id="e1">加一張報名表<\/button>/);
  assert.match(h, /不收報名的活動可以不加/);
  assert.doesNotMatch(h, /open-apps|open-checkin|ev-form-status/);
  assert.doesNotMatch(F.eventSignupHTML(noForm, null, null, VIEWER, false), /ev-attach-form/);
  assert.match(F.eventSignupHTML(noForm, null, null, DIR, false), /data-act="members-open"/, "沒有報名表也改得了成員");
});

test("★ 封面：主要是選檔案，貼連結收在一格裡；同意與「換了要重勾」都還在；已經在對外頁上的多一句提醒", () => {
  const none = F.eventCoverHTML(EV, true, false, {});
  assert.match(none, /<h3>封面照片<\/h3>/); assert.match(none, /還沒有封面。/);
  assert.match(none, /<input type="file" id="ev-cover-file" accept="image\/\*" data-noauto="1" data-id="e1">/, "data-noauto：自動儲存不碰這一格");
  assert.match(none, /<details class="fold rc-fold" id="ev-cover-link"><summary>[\s\S]*改用貼連結[\s\S]*<input id="ev-cover" name="cover_url" value="" placeholder="https:\/\/…">/, "連結那一格還在畫面上（收著），readEvent() 讀得到");
  assert.match(none, /id="ev-consent" name="cover_consent">/); assert.match(none, /換了封面要重新勾同意/);
  assert.doesNotMatch(none, /ev-cover-clear/, "沒有封面就沒有「拿掉封面」"); assert.doesNotMatch(none, /已經在對外頁上/);
  // 傳上去的封面：連結那一格收著；有「拿掉封面」
  const up = F.eventCoverHTML({ ...EV, cover_url: UP, cover_consent: true }, true, false, {});
  assert.match(up, new RegExp(`<img class="ev-cover" src="${UP.replace(/[.?/]/g, "\\$&")}" alt="">`));
  assert.match(up, /<details class="fold rc-fold" id="ev-cover-link"><summary>/); assert.match(up, /換一張封面/);
  assert.match(up, /id="ev-consent" name="cover_consent" checked>/);
  assert.match(up, /<button class="btn quiet danger sm" data-act="ev-cover-clear" data-id="e1">拿掉封面<\/button>/);
  // 貼的連結：那一格先打開，才看得到貼的是什麼
  assert.match(F.eventCoverHTML({ ...EV, cover_url: "https://drive.google.com/cover.jpg" }, true, false, {}), /id="ev-cover-link" open>/);
  assert.match(F.eventCoverHTML(EV, true, false, { coverLinkOpen: true }), /id="ev-cover-link" open>/, "自己打開過，重畫後還開著");
  // 上傳中：進度條，沒有選檔那一格
  const going = F.eventCoverHTML(EV, true, true, { coverUp: { pct: 45, name: "a.jpg" } });
  assert.match(going, /<progress value="45" max="100">/); assert.match(going, /傳 a\.jpg 中/); assert.doesNotMatch(going, /ev-cover-file/);
  // 已經在對外頁上
  // 2027-01-02 起 public_events() 的封面同意勾了才回，所以這一句從「新的那一張會馬上出現」改成「勾之前對外頁不會放封面」。
  assert.match(F.eventCoverHTML({ ...EV, status: "published" }, true, false, {}), /這場活動已經在對外頁上。換了封面要重新勾同意，勾之前對外頁不會放封面。/);
  // 唯讀：沒有選檔、沒有拿掉；同意那一格按不了
  const ro = F.eventCoverHTML({ ...EV, cover_url: UP, status: "published" }, false, false, {});
  assert.doesNotMatch(ro, /ev-cover-file|ev-cover-clear|ev-cover-link|已經在對外頁上/); assert.match(ro, /id="ev-consent" name="cover_consent" disabled>/);
  assert.match(ro, /<input id="ev-cover" name="cover_url" value="[^"]+" placeholder="https:\/\/…" readonly>/);
});

test("★ 活動照片：每一張自己勾同意（預設沒勾）、可以往前往後、可以拿掉；一次可以選好幾張；改不動的人整塊不畫", () => {
  const h = F.eventPhotosHTML(EV, PHOTOS, true, false, {});
  assert.match(h, /<section class="section" id="ev-photos"><h2>活動照片<span class="hint">3<\/span>/);
  assert.equal(count(h, /<li class="hi-photo">/g), 3);
  assert.equal(count(h, /<img src="[^"]+" alt="" loading="lazy">/g), 3);
  assert.equal(count(h, /data-act="ev-ph-consent" data-noauto="1"/g), 3);
  assert.match(h, /data-act="ev-ph-consent" data-noauto="1" data-id="p1" checked>/); assert.match(h, /data-act="ev-ph-consent" data-noauto="1" data-id="p2">/);
  assert.equal(count(h, /這張照片裡的人與那場活動都在拍攝同意範圍內/g), 3, "同意那句話跟封面的一字不差");
  assert.match(h, /data-act="ev-ph-move" data-id="p1" data-dir="-1" disabled>往前/, "第一張不能再往前");
  assert.match(h, /data-act="ev-ph-move" data-id="p1" data-dir="1">往後/);
  assert.match(h, /data-act="ev-ph-move" data-id="p3" data-dir="1" disabled>往後/, "最後一張不能再往後");
  assert.equal(count(h, /data-act="ev-ph-del"/g), 3);
  assert.match(h, /<input type="file" id="ev-photo-files" accept="image\/\*" multiple data-id="e1">/);
  assert.match(h, /沒勾的不會出現在對外頁/);
  // 標籤：活動還沒上架，勾了同意的寫「上架後看得到」；上架了寫「對外看得到」；沒勾的一律「對外看不到」
  assert.equal(count(h, /對外看不到/g), 2); assert.match(h, /活動上架後對外看得到/); assert.doesNotMatch(h, />對外看得到</);
  const live = F.eventPhotosHTML({ ...EV, status: "published" }, PHOTOS, true, false, {});
  assert.equal(count(live, />對外看得到</g), 1); assert.equal(count(live, />對外看不到</g), 2);
  // 空的、還在載、遷移檔還沒跑
  assert.match(F.eventPhotosHTML(EV, [], true, false, {}), /還沒有照片。[\s\S]*ev-photo-files/);
  assert.match(F.eventPhotosHTML(EV, undefined, true, false, {}), /載入中/);
  const noSql = F.eventPhotosHTML(EV, null, true, false, {});
  assert.match(noSql, /2027-01-01-event-photos\.sql/); assert.match(noSql, /封面可以先用貼連結的/); assert.doesNotMatch(noSql, /ev-photo-files/);
  // 上傳中
  const going = F.eventPhotosHTML(EV, PHOTOS, true, true, { photoUp: { pct: 30, name: "b.jpg", i: 2, n: 5 } });
  assert.match(going, /第 2 張，共 5 張：傳 b\.jpg 中/); assert.doesNotMatch(going, /ev-photo-files/);
  assert.match(going, /data-act="ev-ph-del" data-id="p1" disabled>/);
  // 改不動的人
  assert.equal(F.eventPhotosHTML(EV, PHOTOS, false, false, {}), "");
});

test("★ 回饋表：沒有的時候是一顆「建立回饋表」，不再叫人去 Records 開；有的列出來；還在載不畫按鈕；導生學期留在記分卡開", () => {
  const rc0 = { event: { numbers: {} }, review: null, forms: [] };
  const none = F.eventFeedbackHTML(EV, rc0, true, false);
  assert.match(none, /<div class="ev-panel"><h3>回饋表<\/h3><p class="ev-line">這場還沒有回饋表。<\/p>/);
  assert.match(none, /<button class="btn sm" data-act="ev-fb-create" data-id="e1">建立回饋表<\/button>/);
  assert.doesNotMatch(none, /到 Records 的回饋表開一張/);
  const has = F.eventFeedbackHTML(EV, { ...rc0, forms: [{ id: "f9", title: "營隊回饋", status: "open", responses: 20 }] }, true, false);
  assert.match(has, /href="\/admin\/records\/#forms\/f9">營隊回饋<\/a> <span class="tag open">開放中<\/span> <span class="mini">20 份<\/span>/);
  assert.match(has, /<button class="btn ghost sm" data-act="ev-fb-create"/, "已經有一張，再建一張是次要的按鈕");
  assert.equal(F.eventFeedbackHTML(EV, undefined, true, false), "", "還不知道有沒有回饋表的時候不畫按鈕，免得多建一張");
  assert.match(F.eventFeedbackHTML(EV, null, true, false), /data-act="ev-fb-create"/, "讀不到 Records 的數字，「改」的人還是建得了（門在資料庫）");
  assert.doesNotMatch(F.eventFeedbackHTML(EV, rc0, false, false), /ev-fb-create/, "只有「看」的人沒有那顆");
  assert.equal(F.eventFeedbackHTML(EV, null, false, false), "");
  const term = F.eventFeedbackHTML({ ...EV, kind: "mentorship-term" }, rc0, true, false);
  assert.match(term, /到完整記分卡那邊開/); assert.doesNotMatch(term, /ev-fb-create/);
  assert.match(F.eventFeedbackHTML(EV, rc0, true, true), /data-act="ev-fb-create" data-id="e1" disabled>/);
});

test("★ 記分卡是一顆次要的按鈕，上面一句話講它是什麼；種類與屆別自己一塊", () => {
  const h = F.eventAfterHTML(EV, [{ id: "2026-27" }], true, false, null);
  assert.match(h, /<div class="ev-panel"><h3>完整記分卡<\/h3>\s*<p class="ev-line">記分卡是這場活動在 Records 的那一頁[^<]*<\/p>\s*<div class="ev-acts"><a class="btn ghost sm" href="\/admin\/records\/#overview\/e1">打開完整記分卡<\/a>/);
  assert.match(h, /<div class="ev-panel"><h3>種類與屆別<\/h3>[\s\S]*<select id="ev-kind" data-id="e1">[\s\S]*<select id="ev-term" data-id="e1">/);
  assert.doesNotMatch(h, /class="form-foot"><a class="btn ghost sm" href="\/admin\/records/, "不再是掛在一條線底下的一顆");
});

test("★ 整頁：內容、活動照片、場地、報名、紀錄照這個順序；x 沒給也畫得出來", () => {
  const rc = { event: { numbers: {} }, review: null, forms: [] };
  const h = F.eventEditHTML(EV, FORM, 3, DIR, "", false, [{ id: "v1", name: "台大", city: "台北" }], [], null, rc, null, { photos: PHOTOS });
  const at = s => { const i = h.indexOf(s); assert.ok(i >= 0, `找不到 ${s}`); return i; };
  assert.ok(at('data-autosave="ev-save"') < at('id="ev-cover-file"') && at('id="ev-cover-file"') < at('id="ev-photos"'), "封面在內容裡，照片在內容後面");
  assert.ok(at('id="ev-photos"') < at('id="ev-venue"') && at('id="ev-venue"') < at('data-act="ev-form-status"') && at('data-act="ev-form-status"') < at('id="ev-after"'));
  assert.ok(at('id="ev-cover-file"') < at('class="autosave" data-for="ev-save"'), "封面那一塊在自動儲存的框裡（連結與同意改了就存）");
  assert.equal(count(h, /id="ev-cover"/g), 1, "連結那一格只有一個"); assert.equal(count(h, /id="ev-consent"/g), 1);
  assert.match(h, /<div class="ev-panel"><div class="mini">還沒選場地/, "場地也包成一塊");
  const bare = F.eventEditHTML(EV, FORM, 3, DIR, "", false);
  assert.match(bare, /id="ev-photos"><h2>活動照片<\/h2><div class="mini">載入中/);
  assert.doesNotMatch(F.eventEditHTML(EV, FORM, 3, VIEWER, "", false, [], [], null, rc, null, { photos: PHOTOS }), /id="ev-photos"|ev-cover-file|ev-fb-create|ev-form-status/, "只有「看」的人：沒有照片那一塊、沒有任何會改東西的按鈕");
});

test("★ 這一批新的字中英都有，而且程式裡用到的鍵字典裡都有", () => {
  const src = read("admin/src/ui.js") + read("admin/src/main.js");
  const keys = new Set([...src.matchAll(/T\("((?:ev|msg\.ev|err\.ev|confirm\.ev)[A-Za-z.]*)"/g)].map(m => m[1]));
  for (const k of ["ev.coverPick", "ev.coverChange", "ev.phPublic", "ev.phReady", "ev.phHidden", "msg.evPhotoAdded", "msg.evPhotosAdded", "msg.evFormOpened", "msg.evFormClosed",
    "msg.evPhConsentOn", "msg.evPhConsentOff", "msg.evPhMoved", "msg.evPhDeleted", "ev.fm.notYet", "ev.fm.over", "ev.fm.full", "ev.fm.draftHint", "ev.fm.closedHint", "ev.fm.openHint"]) keys.add(k);
  assert.ok(keys.size > 100, "抓得到鍵（這條檢查自己沒壞）");
  for (const k of keys) { if (k.endsWith(".")) continue; assert.ok(FS.STRINGS[k], `字典裡沒有 ${k}`); assert.ok(FS.STRINGS[k].zh && FS.STRINGS[k].en, `${k} 少一種語言`); }
  const mine = Object.entries(FS.STRINGS).filter(([k]) => /^(ev\.(cover|photos|ph|fm|fb|day|meta|scorecard|uploading|addFormHint|membersHint)|msg\.ev(Cover|Ph|Form(Opened|Closed))|err\.ev(CoverUp|File|Resize|UploadSome|FileSome|Ph|FormStatus|FbCreate)|confirm\.ev(CoverClear|PhDel))/.test(k));
  assert.ok(mine.length >= 55, `這一批的字抓到 ${mine.length} 句`);
  for (const [k, row] of mine) for (const l of ["zh", "en"]) {
    assert.doesNotMatch(row[l], /[—–]/, `${k} 的 ${l} 有破折號`);
    assert.doesNotMatch(row[l], /\p{Extended_Pictographic}/u, `${k} 的 ${l} 有 emoji`);
  }
});

// ── 3. 對外的活動頁 ────────────────────────────────────────────────────
// 2026-11-23 同一天後面那一頁整個重排（兩欄、右邊的卡、照片變成橫的一排、等資料回來才畫），細節搬到 test/event-page.test.mjs。
// 這裡留三件當初定的事：只畫 https 的照片而且只用網址、沒有照片就什麼都不多、問不到不印錯誤。
test("★ 對外：galleryHTML 只畫 https 的照片、alt 是空的、捲到才載；沒有、載不到、形狀不對都回空字串", () => {
  const h = PUB.galleryHTML({ photos: [{ url: "https://x/a.jpg" }, { url: "https://x/b.jpg" }] }, "zh");
  assert.equal(count(h, /<img /g), 2);
  assert.match(h, /<li><img src="https:\/\/x\/a\.jpg" alt="" loading="lazy" decoding="async" onerror="this\.closest\('li'\)\.remove\(\)"><\/li><li><img src="https:\/\/x\/b\.jpg"/, "照資料庫給的順序");
  for (const bad of [null, undefined, {}, { photos: [] }, { photos: null }, { photos: "x" }, [], "nope", { message: "Could not find the function" }]) assert.equal(PUB.galleryHTML(bad, "zh"), "", JSON.stringify(bad));
  assert.equal(PUB.galleryHTML({ photos: [{ url: "javascript:alert(1)" }, { url: "http://x/a.jpg" }, {}, null, { url: "" }] }, "zh"), "", "不是 https 的不畫");
  assert.match(PUB.galleryHTML({ photos: [{ url: 'https://x/a.jpg"><script>' }] }, "zh"), /src="https:\/\/x\/a\.jpg&quot;&gt;&lt;script&gt;"/, "網址有引號也逃得掉");
  assert.equal(count(PUB.galleryHTML({ photos: [{ url: "https://x/a.jpg", consent: false, id: "p1", caption: "小明" }] }, "zh"), /小明|p1|consent/g), 0, "只用網址，別的欄位不會被印出來");
});

test("★ 對外：沒有照片的時候那一頁沒有照片那一塊；清單與卡片沒動", () => {
  const e = { slug: "info", team: "Curriculum Team", title_zh: "說明會", title_en: "Info session", summary_zh: "", summary_en: "", body_zh: "內容", body_en: "Body", cover_url: null,
    starts_at: "2027-01-20T02:00:00Z", ends_at: null, place: "台北", capacity: 0, form_id: null, signup_open: false, signed_up: 0, is_full: false, is_past: false };
  for (const x of [undefined, null, { photos: [] }]) assert.doesNotMatch(PUB.detailHTML(e, "zh", x), /ev-photos|ev-strip|<img/, "沒有照片：一張圖、一個空的框都沒有");
  const h = PUB.detailHTML(e, "zh", { photos: [{ url: "https://x/a.jpg" }] });
  assert.equal(count(h, /<div class="ev-photos">/g), 1);
  assert.ok(h.indexOf('class="ev-text"') < h.indexOf('class="ev-photos"') && h.indexOf('class="ev-photos"') < h.lastIndexOf("所有活動"), "在說明底下、最下面回清單的連結上面");
  assert.doesNotMatch(PUB.cardHTML(e, "zh", "./"), /ev-photos/); assert.doesNotMatch(PUB.listHTML([e], "zh"), /ev-photos/);
});

test("★ 對外：照片、講者、報名類型另外問 public_event_extras；問不到、函式不在、逾時都回 null，不印錯誤；沒有動 public_events 那一條", () => {
  const m = read("events/src/main.js");
  assert.match(m, /x = await rpc\("public_event_extras", \{ p_slug: slug \}, 2500\); \} catch \(e\) \{ x = null; \}/, "失敗一律是 null，不丟錯");
  assert.match(m, /const load = \(\) => rpc\("public_events", \{\}, 4000\);/, "原本那一支照舊");
  assert.match(m, /`\$\{SUPABASE_URL\}\/rest\/v1\/rpc\/\$\{name\}`/);
  assert.match(m, /if \(slugOf\(\) !== slug\) return;\s*paint\(cache, slug, x\);/, "資料回來的時候人已經換到別場，就不要畫");
  assert.doesNotMatch(m, /sb_publishable_|supabase\.co/, "不抄金鑰");
});

// ── 4. 約定：名字對得上 ────────────────────────────────────────────────
test("★ 遷移檔：表沒有政策也不發權限、六支函式、後台五支的門是 can_edit、對外只回 published 與勾了同意的、沒動原本對外兩支", () => {
  const sql = read("supabase/migrations/2027-01-01-event-photos.sql");
  const code = sql.replace(/--[^\n]*/g, "");
  assert.match(code, /create table if not exists public\.event_photos \(/);
  assert.match(code, /event_id\s+uuid not null references public\.events\(id\) on delete cascade/);
  assert.match(code, /consent\s+boolean not null default false/);
  assert.match(code, /alter table public\.event_photos enable row level security;/);
  assert.match(code, /revoke all on public\.event_photos from public, anon, authenticated;/);
  assert.doesNotMatch(code, /create policy [a-z_]+ on public\.event_photos/, "表上一條政策都沒有");
  assert.doesNotMatch(code, /grant [a-z, ]+ on public\.event_photos/, "表不發任何權限");
  for (const fn of ["event_photos_list", "add_event_photo", "set_event_photo_consent", "reorder_event_photos", "delete_event_photo"]) {
    const body = code.slice(code.indexOf(`function public.${fn}(`), code.indexOf(`grant execute on function public.${fn}(`));
    assert.match(body, /security definer\s+set search_path = public, pg_temp/, `${fn} 要 security definer 而且鎖 search_path`);
    assert.match(body, /if not public\.can_edit\((e|v)\.workspace_id\) then raise exception 'not_event_editor'/, `${fn} 的門`);
    assert.match(code, new RegExp(`revoke all on function public\\.${fn}\\([a-z, \\[\\]]+\\) from public, anon;\\s*grant execute on function public\\.${fn}\\([a-z, \\[\\]]+\\) to authenticated;`), `${fn} 只給登入的人`);
  }
  assert.match(code, /create or replace function public\.public_event_extras\(p_slug text\)\s+returns jsonb language sql stable security definer\s+set search_path = public, pg_temp/);
  assert.match(code, /where e\.slug = p_slug and e\.status = 'published';/);
  assert.match(code, /from event_photos p where p\.event_id = e\.id and p\.consent\)/);
  assert.match(code, /jsonb_build_object\(\s*'photos',/, "回一個物件，之後講者與票種加在旁邊");
  assert.match(code, /grant execute on function public\.public_event_extras\(text\) to anon, authenticated;/);
  assert.doesNotMatch(code, /function public\.public_events?\(/, "不重建原本對外那兩支"); assert.doesNotMatch(code, /function public\.save_event\(/);
  assert.match(code, /values \('events', 'events', true, 5242880,/, "bucket 公開讀、5 MB");
  assert.match(sql, /union all select 8, '★ 現有的資料：沒勾同意的照片沒有一張漏到對外/, "驗收表有查現有的資料");
});

test("★ 資料層與 main.js：叫的函式名字跟遷移檔一樣；封面走原本的 save_event；回饋表走 Records 同一支 rc_save_form；不 import 別的後台資料夾", () => {
  const d = read("admin/src/data.js"), m = read("admin/src/main.js"), sql = read("supabase/migrations/2027-01-01-event-photos.sql"), rcd = read("admin/records/src/data.js");
  for (const fn of ["event_photos_list", "add_event_photo", "set_event_photo_consent", "reorder_event_photos", "delete_event_photo"]) {
    assert.match(d, new RegExp(`rpcV\\("${fn}"`), `data.js 沒叫 ${fn}`); assert.match(sql, new RegExp(`function public\\.${fn}\\(`));
  }
  for (const [call, arg] of [["event_photos_list", "p_event"], ["add_event_photo", "p_url"], ["set_event_photo_consent", "p_consent"], ["reorder_event_photos", "p_ids"], ["delete_event_photo", "p_id"]])
    assert.match(d, new RegExp(`rpcV\\("${call}", \\{[^}]*${arg}:`), `${call} 的參數名字`);
  assert.match(d, /supabase\.storage\.from\("events"\)\.upload\(name, blob, \{ contentType: "image\/jpeg", cacheControl: "31536000", upsert: false \}\)/);
  assert.match(d, /const name = `\$\{eventId\}\/\$\{Date\.now\(\)\}-/, "路徑是活動 id 加時間加亂數，不用原檔名（原檔名可能有人名）");
  assert.match(d, /rpcV\("rc_save_form", \{ p_form: null, p_data: \{ title, kind: "post-event", event_id: eventId, lang: l \}, p_questions: questions \|\| \[\] \}\)/);
  assert.match(rcd, /rpc\("rc_save_form", \{ p_form: id \|\| null, p_data: data \|\| \{\}, p_questions:/, "Records 那邊叫的是同一支、同樣的參數名字");
  assert.doesNotMatch(d + m + read("admin/src/ui.js"), /from "\.\.\/(records|site|people|passports|finance|marketing)\//, "不 import 別的後台資料夾");
  // 封面：存的是 cover_url 一個鍵，走原本的 saveEvent；存完畫面上的同意改回沒勾
  assert.match(m, /await D\.saveEvent\(eventId, \{ cover_url: url \}\);\s*ev\.cover_url = url; ev\.cover_consent = false; forgetCover\(eventId\);/);
  assert.match(m, /await D\.saveEvent\(id, \{ cover_url: "" \}\);\s*ev\.cover_url = null; ev\.cover_consent = false; forgetCover\(id\);/);
  assert.match(m, /if \(coverChanged\) dirty\.forget\("ev-save\|" \+ id \+ "\|cover_consent"\);/, "換了連結也要忘掉上次存的同意，不然再勾一次送不出去");
  // 傳上去卻沒掛成的檔要刪掉
  // 三條上傳的路各一句：封面、活動照片、講者的照片（2027-01-02）。
  assert.equal((m.match(/if \(url\) await D\.removeEventFile\(UI\.evStoragePath\(url\)\);/g) || []).length, 3);
  assert.match(m, /await D\.removeEventFile\(UI\.evStoragePath\(await D\.deleteEventPhoto\(id\)\)\)/, "拿掉照片，Storage 的檔也刪");
  // 建回饋表：建好直接去那張表
  assert.match(m, /const fid = await D\.createFeedbackForm\(id, UI\.evFeedbackTitle\(ev\), lang\(\), UI\.evFeedbackQuestions\(lang\(\)\)\);\s*location\.href = "\/admin\/records\/#forms\/" \+ encodeURIComponent\(fid\);/);
  assert.match(read("admin/records/src/main.js"), /#overview（記分卡清單）、#overview\/<活動 id>（一場）、#forms、#forms\/<id>/, "Records 認得 #forms/<id>");
  // 開放報名：先看有沒有題目，走原本的 saveForm
  assert.match(m, /if \(to === "open" && \(await D\.countQuestions\(id\)\) === 0\) throw new Error\(T\("err\.noQuestions"\)\);\s*await D\.saveForm\(id, \{ status: to \}\);/);
  for (const act of ["ev-form-status", "ev-fb-create", "ev-cover-clear", "ev-ph-move", "ev-ph-del"]) assert.match(m, new RegExp(`act === "${act}"`), `main.js 沒接 ${act}`);
  for (const id of ["ev-cover-file", "ev-photo-files"]) assert.match(m, new RegExp(`e\\.target\\.id === "${id}"`), `main.js 沒聽 ${id}`);
  assert.match(m, /e\.target\.dataset\.act === "ev-ph-consent"/);
  // 會重畫的每一條路，重畫前都先把打到一半的字收起來
  assert.ok((m.match(/keepEventTyped\(\);/g) || []).length >= 7, "七個會重畫的動作都先收字");
  // 錯誤講人話
  for (const k of ["photo_not_https", "too_many_photos", "no_such_photo", "Bucket not found", "not_form_creator", "event_photos_list"]) assert.match(d, new RegExp(`\\["${k}", "`), `says() 沒有 ${k}`);
  assert.ok(d.indexOf('["event_photos_list"') < d.indexOf('["Could not find the function"'), "照片那一句要排在通用那一句前面，不然會被蓋掉");
});

test("★ smoke.sh 有跑這一支，而且有四條反向的斷言；後台的樣式只用品牌色", () => {
  const sm = read("scripts/db/smoke.sh");
  assert.match(sm, /supabase\/migrations\/2027-01-01-event-photos\.sql/);
  for (const s of ["anon 讀不到 event_photos 表本身", "不在這個 team 的幹部加不了照片（not_event_editor）", "不在這個 team 的幹部拿不掉照片（not_event_editor）",
    "沒勾同意的照片對外看不到", "草稿活動對外什麼都不回（空值）", "活動撤下來之後，對外那一支也回空值"]) assert.ok(sm.includes(s), `smoke.sh 少了：${s}`);
  const css = read("admin/admin.css");
  const block = css.slice(css.indexOf("/* 活動編輯頁的下半（2026-11-23"), css.indexOf("/* 行銷需求單（2026-10-31）"));
  assert.match(block, /\.ev-panel\{/); assert.match(block, /\.ev-acts\{display:flex/);
  for (const c of block.match(/rgba\([^)]*\)/g) || []) assert.match(c, /^rgba\((16,42,134|255,255,255),/, `${c} 不是品牌色`);
  assert.doesNotMatch(block, /#[0-9a-fA-F]{3,8}\b/, "不寫死色碼");
});

test("★ 活動的開始與結束是台灣時間，不看填的人電腦在哪個時區", () => {
  // 台灣 2027-01-03 09:00 = UTC 01:00
  assert.equal(F.evFromTaipei("2027-01-03T09:00"), "2027-01-03T01:00:00.000Z");
  assert.equal(F.evTaipei("2027-01-03T01:00:00Z"), "2027-01-03T09:00");
  assert.equal(F.evTaipei(F.evFromTaipei("2027-01-03T17:00")), "2027-01-03T17:00", "來回一趟不變");
  // 在芝加哥填的舊資料（當地 09:00 = 台灣 23:00）會照實顯示成台灣晚上十一點，填的人看得出來要改
  assert.equal(F.evTaipei("2027-01-03T15:00:00Z"), "2027-01-03T23:00");
  assert.equal(F.evFromTaipei(""), ""); assert.equal(F.evTaipei(null), ""); assert.equal(F.evFromTaipei("亂打"), "");
  const main = readFileSync("admin/src/main.js", "utf8");
  assert.match(main, /const iso = v => UI\.evFromTaipei\(v\);\s*const patch = \{ title_zh/, "存的時候走台灣時間");
});
