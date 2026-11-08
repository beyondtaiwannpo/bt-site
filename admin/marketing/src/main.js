// 後台「Marketing」那一組的邏輯（2026-11-26）。批 1 只有一頁：Instagram 連線狀態。
// 計畫在 ~/Anson/outputs/beyond-taiwan/website/docs/2026-10-29-marketing-dashboard-plan/plan.md，之後的批次在這個資料夾加分頁。
//
// 狀態只有一個 S，畫面只從 S 產生。**不在事件處理裡直接改 DOM**，一律改 S 再 render()。
// 每一顆按鈕背後都是資料庫的一支函式，門在那裡（ig_can_view / ig_can_manage）；這裡少畫一顆按鈕不是安全機制。
import * as AUTH from "../../../shared/auth.js";
import { navHTML } from "../../../shared/nav.js";
import * as D from "./data.js";
import * as UI from "./ui.js";
import * as SL from "./slides.js";
import { T, lang, setLang, pickLang, STORE_KEY } from "./strings.js";

const HERE = "/admin/marketing/";
const VIEWS = ["ig", "posts", "post"];

let S = {
  user: null, me: null, down: false, busy: false, msg: "",
  view: "ig",
  ig: null,          // ig_status() 回的那一包
  loaded: false,
  // 大學介紹貼文（2026-11-27）
  mkt: null,         // mkt_bootstrap()：can_edit、can_approve、me、problems、hashes、names
  posts: [], postId: null, showArchived: false,
  ui: {},            // { returning, posting }：送審區那一行打開了哪一個
  urls: {},          // 照片路徑 → 簽名網址
  rs: {},            // 貼文 id → mkt_research_status() 回的那一包（研究按鈕，2026-11-28）
};

const root = () => document.getElementById("bt-root");

function render() {
  const el = root();
  if (!el) return;
  const nav = S.me ? navHTML({ current: "admin", role: S.me.role, name: S.me.name }) : "";
  if (S.down) { el.innerHTML = UI.shellHTML(nav, "", UI.downHTML(S.downErr)); return; }
  if (!S.user) { location.replace("../../app/?next=admin-marketing"); return; }
  if (!S.me || S.me.role !== "cadre") { el.innerHTML = UI.shellHTML(nav, "", UI.notCadreHTML()); return; }
  if (!UI.canViewMkt(S.me)) { el.innerHTML = UI.shellHTML(nav, UI.railHTML("marketing", "", S.me), UI.noAccessHTML(S.me)); return; }
  let body;
  const post = S.view === "post" ? S.posts.find(p => p.id === S.postId) : null;
  if (!S.loaded) body = UI.skeletonHTML();
  else if (S.view === "posts") body = S.mkt ? UI.postsListHTML(S.posts, S.mkt, S.msg, S.busy, S.showArchived) : UI.pageHead(T("cp.title"), "") + UI.msgHTML(S.msg);
  else if (S.view === "post") body = post && S.mkt ? UI.postEditorHTML(post, S.mkt, S.msg, S.busy, S.ui, S.urls, S.rs[post.id]) : UI.pageHead(T("cp.title"), "") + UI.msgHTML(S.msg || T("says.noPost"));
  else body = UI.igPageHTML(S.ig, S.msg, S.busy);
  el.innerHTML = UI.shellHTML(nav, UI.railHTML("marketing", S.view === "post" ? "posts" : S.view, S.me), body);
  UI.afterRender(S, el);
  if (S.view === "post" && post) { schedulePreview(0); if (UI.researchRunning(S.rs[post.id])) schedulePoll(); }
}

// 側欄與頂欄先畫（後台速度，2026-11-06 那一套）：知道我是誰就先把外殼畫出來，內容那一格放骨架。
function paintShell(tab) {
  const el = root();
  if (!el || !S.me) return;
  const nav = navHTML({ current: "admin", role: S.me.role, name: S.me.name });
  el.innerHTML = UI.shellHTML(nav, UI.railHTML("marketing", tab || "", S.me), UI.skeletonHTML());
  UI.afterRender(S, el);
  UI.checkVersion("../../");
}
function retryBoot() { return new Promise(r => setTimeout(() => r(boot(true)), 2000)); }
async function boot(retried) {
  try {
    const who = await AUTH.currentUserDetailed();
    if (who.offline) { if (!retried) return retryBoot(); S.down = true; render(); return; }
    S.user = who.user;
    if (!S.user) { render(); return; }
    S.me = await D.loadMe(S.user.id);
    if (!S.me || S.me.role !== "cadre" || !UI.canViewMkt(S.me)) { render(); return; }
    setView(location.hash.slice(1) || "ig");
    paintShell(S.view === "post" ? "posts" : S.view);
    UI.bindAutosave(root(), onAutosave);
    await load();
  } catch (e) {
    if (AUTH.sessionGone(e)) { await AUTH.signOut(); location.replace("../../app/?next=admin-marketing"); return; }
    console.error(HERE + " 載入失敗：", e);
    if (!retried) return retryBoot();
    S.downErr = String(e && e.message || e); S.down = true; render();
  }
}

