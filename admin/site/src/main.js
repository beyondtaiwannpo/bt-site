// 後台「對外」那一組的邏輯：資源、團隊頁、校友頁、信件文案。
// 2026-10-15 從 admin/src/main.js 原樣搬過來（後台拆成四個資料夾，見 README「後台的四個資料夾」）。
//
// 狀態只有一個 S，畫面只從 S 產生。**不在事件處理裡直接改 DOM**，一律改 S 再 render()。
import * as AUTH from "../../../shared/auth.js";
import { navHTML } from "../../../shared/nav.js";
import * as D from "./data.js";
import * as UI from "./ui.js";
import { T, lang, setLang, pickLang, STORE_KEY } from "./strings.js";

const HERE = "/admin/site/";

let S = {
  user: null, me: null, down: false, busy: false, msg: "",
  view: "res",             // res | res-edit | team | stories | mail | mail-edit | history | history-edit
  res: [], resEditing: null,
  people: [],
  // 校友頁與信件文案**一定要有初始值**：少了它，載入失敗之後再 render 一次會整頁空白，
  // 而這個 repo 的規矩是「連不上資料庫也要畫得出東西」。
  stories: [],
  tpls: [], tplKind: null,
  // 歷史之路（2026-11-06）：hist 是 loadMilestones() 整形後的清單；hiSel 打開的那一站 id（"new" 是新的一站）；hiUp 上傳中 { pct, name }。
  hist: [], hiSel: null, hiUp: null,
};

const root = () => document.getElementById("bt-root");
// Director 與 President 改得動資源，一般幹部唯讀。**這只是畫面，真正的門在資料庫的 RLS。**
// 2026-10-24 起看指派：對任何一個 res: 工作區是「改」或「管」的人才有「新增資源」；
// 團隊頁、校友頁、信件文案給 Co-President 與 Senior Adviser（senior）。門仍在資料庫。
const canEdit = () => UI.canEditAny(S.me, "res:");
const isPres = () => !!S.me && !!S.me.senior;

function render() {
  const el = root();
  if (!el) return;
  // 頂欄畫在 #bt-root 裡面，不 insertAdjacentHTML 到 <body>（理由見 admin/src/main.js 同一段）。
  const nav = S.me ? navHTML({ current: "admin", role: S.me.role, name: S.me.name }) : "";

  if (S.down) { el.innerHTML = UI.shellHTML(nav, "", UI.downHTML(S.downErr)); return; }
  if (!S.user) { location.replace("../../app/?next=admin-site"); return; }
  if (!S.me || S.me.role !== "cadre") { el.innerHTML = UI.shellHTML(nav, "", UI.notCadreHTML()); return; }

  let body;
  if (S.view === "mail") {
    body = UI.mailListHTML(S.tpls, S.msg);
  } else if (S.view === "mail-edit") {
    body = UI.mailEditHTML(S.tplKind, S.tplDraft || S.tpls.find(t => t.kind === S.tplKind), S.msg, S.busy, S.mailPrev);
  } else if (S.view === "team") {
    body = UI.publicTeamHTML(S.people, S.msg, S.busy);
  } else if (S.view === "stories") {
    body = UI.alumniStoriesHTML(S.stories, S.msg, S.busy);
  } else if (S.view === "res-edit") {
    body = UI.resEditHTML(S.resEditing, S.msg, S.busy);
  } else if (S.view === "history") {
    body = UI.historyListHTML(S.hist, S.me, S.msg, S.busy);
  } else if (S.view === "history-edit") {
    const m = S.hiSel === "new" ? null : S.hist.find(x => x.id === S.hiSel);
    body = (S.hiSel === "new" || m) ? UI.historyEditHTML(m, S.me, S.msg, S.busy, S.hiUp)
      : UI.pageHead(T("hi.notFound"), "", [], { act: "hi-back", label: T("hi.back") }) + UI.msgHTML(S.msg);
  } else if (S.view === "members" && S.mp) {
    body = UI.membersPanelHTML(S.mp, S.msg, S.busy);
  } else {
    body = UI.resListHTML(S.res, canEdit(), S.msg, isPres(), UI.mpItems(S.me, "res:", S.workspaces));
  }
  // 側欄亮哪一行：編輯畫面算在它所屬的那個分頁底下。
  const tab = { "res-edit": "res", "mail-edit": "mail", "members": "res", "history-edit": "history" }[S.view] || S.view;
  el.innerHTML = UI.shellHTML(nav, UI.railHTML("site", tab, S.me), body);
  UI.afterRender(S, el);
}

