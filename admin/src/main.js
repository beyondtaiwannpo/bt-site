// 後台首頁加「申請」那一組的邏輯。
//
// 2026-10-15 後台拆成四個資料夾（見 README「後台的四個資料夾」）：
// 對外的東西在 admin/site/、兩本護照的格子在 admin/passports/、人與權限在 admin/people/。
// 這一支只剩申請：表單清單 → 一份表單 → 一題，加審核、簽到、行前信。
// 狀態只有一個 S，畫面只從 S 產生。**不在事件處理裡直接改 DOM**，一律改 S 再 render() ——
// 兩條路徑會分岔，而分岔是安靜的（這個 repo 反覆踩到的同一件事）。
import * as AUTH from "../../shared/auth.js";
import { navHTML, featuresFor, tx } from "../../shared/nav.js";
import * as D from "./data.js";
import * as UI from "./ui.js";
import { T, lang, setLang, pickLang, STORE_KEY } from "./strings.js";

let S = {
  user: null, me: null, down: false, busy: false, msg: "",
  view: "home",            // home | list | form | question | apps | checkin | notice
  forms: [], teams: [],
  form: null, questions: [], qEditing: null,
  // 批 4
  apps: [], sel: new Set(), filter: "all", pending: [],
  // 首頁那一句「還有 N 封信沒寄出去」（2026-10-15）。一定要有初始值。
  pendingAll: [],
  // 首頁三塊要的數字（2026-10-19，批 2）。null 是還沒載；每一項載不到是 null，不是 0。
  todo: null,
  // 批 6
  noticeTo: new Set(["accepted"]),
  // 開新表單的內嵌表單（2026-10-19，批 3）。null 是收起來，物件是展開著、裡面是填到一半的值。
  newForm: null,
};

const root = () => document.getElementById("bt-root");
// Director 與 President 改得動，一般幹部唯讀（2026-09-07 拍板的三層）。
// **這只是畫面。真正的門在資料庫的 RLS**（is_director_of），
// 前端少畫一顆按鈕不是安全機制。
// 2026-10-24 起看指派：對任何一個 apps: 工作區是「改」或「管」的人才有「開新表單」；
// Co-President 與 Senior Adviser（senior）看得到所有 team 的表單與 team 選單。
// 2026-10-30 起申請是整個 BT 一個工作區 apps：改得動的人是被派成改或管的人（senior 靠職級）。
const canEdit = () => UI.canEditWs(S.me, "apps");
const isPres = () => !!S.me && !!S.me.senior;

