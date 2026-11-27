// 後台「搜尋」的邏輯（2026-11-26）：一個框找遍會議紀錄、回饋表、內部表單與活動檢討。
//
// 網址：#q=<字>&src=<哪幾種>&kind=<回饋表的種類>&event=<活動>&from=<日期>&to=<日期>（見 ui.js 的 parseQuery）。
// 按搜尋會做兩件事：
//   1. search_all：認字的找法，馬上回來，底下的清單先畫。不用任何外面的服務。
//   2. search_ask：懂意思的那一次（Vault 有 Claude 的金鑰才有），每 1.5 秒問一次 search_ask_status，
//      做完了最上面畫整理、清單換成它那一份（多了別的寫法與意思接近的）。
// 狀態只有一個 S，畫面只從 S 產生。每一筆讀不讀得到是資料庫的門決定的，這裡少畫一筆不是安全機制。
import * as AUTH from "../../../shared/auth.js";
import { navHTML } from "../../../shared/nav.js";
import * as D from "./data.js";
import * as UI from "./ui.js";
import { T, lang, setLang, pickLang, STORE_KEY } from "./strings.js";

const HERE = "/admin/search/";
const POLL_MS = 1500, POLL_MAX = 100;

let S = {
  user: null, me: null, down: false, busy: false, msg: "", loaded: false,
  opts: null,          // search_options()
  q: "", f: { sources: [], kind: "", event: "", from: "", to: "" },
  res: null,           // search_all()
  ask: null,           // search_ask_status()
  askErr: "",
  aiSel: null,         // Co-President 正在勾的「哪幾種給 AI 讀」（還沒存）
};
let runSeq = 0;        // 每一次搜尋一個號碼：使用者又搜了一次，舊的那一次回來就丟掉

const root = () => document.getElementById("bt-root");

function render() {
  const el = root();
  if (!el) return;
  const nav = S.me ? navHTML({ current: "admin", role: S.me.role, name: S.me.name }) : "";
  if (S.down) { el.innerHTML = UI.shellHTML(nav, "", UI.downHTML(S.downErr)); return; }
  if (!S.user) { location.replace("../../app/?next=admin-search"); return; }
  if (!S.me || S.me.role !== "cadre") { el.innerHTML = UI.shellHTML(nav, "", UI.notCadreHTML()); return; }
  // 重畫會把搜尋框換掉：游標在框裡的話，記住打到哪，畫完放回去。
  const box = document.activeElement && document.activeElement.name === "q" ? document.activeElement : null;
  const typed = box ? { v: box.value, at: box.selectionStart } : null;
  UI.railBefore(el);
  el.innerHTML = UI.shellHTML(nav, UI.railHTML("search", "search", S.me), S.loaded ? UI.pageHTML(S) : UI.skeletonHTML());
  UI.railAfter(el);
  UI.afterRender(S, el);
  if (typed) { const again = el.querySelector('input[name="q"]'); if (again) { again.value = typed.v; again.focus(); try { again.setSelectionRange(typed.at, typed.at); } catch (x) { /* search 型的欄位有的瀏覽器不給 */ } } }
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
    render();
    UI.checkVersion("../../");
    await loadOptions();
    S.loaded = true;
    render();
    // 沒有 pg_cron 的時候，背景那一條（把可以給 AI 讀的切成小段送去 Voyage）靠每次開這一頁跑一次。不等它。
    D.tick();
    if (S.q) await runSearch();
    else focusBox();
  } catch (e) {
    if (AUTH.sessionGone(e)) { await AUTH.signOut(); location.replace("../../app/?next=admin-search"); return; }
    console.error(HERE + " 載入失敗：", e);
    if (!retried) return retryBoot();
    S.downErr = String(e && e.message || e); S.down = true; render();
  }
}
async function loadOptions() {
  try { S.opts = await D.loadOptions(); }
  catch (e) { S.opts = { events: [], claude: false, voyage: false, ai_sources: [] }; S.msg = T("err.load") + D.says(e); }
}
function parseHash() { const p = UI.parseQuery(location.hash); S.q = p.q; S.f = p.f; }
function focusBox() { const el = root() && root().querySelector('input[name="q"]'); if (el && !("ontouchstart" in window)) el.focus(); }
// 網址跟著搜尋的字與篩選走：可以貼給別人，上一頁回得去。
function pushHash() {
  const h = UI.queryHash(S.q, S.f);
  if (("#" + h) !== (location.hash || "#") && !(h === "" && !location.hash)) history.pushState(null, "", h ? "#" + h : location.pathname + location.search);
}

