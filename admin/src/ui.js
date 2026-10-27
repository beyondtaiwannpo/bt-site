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
  const d = draft || { title: "", team: myTeam || "", kind: "program" };
  const dis = busy ? " disabled" : "";
  return `<div class="card inline-form" id="new-form">
    <h2>${T("newForm.title")}</h2>
    <div class="sub">${T("newForm.sub")}</div>
    <div class="two">
      <label><i>${T("newForm.name")}</i><input id="nf-title" value="${esc(d.title)}" placeholder="${esc(T("newForm.namePh"))}" maxlength="80"${dis}></label>
      ${teams && teams.length
        ? `<label><i>${T("form.team")}</i><select id="nf-team"${dis}>${teams.map(t => `<option${t === d.team ? " selected" : ""}>${esc(t)}</option>`).join("")}</select></label>`
        : `<label><i>${T("form.team")}</i><input id="nf-team" value="${esc(d.team)}" disabled></label>`}
      <label><i>${T("form.kind")}</i><select id="nf-kind"${dis}>
        <option value="program"${d.kind !== "board" ? " selected" : ""}>${T("kind.program")}</option>
        <option value="board"${d.kind === "board" ? " selected" : ""}>${T("kind.board")}</option>
      </select></label>
    </div>
    <div class="row">
      <button class="btn" data-act="new-form-save"${dis}>${busy ? T("newForm.creating") : T("newForm.create")}</button>
      <button class="btn ghost" data-act="new-form-cancel"${dis}>${T("common.cancel")}</button>
    </div>
  </div>`;
}

