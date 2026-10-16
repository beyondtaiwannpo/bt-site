// 後台「對外」那一組的邏輯：資源、團隊頁、校友頁、信件文案。
// 2026-10-15 從 admin/src/main.js 原樣搬過來（後台拆成四個資料夾，見 README「後台的四個資料夾」）。
//
// 狀態只有一個 S，畫面只從 S 產生。**不在事件處理裡直接改 DOM**，一律改 S 再 render()。
import * as AUTH from "../../../shared/auth.js";
import { navHTML } from "../../../shared/nav.js";
import * as D from "./data.js";
import * as UI from "./ui.js";

const HERE = "/admin/site/";

let S = {
  user: null, me: null, down: false, busy: false, msg: "",
  view: "res",             // res | res-edit | team | stories | mail | mail-edit
  res: [], resEditing: null,
  people: [],
  // 校友頁與信件文案**一定要有初始值**：少了它，載入失敗之後再 render 一次會整頁空白，
  // 而這個 repo 的規矩是「連不上資料庫也要畫得出東西」。
  stories: [],
  tpls: [], tplKind: null,
};

const root = () => document.getElementById("bt-root");
// Director 與 President 改得動資源，一般幹部唯讀。**這只是畫面，真正的門在資料庫的 RLS。**
const canEdit = () => !!S.me && (S.me.board === "director" || S.me.board === "president");
const isPres = () => !!S.me && S.me.board === "president";

function render() {
  const el = root();
  if (!el) return;
  // 頂欄畫在 #bt-root 裡面，不 insertAdjacentHTML 到 <body>（理由見 admin/src/main.js 同一段）。
  const nav = S.me ? navHTML({ current: "admin", role: S.me.role, name: S.me.name }) : "";

  if (S.down) { el.innerHTML = UI.downHTML(); return; }
  if (!S.user) { location.replace("../../app/?next=admin-site"); return; }
  if (!S.me || S.me.role !== "cadre") { el.innerHTML = UI.notCadreHTML(); return; }

  let body;
  if (S.view === "mail") {
    body = UI.mailListHTML(S.tpls, S.msg);
  } else if (S.view === "mail-edit") {
    body = UI.mailEditHTML(S.tplKind, S.tpls.find(t => t.kind === S.tplKind), S.msg, S.busy);
  } else if (S.view === "team") {
    body = UI.publicTeamHTML(S.people, S.msg, S.busy);
  } else if (S.view === "stories") {
    body = UI.alumniStoriesHTML(S.stories, S.msg, S.busy);
  } else if (S.view === "res-edit") {
    body = UI.resEditHTML(S.resEditing, S.msg, S.busy);
  } else {
    body = UI.resListHTML(S.res, canEdit(), S.msg, isPres());
  }
  el.innerHTML = nav + UI.groupBarHTML("site", S.me) + body;
}

async function boot() {
  try {
    const who = await AUTH.currentUserDetailed();
    if (who.offline) { S.down = true; render(); return; }
    S.user = who.user;
    if (!S.user) { render(); return; }
    S.me = await D.loadMe(S.user.id);
    if (!S.me || S.me.role !== "cadre") { render(); return; }
    // ?tab=team 這種連結可以直接開到某一個分頁（README 裡的連結用得到）。
    // Co-President 專用的分頁對其他人回到資源，不報錯。
    const want = new URLSearchParams(location.search).get("tab");
    if (want === "team" && isPres()) await openTeam();
    else if (want === "stories" && isPres()) await openStories();
    else if (want === "mail" && isPres()) await openMail();
    else await openRes();
  } catch (e) {
    // 票已經不能用了：先清掉本機那張壞票再去登入頁（理由見 admin/src/main.js 同一段）。
    if (AUTH.sessionGone(e)) { await AUTH.signOut(); location.replace("../../app/?next=admin-site"); return; }
    console.error(HERE + " 載入失敗：", e);
    S.down = true; render();
  }
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

// 校友頁的核可清單。整份只有 Co-President 叫得動（門在資料庫那一支函式裡）。
async function openStories() {
  S.busy = true; render();
  try {
    S.stories = await D.loadStories();
    S.view = "stories"; S.busy = false;
  } catch (e) { S.busy = false; S.msg = "校友名單載不到：" + D.says(e); }
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

document.addEventListener("click", async e => {
  const b = e.target.closest("[data-act]");
  if (!b) return;
  const act = b.dataset.act;
  const id = b.dataset.id;

  if (act === "retry") { location.reload(); return; }
  if (act === "signout") { await AUTH.signOut(); location.replace("../../app/"); return; }

  if (act === "tab") {
    S.msg = "";
    if (b.dataset.t === "team") { await openTeam(); }
    else if (b.dataset.t === "stories") { await openStories(); }
    else if (b.dataset.t === "mail") { await openMail(); }
    else { await openRes(); }
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

  // 第二把鑰匙轉下去（或轉回來）。跟上面那顆「approve」同一個形狀：
  // 只改記憶體裡那一筆，不重讀整份名單 —— 核可是一個一個看、一個一個按的。
  if (act === "approve-story") {
    const ok = b.checked;
    S.busy = true; render();
    try {
      await D.setStoryApproved(id, ok);
      const r = S.stories.find(x => x.id === id);
      if (r) r.story_approved = ok;
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

});

boot();
