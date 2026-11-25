// 後台的側欄：一份，八個後台資料夾都用它（2026-11-13，Paul 同意把 8 份一模一樣的副本收成這一支）。
//
// 為什麼長這樣（docs/2026-11-13-後台重整.md 有完整理由與研究出處）：
//   Paul 2026-11-13：「我知道東西在哪是因為是我做的，他們不會知道」。舊側欄照「程式放在哪個資料夾」分段，
//   同一件事出現兩行（「請 Marketing 做」與「Marketing 的待辦」、「要填的內部表單」與「建內部表單」）。
//   新的規則：
//     1. 側欄一行 = 一個「東西」（活動、表單、行銷、網站、人……），名字是名詞，跟點進去那一頁的標題一樣。
//     2. 那個東西底下的頁面變成內容區上方的一排分頁（areaTabsHTML），不再是側欄裡的好幾行。
//     3. 進不去的那一頁不畫；一頁都進不去的那一行整行不畫。不要給人看一個打不開的東西。
//     4. 三段（2026-11-14 Paul：「do the new menu and merged home」，計畫第 1 步）：
//        「我的」（首頁、行事曆、我的護照）在最上面，「BT」是大家一起做的事，「組織」是人、紀錄、錢。
//        首頁（/home/）也畫這一條側欄，所以這一支的樣式在 shared/rail.css，不在 admin/admin.css。
//     5. 「我的工作區」（2026-11-23 Paul：「I don't want my members to be confused if they're in two workspaces」）：
//        「我的」底下多一段，一個 team 一行，照這個人被派進哪些工作區畫（不是寫死的清單）。
//        點下去是那個 team 的頁（/home/#team=…）。為什麼、另外兩個沒選的做法：docs/2026-11-23-工作區怎麼分.md。
//
// 這一支只決定「畫什麼、連到哪」。**真正的門在每一頁 main.js 開頁第一句，以及資料庫的函式與 RLS。**
// 依賴方向：這一支不 import 任何東西（純資料與純函式），所以任何頁面都能用它。
// 要加一頁：在 ITEMS 加一行（group、key、area、label、who），那一個資料夾的 main.js 接 data-act="tab" data-t="<key>"。
// 要加一個側欄的「東西」：在 AREAS 加一行。

const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const tx = (row, L) => (row && typeof row === "object") ? (row[L] != null ? row[L] : (row.en != null ? row.en : row.zh)) : String(row == null ? "" : row);

// 側欄自己的字。只有這幾句；頁面上的字在各資料夾的 strings.js。
const RT = {
  // 手機上側欄收成一顆鈕。頂欄自己也有一顆「選單」，所以這一顆不能也叫選單（2026-11-14）。
  menu:     { zh: "所有頁面", en: "All pages" },
  open:     { zh: "展開所有頁面", en: "Show all pages" },
  groups:   { zh: "BT 的選單", en: "BT menu" },
  tabs:     { zh: "這一區的分頁", en: "Pages in this section" },
  lang:     { zh: "語言", en: "Language" },
  noTeam:   { zh: "還沒填 team", en: "no team yet" },
  allTeams: { zh: "全部 team", en: "all teams" },
  list:     { zh: "、", en: ", " },
  // 我的工作區（2026-11-23）
  wsNone:   { zh: "你還沒被派進任何 team。找你的 Director 或 Co-President。", en: "You are not in a team yet. Ask your Director or a Co-President." },
  wsRank:   { zh: "你是 {rank}，每個 team 都進得去。", en: "You are {rank}, so every team is open to you." },
  wsOver:   { zh: "總覽", en: "Overview" },
  lvView:   { zh: "看", en: "View" },
  lvEdit:   { zh: "改", en: "Edit" },
  lvManage: { zh: "管", en: "Manage" },
  lvSome:   { zh: "部分", en: "Some" },
  lvTip:    { zh: "你在這個 team 的等級：{lv}", en: "Your level on this team: {lv}" },
  lvSomeTip:{ zh: "這個 team 只開了幾樣給你，點進去看是哪幾樣", en: "Only some of this team's things are open to you. Open it to see which." },
  lvViewTip:{ zh: "你沒被派進這個 team 的工作區，裡面的東西只能看", en: "You are not assigned to this team's workspace, so you can only look." },
  people:   { zh: "誰在這裡", en: "People here" },
  peopleT:  { zh: "這一區的成員：加人、改看／改／管、移出", en: "Who works here: add people, set View / Edit / Manage, remove" },
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
  // 「我的」那一段（2026-11-14）：首頁與行事曆是 /home/，時間看板與護照各自一個資料夾。這三個資料夾每一位幹部都進得去。
  { key: "home",         href: "/home/",         who: "cadre" },
  { key: "availability", href: "/availability/", who: "cadre" },
  { key: "passport",     href: "/passport/",     who: "cadre" },
  { key: "forms",     href: "/admin/",            who: "cadre" },
  { key: "site",      href: "/admin/site/",       who: "cadre" },
  { key: "passports", href: "/admin/passports/",  who: "ws:passport|intern-passport" },
  { key: "people",    href: "/admin/people/",     who: "senior" },
  // 財務：my_access() 在 finance 那一格填 view 或 edit（2026-11-08-finance.sql）。
  { key: "finance",   href: "/admin/finance/",    who: "ws:finance" },
  { key: "marketing", href: "/admin/marketing/",  who: "ws:res:Marketing Team|custom:marketing-requests" },
  { key: "teamforms", href: "/admin/team-forms/", who: "cadre" },
  // Records：my_access() 的 records 那一格（2026-12-01-records.sql）。
  { key: "records",   href: "/admin/records/",    who: "ws:records" },
];

