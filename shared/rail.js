// 後台的側欄：一份，八個後台資料夾都用它（2026-11-13，Paul 同意把 8 份一模一樣的副本收成這一支）。
//
// 為什麼長這樣（docs/2026-11-13-後台重整.md 有完整理由與研究出處）：
//   Paul 2026-11-13：「我知道東西在哪是因為是我做的，他們不會知道」。舊側欄照「程式放在哪個資料夾」分段，
//   同一件事出現兩行（「請 Marketing 做」與「Marketing 的待辦」、「要填的內部表單」與「建內部表單」）。
//   新的規則：
//     1. 側欄一行 = 一個「東西」（活動、表單、行銷、網站、人……），名字是名詞，跟點進去那一頁的標題一樣。
//     2. 那個東西底下的頁面變成內容區上方的一排分頁（areaTabsHTML），不再是側欄裡的好幾行。
//     3. 進不去的那一頁不畫；一頁都進不去的那一行整行不畫。不要給人看一個打不開的東西。
//     4. 「我自己的」（首頁、行事曆、護照、時間看板）在頂欄（shared/nav.js），側欄只放 BT 的事。
//
// 這一支只決定「畫什麼、連到哪」。**真正的門在每一頁 main.js 開頁第一句，以及資料庫的函式與 RLS。**
// 依賴方向：這一支不 import 任何東西（純資料與純函式），所以任何頁面都能用它。
// 要加一頁：在 ITEMS 加一行（group、key、area、label、who），那一個資料夾的 main.js 接 data-act="tab" data-t="<key>"。
// 要加一個側欄的「東西」：在 AREAS 加一行。

const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const tx = (row, L) => (row && typeof row === "object") ? (row[L] != null ? row[L] : (row.en != null ? row.en : row.zh)) : String(row == null ? "" : row);

// 側欄自己的字。只有這幾句；頁面上的字在各資料夾的 strings.js。
const RT = {
  menu:     { zh: "後台選單", en: "Admin menu" },
  open:     { zh: "展開後台選單", en: "Open the admin menu" },
  groups:   { zh: "後台", en: "Admin" },
  tabs:     { zh: "這一區的分頁", en: "Pages in this section" },
  lang:     { zh: "語言", en: "Language" },
  noTeam:   { zh: "還沒填 team", en: "no team yet" },
  allTeams: { zh: "全部 team", en: "all teams" },
  list:     { zh: "、", en: ", " },
};
const BOARD = {
  member: { zh: "Associate", en: "Associate" }, adviser: { zh: "顧問", en: "Adviser" }, director: { zh: "Director", en: "Director" },
  senior_adviser: { zh: "Senior Adviser", en: "Senior Adviser" }, president: { zh: "Co-President", en: "Co-President" },
};
export const boardName = (board, L) => tx(BOARD[board] || BOARD.member, L);

// 一條連結帶上 ?lang=，放在 # 前面（跟各資料夾 strings.js 的 withLang 同一條規則）。
export function withLang(href, L) {
  const s = String(href || "");
  if (!L || /[?&]lang=/.test(s)) return s;
  const i = s.indexOf("#");
  const base = i < 0 ? s : s.slice(0, i), hash = i < 0 ? "" : s.slice(i);
  return base + (base.includes("?") ? "&" : "?") + "lang=" + L + hash;
}

// 八個資料夾（網址不變）。who 是進不進得了那個資料夾，跟每一頁 main.js 開頁那一句一致。
export const GROUPS = [
  { key: "forms",     href: "/admin/",            who: "cadre" },
  { key: "site",      href: "/admin/site/",       who: "cadre" },
  { key: "passports", href: "/admin/passports/",  who: "ws:passport|intern-passport" },
  { key: "people",    href: "/admin/people/",     who: "senior" },
  // 財務：my_access() 在 finance 那一格填 view 或 edit（2026-11-08-finance.sql）。
  { key: "finance",   href: "/admin/finance/",    who: "ws:finance" },
  { key: "marketing", href: "/admin/marketing/",  who: "ws:res:Marketing Team|custom:marketing-requests|custom:marketing-approve" },
  { key: "teamforms", href: "/admin/team-forms/", who: "cadre" },
  // Records：my_access() 的 records 那一格（2026-12-01-records.sql）。
  { key: "records",   href: "/admin/records/",    who: "ws:records" },
];

