// 後台「內部表單」的邏輯（2026-11-29）：要填的表單、建表單與看結果。
//
// 網址：#fill（要填的）、#fill/<id>（填一份或看自己的答案）、#build（我管得到的表單）、
//       #build/<id>/<questions|people|results|log>（一份的四個分頁）。
// 狀態只有一個 S，畫面只從 S 產生。每一顆按鈕背後都是資料庫的一支函式，門在那裡；這裡少畫一顆按鈕不是安全機制。
import * as AUTH from "../../../shared/auth.js";
import { navHTML } from "../../../shared/nav.js";
import * as D from "./data.js";
import * as UI from "./ui.js";
import { T, lang, setLang, pickLang, STORE_KEY } from "./strings.js";

const HERE = "/admin/team-forms/";

let S = {
  user: null, me: null, down: false, busy: false, msg: "", loaded: false,
  view: "fill", id: null, sub: "questions",
  boot: null,          // tf_bootstrap()
  fill: null,          // tf_fill(id)
  admin: null,         // tf_form_admin(id)
  results: null,       // tf_results(id)
  aud: null, audSaved: null, find: {},
  newDraft: null, more: {},
  // 題目畫布（2026-12-23，shared/forms.js）：mode 編輯或預覽、menuAt 哪一條「＋」開著、filter 打在 / 後面的字、logicOpen 哪幾題的邏輯面板開著。
  fx: { mode: "edit", menuAt: null, filter: "", logicOpen: new Set() },
  // 填到哪（引擎的 runner 每次重畫都從這裡接回來）：answers 是畫面上的值（多選是陣列），page 是第幾頁。
  run: { answers: {}, page: 0 }, runner: null,
};

const root = () => document.getElementById("bt-root");
const canBuild = () => !!UI.tfLevel(S.me) || !!(S.boot && (S.boot.can_create || (S.boot.manage || []).length));
const people = () => (S.boot && S.boot.people) || [];