async function load(keepMsg) {
  if (!keepMsg) S.msg = "";
  try {
    if (S.view === "ig") S.ig = await D.loadIgStatus();
    else await loadPosts();
  } catch (e) { S.msg = T(S.view === "ig" ? "err.load" : "err.loadPosts") + D.says(e); }
  S.loaded = true; S.busy = false;
  render();
}
// 貼文清單與 bootstrap 一起拿；在編輯的那一篇順便把照片的簽名網址拿好（縮圖與預覽要用）。
async function loadPosts() {
  const [m, posts] = await Promise.all([D.loadMkt(), D.loadPosts()]);
  S.mkt = m; S.posts = posts;
  const p = S.posts.find(x => x.id === S.postId);
  if (p) { await signPhotos(p); await loadResearch(p.id); }
}
// 研究的進度。資料表還不在（還沒跑 2026-11-28 那支）就當作沒有這個功能，不擋整頁。
async function loadResearch(id) {
  try { S.rs[id] = await D.researchStatus(id); } catch (e) { S.rs[id] = null; }
}
// 研究在跑：每 10 秒問一次（資料庫順便推進度）。跑完重拿貼文（研究回來的東西已經寫進去了），整頁重畫。
let pollT = null;
function schedulePoll() {
  if (pollT) return;
  pollT = setTimeout(async () => {
    pollT = null;
    const id = S.postId; if (!id || S.view !== "post") return;
    const before = S.rs[id];
    await loadResearch(id);
    const after = S.rs[id];
    const doneBefore = ((before && before.jobs) || []).filter(j => j.status === "done" || j.status === "failed").length;
    const doneAfter = ((after && after.jobs) || []).filter(j => j.status === "done" || j.status === "failed").length;
    if (doneAfter !== doneBefore) { try { await loadPosts(); } catch (e) { /* 下一輪再拿 */ } }
    if (S.view === "post" && S.postId === id) render();
  }, 10000);
}
async function signPhotos(p) {
  for (const ph of Object.values((p.data || {}).photos || {})) {
    if (ph && ph.path && !S.urls[ph.path]) { try { S.urls[ph.path] = await D.photoUrl(ph.path); } catch (e) { /* 看不到就畫灰框 */ } }
  }
}
function setView(key) {
  key = String(key || "").split("=")[0];
  if (key.startsWith("post/")) { S.view = "post"; S.postId = key.slice(5); }
  else { S.view = VIEWS.includes(key) && key !== "post" ? key : "ig"; S.postId = null; }
}
function openTab(key) {
  const before = S.view;
  setView(key);
  S.ask = null; S.ui = {};
  if (S.view === "ig" && !S.ig) { S.loaded = false; render(); load(); return; }
  if (S.view !== "ig" && (before === "ig" || !S.mkt)) { S.loaded = false; render(); load(); return; }
  if (S.view === "post") { const p = S.posts.find(x => x.id === S.postId); if (p) Promise.all([signPhotos(p), loadResearch(p.id)]).then(render); }
  render();
}