// 側欄上的「東西」。sec 是哪一段（"" 是最上面那一行）。順序就是側欄的順序。
const ICON = {
  todo:      '<path d="M9 11l2 2 4-4"/><rect x="4" y="4" width="16" height="16" rx="3"/>',
  events:    '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  meetings:  '<circle cx="8" cy="9" r="3"/><circle cx="16" cy="9" r="3"/><path d="M2 20a6 6 0 0 1 12 0M10 20a6 6 0 0 1 12 0"/>',
  forms:     '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h4"/>',
  marketing: '<path d="M3 11v2a1 1 0 0 0 1 1h3l5 4V6L7 10H4a1 1 0 0 0-1 1z"/><path d="M16 9a4 4 0 0 1 0 6"/>',
  passports: '<rect x="5" y="3" width="14" height="18" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M9 17h6"/>',
  website:   '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  people:    '<circle cx="9" cy="8" r="3"/><path d="M3 20a6 6 0 0 1 12 0"/><circle cx="17" cy="9" r="2.5"/><path d="M15 20a5 5 0 0 1 6-4.6"/>',
  records:   '<path d="M4 20V4M4 20h16M8 16v-5M12 16V8M16 16v-3M20 16V6"/>',
  money:     '<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M7 12h.01M17 12h.01"/>',
};
export const SECTIONS = [
  { key: "",    label: null },
  { key: "work", label: { zh: "做事", en: "Run BT" } },
  { key: "org",  label: { zh: "組織", en: "Organisation" } },
];
export const AREAS = [
  { key: "todo",      sec: "",     label: { zh: "待辦",     en: "To do" },      hint: { zh: "你管的地方有什麼在等你", en: "What's waiting in the areas you run" } },
  { key: "events",    sec: "work", label: { zh: "活動",     en: "Events" },     hint: { zh: "每一場、場地、計畫與招募", en: "Every event, venues, programs and recruitment" } },
  { key: "meetings",  sec: "work", label: { zh: "會議",     en: "Meetings" },   hint: { zh: "排過的會、會議紀錄", en: "Scheduled meetings and notes" } },
  { key: "forms",     sec: "work", label: { zh: "表單",     en: "Forms" },      hint: { zh: "要填的、內部表單、回饋表", en: "To fill, internal forms, feedback forms" } },
  { key: "marketing", sec: "work", label: { zh: "行銷",     en: "Marketing" },  hint: { zh: "需求單、大學介紹貼文、IG", en: "Requests, college posts, Instagram" } },
  { key: "website",   sec: "work", label: { zh: "對外網站", en: "Website" },    hint: { zh: "資源、團隊頁、校友故事、信", en: "Resources, team page, stories, emails" } },
  { key: "passports", sec: "work", label: { zh: "護照",     en: "Passports" },  hint: { zh: "幹部護照、實習護照", en: "Cadre and intern passports" } },
  { key: "people",    sec: "org",  label: { zh: "人與權限", en: "People" },     hint: { zh: "名單、邀請、誰能改什麼", en: "Roster, invites, who can edit what" } },
  { key: "records",   sec: "org",  label: { zh: "紀錄",     en: "Records" },    hint: { zh: "記分卡、每個人、年度比較", en: "Scorecards, everyone, year by year" } },
  { key: "money",     sec: "org",  label: { zh: "錢",       en: "Money" },      hint: { zh: "收支、預算、匯出", en: "Income, spending, budget" } },
];

