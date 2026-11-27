// 後台「搜尋」的畫面（2026-11-26）：一個框找遍會議紀錄、回饋表、內部表單與活動檢討。
// 前半段（側欄、外殼、回饋、自動儲存、成員區）2026-11-26 從 admin/team-forms/src/ui.js 原樣抄過來，每一份一模一樣（test/admin-hub.test.mjs 逐字比對）。
// **esc 是自己的一份**，不從別的資料夾 import（跟 app/ 與 availability/ 同一條規矩：資料夾之間不互相依賴）。
//
// 畫面上的字全部從 ./strings.js 的字典來（T("鍵")），中英兩版並排在那一支裡。怎麼加一句見 README「後台的中英切換」。
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
const ORG_WS = new Set(["records", "custom:records", "finance", "custom:money", "custom:meeting-templates", "custom:team-forms"]);
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
// 搜尋（2026-11-26）。Paul：要找一份舊的紀錄得一場一場會議點開來看，所以大家漸漸不用這些資料庫了。
// 一個框找遍會議紀錄、回饋表、內部表單、活動檢討；最上面先給整理，底下是連回原本那一頁的清單。
// 資料庫那一半在 supabase/migrations/2027-01-21-smart-search.sql：**每一筆都先問原本那一頁的門**，
// 這裡拿到的就是這個人讀得到的。這一半只是純函式加畫面。**少畫一筆不是安全機制，門在資料庫。**
// ═══════════════════════════════════════════════════════════════════════

