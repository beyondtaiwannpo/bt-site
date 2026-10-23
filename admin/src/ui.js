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
  // Co-President 看得到全部，照 team 分段；其他人只看得到自己 team 的，不分段。
  let rows;
  if (isPresident && forms.length) {
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
  { key: "site",      label: { zh: "對外",     en: "Public site" },  href: "/admin/site/",      who: "cadre",        hint: { zh: "資源、團隊頁、校友頁、信件文案", en: "Resources, team page, alumni page, email copy" } },
  { key: "passports", label: { zh: "護照",     en: "Passports" },    href: "/admin/passports/", who: "ws:passport|intern-passport", hint: { zh: "兩本護照的格子", en: "Boxes in both passports" } },
  { key: "people",    label: { zh: "人與權限", en: "People" },       href: "/admin/people/",    who: "senior",       hint: { zh: "名單、職級、工作區、屆別、邀請碼", en: "Roster, ranks, workspaces, terms, invite codes" } },
];
// 側欄上每一行。要加一個新的後台分頁，就在這裡加一行（四份都要加），
// 然後在那一組的 ui.js 加一個畫面函式、main.js 接 data-act="tab" data-t="<key>"。
export const ITEMS = [
  { group: "forms",     key: "home",    label: { zh: "首頁",     en: "Home" },            who: "cadre" },
  { group: "forms",     key: "forms",   label: { zh: "申請表",   en: "Forms" },           who: "cadre" },
  { group: "site",      key: "res",     label: { zh: "資源",     en: "Resources" },       who: "cadre" },
  { group: "site",      key: "team",    label: { zh: "團隊頁",   en: "Team page" },       who: "senior" },
  { group: "site",      key: "stories", label: { zh: "校友頁",   en: "Alumni page" },     who: "senior" },
  { group: "site",      key: "mail",    label: { zh: "信件文案", en: "Email copy" },      who: "senior" },
  { group: "passports", key: "interns", label: { zh: "實習護照", en: "Intern passport" }, who: "ws:intern-passport" },
  { group: "passports", key: "board",   label: { zh: "棋盤",     en: "Board" },           who: "ws:intern-passport" },
  { group: "passports", key: "cadre",   label: { zh: "幹部護照", en: "Cadre passport" },  who: "ws:passport" },
  { group: "passports", key: "cities",  label: { zh: "城市",     en: "Cities" },          who: "ws:passport" },
  { group: "people",    key: "roster",     label: { zh: "幹部名單", en: "Roster" },          who: "senior" },
  { group: "people",    key: "workspaces", label: { zh: "工作區",   en: "Workspaces" },      who: "senior" },
  { group: "people",    key: "terms",      label: { zh: "屆別",     en: "Terms" },           who: "senior" },
  { group: "people",    key: "invites",    label: { zh: "邀請碼",   en: "Invite codes" },    who: "president" },
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
const BOARD_KEY = { member: "board.member", director: "board.director", senior_adviser: "board.senior", president: "board.president" };
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
    const rows = ITEMS.filter(i => i.group === g.key && i.key !== "home");
    return `<div class="rail-group${ok ? "" : " off"}">${esc(T(g.label))}${ok ? "" : `<span class="why">${esc(T(WHY[g.who]) || "")}</span>`}</div>${
      ok ? rows.map(item).join("") : rows.map(i => `<span class="rail-item off">${esc(T(i.label))}</span>`).join("")}`;
  }).join("");
  const teams = String(me && me.team || "").split(/[,、;；]/).map(s => s.trim()).filter(Boolean);
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
export function toast(msg, undo) {
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
  if (kind === "ok") setTimeout(gone, u ? 9000 : 6000);
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
}
// ── 成員分頁（2026-10-23，第三次重整批 3）────────────────────────────
// 對一個工作區是「管」的人（Director）在那個東西自己的頁面上（Forms、Resources、兩本護照後台）看到誰在裡面、加人、改等級、移出，
// 不用進 /admin/people/。讀 workspace_members()（where 裡有 can_manage）、寫 assign() / unassign()（第一句 can_manage），
// 沒有新的資料庫函式。找人的清單從 profiles 讀（幹部本來就讀得到所有幹部的名字），不讀 email。四份一模一樣（測試逐字比對）。
// mp = { ws, name, rows: workspace_members 回的, cadres: [{ id, name_zh, name_en, board_role }], meId, q, level }
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
// 這一頁該列哪幾個「誰在做…」的入口：senior 看所有這一類的工作區，其他人只有自己是「管」的那幾個。
// workspaces 是 workspaces 表（id、kind、title_zh、title_en、active）；prefix 是 "apps:" 或 "res:"，或整個代號（"intern-passport"）。
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
  const dis = busy ? " disabled" : "";
  const LV = ["view", "edit", "manage"];
  const lv = l => T("level." + l);
  const rows = mp.rows || [];
  const inWs = new Set(rows.map(r => r.user_id));
  const row = r => `<tr><td class="t-main"><b>${esc(mpName(r))}</b> <span class="tag">${esc(boardName(r.board_role))}</span>${r.user_id === mp.meId ? ` <span class="tag">${T("mp.you")}</span>` : ""}</td>
    <td><select data-act="members-level" data-id="${esc(r.user_id)}" aria-label="${esc(T("mp.level"))}"${dis}>${LV.map(l => `<option value="${l}"${r.level === l ? " selected" : ""}>${esc(lv(l))}</option>`).join("")}</select></td>
    <td class="t-act"><button class="btn quiet sm" data-act="members-unassign" data-id="${esc(r.user_id)}"${dis}>${T("mp.remove")}</button></td></tr>`;
  return pageHead(T("mp.title", { name: esc(mp.name || mp.ws) }), T("mp.lede"), [], { act: "members-back", label: T("mp.back") })
    + msgHTML(msg)
    + `<div class="note">${T("mp.levels")}</div>`
    + sectionHTML(T("mp.list"), rows.length
        ? `<table class="table"><thead><tr><th>${T("mp.name")}</th><th>${T("mp.level")}</th><th></th></tr></thead><tbody>${rows.map(row).join("")}</tbody></table>`
        : emptyHTML(T("mp.nobody"), T("mp.nobodyHint")))
    + sectionHTML(T("mp.add"), `<div class="two">
        <label><i>${T("mp.who")}</i><input id="mp-q" list="mp-people" value="${esc(mp.q || "")}" placeholder="${esc(T("mp.whoPh"))}" autocomplete="off"${dis}>
          <datalist id="mp-people">${(mp.cadres || []).filter(p => !inWs.has(p.id)).map(p => `<option value="${esc(mpName(p))}">`).join("")}</datalist></label>
        <label><i>${T("mp.level")}</i><select id="mp-level"${dis}>${LV.map(l => `<option value="${l}"${(mp.level || "view") === l ? " selected" : ""}>${esc(lv(l))}</option>`).join("")}</select></label>
      </div>
      <div class="row"><button class="btn" data-act="members-assign" data-ws="${esc(mp.ws)}"${dis}>${busy ? T("common.saving") : T("mp.addGo")}</button></div>
      <div class="mini">${T("mp.addNote")}</div>`);
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
    act: firstForm ? { act: "open-apps", id: firstForm.id, label: T("card.apps.go") } : null });
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
  let teams;
  if (pres) {
    const set = new Set();
    for (const p of roster) for (const x of splitTeams(p.team)) set.add(x);
    for (const f of forms || []) if (f.team) set.add(f.team);
    for (const r of res) if (r.team) set.add(r.team);
    teams = [...set].sort((a, b) => a.localeCompare(b));
  } else {
    teams = splitTeams(me && me.team);
  }
  if (!teams.length) return emptyHTML(T("team.none"), T("team.noneHint"));
  return `<div class="teamlist">${teams.map(team => {
    const fs = (forms || []).filter(f => f.team === team);
    const open = fs.filter(f => f.status === "open");
    const rec = fs.reduce((n, f) => n + (f.counts ? f.counts.received : 0), 0);
    const rs = res.filter(r => r.team === team);
    const pub = rs.filter(r => r.status === "published").length;
    const dirs = roster.filter(p => p.board_role === "director" && splitTeams(p.team).includes(team)).map(nameOf);
    const members = roster.filter(p => splitTeams(p.team).includes(team)).length;
    return `<section class="teamblk">
      <h3>${esc(team.replace(/\s*Team$/i, ""))}<span class="hint">${members ? T("team.members", { n: members }) : ""}</span></h3>
      <ul>
        <li><a href="${withLang("/admin/#forms")}">${T("team.forms")}</a>${T("punct.colon")}${fs.length ? `${T("team.formsSum", { n: fs.length, open: open.length })}${rec ? T("team.formsRec", { n: rec }) : ""}` : T("team.noneYet")}</li>
        <li><a href="${withLang("/admin/site/#res")}">${T("team.res")}</a>${T("punct.colon")}${rs.length ? T("team.resSum", { n: rs.length, pub }) : T("team.noneYet")}</li>
        <li>${T("team.director")}${dirs.length ? esc(dirs.join(T("punct.list"))) : T("team.noDirector")}</li>
      </ul>
    </section>`;
  }).join("")}</div>`;
}

export function hubHTML(me, pendingAll, canSend, busy, forms, todo) {
  const teams = splitTeams(me && me.team);
  const who = T("hub.who", { name: esc(me && me.name || ""), board: esc(boardName(me && me.board)),
    teams: teams.length ? esc(teams.join(T("punct.list"))) : T("rail.noTeam") });
  const cards = todoCards(me, forms, pendingAll, todo, canSend, busy);
  const allZero = cards.every(c => c.n === 0);
  return pageHead(T("hub.title"), who)
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