// 每一頁。group 是在哪個資料夾，key 是那個資料夾裡的分頁（#key），area 是側欄上的哪一行。
// who 決定畫不畫：cadre / president / senior / "ws:a|b"（被派進其中任何一個工作區，或 senior）。
// 同一個 area 裡的順序就是上方分頁的順序；第一個看得到的是側欄那一行點下去的地方。
export const ITEMS = [
  { group: "forms",     key: "home",       area: "todo",      who: "cadre",  label: { zh: "待辦", en: "To do" } },
  // 活動（2026-11-10 Paul：「application should live under events」）
  { group: "forms",     key: "events",     area: "events",    who: "cadre",  label: { zh: "活動", en: "Events" } },
  { group: "forms",     key: "venues",     area: "events",    who: "cadre",  label: { zh: "場地", en: "Venues" } },
  { group: "forms",     key: "forms",      area: "events",    who: "cadre",  label: { zh: "計畫與招募", en: "Programs & recruitment" } },
  { group: "forms",     key: "meetings",   area: "meetings",  who: "cadre",  label: { zh: "會議", en: "Meetings" } },
  // 會議範本（2026-11-13）：只有改得動的人看得到這一頁；其他人在記會議的下拉選單裡選得到範本。
  { group: "forms",     key: "mtemplates", area: "meetings",  who: "ws:custom:meeting-templates", label: { zh: "範本", en: "Templates" } },
  // 表單：要填的、內部表單、回饋表放在同一排（2026-11-13 Paul：「建內部表單」與「要填的」並排兩行很亂）
  { group: "teamforms", key: "fill",       area: "forms",     who: "cadre",  label: { zh: "要我填的", en: "To fill" } },
  { group: "teamforms", key: "build",      area: "forms",     who: "ws:team-forms", label: { zh: "內部表單", en: "Internal forms" } },
  { group: "records",   key: "forms",      area: "forms",     who: "ws:records",    label: { zh: "回饋表", en: "Feedback forms" } },
  // 行銷：需求單一頁（送單、我送的、Marketing 的待辦都在這一頁，2026-11-13 Paul）
  { group: "forms",     key: "request",    area: "marketing", who: "cadre",  label: { zh: "需求單", en: "Requests" } },
  { group: "marketing", key: "posts",      area: "marketing", who: "ws:res:Marketing Team|custom:marketing-requests|custom:marketing-approve", label: { zh: "大學介紹貼文", en: "College intro posts" } },
  { group: "marketing", key: "ig",         area: "marketing", who: "ws:res:Marketing Team|custom:marketing-requests|custom:marketing-approve", label: { zh: "Instagram", en: "Instagram" } },
  { group: "site",      key: "history",    area: "marketing", who: "cadre",  label: { zh: "BT 歷史之路", en: "History road" } },
  // 對外網站
  { group: "site",      key: "events",     area: "website",   who: "senior", label: { zh: "網站上的活動", en: "Events on the site" } },
  { group: "site",      key: "res",        area: "website",   who: "cadre",  label: { zh: "資源庫", en: "Resources" } },
  { group: "site",      key: "team",       area: "website",   who: "senior", label: { zh: "團隊頁", en: "Team page" } },
  // 校友故事的清單 stories_for_review() 只回給 Co-President（2026-09-19），Senior Adviser 看到的會是空的，所以這裡也只給 Co-President。
  { group: "site",      key: "stories",    area: "website",   who: "president", label: { zh: "校友故事", en: "Alumni stories" } },
  { group: "site",      key: "mail",       area: "website",   who: "senior", label: { zh: "信的文字", en: "Email wording" } },
  // 護照
  { group: "passports", key: "cadre",      area: "passports", who: "ws:passport",        label: { zh: "幹部護照", en: "Cadre passport" } },
  { group: "passports", key: "cities",     area: "passports", who: "ws:passport",        label: { zh: "入境章的城市", en: "Entry-stamp cities" } },
  { group: "passports", key: "interns",    area: "passports", who: "ws:intern-passport", label: { zh: "實習護照", en: "Intern passport" } },
  { group: "passports", key: "board",      area: "passports", who: "ws:intern-passport", label: { zh: "實習的蛇梯棋", en: "Intern game board" } },
  // 人與權限
  { group: "people",    key: "roster",     area: "people",    who: "senior", label: { zh: "幹部名單", en: "Roster" } },
  { group: "people",    key: "invites",    area: "people",    who: "senior", label: { zh: "邀請新的人", en: "Invite people" } },
  { group: "people",    key: "workspaces", area: "people",    who: "senior", label: { zh: "誰能改什麼", en: "Who can edit what" } },
  { group: "people",    key: "terms",      area: "people",    who: "senior", label: { zh: "屆別", en: "Years (terms)" } },
  // 變動紀錄 role_changes 的 RLS 只給 Co-President（2026-10-21），Senior Adviser 點進去會是空的。
  { group: "people",    key: "changes",    area: "people",    who: "president", label: { zh: "誰改了什麼", en: "Change log" } },
  // 紀錄
  { group: "records",   key: "overview",   area: "records",   who: "ws:records", label: { zh: "活動記分卡", en: "Event scorecards" } },
  { group: "records",   key: "people",     area: "records",   who: "ws:records", label: { zh: "所有人", en: "Everyone" } },
  { group: "records",   key: "yearly",     area: "records",   who: "ws:records", label: { zh: "年度比較", en: "Year by year" } },
  // 錢
  { group: "finance",   key: "overview",   area: "money",     who: "ws:finance", label: { zh: "總覽", en: "Overview" } },
  { group: "finance",   key: "tx",         area: "money",     who: "ws:finance", label: { zh: "收支紀錄", en: "Transactions" } },
  { group: "finance",   key: "accounts",   area: "money",     who: "ws:finance", label: { zh: "帳戶與類別", en: "Accounts & categories" } },
  { group: "finance",   key: "budget",     area: "money",     who: "ws:finance", label: { zh: "預算", en: "Budget" } },
  { group: "finance",   key: "export",     area: "money",     who: "ws:finance", label: { zh: "匯出", en: "Export" } },
];

