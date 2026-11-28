// 站台的頂欄。每一個登入後的頁面都畫這一條，長得一樣。
//
// ── 這裡是功能清單唯一的來源 ──
// 頂欄的項目與 /app/ 的選單卡片都從 FEATURES 產生。之後多一個功能就是在這裡
// 多一筆，不是改 HTML。兩份清單的話，漏加的那一頁不會壞、只會少一個入口，
// 而那種缺陷沒有人會回報 —— 使用者只會以為那個功能還沒做。
//
// roles 是誰看得到。學員（student）目前一項都看不到，所以他的頂欄只有
// logo、名字、登出 —— **列照樣畫，只是空的**。不整條藏起來的理由：
// 他知道自己在這個站裡、只是還沒有功能，而不是懷疑頁面壞了；
// 而且之後開放給學員的功能只要在 roles 加 "student"，列就自動長出來，
// 不用另外設計一條路徑。過濾在這裡做，不在各頁做 —— 漏做的頁面不會壞、
// 只會多一個點了會被彈回來的入口。
//
// **這個檔案不准 import 任何功能資料夾的東西**（passport/、availability/、app/）。
// shared/ 的依賴方向只能往下；反過來的話，護照壞掉會讓每一頁的頂欄一起壞。
//
// 2026-10-19 中英切換：label / title / desc 都是 { zh, en } 兩句並排。頂欄本身**沒有切換鈕**
// （它只是導覽），語言照使用者在 /settings/ 或後台選的那一個（navLang()，見下面）。
// 字典寫在這個檔案裡面，不另開檔：shared/ 要保持極小。
export const FEATURES = [
  // 2026-10-28：首頁與行事曆排在最前面（Paul：「什麼都在後台，team 不知道東西在哪」）。
  // 幹部登入後先到首頁：等他回覆的會、接下來的會與活動、「我要…」的捷徑。後台只給要管東西的人用。
  // 兩筆指到同一個資料夾，行事曆是 #calendar。推翻 2026-10-23「頂欄一行不改」，理由記在 Anson decisions。
  { key: "home",         label: { zh: "首頁", en: "Home" },         href: "/home/",         roles: ["cadre"],
    title: { zh: "首頁", en: "Home" },           desc: { zh: "等你回覆的會、接下來的會與活動", en: "Meetings waiting for your reply, what's coming up" } },
  // inSidebar（2026-11-14 Paul：「menu 換了，頂欄要不要重想」）：這幾項已經在側欄（shared/rail.js 的「我的」「我的工作區」「整個 BT」），
  // 幹部的頂欄只留首頁與設定，不再畫兩次。首頁留著，因為護照、時間看板、設定這三頁沒有側欄，要有一條回去的路。
  // 學員、intern、校友沒有側欄，他們的頂欄不受影響。featuresFor() 照舊回全部（後台「你的存取」那一段用它說明每一項）。
  { key: "calendar",     label: { zh: "行事曆", en: "Calendar" },   href: "/home/#calendar", roles: ["cadre"], inSidebar: true,
    title: { zh: "行事曆", en: "Calendar" },     desc: { zh: "整個月的會議與活動", en: "Meetings and events by month and week" } },
  // 我的護照搬到頂欄（2026-11-28 Paul：「Move my passport to the top menu」），排在我的故事前面。
  //   barWs：誰的頂欄有這一項，跟側欄的規矩一樣，要被開了「我的護照」那一格（custom:my-passport），Co-President 與 Senior Adviser 一定有。
  { key: "passport",     label: { zh: "我的護照", en: "My passport" }, href: "/passport/",  roles: ["cadre"], bar: true, barWs: "custom:my-passport",
    title: { zh: "幹部護照", en: "Cadre passport" },     desc: { zh: "這一年的活動、章、心得與照片", en: "This year's activities, stamps, notes and photos" } },
  { key: "availability", label: { zh: "時間看板", en: "Availability" }, href: "/availability/", roles: ["cadre"], inSidebar: true,
    title: { zh: "每週時間看板", en: "Weekly availability board" }, desc: { zh: "填自己每週固定有空的時段；大家有空的人數在首頁的行事曆點一天看", en: "Fill in when you are usually free each week; see who is free by clicking a day on the Home Calendar" } },
  // 2026-09-08（批 3）。**所有幹部都看得到這個入口，那是對的。**
  // 每個幹部都屬於一個 team，而 2026-09-07 拍板的可見範圍是
  // 「該 team 的幹部看得到自己 team 收到的申請」——
  // 所以每個人進去都有東西可看。誰「改得動」是 /admin/ 裡面的事，
  // 由資料庫的 is_director_of() 決定，不是靠這裡藏一個連結。
  // **不要在這裡加一層 board_role 的過濾**：那會讓一般幹部連自己 team 的
  // 申請都看不到，而那不是拍板的內容。
  // 2026-10-15：後台拆成四個資料夾（申請、對外、護照、人與權限），這一筆改名「後台」。
  // 子資料夾不進頂欄：誰進得去哪一組由 /admin/ 首頁的分組列帶，這裡仍然不認 board_role。
  { key: "admin",        label: { zh: "後台", en: "Admin" },     href: "/admin/",        roles: ["cadre"], inSidebar: true,
    title: { zh: "後台", en: "Admin" },         desc: { zh: "申請表與審核、對外內容、護照的格子、邀請碼", en: "Forms and review, public content, passport boxes, invite codes" } },
  // 2026-09-08：設定。**這是第一個 roles 含 student 的項目。**
  // 這個檔案的檔頭一直寫著「之後開放給學員的功能只要在 roles 加 student，
  // 列就自動長出來，不用另外設計一條路徑」—— 就是這一刻。
  // 2026-09-11：校友也用同一頁（他的「我的故事」在裡面）。
  // 2026-11-27 Paul：「my story, where I am right now, it should be on the separate pages… open another pages up top that says my story」。
  // 同一個資料夾（/settings/）的 #story：存故事的程式本來就在那裡，搬資料夾只會多一份。學員沒有故事，所以 roles 沒有 student。
  // 2026-11-27 第三版（Paul：「my story and internal can be on top of the menu, and then once you click Paul… you can go into setting」）：
  // bar: true 的畫在幹部頂欄上（我的故事、人與權限）；設定是右上角的大頭照加名字（點了直接到設定，見 cadreBarHTML）。
  { key: "story",        label: { zh: "我的故事", en: "My story" }, href: "/settings/#story", roles: ["cadre", "alumni"], bar: true,
    title: { zh: "我的故事", en: "My story" },     desc: { zh: "創辦人、我的故事、我現在在哪", en: "Founder, your story, where you are now" } },
  // 人與權限（2026-11-27 從側欄搬到頂欄，Paul：「that's only senior advisor accessible… on the left tab menu, which is kind of confusing」）。
  // boards 是**唯一一個照職級過濾的項目**：Co-President 與 Senior Adviser 才畫（跟 /admin/people/ 開頁那一句、資料庫的 is_senior() 同一條）。
  // 檔頭說「不要加 board_role 的過濾」講的是「後台」那一項（一般幹部也要進得去自己 team 的申請）；這一項本來就只開給這兩種人，畫給別人只會多一個點了被彈回來的入口。
  { key: "people",       label: { zh: "人與權限", en: "Internal" }, href: "/admin/people/", roles: ["cadre"], boards: ["president", "senior_adviser"], bar: true,
    title: { zh: "人與權限", en: "Internal" },     desc: { zh: "幹部名單、邀請、工作區、屆別", en: "Roster, invites, workspaces, terms" } },
  // 2027-01-25：BT 的朋友（connection，個人連結開出來的帳號）。他的東西就是那一份個人檔案，/profile/ 登入之後讀寫的是名單上他那一列。
  // /profile/ 不載這支頂欄（那一頁沒登入也要能填），回設定的路在那一頁上方那一行。
  { key: "myprofile",    label: { zh: "我的檔案", en: "My profile" }, href: "/profile/",    roles: ["connection"],
    title: { zh: "我的檔案", en: "My profile" },   desc: { zh: "你的介紹、學歷、工作、故事，還有 BT 可以拿去做什麼", en: "Your intro, education, work, story, and what BT may do with them" } },
  { key: "settings",     label: { zh: "設定", en: "Settings" },     href: "/settings/",     roles: ["cadre", "student", "alumni", "intern", "connection"],
    title: { zh: "設定", en: "Settings" },         desc: { zh: "名字、語言、大頭照、要不要出現在公開的團隊頁上", en: "Name, language, avatar, whether to appear on the public team page" } },
  // 2026-10-17：實習生護照（方案 C，docs/2026-10-15-實習生護照盤點與設計.md）。
  // roles 只有 intern。Internship team 的幹部也看得到那一頁的進度牆，
  // 但這裡**不放 cadre**：那會讓其他五個 team 的幹部多一個點了被彈回來的入口，
  // 而這個檔案不准依 team 過濾（見檔頭）。他們的入口在 /settings/ 的護照那一段。
  { key: "intern-passport", label: { zh: "實習護照", en: "Intern passport" }, href: "/intern-passport/", roles: ["intern"],
    title: { zh: "實習護照", en: "Intern passport" },     desc: { zh: "這一期的任務、章與心得", en: "This term's tasks, stamps and notes" } },
];

