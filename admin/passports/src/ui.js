// 後台「護照」那一組的畫面：實習護照的屆別與格子。幹部護照的格子是批 2 的事，到時加在這裡。
// 2026-10-15 從 admin/src/ui.js 原樣搬過來（後台拆成四個資料夾）。
// **esc 是自己的一份**，不從別的資料夾 import。
// 申請管理的畫面。**esc 是自己的一份**，不從別的資料夾 import
//（跟 app/ 與 availability/ 同一條規矩：資料夾之間不互相依賴）。
//
// 2026-10-19 起畫面上的字全部從 ./strings.js 的字典來（T("鍵")），中英兩版並排在那一支裡。
// 這一支只管拼 HTML，不再寫死任何一句給人看的字。怎麼加一句見 README「後台的中英切換」。
import { T, lang, setLang, withLang, isErr } from "./strings.js";
export { T, lang, setLang };
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

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
  { key: "passports", label: { zh: "護照",     en: "Passports" },    href: "/admin/passports/", who: "intern-staff", hint: { zh: "兩本護照的格子", en: "Boxes in both passports" } },
  { key: "people",    label: { zh: "人與權限", en: "People" },       href: "/admin/people/",    who: "president",    hint: { zh: "邀請碼、職位、team", en: "Invite codes, roles, teams" } },
];
// 側欄上每一行。要加一個新的後台分頁，就在這裡加一行（四份都要加），
// 然後在那一組的 ui.js 加一個畫面函式、main.js 接 data-act="tab" data-t="<key>"。
export const ITEMS = [
  { group: "forms",     key: "home",    label: { zh: "首頁",     en: "Home" },            who: "cadre" },
  { group: "forms",     key: "forms",   label: { zh: "申請表",   en: "Forms" },           who: "cadre" },
  { group: "site",      key: "res",     label: { zh: "資源",     en: "Resources" },       who: "cadre" },
  { group: "site",      key: "team",    label: { zh: "團隊頁",   en: "Team page" },       who: "president" },
  { group: "site",      key: "stories", label: { zh: "校友頁",   en: "Alumni page" },     who: "president" },
  { group: "site",      key: "mail",    label: { zh: "信件文案", en: "Email copy" },      who: "president" },
  { group: "passports", key: "interns", label: { zh: "實習護照", en: "Intern passport" }, who: "intern-staff" },
  { group: "passports", key: "board",   label: { zh: "棋盤",     en: "Board" },           who: "intern-staff" },
  { group: "passports", key: "cadre",   label: { zh: "幹部護照", en: "Cadre passport" },  who: "president" },
  { group: "passports", key: "cities",  label: { zh: "城市",     en: "Cities" },          who: "president" },
  { group: "people",    key: "roster",  label: { zh: "幹部名單", en: "Roster" },          who: "president" },
  { group: "people",    key: "invites", label: { zh: "邀請碼",   en: "Invite codes" },    who: "president" },
  { group: "people",    key: "changes", label: { zh: "變動紀錄", en: "Change log" },      who: "president" },
];
const WHY = { president: "why.president", "intern-staff": "why.internStaff" };
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
const BOARD_KEY = { member: "board.member", director: "board.director", president: "board.president" };
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
  if (!k) return "";
  return `<div class="msg ${k}" role="status"><span class="msg-k">${k === "err" ? T("msg.err") : T("msg.ok")}</span><span>${esc(msg)}</span></div>`;
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
  const me = { role: "cadre", board: isPresident ? "president" : "member", team: "Internship Team" };
  return ITEMS.filter(i => i.group === "passports" && i.key !== "home" && canSee(i, me))
    .map(i => `<a class="rail-item${i.key === tab ? " on" : ""}" href="#${i.key}" data-act="tab" data-t="${i.key}">${esc(T(i.label))}</a>`).join("");
}


