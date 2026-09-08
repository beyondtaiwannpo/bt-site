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
  view: "list",            // list | form | question | apps
  forms: [], teams: [],
  form: null, questions: [], qEditing: null,
  // 批 4
  apps: [], sel: new Set(), filter: "all", pending: [],
  // 批 5
  res: [], resEditing: null,
  // 批 6
  noticeTo: new Set(["accepted"]),
  // 團隊頁
  people: [],
  // 信件文案
  tpls: [], tplKind: null,
};

const root = () => document.getElementById("bt-root");
// Director 與 President 改得動，一般幹部唯讀（2026-09-07 拍板的三層）。
// **這只是畫面。真正的門在資料庫的 RLS**（is_director_of），
// 前端少畫一顆按鈕不是安全機制。
const canEdit = () => !!S.me && (S.me.board === "director" || S.me.board === "president");
const isPres = () => !!S.me && S.me.board === "president";

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
  if (S.view === "mail") {
    el.innerHTML = UI.mailListHTML(S.tpls, S.msg);
  } else if (S.view === "mail-edit") {
    el.innerHTML = UI.mailEditHTML(S.tplKind, S.tpls.find(t => t.kind === S.tplKind), S.msg, S.busy);
  } else if (S.view === "team") {
    el.innerHTML = UI.publicTeamHTML(S.people, S.msg, S.busy);
  } else if (S.view === "checkin" && S.form) {
    el.innerHTML = UI.checkinHTML(S.form, S.apps, canEdit(), S.msg, S.busy);
  } else if (S.view === "notice" && S.form) {
    el.innerHTML = UI.noticeHTML(S.form, S.apps, S.noticeTo, S.msg, S.busy);
  } else if (S.view === "res") {
    el.innerHTML = UI.resListHTML(S.res, canEdit(), S.msg, isPres());
  } else if (S.view === "res-edit") {
    el.innerHTML = UI.resEditHTML(S.resEditing, S.msg, S.busy);
  } else if (S.view === "apps" && S.form) {
    el.innerHTML = UI.appsHTML(S.form, S.apps, S.questions, canEdit(),
      S.sel, S.filter, S.pending, S.msg, S.busy);
  } else if (S.view === "question") {
    el.innerHTML = UI.questionHTML(S.qEditing, S.msg, S.busy);
  } else if (S.view === "form" && S.form) {
    el.innerHTML = UI.formHTML(S.form, S.questions, canEdit(),
      S.me.board === "president" ? S.teams : [], S.msg, S.busy);
  } else {
    el.innerHTML = UI.listHTML(S.forms, canEdit(), S.msg, isPres());
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
  } catch (e) { S.busy = false; S.msg = "打不開：" + D.says(e); }
  render();
}

async function openApps(id) {
  S.busy = true; S.msg = ""; render();
  try {
    const { form, questions } = await D.loadForm(id);
    S.form = form; S.questions = questions;
    S.apps = await D.loadApplications(id);
    S.pending = await D.loadPending(id);
    S.sel = new Set(); S.filter = "all"; S.view = "apps"; S.busy = false;
  } catch (e) { S.busy = false; S.msg = "打不開：" + D.says(e); }
  render();
}

// 改完狀態之後重讀。**連 pending 一起重讀** ——
// 不然「還有 N 封沒寄出去」那一塊會停在改之前的數字。
async function refreshApps() {
  S.apps = await D.loadApplications(S.form.id);
  S.pending = await D.loadPending(S.form.id);
}

async function openMail() {
  S.busy = true; render();
  try {
    S.tpls = await D.loadTemplates();
    S.view = "mail"; S.busy = false;
  } catch (e) { S.busy = false; S.msg = "文案載不到：" + D.says(e); }
  render();
}

async function openTeam() {
  S.busy = true; render();
  try {
    S.people = await D.loadPublicCandidates();
    S.view = "team"; S.busy = false;
  } catch (e) { S.busy = false; S.msg = "名單載不到：" + D.says(e); }
  render();
}

async function openRes() {
  S.busy = true; render();
  try {
    S.res = await D.loadResources();
    S.view = "res"; S.busy = false;
  } catch (e) { S.busy = false; S.msg = "資源載不到：" + D.says(e); }
  render();
}

async function reloadList() {
  try { S.forms = await D.loadForms(); } catch (e) { S.msg = "清單載不到：" + D.says(e); }
}

