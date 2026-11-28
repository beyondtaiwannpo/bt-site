// 後台「內部表單」那一組的畫面（2026-11-29）：要填的表單、建表單與看結果。
// 前半段（側欄、外殼、回饋、自動儲存、成員區）2026-11-29 從 admin/finance/src/ui.js 原樣抄過來，七份一模一樣（test/admin-hub.test.mjs 逐字比對）。
// **esc 是自己的一份**，不從別的資料夾 import。
// **esc 是自己的一份**，不從別的資料夾 import。
// 申請管理的畫面。**esc 是自己的一份**，不從別的資料夾 import
//（跟 app/ 與 availability/ 同一條規矩：資料夾之間不互相依賴）。
//
// 2026-10-19 起畫面上的字全部從 ./strings.js 的字典來（T("鍵")），中英兩版並排在那一支裡。
// 這一支只管拼 HTML，不再寫死任何一句給人看的字。怎麼加一句見 README「後台的中英切換」。
import { T, lang, setLang, withLang, isErr, STRINGS } from "./strings.js";
export { T, lang, setLang };
// 表單引擎（2026-12-23，shared/forms.js）：題目畫布、條件邏輯面板、一頁一頁填的表單、預覽都在那裡，三套表單共用。
import * as F from "../../../shared/forms.js";
export { F };
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
// 設定拆成上下兩個存檔的框（2026-11-23）之後，讀的時候同一種框一起讀，動哪一個都存整份。
// 只讀存檔的框，不讀整頁：畫布上的題目也有 name，混進來會把設定蓋掉。
export function allValues(box, act) {
  const doc = box && box.ownerDocument;
  const boxes = doc && doc.querySelectorAll ? [...doc.querySelectorAll(`[data-autosave="${act}"]`)] : [];
  return Object.assign({}, ...(boxes.length ? boxes : [box]).map(formValues));
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
  // o.extra（2027-01-25）：右欄每一列 team 那個位置改畫別的。整個工作區用它寫「少哪幾樣」（Paul 2026-11-28 看不懂為什麼大家都在右欄）。
  // 整個工作區（2027-01-24）：右欄列的是「勾起來的那幾樣還沒全部有」的人，不是「一樣都沒有」的人。
  // Paul：「I add everyone into whole BT and they should just have application, cadre, meeting and everything」——大家本來都有幹部護照，
  // 舊的算法把他們都算成「在裡面」，右欄空的，其他幾樣就加不進去。fullIds 是 wsGroupHTML 算好傳進來的。
  const inIds = o.draft ? pk.ticked : (o.fullIds || rows.map(r => r.user_id));
  const cands = pkCandidates(people, inIds, o.all);
  const shown = pkShown(cands, pk);
  const ticked = new Set(pk.ticked);
  const n = o.draft ? 0 : pkPicked(people, inIds, pk, o.all).length;
  const teamsHere = PK_TEAMS.filter(t => cands.some(p => pkTeamsOf(p).includes(t)));
  const chip = t => `<button type="button" class="chip sm${pk.teams.includes(t) ? " on" : ""}" data-act="pk-team" data-ns="${esc(ns)}" data-team="${esc(t)}"${dis}>${esc(short(t))}</button>`;
  const cand = p => `<label class="ma-row pick${ticked.has(p.id) && !o.draft ? " on" : ""}"><input type="checkbox" name="${esc(ns)}-member" value="${esc(p.id)}" data-act="pk-tick" data-ns="${esc(ns)}"${ticked.has(p.id) && !o.draft ? " checked" : ""}${dis}>${nameBlock(p)}${rankTag(p.board_role)}${o.extra ? o.extra(p) : teamsHTML(p)}</label>`;
  const goBtn = o.go ? `<button class="btn sm" data-act="${esc(o.go.act)}" data-ns="${esc(ns)}"${Object.keys(o.go).filter(k => k !== "act").map(k => ` data-${k}="${esc(String(o.go[k]))}"`).join("")}${o.busy || !n ? " disabled" : ""}>${o.busy ? T("common.saving") : T("pk.addN", { n })}</button>` : "";
  const levelSel = `<select id="${esc(ns)}-level" data-act="pk-level" data-ns="${esc(ns)}" aria-label="${esc(T("pk.level"))}"${dis}>${["view", "edit", "manage"].map(l => `<option value="${l}"${pk.level === l ? " selected" : ""}>${esc(T("level." + l))}</option>`).join("")}</select>`;
  return `<div class="ma picker" data-ns="${esc(ns)}">
    <section class="ma-col"><div class="ma-head"><div class="ma-title">${left.title}</div>
        <input id="${esc(ns)}-mq" class="ma-find" value="${esc(pk.mq || "")}" placeholder="${esc(T("pk.findPh"))}" autocomplete="off" data-act="pk-mq" data-ns="${esc(ns)}"${dis}>${left.tools || ""}</div>
      <div class="ma-list">${left.items.length ? left.items.join("") : `<div class="ma-empty mini">${left.n ? T("pk.noneShown") : left.empty}</div>`}</div>${left.foot || ""}</section>
    <section class="ma-col"><div class="ma-head"><div class="ma-title">${o.outTitle ? o.outTitle(cands.length) : T("ma.out", { n: cands.length })}${shown.length !== cands.length ? `<span class="mini"> ${T("ma.shown", { n: shown.length })}</span>` : ""}</div>
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
// 2027-01-24（Paul：「calendar, meeting, projects, forms, my passport, venues… all of those should be a project we can assign」）：
// 整個 BT 的每一樣工具都是一格，派人就是打勾。錢搬到 Sponsorship 那一列（「Money should be under sponsorship」）。
export const WHOLE_BT_TOOLS = ["custom:calendar", "custom:meetings", "custom:projects", "custom:forms", "custom:my-passport", "custom:venues"];
const ORG_WS = new Set(["records", "custom:records", "custom:meeting-templates", "custom:team-forms", "custom:website", ...WHOLE_BT_TOOLS]);
// Senior 那一列（2027-01-24）：Internal（人與權限）。放進去的人跟 Co-President 一樣（2027-01-24-whole-bt-tools.sql）。
export const SENIOR = "Senior";
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
  if (id === "finance" || id === "custom:money") return "Sponsorship Team";
  if (id === "custom:internal") return SENIOR;
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
  if (id === "custom:calendar") return "/home/#calendar";
  if (id === "custom:meetings") return "/admin/#meetings";
  if (id === "custom:projects") return "/admin/#projects";
  if (id === "custom:forms") return "/admin/team-forms/#all";
  if (id === "custom:my-passport") return "/passport/";
  if (id === "custom:venues") return "/admin/#venues";
  if (id === "custom:internal") return "/admin/people/#roster";
  return "/admin/people/#ws=" + encodeURIComponent(id);
}
// 分組：[{ team: "" 或 team 名, label, cells: [workspace…] }]，整個 BT 那一列在最上面，然後照 teams 的順序，最後是清單外的 team。
export function wsRows(workspaces, teams, people) {
  // 一場一場的活動不列在這裡（2026-12-25）：在那一場自己的「人」分頁改，這張表才不會隨活動越來越長。
  const active = (workspaces || []).filter(w => w.active !== false && !String(w.id).startsWith("custom:event-"));
  // 整個 BT 那一列：每個人每天用的六樣在前面（跟側欄最上面同一個順序），再來是要特別派的。
  const order = { "custom:calendar": -6, "custom:meetings": -5, "custom:projects": -4, "custom:forms": -3, "custom:my-passport": -2, "custom:venues": -1,
    apps: 0, passport: 1, "intern-passport": 3 };
  // 專案排在每一列最後（2026-12-26），那個 team 自己的工具在前面。
  const rank = w => w.kind === "project" ? 10 : w.id.startsWith("apps:") ? 1 : w.id.startsWith("res:") ? 2 : (order[w.id] != null ? order[w.id] : 9);
  const groups = new Map([["", []], [SENIOR, []]]);
  for (const t of teams || []) groups.set(t, []);
  for (const w of active) { const t = wsTeamOf(w, people); if (!groups.has(t)) groups.set(t, []); groups.get(t).push(w); }
  return [...groups.entries()].map(([team, cells]) => ({ team, label: team === SENIOR ? T("ws.senior") : team ? team.replace(/\s*Team$/i, "") : T("ws.board"), cells: cells.sort((a, b) => rank(a) - rank(b)) }));
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
// 內部表單（2026-11-29）。Paul 2026-11-05：「a internal form for all of us ... like a tally form」，
// 接著「make everything changeable like who's able to read, sending it out to who, all that」。
// 資料庫那一半在 supabase/migrations/2026-11-29-team-forms.sql，門在那裡每一支函式的第一句。
// 這一半：純函式（名單怎麼算、結果怎麼統計、名字怎麼找）加畫面。**少畫一顆按鈕不是安全機制。**
// ═══════════════════════════════════════════════════════════════════════

// 收得了哪些題型：引擎全部，**除了上傳檔案**（內部表單沒有放檔案的地方）。
// 還沒跑 2026-12-23-team-forms-engine.sql 的資料庫只收舊的五種（D.engineReady 看得出來）。
export const TYPES = F.ALL_TYPES.filter(t => t !== "file");
export const OLD_TYPES = ["short", "long", "single", "multi", "scale"];
const isEn = () => lang() === "en";
// 新的一題的 id 在瀏覽器先產好：條件邏輯可能在存檔之前就指到它，資料庫照這個 id 存（那個 id 沒人用過才照用）。
export function newId() {
  try { if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID(); } catch (e) { /* 舊瀏覽器走下面 */ }
  const h = n => Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join("");
  return `${h(8)}-${h(4)}-4${h(3)}-${"89ab"[Math.floor(Math.random() * 4)]}${h(3)}-${h(12)}`;
}
// 畫布上「＋」加的一塊：引擎的空白題，加上 id；要收答案的題先給一句題目（資料庫不收沒有題目的題）。
export function newBlock(type) {
  const q = Object.assign(F.blankBlock(type, isEn()), { id: newId() });
  if (!q.label && !["text", "page"].includes(type)) q.label = T("ed.newQ");
  return q;
}
export function copyBlock(q) { return Object.assign(F.duplicateOf(q, isEn()), { id: newId() }); }
// 一塊存之前先擋的兩件事（資料庫也會擋，這裡是讓人當下就知道）。回空字串是沒問題。
export function blockProblem(q) {
  if (!String(q.label || "").trim() && !["text", "page"].includes(q.type)) return T("says.needLabel");
  if (F.isChoice(q) && (q.options || []).length < 2) return T("says.needOptions");
  return "";
}
export const RANKS = ["president", "senior_adviser", "director", "adviser", "member"];
export const ROLES = ["recipient", "reader", "editor"];

// 我在側欄上能不能進「建表單與看結果」：my_access() 的 team-forms 那一格（edit 建得了、view 是某一份的讀者）。
export const tfLevel = me => String(((me && me.ws) || {})["team-forms"] || "");

// ── 名單怎麼算（跟資料庫的 tf_match 同一條規則，只是畫面上算人數用）──
const teamsOf = p => String((p && p.team) || "").split(/[,、;；]/).map(s => s.trim()).filter(Boolean);
export function matchItem(p, it) {
  if (!p || !it) return false;
  if (it.kind === "all") return true;
  if (it.kind === "rank") return (p.rank || "member") === it.value;
  if (it.kind === "team") return teamsOf(p).some(t => t.toLowerCase() === String(it.value || "").trim().toLowerCase());
  if (it.kind === "person") return p.id === it.value;
  return false;
}
export const peopleIn = (people, items) => (people || []).filter(p => (items || []).some(it => matchItem(p, it)));
export function audOf(audience, role) {
  return (audience || []).filter(a => a.role === role).map(a => ({ kind: a.kind, value: a.value || "" }));
}
const itemKey = it => `${it.kind}:${it.value || ""}`;
export function toggleItem(items, it) {
  const k = itemKey(it), has = (items || []).some(x => itemKey(x) === k);
  return has ? items.filter(x => itemKey(x) !== k) : [...(items || []), { kind: it.kind, value: it.value || "" }];
}
export const hasItem = (items, it) => (items || []).some(x => itemKey(x) === itemKey(it));
export const sameItems = (a, b) => JSON.stringify((a || []).map(itemKey).sort()) === JSON.stringify((b || []).map(itemKey).sort());
// 畫面上列得出來的 team：固定六個加名單上有人勾的。
export function teamList(people) {
  const s = new Set(PK_TEAMS);
  for (const p of people || []) for (const t of teamsOf(p)) s.add(t);
  return [...s];
}
export function findPeople(people, q, skip) {
  const n = normName(q);
  if (!n) return [];
  const no = new Set(skip || []);
  return (people || []).filter(p => !no.has(p.id) && [p.name, p.name_zh, p.name_en].some(x => normName(x).includes(n))).slice(0, 8);
}

// ── 結果怎麼統計 ──
const splitMulti = v => String(v || "").split("\n").map(s => s.trim()).filter(Boolean);
// 結果只列會收答案的題：小標題、一段說明、換頁不列。
export const answerable = questions => (questions || []).filter(q => F.isInput(q));
const scaleEnds = q => { const c = q.config || {}; const pick = (a, b, d) => Number(a != null ? a : b != null ? b : d); return [pick(c.scale_min, q.scale_min, 1), pick(c.scale_max, q.scale_max, 5)]; };
export function summarize(questions, responses) {
  const rs = responses || [];
  return answerable(questions).map(q => {
    const vals = rs.map(r => String(((r.answers || {})[q.id]) || "")).filter(v => v !== "");
    // 同意勾選：算幾個人勾了。
    if (q.type === "consent") return { q, n: vals.length, consent: vals.filter(v => v === "yes").length };
    // 下拉跟單選一樣算票數；選項外的答案（「其他」自己寫的、或改過選項之前的舊答案）另外列。
    if (q.type === "single" || q.type === "multi" || q.type === "dropdown") {
      const count = new Map((q.options || []).map(o => [o, 0])), other = new Map();
      for (const v of vals) for (const x of (q.type === "multi" ? splitMulti(v) : [v])) {
        if (count.has(x)) count.set(x, count.get(x) + 1); else other.set(x, (other.get(x) || 0) + 1);
      }
      return { q, n: vals.length, counts: [...count].map(([option, n]) => ({ option, n })), other: [...other].map(([option, n]) => ({ option, n })) };
    }
    if (q.type === "scale") {
      const nums = vals.map(Number).filter(Number.isFinite);
      const [lo, hi] = scaleEnds(q);
      const dist = [];
      for (let v = lo; v <= hi; v++) dist.push({ v, n: nums.filter(x => x === v).length });
      const avg = nums.length ? Math.round(nums.reduce((s, x) => s + x, 0) / nums.length * 100) / 100 : null;
      return { q, n: nums.length, avg, dist, lo, hi };
    }
    return { q, n: vals.length, texts: rs.filter(r => String(((r.answers || {})[q.id]) || "") !== "").map(r => ({ name: r.name || "", team: r.team || "", v: r.answers[q.id] })) };
  });
}

// ── CSV（寫）──
export function csvCell(v) {
  const s = String(v == null ? "" : v);
  return /[",\n\r]/.test(s) || /^[=+\-@]/.test(s) ? `"${(/^[=+\-@]/.test(s) ? "'" : "") + s.replace(/"/g, '""')}"` : s;
}
export function resultsCSV(questions, responses, anonymous) {
  const qs = answerable(questions);
  const head = [...(anonymous ? [] : [T("res.who"), T("res.team")]), T("res.when"), ...qs.map(q => q.label)];
  const rows = (responses || []).map(r => [...(anonymous ? [] : [r.name || "", r.team || ""]), r.submitted_at || "",
    ...qs.map(q => String(((r.answers || {})[q.id]) || "").replace(/\n/g, "; "))]);
  return "﻿" + [head, ...rows].map(r => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
export function csvFilename(title) {
  const slug = String(title || "form").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "form";
  return `bt-${slug}.csv`;
}

// ── 名字 ──
// 小寫、全形轉半形、拿掉標點與多的空白。中文名不分大小寫本來就一樣。
export function normName(s) {
  return String(s || "").normalize("NFKC").toLowerCase().replace(/[.,'’"()（）\-_/]+/g, " ").replace(/\s+/g, " ").trim();
}
// ── 日期 ──
export function fmtWhen(v) {
  if (!v) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const d = new Date(v);
  if (isNaN(d)) return String(v);
  try {
    return d.toLocaleString(lang() === "zh" ? "zh-TW" : "en-US", { timeZone: "Asia/Taipei", year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch (e) { return d.toISOString().slice(0, 16).replace("T", " "); }
}
// datetime-local 的值（台北時間），跟回存用的 ISO。
export function dtLocal(v) {
  if (!v) return "";
  const d = new Date(v); if (isNaN(d)) return "";
  const t = new Date(d.getTime() + 8 * 3600000);
  return t.toISOString().slice(0, 16);
}
export const fromLocal = s => s ? `${s}:00+08:00` : "";

// ── 畫面 ──
const statusTag = s => `<span class="tag ${s === "open" ? "open" : s === "closed" ? "closed" : "draft"}">${esc(T("st." + s))}</span>`;

// 要填的表單：還沒填的、填過的。
export function fillListHTML(boot, msg) {
  const b = boot || {}, todo = b.todo || [], mine = b.mine || [];
  const card = f => `<div class="kpi tf-card"><div class="kpi-l">${esc(f.title)}</div>
      <div class="kpi-h">${f.closes_at ? esc(T("fill.closes", { when: fmtWhen(f.closes_at) })) : ""}</div>
      <div class="kpi-a"><a class="btn sm" href="#fill/${esc(f.id)}" data-act="open-fill" data-id="${esc(f.id)}">${esc(T("fill.go"))}</a></div></div>`;
  return pageHead(T("fill.title"), T("fill.lede"), [])
    + msgHTML(msg)
    + sectionHTML(T("fill.todo"), todo.length ? `<div class="todo">${todo.map(card).join("")}</div>`
        : emptyHTML(T("fill.none"), esc(T("fill.noneHint"))))
    + sectionHTML(T("fill.mine"), mine.length ? `<ul class="flist">${mine.map(f => `<li><div class="fhead"><b>${esc(f.title)}</b> ${statusTag(f.status)}</div>
        <div class="fmeta">${esc(T("fill.sent", { when: fmtWhen(f.updated_at || f.submitted_at) }))}
        <a class="lnk" href="#fill/${esc(f.id)}" data-act="open-fill" data-id="${esc(f.id)}">${esc(T(f.can_change ? "fill.change" : "fill.see"))}</a></div></li>`).join("")}</ul>`
        : `<div class="mini">${esc(T("fill.mineNone"))}</div>`);
}

// ── 填的頁（2026-12-23 起是引擎的 runner：換頁、進度條、條件邏輯、驗證、這台裝置的草稿）──
// 資料庫存的答案是文字（多選用換行接起來），引擎要的是畫面上的值（多選是陣列）。
export function engineAnswers(questions, saved) {
  const out = {};
  for (const q of (questions || []).map(F.normalize)) {
    if (!F.isInput(q)) continue;
    const v = (saved || {})[q.id];
    if (v != null && v !== "") out[q.id] = F.fromText(q, v);
  }
  return out;
}
// 引擎送出來的 [{ q, v }] 變成 tf_submit 要的 { 題目 id: 值 }。藏起來的題引擎本來就不送。
export function toAnswerMap(payload) {
  const out = {};
  for (const x of payload || []) if (x && x.q) out[x.q] = x.v == null ? "" : String(x.v);
  return out;
}
// mount 的選項（不含要接到 main.js 的那幾個函式）。不在填的名單上的讀者也走這一條（看得到、點得過，送出不會真的送）。
export function runOpts(d, run) {
  const r = run || {};
  return { en: isEn(), answers: r.answers || {}, page: r.page || 0, showDraftNote: !!d.can_submit,
    submitLabel: T(d.mine ? "fill.update" : "fill.submit") };
}
// 填過、不能再改的時候：照自己的答案攤開給他看（每一格鎖住）。被條件藏起來的題當時沒有送，這裡也不列；沒答的寫「（沒答）」。
export function answeredHTML(questions, saved) {
  const items = (questions || []).map(F.normalize);
  const vals = engineAnswers(items, saved);
  const ev = F.evaluate(items, vals);
  const many = ev.pages.length > 1;
  const one = it => F.isInput(it) && F.toText(it, vals[it.id]) === ""
    ? `<div class="fx-q" data-fx="${esc(it.id)}"><p class="fx-label">${esc(it.label)}</p><p class="mini">${esc(T("fill.noAnswer"))}</p></div>`
    : F.questionHTML(it, vals[it.id], { en: isEn(), disabled: true, required: false });
  return `<div class="fx-form tf-done">${ev.pages.map(p => {
    const shown = p.items.filter(it => !ev.hidden.has(it.id));
    if (!shown.length) return "";
    return (p.title && many ? `<h3 class="fx-ptitle">${esc(p.title)}</h3>` : "") + shown.map(one).join("");
  }).join("")}</div>`;
}
// d 是 tf_fill() 回的（題目已經過 D.normQuestions）。run = { answers, page }：main.js 記著的、填到哪。
// 能填（或讀者預覽）的時候先把第一頁畫好放進 #tf-run，main.js 畫完再 mount 引擎接手（不會閃一下空白）。
export function fillHTML(d, msg, busy, run) {
  const f = d.form || {}, qs = d.questions || [], mine = d.mine;
  const notes = [];
  if (d.preview) notes.push(T("fill.preview"));
  else if (mine && !d.can_submit) notes.push(T("fill.done", { when: fmtWhen(mine.updated_at || mine.submitted_at) }));
  else if (mine) notes.push(T("fill.doneEdit", { when: fmtWhen(mine.updated_at || mine.submitted_at) }));
  else if (!d.can_submit && f.status === "closed") notes.push(T("fill.closedNow"));
  const who = `<div class="note">${esc(T("fill.who", { more: T("fill.whoMore") }))}${f.anonymous ? " " + esc(T("fill.anon")) : ""}</div>`;
  const st = run || { answers: engineAnswers(qs, (mine && mine.answers) || {}), page: 0 };
  let form;
  if (d.can_submit || d.preview) {
    const o = runOpts(d, st);
    const items = qs.map(F.normalize);
    form = `<div class="tf-run" id="tf-run" data-fill="${esc(f.id)}">${F.pageHTML(F.evaluate(items, st.answers), { answers: st.answers, page: st.page, busy }, o)}</div>`;
  } else if (mine) form = answeredHTML(qs, mine.answers);
  else form = F.flatHTML(qs, isEn());
  return pageHead(esc(f.title || ""), f.intro ? esc(f.intro).replace(/\n/g, "<br>") : "", [], { act: "back-fill", label: T("fill.back") })
    + msgHTML(msg) + notes.map(n => `<div class="note">${esc(n)}</div>`).join("") + who + form;
}
// 編輯器「預覽」與讀者預覽最上面那一句（引擎自己那一句講的是申請人，內部表單是幹部）。
export const previewTopHTML = () => `<p class="fx-pv">${esc(T("ed.previewNote"))}</p>`;

// 建表單與看結果：清單。
export function buildListHTML(boot, msg, busy, newDraft) {
  const b = boot || {}, forms = b.manage || [];
  const acts = b.can_create && !newDraft ? [{ act: "tf-new", label: T("build.new"), primary: true }] : [];
  const nf = newDraft ? `<div class="card inline-form"><h2>${esc(T("build.newTitle"))}</h2>
      <label><i>${esc(T("ed.name"))}</i><input id="tf-new-title" value="${esc(newDraft.title || "")}" placeholder="${esc(T("build.titlePh"))}" maxlength="200"></label>
      <div class="form-foot"><button class="btn" data-act="tf-create"${busy ? " disabled" : ""}>${esc(busy ? T("common.saving") : T("build.create"))}</button>
      <button class="btn ghost" data-act="tf-new-cancel">${esc(T("common.cancel"))}</button></div></div>` : "";
  const row = f => `<li><div class="fhead"><a href="#build/${esc(f.id)}" data-act="open-form" data-id="${esc(f.id)}"><b>${esc(f.title)}</b></a> ${statusTag(f.status)}${f.role === "reader" ? ` <span class="tag">${esc(T("build.reader"))}</span>` : ""}</div>
      <div class="fmeta">${esc(T("build.count", { n: f.responses, of: f.recipients }))}${f.owner_name ? "・" + esc(T("build.by", { name: f.owner_name })) : ""}${f.closes_at ? "・" + esc(T("fill.closes", { when: fmtWhen(f.closes_at) })) : ""}</div></li>`;
  return pageHead(T("build.title"), T("build.lede"), acts)
    + msgHTML(msg) + (b.can_create ? "" : `<div class="note">${esc(T("build.cantCreate"))}</div>`) + nf
    + (forms.length ? `<ul class="flist">${forms.map(row).join("")}</ul>` : emptyHTML(T("build.none"), esc(T("build.noneHint")), b.can_create && !newDraft ? { act: "tf-new", label: T("build.new") } : null));
}

// ── 所有表單（2026-11-27，#all）────────────────────────────────────────────
// Paul 2026-11-27：「when they wanted to create a form, either a sign-up form or a feedback form, they should be able to create that and then attach it
//   or link it to a specific event that can go public… Or if they want to create an internal form and send out to everyone, they can.
//   But they should be able to know like what's going on and like what form is for what」。
// 三種表單本來在三個地方（報名表在活動與專案裡、回饋表在紀錄裡、內部表單在這裡），這一頁把「我管得到的」排成一張清單：
// 每一份前面一個類型的標，後面寫是哪一場活動的、開著沒、收了幾份。最下面「建一份」先選類型。
// all 是 my_forms() 回的（data.js loadMyForms）；pick = { kind: 建一份選了哪一種, filter: 清單只看哪一種 }。純函式，test/forms-hub.test.mjs 測。
export const ALL_KINDS = ["signup", "feedback", "internal"];
const tName = o => o ? ((lang() === "zh" ? (o.title_zh || o.title_en) : (o.title_en || o.title_zh)) || o.slug || "") : "";
// 三種表單排成一張清單，最近改過的在最上面。
export function allRows(all) {
  const a = all || {};
  const one = (kind, f) => ({ kind, id: f.id, title: f.title || "", status: f.status || "draft", updated_at: f.updated_at || "", can_edit: !!f.can_edit,
    event: f.event || null, project: f.project || null, total: f.total, received: f.received, responses: f.responses, recipients: f.recipients });
  return [...(a.signup || []).map(f => one("signup", f)), ...(a.feedback || []).map(f => one("feedback", f)), ...(a.internal || []).map(f => one("internal", f))]
    .sort((x, y) => String(y.updated_at).localeCompare(String(x.updated_at)));
}
// 一份點下去到哪：報名表到後台的報名表頁、回饋表到紀錄那一頁、內部表單是這個資料夾自己的 #build/<id>。
export function allHref(r) {
  if (r.kind === "signup") return withLang("/admin/#forms/" + encodeURIComponent(r.id));
  if (r.kind === "feedback") return withLang("/admin/records/#forms/" + encodeURIComponent(r.id));
  return "#build/" + encodeURIComponent(r.id);
}
function allRowHTML(r) {
  const of = r.event ? T("all.ofEvent", { event: esc(tName(r.event)) }) : r.project ? T("all.ofProject", { project: esc(tName(r.project)) }) : r.kind === "internal" ? "" : esc(T("all.noEvent"));
  const hidden = r.kind === "signup" && r.event && ["draft", "ready"].includes(r.event.status) ? esc(T("all.evDraft")) : "";
  const n = r.kind === "signup" ? T("all.apps", { n: r.total || 0, r: r.received || 0 })
    : r.kind === "feedback" ? T("all.replies", { n: r.responses || 0 }) : T("all.sent", { n: r.responses || 0, of: r.recipients || 0 });
  const link = r.kind === "internal" ? `href="${esc(allHref(r))}" data-act="open-form" data-id="${esc(r.id)}"` : `href="${esc(allHref(r))}"`;
  return `<li class="all-row"><div class="fhead"><span class="tag kind k-${r.kind}">${esc(T("all.k." + r.kind))}</span><a ${link}><b>${esc(r.title || T("common.noName"))}</b></a> ${statusTag(r.status)}${r.can_edit ? "" : ` <span class="tag">${esc(T("all.viewOnly"))}</span>`}</div>
      <div class="fmeta">${[of, esc(n), hidden].filter(Boolean).join("・")}</div></li>`;
}
export function allFormsHTML(all, msg, busy, pick) {
  const p = pick || {}, a = all || {}, rows = allRows(all);
  const shown = p.filter ? rows.filter(r => r.kind === p.filter) : rows;
  const chip = (k, label, n) => `<button type="button" class="chip${(p.filter || "") === k ? " on" : ""}" data-act="all-filter" data-k="${k}" aria-pressed="${(p.filter || "") === k}">${esc(label)}${n ? ` <span class="subtab-n">${n}</span>` : ""}</button>`;
  const chips = rows.length ? `<div class="chips" role="group" aria-label="${esc(T("all.filter"))}">${chip("", T("all.any"), rows.length)}${ALL_KINDS.map(k => chip(k, T("all.k." + k), rows.filter(r => r.kind === k).length)).join("")}</div>` : "";
  const list = !all ? skeletonHTML()
    : rows.length ? (shown.length ? `<ul class="flist">${shown.map(allRowHTML).join("")}</ul>` : `<p class="note">${esc(T("all.noneKind"))}</p>`)
    : emptyHTML(T("all.none"), esc(T("all.noneHint")), null);
  return pageHead(esc(T("all.title")), esc(T("all.lede")), [])
    + msgHTML(msg) + chips + list + (all ? newFormHTML(a, p, busy) : "");
}
// 建一份：三張卡選類型，選了報名表或回饋表就多一格「掛在哪一場活動上」（只列他改得動的，my_forms 的 events）。
export function newFormHTML(all, pick, busy) {
  const p = pick || {}, evs = (all && all.events) || [];
  const card = k => `<button type="button" class="kind-card${p.kind === k ? " on" : ""}" data-act="all-kind" data-k="${k}" aria-pressed="${p.kind === k}">
      <span class="tag kind k-${k}">${esc(T("all.k." + k))}</span><span class="kc-h">${esc(T("all.h." + k))}</span></button>`;
  let more = "";
  if (p.kind === "signup" || p.kind === "feedback") {
    more = evs.length ? `<label class="all-ev"><i>${esc(T("all.pickEv"))}</i><select id="all-ev"><option value="">${esc(T("all.pickEvPh"))}</option>${evs.map(e =>
        `<option value="${esc(e.id)}">${esc(tName(e))}${p.kind === "signup" && e.has_form ? " " + esc(T("all.hasForm")) : ""}</option>`).join("")}</select></label>
      <div class="form-foot"><button class="btn" data-act="all-make"${busy ? " disabled" : ""}>${esc(busy ? T("all.making") : T(p.kind === "signup" ? "all.makeSignup" : "all.makeFeedback"))}</button></div>`
      : `<p class="note">${esc(T("all.noEvents"))}</p>`;
  } else if (p.kind === "internal") {
    more = all && all.can_create_internal ? `<div class="form-foot"><a class="btn" href="#build" data-act="all-internal">${esc(T("all.goInternal"))}</a></div>` : `<p class="note">${esc(T("all.cantInternal"))}</p>`;
  }
  return `<section class="card all-new" aria-labelledby="all-new-h"><h2 id="all-new-h">${esc(T("all.new"))}</h2><p class="mini">${esc(T("all.newLede"))}</p>
    <div class="kind-cards">${ALL_KINDS.map(card).join("")}</div>${more}</section>`;
}

// 編輯畫面的頁首與分頁。
// 2026-11-24：「題目與設定」拆成「題目」與「設定」兩個分頁（Paul 看過活動編輯頁的分頁之後：「do the same thing… for the whole BT… sign up form should be like that, feedback form should be like that」）。
// 設定那兩個框只在「設定」分頁裡畫，題目的畫布只在「題目」分頁裡畫：存設定的時候是把同名的框一起讀（allValues），兩個框都在同一個分頁，所以不會少讀。
// 那一排分頁跟活動編輯頁同一個樣子（.subtabs），不再是藥丸。
export const SUBS = ["questions", "settings", "people", "results", "log"];
export function editorHeadHTML(a, sub) {
  const f = a.form || {}, edit = !!a.can_edit;
  const acts = [];
  if (edit) {
    if (f.status === "draft") acts.push({ act: "tf-status", id: "open", label: T("ed.open"), primary: true });
    if (f.status === "open") acts.push({ act: "tf-status", id: "closed", label: T("ed.close") });
    if (f.status === "closed") acts.push({ act: "tf-status", id: "open", label: T("ed.reopen") });
  }
  const tabs = `<nav class="subtabs ptabs" aria-label="${esc(T("ed.tabs"))}">${SUBS.map(s => `<a class="subtab${s === sub ? " on" : ""}"${s === sub ? ' aria-current="page"' : ""} href="#build/${esc(f.id)}/${s}" data-act="sub" data-t="${s}">${esc(T("ed.tab." + s))}</a>`).join("")}</nav>`;
  return pageHead(`${esc(f.title || "")} ${statusTag(f.status)}`, esc(T("st." + f.status + "Hint")) + `<br><span class="mini">${esc(T("build.count", { n: a.responses || 0, of: a.recipients || 0 }))}</span>`, acts, { act: "back-build", label: T("ed.back") })
    + (edit ? "" : `<div class="note">${esc(T("ed.readonly"))}</div>`) + tabs;
}

// 題目與設定。設定那一塊改了就存（main.js 的 onAutosave tf-save）；題目是引擎的畫布（shared/forms.js 的 canvasHTML），
// 每一塊各自是 data-autosave="tf-q"，打完就存；加、刪、移、複製、拖曳、條件邏輯的按鈕改的是整份清單，存完重畫。
// fx：{ mode: "edit"|"preview", menuAt（哪一條「＋」開著）, filter（/ 後面打的字）, logicOpen: Set }。沒給就是編輯、選單收著。
export function questionsEditHTML(a, msg, busy, fx, sub) {
  const f = a.form || {}, qs = a.questions || [], edit = !!a.can_edit, dis = edit ? "" : " disabled";
  const e = fx || {};
  const anonLocked = f.anonymous && (a.responses || 0) > 0;
  const locked = new Set(qs.filter(q => q.answered).map(q => q.id));
  const canvas = F.modeHTML(e.mode, isEn())
    + (e.mode === "preview" ? `<div class="fx-pvbox" id="fx-pv"></div>`
      : (qs.length ? "" : `<p class="mini">${esc(T("ed.noQHint"))}</p>`)
        + F.canvasHTML(qs, { en: isEn(), canEdit: edit, menuAt: e.menuAt, filter: e.filter, logicOpen: e.logicOpen, lockedIds: locked,
            types: a.engine === false ? OLD_TYPES : TYPES, prefill: false, act: "tf-q", hint: () => edit ? autosaveHint("tf-q") : "" }));
  // 2026-11-23 照做事的順序拆成三段：名稱與說明 → 題目 → 截止時間與規則。2026-11-24 題目自己一個分頁，另外兩段在「設定」分頁（sub）。
  // 匿名留在上面：有人答過就鎖住，要在發出去之前定。開放與關閉是頁首那顆鈕。
  // 存檔的框變成上下兩個，都是 tf-save；readSettings 兩個框一起讀，動哪一個都存整份。
  if (sub !== "settings") return msgHTML(msg) + sectionHTML(T("ed.questions"), `<div class="mini" style="margin-bottom:10px">${esc(T("ed.qNote"))}</div>
      ${a.engine === false ? `<div class="note">${esc(T("ed.oldDb"))}</div>` : ""}
      ${canvas}`);
  return msgHTML(msg) + `<div data-autosave="tf-save" data-id="${esc(f.id)}">`
    + sectionHTML(T("ed.basics"), `<div class="tf-settings">
      <label><i>${esc(T("ed.name"))}</i><input name="title" value="${esc(f.title)}" maxlength="200"${dis}></label>
      <label><i>${esc(T("ed.intro"))}</i><textarea name="intro" rows="3" placeholder="${esc(T("ed.introPh"))}"${dis}>${esc(f.intro || "")}</textarea></label>
      <label class="check"><input type="checkbox" name="anonymous"${f.anonymous ? " checked" : ""}${dis || (anonLocked ? " disabled" : "")}><span>${esc(T("ed.anon"))}</span></label>
      ${anonLocked ? `<div class="mini">${esc(T("ed.anonLocked"))}</div>` : ""}
      ${edit ? `<div class="form-foot">${autosaveHint("tf-save")}</div>` : ""}</div>`)
    + `</div>`
    + `<div data-autosave="tf-save" data-id="${esc(f.id)}">`
    + sectionHTML(T("ed.window"), `<div class="tf-settings">
      <label><i>${esc(T("ed.closes"))}</i><input type="datetime-local" name="closes_at" value="${esc(dtLocal(f.closes_at))}"${dis}></label>
      <label class="check"><input type="checkbox" name="allow_edit"${f.allow_edit ? " checked" : ""}${dis}><span>${esc(T("ed.allowEdit"))}</span></label>
      ${edit ? `<div class="form-foot">${autosaveHint("tf-save")}</div>` : ""}</div>`)
    + `</div>`
    + (a.can_edit_editors ? sectionHTML("", `<div class="row"><span class="sp"></span><button class="btn quiet sm" data-act="tf-delete" data-id="${esc(f.id)}">${esc(T("ed.delete"))}</button></div>`) : "");
}
// 設定那一塊讀成 tf_save_form 的 p_data。
export function readSettings(box) {
  const v = allValues(box, "tf-save");
  return { title: v.title || "", intro: v.intro || "", closes_at: fromLocal(v.closes_at || ""), allow_edit: !!v.allow_edit, anonymous: !!v.anonymous };
}

// 發給誰、誰看得到、誰改得動。aud = { recipient: [...], reader: [...], editor: [...] }（畫面上還沒存的），saved 同形狀。
export function audienceHTML(a, people, aud, saved, find, msg, busy) {
  const edit = !!a.can_edit, f = a.form || {};
  const block = role => {
    const can = role === "editor" ? !!a.can_edit_editors : edit;
    const items = aud[role] || [];
    const dis = can ? "" : " disabled";
    const chip = (it, label) => `<button type="button" class="chip${hasItem(items, it) ? " on" : ""}" data-act="aud-toggle" data-role="${role}" data-kind="${it.kind}" data-value="${esc(it.value || "")}" aria-pressed="${hasItem(items, it)}"${dis}>${esc(label)}</button>`;
    const persons = items.filter(it => it.kind === "person").map(it => (people || []).find(p => p.id === it.value) || { id: it.value, name: it.value });
    const inNow = peopleIn(people, items);
    const q = (find || {})[role] || "";
    const hits = can ? findPeople(people, q, persons.map(p => p.id)) : [];
    const dirty = !sameItems(items, saved[role]);
    return sectionHTML(esc(T("aud." + role)), `<div class="mini">${esc(T("aud." + role + "Hint"))}</div>
      ${role === "reader" || role === "editor" ? `<div class="mini">${esc(T("aud.always", { owner: f.owner_name || "" }))}</div>` : ""}
      ${role !== "editor" ? `<div class="tf-aud-row"><b>${esc(T("aud.all"))}</b><div class="chips">${chip({ kind: "all", value: "" }, T("aud.all"))}</div></div>` : ""}
      <div class="tf-aud-row"><b>${esc(T("aud.ranks"))}</b><div class="chips">${RANKS.map(r => chip({ kind: "rank", value: r }, T("rank." + r))).join("")}</div></div>
      <div class="tf-aud-row"><b>${esc(T("aud.teams"))}</b><div class="chips">${teamList(people).map(t => chip({ kind: "team", value: t }, t.replace(/\s*Team$/i, ""))).join("")}</div></div>
      <div class="tf-aud-row"><b>${esc(T("aud.people"))}</b><div class="chips">${persons.length ? persons.map(p => `<button type="button" class="chip on" data-act="aud-toggle" data-role="${role}" data-kind="person" data-value="${esc(p.id)}" aria-label="${esc(T("aud.remove", { name: p.name }))}"${dis}>${esc(p.name)} ×</button>`).join("") : `<span class="mini">${esc(T("aud.nobodyYet"))}</span>`}</div>
        ${can ? `<input type="search" class="tf-find" data-role="${role}" id="tf-find-${role}" value="${esc(q)}" placeholder="${esc(T("aud.search"))}" autocomplete="off" data-noauto="1">
        ${hits.length ? `<div class="chips tf-hits">${hits.map(p => `<button type="button" class="chip" data-act="aud-toggle" data-role="${role}" data-kind="person" data-value="${esc(p.id)}">+ ${esc(p.name)}${p.team ? `<small> ${esc(teamsOf(p).map(t => t.replace(/\s*Team$/i, "")).join(", "))}</small>` : ""}</button>`).join("")}</div>` : ""}` : ""}</div>
      ${role === "reader" && items.some(it => it.kind !== "person") ? `<div class="msg err" role="status"><span class="msg-k">!</span><span>${esc(T("aud.readerWarn"))}</span></div>` : ""}
      <details class="tf-count"><summary>${esc(T("aud.count", { n: inNow.length }))}${inNow.length ? `・${esc(T("aud.countSee"))}` : ""}</summary><div class="mini">${inNow.map(p => esc(p.name)).join(esc(T("punct.list")))}</div></details>
      ${can ? `<div class="form-foot"><button type="button" class="btn${dirty ? "" : " ghost"}" data-act="aud-save" data-role="${role}"${busy || !dirty ? " disabled" : ""}>${esc(T("aud.save"))}</button>${dirty ? `<span class="mini">${esc(T("aud.unsaved"))}</span>` : ""}</div>` : (role === "editor" && edit ? `<div class="mini">${esc(T("aud.readonly"))}</div>` : "")}`, { id: "aud-" + role });
  };
  return msgHTML(msg) + ROLES.map(block).join("");
}

// 結果。r 是 tf_results() 回的。
export function resultsHTML(r, msg, showAll) {
  const f = r.form || {}, qs = r.questions || [], rs = r.responses || [], pending = r.pending || [];
  const anon = !!f.anonymous;
  const kpis = `<div class="todo">${[["res.answered", rs.length], ["res.pending", pending.length]].map(([k, n]) => `<div class="kpi"><div class="kpi-n">${n}</div><div class="kpi-l">${esc(T(k))}</div><div class="kpi-h">${esc(T("res.of", { n: r.recipients || 0 }))}</div></div>`).join("")}</div>`;
  if (!rs.length) return msgHTML(msg) + kpis + emptyHTML(T("res.none"), esc(T("res.noneHint"))) + pendingHTML(pending);
  const bar = (label, n, of) => `<div class="tf-bar"><span class="tf-bar-l">${esc(label)}</span><span class="tf-bar-t"><i style="width:${of ? Math.round(n / of * 100) : 0}%"></i></span><b>${n}</b></div>`;
  const sums = summarize(qs, rs).map((s, i) => {
    const head = `<h3 class="tf-sq">${i + 1}. ${esc(s.q.label)} <span class="mini">${esc(F.typeLabel(s.q.type, isEn()))}</span></h3>`;
    if (s.consent != null) return `<div class="card tf-sum">${head}${bar(T("res.agreed"), s.consent, Math.max(1, rs.length))}</div>`;
    if (s.counts) {
      const of = Math.max(1, ...s.counts.map(c => c.n), ...s.other.map(c => c.n));
      return `<div class="card tf-sum">${head}${s.counts.map(c => bar(c.option, c.n, of)).join("")}${s.other.map(c => bar(c.option + " " + T("res.other"), c.n, of)).join("")}</div>`;
    }
    if (s.dist) {
      const of = Math.max(1, ...s.dist.map(d => d.n));
      return `<div class="card tf-sum">${head}<div class="tf-avg">${esc(T("res.avg", { avg: s.avg == null ? "–" : s.avg, n: s.n, min: s.lo, max: s.hi }))}</div>${s.dist.map(d => bar(String(d.v), d.n, of)).join("")}</div>`;
    }
    const list = showAll && showAll[s.q.id] ? s.texts : s.texts.slice(0, 6);
    return `<div class="card tf-sum">${head}<div class="mini">${esc(T("res.nAnswers", { n: s.n }))}</div>
      <ul class="tf-texts">${list.map(t => `<li><div>${esc(t.v).replace(/\n/g, "<br>")}</div>${anon ? "" : `<span class="mini">${esc(t.name)}${t.team ? "・" + esc(t.team) : ""}</span>`}</li>`).join("")}</ul>
      ${s.texts.length > list.length ? `<button type="button" class="lnk" data-act="res-more" data-id="${esc(s.q.id)}">${esc(T("res.showAll", { n: s.texts.length }))}</button>` : ""}</div>`;
  }).join("");
  const each = `<table class="table tf-each"><thead><tr>${anon ? "" : `<th>${esc(T("res.who"))}</th><th>${esc(T("res.team"))}</th>`}<th>${esc(T("res.when"))}</th></tr></thead><tbody>${rs.map(x => `<tr>
      ${anon ? "" : `<td class="t-main"><b>${esc(x.name)}</b></td>
        <td>${esc(x.team || "")}</td>`}
      <td>${esc(fmtWhen(x.submitted_at))}</td></tr>`).join("")}</tbody></table>`;
  return msgHTML(msg) + kpis
    + (anon ? `<div class="note">${esc(T("res.anon"))}</div>` : "")
    + `<div class="row"><span class="sp"></span><button class="btn ghost sm" data-act="res-csv">${esc(T("res.csv"))}</button></div>`
    + sectionHTML(T("res.summary"), sums)
    + sectionHTML(T("res.each"), `<div class="tf-scroll">${each}</div>`)
    + pendingHTML(pending);
}
function pendingHTML(pending) {
  return sectionHTML(T("res.pendingList"), pending.length ? `<div class="chips">${pending.map(p => `<span class="chip off">${esc(p.name)}</span>`).join("")}</div>` : `<div class="mini">${esc(T("res.allDone"))}</div>`);
}

export function logHTML(a) {
  const rows = a.log || [];
  if (!rows.length) return `<div class="mini">${esc(T("log.none"))}</div>`;
  const show = v => v == null ? "" : typeof v === "string" ? v : Array.isArray(v) ? v.map(x => x.kind === "all" ? T("aud.all") : x.kind === "rank" ? T("rank." + x.value) : x.value).join(", ") : JSON.stringify(v);
  return `<ul class="flist">${rows.map(l => `<li><div class="fhead"><b>${esc(T("log." + l.what) || l.what)}</b> <span class="mini">${esc(fmtWhen(l.at))}・${esc(l.who || "")}</span></div>
    <div class="fmeta">${l.before != null ? esc(show(l.before)) + " → " : ""}${esc(show(l.after))}</div></li>`).join("")}</ul>`;
}
