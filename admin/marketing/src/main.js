// 後台「Marketing」那一組的邏輯（2026-11-26）。批 1 只有一頁：Instagram 連線狀態。
// 計畫在 ~/Anson/outputs/bt-website/docs/2026-10-29-marketing-dashboard-plan/plan.md，之後的批次在這個資料夾加分頁。
//
// 狀態只有一個 S，畫面只從 S 產生。**不在事件處理裡直接改 DOM**，一律改 S 再 render()。
// 每一顆按鈕背後都是資料庫的一支函式，門在那裡（ig_can_view / ig_can_manage）；這裡少畫一顆按鈕不是安全機制。
import * as AUTH from "../../../shared/auth.js";
import { navHTML } from "../../../shared/nav.js";
import * as D from "./data.js";
import * as UI from "./ui.js";
import { T, lang, setLang, pickLang, STORE_KEY } from "./strings.js";

const HERE = "/admin/marketing/";
const VIEWS = ["ig"];

let S = {
  user: null, me: null, down: false, busy: false, msg: "",
  view: "ig",
  ig: null,          // ig_status() 回的那一包
  loaded: false,
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
  const body = !S.loaded ? UI.skeletonHTML() : UI.igPageHTML(S.ig, S.msg, S.busy);
  el.innerHTML = UI.shellHTML(nav, UI.railHTML("marketing", S.view, S.me), body);
  UI.afterRender(S, el);
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
    const want = location.hash.slice(1) || "ig";
    S.view = VIEWS.includes(want) ? want : "ig";
    paintShell(S.view);
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
  try { S.ig = await D.loadIgStatus(); }
  catch (e) { S.msg = T("err.load") + D.says(e); }
  S.loaded = true; S.busy = false;
  render();
}
function openTab(key) {
  key = String(key || "").split("=")[0];
  S.view = VIEWS.includes(key) ? key : "ig";
  S.ask = null;
  render();
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
  // 再檢查一次：資料庫會先看要不要換通行證，再問 Instagram 一次。
  if (act === "ig-check") {
    if (S.busy) return;
    S.busy = true; S.msg = ""; render();
    try { S.ig = await D.igCheckNow(); S.busy = false; S.msg = T("msg.checked"); }
    catch (err) { S.busy = false; S.msg = T("err.check") + D.says(err); }
    render();
  }
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
