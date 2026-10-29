// 幹部首頁與行事曆（2026-10-28，Paul：「我按了會到，主辦人什麼都沒收到；沒有一頁看得到我接下來的會」）。
//
// 一個資料夾兩個畫面：
//   /home/            首頁：等你回覆的會、接下來的會與活動、「我要…」的捷徑。
//   /home/#calendar   行事曆：月與週，像 Google 日曆。點一場打開，回覆、看議程與會議紀錄。
// 信裡的連結是 /home/?meeting=<id>：那一場放在首頁最上面。
//
// 回覆只改自己那一列（set_rsvp）。必到的會按「不能到」要寫一句理由，理由只有本人與排會的人看得到（RLS）。
import * as AUTH from "../../shared/auth.js";
import { navHTML } from "../../shared/nav.js";
import * as D from "./data.js";
import * as UI from "./ui.js";
import { T, lang, setLang, pickLang, STORE_KEY } from "./strings.js";

const root = () => document.getElementById("bt-root");
const S = {
  ready: false, down: false, role: null, me: null, name: "", tz: "Asia/Taipei", senior: false, ws: {},
  data: null, items: [], busy: false, reasonFor: null, changing: null, open: null,
  linked: null, linkedMsg: "",
  cal: { view: "month", at: null, mode: "mine" },
};
const LINK_KEY = "bt-home-meeting";
const store = () => { try { return window.localStorage; } catch (e) { return null; } };
const view = () => (location.hash.replace(/\?.*$/, "") === "#calendar" ? "calendar" : "home");

function ctx() {
  return { me: S.me, tz: S.tz, now: new Date(), name: S.name, senior: S.senior, ws: S.ws, people: S.data ? S.data.people : [],
    busy: S.busy, reasonFor: S.reasonFor, changing: S.changing, linked: S.linked, linkedMsg: S.linkedMsg,
    canSchedule: S.senior || Object.entries(S.ws).some(([k, v]) => k.startsWith("res:") && v === "manage") };
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
  const body = v === "calendar" ? UI.calendarHTML(S.items, c, S.cal) : UI.homeHTML(S.items, c);
  const open = S.open ? S.items.find(i => i.id === S.open) : null;
  el.innerHTML = nav + body + (open ? UI.detailHTML(open, c) : "");
  if (v === "calendar" && S.cal.view === "week") {
    const w = document.getElementById("wscroll");
    if (w && !w.dataset.scrolled) { w.scrollTop = 7.5 * 44; w.dataset.scrolled = "1"; }
  }
  const ta = S.reasonFor && document.getElementById("reason-" + S.reasonFor);
  if (ta) ta.focus({ preventScroll: true });
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
    S.role = row.role || null; S.tz = row.tz || "Asia/Taipei"; S.ws = w.ws || {};
    S.name = (lang() === "zh" ? (row.name_zh || row.name_en) : (row.name_en || row.name_zh)) || "";
    S.senior = ["president", "senior_adviser"].includes(row.board_role);
    if (S.role === "cadre") {
      await reload();
      let mid = qMeeting;
      if (!mid) try { mid = sessionStorage.getItem(LINK_KEY); sessionStorage.removeItem(LINK_KEY); } catch (e) { /* 隱私模式 */ }
      if (mid) { if (S.items.some(i => i.id === mid)) S.linked = mid; else S.linkedMsg = T("home.gone"); }
    }
    S.cal.at = UI.dayKey(new Date(), S.tz);
    S.ready = true; render();
    if (S.linked) { const n = document.getElementById("m-" + S.linked); if (n) n.scrollIntoView({ block: "start" }); }
  } catch (e) {
    if (AUTH.sessionGone && AUTH.sessionGone(e)) { await AUTH.signOut().catch(() => {}); location.replace("../app/?next=home"); return; }
    S.down = true; S.ready = true; render();
    UI.toast(T("err.load") + D.says(e, lang() === "zh"), true);
  }
}

document.addEventListener("click", onClick);
document.addEventListener("keydown", e => { if (e.key === "Escape" && S.open) { S.open = null; S.reasonFor = null; render(); } });
window.addEventListener("hashchange", () => { S.open = null; render(); });
boot();
