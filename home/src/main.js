// 幹部首頁與行事曆（2026-10-28，Paul：「我按了會到，主辦人什麼都沒收到；沒有一頁看得到我接下來的會」）。
//
// 一個資料夾兩個畫面：
//   /home/            首頁：一張「等你處理」的清單（照日期排，2026-11-14 跟後台的「待辦」合併）、接下來的會、我的護照。
//   /home/#calendar   行事曆：月、週、日，像 Google 日曆。點一場打開，回覆、看議程與會議紀錄。
//                     點一個日期打開那一天（2026-11-26）：每半小時有幾個人有空（以前時間看板的團隊看板搬來這裡），
//                     能排會的人點一格排一場會（schedule.js），排好 Google 那邊用 BT 主帳號開會、寄邀請。
//                     2026-11-27：能排會的人在月曆點一個日期、在週曆拖一段時間，排會那一塊直接跳出來，不用先到「日」。
//                     護照後台的「排會」連結帶 ?at=<時間>&title=<標題>#calendar：直接打開那一天、那個時間的排會。
//   /home/#team=<team> 一個 team 的頁（2026-11-23）：側欄「我的工作區」點進來，那個 team 的專案、活動、申請表、資源。只看不改。
// 信裡的連結是 /home/?meeting=<id>：那一場放在首頁最上面。
//
// 回覆只改自己那一列（set_rsvp）。必到的會按「不能到」要寫一句理由，理由只有本人與排會的人看得到（RLS）。
import * as AUTH from "../../shared/auth.js";
import { navHTML } from "../../shared/nav.js";
// 側欄（2026-11-14）：首頁跟後台畫同一條側欄（2026-11-27 起「我的」「我的工作區」「整個 BT」三段），樣式在 shared/rail.css。
import * as RAIL from "../../shared/rail.js";
import * as D from "./data.js";
import * as UI from "./ui.js";
import * as DAY from "./day.js";
import * as SCH from "./schedule.js";
import * as FREE from "./free.js";
import { T, lang, setLang, pickLang, STORE_KEY } from "./strings.js";

