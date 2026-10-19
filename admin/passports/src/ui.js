// 後台「護照」那一組的畫面：實習護照的屆別與格子。幹部護照的格子是批 2 的事，到時加在這裡。
// 2026-10-15 從 admin/src/ui.js 原樣搬過來（後台拆成四個資料夾）。
// **esc 是自己的一份**，不從別的資料夾 import。
// 申請管理的畫面。**esc 是自己的一份**，不從別的資料夾 import
//（跟 app/ 與 availability/ 同一條規矩：資料夾之間不互相依賴）。
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

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
  { group: "passports", key: "cities",  label: "城市",     who: "president" },
  { group: "people",    key: "roster",  label: "幹部名單", who: "president" },
  { group: "people",    key: "invites", label: "邀請碼",   who: "president" },
  { group: "people",    key: "changes", label: "變動紀錄", who: "president" },
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
  return ITEMS.filter(i => i.group === "passports" && i.key !== "home" && canSee(i, me))
    .map(i => `<a class="rail-item${i.key === tab ? " on" : ""}" href="#${i.key}" data-act="tab" data-t="${i.key}">${esc(i.label)}</a>`).join("");
}

// 只有 Internship team 的幹部與 Co-President 進得來。別的幹部看到這一句，不是錯誤畫面。
export function noAccessHTML(me) {
  return pageHead("這一組只有 Internship team 用得到",
    "實習護照的格子由 Internship team 的幹部與 Co-President 改。你的 team 不在裡面，所以這一頁對你是關著的。",
    [{ label: "回後台首頁", href: "../" }]);
}

// 學員或還沒升級的人走到這裡。
// **不說「你沒有權限」**：他沒有做錯任何事，只是走錯地方。
// ═══════════════════════════════════════════════════════════════════════
// 實習護照的後台（2026-10-18）：Internship team 自己改格子、開新的一屆。
// 之前要去 Supabase 的 Table Editor，那等於叫每年換屆的 Director 去碰資料庫。
// 寫入全部走資料庫的函式（門在那裡），這一頁只是表單。
// **每一個動作都要在畫面上有回饋**（Paul 2026-10-17）：按下去變「存檔中…」、
// 成功有一句、失敗說錯在哪、會丟東西的先問一次。
// ═══════════════════════════════════════════════════════════════════════
export const INTERN_CATS = [
  { v: "onboard", label: "入門", hint: "第一個月要做完的" },
  { v: "project", label: "任務", hint: "實際交出去的東西" },
  { v: "reflect", label: "反思", hint: "寫給自己的，只有本人看得到心得" },
];
const internCatOf = v => INTERN_CATS.find(c => c.v === v) || { v, label: v, hint: "" };

// 新格子的代號：T 加屆別的四個數字加流水號。例如 2026-27 的第 10 格是 T2627-10。
// 只是建議值，人可以改。
export function suggestTaskId(termId, tasks) {
  const digits = String(termId || "").replace(/[^0-9]/g, "");
  const prefix = "T" + (digits.slice(2, 4) + digits.slice(-2) || "XX") + "-";
  const used = (tasks || []).filter(t => t.term === termId).length;
  for (let n = used + 1; n < 1000; n++) {
    const id = prefix + String(n).padStart(2, "0");
    if (!(tasks || []).some(t => t.id === id)) return id;
  }
  return prefix + "01";
}

