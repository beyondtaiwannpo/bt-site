// 後台「Marketing」那一組的畫面（2026-11-26）：Instagram 連線（批 1）。之後的批次加成效、大學介紹貼文產生器。
// 前半段（側欄、外殼、回饋、自動儲存、成員區）2026-11-26 從 admin/finance/src/ui.js 原樣抄過來，六份一模一樣（test/admin-hub.test.mjs 逐字比對）。
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

// ── 後台的側欄與外殼 ──────────────────────────────────────────────────
// 2026-11-13 起側欄只有一份：shared/rail.js（原本八個資料夾各抄一份）。
// 這裡只把這個資料夾的語言接上去，畫面函式照舊叫 railHTML / shellHTML。
import * as RAIL from "../../../shared/rail.js";
export const { GROUPS, ITEMS, AREAS, SECTIONS, wsLevel, canEditWs, canEditAny, canEnter, canSee, railBefore, railAfter } = RAIL;
const senior = RAIL.senior;
export const boardName = board => RAIL.boardName(board, lang());
export function langSwitchHTML() { return RAIL.langSwitchHTML(lang()); }
// railHTML 先算好「這一區的分頁」那一排，shellHTML 把它放在內容最上面（兩支在同一次 render 裡先後被叫）。
let tabsNext = "";
export function railHTML(group, tab, me, counts) { tabsNext = RAIL.areaTabsHTML(group, tab, me, lang()); return RAIL.railHTML(group, tab, me, counts, lang()); }
export function shellHTML(nav, rail, body) { const t = rail ? tabsNext : ""; tabsNext = ""; return RAIL.shellHTML(nav, rail, body, t); }

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
  // data 記住原按鈕全部的 data-*（2026-10-28）：只靠 act 加 id 的話，用 data-month 分的「刪這個月」會找到頁面上第一顆，
  // 按 10 月的刪除，確認框卻掛在 9 月底下，按「確定」刪的是 9 月。
  const data = {}; for (const [k, v] of Object.entries(b.dataset)) if (k !== "confirmed") data[k] = String(v);
  S.ask = { act: b.dataset.act, id: b.dataset.id || "", text: String(text || ""), data };
  if (typeof document !== "undefined") mountAsk(document, S.ask);
  return true;
}
export function mountAsk(root, ask) {
  if (!ask || !root) return;
  for (const old of root.querySelectorAll(".ask")) old.remove();
  const sel = `[data-act="${ask.act}"]` + (ask.id ? `[data-id="${ask.id}"]` : "");
  const same = x => Object.entries(ask.data || {}).every(([k, v]) => x.dataset[k] === v);
  const b = [...root.querySelectorAll(sel)].find(x => x.dataset.confirmed !== "1" && !x.closest(".ask") && same(x));
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
// 打字的欄位（2026-10-28 Paul：「我要打完一句才存，現在是邊打邊存」）：離開那一格就存，或停手 4 秒才存。
// 勾選、選單這種按了就算數的還是馬上存（flush）。
export const TYPED_MS = 4000;
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
  // waiting：打了字、還在等那 4 秒的那一格。again：存的途中又改了的格子，跑完照順序一格一格補存。
  const timers = new Map(), running = new Map(), again = new Map(), waiting = new Map();
  const run = async (box, field) => {
    if (waiting.get(box) === field) waiting.delete(box);
    const act = box.dataset.autosave;
    if (running.get(box)) { const q = again.get(box) || []; if (!q.includes(field)) q.push(field); again.set(box, q); return; }
    running.set(box, true);
    try { await onSave(act, box, field); }
    finally {
      running.delete(box);
      const q = again.get(box);
      if (q && q.length) { const f = q.shift(); if (!q.length) again.delete(box); run(box, f); }
    }
  };
  const schedule = (field, now) => {
    const box = field.closest("[data-autosave]");
    if (!box || box === root) return;   // 不在任何存檔框裡（例如找名字的搜尋框）就不存；root 自己也掛著 data-autosave="1"
    let d = timers.get(box);
    if (!d) { d = debounce(f => run(box, f), TYPED_MS); timers.set(box, d); }
    if (!now) { waiting.set(box, field); d(field); return; }
    // 2026-10-28：同一個框裡另一格打的字還在等 4 秒，這時候選了下拉，先把打的那一格存掉，不然那幾個字會被下拉蓋過去。
    const w = waiting.get(box);
    if (w && w !== field) { waiting.delete(box); d.flush(w); run(box, field); }
    else d.flush(field);
  };
  // 打的字還在等、或還在存，人就要離開這一頁（點側欄去別頁、關分頁）：先送出去，再讓瀏覽器問一句「確定要離開嗎」。
  const flushAll = () => { for (const [box, f] of [...waiting]) { waiting.delete(box); const d = timers.get(box); if (d) d.flush(f); } };
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flushAll(); });
  window.addEventListener("beforeunload", e => {
    const busy = waiting.size > 0 || running.size > 0;
    flushAll();
    if (busy) { e.preventDefault(); e.returnValue = ""; }
  });
  root.addEventListener("input", e => { const m = saveMode(e.target); if (m === "typed") schedule(e.target, false); });
  root.addEventListener("change", e => { const m = saveMode(e.target); if (m === "now") schedule(e.target, true); else if (m === "typed") schedule(e.target, true); });
  root.addEventListener("focusout", e => { const m = saveMode(e.target); if (m === "typed") { const box = e.target.closest("[data-autosave]"); const d = timers.get(box); if (d && waiting.get(box) === e.target) { waiting.delete(box); d.flush(e.target); } } });
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
  const p0 = Object.assign({ q: "", mq: "", teams: [], ticked: [], level: "view", sel: [], blevel: "edit" }, pk || {});
  // 左欄「在裡面的」也能多選（2026-12-27，Paul：「I have to change everyone from view to edit, just one by one」）：勾、全選、清掉、一次改的等級。
  if (a === "pk-sel") { const v = el.value; return Object.assign(p0, { sel: el.checked ? [...new Set(p0.sel.concat(v))] : p0.sel.filter(x => x !== v) }); }
  if (a === "pk-selall") return Object.assign(p0, { sel: String(el.dataset.ids || "").split(",").filter(Boolean) });
  if (a === "pk-selnone") return Object.assign(p0, { sel: [] });
  if (a === "pk-blevel") return Object.assign(p0, { blevel: el.value });
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
  const pk = Object.assign({ q: "", mq: "", teams: [], ticked: [], level: "view", sel: [], blevel: "edit" }, o.pk || {});
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
    // 2026-12-27：有 acts.bulk 的地方，每一列前面一個勾，勾起來的人可以一次改等級或一次移出。
    const selSet = new Set(pk.sel || []);
    const selBox = r => o.acts.bulk ? `<input type="checkbox" class="ma-sel" data-act="pk-sel" data-ns="${esc(ns)}" value="${esc(r.user_id)}" aria-label="${esc(T("ma.selOne", { name: mpName(r) }))}"${selSet.has(r.user_id) ? " checked" : ""}${dis}>` : "";
    const row = r => `<div class="ma-row${selSet.has(r.user_id) ? " on" : ""}">${selBox(r)}${nameBlock(r)}${rankTag(r.board_role)}${r.user_id === o.meId ? `<span class="mini">${T("mp.you")}</span>` : ""}<span class="sp"></span>
        <select data-act="${esc(o.acts.level)}" data-id="${esc(r.user_id)}"${dis}>${["view", "edit", "manage"].map(l => `<option value="${l}"${r.level === l ? " selected" : ""}>${esc(T("level." + l))}</option>`).join("")}</select>
        <button type="button" class="lnk" data-act="${esc(o.acts.remove)}" data-id="${esc(r.user_id)}"${dis}>${T("mp.remove")}</button></div>`;
    const nPeople = seniors.length + plain.length;
    const shownPlain = plain.filter(hit), nSel = plain.filter(r => selSet.has(r.user_id)).length;
    const bulk = o.acts.bulk && plain.length ? `<div class="ma-tools ma-bulk"><button type="button" class="lnk" data-act="pk-selall" data-ns="${esc(ns)}" data-ids="${esc(shownPlain.map(r => r.user_id).join(","))}"${o.busy || !shownPlain.length ? " disabled" : ""}>${T("pk.tickAll")}</button>
        <button type="button" class="lnk" data-act="pk-selnone" data-ns="${esc(ns)}"${o.busy || !nSel ? " disabled" : ""}>${T("pk.untick")}</button><span class="sp"></span>
        <select id="${esc(ns)}-blevel" data-act="pk-blevel" data-ns="${esc(ns)}" aria-label="${esc(T("pk.level"))}"${dis}>${["view", "edit", "manage"].map(l => `<option value="${l}"${pk.blevel === l ? " selected" : ""}>${esc(T("level." + l))}</option>`).join("")}</select>
        <button type="button" class="btn sm" data-act="${esc(o.acts.bulk)}" data-op="level" data-ns="${esc(ns)}"${o.busy || !nSel ? " disabled" : ""}>${T("ma.setN", { n: nSel })}</button>
        <button type="button" class="btn ghost sm" data-act="${esc(o.acts.bulk)}" data-op="remove" data-ns="${esc(ns)}"${o.busy || !nSel ? " disabled" : ""}>${T("ma.removeN", { n: nSel })}</button></div>` : "";
    left = { n: nPeople, title: T("ma.in", { n: nPeople }), tools: bulk,
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
        <input id="${esc(ns)}-mq" class="ma-find" value="${esc(pk.mq || "")}" placeholder="${esc(T("pk.findPh"))}" autocomplete="off" data-act="pk-mq" data-ns="${esc(ns)}"${dis}>${left.tools || ""}</div>
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
const ORG_WS = new Set(["records", "custom:records", "finance", "custom:money", "custom:meeting-templates", "custom:team-forms", "custom:website"]);
export function wsTeamOf(w, people) {
  const id = String((w && w.id) || "");
  // 2026-10-30 起申請是整個 BT 一個工作區 apps（在「整個 BT」那一列）；apps:<team> 是停用的舊工作區，還認得出來就好。
  if (id === "apps") return "";
  if (id.startsWith("apps:")) return id.slice(5);
  if (id.startsWith("res:")) return id.slice(4);
  if (id === "intern-passport") return "Internship Team";
  if (id === "passport") return "";
  // 整個 BT 的工具不跟擁有人走（2026-11-14 Paul：「為什麼紀錄、會議範本、team 表單在 Sponsorship 底下」）。
  // 擁有人通常是 Co-President，他勾的第一個 team 是哪一個，這幾格就掉到哪一列，看起來像那個 team 的東西。
  if (ORG_WS.has(id)) return "";
  if (id === "custom:marketing-requests" || id === "custom:marketing-approve") return "Marketing Team";
  // 專案（2026-12-26）的工作區存在 team 欄，空的就是整個 BT，不看擁有人。
  if (w && w.kind === "project") return w.team || "";
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
  if (id === "finance") return T("ws.long.finance");
  if (id === "custom:money") return T("ws.long.money");
  if (id === "records" || id === "custom:records") return T("ws.long.records");
  return (w && ((lang() === "zh" ? (w.title_zh || w.title_en) : (w.title_en || w.title_zh)))) || id;
}
export function wsCellHref(w) {
  const id = String((w && w.id) || "");
  if (id === "passport") return "/admin/passports/#cadre";
  if (id === "intern-passport") return "/admin/passports/#interns";
  if (id === "apps" || id.startsWith("apps:")) return "/admin/#forms";
  if (id.startsWith("res:")) return "/admin/site/#res";
  if (id === "custom:marketing-requests") return "/admin/#requests";
  if (id === "custom:marketing-approve") return "/admin/marketing/#posts";
  if (id.startsWith("custom:event-")) return "/admin/#events/" + encodeURIComponent(id.slice(13));
  if (w && w.kind === "project") return "/admin/#projects/" + encodeURIComponent(id);
  if (id === "finance" || id === "custom:money") return "/admin/finance/#overview";
  if (id === "custom:team-forms") return "/admin/team-forms/#build";
  if (id === "records" || id === "custom:records") return "/admin/records/#overview";
  if (id === "custom:website") return "/admin/site/#history";
  return "/admin/people/#ws=" + encodeURIComponent(id);
}
// 分組：[{ team: "" 或 team 名, label, cells: [workspace…] }]，整個 BT 那一列在最上面，然後照 teams 的順序，最後是清單外的 team。
export function wsRows(workspaces, teams, people) {
  // 一場一場的活動不列在這裡（2026-12-25）：在那一場自己的「人」分頁改，這張表才不會隨活動越來越長。
  const active = (workspaces || []).filter(w => w.active !== false && !String(w.id).startsWith("custom:event-"));
  const order = { apps: 0, passport: 1, "intern-passport": 3 };
  // 專案排在每一列最後（2026-12-26），那個 team 自己的工具在前面。
  const rank = w => w.kind === "project" ? 10 : w.id.startsWith("apps:") ? 1 : w.id.startsWith("res:") ? 2 : (order[w.id] != null ? order[w.id] : 9);
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
        acts: { level: "members-level", remove: "members-unassign", cleanup: "members-cleanup", bulk: "members-bulk" }, canCleanup: !!mp.senior, go: { act: "members-assign", ws: mp.ws } });
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