// 側欄與頂欄先畫（2026-11-06，後台速度）：知道我是誰就先把外殼畫出來，內容那一格放骨架，資料回來 render() 整個換掉。
// S.me 從分頁快取拿幾乎不用等（shared/auth.js 的 whoAmI），所以外殼可以在第一趟資料回來之前就在。
function paintShell(tab) {
  const el = root();
  if (!el || !S.me) return;
  const nav = navHTML({ current: "admin", role: S.me.role, name: S.me.name });
  el.innerHTML = UI.shellHTML(nav, UI.railHTML("site", tab || "", S.me), UI.skeletonHTML());
  UI.afterRender(S, el);
  // 線上有沒有更新的版本（理由見 admin/src/main.js 同一段）。
  UI.checkVersion("../../");
}
// 開頁連不上先自己再試一次（兩秒後），第二次才顯示「資料庫休眠中」。
// 2026-10-23 盤點時 Settings 一次載入失敗就整頁變成那一句，重開就好；一次抖動不該讓人去寄信求救。
function retryBoot() { return new Promise(r => setTimeout(() => r(boot(true)), 2000)); }
async function boot(retried) {
  try {
    const who = await AUTH.currentUserDetailed();
    if (who.offline) { if (!retried) return retryBoot(); S.down = true; render(); return; }
    S.user = who.user;
    if (!S.user) { render(); return; }
    // 2026-11-06：工作區清單不需要知道我是誰，跟「我是誰」同時發；我是誰一回來先畫側欄。
    const wsP = D.loadWorkspaces().catch(() => []);
    S.me = await D.loadMe(S.user.id);
    if (!S.me || S.me.role !== "cadre") { render(); return; }
    // ?tab=team 這種連結可以直接開到某一個分頁（README 裡的連結用得到）。
    // Co-President 專用的分頁對其他人回到資源，不報錯。
    const want = location.hash.slice(1) || new URLSearchParams(location.search).get("tab");
    paintShell(want);
    S.workspaces = await wsP;
    await openTab(want);
  } catch (e) {
    // 票已經不能用了：先清掉本機那張壞票再去登入頁（理由見 admin/src/main.js 同一段）。
    if (AUTH.sessionGone(e)) { await AUTH.signOut(); location.replace("../../app/?next=admin-site"); return; }
    console.error(HERE + " 載入失敗：", e);
    if (!retried) return retryBoot();
    S.downErr = String(e && e.message || e); S.down = true; render();
  }
}

// 哪一個分頁：Co-President 專用的對其他人回到資源，不報錯。側欄、上一頁、網址列改 # 都走這裡。
async function openTab(want) {
  // 歷史之路（2026-11-06）：#history 清單，#history/<id> 一站，#history/new 新的一站。幹部都看得到清單。
  const hi = /^history(?:\/([a-z0-9-]+))?$/.exec(want || "");
  if (hi) { await openHistory(hi[1] || null); return; }
  if (want === "team" && isPres()) await openTeam();
  else if (want === "stories" && isPres()) await openStories();
  else if (want === "mail" && isPres()) await openMail();
  else await openRes();
}
// 信件文案那一頁的六格讀成一個物件（切換預覽重畫前先收起來，不然打到一半的字會不見）。
function readMailForm() {
  const val = id => { const el = document.getElementById(id); return el ? el.value : undefined; };
  if (val("msub") === undefined) return S.tplDraft || {};
  S.tplDraft = { kind: S.tplKind, subject: val("msub").trim(), body: val("mbody").trim(), subject_en: (val("msub-en") || "").trim(), body_en: (val("mbody-en") || "").trim(), button_label: (val("mbtn") || "").trim(), button_label_en: (val("mbtn-en") || "").trim() };
  return S.tplDraft;
}
async function openMail() {
  S.busy = true; render();
  try {
    S.tpls = await D.loadTemplates();
    S.view = "mail"; S.busy = false;
  } catch (e) { S.busy = false; S.msg = T("err.tplLoad") + D.says(e); }
  render();
}

