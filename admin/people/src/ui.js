// 後台「人與權限」那一組的畫面：邀請碼。職位（board_role）與 team 的改動是批 3 的事，到時加在這裡。
// 2026-10-15 從 admin/src/ui.js 原樣搬過來（後台拆成四個資料夾）。
// **esc 是自己的一份**，不從別的資料夾 import。
// 申請管理的畫面。**esc 是自己的一份**，不從別的資料夾 import
//（跟 app/ 與 availability/ 同一條規矩：資料夾之間不互相依賴）。
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// ── 後台的分組列（2026-10-15）──────────────────────────────────────────
// 後台拆成四個資料夾，每一頁最上面都是這一排。**四個資料夾各有一份**
//（資料夾之間不互相 import，跟 esc() 同一條規矩），test/admin-hub.test.mjs
// 拿同一張輸入表比對四份講一樣的話。漂移的表現是「在 A 頁看得到的組，到 B 頁不見了」。
//
// who 是「誰進得去」，只決定畫面上那一格是連結還是灰字。
// **真正的門在每個資料夾的 main.js 開頁第一句，以及資料庫的函式與 RLS。**
export const GROUPS = [
  { key: "forms",     label: "申請",     href: "/admin/",           who: "cadre",        hint: "申請表、審核、簽到、行前信" },
  { key: "site",      label: "對外",     href: "/admin/site/",      who: "cadre",        hint: "資源、團隊頁、校友頁、信件文案" },
  { key: "passports", label: "護照",     href: "/admin/passports/", who: "intern-staff", hint: "兩本護照的格子" },
  { key: "people",    label: "人與權限", href: "/admin/people/",    who: "president",    hint: "邀請碼、職位、team" },
];
// me = { role, board, team }。team 可能是逗號字串（一個人在好幾個 team）。
export function canEnter(g, me) {
  if (!me || me.role !== "cadre") return false;
  if (g.who === "cadre") return true;
  if (g.who === "president") return me.board === "president";
  if (g.who === "intern-staff") return me.board === "president" || String(me.team || "").includes("Internship Team");
  return false;
}
export function groupBarHTML(current, me) {
  return `<nav class="groups" aria-label="後台的分組">${GROUPS.map(g => canEnter(g, me)
    ? `<a class="chip wide${g.key === current ? " on" : ""}" data-group="${g.key}" href="${g.href}"${
        g.key === current ? ' aria-current="page"' : ""}>${esc(g.label)}</a>`
    : `<span class="chip wide off" title="${esc(g.who === "president" ? "只有 Co-President 進得去" : "只有 Internship team 的幹部與 Co-President 進得去")}">${esc(g.label)}</span>`
  ).join("")}</nav>`;
}

// 這一組裡面的分頁。現在只有邀請碼；批 3 會多「幹部名單」。
export function tabsHTML(tab) {
  return `<div class="chips" style="margin-bottom:16px">
    <button class="chip wide${tab === "invites" ? " on" : ""}" data-act="tab" data-t="invites">邀請碼</button>
  </div>`;
}

// 只有 Co-President 進得來。真正的門在資料庫那幾支函式的第一句（is_president()），
// 這裡少畫一個分頁不是安全機制：Director 硬打網址進來，看到的是這一句，按不到任何東西。
export function noAccessHTML(me) {
  return `<div class="card">
    ${groupBarHTML("people", me)}
    <h2>這一組只有 Co-President 用得到</h2>
    <div class="sub">邀請碼、職位、team 都是當屆 Co-President 的事。要發碼或改權限，找他們。</div>
    <div class="row"><a class="btn ghost" href="../">回後台</a></div>
  </div>`;
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
const ROLE_ZH = { cadre: "幹部", alumni: "校友", student: "學員", intern: "實習生" };
const GRANT_TAG = { cadre: "幹部碼", alumni: "校友碼", intern: "實習生碼" };

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
  return `<div class="wnote" style="margin-bottom:14px"><b>發一組新的碼</b>
    <div class="two">
      <label><i>碼（英文字母、數字、連字號）</i><input id="ic-code" value="${esc(d.code || "")}"
        autocomplete="off" spellcheck="false"${dis}></label>
      <label><i>給什麼身分</i><select id="ic-grants"${dis}>
        <option value="cadre"${d.grants !== "alumni" && d.grants !== "intern" ? " selected" : ""}>幹部碼（會拿到幹部護照）</option>
        <option value="alumni"${d.grants === "alumni" ? " selected" : ""}>校友碼（沒有護照）</option>
        <option value="intern"${d.grants === "intern" ? " selected" : ""}>實習生碼（會拿到實習護照）</option>
      </select></label>
      <label><i>可以用幾次（一個人一組就填 1）</i><input id="ic-uses" type="number" min="1" max="100"
        value="${esc(String(d.uses || 1))}"${dis}></label>
      <label><i>備註：發給誰（只有這一頁看得到）</i><input id="ic-note" value="${esc(d.note || "")}"
        placeholder="給課程組小明"${dis}></label>
    </div>
    <div class="row">
      <button class="btn" data-act="invite-new"${dis}>建立這組碼</button>
      <button class="btn ghost sm" data-act="invite-suggest"${dis}>換一組</button>
    </div></div>`;
}

