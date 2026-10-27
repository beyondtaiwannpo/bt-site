// 後台「護照」那一組的畫面：實習護照的屆別與格子。幹部護照的格子是批 2 的事，到時加在這裡。
// 2026-10-15 從 admin/src/ui.js 原樣搬過來（後台拆成四個資料夾）。
// **esc 是自己的一份**，不從別的資料夾 import。
// 申請管理的畫面。**esc 是自己的一份**，不從別的資料夾 import
//（跟 app/ 與 availability/ 同一條規矩：資料夾之間不互相依賴）。
//
// 2026-10-19 起畫面上的字全部從 ./strings.js 的字典來（T("鍵")），中英兩版並排在那一支裡。
// 這一支只管拼 HTML，不再寫死任何一句給人看的字。怎麼加一句見 README「後台的中英切換」。
import { T, lang, setLang, withLang, isErr } from "./strings.js";
export { T, lang, setLang };
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
  { key: "site",      label: { zh: "對外",     en: "Public site" },  href: "/admin/site/",      who: "cadre",        hint: { zh: "資源、團隊頁、校友頁、信件文案、歷史之路", en: "Resources, team page, alumni page, email copy, history" } },
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
  // 2026-11-02 會議紀錄：每一位幹部看得到；排會與記會議的門在資料庫（senior 或那個 team 的 Director）。
  { group: "forms",     key: "meetings", label: { zh: "會議",     en: "Meetings" },        who: "cadre" },
  { group: "forms",     key: "request",  label: { zh: "跟 Marketing 提需求", en: "Request from Marketing" }, who: "cadre" },
  { group: "forms",     key: "requests", label: { zh: "行銷需求單", en: "Marketing requests" }, who: "ws:custom:marketing-requests" },
  { group: "site",      key: "res",     label: { zh: "資源",     en: "Resources" },       who: "cadre" },
  { group: "site",      key: "team",    label: { zh: "團隊頁",   en: "Team page" },       who: "senior" },
  { group: "site",      key: "stories", label: { zh: "校友頁",   en: "Alumni page" },     who: "senior" },
  { group: "site",      key: "mail",    label: { zh: "信件文案", en: "Email copy" },      who: "senior" },
  // 2026-11-06 歷史之路：每一位幹部看得到清單；加站、傳照片、按 ready 要 Marketing 資源工作區「管」或 senior，上架只有 senior（門在資料庫）。
  { group: "site",      key: "history", label: { zh: "歷史之路", en: "History" },         who: "cadre" },
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
export function toast(msg, undo, opts) {
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
  if (kind === "ok" && !(opts && opts.sticky)) setTimeout(gone, u ? 9000 : 6000);
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
  bindPrefetch(root);
}
// ── 側欄預取與版本提示（2026-11-06，後台速度）。四份一模一樣（測試逐字比對）。 ──
// 滑過側欄上別的資料夾那一行，就先把那一頁的 HTML 與四支模組抓進快取（<link rel="prefetch">），
// 真的點下去的時候靜態檔已經在本機。#bt-root 不會被換掉（只有裡面的 innerHTML 會），所以監聽掛一次就好。
const PREFETCHED = new Set();
export function prefetchTargets(href) {
  const path = String(href || "").split("#")[0].split("?")[0];
  if (!path || !path.endsWith("/")) return [];
  const v = loadedVersion();
  const q = v ? `?v=${encodeURIComponent(v)}` : "";
  return [path, ...["main", "ui", "data", "strings"].map(m => `${path}src/${m}.js${q}`)];
}
export function bindPrefetch(root) {
  if (!root || typeof document === "undefined" || root.dataset.prefetch === "1") return;
  root.dataset.prefetch = "1";
  const go = e => {
    const a = e.target && e.target.closest ? e.target.closest("a.rail-item[href]") : null;
    if (!a) return;
    for (const u of prefetchTargets(a.getAttribute("href"))) {
      if (PREFETCHED.has(u)) continue;
      PREFETCHED.add(u);
      const l = document.createElement("link"); l.rel = "prefetch"; l.href = u; document.head.appendChild(l);
    }
  };
  root.addEventListener("mouseover", go);
  root.addEventListener("touchstart", go, { passive: true });
}
// ── 自動儲存（2026-11-06，Paul：「希望每一格都像 Workspaces 那一頁一樣，改了就存」）。四份一模一樣（測試逐字比對）。 ──
// 規矩：打字的欄位（text、textarea）停 800 毫秒或離開欄位就存；選的（select、checkbox、radio、date）改了馬上存。
// 存的時候左下角照樣是 toast（存好了／存不起來），欄位旁邊多一個小字「存檔中…／存好了」。
// 存失敗**不重畫**，剛打的字留在格子裡，再改一下就會再存一次。
// 還留著按鈕的只有會「送出去、丟東西、花錢」的動作：上架與下架、標成可以用、移出成員、結束這一屆、刪掉、寄邀請、排會議、上傳。
//
// 怎麼接（每一個表單三步）：
//   1. ui.js：表單的容器加 data-autosave="<act>"（加 data-id 之類的辨識），欄位要有 name；拿掉「存起來」那顆鈕，
//      放 <span class="autosave" data-for="<act>">改了就存</span>（autosaveHint()）。
//   2. main.js：boot 時 UI.bindAutosave(root(), onAutosave) 一次；onAutosave(act, box, field) 讀 UI.formValues(box) 去存。
//   3. 存的時候 UI.autosaveState(box, "saving") → 成功 "saved" 加 toast → 失敗 "failed" 加錯誤 toast，**不 render()**。
export function debounce(fn, ms) {
  let t = null;
  const d = (...a) => { clearTimeout(t); t = setTimeout(() => { t = null; fn(...a); }, ms); };
  d.flush = (...a) => { clearTimeout(t); t = null; fn(...a); };
  d.cancel = () => { clearTimeout(t); t = null; };
  return d;
}
export const AUTOSAVE_MS = 800;
// 這一格要怎麼存："now"（選的）、"typed"（打字的）、null（不在 data-autosave 容器裡、或標了 data-noauto）。
export function saveMode(el) {
  if (!el || !el.closest || !el.closest("[data-autosave]")) return null;
  if (el.dataset && el.dataset.noauto) return null;
  const tag = String(el.tagName || "").toUpperCase(), type = String(el.type || "").toLowerCase();
  if (tag === "SELECT") return "now";
  if (tag === "TEXTAREA") return "typed";
  if (tag !== "INPUT") return null;
  if (["checkbox", "radio", "date", "time", "datetime-local", "month", "week", "color", "range", "number"].includes(type)) return "now";
  if (["button", "submit", "file", "hidden", "reset", "image"].includes(type)) return null;
  return "typed";
}
// 記每一格最後存成功的值，一樣就不再送一次（離開欄位又停 800 毫秒會觸發兩次）。
export function dirtyTracker() {
  const last = new Map();
  return {
    changed: (key, value) => !last.has(key) || last.get(key) !== value,
    mark: (key, value) => { last.set(key, value); },
    forget: key => { last.delete(key); },
  };
}
// 容器裡每一格讀成 { name: value }：文字去頭尾空白、checkbox 是布林、radio 取選到的、沒有 name 的不讀。
export function formValues(box) {
  const out = {};
  for (const f of box.querySelectorAll("input, select, textarea")) {
    const name = f.name || (f.dataset && f.dataset.name) || "";
    if (!name) continue;
    const type = String(f.type || "").toLowerCase();
    if (type === "checkbox") out[name] = !!f.checked;
    else if (type === "radio") { if (f.checked) out[name] = f.value; else if (!(name in out)) out[name] = out[name]; }
    else out[name] = typeof f.value === "string" ? f.value.trim() : f.value;
  }
  for (const k of Object.keys(out)) if (out[k] === undefined) delete out[k];
  return out;
}
export function autosaveHint(act, extra) { return `<span class="autosave" data-for="${esc(act)}"${extra ? ` ${extra}` : ""}>${esc(T("auto.hint"))}</span>`; }
// 欄位旁邊那個小字：saving → 「存檔中…」、saved → 「存好了」（兩秒後回到「改了就存」）、failed → 「沒存進去…」。
export function autosaveState(box, state) {
  if (!box || !box.querySelector) return;
  const el = box.querySelector(".autosave");
  if (!el) return;
  clearTimeout(el._t);
  el.classList.remove("saving", "saved", "failed");
  if (state === "saving") { el.classList.add("saving"); el.textContent = T("auto.saving"); }
  else if (state === "saved") { el.classList.add("saved"); el.textContent = T("auto.saved"); el._t = setTimeout(() => { el.classList.remove("saved"); el.textContent = T("auto.hint"); }, 2000); }
  else if (state === "failed") { el.classList.add("failed"); el.textContent = T("auto.failed"); }
  else el.textContent = T("auto.hint");
}
// 掛一次在 #bt-root 上（它不會被換掉，裡面的 innerHTML 才會）。onSave(act, box, field) 回 Promise。
// 同一個容器一次只跑一個存檔；跑的時候又改了，跑完再存一次（不丟掉後面那一次改動）。
export function bindAutosave(root, onSave) {
  if (!root || typeof document === "undefined" || root.dataset.autosave === "1") return;
  root.dataset.autosave = "1";
  const timers = new Map(), running = new Map(), again = new Map();
  const run = async (box, field) => {
    const act = box.dataset.autosave;
    if (running.get(box)) { again.set(box, field); return; }
    running.set(box, true);
    try { await onSave(act, box, field); }
    finally {
      running.delete(box);
      const f = again.get(box);
      if (f) { again.delete(box); run(box, f); }
    }
  };
  const schedule = (field, now) => {
    const box = field.closest("[data-autosave]");
    if (!box) return;
    let d = timers.get(box);
    if (!d) { d = debounce(f => run(box, f), AUTOSAVE_MS); timers.set(box, d); }
    if (now) d.flush(field); else d(field);
  };
  root.addEventListener("input", e => { const m = saveMode(e.target); if (m === "typed") schedule(e.target, false); });
  root.addEventListener("change", e => { const m = saveMode(e.target); if (m === "now") schedule(e.target, true); else if (m === "typed") schedule(e.target, true); });
  root.addEventListener("focusout", e => { const m = saveMode(e.target); if (m === "typed") { const d = timers.get(e.target.closest("[data-autosave]")); if (d) d.flush(e.target); } });
}
// 這一頁載進來的版本：index.html 的 <meta name="bt-version">，scripts/bump-version.sh 會一起改。
export function loadedVersion() {
  const m = typeof document !== "undefined" ? document.querySelector('meta[name="bt-version"]') : null;
  return m ? String(m.content || "") : "";
}
export function versionDiffers(loaded, live) { return !!loaded && !!live && String(loaded) !== String(live); }
// 開頁問一次線上的 version.json（cache: no-store，繞過 GitHub Pages 的 10 分鐘快取）。
// 跟載進來的不一樣就在左下角掛一條「有新版本，重新整理」，不會自己消失。讀不到就不提，不是錯。
export async function checkVersion(rootUrl) {
  if (typeof fetch === "undefined") return false;
  try {
    const r = await fetch(`${rootUrl}version.json`, { cache: "no-store" });
    if (!r.ok) return false;
    const j = await r.json();
    if (!versionDiffers(loadedVersion(), j && j.v)) return false;
    toast(T("ver.newer"), { label: T("ver.reload"), fn: () => location.reload() }, { sticky: true });
    return true;
  } catch (e) { return false; }
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
// all = true 的時候 Co-President 與 Senior Adviser 也列（會議的出席名單要勾得到他們；工作區那種「靠職級就有」的才不列）。
export function pkCandidates(people, inIds, all) {
  const inWs = new Set(inIds || []);
  return (people || []).filter(p => p && p.id && !inWs.has(p.id) && (all || !["president", "senior_adviser"].includes(p.board_role)));
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
export function pkPicked(people, inIds, pk, all) { const ok = new Set(pkCandidates(people, inIds, all).map(p => p.id)); return ((pk && pk.ticked) || []).filter(id => ok.has(id)); }
// 一個事件（打字、勾、換等級、按 chip、全勾、全取消）之後 pk 變成什麼。純函式，四個 main.js 都只呼叫它。
export function pkReduce(pk, people, inIds, el, all) {
  const a = el && el.dataset ? el.dataset.act : "";
  const p0 = Object.assign({ q: "", mq: "", teams: [], ticked: [], level: "view" }, pk || {});
  if (a === "pk-q") return Object.assign(p0, { q: el.value });
  if (a === "pk-mq") return Object.assign(p0, { mq: el.value });
  if (a === "pk-untick") return Object.assign(p0, { ticked: pkToggle(p0, el.dataset.id, false) });
  if (a === "pk-level") return Object.assign(p0, { level: el.value });
  if (a === "pk-tick") return Object.assign(p0, { ticked: pkToggle(p0, el.value, !!el.checked) });
  if (a === "pk-team") { const t = el.dataset.team; return Object.assign(p0, { teams: p0.teams.includes(t) ? p0.teams.filter(x => x !== t) : p0.teams.concat(t) }); }
  if (a === "pk-all") return Object.assign(p0, { ticked: pkTickAll(p0, pkShown(pkCandidates(people, inIds, all), p0)) });
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
    const picked = pkPicked(people, [], pk, o.all).map(id => byId[id]).filter(Boolean);
    left = { n: picked.length, title: o.titleLeft ? o.titleLeft(picked.length) : T("ma.willAdd", { n: picked.length }),
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
  const cands = pkCandidates(people, inIds, o.all);
  const shown = pkShown(cands, pk);
  const ticked = new Set(pk.ticked);
  const n = o.draft ? 0 : pkPicked(people, inIds, pk, o.all).length;
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
  return ITEMS.filter(i => i.group === "passports" && i.key !== "home" && canSee(i, me))
    .map(i => `<a class="rail-item${i.key === tab ? " on" : ""}" href="#${i.key}" data-act="tab" data-t="${i.key}">${esc(T(i.label))}</a>`).join("");
}


// 只有 Internship team 的幹部與 Co-President 進得來。別的幹部看到這一句，不是錯誤畫面。
export function noAccessHTML(me) {
  return pageHead(T("noAccess.title"), T("noAccess.lede"), [{ label: T("noAccess.back"), href: withLang("../") }]);
}

// 學員或還沒升級的人走到這裡。
// **不說「你沒有權限」**：他沒有做錯任何事，只是走錯地方。
// ═══════════════════════════════════════════════════════════════════════
// 實習護照的後台（2026-10-18）：Internship team 自己改格子、開新的一屆。
// 之前要去 Supabase 的 Table Editor，那等於叫每年換屆的 Director 去碰資料庫。
// 寫入全部走資料庫的函式（門在那裡），這一頁只是表單。
// **每一個動作都要在畫面上有回饋**（Paul 2026-10-17）：按下去變「存檔中…」、
// 成功有一句、失敗說錯在哪、會丟東西的先問一次。
// ═══════════════════════════════════════════════════════════════════════
// label 與 hint 是字典的鍵，畫的時候才 T()。
export const INTERN_CATS = [
  { v: "onboard", label: "cat.onboard", hint: "cat.onboard.hint" },
  { v: "project", label: "cat.project", hint: "cat.project.hint" },
  { v: "reflect", label: "cat.reflect", hint: "cat.reflect.hint" },
];
const internCatOf = v => INTERN_CATS.find(c => c.v === v) || { v, label: { zh: v, en: v }, hint: { zh: "", en: "" } };

// 新格子的代號：T 加屆別的四個數字加流水號。例如 2026-27 的第 10 格是 T2627-10。
// 只是建議值，人可以改。
export function suggestTaskId(termId, tasks) {
  const digits = String(termId || "").replace(/[^0-9]/g, "");
  const prefix = "T" + (digits.slice(2, 4) + digits.slice(-2) || "XX") + "-";
  const used = (tasks || []).filter(t => t.term === termId).length;
  for (let n = used + 1; n < 1000; n++) {
    const id = prefix + String(n).padStart(2, "0");
    if (!(tasks || []).some(t => t.id === id)) return id;
  }
  return prefix + "01";
}

// 主畫面：屆別一區、目前選的那一屆的格子一區。
// data = { terms, tasks, stamped, interns }，sel = 正在看哪一屆的 id。
// isPresident 要傳進來：分頁列上 Co-President 才有的那四個分頁靠它畫。
// 2026-10-18 端對端測試抓到：寫死 false 的話，Co-President 一進實習護照分頁，
// 邀請碼那幾個分頁就不見了，要重新整理才回得去。
export function internAdminHTML(data, sel, msg, busy, isPresident, previewCat, mpItems) {
  const terms = data.terms || [];
  const cur = terms.find(t => t.id === sel) || terms.find(t => t.active) || terms[0] || null;
  const tasks = (data.tasks || []).filter(t => cur && t.term === cur.id);
  const dis = busy ? " disabled" : "";
  const termRows = terms.map(t => `<li>
    <div class="fhead"><b>${esc(t.title_zh)}</b>
      <span class="tag">${esc(t.id)}</span>
      ${t.active ? `<span class="tag open">${T("it.current")}</span>` : ""}
      ${cur && cur.id === t.id ? `<span class="tag">${T("it.viewing")}</span>` : ""}</div>
    <div class="fmeta">${T("it.meta", { en: esc(t.title_en), from: esc(String(t.starts_on)), to: esc(String(t.ends_on)),
      n: (data.tasks || []).filter(x => x.term === t.id && x.active).length })}</div>
    <div class="row">
      ${cur && cur.id === t.id ? "" : `<button class="btn ghost sm" data-act="intern-see" data-id="${esc(t.id)}"${dis}>${T("it.see")}</button>`}
      <button class="btn ghost sm" data-act="intern-term-edit" data-id="${esc(t.id)}"${dis}>${T("it.edit")}</button>
      ${t.active ? "" : `<button class="btn ghost sm" data-act="intern-term-activate" data-id="${esc(t.id)}"${dis}>${T("it.activate")}</button>`}
    </div>
  </li>`).join("");

  const byCat = INTERN_CATS.map(c => ({ c, rows: tasks.filter(t => t.category === c.v) }))
    .concat([{ c: { v: "?", label: "cat.unknown", hint: { zh: "", en: "" } }, rows: tasks.filter(t => !INTERN_CATS.some(c => c.v === t.category)) }])
    .filter(g => g.rows.length);
  const taskRows = byCat.map(g => `<h3 class="sec-h" style="margin-top:18px">${esc(T(g.c.label))}<span class="mini">${esc(T(g.c.hint))}</span>
      ${g.c.v === "?" ? "" : `<button class="btn quiet sm" data-act="ipreview" data-cat="${esc(g.c.v)}">${T("ik.preview")}</button>`}</h3>
    <ul class="flist">${g.rows.map(t => {
      const n = (data.stamped || {})[t.id] || 0;
      return `<li>
      <div class="fhead"><b>${esc(t.title_zh)}</b>
        <span class="tag">${esc(t.id)}</span>
        ${t.active ? "" : `<span class="tag draft">${T("ik.off")}</span>`}
        <span class="tag">${n ? T("ik.stamped", { n }) : T("ik.noStamps")}</span></div>
      <div class="fmeta">${esc(t.title_en)}${t.description ? "・" + esc(t.description) : ""}・${T("ik.seq", { n: esc(String(t.seq)) })}</div>
      <div class="row">
        <button class="btn ghost sm" data-act="intern-task-edit" data-id="${esc(t.id)}"${dis}>${T("common.edit")}</button>
        ${t.active
          ? `<button class="btn ghost sm" data-act="intern-task-off" data-id="${esc(t.id)}"${dis}>${T("ik.disable")}</button>`
          : `<button class="btn ghost sm" data-act="intern-task-on" data-id="${esc(t.id)}"${dis}>${T("ik.enable")}</button>`}
        ${n ? "" : `<button class="btn quiet danger sm" data-act="intern-task-del" data-id="${esc(t.id)}"${dis}>${T("common.delete")}</button>`}
      </div>
    </li>`; }).join("")}</ul>`).join("");

  const headActs = [{ act: "ipreview", label: T("ik.preview") }];
  if (cur) headActs.unshift({ act: "intern-task-new", label: T("ik.new"), primary: true, disabled: busy });
  return pageHead(T("it.title"), T("it.lede", { n: data.interns || 0 }), headActs)
    + msgHTML(msg)
    + mpLinksHTML(mpItems)
    + internPreviewHTML(previewCat, cur ? !!cur.active : true)
    + sectionHTML(T("it.terms"), `${terms.length ? `<ul class="flist">${termRows}</ul>` : emptyHTML(T("it.empty"), T("it.emptyHint"), { act: "intern-term-new", label: T("it.new") })}
    ${terms.length ? `<div class="row" style="margin:6px 0 0"><button class="btn ghost sm" data-act="intern-term-new"${dis}>${T("it.new")}</button></div>` : ""}`,
      { id: "terms" })
    + sectionHTML(cur ? T("ik.sectionOf", { t: esc(cur.title_zh) }) : T("ik.section"), cur
      ? `<div class="note">${T("ik.note")}</div>
        ${tasks.length ? taskRows : emptyHTML(T("ik.empty"), T("ik.emptyHint"), { act: "intern-task-new", label: T("ik.new") })}`
      : emptyHTML(T("ik.needTerm"), T("ik.needTermHint")),
      { id: "tasks" });
}

// 改或開一屆。id 建了就不能改（格子與護照靠它對應），所以改的時候那一格鎖住。
// draft（2026-10-18 端對端測試抓到的）：存檔被擋之後畫面會重畫，沒有 draft 的話
// 剛填的五格全部洗掉，使用者看到一句錯誤訊息跟一張空表單。畫面上的東西要留在畫面上。
export function internTermEditHTML(t, msg, busy, draft) {
  const cur = draft || t || { id: "", title_zh: "", title_en: "", starts_on: "", ends_on: "" };
  const dis = busy ? " disabled" : "";
  return pageHead(t ? T("it.editTitle") : T("it.newTitle"), "", [], { act: "intern-back", label: T("it.back") })
    + msgHTML(msg)
    + sectionHTML("", `<label><i>${T("it.id")}</i>
      <input id="it-id" value="${esc(cur.id)}" placeholder="2027-28"${t ? " disabled" : dis}></label>
    <div class="two">
      <label><i>${T("it.zh")}</i><input id="it-zh" value="${esc(cur.title_zh)}" placeholder="2027-28 實習"${dis}></label>
      <label><i>${T("it.en")}</i><input id="it-en" value="${esc(cur.title_en)}" placeholder="INTERNSHIP 2027-28"${dis}></label>
      <label><i>${T("it.start")}</i><input id="it-start" type="date" value="${esc(String(cur.starts_on || "").slice(0, 10))}"${dis}></label>
      <label><i>${T("it.end")}</i><input id="it-end" type="date" value="${esc(String(cur.ends_on || "").slice(0, 10))}"${dis}></label>
    </div>
    <div class="note">${T("it.note")}</div>
    <div class="form-foot">
      <button class="btn" data-act="intern-term-save"${t ? ` data-id="${esc(t.id)}"` : ""}${dis}>${busy ? T("common.saving") : T("common.save")}</button>
      <button class="btn ghost" data-act="intern-back"${dis}>${T("common.cancel")}</button>
    </div>`);
}

// 改或加一格。id 與屆別建了就不能改。
export function internTaskEditHTML(t, termId, suggestedId, msg, busy, draft) {
  const cur = draft || t || { id: suggestedId || "", term: termId, seq: "", category: "project", title_zh: "", title_en: "", description: "" };
  const dis = busy ? " disabled" : "";
  return pageHead(t ? T("ik.editTitle") : T("ik.newTitle"), T("ik.termLede", { t: esc(cur.term) }), [], { act: "intern-back", label: T("it.back") })
    + msgHTML(msg)
    + sectionHTML("", `<div class="two">
      <label><i>${T("ik.id")}</i>
        <input id="ik-id" value="${esc(cur.id)}"${t ? " disabled" : dis}></label>
      <label><i>${T("ik.cat")}</i><select id="ik-cat"${dis}>
        ${INTERN_CATS.map(c => `<option value="${c.v}"${cur.category === c.v ? " selected" : ""}>${esc(T(c.label))}（${esc(T(c.hint))}）</option>`).join("")}
      </select></label>
      <label><i>${T("ik.zh")}</i><input id="ik-zh" value="${esc(cur.title_zh)}" placeholder="第一個任務" maxlength="30"${dis}></label>
      <label><i>${T("ik.en")}</i><input id="ik-en" value="${esc(cur.title_en)}" placeholder="FIRST TASK" maxlength="30"${dis}></label>
      <label><i>${T("ik.seqLabel")}</i><input id="ik-seq" type="number" value="${esc(String(cur.seq || ""))}" placeholder="10"${dis}></label>
    </div>
    <label><i>${T("ik.desc")}</i>
      <textarea id="ik-desc" placeholder="${esc(T("ik.descPh"))}" maxlength="120"${dis}>${esc(cur.description || "")}</textarea></label>
    <div class="form-foot">
      <button class="btn" data-act="intern-task-save" data-term="${esc(cur.term)}"${t ? ` data-id="${esc(t.id)}"` : ""}${dis}>${busy ? T("common.saving") : T("common.save")}</button>
      <button class="btn ghost" data-act="intern-back"${dis}>${T("common.cancel")}</button>
    </div>`);
}

// ═══════════════════════════════════════════════════════════════════════
// 幹部護照的後台（2026-10-20，批 2）：Co-President 改格子、月份時刻、城市。
// 之前要去 Supabase 的 Table Editor（README「怎麼改活動文案」），那等於叫換屆的人碰資料庫。
// 寫入全部走資料庫的函式（門在那裡），這一頁只是表單。
// 三條不能破的線，畫面與資料庫各擋一次：
//   編號不是輸入框（章靠它對到格子）、蓋過的格子沒有「刪掉」（只有停用）、城市沒有「刪掉」。
// ═══════════════════════════════════════════════════════════════════════
// 跟 passport/src/ui.js 的 CATEGORY 同一組鍵。那邊是給護照本身用的長文案，這裡只要名字。
export const ACT_CATS = [
  { v: "gather", label: "act.gather", hint: "act.gather.hint" },
  { v: "prompt", label: "act.prompt", hint: "act.prompt.hint" },
  { v: "frame",  label: "act.frame",  hint: "act.frame.hint" },
];
const actCatOf = v => ACT_CATS.find(c => c.v === v) || { v, label: { zh: v, en: v }, hint: { zh: "", en: "" } };
// 月份顯示：9 月到隔年 7 月。中文「9 月」，英文 September（字典 month.1 到 month.12）。
export const monthLabel = m => (STRINGS_HAS_MONTH(m) ? T("month." + m) : `${m}`);
const STRINGS_HAS_MONTH = m => Number(m) >= 1 && Number(m) <= 12;

// 主畫面：11 個月各一段（時刻與那個月的格子），最後是城市。
// data = { months, activities, destinations, stamped }。
// 「看它在護照上長什麼樣」（2026-10-16，Paul：改完看不到成品）。
// 用 iframe 把**真的** /passport/ 嵌進來，帶 ?month=N 翻到那一個月。
// 不另外畫一份護照：那會是第二份護照程式碼，改一次要改兩邊，而且畫出來的
// 永遠不會跟真的一模一樣。看到的是登入者自己那本（含自己的章），
// 要看「空白的」就看還沒蓋的格子。previewMonth 是 null 就不畫框。
function previewBoxHTML(title, hint, src, openSrc) {
  return `<div class="preview-wrap" id="passport-preview">
    <div class="fhead" style="margin-bottom:6px"><b>${title}</b>
      <span class="mini">${hint}</span>
      <span style="flex:1"></span>
      <button class="btn quiet sm" data-act="preview-reload">${T("pv.reload")}</button>
      <a class="btn quiet sm" href="${openSrc || src}" target="_blank" rel="noopener">${T("pv.open")}</a>
      <button class="btn quiet sm" data-act="preview-close">${T("pv.close")}</button></div>
    <iframe class="preview-frame" src="${src}" title="${esc(T("pv.frameTitle"))}" loading="lazy"></iframe>
  </div>`;
}

export function passportPreviewHTML(previewMonth) {
  if (previewMonth == null) return "";
  // 框裡帶 &bare=1：那一頁不畫頂欄與分頁列（Paul 2026-10-19 拍板），框裡只有那本護照。
  // 「另開視窗」開的是完整的那一頁，有頂欄。
  const full = `../../passport/?month=${encodeURIComponent(String(previewMonth))}`;
  return previewBoxHTML(T("pv.title", { m: esc(monthLabel(previewMonth)) }), T("pv.hint"), full + "&bare=1", full);
}

// 實習護照的預覽（2026-10-16）。嵌的是 /intern-passport/ 的「樣書」：目前這一屆的格子、假的持照人、沒有章。
// 樣書只畫**目前這一屆**（active 的那一屆），後台正在看別屆時這裡會提醒。
export function internPreviewHTML(cat, viewingActive) {
  if (cat == null) return "";
  const c = INTERN_CATS.find(x => x.v === cat);
  const full = `../../intern-passport/?view=sample${cat ? `&cat=${encodeURIComponent(cat)}` : ""}`;
  const hint = (viewingActive === false ? T("ipv.notActive") : T("ipv.hint"));
  return previewBoxHTML(c ? T("ipv.titleCat", { c: esc(T(c.label)) }) : T("ipv.title"), hint, full + "&bare=1", full);
}

export function passportAdminHTML(data, msg, busy, previewMonth, mpItems) {
  const months = data.months || [];
  const acts = data.activities || [];
  const dis = busy ? " disabled" : "";
  const actRow = a => {
    const n = (data.stamped || {})[a.id] || 0;
    return `<li>
      <div class="fhead"><b>${esc(a.title_zh)}</b>
        <span class="tag">${esc(a.id)}</span>
        <span class="tag">${esc(T(actCatOf(a.category).label))}</span>
        ${a.active ? "" : `<span class="tag draft">${T("ik.off")}</span>`}
        <span class="tag">${n ? T("ik.stamped", { n }) : T("ik.noStamps")}</span>
        ${a.needs_host ? `<span class="tag">${T("ak.needsHost")}</span>` : ""}
        ${a.callback_to ? `<span class="tag">${T("ak.callback", { id: esc(a.callback_to) })}</span>` : ""}</div>
      <div class="fmeta">${esc(a.title_en)}${a.description ? "・" + esc(a.description) : ""}</div>
      <div class="row">
        <button class="btn ghost sm" data-act="act-edit" data-id="${esc(a.id)}"${dis}>${T("common.edit")}</button>
        ${a.active
          ? `<button class="btn ghost sm" data-act="act-off" data-id="${esc(a.id)}"${dis}>${T("ik.disable")}</button>`
          : `<button class="btn ghost sm" data-act="act-on" data-id="${esc(a.id)}"${dis}>${T("ik.enable")}</button>`}
        ${n ? "" : `<button class="btn quiet danger sm" data-act="act-del" data-id="${esc(a.id)}"${dis}>${T("common.delete")}</button>`}
      </div>
    </li>`;
  };
  const monthBlocks = months.map(m => {
    const rows = acts.filter(a => a.month === m.month);
    return sectionHTML(esc(monthLabel(m.month)),
      `${rows.length ? `<ul class="flist">${rows.map(actRow).join("")}</ul>` : `<div class="empty sm">${T("pa.emptyMonth")}</div>`}
      <div class="row" style="margin:4px 0 0"><button class="btn ghost sm" data-act="act-new" data-month="${esc(String(m.month))}"${dis}>${T("pa.addIn", { m: esc(monthLabel(m.month)) })}</button></div>`,
      { id: `m${m.month}`, hint: T("pa.theme", { t: m.theme_zh ? esc(m.theme_zh) : T("pa.themeEmpty") }),
        actions: [{ act: "month-edit", label: T("pa.editTheme"), seq: String(m.seq), disabled: busy },
                  { act: "preview", label: T("pa.preview"), month: String(m.month) }] });
  }).join("");
  const jump = months.length ? `<nav class="jump" aria-label="${esc(T("pa.jump"))}">${months.map(m => `<a href="#m${esc(String(m.month))}">${esc(monthLabel(m.month))}</a>`).join("")}</nav>` : "";
  return pageHead(T("pa.title"), T("pa.lede"))
    + msgHTML(msg)
    + mpLinksHTML(mpItems)
    + `<div class="note">${T("pa.note")}
      ${months.length ? "" : T("pa.noMonths")}</div>`
    + jump
    + passportPreviewHTML(previewMonth, months)
    + (months.length ? monthBlocks : emptyHTML(T("pa.monthsGone"), T("pa.monthsGoneHint")));
}

// 城市（2026-10-19 起自己一頁，側欄「護照 > 城市」）。24 個城市不該跟 33 格擠在同一頁的最底下。
// 入境章抽城市用的。只有停用與恢復，沒有刪：visas 的外鍵本來就擋，後台不給那顆按鈕。
export function citiesHTML(data, msg, busy) {
  const dests = data.destinations || [];
  const dis = busy ? " disabled" : "";
  const rows = dests.map(d => `<tr${d.active ? "" : ' class="off"'}>
    <td class="t-main"><b>${esc(d.city)}</b></td>
    <td><span class="tag">${esc(d.code)}</span></td>
    <td>${d.active ? `<span class="tag open">${T("ct.drawable")}</span>` : `<span class="tag draft">${T("ik.off")}</span>`}</td>
    <td class="t-act">
      <button class="btn quiet sm" data-act="dest-edit" data-code="${esc(d.code)}"${dis}>${T("ct.rename")}</button>
      ${d.active
        ? `<button class="btn quiet sm" data-act="dest-off" data-code="${esc(d.code)}"${dis}>${T("ik.disable")}</button>`
        : `<button class="btn quiet sm" data-act="dest-on" data-code="${esc(d.code)}"${dis}>${T("ik.enable")}</button>`}
    </td>
  </tr>`).join("");
  return pageHead(T("ct.title"), T("ct.lede", { n: dests.length, a: dests.filter(d => d.active).length }),
      [{ act: "dest-new", label: T("ct.new"), primary: true, disabled: busy }])
    + msgHTML(msg)
    + `<div class="note">${T("ct.note")}</div>`
    + sectionHTML("", dests.length
      ? `<table class="table"><thead><tr><th>${T("ct.city")}</th><th>${T("ct.code")}</th><th>${T("ct.status")}</th><th></th></tr></thead><tbody>${rows}</tbody></table>`
      : emptyHTML(T("ct.empty"), T("ct.emptyHint"), { act: "dest-new", label: T("ct.new") }), { id: "cities" });
}

// 改或加一格。編號是標籤不是輸入框；改既有的格子時月份也鎖住。
// draft：存檔被擋之後畫面會重畫，沒有 draft 的話剛填的東西全部洗掉（實習護照那邊 2026-10-18 抓過同一件事）。
export function activityEditHTML(a, month, months, msg, busy, draft) {
  const cur = draft || a || { id: "", month, category: "gather", title_zh: "", title_en: "", description: "", needs_host: false, callback_to: "" };
  const dis = busy ? " disabled" : "";
  const lock = a ? " disabled" : dis;
  return pageHead(a ? T("ak.editTitle") : T("ak.newTitle"), a ? T("ak.idLocked", { id: esc(a.id) }) : T("ak.idAuto"), [], { act: "cadre-back", label: T("ak.back") })
    + msgHTML(msg)
    + sectionHTML("", `<div class="two">
      <label><i>${T("ak.month")}${a ? T("ak.monthLocked") : ""}</i><select id="ak-month"${lock}>
        ${(months || []).map(m => `<option value="${esc(String(m.month))}"${String(cur.month) === String(m.month) ? " selected" : ""}>${esc(monthLabel(m.month))}</option>`).join("")}
      </select></label>
      <label><i>${T("ik.cat")}</i><select id="ak-cat"${dis}>
        ${ACT_CATS.map(c => `<option value="${c.v}"${cur.category === c.v ? " selected" : ""}>${esc(T(c.label))}（${esc(T(c.hint))}）</option>`).join("")}
      </select></label>
      <label><i>${T("ik.zh")}</i><input id="ak-zh" value="${esc(cur.title_zh)}" placeholder="開學電影夜" maxlength="30"${dis}></label>
      <label><i>${T("ik.en")}</i><input id="ak-en" value="${esc(cur.title_en)}" placeholder="OPENING NIGHT" maxlength="30"${dis}></label>
    </div>
    <label><i>${T("ik.desc")}</i>
      <textarea id="ak-desc" placeholder="${esc(T("ak.descPh"))}" maxlength="200"${dis}>${esc(cur.description || "")}</textarea></label>
    <div class="two">
      <label class="check" style="display:flex;gap:10px;align-items:center;font-size:14.5px">
        <input id="ak-host" type="checkbox" style="width:18px;height:18px"${cur.needs_host ? " checked" : ""}${dis}>
        <span>${T("ak.host")}</span></label>
      <label><i>${T("ak.cb")}</i>
        <input id="ak-cb" value="${esc(cur.callback_to || "")}" placeholder="09B" maxlength="4"${dis}></label>
    </div>
    <div class="form-foot">
      <button class="btn" data-act="act-save"${a ? ` data-id="${esc(a.id)}"` : ""}${dis}>${busy ? T("common.saving") : T("common.save")}</button>
      <button class="btn ghost" data-act="cadre-back"${dis}>${T("common.cancel")}</button>
    </div>`);
}

// 改一個月右上角的時刻。seq 與月份不給改，只有那一串字。
export function monthEditHTML(m, msg, busy, draft) {
  const cur = draft || m || { seq: "", month: "", theme_zh: "", theme_en: "" };
  const dis = busy ? " disabled" : "";
  return pageHead(T("mk.title", { m: esc(monthLabel(cur.month)) }), T("mk.lede"), [], { act: "cadre-back", label: T("ak.back") })
    + msgHTML(msg)
    + sectionHTML("", `<div class="two">
      <label><i>${T("mk.zh")}</i><input id="mk-zh" value="${esc(cur.theme_zh || "")}" placeholder="07:00" maxlength="20"${dis}></label>
      <label><i>${T("mk.en")}</i><input id="mk-en" value="${esc(cur.theme_en || "")}" maxlength="40"${dis}></label>
    </div>
    <div class="form-foot">
      <button class="btn" data-act="month-save" data-seq="${esc(String(cur.seq))}"${dis}>${busy ? T("common.saving") : T("common.save")}</button>
      <button class="btn ghost" data-act="cadre-back"${dis}>${T("common.cancel")}</button>
    </div>`);
}

// 加一個城市或改名字。代碼建了就不能改（visas 靠它）。
export function destinationEditHTML(d, msg, busy, draft) {
  const cur = draft || d || { code: "", city: "", active: true };
  const dis = busy ? " disabled" : "";
  return pageHead(d ? T("dk.editTitle") : T("dk.newTitle"), T("dk.lede"), [], { act: "cities-back", label: T("dk.back") })
    + msgHTML(msg)
    + sectionHTML("", `<div class="two">
      <label><i>${T("dk.code", { locked: d ? T("dk.codeLocked") : "" })}</i>
        <input id="dk-code" value="${esc(cur.code)}" placeholder="TPE" maxlength="8"${d ? " disabled" : dis}></label>
      <label><i>${T("dk.city")}</i><input id="dk-city" value="${esc(cur.city)}" placeholder="TAIPEI" maxlength="40"${dis}></label>
    </div>
    <div class="form-foot">
      <button class="btn" data-act="dest-save"${d ? ` data-code="${esc(d.code)}"` : ""} data-active="${cur.active === false ? "0" : "1"}"${dis}>${busy ? T("common.saving") : T("common.save")}</button>
      <button class="btn ghost" data-act="cities-back"${dis}>${T("common.cancel")}</button>
    </div>`);
}

// ═══════════════════════════════════════════════════════════════════════
// 實習護照的蛇梯棋（2026-10-22）：Internship team 排棋盤。
// 資料：board = { term, size, active }，squares = [{ pos, kind, task_id, goes_to }]（空格不列）。
// draft 是畫面上改到一半的：{ size, squares: { "<pos>": { kind, task_id, goes_to } }, dirty }。
// 門在資料庫的 save_board() 與 set_board_active()；畫面上先擋一次（梯子往下、蛇往上）只是少一次來回。
// ═══════════════════════════════════════════════════════════════════════
export const BOARD_SIZES = [20, 30, 40];
export const BOARD_PER_ROW = 5;
// 蛇形排法：第 1 排（最下面）左到右，第 2 排右到左。回傳由上到下的每一排、每一排由左到右的格號。
// **跟 intern-passport/src/ui.js 的 boardRows 同一份規則**（資料夾之間不互相 import），test/intern-board.test.mjs 比對。
export function boardRows(size, perRow) {
  const per = perRow || BOARD_PER_ROW;
  const rows = [];
  for (let start = 1; start <= size; start += per) {
    const row = [];
    for (let p = start; p < start + per && p <= size; p++) row.push(p);
    if (Math.floor((start - 1) / per) % 2 === 1) row.reverse();
    rows.push(row);
  }
  return rows.reverse();
}
// draft 的 squares 轉成 save_board() 要的陣列。空格不送。
export function squaresToList(draft) {
  return Object.entries(draft.squares || {})
    .map(([pos, s]) => ({ pos: Number(pos), kind: s.kind, task_id: s.kind === "task" ? (s.task_id || null) : null,
                          goes_to: (s.kind === "ladder" || s.kind === "snake") ? (s.goes_to == null ? null : Number(s.goes_to)) : null }))
    .filter(s => s.kind && s.kind !== "plain")
    .sort((a, b) => a.pos - b.pos);
}
// 畫面上先擋一次。回傳錯誤訊息的鍵，沒問題回 null。
export function squareProblem(pos, s, size) {
  if (!s || s.kind === "plain") return null;
  if (s.kind === "task") return s.task_id ? null : "err.needTask";
  const g = Number(s.goes_to);
  if (!g || g < 1 || g > size) return "err.goesRange";
  if (s.kind === "ladder" && g <= pos) return "err.ladderUp";
  if (s.kind === "snake" && g >= pos) return "err.snakeDown";
  return null;
}

export function boardAdminHTML(term, tasks, board, draft, sel, msg, busy) {
  if (!term) {
    return pageHead(T("bd.title"), "") + msgHTML(msg) + emptyHTML(T("bd.noTerm"), T("bd.noTermHint"));
  }
  const d = draft || { size: (board && board.size) || 30, squares: {}, dirty: false };
  const size = Number(d.size) || 30;
  const active = !!(board && board.active);
  const dis = busy ? " disabled" : "";
  const sq = d.squares || {};
  const byTask = Object.fromEntries((tasks || []).map(t => [t.id, t]));
  const kindText = (pos, s) => {
    if (!s || s.kind === "plain") return "";
    if (s.kind === "task") return byTask[s.task_id] ? esc(byTask[s.task_id].title_zh || byTask[s.task_id].title_en) : T("bd.kind.task");
    if (s.kind === "ladder") return "↑ " + esc(String(s.goes_to || ""));
    return "↓ " + esc(String(s.goes_to || ""));
  };
  const counts = { ladder: 0, snake: 0, task: 0 };
  for (const s of Object.values(sq)) if (counts[s.kind] != null) counts[s.kind]++;
  const grid = boardRows(size).map(row => row.map(pos => {
    const s = sq[pos];
    const kind = s ? s.kind : "plain";
    const locked = active && (kind === "ladder" || kind === "snake");
    return `<button class="bsq ${kind}${sel === pos ? " on" : ""}${pos === size ? " finish" : ""}${locked ? " off" : ""}" data-act="board-pick" data-pos="${pos}"${locked ? ' aria-disabled="true"' : ""} title="${T("bd.pick", { n: pos })}">
      <span class="n">${pos}${pos === size ? ` ${esc(T("bd.finish"))}` : ""}</span><span class="k">${kindText(pos, s)}</span></button>`;
  }).join("")).join("");
  const cur = sel ? (sq[sel] || { kind: "plain" }) : null;
  const curLocked = cur && active && (cur.kind === "ladder" || cur.kind === "snake");
  const editor = sel ? `<div class="bedit" id="board-edit">
    <h3>${esc(T("bd.pick", { n: sel }))}${sel === size ? ` <span class="tag">${esc(T("bd.finish"))}</span>` : ""}</h3>
    <div class="two">
      <label><i>${esc(T("bd.kind"))}</i><select id="bq-kind"${dis || (curLocked ? " disabled" : "")}>
        ${["plain", "task", "ladder", "snake"].map(k => `<option value="${k}"${cur.kind === k ? " selected" : ""}${active && (k === "ladder" || k === "snake") && cur.kind !== k ? " disabled" : ""}>${esc(T("bd.kind." + k))}</option>`).join("")}
      </select></label>
      <label><i>${esc(T("bd.task"))}</i><select id="bq-task"${dis}>
        <option value="">—</option>
        ${(tasks || []).map(t => `<option value="${esc(t.id)}"${cur.task_id === t.id ? " selected" : ""}>${esc(t.title_zh || t.title_en)} (${esc(t.id)})</option>`).join("")}
      </select></label>
      <label><i>${esc(T("bd.goes"))}</i><input id="bq-goes" type="number" min="1" max="${size}" value="${esc(String(cur.goes_to || ""))}"${dis || (curLocked ? " disabled" : "")}></label>
    </div>
    <div class="row">
      <button class="btn sm" data-act="board-apply" data-pos="${sel}"${dis}>${esc(T("bd.apply"))}</button>
      <button class="btn ghost sm" data-act="board-clear" data-pos="${sel}"${dis || (curLocked ? " disabled" : "")}>${esc(T("bd.clear"))}</button>
    </div>
    ${sel === size ? `<div class="mini" style="margin-top:8px">${esc(T("bd.finishHint"))}</div>` : ""}
  </div>` : `<div class="mini">${esc(T("bd.pickHint"))}</div>`;

  return pageHead(T("bd.title"), T("bd.lede", { t: esc(term.title_zh) }),
      [{ act: "board-save", label: busy ? T("bd.saving") : T("bd.save"), primary: true, disabled: busy },
       { act: "ipreview", label: T("bd.preview") }])
    + msgHTML(msg)
    + `<div class="note">${esc(T("bd.rules"))}</div>`
    + sectionHTML(T("bd.setup"), `<div class="two">
        <label><i>${esc(T("bd.size"))}</i><select id="bd-size"${dis || (active ? " disabled" : "")}>
          ${BOARD_SIZES.map(n => `<option value="${n}"${size === n ? " selected" : ""}>${n}</option>`).join("")}
        </select></label>
        <div>
          <div class="mini" style="margin-bottom:8px">${esc(active ? T("bd.on") : T("bd.off"))}${d.dirty ? ` <span class="tag warn">${esc(T("bd.unsaved"))}</span>` : ""}</div>
          ${board ? `<button class="btn ghost sm" data-act="board-toggle" data-on="${active ? "0" : "1"}"${dis}>${esc(active ? T("bd.turnOff") : T("bd.turnOn"))}</button>` : ""}
        </div>
      </div>`, { id: "board-setup" })
    + sectionHTML(T("bd.layout"), `<div class="bgrid" style="grid-template-columns:repeat(${BOARD_PER_ROW},1fr)">${grid}</div>${editor}`,
        { id: "board-layout", hint: T("bd.layoutHint", { l: counts.ladder, s: counts.snake, k: counts.task }) });
}

export function notCadreHTML() {
  return pageHead(T("notCadre.title"), T("notCadre.lede"), [{ label: T("notCadre.back"), href: "../../app/" }]);
}

// err：資料庫真正回的那一句，印在底下小字。開頁會先自己重試一次（main.js 的 retryBoot），第二次才顯示這一頁。
export function downHTML(err) {
  return pageHead(T("down.title"), T("down.lede"), [{ act: "retry", label: T("common.retry") }])
    + (err ? `<div class="mini">${esc(T("down.detail"))}${esc(err)}</div>` : "");
}
