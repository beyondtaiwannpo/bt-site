// 後台「護照」那一組的邏輯：實習護照的屆別與格子。幹部護照的格子是批 2 的事。
// 2026-10-15 從 admin/src/main.js 原樣搬過來（後台拆成四個資料夾，見 README「後台的四個資料夾」）。
//
// 狀態只有一個 S，畫面只從 S 產生。**不在事件處理裡直接改 DOM**，一律改 S 再 render()。
import * as AUTH from "../../../shared/auth.js";
import { navHTML } from "../../../shared/nav.js";
import * as D from "./data.js";
import * as UI from "./ui.js";
import { T, lang, setLang, pickLang, STORE_KEY } from "./strings.js";

const HERE = "/admin/passports/";

let S = {
  user: null, me: null, down: false, busy: false, msg: "",
  view: "interns",         // interns | intern-term | intern-task
  // 一定要有初始值：載入失敗之後再 render 一次不能整頁空白。
  intern: { terms: [], tasks: [], stamped: {}, interns: 0 }, internSel: null,
  internTermEditing: null, internTaskEditing: null, internTaskTerm: null,
  // 存檔被擋時留住剛填的東西（端對端測試 2026-10-18 抓到：沒有這個，一句錯誤訊息會配一張空表單）。
  internTermDraft: null, internTaskDraft: null,
  // 幹部護照的後台（2026-10-20，批 2）。一定要有初始值。
  pass: { months: [], activities: [], destinations: [], stamped: {} },
  actEditing: null, actMonth: null, actDraft: null,
  monthEditing: null, monthDraft: null,
  destEditing: null, destDraft: null,
  // 預覽框現在翻到哪個月。null 就沒有框。重畫不會重新載 iframe（src 沒變瀏覽器不會重抓），
  // 要重抓按「重新整理預覽」。
  previewMonth: null,
  // 實習護照的預覽框：null 沒有框，"" 開在資料頁，"project" 之類開在那個分類。
  internPreviewCat: null,
  // 蛇梯棋的棋盤（2026-10-22）。board 是資料庫裡的，draft 是畫面上改到一半的，boardSel 是點了哪一格。
  board: null, boardDraft: null, boardSel: null,
};

const root = () => document.getElementById("bt-root");
// 2026-10-24 起看指派（my_access()）：幹部護照那幾個分頁給被派進 passport 工作區的人，
// 實習護照給被派進 intern-passport 的人；Co-President 與 Senior Adviser 兩邊都有。
// **這只是畫面。真正的門在資料庫那幾支函式的第一句（require_ws_edit / require_internship_team）。**
const isPres = () => !!UI.wsLevel(S.me, "passport");
const internStaff = () => !!S.me && S.me.role === "cadre" && !!UI.wsLevel(S.me, "intern-passport");

