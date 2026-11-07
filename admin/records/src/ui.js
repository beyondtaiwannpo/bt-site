// 後台「紀錄」那一組的畫面（2026-12-01，BT Records）：活動記分卡、回饋表、人、年度比較。
// 前半段（側欄、外殼、回饋、自動儲存、成員區）2026-12-01 從 admin/team-forms/src/ui.js 原樣抄過來，八份一模一樣（test/admin-hub.test.mjs 逐字比對）。
// **esc 是自己的一份**，不從別的資料夾 import。
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
  // 2026-11-26 Marketing：Instagram 連線（之後加成效與大學介紹貼文）。Marketing 資源工作區或行銷需求單工作區裡的人，任何等級（Paul 2026-10-29）。
  { key: "marketing", label: { zh: "Marketing", en: "Marketing" },  href: "/admin/marketing/", who: "ws:res:Marketing Team|custom:marketing-requests|custom:marketing-approve", hint: { zh: "大學介紹貼文、Instagram", en: "College intro posts, Instagram" } },
  // 2026-11-29 內部表單：每一位幹部都進得來（要填的表單在這裡）；建表單與看結果那一頁看 my_access() 的 team-forms 那一格。
  { key: "teamforms", label: { zh: "內部表單", en: "Team forms" },   href: "/admin/team-forms/", who: "cadre",      hint: { zh: "給幹部填的表單、結果", en: "Forms for members, and results" } },
  // 2026-12-01 BT Records：人、活動、出席、回饋、配對、去向收成一個資料集。who 是 "ws:records"：my_access() 的 records 那一格，
  // 管的人（custom:records 工作區）是 edit，Senior Adviser 與任何一場活動工作區「改」以上的人是 view（2026-12-01-records.sql）。
  { key: "records",   label: { zh: "紀錄",     en: "Records" },      href: "/admin/records/",   who: "ws:records",   hint: { zh: "活動記分卡、人的時間軸、回饋表、去向", en: "Event scorecards, people, feedback forms, outcomes" } },
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
  // 2026-11-29 內部表單：每一位幹部都看得到「要填的表單」；「建表單與看結果」要建得了，或是某一份的讀者（門在資料庫 tf_*）。
  { group: "teamforms", key: "fill",     sec: "tforms",   label: { zh: "要填的表單", en: "Forms to fill in" }, hint: { zh: "發給你的表單、你填過的", en: "Forms sent to you, your answers" }, who: "cadre" },
  { group: "teamforms", key: "build",    sec: "tforms",   label: { zh: "建表單與看結果", en: "Build & results" }, hint: { zh: "題目、發給誰、誰看得到", en: "Questions, recipients, readers" }, who: "ws:team-forms" },
  // 2026-12-01 BT Records：四頁都看 my_access() 的 records 那一格；每一頁裡能改什麼由資料庫的 rc_ 函式決定。
  { group: "records",   key: "overview", sec: "rec",      label: { zh: "活動記分卡", en: "Event scorecards" }, hint: { zh: "每一場四個數字、下一次改什麼", en: "Four numbers per event, what to change next" }, who: "ws:records" },
  { group: "records",   key: "forms",    sec: "rec",      label: { zh: "回饋表",     en: "Feedback forms" },   hint: { zh: "活動後、校友年度、配對回饋", en: "Post-event, alumni yearly, pair check-ins" }, who: "ws:records" },
  { group: "records",   key: "people",   sec: "rec",      label: { zh: "人",         en: "People" },           hint: { zh: "一個人的時間軸、重複的人、去向", en: "One person over time, duplicates, outcomes" }, who: "ws:records" },
  { group: "records",   key: "yearly",   sec: "rec",      label: { zh: "年度比較",   en: "Year by year" },     hint: { zh: "每一屆每一種活動一列", en: "One row per term and event kind" }, who: "ws:records" },
  { group: "forms",     key: "meetings", sec: "meet",     label: { zh: "會議",     en: "Meetings" },          hint: { zh: "排過的會、會議紀錄", en: "Scheduled meetings and notes" }, who: "cadre" },
  // 2026-11-01 活動上架：每一位幹部看得到活動清單（自己 team 的），開活動要 team 的 Director 或 senior（門在資料庫）。
  { group: "forms",     key: "events",   sec: "meet",     label: { zh: "活動",     en: "Events" },            hint: { zh: "上到對外首頁的活動", en: "Events on the public site" }, who: "cadre" },
  // 2026-10-31 行銷需求單：每一位幹部都能送；佇列只有 Marketing 需求工作區裡的人（與靠職級的兩級）看得到。
  { group: "forms",     key: "request",  sec: "mkt",      label: { zh: "請 Marketing 做貼文或影片", en: "Ask Marketing for a post or video" }, hint: { zh: "送一張需求單", en: "Send a request" }, who: "cadre" },
  { group: "forms",     key: "requests", sec: "mkt",      label: { zh: "Marketing 的待辦", en: "Marketing's queue" }, hint: { zh: "大家送來的需求單", en: "Requests sent to Marketing" }, who: "ws:custom:marketing-requests" },
  // 2026-11-26 Instagram：Marketing 的人看連線狀態與粉絲數；「再檢查一次」要 Marketing 資源工作區「管」或 senior（門在資料庫）。
  // 2026-11-27 大學介紹貼文：Marketing 的人做、勾來源；核可的人（custom:marketing-approve）核可。門在資料庫（mkt_can_edit／mkt_can_approve）。
  { group: "marketing", key: "posts",    sec: "mkt",      label: { zh: "大學介紹貼文", en: "College intro posts" }, hint: { zh: "做、審、下載給 Canva", en: "Build, approve, download for Canva" }, who: "ws:res:Marketing Team|custom:marketing-requests|custom:marketing-approve" },
  { group: "marketing", key: "ig",       sec: "mkt",      label: { zh: "Instagram", en: "Instagram" },       hint: { zh: "帳號連線、粉絲數", en: "Account connection, followers" }, who: "ws:res:Marketing Team|custom:marketing-requests|custom:marketing-approve" },
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
  { key: "tforms", label: { zh: "內部表單",   en: "Team forms" },        icon: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4h6v3H9zM9 12l2 2 4-4M9 17h6"/>' },
  { key: "rec",    label: { zh: "紀錄",       en: "Records" },           icon: '<path d="M4 20V4M4 20h16M8 16v-5M12 16V8M16 16v-3M20 16V6"/>' },
  { key: "meet",   label: { zh: "會議與活動", en: "Meetings & events" }, icon: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>' },
  { key: "mkt",    label: { zh: "行銷",       en: "Marketing" },         icon: '<path d="M3 11v2a1 1 0 0 0 1 1h3l5 4V6L7 10H4a1 1 0 0 0-1 1z"/><path d="M16 9a4 4 0 0 1 0 6"/>' },
  { key: "apply",  label: { zh: "申請",       en: "Applications" },      icon: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h4"/>' },
  { key: "pass",   label: { zh: "護照",       en: "Passports" },         icon: '<rect x="5" y="3" width="14" height="18" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M9 17h6"/>' },
  { key: "web",    label: { zh: "對外網站",   en: "Website" },           icon: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>', note: "rail.foot" },
  { key: "people", label: { zh: "人",         en: "People" },            icon: '<circle cx="9" cy="8" r="3"/><path d="M3 20a6 6 0 0 1 12 0"/><circle cx="17" cy="9" r="2.5"/><path d="M15 20a5 5 0 0 1 6-4.6"/>' },
  { key: "money",  label: { zh: "錢",         en: "Money" },             icon: '<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M7 12h.01M17 12h.01"/>' },
];
const WHY = { president: "why.president", senior: "why.senior", "ws:passport|intern-passport": "why.passports", "ws:finance": "why.finance", "ws:res:Marketing Team|custom:marketing-requests|custom:marketing-approve": "why.marketing", "ws:records": "why.records" };
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
  if (id === "finance") return "/admin/finance/#overview";
  if (id === "custom:team-forms") return "/admin/team-forms/#build";
  if (id === "records" || id === "custom:records") return "/admin/records/#overview";
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
// 進不了這一組的人看到的一頁（跟每一組自己的 noAccessHTML 一樣，字各自寫）。
export function noAccessHTML() {
  return pageHead(T("noAccess.title"), T("noAccess.lede"), []);
}
// ═══════════════════════════════════════════════════════════════════════
// BT Records（2026-12-01）。Paul 2026-11-06：「a data set ... for alumni, people, and also events feedback ...
// is there a way to systematically improve our work through tracking old data」，2026-11-07：「build the thing first」。
// 資料庫那一半在 supabase/migrations/2026-12-01-records.sql，門在那裡每一支函式的第一句。
// 這一半：純函式（記分卡怎麼算、結果怎麼統計、名單怎麼算）加畫面。**少畫一顆按鈕不是安全機制。**
// ═══════════════════════════════════════════════════════════════════════

export const TYPES = ["short", "long", "single", "multi", "scale"];
export const RANKS = ["president", "senior_adviser", "director", "adviser", "member"];
export const ROLES = ["reader", "editor"];
export const EKINDS = ["bootcamp", "workshop", "roundtable", "meetup", "clinic", "info-session", "mentorship-term", "fair", "other"];
export const FKINDS = ["post-event", "alumni-yearly", "pair-mentee", "pair-mentor", "other"];
export const PROLES = ["student", "mentee", "mentor", "speaker", "organizer", "volunteer", "alumni"];
export const PSTATUS = ["registered", "attended", "no-show", "cancelled"];
export const OKINDS = ["applied", "admitted", "enrolled", "transferred", "graduated", "working", "gap", "other"];
export const VIS = ["private", "internal", "aggregate", "public"];
export const SUBS = ["questions", "people", "results", "log"];

// 我在側欄上的等級：my_access() 的 records 那一格（edit 管得了、view 看得到）。
export const rcLevel = me => String(((me && me.ws) || {})["records"] || "");

// ── 固定題目（計畫第 4 節）。同一個 key 每一年都一樣，年度比較靠它。畫面上的字照表單的語言。 ──
const Q = (key, type, zh, en, extra) => Object.assign({ key, type, label: { zh, en }, required: false, options: [], scale_min: 1, scale_max: 5, min_label: "", max_label: "" }, extra || {});
export const TEMPLATES = {
  "post-event": [
    Q("recommend", "scale", "你會不會推薦這場活動給跟你情況一樣的朋友？", "How likely are you to recommend this event to a friend in your situation?", { required: true, min_label: { zh: "不會", en: "Would not" }, max_label: { zh: "一定會", en: "Definitely" } }),
    Q("useful", "scale", "今天對你自己的下一步有多有用？", "How useful was today for your own next step?"),
    Q("clarity", "scale", "活動結束後，你清不清楚接下來要做什麼？", "Was it clear what to do next after this event?"),
    Q("best", "short", "最有用的部分是什麼？", "What was the most useful part?"),
    Q("change", "long", "下一次我們該改什麼？", "What should we change next time?"),
    Q("first_time", "single", "這是你第一次參加 BT 的活動嗎？", "Is this your first BT event?", { options: { zh: ["是", "不是"], en: ["Yes", "No"] } }),
  ],
  "alumni-yearly": [
    Q("where_now", "short", "你現在在哪裡？（學校或公司、城市、國家）", "Where are you now? (institution or employer, city, country)", { required: true }),
    Q("status", "single", "這一年最符合你的是？", "What best describes this year?", { options: { zh: ["在念書", "在工作", "Gap year", "其他"], en: ["Studying", "Working", "Gap year", "Other"] } }),
    Q("major", "short", "你在念或在做什麼領域？", "What are you studying or working in?"),
    Q("recommend", "scale", "你今天會不會推薦 BT 給一位公立高中生？", "How likely are you to recommend BT to a public high school student today?"),
    Q("helped", "long", "回頭看，BT 真的幫到你的是什麼？", "Looking back, what did BT actually help with?"),
    Q("give_back", "multi", "今年願不願意回來？", "Would you come back this year?", { options: { zh: ["當講者", "當 mentor", "幫忙看文件", "今年不行"], en: ["As a speaker", "As a mentor", "As a reviewer", "Not this year"] } }),
    Q("story_ok", "single", "我們可不可以在網站或募資頁引用你這段話？", "May we quote this on the website or in the campaign?", { options: { zh: ["可以，附名字", "可以，不附名字", "不要"], en: ["Yes, with my name", "Yes, without my name", "No"] } }),
    Q("comment", "long", "還有什麼想說的？", "Anything else?"),
  ],
  "pair-mentee": [
    Q("meetings", "single", "這段期間你跟 mentor 聊了幾次？", "How many times did you and your mentor talk this period?", { options: { zh: ["0 次", "1 次", "2 到 3 次", "4 次以上"], en: ["0", "1", "2 to 3", "4 or more"] } }),
    Q("useful", "scale", "這些對話對你有多有用？", "How useful have these conversations been for you?"),
    Q("comfortable", "scale", "你覺得問 mentor 任何事有多自在？", "How comfortable do you feel asking your mentor anything?"),
    Q("stuck", "long", "現在有沒有卡住的事？", "Is anything stuck right now?"),
    Q("change", "long", "什麼會讓這件事更好？", "What would make this better?"),
    Q("continue", "single", "你想不想跟同一位 mentor 繼續？", "Would you like to continue with the same mentor?", { options: { zh: ["想", "不想", "不確定"], en: ["Yes", "No", "Not sure"] } }),
  ],
  "pair-mentor": [
    Q("meetings", "single", "這段期間你們聊了幾次？", "How many times did you talk this period?", { options: { zh: ["0 次", "1 次", "2 到 3 次", "4 次以上"], en: ["0", "1", "2 to 3", "4 or more"] } }),
    Q("engaged", "scale", "你的 mentee 有多投入？", "How engaged is your mentee?"),
    Q("workload", "scale", "你花的時間撐不撐得住？", "Is the time you are spending sustainable?"),
    Q("support", "long", "什麼支援對你當 mentor 有幫助？", "What support would help you as a mentor?"),
    Q("flag", "long", "有沒有 Mentorship team 該知道的事？", "Is there anything the Mentorship team should know?"),
  ],
};
// 把樣板照表單的語言變成 rc_save_form 要的題目清單。
export function templateQuestions(kind, l) {
  const pick = v => (v && typeof v === "object" && !Array.isArray(v)) ? (v[l] != null ? v[l] : v.en) : v;
  return (TEMPLATES[kind] || []).map(q => ({ key: q.key, type: q.type, label: pick(q.label), help: "", required: !!q.required,
    options: (pick(q.options) || []), scale_min: q.scale_min, scale_max: q.scale_max, min_label: pick(q.min_label) || "", max_label: pick(q.max_label) || "" }));
}

// ── 名單怎麼算（跟資料庫的 tf_match 同一條規則，畫面上算人數用）──
const teamsOf = p => String((p && p.team) || "").split(/[,、;；]/).map(s => s.trim()).filter(Boolean);
export function matchItem(p, it) {
  if (!p || !it) return false;
  if (it.kind === "rank") return (p.rank || "member") === it.value;
  if (it.kind === "team") return teamsOf(p).some(t => t.toLowerCase() === String(it.value || "").trim().toLowerCase());
  if (it.kind === "person") return p.id === it.value;
  return false;
}
export const peopleIn = (people, items) => (people || []).filter(p => (items || []).some(it => matchItem(p, it)));
export function audOf(audience, role) { return (audience || []).filter(a => a.role === role).map(a => ({ kind: a.kind, value: a.value || "" })); }
const itemKey = it => `${it.kind}:${it.value || ""}`;
export function toggleItem(items, it) {
  const k = itemKey(it), has = (items || []).some(x => itemKey(x) === k);
  return has ? items.filter(x => itemKey(x) !== k) : [...(items || []), { kind: it.kind, value: it.value || "" }];
}
export const hasItem = (items, it) => (items || []).some(x => itemKey(x) === itemKey(it));
export const sameItems = (a, b) => JSON.stringify((a || []).map(itemKey).sort()) === JSON.stringify((b || []).map(itemKey).sort());
export function teamList(people) { const s = new Set(PK_TEAMS); for (const p of people || []) for (const t of teamsOf(p)) s.add(t); return [...s]; }
export function normName(s) { return String(s || "").normalize("NFKC").toLowerCase().replace(/[.,'’"()（）\-_/]+/g, " ").replace(/\s+/g, " ").trim(); }
export function findPeople(people, q, skip) {
  const n = normName(q); if (!n) return [];
  const no = new Set(skip || []);
  return (people || []).filter(p => !no.has(p.id) && [p.name, p.name_zh, p.name_en].some(x => normName(x).includes(n))).slice(0, 8);
}

// ── 記分卡怎麼算 ──
// 四個數字：出席率、推薦、有用、回饋份數。null 表示沒有資料（不是 0）。
export function scorecard(n) {
  const x = n || {};
  const num = v => (v == null || v === "" ? null : Number(v));
  return { attendance: num(x.attendance_rate), registered: num(x.registered) || 0, attended: num(x.attended) || 0,
    recommend: num(x.recommend_avg), recommend_n: num(x.recommend_n) || 0, useful: num(x.useful_avg), clarity: num(x.clarity_avg),
    responses: num(x.responses) || 0, response_rate: num(x.response_rate) };
}
// 跟上一場同類比：正數是進步。沒有上一場或任一邊沒資料就是 null。
export function delta(now, prev) { return now == null || prev == null ? null : Math.round((now - prev) * 100) / 100; }
export function fmtNum(v, d) { return v == null ? "–" : (Number(v).toFixed(d == null ? 2 : d)); }
export function fmtPct(v) { return v == null ? "–" : `${Number(v).toFixed(0)}%`; }
export function fmtDelta(v, unit) { if (v == null) return ""; const s = v > 0 ? "+" : ""; return `${s}${unit === "%" ? Math.round(v) : Number.isInteger(v) ? v : v.toFixed(2)}${unit || ""}`; }

// ── 結果怎麼統計（跟內部表單同一套，多一個 key）──
const splitMulti = v => String(v || "").split("\n").map(s => s.trim()).filter(Boolean);
export function summarize(questions, responses) {
  const rs = responses || [];
  return (questions || []).map(q => {
    const vals = rs.map(r => String(((r.answers || {})[q.id]) || "")).filter(v => v !== "");
    if (q.type === "single" || q.type === "multi") {
      const count = new Map((q.options || []).map(o => [o, 0])), other = new Map();
      for (const v of vals) for (const x of (q.type === "multi" ? splitMulti(v) : [v])) { if (count.has(x)) count.set(x, count.get(x) + 1); else other.set(x, (other.get(x) || 0) + 1); }
      return { q, n: vals.length, counts: [...count].map(([option, n]) => ({ option, n })), other: [...other].map(([option, n]) => ({ option, n })) };
    }
    if (q.type === "scale") {
      const nums = vals.map(Number).filter(Number.isFinite);
      const lo = Number(q.scale_min == null ? 1 : q.scale_min), hi = Number(q.scale_max == null ? 5 : q.scale_max);
      const dist = []; for (let v = lo; v <= hi; v++) dist.push({ v, n: nums.filter(x => x === v).length });
      const avg = nums.length ? Math.round(nums.reduce((s, x) => s + x, 0) / nums.length * 100) / 100 : null;
      return { q, n: nums.length, avg, dist };
    }
    return { q, n: vals.length, texts: rs.filter(r => String(((r.answers || {})[q.id]) || "") !== "").map(r => ({ name: r.name || "", v: r.answers[q.id] })) };
  });
}
export function csvCell(v) {
  const s = String(v == null ? "" : v);
  return /[",\n\r]/.test(s) || /^[=+\-@]/.test(s) ? `"${(/^[=+\-@]/.test(s) ? "'" : "") + s.replace(/"/g, '""')}"` : s;
}
export function resultsCSV(questions, responses, anonymous) {
  const head = [...(anonymous ? [] : [T("res.who")]), T("res.when"), T("res.age"), T("res.contact"), ...(questions || []).map(q => (q.key ? q.key + " · " : "") + q.label)];
  const rows = (responses || []).map(r => [...(anonymous ? [] : [r.name || ""]), r.submitted_at || "", T("age." + (r.age_band || "unknown")), r.contact_ok ? "yes" : "",
    ...(questions || []).map(q => String(((r.answers || {})[q.id]) || "").replace(/\n/g, "; "))]);
  return "﻿" + [head, ...rows].map(r => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
export function csvFilename(title) {
  const slug = String(title || "form").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "form";
  return `bt-${slug}.csv`;
}
// 年度比較也能下載。
export function yearlyCSV(rows) {
  const head = ["term", "kind", "events", "registered", "attended", "responses", "recommend_avg", "useful_avg", "changes"];
  const body = (rows || []).map(r => [r.term_id || "", r.kind, r.events, r.registered, r.attended, r.responses, r.recommend_avg == null ? "" : r.recommend_avg, r.useful_avg == null ? "" : r.useful_avg,
    (r.changes || []).map(c => `${c.event}: ${c.we_change}`).join(" | ")]);
  return "﻿" + [head, ...body].map(r => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

// ── 日期 ──
export function fmtWhen(v) {
  if (!v) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const d = new Date(v); if (isNaN(d)) return String(v);
  try { return d.toLocaleString(lang() === "zh" ? "zh-TW" : "en-US", { timeZone: "Asia/Taipei", year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }); }
  catch (e) { return d.toISOString().slice(0, 16).replace("T", " "); }
}
export function fmtDay(v) { if (!v) return ""; const d = new Date(v); return isNaN(d) ? String(v) : new Date(d.getTime() + 8 * 3600000).toISOString().slice(0, 10); }
export function dtLocal(v) { if (!v) return ""; const d = new Date(v); if (isNaN(d)) return ""; return new Date(d.getTime() + 8 * 3600000).toISOString().slice(0, 16); }
export const fromLocal = s => s ? `${s}:00+08:00` : "";
export const evTitle = e => (e && (lang() === "zh" ? (e.title_zh || e.title_en) : (e.title_en || e.title_zh))) || "";
export const feedbackURL = token => `${typeof location === "undefined" ? "https://beyondtaiwannpo.com" : location.origin}/feedback/?t=${encodeURIComponent(token || "")}`;

// ── 畫面 ──
const statusTag = s => `<span class="tag ${s === "open" ? "open" : s === "closed" ? "closed" : "draft"}">${esc(T("st." + s))}</span>`;
const kindTag = k => `<span class="tag">${esc(T("ekind." + k))}</span>`;
const pickOpt = (v, label, sel) => `<option value="${esc(v)}"${String(v) === String(sel == null ? "" : sel) ? " selected" : ""}>${esc(label)}</option>`;
const sel = (name, opts, cur, dis, blank) => `<select name="${esc(name)}"${dis ? " disabled" : ""}>${blank ? pickOpt("", blank, cur) : ""}${opts.map(([v, l]) => pickOpt(v, l, cur)).join("")}</select>`;
const termOpts = terms => (terms || []).map(t => [t.id, t.id]);
const eventOpts = events => (events || []).map(e => [e.id, `${evTitle(e)} (${e.term_id || "?"})`]);

// 四個數字的格子，帶「上一場」的小字。
export function numbersHTML(n, prev) {
  const a = scorecard(n), b = prev ? scorecard(prev.numbers) : null;
  const tile = (label, value, hint, d, unit) => `<div class="kpi rc-kpi"><div class="kpi-n">${esc(value)}</div><div class="kpi-l">${esc(label)}</div>
    <div class="kpi-h">${esc(hint)}${b && d != null ? ` <b class="rc-delta ${d >= 0 ? "up" : "down"}">${esc(fmtDelta(d, unit))}</b>` : ""}</div></div>`;
  return `<div class="todo rc-nums">
    ${tile(T("num.attendance"), fmtPct(a.attendance), T("num.attendanceHint", { a: a.attended, r: a.registered }), b ? delta(a.attendance, b.attendance) : null, "%")}
    ${tile(T("num.recommend"), fmtNum(a.recommend), T("num.outOf", { n: a.recommend_n }), b ? delta(a.recommend, b.recommend) : null)}
    ${tile(T("num.useful"), fmtNum(a.useful), a.clarity == null ? "" : T("num.clarity", { v: fmtNum(a.clarity) }), b ? delta(a.useful, b.useful) : null)}
    ${tile(T("num.responses"), String(a.responses), a.response_rate == null ? "" : T("num.responseRate", { p: fmtPct(a.response_rate) }), b ? delta(a.responses, b.responses) : null)}
  </div>${b ? `<div class="mini rc-prev">${esc(T("num.prev", { title: evTitle(prev), when: fmtDay(prev.starts_at) }))}</div>` : ""}`;
}

// 總覽：數量、每一屆的活動與四個數字。
export function overviewHTML(boot, msg) {
  const b = boot || {}, c = b.counts || {}, events = b.events || [];
  const kpis = b.can_view ? `<div class="todo">${[["ov.people", c.people], ["ov.students", c.students], ["ov.participation", c.participation], ["ov.responses", c.responses], ["ov.pairs", c.pairs], ["ov.outcomes", c.outcomes]]
    .map(([k, n]) => `<div class="kpi"><div class="kpi-n">${n == null ? "–" : esc(String(n))}</div><div class="kpi-l">${esc(T(k))}</div></div>`).join("")}</div>` : "";
  const terms = [...new Set(events.map(e => e.term_id || ""))].sort((x, y) => (y || "").localeCompare(x || ""));
  const row = e => { const n = scorecard(e.numbers); return `<tr>
      <td class="t-main"><a href="#overview/${esc(e.id)}" data-act="open-event" data-id="${esc(e.id)}"><b>${esc(evTitle(e))}</b></a><br>${kindTag(e.kind)} <span class="mini">${esc(fmtDay(e.starts_at))}${e.team ? "・" + esc(e.team) : ""}</span></td>
      <td>${esc(fmtPct(n.attendance))}<br><span class="mini">${n.attended}/${n.registered}</span></td><td>${esc(fmtNum(n.recommend))}</td><td>${esc(fmtNum(n.useful))}</td><td>${n.responses}</td>
      <td>${e.review && e.review.we_change ? `<span class="tag open">${esc(T("ov.reviewed"))}</span><br><span class="mini">${esc(e.review.we_change)}</span>` : `<span class="tag draft">${esc(T("ov.notReviewed"))}</span>`}</td></tr>`; };
  const tables = terms.map(t => sectionHTML(t || T("ov.noTerm"), `<div class="tf-scroll"><table class="table rc-table"><thead><tr><th>${esc(T("ov.event"))}</th><th>${esc(T("num.attendance"))}</th><th>${esc(T("num.recommend"))}</th><th>${esc(T("num.useful"))}</th><th>${esc(T("num.responses"))}</th><th>${esc(T("ov.review"))}</th></tr></thead>
    <tbody>${events.filter(e => (e.term_id || "") === t).map(row).join("")}</tbody></table></div>`)).join("");
  const acts = b.can_manage ? [{ act: "ev-new", label: T("ov.addPast") }] : [];
  return pageHead(T("ov.title"), T("ov.lede"), acts) + msgHTML(msg) + kpis
    + (events.length ? tables : emptyHTML(T("ov.none"), esc(T("ov.noneHint"))))
    + `<div class="note">${esc(T("ov.ritual"))}</div>`;
}
// 加一場舊活動的表單（管的人）。
export function pastEventFormHTML(terms, draft, busy) {
  const d = draft || {};
  return `<div class="card inline-form" data-past><h2>${esc(T("past.title"))}</h2><div class="mini">${esc(T("past.lede"))}</div>
    <div class="two"><label><i>${esc(T("past.titleZh"))}</i><input name="title_zh" value="${esc(d.title_zh || "")}" maxlength="120"></label>
    <label><i>${esc(T("past.titleEn"))}</i><input name="title_en" value="${esc(d.title_en || "")}" maxlength="120"></label></div>
    <div class="two"><label><i>${esc(T("past.slug"))}</i><input name="slug" value="${esc(d.slug || "")}" maxlength="40" placeholder="summer-bootcamp-2025"></label>
    <label><i>${esc(T("ev.kind"))}</i>${sel("kind", EKINDS.map(k => [k, T("ekind." + k)]), d.kind || "bootcamp")}</label></div>
    <div class="two"><label><i>${esc(T("ev.term"))}</i>${sel("term_id", termOpts(terms), d.term_id || "", false, T("ev.noTerm"))}</label>
    <label><i>${esc(T("past.team"))}</i><input name="team" value="${esc(d.team || "")}" maxlength="60" placeholder="Curriculum Team"></label></div>
    <div class="two"><label><i>${esc(T("past.starts"))}</i><input type="datetime-local" name="starts_at" value="${esc(d.starts_at || "")}"></label>
    <label><i>${esc(T("past.ends"))}</i><input type="datetime-local" name="ends_at" value="${esc(d.ends_at || "")}"></label></div>
    <div class="form-foot"><button class="btn" data-act="ev-create"${busy ? " disabled" : ""}>${esc(busy ? T("common.saving") : T("past.create"))}</button><button class="btn ghost" data-act="ev-new-cancel">${esc(T("common.cancel"))}</button></div></div>`;
}

// 一場活動：記分卡、設定、場次、出席、回饋表、留言、配對、檢討。
export function eventHTML(d, S) {
  const e = d.event || {}, edit = !!d.can_edit, dis = edit ? "" : " disabled", terms = (S.boot && S.boot.terms) || [], forms = d.forms || [];
  const isTerm = e.kind === "mentorship-term";
  const settings = sectionHTML(T("ev.settings"), `<div class="two" data-evmeta>
      <label><i>${esc(T("ev.kind"))}</i>${sel("kind", EKINDS.map(k => [k, T("ekind." + k)]), e.kind, !edit)}</label>
      <label><i>${esc(T("ev.term"))}</i>${sel("term_id", termOpts(terms), e.term_id || "", !edit, T("ev.noTerm"))}</label></div>
    ${edit ? `<div class="form-foot"><button class="btn ghost sm" data-act="ev-meta-save"${S.busy ? " disabled" : ""}>${esc(T("common.save"))}</button><span class="mini">${esc(T("ev.kindHint"))}</span></div>` : ""}`);
  const sessions = (d.sessions || []);
  const sessHTML = sectionHTML(T("ev.sessions"), (sessions.length ? `<ul class="flist" data-sessions>${sessions.map((s, i) => `<li data-sid="${esc(s.id)}"><div class="two"><label><i>${esc(T("ev.sessTitle"))} ${i + 1}</i><input name="title" value="${esc(s.title || "")}" maxlength="80"${dis}></label>
      <label><i>${esc(T("past.starts"))}</i><input type="datetime-local" name="starts_at" value="${esc(dtLocal(s.starts_at))}"${dis}></label></div>${edit ? `<button class="btn quiet sm" data-act="sess-del" data-i="${i}">${esc(T("common.delete"))}</button>` : ""}</li>`).join("")}</ul>` : `<div class="mini">${esc(T("ev.noSessions"))}</div>`)
    + (edit ? `<div class="form-foot"><button class="btn ghost sm" data-act="sess-add">${esc(T("ev.sessAdd"))}</button>${sessions.length ? `<button class="btn ghost sm" data-act="sess-save"${S.busy ? " disabled" : ""}>${esc(T("ev.sessSave"))}</button>` : ""}</div>` : ""));
  const parts = d.participation || [];
  const prow = p => `<tr><td class="t-main"><a href="#people/${esc(p.person_id)}" data-act="open-person" data-id="${esc(p.person_id)}"><b>${esc(p.name || T("common.noName"))}</b></a>${p.school ? `<br><span class="mini">${esc(p.school)}</span>` : ""}</td>
      <td>${esc(T("prole." + p.role))}</td><td>${edit ? sel("status", PSTATUS.map(s => [s, T("pstatus." + s)]), p.status, false) : esc(T("pstatus." + p.status))}</td><td><span class="mini">${esc(T("psrc." + p.source))}</span></td>
      <td>${edit ? `<button class="btn quiet sm" data-act="part-del" data-id="${esc(p.id)}">${esc(T("common.delete"))}</button>` : ""}</td></tr>`;
  const addPart = edit ? `<div class="card inline-form" data-partadd><h2>${esc(T("part.add"))}</h2>
      <div class="two"><label><i>${esc(T("person.nameZh"))}</i><input name="name_zh" maxlength="60"></label><label><i>${esc(T("person.nameEn"))}</i><input name="name_en" maxlength="60"></label></div>
      <div class="two"><label><i>${esc(T("person.email"))}</i><input name="email" type="email" maxlength="120"></label><label><i>${esc(T("person.school"))}</i><input name="school" maxlength="80"></label></div>
      <div class="two"><label><i>${esc(T("part.role"))}</i>${sel("role", PROLES.map(r => [r, T("prole." + r)]), isTerm ? "mentee" : "student")}</label><label><i>${esc(T("part.status"))}</i>${sel("status", PSTATUS.map(s => [s, T("pstatus." + s)]), "attended")}</label></div>
      <div class="form-foot"><button class="btn sm" data-act="part-add"${S.busy ? " disabled" : ""}>${esc(T("part.addBtn"))}</button><span class="mini">${esc(T("part.addHint"))}</span></div></div>` : "";
  const partHTML = sectionHTML(T("ev.participation", { n: parts.length }), `${e.source === "site" ? `<div class="row"><span class="mini">${esc(T("part.syncHint"))}</span><span class="sp"></span><button class="btn ghost sm" data-act="part-sync"${S.busy ? " disabled" : ""}>${esc(T("part.sync"))}</button></div>` : ""}
    ${parts.length ? `<div class="tf-scroll" data-parts><table class="table rc-table"><thead><tr><th>${esc(T("part.who"))}</th><th>${esc(T("part.role"))}</th><th>${esc(T("part.status"))}</th><th>${esc(T("part.source"))}</th><th></th></tr></thead><tbody>${parts.map(prow).join("")}</tbody></table></div>
    ${edit ? `<div class="form-foot"><button class="btn ghost sm" data-act="part-save"${S.busy ? " disabled" : ""}>${esc(T("part.saveStatus"))}</button></div>` : ""}` : `<div class="mini">${esc(T("part.none"))}</div>`}${addPart}`);
  const formsHTML = sectionHTML(T("ev.forms"), `${forms.length ? `<ul class="flist">${forms.map(f => `<li><div class="fhead"><a href="#forms/${esc(f.id)}" data-act="open-form" data-id="${esc(f.id)}"><b>${esc(f.title)}</b></a> ${statusTag(f.status)} <span class="tag">${esc(T("fkind." + f.kind))}</span></div>
      <div class="fmeta">${esc(T("form.count", { n: f.responses || 0 }))}${f.status === "open" ? `・<a class="lnk" href="${esc(feedbackURL(f.token))}" target="_blank" rel="noopener">${esc(T("form.link"))}</a>` : ""}${f.can_read === false ? `・<span class="mini">${esc(T("form.cantRead"))}</span>` : ""}</div></li>`).join("")}</ul>` : `<div class="mini">${esc(T("ev.noForms"))}</div>`}
    ${edit ? `<div class="form-foot">${(isTerm ? ["pair-mentee", "pair-mentor"] : ["post-event"]).map(k => `<button class="btn ghost sm" data-act="form-template" data-kind="${k}" data-event="${esc(e.id)}"${S.busy ? " disabled" : ""}>${esc(T("form.newFrom", { kind: T("fkind." + k) }))}</button>`).join("")}<span class="mini">${esc(T("form.templateHint"))}</span></div>` : ""}`);
  const scales = (d.scales || []);
  const bar = (label, n, of) => `<div class="tf-bar"><span class="tf-bar-l">${esc(label)}</span><span class="tf-bar-t"><i style="width:${of ? Math.round(n / of * 100) : 0}%"></i></span><b>${n}</b></div>`;
  const scalesHTML = scales.length ? sectionHTML(T("ev.scales"), scales.map(s => bar(`${s.key ? s.key + " · " : ""}${s.label}  (${s.n})`, Number(s.avg || 0), Number(s.max || 5))).join("")) : "";
  const comments = d.comments || [];
  const byKey = {}; for (const c of comments) (byKey[c.key || c.label] = byKey[c.key || c.label] || { label: c.label, key: c.key, items: [] }).items.push(c.value);
  const commentsHTML = comments.length ? sectionHTML(T("ev.comments", { n: comments.length }), Object.values(byKey).map(g => `<div class="card tf-sum"><h3 class="tf-sq">${esc(g.label)}${g.key ? ` <span class="mini">${esc(g.key)}</span>` : ""}</h3>
    <ul class="tf-texts">${(S.more && S.more[g.key || g.label] ? g.items : g.items.slice(0, 8)).map(v => `<li><div>${esc(v).replace(/\n/g, "<br>")}</div></li>`).join("")}</ul>
    ${g.items.length > 8 && !(S.more && S.more[g.key || g.label]) ? `<button type="button" class="lnk" data-act="res-more" data-id="${esc(g.key || g.label)}">${esc(T("res.showAll", { n: g.items.length }))}</button>` : ""}</div>`).join("")) : "";
  const pairs = d.pairs || [];
  const pairsHTML = isTerm ? sectionHTML(T("ev.pairs", { n: pairs.length }), `${pairs.length ? `<div class="tf-scroll"><table class="table rc-table"><thead><tr><th>Mentor</th><th>Mentee</th><th>${esc(T("pair.matched"))}</th><th>${esc(T("pair.ended"))}</th><th></th></tr></thead><tbody>
      ${pairs.map(p => `<tr><td class="t-main">${p.mentor_id ? `<a href="#people/${esc(p.mentor_id)}" data-act="open-person" data-id="${esc(p.mentor_id)}">${esc(p.mentor || T("common.noName"))}</a>` : `<span class="mini">${esc(T("pair.forgotten"))}</span>`}</td>
        <td>${p.mentee_id ? `<a href="#people/${esc(p.mentee_id)}" data-act="open-person" data-id="${esc(p.mentee_id)}">${esc(p.mentee || T("common.noName"))}</a>` : `<span class="mini">${esc(T("pair.forgotten"))}</span>`}</td>
        <td>${esc(p.matched_on || "")}</td><td>${p.ended_on ? `${esc(p.ended_on)} <span class="mini">${esc(T("pend." + (p.end_reason || "other")))}</span>` : (S.boot && S.boot.can_manage ? `<button class="btn quiet sm" data-act="pair-end" data-id="${esc(p.id)}">${esc(T("pair.endBtn"))}</button>` : "")}</td>
        <td>${S.boot && S.boot.can_manage ? `<button class="btn quiet sm" data-act="pair-del" data-id="${esc(p.id)}">${esc(T("common.delete"))}</button>` : ""}</td></tr>`).join("")}</tbody></table></div>` : `<div class="mini">${esc(T("pair.none"))}</div>`}
    ${S.boot && S.boot.can_manage ? `<div class="card inline-form" data-pairadd><h2>${esc(T("pair.add"))}</h2>
      <div class="two"><label><i>Mentor ${esc(T("person.nameEn"))}</i><input name="mentor_name_en" maxlength="60"></label><label><i>Mentor ${esc(T("person.email"))}</i><input name="mentor_email" type="email" maxlength="120"></label></div>
      <div class="two"><label><i>Mentee ${esc(T("person.nameZh"))}</i><input name="mentee_name_zh" maxlength="60"></label><label><i>Mentee ${esc(T("person.email"))}</i><input name="mentee_email" type="email" maxlength="120"></label></div>
      <div class="two"><label><i>Mentee ${esc(T("person.school"))}</i><input name="mentee_school" maxlength="80"></label><label><i>${esc(T("pair.matched"))}</i><input type="date" name="matched_on"></label></div>
      <div class="form-foot"><button class="btn sm" data-act="pair-add"${S.busy ? " disabled" : ""}>${esc(T("pair.addBtn"))}</button><span class="mini">${esc(T("pair.addHint"))}</span></div></div>` : ""}`) : "";
  const r = d.review || {};
  const reviewHTML = sectionHTML(T("ev.review"), `<div class="mini">${esc(T("rev.lede"))}</div>
    ${r.updated_at ? `<div class="mini">${esc(T("rev.last", { when: fmtWhen(r.updated_at), who: r.owner || "" }))}</div>` : ""}
    <div data-review>
      <label><i>${esc(T("rev.wentWell"))}</i><textarea name="went_well" rows="2" maxlength="2000"${dis}>${esc(r.went_well || "")}</textarea></label>
      <label><i>${esc(T("rev.weChange"))}</i><textarea name="we_change" rows="2" maxlength="1000" placeholder="${esc(T("rev.weChangePh"))}"${dis}>${esc(r.we_change || "")}</textarea></label>
      ${d.previous && d.previous.review && d.previous.review.we_change ? `<div class="note">${esc(T("rev.prevChange", { title: evTitle(d.previous) }))}<br><b>${esc(d.previous.review.we_change)}</b></div>` : ""}
      <label class="check"><input type="checkbox" name="change_happened"${r.change_happened ? " checked" : ""}${dis}><span>${esc(T("rev.happened"))}</span></label>
      ${edit ? `<div class="form-foot"><button class="btn" data-act="rev-save"${S.busy ? " disabled" : ""}>${esc(T("rev.save"))}</button></div>` : ""}
    </div>`);
  return pageHead(`${esc(evTitle(e))} ${kindTag(e.kind)}`, `${esc(fmtDay(e.starts_at))}${e.term_id ? "・" + esc(e.term_id) : ""}${e.team ? "・" + esc(e.team) : ""}${e.source === "import" ? "・" + esc(T("ev.imported")) : ""}`, [], { act: "back-overview", label: T("ev.back") })
    + msgHTML(S.msg) + numbersHTML(e.numbers, d.previous) + (edit ? "" : `<div class="note">${esc(T("ev.readonly"))}</div>`)
    + reviewHTML + settings + sessHTML + partHTML + formsHTML + scalesHTML + commentsHTML + pairsHTML;
}
// 從畫面讀：場次、出席狀態、檢討、活動設定。
export function readSessions(box) {
  return [...box.querySelectorAll("li[data-sid]")].map(li => ({ id: li.dataset.sid.startsWith("new-") ? "" : li.dataset.sid, title: li.querySelector('[name="title"]').value, starts_at: fromLocal(li.querySelector('[name="starts_at"]').value), ends_at: "" }));
}
export function readPartStatus(box) { return [...box.querySelectorAll("tr")].map(tr => ({ id: (tr.querySelector("[data-act='part-del']") || {}).dataset?.id, status: (tr.querySelector('[name="status"]') || {}).value })).filter(x => x.id && x.status); }
export function readReview(box) { const v = formValues(box); return { went_well: v.went_well || "", we_change: v.we_change || "", change_happened: !!v.change_happened }; }

// 回饋表清單與新建。
export function formsListHTML(boot, msg, busy, newDraft) {
  const b = boot || {}, forms = b.forms || [], events = b.events || [];
  const acts = (b.can_manage || events.length) && !newDraft ? [{ act: "form-new", label: T("form.new"), primary: true }] : [];
  const nd = newDraft || {};
  const nf = newDraft ? `<div class="card inline-form" data-newform><h2>${esc(T("form.newTitle"))}</h2>
      <label><i>${esc(T("ed.name"))}</i><input id="rc-new-title" value="${esc(nd.title || "")}" maxlength="200" placeholder="${esc(T("form.titlePh"))}"></label>
      <div class="two"><label><i>${esc(T("form.kind"))}</i>${sel("kind", FKINDS.map(k => [k, T("fkind." + k)]), nd.kind || "post-event")}</label>
      <label><i>${esc(T("form.event"))}</i>${sel("event_id", eventOpts(events), nd.event_id || "", false, T("form.noEvent"))}</label></div>
      <div class="two"><label><i>${esc(T("form.lang"))}</i>${sel("lang", [["zh", "中文"], ["en", "English"]], nd.lang || lang())}</label>
      <label class="check rc-tpl"><input type="checkbox" name="template" checked><span>${esc(T("form.useTemplate"))}</span></label></div>
      <div class="mini">${esc(T("form.kindHint"))}</div>
      <div class="form-foot"><button class="btn" data-act="form-create"${busy ? " disabled" : ""}>${esc(busy ? T("common.saving") : T("build.create"))}</button><button class="btn ghost" data-act="form-new-cancel">${esc(T("common.cancel"))}</button></div></div>` : "";
  const row = f => `<li><div class="fhead"><a href="#forms/${esc(f.id)}" data-act="open-form" data-id="${esc(f.id)}"><b>${esc(f.title)}</b></a> ${statusTag(f.status)} <span class="tag">${esc(T("fkind." + f.kind))}</span></div>
      <div class="fmeta">${f.event_title ? esc(f.event_title) + "・" : ""}${esc(T("form.count", { n: f.responses || 0 }))}${f.closes_at ? "・" + esc(T("fill.closes", { when: fmtWhen(f.closes_at) })) : ""}</div></li>`;
  return pageHead(T("form.title"), T("form.lede"), acts) + msgHTML(msg) + nf
    + (forms.length ? `<ul class="flist">${forms.map(row).join("")}</ul>` : emptyHTML(T("form.none"), esc(T("form.noneHint"))));
}
export function formHeadHTML(r, sub) {
  const f = r.form || {}, edit = !!r.can_edit, acts = [];
  if (edit) {
    if (f.status === "draft") acts.push({ act: "form-status", id: "open", label: T("ed.open"), primary: true });
    if (f.status === "open") acts.push({ act: "form-status", id: "closed", label: T("ed.close") });
    if (f.status === "closed") acts.push({ act: "form-status", id: "open", label: T("ed.reopen") });
  }
  const tabs = `<div class="chips tf-tabs" role="tablist">${SUBS.map(s => `<a class="chip${s === sub ? " on" : ""}" role="tab" aria-selected="${s === sub}" href="#forms/${esc(f.id)}/${s}" data-act="sub" data-t="${s}">${esc(T("ed.tab." + s))}</a>`).join("")}</div>`;
  const link = f.status === "open" ? `<div class="note rc-link"><b>${esc(T("form.linkLabel"))}</b> <input readonly value="${esc(feedbackURL(f.token))}" id="rc-link" data-noauto="1"> <button class="btn ghost sm" data-act="copy-link">${esc(T("form.copy"))}</button><div class="mini">${esc(T("form.linkHint"))}</div></div>` : "";
  return pageHead(`${esc(f.title || "")} ${statusTag(f.status)} <span class="tag">${esc(T("fkind." + f.kind))}</span>`, `${f.event_title ? esc(f.event_title) + "・" : ""}${esc(T("form.count", { n: f.responses || 0 }))}`, acts, { act: "back-forms", label: T("ed.back") })
    + (edit ? "" : `<div class="note">${esc(T("ed.readonly"))}</div>`) + link + tabs;
}
// 題目與設定（改了就存，main.js 的 onAutosave rc-save）。
export function formEditHTML(r, S) {
  const f = r.form || {}, qs = r.questions || [], edit = !!r.can_edit, dis = edit ? "" : " disabled", events = (S.boot && S.boot.events) || [], terms = (S.boot && S.boot.terms) || [];
  const anonLocked = f.anonymous && (f.responses || 0) > 0;
  const qEd = (q, i) => { const choice = q.type === "single" || q.type === "multi"; return `<li class="tf-q" data-qid="${esc(q.id)}">
      <div class="qtop">${edit ? `<div class="qmove"><button type="button" data-act="q-up" data-i="${i}"${i === 0 ? " disabled" : ""} aria-label="${esc(T("q.up"))}">↑</button><button type="button" data-act="q-down" data-i="${i}"${i === qs.length - 1 ? " disabled" : ""} aria-label="${esc(T("q.down"))}">↓</button></div>` : ""}
        <div class="qbody"><label><i>${esc(T("q.label"))} ${i + 1}</i><input name="label" value="${esc(q.label)}" maxlength="500"${dis}></label>
          <div class="two"><label><i>${esc(T("q.type"))}</i><select name="type"${dis || (q.answered ? " disabled" : "")}>${TYPES.map(t => pickOpt(t, T("type." + t), q.type)).join("")}</select></label>
            <label><i>${esc(T("q.key"))}</i><input name="key" value="${esc(q.key || "")}" maxlength="30" placeholder="recommend" pattern="[a-z][a-z0-9_]*"${dis}></label></div>
          <div class="two"><label class="check tf-req"><input type="checkbox" name="required"${q.required ? " checked" : ""}${dis}><span>${esc(T("q.req"))}</span></label>
            <label><i>${esc(T("q.help"))}</i><input name="help" value="${esc(q.help || "")}" maxlength="500"${dis}></label></div>
          ${choice ? `<label><i>${esc(T("q.opts"))}</i><textarea name="options" rows="4"${dis}>${esc((q.options || []).join("\n"))}</textarea></label>` : ""}
          ${q.type === "scale" ? `<div class="two"><label><i>${esc(T("q.min"))}</i><select name="scale_min"${dis}>${[0, 1].map(n => pickOpt(n, String(n), q.scale_min)).join("")}</select></label>
            <label><i>${esc(T("q.max"))}</i><select name="scale_max"${dis}>${[2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => pickOpt(n, String(n), q.scale_max)).join("")}</select></label>
            <label><i>${esc(T("q.minLabel"))}</i><input name="min_label" value="${esc(q.min_label || "")}" maxlength="80"${dis}></label><label><i>${esc(T("q.maxLabel"))}</i><input name="max_label" value="${esc(q.max_label || "")}" maxlength="80"${dis}></label></div>` : ""}
          ${q.answered ? `<span class="tag">${esc(T("q.answered"))}</span>` : ""}</div>
        ${edit && !q.answered ? `<button type="button" class="btn quiet sm" data-act="q-del" data-i="${i}">${esc(T("q.del"))}</button>` : ""}</div></li>`; };
  return msgHTML(S.msg) + `<div data-autosave="rc-save" data-id="${esc(f.id)}">`
    + sectionHTML(T("ed.settings"), `<div class="tf-settings">
      <label><i>${esc(T("ed.name"))}</i><input name="title" value="${esc(f.title)}" maxlength="200"${dis}></label>
      <label><i>${esc(T("ed.intro"))}</i><textarea name="intro" rows="3" placeholder="${esc(T("form.introPh"))}"${dis}>${esc(f.intro || "")}</textarea></label>
      <div class="two"><label><i>${esc(T("form.event"))}</i>${sel("event_id", eventOpts(events), f.event_id || "", !edit, T("form.noEvent"))}</label>
      <label><i>${esc(T("ev.term"))}</i>${sel("term_id", termOpts(terms), f.term_id || "", !edit, T("ev.noTerm"))}</label></div>
      <div class="two"><label><i>${esc(T("form.lang"))}</i>${sel("lang", [["zh", "中文"], ["en", "English"]], f.lang, !edit)}</label>
      <label><i>${esc(T("ed.closes"))}</i><input type="datetime-local" name="closes_at" value="${esc(dtLocal(f.closes_at))}"${dis}></label></div>
      <label class="check"><input type="checkbox" name="anonymous"${f.anonymous ? " checked" : ""}${dis || (anonLocked ? " disabled" : "")}><span>${esc(T("form.anon"))}</span></label>
      ${anonLocked ? `<div class="mini">${esc(T("ed.anonLocked"))}</div>` : ""}
      <div class="mini">${esc(T("form.consentNote"))}</div>
      ${edit ? `<div class="form-foot">${autosaveHint("rc-save")}</div>` : ""}</div>`)
    + sectionHTML(T("ed.questions"), `<div class="mini" style="margin-bottom:10px">${esc(T("q.keyNote"))}</div>
      ${qs.length ? `<ul class="qlist tf-qlist">${qs.map(qEd).join("")}</ul>` : emptyHTML(T("ed.noQ"), esc(T("ed.noQHint")))}
      ${edit ? `<div class="row tf-add"><span class="mini">${esc(T("ed.addQ"))}</span>${TYPES.map(t => `<button type="button" class="btn ghost sm" data-act="q-add" data-t="${t}"${S.busy ? " disabled" : ""}>+ ${esc(T("type." + t))}</button>`).join("")}
        ${TEMPLATES[f.kind] && !qs.length ? `<button type="button" class="btn ghost sm" data-act="q-template"${S.busy ? " disabled" : ""}>${esc(T("form.fillTemplate"))}</button>` : ""}</div>` : ""}`)
    + `</div>` + (S.boot && S.boot.can_manage ? sectionHTML("", `<div class="row"><span class="sp"></span><button class="btn quiet sm" data-act="form-delete" data-id="${esc(f.id)}">${esc(T("ed.delete"))}</button></div>`) : "");
}
export function readFormEditor(box, questions) {
  const v = formValues(box);
  const data = { title: v.title || "", intro: v.intro || "", event_id: v.event_id || "", term_id: v.term_id || "", lang: v.lang || "zh", closes_at: fromLocal(v.closes_at || ""), anonymous: !!v.anonymous };
  const qs = [...box.querySelectorAll("li.tf-q")].map(li => {
    const old = (questions || []).find(q => q.id === li.dataset.qid) || {};
    const get = n => { const el = li.querySelector(`[name="${n}"]`); return el ? (el.type === "checkbox" ? el.checked : el.value) : undefined; };
    const type = get("type") || old.type;
    return { id: li.dataset.qid, type, key: String(get("key") || "").trim().toLowerCase(), label: get("label") || "", help: get("help") || "", required: !!get("required"),
      options: get("options") != null ? String(get("options")).split("\n").map(s => s.trim()).filter(Boolean) : (old.options || []),
      scale_min: Number(get("scale_min") != null ? get("scale_min") : (old.scale_min == null ? 1 : old.scale_min)),
      scale_max: Number(get("scale_max") != null ? get("scale_max") : (old.scale_max == null ? 5 : old.scale_max)),
      min_label: get("min_label") != null ? get("min_label") : (old.min_label || ""), max_label: get("max_label") != null ? get("max_label") : (old.max_label || "") };
  });
  return { data, questions: qs };
}
export function newQuestion(type) {
  const q = { type, key: "", label: T("ed.newQ"), help: "", required: false, options: [], scale_min: 1, scale_max: 5, min_label: "", max_label: "" };
  if (type === "single" || type === "multi") q.options = [T("ed.opt1"), T("ed.opt2")];
  return q;
}
// 誰讀得到、誰改得動。配對回饋只能點名，mentor 加不進去（資料庫擋）。
export function audienceHTML(r, people, aud, saved, find, msg, busy) {
  const edit = !!r.can_edit, f = r.form || {}, pair = String(f.kind || "").startsWith("pair-");
  const block = role => {
    const can = role === "editor" ? !!(r.can_manage || f.owner_is_me) : edit;
    const items = aud[role] || [], dis = can ? "" : " disabled";
    const chip = (it, label) => `<button type="button" class="chip${hasItem(items, it) ? " on" : ""}" data-act="aud-toggle" data-role="${role}" data-kind="${it.kind}" data-value="${esc(it.value || "")}" aria-pressed="${hasItem(items, it)}"${dis}>${esc(label)}</button>`;
    const persons = items.filter(it => it.kind === "person").map(it => (people || []).find(p => p.id === it.value) || { id: it.value, name: it.value });
    const inNow = peopleIn(people, items), q = (find || {})[role] || "", hits = can ? findPeople(people, q, persons.map(p => p.id)) : [], dirty = !sameItems(items, saved[role]);
    return sectionHTML(esc(T("aud." + role)), `<div class="mini">${esc(T("aud." + role + "Hint"))}</div><div class="mini">${esc(T(pair ? "aud.alwaysPair" : "aud.always"))}</div>
      ${pair ? "" : `<div class="tf-aud-row"><b>${esc(T("aud.ranks"))}</b><div class="chips">${RANKS.map(x => chip({ kind: "rank", value: x }, T("rank." + x))).join("")}</div></div>
      <div class="tf-aud-row"><b>${esc(T("aud.teams"))}</b><div class="chips">${teamList(people).map(t => chip({ kind: "team", value: t }, t.replace(/\s*Team$/i, ""))).join("")}</div></div>`}
      <div class="tf-aud-row"><b>${esc(T("aud.people"))}</b><div class="chips">${persons.length ? persons.map(p => `<button type="button" class="chip on" data-act="aud-toggle" data-role="${role}" data-kind="person" data-value="${esc(p.id)}" aria-label="${esc(T("aud.remove", { name: p.name }))}"${dis}>${esc(p.name)} ×</button>`).join("") : `<span class="mini">${esc(T("aud.nobodyYet"))}</span>`}</div>
        ${can ? `<input type="search" class="tf-find" data-role="${role}" id="tf-find-${role}" value="${esc(q)}" placeholder="${esc(T("aud.search"))}" autocomplete="off" data-noauto="1">
        ${hits.length ? `<div class="chips tf-hits">${hits.map(p => `<button type="button" class="chip" data-act="aud-toggle" data-role="${role}" data-kind="person" data-value="${esc(p.id)}">+ ${esc(p.name)}${p.team ? `<small> ${esc(teamsOf(p).map(t => t.replace(/\s*Team$/i, "")).join(", "))}</small>` : ""}</button>`).join("")}</div>` : ""}` : ""}</div>
      ${role === "reader" && items.some(it => it.kind !== "person") ? `<div class="msg err" role="status"><span class="msg-k">!</span><span>${esc(T("aud.readerWarn"))}</span></div>` : ""}
      <details class="tf-count"><summary>${esc(T("aud.count", { n: inNow.length }))}</summary><div class="mini">${inNow.map(p => esc(p.name)).join(esc(T("punct.list")))}</div></details>
      ${can ? `<div class="form-foot"><button type="button" class="btn${dirty ? "" : " ghost"}" data-act="aud-save" data-role="${role}"${busy || !dirty ? " disabled" : ""}>${esc(T("aud.save"))}</button>${dirty ? `<span class="mini">${esc(T("aud.unsaved"))}</span>` : ""}</div>` : ""}`, { id: "aud-" + role });
  };
  return msgHTML(msg) + ROLES.map(block).join("");
}
export function resultsHTML(r, msg, showAll) {
  const f = r.form || {}, qs = r.questions || [], rs = r.responses || [], anon = !!f.anonymous;
  const bands = ["under18", "18plus", "unknown"].map(b => [b, rs.filter(x => (x.age_band || "unknown") === b).length]);
  const kpis = `<div class="todo"><div class="kpi"><div class="kpi-n">${rs.length}</div><div class="kpi-l">${esc(T("res.answered"))}</div></div>
    <div class="kpi"><div class="kpi-n">${rs.filter(x => x.contact_ok).length}</div><div class="kpi-l">${esc(T("res.contactOk"))}</div></div>
    <div class="kpi"><div class="kpi-n">${bands[0][1]}</div><div class="kpi-l">${esc(T("age.under18"))}</div><div class="kpi-h">${esc(T("res.bands", { a: bands[1][1], u: bands[2][1] }))}</div></div></div>`;
  if (!rs.length) return msgHTML(msg) + kpis + emptyHTML(T("res.none"), esc(T("res.noneHint")));
  const bar = (label, n, of) => `<div class="tf-bar"><span class="tf-bar-l">${esc(label)}</span><span class="tf-bar-t"><i style="width:${of ? Math.round(n / of * 100) : 0}%"></i></span><b>${n}</b></div>`;
  const sums = summarize(qs, rs).map((s, i) => {
    const head = `<h3 class="tf-sq">${i + 1}. ${esc(s.q.label)} <span class="mini">${s.q.key ? esc(s.q.key) + "・" : ""}${esc(T("type." + s.q.type))}</span></h3>`;
    if (s.counts) { const of = Math.max(1, ...s.counts.map(c => c.n), ...s.other.map(c => c.n)); return `<div class="card tf-sum">${head}${s.counts.map(c => bar(c.option, c.n, of)).join("")}${s.other.map(c => bar(c.option + " " + T("res.other"), c.n, of)).join("")}</div>`; }
    if (s.dist) { const of = Math.max(1, ...s.dist.map(d => d.n)); return `<div class="card tf-sum">${head}<div class="tf-avg">${esc(T("res.avg", { avg: s.avg == null ? "–" : s.avg, n: s.n, min: s.q.scale_min, max: s.q.scale_max }))}</div>${s.dist.map(d => bar(String(d.v), d.n, of)).join("")}</div>`; }
    const list = showAll && showAll[s.q.id] ? s.texts : s.texts.slice(0, 6);
    return `<div class="card tf-sum">${head}<div class="mini">${esc(T("res.nAnswers", { n: s.n }))}</div><ul class="tf-texts">${list.map(t => `<li><div>${esc(t.v).replace(/\n/g, "<br>")}</div>${anon || !t.name ? "" : `<span class="mini">${esc(t.name)}</span>`}</li>`).join("")}</ul>
      ${s.texts.length > list.length ? `<button type="button" class="lnk" data-act="res-more" data-id="${esc(s.q.id)}">${esc(T("res.showAll", { n: s.texts.length }))}</button>` : ""}</div>`;
  }).join("");
  const each = `<table class="table tf-each"><thead><tr>${anon ? "" : `<th>${esc(T("res.who"))}</th>`}<th>${esc(T("res.when"))}</th><th>${esc(T("res.age"))}</th><th>${esc(T("res.contact"))}</th></tr></thead><tbody>${rs.map(x => `<tr>${anon ? "" : `<td class="t-main">${x.person_id ? `<a href="#people/${esc(x.person_id)}" data-act="open-person" data-id="${esc(x.person_id)}"><b>${esc(x.name || T("common.noName"))}</b></a>` : `<b>${esc(x.name || "")}</b>`}</td>`}<td>${esc(fmtWhen(x.submitted_at))}</td><td>${esc(T("age." + (x.age_band || "unknown")))}</td><td>${x.contact_ok ? "✓" : ""}</td></tr>`).join("")}</tbody></table>`;
  return msgHTML(msg) + kpis + (anon ? `<div class="note">${esc(T("res.anon"))}</div>` : "") + `<div class="note">${esc(T("res.minors"))}</div>`
    + `<div class="row"><span class="sp"></span><button class="btn ghost sm" data-act="res-csv">${esc(T("res.csv"))}</button></div>`
    + sectionHTML(T("res.summary"), sums) + sectionHTML(T("res.each"), `<div class="tf-scroll">${each}</div>`);
}
export function logHTML(r) {
  const rows = r.log || [];
  if (!rows.length) return `<div class="mini">${esc(T("log.none"))}</div>`;
  const show = v => v == null ? "" : typeof v === "string" ? v : Array.isArray(v) ? v.map(x => x.kind === "rank" ? T("rank." + x.value) : x.value).join(", ") : JSON.stringify(v);
  return `<ul class="flist">${rows.map(l => `<li><div class="fhead"><b>${esc(T("log." + l.what) || l.what)}</b> <span class="mini">${esc(fmtWhen(l.at))}・${esc(l.who || "")}</span></div><div class="fmeta">${l.before != null ? esc(show(l.before)) + " → " : ""}${esc(show(l.after))}</div></li>`).join("")}</ul>`;
}

// 人：找、重複、加。
export function peopleHTML(boot, S) {
  const b = boot || {}, dups = b.duplicates || [], hits = S.people || [];
  const search = `<div class="card"><label><i>${esc(T("pp.find"))}</i><input type="search" id="rc-pfind" class="rc-pfind" value="${esc(S.pq || "")}" placeholder="${esc(T("pp.findPh"))}" autocomplete="off" data-noauto="1"></label>
    ${S.pq && !hits.length ? `<div class="mini">${esc(T("pp.noHit"))}</div>` : ""}
    ${hits.length ? `<ul class="flist">${hits.map(p => `<li><div class="fhead"><a href="#people/${esc(p.id)}" data-act="open-person" data-id="${esc(p.id)}"><b>${esc(p.name || T("common.noName"))}</b></a> <span class="tag">${esc(T("pkind." + p.kind))}</span>${p.has_account ? ` <span class="tag open">${esc(T("pp.hasAccount"))}</span>` : ""}</div><div class="fmeta">${esc(p.school || "")}${p.grad_year ? "・" + esc(String(p.grad_year)) : ""}</div></li>`).join("")}</ul>` : ""}</div>`;
  const dupHTML = sectionHTML(T("pp.dups", { n: dups.length }), dups.length ? `<div class="mini">${esc(T("pp.dupsHint"))}</div><ul class="flist">${dups.map(d => `<li><div class="fhead"><b>${esc(d.a_name)}</b> <span class="mini">${esc(T("pkind." + d.a_kind))}${d.a_school ? "・" + esc(d.a_school) : ""}</span> ＝? <b>${esc(d.b_name)}</b> <span class="mini">${esc(T("pkind." + d.b_kind))}${d.b_school ? "・" + esc(d.b_school) : ""}</span></div>
      <div class="fmeta"><button class="btn ghost sm" data-act="merge" data-keep="${esc(d.a)}" data-drop="${esc(d.b)}"${S.busy ? " disabled" : ""}>${esc(T("pp.mergeInto", { name: d.a_name }))}</button> <button class="btn ghost sm" data-act="merge" data-keep="${esc(d.b)}" data-drop="${esc(d.a)}"${S.busy ? " disabled" : ""}>${esc(T("pp.mergeInto", { name: d.b_name }))}</button> <a class="lnk" href="#people/${esc(d.a)}" data-act="open-person" data-id="${esc(d.a)}">${esc(T("pp.look"))}</a></div></li>`).join("")}</ul>` : `<div class="mini">${esc(T("pp.noDups"))}</div>`);
  const add = b.can_manage ? sectionHTML(T("pp.add"), `<div data-padd><div class="two"><label><i>${esc(T("person.nameZh"))}</i><input name="name_zh" maxlength="60"></label><label><i>${esc(T("person.nameEn"))}</i><input name="name_en" maxlength="60"></label></div>
      <div class="two"><label><i>${esc(T("person.email"))}</i><input name="email" type="email" maxlength="120"></label><label><i>${esc(T("person.kind"))}</i>${sel("kind", ["student", "guest", "member"].map(k => [k, T("pkind." + k)]), "student")}</label></div>
      <div class="two"><label><i>${esc(T("person.school"))}</i><input name="school" maxlength="80"></label><label><i>${esc(T("person.gradYear"))}</i><input name="grad_year" type="number" min="2000" max="2100"></label></div>
      <div class="form-foot"><button class="btn sm" data-act="person-add"${S.busy ? " disabled" : ""}>${esc(T("pp.addBtn"))}</button><span class="mini">${esc(T("pp.addHint"))}</span></div></div>`) : "";
  return pageHead(T("pp.title"), T("pp.lede"), []) + msgHTML(S.msg) + search + dupHTML + add;
}
// 一個人的時間軸。
export function personHTML(d, S) {
  const p = d.person || {}, manage = !!(S.boot && S.boot.can_manage), pres = !!(S.me && S.me.pres);
  const head = pageHead(`${esc(p.name || T("common.noName"))} <span class="tag">${esc(T("pkind." + p.kind))}</span>${p.forgotten_at ? ` <span class="tag closed">${esc(T("person.forgotten"))}</span>` : ""}`,
    `${p.name_zh && p.name_en ? esc(p.name_zh) + "・" : ""}${esc(p.school || "")}${p.grad_year ? "・" + esc(String(p.grad_year)) : ""}${p.has_account ? "・" + esc(T("pp.hasAccount")) + (p.role ? ` (${esc(p.role)})` : "") : ""}`, [], { act: "back-people", label: T("person.back") });
  const edit = manage && !p.forgotten_at ? sectionHTML(T("person.edit"), `<div data-pedit><div class="two"><label><i>${esc(T("person.nameZh"))}</i><input name="name_zh" value="${esc(p.name_zh || "")}" maxlength="60"></label><label><i>${esc(T("person.nameEn"))}</i><input name="name_en" value="${esc(p.name_en || "")}" maxlength="60"></label></div>
      <div class="two"><label><i>${esc(T("person.school"))}</i><input name="school" value="${esc(p.school || "")}" maxlength="80"></label><label><i>${esc(T("person.gradYear"))}</i><input name="grad_year" type="number" min="2000" max="2100" value="${esc(p.grad_year || "")}"></label></div>
      <div class="two"><label><i>${esc(T("person.kind"))}</i>${sel("kind", ["student", "guest", "member"].map(k => [k, T("pkind." + k)]), p.kind, !!p.has_account)}</label><label><i>${esc(T("person.addEmail"))}</i><input name="email" type="email" maxlength="120"></label></div>
      <label><i>${esc(T("person.note"))}</i><input name="note" value="${esc(p.note || "")}" maxlength="500"></label>
      <div class="form-foot"><button class="btn sm" data-act="person-save"${S.busy ? " disabled" : ""}>${esc(T("common.save"))}</button></div></div>
    ${(d.identities || []).length ? `<div class="mini">${esc(T("person.identities"))}${esc(T("punct.colon"))}${d.identities.map(i => `${esc(i.kind)} ${esc(i.value)}${i.verified ? " ✓" : ""}`).join(esc(T("punct.list")))}</div>` : ""}`) : "";
  const pos = (d.positions || []);
  const posHTML = pos.length ? sectionHTML(T("person.positions"), `<ul class="flist">${pos.map(x => `<li><b>${esc(x.term)}</b>・${esc((lang() === "zh" ? x.title_zh : x.title_en) || x.title_en || x.title_zh || "")}${x.team ? "・" + esc(x.team) : ""}</li>`).join("")}</ul>`) : "";
  const parts = d.participation || [];
  const partHTML = sectionHTML(T("person.participation", { n: parts.length }), parts.length ? `<ul class="flist">${parts.map(x => `<li><div class="fhead"><a href="#overview/${esc(x.event_id)}" data-act="open-event" data-id="${esc(x.event_id)}"><b>${esc(x.event)}</b></a> ${kindTag(x.kind)}</div><div class="fmeta">${esc(fmtDay(x.starts_at))}${x.term_id ? "・" + esc(x.term_id) : ""}・${esc(T("prole." + x.role))}・${esc(T("pstatus." + x.status))}</div></li>`).join("")}</ul>` : `<div class="mini">${esc(T("person.noParts"))}</div>`);
  const pairs = d.pairs || [];
  const pairHTML = pairs.length ? sectionHTML(T("person.pairs"), `<ul class="flist">${pairs.map(x => `<li><div class="fhead"><b>${esc(x.event || "")}</b>・${esc(x.as === "mentor" ? "Mentor" : "Mentee")}</div><div class="fmeta">${esc(T("person.pairWith"))} ${x.with_id ? `<a href="#people/${esc(x.with_id)}" data-act="open-person" data-id="${esc(x.with_id)}">${esc(x.with || "")}</a>` : esc(T("pair.forgotten"))}${x.matched_on ? "・" + esc(x.matched_on) : ""}${x.ended_on ? "・" + esc(x.ended_on) + " " + esc(T("pend." + (x.end_reason || "other"))) : ""}</div></li>`).join("")}</ul>`) : "";
  const outs = d.outcomes || [];
  const outHTML = sectionHTML(T("person.outcomes", { n: outs.length }), `${outs.length ? `<ul class="flist">${outs.map(o => `<li><div class="fhead"><b>${esc(T("okind." + o.kind))}</b> ${o.institution ? esc(o.institution) : ""}${o.year ? ` <span class="mini">${esc(String(o.year))}</span>` : ""}</div><div class="fmeta">${[o.country, o.major, o.note].filter(Boolean).map(esc).join("・")}・<span class="mini">${esc(T("vis." + o.visibility))}・${esc(T("osrc." + o.source))}</span>${manage ? ` <button class="btn quiet sm" data-act="out-del" data-id="${esc(o.id)}">${esc(T("common.delete"))}</button>` : ""}</div></li>`).join("")}</ul>` : `<div class="mini">${esc(T("person.noOutcomes"))}</div>`}
    ${manage && !p.forgotten_at ? `<div class="card inline-form" data-oadd><h2>${esc(T("out.add"))}</h2><div class="two"><label><i>${esc(T("out.kind"))}</i>${sel("kind", OKINDS.map(k => [k, T("okind." + k)]), "admitted")}</label><label><i>${esc(T("out.year"))}</i><input name="year" type="number" min="2000" max="2100"></label></div>
      <div class="two"><label><i>${esc(T("out.institution"))}</i><input name="institution" maxlength="120"></label><label><i>${esc(T("out.country"))}</i><input name="country" maxlength="60"></label></div>
      <div class="two"><label><i>${esc(T("out.major"))}</i><input name="major" maxlength="80"></label><label><i>${esc(T("out.visibility"))}</i>${sel("visibility", VIS.map(v => [v, T("vis." + v)]), "internal")}</label></div>
      <div class="form-foot"><button class="btn sm" data-act="out-add"${S.busy ? " disabled" : ""}>${esc(T("out.addBtn"))}</button><span class="mini">${esc(T("out.addHint"))}</span></div></div>` : ""}`);
  const resp = d.responses || [];
  const respHTML = resp.length ? sectionHTML(T("person.responses", { n: resp.length }), `<ul class="flist">${resp.map(r => `<li><div class="fhead"><a href="#forms/${esc(r.form_id)}/results" data-act="open-form" data-id="${esc(r.form_id)}"><b>${esc(r.title)}</b></a> <span class="mini">${esc(fmtWhen(r.submitted_at))}</span></div><div class="fmeta">${(r.answers || []).map(a => `${esc(a.key || a.label)}: ${esc(a.value)}`).join("・")}</div></li>`).join("")}</ul>`) : "";
  const forget = pres && !p.forgotten_at ? sectionHTML(T("person.remove"), `<div class="mini">${esc(T(p.has_account ? "person.removeAccount" : "person.removeHint"))}</div>${p.has_account ? "" : `<div class="form-foot"><button class="btn quiet sm" data-act="forget" data-id="${esc(p.id)}">${esc(T("person.forget"))}</button></div>`}`) : "";
  return head + msgHTML(S.msg) + edit + posHTML + partHTML + pairHTML + outHTML + respHTML + forget;
}
// 年度比較。
export function yearlyHTML(rows, msg) {
  const rs = rows || [];
  const body = rs.map(r => `<tr><td><b>${esc(r.term_id || T("ov.noTerm"))}</b></td><td>${kindTag(r.kind)}</td><td>${r.events}</td><td>${r.attended}/${r.registered}</td><td>${r.responses}</td><td>${esc(fmtNum(r.recommend_avg))}</td><td>${esc(fmtNum(r.useful_avg))}</td>
    <td>${(r.changes || []).map(c => `<div class="mini"><b>${esc(c.event)}</b>: ${esc(c.we_change)}${c.change_happened === true ? " ✓" : c.change_happened === false ? " ✗" : ""}</div>`).join("")}</td></tr>`).join("");
  return pageHead(T("yr.title"), T("yr.lede"), rs.length ? [{ act: "yr-csv", label: T("res.csv") }] : []) + msgHTML(msg)
    + (rs.length ? `<div class="tf-scroll"><table class="table rc-table"><thead><tr><th>${esc(T("ev.term"))}</th><th>${esc(T("ev.kind"))}</th><th>${esc(T("yr.events"))}</th><th>${esc(T("num.attendance"))}</th><th>${esc(T("num.responses"))}</th><th>${esc(T("num.recommend"))}</th><th>${esc(T("num.useful"))}</th><th>${esc(T("yr.changes"))}</th></tr></thead><tbody>${body}</tbody></table></div>`
      : emptyHTML(T("yr.none"), esc(T("yr.noneHint"))))
    + `<div class="note">${esc(T("yr.note"))}</div>`;
}
