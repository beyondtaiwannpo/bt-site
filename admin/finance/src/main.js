// 後台「財務」那一組的邏輯（2026-11-08）：總覽、收支、帳戶與類別、預算、匯出。設計在 docs/2026-11-08-財務設計.md。
//
// 狀態只有一個 S，畫面只從 S 產生。**不在事件處理裡直接改 DOM**，一律改 S 再 render()。
// 每一顆按鈕背後都是資料庫的一支函式，門在那裡（can_edit_finance）；這裡少畫一顆按鈕不是安全機制。
// 數字全部在瀏覽器算（UI.overview），資料庫的 fin_overview() 是同一條公式，smoke 驗它、node 驗這裡。
import * as AUTH from "../../../shared/auth.js";
import { navHTML } from "../../../shared/nav.js";
import * as D from "./data.js";
import * as UI from "./ui.js";
import { T, lang, setLang, pickLang, STORE_KEY } from "./strings.js";

const HERE = "/admin/finance/";

let S = {
  user: null, me: null, down: false, busy: false, msg: "",
  view: "overview",        // overview | tx | accounts | budget | export
  terms: [], accounts: [], categories: [], budgets: [], tx: [],
  term: null,              // 總覽與預算看哪一屆（預設這一屆）
  filter: { term: null, month: "", kind: "", account: "", category: "", q: "" },  // 收支與匯出的篩選；term 為 null 表示這一屆
  draft: null,             // 新的一筆（null 就沒開）
  accDraft: null, catDraft: null,
  open: null,              // 展開在改的那一筆
  voiding: null,           // 正在問原因的那一筆
  up: {},                  // { <筆的 id>: 上傳狀態字串 }
  loaded: false,
};

const root = () => document.getElementById("bt-root");
const canView = () => UI.canViewFin(S.me);
const canEdit = () => UI.canEditFin(S.me);
const today = () => new Date().toISOString().slice(0, 10);
const termSel = () => S.term || UI.currentTerm(S.terms);
const ctx = () => ({ terms: S.terms, accounts: S.accounts, categories: S.categories, budgets: S.budgets, term: termSel(), today: today(), open: S.open, voiding: S.voiding });
const filterNow = () => Object.assign({}, S.filter, { term: S.filter.term || (UI.currentTerm(S.terms) || {}).id || "all" });
const rowsNow = () => UI.sortTx(UI.filterTx(S.tx, filterNow()));
const findTx = id => S.tx.find(t => t.id === id);
const nameOf = x => x ? (lang() === "zh" ? (x.name_zh || x.name_en) : (x.name_en || x.name_zh)) || "" : "";

function render() {
  const el = root();
  if (!el) return;
  const nav = S.me ? navHTML({ current: "admin", role: S.me.role, name: S.me.name }) : "";
  if (S.down) { el.innerHTML = UI.shellHTML(nav, "", UI.downHTML(S.downErr)); return; }
  if (!S.user) { location.replace("../../app/?next=admin-finance"); return; }
  if (!S.me || S.me.role !== "cadre") { el.innerHTML = UI.shellHTML(nav, "", UI.notCadreHTML()); return; }
  if (!canView()) { el.innerHTML = UI.shellHTML(nav, UI.railHTML("finance", "", S.me), UI.noAccessHTML(S.me)); return; }
  let body;
  if (!S.loaded) body = UI.skeletonHTML();
  else {
    const c = ctx(), o = UI.overview({ accounts: S.accounts, categories: S.categories, transactions: S.tx, budgets: S.budgets, terms: S.terms, term: c.term, today: c.today });
    if (S.view === "tx") body = UI.txPageHTML(rowsNow(), c, filterNow(), S.me, S.msg, S.busy, S.draft, S.up);
    else if (S.view === "accounts") body = UI.accountsHTML(S.accounts, S.categories, o, S.me, S.msg, S.busy, S.accDraft, S.catDraft);
    else if (S.view === "budget") body = UI.budgetHTML(o, c, S.me, S.msg, S.busy);
    else if (S.view === "export") body = UI.exportHTML(filterNow(), c, rowsNow().length, S.msg);
    else body = UI.overviewHTML(o, c, S.me, S.msg);
  }
  el.innerHTML = UI.shellHTML(nav, UI.railHTML("finance", S.view, S.me), body);
  UI.afterRender(S, el);
}

