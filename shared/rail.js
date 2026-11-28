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
  q:        { zh: "搜尋紀錄、表單", en: "Search" },
  qLab:     { zh: "搜尋會議紀錄、回饋表、內部表單（按 / 跳到這裡）", en: "Search meeting notes, feedback and forms (press / to jump here)" },
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
  // 被指派才有的那幾行（2026-11-27 第二版）：對外網站、行銷、護照、紀錄、幹部招募。
  asg:      { zh: "指派", en: "Assigned" },
  asgTip:   { zh: "你被派進這一區，所以看得到", en: "You were assigned to this, so you can see it" },
  // Co-President 與 Senior Adviser 的六個 team 收成一行（2026-11-27 第二版）。
  teams:    { zh: "所有 team", en: "Teams" },
  teamsHint:{ zh: "六個 team 的專案、資源、錢", en: "Projects, resources and money for six teams" },
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
// 2026-11-27 第二版（Paul：「me and whole BT, essentially they're the same thing」）：「我的」與「整個 BT」合成最上面一段，不加標題。
//   上面那一段每個人都一樣、位置固定（首頁、行事曆、會議、專案、表單、我的護照、紀錄；場地 2026-11-28 搬進紀錄那一行），點久了手會記得；
//   下面「我的工作區」每個人長度不一樣：先是他的 team（一個 team 一行），再接被指派才有的（對外網站、行銷、護照、紀錄、幹部招募），旁邊標「指派」。
//   工作區放下面，因為放上面會把固定的那幾行往下推，每個人的位置都不一樣。
//   搜尋搬到頂欄（shared/nav.js），「+ 新增」拿掉：提需求、記會、排會放回首頁與每個 team 的頁上。
//   AREAS 裡 sec 是 top（人與權限、搜尋，在頂欄）與 team（錢，在 Sponsorship 那一行底下）的不畫成側欄的一行，分頁照舊在 AREAS 與 ITEMS 裡。
export const SECTIONS = [
  { key: "me",   label: null },
  // 我的工作區（2026-11-23）：team 那幾行不在 AREAS 裡，是照人畫的，見下面 myTeams() 與 teamRowsHTML()；後面接 AREAS 裡 sec 是 ws 的（被指派才有）。
  { key: "ws",   label: { zh: "我的工作區", en: "My workspaces" } },
];
export const AREAS = [
  { key: "home",      sec: "me",   label: { zh: "首頁",     en: "Home" },       hint: { zh: "等你處理的事，照日期排", en: "Everything waiting for you, by date" } },
  { key: "calendar",  sec: "me",   label: { zh: "行事曆",   en: "Calendar" },   hint: { zh: "月、週、日，排會，時間看板", en: "Month, week, day; availability" } },
  // 會議自己一行（2026-11-27 Paul：「take out meeting and template… into a separate category… home, calendar, meeting」）。
  // 底下是會議與會議範本；「記一場會議」在會議那一頁標題旁那一顆，也在首頁與每個 team 的頁上。
  { key: "meetings",  sec: "me",   label: { zh: "會議",     en: "Meetings" },   hint: { zh: "紀錄、記一場會議、範本", en: "Notes, log a meeting, templates" } },
  // 2026-12-26 Paul：工作區 → 專案 → 活動。這一行改叫「專案」，點下去是專案清單；活動在它底下。key 留 events（網址與測試都認它）。
  { key: "events",    sec: "me",   label: { zh: "專案",     en: "Projects" },   hint: { zh: "每個 team 的專案與活動", en: "Every team's projects and events" } },
  // 表單一個入口（2026-11-27 第二版 Paul：「they should be able to know like what's going on and like what form is for what」）：
  // 要我填的、所有表單（報名表、回饋表、內部表單三種，標類型與是哪一場活動的，也在這裡建一份）、內部表單、回饋表。
  { key: "forms",     sec: "me",   label: { zh: "表單",     en: "Forms" },      hint: { zh: "要填的、我管的、建一份", en: "To fill, the ones you run, make one" } },
  { key: "mypassport",sec: "me",   label: { zh: "我的護照", en: "My passport" }, hint: { zh: "蓋章與進度", en: "Your stamps and progress" } },
  // 2027-01-24（Paul：「records… right now they're in my workspace, but they're also inside whole BT. So it's confusing」）：
  //   整個 BT 的東西都畫在最上面這一段（不加標題），被派進去才有的也一樣，不再放進「我的工作區」。「我的工作區」只剩 team 與 Marketing。
  // 場地搬進紀錄這一行（2026-11-28 Paul：「put venue into records」）：紀錄的最後一個分頁。誰看得到照舊是 custom:venues，
  //   沒被派進紀錄、只有場地的人，這一行點下去就是場地。誰改得動不變：開得了活動的人照舊改得動。
  { key: "records",   sec: "me",   label: { zh: "紀錄",     en: "Records" },    hint: { zh: "活動、人、年度比較、場地", en: "Events, people, year by year, venues" } },
  { key: "passports", sec: "me",   label: { zh: "幹部護照", en: "Cadre passport" }, hint: { zh: "格子與入境章的城市", en: "Boxes and entry-stamp cities" } },
  // 對外網站是一個工作區（2026-11-27 第二版 Paul：「website should be something that they assign to」）：custom:website，
  //   在「人與權限 → 工作區」派人。這一行只畫給被派進去的人與 Co-President、Senior Adviser（areaWho）；
  //   某個 team「改」以上的人改自己 team 的資源庫與 BT 島，入口在他那個 team 那一行底下（teamRowsHTML），不在這一行。
  { key: "website",   sec: "me",   areaWho: "ws:custom:website", label: { zh: "對外網站", en: "Website" },    hint: { zh: "歷史之路、BT 島、網站上的活動與團隊頁", en: "History road, island, events and team page on the site" } },
  { key: "marketing", sec: "ws",   label: { zh: "行銷",     en: "Marketing" },  hint: { zh: "需求單、大學介紹貼文、IG", en: "Requests, college posts, Instagram" } },
  // 這幾行不畫在側欄：人與權限與搜尋在頂欄，錢在 Sponsorship 那一行底下（teamRowsHTML）。
  // 人與權限只有 Co-President 與 Senior Adviser 的頂欄有；被派進「申請」工作區的一般幹部頂欄沒有，所以照舊畫在「我的工作區」最後（railHTML）。
  { key: "search",    sec: "top",  label: { zh: "搜尋",     en: "Search" },     hint: { zh: "會議紀錄、回饋表一次找", en: "Meeting notes and feedback at once" } },
  { key: "people",    sec: "top",  label: { zh: "人與權限", en: "Internal" },   hint: { zh: "名單、邀請、幹部招募、工作區", en: "Roster, invites, recruitment, workspaces" } },
  { key: "money",     sec: "team", team: "Sponsorship Team", label: { zh: "錢", en: "Money" }, hint: { zh: "收支、預算、匯出", en: "Income, spending, budget" } },
  { key: "interns",   sec: "team", team: "Internship Team",  label: { zh: "實習護照", en: "Intern passport" }, hint: { zh: "格子、蛇梯棋、進度牆", en: "Boxes, game board, progress wall" } },
];
// 這一區在側欄上畫不畫成一行（看得到裡面至少一頁，而且過了 areaWho）。人與權限：非 Co-President／Senior Adviser 才畫在側欄。
export function areaShown(a, me) {
  if (!a || !visibleItems(a.key, me).length) return false;
  if (a.areaWho && !allowed(a.areaWho, me)) return false;
  if (a.sec === "me" || a.sec === "ws") return true;
  return a.key === "people" && !senior(me);
}

