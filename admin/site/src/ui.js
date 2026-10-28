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
  el.innerHTML = `<span class="toast-k">${opts && opts.tag ? esc(opts.tag) : kind === "err" ? T("msg.err") : T("msg.ok")}</span><span class="toast-t">${esc(msg)}</span>${
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
    toast(T("ver.newer"), { label: T("ver.reload"), fn: () => location.reload() }, { sticky: true, tag: T("ver.tag") });
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
    + sectionHTML("", `${people.length ? `<ul class="flist">${people.map(p => {
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
  const isNew = !r;
  // 2026-11-06 自動儲存：既有的資源改了就存（容器 data-autosave="res-save"，main.js 的 onAutosave 接）。
  // 新的那一筆還沒有 id，留一顆「新增」鈕，建立之後進編輯就自動存。
  // 上架與下架留一顆鈕，不放進自動存：它決定外面看不看得到，不該在打字停頓的那 0.8 秒就發生。新的一筆還是用下拉選。
  const statusCtl = isNew ? `<label><i>${T("res.status")}</i><select id="rstatus" name="status">
        <option value="draft"${cur.status === "draft" ? " selected" : ""}>${T("res.draftOpt")}</option>
        <option value="published"${cur.status === "published" ? " selected" : ""}>${T("res.publishedOpt")}</option>
      </select></label>`
    : `<label><i>${T("res.status")}</i><span class="tag${cur.status === "published" ? " open" : " draft"}">${cur.status === "published" ? T("res.published") : T("res.draft")}</span></label>`;
  const statusBtn = isNew ? "" : `<button class="btn ghost" data-act="res-status" data-id="${esc(r.id)}" data-to="${cur.status === "published" ? "draft" : "published"}"${busy ? " disabled" : ""}>${
          cur.status === "published" ? T("res.unpublish") : T("res.publish")}</button>`;
  const form = `<label><i>${T("res.name")}</i><input id="rtitle" name="title" value="${esc(cur.title)}" placeholder="${esc(T("res.namePh"))}"></label>
    <!-- ⚠ 介紹是**搜尋引擎唯一看得到的東西**（連結那一欄要登入才讀得到）。
         所以這一格要寫得像一句對高中生講的話，不是一行檔名。 -->
    <label><i>${T("res.blurb")}</i>
      <textarea id="rblurb" name="blurb" placeholder="${esc(T("res.blurbPh"))}">${esc(cur.blurb || "")}</textarea></label>
    <div class="two">
      <label><i>${T("res.kind")}</i><select id="rkind" name="kind">
        ${RES_KINDS.map(k => `<option value="${k.v}"${cur.kind === k.v ? " selected" : ""}>${esc(T(k.label))}</option>`).join("")}
      </select></label>
      <label><i>${T("res.ord")}</i><input id="rord" name="ord" type="number" value="${esc(String(cur.ord))}"></label>
      <label><i>${T("res.team")}</i><input id="rteam" name="team" value="${esc(cur.team || "")}"></label>
      ${statusCtl}
    </div>
    <label><i>${T("res.url")}</i>
      <input id="rurl" name="url" value="${esc(cur.url)}" placeholder="https://..."></label>
    <!-- 這一句是人的流程，不是程式。Drive 的分享權限設錯，網站看不出來，
         而使用者看到的是一頁「你需要存取權」。 -->
    <div class="note">${T("res.urlNote")}</div>
    <div class="form-foot">
      ${isNew ? `<button class="btn" data-act="res-save" ${busy ? "disabled" : ""}>${busy ? T("common.saving") : T("res.create")}</button>` : autosaveHint("res-save")}
      ${statusBtn}
      <button class="btn ghost" data-act="res-back">${isNew ? T("common.cancel") : T("res.back")}</button>
      ${r ? `<span class="sp"></span><button class="btn quiet danger" data-act="res-del" data-id="${esc(r.id)}">${T("common.delete")}</button>` : ""}
    </div>`;
  return pageHead(r ? T("res.editTitle") : T("res.newTitle"), "", [], { act: "res-back", label: T("res.back") })
    + msgHTML(msg)
    + sectionHTML("", isNew ? form : `<div data-autosave="res-save" data-id="${esc(r.id)}">${form}</div>`);
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
  // 2026-11-02 會議：兩封，代換符號 {name} {title} {when} {agenda} {doc} {link}。
  { v: "meeting_invite",   label: "mail.meeting_invite",   when: "mail.meeting_invite.when" },
  { v: "meeting_reminder", label: "mail.meeting_reminder", when: "mail.meeting_reminder.when" },
];
export const MEETING_SAMPLE = { name: "Mei Wu", title: "Marketing 週會", when: "2027-03-01 10:00–11:00（Asia/Taipei）", agenda: "海報進度、嘖嘖頁分工", doc: "https://docs.google.com/document/d/…", link: "https://beyondtaiwannpo.com/availability/?meeting=9f2c…" };
export function fillMeeting(text, s) {
  const v = Object.assign({}, MEETING_SAMPLE, s || {});
  return String(text == null ? "" : text)
    .split("{name}").join(v.name).split("{title}").join(v.title).split("{when}").join(v.when)
    .split("{agenda}").join(v.agenda).split("{doc}").join(v.doc).split("{link}").join(v.link);
}
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
// prev = { lang: "zh"|"en", w: 600|375 }（預覽看哪一種語言、多寬）。
export function mailEditHTML(kind, t, msg, busy, prev) {
  const k = kindOf(kind);
  const NAME = "陳小安", TITLE = "2027 暑期探索營";
  // 預覽預設照後台現在的語言看（切成英文的人先看英文版），可以再用 chip 換。
  const pv = Object.assign({ lang: lang() === "en" ? "en" : "zh", w: 600 }, prev || {});
  const subject = t ? t.subject : "";
  const body = t ? t.body : "";
  const subjectEn = (t && t.subject_en) || "", bodyEn = (t && t.body_en) || "";
  const btnZh = (t && t.button_label) || "", btnEn = (t && t.button_label_en) || "";
  const extra = kind === "interview" ? (pv.lang === "en" ? "\n\nPick a time that suits you:\nhttps://cal.com/..." : "\n\n請從這個連結挑一個你方便的時段：\nhttps://cal.com/...") : "";
  const isInvite = kind === "invite", isRequest = kind.startsWith("request_"), isMeeting = kind.startsWith("meeting_");
  const fill = s => isInvite ? fillInvite(s) : isRequest ? fillRequest(s) : isMeeting ? fillMeeting(s) : fillMail(s, NAME, TITLE);
  return pageHead(esc(T(k.label)), esc(T("mail.editLede", { when: T(k.when) })), [], { act: "mail-back", label: T("mail.back") })
    + msgHTML(msg)
    // 2026-11-06 自動儲存：六格都在 data-autosave="mail-save" 的容器裡（data-k 是哪一封），停下來就存，沒有「存起來」鈕了。
    + `<div class="cols">` + sectionHTML("", `<div data-autosave="mail-save" data-k="${esc(kind)}"><label><i>${T("mail.subjectLabel")}</i><input id="msub" name="subject" value="${esc(subject)}"></label>
    <label><i>${T("mail.body")}</i><textarea id="mbody" name="body" style="min-height:230px">${esc(body)}</textarea></label>
    <label><i>${T("mail.button")}</i><input id="mbtn" name="button_label" value="${esc(btnZh)}" placeholder="${esc(mailButtonLabel(kind, "zh"))}"></label>
    <div class="mini" style="margin:-6px 0 14px">
      ${isInvite ? T("mail.varsInvite") : isRequest ? T("mail.varsRequest") : isMeeting ? T("mail.varsMeeting") : T("mail.vars")}</div>
    <details class="fold"><summary><span class="chev" aria-hidden="true"></span><b>${T("mail.enTitle")}</b><span class="mini">${T("mail.enHint")}</span></summary><div class="fold-body">
    <label><i>${T("mail.subjectEn")}</i><input id="msub-en" name="subject_en" value="${esc(subjectEn)}"></label>
    <label><i>${T("mail.bodyEn")}</i><textarea id="mbody-en" name="body_en" style="min-height:180px">${esc(bodyEn)}</textarea></label>
    <label><i>${T("mail.buttonEn")}</i><input id="mbtn-en" name="button_label_en" value="${esc(btnEn)}" placeholder="${esc(mailButtonLabel(kind, "en"))}"></label></div></details>

    <div class="form-foot">
      ${autosaveHint("mail-save")}
    </div></div>`)
    + sectionHTML(T("mail.previewTitle"), `<div class="mini" style="margin-bottom:8px">${isInvite ? T("mail.sampleInvite", { name: esc(INVITE_SAMPLE.name), position: esc(INVITE_SAMPLE.position) }) : isRequest ? T("mail.sampleRequest", { name: esc(REQUEST_SAMPLE.requester), title: esc(REQUEST_SAMPLE.title) }) : isMeeting ? T("mail.sampleMeeting", { name: esc(MEETING_SAMPLE.name), title: esc(MEETING_SAMPLE.title) }) : T("mail.sample", { name: esc(NAME), title: esc(TITLE) })}</div>
    <div class="chips" style="margin-bottom:8px"><button class="chip${pv.lang === "zh" ? " on" : ""}" data-act="mail-prev-lang" data-v="zh">${T("mail.langZh")}</button><button class="chip${pv.lang === "en" ? " on" : ""}" data-act="mail-prev-lang" data-v="en">${T("mail.langEn")}</button><span class="sp"></span><button class="chip${pv.w === 600 ? " on" : ""}" data-act="mail-prev-w" data-v="600">${T("mail.desktop")}</button><button class="chip${pv.w === 375 ? " on" : ""}" data-act="mail-prev-w" data-v="375">${T("mail.phone")}</button></div>
    <iframe class="mailframe" title="${esc(T("mail.previewTitle"))}" style="width:${pv.w}px" srcdoc="${esc(mailHtml({ kind, lang: pv.lang, subject: fill(pv.lang === "en" && subjectEn ? subjectEn : subject), body: fill(pv.lang === "en" && bodyEn ? bodyEn : body) + (pv.lang === "en" ? "" : extra), buttonLabel: pv.lang === "en" ? btnEn : btnZh, buttonUrl: MAIL_SAMPLE_URL[kind] || "https://beyondtaiwannpo.com/apply/" }))}"></iframe>
    <div class="mini" style="margin:6px 0 0">
      ${T("mail.layoutNote")}</div>`) + `</div>`;
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

// ═══════════════════════════════════════════════════════════════════════
// 信長什麼樣（2026-11-05）：純文字包成 HTML 的版型。**跟資料庫的 mail_html() 同一個形狀**（test/mail-layout.test.mjs 比對記號），
// 這一份只給後台的即時預覽；真的寄出去的是資料庫那一份。
// ═══════════════════════════════════════════════════════════════════════
export const MAIL_PHOTOS = { invite: "group-photo.jpg", meeting_invite: "talking-laptop.jpg", meeting_reminder: "talking-laptop.jpg", request_new: "sharing-mic.jpg", request_done: "sharing-mic.jpg", guardian: "hero-listening.jpg", accepted: "three-at-laptop.jpg" };
export const MAIL_BUTTON = {
  invite: { zh: "接受邀請", en: "Accept invitation" }, meeting_invite: { zh: "回覆出席", en: "Reply" }, meeting_reminder: { zh: "回覆出席", en: "Reply" },
  request_new: { zh: "打開需求單", en: "Open request" }, request_done: { zh: "看回覆", en: "Open request" }, interview: { zh: "挑一個時段", en: "Pick a time" },
};
export const MAIL_SAMPLE_URL = {
  invite: "https://beyondtaiwannpo.com/app/?invite=bt-a1b2c3d4", meeting_invite: "https://beyondtaiwannpo.com/availability/?meeting=9f2c…", meeting_reminder: "https://beyondtaiwannpo.com/availability/?meeting=9f2c…",
  request_new: "https://beyondtaiwannpo.com/admin/#requests/9f2c…", request_done: "https://beyondtaiwannpo.com/admin/#request/9f2c…", interview: "https://cal.com/beyondtaiwan/interview",
};
export function mailButtonLabel(kind, lang, custom) {
  if (custom && String(custom).trim()) return String(custom).trim();
  const d = MAIL_BUTTON[kind];
  return d ? d[lang === "en" ? "en" : "zh"] : (lang === "en" ? "Open Beyond Taiwan" : "打開 Beyond Taiwan");
}
export function mailHtml(o) {
  const lang = o.lang === "en" ? "en" : "zh", kind = o.kind || "", url = o.buttonUrl || "";
  const hero = "https://beyondtaiwannpo.com/photos/" + (MAIL_PHOTOS[kind] || "hero-listening.jpg");
  const label = mailButtonLabel(kind, lang, o.buttonLabel);
  const paras = String(o.body || "").split(/\n\s*\n/).map(p => p.trim()).filter(p => p && !(url && p === url))
    .map(p => `<p style="margin:0 0 14px;font-family:Helvetica,Arial,sans-serif;font-size:16px;line-height:1.7;color:#102A86;">${esc(p).replace(/\n/g, "<br>")}</p>`).join("");
  const contact = kind === "guardian"
    ? (lang === "en" ? "This email is for your information; no reply or signature is needed. Questions: beyondtaiwan2020@gmail.com" : "這封信是告知，不需要回覆或簽名。有任何問題請寄到 beyondtaiwan2020@gmail.com。")
    : (lang === "en" ? "Please do not reply to this email; nobody reads this mailbox. Questions: beyondtaiwan2020@gmail.com" : "不要回覆這封信，這個信箱沒有人看。有問題請寄到 beyondtaiwan2020@gmail.com。");
  return `<!doctype html><html lang="${lang === "en" ? "en" : "zh-Hant"}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(o.subject)}</title>`
    + `<style>@media only screen and (max-width:620px){.bt-wrap{width:100%!important}.bt-pad{padding:20px!important}.bt-btn{display:block!important;width:100%!important;box-sizing:border-box!important}}</style>`
    + `</head><body style="margin:0;padding:0;background:#EDE5D8;">`
    + `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#EDE5D8;"><tr><td align="center" style="padding:24px 12px;">`
    + `<table role="presentation" class="bt-wrap" width="600" cellspacing="0" cellpadding="0" border="0" style="width:600px;max-width:600px;background:#FFFFFF;border-radius:16px;overflow:hidden;">`
    + `<tr><td align="left" style="padding:24px 32px 8px;"><img src="https://beyondtaiwannpo.com/shared/logo.png" width="140" alt="Beyond Taiwan" style="display:block;width:140px;height:auto;border:0;"></td></tr>`
    + `<tr><td style="padding:0;"><img src="${hero}" width="600" alt="" style="display:block;width:100%;height:auto;border:0;"></td></tr>`
    + `<tr><td class="bt-pad" style="padding:28px 32px 8px;"><h1 style="margin:0 0 16px;font-family:'Barlow Condensed','Arial Narrow',Arial,sans-serif;font-size:30px;line-height:1.15;font-weight:700;color:#102A86;">${esc(o.subject)}</h1>${paras}</td></tr>`
    + (url ? `<tr><td class="bt-pad" align="left" style="padding:8px 32px 28px;"><a class="bt-btn" href="${esc(url)}" style="display:inline-block;background:#FFC46C;color:#102A86;text-decoration:none;font-family:Helvetica,Arial,sans-serif;font-size:17px;font-weight:700;line-height:48px;height:48px;padding:0 32px;border-radius:999px;">${esc(label)}</a>`
      + `<p style="margin:12px 0 0;font-family:Helvetica,Arial,sans-serif;font-size:12px;line-height:1.5;color:#6B6B6B;word-break:break-all;">${esc(url)}</p></td></tr>` : "")
    + `<tr><td class="bt-pad" style="padding:20px 32px 28px;border-top:1px solid #C6C6C6;font-family:Helvetica,Arial,sans-serif;font-size:12px;line-height:1.6;color:#6B6B6B;">${contact}<br>Beyond Taiwan · beyondtaiwannpo.com</td></tr>`
    + `</table></td></tr></table></body></html>`;
}