// 只有 Internship team 的幹部與 Co-President 進得來。別的幹部看到這一句，不是錯誤畫面。
export function noAccessHTML(me) {
  return pageHead(T("noAccess.title"), T("noAccess.lede"), [{ label: T("noAccess.back"), href: withLang("../") }]);
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
// label 與 hint 是字典的鍵，畫的時候才 T()。
export const INTERN_CATS = [
  { v: "onboard", label: "cat.onboard", hint: "cat.onboard.hint" },
  { v: "project", label: "cat.project", hint: "cat.project.hint" },
  { v: "reflect", label: "cat.reflect", hint: "cat.reflect.hint" },
];
const internCatOf = v => INTERN_CATS.find(c => c.v === v) || { v, label: { zh: v, en: v }, hint: { zh: "", en: "" } };

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
      ${t.active ? `<span class="tag open">${T("it.current")}</span>` : ""}
      ${cur && cur.id === t.id ? `<span class="tag">${T("it.viewing")}</span>` : ""}</div>
    <div class="fmeta">${T("it.meta", { en: esc(t.title_en), from: esc(String(t.starts_on)), to: esc(String(t.ends_on)),
      n: (data.tasks || []).filter(x => x.term === t.id && x.active).length })}</div>
    <div class="row">
      ${cur && cur.id === t.id ? "" : `<button class="btn ghost sm" data-act="intern-see" data-id="${esc(t.id)}"${dis}>${T("it.see")}</button>`}
      <button class="btn ghost sm" data-act="intern-term-edit" data-id="${esc(t.id)}"${dis}>${T("it.edit")}</button>
      ${t.active ? "" : `<button class="btn ghost sm" data-act="intern-term-activate" data-id="${esc(t.id)}"${dis}>${T("it.activate")}</button>`}
    </div>
  </li>`).join("");

  const byCat = INTERN_CATS.map(c => ({ c, rows: tasks.filter(t => t.category === c.v) }))
    .concat([{ c: { v: "?", label: "cat.unknown", hint: { zh: "", en: "" } }, rows: tasks.filter(t => !INTERN_CATS.some(c => c.v === t.category)) }])
    .filter(g => g.rows.length);
  const taskRows = byCat.map(g => `<h3 class="sec-h" style="margin-top:18px">${esc(T(g.c.label))}<span class="mini">${esc(T(g.c.hint))}</span>
      ${g.c.v === "?" ? "" : `<button class="btn quiet sm" data-act="ipreview" data-cat="${esc(g.c.v)}">${T("ik.preview")}</button>`}</h3>
    <ul class="flist">${g.rows.map(t => {
      const n = (data.stamped || {})[t.id] || 0;
      return `<li>
      <div class="fhead"><b>${esc(t.title_zh)}</b>
        <span class="tag">${esc(t.id)}</span>
        ${t.active ? "" : `<span class="tag draft">${T("ik.off")}</span>`}
        <span class="tag">${n ? T("ik.stamped", { n }) : T("ik.noStamps")}</span></div>
      <div class="fmeta">${esc(t.title_en)}${t.description ? "・" + esc(t.description) : ""}・${T("ik.seq", { n: esc(String(t.seq)) })}</div>
      <div class="row">
        <button class="btn ghost sm" data-act="intern-task-edit" data-id="${esc(t.id)}"${dis}>${T("common.edit")}</button>
        ${t.active
          ? `<button class="btn ghost sm" data-act="intern-task-off" data-id="${esc(t.id)}"${dis}>${T("ik.disable")}</button>`
          : `<button class="btn ghost sm" data-act="intern-task-on" data-id="${esc(t.id)}"${dis}>${T("ik.enable")}</button>`}
        ${n ? "" : `<button class="btn quiet danger sm" data-act="intern-task-del" data-id="${esc(t.id)}"${dis}>${T("common.delete")}</button>`}
      </div>
    </li>`; }).join("")}</ul>`).join("");

  const headActs = [{ act: "ipreview", label: T("ik.preview") }];
  if (cur) headActs.unshift({ act: "intern-task-new", label: T("ik.new"), primary: true, disabled: busy });
  return pageHead(T("it.title"), T("it.lede", { n: data.interns || 0 }), headActs)
    + msgHTML(msg)
    + internPreviewHTML(previewCat, cur ? !!cur.active : true)
    + sectionHTML(T("it.terms"), `${terms.length ? `<ul class="flist">${termRows}</ul>` : emptyHTML(T("it.empty"), T("it.emptyHint"), { act: "intern-term-new", label: T("it.new") })}
    ${terms.length ? `<div class="row" style="margin:6px 0 0"><button class="btn ghost sm" data-act="intern-term-new"${dis}>${T("it.new")}</button></div>` : ""}`,
      { id: "terms" })
    + sectionHTML(cur ? T("ik.sectionOf", { t: esc(cur.title_zh) }) : T("ik.section"), cur
      ? `<div class="note">${T("ik.note")}</div>
        ${tasks.length ? taskRows : emptyHTML(T("ik.empty"), T("ik.emptyHint"), { act: "intern-task-new", label: T("ik.new") })}`
      : emptyHTML(T("ik.needTerm"), T("ik.needTermHint")),
      { id: "tasks" });
}

// 改或開一屆。id 建了就不能改（格子與護照靠它對應），所以改的時候那一格鎖住。
// draft（2026-10-18 端對端測試抓到的）：存檔被擋之後畫面會重畫，沒有 draft 的話
// 剛填的五格全部洗掉，使用者看到一句錯誤訊息跟一張空表單。畫面上的東西要留在畫面上。
export function internTermEditHTML(t, msg, busy, draft) {
  const cur = draft || t || { id: "", title_zh: "", title_en: "", starts_on: "", ends_on: "" };
  const dis = busy ? " disabled" : "";
  return pageHead(t ? T("it.editTitle") : T("it.newTitle"), "", [], { act: "intern-back", label: T("it.back") })
    + msgHTML(msg)
    + sectionHTML("", `<label><i>${T("it.id")}</i>
      <input id="it-id" value="${esc(cur.id)}" placeholder="2027-28"${t ? " disabled" : dis}></label>
    <div class="two">
      <label><i>${T("it.zh")}</i><input id="it-zh" value="${esc(cur.title_zh)}" placeholder="2027-28 實習"${dis}></label>
      <label><i>${T("it.en")}</i><input id="it-en" value="${esc(cur.title_en)}" placeholder="INTERNSHIP 2027-28"${dis}></label>
      <label><i>${T("it.start")}</i><input id="it-start" type="date" value="${esc(String(cur.starts_on || "").slice(0, 10))}"${dis}></label>
      <label><i>${T("it.end")}</i><input id="it-end" type="date" value="${esc(String(cur.ends_on || "").slice(0, 10))}"${dis}></label>
    </div>
    <div class="note">${T("it.note")}</div>
    <div class="form-foot">
      <button class="btn" data-act="intern-term-save"${t ? ` data-id="${esc(t.id)}"` : ""}${dis}>${busy ? T("common.saving") : T("common.save")}</button>
      <button class="btn ghost" data-act="intern-back"${dis}>${T("common.cancel")}</button>
    </div>`);
}

// 改或加一格。id 與屆別建了就不能改。
export function internTaskEditHTML(t, termId, suggestedId, msg, busy, draft) {
  const cur = draft || t || { id: suggestedId || "", term: termId, seq: "", category: "project", title_zh: "", title_en: "", description: "" };
  const dis = busy ? " disabled" : "";
  return pageHead(t ? T("ik.editTitle") : T("ik.newTitle"), T("ik.termLede", { t: esc(cur.term) }), [], { act: "intern-back", label: T("it.back") })
    + msgHTML(msg)
    + sectionHTML("", `<div class="two">
      <label><i>${T("ik.id")}</i>
        <input id="ik-id" value="${esc(cur.id)}"${t ? " disabled" : dis}></label>
      <label><i>${T("ik.cat")}</i><select id="ik-cat"${dis}>
        ${INTERN_CATS.map(c => `<option value="${c.v}"${cur.category === c.v ? " selected" : ""}>${esc(T(c.label))}（${esc(T(c.hint))}）</option>`).join("")}
      </select></label>
      <label><i>${T("ik.zh")}</i><input id="ik-zh" value="${esc(cur.title_zh)}" placeholder="第一個任務" maxlength="30"${dis}></label>
      <label><i>${T("ik.en")}</i><input id="ik-en" value="${esc(cur.title_en)}" placeholder="FIRST TASK" maxlength="30"${dis}></label>
      <label><i>${T("ik.seqLabel")}</i><input id="ik-seq" type="number" value="${esc(String(cur.seq || ""))}" placeholder="10"${dis}></label>
    </div>
    <label><i>${T("ik.desc")}</i>
      <textarea id="ik-desc" placeholder="${esc(T("ik.descPh"))}" maxlength="120"${dis}>${esc(cur.description || "")}</textarea></label>
    <div class="form-foot">
      <button class="btn" data-act="intern-task-save" data-term="${esc(cur.term)}"${t ? ` data-id="${esc(t.id)}"` : ""}${dis}>${busy ? T("common.saving") : T("common.save")}</button>
      <button class="btn ghost" data-act="intern-back"${dis}>${T("common.cancel")}</button>
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
  { v: "gather", label: "act.gather", hint: "act.gather.hint" },
  { v: "prompt", label: "act.prompt", hint: "act.prompt.hint" },
  { v: "frame",  label: "act.frame",  hint: "act.frame.hint" },
];
const actCatOf = v => ACT_CATS.find(c => c.v === v) || { v, label: { zh: v, en: v }, hint: { zh: "", en: "" } };
// 月份顯示：9 月到隔年 7 月。中文「9 月」，英文 September（字典 month.1 到 month.12）。
export const monthLabel = m => (STRINGS_HAS_MONTH(m) ? T("month." + m) : `${m}`);
const STRINGS_HAS_MONTH = m => Number(m) >= 1 && Number(m) <= 12;

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
      <button class="btn quiet sm" data-act="preview-reload">${T("pv.reload")}</button>
      <a class="btn quiet sm" href="${openSrc || src}" target="_blank" rel="noopener">${T("pv.open")}</a>
      <button class="btn quiet sm" data-act="preview-close">${T("pv.close")}</button></div>
    <iframe class="preview-frame" src="${src}" title="${esc(T("pv.frameTitle"))}" loading="lazy"></iframe>
  </div>`;
}

export function passportPreviewHTML(previewMonth) {
  if (previewMonth == null) return "";
  // 框裡帶 &bare=1：那一頁不畫頂欄與分頁列（Paul 2026-10-19 拍板），框裡只有那本護照。
  // 「另開視窗」開的是完整的那一頁，有頂欄。
  const full = `../../passport/?month=${encodeURIComponent(String(previewMonth))}`;
  return previewBoxHTML(T("pv.title", { m: esc(monthLabel(previewMonth)) }), T("pv.hint"), full + "&bare=1", full);
}

// 實習護照的預覽（2026-10-16）。嵌的是 /intern-passport/ 的「樣書」：目前這一屆的格子、假的持照人、沒有章。
// 樣書只畫**目前這一屆**（active 的那一屆），後台正在看別屆時這裡會提醒。
export function internPreviewHTML(cat, viewingActive) {
  if (cat == null) return "";
  const c = INTERN_CATS.find(x => x.v === cat);
  const full = `../../intern-passport/?view=sample${cat ? `&cat=${encodeURIComponent(cat)}` : ""}`;
  const hint = (viewingActive === false ? T("ipv.notActive") : T("ipv.hint"));
  return previewBoxHTML(c ? T("ipv.titleCat", { c: esc(T(c.label)) }) : T("ipv.title"), hint, full + "&bare=1", full);
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
        <span class="tag">${esc(T(actCatOf(a.category).label))}</span>
        ${a.active ? "" : `<span class="tag draft">${T("ik.off")}</span>`}
        <span class="tag">${n ? T("ik.stamped", { n }) : T("ik.noStamps")}</span>
        ${a.needs_host ? `<span class="tag">${T("ak.needsHost")}</span>` : ""}
        ${a.callback_to ? `<span class="tag">${T("ak.callback", { id: esc(a.callback_to) })}</span>` : ""}</div>
      <div class="fmeta">${esc(a.title_en)}${a.description ? "・" + esc(a.description) : ""}</div>
      <div class="row">
        <button class="btn ghost sm" data-act="act-edit" data-id="${esc(a.id)}"${dis}>${T("common.edit")}</button>
        ${a.active
          ? `<button class="btn ghost sm" data-act="act-off" data-id="${esc(a.id)}"${dis}>${T("ik.disable")}</button>`
          : `<button class="btn ghost sm" data-act="act-on" data-id="${esc(a.id)}"${dis}>${T("ik.enable")}</button>`}
        ${n ? "" : `<button class="btn quiet danger sm" data-act="act-del" data-id="${esc(a.id)}"${dis}>${T("common.delete")}</button>`}
      </div>
    </li>`;
  };
  const monthBlocks = months.map(m => {
    const rows = acts.filter(a => a.month === m.month);
    return sectionHTML(esc(monthLabel(m.month)),
      `${rows.length ? `<ul class="flist">${rows.map(actRow).join("")}</ul>` : `<div class="empty sm">${T("pa.emptyMonth")}</div>`}
      <div class="row" style="margin:4px 0 0"><button class="btn ghost sm" data-act="act-new" data-month="${esc(String(m.month))}"${dis}>${T("pa.addIn", { m: esc(monthLabel(m.month)) })}</button></div>`,
      { id: `m${m.month}`, hint: T("pa.theme", { t: m.theme_zh ? esc(m.theme_zh) : T("pa.themeEmpty") }),
        actions: [{ act: "month-edit", label: T("pa.editTheme"), seq: String(m.seq), disabled: busy },
                  { act: "preview", label: T("pa.preview"), month: String(m.month) }] });
  }).join("");
  const jump = months.length ? `<nav class="jump" aria-label="${esc(T("pa.jump"))}">${months.map(m => `<a href="#m${esc(String(m.month))}">${esc(monthLabel(m.month))}</a>`).join("")}</nav>` : "";
  return pageHead(T("pa.title"), T("pa.lede"))
    + msgHTML(msg)
    + `<div class="note">${T("pa.note")}
      ${months.length ? "" : T("pa.noMonths")}</div>`
    + jump
    + passportPreviewHTML(previewMonth, months)
    + (months.length ? monthBlocks : emptyHTML(T("pa.monthsGone"), T("pa.monthsGoneHint")));
}