// 主畫面：屆別一區、目前選的那一屆的格子一區。
// data = { terms, tasks, stamped, interns }，sel = 正在看哪一屆的 id。
// isPresident 要傳進來：分頁列上 Co-President 才有的那四個分頁靠它畫。
// 2026-10-18 端對端測試抓到：寫死 false 的話，Co-President 一進實習護照分頁，
// 邀請碼那幾個分頁就不見了，要重新整理才回得去。
export function internAdminHTML(data, sel, msg, busy, isPresident, previewCat) {
  const terms = data.terms || [];
  const cur = terms.find(t => t.id === sel) || terms.find(t => t.active) || terms[0] || null;
  const tasks = (data.tasks || []).filter(t => cur && t.term === cur.id);
  const dis = busy ? " disabled" : "";
  const termRows = terms.map(t => `<li>
    <div class="fhead"><b>${esc(t.title_zh)}</b>
      <span class="tag">${esc(t.id)}</span>
      ${t.active ? `<span class="tag open">目前這一屆</span>` : ""}
      ${cur && cur.id === t.id ? `<span class="tag">正在看</span>` : ""}</div>
    <div class="fmeta">${esc(t.title_en)}・${esc(String(t.starts_on))} 到 ${esc(String(t.ends_on))}・${
      (data.tasks || []).filter(x => x.term === t.id && x.active).length} 格在用</div>
    <div class="row">
      ${cur && cur.id === t.id ? "" : `<button class="btn ghost sm" data-act="intern-see" data-id="${esc(t.id)}"${dis}>看這一屆的格子</button>`}
      <button class="btn ghost sm" data-act="intern-term-edit" data-id="${esc(t.id)}"${dis}>改標題或日期</button>
      ${t.active ? "" : `<button class="btn ghost sm" data-act="intern-term-activate" data-id="${esc(t.id)}"${dis}>設成目前這一屆</button>`}
    </div>
  </li>`).join("");

  const byCat = INTERN_CATS.map(c => ({ c, rows: tasks.filter(t => t.category === c.v) }))
    .concat([{ c: { v: "?", label: "認不得的分類", hint: "" }, rows: tasks.filter(t => !INTERN_CATS.some(c => c.v === t.category)) }])
    .filter(g => g.rows.length);
  const taskRows = byCat.map(g => `<h3 class="sec-h" style="margin-top:18px">${esc(g.c.label)}<span class="mini">${esc(g.c.hint)}</span>
      ${g.c.v === "?" ? "" : `<button class="btn quiet sm" data-act="ipreview" data-cat="${esc(g.c.v)}">看它在實習護照上長什麼樣</button>`}</h3>
    <ul class="flist">${g.rows.map(t => {
      const n = (data.stamped || {})[t.id] || 0;
      return `<li>
      <div class="fhead"><b>${esc(t.title_zh)}</b>
        <span class="tag">${esc(t.id)}</span>
        ${t.active ? "" : `<span class="tag draft">停用中</span>`}
        <span class="tag">${n ? `${n} 人蓋過` : "還沒有人蓋"}</span></div>
      <div class="fmeta">${esc(t.title_en)}${t.description ? "・" + esc(t.description) : ""}・順序 ${esc(String(t.seq))}</div>
      <div class="row">
        <button class="btn ghost sm" data-act="intern-task-edit" data-id="${esc(t.id)}"${dis}>改</button>
        ${t.active
          ? `<button class="btn ghost sm" data-act="intern-task-off" data-id="${esc(t.id)}"${dis}>停用</button>`
          : `<button class="btn ghost sm" data-act="intern-task-on" data-id="${esc(t.id)}"${dis}>恢復</button>`}
        ${n ? "" : `<button class="btn quiet danger sm" data-act="intern-task-del" data-id="${esc(t.id)}"${dis}>刪掉</button>`}
      </div>
    </li>`; }).join("")}</ul>`).join("");

  const headActs = [{ act: "ipreview", label: "看它在實習護照上長什麼樣" }];
  if (cur) headActs.unshift({ act: "intern-task-new", label: "加一格", primary: true, disabled: busy });
  return pageHead("實習護照", `這一屆的格子、開新的一屆。改完 intern 重新整理護照就看得到。目前 ${data.interns || 0} 位 intern。`, headActs)
    + msgHTML(msg)
    + internPreviewHTML(previewCat, cur ? !!cur.active : true)
    + sectionHTML("屆別", `${terms.length ? `<ul class="flist">${termRows}</ul>` : emptyHTML("還沒有任何一屆", "先開一屆，才能建格子。", { act: "intern-term-new", label: "開新的一屆" })}
    ${terms.length ? `<div class="row" style="margin:6px 0 0"><button class="btn ghost sm" data-act="intern-term-new"${dis}>開新的一屆</button></div>` : ""}`,
      { id: "terms" })
    + sectionHTML(`格子${cur ? `：${esc(cur.title_zh)}` : ""}`, cur
      ? `<div class="note">intern 的章與心得這裡碰不到。蓋過的格子只能停用不能刪：刪了他的章會跟著不見。
        要看誰蓋了什麼，到<a href="../../intern-passport/">實習生進度牆</a>。</div>
        ${tasks.length ? taskRows : emptyHTML("這一屆還沒有格子", "加第一格，代號系統會先想好。", { act: "intern-task-new", label: "加一格" })}`
      : emptyHTML("先開一屆", "有了屆別才能建格子。"),
      { id: "tasks" });
}