export const SOURCES = ["meeting", "feedback", "internal", "review"];
export const KINDS = ["post-event", "alumni-yearly", "other"];
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// 網址的 # 後面放搜尋的字與篩選：#q=bootcamp&src=meeting,feedback&kind=post-event&event=<id>&from=2026-01-01&to=2026-06-30
// 這樣一次搜尋可以貼給別人，上一頁也回得去。認不得的值當成沒填。
export function parseQuery(hash) {
  const p = new URLSearchParams(String(hash || "").replace(/^#/, ""));
  const src = String(p.get("src") || "").split(",").filter(s => SOURCES.includes(s));
  const kind = KINDS.includes(p.get("kind")) ? p.get("kind") : "";
  const event = UUID.test(p.get("event") || "") ? p.get("event") : "";
  const from = DATE.test(p.get("from") || "") ? p.get("from") : "";
  const to = DATE.test(p.get("to") || "") ? p.get("to") : "";
  return { q: String(p.get("q") || "").slice(0, 200), f: { sources: [...new Set(src)], kind, event, from, to } };
}
export function queryHash(q, f) {
  const p = new URLSearchParams();
  const ff = f || {};
  if (String(q || "").trim()) p.set("q", String(q).trim());
  if ((ff.sources || []).length) p.set("src", ff.sources.join(","));
  for (const k of ["kind", "event", "from", "to"]) if (ff[k]) p.set(k, ff[k]);
  return p.toString();
}
// 送給資料庫的篩選：空的不送。
export function filtersOf(f) {
  const ff = f || {}, out = {};
  if ((ff.sources || []).length) out.sources = ff.sources;
  for (const k of ["kind", "event", "from", "to"]) if (ff[k]) out[k] = ff[k];
  return out;
}
export const hasFilters = f => Object.keys(filtersOf(f)).length > 0;

// 每一筆連回哪一頁。這一頁在 /admin/search/，所以都是往上一層。
export function hitHref(h) {
  const id = encodeURIComponent(String((h && h.ref) || ""));
  switch (h && h.source) {
    case "meeting":  return withLang(`../#meetings/${id}`);
    case "feedback": return withLang(`../records/#forms/${id}/results`);
    case "internal": return withLang(`../team-forms/#build/${id}/results`);
    case "review":   return withLang(`../records/#overview/${id}`);
    default:         return "";
  }
}

// 一段字，找到的詞包一層 <mark>。先切再跳脫：使用者寫的字一律 esc()，<mark> 是唯一加進去的標籤。
export function markHTML(text, terms) {
  const s = String(text == null ? "" : text);
  const ts = [...new Set((terms || []).map(t => String(t || "").trim()).filter(t => t.length >= 1))].sort((a, b) => b.length - a.length);
  if (!ts.length) return esc(s);
  const re = new RegExp("(" + ts.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") + ")", "gi");
  return s.split(re).map((part, i) => (i % 2 ? `<mark>${esc(part)}</mark>` : esc(part))).join("");
}

// 清單用哪一份：懂意思的那一次做完了（或正在整理）就用它的（它是認字那一份再多加別的寫法與意思接近的），不然用認字的。
export function hitsOf(S) {
  const a = S && S.ask;
  if (a && Array.isArray(a.hits) && a.hits.length && (a.status === "summarizing" || a.status === "done" || a.status === "failed")) return a.hits;
  return (S && S.res && S.res.results) || [];
}
export function termsOf(S) {
  const a = S && S.ask;
  if (a && Array.isArray(a.terms) && a.terms.length && a.status !== "retrieving") return a.terms;
  return (S && S.res && S.res.terms) || [];
}
// 整理裡的 [3] 是第幾筆：每一筆記著它送出去的是第幾段（cite）。
export function citeTarget(hits, n) {
  const i = (hits || []).findIndex(h => Array.isArray(h.cite) && h.cite.includes(n));
  return i;
}

const srcLabel = s => T("src." + s);
const evName = h => (lang() === "zh" ? (h.event_zh || h.event_en) : (h.event_en || h.event_zh)) || "";
const today = () => new Date().toISOString().slice(0, 10);

export function searchBoxHTML(S) {
  const ai = !!(S.opts && S.opts.claude);
  return `<form class="sx-box" data-form="search" role="search">
    <label class="sx-q"><span class="sr">${esc(T("q.label"))}</span>
      <input type="search" name="q" value="${esc(S.q)}" placeholder="${esc(T("q.ph"))}" autocomplete="off" enterkeyhint="search" maxlength="200" aria-describedby="sx-hint"></label>
    <button class="btn" type="submit"${S.busy ? " disabled" : ""}>${esc(T("q.go"))}</button>
  </form>
  <div class="mini sx-hint" id="sx-hint">${esc(T(ai ? "q.hintAi" : "q.hint"))}</div>`;
}

export function filtersHTML(S) {
  const f = S.f || {}, events = (S.opts && S.opts.events) || [];
  const chips = SOURCES.map(s => `<button type="button" class="chip${(f.sources || []).includes(s) ? " on" : ""}" data-act="src" data-v="${s}" aria-pressed="${(f.sources || []).includes(s)}">${esc(srcLabel(s))}</button>`).join("");
  // 回饋表的種類與活動只有讀得到回饋或檢討的人用得到（一般幹部的活動清單是空的，那兩格就不畫）。
  const canFb = events.length > 0;
  const kind = canFb ? `<label class="sx-f">${esc(T("f.kind"))}<select data-act="kind"><option value="">${esc(T("f.kindAll"))}</option>${
    KINDS.map(k => `<option value="${k}"${f.kind === k ? " selected" : ""}>${esc(T("kind." + k))}</option>`).join("")}</select></label>` : "";
  const ev = canFb ? `<label class="sx-f">${esc(T("f.event"))}<select data-act="event"><option value="">${esc(T("f.eventAll"))}</option>${
    events.map(e => `<option value="${esc(e.id)}"${f.event === e.id ? " selected" : ""}>${esc((lang() === "zh" ? (e.zh || e.en) : (e.en || e.zh)) || "")}${e.date ? ` · ${esc(String(e.date).slice(0, 7))}` : ""}</option>`).join("")}</select></label>` : "";
  return `<div class="sx-filters">
    <div class="sx-row"><span class="sx-lb">${esc(T("f.sources"))}</span><div class="chips">${chips}</div></div>
    <div class="sx-row sx-sel">${kind}${ev}
      <label class="sx-f">${esc(T("f.from"))}<input type="date" data-act="from" value="${esc(f.from)}" max="${today()}"></label>
      <label class="sx-f">${esc(T("f.to"))}<input type="date" data-act="to" value="${esc(f.to)}"></label>
      ${hasFilters(f) ? `<button type="button" class="btn quiet sm" data-act="clear">${esc(T("f.clear"))}</button>` : ""}</div>
    ${canFb && (f.kind || f.event) ? `<div class="mini">${esc(T("f.eventHint"))}</div>` : ""}
  </div>`;
}

export function summaryHTML(S) {
  const o = S.opts || {}, a = S.ask;
  if (!o.claude) return o.can_settings && S.q ? `<div class="note sx-off">${esc(T("ai.off"))}</div>` : "";
  if (S.askErr) return `<section class="card sx-sum"><h2>${esc(T("ai.title"))}</h2><p class="mini">${esc(S.askErr)}</p></section>`;
  if (!a) return "";
  const used = o.limit ? `<div class="mini sx-used">${esc(T("ai.used", { n: o.used_today || 0, max: o.limit }))}</div>` : "";
  if (a.status === "retrieving" || a.status === "summarizing") {
    return `<section class="card sx-sum" aria-live="polite" aria-busy="true"><h2>${esc(T("ai.title"))}</h2><p>${esc(T("ai.working"))}</p><div class="skeleton"><i></i><i></i></div></section>`;
  }
  if (a.status === "failed") return `<section class="card sx-sum" aria-live="polite"><h2>${esc(T("ai.title"))}</h2><p>${esc(T("ai.failed"))}</p>${used}</section>`;
  const sm = a.summary || {}, pts = Array.isArray(sm.points) ? sm.points : [];
  if (sm.empty) {
    const list = ((o.ai_sources || []).map(srcLabel).join(lang() === "zh" ? "、" : ", ")) || "-";
    return `<section class="card sx-sum" aria-live="polite"><h2>${esc(T("ai.title"))}</h2><p class="mini">${esc(T("ai.empty", { list }))}</p>${used}</section>`;
  }
  const hits = a.hits || [];
  const cite = n => { const i = citeTarget(hits, n); return i < 0 ? "" : `<button type="button" class="sx-cite" data-act="cite" data-i="${i}" aria-label="${esc(T("ai.cite", { n }))}">${esc(String(n))}</button>`; };
  const body = pts.length
    ? `<ul class="sx-pts">${pts.map(p => `<li>${esc(p.text)}${(p.cites || []).length ? ` <span class="sx-cites">${(p.cites || []).map(cite).join("")}</span>` : ""}</li>`).join("")}</ul>`
    : `<p>${esc(sm.note || T("ai.nothing"))}</p>`;
  return `<section class="card sx-sum" aria-live="polite"><h2>${esc(T("ai.title"))}</h2>${body}${pts.length && sm.note ? `<p class="mini">${esc(sm.note)}</p>` : ""}<div class="mini">${esc(T("ai.note"))}</div>${used}</section>`;
}

export function hitHTML(h, i, terms) {
  const ev = evName(h), n = Number(h.n) || 0;
  const meta = [h.date ? esc(String(h.date)) : "", h.source !== "review" && ev ? esc(ev) : "", n ? esc(T("r.answers", { n })) : ""].filter(Boolean).join(" · ");
  const snips = (h.snippets || []).filter(s => s && s.t);
  return `<article class="sx-hit" id="sx-hit-${i}" tabindex="-1">
    <div class="sx-top"><span class="tag sx-${esc(h.source)}">${esc(srcLabel(h.source))}</span>${h.near ? `<span class="tag ok">${esc(T("r.near"))}</span>` : ""}
      <a class="sx-title" href="${esc(hitHref(h))}">${markHTML(h.title || "", terms)}</a></div>
    ${meta ? `<div class="mini">${meta}</div>` : ""}
    ${snips.length ? `<ul class="sx-snips">${snips.map(s => `<li>${s.q ? `<span class="sx-qn">${esc(s.q)}</span>` : ""}${markHTML(s.t, terms)}</li>`).join("")}</ul>` : `<div class="mini">${esc(T("r.titleOnly"))}</div>`}
  </article>`;
}

export function resultsHTML(S) {
  if (!S.q) return emptyHTML(T("r.start"), esc(T("r.startHint")));
  if (S.busy && !S.res) return skeletonHTML();
  const hits = hitsOf(S), terms = termsOf(S);
  if (!hits.length) return emptyHTML(T("r.none"), esc(T("r.noneHint")));
  return `<div class="sx-count" role="status">${esc(T("r.count", { n: hits.length }))}</div><div class="sx-list">${hits.map((h, i) => hitHTML(h, i, terms)).join("")}</div>`;
}

export function settingsHTML(S) {
  const o = S.opts || {}, ad = o.admin;
  if (!o.can_settings || !ad) return "";
  const on = new Set(S.aiSel || o.ai_sources || []);
  const box = s => `<label class="check"><input type="checkbox" data-act="ai-src" value="${s}"${on.has(s) ? " checked" : ""}> ${esc(srcLabel(s))}</label>`;
  const yes = v => T(v ? "set.have" : "set.missing");
  return sectionHTML(esc(T("set.title")), `<p class="mini">${esc(T("set.lede"))}</p>
    <div class="sx-ai">${SOURCES.map(box).join("")}</div>
    ${on.has("feedback") || on.has("review") ? `<div class="note">${esc(T("set.feedbackWarn"))}</div>` : ""}
    <div class="row"><button class="btn sm" data-act="ai-save"${S.busy ? " disabled" : ""}>${esc(T("set.save"))}</button></div>
    <div class="mini">${esc(T("set.keys", { c: yes(o.claude), v: yes(o.voyage) }))} ${esc(T("set.cost", { n: ad.asks_30d || 0, usd: Number(ad.usd_30d || 0).toFixed(2) }))}</div>
    ${o.voyage ? `<div class="mini">${esc(T("set.embed", { done: ad.embedded || 0, all: ad.chunks || 0 }))}${ad.embed_error ? ` ${esc(T("set.embedErr"))}${esc(ad.embed_error)}` : ""}</div>` : `<div class="mini">${esc(T("set.voyageOff"))}</div>`}`, { id: "sx-settings" });
}

export function pageHTML(S) {
  return pageHead(esc(T("pg.title")), esc(T("pg.lede")))
    + msgHTML(S.msg)
    + searchBoxHTML(S)
    + filtersHTML(S)
    + summaryHTML(S)
    + resultsHTML(S)
    + settingsHTML(S);
}