async function runSearch() {
  const seq = ++runSeq;
  S.msg = ""; S.ask = null; S.askErr = "";
  if (!S.q.trim()) { S.res = null; render(); return; }
  S.busy = true; S.res = null; render();
  const f = UI.filtersOf(S.f);
  try {
    const r = await D.searchAll(S.q, f);
    if (seq !== runSeq) return;
    S.res = r;
  } catch (e) {
    if (seq !== runSeq) return;
    S.res = { terms: [], results: [] }; S.msg = T("err.search") + D.says(e);
  }
  S.busy = false; render();
  // 懂意思的那一次：有 Claude 的金鑰、認字那一次沒出錯、字夠長才跑。
  if (!S.opts || !S.opts.claude || S.msg || (S.res.terms || []).join("").length < 2) return;
  if (S.opts.limit && (S.opts.used_today || 0) >= S.opts.limit) { S.askErr = T("ai.limit"); render(); return; }
  let id;
  try { id = await D.ask(S.q, f); }
  catch (e) { if (seq !== runSeq) return; S.askErr = T("err.ask") + D.says(e); render(); return; }
  if (seq !== runSeq) return;
  S.opts.used_today = (S.opts.used_today || 0) + 1;
  S.ask = { id, status: "retrieving" }; render();
  for (let i = 0; i < POLL_MAX; i++) {
    await new Promise(r => setTimeout(r, POLL_MS));
    if (seq !== runSeq) return;
    try { S.ask = await D.askStatus(id); }
    catch (e) { if (seq !== runSeq) return; S.ask = null; S.askErr = T("err.ask") + D.says(e); render(); return; }
    if (seq !== runSeq) return;
    render();
    if (S.ask.status === "done" || S.ask.status === "failed") return;
  }
  S.ask = Object.assign({}, S.ask, { status: "failed" }); render();
}
// 改了篩選：有字就馬上再找一次，沒有字只記在網址上。
function refilter() { pushHash(); if (S.q.trim()) runSearch(); else render(); }

document.addEventListener("submit", e => {
  const form = e.target.closest && e.target.closest('[data-form="search"]');
  if (!form) return;
  e.preventDefault();
  S.q = String(new FormData(form).get("q") || "").trim().slice(0, 200);
  pushHash(); runSearch();
});
document.addEventListener("change", e => {
  const t = e.target; if (!t || !t.dataset) return;
  const act = t.dataset.act;
  if (act === "kind") { S.f.kind = UI.KINDS.includes(t.value) ? t.value : ""; refilter(); return; }
  if (act === "event") { S.f.event = t.value || ""; refilter(); return; }
  if (act === "from" || act === "to") { S.f[act] = /^\d{4}-\d{2}-\d{2}$/.test(t.value) ? t.value : ""; refilter(); return; }
  if (act === "ai-src") {
    const all = [...root().querySelectorAll('input[data-act="ai-src"]')];
    S.aiSel = all.filter(x => x.checked).map(x => x.value);
    render(); return;
  }
});
document.addEventListener("click", async e => {
  const b = e.target.closest("[data-act]");
  if (!b) return;
  const act = b.dataset.act;
  if (act === "retry") { location.reload(); return; }
  if (act === "ask-cancel") { UI.cancelAsk(S, root()); return; }
  if (act === "lang") { switchLang(b.dataset.lang); return; }
  if (act === "signout") { await AUTH.signOut(); location.replace("../../app/"); return; }
  if (act === "src") {
    const v = b.dataset.v, cur = new Set(S.f.sources || []);
    if (cur.has(v)) cur.delete(v); else cur.add(v);
    S.f.sources = UI.SOURCES.filter(s => cur.has(s));
    refilter(); return;
  }
  if (act === "clear") { S.f = { sources: [], kind: "", event: "", from: "", to: "" }; refilter(); return; }
  if (act === "cite") {
    const el = document.getElementById("sx-hit-" + b.dataset.i);
    if (el) { el.scrollIntoView({ block: "center", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }); el.focus({ preventScroll: true }); el.classList.add("on"); setTimeout(() => el.classList.remove("on"), 1600); }
    return;
  }
  if (act === "ai-save") {
    const sel = S.aiSel || (S.opts && S.opts.ai_sources) || [];
    S.busy = true; render();
    try { await D.setAi(sel); S.aiSel = null; await loadOptions(); UI.toast(T("set.saved")); }
    catch (err) { S.msg = T("err.save") + D.says(err); }
    S.busy = false; render(); return;
  }
});

// 語言（2026-10-19 中英切換，做法見 docs/2026-10-19-後台中英切換.md）。
function readStored() { try { return localStorage.getItem(STORE_KEY); } catch (e) { return null; } }
function applyLang(l) {
  setLang(l);
  document.documentElement.lang = lang() === "zh" ? "zh-Hant" : "en";
  document.title = T("title") + " · " + T("pg.title");
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
window.addEventListener("popstate", () => { if (S.me && S.loaded) { parseHash(); runSearch(); } });