function render() {
  const el = root();
  if (!el) return;
  // ⚠ **頂欄要畫在 #bt-root 裡面，不要 insertAdjacentHTML 到 <body>。**
  // 2026-09-10 Paul：「這兩個怎麼不平行」——頂欄跟底下的分頁列左右對不齊。
  // 原因就是這件事：#bt-root 有自己的左右內距，畫在 body 上的頂欄吃不到它，
  // 於是同一條頂欄在四個頁面各自停在不同的位置。全部畫進 #bt-root 就對齊了。
  // 順帶一提，畫在裡面之後也不用再自己去 remove 上一次那條 —— innerHTML 蓋掉了。
  const nav = S.me ? navHTML({ current: "admin", role: S.me.role, name: S.me.name }) : "";

  if (S.down) { el.innerHTML = UI.shellHTML(nav, "", UI.downHTML(S.downErr)); return; }
  if (!S.user) { location.replace("../app/?next=admin"); return; }
  if (!S.me || S.me.role !== "cadre") { el.innerHTML = UI.shellHTML(nav, "", UI.notCadreHTML()); return; }

  let body;
  if (S.view === "checkin" && S.form) {
    body = UI.checkinHTML(S.form, S.apps, canEdit(), S.msg, S.busy);
  } else if (S.view === "notice" && S.form) {
    body = UI.noticeHTML(S.form, S.apps, S.noticeTo, S.msg, S.busy);
  } else if (S.view === "apps" && S.form) {
    body = UI.appsHTML(S.form, S.apps, S.questions, canEdit(),
      S.sel, S.filter, S.pending, S.msg, S.busy);
  } else if (S.view === "question") {
    body = UI.questionHTML(S.qEditing, S.msg, S.busy);
  } else if (S.view === "form" && S.form) {
    body = UI.formHTML(S.form, S.questions, canEdit(),
      S.me.board === "president" ? S.teams : [], S.msg, S.busy);
  } else if (S.view === "members" && S.mp) {
    body = UI.membersPanelHTML(S.mp, S.msg, S.busy);
  } else if (S.view === "list") {
    body = UI.listHTML(S.forms, canEdit(), S.msg, isPres(), S.newForm,
      S.teams.length ? S.teams : UI.TEAM_LABELS, S.me.team ? String(S.me.team).split(/[,、;；]/)[0].trim() : "", S.busy,
      UI.mpItems(S.me, "apps", S.workspaces));
  } else {
    // 首頁（批 1 先沿用目錄卡加待寄的信，批 2 換成三塊）。
    // 頂欄那幾項各是什麼（shared/nav.js 的 FEATURES 本來就有一句 desc，9-08 刪掉選單頁之後沒地方印；總覽印一次）。
    const features = featuresFor(S.me.role).map(f => ({ label: tx(f.label, lang()), desc: tx(f.desc, lang()), href: f.href }));
    body = UI.hubHTML(S.me, S.pendingAll, canEdit(), S.busy, S.forms, S.todo, features);
  }
  // 側欄亮哪一行：首頁亮「首頁」，其他全部算在「申請表」底下。
  // 側欄右邊的小數字：待審的申請、等核可的人。**只在 /admin/ 這一組算**（別組沒有 loadTodo），有才顯示。
  const t = S.todo || {};
  const counts = {
    forms: S.forms.reduce((n, f) => n + (f.counts ? f.counts.received : 0), 0),
    team: (t.team || []).length,
    stories: (t.stories || []).filter(r => !r.story_approved).length,
  };
  el.innerHTML = UI.shellHTML(nav, UI.railHTML("forms", S.view === "home" ? "home" : "forms", S.me, counts), body);
  UI.afterRender(S, el);
}

// 開頁連不上先自己再試一次（兩秒後），第二次才顯示「資料庫休眠中」。
// 2026-10-23 盤點時 Settings 一次載入失敗就整頁變成那一句，重開就好；一次抖動不該讓人去寄信求救。
function retryBoot() { return new Promise(r => setTimeout(() => r(boot(true)), 2000)); }
async function boot(retried) {
  try {
    const who = await AUTH.currentUserDetailed();
    if (who.offline) { if (!retried) return retryBoot(); S.down = true; render(); return; }
    S.user = who.user;
    if (!S.user) { render(); return; }
    // ★ 這幾件事同時發，不要排隊。loadForms() 不需要知道我是誰
    //（它沒有參數，擋不擋得到是 RLS 的事），所以沒有理由等 loadMe 回來。
    // 省下來的是一趟往返（實測到 Supabase 一趟熱的約 100 到 240 毫秒）。
    // 非幹部誤按進來會多發這幾個查詢，RLS 會擋掉，回來是空的。
    // 待寄的信載不到不該讓整頁打不開，所以它失敗就當成 0 封。
    const [me, forms, pendingAll] = await Promise.all([
      D.loadMe(S.user.id), D.loadForms(), D.loadPendingAll().catch(() => [])]);
    S.me = me;
    if (!S.me || S.me.role !== "cadre") { render(); return; }
    S.forms = forms; S.pendingAll = pendingAll;
    S.teams = await D.loadTeams().catch(() => []);
    // 首頁三塊的數字。載不到不該讓整頁打不開，所以接住；每一項自己也會接住。
    S.todo = await D.loadTodo(S.me).catch(() => ({}));
    S.workspaces = await D.loadWorkspaces().catch(() => []);
    // 網址帶 #forms 就直接開申請表清單（側欄從別組連過來、README 的連結都用這個）。
    if (location.hash.slice(1) === "forms" || new URLSearchParams(location.search).get("tab") === "forms") S.view = "list";
    render();
  } catch (e) {
    // 票已經不能用了（帳號被停用、或伺服器換過簽章金鑰）。開機改用本機 session
    // 之後就沒有人在開機時問伺服器「這個帳號還有效嗎」了，所以這種人會一路走到
    // 這裡才被擋下來（理由與取捨見 shared/auth.js 的 currentUserDetailed）。
    // **不能讓他看到「資料庫休眠中」**：資料庫是好的，是他的票沒了，
    // 而那個畫面不會叫他重新登入，他會一直重整。
    // 先清掉本機那張壞票再走，不清的話下一頁讀出來的還是它。
    if (AUTH.sessionGone(e)) { await AUTH.signOut(); location.replace("../app/?next=admin"); return; }
    console.error("/admin/ 載入失敗：", e);
    if (!retried) return retryBoot();
    S.downErr = String(e && e.message || e); S.down = true; render();
  }
}

