// 後台「對外」那一組的畫面：資源、團隊頁、校友頁、信件文案。
// 2026-10-15 從 admin/src/ui.js 原樣搬過來（後台拆成四個資料夾）。
// **esc 與 namesOf 是自己的一份**，不從別的資料夾 import。
// 申請管理的畫面。**esc 是自己的一份**，不從別的資料夾 import
//（跟 app/ 與 availability/ 同一條規矩：資料夾之間不互相依賴）。
//
// 2026-10-19 起畫面上的字全部從 ./strings.js 的字典來（T("鍵")），中英兩版並排在那一支裡。
// 這一支只管拼 HTML，不再寫死任何一句給人看的字。怎麼加一句見 README「後台的中英切換」。
import { T, lang, setLang, withLang, isErr } from "./strings.js";
export { T, lang, setLang };
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// 一個人在畫面上要顯示的兩個名字（2026-09-10）。**同一份規則在
// passport/src/ui.js 與 availability/src/data.js 也各有一份**
// （資料夾之間不互相 import）。三份漂移的表現是「同一個人在三個地方顯示的名字
// 不一樣」，不會報錯。test/names.test.mjs 拿同一張輸入表逐項比對三份。
export function namesOf(p) {
  const zh = String(p.name_zh || "").trim();
  const en = String(p.name_en || "").trim();
  return {
    name: zh || en || T("common.noName"),
    alt: zh && en && zh !== en ? en : "",
  };
}

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
  // 2026-10-31 行銷需求單：每一位幹部都能送；佇列只有 Marketing 需求工作區裡的人（與靠職級的兩級）看得到。
  // 2026-11-01 活動上架：每一位幹部看得到活動清單（自己 team 的），開活動要 team 的 Director 或 senior（門在資料庫）。
  { group: "forms",     key: "events",   label: { zh: "活動",     en: "Events" },          who: "cadre" },
  { group: "forms",     key: "request",  label: { zh: "跟 Marketing 提需求", en: "Request from Marketing" }, who: "cadre" },
  { group: "forms",     key: "requests", label: { zh: "行銷需求單", en: "Marketing requests" }, who: "ws:custom:marketing-requests" },
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
    // 2026-10-31：進得去的組裡，綁工作區的那幾行（who 是 ws:…）只給被派進去的人看（行銷需求單的佇列在「申請」這一組，幹部都進得了組）。
    const rows = ITEMS.filter(i => i.group === g.key && i.key !== "home" && (!String(i.who).startsWith("ws:") || canSee(i, me)));
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
// mp = { ws, name, rows: workspace_members 回的, cadres: [{ id, name_zh, name_en, board_role, team }], meId, pk（多選加人的狀態，見 pickerHTML）}
// 兩行的名字（2026-10-24，Paul：名單上有的英文名在旁邊、有的在底下，列高不齊）：第一行中文、第二行英文淡字，
// 永遠是兩個元素（沒有英文名第二行是空的，高度照樣留著），都靠左。名單、成員區兩欄、結束這一屆的「誰留下」都用這一個。
export function nameBlock(p) {
  const zh = String(p && p.name_zh || "").trim(), en = String(p && p.name_en || "").trim();
  const main = zh || en || T("common.noName"), sub = zh && en && zh !== en ? en : "";
  return `<span class="nm"><b>${esc(main)}</b><span class="nm-en">${esc(sub)}</span></span>`;
}
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
// ── 一次加好幾個人（2026-10-24，Paul：「一次很難加好幾個人」）────────────────────────
// 這幾支純函式是底下 membersAreaHTML 的零件（候選人、篩選、勾選、一批復原）。四份一模一樣（測試逐字比對）。
// people：[{ id, name_zh, name_en, board_role, team }]。已經在工作區裡的人與靠職級就有一切的那兩級不列。
// pk = { q, teams: [team…], ticked: [id…], level }。ns 是這一塊在頁面上的前綴（同一頁可以有兩塊，例如 Workspaces 的右欄與新增表單）。
export const PK_TEAMS = ["Curriculum Team", "Mentorship Team", "Marketing Team", "Sponsorship Team", "Internship Team", "Community Relations Team"];
export function pkTeamsOf(p) { return String(p && p.team || "").split(/[,、;；]/).map(s => s.trim()).filter(Boolean); }
export function pkCandidates(people, inIds) {
  const inWs = new Set(inIds || []);
  return (people || []).filter(p => p && p.id && !inWs.has(p.id) && !["president", "senior_adviser"].includes(p.board_role));
}
// 找名字是「包含」不是「等於」，中英都找；team chip 勾了幾個就是「其中任何一個」。
export function pkShown(cands, pk) {
  const q = String(pk && pk.q || "").trim().toLowerCase();
  const teams = (pk && pk.teams) || [];
  return (cands || []).filter(p => (!q || mpName(p).toLowerCase().includes(q))
    && (!teams.length || pkTeamsOf(p).some(t => teams.includes(t))));
}
// 「全勾看到的」= 原本勾的加上現在列出來的；篩掉的不動。「全部取消」= 空。
export function pkTickAll(pk, shown) { return [...new Set([...((pk && pk.ticked) || []), ...(shown || []).map(p => p.id)])]; }
export function pkToggle(pk, id, on) { const s = new Set((pk && pk.ticked) || []); if (on) s.add(id); else s.delete(id); return [...s]; }
// 真的會送出去的人：勾了、而且還列得出來（已經在裡面或已經不是幹部的就算勾過也不算）。
export function pkPicked(people, inIds, pk) { const ok = new Set(pkCandidates(people, inIds).map(p => p.id)); return ((pk && pk.ticked) || []).filter(id => ok.has(id)); }
// 一個事件（打字、勾、換等級、按 chip、全勾、全取消）之後 pk 變成什麼。純函式，四個 main.js 都只呼叫它。
export function pkReduce(pk, people, inIds, el) {
  const a = el && el.dataset ? el.dataset.act : "";
  const p0 = Object.assign({ q: "", mq: "", teams: [], ticked: [], level: "view" }, pk || {});
  if (a === "pk-q") return Object.assign(p0, { q: el.value });
  if (a === "pk-mq") return Object.assign(p0, { mq: el.value });
  if (a === "pk-untick") return Object.assign(p0, { ticked: pkToggle(p0, el.dataset.id, false) });
  if (a === "pk-level") return Object.assign(p0, { level: el.value });
  if (a === "pk-tick") return Object.assign(p0, { ticked: pkToggle(p0, el.value, !!el.checked) });
  if (a === "pk-team") { const t = el.dataset.team; return Object.assign(p0, { teams: p0.teams.includes(t) ? p0.teams.filter(x => x !== t) : p0.teams.concat(t) }); }
  if (a === "pk-all") return Object.assign(p0, { ticked: pkTickAll(p0, pkShown(pkCandidates(people, inIds), p0)) });
  if (a === "pk-none") return Object.assign(p0, { ticked: [] });
  return p0;
}
// 復原一整批：把當時那 N 個人移出，之後畫面怎麼變都不影響（先抄一份 id）。回傳移出的人數。
export function batchUndo(ids, unassign) { const snap = [...(ids || [])]; return async () => { for (const id of snap) await unassign(id); return snap.length; }; }
// 重畫之後把游標放回找人的欄位，不然每打一個字就失焦。
export function pkRefocus(ns, which) {
  const el = typeof document !== "undefined" ? document.getElementById(ns + "-" + (which || "q")) : null;
  if (el) { el.focus(); const n = el.value.length; try { el.setSelectionRange(n, n); } catch (x) { /* 有的瀏覽器不給 */ } }
}
// ── 成員區：兩欄（2026-10-24，Paul：「UI 很醜，看不到全部」）────────────────────────────
// 左欄「在裡面的 (N)」、右欄「還沒在裡面的 (M)」，兩欄一樣高（桌機約 60vh、手機各 40vh 上下疊）、各自在裡面捲，
// 控制項（找名字、team chip、全勾／全取消、等級、「加 N 個人」）釘在右欄最上面；左欄也有一個找名字。
// 一列一行 36px：勾選（右欄）・名字・兩個字母的職級標（CP SA DR AD AS）・team 淡字。左欄的列是 名字・職級標・等級下拉・移出。
// 五個面都用這一塊（Workspaces 右欄、四個成員分頁、加一個專案或營隊）。四份一模一樣（測試逐字比對）。
// a = { rows（在裡面的，workspace_members 的形狀）, people（幹部名單，候選人從這裡算）, pk, busy, meId,
//       acts: { level, remove, cleanup }（左欄下拉、移出、清掉多餘指派的 data-act）, canCleanup（Co-President 或 Senior Adviser 才給那條連結）, go: { act, ...data }（右欄那顆按鈕；沒有就不畫）,
//       draft: true 的話是「還沒建立」的模式：左欄列的是勾起來的人（移出 = 取消勾），右欄是還沒勾的 }
export const RANK_TAG = { president: "CP", senior_adviser: "SA", director: "DR", adviser: "AD", member: "AS" };
export const rankTag = board => `<span class="rk" title="${esc(boardName(board))}">${RANK_TAG[board] || "AS"}</span>`;
export function membersAreaHTML(ns, a) {
  const o = a || {};
  const pk = Object.assign({ q: "", mq: "", teams: [], ticked: [], level: "view" }, o.pk || {});
  const people = o.people || [], rows = o.rows || [];
  const dis = o.busy ? " disabled" : "";
  const short = t => t.replace(/\s*Team$/i, "");
  const teamsHTML = p => pkTeamsOf(p).map(t => `<span class="mini">${esc(short(t))}</span>`).join(" ");
  const byId = Object.fromEntries(people.map(p => [p.id, p]));
  const mq = String(pk.mq || "").trim().toLowerCase();
  const hit = p => !mq || mpName(p).toLowerCase().includes(mq);
  // 左欄
  let left;
  if (o.draft) {
    const picked = pkPicked(people, [], pk).map(id => byId[id]).filter(Boolean);
    left = { n: picked.length, title: T("ma.willAdd", { n: picked.length }),
      items: picked.filter(hit).map(p => `<div class="ma-row">${nameBlock(p)}${rankTag(p.board_role)}${teamsHTML(p)}<span class="sp"></span><button type="button" class="lnk" data-act="pk-untick" data-ns="${esc(ns)}" data-id="${esc(p.id)}"${dis}>${T("ma.untick")}</button></div>`),
      empty: T("ma.willAddNone") };
  } else {
    // 一個人只畫一列（Paul 2026-10-24 看到同一級的人有的灰的有的有下拉）：Co-President 與 Senior Adviser 一律一列「全部（職級）」，
    // 就算 assignments 裡還留著他的指派也不畫成可以改的那種；那些多餘的指派底下給一條「清掉」。其他人同一個 id 只留第一筆。
    const isSenior = b => ["president", "senior_adviser"].includes(b);
    const seniorIds = new Set(people.filter(p => isSenior(p.board_role)).map(p => p.id));
    for (const r of rows) if (isSenior(r.board_role)) seniorIds.add(r.user_id);
    const seniors = people.filter(p => seniorIds.has(p.id))
      .concat(rows.filter(r => seniorIds.has(r.user_id) && !people.some(p => p.id === r.user_id)).map(r => ({ id: r.user_id, name_zh: r.name_zh, name_en: r.name_en, board_role: r.board_role })));
    const seen = new Set();
    const plain = rows.filter(r => !seniorIds.has(r.user_id) && !seen.has(r.user_id) && seen.add(r.user_id));
    const redundant = rows.filter(r => seniorIds.has(r.user_id));
    const seniorRow = p => `<div class="ma-row byrank">${nameBlock(p)}${rankTag(p.board_role)}<span class="mini">${T("grid.byRank")}</span>${p.id === o.meId ? `<span class="mini">${T("mp.you")}</span>` : ""}<span class="sp"></span><span class="mini">${esc(T("level.manage"))}</span></div>`;
    // 左欄的列不印 team（Paul 定的形狀：名字・職級標・等級・移出），欄位窄的時候才放得下。
    const row = r => `<div class="ma-row">${nameBlock(r)}${rankTag(r.board_role)}${r.user_id === o.meId ? `<span class="mini">${T("mp.you")}</span>` : ""}<span class="sp"></span>
        <select data-act="${esc(o.acts.level)}" data-id="${esc(r.user_id)}"${dis}>${["view", "edit", "manage"].map(l => `<option value="${l}"${r.level === l ? " selected" : ""}>${esc(T("level." + l))}</option>`).join("")}</select>
        <button type="button" class="lnk" data-act="${esc(o.acts.remove)}" data-id="${esc(r.user_id)}"${dis}>${T("mp.remove")}</button></div>`;
    const nPeople = seniors.length + plain.length;
    left = { n: nPeople, title: T("ma.in", { n: nPeople }),
      items: seniors.filter(hit).map(seniorRow).concat(plain.filter(hit).map(row)), empty: T("ma.inNone"),
      foot: redundant.length && o.acts.cleanup && o.canCleanup
        ? `<div class="ma-foot mini">${T("ma.redundant", { n: redundant.length })} <button type="button" class="lnk" data-act="${esc(o.acts.cleanup)}" data-ids="${esc(redundant.map(r => r.user_id).join(","))}"${dis}>${T("ma.cleanup", { n: redundant.length })}</button></div>`
        : "" };
  }
  // 右欄
  const inIds = o.draft ? pk.ticked : rows.map(r => r.user_id);
  const cands = pkCandidates(people, inIds);
  const shown = pkShown(cands, pk);
  const ticked = new Set(pk.ticked);
  const n = o.draft ? 0 : pkPicked(people, inIds, pk).length;
  const teamsHere = PK_TEAMS.filter(t => cands.some(p => pkTeamsOf(p).includes(t)));
  const chip = t => `<button type="button" class="chip sm${pk.teams.includes(t) ? " on" : ""}" data-act="pk-team" data-ns="${esc(ns)}" data-team="${esc(t)}"${dis}>${esc(short(t))}</button>`;
  const cand = p => `<label class="ma-row pick${ticked.has(p.id) && !o.draft ? " on" : ""}"><input type="checkbox" name="${esc(ns)}-member" value="${esc(p.id)}" data-act="pk-tick" data-ns="${esc(ns)}"${ticked.has(p.id) && !o.draft ? " checked" : ""}${dis}>${nameBlock(p)}${rankTag(p.board_role)}${teamsHTML(p)}</label>`;
  const goBtn = o.go ? `<button class="btn sm" data-act="${esc(o.go.act)}" data-ns="${esc(ns)}"${Object.keys(o.go).filter(k => k !== "act").map(k => ` data-${k}="${esc(String(o.go[k]))}"`).join("")}${o.busy || !n ? " disabled" : ""}>${o.busy ? T("common.saving") : T("pk.addN", { n })}</button>` : "";
  const levelSel = `<select id="${esc(ns)}-level" data-act="pk-level" data-ns="${esc(ns)}" aria-label="${esc(T("pk.level"))}"${dis}>${["view", "edit", "manage"].map(l => `<option value="${l}"${pk.level === l ? " selected" : ""}>${esc(T("level." + l))}</option>`).join("")}</select>`;
  return `<div class="ma picker" data-ns="${esc(ns)}">
    <section class="ma-col"><div class="ma-head"><div class="ma-title">${left.title}</div>
        <input id="${esc(ns)}-mq" class="ma-find" value="${esc(pk.mq || "")}" placeholder="${esc(T("pk.findPh"))}" autocomplete="off" data-act="pk-mq" data-ns="${esc(ns)}"${dis}></div>
      <div class="ma-list">${left.items.length ? left.items.join("") : `<div class="ma-empty mini">${left.n ? T("pk.noneShown") : left.empty}</div>`}</div>${left.foot || ""}</section>
    <section class="ma-col"><div class="ma-head"><div class="ma-title">${T("ma.out", { n: cands.length })}${shown.length !== cands.length ? `<span class="mini"> ${T("ma.shown", { n: shown.length })}</span>` : ""}</div>
        <input id="${esc(ns)}-q" class="ma-find" value="${esc(pk.q || "")}" placeholder="${esc(T("pk.findPh"))}" autocomplete="off" data-act="pk-q" data-ns="${esc(ns)}"${dis}>
        ${teamsHere.length ? `<div class="ma-chips">${teamsHere.map(chip).join("")}</div>` : ""}
        <div class="ma-tools"><button type="button" class="lnk" data-act="pk-all" data-ns="${esc(ns)}"${o.busy || !shown.length ? " disabled" : ""}>${T("pk.tickAll")}</button>
          <button type="button" class="lnk" data-act="pk-none" data-ns="${esc(ns)}"${o.busy || !pk.ticked.length ? " disabled" : ""}>${T("pk.untick")}</button><span class="sp"></span>${levelSel}${goBtn}</div></div>
      <div class="ma-list">${shown.length ? shown.map(cand).join("") : `<div class="ma-empty mini">${cands.length ? T("pk.noneShown") : T("pk.noneLeft")}</div>`}</div></section>
  </div>`;
}
// 這一頁該列哪幾個「誰在做…」的入口：senior 看所有這一類的工作區，其他人只有自己是「管」的那幾個。
// workspaces 是 workspaces 表（id、kind、title_zh、title_en、active）；prefix 是 "apps:" 或 "res:"，或整個代號（"intern-passport"）。
// 一個工作區屬於哪一列（2026-10-24 照 team 分組）：apps:X / res:X 是 X；intern-passport 是 Internship Team；passport 是整個 BT（""）；
// 自訂的看它的 team 欄，沒有就看擁有人勾的第一個 team（people 給得到的時候），都沒有就放在整個 BT 那一列。
export function wsTeamOf(w, people) {
  const id = String((w && w.id) || "");
  // 2026-10-30 起申請是整個 BT 一個工作區 apps（在「整個 BT」那一列）；apps:<team> 是停用的舊工作區，還認得出來就好。
  if (id === "apps") return "";
  if (id.startsWith("apps:")) return id.slice(5);
  if (id.startsWith("res:")) return id.slice(4);
  if (id === "intern-passport") return "Internship Team";
  if (id === "passport") return "";
  if (w && w.team) return w.team;
  const o = w && w.owner && (people || []).find(p => p.profile_id === w.owner || p.id === w.owner);
  const t = o ? String(o.team || "").split(/[,、;；]/).map(s => s.trim()).filter(Boolean)[0] : "";
  return t || "";
}
// 那一格叫什麼：兩本護照用長名稱（講清楚管的是格子不是能不能玩），申請與資源用短的，自訂的用它的標題。
export function wsCellLabel(w) {
  const id = String((w && w.id) || "");
  if (id === "passport") return T("ws.long.passport");
  if (id === "intern-passport") return T("ws.long.intern");
  if (id === "apps" || id.startsWith("apps:")) return T("ws.long.apps");
  if (id.startsWith("res:")) return T("ws.long.res");
  return (w && ((lang() === "zh" ? (w.title_zh || w.title_en) : (w.title_en || w.title_zh)))) || id;
}
export function wsCellHref(w) {
  const id = String((w && w.id) || "");
  if (id === "passport") return "/admin/passports/#cadre";
  if (id === "intern-passport") return "/admin/passports/#interns";
  if (id === "apps" || id.startsWith("apps:")) return "/admin/#forms";
  if (id.startsWith("res:")) return "/admin/site/#res";
  if (id === "custom:marketing-requests") return "/admin/#requests";
  if (id.startsWith("custom:event-")) return "/admin/#events/" + encodeURIComponent(id.slice(13));
  return "/admin/people/#ws=" + encodeURIComponent(id);
}
// 分組：[{ team: "" 或 team 名, label, cells: [workspace…] }]，整個 BT 那一列在最上面，然後照 teams 的順序，最後是清單外的 team。
export function wsRows(workspaces, teams, people) {
  const active = (workspaces || []).filter(w => w.active !== false);
  const order = { apps: 0, passport: 1, "intern-passport": 3 };
  const rank = w => w.id.startsWith("apps:") ? 1 : w.id.startsWith("res:") ? 2 : (order[w.id] != null ? order[w.id] : 9);
  const groups = new Map([["", []]]);
  for (const t of teams || []) groups.set(t, []);
  for (const w of active) { const t = wsTeamOf(w, people); if (!groups.has(t)) groups.set(t, []); groups.get(t).push(w); }
  return [...groups.entries()].map(([team, cells]) => ({ team, label: team ? team.replace(/\s*Team$/i, "") : T("ws.board"), cells: cells.sort((a, b) => rank(a) - rank(b)) }));
}
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
  // 2026-10-24：兩欄成員區（左「在裡面的」右「還沒在裡面的」，見 membersAreaHTML）。Co-President 與 Senior Adviser 在左欄最上面標「依職級」。
  return pageHead(T("mp.title", { name: esc(mp.name || mp.ws) }), T("mp.lede"), [], { act: "members-back", label: T("mp.back") })
    + msgHTML(msg)
    + `<div class="note">${T("mp.levels")}</div>`
    + membersAreaHTML("mp", { rows: mp.rows || [], people: mp.cadres || [], pk: mp.pk, busy, meId: mp.meId,
        acts: { level: "members-level", remove: "members-unassign", cleanup: "members-cleanup" }, canCleanup: !!mp.senior, go: { act: "members-assign", ws: mp.ws } });
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
  const me = { role: "cadre", board: isPresident ? "president" : "member", ws: { "intern-passport": "edit" } };
  return ITEMS.filter(i => i.group === "site" && i.key !== "home" && canSee(i, me))
    .map(i => `<a class="rail-item${i.key === tab ? " on" : ""}" href="#${i.key}" data-act="tab" data-t="${i.key}">${esc(T(i.label))}</a>`).join("");
}