async function openTeam() {
  S.busy = true; render();
  try {
    S.people = await D.loadPublicCandidates();
    S.view = "team"; S.busy = false;
  } catch (e) { S.busy = false; S.msg = T("err.rosterLoad") + D.says(e); }
  render();
}

// 校友頁的核可清單。整份只有 Co-President 叫得動（門在資料庫那一支函式裡）。
async function openStories() {
  S.busy = true; render();
  try {
    S.stories = await D.loadStories();
    S.view = "stories"; S.busy = false;
  } catch (e) { S.busy = false; S.msg = T("err.storiesLoad") + D.says(e); }
  render();
}

// ── 歷史之路（2026-11-06）────────────────────────────────────────────
async function openHistory(sel) {
  S.busy = true; render();
  try {
    S.hist = UI.hiRows(await D.loadMilestones());
    S.hiSel = sel; S.view = sel ? "history-edit" : "history"; S.busy = false;
  } catch (e) { S.busy = false; S.msg = T("err.hiLoad") + D.says(e); }
  render();
}
async function reloadHistory(msg) {
  S.msg = msg || "";
  try { S.hist = UI.hiRows(await D.loadMilestones()); } catch (e) { S.msg = T("err.hiLoad") + D.says(e); }
  S.busy = false; render();
}
// 一站那張表單讀成一個 patch（只有能編的人看得到這幾格；沒有就回 null）。
function readMilestone() {
  const val = id => { const el = document.getElementById(id); return el ? el.value : undefined; };
  if (val("hi-tzh") === undefined) return null;
  return { title_zh: val("hi-tzh").trim(), title_en: val("hi-ten").trim(), summary_zh: val("hi-szh").trim(), summary_en: val("hi-sen").trim(),
    body_zh: val("hi-bzh"), body_en: val("hi-ben"), happened_on: val("hi-date"), slug: val("hi-slug").trim() };
}
// 瀏覽器端先縮圖再傳（計畫：最長邊 1600）。回一個 JPEG Blob。讀不出來就丟 err.hiResize。
// 用 canvas 不用任何函式庫；EXIF 方向交給瀏覽器（createImageBitmap 的 imageOrientation）。
async function shrinkImage(file) {
  let bmp;
  try { bmp = await createImageBitmap(file, { imageOrientation: "from-image" }); }
  catch (e) { throw new Error(T("err.hiResize")); }
  const { w, h } = UI.hiFit(bmp.width, bmp.height);
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  c.getContext("2d").drawImage(bmp, 0, 0, w, h);
  bmp.close && bmp.close();
  const blob = await new Promise(r => c.toBlob(r, "image/jpeg", 0.86));
  if (!blob) throw new Error(T("err.hiResize"));
  return blob;
}
async function uploadFile(milestoneId, file) {
  if (!UI.hiFileOk(file)) { S.msg = T("err.hiFile"); render(); return; }
  S.busy = true; S.msg = ""; S.hiUp = { pct: 10, name: file.name }; render();
  try {
    const blob = await shrinkImage(file);
    S.hiUp = { pct: 45, name: file.name }; render();
    const url = await D.uploadPhoto(milestoneId, blob);
    S.hiUp = { pct: 85, name: file.name }; render();
    await D.addPhoto(milestoneId, url, "", "", false);
    S.hiUp = null;
    await reloadHistory(T("msg.hiPhotoAdded"));
  } catch (e) { S.hiUp = null; S.busy = false; S.msg = T("err.hiUpload") + D.says(e); render(); }
}

