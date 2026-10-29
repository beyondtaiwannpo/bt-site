// 後台「財務」那一組的畫面（2026-11-08）：總覽、收支、帳戶與類別、預算、匯出。
// 前半段（側欄、外殼、回饋、自動儲存、成員區）2026-11-08 從 admin/people/src/ui.js 原樣抄過來，五份一模一樣（test/admin-hub.test.mjs 逐字比對）。
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

export function downHTML(err) {
  return pageHead(T("down.title"), T("down.lede"), [{ act: "retry", label: T("common.retry") }])
    + (err ? `<div class="mini">${esc(T("down.detail"))}${esc(err)}</div>` : "");
}
export function notCadreHTML() {
  return pageHead(T("notCadre.title"), T("notCadre.lede"), [{ label: T("notCadre.back"), href: "../../app/" }]);
}
export function noAccessHTML(me) {
  return pageHead(T("noAccess.title"), T("noAccess.lede"), [{ label: T("noAccess.back"), href: withLang("../") }]);
}

// ═══════════════════════════════════════════════════════════════════════
// 財務（2026-11-08）。Paul 2026-11-07：「總共多少錢、花在哪、收入，全部」。
// 設計在 docs/2026-11-08-財務設計.md。這一半是純函式：算、篩、格式、畫。資料庫那一半在 2026-11-08-finance.sql。
//
// 誰看得到、誰改得動：my_access() 在 finance 那一格填 view 或 edit（can_view_finance / can_edit_finance 算的），
// Co-President 與 Senior Adviser 本來就看得到（senior），Co-President 改得動。**這只是畫面，門在資料庫每一支函式第一句與 RLS。**
// ═══════════════════════════════════════════════════════════════════════
export function finLevel(me) {
  if (!me || me.role !== "cadre") return "";
  const cell = String((me.ws || {}).finance || "");
  if (me.board === "president" || cell === "edit") return "edit";
  if (me.board === "senior_adviser" || cell === "view") return "view";
  return "";
}
export const canEditFin = me => finLevel(me) === "edit";
export const canViewFin = me => !!finLevel(me);

// ── 金額 ────────────────────────────────────────────────────────────────
// NT$ 在前、千分位、有角分才印小數（NT$12.50），整數不印 .00。負數減號在最前面。美金 US$，別的幣別印代碼。
const SYM = { TWD: "NT$", USD: "US$" };
export function num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }
export function fmtNum(v) {
  const n = Math.round(num(v) * 100) / 100;
  const abs = Math.abs(n);
  const hasCents = Math.round(abs * 100) % 100 !== 0;
  const s = abs.toFixed(hasCents ? 2 : 0).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return (n < 0 ? "-" : "") + s;
}
export function fmtMoney(v, currency) {
  const cur = String(currency || "TWD").toUpperCase();
  const s = fmtNum(v);
  const neg = s.startsWith("-");
  const body = neg ? s.slice(1) : s;
  const sym = SYM[cur];
  return (neg ? "-" : "") + (sym ? sym + body : cur + " " + body);
}
// 存進資料庫的台幣：台幣就是金額本身；別的幣別是金額 × 匯率，四捨五入到分；沒有匯率就算不出來（null，畫面擋）。
export function toTwd(amount, currency, rate) {
  const a = num(amount);
  if (String(currency || "TWD").toUpperCase() === "TWD") return Math.round(a * 100) / 100;
  const r = Number(rate);
  if (!Number.isFinite(r) || r <= 0) return null;
  return Math.round(a * r * 100) / 100;
}
export const CURRENCIES = ["TWD", "USD"];

// ── 日期與屆 ────────────────────────────────────────────────────────────
export const ym = d => String(d || "").slice(0, 7);
export function termOf(date, terms) {
  const d = String(date || "").slice(0, 10);
  const hit = (terms || []).find(t => t.starts_on <= d && d <= t.ends_on);
  if (hit) return hit.id;
  const cur = (terms || []).find(t => t.status === "current");
  return cur ? cur.id : "";
}
export function currentTerm(terms) { return (terms || []).find(t => t.status === "current") || null; }
// 從 a 的那個月到 b 的那個月，每個月一個 "YYYY-MM"。
export function monthsBetween(a, b) {
  const s = ym(a), e = ym(b);
  if (!s || !e || s > e) return [];
  const out = [];
  let [y, m] = s.split("-").map(Number);
  for (let i = 0; i < 600; i++) {
    const cur = `${y}-${String(m).padStart(2, "0")}`;
    out.push(cur);
    if (cur === e) break;
    m += 1; if (m > 12) { m = 1; y += 1; }
  }
  return out;
}
const todayStr = () => new Date().toISOString().slice(0, 10);
const live = t => !t.voided_at;

