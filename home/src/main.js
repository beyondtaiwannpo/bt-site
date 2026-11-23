// 幹部首頁與行事曆（2026-10-28，Paul：「我按了會到，主辦人什麼都沒收到；沒有一頁看得到我接下來的會」）。
//
// 一個資料夾兩個畫面：
//   /home/            首頁：一張「等你處理」的清單（照日期排，2026-11-14 跟後台的「待辦」合併）、接下來的會、我的護照。
//   /home/#calendar   行事曆：月與週，像 Google 日曆。點一場打開，回覆、看議程與會議紀錄。
//   /home/#team=<team> 一個 team 的頁（2026-11-23）：側欄「我的工作區」點進來，那個 team 的專案、活動、申請表、資源。只看不改。
// 信裡的連結是 /home/?meeting=<id>：那一場放在首頁最上面。
//
// 回覆只改自己那一列（set_rsvp）。必到的會按「不能到」要寫一句理由，理由只有本人與排會的人看得到（RLS）。
import * as AUTH from "../../shared/auth.js";
import { navHTML } from "../../shared/nav.js";
// 側欄（2026-11-14）：首頁跟後台畫同一條側欄（「我的」「BT」「組織」三段），樣式在 shared/rail.css。
import * as RAIL from "../../shared/rail.js";
import * as D from "./data.js";
import * as UI from "./ui.js";
import { T, lang, setLang, pickLang, STORE_KEY } from "./strings.js";

