// 後台首頁加「申請」那一組的畫面。**esc 是自己的一份**，不從別的資料夾 import
//（跟 app/ 與 availability/ 同一條規矩：資料夾之間不互相依賴）。
// 2026-10-15 後台拆成四個資料夾：資源、團隊頁、校友頁、信件文案搬去 admin/site/，
// 實習護照搬去 admin/passports/，邀請碼搬去 admin/people/。這裡只剩申請。
// 申請管理的畫面。**esc 是自己的一份**，不從別的資料夾 import
//（跟 app/ 與 availability/ 同一條規矩：資料夾之間不互相依賴）。
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export const TYPES = [
  { v: "short",  label: "短答",  hint: "一行字。姓名、學校、連結。" },
  { v: "long",   label: "長答",  hint: "一段字。「你為什麼想申請」那一類。" },
  { v: "single", label: "單選",  hint: "從幾個選項裡挑一個。" },
  { v: "multi",  label: "多選",  hint: "可以挑很多個。" },
];
export const STATUSES = [
  { v: "draft",  label: "還在寫", tag: "draft",  hint: "只有你的 team 看得到，外面看不到。" },
  { v: "open",   label: "開放中", tag: "open",   hint: "出現在 /apply/，任何人都申請得了。" },
  { v: "closed", label: "已關閉", tag: "closed", hint: "不再收件，收到的申請還在。" },
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
    <h2>開一份新的申請表</h2>
    <div class="sub">先取名字，題目進去再加。開出來是「還在寫」，外面看不到。</div>
    <div class="two">
      <label><i>名字（之後改得動）</i><input id="nf-title" value="${esc(d.title)}" placeholder="2027 暑期探索營" maxlength="80"${dis}></label>
      ${teams && teams.length
        ? `<label><i>哪一個 team 的</i><select id="nf-team"${dis}>${teams.map(t => `<option${t === d.team ? " selected" : ""}>${esc(t)}</option>`).join("")}</select></label>`
        : `<label><i>哪一個 team 的</i><input id="nf-team" value="${esc(d.team)}" disabled></label>`}
      <label><i>種類</i><select id="nf-kind"${dis}>
        <option value="program"${d.kind !== "board" ? " selected" : ""}>給高中生的計畫</option>
        <option value="board"${d.kind === "board" ? " selected" : ""}>幹部招募</option>
      </select></label>
    </div>
    <div class="row">
      <button class="btn" data-act="new-form-save"${dis}>${busy ? "建立中…" : "建立"}</button>
      <button class="btn ghost" data-act="new-form-cancel"${dis}>取消</button>
    </div>
  </div>`;
}

// 表單清單。newDraft 不是 null 就在清單上面展開內嵌表單；teams 與 myTeam 給那個表單用。
export function listHTML(forms, canCreate, msg, isPresident, newDraft, teams, myTeam, busy) {
  const row = f => {
    const st = statusOf(f.status);
    return `<li>
      <div class="fhead">
        <b>${esc(f.title)}</b>
        <span class="tag ${st.tag}">${esc(st.label)}</span>
        ${f.kind === "board" ? `<span class="tag">幹部招募</span>` : ""}
      </div>
      <div class="fmeta">${esc(f.team || "沒有指定 team")}
        ・收到 <span class="count">${f.counts.total}</span> 件${
          f.counts.received ? `，其中 ${f.counts.received} 件還沒處理` : ""}</div>
      <div class="row">
        <button class="btn ghost sm" data-act="open-apps" data-id="${esc(f.id)}">看收到的申請</button>
        <button class="btn quiet" data-act="open-form" data-id="${esc(f.id)}">${
          canCreate ? "改這份表單" : "看這份表單"}</button>
      </div>
    </li>`;
  };
  // Co-President 看得到全部，照 team 分段；其他人只看得到自己 team 的，不分段。
  let rows;
  if (isPresident && forms.length) {
    const byTeam = new Map();
    for (const f of forms) { const k = f.team || "沒有指定 team"; if (!byTeam.has(k)) byTeam.set(k, []); byTeam.get(k).push(f); }
    rows = [...byTeam.entries()].sort((a, b) => a[0].localeCompare(b[0]))
      .map(([team, fs]) => sectionHTML(esc(team.replace(/\s*Team$/i, "")), `<ul class="flist">${fs.map(row).join("")}</ul>`, { hint: `${fs.length} 份` })).join("");
  } else {
    rows = sectionHTML("", `<ul class="flist">${forms.map(row).join("")}</ul>`);
  }

  return pageHead("申請表", "開申請表、看收到的申請。你看得到的是自己 team 的表單。",
      canCreate && newDraft == null ? [{ act: "new-form", label: "開一份新的申請表", primary: true }] : [])
    + msgHTML(msg)
    + (canCreate && newDraft != null ? newFormHTML(newDraft, teams, myTeam, busy) : "")
    + (canCreate ? "" : `<div class="note">你可以看，但改不動。開表單與審核是 Director 與 Co-President 的事。</div>`)
    + (forms.length ? rows : sectionHTML("",
        emptyHTML("還沒有任何申請表", canCreate ? "開第一份，加幾題，狀態改成開放中，就會出現在 /apply/。" : "等 Director 或 Co-President 開第一份。",
                  canCreate ? { act: "new-form", label: "開一份新的申請表" } : null)));
}

// 一份表單裡的三個分頁（2026-10-19，批 3）：申請（審核）、設定（欄位與題目）、活動（簽到與寄信）。
// 位置固定在頁首底下，簽到跟行前信不再藏在底線字後面。view 是 main.js 的 S.view。
export function formTabsHTML(form, view) {
  const on = k => (k === "apps" && view === "apps") || (k === "form" && (view === "form" || view === "question")) ||
                  (k === "event" && (view === "checkin" || view === "notice"));
  const tab = (k, act, label) => `<button class="subtab${on(k) ? " on" : ""}" data-act="${act}" data-id="${esc(form.id)}"${on(k) ? ' aria-current="page"' : ""}>${label}</button>`;
  return `<nav class="subtabs" aria-label="這份表單">${tab("apps", "open-apps", "申請")}${tab("form", "open-form", "設定")}${tab("event", "open-checkin", "活動")}</nav>`;
}
// 一份表單共用的頁首：名字、狀態、team，返回清單。
export function formHeadHTML(form, view, count) {
  const st = statusOf(form.status);
  return pageHead(`${esc(form.title)} <span class="tag ${st.tag}">${esc(st.label)}</span>`,
      `${esc(form.team || "沒有指定 team")}${count != null ? `，收到 ${count} 件` : ""}`, [], { act: "back-list", label: "回申請表清單" })
    + formTabsHTML(form, view);
}

// ── 一份表單 ──────────────────────────────────────────────────────────
export function formHTML(form, questions, canEdit, teams, msg, busy) {
  const st = statusOf(form.status);
  const qs = questions.map((q, i) => `<li>
    <div class="qtop">
      ${canEdit ? `<div class="qmove">
        <button data-act="q-up" data-id="${esc(q.id)}" ${i === 0 ? "disabled" : ""} aria-label="往上移">↑</button>
        <button data-act="q-down" data-id="${esc(q.id)}" ${i === questions.length - 1 ? "disabled" : ""} aria-label="往下移">↓</button>
      </div>` : ""}
      <div class="qbody">
        <div class="qlabel">${esc(q.label)}${q.required ? " <span class=\"tag\">必填</span>" : ""}</div>
        <div class="qsub">${esc(typeOf(q.type).label)}${q.help ? "・" + esc(q.help) : ""}</div>
        ${(q.options || []).length
          ? `<div class="opts">${q.options.map(o => `<span>${esc(o)}</span>`).join("")}</div>` : ""}
      </div>
      ${canEdit ? `<div class="row" style="margin:0;flex:none">
        <button class="btn quiet" data-act="q-edit" data-id="${esc(q.id)}">改</button>
        <button class="btn quiet" data-act="q-del" data-id="${esc(q.id)}">刪</button>
      </div>` : ""}
    </div>
  </li>`).join("");

  const teamPick = teams && teams.length
    ? `<label><i>哪一個 team 的</i><select id="fteam"${canEdit ? "" : " disabled"}>
        ${teams.map(t => `<option${t === form.team ? " selected" : ""}>${esc(t)}</option>`).join("")}
      </select></label>`
    : "";

  return formHeadHTML(form, "form")
    + msgHTML(msg)
    + sectionHTML("設定", `
    <label><i>表單名稱</i><input id="ftitle" value="${esc(form.title)}"${canEdit ? "" : " disabled"}></label>
    <label><i>說明（申請人會看到，寫在題目上面）</i>
      <textarea id="fintro"${canEdit ? "" : " disabled"}>${esc(form.intro || "")}</textarea></label>
    <div class="two">
      <label><i>種類</i><select id="fkind"${canEdit ? "" : " disabled"}>
        <option value="program"${form.kind === "program" ? " selected" : ""}>給高中生的計畫</option>
        <option value="board"${form.kind === "board" ? " selected" : ""}>幹部招募</option>
      </select></label>
      <!-- 一份表單一種語言，題目沒有雙語欄位（2026-09-07 拍板）。
           要中英都收就開兩份表單。理由見 forms.lang 那條欄位註解。 -->
      <label><i>語言</i><select id="flang"${canEdit ? "" : " disabled"}>
        <option value="zh"${form.lang === "zh" ? " selected" : ""}>中文</option>
        <option value="en"${form.lang === "en" ? " selected" : ""}>English</option>
      </select></label>
      <label><i>開放時間（不填就是立刻）</i>
        <input id="fopen" type="datetime-local" value="${esc(dtVal(form.opens_at))}"${canEdit ? "" : " disabled"}></label>
      <label><i>截止時間（不填就是不自動關）</i>
        <input id="fclose" type="datetime-local" value="${esc(dtVal(form.closes_at))}"${canEdit ? "" : " disabled"}></label>
      <!-- 預計通知日：申請人的狀態會顯示成「已收到，X 月 X 日前會通知你」。
           2026-09-07 Paul 選了這句而不是「審核中」。**沒填就只剩「已收到」**，
           不要編一個日期出來。 -->
      <label><i>預計通知日</i>
        <input id="fnotify" type="date" value="${esc(dateVal(form.notify_by))}"${canEdit ? "" : " disabled"}></label>
      ${teamPick}
    </div>
    <label><i>面試預約連結（Cal.com）</i>
      <input id="fcal" value="${esc(form.interview_url || "")}" placeholder="https://cal.com/..."${canEdit ? "" : " disabled"}></label>

    <label><i>狀態</i><select id="fstatus"${canEdit ? "" : " disabled"}>
      ${STATUSES.map(s => `<option value="${s.v}"${form.status === s.v ? " selected" : ""}>${esc(s.label)}</option>`).join("")}
    </select></label>
    <div class="mini" style="margin:-6px 0 16px">${esc(st.hint)}</div>
    ${canEdit ? `<div class="form-foot">
      <button class="btn" data-act="save-form" ${busy ? "disabled" : ""}>${busy ? "存檔中…" : "存起來"}</button>
      <span class="sp"></span>
      <button class="btn quiet" data-act="del-form">刪掉這份表單</button>
    </div>` : ""}`)
    + sectionHTML("題目", `<div class="mini" style="margin-bottom:10px">
      只有四種題型，不做跳題，也不做檔案上傳。申請人的姓名、學校、年級與 email
      系統自己會帶，<b>不用在這裡再問一次</b>。</div>
    ${questions.length ? `<ul class="qlist">${qs}</ul>`
      : emptyHTML("還沒有題目", "一份表單至少要有一題才能開放。", canEdit ? { act: "q-new", label: "加一題" } : null)}
    ${canEdit && questions.length ? `<div class="row">
      <button class="btn ghost sm" data-act="q-new">加一題</button>
    </div>` : ""}`);
}

// ── 一題 ──────────────────────────────────────────────────────────────
// q 是 null 代表新增。
export function questionHTML(q, msg, busy) {
  const cur = q || { label: "", help: "", type: "short", required: false, options: [] };
  return pageHead(q ? "改一題" : "加一題", "申請人看到的就是下面這幾個字。", [], { act: "q-cancel", label: "回這份表單" })
    + msgHTML(msg)
    + sectionHTML("", `
    <label><i>題目</i><input id="qlabel" value="${esc(cur.label)}" placeholder="你為什麼想參加？"></label>
    <label><i>補充說明（選填，顯示在題目下面的小字）</i>
      <input id="qhelp" value="${esc(cur.help || "")}" placeholder="三五句話就好，不用寫成作文"></label>
    <label><i>題型</i><select id="qtype">
      ${TYPES.map(t => `<option value="${t.v}"${cur.type === t.v ? " selected" : ""}>${esc(t.label)}</option>`).join("")}
    </select></label>
    <div class="mini" style="margin:-6px 0 14px">${TYPES.map(t =>
      `${esc(t.label)}：${esc(t.hint)}`).join("<br>")}</div>
    <!-- 選項一行一個。**不做「按一下加一格」那種介面**：
         一行一個是所有人都會的操作，而且複製貼上一整串選項只要一次。 -->
    <label><i>選項（一行一個，只有單選與多選用得到）</i>
      <textarea id="qopts" placeholder="第一個選項&#10;第二個選項">${esc((cur.options || []).join("\n"))}</textarea></label>
    <label class="check" style="display:flex;gap:10px;align-items:center;font-size:14.5px">
      <input id="qreq" type="checkbox" style="width:18px;height:18px"${cur.required ? " checked" : ""}>
      <span>這一題必填</span>
    </label>
    <div class="form-foot">
      <button class="btn" data-act="q-save" ${busy ? "disabled" : ""}>${busy ? "存檔中…" : "存這一題"}</button>
      <button class="btn ghost" data-act="q-cancel">取消</button>
    </div>`);
}


// ═══════════════════════════════════════════════════════════════════════
// 批 4：審核
// ═══════════════════════════════════════════════════════════════════════
export const APP_STATUS = [
  { v: "received",  label: "還沒處理", tag: "" },
  { v: "interview", label: "邀請面試", tag: "closed" },
  { v: "accepted",  label: "錄取",     tag: "open" },
  { v: "rejected",  label: "婉拒",     tag: "draft" },
];
const appStatusOf = v => APP_STATUS.find(s => s.v === v) || APP_STATUS[0];

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
          aria-label="選取 ${esc(a.applicant_name)}"></label>` : ""}
        <div class="abody">
          <div class="fhead">
            <b>${esc(a.applicant_name)}</b>
            <span class="tag ${st.tag}">${esc(st.label)}</span>
          </div>
          <div class="fmeta">${[esc(a.applicant_school || "沒填學校"), esc(a.applicant_grade || ""),
            esc(a.applicant_email), fmtWhen(a.submitted_at) + " 送出"].filter(Boolean).join("・")}
            ${a.guardian_email ? "<br>家長信箱：" + esc(a.guardian_email) : ""}</div>
          <details class="ans">
            <summary>看他寫了什麼</summary>
            <dl>${questions.map(q => {
              const v = a.answers.get ? a.answers.get(q.id) : "";
              return `<dt>${esc(q.label)}</dt><dd>${v ? esc(v).replace(/\n/g, "<br>") : "<span class=\"mini\">（沒填）</span>"}</dd>`;
            }).join("")}</dl>
          </details>
        </div>
      </div>
    </li>`;
  }).join("");

  const bar = canDecide ? `<div class="bulk${sel.size ? " on" : ""}">
    <span>${sel.size ? `選了 ${sel.size} 個人` : "勾起來就可以一次處理很多人"}</span>
    <span class="btnav-sp"></span>
    <button class="btn ghost sm" data-act="pick-all">${
      shown.length && shown.every(a => sel.has(a.id)) ? "全部取消" : "全選這一頁"}</button>
    <button class="btn sm" data-act="decide" data-s="interview" ${sel.size && !busy ? "" : "disabled"}>邀請面試</button>
    <button class="btn sm" data-act="decide" data-s="accepted"  ${sel.size && !busy ? "" : "disabled"}>錄取</button>
    <button class="btn sm" data-act="decide" data-s="rejected"  ${sel.size && !busy ? "" : "disabled"}>婉拒</button>
  </div>` : "";

  return formHeadHTML(form, "apps", apps.length)
    + msgHTML(msg)
    + pendingHTML(pending, busy)
    + sectionHTML("", `<div class="chips" style="margin-bottom:4px">
      <button class="chip wide${filter === "all" ? " on" : ""}" data-act="filter" data-f="all">全部 ${apps.length}</button>
      ${APP_STATUS.map(s => `<button class="chip wide${filter === s.v ? " on" : ""}" data-act="filter" data-f="${s.v}">${esc(s.label)} ${counts[s.v]}</button>`).join("")}
    </div>
    ${bar}
    ${shown.length ? `<ul class="flist alist2">${rows}</ul>`
      : emptyHTML(apps.length ? "這一格裡沒有人" : "還沒有人申請",
                  apps.length ? "換一個篩選看看。" : "表單開放之後，送出的申請會出現在這裡。")}`);
}

// 還沒寄出去的信。**沒有待寄的信就完全不畫**，
// 一個永遠顯示「0 封待寄」的區塊只是雜訊，久了沒有人會看它。
function pendingHTML(pending, busy) {
  if (!pending || !pending.length) return "";
  const stuck = pending.filter(p => p.tries > 0);
  return `<div class="msg info"><span class="msg-k">信件</span><span>
    還有 <b>${pending.length}</b> 封信沒有寄出去。
    ${stuck.length ? `其中 ${stuck.length} 封試過但失敗了：${esc(stuck[0].error || "沒有錯誤訊息")}` : ""}
    <button class="btn ghost sm" data-act="send-mail" ${busy ? "disabled" : ""}>${busy ? "寄送中…" : "現在寄出去"}</button>
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
    + (canEdit ? "" : `<div class="note">你可以看，但點不了。簽到是 Director 與 Co-President 的事。</div>`)
    + sectionHTML("簽到", list.length ? `<ul class="flist">${list.map(a => `<li>
      <div class="arow">
        ${canEdit ? `<label class="apick"><input type="checkbox" data-act="checkin" data-id="${esc(a.id)}"
          ${a.checked_in_at ? "checked" : ""} ${busy ? "disabled" : ""}
          aria-label="${esc(a.applicant_name)} 到了"></label>` : ""}
        <div class="abody">
          <div class="fhead"><b>${esc(a.applicant_name)}</b>
            ${a.checked_in_at ? `<span class="tag open">已到</span>` : `<span class="tag">還沒到</span>`}</div>
          <div class="fmeta">${esc(a.applicant_school || "")}${a.applicant_grade ? "・" + esc(a.applicant_grade) : ""}</div>
        </div>
      </div>
    </li>`).join("")}</ul>` : emptyHTML("還沒有人錄取", "錄取之後，名單會出現在這裡，活動當天逐一點名。"),
      { hint: `錄取 ${list.length} 人，<b>到了 ${here} 人</b>`, actions: canEdit ? [{ act: "open-notice", label: "寄一封信給這些人", id: form.id }] : [] });
}