async function openRes() {
  S.busy = true; render();
  try {
    S.res = await D.loadResources();
    S.view = "res"; S.busy = false;
  } catch (e) { S.busy = false; S.msg = T("err.resLoad") + D.says(e); }
  render();
}

// ── 成員分頁（2026-10-23，第三次重整批 3）────────────────────────────
// 對這個工作區是「管」的人在這裡加人、改等級、移出，不用進 /admin/people/。門在 workspace_members / assign / unassign 裡。
// backView：按「回上一頁」回到哪個畫面。
async function openMembers(ws, name, backView) {
  S.busy = true; S.msg = ""; render();
  try {
    const [rows, cadres] = await Promise.all([D.loadMembers(ws), D.loadCadres().catch(() => [])]);
    S.mp = { ws, name, rows: rows || [], cadres, meId: S.user.id, senior: !!S.me.senior, pk: null, backView: backView || (S.mp && S.mp.backView) || S.view };
    S.view = "members"; S.busy = false;
  } catch (e) { S.busy = false; S.msg = T("err.mpLoad") + D.says(e); }
  render();
}
async function reloadMembers(msg) {
  S.msg = msg || "";
  try { S.mp.rows = await D.loadMembers(S.mp.ws) || []; } catch (e) { S.msg = T("err.mpLoad") + D.says(e); }
  S.busy = false; render();
}