const root = () => document.getElementById("bt-root");
const S = {
  ready: false, down: false, role: null, me: null, name: "", tz: "Asia/Taipei", senior: false, ws: {}, board: "member", team: "", w: null,
  data: null, items: [], busy: false, reasonFor: null, changing: null, open: null, teams: {}, wsInfo: {},
  linked: null, linkedMsg: "",
  cal: { view: "month", at: null, mode: "mine", team: "" },
  // 某一天要的「誰有空」（2026-11-26）：undefined 還沒讀、null 讀取中、{ failed } 讀不到、其他是 loadAvail() 回的。
  // sch 是排會那一塊（null 是沒打開）；pick 是從連結帶進來、等資料讀好才打開的那一格。
  avail: undefined, sch: null, pick: null, day: null,
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

// 某一天的人數：所有人算一次，team 篩選只是從裡面拿掉不在那個 team 的人（排會那一塊要看所有人）。
function dayData() {
  const a = S.avail;
  if (!a) return null;
  if (a.failed) return { failed: true };
  const all = FREE.dayFree(a.members, a.slots, a.weekSlots, a.weekMarks, S.cal.at, S.tz);
  const shownIds = new Set(SCH.inTeam(a.members, S.cal.team).map(m => m.id));
  const free = new Map([...all.free].map(([k, ids]) => [k, ids.filter(id => shownIds.has(id))]));
  const noTz = a.members.filter(m => !m.tz && shownIds.has(m.id)).map(m => m.name || T("common.noName"));
  return { rows: all.rows, free, allFree: all.free, members: SCH.inTeam(a.members, S.cal.team), all: a.members, noTz };
}
function ensureAvail() {
  if (S.avail !== undefined || S.role !== "cadre") return;
  S.avail = null;
  D.loadAvail().then(a => { S.avail = a; }).catch(() => { S.avail = { failed: true }; }).then(() => { preTick(); render(); });
}
// 排會那一塊要的那一天：每半小時誰有空、名單、誰填過時間。跟「日」的 dayData() 分開，因為排會可以從月曆、週曆打開，日期也改得了。
function schData(key) {
  const rows = FREE.dayRows(key, S.tz), a = S.avail;
  if (!a) return { key, rows, free: new Map(), members: null, filled: null };
  if (a.failed) return { key, rows, free: new Map(), members: [], filled: null, failed: true };
  const r = FREE.dayFree(a.members, a.slots, a.weekSlots, a.weekMarks, key, S.tz);
  return { key, rows: r.rows, free: r.free, members: a.members, filled: FREE.filledIds(a.members, a.slots, a.weekMarks) };
}
const scopes = () => SCH.scopesFor(S.senior, S.ws, SCH.teamsOf(S.avail && S.avail.members ? S.avail.members : []));
// 打開排會。範圍先選「日」那一排 team 篩選的那個 team（排得了的話）。
// pre：時間是點出來或拖出來的（「日」的一格、週曆拖的一段、護照後台的連結），整段時間都有空的人先勾好；
//   從月曆點日期時間還沒選，誰都不先勾。名單還在讀的話，讀好再勾（preTick）。
function openSch(key, min, minutes, opt) {
  const o = opt || {};
  const sc = scopes(); if (!sc.length) return;
  S.sch = { key, min, minutes: Math.max(30, Math.min(minutes || 60, 1440 - min)), scope: sc.includes(S.cal.team) ? S.cal.team : sc[0], required: "1",
    title: o.title || "", agenda: "", message: "", doc: "", ticked: [], q: "", msg: "", pre: !!o.pre };
  preTick();
}
function preTick() {
  const d = S.sch; if (!d || !d.pre || !S.avail || S.avail.failed) return;
  d.pre = false;
  const sd = schData(d.key);
  // 在「日」那一頁有選一個 team 的話，只先勾那個 team 的人（其他人照樣勾得到）。
  const shown = new Set((S.cal.view === "day" ? SCH.inTeam(S.avail.members, S.cal.team) : S.avail.members).map(m => m.id));
  d.ticked = SCH.preTicked(sd.free, d.min, d.minutes).filter(id => shown.has(id));
}
function openPick() {
  if (!S.pick || !ctx().canSchedule) return;
  const p = S.pick; S.pick = null;
  openSch(S.cal.at, p.min, 60, { title: p.title, pre: true });
}
// 月曆點一個日期：今天的話從下一個半點開始，之後的日子早上九點，一小時。
function defaultMin(key) {
  if (key !== UI.dayKey(new Date(), S.tz)) return 9 * 60;
  return Math.ceil((UI.minuteOfDay(new Date(), S.tz) + 1) / 30) * 30;
}

function render() {
  const el = root(); if (!el) return;
  // 重畫會換掉整個畫面：日那一格捲到哪、排會那一塊捲到哪、游標在哪一格，畫完放回去（不然點一下就跳回頂端）。
  const keep = { grid: S.cal.view === "day" ? scrollOf("wscroll") : null, modal: scrollOf("sch-modal"), focus: document.activeElement && document.activeElement.id };
  el.setAttribute("aria-busy", S.ready ? "false" : "true");
  if (S.down) { el.innerHTML = UI.downHTML(); return; }
  if (!S.ready) { el.innerHTML = `<div class="empty loading">${T("loading")}</div>`; return; }
  const v = view();
  const nav = navHTML({ current: v === "calendar" ? "calendar" : "home", role: S.role, name: S.name, lang: lang(), board: S.board });
  if (S.role !== "cadre") { el.innerHTML = nav + UI.notCadreHTML(); return; }
  const c = ctx();
  const rme = railMe(), team = teamOf();
  // 能排會的人一進行事曆就先讀大家有空的時間，點日期跳出排會的時候名單已經在了。
  if (v === "calendar" && c.canSchedule) ensureAvail();
  if (v === "calendar" && S.cal.view === "day") { S.day = dayData(); S.cal.dayBody = DAY.dayBodyHTML(S.items, c, S.cal, S.day); }
  const body = v === "calendar" ? UI.calendarHTML(S.items, c, S.cal) : v === "team" ? UI.teamHTML(team, S.teams[team], rme, S.tz) : UI.homeHTML(S.items, c);
  const open = S.open ? S.items.find(i => i.id === S.open) : null;
  // 側欄：team 的頁不是 ITEMS 裡的一頁，用 "team:<team>" 告訴側欄現在在哪個 team（shared/rail.js teamRowsHTML）。
  const tab = v === "calendar" ? "calendar" : v === "team" ? "team:" + team : "home";
  RAIL.railBefore(el);
  const sch = v === "calendar" && S.sch
    ? SCH.scheduleHTML(S.sch, Object.assign(schData(S.sch.key), { scopes: scopes(), now: c.now, today: UI.dayKey(c.now, S.tz) }), S.busy) : "";
  el.innerHTML = RAIL.shellHTML(nav, RAIL.railHTML("home", tab, rme, {}, lang()), body, RAIL.areaTabsHTML("home", tab, rme, lang())) + (open ? UI.detailHTML(open, c) : "") + sch;
  RAIL.railAfter(el);
  if (v === "calendar" && S.cal.view === "week") {
    const w = document.getElementById("wscroll");
    if (w && !w.dataset.scrolled) { w.scrollTop = 7.5 * 44; w.dataset.scrolled = "1"; }
  }
  if (v === "calendar" && S.cal.view === "day") {
    const w = document.getElementById("wscroll");
    // 第一次打開那一天：捲到第一個有人有空的時刻（沒有就早上八點），跟以前的看板一樣，不從一片空的凌晨開始。
    if (w) w.scrollTop = keep.grid != null && S.scrollAt === S.cal.at ? keep.grid : Math.max(0, (firstFree(S.day) / 60) * DAY.HOUR_PX - 22);
    S.scrollAt = S.cal.at;
  }
  const m = document.getElementById("sch-modal"); if (m && keep.modal != null) m.scrollTop = keep.modal;
  if (keep.focus) { const f = document.getElementById(keep.focus); if (f && f !== document.activeElement && !f.disabled) f.focus({ preventScroll: true }); }
  const ta = S.reasonFor && document.getElementById("reason-" + S.reasonFor);
  if (ta) ta.focus({ preventScroll: true });
}

function scrollOf(id) { const n = document.getElementById(id); return n ? n.scrollTop : null; }
function firstFree(d) {
  if (d && d.free) { const ms = [...d.free].filter(([, ids]) => ids.length).map(([k]) => k); if (ms.length) return Math.min(...ms); }
  return 8 * 60;
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
  if ((act === "close-detail" || act === "sch-close") && el.classList.contains("scrim") && e.target.closest("[data-stop]")) return;
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
  if (act === "cal-view") { S.cal.view = el.dataset.v; S.sch = null; if (S.cal.view === "day") ensureAvail(); render(); return; }
  if (act === "cal-mode") { S.cal.mode = el.dataset.v; render(); return; }
  if (act === "cal-today") { S.cal.at = UI.dayKey(new Date(), S.tz); render(); return; }
  if (act === "cal-move") {
    const n = Number(el.dataset.n) || 0;
    S.cal.at = S.cal.view === "month" ? UI.shiftMonth(S.cal.at, n) : UI.addDaysKey(S.cal.at, (S.cal.view === "day" ? 1 : 7) * n);
    S.sch = null;
    render(); return;
  }
  // 點一個日期：打開那一天（2026-11-26 以前是跳到那一週）。週曆上方的日期與月曆的「還有 n 個」照舊是這一個。
  if (act === "cal-day") { S.cal.at = el.dataset.k; S.cal.view = "day"; S.sch = null; ensureAvail(); render(); return; }
  // 月曆點一個日期（2026-11-27）：能排會的人、還沒過去的日子，直接跳出排會；其他照舊打開那一天。
  if (act === "cal-new") {
    const k = el.dataset.k, today = UI.dayKey(new Date(), S.tz), m = defaultMin(k);
    if (ctx().canSchedule && k >= today && m < 1440) { openSch(k, m, 60); render(); const f = document.getElementById("sch-title"); if (f) f.focus(); return; }
    S.cal.at = k; S.cal.view = "day"; S.sch = null; ensureAvail(); render(); return;
  }
  // 排會那一塊裡「看這一天每半小時誰有空」：關掉排會，打開那一天。
  if (act === "sch-day") { if (S.busy || !S.sch) return; S.cal.at = S.sch.key; S.cal.view = "day"; S.sch = null; ensureAvail(); render(); return; }
  if (act === "day-team") { S.cal.team = el.dataset.v || ""; render(); return; }
  if (act === "day-pick") { if (!ctx().canSchedule) return; openSch(S.cal.at, Number(el.dataset.m), 60, { pre: true }); render(); return; }
  if (act === "sch-close") { if (S.busy) return; S.sch = null; render(); return; }
  if (act === "sch-all" || act === "sch-none") {
    if (!S.sch) return;
    const shown = S.avail && S.avail.members ? S.avail.members.filter(m => SCH.matches(m, S.sch.q)).map(m => m.id) : [];
    S.sch.ticked = act === "sch-all" ? [...new Set(S.sch.ticked.concat(shown))] : [];
    render(); return;
  }
  if (act === "sch-send") { sendSch(); return; }
}

// 排會那一塊的欄位：打字的存進 S.sch 不重畫（游標不會跳）；日期、開始、結束換了要重畫（誰有空的標會變）。
// 改開始時間：長度不變，結束跟著動（跟 Google 日曆一樣）；改結束時間：長度跟著變。
function onSchInput(e) {
  if (!S.sch) return;
  const t = e.target;
  if (t.name === "sch-member") {
    const on = new Set(S.sch.ticked); if (t.checked) on.add(t.value); else on.delete(t.value);
    S.sch.ticked = [...on]; schCount(); return;
  }
  const k = t.dataset && t.dataset.sch; if (!k) return;
  if (k === "end" || k === "min" || k === "key") {
    if (e.type !== "change") return;
    const d = S.sch;
    if (k === "end") d.minutes = Math.max(30, Number(t.value) - d.min);
    if (k === "min") { d.min = Number(t.value); d.minutes = Math.max(30, Math.min(d.minutes, 1440 - d.min)); }
    if (k === "key") { if (!/^\d{4}-\d{2}-\d{2}$/.test(t.value)) return; d.key = t.value; }
    d.msg = ""; render(); return;
  }
  S.sch[k] = t.value;
  if (k === "q") {
    let any = false;
    for (const box of document.querySelectorAll('input[name="sch-member"]')) {
      const m = S.avail && S.avail.members && S.avail.members.find(x => x.id === box.value), ok = !!m && SCH.matches(m, t.value);
      box.closest("label").hidden = !ok; any = any || ok;
    }
    const nb = document.getElementById("sch-nobody"); if (nb) nb.hidden = any;
    return;
  }
  if (e.type === "change" && k === "scope") { S.sch.msg = ""; render(); }
}
function schCount() {
  const n = S.sch ? S.sch.ticked.length : 0;
  const lab = document.getElementById("sch-who-n"); if (lab) lab.textContent = T("sch.who", { n });
  const b = document.getElementById("sch-send"); if (b && !S.busy) { b.textContent = T("sch.send", { n }); b.disabled = !n; }
}
async function sendSch() {
  const d = S.sch; if (!d || S.busy) return;
  if (!(d.title || "").trim()) { d.msg = T("sch.needTitle"); render(); const f = document.getElementById("sch-title"); if (f) f.focus(); return; }
  if (!d.ticked.length) { d.msg = T("sch.needPeople"); render(); return; }
  const row = FREE.dayRows(d.key, S.tz).find(r => r.min === Number(d.min));
  if (!row) return;
  if (row.at.getTime() < Date.now()) { d.msg = T("sch.pastPick"); render(); return; }
  const start = row.at, end = new Date(start.getTime() + Number(d.minutes) * 60000);
  S.busy = true; d.msg = ""; render();
  try {
    await D.scheduleMeeting({ scope: d.scope, title: d.title.trim(), starts: start.toISOString(), ends: end.toISOString(), agenda: (d.agenda || "").trim(),
      message: (d.message || "").trim(), doc: (d.doc || "").trim() || null, attendees: d.ticked, required: d.required !== "0" });
    const n = d.ticked.length;
    S.sch = null;
    await reload();
    S.busy = false; render();
    UI.toast(T("sch.sent", { n }));
  } catch (err) {
    S.busy = false;
    if (S.sch) S.sch.msg = T("err.sch") + D.says(err, lang() === "zh");
    render();
  }
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
    // 護照後台「排會」那條連結（以前連到時間看板）：?at=<時間>&title=<標題>#calendar，打開那一天、那個時間的排會。
    const qp = new URLSearchParams(location.search), at = new Date(qp.get("at") || "");
    if (S.role === "cadre" && view() === "calendar" && !isNaN(at)) {
      S.cal.at = UI.dayKey(at, S.tz); S.cal.view = "day";
      S.pick = { min: Math.floor(UI.minuteOfDay(at, S.tz) / 30) * 30, title: (qp.get("title") || "").trim().slice(0, 120) };
      // 用過就從網址拿掉，不然排完會、重新整理一次，排會那一塊又跳出來。
      qp.delete("at"); qp.delete("title");
      try { history.replaceState(null, "", location.pathname + (qp.toString() ? "?" + qp : "") + location.hash); } catch {}
    }
    if (S.cal.view === "day") ensureAvail();
    openPick();
    // 側欄「新增」→「排一場會」（2026-11-27）：/home/?schedule=1#calendar，打開行事曆、排會那一塊直接跳出來（今天，太晚了就明天早上九點）。
    if (qp.get("schedule") && S.role === "cadre" && ctx().canSchedule) {
      let k = UI.dayKey(new Date(), S.tz), m = defaultMin(k);
      if (m >= 1440) { k = UI.addDaysKey(k, 1); m = 9 * 60; }
      if (view() !== "calendar") history.replaceState(null, "", location.pathname + location.search + "#calendar");
      openSch(k, m, 60);
      qp.delete("schedule");
      try { history.replaceState(null, "", location.pathname + (qp.toString() ? "?" + qp : "") + "#calendar"); } catch {}
    }
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

// 週曆拖一段時間排會（2026-11-27，Paul：「drag from Wednesday, January 13, 12 to 2… just like how Google Calendar work」）。
// 滑鼠：按下、拖、放開，拖的那一段畫一塊半透明的框（直接動 DOM，不重畫），放開就打開排會，那一段時間帶好。點一下沒拖是一小時。
// 手機：手指拖是捲動畫面，所以只認點一下（一小時）；捲動的時候瀏覽器會送 pointercancel，不會誤開。
// 一格半小時，一小時 44px（跟 ui.js 的週曆同一個數字）。過去的時間打不開，跳一句提示。
let drag = null;
const WEEK_H = 44;
function minAt(col, y) { const r = col.getBoundingClientRect(); return Math.max(0, Math.min(1410, Math.floor((y - r.top) / WEEK_H * 2) * 30)); }
function paintDrag() {
  if (!drag) return;
  const s = Math.min(drag.a, drag.b), e = Math.max(drag.a, drag.b) + 30;
  if (!drag.box) { drag.box = document.createElement("div"); drag.box.className = "dragsel"; drag.box.setAttribute("aria-hidden", "true"); drag.col.appendChild(drag.box); }
  drag.box.style.top = (s / 60 * WEEK_H) + "px"; drag.box.style.height = ((e - s) / 60 * WEEK_H - 2) + "px";
  drag.box.textContent = UI.hhmm(s) + " – " + UI.hhmm(e);
}
function endDrag() { if (drag && drag.box) drag.box.remove(); drag = null; }
document.addEventListener("pointerdown", e => {
  if (e.button !== 0 || view() !== "calendar" || S.cal.view !== "week" || S.sch || S.open || !ctx().canSchedule) return;
  const col = e.target.closest(".wgrid .wcol.pick[data-k]");
  if (!col || e.target.closest(".slot")) return;
  const m = minAt(col, e.clientY);
  drag = { col, k: col.dataset.k, a: m, b: m, moved: false, touch: e.pointerType === "touch" };
  if (!drag.touch) { e.preventDefault(); try { col.setPointerCapture(e.pointerId); } catch (x) { /* 舊瀏覽器 */ } paintDrag(); }
});
document.addEventListener("pointermove", e => {
  if (!drag || drag.touch) return;
  const m = minAt(drag.col, e.clientY);
  if (m !== drag.b) { drag.b = m; drag.moved = true; paintDrag(); }
});
document.addEventListener("pointerup", () => {
  if (!drag) return;
  const d = drag; endDrag();
  const s = Math.min(d.a, d.b), minutes = d.moved || d.a !== d.b ? Math.max(d.a, d.b) + 30 - s : 60;
  if (FREE.instantOf(d.k, s, S.tz).getTime() < Date.now()) { UI.toast(T("sch.pastPick"), true); return; }
  openSch(d.k, s, minutes, { pre: true }); render();
  const f = document.getElementById("sch-title"); if (f) f.focus({ preventScroll: true });
});
document.addEventListener("pointercancel", endDrag);

document.addEventListener("click", onClick);
document.addEventListener("input", onSchInput);
document.addEventListener("change", onSchInput);
document.addEventListener("keydown", e => {
  if (e.key !== "Escape") return;
  if (S.open) { S.open = null; S.reasonFor = null; render(); }
  else if (S.sch && !S.busy) { S.sch = null; render(); }
});
window.addEventListener("hashchange", () => { S.open = null; S.sch = null; render(); openTeam(); });
boot();