// ── 誰看得到 ──────────────────────────────────────────────────────────
// me = { role, board, team, name, ws }。ws 是 my_access() 回的 { 工作區: 等級 }。
export const senior = me => !!me && me.role === "cadre" && (me.board === "president" || me.board === "senior_adviser");
export function allowed(who, me) {
  if (!me || me.role !== "cadre") return false;
  if (who === "cadre") return true;
  if (who === "president") return me.board === "president";
  // senior 是 Co-President 加 Senior Adviser（跟資料庫的 is_senior() 同一條規則）。
  if (who === "senior") return senior(me);
  if (String(who).startsWith("ws:")) return senior(me) || who.slice(3).split("|").some(id => !!(me.ws || {})[id]);
  return false;
}
export function wsLevel(me, id) { return senior(me) ? "manage" : String((me && me.ws || {})[id] || ""); }
export const canEditWs = (me, id) => ["edit", "manage"].includes(wsLevel(me, id));
export const canEditAny = (me, prefix) => senior(me) || Object.entries((me && me.ws) || {}).some(([id, lv]) => id.startsWith(prefix) && ["edit", "manage"].includes(lv));
export function canEnter(g, me) { return !!g && allowed(g.who, me); }
export function canSee(item, me) { return !!item && allowed(item.who, me) && canEnter(GROUPS.find(g => g.key === item.group), me); }

// 這一頁是哪一個 item：group 與 tab 對得上的那一個。對不上（例如活動裡的一場）就回 null。
export const itemOf = (group, tab) => ITEMS.find(i => i.group === group && i.key === tab) || null;
export const areaOf = (group, tab) => { const it = itemOf(group, tab); return it ? it.area : ""; };
export const visibleItems = (area, me) => ITEMS.filter(i => i.area === area && canSee(i, me));

// 一個 item 的連結：同一個資料夾用 #key 不重新載入（data-act="tab"），別的資料夾是一般連結。
function linkAttrs(it, group, L) {
  if (it.group === group) return `href="#${esc(it.key)}" data-act="tab" data-t="${esc(it.key)}"`;
  return `href="${esc(withLang(`${GROUPS.find(g => g.key === it.group).href}#${it.key}`, L))}"`;
}