function body() {
  if (!S.loaded) return UI.skeletonHTML();
  if (S.view === "fill" && S.id) return S.fill ? UI.fillHTML(S.fill, S.msg, S.busy, S.run) : UI.msgHTML(S.msg) + UI.skeletonHTML();
  if (S.view === "fill") return UI.fillListHTML(S.boot, S.msg);
  if (!canBuild()) return UI.noAccessHTML(S.me);
  if (!S.id) return UI.buildListHTML(S.boot, S.msg, S.busy, S.newDraft);
  if (!S.admin) return UI.msgHTML(S.msg) + UI.skeletonHTML();
  const head = UI.editorHeadHTML(S.admin, S.sub);
  if (S.sub === "people") return head + UI.audienceHTML(S.admin, people(), S.aud, S.audSaved, S.find, S.msg, S.busy);
  if (S.sub === "results") return head + (S.results ? UI.resultsHTML(S.results, S.msg, S.more) : UI.msgHTML(S.msg) + UI.skeletonHTML());
  if (S.sub === "log") return head + UI.msgHTML(S.msg) + UI.logHTML(S.admin);
  return head + UI.questionsEditHTML(S.admin, S.msg, S.busy, S.fx, S.sub);
}
function render() {
  const el = root();
  if (!el) return;
  const nav = S.me ? navHTML({ current: "admin", role: S.me.role, name: S.me.name }) : "";
  if (S.down) { el.innerHTML = UI.shellHTML(nav, "", UI.downHTML(S.downErr)); return; }
  if (!S.user) { location.replace("../../app/?next=admin-team-forms"); return; }
  if (!S.me || S.me.role !== "cadre") { el.innerHTML = UI.shellHTML(nav, "", UI.notCadreHTML()); return; }
  const counts = S.boot ? { fill: (S.boot.todo || []).length } : {};
  UI.railBefore(el); el.innerHTML = UI.shellHTML(nav, UI.railHTML("teamforms", S.view === "fill" ? "fill" : "build", S.me, counts), body()); UI.railAfter(el);
  UI.afterRender(S, el);
  // 畫完之後讓引擎接手那兩個框：填的頁（#tf-run）與編輯器的預覽（#fx-pv）。
  mountFill();
  if (onQuestions() && S.fx.mode === "preview") mountPreview();
}
const onQuestions = () => S.view === "build" && !!S.id && !!S.admin && S.sub === "questions";
function paintShell(tab) {
  const el = root();
  if (!el || !S.me) return;
  const nav = navHTML({ current: "admin", role: S.me.role, name: S.me.name });
  UI.railBefore(el); el.innerHTML = UI.shellHTML(nav, UI.railHTML("teamforms", tab || "fill", S.me), UI.skeletonHTML()); UI.railAfter(el);
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
    if (!S.me || S.me.role !== "cadre") { render(); return; }
    parseHash();
    paintShell(S.view);
    UI.bindAutosave(root(), onAutosave);
    // 引擎的樣式與拖曳排序（shared/forms.js）。拖曳掛在 #bt-root 上一次，它不會被換掉。
    UI.F.ensureStyle();
    UI.F.bindDrag(root(), (from, to) => { if (onQuestions() && S.admin.can_edit) restructure(qs => { const ids = UI.F.moveId(qs.map(q => q.id), from, to); return ids.map(id => qs.find(q => q.id === id)); }); });
    await loadBoot();
    await openRoute();
  } catch (e) {
    if (AUTH.sessionGone(e)) { await AUTH.signOut(); location.replace("../../app/?next=admin-team-forms"); return; }
    console.error(HERE + " 載入失敗：", e);
    if (!retried) return retryBoot();
    S.downErr = String(e && e.message || e); S.down = true; render();
  }
}
function parseHash() {
  const parts = (location.hash.slice(1) || new URLSearchParams(location.search).get("tab") || "fill").split("/");
  S.view = parts[0] === "build" ? "build" : "fill";
  S.id = parts[1] || null;
  S.sub = UI.SUBS.includes(parts[2]) ? parts[2] : "questions";
}
async function loadBoot() {
  try { S.boot = await D.loadBootstrap(); }
  catch (e) { S.boot = { todo: [], mine: [], manage: [], people: [], can_create: false }; S.msg = T("err.load") + D.says(e); }
  S.loaded = true;
}
// 照網址把那一頁要的資料拿回來，然後畫。
async function openRoute(keepMsg) {
  if (!keepMsg) S.msg = "";
  S.fill = null; S.results = null; S.runner = null;
  if (S.view === "build" && S.id !== S.admin?.form?.id) { S.admin = null; S.fx = { mode: "edit", menuAt: null, filter: "", logicOpen: new Set() }; }
  render();
  try {
    if (S.view === "fill" && S.id) { S.fill = await D.loadFill(S.id); initRun(); }
    else if (S.view === "build" && S.id) {
      S.admin = await D.loadAdmin(S.id);
      if (!S.aud || S.aud._id !== S.id) resetAud();
      if (S.sub === "results") S.results = await D.loadResults(S.id);
    }
  } catch (e) { S.msg = T("err.load") + D.says(e); }
  S.busy = false;
  render();
}
function resetAud() {
  const a = (S.admin && S.admin.audience) || [];
  S.audSaved = { recipient: UI.audOf(a, "recipient"), reader: UI.audOf(a, "reader"), editor: UI.audOf(a, "editor") };
  S.aud = { _id: S.id, recipient: [...S.audSaved.recipient], reader: [...S.audSaved.reader], editor: [...S.audSaved.editor] };
  S.find = {};
}
function go(hash) { history.pushState(null, "", "#" + hash); parseHash(); openRoute(); }
async function run(label, fn) {
  S.busy = true; S.msg = ""; render();
  try { const r = await fn(); S.busy = false; return r; }
  catch (err) { S.busy = false; S.msg = T(label) + D.says(err); render(); return undefined; }
}
async function refreshAdmin() { S.admin = await D.loadAdmin(S.id); }