// ── 語言（2026-10-19 中英切換）──────────────────────────────────────────
// 每一個登入後的頁面都用同一套決定法：網址 ?lang= 先、再 localStorage 的 bt-lang、都沒有就英文。
// 各資料夾的 strings.js 有一份一模一樣的 pickLang（資料夾不 import 這裡的機制以外的東西，
// 而這裡不能 import 它們），所以這一份只給頂欄自己用，呼叫端有算好的就傳 lang 進來。
export const LANGS = ["zh", "en"];
export const LANG_KEY = "bt-lang";
export function navLang() {
  let q = null, stored = null;
  try { q = new URLSearchParams(location.search).get("lang"); } catch (e) {}
  try { stored = localStorage.getItem(LANG_KEY); } catch (e) {}
  if (LANGS.includes(q)) return q;
  if (LANGS.includes(stored)) return stored;
  return "en";
}
// { zh, en } 挑一句；給的是字串就原樣回。
export const tx = (v, lang) => (v && typeof v === "object") ? (v[lang] != null ? v[lang] : (v.en != null ? v.en : v.zh)) : String(v == null ? "" : v);
// 連結帶上 ?lang=，語言跟著人走（跟後台側欄同一招）。
export function withLang(href, lang) {
  const s = String(href || "");
  if (/[?&]lang=/.test(s)) return s;
  const i = s.indexOf("#");
  const base = i < 0 ? s : s.slice(0, i);
  return base + (base.includes("?") ? "&" : "?") + "lang=" + lang + (i < 0 ? "" : s.slice(i));
}
const NAV = {
  aria:   { zh: "站台導覽", en: "Site navigation" },
  me:     { zh: "{name} 的設定", en: "Settings for {name}" },
  home:   { zh: "回 Beyond Taiwan 首頁", en: "Back to the Beyond Taiwan home page" },
  open:   { zh: "展開選單", en: "Open the menu" },
  menu:   { zh: "選單", en: "Menu" },
  signout:{ zh: "登出", en: "Sign out" },
};