// ═══════════════════════════════════════════════════════════════════════
// 批 5：資源
// ═══════════════════════════════════════════════════════════════════════
// label 是字典的鍵，畫的時候才 T()。
export const RES_KINDS = [
  { v: "pdf", label: "res.pdf" }, { v: "video", label: "res.video" },
  { v: "slides", label: "res.slides" }, { v: "sheet", label: "res.sheet" },
  { v: "book", label: "res.book" }, { v: "link", label: "res.link" },
];

// 團隊頁的核可。**只有 Co-President 看得到這個分頁**（核可是他們的鑰匙）。
//
// ⚠ 那兩句提醒不是裝飾。系統沒有生日欄位，「未滿 18 不放」技術上擋不住，
// 而大頭照對外是超出現行隱私政策告知範圍的新用途。
// 這一頁是這兩件事**唯一會被看到的地方**。
// ⚠ 這一頁只有 Co-President 看得到（呼叫端已經擋過），所以分頁列
// 直接把 isPresident 寫死成 true —— 少了這一列，核可完想回申請表
// 就只能重新整理整頁（小問題 7，總審查）。
export function publicTeamHTML(people, msg, busy) {
  const on = people.filter(p => p.public_approved).length;
  return pageHead(T("team.title"), T("team.lede", { n: on }))
    + msgHTML(msg)
    + sectionHTML("", `<div class="note">${T("team.note")}</div>
    ${people.length ? `<ul class="flist">${people.map(p => {
      const { name, alt } = namesOf(p);
      return `<li>
        <div class="arow">
          <label class="apick"><input type="checkbox" data-act="approve" data-id="${esc(p.id)}"
            ${p.public_approved ? "checked" : ""}${busy ? " disabled" : ""}
            aria-label="${T("team.approve", { name: esc(name) })}"></label>
          <div class="abody">
            <div class="fhead"><b>${esc(name)}${alt ? `<span class="alt">${esc(alt)}</span>` : ""}</b>
              ${p.public_approved ? `<span class="tag open">${T("team.onPage")}</span>`
                                  : `<span class="tag">${T("team.notYet")}</span>`}</div>
            <div class="fmeta">${esc([p.title, p.team].filter(Boolean).join("・") || T("team.noTeam"))}
              ${p.avatar ? T("team.avatar") : T("team.noAvatar")}</div>
          </div>
        </div>
      </li>`;
    }).join("")}</ul>` : emptyHTML(T("team.empty"), T("team.emptyHint"))}`);
}