// 寄一封信給這場活動的人（行前信、通知）。
export const NOTICE_TO = [
  { v: "accepted",  label: "錄取的人" },
  { v: "interview", label: "邀請面試的人" },
  { v: "received",  label: "還沒處理的人" },
];

export function noticeHTML(form, apps, to, msg, busy) {
  const n = apps.filter(a => to.has(a.status)).length;
  return formHeadHTML(form, "notice")
    + msgHTML(msg)
    + sectionHTML("寄一封信", `<label><i>寄給誰</i></label>
    <div class="chips" style="margin:-8px 0 16px">
      ${NOTICE_TO.map(t => `<button class="chip wide${to.has(t.v) ? " on" : ""}"
        data-act="notice-to" data-t="${t.v}">${esc(t.label)}</button>`).join("")}
    </div>
    <label><i>主旨</i><input id="nsub" placeholder="探索營行前通知"></label>
    <!-- 純文字，沒有排版工具。理由跟 supabase/email-templates/README.md 一樣：
         版型越花俏越容易被判成垃圾信，而 SPF / DKIM / DMARC 三項全 pass
         是花了一整個階段換來的。 -->
    <label><i>內容（純文字，換行就是換行）</i>
      <textarea id="nbody" style="min-height:200px" placeholder="時間、地點、要帶什麼。"></textarea></label>
    <div class="note">收信人的名字與「不要回覆這封信」那一段系統會自己加，
      <b>你只要寫中間那一段</b>。</div>
    <div class="form-foot">
      <button class="btn" data-act="notice-send" ${n && !busy ? "" : "disabled"}>${
        busy ? "寄出中…" : n ? `寄給這 ${n} 個人` : "先選要寄給誰"}</button>
      <button class="btn ghost" data-act="open-checkin" data-id="${esc(form.id)}">回簽到</button>
    </div>`, { actions: [{ act: "open-checkin", label: "簽到", id: form.id }] });
}