document.addEventListener("click", async e => {
  const b = e.target.closest("[data-act]");
  if (!b) return;
  const act = b.dataset.act;
  const id = b.dataset.id;

  if (act === "retry") { location.reload(); return; }
  if (act === "ask-cancel") { UI.cancelAsk(S, root()); return; }
  // ── 成員分頁（2026-10-23，第三次重整批 3）──
  if (act === "members-open") { await openMembers(b.dataset.ws, b.dataset.name); return; }
  if (act === "members-back") { S.view = (S.mp && S.mp.backView) || "res"; S.msg = ""; render(); return; }
  // 多選加人的 chip、全勾、全取消（2026-10-24）：改 pk 再重畫。打字與勾選走 input / change。
  if (["pk-team", "pk-all", "pk-none", "pk-untick"].includes(act) && S.mp && S.view === "members") {
    S.mp.pk = UI.pkReduce(S.mp.pk, S.mp.cadres, S.mp.rows.map(r => r.user_id), b); render(); return;
  }
  if (act === "members-assign" && S.mp) {
    // 一次加一批（2026-10-24）：勾起來的人每一個送一支 assign()（同一道門 can_manage），同時送，30 個人一秒內；沒有新的資料庫函式。
    const ws = S.mp.ws, pk = S.mp.pk || {}, level = pk.level || "view";
    const ids = UI.pkPicked(S.mp.cadres, S.mp.rows.map(r => r.user_id), pk);
    if (!ids.length) { S.msg = T("err.mpPick"); render(); return; }
    S.busy = true; S.msg = ""; render();
    const out = await Promise.all(ids.map(id => D.assign(id, ws, level).then(() => null, e => ({ id, e }))));
    const failed = out.filter(Boolean), done = ids.filter(id => !failed.some(f => f.id === id));
    S.mp.pk = Object.assign({}, pk, { q: "", ticked: failed.map(f => f.id) });
    if (done.length) {
      // 復原移出的是這一批那 N 個人，不多不少。
      const undo = UI.batchUndo(done, id => D.unassign(id, ws));
      S.undo = async () => { S.busy = true; render(); try { const n = await undo(); await reloadMembers(T("msg.mpRemovedN", { n })); } catch (e) { S.busy = false; S.msg = T("err.mpRemove") + D.says(e); render(); } };
    }
    if (failed.length) {
      const names = failed.map(f => UI.mpName(S.mp.cadres.find(c => c.id === f.id) || {})).join(T("punct.list"));
      try { S.mp.rows = await D.loadMembers(ws) || []; } catch (x) { /* 下面的錯誤訊息比較重要 */ }
      S.busy = false; S.msg = T("err.mpSome") + names + T("punct.colon") + D.says(failed[0].e); render(); return;
    }
    await reloadMembers(T("msg.mpAssignedN", { n: done.length, level: T("level." + level) }));
    return;
  }
  if (act === "members-cleanup" && S.mp) {
    // 清掉靠職級就有一切的人身上多餘的指派（2026-10-24）。復原是照原本的等級派回去。
    const ws = S.mp.ws, ids = String(b.dataset.ids || "").split(",").filter(Boolean);
    const was = ids.map(id => ({ id, level: (S.mp.rows.find(r => r.user_id === id) || {}).level || "view" }));
    if (!ids.length) return;
    S.busy = true; S.msg = ""; render();
    try {
      for (const id of ids) await D.unassign(id, ws);
      S.undo = async () => { S.busy = true; render(); try { for (const w of was) await D.assign(w.id, ws, w.level); await reloadMembers(T("msg.uncleaned", { n: was.length })); } catch (e) { S.busy = false; S.msg = T("err.mpAssign") + D.says(e); render(); } };
      await reloadMembers(T("msg.cleaned", { n: ids.length }));
    } catch (e) { S.busy = false; S.msg = T("err.mpRemove") + D.says(e); render(); }
    return;
  }
  if (act === "members-unassign" && S.mp) {
    const r = S.mp.rows.find(x => x.user_id === b.dataset.id); if (!r) return;
    if (UI.needAsk(S, b, T("confirm.mpRemove", { name: UI.mpName(r) }))) return;
    const ws = S.mp.ws, was = r.level;
    S.busy = true; S.msg = ""; render();
    try {
      await D.unassign(r.user_id, ws);
      S.undo = async () => { S.busy = true; render(); try { await D.assign(r.user_id, ws, was); await reloadMembers(T("msg.mpAssigned", { name: UI.mpName(r), level: T("level." + was) })); } catch (e) { S.busy = false; S.msg = T("err.mpAssign") + D.says(e); render(); } };
      await reloadMembers(T("msg.mpRemoved", { name: UI.mpName(r) }));
    } catch (e) { S.busy = false; S.msg = T("err.mpRemove") + D.says(e); render(); }
    return;
  }

  if (act === "lang") { switchLang(b.dataset.lang); return; }
  if (act === "signout") { await AUTH.signOut(); location.replace("../../app/"); return; }

  if (act === "tab") {
    e.preventDefault(); S.msg = "";
    history.pushState(null, "", "#" + b.dataset.t);
    await openTab(b.dataset.t);
    return;
  }
  if (act === "mail-back") { await openMail(); return; }
  if (act === "mail-edit") { S.tplKind = b.dataset.k; S.tplDraft = null; S.view = "mail-edit"; S.msg = ""; render(); return; }
  if (act === "mail-prev-lang" || act === "mail-prev-w") { S.mailPrev = Object.assign({ lang: "zh", w: 600 }, S.mailPrev, act === "mail-prev-lang" ? { lang: b.dataset.v } : { w: +b.dataset.v }); readMailForm(); render(); return; }
  if (act === "mail-save") {
    const t = readMailForm();
    if (!t.subject || !t.body) { S.msg = T("err.mailBoth"); render(); return; }
    S.busy = true; S.msg = ""; render();
    try {
      await D.saveTemplate(b.dataset.k, t);
      S.tpls = await D.loadTemplates(); S.tplDraft = null;
      S.busy = false; S.msg = T("msg.tplSaved");
    } catch (err) { S.busy = false; S.msg = T("err.save") + D.says(err); }
    render();
    return;
  }

  if (act === "approve") {
    const ok = b.checked;
    S.busy = true; render();
    try {
      await D.setApproved(id, ok);
      const p = S.people.find(x => x.id === id);
      if (p) p.public_approved = ok;
      S.busy = false; S.msg = "";
    } catch (err) { S.busy = false; S.msg = T("err.change") + D.says(err); }
    render();
    return;
  }

  // 第二把鑰匙轉下去（或轉回來）。跟上面那顆「approve」同一個形狀：
  // 只改記憶體裡那一筆，不重讀整份名單 —— 核可是一個一個看、一個一個按的。
  if (act === "approve-story") {
    const ok = b.checked;
    S.busy = true; render();
    try {
      await D.setStoryApproved(id, ok);
      const r = S.stories.find(x => x.id === id);
      if (r) r.story_approved = ok;
      S.busy = false; S.msg = "";
    } catch (err) { S.busy = false; S.msg = T("err.change") + D.says(err); }
    render();
    return;
  }

  // ── 歷史之路（2026-11-06）──
  if (act === "hi-open") { e.preventDefault(); history.pushState(null, "", "#history/" + id); await openHistory(id); return; }
  if (act === "hi-back") { history.pushState(null, "", "#history"); await openHistory(null); return; }
  if (act === "hi-new") { history.pushState(null, "", "#history/new"); S.hiSel = "new"; S.view = "history-edit"; S.msg = ""; render(); return; }
  if (act === "hi-save") {
    const patch = readMilestone(); if (!patch) return;
    if (!patch.title_zh && !patch.title_en) { S.msg = T("err.hiTitle"); render(); return; }
    if (!patch.happened_on) { S.msg = T("err.hiDate"); render(); return; }
    if (!patch.slug) patch.slug = UI.hiSlug(patch.title_en, patch.happened_on);
    if (!UI.hiSlugOk(patch.slug)) { S.msg = T("err.hiSlug"); render(); return; }
    S.busy = true; S.msg = ""; render();
    try {
      const newId = await D.upsertMilestone(id ? Object.assign({ id }, patch) : patch);
      if (!id) { history.replaceState(null, "", "#history/" + newId); S.hiSel = newId; }
      await reloadHistory(id ? T("msg.hiSaved") : T("msg.hiCreated", { title: patch.title_zh || patch.title_en }));
    } catch (err) { S.busy = false; S.msg = T("err.hiSave") + D.says(err); render(); }
    return;
  }
  if (act === "hi-move") {
    const ids = UI.hiMove(S.hist, id, b.dataset.dir); if (!ids) return;
    S.busy = true; S.msg = ""; render();
    try { await D.reorderMilestones(ids); await reloadHistory(T("msg.hiMoved")); }
    catch (err) { S.busy = false; S.msg = T("err.hiMove") + D.says(err); render(); }
    return;
  }
  if (act === "hi-ready" || act === "hi-unready" || act === "hi-publish" || act === "hi-unpublish") {
    const m = S.hist.find(x => x.id === id); if (!m) return;
    const title = UI.hiTitle(m);
    if (act === "hi-publish" && UI.needAsk(S, b, T("confirm.hiPublish", { title }))) return;
    if (act === "hi-unpublish" && UI.needAsk(S, b, T("confirm.hiUnpublish", { title }))) return;
    S.busy = true; S.msg = ""; render();
    try {
      // 按「準備好了」之前先把表單上的字存一次，不然填了沒存就按會被擋「中英標題都要填」。
      if (act === "hi-ready") { const patch = readMilestone(); if (patch && UI.hiSlugOk(patch.slug) && patch.happened_on) await D.upsertMilestone(Object.assign({ id }, patch)); }
      await D.setMilestoneStatus(id, { "hi-ready": "ready", "hi-unready": "draft", "hi-publish": "published", "hi-unpublish": "archived" }[act]);
      await reloadHistory(T("msg." + act.replace("-", "."), { title }));
    } catch (err) { S.busy = false; S.msg = T("err.hiStatus") + D.says(err); render(); }
    return;
  }
  if (act === "hi-ph-save") {
    const val = i => { const el = document.getElementById(i); return el ? el.value.trim() : ""; };
    S.busy = true; S.msg = ""; render();
    try { await D.updatePhoto(id, { caption_zh: val("hi-ph-czh-" + id), caption_en: val("hi-ph-cen-" + id) }); await reloadHistory(T("msg.hiPhotoSaved")); }
    catch (err) { S.busy = false; S.msg = T("err.hiPhoto") + D.says(err); render(); }
    return;
  }
  if (act === "hi-ph-del") {
    if (UI.needAsk(S, b, T("confirm.hiDelPhoto"))) return;
    S.busy = true; S.msg = ""; render();
    try { await D.deletePhoto(id); await reloadHistory(T("msg.hiPhotoDel")); }
    catch (err) { S.busy = false; S.msg = T("err.hiPhoto") + D.says(err); render(); }
    return;
  }

  if (act === "res-back") { await openRes(); return; }
  if (act === "res-new")  { S.resEditing = null; S.view = "res-edit"; S.msg = ""; render(); return; }
  if (act === "res-edit") {
    S.resEditing = S.res.find(r => r.id === id) || null;
    S.view = "res-edit"; S.msg = ""; render(); return;
  }
  if (act === "res-save") {
    const val = i => { const el = document.getElementById(i); return el ? el.value.trim() : ""; };
    const patch = {
      title: val("rtitle"), blurb: val("rblurb"), kind: val("rkind"),
      url: val("rurl"), team: val("rteam") || null, status: val("rstatus"),
      ord: Number(val("rord")) || 100,
    };
    S.busy = true; S.msg = ""; render();
    try {
      await D.saveResource(S.resEditing ? S.resEditing.id : null, patch);
      S.busy = false; S.resEditing = null;
      await openRes();
    } catch (err) { S.busy = false; S.msg = T("err.save") + D.says(err); render(); }
    return;
  }
  if (act === "res-del") {
    if (UI.needAsk(S, b, T("confirm.delRes"))) return;
    S.busy = true; render();
    try {
      await D.deleteResource(id);
      S.busy = false; S.resEditing = null;
      await openRes();
    } catch (err) { S.busy = false; S.msg = T("err.delete") + D.says(err); render(); }
    return;
  }

});

