// 後台「人與權限」那一組的畫面：邀請碼。職位（board_role）與 team 的改動是批 3 的事，到時加在這裡。
// 2026-10-15 從 admin/src/ui.js 原樣搬過來（後台拆成四個資料夾）。
// **esc 是自己的一份**，不從別的資料夾 import。
// 申請管理的畫面。**esc 是自己的一份**，不從別的資料夾 import
//（跟 app/ 與 availability/ 同一條規矩：資料夾之間不互相依賴）。
//
// 2026-10-19 起畫面上的字全部從 ./strings.js 的字典來（T("鍵")），中英兩版並排在那一支裡。
// 這一支只管拼 HTML，不再寫死任何一句給人看的字。怎麼加一句見 README「後台的中英切換」。
import { T, lang, setLang, withLang, isErr, STRINGS } from "./strings.js";
export { T, lang, setLang };
// 一個人在畫面上要顯示的兩個名字。**同一份規則在 admin/site、passport、availability 也各有一份**
//（資料夾之間不互相 import），test/names.test.mjs 逐項比對。
export function namesOf(p) {
  const zh = String(p.name_zh || "").trim();
  const en = String(p.name_en || "").trim();
  return {
    name: zh || en || T("common.noName"),
    alt: zh && en && zh !== en ? en : "",
  };
}
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
  { key: "site",      label: { zh: "對外",     en: "Public site" },  href: "/admin/site/",      who: "cadre",        hint: { zh: "資源、團隊頁、校友頁、信件文案、歷史之路", en: "Resources, team page, alumni page, email copy, history" } },
  { key: "passports", label: { zh: "護照",     en: "Passports" },    href: "/admin/passports/", who: "ws:passport|intern-passport", hint: { zh: "兩本護照的格子", en: "Boxes in both passports" } },
  { key: "people",    label: { zh: "人與權限", en: "People" },       href: "/admin/people/",    who: "senior",       hint: { zh: "名單、職級、工作區、屆別、邀請碼", en: "Roster, ranks, workspaces, terms, invite codes" } },
  // 2026-11-08 財務：錢的事只給 Co-President、Senior Adviser 與 Sponsorship 的 Director（這一屆有那個職位的人）。
  // who 是 "ws:finance"：my_access() 會在 finance 那一格填 view 或 edit（2026-11-08-finance.sql），不是真的工作區，只是借同一條路。
  { key: "finance",   label: { zh: "財務",     en: "Finance" },      href: "/admin/finance/",   who: "ws:finance",   hint: { zh: "帳戶、收支、預算、匯出", en: "Accounts, income & expenses, budget, export" } },
];
// 側欄上每一行。要加一個新的後台分頁，就在這裡加一行（四份都要加），
// 然後在那一組的 ui.js 加一個畫面函式、main.js 接 data-act="tab" data-t="<key>"。
// 2026-10-28 Paul：「側欄太亂，要很用力才看得出哪個是哪個」。所以：
//   group 仍是「在哪個資料夾」（網址不變），sec 是側欄上的哪一段（照「要做什麼事」分，跟資料夾無關），
//   名字改成一看就懂、不重複（兩個「總覽」、兩個「行銷需求」都改掉），每一行一句 hint 說這頁是做什麼的。
export const ITEMS = [
  // 2026-10-23 第三次重整批 4：叫「總覽」不叫「首頁」，頂欄那一顆「後台」跟它才不會是同一個地方兩個名字。
  { group: "forms",     key: "home",     sec: "",         label: { zh: "總覽",     en: "Overview" },          hint: { zh: "今天要處理的事", en: "What needs you today" }, who: "cadre" },
  // 2026-11-02 會議紀錄：每一位幹部看得到；排會與記會議的門在資料庫（senior 或那個 team 的 Director）。
  { group: "forms",     key: "meetings", sec: "meet",     label: { zh: "會議",     en: "Meetings" },          hint: { zh: "排過的會、會議紀錄", en: "Scheduled meetings and notes" }, who: "cadre" },
  // 2026-11-01 活動上架：每一位幹部看得到活動清單（自己 team 的），開活動要 team 的 Director 或 senior（門在資料庫）。
  { group: "forms",     key: "events",   sec: "meet",     label: { zh: "活動",     en: "Events" },            hint: { zh: "上到對外首頁的活動", en: "Events on the public site" }, who: "cadre" },
  // 2026-10-31 行銷需求單：每一位幹部都能送；佇列只有 Marketing 需求工作區裡的人（與靠職級的兩級）看得到。
  { group: "forms",     key: "request",  sec: "mkt",      label: { zh: "請 Marketing 做貼文", en: "Ask Marketing for a post" }, hint: { zh: "送一張需求單", en: "Send a request" }, who: "cadre" },
  { group: "forms",     key: "requests", sec: "mkt",      label: { zh: "Marketing 的待辦", en: "Marketing's queue" }, hint: { zh: "大家送來的需求單", en: "Requests sent to Marketing" }, who: "ws:custom:marketing-requests" },
  { group: "forms",     key: "forms",    sec: "apply",    label: { zh: "申請表",   en: "Application forms" }, hint: { zh: "報名表、審核、簽到", en: "Sign-up forms, review, check-in" }, who: "cadre" },
  { group: "passports", key: "cadre",    sec: "pass",     label: { zh: "幹部護照", en: "Cadre passport" },    hint: { zh: "月份、格子、揭曉", en: "Months, boxes, reveals" }, who: "ws:passport" },
  { group: "passports", key: "cities",   sec: "pass",     label: { zh: "入境章的城市", en: "Entry-stamp cities" }, hint: { zh: "蓋滿一個月抽到的城市", en: "Cities drawn when a month is full" }, who: "ws:passport" },
  { group: "passports", key: "interns",  sec: "pass",     label: { zh: "實習護照", en: "Intern passport" },   hint: { zh: "屆別、分類、格子", en: "Terms, groups, boxes" }, who: "ws:intern-passport" },
  { group: "passports", key: "board",    sec: "pass",     label: { zh: "實習的蛇梯棋", en: "Intern game board" }, hint: { zh: "棋盤上的格子與蛇梯", en: "Squares, snakes and ladders" }, who: "ws:intern-passport" },
  { group: "site",      key: "res",      sec: "web",      label: { zh: "資源庫",   en: "Resources" },         hint: { zh: "登入才拿得到的資料", en: "Files behind the login" }, who: "cadre" },
  { group: "site",      key: "team",     sec: "web",      label: { zh: "團隊頁",   en: "Team page" },         hint: { zh: "對外的幹部名單", en: "Who's on the public team page" }, who: "senior" },
  { group: "site",      key: "stories",  sec: "web",      label: { zh: "校友故事", en: "Alumni stories" },    hint: { zh: "核可校友自己寫的故事", en: "Approve alumni's own stories" }, who: "senior" },
  // 2026-11-06 歷史之路：每一位幹部看得到清單；加站、傳照片、按 ready 要 Marketing 資源工作區「管」或 senior，上架只有 senior（門在資料庫）。
  { group: "site",      key: "history",  sec: "web",      label: { zh: "BT 歷史之路", en: "BT history road" }, hint: { zh: "/history/ 上的每一站", en: "Each stop on /history/" }, who: "cadre" },
  { group: "site",      key: "mail",     sec: "web",      label: { zh: "信的文字", en: "Email wording" },     hint: { zh: "網站寄出去的每一封信", en: "Every email the site sends" }, who: "senior" },
  { group: "people",    key: "roster",     sec: "people", label: { zh: "幹部名單", en: "Roster" },            hint: { zh: "每個人的職級與 team", en: "Everyone's rank and team" }, who: "senior" },
  // 2026-10-29 邀請信：打 email 與職位寄一封信。Co-President 與 Senior Adviser 都邀得了（撤銷只有 Co-President，門在資料庫）。
  { group: "people",    key: "invites",    sec: "people", label: { zh: "邀請新的人", en: "Invite people" },    hint: { zh: "寄邀請信、邀請碼", en: "Invite emails and codes" }, who: "senior" },
  { group: "people",    key: "workspaces", sec: "people", label: { zh: "誰能改什麼", en: "Who can edit what" }, hint: { zh: "工作區與權限", en: "Workspaces and access" }, who: "senior" },
  { group: "people",    key: "terms",      sec: "people", label: { zh: "屆別",     en: "Years (terms)" },     hint: { zh: "這一屆從哪天到哪天", en: "When this year starts and ends" }, who: "senior" },
  { group: "people",    key: "changes",    sec: "people", label: { zh: "誰改了什麼", en: "Change log" },       hint: { zh: "職級與權限的每一次變動", en: "Every rank and access change" }, who: "senior" },
  // 2026-11-08 財務：五個分頁都是同一群人（看的人五個都看得到，改得動的人才有新增與作廢那幾顆，門在資料庫）。
  { group: "finance",   key: "overview",   sec: "money",  label: { zh: "錢的總覽", en: "Money overview" },    hint: { zh: "餘額、這一屆收支", en: "Balances and this year's totals" }, who: "ws:finance" },
  { group: "finance",   key: "tx",         sec: "money",  label: { zh: "收支紀錄", en: "Transactions" },      hint: { zh: "記一筆收入或支出", en: "Record income or spending" }, who: "ws:finance" },
  { group: "finance",   key: "accounts",   sec: "money",  label: { zh: "帳戶與類別", en: "Accounts & categories" }, hint: { zh: "銀行帳戶、收支類別", en: "Bank accounts, categories" }, who: "ws:finance" },
  { group: "finance",   key: "budget",     sec: "money",  label: { zh: "預算",     en: "Budget" },            hint: { zh: "每個類別花了多少", en: "Spent vs planned, by category" }, who: "ws:finance" },
  { group: "finance",   key: "export",     sec: "money",  label: { zh: "匯出",     en: "Export" },            hint: { zh: "下載成試算表", en: "Download as a spreadsheet" }, who: "ws:finance" },
];
// 側欄的段落（2026-10-28）。順序照常用到不常用。icon 是 24×24 的線條圖，一段一個，讓眼睛不用讀字就認得出來。
export const SECTIONS = [
  { key: "meet",   label: { zh: "會議與活動", en: "Meetings & events" }, icon: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>' },
  { key: "mkt",    label: { zh: "行銷",       en: "Marketing" },         icon: '<path d="M3 11v2a1 1 0 0 0 1 1h3l5 4V6L7 10H4a1 1 0 0 0-1 1z"/><path d="M16 9a4 4 0 0 1 0 6"/>' },
  { key: "apply",  label: { zh: "申請",       en: "Applications" },      icon: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h4"/>' },
  { key: "pass",   label: { zh: "護照",       en: "Passports" },         icon: '<rect x="5" y="3" width="14" height="18" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M9 17h6"/>' },
  { key: "web",    label: { zh: "對外網站",   en: "Website" },           icon: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>', note: "rail.foot" },
  { key: "people", label: { zh: "人",         en: "People" },            icon: '<circle cx="9" cy="8" r="3"/><path d="M3 20a6 6 0 0 1 12 0"/><circle cx="17" cy="9" r="2.5"/><path d="M15 20a5 5 0 0 1 6-4.6"/>' },
  { key: "money",  label: { zh: "錢",         en: "Money" },             icon: '<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M7 12h.01M17 12h.01"/>' },
];
const WHY = { president: "why.president", senior: "why.senior", "ws:passport|intern-passport": "why.passports", "ws:finance": "why.finance" };
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
      on ? ' aria-current="page"' : ""}><span class="rail-txt"><b>${esc(T(it.label))}</b>${it.hint ? `<small>${esc(T(it.hint))}</small>` : ""}</span>${n}</a>`;
  };
  const home = ITEMS.find(i => i.key === "home");
  // 2026-10-28：一段一個 <details>。現在這一頁所在的那一段打開，其他段收起來只剩一行（icon、名字、幾頁）。
  // 點段名就打開，不用 JS。進不去的那幾行不畫；一行都進不去的段整段變淡、打不開。
  const cur = (ITEMS.find(i => i.group === group && i.key === tab) || {}).sec;
  const svg = d => `<svg class="rail-ico" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  const groups = SECTIONS.map(sec => {
    const rows = ITEMS.filter(i => i.sec === sec.key && (!String(i.who).startsWith("ws:") || canSee(i, me)));
    const open = rows.filter(i => canSee(i, me) && canEnter(GROUPS.find(g => g.key === i.group), me));
    if (!rows.length) return "";
    if (!open.length) return `<div class="rail-sec off" title="${esc(T(WHY[(GROUPS.find(g => g.key === rows[0].group) || {}).who]) || "")}">${svg(sec.icon)}<span>${esc(T(sec.label))}</span></div>`;
    return `<details class="rail-sec-box"${sec.key === cur ? " open" : ""}><summary class="rail-sec${sec.key === cur ? " here" : ""}">${svg(sec.icon)}<span>${esc(T(sec.label))}</span><i class="rail-n">${open.length}</i></summary>
      ${rows.map(it => canSee(it, me) && canEnter(GROUPS.find(g => g.key === it.group), me) ? item(it) : "").join("")}${sec.note ? `<div class="rail-foot">${T(sec.note)}</div>` : ""}</details>`;
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
    if (!d) { d = debounce(f => run(box, f), TYPED_MS); timers.set(box, d); }
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
  if (id === "finance") return T("ws.long.finance");
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
  if (id === "finance") return "/admin/finance/#overview";
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
  const me = { role: "cadre", board: isPresident === false ? "member" : "president", ws: { "intern-passport": "edit" } };
  return ITEMS.filter(i => i.group === "people" && i.key !== "home" && canSee(i, me))
    .map(i => `<a class="rail-item${i.key === tab ? " on" : ""}" href="#${i.key}" data-act="tab" data-t="${i.key}">${esc(T(i.label))}</a>`).join("");
}


// ═══════════════════════════════════════════════════════════════════════
// 幹部名單、職位與 team（2026-10-21，批 3）。Paul 2026-10-15 拍板第 2、3 題。
// 改職位與改 team 都走資料庫的函式（門在那裡），每一筆都寫進 role_changes，
// 另一位 Co-President 登入就看得到。這一頁只是表單。
// ═══════════════════════════════════════════════════════════════════════
// BT 的六個 team。**這份清單在 settings/src/ui.js 與 passport/src/ui.js 各有一模一樣的一份**
//（資料夾之間不互相 import），test/teams.test.mjs 逐字比對。
export const TEAMS = ["Curriculum Team", "Mentorship Team", "Marketing Team",
                      "Sponsorship Team", "Internship Team", "Community Relations Team"];
// 跟 settings/src/ui.js 的 parseTeams 同一份規則（test/teams.test.mjs 比對）。
export function parseTeams(raw) {
  const out = [];
  for (const part of String(raw || "").split(/[,、;；]/)) {
    const t = part.trim().replace(/\s+/g, " ");
    if (t && !out.includes(t)) out.push(t);
  }
  return out;
}
// ═══════════════════════════════════════════════════════════════════════
// 職級與指派（2026-10-24，權限重新設計批 2）。設計：docs/2026-10-23-權限重新設計.md。
// 畫面上一律叫「職級」，四個值顯示成 Associate / Director / Senior Adviser / Co-President；
// board_role 與 member 這兩個字只留在程式與文件裡。label 與 hint 是字典的鍵，畫的時候才 T()。
// 每一顆按鈕背後都是資料庫的一支函式，門在那裡；這裡少畫一顆不是安全機制。
// ═══════════════════════════════════════════════════════════════════════
// 2026-10-28 五級，順序就是下拉與名單的順序：Co-President、Senior Adviser、Director、Adviser、Associate。
export const BOARD_ROLES = [
  { v: "president",      label: "board.president", hint: "role.president.hint" },
  { v: "senior_adviser", label: "board.senior",    hint: "role.senior.hint" },
  { v: "director",       label: "board.director",  hint: "role.director.hint" },
  { v: "adviser",        label: "board.adviser",   hint: "role.adviser.hint" },
  { v: "member",         label: "board.member",    hint: "role.member.hint" },
];
export const boardLabel = v => T((BOARD_ROLES.find(r => r.v === v) || BOARD_ROLES.find(r => r.v === "member")).label);
export const rankOrder = v => { const i = BOARD_ROLES.findIndex(r => r.v === v); return i < 0 ? BOARD_ROLES.length : i; };
// 推標題用的固定標籤：title_en 永遠是英文、title_zh 永遠是中文那一句，**不看現在畫面是哪一種語言**
//（不然中文畫面存出來的 title_en 會是「顧問, X」）。
const RANK_EN = { president: "Co-President", senior_adviser: "Senior Adviser", director: "Director", adviser: "Adviser", member: "Associate" };
const rankZh = v => { const r = BOARD_ROLES.find(x => x.v === v); return r ? T({ zh: STRINGS[r.label].zh, en: STRINGS[r.label].zh }) : ""; };
// 職位下拉（Paul 2026-10-24：「不要用打的，給一個下拉列我們的職級」）。
// 存的 title_en / title_zh 從職級標籤加 team 推出來：「Director, Curriculum Team」，沒有 team 就只有「Director」。
// 中文那一欄也用同一個英文標籤（職級在中文畫面本來就印英文），加 team。選「自訂」才露出兩個文字框，存他打的。
export const RANK_CHOICES = BOARD_ROLES.map(r => r.v);
// 不綁 team 的兩級（Paul 2026-10-24）：Co-President 與 Senior Adviser 是整個組織的，職位上沒有 team，推出來的字就只有職級。
// Adviser（10-28 那一級）跟著一個 team，不在這裡。
export const ORG_WIDE = ["president", "senior_adviser"];
export const isOrgWide = rank => ORG_WIDE.includes(rank);
export function deriveTitle(rank, team) {
  const t = isOrgWide(rank) ? "" : String(team || "").trim();
  const en = RANK_EN[rank] || "", zh = rankZh(rank) || en;
  return { title_en: t ? `${en}, ${t}` : en, title_zh: t ? `${zh}, ${t}` : zh };
}
// 既有的紀錄：title_en 對得上某一級推出來的字就選那一級，對不上就是「自訂」，文字框照存的印，不會丟。
export function rankOfTitle(title_en, team) {
  const s = String(title_en || "").trim().toLowerCase();
  if (!s) return "";
  for (const r of RANK_CHOICES) if (deriveTitle(r, team).title_en.toLowerCase() === s) return r;
  return "custom";
}
// 貼一整屆的第三欄可以是職級名（Director、Co-President…）或自訂文字。
export function rankByName(s) {
  const q = String(s || "").trim().toLowerCase();
  return RANK_CHOICES.find(r => RANK_EN[r].toLowerCase() === q || rankZh(r).toLowerCase() === q) || "";
}
// 職位那一格的下拉。sel 是 RANK_CHOICES 之一、"custom" 或空字串。
export function rankSelect(id, sel, dis) {
  return `<select id="${id}" data-act="pos-rank"${dis}><option value=""${!sel ? " selected" : ""}>${T("pe.rankPickPh")}</option>${
    RANK_CHOICES.map(r => `<option value="${r}"${sel === r ? " selected" : ""}>${esc(boardLabel(r))}</option>`).join("")}<option value="custom"${sel === "custom" ? " selected" : ""}>${T("pe.custom")}</option></select>`;
}
export const LEVELS = ["view", "edit", "manage"];
export const levelLabel = v => T("level." + (LEVELS.includes(v) ? v : "view"));

// ── 2026-10-23 第三次重整批 2：從人管人 ──────────────────────────────
// 工作區給人看的名字：名單與改一個人那一頁不再印代號（apps:Curriculum Team）。
// 有工作區清單就用它的標題，沒有（還沒載到）就從代號推。代號只在網址裡。
export function wsName(id, workspaces) {
  const s = String(id || "");
  // 兩本護照一律用長名稱（2026-10-24）：「幹部護照（格子與城市）」，講清楚那一格管的是格子，不是能不能玩。
  if (s === "passport") return T("ws.long.passport");
  if (s === "intern-passport") return T("ws.long.intern");
  const w = (workspaces || []).find(x => x.id === id);
  if (w) return wsLabel(w);
  if (s === "apps") return T("ws.long.apps");
  if (s.startsWith("apps:")) return T("ws.name.apps", { team: s.slice(5) });
  if (s.startsWith("res:")) return T("ws.name.res", { team: s.slice(4) });
  if (s.startsWith("custom:")) return s.slice(7);
  return s;
}
// 存取格：一個人在每一個工作區的等級排成一張表，一格一個下拉，改了就存（main.js 接 change 的 data-act="grid-level"）。
// 列是六個 team（申請、資源兩欄）、兩本護照、自訂的工作區；資料就是 roster() 回的 workspaces，跟 Workspaces 那一頁同一份。
// 還沒載到工作區清單的時候每一格都畫（exists 回 true），載到了就只畫真的存在的。
// 還沒載到工作區清單的時候用這一份預設（跟 10-24 遷移檔建的十四個一樣），格子才畫得出來。
export function defaultWorkspaces() {
  return [{ id: "apps", kind: "apps" }, { id: "passport", kind: "passport" }, { id: "intern-passport", kind: "intern-passport" }]
    .concat(TEAMS.map(t => ({ id: "res:" + t, kind: "res", team: t })));
}
// 2026-10-24 Paul：十四列的平表看不懂（「實習護照應該在 Internship 底下」「幹部護照屬於整個 board」「表單在哪」）。
// 改成一列一個 team，欄是那個 team 擁有的東西：Internship 多一格實習護照；最上面「整個 BT」一列放幹部護照；自訂的掛在它的 team 底下。
// 每一格的標題連到那個東西自己的頁面。底下三句：等級怎麼看、玩護照是身分帶來的、時間看板沒有指派。
export function accessGridHTML(p, workspaces, busy, people) {
  const dis = busy ? " disabled" : "";
  const have = Object.fromEntries((Array.isArray(p.workspaces) ? p.workspaces : []).map(w => [w.id, w.level]));
  const list = (workspaces || []).filter(w => w.active !== false).length ? workspaces : defaultWorkspaces();
  const byRank = isOrgWide(p.board_role);
  const sel = w => byRank
    ? `<select class="byrank" disabled aria-label="${esc(wsCellLabel(w))}"><option selected>${T("grid.byRank")}</option></select>`
    : `<select data-act="grid-level" data-id="${esc(p.profile_id)}" data-ws="${esc(w.id)}" aria-label="${esc(wsCellLabel(w))}"${dis}>${
        ["", ...LEVELS].map(l => `<option value="${l}"${(have[w.id] || "") === l ? " selected" : ""}>${l ? esc(levelLabel(l)) : esc(T("grid.none"))}</option>`).join("")}</select>`;
  const cell = w => `<div class="gcell"><a class="glabel" href="${withLang(wsCellHref(w))}">${esc(wsCellLabel(w))}</a>${sel(w)}</div>`;
  const rows = wsRows(list, TEAMS, people).filter(r => r.cells.length);
  return `<table class="table grid"><tbody>${rows.map(r => `<tr><th scope="row">${esc(r.label)}</th><td><div class="gcells">${r.cells.map(cell).join("")}</div></td></tr>`).join("")}</tbody></table>
    <div class="mini" style="margin-top:8px">${T("ws.levelLegend")}</div>
    <div class="mini">${T("ws.playNote")}</div>
    <div class="mini">${T("ws.availNote")}</div>`;
}
// 找人用的那一串字：「王小明 (Ming Wang)」。datalist 的選項值就是它，main.js 用 findByPickName 對回去。
export function pickName(p) { const { name, alt } = namesOf({ name_zh: p.name_zh, name_en: p.name_en }); return alt ? `${name} (${alt})` : name; }
export function findByPickName(people, q) {
  const s = String(q || "").trim().toLowerCase();
  if (!s) return null;
  const list = (people || []).filter(p => p.profile_id);
  return list.find(p => pickName(p).toLowerCase() === s)
    || list.find(p => String(p.name_zh || "").toLowerCase() === s || String(p.name_en || "").toLowerCase() === s)
    || null;
}
// 自訂工作區的代號從英文名稱算：小寫、英數、連字號。「Winter camp 2027」→「winter-camp-2027」。
export function slugify(s) {
  return String(s || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
}
// 結束這一屆之後、名單最上面那一段「接下來要做的事」：留下的人一列一顆「改」，做完按收起來。
export function afterEndHTML(after, people, busy) {
  if (!after) return "";
  const dis = busy ? " disabled" : "";
  const kept = (people || []).filter(p => p.profile_id && (after.kept || []).includes(p.profile_id));
  return sectionHTML(T("tm.afterTitle", { term: esc(after.term) }), `<div class="note">${T("tm.afterNote")}</div>
    <ul class="flist">${kept.map(p => `<li><div class="fhead"><b>${esc(pickName(p))}</b><span class="tag">${esc(boardLabel(p.board_role))}</span></div>
      <div class="row"><button class="btn ghost sm" data-act="person-edit" data-id="${esc(p.person_id)}"${dis}>${T("ro.edit")}</button></div></li>`).join("")}</ul>
    <div class="row"><button class="btn quiet sm" data-act="after-dismiss"${dis}>${T("tm.afterDone")}</button></div>`, { id: "after-end" });
}
const FIELD_KEY = { board_role: "field.board_role", team: "field.team", name: "field.name", role: "field.role",
  position: "field.position", assignment: "field.assignment", removed: "field.removed", claimed: "field.claimed",
  merged: "field.merged", term: "field.term", invite: "field.invite", invite_back: "field.invite_back" };
const fmtDate = v => String(v || "").slice(0, 16).replace("T", " ");
const ROLE_NAME = { cadre: "role.cadre", alumni: "role.alumni", student: "role.student", intern: "role.intern" };
// 紀錄裡的值翻成人看的字。指派存成「等級@工作區」，職位存成「屆別:名稱/team」。
function valueZh(field, v) {
  if (v == null || v === "") return T("value.none");
  if (field === "board_role") return boardLabel(v);
  if (field === "role") return ROLE_NAME[v] ? T(ROLE_NAME[v]) : v;
  if (field === "assignment") {
    const i = String(v).indexOf("@");
    if (i < 0) return v;
    const lv = String(v).slice(0, i); const ws = String(v).slice(i + 1);
    return (lv ? (LEVELS.includes(lv) ? levelLabel(lv) : lv) : T("value.none")) + " @ " + ws;
  }
  return v;
}
// 工作區在畫面上的名字：看語言挑中文或英文標題，沒有就用代號。
export function wsLabel(w) {
  if (!w) return "";
  const t = lang() === "zh" ? (w.title_zh || w.title_en) : (w.title_en || w.title_zh);
  return t || w.id;
}
// 一個人在某一屆的職位（roster() 回的 positions 是 [{ term, title_zh, title_en, team }]）。
export function positionFor(p, termId) {
  return (p && Array.isArray(p.positions) ? p.positions : []).find(x => x.term === termId) || null;
}
// 同一屆的全部職位（2026-10-26 起一個人一屆可以兼好幾個，例如 Sponsorship 的 Adviser 兼 Curriculum 的 Associate）。
export function positionsFor(p, termId) {
  return (p && Array.isArray(p.positions) ? p.positions : []).filter(x => x.term === termId);
}
// 同一屆所有職位接成一句：「Adviser, Sponsorship Team · Associate, Curriculum Team」。
export const positionsLine = (p, termId) => positionsFor(p, termId).map(positionTitle).filter(Boolean).join(" · ");
export const positionTitle = pos => pos ? ((lang() === "zh" ? (pos.title_zh || pos.title_en) : (pos.title_en || pos.title_zh)) || "") : "";
export const currentTerm = terms => (terms || []).find(t => t.status === "current") || null;
// 2026-27 → 2027-28。對不出來就回空字串，讓人自己填。
export function nextTermId(cur) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(cur || ""));
  if (!m) return "";
  const y = Number(m[1]) + 1;
  return `${y}-${String((y + 1) % 100).padStart(2, "0")}`;
}
// 貼一整屆：一行一個人，逗號或 tab 隔開：中文名, 英文名, 職位, team。
// 回 { rows, bad }，bad 是讀不出來的行號（一行連一個名字都沒有）。
export function pasteParse(text) {
  const rows = []; const bad = [];
  String(text || "").split(/\r?\n/).forEach((line, i) => {
    const s = line.trim();
    if (!s) return;
    const c = s.split(/\t|,|，/).map(x => x.trim());
    const rank = rankByName(c[2]);
    const titles = rank ? deriveTitle(rank, c[3] || "") : { title_en: c[2] || "", title_zh: c[2] || "" };
    const r = { name_zh: c[0] || "", name_en: c[1] || "", title_en: titles.title_en, title_zh: titles.title_zh, team: isOrgWide(rank) ? "" : (c[3] || "") };
    if (!r.name_zh && !r.name_en) { bad.push(i + 1); return; }
    rows.push(r);
  });
  return { rows, bad };
}
const personName = p => namesOf({ name_zh: p.name_zh, name_en: p.name_en });
const hasAccount = p => !!p.profile_id;

// 幹部名單。people 是 roster()；filter = { term: 屆別代號或 "all", team: "" 全部 / "__none" / team 名 }。
// 預設只列現在這一屆有職位的人，切到「全部」才看得到歷屆與沒有帳號的人。

// ── 把老幹部請回來（2026-11-07）───────────────────────────────────────
// Paul 看了「校友碼與刪除紀錄」那一塊之後說三件事混在一起：名單紀錄、登入帳號、邀請。這一段把它們拆開：
//   名單上沒有帳號的紀錄 → 一顆「寄邀請信」（invite_back），狀態從 roster_invites() 來，合進每一個人的 invite 欄（mergeInvites）；
//   名單上勾一批人 → 右邊一個面板一次寄（invite_back_many），一人一個結果；
//   邀請頁打了名字對到名單上的人 → 先問要掛到哪一筆（nameMatches / inviteChooserHTML），資料庫也會自己對（ambiguous_person 就帶 id 回來問）。
const INV_TAG = { queued: "", sent: "open", failed: "warn", opened: "open", claimed: "done", expired: "draft", revoked: "draft" };
const d16 = v => String(v || "").slice(0, 16).replace("T", " ");
const LANG_OPTS = (v, blankLabel) => `${blankLabel != null ? `<option value=""${!v ? " selected" : ""}>${esc(blankLabel)}</option>` : ""}<option value="zh"${v === "zh" ? " selected" : ""}>${T("ib.langZh")}</option><option value="en"${v === "en" ? " selected" : ""}>${T("ib.langEn")}</option>`;
// 名單合上邀請狀態。只掛在沒有帳號的人身上（有帳號的人邀請早就認領完了，名單上不用再講）。狀態載不到就每一個都是 null，名單照畫。
export function mergeInvites(people, invites) {
  const by = Object.fromEntries((invites || []).map(i => [i.person_id, i]));
  return (people || []).map(p => Object.assign({}, p, { invite: !hasAccount(p) && by[p.person_id] ? by[p.person_id] : null }));
}
// 手抄的批次碼才印「校友碼 xxx 還沒用」：roster() 的 pending_code 也會抓到邀請信那組碼，那組已經用徽章講了。
const plainCode = p => p && p.pending_code && !(p.invite && p.invite.code === p.pending_code) ? p.pending_code : "";
export function inviteBadgeHTML(inv) {
  if (!inv || !inv.status) return "";
  const when = inv.status === "claimed" ? inv.claimed_at : inv.status === "opened" ? inv.opened_at : inv.status === "revoked" ? inv.revoked_at
    : inv.status === "expired" ? inv.expires_at : inv.sent_at || inv.created_at;
  const title = [inv.email ? T("ib.to", { email: inv.email }) : "", when ? d16(when) : ""].filter(Boolean).join("・");
  return `<span class="inv" style="white-space:nowrap"><span class="tag ${INV_TAG[inv.status] || ""}" title="${esc(title)}">${esc(T("in.st." + inv.status) || inv.status)}</span>`
    + (when ? `<span class="mini"> ${esc(d16(when).slice(0, 10))}</span>` : "") + `</span>`
    + (inv.status === "failed" && inv.mail_error ? `<div class="mini">${T("ib.mailErr", { err: esc(inv.mail_error) })}</div>` : "");
}
// 改一個人那一頁的「邀請回來」。draft.ib = { email, lang, line, code } 留住填到一半的。
// 認領了就只剩狀態；還活著（排隊、寄出、開過、寄失敗）就表單與狀態都在：按「寄」而 email 沒變等於重寄，換了 email 資料庫會回 existing 叫你先撤銷。
export function inviteBackHTML(p, draft, busy, isPres) {
  const d = (draft && draft.ib) || {};
  const inv = p.invite || null;
  const dis = busy ? " disabled" : "";
  const live = !!inv && ["queued", "sent", "failed", "opened"].includes(inv.status);
  const email = d.email != null ? d.email : (inv && inv.email) || p.email || "";
  const lg = d.lang || (inv && inv.lang) || lang();
  const times = inv ? [["created", inv.created_at], ["sent", inv.sent_at], ["opened", inv.opened_at], ["claimed", inv.claimed_at], ["revoked", inv.revoked_at], ["expires", live ? inv.expires_at : null]]
    .filter(x => x[1]).map(x => T("ib.at." + x[0], { d: esc(d16(x[1])) })).join("・") : "";
  const status = inv ? `<div class="fhead" style="margin-top:14px"><b>${T("ib.status")}</b>${inviteBadgeHTML(inv)}</div>
    <div class="fmeta">${T("ib.to", { email: esc(inv.email || "") })}${inv.invited_by_name ? "・" + T("ib.by", { who: esc(inv.invited_by_name) }) : ""}・<span class="mini">${T("in.code", { code: esc(inv.code || "") })}</span></div>
    ${times ? `<div class="fmeta">${times}</div>` : ""}
    <div class="row">${inv.status !== "claimed" ? `<button class="btn ghost sm" data-act="invite-back-resend" data-code="${esc(inv.code)}" data-email="${esc(inv.email || "")}" data-id="${esc(p.person_id)}"${dis}>${T("ib.resend")}</button>` : ""}${
      live && isPres ? `<button class="btn quiet sm" data-act="invite-back-revoke" data-code="${esc(inv.code)}" data-email="${esc(inv.email || "")}" data-id="${esc(p.person_id)}"${dis}>${T("ib.revoke")}</button>` : ""}</div>` : "";
  const form = inv && inv.status === "claimed" ? "" : `<div class="two">
      <label><i>${T("ib.email")}</i><input id="ib-email" type="email" value="${esc(email)}" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="name@example.com"${dis}></label>
      <label><i>${T("ib.lang")}</i><select id="ib-lang"${dis}>${LANG_OPTS(lg)}</select></label>
      <label><i>${T("ib.line")}</i><input id="ib-line" value="${esc(d.line || "")}" placeholder="${esc(T("in.linePh"))}"${dis}></label>
    </div>
    <div class="row"><button class="btn" data-act="invite-back-send" data-id="${esc(p.person_id)}"${dis}>${busy ? T("ib.sending") : T("ib.send")}</button></div>`;
  const code = plainCode(p);
  const codeFold = isPres ? `<details class="fold"${code ? " open" : ""}><summary><span class="chev" aria-hidden="true"></span><b>${T("ib.codeFold")}</b><span class="mini">${T("ib.codeFoldHint")}</span></summary><div class="fold-body">${code
      ? `<div class="note">${T("pe.pendingCode", { code: esc(code) })}</div>`
      : `<div class="row"><input id="pk-code" value="${esc(d.code || "")}" placeholder="bt-xxxxxx" style="max-width:220px"${dis}>
         <button class="btn ghost sm" data-act="person-code" data-id="${esc(p.person_id)}"${dis}>${T("pe.issueCode")}</button></div>
         <div class="mini">${T("pe.issueCodeNote")}</div>`}</div></details>` : "";
  return sectionHTML(T("ib.title"), `<div class="note">${T("ib.lede")}</div>${form}${status}${codeFold}`, { id: "invite-back" });
}
// 名單上勾起來的人。bulk = { ticked: [person_id…], lang, emails: { id: "…" }, langs: { id: "zh" | "en" | "" }, results: invite_back_many 回的 }。
export function bulkRows(people, bulk) {
  const b = bulk || {};
  const by = Object.fromEntries((people || []).map(p => [p.person_id, p]));
  return (b.ticked || []).map(id => by[id]).filter(Boolean).map(p => ({
    person_id: p.person_id, name: pickName(p),
    email: b.emails && b.emails[p.person_id] != null ? b.emails[p.person_id] : ((p.invite && p.invite.email) || p.email || ""),
    lang: (b.langs && b.langs[p.person_id]) || b.lang || lang(),
  }));
}
export function bulkPayload(rows) {
  const payload = [], missing = [];
  for (const r of rows || []) { if (String(r.email || "").trim()) payload.push({ person: r.person_id, email: String(r.email).trim(), lang: r.lang }); else missing.push(r.person_id); }
  return { payload, missing };
}
export function bulkSummary(results) {
  const out = { sent: 0, existing: 0, error: 0 };
  for (const r of results || []) out[r.status === "sent" ? "sent" : r.status === "existing" ? "existing" : "error"]++;
  return out;
}
// 右邊那個面板。results 裡的 error 已經在 main.js 過過 says()，這裡照印。
export function bulkPanelHTML(bulk, people, busy) {
  const b = bulk || {};
  if (!(b.ticked || []).length) return "";
  const rows = bulkRows(people, b);
  const dis = busy ? " disabled" : "";
  const res = Object.fromEntries((b.results || []).map(r => [r.person, r]));
  const line = r => { const x = res[r.person_id]; if (!x) return "";
    const k = x.status === "sent" ? "done" : x.status === "existing" ? "open" : "warn";
    // 錯誤的原因放 tag 外面：.tag 會把字轉大寫，「EMAIL」會讀起來像在吼人。
    return `<div class="mini" style="margin:-4px 0 8px"><span class="tag ${k}">${x.status === "error" ? T("bk.result.errorTag") : T("bk.result." + (x.status === "sent" ? "sent" : "existing"))}</span>${x.status === "error" ? " " + esc(x.error || "") : ""}</div>`; };
  const row = r => `<div class="card posrow bk-row" data-bk="${esc(r.person_id)}">
    <div class="two">
      <label><i>${esc(r.name)}</i><input id="bk-email-${esc(r.person_id)}" type="email" value="${esc(r.email)}" placeholder="name@example.com" autocomplete="off" autocapitalize="off" spellcheck="false"${dis}></label>
      <label><i>${T("ib.lang")}</i><select id="bk-lang-${esc(r.person_id)}"${dis}>${LANG_OPTS((b.langs || {})[r.person_id] || "", T("bk.langRow"))}</select></label>
    </div>${line(r)}
    <div class="row"><button class="btn ghost sm" data-act="bulk-untick" data-id="${esc(r.person_id)}"${dis}>${T("bk.untick")}</button></div>
  </div>`;
  const sum = b.results ? `<div class="note" style="margin-top:12px">${T("bk.summary", bulkSummary(b.results))}</div>` : "";
  return sectionHTML(T("bk.title", { n: rows.length }), `<div class="note">${T("bk.lede")}</div>
    <label><i>${T("bk.lang")}</i><select id="bk-lang"${dis}>${LANG_OPTS(b.lang || lang())}</select></label>
    ${rows.map(row).join("")}
    <div class="row"><button class="btn" data-act="bulk-send"${dis}>${busy ? T("bk.sending") : T("bk.send", { n: rows.length })}</button>
      <button class="btn ghost" data-act="bulk-clear"${dis}>${T("bk.clear")}</button></div>${sum}`, { id: "bulk" });
}
// 邀請頁：打的名字對到名單上沒有帳號的人（中文全等、英文不分大小寫）。
export function nameMatches(people, nameZh, nameEn) {
  const zh = String(nameZh || "").trim(), en = String(nameEn || "").trim().toLowerCase();
  if (!zh && !en) return [];
  return (people || []).filter(p => !hasAccount(p) && ((en && String(p.name_en || "").trim().toLowerCase() === en) || (zh && String(p.name_zh || "").trim() === zh)));
}
export function inviteChooserHTML(matches, picked, busy) {
  if (!(matches || []).length) return "";
  const dis = busy ? " disabled" : "";
  const pos = m => (m.positions || []).map(x => `${positionTitle(x)}・${x.term}`).join(T("punct.list")) || T("in.attachPos");
  return `<div class="note attach" id="in-attach-box"><b>${T("in.attach")}</b><div class="mini" style="margin:4px 0 10px">${T("in.attachNote")}</div>${
    matches.map(m => `<label class="check"><input type="radio" name="in-attach" value="${esc(m.person_id)}"${picked === m.person_id ? " checked" : ""}${dis}><span><b>${esc(pickName(m))}</b> <span class="mini">${esc(pos(m))}</span>${plainCode(m) ? ` <span class="mini">${T("ro.pendingCode", { code: esc(plainCode(m)) })}</span>` : ""}${m.invite ? " " + inviteBadgeHTML(m.invite) : ""}</span></label>`).join("")}
    <label class="check"><input type="radio" name="in-attach" value="__new"${picked === "__new" ? " checked" : ""}${dis}><span>${T("in.attachNew")}</span></label></div>`;
}
// 資料庫自己撞到同名好幾筆：ambiguous_person:id1,id2 拆成清單，畫面拿去畫同一個選擇器。
export function ambiguousIds(err) {
  const m = String((err && err.message) || err || "").match(/ambiguous_person:([^\s]+)/);
  return m ? m[1].split(",").map(x => x.trim()).filter(Boolean) : [];
}
export const NIL_UUID = "00000000-0000-0000-0000-000000000000";

export function rosterHTML(people, terms, meId, isPres, msg, busy, filter, workspaces, after, bulk) {
  const list = people || [];
  const cur = currentTerm(terms);
  const f = Object.assign({ term: cur ? cur.id : "all", team: "", q: "", noacc: false }, filter || {});
  const tick = new Set(((bulk || {}).ticked) || []);
  // 找名字（2026-10-23 批 2）：中英文都認，大小寫不分。main.js 接 input 事件、重畫後把游標放回去。
  const q = String(f.q || "").trim().toLowerCase();
  const hit = p => !q || String(p.name_zh || "").toLowerCase().includes(q) || String(p.name_en || "").toLowerCase().includes(q);
  const dis = busy ? " disabled" : "";
  const inTerm = p => f.term === "all" || !!positionFor(p, f.term);
  // 一個人算在哪幾個 team 的 chip 底下：Co-President 與 Senior Adviser 是整個組織的，只算他這一屆**帶 team 的職位**（通常沒有），
  // 不看他自己勾的標籤，跟 /team/ 的「領導」那一組同一條規則。其他人照舊：標籤，沒有標籤就看職位的 team。
  const posTeams = p => positionsFor(p, f.term === "all" ? (cur ? cur.id : "") : f.term).map(x => x.team).filter(Boolean);
  const teamsOf = p => isOrgWide(p.board_role) ? [...new Set(posTeams(p))]
    : parseTeams(p.team).length ? parseTeams(p.team) : (positionFor(p, f.term) && positionFor(p, f.term).team ? [positionFor(p, f.term).team] : []);
  // 「沒有帳號」那顆 chip（2026-11-07）：只留名單上沒有登入帳號的人，勾一批人一起寄邀請信就是在這裡。
  const noAccN = list.filter(inTerm).filter(p => !hasAccount(p)).length;
  const base = list.filter(inTerm).filter(p => !f.noacc || !hasAccount(p));
  const allTeams = [...new Set(base.flatMap(teamsOf))].sort((a, b) => a.localeCompare(b));
  const noTeam = base.filter(p => !teamsOf(p).length).length;
  const shown = (!f.team ? base : f.team === "__none" ? base.filter(p => !teamsOf(p).length) : base.filter(p => teamsOf(p).includes(f.team))).filter(hit);
  const noName = T("common.noName");
  // 有帳號的在前，沒有名字的最後。
  const sorted = shown.slice().sort((a, b) => Number(hasAccount(b)) - Number(hasAccount(a)) || rankOrder(a.board_role) - rankOrder(b.board_role) || Number(personName(a).name === noName) - Number(personName(b).name === noName));
  const chip = (act, v, label, n, on) => `<button class="chip${on ? " on" : ""}" data-act="${act}" data-v="${esc(v)}"${dis}>${esc(label)}${n != null ? ` ${n}` : ""}</button>`;
  const termChips = `<div class="chips" style="margin-bottom:8px">${
    (terms || []).map(t => chip("roster-term", t.id, t.id + (t.status === "current" ? T("ro.curMark") : ""), list.filter(p => positionFor(p, t.id)).length, f.term === t.id)).join("")}${
    chip("roster-term", "all", T("ro.allTerms"), list.length, f.term === "all")}</div>`;
  const teamChips = `<div class="chips" style="margin-bottom:14px">${chip("roster-team", "", T("ro.all"), base.length, !f.team)}${
    allTeams.map(t => chip("roster-team", t, t.replace(/\s*Team$/i, ""), base.filter(p => teamsOf(p).includes(t)).length, f.team === t)).join("")}${
    noTeam ? chip("roster-team", "__none", T("ro.noTeam"), noTeam, f.team === "__none") : ""}${
    noAccN ? chip("roster-noacc", "", T("ro.noAccountChip"), noAccN, !!f.noacc) : ""}</div>`;
  const tr = p => {
    const { name, alt } = personName(p);
    const pos = positionFor(p, f.term === "all" ? (cur ? cur.id : "") : f.term);
    const lastPos = f.term === "all" && !pos && p.positions && p.positions.length ? p.positions[0] : null;
    const ws = Array.isArray(p.workspaces) ? p.workspaces : [];
    const dup = Array.isArray(p.maybe_dup) && p.maybe_dup.length;
    return `<tr${hasAccount(p) ? "" : ' class="off"'}>
      <td class="t-main">${!hasAccount(p) ? `<label class="tick"><input type="checkbox" data-act="bulk-tick" data-id="${esc(p.person_id)}"${tick.has(p.person_id) ? " checked" : ""} aria-label="${esc(T("ro.tick"))}"${dis}></label>` : ""}${nameBlock(p)}${
        p.profile_id === meId ? ` <span class="tag">${T("ro.you")}</span>` : ""}${
        name === noName ? ` <span class="tag warn">${T("ro.noName")}</span>` : ""}${
        !hasAccount(p) ? ` <span class="tag draft">${T("ro.noAccount")}</span>` : p.role !== "cadre" ? ` <span class="tag">${esc(ROLE_NAME[p.role] ? T(ROLE_NAME[p.role]) : p.role)}</span>` : ""}${
        dup ? ` <span class="tag warn">${T("ro.maybeDup")}</span>` : ""}${
        p.invite ? ` ${inviteBadgeHTML(p.invite)}` : ""}${
        plainCode(p) ? `<div class="mini">${T("ro.pendingCode", { code: esc(plainCode(p)) })}</div>` : ""}</td>
      <td>${hasAccount(p) && p.role === "cadre" ? `<span class="tag${p.board_role === "president" || p.board_role === "senior_adviser" ? " open" : ""}">${esc(boardLabel(p.board_role))}</span>` : `<span class="mini">—</span>`}</td>
      <td class="t-pos">${pos ? positionsFor(p, pos.term).map(x => {
                 // 一筆職位一行，不用「 · 」接成一句：職級是左邊那一欄的徽章，職位是這裡的字，兩件事分開看。
                 // 一個人可以兼好幾個職位（10-23、10-26），Co-President 兼 Sponsorship 的 Associate 是正常的，**每一筆都不標**。
                 // team 的小字只在職位的字裡還沒有那個 team 的時候才印（「Adviser, Sponsorship Team」後面不再接一次 Sponsorship Team）。
                 const r = rankOfTitle(x.title_en, x.team);
                 const title = positionTitle(x);
                 const teamShown = x.team && !title.toLowerCase().endsWith(String(x.team).toLowerCase());
                 return `<div class="pos-line">${esc(title)}${teamShown ? `<span class="mini"> · ${esc(x.team)}</span>` : !x.team && isOrgWide(r) ? `<span class="mini"> · ${T("pe.allTeams")}</span>` : ""}</div>`; }).join("")
               // 唯一的提醒是每人一句：這一屆**沒有任何一筆**職位對得上他的職級（例如職級 Co-President、職位只有 Associate）。
               + (hasAccount(p) && p.role === "cadre" && !positionsFor(p, pos.term).some(x => rankOfTitle(x.title_en, x.team) === (p.board_role || "member"))
                   ? `<div class="mini"><span class="tag warn" title="${esc(T("ro.noRankPositionHint"))}">${T("ro.noRankPosition")}</span></div>` : "")
               : lastPos ? `<span class="mini">${esc(positionTitle(lastPos))}・${esc(lastPos.term)}</span>` : `<span class="mini">${T("ro.noPosition")}</span>`}${
        hasAccount(p) && p.role === "cadre" && !parseTeams(p.team).length
          ? `<div style="margin-top:6px"><select data-act="row-team" data-id="${esc(p.profile_id)}" aria-label="${esc(T("ro.setTeam"))}"${dis}><option value="">${T("ro.setTeam")}</option>${
              TEAMS.map(t => `<option value="${esc(t)}">${esc(t.replace(/\s*Team$/i, ""))}</option>`).join("")}</select></div>` : ""}</td>
      <td>${hasAccount(p) && p.role === "cadre" && isOrgWide(p.board_role)
          // 這兩級靠職級就有一切：先一顆「全部（職級）」，後面明寫的指派淡掉留著（多餘但不藏，藏了就沒人會去清）。
          // 2026-11-03：靠職級的人只印徽章，不再印劃掉的舊指派（那幾筆 2026-11-03 那支遷移檔會清掉，改一個人那一頁還有「清掉」可以按）。
          ? `<span class="tag open">${T("grid.byRank")}</span>`
          : ws.length ? ws.map(w => `<span class="tag">${esc(wsName(w.id, workspaces))}・${esc(levelLabel(w.level))}</span>`).join(" ") : `<span class="mini">${hasAccount(p) && p.role === "cadre" ? T("ro.noWs") : ""}</span>`}</td>
      <td class="t-act"><button class="btn quiet sm" data-act="person-edit" data-id="${esc(p.person_id)}"${dis}>${T("ro.edit")}</button></td>
    </tr>`;
  };
  return pageHead(T("ro.title"), T("ro.lede", { n: base.length, term: f.term === "all" ? T("ro.allTerms") : f.term }),
      [{ act: "person-new", label: T("ro.addPast"), disabled: busy }])
    + msgHTML(msg)
    + afterEndHTML(after, list, busy)
    + bulkPanelHTML(bulk, list, busy)
    + `<div class="note">${isPres ? T("ro.note") : T("ro.noteSenior")}</div>`
    + sectionHTML("", `<label class="ro-search"><i>${T("ro.search")}</i><input id="ro-search" type="search" value="${esc(f.q || "")}" placeholder="${esc(T("ro.searchPh"))}" autocomplete="off"></label>`
      + termChips + teamChips + (sorted.length
      ? `<table class="table"><thead><tr><th>${T("ro.name")}</th><th>${T("ro.rank")}</th><th>${T("ro.position")}</th><th>${T("ro.ws")}</th><th></th></tr></thead><tbody>${sorted.map(tr).join("")}</tbody></table>`
      : list.length ? emptyHTML(T("ro.emptyFilter"), T("ro.emptyFilterHint")) : emptyHTML(T("ro.empty"), T("ro.emptyHint"))), { id: "roster" });
}

// 變動紀錄（帳本不是通知）。people 用來把 uuid 翻成名字。
export function changesHTML(changes, people, msg) {
  const byId = Object.fromEntries((people || []).filter(p => p.profile_id).map(p => [p.profile_id, p]));
  const who = id => { const p = byId[id]; return p ? personName(p).name : (id ? T("ch.gone") : T("ch.system")); };
  const logRows = (changes || []).map(c => `<li>
    <div class="fhead"><b>${esc(c.target_name || who(c.target))}</b>
      <span class="tag">${esc(FIELD_KEY[c.field] ? T(FIELD_KEY[c.field]) : c.field)}</span></div>
    <div class="fmeta">${esc(valueZh(c.field, c.old_value))} → <b>${esc(valueZh(c.field, c.new_value))}</b>
      ${T("ch.by", { who: esc(who(c.changed_by)), d: esc(fmtDate(c.created_at)) })}</div>
  </li>`).join("");
  return pageHead(T("ch.title"), T("ch.lede"))
    + msgHTML(msg)
    + sectionHTML("", logRows ? `<ul class="flist">${logRows}</ul>`
      : emptyHTML(T("ch.empty"), T("ch.emptyHint")), { id: "changes" });
}

// orgWide = true：職級是 Co-President 或 Senior Adviser，整格鎖住、只印「全部 team」，存的時候 team 是空的。
const teamSelect = (id, val, dis, orgWide) => {
  if (orgWide) return `<select id="${id}" disabled data-orgwide="1"><option value="" selected>${T("pe.allTeams")}</option></select>`;
  const extra = val && !TEAMS.includes(val) ? [val] : [];
  return `<select id="${id}"${dis}><option value=""${!val ? " selected" : ""}>${T("value.none")}</option>${
    [...TEAMS, ...extra].map(t => `<option value="${esc(t)}"${val === t ? " selected" : ""}>${esc(t)}</option>`).join("")}</select>`;
};

// 改一個人：職級（只有 Co-President 改得了，自己那一列關著）、名字（只有 Co-President）、
// 這一屆的職位、team 標籤（只是標籤）、他在哪幾個工作區（唯讀，去工作區頁改）、
// 最底下是危險的事：發校友碼、合併、刪除成員或刪除紀錄。draft 留住存檔被擋時剛填的東西。
// remove = { typed }：按了「刪除成員」之後第二步的狀態（要把名字打一次）。
export function personEditHTML(p, terms, meId, isPres, msg, busy, draft, people, remove, email, workspaces) {
  const cur = currentTerm(terms);
  const d = draft || {};
  const termId = d.term || (cur ? cur.id : ((terms || [])[0] || {}).id || "");
  // 這一屆的職位是一張清單（2026-10-26）。draft.rows 留住改到一半的；沒有就從資料來。
  // 每一列的 orig 是它原本的 team（沒有 team 的職位是空字串）；新加的一列 orig 是 null。
  const rows = Array.isArray(d.rows) ? d.rows
    : positionsFor(p, termId).map(x => ({ orig: x.team || "", title_zh: x.title_zh || "", title_en: x.title_en || "", team: x.team || "" }));
  const v = Object.assign({ board_role: p.board_role || "member", name_zh: p.name_zh || "", name_en: p.name_en || "", team: p.team || "" }, d);
  const picked = parseTeams(v.team);
  const extra = picked.filter(t => !TEAMS.includes(t));
  const dis = busy ? " disabled" : "";
  const { name, alt } = personName(p);
  const self = p.profile_id === meId;
  const cadre = hasAccount(p) && p.role === "cadre";
  const ws = Array.isArray(p.workspaces) ? p.workspaces : [];
  const dups = (people || []).filter(o => Array.isArray(p.maybe_dup) && p.maybe_dup.includes(o.person_id));
  const box = t => `<label class="check tpick">
    <input type="checkbox" name="team" value="${esc(t)}"${picked.includes(t) ? " checked" : ""}${dis}>
    <span>${esc(t.replace(/\s*Team$/i, ""))}</span></label>`;
  const lede = !hasAccount(p) ? T("pe.ledeNoAccount") : cadre ? T("pe.lede", { role: esc(boardLabel(p.board_role)) }) : T("pe.ledeOther", { role: esc(ROLE_NAME[p.role] ? T(ROLE_NAME[p.role]) : p.role) });
  // 2026-11-06 自動儲存：職級一選就存。選到 Co-President 要先確認（main.js 把那一行「真的要？」掛在這個看不見的錨上，
  // 因為 mountAsk 要一個 data-act 的元素才知道掛哪裡，而下拉選單不能藏起來）。
  const rankSec = cadre ? sectionHTML(T("pe.rank"), `<label><i>${T("pe.rank")}</i><select id="pk-role" name="board_role"${self || !isPres ? " disabled" : dis}>
      ${BOARD_ROLES.map(r => `<option value="${r.v}"${v.board_role === r.v ? " selected" : ""}>${esc(T(r.label))}（${esc(T(r.hint))}）</option>`).join("")}
    </select><span data-act="person-promote" data-id="${esc(p.person_id)}" hidden></span></label>
    ${self ? `<div class="mini" style="margin:-6px 0 14px">${T("pe.selfNote")}</div>` : !isPres ? `<div class="mini" style="margin:-6px 0 14px">${T("pe.presOnly")}</div>` : `<div class="mini" style="margin:-6px 0 14px">${T("pe.rankNote")}</div>`}`) : "";
  // 註冊用的 email（2026-10-26）：唯讀，一顆複製。只在這一頁，名單表格上不印。email 是 person_email() 回的，
  // undefined 表示還在載或載不到，null 表示沒有帳號。
  const emailLine = !hasAccount(p) ? `<div class="mini">${T("pe.email")}${T("punct.colon")}${T("ro.noAccount")}</div>`
    : email === undefined ? `<div class="mini">${T("pe.email")}${T("punct.colon")}${T("pe.emailLoading")}</div>`
    : `<div class="row" style="margin-bottom:14px"><span class="mini">${T("pe.email")}${T("punct.colon")}<b>${esc(email || "")}</b></span>
       ${email ? `<button class="btn quiet sm" data-act="copy-email" data-email="${esc(email)}"${dis}>${T("pe.emailCopy")}</button>` : ""}</div>`;
  const nameSec = sectionHTML(T("pe.name"), `<div class="two">
      <label><i>${T("pe.nameZh")}</i><input id="pk-zh" name="name_zh" value="${esc(v.name_zh)}"${isPres ? dis : " disabled"}></label>
      <label><i>${T("pe.nameEn")}</i><input id="pk-en" name="name_en" value="${esc(v.name_en)}"${isPres ? dis : " disabled"}></label>
    </div>${emailLine}${!isPres ? `<div class="mini">${T("pe.presOnly")}</div>` : ""}`);
  const posRow = (r, i) => { const rank = r.rank != null ? r.rank : rankOfTitle(r.title_en, r.team); return `<div class="card posrow" data-posrow="${i}" data-orig="${r.orig == null ? "" : esc(r.orig)}" data-isnew="${r.orig == null ? "1" : "0"}">
      <div class="two">
        <label><i>${T("pe.rankPick")}</i>${rankSelect(`pk-rank-${i}`, rank, dis)}</label>
        <label><i>${T("pe.posTeam")}</i>${teamSelect(`pk-pteam-${i}`, r.team, dis, isOrgWide(rank))}</label>
      </div>
      <div class="two"${rank === "custom" ? "" : " hidden"}>
        <label><i>${T("pe.titleEn")}</i><input id="pk-ten-${i}" name="title_en_${i}" value="${esc(r.title_en)}" placeholder="Director, Curriculum Team"${dis}></label>
        <label><i>${T("pe.titleZh")}</i><input id="pk-tzh-${i}" name="title_zh_${i}" value="${esc(r.title_zh)}" placeholder="${esc(T("pe.titleZhPh"))}"${dis}></label>
      </div>
      <div class="row">${r.orig == null
        ? `<button class="btn ghost sm" data-act="position-row-drop" data-i="${i}"${dis}>${T("pe.posRowDrop")}</button>`
        : `<button class="btn ghost sm" data-act="position-delete" data-id="${esc(p.person_id)}" data-term="${esc(termId)}" data-team="${esc(r.orig)}"${dis}>${T("pe.posDelete")}</button>`}</div>
    </div>`; };
  const otherTerms = [...new Set((p.positions || []).map(x => x.term).filter(t => t !== termId))];
  // 屆別下拉是換表單看哪一屆，不是改資料，標 data-noauto 讓自動儲存不理它。
  const posSec = sectionHTML(T("pe.position"), `<label><i>${T("pe.term")}</i><select id="pk-term" data-act="person-term" data-noauto="1"${dis}>${
      (terms || []).map(t => `<option value="${esc(t.id)}"${termId === t.id ? " selected" : ""}>${esc(t.id)}${t.status === "current" ? T("ro.curMark") : ""}</option>`).join("")}</select></label>
    ${rows.length ? rows.map(posRow).join("") : `<div class="mini" style="margin-bottom:10px">${T("pe.posNone", { term: esc(termId) })}</div>`}
    <div class="row"><button class="btn ghost sm" data-act="position-row-add"${dis}>${T("pe.posAdd")}</button></div>
    <div class="mini">${T("pe.posDerived")} ${T("pe.posNote", { term: esc(termId) })}</div>${
    otherTerms.length ? `<div class="mini" style="margin-top:8px">${T("pe.history")}${esc(otherTerms.map(t => `${t}: ${positionsLine(p, t)}`).join(T("punct.list")))}</div>` : ""}`);
  const teamSec = cadre ? sectionHTML(T("pe.teams"), `<div class="tgrid">${TEAMS.map(box).join("")}${extra.map(t => box(t)).join("")}</div>
    <div class="mini" style="margin-top:8px">${T("pe.teamsNote")}</div>`) : "";
  // 存取（2026-10-23 批 2）：可以直接改的一張格子，不再是唯讀標籤加「去工作區那一頁改」。
  const wsSec = cadre ? sectionHTML(T("pe.ws"),
      (p.board_role === "president" || p.board_role === "senior_adviser" ? `<div class="note">${T("pe.wsSenior")}</div>` : "")
      + accessGridHTML(p, workspaces, busy, people)
      + `<div class="mini" style="margin-top:8px">${T("pe.wsNote")}${ws.length ? "" : " " + T("pe.noWs")}</div>`,
    { hint: T("auto.hint") }) : "";
  const dupSec = dups.length ? sectionHTML(T("pe.dup"), `<div class="note">${T("pe.dupNote")}</div>${
    dups.map(o => `<div class="row"><b>${esc(personName(o).name)}</b>${hasAccount(o) ? ` <span class="tag">${T("pe.dupHasAccount")}</span>` : ` <span class="tag draft">${T("ro.noAccount")}</span>`}
      ${isPres ? `<button class="btn ghost sm" data-act="person-merge" data-keep="${esc(p.person_id)}" data-drop="${esc(o.person_id)}"${dis}>${T("pe.mergeInto")}</button>` : ""}</div>`).join("")}`) : "";
  let danger = "";
  // 沒有帳號的紀錄（2026-11-07）：「邀請回來」取代原本的「校友碼與刪除紀錄」。Co-President 與 Senior Adviser 都寄得了；
  // 發碼那一條收在摺疊裡（沒有 email 的人才用）；刪除紀錄還是只有 Co-President，放最底下。
  if (!hasAccount(p)) {
    danger = inviteBackHTML(p, d, busy, isPres)
      + (isPres ? sectionHTML(T("pe.deleteRecord"), `<div class="row"><button class="btn danger sm" data-act="record-delete" data-id="${esc(p.person_id)}"${dis}>${T("pe.deleteRecord")}</button></div>
        <div class="mini">${T("pe.deleteRecordNote")}</div>`) : "");
  } else if (isPres) {
    if (!self) {
      danger = sectionHTML(T("pe.danger"), remove
        ? `<div class="note">${T("pe.removeList", { name: esc(name) })}</div>
           <label><i>${T("pe.removeType", { name: esc(name) })}</i><input id="pk-confirm" value="${esc(remove.typed || "")}" autocomplete="off"${dis}></label>
           <div class="row"><button class="btn danger" data-act="member-remove-go" data-id="${esc(p.person_id)}" data-name="${esc(name)}"${dis}>${T("pe.removeGo")}</button>
           <button class="btn ghost" data-act="member-remove-cancel"${dis}>${T("common.cancel")}</button></div>`
        : `<div class="row"><button class="btn danger sm" data-act="member-remove" data-id="${esc(p.person_id)}"${dis}>${T("pe.remove")}</button></div>
           <div class="mini">${T("pe.removeNote")}</div>`);
    }
  }
  // 2026-11-06 自動儲存：職級、名字、這一屆的職位、team 標籤四塊在同一個 data-autosave="person-save" 容器裡，
  // 改了就存（main.js 的 onAutosave 走跟原本那顆鈕一樣的幾步：職級、名字、職位、標籤，照樣記進變動紀錄）。
  // 存取格（wsSec）本來就是一格一格改了就送（grid-level），不放進容器。「存起來」鈕拿掉了，換成那個小字。
  return pageHead(`${esc(name)}${alt ? `<span class="alt">${esc(alt)}</span>` : ""}`, lede, [], { act: "roster-back", label: T("pe.back") })
    + msgHTML(msg)
    + `<div data-autosave="person-save" data-id="${esc(p.person_id)}">` + rankSec + nameSec + posSec + teamSec + `</div>` + wsSec
    + `<div class="form-foot" style="margin-bottom:28px">
      ${autosaveHint("person-save")}
      <button class="btn ghost" data-act="roster-back"${dis}>${T("pe.back")}</button>
    </div>`
    + dupSec + danger;
}

// 加一筆過去的紀錄（沒有帳號的人）：名字加一筆職位。
export function personNewHTML(terms, msg, busy, draft) {
  const d = draft || {};
  const dis = busy ? " disabled" : "";
  const termId = d.term || ((terms || []).find(t => t.status !== "current") || (terms || [])[0] || {}).id || "";
  return pageHead(T("pn.title"), T("pn.lede"), [], { act: "roster-back", label: T("pe.back") })
    + msgHTML(msg)
    + sectionHTML("", `<div class="two">
      <label><i>${T("pe.nameZh")}</i><input id="pn-zh" value="${esc(d.name_zh || "")}"${dis}></label>
      <label><i>${T("pe.nameEn")}</i><input id="pn-en" value="${esc(d.name_en || "")}"${dis}></label>
    </div>
    <label><i>${T("pe.term")}</i><select id="pn-term"${dis}>${(terms || []).map(t => `<option value="${esc(t.id)}"${termId === t.id ? " selected" : ""}>${esc(t.id)}${t.status === "current" ? T("ro.curMark") : ""}</option>`).join("")}</select></label>
    <div class="two">
      <label><i>${T("pe.rankPick")}</i>${rankSelect("pn-rank", d.rank != null ? d.rank : rankOfTitle(d.title_en, d.pteam), dis)}</label>
      <label><i>${T("pe.posTeam")}</i>${teamSelect("pn-pteam", d.pteam || "", dis, isOrgWide(d.rank != null ? d.rank : rankOfTitle(d.title_en, d.pteam)))}</label>
    </div>
    <div class="two"${(d.rank != null ? d.rank : rankOfTitle(d.title_en, d.pteam)) === "custom" ? "" : " hidden"}>
      <label><i>${T("pe.titleEn")}</i><input id="pn-ten" value="${esc(d.title_en || "")}" placeholder="Associate, Marketing Team"${dis}></label>
      <label><i>${T("pe.titleZh")}</i><input id="pn-tzh" value="${esc(d.title_zh || "")}"${dis}></label>
    </div>
    <label><i>${T("pn.note")}</i><input id="pn-note" value="${esc(d.note || "")}" placeholder="${esc(T("pn.notePh"))}"${dis}></label>
    <div class="note">${T("pn.order")}</div>
    <div class="form-foot">
      <button class="btn" data-act="person-create"${dis}>${busy ? T("common.saving") : T("pn.create")}</button>
      <button class="btn ghost" data-act="roster-back"${dis}>${T("common.cancel")}</button>
    </div>`);
}

// 工作區：左邊清單、右邊這個工作區裡有誰、底下加人。sel 是選中的工作區 id，members 是 workspace_members(sel)。
// draft = { pk（右欄多選加人的狀態）, npk（新增表單那一塊的）, team, slug, title_zh, title_en, owner }。canCreate 是能不能新增工作區（Co-President 與 Senior Adviser）。
export function pkPeopleOf(cadres) { return (cadres || []).map(p => ({ id: p.profile_id, name_zh: p.name_zh, name_en: p.name_en, board_role: p.board_role, team: p.team })); }
export function workspacesHTML(workspaces, sel, members, people, msg, busy, draft, canCreate) {
  const list = (workspaces || []).filter(w => w.active !== false);
  const d = draft || {};
  const dis = busy ? " disabled" : "";
  const w = list.find(x => x.id === sel) || null;
  const cadres = (people || []).filter(p => hasAccount(p) && p.role === "cadre");
  const inWs = new Set((members || []).map(m => m.user_id));
  const byProfile = Object.fromEntries(cadres.map(p => [p.profile_id, p]));
  // 多選加人要的形狀（跟成員分頁從 profiles 讀的一樣：id 是 profile_id）。
  const pkPeople = pkPeopleOf(cadres);
  const KIND = { passport: "ws.kind.passport", "intern-passport": "ws.kind.intern", apps: "ws.kind.apps", res: "ws.kind.res", custom: "ws.kind.custom" };
  const li = x => `<a class="rail-item${x.id === sel ? " on" : ""}" href="#ws=${encodeURIComponent(x.id)}" data-act="ws-pick" data-ws="${esc(x.id)}">${esc(wsCellLabel(x))}<span class="rail-count">${esc(T(KIND[x.kind] || "ws.kind.custom"))}</span></a>`;
  // 左邊照 team 分組（2026-10-24）：整個 BT、六個 team，每一組底下是那個 team 擁有的東西。
  const left = list.length ? wsRows(list, TEAMS, people).filter(r => r.cells.length).map(r => `<div class="rail-group">${esc(r.label)}</div><div class="wslist">${r.cells.map(li).join("")}</div>`).join("")
    : emptyHTML(T("ws.empty"), T("ws.emptyHint"));
  const ownerName = w && w.owner && byProfile[w.owner] ? personName(byProfile[w.owner]).name : "";
  // 2026-10-24：兩欄成員區（左「在裡面的」右「還沒在裡面的」，見 membersAreaHTML）。Co-President 與 Senior Adviser 在左欄最上面標「依職級」。
  const right = !w ? `<div class="empty"><b>${T("ws.pickOne")}</b></div>` : `
    <h2>${esc(wsCellLabel(w))}<span class="hint">${esc(wsTeamOf(w, people) || T("ws.board"))}・${esc(w.id)}${ownerName ? T("ws.owner", { name: esc(ownerName) }) : ""}</span></h2>
    <div class="note">${T("ws.levels")} ${T("ws.addNote")}</div>
    ${membersAreaHTML("ws", { rows: members || [], people: pkPeople, pk: d.pk, busy, acts: { level: "ws-level", remove: "ws-unassign", cleanup: "ws-cleanup" }, canCleanup: !!canCreate, go: { act: "ws-assign", ws: w.id } })}`;
  // 新增工作區（2026-10-23 批 2）：一張表單做完，名稱、擁有人、代號（從英文名稱自動算）、一開始就放進去的人各自一個等級。
  // 不再收在摺疊裡。main.js 的 ws-create 先建工作區，再把勾起來的人一個一個派進去。
  // 一開始就放進去的人（2026-10-24 改成同一塊多選）：一個等級套全部，建立鈕上算人數。
  const nNew = pkPicked(pkPeople, [], d.npk).length;
  // 先選 team（2026-10-24）：新的那一格會出現在那個 team 的那一列底下。表上沒有欄位存 team，靠擁有人勾的 team 推，
  // 所以擁有人只列那個 team 的人；沒選 team 的放在「整個 BT」那一列。
  const ownerPool = d.team ? cadres.filter(p => parseTeams(p.team).includes(d.team)) : cadres;
  const create = canCreate ? sectionHTML(T("ws.new"), `<div class="note">${T("ws.newWhat")}</div><div class="two">
      <label><i>${T("ws.team")}</i><select id="wsn-team" data-act="wsn-team"${dis}><option value="">${T("ws.board")}</option>${TEAMS.map(t => `<option value="${esc(t)}"${d.team === t ? " selected" : ""}>${esc(t.replace(/\s*Team$/i, ""))}</option>`).join("")}</select></label>
      <label><i>${T("ws.ownerPick")}</i><select id="wsn-owner"${dis}><option value="">${T("value.none")}</option>${ownerPool.map(p => `<option value="${esc(p.profile_id)}"${d.owner === p.profile_id ? " selected" : ""}>${esc(pickName(p))}</option>`).join("")}</select></label>
      <label><i>${T("ws.titleEn")}</i><input id="wsn-en" value="${esc(d.title_en || "")}" placeholder="Winter camp 2027"${dis}></label>
      <label><i>${T("ws.titleZh")}</i><input id="wsn-zh" value="${esc(d.title_zh || "")}" placeholder="2027 冬令營"${dis}></label>
      <label><i>${T("ws.slug")}</i><input id="wsn-slug" value="${esc(d.slug || "")}" placeholder="winter-camp-2027" autocomplete="off"${dis}></label>
    </div>
    <div class="mini">${T("ws.slugNote")} ${d.team ? T("ws.teamByOwner", { team: esc(d.team.replace(/\s*Team$/i, "")) }) : ""}</div>
    <h3 class="sec-h" style="margin-top:16px">${T("ws.newMembers")}</h3>
    ${membersAreaHTML("wsn", { people: pkPeople, pk: d.npk, busy, draft: true })}
    <div class="row" style="margin-top:14px"><button class="btn" data-act="ws-create"${dis}>${busy ? T("common.saving") : (nNew ? T("ws.createGoN", { n: nNew }) : T("ws.createGo"))}</button></div>
    <div class="mini">${T("ws.newNote")}</div>`, { id: "ws-new" }) : "";
  return pageHead(T("ws.title"), T("ws.lede"))
    + msgHTML(msg)
    + `<div class="cols cols-slim"><section class="section">${left}</section><section class="section">${right}</section></div>`
    + create;
}

// 屆別：清單加人數、補過去的一屆、貼一整屆、結束這一屆（三步）。
// draft = { new: {id, zh, en, starts, ends}, paste: { term, text } }
// end = null 或 { step: 1|2|3, next: {id, zh, en, starts, ends}, keep: [profile_id…], typed }
export function termsHTML(terms, people, meId, isPres, msg, busy, draft, end) {
  const d = draft || {}; const nw = d.new || {}; const ps = d.paste || {};
  const dis = busy ? " disabled" : "";
  const cur = currentTerm(terms);
  const count = t => (people || []).filter(p => positionFor(p, t.id)).length;
  const noAcc = t => (people || []).filter(p => positionFor(p, t.id) && !hasAccount(p)).length;
  const rows = (terms || []).map(t => `<li><div class="fhead"><b>${esc(t.id)}</b>${t.status === "current" ? `<span class="tag open">${T("tm.current")}</span>` : `<span class="tag draft">${T("tm.ended")}</span>`}</div>
    <div class="fmeta">${esc((lang() === "zh" ? (t.title_zh || t.title_en) : (t.title_en || t.title_zh)) || "")}・${esc(t.starts_on)} → ${esc(t.ends_on)}・${T("tm.count", { n: count(t), m: noAcc(t) })}</div></li>`).join("");
  const listSec = sectionHTML(T("tm.list"), rows ? `<ul class="flist">${rows}</ul>` : emptyHTML(T("tm.empty"), T("tm.emptyHint")));
  const newSec = sectionHTML(T("tm.new"), `<div class="two">
      <label><i>${T("tm.id")}</i><input id="tm-id" value="${esc(nw.id || "")}" placeholder="2024-25"${dis}></label>
      <span></span>
      <label><i>${T("ws.titleZh")}</i><input id="tm-zh" value="${esc(nw.zh || "")}" placeholder="2024-25 屆"${dis}></label>
      <label><i>${T("ws.titleEn")}</i><input id="tm-en" value="${esc(nw.en || "")}" placeholder="TERM 2024-25"${dis}></label>
      <label><i>${T("tm.starts")}</i><input id="tm-starts" type="date" value="${esc(nw.starts || "")}"${dis}></label>
      <label><i>${T("tm.ends")}</i><input id="tm-ends" type="date" value="${esc(nw.ends || "")}"${dis}></label>
    </div>
    <div class="row"><button class="btn ghost" data-act="term-create"${dis}>${T("tm.createGo")}</button></div>
    <div class="mini">${T("tm.newNote")}</div>`);
  const pasteSec = sectionHTML(T("tm.paste"), `<label><i>${T("pe.term")}</i><select id="tp-term"${dis}>${(terms || []).map(t => `<option value="${esc(t.id)}"${(ps.term || (cur && cur.id)) === t.id ? " selected" : ""}>${esc(t.id)}</option>`).join("")}</select></label>
    <label><i>${T("tm.pasteBox")}</i><textarea id="tp-text" rows="6" placeholder="${esc(T("tm.pastePh"))}"${dis}>${esc(ps.text || "")}</textarea></label>${
    ps.preview ? `<div class="note">${T("tm.pastePreview", { n: ps.preview.rows.length, bad: ps.preview.bad.length ? T("tm.pasteBad", { lines: ps.preview.bad.join(", ") }) : "" })}</div>
      <table class="table"><thead><tr><th>${T("pe.nameZh")}</th><th>${T("pe.nameEn")}</th><th>${T("ro.position")}</th><th>${T("ro.team")}</th></tr></thead><tbody>${
        ps.preview.rows.map(r => `<tr><td>${esc(r.name_zh)}</td><td>${esc(r.name_en)}</td><td>${esc(r.title_en)}</td><td>${esc(r.team)}</td></tr>`).join("")}</tbody></table>
      <div class="row"><button class="btn" data-act="paste-go"${dis}>${T("tm.pasteGo", { n: ps.preview.rows.length })}</button><button class="btn ghost" data-act="paste-cancel"${dis}>${T("common.cancel")}</button></div>`
    : `<div class="row"><button class="btn ghost" data-act="paste-preview"${dis}>${T("tm.pastePreviewGo")}</button></div>`}
    <div class="mini">${T("tm.pasteNote")}</div>`);
  let endSec = "";
  if (isPres && cur) {
    if (!end) {
      endSec = sectionHTML(T("tm.end"), `<div class="note">${T("tm.endNote", { term: esc(cur.id) })}</div>
        <div class="row"><button class="btn danger" data-act="end-start"${dis}>${T("tm.endStart", { term: esc(cur.id) })}</button></div>`);
    } else {
      const n = end.next || {};
      const cadres = (people || []).filter(p => hasAccount(p) && p.role === "cadre");
      const keep = new Set(end.keep || []);
      keep.add(meId);
      const stay = cadres.filter(p => keep.has(p.profile_id)).length;
      const go = cadres.length - stay;
      const step1 = `<h3>${T("tm.step1")}</h3><div class="two">
        <label><i>${T("tm.id")}</i><input id="en-id" value="${esc(n.id || nextTermId(cur.id))}"${dis}></label><span></span>
        <label><i>${T("ws.titleZh")}</i><input id="en-zh" value="${esc(n.zh || "")}"${dis}></label>
        <label><i>${T("ws.titleEn")}</i><input id="en-en" value="${esc(n.en || "")}"${dis}></label>
        <label><i>${T("tm.starts")}</i><input id="en-starts" type="date" value="${esc(n.starts || "")}"${dis}></label>
        <label><i>${T("tm.ends")}</i><input id="en-ends" type="date" value="${esc(n.ends || "")}"${dis}></label>
      </div><div class="row"><button class="btn" data-act="end-step2"${dis}>${T("tm.next")}</button><button class="btn ghost" data-act="end-cancel"${dis}>${T("common.cancel")}</button></div>`;
      const step2 = `<h3>${T("tm.step2")}</h3><div class="note">${T("tm.keepNote")}</div>
        <div class="row" style="margin-bottom:10px"><button class="btn ghost sm" data-act="end-keep-all"${dis}>${T("tm.keepAll")}</button><button class="btn ghost sm" data-act="end-keep-none"${dis}>${T("tm.keepNone")}</button>
          <span class="tag open">${T("tm.stay", { n: stay })}</span><span class="tag warn">${T("tm.go", { n: go })}</span></div>
        <div class="tgrid">${cadres.map(p => `<label class="check tpick"><input type="checkbox" name="keep" value="${esc(p.profile_id)}"${keep.has(p.profile_id) ? " checked" : ""}${p.profile_id === meId ? " disabled" : dis}>
          <span>${nameBlock(p)}<span class="mini"> ${esc(boardLabel(p.board_role))}${p.profile_id === meId ? "・" + T("ro.you") : ""}</span></span></label>`).join("")}</div>
        <div class="row" style="margin-top:14px"><button class="btn" data-act="end-step3"${dis}>${T("tm.next")}</button><button class="btn ghost" data-act="end-back1"${dis}>${T("tm.back")}</button></div>`;
      const step3 = `<h3>${T("tm.step3")}</h3><div class="note">${T("tm.confirmNote", { term: esc(cur.id), next: esc(n.id || ""), stay, go })}</div>
        <label><i>${T("tm.typeId", { id: esc(n.id || "") })}</i><input id="en-typed" value="${esc(end.typed || "")}" autocomplete="off"${dis}></label>
        <div class="row"><button class="btn danger" data-act="end-go"${dis}>${T("tm.endGo")}</button><button class="btn ghost" data-act="end-back2"${dis}>${T("tm.back")}</button></div>`;
      endSec = sectionHTML(T("tm.end"), end.step === 3 ? step3 : end.step === 2 ? step2 : step1, { id: "end-term" });
    }
  }
  return pageHead(T("tm.title"), T("tm.lede"))
    + msgHTML(msg)
    + listSec + endSec + newSec + pasteSec;
}

// 只有 Co-President 與 Senior Adviser 進得來。真正的門在資料庫那幾支函式的第一句，
// 這裡少畫一個分頁不是安全機制：Director 硬打網址進來，看到的是這一句，按不到任何東西。
export function noAccessHTML(me) {
  return pageHead(T("noAccess.title"), T("noAccess.lede"),
    [{ label: T("noAccess.back"), href: withLang("../") }]);
}

// 邀請碼（2026-10-14）。**只有 Co-President 看得到這個分頁。**
// 同一天 Paul 拍板：做新增與停用，**不做刪除**（刪掉之後使用紀錄就對不回任何一組碼）。
// 真正的門在資料庫：create_invite() 與 disable_invite() 第一句都問 is_president()
// （2026-10-15-invite-admin.sql）。這裡少畫一顆按鈕不是安全機制。
//
// ⚠ 使用紀錄是 2026-10-14 跑完 invite-uses 那支遷移檔之後才開始記的。
// 之前用掉的次數只反映在「還剩幾次」，查不到是誰。那句提醒一定要留著，
// 不然看的人會以為「沒有紀錄」等於「沒有人用過」。
//
// role 是那個人**現在**的身分，grants 是**那一次**換到的身分。兩個不一樣
// 就多寫一句「現在是…」，例如校友後來又拿了幹部碼。
const ROLE_KEY = { cadre: "role.cadre", alumni: "role.alumni", student: "role.student", intern: "role.intern" };
const GRANT_KEY = { cadre: "grant.cadre", alumni: "grant.alumni", intern: "grant.intern" };
const roleName = v => ROLE_KEY[v] ? T(ROLE_KEY[v]) : (v || "");
const grantName = v => GRANT_KEY[v] ? T(GRANT_KEY[v]) : (v || "");

// 系統先幫忙想一組碼：bt- 加六個字。**刻意不用 0 o 1 l i**，
// 那幾個字在很多字型裡長得一樣，而學生打錯時畫面只會說「這個邀請碼不對」。
// rand 可以傳進來，測試才固定得住結果。
const CODE_ABC = "abcdefghjkmnpqrstuvwxyz23456789";
export function suggestCode(rand = Math.random) {
  let out = "bt-";
  for (let i = 0; i < 6; i++) out += CODE_ABC[Math.floor(rand() * CODE_ABC.length) % CODE_ABC.length];
  return out;
}

// draft 是表單上現在填的值。存在 S 裡，不是只在 DOM 上：
// 按下去之後畫面會重畫一次，沒存起來的話建失敗時剛填的東西就全不見了。
export function inviteFormHTML(draft, busy) {
  const d = draft || {};
  const dis = busy ? " disabled" : "";
  return `<div class="card" id="invite-form"><h2>${T("iv.formTitle")}</h2>
    <div class="two">
      <label><i>${T("iv.code")}</i><input id="ic-code" value="${esc(d.code || "")}"
        autocomplete="off" spellcheck="false"${dis}></label>
      <label><i>${T("iv.grants")}</i><select id="ic-grants"${dis}>
        <option value="cadre"${d.grants !== "alumni" && d.grants !== "intern" ? " selected" : ""}>${T("iv.cadreOpt")}</option>
        <option value="alumni"${d.grants === "alumni" ? " selected" : ""}>${T("iv.alumniOpt")}</option>
        <option value="intern"${d.grants === "intern" ? " selected" : ""}>${T("iv.internOpt")}</option>
      </select></label>
      <label><i>${T("iv.uses")}</i><input id="ic-uses" type="number" min="1" max="100"
        value="${esc(String(d.uses || 1))}"${dis}></label>
      <label><i>${T("iv.note")}</i><input id="ic-note" value="${esc(d.note || "")}"
        placeholder="${esc(T("iv.notePh"))}"${dis}></label>
    </div>
    <div class="row">
      <button class="btn" data-act="invite-new"${dis}>${T("iv.create")}</button>
      <button class="btn ghost sm" data-act="invite-suggest"${dis}>${T("iv.suggest")}</button>
    </div></div>`;
}

export function inviteCodesHTML(rows, msg, busy, draft) {
  const list = rows || [];
  const item = c => {
    const uses = Array.isArray(c.uses) ? c.uses : [];
    const left = Number(c.uses_left) || 0;
    return `<li>
      <div class="fhead"><b>${esc(c.code)}</b>
        <span class="tag">${esc(grantName(c.grants))}</span>
        ${left > 0 ? `<span class="tag open">${T("iv.left", { n: left })}</span>`
                   : `<span class="tag draft">${T("iv.usedUp")}</span>`}</div>
      ${c.note ? `<div class="fmeta">${T("iv.noteLine", { note: esc(c.note) })}</div>` : ""}
      <div class="fmeta">${T("iv.created", { d: esc(String(c.created_at || "").slice(0, 10) || T("iv.unknown")), n: uses.length })}</div>
      ${left > 0 ? `<div class="row"><button class="btn ghost sm" data-act="invite-disable"
        data-code="${esc(c.code)}"${busy ? " disabled" : ""}>${T("iv.disable")}</button></div>` : ""}
      ${uses.length ? `<details class="ans"><summary>${T("iv.whoUsed", { n: uses.length })}</summary>
      ${uses.map(u => `<div class="fmeta">・<b>${esc(u.name || T("common.noName"))}</b>
        ${esc(u.email || T("iv.noEmail"))}・${esc(String(u.used_at || "").slice(0, 10))}・${T("iv.became", { role: esc(roleName(u.grants)) })}${
        u.role && u.role !== u.grants ? T("iv.nowIs", { role: esc(roleName(u.role)) }) : ""}</div>`).join("")}</details>` : ""}
    </li>`;
  };
  return pageHead(T("iv.title"), T("iv.lede"))
    + msgHTML(msg)
    + inviteFormHTML(draft, busy)
    + sectionHTML(T("iv.issued"), `<div class="note">${T("iv.issuedNote")}</div>
    ${list.length ? `<ul class="flist">${list.map(item).join("")}</ul>`
                  : emptyHTML(T("iv.empty"), T("iv.emptyHint"))}`, { id: "codes" });
}

// ── 邀請信（2026-10-29，docs/2026-10-24-邀請信.md）────────────────────
// rows 是 invites_for_review()；batch 是 invite_codes_for_review()（舊的批次碼，收在摺疊裡）；
// draft = { email, who, rank（職位下拉）, team, term, name_zh, name_en, title_en, title_zh, line, note }。
// who 是「他會是」那一格的值：cadre:<職級>、alumni、intern。
export const INVITE_WHO = ["cadre:president", "cadre:senior_adviser", "cadre:director", "cadre:adviser", "cadre:member", "alumni", "intern"];
export function whoLabel(v) {
  if (v === "alumni") return T("in.who.alumni");
  if (v === "intern") return T("in.who.intern");
  return T("in.who.cadre", { rank: boardLabel(String(v || "").replace(/^cadre:/, "")) });
}
export function inviteFormNewHTML(draft, terms, busy, people) {
  const d = draft || {};
  const dis = busy ? " disabled" : "";
  // 2026-11-07：打的名字對到名單上沒有帳號的人，先問要掛到哪一筆。d.candidates 是資料庫回 ambiguous_person 帶的 id（優先）。
  const matches = Array.isArray(d.candidates) && d.candidates.length
    ? (people || []).filter(p => d.candidates.includes(p.person_id)) : nameMatches(people, d.name_zh, d.name_en);
  const who = d.who || "cadre:member";
  const cur = currentTerm(terms);
  const termId = d.term || (cur ? cur.id : "");
  const posRank = d.rank != null ? d.rank : rankOfTitle(d.title_en, d.team);
  return `<div class="card inline-form" id="invite-new"><h2>${T("in.form")}</h2>
    <div class="two">
      <label><i>${T("in.email")}</i><input id="in-email" type="email" value="${esc(d.email || "")}" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="name@example.com"${dis}></label>
      <label><i>${T("in.who")}</i><select id="in-who"${dis}>${INVITE_WHO.map(v => `<option value="${v}"${who === v ? " selected" : ""}>${esc(whoLabel(v))}</option>`).join("")}</select></label>
      <label><i>${T("in.position")}</i>${rankSelect("in-rank", posRank, dis)}</label>
      <label><i>${T("pe.posTeam")}</i>${teamSelect("in-team", d.team || "", dis, isOrgWide(posRank))}</label>
    </div>
    <div class="two"${posRank === "custom" ? "" : " hidden"}>
      <label><i>${T("pe.titleEn")}</i><input id="in-ten" value="${esc(d.title_en || "")}" placeholder="Director, Curriculum Team"${dis}></label>
      <label><i>${T("pe.titleZh")}</i><input id="in-tzh" value="${esc(d.title_zh || "")}"${dis}></label>
    </div>
    <div class="two">
      <label><i>${T("in.term")}</i><select id="in-term"${dis}><option value="">${T("value.none")}</option>${(terms || []).map(t => `<option value="${esc(t.id)}"${termId === t.id ? " selected" : ""}>${esc(t.id)}${t.status === "current" ? T("ro.curMark") : ""}</option>`).join("")}</select></label>
      <span></span>
      <label><i>${T("in.nameZh")}</i><input id="in-zh" value="${esc(d.name_zh || "")}"${dis}></label>
      <label><i>${T("in.nameEn")}</i><input id="in-en" value="${esc(d.name_en || "")}"${dis}></label>
    </div>
    ${inviteChooserHTML(matches, d.attach || "", busy)}
    <div class="two">
      <label><i>${T("in.line")}</i><input id="in-line" value="${esc(d.line || "")}" placeholder="${esc(T("in.linePh"))}"${dis}></label>
      <label><i>${T("in.note")}</i><input id="in-note" value="${esc(d.note || "")}"${dis}></label>
    </div>
    <div class="row"><button class="btn" data-act="invite-send"${dis}>${busy ? T("in.sending") : T("in.send")}</button></div>
    <div class="mini">${T("in.formNote")}</div>
  </div>`;
}
const ST_TAG = { queued: "", sent: "open", failed: "warn", opened: "open", claimed: "done", expired: "draft", revoked: "draft" };
// batchOpen：上次有沒有展開（main.js 從 localStorage 讀），預設收著。
export function invitesPageHTML(rows, batch, terms, msg, busy, draft, batchDraft, isPres, batchOpen, people) {
  const list = rows || [];
  const dis = busy ? " disabled" : "";
  const d10 = v => String(v || "").slice(0, 10);
  const item = r => {
    const who = r.grants === "cadre" ? T("in.who.cadre", { rank: boardLabel(r.rank || "member") }) : r.grants === "intern" ? T("in.who.intern") : T("in.who.alumni");
    const live = ["queued", "sent", "failed", "opened"].includes(r.status);
    return `<li>
      <div class="fhead"><b>${esc(r.email)}</b><span class="tag ${ST_TAG[r.status] || ""}">${esc(T("in.st." + r.status) || r.status)}</span>${
        r.person_name && r.person_name !== T("common.noName") ? `<span class="alt">${esc(r.person_name)}</span>` : ""}</div>
      <div class="fmeta">${T("in.meta", { who: esc(who + (r.title ? "・" + r.title : "")), when: esc(d10(r.created_at)), by: esc(r.invited_by_name || "") })}${
        live && r.expires_at ? "・" + T("in.expires", { d: esc(d10(r.expires_at)) }) : ""}・<span class="mini">${T("in.code", { code: esc(r.code) })}</span></div>
      ${r.status === "failed" && r.mail_error ? `<div class="fmeta">${T("in.mailErr", { err: esc(r.mail_error) })}</div>` : ""}
      ${r.status === "claimed" ? `<div class="fmeta">${T("in.claimedBy", { name: esc(r.claimed_name || ""), d: esc(d10(r.claimed_at)) })}</div>` : ""}
      ${r.note ? `<div class="fmeta">${T("iv.noteLine", { note: esc(r.note) })}</div>` : ""}
      <div class="row">${
        r.status !== "claimed" ? `<button class="btn ghost sm" data-act="invite-resend" data-code="${esc(r.code)}" data-email="${esc(r.email)}"${dis}>${T("in.resend")}</button>` : ""}${
        live && isPres ? `<button class="btn quiet sm" data-act="invite-revoke" data-code="${esc(r.code)}" data-email="${esc(r.email)}"${dis}>${T("in.revoke")}</button>` : ""}${
        r.person_id ? `<a class="btn quiet sm" href="#person=${encodeURIComponent(r.person_id)}" data-act="tab" data-t="person=${esc(r.person_id)}">${T("in.openRecord")}</a>` : ""}</div>
    </li>`;
  };
  return pageHead(T("in.title"), T("in.lede"))
    + msgHTML(msg)
    + inviteFormNewHTML(draft, terms, busy, people)
    + sectionHTML(T("in.list"), list.length ? `<ul class="flist">${list.map(item).join("")}</ul>` : emptyHTML(T("in.empty"), T("in.emptyHint")), { id: "invites" })
    // 2026-11-03 Paul 找不到那一行字：改成有框、有箭頭、有一句說明的面板。<details> 原生就吃 Enter 與 aria-expanded，main.js 記住開著沒。
    + (isPres ? `<details class="fold" id="batch"${batchOpen ? " open" : ""}><summary><span class="chev" aria-hidden="true"></span><b>${T("in.batch")}</b><span class="mini">${T("in.batchHint")}</span></summary><div class="fold-body">${inviteFormHTML(batchDraft, busy)}${
        sectionHTML(T("iv.issued"), `<div class="note">${T("iv.issuedNote")}</div>${(batch || []).length
          ? `<ul class="flist">${(batch || []).map(c => inviteCodesHTML([c], "", busy, null).replace(/^[\s\S]*?<ul class="flist">/, "").replace(/<\/ul>[\s\S]*$/, "")).join("")}</ul>`
          : emptyHTML(T("iv.empty"), T("iv.emptyHint"))}`, { id: "codes" })}</div></details>` : "");
}

export function notCadreHTML() {
  return pageHead(T("notCadre.title"), T("notCadre.lede"), [{ label: T("notCadre.back"), href: "../../app/" }]);
}

// err：資料庫真正回的那一句，印在底下小字。開頁會先自己重試一次（main.js 的 retryBoot），第二次才顯示這一頁。
export function downHTML(err) {
  return pageHead(T("down.title"), T("down.lede"), [{ act: "retry", label: T("common.retry") }])
    + (err ? `<div class="mini">${esc(T("down.detail"))}${esc(err)}</div>` : "");
}