// 城市（2026-10-19 起自己一頁，側欄「護照 > 城市」）。24 個城市不該跟 33 格擠在同一頁的最底下。
// 入境章抽城市用的。只有停用與恢復，沒有刪：visas 的外鍵本來就擋，後台不給那顆按鈕。
export function citiesHTML(data, msg, busy) {
  const dests = data.destinations || [];
  const dis = busy ? " disabled" : "";
  const rows = dests.map(d => `<tr${d.active ? "" : ' class="off"'}>
    <td class="t-main"><b>${esc(d.city)}</b></td>
    <td><span class="tag">${esc(d.code)}</span></td>
    <td>${d.active ? `<span class="tag open">${T("ct.drawable")}</span>` : `<span class="tag draft">${T("ik.off")}</span>`}</td>
    <td class="t-act">
      <button class="btn quiet sm" data-act="dest-edit" data-code="${esc(d.code)}"${dis}>${T("ct.rename")}</button>
      ${d.active
        ? `<button class="btn quiet sm" data-act="dest-off" data-code="${esc(d.code)}"${dis}>${T("ik.disable")}</button>`
        : `<button class="btn quiet sm" data-act="dest-on" data-code="${esc(d.code)}"${dis}>${T("ik.enable")}</button>`}
    </td>
  </tr>`).join("");
  return pageHead(T("ct.title"), T("ct.lede", { n: dests.length, a: dests.filter(d => d.active).length }),
      [{ act: "dest-new", label: T("ct.new"), primary: true, disabled: busy }])
    + msgHTML(msg)
    + `<div class="note">${T("ct.note")}</div>`
    + sectionHTML("", dests.length
      ? `<table class="table"><thead><tr><th>${T("ct.city")}</th><th>${T("ct.code")}</th><th>${T("ct.status")}</th><th></th></tr></thead><tbody>${rows}</tbody></table>`
      : emptyHTML(T("ct.empty"), T("ct.emptyHint"), { act: "dest-new", label: T("ct.new") }), { id: "cities" });
}