// 改或開一屆。id 建了就不能改（格子與護照靠它對應），所以改的時候那一格鎖住。
// draft（2026-10-18 端對端測試抓到的）：存檔被擋之後畫面會重畫，沒有 draft 的話
// 剛填的五格全部洗掉，使用者看到一句錯誤訊息跟一張空表單。畫面上的東西要留在畫面上。
export function internTermEditHTML(t, msg, busy, draft) {
  const cur = draft || t || { id: "", title_zh: "", title_en: "", starts_on: "", ends_on: "" };
  const dis = busy ? " disabled" : "";
  return pageHead(t ? "改這一屆" : "開新的一屆", "", [], { act: "intern-back", label: "回實習護照" })
    + msgHTML(msg)
    + sectionHTML("", `<label><i>代號（英文字母、數字、連字號；建了就不能改）</i>
      <input id="it-id" value="${esc(cur.id)}" placeholder="2027-28"${t ? " disabled" : dis}></label>
    <div class="two">
      <label><i>中文名稱</i><input id="it-zh" value="${esc(cur.title_zh)}" placeholder="2027-28 實習"${dis}></label>
      <label><i>英文名稱（會印在護照上，建議全大寫）</i><input id="it-en" value="${esc(cur.title_en)}" placeholder="INTERNSHIP 2027-28"${dis}></label>
      <label><i>開始日</i><input id="it-start" type="date" value="${esc(String(cur.starts_on || "").slice(0, 10))}"${dis}></label>
      <label><i>結束日</i><input id="it-end" type="date" value="${esc(String(cur.ends_on || "").slice(0, 10))}"${dis}></label>
    </div>
    <div class="note">開了之後還不會變成「目前這一屆」，回上一頁按「設成目前這一屆」才會。</div>
    <div class="form-foot">
      <button class="btn" data-act="intern-term-save"${t ? ` data-id="${esc(t.id)}"` : ""}${dis}>${busy ? "存檔中…" : "存起來"}</button>
      <button class="btn ghost" data-act="intern-back"${dis}>取消</button>
    </div>`);
}

// 改或加一格。id 與屆別建了就不能改。
export function internTaskEditHTML(t, termId, suggestedId, msg, busy, draft) {
  const cur = draft || t || { id: suggestedId || "", term: termId, seq: "", category: "project", title_zh: "", title_en: "", description: "" };
  const dis = busy ? " disabled" : "";
  return pageHead(t ? "改這一格" : "加一格", `屆別：${esc(cur.term)}`, [], { act: "intern-back", label: "回實習護照" })
    + msgHTML(msg)
    + sectionHTML("", `<div class="two">
      <label><i>代號（建了就不能改，章靠它對到格子）</i>
        <input id="ik-id" value="${esc(cur.id)}"${t ? " disabled" : dis}></label>
      <label><i>分類</i><select id="ik-cat"${dis}>
        ${INTERN_CATS.map(c => `<option value="${c.v}"${cur.category === c.v ? " selected" : ""}>${esc(c.label)}（${esc(c.hint)}）</option>`).join("")}
      </select></label>
      <label><i>中文標題</i><input id="ik-zh" value="${esc(cur.title_zh)}" placeholder="第一個任務" maxlength="30"${dis}></label>
      <label><i>英文標題（會印在章上，全大寫、不要太長）</i><input id="ik-en" value="${esc(cur.title_en)}" placeholder="FIRST TASK" maxlength="30"${dis}></label>
      <label><i>順序（小的在前）</i><input id="ik-seq" type="number" value="${esc(String(cur.seq || ""))}" placeholder="10"${dis}></label>
    </div>
    <label><i>說明（格子正面那一行小字）</i>
      <textarea id="ik-desc" placeholder="做完什麼算完成" maxlength="120"${dis}>${esc(cur.description || "")}</textarea></label>
    <div class="form-foot">
      <button class="btn" data-act="intern-task-save" data-term="${esc(cur.term)}"${t ? ` data-id="${esc(t.id)}"` : ""}${dis}>${busy ? "存檔中…" : "存起來"}</button>
      <button class="btn ghost" data-act="intern-back"${dis}>取消</button>
    </div>`);
}