// 側欄與頂欄先畫（後台速度，2026-11-06 那一套）：知道我是誰就先把外殼畫出來，內容那一格放骨架，資料回來 render() 整個換掉。
function paintShell(tab) {
  const el = root();
  if (!el || !S.me) return;
  const nav = navHTML({ current: "admin", role: S.me.role, name: S.me.name });
  el.innerHTML = UI.shellHTML(nav, UI.railHTML("finance", tab || "", S.me), UI.skeletonHTML());
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
    if (!S.me || S.me.role !== "cadre" || !canView()) { render(); return; }
    const want = location.hash.slice(1) || new URLSearchParams(location.search).get("tab") || "overview";
    S.view = VIEWS.includes(want) ? want : "overview";
    paintShell(S.view);
    UI.bindAutosave(root(), onAutosave);
    await load();
  } catch (e) {
    if (AUTH.sessionGone(e)) { await AUTH.signOut(); location.replace("../../app/?next=admin-finance"); return; }
    console.error(HERE + " 載入失敗：", e);
    if (!retried) return retryBoot();
    S.downErr = String(e && e.message || e); S.down = true; render();
  }
}
const VIEWS = ["overview", "tx", "accounts", "budget", "export"];

// 兩個查詢一起發：fin_bootstrap()（屆、帳戶、類別、預算）與整張 fin_transactions。
async function load(keepMsg) {
  if (!keepMsg) S.msg = "";
  try {
    const [b, tx] = await Promise.all([D.loadBootstrap(), D.loadTx()]);
    S.terms = (b && b.terms) || []; S.accounts = (b && b.accounts) || []; S.categories = (b && b.categories) || []; S.budgets = (b && b.budgets) || [];
    S.tx = tx || [];
    if (S.term && !S.terms.some(t => t.id === S.term.id)) S.term = null;
    S.loaded = true;
  } catch (e) { S.msg = T("err.load") + D.says(e); S.loaded = true; }
  S.busy = false;
  render();
}
async function run(label, fn) {
  S.busy = true; S.msg = ""; render();
  try { return await fn(); }
  catch (err) { S.busy = false; S.msg = T(label) + D.says(err); render(); return undefined; }
}
function openTab(key) {
  key = String(key || "").split("=")[0];
  S.view = VIEWS.includes(key) ? key : "overview";
  S.open = null; S.voiding = null; S.ask = null;
  render();
}

// 表單讀成資料庫要的形狀。金額與匯率是數字；台幣由資料庫算；轉帳沒有類別、收入支出沒有轉入帳戶。
function readTxForm(box) {
  const v = UI.formValues(box);
  const kind = v.kind || "expense", currency = (v.currency || "TWD").toUpperCase();
  return {
    happened_on: v.happened_on || "", kind, amount: v.amount === "" ? null : Number(v.amount), currency,
    fx_rate: currency === "TWD" || v.fx_rate === "" || v.fx_rate == null ? null : Number(v.fx_rate),
    account_id: v.account_id || null, to_account_id: kind === "transfer" ? (v.to_account_id || null) : null,
    category_id: kind === "transfer" ? null : (v.category_id || null),
    counterparty: v.counterparty || "", note: v.note || "",
  };
}
// 送出去之前先在畫面上擋一次，訊息講人話（資料庫也會擋，那是第二道）。
function txProblem(p) {
  if (!p.happened_on) return T("err.needDate");
  if (!(p.amount > 0)) return T("err.needAmount");
  if (p.currency !== "TWD" && !(p.fx_rate > 0)) return T("err.needRate");
  if (!p.account_id) return T("err.needAccount");
  if (p.kind === "transfer" && (!p.to_account_id || p.to_account_id === p.account_id)) return T("err.needTo");
  if (p.kind !== "transfer" && !p.category_id) return T("err.needCategory");
  return "";
}
const describe = p => `${T("kind." + p.kind)} ${UI.fmtMoney(UI.toTwd(p.amount, p.currency, p.fx_rate))}${p.counterparty ? "・" + p.counterparty : ""}`;