// ── 後台的側欄與外殼（2026-10-19，後台第二次重整）──────────────────────
// 後台拆成四個資料夾，每一頁左邊都是這一條側欄。**四個資料夾各有一份這一段**
//（資料夾之間不互相 import，跟 esc() 同一條規矩），test/admin-hub.test.mjs
// 逐字比對四份一模一樣。漂移的表現是「在 A 頁看得到的分頁，到 B 頁不見了」，不會報錯。
//
// GROUPS 是四組，ITEMS 是每一組底下的分頁。who 是「誰看得到」，
// 只決定側欄上那一行是連結還是淡字。**真正的門在每個資料夾的 main.js 開頁第一句，
// 以及資料庫的函式與 RLS。**
export const GROUPS = [
  { key: "forms",     label: "申請",     href: "/admin/",           who: "cadre",        hint: "申請表、審核、簽到、行前信" },
  { key: "site",      label: "對外",     href: "/admin/site/",      who: "cadre",        hint: "資源、團隊頁、校友頁、信件文案" },
  { key: "passports", label: "護照",     href: "/admin/passports/", who: "intern-staff", hint: "兩本護照的格子" },
  { key: "people",    label: "人與權限", href: "/admin/people/",    who: "president",    hint: "邀請碼、職位、team" },
];
// 側欄上每一行。要加一個新的後台分頁，就在這裡加一行（四份都要加），
// 然後在那一組的 ui.js 加一個畫面函式、main.js 接 data-act="tab" data-t="<key>"。
export const ITEMS = [
  { group: "forms",     key: "home",    label: "首頁",     who: "cadre" },
  { group: "forms",     key: "forms",   label: "申請表",   who: "cadre" },
  { group: "site",      key: "res",     label: "資源",     who: "cadre" },
  { group: "site",      key: "team",    label: "團隊頁",   who: "president" },
  { group: "site",      key: "stories", label: "校友頁",   who: "president" },
  { group: "site",      key: "mail",    label: "信件文案", who: "president" },
  { group: "passports", key: "interns", label: "實習護照", who: "intern-staff" },
  { group: "passports", key: "cadre",   label: "幹部護照", who: "president" },
  { group: "people",    key: "roster",  label: "幹部名單", who: "president" },
  { group: "people",    key: "invites", label: "邀請碼",   who: "president" },
];
const WHY = { president: "只有 Co-President 進得去", "intern-staff": "只有 Internship team 的幹部與 Co-President 進得去" };
// me = { role, board, team, name }。team 可能是逗號字串（一個人在好幾個 team）。
function allowed(who, me) {
  if (!me || me.role !== "cadre") return false;
  if (who === "cadre") return true;
  if (who === "president") return me.board === "president";
  if (who === "intern-staff") return me.board === "president" || String(me.team || "").includes("Internship Team");
  return false;
}
export function canEnter(g, me) { return allowed(g.who, me); }
export function canSee(item, me) { return allowed(item.who, me); }
const BOARD_ZH = { member: "一般幹部", director: "Director", president: "Co-President" };