// ═══════════════════════════════════════════════════════════════════════
// 幹部護照的後台（2026-10-20，批 2）：Co-President 改格子、月份時刻、城市。
// 之前要去 Supabase 的 Table Editor（README「怎麼改活動文案」），那等於叫換屆的人碰資料庫。
// 寫入全部走資料庫的函式（門在那裡），這一頁只是表單。
// 三條不能破的線，畫面與資料庫各擋一次：
//   編號不是輸入框（章靠它對到格子）、蓋過的格子沒有「刪掉」（只有停用）、城市沒有「刪掉」。
// ═══════════════════════════════════════════════════════════════════════
// 跟 passport/src/ui.js 的 CATEGORY 同一組鍵。那邊是給護照本身用的長文案，這裡只要名字。
export const ACT_CATS = [
  { v: "gather", label: "聚會", hint: "全體一起做的事，通常要有人主持" },
  { v: "prompt", label: "題目", hint: "寫給自己的一題，只有本人看得到" },
  { v: "frame",  label: "鏡頭", hint: "一張照片" },
];
const actCatOf = v => ACT_CATS.find(c => c.v === v) || { v, label: v, hint: "" };
// 月份顯示：9 月到隔年 7 月。
export const monthLabel = m => `${m} 月`;

// 主畫面：11 個月各一段（時刻與那個月的格子），最後是城市。
// data = { months, activities, destinations, stamped }。
// 「看它在護照上長什麼樣」（2026-10-16，Paul：改完看不到成品）。
// 用 iframe 把**真的** /passport/ 嵌進來，帶 ?month=N 翻到那一個月。
// 不另外畫一份護照：那會是第二份護照程式碼，改一次要改兩邊，而且畫出來的
// 永遠不會跟真的一模一樣。看到的是登入者自己那本（含自己的章），
// 要看「空白的」就看還沒蓋的格子。previewMonth 是 null 就不畫框。
function previewBoxHTML(title, hint, src, openSrc) {
  return `<div class="preview-wrap" id="passport-preview">
    <div class="fhead" style="margin-bottom:6px"><b>${title}</b>
      <span class="mini">${hint}</span>
      <span style="flex:1"></span>
      <button class="btn quiet sm" data-act="preview-reload">重新整理預覽</button>
      <a class="btn quiet sm" href="${openSrc || src}" target="_blank" rel="noopener">另開視窗</a>
      <button class="btn quiet sm" data-act="preview-close">關掉</button></div>
    <iframe class="preview-frame" src="${src}" title="護照預覽" loading="lazy"></iframe>
  </div>`;
}

export function passportPreviewHTML(previewMonth) {
  if (previewMonth == null) return "";
  // 框裡帶 &bare=1：那一頁不畫頂欄與分頁列（Paul 2026-10-19 拍板），框裡只有那本護照。
  // 「另開視窗」開的是完整的那一頁，有頂欄。
  const full = `../../passport/?month=${encodeURIComponent(String(previewMonth))}`;
  return previewBoxHTML(`護照預覽：${esc(monthLabel(previewMonth))}`, "這是你自己那本，剛改的格子重新整理預覽就會出現", full + "&bare=1", full);
}