// 側欄的兩個分頁：首頁、申請表清單。上一頁與網址列改 # 也走這裡。
async function openTab(t) {
  S.view = t === "home" ? "home" : "list"; S.msg = ""; S.sel = new Set(); await reloadList(); render();
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
  } catch (e) { S.busy = false; S.msg = T("err.open") + D.says(e); }
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
  } catch (e) { S.busy = false; S.msg = T("err.open") + D.says(e); }
  render();
}

// 改完狀態之後重讀。**連 pending 一起重讀** ——
// 不然「還有 N 封沒寄出去」那一塊會停在改之前的數字。
async function refreshApps() {
  S.apps = await D.loadApplications(S.form.id);
  S.pending = await D.loadPending(S.form.id);
}

async function reloadList() {
  try {
    S.forms = await D.loadForms();
    S.pendingAll = await D.loadPendingAll().catch(() => []);
    S.todo = await D.loadTodo(S.me).catch(() => S.todo || {});
  } catch (e) { S.msg = T("err.list") + D.says(e); }
}

// ── 成員分頁（2026-10-23，第三次重整批 3）────────────────────────────
// 對這個工作區是「管」的人在這裡加人、改等級、移出，不用進 /admin/people/。門在 workspace_members / assign / unassign 裡。
// backView：按「回上一頁」回到哪個畫面。
async function openMembers(ws, name, backView) {
  S.busy = true; S.msg = ""; render();
  try {
    const [rows, cadres] = await Promise.all([D.loadMembers(ws), D.loadCadres().catch(() => [])]);
    S.mp = { ws, name, rows: rows || [], cadres, meId: S.user.id, q: "", level: "view", backView: backView || (S.mp && S.mp.backView) || S.view };
    S.view = "members"; S.busy = false;
  } catch (e) { S.busy = false; S.msg = T("err.mpLoad") + D.says(e); }
  render();
}
async function reloadMembers(msg) {
  S.msg = msg || "";
  try { S.mp.rows = await D.loadMembers(S.mp.ws) || []; } catch (e) { S.msg = T("err.mpLoad") + D.says(e); }
  S.busy = false; render();
}

