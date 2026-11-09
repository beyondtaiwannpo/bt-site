// 後台「紀錄」的邏輯（2026-12-01，BT Records）：活動記分卡、回饋表、人、年度比較。
//
// 網址：#overview（記分卡清單）、#overview/<活動 id>（一場）、#forms、#forms/<id>/<questions|people|results|log>、
//       #people、#people/<人 id>、#yearly。
// 狀態只有一個 S，畫面只從 S 產生。每一顆按鈕背後都是資料庫的一支函式，門在那裡；這裡少畫一顆按鈕不是安全機制。
import * as AUTH from "../../../shared/auth.js";
import { navHTML } from "../../../shared/nav.js";
import * as D from "./data.js";
import * as UI from "./ui.js";
import { T, lang, setLang, pickLang, STORE_KEY } from "./strings.js";

const HERE = "/admin/records/";

let S = {
  user: null, me: null, down: false, busy: false, msg: "", loaded: false,
  view: "overview", id: null, sub: "questions",
  boot: null, event: null, results: null, person: null, yearly: null,
  people: [], pq: "", pastDraft: null, newDraft: null,
  dir: null, dirErr: "", df: {}, dirN: 0, ptab: "dir",
  yf: {},                                                   // 年度比較的篩選與「比什麼」   // 名錄（2026-12-03）：整份、載入失敗的訊息、篩選、目前印到第幾個、哪個分頁
  aud: null, audSaved: null, find: {}, more: {},
};

const root = () => document.getElementById("bt-root");
const canEnter = () => !!UI.rcLevel(S.me) || !!(S.me && S.me.senior) || !!(S.boot && (S.boot.can_view || (S.boot.events || []).length));
const people = () => (S.boot && S.boot.people) || [];

