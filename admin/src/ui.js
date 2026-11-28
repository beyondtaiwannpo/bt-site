// 後台首頁加「申請」那一組的畫面。**esc 是自己的一份**，不從別的資料夾 import
//（跟 app/ 與 availability/ 同一條規矩：資料夾之間不互相依賴）。
// 2026-10-15 後台拆成四個資料夾：資源、團隊頁、校友頁、信件文案搬去 admin/site/，
// 實習護照搬去 admin/passports/，邀請碼搬去 admin/people/。這裡只剩申請。
// 申請管理的畫面。**esc 是自己的一份**，不從別的資料夾 import
//（跟 app/ 與 availability/ 同一條規矩：資料夾之間不互相依賴）。
//
// 2026-10-19 起畫面上的字全部從 ./strings.js 的字典來（T("鍵")），中英兩版並排在那一支裡。
// 這一支只管拼 HTML，不再寫死任何一句給人看的字。怎麼加一句見 README「後台的中英切換」。
import { T, lang, setLang, withLang, isErr } from "./strings.js";
// 表單引擎（2026-11-13，shared/forms.js）：題目畫布、條件邏輯面板、預覽都在那裡，三套表單的編輯器共用。
import * as F from "../../shared/forms.js";
export { F };
export { T, lang, setLang };
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// label 與 hint 是字典的鍵，畫的時候才 T()，這樣切語言不用重建這張表。
export const TYPES = [
  { v: "short",  label: "type.short",  hint: "type.short.hint" },
  { v: "long",   label: "type.long",   hint: "type.long.hint" },
  { v: "single", label: "type.single", hint: "type.single.hint" },
  { v: "multi",  label: "type.multi",  hint: "type.multi.hint" },
];
export const STATUSES = [
  { v: "draft",  label: "status.draft",  tag: "draft",  hint: "status.draft.hint" },
  { v: "open",   label: "status.open",   tag: "open",   hint: "status.open.hint" },
  { v: "closed", label: "status.closed", tag: "closed", hint: "status.closed.hint" },
];
const statusOf = v => STATUSES.find(s => s.v === v) || STATUSES[0];
const typeOf = v => TYPES.find(t => t.v === v) || TYPES[0];

// yyyy-mm-dd。<input type="date"> 只吃這個格式，塞 ISO 全串進去它會空白 ——
// 而空白看起來像「還沒設定」，不像「格式不對」。
export const dateVal = v => (v ? String(v).slice(0, 10) : "");
// datetime-local 要 yyyy-mm-ddThh:mm，而且**不能有時區後綴**。
// 2026-11-23 起報名表的開放與截止不用這一支了：它只是把資料庫那串字切掉後半，印出來的是 UTC 的時間，
// 存回去又當成這台電腦的時間，每存一次就差一次時區。那兩格改用下面的 evTaipei／evFromTaipei（一律台灣時間）。這一支留給測試。
export const dtVal = v => (v ? String(v).slice(0, 16) : "");

// ── 表單清單 ──────────────────────────────────────────────────────────
// canCreate：Director 與 President 才有。一般幹部進來是**唯讀**的，
// 那是 2026-09-07 拍板的三層：看得到自己 team 的申請，但改不動表單。
// 開新表單的內嵌表單（2026-10-19，批 3）。取代瀏覽器原生的 prompt()：那個對話框長得跟網站不搭，
// 手機上尤其醜，而且會把整個分頁卡住。draft = { title, team, kind }；teams 是 Co-President 才有的選單，
// 其他人固定自己的 team。
// 表單上的 team 標籤可以選的六個（跟 admin/people/src/ui.js 的 TEAMS 同一份，test/teams.test.mjs 比對）。
export const TEAM_LABELS = ["Curriculum Team", "Mentorship Team", "Marketing Team", "Sponsorship Team", "Internship Team", "Community Relations Team"];
export function newFormHTML(draft, teams, myTeam, busy) {
  // 2026-11-26：這一頁只開幹部招募的表單（kind 固定是 board）。活動與計畫的報名表從那場活動的頁面開。
  const d = draft || { title: "", team: myTeam || "", kind: "board" };
  const dis = busy ? " disabled" : "";
  return `<div class="card inline-form" id="new-form">
    <h2>${T("newForm.title")}</h2>
    <div class="sub">${T("newForm.sub")}</div>
    <div class="two">
      <label><i>${T("newForm.name")}</i><input id="nf-title" value="${esc(d.title)}" placeholder="${esc(T("newForm.namePh"))}" maxlength="80"${dis}></label>
      ${teams && teams.length
        ? `<label><i>${T("form.team")}</i><select id="nf-team"${dis}>${teams.map(t => `<option${t === d.team ? " selected" : ""}>${esc(t)}</option>`).join("")}</select></label>`
        : `<label><i>${T("form.team")}</i><input id="nf-team" value="${esc(d.team)}" disabled></label>`}
    </div>
    <input type="hidden" id="nf-kind" value="board">
    <div class="row">
      <button class="btn" data-act="new-form-save"${dis}>${busy ? T("newForm.creating") : T("newForm.create")}</button>
      <button class="btn ghost" data-act="new-form-cancel"${dis}>${T("common.cancel")}</button>
    </div>
  </div>`;
}

// 幹部招募那一頁（2026-11-26；以前叫「其他申請」）。newDraft 不是 null 就在清單上面展開內嵌表單；teams 與 myTeam 給那個表單用。
// 這一頁列的是幹部招募的表單（kind 是 board）。綁著活動的報名表不在這裡，在那場活動的頁面裡（2026-11-10 Paul：「application should live under events」）。
// 不是招募、也沒有綁活動的舊申請表（kind 是 program）放在最下面一段，有才印：新的不會再從這裡開。
export function listHTML(forms, canCreate, msg, isPresident, newDraft, teams, myTeam, busy, mpItems, events) {
  const evIds = new Set((events || []).map(e => e.form_id).filter(Boolean));
  const loose = forms.filter(f => !evIds.has(f.id));
  const other = loose.filter(f => f.kind !== "board");
  forms = loose.filter(f => f.kind === "board");
  const row = f => {
    const st = statusOf(f.status);
    return `<li>
      <div class="fhead">
        <b>${esc(f.title)}</b>
        <span class="tag ${st.tag}">${esc(T(st.label))}</span>
      </div>
      <div class="fmeta">${esc(f.team || T("forms.noTeam"))}
        ・${T("forms.count", { n: f.counts.total })}${
          f.counts.received ? T("forms.unhandled", { n: f.counts.received }) : ""}</div>
      <div class="row">
        <button class="btn ghost sm" data-act="open-apps" data-id="${esc(f.id)}">${T("forms.seeApps")}</button>
        <button class="btn quiet" data-act="open-form" data-id="${esc(f.id)}">${
          canCreate ? T("forms.editForm") : T("forms.viewForm")}</button>
      </div>
    </li>`;
  };
  // 2026-10-30 起申請是整個 BT 一個工作區：看得到的人看得到全部表單，team 只是標籤，有兩個以上的 team 就照標籤分段。
  let rows;
  const teamsHere = new Set(forms.map(f => f.team || ""));
  if ((isPresident || teamsHere.size > 1) && forms.length) {
    const byTeam = new Map();
    for (const f of forms) { const k = f.team || T("forms.noTeam"); if (!byTeam.has(k)) byTeam.set(k, []); byTeam.get(k).push(f); }
    rows = [...byTeam.entries()].sort((a, b) => a[0].localeCompare(b[0]))
      .map(([team, fs]) => sectionHTML(esc(team.replace(/\s*Team$/i, "")), `<ul class="flist">${fs.map(row).join("")}</ul>`, { hint: T("forms.perTeam", { n: fs.length }) })).join("");
  } else {
    rows = sectionHTML("", `<ul class="flist">${forms.map(row).join("")}</ul>`);
  }

  return pageHead(T("forms.title"), T("forms.lede"),
      canCreate && newDraft == null ? [{ act: "new-form", label: T("forms.new"), primary: true }] : [])
    + msgHTML(msg)
    + mpLinksHTML(mpItems)
    + (canCreate && newDraft != null ? newFormHTML(newDraft, teams, myTeam, busy) : "")
    + (canCreate ? "" : `<div class="note">${T("forms.readonly")}</div>`)
    + (forms.length ? rows : sectionHTML("",
        emptyHTML(T("forms.empty"), canCreate ? T("forms.emptyCan") : T("forms.emptyCannot"),
                  canCreate ? { act: "new-form", label: T("forms.new") } : null)))
    + (other.length ? sectionHTML(T("forms.otherSec"), `<ul class="flist">${other.map(row).join("")}</ul>`, { hint: T("forms.otherHint") }) : "");
}

// 一份表單裡的三個分頁（2026-10-19，批 3）：申請（審核）、設定（欄位與題目）、活動（簽到與寄信）。
// 位置固定在頁首底下，簽到跟行前信不再藏在底線字後面。view 是 main.js 的 S.view。
// 2026-11-24：「設定」拆成「題目」與「設定」兩個分頁（Paul 看過活動編輯頁的分頁之後：「do the same thing… sign up form should be like that」）。
// 兩個都是同一個畫面（view "form"），兩塊都在畫面裡、沒選到的藏起來（readForm() 照 id 讀整頁，見 formHTML）。
// 開著哪一個用 shared/rail.js 那一份記（id 是 "form"）；已經在這個畫面上就只換哪一塊看得到，不重讀也不重畫（main.js 的 open-form）。
export const FORM_SUBS = ["questions", "settings"];
export const formSub = () => RAIL.pageTabOf("form", FORM_SUBS, "questions");
export const setFormSub = k => { if (FORM_SUBS.includes(k)) RAIL.setPageTab("form", k); };
export function formTabsHTML(form, view) {
  const inForm = view === "form" || view === "question", sub = formSub();
  const on = k => (k === "apps" && view === "apps") || (inForm && k === sub) || (k === "event" && (view === "checkin" || view === "notice"));
  const tab = (k, act, label, extra) => `<button class="subtab${on(k) ? " on" : ""}" data-act="${act}" data-id="${esc(form.id)}"${extra || ""}${on(k) ? ' aria-current="page"' : ""}>${label}</button>`;
  return `<nav class="subtabs ptabs" aria-label="${esc(T("tabs.aria"))}">${tab("apps", "open-apps", T("tabs.apps"))}${tab("questions", "open-form", T("tabs.questions"), ' data-sub="questions"')}${
    tab("settings", "open-form", T("tabs.form"), ' data-sub="settings"')}${tab("event", "open-checkin", T("tabs.event"))}</nav>`;
}
// 一份表單共用的頁首：名字、狀態、team，返回清單。
export function formHeadHTML(form, view, count) {
  const st = statusOf(form.status), ev = form._ev;
  return pageHead(`${esc(form.title)} <span class="tag ${st.tag}">${esc(T(st.label))}</span>`,
      `${ev ? esc(T("form.ofEvent", { t: evTitle(ev) })) : form._pj ? esc(T("pj.formOf", { p: pjTitle(form._pj) })) : esc(form.team || T("forms.noTeam"))}${count != null ? T("form.received", { n: count }) : ""}`, [],
      ev ? { act: "ev-back-to", id: ev.slug, label: T("form.backEvent", { t: evTitle(ev) }) }
        : form._pj ? { act: "pj-open", id: form._pj.id, label: T("pj.backTo", { t: pjTitle(form._pj) }) } : { act: "back-list", label: T("form.back") })
    + formTabsHTML(form, view)
    + (ev && ev.status !== "published" && form.status === "open" ? `<div class="note">${T("ev.formLive")}</div>` : "");
}

// ── 一份表單 ──────────────────────────────────────────────────────────
export function formHTML(form, questions, canEdit, teams, msg, busy, ed) {
  const st = statusOf(form.status);
  const teamPick = teams && teams.length
    ? `<label><i>${T("form.team")}</i><select id="fteam" name="team"${canEdit ? "" : " disabled"}>
        ${teams.map(t => `<option${t === form.team ? " selected" : ""}>${esc(t)}</option>`).join("")}
      </select></label>`
    : "";

  const sub = formSub();
  const panel = (k, body) => `<div class="tabp" data-ptabs="form" data-tabp="${k}"${k === sub ? "" : " hidden"}>${body}</div>`;
  return formHeadHTML(form, "form")
    + msgHTML(msg)
    + panel("questions", sectionHTML(T("form.questions"), `<div class="mini" style="margin-bottom:10px">
      ${T("form.qNote")}</div>
    ${questionsHTML(questions, canEdit, ed, form.lang === "en")}`))
    + panel("settings", ""
    // 2026-11-06 自動儲存：兩個框都是 data-autosave="save-form"，每一格有 name，改了就存（main.js 的 onAutosave）。
    // 「刪掉這份表單」還是按鈕，會丟東西的不自動。
    // 2026-11-23 照做事的順序拆成三段（Paul：「the sequence… doesn't really make any sense」，他看過建議說做）：
    // 先取名字、寫說明，再出題目，最後才決定什麼時候開、開不開。以前「狀態」在題目上面，而沒有題目的表單開不了。
    // 存檔的框變成兩個（上面那段與下面那段），readForm() 是照 id 讀整頁的，哪一個框動了都存整份。
    // 2026-11-24：題目自己一個分頁（上面那個 panel），名字與開關這兩段在「設定」分頁。兩個分頁都在畫面裡，所以 readForm() 照樣讀得到每一格。
    + sectionHTML(T("form.basics"), `<div data-autosave="save-form" data-id="${esc(form.id)}">
    <label><i>${T("form.name")}</i><input id="ftitle" name="title" value="${esc(form.title)}"${canEdit ? "" : " disabled"}></label>
    <label><i>${T("form.intro")}</i>
      <textarea id="fintro" name="intro"${canEdit ? "" : " disabled"}>${esc(form.intro || "")}</textarea></label>
    <div class="two">
      <label><i>${T("form.kind")}</i><select id="fkind" name="kind"${canEdit ? "" : " disabled"}>
        <option value="program"${form.kind === "program" ? " selected" : ""}>${T("kind.program")}</option>
        <option value="board"${form.kind === "board" ? " selected" : ""}>${T("kind.board")}</option>
      </select></label>
      <!-- 一份表單一種語言，題目沒有雙語欄位（2026-09-07 拍板）。
           要中英都收就開兩份表單。理由見 forms.lang 那條欄位註解。 -->
      <label><i>${T("form.lang")}</i><select id="flang" name="lang"${canEdit ? "" : " disabled"}>
        <option value="zh"${form.lang === "zh" ? " selected" : ""}>${T("lang.zh")}</option>
        <option value="en"${form.lang === "en" ? " selected" : ""}>${T("lang.en")}</option>
      </select></label>
      ${teamPick}
    </div>
    ${canEdit ? `<div class="form-foot">${autosaveHint("save-form")}</div>` : ""}</div>`)
    + sectionHTML(T("form.window"), `<div data-autosave="save-form" data-id="${esc(form.id)}">
    <div class="two">
      <!-- 開放與截止一律是台灣時間（2026-11-23）：活動編輯頁「報名」那一段有同樣的兩格，兩邊印的要是同一個時間。 -->
      <label><i>${T("form.opens")}</i>
        <input id="fopen" name="opens_at" type="datetime-local" value="${esc(evTaipei(form.opens_at))}"${canEdit ? "" : " disabled"}></label>
      <label><i>${T("form.closes")}</i>
        <input id="fclose" name="closes_at" type="datetime-local" value="${esc(evTaipei(form.closes_at))}"${canEdit ? "" : " disabled"}></label>
      <!-- 預計通知日：申請人的狀態會顯示成「已收到，X 月 X 日前會通知你」。
           2026-09-07 Paul 選了這句而不是「審核中」。**沒填就只剩「已收到」**，
           不要編一個日期出來。 -->
      <label><i>${T("form.notify")}</i>
        <input id="fnotify" name="notify_by" type="date" value="${esc(dateVal(form.notify_by))}"${canEdit ? "" : " disabled"}></label>
    </div>
    <label><i>${T("form.cal")}</i>
      <input id="fcal" name="interview_url" value="${esc(form.interview_url || "")}" placeholder="https://cal.com/..."${canEdit ? "" : " disabled"}></label>
    ${"max_responses" in form ? `<div class="two">
      <label><i>${T("form.max")}</i><input id="fmax" name="max_responses" type="number" min="1" step="1" value="${esc(form.max_responses || "")}"${canEdit ? "" : " disabled"}></label>
      <label><i>${T("form.hidden")}</i><input id="fhidden" name="hidden_fields" value="${esc((form.hidden_fields || []).join(", "))}" spellcheck="false" placeholder="from"${canEdit ? "" : " disabled"}></label>
    </div>
    <div class="mini" style="margin:-6px 0 14px">${esc(T("form.hiddenHint"))}</div>` : ""}
    ${"confirm_mail" in form ? `<label class="check"><input type="checkbox" id="fconfirm" name="confirm_mail"${form.confirm_mail ? " checked" : ""}${canEdit ? "" : " disabled"}><span>${T("form.confirm")}</span></label>
    <div class="mini" style="margin:-6px 0 14px">${esc(T("form.confirmHint"))}</div>` : ""}

    <label><i>${T("form.status")}</i><select id="fstatus" name="status"${canEdit ? "" : " disabled"}>
      ${STATUSES.map(s => `<option value="${s.v}"${form.status === s.v ? " selected" : ""}>${esc(T(s.label))}</option>`).join("")}
    </select></label>
    <div class="mini" style="margin:-6px 0 16px">${esc(T(st.hint))}</div>
    ${form.status === "open" ? `<div class="mini" style="margin-bottom:16px">${esc(T("form.link"))}：<code>beyondtaiwannpo.com/apply/?f=${esc(form.id)}</code></div>` : ""}
    ${canEdit ? `<div class="form-foot">
      ${autosaveHint("save-form")}
      <span class="sp"></span>
      <button class="btn quiet" data-act="del-form">${T("form.deleteForm")}</button>
    </div>` : ""}</div>`));
}

// 題目那一區：編輯／預覽切換，加上畫布（shared/forms.js 的 canvasHTML）。預覽是一個空的框，main.js 在上面 mount 引擎。
// ed：{ mode: "edit"|"preview", menuAt, filter, logicOpen: Set }。沒給就是編輯、選單都收著。
export function questionsHTML(questions, canEdit, ed, formEn) {
  const e = ed || {};
  const en = lang() === "en";
  if (!questions.length && !canEdit) return emptyHTML(T("form.noQ"), T("form.noQHint"), null);
  return F.modeHTML(e.mode, en)
    + (e.mode === "preview" ? `<div class="fx-pvbox" id="fx-pv" lang="${formEn ? "en" : "zh-Hant"}"></div>`
      : (questions.length ? "" : `<p class="mini">${esc(T("form.noQHint"))}</p>`)
        + F.canvasHTML(questions, { en, canEdit, menuAt: e.menuAt, filter: e.filter, logicOpen: e.logicOpen,
            hint: () => canEdit ? autosaveHint("q-save") : "" }));
}

// ═══════════════════════════════════════════════════════════════════════
// 批 4：審核
// ═══════════════════════════════════════════════════════════════════════
export const APP_STATUS = [
  { v: "received",  label: "app.received",  tag: "" },
  { v: "interview", label: "app.interview", tag: "closed" },
  { v: "accepted",  label: "app.accepted",  tag: "open" },
  { v: "rejected",  label: "app.rejected",  tag: "draft" },
];
const appStatusOf = v => APP_STATUS.find(s => s.v === v) || APP_STATUS[0];
// 審核那三顆按鈕按下去之後，訊息裡用的那個詞。
export const decideWord = status => T((APP_STATUS.find(s => s.v === status) || { label: { zh: status, en: status } }).label);

export function fmtWhen(v) {
  if (!v) return "";
  const d = new Date(v);
  if (isNaN(d)) return "";
  // 2026-11-09：英文畫面用「8 Nov 2026」，中文照舊 2026/11/8。
  if (lang() === "en") { try { return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }); } catch (e) { /* 舊瀏覽器退回下面 */ } }
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

// 一件申請一列。
//
// ⚠ **答案預設是收起來的，但「展開」不打網路** —— 答案已經在手上了
// （見 data.js 的 loadApplications）。審核就是一個一個看，
// 每看一個等一次網路的話，看到第十個就不想看了。
// 一格答案怎麼畫。小標題、說明、換頁不收答案，上面就濾掉了。
// 上傳的檔案：答案是私人 bucket 裡的路徑，按鈕去要一個 60 秒的簽名網址才打得開（2026-12-22-form-uploads.sql）。
// **只有改得動這份表單的人讀得到那個檔**，看得到申請但改不動的人只看到「有檔案」。
export function answerHTML(q, v, canOpen) {
  if (!v) return `<span class="mini">${T("apps.blank")}</span>`;
  if (q.type === "file") return canOpen
    ? `<button type="button" class="btn ghost sm" data-act="file-open" data-path="${esc(v)}">${T("apps.fileOpen")}</button>`
    : `<span class="mini">${T("apps.fileLocked")}</span>`;
  if (q.type === "consent") return v === "yes" ? T("apps.consented") : esc(v);
  return esc(v).replace(/\n/g, "<br>");
}

// ── 幹部招募：錄取了就寄邀請（2026-11-26，資料庫 2027-01-15-recruitment-invites.sql）──
// rc 只有幹部招募的表單才有，是 main.js 組的：
//   { can：這個人是不是 Co-President 或 Senior Adviser（只有他們寄得了邀請）,
//     ready：資料庫那一支跑了沒（false 是還沒跑）, status：{ 申請 id: 狀態 }（joined、pending、expired、on_roster、none）,
//     set：{ rank, team, title_en, title_zh, term, lang }（按「錄取」的時候邀請照這幾格寄）, terms：屆別, teams：team 的名字 }
export const RECRUIT_RANKS = ["member", "adviser", "director"];
export const RECRUIT_STATES = ["joined", "pending", "expired", "on_roster", "none"];
// 那幾格一開始的樣子：職級 Associate、team 是表單的 team、屆別是現在這一屆、職稱先空著（空著就不在名單上放職位）、信用中文。
export function recruitDefaults(form, terms) {
  const cur = (terms || []).find(t => t.status === "current") || (terms || [])[0] || null;
  return { rank: "member", team: (form && form.team) || "", title_en: "", title_zh: "", term: cur ? cur.id : "", lang: "zh" };
}
// 畫面上那幾格 → 要送給資料庫的設定。職稱兩格都空就不帶屆別以外的東西；職級不認得的當 member。純函式。
export function recruitPatch(set) {
  const s = set || {}, t = v => String(v == null ? "" : v).trim();
  return { rank: RECRUIT_RANKS.includes(s.rank) ? s.rank : "member", team: t(s.team), title_en: t(s.title_en), title_zh: t(s.title_zh), term: t(s.term), lang: s.lang === "en" ? "en" : "zh" };
}
// 寄完之後那一句：寄了幾封；跳過的照原因各講一句（同一種原因合成一句，講幾位）。
export function recruitResultNote(res) {
  const r = res || {}, sk = Array.isArray(r.skipped) ? r.skipped : [];
  const by = {};
  for (const x of sk) { const w = ["already_cadre", "invite_pending", "on_roster", "ambiguous_person", "bad_email", "not_accepted"].includes(x && x.why) ? x.why : "other"; by[w] = (by[w] || 0) + 1; }
  return (r.sent ? T("rc.sent", { n: r.sent }) : "") + Object.keys(by).map(w => T("rc.skip." + w, { n: by[w] })).join("");
}
export function recruitPanelHTML(form, rc, busy) {
  if (!form || form.kind !== "board" || !rc) return "";
  if (!rc.can) return `<div class="note" id="rc-panel">${T("rc.waitSenior")}</div>`;
  if (rc.ready === false) return `<div class="note" id="rc-panel">${T("rc.needSql")}</div>`;
  const s = Object.assign(recruitDefaults(form, rc.terms), rc.set || {}), dis = busy ? " disabled" : "";
  const opt = (v, label, cur) => `<option value="${esc(v)}"${v === cur ? " selected" : ""}>${esc(label)}</option>`;
  const teams = [...new Set([s.team, ...(rc.teams || [])].filter(Boolean))];
  return `<div class="card rc-panel" id="rc-panel">
    <h3>${T("rc.title")}</h3>
    <div class="sub">${T("rc.sub")}</div>
    <div class="rc-grid">
      <label><i>${T("rc.rank")}</i><select data-rc="rank"${dis}>${RECRUIT_RANKS.map(r => opt(r, boardName(r), s.rank)).join("")}</select></label>
      <label><i>${T("rc.team")}</i><select data-rc="team"${dis}>${opt("", T("rc.noTeam"), s.team)}${teams.map(t => opt(t, t.replace(/\s*Team$/i, ""), s.team)).join("")}</select></label>
      <label><i>${T("rc.term")}</i><select data-rc="term"${dis}>${(rc.terms || []).map(t => opt(t.id, t.id, s.term)).join("")}</select></label>
      <label><i>${T("rc.titleEn")}</i><input data-rc="title_en" value="${esc(s.title_en)}" maxlength="80" placeholder="${esc(T("rc.titleEnPh"))}"${dis}></label>
      <label><i>${T("rc.titleZh")}</i><input data-rc="title_zh" value="${esc(s.title_zh)}" maxlength="80" placeholder="${esc(T("rc.titleZhPh"))}"${dis}></label>
      <label><i>${T("rc.lang")}</i><select data-rc="lang"${dis}>${opt("zh", T("rc.langZh"), s.lang)}${opt("en", T("rc.langEn"), s.lang)}</select></label>
    </div>
    <div class="mini">${T("rc.help")}</div>
  </div>`;
}
// 一筆已經錄取的申請，名字後面那一顆邀請的狀態；還沒寄或過期了的，Co-President 與 Senior Adviser 多一顆「寄邀請」。
export function recruitTagHTML(a, rc, busy) {
  if (!rc || !rc.can || rc.ready === false || !a || a.status !== "accepted") return "";
  const st = (rc.status || {})[a.id]; if (!RECRUIT_STATES.includes(st)) return "";
  const tag = `<span class="tag ${st === "joined" ? "open" : st === "pending" ? "" : "draft"}" data-rc-state="${st}">${T("rc.st." + st)}</span>`;
  const btn = st === "none" || st === "expired" ? ` <button type="button" class="btn ghost sm" data-act="rc-invite" data-id="${esc(a.id)}"${busy ? " disabled" : ""}>${T(st === "expired" ? "rc.again" : "rc.send")}</button>` : "";
  return tag + btn;
}

export function appsHTML(form, apps, questions, canDecide, sel, filter, pending, msg, busy, rc) {
  const shown = filter === "all" ? apps : apps.filter(a => a.status === filter);
  const counts = {};
  for (const s of APP_STATUS) counts[s.v] = apps.filter(a => a.status === s.v).length;

  const rows = shown.map(a => {
    const st = appStatusOf(a.status);
    const on = sel.has(a.id);
    return `<li>
      <div class="arow">
        ${canDecide ? `<label class="apick"><input type="checkbox" data-act="pick" data-id="${esc(a.id)}"${on ? " checked" : ""}
          aria-label="${T("apps.pick", { name: esc(a.applicant_name) })}"></label>` : ""}
        <div class="abody">
          <div class="fhead">
            <b>${esc(a.applicant_name)}</b>
            <span class="tag ${st.tag}">${esc(T(st.label))}</span>
            ${a.ticket ? `<span class="tag" data-ticket>${T("apps.ticket", { name: esc(evTicketName(a.ticket)) })}</span>` : ""}
            ${recruitTagHTML(a, rc, busy)}
          </div>
          <div class="fmeta">${[esc(a.applicant_school || T("apps.noSchool")), esc(a.applicant_grade || ""),
            esc(a.applicant_email), T("apps.submitted", { when: fmtWhen(a.submitted_at) })].filter(Boolean).join("・")}
            ${a.guardian_email ? "<br>" + T("apps.guardian") + esc(a.guardian_email) : ""}
            ${a.meta && typeof a.meta === "object" && Object.keys(a.meta).length ? "<br>" + T("apps.meta") + Object.entries(a.meta).map(([k, v]) => esc(k) + " = " + esc(v)).join("、") : ""}</div>
          <details class="ans">
            <summary>${T("apps.answers")}</summary>
            <dl>${questions.filter(q => F.isInput(q)).map(q => `<dt>${esc(q.label)}</dt><dd>${answerHTML(q, a.answers.get ? a.answers.get(q.id) : "", canDecide)}</dd>`).join("")}</dl>
          </details>
        </div>
      </div>
    </li>`;
  }).join("");

  const bar = canDecide ? `<div class="bulk${sel.size ? " on" : ""}">
    <span>${sel.size ? T("apps.selected", { n: sel.size }) : T("apps.bulkHint")}</span>
    <span class="btnav-sp"></span>
    <button class="btn ghost sm" data-act="pick-all">${
      shown.length && shown.every(a => sel.has(a.id)) ? T("apps.unselectAll") : T("apps.selectAll")}</button>
    <button class="btn sm" data-act="decide" data-s="interview" ${sel.size && !busy ? "" : "disabled"}>${T("app.interview")}</button>
    <button class="btn sm" data-act="decide" data-s="accepted"  ${sel.size && !busy ? "" : "disabled"}>${T("app.accepted")}</button>
    <button class="btn sm" data-act="decide" data-s="rejected"  ${sel.size && !busy ? "" : "disabled"}>${T("app.rejected")}</button>
  </div>` : "";

  return formHeadHTML(form, "apps", apps.length)
    + msgHTML(msg)
    + pendingHTML(pending, busy)
    + recruitPanelHTML(form, rc, busy)
    + sectionHTML("", `<div class="chips" style="margin-bottom:4px">
      <button class="chip wide${filter === "all" ? " on" : ""}" data-act="filter" data-f="all">${T("apps.all")} ${apps.length}</button>
      ${APP_STATUS.map(s => `<button class="chip wide${filter === s.v ? " on" : ""}" data-act="filter" data-f="${s.v}">${esc(T(s.label))} ${counts[s.v]}</button>`).join("")}
    </div>
    ${bar}
    ${shown.length ? `<ul class="flist alist2">${rows}</ul>`
      : emptyHTML(apps.length ? T("apps.emptyFilter") : T("apps.empty"),
                  apps.length ? T("apps.emptyFilterHint") : T("apps.emptyHint"))}`);
}

// 還沒寄出去的信。**沒有待寄的信就完全不畫**，
// 一個永遠顯示「0 封待寄」的區塊只是雜訊，久了沒有人會看它。
function pendingHTML(pending, busy) {
  if (!pending || !pending.length) return "";
  const stuck = pending.filter(p => p.tries > 0);
  return `<div class="msg info"><span class="msg-k">${T("mail.k")}</span><span>
    ${T("mail.pending", { n: pending.length })}
    ${stuck.length ? T("mail.stuck", { n: stuck.length, err: esc(stuck[0].error || T("mail.noErr")) }) : ""}
    <button class="btn ghost sm" data-act="send-mail" ${busy ? "disabled" : ""}>${busy ? T("mail.sending") : T("mail.sendNow")}</button>
  </span></div>`;
}

// ═══════════════════════════════════════════════════════════════════════
// 批 6：活動營運
// ═══════════════════════════════════════════════════════════════════════

// 簽到。**只列錄取的人** —— 沒錄取的人不會來，
// 把他們放進點名單只會讓現場那個人多滑一百列。
export function checkinHTML(form, apps, canEdit, msg, busy) {
  const list = apps.filter(a => a.status === "accepted");
  const here = list.filter(a => a.checked_in_at).length;
  return formHeadHTML(form, "checkin")
    + msgHTML(msg)
    + (canEdit ? "" : `<div class="note">${T("checkin.readonly")}</div>`)
    + sectionHTML(T("checkin.title"), list.length ? `<ul class="flist">${list.map(a => `<li>
      <div class="arow">
        ${canEdit ? `<label class="apick"><input type="checkbox" data-act="checkin" data-id="${esc(a.id)}"
          ${a.checked_in_at ? "checked" : ""} ${busy ? "disabled" : ""}
          aria-label="${T("checkin.arrived", { name: esc(a.applicant_name) })}"></label>` : ""}
        <div class="abody">
          <div class="fhead"><b>${esc(a.applicant_name)}</b>
            ${a.checked_in_at ? `<span class="tag open">${T("checkin.here")}</span>` : `<span class="tag">${T("checkin.notYet")}</span>`}</div>
          <div class="fmeta">${esc(a.applicant_school || "")}${a.applicant_grade ? "・" + esc(a.applicant_grade) : ""}</div>
        </div>
      </div>
    </li>`).join("")}</ul>` : emptyHTML(T("checkin.empty"), T("checkin.emptyHint")),
      { hint: T("checkin.hint", { n: list.length, here }), actions: canEdit ? [{ act: "open-notice", label: T("checkin.notice"), id: form.id }] : [] });
}

// 寄一封信給這場活動的人（行前信、通知）。
export const NOTICE_TO = [
  { v: "accepted",  label: "to.accepted" },
  { v: "interview", label: "to.interview" },
  { v: "received",  label: "to.received" },
];

export function noticeHTML(form, apps, to, msg, busy) {
  const n = apps.filter(a => to.has(a.status)).length;
  return formHeadHTML(form, "notice")
    + msgHTML(msg)
    + sectionHTML(T("notice.title"), `<label><i>${T("notice.to")}</i></label>
    <div class="chips" style="margin:-8px 0 16px">
      ${NOTICE_TO.map(t => `<button class="chip wide${to.has(t.v) ? " on" : ""}"
        data-act="notice-to" data-t="${t.v}">${esc(T(t.label))}</button>`).join("")}
    </div>
    <label><i>${T("notice.subject")}</i><input id="nsub" placeholder="${esc(T("notice.subjectPh"))}"></label>
    <!-- 純文字，沒有排版工具。理由跟 supabase/email-templates/README.md 一樣：
         版型越花俏越容易被判成垃圾信，而 SPF / DKIM / DMARC 三項全 pass
         是花了一整個階段換來的。 -->
    <label><i>${T("notice.body")}</i>
      <textarea id="nbody" style="min-height:200px" placeholder="${esc(T("notice.bodyPh"))}"></textarea></label>
    <div class="note">${T("notice.note")}</div>
    <div class="form-foot">
      <button class="btn" data-act="notice-send" ${n && !busy ? "" : "disabled"}>${
        busy ? T("notice.sending") : n ? T("notice.send", { n }) : T("notice.pickFirst")}</button>
      <button class="btn ghost" data-act="open-checkin" data-id="${esc(form.id)}">${T("notice.backCheckin")}</button>
    </div>`, { actions: [{ act: "open-checkin", label: T("notice.checkin"), id: form.id }] });
}