// ── 總覽的算法 ──────────────────────────────────────────────────────────
// 餘額 = 開帳餘額 + 收入 − 支出 − 轉出 + 轉入，只算開帳日那天起的、沒作廢的。資料庫的 fin_overview() 是同一條公式（smoke 驗它、這裡 node 驗）。
// 這一屆的數字只看 term_id 等於那一屆的列。月份：從那一屆開始的那個月到「今天或最後一筆」（結束了的屆印整年）。
export function balanceOf(acc, transactions) {
  const from = String(acc.opening_on || "0000-00-00");
  let b = num(acc.opening_balance);
  for (const t of transactions || []) {
    if (!live(t) || String(t.happened_on) < from) continue;
    const amt = num(t.amount_twd);
    if (t.kind === "income" && t.account_id === acc.id) b += amt;
    else if (t.kind === "expense" && t.account_id === acc.id) b -= amt;
    else if (t.kind === "transfer") { if (t.account_id === acc.id) b -= amt; if (t.to_account_id === acc.id) b += amt; }
  }
  return Math.round(b * 100) / 100;
}
export function overview(x) {
  const accounts = (x.accounts || []).filter(a => !a.archived_at).sort((a, b) => num(a.sort) - num(b.sort));
  const cats = [...(x.categories || [])].sort((a, b) => num(a.sort) - num(b.sort));
  const tx = x.transactions || [];
  const term = x.term || null;
  const today = x.today || todayStr();
  const balances = accounts.map(a => ({ account: a, balance: balanceOf(a, tx) }));
  const total = Math.round(balances.reduce((s, b) => s + b.balance, 0) * 100) / 100;
  const mine = term ? tx.filter(t => live(t) && t.term_id === term.id) : [];
  const sum = rows => Math.round(rows.reduce((s, t) => s + num(t.amount_twd), 0) * 100) / 100;
  const inc = mine.filter(t => t.kind === "income"), exp = mine.filter(t => t.kind === "expense");
  const thisMonth = ym(today);
  const byCat = kind => cats.filter(c => c.kind === kind && (!c.archived_at || mine.some(t => t.category_id === c.id)))
    .map(c => ({ category: c, amount: sum(mine.filter(t => t.kind === kind && t.category_id === c.id)) }))
    .sort((a, b) => b.amount - a.amount || num(a.category.sort) - num(b.category.sort));
  let months = [];
  if (term) {
    const last = mine.reduce((m, t) => (String(t.happened_on) > m ? String(t.happened_on) : m), "");
    let end = term.status === "current" ? (last > today ? last : today) : term.ends_on;
    if (end > term.ends_on) end = term.ends_on;
    months = monthsBetween(term.starts_on, end).map(m => ({ ym: m, income: sum(inc.filter(t => ym(t.happened_on) === m)), expense: sum(exp.filter(t => ym(t.happened_on) === m)) }));
  }
  const budgets = (x.budgets || []).filter(b => term && b.term_id === term.id);
  const budget = cats.filter(c => c.kind === "expense" && !c.archived_at).map(c => {
    const b = budgets.find(r => r.category_id === c.id);
    return { category: c, budget: b ? num(b.amount_twd) : 0, spent: sum(exp.filter(t => t.category_id === c.id)) };
  });
  return {
    balances, total,
    termIncome: sum(inc), termExpense: sum(exp),
    monthIncome: sum(inc.filter(t => ym(t.happened_on) === thisMonth)), monthExpense: sum(exp.filter(t => ym(t.happened_on) === thisMonth)),
    byCategory: { income: byCat("income"), expense: byCat("expense") },
    months, budget,
    uncategorised: mine.filter(t => t.kind !== "transfer" && !t.category_id).length,
  };
}

// ── 篩選與排序 ──────────────────────────────────────────────────────────
// f = { term, month, kind, account, category, q }，空的就是不限。作廢的照樣列（畫面上變灰），要看乾淨的用 kind 以外的篩選再自己略過。
export function filterTx(rows, f) {
  const o = f || {};
  const q = String(o.q || "").trim().toLowerCase();
  return (rows || []).filter(t =>
    (!o.term || o.term === "all" || t.term_id === o.term)
    && (!o.month || ym(t.happened_on) === o.month)
    && (!o.kind || t.kind === o.kind)
    && (!o.account || t.account_id === o.account || t.to_account_id === o.account)
    && (!o.category || t.category_id === o.category)
    && (!q || String(t.counterparty || "").toLowerCase().includes(q) || String(t.note || "").toLowerCase().includes(q)));
}
// 新的在前：日期，同一天看建立時間（沒有就看 id）。
export function sortTx(rows) {
  return [...(rows || [])].sort((a, b) => String(b.happened_on).localeCompare(String(a.happened_on))
    || String(b.created_at || "").localeCompare(String(a.created_at || "")) || String(b.id).localeCompare(String(a.id)));
}
export function sumBy(rows, kind) { return Math.round((rows || []).filter(t => live(t) && t.kind === kind).reduce((s, t) => s + num(t.amount_twd), 0) * 100) / 100; }

