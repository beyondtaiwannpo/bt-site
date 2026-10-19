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
};

const root = () => document.getElementById("bt-root");
const isPres = () => !!S.me && S.me.board === "president";
// Internship team 的幹部與 Co-President（跟資料庫的 is_internship_team() 同一條規則）。
// team 可能是逗號字串（一個人在好幾個 team），所以用 includes。
// **這只是畫面。真正的門在資料庫那五支函式的第一句。**
const internStaff = () => !!S.me && S.me.role === "cadre" &&
  (S.me.board === "president" || String(S.me.team || "").includes("Internship Team"));

function render() {
  const el = root();
  if (!el) return;
  const nav = S.me ? navHTML({ current: "admin", role: S.me.role, name: S.me.name }) : "";

  if (S.down) { el.innerHTML = UI.shellHTML(nav, "", UI.downHTML()); return; }
  if (!S.user) { location.replace("../../app/?next=admin-passports"); return; }
  if (!S.me || S.me.role !== "cadre") { el.innerHTML = UI.shellHTML(nav, "", UI.notCadreHTML()); return; }
  if (!internStaff()) { el.innerHTML = UI.shellHTML(nav, UI.railHTML("passports", "", S.me), UI.noAccessHTML(S.me)); return; }

  let body;
  if (S.view === "cities" && isPres()) {
    body = UI.citiesHTML(S.pass, S.msg, S.busy);
  } else if (S.view === "cadre" && isPres()) {
    body = UI.passportAdminHTML(S.pass, S.msg, S.busy, S.previewMonth);
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
    body = UI.internAdminHTML(S.intern, S.internSel, S.msg, S.busy, isPres(), S.internPreviewCat);
  }
  // 側欄亮哪一行：幹部護照的三個編輯畫面算在「幹部護照」底下，其餘算「實習護照」。
  const tab = ["cities", "dest-edit"].includes(S.view) ? "cities"
    : ["cadre", "act-edit", "month-edit"].includes(S.view) ? "cadre" : "interns";
  el.innerHTML = UI.shellHTML(nav, UI.railHTML("passports", tab, S.me), body);
}

async function boot() {
  try {
    const who = await AUTH.currentUserDetailed();
    if (who.offline) { S.down = true; render(); return; }
    S.user = who.user;
    if (!S.user) { render(); return; }
    S.me = await D.loadMe(S.user.id);
    if (!S.me || S.me.role !== "cadre" || !internStaff()) { render(); return; }
    // ?tab=cadre 直接開幹部護照（README 的連結用得到）。不是 Co-President 的回到實習護照。
    const want = location.hash.slice(1) || new URLSearchParams(location.search).get("tab");
    if (want === "cadre" && isPres()) await openCadre();
    else if (want === "cities" && isPres()) await openCities();
    else await openInterns();
  } catch (e) {
    if (AUTH.sessionGone(e)) { await AUTH.signOut(); location.replace("../../app/?next=admin-passports"); return; }
    console.error(HERE + " 載入失敗：", e);
    S.down = true; render();
  }
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

// 城市那一頁跟幹部護照讀同一份資料（loadPassportAdmin），只是開在另一個畫面。
async function openCities(keepMsg) {
  S.busy = true; if (!keepMsg) S.msg = ""; render();
  try {
    S.pass = await D.loadPassportAdmin();
    S.view = "cities"; S.busy = false;
  } catch (e) { S.busy = false; S.msg = T("err.citiesLoad") + D.says(e); S.view = "cities"; }
  render();
}

document.addEventListener("click", async e => {
  const b = e.target.closest("[data-act]");
  if (!b) return;
  const act = b.dataset.act;
  const id = b.dataset.id;

  if (act === "retry") { location.reload(); return; }
  if (act === "lang") { switchLang(b.dataset.lang); return; }
  if (act === "signout") { await AUTH.signOut(); location.replace("../../app/"); return; }
  if (act === "tab") {
    e.preventDefault(); S.msg = "";
    history.replaceState(null, "", "#" + b.dataset.t);
    if (b.dataset.t === "cadre" && isPres()) await openCadre();
    else if (b.dataset.t === "cities" && isPres()) await openCities();
    else await openInterns();
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
    if (!on && !confirm(T("confirm.actOff", { t: a ? a.title_zh : id }))) return;
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
    if (!confirm(T("confirm.actDel", { t: a ? a.title_zh : id }))) return;
    S.busy = true; S.msg = ""; render();
    try {
      await D.deleteActivity(id);
      S.msg = T("msg.deletedT", { t: a ? a.title_zh : id });
      await openCadre(true);
    } catch (err) { S.busy = false; S.msg = T("err.delete") + D.says(err); render(); }
    return;
  }
  if (act === "month-edit") {
    const m = S.pass.months.find(x => String(x.seq) === b.dataset.seq);
    if (!m) { S.msg = T("err.noMonth"); render(); return; }
    S.monthEditing = m; S.monthDraft = null; S.view = "month-edit"; S.msg = ""; render(); return;
  }
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
    if (!on && !confirm(T("confirm.cityOff", { c: d.city }))) return;
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
    if (!confirm(T("confirm.activate", { t: t ? t.title_zh : id }))) return;
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
    if (!on && !confirm(T("confirm.taskOff", { t: t ? t.title_zh : id }))) return;
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
    if (!confirm(T("confirm.actDel", { t: t ? t.title_zh : id }))) return;
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