function render() {
  const el = root();
  if (!el) return;
  const nav = S.me ? navHTML({ current: "admin", role: S.me.role, name: S.me.name }) : "";

  if (S.down) { el.innerHTML = UI.shellHTML(nav, "", UI.downHTML(S.downErr)); return; }
  if (!S.user) { location.replace("../../app/?next=admin-passports"); return; }
  if (!S.me || S.me.role !== "cadre") { el.innerHTML = UI.shellHTML(nav, "", UI.notCadreHTML()); return; }
  if (!internStaff() && !isPres()) { el.innerHTML = UI.shellHTML(nav, UI.railHTML("passports", "", S.me), UI.noAccessHTML(S.me)); return; }

  let body;
  if (S.view === "members" && S.mp) {
    body = UI.membersPanelHTML(S.mp, S.msg, S.busy);
  } else if (S.view === "board") {
    const cur = S.intern.terms.find(t => t.id === S.internSel) || S.intern.terms.find(t => t.active) || null;
    body = UI.boardAdminHTML(cur, cur ? S.intern.tasks.filter(t => t.term === cur.id && t.active) : [], S.board, S.boardDraft, S.boardSel, S.msg, S.busy);
  } else if (S.view === "cities" && isPres()) {
    body = UI.citiesHTML(S.pass, S.msg, S.busy);
  } else if (S.view === "cadre" && isPres()) {
    body = UI.passportAdminHTML(S.pass, S.msg, S.busy, S.previewMonth, UI.mpItems(S.me, "passport", S.workspaces));
  } else if (S.view === "act-edit" && isPres()) {
    body = UI.activityEditHTML(S.actEditing, S.actMonth, S.pass.months, S.msg, S.busy, S.actDraft);
  } else if (S.view === "month-edit" && isPres()) {
    body = UI.monthEditHTML(S.monthEditing, S.msg, S.busy, S.monthDraft);
  } else if (S.view === "dest-edit" && isPres()) {
    body = UI.destinationEditHTML(S.destEditing, S.msg, S.busy, S.destDraft);
  } else if (S.view === "intern-term") {
    body = UI.internTermEditHTML(S.internTermEditing, S.msg, S.busy, S.internTermDraft);
  } else if (S.view === "intern-task") {
    body = UI.internTaskEditHTML(S.internTaskEditing, S.internTaskTerm,
      UI.suggestTaskId(S.internTaskTerm, S.intern.tasks), S.msg, S.busy, S.internTaskDraft);
  } else {
    body = UI.internAdminHTML(S.intern, S.internSel, S.msg, S.busy, isPres(), S.internPreviewCat, UI.mpItems(S.me, "intern-passport", S.workspaces));
  }
  // 側欄亮哪一行：幹部護照的三個編輯畫面算在「幹部護照」底下，其餘算「實習護照」。
  const tab = S.view === "board" ? "board" : (S.view === "members" && S.mp && S.mp.ws === "passport") ? "cadre" : ["cities", "dest-edit"].includes(S.view) ? "cities"
    : ["cadre", "act-edit", "month-edit"].includes(S.view) ? "cadre" : "interns";
  el.innerHTML = UI.shellHTML(nav, UI.railHTML("passports", tab, S.me), body);
  UI.afterRender(S, el);
}

// 側欄與頂欄先畫（2026-11-06，後台速度）：知道我是誰就先把外殼畫出來，內容那一格放骨架，資料回來 render() 整個換掉。
// S.me 從分頁快取拿幾乎不用等（shared/auth.js 的 whoAmI），所以外殼可以在第一趟資料回來之前就在。
function paintShell(tab) {
  const el = root();
  if (!el || !S.me) return;
  const nav = navHTML({ current: "admin", role: S.me.role, name: S.me.name });
  el.innerHTML = UI.shellHTML(nav, UI.railHTML("passports", tab || "", S.me), UI.skeletonHTML());
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
    // 2026-11-06：工作區清單跟「我是誰」同時發；我是誰一回來先畫側欄。
    const wsP = D.loadWorkspaces().catch(() => []);
    S.me = await D.loadMe(S.user.id);
    if (!S.me || S.me.role !== "cadre" || (!internStaff() && !isPres())) { render(); return; }
    // ?tab=cadre 直接開幹部護照（README 的連結用得到）。不是 Co-President 的回到實習護照。
    const want = location.hash.slice(1) || new URLSearchParams(location.search).get("tab");
    paintShell(want);
    // 2026-11-06 自動儲存：掛一次在 #bt-root（它不會被換掉）。哪些表單會走到這裡見 onAutosave。
    UI.bindAutosave(root(), onAutosave);
    S.workspaces = await wsP;
    await openTab(want);
  } catch (e) {
    if (AUTH.sessionGone(e)) { await AUTH.signOut(); location.replace("../../app/?next=admin-passports"); return; }
    console.error(HERE + " 載入失敗：", e);
    if (!retried) return retryBoot();
    S.downErr = String(e && e.message || e); S.down = true; render();
  }
}