// ── CSV ─────────────────────────────────────────────────────────────────
// 第一個字元是 BOM（﻿），Excel 看到它才用 UTF-8 開，中文才不會變亂碼。列尾 \r\n（Excel 與 Numbers 都認）。
// 有逗號、引號、換行的欄位包雙引號，裡面的引號加倍（RFC 4180）。
export function csvCell(v) {
  if (v == null) return "";
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
const nameOf = x => x ? (lang() === "zh" ? (x.name_zh || x.name_en) : (x.name_en || x.name_zh)) || "" : "";
export function csvOf(rows, ctx) {
  const acc = id => nameOf((ctx.accounts || []).find(a => a.id === id));
  const cat = id => nameOf((ctx.categories || []).find(c => c.id === id));
  const lines = [T("csv.head")];
  for (const t of rows || []) {
    lines.push([
      t.happened_on, T("kind." + t.kind), fmtPlain(t.amount), t.currency || "TWD", t.currency && t.currency !== "TWD" ? fmtPlain(t.fx_rate) : "",
      fmtPlain(t.amount_twd), acc(t.account_id), t.kind === "transfer" ? acc(t.to_account_id) : "", cat(t.category_id),
      t.counterparty || "", t.note || "", t.receipt_path ? T("f.receipt") : "", t.voided_at ? T("f.voided") : "", t.voided_at ? (t.void_reason || "") : "",
    ].map(csvCell).join(","));
  }
  return "﻿" + lines.join("\r\n") + "\r\n";
}
// 數字進 CSV：不加千分位、不加幣別、整數不帶 .00（會計軟體才讀得成數字）。
function fmtPlain(v) { if (v == null || v === "") return ""; const n = Number(v); return Number.isFinite(n) ? String(Math.round(n * 100) / 100) : String(v); }
export function csvFilename(f) { return `bt-finance-${(f && f.month) || (f && f.term && f.term !== "all" ? f.term : "all")}.csv`; }

// ── 圖：自己畫的 SVG ─────────────────────────────────────────────────────
// 沒有圖表函式庫（repo 不從 CDN 載東西，GSAP 是唯一例外）。每個月兩根：收入深藍、支出橘。最高那根頂到 CHART_H，其他照比例。
// 每個月一個 <title>，滑過去看得到數字；整張圖 role="img" 加 aria-label。
export const CHART_H = 120;
const MON_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function monthLabel(m) { const n = Number(String(m).slice(5, 7)); return T("chart.month", { m: n, mon: MON_EN[n - 1] || "" }); }
export function monthsChartSVG(months) {
  const rows = months || [];
  const max = rows.reduce((m, r) => Math.max(m, num(r.income), num(r.expense)), 0);
  if (!rows.length || max <= 0) return `<div class="empty sm">${esc(T("ov.noNumbers"))}</div>`;
  const slot = 44, bw = 16, gap = 4, padL = 8, padB = 22, padT = 6;
  const W = padL * 2 + rows.length * slot, H = padT + CHART_H + padB;
  const h = v => Math.round(CHART_H * num(v) / max * 100) / 100;
  const bars = rows.map((r, i) => {
    const x = padL + i * slot + (slot - bw * 2 - gap) / 2;
    const hi = h(r.income), ho = h(r.expense);
    return `<g><title>${esc(T("chart.title", { ym: r.ym, in: fmtMoney(r.income), out: fmtMoney(r.expense) }))}</title>` +
      `<rect class="in" x="${x}" y="${padT + CHART_H - hi}" width="${bw}" height="${hi}" rx="2"/>` +
      `<rect class="out" x="${x + bw + gap}" y="${padT + CHART_H - ho}" width="${bw}" height="${ho}" rx="2"/>` +
      `<text x="${padL + i * slot + slot / 2}" y="${H - 6}" text-anchor="middle">${esc(monthLabel(r.ym))}</text></g>`;
  }).join("");
  return `<svg class="fin-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(T("chart.aria"))}" preserveAspectRatio="xMinYMid meet">` +
    `<line class="axis" x1="${padL}" y1="${padT + CHART_H + 0.5}" x2="${W - padL}" y2="${padT + CHART_H + 0.5}"/>${bars}</svg>` +
    `<div class="fin-legend mini"><span><i class="in"></i>${esc(T("ov.in"))}</span><span><i class="out"></i>${esc(T("ov.out"))}</span></div>`;
}
// 類別長條：最大的那一條 100%，其他照比例。items = [{ category, amount }]。
export function catBarsHTML(items) {
  const rows = items || [];
  const max = rows.reduce((m, r) => Math.max(m, num(r.amount)), 0);
  if (!rows.length) return `<div class="empty sm">${esc(T("ov.noNumbers"))}</div>`;
  return rows.map(r => {
    const pct = max > 0 ? Math.round(num(r.amount) / max * 10000) / 100 : 0;
    return `<div class="fbar" data-id="${esc(r.category.id)}"><span class="fbar-l">${esc(nameOf(r.category))}</span><span class="fbar-t"><i style="width:${pct}%"></i></span><span class="fbar-n">${esc(fmtMoney(r.amount))}</span></div>`;
  }).join("");
}
// 預算條：花掉 ÷ 預算，超過 100% 整條變橘的（class over）。沒填預算的那一列只印花掉多少。
export function budgetBarsHTML(items) {
  const rows = items || [];
  if (!rows.length) return `<div class="empty sm">${esc(T("bu.noCats"))}</div>`;
  return rows.map(r => {
    const b = num(r.budget), s = num(r.spent);
    const pct = b > 0 ? Math.min(100, Math.round(s / b * 10000) / 100) : 0;
    const over = b > 0 && s > b;
    return `<div class="fbar${over ? " over" : ""}" data-id="${esc(r.category.id)}"><span class="fbar-l">${esc(nameOf(r.category))}</span><span class="fbar-t"><i style="width:${pct}%"></i></span><span class="fbar-n">${
      b > 0 ? `${esc(fmtMoney(s))} / ${esc(fmtMoney(b))}` : `${esc(fmtMoney(s))} <span class="mini">${esc(T("bu.none"))}</span>`}</span></div>`;
  }).join("");
}

// ── 收據 ────────────────────────────────────────────────────────────────
// 路徑 <筆的 id>/<時間>-<亂數>.<副檔名>，刻意不用原檔名（原檔名可能有人名或金額）。只收圖與 PDF、5 MB 以內（bucket 也擋，這裡先講）。
const EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" };
export const RECEIPT_MAX = 5 * 1024 * 1024;
export function receiptOk(file) {
  if (!file || !EXT[String(file.type || "").toLowerCase()]) return T("err.badFile");
  if (num(file.size) > RECEIPT_MAX) return T("err.bigFile");
  return "";
}
export function receiptPath(txId, filename, now, rand) {
  const m = String(filename || "").toLowerCase().match(/\.([a-z0-9]+)$/);
  let ext = m ? m[1] : "bin";
  if (ext === "jpeg") ext = "jpg";
  return `${txId}/${now || Date.now()}-${rand || Math.random().toString(36).slice(2, 8)}.${ext}`;
}

// ── 畫面 ────────────────────────────────────────────────────────────────
const kpi = (n, label, hint, cls) => `<div class="kpi${cls ? " " + cls : ""}"><div class="kpi-n">${esc(n)}</div><div class="kpi-l">${esc(label)}</div>${hint ? `<div class="kpi-h">${hint}</div>` : ""}</div>`;
const termSelect = (act, terms, sel, all) => `<select data-act="${esc(act)}" aria-label="${esc(T("ov.term"))}">${all ? `<option value="all"${sel === "all" ? " selected" : ""}>${esc(T("tx.allTerms"))}</option>` : ""}${
  (terms || []).map(t => `<option value="${esc(t.id)}"${t.id === sel ? " selected" : ""}>${esc(t.id)}</option>`).join("")}</select>`;
const opt = (v, label, sel) => `<option value="${esc(v)}"${String(v) === String(sel == null ? "" : sel) ? " selected" : ""}>${esc(label)}</option>`;

// 總覽：標題數字是現在全部的錢；每個帳戶一張；這一屆與這個月的收入支出；支出與收入照類別；每月長條圖；預算條。
export function overviewHTML(o, ctx, me, msg) {
  const term = ctx.term;
  const head = pageHead(T("ov.title"), T("ov.lede"), []);
  if (!o.balances.length && !(ctx.accounts || []).length) {
    return head + msgHTML(msg) + emptyHTML(T("ov.noAccounts"), esc(T("ov.noAccountsHint")), canEditFin(me) ? { act: "go-accounts", label: T("ov.goAccounts") } : null);
  }
  const net = Math.round((o.termIncome - o.termExpense) * 100) / 100;
  return head + msgHTML(msg)
    + (o.uncategorised ? `<div class="msg err" role="status"><span class="msg-k">${T("msg.err")}</span><span>${T("ov.uncat", { n: o.uncategorised })}</span></div>` : "")
    + `<div class="fin-total kpi"><div class="kpi-n">${esc(fmtMoney(o.total))}</div><div class="kpi-l">${esc(T("ov.total"))}</div><div class="kpi-h">${esc(T("ov.totalHint"))}</div></div>`
    + sectionHTML(T("ov.accounts"), `<div class="todo fin-accs">${o.balances.map(b => kpi(fmtMoney(b.balance), nameOf(b.account), esc(T("acc.kind." + b.account.kind)) + (b.account.currency && b.account.currency !== "TWD" ? " · " + esc(b.account.currency) : ""))).join("")}</div>`)
    + sectionHTML(`${esc(term ? term.id : "")}`, `<div class="row" style="margin:0 0 12px">${termSelect("ov-term", ctx.terms, term ? term.id : "", false)}</div>
      <div class="todo fin-four">${kpi(fmtMoney(o.termIncome), T("ov.termIncome"))}${kpi(fmtMoney(o.termExpense), T("ov.termExpense"))}${kpi(fmtMoney(net), T("ov.net"), "", net < 0 ? "neg" : "")}${kpi(fmtMoney(o.monthIncome) + " / " + fmtMoney(o.monthExpense), T("ov.monthIncome") + " / " + T("ov.monthExpense"))}</div>`)
    + sectionHTML(T("ov.months"), `<div class="fin-chart-box">${monthsChartSVG(o.months)}</div>`)
    + `<div class="cols">${sectionHTML(T("ov.byExpense"), catBarsHTML(o.byCategory.expense))}${sectionHTML(T("ov.byIncome"), catBarsHTML(o.byCategory.income))}</div>`
    + sectionHTML(T("ov.budget"), budgetBarsHTML(o.budget), canEditFin(me) ? { actions: [{ act: "go-budget", label: T("bu.title") }] } : {});
}

// 收支。rows 已經篩好排好；f 是篩選；draft 是「新的一筆」表單的值（null 就沒開）；up 是 { <id>: 上傳狀態字串 }。
const txFields = (t, ctx, prefix) => {
  const accs = (ctx.accounts || []).filter(a => !a.archived_at || a.id === t.account_id || a.id === t.to_account_id);
  const cats = (ctx.categories || []).filter(c => c.kind === t.kind && (!c.archived_at || c.id === t.category_id));
  const isT = t.kind === "transfer", nonTwd = (t.currency || "TWD") !== "TWD";
  return `<label><i>${T("f.date")}</i><input type="date" name="happened_on" value="${esc(t.happened_on || "")}" required></label>
    <label><i>${T("f.kind")}</i><select name="kind">${["income", "expense", "transfer"].map(k => opt(k, T("kind." + k), t.kind)).join("")}</select></label>
    <label><i>${T("f.amount")}</i><input type="number" name="amount" inputmode="decimal" min="0.01" step="0.01" value="${esc(t.amount == null ? "" : t.amount)}" required></label>
    <label><i>${T("f.currency")}</i><select name="currency">${CURRENCIES.map(c => opt(c, c, t.currency || "TWD")).join("")}</select></label>
    <label class="fx"${nonTwd ? "" : " hidden"}><i>${T("f.rate")}</i><input type="number" name="fx_rate" inputmode="decimal" min="0.0001" step="0.0001" value="${esc(t.fx_rate == null ? "" : t.fx_rate)}"${nonTwd ? " required" : ""} placeholder="32.1"><span class="mini">${esc(T("f.rateHint"))}</span></label>
    <label><i>${isT ? T("f.account") + " →" : T("f.account")}</i><select name="account_id">${opt("", T("f.pickCategory").replace(T("f.category"), T("f.account")), t.account_id)}${accs.map(a => opt(a.id, nameOf(a), t.account_id)).join("")}</select></label>
    <label class="to"${isT ? "" : " hidden"}><i>${T("f.toAccount")}</i><select name="to_account_id">${opt("", T("f.none"), t.to_account_id)}${accs.map(a => opt(a.id, nameOf(a), t.to_account_id)).join("")}</select></label>
    <label class="cat"${isT ? " hidden" : ""}><i>${T("f.category")}</i><select name="category_id" data-kind="${esc(t.kind)}">${opt("", T("f.pickCategory"), t.category_id)}${cats.map(c => opt(c.id, nameOf(c), t.category_id)).join("")}</select></label>
    <label><i>${T("f.counterparty")}</i><input name="counterparty" value="${esc(t.counterparty || "")}" placeholder="${esc(T("f.counterpartyPh"))}" maxlength="120"></label>
    <label class="wide"><i>${T("f.note")}</i><input name="note" value="${esc(t.note || "")}" maxlength="500"></label>`;
};
// 既有的一筆改了種類或幣別（2026-10-28）：自動存不重畫整頁（人可能還在打字），
// 所以這裡就地把轉入帳戶、匯率、類別那幾格顯示或藏掉，類別的選項換成新種類的。
// 不這樣做，改成「轉帳」之後轉入帳戶那一格藏著，永遠填不了、永遠存不進去。
export function syncTxShape(box, ctx) {
  if (!box || !box.querySelector) return;
  const kind = (box.querySelector('[name="kind"]') || {}).value, cur = (box.querySelector('[name="currency"]') || {}).value || "TWD";
  const isT = kind === "transfer", show = (sel, on) => { const el = box.querySelector(sel); if (el) el.hidden = !on; };
  show("label.fx", cur !== "TWD"); show("label.to", isT); show("label.cat", !isT);
  const fx = box.querySelector('[name="fx_rate"]'); if (fx) fx.required = cur !== "TWD";
  const cat = box.querySelector('[name="category_id"]');
  if (cat && cat.dataset.kind !== kind) {
    const was = cat.value, cats = ((ctx && ctx.categories) || []).filter(c => c.kind === kind && !c.archived_at);
    const keep = cats.some(c => c.id === was) ? was : "";
    cat.innerHTML = opt("", T("f.pickCategory"), keep) + cats.map(c => opt(c.id, nameOf(c), keep)).join("");
    cat.dataset.kind = kind;
  }
}
export function txFiltersHTML(f, ctx, n, rows) {
  const term = f.term || "all";
  const t = (ctx.terms || []).find(x => x.id === term);
  const months = t ? monthsBetween(t.starts_on, t.status === "current" ? (ctx.today || todayStr()) : t.ends_on).reverse() : [];
  return `<div class="fin-filters" role="group" aria-label="${esc(T("tx.filter"))}">
    ${termSelect("f-term", ctx.terms, term, true)}
    <select data-act="f-month" aria-label="${esc(T("f.date"))}">${opt("", T("tx.allMonths"), f.month)}${months.map(m => opt(m, m, f.month)).join("")}</select>
    <select data-act="f-kind" aria-label="${esc(T("f.kind"))}">${opt("", T("tx.all") + " " + T("f.kind"), f.kind)}${["income", "expense", "transfer"].map(k => opt(k, T("kind." + k), f.kind)).join("")}</select>
    <select data-act="f-account" aria-label="${esc(T("f.account"))}">${opt("", T("tx.all") + " " + T("f.account"), f.account)}${(ctx.accounts || []).map(a => opt(a.id, nameOf(a), f.account)).join("")}</select>
    <select data-act="f-category" aria-label="${esc(T("f.category"))}">${opt("", T("tx.all") + " " + T("f.category"), f.category)}${(ctx.categories || []).filter(c => !c.archived_at).map(c => opt(c.id, `${T("kind." + c.kind)}${T("punct.colon")}${nameOf(c)}`, f.category)).join("")}</select>
    <input id="f-q" type="search" value="${esc(f.q || "")}" placeholder="${esc(T("tx.q"))}" aria-label="${esc(T("tx.q"))}" autocomplete="off">
    <span class="mini fin-count">${esc(T("tx.count", { n }))}・${esc(T("tx.sum", { in: fmtMoney(sumBy(rows, "income")), out: fmtMoney(sumBy(rows, "expense")) }))}</span>
  </div>`;
}
export function txPageHTML(rows, ctx, f, me, msg, busy, draft, up) {
  const edit = canEditFin(me);
  const acc = id => nameOf((ctx.accounts || []).find(a => a.id === id)) || T("f.none");
  const cat = id => nameOf((ctx.categories || []).find(c => c.id === id));
  const dis = busy ? " disabled" : "";
  const u = up || {};
  const head = pageHead(T("tx.title"), T("tx.lede"), edit && !draft ? [{ act: "tx-new", label: T("tx.new"), primary: true }] : []);
  const newForm = edit && draft ? `<div class="card inline-form fin-new"><h2>${esc(T("tx.newTitle"))}</h2><div class="fin-grid" data-txform="new">${txFields(draft, ctx)}</div>
      <div class="form-foot"><button class="btn" data-act="tx-add"${dis}>${busy ? T("common.saving") : T("tx.add")}</button><button class="btn ghost" data-act="tx-cancel"${dis}>${T("tx.cancel")}</button><span class="sp"></span><span class="mini">${esc(T("tx.zeczec"))}</span></div></div>` : "";
  const row = t => {
    const voided = !!t.voided_at;
    const sign = t.kind === "income" ? "+" : t.kind === "expense" ? "−" : "";
    const amountCell = `<b class="${t.kind}">${sign}${esc(fmtMoney(t.amount_twd))}</b>${(t.currency || "TWD") !== "TWD" ? `<span class="mini"> ${esc(fmtMoney(t.amount, t.currency))} × ${esc(fmtPlain(t.fx_rate))}</span>` : ""}`;
    const receipt = t.receipt_path
      ? `<button type="button" class="lnk" data-act="receipt-view" data-id="${esc(t.id)}" data-path="${esc(t.receipt_path)}">${T("tx.receiptView")}</button>${edit && !voided ? ` <button type="button" class="lnk" data-act="receipt-remove" data-id="${esc(t.id)}">${T("tx.receiptGone")}</button>` : ""}`
      : (edit && !voided ? (u[t.id] ? `<span class="mini">${esc(u[t.id])}</span>` : `<label class="lnk up"><input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" data-act="receipt-file" data-id="${esc(t.id)}" data-noauto="1" hidden>${T("tx.receiptUp")}</label>`) : `<span class="mini">${esc(T("f.none"))}</span>`);
    const summary = `<td class="t-main"><b>${esc(t.happened_on)}</b> <span class="tag ${t.kind}">${T("kind." + t.kind)}</span>${voided ? ` <span class="tag warn">${T("tx.voidedTag")}</span>` : ""}
        <div class="fmeta">${esc(acc(t.account_id))}${t.kind === "transfer" ? ` → ${esc(acc(t.to_account_id))}` : (t.category_id ? `・${esc(cat(t.category_id))}` : `・<span class="warn">${esc(T("f.pickCategory"))}</span>`)}${t.counterparty ? `・${esc(t.counterparty)}` : ""}${t.note ? `<div class="mini">${esc(t.note)}</div>` : ""}${voided ? `<div class="mini">${esc(T("f.voidReason"))}${T("punct.colon")}${esc(t.void_reason || "")}</div>` : ""}</div></td>
      <td class="t-amt">${amountCell}</td>
      <td class="t-rcpt">${receipt}</td>
      <td class="t-act">${edit && !voided ? `<button type="button" class="lnk" data-act="tx-edit" data-id="${esc(t.id)}"${dis}>${T("common.edit")}</button> <button type="button" class="lnk" data-act="tx-void" data-id="${esc(t.id)}"${dis}>${T("tx.void")}</button>` : ""}</td>`;
    const open = edit && !voided && ctx.open === t.id;
    const editor = open ? `<tr class="tx-editor"><td colspan="4"><div class="fin-grid" data-autosave="tx-save" data-id="${esc(t.id)}">${txFields(t, ctx)}<div class="wide row">${autosaveHint("tx-save")}<span class="sp"></span><button type="button" class="lnk" data-act="tx-close">${T("common.cancel")}</button></div></div></td></tr>` : "";
    // 作廢：原地長出一行，要寫原因才能按確定（資料庫也擋空的原因）。
    const voiding = edit && !voided && ctx.voiding === t.id;
    const voidRow = voiding ? `<tr class="tx-editor void-ask"><td colspan="4"><div class="ask"><span class="ask-t">${esc(T("tx.voidAsk"))}</span><input id="void-reason" maxlength="200" placeholder="${esc(T("tx.voidReasonPh"))}" autocomplete="off"><button type="button" class="btn danger sm" data-act="tx-void-go" data-id="${esc(t.id)}"${dis}>${T("ask.yes")}</button><button type="button" class="btn ghost sm" data-act="tx-void-cancel">${T("common.cancel")}</button></div></td></tr>` : "";
    return `<tr class="tx${voided ? " void" : ""}${open ? " open" : ""}" data-id="${esc(t.id)}">${summary}</tr>${editor}${voidRow}`;
  };
  const table = rows.length
    ? `<table class="table fin-tx"><thead><tr><th>${T("f.date")}</th><th>${T("f.twd")}</th><th>${T("f.receipt")}</th><th></th></tr></thead><tbody>${rows.map(row).join("")}</tbody></table>`
    : emptyHTML(T("tx.none"), esc(T("tx.noneHint")), edit && !draft ? { act: "tx-new", label: T("tx.new") } : null);
  return head + msgHTML(msg) + (edit ? "" : `<div class="note">${T("readonly")}</div>`) + newForm + txFiltersHTML(f, ctx, rows.length, rows) + table;
}

// 帳戶與類別。accDraft / catDraft 是新增表單的值（null 沒開）。
export function accountsHTML(accounts, categories, o, me, msg, busy, accDraft, catDraft) {
  const edit = canEditFin(me);
  const dis = busy ? " disabled" : "";
  const bal = id => { const b = (o && o.balances || []).find(x => x.account.id === id); return b ? fmtMoney(b.balance) : ""; };
  const accRow = a => {
    const off = !!a.archived_at;
    const fields = edit && !off ? `<div class="fin-grid acc" data-autosave="acc-save" data-id="${esc(a.id)}">
        <label><i>${T("acc.nameZh")}</i><input name="name_zh" value="${esc(a.name_zh || "")}" maxlength="60"></label>
        <label><i>${T("acc.nameEn")}</i><input name="name_en" value="${esc(a.name_en || "")}" maxlength="60"></label>
        <label><i>${T("acc.kind")}</i><select name="kind">${["bank", "cash", "platform"].map(k => opt(k, T("acc.kind." + k), a.kind)).join("")}</select></label>
        <label><i>${T("acc.opening")}</i><input type="number" name="opening_balance" inputmode="decimal" step="0.01" value="${esc(a.opening_balance == null ? "" : a.opening_balance)}"></label>
        <label><i>${T("acc.openingOn")}</i><input type="date" name="opening_on" value="${esc(a.opening_on || "")}"></label>
        <div class="row">${autosaveHint("acc-save")}<span class="sp"></span><button type="button" class="lnk" data-act="acc-archive" data-id="${esc(a.id)}" data-name="${esc(nameOf(a))}"${dis}>${T("acc.archive")}</button></div></div>`
      : `<div class="fmeta">${esc(T("acc.kind." + a.kind))}・${esc(T("acc.opening"))} ${esc(fmtMoney(a.opening_balance))}（${esc(a.opening_on || "")}）${off ? ` <span class="tag draft">${T("acc.archived")}</span>${edit ? ` <button type="button" class="lnk" data-act="acc-unarchive" data-id="${esc(a.id)}" data-name="${esc(nameOf(a))}"${dis}>${T("acc.unarchive")}</button>` : ""}` : ""}</div>`;
    return `<li class="${off ? "off" : ""}"><div class="fhead"><b>${esc(nameOf(a))}</b>${a.name_zh && a.name_en ? `<span class="alt">${esc(lang() === "zh" ? a.name_en : a.name_zh)}</span>` : ""}<span class="sp"></span><span class="count">${off ? "" : esc(bal(a.id))}</span></div>${fields}</li>`;
  };
  const newAcc = edit && accDraft ? `<div class="card inline-form"><h2>${esc(T("acc.new"))}</h2><div class="fin-grid acc" data-accform="new">
      <label><i>${T("acc.nameZh")}</i><input name="name_zh" value="${esc(accDraft.name_zh || "")}" maxlength="60"></label>
      <label><i>${T("acc.nameEn")}</i><input name="name_en" value="${esc(accDraft.name_en || "")}" maxlength="60"></label>
      <label><i>${T("acc.kind")}</i><select name="kind">${["bank", "cash", "platform"].map(k => opt(k, T("acc.kind." + k), accDraft.kind || "bank")).join("")}</select></label>
      <label><i>${T("acc.opening")}</i><input type="number" name="opening_balance" inputmode="decimal" step="0.01" value="${esc(accDraft.opening_balance == null ? "" : accDraft.opening_balance)}" required></label>
      <label><i>${T("acc.openingOn")}</i><input type="date" name="opening_on" value="${esc(accDraft.opening_on || "")}" required></label></div>
      <div class="form-foot"><button class="btn" data-act="acc-add"${dis}>${busy ? T("common.saving") : T("acc.add")}</button><button class="btn ghost" data-act="acc-cancel"${dis}>${T("common.cancel")}</button></div></div>` : "";
  const accList = (accounts || []).length ? `<ul class="flist fin-accs-list">${[...accounts].sort((a, b) => (a.archived_at ? 1 : 0) - (b.archived_at ? 1 : 0) || num(a.sort) - num(b.sort)).map(accRow).join("")}</ul>`
    : emptyHTML(T("acc.none"), esc(T("acc.noneHint")), edit && !accDraft ? { act: "acc-new", label: T("acc.new") } : null);
  const catRow = c => {
    const off = !!c.archived_at;
    return `<li class="${off ? "off" : ""}">${edit && !off
      ? `<div class="fin-grid cat" data-autosave="cat-save" data-id="${esc(c.id)}"><label><i>${T("acc.nameZh")}</i><input name="name_zh" value="${esc(c.name_zh || "")}" maxlength="60"></label><label><i>${T("acc.nameEn")}</i><input name="name_en" value="${esc(c.name_en || "")}" maxlength="60"></label><div class="row">${autosaveHint("cat-save")}<span class="sp"></span><button type="button" class="lnk" data-act="cat-archive" data-id="${esc(c.id)}" data-name="${esc(nameOf(c))}"${dis}>${T("acc.archive")}</button></div></div>`
      : `<div class="fhead"><b>${esc(nameOf(c))}</b>${off ? ` <span class="tag draft">${T("acc.archived")}</span>${edit ? ` <button type="button" class="lnk" data-act="cat-unarchive" data-id="${esc(c.id)}" data-name="${esc(nameOf(c))}"${dis}>${T("acc.unarchive")}</button>` : ""}` : ""}</div>`}</li>`;
  };
  const catsOf = kind => [...(categories || []).filter(c => c.kind === kind)].sort((a, b) => (a.archived_at ? 1 : 0) - (b.archived_at ? 1 : 0) || num(a.sort) - num(b.sort));
  const newCat = edit && catDraft ? `<div class="card inline-form"><h2>${esc(T("cat.new"))}</h2><div class="fin-grid cat" data-catform="new">
      <label><i>${T("f.kind")}</i><select name="kind">${["income", "expense"].map(k => opt(k, T("kind." + k), catDraft.kind || "expense")).join("")}</select></label>
      <label><i>${T("acc.nameZh")}</i><input name="name_zh" value="${esc(catDraft.name_zh || "")}" maxlength="60"></label>
      <label><i>${T("acc.nameEn")}</i><input name="name_en" value="${esc(catDraft.name_en || "")}" maxlength="60"></label></div>
      <div class="form-foot"><button class="btn" data-act="cat-add"${dis}>${busy ? T("common.saving") : T("acc.add")}</button><button class="btn ghost" data-act="cat-cancel"${dis}>${T("common.cancel")}</button></div></div>` : "";
  return pageHead(T("acc.title"), T("acc.lede"), []) + msgHTML(msg) + (edit ? "" : `<div class="note">${T("readonly")}</div>`)
    + sectionHTML(T("acc.section"), newAcc + accList, edit && !accDraft ? { actions: [{ act: "acc-new", label: T("acc.new") }] } : {})
    + sectionHTML(T("cat.section"), newCat + `<div class="cols"><div><h3 class="fin-h3">${T("cat.income")}</h3><ul class="flist fin-cats">${catsOf("income").map(catRow).join("")}</ul></div><div><h3 class="fin-h3">${T("cat.expense")}</h3><ul class="flist fin-cats">${catsOf("expense").map(catRow).join("")}</ul></div></div>`,
        edit && !catDraft ? { actions: [{ act: "cat-new", label: T("cat.new") }] } : {});
}

// 預算：每一個支出類別一列，這一屆的預算一格（改了就存），旁邊花掉多少與進度條。
export function budgetHTML(o, ctx, me, msg, busy) {
  const edit = canEditFin(me);
  const term = ctx.term;
  const rows = (o && o.budget) || [];
  const body = rows.length ? `<ul class="flist fin-budget">${rows.map(r => `<li><div class="fhead"><b>${esc(nameOf(r.category))}</b><span class="sp"></span><span class="mini">${esc(T("bu.spent"))} ${esc(fmtMoney(r.spent))}</span></div>
      ${edit ? `<div class="fin-grid bu" data-autosave="budget-save" data-id="${esc(r.category.id)}" data-term="${esc(term ? term.id : "")}"><label><i>${T("bu.amount")}</i><input type="number" name="amount_twd" inputmode="numeric" min="0" step="1" value="${esc(r.budget ? r.budget : "")}" placeholder="0"></label>${autosaveHint("budget-save")}</div>` : ""}
      ${budgetBarsHTML([r])}</li>`).join("")}</ul>` : emptyHTML(T("bu.noCats"), esc(T("bu.noCatsHint")), null);
  return pageHead(T("bu.title"), T("bu.lede"), []) + msgHTML(msg) + (edit ? "" : `<div class="note">${T("readonly")}</div>`)
    + `<div class="row" style="margin:0 0 12px">${termSelect("ov-term", ctx.terms, term ? term.id : "", false)}</div>` + body;
}

// 匯出：現在的篩選會匯出幾筆，一顆下載。
export function exportHTML(f, ctx, n, msg) {
  const term = f.term || "all";
  const t = (ctx.terms || []).find(x => x.id === term);
  const months = t ? monthsBetween(t.starts_on, t.status === "current" ? (ctx.today || todayStr()) : t.ends_on).reverse() : [];
  return pageHead(T("ex.title"), T("ex.lede"), [{ act: "csv-download", label: T("ex.download"), primary: true, disabled: !n }]) + msgHTML(msg)
    + sectionHTML(T("ex.scope"), `<div class="fin-filters">${termSelect("f-term", ctx.terms, term, true)}<select data-act="f-month" aria-label="${esc(T("f.date"))}">${opt("", T("tx.allMonths"), f.month)}${months.map(m => opt(m, m, f.month)).join("")}</select></div>
      <p class="count">${esc(T("ex.n", { n }))}</p><div class="note">${esc(T("ex.tip"))}</div>`);
}
