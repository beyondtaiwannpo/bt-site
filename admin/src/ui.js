// 申請管理的畫面。**esc 是自己的一份**，不從別的資料夾 import
//（跟 app/ 與 availability/ 同一條規矩：資料夾之間不互相依賴）。
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// 一個人在畫面上要顯示的兩個名字（2026-09-10）。**同一份規則在
// passport/src/ui.js 與 availability/src/data.js 也各有一份**
// （資料夾之間不互相 import）。三份漂移的表現是「同一個人在三個地方顯示的名字
// 不一樣」，不會報錯。test/names.test.mjs 拿同一張輸入表逐項比對三份。
export function namesOf(p) {
  const zh = String(p.name_zh || "").trim();
  const en = String(p.name_en || "").trim();
  return {
    name: zh || en || "（沒有名字）",
    alt: zh && en && zh !== en ? en : "",
  };
}

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
export function listHTML(forms, canCreate, msg, isPresident) {
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
        <button class="btn ghost sm" data-act="open-apps" data-id="${esc(f.id)}">看收到的申請</button>
        <button class="btn quiet" data-act="open-form" data-id="${esc(f.id)}">${
          canCreate ? "改這份表單" : "看這份表單"}</button>
      </div>
    </li>`;
  }).join("");

  return `<div class="card">
    <h2>申請管理</h2>
    <div class="sub">開申請表、看收到的申請。你看得到的是自己 team 的表單。</div>
    ${msg ? `<div class="wnote big">${esc(msg)}</div>` : ""}
    ${tabsHTML("forms", isPresident)}
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

  return `<div class="card">
    <div class="row" style="margin:0 0 14px">
      <button class="btn quiet" data-act="back-list">← 回清單</button>
      <button class="btn quiet" data-act="open-form" data-id="${esc(form.id)}">改這份表單</button>
      <button class="btn quiet" data-act="open-checkin" data-id="${esc(form.id)}">簽到</button>
      <button class="btn quiet" data-act="open-notice" data-id="${esc(form.id)}">寄一封信</button>
    </div>
    <h2>${esc(form.title)}</h2>
    <div class="sub">收到 ${apps.length} 件</div>
    ${msg ? `<div class="wnote big">${esc(msg)}</div>` : ""}
    ${pendingHTML(pending, busy)}
    <div class="chips" style="margin-bottom:4px">
      <button class="chip wide${filter === "all" ? " on" : ""}" data-act="filter" data-f="all">全部 ${apps.length}</button>
      ${APP_STATUS.map(s => `<button class="chip wide${filter === s.v ? " on" : ""}" data-act="filter" data-f="${s.v}">${esc(s.label)} ${counts[s.v]}</button>`).join("")}
    </div>
    ${bar}
    ${shown.length ? `<ul class="flist alist2">${rows}</ul>`
      : `<div class="empty">這一格裡沒有人。</div>`}
  </div>`;
}

// 還沒寄出去的信。**沒有待寄的信就完全不畫**，
// 一個永遠顯示「0 封待寄」的區塊只是雜訊，久了沒有人會看它。
function pendingHTML(pending, busy) {
  if (!pending || !pending.length) return "";
  const stuck = pending.filter(p => p.tries > 0);
  return `<div class="wnote big">
    還有 <b>${pending.length}</b> 封信沒有寄出去。
    ${stuck.length ? `其中 ${stuck.length} 封試過但失敗了：${esc(stuck[0].error || "沒有錯誤訊息")}` : ""}
    <div class="row">
      <button class="btn ghost sm" data-act="send-mail" ${busy ? "disabled" : ""}>${busy ? "寄送中…" : "現在寄出去"}</button>
    </div>
  </div>`;
}

// ═══════════════════════════════════════════════════════════════════════
// 批 6：活動營運
// ═══════════════════════════════════════════════════════════════════════

// 簽到。**只列錄取的人** —— 沒錄取的人不會來，
// 把他們放進點名單只會讓現場那個人多滑一百列。
export function checkinHTML(form, apps, canEdit, msg, busy) {
  const list = apps.filter(a => a.status === "accepted");
  const here = list.filter(a => a.checked_in_at).length;
  return `<div class="card">
    <div class="row" style="margin:0 0 14px">
      <button class="btn quiet" data-act="open-apps" data-id="${esc(form.id)}">← 回申請清單</button>
    </div>
    <h2>簽到</h2>
    <div class="sub">${esc(form.title)}・錄取 ${list.length} 人，
      <b>到了 ${here} 人</b></div>
    ${msg ? `<div class="wnote big">${esc(msg)}</div>` : ""}
    ${canEdit ? "" : `<div class="wnote">你可以看，但點不了。簽到是 Director 與 Co-President 的事。</div>`}
    ${list.length ? `<ul class="flist">${list.map(a => `<li>
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
    </li>`).join("")}</ul>` : `<div class="empty">還沒有人錄取，所以沒有人要簽到。</div>`}
  </div>`;
}