// ── 設定與題目：改了就存。成功只改 S 不重畫（人可能還在打字）。 ──
// 設定那一塊（tf-save）只送 p_data；題目一塊一塊（tf-q）各自存，但 tf_save_form 收的是整份題目清單，
// 所以先把那一題改進 S.admin.questions，再把整份送出去。**存檔排隊一個一個來**（qChain），
// 清單在輪到它的時候才算，兩塊同時存不會用舊的那一份蓋掉剛存好的。
const dirty = UI.dirtyTracker();
let qChain = Promise.resolve();
function saveQuestions() {
  const p = qChain.catch(() => {}).then(() => D.saveForm(S.id, {}, S.admin.questions));
  qChain = p;
  return p;
}
async function onAutosave(act, box, field) {
  if (!S.admin) return;
  if (act === "tf-save") {
    const data = UI.readSettings(box);
    const key = "tf:" + S.id, serial = JSON.stringify(data);
    if (!dirty.changed(key, serial)) return;
    if (!data.title) { UI.autosaveState(box, "failed"); UI.toast(T("err.save") + T("err.needTitle")); return; }
    UI.autosaveState(box, "saving");
    try {
      await D.saveForm(S.id, data, null);
      dirty.mark(key, serial);
      S.admin.form = Object.assign({}, S.admin.form, data);
      UI.autosaveState(box, "saved"); UI.toast(T("msg.saved"));
    } catch (e) { UI.autosaveState(box, "failed"); UI.toast(T("err.save") + D.says(e)); }
    return;
  }
  if (act === "tf-q") {
    // 畫布上的一塊（shared/forms.js 的 blockHTML）。讀回來、擋兩件事、存；換了題型或改了邏輯面板的下拉要重畫。
    const id = box.dataset.id;
    const old = (S.admin.questions || []).find(x => x.id === id); if (!old) return;
    const q = UI.F.readBlock(box, old);
    const key = "tfq:" + id, serial = JSON.stringify(q);
    if (!dirty.changed(key, serial)) return;
    const bad = UI.blockProblem(q);
    if (bad) { UI.autosaveState(box, "failed"); UI.toast(T("err.save") + bad); return; }
    const redraw = q.type !== old.type || !!(field && field.dataset && field.dataset.fxRedraw);
    Object.assign(old, q);
    UI.autosaveState(box, "saving");
    try {
      await saveQuestions();
      dirty.mark(key, serial);
      UI.autosaveState(box, "saved"); UI.toast(T("msg.saved"));
      if (redraw) { if (box.querySelector(".fx-logic[open]")) S.fx.logicOpen.add(id); render(); }
    } catch (e) { UI.autosaveState(box, "failed"); UI.toast(T("err.save") + D.says(e)); }
  }
}
// 畫面上現在的每一題（還在等那 4 秒沒存的字也讀進來），沒畫出來的（預覽模式）用 S 裡的。
function screenQuestions() {
  return (S.admin.questions || []).map(q => {
    const box = root().querySelector(`[data-fx-blk="${CSS.escape(q.id)}"]`);
    return box ? Object.assign(UI.F.readBlock(box, q), { answered: q.answered }) : q;
  });
}
// 加、刪、移、複製、拖曳、改規則：改整份清單，存，重讀一次（以資料庫為準），重畫。focusId 是存完要把游標放上去的那一題。
async function restructure(fn, focusId) {
  const next = fn(screenQuestions());
  S.fx.menuAt = null; S.fx.filter = "";
  const prev = S.admin.questions;
  S.admin.questions = next;
  S.busy = true; S.msg = ""; render();
  try { await saveQuestions(); }
  catch (err) { S.admin.questions = prev; S.busy = false; S.msg = T("err.save") + D.says(err); render(); return; }
  for (const q of next) dirty.forget("tfq:" + q.id);
  try { await refreshAdmin(); } catch (e) { /* 存好了，只是重讀失敗：畫面用剛剛那一份 */ }
  S.busy = false; render();
  if (focusId) {
    const el = document.querySelector(`[data-fx-blk="${CSS.escape(focusId)}"] [name="label"]`);
    if (el) { el.scrollIntoView({ block: "center" }); el.focus(); if (el.select) el.select(); }
  }
}

