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
  // 2026-11-23：時間一律印台灣時間、字裡寫明（UTC 01:00 是台灣 09:00；15:59 是 23:59），不看跑測試的機器在哪個時區。
  assert.equal(both[0], "2026-12-01 09:00 開放（台灣時間）"); assert.equal(both[1], "2026-12-20 23:59 截止（台灣時間）");
  assert.deepEqual(F.evFormFacts({ ...FORM, opens_at: "2026-12-01T01:00:00Z", closes_at: "2026-12-20T15:59:00Z" }, 3, 40, true), ["已報名 3 / 40 人"], "改得動的人看到的是底下那兩格，這一行不重複印時間");
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
  assert.match(h, /<div class="ev-panel" id="ev-form"><h3>報名表 <span id="ev-fm-tags"><span class="tag draft">還在寫<\/span><\/span><\/h3>/);
  assert.match(h, /<p class="ev-line">已報名 3 \/ 40 人<\/p>/);
  assert.match(h, /報名表還在寫，外面的人看不到/);
  for (const act of ["open-form", "open-apps", "open-notice", "open-checkin"]) assert.match(h, new RegExp(`<button class="btn ghost sm" data-act="${act}" data-id="f1"`), `${act} 要是按鈕`);
  assert.match(h, /<button class="btn sm" data-act="ev-form-status" data-id="f1" data-v="open">開放報名<\/button>/);
  // 2026-11-23：「誰能改這場活動」搬到最下面的「其他設定」（跟報名沒有關係），按鈕本身一個字都沒改。
  assert.doesNotMatch(h, /members-open/, "報名這一段不再有成員那顆");
  assert.match(F.eventMembersHTML(EV, DIR, false), /<div class="ev-panel" id="ev-members"><h3>這場活動的成員<\/h3>[\s\S]*<button class="btn ghost sm" data-act="members-open" data-ws="custom:event-winter-camp-2027" data-name="2027 冬令營">誰能改這場活動<\/button>/);
  assert.equal(F.eventMembersHTML(EV, EDITOR, false), "", "成員要「管」"); assert.equal(F.eventMembersHTML(EV, VIEWER, false), "");
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
  assert.match(edit, /data-act="ev-form-status"/);
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
  assert.match(F.eventEditHTML(noForm, null, null, DIR, "", false), /data-act="members-open"/, "沒有報名表也改得了成員（那顆在「其他設定」）");
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