// 寄一封信給這場活動的人（行前信、通知）。
export const NOTICE_TO = [
  { v: "accepted",  label: "錄取的人" },
  { v: "interview", label: "邀請面試的人" },
  { v: "received",  label: "還沒處理的人" },
];

export function noticeHTML(form, apps, to, msg, busy) {
  const n = apps.filter(a => to.has(a.status)).length;
  return `<div class="card">
    <div class="row" style="margin:0 0 14px">
      <button class="btn quiet" data-act="open-apps" data-id="${esc(form.id)}">← 回申請清單</button>
    </div>
    <h2>寄一封信</h2>
    <div class="sub">${esc(form.title)}</div>
    ${msg ? `<div class="wnote big">${esc(msg)}</div>` : ""}
    <label><i>寄給誰</i></label>
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
    <div class="wnote">收信人的名字與「不要回覆這封信」那一段系統會自己加，
      <b>你只要寫中間那一段</b>。</div>
    <div class="row">
      <button class="btn" data-act="notice-send" ${n && !busy ? "" : "disabled"}>${
        busy ? "寄出中…" : n ? `寄給這 ${n} 個人` : "先選要寄給誰"}</button>
    </div>
  </div>`;
}

// ═══════════════════════════════════════════════════════════════════════
// 批 5：資源
// ═══════════════════════════════════════════════════════════════════════
export const RES_KINDS = [
  { v: "pdf", label: "PDF" }, { v: "video", label: "影片" },
  { v: "slides", label: "投影片" }, { v: "sheet", label: "表格" },
  { v: "book", label: "手冊" }, { v: "link", label: "連結" },
];

// 兩個大分頁：申請表 / 資源。**不是頂欄的第四個功能** ——
// 它們是同一件事的兩面（對外給學生的東西），拆成兩個入口會讓人以為是兩個系統。
export function tabsHTML(tab, isPresident) {
  return `<div class="chips" style="margin-bottom:16px">
    <button class="chip wide${tab === "forms" ? " on" : ""}" data-act="tab" data-t="forms">申請表</button>
    <button class="chip wide${tab === "res" ? " on" : ""}" data-act="tab" data-t="res">資源</button>
    ${isPresident ? `<button class="chip wide${tab === "team" ? " on" : ""}" data-act="tab" data-t="team">團隊頁</button>
    <button class="chip wide${tab === "stories" ? " on" : ""}" data-act="tab" data-t="stories">校友頁</button>
    <button class="chip wide${tab === "mail" ? " on" : ""}" data-act="tab" data-t="mail">信件文案</button>` : ""}
  </div>`;
}

// 團隊頁的核可。**只有 Co-President 看得到這個分頁**（核可是他們的鑰匙）。
//
// ⚠ 那兩句提醒不是裝飾。系統沒有生日欄位，「未滿 18 不放」技術上擋不住，
// 而大頭照對外是超出現行隱私政策告知範圍的新用途。
// 這一頁是這兩件事**唯一會被看到的地方**。
export function publicTeamHTML(people, msg, busy) {
  const on = people.filter(p => p.public_approved).length;
  return `<div class="card">
    <h2>團隊頁</h2>
    <div class="sub">誰出現在對外的 /team/ 上。已經公開 ${on} 人。</div>
    ${msg ? `<div class="wnote big">${esc(msg)}</div>` : ""}
    <div class="wnote big">核可之前確認兩件事：<br>
      1. <b>他滿 18 歲了嗎。</b>未滿一律不放，不管職位。系統沒有生日欄位，這一條只有你擋得住。<br>
      2. <b>隱私政策改了嗎。</b>現在的政策只說大頭照顯示在進度牆上，
         對外公開是新用途。名字撤得下來，照片被搜尋引擎存過撤不乾淨。</div>
    ${people.length ? `<ul class="flist">${people.map(p => {
      const { name, alt } = namesOf(p);
      return `<li>
        <div class="arow">
          <label class="apick"><input type="checkbox" data-act="approve" data-id="${esc(p.id)}"
            ${p.public_approved ? "checked" : ""}${busy ? " disabled" : ""}
            aria-label="核可 ${esc(name)}"></label>
          <div class="abody">
            <div class="fhead"><b>${esc(name)}${alt ? `<span class="alt">${esc(alt)}</span>` : ""}</b>
              ${p.public_approved ? `<span class="tag open">在公開頁面上</span>`
                                  : `<span class="tag">還沒核可</span>`}</div>
            <div class="fmeta">${esc([p.public_title, p.team].filter(Boolean).join("・") || "沒有填 team")}
              ${p.avatar ? "・有大頭照" : "・沒有大頭照"}</div>
          </div>
        </div>
      </li>`;
    }).join("")}</ul>` : `<div class="empty">還沒有人自己打勾。<br>
      幹部要先到 /app/ 打勾同意，才會出現在這裡。</div>`}
  </div>`;
}

