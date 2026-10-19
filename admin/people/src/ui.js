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

// ── 後台的側欄與外殼（2026-10-19，後台第二次重整）──────────────────────
// 後台拆成四個資料夾，每一頁左邊都是這一條側欄。**四個資料夾各有一份這一段**
//（資料夾之間不互相 import，跟 esc() 同一條規矩），test/admin-hub.test.mjs
// 逐字比對四份一模一樣。漂移的表現是「在 A 頁看得到的分頁，到 B 頁不見了」，不會報錯。
//
// GROUPS 是四組，ITEMS 是每一組底下的分頁。who 是「誰看得到」，
// 只決定側欄上那一行是連結還是淡字。**真正的門在每個資料夾的 main.js 開頁第一句，
// 以及資料庫的函式與 RLS。**
export const GROUPS = [
  { key: "forms",     label: "申請",     href: "/admin/",           who: "cadre",        hint: "申請表、審核、簽到、行前信" },
  { key: "site",      label: "對外",     href: "/admin/site/",      who: "cadre",        hint: "資源、團隊頁、校友頁、信件文案" },
  { key: "passports", label: "護照",     href: "/admin/passports/", who: "intern-staff", hint: "兩本護照的格子" },
  { key: "people",    label: "人與權限", href: "/admin/people/",    who: "president",    hint: "邀請碼、職位、team" },
];
// 側欄上每一行。要加一個新的後台分頁，就在這裡加一行（四份都要加），
// 然後在那一組的 ui.js 加一個畫面函式、main.js 接 data-act="tab" data-t="<key>"。
export const ITEMS = [
  { group: "forms",     key: "home",    label: "首頁",     who: "cadre" },
  { group: "forms",     key: "forms",   label: "申請表",   who: "cadre" },
  { group: "site",      key: "res",     label: "資源",     who: "cadre" },
  { group: "site",      key: "team",    label: "團隊頁",   who: "president" },
  { group: "site",      key: "stories", label: "校友頁",   who: "president" },
  { group: "site",      key: "mail",    label: "信件文案", who: "president" },
  { group: "passports", key: "interns", label: "實習護照", who: "intern-staff" },
  { group: "passports", key: "cadre",   label: "幹部護照", who: "president" },
  { group: "passports", key: "cities",  label: "城市",     who: "president" },
  { group: "people",    key: "roster",  label: "幹部名單", who: "president" },
  { group: "people",    key: "invites", label: "邀請碼",   who: "president" },
  { group: "people",    key: "changes", label: "變動紀錄", who: "president" },
];
const WHY = { president: "只有 Co-President 進得去", "intern-staff": "只有 Internship team 的幹部與 Co-President 進得去" };
// me = { role, board, team, name }。team 可能是逗號字串（一個人在好幾個 team）。
function allowed(who, me) {
  if (!me || me.role !== "cadre") return false;
  if (who === "cadre") return true;
  if (who === "president") return me.board === "president";
  if (who === "intern-staff") return me.board === "president" || String(me.team || "").includes("Internship Team");
  return false;
}
export function canEnter(g, me) { return allowed(g.who, me); }
export function canSee(item, me) { return allowed(item.who, me); }
const BOARD_ZH = { member: "一般幹部", director: "Director", president: "Co-President" };

