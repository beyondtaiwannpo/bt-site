// 後台「護照」那一組的邏輯：實習護照的屆別與格子。幹部護照的格子是批 2 的事。
// 2026-10-15 從 admin/src/main.js 原樣搬過來（後台拆成四個資料夾，見 README「後台的四個資料夾」）。
//
// 狀態只有一個 S，畫面只從 S 產生。**不在事件處理裡直接改 DOM**，一律改 S 再 render()。
import * as AUTH from "../../../shared/auth.js";
import { navHTML } from "../../../shared/nav.js";
import * as D from "./data.js";
import * as UI from "./ui.js";

const HERE = "/admin/passports/";

let S = {
  user: null, me: null, down: false, busy: false, msg: "",
  view: "interns",         // interns | intern-term | intern-task
  // 一定要有初始值：載入失敗之後再 render 一次不能整頁空白。
  intern: { terms: [], tasks: [], stamped: {}, interns: 0 }, internSel: null,
  internTermEditing: null, internTaskEditing: null, internTaskTerm: null,
  // 存檔被擋時留住剛填的東西（端對端測試 2026-10-18 抓到：沒有這個，一句錯誤訊息會配一張空表單）。
  internTermDraft: null, internTaskDraft: null,
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

  if (S.down) { el.innerHTML = UI.downHTML(); return; }
  if (!S.user) { location.replace("../../app/?next=admin-passports"); return; }
  if (!S.me || S.me.role !== "cadre") { el.innerHTML = UI.notCadreHTML(); return; }
  if (!internStaff()) { el.innerHTML = nav + UI.noAccessHTML(S.me); return; }

  let body;
  if (S.view === "intern-term") {
    body = UI.internTermEditHTML(S.internTermEditing, S.msg, S.busy, S.internTermDraft);
  } else if (S.view === "intern-task") {
    body = UI.internTaskEditHTML(S.internTaskEditing, S.internTaskTerm,
      UI.suggestTaskId(S.internTaskTerm, S.intern.tasks), S.msg, S.busy, S.internTaskDraft);
  } else {
    body = UI.internAdminHTML(S.intern, S.internSel, S.msg, S.busy, isPres());
  }
  el.innerHTML = nav + UI.groupBarHTML("passports", S.me) + body;
}

async function boot() {
  try {
    const who = await AUTH.currentUserDetailed();
    if (who.offline) { S.down = true; render(); return; }
    S.user = who.user;
    if (!S.user) { render(); return; }
    S.me = await D.loadMe(S.user.id);
    if (!S.me || S.me.role !== "cadre" || !internStaff()) { render(); return; }
    await openInterns();
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
  } catch (e) { S.busy = false; S.msg = "實習護照載不到：" + D.says(e); S.view = "interns"; }
  render();
}

document.addEventListener("click", async e => {
  const b = e.target.closest("[data-act]");
  if (!b) return;
  const act = b.dataset.act;
  const id = b.dataset.id;

  if (act === "retry") { location.reload(); return; }
  if (act === "signout") { await AUTH.signOut(); location.replace("../../app/"); return; }
  if (act === "tab") { S.msg = ""; await openInterns(); return; }

  // ── 實習護照的後台（2026-10-18）────────────────────────────────────
  // 每一個動作：按下去 busy（按鈕變「存檔中…」、其他按鈕關掉）、成功一句、失敗說錯在哪。
  if (act === "intern-back") { await openInterns(); return; }
  if (act === "intern-see")  { S.internSel = id; S.msg = `現在看的是 ${id}。`; render(); return; }
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
      S.msg = "五格都要填：代號、中文名稱、英文名稱、開始日、結束日。"; render(); return;
    }
    S.busy = true; S.msg = ""; render();
    try {
      const made = await D.saveInternTerm(t);
      S.internSel = made; S.internTermDraft = null;
      S.msg = id ? `「${t.title_zh}」改好了。` : `「${t.title_zh}」開好了。還不是目前這一屆，要的話按「設成目前這一屆」。`;
      await openInterns(true);
    } catch (err) { S.busy = false; S.msg = "存不起來：" + D.says(err); render(); }
    return;
  }
  if (act === "intern-term-activate") {
    const t = S.intern.terms.find(x => x.id === id);
    if (!confirm(`把「${t ? t.title_zh : id}」設成目前這一屆？\n\n之後新進來的 intern 會拿到這一屆的護照，/intern-passport/ 顯示的也是這一屆的格子。`)) return;
    S.busy = true; S.msg = ""; render();
    try {
      await D.activateInternTerm(id);
      S.internSel = id;
      S.msg = `「${t ? t.title_zh : id}」現在是目前這一屆了。`;
      await openInterns(true);
    } catch (err) { S.busy = false; S.msg = "設不了：" + D.says(err); render(); }
    return;
  }
  if (act === "intern-task-new") {
    S.internTaskEditing = null; S.internTaskDraft = null; S.internTaskTerm = b.dataset.term; S.view = "intern-task"; S.msg = ""; render(); return;
  }
  if (act === "intern-task-edit") {
    const t = S.intern.tasks.find(x => x.id === id);
    if (!t) { S.msg = "找不到這一格，重新整理再試一次。"; render(); return; }
    S.internTaskEditing = t; S.internTaskDraft = null; S.internTaskTerm = t.term; S.view = "intern-task"; S.msg = ""; render(); return;
  }
  if (act === "intern-task-save") {
    const val = i => { const el = document.getElementById(i); return el ? el.value.trim() : ""; };
    const t = { id: id || val("ik-id"), term: b.dataset.term, seq: val("ik-seq"), category: val("ik-cat"),
                title_zh: val("ik-zh"), title_en: val("ik-en"), description: val("ik-desc") };
    S.internTaskDraft = t;
    if (!t.id || !t.title_zh || !t.title_en) { S.msg = "代號、中文標題、英文標題都要填。"; render(); return; }
    S.busy = true; S.msg = ""; render();
    try {
      await D.saveInternTask(t);
      S.internSel = t.term; S.internTaskDraft = null;
      S.msg = id ? `「${t.title_zh}」改好了。intern 重新整理護照就看得到。` : `「${t.title_zh}」加好了。intern 重新整理護照就看得到。`;
      await openInterns(true);
    } catch (err) { S.busy = false; S.msg = "存不起來：" + D.says(err); render(); }
    return;
  }
  if (act === "intern-task-off" || act === "intern-task-on") {
    const on = act === "intern-task-on";
    const t = S.intern.tasks.find(x => x.id === id);
    if (!on && !confirm(`停用「${t ? t.title_zh : id}」？\n\n停用之後 intern 的護照上就看不到這一格，已經蓋過的章還在，之後可以恢復。`)) return;
    S.busy = true; S.msg = ""; render();
    try {
      await D.setInternTaskActive(id, on);
      S.msg = `「${t ? t.title_zh : id}」${on ? "恢復了" : "停用了"}。`;
      await openInterns(true);
    } catch (err) { S.busy = false; S.msg = (on ? "恢復不了：" : "停用不了：") + D.says(err); render(); }
    return;
  }
  if (act === "intern-task-del") {
    const t = S.intern.tasks.find(x => x.id === id);
    if (!confirm(`刪掉「${t ? t.title_zh : id}」？\n\n還沒有人蓋過，所以可以刪。刪了就回不來。`)) return;
    S.busy = true; S.msg = ""; render();
    try {
      await D.deleteInternTask(id);
      S.msg = `「${t ? t.title_zh : id}」刪掉了。`;
      await openInterns(true);
    } catch (err) { S.busy = false; S.msg = "刪不掉：" + D.says(err); render(); }
    return;
  }

});

boot();