// 校友頁的核可（2026-09-11）。**只有 Co-President 看得到這個分頁**（核可是他們的鑰匙）。
//
// ⚠ 這裡要看到的是**內容**，不是名字。核可的意思是
// 「這段文字可以用 BT 的名義公開」，看不到那段文字就沒辦法判斷 ——
// 所以那一句話與那段介紹一律整段畫出來，不收在「點開才看得到」裡面。
export function alumniStoriesHTML(rows, msg, busy) {
  // rows 可能是 undefined（載入失敗那一瞬間）。**這一頁寧可少東西也不能空白**，
  // 那是這個 repo 的規矩：連不上資料庫也要畫得出東西。
  const list = rows || [];
  const on = list.filter(r => r.story_approved).length;
  // 等核可的排最上面 —— 這一頁的工作就是處理那幾個。
  // 資料庫那一支 stories_for_review() 已經 order by 過同一件事，這裡再排一次是
  // **刻意的**：畫面的順序不該取決於呼叫端剛好給了什麼順序，而這一支是純函式，
  // 測試守得住它。用穩定排序，所以同一組裡面仍然照資料庫給的順序（最近改過的在前）。
  const sorted = list.slice()
    .sort((a, b) => Number(!!a.story_approved) - Number(!!b.story_approved));
  return `<div class="card">
    <h2>校友頁</h2>
    <div class="sub">誰出現在對外的 /alumni/ 航線圖上。已經公開 ${on} 人。</div>
    ${msg ? `<div class="wnote big">${esc(msg)}</div>` : ""}
    <div class="wnote big">核可之前確認三件事：<br>
      1. <b>他滿 18 歲了嗎。</b>未滿一律不放。系統沒有生日欄位，這一條只有你擋得住。<br>
      2. <b>他真的是 BT 校友嗎。</b>邀請碼可能被轉給別人。<br>
      3. <b>這段文字可以用 BT 的名義公開嗎。</b>核可之後他再改那一句話或介紹，
         系統會自動下架，重新回到這份清單上。</div>
    ${sorted.length ? `<ul class="flist">${sorted.map(r => `<li>
        <div class="arow">
          <label class="apick"><input type="checkbox" data-act="approve-story" data-id="${esc(r.id)}"
            ${r.story_approved ? "checked" : ""}${busy ? " disabled" : ""}
            aria-label="核可 ${esc(r.name)}"></label>
          <div class="abody">
            <div class="fhead"><b>${esc(r.name)}</b>
              ${r.story_approved ? `<span class="tag open">在公開頁面上</span>`
                                 : `<span class="tag">等核可</span>`}</div>
            <div class="fmeta">${esc([r.school, r.county].filter(Boolean).join("・"))}
              → ${esc([r.country, r.city, r.place].filter(Boolean).join("・"))}</div>
            <p class="fquote">${esc(r.quote || "")}</p>
            <p class="fmeta">${esc(r.note || "")}</p>
            <div class="fmeta">內容最後改過：${esc(String(r.updated_at || "").slice(0, 10))}</div>
          </div>
        </div>
      </li>`).join("")}</ul>` : `<div class="empty">還沒有人勾同意。<br>
      幹部與校友要先到「設定」把故事填完並勾同意，才會出現在這裡。</div>`}
  </div>`;
}

