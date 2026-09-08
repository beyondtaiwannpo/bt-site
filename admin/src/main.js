// 申請管理的邏輯。
//
// 三個畫面：表單清單 → 一份表單 → 一題。狀態只有一個 S，畫面只從 S 產生。
// **不在事件處理裡直接改 DOM**，一律改 S 再 render() ——
// 兩條路徑會分岔，而分岔是安靜的（這個 repo 反覆踩到的同一件事）。
import { supabase } from "../../shared/supabase.js";
import * as AUTH from "../../shared/auth.js";
import { navHTML } from "../../shared/nav.js";
import * as D from "./data.js";
import * as UI from "./ui.js";

let S = {
  user: null, me: null, down: false, busy: false, msg: "",
  view: "list",            // list | form | question
  forms: [], teams: [],
  form: null, questions: [], qEditing: null,
};

const root = () => document.getElementById("bt-root");
// Director 與 President 改得動，一般幹部唯讀（2026-09-07 拍板的三層）。
// **這只是畫面。真正的門在資料庫的 RLS**（is_director_of），
// 前端少畫一顆按鈕不是安全機制。
const canEdit = () => !!S.me && (S.me.board === "director" || S.me.board === "president");

function render() {
  const el = root();
  if (!el) return;
  const nav = S.me ? navHTML({ current: "admin", role: S.me.role, name: S.me.name }) : "";
  const head = document.querySelector(".btnav");
  if (head) head.remove();

  if (S.down) { el.innerHTML = UI.downHTML(); return; }
  if (!S.user) { location.replace("../app/?next=" + encodeURIComponent("/admin/")); return; }
  if (!S.me || S.me.role !== "cadre") { el.innerHTML = UI.notCadreHTML(); return; }

  document.body.insertAdjacentHTML("afterbegin", nav);
  if (S.view === "question") {
    el.innerHTML = UI.questionHTML(S.qEditing, S.msg, S.busy);
  } else if (S.view === "form" && S.form) {
    el.innerHTML = UI.formHTML(S.form, S.questions, canEdit(),
      S.me.board === "president" ? S.teams : [], S.msg, S.busy);
  } else {
    el.innerHTML = UI.listHTML(S.forms, canEdit(), S.msg);
  }
}

async function boot() {
  try {
    const who = await AUTH.currentUserDetailed();
    if (who.offline) { S.down = true; render(); return; }
    S.user = who.user;
    if (!S.user) { render(); return; }
    S.me = await D.loadMe(S.user.id);
    if (!S.me || S.me.role !== "cadre") { render(); return; }
    S.forms = await D.loadForms();
    if (S.me.board === "president") S.teams = await D.loadTeams();
    render();
  } catch (e) {
    console.error("/admin/ 載入失敗：", e);
    S.down = true; render();
  }
}

// 把畫面上那幾格讀成一個物件。**讀取集中在這裡一支**，
// 存檔那一段就不會有第二份欄位名單（兩份一定會分岔）。
function readForm() {
  const val = id => { const el = document.getElementById(id); return el ? el.value.trim() : ""; };
  return {
    title: val("ftitle"),
    intro: val("fintro"),
    kind: val("fkind"),
    lang: val("flang"),
    status: val("fstatus"),
    // datetime-local 給的是「本機時間、沒有時區」。直接送進 timestamptz
    // 會被當成 UTC，台灣的使用者填 09:00 會變成下午五點才開放。
    // 轉成 ISO 讓瀏覽器把時區補上去。
    opens_at: val("fopen") ? new Date(val("fopen")).toISOString() : "",
    closes_at: val("fclose") ? new Date(val("fclose")).toISOString() : "",
    notify_by: val("fnotify"),
    interview_url: val("fcal"),
    ...(document.getElementById("fteam") ? { team: val("fteam") } : {}),
  };
}

async function openForm(id) {
  S.busy = true; S.msg = ""; render();
  try {
    const { form, questions } = await D.loadForm(id);
    S.form = form; S.questions = questions; S.view = "form"; S.busy = false; S.msg = "";
  } catch (e) { S.busy = false; S.msg = "打不開：" + (e.message || e); }
  render();
}

async function reloadList() {
  try { S.forms = await D.loadForms(); } catch (e) { S.msg = "清單載不到：" + (e.message || e); }
}