// 改或加一格。編號是標籤不是輸入框；改既有的格子時月份也鎖住。
// draft：存檔被擋之後畫面會重畫，沒有 draft 的話剛填的東西全部洗掉（實習護照那邊 2026-10-18 抓過同一件事）。
export function activityEditHTML(a, month, months, msg, busy, draft) {
  const cur = draft || a || { id: "", month, category: "gather", title_zh: "", title_en: "", description: "", needs_host: false, callback_to: "" };
  const dis = busy ? " disabled" : "";
  const lock = a ? " disabled" : dis;
  return pageHead(a ? T("ak.editTitle") : T("ak.newTitle"), a ? T("ak.idLocked", { id: esc(a.id) }) : T("ak.idAuto"), [], { act: "cadre-back", label: T("ak.back") })
    + msgHTML(msg)
    + sectionHTML("", `<div class="two">
      <label><i>${T("ak.month")}${a ? T("ak.monthLocked") : ""}</i><select id="ak-month"${lock}>
        ${(months || []).map(m => `<option value="${esc(String(m.month))}"${String(cur.month) === String(m.month) ? " selected" : ""}>${esc(monthLabel(m.month))}</option>`).join("")}
      </select></label>
      <label><i>${T("ik.cat")}</i><select id="ak-cat"${dis}>
        ${ACT_CATS.map(c => `<option value="${c.v}"${cur.category === c.v ? " selected" : ""}>${esc(T(c.label))}（${esc(T(c.hint))}）</option>`).join("")}
      </select></label>
      <label><i>${T("ik.zh")}</i><input id="ak-zh" value="${esc(cur.title_zh)}" placeholder="開學電影夜" maxlength="30"${dis}></label>
      <label><i>${T("ik.en")}</i><input id="ak-en" value="${esc(cur.title_en)}" placeholder="OPENING NIGHT" maxlength="30"${dis}></label>
    </div>
    <label><i>${T("ik.desc")}</i>
      <textarea id="ak-desc" placeholder="${esc(T("ak.descPh"))}" maxlength="200"${dis}>${esc(cur.description || "")}</textarea></label>
    <div class="two">
      <label class="check" style="display:flex;gap:10px;align-items:center;font-size:14.5px">
        <input id="ak-host" type="checkbox" style="width:18px;height:18px"${cur.needs_host ? " checked" : ""}${dis}>
        <span>${T("ak.host")}</span></label>
      <label><i>${T("ak.cb")}</i>
        <input id="ak-cb" value="${esc(cur.callback_to || "")}" placeholder="09B" maxlength="4"${dis}></label>
    </div>
    <div class="form-foot">
      <button class="btn" data-act="act-save"${a ? ` data-id="${esc(a.id)}"` : ""}${dis}>${busy ? T("common.saving") : T("common.save")}</button>
      <button class="btn ghost" data-act="cadre-back"${dis}>${T("common.cancel")}</button>
    </div>`);
}