document.addEventListener("click", async e => {
  const b = e.target.closest("[data-act]");
  if (!b) return;
  const act = b.dataset.act;
  const id = b.dataset.id;

  if (act === "retry") { location.reload(); return; }
  if (act === "ask-cancel") { UI.cancelAsk(S, root()); return; }
  // ── 成員分頁（2026-10-23，第三次重整批 3）──
  if (act === "members-open") { await openMembers(b.dataset.ws, b.dataset.name); return; }
  if (act === "members-back") { S.view = (S.mp && S.mp.backView) || "list"; S.msg = ""; render(); return; }
  // 多選加人的 chip、全勾、全取消（2026-10-24）：改 pk 再重畫。打字與勾選走 input / change。
  if (["pk-team", "pk-all", "pk-none", "pk-untick"].includes(act) && S.mp && S.view === "members") {
    S.mp.pk = UI.pkReduce(S.mp.pk, S.mp.cadres, S.mp.rows.map(r => r.user_id), b); render(); return;
  }
  if (act === "members-assign" && S.mp) {
    // 一次加一批（2026-10-24）：勾起來的人每一個送一支 assign()（同一道門 can_manage），同時送，30 個人一秒內；沒有新的資料庫函式。
    const ws = S.mp.ws, pk = S.mp.pk || {}, level = pk.level || "view";
    const ids = UI.pkPicked(S.mp.cadres, S.mp.rows.map(r => r.user_id), pk);
    if (!ids.length) { S.msg = T("err.mpPick"); render(); return; }
    S.busy = true; S.msg = ""; render();
    const out = await Promise.all(ids.map(id => D.assign(id, ws, level).then(() => null, e => ({ id, e }))));
    const failed = out.filter(Boolean), done = ids.filter(id => !failed.some(f => f.id === id));
    S.mp.pk = Object.assign({}, pk, { q: "", ticked: failed.map(f => f.id) });
    if (done.length) {
      // 復原移出的是這一批那 N 個人，不多不少。
      const undo = UI.batchUndo(done, id => D.unassign(id, ws));
      S.undo = async () => { S.busy = true; render(); try { const n = await undo(); await reloadMembers(T("msg.mpRemovedN", { n })); } catch (e) { S.busy = false; S.msg = T("err.mpRemove") + D.says(e); render(); } };
    }
    if (failed.length) {
      const names = failed.map(f => UI.mpName(S.mp.cadres.find(c => c.id === f.id) || {})).join(T("punct.list"));
      try { S.mp.rows = await D.loadMembers(ws) || []; } catch (x) { /* 下面的錯誤訊息比較重要 */ }
      S.busy = false; S.msg = T("err.mpSome") + names + T("punct.colon") + D.says(failed[0].e); render(); return;
    }
    await reloadMembers(T("msg.mpAssignedN", { n: done.length, level: T("level." + level) }));
    return;
  }
  if (act === "members-unassign" && S.mp) {
    const r = S.mp.rows.find(x => x.user_id === b.dataset.id); if (!r) return;
    if (UI.needAsk(S, b, T("confirm.mpRemove", { name: UI.mpName(r) }))) return;
    const ws = S.mp.ws, was = r.level;
    S.busy = true; S.msg = ""; render();
    try {
      await D.unassign(r.user_id, ws);
      S.undo = async () => { S.busy = true; render(); try { await D.assign(r.user_id, ws, was); await reloadMembers(T("msg.mpAssigned", { name: UI.mpName(r), level: T("level." + was) })); } catch (e) { S.busy = false; S.msg = T("err.mpAssign") + D.says(e); render(); } };
      await reloadMembers(T("msg.mpRemoved", { name: UI.mpName(r) }));
    } catch (e) { S.busy = false; S.msg = T("err.mpRemove") + D.says(e); render(); }
    return;
  }

  if (act === "lang") { switchLang(b.dataset.lang); return; }
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
    } catch (err) { S.busy = false; S.msg = T("err.checkin") + D.says(err); }
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
    if (!sub || !body) { S.msg = T("err.noticeBoth"); render(); return; }
    const to = [...S.noticeTo];
    const n = S.apps.filter(a => S.noticeTo.has(a.status)).length;
    // ⚠ 這一步會一次寄信給一群未成年人，而且收不回來。
    if (UI.needAsk(S, b, T("confirm.notice", { n, sub }))) return;
    S.busy = true; S.msg = ""; render();
    try {
      const made = await D.sendNotice(S.form.id, to, sub, body);
      let note = "";
      try {
        const r = await D.sendMail();
        note = r.failed ? T("mail.sentFailed", { sent: r.sent, failed: r.failed }) : T("mail.sentN", { n: r.sent });
      } catch (me) { note = T("mail.notSent") + D.says(me); }
      S.pending = await D.loadPending(S.form.id);
      S.busy = false; S.msg = T("msg.queued", { n: made, note });
    } catch (err) { S.busy = false; S.msg = T("err.send") + D.says(err); }
    render();
    return;
  }

  // 側欄：同一組裡換分頁不重新載入頁面，只改 S 再 render；網址的 # 跟著改，重新整理還在同一頁。
  if (act === "tab") {
    e.preventDefault();
    const t = b.dataset.t === "home" ? "home" : "forms";
    history.pushState(null, "", "#" + t);
    await openTab(t); return;
  }

  // 首頁那顆「現在寄出去」：把所有還沒寄的信都寄掉（2026-10-15）。
  // send_pending_mail() 的門在資料庫（is_cadre），寄的是全部待寄的信，不分表單。
  if (act === "send-mail-all") {
    S.busy = true; S.msg = ""; render();
    try {
      const r = await D.sendMail();
      S.pendingAll = await D.loadPendingAll().catch(() => []);
      S.busy = false;
      S.msg = r.failed ? T("msg.sentSome", { sent: r.sent, failed: r.failed }) : T("msg.sent", { n: r.sent });
    } catch (err) { S.busy = false; S.msg = T("err.send") + D.says(err); }
    render();
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
    const word = UI.decideWord(status);
    // ⚠ **這一步會寄信給未成年人，而且收不回來。** 所以要確認，
    // 而且確認的句子裡要有人數與動作，不是一句「確定嗎」。
    if (UI.needAsk(S, b, T("confirm.decide", { n: ids.length, word }))) return;
    S.busy = true; S.msg = ""; render();
    try {
      const n = await D.decide(ids, status);
      // 改完立刻試著把信寄出去。失敗不影響狀態（狀態已經改好了），
      // 只會留在 outbox 裡，畫面上看得到。
      let mailNote = "";
      try {
        const r = await D.sendMail();
        mailNote = r.sent ? T("mail.sentNote", { n: r.sent }) : "";
        if (r.failed) mailNote += T("mail.failedNote", { n: r.failed });
      } catch (me) {
        mailNote = T("mail.notSent") + D.says(me);
      }
      S.sel = new Set();
      await refreshApps();
      S.busy = false;
      S.msg = T("msg.decided", { n, word, note: mailNote });
    } catch (err) {
      S.busy = false; S.msg = T("err.change") + D.says(err);
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
      S.msg = r.failed ? T("msg.sentSome", { sent: r.sent, failed: r.failed }) : T("msg.sent", { n: r.sent });
    } catch (err) {
      S.busy = false; S.msg = T("err.send") + D.says(err);
    }
    render();
    return;
  }

  // 開新表單：按一下在清單上面展開內嵌表單，填完按「建立」才真的開（2026-10-19 起不再用瀏覽器原生的那個名字對話框）。
  if (act === "new-form") {
    // 表單上的 team 只是標籤（2026-10-30 起申請不分 team）：預設拿自己勾的第一個 team，沒有就清單第一個，再沒有就空著也能開。
    const team = (S.me.team ? String(S.me.team).split(/[,、;；]/)[0].trim() : "") || (S.teams[0] || "") || "";
    S.newForm = { title: "", team, kind: "program" }; S.msg = ""; render();
    const el = document.getElementById("nf-title"); if (el) el.focus();
    return;
  }
  if (act === "new-form-cancel") { S.newForm = null; S.msg = ""; render(); return; }
  if (act === "new-form-save") {
    const val = i => { const el = document.getElementById(i); return el ? el.value.trim() : ""; };
    S.newForm = { title: val("nf-title"), team: val("nf-team") || (S.newForm && S.newForm.team) || "", kind: val("nf-kind") || "program" };
    if (!S.newForm.title) { S.msg = T("err.formName"); render(); return; }
    if (!S.newForm.team) { S.msg = T("err.pickTeam"); render(); return; }
    S.busy = true; S.msg = ""; render();
    try {
      const newId = await D.createForm(S.newForm.team, S.newForm.title, S.newForm.kind);
      S.busy = false; S.newForm = null;
      await openForm(newId);
    } catch (err) { S.busy = false; S.msg = T("err.create") + D.says(err); render(); }
    return;
  }

  if (act === "save-form") {
    const patch = readForm();
    if (!patch.title) { S.msg = T("err.formName"); render(); return; }
    // 開放之前先擋一次：一份沒有題目的表單開出去，申請人看到的是一個空表單，
    // 而他會以為是網站壞了。**這是唯一一個前端擋得住、而且該擋的狀態**。
    if (patch.status === "open" && S.questions.length === 0) {
      S.msg = T("err.noQuestions"); render(); return;
    }
    S.busy = true; S.msg = ""; render();
    try {
      await D.saveForm(S.form.id, patch);
      const { form, questions } = await D.loadForm(S.form.id);
      S.form = form; S.questions = questions; S.busy = false; S.msg = T("msg.saved");
    } catch (err) { S.busy = false; S.msg = T("err.save") + D.says(err); }
    render();
    return;
  }

  if (act === "del-form") {
    const n = S.forms.find(f => f.id === S.form.id);
    const got = n && n.counts.total;
    if (UI.needAsk(S, b, got ? T("confirm.delFormApps", { n: got }) : T("confirm.delForm"))) return;
    S.busy = true; render();
    try {
      await D.deleteForm(S.form.id);
      S.busy = false; S.view = "list"; S.form = null; S.msg = T("msg.deleted");
      await reloadList();
    } catch (err) { S.busy = false; S.msg = T("err.delete") + D.says(err); }
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
    if (!label) { S.msg = T("err.qEmpty"); render(); return; }
    const type = document.getElementById("qtype").value;
    const options = document.getElementById("qopts").value
      .split("\n").map(x => x.trim()).filter(Boolean);
    if ((type === "single" || type === "multi") && options.length < 2) {
      S.msg = T("err.qOpts"); render(); return;
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
    } catch (err) { S.busy = false; S.msg = T("err.save") + D.says(err); }
    render();
    return;
  }

  if (act === "q-del") {
    if (UI.needAsk(S, b, T("confirm.delQ"))) return;
    S.busy = true; render();
    try {
      await D.deleteQuestion(id);
      const r = await D.loadForm(S.form.id);
      S.questions = r.questions; S.busy = false; S.msg = "";
    } catch (err) { S.busy = false; S.msg = T("err.delete") + D.says(err); }
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
    } catch (err) { S.busy = false; S.msg = T("err.reorder") + D.says(err); }
    render();
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
// 瀏覽器上一頁、或自己在網址列改 #分頁：跟著換分頁（2026-10-23 盤點 F3）。側欄點分頁是 pushState，所以上一頁回得去。
window.addEventListener("popstate", () => { if (S.me) { S.msg = ""; openTab(location.hash.slice(1)); } });