// 2026-11-24 改成一格一格的小圖（Paul：「the photo is way too big. If I have like 30 photos on them, there'll be no place to fit」）。
// 小圖上只有照片與兩顆箭頭；同意、拿掉這張搬到放大的那一格（下一條測試）。
test("★ 活動照片：一格一格的小圖，點了放大；底下兩顆箭頭排順序；對外看不到的有標籤；一次可以選好幾張；改不動的人整塊不畫", () => {
  const h = F.eventPhotosHTML(EV, PHOTOS, true, false, {});
  assert.match(h, /^<div class="ev-panel" id="ev-photos"><h3>活動照片 <span class="hint">3<\/span>/, "2026-11-23 起是「照片」那一段裡的一塊，不是自己一整段");
  assert.match(h, /<ul class="ev-thumbs">/); assert.doesNotMatch(h, /hi-photo/, "不再用歷史頁那種一張一大格的版面");
  assert.equal(count(h, /<li class="ev-thumb(?: off)?">/g), 3); assert.equal(count(h, /<li class="ev-thumb off">/g), 2, "沒勾同意的那兩張變淡");
  assert.equal(count(h, /<img src="[^"]+" alt="" loading="lazy">/g), 3);
  assert.match(h, /<button type="button" class="ev-thumb-b" data-act="ev-ph-open" data-id="p1" aria-label="放大看第 1 張，共 3 張">/, "照片本身是一顆按鈕，點了放大");
  assert.match(h, /data-act="ev-ph-move" data-id="p1" data-dir="-1" aria-label="往前一格" title="往前一格" disabled>←</, "第一張不能再往前");
  assert.match(h, /data-act="ev-ph-move" data-id="p1" data-dir="1" aria-label="往後一格" title="往後一格">→</);
  assert.match(h, /data-act="ev-ph-move" data-id="p3" data-dir="1" aria-label="往後一格" title="往後一格" disabled>→</, "最後一張不能再往後");
  assert.doesNotMatch(h, />往前<|>往後<|Earlier|Later/, "「往前」「往後」那兩個字換成箭頭了");
  assert.doesNotMatch(h, /ev-ph-del|ev-ph-consent/, "拿掉與同意不在小圖上，在放大的那一格裡（整頁才不會有兩顆一樣的按鈕）");
  assert.match(h, /<input type="file" id="ev-photo-files" accept="image\/\*" multiple data-id="e1">/);
  assert.match(h, /沒勾的不會出現在對外頁/); assert.match(h, /點照片可以放大看/);
  assert.equal(count(h, /<span class="tag draft ev-thumb-tag">對外看不到<\/span>/g), 2, "對外看不到的那兩張，小圖上有標籤");
  // 三十張也只是三十格小圖
  const many = Array.from({ length: 30 }, (_, i) => ({ id: "m" + i, url: UP.replace("ab12cd", "m" + i), consent: true, sort: i * 10 }));
  const big = F.eventPhotosHTML(EV, many, true, false, {});
  assert.equal(count(big, /<li class="ev-thumb">/g), 30); assert.match(big, /aria-label="放大看第 30 張，共 30 張"/);
  // 空的、還在載、遷移檔還沒跑
  assert.match(F.eventPhotosHTML(EV, [], true, false, {}), /還沒有照片。[\s\S]*ev-photo-files/);
  assert.match(F.eventPhotosHTML(EV, undefined, true, false, {}), /載入中/);
  const noSql = F.eventPhotosHTML(EV, null, true, false, {});
  assert.match(noSql, /2027-01-01-event-photos\.sql/); assert.match(noSql, /封面可以先用貼連結的/); assert.doesNotMatch(noSql, /ev-photo-files/);
  // 上傳中
  const going = F.eventPhotosHTML(EV, PHOTOS, true, true, { photoUp: { pct: 30, name: "b.jpg", i: 2, n: 5 } });
  assert.match(going, /第 2 張，共 5 張：傳 b\.jpg 中/); assert.doesNotMatch(going, /ev-photo-files/);
  assert.match(going, /data-act="ev-ph-move" data-id="p2" data-dir="-1"[^>]* disabled>/, "忙的時候箭頭按不動");
  // 改不動的人
  assert.equal(F.eventPhotosHTML(EV, PHOTOS, false, false, {}), "");
});

test("★ 放大的那一格：第幾張、左右換照片、同意、往前往後一格、拿掉這張；只有一張沒有左右；找不到那一張回空字串", () => {
  const h = F.evLightboxHTML(EV, PHOTOS, "p2", false);
  assert.match(h, /<b class="ev-lb-n">第 2 張，共 3 張<\/b><span class="tag draft">對外看不到<\/span>/);
  assert.match(h, /data-act="ev-lb-close">關掉</);
  assert.match(h, /data-act="ev-lb-go" data-dir="-1" aria-label="上一張" title="上一張">←</); assert.match(h, /data-act="ev-lb-go" data-dir="1" aria-label="下一張" title="下一張">→</);
  assert.match(h, new RegExp(`<img class="ev-lb-img" src="${PHOTOS[1].url.replace(/[.?/]/g, "\\$&")}" alt="">`));
  assert.match(h, /data-act="ev-ph-consent" data-noauto="1" data-id="p2"><span>這張照片裡的人與那場活動都在拍攝同意範圍內<\/span>/, "同意那句話跟封面的一字不差，沒勾的就是沒勾");
  assert.match(F.evLightboxHTML(EV, PHOTOS, "p1", false), /data-act="ev-ph-consent" data-noauto="1" data-id="p1" checked>/);
  assert.match(h, /data-act="ev-ph-move" data-id="p2" data-dir="-1">← 往前一格</); assert.match(h, /data-act="ev-ph-move" data-id="p2" data-dir="1">往後一格 →</);
  assert.match(F.evLightboxHTML(EV, PHOTOS, "p1", false), /data-act="ev-ph-move" data-id="p1" data-dir="-1" disabled>/, "第一張不能再往前");
  assert.match(F.evLightboxHTML(EV, PHOTOS, "p3", false), /data-act="ev-ph-move" data-id="p3" data-dir="1" disabled>/, "最後一張不能再往後");
  assert.equal(count(h, /data-act="ev-ph-del" data-id="p2">拿掉這張</g), 1);
  // 標籤：活動還沒上架，勾了同意的寫「上架後看得到」；上架了寫「對外看得到」
  assert.match(F.evLightboxHTML(EV, PHOTOS, "p1", false), /<span class="tag ok">活動上架後對外看得到<\/span>/);
  assert.match(F.evLightboxHTML({ ...EV, status: "published" }, PHOTOS, "p1", false), /<span class="tag open">對外看得到<\/span>/);
  // 忙的時候：同意、排順序、拿掉都按不動，左右換照片照樣可以
  const busy = F.evLightboxHTML(EV, PHOTOS, "p2", true);
  assert.match(busy, /data-act="ev-ph-consent" data-noauto="1" data-id="p2" disabled>/); assert.match(busy, /data-act="ev-ph-del" data-id="p2" disabled>/);
  assert.match(busy, /data-act="ev-lb-go" data-dir="1" aria-label="下一張" title="下一張">/);
  // 只有一張：沒有左右；找不到：空字串（main.js 會把那一格關掉）
  assert.doesNotMatch(F.evLightboxHTML(EV, PHOTOS.slice(0, 1), "p1", false), /ev-lb-go/);
  assert.equal(F.evLightboxHTML(EV, PHOTOS, "nope", false), ""); assert.equal(F.evLightboxHTML(EV, undefined, "p1", false), "");
  // 網址裡的怪字不會變成 HTML
  assert.doesNotMatch(F.evLightboxHTML(EV, [{ id: "x", url: 'https://a/"><script>', consent: true }], "x", false), /<script>/);
});

test("evLbStep：往左往右一張，到頭繞回另一頭；找不到現在那一張回 null", () => {
  assert.equal(F.evLbStep(PHOTOS, "p1", 1), "p2"); assert.equal(F.evLbStep(PHOTOS, "p2", -1), "p1");
  assert.equal(F.evLbStep(PHOTOS, "p3", 1), "p1", "最後一張再往右是第一張"); assert.equal(F.evLbStep(PHOTOS, "p1", -1), "p3", "第一張再往左是最後一張");
  assert.equal(F.evLbStep(PHOTOS.slice(0, 1), "p1", 1), "p1"); assert.equal(F.evLbStep(PHOTOS, "nope", 1), null); assert.equal(F.evLbStep(null, "p1", 1), null);
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

test("★ 記分卡是一顆次要的按鈕，上面一句話講它是什麼；種類與屆別自己一塊（2026-11-23 起在「其他設定」）", () => {
  const h = F.eventAfterHTML(EV, true, false, null) + F.eventMetaHTML(EV, [{ id: "2026-27" }], true, false);
  assert.doesNotMatch(F.eventAfterHTML(EV, true, false, null), /ev-kind|ev-term/, "活動之後那一段不再有種類與屆別");
  assert.match(h, /<div class="ev-panel"><h3>完整記分卡<\/h3>\s*<p class="ev-line">記分卡是這場活動在 Records 的那一頁[^<]*<\/p>\s*<div class="ev-help">錄取與簽到的人[^<]*<\/div>\s*<div class="ev-acts"><a class="btn ghost sm" href="\/admin\/records\/#overview\/e1">打開完整記分卡<\/a>/);
  assert.match(h, /<div class="ev-panel" id="ev-meta"><h3>種類與屆別<\/h3>[\s\S]*<select id="ev-kind" data-id="e1">[\s\S]*<select id="ev-term" data-id="e1">/);
  assert.doesNotMatch(h, /class="form-foot"><a class="btn ghost sm" href="\/admin\/records/, "不再是掛在一條線底下的一顆");
});

// ── 2026-11-23 重排：順序、每一段同一個樣子、狀態那一行、預覽收起來、報名的開放與截止時間 ──
// Paul：「It doesn't make sense to have going live, project in that order. If I wanted to make an event, it should be in a certain order
//        that makes it efficient and it makes sense.」
const SECTIONS = ["ev-content", "ev-when", "ev-listing", "ev-pics", "ev-speakers", "ev-signup", "ev-live", "ev-links", "ev-after", "ev-house"];
const secOf = (h, id) => { const a = h.indexOf(`<section class="section" id="${id}">`); assert.ok(a >= 0, `找不到 ${id} 那一段`); const b = h.indexOf('<section class="section"', a + 10); return h.slice(a, b < 0 ? h.length : b); };
// 這一支的 EV 沒有計畫那四欄（那是遷移檔還沒跑的樣子），整頁的測試補上，四格才畫得出來。
const PG = { usual_month: null, recurring: false, edition_zh: "", edition_en: "" };
const fullPage = (ev, me, x) => F.eventEditHTML({ ...PG, ...(ev || EV) }, FORM, 3, me || DIR, "", false, [{ id: "v1", name: "台大", city: "台北" }], [{ id: "2026-27" }], { money: null, requests: [] },
  { event: { numbers: {} }, review: null, forms: [] }, [], Object.assign({ photos: PHOTOS, speakers: [], tickets: [] }, x || {}));

test("★ 整頁的順序：狀態那一行 → 內容 → 時間與地點 → 對外怎麼列 → 照片 → 講者 → 報名 → 上線 → 行銷與錢 → 活動之後 → 其他設定", () => {
  const h = fullPage();
  const at = s => { const i = h.indexOf(s); assert.ok(i >= 0, `找不到 ${s}`); return i; };
  const order = ['id="ev-state"', ...SECTIONS.map(id => `<section class="section" id="${id}">`)].map(at);
  assert.deepEqual(order, order.slice().sort((a, b) => a - b), "十段照「辦一場活動會先做什麼」排");
  assert.equal(count(h, /<section class="section"/g), SECTIONS.length, "沒有多出來或漏掉的一段");
  // 每一段的標題
  for (const [id, title] of [["ev-content", "內容"], ["ev-when", "時間與地點"], ["ev-listing", "對外的「活動與計畫」頁和「團隊」頁上怎麼列"], ["ev-pics", "照片"], ["ev-speakers", "講者"],
    ["ev-signup", "報名與現場"], ["ev-live", "上線"], ["ev-links", "行銷與錢"], ["ev-after", "活動之後"], ["ev-house", "其他設定"]])
    assert.ok(secOf(h, id).startsWith(`<section class="section" id="${id}"><h2>${title}`), `${id} 的標題不是「${title}」`);
  // 每一格在它該在的那一段裡
  const has = (id, ...needles) => { const s = secOf(h, id); for (const n of needles) assert.ok(s.includes(n), `${id} 那一段裡沒有 ${n}`); };
  has("ev-content", 'id="ev-tzh"', 'id="ev-ten"', 'id="ev-szh"', 'id="ev-sen"', 'id="ev-bzh"', 'id="ev-ben"');
  has("ev-when", 'id="ev-starts"', 'id="ev-ends"', 'id="ev-place"', 'id="ev-cap"', 'id="ev-venue"');
  has("ev-listing", 'id="ev-month"', 'id="ev-recurring"', 'id="ev-edzh"', 'id="ev-eden"');
  has("ev-pics", 'id="ev-cover-file"', 'id="ev-cover"', 'id="ev-consent"', 'id="ev-photos"');
  has("ev-signup", 'data-act="open-form"', 'data-act="ev-form-status"', 'id="ev-fopen"', 'id="ev-fclose"', 'id="ev-tickets"', 'data-act="open-apps"', 'data-act="open-notice"', 'data-act="open-checkin"');
  has("ev-live", 'data-act="ev-ready"', "草稿。填好內容");
  has("ev-links", 'data-act="ev-ask-mkt"');
  has("ev-after", 'data-act="ev-fb-create"', 'href="/admin/records/#overview/e1"');
  has("ev-house", 'id="ev-pj-box"', 'id="ev-kind"', 'id="ev-term"', 'data-act="members-open"');
  // 段裡面的順序
  const pics = secOf(h, "ev-pics"); assert.ok(pics.indexOf('id="ev-coverbox"') < pics.indexOf('id="ev-photos"'), "封面在活動照片上面");
  const su = secOf(h, "ev-signup"); assert.ok(su.indexOf('id="ev-form"') < su.indexOf('id="ev-tickets"') && su.indexOf('id="ev-tickets"') < su.indexOf("行前與當天"), "報名表 → 報名類型 → 行前與當天");
  const ho = secOf(h, "ev-house"); assert.ok(ho.indexOf('id="ev-pj-box"') < ho.indexOf('id="ev-meta"') && ho.indexOf('id="ev-meta"') < ho.indexOf('id="ev-members"'), "專案 → 種類與屆別 → 成員");
  const wh = secOf(h, "ev-when"); assert.ok(wh.indexOf('id="ev-place"') < wh.indexOf('id="ev-venue"'), "場地在地點那一格下面");
  // 會改狀態的按鈕只在「上線」那一段；專案不再是第二段
  assert.equal(count(h, /data-act="ev-(ready|unready|publish|unpublish)"/g), 1);
  assert.ok(at('id="ev-pj-box"') > at('<section class="section" id="ev-after">'), "專案在最後面的其他設定裡");
  assert.equal(count(h, /id="ev-cover"/g), 1, "連結那一格只有一個"); assert.equal(count(h, /id="ev-consent"/g), 1);
  // x 沒給也畫得出來
  const bare = F.eventEditHTML(EV, FORM, 3, DIR, "", false);
  assert.match(bare, /<div class="ev-panel" id="ev-photos"><h3>活動照片<\/h3><div class="mini">載入中/);
  assert.doesNotMatch(fullPage(EV, VIEWER), /id="ev-photos"|ev-cover-file|ev-fb-create|ev-form-status|ev-fopen|data-autosave=/, "只有「看」的人：沒有照片那一塊、沒有任何會改東西的按鈕與格子");
});

test("★ 結束了的活動：「活動之後」搬到狀態那一行的正下面（2026-11-13 Paul 定的），其他照舊", () => {
  const past = fullPage({ ...EV, status: "published", starts_at: "2025-07-01T00:00:00Z" });
  const at = s => { const i = past.indexOf(s); assert.ok(i >= 0, `找不到 ${s}`); return i; };
  assert.ok(at('id="ev-state"') < at('id="ev-after"') && at('id="ev-after"') < at('id="ev-content"'), "狀態 → 活動之後 → 內容");
  assert.ok(at('id="ev-live"') < at('id="ev-links"') && at('id="ev-links"') < at('id="ev-house"'));
  assert.equal(count(past, /id="ev-after"/g), 1, "只畫一次");
});

test("★ 每一段長一樣：一個 h2，底下是一塊一塊的 .ev-panel；沒有光禿禿的小標題、沒有往上拉的負邊界", () => {
  for (const me of [DIR, EDITOR, VIEWER, ASSOC]) {
    const h = fullPage(EV, me);
    for (const id of SECTIONS) {
      if (id === "ev-speakers" && (me === VIEWER || me === ASSOC)) continue;   // 改不動的人沒有講者那一段
      const s = secOf(h, id), body = s.slice(s.indexOf("</h2>") + 5);
      assert.ok(body.startsWith('<div class="ev-panel"') || (id === "ev-after" && /^<div class="(todo ev-kpis|mini ev-gap)"/.test(body)), `${id} 的 h2 底下不是一塊 .ev-panel：${body.slice(0, 60)}`);
    }
    assert.doesNotMatch(h, /class="sec-h"/, "不再有自己一個樣子的小標題");
    assert.doesNotMatch(h, /style="margin:-/, "說明不靠負邊界硬拉上去");
    assert.doesNotMatch(h, /<section class="section"[^>]*><h2>[^<]*<\/h2><div class="note">/, "段的最上面不是一條提醒");
  }
  // 「通常在幾月」的說明在下拉的底下（自己一行），不是接在右邊
  const pg = F.eventProgrammeHTML({ ...EV, usual_month: 1, recurring: true, edition_zh: "", edition_en: "" }, true, false);
  assert.match(pg, /<\/select><span class="ev-help">只有沒填開始時間的時候才用得到/);
  assert.doesNotMatch(pg, /<h3|class="mini"/);
  const css = read("admin/admin.css");
  assert.match(css, /\.ev-help\{display:block;/, "說明自己一行");
  assert.match(css, /\.two > \.ev-help\{grid-column:1\/-1/, "兩欄裡的說明橫跨兩欄");
});

test("★ 最上面那一行狀態：四種狀態各一句、對外中有「看對外的那一頁」、一顆帶你到「上線」；不是一段，也沒有會改狀態的按鈕", () => {
  const draft = F.eventStateHTML(EV);
  assert.match(draft, /^<div class="ev-state" id="ev-state"><span class="tag draft">草稿<\/span><span class="ev-state-t">還沒上線，外面的人看不到。<\/span>/);
  assert.match(draft, /<button type="button" class="btn quiet sm" data-act="ev-jump" data-to="ev-live">到「上線」那一段<\/button><\/div>$/);
  assert.doesNotMatch(draft, /<a |<section|<h2/);
  assert.match(F.eventStateHTML({ ...EV, status: "ready" }), /<span class="tag warn">準備好了<\/span><span class="ev-state-t">等 Co-President 或 Senior Adviser 放上對外頁/);
  const live = F.eventStateHTML({ ...EV, status: "published" });
  assert.match(live, /<span class="tag open">對外中<\/span>/); assert.match(live, /<a class="btn ghost sm" href="\/events\/\?e=winter-camp-2027" target="_blank" rel="noopener">看對外的那一頁<\/a>/);
  assert.match(F.eventStateHTML({ ...EV, status: "archived" }), /<span class="tag">撤下了<\/span><span class="ev-state-t">撤下來了，外面的人看不到。/);
  for (const st of ["draft", "ready", "published", "archived"]) assert.doesNotMatch(F.eventStateHTML({ ...EV, status: st }), /ev-ready|ev-unready|ev-publish|ev-unpublish/);
  const m = read("admin/src/main.js");
  assert.match(m, /if \(act === "ev-jump"\) \{\s*const to = document\.getElementById\(b\.dataset\.to\);\s*if \(to\) to\.scrollIntoView\(/, "只捲過去，不改網址");
  // 整頁上那一行在標題的正下面；唯讀的人接著一句「改不動」
  const view = fullPage(EV, VIEWER);
  assert.match(view, /<\/header><div class="ev-state" id="ev-state">[\s\S]*?<\/div><div class="note">你對這場活動是「看」，改不動。<\/div><section class="section" id="ev-content">/);
});

test("★ 說明底下的預覽收成一行：真的 <details>，中英兩格都是，預設收著；開著沒只記在記憶體，換一場活動就收回去", () => {
  const ev = { id: "e1", body_zh: "## 活動資訊", body_en: "Hello" };
  for (const [lg, id] of [["zh", "ev-bzh"], ["en", "ev-ben"]]) {
    const h = F.eventDescHTML(ev, lg, true, false);
    assert.match(h, new RegExp(`<details class="ev-prev" id="${id}-fold"><summary><span class="chev" aria-hidden="true"></span>對外頁上會長這樣</summary><div class="ev-rt" id="${id}-prev">`), `${lg} 那一格預設收著`);
    assert.match(F.eventDescHTML(ev, lg, true, false, true), new RegExp(`<details class="ev-prev" id="${id}-fold" open>`), "開過的重畫後還開著");
  }
  assert.match(F.eventDescHTML(ev, "zh", true, false), /id="ev-bzh-prev"><h3>活動資訊<\/h3><\/div><\/details>/, "收著的時候裡面一樣是最新的");
  const h = fullPage(); assert.equal(count(h, /<details class="ev-prev"/g), 2); assert.doesNotMatch(h, /<details class="ev-prev"[^>]* open/);
  assert.equal(count(fullPage(EV, DIR, { prevZh: true }), /<details class="ev-prev"[^>]* open>/g), 1);
  const m = read("admin/src/main.js");
  assert.match(m, /"ev-bzh-fold", "ev-ben-fold"\]\.includes\(t\.id\)\) S\.vnOpen\[t\.id\] = t\.open;/, "開關記在 S.vnOpen（記憶體）");
  assert.match(m, /prevZh: !!S\.vnOpen\["ev-bzh-fold"\], prevEn: !!S\.vnOpen\["ev-ben-fold"\]/);
  assert.match(m, /S\.vnOpen\["ev-bzh-fold"\] = false; S\.vnOpen\["ev-ben-fold"\] = false;/, "打開一場活動的時候都是收著的");
  assert.doesNotMatch(m, /localStorage[^\n]*ev-b(zh|en)-fold|ev-b(zh|en)-fold[^\n]*localStorage/, "不存進 localStorage：重新整理就回到收著");
  const css = read("admin/admin.css");
  assert.match(css, /\.ev-prev > summary\{[^}]*cursor:pointer/); assert.match(css, /\.ev-prev\[open\] \.chev\{transform:rotate\(45deg\)\}/);
});

test("★ 報名的開放與截止時間：活動編輯頁上改得到，兩格是台灣時間；「看」的人看到的是一行字；表單編輯頁那兩格同一套", () => {
  const form = { ...FORM, status: "open", opens_at: "2026-12-01T01:00:00Z", closes_at: "2026-12-20T15:59:00Z" };
  const h = F.eventSignupHTML(EV, form, 3, EDITOR, false);
  assert.match(h, /<div class="two ev-fwin" data-autosave="ev-fwin" data-id="f1">/, "自己一個「改了就存」的框，data-id 是報名表的 id");
  assert.match(h, /<label><i>開放報名的時間（台灣時間）<\/i><input id="ev-fopen" name="opens_at" type="datetime-local" value="2026-12-01T09:00"><\/label>/, "UTC 01:00 印成台灣 09:00");
  assert.match(h, /<label><i>截止報名的時間（台灣時間）<\/i><input id="ev-fclose" name="closes_at" type="datetime-local" value="2026-12-20T23:59"><\/label>/);
  assert.match(h, /要先按「開放報名」，這兩個時間才有用/); assert.match(h, /<span class="autosave" data-for="ev-fwin" data-id="f1">改了就存<\/span>/);
  assert.match(h, /<p class="ev-line">已報名 3 \/ 40 人<\/p>/, "有那兩格的人，上面那一行不重複印時間");
  assert.match(F.eventSignupHTML(EV, FORM, 3, EDITOR, false), /id="ev-fopen" name="opens_at" type="datetime-local" value="">/, "沒設過是空的");
  assert.match(F.eventSignupHTML(EV, form, 3, EDITOR, true), /id="ev-fopen"[^>]* disabled>/, "忙的時候按不了");
  const view = F.eventSignupHTML(EV, form, 3, VIEWER, false);
  assert.doesNotMatch(view, /ev-fopen|ev-fclose|ev-fwin/, "只有「看」的人沒有那兩格");
  assert.match(view, /<p class="ev-line">2026-12-01 09:00 開放（台灣時間）・2026-12-20 23:59 截止（台灣時間）・已報名 3 \/ 40 人<\/p>/);
  assert.doesNotMatch(F.eventSignupHTML({ ...EV, form_id: null }, null, null, EDITOR, false), /ev-fopen/, "沒有報名表就沒有那兩格");
  // 狀態旁邊的標籤與底下那一句：時間一改就要跟著換（main.js 存完只換這兩小塊，不重畫）
  const pub = { ...EV, status: "published" };
  assert.deepEqual(F.evFormBits(pub, { ...FORM, status: "open", opens_at: "2099-01-01T00:00:00Z" }, 0), { tags: '<span class="tag open">開放中</span> <span class="tag warn">還沒到開放時間</span>', hint: "" });
  assert.deepEqual(F.evFormBits(pub, { ...FORM, status: "open", closes_at: "2020-01-01T00:00:00Z" }, 0), { tags: '<span class="tag open">開放中</span> <span class="tag warn">過了截止時間</span>', hint: "" });
  assert.deepEqual(F.evFormBits(pub, { ...FORM, status: "open" }, 0), { tags: '<span class="tag open">開放中</span>', hint: "現在收得到報名。" });
  assert.match(h, /<span id="ev-fm-tags">/); assert.match(h, /<div class="ev-help" id="ev-fm-hint">/);
  // 台灣時間的兩支：不管在哪個時區跑都一樣；空的回空的
  assert.equal(F.evTaipei("2026-12-01T01:00:00Z"), "2026-12-01T09:00"); assert.equal(F.evTaipei("2026-12-31T16:30:00+00:00"), "2027-01-01T00:30", "跨日也對");
  assert.equal(F.evFromTaipei("2026-12-01T09:00"), "2026-12-01T01:00:00.000Z"); assert.equal(F.evFromTaipei(""), ""); assert.equal(F.evTaipei(null), "");
  assert.equal(F.evTaipei(F.evFromTaipei("2027-03-23T00:00")), "2027-03-23T00:00", "存進去再讀出來是同一個時間（不會每存一次差一次時區）");
  // 表單編輯頁：同一套、有寫台灣時間
  const fe = F.formHTML({ ...form, title: "報名", intro: "", kind: "program", lang: "zh", notify_by: null, interview_url: "" }, [], true, [], "", false);
  assert.match(fe, /<label><i>開放時間（台灣時間，不填就是立刻）<\/i>\s*<input id="fopen" name="opens_at" type="datetime-local" value="2026-12-01T09:00"><\/label>/);
  assert.match(fe, /<label><i>截止時間（台灣時間，不填就是不自動關）<\/i>\s*<input id="fclose" name="closes_at" type="datetime-local" value="2026-12-20T23:59"><\/label>/);
  // main.js：兩邊存的時候都用 evFromTaipei；活動頁那兩格走的是表單編輯頁同一支 saveForm，沒有新的資料庫函式
  const m = read("admin/src/main.js"), d = read("admin/src/data.js");
  assert.match(m, /opens_at: UI\.evFromTaipei\(val\("fopen"\)\),\s*closes_at: UI\.evFromTaipei\(val\("fclose"\)\),/);
  assert.doesNotMatch(m, /new Date\(val\("f(open|close)"\)\)/, "不再照這台電腦的時區算");
  const win = m.slice(m.indexOf('if (act === "ev-fwin") {'), m.indexOf('if (act === "mt-min") {'));
  assert.ok(win.length > 200, "onAutosave 有接 ev-fwin");
  assert.match(win, /UI\.evFromTaipei\(el\.value\)/); assert.match(win, /await D\.saveForm\(id, patch\);/);
  assert.doesNotMatch(win, /render\(\)/, "存完不重畫（正在打的那一格游標不會跳）"); assert.match(win, /UI\.evFormBits\(ev, f, S\.evSigned\)/);
  assert.doesNotMatch(win, /\.rpc\(|supabase/);
  assert.match(d, /const FORM_FIELDS = \[[^\]]*"opens_at", "closes_at"/, "saveForm 本來就收這兩欄");
  // 會議的開始與結束不動：幹部在好幾個國家，會議照各自電腦的時間
  const ui = read("admin/src/ui.js");
  assert.match(ui, /<input id="mt-starts" name="starts_at" type="datetime-local" value="\$\{esc\(mtLocal\(v\.starts_at\)\)\}"/);
  assert.match(ui, /<input id="mt-ends" name="ends_at" type="datetime-local" value="\$\{esc\(mtLocal\(v\.ends_at\)\)\}"/);
});

test("★ 這一頁有四塊「改了就存」（內容、時間與地點、對外怎麼列、封面），存的都是同一條路；場地、種類、專案不在框裡", () => {
  const h = fullPage();
  assert.equal(count(h, /data-autosave="ev-save" data-id="e1"/g), 4);
  assert.equal(count(h, /class="autosave" data-for="ev-save" data-id="e1"/g), 4, "每一塊各自一行「改了就存」");
  for (const id of ["ev-content", "ev-when", "ev-listing"]) assert.match(secOf(h, id), /^<section class="section" id="[a-z-]+"><h2>[^<]*(<span class="hint">[^<]*<\/span>)?<\/h2><div class="ev-panel" data-autosave="ev-save" data-id="e1">/, `${id} 的第一塊就是那個框`);
  assert.match(h, /<div class="ev-panel" id="ev-coverbox" data-autosave="ev-save" data-id="e1">/);
  // 每一格都只落在一個框裡，名字沒變（readEvent 照 id 讀整頁）
  const boxes = h.split('data-autosave="ev-save"').slice(1).map(b => b.slice(0, b.indexOf('class="autosave" data-for="ev-save"')));
  const names = boxes.map(b => [...b.matchAll(/ name="([a-z_]+)"/g)].map(m => m[1]));
  assert.deepEqual(names, [["title_zh", "title_en", "summary_zh", "summary_en", "body_zh", "body_en"], ["starts_at", "ends_at", "place", "capacity"],
    ["usual_month", "recurring", "edition_zh", "edition_en"], ["cover_url", "cover_consent"]]);
  for (const b of boxes) assert.doesNotMatch(b, /id="ev-venue"|id="ev-kind"|id="ev-term"|id="ev-project"|data-act="ev-ph-consent"/, "選了就存的那幾格不在「改了就存」的框裡（各有各的路）");
  assert.match(read("admin/src/main.js"), /const patch = \{ title_zh: val\("ev-tzh"\)[^\n]*\n\s*starts_at: iso\(val\("ev-starts"\)\)[^\n]*cover_url: val\("ev-cover"\), cover_consent: chk\("ev-consent"\) \};/, "readEvent 還是照 id 把整頁讀一遍");
  assert.doesNotMatch(fullPage(EV, VIEWER), /data-autosave=|class="autosave"/, "唯讀的人沒有框也沒有那行小字");
});

test("★ 重排用到的字中英都有，沒有破折號與 emoji；「通常在幾月」的說明不再寫已經改名的「這一年」", () => {
  const keys = ["ev.top.draft", "ev.top.ready", "ev.top.published", "ev.top.archived", "ev.jumpLive", "ev.when", "ev.picsSec", "ev.house", "ev.houseHint", "ev.membersSec",
    "ev.pg", "ev.pgHint", "ev.monthHelp", "ev.recurringHelp", "ev.editionHelp", "ev.formEdit", "ev.after", "ev.opens", "ev.fm.closes", "ev.fm.opensAt", "ev.fm.closesAt", "ev.fm.windowHelp", "form.opens", "form.closes"];
  for (const k of keys) { assert.ok(FS.STRINGS[k] && FS.STRINGS[k].zh && FS.STRINGS[k].en, `字典裡沒有 ${k}`); for (const l of ["zh", "en"]) { assert.doesNotMatch(FS.STRINGS[k][l], /[—–]/, `${k} 有破折號`); assert.doesNotMatch(FS.STRINGS[k][l], /\p{Extended_Pictographic}/u, `${k} 有 emoji`); } }
  for (const k of ["ev.monthHelp", "ev.recurringHelp", "ev.editionHelp", "ev.pg"]) { assert.doesNotMatch(FS.STRINGS[k].zh, /這一年/, k); assert.doesNotMatch(FS.STRINGS[k].en, /This year page/, k); }
  assert.match(FS.STRINGS["ev.monthHelp"].zh, /沒填開始時間的時候才用得到[\s\S]*「活動與計畫」頁/); assert.match(FS.STRINGS["ev.monthHelp"].en, /Programmes page/);
  assert.match(FS.STRINGS["ev.recurringHelp"].zh, /「團隊」頁那個 team 底下/); assert.match(FS.STRINGS["ev.editionHelp"].zh, /當大標題，原本的名稱放在旁邊/);
  for (const k of ["ev.fm.opensAt", "ev.fm.closesAt", "form.opens", "form.closes", "ev.opens", "ev.fm.closes"]) { assert.match(FS.STRINGS[k].zh, /台灣時間/, k); assert.match(FS.STRINGS[k].en, /Taiwan time/, k); }
  F.setLang("en");
  const en = fullPage().replace(/<[^>]+>/g, " ").replace(/2027 冬令營|台北|台大/g, "");
  assert.doesNotMatch(en, /[一-鿿]/, "英文模式不該剩中文：" + (en.match(/[^\s]*[一-鿿]+[^\s]*/) || [""])[0]);
  F.setLang("zh");
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