// ── 後台的側欄與外殼 ──────────────────────────────────────────────────
// 2026-11-13 起側欄只有一份：shared/rail.js（原本八個資料夾各抄一份）。
// 這裡只把這個資料夾的語言接上去，畫面函式照舊叫 railHTML / shellHTML。
import * as RAIL from "../../shared/rail.js";
export const { GROUPS, ITEMS, AREAS, SECTIONS, wsLevel, canEditWs, canEditAny, canEnter, canSee, railBefore, railAfter } = RAIL;
const senior = RAIL.senior;
export const boardName = board => RAIL.boardName(board, lang());
// railHTML 先算好「這一區的分頁」那一排，shellHTML 把它放在內容最上面（兩支在同一次 render 裡先後被叫）。
let tabsNext = "";
export function railHTML(group, tab, me, counts) { tabsNext = RAIL.areaTabsHTML(group, tab, me, lang()); return RAIL.railHTML(group, tab, me, counts, lang()); }
export function shellHTML(nav, rail, body) { const t = rail ? tabsNext : ""; tabsNext = ""; return RAIL.shellHTML(nav, rail, body, t); }

// ── 每一頁共用的五個小零件。畫面函式只拼這些，不自己寫 class。 ──────────
// 頁首：標題、一句說明、右邊最多兩顆動作。actions = [{ act, label, primary, href, disabled, id }]
export function pageHead(title, lede, actions, back) {
  const btn = a => a.href
    ? `<a class="btn${a.primary ? "" : " ghost"}" href="${esc(a.href)}">${esc(a.label)}</a>`
    : `<button class="btn${a.primary ? "" : " ghost"}" data-act="${esc(a.act)}"${a.id ? ` data-id="${esc(a.id)}"` : ""}${a.disabled ? " disabled" : ""}>${esc(a.label)}</button>`;
  return `${back ? `<button class="back" data-act="${esc(back.act)}"${back.id ? ` data-id="${esc(back.id)}"` : ""}>← ${esc(back.label)}</button>` : ""}
  <header class="page-head"><div class="ph-text"><h1>${title}</h1>${lede ? `<div class="lede">${lede}</div>` : ""}</div>${
    actions && actions.length ? `<div class="actions">${actions.map(btn).join("")}</div>` : ""}</header>`;
}
// 訊息。做成了是綠的，沒做成是橘的。判斷看字典：含有任何一句 err. 開頭的句子就是沒做成（strings.js 的 isErr）。
export function msgKind(msg) {
  const s = String(msg || "");
  if (!s) return "";
  return isErr(s) ? "err" : "ok";
}
export function msgHTML(msg) {
  const k = msgKind(msg);
  // 做成了的訊息走 toast（afterRender），頁首只畫沒做成的：錯誤要留在表單旁邊看得到。
  if (!k || k === "ok") return "";
  return `<div class="msg ${k}" role="status"><span class="msg-k">${k === "err" ? T("msg.err") : T("msg.ok")}</span><span>${esc(msg)}</span></div>`;
}
// ── 回饋（2026-10-23，後台第三次重整批 1）────────────────────────────
// toast：畫面左下角一小條字。掛在 <body> 底下不在 #bt-root 裡，所以 render() 重畫不會把它洗掉。
// 做成了（ok）幾秒後自己消失，可以帶一顆「復原」；沒做成（err）留著，要自己關。
// 同一句話已經在畫面上就不再疊一條。四份一模一樣（test/admin-hub.test.mjs 逐字比對）。
export function toast(msg, undo, opts) {
  if (typeof document === "undefined") return null;
  const kind = msgKind(msg);
  if (!kind) return null;
  // undo 可以是一個函式（鈕上寫「復原」），或 { label, fn }（鈕上寫別的字，例如「同時給兩個工作區『管』」）。
  const u = typeof undo === "function" ? { label: T("toast.undo"), fn: undo } : (undo && undo.fn ? undo : null);
  let box = document.querySelector(".toasts");
  if (!box) { box = document.createElement("div"); box.className = "toasts"; box.setAttribute("aria-live", "polite"); document.body.appendChild(box); }
  for (const t of box.children) if (t.dataset.text === String(msg)) return t;
  const el = document.createElement("div");
  el.className = "toast " + kind; el.dataset.text = String(msg); el.setAttribute("role", kind === "err" ? "alert" : "status");
  el.innerHTML = `<span class="toast-k">${opts && opts.tag ? esc(opts.tag) : kind === "err" ? T("msg.err") : T("msg.ok")}</span><span class="toast-t">${esc(msg)}</span>${
    u ? `<button type="button" class="toast-undo">${esc(u.label)}</button>` : ""}<button type="button" class="toast-x" aria-label="${esc(T("toast.close"))}">×</button>`;
  const gone = () => { el.classList.add("out"); setTimeout(() => el.remove(), 200); };
  el.querySelector(".toast-x").addEventListener("click", gone);
  if (u) el.querySelector(".toast-undo").addEventListener("click", () => { gone(); u.fn(); });
  box.appendChild(el);
  if (kind === "ok" && !(opts && opts.sticky)) setTimeout(gone, u ? 9000 : 6000);
  return el;
}
// inline confirm：取代瀏覽器的 confirm()。按了會丟東西的按鈕，原地長出一行「真的要…？確定／取消」。
// needAsk(S, b, text)：第一次按回 true，並把那一行直接掛上去（**不重畫**，表單裡打到一半的字還在）；
// 按了「確定」再進來時 b.dataset.confirmed 是 "1"，回 false，動作照做。
export function needAsk(S, b, text) {
  if (b.dataset.confirmed === "1") { S.ask = null; return false; }
  // data 記住原按鈕全部的 data-*（2026-10-28）：只靠 act 加 id 的話，用 data-month 分的「刪這個月」會找到頁面上第一顆，
  // 按 10 月的刪除，確認框卻掛在 9 月底下，按「確定」刪的是 9 月。
  const data = {}; for (const [k, v] of Object.entries(b.dataset)) if (k !== "confirmed") data[k] = String(v);
  S.ask = { act: b.dataset.act, id: b.dataset.id || "", text: String(text || ""), data };
  if (typeof document !== "undefined") mountAsk(document, S.ask);
  return true;
}
export function mountAsk(root, ask) {
  if (!ask || !root) return;
  for (const old of root.querySelectorAll(".ask")) old.remove();
  const sel = `[data-act="${ask.act}"]` + (ask.id ? `[data-id="${ask.id}"]` : "");
  const same = x => Object.entries(ask.data || {}).every(([k, v]) => x.dataset[k] === v);
  const b = [...root.querySelectorAll(sel)].find(x => x.dataset.confirmed !== "1" && !x.closest(".ask") && same(x));
  if (!b) return;
  const row = document.createElement("span");
  row.className = "ask";
  row.innerHTML = `<span class="ask-t">${esc(ask.text).replace(/\n+/g, " ")}</span><button type="button" class="btn danger sm" data-act="${esc(ask.act)}"${
    ask.id ? ` data-id="${esc(ask.id)}"` : ""} data-confirmed="1">${esc(T("ask.yes"))}</button><button type="button" class="btn ghost sm" data-act="ask-cancel">${esc(T("common.cancel"))}</button>`;
  // 「確定」那顆要帶著原按鈕的其他 data-*（例如 data-term、data-team），動作才認得。
  const yes = row.querySelector('[data-confirmed="1"]');
  for (const [k, v] of Object.entries(b.dataset)) if (!["act", "id", "confirmed"].includes(k)) yes.dataset[k] = v;
  b.hidden = true;
  b.insertAdjacentElement("afterend", row);
}
export function cancelAsk(S, root) {
  S.ask = null;
  if (!root) return;
  for (const r of root.querySelectorAll(".ask")) { const prev = r.previousElementSibling; if (prev) prev.hidden = false; r.remove(); }
}
// 每次 render() 之後叫一次：ok 的訊息變 toast 並清掉（頁首不畫它），err 的訊息 toast 一次並留在頁首；
// 有待確認的那一行就掛回去；換了畫面就捲回最上面（從名單按「改」不會落在頁尾）。
export function afterRender(S, root) {
  if (S.msg) {
    if (msgKind(S.msg) === "ok") { toast(S.msg, S.undo); S.msg = ""; S.undo = null; S.toasted = ""; }
    else if (S.msg !== S.toasted) { toast(S.msg); S.toasted = S.msg; }
  } else S.toasted = "";
  if (S.ask) mountAsk(root, S.ask);
  if (S.view !== S.lastView) { if (S.lastView !== undefined && typeof window !== "undefined") window.scrollTo(0, 0); S.lastView = S.view; }
  bindPrefetch(root);
}
// ── 側欄預取與版本提示（2026-11-06，後台速度）。四份一模一樣（測試逐字比對）。 ──
// 滑過側欄上別的資料夾那一行，就先把那一頁的 HTML 與四支模組抓進快取（<link rel="prefetch">），
// 真的點下去的時候靜態檔已經在本機。#bt-root 不會被換掉（只有裡面的 innerHTML 會），所以監聽掛一次就好。
const PREFETCHED = new Set();
export function prefetchTargets(href) {
  const path = String(href || "").split("#")[0].split("?")[0];
  if (!path || !path.endsWith("/")) return [];
  const v = loadedVersion();
  const q = v ? `?v=${encodeURIComponent(v)}` : "";
  return [path, ...["main", "ui", "data", "strings"].map(m => `${path}src/${m}.js${q}`)];
}
export function bindPrefetch(root) {
  if (!root || typeof document === "undefined" || root.dataset.prefetch === "1") return;
  root.dataset.prefetch = "1";
  const go = e => {
    const a = e.target && e.target.closest ? e.target.closest("a.rail-item[href]") : null;
    if (!a) return;
    for (const u of prefetchTargets(a.getAttribute("href"))) {
      if (PREFETCHED.has(u)) continue;
      PREFETCHED.add(u);
      const l = document.createElement("link"); l.rel = "prefetch"; l.href = u; document.head.appendChild(l);
    }
  };
  root.addEventListener("mouseover", go);
  root.addEventListener("touchstart", go, { passive: true });
}
// ── 自動儲存（2026-11-06，Paul：「希望每一格都像 Workspaces 那一頁一樣，改了就存」）。四份一模一樣（測試逐字比對）。 ──
// 規矩：打字的欄位（text、textarea）停 800 毫秒或離開欄位就存；選的（select、checkbox、radio、date）改了馬上存。
// 存的時候左下角照樣是 toast（存好了／存不起來），欄位旁邊多一個小字「存檔中…／存好了」。
// 存失敗**不重畫**，剛打的字留在格子裡，再改一下就會再存一次。
// 還留著按鈕的只有會「送出去、丟東西、花錢」的動作：上架與下架、標成可以用、移出成員、結束這一屆、刪掉、寄邀請、排會議、上傳。
//
// 怎麼接（每一個表單三步）：
//   1. ui.js：表單的容器加 data-autosave="<act>"（加 data-id 之類的辨識），欄位要有 name；拿掉「存起來」那顆鈕，
//      放 <span class="autosave" data-for="<act>">改了就存</span>（autosaveHint()）。
//   2. main.js：boot 時 UI.bindAutosave(root(), onAutosave) 一次；onAutosave(act, box, field) 讀 UI.formValues(box) 去存。
//   3. 存的時候 UI.autosaveState(box, "saving") → 成功 "saved" 加 toast → 失敗 "failed" 加錯誤 toast，**不 render()**。
export function debounce(fn, ms) {
  let t = null;
  const d = (...a) => { clearTimeout(t); t = setTimeout(() => { t = null; fn(...a); }, ms); };
  d.flush = (...a) => { clearTimeout(t); t = null; fn(...a); };
  d.cancel = () => { clearTimeout(t); t = null; };
  return d;
}
export const AUTOSAVE_MS = 800;
// 打字的欄位（2026-10-28 Paul：「我要打完一句才存，現在是邊打邊存」）：離開那一格就存，或停手 4 秒才存。
// 勾選、選單這種按了就算數的還是馬上存（flush）。
export const TYPED_MS = 4000;
// 這一格要怎麼存："now"（選的）、"typed"（打字的）、null（不在 data-autosave 容器裡、或標了 data-noauto）。
export function saveMode(el) {
  if (!el || !el.closest || !el.closest("[data-autosave]")) return null;
  if (el.dataset && el.dataset.noauto) return null;
  const tag = String(el.tagName || "").toUpperCase(), type = String(el.type || "").toLowerCase();
  if (tag === "SELECT") return "now";
  if (tag === "TEXTAREA") return "typed";
  if (tag !== "INPUT") return null;
  if (["checkbox", "radio", "date", "time", "datetime-local", "month", "week", "color", "range", "number"].includes(type)) return "now";
  if (["button", "submit", "file", "hidden", "reset", "image"].includes(type)) return null;
  return "typed";
}
// 記每一格最後存成功的值，一樣就不再送一次（離開欄位又停 800 毫秒會觸發兩次）。
export function dirtyTracker() {
  const last = new Map();
  return {
    changed: (key, value) => !last.has(key) || last.get(key) !== value,
    mark: (key, value) => { last.set(key, value); },
    forget: key => { last.delete(key); },
  };
}
// 容器裡每一格讀成 { name: value }：文字去頭尾空白、checkbox 是布林、radio 取選到的、沒有 name 的不讀。
export function formValues(box) {
  const out = {};
  for (const f of box.querySelectorAll("input, select, textarea")) {
    const name = f.name || (f.dataset && f.dataset.name) || "";
    if (!name) continue;
    const type = String(f.type || "").toLowerCase();
    if (type === "checkbox") out[name] = !!f.checked;
    else if (type === "radio") { if (f.checked) out[name] = f.value; else if (!(name in out)) out[name] = out[name]; }
    else out[name] = typeof f.value === "string" ? f.value.trim() : f.value;
  }
  for (const k of Object.keys(out)) if (out[k] === undefined) delete out[k];
  return out;
}
export function autosaveHint(act, extra) { return `<span class="autosave" data-for="${esc(act)}"${extra ? ` ${extra}` : ""}>${esc(T("auto.hint"))}</span>`; }
// 欄位旁邊那個小字：saving → 「存檔中…」、saved → 「存好了」（兩秒後回到「改了就存」）、failed → 「沒存進去…」。
export function autosaveState(box, state) {
  if (!box || !box.querySelector) return;
  const el = box.querySelector(".autosave");
  if (!el) return;
  clearTimeout(el._t);
  el.classList.remove("saving", "saved", "failed");
  if (state === "saving") { el.classList.add("saving"); el.textContent = T("auto.saving"); }
  else if (state === "saved") { el.classList.add("saved"); el.textContent = T("auto.saved"); el._t = setTimeout(() => { el.classList.remove("saved"); el.textContent = T("auto.hint"); }, 2000); }
  else if (state === "failed") { el.classList.add("failed"); el.textContent = T("auto.failed"); }
  else el.textContent = T("auto.hint");
}
// 掛一次在 #bt-root 上（它不會被換掉，裡面的 innerHTML 才會）。onSave(act, box, field) 回 Promise。
// 同一個容器一次只跑一個存檔；跑的時候又改了，跑完再存一次（不丟掉後面那一次改動）。
export function bindAutosave(root, onSave) {
  if (!root || typeof document === "undefined" || root.dataset.autosave === "1") return;
  root.dataset.autosave = "1";
  // waiting：打了字、還在等那 4 秒的那一格。again：存的途中又改了的格子，跑完照順序一格一格補存。
  const timers = new Map(), running = new Map(), again = new Map(), waiting = new Map();
  const run = async (box, field) => {
    if (waiting.get(box) === field) waiting.delete(box);
    const act = box.dataset.autosave;
    if (running.get(box)) { const q = again.get(box) || []; if (!q.includes(field)) q.push(field); again.set(box, q); return; }
    running.set(box, true);
    try { await onSave(act, box, field); }
    finally {
      running.delete(box);
      const q = again.get(box);
      if (q && q.length) { const f = q.shift(); if (!q.length) again.delete(box); run(box, f); }
    }
  };
  const schedule = (field, now) => {
    const box = field.closest("[data-autosave]");
    if (!box || box === root) return;   // 不在任何存檔框裡（例如找名字的搜尋框）就不存；root 自己也掛著 data-autosave="1"
    let d = timers.get(box);
    if (!d) { d = debounce(f => run(box, f), TYPED_MS); timers.set(box, d); }
    if (!now) { waiting.set(box, field); d(field); return; }
    // 2026-10-28：同一個框裡另一格打的字還在等 4 秒，這時候選了下拉，先把打的那一格存掉，不然那幾個字會被下拉蓋過去。
    const w = waiting.get(box);
    if (w && w !== field) { waiting.delete(box); d.flush(w); run(box, field); }
    else d.flush(field);
  };
  // 打的字還在等、或還在存，人就要離開這一頁（點側欄去別頁、關分頁）：先送出去，再讓瀏覽器問一句「確定要離開嗎」。
  const flushAll = () => { for (const [box, f] of [...waiting]) { waiting.delete(box); const d = timers.get(box); if (d) d.flush(f); } };
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flushAll(); });
  window.addEventListener("beforeunload", e => {
    const busy = waiting.size > 0 || running.size > 0;
    flushAll();
    if (busy) { e.preventDefault(); e.returnValue = ""; }
  });
  root.addEventListener("input", e => { const m = saveMode(e.target); if (m === "typed") schedule(e.target, false); });
  root.addEventListener("change", e => { const m = saveMode(e.target); if (m === "now") schedule(e.target, true); else if (m === "typed") schedule(e.target, true); });
  root.addEventListener("focusout", e => { const m = saveMode(e.target); if (m === "typed") { const box = e.target.closest("[data-autosave]"); const d = timers.get(box); if (d && waiting.get(box) === e.target) { waiting.delete(box); d.flush(e.target); } } });
}
// 這一頁載進來的版本：index.html 的 <meta name="bt-version">，scripts/bump-version.sh 會一起改。
export function loadedVersion() {
  const m = typeof document !== "undefined" ? document.querySelector('meta[name="bt-version"]') : null;
  return m ? String(m.content || "") : "";
}
export function versionDiffers(loaded, live) { return !!loaded && !!live && String(loaded) !== String(live); }
// 開頁問一次線上的 version.json（cache: no-store，繞過 GitHub Pages 的 10 分鐘快取）。
// 跟載進來的不一樣就在左下角掛一條「有新版本，重新整理」，不會自己消失。讀不到就不提，不是錯。
export async function checkVersion(rootUrl) {
  if (typeof fetch === "undefined") return false;
  try {
    const r = await fetch(`${rootUrl}version.json`, { cache: "no-store" });
    if (!r.ok) return false;
    const j = await r.json();
    if (!versionDiffers(loadedVersion(), j && j.v)) return false;
    toast(T("ver.newer"), { label: T("ver.reload"), fn: () => location.reload() }, { sticky: true, tag: T("ver.tag") });
    return true;
  } catch (e) { return false; }
}
// ── 成員分頁（2026-10-23，第三次重整批 3）────────────────────────────
// 對一個工作區是「管」的人（Director）在那個東西自己的頁面上（Forms、Resources、兩本護照後台）看到誰在裡面、加人、改等級、移出，
// 不用進 /admin/people/。讀 workspace_members()（where 裡有 can_manage）、寫 assign() / unassign()（第一句 can_manage），
// 沒有新的資料庫函式。找人的清單從 profiles 讀（幹部本來就讀得到所有幹部的名字），不讀 email。四份一模一樣（測試逐字比對）。
// mp = { ws, name, rows: workspace_members 回的, cadres: [{ id, name_zh, name_en, board_role, team }], meId, pk（多選加人的狀態，見 pickerHTML）}
// 兩行的名字（2026-10-24，Paul：名單上有的英文名在旁邊、有的在底下，列高不齊）：第一行中文、第二行英文淡字，
// 永遠是兩個元素（沒有英文名第二行是空的，高度照樣留著），都靠左。名單、成員區兩欄、結束這一屆的「誰留下」都用這一個。
export function nameBlock(p) {
  const zh = String(p && p.name_zh || "").trim(), en = String(p && p.name_en || "").trim();
  const main = zh || en || T("common.noName"), sub = zh && en && zh !== en ? en : "";
  return `<span class="nm"><b>${esc(main)}</b><span class="nm-en">${esc(sub)}</span></span>`;
}
export function mpName(r) {
  const zh = String(r && r.name_zh || "").trim(), en = String(r && r.name_en || "").trim();
  return zh ? (en ? `${zh} (${en})` : zh) : (en || T("common.noName"));
}
export function mpFind(people, q) {
  const s = String(q || "").trim().toLowerCase();
  if (!s) return null;
  const list = people || [];
  return list.find(p => mpName(p).toLowerCase() === s)
    || list.find(p => String(p.name_zh || "").toLowerCase() === s || String(p.name_en || "").toLowerCase() === s)
    || null;
}
// ── 一次加好幾個人（2026-10-24，Paul：「一次很難加好幾個人」）────────────────────────
// 這幾支純函式是底下 membersAreaHTML 的零件（候選人、篩選、勾選、一批復原）。四份一模一樣（測試逐字比對）。
// people：[{ id, name_zh, name_en, board_role, team }]。已經在工作區裡的人與靠職級就有一切的那兩級不列。
// pk = { q, teams: [team…], ticked: [id…], level }。ns 是這一塊在頁面上的前綴（同一頁可以有兩塊，例如 Workspaces 的右欄與新增表單）。
export const PK_TEAMS = ["Curriculum Team", "Mentorship Team", "Marketing Team", "Sponsorship Team", "Internship Team", "Community Relations Team"];
export function pkTeamsOf(p) { return String(p && p.team || "").split(/[,、;；]/).map(s => s.trim()).filter(Boolean); }
// all = true 的時候 Co-President 與 Senior Adviser 也列（會議的出席名單要勾得到他們；工作區那種「靠職級就有」的才不列）。
export function pkCandidates(people, inIds, all) {
  const inWs = new Set(inIds || []);
  return (people || []).filter(p => p && p.id && !inWs.has(p.id) && (all || !["president", "senior_adviser"].includes(p.board_role)));
}
// 找名字是「包含」不是「等於」，中英都找；team chip 勾了幾個就是「其中任何一個」。
export function pkShown(cands, pk) {
  const q = String(pk && pk.q || "").trim().toLowerCase();
  const teams = (pk && pk.teams) || [];
  return (cands || []).filter(p => (!q || mpName(p).toLowerCase().includes(q))
    && (!teams.length || pkTeamsOf(p).some(t => teams.includes(t))));
}
// 「全勾看到的」= 原本勾的加上現在列出來的；篩掉的不動。「全部取消」= 空。
export function pkTickAll(pk, shown) { return [...new Set([...((pk && pk.ticked) || []), ...(shown || []).map(p => p.id)])]; }
export function pkToggle(pk, id, on) { const s = new Set((pk && pk.ticked) || []); if (on) s.add(id); else s.delete(id); return [...s]; }
// 真的會送出去的人：勾了、而且還列得出來（已經在裡面或已經不是幹部的就算勾過也不算）。
export function pkPicked(people, inIds, pk, all) { const ok = new Set(pkCandidates(people, inIds, all).map(p => p.id)); return ((pk && pk.ticked) || []).filter(id => ok.has(id)); }
// 一個事件（打字、勾、換等級、按 chip、全勾、全取消）之後 pk 變成什麼。純函式，四個 main.js 都只呼叫它。
export function pkReduce(pk, people, inIds, el, all) {
  const a = el && el.dataset ? el.dataset.act : "";
  const p0 = Object.assign({ q: "", mq: "", teams: [], ticked: [], level: "view", sel: [], blevel: "edit" }, pk || {});
  // 左欄「在裡面的」也能多選（2026-12-27，Paul：「I have to change everyone from view to edit, just one by one」）：勾、全選、清掉、一次改的等級。
  if (a === "pk-sel") { const v = el.value; return Object.assign(p0, { sel: el.checked ? [...new Set(p0.sel.concat(v))] : p0.sel.filter(x => x !== v) }); }
  if (a === "pk-selall") return Object.assign(p0, { sel: String(el.dataset.ids || "").split(",").filter(Boolean) });
  if (a === "pk-selnone") return Object.assign(p0, { sel: [] });
  if (a === "pk-blevel") return Object.assign(p0, { blevel: el.value });
  if (a === "pk-q") return Object.assign(p0, { q: el.value });
  if (a === "pk-mq") return Object.assign(p0, { mq: el.value });
  if (a === "pk-untick") return Object.assign(p0, { ticked: pkToggle(p0, el.dataset.id, false) });
  if (a === "pk-level") return Object.assign(p0, { level: el.value });
  if (a === "pk-tick") return Object.assign(p0, { ticked: pkToggle(p0, el.value, !!el.checked) });
  if (a === "pk-team") { const t = el.dataset.team; return Object.assign(p0, { teams: p0.teams.includes(t) ? p0.teams.filter(x => x !== t) : p0.teams.concat(t) }); }
  if (a === "pk-all") return Object.assign(p0, { ticked: pkTickAll(p0, pkShown(pkCandidates(people, inIds, all), p0)) });
  if (a === "pk-none") return Object.assign(p0, { ticked: [] });
  return p0;
}
// 復原一整批：把當時那 N 個人移出，之後畫面怎麼變都不影響（先抄一份 id）。回傳移出的人數。
export function batchUndo(ids, unassign) { const snap = [...(ids || [])]; return async () => { for (const id of snap) await unassign(id); return snap.length; }; }
// 重畫之後把游標放回找人的欄位，不然每打一個字就失焦。
export function pkRefocus(ns, which) {
  const el = typeof document !== "undefined" ? document.getElementById(ns + "-" + (which || "q")) : null;
  if (el) { el.focus(); const n = el.value.length; try { el.setSelectionRange(n, n); } catch (x) { /* 有的瀏覽器不給 */ } }
}
// ── 成員區：兩欄（2026-10-24，Paul：「UI 很醜，看不到全部」）────────────────────────────
// 左欄「在裡面的 (N)」、右欄「還沒在裡面的 (M)」，兩欄一樣高（桌機約 60vh、手機各 40vh 上下疊）、各自在裡面捲，
// 控制項（找名字、team chip、全勾／全取消、等級、「加 N 個人」）釘在右欄最上面；左欄也有一個找名字。
// 一列一行 36px：勾選（右欄）・名字・兩個字母的職級標（CP SA DR AD AS）・team 淡字。左欄的列是 名字・職級標・等級下拉・移出。
// 五個面都用這一塊（Workspaces 右欄、四個成員分頁、加一個專案或營隊）。四份一模一樣（測試逐字比對）。
// a = { rows（在裡面的，workspace_members 的形狀）, people（幹部名單，候選人從這裡算）, pk, busy, meId,
//       acts: { level, remove, cleanup }（左欄下拉、移出、清掉多餘指派的 data-act）, canCleanup（Co-President 或 Senior Adviser 才給那條連結）, go: { act, ...data }（右欄那顆按鈕；沒有就不畫）,
//       draft: true 的話是「還沒建立」的模式：左欄列的是勾起來的人（移出 = 取消勾），右欄是還沒勾的 }
export const RANK_TAG = { president: "CP", senior_adviser: "SA", director: "DR", adviser: "AD", member: "AS" };
export const rankTag = board => `<span class="rk" title="${esc(boardName(board))}">${RANK_TAG[board] || "AS"}</span>`;
export function membersAreaHTML(ns, a) {
  const o = a || {};
  const pk = Object.assign({ q: "", mq: "", teams: [], ticked: [], level: "view", sel: [], blevel: "edit" }, o.pk || {});
  const people = o.people || [], rows = o.rows || [];
  const dis = o.busy ? " disabled" : "";
  const short = t => t.replace(/\s*Team$/i, "");
  const teamsHTML = p => pkTeamsOf(p).map(t => `<span class="mini">${esc(short(t))}</span>`).join(" ");
  const byId = Object.fromEntries(people.map(p => [p.id, p]));
  const mq = String(pk.mq || "").trim().toLowerCase();
  const hit = p => !mq || mpName(p).toLowerCase().includes(mq);
  // 左欄
  let left;
  if (o.draft) {
    const picked = pkPicked(people, [], pk, o.all).map(id => byId[id]).filter(Boolean);
    left = { n: picked.length, title: o.titleLeft ? o.titleLeft(picked.length) : T("ma.willAdd", { n: picked.length }),
      items: picked.filter(hit).map(p => `<div class="ma-row">${nameBlock(p)}${rankTag(p.board_role)}${teamsHTML(p)}<span class="sp"></span><button type="button" class="lnk" data-act="pk-untick" data-ns="${esc(ns)}" data-id="${esc(p.id)}"${dis}>${T("ma.untick")}</button></div>`),
      empty: T("ma.willAddNone") };
  } else {
    // 一個人只畫一列（Paul 2026-10-24 看到同一級的人有的灰的有的有下拉）：Co-President 與 Senior Adviser 一律一列「全部（職級）」，
    // 就算 assignments 裡還留著他的指派也不畫成可以改的那種；那些多餘的指派底下給一條「清掉」。其他人同一個 id 只留第一筆。
    const isSenior = b => ["president", "senior_adviser"].includes(b);
    const seniorIds = new Set(people.filter(p => isSenior(p.board_role)).map(p => p.id));
    for (const r of rows) if (isSenior(r.board_role)) seniorIds.add(r.user_id);
    const seniors = people.filter(p => seniorIds.has(p.id))
      .concat(rows.filter(r => seniorIds.has(r.user_id) && !people.some(p => p.id === r.user_id)).map(r => ({ id: r.user_id, name_zh: r.name_zh, name_en: r.name_en, board_role: r.board_role })));
    const seen = new Set();
    const plain = rows.filter(r => !seniorIds.has(r.user_id) && !seen.has(r.user_id) && seen.add(r.user_id));
    const redundant = rows.filter(r => seniorIds.has(r.user_id));
    const seniorRow = p => `<div class="ma-row byrank">${nameBlock(p)}${rankTag(p.board_role)}<span class="mini">${T("grid.byRank")}</span>${p.id === o.meId ? `<span class="mini">${T("mp.you")}</span>` : ""}<span class="sp"></span><span class="mini">${esc(T("level.manage"))}</span></div>`;
    // 左欄的列不印 team（Paul 定的形狀：名字・職級標・等級・移出），欄位窄的時候才放得下。
    // 2026-12-27：有 acts.bulk 的地方，每一列前面一個勾，勾起來的人可以一次改等級或一次移出。
    const selSet = new Set(pk.sel || []);
    const selBox = r => o.acts.bulk ? `<input type="checkbox" class="ma-sel" data-act="pk-sel" data-ns="${esc(ns)}" value="${esc(r.user_id)}" aria-label="${esc(T("ma.selOne", { name: mpName(r) }))}"${selSet.has(r.user_id) ? " checked" : ""}${dis}>` : "";
    const row = r => `<div class="ma-row${selSet.has(r.user_id) ? " on" : ""}">${selBox(r)}${nameBlock(r)}${rankTag(r.board_role)}${r.user_id === o.meId ? `<span class="mini">${T("mp.you")}</span>` : ""}<span class="sp"></span>
        <select data-act="${esc(o.acts.level)}" data-id="${esc(r.user_id)}"${dis}>${["view", "edit", "manage"].map(l => `<option value="${l}"${r.level === l ? " selected" : ""}>${esc(T("level." + l))}</option>`).join("")}</select>
        <button type="button" class="lnk" data-act="${esc(o.acts.remove)}" data-id="${esc(r.user_id)}"${dis}>${T("mp.remove")}</button></div>`;
    const nPeople = seniors.length + plain.length;
    const shownPlain = plain.filter(hit), nSel = plain.filter(r => selSet.has(r.user_id)).length;
    const bulk = o.acts.bulk && plain.length ? `<div class="ma-tools ma-bulk"><button type="button" class="lnk" data-act="pk-selall" data-ns="${esc(ns)}" data-ids="${esc(shownPlain.map(r => r.user_id).join(","))}"${o.busy || !shownPlain.length ? " disabled" : ""}>${T("pk.tickAll")}</button>
        <button type="button" class="lnk" data-act="pk-selnone" data-ns="${esc(ns)}"${o.busy || !nSel ? " disabled" : ""}>${T("pk.untick")}</button><span class="sp"></span>
        <select id="${esc(ns)}-blevel" data-act="pk-blevel" data-ns="${esc(ns)}" aria-label="${esc(T("pk.level"))}"${dis}>${["view", "edit", "manage"].map(l => `<option value="${l}"${pk.blevel === l ? " selected" : ""}>${esc(T("level." + l))}</option>`).join("")}</select>
        <button type="button" class="btn sm" data-act="${esc(o.acts.bulk)}" data-op="level" data-ns="${esc(ns)}"${o.busy || !nSel ? " disabled" : ""}>${T("ma.setN", { n: nSel })}</button>
        <button type="button" class="btn ghost sm" data-act="${esc(o.acts.bulk)}" data-op="remove" data-ns="${esc(ns)}"${o.busy || !nSel ? " disabled" : ""}>${T("ma.removeN", { n: nSel })}</button></div>` : "";
    left = { n: nPeople, title: T("ma.in", { n: nPeople }), tools: bulk,
      items: seniors.filter(hit).map(seniorRow).concat(plain.filter(hit).map(row)), empty: T("ma.inNone"),
      foot: redundant.length && o.acts.cleanup && o.canCleanup
        ? `<div class="ma-foot mini">${T("ma.redundant", { n: redundant.length })} <button type="button" class="lnk" data-act="${esc(o.acts.cleanup)}" data-ids="${esc(redundant.map(r => r.user_id).join(","))}"${dis}>${T("ma.cleanup", { n: redundant.length })}</button></div>`
        : "" };
  }
  // 右欄
  // o.extra（2027-01-25）：右欄每一列 team 那個位置改畫別的。整個工作區用它寫「少哪幾樣」（Paul 2026-11-28 看不懂為什麼大家都在右欄）。
  // 整個工作區（2027-01-24）：右欄列的是「勾起來的那幾樣還沒全部有」的人，不是「一樣都沒有」的人。
  // Paul：「I add everyone into whole BT and they should just have application, cadre, meeting and everything」——大家本來都有幹部護照，
  // 舊的算法把他們都算成「在裡面」，右欄空的，其他幾樣就加不進去。fullIds 是 wsGroupHTML 算好傳進來的。
  const inIds = o.draft ? pk.ticked : (o.fullIds || rows.map(r => r.user_id));
  const cands = pkCandidates(people, inIds, o.all);
  const shown = pkShown(cands, pk);
  const ticked = new Set(pk.ticked);
  const n = o.draft ? 0 : pkPicked(people, inIds, pk, o.all).length;
  const teamsHere = PK_TEAMS.filter(t => cands.some(p => pkTeamsOf(p).includes(t)));
  const chip = t => `<button type="button" class="chip sm${pk.teams.includes(t) ? " on" : ""}" data-act="pk-team" data-ns="${esc(ns)}" data-team="${esc(t)}"${dis}>${esc(short(t))}</button>`;
  const cand = p => `<label class="ma-row pick${ticked.has(p.id) && !o.draft ? " on" : ""}"><input type="checkbox" name="${esc(ns)}-member" value="${esc(p.id)}" data-act="pk-tick" data-ns="${esc(ns)}"${ticked.has(p.id) && !o.draft ? " checked" : ""}${dis}>${nameBlock(p)}${rankTag(p.board_role)}${o.extra ? o.extra(p) : teamsHTML(p)}</label>`;
  const goBtn = o.go ? `<button class="btn sm" data-act="${esc(o.go.act)}" data-ns="${esc(ns)}"${Object.keys(o.go).filter(k => k !== "act").map(k => ` data-${k}="${esc(String(o.go[k]))}"`).join("")}${o.busy || !n ? " disabled" : ""}>${o.busy ? T("common.saving") : T("pk.addN", { n })}</button>` : "";
  const levelSel = `<select id="${esc(ns)}-level" data-act="pk-level" data-ns="${esc(ns)}" aria-label="${esc(T("pk.level"))}"${dis}>${["view", "edit", "manage"].map(l => `<option value="${l}"${pk.level === l ? " selected" : ""}>${esc(T("level." + l))}</option>`).join("")}</select>`;
  return `<div class="ma picker" data-ns="${esc(ns)}">
    <section class="ma-col"><div class="ma-head"><div class="ma-title">${left.title}</div>
        <input id="${esc(ns)}-mq" class="ma-find" value="${esc(pk.mq || "")}" placeholder="${esc(T("pk.findPh"))}" autocomplete="off" data-act="pk-mq" data-ns="${esc(ns)}"${dis}>${left.tools || ""}</div>
      <div class="ma-list">${left.items.length ? left.items.join("") : `<div class="ma-empty mini">${left.n ? T("pk.noneShown") : left.empty}</div>`}</div>${left.foot || ""}</section>
    <section class="ma-col"><div class="ma-head"><div class="ma-title">${o.outTitle ? o.outTitle(cands.length) : T("ma.out", { n: cands.length })}${shown.length !== cands.length ? `<span class="mini"> ${T("ma.shown", { n: shown.length })}</span>` : ""}</div>
        <input id="${esc(ns)}-q" class="ma-find" value="${esc(pk.q || "")}" placeholder="${esc(T("pk.findPh"))}" autocomplete="off" data-act="pk-q" data-ns="${esc(ns)}"${dis}>
        ${teamsHere.length ? `<div class="ma-chips">${teamsHere.map(chip).join("")}</div>` : ""}
        <div class="ma-tools"><button type="button" class="lnk" data-act="pk-all" data-ns="${esc(ns)}"${o.busy || !shown.length ? " disabled" : ""}>${T("pk.tickAll")}</button>
          <button type="button" class="lnk" data-act="pk-none" data-ns="${esc(ns)}"${o.busy || !pk.ticked.length ? " disabled" : ""}>${T("pk.untick")}</button><span class="sp"></span>${levelSel}${goBtn}</div></div>
      <div class="ma-list">${shown.length ? shown.map(cand).join("") : `<div class="ma-empty mini">${cands.length ? T("pk.noneShown") : T("pk.noneLeft")}</div>`}</div></section>
  </div>`;
}
// 這一頁該列哪幾個「誰在做…」的入口：senior 看所有這一類的工作區，其他人只有自己是「管」的那幾個。
// workspaces 是 workspaces 表（id、kind、title_zh、title_en、active）；prefix 是 "apps:" 或 "res:"，或整個代號（"intern-passport"）。
// 一個工作區屬於哪一列（2026-10-24 照 team 分組）：apps:X / res:X 是 X；intern-passport 是 Internship Team；passport 是整個 BT（""）；
// 自訂的看它的 team 欄，沒有就看擁有人勾的第一個 team（people 給得到的時候），都沒有就放在整個 BT 那一列。
// 2027-01-24（Paul：「calendar, meeting, projects, forms, my passport, venues… all of those should be a project we can assign」）：
// 整個 BT 的每一樣工具都是一格，派人就是打勾。錢搬到 Sponsorship 那一列（「Money should be under sponsorship」）。
export const WHOLE_BT_TOOLS = ["custom:calendar", "custom:meetings", "custom:projects", "custom:forms", "custom:my-passport", "custom:venues"];
const ORG_WS = new Set(["records", "custom:records", "custom:meeting-templates", "custom:team-forms", "custom:website", ...WHOLE_BT_TOOLS]);
// Senior 那一列（2027-01-24）：Internal（人與權限）。放進去的人跟 Co-President 一樣（2027-01-24-whole-bt-tools.sql）。
export const SENIOR = "Senior";
export function wsTeamOf(w, people) {
  const id = String((w && w.id) || "");
  // 2026-10-30 起申請是整個 BT 一個工作區 apps（在「整個 BT」那一列）；apps:<team> 是停用的舊工作區，還認得出來就好。
  if (id === "apps") return "";
  if (id.startsWith("apps:")) return id.slice(5);
  if (id.startsWith("res:")) return id.slice(4);
  if (id === "intern-passport") return "Internship Team";
  if (id === "passport") return "";
  // 整個 BT 的工具不跟擁有人走（2026-11-14 Paul：「為什麼紀錄、會議範本、team 表單在 Sponsorship 底下」）。
  // 擁有人通常是 Co-President，他勾的第一個 team 是哪一個，這幾格就掉到哪一列，看起來像那個 team 的東西。
  if (ORG_WS.has(id)) return "";
  if (id === "finance" || id === "custom:money") return "Sponsorship Team";
  if (id === "custom:internal") return SENIOR;
  if (id === "custom:marketing-requests" || id === "custom:marketing-approve") return "Marketing Team";
  // 專案（2026-12-26）的工作區存在 team 欄，空的就是整個 BT，不看擁有人。
  if (w && w.kind === "project") return w.team || "";
  if (w && w.team) return w.team;
  const o = w && w.owner && (people || []).find(p => p.profile_id === w.owner || p.id === w.owner);
  const t = o ? String(o.team || "").split(/[,、;；]/).map(s => s.trim()).filter(Boolean)[0] : "";
  return t || "";
}
// 那一格叫什麼：兩本護照用長名稱（講清楚管的是格子不是能不能玩），申請與資源用短的，自訂的用它的標題。
export function wsCellLabel(w) {
  const id = String((w && w.id) || "");
  if (id === "passport") return T("ws.long.passport");
  if (id === "intern-passport") return T("ws.long.intern");
  if (id === "apps" || id.startsWith("apps:")) return T("ws.long.apps");
  if (id.startsWith("res:")) return T("ws.long.res");
  if (id === "finance") return T("ws.long.finance");
  if (id === "custom:money") return T("ws.long.money");
  if (id === "records" || id === "custom:records") return T("ws.long.records");
  return (w && ((lang() === "zh" ? (w.title_zh || w.title_en) : (w.title_en || w.title_zh)))) || id;
}
export function wsCellHref(w) {
  const id = String((w && w.id) || "");
  if (id === "passport") return "/admin/passports/#cadre";
  if (id === "intern-passport") return "/admin/passports/#interns";
  if (id === "apps" || id.startsWith("apps:")) return "/admin/#forms";
  if (id.startsWith("res:")) return "/admin/site/#res";
  if (id === "custom:marketing-requests") return "/admin/#requests";
  if (id === "custom:marketing-approve") return "/admin/marketing/#posts";
  if (id.startsWith("custom:event-")) return "/admin/#events/" + encodeURIComponent(id.slice(13));
  if (w && w.kind === "project") return "/admin/#projects/" + encodeURIComponent(id);
  if (id === "finance" || id === "custom:money") return "/admin/finance/#overview";
  if (id === "custom:team-forms") return "/admin/team-forms/#build";
  if (id === "records" || id === "custom:records") return "/admin/records/#overview";
  if (id === "custom:website") return "/admin/site/#history";
  if (id === "custom:calendar") return "/home/#calendar";
  if (id === "custom:meetings") return "/admin/#meetings";
  if (id === "custom:projects") return "/admin/#projects";
  if (id === "custom:forms") return "/admin/team-forms/#all";
  if (id === "custom:my-passport") return "/passport/";
  if (id === "custom:venues") return "/admin/#venues";
  if (id === "custom:internal") return "/admin/people/#roster";
  return "/admin/people/#ws=" + encodeURIComponent(id);
}
// 分組：[{ team: "" 或 team 名, label, cells: [workspace…] }]，整個 BT 那一列在最上面，然後照 teams 的順序，最後是清單外的 team。
export function wsRows(workspaces, teams, people) {
  // 一場一場的活動不列在這裡（2026-12-25）：在那一場自己的「人」分頁改，這張表才不會隨活動越來越長。
  const active = (workspaces || []).filter(w => w.active !== false && !String(w.id).startsWith("custom:event-"));
  // 整個 BT 那一列：每個人每天用的六樣在前面（跟側欄最上面同一個順序），再來是要特別派的。
  const order = { "custom:calendar": -6, "custom:meetings": -5, "custom:projects": -4, "custom:forms": -3, "custom:my-passport": -2, "custom:venues": -1,
    apps: 0, passport: 1, "intern-passport": 3 };
  // 專案排在每一列最後（2026-12-26），那個 team 自己的工具在前面。
  const rank = w => w.kind === "project" ? 10 : w.id.startsWith("apps:") ? 1 : w.id.startsWith("res:") ? 2 : (order[w.id] != null ? order[w.id] : 9);
  const groups = new Map([["", []], [SENIOR, []]]);
  for (const t of teams || []) groups.set(t, []);
  for (const w of active) { const t = wsTeamOf(w, people); if (!groups.has(t)) groups.set(t, []); groups.get(t).push(w); }
  return [...groups.entries()].map(([team, cells]) => ({ team, label: team === SENIOR ? T("ws.senior") : team ? team.replace(/\s*Team$/i, "") : T("ws.board"), cells: cells.sort((a, b) => rank(a) - rank(b)) }));
}
export function mpItems(me, prefix, workspaces) {
  const title = w => (lang() === "zh" ? (w.title_zh || w.title_en) : (w.title_en || w.title_zh)) || w.id;
  const all = (workspaces || []).filter(w => w.active !== false && (w.id === prefix || w.id.startsWith(prefix)));
  return all.filter(w => senior(me) || ((me && me.ws) || {})[w.id] === "manage").map(w => ({ ws: w.id, name: title(w) }));
}
export function mpLinksHTML(items) {
  if (!items || !items.length) return "";
  return `<div class="chips mp-links">${items.map(i => `<button class="chip" data-act="members-open" data-ws="${esc(i.ws)}" data-name="${esc(i.name)}">${esc(T("mp.open", { name: i.name }))}</button>`).join("")}</div>`;
}
export function membersPanelHTML(mp, msg, busy) {
  // 2026-10-24：兩欄成員區（左「在裡面的」右「還沒在裡面的」，見 membersAreaHTML）。Co-President 與 Senior Adviser 在左欄最上面標「依職級」。
  return pageHead(T("mp.title", { name: esc(mp.name || mp.ws) }), T("mp.lede"), [], { act: "members-back", label: T("mp.back") })
    + msgHTML(msg)
    + `<div class="note">${T("mp.levels")}</div>`
    + membersAreaHTML("mp", { rows: mp.rows || [], people: mp.cadres || [], pk: mp.pk, busy, meId: mp.meId,
        acts: { level: "members-level", remove: "members-unassign", cleanup: "members-cleanup", bulk: "members-bulk" }, canCleanup: !!mp.senior, go: { act: "members-assign", ws: mp.ws } });
}
// 區塊：一個 h2 一塊。opts = { id, hint, actions: [{ act, label, ...data }] }
export function sectionHTML(title, body, opts) {
  const o = opts || {};
  const acts = (o.actions || []).map(a => `<button class="btn quiet sm" data-act="${esc(a.act)}"${
    Object.keys(a).filter(k => !["act", "label"].includes(k)).map(k => ` data-${k}="${esc(String(a[k]))}"`).join("")}${a.disabled ? " disabled" : ""}>${esc(a.label)}</button>`).join("");
  return `<section class="section"${o.id ? ` id="${esc(o.id)}"` : ""}>${
    title ? `<h2>${title}${o.hint ? `<span class="hint">${o.hint}</span>` : ""}${acts ? `<span class="sp"></span>${acts}` : ""}</h2>` : ""}${body}</section>`;
}
// 空狀態：一句講「這裡還沒有東西」，一句講「要怎麼開始」，一顆按鈕直接做。
export function emptyHTML(title, hint, action) {
  return `<div class="empty"><b>${esc(title)}</b>${hint ? `<div>${hint}</div>` : ""}${
    action ? `<div class="row"><button class="btn ghost sm" data-act="${esc(action.act)}"${action.id ? ` data-id="${esc(action.id)}"` : ""}>${esc(action.label)}</button></div>` : ""}</div>`;
}
// 篩選用的一顆 chip：data-act 給 main.js 接，data-v 是選的值。
export const fchip = (act, v, label, on) => `<button class="chip${on ? " on" : ""}" data-act="${act}" data-v="${esc(v)}" aria-pressed="${on ? "true" : "false"}">${esc(label)}</button>`;
// 收成一行的「加一個…／開一個…」表單（2026-11-10、11-11 Paul：一直開著放在清單底下很干擾，清單長了也看不到）。
// 一律放在頁首底下、清單上面。open 由 main.js 記（toggle 事件），填到一半重畫後還開著。
export const foldHTML = (id, title, body, open) => `<details class="fold rc-fold" id="${esc(id)}"${open ? " open" : ""}><summary><span class="chev" aria-hidden="true"></span><b>${esc(title)}</b></summary><div class="fold-body">${body}</div></details>`;
// 載入中。
export function skeletonHTML() { return `<div class="skeleton" aria-label="${esc(T("loading"))}"><i></i><i></i><i></i></div>`; }