// 校友頁的核可（2026-09-11）。**只有 Co-President 看得到這個分頁**（核可是他們的鑰匙）。
//
// ⚠ 這裡要看到的是**內容**，不是名字。核可的意思是
// 「這段文字可以用 BT 的名義公開」，看不到那段文字就沒辦法判斷 ——
// 所以那一句話與那段介紹一律整段畫出來，不收在「點開才看得到」裡面。
// ⚠ touch_updated_at() 是 before update 的 trigger，核可本身也是一句 update，
// 所以按下核可之後 updated_at 會變成核可時間。對已核可的人顯示「內容最後改過」
// 就是在說謊——那是人做安全判斷時看的資訊（總審查 I5）。不改共用的 trigger，
// 改成這裡分開顯示：未核可看 updated_at，已核可看 approved_at。
export function alumniStoriesHTML(rows, msg, busy) {
  // rows 可能是 undefined（載入失敗那一瞬間）。**這一頁寧可少東西也不能空白**，
  // 那是這個 repo 的規矩：連不上資料庫也要畫得出東西。
  const list = rows || [];
  const on = list.filter(r => r.story_approved).length;
  // 等核可的排最上面 —— 這一頁的工作就是處理那幾個。
  // 資料庫那一支 stories_for_review() 已經 order by 過同一件事，這裡再排一次是
  // **刻意的**：畫面的順序不該取決於呼叫端剛好給了什麼順序，而這一支是純函式，
  // 測試守得住它。用穩定排序，所以同一組裡面仍然照資料庫給的順序（最近改過的在前）。
  const sorted = list.slice()
    .sort((a, b) => Number(!!a.story_approved) - Number(!!b.story_approved));
  return pageHead(T("stories.title"), T("stories.lede", { n: on }))
    + msgHTML(msg)
    + sectionHTML("", `<div class="note">${T("stories.note")}</div>
    ${sorted.length ? `<ul class="flist">${sorted.map(r => `<li>
        <div class="arow">
          <label class="apick"><input type="checkbox" data-act="approve-story" data-id="${esc(r.id)}"
            ${r.story_approved ? "checked" : ""}${busy ? " disabled" : ""}
            aria-label="${T("team.approve", { name: esc(r.name) })}"></label>
          <div class="abody">
            <div class="fhead"><b>${esc(r.name)}</b>
              ${r.story_approved ? `<span class="tag open">${T("team.onPage")}</span>`
                                 : `<span class="tag">${T("stories.waiting")}</span>`}
              ${r.county ? "" : `<span class="tag">${T("stories.noCounty")}</span>`}</div>
            <div class="fmeta">${esc([r.school, r.county].filter(Boolean).join("・"))}
              → ${esc([r.country, r.city, r.place].filter(Boolean).join("・"))}</div>
            <p class="fquote">${esc(r.quote || "")}</p>
            <p class="fmeta">${esc(r.note || "")}</p>
            <div class="fmeta">${r.story_approved
              ? T("stories.approvedAt", { d: esc(String(r.approved_at || "").slice(0, 10)) })
              : T("stories.updatedAt", { d: esc(String(r.updated_at || "").slice(0, 10)) })}</div>
          </div>
        </div>
      </li>`).join("")}</ul>` : emptyHTML(T("stories.empty"), T("stories.emptyHint"))}`);
}