export function resListHTML(items, canEdit, msg, isPresident) {
  const rows = items.map(r => `<li>
    <div class="fhead">
      <b>${esc(r.title)}</b>
      <span class="tag ${r.status === "published" ? "open" : "draft"}">${
        r.status === "published" ? "已發布" : "還在寫"}</span>
      <span class="tag">${esc((RES_KINDS.find(k => k.v === r.kind) || RES_KINDS[5]).label)}</span>
    </div>
    <div class="fmeta">${esc(r.blurb || "還沒寫介紹")}</div>
    <div class="fmeta"><a href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">${esc(r.url)}</a></div>
    ${canEdit ? `<div class="row">
      <button class="btn ghost sm" data-act="res-edit" data-id="${esc(r.id)}">改</button>
    </div>` : ""}
  </li>`).join("");

  return `<div class="card">
    <h2>資源</h2>
    <div class="sub">BT 產出的免費資源。這裡放的是**一條連結**，不是檔案。</div>
    ${msg ? `<div class="wnote big">${esc(msg)}</div>` : ""}
    ${tabsHTML("res", isPresident)}
    ${canEdit ? `<div class="row" style="margin-bottom:6px">
      <button class="btn" data-act="res-new">加一個資源</button>
    </div>` : `<div class="wnote">你可以看，但改不動。</div>`}
    ${items.length ? `<ul class="flist">${rows}</ul>` : `<div class="empty">還沒有任何資源。</div>`}
  </div>`;
}

export function resEditHTML(r, msg, busy) {
  const cur = r || { title: "", blurb: "", kind: "pdf", url: "", team: "", status: "draft", ord: 100 };
  return `<div class="card">
    <div class="row" style="margin:0 0 14px">
      <button class="btn quiet" data-act="res-back">← 回資源清單</button>
    </div>
    <h2>${r ? "改一個資源" : "加一個資源"}</h2>
    ${msg ? `<div class="wnote big">${esc(msg)}</div>` : ""}
    <label><i>名稱</i><input id="rtitle" value="${esc(cur.title)}" placeholder="申請文書怎麼開頭"></label>
    <!-- ⚠ 介紹是**搜尋引擎唯一看得到的東西**（連結那一欄要登入才讀得到）。
         所以這一格要寫得像一句對高中生講的話，不是一行檔名。 -->
    <label><i>介紹（公開，沒登入的人也看得到，Google 也看得到）</i>
      <textarea id="rblurb" placeholder="這是什麼、為什麼有用。寫給一個第一次聽到 BT 的高中生看。">${esc(cur.blurb || "")}</textarea></label>
    <div class="two">
      <label><i>類型</i><select id="rkind">
        ${RES_KINDS.map(k => `<option value="${k.v}"${cur.kind === k.v ? " selected" : ""}>${esc(k.label)}</option>`).join("")}
      </select></label>
      <label><i>排序（小的在前）</i><input id="rord" type="number" value="${esc(String(cur.ord))}"></label>
      <label><i>哪一個 team 維護</i><input id="rteam" value="${esc(cur.team || "")}"></label>
      <label><i>狀態</i><select id="rstatus">
        <option value="draft"${cur.status === "draft" ? " selected" : ""}>還在寫（外面看不到）</option>
        <option value="published"${cur.status === "published" ? " selected" : ""}>已發布</option>
      </select></label>
    </div>
    <label><i>連結（Google Drive、YouTube、Canva…）</i>
      <input id="rurl" value="${esc(cur.url)}" placeholder="https://..."></label>
    <!-- 這一句是人的流程，不是程式。Drive 的分享權限設錯，網站看不出來，
         而使用者看到的是一頁「你需要存取權」。 -->
    <div class="wnote">發布之前，<b>用無痕視窗打開這條連結自己點一次</b>。
      Drive 的分享權限如果設成「只有我」，這裡完全看不出來，
      而學生看到的會是一頁「你需要存取權」。</div>
    <div class="row">
      <button class="btn" data-act="res-save" ${busy ? "disabled" : ""}>${busy ? "存檔中…" : "存起來"}</button>
      ${r ? `<button class="btn quiet" data-act="res-del" data-id="${esc(r.id)}">刪掉</button>` : ""}
    </div>
  </div>`;
}

// ═══════════════════════════════════════════════════════════════════════
// 信件文案（2026-09-08）
// ═══════════════════════════════════════════════════════════════════════
export const MAIL_KINDS = [
  { v: "guardian",  label: "家長告知信", when: "學生送出申請、而且填了家長信箱的時候" },
  { v: "interview", label: "邀請面試",   when: "你按下「邀請面試」的時候" },
  { v: "accepted",  label: "錄取通知",   when: "你按下「錄取」的時候" },
  { v: "rejected",  label: "婉拒",       when: "你按下「婉拒」的時候" },
];
const kindOf = v => MAIL_KINDS.find(k => k.v === v) || MAIL_KINDS[0];