// 側欄上的「東西」。sec 是哪一段（"" 是最上面那一行）。順序就是側欄的順序。
const ICON = {
  home:      '<path d="M4 11l8-7 8 7v9a1 1 0 0 1-1 1h-5v-6h-4v6H5a1 1 0 0 1-1-1z"/>',
  calendar:  '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4M8 14h2M12 14h2M8 17h2"/>',
  mypassport:'<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 11l2 2 4-4"/><path d="M9 17h6"/>',
  events:    '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  meetings:  '<circle cx="8" cy="9" r="3"/><circle cx="16" cy="9" r="3"/><path d="M2 20a6 6 0 0 1 12 0M10 20a6 6 0 0 1 12 0"/>',
  forms:     '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h4"/>',
  marketing: '<path d="M3 11v2a1 1 0 0 0 1 1h3l5 4V6L7 10H4a1 1 0 0 0-1 1z"/><path d="M16 9a4 4 0 0 1 0 6"/>',
  passports: '<rect x="5" y="3" width="14" height="18" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M9 17h6"/>',
  website:   '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  people:    '<circle cx="9" cy="8" r="3"/><path d="M3 20a6 6 0 0 1 12 0"/><circle cx="17" cy="9" r="2.5"/><path d="M15 20a5 5 0 0 1 6-4.6"/>',
  records:   '<path d="M4 20V4M4 20h16M8 16v-5M12 16V8M16 16v-3M20 16V6"/>',
  money:     '<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M7 12h.01M17 12h.01"/>',
  venues:    '<path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  team:      '<path d="M5 21V4M5 5h11l-2 3.5 2 3.5H5"/>',
};
export const SECTIONS = [
  { key: "me",   label: { zh: "我的", en: "Me" } },
  // 我的工作區（2026-11-23）：這一段的行不在 AREAS 裡，是照人畫的，見下面 myTeams() 與 teamRowsHTML()。
  { key: "ws",   label: { zh: "我的工作區", en: "My workspaces" } },
  { key: "work", label: { zh: "BT", en: "BT" } },
  { key: "org",  label: { zh: "組織", en: "Organization" } },
];
export const AREAS = [
  { key: "home",      sec: "me",   label: { zh: "首頁",     en: "Home" },       hint: { zh: "等你處理的事，照日期排", en: "Everything waiting for you, by date" } },
  { key: "calendar",  sec: "me",   label: { zh: "行事曆",   en: "Calendar" },   hint: { zh: "會議、時間看板、會議範本", en: "Meetings, availability, templates" } },
  { key: "mypassport",sec: "me",   label: { zh: "我的護照", en: "My passport" }, hint: { zh: "蓋章與進度", en: "Your stamps and progress" } },
  // 2026-12-26 Paul：工作區 → 專案 → 活動。這一行改叫「專案」，點下去是專案清單；活動、計畫與招募、各 team 在它底下。key 留 events（網址與測試都認它）。
  { key: "events",    sec: "work", label: { zh: "專案",     en: "Projects" },   hint: { zh: "每個 team 的專案、活動、計畫與招募", en: "Every team's projects, events, programs" } },
  { key: "forms",     sec: "work", label: { zh: "表單",     en: "Forms" },      hint: { zh: "要填的、內部表單、回饋表", en: "To fill, internal forms, feedback forms" } },
  { key: "marketing", sec: "work", label: { zh: "行銷",     en: "Marketing" },  hint: { zh: "需求單、大學介紹貼文、IG", en: "Requests, college posts, Instagram" } },
  { key: "website",   sec: "work", label: { zh: "對外網站", en: "Website" },    hint: { zh: "資源、團隊頁、校友故事、信", en: "Resources, team page, stories, emails" } },
  { key: "passports", sec: "work", label: { zh: "護照",     en: "Passports" },  hint: { zh: "幹部護照、實習護照", en: "Cadre and intern passports" } },
  { key: "people",    sec: "org",  label: { zh: "人與權限", en: "People" },     hint: { zh: "名單、邀請、工作區", en: "Roster, invites, workspaces" } },
  { key: "records",   sec: "org",  label: { zh: "紀錄",     en: "Records" },    hint: { zh: "活動、人、年度比較", en: "Events, people, year by year" } },
  { key: "money",     sec: "org",  label: { zh: "錢",       en: "Money" },      hint: { zh: "收支、預算、匯出", en: "Income, spending, budget" } },
  // 場地是整個 BT 的（2026-12-26 Paul：「venue, records, money … whole BT」）。誰改得動不變：開得了活動的人照舊改得動。
  { key: "venues",    sec: "org",  label: { zh: "場地",     en: "Venues" },     hint: { zh: "場地與聯絡人", en: "Places and contacts" } },
];

