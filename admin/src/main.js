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
  // 行銷需求單（2026-10-31，第二版 2026-11-09）：requests 是 loadRequests() 回的（RLS 決定看得到哪些）；rqDraft 填到一半的表單（也存在 localStorage）；
  // rqF 佇列的篩選；rqSel 打開的那一張；rqAssignees 「接的人」下拉的名單（需求工作區的成員）。
  requests: null, rqDraft: null, rqF: { status: "open", mine: "", q: "" }, rqSel: null, rqAssignees: [], cadres: [],
  // 活動上架（2026-11-01）：events 是 loadEvents() 回的；evSel 打開的那一場（slug）；evDraft 開活動那張表單填到一半的值；evSigned 那一場的報名數。
  events: null, evSel: null, evDraft: null, evSigned: null,
  // 會議（2026-11-02）：meetings 是 loadMeetings() 回的；mtSel 打開的那一場；mtDraft 表單填到一半（含勾人的 pk）。
  meetings: null, mtSel: null, mtDraft: null,
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
  } else if (S.view === "meetings") {
    body = UI.meetingsListHTML(S.meetings || [], S.me, UI.mtScopes(S.me, S.teams), S.mtDraft, S.cadres, S.msg, S.busy);
  } else if (S.view === "meeting" && S.mtSel) {
    const m = (S.meetings || []).find(x => x.id === S.mtSel);
    const scopes = UI.mtScopes(S.me, S.teams);
    body = m ? UI.meetingHTML(m, S.me, S.cadres, scopes.includes(m.scope), scopes, S.mtDraft, S.msg, S.busy)
             : UI.emptyHTML(T("mt.notFound"), "", { act: "mt-back", label: T("mt.back") });
  } else if (S.view === "events") {
    body = UI.eventsListHTML(S.events || [], S.me, S.teams, S.evDraft, S.msg, S.busy, evTeams());
  } else if (S.view === "event" && S.evSel) {
    const ev = (S.events || []).find(e => e.slug === S.evSel);
    body = ev ? UI.eventEditHTML(ev, ev.form_id ? (S.forms || []).find(f => f.id === ev.form_id) || null : null, S.evSigned, S.me, S.msg, S.busy)
              : UI.emptyHTML(T("ev.notFound"), T("ev.notFoundHint"), { act: "ev-back", label: T("ev.back") });
  } else if (S.view === "request") {
    if (!S.rqDraft) S.rqDraft = rqDraftLoad();
    body = UI.requestPageHTML(S.me, UI.rqMine(S.requests, S.me), S.rqDraft, S.msg, S.busy, S.cadres, UI.rqToday());
  } else if (S.view === "requests") {
    body = UI.requestsQueueHTML(S.requests || [], S.cadres, S.rqF, S.rqSel, UI.canEditWs(S.me, "custom:marketing-requests"), S.msg, S.busy,
      { assignees: S.rqAssignees, today: UI.rqToday(), me: S.me });
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
  // 側欄亮哪一行：總覽、需求單那兩頁各自亮，其他全部算在「申請表」底下。
  const tab = S.view === "home" ? "home" : S.view === "request" ? "request" : S.view === "requests" ? "requests" : (S.view === "events" || S.view === "event") ? "events" : (S.view === "meetings" || S.view === "meeting") ? "meetings" : "forms";
  el.innerHTML = UI.shellHTML(nav, UI.railHTML("forms", tab, S.me, counts), body);
  UI.afterRender(S, el);
}

