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
export function listHTML(forms, canCreate, msg) {
  const rows = forms.map(f => {
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
        <button class="btn ghost sm" data-act="open-form" data-id="${esc(f.id)}">${
          canCreate ? "編輯這份表單" : "看這份表單"}</button>
      </div>
    </li>`;
  }).join("");

  return `<div class="card">
    <h2>申請管理</h2>
    <div class="sub">開申請表、看收到的申請。你看得到的是自己 team 的表單。</div>
    ${msg ? `<div class="wnote big">${esc(msg)}</div>` : ""}
    ${canCreate ? `<div class="row" style="margin-bottom:6px">
      <button class="btn" data-act="new-form">開一份新的申請表</button>
    </div>` : `<div class="wnote">你可以看，但改不動。開表單與審核是 Director 與 Co-President 的事。</div>`}
    ${forms.length ? `<ul class="flist">${rows}</ul>`
      : `<div class="empty">還沒有任何申請表。${canCreate ? "按上面那顆開第一份。" : ""}</div>`}
  </div>`;
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

  return `<div class="card">
    <div class="row" style="margin:0 0 14px">
      <button class="btn quiet" data-act="back-list">← 回清單</button>
    </div>
    <h2>${esc(form.title)}</h2>
    <div class="sub">${esc(form.team || "沒有指定 team")}
      ・<span class="tag ${st.tag}">${esc(st.label)}</span></div>
    ${msg ? `<div class="wnote big">${esc(msg)}</div>` : ""}

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

    ${canEdit ? `<div class="row">
      <button class="btn" data-act="save-form" ${busy ? "disabled" : ""}>${busy ? "存檔中…" : "存起來"}</button>
      <button class="btn quiet" data-act="del-form">刪掉這份表單</button>
    </div>` : ""}

    <h3 style="font-family:var(--display);font-size:22px;margin:30px 0 4px">題目</h3>
    <div class="mini" style="margin-bottom:10px">
      只有四種題型，不做跳題，也不做檔案上傳。申請人的姓名、學校、年級與 email
      系統自己會帶，<b>不用在這裡再問一次</b>。</div>
    ${questions.length ? `<ul class="qlist">${qs}</ul>`
      : `<div class="empty sm">還沒有題目。</div>`}
    ${canEdit ? `<div class="row">
      <button class="btn ghost sm" data-act="q-new">加一題</button>
    </div>` : ""}
  </div>`;
}

// ── 一題 ──────────────────────────────────────────────────────────────
// q 是 null 代表新增。
export function questionHTML(q, msg, busy) {
  const cur = q || { label: "", help: "", type: "short", required: false, options: [] };
  return `<div class="card">
    <div class="row" style="margin:0 0 14px">
      <button class="btn quiet" data-act="q-cancel">← 回這份表單</button>
    </div>
    <h2>${q ? "改一題" : "加一題"}</h2>
    <div class="sub">申請人看到的就是下面這幾個字。</div>
    ${msg ? `<div class="wnote big">${esc(msg)}</div>` : ""}
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
    <div class="row">
      <button class="btn" data-act="q-save" ${busy ? "disabled" : ""}>${busy ? "存檔中…" : "存這一題"}</button>
    </div>
  </div>`;
}

// 學員或還沒升級的人走到這裡。
// **不說「你沒有權限」**：他沒有做錯任何事，只是走錯地方。
export function notCadreHTML() {
  return `<div class="card">
    <h2>這一頁是給幹部用的</h2>
    <div class="sub">你的帳號是學員，申請管理看不到。</div>
    <div class="row"><a class="btn ghost" href="../app/">回我的帳號</a></div>
  </div>`;
}

export function downHTML() {
  return `<div class="card">
    <h2>資料庫休眠中</h2>
    <div class="wnote big" style="margin-top:16px">現在連不上資料庫。請寄信到 beyondtaiwan2020@gmail.com 請人恢復。</div>
    <div class="row"><button class="btn ghost" data-act="retry">再試一次</button></div>
  </div>`;
}