export function resListHTML(items, canEdit, msg, isPresident, mpItems) {
  const rows = items.map(r => `<li>
    <div class="fhead">
      <b>${esc(r.title)}</b>
      <span class="tag ${r.status === "published" ? "open" : "draft"}">${
        r.status === "published" ? T("res.published") : T("res.draft")}</span>
      <span class="tag">${esc(T((RES_KINDS.find(k => k.v === r.kind) || RES_KINDS[5]).label))}</span>
    </div>
    <div class="fmeta">${esc(r.blurb || T("res.noBlurb"))}</div>
    <div class="fmeta"><a href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">${esc(r.url)}</a></div>
    ${canEdit ? `<div class="row">
      <button class="btn ghost sm" data-act="res-edit" data-id="${esc(r.id)}">${T("common.edit")}</button>
    </div>` : ""}
  </li>`).join("");

  return pageHead(T("res.title"), T("res.lede"),
      canEdit ? [{ act: "res-new", label: T("res.new"), primary: true }] : [])
    + msgHTML(msg)
    + mpLinksHTML(mpItems)
    + (canEdit ? "" : `<div class="note">${T("res.readonly")}</div>`)
    + sectionHTML("", items.length ? `<ul class="flist">${rows}</ul>`
      : emptyHTML(T("res.empty"), T("res.emptyHint"),
                  canEdit ? { act: "res-new", label: T("res.new") } : null));
}