// ── 大學介紹貼文 ───────────────────────────────────────────────────────
const curPost = () => S.posts.find(p => p.id === S.postId);
const editorBox = () => root() && root().querySelector('[data-autosave="cp-save"]');
// 畫面上現在的內容（還沒存的也算）：表單讀回來，照片沿用存著的那一份（表單裡只有路徑與授權）。
function currentContent() {
  const p = curPost(); if (!p) return null;
  const box = editorBox();
  if (!box) return { data: p.data || {}, sources: p.sources || {}, caption: p.caption || "" };
  return UI.readEditor(UI.formValues(box));
}
const dirty = UI.dirtyTracker();
async function savePost(content) {
  const p = curPost(); if (!p) return;
  const c = content || currentContent();
  const key = "post:" + p.id, serial = JSON.stringify(c);
  if (!content && !dirty.changed(key, serial)) return;
  await D.savePost(p.id, c.data, c.sources, c.caption);
  dirty.mark(key, serial);
  await loadPosts();
}
// 自動儲存：存完不重畫整頁（人可能還在打字），只換送審區與每個數字旁邊的勾。
async function onAutosave(act, box) {
  if (act !== "cp-save") return;
  const p = curPost(); if (!p || !UI.canEditPost(p, S.mkt, S.rs[p.id])) return;
  UI.autosaveState(box, "saving");
  try {
    await savePost();
    const np = curPost(), el = root();
    const st = el.querySelector("#cp-status"); if (st) st.outerHTML = UI.statusPanel(np, S.mkt, S.ui, S.busy);
    for (const [k] of SL.FACTS) {
      const b = el.querySelector("#fx-" + k); if (b) b.innerHTML = UI.factBadge(np, S.mkt, k);
      const cb = el.querySelector(`[data-act="cp-check"][data-key="${k}"]`); if (cb) cb.checked = UI.factState(np, S.mkt, k) === "ok";
    }
    UI.autosaveState(editorBox() || box, "saved");
  } catch (e) { UI.autosaveState(box, "failed"); UI.toast(T("err.save") + D.says(e)); }
}