export function downHTML(err) {
  return pageHead(T("down.title"), T("down.lede"), [{ act: "retry", label: T("common.retry") }])
    + (err ? `<div class="mini">${esc(T("down.detail"))}${esc(err)}</div>` : "");
}
export function notCadreHTML() {
  return pageHead(T("notCadre.title"), T("notCadre.lede"), [{ label: T("notCadre.back"), href: "../../app/" }]);
}
export function noAccessHTML(me) {
  return pageHead(T("noAccess.title"), T("noAccess.lede"), [{ label: T("noAccess.back"), href: withLang("../") }]);
}

// ═══════════════════════════════════════════════════════════════════════
// 財務（2026-11-08）。Paul 2026-11-07：「總共多少錢、花在哪、收入，全部」。
// 設計在 docs/2026-11-08-財務設計.md。這一半是純函式：算、篩、格式、畫。資料庫那一半在 2026-11-08-finance.sql。
//
// 誰看得到、誰改得動：my_access() 在 finance 那一格填 view 或 edit（can_view_finance / can_edit_finance 算的），
// Co-President 與 Senior Adviser 本來就看得到（senior），Co-President 改得動。**這只是畫面，門在資料庫每一支函式第一句與 RLS。**
// ═══════════════════════════════════════════════════════════════════════
// Marketing（2026-11-26）。批 1：Instagram 連線狀態。計畫在 ~/Anson/outputs/beyond-taiwan/website/docs/2026-10-29-marketing-dashboard-plan/plan.md。
// 資料庫那一半在 2026-11-26-instagram-connect.sql，設定步驟在 docs/2026-10-29-instagram-setup.md。
//
// 誰看得到：senior，或被派進 Marketing 資源工作區、行銷需求單工作區（任何等級）。跟資料庫的 ig_can_view() 同一條規則。
// **這只是畫面，門在資料庫每一支函式第一句。**「再檢查一次」那顆鈕看 ig_status() 回的 can_manage，不在這裡算。
// ═══════════════════════════════════════════════════════════════════════
export const MKT_WS = ["res:Marketing Team", "custom:marketing-requests", "custom:marketing-approve"];
export function canViewMkt(me) {
  if (!me || me.role !== "cadre") return false;
  if (me.board === "president" || me.board === "senior_adviser") return true;
  return MKT_WS.some(id => !!((me.ws || {})[id]));
}
export const SETUP_DOC = "https://github.com/beyondtaiwannpo/bt-site/blob/main/docs/2026-10-29-instagram-setup.md";