export function resEditHTML(r, msg, busy) {
  const cur = r || { title: "", blurb: "", kind: "pdf", url: "", team: "", status: "draft", ord: 100 };
  return pageHead(r ? T("res.editTitle") : T("res.newTitle"), "", [], { act: "res-back", label: T("res.back") })
    + msgHTML(msg)
    + sectionHTML("", `<label><i>${T("res.name")}</i><input id="rtitle" value="${esc(cur.title)}" placeholder="${esc(T("res.namePh"))}"></label>
    <!-- ⚠ 介紹是**搜尋引擎唯一看得到的東西**（連結那一欄要登入才讀得到）。
         所以這一格要寫得像一句對高中生講的話，不是一行檔名。 -->
    <label><i>${T("res.blurb")}</i>
      <textarea id="rblurb" placeholder="${esc(T("res.blurbPh"))}">${esc(cur.blurb || "")}</textarea></label>
    <div class="two">
      <label><i>${T("res.kind")}</i><select id="rkind">
        ${RES_KINDS.map(k => `<option value="${k.v}"${cur.kind === k.v ? " selected" : ""}>${esc(T(k.label))}</option>`).join("")}
      </select></label>
      <label><i>${T("res.ord")}</i><input id="rord" type="number" value="${esc(String(cur.ord))}"></label>
      <label><i>${T("res.team")}</i><input id="rteam" value="${esc(cur.team || "")}"></label>
      <label><i>${T("res.status")}</i><select id="rstatus">
        <option value="draft"${cur.status === "draft" ? " selected" : ""}>${T("res.draftOpt")}</option>
        <option value="published"${cur.status === "published" ? " selected" : ""}>${T("res.publishedOpt")}</option>
      </select></label>
    </div>
    <label><i>${T("res.url")}</i>
      <input id="rurl" value="${esc(cur.url)}" placeholder="https://..."></label>
    <!-- 這一句是人的流程，不是程式。Drive 的分享權限設錯，網站看不出來，
         而使用者看到的是一頁「你需要存取權」。 -->
    <div class="note">${T("res.urlNote")}</div>
    <div class="form-foot">
      <button class="btn" data-act="res-save" ${busy ? "disabled" : ""}>${busy ? T("common.saving") : T("common.save")}</button>
      <button class="btn ghost" data-act="res-back">${T("common.cancel")}</button>
      ${r ? `<span class="sp"></span><button class="btn quiet danger" data-act="res-del" data-id="${esc(r.id)}">${T("common.delete")}</button>` : ""}
    </div>`);
}