// 舊名字：這一組底下的分頁。側欄用同一份 ITEMS 畫，這一支留給測試與 scripts/mobile-fixtures.mjs。
export function tabsHTML(tab, isPresident) {
  const me = { role: "cadre", board: isPresident ? "president" : "member", ws: { "intern-passport": "edit" } };
  return ITEMS.filter(i => i.group === "forms" && i.key !== "home" && canSee(i, me))
    .map(i => `<a class="rail-item${i.key === tab ? " on" : ""}" href="#${i.key}" data-act="tab" data-t="${i.key}">${esc(T(i.label))}</a>`).join("");
}

// 後台首頁（2026-10-19，後台第二次重整批 2）：三塊。
//   1. 你是誰、管到哪（頁首那一句）。
//   2. 今天要處理的事：每張卡一個數字、一句話、一顆直達的按鈕。**只畫你管得到的**，
//      數字 0 的卡還是畫但變淡；整排都是 0 收成一行；載不到寫「載不到」，不寫 0。
//   3. 你的 team：你在幾個 team 就幾段，Co-President 看到全部。
// forms 是 loadForms()，pendingAll 是 loadPendingAll()，todo 是 loadTodo()（null 代表還沒載）。
// 這一頁不碰 entries、不列 intern 的名字：intern 那張卡只有筆數。
const splitTeams = raw => String(raw || "").split(/[,、;；]/).map(s => s.trim()).filter(Boolean);
const nameOf = p => String(p.name_zh || "").trim() || String(p.name_en || "").trim() || T("common.noName");

export function todoCards(me, forms, pendingAll, todo, canSend, busy) {
  const t = todo || {};
  const pres = senior(me);
  const istaff = pres || !!((me && me.ws) || {})["intern-passport"];
  const received = (forms || []).reduce((n, f) => n + (f.counts ? f.counts.received : 0), 0);
  const firstForm = (forms || []).find(f => f.counts && f.counts.received > 0);
  const pending = pendingAll || [];
  const stuck = pending.filter(p => p.tries > 0);
  const cards = [];
  cards.push({ n: received, label: T("card.apps"), unit: T("card.apps.unit"),
    hint: received ? `${firstForm ? esc(firstForm.title) : ""}` : T("card.apps.none"),
    act: firstForm ? { act: "open-apps", id: firstForm.id, label: canEditWs(me, "apps") ? T("card.apps.go") : T("card.apps.see") } : null });
  cards.push({ mail: true, n: pending.length, label: T("card.mail"), unit: T("card.mail.unit"),
    hint: pending.length ? (stuck.length ? T("mail.stuck", { n: stuck.length, err: esc(stuck[0].error || T("mail.noErr")) }) : T("card.mail.hint")) : T("card.mail.done"),
    act: pending.length && canSend ? { act: "send-mail-all", label: busy ? T("mail.sending") : T("mail.sendNow"), disabled: busy } : null });
  if (pres) {
    cards.push({ n: t.team === null ? null : (t.team || []).length, label: T("card.team"), unit: T("card.team.unit"),
      hint: T("card.team.hint"), href: withLang("/admin/site/#team"), go: T("card.approve") });
    const st = t.stories === null ? null : (t.stories || []).filter(r => !r.story_approved).length;
    cards.push({ n: st, label: T("card.stories"), unit: T("card.team.unit"), hint: T("card.stories.hint"), href: withLang("/admin/site/#stories"), go: T("card.approve") });
  }
  if (istaff) {
    const interns = t.interns === null ? null : (t.interns || []).length;
    const stamps = (t.stamps || []).length;
    cards.push({ n: interns, label: T("card.interns"), unit: T("card.interns.unit"),
      hint: interns ? T("card.interns.hint", { n: (stamps / interns).toFixed(1) }) : T("card.interns.none"), href: withLang("/admin/passports/#interns"), go: T("card.interns.go") });
  }
  // 2026-10-31 行銷需求單：rq 是 loadRequests() 回的（RLS 決定看得到哪些）。工作區「改」以上看等處理的數；送單的人看自己最近一張還在跑的。
  const rq = t.requests;
  if (rq !== undefined && canEditWs(me, "custom:marketing-requests")) {
    const open = rq === null ? null : (rq || []).filter(r => RQ_OPEN.includes(rqStatus(r.status)));
    cards.push({ n: open === null ? null : open.length, label: T("card.rq"), unit: T("card.rq.unit"),
      hint: open && open.length ? T("card.rq.hint", { n: open.filter(r => !r.assignee).length }) : T("card.rq.none"),
      href: "#requests", go: T("card.rq.go") });
  }
  // 2026-11-02 會議：每一位幹部看「下一場會議」（自己在名單上的、還沒開的第一場）。
  const mt = t.meetings;
  if (mt !== undefined && me) {
    const mine = (mt || []).filter(m => new Date(m.starts_at) > new Date() && (m.attendees || []).some(a => a.user_id === me.id)).sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
    if (mt === null || mine.length) {
      const m = mine[0];
      cards.push({ n: mt === null ? null : mine.length, label: T("card.mt"), unit: T("card.mt.unit"), hint: m ? T("card.mt.hint", { title: esc(m.title), d: esc(mtWhen(m.starts_at)) }) : "", href: m ? "#meetings/" + m.id : "#meetings", go: T("card.mt.go") });
    }
  }
  // 2026-11-01 活動上架：senior 看「等上線的活動」（ready 的）；其他人看自己 team 還在草稿或準備好的活動數。
  const ev = t.events;
  if (ev !== undefined && pres) {
    const ready = ev === null ? null : (ev || []).filter(e => e.status === "ready").length;
    cards.push({ n: ready, label: T("card.ev"), unit: T("card.ev.unit"), hint: ready ? T("card.ev.hint") : T("card.ev.none"), href: "#events", go: T("card.ev.go") });
  }
  const myOpen = (rq || []).filter(r => me && r.requester === me.id && RQ_OPEN.includes(rqStatus(r.status)));
  if (myOpen.length) {
    const r = myOpen[0];
    cards.push({ n: myOpen.length, label: T("card.myrq"), unit: T("card.rq.unit"), hint: T("card.myrq.hint", { title: esc(r.title), status: T("rq.st." + rqStatus(r.status)) }), href: "#request", go: T("card.myrq.go") });
  }
  if (pres) {
    const ro = t.roster;
    const noTeam = ro ? ro.filter(p => !splitTeams(p.team).length).length : null;
    cards.push({ n: ro === null ? null : (ro || []).length, label: T("card.cadres"), unit: T("card.cadres.unit"),
      hint: noTeam ? T("card.cadres.noTeam", { n: noTeam }) : T("card.cadres.ok"), href: withLang("/admin/people/#roster"), go: T("card.cadres.go") });
  }
  return cards;
}

function kpiHTML(c) {
  const gone = c.n === null;
  const zero = !gone && !c.n;
  const act = c.act ? `<button class="btn ghost sm" data-act="${esc(c.act.act)}"${c.act.id ? ` data-id="${esc(c.act.id)}"` : ""}${c.act.disabled ? " disabled" : ""}>${esc(c.act.label)}</button>`
    : c.href && !zero && !gone ? `<a class="btn ghost sm" href="${esc(c.href)}">${esc(c.go || T("kpi.go"))}</a>` : "";
  return `<div class="kpi${zero ? " zero" : ""}${gone ? " gone" : ""}">
    <div class="kpi-n">${gone ? T("kpi.gone") : esc(String(c.n))}<span class="kpi-u">${gone ? "" : esc(c.unit)}</span></div>
    <div class="kpi-l">${esc(c.label)}</div>
    <div class="kpi-h">${gone ? T("kpi.goneHint") : c.hint}</div>
    ${act ? `<div class="kpi-a">${act}</div>` : ""}
  </div>`;
}

// 還沒寄出去的信（2026-11-26）。以前在「各 team」那一頁，那一頁拿掉之後搬到活動清單最上面：/home/ 的「有信沒寄出去」連到這裡。
// 沒有待寄的信就完全不畫。「現在寄出去」那一顆是原本的 send-mail-all。
export function unsentMailHTML(me, forms, pendingAll, todo, canSend, busy) {
  const mail = todoCards(me, forms, pendingAll, todo, canSend, busy).filter(c => c.mail && c.n);
  return mail.length ? sectionHTML(T("hub.todo"), `<div class="todo">${mail.map(kpiHTML).join("")}</div>`, { id: "todo" }) : "";
}

// 學員或還沒升級的人走到這裡。**不說「你沒有權限」**：他沒有做錯任何事，只是走錯地方。
export function notCadreHTML() {
  return pageHead(T("notCadre.title"), T("notCadre.lede"), [{ label: T("notCadre.back"), href: "../app/" }]);
}

// err：資料庫真正回的那一句，印在底下小字。開頁會先自己重試一次（main.js 的 retryBoot），第二次才顯示這一頁。
export function downHTML(err) {
  return pageHead(T("down.title"), T("down.lede"), [{ act: "retry", label: T("common.retry") }])
    + (err ? `<div class="mini">${esc(T("down.detail"))}${esc(err)}</div>` : "");
}