// 語言（2026-10-19 中英切換，做法見 docs/2026-10-19-後台中英切換.md）。
// 開頁：網址 ?lang= 先、再上次存在 localStorage 的、都沒有就英文（Paul 拍板預設英文）。
// 切換：改字典的語言、存起來、把 ?lang= 寫進網址、重畫。**不重新載入頁面**，填到一半的東西都在 S 裡不會不見。
function readStored() { try { return localStorage.getItem(STORE_KEY); } catch (e) { return null; } }
function applyLang(l) {
  setLang(l);
  document.documentElement.lang = lang() === "zh" ? "zh-Hant" : "en";
  document.title = T("title");
}
function switchLang(l) {
  applyLang(l);
  try { localStorage.setItem(STORE_KEY, lang()); } catch (e) { /* 無痕視窗存不了，這一頁照樣切 */ }
  const u = new URL(location.href); u.searchParams.set("lang", lang());
  history.replaceState(null, "", u.pathname + u.search + u.hash);
  render();
}
applyLang(pickLang(location.search, readStored()));
boot();
// 瀏覽器上一頁、或自己在網址列改 #分頁：跟著換分頁（2026-10-23 盤點 F3）。側欄點分頁是 pushState，所以上一頁回得去。
window.addEventListener("popstate", () => { if (S.me) { S.msg = ""; openTab(location.hash.slice(1)); } });