export function inviteCodesHTML(rows, msg, busy, draft) {
  const list = rows || [];
  const item = c => {
    const uses = Array.isArray(c.uses) ? c.uses : [];
    const left = Number(c.uses_left) || 0;
    return `<li>
      <div class="fhead"><b>${esc(c.code)}</b>
        <span class="tag">${esc(GRANT_TAG[c.grants] || c.grants || "")}</span>
        ${left > 0 ? `<span class="tag open">還剩 ${left} 次</span>`
                   : `<span class="tag draft">用完了</span>`}</div>
      ${c.note ? `<div class="fmeta">備註：${esc(c.note)}</div>` : ""}
      <div class="fmeta">建立於：${esc(String(c.created_at || "").slice(0, 10) || "不知道")}・有紀錄的使用 ${uses.length} 次</div>
      ${left > 0 ? `<div class="row"><button class="btn ghost sm" data-act="invite-disable"
        data-code="${esc(c.code)}"${busy ? " disabled" : ""}>停用</button></div>` : ""}
      ${uses.length ? `<div class="fmeta" style="margin-top:8px"><b>誰用過</b></div>
      ${uses.map(u => `<div class="fmeta">・<b>${esc(u.name || "（沒有名字）")}</b>
        ${esc(u.email || "（沒有 email）")}・${esc(String(u.used_at || "").slice(0, 10))}・換成${esc(ROLE_ZH[u.grants] || u.grants || "")}${
        u.role && u.role !== u.grants ? `（現在是${esc(ROLE_ZH[u.role] || u.role)}）` : ""}</div>`).join("")}` : ""}
    </li>`;
  };
  return `<div class="card">
    ${tabsHTML("invites", true)}
    <h2>邀請碼</h2>
    <div class="sub">發新的碼、停用碼、看每一組還剩幾次與誰用過。</div>
    ${msg ? `<div class="wnote big">${esc(msg)}</div>` : ""}
    ${inviteFormHTML(draft, busy)}
    <div class="wnote big">使用紀錄從 2026-10-14 開始。在那之前用掉的次數只會反映在「還剩幾次」，查不到是誰用的。<br>
      停用就是把剩餘次數改成 0，後台沒有恢復的按鈕，要恢復得到 Supabase 改。碼不能刪，刪了就看不出紀錄是哪一組的。<br>
      這一頁有每個人的 email，不要截圖傳出去。</div>
    ${list.length ? `<ul class="flist">${list.map(item).join("")}</ul>`
                  : `<div class="empty">還沒有任何邀請碼。</div>`}
  </div>`;
}

export function notCadreHTML() {
  return `<div class="card">
    <h2>這一頁是給幹部用的</h2>
    <div class="sub">你的帳號是學員，後台看不到。</div>
    <div class="row"><a class="btn ghost" href="../../app/">回我的帳號</a></div>
  </div>`;
}

export function downHTML() {
  return `<div class="card">
    <h2>資料庫休眠中</h2>
    <div class="wnote big" style="margin-top:16px">現在連不上資料庫。請寄信到 beyondtaiwan2020@gmail.com 請人恢復。</div>
    <div class="row"><button class="btn ghost" data-act="retry">再試一次</button></div>
  </div>`;
}