// ── 自動儲存（2026-11-06，Paul：每一格都像 Workspaces 那一頁「改了就存」）────────────────
// 走到這裡的五個表單都是「改既有的」：幹部護照的一格（act-save）、月份的時刻（month-save）、城市的名字（dest-save）、
// 實習的一屆（intern-term-save）、實習的一格（intern-task-save）。新增（還沒有 id）的那幾張表單還是按鈕，
// 走下面 handle() 原本那幾個分支；存成功之後進入編輯就自動存。
// 規矩：成功**不 render()**（人可能還在打字，畫面上已經是他打的字），只把 S 裡那一筆改成新值、欄位旁的小字變「存好了」、
// 左下角 toast 一句；失敗也不 render、不清欄位，小字變「沒存進去」加一句錯在哪。
// 驗證跟原本按鈕一樣（標題要有、五格要填），不過就當失敗處理，不送。
// dirty：同一格的值沒變就不再送（離開欄位又停 800 毫秒會觸發兩次）。
const dirty = UI.dirtyTracker();
async function onAutosave(act, box, field) {
  const v = UI.formValues(box), ds = box.dataset;
  const fname = (field && field.name) || "", fval = fname ? v[fname] : undefined;
  const key = act + ":" + (ds.id || ds.seq || ds.code || "") + ":" + fname;
  if (fname && !dirty.changed(key, fval)) return;
  const fail = msg => { UI.autosaveState(box, "failed"); UI.toast(msg); };
  UI.autosaveState(box, "saving");
  try {
    let done = "";
    if (act === "act-save") {
      const a = { id: ds.id, month: v.month || S.actMonth, category: v.category, title_zh: v.title_zh, title_en: v.title_en,
                  description: v.description, needs_host: !!v.needs_host, callback_to: String(v.callback_to || "").toUpperCase() };
      if (!a.title_zh || !a.title_en) return fail(T("err.titles"));
      await D.saveActivity(a);
      const cur = S.pass.activities.find(x => x.id === a.id); if (cur) Object.assign(cur, a);
      done = T("msg.actEdited", { t: a.title_zh });
    } else if (act === "month-save") {
      await D.saveMonthTheme(ds.seq, v.theme_zh, v.theme_en);
      const cur = S.pass.months.find(x => String(x.seq) === ds.seq); if (cur) Object.assign(cur, { theme_zh: v.theme_zh, theme_en: v.theme_en });
      done = T("msg.themeSaved", { m: UI.monthLabel(cur ? cur.month : ds.month) });
    } else if (act === "dest-save") {
      if (!v.city) return fail(T("err.cityBoth"));
      await D.saveDestination(ds.code, v.city, ds.active !== "0");
      const cur = S.pass.destinations.find(x => x.code === ds.code); if (cur) cur.city = v.city;
      done = T("msg.cityEdited", { c: v.city });
    } else if (act === "intern-term-save") {
      const t = { id: ds.id, title_zh: v.title_zh, title_en: v.title_en, starts_on: v.starts_on, ends_on: v.ends_on };
      if (!t.id || !t.title_zh || !t.title_en || !t.starts_on || !t.ends_on) return fail(T("err.termFive"));
      await D.saveInternTerm(t);
      const cur = S.intern.terms.find(x => x.id === t.id); if (cur) Object.assign(cur, t);
      done = T("msg.termEdited", { t: t.title_zh });
    } else if (act === "intern-task-save") {
      const t = { id: ds.id, term: ds.term, seq: v.seq, category: v.category, title_zh: v.title_zh, title_en: v.title_en, description: v.description };
      if (!t.id || !t.title_zh || !t.title_en) return fail(T("err.taskThree"));
      await D.saveInternTask(t);
      const cur = S.intern.tasks.find(x => x.id === t.id); if (cur) Object.assign(cur, { ...t, seq: Number(t.seq) || cur.seq });
      done = T("msg.taskEdited", { t: t.title_zh });
    } else return;
    if (fname) dirty.mark(key, fval);
    UI.autosaveState(box, "saved");
    UI.toast(done);
  } catch (err) { fail(T("err.save") + D.says(err)); }
}