// ── 自動儲存：既有的一筆、帳戶、類別、預算。成功只改 S **不 render()**（人可能還在打字），失敗不清欄位。 ──
const dirty = UI.dirtyTracker();
function liveBox(box) {
  const el = root() ? root().querySelector(`[data-autosave="${box.dataset.autosave}"]` + (box.dataset.id ? `[data-id="${box.dataset.id}"]` : "")) : null;
  return el || box;
}
async function onAutosave(act, box) {
  const id = box.dataset.id;
  const fail = text => { UI.autosaveState(liveBox(box), "failed"); UI.toast(text); };
  if (act === "tx-save") {
    const t = findTx(id); if (!t) return;
    UI.syncTxShape(box, ctx());   // 種類或幣別換了，先把該出現的格子打開
    const p = readTxForm(box);
    const key = "tx:" + id, serial = JSON.stringify(p);
    if (!dirty.changed(key, serial)) return;
    const bad = txProblem(p); if (bad) { fail(bad); return; }
    UI.autosaveState(box, "saving");
    try {
      await D.updateTx(id, p);
      dirty.mark(key, serial);
      await refreshTx();
      UI.autosaveState(liveBox(box), "saved"); UI.toast(T("msg.txSaved"));
      // 換了種類或幣別要顯示或藏掉幾格，這一種重畫一次（欄位的值已經存進去了，不會掉）。
      if (p.kind !== t.kind || p.currency !== (t.currency || "TWD")) render();
    } catch (e) { fail(T("err.save") + D.says(e)); }
    return;
  }
  if (act === "acc-save") {
    const v = UI.formValues(box);
    const p = { id, name_zh: v.name_zh || "", name_en: v.name_en || "", kind: v.kind || "bank", opening_balance: v.opening_balance === "" ? 0 : Number(v.opening_balance), opening_on: v.opening_on || null };
    const key = "acc:" + id, serial = JSON.stringify(p);
    if (!dirty.changed(key, serial)) return;
    if (!p.name_zh && !p.name_en) { fail(T("err.needName")); return; }
    UI.autosaveState(box, "saving");
    try { await D.upsertAccount(p); dirty.mark(key, serial); await refreshBoot(); UI.autosaveState(liveBox(box), "saved"); UI.toast(T("msg.accSaved")); }
    catch (e) { fail(T("err.save") + D.says(e)); }
    return;
  }
  if (act === "cat-save") {
    const v = UI.formValues(box);
    const p = { id, name_zh: v.name_zh || "", name_en: v.name_en || "" };
    const key = "cat:" + id, serial = JSON.stringify(p);
    if (!dirty.changed(key, serial)) return;
    if (!p.name_zh && !p.name_en) { fail(T("err.needName")); return; }
    UI.autosaveState(box, "saving");
    try { await D.upsertCategory(p); dirty.mark(key, serial); await refreshBoot(); UI.autosaveState(liveBox(box), "saved"); UI.toast(T("msg.catSaved")); }
    catch (e) { fail(T("err.save") + D.says(e)); }
    return;
  }
  if (act === "budget-save") {
    const v = UI.formValues(box);
    const amount = v.amount_twd === "" ? 0 : Number(v.amount_twd);
    const key = "bu:" + box.dataset.term + ":" + id, serial = String(amount);
    if (!dirty.changed(key, serial)) return;
    UI.autosaveState(box, "saving");
    try { await D.setBudget(box.dataset.term, id, amount); dirty.mark(key, serial); await refreshBoot(); UI.autosaveState(liveBox(box), "saved"); UI.toast(T("msg.budgetSaved")); render(); }
    catch (e) { fail(T("err.save") + D.says(e)); }
  }
}
async function refreshTx() { S.tx = await D.loadTx(); }
async function refreshBoot() { const b = await D.loadBootstrap(); S.terms = b.terms || []; S.accounts = b.accounts || []; S.categories = b.categories || []; S.budgets = b.budgets || []; }

// 新的一筆那張表單：種類或幣別一換就要顯示或藏掉幾格，所以把現在填的值收進 S.draft 再重畫。
function readDraft() { const box = root() && root().querySelector('[data-txform="new"]'); return box ? Object.assign({}, S.draft, UI.formValues(box)) : S.draft; }

