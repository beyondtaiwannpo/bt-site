// 後台「人與權限」那一組的畫面：邀請碼。職位（board_role）與 team 的改動是批 3 的事，到時加在這裡。
// 2026-10-15 從 admin/src/ui.js 原樣搬過來（後台拆成四個資料夾）。
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
  { key: "site",      label: { zh: "對外",     en: "Public site" },  href: "/admin/site/",      who: "cadre",        hint: { zh: "資源、團隊頁、校友頁、信件文案", en: "Resources, team page, alumni page, email copy" } },
  { key: "passports", label: { zh: "護照",     en: "Passports" },    href: "/admin/passports/", who: "ws:passport|intern-passport", hint: { zh: "兩本護照的格子", en: "Boxes in both passports" } },
  { key: "people",    label: { zh: "人與權限", en: "People" },       href: "/admin/people/",    who: "senior",       hint: { zh: "名單、職級、工作區、屆別、邀請碼", en: "Roster, ranks, workspaces, terms, invite codes" } },
];
// 側欄上每一行。要加一個新的後台分頁，就在這裡加一行（四份都要加），
// 然後在那一組的 ui.js 加一個畫面函式、main.js 接 data-act="tab" data-t="<key>"。
export const ITEMS = [
  // 2026-10-23 第三次重整批 4：叫「總覽」不叫「首頁」，頂欄那一顆「後台」跟它才不會是同一個地方兩個名字。
  { group: "forms",     key: "home",    label: { zh: "總覽",     en: "Overview" },        who: "cadre" },
  { group: "forms",     key: "forms",   label: { zh: "申請表",   en: "Forms" },           who: "cadre" },
  { group: "site",      key: "res",     label: { zh: "資源",     en: "Resources" },       who: "cadre" },
  { group: "site",      key: "team",    label: { zh: "團隊頁",   en: "Team page" },       who: "senior" },
  { group: "site",      key: "stories", label: { zh: "校友頁",   en: "Alumni page" },     who: "senior" },
  { group: "site",      key: "mail",    label: { zh: "信件文案", en: "Email copy" },      who: "senior" },
  { group: "passports", key: "interns", label: { zh: "實習護照", en: "Intern passport" }, who: "ws:intern-passport" },
  { group: "passports", key: "board",   label: { zh: "棋盤",     en: "Board" },           who: "ws:intern-passport" },
  { group: "passports", key: "cadre",   label: { zh: "幹部護照", en: "Cadre passport" },  who: "ws:passport" },
  { group: "passports", key: "cities",  label: { zh: "城市",     en: "Cities" },          who: "ws:passport" },
  { group: "people",    key: "roster",     label: { zh: "幹部名單", en: "Roster" },          who: "senior" },
  { group: "people",    key: "workspaces", label: { zh: "工作區",   en: "Workspaces" },      who: "senior" },
  { group: "people",    key: "terms",      label: { zh: "屆別",     en: "Terms" },           who: "senior" },
  // 2026-10-29 邀請信：打 email 與職位寄一封信。Co-President 與 Senior Adviser 都邀得了（撤銷只有 Co-President，門在資料庫）。
  { group: "people",    key: "invites",    label: { zh: "邀請",     en: "Invites" },         who: "senior" },
  { group: "people",    key: "changes",    label: { zh: "變動紀錄", en: "Change log" },      who: "senior" },
];
const WHY = { president: "why.president", senior: "why.senior", "ws:passport|intern-passport": "why.passports" };
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
      on ? ' aria-current="page"' : ""}>${esc(T(it.label))}${n}</a>`;
  };
  const home = ITEMS.find(i => i.key === "home");
  const groups = GROUPS.map(g => {
    const ok = canEnter(g, me);
    const rows = ITEMS.filter(i => i.group === g.key && i.key !== "home");
    // 2026-10-23 批 4：進不去的組只留組名變淡，不再掛一段為什麼。為什麼在總覽的「你的存取」那一塊講一次就好；
    // 三段灰色長文在側欄上看起來像三個警告。WHY 留著給 title（滑過去還看得到）。
    return `<div class="rail-group${ok ? "" : " off"}"${ok ? "" : ` title="${esc(T(WHY[g.who]) || "")}"`}>${esc(T(g.label))}</div>${
      ok ? rows.map(item).join("") : rows.map(i => `<span class="rail-item off">${esc(T(i.label))}</span>`).join("")}`;
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
    <div class="rail-foot">${T("rail.foot")}</div>
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
export function toast(msg, undo) {
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
  el.innerHTML = `<span class="toast-k">${kind === "err" ? T("msg.err") : T("msg.ok")}</span><span class="toast-t">${esc(msg)}</span>${
    u ? `<button type="button" class="toast-undo">${esc(u.label)}</button>` : ""}<button type="button" class="toast-x" aria-label="${esc(T("toast.close"))}">×</button>`;
  const gone = () => { el.classList.add("out"); setTimeout(() => el.remove(), 200); };
  el.querySelector(".toast-x").addEventListener("click", gone);
  if (u) el.querySelector(".toast-undo").addEventListener("click", () => { gone(); u.fn(); });
  box.appendChild(el);
  if (kind === "ok") setTimeout(gone, u ? 9000 : 6000);
  return el;
}
// inline confirm：取代瀏覽器的 confirm()。按了會丟東西的按鈕，原地長出一行「真的要…？確定／取消」。
// needAsk(S, b, text)：第一次按回 true，並把那一行直接掛上去（**不重畫**，表單裡打到一半的字還在）；
// 按了「確定」再進來時 b.dataset.confirmed 是 "1"，回 false，動作照做。
export function needAsk(S, b, text) {
  if (b.dataset.confirmed === "1") { S.ask = null; return false; }
  S.ask = { act: b.dataset.act, id: b.dataset.id || "", text: String(text || "") };
  if (typeof document !== "undefined") mountAsk(document, S.ask);
  return true;
}
export function mountAsk(root, ask) {
  if (!ask || !root) return;
  for (const old of root.querySelectorAll(".ask")) old.remove();
  const sel = `[data-act="${ask.act}"]` + (ask.id ? `[data-id="${ask.id}"]` : "");
  const b = [...root.querySelectorAll(sel)].find(x => x.dataset.confirmed !== "1" && !x.closest(".ask"));
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
}
// ── 成員分頁（2026-10-23，第三次重整批 3）────────────────────────────
// 對一個工作區是「管」的人（Director）在那個東西自己的頁面上（Forms、Resources、兩本護照後台）看到誰在裡面、加人、改等級、移出，
// 不用進 /admin/people/。讀 workspace_members()（where 裡有 can_manage）、寫 assign() / unassign()（第一句 can_manage），
// 沒有新的資料庫函式。找人的清單從 profiles 讀（幹部本來就讀得到所有幹部的名字），不讀 email。四份一模一樣（測試逐字比對）。
// mp = { ws, name, rows: workspace_members 回的, cadres: [{ id, name_zh, name_en, board_role }], meId, q, level }
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
// 這一頁該列哪幾個「誰在做…」的入口：senior 看所有這一類的工作區，其他人只有自己是「管」的那幾個。
// workspaces 是 workspaces 表（id、kind、title_zh、title_en、active）；prefix 是 "apps:" 或 "res:"，或整個代號（"intern-passport"）。
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
  const dis = busy ? " disabled" : "";
  const LV = ["view", "edit", "manage"];
  const lv = l => T("level." + l);
  const rows = mp.rows || [];
  const inWs = new Set(rows.map(r => r.user_id));
  // Co-President 與 Senior Adviser 本來就到得了（is_senior），列在最上面標「依職級」，沒有下拉也沒有移出。只是畫面。
  const seniors = (mp.cadres || []).filter(p => ["president", "senior_adviser"].includes(p.board_role) && !inWs.has(p.id));
  const seniorRow = p => `<tr class="byrank"><td class="t-main"><b>${esc(mpName(p))}</b> <span class="tag">${esc(boardName(p.board_role))}</span> <span class="tag open">${T("grid.byRank")}</span>${p.id === mp.meId ? ` <span class="tag">${T("mp.you")}</span>` : ""}</td>
    <td><span class="mini">${esc(lv("manage"))}</span></td><td></td></tr>`;
  const row = r => `<tr><td class="t-main"><b>${esc(mpName(r))}</b> <span class="tag">${esc(boardName(r.board_role))}</span>${r.user_id === mp.meId ? ` <span class="tag">${T("mp.you")}</span>` : ""}</td>
    <td><select data-act="members-level" data-id="${esc(r.user_id)}" aria-label="${esc(T("mp.level"))}"${dis}>${LV.map(l => `<option value="${l}"${r.level === l ? " selected" : ""}>${esc(lv(l))}</option>`).join("")}</select></td>
    <td class="t-act"><button class="btn quiet sm" data-act="members-unassign" data-id="${esc(r.user_id)}"${dis}>${T("mp.remove")}</button></td></tr>`;
  return pageHead(T("mp.title", { name: esc(mp.name || mp.ws) }), T("mp.lede"), [], { act: "members-back", label: T("mp.back") })
    + msgHTML(msg)
    + `<div class="note">${T("mp.levels")}</div>`
    + sectionHTML(T("mp.list"), rows.length || seniors.length
        ? `<table class="table"><thead><tr><th>${T("mp.name")}</th><th>${T("mp.level")}</th><th></th></tr></thead><tbody>${seniors.map(seniorRow).join("")}${rows.map(row).join("")}</tbody></table>`
        : emptyHTML(T("mp.nobody"), T("mp.nobodyHint")))
    + sectionHTML(T("mp.add"), `<div class="two">
        <label><i>${T("mp.who")}</i><input id="mp-q" list="mp-people" value="${esc(mp.q || "")}" placeholder="${esc(T("mp.whoPh"))}" autocomplete="off"${dis}>
          <datalist id="mp-people">${(mp.cadres || []).filter(p => !inWs.has(p.id)).map(p => `<option value="${esc(mpName(p))}">`).join("")}</datalist></label>
        <label><i>${T("mp.level")}</i><select id="mp-level"${dis}>${LV.map(l => `<option value="${l}"${(mp.level || "view") === l ? " selected" : ""}>${esc(lv(l))}</option>`).join("")}</select></label>
      </div>
      <div class="row"><button class="btn" data-act="members-assign" data-ws="${esc(mp.ws)}"${dis}>${busy ? T("common.saving") : T("mp.addGo")}</button></div>
      <div class="mini">${T("mp.addNote")}</div>`);
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

// 舊名字：這一組底下的分頁。側欄用同一份 ITEMS 畫，這一支留給測試與 scripts/mobile-fixtures.mjs。
export function tabsHTML(tab, isPresident) {
  const me = { role: "cadre", board: isPresident === false ? "member" : "president", ws: { "intern-passport": "edit" } };
  return ITEMS.filter(i => i.group === "people" && i.key !== "home" && canSee(i, me))
    .map(i => `<a class="rail-item${i.key === tab ? " on" : ""}" href="#${i.key}" data-act="tab" data-t="${i.key}">${esc(T(i.label))}</a>`).join("");
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
// ═══════════════════════════════════════════════════════════════════════
// 職級與指派（2026-10-24，權限重新設計批 2）。設計：docs/2026-10-23-權限重新設計.md。
// 畫面上一律叫「職級」，四個值顯示成 Associate / Director / Senior Adviser / Co-President；
// board_role 與 member 這兩個字只留在程式與文件裡。label 與 hint 是字典的鍵，畫的時候才 T()。
// 每一顆按鈕背後都是資料庫的一支函式，門在那裡；這裡少畫一顆不是安全機制。
// ═══════════════════════════════════════════════════════════════════════
// 2026-10-28 五級，順序就是下拉與名單的順序：Co-President、Senior Adviser、Director、Adviser、Associate。
export const BOARD_ROLES = [
  { v: "president",      label: "board.president", hint: "role.president.hint" },
  { v: "senior_adviser", label: "board.senior",    hint: "role.senior.hint" },
  { v: "director",       label: "board.director",  hint: "role.director.hint" },
  { v: "adviser",        label: "board.adviser",   hint: "role.adviser.hint" },
  { v: "member",         label: "board.member",    hint: "role.member.hint" },
];
export const boardLabel = v => T((BOARD_ROLES.find(r => r.v === v) || BOARD_ROLES.find(r => r.v === "member")).label);
export const rankOrder = v => { const i = BOARD_ROLES.findIndex(r => r.v === v); return i < 0 ? BOARD_ROLES.length : i; };
// 推標題用的固定標籤：title_en 永遠是英文、title_zh 永遠是中文那一句，**不看現在畫面是哪一種語言**
//（不然中文畫面存出來的 title_en 會是「顧問, X」）。
const RANK_EN = { president: "Co-President", senior_adviser: "Senior Adviser", director: "Director", adviser: "Adviser", member: "Associate" };
const rankZh = v => { const r = BOARD_ROLES.find(x => x.v === v); return r ? T({ zh: STRINGS[r.label].zh, en: STRINGS[r.label].zh }) : ""; };
// 職位下拉（Paul 2026-10-24：「不要用打的，給一個下拉列我們的職級」）。
// 存的 title_en / title_zh 從職級標籤加 team 推出來：「Director, Curriculum Team」，沒有 team 就只有「Director」。
// 中文那一欄也用同一個英文標籤（職級在中文畫面本來就印英文），加 team。選「自訂」才露出兩個文字框，存他打的。
export const RANK_CHOICES = BOARD_ROLES.map(r => r.v);
// 不綁 team 的兩級（Paul 2026-10-24）：Co-President 與 Senior Adviser 是整個組織的，職位上沒有 team，推出來的字就只有職級。
// Adviser（10-28 那一級）跟著一個 team，不在這裡。
export const ORG_WIDE = ["president", "senior_adviser"];
export const isOrgWide = rank => ORG_WIDE.includes(rank);
export function deriveTitle(rank, team) {
  const t = isOrgWide(rank) ? "" : String(team || "").trim();
  const en = RANK_EN[rank] || "", zh = rankZh(rank) || en;
  return { title_en: t ? `${en}, ${t}` : en, title_zh: t ? `${zh}, ${t}` : zh };
}
// 既有的紀錄：title_en 對得上某一級推出來的字就選那一級，對不上就是「自訂」，文字框照存的印，不會丟。
export function rankOfTitle(title_en, team) {
  const s = String(title_en || "").trim().toLowerCase();
  if (!s) return "";
  for (const r of RANK_CHOICES) if (deriveTitle(r, team).title_en.toLowerCase() === s) return r;
  return "custom";
}
// 貼一整屆的第三欄可以是職級名（Director、Co-President…）或自訂文字。
export function rankByName(s) {
  const q = String(s || "").trim().toLowerCase();
  return RANK_CHOICES.find(r => RANK_EN[r].toLowerCase() === q || rankZh(r).toLowerCase() === q) || "";
}
// 職位那一格的下拉。sel 是 RANK_CHOICES 之一、"custom" 或空字串。
export function rankSelect(id, sel, dis) {
  return `<select id="${id}" data-act="pos-rank"${dis}><option value=""${!sel ? " selected" : ""}>${T("pe.rankPickPh")}</option>${
    RANK_CHOICES.map(r => `<option value="${r}"${sel === r ? " selected" : ""}>${esc(boardLabel(r))}</option>`).join("")}<option value="custom"${sel === "custom" ? " selected" : ""}>${T("pe.custom")}</option></select>`;
}
export const LEVELS = ["view", "edit", "manage"];
export const levelLabel = v => T("level." + (LEVELS.includes(v) ? v : "view"));

// ── 2026-10-23 第三次重整批 2：從人管人 ──────────────────────────────
// 工作區給人看的名字：名單與改一個人那一頁不再印代號（apps:Curriculum Team）。
// 有工作區清單就用它的標題，沒有（還沒載到）就從代號推。代號只在網址裡。
export function wsName(id, workspaces) {
  const w = (workspaces || []).find(x => x.id === id);
  if (w) return wsLabel(w);
  const s = String(id || "");
  if (s === "passport") return T("ws.kind.passport");
  if (s === "intern-passport") return T("ws.kind.intern");
  if (s.startsWith("apps:")) return T("ws.name.apps", { team: s.slice(5) });
  if (s.startsWith("res:")) return T("ws.name.res", { team: s.slice(4) });
  if (s.startsWith("custom:")) return s.slice(7);
  return s;
}
// 存取格：一個人在每一個工作區的等級排成一張表，一格一個下拉，改了就存（main.js 接 change 的 data-act="grid-level"）。
// 列是六個 team（申請、資源兩欄）、兩本護照、自訂的工作區；資料就是 roster() 回的 workspaces，跟 Workspaces 那一頁同一份。
// 還沒載到工作區清單的時候每一格都畫（exists 回 true），載到了就只畫真的存在的。
export function accessGridHTML(p, workspaces, busy) {
  const dis = busy ? " disabled" : "";
  const have = Object.fromEntries((Array.isArray(p.workspaces) ? p.workspaces : []).map(w => [w.id, w.level]));
  const active = (workspaces || []).filter(w => w.active !== false);
  const exists = id => !active.length || active.some(w => w.id === id);
  const byRank = isOrgWide(p.board_role);
  const cell = id => !exists(id) ? `<span class="mini">—</span>` : byRank
    ? `<select class="byrank" disabled aria-label="${esc(wsName(id, workspaces))}"><option selected>${T("grid.byRank")}</option></select>`
    : `<select data-act="grid-level" data-id="${esc(p.profile_id)}" data-ws="${esc(id)}" aria-label="${esc(wsName(id, workspaces))}"${dis}>${
        ["", ...LEVELS].map(l => `<option value="${l}"${(have[id] || "") === l ? " selected" : ""}>${l ? esc(levelLabel(l)) : esc(T("grid.none"))}</option>`).join("")}</select>`;
  const teamRows = TEAMS.map(t => `<tr><th scope="row">${esc(t.replace(/\s*Team$/i, ""))}</th><td>${cell("apps:" + t)}</td><td>${cell("res:" + t)}</td></tr>`).join("");
  const single = (id, label) => `<tr><th scope="row">${esc(label)}</th><td colspan="2">${cell(id)}</td></tr>`;
  const customs = active.filter(w => w.kind === "custom").map(w => single(w.id, wsLabel(w))).join("");
  return `<table class="table grid"><thead><tr><th></th><th>${T("grid.apps")}</th><th>${T("grid.res")}</th></tr></thead><tbody>${teamRows}${
    single("passport", wsName("passport", workspaces))}${single("intern-passport", wsName("intern-passport", workspaces))}${customs}</tbody></table>`;
}
// 找人用的那一串字：「王小明 (Ming Wang)」。datalist 的選項值就是它，main.js 用 findByPickName 對回去。
export function pickName(p) { const { name, alt } = namesOf({ name_zh: p.name_zh, name_en: p.name_en }); return alt ? `${name} (${alt})` : name; }
export function findByPickName(people, q) {
  const s = String(q || "").trim().toLowerCase();
  if (!s) return null;
  const list = (people || []).filter(p => p.profile_id);
  return list.find(p => pickName(p).toLowerCase() === s)
    || list.find(p => String(p.name_zh || "").toLowerCase() === s || String(p.name_en || "").toLowerCase() === s)
    || null;
}
// 自訂工作區的代號從英文名稱算：小寫、英數、連字號。「Winter camp 2027」→「winter-camp-2027」。
export function slugify(s) {
  return String(s || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
}
// 結束這一屆之後、名單最上面那一段「接下來要做的事」：留下的人一列一顆「改」，做完按收起來。
export function afterEndHTML(after, people, busy) {
  if (!after) return "";
  const dis = busy ? " disabled" : "";
  const kept = (people || []).filter(p => p.profile_id && (after.kept || []).includes(p.profile_id));
  return sectionHTML(T("tm.afterTitle", { term: esc(after.term) }), `<div class="note">${T("tm.afterNote")}</div>
    <ul class="flist">${kept.map(p => `<li><div class="fhead"><b>${esc(pickName(p))}</b><span class="tag">${esc(boardLabel(p.board_role))}</span></div>
      <div class="row"><button class="btn ghost sm" data-act="person-edit" data-id="${esc(p.person_id)}"${dis}>${T("ro.edit")}</button></div></li>`).join("")}</ul>
    <div class="row"><button class="btn quiet sm" data-act="after-dismiss"${dis}>${T("tm.afterDone")}</button></div>`, { id: "after-end" });
}
const FIELD_KEY = { board_role: "field.board_role", team: "field.team", name: "field.name", role: "field.role",
  position: "field.position", assignment: "field.assignment", removed: "field.removed", claimed: "field.claimed",
  merged: "field.merged", term: "field.term" };
const fmtDate = v => String(v || "").slice(0, 16).replace("T", " ");
const ROLE_NAME = { cadre: "role.cadre", alumni: "role.alumni", student: "role.student", intern: "role.intern" };
// 紀錄裡的值翻成人看的字。指派存成「等級@工作區」，職位存成「屆別:名稱/team」。
function valueZh(field, v) {
  if (v == null || v === "") return T("value.none");
  if (field === "board_role") return boardLabel(v);
  if (field === "role") return ROLE_NAME[v] ? T(ROLE_NAME[v]) : v;
  if (field === "assignment") {
    const i = String(v).indexOf("@");
    if (i < 0) return v;
    const lv = String(v).slice(0, i); const ws = String(v).slice(i + 1);
    return (lv ? (LEVELS.includes(lv) ? levelLabel(lv) : lv) : T("value.none")) + " @ " + ws;
  }
  return v;
}
// 工作區在畫面上的名字：看語言挑中文或英文標題，沒有就用代號。
export function wsLabel(w) {
  if (!w) return "";
  const t = lang() === "zh" ? (w.title_zh || w.title_en) : (w.title_en || w.title_zh);
  return t || w.id;
}
// 一個人在某一屆的職位（roster() 回的 positions 是 [{ term, title_zh, title_en, team }]）。
export function positionFor(p, termId) {
  return (p && Array.isArray(p.positions) ? p.positions : []).find(x => x.term === termId) || null;
}
// 同一屆的全部職位（2026-10-26 起一個人一屆可以兼好幾個，例如 Sponsorship 的 Adviser 兼 Curriculum 的 Associate）。
export function positionsFor(p, termId) {
  return (p && Array.isArray(p.positions) ? p.positions : []).filter(x => x.term === termId);
}
// 同一屆所有職位接成一句：「Adviser, Sponsorship Team · Associate, Curriculum Team」。
export const positionsLine = (p, termId) => positionsFor(p, termId).map(positionTitle).filter(Boolean).join(" · ");
export const positionTitle = pos => pos ? ((lang() === "zh" ? (pos.title_zh || pos.title_en) : (pos.title_en || pos.title_zh)) || "") : "";
export const currentTerm = terms => (terms || []).find(t => t.status === "current") || null;
// 2026-27 → 2027-28。對不出來就回空字串，讓人自己填。
export function nextTermId(cur) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(cur || ""));
  if (!m) return "";
  const y = Number(m[1]) + 1;
  return `${y}-${String((y + 1) % 100).padStart(2, "0")}`;
}
// 貼一整屆：一行一個人，逗號或 tab 隔開：中文名, 英文名, 職位, team。
// 回 { rows, bad }，bad 是讀不出來的行號（一行連一個名字都沒有）。
export function pasteParse(text) {
  const rows = []; const bad = [];
  String(text || "").split(/\r?\n/).forEach((line, i) => {
    const s = line.trim();
    if (!s) return;
    const c = s.split(/\t|,|，/).map(x => x.trim());
    const rank = rankByName(c[2]);
    const titles = rank ? deriveTitle(rank, c[3] || "") : { title_en: c[2] || "", title_zh: c[2] || "" };
    const r = { name_zh: c[0] || "", name_en: c[1] || "", title_en: titles.title_en, title_zh: titles.title_zh, team: isOrgWide(rank) ? "" : (c[3] || "") };
    if (!r.name_zh && !r.name_en) { bad.push(i + 1); return; }
    rows.push(r);
  });
  return { rows, bad };
}
const personName = p => namesOf({ name_zh: p.name_zh, name_en: p.name_en });
const hasAccount = p => !!p.profile_id;

// 幹部名單。people 是 roster()；filter = { term: 屆別代號或 "all", team: "" 全部 / "__none" / team 名 }。
// 預設只列現在這一屆有職位的人，切到「全部」才看得到歷屆與沒有帳號的人。
export function rosterHTML(people, terms, meId, isPres, msg, busy, filter, workspaces, after) {
  const list = people || [];
  const cur = currentTerm(terms);
  const f = Object.assign({ term: cur ? cur.id : "all", team: "", q: "" }, filter || {});
  // 找名字（2026-10-23 批 2）：中英文都認，大小寫不分。main.js 接 input 事件、重畫後把游標放回去。
  const q = String(f.q || "").trim().toLowerCase();
  const hit = p => !q || String(p.name_zh || "").toLowerCase().includes(q) || String(p.name_en || "").toLowerCase().includes(q);
  const dis = busy ? " disabled" : "";
  const inTerm = p => f.term === "all" || !!positionFor(p, f.term);
  // 一個人算在哪幾個 team 的 chip 底下：Co-President 與 Senior Adviser 是整個組織的，只算他這一屆**帶 team 的職位**（通常沒有），
  // 不看他自己勾的標籤，跟 /team/ 的「領導」那一組同一條規則。其他人照舊：標籤，沒有標籤就看職位的 team。
  const posTeams = p => positionsFor(p, f.term === "all" ? (cur ? cur.id : "") : f.term).map(x => x.team).filter(Boolean);
  const teamsOf = p => isOrgWide(p.board_role) ? [...new Set(posTeams(p))]
    : parseTeams(p.team).length ? parseTeams(p.team) : (positionFor(p, f.term) && positionFor(p, f.term).team ? [positionFor(p, f.term).team] : []);
  const base = list.filter(inTerm);
  const allTeams = [...new Set(base.flatMap(teamsOf))].sort((a, b) => a.localeCompare(b));
  const noTeam = base.filter(p => !teamsOf(p).length).length;
  const shown = (!f.team ? base : f.team === "__none" ? base.filter(p => !teamsOf(p).length) : base.filter(p => teamsOf(p).includes(f.team))).filter(hit);
  const noName = T("common.noName");
  // 有帳號的在前，沒有名字的最後。
  const sorted = shown.slice().sort((a, b) => Number(hasAccount(b)) - Number(hasAccount(a)) || rankOrder(a.board_role) - rankOrder(b.board_role) || Number(personName(a).name === noName) - Number(personName(b).name === noName));
  const chip = (act, v, label, n, on) => `<button class="chip${on ? " on" : ""}" data-act="${act}" data-v="${esc(v)}"${dis}>${esc(label)}${n != null ? ` ${n}` : ""}</button>`;
  const termChips = `<div class="chips" style="margin-bottom:8px">${
    (terms || []).map(t => chip("roster-term", t.id, t.id + (t.status === "current" ? T("ro.curMark") : ""), list.filter(p => positionFor(p, t.id)).length, f.term === t.id)).join("")}${
    chip("roster-term", "all", T("ro.allTerms"), list.length, f.term === "all")}</div>`;
  const teamChips = `<div class="chips" style="margin-bottom:14px">${chip("roster-team", "", T("ro.all"), base.length, !f.team)}${
    allTeams.map(t => chip("roster-team", t, t.replace(/\s*Team$/i, ""), base.filter(p => teamsOf(p).includes(t)).length, f.team === t)).join("")}${
    noTeam ? chip("roster-team", "__none", T("ro.noTeam"), noTeam, f.team === "__none") : ""}</div>`;
  const tr = p => {
    const { name, alt } = personName(p);
    const pos = positionFor(p, f.term === "all" ? (cur ? cur.id : "") : f.term);
    const lastPos = f.term === "all" && !pos && p.positions && p.positions.length ? p.positions[0] : null;
    const ws = Array.isArray(p.workspaces) ? p.workspaces : [];
    const dup = Array.isArray(p.maybe_dup) && p.maybe_dup.length;
    return `<tr${hasAccount(p) ? "" : ' class="off"'}>
      <td class="t-main"><b>${esc(name)}${alt ? `<span class="alt">${esc(alt)}</span>` : ""}</b>${
        p.profile_id === meId ? ` <span class="tag">${T("ro.you")}</span>` : ""}${
        name === noName ? ` <span class="tag warn">${T("ro.noName")}</span>` : ""}${
        !hasAccount(p) ? ` <span class="tag draft">${T("ro.noAccount")}</span>` : p.role !== "cadre" ? ` <span class="tag">${esc(ROLE_NAME[p.role] ? T(ROLE_NAME[p.role]) : p.role)}</span>` : ""}${
        dup ? ` <span class="tag warn">${T("ro.maybeDup")}</span>` : ""}${
        p.pending_code ? `<div class="mini">${T("ro.pendingCode", { code: esc(p.pending_code) })}</div>` : ""}</td>
      <td>${hasAccount(p) && p.role === "cadre" ? `<span class="tag${p.board_role === "president" || p.board_role === "senior_adviser" ? " open" : ""}">${esc(boardLabel(p.board_role))}</span>` : `<span class="mini">—</span>`}</td>
      <td>${pos ? positionsFor(p, pos.term).map(x => {
                 // 一筆職位一行，不用「 · 」接成一句：職級是左邊那一欄的徽章，職位是這裡的字，兩件事分開看。
                 // 職位的字對得上某一級、卻跟他的職級不同（例如職級 Co-President、職位寫 Senior Adviser），標出來讓人看到。
                 const r = rankOfTitle(x.title_en, x.team);
                 const clash = hasAccount(p) && p.role === "cadre" && r && r !== "custom" && r !== (p.board_role || "member");
                 return `<div>${esc(positionTitle(x))}${x.team ? `<span class="mini"> ${esc(x.team)}</span>` : isOrgWide(r) ? `<span class="mini"> ${T("pe.allTeams")}</span>` : ""}${
                   clash ? ` <span class="tag warn" title="${esc(T("ro.rankMismatchHint"))}">${T("ro.rankMismatch")}</span>` : ""}</div>`; }).join("")
               : lastPos ? `<span class="mini">${esc(positionTitle(lastPos))}・${esc(lastPos.term)}</span>` : `<span class="mini">${T("ro.noPosition")}</span>`}${
        hasAccount(p) && p.role === "cadre" && !parseTeams(p.team).length
          ? `<div style="margin-top:6px"><select data-act="row-team" data-id="${esc(p.profile_id)}" aria-label="${esc(T("ro.setTeam"))}"${dis}><option value="">${T("ro.setTeam")}</option>${
              TEAMS.map(t => `<option value="${esc(t)}">${esc(t.replace(/\s*Team$/i, ""))}</option>`).join("")}</select></div>` : ""}</td>
      <td>${hasAccount(p) && p.role === "cadre" && isOrgWide(p.board_role)
          // 這兩級靠職級就有一切：先一顆「全部（職級）」，後面明寫的指派淡掉留著（多餘但不藏，藏了就沒人會去清）。
          ? `<span class="tag open">${T("grid.byRank")}</span>${ws.map(w => ` <span class="tag off" title="${esc(T("ro.wsRedundant"))}">${esc(wsName(w.id, workspaces))}・${esc(levelLabel(w.level))}</span>`).join("")}`
          : ws.length ? ws.map(w => `<span class="tag">${esc(wsName(w.id, workspaces))}・${esc(levelLabel(w.level))}</span>`).join(" ") : `<span class="mini">${hasAccount(p) && p.role === "cadre" ? T("ro.noWs") : ""}</span>`}</td>
      <td class="t-act"><button class="btn quiet sm" data-act="person-edit" data-id="${esc(p.person_id)}"${dis}>${T("ro.edit")}</button></td>
    </tr>`;
  };
  return pageHead(T("ro.title"), T("ro.lede", { n: base.length, term: f.term === "all" ? T("ro.allTerms") : f.term }),
      [{ act: "person-new", label: T("ro.addPast"), disabled: busy }])
    + msgHTML(msg)
    + afterEndHTML(after, list, busy)
    + `<div class="note">${isPres ? T("ro.note") : T("ro.noteSenior")}</div>`
    + sectionHTML("", `<label class="ro-search"><i>${T("ro.search")}</i><input id="ro-search" type="search" value="${esc(f.q || "")}" placeholder="${esc(T("ro.searchPh"))}" autocomplete="off"></label>`
      + termChips + teamChips + (sorted.length
      ? `<table class="table"><thead><tr><th>${T("ro.name")}</th><th>${T("ro.rank")}</th><th>${T("ro.position")}</th><th>${T("ro.ws")}</th><th></th></tr></thead><tbody>${sorted.map(tr).join("")}</tbody></table>`
      : list.length ? emptyHTML(T("ro.emptyFilter"), T("ro.emptyFilterHint")) : emptyHTML(T("ro.empty"), T("ro.emptyHint"))), { id: "roster" });
}

// 變動紀錄（帳本不是通知）。people 用來把 uuid 翻成名字。
export function changesHTML(changes, people, msg) {
  const byId = Object.fromEntries((people || []).filter(p => p.profile_id).map(p => [p.profile_id, p]));
  const who = id => { const p = byId[id]; return p ? personName(p).name : (id ? T("ch.gone") : T("ch.system")); };
  const logRows = (changes || []).map(c => `<li>
    <div class="fhead"><b>${esc(c.target_name || who(c.target))}</b>
      <span class="tag">${esc(FIELD_KEY[c.field] ? T(FIELD_KEY[c.field]) : c.field)}</span></div>
    <div class="fmeta">${esc(valueZh(c.field, c.old_value))} → <b>${esc(valueZh(c.field, c.new_value))}</b>
      ${T("ch.by", { who: esc(who(c.changed_by)), d: esc(fmtDate(c.created_at)) })}</div>
  </li>`).join("");
  return pageHead(T("ch.title"), T("ch.lede"))
    + msgHTML(msg)
    + sectionHTML("", logRows ? `<ul class="flist">${logRows}</ul>`
      : emptyHTML(T("ch.empty"), T("ch.emptyHint")), { id: "changes" });
}

// orgWide = true：職級是 Co-President 或 Senior Adviser，整格鎖住、只印「全部 team」，存的時候 team 是空的。
const teamSelect = (id, val, dis, orgWide) => {
  if (orgWide) return `<select id="${id}" disabled data-orgwide="1"><option value="" selected>${T("pe.allTeams")}</option></select>`;
  const extra = val && !TEAMS.includes(val) ? [val] : [];
  return `<select id="${id}"${dis}><option value=""${!val ? " selected" : ""}>${T("value.none")}</option>${
    [...TEAMS, ...extra].map(t => `<option value="${esc(t)}"${val === t ? " selected" : ""}>${esc(t)}</option>`).join("")}</select>`;
};

// 改一個人：職級（只有 Co-President 改得了，自己那一列關著）、名字（只有 Co-President）、
// 這一屆的職位、team 標籤（只是標籤）、他在哪幾個工作區（唯讀，去工作區頁改）、
// 最底下是危險的事：發校友碼、合併、刪除成員或刪除紀錄。draft 留住存檔被擋時剛填的東西。
// remove = { typed }：按了「刪除成員」之後第二步的狀態（要把名字打一次）。
export function personEditHTML(p, terms, meId, isPres, msg, busy, draft, people, remove, email, workspaces) {
  const cur = currentTerm(terms);
  const d = draft || {};
  const termId = d.term || (cur ? cur.id : ((terms || [])[0] || {}).id || "");
  // 這一屆的職位是一張清單（2026-10-26）。draft.rows 留住改到一半的；沒有就從資料來。
  // 每一列的 orig 是它原本的 team（沒有 team 的職位是空字串）；新加的一列 orig 是 null。
  const rows = Array.isArray(d.rows) ? d.rows
    : positionsFor(p, termId).map(x => ({ orig: x.team || "", title_zh: x.title_zh || "", title_en: x.title_en || "", team: x.team || "" }));
  const v = Object.assign({ board_role: p.board_role || "member", name_zh: p.name_zh || "", name_en: p.name_en || "", team: p.team || "" }, d);
  const picked = parseTeams(v.team);
  const extra = picked.filter(t => !TEAMS.includes(t));
  const dis = busy ? " disabled" : "";
  const { name, alt } = personName(p);
  const self = p.profile_id === meId;
  const cadre = hasAccount(p) && p.role === "cadre";
  const ws = Array.isArray(p.workspaces) ? p.workspaces : [];
  const dups = (people || []).filter(o => Array.isArray(p.maybe_dup) && p.maybe_dup.includes(o.person_id));
  const box = t => `<label class="check tpick">
    <input type="checkbox" name="team" value="${esc(t)}"${picked.includes(t) ? " checked" : ""}${dis}>
    <span>${esc(t.replace(/\s*Team$/i, ""))}</span></label>`;
  const lede = !hasAccount(p) ? T("pe.ledeNoAccount") : cadre ? T("pe.lede", { role: esc(boardLabel(p.board_role)) }) : T("pe.ledeOther", { role: esc(ROLE_NAME[p.role] ? T(ROLE_NAME[p.role]) : p.role) });
  const rankSec = cadre ? sectionHTML(T("pe.rank"), `<label><i>${T("pe.rank")}</i><select id="pk-role"${self || !isPres ? " disabled" : dis}>
      ${BOARD_ROLES.map(r => `<option value="${r.v}"${v.board_role === r.v ? " selected" : ""}>${esc(T(r.label))}（${esc(T(r.hint))}）</option>`).join("")}
    </select></label>
    ${self ? `<div class="mini" style="margin:-6px 0 14px">${T("pe.selfNote")}</div>` : !isPres ? `<div class="mini" style="margin:-6px 0 14px">${T("pe.presOnly")}</div>` : `<div class="mini" style="margin:-6px 0 14px">${T("pe.rankNote")}</div>`}`) : "";
  // 註冊用的 email（2026-10-26）：唯讀，一顆複製。只在這一頁，名單表格上不印。email 是 person_email() 回的，
  // undefined 表示還在載或載不到，null 表示沒有帳號。
  const emailLine = !hasAccount(p) ? `<div class="mini">${T("pe.email")}${T("punct.colon")}${T("ro.noAccount")}</div>`
    : email === undefined ? `<div class="mini">${T("pe.email")}${T("punct.colon")}${T("pe.emailLoading")}</div>`
    : `<div class="row" style="margin-bottom:14px"><span class="mini">${T("pe.email")}${T("punct.colon")}<b>${esc(email || "")}</b></span>
       ${email ? `<button class="btn quiet sm" data-act="copy-email" data-email="${esc(email)}"${dis}>${T("pe.emailCopy")}</button>` : ""}</div>`;
  const nameSec = sectionHTML(T("pe.name"), `<div class="two">
      <label><i>${T("pe.nameZh")}</i><input id="pk-zh" value="${esc(v.name_zh)}"${isPres ? dis : " disabled"}></label>
      <label><i>${T("pe.nameEn")}</i><input id="pk-en" value="${esc(v.name_en)}"${isPres ? dis : " disabled"}></label>
    </div>${emailLine}${!isPres ? `<div class="mini">${T("pe.presOnly")}</div>` : ""}`);
  const posRow = (r, i) => { const rank = r.rank != null ? r.rank : rankOfTitle(r.title_en, r.team); return `<div class="card posrow" data-posrow="${i}" data-orig="${r.orig == null ? "" : esc(r.orig)}" data-isnew="${r.orig == null ? "1" : "0"}">
      <div class="two">
        <label><i>${T("pe.rankPick")}</i>${rankSelect(`pk-rank-${i}`, rank, dis)}</label>
        <label><i>${T("pe.posTeam")}</i>${teamSelect(`pk-pteam-${i}`, r.team, dis, isOrgWide(rank))}</label>
      </div>
      <div class="two"${rank === "custom" ? "" : " hidden"}>
        <label><i>${T("pe.titleEn")}</i><input id="pk-ten-${i}" value="${esc(r.title_en)}" placeholder="Director, Curriculum Team"${dis}></label>
        <label><i>${T("pe.titleZh")}</i><input id="pk-tzh-${i}" value="${esc(r.title_zh)}" placeholder="${esc(T("pe.titleZhPh"))}"${dis}></label>
      </div>
      <div class="row">${r.orig == null
        ? `<button class="btn ghost sm" data-act="position-row-drop" data-i="${i}"${dis}>${T("pe.posRowDrop")}</button>`
        : `<button class="btn ghost sm" data-act="position-delete" data-id="${esc(p.person_id)}" data-term="${esc(termId)}" data-team="${esc(r.orig)}"${dis}>${T("pe.posDelete")}</button>`}</div>
    </div>`; };
  const otherTerms = [...new Set((p.positions || []).map(x => x.term).filter(t => t !== termId))];
  const posSec = sectionHTML(T("pe.position"), `<label><i>${T("pe.term")}</i><select id="pk-term" data-act="person-term"${dis}>${
      (terms || []).map(t => `<option value="${esc(t.id)}"${termId === t.id ? " selected" : ""}>${esc(t.id)}${t.status === "current" ? T("ro.curMark") : ""}</option>`).join("")}</select></label>
    ${rows.length ? rows.map(posRow).join("") : `<div class="mini" style="margin-bottom:10px">${T("pe.posNone", { term: esc(termId) })}</div>`}
    <div class="row"><button class="btn ghost sm" data-act="position-row-add"${dis}>${T("pe.posAdd")}</button></div>
    <div class="mini">${T("pe.posDerived")} ${T("pe.posNote", { term: esc(termId) })}</div>${
    otherTerms.length ? `<div class="mini" style="margin-top:8px">${T("pe.history")}${esc(otherTerms.map(t => `${t}: ${positionsLine(p, t)}`).join(T("punct.list")))}</div>` : ""}`);
  const teamSec = cadre ? sectionHTML(T("pe.teams"), `<div class="tgrid">${TEAMS.map(box).join("")}${extra.map(t => box(t)).join("")}</div>
    <div class="mini" style="margin-top:8px">${T("pe.teamsNote")}</div>`) : "";
  // 存取（2026-10-23 批 2）：可以直接改的一張格子，不再是唯讀標籤加「去工作區那一頁改」。
  const wsSec = cadre ? sectionHTML(T("pe.ws"),
      (p.board_role === "president" || p.board_role === "senior_adviser" ? `<div class="note">${T("pe.wsSenior")}</div>` : "")
      + accessGridHTML(p, workspaces, busy)
      + `<div class="mini" style="margin-top:8px">${T("pe.wsNote")}${ws.length ? "" : " " + T("pe.noWs")}</div>`,
    { hint: T("pe.wsHint") }) : "";
  const dupSec = dups.length ? sectionHTML(T("pe.dup"), `<div class="note">${T("pe.dupNote")}</div>${
    dups.map(o => `<div class="row"><b>${esc(personName(o).name)}</b>${hasAccount(o) ? ` <span class="tag">${T("pe.dupHasAccount")}</span>` : ` <span class="tag draft">${T("ro.noAccount")}</span>`}
      ${isPres ? `<button class="btn ghost sm" data-act="person-merge" data-keep="${esc(p.person_id)}" data-drop="${esc(o.person_id)}"${dis}>${T("pe.mergeInto")}</button>` : ""}</div>`).join("")}`) : "";
  let danger = "";
  if (isPres) {
    if (!hasAccount(p)) {
      danger = sectionHTML(T("pe.dangerNoAccount"), `${p.pending_code
        ? `<div class="note">${T("pe.pendingCode", { code: esc(p.pending_code) })}</div>`
        : `<div class="row"><input id="pk-code" value="${esc(d.code || "")}" placeholder="bt-xxxxxx" style="max-width:220px"${dis}>
           <button class="btn ghost sm" data-act="person-code" data-id="${esc(p.person_id)}"${dis}>${T("pe.issueCode")}</button></div>
           <div class="mini">${T("pe.issueCodeNote")}</div>`}
        <div class="row" style="margin-top:14px"><button class="btn danger sm" data-act="record-delete" data-id="${esc(p.person_id)}"${dis}>${T("pe.deleteRecord")}</button></div>
        <div class="mini">${T("pe.deleteRecordNote")}</div>`);
    } else if (!self) {
      danger = sectionHTML(T("pe.danger"), remove
        ? `<div class="note">${T("pe.removeList", { name: esc(name) })}</div>
           <label><i>${T("pe.removeType", { name: esc(name) })}</i><input id="pk-confirm" value="${esc(remove.typed || "")}" autocomplete="off"${dis}></label>
           <div class="row"><button class="btn danger" data-act="member-remove-go" data-id="${esc(p.person_id)}" data-name="${esc(name)}"${dis}>${T("pe.removeGo")}</button>
           <button class="btn ghost" data-act="member-remove-cancel"${dis}>${T("common.cancel")}</button></div>`
        : `<div class="row"><button class="btn danger sm" data-act="member-remove" data-id="${esc(p.person_id)}"${dis}>${T("pe.remove")}</button></div>
           <div class="mini">${T("pe.removeNote")}</div>`);
    }
  }
  return pageHead(`${esc(name)}${alt ? `<span class="alt">${esc(alt)}</span>` : ""}`, lede, [], { act: "roster-back", label: T("pe.back") })
    + msgHTML(msg)
    + rankSec + nameSec + posSec + teamSec + wsSec
    + `<div class="form-foot" style="margin-bottom:28px">
      <button class="btn" data-act="person-save" data-id="${esc(p.person_id)}"${dis}>${busy ? T("common.saving") : T("common.save")}</button>
      <button class="btn ghost" data-act="roster-back"${dis}>${T("common.cancel")}</button>
    </div>`
    + dupSec + danger;
}

// 加一筆過去的紀錄（沒有帳號的人）：名字加一筆職位。
export function personNewHTML(terms, msg, busy, draft) {
  const d = draft || {};
  const dis = busy ? " disabled" : "";
  const termId = d.term || ((terms || []).find(t => t.status !== "current") || (terms || [])[0] || {}).id || "";
  return pageHead(T("pn.title"), T("pn.lede"), [], { act: "roster-back", label: T("pe.back") })
    + msgHTML(msg)
    + sectionHTML("", `<div class="two">
      <label><i>${T("pe.nameZh")}</i><input id="pn-zh" value="${esc(d.name_zh || "")}"${dis}></label>
      <label><i>${T("pe.nameEn")}</i><input id="pn-en" value="${esc(d.name_en || "")}"${dis}></label>
    </div>
    <label><i>${T("pe.term")}</i><select id="pn-term"${dis}>${(terms || []).map(t => `<option value="${esc(t.id)}"${termId === t.id ? " selected" : ""}>${esc(t.id)}${t.status === "current" ? T("ro.curMark") : ""}</option>`).join("")}</select></label>
    <div class="two">
      <label><i>${T("pe.rankPick")}</i>${rankSelect("pn-rank", d.rank != null ? d.rank : rankOfTitle(d.title_en, d.pteam), dis)}</label>
      <label><i>${T("pe.posTeam")}</i>${teamSelect("pn-pteam", d.pteam || "", dis, isOrgWide(d.rank != null ? d.rank : rankOfTitle(d.title_en, d.pteam)))}</label>
    </div>
    <div class="two"${(d.rank != null ? d.rank : rankOfTitle(d.title_en, d.pteam)) === "custom" ? "" : " hidden"}>
      <label><i>${T("pe.titleEn")}</i><input id="pn-ten" value="${esc(d.title_en || "")}" placeholder="Associate, Marketing Team"${dis}></label>
      <label><i>${T("pe.titleZh")}</i><input id="pn-tzh" value="${esc(d.title_zh || "")}"${dis}></label>
    </div>
    <label><i>${T("pn.note")}</i><input id="pn-note" value="${esc(d.note || "")}" placeholder="${esc(T("pn.notePh"))}"${dis}></label>
    <div class="note">${T("pn.order")}</div>
    <div class="form-foot">
      <button class="btn" data-act="person-create"${dis}>${busy ? T("common.saving") : T("pn.create")}</button>
      <button class="btn ghost" data-act="roster-back"${dis}>${T("common.cancel")}</button>
    </div>`);
}

// 工作區：左邊清單、右邊這個工作區裡有誰、底下加人。sel 是選中的工作區 id，members 是 workspace_members(sel)。
// draft = { person, level, slug, title_zh, title_en, owner }。canCreate 是能不能新增工作區（Co-President 與 Senior Adviser）。
export function workspacesHTML(workspaces, sel, members, people, msg, busy, draft, canCreate) {
  const list = (workspaces || []).filter(w => w.active !== false);
  const d = draft || {};
  const dis = busy ? " disabled" : "";
  const w = list.find(x => x.id === sel) || null;
  const cadres = (people || []).filter(p => hasAccount(p) && p.role === "cadre");
  const inWs = new Set((members || []).map(m => m.user_id));
  const byProfile = Object.fromEntries(cadres.map(p => [p.profile_id, p]));
  const KIND = { passport: "ws.kind.passport", "intern-passport": "ws.kind.intern", apps: "ws.kind.apps", res: "ws.kind.res", custom: "ws.kind.custom" };
  const li = x => `<a class="rail-item${x.id === sel ? " on" : ""}" href="#ws=${encodeURIComponent(x.id)}" data-act="ws-pick" data-ws="${esc(x.id)}">${esc(wsLabel(x))}<span class="rail-count">${esc(T(KIND[x.kind] || "ws.kind.custom"))}</span></a>`;
  const left = list.length ? `<div class="wslist">${list.map(li).join("")}</div>` : emptyHTML(T("ws.empty"), T("ws.emptyHint"));
  const ownerName = w && w.owner && byProfile[w.owner] ? personName(byProfile[w.owner]).name : "";
  const memberRow = m => `<tr>
      <td class="t-main"><b>${esc(namesOf(m).name)}${namesOf(m).alt ? `<span class="alt">${esc(namesOf(m).alt)}</span>` : ""}</b> <span class="tag">${esc(boardLabel(m.board_role))}</span></td>
      <td><select data-act="ws-level" data-id="${esc(m.user_id)}"${dis}>${LEVELS.map(l => `<option value="${l}"${m.level === l ? " selected" : ""}>${esc(levelLabel(l))}</option>`).join("")}</select></td>
      <td class="t-act"><button class="btn quiet sm" data-act="ws-unassign" data-id="${esc(m.user_id)}"${dis}>${T("ws.remove")}</button></td>
    </tr>`;
  // Co-President 與 Senior Adviser 本來就到得了每一個工作區（is_senior）。列在最上面、標「依職級」、沒有下拉也沒有移出，
  // 這樣看的人（例如 Director）知道還有誰到得了。只是畫面，資料庫沒有這幾筆指派。
  const seniors = cadres.filter(p => isOrgWide(p.board_role) && !inWs.has(p.profile_id));
  const seniorRow = p => `<tr class="byrank">
      <td class="t-main"><b>${esc(personName(p).name)}${personName(p).alt ? `<span class="alt">${esc(personName(p).alt)}</span>` : ""}</b> <span class="tag">${esc(boardLabel(p.board_role))}</span> <span class="tag open">${T("grid.byRank")}</span></td>
      <td><span class="mini">${T("level.manage")}</span></td><td></td>
    </tr>`;
  const right = !w ? `<div class="empty"><b>${T("ws.pickOne")}</b></div>` : `
    <h2>${esc(wsLabel(w))}<span class="hint">${esc(w.id)}${ownerName ? T("ws.owner", { name: esc(ownerName) }) : ""}</span></h2>
    <div class="note">${T("ws.levels")}</div>
    ${(members || []).length || seniors.length
      ? `<table class="table"><thead><tr><th>${T("ro.name")}</th><th>${T("ws.level")}</th><th></th></tr></thead><tbody>${seniors.map(seniorRow).join("")}${(members || []).map(memberRow).join("")}</tbody></table>`
      : emptyHTML(T("ws.nobody"), T("ws.nobodyHint"))}
    <div class="card" style="margin-top:16px"><h2>${T("ws.add")}</h2>
      <div class="two">
        <label><i>${T("ws.who")}</i><input id="ws-person-q" list="ws-people" value="${esc(d.personQ || "")}" placeholder="${esc(T("ws.whoPh"))}" autocomplete="off"${dis}>
          <datalist id="ws-people">${cadres.filter(p => !inWs.has(p.profile_id)).map(p => `<option value="${esc(pickName(p))}">`).join("")}</datalist></label>
        <label><i>${T("ws.level")}</i><select id="ws-levelnew"${dis}>${LEVELS.map(l => `<option value="${l}"${(d.level || "view") === l ? " selected" : ""}>${esc(levelLabel(l))}</option>`).join("")}</select></label>
      </div>
      <div class="row"><button class="btn" data-act="ws-assign" data-ws="${esc(w.id)}"${dis}>${T("ws.addGo")}</button></div>
      <div class="mini">${T("ws.whoNote")} ${T("ws.addNote")}</div>
    </div>`;
  // 新增工作區（2026-10-23 批 2）：一張表單做完，名稱、擁有人、代號（從英文名稱自動算）、一開始就放進去的人各自一個等級。
  // 不再收在摺疊裡。main.js 的 ws-create 先建工作區，再把勾起來的人一個一個派進去。
  const mem = Array.isArray(d.members) ? d.members : [];
  const memRow = p => { const m = mem.find(x => x.id === p.profile_id); return `<div class="row wsn-row">
      <label class="check" style="margin:0"><input type="checkbox" name="wsn-member" value="${esc(p.profile_id)}"${m ? " checked" : ""}${dis}><span>${esc(pickName(p))}${p.board_role !== "member" ? ` <span class="mini">${esc(boardLabel(p.board_role))}</span>` : ""}</span></label>
      <select id="wsn-lv-${esc(p.profile_id)}" aria-label="${esc(T("ws.level"))}"${dis}>${LEVELS.map(l => `<option value="${l}"${(m ? m.level : "view") === l ? " selected" : ""}>${esc(levelLabel(l))}</option>`).join("")}</select>
    </div>`; };
  const create = canCreate ? sectionHTML(T("ws.new"), `<div class="two">
      <label><i>${T("ws.titleEn")}</i><input id="wsn-en" value="${esc(d.title_en || "")}" placeholder="Winter camp 2027"${dis}></label>
      <label><i>${T("ws.titleZh")}</i><input id="wsn-zh" value="${esc(d.title_zh || "")}" placeholder="2027 冬令營"${dis}></label>
      <label><i>${T("ws.ownerPick")}</i><select id="wsn-owner"${dis}><option value="">${T("value.none")}</option>${cadres.map(p => `<option value="${esc(p.profile_id)}"${d.owner === p.profile_id ? " selected" : ""}>${esc(pickName(p))}</option>`).join("")}</select></label>
      <label><i>${T("ws.slug")}</i><input id="wsn-slug" value="${esc(d.slug || "")}" placeholder="winter-camp-2027" autocomplete="off"${dis}></label>
    </div>
    <div class="mini">${T("ws.slugNote")}</div>
    <h3 class="sec-h" style="margin-top:16px">${T("ws.newMembers")}</h3>
    <div class="wsn-list">${cadres.map(memRow).join("")}</div>
    <div class="row" style="margin-top:14px"><button class="btn" data-act="ws-create"${dis}>${busy ? T("common.saving") : T("ws.createGo")}</button></div>
    <div class="mini">${T("ws.newNote")}</div>`, { id: "ws-new" }) : "";
  return pageHead(T("ws.title"), T("ws.lede"))
    + msgHTML(msg)
    + `<div class="cols"><section class="section">${left}</section><section class="section">${right}</section></div>`
    + create;
}

// 屆別：清單加人數、補過去的一屆、貼一整屆、結束這一屆（三步）。
// draft = { new: {id, zh, en, starts, ends}, paste: { term, text } }
// end = null 或 { step: 1|2|3, next: {id, zh, en, starts, ends}, keep: [profile_id…], typed }
export function termsHTML(terms, people, meId, isPres, msg, busy, draft, end) {
  const d = draft || {}; const nw = d.new || {}; const ps = d.paste || {};
  const dis = busy ? " disabled" : "";
  const cur = currentTerm(terms);
  const count = t => (people || []).filter(p => positionFor(p, t.id)).length;
  const noAcc = t => (people || []).filter(p => positionFor(p, t.id) && !hasAccount(p)).length;
  const rows = (terms || []).map(t => `<li><div class="fhead"><b>${esc(t.id)}</b>${t.status === "current" ? `<span class="tag open">${T("tm.current")}</span>` : `<span class="tag draft">${T("tm.ended")}</span>`}</div>
    <div class="fmeta">${esc((lang() === "zh" ? (t.title_zh || t.title_en) : (t.title_en || t.title_zh)) || "")}・${esc(t.starts_on)} → ${esc(t.ends_on)}・${T("tm.count", { n: count(t), m: noAcc(t) })}</div></li>`).join("");
  const listSec = sectionHTML(T("tm.list"), rows ? `<ul class="flist">${rows}</ul>` : emptyHTML(T("tm.empty"), T("tm.emptyHint")));
  const newSec = sectionHTML(T("tm.new"), `<div class="two">
      <label><i>${T("tm.id")}</i><input id="tm-id" value="${esc(nw.id || "")}" placeholder="2024-25"${dis}></label>
      <span></span>
      <label><i>${T("ws.titleZh")}</i><input id="tm-zh" value="${esc(nw.zh || "")}" placeholder="2024-25 屆"${dis}></label>
      <label><i>${T("ws.titleEn")}</i><input id="tm-en" value="${esc(nw.en || "")}" placeholder="TERM 2024-25"${dis}></label>
      <label><i>${T("tm.starts")}</i><input id="tm-starts" type="date" value="${esc(nw.starts || "")}"${dis}></label>
      <label><i>${T("tm.ends")}</i><input id="tm-ends" type="date" value="${esc(nw.ends || "")}"${dis}></label>
    </div>
    <div class="row"><button class="btn ghost" data-act="term-create"${dis}>${T("tm.createGo")}</button></div>
    <div class="mini">${T("tm.newNote")}</div>`);
  const pasteSec = sectionHTML(T("tm.paste"), `<label><i>${T("pe.term")}</i><select id="tp-term"${dis}>${(terms || []).map(t => `<option value="${esc(t.id)}"${(ps.term || (cur && cur.id)) === t.id ? " selected" : ""}>${esc(t.id)}</option>`).join("")}</select></label>
    <label><i>${T("tm.pasteBox")}</i><textarea id="tp-text" rows="6" placeholder="${esc(T("tm.pastePh"))}"${dis}>${esc(ps.text || "")}</textarea></label>${
    ps.preview ? `<div class="note">${T("tm.pastePreview", { n: ps.preview.rows.length, bad: ps.preview.bad.length ? T("tm.pasteBad", { lines: ps.preview.bad.join(", ") }) : "" })}</div>
      <table class="table"><thead><tr><th>${T("pe.nameZh")}</th><th>${T("pe.nameEn")}</th><th>${T("ro.position")}</th><th>${T("ro.team")}</th></tr></thead><tbody>${
        ps.preview.rows.map(r => `<tr><td>${esc(r.name_zh)}</td><td>${esc(r.name_en)}</td><td>${esc(r.title_en)}</td><td>${esc(r.team)}</td></tr>`).join("")}</tbody></table>
      <div class="row"><button class="btn" data-act="paste-go"${dis}>${T("tm.pasteGo", { n: ps.preview.rows.length })}</button><button class="btn ghost" data-act="paste-cancel"${dis}>${T("common.cancel")}</button></div>`
    : `<div class="row"><button class="btn ghost" data-act="paste-preview"${dis}>${T("tm.pastePreviewGo")}</button></div>`}
    <div class="mini">${T("tm.pasteNote")}</div>`);
  let endSec = "";
  if (isPres && cur) {
    if (!end) {
      endSec = sectionHTML(T("tm.end"), `<div class="note">${T("tm.endNote", { term: esc(cur.id) })}</div>
        <div class="row"><button class="btn danger" data-act="end-start"${dis}>${T("tm.endStart", { term: esc(cur.id) })}</button></div>`);
    } else {
      const n = end.next || {};
      const cadres = (people || []).filter(p => hasAccount(p) && p.role === "cadre");
      const keep = new Set(end.keep || []);
      keep.add(meId);
      const stay = cadres.filter(p => keep.has(p.profile_id)).length;
      const go = cadres.length - stay;
      const step1 = `<h3>${T("tm.step1")}</h3><div class="two">
        <label><i>${T("tm.id")}</i><input id="en-id" value="${esc(n.id || nextTermId(cur.id))}"${dis}></label><span></span>
        <label><i>${T("ws.titleZh")}</i><input id="en-zh" value="${esc(n.zh || "")}"${dis}></label>
        <label><i>${T("ws.titleEn")}</i><input id="en-en" value="${esc(n.en || "")}"${dis}></label>
        <label><i>${T("tm.starts")}</i><input id="en-starts" type="date" value="${esc(n.starts || "")}"${dis}></label>
        <label><i>${T("tm.ends")}</i><input id="en-ends" type="date" value="${esc(n.ends || "")}"${dis}></label>
      </div><div class="row"><button class="btn" data-act="end-step2"${dis}>${T("tm.next")}</button><button class="btn ghost" data-act="end-cancel"${dis}>${T("common.cancel")}</button></div>`;
      const step2 = `<h3>${T("tm.step2")}</h3><div class="note">${T("tm.keepNote")}</div>
        <div class="row" style="margin-bottom:10px"><button class="btn ghost sm" data-act="end-keep-all"${dis}>${T("tm.keepAll")}</button><button class="btn ghost sm" data-act="end-keep-none"${dis}>${T("tm.keepNone")}</button>
          <span class="tag open">${T("tm.stay", { n: stay })}</span><span class="tag warn">${T("tm.go", { n: go })}</span></div>
        <div class="tgrid">${cadres.map(p => `<label class="check tpick"><input type="checkbox" name="keep" value="${esc(p.profile_id)}"${keep.has(p.profile_id) ? " checked" : ""}${p.profile_id === meId ? " disabled" : dis}>
          <span>${esc(personName(p).name)}<span class="mini"> ${esc(boardLabel(p.board_role))}${p.profile_id === meId ? "・" + T("ro.you") : ""}</span></span></label>`).join("")}</div>
        <div class="row" style="margin-top:14px"><button class="btn" data-act="end-step3"${dis}>${T("tm.next")}</button><button class="btn ghost" data-act="end-back1"${dis}>${T("tm.back")}</button></div>`;
      const step3 = `<h3>${T("tm.step3")}</h3><div class="note">${T("tm.confirmNote", { term: esc(cur.id), next: esc(n.id || ""), stay, go })}</div>
        <label><i>${T("tm.typeId", { id: esc(n.id || "") })}</i><input id="en-typed" value="${esc(end.typed || "")}" autocomplete="off"${dis}></label>
        <div class="row"><button class="btn danger" data-act="end-go"${dis}>${T("tm.endGo")}</button><button class="btn ghost" data-act="end-back2"${dis}>${T("tm.back")}</button></div>`;
      endSec = sectionHTML(T("tm.end"), end.step === 3 ? step3 : end.step === 2 ? step2 : step1, { id: "end-term" });
    }
  }
  return pageHead(T("tm.title"), T("tm.lede"))
    + msgHTML(msg)
    + listSec + endSec + newSec + pasteSec;
}

// 只有 Co-President 與 Senior Adviser 進得來。真正的門在資料庫那幾支函式的第一句，
// 這裡少畫一個分頁不是安全機制：Director 硬打網址進來，看到的是這一句，按不到任何東西。
export function noAccessHTML(me) {
  return pageHead(T("noAccess.title"), T("noAccess.lede"),
    [{ label: T("noAccess.back"), href: withLang("../") }]);
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
const ROLE_KEY = { cadre: "role.cadre", alumni: "role.alumni", student: "role.student", intern: "role.intern" };
const GRANT_KEY = { cadre: "grant.cadre", alumni: "grant.alumni", intern: "grant.intern" };
const roleName = v => ROLE_KEY[v] ? T(ROLE_KEY[v]) : (v || "");
const grantName = v => GRANT_KEY[v] ? T(GRANT_KEY[v]) : (v || "");

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
  return `<div class="card" id="invite-form"><h2>${T("iv.formTitle")}</h2>
    <div class="two">
      <label><i>${T("iv.code")}</i><input id="ic-code" value="${esc(d.code || "")}"
        autocomplete="off" spellcheck="false"${dis}></label>
      <label><i>${T("iv.grants")}</i><select id="ic-grants"${dis}>
        <option value="cadre"${d.grants !== "alumni" && d.grants !== "intern" ? " selected" : ""}>${T("iv.cadreOpt")}</option>
        <option value="alumni"${d.grants === "alumni" ? " selected" : ""}>${T("iv.alumniOpt")}</option>
        <option value="intern"${d.grants === "intern" ? " selected" : ""}>${T("iv.internOpt")}</option>
      </select></label>
      <label><i>${T("iv.uses")}</i><input id="ic-uses" type="number" min="1" max="100"
        value="${esc(String(d.uses || 1))}"${dis}></label>
      <label><i>${T("iv.note")}</i><input id="ic-note" value="${esc(d.note || "")}"
        placeholder="${esc(T("iv.notePh"))}"${dis}></label>
    </div>
    <div class="row">
      <button class="btn" data-act="invite-new"${dis}>${T("iv.create")}</button>
      <button class="btn ghost sm" data-act="invite-suggest"${dis}>${T("iv.suggest")}</button>
    </div></div>`;
}

export function inviteCodesHTML(rows, msg, busy, draft) {
  const list = rows || [];
  const item = c => {
    const uses = Array.isArray(c.uses) ? c.uses : [];
    const left = Number(c.uses_left) || 0;
    return `<li>
      <div class="fhead"><b>${esc(c.code)}</b>
        <span class="tag">${esc(grantName(c.grants))}</span>
        ${left > 0 ? `<span class="tag open">${T("iv.left", { n: left })}</span>`
                   : `<span class="tag draft">${T("iv.usedUp")}</span>`}</div>
      ${c.note ? `<div class="fmeta">${T("iv.noteLine", { note: esc(c.note) })}</div>` : ""}
      <div class="fmeta">${T("iv.created", { d: esc(String(c.created_at || "").slice(0, 10) || T("iv.unknown")), n: uses.length })}</div>
      ${left > 0 ? `<div class="row"><button class="btn ghost sm" data-act="invite-disable"
        data-code="${esc(c.code)}"${busy ? " disabled" : ""}>${T("iv.disable")}</button></div>` : ""}
      ${uses.length ? `<details class="ans"><summary>${T("iv.whoUsed", { n: uses.length })}</summary>
      ${uses.map(u => `<div class="fmeta">・<b>${esc(u.name || T("common.noName"))}</b>
        ${esc(u.email || T("iv.noEmail"))}・${esc(String(u.used_at || "").slice(0, 10))}・${T("iv.became", { role: esc(roleName(u.grants)) })}${
        u.role && u.role !== u.grants ? T("iv.nowIs", { role: esc(roleName(u.role)) }) : ""}</div>`).join("")}</details>` : ""}
    </li>`;
  };
  return pageHead(T("iv.title"), T("iv.lede"))
    + msgHTML(msg)
    + inviteFormHTML(draft, busy)
    + sectionHTML(T("iv.issued"), `<div class="note">${T("iv.issuedNote")}</div>
    ${list.length ? `<ul class="flist">${list.map(item).join("")}</ul>`
                  : emptyHTML(T("iv.empty"), T("iv.emptyHint"))}`, { id: "codes" });
}

// ── 邀請信（2026-10-29，docs/2026-10-24-邀請信.md）────────────────────
// rows 是 invites_for_review()；batch 是 invite_codes_for_review()（舊的批次碼，收在摺疊裡）；
// draft = { email, who, rank（職位下拉）, team, term, name_zh, name_en, title_en, title_zh, line, note }。
// who 是「他會是」那一格的值：cadre:<職級>、alumni、intern。
export const INVITE_WHO = ["cadre:president", "cadre:senior_adviser", "cadre:director", "cadre:adviser", "cadre:member", "alumni", "intern"];
export function whoLabel(v) {
  if (v === "alumni") return T("in.who.alumni");
  if (v === "intern") return T("in.who.intern");
  return T("in.who.cadre", { rank: boardLabel(String(v || "").replace(/^cadre:/, "")) });
}
export function inviteFormNewHTML(draft, terms, busy) {
  const d = draft || {};
  const dis = busy ? " disabled" : "";
  const who = d.who || "cadre:member";
  const cur = currentTerm(terms);
  const termId = d.term || (cur ? cur.id : "");
  const posRank = d.rank != null ? d.rank : rankOfTitle(d.title_en, d.team);
  return `<div class="card inline-form" id="invite-new"><h2>${T("in.form")}</h2>
    <div class="two">
      <label><i>${T("in.email")}</i><input id="in-email" type="email" value="${esc(d.email || "")}" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="name@example.com"${dis}></label>
      <label><i>${T("in.who")}</i><select id="in-who"${dis}>${INVITE_WHO.map(v => `<option value="${v}"${who === v ? " selected" : ""}>${esc(whoLabel(v))}</option>`).join("")}</select></label>
      <label><i>${T("in.position")}</i>${rankSelect("in-rank", posRank, dis)}</label>
      <label><i>${T("pe.posTeam")}</i>${teamSelect("in-team", d.team || "", dis, isOrgWide(posRank))}</label>
    </div>
    <div class="two"${posRank === "custom" ? "" : " hidden"}>
      <label><i>${T("pe.titleEn")}</i><input id="in-ten" value="${esc(d.title_en || "")}" placeholder="Director, Curriculum Team"${dis}></label>
      <label><i>${T("pe.titleZh")}</i><input id="in-tzh" value="${esc(d.title_zh || "")}"${dis}></label>
    </div>
    <div class="two">
      <label><i>${T("in.term")}</i><select id="in-term"${dis}><option value="">${T("value.none")}</option>${(terms || []).map(t => `<option value="${esc(t.id)}"${termId === t.id ? " selected" : ""}>${esc(t.id)}${t.status === "current" ? T("ro.curMark") : ""}</option>`).join("")}</select></label>
      <span></span>
      <label><i>${T("in.nameZh")}</i><input id="in-zh" value="${esc(d.name_zh || "")}"${dis}></label>
      <label><i>${T("in.nameEn")}</i><input id="in-en" value="${esc(d.name_en || "")}"${dis}></label>
      <label><i>${T("in.line")}</i><input id="in-line" value="${esc(d.line || "")}" placeholder="${esc(T("in.linePh"))}"${dis}></label>
      <label><i>${T("in.note")}</i><input id="in-note" value="${esc(d.note || "")}"${dis}></label>
    </div>
    <div class="row"><button class="btn" data-act="invite-send"${dis}>${busy ? T("in.sending") : T("in.send")}</button></div>
    <div class="mini">${T("in.formNote")}</div>
  </div>`;
}
const ST_TAG = { queued: "", sent: "open", failed: "warn", opened: "open", claimed: "done", expired: "draft", revoked: "draft" };
export function invitesPageHTML(rows, batch, terms, msg, busy, draft, batchDraft, isPres) {
  const list = rows || [];
  const dis = busy ? " disabled" : "";
  const d10 = v => String(v || "").slice(0, 10);
  const item = r => {
    const who = r.grants === "cadre" ? T("in.who.cadre", { rank: boardLabel(r.rank || "member") }) : r.grants === "intern" ? T("in.who.intern") : T("in.who.alumni");
    const live = ["queued", "sent", "failed", "opened"].includes(r.status);
    return `<li>
      <div class="fhead"><b>${esc(r.email)}</b><span class="tag ${ST_TAG[r.status] || ""}">${esc(T("in.st." + r.status) || r.status)}</span>${
        r.person_name && r.person_name !== T("common.noName") ? `<span class="alt">${esc(r.person_name)}</span>` : ""}</div>
      <div class="fmeta">${T("in.meta", { who: esc(who + (r.title ? "・" + r.title : "")), when: esc(d10(r.created_at)), by: esc(r.invited_by_name || "") })}${
        live && r.expires_at ? "・" + T("in.expires", { d: esc(d10(r.expires_at)) }) : ""}・<span class="mini">${T("in.code", { code: esc(r.code) })}</span></div>
      ${r.status === "failed" && r.mail_error ? `<div class="fmeta">${T("in.mailErr", { err: esc(r.mail_error) })}</div>` : ""}
      ${r.status === "claimed" ? `<div class="fmeta">${T("in.claimedBy", { name: esc(r.claimed_name || ""), d: esc(d10(r.claimed_at)) })}</div>` : ""}
      ${r.note ? `<div class="fmeta">${T("iv.noteLine", { note: esc(r.note) })}</div>` : ""}
      <div class="row">${
        r.status !== "claimed" ? `<button class="btn ghost sm" data-act="invite-resend" data-code="${esc(r.code)}" data-email="${esc(r.email)}"${dis}>${T("in.resend")}</button>` : ""}${
        live && isPres ? `<button class="btn quiet sm" data-act="invite-revoke" data-code="${esc(r.code)}" data-email="${esc(r.email)}"${dis}>${T("in.revoke")}</button>` : ""}${
        r.person_id ? `<a class="btn quiet sm" href="#person=${encodeURIComponent(r.person_id)}" data-act="tab" data-t="person=${esc(r.person_id)}">${T("in.openRecord")}</a>` : ""}</div>
    </li>`;
  };
  return pageHead(T("in.title"), T("in.lede"))
    + msgHTML(msg)
    + inviteFormNewHTML(draft, terms, busy)
    + sectionHTML(T("in.list"), list.length ? `<ul class="flist">${list.map(item).join("")}</ul>` : emptyHTML(T("in.empty"), T("in.emptyHint")), { id: "invites" })
    + (isPres ? `<details class="ans" id="batch"><summary>${T("in.batch")}</summary>${inviteFormHTML(batchDraft, busy)}${
        sectionHTML(T("iv.issued"), `<div class="note">${T("iv.issuedNote")}</div>${(batch || []).length
          ? `<ul class="flist">${(batch || []).map(c => inviteCodesHTML([c], "", busy, null).replace(/^[\s\S]*?<ul class="flist">/, "").replace(/<\/ul>[\s\S]*$/, "")).join("")}</ul>`
          : emptyHTML(T("iv.empty"), T("iv.emptyHint"))}`, { id: "codes" })}</details>` : "");
}

export function notCadreHTML() {
  return pageHead(T("notCadre.title"), T("notCadre.lede"), [{ label: T("notCadre.back"), href: "../../app/" }]);
}

// err：資料庫真正回的那一句，印在底下小字。開頁會先自己重試一次（main.js 的 retryBoot），第二次才顯示這一頁。
export function downHTML(err) {
  return pageHead(T("down.title"), T("down.lede"), [{ act: "retry", label: T("common.retry") }])
    + (err ? `<div class="mini">${esc(T("down.detail"))}${esc(err)}</div>` : "");
}