// ═══════════════════════════════════════════════════════════════════════
// 行銷需求單（2026-10-31 第一版；2026-11-09 第二版，docs/2026-11-08-行銷需求單-第二版欄位.md）
// ═══════════════════════════════════════════════════════════════════════
// 兩頁：每一位幹部的「跟 Marketing 提需求」（Sheet 的 11 格加拍攝指示，下面是我送過的），Marketing 需求工作區的「行銷需求單」佇列。
// 資料都從 loadRequests() 來（RLS 決定看得到哪些），這裡只畫。
// 第一版的舊單（沒有新欄位、狀態還是 new／done）照樣畫得出來：狀態走 rqStatus() 對照，第一版的欄有值就印。
// 2026-10-29 Paul：Marketing 要能退件（rejected，一定附回覆、會寄信），所以狀態多一個。
export const RQ_STATUS = ["submitted", "in_progress", "in_review", "published", "rejected", "withdrawn"];
// 接下之後才改得到的進度（已送出的單先按「接下」或「退件」）。
export const RQ_WORKING = ["in_progress", "in_review"];
export const RQ_OPEN = ["submitted", "in_progress", "in_review"];
// 2026-10-28 Paul：「先選這是貼文還是影片，需求單長得不一樣，貼文不需要拍攝指示。」三種：貼文、限動、影片。
// 限動不用選平台（固定是 IG 限動）；影片才有拍攝指示。資料庫 submit_request() 照同一張表檢查（2026-11-19-request-kinds.sql）。
export const RQ_KINDS = ["post", "story", "video"];
export const RQ_KIND_PF = { post: ["ig_carousel", "fb_single", "threads_text", "other"], story: [], video: ["long_video", "ig_reels", "ig_story_video", "other"] };
// 所有代號（舊單的 ig_story 也在），讀畫面上有哪幾格勾了用這一份。
export const RQ_PLATFORMS = ["ig_carousel", "ig_story", "fb_single", "threads_text", "long_video", "ig_reels", "ig_story_video", "other"];
export const RQ_SHOT_ROWS = 7;   // Sheet 先給七列 Fragment，可以再加
// 舊狀態對照（資料庫的第二版遷移檔也照這張表搬）：new → 已送出、done → 已發布。
export function rqStatus(s) { return !s || s === "new" ? "submitted" : s === "done" ? "published" : s; }
const rqDate = d => d ? String(d).slice(0, 10) : "";
const rqDay = s => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || "").slice(0, 10)); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : null; };
// 7 天規則（Paul 2026-11-08 拍板：只警告，不擋送出）：預計發布日早於今天加 7 天就警告。
export function rqTooSoon(date, today) { const a = rqDay(date), t = rqDay(today); return a !== null && t !== null && a < t + 7 * 86400000; }
export function rqToday(now) { const d = now || new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
// 草稿存在這台電腦的 localStorage，一人一格（同一台電腦換人登入不會看到別人的草稿）。送出才清。
export function rqDraftKey(me) { return "bt.admin.rqDraft.v2." + ((me && me.id) || "anon"); }
export function rqBlank() {
  return { event_id: "", event_title: "", kind: "", title: "", owner_team: "", owner_id: "", goal_cta: "", platforms: [], platform_other: "", key_line: "",
    must: [{ text: "", confirmed_by: "" }], draft: "", draft_doc_url: "", refs: [{ url: "", note: "" }], publish_on: "", other_notes: "",
    shots: Array.from({ length: RQ_SHOT_ROWS }, () => ({ who: "", what: "", seconds: "", note: "" })), closing: { who: "", seconds: "", note: "" } };
}
// 草稿變成送給 submit_request(jsonb) 的那一包。空列丟掉；有拍攝指示（或結尾話填了人）才帶結尾話那一列，放最後。
// **不帶 assignee**：接的人是 Marketing 那一邊指定的（資料庫也不收）。
export function rqPayload(d) {
  const v = Object.assign(rqBlank(), d || {});
  const s = x => String(x == null ? "" : x).trim();
  const kind = RQ_KINDS.includes(v.kind) ? v.kind : "";
  // 拍攝指示只有影片有；選了貼文或限動，草稿裡留著的那幾列不送。
  const shots = kind === "video" || !kind ? (v.shots || []).map(r => ({ who: s(r.who), what: s(r.what), seconds: s(r.seconds), note: s(r.note), is_closing: false })).filter(r => r.who || r.what) : [];
  const c = v.closing || {};
  if ((kind === "video" || !kind) && (shots.length || s(c.who))) shots.push({ who: s(c.who), what: T("rq.closingWhat"), seconds: s(c.seconds), note: s(c.note), is_closing: true });
  const allowed = kind ? RQ_KIND_PF[kind] : RQ_PLATFORMS;
  return {
    ...(kind ? { kind } : {}),
    title: s(v.title), owner_team: s(v.owner_team), owner_id: s(v.owner_id), goal_cta: s(v.goal_cta),
    platforms: kind === "story" ? ["ig_story"] : allowed.filter(p => (v.platforms || []).includes(p)), platform_other: s(v.platform_other), key_line: s(v.key_line),
    must_have: (v.must || []).map(r => ({ text: s(r.text), confirmed_by: s(r.confirmed_by) })).filter(r => r.text),
    draft: String(v.draft || "").trim(), draft_doc_url: s(v.draft_doc_url),
    visual_refs: (v.refs || []).map(r => ({ url: s(r.url), note: s(r.note) })).filter(r => r.url),
    publish_on: s(v.publish_on), other_notes: String(v.other_notes || "").trim(), shots,
    ...(s(v.event_id) ? { event_id: s(v.event_id) } : {}),
  };
}
export function rqMine(rows, me) { return (rows || []).filter(r => me && r.requester === me.id); }
const rqPerson = (id, ...lists) => { for (const l of lists) { const p = (l || []).find(x => x.id === id); if (p) return mpName(p); } return ""; };
const rqTagCls = st => st === "published" ? " open" : st === "in_progress" || st === "in_review" ? " warn" : st === "rejected" ? " bad" : "";
// 需求負責人就是登入的人（Paul 2026-10-29：「誰登入就是誰，不用選」）。一個人有兩個 team 才給選是哪一個。
export function rqMyTeams(me) { return splitTeams(me && me.team); }
// 平台那一格的字：「IG 輪播、其他：LINE 群組」。舊單沒有平台就印第一版的種類。
function rqPlatformText(r) {
  const pf = (r.platforms || []).map(p => p === "other" && r.platform_other ? T("rq.pf.otherWith", { v: r.platform_other }) : T("rq.pf." + p));
  return pf.length ? pf.join("、") : (r.kind ? T("rq.kind." + r.kind) : "");
}
// 種類的小標籤（貼文／限動／影片）。舊單的 poster、other 照第一版的字。
const rqKindTag = r => r && r.kind ? `<span class="tag rq-kind">${esc(T("rq.kind." + r.kind))}</span> ` : "";
const rqPub = r => r.publish_on || r.needed_by || "";
const rqSoonTag = (r, today) => today && !["published", "withdrawn"].includes(rqStatus(r.status)) && rqTooSoon(rqPub(r), today) ? ` <span class="tag warn">${esc(T("rq.soonTag"))}</span>` : "";

// 送單的表單加「我送過的」。d 是草稿（null 就是空白表單），mine 是我的單，cadres 是幹部名單（選負責人、印名字），today 判斷 7 天。
// 需求單一頁兩面（2026-11-13 Paul：「Request for Marketing」與「Marketing's queue」並排兩行很亂）。
// 每一位幹部都看得到「送單與我送的」；被派進需求工作區的人（與 senior）多一面「Marketing 的待辦」，數字是還在跑的單。
export const rqQueueOk = me => senior(me) || !!wsLevel(me, "custom:marketing-requests");
export function rqSwitchHTML(view, me, rows) {
  if (!rqQueueOk(me)) return "";
  const open = (rows || []).filter(r => RQ_OPEN.includes(rqStatus(r.status))).length;
  const b = (v, href, label) => `<a class="chip${view === v ? " on" : ""}" href="${href}" data-act="tab" data-t="${v}"${view === v ? ' aria-current="page"' : ""}>${label}</a>`;
  return `<div class="chips rq-switch" style="margin:0 0 14px">${b("request", "#request", esc(T("rq.sw.mine")))}${b("requests", "#requests", esc(T("rq.sw.queue")) + (open ? ` <b>${open}</b>` : ""))}</div>`;
}
export function requestPageHTML(me, mine, d, msg, busy, cadres, today) {
  const v = Object.assign(rqBlank(), d || {});
  const dis = busy ? " disabled" : "";
  const td = today || rqToday();
  const val = x => esc(x == null ? "" : String(x));
  const ph = k => ` placeholder="${esc(T(k))}"`;
  const fld = (n, label, help, body) => `<div class="rq-f" data-n="${n}"><div class="rq-fl"><b class="rq-n">${n}</b> <span>${label}</span><div class="rq-help">${help}</div></div><div class="rq-fi">${body}</div></div>`;
  const del = (act, i) => `<button class="lnk rq-del" data-act="${act}" data-i="${i}" aria-label="${esc(T("rq.delRow"))}"${dis}>${T("rq.delRow")}</button>`;
  const myTeams = rqMyTeams(me);
  const soon = rqTooSoon(v.publish_on, td);
  const kind = RQ_KINDS.includes(v.kind) ? v.kind : "";
  const pfs = kind ? RQ_KIND_PF[kind] : [];
  // 第一步：選種類。選了才出現下面的欄位，號碼照現在出現的欄位重排。
  const picker = `<div class="rq-kinds" role="radiogroup" aria-label="${esc(T("rq.kindPick"))}">${RQ_KINDS.map(k => `<button type="button" class="rq-kindbtn${kind === k ? " on" : ""}" role="radio" aria-checked="${kind === k}" data-act="rq-kind" data-v="${k}"${dis}>
      <b>${T("rq.kind." + k)}</b><span>${T("rq.kindHint." + k)}</span></button>`).join("")}</div>`;
  let n = 0; const nf = (label, help, body) => fld(++n, label, help, body);
  const form = `<div class="rq-form">`
    + nf(T("rq.f1"), T("rq.h1"), `<input id="rq-title" value="${val(v.title)}"${ph("rq.p1")}${dis}>`)
    + nf(T("rq.f2"), T("rq.h2"), `<div class="rq-owner"><b>${esc(T("rq.ownerYou", { v: (me && me.name) || "" }))}</b>${
        myTeams.length > 1 ? ` <label><span class="sr">${T("rq.ownerTeam")}</span><select id="rq-owner-team"${dis}>${myTeams.map(t => `<option value="${esc(t)}"${(v.owner_team || myTeams[0]) === t ? " selected" : ""}>${esc(t)}</option>`).join("")}</select></label>`
        : myTeams.length ? ` <span class="mini">${esc(myTeams[0])}</span>` : ""}</div>`)
    + nf(T("rq.f3"), T("rq.h3"), `<input id="rq-goal" value="${val(v.goal_cta)}"${ph("rq.p3")}${dis}>`)
    + (pfs.length ? nf(T("rq.f4"), T("rq.h4"), `<div class="rq-pf">${pfs.map(p => `<label class="check"><input type="checkbox" id="rq-pf-${p}"${(v.platforms || []).includes(p) ? " checked" : ""}${dis}> ${esc(T("rq.pf." + p))}</label>`).join("")}</div>
        <input id="rq-pf-note" value="${val(v.platform_other)}"${ph("rq.pOther")}${dis}>`) : "")
    + nf(T("rq.f5"), T("rq.h5"), `<input id="rq-key" value="${val(v.key_line)}"${ph("rq.p5")}${dis}>`)
    + nf(T("rq.f6"), T("rq.h6"), `<div class="rq-rows">${(v.must || []).map((r, i) => `<div class="rq-rowin">
          <input id="rq-must-text-${i}" value="${val(r.text)}"${i === 0 ? ph("rq.p6") : ""} aria-label="${esc(T("rq.mustText"))}"${dis}>
          <input id="rq-must-by-${i}" value="${val(r.confirmed_by)}"${ph("rq.p6by")} aria-label="${esc(T("rq.mustBy"))}"${dis}>${del("rq-del-must", i)}</div>`).join("")}</div>
        <button class="btn quiet sm" data-act="rq-add-must"${dis}>${T("rq.addMust")}</button>`)
    + nf(T("rq.f7"), T("rq.h7"), `<textarea id="rq-draft" style="min-height:120px"${ph("rq.p7")}${dis}>${val(v.draft)}</textarea>
        <input id="rq-doc" value="${val(v.draft_doc_url)}"${ph("rq.p7doc")}${dis}>`)
    + nf(T("rq.f8"), T("rq.h8"), `<div class="rq-rows">${(v.refs || []).map((r, i) => `<div class="rq-rowin">
          <input id="rq-ref-url-${i}" value="${val(r.url)}"${ph("rq.p8url")} aria-label="${esc(T("rq.refUrl"))}"${dis}>
          <input id="rq-ref-note-${i}" value="${val(r.note)}"${ph("rq.p8note")} aria-label="${esc(T("rq.refNote"))}"${dis}>${del("rq-del-ref", i)}</div>`).join("")}</div>
        <button class="btn quiet sm" data-act="rq-add-ref"${dis}>${T("rq.addRef")}</button>`)
    + nf(T("rq.f9"), T("rq.h9"), `<input id="rq-publish" type="date" value="${val(v.publish_on)}"${dis}>
        <div class="rq-warn" id="rq-publish-warn" role="status"${soon ? "" : " hidden"}>${T("rq.soonWarn")}</div>`)
    + nf(T("rq.f10"), T("rq.h10"), `<textarea id="rq-notes" style="min-height:72px"${ph("rq.p10")}${dis}>${val(v.other_notes)}</textarea>`)
    + nf(T("rq.f11"), T("rq.h11"), `<div class="mini">${T("rq.f11note")}</div>`)
    + `</div>`;
  const shotRow = (r, i) => `<tr><th scope="row">F${i + 1}</th>
      <td data-l="${esc(T("rq.sWho"))}"><input id="rq-shot-who-${i}" value="${val(r.who)}"${i === 0 ? ph("rq.exWho") : ""} aria-label="F${i + 1} ${esc(T("rq.sWho"))}"${dis}></td>
      <td data-l="${esc(T("rq.sWhat"))}"><input id="rq-shot-what-${i}" value="${val(r.what)}"${i === 0 ? ph("rq.exWhat") : ""} aria-label="F${i + 1} ${esc(T("rq.sWhat"))}"${dis}></td>
      <td data-l="${esc(T("rq.sSec"))}"><input id="rq-shot-sec-${i}" type="number" min="0" max="600" inputmode="numeric" value="${val(r.seconds)}"${i === 0 ? ph("rq.exSec") : ""} aria-label="F${i + 1} ${esc(T("rq.sSec"))}"${dis}></td>
      <td data-l="${esc(T("rq.sNote"))}"><input id="rq-shot-note-${i}" value="${val(r.note)}"${i === 0 ? ph("rq.exNote") : ""} aria-label="F${i + 1} ${esc(T("rq.sNote"))}"${dis}></td>
      <td class="rq-x">${del("rq-del-shot", i)}</td></tr>`;
  const c = v.closing || {};
  const shots = `<p class="mini rq-shots-note">${T("rq.shotsNote")}</p>
    <table class="rq-shots rq-shots-edit"><thead><tr><th scope="col">Fragment</th><th scope="col">${T("rq.sWho")}</th><th scope="col">${T("rq.sWhat")}</th><th scope="col">${T("rq.sSec")}</th><th scope="col">${T("rq.sNote")}</th><th scope="col"><span class="sr">${T("rq.delRow")}</span></th></tr></thead>
    <tbody>${(v.shots || []).map(shotRow).join("")}
    <tr class="rq-closing"><th scope="row">${T("rq.closing")}</th>
      <td data-l="${esc(T("rq.sWho"))}"><input id="rq-close-who" value="${val(c.who)}"${ph("rq.closeWhoPh")} aria-label="${esc(T("rq.closing"))} ${esc(T("rq.sWho"))}"${dis}></td>
      <td data-l="${esc(T("rq.sWhat"))}" class="rq-fixed">${T("rq.closingWhat")}</td>
      <td data-l="${esc(T("rq.sSec"))}"><input id="rq-close-sec" type="number" min="0" max="600" inputmode="numeric" value="${val(c.seconds)}" aria-label="${esc(T("rq.closing"))} ${esc(T("rq.sSec"))}"${dis}></td>
      <td data-l="${esc(T("rq.sNote"))}"><input id="rq-close-note" value="${val(c.note)}" aria-label="${esc(T("rq.closing"))} ${esc(T("rq.sNote"))}"${dis}></td><td></td></tr>
    </tbody></table>
    <button class="btn quiet sm" data-act="rq-add-shot"${dis}>${T("rq.addShot")}</button>`;
  const row = r => {
    const st = rqStatus(r.status);
    const who = r.assignee ? rqPerson(r.assignee, cadres) : "";
    const pub = rqPub(r);
    return `<li class="rq-row${st === "withdrawn" ? " off" : ""}">
      <div class="fhead">${rqKindTag(r)}<b>${esc(r.title)}</b> <span class="tag${rqTagCls(st)}">${esc(T("rq.st." + st))}</span> <span class="mini">${esc(rqPlatformText(r))}${pub ? `・${esc(T("rq.pubOn", { d: rqDate(pub) }))}` : ""}</span></div>
      ${r.reply ? `<div class="fmeta rq-reply"><i>${T("rq.replyLabel")}</i>${esc(r.reply)}</div>` : ""}
      ${who ? `<div class="fmeta">${esc(T("rq.assigneeLine", { v: who }))}</div>` : ""}
      <div class="fmeta">${esc(T("rq.sent", { d: rqDate(r.created_at) }))}${st === "submitted" ? ` <button class="lnk" data-act="rq-withdraw" data-id="${esc(r.id)}"${dis}>${T("rq.withdraw")}</button>` : ""}</div>
    </li>`;
  };
  return pageHead(T("rq.title"), T("rq.lede"))
    + msgHTML(msg)
    + sectionHTML(T("rq.kindPick"), (v.event_id ? `<div class="note">${esc(T("rq.forEvent", { t: v.event_title || "" }))} <button class="lnk" data-act="rq-ev-clear"${dis}>${T("rq.evClear")}</button></div>` : "") + picker + (kind ? "" : `<p class="mini">${T("rq.kindFirst")}</p>`), { id: "rq-kind" })
    + (kind ? sectionHTML(T("rq.formTitle"), form, { id: "rq-form" }) : "")
    + (kind === "video" ? sectionHTML(T("rq.shotsTitle"), shots, { id: "rq-shots" }) : "")
    + (!kind ? "" : `<div class="form-foot rq-send"><button class="btn" data-act="rq-submit"${dis}>${busy ? T("common.saving") : T("rq.submit")}</button><span class="mini">${T("rq.submitNote")} ${T("rq.draftNote")}</span></div>`)
    + sectionHTML(T("rq.mineTitle"), (mine || []).length ? `<ul class="flist">${mine.map(row).join("")}</ul>` : emptyHTML(T("rq.mineNone"), T("rq.mineNoneHint")), { id: "rq-mine" });
}

// Marketing 的佇列。f = { status: "open"|"published"|"withdrawn"|"all", mine: 我的 id（只看我接的）, q }。
export function rqFilter(rows, f) {
  const o = Object.assign({ status: "open", mine: "", q: "" }, f || {});
  const q = String(o.q || "").trim().toLowerCase();
  const has = x => String(x || "").toLowerCase().includes(q);
  return (rows || []).filter(r => {
    const st = rqStatus(r.status);
    return (o.status === "all" || (o.status === "open" ? RQ_OPEN.includes(st) : st === o.status))
      && (!o.mine || r.assignee === o.mine)
      && (!q || has(r.title) || has(r.key_line) || has(r.goal_cta) || has(r.purpose));
  });
}
// opts = { assignees: request_assignees() 回的名單, today, me }。sel 是打開的那一張，canEdit 是「改」以上。
export function requestsQueueHTML(rows, people, f, sel, canEdit, msg, busy, opts) {
  const o = Object.assign({ status: "open", mine: "", q: "" }, f || {});
  const x = opts || {};
  const td = x.today || rqToday();
  const dis = busy ? " disabled" : "";
  const who = id => rqPerson(id, people, x.assignees) || T("rq.someone");
  const owner = r => [r.owner_team, r.owner_id ? who(r.owner_id) : ""].filter(Boolean).join("・");
  const open = sel ? (rows || []).find(r => r.id === sel) : null;
  if (open) {
    const r = open, st = rqStatus(r.status);
    const none = T("value.none");
    const txt = s => s ? esc(s) : none;
    const link = u => `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(u)}</a>`;
    const must = (r.must_have || []).length ? `<ul class="rq-ul">${r.must_have.map(m => `<li>${esc(m.text)}${m.confirmed_by ? ` <span class="mini">${esc(T("rq.confirmedBy", { v: m.confirmed_by }))}</span>` : ""}</li>`).join("")}</ul>` : none;
    const refs = (r.visual_refs || []).length ? `<ul class="rq-ul">${r.visual_refs.map(v => `<li>${link(v.url)}${v.note ? ` <span class="mini">${esc(T("rq.refFor", { v: v.note }))}</span>` : ""}</li>`).join("")}</ul>` : none;
    const pub = rqPub(r);
    // 第一版的欄：舊單才有值，有值才印。
    const v1 = [["rq.v1.purpose", r.purpose], ["rq.v1.brief", r.brief, true], ["rq.v1.links", (r.asset_links || []).length ? r.asset_links : ""], ["rq.v1.contact", r.contact]].filter(a => a[1] && a[1].length);
    const shots = r.shots || [];
    let fn = 0;
    const shotTable = shots.length ? `<h3 class="rq-h3">${T("rq.shotsTitle")}</h3><p class="mini">${T("rq.shotsNote")}</p>
      <table class="rq-shots"><thead><tr><th scope="col">Fragment</th><th scope="col">${T("rq.sWho")}</th><th scope="col">${T("rq.sWhat")}</th><th scope="col">${T("rq.sSec")}</th><th scope="col">${T("rq.sNote")}</th></tr></thead><tbody>${
        shots.map(s => `<tr${s.is_closing ? ` class="rq-closing"` : ""}><th scope="row">${s.is_closing ? T("rq.closing") : `F${++fn}`}</th><td>${esc(s.who || "")}</td><td>${s.is_closing ? T("rq.closingWhat") : esc(s.what || "")}</td><td>${s.seconds == null ? "" : esc(String(s.seconds))}</td><td>${esc(s.note || "")}</td></tr>`).join("")
      }</tbody></table>` : "";
    const details = `<div class="rq-print"><dl class="rq-dl">
        <dt>${T("rq.kindLabel")}</dt><dd>${r.kind ? esc(T("rq.kind." + r.kind)) : none}</dd>
        <dt>${T("rq.f1")}</dt><dd>${esc(r.title)}</dd>
        <dt>${T("rq.f2")}</dt><dd>${owner(r) ? esc(owner(r)) : none}</dd>
        <dt>${T("rq.f3")}</dt><dd>${txt(r.goal_cta)}</dd>
        <dt>${T("rq.f4")}</dt><dd>${(r.platforms || []).length ? esc(rqPlatformText(r)) : none}</dd>
        <dt>${T("rq.f5")}</dt><dd>${txt(r.key_line)}</dd>
        <dt>${T("rq.f6")}</dt><dd>${must}</dd>
        <dt>${T("rq.f7")}</dt><dd class="pre">${txt(r.draft)}</dd>
        ${r.draft_doc_url ? `<dt>${T("rq.docLabel")}</dt><dd>${link(r.draft_doc_url)}</dd>` : ""}
        <dt>${T("rq.f8")}</dt><dd>${refs}</dd>
        <dt>${T("rq.f9")}</dt><dd>${pub ? esc(rqDate(pub)) + rqSoonTag(r, td) : none}</dd>
        <dt>${T("rq.f10")}</dt><dd class="pre">${txt(r.other_notes)}</dd>
        <dt>${T("rq.f11")}</dt><dd>${esc(T("rq.st." + st))}・${esc(r.assignee ? T("rq.assigneeLine", { v: who(r.assignee) }) : T("rq.nobody"))}</dd>
        ${v1.map(([k, val, pre]) => `<dt>${T(k)}</dt><dd${pre ? ` class="pre"` : ""}>${Array.isArray(val) ? val.map(link).join("<br>") : esc(val)}</dd>`).join("")}
        ${r.reply ? `<dt>${T("rq.reply")}</dt><dd class="pre">${esc(r.reply)}</dd>` : ""}
      </dl>${shotTable}</div>`;
    const as = (x.assignees || []).slice();
    if (r.assignee && !as.some(a => a.id === r.assignee)) as.push({ id: r.assignee, name_zh: who(r.assignee) });
    // 2026-10-29 Paul：已送出的單先「接下」或「退件」，接下之後才有進度可以改。
    //   已送出：接的人、回覆、「接下」「退件」兩顆鈕。
    //   進行中／待審核：接的人、進度（這兩個）、回覆；「已發出，通知送單的人」與「退件」。
    //   已發布：進度下拉多「已發布」（可以退回，信不會重寄）。
    //   退件：說明已經寄給送單的人，可以「改回進行中」（按錯了救得回來）。
    // 進度、接的人、回覆改了就存（data-autosave="rq-save"）。會寄信的三件事（發布、退件）是按鈕，按之前問一次。
    const reply = `<label class="wide"><i>${T(st === "submitted" ? "rq.replyFirst" : "rq.reply")}</i><textarea id="rq-reply" name="reply" style="min-height:90px" placeholder="${esc(T(st === "submitted" ? "rq.replyFirstPh" : "rq.replyPh"))}"${dis}>${esc(r.reply || "")}</textarea></label>`;
    const assignee = `<label><i>${T("rq.assignee")}</i><select id="rq-assignee" name="assignee"${dis}><option value="">${T("rq.nobodyOpt")}</option>${as.map(a => `<option value="${esc(a.id)}"${r.assignee === a.id ? " selected" : ""}>${esc(mpName(a))}</option>`).join("")}</select></label>`;
    const stOpts = st === "published" ? RQ_WORKING.concat("published") : RQ_WORKING;
    const status = `<label><i>${T("rq.status")}</i><select id="rq-status" name="status"${dis}>${stOpts.map(s => `<option value="${s}"${st === s ? " selected" : ""}>${esc(T("rq.st." + s))}</option>`).join("")}</select></label>`;
    const rejectBtn = `<button class="btn ghost" data-act="rq-reject" data-id="${esc(r.id)}"${dis}>${T("rq.reject")}</button>`;
    let handle;
    if (st === "withdrawn") handle = `<div class="note">${T("rq.withdrawnNote")}</div>`;
    else if (!canEdit) handle = `<div class="note">${T("rq.viewOnly")}</div>`;
    else if (st === "rejected") handle = `<div class="note">${T("rq.rejectedNote")}</div>
        <div class="form-foot"><button class="btn ghost" data-act="rq-reopen" data-id="${esc(r.id)}"${dis}>${T("rq.reopen")}</button><span class="mini">${T("rq.reopenNote")}</span></div>`;
    else if (st === "submitted") handle = `<p class="mini">${T("rq.decideLede")}</p><div class="two" data-autosave="rq-save" data-id="${esc(r.id)}">${assignee}${reply}</div>
        <div class="form-foot">${autosaveHint("rq-save", `data-id="${esc(r.id)}"`)}
          <button class="btn" data-act="rq-accept" data-id="${esc(r.id)}"${dis}>${T("rq.accept")}</button>${rejectBtn}
          <span class="mini">${T("rq.decideNote")}</span></div>`;
    else handle = `<div class="two" data-autosave="rq-save" data-id="${esc(r.id)}">${assignee}${status}${reply}</div>
        <div class="form-foot">${autosaveHint("rq-save", `data-id="${esc(r.id)}"`)}
          ${st !== "published" ? `<button class="btn" data-act="rq-publish" data-id="${esc(r.id)}"${dis}>${T("rq.markPublished")}</button>${rejectBtn}` : ""}
          <span class="mini">${T(st === "published" ? "rq.publishedNote" : "rq.publishNote")}</span></div>`;
    return pageHead(esc(r.title), esc(T("rq.oneLede", { who: who(r.requester), d: rqDate(r.created_at) })), [{ act: "rq-print", label: T("rq.print") }], { act: "rq-back", label: T("rq.back") })
      + msgHTML(msg)
      + sectionHTML(T("rq.details"), details)
      + `<div class="no-print">${sectionHTML(T("rq.handle"), handle)}</div>`;
  }
  const shown = rqFilter(rows, o);
  const groups = RQ_STATUS.map(s => [s, shown.filter(r => rqStatus(r.status) === s)]).filter(g => g[1].length);
  const chip = (act, v, label, on) => `<button class="chip${on ? " on" : ""}" data-act="${act}" data-v="${esc(v)}">${esc(label)}</button>`;
  const row = r => {
    const pub = rqPub(r), ow = owner(r), pf = rqPlatformText(r);
    return `<li class="rq-row"><div class="fhead">${rqKindTag(r)}<b><a href="#requests/${esc(r.id)}" data-act="rq-open" data-id="${esc(r.id)}">${esc(r.title)}</a></b>${pf ? ` <span class="mini">${esc(pf)}</span>` : ""}</div>
      <div class="fmeta">${[ow ? esc(T("rq.ownerLine", { v: ow })) : "", pub ? esc(T("rq.pubOn", { d: rqDate(pub) })) + rqSoonTag(r, td) : "", esc(r.assignee ? T("rq.assigneeLine", { v: who(r.assignee) }) : T("rq.nobody"))].filter(Boolean).join("・")}</div>
      <div class="fmeta">${esc(T("rq.oneLede", { who: who(r.requester), d: rqDate(r.created_at) }))}</div></li>`;
  };
  return pageHead(T("rq.queueTitle"), T("rq.queueLede"))
    + msgHTML(msg)
    + `<div class="chips" style="margin-bottom:10px">${[["open", T("rq.f.open")], ["published", T("rq.f.published")], ["rejected", T("rq.f.rejected")], ["withdrawn", T("rq.f.withdrawn")], ["all", T("rq.f.all")]].map(([v, l]) => chip("rq-fstatus", v, l, o.status === v)).join("")}${
        x.me ? chip("rq-fmine", x.me.id, T("rq.f.mine"), !!o.mine) : ""}</div>
       <div class="ro-search"><input id="rq-q" type="search" value="${esc(o.q || "")}" placeholder="${esc(T("rq.findPh"))}" autocomplete="off"></div>`
    + (groups.length ? groups.map(([st, rs]) => sectionHTML(`${esc(T("rq.st." + st))}<span class="hint">${rs.length}</span>`, `<ul class="flist">${rs.map(row).join("")}</ul>`)).join("")
        : emptyHTML(T("rq.queueNone"), T("rq.queueNoneHint")));
}

// ═══════════════════════════════════════════════════════════════════════
// 活動上架（2026-11-01，docs/2026-10-24-活動上架.md）
// ═══════════════════════════════════════════════════════════════════════
// 清單加一頁一場活動。一場活動 = 那個 team 的一個工作區（custom:event-<代號>）加一份報名表（可以沒有）。
// 這一頁填的是內容（標題、一句話、說明、封面網址與同意、時間、地點、名額）；報名表的題目走現有的表單編輯頁；
// 誰在裡面、簽到、行前信都是現有的入口，這裡只放連結。不是頁面編輯器。
export const EV_STATUS = ["draft", "ready", "published", "archived"];
// 封面網址像不像一張圖：http(s)，而且副檔名是圖（可以帶 ?query），或是 Drive／Google 圖床／Cloudinary／Unsplash 那幾種看得出是圖的網址。
// 這只是前端先擋一次，資料庫的 save_event 只收 https。
export function evCoverOk(url) {
  const u = String(url || "").trim();
  if (!u) return true;
  if (!/^https?:\/\//i.test(u)) return false;
  if (/\.(jpe?g|png|webp|gif|avif|svg)(\?.*)?$/i.test(u)) return true;
  return /^https:\/\/(drive\.google\.com\/(uc\?|file\/d\/|thumbnail\?)|lh3\.googleusercontent\.com\/|res\.cloudinary\.com\/|images\.unsplash\.com\/)/i.test(u);
}
export function evSlug(s) { return String(s || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40); }
// 活動的開始與結束一律是「台灣時間」（2026-11-23）。活動在台灣辦，但填的人可能在美國：
// 以前這兩格照填的人電腦的時區算，在芝加哥填早上九點，存進去是台灣晚上十一點，對外頁就寫錯時間。
// evTaipei 把資料庫的時間換成 datetime-local 要的字（台灣時間），evFromTaipei 反過來。台灣沒有日光節約，固定是 UTC+8。
export const evTaipei = d => {
  if (!d) return ""; const x = new Date(d); if (isNaN(x)) return "";
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(x);
  const g = t => p.find(q => q.type === t).value;
  return `${g("year")}-${g("month")}-${g("day")}T${g("hour")}:${g("minute")}`;
};
export const evFromTaipei = v => { if (!v) return ""; const x = new Date(String(v).slice(0, 16) + ":00+08:00"); return isNaN(x) ? "" : x.toISOString(); };
// 清單與狀態那一行印的日期時間：一樣是台灣時間（2026-11-23）。
// 以前是把資料庫那串字切掉後半，印出來的是 UTC，跟編輯頁那一格差八小時（編輯頁填 1 月 3 日 00:00，清單寫 1 月 2 日 16:00）。
const evDate = d => evTaipei(d).replace("T", " ");
export const evPast = e => !!(e && (e.ends_at || e.starts_at) && new Date(e.ends_at || e.starts_at) < new Date());
export const evTitle = e => (lang() === "zh" ? (e.title_zh || e.title_en) : (e.title_en || e.title_zh)) || e.slug;
// ── Google 地圖的連結（2026-11-24，2027-01-05-map-links.sql）──
// Paul：「for when and where, for where I need to be able to post Google Map link. Same for the venue.」
// 只收 Google 地圖的連結（分享出來的短網址，或 google.com/maps 開頭的），一定要 https。這一條跟資料庫的 map_url_ok() 是同一條，
// events/src/ui.js 印對外頁之前也再對一次（同一條 regex 抄了一份，那邊不 import 後台的檔）。空的算可以（就是沒有連結）。
export const EV_MAP_RE = /^https:\/\/(maps\.app\.goo\.gl\/|goo\.gl\/maps\/|(www\.)?google\.com(\.tw)?\/maps[/?]|maps\.google\.com(\.tw)?\/)[^\s<>"'`\\]*$/;
export const evMapOk = u => { const v = String(u == null ? "" : u).trim(); return !v || (v.length <= 600 && EV_MAP_RE.test(v)); };
// 這一列有沒有 map_url 這個鍵：沒有就是遷移檔還沒跑（data.js 讀的時候退了一步），那一格不畫。
export const evHasMap = e => !!e && Object.prototype.hasOwnProperty.call(e, "map_url");
// 「時間與地點」那一塊裡，地點底下的那一格。自己存（main.js 聽 #ev-map 的 change，叫 set_event_map_url），不走整頁那條「改了就存」，
// 所以標了 data-noauto，readEvent() 也不讀它。有連結的時候旁邊一條「在 Google 地圖上打開」讓填的人自己點點看對不對。
// venue：這場活動掛的場地（有的話）。場地有連結、活動這一格還是空的，多一顆「用場地的連結」（按了才抄過來：場地的資料只有幹部看得到，要不要放上對外頁是填的人決定）。
export function eventMapHTML(e, venue, canEdit, busy) {
  if (!evHasMap(e)) return "";
  const url = String(e.map_url || ""), dis = busy ? " disabled" : "";
  const open = url && evMapOk(url) ? `<a class="btn ghost sm" href="${esc(url)}" target="_blank" rel="noopener">${T("ev.mapOpen")}</a>` : "";
  if (!canEdit) return url ? `<p class="ev-line ev-map-ro">${T("ev.map")}：${open}</p>` : "";
  const fromVenue = !url && venue && venue.map_url && evMapOk(venue.map_url)
    ? `<button type="button" class="btn ghost sm" data-act="ev-map-venue" data-id="${esc(e.id)}"${dis}>${T("ev.mapFromVenue", { name: esc(venue.name || "") })}</button>` : "";
  return `<label class="wide"><i>${T("ev.map")}</i><input id="ev-map" type="url" inputmode="url" data-noauto="1" data-id="${esc(e.id)}" value="${esc(url)}" maxlength="600" placeholder="https://maps.app.goo.gl/…" autocomplete="off"${dis}></label>
        <span class="ev-help">${T("ev.mapHelp")}</span>${open || fromVenue ? `<div class="ev-acts ev-map-acts">${open}${fromVenue}</div>` : ""}`;
}
// ── 計畫的四格（2026-12-31-programmes.sql）──
// 一筆活動可以沒有日期：只要填了「通常在幾月」或勾了「多數年份都會辦」。對外的「現在開放」「這一年」「團隊」三頁讀的是同一筆。
// 下面這幾支都是純函式，test/programmes-admin.test.mjs 有測。
// evMonth：下拉或資料庫來的值收成 1 到 12 的整數，其他（空的、0、13、8.5、亂打的字）都當沒填，回 null。
export function evMonth(v) {
  if (v === null || v === undefined || v === "" || typeof v === "boolean") return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 12 ? n : null;
}
const EV_MONTH_EN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
// 月份的名字：中文「8 月」，英文 August。不是 1 到 12 回空字串。
export function evMonthName(v) { const m = evMonth(v); return m ? T("ev.monthN", { m, name: EV_MONTH_EN[m - 1] }) : ""; }
// 資料庫有沒有那四欄（遷移檔跑過沒）。沒跑過的時候 loadEvents() 回來的列沒有 recurring 這個鍵。
export const evHasProgramme = e => !!e && typeof e.recurring === "boolean";
// 表單上那四格讀出來的值 → save_event() 的 patch。月份沒選是 null（清掉）；名字頭尾的空白拿掉。
export function evProgrammePatch(raw) {
  const r = raw || {};
  return { usual_month: evMonth(r.usual_month), recurring: r.recurring === true, edition_zh: String(r.edition_zh || "").trim(), edition_en: String(r.edition_en || "").trim() };
}
// 清單上「什麼時候」那一小段：有日期印日期；沒有日期印「通常 8 月」；兩樣都沒有但勾了多數年份都會辦，印那五個字；都沒有回空字串。
export function evWhenLabel(e) {
  if (!e) return "";
  if (e.starts_at) return evDate(e.starts_at);
  const m = evMonth(e.usual_month);
  if (m) return T("ev.usualIn", { m, name: EV_MONTH_EN[m - 1] });
  return e.recurring === true ? T("ev.recurringTag") : "";
}
// 編輯頁「對外的活動與計畫頁、團隊頁上怎麼列」那一塊裡面的四格。ro／dis 跟內容那幾格同一套（唯讀的人看得到值、改不了）。
// 遷移檔還沒跑就只印一句要先跑哪一支。標題不在這裡畫（那一段的 h2 就是標題，見 eventEditHTML）。
// 2026-11-23：每一格的說明放在那一格底下（.ev-help）。以前「通常在幾月」的說明接在下拉的右邊，一換行就很亂。
export function eventProgrammeHTML(e, canEdit, busy) {
  if (!evHasProgramme(e)) return `<div class="note">${T("ev.pgNeedsSql")}</div>`;
  const dis = busy ? " disabled" : "", ro = canEdit ? "" : " readonly", off = canEdit ? "" : " disabled";
  const m = evMonth(e.usual_month);
  const opts = `<option value=""${m ? "" : " selected"}>${esc(T("ev.monthNone"))}</option>`
    + EV_MONTH_EN.map((_, i) => `<option value="${i + 1}"${m === i + 1 ? " selected" : ""}>${esc(evMonthName(i + 1))}</option>`).join("");
  return `<div class="two">
        <label><i>${T("ev.month")}</i><select id="ev-month" name="usual_month"${off}${dis}>${opts}</select><span class="ev-help">${T("ev.monthHelp")}</span></label>
        <div class="ev-chk"><label class="check"><input type="checkbox" id="ev-recurring" name="recurring"${e.recurring ? " checked" : ""}${off}${dis}><span>${T("ev.recurring")}</span></label><span class="ev-help">${T("ev.recurringHelp")}</span></div>
        <label><i>${T("ev.editionZh")}</i><input id="ev-edzh" name="edition_zh" value="${esc(e.edition_zh || "")}"${ro}${dis}></label>
        <label><i>${T("ev.editionEn")}</i><input id="ev-eden" name="edition_en" value="${esc(e.edition_en || "")}"${ro}${dis}></label>
        <span class="ev-help">${T("ev.editionHelp")}</span>
      </div>`;
}
// 一場活動在清單上屬於哪一段。紀錄那邊倒進來的舊活動（source import）另成一組，它們從來沒上過網站。
export function evGroup(e) {
  if (e.source === "import") return "records";
  if (e.status === "ready") return "ready";
  if (e.status === "draft") return "draft";
  if (e.status === "published" && !evPast(e)) return "published";
  return "past";
}
// 清單的篩選（2026-11-11 Paul：活動一多就找不到，要像名錄那樣能篩）。f = { q, st, team }。
// st：all 全部、live 在對外頁上、prep 草稿與準備好了、past 過去與撤下。純函式，test/events.test.mjs 有測。
// 2026-11-13：只在紀錄裡的舊活動（source import）不列在這裡了，它們沒有對外頁、報名、簽到，在這裡點進去是空的；去 Records 看。
export const EV_FILTERS = ["all", "live", "prep", "past"];
const EV_FILTER_GROUPS = { live: ["published"], prep: ["ready", "draft"], past: ["past"], records: ["records"] };
export function eventMatches(e, f) {
  const x = f || {};
  if (x.st && x.st !== "all" && !(EV_FILTER_GROUPS[x.st] || []).includes(evGroup(e))) return false;
  if (x.team && (e.team || "") !== x.team) return false;
  const n = s => String(s || "").toLowerCase().replace(/\s+/g, "");
  const q = n(x.q);
  return !q || [e.title_zh, e.title_en, e.slug, e.place, String(e.team || "").replace(/\s*Team$/i, "")].some(v => n(v).includes(q));
}
// 清單：最上面是收起來的「開一場活動」，接著搜尋與篩選，再照狀態分段（準備好了 → 草稿 → 對外中 → 過去或撤下 → 只在紀錄裡）。
// canCreateTeams 是能開活動的 team（senior 或某個 team 的資源「管」）。newOpen：開活動那一格開著沒（main.js 記）。
// 搜尋框右邊那顆「篩選」的圖示（2026-11-25：後台每一個搜尋框都是同一個樣子，樣式在 admin.css 的 .fbx）。
const EV_FUNNEL = `<svg class="fbx-ic" viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><path d="M3 5h14M6 10h8M8.5 15h3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;
export function eventsListHTML(events, me, teams, draft, msg, busy, canCreateTeams, f, newOpen, projects) {
  const dis = busy ? " disabled" : "";
  const d = draft || {};
  const ev = (events || []).filter(e => e.source !== "import");
  const nRec = (events || []).length - ev.length;
  const fx = Object.assign({ q: "", st: "all", team: "" }, f || {});
  const shown = ev.filter(e => eventMatches(e, fx));
  const groups = ["ready", "draft", "published", "past"].map(k => [k, shown.filter(e => evGroup(e) === k)]).filter(g => g[1].length);
  const row = e => `<li><div class="fhead"><b><a href="#events/${esc(e.slug)}" data-act="ev-open" data-slug="${esc(e.slug)}">${esc(evTitle(e))}</a></b> <span class="tag${e.status === "published" ? " open" : e.status === "ready" ? " warn" : e.status === "archived" ? "" : " draft"}">${esc(e.source === "import" ? T("ev.st.records") : T("ev.st." + e.status))}</span></div>
      <div class="fmeta">${esc(String(e.team || "").replace(/\s*Team$/i, ""))}${pjOf(projects, e.id) ? `・${esc(T("pj.inProject", { p: pjTitle(pjOf(projects, e.id)) }))}` : ""}${evWhenLabel(e) ? `・${esc(evWhenLabel(e))}` : ""}${e.place ? `・${esc(e.place)}` : ""}${e.form_id ? "" : `・${T("ev.noForm")}`}</div></li>`;
  // 開一場活動：收成一行放在最上面（2026-11-11 Paul：以前一直開著放在最底下，清單長了根本看不到）。填到一半或剛打開過，重畫後還開著。
  const create = (canCreateTeams || []).length ? foldHTML("ev-new", T("ev.new"), `<div class="note">${T("ev.newWhat")}</div><div class="two">
      <label><i>${T("ev.team")}</i><select id="ev-team"${dis}>${canCreateTeams.map(t => `<option value="${esc(t)}"${d.team === t ? " selected" : ""}>${esc(t.replace(/\s*Team$/i, ""))}</option>`).join("")}</select></label>
      <label><i>${T("ev.slug")}</i><input id="ev-slug" value="${esc(d.slug || "")}" placeholder="winter-camp-2027" autocomplete="off"${dis}></label>
      <label><i>${T("ev.titleZh")}</i><input id="ev-tzh" value="${esc(d.title_zh || "")}" placeholder="2027 冬令營"${dis}></label>
      <label><i>${T("ev.titleEn")}</i><input id="ev-ten" value="${esc(d.title_en || "")}" placeholder="Winter Camp 2027"${dis}></label>
    </div>
    <label class="check"><input type="checkbox" id="ev-withform"${d.with_form === false ? "" : " checked"}${dis}><span>${T("ev.withForm")}</span></label>
    <div class="row"><button class="btn" data-act="ev-create"${dis}>${busy ? T("common.saving") : T("ev.createGo")}</button><span class="mini">${T("ev.createNote")}</span></div>`, newOpen || !!draft) : "";
  const cnt = k => k === "all" ? ev.length : ev.filter(e => (EV_FILTER_GROUPS[k] || []).includes(evGroup(e))).length;
  const teamsHere = [...new Set(ev.map(e => e.team || "").filter(Boolean))].sort();
  const filters = ev.length ? `<div class="chips" style="margin-bottom:10px">${EV_FILTERS.filter(k => k === "all" || cnt(k)).map(k => fchip("ev-fst", k, `${T("ev.f." + k)} ${cnt(k)}`, fx.st === k)).join("")}</div>
      <div class="fbx ev-fbx">
        <div class="fbx-row"><input id="ev-q" type="search" value="${esc(fx.q)}" placeholder="${esc(T("ev.findPh"))}" aria-label="${esc(T("ev.findPh"))}" autocomplete="off">${
          teamsHere.length > 1 ? `<button type="button" class="fbx-btn${fx.team ? " on" : ""}" data-act="ev-filters" aria-expanded="${fx.open ? "true" : "false"}" aria-controls="ev-filters">${EV_FUNNEL}<span>${T("ev.filters")}</span>${fx.team ? `<b class="fbx-n">1</b>` : ""}</button>` : ""}</div>
        ${fx.team ? `<div class="fbx-chips"><button type="button" class="chip sm on" data-act="ev-funset" aria-label="${esc(T("ev.fUnset", { what: fx.team }))}">${T("ev.team")}${T("ev.fSep")}${esc(fx.team.replace(/\s*Team$/i, ""))} ×</button></div>` : ""}
        ${fx.open && teamsHere.length > 1 ? `<div class="fbx-panel" id="ev-filters"><div class="fbx-grid"><label><i>${T("ev.team")}</i><select id="ev-fteam" aria-label="${esc(T("ev.team"))}"><option value="">${T("ev.fAllTeams")}</option>${teamsHere.map(t => `<option value="${esc(t)}"${fx.team === t ? " selected" : ""}>${esc(t.replace(/\s*Team$/i, ""))}</option>`).join("")}</select></label></div>
          <div class="fbx-foot"><button type="button" class="btn ghost sm" data-act="ev-filters">${T("ev.filtersDone")}</button></div></div>` : ""}
      </div>` : "";
  const filtered = fx.q || fx.team || fx.st !== "all";
  const recLine = nRec ? `<div class="note ev-recline">${T("ev.recOnly", { n: nRec })} <a href="/admin/records/#overview">${T("ev.recGo")}</a></div>` : "";
  return pageHead(T("ev.title"), T("ev.lede"))
    + msgHTML(msg)
    + create
    + filters
    + (groups.length ? groups.map(([k, es]) => sectionHTML(`${esc(T("ev.g." + k))}<span class="hint">${es.length}</span>`, `<ul class="flist">${es.map(row).join("")}</ul>`)).join("")
        : ev.length && filtered ? emptyHTML(T("ev.noMatch"), T("ev.noMatchHint"), { act: "ev-fclear", label: T("ev.fClear") })
        : emptyHTML(T("ev.none"), (canCreateTeams || []).length ? T("ev.noneHint") : T("ev.noneHintNo")))
    + recLine;
}
// ── 活動編輯頁的照片與下半（2026-11-23，Paul：封面要選檔案上傳、要能放好幾張、報名與回饋不要只是一排連結）──
// 下面這幾支都是純函式，test/event-editor.test.mjs 有測。
// 縮圖：最長邊縮到 1600，小的不放大，邊長最少 1。跟歷史之路同一個算法（admin/site/src/ui.js 的 hiFit）；
// 後台的資料夾之間不互相 import，所以這裡有自己的一份。
export const EV_IMG_MAX = 1600;
export function evFit(w, h, max) {
  const m = max || EV_IMG_MAX, big = Math.max(w, h);
  if (big <= m) return { w, h };
  const r = m / big;
  return { w: Math.max(1, Math.round(w * r)), h: Math.max(1, Math.round(h * r)) };
}
// 選檔先擋一次：只收圖、原檔 25 MB 以內（更大的手機瀏覽器解碼會卡死）。縮完一定在 5 MB 以內（bucket 的上限）。
export const evFileOk = f => !!f && /^image\//.test(String(f.type || "")) && Number(f.size || 0) <= 25 * 1024 * 1024;
// 公開網址 → events bucket 裡的路徑（…/object/public/events/<活動 id>/<檔名> → <活動 id>/<檔名>）。
// 不是這個 bucket 的網址（貼的 Drive 連結）回空字串：那種沒有檔可以刪。
export function evStoragePath(url) {
  const m = /\/object\/public\/events\/([^?#]+)/.exec(String(url || ""));
  if (!m) return "";
  try { return decodeURIComponent(m[1]); } catch (x) { return ""; }
}
// 照片往前或往後一格：回一整串新順序的 id（交給 reorder_event_photos）；已經在頭或尾、找不到那一張，回 null。
export function evPhotoMove(photos, id, dir) {
  const ids = (photos || []).map(p => p.id), i = ids.indexOf(id), j = i + (Number(dir) < 0 ? -1 : 1);
  if (i < 0 || j < 0 || j >= ids.length) return null;
  [ids[i], ids[j]] = [ids[j], ids[i]];
  return ids;
}
// 報名表現在收不收得到。沒有表是 none；draft 還在寫、closed 關了；狀態是開放中的再分：時間還沒到 soon、過了截止 over、名額滿了 full、其他 open。
export function evFormState(form, signed, capacity, now) {
  if (!form) return "none";
  if (form.status !== "open") return form.status === "closed" ? "closed" : "draft";
  const t = now || new Date(), cap = Number(capacity) || 0;
  if (form.opens_at && new Date(form.opens_at) > t) return "soon";
  if (form.closes_at && new Date(form.closes_at) < t) return "over";
  if (cap > 0 && Number(signed) >= cap) return "full";
  return "open";
}
// 報名表那一行的事實：什麼時候開放、什麼時候截止、幾個人報了（有名額就寫幾分之幾）。回一串字，畫面用「・」接起來。
// 時間一律是台灣時間，字裡寫明（2026-11-23；以前印的是瀏覽器的時區，跟表單編輯頁那兩格對不起來）。
// noTimes：不印那兩個時間。改得動的人看到的是底下那兩格（eventSignupHTML），同一個時間不用寫兩次。
// 報名數載不到（null）印問號，不印 0。
export function evFormFacts(form, signed, capacity, noTimes) {
  if (!form) return [];
  const out = [], cap = Number(capacity) || 0, n = signed == null ? "?" : signed;
  if (!noTimes && form.opens_at) out.push(T("ev.opens", { d: evDate(form.opens_at) }));
  if (!noTimes && form.closes_at) out.push(T("ev.fm.closes", { d: evDate(form.closes_at) }));
  out.push(cap ? T("ev.fm.countCap", { n, c: cap }) : T("ev.fm.count", { n }));
  return out;
}
// 活動後回饋的固定題目（六題）。**跟 admin/records/src/ui.js 的 TEMPLATES["post-event"] 一字不差**（test/event-editor.test.mjs 逐題比對）：
// 同一個 key 每一年都一樣，記分卡的「會推薦」「覺得有用」就是靠 recommend、useful 這兩個 key 算的。
// 後台的資料夾之間不互相 import，所以抄一份；Records 那邊改了題目，測試會紅，這裡要跟著改。
const FBQ = (key, type, zh, en, extra) => Object.assign({ key, type, label: { zh, en }, required: false, options: [], scale_min: 1, scale_max: 5, min_label: "", max_label: "" }, extra || {});
const FB_POST_EVENT = [
  FBQ("recommend", "scale", "你會不會推薦這場活動給跟你情況一樣的朋友？", "How likely are you to recommend this event to a friend in your situation?", { required: true, min_label: { zh: "不會", en: "Would not" }, max_label: { zh: "一定會", en: "Definitely" } }),
  FBQ("useful", "scale", "今天對你自己的下一步有多有用？", "How useful was today for your own next step?"),
  FBQ("clarity", "scale", "活動結束後，你清不清楚接下來要做什麼？", "Was it clear what to do next after this event?"),
  FBQ("best", "short", "最有用的部分是什麼？", "What was the most useful part?"),
  FBQ("change", "long", "下一次我們該改什麼？", "What should we change next time?"),
  FBQ("first_time", "single", "這是你第一次參加 BT 的活動嗎？", "Is this your first BT event?", { options: { zh: ["是", "不是"], en: ["Yes", "No"] } }),
];
// 照表單的語言變成 rc_save_form 要的題目清單。
export function evFeedbackQuestions(l) {
  const pick = v => (v && typeof v === "object" && !Array.isArray(v)) ? (v[l] != null ? v[l] : v.en) : v;
  return FB_POST_EVENT.map(q => ({ key: q.key, type: q.type, label: pick(q.label), help: "", required: !!q.required,
    options: (pick(q.options) || []), scale_min: q.scale_min, scale_max: q.scale_max, min_label: pick(q.min_label) || "", max_label: pick(q.max_label) || "" }));
}
// 新回饋表的名字：「活動名稱 · 活動後回饋」，跟 Records 那邊開出來的一樣。
export const evFeedbackTitle = e => `${evTitle(e)} · ${T("ev.fb.kind")}`;

// ── 說明的排版、工具列、預覽（2026-11-23，Paul：「I need the text to be bold, highlight, or in different colors」）──
// 對外那一頁怎麼排說明，寫在 events/src/ui.js 的 richInline 與 richText。後台的預覽要畫得一模一樣，
// 但後台不 import 別的資料夾（對外頁壞掉不該讓後台打不開），所以這裡抄一份。
// **那邊改了這裡要跟著改**：test/event-page.test.mjs 拿同一批字餵兩份，輸出要一字不差，不一樣就紅。
// 記號：整行的「## 」大標題、「### 」小標題、「- 」清單、「> 」引言；一行裡面的 **粗體**、==橘色螢光==、{{綠色螢光}}、[[藍底橘字]]。
// 每一段字都先 esc() 再加標籤，說明裡打的 HTML 只會是字。
export function evRichInline(s) {
  return esc(s)
    .replace(/==(.+?)==/g, "<mark>$1</mark>")
    .replace(/\{\{(.+?)\}\}/g, '<mark class="hl2">$1</mark>')
    .replace(/\[\[(.+?)\]\]/g, '<span class="rt-c">$1</span>')
    .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
}
export function evRichText(text) {
  const out = []; let para = [], list = [], quote = [];
  const endP = () => { if (para.length) { out.push(`<p>${para.join("<br>")}</p>`); para = []; } };
  const endL = () => { if (list.length) { out.push(`<ul>${list.map(x => `<li>${x}</li>`).join("")}</ul>`); list = []; } };
  const endQ = () => { if (quote.length) { out.push(`<blockquote>${quote.join("<br>")}</blockquote>`); quote = []; } };
  for (const raw of String(text == null ? "" : text).replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trim();
    if (!line) { endP(); endL(); endQ(); continue; }
    const h = /^(#{2,3})\s+(.+)$/.exec(line), li = /^-\s+(.+)$/.exec(line), q = /^>\s+(.+)$/.exec(line);
    if (h) { endP(); endL(); endQ(); out.push(h[1].length === 2 ? `<h3>${evRichInline(h[2])}</h3>` : `<h4>${evRichInline(h[2])}</h4>`); }
    else if (li) { endP(); endQ(); list.push(evRichInline(li[1])); }
    else if (q) { endP(); endL(); quote.push(evRichInline(q[1])); }
    else { endL(); endQ(); para.push(evRichInline(line)); }
  }
  endP(); endL(); endQ();
  return out.join("");
}
// 工具列的八顆按鈕。mark 是整行的記號（加在行首）；open、close 是一行裡面的記號（包住選到的字）。
export const EV_FMT = [
  { k: "h2", mark: "## " }, { k: "h3", mark: "### " }, { k: "b", open: "**", close: "**" }, { k: "hl", open: "==", close: "==" },
  { k: "hl2", open: "{{", close: "}}" }, { k: "c", open: "[[", close: "]]" }, { k: "ul", mark: "- " }, { k: "q", mark: "> " },
];
const EV_LINE_MARK = /^(#{2,3}\s+|-\s+|>\s+)/;
// 按了一顆按鈕之後，那一格的字與選取範圍要變成什麼。純函式：吃整段字、選取的頭尾、哪一顆，回 { text, start, end }。
// 一行裡面的（粗體、兩種螢光、藍底橘字）：
//   有選字就把選到的字包起來，包完選取範圍是連記號一起，所以再按一次同一顆就是拿掉；選到的字外面剛好已經包著同一組，也是拿掉。
//   選了好幾行就一行一行包（記號不能跨行，跨了對外頁不認）。沒選字就放一組空的記號，游標停在中間。
// 整行的（大標題、小標題、清單、引言）：
//   選到的每一行（沒選就是游標在的那一行）行首加上記號；那幾行本來是別種整行記號就換掉；全部都已經是這一種，就拿掉。空白行不動。
export function evFmtApply(text, start, end, k) {
  const t = String(text == null ? "" : text), f = EV_FMT.find(x => x.k === k);
  const a = Math.max(0, Math.min(Number(start) || 0, t.length)), b = Math.max(a, Math.min(Number(end) || 0, t.length));
  if (!f) return { text: t, start: a, end: b };
  if (f.mark) {
    const ls = t.lastIndexOf("\n", a - 1) + 1;
    let le = t.indexOf("\n", b > a && t[b - 1] === "\n" ? b - 1 : b); if (le < 0) le = t.length;
    const lines = t.slice(ls, le).split("\n"), live = lines.filter(x => x.trim());
    if (!live.length) return { text: t.slice(0, ls) + f.mark + t.slice(ls), start: ls + f.mark.length, end: ls + f.mark.length };
    const has = live.every(x => x.replace(/^\s+/, "").startsWith(f.mark));
    const block = lines.map(x => { if (!x.trim()) return x; const bare = x.replace(/^\s+/, "").replace(EV_LINE_MARK, ""); return has ? bare : f.mark + bare; }).join("\n");
    return { text: t.slice(0, ls) + block + t.slice(le), start: ls, end: ls + block.length };
  }
  const o = f.open, c = f.close, sel = t.slice(a, b);
  if (!sel) return { text: t.slice(0, a) + o + c + t.slice(a), start: a + o.length, end: a + o.length };
  if (sel.length > o.length + c.length && sel.startsWith(o) && sel.endsWith(c) && !sel.includes("\n")) {
    const inner = sel.slice(o.length, sel.length - c.length);
    return { text: t.slice(0, a) + inner + t.slice(b), start: a, end: a + inner.length };
  }
  if (a >= o.length && t.slice(a - o.length, a) === o && t.slice(b, b + c.length) === c) {
    return { text: t.slice(0, a - o.length) + sel + t.slice(b + c.length), start: a - o.length, end: b - o.length };
  }
  const wrapped = sel.split("\n").map(x => { const m = /^(\s*)(.*?)(\s*)$/.exec(x); return m[2] ? m[1] + o + m[2] + c + m[3] : x; }).join("\n");
  return { text: t.slice(0, a) + wrapped + t.slice(b), start: a, end: a + wrapped.length };
}
// 預覽那一格裡面的 HTML：有字就是對外頁會畫的樣子，沒有字是一句話。main.js 在打字的時候叫同一支更新。
export const evPreviewHTML = text => evRichText(text) || `<p class="mini">${T("ev.prevEmpty")}</p>`;
// 說明那一格（中文一格、英文一格）：上面一排工具列，中間打字，下面一行怎麼打的提示（按鈕不能用的時候的退路），最下面是預覽。
// 打字那一格還是原本的 id 與 name（ev-bzh／body_zh、ev-ben／body_en），所以自動儲存與 readEvent() 都不用改。
// 唯讀的人只有那一格字（按不了、也不用看預覽）。
// 預覽 2026-11-23 收成一行（Paul：「how it will look on the public page, can we fold that?」）：真的 <details>，預設收著，中英兩格都是。
// 收著的時候裡面照樣跟著打的字更新（main.js 聽 input，換的是 #ev-bzh-prev 裡面），打開就是最新的。
// open：這一格現在開著沒。main.js 只記在記憶體裡（重畫後還開著），重新整理就回到收著。
export function eventDescHTML(e, lg, canEdit, busy, open) {
  const id = lg === "zh" ? "ev-bzh" : "ev-ben", name = "body_" + lg, val = e[name] || "";
  const dis = busy ? " disabled" : "", ro = canEdit ? "" : " readonly";
  const bar = !canEdit ? "" : `<div class="ev-tb" role="toolbar" aria-label="${esc(T("ev.fmt.bar"))}">${EV_FMT.map(f =>
    `<button type="button" class="ev-tb-b" data-act="ev-fmt" data-k="${f.k}" data-for="${id}" title="${esc(T("ev.fmt.tip." + f.k))}"${dis}>${esc(T("ev.fmt." + f.k))}</button>`).join("")}</div>`;
  return `<div class="ev-desc"><label for="${id}"><i>${T(lg === "zh" ? "ev.bodyZh" : "ev.bodyEn")}</i></label>${bar}
        <textarea id="${id}" name="${name}" style="min-height:170px"${ro}${dis}>${esc(val)}</textarea>${!canEdit ? "" : `
        <span class="ev-help">${esc(T("ev.bodyHelp"))}</span>
        <details class="ev-prev" id="${id}-fold"${open ? " open" : ""}><summary><span class="chev" aria-hidden="true"></span>${T("ev.prev")}</summary><div class="ev-rt" id="${id}-prev">${evPreviewHTML(val)}</div></details>`}</div>`;
}

// ── 活動編輯頁的外殼（2026-11-23 重排，Paul：「why is that different? Why is that a box?」）──
// 每一段都長一樣：一個 h2（sectionHTML），底下一塊或幾塊 .ev-panel。evPanel 是那一塊：
// title 是小標題（一段只有一塊的時候可以不給，那一段的 h2 就是標題）；attrs 是要掛在那一塊上的屬性（id、data-autosave）。
export const evPanel = (title, body, attrs) => `<div class="ev-panel"${attrs ? ` ${attrs}` : ""}>${title ? `<h3>${title}</h3>` : ""}${body}</div>`;
// 「改」以上的人，那一塊是一個「改了就存」的框（data-autosave="ev-save"）。這一頁有四塊是這樣（內容、時間與地點、對外怎麼列、封面），
// 每一塊各自一個框、各自一行「改了就存」的小字。不管哪一塊觸發，main.js 的 readEvent() 都是照 id 把整頁那幾格讀一遍一起存，
// 所以拆成幾塊跟以前一整個框存進去的東西一樣。唯讀的人沒有框也沒有那行小字。
const evSaveAttr = (e, canEdit) => canEdit ? `data-autosave="ev-save" data-id="${esc(e.id)}"` : "";
const evSaveFoot = (e, canEdit) => canEdit ? `<div class="form-foot">${autosaveHint("ev-save", `data-id="${esc(e.id)}"`)}</div>` : "";

// 對外看得到沒的那個標籤（封面、活動照片、講者共用）：沒同意的是「對外看不到」；同意了的，活動上架了是「對外看得到」，還沒上架是「上架後看得到」。
export const evShownTag = (on, live, k) => `<span class="tag${on && live ? " open" : on ? " ok" : " draft"}">${T(on ? (live ? k + "Public" : k + "Ready") : k + "Hidden")}</span>`;
// 封面那一塊裡「對外看得到沒」的那一行。2026-11-24 起沒有同意的勾了（Paul：「If I upload a photo, I have consent. So just take that away」）：
// 放上封面（選檔或貼連結）就算確認過同意，main.js 的 saveEventFields 接著把 cover_consent 存成 true。
// 改版之前放的、當時沒勾的封面不會自己變公開：這裡寫「對外看不到」加一顆「放上對外頁」，按了才會（main.js 的 ev-cover-show）。
// main.js 貼連結存完不重畫整頁，只換這一行（id="ev-cover-state"）。
export function evCoverStateHTML(e, canEdit, busy) {
  if (!e.cover_url) return "";
  return `${evShownTag(!!e.cover_consent, e.status === "published", "ev.ph")}${!e.cover_consent && canEdit ? ` <button type="button" class="btn sm" data-act="ev-cover-show" data-id="${esc(e.id)}"${busy ? " disabled" : ""}>${T("ev.showPublic")}</button><span class="ev-help">${T("ev.coverHiddenHelp")}</span>` : ""}`;
}
// 封面那一塊（自己是一個「改了就存」的框：連結那一格改了就存）。
// 主要是選檔案（main.js 聽 #ev-cover-file 的 change：縮圖、傳到 Storage 的 events bucket、把網址存進 cover_url）；貼連結收在一格裡當備用。
// 連結那一格一直在畫面上，readEvent() 才讀得到；封面本來就是貼的連結，那一格先打開。x.coverUp 是上傳進度 { pct, name }。
export function eventCoverHTML(e, canEdit, busy, x) {
  const o = x || {}, dis = busy ? " disabled" : "", ro = canEdit ? "" : " readonly", up = o.coverUp;
  const uploaded = !!evStoragePath(e.cover_url);
  const pick = !canEdit ? "" : up
    ? `<div class="hi-up"><progress value="${esc(String(up.pct || 0))}" max="100"></progress> <span class="mini">${esc(T("ev.uploading", { name: up.name || "" }))}</span></div>`
    : `<label class="hi-upload"><i>${T(e.cover_url ? "ev.coverChange" : "ev.coverPick")}</i><input type="file" id="ev-cover-file" accept="image/*" data-noauto="1" data-id="${esc(e.id)}"${dis}></label>`;
  const link = `<label><i>${T("ev.cover")}</i><input id="ev-cover" name="cover_url" value="${esc(e.cover_url || "")}" placeholder="https://…"${ro}${dis}></label>`;
  const linkBox = canEdit ? foldHTML("ev-cover-link", T("ev.coverLink"), link, !!o.coverLinkOpen || (!!e.cover_url && !uploaded)) : (e.cover_url ? link : "");
  return evPanel(T("ev.coverSec"), `
      ${e.cover_url ? `<img class="ev-cover" src="${esc(e.cover_url)}" alt="">` : `<p class="ev-line">${T("ev.coverNone")}</p>`}
      <div class="ev-ph-state" id="ev-cover-state">${evCoverStateHTML(e, canEdit, busy)}</div>
      ${pick}
      ${linkBox}
      ${canEdit ? `<span class="ev-help">${T("ev.coverNote")}</span>` : ""}
      ${canEdit && e.cover_url ? `<div class="ev-acts"><button class="btn quiet danger sm" data-act="ev-cover-clear" data-id="${esc(e.id)}"${dis}>${T("ev.coverClear")}</button></div>` : ""}
      ${evSaveFoot(e, canEdit)}`, `id="ev-coverbox"${canEdit ? " " + evSaveAttr(e, canEdit) : ""}`);
}
// 活動照片（好幾張）。photos 是 event_photos_list() 回的：undefined 還在載、null 是遷移檔還沒跑、陣列是照片。
// 讀與寫的門都是「這場活動改得動」（資料庫的 can_edit），所以只有「看」的人整塊不畫。x.photoUp 是上傳進度 { pct, name, i, n }。
// 2026-11-24 改成一格一格的小圖（Paul：「the photo is way too big. If I have like 30 photos on them, there'll be no place to fit…
//   whenever I press them it's gonna pop up in the middle, and then I can tap right or left, and then change early and later to the arrow sign」）：
//   每一格只有照片與底下兩顆箭頭（往前一格、往後一格）；點照片在畫面中間放大（evLightboxHTML，main.js 管那個 <dialog>），
//   同意、拿掉這張都在放大的那一格裡。對外看不到的那幾張，小圖上有一個標籤、照片變淡。
// 同意：2026-11-24 起沒有勾了。傳照片就算確認過同意（main.js 傳完接著叫 set_event_photo_consent），那一句寫在上面的提醒裡。
// 資料庫那道門沒動：consent 是 false 的照樣不會出現在對外頁（public_event_extras()）。改版之前傳的、當時沒勾的那幾張還是 false，
// 小圖上有「對外看不到」的標籤，放大之後有一顆「放上對外頁」，按了才會公開。
export const evArrow = (act, id, dir, label, off, glyph) =>
  `<button type="button" class="ev-arrow" data-act="${act}" data-id="${esc(id)}" data-dir="${dir}" aria-label="${esc(label)}" title="${esc(label)}"${off ? " disabled" : ""}>${glyph}</button>`;
export function eventPhotosHTML(e, photos, canEdit, busy, x) {
  if (!canEdit) return "";
  const o = x || {}, up = o.photoUp, dis = busy ? " disabled" : "";
  // 2026-11-23：不再自己是一整段，是「照片」那一段裡的一塊（封面在上面、這一塊在下面），所以標題是 h3。
  const head = `${T("ev.photos")}${Array.isArray(photos) ? ` <span class="hint">${photos.length}</span>` : ""}`;
  if (photos === undefined) return evPanel(head, `<div class="mini">${T("loading")}</div>`, 'id="ev-photos"');
  if (!Array.isArray(photos)) return evPanel(head, `<div class="note">${T("ev.photosNeedsSql")}</div>`, 'id="ev-photos"');
  const n = photos.length;
  const card = (p, i) => `<li class="ev-thumb${p.consent ? "" : " off"}">
      <button type="button" class="ev-thumb-b" data-act="ev-ph-open" data-id="${esc(p.id)}" aria-label="${esc(T("ev.phOpen", { i: i + 1, n }))}"><img src="${esc(p.url)}" alt="" loading="lazy"></button>
      ${p.consent ? "" : `<span class="tag draft ev-thumb-tag">${T("ev.phHidden")}</span>`}
      <div class="ev-thumb-mv">${evArrow("ev-ph-move", p.id, -1, T("ev.phEarlier"), i === 0 || busy, "←")}${evArrow("ev-ph-move", p.id, 1, T("ev.phLater"), i === n - 1 || busy, "→")}</div></li>`;
  const pick = up
    ? `<div class="hi-up"><progress value="${esc(String(up.pct || 0))}" max="100"></progress> <span class="mini">${esc(up.n > 1 ? T("ev.uploadingN", { name: up.name || "", i: up.i || 1, n: up.n }) : T("ev.uploading", { name: up.name || "" }))}</span></div>`
    : `<label class="hi-upload"><i>${T("ev.photosPick")}</i><input type="file" id="ev-photo-files" accept="image/*" multiple data-id="${esc(e.id)}"${dis}></label>`;
  return evPanel(`${head} <span class="hint">${T("ev.photosHint")}</span>`, `<div class="note">${T("ev.photosNote")}</div>
      ${n ? `<ul class="ev-thumbs">${photos.map(card).join("")}</ul><div class="ev-help ev-thumbs-tip">${T("ev.photosTip")}</div>` : `<p class="ev-line">${T("ev.photosNone")}</p>`}
      ${pick}`, 'id="ev-photos"');
}
// 放大的那一格要看哪一張：往左往右一張，到頭就繞回另一頭。找不到現在那一張（剛被拿掉）回 null。純函式，test/event-editor.test.mjs 有測。
export function evLbStep(photos, id, dir) {
  const list = Array.isArray(photos) ? photos : [], i = list.findIndex(p => p.id === id);
  if (i < 0 || !list.length) return null;
  return list[(i + (Number(dir) < 0 ? -1 : 1) + list.length) % list.length].id;
}
// 放大的那一格裡面的 HTML（main.js 把它放進 <dialog id="ev-lb">）。找不到那一張回空字串，main.js 就把那一格關掉。
// 上面一行：第幾張、對外看不看得到、關掉。中間：左右兩顆大的箭頭換照片（只有一張就不畫）。
// 下面：往前一格與往後一格、對外看不到的有「放上對外頁」（看得到的是「從對外頁收起來」）、拿掉這張。
// 往前往後按了之後這一格跟著同一張照片走，所以可以連按，一路把一張照片排到想要的位置。
export function evLightboxHTML(e, photos, id, busy) {
  const list = Array.isArray(photos) ? photos : [], i = list.findIndex(p => p.id === id);
  if (i < 0) return "";
  const p = list[i], n = list.length, dis = busy ? " disabled" : "", live = e && e.status === "published";
  const nav = (dir, label, glyph) => n < 2 ? "" : `<button type="button" class="ev-lb-nav" data-act="ev-lb-go" data-dir="${dir}" aria-label="${esc(label)}" title="${esc(label)}">${glyph}</button>`;
  const show = p.consent
    ? `<button type="button" class="btn quiet sm" data-act="ev-ph-show" data-id="${esc(p.id)}" data-v="0"${dis}>${T("ev.hidePublic")}</button>`
    : `<button type="button" class="btn sm" data-act="ev-ph-show" data-id="${esc(p.id)}" data-v="1"${dis}>${T("ev.showPublic")}</button>`;
  return `<div class="ev-lb-bar"><b class="ev-lb-n">${esc(T("ev.lbCount", { i: i + 1, n }))}</b>${evShownTag(!!p.consent, live, "ev.ph")}<span class="sp"></span><button type="button" class="btn ghost sm" data-act="ev-lb-close">${T("ev.lbClose")}</button></div>
    <div class="ev-lb-stage">${nav(-1, T("ev.lbPrev"), "←")}<img class="ev-lb-img" src="${esc(p.url)}" alt="">${nav(1, T("ev.lbNext"), "→")}</div>
    <div class="ev-lb-foot">
      <div class="ev-acts"><button type="button" class="btn ghost sm" data-act="ev-ph-move" data-id="${esc(p.id)}" data-dir="-1"${i === 0 || busy ? " disabled" : ""}>← ${T("ev.phEarlier")}</button><button type="button" class="btn ghost sm" data-act="ev-ph-move" data-id="${esc(p.id)}" data-dir="1"${i === n - 1 || busy ? " disabled" : ""}>${T("ev.phLater")} →</button>${show}<span class="sp"></span><button type="button" class="btn quiet danger sm" data-act="ev-ph-del" data-id="${esc(p.id)}"${dis}>${T("ev.phDel")}</button></div>
    </div>`;
}
// ── 講者與報名類型（2026-11-23，2027-01-02-event-speakers-tickets.sql）──
// 下面這幾支純函式 test/event-speakers-tickets.test.mjs 有測。
// 對外只放名字不放姓。從紀錄挑人的時候先幫忙猜一個：英文名字（有空白、都是拉丁字母）取第一段，其他的原樣帶入，讓編輯的人自己改短。
export function evFirstName(name) {
  const n = String(name || "").trim().replace(/\s+/g, " ");
  return /^[A-Za-z][A-Za-z.'-]*( [A-Za-z][A-Za-z.'-]*)+$/.test(n) ? n.split(" ")[0] : n;
}
// 沒有照片的時候圓圈裡印的那一個字：名字的第一個字（英文轉大寫）。沒有名字回空字串。
export function evInitial(name) { const c = Array.from(String(name || "").trim())[0] || ""; return c.toUpperCase(); }
// 一列（講者或報名類型）現在要印的值：畫面上打到一半的（typed，重畫前 main.js 收進來的）蓋過資料庫的。
export function evRowVals(row, keys) {
  const t = (row && row.typed) || {}, out = {};
  for (const k of keys) out[k] = t[k] != null ? String(t[k]) : (row && row[k] != null ? String(row[k]) : "");
  return out;
}
// 講者那一列打的字 → save_event_speaker() 的 patch。名字空的回 null（畫面先擋一次）。
export function evSpeakerPatch(raw) {
  const r = raw || {}, name = String(r.display_name || "").trim();
  if (!name) return null;
  return { display_name: name, subject: String(r.subject || "").trim(), school: String(r.school || "").trim() };
}
// 報名類型那一列打的字 → save_event_ticket() 的 patch。回 { patch } 或 { err: "err.evTkName" | "err.evTkCap" }。
// 名額：空的當 0（不限）；要是 0 以上的整數，最多六位數（跟資料庫同一條）。
export function evTicketPatch(raw) {
  const r = raw || {}, zh = String(r.name_zh || "").trim(), en = String(r.name_en || "").trim(), cap = String(r.capacity == null ? "" : r.capacity).trim() || "0";
  if (!zh && !en) return { err: "err.evTkName" };
  if (!/^[0-9]{1,6}$/.test(cap)) return { err: "err.evTkCap" };
  return { patch: { name_zh: zh, name_en: en, note_zh: String(r.note_zh || "").trim(), note_en: String(r.note_en || "").trim(), capacity: Number(cap) } };
}
// 報名類型的名字：照畫面的語言，沒有就用另一種。
export const evTicketName = t => (t ? (lang() === "zh" ? (t.name_zh || t.name_en) : (t.name_en || t.name_zh)) || "" : "");
// 一種類型報了幾個：有名額寫幾分之幾，不限就只寫人數。
export const evTicketFacts = t => { const c = Number(t && t.capacity) || 0, n = Number(t && t.taken) || 0; return c ? T("ev.tkCountCap", { n, c }) : T("ev.tkCount", { n }); };
export const evTicketFull = t => { const c = Number(t && t.capacity) || 0; return c > 0 && (Number(t && t.taken) || 0) >= c; };
// 誰看得到「從紀錄裡找人」：Co-President、Senior Adviser、紀錄工作區裡的人（跟資料庫的 rc_can_view 同一條）。
// 這只決定畫不畫那一格；讀不到名錄的人就算自己去叫，資料庫回的也是空的。
export const evCanPickPeople = me => !!me && (senior(me) || !!wsLevel(me, "custom:records"));

// ── 從紀錄挑講者（2027-01-03，2027-01-03-people-network.sql）──
// rc_find_people() 多回三樣：labels（["speaker", "student:past"…]，:past 是現在不是了）、card（個人檔案裡的領域、職稱、單位、照片，沒有檔案是 null）、
// latest（最近一筆去向的學校或公司）。遷移檔還沒跑的資料庫沒有這三樣，下面每一支都當成「沒有」，畫面照舊印身分（成員、學員、來賓）。
// 標籤的名字在 strings.js 的 lab.*，跟 admin/records 那一份一樣（資料夾之間不互相 import）。
const EV_LABELS = ["member", "intern", "student", "mentee", "mentor", "speaker", "volunteer", "organizer", "professor", "admission_officer", "connection"];
export function evLabelName(code) {
  const [label, tail] = String(code || "").split(":"), past = tail === "past";
  if (!EV_LABELS.includes(label)) return "";
  return T("lab." + label + (past && (label === "member" || label === "student") ? ".past" : ""));
}
// 找到的那個人後面那排標籤；現在不是了的變淡。學員就寫「學員」，跟別的標籤一樣（2026-11-25 Paul：「Take out the maybe a minor thing」）。
export function evLabelChips(p) {
  return ((p && p.labels) || []).map(code => {
    const name = evLabelName(code); if (!name) return "";
    return `<span class="tag${String(code).endsWith(":past") ? " past" : ""}">${esc(name)}</span>`;
  }).filter(Boolean).join(" ");
}
// 挑了一個人之後，「加一位」那幾格要變成什麼。純函式，main.js 的 ev-sp-pick 只叫它。
// 帶什麼：名字（英文名取第一段）、主題（個人檔案的專長領域）、學校（個人檔案的公司或單位，沒有就最近一筆去向，再沒有才是名單上的學校）。
// **照片不帶、不抄**（2026-11-26，Paul 選的）：講者卡沒有自己的照片，對外頁就用他在名單裡的那一張（資料庫 2027-01-14-speaker-people-photo.sql），
// 所以之後在名單換照片，活動頁會跟著換。draft.people_photo 只是給加的人先看一眼那一張，不會存進講者卡。
// **只填空的格子**：人已經打了字的那一格不蓋。上一次帶入、人沒改過的那個字算空的（draft.auto 記著），所以挑錯人再挑一次會換成對的那個人的。
// minor：紀錄裡這個人現在是學員。它只決定「放在對外頁」那一格一開始勾不勾（show）：挑了學員那一格先不勾，其他人先勾，
// 要不要放是加的人自己勾的。2026-11-25 起畫面上不再寫「可能未成年」、放上去也不再多問一次（Paul：「take it out… I don't need that in everywhere possible」）。
export const evMaybeMinor = p => !!p && (Array.isArray(p.labels) ? p.labels.includes("student") : p.kind === "student");
export const EV_SP_FILL = ["display_name", "subject", "school"];
export function evSpeakerPrefill(draft, p) {
  const d = Object.assign({}, draft), auto = Object.assign({}, d.auto), who = p || {}, card = who.card || {};
  const want = { display_name: evFirstName(who.name), subject: card.field || "", school: card.job_org || who.latest || who.school || "" };
  for (const k of EV_SP_FILL) {
    const cur = String(d[k] == null ? "" : d[k]).trim();
    if (cur !== "" && !(auto[k] != null && cur === String(auto[k]).trim())) continue;
    d[k] = want[k]; auto[k] = want[k];
  }
  const minor = evMaybeMinor(who);
  return Object.assign(d, { person_id: who.id || null, from: who.name || "", auto, minor, show: !minor, people_photo: String(card.photo_url || "") });
}
// 不連到這個人了：名字、主題、學校留著（照舊，人可能只是不想連），名單裡那張照片的預覽拿掉（不連到他，對外頁就不會用他的照片）。
export function evSpeakerUnpick(draft) {
  const d = Object.assign({}, draft), auto = Object.assign({}, d.auto);
  return Object.assign(d, { person_id: null, from: "", auto, minor: false, people_photo: "" });
}

// ── 講者與紀錄接起來（2026-11-25）──
// Paul：「what if this speaker is completely new to our organization and I do want to add him or her into our databases? Like where do I do that?…
// there's no link that we talked about. Even the 2 people that was in our databases… I still wanted to send them a link」。
// 以前要跑三個地方（紀錄加人、紀錄開連結、回活動挑人）。現在在講者那一塊就做得完，三件事：
//   1. 找不到人的時候，一顆「把「某某」加進名單」：在紀錄建一個人（種類是來賓），名字帶進「加一位」那幾格。
//   2. 每一位講者打開有一塊「個人連結」：開連結、複製、看他打開過沒、送出過沒。直接打名字加的那一位先有一顆「加進名單」。
//   3. 他送出之後，一顆「照他填的更新這一位」：領域、單位、照片帶過來，名字不動。
// 只有管得了紀錄的人看得到這幾塊（跟資料庫的 rc_can_manage 同一條：Co-President、Senior Adviser，或紀錄工作區「改」以上）。
// 叫的都是 Records 原本的函式，門沒有變，沒有遷移檔。還在念高中的學員照舊開不了個人連結（資料庫擋，回 minor_no_link）。
export const evCanManagePeople = me => !!me && (senior(me) || ["edit", "manage"].includes(wsLevel(me, "custom:records")));
// 一個人在紀錄裡的那一頁（2026-11-25 Paul：「it doesn't take me directly to the people. Like I still have to go to records and then find people」）。
// 講者那一行、找到的每一個人、剛帶入的那一句後面都有這一條，一點就到，不用自己去紀錄裡找。
export const evPersonHref = id => withLang("/admin/records/#people/" + encodeURIComponent(id || ""));
// 找到的人那一行要印的另一個名字：資料庫回了 name_zh／name_en（2027-01-07-speaker-profiles.sql）就印跟大字不一樣的那一個；沒回就不印。
export function evOtherName(p) {
  const main = String((p && p.name) || "").trim(), zh = String((p && p.name_zh) || "").trim(), en = String((p && p.name_en) || "").trim();
  return [zh, en].filter(n => n && n !== main).join(" ");
}
export const evProfileURL = token => `${typeof location === "undefined" ? "https://beyondtaiwannpo.com" : location.origin}/profile/?t=${encodeURIComponent(token || "")}`;
// 一個新的人要存進紀錄的那幾格。有中文字的名字放 name_zh，其他放 name_en；種類是來賓（講者多半是外面的人，來賓開得了個人連結）。
export function evPersonDraft(name, school) {
  const n = String(name || "").trim().replace(/\s+/g, " ").slice(0, 80); if (!n) return null;
  const o = { kind: "guest" }; o[/[\u3400-\u9fff]/.test(n) ? "name_zh" : "name_en"] = n;
  const sc = String(school || "").trim(); if (sc) o.school = sc;
  return o;
}
// rc_person() 回的那一包 → 講者卡要更新成什麼。只帶他有填的：領域 → 主題；單位（沒有就最近一筆去向的學校或公司，再沒有才是名單上的學校）→ 學校；照片。
// 照片只在講者卡**已經有自己的一張**的時候才帶（把那一張換成名單裡現在的）。卡上沒有照片就不抄：對外頁本來就會用名單裡的那一張（2026-11-26）。
// 名字不動（對外只放名字，那是加的人決定的）。沒有任何一樣可以帶就回 null。純函式。
export function evProfileFill(sp, rc) {
  const r = rc || {}, pf = r.profile || {}, pe = r.person || {}, out = (r.outcomes || [])[0] || {}, cur = sp || {};
  const subject = String(pf.field || "").trim(), school = String(pf.job_org || out.institution || pe.school || "").trim(), photo = cur.photo_url ? String(pf.photo_url || "").trim() : "";
  const patch = { display_name: String(cur.display_name || "").trim(), subject: subject || String(cur.subject || ""), school: school || String(cur.school || "") };
  const changed = patch.subject !== String(cur.subject || "") || patch.school !== String(cur.school || "");
  if (!changed && !photo) return null;
  return { patch, photo, changed };
}
const evDay = v => (v ? String(v).slice(0, 10) : "");
// 一位講者打開之後的那一塊「個人連結」。st 是 main.js 記的那一位的狀態：undefined 還沒按、"loading"、{ err }、或 rc_person() 回的那一包。
export function evSpeakerLinkHTML(sp, st, canLink, busy) {
  if (!canLink) return "";
  const dis = busy ? " disabled" : "", id = esc(sp.id);
  if (!sp.person_id) {
    const full = sp.typed && sp.typed.full_name != null ? sp.typed.full_name : (sp.display_name || "");
    return `<div class="ev-sp-ppl"><p class="ev-line">${T("ev.spPplNone")}</p>
          <label><i>${T("ev.spPplFull")}</i><span class="ev-sp-findrow"><input data-f="full_name" value="${esc(full)}" maxlength="80" autocomplete="off"${dis}><button type="button" class="btn ghost sm" data-act="ev-sp-toperson" data-id="${id}"${dis}>${T("ev.spPplAdd")}</button></span></label>
          <span class="ev-help">${T("ev.spPplHelp")}</span></div>`;
  }
  const head = `<b class="ev-sp-ppl-h">${T("ev.spLink")}</b>`;
  if (st === undefined) return `<div class="ev-sp-ppl"><button type="button" class="btn ghost sm" data-act="ev-sp-link" data-id="${id}"${dis}>${T("ev.spLink")}</button><span class="ev-help">${T("ev.spLinkHelp")}</span></div>`;
  if (st === "loading") return `<div class="ev-sp-ppl">${head}<p class="ev-line mini">${T("ev.spLinkLoading")}</p></div>`;
  if (st && st.err) return `<div class="ev-sp-ppl">${head}<div class="note">${esc(st.err)}</div><button type="button" class="btn ghost sm" data-act="ev-sp-link" data-id="${id}"${dis}>${T("ev.spLink")}</button></div>`;
  const l = (st && st.link) || null, pf = (st && st.profile) || {};
  const make = k => `<button type="button" class="btn ${l ? "ghost " : ""}sm" data-act="ev-sp-link-create" data-id="${id}"${dis}>${T(k)}</button>`;
  let body;
  if (!l) body = `<p class="ev-line">${T("ev.spLinkNone")}</p><div class="ev-acts">${make("ev.spLinkCreate")}</div>`;
  else if (l.expired || !l.token) body = `<p class="ev-line">${l.expired ? T("ev.spLinkExpired", { exp: evDay(l.expires_at) }) : T("ev.spLinkExp", { exp: evDay(l.expires_at) })}</p><div class="ev-acts">${make("ev.spLinkNew")}</div>`;
  else body = `<label><i>${T("ev.spLinkUrl")}</i><span class="ev-sp-findrow"><input id="ev-sp-url-${id}" readonly value="${esc(evProfileURL(l.token))}"><button type="button" class="btn sm" data-act="ev-sp-link-copy" data-id="${id}">${T("ev.spLinkCopy")}</button></span></label>
          <p class="ev-line mini">${T("ev.spLinkExp", { exp: evDay(l.expires_at) })} ${l.opened_at ? T("ev.spLinkOpened", { day: evDay(l.opened_at) }) : T("ev.spLinkNotOpened")} ${l.submitted_at ? T("ev.spLinkSubmitted", { day: evDay(l.submitted_at) }) : T("ev.spLinkNotSubmitted")}</p>`;
  const fresh = pf.updated_at || pf.done_at ? `<div class="ev-acts"><button type="button" class="btn ghost sm" data-act="ev-sp-refresh" data-id="${id}"${dis}>${T("ev.spRefresh")}</button><span class="ev-help">${T("ev.spRefreshHelp")}</span></div>` : "";
  return `<div class="ev-sp-ppl">${head}${body}${fresh}<p class="ev-line mini"><a href="${evPersonHref(sp.person_id)}">${T("ev.spLinkRecords")}</a></p></div>`;
}

// 一位講者打開之後，照片那一格下面的一句話（2026-11-26）。sp.people_photo 是 event_speakers_list() 回的：他在名單裡的照片，沒有就是 null。
// 卡上沒有自己的照片、名單裡有：講現在用的是名單那一張。卡上有自己的、名單裡也有：講拿掉這一張就會改用名單的。其他情形不印。
export function evPeoplePhotoNote(sp) {
  const s = sp || {};
  if (!s.person_id || !/^https:\/\//.test(String(s.people_photo || ""))) return "";
  return `<p class="ev-line mini ev-sp-pnote">${T(s.photo_url ? "ev.spPhotoPeopleAlso" : "ev.spPhotoPeople")}</p>`;
}

// 講者（一場可以好幾位）。speakers 是 event_speakers_list() 回的：undefined 還在載、null 是遷移檔還沒跑、陣列是講者。
// 讀與寫的門都是「這場活動改得動」，所以只有「看」的人整塊不畫。
// x.spUp 是照片的上傳進度 { id, pct, name }；x.spDraft 是「加一位」填到一半的 { display_name, subject, school, person_id, from, photo_url, auto }
//（photo_url 是從紀錄帶來的照片，auto 記哪幾格是帶入的，見上面的 evSpeakerPrefill）；
// x.spOpen 那一格開著沒；x.canPick 看不看得到「從紀錄裡找人」；x.spFound 找到的人（undefined 是還沒找過）；x.spQ 找的字。
// 名字、主題、學校改完要按「存這一位」。
// 對外看不看得到是一格勾選「放在對外頁」（2026-11-25 Paul：「Why is showing that if I can choose they're being shown or not? So make a box I can tick」），
// 取代前一天的狀態標籤加「放上對外頁／從對外頁收起來」兩顆按鈕。每一位打開之後有一格，勾或取消馬上存（main.js 的 ev-sp-show，叫的還是 set_event_speaker_consent）；
// 「加一位」也有一格（x.spDraft.show，沒動過就是勾著的，從紀錄挑了學員的先不勾），加完照它存。
// 改名字、換照片資料庫會把 consent 退回 false，main.js 照改之前的樣子補回去。資料庫那道門（public_event_extras()）沒動。
// 那一段「只放名字、未成年不放」的提醒與「可能未成年」的標籤同一天拿掉（Paul：「take it out」）。
const SP_KEYS = ["display_name", "subject", "school"];
export function eventSpeakersHTML(e, speakers, canEdit, busy, x) {
  if (!canEdit) return "";
  const o = x || {}, up = o.spUp, dis = busy ? " disabled" : "";
  const head = `${T("ev.sp")}${Array.isArray(speakers) ? `<span class="hint">${speakers.length}</span>` : ""}`;
  if (speakers === undefined) return sectionHTML(head, evPanel("", `<div class="mini">${T("loading")}</div>`), { id: "ev-speakers" });
  if (!Array.isArray(speakers)) return sectionHTML(head, evPanel("", `<div class="note">${T("ev.spNeedsSql")}</div>`), { id: "ev-speakers" });
  const live = e.status === "published";
  const face = (name, url, sz) => url ? `<img class="ev-sp-pic${sz || ""}" src="${esc(url)}" alt="">` : `<span class="ev-sp-pic${sz || ""}" aria-hidden="true">${esc(evInitial(name))}</span>`;
  // 「放在對外頁」那一格。勾著、活動還沒上架的時候後面多一句「活動上架之後才看得到」。
  const showBox = (attrs, on) => `<label class="check ev-sp-show"><input type="checkbox" ${attrs}${on ? " checked" : ""}${dis}><span>${T("ev.spShow")}</span></label>${on && !live ? ` <span class="mini">${T("ev.spShowLater")}</span>` : ""}`;
  const fields = (v, idp) => `<div class="two">
          <label><i>${T("ev.spName")}</i><input data-f="display_name"${idp ? ` id="${idp}-name"` : ""} value="${esc(v.display_name)}" maxlength="60" autocomplete="off"${dis}></label>
          <label><i>${T("ev.spSubject")}</i><input data-f="subject" value="${esc(v.subject)}" maxlength="120" autocomplete="off"${dis}></label>
          <label><i>${T("ev.spSchool")}</i><input data-f="school" value="${esc(v.school)}" maxlength="120" autocomplete="off"${dis}></label>
        </div>`;
  // 2026-11-24 每一位收成一行（Paul：「it's like a whole chunk of information I need to fill out, and that's not necessary to see」）：
  // 收著的時候只有照片、名字、學校與主題，右邊兩顆箭頭排順序；點那一行打開才是那幾格、換照片、同意、存、拿掉。
  // 是真的 <details>，哪幾位開著 main.js 記在 x.spOpenIds（重畫後還開著）；照片正在傳的那一位一定開著。
  // 收著的那幾格還在畫面裡（只是看不到），所以打到一半的字不會因為收起來就不見（keepPanelsTyped 照樣收得到）。
  const card = (sp, i) => {
    const v = evRowVals(sp, SP_KEYS), mine = up && up.id === sp.id;
    const pick = mine
      ? `<div class="hi-up"><progress value="${esc(String(up.pct || 0))}" max="100"></progress> <span class="mini">${esc(T("ev.uploading", { name: up.name || "" }))}</span></div>`
      : `<label class="hi-upload"><i>${T(sp.photo_url ? "ev.spPhotoChange" : "ev.spPhotoPick")}</i><input type="file" accept="image/*" data-act="ev-sp-photo" data-id="${esc(sp.id)}"${dis}></label>`;
    const open = mine || !!(o.spOpenIds && o.spOpenIds[sp.id]);
    const sub = [sp.school, sp.subject].map(t => String(t || "").trim()).filter(Boolean).join("・");
    return `<li class="ev-sp" data-sp-row data-id="${esc(sp.id)}"><details class="ev-sp-fold" data-sp-fold="${esc(sp.id)}"${open ? " open" : ""}>
      <summary><span class="chev" aria-hidden="true"></span>${face(sp.display_name, sp.photo_url || sp.people_photo, " sm")}<span class="ev-sp-who"><b>${esc(sp.display_name || "")}</b>${sub ? `<span class="mini">${esc(sub)}</span>` : ""}</span>${sp.consent ? "" : `<span class="tag draft">${T("ev.spHidden")}</span>`}<span class="sp"></span><span class="ev-mv">${evArrow("ev-sp-move", sp.id, -1, T("ev.mvUp"), i === 0 || busy, "↑")}${evArrow("ev-sp-move", sp.id, 1, T("ev.mvDown"), i === speakers.length - 1 || busy, "↓")}</span></summary>
      <div class="ev-sp-f">
        <div class="ev-ph-state">${showBox(`data-act="ev-sp-show" data-id="${esc(sp.id)}"`, !!sp.consent)}${sp.person_id ? ` <a class="mini ev-sp-open" href="${evPersonHref(sp.person_id)}">${T("ev.spFromRecords")}</a>` : ""}</div>
        ${fields(v)}
        ${pick}${evPeoplePhotoNote(sp)}
        ${evSpeakerLinkHTML(sp, (o.spLink || {})[sp.id], !!o.canLink, busy)}
        <div class="ev-acts"><button class="btn sm" data-act="ev-sp-save" data-id="${esc(sp.id)}"${dis}>${T("ev.spSave")}</button>${sp.photo_url ? `<button class="btn ghost sm" data-act="ev-sp-photo-clear" data-id="${esc(sp.id)}"${dis}>${T("ev.spPhotoClear")}</button>` : ""}<span class="sp"></span><button class="btn quiet danger sm" data-act="ev-sp-del" data-id="${esc(sp.id)}"${dis}>${T("ev.spDel")}</button></div>
      </div></details></li>`;
  };
  const d = o.spDraft || {};
  const found = o.spFound;
  // 找到的人後面：個人檔案裡的領域與單位（有才印），再來是標籤。遷移檔還沒跑（沒有 labels）就照舊印身分。
  const nowOf = p => [(p.card || {}).field, (p.card || {}).job_org].filter(Boolean).join("・");
  const finder = !o.canPick ? "" : `<div class="ev-sp-find">
        <label><i>${T("ev.spFind")}</i><span class="ev-sp-findrow"><input id="ev-sp-q" type="search" value="${esc(o.spQ || "")}" placeholder="${esc(T("ev.spFindPh"))}" autocomplete="off"${dis}><button class="btn ghost sm" data-act="ev-sp-find" data-id="${esc(e.id)}"${dis}>${T("ev.spFindGo")}</button></span><span class="mini">${T("ev.spFindHint")}</span></label>
        ${Array.isArray(found) ? (found.length
          ? `<ul class="plain ev-sp-found">${found.map(p => `<li><b>${esc(p.name || T("common.noName"))}</b>${evOtherName(p) ? ` <b class="ev-sp-alt">${esc(evOtherName(p))}</b>` : ""}${p.school ? ` <span class="mini">${esc(p.school)}</span>` : ""}${p.latest && p.latest !== p.school && p.latest !== (p.card || {}).job_org ? ` <span class="mini">${esc(p.latest)}</span>` : ""}${nowOf(p) ? ` <span class="mini">${esc(nowOf(p))}</span>` : ""} ${Array.isArray(p.labels) ? evLabelChips(p) : `<span class="tag">${esc(T("ev.spKind." + (["member", "student", "guest"].includes(p.kind) ? p.kind : "member")))}</span>`} <a class="mini ev-sp-open" href="${evPersonHref(p.id)}">${T("ev.spOpenPerson")}</a> <button class="btn ghost sm" data-act="ev-sp-pick" data-id="${esc(p.id)}"${dis}>${T("ev.spPick")}</button></li>`).join("")}</ul>`
          : `<p class="ev-line">${T("ev.spFindNone")}</p>`) : ""}
        ${Array.isArray(found) && o.canLink && String(o.spQ || "").trim() && !d.person_id ? `<p class="ev-line ev-sp-newp"><button type="button" class="btn ghost sm" data-act="ev-sp-newperson" data-id="${esc(e.id)}"${dis}>${esc(T("ev.spNewPerson", { name: String(o.spQ).trim() }))}</button> <span class="mini">${T("ev.spNewPersonHelp")}</span></p>` : ""}
      </div>`;
  const picked = (d.person_id ? `<p class="ev-line">${T("ev.spPicked", { name: esc(d.from || "") })} <a class="ev-sp-open" href="${evPersonHref(d.person_id)}">${T("ev.spOpenPerson")}</a> <button class="btn quiet sm" data-act="ev-sp-unpick"${dis}>${T("ev.spUnpick")}</button></p>` : "")
    + (d.person_id && /^https:\/\//.test(String(d.people_photo || "")) ? `<p class="ev-line ev-sp-from"><img class="ev-sp-pic sm" src="${esc(d.people_photo)}" alt=""> <span>${T("ev.spPhotoFrom")}</span></p>` : "");
  const add = foldHTML("ev-sp-new", T("ev.spNew"), `<div id="ev-sp-new-box" data-ev="${esc(e.id)}">${finder}${picked}${fields(evRowVals({ typed: d }, SP_KEYS), "ev-sp-new")}
      <div class="ev-ph-state">${showBox('id="ev-sp-new-show"', d.show == null ? !d.minor : !!d.show)}</div>
      <div class="mini">${T("ev.spAddHint")}</div>
      <div class="ev-acts"><button class="btn sm" data-act="ev-sp-add" data-id="${esc(e.id)}"${dis}>${T("ev.spAdd")}</button></div></div>`, !!o.spOpen);
  return sectionHTML(head, evPanel("", `${speakers.length ? `<ul class="ev-sp-list">${speakers.map(card).join("")}</ul>` : `<p class="ev-line">${T("ev.spNone")}</p>`}
      ${add}`), { hint: T("ev.spHint"), id: "ev-speakers" });
}
// 報名類型（免費的，沒有價錢）。放在「報名與現場」裡、報名表那一塊的下面。tickets 是 event_tickets_list() 回的（undefined、null、陣列，同上）。
// 這場活動「改」以上才畫（讀的門也是那一條）；沒有報名表的活動不畫（沒有表就沒有人報得了名）。
// x.tkDraft 是「加一種」填到一半的；x.tkOpen 那一格開著沒。已經有人報的那一種沒有「拿掉」的按鈕，改成一句話（資料庫也擋，ticket_in_use）。
const TK_KEYS = ["name_zh", "name_en", "capacity", "note_zh", "note_en"];
export function eventTicketsHTML(e, tickets, canEdit, busy, x) {
  if (!canEdit || tickets === undefined) return "";
  const o = x || {}, dis = busy ? " disabled" : "";
  if (!Array.isArray(tickets)) return evPanel(T("ev.tk"), `<div class="note">${T("ev.spNeedsSql")}</div>`, 'id="ev-tickets"');
  // 「放在對外頁」那一格。勾著、活動還沒上架的時候後面多一句「活動上架之後才看得到」。
  const showBox = (attrs, on) => `<label class="check ev-sp-show"><input type="checkbox" ${attrs}${on ? " checked" : ""}${dis}><span>${T("ev.spShow")}</span></label>${on && !live ? ` <span class="mini">${T("ev.spShowLater")}</span>` : ""}`;
  const fields = (v, idp) => `<div class="two">
          <label><i>${T("ev.tkNameZh")}</i><input data-f="name_zh"${idp ? ` id="${idp}-zh"` : ""} value="${esc(v.name_zh)}" maxlength="60" autocomplete="off"${dis}></label>
          <label><i>${T("ev.tkNameEn")}</i><input data-f="name_en" value="${esc(v.name_en)}" maxlength="60" autocomplete="off"${dis}></label>
          <label><i>${T("ev.tkNoteZh")}</i><input data-f="note_zh" value="${esc(v.note_zh)}" maxlength="200" autocomplete="off"${dis}></label>
          <label><i>${T("ev.tkNoteEn")}</i><input data-f="note_en" value="${esc(v.note_en)}" maxlength="200" autocomplete="off"${dis}></label>
          <label><i>${T("ev.tkCap")}</i><input data-f="capacity" type="number" min="0" step="1" inputmode="numeric" value="${esc(v.capacity || "0")}"${dis}></label>
        </div>`;
  const row = (t, i) => `<li class="ev-tk" data-tk-row data-id="${esc(t.id)}">
        <p class="ev-line"><b>${esc(evTicketName(t))}</b>・${esc(evTicketFacts(t))}${evTicketFull(t) ? ` <span class="tag warn">${T("ev.tkFull")}</span>` : ""}</p>
        ${fields(evRowVals(t, TK_KEYS))}
        ${Number(t.used) > 0 ? `<div class="mini">${T("ev.tkInUse", { n: Number(t.used) })}</div>` : ""}
        <div class="ev-acts"><button class="btn sm" data-act="ev-tk-save" data-id="${esc(t.id)}"${dis}>${T("ev.tkSave")}</button><span class="ev-mv">${evArrow("ev-tk-move", t.id, -1, T("ev.mvUp"), i === 0 || busy, "↑")}${evArrow("ev-tk-move", t.id, 1, T("ev.mvDown"), i === tickets.length - 1 || busy, "↓")}</span>${Number(t.used) > 0 ? "" : `<span class="sp"></span><button class="btn quiet danger sm" data-act="ev-tk-del" data-id="${esc(t.id)}"${dis}>${T("ev.tkDel")}</button>`}</div>
      </li>`;
  const add = foldHTML("ev-tk-new", T("ev.tkNew"), `<div id="ev-tk-new-box" data-ev="${esc(e.id)}">${fields(evRowVals({ typed: o.tkDraft || {} }, TK_KEYS), "ev-tk-new")}
      <div class="ev-acts"><button class="btn sm" data-act="ev-tk-add" data-id="${esc(e.id)}"${dis}>${T("ev.tkAdd")}</button></div></div>`, !!o.tkOpen);
  return evPanel(`${T("ev.tk")}${tickets.length ? ` <span class="hint">${tickets.length}</span>` : ""}`, `
      <div class="ev-help">${T("ev.tkNote")}</div>
      ${tickets.length ? `<ul class="ev-tk-list">${tickets.map(row).join("")}</ul><div class="ev-help">${T("ev.tkOld")}</div>` : `<p class="ev-line">${T("ev.tkNone")}</p>`}
      ${add}`, 'id="ev-tickets"');
}
// 報名表現在的樣子（狀態旁邊的標籤、底下那一句），拆出來是因為開放或截止時間一改，這兩樣要跟著換，
// 而那兩格是「改了就存、不重畫」的（重畫會把正在打的那一格的游標弄掉），main.js 存完只換這兩小塊。
export function evFormBits(e, form, signed) {
  const st = evFormState(form, signed, e.capacity);
  const tagCls = form.status === "open" ? " open" : form.status === "closed" ? " closed" : " draft";
  const warn = st === "soon" ? T("ev.fm.notYet") : st === "over" ? T("ev.fm.over") : st === "full" ? T("ev.fm.full") : "";
  const hint = st === "draft" ? T("ev.fm.draftHint") : st === "closed" ? T("ev.fm.closedHint") : e.status !== "published" ? T("ev.formLive") : st === "open" ? T("ev.fm.openHint") : "";
  return { tags: `<span class="tag${tagCls}">${esc(T("status." + form.status))}</span>${warn ? ` <span class="tag warn">${esc(warn)}</span>` : ""}`, hint };
}
// 報名與現場（2026-11-23 改成一塊一塊的，原本是一排連結）。
// 2026-11-13 起每一位幹部都看得到每一場活動（2026-12-19-access-fixes.sql），但報名名單、表單、簽到只給被加進這一場的人。
// 沒被加進來的不畫那幾顆按鈕（點進去會是空的），改一句話告訴他找誰。
// 開放與關閉報名用的是表單編輯頁同一條路（改 forms.status，門是資料庫的 form_can_edit），這裡只是多一顆按鈕，沒有新的權限。
// 開放與截止時間（2026-11-23，Paul：「where can I set registration open windows?」）：以前只在表單編輯頁的設定裡，這裡多放兩格。
//   存的是同一張表單的 opens_at、closes_at，走的是表單編輯頁同一支 saveForm()（門一樣是資料庫的 form_can_edit），沒有新的資料庫函式。
//   兩格是台灣時間（evTaipei／evFromTaipei），包在自己的「改了就存」框裡（data-autosave="ev-fwin"，data-id 是表單的 id）。
//   「改」以上的人看到的是兩格；只有「看」的人看到的是上面那一行字（evFormFacts），不畫按不動的格子。
// more：接在報名表那一塊下面的東西（報名類型，eventTicketsHTML 畫的）。沒有報名表的時候不放。
// 「誰能改這場活動」那顆 2026-11-23 搬到最下面的「其他設定」（eventMembersHTML），這裡只留跟報名有關的。
export function eventSignupHTML(e, form, signed, me, busy, more) {
  const dis = busy ? " disabled" : "";
  const canView = !!wsLevel(me, e.workspace_id), canEdit = canEditWs(me, e.workspace_id);
  if (!canView) return sectionHTML(T("ev.signup"), evPanel("", `<p class="ev-line">${T("ev.notOnEvent")}</p>`), { id: "ev-signup" });
  if (!form) {
    const add = canEdit && !e.form_id;
    return sectionHTML(T("ev.signup"), evPanel(T("ev.fm.title"), `
      <p class="ev-line">${T("ev.noFormLine")}</p>
      ${add ? `<div class="ev-help">${T("ev.addFormHint")}</div><div class="ev-acts"><button class="btn sm" data-act="ev-attach-form" data-id="${esc(e.id)}"${dis}>${T("ev.addForm")}</button></div>` : ""}`), { id: "ev-signup" });
  }
  const bits = evFormBits(e, form, signed);
  const toggle = !canEdit ? "" : form.status === "open"
    ? `<button class="btn ghost sm" data-act="ev-form-status" data-id="${esc(form.id)}" data-v="closed"${dis}>${T("ev.fm.close")}</button>`
    : `<button class="btn sm" data-act="ev-form-status" data-id="${esc(form.id)}" data-v="open"${dis}>${T("ev.fm.open")}</button>`;
  const win = !canEdit ? "" : `<div class="two ev-fwin" data-autosave="ev-fwin" data-id="${esc(form.id)}">
        <label><i>${T("ev.fm.opensAt")}</i><input id="ev-fopen" name="opens_at" type="datetime-local" value="${esc(evTaipei(form.opens_at))}"${dis}></label>
        <label><i>${T("ev.fm.closesAt")}</i><input id="ev-fclose" name="closes_at" type="datetime-local" value="${esc(evTaipei(form.closes_at))}"${dis}></label>
        <span class="ev-help">${T("ev.fm.windowHelp")} ${autosaveHint("ev-fwin", `data-id="${esc(form.id)}"`)}</span>
      </div>`;
  return sectionHTML(T("ev.signup"), evPanel(`${T("ev.fm.title")} <span id="ev-fm-tags">${bits.tags}</span>`, `
      <p class="ev-line">${evFormFacts(form, signed, e.capacity, canEdit).map(esc).join("・")}</p>
      <div class="ev-help" id="ev-fm-hint">${bits.hint}</div>
      ${win}
      <div class="ev-acts"><button class="btn ghost sm" data-act="open-form" data-id="${esc(form.id)}">${T("ev.formEdit")}</button>${toggle}<button class="btn ghost sm" data-act="open-apps" data-id="${esc(form.id)}">${T("ev.attendees")}</button></div>`, 'id="ev-form"')
    + (more || "")
    + evPanel(T("ev.day"), `
      <div class="ev-help">${T("ev.dayHint")}</div>
      <div class="ev-acts"><button class="btn ghost sm" data-act="open-notice" data-id="${esc(form.id)}">${T("ev.notice")}</button><button class="btn ghost sm" data-act="open-checkin" data-id="${esc(form.id)}">${T("ev.checkin")}</button></div>`), { id: "ev-signup" });
}
// 「其他設定」裡的「這場活動的成員」那一塊：一顆按鈕去成員頁（加人、拿掉人、改等級）。只有「管」的人有。
// 2026-11-23 以前這顆掛在「報名與現場」的最下面，跟報名沒有關係。按鈕本身一個字都沒改。
export function eventMembersHTML(e, me, busy) {
  if (wsLevel(me, e.workspace_id) !== "manage") return "";
  return evPanel(T("ev.membersSec"), `<p class="ev-line">${T("ev.membersHint")}</p>
      <div class="ev-acts"><button class="btn ghost sm" data-act="members-open" data-ws="${esc(e.workspace_id)}" data-name="${esc(evTitle(e))}"${busy ? " disabled" : ""}>${T("ev.members")}</button></div>`, 'id="ev-members"');
}
// 最上面那一行：這場活動現在是什麼狀態（草稿、準備好了、對外中、撤下了），一句話，對外中的話有一顆「看對外的那一頁」。
// 不是一整段，也沒有會改狀態的按鈕：那些按鈕在「設定」分頁最上面的「上線」那一段（內容、時間、報名都弄好了才輪到它），這裡有一顆帶你過去。
export function eventStateHTML(e) {
  const st = EV_STATUS.includes(e.status) ? e.status : "draft";
  const cls = st === "published" ? " open" : st === "ready" ? " warn" : st === "archived" ? "" : " draft";
  return `<div class="ev-state" id="ev-state"><span class="tag${cls}">${esc(T("ev.st." + st))}</span><span class="ev-state-t">${T("ev.top." + st)}</span><span class="sp"></span>${
    st === "published" ? `<a class="btn ghost sm" href="/events/?e=${esc(encodeURIComponent(e.slug))}" target="_blank" rel="noopener">${T("ev.seePublic")}</a>` : ""}<button type="button" class="btn quiet sm" data-act="ev-tab" data-tab="settings" data-go="ev-live">${T("ev.jumpLive")}</button></div>`;
}
// 一場活動。e 是 events 那一列加 form（報名表那一列，可能 null）與 signed（報名數）。
// canEdit：工作區「改」以上；canManage：「管」以上；senior：Co-President 或 Senior Adviser。
// rc：Records 那邊這一場的資料（rc_event 回的；undefined 是還在載，null 是看不到或還沒有）。
// x：這一頁後來加的東西都收在這一個物件裡，不再往後面排參數：
//    { photos（活動照片，見 eventPhotosHTML）, coverUp、photoUp（上傳進度）, coverLinkOpen（貼連結那一格開著沒）}。
//    2027-01-02 多了講者與報名類型：speakers、tickets（各自 undefined 還在載、null 遷移檔還沒跑、陣列），
//    spUp、spDraft、spOpen、canPick、spFound、spQ（見 eventSpeakersHTML），tkDraft、tkOpen（見 eventTicketsHTML）。
//    2026-11-23 多了 prevZh、prevEn：中文、英文說明底下那一格預覽開著沒。
//
//    2026-11-24 多了 tab（開著哪一個分頁）、spOpenIds（哪幾位講者那一行開著）。
//
// ── 這一頁怎麼排（2026-11-24 改成分頁；2026-11-23 那一版是一整頁十段照順序往下排）──
// 最上面：頁首、訊息、一行狀態（eventStateHTML）、唯讀的提醒。再來是一排分頁（RAIL.pageTabsHTML），底下是六個分頁的內容，一次只看得到一個。
// 哪一段在哪一個分頁、預設開哪一個、為什麼沒選到的只能藏不能不畫，都寫在這支函式下面 EV_TABS 那一段。
// 每一段還是一個 h2 加底下一塊或幾塊 .ev-panel，每一格的 id、name、data-act 都沒改，所以 main.js 讀字與存檔的路照舊。
// 分頁裡的順序有測試守著（test/event-editor.test.mjs）。
export function eventEditHTML(e, form, signed, me, msg, busy, venues, terms, evLinks, rc, projects, x) {
  const dis = busy ? " disabled" : "", o = x || {};
  const canEdit = canEditWs(me, e.workspace_id), canManage = wsLevel(me, e.workspace_id) === "manage", sen = senior(me);
  const ro = canEdit ? "" : " readonly";
  const st = e.status;
  const publicLink = `/events/?e=${encodeURIComponent(e.slug)}`;
  const statusLine = st === "published" ? T("ev.stLine.published", { who: esc(e.published_by_name || ""), d: esc(evDate(e.published_at)) })
    : st === "ready" ? T("ev.stLine.ready") : st === "archived" ? T(e.published_at ? "ev.stLine.archived" : "ev.stLine.recordsOnly") : T("ev.stLine.draft");
  const keyList = [
    st === "draft" && canManage ? `<button class="btn" data-act="ev-ready" data-id="${esc(e.id)}"${dis}>${T("ev.ready")}</button>` : "",
    // 撤下來的也有這一顆（2026-11-25 Paul：「how do i push that live agian? lke now I have no where to puch it live again」）。
    // 只給上過對外頁的（published_at 有值）；只在紀錄裡的舊活動也是 archived，但從來沒上過，不畫，資料庫也擋（2027-01-09-relist-events.sql）。
    st === "archived" && e.published_at && canManage ? `<button class="btn" data-act="ev-ready" data-id="${esc(e.id)}"${dis}>${T("ev.readyAgain")}</button>` : "",
    st === "ready" && canManage ? `<button class="btn ghost" data-act="ev-unready" data-id="${esc(e.id)}"${dis}>${T("ev.unready")}</button>` : "",
    st === "ready" && sen ? `<button class="btn" data-act="ev-publish" data-id="${esc(e.id)}"${dis}>${T("ev.publish")}</button>` : "",
    st === "ready" && !sen ? `<span class="mini">${T("ev.waitSenior")}</span>` : "",
    st === "published" && sen ? `<button class="btn ghost" data-act="ev-unpublish" data-id="${esc(e.id)}"${dis}>${T("ev.unpublish")}</button>` : "",
    st === "published" ? `<a class="btn ghost sm" href="${esc(publicLink)}" target="_blank" rel="noopener">${T("ev.seePublic")}</a>` : "",
  ].filter(Boolean);
  // 1. 內容。2026-11-06 起「改」以上的人改了就存（data-autosave="ev-save"）；唯讀的沒有框也沒有事件。
  const content = sectionHTML(T("ev.content"), evPanel("", `<div class="two">
        <label><i>${T("ev.titleZh")}</i><input id="ev-tzh" name="title_zh" value="${esc(e.title_zh || "")}"${ro}${dis}></label>
        <label><i>${T("ev.titleEn")}</i><input id="ev-ten" name="title_en" value="${esc(e.title_en || "")}"${ro}${dis}></label>
        <label><i>${T("ev.sumZh")}</i><input id="ev-szh" name="summary_zh" value="${esc(e.summary_zh || "")}" placeholder="${esc(T("ev.sumPh"))}"${ro}${dis}></label>
        <label><i>${T("ev.sumEn")}</i><input id="ev-sen" name="summary_en" value="${esc(e.summary_en || "")}"${ro}${dis}></label>
        ${eventDescHTML(e, "zh", canEdit, busy, !!o.prevZh)}
        ${eventDescHTML(e, "en", canEdit, busy, !!o.prevEn)}
      </div>${evSaveFoot(e, canEdit)}`, evSaveAttr(e, canEdit)), { id: "ev-content" });
  // 2. 時間與地點。場地那一塊是選了就存（main.js 聽 #ev-venue 的 change），不在「改了就存」的框裡。
  const when = sectionHTML(T("ev.when"), evPanel("", `<div class="two">
        <label><i>${T("ev.starts")}</i><input id="ev-starts" name="starts_at" type="datetime-local" value="${esc(evTaipei(e.starts_at))}"${ro}${dis}></label>
        <label><i>${T("ev.ends")}</i><input id="ev-ends" name="ends_at" type="datetime-local" value="${esc(evTaipei(e.ends_at))}"${ro}${dis}></label>
        <label><i>${T("ev.place")}</i><input id="ev-place" name="place" value="${esc(e.place || "")}"${ro}${dis}></label>
        <label><i>${T("ev.capacity")}</i><input id="ev-cap" name="capacity" type="number" min="0" value="${esc(String(e.capacity || 0))}"${ro}${dis}></label>
        ${eventMapHTML(e, (venues || []).find(v => v.id === e.venue_id), canEdit, busy)}
      </div>${evSaveFoot(e, canEdit)}`, evSaveAttr(e, canEdit)) + eventVenueHTML(e, venues, canEdit, busy), { id: "ev-when" });
  // 3. 對外的兩頁上怎麼列。遷移檔還沒跑的時候裡面只有一句話，不用框。
  const listing = sectionHTML(T("ev.pg"), evPanel("", eventProgrammeHTML(e, canEdit, busy) + (evHasProgramme(e) ? evSaveFoot(e, canEdit) : ""),
    evHasProgramme(e) ? evSaveAttr(e, canEdit) : ""), { id: "ev-listing", hint: T("ev.pgHint") });
  // 4. 照片：封面，再來是活動照片（只有「看」的人沒有活動照片那一塊）。
  const pics = sectionHTML(T("ev.picsSec"), eventCoverHTML(e, canEdit, busy, o) + eventPhotosHTML(e, o.photos, canEdit, busy, o), { id: "ev-pics" });
  // 7. 上線。準備好了、退回、放上、撤下都會改狀態與畫面結構，所以是按鈕，不是改了就存。
  const live = sectionHTML(T("ev.status"), evPanel("", `<p class="ev-line">${statusLine}</p>${keyList.length ? `<div class="ev-acts">${keyList.join("")}</div>` : ""}`), { id: "ev-live" });
  // 9. 活動之後。2026-11-13 Paul：「活動結束了點進來什麼都沒有」，所以結束了的活動這一段搬到最上面。
  const after = eventAfterHTML(e, canEdit, busy, rc);
  // 其他設定。三塊都可能不畫（專案的遷移檔還沒跑、不是「管」），那一段照樣在，因為種類與屆別一定有。
  const house = sectionHTML(T("ev.house"), eventProjectHTML(e, projects, me, busy) + eventMetaHTML(e, terms, canEdit, busy) + eventMembersHTML(e, me, busy), { id: "ev-house", hint: T("ev.houseHint") });
  // 回饋表（2026-11-24 從「活動之後」搬到「表單」分頁）。還在載或什麼都沒有的時候那一塊不畫，整段就不畫。
  const fb = eventFeedbackHTML(e, rc, canEdit, busy);
  const feedback = fb ? sectionHTML(T("ev.fbSec"), fb, { id: "ev-feedback" }) : "";
  // ── 分頁（2026-11-24）── 每一個分頁是一個 <div class="tabp">（shared/rail.js 的 pageTabsHTML 畫的），沒選到的加 hidden。**六個都在畫面裡**，理由在 evTabs 上面那段註解。
  const tab = evTabOf(e, o.tab, canEdit);
  const groups = {
    details: content + when,
    photos: pics,
    speakers: eventSpeakersHTML(e, o.speakers, canEdit, busy, o),
    forms: eventSignupHTML(e, form, signed, me, busy, eventTicketsHTML(e, o.tickets, canEdit, busy, o)) + feedback,
    results: after,
    settings: live + eventLinksHTML(e, evLinks, busy) + listing + house,
  };
  const counts = { photos: Array.isArray(o.photos) && canEdit ? o.photos.length : null, speakers: Array.isArray(o.speakers) ? o.speakers.length : null,
                   forms: rc === undefined ? null : (form ? 1 : 0) + ((rc && rc.forms) || []).length };
  const list = evTabs(canEdit);
  return pageHead(esc(evTitle(e)), `${esc(e.team.replace(/\s*Team$/i, ""))}・${esc(e.slug)}`, [], { act: "ev-back", label: T("ev.back") })
    + msgHTML(msg)
    + eventStateHTML(e)
    + (canEdit ? "" : `<div class="note">${T("ev.readOnly")}</div>`)
    + RAIL.pageTabsHTML("ev", list.map(k => ({ key: k, label: T("evtab." + k), body: groups[k], n: counts[k] })),
        { on: tab, act: "ev-tab", aria: T("evtab.aria"), keepEmpty: true });
}
// ── 活動編輯頁最上面那一排分頁（2026-11-24）──
// Paul：「right now it's one page and it has like all the information that I need to fill in. Whereas when we open up the sign up pages, which is great…
//        I can see the applicant settings and then jump into event… put everything that has the same categories on the top so I can just click them.
//        For example… form… there's going to be a sign-up form, there's going to be a feedback form… and other settings at the bottom, there should be a category for that as well.」
// 一開始是七個（他 2026-11-24 看過名單說「Yes, go ahead」）。同一天他用過之後：「go live, that whole category can just be in settings… that's not a separate category」，
// 所以「上線」那一個收進「設定」的最上面，剩六個：
//   details  內容     名稱、一句話、說明；開始、結束、地點、名額、場地
//   photos   照片     封面、活動照片
//   speakers 講者     只有這場活動「改」以上的人有（讀的門也是「改」，其他人那一段本來就是空的）
//   forms    表單     報名表（開關、開放與截止時間、題目、名單）、報名類型、行前信與簽到、回饋表
//   results  成果     出席與回饋的數字、記分卡
//   settings 設定     上線（準備好了、放上對外頁、撤下來）、行銷需求單與收支、對外的兩頁上怎麼列、屬於哪個專案、種類與屆別、誰能改這場活動
// 預設開哪一個：活動已經結束開「成果」（2026-11-13 Paul：「活動結束了點進來什麼都沒有」，以前是把那一段搬到最上面），其他開「內容」。
// 開著哪一個記在網址（#events/<代號>/<分頁>，main.js 的 ev-tab），重新整理還在同一個分頁。
//
// ⚠ **沒選到的分頁只是藏起來（hidden），不能改成「不畫」。** main.js 的 readEvent() 是照 id 把整頁那幾格讀一遍一起存的（名稱、時間、地點、名額、封面連結…），
//   哪一格不在畫面裡，讀到的就是空的，存下去會把那一欄清掉。test/event-editor.test.mjs 的「六個分頁都在畫面裡」守著這一條。
// 那一排按鈕與每一塊的外框是 shared/rail.js 的 pageTabsHTML 畫的（後台每一頁共用），這裡只決定有哪幾個、開哪一個。
export const EV_TABS = ["details", "photos", "speakers", "forms", "results", "settings"];
export const evTabs = canEdit => EV_TABS.filter(k => k !== "speakers" || canEdit);
// 舊網址 #events/<代號>/live（「上線」還是一個分頁的時候存的書籤）帶到「設定」。
export function evTabOf(e, want, canEdit) {
  const list = evTabs(canEdit), w = want === "live" ? "settings" : want;
  return list.includes(w) ? w : (evPast(e) ? "results" : "details");
}
// 行銷與錢（2026-11-10）：掛在這場的需求單、這場的收支加總（links.money 是 null 就是這個人看不到財務，那一行不畫）。
export function eventLinksHTML(e, links, busy) {
  const l = links || {}, reqs = l.requests || [];
  const rq = reqs.length ? `<ul class="flist">${reqs.map(r => { const st = rqStatus(r.status); return `<li><div class="fhead">${rqKindTag(r)}<b>${esc(r.title)}</b> <span class="tag${rqTagCls(st)}">${esc(T("rq.st." + st))}</span>${r.publish_on ? ` <span class="mini">${esc(T("rq.pubOn", { d: rqDate(r.publish_on) }))}</span>` : ""}</div></li>`; }).join("")}</ul>`
    : `<p class="ev-line">${T("ev.noReq")}</p>`;
  const m = l.money;
  const money = m ? `<p class="ev-line ev-money">${m.n ? esc(T("ev.money", { in: "NT$" + Number(m.income || 0).toLocaleString("en-US"), out: "NT$" + Number(m.expense || 0).toLocaleString("en-US"), n: m.n })) : esc(T("ev.moneyNone"))} <a href="/admin/finance/#tx">${T("ev.moneyGo")}</a></p>` : "";
  return sectionHTML(T("ev.links"), evPanel("", rq + `<div class="ev-acts"><button class="btn ghost sm" data-act="ev-ask-mkt" data-id="${esc(e.id)}"${busy ? " disabled" : ""}>${T("ev.askMkt")}</button></div>` + money), { id: "ev-links" });
}
// Records 的數字（2026-11-13）：rc 是 rc_event() 回的。報名幾人、到了幾人、回饋幾份、推薦與有用的平均、檢討了沒。
// 回饋表的清單 2026-11-23 搬到 eventFeedbackHTML（跟「建立回饋表」那顆按鈕放在同一塊）。
export function eventRecordsHTML(e, rc) {
  if (rc === undefined) return `<div class="mini ev-gap">${T("loading")}</div>`;
  if (!rc || !rc.event) return "";
  const n = (rc.event.numbers) || {}, num = v => (v == null || v === "" ? null : Number(v));
  const reg = num(n.registered) || 0, att = num(n.attended) || 0, resp = num(n.responses) || 0, rate = num(n.attendance_rate);
  const fmt = v => v == null ? "–" : Number(v).toFixed(1);
  const kpi = (big, label, hint, zero) => `<div class="kpi${zero ? " zero" : ""}"><div class="kpi-n">${big}</div><div class="kpi-l">${esc(label)}</div>${hint ? `<div class="kpi-h">${esc(hint)}</div>` : ""}</div>`;
  const cards = [
    kpi(esc(String(att)) + (reg ? `<span class="kpi-u">/ ${esc(String(reg))}</span>` : ""), T("ev.rc.came"), rate == null ? "" : T("ev.rc.rate", { p: Math.round(rate) }), !att),
    kpi(esc(String(resp)), T("ev.rc.responses"), num(n.response_rate) == null ? "" : T("ev.rc.rate", { p: Math.round(num(n.response_rate)) }), !resp),
    kpi(esc(fmt(num(n.recommend_avg))), T("ev.rc.recommend"), num(n.recommend_n) ? T("ev.rc.nAns", { n: num(n.recommend_n) }) : "", num(n.recommend_avg) == null),
    kpi(esc(fmt(num(n.useful_avg))), T("ev.rc.useful"), "", num(n.useful_avg) == null),
  ].join("");
  const rv = rc.review;
  const review = rv && rv.we_change ? `<div class="note">${T("ev.rc.reviewed")} ${esc(rv.we_change)}</div>` : `<div class="mini ev-gap">${T("ev.rc.notReviewed")}</div>`;
  return `<div class="todo ev-kpis">${cards}</div>${review}`;
}
// 回饋表那一塊（2026-11-23 Paul：「Can you just press create here, and once we press that, we can jump into that」）。
// 已經有的列出來（點了去 Records 那一張）；「建立回饋表」直接建一張掛在這場活動上的活動後回饋，建好就進那張表的編輯頁（main.js 的 ev-fb-create）。
// 叫的是 Records 那邊同一支 rc_save_form()，誰建得了由它決定（這場活動「改」以上，或紀錄工作區的人）；這裡只在「改」以上才畫按鈕。
// 導生學期的回饋表是另外兩種（mentee、mentor），只有紀錄工作區的人開得了，留在記分卡那邊開。
export function eventFeedbackHTML(e, rc, canEdit, busy) {
  // 還在載的時候整塊不畫：這時候還不知道這場有沒有回饋表，先畫出「建立回饋表」會讓人多建一張。
  if (rc === undefined) return "";
  const forms = (rc && rc.forms) || [];
  const list = !rc ? "" : forms.length
    ? `<ul class="plain">${forms.map(f => `<li><a href="/admin/records/#forms/${esc(f.id)}">${esc(f.title || "")}</a>${f.status ? ` <span class="tag${f.status === "open" ? " open" : f.status === "draft" ? " draft" : ""}">${esc(T("status." + f.status))}</span>` : ""}${f.responses != null ? ` <span class="mini">${esc(T("ev.rc.nResp", { n: f.responses }))}</span>` : ""}</li>`).join("")}</ul>`
    : `<p class="ev-line">${T("ev.rc.noForms")}</p>`;
  const make = e.kind === "mentorship-term" ? `<div class="ev-help">${T("ev.fb.termNote")}</div>`
    : canEdit ? `<div class="ev-help">${T("ev.fb.createHint")}</div><div class="ev-acts"><button class="btn${forms.length ? " ghost" : ""} sm" data-act="ev-fb-create" data-id="${esc(e.id)}"${busy ? " disabled" : ""}>${T("ev.fb.create")}</button></div>` : "";
  if (!list && !make) return "";
  return evPanel(T("ev.fbForms"), `${list}${make}`);
}
// 活動之後（2026-11-10，11-13 加 Records 的數字，11-23 分成一塊一塊）：這一場的出席與回饋、回饋表、連到 Records 的記分卡。
// 種類與屆別 2026-11-23 搬到最下面的「其他設定」（eventMetaHTML）：那是分類用的，不是活動辦完才做的事。
// 2026-11-24：回饋表那一塊搬到「表單」那個分頁（跟報名表放一起，Paul：「I can just click form, and then there's going to be a sign-up form,
// there's going to be a feedback form」），這一段只剩數字與記分卡，是「成果」那個分頁。
export function eventAfterHTML(e, canEdit, busy, rc) {
  return sectionHTML(T("ev.after"), eventRecordsHTML(e, rc)
    + evPanel(T("ev.scorecardSec"), `
      <p class="ev-line">${T("ev.scorecardWhat")}</p>
      ${e.form_id ? `<div class="ev-help">${T("ev.syncNote")}</div>` : ""}
      <div class="ev-acts"><a class="btn ghost sm" href="/admin/records/#overview/${esc(e.id)}">${T("ev.scorecard")}</a></div>`), { hint: T("ev.afterHint"), id: "ev-after" });
}
// 「其他設定」裡的「種類與屆別」那一塊（年度比較靠這兩個分組）。選了就存（main.js 聽 #ev-kind、#ev-term 的 change）。
export const EV_KINDS = ["bootcamp", "workshop", "roundtable", "meetup", "clinic", "info-session", "mentorship-term", "fair", "other"];
export function eventMetaHTML(e, terms, canEdit, busy) {
  const dis = (canEdit && !busy) ? "" : " disabled";
  const opt = (v, label, on) => `<option value="${esc(v)}"${on ? " selected" : ""}>${esc(label)}</option>`;
  const kinds = EV_KINDS.map(k => opt(k, T("evk." + k), (e.kind || "other") === k)).join("");
  const ts = opt("", T("ev.noTerm"), !e.term_id) + (terms || []).map(t => opt(t.id, t.id, e.term_id === t.id)).join("");
  return evPanel(T("ev.meta"), `
      <div class="two">
        <label><i>${T("ev.kind")}</i><select id="ev-kind" data-id="${esc(e.id)}"${dis}>${kinds}</select></label>
        <label><i>${T("ev.term")}</i><select id="ev-term" data-id="${esc(e.id)}"${dis}>${ts}</select></label>
        <span class="ev-help">${T("ev.kindHint")}</span></div>`, 'id="ev-meta"');
}

// ═══════════════════════════════════════════════════════════════════════
// 專案（2026-12-26，Paul 2026-11-14：「in one workspace, there can be multiple projects. And in one project, there can be multiple forms, registration, records」）
// ═══════════════════════════════════════════════════════════════════════
// 工作區是六個 team 加「整個 BT」；專案放在一個工作區裡，底下有好幾場活動、好幾份報名表。
// projects 是 projects_list() 回的：[{ id, team, title_zh, title_en, active, level, events: [活動 id], forms: [{ id, title, status, received, total }] }]。
// null 是遷移檔還沒跑（函式不存在）。純函式的部分 test/projects.test.mjs 有測。
// 括號跟著語言：中文全形（），英文半形加空白。
export const pjParen = s => (lang() === "zh" ? `（${s}）` : ` (${s})`);
export const pjTitle = p => (p ? (lang() === "zh" ? (p.title_zh || p.title_en) : (p.title_en || p.title_zh)) || String(p.id).replace(/^(project|custom):/, "") : "");
export const pjWsName = team => team ? String(team).replace(/\s*Team$/i, "") : T("pj.wholeBT");
export const pjHref = id => "#projects/" + encodeURIComponent(id);
export const pjOf = (projects, eventId) => (projects || []).find(p => (p.events || []).includes(eventId)) || null;
export const pjFormOf = (projects, formId) => (projects || []).find(p => (p.forms || []).some(f => f.id === formId)) || null;
export const pjCanEdit = p => !!p && ["edit", "manage"].includes(p.level);
// 一場活動可以放進哪些專案：同一個 team 或整個 BT、還開著、我改得動。現在那一個一定在裡面（就算收起來了），下拉才不會跳掉。
export function pjChoices(projects, ev, current) {
  return (projects || []).filter(p => (current && p.id === current.id) || (p.active !== false && pjCanEdit(p) && (!p.team || p.team === (ev && ev.team))));
}
// 清單分組：整個 BT 在最前面，接著六個 team 照固定順序，最後是不在固定名單上的 team。收起來的專案排在每一組最後。
export function pjGroups(projects) {
  const keys = ["", ...TEAM_LABELS];
  for (const p of projects || []) if (p.team && !keys.includes(p.team)) keys.push(p.team);
  return keys.map(k => [k, (projects || []).filter(p => (p.team || "") === k).sort((a, b) => (a.active === false) - (b.active === false))]).filter(g => g[1].length);
}
// 一個專案可以加進來的活動：同一個 team（整個 BT 的專案收任何 team 的）、網站上開的（不是紀錄倒進來的）、還沒在別的專案裡、我改得動。
export function pjAddable(events, projects, p, me) {
  const taken = new Set((projects || []).flatMap(x => x.events || []));
  return (events || []).filter(e => e.source !== "import" && !taken.has(e.id) && (!p.team || e.team === p.team) && canEditWs(me, e.workspace_id));
}

// 專案清單。canCreate 是開得了專案的工作區（"" 是整個 BT，只有 senior）。
export function projectsListHTML(projects, canCreate, draft, msg, busy, newOpen) {
  if (projects === null) return pageHead(T("pj.title"), T("pj.lede")) + emptyHTML(T("pj.notReady"), T("pj.notReadyHint"));
  const dis = busy ? " disabled" : "", d = draft || {};
  const create = (canCreate || []).length ? foldHTML("pj-new", T("pj.new"), `<div class="note">${T("pj.newWhat")}</div><div class="two">
      <label><i>${T("pj.ws")}</i><select id="pj-team"${dis}>${canCreate.map(t => `<option value="${esc(t)}"${(d.team || "") === t ? " selected" : ""}>${esc(pjWsName(t))}</option>`).join("")}</select></label>
      <label><i>${T("ev.slug")}</i><input id="pj-slug" value="${esc(d.slug || "")}" placeholder="winter-camp-2027" autocomplete="off"${dis}></label>
      <label><i>${T("ev.titleZh")}</i><input id="pj-tzh" value="${esc(d.title_zh || "")}" placeholder="2027 冬令營"${dis}></label>
      <label><i>${T("ev.titleEn")}</i><input id="pj-ten" value="${esc(d.title_en || "")}" placeholder="Winter Camp 2027"${dis}></label>
    </div>
    <div class="row"><button class="btn" data-act="pj-create"${dis}>${busy ? T("common.saving") : T("pj.createGo")}</button><span class="mini">${T("pj.createNote")}</span></div>`, newOpen || !!draft) : "";
  const row = p => `<li><div class="fhead"><b><a href="${esc(pjHref(p.id))}" data-act="pj-open" data-id="${esc(p.id)}">${esc(pjTitle(p))}</a></b>${p.active === false ? ` <span class="tag">${T("pj.archived")}</span>` : ""}</div>
      <div class="fmeta">${esc(T("pj.counts", { e: (p.events || []).length, f: (p.forms || []).length }))}</div></li>`;
  const groups = pjGroups(projects);
  return pageHead(T("pj.title"), T("pj.lede"))
    + msgHTML(msg)
    + create
    + (groups.length ? groups.map(([k, ps]) => sectionHTML(`${esc(pjWsName(k))}<span class="hint">${ps.length}</span>`, `<ul class="flist">${ps.map(row).join("")}</ul>`)).join("")
        : emptyHTML(T("pj.none"), (canCreate || []).length ? T("pj.noneHint") : T("pj.noneHintNo")));
}

// 一個專案：底下的活動、報名表、誰在這裡、設定。
// events 是 loadEvents() 的全部活動；evTeams 是我開得了活動的 team（「在這個專案開一場活動」用）。
export function projectHTML(p, projects, events, me, msg, busy, o) {
  const x = o || {}, dis = busy ? " disabled" : "", edit = pjCanEdit(p), manage = p.level === "manage";
  const byId = new Map((events || []).map(e => [e.id, e]));
  const evs = (p.events || []).map(id => byId.get(id)).filter(Boolean);
  const evRow = e => `<li><div class="fhead"><b><a href="#events/${esc(e.slug)}" data-act="ev-open" data-slug="${esc(e.slug)}">${esc(evTitle(e))}</a></b> <span class="tag${e.status === "published" ? " open" : e.status === "ready" ? " warn" : e.status === "archived" ? "" : " draft"}">${esc(T("ev.st." + e.status))}</span></div>
      <div class="fmeta">${esc(String(e.team || "").replace(/\s*Team$/i, ""))}${evWhenLabel(e) ? `・${esc(evWhenLabel(e))}` : ""}${e.form_id ? "" : `・${T("ev.noForm")}`}・<a href="/admin/records/#overview/${esc(e.id)}">${T("pj.scorecard")}</a>${edit && canEditWs(me, e.workspace_id) ? `・<button class="lnk" data-act="pj-ev-out" data-id="${esc(e.id)}"${dis}>${T("pj.evOut")}</button>` : ""}</div></li>`;
  const addable = edit ? pjAddable(events, projects, p, me) : [];
  const addOld = addable.length ? foldHTML("pj-ev-add", T("pj.evAdd"), `<div class="row"><select id="pj-ev-pick" aria-label="${esc(T("pj.evAdd"))}"${dis}>${addable.map(e => `<option value="${esc(e.id)}">${esc(evTitle(e))}${e.starts_at ? pjParen(esc(evDate(e.starts_at).slice(0, 10))) : ""}</option>`).join("")}</select>
      <button class="btn" data-act="pj-ev-add" data-id="${esc(p.id)}"${dis}>${T("pj.evAddGo")}</button></div>`, !!x.addOpen) : "";
  const teams = p.team ? (x.evTeams || []).filter(t => t === p.team) : (x.evTeams || []);
  const d = x.evDraft || {};
  const addNew = edit && teams.length ? foldHTML("pj-ev-new", T("pj.evNew"), `<div class="two">
      <label><i>${T("ev.team")}</i><select id="pj-ev-team"${dis}>${teams.map(t => `<option value="${esc(t)}"${d.team === t ? " selected" : ""}>${esc(t.replace(/\s*Team$/i, ""))}</option>`).join("")}</select></label>
      <label><i>${T("ev.slug")}</i><input id="pj-ev-slug" value="${esc(d.slug || "")}" placeholder="winter-camp-2027-day1" autocomplete="off"${dis}></label>
      <label><i>${T("ev.titleZh")}</i><input id="pj-ev-tzh" value="${esc(d.title_zh || "")}"${dis}></label>
      <label><i>${T("ev.titleEn")}</i><input id="pj-ev-ten" value="${esc(d.title_en || "")}"${dis}></label>
    </div>
    <label class="check"><input type="checkbox" id="pj-ev-withform"${d.with_form === false ? "" : " checked"}${dis}><span>${T("ev.withForm")}</span></label>
    <div class="row"><button class="btn" data-act="pj-ev-create" data-id="${esc(p.id)}"${dis}>${busy ? T("common.saving") : T("ev.createGo")}</button></div>`, !!x.newOpen) : "";
  const evSec = sectionHTML(`${esc(T("pj.events"))}<span class="hint">${evs.length}</span>`,
    (evs.length ? `<ul class="flist">${evs.map(evRow).join("")}</ul>` : `<div class="mini">${T("pj.noEvents")}</div>`) + addNew + addOld, { hint: T("pj.eventsHint") });
  const fRow = f => `<li><div class="fhead"><b><a href="#forms/${esc(f.id)}" data-act="open-apps" data-id="${esc(f.id)}">${esc(f.title || "")}</a></b> <span class="tag ${statusOf(f.status).tag}">${esc(T(statusOf(f.status).label))}</span></div>
      <div class="fmeta">${esc(T("pj.formCounts", { r: f.received || 0, n: f.total || 0 }))}${edit ? `・<a href="#" data-act="open-form" data-id="${esc(f.id)}">${T("pj.formEdit")}</a>` : ""}</div></li>`;
  const newForm = edit ? `<div class="row" style="margin-top:10px"><input id="pj-form-title" placeholder="${esc(T("pj.formPh"))}" aria-label="${esc(T("pj.formNew"))}" autocomplete="off"${dis}>
      <button class="btn ghost" data-act="pj-form-new" data-id="${esc(p.id)}"${dis}>${T("pj.formNew")}</button></div>` : "";
  const fSec = sectionHTML(`${esc(T("pj.forms"))}<span class="hint">${(p.forms || []).length}</span>`,
    ((p.forms || []).length ? `<ul class="flist">${p.forms.map(fRow).join("")}</ul>` : `<div class="mini">${T("pj.noForms")}</div>`) + newForm, { hint: T("pj.formsHint") });
  // 2026-11-25：Co-President 與 Senior Adviser 不畫這一顆，他們在「人與權限 → 工作區」管得到每一個專案的人（RAIL.showPeopleHere 同一條）。
  const people = manage && !senior(me) ? `<button class="btn ghost sm" data-act="members-open" data-ws="${esc(p.id)}" data-name="${esc(pjTitle(p))}">${T("pj.members")}</button>` : "";
  const settings = manage ? sectionHTML(T("pj.settings"), `<div class="two">
      <label><i>${T("ev.titleZh")}</i><input id="pj-e-tzh" value="${esc(p.title_zh || "")}"${dis}></label>
      <label><i>${T("ev.titleEn")}</i><input id="pj-e-ten" value="${esc(p.title_en || "")}"${dis}></label></div>
    <div class="row"><button class="btn" data-act="pj-save" data-id="${esc(p.id)}"${dis}>${T("pj.save")}</button>
      <button class="btn ghost" data-act="pj-archive" data-id="${esc(p.id)}" data-on="${p.active === false ? "1" : "0"}"${dis}>${p.active === false ? T("pj.unarchive") : T("pj.archive")}</button>${people}</div>
    <div class="mini">${T("pj.archiveNote")}</div>`) : "";
  const lede = `${esc(T("pj.inWs", { ws: pjWsName(p.team) }))}${p.active === false ? `・${T("pj.archived")}` : ""}${edit ? "" : `・${T("pj.readOnly")}`}`;
  return pageHead(esc(pjTitle(p)), lede, [], { act: "pj-back", label: T("pj.back") })
    + msgHTML(msg) + evSec + fSec + settings;
}

// 活動頁上的「專案」那一塊：在哪個專案、換一個或拿出來（那場活動與那個專案都要「改」以上）。
// 2026-11-23：從頁面第二段搬到最下面的「其他設定」（Paul：「why is it the second thing we see in the events page?」），樣子跟其他塊一樣。
export function eventProjectHTML(e, projects, me, busy) {
  if (projects === null || projects === undefined) return "";
  const cur = pjOf(projects, e.id);
  const can = canEditWs(me, e.workspace_id) && e.source !== "import";
  const choices = can ? pjChoices(projects, e, cur) : [];
  const now = cur ? `<a href="${esc(pjHref(cur.id))}" data-act="pj-open" data-id="${esc(cur.id)}">${esc(pjTitle(cur))}</a>${pjParen(esc(pjWsName(cur.team)))}` : T("pj.noProject");
  const pick = can && (choices.length || cur) ? `<label><i>${T("pj.move")}</i><select id="ev-project" data-id="${esc(e.id)}"${busy ? " disabled" : ""}>
      <option value="">${T("pj.noProjectOpt")}</option>${choices.map(p => `<option value="${esc(p.id)}"${cur && cur.id === p.id ? " selected" : ""}>${esc(pjTitle(p))}${pjParen(esc(pjWsName(p.team)))}</option>`).join("")}</select></label>` : "";
  return evPanel(T("pj.ofEvent"), `<p class="ev-line">${now}</p>${pick}<div class="ev-help">${T("pj.ofEventHint")}</div>`, 'id="ev-pj-box"');
}

// ═══════════════════════════════════════════════════════════════════════
// 會議紀錄（2026-11-02，docs/2026-10-24-會議與排程.md）
// ═══════════════════════════════════════════════════════════════════════
// 清單（之後的、過去的）加一場會議（出席與回覆、Drive 連結、議程）。排會本身在 /availability/ 的看板上；「記一場會議」是補紀錄或手動排，入口在首頁（2026-11-26 搬的）。
// 時間印瀏覽器的時區（後台的人自己的），旁邊不另印台北，避免兩個時間看混。
export const mtWhen = d => { if (!d) return ""; const x = new Date(d); if (isNaN(x)) return ""; const p = n => String(n).padStart(2, "0"); return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())} ${p(x.getHours())}:${p(x.getMinutes())}`; };
const mtLocal = d => { if (!d) return ""; const x = new Date(d); if (isNaN(x)) return ""; const p = n => String(n).padStart(2, "0"); return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}T${p(x.getHours())}:${p(x.getMinutes())}`; };
export const mtScope = s => s === "board" ? T("mt.board") : String(s || "").replace(/\s*Team$/i, "");
// 我能排哪些範圍：senior 全部；其他人是自己在那個 team 是「改」以上的 team（2026-12-25 起，跟 can_schedule 同一條）。
export function mtScopes(me, teams) {
  if (senior(me)) return ["board"].concat(teams && teams.length ? teams : TEAM_LABELS);
  return Object.entries((me && me.ws) || {}).filter(([id, lv]) => id.startsWith("res:") && ["edit", "manage"].includes(lv)).map(([id]) => id.slice(4));
}
// meetings：[{ id, scope, title, starts_at, ends_at, agenda, doc_url, attendees: [{ user_id, status }] }]
// 會議清單的搜尋：標題、議程、範圍、日期都算（2026-11-11）。純函式，test/meetings.test.mjs 有測。
export function meetingMatches(m, q) {
  const n = s => String(s || "").toLowerCase().replace(/\s+/g, "");
  const qq = n(q); if (!qq) return true;
  return [m.title, m.agenda, mtScope(m.scope), mtWhen(m.starts_at)].some(x => n(x).includes(qq));
}
// q：搜尋字（不重畫，main.js 只藏起對不上的列）。
// 2026-11-26 Paul：「記一場會議」從這一頁搬走了（有人在這裡找不到），入口在首頁那一顆鈕，表單是下面的 meetingNewHTML()（#meetings/new）。
// 2026-11-27 Paul：「log meeting is now at home, but I want it to be in meeting as well」。這一頁標題旁也一顆，連到同一頁 #meetings/new；排不了會的人沒有。
export function meetingsListHTML(meetings, me, scopes, draft, people, msg, busy, q) {
  const now = new Date();
  const up = (meetings || []).filter(m => new Date(m.ends_at) >= now).sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
  const past = (meetings || []).filter(m => new Date(m.ends_at) < now).sort((a, b) => new Date(b.starts_at) - new Date(a.starts_at));
  const row = m => { const at = m.attendees || [], yes = at.filter(a => a.status === "accepted").length;
    return `<li data-mt-row data-id="${esc(m.id)}"${meetingMatches(m, q) ? "" : " hidden"}><div class="fhead"><b><a href="#meetings/${esc(m.id)}" data-act="mt-open" data-id="${esc(m.id)}">${esc(m.title)}</a></b> <span class="tag${m.required ? " open" : ""}">${T(m.required ? "mt.req1" : "mt.req0")}</span> <span class="mini">${esc(mtScope(m.scope))}</span></div>
      <div class="fmeta">${esc(mtWhen(m.starts_at))}・${esc(T("mt.people", { n: at.length, yes }))}${m.doc_url ? `・<a href="${esc(m.doc_url)}" target="_blank" rel="noopener">${T("mt.doc")}</a>` : ""}${me && at.some(a => a.user_id === me.id) ? `・<span class="tag${at.find(a => a.user_id === me.id).status === "accepted" ? " open" : ""}">${esc(T("mt.st." + at.find(a => a.user_id === me.id).status))}</span>` : ""}</div></li>`; };
  const all = (meetings || []).length;
  return pageHead(T("mt.title"), T("mt.lede"), (scopes || []).length ? [{ href: "#meetings/new", label: T("mt.new"), primary: true }] : [])
    + msgHTML(msg)
    + (all > 3 ? `<label class="vn-find"><i>${T("mt.find")}</i><input type="search" id="mtl-q" value="${esc(q || "")}" placeholder="${esc(T("mt.findPh"))}" autocomplete="off"></label>` : "")
    + sectionHTML(`${T("mt.upcoming")}<span class="hint">${up.length}</span>`, up.length ? `<ul class="flist">${up.map(row).join("")}</ul>` : emptyHTML(T("mt.noneUp"), T("mt.noneUpHint")))
    + (past.length ? sectionHTML(`${T("mt.past")}<span class="hint">${past.length}</span>`, `<ul class="flist">${past.map(row).join("")}</ul>`) : "");
}
// 記一場會議自己一頁（#meetings/new，2026-11-26）：首頁那一顆「記一場會議」連到這裡。表單、存法、誰記得了都跟以前收在會議清單最上面那一格一樣。
// scopes 是空的（排不了任何一種會）就印一句找誰，不畫表單。
export function meetingNewHTML(scopes, draft, people, msg, busy, templates) {
  const head = pageHead(T("mt.new"), T("mt.newLede"), [], { act: "mt-back", label: T("mt.back") }) + msgHTML(msg);
  if (!scopes.length) return head + emptyHTML(T("mt.newNo"), T("mt.newNoHint"));
  const tplId = draft && "tpl" in draft ? draft.tpl : mtDefaultTpl(templates, (draft && draft.scope) || scopes[0]);
  return head + sectionHTML("", meetingFormHTML(null, draft, scopes, people, busy, true,
    templates ? `<h3 class="sec-h">${T("mtm.title")}</h3>` + minutesEditorHTML("mtn", templates, tplId,
      draft && draft.minutes ? draft.minutes : mtMinutesFrom(mtTplById(templates, tplId), []), busy) : ""));
}
// 記一場會議 / 改一場：m 是現有那一場（null 是新的），d 是填到一半的值（含 pk 勾人的狀態）。
// bare：只回表單本身（清單頁把它包進收起來的那一格，不要再一個標題）。
export function meetingFormHTML(m, d, scopes, people, busy, bare, mins) {
  const v = Object.assign({ scope: scopes[0] || "board", title: "", starts_at: "", ends_at: "", agenda: "", doc_url: "" }, m || {}, d || {});
  // 必到：既有的一場照資料庫（沒有這一欄的舊資料庫當選擇參加）；新的一場預設必到。
  v.required = d && d.required != null ? d.required : m ? !!m.required : true;
  const dis = busy ? " disabled" : "";
  const pk = (d && d.pk) || { ticked: (m ? (m.attendees || []).map(a => a.user_id) : []), q: "", mq: "", teams: [], level: "view" };
  // 2026-11-06 自動儲存：既有那一場（m 有 id）的六格包在 data-autosave="mt-save" 裡改了就存；勾人那一塊在容器外面，
  // 勾了會先重畫（pk 的狀態在 S.mtDraft），main.js 重畫之後再補存一次。新開一場還沒有 id，留「記下來」那顆鈕。
  const body = `<div class="two"${m ? ` data-autosave="mt-save" data-id="${esc(m.id)}"` : ""}>
      <label><i>${T("mt.scope")}</i><select id="mt-scope" name="scope"${dis}>${scopes.map(s => `<option value="${esc(s)}"${v.scope === s ? " selected" : ""}>${esc(mtScope(s))}</option>`).join("")}</select></label>
      <label><i>${T("mt.required")}</i><select id="mt-required" name="required"${dis}><option value="1"${v.required !== false && v.required !== "0" ? " selected" : ""}>${T("mt.req1")}</option><option value="0"${v.required === false || v.required === "0" ? " selected" : ""}>${T("mt.req0")}</option></select></label>
      <label><i>${T("mt.titleF")}</i><input id="mt-title" name="title" value="${esc(v.title)}" placeholder="BT 會議"${dis}></label>
      <label><i>${T("mt.starts")}</i><input id="mt-starts" name="starts_at" type="datetime-local" value="${esc(mtLocal(v.starts_at))}"${dis}></label>
      <label><i>${T("mt.ends")}</i><input id="mt-ends" name="ends_at" type="datetime-local" value="${esc(mtLocal(v.ends_at))}"${dis}></label>
      <label class="wide"><i>${T("mt.agenda")}</i><input id="mt-agenda" name="agenda" value="${esc(v.agenda || "")}"${dis}></label>
      <label class="wide"><i>${T("mt.docF")}</i><input id="mt-doc" name="doc_url" value="${esc(v.doc_url || "")}" placeholder="https://docs.google.com/…"${dis}></label>
    </div>
    ${mins || ""}
    <h3 class="sec-h">${T("mt.attendees")}</h3>
    ${membersAreaHTML("mt", { people: people || [], pk, busy, draft: true, all: true, titleLeft: n => T("mt.ticked", { n }) })}
    <div class="form-foot">${m ? autosaveHint("mt-save", `data-id="${esc(m.id)}"`) : `<button class="btn" data-act="mt-save" data-id=""${dis}>${busy ? T("common.saving") : T("mt.createGo")}</button>`}
      ${m ? `<button class="btn ghost" data-act="mt-delete" data-id="${esc(m.id)}"${dis}>${T("mt.delete")}</button>` : ""}
      <span class="mini">${m ? T("mt.editNote") : T("mt.newNote")}</span></div>`;
  return bare ? `<div id="mt-form">${body}</div>` : sectionHTML(m ? T("mt.edit") : T("mt.new"), body, { id: "mt-form" });
}
// Google 日曆那一列（2026-11-23）：在不在 Google 日曆上、Meet 連結、上次拉回覆的時間、送不上的原因與「再送一次」。
// 欄位不在（遷移檔還沒跑）就整列不畫。
export function gcalRowHTML(m, canEdit, busy) {
  if (!m || !("gcal_event_id" in m)) return "";
  const dis = busy ? " disabled" : "";
  const retry = canEdit && m.gcal_event_id ? ` <button class="btn ghost sm" data-act="mt-gcal" data-id="${esc(m.id)}"${dis}>${T(m.gcal_error ? "mt.gcalRetry" : "mt.gcalSync")}</button>` : "";
  let v;
  if (m.gcal_event_id && !m.gcal_error) {
    v = `<span class="tag open">${T("mt.gcalOn")}</span>${m.meet_url ? ` <a href="${esc(m.meet_url)}" target="_blank" rel="noopener">${T("mt.gcalMeet")}</a>` : ""}`
      + `<div class="mini">${m.gcal_pulled_at ? T("mt.gcalPulled", { t: esc(mtWhen(m.gcal_pulled_at)) }) : T("mt.gcalNotPulled")}</div>`;
  } else if (m.gcal_event_id) {
    v = `<span class="tag warn">${T("mt.gcalFailed")}</span><div class="mini gcal-err">${esc(m.gcal_error)}</div>`;
  } else if (m.gcal_error) {
    v = `<span class="tag warn">${T("mt.gcalNever")}</span><div class="mini gcal-err">${esc(m.gcal_error)}</div><div class="mini">${T("mt.gcalNeverHint")}</div>`;
  } else {
    v = `<span class="tag">${T("mt.gcalOff")}</span><div class="mini">${T("mt.gcalOffHint")}</div>`;
  }
  return `<dt>${T("mt.gcal")}</dt><dd>${v}${retry}</dd>`;
}
// 一場會議：出席與回覆、連結、議程；能排的人底下可以改。
export function meetingHTML(m, me, people, canEdit, scopes, draft, msg, busy, templates) {
  const who = id => { const p = (people || []).find(x => x.id === id); return p ? mpName(p) : T("rq.someone"); };
  const at = m.attendees || [];
  const grp = st => at.filter(a => a.status === st);
  const noteOf = id => { const n = (m.notes || []).find(x => x.user_id === id); return n ? n.note : ""; };
  const li = a => `<li>${nameBlock((people || []).find(x => x.id === a.user_id) || { name_en: who(a.user_id) })}${a.user_id === (me && me.id) ? ` <span class="tag">${T("mp.you")}</span>` : ""}${noteOf(a.user_id) ? `<div class="mini">「${esc(noteOf(a.user_id))}」</div>` : ""}</li>`;
  return pageHead(esc(m.title), `${T(m.required ? "mt.req1" : "mt.req0")}・${esc(mtScope(m.scope))}・${esc(mtWhen(m.starts_at))}–${esc(mtWhen(m.ends_at).slice(11))}`, [], { act: "mt-back", label: T("mt.back") })
    + msgHTML(msg)
    + sectionHTML(T("mt.details"), `<dl class="rq-dl">
        <dt>${T("mt.agenda")}</dt><dd>${m.agenda ? esc(m.agenda) : T("value.none")}</dd>
        <dt>${T("mt.doc")}</dt><dd>${m.doc_url ? `<a href="${esc(m.doc_url)}" target="_blank" rel="noopener">${esc(m.doc_url)}</a>` : T("mt.noDoc")}</dd>
        <dt>${T("mt.when")}</dt><dd>${esc(mtWhen(m.starts_at))}–${esc(mtWhen(m.ends_at).slice(11))} <span class="mini">${T("mt.tzNote")}</span></dd>
        ${gcalRowHTML(m, canEdit, busy)}
      </dl>`)
    + minutesSectionHTML(m, me, canEdit, templates, draft, busy)
    + sectionHTML(`${T("mt.attendees")}<span class="hint">${at.length}</span>`, at.length ? `<div class="mt-rsvp">
        <div><i>${T("mt.st.accepted")}（${grp("accepted").length}）</i><ul class="plain">${grp("accepted").map(li).join("") || `<li class="mini">${T("value.none")}</li>`}</ul></div>
        <div><i>${T("mt.st.invited")}（${grp("invited").length}）</i><ul class="plain">${grp("invited").map(li).join("") || `<li class="mini">${T("value.none")}</li>`}</ul></div>
        <div><i>${T("mt.st.declined")}（${grp("declined").length}）</i><ul class="plain">${grp("declined").map(li).join("") || `<li class="mini">${T("value.none")}</li>`}</ul></div>
      </div>` : `<div class="mini">${T("mt.nobody")}</div>`)
    + (canEdit ? meetingFormHTML(m, draft, scopes, people, busy) : "");
}

// ═══════════════════════════════════════════════════════════════════════
// 會議範本與會議紀錄（2026-11-13，supabase/migrations/2026-12-18-meeting-templates.sql）
// ═══════════════════════════════════════════════════════════════════════
// Paul 2026-11-13：「不同的會開法不一樣，我要能編一份範本，記會議的時候選那份範本然後直接打」。
// 範本是幾段小標題（h）加一句提示（hint）；選了範本，每一段變成一個打字的大框，紀錄存成 [{ h, text }]。
// templates 是 loadMeetingTemplates() 回的；null 是資料表還沒建（遷移檔還沒跑），整塊不畫。
export const mtTplById = (templates, id) => (templates || []).find(t => t.id === id) || null;
// 下拉選單的順序：沒封存的、這種會專用的排前面（board 的會先列 board 的範本），其他照標題。
export function mtTplOptions(templates, scope, keepId) {
  const live = (templates || []).filter(t => !t.archived || t.id === keepId);
  const rank = t => t.scope && t.scope === scope ? 0 : !t.scope ? 1 : 2;
  return live.slice().sort((a, b) => rank(a) - rank(b) || String(a.title).localeCompare(String(b.title)));
}
// 新開一場預設選哪一份：這種會專用的那一份（只有一份的時候）；沒有就不選。
export function mtDefaultTpl(templates, scope) {
  const own = (templates || []).filter(t => !t.archived && t.scope && t.scope === scope);
  return own.length === 1 ? own[0].id : null;
}
// 換範本：照新範本的段落排，已經打過字的段落（小標題一樣）把字帶過去；新範本沒有、但已經有字的段落接在最後面，打過的字不會不見。
export function mtMinutesFrom(tpl, current) {
  const cur = (current || []).map(x => ({ h: String((x && x.h) || ""), text: String((x && x.text) || "") }));
  const key = h => String(h || "").trim().toLowerCase();
  const used = new Set();
  const out = ((tpl && tpl.sections) || []).map(sec => {
    const i = cur.findIndex((c, j) => !used.has(j) && key(c.h) === key(sec.h));
    if (i >= 0) used.add(i);
    return { h: String(sec.h || ""), hint: String(sec.hint || ""), text: i >= 0 ? cur[i].text : "" };
  });
  cur.forEach((c, j) => { if (!used.has(j) && (c.text.trim() || (!tpl && c.h.trim()))) out.push({ h: c.h, hint: "", text: c.text }); });
  if (!out.length) out.push({ h: "", hint: "", text: "" });
  return out;
}
// 一段一段的打字框。idp：mtm（一場會的頁面）或 mtn（記一場新的）。hint 從範本來（紀錄本身不存 hint）。
export function minutesEditorHTML(idp, templates, tplId, minutes, busy, scope) {
  const dis = busy ? " disabled" : "";
  const tpl = mtTplById(templates, tplId);
  const hintOf = (h, i) => { const sec = tpl && (tpl.sections || []).find(x => String(x.h || "").trim().toLowerCase() === String(h || "").trim().toLowerCase()); return sec ? sec.hint || "" : (minutes[i] && minutes[i].hint) || ""; };
  const opts = mtTplOptions(templates, scope, tplId);
  return `<div class="mtm" id="${idp}-min">
      <label class="mtm-pick"><i>${T("mtm.tpl")}</i><select id="${idp}-tpl" data-noauto="1"${dis}>
        <option value="">${T("mtm.tplNone")}</option>
        ${opts.map(t => `<option value="${esc(t.id)}"${t.id === tplId ? " selected" : ""}>${esc(t.title)}${t.archived ? `（${T("mtpl.archivedTag")}）` : ""}</option>`).join("")}
      </select></label>
      ${(minutes || []).map((x, i) => `<div class="mtm-sec" data-mtm-sec>
        <div class="mtm-top"><input class="mtm-h" name="h${i}" value="${esc(x.h || "")}" placeholder="${esc(T("mtm.hPh"))}" aria-label="${esc(T("mtm.hPh"))}"${dis}>
          <button class="btn quiet sm" data-act="mtm-del" data-p="${idp}" data-i="${i}" aria-label="${esc(T("mtm.del"))}"${dis}>${T("mtm.del")}</button></div>
        <textarea class="mtm-t" name="t${i}" rows="5" placeholder="${esc(hintOf(x.h, i) || T("mtm.tPh"))}"${dis}>${esc(x.text || "")}</textarea>
      </div>`).join("")}
      <button class="btn ghost sm" data-act="mtm-add" data-p="${idp}"${dis}>${T("mtm.add")}</button>
    </div>`;
}
// 誰寫得了這一場的紀錄：排得了這種會的人、出席名單上的人、建這場會的人（跟資料庫 save_meeting_minutes 同一條）。
export const mtCanWrite = (m, me, canEdit) => !!m && !!me && (!!canEdit || m.created_by === me.id || (m.attendees || []).some(a => a.user_id === me.id));
// 一場會的「會議紀錄」那一塊：寫得了就是打字框（data-autosave="mt-min"，改了就存），寫不了就照段落印出來。
export function minutesSectionHTML(m, me, canEdit, templates, draft, busy) {
  if (!("minutes" in m)) return "";
  const has = (m.minutes || []).some(x => String(x.text || "").trim());
  if (!mtCanWrite(m, me, canEdit) || templates == null) {
    const body = has ? `<div class="mtm-read">${(m.minutes || []).filter(x => String(x.text || "").trim()).map(x => `${x.h ? `<h4>${esc(x.h)}</h4>` : ""}<p>${esc(x.text).replace(/\n/g, "<br>")}</p>`).join("")}</div>`
      : `<div class="mini">${T("mtm.none")}</div>`;
    return sectionHTML(T("mtm.title"), body);
  }
  const tplId = draft && "tpl" in draft ? draft.tpl : (m.template_id || (has ? null : mtDefaultTpl(templates, m.scope)));
  const mins = draft && draft.minutes ? draft.minutes : (has || (m.minutes || []).length ? mtMinutesFrom(null, m.minutes) : mtMinutesFrom(mtTplById(templates, tplId), []));
  return sectionHTML(T("mtm.title"), `<div data-autosave="mt-min" data-id="${esc(m.id)}">${minutesEditorHTML("mtm", templates, tplId, mins, busy, m.scope)}
      <div class="form-foot">${autosaveHint("mt-min", `data-id="${esc(m.id)}"`)}<span class="mini">${T("mtm.note")}</span></div></div>`);
}

// 範本頁（#mtemplates）：清單加一份一份改。ed 是正在改的那一份（{ id, title, scope, sections }，id 空的是新的）。
export function mtplPageHTML(templates, scopes, ed, msg, busy, canEdit) {
  const dis = busy ? " disabled" : "";
  if (templates == null) return pageHead(T("mtpl.title"), T("mtpl.lede")) + emptyHTML(T("mtpl.notReady"), T("mtpl.notReadyHint"));
  const live = templates.filter(t => !t.archived), gone = templates.filter(t => t.archived);
  const scopeName = s => s ? mtScope(s) : T("mtpl.anyScope");
  const editor = x => `<div class="mtpl-ed" id="mtpl-ed" data-id="${esc(x.id || "")}">
      <div class="two">
        <label><i>${T("mtpl.name")}</i><input id="mtpl-title" value="${esc(x.title || "")}" maxlength="120" placeholder="${esc(T("mtpl.namePh"))}"${dis}></label>
        <label><i>${T("mtpl.scope")}</i><select id="mtpl-scope"${dis}><option value="">${T("mtpl.anyScope")}</option>${scopes.map(s => `<option value="${esc(s)}"${x.scope === s ? " selected" : ""}>${esc(mtScope(s))}</option>`).join("")}</select></label>
      </div>
      <h3 class="sec-h">${T("mtpl.sections")}</h3>
      <ol class="mtpl-secs">${(x.sections || []).map((sec, i, all) => `<li data-mtpl-sec>
        <input class="mtpl-h" value="${esc(sec.h || "")}" maxlength="120" placeholder="${esc(T("mtpl.hPh"))}" aria-label="${esc(T("mtpl.hPh"))}"${dis}>
        <input class="mtpl-hint" value="${esc(sec.hint || "")}" maxlength="200" placeholder="${esc(T("mtpl.hintPh"))}" aria-label="${esc(T("mtpl.hintPh"))}"${dis}>
        <span class="mtpl-move"><button class="btn quiet sm" data-act="mtpl-up" data-i="${i}" aria-label="${esc(T("mtpl.up"))}"${i === 0 ? " disabled" : dis}>↑</button><button class="btn quiet sm" data-act="mtpl-down" data-i="${i}" aria-label="${esc(T("mtpl.down"))}"${i === all.length - 1 ? " disabled" : dis}>↓</button><button class="btn quiet sm" data-act="mtpl-del" data-i="${i}"${dis}>${T("mtm.del")}</button></span>
      </li>`).join("")}</ol>
      <button class="btn ghost sm" data-act="mtpl-add"${dis}>${T("mtm.add")}</button>
      <div class="form-foot"><button class="btn" data-act="mtpl-save"${dis}>${busy ? T("common.saving") : T(x.id ? "common.save" : "mtpl.create")}</button>
        <button class="btn ghost" data-act="mtpl-cancel"${dis}>${T("mtpl.cancel")}</button></div>
    </div>`;
  const row = t => ed && ed.id === t.id ? `<li>${editor(ed)}</li>` : `<li><div class="fhead"><b>${esc(t.title)}</b> <span class="mini">${esc(scopeName(t.scope))}</span>
      ${canEdit ? `<button class="btn quiet sm" data-act="mtpl-edit" data-id="${esc(t.id)}"${dis}>${T("mtpl.edit")}</button><button class="btn quiet sm" data-act="mtpl-archive" data-id="${esc(t.id)}"${dis}>${T("mtpl.archive")}</button>` : ""}</div>
      <div class="fmeta">${(t.sections || []).map(x => esc(x.h)).join("・")}</div></li>`;
  return pageHead(T("mtpl.title"), T("mtpl.lede"))
    + msgHTML(msg)
    + (canEdit ? (ed && !ed.id ? sectionHTML(T("mtpl.new"), editor(ed)) : `<div class="row" style="margin-bottom:24px"><button class="btn" data-act="mtpl-new"${dis}>${T("mtpl.new")}</button></div>`) : `<div class="mini">${T("mtpl.readOnly")}</div>`)
    + sectionHTML(`${T("mtpl.live")}<span class="hint">${live.length}</span>`, live.length ? `<ul class="flist">${live.map(row).join("")}</ul>` : emptyHTML(T("mtpl.none"), T("mtpl.noneHint")))
    + (gone.length ? sectionHTML(`${T("mtpl.gone")}<span class="hint">${gone.length}</span>`, `<ul class="flist">${gone.map(t => `<li><div class="fhead"><b>${esc(t.title)}</b> <span class="mini">${esc(scopeName(t.scope))}</span>${canEdit ? ` <button class="btn quiet sm" data-act="mtpl-restore" data-id="${esc(t.id)}"${dis}>${T("mtpl.restore")}</button>` : ""}</div></li>`).join("")}</ul>`) : "");
}

// ═══════════════════════════════════════════════════════════════════════
// 場地（2026-11-10，supabase/migrations/2026-12-14-venues.sql）
// ═══════════════════════════════════════════════════════════════════════
// 每一位幹部看得到（辦活動要找場地），新增與改只有 Co-President 與紀錄工作區的人（canEdit 從 venues_list 回的 can_edit，門在資料庫）。
export const VENUE_KINDS = ["school", "university", "coworking", "cafe", "company", "government", "hotel", "online", "other"];
const vnDate = d => d ? String(d).slice(0, 10) : "";
// 加場地、加聯絡人的表單收成一行（2026-11-10 Paul：一直開著很干擾）。
const vnFold = foldHTML;
// 搜尋：名字、城市、地址、種類、聯絡人名字都算（清單那一頁只有前四樣）。純函式，test/venues.test.mjs 有測。
export function venueMatches(v, q) {
  const n = s => String(s || "").toLowerCase().replace(/\s+/g, "");
  const qq = n(q); if (!qq) return true;
  return [v.name, v.city, v.address, T("vn.k." + v.kind)].some(x => n(x).includes(qq));
}
// hasMap：2027-01-05-map-links.sql 跑過了沒（沒跑就不畫 Google 地圖那一格，填了也存不進去）。
function venueFields(v, dis, idp, hasMap) {
  const x = v || {};
  return `<div class="two">
      <label><i>${T("vn.name")}</i><input id="${idp}-name" value="${esc(x.name || "")}" maxlength="120"${dis}></label>
      <label><i>${T("vn.kind")}</i><select id="${idp}-kind"${dis}>${VENUE_KINDS.map(k => `<option value="${k}"${(x.kind || "other") === k ? " selected" : ""}>${esc(T("vn.k." + k))}</option>`).join("")}</select></label>
      <label><i>${T("vn.city")}</i><input id="${idp}-city" value="${esc(x.city || "")}" maxlength="60" placeholder="${esc(T("vn.cityPh"))}"${dis}></label>
      <label><i>${T("vn.address")}</i><input id="${idp}-address" value="${esc(x.address || "")}" maxlength="200"${dis}></label>
      <label><i>${T("vn.capacity")}</i><input id="${idp}-capacity" type="number" min="0" value="${esc(x.capacity == null ? "" : String(x.capacity))}"${dis}></label>
      <label><i>${T("vn.cost")}</i><input id="${idp}-cost" value="${esc(x.cost || "")}" maxlength="120" placeholder="${esc(T("vn.costPh"))}"${dis}></label>
      ${hasMap ? `<label class="wide"><i>${T("vn.map")}</i><input id="${idp}-map" type="url" inputmode="url" value="${esc(x.map_url || "")}" maxlength="600" placeholder="https://maps.app.goo.gl/…" autocomplete="off"${dis}><span class="ev-help">${T("vn.mapHelp")}</span></label>` : ""}
      <label class="wide"><i>${T("vn.url")}</i><input id="${idp}-url" value="${esc(x.url || "")}" maxlength="300" placeholder="https://…"${dis}></label>
      <label class="wide"><i>${T("vn.notes")}</i><textarea id="${idp}-notes" style="min-height:90px" placeholder="${esc(T("vn.notesPh"))}"${dis}>${esc(x.notes || "")}</textarea></label>
    </div>`;
}
// r = venues_list() 的結果 { can_edit, venues }
export function venuesListHTML(r, q, msg, busy, addOpen) {
  const dis = busy ? " disabled" : "";
  const list = (r && r.venues) || [], canEdit = !!(r && r.can_edit);
  const row = v => `<li data-vn-row data-q="${esc([v.name, v.city, T("vn.k." + v.kind)].join(" "))}"${venueMatches(v, q) ? "" : " hidden"}><div class="fhead"><b><a href="#venues/${esc(v.id)}" data-act="vn-open" data-id="${esc(v.id)}">${esc(v.name)}</a></b> <span class="tag">${esc(T("vn.k." + v.kind))}</span></div>
      <div class="fmeta">${[v.city, v.capacity != null ? T("vn.fits", { n: v.capacity }) : "", v.cost, T("vn.nEvents", { n: v.n_events || 0 }), v.last_used ? T("vn.lastUsed", { d: vnDate(v.last_used) }) : "", T("vn.nContacts", { n: v.n_contacts || 0 })].filter(Boolean).map(esc).join("・")}</div></li>`;
  const add = canEdit ? vnFold("vn-add", T("vn.add"), `${venueFields(null, dis, "vn-new", !!(r && r.has_map))}<div class="row"><button class="btn" data-act="vn-create"${dis}>${busy ? T("common.saving") : T("vn.addGo")}</button><span class="mini">${T("vn.addNote")}</span></div>`, addOpen) : "";
  return pageHead(T("vn.title"), T("vn.lede"))
    + msgHTML(msg)
    + add
    + (list.length ? `<label class="vn-find"><i>${T("vn.search")}</i><input type="search" id="vn-q" value="${esc(q || "")}" placeholder="${esc(T("vn.searchPh"))}" autocomplete="off"></label>
        <ul class="flist" id="vn-list">${list.map(row).join("")}</ul>`
      : emptyHTML(T("vn.none"), canEdit ? T("vn.noneHint") : T("vn.noneHintNo")))
    + (canEdit ? "" : `<div class="mini">${T("vn.readOnly")}</div>`);
}
const vnLink = (href, text) => href ? `<a href="${esc(href)}" target="_blank" rel="noopener">${esc(text)}</a>` : esc(text);
// r = venue_get() 的結果 { can_edit, venue, contacts, events }
export function venueHTML(r, msg, busy, contactOpen) {
  const dis = busy ? " disabled" : "";
  const v = r.venue || {}, canEdit = !!r.can_edit, cs = r.contacts || [], evs = r.events || [];
  const lede = [T("vn.k." + v.kind), v.city].filter(Boolean).map(esc).join("・");
  const details = canEdit
    ? `<div data-vn-form>${venueFields(v, dis, "vn-ed", evHasMap(v))}<div class="row"><button class="btn" data-act="vn-save" data-id="${esc(v.id)}"${dis}>${busy ? T("common.saving") : T("common.save")}</button></div></div>`
    : `<dl class="vn-dl">${[["vn.address", esc(v.address)], ["vn.map", v.map_url && evMapOk(v.map_url) ? vnLink(v.map_url, T("ev.mapOpen")) : ""], ["vn.capacity", v.capacity == null ? "" : esc(String(v.capacity))], ["vn.cost", esc(v.cost)],
        ["vn.url", /^https?:\/\//i.test(v.url || "") ? vnLink(v.url, v.url) : esc(v.url)], ["vn.notes", esc(v.notes).replace(/\n/g, "<br>")]]
        .filter(([, x]) => x).map(([k, x]) => `<dt>${T(k)}</dt><dd>${x}</dd>`).join("")}</dl>`;
  const crow = c => {
    const bits = [c.email ? vnLink("mailto:" + c.email, c.email) : "", c.phone ? vnLink("tel:" + c.phone.replace(/[^\d+]/g, ""), c.phone) : "",
      c.line ? `LINE ${/^[\w.@-]+$/.test(c.line) ? vnLink("https://line.me/ti/p/~" + encodeURIComponent(c.line), c.line) : esc(c.line)}` : ""].filter(Boolean);
    return `<li><div class="fhead"><b>${esc(c.name || T("vn.noName"))}</b>${c.role ? ` <span class="mini">${esc(c.role)}</span>` : ""}${canEdit ? ` <button class="btn quiet sm" data-act="vnc-del" data-id="${esc(c.id)}"${dis}>${T("common.delete")}</button>` : ""}</div>
      <div class="fmeta">${bits.join("・")}${c.note ? `<div class="mini">${esc(c.note)}</div>` : ""}</div></li>`;
  };
  const addC = canEdit ? vnFold("vnc-add", T("vnc.add"), `<div class="two">
      <label><i>${T("vnc.name")}</i><input id="vnc-name" maxlength="80"${dis}></label>
      <label><i>${T("vnc.role")}</i><input id="vnc-role" maxlength="80" placeholder="${esc(T("vnc.rolePh"))}"${dis}></label>
      <label><i>Email</i><input id="vnc-email" type="email" maxlength="120"${dis}></label>
      <label><i>${T("vnc.phone")}</i><input id="vnc-phone" maxlength="40"${dis}></label>
      <label><i>LINE</i><input id="vnc-line" maxlength="80"${dis}></label>
      <label><i>${T("vnc.note")}</i><input id="vnc-note" maxlength="200" placeholder="${esc(T("vnc.notePh"))}"${dis}></label>
    </div><div class="row"><button class="btn" data-act="vnc-create" data-id="${esc(v.id)}"${dis}>${T("vnc.addGo")}</button></div>`, contactOpen) : "";
  const erow = e => `<li><div class="fhead"><b>${e.source === "import" ? esc(e.title || e.slug) : `<a href="#events/${esc(e.slug)}" data-act="ev-open" data-slug="${esc(e.slug)}">${esc(e.title || e.slug)}</a>`}</b></div>
      <div class="fmeta">${[vnDate(e.starts_at), String(e.team || "").replace(/\s*Team$/i, "")].filter(Boolean).map(esc).join("・")}</div></li>`;
  return pageHead(esc(v.name || ""), lede, [], { act: "vn-back", label: T("vn.back") })
    + msgHTML(msg)
    + sectionHTML(esc(T("vn.details")), details)
    + sectionHTML(`${esc(T("vn.contacts"))}<span class="hint">${cs.length}</span>`, (cs.length ? `<ul class="flist">${cs.map(crow).join("")}</ul>` : `<div class="mini">${T("vn.noContacts")}</div>`) + addC)
    + sectionHTML(`${esc(T("vn.events"))}<span class="hint">${evs.length}</span>`, evs.length ? `<ul class="flist">${evs.map(erow).join("")}</ul>` : `<div class="mini">${T("vn.noEvents")}</div>`)
    + (canEdit ? `<div class="form-foot"><button class="btn danger sm" data-act="vn-del" data-id="${esc(v.id)}"${dis}>${T("vn.delete")}</button><span class="mini">${T("vn.deleteNote")}</span></div>` : "");
}
// 活動頁上的「場地」那一塊：從清單選一個，選了就存（main.js 聽 #ev-venue 的 change）。venues null 是還沒載到（或資料表還沒建），不畫。
// 2026-11-23：不再自己是一整段，是「時間與地點」那一段裡的第二塊（地點那一格的正下面）。
export function eventVenueHTML(e, venues, canEdit, busy) {
  if (!Array.isArray(venues)) return "";
  const cur = venues.find(v => v.id === e.venue_id);
  const pick = canEdit && venues.length ? `<label><i>${T("vn.pick")}</i><select id="ev-venue" data-id="${esc(e.id)}"${busy ? " disabled" : ""}><option value="">${T("vn.pickNone")}</option>${
      venues.map(v => `<option value="${esc(v.id)}"${v.id === e.venue_id ? " selected" : ""}>${esc(v.name)}${v.city ? `・${esc(v.city)}` : ""}</option>`).join("")}</select></label>` : "";
  const now = cur ? `<p class="ev-line">${esc(cur.name)}${cur.city ? `・${esc(cur.city)}` : ""} <a class="btn ghost sm" href="#venues/${esc(cur.id)}" data-act="vn-open" data-id="${esc(cur.id)}">${T("vn.openVenue")}</a>${cur.map_url && evMapOk(cur.map_url) ? ` <a class="btn ghost sm" href="${esc(cur.map_url)}" target="_blank" rel="noopener">${T("ev.mapOpen")}</a>` : ""}</p>` : `<p class="ev-line">${T("vn.eventNone")}</p>`;
  return evPanel(esc(T("vn.eventVenue")), `${now}${pick}<div class="ev-help">${T("vn.eventNote")}</div>`, 'id="ev-place-box"');
}