// ═══════════════════════════════════════════════════════════════════════
// 信件文案（2026-09-08）
// ═══════════════════════════════════════════════════════════════════════
// label 與 when 是字典的鍵。
export const MAIL_KINDS = [
  { v: "guardian",  label: "mail.guardian",  when: "mail.guardian.when" },
  { v: "interview", label: "mail.interview", when: "mail.interview.when" },
  { v: "accepted",  label: "mail.accepted",  when: "mail.accepted.when" },
  { v: "rejected",  label: "mail.rejected",  when: "mail.rejected.when" },
  // 2026-10-29 邀請信：五個代換符號 {name} {position} {term} {link} {sender}，不是 {姓名} {活動名稱}。
  { v: "invite",    label: "mail.invite",    when: "mail.invite.when" },
  // 2026-10-31 行銷需求單：兩封，代換符號 {requester} {title} {needed_by} {link} {reply}。
  { v: "request_new",  label: "mail.request_new",  when: "mail.request_new.when" },
  { v: "request_done", label: "mail.request_done", when: "mail.request_done.when" },
];
export const REQUEST_SAMPLE = { requester: "Mei Wu", title: "2027 冬令營報名海報", needed_by: "2026-12-01", link: "https://beyondtaiwannpo.com/admin/#requests/9f2c…", reply: "做好了，檔在 Drive 的 2027 冬令營資料夾。" };
export function fillRequest(text, s) {
  const v = Object.assign({}, REQUEST_SAMPLE, s || {});
  return String(text == null ? "" : text)
    .split("{requester}").join(v.requester).split("{title}").join(v.title).split("{needed_by}").join(v.needed_by)
    .split("{link}").join(v.link).split("{reply}").join(v.reply);
}
// 邀請信預覽用的範例（信裡真的會出現的東西，不跟著後台的語言翻）。
export const INVITE_SAMPLE = { name: "Mei Wu", position: "Director, Curriculum Team", term: "2026-27", link: "https://beyondtaiwannpo.com/app/?invite=bt-a1b2c3d4", sender: "Paul Wang" };
export function fillInvite(text, s) {
  const v = Object.assign({}, INVITE_SAMPLE, s || {});
  return String(text == null ? "" : text)
    .split("{name}").join(v.name).split("{position}").join(v.position).split("{term}").join(v.term)
    .split("{link}").join(v.link).split("{sender}").join(v.sender);
}
const kindOf = v => MAIL_KINDS.find(k => k.v === v) || MAIL_KINDS[0];