// 改一個月右上角的時刻。seq 與月份不給改，只有那一串字。
export function monthEditHTML(m, msg, busy, draft) {
  const cur = draft || m || { seq: "", month: "", theme_zh: "", theme_en: "" };
  const dis = busy ? " disabled" : "";
  return pageHead(T("mk.title", { m: esc(monthLabel(cur.month)) }), T("mk.lede"), [], { act: "cadre-back", label: T("ak.back") })
    + msgHTML(msg)
    + sectionHTML("", `<div class="two">
      <label><i>${T("mk.zh")}</i><input id="mk-zh" value="${esc(cur.theme_zh || "")}" placeholder="07:00" maxlength="20"${dis}></label>
      <label><i>${T("mk.en")}</i><input id="mk-en" value="${esc(cur.theme_en || "")}" maxlength="40"${dis}></label>
    </div>
    <div class="form-foot">
      <button class="btn" data-act="month-save" data-seq="${esc(String(cur.seq))}"${dis}>${busy ? T("common.saving") : T("common.save")}</button>
      <button class="btn ghost" data-act="cadre-back"${dis}>${T("common.cancel")}</button>
    </div>`);
}

// 加一個城市或改名字。代碼建了就不能改（visas 靠它）。
export function destinationEditHTML(d, msg, busy, draft) {
  const cur = draft || d || { code: "", city: "", active: true };
  const dis = busy ? " disabled" : "";
  return pageHead(d ? T("dk.editTitle") : T("dk.newTitle"), T("dk.lede"), [], { act: "cities-back", label: T("dk.back") })
    + msgHTML(msg)
    + sectionHTML("", `<div class="two">
      <label><i>${T("dk.code", { locked: d ? T("dk.codeLocked") : "" })}</i>
        <input id="dk-code" value="${esc(cur.code)}" placeholder="TPE" maxlength="8"${d ? " disabled" : dis}></label>
      <label><i>${T("dk.city")}</i><input id="dk-city" value="${esc(cur.city)}" placeholder="TAIPEI" maxlength="40"${dis}></label>
    </div>
    <div class="form-foot">
      <button class="btn" data-act="dest-save"${d ? ` data-code="${esc(d.code)}"` : ""} data-active="${cur.active === false ? "0" : "1"}"${dis}>${busy ? T("common.saving") : T("common.save")}</button>
      <button class="btn ghost" data-act="cities-back"${dis}>${T("common.cancel")}</button>
    </div>`);
}