function body() {
  if (!S.loaded) return UI.skeletonHTML();
  if (!canEnter()) return UI.noAccessHTML(S.me);
  if (S.view === "overview" && S.id) return S.event ? UI.eventHTML(S.event, S) : UI.msgHTML(S.msg) + UI.skeletonHTML();
  if (S.view === "overview") return UI.overviewHTML(S.boot, S.msg) + (S.pastDraft ? UI.pastEventFormHTML(S.boot.terms, S.pastDraft, S.busy) : "");
  if (S.view === "forms" && S.id) {
    if (!S.results) return UI.msgHTML(S.msg) + UI.skeletonHTML();
    const head = UI.formHeadHTML(S.results, S.sub);
    if (S.sub === "people") return head + UI.audienceHTML(S.results, people(), S.aud, S.audSaved, S.find, S.msg, S.busy);
    if (S.sub === "results") return head + UI.resultsHTML(S.results, S.msg, S.more);
    if (S.sub === "log") return head + UI.msgHTML(S.msg) + UI.logHTML(S.results);
    return head + UI.formEditHTML(S.results, S);
  }
  if (S.view === "forms") return UI.formsListHTML(S.boot, S.msg, S.busy, S.newDraft);
  if (S.view === "people" && S.id) return S.person ? UI.personHTML(S.person, S) : UI.msgHTML(S.msg) + UI.skeletonHTML();
  if (S.view === "people") return UI.peopleHTML(S.boot, S);
  if (S.view === "yearly") return UI.yearlyHTML(S);   // 2026-12-04：從 boot.events 算，不另外問資料庫
  return UI.overviewHTML(S.boot, S.msg);
}
function render() {
  const el = root();
  if (!el) return;
  const nav = S.me ? navHTML({ current: "admin", role: S.me.role, name: S.me.name }) : "";
  if (S.down) { el.innerHTML = UI.shellHTML(nav, "", UI.downHTML(S.downErr)); return; }
  if (!S.user) { location.replace("../../app/?next=admin-records"); return; }
  if (!S.me || S.me.role !== "cadre") { el.innerHTML = UI.shellHTML(nav, "", UI.notCadreHTML()); return; }
  el.innerHTML = UI.shellHTML(nav, UI.railHTML("records", S.view, S.me), body());
  UI.afterRender(S, el);
}
function paintShell(tab) {
  const el = root();
  if (!el || !S.me) return;
  const nav = navHTML({ current: "admin", role: S.me.role, name: S.me.name });
  el.innerHTML = UI.shellHTML(nav, UI.railHTML("records", tab || "overview", S.me), UI.skeletonHTML());
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
    if (AUTH.sessionGone(e)) { await AUTH.signOut(); location.replace("../../app/?next=admin-records"); return; }
    console.error(HERE + " 載入失敗：", e);
    if (!retried) return retryBoot();
    S.downErr = String(e && e.message || e); S.down = true; render();
  }
}
const VIEWS = ["overview", "forms", "people", "yearly"];
function parseHash() {
  const parts = (location.hash.slice(1) || new URLSearchParams(location.search).get("tab") || "overview").split("/");
  S.view = VIEWS.includes(parts[0]) ? parts[0] : "overview";
  S.id = parts[1] || null;
  S.sub = UI.SUBS.includes(parts[2]) ? parts[2] : "questions";
}
// 名錄整份拿回來。函式還不在（遷移檔沒跑）就在那一頁說一句，別的分頁照樣能用。
async function loadDir() {
  S.dirErr = "";
  try { S.dir = await D.loadDirectory(); }
  catch (e) { S.dir = null; S.dirErr = /rc_directory/.test(String(e && e.message || e)) ? T("dir.noFn") : T("err.load") + D.says(e); }
}
async function loadBoot() {
  try { S.boot = await D.loadBootstrap(); }
  catch (e) { S.boot = { events: [], forms: [], terms: [], people: [], duplicates: [], counts: {}, can_manage: false, can_view: false }; S.msg = T("err.load") + D.says(e); }
  S.loaded = true;
}
async function openRoute(keepMsg) {
  if (!keepMsg) S.msg = "";
  if (S.view !== "overview" || !S.id) S.event = null;
  if (S.view !== "forms" || S.id !== (S.results && S.results.form && S.results.form.id)) S.results = null;
  if (S.view !== "people" || !S.id) S.person = null;
  render();
  try {
    if (S.view === "overview" && S.id) { S.event = await D.loadEvent(S.id); if (S.event && S.event.can_edit && !Array.isArray(S.dir)) { await loadDir(); } }
    else if (S.view === "forms" && S.id) { S.results = await D.loadResults(S.id); if (!S.aud || S.aud._id !== S.id) resetAud(); }
    else if (S.view === "people" && S.id) S.person = await D.loadPerson(S.id);
    else if (S.view === "people" && !Array.isArray(S.dir)) await loadDir();
  } catch (e) { S.msg = T("err.load") + D.says(e); }
  S.busy = false;
  render();
}
function resetAud() {
  const a = (S.results && S.results.audience) || [];
  S.audSaved = { reader: UI.audOf(a, "reader"), editor: UI.audOf(a, "editor") };
  S.aud = { _id: S.id, reader: [...S.audSaved.reader], editor: [...S.audSaved.editor] };
  S.find = {};
}
function go(hash) { history.pushState(null, "", "#" + hash); parseHash(); openRoute(); }
async function run(label, fn) {
  S.busy = true; S.msg = ""; render();
  try { const r = await fn(); S.busy = false; return r; }
  catch (err) { S.busy = false; S.msg = T(label) + D.says(err); render(); return undefined; }
}
async function refreshForm() { S.results = await D.loadResults(S.id); }
async function refreshEvent() { S.event = await D.loadEvent(S.id); }
const vals = sel => { const box = root().querySelector(sel); return box ? UI.formValues(box) : {}; };