// 表單清單。newDraft 不是 null 就在清單上面展開內嵌表單；teams 與 myTeam 給那個表單用。
export function listHTML(forms, canCreate, msg, isPresident, newDraft, teams, myTeam, busy, mpItems) {
  const row = f => {
    const st = statusOf(f.status);
    return `<li>
      <div class="fhead">
        <b>${esc(f.title)}</b>
        <span class="tag ${st.tag}">${esc(T(st.label))}</span>
        ${f.kind === "board" ? `<span class="tag">${T("kind.board")}</span>` : ""}
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
                  canCreate ? { act: "new-form", label: T("forms.new") } : null)));
}

// 一份表單裡的三個分頁（2026-10-19，批 3）：申請（審核）、設定（欄位與題目）、活動（簽到與寄信）。
// 位置固定在頁首底下，簽到跟行前信不再藏在底線字後面。view 是 main.js 的 S.view。
export function formTabsHTML(form, view) {
  const on = k => (k === "apps" && view === "apps") || (k === "form" && (view === "form" || view === "question")) ||
                  (k === "event" && (view === "checkin" || view === "notice"));
  const tab = (k, act, label) => `<button class="subtab${on(k) ? " on" : ""}" data-act="${act}" data-id="${esc(form.id)}"${on(k) ? ' aria-current="page"' : ""}>${label}</button>`;
  return `<nav class="subtabs" aria-label="${esc(T("tabs.aria"))}">${tab("apps", "open-apps", T("tabs.apps"))}${tab("form", "open-form", T("tabs.form"))}${tab("event", "open-checkin", T("tabs.event"))}</nav>`;
}
// 一份表單共用的頁首：名字、狀態、team，返回清單。
export function formHeadHTML(form, view, count) {
  const st = statusOf(form.status);
  return pageHead(`${esc(form.title)} <span class="tag ${st.tag}">${esc(T(st.label))}</span>`,
      `${esc(form.team || T("forms.noTeam"))}${count != null ? T("form.received", { n: count }) : ""}`, [], { act: "back-list", label: T("form.back") })
    + formTabsHTML(form, view);
}

// ── 一份表單 ──────────────────────────────────────────────────────────
export function formHTML(form, questions, canEdit, teams, msg, busy) {
  const st = statusOf(form.status);
  const qs = questions.map((q, i) => `<li>
    <div class="qtop">
      ${canEdit ? `<div class="qmove">
        <button data-act="q-up" data-id="${esc(q.id)}" ${i === 0 ? "disabled" : ""} aria-label="${esc(T("q.up"))}">↑</button>
        <button data-act="q-down" data-id="${esc(q.id)}" ${i === questions.length - 1 ? "disabled" : ""} aria-label="${esc(T("q.down"))}">↓</button>
      </div>` : ""}
      <div class="qbody">
        <div class="qlabel">${esc(q.label)}${q.required ? ` <span class="tag">${T("q.required")}</span>` : ""}</div>
        <div class="qsub">${esc(T(typeOf(q.type).label))}${q.help ? "・" + esc(q.help) : ""}</div>
        ${(q.options || []).length
          ? `<div class="opts">${q.options.map(o => `<span>${esc(o)}</span>`).join("")}</div>` : ""}
      </div>
      ${canEdit ? `<div class="row" style="margin:0;flex:none">
        <button class="btn quiet" data-act="q-edit" data-id="${esc(q.id)}">${T("common.edit")}</button>
        <button class="btn quiet" data-act="q-del" data-id="${esc(q.id)}">${T("q.del")}</button>
      </div>` : ""}
    </div>
  </li>`).join("");

  const teamPick = teams && teams.length
    ? `<label><i>${T("form.team")}</i><select id="fteam"${canEdit ? "" : " disabled"}>
        ${teams.map(t => `<option${t === form.team ? " selected" : ""}>${esc(t)}</option>`).join("")}
      </select></label>`
    : "";

  return formHeadHTML(form, "form")
    + msgHTML(msg)
    + sectionHTML(T("form.settings"), `
    <label><i>${T("form.name")}</i><input id="ftitle" value="${esc(form.title)}"${canEdit ? "" : " disabled"}></label>
    <label><i>${T("form.intro")}</i>
      <textarea id="fintro"${canEdit ? "" : " disabled"}>${esc(form.intro || "")}</textarea></label>
    <div class="two">
      <label><i>${T("form.kind")}</i><select id="fkind"${canEdit ? "" : " disabled"}>
        <option value="program"${form.kind === "program" ? " selected" : ""}>${T("kind.program")}</option>
        <option value="board"${form.kind === "board" ? " selected" : ""}>${T("kind.board")}</option>
      </select></label>
      <!-- 一份表單一種語言，題目沒有雙語欄位（2026-09-07 拍板）。
           要中英都收就開兩份表單。理由見 forms.lang 那條欄位註解。 -->
      <label><i>${T("form.lang")}</i><select id="flang"${canEdit ? "" : " disabled"}>
        <option value="zh"${form.lang === "zh" ? " selected" : ""}>${T("lang.zh")}</option>
        <option value="en"${form.lang === "en" ? " selected" : ""}>${T("lang.en")}</option>
      </select></label>
      <label><i>${T("form.opens")}</i>
        <input id="fopen" type="datetime-local" value="${esc(dtVal(form.opens_at))}"${canEdit ? "" : " disabled"}></label>
      <label><i>${T("form.closes")}</i>
        <input id="fclose" type="datetime-local" value="${esc(dtVal(form.closes_at))}"${canEdit ? "" : " disabled"}></label>
      <!-- 預計通知日：申請人的狀態會顯示成「已收到，X 月 X 日前會通知你」。
           2026-09-07 Paul 選了這句而不是「審核中」。**沒填就只剩「已收到」**，
           不要編一個日期出來。 -->
      <label><i>${T("form.notify")}</i>
        <input id="fnotify" type="date" value="${esc(dateVal(form.notify_by))}"${canEdit ? "" : " disabled"}></label>
      ${teamPick}
    </div>
    <label><i>${T("form.cal")}</i>
      <input id="fcal" value="${esc(form.interview_url || "")}" placeholder="https://cal.com/..."${canEdit ? "" : " disabled"}></label>

    <label><i>${T("form.status")}</i><select id="fstatus"${canEdit ? "" : " disabled"}>
      ${STATUSES.map(s => `<option value="${s.v}"${form.status === s.v ? " selected" : ""}>${esc(T(s.label))}</option>`).join("")}
    </select></label>
    <div class="mini" style="margin:-6px 0 16px">${esc(T(st.hint))}</div>
    ${canEdit ? `<div class="form-foot">
      <button class="btn" data-act="save-form" ${busy ? "disabled" : ""}>${busy ? T("common.saving") : T("common.save")}</button>
      <span class="sp"></span>
      <button class="btn quiet" data-act="del-form">${T("form.deleteForm")}</button>
    </div>` : ""}`)
    + sectionHTML(T("form.questions"), `<div class="mini" style="margin-bottom:10px">
      ${T("form.qNote")}</div>
    ${questions.length ? `<ul class="qlist">${qs}</ul>`
      : emptyHTML(T("form.noQ"), T("form.noQHint"), canEdit ? { act: "q-new", label: T("form.addQ") } : null)}
    ${canEdit && questions.length ? `<div class="row">
      <button class="btn ghost sm" data-act="q-new">${T("form.addQ")}</button>
    </div>` : ""}`);
}

// ── 一題 ──────────────────────────────────────────────────────────────
// q 是 null 代表新增。
export function questionHTML(q, msg, busy) {
  const cur = q || { label: "", help: "", type: "short", required: false, options: [] };
  return pageHead(q ? T("q.editTitle") : T("q.newTitle"), T("q.lede"), [], { act: "q-cancel", label: T("q.back") })
    + msgHTML(msg)
    + sectionHTML("", `
    <label><i>${T("q.label")}</i><input id="qlabel" value="${esc(cur.label)}" placeholder="${esc(T("q.labelPh"))}"></label>
    <label><i>${T("q.help")}</i>
      <input id="qhelp" value="${esc(cur.help || "")}" placeholder="${esc(T("q.helpPh"))}"></label>
    <label><i>${T("q.type")}</i><select id="qtype">
      ${TYPES.map(t => `<option value="${t.v}"${cur.type === t.v ? " selected" : ""}>${esc(T(t.label))}</option>`).join("")}
    </select></label>
    <div class="mini" style="margin:-6px 0 14px">${TYPES.map(t =>
      `${esc(T(t.label))}：${esc(T(t.hint))}`).join("<br>")}</div>
    <!-- 選項一行一個。**不做「按一下加一格」那種介面**：
         一行一個是所有人都會的操作，而且複製貼上一整串選項只要一次。 -->
    <label><i>${T("q.opts")}</i>
      <textarea id="qopts" placeholder="${T("q.optsPh")}">${esc((cur.options || []).join("\n"))}</textarea></label>
    <label class="check" style="display:flex;gap:10px;align-items:center;font-size:14.5px">
      <input id="qreq" type="checkbox" style="width:18px;height:18px"${cur.required ? " checked" : ""}>
      <span>${T("q.req")}</span>
    </label>
    <div class="form-foot">
      <button class="btn" data-act="q-save" ${busy ? "disabled" : ""}>${busy ? T("common.saving") : T("q.save")}</button>
      <button class="btn ghost" data-act="q-cancel">${T("common.cancel")}</button>
    </div>`);
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
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

// 一件申請一列。
//
// ⚠ **答案預設是收起來的，但「展開」不打網路** —— 答案已經在手上了
// （見 data.js 的 loadApplications）。審核就是一個一個看，
// 每看一個等一次網路的話，看到第十個就不想看了。
export function appsHTML(form, apps, questions, canDecide, sel, filter, pending, msg, busy) {
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
          </div>
          <div class="fmeta">${[esc(a.applicant_school || T("apps.noSchool")), esc(a.applicant_grade || ""),
            esc(a.applicant_email), T("apps.submitted", { when: fmtWhen(a.submitted_at) })].filter(Boolean).join("・")}
            ${a.guardian_email ? "<br>" + T("apps.guardian") + esc(a.guardian_email) : ""}</div>
          <details class="ans">
            <summary>${T("apps.answers")}</summary>
            <dl>${questions.map(q => {
              const v = a.answers.get ? a.answers.get(q.id) : "";
              return `<dt>${esc(q.label)}</dt><dd>${v ? esc(v).replace(/\n/g, "<br>") : `<span class="mini">${T("apps.blank")}</span>`}</dd>`;
            }).join("")}</dl>
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

// ── 後台的側欄與外殼（2026-10-19，後台第二次重整）──────────────────────
// 後台拆成四個資料夾，每一頁左邊都是這一條側欄。**四個資料夾各有一份這一段**
//（資料夾之間不互相 import，跟 esc() 同一條規矩），test/admin-hub.test.mjs
// 逐字比對四份一模一樣。漂移的表現是「在 A 頁看得到的分頁，到 B 頁不見了」，不會報錯。
//
// GROUPS 是四組，ITEMS 是每一組底下的分頁。who 是「誰看得到」，
// 只決定側欄上那一行是連結還是淡字。**真正的門在每個資料夾的 main.js 開頁第一句，
// 以及資料庫的函式與 RLS。**
// label 與 hint 中英並排（2026-10-19 中英切換），畫的時候 T() 挑一句。
export const GROUPS = [
  { key: "forms",     label: { zh: "申請",     en: "Applications" }, href: "/admin/",           who: "cadre",        hint: { zh: "申請表、審核、簽到、行前信", en: "Forms, review, check-in, notices" } },
  { key: "site",      label: { zh: "對外",     en: "Public site" },  href: "/admin/site/",      who: "cadre",        hint: { zh: "資源、團隊頁、校友頁、信件文案、歷史之路", en: "Resources, team page, alumni page, email copy, history" } },
  { key: "passports", label: { zh: "護照",     en: "Passports" },    href: "/admin/passports/", who: "ws:passport|intern-passport", hint: { zh: "兩本護照的格子", en: "Boxes in both passports" } },
  { key: "people",    label: { zh: "人與權限", en: "People" },       href: "/admin/people/",    who: "senior",       hint: { zh: "名單、職級、工作區、屆別、邀請碼", en: "Roster, ranks, workspaces, terms, invite codes" } },
];
// 側欄上每一行。要加一個新的後台分頁，就在這裡加一行（四份都要加），
// 然後在那一組的 ui.js 加一個畫面函式、main.js 接 data-act="tab" data-t="<key>"。
export const ITEMS = [
  // 2026-10-23 第三次重整批 4：叫「總覽」不叫「首頁」，頂欄那一顆「後台」跟它才不會是同一個地方兩個名字。
  { group: "forms",     key: "home",    label: { zh: "總覽",     en: "Overview" },        who: "cadre" },
  { group: "forms",     key: "forms",   label: { zh: "申請表",   en: "Forms" },           who: "cadre" },
  // 2026-10-31 行銷需求單：每一位幹部都能送；佇列只有 Marketing 需求工作區裡的人（與靠職級的兩級）看得到。
  // 2026-11-01 活動上架：每一位幹部看得到活動清單（自己 team 的），開活動要 team 的 Director 或 senior（門在資料庫）。
  { group: "forms",     key: "events",   label: { zh: "活動",     en: "Events" },          who: "cadre" },
  // 2026-11-02 會議紀錄：每一位幹部看得到；排會與記會議的門在資料庫（senior 或那個 team 的 Director）。
  { group: "forms",     key: "meetings", label: { zh: "會議",     en: "Meetings" },        who: "cadre" },
  { group: "forms",     key: "request",  label: { zh: "跟 Marketing 提需求", en: "Request from Marketing" }, who: "cadre" },
  { group: "forms",     key: "requests", label: { zh: "行銷需求單", en: "Marketing requests" }, who: "ws:custom:marketing-requests" },
  { group: "site",      key: "res",     label: { zh: "資源",     en: "Resources" },       who: "cadre" },
  { group: "site",      key: "team",    label: { zh: "團隊頁",   en: "Team page" },       who: "senior" },
  { group: "site",      key: "stories", label: { zh: "校友頁",   en: "Alumni page" },     who: "senior" },
  { group: "site",      key: "mail",    label: { zh: "信件文案", en: "Email copy" },      who: "senior" },
  // 2026-11-06 歷史之路：每一位幹部看得到清單；加站、傳照片、按 ready 要 Marketing 資源工作區「管」或 senior，上架只有 senior（門在資料庫）。
  { group: "site",      key: "history", label: { zh: "歷史之路", en: "History" },         who: "cadre" },
  { group: "passports", key: "interns", label: { zh: "實習護照", en: "Intern passport" }, who: "ws:intern-passport" },
  { group: "passports", key: "board",   label: { zh: "棋盤",     en: "Board" },           who: "ws:intern-passport" },
  { group: "passports", key: "cadre",   label: { zh: "幹部護照", en: "Cadre passport" },  who: "ws:passport" },
  { group: "passports", key: "cities",  label: { zh: "城市",     en: "Cities" },          who: "ws:passport" },
  { group: "people",    key: "roster",     label: { zh: "幹部名單", en: "Roster" },          who: "senior" },
  { group: "people",    key: "workspaces", label: { zh: "工作區",   en: "Workspaces" },      who: "senior" },
  { group: "people",    key: "terms",      label: { zh: "屆別",     en: "Terms" },           who: "senior" },
  // 2026-10-29 邀請信：打 email 與職位寄一封信。Co-President 與 Senior Adviser 都邀得了（撤銷只有 Co-President，門在資料庫）。
  { group: "people",    key: "invites",    label: { zh: "邀請",     en: "Invites" },         who: "senior" },
  { group: "people",    key: "changes",    label: { zh: "變動紀錄", en: "Change log" },      who: "senior" },
];
const WHY = { president: "why.president", senior: "why.senior", "ws:passport|intern-passport": "why.passports" };
// me = { role, board, team, name }。team 可能是逗號字串（一個人在好幾個 team）。
function allowed(who, me) {
  if (!me || me.role !== "cadre") return false;
  if (who === "cadre") return true;
  if (who === "president") return me.board === "president";
  // 2026-10-24 起職級有四級：senior 是 Co-President 加 Senior Adviser（跟資料庫的 is_senior() 同一條規則）。
  if (who === "senior") return me.board === "president" || me.board === "senior_adviser";
  // "ws:a|b"：被派進其中任何一個工作區（任何等級），或 senior。me.ws 是 my_access() 回的 { 工作區: 等級 }。
  if (who.startsWith("ws:")) return senior(me) || who.slice(3).split("|").some(id => !!(me.ws || {})[id]);
  return false;
}
const senior = me => !!me && me.role === "cadre" && (me.board === "president" || me.board === "senior_adviser");
// 我對這個工作區的等級：senior 一律 manage，沒被派回空字串。main.js 用它決定畫不畫按鈕，門仍在資料庫。
export function wsLevel(me, id) { return senior(me) ? "manage" : String((me && me.ws || {})[id] || ""); }
export const canEditWs = (me, id) => ["edit", "manage"].includes(wsLevel(me, id));
// 有沒有被派進任何一個某種工作區（例如 "apps:"）而且能改：首頁與申請表的「新增」按鈕用。
export const canEditAny = (me, prefix) => senior(me) || Object.entries((me && me.ws) || {}).some(([id, lv]) => id.startsWith(prefix) && ["edit", "manage"].includes(lv));
export function canEnter(g, me) { return allowed(g.who, me); }
export function canSee(item, me) { return allowed(item.who, me); }
const BOARD_KEY = { member: "board.member", adviser: "board.adviser", director: "board.director", senior_adviser: "board.senior", president: "board.president" };
export const boardName = board => T(BOARD_KEY[board] || "board.member");

// 側欄。group 是現在在哪一組，tab 是哪一個分頁，counts 是 { <key>: 數字 }（有才顯示，批 2 的首頁會餵）。
// 同一組裡的分頁是 data-act="tab"（不重新載入頁面）；別組的是一般連結，帶 #key 讓那一頁開在對的分頁，
// 也帶 ?lang= 讓語言跟著走（withLang）。
export function railHTML(group, tab, me, counts) {
  const c = counts || {};
  const item = it => {
    const on = it.group === group && it.key === tab;
    const n = c[it.key] ? `<span class="rail-count">${esc(String(c[it.key]))}</span>` : "";
    if (!canSee(it, me)) return `<span class="rail-item off">${esc(T(it.label))}</span>`;
    const href = it.group === group ? `#${it.key}` : withLang(`${GROUPS.find(g => g.key === it.group).href}#${it.key}`);
    return `<a class="rail-item${on ? " on" : ""}" href="${href}"${it.group === group ? ` data-act="tab" data-t="${it.key}"` : ""}${
      on ? ' aria-current="page"' : ""}>${esc(T(it.label))}${n}</a>`;
  };
  const home = ITEMS.find(i => i.key === "home");
  const groups = GROUPS.map(g => {
    const ok = canEnter(g, me);
    // 2026-10-31：進得去的組裡，綁工作區的那幾行（who 是 ws:…）只給被派進去的人看（行銷需求單的佇列在「申請」這一組，幹部都進得了組）。
    const rows = ITEMS.filter(i => i.group === g.key && i.key !== "home" && (!String(i.who).startsWith("ws:") || canSee(i, me)));
    // 2026-10-23 批 4：進不去的組只留組名變淡，不再掛一段為什麼。為什麼在總覽的「你的存取」那一塊講一次就好；
    // 三段灰色長文在側欄上看起來像三個警告。WHY 留著給 title（滑過去還看得到）。
    return `<div class="rail-group${ok ? "" : " off"}"${ok ? "" : ` title="${esc(T(WHY[g.who]) || "")}"`}>${esc(T(g.label))}</div>${
      ok ? rows.map(item).join("") : rows.map(i => `<span class="rail-item off">${esc(T(i.label))}</span>`).join("")}`;
  }).join("");
  // Co-President 與 Senior Adviser 是整個組織的（Paul 2026-10-24），這一行印「全部 team」，不印他自己勾的標籤。
  const teams = (me && (me.board === "president" || me.board === "senior_adviser")) ? [T("rail.allTeams")]
    : String(me && me.team || "").split(/[,、;；]/).map(s => s.trim()).filter(Boolean);
  return `<input class="rail-toggle" type="checkbox" id="rail-toggle" aria-label="${esc(T("rail.open"))}">
  <label class="rail-burger" for="rail-toggle">${T("rail.menu")}</label>
  <nav class="rail" aria-label="${esc(T("rail.groups"))}">
    <div class="rail-me"><b>${esc(me && me.name || "")}</b>
      <span>${esc(boardName(me && me.board))}${teams.length ? "・" + esc(teams.join(T("punct.list"))) : "・" + T("rail.noTeam")}</span></div>
    ${langSwitchHTML()}
    ${item(home)}
    ${groups}
    <div class="rail-foot">${T("rail.foot")}</div>
  </nav>`;
}