// 實習護照的預覽（2026-10-16）。嵌的是 /intern-passport/ 的「樣書」：目前這一屆的格子、假的持照人、沒有章。
// 樣書只畫**目前這一屆**（active 的那一屆），後台正在看別屆時這裡會提醒。
export function internPreviewHTML(cat, viewingActive) {
  if (cat == null) return "";
  const c = INTERN_CATS.find(x => x.v === cat);
  const full = `../../intern-passport/?view=sample${cat ? `&cat=${encodeURIComponent(cat)}` : ""}`;
  const hint = (viewingActive === false ? "樣書只畫目前這一屆的格子，你現在在看的不是那一屆。" : "這是樣書：目前這一屆的格子、假的持照人、沒有章。intern 看到的就是這個樣子。");
  return previewBoxHTML(`實習護照預覽${c ? `：${esc(c.label)}` : ""}`, hint, full + "&bare=1", full);
}

export function passportAdminHTML(data, msg, busy, previewMonth) {
  const months = data.months || [];
  const acts = data.activities || [];
  const dis = busy ? " disabled" : "";
  const actRow = a => {
    const n = (data.stamped || {})[a.id] || 0;
    return `<li>
      <div class="fhead"><b>${esc(a.title_zh)}</b>
        <span class="tag">${esc(a.id)}</span>
        <span class="tag">${esc(actCatOf(a.category).label)}</span>
        ${a.active ? "" : `<span class="tag draft">停用中</span>`}
        <span class="tag">${n ? `${n} 人蓋過` : "還沒有人蓋"}</span>
        ${a.needs_host ? `<span class="tag">要主持人</span>` : ""}
        ${a.callback_to ? `<span class="tag">回望 ${esc(a.callback_to)}</span>` : ""}</div>
      <div class="fmeta">${esc(a.title_en)}${a.description ? "・" + esc(a.description) : ""}</div>
      <div class="row">
        <button class="btn ghost sm" data-act="act-edit" data-id="${esc(a.id)}"${dis}>改</button>
        ${a.active
          ? `<button class="btn ghost sm" data-act="act-off" data-id="${esc(a.id)}"${dis}>停用</button>`
          : `<button class="btn ghost sm" data-act="act-on" data-id="${esc(a.id)}"${dis}>恢復</button>`}
        ${n ? "" : `<button class="btn quiet danger sm" data-act="act-del" data-id="${esc(a.id)}"${dis}>刪掉</button>`}
      </div>
    </li>`;
  };
  const monthBlocks = months.map(m => {
    const rows = acts.filter(a => a.month === m.month);
    return sectionHTML(esc(monthLabel(m.month)),
      `${rows.length ? `<ul class="flist">${rows.map(actRow).join("")}</ul>` : `<div class="empty sm">這個月還沒有格子。</div>`}
      <div class="row" style="margin:4px 0 0"><button class="btn ghost sm" data-act="act-new" data-month="${esc(String(m.month))}"${dis}>在 ${esc(monthLabel(m.month))}加一格</button></div>`,
      { id: `m${m.month}`, hint: `右上角的時刻：${m.theme_zh ? esc(m.theme_zh) : "（空）"}`,
        actions: [{ act: "month-edit", label: "改時刻", seq: String(m.seq), disabled: busy },
                  { act: "preview", label: "看它在護照上長什麼樣", month: String(m.month) }] });
  }).join("");
  const jump = months.length ? `<nav class="jump" aria-label="跳到某一個月">${months.map(m => `<a href="#m${esc(String(m.month))}">${esc(monthLabel(m.month))}</a>`).join("")}</nav>` : "";
  return pageHead("幹部護照", "33 格的題目與說明、每個月右上角的時刻、入境章抽得到的城市。改完幹部重新整理護照就看得到。")
    + msgHTML(msg)
    + `<div class="note">幹部的章、心得、照片這裡碰不到。<b>編號不能改</b>（章靠它對到格子），蓋過的格子只能停用不能刪，城市只能停用不能刪。
      ${months.length ? "" : "月份載不到的話，格子也不會出現。"}</div>`
    + jump
    + passportPreviewHTML(previewMonth, months)
    + (months.length ? monthBlocks : emptyHTML("月份還沒載到", "重新整理再試一次。"));
}