// 系統會自己加在每一封信最後面的那一段。**這裡只是把它顯示出來，不能改。**
// 「不要回覆這封信」是必要資訊不是禮貌用語 —— noreply 沒有 MX，
// 按回覆會被退回，而那個人只會覺得沒有人理他。
// ⚠ 這是真的會寄出去的那一段，信是寄給台灣的學生與家長的，所以**不跟著後台的語言翻**。
export function mailTail(kind) {
  return kind === "guardian"
    ? "這封信是告知，不需要回覆或簽名。有任何問題請寄到 beyondtaiwan2020@gmail.com。\n\nBeyond Taiwan"
    : "不要回覆這封信，這個信箱沒有人看。有問題請寄到 beyondtaiwan2020@gmail.com。\n\nBeyond Taiwan";
}

// 代換。**跟資料庫那一支 mail_fill() 是同一套規則**，
// 兩邊不一致的話預覽就會騙人 —— 而預覽騙人比沒有預覽糟。
export function fillMail(text, name, title) {
  return String(text == null ? "" : text)
    .split("{姓名}").join(name)
    .split("{活動名稱}").join(title);
}

export function mailListHTML(items, msg) {
  return pageHead(T("mail.title"), T("mail.lede"))
    + msgHTML(msg)
    + sectionHTML("", `<ul class="flist">${MAIL_KINDS.map(k => {
      const t = items.find(x => x.kind === k.v);
      return `<li>
        <div class="fhead"><b>${esc(T(k.label))}</b></div>
        <div class="fmeta">${esc(T("mail.whenList", { when: T(k.when) }))}</div>
        <div class="fmeta">${T("mail.subject", { s: esc((t && t.subject) || T("mail.noSubject")) })}</div>
        <div class="row">
          <button class="btn ghost sm" data-act="mail-edit" data-k="${esc(k.v)}">${T("mail.editThis")}</button>
        </div>
      </li>`;
    }).join("")}</ul>`);
}