// 每一頁。group 是在哪個資料夾，key 是那個資料夾裡的分頁（#key），area 是側欄上的哪一行。
// who 決定畫不畫：cadre / president / senior / "ws:a|b"（被派進其中任何一個工作區，或 senior）。
// 同一個 area 裡的順序就是上方分頁的順序；第一個看得到的是側欄那一行點下去的地方。
// key 是空字串的那幾頁（時間看板、護照）是那個資料夾本身，連結不帶 #。
export const ITEMS = [
  // 我的（2026-11-14）：首頁是 /home/，等你處理的事都在那一頁（以前後台還有一頁「待辦」，兩頁一樣的事，合併了）。
  { group: "home",      key: "home",       area: "home",      who: "cadre",  bare: true, label: { zh: "首頁", en: "Home" } },
  { group: "home",      key: "calendar",   area: "calendar",  who: "cadre",  label: { zh: "行事曆", en: "Calendar" } },
  { group: "forms",     key: "meetings",   area: "calendar",  who: "cadre",  label: { zh: "會議", en: "Meetings" } },
  { group: "availability", key: "",        area: "calendar",  who: "cadre",  label: { zh: "時間看板", en: "Availability" } },
  // 會議範本（2026-11-13）：只有改得動的人看得到這一頁；其他人在記會議的下拉選單裡選得到範本。
  { group: "forms",     key: "mtemplates", area: "calendar",  who: "ws:custom:meeting-templates", ws: "custom:meeting-templates", label: { zh: "會議範本", en: "Templates" } },
  { group: "passport",  key: "",           area: "mypassport", who: "cadre", label: { zh: "我的護照", en: "My passport" } },
  // 活動（2026-11-10 Paul：「application should live under events」）
  { group: "forms",     key: "projects",   area: "events",    who: "cadre",  label: { zh: "專案", en: "Projects" } },
  { group: "forms",     key: "events",     area: "events",    who: "cadre",  label: { zh: "活動", en: "Events" } },
  { group: "forms",     key: "forms",      area: "events",    who: "cadre",  label: { zh: "計畫與招募", en: "Programs & recruitment" } },
  // 各 team（2026-11-14）：以前後台的「待辦」那一頁。待辦搬到首頁之後，這一頁只剩你的權限與每個 team 的東西。
  { group: "forms",     key: "teams",      area: "events",    who: "cadre",  label: { zh: "各 team", en: "Teams" } },
  // 表單：要填的、內部表單、回饋表放在同一排（2026-11-13 Paul：「建內部表單」與「要填的」並排兩行很亂）
  { group: "teamforms", key: "fill",       area: "forms",     who: "cadre",  label: { zh: "要我填的", en: "To fill" } },
  { group: "teamforms", key: "build",      area: "forms",     who: "ws:team-forms", ws: "custom:team-forms", label: { zh: "內部表單", en: "Internal forms" } },
  { group: "records",   key: "forms",      area: "forms",     who: "ws:records", ws: "custom:records",    label: { zh: "回饋表", en: "Feedback forms" } },
  // 行銷：需求單一頁（送單、我送的、Marketing 的待辦都在這一頁，2026-11-13 Paul）
  { group: "forms",     key: "request",    area: "marketing", who: "cadre",  ws: "custom:marketing-requests",  label: { zh: "需求單", en: "Requests" } },
  { group: "marketing", key: "posts",      area: "marketing", who: "ws:res:Marketing Team|custom:marketing-requests", ws: "res:Marketing Team", label: { zh: "大學介紹貼文", en: "College intro posts" } },
  { group: "marketing", key: "ig",         area: "marketing", who: "ws:res:Marketing Team|custom:marketing-requests", ws: "res:Marketing Team", label: { zh: "Instagram", en: "Instagram" } },
  { group: "site",      key: "history",    area: "marketing", who: "cadre",  ws: "res:Marketing Team",  label: { zh: "BT 歷史之路", en: "History road" } },
  // BT 島上的貼文（2026-11-17）：每個 team 自己貼自己那座島的，所以每一位幹部都看得到這一頁；貼得了哪座島看他的工作區。
  { group: "site",      key: "island",     area: "marketing", who: "cadre",  label: { zh: "BT 島的貼文", en: "Island posts" } },
  { group: "site",      key: "island-map", area: "marketing", who: "cadre",  label: { zh: "BT 島", en: "BT Island" } },
  // 對外網站
  { group: "site",      key: "events",     area: "website",   who: "senior", label: { zh: "網站上的活動", en: "Events on the site" } },
  { group: "site",      key: "res",        area: "website",   who: "cadre",  label: { zh: "資源庫", en: "Resources" } },
  { group: "site",      key: "team",       area: "website",   who: "senior", label: { zh: "團隊頁", en: "Team page" } },
  // 校友故事：2026-12-25 起 stories_for_review() 也回給 Senior Adviser（以前只給 Co-President，Senior Adviser 點進去是空的）。
  { group: "site",      key: "stories",    area: "website",   who: "senior", label: { zh: "校友故事", en: "Alumni stories" } },
  { group: "site",      key: "mail",       area: "website",   who: "senior", label: { zh: "信的文字", en: "Email wording" } },
  // 護照
  { group: "passports", key: "cadre",      area: "passports", who: "ws:passport", ws: "passport",        label: { zh: "幹部護照", en: "Cadre passport" } },
  { group: "passports", key: "cities",     area: "passports", who: "ws:passport", ws: "passport",        label: { zh: "入境章的城市", en: "Entry-stamp cities" } },
  { group: "passports", key: "interns",    area: "passports", who: "ws:intern-passport", ws: "intern-passport", label: { zh: "實習護照", en: "Intern passport" } },
  { group: "passports", key: "board",      area: "passports", who: "ws:intern-passport", ws: "intern-passport", label: { zh: "實習的蛇梯棋", en: "Intern game board" } },
  // 人與權限
  { group: "people",    key: "roster",     area: "people",    who: "senior", label: { zh: "幹部名單", en: "Roster" } },
  { group: "people",    key: "invites",    area: "people",    who: "senior", label: { zh: "邀請新的人", en: "Invite people" } },
  { group: "people",    key: "workspaces", area: "people",    who: "senior", label: { zh: "工作區", en: "Workspaces" } },
  { group: "people",    key: "terms",      area: "people",    who: "senior", label: { zh: "屆別", en: "Years (terms)" } },
  // 變動紀錄：2026-12-25 起 role_changes 的 RLS 也給 Senior Adviser 讀（以前只給 Co-President）。
  { group: "people",    key: "changes",    area: "people",    who: "senior", label: { zh: "誰改了什麼", en: "Change log" } },
  // 紀錄
  { group: "records",   key: "overview",   area: "records",   who: "ws:records", ws: "custom:records", label: { zh: "活動", en: "Events" } },
  { group: "records",   key: "people",     area: "records",   who: "ws:records", ws: "custom:records", label: { zh: "人", en: "People" } },
  { group: "records",   key: "yearly",     area: "records",   who: "ws:records", ws: "custom:records", label: { zh: "年度比較", en: "Year by year" } },
  // 場地（2026-12-26 從「專案」底下搬到整個 BT）
  { group: "forms",     key: "venues",     area: "venues",    who: "cadre",  label: { zh: "場地", en: "Venues" } },
  // 錢
  { group: "finance",   key: "overview",   area: "money",     who: "ws:finance", ws: "custom:money", label: { zh: "總覽", en: "Overview" } },
  { group: "finance",   key: "tx",         area: "money",     who: "ws:finance", ws: "custom:money", label: { zh: "收支紀錄", en: "Transactions" } },
  { group: "finance",   key: "accounts",   area: "money",     who: "ws:finance", ws: "custom:money", label: { zh: "帳戶與類別", en: "Accounts & categories" } },
  { group: "finance",   key: "budget",     area: "money",     who: "ws:finance", ws: "custom:money", label: { zh: "預算", en: "Budget" } },
  { group: "finance",   key: "export",     area: "money",     who: "ws:finance", ws: "custom:money", label: { zh: "匯出", en: "Export" } },
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
  if (it.group === group && it.key) return `href="#${esc(it.key)}" data-act="tab" data-t="${esc(it.key)}"`;
  const hash = it.key && !it.bare ? "#" + it.key : "";
  return `href="${esc(withLang(`${GROUPS.find(g => g.key === it.group).href}${hash}`, L))}"`;
}
export const itemHref = (it, L) => withLang(`${GROUPS.find(g => g.key === it.group).href}${it.key && !it.bare ? "#" + it.key : ""}`, L);

