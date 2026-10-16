// 後台「人與權限」那一組的畫面：邀請碼。職位（board_role）與 team 的改動是批 3 的事，到時加在這裡。
// 2026-10-15 從 admin/src/ui.js 原樣搬過來（後台拆成四個資料夾）。
// **esc 是自己的一份**，不從別的資料夾 import。
// 申請管理的畫面。**esc 是自己的一份**，不從別的資料夾 import
//（跟 app/ 與 availability/ 同一條規矩：資料夾之間不互相依賴）。
// 一個人在畫面上要顯示的兩個名字。**同一份規則在 admin/site、passport、availability 也各有一份**
//（資料夾之間不互相 import），test/names.test.mjs 逐項比對。
export function namesOf(p) {
  const zh = String(p.name_zh || "").trim();
  const en = String(p.name_en || "").trim();
  return {
    name: zh || en || "（沒有名字）",
    alt: zh && en && zh !== en ? en : "",
  };
}
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

// 這一組裡面的分頁：幹部名單（職位與 team）、邀請碼。整組只有 Co-President 進得來。
export function tabsHTML(tab) {
  return `<div class="chips" style="margin-bottom:16px">
    <button class="chip wide${tab === "roster" ? " on" : ""}" data-act="tab" data-t="roster">幹部名單</button>
    <button class="chip wide${tab === "invites" ? " on" : ""}" data-act="tab" data-t="invites">邀請碼</button>
  </div>`;
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
// 畫面上一律叫「職位」，三個值顯示成中文；board_role 這個字只留在程式與文件裡（設計文件第 3 段第一輪）。
export const BOARD_ROLES = [
  { v: "member",    label: "一般幹部",    hint: "看得到自己 team 的申請，改不動" },
  { v: "director",  label: "Director",    hint: "開表單、審核、寄信，只限自己的 team" },
  { v: "president", label: "Co-President", hint: "整個後台，包括這一頁" },
];
export const boardLabel = v => (BOARD_ROLES.find(r => r.v === v) || BOARD_ROLES[0]).label;
const FIELD_ZH = { board_role: "職位", team: "team" };
const fmtDate = v => String(v || "").slice(0, 16).replace("T", " ");
const valueZh = (field, v) => field === "board_role" ? boardLabel(v) : (v || "（沒有）");

// 主畫面：最近的變動在上面，名單在下面。rows 是 loadRoster()，changes 是 loadRoleChanges()，
// privileged 是 loadPrivilegedTeams()，meId 是自己（自己那一列不給降級）。
export function rosterHTML(rows, changes, privileged, meId, msg, busy) {
  const list = rows || [];
  const dis = busy ? " disabled" : "";
  const byId = Object.fromEntries(list.map(p => [p.id, p]));
  const who = id => { const p = byId[id]; return p ? namesOf(p).name : "（已經不在名單上）"; };
  const logRows = (changes || []).map(c => `<li>
    <div class="fhead"><b>${esc(c.target_name || who(c.target))}</b>
      <span class="tag">${esc(FIELD_ZH[c.field] || c.field)}</span></div>
    <div class="fmeta">${esc(valueZh(c.field, c.old_value))} → <b>${esc(valueZh(c.field, c.new_value))}</b>
      ・${esc(who(c.changed_by))} 改的・${esc(fmtDate(c.created_at))}</div>
  </li>`).join("");
  const privNames = (privileged || []).map(p => p.name);
  const personRows = list.map(p => {
    const { name, alt } = namesOf(p);
    const teams = parseTeams(p.team);
    return `<li>
      <div class="fhead"><b>${esc(name)}${alt ? `<span class="alt">${esc(alt)}</span>` : ""}</b>
        <span class="tag${p.board_role === "president" ? " open" : ""}">${esc(boardLabel(p.board_role))}</span>
        ${p.id === meId ? `<span class="tag">這是你</span>` : ""}</div>
      <div class="fmeta">${teams.length ? teams.map(t => esc(t) + (privNames.includes(t) ? "（有後台權限）" : "")).join("、") : "沒有填 team"}</div>
      <div class="row"><button class="btn ghost sm" data-act="person-edit" data-id="${esc(p.id)}"${dis}>改職位或 team</button></div>
    </li>`;
  }).join("");
  return `<div class="card">
    ${tabsHTML("roster")}
    <h2>幹部名單</h2>
    <div class="sub">${list.length} 位幹部。職位決定他在後台管到哪，team 決定管哪一個 team 的東西。</div>
    ${msg ? `<div class="wnote big">${esc(msg)}</div>` : ""}
    <div class="wnote">每一筆改動都會記在下面，兩位 Co-President 都看得到。把人升成 Co-President 等於把整個後台給他，包括把你降級。
      Director 與 Co-President 的 team 只能在這裡改；一般幹部自己在設定頁勾，但勾進${esc(privNames.join("、") || "會長出權限的 team")}要在這裡加。</div>
    <h3 class="sec-h">最近的變動</h3>
    ${logRows ? `<ul class="flist">${logRows}</ul>` : `<div class="empty sm">還沒有任何變動。這張紀錄從跑完 2026-10-21-people-admin.sql 那一天開始記。</div>`}
    <h3 class="sec-h" style="margin-top:22px">名單</h3>
    ${personRows ? `<ul class="flist">${personRows}</ul>` : `<div class="empty">名單載不到或還沒有幹部。</div>`}
  </div>`;
}

// 改一個人的職位與 team。draft 留住存檔被擋時剛填的東西。
export function personEditHTML(p, privileged, meId, msg, busy, draft) {
  const cur = draft || { board_role: p.board_role || "member", team: p.team || "" };
  const picked = parseTeams(cur.team);
  const extra = picked.filter(t => !TEAMS.includes(t));
  const privNames = (privileged || []).map(x => x.name);
  const dis = busy ? " disabled" : "";
  const { name, alt } = namesOf(p);
  const self = p.id === meId;
  const box = t => `<label class="check tpick">
    <input type="checkbox" name="team" value="${esc(t)}"${picked.includes(t) ? " checked" : ""}${dis}>
    <span>${esc(t.replace(/\s*Team$/i, ""))}${privNames.includes(t) ? "（有後台權限）" : ""}</span></label>`;
  return `<div class="card">
    <div class="row" style="margin:0 0 14px"><button class="btn quiet" data-act="roster-back">← 回幹部名單</button></div>
    <h2>${esc(name)}${alt ? `<span class="alt">${esc(alt)}</span>` : ""}</h2>
    <div class="sub">現在是${esc(boardLabel(p.board_role))}${p.team ? "・" + esc(p.team) : ""}</div>
    ${msg ? `<div class="wnote big">${esc(msg)}</div>` : ""}
    <label><i>職位</i><select id="pk-role"${self ? " disabled" : dis}>
      ${BOARD_ROLES.map(r => `<option value="${r.v}"${cur.board_role === r.v ? " selected" : ""}>${esc(r.label)}（${esc(r.hint)}）</option>`).join("")}
    </select></label>
    ${self ? `<div class="mini" style="margin:-6px 0 14px">自己的職位不能在這裡改（不能自我降級）。要交棒的話，先把對方升成 Co-President，再請對方把你降下來。</div>` : ""}
    <fieldset class="teams" style="margin-bottom:14px">
      <legend>所屬 team（可以選好幾個）</legend>
      <div class="tgrid">${TEAMS.map(box).join("")}${extra.map(t => box(t)).join("")}</div>
    </fieldset>
    <div class="row">
      <button class="btn" data-act="person-save" data-id="${esc(p.id)}"${dis}>${busy ? "存檔中…" : "存起來"}</button>
      <button class="btn ghost" data-act="roster-back"${dis}>取消</button>
    </div>
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
