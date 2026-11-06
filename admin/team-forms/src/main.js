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
};

const root = () => document.getElementById("bt-root");
const canBuild = () => !!UI.tfLevel(S.me) || !!(S.boot && (S.boot.can_create || (S.boot.manage || []).length));
const people = () => (S.boot && S.boot.people) || [];

function body() {
  if (!S.loaded) return UI.skeletonHTML();
  if (S.view === "fill" && S.id) return S.fill ? UI.fillHTML(S.fill, S.msg, S.busy) : UI.msgHTML(S.msg) + UI.skeletonHTML();
  if (S.view === "fill") return UI.fillListHTML(S.boot, S.msg);
  if (!canBuild()) return UI.noAccessHTML(S.me);
  if (!S.id) return UI.buildListHTML(S.boot, S.msg, S.busy, S.newDraft);
  if (!S.admin) return UI.msgHTML(S.msg) + UI.skeletonHTML();
  const head = UI.editorHeadHTML(S.admin, S.sub);
  if (S.sub === "people") return head + UI.audienceHTML(S.admin, people(), S.aud, S.audSaved, S.find, S.msg, S.busy);
  if (S.sub === "results") return head + (S.results ? UI.resultsHTML(S.results, S.msg, S.more) : UI.msgHTML(S.msg) + UI.skeletonHTML());
  if (S.sub === "log") return head + UI.msgHTML(S.msg) + UI.logHTML(S.admin);
  return head + UI.questionsEditHTML(S.admin, S.msg, S.busy);
}
function render() {
  const el = root();
  if (!el) return;
  const nav = S.me ? navHTML({ current: "admin", role: S.me.role, name: S.me.name }) : "";
  if (S.down) { el.innerHTML = UI.shellHTML(nav, "", UI.downHTML(S.downErr)); return; }
  if (!S.user) { location.replace("../../app/?next=admin-team-forms"); return; }
  if (!S.me || S.me.role !== "cadre") { el.innerHTML = UI.shellHTML(nav, "", UI.notCadreHTML()); return; }
  const counts = S.boot ? { fill: (S.boot.todo || []).length } : {};
  el.innerHTML = UI.shellHTML(nav, UI.railHTML("teamforms", S.view === "fill" ? "fill" : "build", S.me, counts), body());
  UI.afterRender(S, el);
}
function paintShell(tab) {
  const el = root();
  if (!el || !S.me) return;
  const nav = navHTML({ current: "admin", role: S.me.role, name: S.me.name });
  el.innerHTML = UI.shellHTML(nav, UI.railHTML("teamforms", tab || "fill", S.me), UI.skeletonHTML());
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
  S.fill = null; S.results = null;
  if (S.view === "build" && S.id !== S.admin?.form?.id) S.admin = null;
  render();
  try {
    if (S.view === "fill" && S.id) S.fill = await D.loadFill(S.id);
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

// ── 題目與設定：改了就存。成功只改 S 不重畫（人可能還在打字），換了題型才重畫（要長出選項或量表那幾格）。 ──
const dirty = UI.dirtyTracker();
async function onAutosave(act, box) {
  if (act !== "tf-save" || !S.admin) return;
  const { data, questions } = UI.readEditor(box, S.admin.questions);
  const key = "tf:" + S.id, serial = JSON.stringify([data, questions]);
  if (!dirty.changed(key, serial)) return;
  if (!data.title) { UI.autosaveState(box, "failed"); UI.toast(T("err.save") + T("err.needTitle")); return; }
  const typeChanged = questions.some(q => { const o = S.admin.questions.find(x => x.id === q.id); return o && o.type !== q.type; });
  UI.autosaveState(box, "saving");
  try {
    await D.saveForm(S.id, data, questions);
    dirty.mark(key, serial);
    await refreshAdmin();
    const live = root().querySelector('[data-autosave="tf-save"]') || box;
    UI.autosaveState(live, "saved"); UI.toast(T("msg.saved"));
    if (typeChanged) render();
  } catch (e) { UI.autosaveState(box, "failed"); UI.toast(T("err.save") + D.says(e)); }
}
// 加、刪、移題目：先把畫面上現在的值讀進來（還沒存的字不會丟），改清單，存，重畫。
async function restructure(fn) {
  const box = root().querySelector('[data-autosave="tf-save"]'); if (!box) return;
  const { data, questions } = UI.readEditor(box, S.admin.questions);
  const next = fn(questions);
  const ok = await run("err.save", () => D.saveForm(S.id, data, next));
  if (ok === undefined) return;
  dirty.forget("tf:" + S.id);
  await refreshAdmin(); render();
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

  // ── 填 ──
  if (act === "fill-send") {
    const box = root().querySelector("[data-fill]"); if (!box || !S.fill) return;
    const answers = UI.readAnswers(box, S.fill.questions);
    const miss = UI.missingRequired(S.fill.questions, answers);
    if (miss) { S.msg = T("err.send") + T("err.needRequired", { n: miss }); render(); return; }
    const had = !!S.fill.mine;
    const ok = await run("err.send", () => D.submit(S.id, answers));
    if (ok === undefined) { keepAnswers(answers); return; }
    S.msg = T(had ? "msg.updated" : "msg.sent");
    await loadBoot(); await openRoute(true); return;
  }

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

  // ── 題目 ──
  if (act === "q-add") { await restructure(qs => [...qs, UI.newQuestion(b.dataset.t)]); return; }
  if (act === "q-del") { const i = Number(b.dataset.i); await restructure(qs => qs.filter((_, k) => k !== i)); return; }
  if (act === "q-up" || act === "q-down") {
    const i = Number(b.dataset.i), j = act === "q-up" ? i - 1 : i + 1;
    await restructure(qs => { const c = [...qs]; if (j < 0 || j >= c.length) return c; [c[i], c[j]] = [c[j], c[i]]; return c; });
    return;
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
// 送不出去時把剛填的答案放回畫面（重畫會洗掉）。
function keepAnswers(answers) {
  if (!S.fill) return;
  const vals = {};
  for (const [k, v] of Object.entries(answers)) vals[k] = Array.isArray(v) ? v.join("\n") : v;
  S.fill = Object.assign({}, S.fill, { draft: vals });
  render();
}

// 找人的搜尋框：改 S 再 render()，然後把游標放回去。
document.addEventListener("input", e => {
  const el = e.target;
  if (!el || !el.classList || !el.classList.contains("tf-find")) return;
  const role = el.dataset.role;
  S.find[role] = el.value; render();
  const again = document.getElementById("tf-find-" + role);
  if (again) { again.focus(); const n = again.value.length; try { again.setSelectionRange(n, n); } catch (x) { /* search 型的欄位有的瀏覽器不給 */ } }
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