// ═══════════════════════════════════════════════════════════════════════
// 實習護照的蛇梯棋（2026-10-22）：Internship team 排棋盤。
// 資料：board = { term, size, active }，squares = [{ pos, kind, task_id, goes_to }]（空格不列）。
// draft 是畫面上改到一半的：{ size, squares: { "<pos>": { kind, task_id, goes_to } }, dirty }。
// 門在資料庫的 save_board() 與 set_board_active()；畫面上先擋一次（梯子往下、蛇往上）只是少一次來回。
// ═══════════════════════════════════════════════════════════════════════
export const BOARD_SIZES = [20, 30, 40];
export const BOARD_PER_ROW = 5;
// 蛇形排法：第 1 排（最下面）左到右，第 2 排右到左。回傳由上到下的每一排、每一排由左到右的格號。
// **跟 intern-passport/src/ui.js 的 boardRows 同一份規則**（資料夾之間不互相 import），test/intern-board.test.mjs 比對。
export function boardRows(size, perRow) {
  const per = perRow || BOARD_PER_ROW;
  const rows = [];
  for (let start = 1; start <= size; start += per) {
    const row = [];
    for (let p = start; p < start + per && p <= size; p++) row.push(p);
    if (Math.floor((start - 1) / per) % 2 === 1) row.reverse();
    rows.push(row);
  }
  return rows.reverse();
}
// draft 的 squares 轉成 save_board() 要的陣列。空格不送。
export function squaresToList(draft) {
  return Object.entries(draft.squares || {})
    .map(([pos, s]) => ({ pos: Number(pos), kind: s.kind, task_id: s.kind === "task" ? (s.task_id || null) : null,
                          goes_to: (s.kind === "ladder" || s.kind === "snake") ? (s.goes_to == null ? null : Number(s.goes_to)) : null }))
    .filter(s => s.kind && s.kind !== "plain")
    .sort((a, b) => a.pos - b.pos);
}
// 畫面上先擋一次。回傳錯誤訊息的鍵，沒問題回 null。
export function squareProblem(pos, s, size) {
  if (!s || s.kind === "plain") return null;
  if (s.kind === "task") return s.task_id ? null : "err.needTask";
  const g = Number(s.goes_to);
  if (!g || g < 1 || g > size) return "err.goesRange";
  if (s.kind === "ladder" && g <= pos) return "err.ladderUp";
  if (s.kind === "snake" && g >= pos) return "err.snakeDown";
  return null;
}