// 側欄。group 是現在在哪一組，tab 是哪一個分頁，counts 是 { <key>: 數字 }（有才顯示，批 2 的首頁會餵）。
// 同一組裡的分頁是 data-act="tab"（不重新載入頁面）；別組的是一般連結，帶 #key 讓那一頁開在對的分頁。
export function railHTML(group, tab, me, counts) {
  const c = counts || {};
  const item = it => {
    const on = it.group === group && it.key === tab;
    const n = c[it.key] ? `<span class="rail-count">${esc(String(c[it.key]))}</span>` : "";
    if (!canSee(it, me)) return `<span class="rail-item off">${esc(it.label)}</span>`;
    const href = it.group === group ? `#${it.key}` : `${GROUPS.find(g => g.key === it.group).href}#${it.key}`;
    return `<a class="rail-item${on ? " on" : ""}" href="${href}"${it.group === group ? ` data-act="tab" data-t="${it.key}"` : ""}${
      on ? ' aria-current="page"' : ""}>${esc(it.label)}${n}</a>`;
  };
  const home = ITEMS.find(i => i.key === "home");
  const groups = GROUPS.map(g => {
    const ok = canEnter(g, me);
    const rows = ITEMS.filter(i => i.group === g.key && i.key !== "home");
    return `<div class="rail-group${ok ? "" : " off"}">${esc(g.label)}${ok ? "" : `<span class="why">${esc(WHY[g.who] || "")}</span>`}</div>${
      ok ? rows.map(item).join("") : rows.map(i => `<span class="rail-item off">${esc(i.label)}</span>`).join("")}`;
  }).join("");
  const teams = String(me && me.team || "").split(/[,、;；]/).map(s => s.trim()).filter(Boolean);
  return `<input class="rail-toggle" type="checkbox" id="rail-toggle" aria-label="展開後台選單">
  <label class="rail-burger" for="rail-toggle">後台選單</label>
  <nav class="rail" aria-label="後台的分組">
    <div class="rail-me"><b>${esc(me && me.name || "")}</b>
      <span>${esc(BOARD_ZH[me && me.board] || "一般幹部")}${teams.length ? "・" + esc(teams.join("、")) : "・還沒填 team"}</span></div>
    ${item(home)}
    ${groups}
    <div class="rail-foot">對外七頁（首頁、關於、計畫、做過什麼、合作、團隊、Alumni）的文字在 HTML 檔裡，不在後台。改法見 README「對外的內容頁」。</div>
  </nav>`;
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
// 訊息。做成了是綠的，沒做成是橘的。判斷靠訊息開頭那幾個字（「存不起來：」「載不到：」這一類是沒做成）。
export function msgKind(msg) {
  const s = String(msg || "");
  if (!s) return "";
  if (/(不了|不到|不起來|不出來|不掉|失敗|沒寄成功)[：:]/.test(s) || /要(填|寫|有)|不能|至少|沒有改到|都要|開不出|還沒有題目|先選|^沒有/.test(s)) return "err";
  return "ok";
}
export function msgHTML(msg) {
  const k = msgKind(msg);
  if (!k) return "";
  return `<div class="msg ${k}" role="status"><span class="msg-k">${k === "err" ? "沒成" : "好了"}</span><span>${esc(msg)}</span></div>`;
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
export function skeletonHTML() { return `<div class="skeleton" aria-label="載入中"><i></i><i></i><i></i></div>`; }

// 舊名字：這一組底下的分頁。側欄用同一份 ITEMS 畫，這一支留給測試與 scripts/mobile-fixtures.mjs。
export function tabsHTML(tab, isPresident) {
  const me = { role: "cadre", board: isPresident === false ? "member" : "president", team: "Internship Team" };
  return ITEMS.filter(i => i.group === "people" && i.key !== "home" && canSee(i, me))
    .map(i => `<a class="rail-item${i.key === tab ? " on" : ""}" href="#${i.key}" data-act="tab" data-t="${i.key}">${esc(i.label)}</a>`).join("");
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
export function rosterHTML(rows, changes, privileged, meId, msg, busy, teamFilter) {
  const list = rows || [];
  const dis = busy ? " disabled" : "";
  const privNames = (privileged || []).map(p => p.name);
  // team 的篩選：清單裡出現過的 team 都列出來，一個人在兩個 team 就兩個篩選都出現，但清單裡永遠只有一列。
  const allTeams = [...new Set(list.flatMap(p => parseTeams(p.team)))].sort((a, b) => a.localeCompare(b));
  const noTeam = list.filter(p => !parseTeams(p.team).length).length;
  const shown = !teamFilter ? list
    : teamFilter === "__none" ? list.filter(p => !parseTeams(p.team).length)
    : list.filter(p => parseTeams(p.team).includes(teamFilter));
  // 沒有名字的排最後，並標出來。
  const sorted = shown.slice().sort((a, b) => Number(namesOf(a).name === "（沒有名字）") - Number(namesOf(b).name === "（沒有名字）"));
  const chip = (v, label, n) => `<button class="chip${(teamFilter || "") === v ? " on" : ""}" data-act="roster-team" data-team="${esc(v)}">${esc(label)}${n != null ? ` ${n}` : ""}</button>`;
  const filters = `<div class="chips" style="margin-bottom:14px">${chip("", "全部", list.length)}${
    allTeams.map(t => chip(t, t.replace(/\s*Team$/i, ""), list.filter(p => parseTeams(p.team).includes(t)).length)).join("")}${
    noTeam ? chip("__none", "還沒填 team", noTeam) : ""}</div>`;
  const tr = p => {
    const { name, alt } = namesOf(p);
    const teams = parseTeams(p.team);
    return `<tr>
      <td class="t-main"><b>${esc(name)}${alt ? `<span class="alt">${esc(alt)}</span>` : ""}</b>${p.id === meId ? ` <span class="tag">這是你</span>` : ""}${name === "（沒有名字）" ? ` <span class="tag warn">還沒填名字</span>` : ""}</td>
      <td><span class="tag${p.board_role === "president" ? " open" : ""}">${esc(boardLabel(p.board_role))}</span></td>
      <td>${teams.length ? teams.map(t => esc(t) + (privNames.includes(t) ? "（有後台權限）" : "")).join("、") : "<span class=\"mini\">沒有填 team</span>"}</td>
      <td class="t-act"><button class="btn quiet sm" data-act="person-edit" data-id="${esc(p.id)}"${dis}>改職位或 team</button></td>
    </tr>`;
  };
  return pageHead("幹部名單", `${list.length} 位幹部。職位決定他在後台管到哪，team 決定管哪一個 team 的東西。`)
    + msgHTML(msg)
    + `<div class="note">每一筆改動都會記在<a href="#changes" data-act="tab" data-t="changes">變動紀錄</a>，兩位 Co-President 都看得到。把人升成 Co-President 等於把整個後台給他，包括把你降級。
      Director 與 Co-President 的 team 只能在這裡改；一般幹部自己在設定頁勾，但勾進${esc(privNames.join("、") || "會長出權限的 team")}要在這裡加。</div>`
    + sectionHTML("", filters + (sorted.length
      ? `<table class="table"><thead><tr><th>名字</th><th>職位</th><th>team</th><th></th></tr></thead><tbody>${sorted.map(tr).join("")}</tbody></table>`
      : list.length ? emptyHTML("這個篩選裡沒有人", "換一個 team 看看。") : emptyHTML("名單載不到或還沒有幹部", "重新整理再試一次。")), { id: "roster" });
}

// 變動紀錄（2026-10-19 起自己一頁，側欄「人與權限 > 變動紀錄」）。
// 這是帳本不是通知：不寄信、不彈提示，另一位 Co-President 登入就看得到。
export function changesHTML(changes, rows, msg) {
  const byId = Object.fromEntries((rows || []).map(p => [p.id, p]));
  const who = id => { const p = byId[id]; return p ? namesOf(p).name : "（已經不在名單上）"; };
  const logRows = (changes || []).map(c => `<li>
    <div class="fhead"><b>${esc(c.target_name || who(c.target))}</b>
      <span class="tag">${esc(FIELD_ZH[c.field] || c.field)}</span></div>
    <div class="fmeta">${esc(valueZh(c.field, c.old_value))} → <b>${esc(valueZh(c.field, c.new_value))}</b>
      ・${esc(who(c.changed_by))} 改的・${esc(fmtDate(c.created_at))}</div>
  </li>`).join("");
  return pageHead("變動紀錄", "誰改了誰的職位或 team、從什麼到什麼、什麼時候。最近 30 筆。只有 Co-President 看得到。")
    + msgHTML(msg)
    + sectionHTML("", logRows ? `<ul class="flist">${logRows}</ul>`
      : emptyHTML("還沒有任何變動", "這張紀錄從跑完 2026-10-21-people-admin.sql 那一天開始記。"), { id: "changes" });
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
  return pageHead(`${esc(name)}${alt ? `<span class="alt">${esc(alt)}</span>` : ""}`, `現在是${esc(boardLabel(p.board_role))}${p.team ? "，" + esc(p.team) : ""}`, [], { act: "roster-back", label: "回幹部名單" })
    + msgHTML(msg)
    + sectionHTML("", `<label><i>職位</i><select id="pk-role"${self ? " disabled" : dis}>
      ${BOARD_ROLES.map(r => `<option value="${r.v}"${cur.board_role === r.v ? " selected" : ""}>${esc(r.label)}（${esc(r.hint)}）</option>`).join("")}
    </select></label>
    ${self ? `<div class="mini" style="margin:-6px 0 14px">自己的職位不能在這裡改（不能自我降級）。要交棒的話，先把對方升成 Co-President，再請對方把你降下來。</div>` : ""}
    <fieldset class="teams" style="margin-bottom:14px">
      <legend>所屬 team（可以選好幾個）</legend>
      <div class="tgrid">${TEAMS.map(box).join("")}${extra.map(t => box(t)).join("")}</div>
    </fieldset>
    <div class="form-foot">
      <button class="btn" data-act="person-save" data-id="${esc(p.id)}"${dis}>${busy ? "存檔中…" : "存起來"}</button>
      <button class="btn ghost" data-act="roster-back"${dis}>取消</button>
    </div>`);
}

// 只有 Co-President 進得來。真正的門在資料庫那幾支函式的第一句（is_president()），
// 這裡少畫一個分頁不是安全機制：Director 硬打網址進來，看到的是這一句，按不到任何東西。
export function noAccessHTML(me) {
  return pageHead("這一組只有 Co-President 用得到", "邀請碼、職位、team 都是當屆 Co-President 的事。要發碼或改權限，找他們。",
    [{ label: "回後台首頁", href: "../" }]);
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
  return `<div class="card" id="invite-form"><h2>發一組新的碼</h2>
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
      ${uses.length ? `<details class="ans"><summary>誰用過（${uses.length} 人，有 email，預設收著）</summary>
      ${uses.map(u => `<div class="fmeta">・<b>${esc(u.name || "（沒有名字）")}</b>
        ${esc(u.email || "（沒有 email）")}・${esc(String(u.used_at || "").slice(0, 10))}・換成${esc(ROLE_ZH[u.grants] || u.grants || "")}${
        u.role && u.role !== u.grants ? `（現在是${esc(ROLE_ZH[u.role] || u.role)}）` : ""}</div>`).join("")}</details>` : ""}
    </li>`;
  };
  return pageHead("邀請碼", "發新的碼、停用碼、看每一組還剩幾次與誰用過。")
    + msgHTML(msg)
    + inviteFormHTML(draft, busy)
    + sectionHTML("已經發出去的碼", `<div class="note">使用紀錄從 2026-10-14 開始。在那之前用掉的次數只會反映在「還剩幾次」，查不到是誰用的。<br>
      停用就是把剩餘次數改成 0，後台沒有恢復的按鈕，要恢復得到 Supabase 改。碼不能刪，刪了就看不出紀錄是哪一組的。<br>
      這一頁有每個人的 email，不要截圖傳出去。</div>
    ${list.length ? `<ul class="flist">${list.map(item).join("")}</ul>`
                  : emptyHTML("還沒有任何邀請碼", "上面發第一組，用複製貼上的方式給對方。")}`, { id: "codes" });
}

export function notCadreHTML() {
  return pageHead("這一頁是給幹部用的", "你的帳號是學員，後台看不到。", [{ label: "回我的帳號", href: "../../app/" }]);
}

export function downHTML() {
  return pageHead("資料庫休眠中", "現在連不上資料庫。請寄信到 beyondtaiwan2020@gmail.com 請人恢復。", [{ act: "retry", label: "再試一次" }]);
}
