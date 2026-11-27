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
//        （2026-11-27 改成三段：我的、我的工作區、整個 BT。「組織」拿掉了，見 SECTIONS 上面那段。）
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
  // 側欄最上面的「新增」（2026-11-27）
  newBtn:   { zh: "新增", en: "New" },
  newRq:    { zh: "跟 Marketing 提需求", en: "New Marketing request" },
  newMt:    { zh: "記一場會議", en: "Log a meeting" },
  newSch:   { zh: "排一場會", en: "Schedule a meeting" },
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
  // 搜尋（2026-11-26）：每一位幹部都進得來；每一筆讀不讀得到是資料庫照原本那一頁的門決定的（2027-01-21-smart-search.sql）。
  { key: "search",    href: "/admin/search/",     who: "cadre" },
  // 實習生進度牆（2026-11-27）：Internship 的幹部、Co-President、Senior Adviser 看得到（跟 /intern-passport/ 開頁那一句同一條）。
  { key: "internwall", href: "/intern-passport/", who: "ws:intern-passport" },
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
  search:    '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l5 5"/>',
};
// 三段（2026-11-27 Paul：「there's me, there's my workspaces, there's BT, there's organizations, which is really confusing because they look the same level」）。
//   「組織」那一段拿掉了：紀錄與場地是整個 BT 的，放進「整個 BT」；錢是 Sponsorship 的，畫在「我的工作區」的 Sponsorship 那一行底下；
//   人與權限只有 Co-President 與 Senior Adviser 進得去，搬到頂欄（shared/nav.js 的 FEATURES）。
//   AREAS 裡 sec 不是這三段的（people、money）不畫成側欄的一行，但它們的分頁照舊在 AREAS 與 ITEMS 裡，內容區上方那一排分頁照樣有。
export const SECTIONS = [
  { key: "me",   label: { zh: "我的", en: "Me" } },
  // 我的工作區（2026-11-23）：這一段的行不在 AREAS 裡，是照人畫的，見下面 myTeams() 與 teamRowsHTML()。
  { key: "ws",   label: { zh: "我的工作區", en: "My workspaces" } },
  { key: "work", label: { zh: "整個 BT", en: "Whole BT" } },
];
export const AREAS = [
  { key: "home",      sec: "me",   label: { zh: "首頁",     en: "Home" },       hint: { zh: "等你處理的事，照日期排", en: "Everything waiting for you, by date" } },
  { key: "calendar",  sec: "me",   label: { zh: "行事曆",   en: "Calendar" },   hint: { zh: "月、週、日，排會，時間看板", en: "Month, week, day; availability" } },
  // 會議自己一行（2026-11-27 Paul：「take out meeting and template… into a separate category… home, calendar, meeting」）。
  // 底下是會議與會議範本；「記一場會議」在會議那一頁標題旁那一顆，也在側欄最上面的「新增」裡。
  { key: "meetings",  sec: "me",   label: { zh: "會議",     en: "Meetings" },   hint: { zh: "紀錄、記一場會議、範本", en: "Notes, log a meeting, templates" } },
  { key: "mypassport",sec: "me",   label: { zh: "我的護照", en: "My passport" }, hint: { zh: "蓋章與進度", en: "Your stamps and progress" } },
  // 2026-12-26 Paul：工作區 → 專案 → 活動。這一行改叫「專案」，點下去是專案清單；活動、計畫與招募、各 team 在它底下。key 留 events（網址與測試都認它）。
  // 搜尋（2026-11-26 Paul：要找一份舊的紀錄得一場一場點開，大家就不用了）：會議紀錄、回饋表、內部表單、活動檢討一次找。
  { key: "search",    sec: "work", label: { zh: "搜尋",     en: "Search" },     hint: { zh: "會議紀錄、回饋表一次找", en: "Meeting notes and feedback at once" } },
  { key: "events",    sec: "work", label: { zh: "專案",     en: "Projects" },   hint: { zh: "每個 team 的專案與活動", en: "Every team's projects and events" } },
  { key: "forms",     sec: "work", label: { zh: "表單",     en: "Forms" },      hint: { zh: "要填的、內部表單、回饋表", en: "To fill, internal forms, feedback forms" } },
  { key: "marketing", sec: "work", label: { zh: "行銷",     en: "Marketing" },  hint: { zh: "需求單、大學介紹貼文、IG", en: "Requests, college posts, Instagram" } },
  // 對外網站是「對外那一側的每一樣東西」（2026-11-27 Paul：「history road, island post, BT island, they should live under website… everything front end related」）。
  { key: "website",   sec: "work", label: { zh: "對外網站", en: "Website" },    hint: { zh: "活動、資源、團隊頁、歷史之路、BT 島", en: "Events, resources, team page, history, island" } },
  { key: "passports", sec: "work", label: { zh: "護照",     en: "Passports" },  hint: { zh: "幹部護照、實習護照", en: "Cadre and intern passports" } },
  { key: "records",   sec: "work", label: { zh: "紀錄",     en: "Records" },    hint: { zh: "活動、人、年度比較", en: "Events, people, year by year" } },
  // 場地是整個 BT 的（2026-12-26 Paul：「venue, records, money … whole BT」）。誰改得動不變：開得了活動的人照舊改得動。
  { key: "venues",    sec: "work", label: { zh: "場地",     en: "Venues" },     hint: { zh: "場地與聯絡人", en: "Places and contacts" } },
  // 這兩行不畫在側欄（見 SECTIONS 上面那段）：人與權限在頂欄，錢在「我的工作區」的 Sponsorship 那一行底下（teamRowsHTML）。
  { key: "people",    sec: "top",  label: { zh: "人與權限", en: "Internal" },   hint: { zh: "名單、邀請、幹部招募、工作區", en: "Roster, invites, recruitment, workspaces" } },
  { key: "money",     sec: "team", team: "Sponsorship Team", label: { zh: "錢", en: "Money" }, hint: { zh: "收支、預算、匯出", en: "Income, spending, budget" } },
];