// 中英切換（2026-10-19）：兩顆小按鈕，現在的那一顆亮著。字面「中文」「English」刻意不翻，
// 看不懂現在這個語言的人才需要它。main.js 接 data-act="lang"。
export function langSwitchHTML() {
  const b = l => `<button class="lang${lang() === l ? " on" : ""}" data-act="lang" data-lang="${l}" aria-pressed="${lang() === l}">${l === "zh" ? "中文" : "English"}</button>`;
  return `<div class="rail-lang" role="group" aria-label="${esc(T("rail.lang"))}">${b("zh")}${b("en")}</div>`;
}

// 整頁的外殼：頂欄在上，底下左側欄、右內容。
export function shellHTML(nav, rail, body) {
  return `${nav}<div class="shell${rail ? "" : " solo"}">${rail || ""}<main class="main">${body}</main></div>`;
}

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
  el.innerHTML = `<span class="toast-k">${kind === "err" ? T("msg.err") : T("msg.ok")}</span><span class="toast-t">${esc(msg)}</span>${
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
  S.ask = { act: b.dataset.act, id: b.dataset.id || "", text: String(text || "") };
  if (typeof document !== "undefined") mountAsk(document, S.ask);
  return true;
}
export function mountAsk(root, ask) {
  if (!ask || !root) return;
  for (const old of root.querySelectorAll(".ask")) old.remove();
  const sel = `[data-act="${ask.act}"]` + (ask.id ? `[data-id="${ask.id}"]` : "");
  const b = [...root.querySelectorAll(sel)].find(x => x.dataset.confirmed !== "1" && !x.closest(".ask"));
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
  const timers = new Map(), running = new Map(), again = new Map();
  const run = async (box, field) => {
    const act = box.dataset.autosave;
    if (running.get(box)) { again.set(box, field); return; }
    running.set(box, true);
    try { await onSave(act, box, field); }
    finally {
      running.delete(box);
      const f = again.get(box);
      if (f) { again.delete(box); run(box, f); }
    }
  };
  const schedule = (field, now) => {
    const box = field.closest("[data-autosave]");
    if (!box) return;
    let d = timers.get(box);
    if (!d) { d = debounce(f => run(box, f), AUTOSAVE_MS); timers.set(box, d); }
    if (now) d.flush(field); else d(field);
  };
  root.addEventListener("input", e => { const m = saveMode(e.target); if (m === "typed") schedule(e.target, false); });
  root.addEventListener("change", e => { const m = saveMode(e.target); if (m === "now") schedule(e.target, true); else if (m === "typed") schedule(e.target, true); });
  root.addEventListener("focusout", e => { const m = saveMode(e.target); if (m === "typed") { const d = timers.get(e.target.closest("[data-autosave]")); if (d) d.flush(e.target); } });
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
    toast(T("ver.newer"), { label: T("ver.reload"), fn: () => location.reload() }, { sticky: true });
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
  const p0 = Object.assign({ q: "", mq: "", teams: [], ticked: [], level: "view" }, pk || {});
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
  const pk = Object.assign({ q: "", mq: "", teams: [], ticked: [], level: "view" }, o.pk || {});
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
    const row = r => `<div class="ma-row">${nameBlock(r)}${rankTag(r.board_role)}${r.user_id === o.meId ? `<span class="mini">${T("mp.you")}</span>` : ""}<span class="sp"></span>
        <select data-act="${esc(o.acts.level)}" data-id="${esc(r.user_id)}"${dis}>${["view", "edit", "manage"].map(l => `<option value="${l}"${r.level === l ? " selected" : ""}>${esc(T("level." + l))}</option>`).join("")}</select>
        <button type="button" class="lnk" data-act="${esc(o.acts.remove)}" data-id="${esc(r.user_id)}"${dis}>${T("mp.remove")}</button></div>`;
    const nPeople = seniors.length + plain.length;
    left = { n: nPeople, title: T("ma.in", { n: nPeople }),
      items: seniors.filter(hit).map(seniorRow).concat(plain.filter(hit).map(row)), empty: T("ma.inNone"),
      foot: redundant.length && o.acts.cleanup && o.canCleanup
        ? `<div class="ma-foot mini">${T("ma.redundant", { n: redundant.length })} <button type="button" class="lnk" data-act="${esc(o.acts.cleanup)}" data-ids="${esc(redundant.map(r => r.user_id).join(","))}"${dis}>${T("ma.cleanup", { n: redundant.length })}</button></div>`
        : "" };
  }
  // 右欄
  const inIds = o.draft ? pk.ticked : rows.map(r => r.user_id);
  const cands = pkCandidates(people, inIds, o.all);
  const shown = pkShown(cands, pk);
  const ticked = new Set(pk.ticked);
  const n = o.draft ? 0 : pkPicked(people, inIds, pk, o.all).length;
  const teamsHere = PK_TEAMS.filter(t => cands.some(p => pkTeamsOf(p).includes(t)));
  const chip = t => `<button type="button" class="chip sm${pk.teams.includes(t) ? " on" : ""}" data-act="pk-team" data-ns="${esc(ns)}" data-team="${esc(t)}"${dis}>${esc(short(t))}</button>`;
  const cand = p => `<label class="ma-row pick${ticked.has(p.id) && !o.draft ? " on" : ""}"><input type="checkbox" name="${esc(ns)}-member" value="${esc(p.id)}" data-act="pk-tick" data-ns="${esc(ns)}"${ticked.has(p.id) && !o.draft ? " checked" : ""}${dis}>${nameBlock(p)}${rankTag(p.board_role)}${teamsHTML(p)}</label>`;
  const goBtn = o.go ? `<button class="btn sm" data-act="${esc(o.go.act)}" data-ns="${esc(ns)}"${Object.keys(o.go).filter(k => k !== "act").map(k => ` data-${k}="${esc(String(o.go[k]))}"`).join("")}${o.busy || !n ? " disabled" : ""}>${o.busy ? T("common.saving") : T("pk.addN", { n })}</button>` : "";
  const levelSel = `<select id="${esc(ns)}-level" data-act="pk-level" data-ns="${esc(ns)}" aria-label="${esc(T("pk.level"))}"${dis}>${["view", "edit", "manage"].map(l => `<option value="${l}"${pk.level === l ? " selected" : ""}>${esc(T("level." + l))}</option>`).join("")}</select>`;
  return `<div class="ma picker" data-ns="${esc(ns)}">
    <section class="ma-col"><div class="ma-head"><div class="ma-title">${left.title}</div>
        <input id="${esc(ns)}-mq" class="ma-find" value="${esc(pk.mq || "")}" placeholder="${esc(T("pk.findPh"))}" autocomplete="off" data-act="pk-mq" data-ns="${esc(ns)}"${dis}></div>
      <div class="ma-list">${left.items.length ? left.items.join("") : `<div class="ma-empty mini">${left.n ? T("pk.noneShown") : left.empty}</div>`}</div>${left.foot || ""}</section>
    <section class="ma-col"><div class="ma-head"><div class="ma-title">${T("ma.out", { n: cands.length })}${shown.length !== cands.length ? `<span class="mini"> ${T("ma.shown", { n: shown.length })}</span>` : ""}</div>
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
export function wsTeamOf(w, people) {
  const id = String((w && w.id) || "");
  // 2026-10-30 起申請是整個 BT 一個工作區 apps（在「整個 BT」那一列）；apps:<team> 是停用的舊工作區，還認得出來就好。
  if (id === "apps") return "";
  if (id.startsWith("apps:")) return id.slice(5);
  if (id.startsWith("res:")) return id.slice(4);
  if (id === "intern-passport") return "Internship Team";
  if (id === "passport") return "";
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
  return (w && ((lang() === "zh" ? (w.title_zh || w.title_en) : (w.title_en || w.title_zh)))) || id;
}
export function wsCellHref(w) {
  const id = String((w && w.id) || "");
  if (id === "passport") return "/admin/passports/#cadre";
  if (id === "intern-passport") return "/admin/passports/#interns";
  if (id === "apps" || id.startsWith("apps:")) return "/admin/#forms";
  if (id.startsWith("res:")) return "/admin/site/#res";
  if (id === "custom:marketing-requests") return "/admin/#requests";
  if (id.startsWith("custom:event-")) return "/admin/#events/" + encodeURIComponent(id.slice(13));
  return "/admin/people/#ws=" + encodeURIComponent(id);
}
// 分組：[{ team: "" 或 team 名, label, cells: [workspace…] }]，整個 BT 那一列在最上面，然後照 teams 的順序，最後是清單外的 team。
export function wsRows(workspaces, teams, people) {
  const active = (workspaces || []).filter(w => w.active !== false);
  const order = { apps: 0, passport: 1, "intern-passport": 3 };
  const rank = w => w.id.startsWith("apps:") ? 1 : w.id.startsWith("res:") ? 2 : (order[w.id] != null ? order[w.id] : 9);
  const groups = new Map([["", []]]);
  for (const t of teams || []) groups.set(t, []);
  for (const w of active) { const t = wsTeamOf(w, people); if (!groups.has(t)) groups.set(t, []); groups.get(t).push(w); }
  return [...groups.entries()].map(([team, cells]) => ({ team, label: team ? team.replace(/\s*Team$/i, "") : T("ws.board"), cells: cells.sort((a, b) => rank(a) - rank(b)) }));
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
        acts: { level: "members-level", remove: "members-unassign", cleanup: "members-cleanup" }, canCleanup: !!mp.senior, go: { act: "members-assign", ws: mp.ws } });
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
  cards.push({ n: pending.length, label: T("card.mail"), unit: T("card.mail.unit"),
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
    const waiting = rq === null ? null : (rq || []).filter(r => r.status === "new" || r.status === "in_progress").length;
    cards.push({ n: waiting, label: T("card.rq"), unit: T("card.rq.unit"), hint: waiting ? T("card.rq.hint", { n: (rq || []).filter(r => r.status === "new").length }) : T("card.rq.none"),
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
  const myOpen = (rq || []).filter(r => me && r.requester === me.id && (r.status === "new" || r.status === "in_progress"));
  if (myOpen.length) {
    const r = myOpen[0];
    cards.push({ n: myOpen.length, label: T("card.myrq"), unit: T("card.rq.unit"), hint: T("card.myrq.hint", { title: esc(r.title), status: T("rq.st." + r.status) }), href: "#request", go: T("card.myrq.go") });
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

// 你的 team：每個 team 一段，三行：開放中的申請表、資源、Director。
export function teamBlocksHTML(me, forms, todo) {
  const t = todo || {};
  const pres = senior(me);
  const roster = t.roster || [];
  const res = t.resources || [];
  // 2026-10-23 批 4：team 的清單從工作區來（有 apps:X 或 res:X 的 X），不從標籤來。
  // 盤點抓到 Community Relations 有兩個工作區但沒有人勾那個標籤，整個 team 從這裡消失。
  const wsTeams = (t.workspaces || []).filter(w => w.active !== false && /^(apps|res):/.test(w.id)).map(w => w.id.replace(/^(apps|res):/, ""));
  let teams;
  if (pres) {
    const set = new Set(wsTeams);
    for (const p of roster) for (const x of splitTeams(p.team)) set.add(x);
    for (const f of forms || []) if (f.team) set.add(f.team);
    for (const r of res) if (r.team) set.add(r.team);
    teams = [...set].sort((a, b) => a.localeCompare(b));
  } else {
    // 自己被派進去的 team（任何等級）加自己勾的標籤。
    const set = new Set(Object.keys((me && me.ws) || {}).filter(id => /^(apps|res):/.test(id)).map(id => id.replace(/^(apps|res):/, "")));
    for (const x of splitTeams(me && me.team)) set.add(x);
    teams = [...set].sort((a, b) => a.localeCompare(b));
  }
  // Director 是誰：名單讀得到就從名單；讀不到（或名單上沒有）就從公開團隊頁的職位算，那是公開資料，誰都拿得到。
  const pubDirs = team => (t.directors || []).filter(d => d.team === team && /director/i.test(String(d.title_en || d.title_zh || ""))).map(nameOf);
  if (!teams.length) return emptyHTML(T("team.none"), T("team.noneHint"));
  return `<div class="teamlist">${teams.map(team => {
    const fs = (forms || []).filter(f => f.team === team);
    const open = fs.filter(f => f.status === "open");
    const rec = fs.reduce((n, f) => n + (f.counts ? f.counts.received : 0), 0);
    const rs = res.filter(r => r.team === team);
    const pub = rs.filter(r => r.status === "published").length;
    const fromRoster = roster.filter(p => p.board_role === "director" && splitTeams(p.team).includes(team)).map(nameOf);
    const dirs = fromRoster.length ? fromRoster : pubDirs(team);
    const members = roster.filter(p => splitTeams(p.team).includes(team)).length;
    return `<section class="teamblk">
      <h3>${esc(team.replace(/\s*Team$/i, ""))}<span class="hint">${members ? T("team.members", { n: members }) : ""}</span></h3>
      <ul>
        <li><a href="${withLang("/admin/#forms")}">${T("team.forms")}</a>${T("punct.colon")}${fs.length ? `${T("team.formsSum", { n: fs.length, open: open.length })}${rec ? T("team.formsRec", { n: rec }) : ""}` : T("team.noneYet")}</li>
        <li><a href="${withLang("/admin/site/#res")}">${T("team.res")}</a>${T("punct.colon")}${rs.length ? T("team.resSum", { n: rs.length, pub }) : T("team.noneYet")}</li>
        <li>${T("team.director")}${dirs.length ? esc(dirs.join(T("punct.list"))) : T("team.noDirector")}</li>
        ${pres ? `<li><a href="${withLang("/admin/people/#ws=" + encodeURIComponent("res:" + team))}">${T("team.people")}</a></li>`
          : wsLevel(me, "res:" + team) === "manage" ? `<li>${T("team.peopleHint")}</li>` : ""}
      </ul>
    </section>`;
  }).join("")}</div>`;
}

// 你的存取（2026-10-23 批 4）：一行一個工作區，印人看的名字、等級、一顆直達的按鈕。
// senior 不列（他本來就全部都有，只印一句）；什麼都沒被派的人看到「找你的 Director 或 Co-President」加各 team 公開的 Director。
// features 是頂欄那幾項（shared/nav.js 的 FEATURES 經 main.js 翻成 { label, desc, href }），在這裡印一次它們各是什麼。
export function accessHTML(me, todo, features) {
  const t = todo || {};
  const wsList = t.workspaces || [];
  const title = id => { const w = wsList.find(x => x.id === id); return w ? ((lang() === "zh" ? (w.title_zh || w.title_en) : (w.title_en || w.title_zh)) || id) : id; };
  const go = id => {
    if (id === "intern-passport") return [{ href: "/intern-passport/", label: T("hub.goWall") }, { href: "/admin/passports/#interns", label: T("hub.goAdmin") }];
    if (id === "passport") return [{ href: "/admin/passports/#cadre", label: T("hub.goAdmin") }];
    if (id === "apps" || id.startsWith("apps:")) return [{ href: "/admin/#forms", label: T("hub.goForms") }];
    if (id === "custom:marketing-requests") return [{ href: "/admin/#requests", label: T("hub.goRequests") }];
    if (id.startsWith("custom:event-")) return [{ href: "/admin/#events/" + encodeURIComponent(id.slice(13)), label: T("hub.goEvent") }];
    if (id.startsWith("res:")) return [{ href: "/admin/site/#res", label: T("hub.goRes") }];
    return [];
  };
  const feat = (features || []).length ? `<ul class="feat">${features.map(f => `<li><a href="${withLang(f.href)}">${esc(f.label)}</a>${T("punct.colon")}${esc(f.desc)}</li>`).join("")}</ul>` : "";
  let body;
  if (senior(me)) body = `<div class="row" style="margin:0 0 6px"><span class="tag open">${T("grid.byRank")}</span><span class="mini">${T("hub.accessSenior")}</span></div>`;
  else {
    const mine = Object.entries((me && me.ws) || {});
    if (mine.length) {
      // 照 team 分組（2026-10-24）：一段一個 team，底下是他在那個 team 的東西，名字用長名稱（「實習護照（格子與棋盤）」）。
      const wsOf = id => wsList.find(x => x.id === id) || { id };
      const rows = wsRows(mine.map(([id]) => wsOf(id)), [], null).filter(r => r.cells.length);
      body = `<ul class="flist access">${rows.map(r => `<li><div class="fhead"><b>${esc(r.label)}</b></div>${r.cells.map(w => {
        const lv = (me.ws || {})[w.id];
        return `<div class="row"><span>${esc(wsCellLabel(w))}</span><span class="tag">${esc(T("level." + lv))}</span>${go(w.id).map(g => `<a class="btn quiet sm" href="${withLang(g.href)}">${esc(g.label)}</a>`).join("")}</div>`; }).join("")}</li>`).join("")}</ul>
        <div class="mini">${T("ws.playNote")} ${T("ws.availNote")}</div>`;
    } else {
      const byTeam = new Map();
      for (const d of t.directors || []) if (d.team && /director/i.test(String(d.title_en || d.title_zh || ""))) { if (!byTeam.has(d.team)) byTeam.set(d.team, []); byTeam.get(d.team).push(nameOf(d)); }
      body = `<div class="note">${T("hub.accessNone")}</div>` + (byTeam.size
        ? `<ul class="teamblk-dirs">${[...byTeam.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([team, names]) => `<li><b>${esc(team.replace(/\s*Team$/i, ""))}</b>${T("punct.colon")}${esc(names.join(T("punct.list")))}</li>`).join("")}</ul>`
        : `<div class="mini">${T("hub.accessNoDirs")}</div>`);
    }
  }
  return body + feat;
}

export function hubHTML(me, pendingAll, canSend, busy, forms, todo, features) {
  const teams = senior(me) ? [T("rail.allTeams")] : splitTeams(me && me.team);
  const who = T("hub.who", { name: esc(me && me.name || ""), board: esc(boardName(me && me.board)),
    teams: teams.length ? esc(teams.join(T("punct.list"))) : T("rail.noTeam") });
  const cards = todoCards(me, forms, pendingAll, todo, canSend, busy);
  const allZero = cards.every(c => c.n === 0);
  return pageHead(T("hub.title"), who)
    + sectionHTML(T("hub.access"), accessHTML(me, todo, features), { id: "access" })
    + sectionHTML(T("hub.todo"), allZero ? `<div class="empty"><b>${T("hub.none")}</b><div>${T("hub.noneHint")}</div></div>`
        : `<div class="todo">${cards.map(kpiHTML).join("")}</div>`, { id: "todo" })
    + sectionHTML(T("hub.teams"), teamBlocksHTML(me, forms, todo), { id: "teams" });
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
// 行銷需求單（2026-10-31，docs/2026-10-24-行銷需求單.md）
// ═══════════════════════════════════════════════════════════════════════
// 兩頁：每一位幹部的「跟 Marketing 提需求」（表單加我送過的），Marketing 需求工作區的「行銷需求單」佇列。
// 資料都從 loadRequests() 來（RLS 決定看得到哪些），這裡只畫。
export const RQ_KINDS = ["poster", "post", "video", "other"];
export const RQ_STATUS = ["new", "in_progress", "done", "withdrawn"];
const rqDate = d => d ? String(d).slice(0, 10) : "";
const rqLinks = s => String(s || "").split(/\n/).map(x => x.trim()).filter(Boolean);
export function rqMine(rows, me) { return (rows || []).filter(r => me && r.requester === me.id); }
// 送單的表單加「我送過的」。d 是填到一半的值；mine 是我的單。
export function requestPageHTML(me, mine, d, msg, busy) {
  const v = d || {};
  const dis = busy ? " disabled" : "";
  const opt = (k, cur) => RQ_KINDS.map(x => `<option value="${x}"${(cur || "poster") === x ? " selected" : ""}>${esc(T("rq.kind." + x))}</option>`).join("");
  const row = r => `<li class="rq-row${r.status === "withdrawn" ? " off" : ""}">
      <div class="fhead"><b>${esc(r.title)}</b> <span class="tag${r.status === "done" ? " open" : r.status === "in_progress" ? " warn" : ""}">${esc(T("rq.st." + r.status))}</span> <span class="mini">${esc(T("rq.kind." + r.kind))}${r.needed_by ? `・${esc(T("rq.by", { d: rqDate(r.needed_by) }))}` : ""}</span></div>
      ${r.reply ? `<div class="fmeta rq-reply"><i>${T("rq.replyLabel")}</i>${esc(r.reply)}</div>` : ""}
      <div class="fmeta">${esc(T("rq.sent", { d: rqDate(r.created_at) }))}${r.status === "new" ? ` <button class="lnk" data-act="rq-withdraw" data-id="${esc(r.id)}"${dis}>${T("rq.withdraw")}</button>` : ""}</div>
    </li>`;
  return pageHead(T("rq.title"), T("rq.lede"))
    + msgHTML(msg)
    + sectionHTML(T("rq.formTitle"), `<div class="two">
        <label><i>${T("rq.kind")}</i><select id="rq-kind"${dis}>${opt("kind", v.kind)}</select></label>
        <label><i>${T("rq.needed")}</i><input id="rq-needed" type="date" value="${esc(v.needed_by || "")}"${dis}></label>
        <label class="wide"><i>${T("rq.titleF")}</i><input id="rq-title" value="${esc(v.title || "")}" placeholder="${esc(T("rq.titlePh"))}"${dis}></label>
        <label class="wide"><i>${T("rq.purpose")}</i><input id="rq-purpose" value="${esc(v.purpose || "")}" placeholder="${esc(T("rq.purposePh"))}"${dis}></label>
        <label class="wide"><i>${T("rq.brief")}</i><textarea id="rq-brief" style="min-height:120px" placeholder="${esc(T("rq.briefPh"))}"${dis}>${esc(v.brief || "")}</textarea></label>
        <label class="wide"><i>${T("rq.links")}</i><textarea id="rq-links" style="min-height:64px" placeholder="${esc(T("rq.linksPh"))}"${dis}>${esc(v.links || "")}</textarea></label>
        <label><i>${T("rq.contact")}</i><input id="rq-contact" value="${esc(v.contact || "")}" placeholder="${esc(T("rq.contactPh"))}"${dis}></label>
      </div>
      <div class="form-foot"><button class="btn" data-act="rq-submit"${dis}>${busy ? T("common.saving") : T("rq.submit")}</button><span class="mini">${T("rq.submitNote")}</span></div>`, { id: "rq-form" })
    + sectionHTML(T("rq.mineTitle"), (mine || []).length ? `<ul class="flist">${mine.map(row).join("")}</ul>` : emptyHTML(T("rq.mineNone"), T("rq.mineNoneHint")), { id: "rq-mine" });
}
// Marketing 的佇列。f = { status: "open"|"done"|"all", kind, q }，sel 是打開的那一張，canEdit 是「改」以上。
export function rqFilter(rows, f) {
  const o = Object.assign({ status: "open", kind: "", q: "" }, f || {});
  const q = String(o.q || "").trim().toLowerCase();
  return (rows || []).filter(r => (o.status === "all" || (o.status === "done" ? r.status === "done" : o.status === "withdrawn" ? r.status === "withdrawn" : (r.status === "new" || r.status === "in_progress")))
    && (!o.kind || r.kind === o.kind)
    && (!q || String(r.title || "").toLowerCase().includes(q) || String(r.purpose || "").toLowerCase().includes(q)));
}
export function requestsQueueHTML(rows, people, f, sel, canEdit, msg, busy) {
  const o = Object.assign({ status: "open", kind: "", q: "" }, f || {});
  const dis = busy ? " disabled" : "";
  const who = id => { const p = (people || []).find(x => x.id === id); return p ? mpName(p) : T("rq.someone"); };
  const open = sel ? (rows || []).find(r => r.id === sel) : null;
  if (open) {
    const r = open;
    return pageHead(esc(r.title), esc(T("rq.oneLede", { who: who(r.requester), d: rqDate(r.created_at) })), [], { act: "rq-back", label: T("rq.back") })
      + msgHTML(msg)
      + sectionHTML(T("rq.details"), `<dl class="rq-dl">
          <dt>${T("rq.kind")}</dt><dd>${esc(T("rq.kind." + r.kind))}</dd>
          <dt>${T("rq.needed")}</dt><dd>${r.needed_by ? esc(rqDate(r.needed_by)) : T("value.none")}</dd>
          <dt>${T("rq.purpose")}</dt><dd>${r.purpose ? esc(r.purpose) : T("value.none")}</dd>
          <dt>${T("rq.brief")}</dt><dd class="pre">${r.brief ? esc(r.brief) : T("value.none")}</dd>
          <dt>${T("rq.links")}</dt><dd>${(r.asset_links || []).length ? (r.asset_links || []).map(l => `<a href="${esc(l)}" target="_blank" rel="noopener">${esc(l)}</a>`).join("<br>") : T("value.none")}</dd>
          <dt>${T("rq.contact")}</dt><dd>${r.contact ? esc(r.contact) : T("value.none")}</dd>
        </dl>`)
      + sectionHTML(T("rq.handle"), r.status === "withdrawn" ? `<div class="note">${T("rq.withdrawnNote")}</div>` : canEdit ? `<div class="two">
          <label><i>${T("rq.status")}</i><select id="rq-status"${dis}>${["new", "in_progress", "done"].map(s => `<option value="${s}"${r.status === s ? " selected" : ""}>${esc(T("rq.st." + s))}</option>`).join("")}</select></label>
          <label class="wide"><i>${T("rq.reply")}</i><textarea id="rq-reply" style="min-height:90px" placeholder="${esc(T("rq.replyPh"))}"${dis}>${esc(r.reply || "")}</textarea></label>
        </div>
        <div class="form-foot"><button class="btn" data-act="rq-save" data-id="${esc(r.id)}"${dis}>${busy ? T("common.saving") : T("common.save")}</button>
          ${r.status !== "done" ? `<button class="btn ghost" data-act="rq-done" data-id="${esc(r.id)}"${dis}>${T("rq.markDone")}</button>` : ""}
          <span class="mini">${T("rq.doneNote")}</span></div>` : `<div class="note">${T("rq.viewOnly")}</div>`);
  }
  const shown = rqFilter(rows, o);
  const groups = [["new", shown.filter(r => r.status === "new")], ["in_progress", shown.filter(r => r.status === "in_progress")], ["done", shown.filter(r => r.status === "done")], ["withdrawn", shown.filter(r => r.status === "withdrawn")]].filter(g => g[1].length);
  const chip = (act, v, label, on) => `<button class="chip${on ? " on" : ""}" data-act="${act}" data-v="${esc(v)}">${esc(label)}</button>`;
  const row = r => `<li class="rq-row"><div class="fhead"><b><a href="#requests/${esc(r.id)}" data-act="rq-open" data-id="${esc(r.id)}">${esc(r.title)}</a></b> <span class="mini">${esc(T("rq.kind." + r.kind))}</span></div>
      <div class="fmeta">${esc(who(r.requester))}・${esc(T("rq.sent", { d: rqDate(r.created_at) }))}${r.needed_by ? `・${esc(T("rq.by", { d: rqDate(r.needed_by) }))}` : ""}${r.purpose ? `・${esc(r.purpose)}` : ""}</div></li>`;
  return pageHead(T("rq.queueTitle"), T("rq.queueLede"))
    + msgHTML(msg)
    + `<div class="chips" style="margin-bottom:8px">${[["open", T("rq.f.open")], ["done", T("rq.f.done")], ["withdrawn", T("rq.f.withdrawn")], ["all", T("rq.f.all")]].map(([v, l]) => chip("rq-fstatus", v, l, o.status === v)).join("")}</div>
       <div class="chips" style="margin-bottom:10px">${chip("rq-fkind", "", T("rq.f.anyKind"), !o.kind)}${RQ_KINDS.map(k => chip("rq-fkind", k, T("rq.kind." + k), o.kind === k)).join("")}</div>
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
const evDate = d => d ? String(d).slice(0, 16).replace("T", " ") : "";
// datetime-local 要的格式（本機時間）。
const evLocal = d => { if (!d) return ""; const x = new Date(d); if (isNaN(x)) return ""; const p = n => String(n).padStart(2, "0"); return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}T${p(x.getHours())}:${p(x.getMinutes())}`; };
export const evPast = e => !!(e && (e.ends_at || e.starts_at) && new Date(e.ends_at || e.starts_at) < new Date());
export const evTitle = e => (lang() === "zh" ? (e.title_zh || e.title_en) : (e.title_en || e.title_zh)) || e.slug;
// 清單：照狀態分段（準備好了 → 草稿 → 對外中 → 過去或撤下）。canCreate 是能開活動的人（senior 或某個 team 的資源「管」）。
export function eventsListHTML(events, me, teams, draft, msg, busy, canCreateTeams) {
  const dis = busy ? " disabled" : "";
  const d = draft || {};
  const ev = events || [];
  const groups = [["ready", ev.filter(e => e.status === "ready")], ["draft", ev.filter(e => e.status === "draft")],
    ["published", ev.filter(e => e.status === "published" && !evPast(e))], ["past", ev.filter(e => e.status === "archived" || (e.status === "published" && evPast(e)))]].filter(g => g[1].length);
  const row = e => `<li><div class="fhead"><b><a href="#events/${esc(e.slug)}" data-act="ev-open" data-slug="${esc(e.slug)}">${esc(evTitle(e))}</a></b> <span class="tag${e.status === "published" ? " open" : e.status === "ready" ? " warn" : e.status === "archived" ? "" : " draft"}">${esc(T("ev.st." + e.status))}</span></div>
      <div class="fmeta">${esc(e.team.replace(/\s*Team$/i, ""))}${e.starts_at ? `・${esc(evDate(e.starts_at))}` : ""}${e.place ? `・${esc(e.place)}` : ""}${e.form_id ? "" : `・${T("ev.noForm")}`}</div></li>`;
  const create = (canCreateTeams || []).length ? sectionHTML(T("ev.new"), `<div class="note">${T("ev.newWhat")}</div><div class="two">
      <label><i>${T("ev.team")}</i><select id="ev-team"${dis}>${canCreateTeams.map(t => `<option value="${esc(t)}"${d.team === t ? " selected" : ""}>${esc(t.replace(/\s*Team$/i, ""))}</option>`).join("")}</select></label>
      <label><i>${T("ev.slug")}</i><input id="ev-slug" value="${esc(d.slug || "")}" placeholder="winter-camp-2027" autocomplete="off"${dis}></label>
      <label><i>${T("ev.titleZh")}</i><input id="ev-tzh" value="${esc(d.title_zh || "")}" placeholder="2027 冬令營"${dis}></label>
      <label><i>${T("ev.titleEn")}</i><input id="ev-ten" value="${esc(d.title_en || "")}" placeholder="Winter Camp 2027"${dis}></label>
    </div>
    <label class="check"><input type="checkbox" id="ev-withform"${d.with_form === false ? "" : " checked"}${dis}><span>${T("ev.withForm")}</span></label>
    <div class="row"><button class="btn" data-act="ev-create"${dis}>${busy ? T("common.saving") : T("ev.createGo")}</button><span class="mini">${T("ev.createNote")}</span></div>`, { id: "ev-new" }) : "";
  return pageHead(T("ev.title"), T("ev.lede"))
    + msgHTML(msg)
    + (groups.length ? groups.map(([k, es]) => sectionHTML(`${esc(T("ev.g." + k))}<span class="hint">${es.length}</span>`, `<ul class="flist">${es.map(row).join("")}</ul>`)).join("")
        : emptyHTML(T("ev.none"), (canCreateTeams || []).length ? T("ev.noneHint") : T("ev.noneHintNo")))
    + create;
}
// 一場活動。e 是 events 那一列加 form（報名表那一列，可能 null）與 signed（報名數）。
// canEdit：工作區「改」以上；canManage：「管」以上；senior：Co-President 或 Senior Adviser。
export function eventEditHTML(e, form, signed, me, msg, busy) {
  const dis = busy ? " disabled" : "";
  const canEdit = canEditWs(me, e.workspace_id), canManage = wsLevel(me, e.workspace_id) === "manage", sen = senior(me);
  const ro = canEdit ? "" : " readonly";
  const st = e.status;
  const publicLink = `/events/?e=${encodeURIComponent(e.slug)}`;
  const statusLine = st === "published" ? T("ev.stLine.published", { who: esc(e.published_by_name || ""), d: esc(evDate(e.published_at)) })
    : st === "ready" ? T("ev.stLine.ready") : st === "archived" ? T("ev.stLine.archived") : T("ev.stLine.draft");
  const keys = `<div class="row" style="flex-wrap:wrap;gap:8px">
      ${st === "draft" && canManage ? `<button class="btn" data-act="ev-ready" data-id="${esc(e.id)}"${dis}>${T("ev.ready")}</button>` : ""}
      ${st === "ready" && canManage ? `<button class="btn ghost" data-act="ev-unready" data-id="${esc(e.id)}"${dis}>${T("ev.unready")}</button>` : ""}
      ${st === "ready" && sen ? `<button class="btn" data-act="ev-publish" data-id="${esc(e.id)}"${dis}>${T("ev.publish")}</button>` : ""}
      ${st === "ready" && !sen ? `<span class="mini">${T("ev.waitSenior")}</span>` : ""}
      ${st === "published" && sen ? `<button class="btn ghost" data-act="ev-unpublish" data-id="${esc(e.id)}"${dis}>${T("ev.unpublish")}</button>` : ""}
      ${st === "published" ? `<a class="btn ghost sm" href="${esc(publicLink)}" target="_blank" rel="noopener">${T("ev.seePublic")}</a>` : ""}
    </div>`;
  const links = `<ul class="plain">
      <li>${form ? `<a href="#" data-act="open-form" data-id="${esc(form.id)}">${T("ev.formEdit")}</a>${T("punct.colon")}${esc(T("status." + form.status))}${form.opens_at ? `・${esc(T("ev.opens", { d: evDate(form.opens_at) }))}` : ""}` : T("ev.noFormLine")}</li>
      ${form ? `<li><a href="#" data-act="open-apps" data-id="${esc(form.id)}">${T("ev.attendees", { n: signed == null ? "?" : signed })}</a>${e.capacity ? ` / ${esc(String(e.capacity))}` : ""}</li>
      <li><a href="#" data-act="open-checkin" data-id="${esc(form.id)}">${T("ev.checkin")}</a>・<a href="#" data-act="open-notice" data-id="${esc(form.id)}">${T("ev.notice")}</a></li>` : ""}
      ${canManage ? `<li><button class="lnk" data-act="members-open" data-ws="${esc(e.workspace_id)}" data-name="${esc(evTitle(e))}">${T("ev.members")}</button></li>` : ""}
    </ul>`;
  return pageHead(esc(evTitle(e)), `${esc(e.team.replace(/\s*Team$/i, ""))}・${esc(e.slug)}`, [], { act: "ev-back", label: T("ev.back") })
    + msgHTML(msg)
    + sectionHTML(T("ev.status"), `<div class="note">${statusLine}</div>${keys}`)
    + sectionHTML(T("ev.content"), `<div class="two">
        <label><i>${T("ev.titleZh")}</i><input id="ev-tzh" value="${esc(e.title_zh || "")}"${ro}${dis}></label>
        <label><i>${T("ev.titleEn")}</i><input id="ev-ten" value="${esc(e.title_en || "")}"${ro}${dis}></label>
        <label><i>${T("ev.sumZh")}</i><input id="ev-szh" value="${esc(e.summary_zh || "")}" placeholder="${esc(T("ev.sumPh"))}"${ro}${dis}></label>
        <label><i>${T("ev.sumEn")}</i><input id="ev-sen" value="${esc(e.summary_en || "")}"${ro}${dis}></label>
        <label class="wide"><i>${T("ev.bodyZh")}</i><textarea id="ev-bzh" style="min-height:120px"${ro}${dis}>${esc(e.body_zh || "")}</textarea></label>
        <label class="wide"><i>${T("ev.bodyEn")}</i><textarea id="ev-ben" style="min-height:120px"${ro}${dis}>${esc(e.body_en || "")}</textarea></label>
        <label><i>${T("ev.starts")}</i><input id="ev-starts" type="datetime-local" value="${esc(evLocal(e.starts_at))}"${ro}${dis}></label>
        <label><i>${T("ev.ends")}</i><input id="ev-ends" type="datetime-local" value="${esc(evLocal(e.ends_at))}"${ro}${dis}></label>
        <label><i>${T("ev.place")}</i><input id="ev-place" value="${esc(e.place || "")}"${ro}${dis}></label>
        <label><i>${T("ev.capacity")}</i><input id="ev-cap" type="number" min="0" value="${esc(String(e.capacity || 0))}"${ro}${dis}></label>
        <label class="wide"><i>${T("ev.cover")}</i><input id="ev-cover" value="${esc(e.cover_url || "")}" placeholder="https://…"${ro}${dis}></label>
      </div>
      ${e.cover_url ? `<img class="ev-cover" src="${esc(e.cover_url)}" alt="">` : ""}
      <label class="check"><input type="checkbox" id="ev-consent"${e.cover_consent ? " checked" : ""}${canEdit ? "" : " disabled"}${dis}><span>${T("ev.consent")}</span></label>
      <div class="mini">${T("ev.coverNote")}</div>
      ${canEdit ? `<div class="form-foot"><button class="btn" data-act="ev-save" data-id="${esc(e.id)}"${dis}>${busy ? T("common.saving") : T("common.save")}</button></div>` : `<div class="mini">${T("ev.readOnly")}</div>`}`)
    + sectionHTML(T("ev.signup"), links);
}

// ═══════════════════════════════════════════════════════════════════════
// 會議紀錄（2026-11-02，docs/2026-10-24-會議與排程.md）
// ═══════════════════════════════════════════════════════════════════════
// 清單（之後的、過去的）加一場會議（出席與回覆、Drive 連結、議程）。排會本身在 /availability/ 的看板上；這裡的「記一場會議」是補紀錄或手動排。
// 時間印瀏覽器的時區（後台的人自己的），旁邊不另印台北，避免兩個時間看混。
export const mtWhen = d => { if (!d) return ""; const x = new Date(d); if (isNaN(x)) return ""; const p = n => String(n).padStart(2, "0"); return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())} ${p(x.getHours())}:${p(x.getMinutes())}`; };
const mtLocal = d => { if (!d) return ""; const x = new Date(d); if (isNaN(x)) return ""; const p = n => String(n).padStart(2, "0"); return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}T${p(x.getHours())}:${p(x.getMinutes())}`; };
export const mtScope = s => s === "board" ? T("mt.board") : String(s || "").replace(/\s*Team$/i, "");
// 我能排哪些範圍：senior 全部；其他人是自己資源工作區「管」的 team。
export function mtScopes(me, teams) {
  if (senior(me)) return ["board"].concat(teams && teams.length ? teams : TEAM_LABELS);
  return Object.entries((me && me.ws) || {}).filter(([id, lv]) => id.startsWith("res:") && lv === "manage").map(([id]) => id.slice(4));
}
// meetings：[{ id, scope, title, starts_at, ends_at, agenda, doc_url, attendees: [{ user_id, status }] }]
export function meetingsListHTML(meetings, me, scopes, draft, people, msg, busy) {
  const now = new Date();
  const up = (meetings || []).filter(m => new Date(m.ends_at) >= now).sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
  const past = (meetings || []).filter(m => new Date(m.ends_at) < now).sort((a, b) => new Date(b.starts_at) - new Date(a.starts_at));
  const row = m => { const at = m.attendees || [], yes = at.filter(a => a.status === "accepted").length;
    return `<li><div class="fhead"><b><a href="#meetings/${esc(m.id)}" data-act="mt-open" data-id="${esc(m.id)}">${esc(m.title)}</a></b> <span class="mini">${esc(mtScope(m.scope))}</span></div>
      <div class="fmeta">${esc(mtWhen(m.starts_at))}・${esc(T("mt.people", { n: at.length, yes }))}${m.doc_url ? `・<a href="${esc(m.doc_url)}" target="_blank" rel="noopener">${T("mt.doc")}</a>` : ""}${me && at.some(a => a.user_id === me.id) ? `・<span class="tag${at.find(a => a.user_id === me.id).status === "accepted" ? " open" : ""}">${esc(T("mt.st." + at.find(a => a.user_id === me.id).status))}</span>` : ""}</div></li>`; };
  return pageHead(T("mt.title"), T("mt.lede"))
    + msgHTML(msg)
    + sectionHTML(`${T("mt.upcoming")}<span class="hint">${up.length}</span>`, up.length ? `<ul class="flist">${up.map(row).join("")}</ul>` : emptyHTML(T("mt.noneUp"), T("mt.noneUpHint")))
    + (past.length ? sectionHTML(`${T("mt.past")}<span class="hint">${past.length}</span>`, `<ul class="flist">${past.map(row).join("")}</ul>`) : "")
    + (scopes.length ? meetingFormHTML(null, draft, scopes, people, busy) : "");
}
// 記一場會議 / 改一場：m 是現有那一場（null 是新的），d 是填到一半的值（含 pk 勾人的狀態）。
export function meetingFormHTML(m, d, scopes, people, busy) {
  const v = Object.assign({ scope: scopes[0] || "board", title: "", starts_at: "", ends_at: "", agenda: "", doc_url: "" }, m || {}, d || {});
  const dis = busy ? " disabled" : "";
  const pk = (d && d.pk) || { ticked: (m ? (m.attendees || []).map(a => a.user_id) : []), q: "", mq: "", teams: [], level: "view" };
  return sectionHTML(m ? T("mt.edit") : T("mt.new"), `<div class="two">
      <label><i>${T("mt.scope")}</i><select id="mt-scope"${dis}>${scopes.map(s => `<option value="${esc(s)}"${v.scope === s ? " selected" : ""}>${esc(mtScope(s))}</option>`).join("")}</select></label>
      <label><i>${T("mt.titleF")}</i><input id="mt-title" value="${esc(v.title)}" placeholder="BT 會議"${dis}></label>
      <label><i>${T("mt.starts")}</i><input id="mt-starts" type="datetime-local" value="${esc(mtLocal(v.starts_at))}"${dis}></label>
      <label><i>${T("mt.ends")}</i><input id="mt-ends" type="datetime-local" value="${esc(mtLocal(v.ends_at))}"${dis}></label>
      <label class="wide"><i>${T("mt.agenda")}</i><input id="mt-agenda" value="${esc(v.agenda || "")}"${dis}></label>
      <label class="wide"><i>${T("mt.docF")}</i><input id="mt-doc" value="${esc(v.doc_url || "")}" placeholder="https://docs.google.com/…"${dis}></label>
    </div>
    <h3 class="sec-h">${T("mt.attendees")}</h3>
    ${membersAreaHTML("mt", { people: people || [], pk, busy, draft: true, all: true, titleLeft: n => T("mt.ticked", { n }) })}
    <div class="form-foot"><button class="btn" data-act="mt-save" data-id="${esc(m ? m.id : "")}"${dis}>${busy ? T("common.saving") : (m ? T("common.save") : T("mt.createGo"))}</button>
      ${m ? `<button class="btn ghost" data-act="mt-delete" data-id="${esc(m.id)}"${dis}>${T("mt.delete")}</button>` : ""}
      <span class="mini">${m ? T("mt.editNote") : T("mt.newNote")}</span></div>`, { id: "mt-form" });
}
// 一場會議：出席與回覆、連結、議程；能排的人底下可以改。
export function meetingHTML(m, me, people, canEdit, scopes, draft, msg, busy) {
  const who = id => { const p = (people || []).find(x => x.id === id); return p ? mpName(p) : T("rq.someone"); };
  const at = m.attendees || [];
  const grp = st => at.filter(a => a.status === st);
  const li = a => `<li>${nameBlock((people || []).find(x => x.id === a.user_id) || { name_en: who(a.user_id) })}${a.user_id === (me && me.id) ? ` <span class="tag">${T("mp.you")}</span>` : ""}</li>`;
  return pageHead(esc(m.title), `${esc(mtScope(m.scope))}・${esc(mtWhen(m.starts_at))}–${esc(mtWhen(m.ends_at).slice(11))}`, [], { act: "mt-back", label: T("mt.back") })
    + msgHTML(msg)
    + sectionHTML(T("mt.details"), `<dl class="rq-dl">
        <dt>${T("mt.agenda")}</dt><dd>${m.agenda ? esc(m.agenda) : T("value.none")}</dd>
        <dt>${T("mt.doc")}</dt><dd>${m.doc_url ? `<a href="${esc(m.doc_url)}" target="_blank" rel="noopener">${esc(m.doc_url)}</a>` : T("mt.noDoc")}</dd>
        <dt>${T("mt.when")}</dt><dd>${esc(mtWhen(m.starts_at))}–${esc(mtWhen(m.ends_at).slice(11))} <span class="mini">${T("mt.tzNote")}</span></dd>
      </dl>`)
    + sectionHTML(`${T("mt.attendees")}<span class="hint">${at.length}</span>`, at.length ? `<div class="mt-rsvp">
        <div><i>${T("mt.st.accepted")}（${grp("accepted").length}）</i><ul class="plain">${grp("accepted").map(li).join("") || `<li class="mini">${T("value.none")}</li>`}</ul></div>
        <div><i>${T("mt.st.invited")}（${grp("invited").length}）</i><ul class="plain">${grp("invited").map(li).join("") || `<li class="mini">${T("value.none")}</li>`}</ul></div>
        <div><i>${T("mt.st.declined")}（${grp("declined").length}）</i><ul class="plain">${grp("declined").map(li).join("") || `<li class="mini">${T("value.none")}</li>`}</ul></div>
      </div>` : `<div class="mini">${T("mt.nobody")}</div>`)
    + (canEdit ? meetingFormHTML(m, draft, scopes, people, busy) : "");
}