const root = () => document.getElementById("bt-root");
const S = {
  ready: false, down: false, role: null, me: null, name: "", tz: "Asia/Taipei", senior: false, ws: {}, board: "member", team: "", w: null,
  data: null, items: [], busy: false, reasonFor: null, changing: null, open: null, teams: {}, wsInfo: {},
  linked: null, linkedMsg: "",
  cal: { view: "month", at: null, mode: "mine" },
};
const LINK_KEY = "bt-home-meeting";
const store = () => { try { return window.localStorage; } catch (e) { return null; } };
const view = () => (location.hash.replace(/\?.*$/, "") === "#calendar" ? "calendar" : teamOf() ? "team" : "home");
// #team=Curriculum%20Team → "Curriculum Team"。不是這個形狀就回空字串。
function teamOf() {
  const m = location.hash.match(/^#team=([^?&]+)/);
  if (!m) return "";
  try { return decodeURIComponent(m[1]).trim(); } catch (e) { return ""; }
}
// team 的頁要的資料：第一次進那個 team 才讀，讀過的留著（S.teams），換回來不用再等。
async function openTeam() {
  const team = teamOf();
  if (!team || S.role !== "cadre" || S.teams[team]) return;
  try { S.teams[team] = await D.loadTeam(team); } catch (e) { S.teams[team] = { projects: null, events: null, forms: null, resources: null, people: null }; }
  if (teamOf() === team) render();
}

function ctx() {
  return { me: S.me, tz: S.tz, now: new Date(), name: S.name, senior: S.senior, ws: S.ws, board: S.board, w: S.w, people: S.data ? S.data.people : [], forms: S.data ? S.data.forms : [], pairs: S.pairs || [], feedback: S.feedback || [],
    busy: S.busy, reasonFor: S.reasonFor, changing: S.changing, linked: S.linked, linkedMsg: S.linkedMsg,
    canSchedule: S.senior || Object.entries(S.ws).some(([k, v]) => k.startsWith("res:") && ["edit", "manage"].includes(v)) };
}

function render() {
  const el = root(); if (!el) return;
  el.setAttribute("aria-busy", S.ready ? "false" : "true");
  if (S.down) { el.innerHTML = UI.downHTML(); return; }
  if (!S.ready) { el.innerHTML = `<div class="empty loading">${T("loading")}</div>`; return; }
  const v = view();
  const nav = navHTML({ current: v === "calendar" ? "calendar" : "home", role: S.role, name: S.name, lang: lang() });
  if (S.role !== "cadre") { el.innerHTML = nav + UI.notCadreHTML(); return; }
  const c = ctx();
  const rme = railMe(), team = teamOf();
  const body = v === "calendar" ? UI.calendarHTML(S.items, c, S.cal) : v === "team" ? UI.teamHTML(team, S.teams[team], rme, S.tz) : UI.homeHTML(S.items, c);
  const open = S.open ? S.items.find(i => i.id === S.open) : null;
  // 側欄：team 的頁不是 ITEMS 裡的一頁，用 "team:<team>" 告訴側欄現在在哪個 team（shared/rail.js teamRowsHTML）。
  const tab = v === "calendar" ? "calendar" : v === "team" ? "team:" + team : "home";
  RAIL.railBefore(el);
  el.innerHTML = RAIL.shellHTML(nav, RAIL.railHTML("home", tab, rme, {}, lang()), body, RAIL.areaTabsHTML("home", tab, rme, lang())) + (open ? UI.detailHTML(open, c) : "");
  RAIL.railAfter(el);
  if (v === "calendar" && S.cal.view === "week") {
    const w = document.getElementById("wscroll");
    if (w && !w.dataset.scrolled) { w.scrollTop = 7.5 * 44; w.dataset.scrolled = "1"; }
  }
  const ta = S.reasonFor && document.getElementById("reason-" + S.reasonFor);
  if (ta) ta.focus({ preventScroll: true });
}

// 側欄要的「我是誰」：跟後台 admin/src/data.js 的 loadMe() 同一個形狀。
function railMe() { return { id: S.me, role: S.role, board: S.board, team: S.team, name: S.name, ws: S.ws, wsInfo: S.wsInfo || {}, senior: S.senior }; }
// Marketing 貼文核可的人：senior 或 Marketing 是「管」（跟資料庫的 mkt_can_approve() 同一條，2026-12-25）。
const approver = () => RAIL.canManageWs(railMe(), "res:Marketing Team");
async function loadWaiting() {
  try { S.w = await D.loadWaiting(railMe(), approver()); } catch (e) { S.w = null; }
}

async function reload() {
  S.data = await D.loadHome();
  S.items = UI.itemsOf(S.data.meetings, S.data.events, S.me);
}

async function rsvp(id, status, note) {
  S.busy = true; render();
  try {
    await D.setRsvp(id, status, note);
    S.reasonFor = null; S.changing = null;
    await reload();
    UI.toast(T(status === "accepted" ? "msg.yes" : "msg.no"));
  } catch (e) {
    UI.toast(T("err.rsvp") + D.says(e, lang() === "zh"), true);
  }
  S.busy = false; render();
}

function onClick(e) {
  const el = e.target.closest("[data-act]");
  if (!el) return;
  const act = el.dataset.act, id = el.dataset.id;
  // 點彈窗裡面不算點背景。
  if (act === "close-detail" && el.classList.contains("scrim") && e.target.closest("[data-stop]")) return;
  if (act === "retry") { location.reload(); return; }
  if (act === "signout") { AUTH.signOut().finally(() => location.replace("../app/")); return; }
  // 側欄：同一個資料夾的分頁（首頁、行事曆）換 #，不重新載入；語言切換跟後台同一招（存起來、網址帶 ?lang=，名字照新的語言重拿）。
  if (act === "tab") {
    e.preventDefault();
    const t = el.dataset.t;
    // 首頁不帶 #（網址乾淨），行事曆是 #calendar。上一頁回得去（pushState 換 #，瀏覽器會發 hashchange）。
    if (t === "home") { if (location.hash) { history.pushState(null, "", location.pathname + location.search); S.open = null; render(); } }
    else if (location.hash.slice(1) !== t) location.hash = t;
    return;
  }
  if (act === "lang") {
    setLang(el.dataset.lang); document.documentElement.lang = lang() === "zh" ? "zh-Hant" : "en";
    try { const st = store(); if (st) st.setItem(STORE_KEY, lang()); } catch (e2) { /* 無痕視窗 */ }
    const u = new URL(location.href); u.searchParams.set("lang", lang()); history.replaceState(null, "", u.pathname + u.search + u.hash);
    S.name = (lang() === "zh" ? (S.row.name_zh || S.row.name_en) : (S.row.name_en || S.row.name_zh)) || "";
    render(); return;
  }
  if (act === "open") { S.open = id; S.reasonFor = null; render(); return; }
  if (act === "close-detail") { S.open = null; S.reasonFor = null; render(); return; }
  if (act === "rsvp") {
    const it = S.items.find(i => i.id === id); if (!it) return;
    if (el.dataset.st === "declined" && it.required) { S.reasonFor = id; render(); return; }
    rsvp(id, el.dataset.st); return;
  }
  if (act === "rsvp-send") {
    const ta = document.getElementById("reason-" + id), note = ta ? ta.value.trim() : "";
    if (!note) { UI.toast(T("err.needReason"), true); if (ta) ta.focus(); return; }
    rsvp(id, "declined", note); return;
  }
  if (act === "rsvp-cancel") { S.reasonFor = null; render(); return; }
  if (act === "rsvp-change") { S.changing = id; render(); return; }
  if (act === "cal-view") { S.cal.view = el.dataset.v; render(); return; }
  if (act === "cal-mode") { S.cal.mode = el.dataset.v; render(); return; }
  if (act === "cal-today") { S.cal.at = UI.dayKey(new Date(), S.tz); render(); return; }
  if (act === "cal-move") {
    const n = Number(el.dataset.n) || 0;
    S.cal.at = S.cal.view === "month" ? UI.shiftMonth(S.cal.at, n) : UI.addDaysKey(S.cal.at, 7 * n);
    render(); return;
  }
  if (act === "cal-day") { S.cal.at = el.dataset.k; S.cal.view = "week"; render(); return; }
}

// 版本提示：跟其他登入後頁面一樣，線上的 version.json 跟這一頁載進來的不一樣就在左下角掛一條「重新整理」。
function versionDiffers(loaded, live) { return !!loaded && !!live && String(loaded) !== String(live); }
async function checkVersion(rootUrl) {
  try {
    const meta = document.querySelector('meta[name="bt-version"]');
    const r = await fetch(`${rootUrl}version.json`, { cache: "no-store" });
    if (!r.ok) return;
    const j = await r.json();
    if (!versionDiffers(meta ? meta.content : "", j && j.v)) return;
    const d = document.createElement("div");
    d.className = "verbar"; d.setAttribute("role", "status");
    d.innerHTML = `<span></span><button type="button" class="btn"></button>`;
    d.querySelector("span").textContent = T("ver.newer");
    const b = d.querySelector("button"); b.textContent = T("ver.reload"); b.addEventListener("click", () => location.reload());
    document.body.appendChild(d);
  } catch (e) { /* 讀不到就不提 */ }
}

async function boot() {
  checkVersion("../");
  setLang(pickLang(location.search, (() => { try { return store() && store().getItem(STORE_KEY); } catch (e) { return null; } })()));
  document.documentElement.lang = lang() === "zh" ? "zh-Hant" : "en";
  const qMeeting = new URLSearchParams(location.search).get("meeting");
  try {
    const who = await AUTH.currentUserDetailed();
    if (who.offline) { S.down = true; render(); return; }
    if (!who.user) {
      // 沒登入：信裡那一場先記著，登入回來再打開（next 只認頁面，不帶參數）。
      if (qMeeting) try { sessionStorage.setItem(LINK_KEY, qMeeting); } catch (e) { /* 隱私模式 */ }
      location.replace("../app/?next=home"); return;
    }
    S.me = who.user.id;
    const [w] = await Promise.all([AUTH.whoAmI(S.me)]);
    const row = w.row || {};
    S.role = row.role || null; S.tz = row.tz || "Asia/Taipei"; S.ws = w.ws || {}; S.wsInfo = w.info || {};
    S.name = (lang() === "zh" ? (row.name_zh || row.name_en) : (row.name_en || row.name_zh)) || "";
    S.senior = ["president", "senior_adviser"].includes(row.board_role);
    S.board = row.board_role || "member"; S.team = row.team || ""; S.row = row;
    if (S.role === "cadre") {
      await Promise.all([reload(), loadWaiting()]);
      // 我帶的 mentee（2026-12-07）：rc_my_pairs() 只回本人的配對；函式還不在（遷移檔沒跑）就當沒有。
      try { [S.pairs, S.feedback] = await Promise.all([D.myPairs(), D.myFeedback()]); } catch (e) { S.pairs = S.pairs || []; S.feedback = S.feedback || []; }
      let mid = qMeeting;
      if (!mid) try { mid = sessionStorage.getItem(LINK_KEY); sessionStorage.removeItem(LINK_KEY); } catch (e) { /* 隱私模式 */ }
      if (mid) { if (S.items.some(i => i.id === mid)) S.linked = mid; else S.linkedMsg = T("home.gone"); }
    }
    S.cal.at = UI.dayKey(new Date(), S.tz);
    S.ready = true; render();
    openTeam();
    if (S.linked) { const n = document.getElementById("m-" + S.linked); if (n) n.scrollIntoView({ block: "start" }); }
    // Google 日曆（2026-11-23）：畫好之後在背景拉一次大家在 Google 的回覆，有人改了就重畫。
    if (S.role === "cadre") D.gcalRefresh().then(async n => { if (n > 0) { await reload(); render(); } }).catch(() => {});
  } catch (e) {
    if (AUTH.sessionGone && AUTH.sessionGone(e)) { await AUTH.signOut().catch(() => {}); location.replace("../app/?next=home"); return; }
    S.down = true; S.ready = true; render();
    UI.toast(T("err.load") + D.says(e, lang() === "zh"), true);
  }
}

document.addEventListener("click", onClick);
document.addEventListener("keydown", e => { if (e.key === "Escape" && S.open) { S.open = null; S.reasonFor = null; render(); } });
window.addEventListener("hashchange", () => { S.open = null; render(); openTeam(); });
boot();