// 每一頁。group 是在哪個資料夾，key 是那個資料夾裡的分頁（#key），area 是側欄上的哪一行。
// who 決定畫不畫：cadre / president / senior / "ws:a|b"（被派進其中任何一個工作區，或 senior）。
// 同一個 area 裡的順序就是上方分頁的順序；第一個看得到的是側欄那一行點下去的地方。
// key 是空字串的那幾頁（時間看板、護照）是那個資料夾本身，連結不帶 #。
export const ITEMS = [
  // 我的（2026-11-14）：首頁是 /home/，等你處理的事都在那一頁（以前後台還有一頁「待辦」，兩頁一樣的事，合併了）。
  { group: "home",      key: "home",       area: "home",      who: "cadre",  bare: true, label: { zh: "首頁", en: "Home" } },
  { group: "home",      key: "calendar",   area: "calendar",  who: "cadre",  label: { zh: "行事曆", en: "Calendar" } },
  { group: "forms",     key: "meetings",   area: "meetings",  who: "cadre",  label: { zh: "會議", en: "Meetings" } },
  { group: "availability", key: "",        area: "calendar",  who: "cadre",  label: { zh: "時間看板", en: "Availability" } },
  // 會議範本（2026-11-13）：只有改得動的人看得到這一頁；其他人在記會議的下拉選單裡選得到範本。
  { group: "forms",     key: "mtemplates", area: "meetings",  who: "ws:custom:meeting-templates", ws: "custom:meeting-templates", label: { zh: "會議範本", en: "Templates" } },
  { group: "passport",  key: "",           area: "mypassport", who: "cadre", label: { zh: "我的護照", en: "My passport" } },
  { group: "search",    key: "search",     area: "search",    who: "cadre",  bare: true, label: { zh: "搜尋", en: "Search" } },
  // 活動（2026-11-10 Paul：「application should live under events」）
  { group: "forms",     key: "projects",   area: "events",    who: "cadre",  label: { zh: "專案", en: "Projects" } },
  { group: "forms",     key: "events",     area: "events",    who: "cadre",  label: { zh: "活動", en: "Events" } },
  // 回饋表（2026-11-27 Paul：「feedback form lives under records. I don't know why it's there」）：回饋表是一場活動的，放在專案與活動旁邊。
  // 頁面還是紀錄那個資料夾的 #forms，誰看得到不變（被派進「紀錄」的人）。
  { group: "records",   key: "forms",      area: "events",    who: "ws:records", ws: "custom:records",    label: { zh: "回饋表", en: "Feedback forms" } },
  // 2026-11-26 Paul：「各 team」那一頁拿掉了（team 的人數與 Director 在幹部名單上），「計畫與招募」改叫「幹部招募」搬到「人與權限」底下，見下面。
  // 表單：要填的、內部表單、回饋表放在同一排（2026-11-13 Paul：「建內部表單」與「要填的」並排兩行很亂）
  { group: "teamforms", key: "fill",       area: "forms",     who: "cadre",  label: { zh: "要我填的", en: "To fill" } },
  { group: "teamforms", key: "build",      area: "forms",     who: "ws:team-forms", ws: "custom:team-forms", label: { zh: "內部表單", en: "Internal forms" } },
  // 行銷：需求單一頁（送單、我送的、Marketing 的待辦都在這一頁，2026-11-13 Paul）
  // 2026-11-27 Paul：一般幹部（Associate）在行銷那一行看到一堆不是他的東西。側欄的「行銷」只給 Marketing 的人；
  //   其他人提需求走側欄最上面的「新增」，那一頁也列得出他送過的單（頁面本身照舊每一位幹部都進得去，見 GROUPS 的 forms）。
  { group: "forms",     key: "request",    area: "marketing", who: "ws:res:Marketing Team|custom:marketing-requests", ws: "custom:marketing-requests",  label: { zh: "需求單", en: "Requests" } },
  { group: "marketing", key: "posts",      area: "marketing", who: "ws:res:Marketing Team|custom:marketing-requests", ws: "res:Marketing Team", label: { zh: "大學介紹貼文", en: "College intro posts" } },
  { group: "marketing", key: "ig",         area: "marketing", who: "ws:res:Marketing Team|custom:marketing-requests", ws: "res:Marketing Team", label: { zh: "Instagram", en: "Instagram" } },
  // 對外網站（2026-11-27 起歷史之路與 BT 島也在這裡）。只看得到自己改得動的那幾頁：
  //   資源庫、BT 島的貼文、BT 島是某個 team「改」以上（貼自己 team 的那一份），歷史之路是 Marketing「改」以上，其他是 Co-President 與 Senior Adviser。
  //   一般幹部一頁都改不動，所以整行不畫。這只是側欄畫不畫，誰改得動照舊是每一頁自己的判斷與資料庫。
  { group: "site",      key: "events",     area: "website",   who: "senior", label: { zh: "網站上的活動", en: "Events on the site" } },
  { group: "site",      key: "res",        area: "website",   who: "editany:res:", label: { zh: "資源庫", en: "Resources" } },
  { group: "site",      key: "team",       area: "website",   who: "senior", label: { zh: "團隊頁", en: "Team page" } },
  // 校友故事：2026-12-25 起 stories_for_review() 也回給 Senior Adviser（以前只給 Co-President，Senior Adviser 點進去是空的）。
  { group: "site",      key: "stories",    area: "website",   who: "senior", label: { zh: "校友故事", en: "Alumni stories" } },
  { group: "site",      key: "mail",       area: "website",   who: "senior", label: { zh: "信的文字", en: "Email wording" } },
  { group: "site",      key: "history",    area: "website",   who: "edit:res:Marketing Team", ws: "res:Marketing Team",  label: { zh: "BT 歷史之路", en: "History road" } },
  // BT 島上的貼文（2026-11-17）：每個 team 自己貼自己那座島的；貼得了哪座島看他的工作區。
  { group: "site",      key: "island",     area: "website",   who: "editany:res:", label: { zh: "BT 島的貼文", en: "Island posts" } },
  { group: "site",      key: "island-map", area: "website",   who: "editany:res:", label: { zh: "BT 島", en: "BT Island" } },
  // 護照
  { group: "passports", key: "cadre",      area: "passports", who: "ws:passport", ws: "passport",        label: { zh: "幹部護照", en: "Cadre passport" } },
  { group: "passports", key: "cities",     area: "passports", who: "ws:passport", ws: "passport",        label: { zh: "入境章的城市", en: "Entry-stamp cities" } },
  { group: "passports", key: "interns",    area: "passports", who: "ws:intern-passport", ws: "intern-passport", label: { zh: "實習護照", en: "Intern passport" } },
  { group: "passports", key: "board",      area: "passports", who: "ws:intern-passport", ws: "intern-passport", label: { zh: "實習的蛇梯棋", en: "Intern game board" } },
  // 實習生進度牆（2026-11-27 從「設定」的護照那一段搬來，那一段拿掉了）。頁面是 /intern-passport/ 本身。
  { group: "internwall", key: "",          area: "passports", who: "ws:intern-passport", label: { zh: "實習生進度牆", en: "Intern progress wall" } },
  // 人與權限
  { group: "people",    key: "roster",     area: "people",    who: "senior", label: { zh: "幹部名單", en: "Roster" } },
  { group: "people",    key: "invites",    area: "people",    who: "senior", label: { zh: "邀請新的人", en: "Invite people" } },
  // 幹部招募（2026-11-26 Paul：「it's recruiting for our board members… it should be a separated form」）。頁面還是 /admin/#forms 那一頁（group 是 forms），
  // 只是掛在「人與權限」這一行底下。看得到這一行的人：被派進「申請」工作區的，加 Co-President 與 Senior Adviser。資料讀不讀得到照舊是資料庫決定。
  { group: "forms",     key: "forms",      area: "people",    who: "ws:apps", ws: "apps", label: { zh: "幹部招募", en: "Recruitment" } },
  { group: "people",    key: "workspaces", area: "people",    who: "senior", label: { zh: "工作區", en: "Workspaces" } },
  { group: "people",    key: "terms",      area: "people",    who: "senior", label: { zh: "屆別", en: "Years (terms)" } },
  // 回報與許願的收件匣（2026-11-25）：幹部從右下角那一顆送的，只有 Co-President 與 Senior Adviser 讀得到（資料庫的門是 require_senior）。
  { group: "people",    key: "feedback",   area: "people",    who: "senior", label: { zh: "回報與許願", en: "Bugs & requests" } },
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
  // edit:a|b 是其中一個工作區「改」或「管」；editany:res: 是任何一個 res: 開頭的工作區「改」以上（2026-11-27，對外網站那幾頁）。
  if (String(who).startsWith("edit:")) return senior(me) || who.slice(5).split("|").some(id => ["edit", "manage"].includes(String((me.ws || {})[id] || "")));
  if (String(who).startsWith("editany:")) return canEditAny(me, who.slice(8));
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
// 掛在某個 team 那一行底下的「東西」（AREAS 裡 sec 是 "team" 的，2026-11-27 起是錢 → Sponsorship）：[{ team, items }]，只算看得到的頁。
export function teamAreas(me) {
  return AREAS.filter(a => a.sec === "team" && a.team).map(a => ({ team: a.team, area: a.key, items: visibleItems(a.key, me) })).filter(x => x.items.length);
}
function teamRowsHTML(group, tab, me, L) {
  if (!me || me.role !== "cadre") return "";
  const extra = teamAreas(me);
  const teams = myTeams(me);
  // 看得到錢、但沒被派進 Sponsorship 的人（例如管帳的人在別的 team）：照樣多一行 Sponsorship，裡面只有錢，標「部分」。誰看得到錢沒有變。
  for (const x of extra) if (!teams.some(t => t.team === x.team)) teams.push({ team: x.team, level: "", some: true, projects: [] });
  const rank = t => { const i = TEAMS.indexOf(t.team); return i < 0 ? TEAMS.length : i; };
  teams.sort((a, b) => rank(a) - rank(b) || a.team.localeCompare(b.team));
  if (!teams.length) return `<div class="rail-foot rail-none">${esc(tx(RT.wsNone, L))}</div>`;
  const note = senior(me) ? `<div class="rail-foot rail-none">${esc(fill(RT.wsRank, L, { rank: boardName(me.board, L) }))}</div>` : "";
  const lvName = lv => tx(lv === "manage" ? RT.lvManage : lv === "edit" ? RT.lvEdit : RT.lvView, L);
  const now = itemOf(group, tab);
  return note + teams.map(t => {
    const mine = extra.filter(x => x.team === t.team);
    const over = group === "home" && tab === "team:" + t.team;
    const cur = over || mine.some(x => x.items.includes(now));
    const tag = t.level ? { txt: lvName(t.level), tip: fill(RT.lvTip, L, { lv: lvName(t.level) }), cls: "" }
      : t.some ? { txt: tx(RT.lvSome, L), tip: tx(RT.lvSomeTip, L), cls: " dim" }
      : { txt: tx(RT.lvView, L), tip: tx(RT.lvViewTip, L), cls: " dim" };
    const ppl = showPeopleHere(me, "res:" + t.team)
      ? `<a class="rail-item rail-sub rail-people" href="${esc(peopleHref("res:" + t.team, L))}" title="${esc(tx(RT.peopleT, L))}">${esc(tx(RT.people, L))}</a>` : "";
    const projects = t.projects.map(p => `<a class="rail-item rail-sub" href="${esc(withLang("/admin/#projects/" + encodeURIComponent(p.id), L))}">${esc(tx({ zh: p.title_zh || p.title_en, en: p.title_en || p.title_zh }, L) || p.id)}</a>`).join("");
    // 一個東西一條（「錢」），點下去是它看得到的第一頁；它底下那五頁在內容區上方那一排（areaTabsHTML 的 .keep），不在這裡再列一次，
    // 不然 Sponsorship 底下會有兩個「總覽」。
    const areaLinks = mine.map(x => {
      const on = x.items.includes(now), A = AREAS.find(a => a.key === x.area);
      return `<a class="rail-item rail-sub${on ? " on" : ""}" ${linkAttrs(x.items[0], group, L)}${on ? ' aria-current="page"' : ""}>${esc(tx(A.label, L))}</a>`;
    }).join("");
    const inner = `<a class="rail-item rail-sub${over ? " on" : ""}" href="${esc(teamHref(t.team, L, group))}"${over ? ' aria-current="page"' : ""}>${esc(tx(RT.wsOver, L))}</a>${projects}${areaLinks}${ppl}`;
    const more = !!(projects || ppl || areaLinks);
    const open = cur || (teams.length === 1 && more);
    const subs = open ? `<div class="rail-subs">${inner}</div>` : "";
    const a = `<a class="rail-item rail-area rail-team${cur ? " here" : ""}" href="${esc(teamHref(t.team, L, group))}">${svg(ICON.team)}<span class="rail-txt"><b>${esc(teamShort(t.team))}</b></span><span class="rail-lv${tag.cls}" title="${esc(tag.tip)}">${esc(tag.txt)}</span></a>`;
    return (!open && more ? rowWithFly(a, teamShort(t.team), inner) : a) + subs;
  }).join("");
}

// ── 滑過去就看得到裡面有哪幾頁（2026-11-27）──────────────────────────────
// Paul 2026-11-27：「if I hover onto meetings, I can see meeting template, then I can decide I want to go straight into templates」。
// 沒展開的那幾行，滑鼠停上去（或用 Tab 走到它）右邊跳出一小塊，列出它底下每一頁，直接點得到。
// 只在有滑鼠的寬螢幕（rail.css 的 @media (hover:hover)）；手機與平板沒有「滑過去」，照舊點那一行。
// 那一塊是 position:fixed（側欄自己會捲，絕對定位會被切掉），位置由下面 placeFly() 在滑上去的那一刻算。
function rowWithFly(a, label, inner) {
  return `<div class="rail-row">${a}<div class="rail-fly" role="group" aria-label="${esc(label)}"><div class="rail-fly-m">${inner}</div></div></div>`;
}
let flyBound = false;
function placeFly(ev) {
  const row = ev.target && ev.target.closest && ev.target.closest(".rail-row");
  if (!row) return;
  const fly = row.querySelector(".rail-fly");
  if (!fly) return;
  const r = row.getBoundingClientRect();
  fly.style.left = Math.round(r.right) + "px";
  fly.style.top = Math.round(r.top) + "px";
  // 太靠下面就往上推，不要跑出螢幕。
  const h = fly.offsetHeight, vh = window.innerHeight || 0;
  if (h && vh && r.top + h > vh - 8) fly.style.top = Math.max(8, Math.round(vh - 8 - h)) + "px";
}
function bindFly() {
  if (flyBound || typeof document === "undefined") return;
  flyBound = true;
  document.addEventListener("mouseover", placeFly);
  document.addEventListener("focusin", placeFly);
}

// ── 側欄最上面的「新增」（2026-11-27）──────────────────────────────────────
// Paul 2026-11-27：「I'm trying to put the marketing request somewhere… right now it's just hanging on home, which is kind of weird
//   because people will be using that a lot. So design that for me」。最常做的幾件事收在每一頁側欄最上面同一顆鈕裡（像 Gmail 的「撰寫」），
//   不管在哪一頁都一下就按得到，首頁就不用再掛那兩顆鈕。
// 誰看得到哪一行跟原本那一頁一樣：提需求是每一位幹部；記會、排會是排得了會的人（Co-President、Senior Adviser、某個 team 是「改」以上，
//   跟資料庫的 can_schedule 同一條）。原生 <details>，不用寫程式就開得了關得了。
export const canSchedule = me => !!me && me.role === "cadre" && (senior(me) || canEditAny(me, "res:"));
export function newMenuHTML(group, me, L) {
  if (!me || me.role !== "cadre") return "";
  const go = (h, t) => group === "forms" ? `href="#${esc(t)}" data-act="tab" data-t="${esc(t)}"` : `href="${esc(withLang(h, L))}"`;
  const rows = [];
  // 提需求是每一位幹部（那一頁的門是 GROUPS 的 forms）。側欄的「行銷」那一行 2026-11-27 起只給 Marketing 的人，所以這裡不看那一行。
  if (canEnter(GROUPS.find(g => g.key === "forms"), me)) rows.push(`<a class="rail-new-i" ${go("/admin/#request", "request")}>${esc(tx(RT.newRq, L))}</a>`);
  if (canSchedule(me)) {
    rows.push(`<a class="rail-new-i" ${go("/admin/#meetings/new", "meetings/new")}>${esc(tx(RT.newMt, L))}</a>`);
    rows.push(`<a class="rail-new-i" href="${esc(group === "home" ? "?" + (L ? "lang=" + L + "&" : "") + "schedule=1#calendar" : withLang("/home/?schedule=1#calendar", L))}">${esc(tx(RT.newSch, L))}</a>`);
  }
  if (!rows.length) return "";
  return `<details class="rail-new"><summary><span aria-hidden="true">+</span> ${esc(tx(RT.newBtn, L))}</summary><div class="rail-new-m">${rows.join("")}</div></details>`;
}

// ── 側欄 ──────────────────────────────────────────────────────────────
// group 是現在在哪個資料夾，tab 是哪一頁，counts 是 { <item key>: 數字 }（有才顯示，一個東西的數字是它底下幾頁加起來）。
const svg = d => `<svg class="rail-ico" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
export function railHTML(group, tab, me, counts, L) {
  // 右下角那一顆「回報問題、許願功能」掛在 body 上，不在這一段 HTML 裡：每一頁重畫的時候會把側欄整個換掉，
  // 表單要是畫在裡面，打到一半的字與選好的圖會跟著不見。只有幹部有（資料庫也只收幹部，send_feedback）。
  // 它上面那一顆「怎麼用」（導覽，2026-11-26）也一樣掛在 body 上，見這一支最下面的 TOURS。
  if (typeof document !== "undefined" && me && me.role === "cadre") { mountFeedback(L); mountTour(group, tab, me, L); bindFly(); }
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
    const link = `<a class="rail-item rail-area${cls}" ${linkAttrs(first, group, L)}${on && !open ? ' aria-current="page"' : ""}>${svg(ICON[a.key] || "")}<span class="rail-txt"><b>${esc(tx(a.label, L))}</b><small>${esc(tx(a.hint, L))}</small></span>${n && !open ? `<span class="rail-count">${esc(String(n))}</span>` : ""}</a>`;
    // 沒展開、底下又不只一頁的那一行：滑過去看得到每一頁（見 rowWithFly）。
    const fly = !open && items.length > 1 ? items.map(i => { const k = cnt(i); return `<a class="rail-item rail-sub" ${linkAttrs(i, group, L)}>${esc(tx(i.label, L))}${k ? `<span class="rail-count">${esc(String(k))}</span>` : ""}</a>`; }).join("") : "";
    return (fly ? rowWithFly(link, tx(a.label, L), fly) : link) + subs;
  };
  const body = SECTIONS.map(s => {
    // 人與權限（sec "top"）在 Co-President 與 Senior Adviser 的頂欄上。其他人如果看得到它底下的某一頁（被派進「申請」工作區的人看得到幹部招募），
    // 頂欄沒有那一項，就照舊畫在「整個 BT」最後，不然那一頁就沒有入口了。
    const rows = s.key === "ws" ? teamRowsHTML(group, tab, me, L)
      : AREAS.filter(a => a.sec === s.key || (s.key === "work" && a.sec === "top" && !senior(me))).map(row).join("");
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
    ${newMenuHTML(group, me, L)}
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
  // 側欄上沒有畫成一行的那一區（人與權限在頂欄、錢在 Sponsorship 底下）：寬螢幕上側欄列不出它的每一頁，這一排要照畫（rail.css 的 .keep）。
  const a = AREAS.find(x => x.key === it.area);
  const keep = a && (a.sec === "top" || a.sec === "team") ? " keep" : "";
  return `<nav class="area-tabs${keep}" aria-label="${esc(tx(RT.tabs, L))}">${items.map(i => {
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

// ── 右下角那一顆：回報問題、許願功能（2026-11-25）──────────────────────
// Paul：「team members can submit bug, features they want through text and pictures and it goes to me like a little folating icon is enough」。
// 一顆圓的按鈕，按了開一格 <dialog>：選是哪一種、打字、最多四張圖（選檔或直接貼上截圖）。送出走 send_feedback()，
// 圖先縮到長邊 1600 再傳進私人的 bucket「feedback」（自己的資料夾）。讀的人是 Co-President 與 Senior Adviser，在「回報與許願」那一頁，另外各收一封信。
// 資料庫那一半在 supabase/migrations/2027-01-10-site-feedback.sql。這一段只在瀏覽器裡跑；supabase 用到的時候才載（跟每一頁用的是同一個 client）。
const FB = {
  open:   { zh: "回報問題、許願功能", en: "Report a bug or ask for a feature" },
  title:  { zh: "回報問題、許願功能", en: "Report a bug or ask for a feature" },
  lede:   { zh: "送給 Co-President 與 Senior Adviser。只有他們看得到。", en: "This goes to the Co-Presidents and Senior Advisers. Only they can read it." },
  kind:   { zh: "這是哪一種", en: "What is it" },
  bug:    { zh: "有東西壞了", en: "Something is broken" },
  feature:{ zh: "想要一個功能", en: "I want a feature" },
  other:  { zh: "其他", en: "Something else" },
  body:   { zh: "發生了什麼事，或你想要什麼", en: "What happened, or what do you want" },
  bodyPh: { zh: "寫得到的都寫：你按了什麼、看到什麼、原本以為會怎樣。", en: "Say what you pressed, what you saw, and what you expected instead." },
  add:    { zh: "加圖", en: "Add pictures" },
  addHint:{ zh: "最多四張。截圖可以直接貼在上面那一格。", en: "Up to four. You can also paste a screenshot into the box above." },
  remove: { zh: "拿掉這張圖", en: "Remove this picture" },
  send:   { zh: "送出", en: "Send" },
  sending:{ zh: "送出中", en: "Sending" },
  cancel: { zh: "取消", en: "Cancel" },
  sent:   { zh: "送出去了，謝謝。", en: "Sent. Thank you." },
  needBody:{ zh: "先寫一句話。", en: "Write a sentence first." },
  max:    { zh: "最多四張圖。", en: "Four pictures at most." },
  notImg: { zh: "只收 JPG、PNG、WebP 的圖。", en: "Only JPG, PNG or WebP pictures." },
  eLimit: { zh: "你今天送很多了，明天再送。", en: "You have sent a lot today. Try again tomorrow." },
  eCadre: { zh: "只有幹部送得了。", en: "Only cadres can send this." },
  eSetup: { zh: "資料庫還沒準備好：要先在 Supabase 跑 2027-01-10-site-feedback.sql。", en: "The database is not ready: run 2027-01-10-site-feedback.sql in Supabase first." },
  ePhoto: { zh: "有一張圖傳不上去。拿掉它再送一次，或換一張小一點的。", en: "One picture would not upload. Remove it and send again, or try a smaller one." },
  eOther: { zh: "送不出去：", en: "Could not send: " },
};
export const FB_MAX = 4;
const FB_ICON = `<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-6l-5 4v-4H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"/><path d="M12 8v4M12 14.6v.2"/></svg>`;
// 畫面（純函式，測試看得到）：一顆按鈕加一格 dialog。圖的縮圖是選了檔之後才塞進 .fb-pics 的。
export function feedbackHTML(L) {
  const t = k => esc(tx(FB[k], L));
  const kind = (v, on) => `<label class="fb-kind"><input type="radio" name="fb-kind" value="${v}"${on ? " checked" : ""}><span>${t(v)}</span></label>`;
  return `<button type="button" class="fb-fab" data-fb="open" aria-haspopup="dialog" aria-label="${t("open")}" title="${t("open")}">${FB_ICON}</button>
  <dialog class="fb-dlg" aria-labelledby="fb-h">
    <h2 id="fb-h">${t("title")}</h2>
    <p class="fb-lede">${t("lede")}</p>
    <div class="fb-kinds" role="radiogroup" aria-label="${t("kind")}">${kind("bug", true)}${kind("feature")}${kind("other")}</div>
    <label class="fb-lab" for="fb-body">${t("body")}</label>
    <textarea id="fb-body" class="fb-body" rows="5" maxlength="4000" placeholder="${t("bodyPh")}"></textarea>
    <div class="fb-pics" aria-live="polite"></div>
    <div class="fb-addrow"><label class="fb-add"><input type="file" data-fb="files" accept="image/jpeg,image/png,image/webp" multiple hidden>${t("add")}</label><span class="fb-hint">${t("addHint")}</span></div>
    <p class="fb-msg" role="status"></p>
    <div class="fb-foot"><button type="button" class="fb-btn quiet" data-fb="close">${t("cancel")}</button><button type="button" class="fb-btn" data-fb="send">${t("send")}</button></div>
  </dialog>`;
}
// 資料庫回的錯變成一句話。純函式。
export function feedbackSays(err, L) {
  const m = String((err && err.message) || err || "");
  if (/too_many_today/.test(m)) return tx(FB.eLimit, L);
  if (/not_cadre/.test(m)) return tx(FB.eCadre, L);
  if (/bad_photo|too_many_photos|row-level security|Bucket not found|mime type|exceeded the maximum/i.test(m)) return /Bucket not found/i.test(m) ? tx(FB.eSetup, L) : tx(FB.ePhoto, L);
  if (/Could not find the function|send_feedback|schema cache|PGRST202/i.test(m)) return tx(FB.eSetup, L);
  return tx(FB.eOther, L) + m;
}
// 傳之前給圖取的檔名：13 位數的時間加六個字（資料庫只收這個格式，而且第一段要是自己的 id）。
export const feedbackPath = (uid, type, now, rnd) => `${uid}/${String(now).padStart(13, "0")}-${String(rnd || "").replace(/[^a-z0-9]/g, "").padEnd(6, "0").slice(0, 6)}.${type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg"}`;
let fbL = "zh", fbFiles = [], fbBusy = false;
function fbHost() { return document.getElementById("bt-fb"); }
function fbMsg(text, bad) { const el = fbHost() && fbHost().querySelector(".fb-msg"); if (el) { el.textContent = text || ""; el.classList.toggle("bad", !!bad); } }
function fbDrawPics() {
  const box = fbHost() && fbHost().querySelector(".fb-pics"); if (!box) return;
  box.innerHTML = fbFiles.map((f, i) => `<span class="fb-pic"><img src="${esc(f.url)}" alt=""><button type="button" data-fb="rm" data-i="${i}" aria-label="${esc(tx(FB.remove, fbL))}">×</button></span>`).join("");
}
function fbAdd(files) {
  for (const f of files) {
    if (!/^image\/(jpeg|png|webp)$/.test(f.type)) { fbMsg(tx(FB.notImg, fbL), true); continue; }
    if (fbFiles.length >= FB_MAX) { fbMsg(tx(FB.max, fbL), true); break; }
    fbFiles.push({ file: f, url: URL.createObjectURL(f) });
  }
  fbDrawPics();
}
function fbReset() { fbFiles.forEach(f => URL.revokeObjectURL(f.url)); fbFiles = []; const h = fbHost(); if (!h) return; h.querySelector(".fb-body").value = ""; fbDrawPics(); fbMsg(""); }
// 長邊縮到 1600 再存成 JPEG：截圖原檔常常好幾 MB，bucket 一張只收 5 MB。縮不了（瀏覽器畫不出來）就傳原檔。
async function fbShrink(file) {
  try {
    const bmp = await createImageBitmap(file), k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas"); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise(r => c.toBlob(r, "image/jpeg", 0.86));
    return blob || file;
  } catch (e) { return file; }
}
async function fbSend() {
  const h = fbHost(); if (!h || fbBusy) return;
  const body = h.querySelector(".fb-body").value.trim();
  if (!body) { fbMsg(tx(FB.needBody, fbL), true); h.querySelector(".fb-body").focus(); return; }
  const kind = (h.querySelector('input[name="fb-kind"]:checked') || {}).value || "other";
  const btn = h.querySelector('[data-fb="send"]');
  fbBusy = true; btn.disabled = true; btn.textContent = tx(FB.sending, fbL); fbMsg("");
  try {
    const { supabase } = await import("./supabase.js");
    const uid = (((await supabase.auth.getUser()).data || {}).user || {}).id;
    if (!uid) throw new Error("not_cadre");
    const photos = [];
    for (const f of fbFiles) {
      const blob = await fbShrink(f.file), path = feedbackPath(uid, blob.type, Date.now(), Math.random().toString(36).slice(2, 8));
      const up = await supabase.storage.from("feedback").upload(path, blob, { contentType: blob.type, upsert: false });
      if (up.error) throw up.error;
      photos.push(path);
    }
    const r = await supabase.rpc("send_feedback", { p: { kind, body, page: (location.pathname + location.hash).slice(0, 300), photos } });
    if (r.error) throw r.error;
    fbReset(); fbMsg(tx(FB.sent, fbL));
    setTimeout(() => { const d = fbHost() && fbHost().querySelector("dialog"); if (d && d.open && !fbBusy) { d.close(); fbMsg(""); } }, 1600);
  } catch (e) { fbMsg(feedbackSays(e, fbL), true); }
  fbBusy = false; btn.disabled = false; btn.textContent = tx(FB.send, fbL);
}
function mountFeedback(L) {
  let h = fbHost();
  if (h) {
    // 換語言：格子關著、沒有打到一半的東西才重畫，不然字會不見。
    const d = h.querySelector("dialog");
    if (h.dataset.lang !== L && d && !d.open && !fbFiles.length && !h.querySelector(".fb-body").value) { h.innerHTML = feedbackHTML(L); h.dataset.lang = L; fbL = L; }
    return;
  }
  if (!document.body) return;
  h = document.createElement("div"); h.id = "bt-fb"; h.dataset.lang = L; fbL = L; h.innerHTML = feedbackHTML(L); document.body.appendChild(h);
  h.addEventListener("click", e => {
    const b = e.target.closest("[data-fb]"), d = h.querySelector("dialog");
    if (!b) { if (e.target === d) d.close(); return; }   // 點到格子外面那一圈暗的：關掉，字留著
    const a = b.dataset.fb;
    if (a === "open") { if (!d.open) d.showModal(); h.querySelector(".fb-body").focus(); }
    else if (a === "close") d.close();
    else if (a === "rm") { const f = fbFiles.splice(Number(b.dataset.i), 1)[0]; if (f) URL.revokeObjectURL(f.url); fbDrawPics(); fbMsg(""); }
    else if (a === "send") fbSend();
  });
  h.addEventListener("change", e => { if (e.target.dataset && e.target.dataset.fb === "files") { fbAdd([...e.target.files]); e.target.value = ""; } });
  h.addEventListener("paste", e => {
    const imgs = [...((e.clipboardData && e.clipboardData.files) || [])].filter(f => /^image\//.test(f.type));
    if (imgs.length) { e.preventDefault(); fbAdd(imgs); }
  });
}

// ── 右下角第二顆：「怎麼用」導覽（2026-11-26）──────────────────────────
// Paul（開車時口述，2026-11-26）：一位幹部說新平台很難學。與其寫一頁說明，不如每一頁都內建一段導覽：
//   第一次登入自動跑；每一頁右下角有一顆「怎麼用」可以重看；一次框住頁面上的一塊並解釋它，有下一步、上一步、跳過；
//   每頁 3 到 6 步；也講頁面之間怎麼接（例如活動的「結果」分頁跟紀錄是同一份資料）。
//
// **要改導覽的字、加一步、幫新的頁面加一段：只改下面的 TOURS。** README「後台導覽」那一節有一步一步的做法。
//   一段導覽 = { id, page, when?, unless?, steps }。
//     id      這一段的名字，同一個檔案裡不能重複。
//     page    哪一頁："資料夾:分頁"，跟上面 ITEMS 的 group 與 key 一樣（例如 "people:roster"）。可以給一個陣列。
//     when    （選填）頁面上有這個東西才用這一段。同一頁有兩種畫面時用（例如活動清單與一場活動的編輯頁都是 forms:events）。
//     unless  （選填）頁面上有這個東西就不用這一段。
//     steps   每一步 { at, t, b }：at 是要框住的東西（CSS 選擇器；給陣列就用第一個看得到的），
//             t 是標題、b 是內文，都是 { zh, en }。沒有 at 的那一步放在畫面中間，不框東西。
//   **頁面上找不到 at 的那一步會自動跳過，不會出錯。** 所以某些人看不到的按鈕也可以寫進來。
//
// 導覽不會自己跑，只有按右下角「怎麼用」才開（Paul 2026-11-26）。所以不記「看過了沒」，也不寫 localStorage。
// 這一段只在瀏覽器裡跑，不 import 任何東西；純的部分（挑哪一段、哪幾步、盒子放哪）匯出給 test/tour.test.mjs。
const TT = {
  fab:    { zh: "怎麼用", en: "How to use" },
  fabTip: { zh: "帶你看這一頁怎麼用", en: "Show me how this page works" },
  label:  { zh: "導覽", en: "Guided tour" },
  next:   { zh: "下一步", en: "Next" },
  back:   { zh: "上一步", en: "Back" },
  skip:   { zh: "跳過", en: "Skip" },
  done:   { zh: "完成", en: "Done" },
  count:  { zh: "第 {i} 步，共 {n} 步", en: "Step {i} of {n}" },
};
// 每一頁的左側欄（手機上收成「所有頁面」那一顆）與這一區的分頁，很多段都會指到，先取名字。
const AT_MENU = [".rail .rail-area.here", ".rail .rail-area.on", ".rail-burger"];
const AT_SUBS = [".rail .rail-subs", ".area-tabs", ".rail-burger"];
const AT_HEAD = ".main .page-head";
const AT_ACT  = ".main .page-head .actions";
export const TOURS = [
  // 這一頁還沒有自己的導覽時，按「怎麼用」跑這一段。
  { id: "welcome", page: "*", steps: [
    { t: { zh: "歡迎來到後台", en: "Welcome to Backstage" },
      b: { zh: "每一頁都有一段像這樣的短導覽，一分鐘就看完。按「下一步」「上一步」前後移動，按「跳過」或 Esc 就關掉。", en: "Every page has a short tour like this one; it takes about a minute. Next and Back move through it; Skip or the Escape key closes it." } },
    { at: [".rail", ".rail-burger"], t: { zh: "所有頁面都在這裡", en: "Every page is in this menu" },
      b: { zh: "你進得去的頁面都列在這裡，進不去的不會出現，所以每個人看到的選單不一樣。手機上它收成一顆「所有頁面」。", en: "Every page you can open is listed here. Pages you cannot open are left out, so each person sees a different menu. On a phone it folds into one All pages button." } },
    { at: "#bt-tour .tour-fab", t: { zh: "每一頁都有這一顆", en: "This button is on every page" },
      b: { zh: "在任何一頁按這一顆，就會帶你看你現在這一頁怎麼用。", en: "Press this on any page to see how the page you are on works." } },
    { at: "#bt-fb .fb-fab", t: { zh: "東西壞了，或想要新功能", en: "Something broken, or a feature you want" },
      b: { zh: "按這一顆寫下來，有截圖就一起貼上。會送到 Co-President 與 Senior Adviser 那裡。", en: "Press this and write it down, with a screenshot if you have one. It goes to the Co-Presidents and Senior Advisers." } },
  ] },

  // ── 首頁（/home/）──
  { id: "home", page: "home:home", steps: [
    // 2026-11-27：首頁那兩顆鈕搬到側欄最上面的「新增」（newMenuHTML）。
    { at: [".rail-new", ".rail-burger"], t: { zh: "最常做的事在這裡", en: "The things you do most" },
      b: { zh: "左邊最上面的「新增」每一頁都有：跟 Marketing 提需求；排得了會的人還有記一場會議、排一場會。記下來的會之後在「搜尋」找得到。", en: "New, at the top left, is on every page: send Marketing a request, and if you can schedule meetings, log a meeting or schedule one. Every meeting you log can be found later in Search." } },
    { at: ".home .block.wait", t: { zh: "等你處理", en: "Waiting for you" },
      b: { zh: "要你動手的事都在這一張清單：要回覆的會、要填的表單、等你審的報名、派給你的需求。照日期排，最急的在最上面，點一行就到那件事。", en: "Everything that needs you is in this one list: meetings to reply to, forms to fill in, sign-ups to review, requests assigned to you. Most urgent first; tap a row to go straight there." } },
    { at: ".home .wait + .block", t: { zh: "接下來", en: "Coming up" },
      b: { zh: "接下來六十天排給你的會與活動。會議可以直接在這裡按會到或不能到，排會的人馬上看得到。", en: "Your meetings and events for the next 60 days. Reply to a meeting right here and the organizer sees your answer straight away." } },
    { at: ".home .block.pp", t: { zh: "我的護照", en: "My passport" },
      b: { zh: "你蓋了幾格章。點進去蓋章、寫心得，心得只有你自己看得到。", en: "How many stamps you have. Open it to stamp and write notes; only you can read your notes." } },
    { at: ".home .block.pairs", t: { zh: "Mentorship", en: "Mentorship" },
      b: { zh: "你帶的 mentee 或你的 mentor 在這裡，check-in 的連結也在這裡，填過的會打勾。", en: "Your mentees or your mentor, with your check-in links. The ones you have filled in are ticked." } },
    { at: [".rail a.rail-area[href='#calendar']", ".rail-burger"], t: { zh: "行事曆在隔壁", en: "The Calendar is next door" },
      b: { zh: "「行事曆」用月、週、日看所有的會與活動。在「時間看板」填你什麼時候有空，排會的人在行事曆的「日」就看得到。", en: "Calendar shows every meeting and event by month, week or day. Fill in when you are free under Availability, and organizers see it in the Calendar's Day view." } },
  ] },
  // 行事曆的月與週（點一天之後的「日」是下一段）
  { id: "calendar", page: "home:calendar", unless: ".cal .dgrid", steps: [
    { at: ".cal .calbar", t: { zh: "月、週、日", en: "Month, week or day" },
      b: { zh: "左邊切換月、週、日，箭頭往前往後翻，「今天」跳回今天。", en: "Switch between Month, Week and Day on the left. The arrows move back and forward; Today jumps back to today." } },
    { at: ".cal .calbar .seg:last-of-type", t: { zh: "只看我的，或整個 BT", en: "Just mine, or all of BT" },
      b: { zh: "「只看我的」只放邀了你的會、你排的會與活動。「整個 BT」連別人的會也放上來，排會之前先看會不會撞期。", en: "Just mine shows meetings you are invited to or organized, plus events. All of BT adds everyone else's meetings, so you can check for clashes before you schedule." } },
    { at: [".cal .month", ".cal .week"], t: { zh: "怎麼看", en: "Reading the calendar" },
      b: { zh: "實心是必到，框線是選擇參加，橘色是活動。點一個就打開，會議可以在裡面回覆會不會到。", en: "Solid is required, outlined is optional, orange is an event. Click one to open it; you can reply to a meeting from there." } },
    // 2026-11-27：能排會的人點日期（月）、拖一段（週）直接跳出排會；其他人點日期照舊打開那一天。
    { at: [".cal .month .day.today .dnum", ".cal .wcol.today", ".cal .dnum"], t: { zh: "點日期排會", en: "Click a date to schedule" },
      b: { zh: "排得了會的人在月曆點日期、在週曆拖一段時間，排會那一塊就跳出來，每個人後面標著那段時間有沒有空。其他人點日期打開那一天。", en: "If you can schedule, click a date in Month or drag across a time in Week to open the form; each person shows whether they are free then. Everyone else opens that day instead." } },
    { at: AT_SUBS, t: { zh: "時間看板", en: "Availability" },
      b: { zh: "「時間看板」填你什麼時候有空。排會時你名字後面的標、「日」的底色，都是照大家在這裡填的算。會議紀錄在側欄「會議」那一行。", en: "Availability is where you fill in when you are free. The marks next to your name when someone schedules, and the Day view's shading, both come from what everyone fills in there. Meeting notes are under Meetings in the menu." } },
  ] },
  { id: "calendar-day", page: "home:calendar", when: ".cal .dgrid", steps: [
    { at: ".cal .dchips", t: { zh: "只算一個 team", en: "Count one team" },
      b: { zh: "按一個 team，底色就只算那個 team 的人。按「所有人」回到全部。", en: "Pick a team and the shading counts only that team. Everyone goes back to all members." } },
    { at: ".cal .dweek .wscroll", t: { zh: "底色是有空的人數", en: "Shading shows who is free" },
      b: { zh: "底色越深，那半小時有空的人越多，滑鼠移過去看得到是誰。可以排會的人點一格就打開排會：選時間、勾人、寫標題與議程，邀請會寄出去。", en: "The darker a half hour, the more people are free; hover to see who. If you can schedule, click a half hour to set up a meeting: pick the time, tick people, add a title and agenda, and the invites go out." } },
    { at: ".cal .dcol .chipi", t: { zh: "這一天的會與活動", en: "This day's meetings and events" },
      b: { zh: "這一天已經排好的會與活動疊在上面，點一個打開。", en: "Meetings and events already on this day sit on top. Click one to open it." } },
    { at: ".cal a[href*='availability']", t: { zh: "人數從哪裡來", en: "Where the counts come from" },
      b: { zh: "人數是照每個人在「時間看板」填的時間算的，沒填的人不會被算進去。點這裡改你自己的。", en: "Counts come from the free times each person fills in under Availability; anyone who hasn't filled theirs in isn't counted. Click here to edit yours." } },
    { at: ".cal .calbar .seg", t: { zh: "回到月或週", en: "Back to month or week" },
      b: { zh: "按「月」或「週」回到整段時間。", en: "Press Month or Week to go back to the wider view." } },
  ] },

  // ── 搜尋（/admin/search/）──
  { id: "search", page: "search:search", steps: [
    { at: ".sx-box", t: { zh: "打一個詞", en: "Type a word" },
      b: { zh: "一次找會議紀錄、回饋表、內部表單、活動檢討。打兩個以上的詞，每一個都要提到才算。英文跟中文分開找，bootcamp 跟探索營要各找一次。", en: "One box searches meeting notes, feedback forms, internal forms and event reviews. With two or more words, each one has to appear. English and Chinese are matched separately, so try both." } },
    { at: ".sx-filters", t: { zh: "縮小範圍", en: "Narrow it down" },
      b: { zh: "「找哪裡」挑要找哪幾種，日期只找一段時間。讀得到回饋表的人還多兩格：活動與回饋表的種類。", en: "Where to look picks which kinds to search, and the dates limit it to a period. If you can read feedback forms you also get Event and Feedback form type." } },
    { at: ".sx-sum", t: { zh: "最上面的整理", en: "The summary at the top" },
      b: { zh: "AI 把找到的東西整理成幾句，後面的數字指回底下那一筆。AI 只讀了片段，可能讀錯，重要的事點進原本那一頁確認。", en: "The AI sums up what was found in a few lines, and the numbers point to the results below. It only reads excerpts and can be wrong, so check the original for anything important." } },
    { at: [".sx-list", ".main .empty"], t: { zh: "結果", en: "Results" },
      b: { zh: "每一筆標出是哪一種、名稱、日期與提到的那一句，點名稱回到原本那一頁。你在原本那一頁讀不到的，這裡也不會出現。", en: "Each result shows its kind, title, date and the line that matched. Click the title to open the original. Anything you can't read on its own page won't show up here." } },
    { t: { zh: "會議記下來就找得到", en: "Logged meetings show up here" },
      b: { zh: "用「記一場會議」（側欄最上面的「新增」或會議那一頁）記下來的會，都找得到。開完會把重點寫進紀錄，之後要找就不用一場一場點開。", en: "Every meeting logged with Log a meeting (under New at the top of the menu, or on the Meetings page) can be found here. Write the key points into the notes, and nobody has to open meetings one by one later." } },
    { at: "#sx-settings", t: { zh: "給 AI 讀哪些", en: "What the AI may read" },
      b: { zh: "只有 Co-President 看得到這一塊：勾哪幾種可以給 AI 讀。回饋表與活動檢討要先補隱私政策再打開。", en: "Only Co-Presidents see this: which kinds the AI may read. Feedback forms and event reviews stay off until the privacy policy covers them." } },
  ] },

  // ── 專案 → 活動 ──
  { id: "events", page: "forms:events", unless: "#ev-tabs", steps: [
    { at: AT_HEAD, t: { zh: "每個 team 的活動", en: "Every team's events" },
      b: { zh: "每個 team 在這裡做自己的活動：填內容、設報名表，好了就按「準備好了」。Co-President 發布之後，對外的首頁、/events/ 和那場活動自己的頁面就看得到。", en: "Each team makes its own events here: fill in the content, set up the sign-up form, then press Mark ready. Once a Co-President publishes it, it shows on the public home page, /events/ and its own page." } },
    { at: "#ev-new", t: { zh: "開一場新的活動", en: "Start a new event" },
      b: { zh: "選 team，填短網址與中英文名字。一開始是草稿，發布之前外面的人看不到。", en: "Pick the team, then a short web address and the names in both languages. It starts as a draft, so nobody outside sees it until it is published." } },
    { at: [".main .ev-fbx", ".main > .chips"], t: { zh: "找一場活動", en: "Find an event" },
      b: { zh: "打名字、代號或地點找。上面那一排可以只看已經上線的，或還在做的。", en: "Search by name, short address or place. The row of chips above shows only live events, or only the ones still in progress." } },
    { at: ".main .section .flist", t: { zh: "點一場就能改", en: "Open one to edit it" },
      b: { zh: "點活動名字進到它的編輯頁。名字旁邊的小標籤寫著它是草稿還是已經上線。", en: "Click an event's name to open its editor. The small tag next to the name says whether it is a draft or live." } },
    { at: "#todo", t: { zh: "還沒寄出去的信", en: "Emails not sent yet" },
      b: { zh: "報名的狀態一改，就會排一封信給那個人。信先停在這裡，按「現在寄出去」才真的寄。", en: "Each time an applicant's status changes, an email to them is queued. The emails wait here until someone presses Send now." } },
    { at: ".main .ev-recline", t: { zh: "比較舊的活動在紀錄裡", en: "Older events live in Records" },
      b: { zh: "網站還沒做好之前辦的活動只在「紀錄」裡，出席與回饋也在那裡。按這一行過去看。", en: "Events from before the site exist only in Records, with their attendance and feedback. This line takes you there." } },
  ] },
  { id: "event-editor", page: "forms:events", when: "#ev-tabs", steps: [
    { at: "#ev-state", t: { zh: "這場活動現在在哪一步", en: "Where this event stands" },
      b: { zh: "草稿的意思是外面還看不到。右邊那一顆按鈕就是下一步要做的事。", en: "Draft means nobody outside can see it yet. The button on the right is the next thing to do." } },
    { at: "#ev-tabs", t: { zh: "六個分頁", en: "Six tabs" },
      b: { zh: "一場活動的東西分成六塊：內容、照片、講者、表單、成果、設定。換分頁不會弄丟你打到一半的字。", en: "An event is split into six tabs: Details, Photos, Speakers, Forms, Results and Settings. Switching tabs keeps what you have typed." } },
    { at: '#ev-tabs [data-tab="forms"]', t: { zh: "報名表與回饋表", en: "Sign-up and feedback forms" },
      b: { zh: "這場活動的報名表和活動後的回饋表都在這個分頁開。", en: "This event's sign-up form and its after-event feedback form are both made in this tab." } },
    { at: '#ev-tabs [data-tab="results"]', t: { zh: "活動結束之後", en: "After the event" },
      b: { zh: "出席和回饋在這裡看。這些數字來自「紀錄」，跟紀錄那一頁是同一份資料，不用登兩次。", en: "Attendance and feedback show up here. The numbers come from Records, so this tab and the Records page show the same data; nothing is entered twice." } },
    { at: '#ev-tabs [data-tab="settings"]', t: { zh: "上線與其他設定", en: "Going live, and the rest" },
      b: { zh: "內容好了就在這裡按「準備好了」，Co-President 再發布。請 Marketing 做貼文、這場活動屬於哪個專案、誰能改它，也都在這裡。", en: "When the content is done, press Mark ready here and a Co-President publishes it. Asking Marketing for a post, which project the event belongs to and who can edit it are here too." } },
    { at: ".main .back", t: { zh: "回到活動清單", en: "Back to the list" },
      b: { zh: "按這裡回到所有活動。", en: "This takes you back to all events." } },
  ] },
  { id: "projects", page: "forms:projects", steps: [
    { at: AT_HEAD, t: { zh: "專案把活動收在一起", en: "Projects group events together" },
      b: { zh: "一個專案底下可以有好幾場活動和報名表。例如 Curriculum 的「Winter Camp 2027」底下有說明會、營隊本身和行前會。", en: "A project holds several events and sign-up forms. For example, Curriculum's Winter Camp 2027 holds the info session, the camp itself and the pre-camp meeting." } },
    { at: "#pj-new", t: { zh: "開一個專案", en: "Create a project" },
      b: { zh: "選 team，填短網址與中英文名字。", en: "Pick the team, then a short web address and the names in both languages." } },
    { at: ".main .section .flist", t: { zh: "一個 team 一塊", en: "One block per team" },
      b: { zh: "點一個專案，看它底下有哪幾場活動與表單。", en: "Click a project to see the events and forms inside it." } },
    { at: AT_SUBS, t: { zh: "專案和活動怎麼接", en: "How projects and events connect" },
      b: { zh: "旁邊就是「活動」。每一場活動在自己的「設定」分頁選它屬於哪個專案。", en: "Events is right next to this page. Each event picks its project in its own Settings tab." } },
  ] },

  // ── 人與權限 ──
  { id: "roster", page: "people:roster", steps: [
    { at: AT_HEAD, t: { zh: "這一屆的幹部", en: "This year's team" },
      b: { zh: "職級決定他是誰，工作區決定他能動什麼。team 只是一個標籤，不會開任何權限。", en: "Rank says who someone is; workspaces say what they can change. The team is only a label and opens nothing by itself." } },
    { at: "#roster .fbx", t: { zh: "找一個人", en: "Find someone" },
      b: { zh: "打名字找。「篩選」可以換成別的屆別；網站上線前的幹部沒有帳號，選「歷屆全部」才看得到。", en: "Search by name. Filters switch to another year; cadres from before the site have no account and show up under All terms." } },
    { at: "#roster table", t: { zh: "一個人一列", en: "One row per person" },
      b: { zh: "名字、職級、這一屆的職位、被派進哪幾個工作區。", en: "Name, rank, position this year and the workspaces they are assigned to." } },
    { at: AT_ACT, t: { zh: "補以前的人", en: "Add someone from before" },
      b: { zh: "「加一筆過去的紀錄」是給以前當過幹部、但沒有帳號的人用的。", en: "Add a past record is for people who were on the team before but never had an account." } },
    { at: ".main > .note", t: { zh: "每一個改動都有紀錄", en: "Every change is logged" },
      b: { zh: "誰改了什麼都寫在「誰改了什麼」那一頁。把人升成 Co-President 等於把整個後台交給他，包括把你降級。", en: "Every change is written to the Change log. Promoting someone to Co-President hands them the whole Backstage, including the power to demote you." } },
    { at: AT_SUBS, t: { zh: "要開權限，去工作區", en: "To give access, use Workspaces" },
      b: { zh: "要讓一個人處理某個 team 的申請或資源，在「工作區」那一頁把他派進去，不是在這一頁改。", en: "To let someone handle a team's applications or resources, assign them on the Workspaces page, not here." } },
  ] },
  { id: "invites", page: "people:invites", steps: [
    { at: AT_HEAD, t: { zh: "邀請新的人", en: "Invite new people" },
      b: { zh: "打 email、選他會是什麼身分，按一次信就寄出去。對方點信裡的連結登入就好，不用打碼。", en: "Type an email, choose what they will be, press once and the email goes out. They click the link and sign in; there is no code to type." } },
    { at: "#invite-fold", t: { zh: "邀請一個人", en: "Invite someone" },
      b: { zh: "填 email、職級、team、哪一屆和名字。這些會變成他進來之後的身分與這一屆的職位。", en: "Fill in the email, rank, team, year and name. They become the person's role and this year's position once they join." } },
    { at: "#invites", t: { zh: "已經邀請的人", en: "People invited" },
      b: { zh: "還沒進來的人在這裡。信過期或寄丟了，按「重寄（換新碼）」；寄錯人就按「撤銷」。", en: "People who have not joined yet are listed here. If the email expired or got lost, press Resend (new code); if it went to the wrong person, press Revoke." } },
    { at: "#batch", t: { zh: "一組碼給一群人", en: "One code for a group" },
      b: { zh: "很少用到。一個一個邀請請用上面那一格。", en: "Rarely needed. To invite people one by one, use the form above." } },
    { at: AT_SUBS, t: { zh: "進來之後在名單上", en: "After they join" },
      b: { zh: "對方登入之後就會出現在「幹部名單」上。", en: "Once they sign in, they show up on the Roster." } },
  ] },
  { id: "recruitment", page: "forms:forms", steps: [
    { at: AT_HEAD, t: { zh: "招募新幹部", en: "Recruiting new team members" },
      b: { zh: "這裡放招募幹部的申請表。活動和計畫的報名表不在這裡，在那一場活動自己的頁面。", en: "Application forms for recruiting team members live here. Sign-up forms for events and programmes live on that event's own page." } },
    { at: AT_ACT, t: { zh: "開一份招募表", en: "Start a recruitment form" },
      b: { zh: "按這裡開一份新的招募表，題目和開放時間在表單裡設定。", en: "Press this to start a new recruitment form; the questions and dates are set inside the form." } },
    { at: ".main .section .flist", t: { zh: "看申請、改表單", en: "Review applications, edit the form" },
      b: { zh: "每一份表單都有「看收到的申請」和「改這份表單」。在這裡錄取一個人，系統會一起寄邀請信給他，他登入之後就在幹部名單上。", en: "Each form has View applications and Edit form. Accepting someone here also emails them an invite, and once they sign in they are on the Roster." } },
    { at: ".main .mp-links", t: { zh: "誰在處理申請", en: "Who works on applications" },
      b: { zh: "點這裡看誰被派進「申請」這個工作區，也就是誰讀得到申請。", en: "Press this to see who is assigned to the Applications workspace, which is who can read the applications." } },
  ] },

  // ── 紀錄 ──
  { id: "records", page: "records:overview", steps: [
    { at: AT_HEAD, t: { zh: "BT 辦過的每一場活動", en: "Every event BT has run" },
      b: { zh: "一場活動四個數字，加一句「下一次我們改什麼」。網站上線前的活動也在這裡。", en: "Four numbers per event, plus one line on what to change next time. Events from before the site are here too." } },
    { at: AT_ACT, t: { zh: "補一場舊活動", en: "Add an old event" },
      b: { zh: "以前辦過、這裡還沒有的，按「加一場舊活動」補上。", en: "For an event BT ran before that is not here yet, press Add a past event." } },
    { at: ".main .section", t: { zh: "一屆一張表", en: "One table per year" },
      b: { zh: "點一場活動看細節：誰來了、回饋怎麼說。活動編輯頁的「成果」分頁讀的就是這一份。", en: "Open an event for the details: who came and what the feedback said. An event editor's Results tab reads this same data." } },
    { at: AT_SUBS, t: { zh: "人與年度比較", en: "People, and year by year" },
      b: { zh: "「人」是每一個來過 BT 的人，「年度比較」把每一屆排在一起看趨勢。", en: "People lists everyone who has been part of BT; Year by year lines the terms up so you can see the trend." } },
  ] },
  { id: "records-people", page: "records:people", steps: [
    { at: AT_HEAD, t: { zh: "每一個來過 BT 的人", en: "Everyone who has been part of BT" },
      b: { zh: "學員、mentee、幹部、校友、來賓都在這裡。點一個人看他的時間軸。", en: "Students, mentees, cadres, alumni and guests are all here. Open a person to see their timeline." } },
    { at: ".main .ptabs", t: { zh: "三個分頁", en: "Three tabs" },
      b: { zh: "名錄、可能重複、加一個人。同名不會自動合併，只有 email 一樣才算同一個人；同名的排在「可能重複」等人看。", en: "Directory, Possible duplicates and Add a person. Same names are not merged automatically; only a matching email counts as the same person, and same-name pairs wait under Possible duplicates." } },
    { at: "#rc-pfind", t: { zh: "找人", en: "Find people" },
      b: { zh: "打名字找，或用「篩選」挑出一群人，例如某一年的學員。", en: "Search by name, or use Filters to pick out a group, such as one year's students." } },
    { at: ".main .rc-dirbar", t: { zh: "同一個人出現兩次", en: "Same person twice" },
      b: { zh: "按「合併兩個人」把兩筆併成一筆，兩邊的活動紀錄都會留著。", en: "Merge people joins two entries into one and keeps the event history from both." } },
  ] },
  { id: "records-yearly", page: "records:yearly", steps: [
    { at: AT_HEAD, t: { zh: "一年一年比", en: "Year by year" },
      b: { zh: "每一屆、每一種活動一列。看的是趨勢，不是目標。", en: "One row per term and kind of event. Read it for the trend, not as a target." } },
    { at: ".main .card", t: { zh: "挑你要比的", en: "Choose what to compare" },
      b: { zh: "用這幾格挑屆別、活動種類、team。", en: "Use these boxes to pick the terms, the kinds of event and the team." } },
    { at: ".main .section", t: { zh: "兩張表", en: "Two tables" },
      b: { zh: "第一張照屆別排，第二張把同一種活動排在一起，一屆一欄，看哪一種變好了。", en: "The first is by term; the second lines up each kind of event across terms, one column per term, so you can see which got better." } },
    { at: AT_ACT, t: { zh: "帶走數字", en: "Take the numbers with you" },
      b: { zh: "「下載 CSV」可以用 Excel 或 Google 試算表打開。", en: "Download CSV opens in Excel or Google Sheets." } },
  ] },

  // ── 對外網站 ──
  { id: "site-events", page: "site:events", steps: [
    { at: AT_HEAD, t: { zh: "對外網站上的活動", en: "Events on the public site" },
      b: { zh: "這一頁是對外的 /events/ 現在有哪些。上架與下架在那一場活動自己的頁面裡，由 Co-President 按。", en: "This page shows what the public /events/ page has right now. Co-Presidents publish and unpublish from each event's own page." } },
    { at: ".main .section", t: { zh: "上線、等發布、草稿", en: "Live, waiting, drafts" },
      b: { zh: "team 按了「準備好了」的活動會排在「等上架」那一塊，點進去就能發布。", en: "Events a team has marked ready wait in the Waiting to be published block; open one to publish it." } },
    { at: AT_SUBS, t: { zh: "網站的其他部分", en: "The rest of the site" },
      b: { zh: "資源庫、團隊頁、校友故事、系統寄的信、歷史之路、BT 島，對外看得到的東西都在這一區改。", en: "Resources, the team page, alumni stories, the system emails, the history road and BT Island: everything the public sees is edited in this section." } },
  ] },
  { id: "site-res", page: "site:res", steps: [
    { at: AT_HEAD, t: { zh: "資源庫", en: "Resources" },
      b: { zh: "BT 做的免費資源，放在對外的 /resources/。這裡放的是一條連結，檔案本身留在 Google Drive 或 YouTube。", en: "Free resources BT has made, shown on the public /resources/ page. Each entry is a link; the file itself stays in Google Drive or YouTube." } },
    { at: AT_ACT, t: { zh: "加一個資源", en: "Add a resource" },
      b: { zh: "貼上連結、寫名字和一句說明，選它放在哪一個大標底下。", en: "Paste the link, add a name and a line about it, and choose which section it goes under." } },
    { at: ".main .mp-links", t: { zh: "每個 team 自己的資源", en: "Each team's resources" },
      b: { zh: "看每個 team 誰改得了自己的資源。", en: "See who on each team can edit that team's resources." } },
  ] },
  { id: "site-team", page: "site:team", steps: [
    { at: AT_HEAD, t: { zh: "對外的團隊頁", en: "The public team page" },
      b: { zh: "決定誰出現在對外的 /team/ 上。幹部要先在「設定」自己打勾，再由你一個一個核可。未滿 18 歲的一律不核可，系統沒有生日欄位，只有你擋得住。", en: "Decide who appears on the public /team/ page. Cadres opt in under Settings first, then you approve each one. Never approve anyone under 18: there is no birthday field, so you are the only check." } },
    { at: "#past-teams", t: { zh: "前幾屆", en: "Past years" },
      b: { zh: "以前每一屆的整份名單，只有名字與職位、沒有照片。一屆一個開關，預設是關的；打開之前先把未滿 18 歲的人藏起來。只有 Co-President 動得了。", en: "Each past year's whole roster, names and titles only, no photos. Each year has its own switch, off by default; before turning one on, hide anyone under 18. Only a Co-President can change these." } },
    { at: AT_SUBS, t: { zh: "名單從哪裡來", en: "Where the names come from" },
      b: { zh: "這裡的人是「人與權限」裡每一屆的職位，不用另外打一份。", en: "These names come from each year's positions under Internal, so there is no second list to type." } },
  ] },
  { id: "site-stories", page: "site:stories", steps: [
    { at: AT_HEAD, t: { zh: "校友故事", en: "Alumni stories" },
      b: { zh: "決定誰出現在對外的 /alumni/ 航線圖上。故事是校友自己在頂欄的「我的故事」寫的，也是他自己勾同意公開。", en: "Decide who appears on the public /alumni/ route map. Alumni write their own story under My story in the top bar and tick their own consent to publish it." } },
    { at: [".main .section .note", ".main .section"], t: { zh: "核可之前看四件事", en: "Four checks before approving" },
      b: { zh: "滿 18 歲了嗎、真的是 BT 校友嗎、這段字能用 BT 的名義放出去嗎、他說在 BT 做過的事是真的嗎。核可之後他再改字，會自動撤下來回到這裡。", en: "Are they 18 or older, are they really BT alumni, can this text go out under BT's name, and did they really do what they say? If they edit the story after approval, it comes down automatically and returns to this list." } },
    { at: AT_SUBS, t: { zh: "網站的其他部分", en: "The rest of the site" },
      b: { zh: "活動、資源庫、團隊頁、系統寄的信、歷史之路、BT 島，都在這一區。", en: "Events, resources, the team page, the system emails, the history road and BT Island are all in this section." } },
  ] },
  { id: "site-mail", page: "site:mail", steps: [
    { at: AT_HEAD, t: { zh: "系統寄的信", en: "Emails the system sends" },
      b: { zh: "申請、邀請、Marketing 需求單、會議這幾類信的文字都在這裡改。只有 Co-President 與 Senior Adviser 改得動。", en: "The wording of the application, invite, Marketing request and meeting emails is edited here. Only Co-Presidents and Senior Advisers can change it." } },
    { at: ".main .section .flist", t: { zh: "一封信一列", en: "One row per email" },
      b: { zh: "點一封打開，中英文各有一份。改完存起來，下一封寄出去的就是新的字。", en: "Open an email to edit it; each has a Chinese and an English version. The next one sent uses your new wording." } },
    { at: AT_SUBS, t: { zh: "網站的其他部分", en: "The rest of the site" },
      b: { zh: "活動、資源庫、團隊頁、校友故事、歷史之路、BT 島，都在這一區。", en: "Events, resources, the team page, alumni stories, the history road and BT Island are all in this section." } },
  ] },

  // ── 護照 ──
  { id: "passports-cadre", page: "passports:cadre", steps: [
    { at: AT_HEAD, t: { zh: "幹部護照", en: "The cadre passport" },
      b: { zh: "33 格的題目與說明、每個月右上角的時刻都在這裡改。改完幹部重新整理護照就看得到。", en: "Edit the 33 boxes and each month's time in the corner here. Cadres see the change when they refresh their passport." } },
    { at: ".main .jump", t: { zh: "跳到某個月", en: "Jump to a month" },
      b: { zh: "一個月一塊，點月份直接跳過去。", en: "One block per month; press a month to jump to it." } },
    { at: ".main .addmonth", t: { zh: "加一個月", en: "Add a month" },
      b: { zh: "選一個月，按「加進護照」。", en: "Pick a month and press Add to passport." } },
    { at: ".main .section .flist", t: { zh: "每一格", en: "Each box" },
      b: { zh: "點一格改題目和說明。不想讓幹部看到的月份可以先藏起來。", en: "Open a box to change its title and description. A month can stay hidden until you want cadres to see it." } },
    { at: AT_SUBS, t: { zh: "城市與實習護照", en: "Cities, and the intern passport" },
      b: { zh: "入境章抽得到的城市、實習護照與它的蛇梯棋，在旁邊的分頁。", en: "The cities the entry stamp can draw, the intern passport and its game board are in the tabs next to this one." } },
  ] },
  { id: "passports-cities", page: "passports:cities", steps: [
    { at: AT_HEAD, t: { zh: "入境章的城市", en: "Entry-stamp cities" },
      b: { zh: "幹部蓋入境章的時候，會從這裡的城市抽一個。", en: "When a cadre gets an entry stamp, it draws one of the cities listed here." } },
    { at: ".main .section", t: { zh: "城市清單", en: "The list of cities" },
      b: { zh: "可以加城市、改名字。有人抽過的城市刪不掉，只能停用；停用的不會再被新的入境章抽到，已經蓋好的章不變。", en: "Add a city or rename one. A city someone has drawn cannot be deleted, only disabled; a disabled city is not drawn for new stamps, and existing stamps stay." } },
    { at: AT_SUBS, t: { zh: "回到護照", en: "Back to the passport" },
      b: { zh: "護照的 33 格在「幹部護照」那一頁。", en: "The 33 boxes are on the Cadre passport page." } },
  ] },
  { id: "passports-interns", page: "passports:interns", steps: [
    { at: AT_HEAD, t: { zh: "實習護照", en: "The intern passport" },
      b: { zh: "實習生自己的護照。這一頁改屆別、分組和每一格要做的事。", en: "The interns' own passport. Set the terms, the groups and what each box asks for on this page." } },
    { at: "#terms", t: { zh: "屆別", en: "Terms" },
      b: { zh: "一期實習一個屆別，新的一期按「開新的一屆」。", en: "One term per round of internships; press New term to start the next one." } },
    { at: "#groups", t: { zh: "分組", en: "Groups" },
      b: { zh: "一組一頁，實習生只看得到自己那一組。", en: "Each group gets its own page, and interns only see their own group." } },
    { at: "#tasks", t: { zh: "每一格", en: "The boxes" },
      b: { zh: "照階段分好，點一格改它。「看它在實習護照上長什麼樣」可以看實習生看到的樣子。", en: "Grouped by stage; open a box to change it. See it in the intern passport shows exactly what interns see." } },
    { at: AT_SUBS, t: { zh: "蛇梯棋", en: "The game board" },
      b: { zh: "實習生蓋一個章拿一次擲骰子，棋盤在「實習的蛇梯棋」那一頁改。", en: "Interns earn one roll per stamp; the board itself is edited on the Intern game board page." } },
  ] },
  { id: "passports-board", page: "passports:board", steps: [
    { at: AT_HEAD, t: { zh: "實習的蛇梯棋", en: "The intern game board" },
      b: { zh: "實習生蓋一個章拿一張票，擲骰子走棋。", en: "Interns earn one roll per stamp and move along the board." } },
    { at: ".main .section", t: { zh: "點一格就能改", en: "Click a square to change it" },
      b: { zh: "每一格可以是梯子、蛇或任務格，改完按「存起來」。最下面有開關，決定實習生看不看得到棋盤。", en: "Each square can be a ladder, a snake or a task square; press Save when done. The switch at the bottom decides whether interns see the board." } },
    { at: AT_SUBS, t: { zh: "章從哪裡來", en: "Where the stamps come from" },
      b: { zh: "實習生要做的事在「實習護照」那一頁。", en: "What interns need to do is set on the Intern passport page." } },
  ] },

  // ── 錢 ──
  { id: "money", page: "finance:overview", steps: [
    { at: AT_HEAD, t: { zh: "BT 的錢", en: "BT's money" },
      b: { zh: "現在有多少錢、這一屆進來多少出去多少。轉帳只是搬家，不算收入也不算支出。", en: "How much there is now, and what came in and went out this term. Transfers only move money, so they count as neither income nor expense." } },
    { at: [".main .section", ".main .empty"], t: { zh: "數字從哪裡來", en: "Where the numbers come from" },
      b: { zh: "全部是「收支紀錄」加起來的，從每個帳戶開帳那天起算，作廢的不算。", en: "Everything adds up from Transactions, starting from each account's opening day; voided rows do not count." } },
    { at: AT_SUBS, t: { zh: "五個分頁", en: "Five pages" },
      b: { zh: "總覽、收支紀錄、帳戶與類別、預算、匯出。第一次用先去「帳戶與類別」開帳。", en: "Overview, Transactions, Accounts & categories, Budget and Export. On day one, open the accounts first under Accounts & categories." } },
  ] },
  { id: "money-tx", page: "finance:tx", steps: [
    { at: AT_HEAD, t: { zh: "每一筆進出", en: "Every row of money" },
      b: { zh: "新的一筆按「加一筆」。已經在清單上的，改了就存。", en: "Press Add a row for a new one. Rows already on the list save as you change them." } },
    { at: ".main .fin-fbx", t: { zh: "找一筆", en: "Find a row" },
      b: { zh: "打字找，或用「篩選」看某一屆、某個帳戶或某一類。", en: "Type to search, or use Filters for one term, account or category." } },
    { at: [".main .section", ".main .empty"], t: { zh: "登錯了不要刪", en: "Do not delete mistakes" },
      b: { zh: "登錯的按「作廢」，寫一句為什麼。紀錄會留著，總覽不算它。", en: "Void a wrong row and write one line on why. The row stays on record, and the overview leaves it out." } },
  ] },
  { id: "money-accounts", page: "finance:accounts", steps: [
    { at: AT_HEAD, t: { zh: "帳戶與類別", en: "Accounts and categories" },
      b: { zh: "帳戶是錢放在哪裡：銀行、現金、平台。類別是收支分哪幾種。", en: "Accounts are where money sits: bank, cash, a platform. Categories are the kinds of income and spending." } },
    { at: ".main .section", t: { zh: "第一天怎麼開帳", en: "Opening an account on day one" },
      b: { zh: "把每個帳戶今天的餘額填成開帳餘額，開帳日填今天，之前的錢不用補登。", en: "Enter each account's balance today as its opening balance, with today as the opening day; earlier money is not entered." } },
    { at: AT_SUBS, t: { zh: "類別改名", en: "Renaming a category" },
      b: { zh: "類別改名會連舊的一起改。不用的類別封存，不要刪。", en: "Renaming a category renames the old rows too. Archive categories you no longer use instead of deleting them." } },
  ] },
  { id: "money-budget", page: "finance:budget", steps: [
    { at: AT_HEAD, t: { zh: "預算", en: "Budget" },
      b: { zh: "這一屆每一類支出打算花多少。", en: "How much each kind of spending is meant to cost this term." } },
    { at: [".main .fin-budget > li", ".main .section"], t: { zh: "只是提醒，不會擋", en: "A reminder, not a block" },
      b: { zh: "填了之後，總覽會畫一條「花掉多少」的進度條，超過會變橘色。", en: "Once filled in, the overview shows a progress bar per category that turns orange when it goes over." } },
    { at: AT_SUBS, t: { zh: "回總覽看", en: "See it on the overview" },
      b: { zh: "進度條在「總覽」那一頁。", en: "The progress bars are on the Overview page." } },
  ] },
  { id: "money-export", page: "finance:export", steps: [
    { at: AT_HEAD, t: { zh: "匯出給會計", en: "Export for the accountant" },
      b: { zh: "把收支下載成 CSV，給會計或理事會。Excel 直接開，中文不會變亂碼。", en: "Download transactions as CSV for the accountant or the board. Excel opens it with Chinese intact." } },
    { at: ".main .section", t: { zh: "作廢的也在", en: "Voided rows are included" },
      b: { zh: "作廢的那幾筆也會在檔案裡，最後兩欄有標出來。", en: "Voided rows are in the file too, flagged in the last two columns." } },
    { at: AT_SUBS, t: { zh: "回收支紀錄", en: "Back to transactions" },
      b: { zh: "要改哪一筆，回「收支紀錄」改。", en: "To fix a row, go back to Transactions." } },
  ] },
];

// ── 純函式（test/tour.test.mjs 看得到）──
export const tourPage = (group, tab) => `${group || ""}:${tab || ""}`;
export const tourSels = at => (Array.isArray(at) ? at : at ? [at] : []).filter(Boolean);
// 這一頁用哪一段：page 對得上、when 在、unless 不在的第一段。has(選擇器) 回 true／false。
export function pickTour(page, has, tours) {
  const list = tours || TOURS, ok = s => { try { return !!has(s); } catch (e) { return false; } };
  return list.find(t => t.id !== "welcome" && [].concat(t.page).includes(page) && (!t.when || ok(t.when)) && (!t.unless || !ok(t.unless))) || null;
}
export const welcomeTour = tours => (tours || TOURS).find(t => t.id === "welcome") || null;
// 留下找得到的那幾步。find(選擇器) 回那個東西或 null；沒有 at 的那一步一定留著。回的每一步多一個 sel：真的用到哪一個選擇器。
export function tourStepsOn(steps, find) {
  const out = [];
  for (const s of steps || []) {
    const sels = tourSels(s.at);
    if (!sels.length) { out.push({ ...s, sel: "" }); continue; }
    const sel = sels.find(x => { try { return !!find(x); } catch (e) { return false; } });
    if (sel) out.push({ ...s, sel });
  }
  return out;
}
// 盒子放哪。r 是被框住那一塊在螢幕上的位置（null 是放中間），bw／bh 是盒子大小，vw／vh 是螢幕。
// 手機（窄於 560）貼著螢幕下緣或上緣，看那一塊在哪一半；寬螢幕放在那一塊的下面、上面、右邊、左邊，哪邊放得下放哪邊。
export function tourPlace(r, bw, bh, vw, vh) {
  const m = 12, gap = 14, clamp = (v, lo, hi) => Math.max(lo, Math.min(v, hi));
  if (!r) return { side: "center", left: Math.max(m, (vw - bw) / 2), top: Math.max(m, (vh - bh) / 2) };
  if (vw < 560) { const low = (r.top + r.bottom) / 2 > vh / 2; return { side: low ? "top" : "bottom", left: m, top: low ? m : Math.max(m, vh - bh - m) }; }
  const x = clamp(r.left, m, vw - bw - m), y = clamp(r.top, m, vh - bh - m);
  if (r.bottom + gap + bh <= vh - m) return { side: "below", left: x, top: r.bottom + gap };
  if (r.top - gap - bh >= m) return { side: "above", left: x, top: r.top - gap - bh };
  if (r.right + gap + bw <= vw - m) return { side: "right", left: r.right + gap, top: y };
  if (r.left - gap - bw >= m) return { side: "left", left: r.left - gap - bw, top: y };
  return { side: "bottom", left: clamp((vw - bw) / 2, m, vw - bw - m), top: Math.max(m, vh - bh - m) };
}
export function tourFabHTML(L) {
  const t = k => esc(tx(TT[k], L));
  return `<button type="button" class="tour-fab" data-tour="open" aria-label="${t("fabTip")}" title="${t("fabTip")}"><span class="tour-q" aria-hidden="true">?</span><span class="tour-fab-t">${t("fab")}</span></button>`;
}
export function tourBoxHTML(step, i, n, L) {
  const t = k => esc(tx(TT[k], L)), last = i >= n - 1;
  const count = esc(tx(TT.count, L).replace("{i}", String(i + 1)).replace("{n}", String(n)));
  return `<div class="tour-box" role="dialog" aria-modal="true" aria-labelledby="tour-h" aria-describedby="tour-b">
    <p class="tour-count">${count}</p>
    <h2 id="tour-h">${esc(tx(step.t, L))}</h2>
    <p id="tour-b" class="tour-b">${esc(tx(step.b, L))}</p>
    <div class="tour-foot">${last ? "" : `<button type="button" class="tour-btn quiet" data-tour="skip">${t("skip")}</button>`}<span class="tour-sp"></span>${i > 0 ? `<button type="button" class="tour-btn quiet" data-tour="back">${t("back")}</button>` : ""}${last ? `<button type="button" class="tour-btn" data-tour="skip">${t("done")}</button>` : `<button type="button" class="tour-btn" data-tour="next">${t("next")}</button>`}</div>
  </div>`;
}

// ── 在瀏覽器裡跑的部分 ──
const tour = { page: "", L: "zh", steps: null, i: 0, el: null, back: null, place: 0 };
const tHost = () => document.getElementById("bt-tour");
const tReduce = () => { try { return matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { return false; } };
const tShown = el => { if (!el || !el.getBoundingClientRect) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
const tFind = sel => { const all = document.querySelectorAll(sel); for (const el of all) if (tShown(el) && !el.closest("#bt-tour .tour-layer")) return el; return null; };
function tCurrent() { return pickTour(tour.page, s => !!document.querySelector(s)); }
function tStart(plan) {
  const steps = tourStepsOn(plan.flatMap(t => t.steps), tFind);
  if (!steps.length) return;
  tour.steps = steps; tour.i = 0; tour.back = document.activeElement;
  const h = tHost(); let layer = h.querySelector(".tour-layer");
  if (!layer) { layer = document.createElement("div"); layer.className = "tour-layer"; h.appendChild(layer); }
  layer.innerHTML = `<div class="tour-veil"></div><div class="tour-spot" aria-hidden="true"></div><div class="tour-slot"></div>`;
  document.addEventListener("keydown", tKey, true);
  window.addEventListener("resize", tPlace, { passive: true });
  window.addEventListener("scroll", tPlace, { passive: true, capture: true });
  tShow();
}
function tClose() {
  const h = tHost(), layer = h && h.querySelector(".tour-layer");
  if (layer) layer.remove();
  document.removeEventListener("keydown", tKey, true);
  window.removeEventListener("resize", tPlace);
  window.removeEventListener("scroll", tPlace, { capture: true });
  tour.steps = null; tour.el = null;
  const b = tour.back; tour.back = null;
  if (b && b.isConnected && b.focus) b.focus(); else { const f = h && h.querySelector(".tour-fab"); if (f) f.focus(); }
}
function tShow() {
  const h = tHost(), slot = h && h.querySelector(".tour-slot");
  if (!slot || !tour.steps) return;
  const s = tour.steps[tour.i];
  slot.innerHTML = tourBoxHTML(s, tour.i, tour.steps.length, tour.L);
  tour.el = s.sel ? tFind(s.sel) : null;
  if (tour.el) {
    // 比螢幕一半還高的那種（整張表、整個清單）捲到它的頂端，留出頂欄的高度；其他的捲到正中間。
    const behavior = tReduce() ? "auto" : "smooth", r = tour.el.getBoundingClientRect();
    if (r.height > innerHeight * 0.55) window.scrollTo({ top: Math.max(0, scrollY + r.top - 96), behavior });
    else tour.el.scrollIntoView({ block: "center", inline: "nearest", behavior });
  }
  tPlace();
  // 平滑捲動要一點時間，停下來再對一次位置（不用 requestAnimationFrame：check.sh 只准 toy.js 有每一幀的迴圈）。
  clearTimeout(tour.place); tour.place = setTimeout(tPlace, tReduce() ? 0 : 420);
  const go = slot.querySelector('[data-tour="next"]') || slot.querySelector('.tour-btn:not(.quiet)');
  if (go) go.focus({ preventScroll: true });
}
function tPlace() {
  const h = tHost(), layer = h && h.querySelector(".tour-layer");
  if (!layer || !tour.steps) return;
  const s = tour.steps[tour.i];
  // 頁面重畫會把整塊換掉，舊的那個東西不在了就照選擇器再找一次。
  if (s.sel && (!tour.el || !tour.el.isConnected)) tour.el = tFind(s.sel);
  const spot = layer.querySelector(".tour-spot"), box = layer.querySelector(".tour-box"), veil = layer.querySelector(".tour-veil");
  let r = null;
  if (tour.el && tShown(tour.el)) {
    const b = tour.el.getBoundingClientRect(), p = 6, vw = innerWidth, vh = innerHeight;
    const top = Math.max(4, b.top - p), left = Math.max(4, b.left - p), bottom = Math.min(vh - 4, b.bottom + p), right = Math.min(vw - 4, b.right + p);
    if (bottom > top && right > left) r = { top, left, bottom, right };
  }
  veil.classList.toggle("dim", !r);
  spot.hidden = !r;
  if (r) Object.assign(spot.style, { top: r.top + "px", left: r.left + "px", width: (r.right - r.left) + "px", height: (r.bottom - r.top) + "px" });
  const pos = tourPlace(r, box.offsetWidth, box.offsetHeight, innerWidth, innerHeight);
  box.dataset.side = pos.side;
  Object.assign(box.style, { left: Math.round(pos.left) + "px", top: Math.round(pos.top) + "px" });
}
function tGo(d) {
  if (!tour.steps) return;
  const n = tour.i + d;
  if (n < 0) return;
  if (n >= tour.steps.length) return tClose();
  tour.i = n; tShow();
}
function tKey(e) {
  if (!tour.steps) return;
  if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); return tClose(); }
  const box = tHost() && tHost().querySelector(".tour-box");
  if (e.key === "Tab" && box) {
    // 焦點留在盒子裡：最後一顆再按 Tab 回第一顆，反過來也一樣。
    const bs = [...box.querySelectorAll("button")];
    if (!bs.length) return;
    const at = bs.indexOf(document.activeElement);
    if (e.shiftKey && at <= 0) { e.preventDefault(); bs[bs.length - 1].focus(); }
    else if (!e.shiftKey && (at === bs.length - 1 || at < 0)) { e.preventDefault(); bs[0].focus(); }
    return;
  }
  const typing = e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
  if (!typing && e.key === "ArrowRight") { e.preventDefault(); tGo(1); }
  else if (!typing && e.key === "ArrowLeft") { e.preventDefault(); tGo(-1); }
}
// 每一次重畫側欄都會叫到這裡：放好「怎麼用」那一顆、換語言、換頁時關掉開著的導覽。導覽只在按下那一顆時開。
function mountTour(group, tab, me, L) {
  if (!document.body) return;
  const page = tourPage(group, tab), moved = page !== tour.page;
  tour.page = page;
  let h = tHost();
  if (!h) {
    h = document.createElement("div"); h.id = "bt-tour"; document.body.appendChild(h);
    h.addEventListener("click", e => {
      const b = e.target.closest("[data-tour]"); if (!b) return;
      const a = b.dataset.tour;
      if (a === "open") { if (tour.steps) tClose(); const t = tCurrent(); tStart(t ? [t] : [welcomeTour()].filter(Boolean)); }
      else if (a === "next") tGo(1); else if (a === "back") tGo(-1); else if (a === "skip") tClose();
    });
  }
  if (h.dataset.lang !== L) {
    const old = h.querySelector(".tour-fab"), fab = document.createElement("div"); fab.innerHTML = tourFabHTML(L);
    if (old) old.replaceWith(fab.firstElementChild); else h.prepend(fab.firstElementChild);
    h.dataset.lang = L; tour.L = L;
    if (tour.steps) tShow();
  }
  if (tour.steps) { if (moved) tClose(); else setTimeout(tPlace, 0); }
}