// ═══════════════════════════════════════════════════════════════════════
// 歷史之路（2026-11-06，docs/2026-11-05-BT-歷史之路計畫.md 批 1）
// ═══════════════════════════════════════════════════════════════════════
// 清單加一頁一站。一站 = history_milestones 一列加它底下的照片（history_photos）。
// 這一頁填的是內容（中英標題、一句話、說明、日期、代號）與照片（說明、同意）；狀態三顆按鈕跟 Events 同一套。
// 誰能編只是畫面上藏按鈕，**真正的門在資料庫的 can_edit_history()**。
export const HI_WS = "res:Marketing Team";
export const HI_MAX = 1600;
export function hiCanEdit(me) { return senior(me) || wsLevel(me, HI_WS) === "manage"; }
// 代號：年份加英文標題，小寫、連字號、最多 40 字。中文拼不出東西就回空（畫面會要人自己打）。
export function hiSlug(titleEn, happenedOn) {
  const y = /^(\d{4})/.exec(String(happenedOn || ""));
  const t = String(titleEn || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return [y ? y[1] : "", t].filter(Boolean).join("-").slice(0, 40).replace(/-+$/g, "");
}
export const hiSlugOk = s => /^[a-z0-9-]{2,40}$/.test(String(s || ""));
// 縮圖：最長邊縮到 1600，小的不放大，邊長最少 1。
export function hiFit(w, h, max) {
  const m = max || HI_MAX, big = Math.max(w, h);
  if (big <= m) return { w, h };
  const r = m / big;
  return { w: Math.max(1, Math.round(w * r)), h: Math.max(1, Math.round(h * r)) };
}
// 選檔先擋一次：只收圖、原檔 25 MB 以內（更大的手機瀏覽器解碼會卡死）。縮完一定在 5 MB 以內（bucket 的上限）。
export const hiFileOk = f => !!f && /^image\//.test(String(f.type || "")) && Number(f.size || 0) <= 25 * 1024 * 1024;
export const hiTitle = m => (lang() === "zh" ? (m.title_zh || m.title_en) : (m.title_en || m.title_zh)) || m.slug || "";
// 上下移：回一整串新順序的 id（交給 reorder_milestones）；動不了回 null。
export function hiMove(rows, id, dir) {
  const ids = (rows || []).map(r => r.id);
  const i = ids.indexOf(id); if (i < 0) return null;
  const j = dir === "up" ? i - 1 : i + 1;
  if (j < 0 || j >= ids.length) return null;
  [ids[i], ids[j]] = [ids[j], ids[i]];
  return ids;
}
// 資料庫回的巢狀欄位 history_photos 整成 photos，站照 sort 排、照片照 sort 排。
export function hiRows(data) {
  return (data || []).map(r => { const { history_photos, ...m } = r; m.photos = [...(history_photos || [])].sort((a, b) => (a.sort || 0) - (b.sort || 0)); return m; })
    .sort((a, b) => (a.sort || 0) - (b.sort || 0) || String(a.happened_on || "").localeCompare(String(b.happened_on || "")));
}
export const hiNoConsent = m => ((m && m.photos) || []).filter(p => !p.consent).length;
export const hiConsentOk = m => hiNoConsent(m) === 0;
const hiTag = st => `<span class="tag${st === "published" ? " open" : st === "ready" ? " warn" : st === "archived" ? "" : " draft"}">${esc(T("hi.st." + st))}</span>`;
// 清單：每一站一列（日期、標題、狀態、幾張照片、幾張沒勾同意）；能編的人有上下移與「加一站」。
export function historyListHTML(rows, me, msg, busy) {
  const can = hiCanEdit(me);
  const list = rows || [];
  const row = (m, i) => { const n = (m.photos || []).length, nc = hiNoConsent(m);
    return `<li><div class="fhead"><b><a href="#history/${esc(m.id)}" data-act="hi-open" data-id="${esc(m.id)}">${esc(hiTitle(m))}</a></b> ${hiTag(m.status)}</div>
      <div class="fmeta">${esc(m.happened_on || "")}・${n ? esc(T("hi.photos", { n })) : T("hi.noPhotos")}${nc ? `・<span class="hi-warn">${esc(T("hi.noConsentN", { n: nc }))}</span>` : ""}</div>
      ${can ? `<div class="row"><button class="btn ghost sm" data-act="hi-move" data-id="${esc(m.id)}" data-dir="up"${i === 0 || busy ? " disabled" : ""}>↑ ${T("hi.up")}</button><button class="btn ghost sm" data-act="hi-move" data-id="${esc(m.id)}" data-dir="down"${i === list.length - 1 || busy ? " disabled" : ""}>↓ ${T("hi.down")}</button></div>` : ""}</li>`; };
  return pageHead(T("hi.title"), T("hi.lede"), can ? [{ act: "hi-new", label: T("hi.new"), primary: true }] : [])
    + msgHTML(msg)
    + (can ? "" : `<div class="note">${T("hi.readonly")}</div>`)
    + sectionHTML("", list.length ? `<ol class="flist hi-list">${list.map(row).join("")}</ol>` : emptyHTML(T("hi.none"), T("hi.noneHint"), can ? { act: "hi-new", label: T("hi.new") } : null));
}
// 一站：m 是那一列（null 是新的一站）；up 是上傳中的 { pct, name }。
export function historyEditHTML(m, me, msg, busy, up) {
  const can = hiCanEdit(me), sen = senior(me), dis = busy ? " disabled" : "", ro = can ? "" : " readonly";
  const v = Object.assign({ id: "", slug: "", happened_on: "", title_zh: "", title_en: "", summary_zh: "", summary_en: "", body_zh: "", body_en: "", status: "draft", photos: [] }, m || {});
  const isNew = !v.id, st = v.status, nc = hiNoConsent(v);
  const statusLine = st === "published" ? T("hi.stLine.published") : st === "ready" ? T("hi.stLine.ready") : st === "archived" ? T("hi.stLine.archived") : T("hi.stLine.draft");
  const keys = isNew ? "" : sectionHTML(T("hi.status"), `<div class="note">${statusLine}</div>
      ${nc ? `<div class="msg err" role="status"><span class="msg-k">${T("msg.err")}</span><span>${esc(T("hi.consentBlock", { n: nc }))}</span></div>` : ""}
      <div class="row">
      ${(st === "draft" || st === "archived") && can ? `<button class="btn" data-act="hi-ready" data-id="${esc(v.id)}"${nc || busy ? " disabled" : ""}>${T("hi.ready")}</button>` : ""}
      ${st === "ready" && can ? `<button class="btn ghost" data-act="hi-unready" data-id="${esc(v.id)}"${dis}>${T("hi.unready")}</button>` : ""}
      ${st === "ready" && sen ? `<button class="btn" data-act="hi-publish" data-id="${esc(v.id)}"${dis}>${T("hi.publish")}</button>` : ""}
      ${st === "ready" && !sen ? `<span class="mini">${T("hi.waitSenior")}</span>` : ""}
      ${st === "published" && sen ? `<button class="btn ghost" data-act="hi-unpublish" data-id="${esc(v.id)}"${dis}>${T("hi.unpublish")}</button>` : ""}
      ${st === "published" ? `<a class="btn ghost sm" href="/history/#${esc(v.slug)}" target="_blank" rel="noopener">${T("hi.seePublic")}</a>` : ""}
    </div>`);
  // 2026-11-06 自動儲存：既有的一站八格在 data-autosave="hi-save" 的容器裡，改了就存；新的一站還沒有 id，
  // 留一顆「存起來」鈕（存過才有 id 可以掛照片，那句提示只在這裡）。不能編的人看到的是唯讀，沒有容器。
  const fields = `<div class="two">
      <label><i>${T("hi.titleZh")}</i><input id="hi-tzh" name="title_zh" value="${esc(v.title_zh)}"${ro}${dis}></label>
      <label><i>${T("hi.titleEn")}</i><input id="hi-ten" name="title_en" value="${esc(v.title_en)}"${ro}${dis}></label>
      <label><i>${T("hi.sumZh")}</i><input id="hi-szh" name="summary_zh" value="${esc(v.summary_zh)}"${ro}${dis}></label>
      <label><i>${T("hi.sumEn")}</i><input id="hi-sen" name="summary_en" value="${esc(v.summary_en)}"${ro}${dis}></label>
      <label class="wide"><i>${T("hi.bodyZh")}</i><textarea id="hi-bzh" name="body_zh" style="min-height:120px"${ro}${dis}>${esc(v.body_zh)}</textarea></label>
      <label class="wide"><i>${T("hi.bodyEn")}</i><textarea id="hi-ben" name="body_en" style="min-height:120px"${ro}${dis}>${esc(v.body_en)}</textarea></label>
      <label><i>${T("hi.date")}</i><input id="hi-date" name="happened_on" type="date" value="${esc(v.happened_on)}"${ro}${dis}><span class="mini">${T("hi.dateNote")}</span></label>
      <label><i>${T("hi.slug")}</i><input id="hi-slug" name="slug" value="${esc(v.slug)}" placeholder="2023-first-bootcamp" autocomplete="off"${ro}${dis}><span class="mini">${T("hi.slugNote")}</span></label>
    </div>
    ${can ? `<div class="form-foot">${isNew ? `<button class="btn" data-act="hi-save" data-id=""${dis}>${busy ? T("common.saving") : T("common.save")}</button><span class="mini">${T("hi.saveFirst")}</span>` : autosaveHint("hi-save")}</div>` : ""}`;
  const content = sectionHTML(T("hi.content"), can && !isNew ? `<div data-autosave="hi-save" data-id="${esc(v.id)}">${fields}</div>` : fields);
  // 照片說明兩格也是改了就存（data-autosave="hi-ph-save"，data-id 是那張照片）。同意勾選本來就是勾了就送（main.js 接 change），
  // 標 data-noauto 讓自動儲存不再送第二次。刪掉這張留鈕。
  const photoCard = p => `<li class="hi-photo">
      <img src="${esc(p.url)}" alt="" loading="lazy">
      <div class="hi-photo-f"${can ? ` data-autosave="hi-ph-save" data-id="${esc(p.id)}"` : ""}>
        <label><i>${T("hi.capZh")}</i><input id="hi-ph-czh-${esc(p.id)}" name="caption_zh" value="${esc(p.caption_zh || "")}"${ro}${dis}></label>
        <label><i>${T("hi.capEn")}</i><input id="hi-ph-cen-${esc(p.id)}" name="caption_en" value="${esc(p.caption_en || "")}"${ro}${dis}></label>
        <label class="check"><input type="checkbox" data-act="hi-ph-consent" data-noauto="1" data-id="${esc(p.id)}"${p.consent ? " checked" : ""}${can ? "" : " disabled"}${dis}><span>${T("hi.consent")}</span></label>
        ${can ? `<div class="row">${autosaveHint("hi-ph-save")}<button class="btn quiet danger sm" data-act="hi-ph-del" data-id="${esc(p.id)}"${dis}>${T("hi.delPhoto")}</button></div>` : ""}
      </div></li>`;
  const photos = isNew ? "" : sectionHTML(`${T("hi.photosSec")}<span class="hint">${(v.photos || []).length}</span>`, `<div class="note">${T("hi.photoNote")}</div>
      ${(v.photos || []).length ? `<ul class="hi-photos">${v.photos.map(photoCard).join("")}</ul>` : ""}
      ${can ? (up ? `<div class="hi-up"><progress value="${esc(String(up.pct || 0))}" max="100"></progress> <span class="mini">${esc(up.n > 1 ? T("hi.uploadingN", { name: up.name || "", i: up.i || 1, n: up.n }) : T("hi.uploading", { name: up.name || "" }))}</span></div>`
        : `<label class="hi-upload"><i>${T("hi.upload")}</i><input type="file" id="hi-file" accept="image/*" multiple data-id="${esc(v.id)}"${dis}></label>`) : ""}`);
  return pageHead(isNew ? T("hi.newTitle") : esc(hiTitle(v)), isNew ? "" : `${esc(v.happened_on || "")}・${esc(v.slug)}`, [], { act: "hi-back", label: T("hi.back") })
    + msgHTML(msg) + keys + content + photos;
}