// 時間：照看的人自己的時區印「2026-11-26 09:05」。null 回空字串。
export function fmtWhen(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d)) return "";
  const p = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
export const fmtDay = iso => fmtWhen(iso).slice(0, 10);
export const fmtCount = n => n == null || n === "" ? "" : Number(n).toLocaleString("en-US");
export function daysLeft(iso, now) {
  if (!iso) return null;
  return Math.floor((new Date(iso).getTime() - (now || Date.now())) / 86400000);
}
// Instagram 的錯誤翻成人話。資料庫存的是「HTTP 400 code 190: ...」或「network: ...」（ig_error_text）。
export function igErrorKind(text) {
  const t = String(text || "");
  if (!t) return "";
  if (/code 190\b/.test(t)) return "190";
  if (/^network:/.test(t) || /^HTTP 0\b/.test(t) || /timed? ?out/i.test(t)) return "net";
  return "other";
}
// 通行證那一行的狀態：ok、soon（剩不到 10 天）、gone（過期了）。
export function tokenState(st, now) {
  const left = daysLeft(st && st.expires_at, now);
  if (left == null) return "ok";
  if (left < 0) return "gone";
  if (left < 10) return "soon";
  return "ok";
}

// 一列「名稱：值」。沿用需求單那一頁的 rq-dl（admin.css），不另加樣式。
function igRow(label, value) { return `<dt>${esc(label)}</dt><dd>${value}</dd>`; }

export function igPageHTML(st, msg, busy, now) {
  const s = st || {};
  const actions = s.can_manage && s.ready ? [{ act: "ig-check", label: busy ? T("ig.checking") : T("ig.check"), disabled: !!busy }] : [];
  let body = "";
  if (!s.ready) {
    body += sectionHTML(T("ig.off.title"), `<p>${esc(T("ig.off.body"))}</p>${s.can_manage ? "" : `<p class="mini">${esc(T("ig.off.who"))}</p>`}
      <div class="row"><a class="btn ghost sm" href="${esc(SETUP_DOC)}" target="_blank" rel="noopener">${esc(T("ig.doc"))}</a></div>`);
  } else {
    const type = s.account_type ? T("ig.type." + s.account_type) : "";
    const ts = tokenState(s, now);
    const until = s.expires_at ? T(s.estimated ? "ig.token.about" : "ig.token.until", { date: esc(fmtDay(s.expires_at)) }) : "";
    let rows = "";
    if (s.username) rows += igRow(T("ig.account"), `<a href="https://www.instagram.com/${encodeURIComponent(s.username)}/" target="_blank" rel="noopener">@${esc(s.username)}</a>`);
    if (type) rows += igRow(T("ig.type"), esc(type.startsWith("ig.type.") ? s.account_type : type));
    if (s.followers != null) rows += igRow(T("ig.followers"), esc(fmtCount(s.followers)));
    if (s.media != null) rows += igRow(T("ig.posts"), esc(fmtCount(s.media)));
    rows += igRow(T("ig.checked"), esc(s.checked_at ? fmtWhen(s.checked_at) : T("ig.never")));
    // Instagram 已經說這張不能用（190）：不要再印「用到哪天」，那會跟下面的錯誤打架。
    const dead = igErrorKind(s.check_error) === "190";
    rows += igRow(T("ig.token"), dead ? esc(T("ig.token.dead")) : `${until}<div class="mini">${esc(T("ig.token.auto"))}</div>`);
    body += sectionHTML(T("ig.title"), `<dl class="rq-dl">${rows}</dl>`);
    if (ts !== "ok" && !dead) body += `<div class="msg err">${esc(T(ts === "gone" ? "ig.token.gone" : "ig.token.soon"))} <a href="${esc(SETUP_DOC)}" target="_blank" rel="noopener">${esc(T("ig.doc"))}</a></div>`;
    if (s.check_error) {
      const k = igErrorKind(s.check_error);
      body += sectionHTML(T("ig.err.title"), `<p>${esc(T("ig.err." + k))}</p>${k === "other" ? `<pre class="mini">${esc(s.check_error)}</pre>` : ""}${
        k === "190" ? `<div class="row"><a class="btn ghost sm" href="${esc(SETUP_DOC)}" target="_blank" rel="noopener">${esc(T("ig.doc"))}</a></div>` : ""}`);
    }
    if (s.refresh_error) body += `<p class="mini">${esc(T("ig.refreshErr"))} <code>${esc(s.refresh_error)}</code></p>`;
    if (!s.cron) body += `<p class="mini">${esc(T("ig.cronOff"))}</p>`;
    if (!s.can_manage) body += `<p class="mini">${esc(T("ig.viewOnly"))}</p>`;
  }
  body += `<p class="mini">${esc(T("ig.next"))}</p>`;
  return pageHead(T("ig.title"), T("ig.lede"), actions) + msgHTML(msg) + body;
}