// 系統會自己加在每一封信最後面的那一段。**這裡只是把它顯示出來，不能改。**
// 「不要回覆這封信」是必要資訊不是禮貌用語 —— noreply 沒有 MX，
// 按回覆會被退回，而那個人只會覺得沒有人理他。
export function mailTail(kind) {
  return kind === "guardian"
    ? "這封信是告知，不需要回覆或簽名。有任何問題請寄到 beyondtaiwan2020@gmail.com。\n\nBeyond Taiwan"
    : "不要回覆這封信，這個信箱沒有人看。有問題請寄到 beyondtaiwan2020@gmail.com。\n\nBeyond Taiwan";
}

// 代換。**跟資料庫那一支 mail_fill() 是同一套規則**，
// 兩邊不一致的話預覽就會騙人 —— 而預覽騙人比沒有預覽糟。
export function fillMail(text, name, title) {
  return String(text == null ? "" : text)
    .split("{姓名}").join(name)
    .split("{活動名稱}").join(title);
}

export function mailListHTML(items, msg) {
  return `<div class="card">
    <h2>信件文案</h2>
    <div class="sub">系統寄出去的四封信。只有 Co-President 改得動。</div>
    ${msg ? `<div class="wnote big">${esc(msg)}</div>` : ""}
    ${tabsHTML("mail", true)}
    <ul class="flist">${MAIL_KINDS.map(k => {
      const t = items.find(x => x.kind === k.v);
      return `<li>
        <div class="fhead"><b>${esc(k.label)}</b></div>
        <div class="fmeta">${esc(k.when)}</div>
        <div class="fmeta">主旨：${esc((t && t.subject) || "（還沒有）")}</div>
        <div class="row">
          <button class="btn ghost sm" data-act="mail-edit" data-k="${esc(k.v)}">改這一封</button>
        </div>
      </li>`;
    }).join("")}</ul>
  </div>`;
}

// 編輯一封信。**左邊改、右邊就是寄出去的樣子。**
// 這一頁的價值在預覽：代換符號打錯不會壞掉，只會空著，
// 而預覽是唯一會當場讓人看到「我把 {姓名} 打成 {名字} 了」的東西。
export function mailEditHTML(kind, t, msg, busy) {
  const k = kindOf(kind);
  const NAME = "陳小安", TITLE = "2027 暑期探索營";
  const subject = t ? t.subject : "";
  const body = t ? t.body : "";
  const extra = kind === "interview" ? "\n\n請從這個連結挑一個你方便的時段：\nhttps://cal.com/..." : "";
  return `<div class="card">
    <div class="row" style="margin:0 0 14px">
      <button class="btn quiet" data-act="mail-back">← 回信件清單</button>
    </div>
    <h2>${esc(k.label)}</h2>
    <div class="sub">${esc(k.when)}寄出。</div>
    ${msg ? `<div class="wnote big">${esc(msg)}</div>` : ""}
    <label><i>主旨</i><input id="msub" value="${esc(subject)}"></label>
    <label><i>內文</i><textarea id="mbody" style="min-height:230px">${esc(body)}</textarea></label>
    <div class="mini" style="margin:-6px 0 14px">
      可以用兩個代換符號：<b>{姓名}</b> 與 <b>{活動名稱}</b>。
      打錯或刪掉不會壞掉，那個位置會空著 —— 右邊的預覽會直接讓你看到。</div>

    <h3 style="font-family:var(--display);font-size:20px;margin:26px 0 6px">寄出去會長這樣</h3>
    <div class="mini" style="margin-bottom:8px">用「${esc(NAME)}」與「${esc(TITLE)}」當範例。</div>
    <div class="mailprev"><b>${esc(fillMail(subject, NAME, TITLE)) || "（沒有主旨）"}</b><pre>${
      esc(fillMail(body, NAME, TITLE) + extra)}</pre><pre class="tail">${esc(mailTail(kind))}</pre></div>
    <div class="mini" style="margin:6px 0 0">
      灰色那一段是<b>系統自己加的，改不掉</b>。「不要回覆這封信」是必要資訊：
      那個信箱沒有人看，按回覆會被退回，而收信的人只會覺得沒有人理他。</div>

    <div class="row">
      <button class="btn" data-act="mail-save" data-k="${esc(kind)}" ${busy ? "disabled" : ""}>${
        busy ? "存檔中…" : "存起來"}</button>
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