// 哪一個分頁：不是 Co-President 的回到實習護照。側欄、上一頁、網址列改 # 都走這裡。
async function openTab(want) {
  if (want === "cadre" && isPres()) await openCadre();
  else if (want === "cities" && isPres()) await openCities();
  else if (want === "board") await openBoard();
  else await openInterns();
}

// 實習護照的後台。讀走 RLS（別的 team 讀回來是空的，但他們本來就看不到這個分頁）。
async function openInterns(keepMsg) {
  S.busy = true; if (!keepMsg) S.msg = ""; render();
  try {
    S.intern = await D.loadInternAdmin();
    if (!S.internSel || !S.intern.terms.some(t => t.id === S.internSel))
      S.internSel = (S.intern.terms.find(t => t.active) || S.intern.terms[0] || {}).id || null;
    S.view = "interns"; S.busy = false;
  } catch (e) { S.busy = false; S.msg = T("err.internLoad") + D.says(e); S.view = "interns"; }
  render();
}

// 幹部護照的後台。讀走 RLS，門在資料庫那五支函式（2026-10-20-passport-admin.sql）。
async function openCadre(keepMsg) {
  S.busy = true; if (!keepMsg) S.msg = ""; render();
  try {
    S.pass = await D.loadPassportAdmin();
    S.view = "cadre"; S.busy = false;
  } catch (e) { S.busy = false; S.msg = T("err.cadreLoad") + D.says(e); S.view = "cadre"; }
  render();
}

// 蛇梯棋的棋盤：讀這一屆（側欄「實習護照」正在看的那一屆）的棋盤。draft 從資料庫的那份複製一份。
async function openBoard(keepMsg) {
  S.busy = true; if (!keepMsg) S.msg = ""; render();
  try {
    S.intern = await D.loadInternAdmin();
    if (!S.internSel || !S.intern.terms.some(t => t.id === S.internSel))
      S.internSel = (S.intern.terms.find(t => t.active) || S.intern.terms[0] || {}).id || null;
    if (S.internSel) {
      const { board, squares } = await D.loadBoard(S.internSel);
      S.board = board;
      const sq = {};
      for (const s of squares) sq[s.pos] = { kind: s.kind, task_id: s.task_id, goes_to: s.goes_to };
      S.boardDraft = { size: board ? board.size : 30, squares: sq, dirty: false };
    } else { S.board = null; S.boardDraft = null; }
    S.boardSel = null; S.view = "board"; S.busy = false;
  } catch (e) { S.busy = false; S.msg = T("err.boardLoad") + D.says(e); S.view = "board"; }
  render();
}

