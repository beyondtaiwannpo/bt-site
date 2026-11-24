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
  // 題目畫布（2026-11-13，shared/forms.js）：fx 是 { mode: edit|preview, menuAt: 哪一條「＋」開著, filter: 打在 / 後面的字, logicOpen: Set }。
  fx: { mode: "edit", menuAt: null, filter: "", logicOpen: new Set() },
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
  events: null, evSel: null, evDraft: null, evSigned: null, evRc: undefined,
  // 活動的照片（2026-11-23）：evPhotos 是打開的那一場的照片（undefined 還在載、null 是遷移檔還沒跑、陣列是照片）；
  // evUp 是封面的上傳進度、evPhUp 是活動照片的上傳進度（null 是沒有在傳）。
  evPhotos: undefined, evUp: null, evPhUp: null,
  // 2026-11-24：evLb 是放大看的那一張照片的 id（null 是沒有放大）；evSpOpenIds 是哪幾位講者那一行開著（{ id: true }）。兩樣都只在記憶體裡。
  evLb: null, evSpOpenIds: {},
  // evTab 是活動編輯頁開著哪一個分頁（null 是照預設：結束了的活動開「成果」，其他開「內容」）。記在網址 #events/<代號>/<分頁>。
  evTab: null,
  // 講者與報名類型（2026-11-23，2027-01-02-event-speakers-tickets.sql）：evSpeakers、evTickets 是打開的那一場的（undefined 還在載、null 是遷移檔還沒跑、陣列）；
  // evSpUp 講者照片的上傳進度 { id, pct, name }；evSpDraft、evTkDraft 是「加一位」「加一種」填到一半的；evSpFound 從紀錄找到的人（undefined 是還沒找過）；evSpQ 找的字。
  evSpeakers: undefined, evTickets: undefined, evSpUp: null, evSpDraft: null, evTkDraft: null, evSpFound: undefined, evSpQ: "",
  // 專案（2026-12-26）：projects 是 projects_list() 回的（undefined 還沒載，null 是遷移檔還沒跑）；pjSel 打開的那一個（id）；pjDraft 開專案填到一半；pjEvDraft 在專案裡開活動填到一半。
  projects: undefined, pjSel: null, pjDraft: null, pjEvDraft: null,
  // 場地（2026-11-10）：venues 是 venues_list() 回的 { can_edit, venues }；venue 是打開的那一個（venue_get）；vnQ 清單的搜尋字；vnOpen 哪個收起來的表單開著。
  venues: null, venue: null, vnSel: null, vnQ: "", vnOpen: {},
  // 2026-11-11：活動清單的篩選（搜尋字、狀態、team）與會議清單的搜尋字。收起來的表單開著沒一樣記在 vnOpen（ev-new、mt-new）。
  evF: { q: "", st: "all", team: "" }, mtQ: "",
  // 會議（2026-11-02）：meetings 是 loadMeetings() 回的；mtSel 打開的那一場；mtDraft 表單填到一半（含勾人的 pk）。
  meetings: null, mtSel: null, mtDraft: null,
  // 會議範本（2026-11-13）：mtpl 是 loadMeetingTemplates() 回的（null 是資料表還沒建）；mtplEd 範本頁上正在改的那一份。
  mtpl: null, mtplEd: null,
};

const root = () => document.getElementById("bt-root");
// Director 與 President 改得動，一般幹部唯讀（2026-09-07 拍板的三層）。
// **這只是畫面。真正的門在資料庫的 RLS**（is_director_of），
// 前端少畫一顆按鈕不是安全機制。
// 2026-10-24 起看指派：對任何一個 apps: 工作區是「改」或「管」的人才有「開新表單」；
// Co-President 與 Senior Adviser（senior）看得到所有 team 的表單與 team 選單。
// 2026-10-30 起申請是整個 BT 一個工作區 apps：改得動的人是被派成改或管的人（senior 靠職級）。
const canEdit = () => UI.canEditWs(S.me, "apps");
// 2026-11-10（2026-12-15-event-signups.sql）：綁著活動的報名表，那場活動「改」以上的人也改得動、審得了、簽得了到。門一樣在資料庫（form_can_edit）。
const formEv = f => (f && (S.events || []).find(e => e.form_id === f.id)) || null;
// 審核或簽到之後，那場活動的報名抄進 Records（人與出席）。在背景跑，失敗不擋畫面（Records 那邊還有手動按鈕）。
const syncRecords = () => { const ev = formEv(S.form); if (ev) D.syncEvent(ev.id).catch(() => {}); };
// 專案的報名表（2026-12-26）：專案是「改」以上就改得動（跟資料庫的 form_can_edit 同一條）。
const formPj = f => (f && !formEv(f) && UI.pjFormOf(S.projects, f.id)) || null;
const canEditForm = f => canEdit() || (!!formEv(f) && UI.canEditWs(S.me, formEv(f).workspace_id)) || UI.pjCanEdit(formPj(f));
const isPres = () => !!S.me && !!S.me.senior;

// 換頁淡入（2026-11-09）：S.view 跟上一次畫的不一樣才加 .swap，自動儲存那種重畫不加。CSS 在 admin.css。
let lastView = null;
function swapIn(el) {
  const main = el.querySelector("main.main");
  if (!main) return;
  if (lastView !== S.view) { main.classList.add("swap"); lastView = S.view; }
}
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
  if (S.form) { S.form._ev = formEv(S.form); S.form._pj = formPj(S.form); }
  if (S.view === "checkin" && S.form) {
    body = UI.checkinHTML(S.form, S.apps, canEditForm(S.form), S.msg, S.busy);
  } else if (S.view === "notice" && S.form) {
    body = UI.noticeHTML(S.form, S.apps, S.noticeTo, S.msg, S.busy);
  } else if (S.view === "apps" && S.form) {
    body = UI.appsHTML(S.form, S.apps, S.questions, canEditForm(S.form),
      S.sel, S.filter, S.pending, S.msg, S.busy);
  } else if ((S.view === "form" || S.view === "question") && S.form) {
    body = UI.formHTML(S.form, S.questions, canEditForm(S.form),
      S.me.board === "president" ? S.teams : [], S.msg, S.busy, S.fx);
  } else if (S.view === "members" && S.mp) {
    body = UI.membersPanelHTML(S.mp, S.msg, S.busy);
  } else if (S.view === "meetings") {
    body = UI.meetingsListHTML(S.meetings || [], S.me, UI.mtScopes(S.me, S.teams), S.mtDraft, S.cadres, S.msg, S.busy, S.mtQ,
      !!S.vnOpen["mt-new"] || !!(S.mtDraft && (S.mtDraft.title || ((S.mtDraft.pk || {}).ticked || []).length)), S.mtpl);
  } else if (S.view === "mtemplates") {
    body = UI.mtplPageHTML(S.mtpl, ["board"].concat(S.teams && S.teams.length ? S.teams : UI.TEAM_LABELS), S.mtplEd, S.msg, S.busy, UI.canEditWs(S.me, "custom:meeting-templates"));
  } else if (S.view === "meeting" && S.mtSel) {
    const m = (S.meetings || []).find(x => x.id === S.mtSel);
    const scopes = UI.mtScopes(S.me, S.teams);
    body = m ? UI.meetingHTML(m, S.me, S.cadres, scopes.includes(m.scope), scopes, S.mtDraft, S.msg, S.busy, S.mtpl)
             : UI.emptyHTML(T("mt.notFound"), "", { act: "mt-back", label: T("mt.back") });
  } else if (S.view === "projects") {
    body = UI.projectsListHTML(S.projects, pjTeams(), S.pjDraft, S.msg, S.busy, !!S.vnOpen["pj-new"]);
  } else if (S.view === "project" && S.pjSel) {
    const pj = (S.projects || []).find(p => p.id === S.pjSel);
    body = pj ? UI.projectHTML(pj, S.projects, S.events || [], S.me, S.msg, S.busy, { evTeams: evTeams(), evDraft: S.pjEvDraft, newOpen: !!S.vnOpen["pj-ev-new"], addOpen: !!S.vnOpen["pj-ev-add"] })
              : S.projects === undefined ? UI.skeletonHTML() : UI.emptyHTML(T("pj.none"), "", { act: "pj-back", label: T("pj.back") });
  } else if (S.view === "events") {
    body = UI.eventsListHTML(S.events || [], S.me, S.teams, S.evDraft, S.msg, S.busy, evTeams(), S.evF, !!S.vnOpen["ev-new"], S.projects);
  } else if (S.view === "event" && S.evSel) {
    const ev = (S.events || []).find(e => e.slug === S.evSel);
    body = ev ? UI.eventEditHTML(ev, ev.form_id ? (S.forms || []).find(f => f.id === ev.form_id) || null : null, S.evSigned, S.me, S.msg, S.busy, S.venues && S.venues.venues, S.terms, S.evLinks, S.evRc, S.projects,
                { photos: S.evPhotos, coverUp: S.evUp, photoUp: S.evPhUp, coverLinkOpen: !!S.vnOpen["ev-cover-link"],
                  tab: S.evTab, speakers: S.evSpeakers, spUp: S.evSpUp, spDraft: S.evSpDraft, spOpen: !!S.vnOpen["ev-sp-new"], spOpenIds: S.evSpOpenIds, canPick: UI.evCanPickPeople(S.me), spFound: S.evSpFound, spQ: S.evSpQ,
                  tickets: S.evTickets, tkDraft: S.evTkDraft, tkOpen: !!S.vnOpen["ev-tk-new"],
                  prevZh: !!S.vnOpen["ev-bzh-fold"], prevEn: !!S.vnOpen["ev-ben-fold"] })
              : UI.emptyHTML(T("ev.notFound"), T("ev.notFoundHint"), { act: "ev-back", label: T("ev.back") });
  } else if (S.view === "venues") {
    body = UI.venuesListHTML(S.venues, S.vnQ, S.msg, S.busy, !!S.vnOpen["vn-add"]);
  } else if (S.view === "venue" && S.vnSel) {
    body = S.venue ? UI.venueHTML(S.venue, S.msg, S.busy, !!S.vnOpen["vnc-add"]) : UI.msgHTML(S.msg) + UI.skeletonHTML();
  } else if (S.view === "request") {
    if (!S.rqDraft) S.rqDraft = rqDraftLoad();
    body = UI.rqSwitchHTML("request", S.me, S.requests) + UI.requestPageHTML(S.me, UI.rqMine(S.requests, S.me), S.rqDraft, S.msg, S.busy, S.cadres, UI.rqToday());
  } else if (S.view === "requests") {
    body = UI.rqSwitchHTML("requests", S.me, S.requests) + UI.requestsQueueHTML(S.requests || [], S.cadres, S.rqF, S.rqSel, UI.canEditWs(S.me, "custom:marketing-requests"), S.msg, S.busy,
      { assignees: S.rqAssignees, today: UI.rqToday(), me: S.me });
  } else if (S.view === "list") {
    body = UI.listHTML(S.forms, canEdit(), S.msg, isPres(), S.newForm,
      S.teams.length ? S.teams : UI.TEAM_LABELS, S.me.team ? String(S.me.team).split(/[,、;；]/)[0].trim() : "", S.busy,
      UI.mpItems(S.me, "apps", S.workspaces), S.events);
  } else {
    // 首頁（批 1 先沿用目錄卡加待寄的信，批 2 換成三塊）。
    // 頂欄那幾項各是什麼（shared/nav.js 的 FEATURES 本來就有一句 desc，9-08 刪掉選單頁之後沒地方印；總覽印一次）。
    const features = featuresFor(S.me.role).map(f => ({ label: tx(f.label, lang()), desc: tx(f.desc, lang()), href: f.href }));
    body = UI.hubHTML(S.me, S.pendingAll, canEdit(), S.busy, S.forms, S.todo, features);
  }
  // 側欄亮哪一行：首頁亮「首頁」，其他全部算在「申請表」底下。
  // 側欄右邊的小數字：待審的申請、等核可的人。**只在 /admin/ 這一組算**（別組沒有 loadTodo），有才顯示。
  const t = S.todo || {};
  const evForms = new Set((S.events || []).map(e => e.form_id).filter(Boolean));
  const counts = {
    // 2026-11-10：活動報名表的待審算在「活動」那一行，其他申請算在「其他申請」。
    forms: S.forms.filter(f => !evForms.has(f.id)).reduce((n, f) => n + (f.counts ? f.counts.received : 0), 0),
    events: S.forms.filter(f => evForms.has(f.id)).reduce((n, f) => n + (f.counts ? f.counts.received : 0), 0),
    team: (t.team || []).length,
    stories: (t.stories || []).filter(r => !r.story_approved).length,
  };
  // 側欄亮哪一行：總覽、需求單、活動、場地、會議各自亮；活動的報名表亮「活動」，其他申請亮「其他申請」。
  // 從別一區連過來的成員頁（#members=）不屬於這個資料夾的任何一頁，側欄不亮、上面不畫分頁。
  const tab = (S.view === "members" && S.mp && S.mp.fromLink) ? "" : S.view === "home" ? "teams" : (S.view === "request" || S.view === "requests") ? "request" : (S.view === "events" || S.view === "event") ? "events" : (S.view === "projects" || S.view === "project") ? "projects" : (S.view === "venues" || S.view === "venue") ? "venues" : (S.view === "meetings" || S.view === "meeting") ? "meetings" : S.view === "mtemplates" ? "mtemplates" : (S.form && S.form._ev && ["apps", "form", "question", "checkin", "notice"].includes(S.view)) ? "events" : (S.form && S.form._pj && ["apps", "form", "question", "checkin", "notice"].includes(S.view)) ? "projects" : "forms";
  UI.railBefore(el); el.innerHTML = UI.shellHTML(nav, UI.railHTML("forms", tab, S.me, counts), body); UI.railAfter(el);
  UI.afterRender(S, el);
  swapIn(el);
  paintLightbox();
  if ((S.view === "form" || S.view === "question") && S.fx.mode === "preview") mountPreview();
}