// 城市（2026-10-19 起自己一頁，側欄「護照 > 城市」）。24 個城市不該跟 33 格擠在同一頁的最底下。
// 入境章抽城市用的。只有停用與恢復，沒有刪：visas 的外鍵本來就擋，後台不給那顆按鈕。
export function citiesHTML(data, msg, busy) {
  const dests = data.destinations || [];
  const dis = busy ? " disabled" : "";
  const rows = dests.map(d => `<tr${d.active ? "" : ' class="off"'}>
    <td class="t-main"><b>${esc(d.city)}</b></td>
    <td><span class="tag">${esc(d.code)}</span></td>
    <td>${d.active ? `<span class="tag open">抽得到</span>` : `<span class="tag draft">停用中</span>`}</td>
    <td class="t-act">
      <button class="btn quiet sm" data-act="dest-edit" data-code="${esc(d.code)}"${dis}>改名字</button>
      ${d.active
        ? `<button class="btn quiet sm" data-act="dest-off" data-code="${esc(d.code)}"${dis}>停用</button>`
        : `<button class="btn quiet sm" data-act="dest-on" data-code="${esc(d.code)}"${dis}>恢復</button>`}
    </td>
  </tr>`).join("");
  return pageHead("城市", `入境章抽城市用的。${dests.length} 個城市，${dests.filter(d => d.active).length} 個抽得到。`,
      [{ act: "dest-new", label: "加一個城市", primary: true, disabled: busy }])
    + msgHTML(msg)
    + `<div class="note">有人抽到過的城市資料庫擋著不給刪，所以這裡只有停用。停用之後新的入境章不會再抽到它，已經發出去的不動。</div>`
    + sectionHTML("", dests.length
      ? `<table class="table"><thead><tr><th>城市</th><th>代碼</th><th>狀態</th><th></th></tr></thead><tbody>${rows}</tbody></table>`
      : emptyHTML("還沒有城市", "加第一個，入境章才抽得到東西。", { act: "dest-new", label: "加一個城市" }), { id: "cities" });
}

// 改或加一格。編號是標籤不是輸入框；改既有的格子時月份也鎖住。
// draft：存檔被擋之後畫面會重畫，沒有 draft 的話剛填的東西全部洗掉（實習護照那邊 2026-10-18 抓過同一件事）。
export function activityEditHTML(a, month, months, msg, busy, draft) {
  const cur = draft || a || { id: "", month, category: "gather", title_zh: "", title_en: "", description: "", needs_host: false, callback_to: "" };
  const dis = busy ? " disabled" : "";
  const lock = a ? " disabled" : dis;
  return pageHead(a ? "改這一格" : "加一格", a ? `編號 <b>${esc(a.id)}</b>（不能改，章靠它對到格子）` : "編號由系統照月份算，存了之後就不能改。", [], { act: "cadre-back", label: "回幹部護照" })
    + msgHTML(msg)
    + sectionHTML("", `<div class="two">
      <label><i>月份${a ? "（建了就不能換）" : ""}</i><select id="ak-month"${lock}>
        ${(months || []).map(m => `<option value="${esc(String(m.month))}"${String(cur.month) === String(m.month) ? " selected" : ""}>${esc(monthLabel(m.month))}</option>`).join("")}
      </select></label>
      <label><i>分類</i><select id="ak-cat"${dis}>
        ${ACT_CATS.map(c => `<option value="${c.v}"${cur.category === c.v ? " selected" : ""}>${esc(c.label)}（${esc(c.hint)}）</option>`).join("")}
      </select></label>
      <label><i>中文標題</i><input id="ak-zh" value="${esc(cur.title_zh)}" placeholder="開學電影夜" maxlength="30"${dis}></label>
      <label><i>英文標題（會印在章上，全大寫、不要太長）</i><input id="ak-en" value="${esc(cur.title_en)}" placeholder="OPENING NIGHT" maxlength="30"${dis}></label>
    </div>
    <label><i>說明（格子正面那一行小字）</i>
      <textarea id="ak-desc" placeholder="做什麼算完成" maxlength="200"${dis}>${esc(cur.description || "")}</textarea></label>
    <div class="two">
      <label class="check" style="display:flex;gap:10px;align-items:center;font-size:14.5px">
        <input id="ak-host" type="checkbox" style="width:18px;height:18px"${cur.needs_host ? " checked" : ""}${dis}>
        <span>這一格要有人主持（聚會通常要）</span></label>
      <label><i>回望哪一格（選填，例如 09B；打開這一格時會把那一格的心得拉回來）</i>
        <input id="ak-cb" value="${esc(cur.callback_to || "")}" placeholder="09B" maxlength="4"${dis}></label>
    </div>
    <div class="form-foot">
      <button class="btn" data-act="act-save"${a ? ` data-id="${esc(a.id)}"` : ""}${dis}>${busy ? "存檔中…" : "存起來"}</button>
      <button class="btn ghost" data-act="cadre-back"${dis}>取消</button>
    </div>`);
}