// board 是 profiles.board_role（沒給就當一般幹部）。有 boards 的項目只給那幾種職級（2026-11-27，人與權限）。
export function featuresFor(role, board) {
  return FEATURES.filter(f => f.roles.includes(role) && (!f.boards || f.boards.includes(board)));
}
// 頂欄真正畫的那幾項：側欄已經有的不再畫（2026-11-14）。
export function barFor(role, board) {
  return featuresFor(role, board).filter(f => !f.inSidebar);
}

const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// current：現在在哪一個功能（FEATURES 的 key），會被標成當前。
// role：看的人的角色。name：顯示在右邊的名字。lang：zh 或 en，沒給就自己看網址與 localStorage。
//
// 頂欄是米白底（見 nav.css 檔頭：深藍是點綴色，整條鋪滿等於把它當主色用），
// 所以 logo 直接坐在上面，不需要另外墊一塊——它本來就是為這個紙色設計的。
// board：看的人的職級（profiles.board_role），只用來決定畫不畫「人與權限」。沒傳就不畫，不會多給。
// rail：這一頁有沒有畫左邊的側欄（2026-11-27 第二版）。幹部的頂欄不再放「首頁」，因為側欄最上面就是首頁；
// 沒有側欄的那兩頁（設定、實習生進度牆）傳 rail: false，頂欄就多一個「首頁」，不然回不去。
export function navHTML({ current, role, name, lang, board, rail, avatar, ws }) {
  const L = LANGS.includes(lang) ? lang : navLang();
  if (role === "cadre") return cadreBarHTML({ current, name, L, board, rail: rail !== false, avatar, ws });
  const items = barFor(role, board).map(f =>
    `<a href="${withLang(f.href, L)}"${f.key === current ? ' aria-current="page"' : ""}>${esc(tx(f.label, L))}</a>`).join("");
  const n = String(name || "");
  return `<nav class="btnav" aria-label="${esc(tx(NAV.aria, L))}">
    <!-- 2026-09-08：logo 改成回**對外的首頁**，不是回 /app/。
         /app/ 現在只剩登入表單（幹部登入後直接進 /settings/），
         點 logo 回到一頁只有表單的地方沒有意義。
         Paul 的原話：「按首頁會回到最外面」。 -->
    <a class="btnav-logo" href="/" aria-label="${esc(tx(NAV.home, L))}"><img src="/shared/logo.png" alt="Beyond Taiwan" width="386" height="191"></a>
    <!-- 窄螢幕上這幾個功能項收成一顆「選單」。
         **開合是純 CSS**：一個看不見的 checkbox 加一個 label，
         用 :checked 的兄弟選擇器把面板打開。

         ⚠ 這一段註解在一個樣板字串（template literal）裡面，
         所以**不要用反引號括程式碼**，那會把字串提早結束掉，
         而錯誤訊息是離這裡很遠的一句 Unexpected token。2026-09-10 踩過。

         ⚠ **不要「改良」成 <details>。** 試過了：<details> 在還沒展開的時候
         會把 summary 以外的小孩整個藏起來，而那不是一條可以用 CSS 蓋掉的規則
         （瀏覽器是用內部的 slot 做的）。結果是**寬螢幕上四個功能項整排消失**，
         而且不會報錯 —— 2026-09-10 截圖才發現。

         ⚠ **也不要改成用 JavaScript。** 那段程式要嘛塞進四個頁面的 main.js
         （四份會各自壞掉、而且下一個做新功能的人一定會漏掉），
         要嘛讓這個檔案在被 import 的時候偷偷掛一個全域監聽（副作用）。
         checkbox 兩者都不用。

         checkbox 是看得見的（只是被移到畫面外），所以鍵盤 tab 得到、
         讀螢幕唸得出「展開選單」。 -->
    <input class="btnav-toggle" type="checkbox" id="btnav-toggle" aria-label="${esc(tx(NAV.open, L))}">
    <label class="btnav-burger" for="btnav-toggle">${esc(tx(NAV.menu, L))}</label>
    <div class="btnav-items">${items}</div>
    <span class="btnav-sp"></span>
    ${n ? `<span class="btnav-who" title="${esc(n)}"><span class="full">${esc(n)}</span><span class="short">${esc([...n][0])}</span></span>` : ""}
    <button class="btnav-out" data-act="signout">${esc(tx(NAV.signout, L))}</button>
  </nav>`;
}