// ── 我的工作區（2026-11-23）────────────────────────────────────────────
// 六個 team，固定順序（跟人與權限 → 工作區那一頁同一個順序）。多一個 team 就在這裡加一行。
export const TEAMS = ["Curriculum Team", "Mentorship Team", "Marketing Team", "Sponsorship Team", "Internship Team", "Community Relations Team"];
export const teamShort = t => String(t || "").replace(/\s*Team$/i, "");
const splitTeams = raw => String(raw || "").split(/[,、;；]/).map(x => x.trim()).filter(Boolean);
// 一個工作區是哪個 team 的。跟後台 ui.js 的 wsTeamOf() 同一條規則：
// res:X／apps:X 是 X、實習護照是 Internship、Marketing 的需求單是 Marketing；
// 專案與活動的代號看不出 team，要靠 info（whoAmI() 回的那一份）。整個 BT 的東西回空字串。
export function teamOfWs(id, info) {
  const s = String(id || "");
  if (s.startsWith("res:")) return s.slice(4);
  if (s.startsWith("apps:")) return s.slice(5);
  if (s === "intern-passport") return "Internship Team";
  if (s === "custom:marketing-requests" || s === "custom:marketing-approve") return "Marketing Team";
  const w = info && info[s];
  if (w && (w.kind === "project" || s.startsWith("custom:event-"))) return w.team || "";
  return "";
}
// 這個人在哪幾個 team：[{ team, level, some, projects: [{ id, title_zh, title_en, level }] }]。
//   level 是他在那個 team 自己的工作區（res:X）的等級；沒有就是空字串。
//   some = true：沒有 res:X，但那個 team 有別的東西開給他（例如只有一個專案）。
//   兩個都沒有的那一行來自他在「設定」自己勾的 team：他沒被派進去，那個 team 的東西只能看。
// Co-President 與 Senior Adviser 依職級全部都有，所以是六個 team、每一個都是「管」，專案不列（那個 team 的頁上有）。
export function myTeams(me) {
  if (!me || me.role !== "cadre") return [];
  if (senior(me)) return TEAMS.map(team => ({ team, level: "manage", some: false, projects: [] }));
  const ws = me.ws || {}, info = me.wsInfo || {}, by = new Map();
  const at = team => { if (!by.has(team)) by.set(team, { team, level: "", some: false, projects: [] }); return by.get(team); };
  for (const [id, lv] of Object.entries(ws)) {
    const team = teamOfWs(id, info);
    if (!team || !lv) continue;
    const t = at(team);
    if (id === "res:" + team) t.level = String(lv); else t.some = true;
    if (info[id] && info[id].kind === "project") t.projects.push({ id, title_zh: info[id].title_zh || "", title_en: info[id].title_en || "", level: String(lv) });
  }
  for (const team of splitTeams(me.team)) at(team);
  const rank = t => { const i = TEAMS.indexOf(t.team); return i < 0 ? TEAMS.length : i; };
  return [...by.values()].map(t => ({ ...t, some: !t.level && t.some }))
    .sort((a, b) => rank(a) - rank(b) || a.team.localeCompare(b.team));
}
// team 的頁在 /home/#team=<team>（home/src）。同一個資料夾只換 #。
export function teamHref(team, L, group) {
  const hash = "#team=" + encodeURIComponent(team);
  return group === "home" ? hash : withLang("/home/" + hash, L);
}
const fill = (row, L, vars) => tx(row, L).replace(/\{(\w+)\}/g, (m, k) => (vars && vars[k] != null ? String(vars[k]) : m));
// 「我的工作區」那一段的每一行。現在在哪個 team 的頁，那一行就展開（總覽、他進得去的專案、誰在這裡）；
// 只在一個 team 的人，那一行一直開著。好幾個 team 的人其他幾行收著，點了才開（2026-11-23 Paul：「maybe we can fold them」）。
function teamRowsHTML(group, tab, me, L) {
  const teams = myTeams(me);
  if (!me || me.role !== "cadre") return "";
  if (!teams.length) return `<div class="rail-foot rail-none">${esc(tx(RT.wsNone, L))}</div>`;
  const note = senior(me) ? `<div class="rail-foot rail-none">${esc(fill(RT.wsRank, L, { rank: boardName(me.board, L) }))}</div>` : "";
  const lvName = lv => tx(lv === "manage" ? RT.lvManage : lv === "edit" ? RT.lvEdit : RT.lvView, L);
  return note + teams.map(t => {
    const cur = group === "home" && tab === "team:" + t.team;
    const tag = t.level ? { txt: lvName(t.level), tip: fill(RT.lvTip, L, { lv: lvName(t.level) }), cls: "" }
      : t.some ? { txt: tx(RT.lvSome, L), tip: tx(RT.lvSomeTip, L), cls: " dim" }
      : { txt: tx(RT.lvView, L), tip: tx(RT.lvViewTip, L), cls: " dim" };
    const ppl = showPeopleHere(me, "res:" + t.team)
      ? `<a class="rail-item rail-sub rail-people" href="${esc(peopleHref("res:" + t.team, L))}" title="${esc(tx(RT.peopleT, L))}">${esc(tx(RT.people, L))}</a>` : "";
    const projects = t.projects.map(p => `<a class="rail-item rail-sub" href="${esc(withLang("/admin/#projects/" + encodeURIComponent(p.id), L))}">${esc(tx({ zh: p.title_zh || p.title_en, en: p.title_en || p.title_zh }, L) || p.id)}</a>`).join("");
    const open = cur || (teams.length === 1 && !!(projects || ppl));
    const subs = open ? `<div class="rail-subs"><a class="rail-item rail-sub${cur ? " on" : ""}" href="${esc(teamHref(t.team, L, group))}"${cur ? ' aria-current="page"' : ""}>${esc(tx(RT.wsOver, L))}</a>${projects}${ppl}</div>` : "";
    return `<a class="rail-item rail-area rail-team${cur ? " here" : ""}" href="${esc(teamHref(t.team, L, group))}">${svg(ICON.team)}<span class="rail-txt"><b>${esc(teamShort(t.team))}</b></span><span class="rail-lv${tag.cls}" title="${esc(tag.tip)}">${esc(tag.txt)}</span></a>${subs}`;
  }).join("");
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
    // 數字只算這個資料夾自己的頁（counts 是這一頁算的；別的資料夾剛好有同名的分頁，例如紀錄的 forms，不算進來）。
    const cnt = i => i.group === group ? (Number(c[i.key]) || 0) : 0;
    const n = items.reduce((s, i) => s + cnt(i), 0);
    // 現在這一區在側欄裡展開，底下列出它的每一頁（2026-11-14 Paul：「I still want the left menu click and show all the stuff in that tab like before」）。
    // 展開的時候那一區本身是淺底，深藍的是現在這一頁；寬螢幕上內容區上方那一排分頁就不畫了（rail.css），手機上照舊。
    const it = on ? itemOf(group, tab) : null;
    const ppl = it && it.ws && showPeopleHere(me, it.ws)
      ? `<a class="rail-item rail-sub rail-people" href="${esc(peopleHref(it.ws, L))}" title="${esc(tx(RT.peopleT, L))}">${esc(tx(RT.people, L))}</a>` : "";
    const open = on && (items.length > 1 || ppl);
    const subs = open ? `<div class="rail-subs">${items.map(i => {
      const cur = i === it, k = cnt(i);
      return `<a class="rail-item rail-sub${cur ? " on" : ""}" ${linkAttrs(i, group, L)}${cur ? ' aria-current="page"' : ""}>${esc(tx(i.label, L))}${k ? `<span class="rail-count">${esc(String(k))}</span>` : ""}</a>`;
    }).join("")}${ppl}</div>` : "";
    const cls = open ? " here" : on ? " on" : "";
    return `<a class="rail-item rail-area${cls}" ${linkAttrs(first, group, L)}${on && !open ? ' aria-current="page"' : ""}>${svg(ICON[a.key] || "")}<span class="rail-txt"><b>${esc(tx(a.label, L))}</b><small>${esc(tx(a.hint, L))}</small></span>${n && !open ? `<span class="rail-count">${esc(String(n))}</span>` : ""}</a>${subs}`;
  };
  const body = SECTIONS.map(s => {
    const rows = s.key === "ws" ? teamRowsHTML(group, tab, me, L) : AREAS.filter(a => a.sec === s.key).map(row).join("");
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

// 「誰在這裡」（2026-12-25，計畫：每一區都有一個「人」的分頁）：這一頁屬於哪個工作區（ITEMS 的 ws），
// 對它是「管」的人才看得到，連到 /admin/#members=<工作區>（一頁管所有地方的成員，門在 workspace_members / assign）。
// 錢那一格只有 Co-President 或「錢」是「管」的人派得了人（Senior Adviser 不行，跟 assign() 同一條）。
export function canManageWs(me, id) {
  if (!me || me.role !== "cadre" || !id) return false;
  if (id === "custom:money") return me.board === "president" || String((me.ws || {})[id] || "") === "manage";
  return senior(me) || String((me.ws || {})[id] || "") === "manage";
}
// 「誰在這裡」那一條連結畫不畫（2026-11-25 Paul：「for every workspaces, take out the people here. I can just go to workspaces and manage people there」）。
// Co-President 與 Senior Adviser 不畫：他們在「人與權限 → 工作區」一頁管得到每一區的人。
// 那一頁只開給他們兩種人，所以只管自己那一區的 Director 照舊有這一條，不然他就沒有地方加人了。門沒有變，還是 canManageWs。
export const showPeopleHere = (me, id) => !senior(me) && canManageWs(me, id);
export function peopleHref(id, L) { return withLang(`/admin/#members=${encodeURIComponent(id)}`, L); }
// 內容區最上面那一排分頁：現在這一行（area）底下看得到的每一頁。只有一頁、也沒有「誰在這裡」就不畫。
export function areaTabsHTML(group, tab, me, L) {
  const it = itemOf(group, tab);
  if (!it) return "";
  const items = visibleItems(it.area, me);
  const people = it.ws && showPeopleHere(me, it.ws)
    ? `<a class="area-tab area-people" href="${esc(peopleHref(it.ws, L))}" title="${esc(tx(RT.peopleT, L))}">${esc(tx(RT.people, L))}</a>` : "";
  if (items.length < 2 && !people) return "";
  return `<nav class="area-tabs" aria-label="${esc(tx(RT.tabs, L))}">${items.map(i => {
    const on = i === it;
    return `<a class="area-tab${on ? " on" : ""}" ${linkAttrs(i, group, L)}${on ? ' aria-current="page"' : ""}>${esc(tx(i.label, L))}</a>`;
  }).join("")}${people}</nav>`;
}

// ── 一頁裡面的分頁（2026-11-24）──
// Paul 看過活動編輯頁的分頁之後：「I want you to do the same thing, but like for the whole BT… make it more efficient and easier for us to add」。
// 一頁疊了四塊以上、要一直往下捲的，就把同一類的收成一個分頁，最上面一排按鈕。後台每一個資料夾都用這一支，樣式在 admin/admin.css（.subtabs、.tabp）。
//
// **怎麼用（要加一排分頁，或是在現有的那一排加一個，就是改這一個陣列）：**
//   RAIL.pageTabsHTML("rc-event", [
//     { key: "attendance", label: T("rtab.attendance"), body: sessions + participation },
//     { key: "feedback",   label: T("rtab.feedback"),   body: forms + scales, n: 3 },   // n 是標籤旁邊的小數字，0 或沒給就不畫
//   ])
//   - id 是這一排分頁的名字（一種頁面一個）。開著哪一個照 id 記在 sessionStorage，重畫、重新整理、換一筆資料都留在同一個分頁。
//   - body 是空字串的那一個不畫（這個人看不到的那一塊，分頁也不該出現）。只剩一個的時候不畫那一排，內容照樣出來。
//   - label 是已經可以直接放進 HTML 的字（字典裡的字）。使用者填的字要自己先 esc()。
//   - 各頁的 main.js **什麼都不用接**：按鈕由這一支自己聽（第一次畫的時候掛一個 click 在 document 上），只換哪一塊看得到，不重畫，打到一半的字留著。
//   - 要自己接（活動編輯頁要把分頁寫進網址）就給 opts.act，按鈕會帶 data-act，這一支就不管那一排；開著哪一個由 opts.on 決定。
//   - opts.start 是第一次進來開哪一個（沒給就是第一個）；opts.keepEmpty 是 body 空的也照畫（內容還在載的那種）。
//
// ⚠ **沒選到的分頁只是藏起來（hidden），不能改成「不畫」。** 後台好幾頁是照 id 把整頁的格子讀一遍一起存的，
//   哪一格不在畫面裡，讀到的就是空的，存下去會把那一欄清掉。test/page-tabs.test.mjs 守著這一條。
const ptMem = {};
let ptBound = false;
function ptGet(id) {
  if (id in ptMem) return ptMem[id];
  try { return (typeof sessionStorage !== "undefined" && sessionStorage.getItem("bt.ptab." + id)) || ""; } catch (_) { return ""; }
}
export function setPageTab(id, key) {
  ptMem[id] = key;
  try { if (typeof sessionStorage !== "undefined") sessionStorage.setItem("bt.ptab." + id, key); } catch (_) { /* 私密視窗存不了，這一次開著的還是記得 */ }
}
// 現在開著哪一個：記著的那一個還在清單裡就用它，不然用 fallback，再不然第一個。
export function pageTabOf(id, keys, fallback) {
  const w = ptGet(id);
  return keys.includes(w) ? w : keys.includes(fallback) ? fallback : (keys[0] || "");
}
function ptClick(ev) {
  const b = ev.target && ev.target.closest && ev.target.closest("button[data-ptab]");
  if (!b || b.dataset.act) return;
  const id = b.dataset.ptab, key = b.dataset.tab, nav = b.closest("nav");
  setPageTab(id, key);
  if (nav) nav.querySelectorAll("button[data-ptab]").forEach(x => {
    const on = x === b; x.classList.toggle("on", on);
    if (on) x.setAttribute("aria-current", "page"); else x.removeAttribute("aria-current");
  });
  document.querySelectorAll(".tabp").forEach(p => { if (p.dataset.ptabs === id) p.hidden = p.dataset.tabp !== key; });
  if (nav && nav.getBoundingClientRect().top < 0) nav.scrollIntoView({ block: "start" });
  b.scrollIntoView({ block: "nearest", inline: "nearest" });
}
export function pageTabsHTML(id, tabs, opts) {
  const o = opts || {};
  const list = (tabs || []).filter(t => t && (t.body || o.keepEmpty));
  if (!list.length) return "";
  if (list.length === 1) return list[0].body;
  if (!o.act && !ptBound && typeof document !== "undefined") { ptBound = true; document.addEventListener("click", ptClick); }
  const keys = list.map(t => t.key);
  const on = keys.includes(o.on) ? o.on : pageTabOf(id, keys, o.start);
  const nav = `<nav class="subtabs ptabs" id="${esc(id)}-tabs"${o.aria ? ` aria-label="${esc(o.aria)}"` : ""}>${list.map(t =>
    `<button type="button" data-ptab="${esc(id)}" class="subtab${t.key === on ? " on" : ""}"${o.act ? ` data-act="${esc(o.act)}"` : ""} data-tab="${esc(t.key)}"${t.key === on ? ' aria-current="page"' : ""}>${t.label}${
      t.n ? `<span class="subtab-n">${esc(String(t.n))}</span>` : ""}</button>`).join("")}</nav>`;
  return nav + list.map(t => `<div class="tabp" data-ptabs="${esc(id)}" data-tabp="${esc(t.key)}"${t.key === on ? "" : " hidden"}>${t.body}</div>`).join("");
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