// 成員分頁的等級下拉（2026-10-23 批 3）：改了就送，toast 帶復原（送回原等級）。
document.addEventListener("change", async e => {
  // 歷史之路（2026-11-06）：勾同意立刻送（這一格是上架的門，不該等人按存）；選了檔就縮圖上傳。
  const consent = e.target.closest('[data-act="hi-ph-consent"]');
  if (consent && S.view === "history-edit") {
    const on = consent.checked;
    S.busy = true; S.msg = ""; render();
    try { await D.updatePhoto(consent.dataset.id, { consent: on }); await reloadHistory(T("msg.hiPhotoSaved")); }
    catch (err) { S.busy = false; S.msg = T("err.hiPhoto") + D.says(err); render(); }
    return;
  }
  const fileEl = e.target.closest("#hi-file");
  if (fileEl && S.view === "history-edit") { const f = fileEl.files && fileEl.files[0]; if (f) await uploadFile(fileEl.dataset.id, f); return; }
  // 多選加人（2026-10-24）：勾一個人、換等級，改 pk 再重畫。
  const pkEl = e.target.closest('[data-act="pk-tick"],[data-act="pk-level"]');
  if (pkEl && S.mp && S.view === "members") { S.mp.pk = UI.pkReduce(S.mp.pk, S.mp.cadres, S.mp.rows.map(r => r.user_id), pkEl); render(); return; }
  const el = e.target.closest('[data-act="members-level"]');
  if (!el || !S.mp || S.view !== "members") return;
  const r = S.mp.rows.find(x => x.user_id === el.dataset.id); if (!r) return;
  const ws = S.mp.ws, was = r.level, level = el.value;
  if (was === level) return;
  S.busy = true; S.msg = ""; render();
  try {
    await D.assign(r.user_id, ws, level);
    S.undo = async () => { S.busy = true; render(); try { await D.assign(r.user_id, ws, was); await reloadMembers(T("msg.mpLevel", { name: UI.mpName(r), level: T("level." + was) })); } catch (e) { S.busy = false; S.msg = T("err.mpAssign") + D.says(e); render(); } };
    await reloadMembers(T("msg.mpLevel", { name: UI.mpName(r), level: T("level." + level) }));
  } catch (e) { S.busy = false; S.msg = T("err.mpAssign") + D.says(e); render(); }
});