// ── 側欄 ──────────────────────────────────────────────────────────────
// group 是現在在哪個資料夾，tab 是哪一頁，counts 是 { <item key>: 數字 }（有才顯示，一個東西的數字是它底下幾頁加起來）。
const svg = d => `<svg class="rail-ico" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
export function railHTML(group, tab, me, counts, L) {
  const c = counts || {};
  const here = areaOf(group, tab);
  const row = a => {
    const items = visibleItems(a.key, me);
    if (!items.length) return "";
    const first = items[0], on = a.key === here;
    const n = items.reduce((s, i) => s + (Number(c[i.key]) || 0), 0);
    return `<a class="rail-item rail-area${on ? " on" : ""}" ${linkAttrs(first, group, L)}${on ? ' aria-current="page"' : ""}>${svg(ICON[a.key] || "")}<span class="rail-txt"><b>${esc(tx(a.label, L))}</b><small>${esc(tx(a.hint, L))}</small></span>${n ? `<span class="rail-count">${esc(String(n))}</span>` : ""}</a>`;
  };
  const body = SECTIONS.map(s => {
    const rows = AREAS.filter(a => a.sec === s.key).map(row).join("");
    if (!rows) return "";
    return (s.label ? `<div class="rail-group">${esc(tx(s.label, L))}</div>` : "") + rows;
  }).join("");
  const teams = senior(me) ? [tx(RT.allTeams, L)] : String(me && me.team || "").split(/[,、;；]/).map(s => s.trim()).filter(Boolean);
  return `<input class="rail-toggle" type="checkbox" id="rail-toggle" aria-label="${esc(tx(RT.open, L))}">
  <label class="rail-burger" for="rail-toggle">${esc(tx(RT.menu, L))}</label>
  <nav class="rail" aria-label="${esc(tx(RT.groups, L))}">
    <div class="rail-me"><b>${esc(me && me.name || "")}</b>
      <span>${esc(boardName(me && me.board, L))}・${teams.length ? esc(teams.join(tx(RT.list, L))) : esc(tx(RT.noTeam, L))}</span></div>
    ${langSwitchHTML(L)}
    ${body}
  </nav>`;
}

// 內容區最上面那一排分頁：現在這一行（area）底下看得到的每一頁。只有一頁就不畫。
export function areaTabsHTML(group, tab, me, L) {
  const it = itemOf(group, tab);
  if (!it) return "";
  const items = visibleItems(it.area, me);
  if (items.length < 2) return "";
  return `<nav class="area-tabs" aria-label="${esc(tx(RT.tabs, L))}">${items.map(i => {
    const on = i === it;
    return `<a class="area-tab${on ? " on" : ""}" ${linkAttrs(i, group, L)}${on ? ' aria-current="page"' : ""}>${esc(tx(i.label, L))}</a>`;
  }).join("")}</nav>`;
}

// 中英切換：兩顆小按鈕，現在的那一顆亮著。字面「中文」「English」刻意不翻。各頁 main.js 接 data-act="lang"。
export function langSwitchHTML(L) {
  const b = l => `<button class="lang${L === l ? " on" : ""}" data-act="lang" data-lang="${l}" aria-pressed="${L === l}">${l === "zh" ? "中文" : "English"}</button>`;
  return `<div class="rail-lang" role="group" aria-label="${esc(tx(RT.lang, L))}">${b("zh")}${b("en")}</div>`;
}

// 整頁的外殼：頂欄在上，底下左側欄、右內容。tabs 是 areaTabsHTML() 畫好的那一排，放在內容最上面。
export function shellHTML(nav, rail, body, tabs) {
  return `${nav}<div class="shell${rail ? "" : " solo"}">${rail || ""}<main class="main">${rail && tabs ? tabs : ""}${body}</main></div>`;
}

// 側欄比螢幕矮的時候自己捲。重畫會把側欄整個換掉，捲到哪先記著再放回去。
let railY = 0;
export function railBefore(root) { const r = root && root.querySelector(".rail"); if (r) railY = r.scrollTop; }
export function railAfter(root) {
  const r = root && root.querySelector(".rail");
  if (!r || r.scrollHeight <= r.clientHeight) return;
  r.scrollTop = railY;
  const on = r.querySelector(".rail-item.on"), b = r.getBoundingClientRect();
  if (on) { const a = on.getBoundingClientRect(); if (a.top < b.top || a.bottom > b.bottom) r.scrollTop += a.top - b.top - 48; }
}