export function boardAdminHTML(term, tasks, board, draft, sel, msg, busy) {
  if (!term) {
    return pageHead(T("bd.title"), "") + msgHTML(msg) + emptyHTML(T("bd.noTerm"), T("bd.noTermHint"));
  }
  const d = draft || { size: (board && board.size) || 30, squares: {}, dirty: false };
  const size = Number(d.size) || 30;
  const active = !!(board && board.active);
  const dis = busy ? " disabled" : "";
  const sq = d.squares || {};
  const byTask = Object.fromEntries((tasks || []).map(t => [t.id, t]));
  const kindText = (pos, s) => {
    if (!s || s.kind === "plain") return "";
    if (s.kind === "task") return byTask[s.task_id] ? esc(byTask[s.task_id].title_zh || byTask[s.task_id].title_en) : T("bd.kind.task");
    if (s.kind === "ladder") return "↑ " + esc(String(s.goes_to || ""));
    return "↓ " + esc(String(s.goes_to || ""));
  };
  const counts = { ladder: 0, snake: 0, task: 0 };
  for (const s of Object.values(sq)) if (counts[s.kind] != null) counts[s.kind]++;
  const grid = boardRows(size).map(row => row.map(pos => {
    const s = sq[pos];
    const kind = s ? s.kind : "plain";
    const locked = active && (kind === "ladder" || kind === "snake");
    return `<button class="bsq ${kind}${sel === pos ? " on" : ""}${pos === size ? " finish" : ""}${locked ? " off" : ""}" data-act="board-pick" data-pos="${pos}"${locked ? ' aria-disabled="true"' : ""} title="${T("bd.pick", { n: pos })}">
      <span class="n">${pos}${pos === size ? ` ${esc(T("bd.finish"))}` : ""}</span><span class="k">${kindText(pos, s)}</span></button>`;
  }).join("")).join("");
  const cur = sel ? (sq[sel] || { kind: "plain" }) : null;
  const curLocked = cur && active && (cur.kind === "ladder" || cur.kind === "snake");
  const editor = sel ? `<div class="bedit" id="board-edit">
    <h3>${esc(T("bd.pick", { n: sel }))}${sel === size ? ` <span class="tag">${esc(T("bd.finish"))}</span>` : ""}</h3>
    <div class="two">
      <label><i>${esc(T("bd.kind"))}</i><select id="bq-kind"${dis || (curLocked ? " disabled" : "")}>
        ${["plain", "task", "ladder", "snake"].map(k => `<option value="${k}"${cur.kind === k ? " selected" : ""}${active && (k === "ladder" || k === "snake") && cur.kind !== k ? " disabled" : ""}>${esc(T("bd.kind." + k))}</option>`).join("")}
      </select></label>
      <label><i>${esc(T("bd.task"))}</i><select id="bq-task"${dis}>
        <option value="">—</option>
        ${(tasks || []).map(t => `<option value="${esc(t.id)}"${cur.task_id === t.id ? " selected" : ""}>${esc(t.title_zh || t.title_en)} (${esc(t.id)})</option>`).join("")}
      </select></label>
      <label><i>${esc(T("bd.goes"))}</i><input id="bq-goes" type="number" min="1" max="${size}" value="${esc(String(cur.goes_to || ""))}"${dis || (curLocked ? " disabled" : "")}></label>
    </div>
    <div class="row">
      <button class="btn sm" data-act="board-apply" data-pos="${sel}"${dis}>${esc(T("bd.apply"))}</button>
      <button class="btn ghost sm" data-act="board-clear" data-pos="${sel}"${dis || (curLocked ? " disabled" : "")}>${esc(T("bd.clear"))}</button>
    </div>
    ${sel === size ? `<div class="mini" style="margin-top:8px">${esc(T("bd.finishHint"))}</div>` : ""}
  </div>` : `<div class="mini">${esc(T("bd.pickHint"))}</div>`;

  return pageHead(T("bd.title"), T("bd.lede", { t: esc(term.title_zh) }),
      [{ act: "board-save", label: busy ? T("bd.saving") : T("bd.save"), primary: true, disabled: busy },
       { act: "ipreview", label: T("bd.preview") }])
    + msgHTML(msg)
    + `<div class="note">${esc(T("bd.rules"))}</div>`
    + sectionHTML(T("bd.setup"), `<div class="two">
        <label><i>${esc(T("bd.size"))}</i><select id="bd-size"${dis || (active ? " disabled" : "")}>
          ${BOARD_SIZES.map(n => `<option value="${n}"${size === n ? " selected" : ""}>${n}</option>`).join("")}
        </select></label>
        <div>
          <div class="mini" style="margin-bottom:8px">${esc(active ? T("bd.on") : T("bd.off"))}${d.dirty ? ` <span class="tag warn">${esc(T("bd.unsaved"))}</span>` : ""}</div>
          ${board ? `<button class="btn ghost sm" data-act="board-toggle" data-on="${active ? "0" : "1"}"${dis}>${esc(active ? T("bd.turnOff") : T("bd.turnOn"))}</button>` : ""}
        </div>
      </div>`, { id: "board-setup" })
    + sectionHTML(T("bd.layout"), `<div class="bgrid" style="grid-template-columns:repeat(${BOARD_PER_ROW},1fr)">${grid}</div>${editor}`,
        { id: "board-layout", hint: T("bd.layoutHint", { l: counts.ladder, s: counts.snake, k: counts.task }) });
}

export function notCadreHTML() {
  return pageHead(T("notCadre.title"), T("notCadre.lede"), [{ label: T("notCadre.back"), href: "../../app/" }]);
}

export function downHTML() {
  return pageHead(T("down.title"), T("down.lede"), [{ act: "retry", label: T("common.retry") }]);
}