document.addEventListener("click", async e => {
  const b = e.target.closest("[data-act]");
  if (!b) return;
  const act = b.dataset.act;
  const id = b.dataset.id;

  if (act === "retry") { location.reload(); return; }
  if (act === "signout") { await AUTH.signOut(); location.replace("../app/"); return; }

  // ── 批 6：活動營運 ────────────────────────────────────────────────
  if (act === "open-checkin" || act === "open-notice") {
    // apps 已經在手上就不用再查一次。從清單直接點進來的情況才要查。
    if (!S.form || S.form.id !== id || !S.apps.length) await openApps(id);
    S.view = act === "open-checkin" ? "checkin" : "notice";
    S.msg = ""; render();
    return;
  }

  if (act === "checkin") {
    // checkbox 的預設行為已經把勾打上去了，這裡讀它的新狀態。
    const present = b.checked;
    S.busy = true; render();
    try {
      await D.setCheckIn([id], present);
      const a = S.apps.find(x => x.id === id);
      // **只改記憶體裡那一筆，不重讀整份名單。** 現場點名是一個接一個點的，
      // 每點一個就重讀一百列，網路不好的場地會變成點一下等三秒。
      if (a) a.checked_in_at = present ? new Date().toISOString() : null;
      S.busy = false;
    } catch (err) { S.busy = false; S.msg = "點不了：" + D.says(err); }
    render();
    return;
  }

  if (act === "notice-to") {
    const t = b.dataset.t;
    if (S.noticeTo.has(t)) S.noticeTo.delete(t); else S.noticeTo.add(t);
    render();
    return;
  }

  if (act === "notice-send") {
    const sub = document.getElementById("nsub").value.trim();
    const body = document.getElementById("nbody").value.trim();
    if (!sub || !body) { S.msg = "主旨與內容都要寫。"; render(); return; }
    const to = [...S.noticeTo];
    const n = S.apps.filter(a => S.noticeTo.has(a.status)).length;
    // ⚠ 這一步會一次寄信給一群未成年人，而且收不回來。
    if (!confirm(`要把這封信寄給 ${n} 個人嗎？\n\n主旨：${sub}\n\n信寄出去就收不回來了。`)) return;
    S.busy = true; S.msg = ""; render();
    try {
      const made = await D.sendNotice(S.form.id, to, sub, body);
      let note = "";
      try {
        const r = await D.sendMail();
        note = r.failed ? `，寄出 ${r.sent} 封、${r.failed} 封失敗` : `，寄出 ${r.sent} 封`;
      } catch (me) { note = "。信還沒寄出去：" + D.says(me); }
      S.pending = await D.loadPending(S.form.id);
      S.busy = false; S.msg = `排了 ${made} 封信${note}。`;
    } catch (err) { S.busy = false; S.msg = "寄不出去：" + D.says(err); }
    render();
    return;
  }

  // ── 批 5：資源 ────────────────────────────────────────────────────
  if (act === "tab") {
    S.msg = ""; S.sel = new Set();
    if (b.dataset.t === "res") { await openRes(); }
    else if (b.dataset.t === "team") { await openTeam(); }
    else if (b.dataset.t === "mail") { await openMail(); }
    else { S.view = "list"; await reloadList(); render(); }
    return;
  }
  if (act === "mail-back") { await openMail(); return; }
  if (act === "mail-edit") { S.tplKind = b.dataset.k; S.view = "mail-edit"; S.msg = ""; render(); return; }
  if (act === "mail-save") {
    const sub = document.getElementById("msub").value.trim();
    const body = document.getElementById("mbody").value.trim();
    if (!sub || !body) { S.msg = "主旨與內文都要寫。"; render(); return; }
    S.busy = true; S.msg = ""; render();
    try {
      await D.saveTemplate(b.dataset.k, sub, body);
      S.tpls = await D.loadTemplates();
      S.busy = false; S.msg = "存好了。下一封寄出去的信就是這個文案。";
    } catch (err) { S.busy = false; S.msg = "存不起來：" + D.says(err); }
    render();
    return;
  }

  if (act === "approve") {
    const ok = b.checked;
    S.busy = true; render();
    try {
      await D.setApproved(id, ok);
      const p = S.people.find(x => x.id === id);
      if (p) p.public_approved = ok;
      S.busy = false; S.msg = "";
    } catch (err) { S.busy = false; S.msg = "改不了：" + D.says(err); }
    render();
    return;
  }

  if (act === "res-back") { await openRes(); return; }
  if (act === "res-new")  { S.resEditing = null; S.view = "res-edit"; S.msg = ""; render(); return; }
  if (act === "res-edit") {
    S.resEditing = S.res.find(r => r.id === id) || null;
    S.view = "res-edit"; S.msg = ""; render(); return;
  }
  if (act === "res-save") {
    const val = i => { const el = document.getElementById(i); return el ? el.value.trim() : ""; };
    const patch = {
      title: val("rtitle"), blurb: val("rblurb"), kind: val("rkind"),
      url: val("rurl"), team: val("rteam") || null, status: val("rstatus"),
      ord: Number(val("rord")) || 100,
    };
    S.busy = true; S.msg = ""; render();
    try {
      await D.saveResource(S.resEditing ? S.resEditing.id : null, patch);
      S.busy = false; S.resEditing = null;
      await openRes();
    } catch (err) { S.busy = false; S.msg = "存不起來：" + D.says(err); render(); }
    return;
  }
  if (act === "res-del") {
    if (!confirm("刪掉這個資源？外面那一頁上就不見了。")) return;
    S.busy = true; render();
    try {
      await D.deleteResource(id);
      S.busy = false; S.resEditing = null;
      await openRes();
    } catch (err) { S.busy = false; S.msg = "刪不掉：" + D.says(err); render(); }
    return;
  }

  if (act === "back-list") {
    S.view = "list"; S.msg = ""; S.sel = new Set(); await reloadList(); render(); return;
  }
  if (act === "open-form") { await openForm(id); return; }
  if (act === "open-apps") { await openApps(id); return; }

  // ── 批 4：審核 ────────────────────────────────────────────────────
  if (act === "filter") { S.filter = b.dataset.f; S.msg = ""; render(); return; }

  if (act === "pick") {
    // checkbox 的預設行為已經把勾打上去了，這裡只同步 S。
    // **不要 preventDefault 再自己畫** —— 那會讓鍵盤操作變成兩套邏輯。
    if (S.sel.has(id)) S.sel.delete(id); else S.sel.add(id);
    render();
    return;
  }

  if (act === "pick-all") {
    const shown = S.filter === "all" ? S.apps : S.apps.filter(a => a.status === S.filter);
    const allOn = shown.length && shown.every(a => S.sel.has(a.id));
    for (const a of shown) { if (allOn) S.sel.delete(a.id); else S.sel.add(a.id); }
    render();
    return;
  }

  if (act === "decide") {
    const status = b.dataset.s;
    const ids = [...S.sel];
    if (!ids.length) return;
    const word = { interview: "邀請面試", accepted: "錄取", rejected: "婉拒" }[status] || status;
    // ⚠ **這一步會寄信給未成年人，而且收不回來。** 所以要確認，
    // 而且確認的句子裡要有人數與動作，不是一句「確定嗎」。
    if (!confirm(`要把選起來的 ${ids.length} 個人標成「${word}」嗎？\n\n` +
                 `每一個人都會收到一封信。信寄出去就收不回來了。`)) return;
    S.busy = true; S.msg = ""; render();
    try {
      const n = await D.decide(ids, status);
      // 改完立刻試著把信寄出去。失敗不影響狀態（狀態已經改好了），
      // 只會留在 outbox 裡，畫面上看得到。
      let mailNote = "";
      try {
        const r = await D.sendMail();
        mailNote = r.sent ? `，寄出 ${r.sent} 封信` : "";
        if (r.failed) mailNote += `，${r.failed} 封沒寄成功`;
      } catch (me) {
        mailNote = "。信還沒寄出去：" + D.says(me);
      }
      S.sel = new Set();
      await refreshApps();
      S.busy = false;
      S.msg = `${n} 個人標成「${word}」${mailNote}。`;
    } catch (err) {
      S.busy = false; S.msg = "改不了：" + D.says(err);
    }
    render();
    return;
  }

  if (act === "send-mail") {
    S.busy = true; S.msg = ""; render();
    try {
      const r = await D.sendMail();
      S.pending = await D.loadPending(S.form.id);
      S.busy = false;
      S.msg = r.failed ? `寄出 ${r.sent} 封，${r.failed} 封失敗。` : `寄出 ${r.sent} 封。`;
    } catch (err) {
      S.busy = false; S.msg = "寄不出去：" + D.says(err);
    }
    render();
    return;
  }

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
    } catch (err) { S.busy = false; S.msg = "開不出來：" + D.says(err); render(); }
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
    } catch (err) { S.busy = false; S.msg = "存不起來：" + D.says(err); }
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
    } catch (err) { S.busy = false; S.msg = "刪不掉：" + D.says(err); }
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
    } catch (err) { S.busy = false; S.msg = "存不起來：" + D.says(err); }
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
    } catch (err) { S.busy = false; S.msg = "刪不掉：" + D.says(err); }
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
    } catch (err) { S.busy = false; S.msg = "換不了順序：" + D.says(err); }
    render();
    return;
  }
});

boot();