// ── 活動照片放大的那一格（2026-11-24，Paul：「whenever I press them it's gonna pop up in the middle, and then I can tap right or left」）──
// 一個 <dialog id="ev-lb">，掛在 <body> 底下、不在 render() 會整個換掉的那一塊裡，所以整頁重畫的時候它不會閃一下。
// 裡面的 HTML 是 UI.evLightboxHTML 畫的；S.evLb 是現在看的那一張的 id。render() 每次畫完都叫 paintLightbox()：
// 那一張還在就照新的資料重畫，不在了（被拿掉、換到別頁）就關掉。Esc 與點旁邊暗的地方是瀏覽器的 <dialog> 自己會關，關了把 S.evLb 清掉。
// 左右鍵與手指左右滑換照片（下面那兩個 listener）。
function lightboxEl() {
  let d = document.getElementById("ev-lb");
  if (d) return d;
  d = document.createElement("dialog"); d.id = "ev-lb"; d.className = "ev-lb"; d.setAttribute("aria-label", T("ev.lbAria"));
  d.addEventListener("close", () => { S.evLb = null; S.ask = null; });
  d.addEventListener("click", e => { if (e.target === d) d.close(); });
  let x0 = null;
  d.addEventListener("touchstart", e => { x0 = e.touches.length === 1 ? e.touches[0].clientX : null; }, { passive: true });
  d.addEventListener("touchend", e => {
    if (x0 == null || !e.changedTouches.length) return;
    const dx = e.changedTouches[0].clientX - x0; x0 = null;
    if (Math.abs(dx) > 60) lightboxGo(dx > 0 ? -1 : 1);
  }, { passive: true });
  document.body.appendChild(d);
  return d;
}
function lightboxGo(dir) {
  const to = UI.evLbStep(S.evPhotos, S.evLb, dir);
  if (to && to !== S.evLb) { S.evLb = to; S.ask = null; paintLightbox(); }
}
function paintLightbox() {
  const old = document.getElementById("ev-lb");
  const ev = S.view === "event" ? (S.events || []).find(x => x.slug === S.evSel) : null;
  const html = ev && S.evLb ? UI.evLightboxHTML(ev, S.evPhotos, S.evLb, S.busy) : "";
  if (!html) { S.evLb = null; if (old && old.open) old.close(); return; }
  const d = old || lightboxEl();
  // 重畫前記住游標停在哪一顆（往前一格、下一張…），畫完放回去，連按鍵盤才不會掉。
  const at = document.activeElement, was = at && d.contains(at) && at.dataset ? { act: at.dataset.act, dir: at.dataset.dir } : null;
  d.innerHTML = `<div class="ev-lb-in">${html}</div>`;
  // 這一格開著的時候底下的 toast 被蓋住，沒做成的那一句（例如順序沒存成）要在這一格裡也講一次。
  if (S.msg && UI.msgKind(S.msg) !== "ok") { const m = document.createElement("div"); m.className = "note ev-lb-msg"; m.textContent = S.msg; d.firstChild.appendChild(m); }
  if (!d.open) d.showModal();
  if (S.ask) UI.mountAsk(d, S.ask);
  const again = was && was.act ? d.querySelector(`[data-act="${was.act}"]${was.dir ? `[data-dir="${was.dir}"]` : ""}:not([disabled]):not([hidden])`) : null;
  (again || d).focus({ preventScroll: true });
}
document.addEventListener("keydown", e => {
  if (!S.evLb || (e.key !== "ArrowLeft" && e.key !== "ArrowRight")) return;
  e.preventDefault(); lightboxGo(e.key === "ArrowLeft" ? -1 : 1);
});
// 照片排順序是「先動畫面、再送資料庫」：一張一張送會讓連按的時候每按一下都要等。送的那幾次排成一條隊（evPhQ），後按的不會比先按的早到；
// 哪一次沒送成，講一聲、把資料庫現在的順序讀回來。要重讀照片的地方（傳完、拿掉之後）都先等這條隊走完。
let evPhQ = Promise.resolve();