// 城市那一頁跟幹部護照讀同一份資料（loadPassportAdmin），只是開在另一個畫面。
async function openCities(keepMsg) {
  S.busy = true; if (!keepMsg) S.msg = ""; render();
  try {
    S.pass = await D.loadPassportAdmin();
    S.view = "cities"; S.busy = false;
  } catch (e) { S.busy = false; S.msg = T("err.citiesLoad") + D.says(e); S.view = "cities"; }
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
  // 月份那一排（2026-11-10）：只捲到那一個月，網址不變。原本是 href="#m9"，
  // 網址的 # 後面是分頁名，路由看不懂 m9 就退回實習護照（Paul 回報「按九月跑去實習護照」）。
  if (act === "jump") {
    e.preventDefault();
    const el = document.getElementById(b.dataset.to);
    if (el) el.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
    return;
  }
  if (act === "ask-cancel") { UI.cancelAsk(S, root()); return; }
  // ── 成員分頁（2026-10-23，第三次重整批 3）──
  if (act === "members-open") { await openMembers(b.dataset.ws, b.dataset.name); return; }
  if (act === "members-back") { S.view = (S.mp && S.mp.backView) || "interns"; S.msg = ""; render(); return; }
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

  // ── 蛇梯棋的棋盤（2026-10-22）────────────────────────────────────────
  if (act === "board-pick") {
    if (b.getAttribute("aria-disabled") === "true") return;
    S.boardSel = Number(b.dataset.pos); render();
    const el = document.getElementById("board-edit"); if (el) el.scrollIntoView({ behavior: "smooth", block: "nearest" });
    return;
  }
  if (act === "board-apply" || act === "board-clear") {
    const pos = Number(b.dataset.pos);
    const val = i => { const el = document.getElementById(i); return el ? el.value : ""; };
    const d = S.boardDraft || { size: 30, squares: {}, dirty: false };
    const sizeEl = document.getElementById("bd-size"); if (sizeEl && !sizeEl.disabled) d.size = Number(sizeEl.value) || d.size;
    if (act === "board-clear") { delete d.squares[pos]; }
    else {
      const s = { kind: val("bq-kind") || "plain", task_id: val("bq-task") || null, goes_to: val("bq-goes") ? Number(val("bq-goes")) : null };
      const bad = UI.squareProblem(pos, s, Number(d.size));
      if (bad) { S.msg = T(bad, { n: d.size }); render(); return; }
      if (s.kind === "plain") delete d.squares[pos]; else d.squares[pos] = s;
    }
    d.dirty = true; S.boardDraft = d; S.msg = ""; render();
    return;
  }
  if (act === "board-save") {
    const d = S.boardDraft; if (!d || !S.internSel) return;
    const sizeEl = document.getElementById("bd-size"); if (sizeEl && !sizeEl.disabled) d.size = Number(sizeEl.value) || d.size;
    // 格數縮小的話，超出的格子丟掉（存之前先講清楚比存失敗好）。
    for (const p of Object.keys(d.squares)) if (Number(p) > Number(d.size)) delete d.squares[p];
    for (const [p, s] of Object.entries(d.squares)) {
      const bad = UI.squareProblem(Number(p), s, Number(d.size));
      if (bad) { S.boardSel = Number(p); S.msg = T("bd.pick", { n: p }) + "：" + T(bad, { n: d.size }); render(); return; }
    }
    S.busy = true; S.msg = ""; render();
    try {
      await D.saveBoard(S.internSel, d.size, UI.squaresToList(d));
      S.msg = T("msg.boardSaved");
      await openBoard(true);
    } catch (err) { S.busy = false; S.msg = T("err.boardSave") + D.says(err); render(); }
    return;
  }
  if (act === "board-toggle") {
    const on = b.dataset.on === "1";
    if (on && S.boardDraft && S.boardDraft.dirty) { S.msg = T("err.boardUnsaved"); render(); return; }
    if (UI.needAsk(S, b, T(on ? "confirm.boardOn" : "confirm.boardOff"))) return;
    S.busy = true; S.msg = ""; render();
    try {
      await D.setBoardActive(S.internSel, on);
      S.msg = T(on ? "msg.boardOn" : "msg.boardOff");
      await openBoard(true);
    } catch (err) { S.busy = false; S.msg = T("err.boardToggle") + D.says(err); render(); }
    return;
  }

  // ── 幹部護照的後台（2026-10-20，批 2）────────────────────────────────
  // 每一個動作：按下去 busy、成功一句、失敗說錯在哪、會丟東西的先問一次。
  if (act === "cadre-back") { await openCadre(); return; }
  if (act === "cities-back") { await openCities(); return; }
  // 預覽：改 S 再 render，框就出現；捲到框那裡，不然在長頁面的下半按了會以為沒反應。
  if (act === "preview") {
    S.previewMonth = Number(b.dataset.month); render();
    const f = document.getElementById("passport-preview"); if (f) f.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }
  if (act === "ipreview") {
    S.internPreviewCat = b.dataset.cat || ""; render();
    const f = document.getElementById("passport-preview"); if (f) f.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }
  if (act === "preview-close") { S.previewMonth = null; S.internPreviewCat = null; render(); return; }
  if (act === "preview-reload") {
    const f = document.querySelector(".preview-frame"); if (f) f.src = f.src; return;
  }
  if (act === "act-new") {
    S.actEditing = null; S.actDraft = null; S.actMonth = Number(b.dataset.month); S.view = "act-edit"; S.msg = ""; render(); return;
  }
  if (act === "act-edit") {
    const a = S.pass.activities.find(x => x.id === id);
    if (!a) { S.msg = T("err.noTask"); render(); return; }
    S.actEditing = a; S.actDraft = null; S.actMonth = a.month; S.view = "act-edit"; S.msg = ""; render(); return;
  }
  // 2026-11-06 起這個分支只剩「加一格」（既有的格子改了就自動存，見 onAutosave）。
  if (act === "act-save") {
    const val = i => { const el = document.getElementById(i); return el ? el.value.trim() : ""; };
    const host = document.getElementById("ak-host");
    const a = { id: id || null, month: val("ak-month") || S.actMonth, category: val("ak-cat"),
                title_zh: val("ak-zh"), title_en: val("ak-en"), description: val("ak-desc"),
                needs_host: !!(host && host.checked), callback_to: val("ak-cb").toUpperCase() };
    S.actDraft = a;
    if (!a.title_zh || !a.title_en) { S.msg = T("err.titles"); render(); return; }
    S.busy = true; S.msg = ""; render();
    try {
      const made = await D.saveActivity(a);
      S.actDraft = null;
      S.msg = id ? T("msg.actEdited", { t: a.title_zh }) : T("msg.actAdded", { t: a.title_zh, id: made });
      await openCadre(true);
    } catch (err) { S.busy = false; S.msg = T("err.save") + D.says(err); render(); }
    return;
  }
  if (act === "act-off" || act === "act-on") {
    const on = act === "act-on";
    const a = S.pass.activities.find(x => x.id === id);
    if (!on && UI.needAsk(S, b, T("confirm.actOff", { t: a ? a.title_zh : id }))) return;
    S.busy = true; S.msg = ""; render();
    try {
      await D.setActivityActive(id, on);
      S.msg = T(on ? "msg.enabled" : "msg.disabled", { t: a ? a.title_zh : id });
      await openCadre(true);
    } catch (err) { S.busy = false; S.msg = T(on ? "err.enable" : "err.disable") + D.says(err); render(); }
    return;
  }
  if (act === "act-del") {
    const a = S.pass.activities.find(x => x.id === id);
    if (UI.needAsk(S, b, T("confirm.actDel", { t: a ? a.title_zh : id }))) return;
    S.busy = true; S.msg = ""; render();
    try {
      await D.deleteActivity(id);
      S.msg = T("msg.deletedT", { t: a ? a.title_zh : id });
      await openCadre(true);
    } catch (err) { S.busy = false; S.msg = T("err.delete") + D.says(err); render(); }
    return;
  }
  // 藏起來或打開一個月（2026-11-10）。藏要先問一次，打開不用問。
  if (act === "month-hide") {
    const hide = b.dataset.hide === "1";
    const label = UI.monthLabel(Number(b.dataset.month));
    if (hide && UI.needAsk(S, b, T("confirm.hideMonth", { m: label }))) return;
    S.busy = true; S.msg = ""; render();
    try {
      await D.setMonthHidden(b.dataset.month, hide);
      S.msg = T(hide ? "msg.monthHidden" : "msg.monthShown", { m: label });
      await openCadre(true);
    } catch (err) { S.busy = false; S.msg = T("err.save") + D.says(err); render(); }
    return;
  }
  if (act === "month-edit") {
    const m = S.pass.months.find(x => String(x.seq) === b.dataset.seq);
    if (!m) { S.msg = T("err.noMonth"); render(); return; }
    S.monthEditing = m; S.monthDraft = null; S.view = "month-edit"; S.msg = ""; render(); return;
  }
  // 2026-11-06 起月份頁沒有鈕了（改了就自動存，見 onAutosave）。這個分支留著給測試與鍵盤：有人用舊畫面按到也照存。
  if (act === "month-save") {
    const val = i => { const el = document.getElementById(i); return el ? el.value.trim() : ""; };
    const d = { ...(S.monthEditing || {}), theme_zh: val("mk-zh"), theme_en: val("mk-en") };
    S.monthDraft = d;
    S.busy = true; S.msg = ""; render();
    try {
      await D.saveMonthTheme(b.dataset.seq, d.theme_zh, d.theme_en);
      S.monthDraft = null;
      S.msg = T("msg.themeSaved", { m: UI.monthLabel(d.month) });
      await openCadre(true);
    } catch (err) { S.busy = false; S.msg = T("err.save") + D.says(err); render(); }
    return;
  }
  if (act === "dest-new")  { S.destEditing = null; S.destDraft = null; S.view = "dest-edit"; S.msg = ""; render(); return; }
  if (act === "dest-edit") {
    const d = S.pass.destinations.find(x => x.code === b.dataset.code);
    if (!d) { S.msg = T("err.noCity"); render(); return; }
    S.destEditing = d; S.destDraft = null; S.view = "dest-edit"; S.msg = ""; render(); return;
  }
  // 2026-11-06 起這個分支只剩「加一個城市」（既有的城市改名字就自動存，見 onAutosave）。
  if (act === "dest-save") {
    const val = i => { const el = document.getElementById(i); return el ? el.value.trim() : ""; };
    const d = { code: b.dataset.code || val("dk-code"), city: val("dk-city"), active: b.dataset.active !== "0" };
    S.destDraft = d;
    if (!d.code || !d.city) { S.msg = T("err.cityBoth"); render(); return; }
    S.busy = true; S.msg = ""; render();
    try {
      const made = await D.saveDestination(d.code, d.city, d.active);
      S.destDraft = null;
      S.msg = b.dataset.code ? T("msg.cityEdited", { c: d.city }) : T("msg.cityAdded", { c: d.city, code: made });
      await openCities(true);
    } catch (err) { S.busy = false; S.msg = T("err.save") + D.says(err); render(); }
    return;
  }
  if (act === "dest-off" || act === "dest-on") {
    const on = act === "dest-on";
    const d = S.pass.destinations.find(x => x.code === b.dataset.code);
    if (!d) { S.msg = T("err.noCity"); render(); return; }
    if (!on && UI.needAsk(S, b, T("confirm.cityOff", { c: d.city }))) return;
    S.busy = true; S.msg = ""; render();
    try {
      await D.saveDestination(d.code, d.city, on);
      S.msg = T(on ? "msg.enabled" : "msg.disabled", { t: d.city });
      await openCities(true);
    } catch (err) { S.busy = false; S.msg = T(on ? "err.enable" : "err.disable") + D.says(err); render(); }
    return;
  }

  // ── 實習護照的後台（2026-10-18）────────────────────────────────────
  // 每一個動作：按下去 busy（按鈕變「存檔中…」、其他按鈕關掉）、成功一句、失敗說錯在哪。
  if (act === "intern-back") { await openInterns(); return; }
  if (act === "intern-see")  { S.internSel = id; S.msg = T("msg.viewing", { id }); render(); return; }
  if (act === "intern-term-new")  { S.internTermEditing = null; S.internTermDraft = null; S.view = "intern-term"; S.msg = ""; render(); return; }
  if (act === "intern-term-edit") {
    S.internTermEditing = S.intern.terms.find(t => t.id === id) || null; S.internTermDraft = null;
    S.view = "intern-term"; S.msg = ""; render(); return;
  }
  // 2026-11-06 起這個分支只剩「開新的一屆」（既有的一屆改了就自動存，見 onAutosave）。
  if (act === "intern-term-save") {
    const val = i => { const el = document.getElementById(i); return el ? el.value.trim() : ""; };
    const t = { id: id || val("it-id"), title_zh: val("it-zh"), title_en: val("it-en"),
                starts_on: val("it-start"), ends_on: val("it-end") };
    S.internTermDraft = t;
    if (!t.id || !t.title_zh || !t.title_en || !t.starts_on || !t.ends_on) {
      S.msg = T("err.termFive"); render(); return;
    }
    S.busy = true; S.msg = ""; render();
    try {
      const made = await D.saveInternTerm(t);
      S.internSel = made; S.internTermDraft = null;
      S.msg = id ? T("msg.termEdited", { t: t.title_zh }) : T("msg.termAdded", { t: t.title_zh });
      await openInterns(true);
    } catch (err) { S.busy = false; S.msg = T("err.save") + D.says(err); render(); }
    return;
  }
  if (act === "intern-term-activate") {
    const t = S.intern.terms.find(x => x.id === id);
    if (UI.needAsk(S, b, T("confirm.activate", { t: t ? t.title_zh : id }))) return;
    S.busy = true; S.msg = ""; render();
    try {
      await D.activateInternTerm(id);
      S.internSel = id;
      S.msg = T("msg.activated", { t: t ? t.title_zh : id });
      await openInterns(true);
    } catch (err) { S.busy = false; S.msg = T("err.activate") + D.says(err); render(); }
    return;
  }
  if (act === "intern-task-new") {
    // 頁首那顆沒有 data-term，拿現在在看的那一屆。
    S.internTaskEditing = null; S.internTaskDraft = null; S.internTaskTerm = b.dataset.term || S.internSel; S.view = "intern-task"; S.msg = ""; render(); return;
  }
  if (act === "intern-task-edit") {
    const t = S.intern.tasks.find(x => x.id === id);
    if (!t) { S.msg = T("err.noTask"); render(); return; }
    S.internTaskEditing = t; S.internTaskDraft = null; S.internTaskTerm = t.term; S.view = "intern-task"; S.msg = ""; render(); return;
  }
  // 2026-11-06 起這個分支只剩「加一格」（既有的格子改了就自動存，見 onAutosave）。
  if (act === "intern-task-save") {
    const val = i => { const el = document.getElementById(i); return el ? el.value.trim() : ""; };
    const t = { id: id || val("ik-id"), term: b.dataset.term, seq: val("ik-seq"), category: val("ik-cat"),
                title_zh: val("ik-zh"), title_en: val("ik-en"), description: val("ik-desc") };
    S.internTaskDraft = t;
    if (!t.id || !t.title_zh || !t.title_en) { S.msg = T("err.taskThree"); render(); return; }
    S.busy = true; S.msg = ""; render();
    try {
      await D.saveInternTask(t);
      S.internSel = t.term; S.internTaskDraft = null;
      S.msg = id ? T("msg.taskEdited", { t: t.title_zh }) : T("msg.taskAdded", { t: t.title_zh });
      await openInterns(true);
    } catch (err) { S.busy = false; S.msg = T("err.save") + D.says(err); render(); }
    return;
  }
  if (act === "intern-task-off" || act === "intern-task-on") {
    const on = act === "intern-task-on";
    const t = S.intern.tasks.find(x => x.id === id);
    if (!on && UI.needAsk(S, b, T("confirm.taskOff", { t: t ? t.title_zh : id }))) return;
    S.busy = true; S.msg = ""; render();
    try {
      await D.setInternTaskActive(id, on);
      S.msg = T(on ? "msg.enabled" : "msg.disabled", { t: t ? t.title_zh : id });
      await openInterns(true);
    } catch (err) { S.busy = false; S.msg = T(on ? "err.enable" : "err.disable") + D.says(err); render(); }
    return;
  }
  if (act === "intern-task-del") {
    const t = S.intern.tasks.find(x => x.id === id);
    if (UI.needAsk(S, b, T("confirm.actDel", { t: t ? t.title_zh : id }))) return;
    S.busy = true; S.msg = ""; render();
    try {
      await D.deleteInternTask(id);
      S.msg = T("msg.deletedT", { t: t ? t.title_zh : id });
      await openInterns(true);
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