// 改一個月右上角的時刻。seq 與月份不給改，只有那一串字。
export function monthEditHTML(m, msg, busy, draft) {
  const cur = draft || m || { seq: "", month: "", theme_zh: "", theme_en: "" };
  const dis = busy ? " disabled" : "";
  return pageHead(`${esc(monthLabel(cur.month))}的時刻`, "月份頁右上角那一小串字。留空就不顯示。刻意不整點的時刻（08:40、23:50）是內容決定，不是打字錯誤。", [], { act: "cadre-back", label: "回幹部護照" })
    + msgHTML(msg)
    + sectionHTML("", `<div class="two">
      <label><i>時刻</i><input id="mk-zh" value="${esc(cur.theme_zh || "")}" placeholder="07:00" maxlength="20"${dis}></label>
      <label><i>英文副標（現在的版面不顯示，留空就好）</i><input id="mk-en" value="${esc(cur.theme_en || "")}" maxlength="40"${dis}></label>
    </div>
    <div class="form-foot">
      <button class="btn" data-act="month-save" data-seq="${esc(String(cur.seq))}"${dis}>${busy ? "存檔中…" : "存起來"}</button>
      <button class="btn ghost" data-act="cadre-back"${dis}>取消</button>
    </div>`);
}

// 加一個城市或改名字。代碼建了就不能改（visas 靠它）。
export function destinationEditHTML(d, msg, busy, draft) {
  const cur = draft || d || { code: "", city: "", active: true };
  const dis = busy ? " disabled" : "";
  return pageHead(d ? "改這個城市的名字" : "加一個城市", "入境章會印這個名字，建議全大寫英文。", [], { act: "cities-back", label: "回城市" })
    + msgHTML(msg)
    + sectionHTML("", `<div class="two">
      <label><i>代碼（2 到 8 個英文或數字，建議用機場代碼${d ? "；建了就不能改" : ""}）</i>
        <input id="dk-code" value="${esc(cur.code)}" placeholder="TPE" maxlength="8"${d ? " disabled" : dis}></label>
      <label><i>城市名字</i><input id="dk-city" value="${esc(cur.city)}" placeholder="TAIPEI" maxlength="40"${dis}></label>
    </div>
    <div class="form-foot">
      <button class="btn" data-act="dest-save"${d ? ` data-code="${esc(d.code)}"` : ""} data-active="${cur.active === false ? "0" : "1"}"${dis}>${busy ? "存檔中…" : "存起來"}</button>
      <button class="btn ghost" data-act="cities-back"${dis}>取消</button>
    </div>`);
}

export function notCadreHTML() {
  return pageHead("這一頁是給幹部用的", "你的帳號是學員，後台看不到。", [{ label: "回我的帳號", href: "../../app/" }]);
}

export function downHTML() {
  return pageHead("資料庫休眠中", "現在連不上資料庫。請寄信到 beyondtaiwan2020@gmail.com 請人恢復。", [{ act: "retry", label: "再試一次" }]);
}
