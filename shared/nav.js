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
export const FEATURES = [
  { key: "passport",     label: "護照",     href: "/passport/",     roles: ["cadre"],
    title: "幹部護照",     desc: "這一年的活動、章、心得與照片" },
  { key: "availability", label: "時間看板", href: "/availability/", roles: ["cadre"],
    title: "每週時間看板", desc: "填自己每週固定有空的時段，約會議時直接挑" },
  // 2026-09-08（批 3）。**所有幹部都看得到這個入口，那是對的。**
  // 每個幹部都屬於一個 team，而 2026-09-07 拍板的可見範圍是
  // 「該 team 的幹部看得到自己 team 收到的申請」——
  // 所以每個人進去都有東西可看。誰「改得動」是 /admin/ 裡面的事，
  // 由資料庫的 is_director_of() 決定，不是靠這裡藏一個連結。
  // **不要在這裡加一層 board_role 的過濾**：那會讓一般幹部連自己 team 的
  // 申請都看不到，而那不是拍板的內容。
  { key: "admin",        label: "申請管理", href: "/admin/",        roles: ["cadre"],
    title: "申請管理",     desc: "開申請表、看自己 team 收到的申請" },
  // 2026-09-08：設定。**這是第一個 roles 含 student 的項目。**
  // 這個檔案的檔頭一直寫著「之後開放給學員的功能只要在 roles 加 student，
  // 列就自動長出來，不用另外設計一條路徑」—— 就是這一刻。
  // 2026-09-11：校友也用同一頁（他的「我的故事」在裡面）。
  { key: "settings",     label: "設定",     href: "/settings/",     roles: ["cadre", "student", "alumni"],
    title: "設定",         desc: "名字、大頭照、要不要出現在公開的團隊頁上" },
];

export function featuresFor(role) {
  return FEATURES.filter(f => f.roles.includes(role));
}

const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// current：現在在哪一個功能（FEATURES 的 key），會被標成當前。
// role：看的人的角色。name：顯示在右邊的名字。
//
// 頂欄是米白底（見 nav.css 檔頭：深藍是點綴色，整條鋪滿等於把它當主色用），
// 所以 logo 直接坐在上面，不需要另外墊一塊——它本來就是為這個紙色設計的。
export function navHTML({ current, role, name }) {
  const items = featuresFor(role).map(f =>
    `<a href="${f.href}"${f.key === current ? ' aria-current="page"' : ""}>${esc(f.label)}</a>`).join("");
  const n = String(name || "");
  return `<nav class="btnav" aria-label="站台導覽">
    <!-- 2026-09-08：logo 改成回**對外的首頁**，不是回 /app/。
         /app/ 現在只剩登入表單（幹部登入後直接進 /settings/），
         點 logo 回到一頁只有表單的地方沒有意義。
         Paul 的原話：「按首頁會回到最外面」。 -->
    <a class="btnav-logo" href="/" aria-label="回 Beyond Taiwan 首頁"><img src="/shared/logo.png" alt="Beyond Taiwan" width="386" height="191"></a>
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
    <input class="btnav-toggle" type="checkbox" id="btnav-toggle" aria-label="展開選單">
    <label class="btnav-burger" for="btnav-toggle">選單</label>
    <div class="btnav-items">${items}</div>
    <span class="btnav-sp"></span>
    ${n ? `<span class="btnav-who" title="${esc(n)}"><span class="full">${esc(n)}</span><span class="short">${esc([...n][0])}</span></span>` : ""}
    <button class="btnav-out" data-act="signout">登出</button>
  </nav>`;
}