// 編輯一封信。**左邊改、右邊就是寄出去的樣子。**
// 這一頁的價值在預覽：代換符號打錯不會壞掉，只會空著，
// 而預覽是唯一會當場讓人看到「我把 {姓名} 打成 {名字} 了」的東西。
// 範例的名字與活動名稱、面試那一段加的連結文字，都是信裡真的會出現的中文，不跟著後台的語言翻。
export function mailEditHTML(kind, t, msg, busy) {
  const k = kindOf(kind);
  const NAME = "陳小安", TITLE = "2027 暑期探索營";
  const subject = t ? t.subject : "";
  const body = t ? t.body : "";
  const extra = kind === "interview" ? "\n\n請從這個連結挑一個你方便的時段：\nhttps://cal.com/..." : "";
  const isInvite = kind === "invite", isRequest = kind.startsWith("request_");
  const fill = s => isInvite ? fillInvite(s) : isRequest ? fillRequest(s) : fillMail(s, NAME, TITLE);
  return pageHead(esc(T(k.label)), esc(T("mail.editLede", { when: T(k.when) })), [], { act: "mail-back", label: T("mail.back") })
    + msgHTML(msg)
    + `<div class="cols">` + sectionHTML("", `<label><i>${T("mail.subjectLabel")}</i><input id="msub" value="${esc(subject)}"></label>
    <label><i>${T("mail.body")}</i><textarea id="mbody" style="min-height:230px">${esc(body)}</textarea></label>
    <div class="mini" style="margin:-6px 0 14px">
      ${isInvite ? T("mail.varsInvite") : isRequest ? T("mail.varsRequest") : T("mail.vars")}</div>

    <div class="form-foot">
      <button class="btn" data-act="mail-save" data-k="${esc(kind)}" ${busy ? "disabled" : ""}>${
        busy ? T("common.saving") : T("common.save")}</button>
    </div>`)
    + sectionHTML(T("mail.previewTitle"), `<div class="mini" style="margin-bottom:8px">${isInvite ? T("mail.sampleInvite", { name: esc(INVITE_SAMPLE.name), position: esc(INVITE_SAMPLE.position) }) : isRequest ? T("mail.sampleRequest", { name: esc(REQUEST_SAMPLE.requester), title: esc(REQUEST_SAMPLE.title) }) : T("mail.sample", { name: esc(NAME), title: esc(TITLE) })}</div>
    <div class="mailprev"><b>${esc(fill(subject)) || T("mail.noSubjectPrev")}</b><pre>${
      esc(fill(body) + extra)}</pre><pre class="tail">${esc(mailTail(kind))}</pre></div>
    <div class="mini" style="margin:6px 0 0">
      ${T("mail.tailNote")}</div>`) + `</div>`;
}

// 學員或還沒升級的人走到這裡。**不說「你沒有權限」**：他沒有做錯任何事，只是走錯地方。
export function notCadreHTML() {
  return pageHead(T("notCadre.title"), T("notCadre.lede"), [{ label: T("notCadre.back"), href: "../../app/" }]);
}

// err：資料庫真正回的那一句，印在底下小字。開頁會先自己重試一次（main.js 的 retryBoot），第二次才顯示這一頁。
export function downHTML(err) {
  return pageHead(T("down.title"), T("down.lede"), [{ act: "retry", label: T("common.retry") }])
    + (err ? `<div class="mini">${esc(T("down.detail"))}${esc(err)}</div>` : "");
}