// 預覽：畫面一改就重畫七張（停手 250 毫秒）。圖先載好再畫，字型先到再畫。
const IMG = {};
let statesP = null;
function loadImage(src) {
  if (!IMG[src]) IMG[src] = new Promise(r => { const im = new Image(); im.crossOrigin = "anonymous"; im.onload = () => r(im); im.onerror = () => r(null); im.src = src; });
  return IMG[src];
}
async function imagesFor(data) {
  const out = {};
  out.logo = await loadImage("./slides/bt-logo.png");
  out.qr = await loadImage("./slides/qr.png");
  if (!statesP) statesP = fetch("./slides/us-states.json").then(r => r.json()).catch(() => null);
  const states = await statesP;
  if (states) out.map = SL.drawMap(states, (data.basic || {}).state);
  for (const [slot, ph] of Object.entries(data.photos || {})) {
    if (!ph || !ph.path) continue;
    if (!S.urls[ph.path]) { try { S.urls[ph.path] = await D.photoUrl(ph.path); } catch (e) { continue; } }
    const im = await loadImage(S.urls[ph.path]); if (im) out["photo:" + slot] = im;
  }
  return out;
}
let prevT = null, prevN = 0;
function schedulePreview(ms) { clearTimeout(prevT); prevT = setTimeout(drawPreview, ms == null ? 250 : ms); }
async function drawPreview() {
  const c = currentContent(); if (!c) return;
  const n = ++prevN;
  await SL.ensureFonts(JSON.stringify(c.data));
  const imgs = await imagesFor(c.data);
  if (n !== prevN) return;
  const slides = SL.layout(c.data);
  for (const cv of root().querySelectorAll(".cp-prev canvas")) SL.drawSlide(cv.getContext("2d"), slides[+cv.dataset.slide], imgs, c.data);
}
function download(blob, name) {
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}
async function downloadPngs() {
  await drawPreview();
  const p = curPost(), name = SL.slug(p.school);
  const cvs = [...root().querySelectorAll(".cp-prev canvas")];
  for (const cv of cvs) {
    const blob = await new Promise(r => cv.toBlob(r, "image/png"));
    download(blob, `${name}-${String(+cv.dataset.slide + 1).padStart(2, "0")}.png`);
    await new Promise(r => setTimeout(r, 350));   // 一次七個下載，瀏覽器會問一次「允許下載多個檔案」
  }
}
let pptxP = null;
function loadPptx() {
  if (window.PptxGenJS) return Promise.resolve(window.PptxGenJS);
  if (!pptxP) pptxP = new Promise((res, rej) => { const s = document.createElement("script"); s.src = "../../vendor/pptxgen.bundle.js"; s.onload = () => res(window.PptxGenJS); s.onerror = rej; document.head.appendChild(s); });
  return pptxP;
}
async function downloadPptx() {
  const c = currentContent(), p = curPost();
  await SL.ensureFonts(JSON.stringify(c.data));
  const [Pptx, imgs] = await Promise.all([loadPptx(), imagesFor(c.data)]);
  await SL.buildPptx(Pptx, SL.layout(c.data), imgs, c.data).writeFile({ fileName: SL.slug(p.school) + "-canva.pptx" });
}
// 照片：選檔案或貼網址（例如 Wikimedia Commons 的原圖網址），傳進私人 bucket，路徑寫回那一篇。
const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
async function putPhoto(slot, blob, extra) {
  const p = curPost();
  if (!PHOTO_TYPES.includes(blob.type)) throw new Error(T("err.photoType"));
  if (blob.size > 8 * 1024 * 1024) throw new Error(T("err.photoBig"));
  const ext = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }[blob.type];
  const path = `${p.id}/${slot}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  await D.uploadPhoto(path, blob);
  const c = currentContent();
  c.data.photos = c.data.photos || {};
  c.data.photos[slot] = Object.assign({}, c.data.photos[slot] || {}, extra || {}, { path });
  await savePost(c);
}
async function fetchBlob(url) {
  const r = await fetch(url, { mode: "cors" });
  if (!r.ok) throw new Error("HTTP " + r.status);
  return r.blob();
}
// 匯入：一個 .json（school、data、sources、caption、photos：{ 哪一張: { url, credit, license, source_url } }）。
// 數字的勾不匯入：每一個都要有人自己點開來源再勾。
async function importFile(file) {
  const j = JSON.parse(await file.text());
  if (!j || !j.school || typeof j.data !== "object") throw new Error(T("err.importShape"));
  const data = Object.assign(SL.blankPost(j.school), j.data); data.photos = {};
  const id = await D.createPost(j.school, data, j.sources || {}, j.caption || "");
  await loadPosts(); S.postId = id;
  const fails = [];
  for (const [slot, ph] of Object.entries(j.photos || {})) {
    if (!ph || !ph.url) continue;
    try { await putPhoto(slot, await fetchBlob(ph.url), { credit: ph.credit || "", license: ph.license || "", source_url: ph.source_url || "", focus: ph.focus || "" }); }
    catch (e) { fails.push(slot); }
  }
  return { id, fails };
}

document.addEventListener("click", async e => {
  const b = e.target.closest("[data-act]");
  if (!b) return;
  const act = b.dataset.act;
  if (act === "retry") { location.reload(); return; }
  if (act === "ask-cancel") { UI.cancelAsk(S, root()); return; }
  if (act === "lang") { switchLang(b.dataset.lang); return; }
  if (act === "signout") { await AUTH.signOut(); location.replace("../../app/"); return; }
  if (act === "tab") { e.preventDefault(); S.msg = ""; history.pushState(null, "", "#" + b.dataset.t); openTab(b.dataset.t); return; }
  if (act === "cp-back") { history.pushState(null, "", "#posts"); openTab("posts"); return; }
  if (act === "cp-archived") { S.showArchived = !S.showArchived; render(); return; }
  if (act === "cp-zoom") { b.classList.toggle("big"); return; }
  if (act === "cp-inline-cancel") { S.ui = {}; render(); return; }
  if (act === "cp-return-open") { S.ui = { returning: true }; render(); return; }
  if (act === "cp-posted-open") { S.ui = { posting: true }; render(); return; }
  if (act === "cp-create") {
    const school = (root().querySelector("#cp-school") || {}).value || "";
    if (school.trim().length < 2) { S.msg = T("err.create") + T("says.needSchool"); render(); return; }
    const id = await act2("err.create", () => D.createPost(school.trim(), SL.blankPost(school.trim())));
    if (id) { history.pushState(null, "", "#post/" + id); openTab("post/" + id); }
    return;
  }
  if (act === "cp-row-add" || act === "cp-row-del") {
    const c = currentContent(), rows = c.data.timeline.rows = c.data.timeline.rows || [];
    if (act === "cp-row-add") rows.push({ date: "", en: "", zh: "" }); else rows.splice(+b.dataset.i, 1);
    await act2("err.save", () => savePost(c)); return;
  }
  if (act === "cp-photo-url") {
    const slot = b.dataset.slot, url = ((root().querySelector(`[data-slot-url="${slot}"]`) || {}).value || "").trim();
    if (!/^https?:\/\//.test(url)) { UI.toast(T("err.photo") + T("err.photoUrl")); return; }
    await act2("err.photo", async () => putPhoto(slot, await fetchBlob(url), { source_url: url }), T("msg.photo")); return;
  }
  if (act === "cp-photo-clear") {
    const c = currentContent(); if (c.data.photos) delete c.data.photos[b.dataset.slot];
    await act2("err.save", () => savePost(c)); return;
  }
  if (act === "cp-research") { await act2("err.research", () => D.startResearch(S.postId), T("msg.research")); return; }
  if (act === "cp-use-photo") {
    const slot = b.dataset.slot, rs = S.rs[S.postId] || {};
    const ph = Object.assign({}, ...((rs.jobs || []).map(j => j.photos || {})))[slot];
    if (!ph || !ph.url) return;
    await act2("err.photo", async () => putPhoto(slot, await fetchBlob(ph.url),
      { credit: ph.credit || "", license: ph.license || "", source_url: ph.source_url || "", focus: slot.startsWith("alumni") ? "top" : "" }), T("msg.photo"));
    return;
  }
  if (act === "cp-submit") { await act2("err.submit", () => D.submitPost(S.postId), T("msg.submitted")); return; }
  if (act === "cp-approve") { await act2("err.approve", () => D.approvePost(S.postId, (S.mkt.hashes || {})[S.postId]), T("msg.approved")); return; }
  if (act === "cp-return") {
    const note = ((root().querySelector("#cp-return-note") || {}).value || "").trim();
    S.ui = {}; await act2("err.return", () => D.returnPost(S.postId, note), T("msg.returned")); return;
  }
  if (act === "cp-posted") {
    const url = ((root().querySelector("#cp-posted-url") || {}).value || "").trim();
    S.ui = {}; await act2("err.posted", () => D.markPosted(S.postId, url), T("msg.posted")); return;
  }
  if (act === "cp-archive") {
    if (UI.needAsk(S, b, T("cp.archiveAsk"))) return;
    const ok = await act2("err.archive", () => D.archivePost(S.postId), T("msg.archived"));
    if (ok !== undefined) { history.pushState(null, "", "#posts"); openTab("posts"); }
    return;
  }
  if (act === "cp-dl-png") { try { await downloadPngs(); } catch (e) { UI.toast(T("err.download") + D.says(e)); } return; }
  if (act === "cp-dl-pptx") { try { UI.toast(T("msg.pptxBuilding")); await downloadPptx(); } catch (e) { UI.toast(T("err.download") + D.says(e)); } return; }

  // 再檢查一次：資料庫會先看要不要換通行證，再問 Instagram 一次。
  if (act === "ig-check") {
    if (S.busy) return;
    S.busy = true; S.msg = ""; render();
    try { S.ig = await D.igCheckNow(); S.busy = false; S.msg = T("msg.checked"); }
    catch (err) { S.busy = false; S.msg = T("err.check") + D.says(err); }
    render();
  }
});

document.addEventListener("change", async e => {
  const t = e.target; if (!t || !t.dataset) return;
  if (t.dataset.act === "cp-check") {
    // 先把畫面上還沒存的存掉，勾的才會是現在這個數字。
    const key = t.dataset.key, on = t.checked;
    await act2("err.check2", async () => { await savePost(); return D.checkFact(S.postId, key, on); });
    return;
  }
  if (t.dataset.act === "cp-photo-file" && t.files && t.files[0]) {
    await act2("err.photo", () => putPhoto(t.dataset.slot, t.files[0]), T("msg.photo")); return;
  }
  if (t.dataset.act === "cp-import" && t.files && t.files[0]) {
    const r = await act2("err.import", () => importFile(t.files[0]));
    if (r && r.id) {
      history.pushState(null, "", "#post/" + r.id); openTab("post/" + r.id);
      UI.toast(r.fails.length ? T("msg.importedSome", { list: r.fails.map(x => T("cp.photo." + x)).join(T("cp.sep")) }) : T("msg.imported"), null, { sticky: true });
    }
  }
});
document.addEventListener("input", e => {
  if (S.view !== "post" || !e.target.closest || !e.target.closest('[data-autosave="cp-save"]')) return;
  if (e.target.name === "caption") { const el = document.getElementById("cp-cap-count"); if (el) el.textContent = UI.captionCount(e.target.value); }
  schedulePreview();
});
// 一個動作：按鈕先停用、做完重拿清單、重畫；失敗把原因放在頁首。回傳 undefined 表示沒做成。
async function act2(label, fn, okMsg) {
  S.busy = true; S.msg = ""; render();
  try { const r = await fn(); await loadPosts(); S.busy = false; S.msg = okMsg || ""; render(); return r === undefined ? true : r; }
  catch (e) { S.busy = false; S.msg = T(label) + D.says(e); try { await loadPosts(); } catch (x) { /* 照舊畫 */ } render(); return undefined; }
}

// 語言（2026-10-19 中英切換，做法見 docs/2026-10-19-後台中英切換.md）。
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
window.addEventListener("popstate", () => { if (S.me) { S.msg = ""; openTab(location.hash.slice(1)); } });