// 成員分頁的等級下拉（2026-10-23 批 3）：改了就送，toast 帶復原（送回原等級）。
document.addEventListener("change", async e => {
  // 多選加人（2026-10-24）：勾一個人、換等級，改 pk 再重畫。
  const pkEl = e.target.closest('[data-act="pk-tick"],[data-act="pk-level"]');
  if (pkEl && S.mp && S.view === "members") { S.mp.pk = UI.pkReduce(S.mp.pk, S.mp.cadres, S.mp.rows.map(r => r.user_id), pkEl); render(); return; }
  const el = e.target.closest('[data-act="members-level"]');
  if (!el || !S.mp || S.view !== "members") return;
  const r = S.mp.rows.find(x => x.user_id === el.dataset.id); if (!r) return;
  const ws = S.mp.ws, was = r.level, level = el.value;
  if (was === level) return;
  S.busy = true; S.msg = ""; render();
  try {
    await D.assign(r.user_id, ws, level);
    S.undo = async () => { S.busy = true; render(); try { await D.assign(r.user_id, ws, was); await reloadMembers(T("msg.mpLevel", { name: UI.mpName(r), level: T("level." + was) })); } catch (e) { S.busy = false; S.msg = T("err.mpAssign") + D.says(e); render(); } };
    await reloadMembers(T("msg.mpLevel", { name: UI.mpName(r), level: T("level." + level) }));
  } catch (e) { S.busy = false; S.msg = T("err.mpAssign") + D.says(e); render(); }
});

// 多選加人（2026-10-24）：找名字是邊打邊篩，重畫後把游標放回去；在那一塊裡按 Enter 就是按「加 N 個人」（空白鍵勾選是瀏覽器原生的）。
document.addEventListener("input", e => {
  const el = e.target.closest('[data-act="pk-q"],[data-act="pk-mq"]');
  if (!el || !S.mp || S.view !== "members") return;
  S.mp.pk = UI.pkReduce(S.mp.pk, S.mp.cadres, S.mp.rows.map(r => r.user_id), el); render(); UI.pkRefocus(el.dataset.ns, el.dataset.act === "pk-mq" ? "mq" : "q");
});
document.addEventListener("keydown", e => {
  if (e.key !== "Enter") return;
  const box = e.target.closest(".picker"); if (!box) return;
  const go = box.querySelector('[data-act="members-assign"],[data-act="ws-assign"]'); if (!go || go.disabled) return;
  e.preventDefault(); go.click();
});