// ── 填：引擎的 runner（換頁、進度條、條件邏輯、驗證、草稿）──
// 草稿的鑰匙用 tf- 開頭的表單代號，跟申請表單（/apply/）那一份分開，不會撞在一起。
const dk = () => (S.fill && S.user && S.fill.can_submit) ? UI.F.draftKey("tf-" + S.fill.form.id, S.user.id) : "";
function initRun() {
  const d = S.fill, mine = d && d.mine;
  const saved = dk() ? UI.F.draftLoad(dk()) : null;
  S.run = saved ? { answers: saved.answers || {}, page: saved.page || 0 }
                : { answers: UI.engineAnswers(d ? d.questions : [], (mine && mine.answers) || {}), page: 0 };
}
function mountFill() {
  const host = document.getElementById("tf-run");
  if (!host || !S.fill) return;
  const d = S.fill;
  S.runner = UI.F.mount(host, d.questions, Object.assign(UI.runOpts(d, S.run), {
    busy: S.busy, draftKey: dk(),
    onChange: (a, p) => { S.run.answers = a; S.run.page = p; },
    // 不在填的名單上的讀者：看得到、點得過，按送出只說一句「預覽不會送出」。
    onSubmit: d.can_submit ? sendFill : async () => UI.toast(T("msg.previewSent")),
  }));
}
async function sendFill(payload) {
  if (!S.fill) return;
  if (S.runner) { S.run.answers = S.runner.answers(); S.run.page = S.runner.page(); }
  const had = !!S.fill.mine, key = dk();
  S.busy = true; S.msg = "";
  if (S.runner) S.runner.setBusy(true);
  try { await D.submit(S.id, UI.toAnswerMap(payload)); }
  catch (err) { S.busy = false; S.msg = T("err.send") + D.says(err); render(); return; }
  UI.F.draftClear(key);
  S.msg = T(had ? "msg.updated" : "msg.sent");
  await loadBoot(); await openRoute(true);
}
// 編輯器的預覽：跟填的頁同一支引擎，條件邏輯照樣會動，送出不會真的送。
function mountPreview() {
  const el = document.getElementById("fx-pv"); if (!el || !S.admin) return;
  UI.F.mount(el, S.admin.questions, { en: lang() === "en", topHTML: UI.previewTopHTML(),
    onSubmit: async () => UI.toast(T("msg.previewSent")) });
}