// 側欄與頂欄先畫（2026-11-06）：知道我是誰就先把外殼畫出來，內容那一格放骨架，資料回來 render() 整個換掉。
// 不等資料的理由：外殼只要 S.me，而 S.me 從分頁快取拿幾乎不用等。這一頁的「慢」實測全部在資料那一半。
function paintShell() {
  const el = root();
  if (!el || !S.me) return;
  const nav = navHTML({ current: "admin", role: S.me.role, name: S.me.name });
  el.innerHTML = UI.shellHTML(nav, UI.railHTML("forms", "home", S.me, {}), UI.skeletonHTML());
  UI.afterRender(S, el);
  // 線上有沒有更新的版本（GitHub Pages 快取 10 分鐘，四個資料夾各一份側欄，哪一份先過期哪一份先換新；
  // Paul 2026-11-06 遇到的「側欄新項目重整就不見」就是這個）。讀到不一樣就在左下角提醒重整。
  UI.checkVersion("../");
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
    // ★ 2026-11-06 後台速度：三段。
    //   1. 表單與待寄的信先發出去（不需要知道我是誰，RLS 決定看得到哪些）；
    //   2. 等「我是誰」回來（shared/auth.js 的 whoAmI：profiles 與 my_access 同時查，同一個分頁十分鐘內直接用快取，
    //      所以從別的後台頁換過來這一步幾乎不花時間），側欄與頂欄**立刻畫**，內容先是骨架；
    //   3. 首頁要的六樣東西一起等（teams、todo、workspaces、requests、events、meetings），改前是一個接一個 await，
    //      每個 300 毫秒排隊，實測總覽 3.6 秒才有畫面。載不到的各自接住，不讓整頁打不開。
    const formsP = D.loadForms(), pendingP = D.loadPendingAll().catch(() => []);
    formsP.catch(() => {});
    S.me = await D.loadMe(S.user.id);
    if (!S.me || S.me.role !== "cadre") { render(); return; }
    paintShell();
    UI.bindAutosave(root(), onAutosave);
    const [forms, pendingAll, teams, todo, workspaces, requests, events, meetings] = await Promise.all([
      formsP, pendingP,
      D.loadTeams().catch(() => []),
      D.loadTodo(S.me).catch(() => ({})),
      D.loadWorkspaces().catch(() => []),
      D.loadRequests().catch(() => null),
      D.loadEvents().catch(() => null),
      D.loadMeetings().catch(() => null),
    ]);
    S.forms = forms; S.pendingAll = pendingAll; S.teams = teams; S.todo = todo; S.workspaces = workspaces;
    S.requests = requests; if (S.todo) S.todo.requests = S.requests;
    S.events = events; if (S.todo) S.todo.events = S.events;
    S.meetings = meetings; if (S.todo) S.todo.meetings = S.meetings;
    // 提醒信的退路（2026-11-02）：開頁叫一次 tick_mail()，Resend 沒設好也不會讓頁面壞。
    D.tickMail().catch(() => {});
    // 網址帶 #forms 就直接開申請表清單（側欄從別組連過來、README 的連結都用這個）。
    if (location.hash.slice(1) === "forms" || new URLSearchParams(location.search).get("tab") === "forms") S.view = "list";
    else if (/^(requests?|events|meetings)(\/|$)/.test(location.hash.slice(1))) { await openTab(location.hash.slice(1)); return; }
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
// 能開活動的 team：senior 全部；其他人是自己資源工作區「管」的那幾個 team（門在資料庫的 create_event）。
function evTeams() {
  if (!S.me) return [];
  if (S.me.senior) return (S.teams && S.teams.length ? S.teams : UI.TEAM_LABELS);
  return Object.entries(S.me.ws || {}).filter(([id, lv]) => id.startsWith("res:") && lv === "manage").map(([id]) => id.slice(4));
}
async function reloadEvents(slug) {
  try {
    S.events = await D.loadEvents();
    if (S.todo) S.todo.events = S.events;
    if (slug) {
      const ev = (S.events || []).find(e => e.slug === slug);
      S.evSigned = ev && ev.form_id ? await D.loadSignedUp(ev.form_id).catch(() => null) : null;
      if (ev && ev.form_id && !(S.forms || []).some(f => f.id === ev.form_id)) S.forms = await D.loadForms().catch(() => S.forms);
    }
  } catch (e) { S.msg = T("err.evLoad") + D.says(e); }
}
function readEvent() {
  const val = id => { const el = document.getElementById(id); return el ? el.value.trim() : ""; };
  const chk = id => { const el = document.getElementById(id); return !!(el && el.checked); };
  const iso = v => v ? new Date(v).toISOString() : "";
  return { title_zh: val("ev-tzh"), title_en: val("ev-ten"), summary_zh: val("ev-szh"), summary_en: val("ev-sen"), body_zh: val("ev-bzh"), body_en: val("ev-ben"),
    starts_at: iso(val("ev-starts")), ends_at: iso(val("ev-ends")), place: val("ev-place"), capacity: Number(val("ev-cap") || 0), cover_url: val("ev-cover"), cover_consent: chk("ev-consent") };
}
async function reloadMeetings() {
  try { S.meetings = await D.loadMeetings(); if (S.todo) S.todo.meetings = S.meetings; if (!S.cadres.length) S.cadres = await D.loadCadres().catch(() => []); }
  catch (e) { S.msg = T("err.mtLoad") + D.says(e); }
}
function readMeeting() {
  const val = id => { const el = document.getElementById(id); return el ? el.value.trim() : ""; };
  const iso = v => v ? new Date(v).toISOString() : "";
  const pk = (S.mtDraft && S.mtDraft.pk) || { ticked: [] };
  return { scope: val("mt-scope") || "board", required: val("mt-required") !== "0", title: val("mt-title"), starts_at: iso(val("mt-starts")), ends_at: iso(val("mt-ends")), agenda: val("mt-agenda"), doc_url: val("mt-doc"), attendees: UI.pkPicked(S.cadres, [], pk, true) };
}
async function openTab(t) {
  // 會議（2026-11-02）：#meetings 清單，#meetings/<id> 一場。
  const mt = /^meetings(?:\/([0-9a-f-]{36}))?$/.exec(t || "");
  if (mt) {
    S.view = mt[1] ? "meeting" : "meetings"; S.mtSel = mt[1] || null; S.mtDraft = null; S.msg = "";
    await reloadMeetings();
    if (mt[1]) { const m = (S.meetings || []).find(x => x.id === mt[1]); if (m) S.mtDraft = { pk: { ticked: (m.attendees || []).map(a => a.user_id), q: "", mq: "", teams: [], level: "view" } }; }
    render(); return;
  }
  // 活動上架（2026-11-01）：#events 清單，#events/<代號> 一場。
  const ev = /^events(?:\/([a-z0-9-]+))?$/.exec(t || "");
  if (ev) {
    S.view = ev[1] ? "event" : "events"; S.evSel = ev[1] || null; S.msg = "";
    await reloadEvents(ev[1]); render(); return;
  }
  // 行銷需求單（2026-10-31）：#request 是送單那一頁（#request/<id> 只是信裡的直達，一樣開那一頁），#requests 是佇列，#requests/<id> 打開那一張。
  const m = /^(requests?)(?:\/([0-9a-f-]{36}))?$/.exec(t || "");
  if (m) {
    // 沒被派進需求工作區的人（RLS 只會給他自己的單）直接開他自己那一頁。
    const queueOk = UI.canSee(UI.ITEMS.find(i => i.key === "requests"), S.me);
    S.view = m[1] === "request" || !queueOk ? "request" : "requests"; S.msg = ""; S.rqSel = m[1] === "requests" && queueOk ? (m[2] || null) : null;
    await reloadRequests(); render(); return;
  }
  S.view = t === "home" ? "home" : "list"; S.msg = ""; S.sel = new Set(); await reloadList(); render();
}
async function reloadRequests() {
  try {
    S.requests = await D.loadRequests();
    if (S.todo) S.todo.requests = S.requests;
    // 名單：送單頁選負責人、兩頁印名字都要。佇列另外要「接的人」那一份（需求工作區的成員）。
    if (!S.cadres.length) S.cadres = await D.loadCadres().catch(() => []);
    if (S.view === "requests") S.rqAssignees = await D.loadAssignees().catch(() => []);
  } catch (e) { S.msg = T("err.rqLoad") + D.says(e); }
}
// 送單的表單讀成一個草稿物件（欄位名單只在這裡一份）。可以多列的三塊照畫面上現在有幾列讀。
function readRequest() {
  const val = id => { const el = document.getElementById(id); return el ? el.value : ""; };
  const count = pre => document.querySelectorAll(`[id^="${pre}"]`).length;
  const d = UI.rqBlank();
  Object.assign(d, {
    kind: (S.rqDraft && S.rqDraft.kind) || "",
    title: val("rq-title"), owner_team: val("rq-owner-team"), owner_id: val("rq-owner"), goal_cta: val("rq-goal"),
    platforms: UI.RQ_PLATFORMS.filter(p => { const el = document.getElementById("rq-pf-" + p); return el && el.checked; }),
    platform_other: val("rq-pf-note"), key_line: val("rq-key"), draft: val("rq-draft"), draft_doc_url: val("rq-doc"),
    publish_on: val("rq-publish"), other_notes: val("rq-notes"),
    must: Array.from({ length: count("rq-must-text-") }, (_, i) => ({ text: val("rq-must-text-" + i), confirmed_by: val("rq-must-by-" + i) })),
    refs: Array.from({ length: count("rq-ref-url-") }, (_, i) => ({ url: val("rq-ref-url-" + i), note: val("rq-ref-note-" + i) })),
    shots: Array.from({ length: count("rq-shot-who-") }, (_, i) => ({ who: val("rq-shot-who-" + i), what: val("rq-shot-what-" + i), seconds: val("rq-shot-sec-" + i), note: val("rq-shot-note-" + i) })),
    closing: { who: val("rq-close-who"), seconds: val("rq-close-sec"), note: val("rq-close-note") },
  });
  // 負責人不在選的 team 裡（剛換 team）就清掉，不然送出去的是上一個 team 的人。
  if (d.owner_id && !(S.cadres || []).some(p => p.id === d.owner_id && String(p.team || "").split(/[,、;；]/).map(x => x.trim()).includes(d.owner_team))) d.owner_id = "";
  return d;
}
// 草稿存在 localStorage（Paul 的規格：送出之前都留著）。讀寫都包 try：私密瀏覽或被擋的時候照樣能填，只是不留。
function rqDraftLoad() {
  try { const raw = localStorage.getItem(UI.rqDraftKey(S.me)); if (raw) return Object.assign(UI.rqBlank(), JSON.parse(raw)); } catch (x) { /* 沒有就是空白表單 */ }
  return UI.rqBlank();
}
function rqDraftSave() { try { localStorage.setItem(UI.rqDraftKey(S.me), JSON.stringify(S.rqDraft)); } catch (x) { /* 存不了就算了 */ } }
function rqDraftClear() { try { localStorage.removeItem(UI.rqDraftKey(S.me)); } catch (x) { /* 同上 */ } }

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

// ── 自動儲存（2026-11-06，Paul：「每一格都像 Workspaces 那一頁一樣，改了就存」）──
// bindAutosave 在 boot 掛一次；哪一格改了就把那一個容器整份讀出來、叫原本那顆「存起來」鈕用的資料層函式，資料層一行都沒改。
// 成功：更新 S 裡那一筆、小字變「存好了」、左下角 toast；**不重畫**（使用者可能還在打字，畫面上已經是他打的字）。
// 失敗（含驗證不過）：小字變「沒存進去」、toast 講原因，欄位留著不清。
// 同一格同一個值不重送（離開欄位又停 800 毫秒會觸發兩次）。
const dirty = UI.dirtyTracker();
const fieldVal = f => !f ? null : String(f.type || "").toLowerCase() === "checkbox" ? String(!!f.checked) : String(f.value);
async function onAutosave(act, box, field) {
  const id = box.dataset.id || "";
  const key = act + "|" + id + "|" + (field ? (field.name || field.id || "") : "*");
  const val = fieldVal(field);
  if (field && !dirty.changed(key, val)) return;
  const fail = msg => { UI.autosaveState(box, "failed"); UI.toast(msg); };
  UI.autosaveState(box, "saving");
  try {
    if (act === "save-form") {
      if (!S.form || S.form.id !== id) return;
      const patch = readForm();
      if (!patch.title) return fail(T("err.formName"));
      // 開放之前先擋一次：一份沒有題目的表單開出去，申請人看到的是一個空表單，而他會以為是網站壞了。
      // 下拉是選的不是打的，擋下來就把它撥回原本的狀態，不然畫面寫「開放中」其實還是草稿。
      if (patch.status === "open" && S.questions.length === 0) {
        const st = document.getElementById("fstatus"); if (st) st.value = S.form.status;
        return fail(T("err.noQuestions"));
      }
      await D.saveForm(id, patch);
      Object.assign(S.form, patch);
      const row = (S.forms || []).find(f => f.id === id); if (row) Object.assign(row, patch);
      dirty.mark(key, val); UI.autosaveState(box, "saved"); UI.toast(T("msg.saved"));
      // 狀態（草稿／開放／關閉）改了頁首的標籤與下拉底下那一句要跟著換，而下拉是選的不是打的，重畫不會吃掉誰打到一半的字。
      if (field && field.id === "fstatus") render();
      return;
    }
    if (act === "q-save") {
      if (!S.qEditing || S.qEditing.id !== id) return;
      const q = readQuestion();
      if (!q.label) return fail(T("err.qEmpty"));
      if ((q.type === "single" || q.type === "multi") && q.options.length < 2) return fail(T("err.qOpts"));
      await D.saveQuestion(id, q);
      Object.assign(S.qEditing, q);
      const row = (S.questions || []).find(x => x.id === id); if (row) Object.assign(row, q);
      dirty.mark(key, val); UI.autosaveState(box, "saved"); UI.toast(T("msg.saved"));
      return;
    }
    if (act === "rq-save") {
      const r = (S.requests || []).find(x => x.id === id); if (!r) return;
      const v = UI.formValues(box);
      // 接的人是另一支函式（set_request_assignee），改的是那一格才叫它。
      if (field && field.name === "assignee") {
        await D.setRequestAssignee(id, v.assignee || null);
        r.assignee = v.assignee || null;
      } else {
        // 「已發布」不走這裡：那會寄信，要按「標成已發布」那顆鈕先問一次（下拉裡本來就沒給選）。
        if (v.status === "published" && UI.rqStatus(r.status) !== "published") { const st = document.getElementById("rq-status"); if (st) st.value = UI.rqStatus(r.status); return fail(T("err.rqPublishBtn")); }
        await D.setRequestStatus(id, v.status || UI.rqStatus(r.status), v.reply != null ? v.reply : r.reply);
        r.status = v.status || UI.rqStatus(r.status); r.reply = v.reply != null ? v.reply : r.reply;
      }
      dirty.mark(key, val); UI.autosaveState(box, "saved"); UI.toast(T("msg.rqSaved"));
      return;
    }
    if (act === "ev-save") {
      const ev = (S.events || []).find(x => x.id === id); if (!ev) return;
      const patch = readEvent();
      if (!UI.evCoverOk(patch.cover_url)) return fail(T("err.evCover"));
      await D.saveEvent(id, patch);
      // 換了封面，資料庫會把同意改回沒勾（同意是對那一張照片的）。畫面跟著改，不然勾勾還在、資料庫卻是沒同意。
      if ((patch.cover_url || "") !== (ev.cover_url || "")) { patch.cover_consent = false; const c = document.getElementById("ev-consent"); if (c) c.checked = false; }
      Object.assign(ev, patch);
      dirty.mark(key, val); UI.autosaveState(box, "saved"); UI.toast(T("msg.evSaved"));
      return;
    }
    if (act === "mt-save") {
      const m = (S.meetings || []).find(x => x.id === id); if (!m) return;
      const d = readMeeting(); S.mtDraft = Object.assign({}, S.mtDraft, d);
      if (!d.title) return fail(T("err.mtTitle"));
      if (!d.starts_at || !d.ends_at) return fail(T("err.mtTime"));
      await D.saveMeeting(id, d);
      await reloadMeetings();
      dirty.mark(key, val); UI.autosaveState(box, "saved"); UI.toast(T("msg.mtSaved"));
      return;
    }
  } catch (e) {
    fail((act === "ev-save" ? T("err.evSave") : act === "mt-save" ? T("err.mtSave") : act === "rq-save" ? T("err.rqSave") : T("err.save")) + D.says(e));
  }
}
// 一場既有會議的勾人那一塊在 data-autosave 容器外面（勾了要先重畫，pk 的狀態在 S.mtDraft）；重畫完這裡補存一次。
function autosaveMeeting() {
  if (S.view !== "meeting" || !S.mtSel) return;
  const box = document.querySelector('[data-autosave="mt-save"]'); if (!box) return;
  onAutosave("mt-save", box, null);
}
// 一題的欄位讀出來（既有的題自動存、新題按「加這一題」都用這一份）。
function readQuestion() {
  const val = i => { const el = document.getElementById(i); return el ? el.value.trim() : ""; };
  const type = val("qtype");
  const options = val("qopts").split("\n").map(x => x.trim()).filter(Boolean);
  return {
    label: val("qlabel"),
    help: val("qhelp") || null,
    type,
    required: !!(document.getElementById("qreq") || {}).checked,
    // 短答與長答不留選項。留著的話改題型改回來會冒出舊選項，而那些選項沒有人記得是誰打的。
    options: (type === "single" || type === "multi") ? options : [],
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
    S.mp = { ws, name, rows: rows || [], cadres, meId: S.user.id, senior: !!S.me.senior, pk: null, backView: backView || (S.mp && S.mp.backView) || S.view };
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
  // ── 會議（2026-11-02）──
  if (act === "mt-open") { e.preventDefault(); history.pushState(null, "", "#meetings/" + id); await openTab("meetings/" + id); return; }
  if (act === "mt-back") { history.pushState(null, "", "#meetings"); await openTab("meetings"); return; }
  if (["pk-team", "pk-all", "pk-none", "pk-untick"].includes(act) && (S.view === "meetings" || S.view === "meeting")) {
    S.mtDraft = Object.assign({}, S.mtDraft, { pk: UI.pkReduce((S.mtDraft || {}).pk, S.cadres, [], b, true) }); render(); autosaveMeeting(); return;
  }
  // 「記下來」只剩新開一場（2026-11-06 起既有那一場改了就存，見 onAutosave）。
  if (act === "mt-save") {
    const d = readMeeting(); S.mtDraft = Object.assign({}, S.mtDraft, d);
    if (!d.title) { S.msg = T("err.mtTitle"); render(); return; }
    if (!d.starts_at || !d.ends_at) { S.msg = T("err.mtTime"); render(); return; }
    S.busy = true; S.msg = ""; render();
    try {
      const newId = await D.saveMeeting(null, d);
      S.busy = false; S.msg = T("msg.mtCreated", { title: d.title });
      S.mtDraft = null; history.pushState(null, "", "#meetings/" + newId); await openTab("meetings/" + newId);
    } catch (e) { S.busy = false; S.msg = T("err.mtSave") + D.says(e); render(); }
    return;
  }
  if (act === "mt-delete") {
    const m = (S.meetings || []).find(x => x.id === id); if (!m) return;
    if (UI.needAsk(S, b, T("confirm.mtDelete", { title: m.title }))) return;
    S.busy = true; S.msg = ""; render();
    try { await D.deleteMeeting(id); S.busy = false; S.msg = T("msg.mtDeleted", { title: m.title }); history.pushState(null, "", "#meetings"); await openTab("meetings"); }
    catch (e) { S.busy = false; S.msg = T("err.mtSave") + D.says(e); render(); }
    return;
  }
  // ── 活動上架（2026-11-01）──
  if (act === "ev-open") { e.preventDefault(); history.pushState(null, "", "#events/" + b.dataset.slug); await openTab("events/" + b.dataset.slug); return; }
  if (act === "ev-back") { history.pushState(null, "", "#events"); await openTab("events"); return; }
  if (act === "ev-create") {
    const val = id => { const el = document.getElementById(id); return el ? el.value.trim() : ""; };
    const d = { team: val("ev-team"), slug: val("ev-slug") || UI.evSlug(val("ev-ten")), title_zh: val("ev-tzh"), title_en: val("ev-ten"), with_form: !!(document.getElementById("ev-withform") || {}).checked };
    S.evDraft = d;
    if (!d.title_zh && !d.title_en) { S.msg = T("err.evTitle"); render(); return; }
    if (!d.slug) { S.msg = T("err.evSlug"); render(); return; }
    S.busy = true; S.msg = ""; render();
    try {
      await D.createEvent(d.team, d.slug, d.title_zh, d.title_en, d.with_form);
      S.evDraft = null; S.busy = false; S.msg = T("msg.evCreated", { title: d.title_zh || d.title_en });
      // 開好直接進那一場。工作區也多了一個，me.ws 要重讀才畫得出「改」的按鈕。
      S.me = await D.loadMe(S.user.id).catch(() => S.me); S.workspaces = await D.loadWorkspaces().catch(() => S.workspaces);
      history.pushState(null, "", "#events/" + d.slug); await openTab("events/" + d.slug);
    } catch (e) { S.busy = false; S.msg = T("err.evCreate") + D.says(e); render(); }
    return;
  }
  // ev-save 那顆鈕 2026-11-06 拿掉了，內容改了就存（onAutosave 的 "ev-save"）；準備好了、放上、撤下還是鈕。
  if (act === "ev-ready" || act === "ev-unready" || act === "ev-publish" || act === "ev-unpublish") {
    const ev = (S.events || []).find(x => x.id === id); if (!ev) return;
    const title = UI.evTitle(ev);
    if (act === "ev-publish" && UI.needAsk(S, b, T("confirm.evPublish", { title }))) return;
    if (act === "ev-unpublish" && UI.needAsk(S, b, T("confirm.evUnpublish", { title }))) return;
    // 按「準備好了」之前先把表單上的字存一次，不然填了沒存就按會被擋「要填開始時間」。
    // ⚠ 要在 render() 之前讀：render() 會照 S.events 重畫表單，重畫完再讀到的是舊值
    // （2026-11-07 歷史之路的照片說明就是這樣存成舊的，Paul 回報「存不起來」）。
    const pending = act === "ev-ready" && UI.canEditWs(S.me, ev.workspace_id) && document.getElementById("ev-tzh") ? readEvent() : null;
    S.busy = true; S.msg = ""; render();
    try {
      if (pending) {
        if (!UI.evCoverOk(pending.cover_url)) throw new Error(T("err.evCoverRaw"));
        await D.saveEvent(id, pending);
      }
      if (act === "ev-ready") await D.setEventReady(id, true);
      else if (act === "ev-unready") await D.setEventReady(id, false);
      else await D.publishEvent(id, act === "ev-publish");
      S.busy = false; S.msg = T("msg." + act.replace("-", "."), { title });
      await reloadEvents(S.evSel); render();
    } catch (e) { S.busy = false; S.msg = T("err.evStatus") + D.says(e); render(); }
    return;
  }
  // ── 行銷需求單（2026-10-31）──
  // 第一步選種類（2026-10-28）：先把畫面上打的字讀回草稿再換，換種類不會把已經填的欄位清掉。
  if (act === "rq-kind") {
    S.rqDraft = Object.assign(document.getElementById("rq-title") ? readRequest() : (S.rqDraft || UI.rqBlank()), { kind: b.dataset.v });
    rqDraftSave(); render(); return;
  }
  if (act === "rq-submit") {
    S.rqDraft = readRequest(); rqDraftSave();
    const p = UI.rqPayload(S.rqDraft);
    if (!p.kind) { S.msg = T("err.rqKind"); render(); return; }
    if (!p.title) { S.msg = T("err.rqTitle"); render(); return; }
    if (!p.owner_id) { S.msg = T("err.rqOwner"); render(); return; }
    S.busy = true; S.msg = ""; render();
    try {
      await D.submitRequest(p);
      S.rqDraft = UI.rqBlank(); rqDraftClear(); S.busy = false; S.msg = T("msg.rqSent");
      await reloadRequests(); render();
    } catch (e) { S.busy = false; S.msg = T("err.rqSubmit") + D.says(e); render(); }
    return;
  }
  // 可以多列的三塊：先把畫面上的字讀回草稿，再加一列或刪一列，存起來重畫。
  const rqRows = { "rq-add-must": ["must", 1], "rq-del-must": ["must", -1], "rq-add-ref": ["refs", 1], "rq-del-ref": ["refs", -1], "rq-add-shot": ["shots", 1], "rq-del-shot": ["shots", -1] };
  if (act === "rq-add-must" || act === "rq-del-must" || act === "rq-add-ref" || act === "rq-del-ref" || act === "rq-add-shot" || act === "rq-del-shot") {
    const [k, dir] = rqRows[act];
    const d = readRequest();
    const blank = { must: { text: "", confirmed_by: "" }, refs: { url: "", note: "" }, shots: { who: "", what: "", seconds: "", note: "" } }[k];
    if (dir > 0) d[k].push(Object.assign({}, blank));
    else { d[k].splice(Number(b.dataset.i), 1); if (!d[k].length && k !== "shots") d[k].push(Object.assign({}, blank)); }
    S.rqDraft = d; rqDraftSave(); render();
    const focus = dir > 0 ? { must: "rq-must-text-", refs: "rq-ref-url-", shots: "rq-shot-who-" }[k] + (d[k].length - 1) : null;
    if (focus) { const el = document.getElementById(focus); if (el) el.focus(); }
    return;
  }
  if (act === "rq-withdraw") {
    const r = (S.requests || []).find(x => x.id === id); if (!r) return;
    if (UI.needAsk(S, b, T("confirm.rqWithdraw", { title: r.title }))) return;
    S.busy = true; S.msg = ""; render();
    try { await D.withdrawRequest(id); S.busy = false; S.msg = T("msg.rqWithdrawn", { title: r.title }); await reloadRequests(); render(); }
    catch (e) { S.busy = false; S.msg = T("err.rqWithdraw") + D.says(e); render(); }
    return;
  }
  if (act === "rq-open") { e.preventDefault(); S.rqSel = id; S.msg = ""; history.pushState(null, "", "#requests/" + id); render(); return; }
  if (act === "rq-back") { S.rqSel = null; S.msg = ""; history.pushState(null, "", "#requests"); render(); return; }
  if (act === "rq-fstatus") { S.rqF = Object.assign({}, S.rqF, { status: b.dataset.v }); render(); return; }
  if (act === "rq-fmine") { S.rqF = Object.assign({}, S.rqF, { mine: S.rqF.mine ? "" : b.dataset.v }); render(); return; }
  // 列印：瀏覽器自己的列印對話框，admin.css 的 @media print 只留那一張單（側欄、頂欄、處理那一塊都藏起來）。
  if (act === "rq-print") { window.print(); return; }
  // 狀態、接的人、回覆改了就存（onAutosave 的 "rq-save"）；「標成已發布」會寄信，留鈕、先問一次。回覆框裡的字一起帶過去。
  if (act === "rq-publish") {
    const r = (S.requests || []).find(x => x.id === id); if (!r) return;
    const rp = document.getElementById("rq-reply");
    const reply = rp ? rp.value.trim() : r.reply;
    if (UI.needAsk(S, b, T("confirm.rqPublish", { title: r.title }))) return;
    S.busy = true; S.msg = ""; render();
    try {
      await D.setRequestStatus(id, "published", reply);
      S.busy = false; S.msg = T("msg.rqPublished", { title: r.title });
      await reloadRequests(); render();
    } catch (e) { S.busy = false; S.msg = T("err.rqSave") + D.says(e); render(); }
    return;
  }
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
  if (act === "members-cleanup" && S.mp) {
    // 清掉靠職級就有一切的人身上多餘的指派（2026-10-24）。復原是照原本的等級派回去。
    const ws = S.mp.ws, ids = String(b.dataset.ids || "").split(",").filter(Boolean);
    const was = ids.map(id => ({ id, level: (S.mp.rows.find(r => r.user_id === id) || {}).level || "view" }));
    if (!ids.length) return;
    S.busy = true; S.msg = ""; render();
    try {
      for (const id of ids) await D.unassign(id, ws);
      S.undo = async () => { S.busy = true; render(); try { for (const w of was) await D.assign(w.id, ws, w.level); await reloadMembers(T("msg.uncleaned", { n: was.length })); } catch (e) { S.busy = false; S.msg = T("err.mpAssign") + D.says(e); render(); } };
      await reloadMembers(T("msg.cleaned", { n: ids.length }));
    } catch (e) { S.busy = false; S.msg = T("err.mpRemove") + D.says(e); render(); }
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
  // 側欄每一行都是 data-act="tab"，key 直接交給 openTab 認（home、forms、events、meetings、request、requests）。
  // 2026-10-25 Paul：「I can't get into events」。之前這裡把 home 以外的一律當 forms，
  // 活動、會議、需求單從側欄點都回到表單那一頁，只有直接打網址才進得去。
  if (act === "tab") {
    e.preventDefault();
    const t = b.dataset.t || "forms";
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

  // save-form 那顆鈕 2026-11-06 拿掉了，設定改了就存（onAutosave 的 "save-form"，驗證也搬過去）。

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

  // 「加這一題」只剩新題（2026-11-06 起既有的題改了就存，見 onAutosave 的 "q-save"）。
  if (act === "q-save") {
    const q = readQuestion();
    if (!q.label) { S.msg = T("err.qEmpty"); render(); return; }
    if ((q.type === "single" || q.type === "multi") && q.options.length < 2) {
      S.msg = T("err.qOpts"); render(); return;
    }
    S.busy = true; S.msg = ""; render();
    try {
      await D.addQuestion(S.form.id, q, S.questions);
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
  // 行銷需求單：換了負責人的 team，人那一格要換成那個 team 的人，所以重畫。
  if (S.view === "request" && e.target && (e.target.id === "rq-owner-team" || e.target.id === "rq-owner")) {
    S.rqDraft = readRequest(); rqDraftSave(); if (e.target.id === "rq-owner-team") render(); return;
  }
  // 多選加人（2026-10-24）：勾一個人、換等級，改 pk 再重畫。
  const pkEl = e.target.closest('[data-act="pk-tick"],[data-act="pk-level"]');
  if (pkEl && (S.view === "meetings" || S.view === "meeting")) { S.mtDraft = Object.assign({}, S.mtDraft, { pk: UI.pkReduce((S.mtDraft || {}).pk, S.cadres, [], pkEl, true) }); render(); autosaveMeeting(); return; }
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
  // 會議的勾人那一塊（2026-11-02）：找名字。
  if (e.target && (e.target.dataset.act === "pk-q" || e.target.dataset.act === "pk-mq") && (S.view === "meetings" || S.view === "meeting")) {
    S.mtDraft = Object.assign({}, S.mtDraft, { pk: UI.pkReduce((S.mtDraft || {}).pk, S.cadres, [], e.target, true) }); render(); UI.pkRefocus("mt", e.target.dataset.act === "pk-mq" ? "mq" : "q"); return;
  }
  // 行銷需求單的送單頁：打一個字就存草稿（不重畫，游標不會跳）；發布日改了，7 天警告跟著出現或藏起來。
  if (S.view === "request" && e.target && e.target.closest && e.target.closest("#rq-form, #rq-shots")) {
    S.rqDraft = readRequest(); rqDraftSave();
    if (e.target.id === "rq-publish") { const w = document.getElementById("rq-publish-warn"); if (w) w.hidden = !UI.rqTooSoon(e.target.value, UI.rqToday()); }
    return;
  }
  // 行銷需求單的佇列：邊打邊篩，重畫後游標放回去。
  if (e.target && e.target.id === "rq-q" && S.view === "requests") {
    S.rqF = Object.assign({}, S.rqF, { q: e.target.value }); render();
    const again = document.getElementById("rq-q"); if (again) { again.focus(); const n = again.value.length; try { again.setSelectionRange(n, n); } catch (x) { /* search 型的欄位有的瀏覽器不給 */ } }
    return;
  }
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