document.addEventListener("click", async e => {
  const b = e.target.closest("[data-act]");
  if (!b) return;
  const act = b.dataset.act;
  if (act === "retry") { location.reload(); return; }
  if (act === "ask-cancel") { UI.cancelAsk(S, root()); return; }
  if (act === "lang") { switchLang(b.dataset.lang); return; }
  if (act === "signout") { await AUTH.signOut(); location.replace("../../app/"); return; }
  if (act === "tab") { e.preventDefault(); S.msg = ""; history.pushState(null, "", "#" + b.dataset.t); openTab(b.dataset.t); return; }
  if (act === "go-accounts") { history.pushState(null, "", "#accounts"); openTab("accounts"); if (!S.accounts.length) { S.accDraft = { kind: "bank", opening_on: today() }; render(); } return; }
  if (act === "go-budget") { history.pushState(null, "", "#budget"); openTab("budget"); return; }

  // ── 收支 ──
  if (act === "tx-new") { S.draft = { happened_on: today(), kind: "expense", currency: "TWD", amount: "", fx_rate: "", counterparty: "", note: "" }; S.open = null; render(); return; }
  if (act === "tx-cancel") { S.draft = null; render(); return; }
  if (act === "tx-add") {
    const box = root().querySelector('[data-txform="new"]'); if (!box) return;
    const p = readTxForm(box);
    S.draft = Object.assign({}, S.draft, UI.formValues(box));
    const bad = txProblem(p); if (bad) { S.msg = T("err.add") + bad; render(); return; }
    const id = await run("err.add", () => D.addTx(p));
    if (id === undefined) return;
    S.draft = null; S.msg = T("msg.txAdded", { what: describe(p) });
    await load(true); return;
  }
  if (act === "tx-edit") { S.open = b.dataset.id; S.voiding = null; S.draft = null; render(); return; }
  if (act === "tx-close") { S.open = null; render(); return; }
  if (act === "tx-void") { S.voiding = b.dataset.id; S.open = null; render(); const r = document.getElementById("void-reason"); if (r) r.focus(); return; }
  if (act === "tx-void-cancel") { S.voiding = null; render(); return; }
  if (act === "tx-void-go") {
    const reason = String((document.getElementById("void-reason") || {}).value || "").trim();
    if (!reason) { S.msg = T("err.void") + T("err.needReason"); render(); const r = document.getElementById("void-reason"); if (r) r.focus(); return; }
    const ok = await run("err.void", () => D.voidTx(b.dataset.id, reason));
    if (ok === undefined) return;
    S.voiding = null; S.msg = T("msg.txVoided");
    await load(true); return;
  }
  if (act === "receipt-view") {
    // 先開一個空分頁再填網址：等 await 回來才 window.open 會被瀏覽器當成彈出視窗擋掉。
    const w = window.open("", "_blank");
    try { const url = await D.receiptUrl(b.dataset.path); if (w) w.location = url; else location.href = url; }
    catch (err) { if (w) w.close(); S.msg = T("err.receipt") + D.says(err); render(); }
    return;
  }
  if (act === "receipt-remove") {
    const t = findTx(b.dataset.id); if (!t) return;
    if (UI.needAsk(S, b, T("tx.receiptGone") + "？")) return;
    const path = t.receipt_path;
    const ok = await run("err.save", () => D.updateTx(t.id, { receipt_path: null }));
    if (ok === undefined) return;
    await D.removeReceiptFile(path);
    S.msg = T("msg.receiptGone"); await load(true); return;
  }

  // ── 帳戶與類別 ──
  if (act === "acc-new") { S.accDraft = { kind: "bank", opening_on: today(), name_zh: "", name_en: "", opening_balance: "" }; render(); return; }
  if (act === "acc-cancel") { S.accDraft = null; render(); return; }
  if (act === "acc-add") {
    const box = root().querySelector('[data-accform="new"]'); if (!box) return;
    const v = UI.formValues(box); S.accDraft = Object.assign({}, S.accDraft, v);
    const p = { name_zh: v.name_zh || "", name_en: v.name_en || "", kind: v.kind || "bank", opening_balance: v.opening_balance === "" ? 0 : Number(v.opening_balance), opening_on: v.opening_on || today() };
    if (!p.name_zh && !p.name_en) { S.msg = T("err.add") + T("err.needName"); render(); return; }
    const id = await run("err.add", () => D.upsertAccount(p));
    if (id === undefined) return;
    S.accDraft = null; S.msg = T("msg.accAdded", { name: p.name_zh || p.name_en }); await load(true); return;
  }
  if (act === "acc-archive" || act === "acc-unarchive") {
    const on = act === "acc-archive";
    if (on && UI.needAsk(S, b, T("acc.archiveAsk"))) return;
    const ok = await run("err.save", () => D.upsertAccount({ id: b.dataset.id, archived: on }));
    if (ok === undefined) return;
    S.msg = T(on ? "msg.accArchived" : "msg.accRestored", { name: b.dataset.name }); await load(true); return;
  }
  if (act === "cat-new") { S.catDraft = { kind: "expense", name_zh: "", name_en: "" }; render(); return; }
  if (act === "cat-cancel") { S.catDraft = null; render(); return; }
  if (act === "cat-add") {
    const box = root().querySelector('[data-catform="new"]'); if (!box) return;
    const v = UI.formValues(box); S.catDraft = Object.assign({}, S.catDraft, v);
    const p = { kind: v.kind || "expense", name_zh: v.name_zh || "", name_en: v.name_en || "" };
    if (!p.name_zh && !p.name_en) { S.msg = T("err.add") + T("err.needName"); render(); return; }
    const id = await run("err.add", () => D.upsertCategory(p));
    if (id === undefined) return;
    S.catDraft = null; S.msg = T("msg.catAdded", { name: p.name_zh || p.name_en }); await load(true); return;
  }
  if (act === "cat-archive" || act === "cat-unarchive") {
    const on = act === "cat-archive";
    if (on && UI.needAsk(S, b, T("cat.archiveAsk"))) return;
    const ok = await run("err.save", () => D.upsertCategory({ id: b.dataset.id, archived: on }));
    if (ok === undefined) return;
    S.msg = T(on ? "msg.catArchived" : "msg.catRestored", { name: b.dataset.name }); await load(true); return;
  }

  // ── 匯出：現在的篩選，瀏覽器端組 CSV，Blob 下載。 ──
  if (act === "csv-download") {
    const rows = rowsNow();
    const blob = new Blob([UI.csvOf(rows, { accounts: S.accounts, categories: S.categories })], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = UI.csvFilename(filterNow());
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    S.msg = T("msg.csv", { n: rows.length }); render(); return;
  }
});

document.addEventListener("change", async e => {
  const el = e.target;
  if (!el || !el.dataset) return;
  const act = el.dataset.act;
  if (act === "f-term") { S.filter.term = el.value; S.filter.month = ""; render(); return; }
  if (act === "f-month") { S.filter.month = el.value; render(); return; }
  if (act === "f-kind") { S.filter.kind = el.value; S.filter.category = ""; render(); return; }
  if (act === "f-account") { S.filter.account = el.value; render(); return; }
  if (act === "f-category") { S.filter.category = el.value; render(); return; }
  if (act === "ov-term") { S.term = S.terms.find(t => t.id === el.value) || null; render(); return; }
  // 新的一筆：種類或幣別換了，顯示或藏掉轉入帳戶、類別、匯率那幾格。
  if (el.closest && el.closest('[data-txform="new"]') && (el.name === "kind" || el.name === "currency")) { S.draft = readDraft(); render(); return; }
  // 收據：選了檔就傳。先擋格式與大小，傳好把路徑寫進那一筆。
  if (act === "receipt-file") {
    const id = el.dataset.id, file = el.files && el.files[0]; if (!file) return;
    const bad = UI.receiptOk(file); if (bad) { S.msg = T("err.upload") + bad; render(); return; }
    S.up[id] = T("tx.uploading"); render();
    try {
      const path = await D.uploadReceipt(UI.receiptPath(id, file.name), file);
      await D.updateTx(id, { receipt_path: path });
      delete S.up[id]; S.msg = T("msg.receiptUp"); await load(true);
    } catch (err) { delete S.up[id]; S.msg = T("err.upload") + D.says(err); render(); }
  }
});

// 找對象或備註：改 S 再 render()，然後把游標放回搜尋框，不然每打一個字就失焦。
document.addEventListener("input", e => {
  const el = e.target;
  if (!el || el.id !== "f-q") return;
  S.filter.q = el.value; render();
  const again = document.getElementById("f-q");
  if (again) { again.focus(); const n = again.value.length; try { again.setSelectionRange(n, n); } catch (x) { /* search 型的欄位有的瀏覽器不給 */ } }
});
// 作廢原因那一格按 Enter 就是按確定。
document.addEventListener("keydown", e => {
  if (e.key !== "Enter" || !e.target || e.target.id !== "void-reason") return;
  e.preventDefault(); const go = document.querySelector('[data-act="tx-void-go"]'); if (go && !go.disabled) go.click();
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
window.addEventListener("popstate", () => { if (S.me) { S.msg = ""; openTab(location.hash.slice(1)); } });