// 多選加人（2026-10-24）：找名字是邊打邊篩，重畫後把游標放回去；在那一塊裡按 Enter 就是按「加 N 個人」（空白鍵勾選是瀏覽器原生的）。
document.addEventListener("input", e => {
  // 歷史之路（2026-11-06）：新的一站打英文標題或日期時，代號跟著算；人自己改過代號就不再動它。
  if (S.view === "history-edit" && S.hiSel === "new" && (e.target.id === "hi-ten" || e.target.id === "hi-date")) {
    const slugEl = document.getElementById("hi-slug");
    if (slugEl && !slugEl.dataset.touched) slugEl.value = UI.hiSlug(document.getElementById("hi-ten").value, document.getElementById("hi-date").value);
    return;
  }
  if (S.view === "history-edit" && e.target.id === "hi-slug") { e.target.dataset.touched = "1"; return; }
  const el = e.target.closest('[data-act="pk-q"],[data-act="pk-mq"]');
  if (!el || !S.mp || S.view !== "members") return;
  S.mp.pk = UI.pkReduce(S.mp.pk, S.mp.cadres, S.mp.rows.map(r => r.user_id), el); render(); UI.pkRefocus(el.dataset.ns, el.dataset.act === "pk-mq" ? "mq" : "q");
});
document.addEventListener("keydown", e => {
  if (e.key !== "Enter") return;
  const box = e.target.closest(".picker"); if (!box) return;
  const go = box.querySelector('[data-act="members-assign"],[data-act="ws-assign"]'); if (!go || go.disabled) return;
  e.preventDefault(); go.click();
});