// ── 幹部的頂欄（2026-11-27 第三版）────────────────────────────────────────
// Paul：「there's like 100 different tabs on the left menu, and then there's setting on top, there's like home and everything」。
// 每一頁都在左邊的側欄（shared/rail.js），頂欄只放三樣東西：
//   1. bar: true 的那幾項：我的護照（被開了那一格的幹部，2026-11-28）、我的故事（幹部）、人與權限（Co-President 與 Senior Adviser）。沒有側欄的頁（設定、實習護照）前面多一個首頁。
//   2. 右上角的大頭照加名字：一個連結，點了直接到設定（Paul：「once you click name, you can just go directly into it」）。
//      大頭照是他在設定上傳的那一張（profiles.avatar），沒上傳就是名字的第一個字。
//      登出在設定那一頁最下面（settings/src/ui.js 的 settingsHTML）。第三版的那一份小選單（設定、登出）拿掉了。
//   搜尋框第二版放在頂欄，Paul 第三版要它換地方：搬到側欄最上面（shared/rail.js 的 searchBoxHTML），任何一頁按 / 跳到那一格。
const fillName = (row, L, name) => tx(row, L).replace("{name}", name);
// 大頭照：呼叫端傳的 avatar 先；沒傳就讀 shared/auth.js 的 whoAmI 存在這個分頁的那一份（sessionStorage 的 bt-me，十分鐘內有效）。
// 這個檔案不 import 任何東西（見檔頭），所以這裡直接讀那一格；名字對不上的話只是退回第一個字，不會壞。
// 只收圖片的 data URL 與 https 網址：它會進 <img src>，別的東西（javascript: 之類）一律不畫。
export const ME_CACHE_KEY = "bt-me";
export function safeAvatar(v) { const s = String(v || ""); return /^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(s) || /^https:\/\/[^\s"'<>]+$/.test(s) ? s : ""; }
function cachedMe() {
  try { return JSON.parse(sessionStorage.getItem(ME_CACHE_KEY) || "null") || null; } catch (e) { return null; }
}
function cachedAvatar() { const it = cachedMe(); return it && it.row ? it.row.avatar : ""; }
// 頂欄的一項畫不畫（barWs）：Co-President 與 Senior Adviser（Internal 裡的人也算 Co-President）一定畫；別人看他被開了沒有。
// 被開了哪幾格讀 shared/auth.js 存在這個分頁的那一份（bt-me 的 ws）；呼叫端傳了 ws 就用傳的。讀不到就不畫，下一頁就有。
export function barShown(f, board, ws) {
  if (!f.barWs || board === "president" || board === "senior_adviser") return true;
  const w = ws || ((cachedMe() || {}).ws) || {};
  return !!w[f.barWs];
}
function cadreBarHTML({ current, name, L, board, rail, avatar, ws }) {
  const n = String(name || "");
  const link = f => `<a href="${withLang(f.href, L)}"${f.key === current ? ' aria-current="page"' : ""}>${esc(tx(f.label, L))}</a>`;
  const mine = featuresFor("cadre", board);
  const set = FEATURES.find(f => f.key === "settings");
  const items = [...(rail ? [] : FEATURES.filter(f => f.key === "home")), ...mine.filter(f => f.bar && barShown(f, board, ws))].map(link).join("");
  const pic = safeAvatar(avatar !== undefined ? avatar : cachedAvatar());
  const av = pic ? `<img class="btnav-av" src="${esc(pic)}" alt="" width="30" height="30">` : `<span class="btnav-av" aria-hidden="true">${esc([...n][0] || "?")}</span>`;
  return `<nav class="btnav btnav-c" aria-label="${esc(tx(NAV.aria, L))}">
    <a class="btnav-logo" href="/" aria-label="${esc(tx(NAV.home, L))}"><img src="/shared/logo.png" alt="Beyond Taiwan" width="386" height="191"></a>
    ${items ? `<div class="btnav-items">${items}</div>` : ""}
    <span class="btnav-sp"></span>
    <a class="btnav-me" href="${withLang(set.href, L)}" aria-label="${esc(fillName(NAV.me, L, n))}"${current === "settings" ? ' aria-current="page"' : ""}>${av}<span class="btnav-nm">${esc(n)}</span></a>
  </nav>`;
}