document.addEventListener("click", async e => {
  const b = e.target.closest("[data-act]");
  if (!b) return;
  const act = b.dataset.act;
  if (act === "retry") { location.reload(); return; }
  if (act === "ask-cancel") { UI.cancelAsk(S, root()); return; }
  if (act === "lang") { switchLang(b.dataset.lang); return; }
  if (act === "signout") { await AUTH.signOut(); location.replace("../../app/"); return; }
  if (act === "tab") { e.preventDefault(); go(b.dataset.t === "build" ? "build" : "fill"); return; }
  if (act === "open-fill") { e.preventDefault(); go("fill/" + b.dataset.id); return; }
  if (act === "back-fill") { go("fill"); await loadBoot(); render(); return; }
  if (act === "open-form") { e.preventDefault(); go("build/" + b.dataset.id); return; }
  if (act === "back-build") { go("build"); await loadBoot(); render(); return; }
  if (act === "sub") { e.preventDefault(); go(`build/${S.id}/${b.dataset.t}`); return; }

  // ── 清單 ──
  if (act === "tf-new") { S.newDraft = { title: "" }; render(); const t = document.getElementById("tf-new-title"); if (t) t.focus(); return; }
  if (act === "tf-new-cancel") { S.newDraft = null; render(); return; }
  if (act === "tf-create") {
    const title = String((document.getElementById("tf-new-title") || {}).value || "").trim();
    if (!title) { S.msg = T("err.create") + T("err.needTitle"); render(); return; }
    const id = await run("err.create", () => D.saveForm(null, { title }, []));
    if (id === undefined) return;
    S.newDraft = null; await loadBoot(); go("build/" + id); S.msg = T("msg.created"); return;
  }

  // ── 一份：狀態、刪 ──
  if (act === "tf-status") {
    const ok = await run("err.status", () => D.setStatus(S.id, b.dataset.id));
    if (ok === undefined) return;
    await refreshAdmin(); await loadBoot(); render(); return;
  }
  if (act === "tf-delete") {
    if (UI.needAsk(S, b, T("ed.deleteAsk"))) return;
    const ok = await run("err.delete", () => D.deleteForm(S.id));
    if (ok === undefined) return;
    S.admin = null; S.msg = T("msg.deleted"); await loadBoot(); go("build"); return;
  }

  // ── 題目畫布（2026-12-23，shared/forms.js）──
  if (act === "fx-mode") { S.fx.mode = b.dataset.v === "preview" ? "preview" : "edit"; S.fx.menuAt = null; render(); return; }
  if (!onQuestions() || !S.admin.can_edit) { if (act.startsWith("fx-")) return; }
  else {
    const id = b.dataset.id;
    if (act === "fx-menu") {
      const at = Number(b.dataset.at);
      S.fx.menuAt = S.fx.menuAt === at ? null : at; S.fx.filter = ""; render();
      const first = document.querySelector(".fx-menu .fx-mi"); if (first && S.fx.menuAt != null) first.focus();
      return;
    }
    if (act === "fx-insert") {
      const nb = UI.newBlock(b.dataset.type), at = Number(b.dataset.at);
      await restructure(qs => { const c = qs.slice(); c.splice(Math.max(0, Math.min(at, c.length)), 0, nb); return c; }, nb.id);
      return;
    }
    if (act === "fx-dup") {
      const i = S.admin.questions.findIndex(q => q.id === id); if (i < 0) return;
      const cp = UI.copyBlock(S.admin.questions[i]);
      await restructure(qs => { const c = qs.slice(); c.splice(i + 1, 0, cp); return c; }, cp.id);
      return;
    }
    if (act === "fx-del") {
      if (UI.needAsk(S, b, T("q.delAsk"))) return;
      await restructure(qs => qs.filter(q => q.id !== id));
      return;
    }
    if (act === "fx-up" || act === "fx-down") {
      await restructure(qs => {
        const ids = qs.map(q => q.id), i = ids.indexOf(id), j = act === "fx-up" ? i - 1 : i + 1;
        if (i < 0 || j < 0 || j >= ids.length) return qs;
        return UI.F.moveId(ids, id, ids[j]).map(x => qs.find(q => q.id === x));
      });
      return;
    }
    if (act === "fx-add-rule" || act === "fx-add-cond" || act === "fx-del-rule" || act === "fx-del-cond") {
      // 先把畫面上沒存的字讀進來（restructure 會讀），再改那一題的規則。
      S.fx.logicOpen.add(id);
      await restructure(qs => qs.map(q => q.id === id ? Object.assign(UI.F.logicAction(act, q, qs, Number(b.dataset.rule), Number(b.dataset.cond)), { answered: q.answered }) : q));
      return;
    }
  }

  // ── 名單 ──
  if (act === "aud-toggle") {
    const role = b.dataset.role;
    S.aud[role] = UI.toggleItem(S.aud[role], { kind: b.dataset.kind, value: b.dataset.value || "" });
    if (b.dataset.kind === "person") S.find[role] = "";
    render(); return;
  }
  if (act === "aud-save") {
    const role = b.dataset.role;
    const ok = await run("err.save", () => D.setAudience(S.id, role, S.aud[role]));
    if (ok === undefined) return;
    await refreshAdmin();
    S.audSaved[role] = UI.audOf(S.admin.audience, role); S.aud[role] = [...S.audSaved[role]];
    S.msg = T("msg.audSaved"); await loadBoot(); render(); return;
  }

  // ── 結果 ──
  if (act === "res-more") { S.more[b.dataset.id] = true; render(); return; }
  if (act === "res-csv") {
    const r = S.results; if (!r) return;
    const blob = new Blob([UI.resultsCSV(r.questions, r.responses, r.form.anonymous)], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = UI.csvFilename(r.form.title);
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    S.msg = T("msg.csv", { n: r.responses.length }); render(); return;
  }

});
// 找人的搜尋框：改 S 再 render()，然後把游標放回去。
document.addEventListener("input", e => {
  const el = e.target;
  if (!el || !el.classList || !el.classList.contains("tf-find")) return;
  const role = el.dataset.role;
  S.find[role] = el.value; render();
  const again = document.getElementById("tf-find-" + role);
  if (again) { again.focus(); const n = again.value.length; try { again.setSelectionRange(n, n); } catch (x) { /* search 型的欄位有的瀏覽器不給 */ } }
});

// 畫布最底下那一格：打 / 打開選單，/ 後面的字篩題型，Enter 加第一個，Esc 收起來。
document.addEventListener("input", e => {
  const t = e.target; if (!t || !t.dataset || !t.dataset.fxSlash || !onQuestions()) return;
  const v = t.value, n = S.admin.questions.length;
  if (v.startsWith("/")) { S.fx.menuAt = n; S.fx.filter = v.slice(1); }
  else if (S.fx.menuAt === n) { S.fx.menuAt = null; S.fx.filter = ""; }
  render();
  const again = document.querySelector("[data-fx-slash]");
  if (again) { again.value = v; again.focus(); again.setSelectionRange(v.length, v.length); }
});
document.addEventListener("keydown", e => {
  const t = e.target; if (!t || !t.dataset || !t.dataset.fxSlash || !onQuestions()) return;
  if (e.key === "Escape") { S.fx.menuAt = null; S.fx.filter = ""; render(); return; }
  if (e.key === "Enter") { e.preventDefault(); const first = document.querySelector(".fx-tail .fx-mi"); if (first) first.click(); else { S.fx.menuAt = S.admin.questions.length; render(); } }
});

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
window.addEventListener("popstate", () => { if (S.me) { parseHash(); openRoute(); } });