// ═══════════════════════════════════════════════════════════════════════
// 大學介紹貼文（2026-11-27）。Paul 2026-10-31：「貼文產生器是 Marketing dashboard 裡的一個功能。」
// 清單（這個系列做過哪幾所）、一篇的編輯畫面（每一張投影片的欄位、每個數字的來源與「我點開看過」、照片與授權、caption），
// 右邊即時預覽，下載 PNG 與給 Canva 的 .pptx，送審、核可、退回、標成已發。投影片怎麼畫在 ./slides.js。
// **門在資料庫**（mkt_can_edit / mkt_can_approve，作者不能核可自己的）。這裡藏按鈕只是讓畫面乾淨。
// ═══════════════════════════════════════════════════════════════════════
import { FACTS, PHOTO_SLOTS } from "./slides.js";
export const POST_STATUSES = ["draft", "in_review", "approved", "posted", "archived"];
export const SOURCE_KINDS = ["cds", "school", "bigfuture", "usnews", "collegefactual", "wikimedia", "wikipedia", "other"];
export const US_STATES = ["AL","AK","AZ","AR","CA","CO","CT","DE","DC","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"];
const statusTag = s => `<span class="tag cp-st-${esc(s)}">${esc(T("cp.st." + s))}</span>`;
const nameOf = (boot, id) => (boot && boot.names && boot.names[id]) || "";
const when = iso => iso ? fmtWhen(iso) : "";
export const canEditPost = (p, boot, rs) => !!(boot && boot.can_edit) && !!p && !["posted", "archived"].includes(p.status) && !researchRunning(rs);
// 研究（2026-11-28）：五個工作還有沒有在跑。跑的時候表單鎖住（研究回來會寫進空著的格子，人同時在打字會互相蓋掉）。
export const researchRunning = rs => !!rs && (rs.jobs || []).some(j => j.status === "queued" || j.status === "sent");
export const RS_GROUPS = ["basic", "admissions", "policy", "majors", "fun"];
export const RESEARCH_DOC = "https://github.com/beyondtaiwannpo/bt-site/blob/main/docs/2026-10-31-research-setup.md";
// 一個來源的頁面檢查結果（資料庫自己打開那個網址找那一句）。
export function sourceCheck(rs, key, s) {
  const c = ((rs && rs.checks) || []).find(x => x.key === key && x.url === s.url && x.quote === s.quote);
  return c ? c.status : "";
}
// 錯誤翻成人話：逾時、被擋、格式不對、其他。
export function rsErrorKey(err) {
  const e = String(err || "");
  if (/refusal/.test(e)) return "cp.rs.err.refusal";
  if (/timed out|15 minutes/.test(e)) return "cp.rs.err.timeout";
  if (/expected JSON|max_tokens/.test(e)) return "cp.rs.err.format";
  if (/HTTP 401|HTTP 403|authentication|api key/i.test(e)) return "cp.rs.err.key";
  if (/HTTP 400.*credit|billing|spend/i.test(e)) return "cp.rs.err.money";
  return "cp.rs.err.other";
}
export function researchCost(rs) { return rs && rs.cost_usd != null ? Number(rs.cost_usd) : 0; }

// 一個數字現在的狀態：ok（勾了、還有效）、stale（勾過但後來改了）、todo（有填、還沒勾）、""（沒填，不用勾）。
export function factState(p, boot, key) {
  const probs = (boot && boot.problems && boot.problems[p.id]) || [];
  const chk = p.checks && p.checks[key];
  if (probs.includes("unchecked:" + key)) return chk ? "stale" : "todo";
  return chk ? "ok" : "";
}
// 整篇有幾個數字要勾、勾好幾個（清單上那一欄）。
export function factCount(p, boot) {
  let need = 0, done = 0;
  for (const [k] of FACTS) { const s = factState(p, boot, k); if (s) { need++; if (s === "ok") done++; } }
  return { need, done };
}
// 最舊的那一個勾是哪一天（清單上提醒：數字查過超過一年就該再查一次）。
export function oldestCheck(p) {
  const ds = Object.values(p.checks || {}).map(c => c && c.at).filter(Boolean).sort();
  return ds[0] || "";
}
export const isStale = (iso, now) => !!iso && ((now || Date.now()) - new Date(iso).getTime()) > 365 * 86400000;