// 側欄。group 是現在在哪一組，tab 是哪一個分頁，counts 是 { <key>: 數字 }（有才顯示，批 2 的首頁會餵）。
// 同一組裡的分頁是 data-act="tab"（不重新載入頁面）；別組的是一般連結，帶 #key 讓那一頁開在對的分頁。
export function railHTML(group, tab, me, counts) {
  const c = counts || {};
  const item = it => {
    const on = it.group === group && it.key === tab;
    const n = c[it.key] ? `<span class="rail-count">${esc(String(c[it.key]))}</span>` : "";
    if (!canSee(it, me)) return `<span class="rail-item off">${esc(it.label)}</span>`;
    const href = it.group === group ? `#${it.key}` : `${GROUPS.find(g => g.key === it.group).href}#${it.key}`;
    return `<a class="rail-item${on ? " on" : ""}" href="${href}"${it.group === group ? ` data-act="tab" data-t="${it.key}"` : ""}${
      on ? ' aria-current="page"' : ""}>${esc(it.label)}${n}</a>`;
  };
  const home = ITEMS.find(i => i.key === "home");
  const groups = GROUPS.map(g => {
    const ok = canEnter(g, me);
    const rows = ITEMS.filter(i => i.group === g.key && i.key !== "home");
    return `<div class="rail-group${ok ? "" : " off"}">${esc(g.label)}${ok ? "" : `<span class="why">${esc(WHY[g.who] || "")}</span>`}</div>${
      ok ? rows.map(item).join("") : rows.map(i => `<span class="rail-item off">${esc(i.label)}</span>`).join("")}`;
  }).join("");
  const teams = String(me && me.team || "").split(/[,、;；]/).map(s => s.trim()).filter(Boolean);
  return `<input class="rail-toggle" type="checkbox" id="rail-toggle" aria-label="展開後台選單">
  <label class="rail-burger" for="rail-toggle">後台選單</label>
  <nav class="rail" aria-label="後台的分組">
    <div class="rail-me"><b>${esc(me && me.name || "")}</b>
      <span>${esc(BOARD_ZH[me && me.board] || "一般幹部")}${teams.length ? "・" + esc(teams.join("、")) : "・還沒填 team"}</span></div>
    ${item(home)}
    ${groups}
    <div class="rail-foot">對外七頁（首頁、關於、計畫、做過什麼、合作、團隊、Alumni）的文字在 HTML 檔裡，不在後台。改法見 README「對外的內容頁」。</div>
  </nav>`;
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
// 訊息。做成了是綠的，沒做成是橘的。判斷靠訊息開頭那幾個字（「存不起來：」「載不到：」這一類是沒做成）。
export function msgKind(msg) {
  const s = String(msg || "");
  if (!s) return "";
  if (/(不了|不到|不起來|不出來|不掉|失敗|沒寄成功)[：:]/.test(s) || /要(填|寫|有)|不能|至少|沒有改到|都要|開不出|還沒有題目|先選|^沒有/.test(s)) return "err";
  return "ok";
}
export function msgHTML(msg) {
  const k = msgKind(msg);
  if (!k) return "";
  return `<div class="msg ${k}" role="status"><span class="msg-k">${k === "err" ? "沒成" : "好了"}</span><span>${esc(msg)}</span></div>`;
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
export function skeletonHTML() { return `<div class="skeleton" aria-label="載入中"><i></i><i></i><i></i></div>`; }

// 舊名字：這一組底下的分頁。側欄用同一份 ITEMS 畫，這一支留給測試與 scripts/mobile-fixtures.mjs。
export function tabsHTML(tab, isPresident) {
  const me = { role: "cadre", board: isPresident ? "president" : "member", team: "Internship Team" };
  return ITEMS.filter(i => i.group === "forms" && i.key !== "home" && canSee(i, me))
    .map(i => `<a class="rail-item${i.key === tab ? " on" : ""}" href="#${i.key}" data-act="tab" data-t="${i.key}">${esc(i.label)}</a>`).join("");
}

// 後台首頁（2026-10-19，後台第二次重整批 2）：三塊。
//   1. 你是誰、管到哪（頁首那一句）。
//   2. 今天要處理的事：每張卡一個數字、一句話、一顆直達的按鈕。**只畫你管得到的**，
//      數字 0 的卡還是畫但變淡；整排都是 0 收成一行；載不到寫「載不到」，不寫 0。
//   3. 你的 team：你在幾個 team 就幾段，Co-President 看到全部。
// forms 是 loadForms()，pendingAll 是 loadPendingAll()，todo 是 loadTodo()（null 代表還沒載）。
// 這一頁不碰 entries、不列 intern 的名字：intern 那張卡只有筆數。
const BOARD_ZH2 = { member: "一般幹部", director: "Director", president: "Co-President" };
const splitTeams = raw => String(raw || "").split(/[,、;；]/).map(s => s.trim()).filter(Boolean);
const nameOf = p => String(p.name_zh || "").trim() || String(p.name_en || "").trim() || "（沒有名字）";

export function todoCards(me, forms, pendingAll, todo, canSend, busy) {
  const t = todo || {};
  const pres = !!me && me.board === "president";
  const istaff = pres || String(me && me.team || "").includes("Internship Team");
  const received = (forms || []).reduce((n, f) => n + (f.counts ? f.counts.received : 0), 0);
  const firstForm = (forms || []).find(f => f.counts && f.counts.received > 0);
  const pending = pendingAll || [];
  const stuck = pending.filter(p => p.tries > 0);
  const cards = [];
  cards.push({ n: received, label: "還沒處理的申請", unit: "件",
    hint: received ? `${firstForm ? esc(firstForm.title) : ""}` : "沒有要處理的",
    act: firstForm ? { act: "open-apps", id: firstForm.id, label: "去審" } : null });
  cards.push({ n: pending.length, label: "還沒寄出去的信", unit: "封",
    hint: pending.length ? (stuck.length ? `其中 ${stuck.length} 封試過但失敗了：${esc(stuck[0].error || "沒有錯誤訊息")}` : "狀態改了就會排一封信") : "全部寄出去了",
    act: pending.length && canSend ? { act: "send-mail-all", label: busy ? "寄送中…" : "現在寄出去", disabled: busy } : null });
  if (pres) {
    cards.push({ n: t.team === null ? null : (t.team || []).length, label: "等你核可上團隊頁", unit: "人",
      hint: "本人勾了，等第二把鑰匙", href: "/admin/site/#team", go: "去核可" });
    const st = t.stories === null ? null : (t.stories || []).filter(r => !r.story_approved).length;
    cards.push({ n: st, label: "等你核可上校友頁", unit: "人", hint: "故事填完也勾了同意", href: "/admin/site/#stories", go: "去核可" });
  }
  if (istaff) {
    const interns = t.interns === null ? null : (t.interns || []).length;
    const stamps = (t.stamps || []).length;
    cards.push({ n: interns, label: "這一屆的 intern", unit: "位",
      hint: interns ? `平均蓋了 ${(stamps / interns).toFixed(1)} 格` : "還沒有 intern 進來", href: "/admin/passports/#interns", go: "看格子" });
  }
  if (pres) {
    const ro = t.roster;
    const noTeam = ro ? ro.filter(p => !splitTeams(p.team).length).length : null;
    cards.push({ n: ro === null ? null : (ro || []).length, label: "幹部", unit: "位",
      hint: noTeam ? `其中 ${noTeam} 位還沒填 team` : "team 都填了", href: "/admin/people/#roster", go: "看名單" });
  }
  return cards;
}

function kpiHTML(c) {
  const gone = c.n === null;
  const zero = !gone && !c.n;
  const act = c.act ? `<button class="btn ghost sm" data-act="${esc(c.act.act)}"${c.act.id ? ` data-id="${esc(c.act.id)}"` : ""}${c.act.disabled ? " disabled" : ""}>${esc(c.act.label)}</button>`
    : c.href && !zero && !gone ? `<a class="btn ghost sm" href="${esc(c.href)}">${esc(c.go || "去看")}</a>` : "";
  return `<div class="kpi${zero ? " zero" : ""}${gone ? " gone" : ""}">
    <div class="kpi-n">${gone ? "載不到" : esc(String(c.n))}<span class="kpi-u">${gone ? "" : esc(c.unit)}</span></div>
    <div class="kpi-l">${esc(c.label)}</div>
    <div class="kpi-h">${gone ? "重新整理再試一次" : c.hint}</div>
    ${act ? `<div class="kpi-a">${act}</div>` : ""}
  </div>`;
}

// 你的 team：每個 team 一段，三行：開放中的申請表、資源、Director。
export function teamBlocksHTML(me, forms, todo) {
  const t = todo || {};
  const pres = !!me && me.board === "president";
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
  if (!teams.length) return emptyHTML("你還沒有 team", "到「設定」勾你的 team，這裡就會有你的位置。");
  return `<div class="teamlist">${teams.map(team => {
    const fs = (forms || []).filter(f => f.team === team);
    const open = fs.filter(f => f.status === "open");
    const rec = fs.reduce((n, f) => n + (f.counts ? f.counts.received : 0), 0);
    const rs = res.filter(r => r.team === team);
    const pub = rs.filter(r => r.status === "published").length;
    const dirs = roster.filter(p => p.board_role === "director" && splitTeams(p.team).includes(team)).map(nameOf);
    const members = roster.filter(p => splitTeams(p.team).includes(team)).length;
    return `<section class="teamblk">
      <h3>${esc(team.replace(/\s*Team$/i, ""))}<span class="hint">${members ? `${members} 人` : ""}</span></h3>
      <ul>
        <li><a href="/admin/#forms">申請表</a>：${fs.length ? `${fs.length} 份，${open.length} 份開放中${rec ? `，<b>${rec} 件還沒處理</b>` : ""}` : "還沒有"}</li>
        <li><a href="/admin/site/#res">資源</a>：${rs.length ? `${rs.length} 條，${pub} 條已發布` : "還沒有"}</li>
        <li>Director：${dirs.length ? esc(dirs.join("、")) : "還沒指定"}</li>
      </ul>
    </section>`;
  }).join("")}</div>`;
}

export function hubHTML(me, pendingAll, canSend, busy, forms, todo) {
  const teams = splitTeams(me && me.team);
  const who = `${esc(me && me.name || "")}，${esc(BOARD_ZH2[me && me.board] || "一般幹部")}${teams.length ? "，" + esc(teams.join("、")) : "，還沒填 team"}。你管得到的事都在這一頁。`;
  const cards = todoCards(me, forms, pendingAll, todo, canSend, busy);
  const allZero = cards.every(c => c.n === 0);
  return pageHead("首頁", who)
    + sectionHTML("今天要處理的事", allZero ? `<div class="empty"><b>今天沒有待辦</b><div>申請、信件、核可都處理完了。</div></div>`
        : `<div class="todo">${cards.map(kpiHTML).join("")}</div>`, { id: "todo" })
    + sectionHTML("你的 team", teamBlocksHTML(me, forms, todo), { id: "teams" });
}

// 學員或還沒升級的人走到這裡。**不說「你沒有權限」**：他沒有做錯任何事，只是走錯地方。
export function notCadreHTML() {
  return pageHead("這一頁是給幹部用的", "你的帳號是學員，後台看不到。", [{ label: "回我的帳號", href: "../app/" }]);
}

export function downHTML() {
  return pageHead("資料庫休眠中", "現在連不上資料庫。請寄信到 beyondtaiwan2020@gmail.com 請人恢復。", [{ act: "retry", label: "再試一次" }]);
}