// ── 題目與設定：改了就存（跟內部表單同一套）。 ──
const dirty = UI.dirtyTracker();
async function onAutosave(act, box) {
  if (act !== "rc-save" || !S.results) return;
  const { data, questions } = UI.readFormEditor(box, S.results.questions);
  const key = "rc:" + S.id, serial = JSON.stringify([data, questions]);
  if (!dirty.changed(key, serial)) return;
  if (!data.title) { UI.autosaveState(box, "failed"); UI.toast(T("err.save") + T("err.needTitle")); return; }
  const typeChanged = questions.some(q => { const o = S.results.questions.find(x => x.id === q.id); return o && o.type !== q.type; });
  UI.autosaveState(box, "saving");
  try {
    await D.saveForm(S.id, data, questions);
    dirty.mark(key, serial);
    await refreshForm();
    const live = root().querySelector('[data-autosave="rc-save"]') || box;
    UI.autosaveState(live, "saved"); UI.toast(T("msg.saved"));
    if (typeChanged) render();
  } catch (e) { UI.autosaveState(box, "failed"); UI.toast(T("err.save") + D.says(e)); }
}
async function restructure(fn) {
  const box = root().querySelector('[data-autosave="rc-save"]'); if (!box) return;
  const { data, questions } = UI.readFormEditor(box, S.results.questions);
  const next = fn(questions);
  const ok = await run("err.save", () => D.saveForm(S.id, data, next));
  if (ok === undefined) return;
  dirty.forget("rc:" + S.id);
  await refreshForm(); render();
}
function download(text, name) {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

document.addEventListener("click", async e => {
  const b = e.target.closest("[data-act]");
  if (!b) return;
  const act = b.dataset.act;
  if (act === "retry") { location.reload(); return; }
  if (act === "ask-cancel") { UI.cancelAsk(S, root()); return; }
  if (act === "lang") { switchLang(b.dataset.lang); return; }
  if (act === "signout") { await AUTH.signOut(); location.replace("../../app/"); return; }
  if (act === "tab") { e.preventDefault(); go(VIEWS.includes(b.dataset.t) ? b.dataset.t : "overview"); return; }
  if (act === "open-event") { e.preventDefault(); go("overview/" + b.dataset.id); return; }
  if (act === "back-overview") { go("overview"); await loadBoot(); render(); return; }
  if (act === "open-form") { e.preventDefault(); go("forms/" + b.dataset.id + (b.getAttribute("href") || "").replace(/^#forms\/[^/]+/, "")); return; }
  if (act === "back-forms") { go("forms"); await loadBoot(); render(); return; }
  if (act === "open-person") { e.preventDefault(); go("people/" + b.dataset.id); return; }
  if (act === "back-people") { go("people"); await loadBoot(); render(); return; }
  if (act === "sub") { e.preventDefault(); go(`forms/${S.id}/${b.dataset.t}`); return; }
  if (act === "res-more") { S.more[b.dataset.id] = true; render(); return; }

  // ── 總覽：舊活動 ──
  if (act === "ev-new") { S.pastDraft = { kind: "bootcamp" }; render(); return; }
  if (act === "ev-new-cancel") { S.pastDraft = null; render(); return; }
  if (act === "ev-create") {
    const v = vals("[data-past]");
    const p = { slug: v.slug, kind: v.kind, term_id: v.term_id || "", title_zh: v.title_zh || "", title_en: v.title_en || "", team: v.team || "", starts_at: UI.fromLocal(v.starts_at || ""), ends_at: UI.fromLocal(v.ends_at || "") };
    const id = await run("err.create", () => D.addPastEvent(p));
    if (id === undefined) { S.pastDraft = Object.assign({}, S.pastDraft, v); render(); return; }
    S.pastDraft = null; await loadBoot(); go("overview/" + id); return;
  }

  // ── 一場 ──
  if (act === "ev-meta-save") {
    const v = vals("[data-evmeta]");
    const ok = await run("err.save", () => D.saveEventMeta(S.id, { kind: v.kind, term_id: v.term_id || "" }));
    if (ok === undefined) return;
    await refreshEvent(); await loadBoot(); S.msg = T("msg.saved"); render(); return;
  }
  if (act === "sess-add") {
    const box = root().querySelector("[data-sessions]");
    const cur = box ? UI.readSessions(box) : (S.event.sessions || []).map(s => ({ id: s.id, title: s.title, starts_at: s.starts_at }));
    const ok = await run("err.save", () => D.setSessions(S.id, [...cur, { title: T("ev.sessTitle") + " " + (cur.length + 1), starts_at: "" }]));
    if (ok === undefined) return;
    await refreshEvent(); render(); return;
  }
  if (act === "sess-del") {
    const box = root().querySelector("[data-sessions]"); if (!box) return;
    const cur = UI.readSessions(box).filter((_, k) => k !== Number(b.dataset.i));
    const ok = await run("err.save", () => D.setSessions(S.id, cur));
    if (ok === undefined) return;
    await refreshEvent(); render(); return;
  }
  if (act === "sess-save") {
    const box = root().querySelector("[data-sessions]"); if (!box) return;
    const ok = await run("err.save", () => D.setSessions(S.id, UI.readSessions(box)));
    if (ok === undefined) return;
    await refreshEvent(); S.msg = T("msg.saved"); render(); return;
  }
  if (act === "part-sync") {
    const n = await run("err.sync", () => D.syncEvent(S.id));
    if (n === undefined) return;
    await refreshEvent(); await loadBoot(); S.msg = T("msg.synced", { n }); render(); return;
  }
  if (act === "part-add") {
    const v = vals("[data-partadd]");
    const picked = UI.dirMatch(S.dir, v.who);   // 從名單清單選到的人：直接用那一列，不建新的
    if (!picked && !String(v.name_zh || v.name_en || v.email || "").trim()) { S.msg = T("err.save") + T("err.needName"); render(); return; }
    const ok = await run("err.save", () => D.setParticipation(S.id, picked ? { person_id: picked.id, role: v.role, status: v.status } : { name_zh: v.name_zh, name_en: v.name_en, email: v.email, school: v.school, role: v.role, status: v.status }));
    if (ok === undefined) return;
    await refreshEvent(); await loadBoot(); S.msg = T("msg.saved"); render(); return;
  }
  if (act === "part-save") {
    const box = root().querySelector("[data-parts]"); if (!box) return;
    const rows = UI.readPartStatus(box), cur = S.event.participation || [];
    const changed = rows.filter(r => { const o = cur.find(x => x.id === r.id); return o && o.status !== r.status; });
    const ok = await run("err.save", async () => { for (const r of changed) { const o = cur.find(x => x.id === r.id); await D.setParticipation(S.id, { person_id: o.person_id, role: o.role, status: r.status, session_id: o.session_id || "" }); } return changed.length; });
    if (ok === undefined) return;
    await refreshEvent(); S.msg = T("msg.saved"); render(); return;
  }
  if (act === "part-del") {
    const ok = await run("err.delete", () => D.removeParticipation(b.dataset.id));
    if (ok === undefined) return;
    await refreshEvent(); render(); return;
  }
  if (act === "form-template") {
    const kind = b.dataset.kind, ev = b.dataset.event, l = lang();
    const title = `${UI.evTitle(S.event.event)} · ${T("fkind." + kind)}`;
    const id = await run("err.create", () => D.saveForm(null, { title, kind, event_id: ev, lang: l }, UI.templateQuestions(kind, l)));
    if (id === undefined) return;
    await loadBoot(); go("forms/" + id); S.msg = T("msg.created"); return;
  }
  if (act === "pair-add") {
    const v = vals("[data-pairadd]");
    // 從名單清單選到的人直接用那一列（mentor_id / mentee_id）；沒選的才照 email 與名字建或對。
    const mentor = UI.dirMatch(S.dir, v.mentor_who), mentee = UI.dirMatch(S.dir, v.mentee_who);
    if (!mentor && !String(v.mentor_name_en || v.mentor_email || "").trim()) { S.msg = T("err.save") + T("err.needName"); render(); return; }
    if (!mentee && !String(v.mentee_name_zh || v.mentee_email || "").trim()) { S.msg = T("err.save") + T("err.needName"); render(); return; }
    const ok = await run("err.save", () => D.savePair(null, { event_id: S.id, mentor_id: mentor ? mentor.id : "", mentee_id: mentee ? mentee.id : "", mentor_name_en: v.mentor_name_en, mentor_email: v.mentor_email, mentee_name_zh: v.mentee_name_zh, mentee_email: v.mentee_email, mentee_school: v.mentee_school, matched_on: v.matched_on || "" }));
    if (ok === undefined) return;
    await refreshEvent(); await loadBoot(); S.msg = T("msg.saved"); render(); return;
  }
  if (act === "pair-end") {
    if (UI.needAsk(S, b, T("pair.endAsk"))) return;
    const ok = await run("err.save", () => D.savePair(b.dataset.id, { ended_on: new Date().toISOString().slice(0, 10), end_reason: "completed" }));
    if (ok === undefined) return;
    await refreshEvent(); render(); return;
  }
  if (act === "pair-del") {
    if (UI.needAsk(S, b, T("ed.deleteAsk"))) return;
    const ok = await run("err.delete", () => D.deletePair(b.dataset.id));
    if (ok === undefined) return;
    await refreshEvent(); render(); return;
  }
  if (act === "rev-save") {
    const box = root().querySelector("[data-review]"); if (!box) return;
    const ok = await run("err.save", () => D.saveReview(S.id, UI.readReview(box)));
    if (ok === undefined) return;
    await refreshEvent(); await loadBoot(); S.msg = T("msg.reviewSaved"); render(); return;
  }

  // ── 回饋表 ──
  if (act === "form-new") { S.newDraft = { title: "", kind: "post-event" }; render(); const t = document.getElementById("rc-new-title"); if (t) t.focus(); return; }
  if (act === "form-new-cancel") { S.newDraft = null; render(); return; }
  if (act === "form-create") {
    const v = vals("[data-newform]"), title = String((document.getElementById("rc-new-title") || {}).value || "").trim();
    if (!title) { S.msg = T("err.create") + T("err.needTitle"); render(); return; }
    const qs = v.template ? UI.templateQuestions(v.kind, v.lang || lang()) : [];
    const id = await run("err.create", () => D.saveForm(null, { title, kind: v.kind, event_id: v.event_id || "", lang: v.lang || lang() }, qs));
    if (id === undefined) { S.newDraft = Object.assign({}, S.newDraft, v, { title }); render(); return; }
    S.newDraft = null; await loadBoot(); go("forms/" + id); S.msg = T("msg.created"); return;
  }
  if (act === "form-status") {
    const ok = await run("err.status", () => D.setStatus(S.id, b.dataset.id));
    if (ok === undefined) return;
    await refreshForm(); await loadBoot(); render(); return;
  }
  if (act === "form-delete") {
    if (UI.needAsk(S, b, T("ed.deleteAsk"))) return;
    const ok = await run("err.delete", () => D.deleteForm(S.id));
    if (ok === undefined) return;
    S.results = null; S.msg = T("msg.deleted"); await loadBoot(); go("forms"); return;
  }
  // 三屆前的具名答案轉匿名（2026-12-02）：先問資料庫有幾份、界線是哪一天，數字放進 needAsk 那一行，再按一次才真的清（後台不用瀏覽器的 confirm）。
  if (act === "anonymise") {
    const peek = await run("err.anon", () => D.anonymiseOld(false));
    if (peek === undefined) return;
    if (!peek || !peek.cutoff) { UI.toast(T("anon.noTerms")); render(); return; }
    const n = Number(peek.n || 0);
    if (!n) { UI.toast(T("anon.none", { cutoff: peek.cutoff })); render(); return; }
    render();
    if (UI.needAsk(S, b, T("anon.ask", { n, cutoff: peek.cutoff }))) return;   // 第一次按：把數字掛在按鈕旁邊問一句；第二次才做
    const done = await run("err.anon", () => D.anonymiseOld(true));
    if (done === undefined) return;
    S.msg = T("anon.done", { n: Number(done.n || 0) }); await loadBoot(); render(); return;
  }
  if (act === "copy-link") {
    const el = document.getElementById("rc-link"); if (!el) return;
    try { await navigator.clipboard.writeText(el.value); UI.toast(T("msg.copied")); } catch (x) { el.select(); }
    return;
  }
  if (act === "q-add") { await restructure(qs => [...qs, UI.newQuestion(b.dataset.t)]); return; }
  if (act === "q-template") { await restructure(qs => [...qs, ...UI.templateQuestions(S.results.form.kind, S.results.form.lang)]); return; }
  if (act === "q-del") { const i = Number(b.dataset.i); await restructure(qs => qs.filter((_, k) => k !== i)); return; }
  if (act === "q-up" || act === "q-down") {
    const i = Number(b.dataset.i), j = act === "q-up" ? i - 1 : i + 1;
    await restructure(qs => { const c = [...qs]; if (j < 0 || j >= c.length) return c; [c[i], c[j]] = [c[j], c[i]]; return c; });
    return;
  }
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
    await refreshForm();
    S.audSaved[role] = UI.audOf(S.results.audience, role); S.aud[role] = [...S.audSaved[role]];
    S.msg = T("msg.audSaved"); render(); return;
  }
  if (act === "res-csv") {
    const r = S.results; if (!r) return;
    download(UI.resultsCSV(r.questions, r.responses, r.form.anonymous), UI.csvFilename(r.form.title));
    S.msg = T("msg.csv", { n: r.responses.length }); render(); return;
  }
  if (act === "yr-csv") { download(UI.yearlyCSV((S.boot || {}).events || [], S.yf), "bt-yearly.csv"); return; }
  if (act === "yr-clear") { S.yf = { metric: (S.yf || {}).metric }; render(); return; }

  // ── 人 ──
  if (act === "ptab") { S.ptab = b.dataset.t; S.msg = ""; render(); return; }
  if (act === "dir-clear") { S.df = {}; S.pq = ""; S.people = []; S.dirN = 0; render(); return; }
  if (act === "dir-more") { S.dirN = (S.dirN || UI.DIR_PAGE) + UI.DIR_PAGE; render(); return; }
  if (act === "person-add-event") {
    const v = vals("[data-paddev]");
    if (!v.event_id) { S.msg = T("err.save") + T("err.needEvent"); render(); return; }
    const ok = await run("err.save", () => D.setParticipation(v.event_id, { person_id: S.id, role: v.role, status: v.status }));
    if (ok === undefined) return;
    S.dir = null; S.person = await D.loadPerson(S.id); await loadBoot(); S.msg = T("msg.saved"); render(); return;
  }
  // 同名一群一張卡（2026-12-06）：radio 留哪欄、checkbox 勾哪幾欄，一顆鈕併，一顆鈕記「不是同一個人」。
  if (act === "dup-merge" || act === "dup-not-same") {
    const box = b.closest("[data-dup]"); if (!box) return;
    const { keep, drops } = UI.dupPick(box);
    if (!keep || !drops.length) { UI.toast(T("dup.needPick")); return; }
    const name = (box.querySelector("thead th.kept b") || {}).textContent || "";
    if (UI.needAsk(S, b, T(act === "dup-merge" ? "dup.mergeAsk" : "dup.notSameAsk2", { n: drops.length, name }))) return;
    S.busy = true; S.msg = ""; render();
    let done = 0;
    try {
      for (const d of drops) { if (act === "dup-merge") await D.mergePeople(keep, d); else await D.markNotSame(keep, d); done++; }
      S.busy = false; S.dir = null; await loadBoot(); if (act === "dup-merge") await loadDir();
      S.msg = act === "dup-merge" ? T("msg.mergedN", { n: done }) : T("msg.notSame"); render();
    } catch (err) {
      S.busy = false; S.dir = null; await loadBoot();
      S.msg = T(act === "dup-merge" ? "err.merge" : "err.notSame") + D.says(err) + (done ? ` (${done}/${drops.length})` : ""); render();
    }
    return;
  }
  if (act === "not-same") {
    if (UI.needAsk(S, b, T("dup.notSameAsk"))) return;
    const ok = await run("err.notSame", () => D.markNotSame(b.dataset.a, b.dataset.b));
    if (ok === undefined) return;
    await loadBoot(); S.msg = T("msg.notSame"); render(); return;
  }
  if (act === "person-add") {
    const v = vals("[data-padd]");
    if (!String(v.name_zh || v.name_en || v.email || "").trim()) { S.msg = T("err.save") + T("err.needName"); render(); return; }
    const id = await run("err.save", () => D.savePerson(null, { name_zh: v.name_zh, name_en: v.name_en, email: v.email, kind: v.kind, school: v.school, grad_year: v.grad_year || "" }));
    if (id === undefined) return;
    S.dir = null; await loadBoot(); go("people/" + id); return;
  }
  if (act === "person-save") {
    const v = vals("[data-pedit]");
    const ok = await run("err.save", () => D.savePerson(S.id, { name_zh: v.name_zh, name_en: v.name_en, school: v.school, grad_year: v.grad_year || "", kind: v.kind, note: v.note, email: v.email || "" }));
    if (ok === undefined) return;
    S.dir = null; S.person = await D.loadPerson(S.id); await loadBoot(); S.msg = T("msg.saved"); render(); return;
  }
  if (act === "merge") {
    if (UI.needAsk(S, b, T("merge.ask"))) return;
    const ok = await run("err.merge", () => D.mergePeople(b.dataset.keep, b.dataset.drop));
    if (ok === undefined) return;
    S.dir = null; await loadBoot(); await loadDir(); S.msg = T("msg.merged"); render(); return;
  }
  if (act === "forget") {
    if (UI.needAsk(S, b, T("person.forgetAsk"))) return;
    const ok = await run("err.forget", () => D.forgetPerson(b.dataset.id));
    if (ok === undefined) return;
    S.dir = null; S.person = await D.loadPerson(S.id); await loadBoot(); S.msg = T("msg.forgot"); render(); return;
  }
  if (act === "out-add") {
    const v = vals("[data-oadd]");
    const ok = await run("err.save", () => D.saveOutcome(null, { person_id: S.id, kind: v.kind, year: v.year || "", institution: v.institution, country: v.country, major: v.major, visibility: v.visibility }));
    if (ok === undefined) return;
    S.person = await D.loadPerson(S.id); S.msg = T("msg.saved"); render(); return;
  }
  if (act === "out-del") {
    const ok = await run("err.delete", () => D.deleteOutcome(b.dataset.id));
    if (ok === undefined) return;
    S.person = await D.loadPerson(S.id); render(); return;
  }
});

// 搜尋框：找人（打字停 300 毫秒才問資料庫）、找幹部加進名單。
let findTimer = null;
// 名錄的篩選下拉：改了就重畫（不存資料庫，data-noauto 讓自動儲存不接手）。
document.addEventListener("change", e => {
  const el = e.target;
  if (!el || !el.classList) return;
  if (el.classList.contains("rc-yfilter")) { S.yf = { ...(S.yf || {}), [el.name]: el.value }; render(); return; }
  if (!el.classList.contains("rc-dfilter")) return;
  S.df = { ...(S.df || {}), [el.name]: el.value }; S.dirN = 0; render();
});
document.addEventListener("input", e => {
  const el = e.target;
  if (!el || !el.classList) return;
  if (el.classList.contains("rc-pfind")) {
    S.pq = el.value; S.dirN = 0;
    clearTimeout(findTimer);
    findTimer = setTimeout(async () => {
      // 名字與學校在瀏覽器裡篩（名錄已經整份在手上）；打 email 的才去資料庫找（只有管的人找得到 email）。
      try { S.people = S.pq.includes("@") && S.boot && S.boot.can_manage ? await D.findPeople(S.pq) : []; } catch (x) { S.msg = T("err.load") + D.says(x); }
      render();
      const again = document.getElementById("rc-pfind");
      if (again) { again.focus(); const n = again.value.length; try { again.setSelectionRange(n, n); } catch (x) { /* search 型的欄位有的瀏覽器不給 */ } }
    }, 300);
    return;
  }
  if (el.classList.contains("tf-find")) {
    const role = el.dataset.role;
    S.find[role] = el.value; render();
    const again = document.getElementById("tf-find-" + role);
    if (again) { again.focus(); const n = again.value.length; try { again.setSelectionRange(n, n); } catch (x) { /* 同上 */ } }
  }
});

// 語言（2026-10-19 中英切換，做法見 docs/2026-10-19-後台中英切換.md）。
function readStored() { try { return localStorage.getItem(STORE_KEY); } catch (e) { return null; } }
function applyLang(l) {
  setLang(l);
  document.documentElement.lang = lang() === "zh" ? "zh-Hant" : "en";
  document.title = T("rc.title");
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