export function postsListHTML(posts, boot, msg, busy, showArchived, now) {
  const rows = (posts || []).filter(p => showArchived || p.status !== "archived");
  const add = boot && boot.can_edit ? `<div class="card cp-new">
      <label class="lab" for="cp-school">${esc(T("cp.new.label"))}</label>
      <div class="row"><input id="cp-school" placeholder="${esc(T("cp.new.ph"))}" data-noauto="1"><button class="btn" data-act="cp-create"${busy ? " disabled" : ""}>${esc(T("cp.new.go"))}</button>
      <label class="btn ghost sm cp-file">${esc(T("cp.import"))}<input type="file" accept="application/json,.json" data-act="cp-import" hidden></label></div>
      <p class="mini">${esc(T("cp.new.hint"))}</p></div>` : `<p class="mini">${esc(T("cp.viewOnly"))}</p>`;
  const body = rows.length ? `<table class="table cp-list"><thead><tr><th>${esc(T("cp.col.school"))}</th><th>${esc(T("cp.col.status"))}</th><th>${esc(T("cp.col.facts"))}</th><th>${esc(T("cp.col.updated"))}</th><th>${esc(T("cp.col.posted"))}</th></tr></thead><tbody>${
    rows.map(p => {
      const fc = factCount(p, boot), old = oldestCheck(p);
      return `<tr${p.status === "archived" ? ' class="off"' : ""}><td class="t-main"><a href="#post/${esc(p.id)}" data-act="tab" data-t="post/${esc(p.id)}"><b>${esc(p.school)}</b></a></td>
        <td>${statusTag(p.status)}</td>
        <td>${fc.need ? esc(T("cp.factsDone", { done: fc.done, need: fc.need })) : ""}${old && isStale(old, now) ? `<div class="mini warn">${esc(T("cp.stale", { date: fmtDay(old) }))}</div>` : ""}</td>
        <td>${esc(when(p.updated_at))}<div class="mini">${esc(nameOf(boot, p.updated_by))}</div></td>
        <td>${p.posted_url ? `<a href="${esc(p.posted_url)}" target="_blank" rel="noopener">${esc(fmtDay(p.posted_at))}</a>` : ""}</td></tr>`;
    }).join("")}</tbody></table>` : emptyHTML(T("cp.empty.title"), T("cp.empty.hint"));
  const arch = (posts || []).some(p => p.status === "archived")
    ? `<div class="row"><button class="btn quiet sm" data-act="cp-archived">${esc(T(showArchived ? "cp.hideArchived" : "cp.showArchived"))}</button></div>` : "";
  return pageHead(T("cp.title"), T("cp.lede")) + msgHTML(msg) + add + sectionHTML(T("cp.series"), body + arch);
}