// 側欄與頂欄先畫（2026-11-06）：知道我是誰就先把外殼畫出來，內容那一格放骨架，資料回來 render() 整個換掉。
// 不等資料的理由：外殼只要 S.me，而 S.me 從分頁快取拿幾乎不用等。這一頁的「慢」實測全部在資料那一半。
function paintShell() {
  const el = root();
  if (!el || !S.me) return;
  const nav = navHTML({ current: "admin", role: S.me.role, name: S.me.name });
  UI.railBefore(el); el.innerHTML = UI.shellHTML(nav, UI.railHTML("forms", /^(teams|home)$/.test(location.hash.slice(1)) ? "teams" : "events", S.me, {}), UI.skeletonHTML()); UI.railAfter(el);
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
    const formsP = D.loadForms();
    formsP.catch(() => {});
    S.me = await D.loadMe(S.user.id);
    if (!S.me || S.me.role !== "cadre") { render(); return; }
    paintShell();
    UI.bindAutosave(root(), onAutosave);
    // 題目畫布的樣式與拖曳排序（shared/forms.js）。拖曳掛在 #bt-root 上一次，它不會被換掉。
    UI.F.ensureStyle();
    UI.F.bindDrag(root(), (from, to) => { if (S.form && canEditForm(S.form)) fxReorder(UI.F.moveId(S.questions.map(q => q.id), from, to)); });
    // 2026-11-09 效率：沒有任何工作區、也不是 Co-President／Senior Adviser／Director 的幹部，總覽只會印「今天沒有要處理的」加自己的 team，
    // 工作區、需求單、活動、會議、待寄的信對他全是空的（RLS），不用問（實測從 16 次查詢降到 9 次）。有指派或職級的人照舊全抓。
    const light = !S.me.senior && S.me.board === "member" && !Object.keys(S.me.ws || {}).length;
    const pendingP = light ? Promise.resolve([]) : D.loadPendingAll().catch(() => []);
    const [forms, pendingAll, teams, todo, workspaces, requests, events, meetings] = await Promise.all([
      formsP, pendingP,
      D.loadTeams().catch(() => []),
      D.loadTodo(S.me).catch(() => ({})),
      light ? [] : D.loadWorkspaces().catch(() => []),
      light ? null : D.loadRequests().catch(() => null),
      light ? null : D.loadEvents().catch(() => null),
      light ? null : D.loadMeetings().catch(() => null),
    ]);
    S.forms = forms; S.pendingAll = pendingAll; S.teams = teams; S.todo = todo; S.workspaces = workspaces;
    S.requests = requests; if (S.todo) S.todo.requests = S.requests;
    S.events = events; if (S.todo) S.todo.events = S.events;
    S.meetings = meetings; if (S.todo) S.todo.meetings = S.meetings;
    // 提醒信的退路（2026-11-02）：開頁叫一次 tick_mail()，Resend 沒設好也不會讓頁面壞。
    if (!light) D.tickMail().catch(() => {});
    // 開頁拉一次大家在 Google 日曆上的回覆，有人改了就重讀會議。
    if (!light) D.gcalRefresh().then(n => { if (n > 0) return reloadMeetings().then(() => render()); }).catch(() => {});
    // 網址帶 #forms 就直接開申請表清單（側欄從別組連過來、README 的連結都用這個）。
    // #members=<工作區>（2026-12-25）：每一區的「誰在做」都連到這裡，一頁管所有地方的成員。門在 workspace_members / assign 裡。
    const mh = location.hash.slice(1).match(/^members=(.+)$/);
    if (mh) {
      const ws = decodeURIComponent(mh[1]);
      const w = (S.workspaces || []).find(x => x.id === ws);
      const name = w ? (lang() === "zh" ? (w.title_zh || w.title_en) : (w.title_en || w.title_zh)) || ws : ws;
      await openMembers(ws, name, "home"); if (S.mp) { S.mp.fromLink = true; S.mp.canBack = document.referrer.startsWith(location.origin); render(); } return;
    }
    if (location.hash.slice(1) === "forms" || new URLSearchParams(location.search).get("tab") === "forms") S.view = "list";
    else if (/^(requests?|events|projects|venues|meetings|mtemplates|forms\/)(\/|$|[0-9a-f])/.test(location.hash.slice(1))) { await openTab(location.hash.slice(1)); return; }
    // 2026-11-14：/admin/ 沒有 # 的時候開活動（待辦搬到 /home/ 了）。#teams 與舊的 #home 開「各 team」。
    else if (!/^(teams|home)$/.test(location.hash.slice(1))) { history.replaceState(null, "", location.pathname + location.search + "#events"); await openTab("events"); return; }
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
// 「開一場活動」那一格有打字就收進 S.evDraft（篩選重畫前叫）。沒打字就不動，免得收起來的空表單被當成填到一半。
function keepEvDraft() {
  const val = id => { const el = document.getElementById(id); return el ? el.value.trim() : ""; };
  if (!document.getElementById("ev-team")) return;
  const d = { team: val("ev-team"), slug: val("ev-slug"), title_zh: val("ev-tzh"), title_en: val("ev-ten"), with_form: !!(document.getElementById("ev-withform") || {}).checked };
  if (d.slug || d.title_zh || d.title_en) S.evDraft = d;
}
function evTeams() {
  if (!S.me) return [];
  if (S.me.senior) return (S.teams && S.teams.length ? S.teams : UI.TEAM_LABELS);
  // 2026-12-25：team 是「改」就開得了這個 team 的活動（create_event 同一條）。
  return Object.entries(S.me.ws || {}).filter(([id, lv]) => id.startsWith("res:") && ["edit", "manage"].includes(lv)).map(([id]) => id.slice(4));
}
// 開得了專案的工作區："" 是整個 BT（只有 senior），其他是 team 是「改」以上的（create_project 同一條）。
function pjTeams() { return S.me && S.me.senior ? [""].concat(evTeams()) : evTeams(); }
async function reloadProjects() {
  try { S.projects = await D.loadProjects(); } catch (e) { S.projects = S.projects || []; S.msg = T("err.pjLoad") + D.says(e); }
}
function keepPjDraft() {
  const val = id => { const el = document.getElementById(id); return el ? el.value.trim() : ""; };
  if (document.getElementById("pj-team")) { const d = { team: val("pj-team"), slug: val("pj-slug"), title_zh: val("pj-tzh"), title_en: val("pj-ten") }; if (d.slug || d.title_zh || d.title_en) S.pjDraft = d; }
  if (document.getElementById("pj-ev-team")) { const d = { team: val("pj-ev-team"), slug: val("pj-ev-slug"), title_zh: val("pj-ev-tzh"), title_en: val("pj-ev-ten"), with_form: !!(document.getElementById("pj-ev-withform") || {}).checked }; if (d.slug || d.title_zh || d.title_en) S.pjEvDraft = d; }
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
  // 開始與結束填的是台灣時間，不是這台電腦的時間（見 ui.js 的 evFromTaipei）。
  const iso = v => UI.evFromTaipei(v);
  const patch = { title_zh: val("ev-tzh"), title_en: val("ev-ten"), summary_zh: val("ev-szh"), summary_en: val("ev-sen"), body_zh: val("ev-bzh"), body_en: val("ev-ben"),
    starts_at: iso(val("ev-starts")), ends_at: iso(val("ev-ends")), place: val("ev-place"), capacity: Number(val("ev-cap") || 0), cover_url: val("ev-cover") };
  // 計畫的四格（2026-12-31-programmes.sql）。那一塊有畫出來才帶（遷移檔還沒跑的時候沒有畫，帶了資料庫也不認得）。
  if (document.getElementById("ev-month")) Object.assign(patch, UI.evProgrammePatch({ usual_month: val("ev-month"), recurring: chk("ev-recurring"), edition_zh: val("ev-edzh"), edition_en: val("ev-eden") }));
  return patch;
}
// 存活動那幾格（save_event）。封面換了，資料庫會把 cover_consent 退回 false（同意是對那一張照片的）。
// 2026-11-24 起畫面上沒有同意的勾（Paul：「If I upload a photo, I have consent. So just take that away」）：放上封面就算確認過同意，
// 所以封面換成另一張（不是拿掉）的時候，這裡接著再存一次 cover_consent: true。資料庫那道門沒動，只是由這裡替按的人補那一下。
// 封面沒換就不碰 cover_consent：改版之前放的、當時沒勾的封面不會因為改了別的欄位就變公開，要按「放上對外頁」（ev-cover-show）。
// patch 裡不帶 cover_consent（readEvent 不讀它）。回封面有沒有換。
async function saveEventFields(ev, patch) {
  const changed = "cover_url" in patch && (patch.cover_url || "") !== (ev.cover_url || "");
  await D.saveEvent(ev.id, patch);
  if (!changed) return false;
  ev.cover_url = patch.cover_url || null; ev.cover_consent = false;
  if (patch.cover_url) { await D.saveEvent(ev.id, { cover_consent: true }); ev.cover_consent = true; }
  return true;
}
// ── 活動的照片與下半那幾顆按鈕（2026-11-23）──────────────────────────────
// 重畫之前，把「內容」那幾格現在打的字收進 S.events 那一列（只改記憶體；存檔是自動儲存那條路在做，離開那一格就送了）。
// 不這樣的話，按了照片或報名的按鈕，畫面照 S.events 重畫，剛打、還沒存完的字就不見了（2026-11-07 歷史之路踩過同一個坑）。
// 封面的連結與同意不收：那兩格換了資料庫會把同意改回沒勾，交給自動儲存那條路一起處理，這裡先收會讓畫面上的勾跟資料庫對不上。
function keepEventTyped() {
  keepPanelsTyped();
  const ev = (S.events || []).find(x => x.slug === S.evSel);
  if (!ev || !UI.canEditWs(S.me, ev.workspace_id) || !document.getElementById("ev-tzh")) return;
  const p = readEvent(); delete p.cover_url;
  Object.assign(ev, p);
}
// 講者與報名類型那幾列打到一半、還沒按「存這一位」「存這一種」的字：重畫前收進那一列的 typed，畫面照它印（UI.evRowVals）。
// 「加一位」「加一種」那兩格收進 evSpDraft、evTkDraft。只收畫面上是這一場的（data-ev），換到別場的時候不會把上一場的字帶過去。
const rowTyped = box => { const o = {}; for (const el of box.querySelectorAll("[data-f]")) o[el.dataset.f] = el.value; return o; };
function keepPanelsTyped() {
  if (S.view !== "event") return;
  const ev = (S.events || []).find(x => x.slug === S.evSel); if (!ev) return;
  for (const li of document.querySelectorAll("[data-sp-row]")) { const r = (Array.isArray(S.evSpeakers) ? S.evSpeakers : []).find(x => x.id === li.dataset.id); if (r) r.typed = rowTyped(li); }
  for (const li of document.querySelectorAll("[data-tk-row]")) { const r = (Array.isArray(S.evTickets) ? S.evTickets : []).find(x => x.id === li.dataset.id); if (r) r.typed = rowTyped(li); }
  const sn = document.getElementById("ev-sp-new-box"); if (sn && sn.dataset.ev === ev.id) S.evSpDraft = Object.assign({}, S.evSpDraft, rowTyped(sn));
  const tn = document.getElementById("ev-tk-new-box"); if (tn && tn.dataset.ev === ev.id) S.evTkDraft = Object.assign({}, S.evTkDraft, rowTyped(tn));
  const q = document.getElementById("ev-sp-q"); if (q) S.evSpQ = q.value;
}
// 重讀講者或報名類型。別列打到一半的字帶過去；剛存的那一列（fresh）照資料庫的印。
async function reloadEventSpeakers(eventId, fresh) {
  const old = Array.isArray(S.evSpeakers) ? S.evSpeakers : [];
  try {
    S.evSpeakers = await D.loadEventSpeakers(eventId);
    for (const r of S.evSpeakers || []) { const o = old.find(x => x.id === r.id); if (o && o.typed && r.id !== fresh) r.typed = o.typed; }
  } catch (e) { S.evSpeakers = old; S.msg = T("err.evSpLoad") + D.says(e); }
}
async function reloadEventTickets(eventId, fresh) {
  const old = Array.isArray(S.evTickets) ? S.evTickets : [];
  try {
    S.evTickets = await D.loadEventTickets(eventId);
    for (const r of S.evTickets || []) { const o = old.find(x => x.id === r.id); if (o && o.typed && r.id !== fresh) r.typed = o.typed; }
  } catch (e) { S.evTickets = old; S.msg = T("err.evTkLoad") + D.says(e); }
}
// 紀錄（Records）裡的照片抄一份到 events bucket：抓下來、照一般照片縮一次、傳上去，回新的網址。抓不到或讀不出來就丟錯，叫的人自己決定怎麼辦。
async function copyRecordsPhoto(eventId, url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error("photo " + res.status);
  return D.uploadEventImage(eventId, await shrinkImage(await res.blob()));
}
// 改了講者的名字或照片，資料庫會把 consent 退回 false。本來對外看得到的那一位，這裡替他補回去（2026-11-24 起畫面上沒有同意的勾）；
// 本來看不到的不補，所以改版之前沒勾的、紀錄裡是學員的那幾位，不會因為改了字就變公開。補不成不算整件事失敗，講一聲就好。
async function keepSpeakerShown(speakerId) {
  try { await D.setEventSpeakerConsent(speakerId, true); } catch (e) { S.msg = T("msg.evShowFailed"); }
}
// 講者的照片：縮圖 → 傳到 Storage 的 events bucket → 把網址存進那一位 → 本來對外看得到的補回去 → 舊的那個檔刪掉。跟封面同一條路。
async function uploadSpeakerPhoto(speakerId, file) {
  const ev = (S.events || []).find(x => x.slug === S.evSel), sp = (S.evSpeakers || []).find(x => x.id === speakerId); if (!ev || !sp) return;
  keepEventTyped();
  if (!UI.evFileOk(file)) { S.msg = T("err.evFile"); render(); return; }
  S.busy = true; S.msg = ""; S.evSpUp = { id: speakerId, pct: 10, name: file.name }; render();
  let url = "";
  try {
    const blob = await shrinkImage(file); S.evSpUp = { id: speakerId, pct: 45, name: file.name }; render();
    url = await D.uploadEventImage(ev.id, blob); S.evSpUp = { id: speakerId, pct: 85, name: file.name }; render();
    const old = sp.photo_url, shown = !!sp.consent;
    await D.saveEventSpeaker(ev.id, speakerId, { photo_url: url });
    if (shown) await keepSpeakerShown(speakerId);
    if (old && old !== url) await D.removeEventFile(UI.evStoragePath(old));
    await reloadEventSpeakers(ev.id);
    if (!S.msg) S.msg = T("msg.evSpPhoto");
  } catch (e) {
    // 檔傳上去了、網址卻沒存成：把剛傳的那個檔刪掉，不留一個沒人用的檔。
    if (url) await D.removeEventFile(UI.evStoragePath(url));
    S.msg = T("err.evSpSave") + D.says(e);
  }
  S.evSpUp = null; S.busy = false; render();
}
// 封面換了（上傳、拿掉、換連結）之後，自動儲存記的「上次存的值」要忘掉那兩格。
// 不忘的話：勾過同意 → 換封面（資料庫把同意改回沒勾）→ 再勾一次，會被當成「跟上次一樣」而沒送出去，畫面有勾、資料庫沒有。
function forgetCover(id) { dirty.forget("ev-save|" + id + "|cover_url"); }
// 瀏覽器端先縮圖再傳（最長邊 1600）。回一個 JPEG Blob；讀不出來就丟 err.evResize。
// 用 canvas 不用任何函式庫；EXIF 方向交給瀏覽器（createImageBitmap 的 imageOrientation）。跟 admin/site/src/main.js 的同一個做法。
async function shrinkImage(file) {
  let bmp;
  try { bmp = await createImageBitmap(file, { imageOrientation: "from-image" }); }
  catch (e) { throw new Error(T("err.evResize")); }
  const { w, h } = UI.evFit(bmp.width, bmp.height);
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  c.getContext("2d").drawImage(bmp, 0, 0, w, h);
  bmp.close && bmp.close();
  const blob = await new Promise(r => c.toBlob(r, "image/jpeg", 0.86));
  if (!blob) throw new Error(T("err.evResize"));
  return blob;
}
async function reloadEventPhotos(eventId) {
  await evPhQ;
  try { S.evPhotos = await D.loadEventPhotos(eventId); }
  catch (e) { S.evPhotos = S.evPhotos || []; S.msg = T("err.evPhLoad") + D.says(e); }
}
// 封面：縮圖 → 傳到 Storage → 把網址存進 cover_url 並且補上同意（saveEventFields）→ 舊的那個檔刪掉。
async function uploadEventCover(eventId, file) {
  const ev = (S.events || []).find(x => x.id === eventId); if (!ev) return;
  keepEventTyped();
  if (!UI.evFileOk(file)) { S.msg = T("err.evFile"); render(); return; }
  S.busy = true; S.msg = ""; S.evUp = { pct: 10, name: file.name }; render();
  let url = "";
  try {
    const blob = await shrinkImage(file); S.evUp = { pct: 45, name: file.name }; render();
    url = await D.uploadEventImage(eventId, blob); S.evUp = { pct: 85, name: file.name }; render();
    const old = ev.cover_url;
    await saveEventFields(ev, { cover_url: url }); forgetCover(eventId);
    if (old !== url) await D.removeEventFile(UI.evStoragePath(old));
    S.vnOpen["ev-cover-link"] = false; S.msg = T("msg.evCover");
  } catch (e) {
    // 檔傳上去了、網址卻沒存成：把剛傳的那個檔刪掉，不留一個沒人用的檔。
    if (url) await D.removeEventFile(UI.evStoragePath(url));
    S.msg = T("err.evCoverUp") + D.says(e);
  }
  S.evUp = null; S.busy = false; render();
}
// 活動照片：一次可以選好幾張，一張一張傳。壞掉的那幾張記下來，其他照傳；傳完重讀一次。傳上去的每一張接著補上同意（2026-11-24：傳照片就算確認過同意）。
async function uploadEventPhotos(eventId, files) {
  keepEventTyped();
  const bad = files.filter(f => !UI.evFileOk(f)).map(f => f.name);
  const ok = files.filter(f => UI.evFileOk(f));
  if (!ok.length) { S.msg = T("err.evFile"); render(); return; }
  S.busy = true; S.msg = ""; S.evPhUp = { pct: 0, name: ok[0].name, i: 1, n: ok.length }; render();
  const failed = []; let hidden = 0;
  for (let i = 0; i < ok.length; i++) {
    const file = ok[i];
    const base = Math.round(i / ok.length * 100), span = 100 / ok.length;
    const step = pct => { S.evPhUp = { pct: Math.round(base + span * pct / 100), name: file.name, i: i + 1, n: ok.length }; render(); };
    let url = "";
    try {
      step(10);
      const blob = await shrinkImage(file);
      step(45);
      url = await D.uploadEventImage(eventId, blob);
      step(85);
      const pid = await D.addEventPhoto(eventId, url);
      // 傳照片就算確認過同意（2026-11-24）。這一下沒成，照片還在、只是對外看不到，最後講一聲。
      try { await D.setEventPhotoConsent(pid, true); } catch (x) { hidden++; }
    } catch (e) {
      if (url) await D.removeEventFile(UI.evStoragePath(url));
      failed.push(file.name + "（" + D.says(e) + "）");
    }
  }
  S.evPhUp = null;
  const n = ok.length - failed.length;
  const parts = [];
  if (n) parts.push(T(n === 1 ? "msg.evPhotoAdded" : "msg.evPhotosAdded", { n }));
  if (hidden) parts.push(T("msg.evShowFailed"));
  if (failed.length) parts.push(T("err.evUploadSome") + failed.join("、"));
  if (bad.length) parts.push(T("err.evFileSome") + bad.join("、"));
  await reloadEventPhotos(eventId);
  // reloadEventPhotos 讀不到的時候自己會寫一句錯誤，那一句留著，接在後面。
  S.msg = parts.concat(S.msg ? [S.msg] : []).join(" ");
  S.busy = false; render();
}
async function reloadVenues(id) {
  try {
    if (id) S.venue = await D.loadVenue(id); else S.venues = await D.loadVenues();
  } catch (e) { S.msg = T("err.vnLoad") + D.says(e); if (id) S.venue = null; }
}
function readVenue(idp) {
  const val = k => { const el = document.getElementById(idp + "-" + k); return el ? el.value.trim() : ""; };
  const p = { name: val("name"), kind: val("kind") || "other", city: val("city"), address: val("address"), capacity: val("capacity"), cost: val("cost"), url: val("url"), notes: val("notes") };
  // Google 地圖連結（2027-01-05-map-links.sql）：那一格有畫出來才帶（遷移檔還沒跑的時候沒有畫）。
  if (document.getElementById(idp + "-map")) p.map_url = val("map");
  return p;
}
// 活動地點的 Google 地圖連結：先在這裡擋一次不是 Google 地圖的（資料庫會再擋一次），存好把那一列的值換掉再重畫。空的就是拿掉。
async function saveEventMap(eventId, url) {
  const ev = (S.events || []).find(x => x.id === eventId); if (!ev) return;
  const v = String(url || "").trim();
  keepEventTyped();
  if (!UI.evMapOk(v)) { ev.map_url = v; S.msg = T("err.evMap") + D.says("bad_map_url"); render(); return; }
  if (v === String(ev.map_url || "")) return;
  S.busy = true; S.msg = ""; render();
  try { const saved = await D.setEventMapUrl(eventId, v); ev.map_url = saved || null; S.msg = T(saved ? "msg.evMapSaved" : "msg.evMapCleared"); }
  catch (e) { ev.map_url = v; S.msg = T("err.evMap") + D.says(e); }
  S.busy = false; render();
}
async function reloadMeetings() {
  try {
    const [ms, tp] = await Promise.all([D.loadMeetings(), D.loadMeetingTemplates().catch(() => null)]);
    S.meetings = ms; S.mtpl = tp; if (S.todo) S.todo.meetings = S.meetings; if (!S.cadres.length) S.cadres = await D.loadCadres().catch(() => []);
  }
  catch (e) { S.msg = T("err.mtLoad") + D.says(e); }
}
// 會議紀錄的打字框讀出來：[{ h, text }]。idp：mtm（一場會的頁面）或 mtn（記一場新的）。
function readMinutes(idp) {
  const box = document.getElementById(idp + "-min"); if (!box) return [];
  return [...box.querySelectorAll("[data-mtm-sec]")].map(sec => ({ h: ((sec.querySelector(".mtm-h") || {}).value || "").trim(), text: (sec.querySelector(".mtm-t") || {}).value || "" }));
}
// 會議頁要重畫之前（勾人、換範本、加一段）先把畫面上打到一半的字收進 S.mtDraft，不然重畫就不見了。
function keepMtDraft() {
  if (S.view !== "meetings" && S.view !== "meeting") return;
  const d = Object.assign({}, S.mtDraft);
  if (document.getElementById("mt-title")) { const r = readMeeting(); for (const k of ["scope", "required", "title", "starts_at", "ends_at", "agenda", "doc_url"]) d[k] = r[k]; }
  const idp = S.view === "meeting" ? "mtm" : "mtn";
  if (document.getElementById(idp + "-min")) { d.minutes = readMinutes(idp); d.tpl = ((document.getElementById(idp + "-tpl") || {}).value) || null; }
  S.mtDraft = d;
}
// 會議頁的紀錄現在存一次（換範本、加一段、拿掉一段是按的不是打的，不會觸發改了就存）。
function saveMinutesNow() {
  if (S.view !== "meeting") return;
  const box = document.querySelector('[data-autosave="mt-min"]'); if (box) onAutosave("mt-min", box, null);
}
// 範本頁的編輯框讀出來。
function readTplEd() {
  const box = document.getElementById("mtpl-ed"); if (!box) return S.mtplEd;
  const v = id => ((document.getElementById(id) || {}).value || "").trim();
  return { id: box.dataset.id || null, title: v("mtpl-title"), scope: v("mtpl-scope"),
    sections: [...box.querySelectorAll("[data-mtpl-sec]")].map(li => ({ h: ((li.querySelector(".mtpl-h") || {}).value || "").trim(), hint: ((li.querySelector(".mtpl-hint") || {}).value || "").trim() })) };
}
async function reloadTemplates() {
  try { S.mtpl = await D.loadMeetingTemplates(); } catch (e) { S.msg = T("err.mtLoad") + D.says(e); }
}
function readMeeting() {
  const val = id => { const el = document.getElementById(id); return el ? el.value.trim() : ""; };
  const iso = v => v ? new Date(v).toISOString() : "";
  const pk = (S.mtDraft && S.mtDraft.pk) || { ticked: [] };
  return { scope: val("mt-scope") || "board", required: val("mt-required") !== "0", title: val("mt-title"), starts_at: iso(val("mt-starts")), ends_at: iso(val("mt-ends")), agenda: val("mt-agenda"), doc_url: val("mt-doc"), attendees: UI.pkPicked(S.cadres, [], pk, true) };
}
async function openTab(t) {
  if (!t) t = "events";
  // 2026-11-09：#forms/<id>/checkin 與 #forms/<id>/notice 有自己的網址（重整不會掉回清單；簽到當天手機上重整是常有的事）。
  const fm = /^forms\/([0-9a-f-]{36})(?:\/(checkin|notice))?$/.exec(t || "");
  if (fm) {
    await openApps(fm[1]);
    if (fm[2]) { S.view = fm[2]; S.msg = ""; render(); }
    return;
  }
  // 會議範本（2026-11-13）：#mtemplates。
  if (t === "mtemplates") { S.view = "mtemplates"; S.mtplEd = null; S.msg = ""; await reloadTemplates(); render(); return; }
  // 會議（2026-11-02）：#meetings 清單，#meetings/<id> 一場。
  const mt = /^meetings(?:\/([0-9a-f-]{36}))?$/.exec(t || "");
  if (mt) {
    S.view = mt[1] ? "meeting" : "meetings"; S.mtSel = mt[1] || null; S.mtDraft = null; S.msg = "";
    await reloadMeetings();
    if (mt[1]) { const m = (S.meetings || []).find(x => x.id === mt[1]); if (m) S.mtDraft = { pk: { ticked: (m.attendees || []).map(a => a.user_id), q: "", mq: "", teams: [], level: "view" } }; }
    render(); return;
  }
  // 活動上架（2026-11-01）：#events 清單，#events/<代號> 一場。打開一場時順便載場地清單（「場地」那一格要用；資料表還沒建就不畫）。
  // 2026-11-24：一場活動有分頁，#events/<代號>/<分頁>。沒寫分頁就照預設（UI.evTabOf）。
  const ev = /^events(?:\/([a-z0-9-]+)(?:\/([a-z]+))?)?$/.exec(t || "");
  if (ev) {
    S.view = ev[1] ? "event" : "events"; S.evSel = ev[1] || null; S.msg = ""; S.evTab = (ev[1] && ev[2]) || null;
    await Promise.all([reloadEvents(ev[1]), reloadProjects(), ev[1] ? D.loadVenues().then(r => { S.venues = r; }).catch(() => {}) : null,
      ev[1] && !S.terms ? D.loadTerms().then(r => { S.terms = r; }).catch(() => { S.terms = []; }) : null]);
    S.evLinks = null; S.evRc = undefined; S.evPhotos = undefined; S.evUp = null; S.evPhUp = null; S.vnOpen["ev-cover-link"] = false;
    S.vnOpen["ev-bzh-fold"] = false; S.vnOpen["ev-ben-fold"] = false;   // 說明底下的預覽：每次打開一場活動都是收著的
    S.evLb = null; S.evSpOpenIds = {}; S.evSpeakers = undefined; S.evTickets = undefined; S.evSpUp = null; S.evSpDraft = null; S.evTkDraft = null; S.evSpFound = undefined; S.evSpQ = ""; S.vnOpen["ev-sp-new"] = false; S.vnOpen["ev-tk-new"] = false;
    const one = ev[1] && (S.events || []).find(x => x.slug === ev[1]);
    // 2026-11-13：只在紀錄裡的舊活動沒有對外頁、報名、簽到，這裡是空的；直接去它在 Records 的記分卡。
    if (one && one.source === "import") { location.replace("/admin/records/#overview/" + encodeURIComponent(one.id)); return; }
    if (one) S.evLinks = await D.loadEventLinks(one.id).catch(() => null);
    render();
    if (!one) return;
    // 活動照片（2026-11-23）：讀的門是這場活動「改」以上，改不動的人那一塊本來就不畫，不用問資料庫。
    // 講者與報名類型（2027-01-02）同一道門，一起讀。
    if (UI.canEditWs(S.me, one.workspace_id)) {
      await Promise.all([reloadEventPhotos(one.id), reloadEventSpeakers(one.id), reloadEventTickets(one.id)]);
      if (S.view === "event" && S.evSel === one.slug) render();
    }
    else { S.evPhotos = []; S.evSpeakers = []; S.evTickets = []; }
    // 活動結束之後打開，先把報名的人抄進 Records 一次（錄取的人結束後算到了），再讀 Records 的數字。失敗不吵。
    if (one.form_id && new Date(one.ends_at || one.starts_at || 0) < new Date()) await D.syncEvent(one.id).catch(() => {});
    S.evRc = await D.loadRecordsCard(one.id);
    if (S.view === "event" && S.evSel === one.slug) render();
    return;
  }
  // 專案（2026-12-26）：#projects 清單，#projects/<id> 一個（id 是 project:代號，網址裡編碼過）。
  const pj = /^projects(?:\/(.+))?$/.exec(t || "");
  if (pj) {
    let sel = null; try { sel = pj[1] ? decodeURIComponent(pj[1]) : null; } catch (e) { sel = null; }
    if (S.pjSel !== sel) { S.pjEvDraft = null; }
    S.view = sel ? "project" : "projects"; S.pjSel = sel; S.msg = "";
    render();
    await Promise.all([reloadProjects(), reloadEvents()]);
    render(); return;
  }
  // 場地（2026-11-10）：#venues 清單，#venues/<id> 一個。
  const vn = /^venues(?:\/([0-9a-f-]{36}))?$/.exec(t || "");
  if (vn) {
    S.view = vn[1] ? "venue" : "venues"; S.vnSel = vn[1] || null; S.msg = ""; S.venue = null;
    if (vn[1]) render();
    await reloadVenues(vn[1]); render(); return;
  }
  // 行銷需求單（2026-10-31）：#request 是送單那一頁（#request/<id> 只是信裡的直達，一樣開那一頁），#requests 是佇列，#requests/<id> 打開那一張。
  const m = /^(requests?)(?:\/([0-9a-f-]{36}))?$/.exec(t || "");
  if (m) {
    // 沒被派進需求工作區的人（RLS 只會給他自己的單）直接開他自己那一頁。
    // 2026-11-13：需求單只剩側欄一行，佇列是那一頁裡的第二個切換（UI.rqQueueOk）。
    const queueOk = UI.rqQueueOk(S.me);
    S.view = m[1] === "request" || !queueOk ? "request" : "requests"; S.msg = ""; S.rqSel = m[1] === "requests" && queueOk ? (m[2] || null) : null;
    await reloadRequests(); render(); return;
  }
  // 2026-11-14：以前的「待辦」搬到 /home/，這一頁改叫「各 team」（#teams；舊的 #home 也接）。
  S.view = (t === "teams" || t === "home") ? "home" : "list"; S.msg = ""; S.sel = new Set(); await reloadList(); render();
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
    event_id: (S.rqDraft && S.rqDraft.event_id) || "", event_title: (S.rqDraft && S.rqDraft.event_title) || "",
    // 需求負責人就是登入的人；有兩個 team 才讀下拉，一個 team 直接用那一個。
    title: val("rq-title"), owner_team: val("rq-owner-team") || UI.rqMyTeams(S.me)[0] || "", owner_id: (S.me && S.me.id) || "", goal_cta: val("rq-goal"),
    platforms: UI.RQ_PLATFORMS.filter(p => { const el = document.getElementById("rq-pf-" + p); return el && el.checked; }),
    platform_other: val("rq-pf-note"), key_line: val("rq-key"), draft: val("rq-draft"), draft_doc_url: val("rq-doc"),
    publish_on: val("rq-publish"), other_notes: val("rq-notes"),
    must: Array.from({ length: count("rq-must-text-") }, (_, i) => ({ text: val("rq-must-text-" + i), confirmed_by: val("rq-must-by-" + i) })),
    refs: Array.from({ length: count("rq-ref-url-") }, (_, i) => ({ url: val("rq-ref-url-" + i), note: val("rq-ref-note-" + i) })),
    shots: Array.from({ length: count("rq-shot-who-") }, (_, i) => ({ who: val("rq-shot-who-" + i), what: val("rq-shot-what-" + i), seconds: val("rq-shot-sec-" + i), note: val("rq-shot-note-" + i) })),
    closing: { who: val("rq-close-who"), seconds: val("rq-close-sec"), note: val("rq-close-note") },
  });
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
    // datetime-local 給的是一串沒有時區的字。直接送進 timestamptz 會被當成 UTC，填 09:00 會變成下午五點才開放。
    // 2026-11-23 起這兩格一律是台灣時間（UI.evFromTaipei 補上 +08:00），跟活動編輯頁「報名」那一段的兩格同一套，
    // 人在哪一個時區填，存進去的都是同一個時間。以前是照這台電腦的時區算，而且畫面印的是 UTC，每存一次就差一次時區。
    opens_at: UI.evFromTaipei(val("fopen")),
    closes_at: UI.evFromTaipei(val("fclose")),
    notify_by: val("fnotify"),
    interview_url: val("fcal"),
    ...(document.getElementById("fteam") ? { team: val("fteam") } : {}),
    // 2026-12-20-form-engine.sql 的兩欄：那兩格只在資料庫有那兩欄的時候畫（ui.js 看 form 裡有沒有 max_responses）。
    ...(document.getElementById("fmax") ? { max_responses: val("fmax") } : {}),
    ...(document.getElementById("fhidden") ? { hidden_fields: val("fhidden") } : {}),
    // 2026-12-21-form-received-mail.sql：送出確認信的開關，資料庫沒有那一欄就不畫、不送。
    ...(document.getElementById("fconfirm") ? { confirm_mail: document.getElementById("fconfirm").checked } : {}),
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
      // 畫布上的一塊（shared/forms.js 的 blockHTML）。讀回來、擋兩件事、存；換了題型或改了邏輯面板的下拉要重畫那一塊。
      const old = (S.questions || []).find(x => x.id === id); if (!old) return;
      const q = UI.F.readBlock(box, old);
      if (!q.label && !["page", "text"].includes(q.type)) return fail(T("err.qEmpty"));
      if (UI.F.isChoice(q) && q.options.length < 2) return fail(T("err.qOpts"));
      await D.saveQuestion(id, q);
      Object.assign(old, q);
      dirty.mark(key, val); UI.autosaveState(box, "saved"); UI.toast(T("msg.saved"));
      if (field && field.dataset && field.dataset.fxRedraw) { if (box.querySelector(".fx-logic[open]")) S.fx.logicOpen.add(id); render(); }
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
      // 封面的連結換了：saveEventFields 會接著補上同意（放上封面就算確認過同意）。這一條路存完不重畫，所以封面那一行「對外看得到沒」自己換。
      const coverChanged = await saveEventFields(ev, patch);
      Object.assign(ev, patch);
      dirty.mark(key, val); UI.autosaveState(box, "saved"); UI.toast(T("msg.evSaved"));
      if (coverChanged) { const st = document.getElementById("ev-cover-state"); if (st) st.innerHTML = UI.evCoverStateHTML(ev, true, false); }
      return;
    }
    // 活動編輯頁「報名」那一段的開放與截止時間（2026-11-23，Paul：「where can I set registration open windows?」）。
    // 存的是報名表那兩欄，走的是表單編輯頁同一支 D.saveForm（門是資料庫的 form_can_edit），沒有新的資料庫函式。填的是台灣時間。
    // 存完不重畫（重畫會把正在打的那一格的游標弄掉），只換「報名表」旁邊的標籤與底下那一句（還沒到開放時間、過了截止時間）。
    if (act === "ev-fwin") {
      const f = (S.forms || []).find(x => x.id === id); if (!f) return;
      const read = n => { const el = box.querySelector(`[name="${n}"]`); return el ? UI.evFromTaipei(el.value) : ""; };
      const patch = { opens_at: read("opens_at"), closes_at: read("closes_at") };
      await D.saveForm(id, patch);
      const saved = { opens_at: patch.opens_at || null, closes_at: patch.closes_at || null };
      Object.assign(f, saved); if (S.form && S.form.id === id) Object.assign(S.form, saved);
      dirty.mark(key, val); UI.autosaveState(box, "saved"); UI.toast(T("msg.saved"));
      const ev = (S.events || []).find(x => x.form_id === id);
      if (ev) {
        const bits = UI.evFormBits(ev, f, S.evSigned), tags = document.getElementById("ev-fm-tags"), hint = document.getElementById("ev-fm-hint");
        if (tags) tags.innerHTML = bits.tags; if (hint) hint.innerHTML = bits.hint;
      }
      return;
    }
    if (act === "mt-min") {
      const m = (S.meetings || []).find(x => x.id === id); if (!m) return;
      const mins = readMinutes("mtm"), tplEl = document.getElementById("mtm-tpl"), tpl = tplEl ? (tplEl.value || null) : (m.template_id || null);
      await D.saveMeetingMinutes(id, tpl, mins);
      m.minutes = mins.filter(x => x.h.trim() || x.text.trim()); m.template_id = tpl;
      S.mtDraft = Object.assign({}, S.mtDraft, { minutes: mins, tpl });
      dirty.mark(key, val); UI.autosaveState(box, "saved"); UI.toast(T("msg.mtmSaved"));
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
    fail((act === "ev-save" ? T("err.evSave") : act === "mt-save" ? T("err.mtSave") : act === "mt-min" ? T("err.mtmSave") : act === "rq-save" ? T("err.rqSave") : T("err.save")) + D.says(e));
  }
}
// 一場既有會議的勾人那一塊在 data-autosave 容器外面（勾了要先重畫，pk 的狀態在 S.mtDraft）；重畫完這裡補存一次。
function autosaveMeeting() {
  if (S.view !== "meeting" || !S.mtSel) return;
  const box = document.querySelector('[data-autosave="mt-save"]'); if (!box) return;
  onAutosave("mt-save", box, null);
}
async function openForm(id) {
  S.busy = true; S.msg = ""; S.fx = { mode: "edit", menuAt: null, filter: "", logicOpen: new Set() }; render();
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
  if (act === "ask-cancel") { UI.cancelAsk(S, root()); const lb = document.getElementById("ev-lb"); if (lb) UI.cancelAsk(S, lb); return; }
  // ── 會議（2026-11-02）──
  if (act === "mt-open") { e.preventDefault(); history.pushState(null, "", "#meetings/" + id); await openTab("meetings/" + id); return; }
  if (act === "mt-back") { history.pushState(null, "", "#meetings"); await openTab("meetings"); return; }
  if (["pk-team", "pk-all", "pk-none", "pk-untick"].includes(act) && (S.view === "meetings" || S.view === "meeting")) {
    keepMtDraft(); S.mtDraft = Object.assign({}, S.mtDraft, { pk: UI.pkReduce((S.mtDraft || {}).pk, S.cadres, [], b, true) }); render(); autosaveMeeting(); return;
  }
  // 「記下來」只剩新開一場（2026-11-06 起既有那一場改了就存，見 onAutosave）。
  if (act === "mt-save") {
    const d = readMeeting(); S.mtDraft = Object.assign({}, S.mtDraft, d);
    if (!d.title) { S.msg = T("err.mtTitle"); render(); return; }
    if (!d.starts_at || !d.ends_at) { S.msg = T("err.mtTime"); render(); return; }
    S.busy = true; S.msg = ""; render();
    try {
      const newId = await D.saveMeeting(null, d);
      // 新開一場的時候就選了範本或打了字：會建好之後接著存紀錄。紀錄沒存進去不擋建會，訊息講清楚。
      let minMsg = "";
      if (document.getElementById("mtn-min")) {
        const mins = readMinutes("mtn"), tpl = ((document.getElementById("mtn-tpl") || {}).value) || null;
        if (tpl || mins.some(x => x.text.trim())) { try { await D.saveMeetingMinutes(newId, tpl, mins); } catch (x) { minMsg = " " + T("err.mtmSave") + D.says(x); } }
      }
      S.busy = false; S.msg = T("msg.mtCreated", { title: d.title }) + minMsg;
      S.mtDraft = null; S.vnOpen["mt-new"] = false; history.pushState(null, "", "#meetings/" + newId); await openTab("meetings/" + newId);
    } catch (e) { S.busy = false; S.msg = T("err.mtSave") + D.says(e); render(); }
    return;
  }
  // 會議紀錄（2026-11-13）：加一段、拿掉一段。
  if ((act === "mtm-add" || act === "mtm-del") && (S.view === "meetings" || S.view === "meeting")) {
    const idp = b.dataset.p === "mtm" ? "mtm" : "mtn";
    keepMtDraft();
    const mins = (S.mtDraft.minutes || []).slice();
    if (act === "mtm-add") mins.push({ h: "", text: "" });
    else {
      const i = Number(b.dataset.i); const x = mins[i];
      if (x && String(x.text || "").trim() && UI.needAsk(S, b, T("confirm.mtmDel", { h: x.h || T("mtm.hPh") }))) return;
      mins.splice(i, 1); if (!mins.length) mins.push({ h: "", text: "" });
    }
    S.mtDraft.minutes = mins; render();
    if (act === "mtm-add") { const hs = document.querySelectorAll(`#${idp}-min .mtm-h`); if (hs.length) hs[hs.length - 1].focus(); }
    if (idp === "mtm") saveMinutesNow();
    return;
  }
  // 會議範本頁（2026-11-13）
  if (act && act.startsWith("mtpl-") && S.view === "mtemplates") {
    if (act === "mtpl-new") { S.mtplEd = { id: null, title: "", scope: "", sections: [{ h: "", hint: "" }] }; S.msg = ""; render(); const t = document.getElementById("mtpl-title"); if (t) t.focus(); return; }
    if (act === "mtpl-edit") { const t = UI.mtTplById(S.mtpl, id); if (!t) return; S.mtplEd = { id: t.id, title: t.title, scope: t.scope || "", sections: (t.sections || []).map(x => ({ h: x.h || "", hint: x.hint || "" })) }; S.msg = ""; render(); return; }
    if (act === "mtpl-cancel") { S.mtplEd = null; render(); return; }
    if (["mtpl-add", "mtpl-del", "mtpl-up", "mtpl-down"].includes(act)) {
      const ed = readTplEd(); const i = Number(b.dataset.i); const sec = ed.sections;
      if (act === "mtpl-add") sec.push({ h: "", hint: "" });
      if (act === "mtpl-del") { sec.splice(i, 1); if (!sec.length) sec.push({ h: "", hint: "" }); }
      if (act === "mtpl-up" && i > 0) [sec[i - 1], sec[i]] = [sec[i], sec[i - 1]];
      if (act === "mtpl-down" && i < sec.length - 1) [sec[i + 1], sec[i]] = [sec[i], sec[i + 1]];
      S.mtplEd = ed; render();
      if (act === "mtpl-add") { const hs = document.querySelectorAll("#mtpl-ed .mtpl-h"); if (hs.length) hs[hs.length - 1].focus(); }
      return;
    }
    if (act === "mtpl-save") {
      const ed = readTplEd(); S.mtplEd = ed;
      if (!ed.title) { S.msg = T("mtpl.needTitle"); render(); return; }
      const sections = ed.sections.filter(x => x.h);
      if (!sections.length) { S.msg = T("mtpl.needSec"); render(); return; }
      S.busy = true; S.msg = ""; render();
      try { await D.saveMeetingTemplate(ed.id, { title: ed.title, scope: ed.scope, sections }); await reloadTemplates(); S.busy = false; S.mtplEd = null; S.msg = T("mtpl.saved", { title: ed.title }); render(); }
      catch (x) { S.busy = false; S.msg = T("err.mtplSave") + D.says(x); render(); }
      return;
    }
    if (act === "mtpl-archive" || act === "mtpl-restore") {
      const t = UI.mtTplById(S.mtpl, id); if (!t) return;
      S.busy = true; S.msg = ""; render();
      try { await D.archiveMeetingTemplate(id, act === "mtpl-archive"); await reloadTemplates(); S.busy = false; S.msg = T(act === "mtpl-archive" ? "mtpl.archived" : "mtpl.restored", { title: t.title }); render(); }
      catch (x) { S.busy = false; S.msg = T("err.mtplSave") + D.says(x); render(); }
      return;
    }
  }
  // Google 日曆（2026-11-23）：再送一次，或現在同步回覆。
  if (act === "mt-gcal") {
    S.busy = true; S.msg = ""; render();
    try { const r = await D.gcalRetry(id); await reloadMeetings(); S.busy = false; S.msg = T(r === "ok" ? "msg.gcalOk" : "msg.gcalFail"); render(); }
    catch (e) { S.busy = false; S.msg = T("err.mtSave") + D.says(e); render(); }
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
  // ── 場地（2026-11-10）──
  if (act === "vn-open") { e.preventDefault(); history.pushState(null, "", "#venues/" + id); await openTab("venues/" + id); return; }
  if (act === "vn-back") { history.pushState(null, "", "#venues"); await openTab("venues"); return; }
  if (act === "vn-create") {
    const p = readVenue("vn-new");
    if (!p.name) { S.msg = T("err.vnSave") + D.says("need_venue_name"); render(); return; }
    if (!UI.evMapOk(p.map_url)) { S.msg = T("err.vnSave") + D.says("bad_map_url"); render(); return; }
    S.busy = true; S.msg = ""; render();
    try { const nid = await D.saveVenue(null, p); S.busy = false; S.vnOpen["vn-add"] = false; const m = T("vn.created", { name: p.name }); history.pushState(null, "", "#venues/" + nid); await openTab("venues/" + nid); S.msg = m; render(); }
    catch (e) { S.busy = false; S.msg = T("err.vnSave") + D.says(e); render(); }
    return;
  }
  if (act === "vn-save") {
    const p = readVenue("vn-ed");
    if (!UI.evMapOk(p.map_url)) { S.msg = T("err.vnSave") + D.says("bad_map_url"); UI.toast(S.msg); return; }
    S.busy = true; S.msg = ""; render();
    try { await D.saveVenue(id, p); S.busy = false; await reloadVenues(id); S.venues = null; S.msg = T("vn.saved"); render(); }
    catch (e) { S.busy = false; S.msg = T("err.vnSave") + D.says(e); render(); }
    return;
  }
  if (act === "vn-del") {
    const name = (S.venue && S.venue.venue && S.venue.venue.name) || "";
    if (UI.needAsk(S, b, T("vn.deleteAsk", { name }))) return;
    S.busy = true; S.msg = ""; render();
    try { await D.deleteVenue(id); S.busy = false; S.msg = T("vn.deleted", { name }); history.pushState(null, "", "#venues"); const m = S.msg; await openTab("venues"); S.msg = m; render(); }
    catch (e) { S.busy = false; S.msg = T("err.vnSave") + D.says(e); render(); }
    return;
  }
  if (act === "vnc-create") {
    const val = k => { const el = document.getElementById("vnc-" + k); return el ? el.value.trim() : ""; };
    const p = { venue_id: id, name: val("name"), role: val("role"), email: val("email"), phone: val("phone"), line: val("line"), note: val("note") };
    S.busy = true; S.msg = ""; render();
    try { await D.saveVenueContact(null, p); S.busy = false; await reloadVenues(id); S.venues = null; S.msg = T("vn.saved"); render(); }
    catch (e) {
      S.busy = false; S.msg = T("err.vnSave") + D.says(e); render();
      // 加失敗：剛剛打的字放回去，不要叫人重打
      for (const [k, v] of Object.entries(p)) { const el = document.getElementById("vnc-" + k); if (el) el.value = v; }
    }
    return;
  }
  if (act === "vnc-del") {
    const vid = S.venue && S.venue.venue && S.venue.venue.id;
    S.busy = true; S.msg = ""; render();
    try { await D.deleteVenueContact(id); S.busy = false; await reloadVenues(vid); S.venues = null; S.msg = T("vnc.deleted"); render(); }
    catch (e) { S.busy = false; S.msg = T("err.vnSave") + D.says(e); render(); }
    return;
  }
  // ── 活動上架（2026-11-01）──
  if (act === "ev-ask-mkt") {
    const one = (S.events || []).find(x => x.id === id); if (!one) return;
    S.rqDraft = Object.assign(rqDraftLoad(), { event_id: one.id, event_title: UI.evTitle(one) });
    if (!S.rqDraft.title) S.rqDraft.title = UI.evTitle(one);
    rqDraftSave(); history.pushState(null, "", "#request"); await openTab("request"); return;
  }
  if (act === "rq-ev-clear") { S.rqDraft = Object.assign(readRequest(), { event_id: "", event_title: "" }); rqDraftSave(); render(); return; }
  // ── 專案（2026-12-26）──
  if (act === "pj-open") { e.preventDefault(); S.form = null; history.pushState(null, "", UI.pjHref(id)); await openTab("projects/" + encodeURIComponent(id)); return; }
  if (act === "pj-back") { history.pushState(null, "", "#projects"); await openTab("projects"); return; }
  if (act === "pj-create") {
    const val = k => { const el = document.getElementById(k); return el ? el.value.trim() : ""; };
    const d = { team: val("pj-team"), slug: val("pj-slug") || UI.evSlug(val("pj-ten")), title_zh: val("pj-tzh"), title_en: val("pj-ten") };
    S.pjDraft = d;
    if (!d.title_zh && !d.title_en) { S.msg = T("err.pjTitle"); render(); return; }
    if (!d.slug) { S.msg = T("err.evSlug"); render(); return; }
    S.busy = true; S.msg = ""; render();
    try {
      const nid = await D.createProject(d.team, d.slug, d.title_zh, d.title_en);
      S.pjDraft = null; S.vnOpen["pj-new"] = false; S.busy = false;
      // 多了一個工作區，me.ws 要重讀才畫得出「改」的按鈕。
      S.me = await D.loadMe(S.user.id).catch(() => S.me); S.workspaces = await D.loadWorkspaces().catch(() => S.workspaces);
      history.pushState(null, "", UI.pjHref(nid)); await openTab("projects/" + encodeURIComponent(nid));
      S.msg = T("msg.pjCreated", { title: UI.pjTitle({ id: nid, title_zh: d.title_zh, title_en: d.title_en }) }); render();
    } catch (err) { S.busy = false; S.msg = T("err.pjCreate") + D.says(err); render(); }
    return;
  }
  if (act === "pj-ev-add" || act === "pj-ev-out") {
    keepPjDraft();
    const pid = act === "pj-ev-add" ? id : null;
    const evId = act === "pj-ev-add" ? ((document.getElementById("pj-ev-pick") || {}).value || "") : id;
    const one = (S.events || []).find(x => x.id === evId); if (!one) return;
    const pjNow = (S.projects || []).find(p => p.id === S.pjSel);
    S.busy = true; S.msg = ""; render();
    try {
      await D.setEventProject(evId, pid);
      S.busy = false; S.vnOpen["pj-ev-add"] = false;
      S.msg = T("msg.pjEvMoved", { e: UI.evTitle(one), p: pid ? T("msg.pjEvIn", { p: UI.pjTitle(pjNow) }) : T("msg.pjEvOut") });
      await reloadProjects();
    } catch (err) { S.busy = false; S.msg = T("err.pjSave") + D.says(err); }
    render(); return;
  }
  if (act === "pj-ev-create") {
    const val = k => { const el = document.getElementById(k); return el ? el.value.trim() : ""; };
    const d = { team: val("pj-ev-team"), slug: val("pj-ev-slug") || UI.evSlug(val("pj-ev-ten")), title_zh: val("pj-ev-tzh"), title_en: val("pj-ev-ten"), with_form: !!(document.getElementById("pj-ev-withform") || {}).checked };
    S.pjEvDraft = d;
    if (!d.title_zh && !d.title_en) { S.msg = T("err.evTitle"); render(); return; }
    if (!d.slug) { S.msg = T("err.evSlug"); render(); return; }
    S.busy = true; S.msg = ""; render();
    try {
      const evId = await D.createEvent(d.team, d.slug, d.title_zh, d.title_en, d.with_form);
      await D.setEventProject(evId, id);
      S.pjEvDraft = null; S.vnOpen["pj-ev-new"] = false; S.busy = false;
      S.me = await D.loadMe(S.user.id).catch(() => S.me);
      await Promise.all([reloadProjects(), reloadEvents(), reloadList()]);
      S.msg = T("msg.evCreated", { title: UI.evTitle(d) });
    } catch (err) { S.busy = false; S.msg = T("err.evCreate") + D.says(err); }
    render(); return;
  }
  if (act === "pj-form-new") {
    keepPjDraft();
    const el = document.getElementById("pj-form-title"), title = el ? el.value.trim() : "";
    if (!title) { S.msg = T("err.pjFormTitle"); render(); return; }
    S.busy = true; S.msg = ""; render();
    try {
      const fid = await D.createProjectForm(id, title);
      S.busy = false;
      await Promise.all([reloadProjects(), reloadList()]);
      await openForm(fid);
    } catch (err) { S.busy = false; S.msg = T("err.pjSave") + D.says(err); render(); }
    return;
  }
  if (act === "pj-save" || act === "pj-archive") {
    keepPjDraft();
    const p = (S.projects || []).find(x => x.id === id); if (!p) return;
    const val = k => { const el = document.getElementById(k); return el ? el.value.trim() : ""; };
    const zh = act === "pj-save" ? val("pj-e-tzh") : (p.title_zh || ""), en = act === "pj-save" ? val("pj-e-ten") : (p.title_en || "");
    if (!zh && !en) { S.msg = T("err.pjTitle"); render(); return; }
    S.busy = true; S.msg = ""; render();
    try {
      await D.updateProject(id, zh, en, act === "pj-archive" ? b.dataset.on === "1" : p.active !== false);
      S.busy = false; S.msg = T("msg.pjSaved"); await reloadProjects();
    } catch (err) { S.busy = false; S.msg = T("err.pjSave") + D.says(err); }
    render(); return;
  }
  if (act === "ev-back-to") { S.form = null; history.pushState(null, "", "#events/" + id); await openTab("events/" + id); return; }
  if (act === "ev-attach-form") {
    S.busy = true; render();
    try { await D.attachEventForm(id); S.busy = false; await reloadList(); await reloadEvents(S.evSel); S.msg = T("msg.evFormAdded"); }
    catch (err) { S.busy = false; S.msg = T("err.save") + D.says(err); }
    render(); return;
  }
  // ── 活動編輯頁下半的按鈕（2026-11-23）──
  // 開放或關閉報名：跟表單編輯頁改狀態同一條路（D.saveForm，門是資料庫的 form_can_edit），這裡只是多一顆按鈕。
  if (act === "ev-form-status") {
    const to = b.dataset.v === "open" ? "open" : "closed";
    const f = (S.forms || []).find(x => x.id === id); if (!f) return;
    keepEventTyped();
    S.busy = true; S.msg = ""; render();
    try {
      // 開放之前先擋一次：沒有題目的表單開出去，報名的人看到的是空的（表單編輯頁同一條規則）。
      if (to === "open" && (await D.countQuestions(id)) === 0) throw new Error(T("err.noQuestions"));
      await D.saveForm(id, { status: to });
      f.status = to; if (S.form && S.form.id === id) S.form.status = to;
      S.msg = T(to === "open" ? "msg.evFormOpened" : "msg.evFormClosed");
    } catch (err) { S.msg = T("err.evFormStatus") + D.says(err); }
    S.busy = false; render(); return;
  }
  // 建立回饋表：建一張掛在這場活動上的活動後回饋（Records 那邊同一支 rc_save_form），建好直接進那張表的編輯頁。
  if (act === "ev-fb-create") {
    const ev = (S.events || []).find(x => x.id === id); if (!ev) return;
    keepEventTyped();
    S.busy = true; S.msg = ""; render();
    try {
      const fid = await D.createFeedbackForm(id, UI.evFeedbackTitle(ev), lang(), UI.evFeedbackQuestions(lang()));
      location.href = "/admin/records/#forms/" + encodeURIComponent(fid);
    } catch (err) { S.busy = false; S.msg = T("err.evFbCreate") + D.says(err); render(); }
    return;
  }
  if (act === "ev-cover-clear") {
    const ev = (S.events || []).find(x => x.id === id); if (!ev) return;
    if (UI.needAsk(S, b, T("confirm.evCoverClear"))) return;
    keepEventTyped();
    S.busy = true; S.msg = ""; render();
    try {
      const old = ev.cover_url;
      await D.saveEvent(id, { cover_url: "" });
      ev.cover_url = null; ev.cover_consent = false; forgetCover(id);
      await D.removeEventFile(UI.evStoragePath(old));
      S.msg = T("msg.evCoverCleared");
    } catch (err) { S.msg = T("err.evSave") + D.says(err); }
    S.busy = false; render(); return;
  }
  // 活動照片（2026-11-24 改成小圖加放大）：點小圖放大、放大的那一格裡換上一張下一張、關掉。
  if (act === "ev-ph-open") { if (Array.isArray(S.evPhotos)) { S.evLb = id; S.ask = null; paintLightbox(); } return; }
  if (act === "ev-lb-go") { lightboxGo(b.dataset.dir); return; }
  if (act === "ev-lb-close") { const d = document.getElementById("ev-lb"); if (d && d.open) d.close(); return; }
  // 往前一格、往後一格：畫面馬上換，資料庫在後面排隊送（見 evPhQ）。放大的那一格跟著同一張走，所以可以連按。
  if (act === "ev-ph-move") {
    const ev = (S.events || []).find(x => x.slug === S.evSel); if (!ev || !Array.isArray(S.evPhotos) || S.busy) return;
    const dir = b.dataset.dir, ids = UI.evPhotoMove(S.evPhotos, id, dir); if (!ids) return;
    keepEventTyped();
    const by = new Map(S.evPhotos.map(p => [p.id, p]));
    S.evPhotos = ids.map(i => by.get(i)); S.msg = ""; render();
    if (!S.evLb) {
      const again = document.querySelector(`#ev-photos [data-act="ev-ph-move"][data-id="${id}"][data-dir="${dir}"]:not([disabled])`) || document.querySelector(`#ev-photos [data-act="ev-ph-open"][data-id="${id}"]`);
      if (again) again.focus({ preventScroll: true });
    }
    evPhQ = evPhQ.then(() => D.reorderEventPhotos(ev.id, ids)).catch(async err => {
      S.msg = T("err.evPhSave") + D.says(err);
      try { S.evPhotos = await D.loadEventPhotos(ev.id); } catch (_) { /* 讀不回來就留著畫面上的 */ }
      if (S.view === "event" && S.evSel === ev.slug) render();
    });
    return;
  }
  if (act === "ev-ph-del") {
    const ev = (S.events || []).find(x => x.slug === S.evSel); if (!ev || !Array.isArray(S.evPhotos)) return;
    if (UI.needAsk(S, b, T("confirm.evPhDel"))) return;
    keepEventTyped();
    // 拿掉的是正在放大看的那一張：拿掉之後換看下一張（沒有下一張就上一張，都沒有就關掉）。
    const at = S.evPhotos.findIndex(p => p.id === id), next = S.evLb === id ? ((S.evPhotos[at + 1] || S.evPhotos[at - 1] || {}).id || null) : S.evLb;
    S.busy = true; S.msg = ""; render();
    try {
      await evPhQ;
      await D.removeEventFile(UI.evStoragePath(await D.deleteEventPhoto(id)));
      S.evLb = next;
      await reloadEventPhotos(ev.id);
      if (!S.msg) S.msg = T("msg.evPhDeleted");
    } catch (err) { S.msg = T("err.evPhSave") + D.says(err); }
    S.busy = false; render(); return;
  }
  // 說明上面那一排排版的按鈕（2026-11-23）：把選到的字包起來或在行首加記號（UI.evFmtApply 算），選取範圍留著，
  // 再丟一個 input 事件：自動儲存那條路與下面的預覽都是聽 input 的，所以按按鈕跟自己打字是同一條路，不用另外存。
  if (act === "ev-fmt") {
    const ta = document.getElementById(b.dataset.for); if (!ta || ta.readOnly || ta.disabled) return;
    const r = UI.evFmtApply(ta.value, ta.selectionStart, ta.selectionEnd, b.dataset.k);
    ta.value = r.text; ta.focus(); ta.setSelectionRange(r.start, r.end);
    ta.dispatchEvent(new Event("input", { bubbles: true }));
    return;
  }
  // ── 講者（2026-11-23，2027-01-02-event-speakers-tickets.sql）──
  // 從紀錄裡找人：叫 Records 原本那一支（讀不到名錄的人拿到的是空的）。挑了只是把名字與學校帶進「加一位」那一格，還沒有存。
  if (act === "ev-sp-find") {
    keepEventTyped();
    S.busy = true; S.msg = ""; render();
    S.evSpFound = await D.findPeople(S.evSpQ);
    S.vnOpen["ev-sp-new"] = true; S.busy = false; render(); return;
  }
  // 2027-01-03：挑了多帶主題、學校（個人檔案的單位）與照片，只填空的格子（UI.evSpeakerPrefill）。同意照舊不會自己勾。
  if (act === "ev-sp-pick" || act === "ev-sp-unpick" || act === "ev-sp-nophoto") {
    keepEventTyped();
    const p = act === "ev-sp-pick" ? (S.evSpFound || []).find(x => x.id === id) : null;
    if (act === "ev-sp-pick" && !p) return;
    S.evSpDraft = p ? UI.evSpeakerPrefill(S.evSpDraft, p)
                    : act === "ev-sp-nophoto" ? Object.assign({}, S.evSpDraft, { photo_url: "" })
                    : UI.evSpeakerUnpick(S.evSpDraft);
    S.vnOpen["ev-sp-new"] = true; S.msg = ""; render();
    const n = document.getElementById("ev-sp-new-name"); if (n && p) n.focus();
    return;
  }
  if (act === "ev-sp-add" || act === "ev-sp-save") {
    const ev = (S.events || []).find(x => x.slug === S.evSel); if (!ev || !Array.isArray(S.evSpeakers)) return;
    keepEventTyped();
    const adding = act === "ev-sp-add";
    const row = adding ? null : S.evSpeakers.find(x => x.id === id); if (!adding && !row) return;
    const patch = UI.evSpeakerPatch(adding ? S.evSpDraft : row.typed);
    if (!patch) { S.msg = T("err.evSpName"); if (adding) S.vnOpen["ev-sp-new"] = true; render(); return; }
    if (adding && S.evSpDraft && S.evSpDraft.person_id) patch.person_id = S.evSpDraft.person_id;
    // 2026-11-24 起沒有同意的勾：加一位就算確認過本人同意，加完接著補上（紀錄裡是學員、可能未成年的那一種除外，先不對外）。
    // 改既有的那一位：本來對外看得到的，存完補回去（改名字資料庫會退回 false）；本來看不到的不動。
    const minor = adding && !!(S.evSpDraft && S.evSpDraft.person_id && S.evSpDraft.minor);
    const shown = adding ? !minor : !!row.consent;
    S.busy = true; S.msg = ""; render();
    // 從紀錄帶來的照片（2027-01-03）：抄一份到 events bucket 再掛上去，跟自己選檔上傳同一條路。
    // 不直接用紀錄那邊的網址：那邊換照片或拿掉照片會把檔刪掉，這一位在對外頁的照片就跟著壞了。抄不過來就不帶照片，照樣加，講一聲。
    const from = adding && S.evSpDraft ? String(S.evSpDraft.photo_url || "") : "";
    let copied = "";
    if (from) { try { copied = await copyRecordsPhoto(ev.id, from); patch.photo_url = copied; } catch (x) { copied = ""; } }
    try {
      const sid = await D.saveEventSpeaker(ev.id, adding ? null : id, patch);
      if (shown && sid) await keepSpeakerShown(sid);
      if (adding) { S.evSpDraft = null; S.evSpFound = undefined; S.evSpQ = ""; S.vnOpen["ev-sp-new"] = false; if (sid) S.evSpOpenIds[sid] = true; }   // 剛加的那一位先開著：接下來要放照片
      await reloadEventSpeakers(ev.id, sid);
      if (!S.msg) S.msg = T(adding ? (minor ? "msg.evSpAddedMinor" : from ? (copied ? "msg.evSpAddedPhoto" : "msg.evSpAddedNoPhoto") : "msg.evSpAdded") : "msg.evSpSaved");
    } catch (err) {
      if (copied) await D.removeEventFile(UI.evStoragePath(copied));   // 檔抄過來了、講者卻沒加成：不留一個沒人用的檔
      S.msg = T("err.evSpSave") + D.says(err); if (adding) S.vnOpen["ev-sp-new"] = true;
    }
    S.busy = false; render(); return;
  }
  if (act === "ev-sp-move" || act === "ev-sp-del" || act === "ev-sp-photo-clear") {
    const ev = (S.events || []).find(x => x.slug === S.evSel); if (!ev || !Array.isArray(S.evSpeakers)) return;
    const ids = act === "ev-sp-move" ? UI.evPhotoMove(S.evSpeakers, id, b.dataset.dir) : null;
    if (act === "ev-sp-move" && !ids) return;
    if (act === "ev-sp-del" && UI.needAsk(S, b, T("confirm.evSpDel"))) return;
    keepEventTyped();
    const sp = S.evSpeakers.find(x => x.id === id);
    S.busy = true; S.msg = ""; render();
    try {
      if (ids) await D.reorderEventSpeakers(ev.id, ids);
      else if (act === "ev-sp-del") await D.removeEventFile(UI.evStoragePath(await D.deleteEventSpeaker(id)));
      else { await D.saveEventSpeaker(ev.id, id, { photo_url: "" }); if (sp && sp.consent) await keepSpeakerShown(id); await D.removeEventFile(UI.evStoragePath(sp && sp.photo_url)); }
      await reloadEventSpeakers(ev.id);
      if (!S.msg) S.msg = T(ids ? "msg.evSpMoved" : act === "ev-sp-del" ? "msg.evSpDeleted" : "msg.evSpPhotoCleared");
    } catch (err) { S.msg = T("err.evSpSave") + D.says(err); }
    S.busy = false; render(); return;
  }
  // ── 報名類型（免費的，沒有價錢）──
  if (act === "ev-tk-add" || act === "ev-tk-save") {
    const ev = (S.events || []).find(x => x.slug === S.evSel); if (!ev || !Array.isArray(S.evTickets)) return;
    keepEventTyped();
    const adding = act === "ev-tk-add";
    const row = adding ? null : S.evTickets.find(x => x.id === id); if (!adding && !row) return;
    const r = UI.evTicketPatch(adding ? S.evTkDraft : row.typed);
    if (r.err) { S.msg = T(r.err); if (adding) S.vnOpen["ev-tk-new"] = true; render(); return; }
    S.busy = true; S.msg = ""; render();
    try {
      const tid = await D.saveEventTicket(ev.id, adding ? null : id, r.patch);
      if (adding) { S.evTkDraft = null; S.vnOpen["ev-tk-new"] = false; }
      await reloadEventTickets(ev.id, tid);
      if (!S.msg) S.msg = T(adding ? "msg.evTkAdded" : "msg.evTkSaved");
    } catch (err) { S.msg = T("err.evTkSave") + D.says(err); if (adding) S.vnOpen["ev-tk-new"] = true; }
    S.busy = false; render(); return;
  }
  if (act === "ev-tk-move" || act === "ev-tk-del") {
    const ev = (S.events || []).find(x => x.slug === S.evSel); if (!ev || !Array.isArray(S.evTickets)) return;
    const ids = act === "ev-tk-move" ? UI.evPhotoMove(S.evTickets, id, b.dataset.dir) : null;
    if (act === "ev-tk-move" && !ids) return;
    if (act === "ev-tk-del" && UI.needAsk(S, b, T("confirm.evTkDel"))) return;
    keepEventTyped();
    S.busy = true; S.msg = ""; render();
    try {
      if (ids) await D.reorderEventTickets(ev.id, ids); else await D.deleteEventTicket(id);
      await reloadEventTickets(ev.id);
      if (!S.msg) S.msg = T(ids ? "msg.evTkMoved" : "msg.evTkDeleted");
    } catch (err) { S.msg = T("err.evTkSave") + D.says(err); await reloadEventTickets(ev.id); }
    S.busy = false; render(); return;
  }
  // 活動清單的篩選（2026-11-11）。重畫前先把「開一場活動」填到一半的字收進草稿，不然一按篩選就不見了。
  if (act === "ev-fst" || act === "ev-fclear") {
    keepEvDraft();
    S.evF = act === "ev-fclear" ? { q: "", st: "all", team: "" } : Object.assign({}, S.evF, { st: b.dataset.v });
    render(); return;
  }
  if (act === "ev-open") { e.preventDefault(); history.pushState(null, "", "#events/" + b.dataset.slug); await openTab("events/" + b.dataset.slug); return; }
  if (act === "ev-back") { history.pushState(null, "", "#events"); await openTab("events"); return; }
  // 活動編輯頁最上面那一行的「到『上線』那一段」（2026-11-23）：只捲過去，網址不變（網址的 # 後面是分頁名，不能拿來當錨點）。
  // 活動編輯頁換分頁（2026-11-24）：只是換哪一塊看得到，資料不重讀、打到一半的字留著。開著哪一個寫進網址（replaceState，
  // 所以按上一頁是回活動清單，不是一個分頁一個分頁退）。分頁那一排已經捲出畫面的話（從狀態那一行按「到上線那個分頁」不會，但以後可能有別的入口）捲回來。
  if (act === "ev-tab") {
    const ev = (S.events || []).find(x => x.slug === S.evSel); if (!ev || !UI.EV_TABS.includes(b.dataset.tab)) return;
    const go = b.dataset.go || "";
    keepEventTyped();
    S.evTab = b.dataset.tab; S.msg = "";
    history.replaceState(null, "", "#events/" + ev.slug + "/" + S.evTab);
    render();
    const nav = document.getElementById("ev-tabs"), on = nav && nav.querySelector(".subtab.on");
    if (nav && nav.getBoundingClientRect().top < 0) nav.scrollIntoView({ block: "start" });
    if (on) { on.focus({ preventScroll: true }); on.scrollIntoView({ block: "nearest", inline: "nearest" }); }
    // 狀態那一行的「到上線那一段」帶 data-go：換到「設定」之後，那一段不在畫面裡才捲過去（它在最上面，通常不用捲）。
    const sec = go && document.getElementById(go);
    if (sec) { const r = sec.getBoundingClientRect(); if (r.top < 0 || r.top > window.innerHeight * 0.6) sec.scrollIntoView({ block: "start" }); }
    return;
  }
  // 「用場地的連結」：把這場活動掛的那個場地的 Google 地圖連結抄到活動那一格（按了才抄，場地的資料本來只有幹部看得到）。
  if (act === "ev-map-venue") {
    const ev = (S.events || []).find(x => x.id === id), vn = ev && ((S.venues && S.venues.venues) || []).find(v => v.id === ev.venue_id);
    if (ev && vn && vn.map_url) await saveEventMap(ev.id, vn.map_url);
    return;
  }
  // 封面、活動照片、講者的「放上對外頁」與「從對外頁收起來」（2026-11-24，取代以前那三個同意的勾）。
  // 叫的是原本那幾支（save_event 的 cover_consent、set_event_photo_consent、set_event_speaker_consent），門沒有變。
  // 講者要放上去之前多問一次（要滿 18 歲、本人同意）：會走到這裡的只有改版之前沒勾的，還有紀錄裡是學員的。
  if (act === "ev-cover-show" || act === "ev-ph-show" || act === "ev-sp-show") {
    const ev = (S.events || []).find(x => x.slug === S.evSel); if (!ev) return;
    const on = act === "ev-cover-show" ? true : b.dataset.v === "1";
    if (act === "ev-sp-show" && on && UI.needAsk(S, b, T("confirm.evSpShow", { name: b.dataset.name || "" }))) return;
    keepEventTyped();
    S.busy = true; S.msg = ""; render();
    try {
      if (act === "ev-cover-show") { await D.saveEvent(ev.id, { cover_consent: true }); ev.cover_consent = true; S.msg = T("msg.evCoverShown"); }
      else if (act === "ev-ph-show") {
        const saved = await D.setEventPhotoConsent(id, on);
        const ph = (S.evPhotos || []).find(x => x.id === id); if (ph) ph.consent = !!saved;
        S.msg = T(saved ? "msg.evPhConsentOn" : "msg.evPhConsentOff");
      } else {
        const saved = await D.setEventSpeakerConsent(id, on);
        const sp = (S.evSpeakers || []).find(x => x.id === id); if (sp) sp.consent = !!saved;
        S.msg = T(saved ? "msg.evSpConsentOn" : "msg.evSpConsentOff");
      }
    } catch (err) { S.msg = T(act === "ev-sp-show" ? "err.evSpSave" : act === "ev-ph-show" ? "err.evPhSave" : "err.evSave") + D.says(err); }
    S.busy = false; render(); return;
  }
  if (act === "ev-create") {
    const val = id => { const el = document.getElementById(id); return el ? el.value.trim() : ""; };
    const d = { team: val("ev-team"), slug: val("ev-slug") || UI.evSlug(val("ev-ten")), title_zh: val("ev-tzh"), title_en: val("ev-ten"), with_form: !!(document.getElementById("ev-withform") || {}).checked };
    S.evDraft = d;
    if (!d.title_zh && !d.title_en) { S.msg = T("err.evTitle"); render(); return; }
    if (!d.slug) { S.msg = T("err.evSlug"); render(); return; }
    S.busy = true; S.msg = ""; render();
    try {
      await D.createEvent(d.team, d.slug, d.title_zh, d.title_en, d.with_form);
      S.evDraft = null; S.vnOpen["ev-new"] = false; S.busy = false; S.msg = T("msg.evCreated", { title: UI.evTitle(d) });
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
    keepPanelsTyped();
    S.busy = true; S.msg = ""; render();
    try {
      if (pending) {
        if (!UI.evCoverOk(pending.cover_url)) throw new Error(T("err.evCoverRaw"));
        await saveEventFields(ev, pending);
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
    // 草稿可能是改版前存的（那時候負責人是選的），送出一律換成自己。
    p.owner_id = S.me.id; if (!UI.rqMyTeams(S.me).includes(p.owner_team)) p.owner_team = UI.rqMyTeams(S.me)[0] || "";
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
  // 接下、退件、改回進行中（2026-10-29 Paul）。退件會寄信，先問一次，而且回覆一定要寫。
  if (act === "rq-accept" || act === "rq-reject" || act === "rq-reopen") {
    const r = (S.requests || []).find(x => x.id === id); if (!r) return;
    const rp = document.getElementById("rq-reply");
    const reply = rp ? rp.value.trim() : (r.reply || "");
    if (act === "rq-reject") {
      if (!reply) { S.msg = T("err.rqReplyNeeded"); render(); const el = document.getElementById("rq-reply"); if (el) el.focus(); return; }
      if (UI.needAsk(S, b, T("confirm.rqReject", { title: r.title }))) return;
    }
    S.busy = true; S.msg = ""; render();
    try {
      if (act === "rq-accept") { await D.acceptRequest(id); if (reply !== (r.reply || "")) await D.setRequestStatus(id, "in_progress", reply); }
      else if (act === "rq-reject") await D.rejectRequest(id, reply);
      else await D.setRequestStatus(id, "in_progress", null);
      S.busy = false; S.msg = T(act === "rq-accept" ? "msg.rqAccepted" : act === "rq-reject" ? "msg.rqRejected" : "msg.rqReopened", { title: r.title });
      await reloadRequests(); render();
    } catch (e) { S.busy = false; S.msg = T("err.rqSave") + D.says(e); render(); }
    return;
  }
  // ── 成員分頁（2026-10-23，第三次重整批 3）──
  if (act === "members-open") { await openMembers(b.dataset.ws, b.dataset.name); return; }
  // 從別一區的「誰在做」連過來的（#members=），回上一頁就回那一區。
  if (act === "members-back") { if (S.mp && S.mp.fromLink && S.mp.canBack) { history.back(); return; } S.view = (S.mp && S.mp.backView) || "list"; S.msg = ""; render(); return; }
  // 多選加人的 chip、全勾、全取消（2026-10-24）：改 pk 再重畫。打字與勾選走 input / change。
  if (["pk-team", "pk-all", "pk-none", "pk-untick", "pk-selall", "pk-selnone"].includes(act) && S.mp && S.view === "members") {
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
  // 勾起來的人一次改等級或一次移出（2026-12-27，Paul：「I have to change everyone from view to edit, just one by one」）。
  if (act === "members-bulk" && S.mp) {
    const sel = new Set((S.mp.pk || {}).sel || []), rows = S.mp.rows.filter(x => sel.has(x.user_id));
    if (!rows.length) return;
    const op = b.dataset.op, level = (S.mp.pk || {}).blevel || "edit", ws = S.mp.ws;
    if (op === "remove" && UI.needAsk(S, b, T("confirm.maRemove", { n: rows.length }))) return;
    S.busy = true; S.msg = ""; render();
    try {
      await Promise.all(rows.map(r => op === "remove" ? D.unassign(r.user_id, ws) : D.assign(r.user_id, ws, level)));
      S.undo = async () => { S.busy = true; render(); try { await Promise.all(rows.map(r => D.assign(r.user_id, ws, r.level))); await reloadMembers(T("msg.maUndone")); } catch (e) { S.busy = false; S.msg = T("err.mpAssign") + D.says(e); render(); } };
      S.mp.pk = Object.assign({}, S.mp.pk, { sel: [] });
      await reloadMembers(op === "remove" ? T("msg.maRemoved", { n: rows.length }) : T("msg.maLevel", { n: rows.length, level: T("level." + level) }));
    } catch (e) { S.busy = false; S.msg = T("err.mpAssign") + D.says(e); render(); }
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
    S.msg = "";
    try { history.replaceState(null, "", "#forms/" + id + "/" + S.view); } catch (e) { /* 沒有 history 也照樣能用 */ }
    render();
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
      syncRecords();
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
  // 「題目」與「設定」是同一個畫面的兩個分頁（2026-11-24）：按鈕帶 data-sub。已經在這份表單的編輯畫面上就只換哪一塊看得到
  // （不重讀、不重畫，打到一半的字留著）；從別的畫面過來（申請、活動）才真的打開。
  if (act === "open-form") {
    const sub = b.dataset.sub || "";
    if (sub) UI.setFormSub(sub);
    if (sub && (S.view === "form" || S.view === "question") && S.form && S.form.id === id) {
      document.querySelectorAll('.tabp[data-ptabs="form"]').forEach(p => { p.hidden = p.dataset.tabp !== sub; });
      const nav = b.closest("nav");
      if (nav) nav.querySelectorAll("button.subtab").forEach(x => { const on = x === b; x.classList.toggle("on", on); if (on) x.setAttribute("aria-current", "page"); else x.removeAttribute("aria-current"); });
      return;
    }
    await openForm(id); return;
  }
  if (act === "open-apps") { await openApps(id); return; }

  // ── 批 4：審核 ────────────────────────────────────────────────────
  if (act === "filter") { S.filter = b.dataset.f; S.msg = ""; render(); return; }

  if (act === "file-open") {
    // 先開一個空分頁再填網址：等 await 回來才 window.open 會被瀏覽器當成彈出視窗擋掉。
    const w = window.open("", "_blank");
    try { const url = await D.fileUrl(b.dataset.path); if (w) w.location = url; else location.href = url; }
    catch (err) { if (w) w.close(); S.msg = T("err.file") + D.says(err); render(); }
    return;
  }
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
      syncRecords();
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

  // ── 題目畫布（2026-11-13，shared/forms.js）────────────────────────
  // 舊的「一題一頁」那兩顆（q-new、q-edit）改成在畫布上：加一題就是打開「＋」的選單。
  if (act === "q-new") { S.fx.menuAt = S.questions.length; S.fx.filter = ""; S.fx.mode = "edit"; render(); return; }
  if (act === "fx-mode") { S.fx.mode = b.dataset.v === "preview" ? "preview" : "edit"; S.fx.menuAt = null; render(); return; }
  if (act === "fx-menu") {
    const at = Number(b.dataset.at);
    S.fx.menuAt = S.fx.menuAt === at ? null : at; S.fx.filter = ""; render();
    const first = document.querySelector(".fx-menu .fx-mi"); if (first && S.fx.menuAt != null) first.focus();
    return;
  }
  if (act === "fx-insert") { await fxInsert(UI.F.blankBlock(b.dataset.type, S.form.lang === "en"), Number(b.dataset.at)); return; }
  if (act === "fx-dup") {
    const i = S.questions.findIndex(q => q.id === id); if (i < 0) return;
    await fxInsert(UI.F.duplicateOf(S.questions[i], lang() === "en"), i + 1); return;
  }
  if (act === "fx-del") {
    if (UI.needAsk(S, b, T("confirm.delQ"))) return;
    S.busy = true; render();
    try { await D.deleteQuestion(id); await reloadQuestions(); S.msg = ""; }
    catch (err) { S.msg = T("err.delete") + D.says(err); }
    S.busy = false; render(); return;
  }
  if (act === "fx-up" || act === "fx-down") {
    const ids = S.questions.map(q => q.id), i = ids.indexOf(id), j = act === "fx-up" ? i - 1 : i + 1;
    if (i < 0 || j < 0 || j >= ids.length) return;
    await fxReorder(UI.F.moveId(ids, id, ids[j])); return;
  }
  if (act === "fx-add-rule" || act === "fx-add-cond" || act === "fx-del-rule" || act === "fx-del-cond") {
    const q = S.questions.find(x => x.id === id); if (!q) return;
    // 先把那一塊畫面上沒存的字讀進來，再改規則（不然剛打的條件值會被蓋掉）。
    const box = document.querySelector(`[data-fx-blk="${CSS.escape(id)}"]`);
    const cur = box ? UI.F.readBlock(box, q) : q;
    const next = UI.F.logicAction(act, cur, S.questions, Number(b.dataset.rule), Number(b.dataset.cond));
    try { await D.saveQuestion(id, next); Object.assign(q, next); S.fx.logicOpen.add(id); UI.toast(T("msg.saved")); }
    catch (err) { S.msg = T("err.save") + D.says(err); }
    render(); return;
  }
});

// 插一題、重排：存完重讀一次題目（ord 以資料庫為準），新的那一題捲到眼前、游標放在題目那一格。
async function reloadQuestions() { const r = await D.loadForm(S.form.id); S.questions = r.questions; }
async function fxInsert(q, at) {
  S.busy = true; S.fx.menuAt = null; S.fx.filter = ""; render();
  try {
    const newId = await D.insertQuestion(S.form.id, q, at, S.questions);
    await reloadQuestions(); S.msg = ""; S.busy = false; render();
    const el = document.querySelector(`[data-fx-blk="${CSS.escape(newId)}"] [name="label"]`);
    if (el) { el.scrollIntoView({ block: "center" }); el.focus(); if (el.select) el.select(); }
  } catch (err) { S.busy = false; S.msg = T("err.save") + D.says(err); render(); }
}
async function fxReorder(ids) {
  S.busy = true; render();
  try { await D.reorderQuestions(S.questions, ids); await reloadQuestions(); S.msg = ""; }
  catch (err) { S.msg = T("err.reorder") + D.says(err); }
  S.busy = false; render();
}
// 畫布最底下那一格：打 / 打開選單，/ 後面的字篩題型，Enter 加第一個，Esc 收起來。
document.addEventListener("input", e => {
  const t = e.target; if (!t || !t.dataset || !t.dataset.fxSlash || !S.form) return;
  const v = t.value;
  if (v.startsWith("/")) { S.fx.menuAt = S.questions.length; S.fx.filter = v.slice(1); }
  else if (S.fx.menuAt === S.questions.length) { S.fx.menuAt = null; S.fx.filter = ""; }
  render();
  const again = document.querySelector("[data-fx-slash]");
  if (again) { again.value = v; again.focus(); again.setSelectionRange(v.length, v.length); }
});
document.addEventListener("keydown", e => {
  const t = e.target; if (!t || !t.dataset || !t.dataset.fxSlash || !S.form) return;
  if (e.key === "Escape") { S.fx.menuAt = null; S.fx.filter = ""; render(); return; }
  if (e.key === "Enter") { e.preventDefault(); const first = document.querySelector(".fx-tail .fx-mi"); if (first) first.click(); else { S.fx.menuAt = S.questions.length; render(); } }
});
// 預覽：畫完之後在 #fx-pv 上 mount 引擎（跟 /apply/ 同一支，條件邏輯照樣會動，送出不會真的送）。
function mountPreview() {
  const el = document.getElementById("fx-pv"); if (!el || !S.form) return;
  UI.F.mount(el, S.questions, { en: S.form.lang === "en", preview: true,
    onSubmit: async () => UI.toast(T("msg.previewSent")), onUpload: async (q, f) => f.name });
}

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
  keepPanelsTyped();
  render();
}
applyLang(pickLang(location.search, readStored()));
boot();
// 瀏覽器上一頁、或自己在網址列改 #分頁：跟著換分頁（2026-10-23 盤點 F3）。側欄點分頁是 pushState，所以上一頁回得去。
// 場地頁兩個收起來的表單開著沒（重畫之後照舊）。活動編輯頁說明底下那兩格預覽（ev-bzh-fold、ev-ben-fold）也記在這裡：
// 只記在記憶體裡，同一頁重畫之後還開著，重新整理就回到收著。
document.addEventListener("toggle", e => { const t = e.target; if (t && ["vn-add", "vnc-add", "ev-new", "mt-new", "pj-new", "pj-ev-new", "pj-ev-add", "ev-cover-link", "ev-sp-new", "ev-tk-new", "ev-bzh-fold", "ev-ben-fold"].includes(t.id)) S.vnOpen[t.id] = t.open; if (t && t.dataset && t.dataset.spFold) S.evSpOpenIds[t.dataset.spFold] = t.open; }, true);
window.addEventListener("popstate", () => { if (S.me) { S.msg = ""; openTab(location.hash.slice(1)); } });

// 成員分頁的等級下拉（2026-10-23 批 3）：改了就送，toast 帶復原（送回原等級）。
document.addEventListener("change", async e => {
  // 活動頁的照片（2026-11-23）：選了檔案就傳。
  if (S.view === "event" && e.target && e.target.id === "ev-cover-file") { const f = (e.target.files || [])[0]; if (f) await uploadEventCover(e.target.dataset.id, f); return; }
  if (S.view === "event" && e.target && e.target.id === "ev-photo-files") { const fs = Array.from(e.target.files || []); if (fs.length) await uploadEventPhotos(e.target.dataset.id, fs); return; }
  // 講者（2027-01-02）：選了照片就傳。
  if (S.view === "event" && e.target && e.target.dataset && e.target.dataset.act === "ev-sp-photo") { const f = (e.target.files || [])[0]; if (f) await uploadSpeakerPhoto(e.target.dataset.id, f); return; }
  // 活動頁的「放進哪個專案」（2026-12-26）：選了就存。
  if (S.view === "event" && e.target && e.target.id === "ev-project") {
    const evId = e.target.dataset.id, pid = e.target.value || null;
    const one = (S.events || []).find(x => x.id === evId); if (!one) return;
    const to = pid ? (S.projects || []).find(p => p.id === pid) : null;
    keepPanelsTyped();
    S.busy = true; S.msg = ""; render();
    try {
      await D.setEventProject(evId, pid);
      S.busy = false; S.msg = T("msg.pjEvMoved", { e: UI.evTitle(one), p: to ? T("msg.pjEvIn", { p: UI.pjTitle(to) }) : T("msg.pjEvOut") });
      await reloadProjects();
    } catch (err) { S.busy = false; S.msg = T("err.pjSave") + D.says(err); }
    render(); return;
  }
  // 會議紀錄換範本（2026-11-13）：照新範本排段落、打過的字帶過去，重畫；在一場會的頁面上順手存。
  if ((S.view === "meeting" || S.view === "meetings") && e.target && (e.target.id === "mtm-tpl" || e.target.id === "mtn-tpl")) {
    const idp = e.target.id.slice(0, 3), tpl = e.target.value || null;
    const typed = readMinutes(idp);
    keepMtDraft();
    S.mtDraft.minutes = UI.mtMinutesFrom(UI.mtTplById(S.mtpl, tpl), typed); S.mtDraft.tpl = tpl;
    render();
    if (idp === "mtm") saveMinutesNow();
    return;
  }
  if (S.view === "events" && e.target && e.target.id === "ev-fteam") { keepEvDraft(); S.evF = Object.assign({}, S.evF, { team: e.target.value }); render(); return; }
  // 活動頁的「場地」（2026-11-10）：選了就存，地點那一格空的話資料庫順手填場地名字，所以重讀活動。
  if (S.view === "event" && e.target && (e.target.id === "ev-kind" || e.target.id === "ev-term")) {
    const evId = e.target.dataset.id, p = e.target.id === "ev-kind" ? { kind: e.target.value } : { term_id: e.target.value };
    keepPanelsTyped();
    S.busy = true; S.msg = ""; render();
    try { await D.saveEventMeta(evId, p); S.busy = false; await reloadEvents(S.evSel); S.msg = T("ev.metaSaved"); render(); }
    catch (x) { S.busy = false; S.msg = T("err.save") + D.says(x); render(); }
    return;
  }
  // 活動地點的 Google 地圖連結（2027-01-05-map-links.sql）：改完離開那一格就存。
  if (S.view === "event" && e.target && e.target.id === "ev-map") { await saveEventMap(e.target.dataset.id, e.target.value); return; }
  if (S.view === "event" && e.target && e.target.id === "ev-venue") {
    const evId = e.target.dataset.id, vid = e.target.value || null;
    keepPanelsTyped();
    S.busy = true; S.msg = ""; render();
    try { await D.setEventVenue(evId, vid); S.busy = false; await reloadEvents(S.evSel); S.msg = T("vn.saved"); render(); }
    catch (x) { S.busy = false; S.msg = T("err.vnSave") + D.says(x); render(); }
    return;
  }
  // 行銷需求單：換了負責人的 team，人那一格要換成那個 team 的人，所以重畫。
  if (S.view === "request" && e.target && e.target.id === "rq-owner-team") { S.rqDraft = readRequest(); rqDraftSave(); return; }
  // 多選加人（2026-10-24）：勾一個人、換等級，改 pk 再重畫。
  const pkEl = e.target.closest('[data-act="pk-tick"],[data-act="pk-level"],[data-act="pk-sel"],[data-act="pk-blevel"]');
  if (pkEl && (S.view === "meetings" || S.view === "meeting")) { keepMtDraft(); S.mtDraft = Object.assign({}, S.mtDraft, { pk: UI.pkReduce((S.mtDraft || {}).pk, S.cadres, [], pkEl, true) }); render(); autosaveMeeting(); return; }
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
  // 活動頁的說明（2026-11-23）：邊打邊更新下面的預覽。只換預覽那一格裡面，不重畫整頁，游標不會跳。
  if (S.view === "event" && e.target && (e.target.id === "ev-bzh" || e.target.id === "ev-ben")) {
    const prev = document.getElementById(e.target.id + "-prev"); if (prev) prev.innerHTML = UI.evPreviewHTML(e.target.value);
  }
  // 活動清單的搜尋（2026-11-11）：分段的數字要跟著變，所以重畫，再把游標放回去。
  if (S.view === "events" && e.target && e.target.id === "ev-q") {
    keepEvDraft(); S.evF = Object.assign({}, S.evF, { q: e.target.value }); render();
    const again = document.getElementById("ev-q"); if (again) { again.focus(); const n = again.value.length; try { again.setSelectionRange(n, n); } catch (x) { /* search 型的欄位有的瀏覽器不給 */ } }
    return;
  }
  // 會議清單的搜尋（2026-11-11）：跟場地一樣不重畫，只藏列（「記一場會議」填到一半的字不會不見）。
  if (S.view === "meetings" && e.target && e.target.id === "mtl-q") {
    S.mtQ = e.target.value;
    for (const li of document.querySelectorAll("[data-mt-row]")) { const m = (S.meetings || []).find(x => x.id === li.dataset.id); li.hidden = !!m && !UI.meetingMatches(m, S.mtQ); }
    return;
  }
  // 場地清單的搜尋（2026-11-10）：不重畫，只藏起對不上的那幾列，游標不會跳。
  if (S.view === "venues" && e.target && e.target.id === "vn-q") {
    S.vnQ = e.target.value;
    const list = (S.venues && S.venues.venues) || [];
    for (const li of document.querySelectorAll("[data-vn-row]")) {
      const v = list.find(x => li.querySelector(`[data-id="${x.id}"]`)); li.hidden = !!v && !UI.venueMatches(v, S.vnQ);
    }
    return;
  }
  // 會議的勾人那一塊（2026-11-02）：找名字。
  if (e.target && (e.target.dataset.act === "pk-q" || e.target.dataset.act === "pk-mq") && (S.view === "meetings" || S.view === "meeting")) {
    keepMtDraft(); S.mtDraft = Object.assign({}, S.mtDraft, { pk: UI.pkReduce((S.mtDraft || {}).pk, S.cadres, [], e.target, true) }); render(); UI.pkRefocus("mt", e.target.dataset.act === "pk-mq" ? "mq" : "q"); return;
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
  // 活動頁「從紀錄裡找人」那一格：按 Enter 就是按「找」。
  if (e.target && e.target.id === "ev-sp-q") { e.preventDefault(); const find = document.querySelector('[data-act="ev-sp-find"]'); if (find && !find.disabled) find.click(); return; }
  const box = e.target.closest(".picker"); if (!box) return;
  const go = box.querySelector('[data-act="members-assign"],[data-act="ws-assign"]'); if (!go || go.disabled) return;
  e.preventDefault(); go.click();
});