document.addEventListener("click", async e => {
  const b = e.target.closest("[data-act]");
  if (!b) return;
  const act = b.dataset.act;
  const id = b.dataset.id;

  if (act === "retry") { location.reload(); return; }
  if (act === "signout") { await AUTH.signOut(); location.replace("../app/"); return; }

  if (act === "back-list") { S.view = "list"; S.msg = ""; await reloadList(); render(); return; }
  if (act === "open-form") { await openForm(id); return; }

  if (act === "new-form") {
    // President 沒有 team 的時候要先選一個，不然這份表單會屬於空字串，
    // 而空字串那個 team 沒有人在，等於開出來就沒有人看得到。
    const team = S.me.team || (S.teams[0] || "");
    if (!team) { S.msg = "你的 profile 還沒有填 team，開不出表單。先到護照裡填一下。"; render(); return; }
    const title = prompt("這份申請表叫什麼名字？（之後改得動）");
    if (!title || !title.trim()) return;
    S.busy = true; render();
    try {
      const newId = await D.createForm(team, title.trim(), "program");
      S.busy = false;
      await openForm(newId);
    } catch (err) { S.busy = false; S.msg = "開不出來：" + (err.message || err); render(); }
    return;
  }

  if (act === "save-form") {
    const patch = readForm();
    if (!patch.title) { S.msg = "表單要有名字。"; render(); return; }
    // 開放之前先擋一次：一份沒有題目的表單開出去，申請人看到的是一個空表單，
    // 而他會以為是網站壞了。**這是唯一一個前端擋得住、而且該擋的狀態**。
    if (patch.status === "open" && S.questions.length === 0) {
      S.msg = "這份表單還沒有題目，不能開放。先加一題。"; render(); return;
    }
    S.busy = true; S.msg = ""; render();
    try {
      await D.saveForm(S.form.id, patch);
      const { form, questions } = await D.loadForm(S.form.id);
      S.form = form; S.questions = questions; S.busy = false; S.msg = "存好了。";
    } catch (err) { S.busy = false; S.msg = "存不起來：" + (err.message || err); }
    render();
    return;
  }

  if (act === "del-form") {
    const n = S.forms.find(f => f.id === S.form.id);
    const got = n && n.counts.total;
    if (!confirm(got
      ? `這份表單已經收到 ${got} 件申請。刪掉它，那些申請與答案會一起永久消失。確定嗎？`
      : "刪掉這份表單？沒有辦法復原。")) return;
    S.busy = true; render();
    try {
      await D.deleteForm(S.form.id);
      S.busy = false; S.view = "list"; S.form = null; S.msg = "刪掉了。";
      await reloadList();
    } catch (err) { S.busy = false; S.msg = "刪不掉：" + (err.message || err); }
    render();
    return;
  }

  // ── 題目 ──────────────────────────────────────────────────────────
  if (act === "q-new")    { S.qEditing = null; S.view = "question"; S.msg = ""; render(); return; }
  if (act === "q-cancel") { S.view = "form"; S.msg = ""; render(); return; }
  if (act === "q-edit")   {
    S.qEditing = S.questions.find(q => q.id === id) || null;
    S.view = "question"; S.msg = ""; render(); return;
  }

  if (act === "q-save") {
    const label = document.getElementById("qlabel").value.trim();
    if (!label) { S.msg = "題目不能空白。"; render(); return; }
    const type = document.getElementById("qtype").value;
    const options = document.getElementById("qopts").value
      .split("\n").map(x => x.trim()).filter(Boolean);
    if ((type === "single" || type === "multi") && options.length < 2) {
      S.msg = "單選與多選至少要兩個選項，一行一個。"; render(); return;
    }
    const q = {
      label,
      help: document.getElementById("qhelp").value.trim() || null,
      type,
      required: document.getElementById("qreq").checked,
      // 短答與長答不留選項。留著的話改題型改回來會冒出舊選項，
      // 而那些選項沒有人記得是誰打的。
      options: (type === "single" || type === "multi") ? options : [],
    };
    S.busy = true; S.msg = ""; render();
    try {
      if (S.qEditing) await D.saveQuestion(S.qEditing.id, q);
      else await D.addQuestion(S.form.id, q, S.questions);
      const r = await D.loadForm(S.form.id);
      S.questions = r.questions; S.busy = false; S.view = "form"; S.qEditing = null; S.msg = "";
    } catch (err) { S.busy = false; S.msg = "存不起來：" + (err.message || err); }
    render();
    return;
  }

  if (act === "q-del") {
    if (!confirm("刪掉這一題？已經送出的申請裡，這一題的答案會一起消失。")) return;
    S.busy = true; render();
    try {
      await D.deleteQuestion(id);
      const r = await D.loadForm(S.form.id);
      S.questions = r.questions; S.busy = false; S.msg = "";
    } catch (err) { S.busy = false; S.msg = "刪不掉：" + (err.message || err); }
    render();
    return;
  }

  if (act === "q-up" || act === "q-down") {
    const i = S.questions.findIndex(q => q.id === id);
    const j = act === "q-up" ? i - 1 : i + 1;
    if (i < 0 || j < 0 || j >= S.questions.length) return;
    S.busy = true; render();
    try {
      await D.swapOrd(S.questions[i], S.questions[j]);
      const r = await D.loadForm(S.form.id);
      S.questions = r.questions; S.busy = false;
    } catch (err) { S.busy = false; S.msg = "換不了順序：" + (err.message || err); }
    render();
    return;
  }
});

boot();