// ── 一篇 ──
const v = x => esc(x == null ? "" : x);
function inp(name, value, o) {
  o = o || {};
  const dis = o.disabled ? " disabled" : "";
  if (o.area) return `<textarea name="${v(name)}" rows="${o.rows || 2}"${o.ph ? ` placeholder="${v(o.ph)}"` : ""}${dis}>${v(value)}</textarea>`;
  return `<input name="${v(name)}" value="${v(value)}"${o.type ? ` type="${o.type}"` : ""}${o.ph ? ` placeholder="${v(o.ph)}"` : ""}${o.cls ? ` class="${o.cls}"` : ""}${dis}>`;
}
const fld = (label, html, hint) => `<label class="cp-f"><span class="lab">${esc(label)}</span>${html}${hint ? `<span class="mini">${esc(hint)}</span>` : ""}</label>`;
export function factBadge(p, boot, key) {
  const st = factState(p, boot, key), c = (p.checks || {})[key];
  if (st === "ok") return `<span class="cp-ok">${esc(T("cp.fact.ok", { who: nameOf(boot, c.by) || "?", date: fmtDay(c.at) }))}</span>`;
  if (st === "stale") return `<span class="cp-warn">${esc(T("cp.fact.stale"))}</span>`;
  if (st === "todo") return `<span class="cp-warn">${esc(T("cp.fact.todo"))}</span>`;
  return "";
}
function factBlock(p, boot, key, label, inner, dis, rs) {
  const srcs = ((p.sources || {})[key] || []).concat([{}]).slice(0, 4);
  const st = factState(p, boot, key);
  const rows = srcs.map((s, i) => `<div class="cp-src">
      <select name="s.${key}.${i}.kind"${dis}>${SOURCE_KINDS.map(k => `<option value="${k}"${(s.kind || "") === k ? " selected" : ""}>${esc(T("cp.src." + k))}</option>`).join("")}</select>
      ${inp(`s.${key}.${i}.url`, s.url, { ph: T("cp.src.urlPh"), disabled: !!dis })}
      ${inp(`s.${key}.${i}.quote`, s.quote, { ph: T("cp.src.quotePh"), disabled: !!dis })}
      ${s.url ? `<a class="mini" href="${v(s.url)}" target="_blank" rel="noopener">${esc(T("cp.src.open"))}</a>` : ""}${
        s.url && sourceCheck(rs, key, s) ? `<span class="cp-chk cp-chk-${sourceCheck(rs, key, s)}">${esc(T("cp.chk." + sourceCheck(rs, key, s)))}</span>` : ""}</div>`).join("");
  const tick = st ? `<label class="cp-tick"><input type="checkbox" data-act="cp-check" data-key="${key}" data-noauto="1"${st === "ok" ? " checked" : ""}${dis}> ${esc(T("cp.fact.tick"))}</label>` : "";
  return `<div class="cp-fact" data-fact="${key}"><div class="cp-fact-head"><b>${esc(label)}</b> <span id="fx-${key}">${factBadge(p, boot, key)}</span></div>
    ${inner}<details class="cp-srcs"${st && st !== "ok" ? " open" : ""}><summary>${esc(T("cp.src.title", { n: ((p.sources || {})[key] || []).length }))}</summary>${rows}</details>${tick}</div>`;
}
function photoSlot(p, slot, dis, urls) {
  const ph = ((p.data || {}).photos || {})[slot] || {};
  const n = `d.photos.${slot}`;
  return `<div class="cp-photo" data-slot="${slot}">
    <div class="cp-thumb">${ph.path && urls && urls[ph.path] ? `<img src="${v(urls[ph.path])}" alt="">` : `<span class="mini">${esc(T("cp.photo.none"))}</span>`}</div>
    <div class="cp-photo-f"><b>${esc(T("cp.photo." + slot))}</b>
      <input type="hidden" name="${n}.path" value="${v(ph.path)}">
      ${dis ? "" : `<div class="row"><label class="btn ghost sm">${esc(T("cp.photo.upload"))}<input type="file" accept="image/jpeg,image/png,image/webp" data-act="cp-photo-file" data-slot="${slot}" hidden></label>
        <input class="cp-url" placeholder="${esc(T("cp.photo.urlPh"))}" data-noauto="1" data-slot-url="${slot}"><button class="btn ghost sm" data-act="cp-photo-url" data-slot="${slot}">${esc(T("cp.photo.fromUrl"))}</button>
        ${ph.path ? `<button class="btn quiet sm" data-act="cp-photo-clear" data-slot="${slot}">${esc(T("cp.photo.clear"))}</button>` : ""}</div>`}
      <div class="cp-2">${fld(T("cp.photo.credit"), inp(`${n}.credit`, ph.credit, { disabled: !!dis }))}${fld(T("cp.photo.license"), inp(`${n}.license`, ph.license, { ph: "CC BY 4.0", disabled: !!dis }))}</div>
      <div class="cp-2">${fld(T("cp.photo.source"), inp(`${n}.source_url`, ph.source_url, { disabled: !!dis }))}
        ${fld(T("cp.photo.focus"), `<select name="${n}.focus"${dis}><option value="">${esc(T("cp.photo.center"))}</option><option value="top"${ph.focus === "top" ? " selected" : ""}>${esc(T("cp.photo.top"))}</option></select>`)}</div>
    </div></div>`;
}
// 送審、核可、退回、標成已發、收起來、下載。誰看得到哪顆照資料庫的規則畫（門還是在資料庫）。
function actionsHTML(p, boot, ui, busy) {
  const probs = (boot.problems || {})[p.id] || [];
  const own = p.created_by === boot.me;
  const b = (act, label, cls, extra) => `<button class="btn${cls ? " " + cls : ""}" data-act="${act}"${busy ? " disabled" : ""}${extra || ""}>${esc(label)}</button>`;
  let main = "";
  if (p.status === "draft" && boot.can_edit) main += b("cp-submit", T("cp.act.submit"), "", probs.length ? " disabled" : "");
  if (p.status === "in_review" && boot.can_approve && !own) main += b("cp-approve", T("cp.act.approve"));
  if (["in_review", "approved"].includes(p.status) && boot.can_approve) main += b("cp-return-open", T("cp.act.return"), "ghost");
  if (p.status === "approved" && (boot.can_edit || boot.can_approve)) main += b("cp-posted-open", T("cp.act.posted"));
  if (["draft", "in_review"].includes(p.status) && boot.can_edit) main += b("cp-archive", T("cp.act.archive"), "quiet");
  let note = "";
  if (p.status === "in_review" && own && boot.can_approve) note = T("cp.ownNote");
  if (p.status === "draft" && probs.length) note = T("cp.needs", { list: probs.map(x => { const [k, w] = x.split(":"); return k === "photo" ? T("cp.photo." + w) : T("cp.fact." + w); }).join(T("cp.sep")) });
  const ret = ui.returning ? `<div class="cp-inline"><textarea id="cp-return-note" rows="2" placeholder="${esc(T("cp.returnPh"))}" data-noauto="1"></textarea>${b("cp-return", T("cp.act.returnGo"), "danger sm")}${b("cp-inline-cancel", T("common.cancel"), "ghost sm")}</div>` : "";
  const post = ui.posting ? `<div class="cp-inline"><input id="cp-posted-url" placeholder="https://www.instagram.com/p/…" data-noauto="1">${b("cp-posted", T("cp.act.postedGo"), "sm")}${b("cp-inline-cancel", T("common.cancel"), "ghost sm")}</div>` : "";
  const dl = `<div class="row">${b("cp-dl-png", T("cp.dl.png"), "ghost sm")}${b("cp-dl-pptx", T("cp.dl.pptx"), "ghost sm")}</div><p class="mini">${esc(T("cp.dl.hint"))}</p>`;
  // 2026-11-23 照做事的順序拆成兩塊（Paul：「do all of them」）：最上面只剩一行「現在是什麼狀態」（statusLineHTML），
  // 送審、核可、退回、標成已發、下載這些按鈕搬到內容與預覽的下面，因為要先寫完、看完才按。
  // 被退回的原因留在最上面那一行底下：那是打開這一頁第一件要知道的事。
  // 內容那一段有七張圖那麼長，所以最上面那一行右邊有一顆「送審與下載 ↓」直接捲下去（審稿的人看過了不用再捲一次）。
  return `<div class="card cp-status cp-actions" id="cp-actions"><h2>${esc(T("cp.s.review"))}</h2>
    ${main ? `<div class="row">${main}</div>` : ""}${note ? `<p class="mini">${esc(note)}</p>` : ""}${ret}${post}${dl}</div>`;
}
export function statusLineHTML(p, boot) {
  const who = [p.created_by && T("cp.by", { who: nameOf(boot, p.created_by), date: fmtDay(p.created_at) }),
               p.approved_by && T("cp.approvedBy", { who: nameOf(boot, p.approved_by), date: fmtDay(p.approved_at) }),
               p.posted_url && T("cp.postedAt", { date: fmtDay(p.posted_at) })].filter(Boolean).map(esc).join("　");
  return `<div class="card cp-status" id="cp-status"><div class="row">${statusTag(p.status)}<span class="mini">${who}</span>${p.posted_url ? `<a class="mini" href="${v(p.posted_url)}" target="_blank" rel="noopener">${esc(T("cp.openIg"))}</a>` : ""}
    <span class="sp"></span><button type="button" class="lnk" data-act="cp-to-actions">${esc(T("cp.toActions"))}</button></div>
    ${p.review_note ? `<div class="msg err">${esc(T("cp.returned"))}${esc(p.review_note)}</div>` : ""}</div>`;
}
export function statusPanel(p, boot, ui, busy) { return actionsHTML(p, boot, ui || {}, busy); }