// 每一頁。group 是在哪個資料夾，key 是那個資料夾裡的分頁（#key），area 是側欄上的哪一行。
// who 決定畫不畫：cadre / president / senior / "ws:a|b"（被派進其中任何一個工作區，或 senior）。
// 同一個 area 裡的順序就是上方分頁的順序；第一個看得到的是側欄那一行點下去的地方。
// key 是空字串的那幾頁（時間看板、護照）是那個資料夾本身，連結不帶 #。
// 整個 BT 每天用的六樣（2027-01-24）：每一格是一個工作區，跟 admin/people/src/ui.js 的 WHOLE_BT_TOOLS 同一份清單。
export const WHOLE_BT_TOOLS = ["custom:calendar", "custom:meetings", "custom:projects", "custom:forms", "custom:my-passport", "custom:venues"];
export const ITEMS = [
  // 我的（2026-11-14）：首頁是 /home/，等你處理的事都在那一頁（以前後台還有一頁「待辦」，兩頁一樣的事，合併了）。
  { group: "home",      key: "home",       area: "home",      who: "cadre",  bare: true, label: { zh: "首頁", en: "Home" } },
  // 2027-01-24（Paul：「calendar, meeting, projects, forms, my passport, venues… all of those should be a project we can assign to people」）：
  //   整個 BT 每天用的六樣都是一格要派的工作區（custom:calendar…），在「人與權限 → 工作區 → 整個 BT」打勾。
  //   跑遷移檔那一刻每一位幹部六格都有（2027-01-24-whole-bt-tools.sql），之後新來的要 Paul 加。
  //   這幾格只決定側欄畫不畫、那一頁開不開；資料誰讀得到照舊是資料庫原本的門。
  { group: "home",      key: "calendar",   area: "calendar",  who: "ws:custom:calendar", ws: "custom:calendar", label: { zh: "行事曆", en: "Calendar" } },
  { group: "forms",     key: "meetings",   area: "meetings",  who: "ws:custom:meetings", ws: "custom:meetings", label: { zh: "會議", en: "Meetings" } },
  { group: "availability", key: "",        area: "calendar",  who: "ws:custom:calendar", ws: "custom:calendar", label: { zh: "時間看板", en: "Availability" } },
  // 會議範本（2026-11-13）：只有改得動的人看得到這一頁；其他人在記會議的下拉選單裡選得到範本。
  { group: "forms",     key: "mtemplates", area: "meetings",  who: "ws:custom:meeting-templates", ws: "custom:meeting-templates", label: { zh: "會議範本", en: "Templates" } },
  { group: "passport",  key: "",           area: "mypassport", who: "ws:custom:my-passport", ws: "custom:my-passport", label: { zh: "我的護照", en: "My passport" } },
  { group: "search",    key: "search",     area: "search",    who: "cadre",  bare: true, label: { zh: "搜尋", en: "Search" } },
  // 活動（2026-11-10 Paul：「application should live under events」）
  { group: "forms",     key: "projects",   area: "events",    who: "ws:custom:projects", ws: "custom:projects", label: { zh: "專案", en: "Projects" } },
  { group: "forms",     key: "events",     area: "events",    who: "ws:custom:projects", ws: "custom:projects", label: { zh: "活動", en: "Events" } },
  // 2026-11-26 Paul：「各 team」那一頁拿掉了（team 的人數與 Director 在幹部名單上），「計畫與招募」改叫「幹部招募」搬到「人與權限」底下，見下面。
  // 表單（2026-11-27 第二版）：一個入口。「所有表單」是每一位幹部都有的一頁（/admin/team-forms/#all）：
  //   我管的報名表、回饋表、內部表單一張清單，每一份標類型、是哪一場活動的、開著沒、收了幾份；最下面「建一份」先選類型。
  //   誰管得到哪一份照舊是資料庫決定（my_forms()，2027-01-23-website-and-forms.sql）。
  { group: "teamforms", key: "fill",       area: "forms",     who: "ws:custom:forms", ws: "custom:forms", label: { zh: "要我填的", en: "To fill" } },
  { group: "teamforms", key: "all",        area: "forms",     who: "ws:custom:forms", ws: "custom:forms", label: { zh: "所有表單", en: "All forms" } },
  { group: "teamforms", key: "build",      area: "forms",     who: "ws:team-forms", ws: "custom:team-forms", label: { zh: "內部表單", en: "Internal forms" } },
  // 回饋表（2026-11-27 Paul：「feedback form lives under records. I don't know why it's there」）：第二版收進「表單」。
  // 頁面還是紀錄那個資料夾的 #forms，這一行誰看得到不變（被派進「紀錄」的人）；改得動一場活動的人，他那場的回饋表在「所有表單」裡。
  { group: "records",   key: "forms",      area: "forms",     who: "ws:records", ws: "custom:records",    label: { zh: "回饋表", en: "Feedback forms" } },
  // 行銷：需求單一頁（送單、我送的、Marketing 的待辦都在這一頁，2026-11-13 Paul）
  // 2026-11-27 Paul：一般幹部（Associate）在行銷那一行看到一堆不是他的東西。側欄的「行銷」只給 Marketing 的人；
  //   其他人提需求按首頁或自己 team 那一頁的「跟 Marketing 提需求」，那一頁也列得出他送過的單（頁面本身照舊每一位幹部都進得去，見 GROUPS 的 forms）。
  { group: "forms",     key: "request",    area: "marketing", who: "ws:res:Marketing Team|custom:marketing-requests", ws: "custom:marketing-requests",  label: { zh: "需求單", en: "Requests" } },
  { group: "marketing", key: "posts",      area: "marketing", who: "ws:res:Marketing Team|custom:marketing-requests", ws: "res:Marketing Team", label: { zh: "大學介紹貼文", en: "College intro posts" } },
  { group: "marketing", key: "ig",         area: "marketing", who: "ws:res:Marketing Team|custom:marketing-requests", ws: "res:Marketing Team", label: { zh: "Instagram", en: "Instagram" } },
  // 對外網站（2026-11-27 第二版：一個要派人的工作區 custom:website）。這一行只畫給被派進去的人與 Co-President、Senior Adviser（AREAS 的 areaWho）。
  //   歷史之路與 BT 島：被派進對外網站「改」以上的人改得動（資料庫 can_edit_history()、can_edit_island_post() 2027-01-23 起多認這一格）。
  //   資源庫、BT 島的貼文、BT 島：某個 team「改」以上的人改自己 team 的那一份，入口在他那個 team 那一行底下；在這幾頁上方那一排照樣看得到這三頁。
  //   網站上的活動、團隊頁、校友故事、信的文字：照舊只有 Co-President 與 Senior Adviser。
  //   這只是側欄畫不畫，誰改得動照舊是每一頁自己的判斷與資料庫。
  { group: "site",      key: "events",     area: "website",   who: "senior", label: { zh: "網站上的活動", en: "Events on the site" } },
  { group: "site",      key: "history",    area: "website",   who: "edit:res:Marketing Team|custom:website", ws: "custom:website",  label: { zh: "BT 歷史之路", en: "History road" } },
  { group: "site",      key: "island-map", area: "website",   who: "editany:res:,edit:custom:website", ws: "custom:website", label: { zh: "BT 島", en: "BT Island" } },
  // BT 島上的貼文（2026-11-17）：每個 team 自己貼自己那座島的；貼得了哪座島看他的工作區。
  { group: "site",      key: "island",     area: "website",   who: "editany:res:,edit:custom:website", label: { zh: "BT 島的貼文", en: "Island posts" } },
  { group: "site",      key: "res",        area: "website",   who: "editany:res:", label: { zh: "資源庫", en: "Resources" } },
  { group: "site",      key: "team",       area: "website",   who: "senior", label: { zh: "團隊頁", en: "Team page" } },
  // 校友故事：2026-12-25 起 stories_for_review() 也回給 Senior Adviser（以前只給 Co-President，Senior Adviser 點進去是空的）。
  { group: "site",      key: "stories",    area: "website",   who: "senior", label: { zh: "校友故事", en: "Alumni stories" } },
  { group: "site",      key: "mail",       area: "website",   who: "senior", label: { zh: "信的文字", en: "Email wording" } },
  // 護照
  { group: "passports", key: "cadre",      area: "passports", who: "ws:passport", ws: "passport",        label: { zh: "幹部護照", en: "Cadre passport" } },
  { group: "passports", key: "cities",     area: "passports", who: "ws:passport", ws: "passport",        label: { zh: "入境章的城市", en: "Entry-stamp cities" } },
  // 實習護照（2027-01-24 Paul：「It's like intern passport. It lives under internship… when I press internship, there's no intern passport」）：
  //   自己一區 interns，畫在 Internship 那一行底下（跟錢在 Sponsorship 底下同一個做法，見 AREAS 的 sec team）。
  { group: "passports", key: "interns",    area: "interns",   who: "ws:intern-passport", ws: "intern-passport", label: { zh: "實習護照", en: "Intern passport" } },
  { group: "passports", key: "board",      area: "interns",   who: "ws:intern-passport", ws: "intern-passport", label: { zh: "實習的蛇梯棋", en: "Intern game board" } },
  // 實習生進度牆（2026-11-27 從「設定」的護照那一段搬來，那一段拿掉了）。頁面是 /intern-passport/ 本身。
  { group: "internwall", key: "",          area: "interns",   who: "ws:intern-passport", label: { zh: "實習生進度牆", en: "Intern progress wall" } },
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
  { group: "forms",     key: "venues",     area: "records",   who: "ws:custom:venues", ws: "custom:venues", label: { zh: "場地", en: "Venues" } },
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
  // 「a,b」是其中一條過就算（2026-11-27 第二版：BT 島是某個 team「改」以上，或對外網站「改」以上）。
  if (String(who).includes(",")) return String(who).split(",").some(w => allowed(w.trim(), me));
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
// team 那一行底下、某個 team「改」以上才有的對外那幾頁（2026-11-27 第二版：資源庫與 BT 島是 team 每天用的，從「對外網站」那一行搬到 team 底下）。
// 連結是 /admin/site/ 的同一頁，那一頁自己只讓他改自己 team 的那一份（ipCanEdit 與資料庫）。
// Marketing 那一行多一條歷史之路（Marketing「改」以上改得動它，沒被派進對外網站的話側欄就只有這一個入口）。
const TEAM_SITE = ["res", "history", "island", "island-map"];
export function teamSiteItems(me, team) {
  if (!me || me.role !== "cadre" || !(senior(me) || canEditWs(me, "res:" + team))) return [];
  return TEAM_SITE.filter(k => k !== "history" || team === "Marketing Team").map(k => itemOf("site", k)).filter(i => i && canSee(i, me));
}
// Co-President 與 Senior Adviser：六個 team 每一個都是「管」，六行太長，收成一行「所有 team」，滑過去選 team（2026-11-27 第二版）。
// 現在在某個 team 的頁（或錢）就展開，列出六個 team，現在那一個亮著；錢接在 Sponsorship 後面。
function seniorTeamsHTML(group, tab, me, L) {
  const now = itemOf(group, tab), extra = teamAreas(me);
  const links = TEAMS.map(team => {
    const on = group === "home" && tab === "team:" + team;
    const money = extra.filter(x => x.team === team).map(x => {
      const A = AREAS.find(a => a.key === x.area), mon = x.items.includes(now);
      return `<a class="rail-item rail-sub rail-sub2${mon ? " on" : ""}" ${linkAttrs(x.items[0], group, L)}${mon ? ' aria-current="page"' : ""}>${esc(tx(A.label, L))}</a>`;
    }).join("");
    return `<a class="rail-item rail-sub${on ? " on" : ""}" href="${esc(teamHref(team, L, group))}"${on ? ' aria-current="page"' : ""}>${esc(teamShort(team))}</a>${money}`;
  }).join("");
  const cur = (group === "home" && String(tab || "").startsWith("team:")) || extra.some(x => x.items.includes(now));
  const a = `<a class="rail-item rail-area rail-team${cur ? " here" : ""}" href="${esc(teamHref(TEAMS[0], L, group))}">${svg(ICON.team)}<span class="rail-txt"><b>${esc(tx(RT.teams, L))}</b><small>${esc(tx(RT.teamsHint, L))}</small></span><span class="rail-lv" title="${esc(fill(RT.wsRank, L, { rank: boardName(me.board, L) }))}">${TEAMS.length}</span></a>`;
  return cur ? a + `<div class="rail-subs">${links}</div>` : rowWithFly(a, tx(RT.teams, L), links);
}
function teamRowsHTML(group, tab, me, L) {
  if (!me || me.role !== "cadre") return "";
  if (senior(me)) return seniorTeamsHTML(group, tab, me, L);
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
  // 在資源庫、BT 島那幾頁：側欄上沒有「對外網站」那一行的人，亮他第一個改得動的 team（有那一行的人亮那一行）。
  const siteTeam = now && now.group === "site" && TEAM_SITE.includes(now.key) && !areaShown(AREAS.find(x => x.key === "website"), me)
    ? (teams.find(t => teamSiteItems(me, t.team).includes(now)) || {}).team : "";
  return note + teams.map(t => {
    const mine = extra.filter(x => x.team === t.team);
    const over = group === "home" && tab === "team:" + t.team;
    const cur = over || mine.some(x => x.items.includes(now)) || t.team === siteTeam;
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
    // 資源庫、BT 島的貼文、BT 島（這個 team「改」以上才有，teamSiteItems）。
    const site = teamSiteItems(me, t.team).map(i => {
      const on = i === now && t.team === siteTeam;
      return `<a class="rail-item rail-sub${on ? " on" : ""}" ${linkAttrs(i, group, L)}${on ? ' aria-current="page"' : ""}>${esc(tx(i.label, L))}</a>`;
    }).join("");
    const inner = `<a class="rail-item rail-sub${over ? " on" : ""}" href="${esc(teamHref(t.team, L, group))}"${over ? ' aria-current="page"' : ""}>${esc(tx(RT.wsOver, L))}</a>${projects}${site}${areaLinks}${ppl}`;
    const more = !!(projects || ppl || areaLinks || site);
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
  document.addEventListener("keydown", jumpToSearch);
}
// 按 / 跳到側欄的搜尋框（2026-11-27 第三版，像 GitHub、Slack）。游標已經在某個可以打字的地方就不搶，按著 Ctrl、Cmd、Alt 也不算。
// 搜尋那一頁自己有一格大的，側欄不畫（searchBoxHTML），那一頁按 / 跳到那一格。
export function slashTarget(ev, doc) {
  if (!ev || ev.key !== "/" || ev.ctrlKey || ev.metaKey || ev.altKey || ev.defaultPrevented) return null;
  const a = doc && doc.activeElement;
  if (a && (a.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName || ""))) return null;
  return doc.querySelector('.rail-q input[name="q"]') || doc.querySelector('main input[name="q"], #bt-root input[type="search"][name="q"]');
}
function jumpToSearch(ev) {
  const el = slashTarget(ev, document);
  if (!el) return;
  ev.preventDefault();
  const t = document.getElementById("rail-toggle");
  if (t && !t.checked && el.closest(".rail") && getComputedStyle(document.querySelector(".rail")).display === "none") t.checked = true;
  el.focus();
}
// 側欄最上面的搜尋框（2026-11-27 第三版，Paul：「I want you to find somewhere else to put that search box」）。
// 第二版放在頂欄正中間，一整條太搶眼；搬到側欄名字底下、首頁上面：每一頁同一個位置，就在要點的那幾行旁邊。
// 送出是一般的表單：到 /admin/search/?q=…，那一頁自己讀 ?q= 開始找（admin/search/src/main.js parseHash）。
// 在搜尋那一頁上不畫：頁面裡已經有一格大的，兩格會不知道打哪一格。
export function searchBoxHTML(group, L) {
  if (group === "search") return "";
  return `<form class="rail-q" role="search" action="/admin/search/" method="get">
      <svg class="rail-q-ico" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg>
      <input type="search" name="q" maxlength="200" placeholder="${esc(tx(RT.q, L))}" aria-label="${esc(tx(RT.qLab, L))}" autocomplete="off">
      <kbd aria-hidden="true">/</kbd>
      <input type="hidden" name="lang" value="${L === "en" ? "en" : "zh"}">
    </form>`;
}

// ── 誰排得了會（2026-11-27）──────────────────────────────────────────────
// 首頁與每個 team 的頁上「記一場會議」「排一場會」那兩顆只畫給排得了會的人：Co-President、Senior Adviser、某個 team 是「改」以上
// （跟資料庫的 can_schedule 同一條）。2026-11-27 第二版拿掉了側欄最上面的「+ 新增」（Paul：「take away the plus new button on the top left」），
// 那三件事放回首頁與 team 的頁（home/src/ui.js 的 quickHTML）。
export const canSchedule = me => !!me && me.role === "cadre" && (senior(me) || canEditAny(me, "res:"));

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
    // 被指派才有的那幾行標「指派」（Co-President 與 Senior Adviser 依職級全部都有，不標）。
    const asg = a.sec !== "me" && !senior(me) ? `<span class="rail-lv dim" title="${esc(tx(RT.asgTip, L))}">${esc(tx(RT.asg, L))}</span>` : "";
    const link = `<a class="rail-item rail-area${cls}" ${linkAttrs(first, group, L)}${on && !open ? ' aria-current="page"' : ""}>${svg(ICON[a.key] || "")}<span class="rail-txt"><b>${esc(tx(a.label, L))}</b><small>${esc(tx(a.hint, L))}</small></span>${n && !open ? `<span class="rail-count">${esc(String(n))}</span>` : asg}</a>`;
    // 沒展開、底下又不只一頁的那一行：滑過去看得到每一頁（見 rowWithFly）。
    const fly = !open && items.length > 1 ? items.map(i => { const k = cnt(i); return `<a class="rail-item rail-sub" ${linkAttrs(i, group, L)}>${esc(tx(i.label, L))}${k ? `<span class="rail-count">${esc(String(k))}</span>` : ""}</a>`; }).join("") : "";
    return (fly ? rowWithFly(link, tx(a.label, L), fly) : link) + subs;
  };
  const body = SECTIONS.map(s => {
    // 「我的工作區」：先是 team 那幾行，再接被指派才有的（sec ws），最後是人與權限（只有頂欄沒有它的人，見 areaShown）。
    // 最上面那一段：整個 BT 的東西，連被派進去才有的（紀錄、幹部護照、對外網站、只被派進申請的人的那一行）都在這裡（2027-01-24）。
    const rows = s.key === "ws"
      ? teamRowsHTML(group, tab, me, L) + AREAS.filter(a => a.sec === "ws").filter(a => areaShown(a, me)).map(row).join("")
      : AREAS.filter(a => (a.sec === s.key || a.sec === "top") && areaShown(a, me)).map(row).join("");
    if (!rows) return "";
    return (s.label ? `<div class="rail-group">${esc(tx(s.label, L))}</div>` : "") + rows;
  }).join("");
  const teams = senior(me) ? [tx(RT.allTeams, L)] : String(me && me.team || "").split(/[,、;；]/).map(s => s.trim()).filter(Boolean);
  return `<input class="rail-toggle" type="checkbox" id="rail-toggle" aria-label="${esc(tx(RT.open, L))}">
  <label class="rail-burger" for="rail-toggle">${esc(tx(RT.menu, L))}</label>
  <nav class="rail" aria-label="${esc(tx(RT.groups, L))}">
    <div class="rail-me"><b>${esc(me && me.name || "")}</b>
      <span>${esc(boardName(me && me.board, L))}・${teams.length ? esc(teams.join(tx(RT.list, L))) : esc(tx(RT.noTeam, L))}</span></div>
    ${searchBoxHTML(group, L)}
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
  // 側欄上沒有畫成一行的那一區（人與權限在頂欄、錢在 Sponsorship 底下、沒被派進對外網站的人在資源庫那幾頁）：
  // 寬螢幕上側欄列不出它的每一頁，這一排要照畫（rail.css 的 .keep）。
  const a = AREAS.find(x => x.key === it.area);
  const keep = a && !areaShown(a, me) ? " keep" : "";
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
// 2026-11-27 第二版（Paul：「you're supposed to say like how the actual pages work… if you want to make a sign up and feedback event form, you should go there. And then once you click into it, there's boxes you can edit」）：
//   每一步講「要做某件事，按哪裡、填什麼、按下去之後會怎樣」，不是「這裡有六個分頁」。一頁可以到 8 步。
//   一頁有好幾種畫面（清單、編輯頁、審核）時，各寫一段，用 when／unless 分開；有 when 的寫在前面（挑第一個對得上的）。
//   go 是導覽先幫你按的分頁（見下面 TOUR_GO），按了才框得到分頁裡面的東西。
const TEAM_PAGES = TEAMS.map(t => "home:team:" + t);
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
    { at: [".home .quick", ".home .hello"], t: { zh: "從這裡開始做事", en: "Start things from here" },
      b: { zh: "「跟 Marketing 提需求」開一張需求單。排得了會的人還有「記一場會議」（開完會寫紀錄）與「排一場會」（打開行事曆的排會，邀請會寄出去）。", en: "Ask Marketing opens a request. If you can schedule meetings you also get Log a meeting, for notes after a meeting, and Schedule a meeting, which opens the scheduler and sends the invites." } },
    { at: ".home .block.wait", t: { zh: "把這張清單清掉", en: "Clear this list" },
      b: { zh: "要你動手的事都在這裡，最急的在最上面，點一行就到那件事。會議直接在這裡按「我會到」或「不能到」；必到的會說不能到，要寫原因給排會的人。", en: "Everything that needs you, most urgent first; tap a row to go straight to it. Reply to a meeting here with I'll be there or Can't make it. For a required meeting, Can't make it asks for a reason." } },
    { at: ".home .wait + .block", t: { zh: "接下來的會與活動", en: "Coming up" },
      b: { zh: "接下來六十天排給你的會與活動。點標題看議程與誰會到；有 Meet 連結的會議會多一顆「加入 Google Meet」。", en: "Your meetings and events for the next 60 days. Click a title for the agenda and who is coming; meetings with a Meet link get a Join Google Meet button." } },
    { at: ".home .block.pp", t: { zh: "我的護照", en: "My passport" },
      b: { zh: "你蓋了幾格章。點進去蓋章、寫一句話、放照片，這些只有你自己看得到。", en: "How many stamps you have. Open it to stamp, write a line and add a photo; only you can see those." } },
    { at: ".home .block.pairs", t: { zh: "Mentorship", en: "Mentorship" },
      b: { zh: "你帶的 mentee 或你的 mentor 在這裡，check-in 的連結也在這裡，填過的會打勾。", en: "Your mentees or your mentor, with your check-in links. The ones you have filled in are ticked." } },
    { at: [".rail a.rail-area[href='#calendar']", ".rail-burger"], t: { zh: "行事曆在隔壁", en: "The Calendar is next door" },
      b: { zh: "「行事曆」用月、週、日看所有的會與活動。在「時間看板」填你什麼時候有空，排會的人在行事曆就看得到。", en: "Calendar shows every meeting and event by month, week or day. Fill in when you are free under Availability, and organizers see it in the Calendar." } },
  ] },
  // 一個 team 的頁（/home/#team=…）。page 是 home:team:<team 全名>，六個 team 共用這一段。
  { id: "team-home", page: TEAM_PAGES, steps: [
    { at: ".home.team .hello", t: { zh: "這個 team 的首頁", en: "This team's home" },
      b: { zh: "第一行寫著你在這個 team 是「看」「改」還是「管」。看只能看；改開得了專案與活動；管還能加人、改別人的等級。", en: "The first line says whether you can View, Edit or Manage here. View is read-only; Edit can create projects and events; Manage can also add people and change their level." } },
    { at: ".home.team .quick", t: { zh: "從這裡做，team 先幫你選好", en: "Start here and the team is filled in" },
      b: { zh: "提需求、記一場會議、排一場會，從這裡按會先填好這個 team，不用再選一次。", en: "Ask Marketing, Log a meeting and Schedule a meeting all start with this team already picked." } },
    { at: [".home.team .tcards", ".home.team section.block"], t: { zh: "專案", en: "Projects" },
      b: { zh: "一個專案收好幾場活動，例如營隊加說明會。改以上的人按「開一個專案」，再到每一場活動的「設定」分頁把它放進來。", en: "A project holds several events, such as a camp and its info session. With Edit, press Create a project, then put each event in it from that event's Settings tab." } },
    { at: ".home.team section.block:nth-of-type(2)", t: { zh: "還沒放進專案的活動", en: "Events not in a project" },
      b: { zh: "點一行打開那場活動的編輯頁。「開一場活動」也在這裡，一開始是草稿，外面看不到。", en: "Click a row to open the event editor. Create an event is here too; it starts as a draft nobody outside can see." } },
    { at: ".home.team section.block:nth-of-type(3)", t: { zh: "申請表", en: "Application forms" },
      b: { zh: "這個 team 的計畫與招募申請表。按「到申請表清單」看收到的申請、改題目。", en: "This team's programme and recruitment forms. Go to applications to read what came in or change the questions." } },
    { at: ".home.team section.block:nth-of-type(4)", t: { zh: "資源", en: "Resources" },
      b: { zh: "改以上的人在資源庫加一條連結，對外的 /resources/ 就看得到。檔案本身留在 Google Drive。", en: "With Edit you add a link in Resources and it shows on the public /resources/ page. The file itself stays in Google Drive." } },
  ] },
  // 排會那一塊（點日期、拖一段、首頁的「排一場會」打開）。要寫在行事曆那兩段前面。
  { id: "schedule", page: "home:calendar", when: "#sch-modal", steps: [
    { at: "#sch-key", t: { zh: "什麼時候", en: "When" },
      b: { zh: "選日期、開始與結束，長度會自己算。改開始時間長度不變，改結束時間長度跟著變。", en: "Pick the date, start and end; the length works itself out. Changing the start keeps the length; changing the end changes it." } },
    { at: "#sch-scope", t: { zh: "誰的會、要不要到", en: "Whose meeting, and is it required" },
      b: { zh: "範圍是這場會算在哪個 team 或整個 BT。必到的會，有人說不能到就要寫原因給你。", en: "Scope says which team, or all of BT, it belongs to. On a required meeting, anyone who can't come has to give you a reason." } },
    { at: "#sch-title", t: { zh: "標題、議程、留言", en: "Headline, agenda, message" },
      b: { zh: "標題一定要填。議程與給大家的留言會放進邀請信，會議紀錄的 Docs 連結可以之後再補。", en: "The headline is required. The agenda and your message go into the invite; the Docs link for notes can be added later." } },
    { at: ".sch-who", t: { zh: "勾要邀請的人", en: "Tick who to invite" },
      b: { zh: "每個人後面標著那段時間有沒有空，有空的排在最上面。可以找名字，或按「全勾看到的」。", en: "Each name shows whether they are free then, with free people at the top. Search by name or press Tick all shown." } },
    { at: "[data-act='sch-day']", t: { zh: "不確定哪個時間好", en: "Not sure which time works" },
      b: { zh: "按這一行看這一天每半小時有幾個人有空，挑一格再排。", en: "Open this to see how many people are free each half hour that day, then pick a slot." } },
    { at: "#sch-send", t: { zh: "排會並寄邀請", en: "Schedule and invite" },
      b: { zh: "按下去，BT 的 Google 帳號開一場有 Meet 的會，每個人收到 Google 邀請與網站的信，在信裡回會不會到。之後要改或取消，到「會議」那一頁。", en: "BT's Google account creates the meeting with a Meet link; everyone gets a Google invite and an email from the site to reply. To change or cancel it later, use the Meetings page." } },
  ] },
  // 行事曆的月與週（點一天之後的「日」是下一段）
  { id: "calendar", page: "home:calendar", unless: ".cal .dgrid", steps: [
    { at: ".cal .calbar", t: { zh: "月、週、日", en: "Month, week or day" },
      b: { zh: "左邊切換月、週、日，箭頭往前往後翻，「今天」跳回今天。", en: "Switch between Month, Week and Day on the left. The arrows move back and forward; Today jumps back to today." } },
    { at: ".cal .calbar .seg:last-of-type", t: { zh: "排會之前先看會不會撞期", en: "Check for clashes before you schedule" },
      b: { zh: "「只看我的」只放邀了你的會、你排的會與活動。「整個 BT」連別人的會也放上來，排會之前切過去看一下。", en: "Just mine shows meetings you are invited to or organized, plus events. All of BT adds everyone else's meetings; switch to it before you schedule." } },
    { at: [".cal .month", ".cal .week"], t: { zh: "回覆一場會", en: "Reply to a meeting" },
      b: { zh: "實心是必到，框線是選擇參加，橘色是活動。點一個打開，會議可以在裡面回覆會不會到。", en: "Solid is required, outlined is optional, orange is an event. Click one to open it; you can reply to a meeting from there." } },
    { at: [".cal .month .day.today .dnum", ".cal .wcol.today", ".cal .dnum"], t: { zh: "排一場會", en: "Schedule a meeting" },
      b: { zh: "排得了會的人在月曆點日期、在週曆按住拖一段時間，排會那一塊就跳出來，每個人後面標著那段時間有沒有空。其他人點日期是打開那一天。", en: "If you can schedule, click a date in Month or drag across a time in Week and the scheduler opens, showing who is free then. Everyone else opens that day instead." } },
    { at: AT_SUBS, t: { zh: "先填你什麼時候有空", en: "Fill in when you are free" },
      b: { zh: "排會時名字後面的標、「日」的底色，都是照大家在「時間看板」填的算。你沒填，別人排會就不知道你有沒有空。", en: "The free marks in the scheduler and the Day view's shading come from what everyone fills in under Availability. If you don't fill it in, nobody can see when you are free." } },
  ] },
  { id: "calendar-day", page: "home:calendar", when: ".cal .dgrid", steps: [
    { at: ".cal .dchips", t: { zh: "只算一個 team", en: "Count one team" },
      b: { zh: "按一個 team，底色就只算那個 team 的人。按「所有人」回到全部。", en: "Pick a team and the shading counts only that team. Everyone goes back to all members." } },
    { at: ".cal .dweek .wscroll", t: { zh: "點一格排會", en: "Click a half hour to schedule" },
      b: { zh: "底色越深，那半小時有空的人越多，滑鼠移過去看得到是誰。排得了會的人點一格，排會那一塊就跳出來，整段有空的人先幫你勾好。", en: "The darker a half hour, the more people are free; hover to see who. If you can schedule, click one and the scheduler opens with everyone free for the whole slot already ticked." } },
    { at: ".cal .dcol .chipi", t: { zh: "這一天的會與活動", en: "This day's meetings and events" },
      b: { zh: "這一天已經排好的會與活動疊在上面，點一個打開。", en: "Meetings and events already on this day sit on top. Click one to open it." } },
    { at: ".cal a[href*='availability']", t: { zh: "人數從哪裡來", en: "Where the counts come from" },
      b: { zh: "人數是照每個人在「時間看板」填的時間算的，沒填的人不會被算進去。點這裡改你自己的。", en: "Counts come from the free times each person fills in under Availability; anyone who hasn't filled theirs in isn't counted. Click here to edit yours." } },
    { at: ".cal .calbar .seg", t: { zh: "回到月或週", en: "Back to month or week" },
      b: { zh: "按「月」或「週」回到整段時間。", en: "Press Month or Week to go back to the wider view." } },
  ] },

  // ── 時間看板（/availability/）：第一次的說明、選時區、我的時間、成員 ──
  { id: "availability-notice", page: "availability:", when: "[data-act='notice-ok']", steps: [
    { t: { zh: "填一次，排會的人就看得到", en: "Fill it in once and organizers see it" },
      b: { zh: "你在這裡填每週什麼時候有空。其他幹部看得到這些時間，看不到你護照裡寫的與照片。", en: "You fill in when you are free each week. Other cadres can see these times, but never what you wrote in your passport or your photos." } },
    { at: "[data-act='notice-ok']", t: { zh: "按這裡開始", en: "Start here" },
      b: { zh: "按「我知道了，開始填」。還沒設定時區的話，下一步先選時區。", en: "Press Got it, start filling in. If you have no time zone yet, you pick it next." } },
    { at: AT_SUBS, t: { zh: "填的時間用在哪裡", en: "Where your times are used" },
      b: { zh: "行事曆的「日」照大家填的時間畫底色，排會時你名字後面也會標有沒有空。", en: "The Calendar's Day view is shaded from everyone's times, and the scheduler marks you free or busy from them." } },
  ] },
  { id: "availability-tz", page: "availability:", when: "#tzq", steps: [
    { at: "#tzq", t: { zh: "找你的時區", en: "Find your time zone" },
      b: { zh: "打城市或國家的名字，例如 Taipei、London。", en: "Type a city or country, such as Taipei or London." } },
    { at: ".tzlist", t: { zh: "點一個", en: "Pick one" },
      b: { zh: "點你現在住的那一個。之後搬家到設定改，你填的時間會照新的時區重算。", en: "Click where you live now. If you move, change it in Settings and your times are recalculated." } },
    { at: ".main .wnote", t: { zh: "讓電腦猜", en: "Let the computer guess" },
      b: { zh: "不確定的話，按這一行裡的按鈕，用這台電腦現在的時區。", en: "Not sure? Use the button in this line to take this computer's time zone." } },
  ] },
  { id: "availability-who", page: "availability:", when: ".main table.who", steps: [
    { at: ".main .teamfilter", t: { zh: "只看一個 team", en: "One team at a time" },
      b: { zh: "按一個 team，只列那個 team 的人。", en: "Pick a team to list only its people." } },
    { at: ".main table.who", t: { zh: "誰該更新了", en: "Who needs to update" },
      b: { zh: "一個人一列：在哪裡、上次什麼時候更新。紅色是超過三十天沒更新或從沒填過，可以提醒他；寫「還沒設定時區」的人排會時不會被算進去。", en: "One row each: where they are and when they last updated. Red means over 30 days or never; nudge them. Anyone marked No time zone yet isn't counted when scheduling." } },
    { at: ".main .bar .tocal", t: { zh: "去排會", en: "Go and schedule" },
      b: { zh: "大家填好之後，到行事曆的「日」看每半小時幾個人有空，點一格排會。", en: "Once people have filled theirs in, open the Calendar's Day view to see who is free each half hour and click one to schedule." } },
    { at: ".main .bar .tabs [data-t='mine']", t: { zh: "改你自己的", en: "Edit your own" },
      b: { zh: "回「我的時間」改你自己有空的時間。", en: "Go back to My time to edit your own free times." } },
  ] },
  { id: "availability", page: "availability:", steps: [
    { at: ".main .modeswitch", t: { zh: "平常的時間，或某一週", en: "Usual times, or one week" },
      b: { zh: "「平常的時間」每週重複，填一次用一學期。「某一週」是例外，會取代那一週的平常時間，例如考試週或出國。", en: "Usual times repeat every week, so one fill lasts a semester. A specific week is an exception that replaces your usual times that week, for exams or travel." } },
    { at: ".main .batch", t: { zh: "一次填一段", en: "Fill a range at once" },
      b: { zh: "選時段、勾星期（或按「平日」「週末」），按「加入這段」。填錯了一樣選好，按「拿掉這段」。", en: "Pick the time, tick the days (or press Weekdays or Weekend), then press Add this range. To undo, select the same and press Remove this range." } },
    { at: ".main .brow.copy", t: { zh: "複製一天", en: "Copy a day" },
      b: { zh: "某一天填好了，選它，再勾其他天，按「複製到勾選的那幾天」。", en: "Once one day is right, choose it, tick the other days and press Copy to the ticked days." } },
    { at: ".main .gridwrap.mine", t: { zh: "一格一格改", en: "Fine-tune by the half hour" },
      b: { zh: "點一格就開或關那半小時。手機上用上面的「一次填一段」比較快。", en: "Click a cell to turn that half hour on or off. On a phone, filling a range above is quicker." } },
    { at: ".main .autosave", t: { zh: "會自己存", en: "It saves by itself" },
      b: { zh: "改完不用按存，停下來一秒就存好。時間沒變的話按「我確認過了，沒有變」，大家就知道你的時間是新的。", en: "No save button: it saves a second after you stop. If nothing changed, press I checked, nothing changed so people know your times are current." } },
    { at: ".main .bar .tocal", t: { zh: "填完去排會", en: "Then schedule" },
      b: { zh: "行事曆的「日」照大家填的時間畫出每半小時幾個人有空，排得了會的人在那裡點一格排會。", en: "The Calendar's Day view shows how many people are free each half hour from these times; organizers click one there to schedule." } },
  ] },

  // ── 我的護照（/passport/）：護照本身、進度牆 ──
  { id: "passport-wall", page: "passport:", when: ".main .wall", steps: [
    { at: [".wall .people", ".wall .empty"], t: { zh: "大家蓋到哪裡", en: "How far everyone is" },
      b: { zh: "一個人一列，看得到名字、team、大頭照與蓋了幾格。寫的那一句與照片不會出現在這裡。", en: "One row each, with name, team, photo and how many stamps. The lines people wrote and their photos never show here." } },
    { at: ".wall .person .track", t: { zh: "一個月一段", en: "One segment per month" },
      b: { zh: "每一段是一個月，滿了就是那個月蓋完了。", en: "Each segment is a month; a full one means that month is done." } },
    { at: ".wall .feed", t: { zh: "最近蓋的章", en: "Recent stamps" },
      b: { zh: "大家最近蓋了哪幾格。", en: "The boxes people stamped most recently." } },
    { at: ".main .bar .tabs [data-v='passport']", t: { zh: "回到你的護照", en: "Back to your passport" },
      b: { zh: "按這裡回去蓋你自己的章。", en: "Go back to stamp your own." } },
  ] },
  { id: "passport", page: "passport:", steps: [
    { at: ".main .bar .prog", t: { zh: "你蓋了幾格", en: "Your stamps" },
      b: { zh: "這一屆你蓋了幾格、總共幾格。每一格是一件 BT 的事：一次聚會、一個題目、一張照片。", en: "How many boxes you have stamped this year out of the total. Each box is one BT thing: a gathering, a question or a photo." } },
    { at: ".main .book .nav .dots", t: { zh: "翻頁", en: "Turn the pages" },
      b: { zh: "第一頁是你的資料，後面一個月一頁。點圓點跳頁，或按鍵盤的左右鍵。", en: "The first page is your details, then one page per month. Click a dot to jump, or use the left and right arrow keys." } },
    { go: ".main .book .nav .dots button[data-p='1']", at: [".main .book .slots", ".main .book .veil"], t: { zh: "一個月一頁", en: "One page per month" },
      b: { zh: "每個月幾格，分三種：聚會、題目（只有你看得到的一個問題）、鏡頭（拍一張照片）。還沒開放的月份是封起來的。", en: "Each month has a few boxes of three kinds: Gather, Prompt (a question only you see) and Frame (a photo to take). Months not open yet are sealed." } },
    { at: [".main .book .slot[data-done='0']", ".main .book .slot"], t: { zh: "怎麼蓋章", en: "How to stamp" },
      b: { zh: "點一格，填日期、一句話、照片（都可以留空），按「蓋章」。蓋錯了打開那一格，按「撕掉這格」。", en: "Click a box, fill in the date, one line and a photo (all optional), then press Stamp. Wrong box? Open it and press Tear this off." } },
    { t: { zh: "只有你看得到", en: "Only you can see it" },
      b: { zh: "你寫的那一句與照片只放在你自己的護照裡。進度牆上別人只看得到你蓋了幾格。", en: "Your lines and photos stay in your own passport. On the progress wall, others only see how many boxes you have stamped." } },
    { t: { zh: "蓋滿一個月", en: "Fill a month" },
      b: { zh: "一個月每一格都蓋好，就多一個入境章。城市是抽的，抽到就固定了，撕掉重蓋也是同一個。", en: "Stamp every box in a month and you get an entry stamp. The city is drawn once and stays, even if you tear a box off and stamp it again." } },
    { at: ".main .bar .tabs [data-v='wall']", t: { zh: "看大家的進度", en: "See everyone's progress" },
      b: { zh: "「進度牆」看每一位幹部蓋到哪裡。", en: "The progress wall shows how far every cadre has got." } },
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
      b: { zh: "用「記一場會議」記下來的會（首頁或會議那一頁），紀錄、議程與標題都找得到。開完會把重點寫進紀錄，之後就不用一場一場點開。", en: "Meetings logged with Log a meeting (on Home or the Meetings page) are searchable by notes, agenda and title. Write the key points into the notes and nobody has to open meetings one by one later." } },
    { at: "#sx-settings", t: { zh: "給 AI 讀哪些", en: "What the AI may read" },
      b: { zh: "只有 Co-President 看得到這一塊：勾哪幾種可以給 AI 讀。回饋表與活動檢討要先補隱私政策再打開。", en: "Only Co-Presidents see this: which kinds the AI may read. Feedback forms and event reviews stay off until the privacy policy covers them." } },
  ] },

  // ── 會議（/admin/#meetings）：記一場、一場的頁、清單 ──
  { id: "meeting-new", page: "forms:meetings", when: "[data-act='mt-back']", unless: ".rq-dl", steps: [
    { t: { zh: "記一場會議", en: "Log a meeting" },
      b: { zh: "開完的會，或在別的地方約好的會，在這裡記下來。這裡記的不寄信，也不放上 Google 日曆；要寄邀請，到行事曆點日期排。", en: "Log a meeting that already happened or was arranged elsewhere. Logging sends no email and adds nothing to Google Calendar; to send invites, schedule from the Calendar." } },
    { at: "#mt-scope", t: { zh: "誰的會、要不要到", en: "Whose meeting, and is it required" },
      b: { zh: "範圍選 team 或整個 BT，再選必到或選擇參加。", en: "Pick the team, or all of BT, then Required or Optional." } },
    { at: "#mt-title", t: { zh: "標題、時間、議程", en: "Title, time, agenda" },
      b: { zh: "填標題、開始與結束（結束要比開始晚）、一行議程。會議紀錄的連結只收 Google Docs 或 Drive 的。", en: "Fill in the title, start and end (end after start) and a one-line agenda. The notes link must be a Google Docs or Drive link." } },
    { at: "#mtn-min", t: { zh: "寫紀錄", en: "Write the minutes" },
      b: { zh: "選一份範本，每一段一個框，框裡的灰字是提示。要多一段按「加一段」。", en: "Pick a template; each section gets its own box with a hint inside. Press Add a section for more." } },
    { at: ".ma.picker[data-ns='mt']", t: { zh: "誰出席", en: "Who was there" },
      b: { zh: "右邊找名字或按 team，勾起來；左邊是已經在名單上的人。", en: "On the right, search or pick a team and tick people; the left lists who is already on the list." } },
    { at: "#mt-form [data-act='mt-save']", t: { zh: "記下來", en: "Log it" },
      b: { zh: "按「記下來」。之後在上面的搜尋找得到這場會的紀錄、議程與標題。", en: "Press Log it. Its notes, agenda and title are then searchable from the search box." } },
  ] },
  { id: "meeting", page: "forms:meetings", when: ".rq-dl", steps: [
    { at: "main.main > section.section:nth-of-type(1)", t: { zh: "這場會", en: "This meeting" },
      b: { zh: "時間、範圍、議程。從行事曆排的會，Google 日曆與 Meet 連結也在這裡。", en: "Time, scope and agenda. For meetings scheduled from the Calendar, the Google Calendar entry and Meet link are here too." } },
    { at: [".mt-rsvp", "main.main > section.section:nth-of-type(2)"], t: { zh: "誰會到", en: "Who is coming" },
      b: { zh: "會到、還沒回、不能到三欄，不能到的原因寫在旁邊。大家在首頁、信裡或 Google 日曆回覆，不是在這裡。", en: "Coming, No reply and Can't make it, with reasons beside them. People reply from Home, the email or Google Calendar, not here." } },
    { at: ["section.section:has(#mtm-min)", "section.section:has(.mtm-read)"], t: { zh: "寫紀錄", en: "Write the minutes" },
      b: { zh: "選一份範本，在框裡打字就存。名單上的人都改得動。寫進紀錄的字，之後在搜尋找得到。", en: "Pick a template and type in the boxes; it saves as you go. Anyone on the list can edit. What you write becomes searchable." } },
    { at: "#mt-form", t: { zh: "改時間、名單、議程", en: "Change the time, list or agenda" },
      b: { zh: "改了就存。從行事曆排的會，停手十分鐘之後會寄更新信給大家；被拿掉的人收到取消信。", en: "Changes save as you go. For a scheduled meeting, ten minutes after you stop an update email goes to everyone; anyone removed gets a cancellation." } },
    { at: "[data-act='mt-delete']", t: { zh: "取消這場會", en: "Cancel the meeting" },
      b: { zh: "「刪掉這一場」會問兩次，日曆上有這場會的人都會收到取消。", en: "Delete asks twice, and everyone with it on their calendar gets a cancellation." } },
    { at: ".main .back", t: { zh: "回到所有的會", en: "Back to all meetings" },
      b: { zh: "按這裡回到會議清單。", en: "This takes you back to the list." } },
  ] },
  { id: "meetings", page: "forms:meetings", steps: [
    { at: AT_HEAD, t: { zh: "所有的會", en: "All meetings" },
      b: { zh: "要寄邀請的會，到行事曆點日期排；開完的會在這裡記紀錄。兩種都會列在這裡。", en: "Meetings with invites are scheduled from the Calendar; meetings that already happened are logged here. Both are listed on this page." } },
    { at: ".page-head a[href='#meetings/new']", t: { zh: "記一場會議", en: "Log a meeting" },
      b: { zh: "按這裡記一場：範圍、時間、紀錄、誰出席。要某個 team「改」以上才記得了那個 team 的會。", en: "Press this to log one: scope, time, minutes and who attended. You need Edit on a team to log that team's meetings." } },
    { at: "#mtl-q", t: { zh: "找一場會", en: "Find a meeting" },
      b: { zh: "打標題或 team 的名字，清單馬上縮小。", en: "Type a title or team name and the list narrows straight away." } },
    { at: ["[data-mt-row]", "main.main > section.section:nth-of-type(1)"], t: { zh: "點一場打開", en: "Open one" },
      b: { zh: "每一列寫著必到或選擇參加、邀了幾個人、幾個人說會到。點標題寫紀錄、看誰會到、改時間。", en: "Each row shows Required or Optional, how many were invited and how many are coming. Click a title to write minutes, see replies or change the time." } },
    { at: AT_SUBS, t: { zh: "會議範本", en: "Templates" },
      b: { zh: "「會議範本」讓每一次的紀錄照同一個格式寫，例如「決定的事」「誰要做什麼」。", en: "Templates keep every set of minutes in the same shape, such as Decisions and Who does what." } },
  ] },
  { id: "mtemplate-edit", page: "forms:mtemplates", when: "#mtpl-ed", steps: [
    { at: "#mtpl-title", t: { zh: "名字與給哪種會", en: "Name, and which meetings" },
      b: { zh: "取一個看得懂的名字，再選給哪一種會用；選「每一種會都能用」就每一場都選得到。", en: "Give it a clear name and choose which meetings it is for; Any meeting makes it available everywhere." } },
    { at: ".mtpl-secs", t: { zh: "一段一個標題", en: "One heading per section" },
      b: { zh: "每一段寫標題與提示，提示會變成記會議時框裡的灰字。用上下箭頭排順序，「加一段」多一段。", en: "Each section has a heading and a hint; the hint becomes the grey text in the box when someone logs a meeting. Reorder with the arrows; Add a section adds one." } },
    { at: "[data-act='mtpl-save']", t: { zh: "存起來", en: "Save it" },
      b: { zh: "存好之後，記會議時在範本的下拉選單選得到；某一種會只有一份範本時會自動選好。", en: "Once saved, it appears in the template picker when logging a meeting, and is picked automatically if it is the only one for that kind." } },
  ] },
  { id: "mtemplates", page: "forms:mtemplates", steps: [
    { at: AT_HEAD, t: { zh: "會議範本", en: "Meeting templates" },
      b: { zh: "記會議的時候選一份範本，紀錄就分成一段一段的框，每一次都照同一個格式寫。", en: "Picking a template when logging a meeting splits the minutes into boxes, so every set of minutes has the same shape." } },
    { at: "[data-act='mtpl-new']", t: { zh: "做一份新的", en: "Make a new one" },
      b: { zh: "按「新增一份範本」，取名字、選給哪種會、寫每一段的標題與提示，按「建立範本」。", en: "Press New template, give it a name, choose which meetings it is for, write each section's heading and hint, then press Create template." } },
    { at: [".main ul.flist", ".main .empty"], t: { zh: "改或封存", en: "Edit or archive" },
      b: { zh: "「改」打開那一份。用不到的按「封存」，已經記好的會議不會變。", en: "Edit opens one. Archive the ones you no longer use; meetings already logged stay as they are." } },
    { at: AT_SUBS, t: { zh: "回到會議", en: "Back to meetings" },
      b: { zh: "在「會議」那一頁記一場會議，就選得到這些範本。", en: "Log a meeting on the Meetings page to use these templates." } },
  ] },

  // ── 跟 Marketing 提需求（/admin/#request）：送單、Marketing 的待辦、一張單 ──
  { id: "request-one", page: "forms:request", when: ".rq-print", steps: [
    { at: ".rq-print .rq-dl", t: { zh: "這張需求單", en: "This request" },
      b: { zh: "送單的人寫的全部內容：要做什麼、目標、重點、預計發布日。", en: "Everything the requester wrote: what they need, the goal, the key line and the planned date." } },
    { at: "#rq-assignee", t: { zh: "誰接、回覆什麼", en: "Who takes it, and the reply" },
      b: { zh: "選接的人、寫回覆，改了就存。接的人首頁會出現「派給你的需求」。", en: "Pick who takes it and write a reply; both save as you go. The person who takes it sees it on their Home page." } },
    { at: ["[data-act='rq-accept']", "#rq-status"], t: { zh: "接下或退件", en: "Accept or reject" },
      b: { zh: "按「接下」開始做，不寄信。「退件」要先寫回覆，會寄信把原因告訴送單的人。", en: "Accept starts the work and sends no email. Reject needs a reply first, and emails the reason to the requester." } },
    { at: ["[data-act='rq-publish']", "#rq-status"], t: { zh: "做好、發出去", en: "Done and posted" },
      b: { zh: "狀態改進行中或審稿中。真的發出去之後按「已發出，通知送單的人」，寄一封信連同你的回覆。", en: "Set the status to In progress or In review. Once it is live, press Posted, tell the requester to send one email with your reply." } },
    { at: ".main .back", t: { zh: "回到待辦", en: "Back to the queue" },
      b: { zh: "按這裡回到所有的需求單。", en: "This takes you back to all requests." } },
  ] },
  { id: "request-queue", page: "forms:request", when: "#rq-q", steps: [
    { at: AT_HEAD, t: { zh: "Marketing 的待辦", en: "Marketing's queue" },
      b: { zh: "大家送來的需求單。上面那一排挑還沒發布、已發布、退件，或「我接的」。", en: "Every request sent in. The chips above show Open, Published or Rejected, or just Mine." } },
    { at: "#rq-q", t: { zh: "找一張", en: "Find one" },
      b: { zh: "打標題、重點或目標找。", en: "Search by title, key line or goal." } },
    { at: ["li.rq-row", ".main .empty"], t: { zh: "點一張處理", en: "Open one to handle it" },
      b: { zh: "點進去選誰接、寫回覆、接下或退件，發出去之後通知送單的人。", en: "Open it to choose who takes it, reply, accept or reject, and tell the requester once it is posted." } },
  ] },
  { id: "request", page: "forms:request", steps: [
    { at: [".rq-kinds", "#rq-kind"], t: { zh: "要做什麼", en: "What do you need" },
      b: { zh: "先選貼文、限動或影片，下面就出現一張需求單。", en: "Pick Post, Story or Video first and a request sheet appears below." } },
    { at: "#rq-title", t: { zh: "寫清楚要什麼", en: "Say exactly what you need" },
      b: { zh: "填名稱、目標與 CTA、一句話重點、一定要有的資訊、草稿連結與預計發布日。不到七天會提醒你，但不會擋。", en: "Fill in the name, goal and call to action, the key line, must-have info, a draft link and the planned date. Under seven days away you get a warning, not a block." } },
    { at: ".rq-send", t: { zh: "送給 Marketing", en: "Send to Marketing" },
      b: { zh: "按下去 Marketing 會收到信。還沒送之前，打的字留在這台電腦上。", en: "Press it and Marketing gets an email. Until you send, your draft stays on this device." } },
    { at: "#rq-mine", t: { zh: "我送過的", en: "My requests" },
      b: { zh: "看每一張做到哪裡。還是「已送出」的可以收回；退件或發出去會寄信給你，首頁也看得到。", en: "See where each one is. You can withdraw it while it is Submitted; you get an email when it is rejected or posted, and it shows on Home." } },
    { at: ".rq-switch", t: { zh: "Marketing 的待辦", en: "Marketing's queue" },
      b: { zh: "處理需求單的人從這裡切到大家送來的單。", en: "People who handle requests switch to everyone's requests here." } },
  ] },

  // ── 專案 → 活動（/admin/#events）──
  // 一份表單的編輯頁、審核、當天、行前信：跟它所屬的活動、專案或招募同一個 page，用 when 分開，寫在最前面。
  { id: "form-editor", page: ["forms:events", "forms:projects", "forms:forms"], when: ".tabp[data-ptabs='form']", steps: [
    { at: AT_HEAD, t: { zh: "一份表單怎麼做", en: "How a form gets made" },
      b: { zh: "在「題目」寫題目，在「設定」設開放時間，改成開放中，再到「申請」看誰填了。全部打字就存，沒有存檔鈕。", en: "Write questions under Questions, set the dates under Settings, switch it to Open, then see who filled it in under Applications. Everything saves as you type." } },
    { go: ".main nav.ptabs [data-sub='questions']", at: ".fx-canvas", t: { zh: "一題一個框", en: "One box per question" },
      b: { zh: "點一個框直接改題目與說明。旁邊選題型（短答、單選、日期、檔案上傳等十五種），勾「必填」。", en: "Click a box to change the question and its help text. Beside it pick the type (short answer, multiple choice, date, file upload and more) and tick Required." } },
    { at: [".fx-canvas .fx-logic", ".fx-canvas"], t: { zh: "答了什麼才出現", en: "Show a question only after an answer" },
      b: { zh: "「條件邏輯」設成某一題答了什麼，才出現、跳過或跳到某一頁。要分頁就加一個「換頁」。", en: "Logic shows, hides or jumps to a page depending on an earlier answer. Add a Page break block to split the form into pages." } },
    { at: ".fx-tail", t: { zh: "加一題", en: "Add a question" },
      b: { zh: "按「＋ 加一題」或打「/」選題型。姓名、學校、年級、email 系統會自己收，不用另外問。", en: "Press + Add a block or type / to pick a type. Name, school, grade and email are collected automatically, so don't ask for them." } },
    { at: ".fx-mode", t: { zh: "先自己填一次", en: "Try it yourself first" },
      b: { zh: "切到「預覽」照填的人看到的樣子走一次，條件也會動，按送出不會真的送。", en: "Switch to Preview to go through it as people will; the logic works and Submit sends nothing." } },
    { go: ".main nav.ptabs [data-sub='settings']", at: ["#fstatus", "#ftitle"], t: { zh: "設定與開放", en: "Settings, and opening it" },
      b: { zh: "名稱說明、開放與截止時間、收滿幾份自己關、送出後寄確認信。狀態改成「開放中」才收得到；活動的報名表要等活動發布，外面才看得到。", en: "Name, dates, close after a number of responses, a confirmation email. Set the status to Open to start; an event's sign-up form goes public once the event is published." } },
    { at: ".main nav.ptabs [data-act='open-apps']", t: { zh: "看誰填了", en: "See who filled it in" },
      b: { zh: "「申請」列出每一份：勾人，按邀請面試、錄取或婉拒，每個人會收到一封信。", en: "Applications lists every response: tick people and press Interview, Accepted or Declined, and each person gets an email." } },
    { at: ".main .back", t: { zh: "回去", en: "Go back" },
      b: { zh: "按這裡回到這份表單所屬的活動、專案或清單。", en: "This goes back to the event, project or list the form belongs to." } },
  ] },
  { id: "form-apps", page: ["forms:events", "forms:projects", "forms:forms"], when: ".main nav.ptabs > .subtab.on[data-act='open-apps']", steps: [
    { at: [".main .chips", AT_HEAD], t: { zh: "誰填了", en: "Who filled it in" },
      b: { zh: "上面那一排挑全部、還沒處理、邀請面試、錄取或婉拒。", en: "The chips above show All, Waiting, Interview, Accepted or Declined." } },
    { at: [".main .alist2", ".main .section .empty"], t: { zh: "看他寫了什麼", en: "Read the answers" },
      b: { zh: "一個人一列，按「看他寫了什麼」打開答案。", en: "One row per person; press Read the answers to open theirs." } },
    { at: ".main .bulk", t: { zh: "決定", en: "Decide" },
      b: { zh: "勾人，按「邀請面試」「錄取」或「婉拒」，確認之後每個人收到一封信；面試信附 Cal.com 的預約連結。", en: "Tick people, press Interview, Accepted or Declined and confirm; each person gets one email, and interview emails include the Cal.com booking link." } },
    { at: ".main .msg.info", t: { zh: "還沒寄出去的信", en: "Emails not sent yet" },
      b: { zh: "寄失敗的信停在這裡，按「現在寄出去」再寄一次。", en: "Emails that failed wait here; press Send now to try again." } },
    { at: "#rc-panel", t: { zh: "錄取時一起寄邀請", en: "Accepting also sends an invite" },
      b: { zh: "招募表錄取一個人，系統會照這裡設的職級與 team 寄邀請，三十天內有效，他登入就在幹部名單上。", en: "On a recruitment form, accepting someone also sends an invite with the rank and team set here, valid 30 days; once they sign in they are on the Roster." } },
    { at: ".main nav.ptabs [data-act='open-checkin']", t: { zh: "活動當天", en: "On the day" },
      b: { zh: "簽到與行前信在「活動」分頁。簽到的人與每一個決定，都會自動抄進紀錄。", en: "Check-in and the pre-event email are under Event. Check-ins and every decision are copied into Records automatically." } },
  ] },
  { id: "form-notice", page: ["forms:events", "forms:projects", "forms:forms"], when: "#nsub", steps: [
    { at: "[data-act='notice-to']", t: { zh: "寄給誰", en: "Who gets it" },
      b: { zh: "選要寄給哪幾種人，例如只寄給錄取的。", en: "Choose who it goes to, for example only accepted people." } },
    { at: "#nsub", t: { zh: "主旨與內容", en: "Subject and message" },
      b: { zh: "寫主旨與內容：集合時間、地點、要帶什麼。", en: "Write the subject and message: meeting time, place, what to bring." } },
    { at: "[data-act='notice-send']", t: { zh: "寄出", en: "Send" },
      b: { zh: "按下去會再問一次，確認之後就寄出去，收不回來。", en: "It asks once more, then sends. Sent emails can't be called back." } },
  ] },
  { id: "form-checkin", page: ["forms:events", "forms:projects", "forms:forms"], when: ".main nav.ptabs > .subtab.on[data-act='open-checkin']", steps: [
    { at: AT_HEAD, t: { zh: "活動當天", en: "On the day" },
      b: { zh: "簽到與行前信都在這一頁。", en: "Check-in and the pre-event email are both on this page." } },
    { at: ["[data-act='checkin']", ".main .section"], t: { zh: "簽到", en: "Check people in" },
      b: { zh: "只列錄取的人，來了就勾一下，勾了就存，出席會自動進紀錄。", en: "Only accepted people are listed. Tick each person as they arrive; it saves straight away and attendance goes into Records." } },
    { at: "[data-act='open-notice']", t: { zh: "寄行前信", en: "Send a pre-event email" },
      b: { zh: "按這裡寫一封信給這些人，選寄給誰、寫主旨與內容，寄出前會再問一次。", en: "Write one email to these people: choose who, write the subject and message; it asks once more before sending." } },
  ] },
  { id: "event-editor", page: "forms:events", when: "#ev-tabs", steps: [
    { at: "#ev-state", t: { zh: "這場活動在哪一步", en: "Where this event stands" },
      b: { zh: "草稿外面看不到。順序是：填內容、放照片、設報名表，按「準備好了」，Co-President 發布。", en: "Drafts are invisible outside. The order is: fill in the content, add photos, set up the sign-up form, press Mark ready, then a Co-President publishes." } },
    { go: "#ev-tabs [data-tab='details']", at: "#ev-content", t: { zh: "內容", en: "Content" },
      b: { zh: "中英文名字、一句話、介紹。打字就存，沒有存檔鈕。展開「對外頁上會長這樣」看預覽。", en: "Names, one line and description in both languages. It saves as you type. Open How it will look on the public page to preview." } },
    { at: "#ev-when", t: { zh: "時間與地點", en: "When and where" },
      b: { zh: "用台灣時間填。名額填 0 是不限。選一個場地會帶入地點，場地的聯絡人不會公開。", en: "Use Taiwan time. Capacity 0 means unlimited. Picking a venue fills in the place; its contacts are never public." } },
    { go: "#ev-tabs [data-tab='photos']", at: "#ev-pics", t: { zh: "照片與講者", en: "Photos and speakers" },
      b: { zh: "選一張封面，再加活動照片。上傳等於確認照片裡的人都同意公開。講者在隔壁的分頁加。", en: "Choose a cover, then add event photos. Uploading confirms everyone in them agreed to be shown. Speakers are added in the next tab." } },
    { go: "#ev-tabs [data-tab='forms']", at: ["#ev-form [data-act='open-form']", "[data-act='ev-attach-form']", "#ev-signup"], t: { zh: "做報名表", en: "Make the sign-up form" },
      b: { zh: "還沒有報名表就先按「加一張報名表」。有了之後按「改題目與表單設定」打開編輯器，一題一個框，點進去就改。題目好了設開放時間，按「開放報名」。", en: "No form yet? Press Add a sign-up form. Then Edit questions and form settings opens the editor, where each question is a box you click to edit. Set the dates and press Open sign-up." } },
    { at: ["#ev-signup [data-act='open-apps']", "#ev-signup"], t: { zh: "誰報了名、當天簽到", en: "Who signed up, and check-in" },
      b: { zh: "「看報名的人」審核、寄錄取或婉拒信。底下有「行前信」與「簽到」，當天就用這兩顆。", en: "See sign-ups to review people and send decisions. Pre-event email and Check-in are just below for the day itself." } },
    { go: "#ev-tabs [data-tab='results']", at: "#ev-after", t: { zh: "活動之後", en: "After the event" },
      b: { zh: "出席與回饋在「成果」，跟紀錄是同一份。要回饋表，回「表單」分頁按「建立回饋表」，六題標準題目會先放好。", en: "Attendance and feedback are under Results, the same data as Records. For a feedback form, press Create feedback form in the Forms tab; six standard questions are filled in." } },
    { go: "#ev-tabs [data-tab='settings']", at: ["#ev-live", ".tabp[data-tabp='settings']"], t: { zh: "上線", en: "Going live" },
      b: { zh: "按「準備好了」，Co-President 按「放上對外頁」，就出現在首頁與 /events/。請 Marketing 做貼文、放進專案、誰能改也在這一頁。", en: "Press Mark ready and a Co-President presses Publish; it then shows on the home page and /events/. Ask Marketing for a post, pick the project and choose editors here too." } },
  ] },
  { id: "events", page: "forms:events", unless: "#ev-tabs", steps: [
    { at: AT_HEAD, t: { zh: "一場活動怎麼做", en: "How an event gets made" },
      b: { zh: "開一場、填內容、做報名表、按「準備好了」，Co-President 發布之後對外的首頁、/events/ 與那場活動的頁面就看得到。", en: "Create it, fill in the content, make the sign-up form and press Mark ready. Once a Co-President publishes it, it shows on the home page, /events/ and its own page." } },
    { at: "#ev-new > summary", t: { zh: "開一場活動", en: "Create an event" },
      b: { zh: "打開這一格，選 team，填代號（網址，之後不能改）與中英文名字。勾「要開放報名」會一起建好報名表，按「開活動」。", en: "Open this, pick the team, fill in the slug (the web address, fixed later) and both names. Leave Takes sign-ups ticked to get a sign-up form too, then press Create." } },
    { at: [".main .ev-fbx", ".main > .chips"], t: { zh: "找一場活動", en: "Find an event" },
      b: { zh: "打名字、代號或地點找。上面那一排只看已經上線的，或還在做的。", en: "Search by name, slug or place. The chips show only live events, or only ones still in progress." } },
    { at: [".main .section .flist", ".main .empty"], t: { zh: "點一場繼續做", en: "Open one to keep going" },
      b: { zh: "點名字進到編輯頁，旁邊的標籤寫著草稿、等發布還是已上線。", en: "Click a name to open its editor; the tag beside it says draft, waiting or live." } },
    { at: "#todo", t: { zh: "還沒寄出去的信", en: "Emails not sent yet" },
      b: { zh: "報名的人狀態一改就會排一封信。寄失敗的停在這裡，按「現在寄出去」。", en: "Each change to an applicant's status queues an email. Ones that failed wait here; press Send now." } },
    { at: ".main .ev-recline", t: { zh: "比較舊的活動在紀錄裡", en: "Older events live in Records" },
      b: { zh: "網站做好之前辦的活動只在「紀錄」裡，出席與回饋也在那裡。", en: "Events from before the site exist only in Records, with their attendance and feedback." } },
    { at: AT_SUBS, t: { zh: "好幾場收成一個專案", en: "Group events into a project" },
      b: { zh: "同一件事的好幾場，例如營隊與說明會，到「專案」收在一起。", en: "Several events for one thing, such as a camp and its info session, go together under Projects." } },
  ] },
  { id: "project", page: "forms:projects", when: "[data-act='pj-back']", steps: [
    { at: AT_HEAD, t: { zh: "一個專案", en: "One project" },
      b: { zh: "這個專案底下的活動與報名表都在這一頁。改得動專案的人，也改得動裡面每一場活動。", en: "Everything in this project is here: its events and sign-up forms. Anyone who can edit the project can edit each of its events." } },
    { at: ".main > section.section:nth-of-type(1)", t: { zh: "放活動進來", en: "Add events" },
      b: { zh: "「在這個專案開一場活動」開新的，或「把已經開好的活動放進來」。點一場進到它的編輯頁。", en: "Create an event inside this project, or move in one that already exists. Click an event to open its editor." } },
    { at: ".main > section.section:nth-of-type(2)", t: { zh: "整個專案一張報名表", en: "One sign-up form for the project" },
      b: { zh: "例如整個營隊只報一次名：打名稱，按「建一份報名表」，再按「改題目與設定」寫題目。", en: "For example one sign-up for the whole camp: type a name, press Create a sign-up form, then Edit questions and settings." } },
    { at: ".main > section.section:nth-of-type(3)", t: { zh: "專案設定", en: "Project settings" },
      b: { zh: "改名字、封存，或看誰在這個專案。只有管得到的人看得到這一塊。", en: "Rename it, archive it or see who is on it. Only people with Manage see this block." } },
    { at: ".main .back", t: { zh: "回到所有專案", en: "Back to all projects" },
      b: { zh: "按這裡回到專案清單。", en: "This takes you back to the list." } },
  ] },
  { id: "projects", page: "forms:projects", steps: [
    { at: AT_HEAD, t: { zh: "專案把活動收在一起", en: "Projects group events together" },
      b: { zh: "一個專案底下可以有好幾場活動和報名表。例如 Curriculum 的「Winter Camp 2027」底下有說明會、營隊本身和行前會。", en: "A project holds several events and sign-up forms. For example, Curriculum's Winter Camp 2027 holds the info session, the camp itself and the pre-camp meeting." } },
    { at: "#pj-new > summary", t: { zh: "開一個專案", en: "Create a project" },
      b: { zh: "打開這一格，選 team、填短網址與中英文名字，按「開專案」。接著在專案裡開活動，或把開好的放進來。", en: "Open this, pick the team, a short address and both names, then press Create. Next, create events inside it or move existing ones in." } },
    { at: [".main .section .flist", ".main .empty"], t: { zh: "點一個打開", en: "Open one" },
      b: { zh: "一個 team 一塊，點專案看它底下的活動與報名表。", en: "One block per team; click a project to see its events and forms." } },
    { at: AT_SUBS, t: { zh: "活動在隔壁", en: "Events are next door" },
      b: { zh: "每一場活動也可以在自己的「設定」分頁選它屬於哪個專案。", en: "Each event can also pick its project in its own Settings tab." } },
  ] },

  // ── 表單（/admin/team-forms/ 與紀錄的回饋表）──
  { id: "fill-one", page: "teamforms:fill", when: "[data-act='back-fill']", steps: [
    { at: [".main .fx-form", "#tf-run"], t: { zh: "一頁一頁填", en: "Answer page by page" },
      b: { zh: "照順序回答，按「下一頁」，最後按「送出」。打到一半關掉也沒關係，這台電腦會先幫你留著。", en: "Answer in order, press Next, then Send at the end. If you close it halfway, this device keeps your draft." } },
    { at: ".main > .note", t: { zh: "誰看得到你的答案", en: "Who can read your answers" },
      b: { zh: "這一行寫著誰讀得到你的答案；匿名的表單也會寫在這裡。", en: "This line says who can read your answers, and whether the form is anonymous." } },
    { at: ".main .back", t: { zh: "填完回清單", en: "Back to the list" },
      b: { zh: "送出之後它會移到「你填過的」。表單允許的話，那裡可以改你的答案。", en: "After you send it, it moves to Your answers, where you can change them if the form allows." } },
  ] },
  { id: "fill", page: "teamforms:fill", steps: [
    { at: [".main .tf-card", ".main .empty"], t: { zh: "還沒填的", en: "Still to fill in" },
      b: { zh: "別人發給你的內部表單都在這裡，首頁的「等你處理」也看得到。按「去填」打開。", en: "Internal forms sent to you are here and on your Home page. Press Fill it in to open one." } },
    { at: [".main .flist", ".main .section .mini"], t: { zh: "你填過的", en: "Your answers" },
      b: { zh: "送出過的在這裡。表單允許改的話按「改我的答案」，不然只能「看我的答案」。", en: "Forms you have sent. Change my answers if the form allows it, otherwise See my answers." } },
    { at: AT_SUBS, t: { zh: "要自己做一份表單", en: "To make a form yourself" },
      b: { zh: "「所有表單」列出你管的報名表、回饋表與內部表單，要建一份也從那裡開始。", en: "All forms lists the sign-up, feedback and internal forms you run, and is where you make a new one." } },
  ] },
  { id: "forms-all", page: "teamforms:all", steps: [
    { at: AT_HEAD, t: { zh: "你管的每一份表單", en: "Every form you run" },
      b: { zh: "報名表、回饋表、內部表單都列在這裡，每一份標著哪一種、哪一場活動、開著沒、收了幾份。", en: "Sign-up, feedback and internal forms are all here, each tagged with its kind, event, whether it is open and how many responses." } },
    { at: [".main .flist", ".main .empty"], t: { zh: "點一份打開", en: "Open one" },
      b: { zh: "點名字打開它的編輯頁。三種表單編輯的方式一樣：一題一個框，點進去就改。", en: "Click a name to open its editor. All three kinds work the same way: one box per question, click to edit." } },
    { at: ".main > .chips", t: { zh: "只看一種", en: "One kind at a time" },
      b: { zh: "上面那一排只看報名表、回饋表或內部表單。", en: "The chips show only sign-up, feedback or internal forms." } },
    { at: ".main .all-new", t: { zh: "建一份", en: "Make a form" },
      b: { zh: "先選哪一種。報名表與回饋表再選一場活動，按「建報名表」或「建回饋表」，就直接打開編輯頁。", en: "Pick the kind first. For a sign-up or feedback form, also pick an event and press Make the sign-up form or Make the feedback form; the editor opens straight away." } },
    { at: [".main .kind-cards", ".main .all-new"], t: { zh: "什麼時候外面看得到", en: "When people outside can see it" },
      b: { zh: "報名表要等那一場活動發布之後才對外。回饋表用連結發，不用登入。內部表單只發給你選的幹部。", en: "A sign-up form goes public once its event is published. Feedback forms go out by link, no sign-in. Internal forms only reach the cadres you choose." } },
  ] },
  { id: "internal-form", page: "teamforms:build", when: ".main a.subtab[data-act='sub']", steps: [
    { at: AT_HEAD, t: { zh: "一份內部表單怎麼做", en: "How an internal form gets made" },
      b: { zh: "寫題目、選發給誰，再按右上角「打開，開始收答案」。標題旁邊寫著它現在是草稿、開著還是收起來了。", en: "Write the questions, choose who gets it, then press Open it at the top right. The tag by the title says draft, open or closed." } },
    { go: ".main a.subtab[data-t='questions']", at: ".main .fx-canvas", t: { zh: "一題一個框", en: "One box per question" },
      b: { zh: "每一題是一個框，點進去直接改。框跟框之間的「＋」加一題，或在最後打「/」選題型。", en: "Each question is a box; click in to change it. The + between boxes adds a question, or type / at the end to pick a type." } },
    { at: [".main .fx-canvas .fx-logic", ".main .fx-canvas"], t: { zh: "題型、必填、條件", en: "Type, required, logic" },
      b: { zh: "框旁邊改題型、設必填、複製或刪掉。「條件邏輯」設成答了某個選項才出現下一題。有人答過的題目不能刪，也不能換題型。", en: "Beside each box: change the type, make it required, copy or delete it. Logic shows a question only after a certain answer. Once answered, a question can't be deleted or change type." } },
    { at: ".main .fx-mode", t: { zh: "預覽", en: "Preview" },
      b: { zh: "切到「預覽」看填的人看到的樣子，再切回來繼續改。所有改動都會自己存。", en: "Switch to Preview to see it as people will, then back to keep editing. Every change saves itself." } },
    { go: ".main a.subtab[data-t='people']", at: ["#aud-recipient", ".main .section"], t: { zh: "發給誰、誰看得到", en: "Who gets it, who reads it" },
      b: { zh: "勾人、team 或職級，按「存這一張名單」，每一張分開存。讀者看得到每一份答案，選整個 team 就是整個 team 都看得到。", en: "Tick people, teams or ranks and press Save this list; each list saves on its own. Readers see every answer, so a whole team as readers means the whole team can read them." } },
    { at: ".main .page-head .actions [data-act='tf-status']", t: { zh: "打開", en: "Open it" },
      b: { zh: "有題目也選好人之後，按「打開，開始收答案」。收到的人在首頁「等你處理」看到它，不會寄信。", en: "Once it has questions and recipients, press Open it. Recipients see it under Waiting for you on Home; no email is sent." } },
    { go: ".main a.subtab[data-t='results']", at: [".main .todo", ".main .empty"], t: { zh: "看結果", en: "See the results" },
      b: { zh: "誰填了、誰還沒填一目了然，可以私訊提醒他。有答案之後可以「下載 CSV」。", en: "See who has answered and who hasn't, so you can nudge them. Once answers come in you can Download CSV." } },
  ] },
  { id: "internal-forms", page: "teamforms:build", steps: [
    { at: AT_HEAD, t: { zh: "內部表單", en: "Internal forms" },
      b: { zh: "給幹部填的表單，例如期中回饋或分工調查。只發給你選的人，不會公開，也不會寄信。", en: "Forms for cadres to fill in, such as a mid-term check-in or a task survey. They only reach people you choose; nothing is public and no email is sent." } },
    { at: ".main .page-head .actions [data-act='tf-new']", t: { zh: "建一份", en: "Make one" },
      b: { zh: "按「建一份新的」，打標題，按「建立」。接著到它的編輯頁：寫題目、選發給誰、打開。", en: "Press New form, type a title and press Create. Then in its editor: write questions, choose who gets it, open it." } },
    { at: ".main > .note", t: { zh: "沒有建立的按鈕", en: "No New form button" },
      b: { zh: "請 Co-President 在工作區把你派進「內部表單（誰能建）」。", en: "Ask a Co-President to add you to Team forms (who can create) under Workspaces." } },
    { at: [".main .flist", ".main .empty"], t: { zh: "你管的與你讀得到的", en: "Yours, and ones you can read" },
      b: { zh: "點一份打開。寫著「你是讀者」的只能看答案，不能改題目。", en: "Click one to open it. Ones marked You can read only show answers; you can't change the questions." } },
  ] },
  { id: "feedback-form", page: "records:forms", when: ".main a.subtab[data-act='sub']", steps: [
    { at: AT_HEAD, t: { zh: "一份回饋表怎麼做", en: "How a feedback form gets made" },
      b: { zh: "寫題目、接到哪一場活動，按「打開，開始收」，複製連結發出去。填的人不用登入，結果回到那一場活動的紀錄。", en: "Write the questions, link it to an event, press Open it and share the link. Nobody needs to sign in, and the results go back to that event's record." } },
    { go: ".main a.subtab[data-t='questions']", at: ".main .fx-canvas", t: { zh: "一題一個框", en: "One box per question" },
      b: { zh: "跟其他表單一樣，點框就改。空白的表單可以按「放進固定題目」。「代號」是年度比較對同一題用的，不要亂改。", en: "Like other forms, click a box to edit. An empty form can start from the standard questions. The key is how year-by-year matches questions, so leave it alone." } },
    { go: ".main a.subtab[data-t='settings']", at: [".main [data-autosave='rc-save']", ".main .section"], t: { zh: "接哪一場活動", en: "Which event" },
      b: { zh: "選這份回饋表是哪一場活動的、用哪一種語言。改了就存。", en: "Choose which event it belongs to and its language. Changes save as you go." } },
    { at: ".main .page-head .actions [data-act='form-status']", t: { zh: "打開", en: "Open it" },
      b: { zh: "按「打開，開始收」，上面就出現填寫連結。", en: "Press Open it and the fill-in link appears." } },
    { at: ".main .rc-link", t: { zh: "複製連結發出去", en: "Copy and share the link" },
      b: { zh: "按「複製」貼到群組或信裡。登入的參加者在首頁也看得到它。", en: "Press Copy and paste it into the group chat or an email. Signed-in participants also see it on Home." } },
    { go: ".main a.subtab[data-t='results']", at: [".main .todo", ".main .empty"], t: { zh: "看結果", en: "See the results" },
      b: { zh: "填了幾份、留了聯絡方式的、未滿 18 歲的。有答案之後看平均與留言，也可以下載 CSV。", en: "How many answered, left contact details or are under 18. Once answers arrive, see averages and comments, or download a CSV." } },
  ] },
  { id: "feedback-forms", page: "records:forms", steps: [
    { at: AT_HEAD, t: { zh: "活動後的回饋表", en: "Post-event feedback forms" },
      b: { zh: "填的人不用登入，結果回到那一場活動的紀錄與活動編輯頁的「成果」。", en: "Nobody needs to sign in, and results go back to the event's record and the Results tab of its editor." } },
    { at: ".main .page-head .actions [data-act='form-new']", t: { zh: "建一份", en: "Make one" },
      b: { zh: "最快的是在那一場活動的「表單」分頁按「建立回饋表」。這裡也可以：填標題、種類、活動、語言，勾「先放進固定題目」，按「建立」。", en: "Fastest is Create feedback form in the event's Forms tab. Here works too: title, kind, event, language, tick Start from the standard questions, then Create." } },
    { at: [".main .flist", ".main .empty"], t: { zh: "點一份打開", en: "Open one" },
      b: { zh: "點名字打開編輯頁：題目、設定、誰看得到、結果。", en: "Click a name for its editor: questions, settings, readers and results." } },
    { at: "details[data-anon]", t: { zh: "舊的答案去掉名字", en: "Remove names from old answers" },
      b: { zh: "三屆以前的記名答案，在這裡一次去掉名字。", en: "Strip names from named answers older than three terms, all at once." } },
  ] },

  // ── 行銷 ──
  { id: "college-post", page: "marketing:posts", when: ".cp-wrap", steps: [
    { at: "#cp-status", t: { zh: "這一篇在哪一步", en: "Where this post stands" },
      b: { zh: "順序是：填六張投影片與照片、每個數字點來源確認、送去核可、別人核可、下載、發到 IG、標成已發。", en: "The order: fill the six slides and photos, check each number against its source, send for approval, get approved, download, post on Instagram, mark as posted." } },
    { at: ".cp-form", t: { zh: "填內容", en: "Fill it in" },
      b: { zh: "一張投影片一塊。照片要填作者與授權；說明文字最多 2,200 字、30 個 hashtag。", en: "One block per slide. Photos need the author and licence; the caption takes up to 2,200 characters and 30 hashtags." } },
    { at: [".cp-tick", ".cp-form"], t: { zh: "每個數字都點開確認", en: "Check every number" },
      b: { zh: "每個數字放來源，點開看過，再勾「我點開來源看過，數字對得上」。改了數字或來源，勾會不見。", en: "Add a source to each number, open it, then tick I opened the source and the number matches. Changing the number or source clears the tick." } },
    { at: ".cp-prev", t: { zh: "預覽", en: "Preview" },
      b: { zh: "右邊是做出來的樣子，點一張放大。", en: "This is how the slides will look; click one to zoom in." } },
    { at: "#cp-actions", t: { zh: "送審、核可、下載", en: "Approval and download" },
      b: { zh: "全部填好才按得了「送去核可」。另一位核可的人按「核可這一版」或「退回」。核可之後下載 PNG 或 .pptx 給 Canva，發完按「我已經發到 IG 了」。", en: "Send for approval works once nothing is missing. Another approver presses Approve or Send back. After approval, download PNGs or .pptx for Canva; after posting, press I posted it on Instagram." } },
  ] },
  { id: "college-posts", page: "marketing:posts", steps: [
    { at: AT_HEAD, t: { zh: "大學介紹貼文", en: "College intro posts" },
      b: { zh: "一所大學一篇七張的 IG 輪播。每個數字都要有人點開來源確認，再由另一個人核可才能發。", en: "One seven-slide Instagram carousel per university. Every number has to be checked against its source, then approved by someone else before posting." } },
    { at: ".main .cp-new", t: { zh: "開一篇", en: "Start a post" },
      b: { zh: "打學校名字，按「開一篇」；有研究檔就按「匯入研究檔」。", en: "Type the school and press Start a post, or Import research file if you have one." } },
    { at: [".main .cp-list", ".main .section .empty"], t: { zh: "點一篇繼續做", en: "Open one to keep going" },
      b: { zh: "每一篇寫著現在在哪一步，點進去繼續填、送審或下載。", en: "Each post shows its stage; open it to keep filling it in, send it for approval or download it." } },
    { at: "[data-act='cp-archived']", t: { zh: "封存的", en: "Archived posts" },
      b: { zh: "封存的貼文收在這裡，封存之後那所學校可以重開一篇。", en: "Archived posts are kept here; archiving frees the school name for a new post." } },
  ] },
  { id: "instagram", page: "marketing:ig", steps: [
    { at: AT_HEAD, t: { zh: "BT 的 Instagram 連線", en: "BT's Instagram connection" },
      b: { zh: "網站用這個連線讀 BT 的 IG。連著的時候不用管它，權杖剩不到五十天會自己換新。", en: "The site reads BT's Instagram through this connection. While it is connected there is nothing to do; the token renews itself under 50 days." } },
    { at: [".main .rq-dl", ".main .section"], t: { zh: "現在的狀態", en: "Current status" },
      b: { zh: "連著就看得到帳號與最後檢查的時間。沒連上的話照這裡的說明設定。", en: "When connected you see the account and when it was last checked. If not, follow the setup steps here." } },
    { at: ".main .page-head .actions [data-act='ig-check']", t: { zh: "再檢查一次", en: "Check again" },
      b: { zh: "出現錯誤 190 代表權杖失效，請 Co-President 換一個新的。", en: "Error 190 means the token has expired; ask a Co-President to put in a new one." } },
  ] },

  // ── 人與權限 ──
  { id: "person", page: "people:roster", when: "[data-autosave='person-save']", steps: [
    { at: AT_HEAD, t: { zh: "改一個人", en: "Edit one person" },
      b: { zh: "這一頁每一個改動都會自己存，也會寫進「誰改了什麼」。", en: "Every change on this page saves itself and is written to the Change log." } },
    { go: "#pe-person-tabs [data-tab='profile']", at: ["#pk-role", ".tabp[data-tabp='profile']"], t: { zh: "職級", en: "Rank" },
      b: { zh: "職級只有 Co-President 改得動。選 Co-President 會先問一次，因為等於把整個後台交給他。", en: "Only a Co-President can change rank. Choosing Co-President asks first, because it hands over the whole Backstage." } },
    { at: [".posrow", ".tabp[data-tabp='profile']"], t: { zh: "這一屆的職位", en: "This term's position" },
      b: { zh: "選職位與 team，同一屆可以「再加一個職位」。存了 Director 會跳出一顆鈕問要不要順便開那個 team 的權限，不會自己開。", en: "Pick the position and team; Add another position for a second one. Saving a Director offers a button to also open that team's access; it never happens by itself." } },
    { go: "#pe-person-tabs [data-tab='ws']", at: [".main table.grid", ".tabp[data-tabp='ws']"], t: { zh: "工作區", en: "Workspaces" },
      b: { zh: "每一格選不在、看、改或管，改了馬上存，跳出來的提示有「復原」。", en: "Each cell is Not in, View, Edit or Manage. It saves straight away, with Undo in the message that pops up." } },
    { go: "#pe-person-tabs [data-tab='account']", at: ["#invite-back", ".tabp[data-tabp='account']"], t: { zh: "帳號", en: "Account" },
      b: { zh: "沒有帳號的人在這裡寄邀請信，三十天內有效。移除一個人要打他的名字確認。", en: "For someone without an account, send an invite here; it lasts 30 days. Removing a person asks you to type their name." } },
    { at: ".main .back", t: { zh: "回到名單", en: "Back to the roster" },
      b: { zh: "按這裡回到幹部名單。", en: "This takes you back to the roster." } },
  ] },
  { id: "person-new", page: "people:roster", when: "[data-act='person-create']", steps: [
    { at: "#pn-zh", t: { zh: "以前的幹部", en: "Someone from before" },
      b: { zh: "給以前當過幹部、但沒有帳號的人。先填中英文名字。", en: "For past cadres who never had an account. Start with both names." } },
    { at: "#pn-term", t: { zh: "哪一屆、什麼職位", en: "Which term, which position" },
      b: { zh: "選屆別、職位與 team，備註只有後台看得到。", en: "Choose the term, position and team. The note is only visible here." } },
    { at: "[data-act='person-create']", t: { zh: "加進名單", en: "Add to roster" },
      b: { zh: "按下去回到名單，篩選會切到「歷屆全部」讓你看到他。之後可以從名單寄邀請給他。", en: "You return to the roster filtered to All terms so you can see them. You can invite them from there later." } },
    { at: ".main .section .note", t: { zh: "一整屆比較快", en: "A whole term is faster" },
      b: { zh: "要補一整屆，到「屆別」用「貼一整屆」一次貼進來。", en: "For a whole term, paste it in one go under Terms with Paste a term." } },
  ] },
  { id: "roster", page: "people:roster", steps: [
    { at: AT_HEAD, t: { zh: "這一屆的幹部", en: "This year's team" },
      b: { zh: "職級決定他是誰，工作區決定他能動什麼。team 只是一個標籤，不會開任何權限。", en: "Rank says who someone is; workspaces say what they can change. The team is only a label and opens nothing by itself." } },
    { at: "#roster .fbx", t: { zh: "找一個人", en: "Find someone" },
      b: { zh: "打名字找。「篩選」換屆別或 team；網站上線前的幹部選「歷屆全部」才看得到。", en: "Search by name. Filters switches term or team; cadres from before the site only show under All terms." } },
    { at: ["#roster [data-act='person-edit']", "#roster table"], t: { zh: "改一個人", en: "Edit someone" },
      b: { zh: "按「改」打開他的頁：名字、職級、這一屆的職位、工作區、帳號。", en: "Press Edit to open their page: names, rank, this term's position, workspaces and account." } },
    { at: ["#roster input[data-act='bulk-tick']", "#roster .fbx"], t: { zh: "把以前的人邀回來", en: "Invite back past cadres" },
      b: { zh: "篩選選「歷屆全部」與「沒有帳號」，勾起來，每一列填 email，按「寄 n 封邀請信」。只有那個 email 認領得到。", en: "Filter to All terms and No account, tick people, fill in each email and press Send invites. Only that email can claim each one." } },
    { at: AT_ACT, t: { zh: "補一筆過去的紀錄", en: "Add a past record" },
      b: { zh: "以前當過幹部、名單上還沒有的人，按「加一筆過去的紀錄」。", en: "For someone who was on the team before but isn't listed, press Add a past record." } },
    { at: ".main > .note", t: { zh: "每一個改動都有紀錄", en: "Every change is logged" },
      b: { zh: "誰改了什麼都寫在「誰改了什麼」那一頁。把人升成 Co-President 等於把整個後台交給他，包括把你降級。", en: "Every change goes to the Change log. Promoting someone to Co-President hands them the whole Backstage, including the power to demote you." } },
  ] },
  { id: "invites", page: "people:invites", steps: [
    { at: AT_HEAD, t: { zh: "邀請新的人", en: "Invite new people" },
      b: { zh: "填 email、選他會是什麼身分，按一次信就寄出去。對方點信裡的連結登入就好，不用打碼。", en: "Fill in an email, choose what they will be, press once and the email goes out. They click the link and sign in; there is no code to type." } },
    { at: "#invite-fold > summary", t: { zh: "邀請一個人", en: "Invite someone" },
      b: { zh: "打開這一格，填 email、他會是什麼、職級、team、屆別、名字，按「寄邀請信」。名字跟沒有帳號的舊紀錄一樣時，會問你是不是同一個人。", en: "Open this and fill in the email, role, rank, team, term and names, then press Send invite. If the name matches an old record, it asks whether it is the same person." } },
    { at: ["#invites", "#invites .empty"], t: { zh: "寄出去之後", en: "After it is sent" },
      b: { zh: "狀態寫著排隊中、寄出、開過信、認領了或過期。寄失敗或過期按「重寄（換新碼）」，寄錯人按「撤銷」。", en: "The status shows Queued, Sent, Opened, Claimed or Expired. If it failed or expired press Resend (new code); if it went to the wrong person press Revoke." } },
    { at: "#batch > summary", t: { zh: "一組碼給一群人", en: "One code for a group" },
      b: { zh: "很少用到，只有 Co-President 看得到。一個一個邀請用上面那一格。", en: "Rarely needed, and only for Co-Presidents. Invite people one by one with the form above." } },
    { at: AT_SUBS, t: { zh: "信的文字與名單", en: "Email wording, and the roster" },
      b: { zh: "對方登入之後就在「幹部名單」上。邀請信的字在「對外網站」的「信的文字」改。", en: "Once they sign in they are on the Roster. The invite's wording is edited under Website, Email wording." } },
  ] },
  // 整個工作區（2027-01-24 Paul：「when I add people into whole BT, they should have access to everything in whole BT」）。
  { id: "workspace-group", page: "people:workspaces", when: "#ws-panel .wsg-items", steps: [
    { at: "#ws-panel h2", t: { zh: "整個工作區", en: "A whole workspace" },
      b: { zh: "標題點進來是整個工作區。整個 BT 裡每一樣都是一格，行事曆、會議、紀錄都是；勾了才看得到。", en: "A heading opens the whole workspace. In Whole BT every tool is an item, from Calendar and Meetings to Records; people see only what is ticked." } },
    { at: "#ws-panel .wsg-items", t: { zh: "先勾要開哪幾樣", en: "Tick what to open first" },
      b: { zh: "預設全部勾著。只想給行事曆與會議，就把其他的取消。", en: "Everything is ticked by default. To give only Calendar and Meetings, untick the rest." } },
    { at: "#ws-panel .ma-col:last-child", t: { zh: "加人", en: "Add people" },
      b: { zh: "右邊列的是勾起來的那幾樣還沒全部有的人。勾人、選等級、按「加 n 個人」，只補他少的，原本有的等級不變。", en: "The right lists anyone missing a ticked item. Tick people, pick a level and press Add; only what they lack is added and existing levels stay." } },
    { at: "#ws-panel .ma-col:first-child", t: { zh: "已經在裡面的", en: "Already in" },
      b: { zh: "左邊的下拉一次改他在每一樣的等級。勾好幾個人可以一次改或一次移出。", en: "The menu on the left changes their level on every item at once. Tick several people to change or remove them together." } },
    { at: "#ws-panel .wsg-wrap", t: { zh: "誰開了哪幾樣", en: "Who has what" },
      b: { zh: "一個人一列、一樣一欄。勾一格就開給他，取消就拿掉。表頭寫幾個人有，名字固定在左邊。", en: "One row per person, one column per item. Tick a box to open it, untick to remove. Headers show how many have it." } },
    { t: { zh: "新來的幹部", en: "New cadres" },
      b: { zh: "新來的幹部不會自動有任何一樣，要在整個 BT 這裡把他加進來，他的側欄才會有行事曆、會議這些。", en: "New cadres get nothing automatically. Add them here in Whole BT so Calendar, Meetings and the rest appear in their menu." } },
  ] },
  { id: "workspace", page: "people:workspaces", when: "#ws-panel", steps: [
    { at: "#ws-panel h2", t: { zh: "你選的工作區", en: "The workspace you picked" },
      b: { zh: "選 team 的標題是整個 team；選底下一樣，就只有那一樣。", en: "A team heading means the whole team; an item under it means just that item." } },
    { at: "#ws-panel .ma-col:last-child", t: { zh: "加人", en: "Add people" },
      b: { zh: "找名字或按 team，勾人，選等級，按「加 n 個人」。跳出來的提示有「復原」。", en: "Search or pick a team, tick people, choose the level and press Add people. The message that pops up has Undo." } },
    { at: "#ws-panel .ma-col:first-child", t: { zh: "已經在裡面的", en: "Already in" },
      b: { zh: "改等級馬上存。「移出」會先問一次。", en: "Changing a level saves straight away. Remove asks first." } },
    { t: { zh: "看、改、管", en: "View, Edit, Manage" },
      b: { zh: "看只能讀；改可以改內容；管還能在那一頁加人、改等級、移出。Co-President 與 Senior Adviser 不用派。錢只有 Co-President 或管錢的人派得了。", en: "View can read; Edit can change; Manage can also add, re-level and remove people there. Co-Presidents and Senior Advisers need no assignment. Only a Co-President or a Money manager can assign Money." } },
  ] },
  { id: "workspaces", page: "people:workspaces", steps: [
    { at: AT_HEAD, t: { zh: "誰能動什麼", en: "Who can change what" },
      b: { zh: "職級不開權限，工作區才開。要讓一個人處理某個 team 的東西，在這裡把他派進去。", en: "Rank opens nothing; workspaces do. To let someone work on a team's things, assign them here." } },
    { at: [".main .wsgrid", ".main .empty"], t: { zh: "點一個工作區", en: "Pick a workspace" },
      b: { zh: "點標題是整個工作區，點底下一樣是只有那一樣。整個 BT 是大家用的工具，Senior 是 Internal，錢在 Sponsorship，實習護照在 Internship。", en: "A heading is the whole workspace; an item is just that item. Whole BT holds everyone's tools, Senior holds Internal, Money is under Sponsorship." } },
    { at: ".main .wsgrp:nth-child(2)", t: { zh: "Senior 與 Internal", en: "Senior and Internal" },
      b: { zh: "放進 Internal 的人跟 Co-President 一樣：改職級、派錢、再加人進 Internal。名單請留短。", en: "Anyone in Internal gets what a Co-President has: change ranks, give out Money, add others to Internal. Keep the list short." } },
    { at: "#ws-new > summary", t: { zh: "開一個專案", en: "Create a project" },
      b: { zh: "專案也是一個工作區，開好就可以派人進去。", en: "A project is a workspace too; once created you can assign people to it." } },
    { t: { zh: "看、改、管", en: "View, Edit, Manage" },
      b: { zh: "看只能讀；改可以改內容；管還能在那一頁加人、改等級、移出。", en: "View can read; Edit can change; Manage can also add, re-level and remove people on that thing's own page." } },
  ] },
  { id: "terms", page: "people:terms", steps: [
    { at: AT_HEAD, t: { zh: "屆別", en: "Terms" },
      b: { zh: "BT 一年一屆，每個人每一屆的職位都記在這裡。", en: "BT runs one term a year, and each person's position in each term is kept here." } },
    { at: [".main .section > ul.flist", ".main .section .empty"], t: { zh: "每一屆的人", en: "People in each term" },
      b: { zh: "展開「這一屆的人」看名單，可以加人或拿掉。", en: "Open People in this term to see the list, add someone or take them off." } },
    { at: "#tm-paste > summary", t: { zh: "貼一整屆", en: "Paste a term" },
      b: { zh: "一行一個人：中文名、英文名、職位、team。先按「先看一下」，沒問題再按「存」。", en: "One person per line: Chinese name, English name, position, team. Press Preview first, then Save." } },
    { at: "#tm-new > summary", t: { zh: "補過去的一屆", en: "Add a past term" },
      b: { zh: "網站上線前的屆別在這裡補。", en: "Add terms from before the site here." } },
    { at: "[data-act='end-start']", t: { zh: "換屆", en: "End the term" },
      b: { zh: "只有 Co-President 按得到：選下一屆、勾留下來的人、打新屆別的代號確認。沒勾的人變校友，工作區全部拿掉，不能復原。", en: "Co-Presidents only: pick the next term, tick who stays, type the new term id to confirm. Everyone else becomes an alumnus and loses all workspaces. This can't be undone." } },
  ] },
  { id: "bug-inbox", page: "people:feedback", steps: [
    { at: AT_HEAD, t: { zh: "回報與許願", en: "Bugs and requests" },
      b: { zh: "幹部按右下角那一顆送來的，也會寄一封信給 Co-President 與 Senior Adviser。", en: "Sent by cadres from the bottom-right button; each one is also emailed to Co-Presidents and Senior Advisers." } },
    { at: ".main .fb-tabs", t: { zh: "照狀態看", en: "By status" },
      b: { zh: "預設只看新的。切到處理中、做好了、不做或全部。", en: "New is shown by default. Switch to In progress, Done, Not doing or All." } },
    { at: ["#feedback .fb-row", "#feedback .empty"], t: { zh: "處理一則", en: "Handle one" },
      b: { zh: "改狀態馬上存。備註只有你們看得到，寫好按「存備註」。連結回到他當時那一頁。", en: "Changing the status saves at once. The note is only for you; press Save note. The link opens the page they were on." } },
  ] },
  { id: "change-log", page: "people:changes", steps: [
    { at: AT_HEAD, t: { zh: "誰改了什麼", en: "Change log" },
      b: { zh: "職級、職位、工作區的每一個改動，最近三十筆。", en: "The last 30 changes to ranks, positions and workspaces." } },
    { at: ["#changes .flist", "#changes .empty"], t: { zh: "一筆一列", en: "One row per change" },
      b: { zh: "改了誰、哪一欄、從什麼改成什麼，誰在什麼時候改的。", en: "Who was changed, which field, from what to what, and who did it when." } },
    { at: AT_SUBS, t: { zh: "要改回來", en: "To change it back" },
      b: { zh: "這一頁只能看。要改回來，到「幹部名單」打開那個人改。", en: "This page is read-only. To undo something, open that person on the Roster." } },
  ] },
  { id: "recruit-members", page: ["forms:forms", "site:res"], when: "[data-act='members-back']", steps: [
    { at: AT_HEAD, t: { zh: "誰在這裡", en: "Who works here" },
      b: { zh: "這一區的成員與他們的等級：看、改或管。", en: "This area's members and their level: View, Edit or Manage." } },
    { at: [".ma-col:last-child", ".main .section"], t: { zh: "加人", en: "Add people" },
      b: { zh: "找名字或按 team，勾人，選等級，按「加 n 個人」。", en: "Search or pick a team, tick people, choose the level and press Add people." } },
    { at: [".ma-col:first-child", ".main .section"], t: { zh: "改等級或移出", en: "Change level or remove" },
      b: { zh: "改等級馬上存，「移出」會先問一次。", en: "Level changes save straight away; Remove asks first." } },
    { at: ".main .back", t: { zh: "回去", en: "Go back" },
      b: { zh: "按這裡回到上一頁。", en: "This takes you back." } },
  ] },
  { id: "recruitment", page: "forms:forms", steps: [
    { at: AT_HEAD, t: { zh: "招募新幹部", en: "Recruiting new team members" },
      b: { zh: "招募幹部的申請表在這裡。活動與計畫的報名表不在這裡，在那一場活動自己的頁面。", en: "Recruitment forms for the team live here. Sign-up forms for events and programmes live on that event's own page." } },
    { at: ".main .page-head .actions [data-act='new-form']", t: { zh: "開一份招募表", en: "Start a recruitment form" },
      b: { zh: "打名稱，按「建立」就到表單編輯器：一題一個框、設開放時間、改成開放中，/apply/ 就看得到。", en: "Type a name and press Create to open the form editor: one box per question, set the dates, switch it to Open and it shows on /apply/." } },
    { at: [".main .section .flist", ".main .section .empty"], t: { zh: "看申請、改表單", en: "Review, or edit the form" },
      b: { zh: "每一份有「看收到的申請」與「改這份表單」。在申請那一頁勾人，按邀請面試、錄取或婉拒。", en: "Each form has View applications and Edit form. On the applications page, tick people and press Interview, Accepted or Declined." } },
    { t: { zh: "錄取之後", en: "After you accept someone" },
      b: { zh: "錄取時系統一起寄邀請，三十天內有效，他登入就在幹部名單上。職級與 team 在申請那一頁上面先設好。", en: "Accepting also sends an invite, valid 30 days; once they sign in they are on the Roster. Set the rank and team at the top of the applications page first." } },
    { at: ".main .mp-links", t: { zh: "誰在處理申請", en: "Who works on applications" },
      b: { zh: "點這裡看誰被派進「申請」這個工作區，也就是誰讀得到申請。", en: "See who is assigned to the Applications workspace, which is who can read the applications." } },
  ] },

  // ── 紀錄 ──
  { id: "record", page: "records:overview", when: "#rc-event-tabs", steps: [
    { at: ".main .rc-nums", t: { zh: "四個數字", en: "Four numbers" },
      b: { zh: "出席、推薦、有幫助、回饋份數。下面那一行跟上一場同一種活動比。", en: "Attendance, recommend, useful and responses, compared with the last event of the same kind just below." } },
    { go: "#rc-event-tabs [data-tab='attendance']", at: ".tabp[data-tabp='attendance']", t: { zh: "誰來了", en: "Who came" },
      b: { zh: "網站上報名的活動按「從報名表抄過來」，報名與簽到就進來了，重按不會重複。改完狀態按「存狀態」；沒報名就來的人用「加一個人」補。", en: "For site sign-ups, press Sync from sign-up form to bring in sign-ups and check-ins; repeating is safe. Change statuses and press Save statuses; add walk-ins with Add a person." } },
    { go: "#rc-event-tabs [data-tab='feedback']", at: ".tabp[data-tabp='feedback']", t: { zh: "活動後回饋", en: "Post-event feedback" },
      b: { zh: "按「建活動後回饋」，標準題目先放好。打開它、複製連結發出去，不用登入就能填。平均與留言會回到這裡。", en: "Press New Post-event feedback and the standard questions are filled in. Open it, copy the link and share it; no sign-in needed. Averages and comments come back here." } },
    { go: "#rc-event-tabs [data-tab='review']", at: ".tabp[data-tabp='review']", t: { zh: "檢討", en: "Review" },
      b: { zh: "活動後第一次幹部會花十五分鐘填：這次做得好的、下一次改一件事，按「存檢討」。下一場同一種活動會問這件事改了沒。", en: "At the first board meeting after the event, take 15 minutes: what went well and one thing to change, then Save review. The next event of the same kind asks whether it changed." } },
    { at: ".main .page-head .actions a.btn", t: { zh: "報名與簽到在活動那邊", en: "Sign-ups and check-in are on the event" },
      b: { zh: "網站上辦的活動，報名、簽到、場地在「這場活動的頁面」。活動編輯頁的「成果」分頁讀的就是這裡的數字。", en: "For events run on the site, sign-ups, check-in and the venue are on the event page. Its Results tab reads these same numbers." } },
  ] },
  { id: "records", page: "records:overview", steps: [
    { at: AT_HEAD, t: { zh: "每一場活動的成績", en: "Every event's scorecard" },
      b: { zh: "一屆一張表，每一場四個數字加「檢討過沒」。點名字打開那一場，補出席、發回饋表、寫檢討。", en: "One table per term, each event with four numbers and whether it was reviewed. Open one to fill in attendance, send feedback and write the review." } },
    { at: [".main .section .rc-table", ".main .empty"], t: { zh: "還沒檢討的那幾場", en: "Events not reviewed yet" },
      b: { zh: "寫著「還沒檢討」的，下一次幹部會花十五分鐘補。", en: "Anything marked Not yet gets 15 minutes at the next board meeting." } },
    { at: ".main .page-head .actions [data-act='ev-new']", t: { zh: "補一場舊活動", en: "Add a past event" },
      b: { zh: "網站上線前辦的活動，按「加一場舊活動」，填名字、種類、屆別與日期，按「建立」。舊活動不會出現在對外網站。", en: "For an event from before the site, press Add a past event, fill in the names, kind, term and dates, then Create. Past events never appear publicly." } },
    { at: AT_SUBS, t: { zh: "人與年度比較", en: "People, and year by year" },
      b: { zh: "「人」是每一個來過 BT 的人，「年度比較」把每一屆排在一起看趨勢。", en: "People lists everyone who has been part of BT; Year by year lines the terms up so you can see the trend." } },
  ] },
  { id: "record-person", page: "records:people", when: "#rc-person-tabs", steps: [
    { at: AT_HEAD, t: { zh: "一個人在 BT 的一切", en: "One person's time with BT" },
      b: { zh: "他的資料、參加過的活動、他自己寫的故事都在這一頁。", en: "Their details, the events they took part in and the story they wrote themselves are all here." } },
    { go: "#rc-person-tabs [data-tab='details']", at: ["#rc-profile", ".tabp[data-tabp='details']"], t: { zh: "基本資料", en: "Details" },
      b: { zh: "改了就存。可以加標籤；從紀錄自動得到的標籤這裡拿不掉。", en: "Changes save as you go. You can add labels; ones earned from records can't be removed here." } },
    { go: "#rc-person-tabs [data-tab='bt']", at: ".tabp[data-tabp='bt']", t: { zh: "參與紀錄", en: "With BT" },
      b: { zh: "他每一屆的職位與參加過的活動。要補一筆，按「加進一場活動」，選活動、角色、狀態，按「記進去」。", en: "Their positions and every event they joined. To add one, press Add to an event, pick the event, role and status, then Record." } },
    { go: "#rc-person-tabs [data-tab='voice']", at: ".tabp[data-tabp='voice']", t: { zh: "故事與同意", en: "Story and consent" },
      b: { zh: "他自己寫的，這裡只能看。按「開一條連結」給他一條九十天、不用登入的連結去填，可以複製或顯示 QR code。", en: "Written by them and read-only here. Create link gives them a 90-day link that needs no sign-in; copy it or show a QR code." } },
  ] },
  { id: "records-people", page: "records:people", steps: [
    { at: AT_HEAD, t: { zh: "每一個來過 BT 的人", en: "Everyone who has been part of BT" },
      b: { zh: "學員、mentee、幹部、校友、來賓都在這裡。點一個人看他的時間軸。", en: "Students, mentees, cadres, alumni and guests are all here. Open a person to see their timeline." } },
    { at: "#rc-pfind", t: { zh: "找人", en: "Find people" },
      b: { zh: "打名字找，或用「篩選」挑出一群人，例如某一年的學員。", en: "Search by name, or use Filters to pick out a group, such as one year's students." } },
    { at: [".main .rc-mergego", ".main .rc-dirbar"], t: { zh: "同一個人出現兩次", en: "The same person twice" },
      b: { zh: "按「合併兩個人」，勾兩列，按「比一比」，選要留哪一欄再合併。出席與答案都會搬過去，不能復原。", en: "Press Merge people, tick two rows, press Compare, choose which column to keep, then merge. Attendance and answers move over; it can't be undone." } },
    { at: ".main nav.ptabs [data-act='ptab'][data-t='dups']", t: { zh: "可能重複", en: "Possible duplicates" },
      b: { zh: "同名不會自動合併，只有 email 一樣才算同一個人。同名的排在這裡等人決定合併或分開放。", en: "Same names never merge by themselves; only a matching email does. Same-name pairs wait here for someone to merge or keep apart." } },
    { at: ".main nav.ptabs [data-act='ptab'][data-t='add']", t: { zh: "加一個人", en: "Add a person" },
      b: { zh: "填名字、email、學校、畢業年，按「加進名單」。還在讀高中的才勾高中生。幹部不用加，登入就有。", en: "Fill in names, email, school and graduation year, then Add. Tick still in high school only for students. Cadres need no adding; they appear when they sign in." } },
  ] },
  { id: "records-yearly", page: "records:yearly", steps: [
    { at: AT_HEAD, t: { zh: "一年一年比", en: "Year by year" },
      b: { zh: "每一屆、每一種活動一列。看的是趨勢，不是目標。七月交接時把這一頁給下一屆看。", en: "One row per term and kind of event. Read it for the trend, not as a target. Show it to the next board at the July handover." } },
    { at: [".main .card .rc-yfilter", ".main .card"], t: { zh: "挑你要比的", en: "Choose what to compare" },
      b: { zh: "挑屆別、活動種類、team，再選「比什麼」。", en: "Pick the terms, kind of event and team, then what to compare." } },
    { at: [".main .rc-compare", ".main .section .rc-table", ".main .empty"], t: { zh: "哪一種變好了", en: "Which kind got better" },
      b: { zh: "同一種活動排在一起，一屆一欄，看哪一種變好了。", en: "Each kind of event lined up across terms, one column per term, so you can see which got better." } },
    { at: "[data-act='yr-csv']", t: { zh: "帶走數字", en: "Take the numbers with you" },
      b: { zh: "「下載 CSV」用 Excel 或 Google 試算表打開，每一場的「下一次改什麼」也在裡面。", en: "Download CSV opens in Excel or Google Sheets, with each review's what-we-change line included." } },
  ] },

  // ── 場地 ──
  { id: "venue", page: "forms:venues", when: "[data-act='vn-back']", steps: [
    { at: "main.main > section.section:nth-of-type(1)", t: { zh: "場地資料", en: "Venue details" },
      b: { zh: "名字、地址、人數、費用、地圖連結，改完按「存起來」。", en: "Name, address, capacity, cost and map link; press Save when done." } },
    { at: ["#vnc-add", "main.main > section.section:nth-of-type(2)"], t: { zh: "聯絡人", en: "Contacts" },
      b: { zh: "按「加一位聯絡人」，填名字、職稱、email、電話或 LINE。聯絡人不會公開。", en: "Press Add a contact and fill in their name, role, email, phone or LINE. Contacts are never public." } },
    { at: "main.main > section.section:nth-of-type(3)", t: { zh: "在這裡辦過的活動", en: "Events held here" },
      b: { zh: "活動編輯頁的「內容」分頁選了這個場地，就會出現在這裡。", en: "An event shows here once its Details tab picks this venue." } },
    { at: ".main .back", t: { zh: "回到所有場地", en: "Back to all venues" },
      b: { zh: "按這裡回到場地清單。", en: "This takes you back to the list." } },
  ] },
  { id: "venues", page: "forms:venues", steps: [
    { at: AT_HEAD, t: { zh: "場地", en: "Venues" },
      b: { zh: "BT 用過的場地與聯絡人。活動編輯頁選一個場地，地點會自己帶進去。", en: "Venues BT has used and their contacts. Picking a venue in an event editor fills in the place." } },
    { at: "#vn-add > summary", t: { zh: "加一個場地", en: "Add a venue" },
      b: { zh: "打開這一格，填名字、種類、城市、地址、人數、費用，按「加上去」，接著加聯絡人。", en: "Open this and fill in the name, kind, city, address, capacity and cost, then press Add and add contacts next." } },
    { at: ["#vn-q", ".main .empty"], t: { zh: "找場地", en: "Find a venue" },
      b: { zh: "打名字或城市找。", en: "Search by name or city." } },
    { at: "#vn-list", t: { zh: "一列一個場地", en: "One row per venue" },
      b: { zh: "看人數、費用、辦過幾場、上次什麼時候用。點名字打開。", en: "See capacity, cost, how many events and when it was last used. Click a name to open it." } },
  ] },

  // ── 對外網站 ──
  { id: "site-events", page: "site:events", steps: [
    { at: AT_HEAD, t: { zh: "對外網站上的活動", en: "Events on the public site" },
      b: { zh: "這一頁只能看：對外的 /events/ 現在有哪些。上架下架在那一場活動自己的「設定」分頁。", en: "Read-only: what the public /events/ page has right now. Publishing happens in each event's own Settings tab." } },
    { at: ".main section.section:nth-of-type(2)", t: { zh: "等上架的", en: "Waiting to be published" },
      b: { zh: "team 按了「準備好了」就排在這裡。按「到活動頁」，在「設定」分頁按「放上對外頁」。", en: "Events a team has marked ready wait here. Press Open the event, then Publish in its Settings tab." } },
    { at: ".main section.section:nth-of-type(1)", t: { zh: "正在網站上的", en: "Live on the site" },
      b: { zh: "「看對外那一頁」看外面的人看到的樣子。結束了還掛著的會另外列一塊。", en: "View on the site shows what visitors see. Events that are over but still up get their own block." } },
    { at: AT_SUBS, t: { zh: "網站的其他部分", en: "The rest of the site" },
      b: { zh: "資源庫、團隊頁、校友故事、信的文字、歷史之路、BT 島，對外看得到的都在這一區改。", en: "Resources, the team page, alumni stories, email wording, the history road and BT Island: everything public is edited in this section." } },
  ] },
  { id: "history-stop", page: "site:history", when: "#hi-tzh", steps: [
    { at: "#hi-tzh", t: { zh: "寫這一站", en: "Write this stop" },
      b: { zh: "填中英文標題、一句話、故事與日期（只知道月份就填一號）。代號照年份與英文標題自己產生，發布之後不要改。", en: "Fill in both titles, one line, the story and the date (use the 1st if you only know the month). The slug fills itself; don't change it after publishing." } },
    { at: ["[data-act='hi-save']", "[data-autosave='hi-save']"], t: { zh: "先存一次", en: "Save it once first" },
      b: { zh: "新的一站先按「存起來」，照片才掛得上去。存過之後改字就自己存。", en: "Press Save on a new stop first, so photos can be attached. After that, text changes save by themselves." } },
    { at: ["#hi-file", ".main .hi-photos"], t: { zh: "放照片", en: "Add photos" },
      b: { zh: "一次可以選好幾張。每一張都要勾「拍攝同意已確認」，沒勾的不能上。", en: "Pick several at once. Tick that photo consent is confirmed on each; unticked photos can't go up." } },
    { at: ".main section.section:last-of-type", t: { zh: "準備好了、發布", en: "Mark ready, then publish" },
      b: { zh: "按「準備好了」，Co-President 或 Senior Adviser 按「放上去」，就出現在 /history/。上線之後拿掉同意勾，這一站會退回草稿。", en: "Press Mark ready and a Co-President or Senior Adviser presses Publish; it then appears on /history/. Unticking consent later drops it back to draft." } },
  ] },
  { id: "history", page: "site:history", steps: [
    { at: AT_HEAD, t: { zh: "BT 歷史之路", en: "BT history road" },
      b: { zh: "對外的 /history/ 上一站一站的 BT 故事。每一站：寫字、放照片、確認同意、準備好了、發布。", en: "The stops on the public /history/ road. For each: write it, add photos, confirm consent, mark ready, publish." } },
    { at: ".main .page-head .actions [data-act='hi-new']", t: { zh: "加一站", en: "Add a stop" },
      b: { zh: "按「加一站」，寫好按「存起來」，再放照片。", en: "Press Add a stop, write it, press Save, then add photos." } },
    { at: [".main .hi-list", ".main .section .empty"], t: { zh: "點一站改", en: "Open a stop to edit it" },
      b: { zh: "點名字打開。往上、往下調整順序，改了就存。", en: "Click a name to open it. Up and down change the order and save straight away." } },
    { at: ".hi-warn", t: { zh: "照片還沒確認同意", en: "Photos without consent" },
      b: { zh: "有照片還沒勾同意的站會標出來，補勾之後才發布得了。", en: "Stops with photos lacking consent are flagged; tick consent before they can be published." } },
  ] },
  { id: "island-edit", page: "site:island-map", when: "[data-act='im-back']", steps: [
    { at: ["[data-autosave='im-team-save']", ".main > .note"], t: { zh: "這座島", en: "This island" },
      b: { zh: "島的名字、介紹與樣子，改了就存，下次有人打開島就看得到。", en: "The island's name, description and look. Changes save and show the next time someone opens the island." } },
    { at: "[data-autosave='im-prog-save']", t: { zh: "島上的建築", en: "Buildings on the island" },
      b: { zh: "一棟建築是一個計畫，貼文掛在建築上。連結要用 ../ 或 https:// 開頭。", en: "Each building is a programme, and posts hang on buildings. Links must start with ../ or https://." } },
    { at: "#im-new-slug", t: { zh: "加一棟", en: "Add a building" },
      b: { zh: "填代號，按「加一棟」。代號之後不能改；拿掉一棟，掛在上面的貼文就沒地方放。", en: "Type a code and press Add a building. The code can't change later; removing a building leaves its posts with nowhere to go." } },
    { at: ".main a[href^='/island/#']", t: { zh: "到島上看", en: "See it on the island" },
      b: { zh: "按這裡看外面的人看到的樣子。", en: "See it the way visitors do." } },
  ] },
  { id: "island-map", page: "site:island-map", steps: [
    { at: AT_HEAD, t: { zh: "BT 島", en: "BT Island" },
      b: { zh: "對外的 /island/，一個 team 一座島。改得動的人改自己 team 的那一座。", en: "The public /island/, one island per team. People with Edit change their own team's island." } },
    { at: ".main section.section:nth-of-type(1) .flist", t: { zh: "點一座島", en: "Open an island" },
      b: { zh: "點進去改名字、介紹、樣子，加或拿掉建築。", en: "Open one to change its name, description and look, or add and remove buildings." } },
    { at: ".main section.section:nth-of-type(2)", t: { zh: "島跟島之間的線", en: "Lines between islands" },
      b: { zh: "兩座島一起做的事畫成一條線。只有 Co-President、Marketing 管的人或對外網站改得動的人加得了。", en: "Something two teams do together is drawn as a line. Only Co-Presidents, Marketing managers or Website editors can add one." } },
    { at: ".main .page-head .actions a[href='#island']", t: { zh: "貼文在隔壁", en: "Posts are next door" },
      b: { zh: "島上每一棟建築的貼文在「BT 島的貼文」貼。", en: "Posts for each building are made under Island posts." } },
  ] },
  { id: "island-post", page: "site:island", when: "#ip-url", steps: [
    { at: "#ip-program", t: { zh: "貼在哪一棟", en: "Which building" },
      b: { zh: "只列出你貼得了的建築。", en: "Only the buildings you can post on are listed." } },
    { at: "#ip-url", t: { zh: "IG 連結與一句話", en: "Instagram link and a line" },
      b: { zh: "貼 IG 貼文的連結（要 https:// 開頭），寫中英文一句話與日期，按「存起來」。", en: "Paste the Instagram post link (starting https://), add a line in both languages and the date, then Save." } },
    { at: ["#ip-file", "[data-act='ip-consent']"], t: { zh: "放一張圖", en: "Add a picture" },
      b: { zh: "上傳一張圖，圖裡有人就要勾同意。換圖或換連結，貼文會退回草稿。", en: "Upload a picture and tick consent if people are in it. Changing the picture or link drops the post back to draft." } },
    { at: "[data-act='ip-publish']", t: { zh: "放上去", en: "Publish" },
      b: { zh: "按「放上去」就出現在島上，不用等人核可。", en: "Publish puts it on the island straight away; no approval needed." } },
  ] },
  { id: "island-posts", page: "site:island", steps: [
    { at: AT_HEAD, t: { zh: "BT 島的貼文", en: "Island posts" },
      b: { zh: "島上每一棟建築底下的 IG 貼文。每個 team 貼自己那座島的。", en: "The Instagram posts under each building on the island. Each team posts on its own island." } },
    { at: ".main .page-head .actions [data-act='ip-new']", t: { zh: "貼一則", en: "New post" },
      b: { zh: "按「貼一則」：選建築、貼 IG 連結、寫一句話、放一張圖、按「放上去」。", en: "Press New post: pick the building, paste the Instagram link, write a line, add a picture, then Publish." } },
    { at: [".main [data-act='ip-open']", ".main .section .empty"], t: { zh: "點一則改", en: "Open one to edit it" },
      b: { zh: "一棟建築一塊，點一則改或撤下來。", en: "One block per building; open a post to change it or take it down." } },
  ] },
  { id: "resource", page: "site:res", when: "#rtitle", steps: [
    { at: "#rtitle", t: { zh: "名字與說明", en: "Name and description" },
      b: { zh: "說明寫給高中生看。這段字是公開的，也是 Google 唯一讀得到的，寫清楚這是什麼、對誰有用。", en: "Write the description for a high school student. It is public and the only part Google reads, so say what it is and who it helps." } },
    { at: "#rurl", t: { zh: "連結", en: "The link" },
      b: { zh: "貼 Drive、YouTube 或 Canva 的連結。先用無痕視窗打開一次，分享設定錯了學生會看到「需要存取權」。", en: "Paste the Drive, YouTube or Canva link. Open it in a private window first; a wrong sharing setting shows students a request-access page." } },
    { at: ["#rsection", "#rkind"], t: { zh: "放在哪一個大標", en: "Which section" },
      b: { zh: "選它放在 /resources/ 的哪一個大標底下。", en: "Choose which section of /resources/ it goes under." } },
    { at: ["[data-act='res-save']", "[data-act='res-status']"], t: { zh: "新增與上架", en: "Add and publish" },
      b: { zh: "新的按「新增」；上架之後就出現在對外的 /resources/。不用了按「下架」。", en: "Press Add for a new one; once published it shows on the public /resources/. Unpublish it when it is no longer useful." } },
  ] },
  { id: "site-res", page: "site:res", steps: [
    { at: AT_HEAD, t: { zh: "資源庫", en: "Resources" },
      b: { zh: "BT 做的免費資源，放在對外的 /resources/。這裡放的是一條連結，檔案本身留在 Google Drive 或 YouTube。", en: "Free resources BT has made, shown on the public /resources/ page. Each entry is a link; the file itself stays in Google Drive or YouTube." } },
    { at: ".main .page-head .actions [data-act='res-new']", t: { zh: "加一個資源", en: "Add a resource" },
      b: { zh: "按「加一個資源」：寫名字與一句說明、貼連結、選大標，按「新增」再上架。", en: "Press Add a resource: write a name and a line about it, paste the link, choose the section, press Add, then publish." } },
    { at: [".main .section .flist", ".main .section .empty"], t: { zh: "改一個", en: "Edit one" },
      b: { zh: "按「改」打開一個資源，改字、換連結或下架。", en: "Press Edit to change the text or link, or unpublish it." } },
    { at: ["#rsec", ".main section.section:last-of-type"], t: { zh: "大標", en: "Sections" },
      b: { zh: "/resources/ 上的大標在這裡加。一個大標底下沒有上架的資源，對外就不會出現。", en: "Add the section headings for /resources/ here. A section with nothing published under it is hidden publicly." } },
    { at: ".main .mp-links", t: { zh: "每個 team 誰在做", en: "Who works on each team's resources" },
      b: { zh: "看每個 team 誰改得了自己的資源，也在這裡加人。", en: "See who on each team can edit its resources, and add people." } },
  ] },
  { id: "site-team", page: "site:team", steps: [
    { at: AT_HEAD, t: { zh: "對外的團隊頁", en: "The public team page" },
      b: { zh: "決定誰出現在對外的 /team/ 上。幹部先在「設定」自己勾公開，再由你一個一個核可。", en: "Decide who appears on the public /team/ page. Cadres opt in under Settings, then you approve each one." } },
    { at: [".main section.section:first-of-type .flist", ".main .section .empty"], t: { zh: "核可一個人", en: "Approve someone" },
      b: { zh: "勾一下就存，馬上出現在 /team/。未滿 18 歲的一律不勾：系統沒有生日欄位，只有你擋得住。", en: "Ticking saves and puts them on /team/ at once. Never tick anyone under 18: there is no birthday field, so you are the only check." } },
    { at: "#past-teams", t: { zh: "前幾屆", en: "Past years" },
      b: { zh: "每一屆的名單，只有名字與職位。打開一屆之前，先把未滿 18 歲與不想被列出的人藏起來。只有 Co-President 動得了。", en: "Each past year's names and titles. Before turning a year on, hide anyone under 18 or who asked not to be listed. Only a Co-President can change these." } },
    { at: AT_SUBS, t: { zh: "名單從哪裡來", en: "Where the names come from" },
      b: { zh: "這裡的人是「人與權限」裡每一屆的職位，不用另外打一份。", en: "These names come from each year's positions under Internal, so there is no second list to type." } },
  ] },
  { id: "site-stories", page: "site:stories", steps: [
    { at: AT_HEAD, t: { zh: "校友故事", en: "Alumni stories" },
      b: { zh: "決定誰出現在對外的 /alumni/ 航線圖上。故事是校友自己在頂欄的「我的故事」寫的，也是他自己勾同意公開。", en: "Decide who appears on the public /alumni/ route map. Alumni write their own story under My story in the top bar and tick their own consent." } },
    { at: [".main .section .note", ".main .section"], t: { zh: "核可之前看四件事", en: "Four checks before approving" },
      b: { zh: "滿 18 歲了嗎、真的是 BT 校友嗎、這段字能用 BT 的名義放出去嗎、他說在 BT 做過的事是真的嗎。", en: "Are they 18 or older, really BT alumni, is the text fine under BT's name, and did they really do what they say?" } },
    { at: [".main input[data-act='approve-story']", ".main .section .empty"], t: { zh: "核可", en: "Approve" },
      b: { zh: "勾一下就上 /alumni/。他之後再改字會自動撤下來，回到這裡等你再看一次。沒填縣市的不會出現在地圖上。", en: "Ticking puts it on /alumni/. If they edit later it comes down by itself and returns here. Anyone without a county never appears on the map." } },
  ] },
  { id: "site-mail-edit", page: "site:mail", when: "[data-autosave='mail-save']", steps: [
    { at: "#msub", t: { zh: "主旨與內文", en: "Subject and body" },
      b: { zh: "直接改，停手幾秒或離開這一格就存。下一封寄出去的就是新的字。", en: "Edit directly; it saves a few seconds after you stop or when you leave the field. The next email sent uses it." } },
    { at: "#mbody", t: { zh: "大括號裡的字", en: "Words in braces" },
      b: { zh: "內文下面列著可以用的代入欄位，例如名字。拼錯不會出錯，只會變成空白。", en: "The placeholders you can use, such as the name, are listed below the body. A typo doesn't break anything; it just comes out blank." } },
    { at: "details.fold[data-fold='mail-en']", t: { zh: "英文版", en: "English version" },
      b: { zh: "展開改英文版，收信人選英文的就收到這一份。", en: "Open this to edit the English version, sent to people who chose English." } },
    { at: "iframe.mailframe", t: { zh: "收到的樣子", en: "How it arrives" },
      b: { zh: "右邊是收信人看到的樣子，可以切中英文、手機或電腦。", en: "This is what the recipient sees; switch language, phone or desktop." } },
  ] },
  { id: "site-mail", page: "site:mail", steps: [
    { at: AT_HEAD, t: { zh: "系統寄的信", en: "Emails the system sends" },
      b: { zh: "申請、邀請、Marketing 需求單、會議這幾類信的文字都在這裡改。只有 Co-President 與 Senior Adviser 改得動。", en: "The wording of the application, invite, Marketing request and meeting emails is edited here. Only Co-Presidents and Senior Advisers can change it." } },
    { at: ".main .section .flist", t: { zh: "點一封改", en: "Open one to edit it" },
      b: { zh: "按「改」打開一封，中英文各一份。改完自己存，下一封寄出去的就是新的字。", en: "Press Edit to open one; each has Chinese and English. It saves itself and the next email sent uses it." } },
    { at: AT_SUBS, t: { zh: "網站的其他部分", en: "The rest of the site" },
      b: { zh: "活動、資源庫、團隊頁、校友故事、歷史之路、BT 島，都在這一區。", en: "Events, resources, the team page, alumni stories, the history road and BT Island are all in this section." } },
  ] },

  // ── 護照（後台）──
  { id: "passport-box", page: "passports:cadre", when: "#ak-zh", steps: [
    { at: "#ak-zh", t: { zh: "這一格的題目", en: "This box's title" },
      b: { zh: "幹部在護照上看到的題目與說明。改了就存，幹部重新整理護照就看得到。代號鎖住不能改。", en: "The title and description cadres see. Changes save, and cadres see them when they refresh. The id is locked." } },
    { at: [".main .exbox", "#ak-cb"], t: { zh: "範例", en: "Example" },
      b: { zh: "放一個範例，幹部按「看範例」就看得到，比說明更好懂。", en: "Add an example; cadres see it with See example, which is often clearer than the description." } },
    { at: ".main .back", t: { zh: "回到護照", en: "Back to the passport" },
      b: { zh: "蓋過章的格子不能刪，只能停用。", en: "A box someone has stamped can't be deleted, only disabled." } },
  ] },
  { id: "passports-cadre", page: "passports:cadre", steps: [
    { at: AT_HEAD, t: { zh: "幹部護照", en: "The cadre passport" },
      b: { zh: "33 格的題目與說明、每個月右上角的時刻都在這裡改。改完幹部重新整理護照就看得到。", en: "Edit the 33 boxes and each month's time in the corner here. Cadres see the change when they refresh their passport." } },
    { at: ".main .jump", t: { zh: "跳到某個月", en: "Jump to a month" },
      b: { zh: "一個月一塊，點月份直接跳過去。", en: "One block per month; press a month to jump to it." } },
    { at: ".main section.section[id^='m']", t: { zh: "揭曉一個月", en: "Reveal a month" },
      b: { zh: "新的一個月一開始是封起來的。按「揭曉這個月」，每一位幹部馬上就看得到，記得同一時間在群組講。", en: "A new month starts sealed. Reveal this month opens it for every cadre at once, so announce it in the group at the same time." } },
    { at: "[data-act='act-edit']", t: { zh: "改一格", en: "Edit a box" },
      b: { zh: "按一格的「改」換題目、說明與範例；「改時刻」換那個月右上角的字。", en: "Press Edit on a box to change its title, description and example; Edit time changes the month's corner text." } },
    { at: "[data-act='preview']", t: { zh: "看幹部看到的樣子", en: "See what cadres see" },
      b: { zh: "按這裡在下面打開一本預覽的護照。", en: "Opens a preview passport below." } },
    { at: ".main .addmonth", t: { zh: "加一個月", en: "Add a month" },
      b: { zh: "選一個月，按「加進護照」。藏起來的月份不算進總格數。", en: "Pick a month and press Add to passport. Hidden months don't count toward the total." } },
  ] },
  { id: "passports-cities", page: "passports:cities", steps: [
    { at: AT_HEAD, t: { zh: "入境章的城市", en: "Entry-stamp cities" },
      b: { zh: "幹部蓋滿一個月拿到入境章，會從這裡的城市抽一個。", en: "When a cadre fills a month and gets an entry stamp, one of these cities is drawn." } },
    { at: ".main .page-head .actions [data-act='dest-new']", t: { zh: "加一個城市", en: "Add a city" },
      b: { zh: "按「加一個城市」，填中英文名字。", en: "Press Add a city and fill in both names." } },
    { at: ["#cities table", "#cities .empty"], t: { zh: "改名或停用", en: "Rename or disable" },
      b: { zh: "城市不能刪，只能停用。停用的不會再被新的入境章抽到，已經蓋好的章不變。", en: "Cities can't be deleted, only disabled. A disabled city isn't drawn for new stamps; existing stamps stay." } },
  ] },
  { id: "passports-interns", page: "passports:interns", steps: [
    { at: AT_HEAD, t: { zh: "實習護照", en: "The intern passport" },
      b: { zh: "實習生自己的護照。先開一屆、分好組，再寫每一格要做的事。", en: "The interns' own passport. Start a term, set up the groups, then write what each box asks for." } },
    { at: "#terms", t: { zh: "屆別", en: "Terms" },
      b: { zh: "一期實習一屆。新的一屆按「開新的一屆」，再按「設成目前這一屆」才會生效。", en: "One term per round of internships. Press New term, then Set as current term for it to take effect." } },
    { at: "#groups", t: { zh: "分組", en: "Groups" },
      b: { zh: "一組一頁，實習生只看得到自己那一組。", en: "Each group gets its own page, and interns only see their own group." } },
    { at: "#tasks", t: { zh: "每一格", en: "The boxes" },
      b: { zh: "照階段分好，點一格改它。蓋過章的格子不能刪，只能停用。「看它在實習護照上長什麼樣」看實習生看到的樣子。", en: "Grouped by stage; open a box to change it. Stamped boxes can only be disabled. See it in the intern passport shows exactly what interns see." } },
    { at: AT_SUBS, t: { zh: "蛇梯棋", en: "The game board" },
      b: { zh: "實習生蓋一個章拿一次擲骰子，棋盤在「實習的蛇梯棋」那一頁改。", en: "Interns earn one roll per stamp; the board itself is edited on the Intern game board page." } },
  ] },
  { id: "passports-board", page: "passports:board", steps: [
    { at: AT_HEAD, t: { zh: "實習的蛇梯棋", en: "The intern game board" },
      b: { zh: "實習生蓋一個章拿一張票，擲骰子走棋。改的是你在「實習護照」選的那一屆。", en: "Interns earn one roll per stamp and move along the board. It edits the term chosen on Intern passport." } },
    { at: ["#board-layout .bgrid", ".main .empty"], t: { zh: "點一格就能改", en: "Click a square to change it" },
      b: { zh: "點一格，選它是梯子、蛇還是任務格，按「套用」，全部改好按右上角「存起來」。", en: "Click a square, choose ladder, snake or task, press Apply, then Save at the top right when done." } },
    { at: "#board-live", t: { zh: "打開給實習生", en: "Turn it on for interns" },
      b: { zh: "存過之後才有這個開關。打開之後，棋盤大小與蛇和梯子就鎖住了。", en: "This switch appears once the board is saved. After turning it on, the size, snakes and ladders are locked." } },
  ] },

  // ── 錢 ──
  { id: "money", page: "finance:overview", steps: [
    { at: [".main .fin-total", ".main .empty"], t: { zh: "BT 現在有多少錢", en: "How much BT has now" },
      b: { zh: "全部帳戶加起來，下面一個帳戶一張卡。數字是「收支紀錄」加出來的，作廢的不算；轉帳只是搬家，不算收入也不算支出。", en: "All accounts together, then one card per account. It adds up from Transactions, leaving out voided rows; transfers only move money, so they count as neither." } },
    { at: ".main [data-act='ov-term']", t: { zh: "看哪一屆", en: "Which term" },
      b: { zh: "選一屆，下面的收入、支出與圖就換成那一屆的。", en: "Pick a term and the income, spending and chart below switch to it." } },
    { at: [".main .fin-four", ".main .fin-chart-box"], t: { zh: "這一屆進出多少", en: "In and out this term" },
      b: { zh: "這一屆與這個月的收入、支出、淨額，下面每個月一條。", en: "This term's and this month's income, spending and net, with one bar per month below." } },
    { at: ".main .cols", t: { zh: "錢花在哪裡", en: "Where the money went" },
      b: { zh: "照類別分。有預算的類別會畫進度條，超過變橘色。", en: "Split by category. Categories with a budget get a bar that turns orange when over." } },
    { at: ".main .msg.err", t: { zh: "還沒分類的", en: "Rows without a category" },
      b: { zh: "有幾筆還沒選類別，到「收支紀錄」補上，數字才分得對。", en: "Some rows have no category; fill them in under Transactions so the split is right." } },
    { at: AT_SUBS, t: { zh: "第一次用", en: "Starting out" },
      b: { zh: "先到「帳戶與類別」開帳，再到「收支紀錄」一筆一筆登。", en: "Open the accounts first under Accounts & categories, then enter rows under Transactions." } },
  ] },
  { id: "money-tx", page: "finance:tx", steps: [
    { at: ".main .page-head .actions [data-act='tx-new']", t: { zh: "登一筆", en: "Add a row" },
      b: { zh: "按「加一筆」：日期、收入支出或轉帳、金額、幣別、帳戶、類別，可以掛一場活動，按「加進去」。外幣要填銀行實際給的匯率。", en: "Press Add a row: date, income, expense or transfer, amount, currency, account and category, optionally an event, then Add. Foreign currency needs the rate the bank actually gave." } },
    { at: ".main .fin-fbx", t: { zh: "找一筆", en: "Find a row" },
      b: { zh: "打對象或備註找，或用「篩選」看某一屆、某個帳戶或某一類。", en: "Search the counterparty or note, or use Filters for one term, account or category." } },
    { at: [".main table.fin-tx", ".main .empty"], t: { zh: "改一筆、傳收據", en: "Edit a row, upload a receipt" },
      b: { zh: "按「改」直接在那一列改，改了就存。「傳收據」放照片或 PDF，五 MB 以內。", en: "Press Edit to change it in place; it saves as you go. Upload receipt takes a photo or PDF up to 5 MB." } },
    { at: [".main .fin-tx [data-act='tx-void']", ".main table.fin-tx", ".main .empty"], t: { zh: "登錯了不要刪", en: "Don't delete mistakes" },
      b: { zh: "登錯的按「作廢」，寫一句為什麼。那一筆留著變灰色，總覽不算它。", en: "Void a wrong row and write one line on why. It stays, greyed out, and the overview leaves it out." } },
  ] },
  { id: "money-accounts", page: "finance:accounts", steps: [
    { at: AT_HEAD, t: { zh: "帳戶與類別", en: "Accounts and categories" },
      b: { zh: "帳戶是錢放在哪裡：銀行、現金、平台。類別是收支分哪幾種。", en: "Accounts are where money sits: bank, cash, a platform. Categories are the kinds of income and spending." } },
    { at: ".main .section [data-act='acc-new']", t: { zh: "第一天怎麼開帳", en: "Opening an account on day one" },
      b: { zh: "按「加一個帳戶」，把今天的餘額填成開帳餘額、開帳日填今天，之前的錢不用補登。", en: "Press Add an account, enter today's balance as the opening balance and today as the opening day; earlier money is not entered." } },
    { at: [".main .fin-accs-list", ".main .empty"], t: { zh: "改一個帳戶", en: "Edit an account" },
      b: { zh: "改了就存。不用的帳戶按「封存」。", en: "Changes save as you go. Archive accounts you no longer use." } },
    { at: ".main .section [data-act='cat-new']", t: { zh: "類別", en: "Categories" },
      b: { zh: "「加一個類別」選收入或支出。類別改名會連舊的一起改；不用的封存，不要刪。", en: "Add a category as income or expense. Renaming one renames old rows too; archive unused ones instead of deleting them." } },
  ] },
  { id: "money-budget", page: "finance:budget", steps: [
    { at: AT_HEAD, t: { zh: "預算", en: "Budget" },
      b: { zh: "這一屆每一類支出打算花多少。", en: "How much each kind of spending is meant to cost this term." } },
    { at: ".main [data-act='ov-term']", t: { zh: "哪一屆", en: "Which term" },
      b: { zh: "先選這是哪一屆的預算。", en: "First choose which term this budget is for." } },
    { at: [".main .fin-budget > li", ".main .empty"], t: { zh: "填一個數字", en: "Fill in a number" },
      b: { zh: "每一類填這一屆的預算（台幣），填了就存。超過會變橘色，只是提醒，不會擋。總覽上也看得到同一條。", en: "Enter each category's budget for the term (TWD); it saves straight away. Going over turns it orange as a reminder, never a block. The same bar shows on the overview." } },
  ] },
  { id: "money-export", page: "finance:export", steps: [
    { at: AT_HEAD, t: { zh: "匯出給會計", en: "Export for the accountant" },
      b: { zh: "把收支下載成 CSV，給會計或理事會。Excel 直接開，中文不會變亂碼。", en: "Download transactions as CSV for the accountant or the board. Excel opens it with Chinese intact." } },
    { at: ".main .fin-filters", t: { zh: "哪一段時間", en: "Which period" },
      b: { zh: "選一屆或一個月，下面寫著會匯出幾筆。在「收支紀錄」設的篩選也會帶過來。", en: "Pick a term or a month; the count below says how many rows go out. Filters set on Transactions carry over." } },
    { at: ".main .page-head .actions [data-act='csv-download']", t: { zh: "下載", en: "Download" },
      b: { zh: "按「下載 CSV」。作廢的那幾筆也在檔案裡，最後兩欄有標出來。", en: "Press Download CSV. Voided rows are included and flagged in the last two columns." } },
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
// 開導覽那一刻的步驟清單：現在找得到的留著（同 tourStepsOn），前面有 go 的那幾步先留著、標 later，輪到它再找。
export function tourPlan(steps, find) {
  const later = tourDeferred(steps), out = [];
  (steps || []).forEach((s, k) => {
    if (later[k]) { out.push({ ...s, sel: "", later: true }); return; }
    const got = tourStepsOn([s], find);
    if (got.length) out.push(got[0]);
  });
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

// 一步的 go（2026-11-27 Paul：「once you click into it, there's boxes you can edit」）：導覽先幫你按一個分頁，再框住分頁裡的東西，
//   這樣才講得出「到表單分頁、按這一顆、裡面一題一個框」這種做法，不是只說「這裡有六個分頁」。
//   **go 只准是分頁或切換畫面的鈕（不存、不寄、不刪任何東西）。** test/tour.test.mjs 照 TOUR_GO 守。
export const TOUR_GO = /\[data-tab=|\[data-act="?tab"?\]|\[data-t=|\[data-view=|\[data-mode=|\[data-pt=|\[data-ft=|\[data-v=|\[data-p=|\[data-sub=/;
// 這一步要不要等：前面（含自己）有 go 的那幾步，開導覽的時候還沒畫出來是正常的，輪到它再找。
export function tourDeferred(steps) {
  let seen = false;
  return (steps || []).map(s => (seen = seen || !!s.go));
}
// 退回第 i 步的時候，畫面要回到哪一個分頁：第 i 步（含）之前最近的那一個 go。沒有就回 ""。
export function tourGoAt(steps, i) {
  for (let k = Math.min(i, (steps || []).length - 1); k >= 0; k--) if (steps[k].go) return steps[k].go;
  return "";
}

// ── 在瀏覽器裡跑的部分 ──
const tour = { page: "", L: "zh", steps: null, i: 0, el: null, back: null, place: 0, seq: 0, went: "", goAt: 0 };
const tHost = () => document.getElementById("bt-tour");
const tReduce = () => { try { return matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { return false; } };
const tShown = el => { if (!el || !el.getBoundingClientRect) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
const tFind = sel => { const all = document.querySelectorAll(sel); for (const el of all) if (tShown(el) && !el.closest("#bt-tour .tour-layer")) return el; return null; };
function tCurrent() { return pickTour(tour.page, s => !!document.querySelector(s)); }
function tStart(plan) {
  let steps = tourPlan(plan.flatMap(t => t.steps), tFind);
  // 這一頁那一段一步都框不到（畫面還沒載完、或是沒料到的狀態）時，改跑歡迎那一段，不要按了沒反應。
  if (!steps.length) { const w = welcomeTour(); steps = w ? tourPlan(w.steps, tFind) : []; }
  if (!steps.length) return;
  tour.steps = steps; tour.i = 0; tour.back = document.activeElement; tour.went = "";
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
  tour.steps = null; tour.el = null; tour.went = ""; tour.seq++;
  const b = tour.back; tour.back = null;
  if (b && b.isConnected && b.focus) b.focus(); else { const f = h && h.querySelector(".tour-fab"); if (f) f.focus(); }
}
function tShow(dir) {
  const h = tHost(), slot = h && h.querySelector(".tour-slot");
  if (!slot || !tour.steps) return;
  const s = tour.steps[tour.i], seq = ++tour.seq, want = tourGoAt(tour.steps, tour.i);
  let clicked = false;
  if (want && want !== tour.went) {
    const g = tFind(want);
    if (g) { tour.goAt = Date.now(); g.click(); clicked = true; }
    tour.went = want;
  }
  if (!s.later && !clicked) return tDraw(slot, s);
  // 分頁剛按下去，裡面的東西可能還在載：每 120 毫秒找一次，最多兩秒。還是找不到就拿掉這一步，往同一個方向走。
  const sels = tourSels(s.at); let tries = 0;
  const look = () => {
    if (seq !== tour.seq || !tour.steps) return;
    const sel = sels.find(x => { try { return !!tFind(x); } catch (e) { return false; } }) || "";
    if (!sels.length || sel) { tour.steps[tour.i] = { ...s, sel, later: false }; return tDraw(slot, tour.steps[tour.i]); }
    if (++tries < 17) { setTimeout(look, 120); return; }
    tour.steps.splice(tour.i, 1);
    if (dir < 0) tour.i = Math.max(0, tour.i - 1);
    if (!tour.steps.length || tour.i >= tour.steps.length) return tClose();
    tShow(dir);
  };
  look();
}
function tDraw(slot, s) {
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
  tour.i = n; tShow(d);
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
  // 換到別頁就關掉導覽；但導覽自己剛按了一個分頁（go）、頁面因此重畫的那兩秒內不算。
  if (tour.steps) { if (moved && Date.now() - tour.goAt > 2000) tClose(); else setTimeout(tPlace, 0); }
}