// 研究那一塊：還沒設定、按鈕、跑的進度、跑完的筆記與建議照片、花了多少。
export function researchHTML(p, boot, rs, busy) {
  if (!rs) return "";
  const running = researchRunning(rs), jobs = rs.jobs || [];
  let body = "";
  if (!rs.ready && p.status === "draft" && boot.can_edit) body += `<p class="mini">${esc(T("cp.rs.notReady"))} <a href="${esc(RESEARCH_DOC)}" target="_blank" rel="noopener">${esc(T("cp.rs.doc"))}</a></p>`;
  else if (p.status === "draft" && boot.can_edit && !running)
    body += `<div class="row"><button class="btn" data-act="cp-research"${busy ? " disabled" : ""}>${esc(T(jobs.length ? "cp.rs.again" : "cp.rs.go"))}</button></div>
      <p class="mini">${esc(T("cp.rs.hint", { today: rs.today || 0, limit: rs.daily_limit || 50 }))}</p>`;
  if (jobs.length) {
    body += `<ul class="cp-rs">${RS_GROUPS.map(g => {
      const j = jobs.find(x => x.grp === g); if (!j) return "";
      const st = j.status === "failed" ? `<span class="cp-warn">${esc(T(rsErrorKey(j.error)))}</span>` : `<span class="${j.status === "done" ? "cp-ok" : "tag"}">${esc(T("cp.rs.st." + j.status))}</span>`;
      return `<li><b>${esc(T("cp.rs.g." + g))}</b> ${st}${j.status === "failed" && j.error ? `<span class="mini"> ${esc(j.error)}</span>` : ""}</li>`;
    }).join("")}</ul>`;
    if (running) body += `<p class="mini">${esc(T("cp.rs.running"))}</p>`;
    const cost = researchCost(rs);
    if (cost) body += `<p class="mini">${esc(T("cp.rs.cost", { usd: cost.toFixed(2) }))}</p>`;
    const notes = [];
    for (const j of jobs) {
      for (const n of (j.notes || [])) if (typeof n === "string" && n.trim()) notes.push([g2(j.grp), n]);
      for (const [k, f] of Object.entries(j.facts || {})) if (f && typeof f.note === "string" && f.note.trim()) notes.push([T("cp.fact." + k), f.note]);
    }
    if (notes.length) body += `<details class="cp-notes"${running ? "" : " open"}><summary>${esc(T("cp.rs.notes", { n: notes.length }))}</summary><ul>${
      notes.map(([w, n]) => `<li><b>${esc(w)}</b>${esc(T("cp.colon"))}${esc(n)}</li>`).join("")}</ul></details>`;
    const ph = Object.assign({}, ...(jobs.map(j => j.photos || {})));
    const have = ((p.data || {}).photos) || {};
    const slots = Object.keys(ph).filter(k => PHOTO_SLOTS.includes(k) && ph[k] && /^https:\/\/upload\.wikimedia\.org\//.test(ph[k].url || ""));
    if (slots.length) body += `<div class="cp-sugg">${slots.map(k => `<figure><img src="${v(ph[k].url)}" alt="" loading="lazy"><figcaption><b>${esc(T("cp.photo." + k))}</b><span class="mini">${esc(ph[k].credit || "")}${esc(T("cp.dot"))}${esc(ph[k].license || "")}</span>${
        have[k] && have[k].path ? `<span class="mini">${esc(T("cp.rs.photoHave"))}</span>` : ""}${canEditPost(p, boot, rs) ? `<button class="btn ghost sm" data-act="cp-use-photo" data-slot="${k}">${esc(T("cp.rs.usePhoto"))}</button>` : ""}</figcaption></figure>`).join("")}</div>`;
  }
  if (!body) return "";
  return `<div class="card cp-research" id="cp-research"><h2>${esc(T("cp.rs.title"))}</h2>${body}</div>`;
}
const g2 = g => T("cp.rs.g." + g);

export function postEditorHTML(p, boot, msg, busy, ui, urls, rs) {
  const d = p.data || {}, c = d.cover || {}, b = d.basic || {}, a = d.apply || {}, t = d.timeline || {}, m = d.majors || {}, f = d.fun || {};
  const dis = canEditPost(p, boot, rs) ? "" : " disabled";
  const FB = (key, label, inner) => factBlock(p, boot, key, label, inner, dis, rs);
  const DIS = !!dis;
  const I2 = (name, val, o) => inp(name, val, Object.assign({ disabled: DIS }, o || {}));
  const sec = (title, inner, hint) => sectionHTML(title, (hint ? `<p class="mini">${esc(hint)}</p>` : "") + inner);
  const color = (name, val) => `<input type="color" name="${name}" value="${v(val || "#000000")}"${dis}>`;
  const tlRows = (t.rows || []).map((r, i) => `<div class="cp-3">${I2(`d.timeline.rows.${i}.date`, r.date, { ph: "Nov 1" })}${I2(`d.timeline.rows.${i}.en`, r.en, { ph: "Early Decision I (ED I)" })}${I2(`d.timeline.rows.${i}.zh`, r.zh, { ph: "第一輪提前決定截止" })}${
    DIS ? "" : `<button class="btn quiet sm" data-act="cp-row-del" data-list="timeline" data-i="${i}" title="${esc(T("cp.row.del"))}">×</button>`}</div>`).join("");
  const mjRows = (m.rows || []).map((r, i) => `<div class="cp-3">${I2(`d.majors.rows.${i}.en`, r.en, { ph: "Economics" })}${I2(`d.majors.rows.${i}.zh`, r.zh, { ph: "經濟" })}${I2(`d.majors.rows.${i}.rank`, r.rank, { ph: "#26  By U.S. News" })}</div>`).join("");
  const form = `<div data-autosave="cp-save" data-id="${v(p.id)}" class="cp-form">
    ${sec(T("cp.s.cover"), `<div class="cp-2">${fld(T("cp.f.school"), I2("d.school", d.school || p.school))}${fld(T("cp.f.zh"), I2("d.cover.zh", c.zh, { ph: "范德堡大學" }))}</div>
      <div class="cp-2">${fld(T("cp.f.line1"), I2("d.cover.line1", c.line1, { ph: "VANDERBILT" }) + color("d.cover.line1_color", c.line1_color))}${fld(T("cp.f.line2"), I2("d.cover.line2", c.line2, { ph: "UNIVERSITY" }) + color("d.cover.line2_color", c.line2_color))}</div>
      <div class="cp-2">${fld(T("cp.f.pennant"), I2("d.cover.pennant", c.pennant, { ph: "VANDERBILT" }) + color("d.cover.pennant_text", c.pennant_text))}${fld(T("cp.f.accent"), color("d.cover.accent", c.accent))}</div>
      ${FB("cover_rank", T("cp.fact.cover_rank"), fld(T("cp.f.tags1"), I2("d.cover.tags1", c.tags1, { ph: "#16 in US National Universities" })))}
      ${fld(T("cp.f.tags2"), I2("d.cover.tags2", c.tags2, { ph: "#Economics #Engineering" }))}`)}
    ${sec(T("cp.s.basic"), ["rank:ranking:National 全國 #16", "type:type:Private 私立", "setting:setting:Urban 都市", "enrollment:enrollment:大學部 7,366人"].map(s => {
        const [k, f2, ph] = s.split(":"); return FB(k, T("cp.fact." + k), I2("d.basic." + f2, b[f2], { ph }), dis); }).join("")
      + `<div class="cp-2">${fld(T("cp.f.state"), `<select name="d.basic.state"${dis}><option value=""></option>${US_STATES.map(s => `<option${(b.state || "") === s ? " selected" : ""}>${s}</option>`).join("")}</select>`)}${
        fld(T("cp.f.stateLabel"), I2("d.basic.state_label", b.state_label, { area: true, ph: "Tennessee\n田納西州" }))}</div>`)}
    ${sec(T("cp.s.apply"), [["acceptance", "5.4%"], ["applicants", "48,196"], ["gpa", "3.90"], ["sat", "1510–1560"], ["act", "34–35"], ["test_note", "Test-optional 可不送"],
        ["toefl", "5"], ["ielts", "7.0"], ["duolingo", "130"]].map(([k, ph]) => FB(k, T("cp.fact." + k), I2("d.apply." + k, a[k], { ph }), dis)).join("")
      + fld(T("cp.f.footer"), I2("d.apply.footer", a.footer, { area: true, rows: 3 })), T("cp.s.applyHint"))}
    ${sec(T("cp.s.timeline"), FB("timeline", T("cp.fact.timeline"), tlRows + (DIS || (t.rows || []).length >= 8 ? "" : `<button class="btn ghost sm" data-act="cp-row-add" data-list="timeline">${esc(T("cp.row.add"))}</button>`), dis)
      + fld(T("cp.f.footer"), I2("d.timeline.footer", t.footer, { area: true, rows: 3 })), T("cp.s.timelineHint"))}
    ${sec(T("cp.s.majors"), FB("majors", T("cp.fact.majors"), mjRows, dis) + fld(T("cp.f.footnote"), I2("d.majors.footnote", m.footnote, { area: true, rows: 3 })))}
    ${sec(T("cp.s.fun"), FB("alumni", T("cp.fact.alumni"), (f.alumni || [{}, {}]).slice(0, 2).map((x, i) =>
        `<div class="cp-2">${I2(`d.fun.alumni.${i}.name`, x.name, { ph: "Muhammad Yunus" })}${I2(`d.fun.alumni.${i}.desc`, x.desc, { ph: "2006 諾貝爾和平獎" })}</div>`).join(""), dis)
      + `<div class="cp-2">${fld(T("cp.f.cityEn"), I2("d.fun.city_en", f.city_en, { ph: "Explore Nashville" }))}${fld(T("cp.f.cityZh"), I2("d.fun.city_zh", f.city_zh, { ph: "城市探索" }))}</div>`
      + `<div class="cp-2">${(f.city || [{}, {}]).slice(0, 2).map((x, i) => fld(T("cp.f.city" + (i + 1)), I2(`d.fun.city.${i}.label`, x.label, { ph: i ? "Ryman Auditorium 萊曼禮堂" : "The Parthenon 帕德嫩神廟" }))).join("")}</div>`)}
    ${sec(T("cp.s.photos"), PHOTO_SLOTS.map(s => photoSlot(p, s, dis, urls)).join(""), T("cp.s.photosHint"))}
    ${sec(T("cp.s.caption"), fld(T("cp.f.caption"), I2("caption", p.caption, { area: true, rows: 14 })) + `<p class="mini" id="cp-cap-count">${esc(captionCount(p.caption))}</p>`)}
    ${DIS ? "" : `<div class="row">${autosaveHint("cp-save")}</div>`}
  </div>`;
  const prev = `<div class="cp-prev">${[0, 1, 2, 3, 4, 5, 6].map(i => `<canvas width="1080" height="1350" data-slide="${i}" data-act="cp-zoom" title="${esc(T("cp.zoom"))}"></canvas>`).join("")}</div>`;
  return pageHead(esc(p.school), T("cp.editLede"), [], { act: "cp-back", label: T("cp.back") }) + msgHTML(msg)
    + statusLineHTML(p, boot) + researchHTML(p, boot, rs, busy) + `<div class="cp-wrap"><div>${form}</div><aside>${prev}</aside></div>`
    + statusPanel(p, boot, ui, busy);
}
// caption 的字數與 hashtag 數（IG 上限 2,200 字、30 個 hashtag）。
export function captionCount(text) {
  const s = String(text || ""), tags = (s.match(/#[^\s#]+/g) || []).length;
  return T("cp.capCount", { n: [...s].length, tags }) + ([...s].length > 2200 || tags > 30 ? T("cp.capOver") : "");
}
// 表單讀回資料：name 是「d.cover.line1」「s.rank.0.url」「caption」這種路徑。
export function readEditor(values) {
  const data = {}, sources = {}; let caption = "";
  const put = (obj, path, val) => {
    let o = obj;
    path.forEach((k, i) => {
      const last = i === path.length - 1, nk = path[i + 1], isIdx = /^\d+$/.test(k);
      const key = isIdx ? Number(k) : k;
      if (last) { o[key] = val; return; }
      if (o[key] == null) o[key] = /^\d+$/.test(nk) ? [] : {};
      o = o[key];
    });
  };
  for (const [name, val] of Object.entries(values)) {
    if (name === "caption") caption = String(val || "");
    else if (name.startsWith("d.")) put(data, name.slice(2).split("."), val);
    else if (name.startsWith("s.")) put(sources, name.slice(2).split("."), val);
  }
  for (const k of Object.keys(sources)) {
    sources[k] = (sources[k] || []).filter(s => s && (String(s.url || "").trim() || String(s.quote || "").trim()))
      .map(s => ({ kind: s.kind || "other", url: String(s.url || "").trim(), quote: String(s.quote || "").trim() }));
    if (!sources[k].length) delete sources[k];
  }
  if (data.timeline && data.timeline.rows) data.timeline.rows = data.timeline.rows.filter(Boolean);
  for (const slot of Object.keys(data.photos || {})) if (!data.photos[slot].path) delete data.photos[slot];
  return { data, sources, caption };
}
