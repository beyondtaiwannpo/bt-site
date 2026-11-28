// 後台「紀錄」那一組的畫面（2026-12-01，BT Records）：活動記分卡、回饋表、人、年度比較。
// 前半段（側欄、外殼、回饋、自動儲存、成員區）2026-12-01 從 admin/team-forms/src/ui.js 原樣抄過來，八份一模一樣（test/admin-hub.test.mjs 逐字比對）。
// **esc 是自己的一份**，不從別的資料夾 import。
// **esc 是自己的一份**，不從別的資料夾 import。
// 申請管理的畫面。**esc 是自己的一份**，不從別的資料夾 import
//（跟 app/ 與 availability/ 同一條規矩：資料夾之間不互相依賴）。
//
// 2026-10-19 起畫面上的字全部從 ./strings.js 的字典來（T("鍵")），中英兩版並排在那一支裡。
// 這一支只管拼 HTML，不再寫死任何一句給人看的字。怎麼加一句見 README「後台的中英切換」。
import { T, lang, setLang, withLang, isErr, STRINGS } from "./strings.js";
export { T, lang, setLang };
// 表單引擎（2026-11-13，shared/forms.js）：回饋表的題目畫布、條件邏輯面板、預覽、/feedback/ 的填寫都在那裡，三套表單共用。
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
  const cand = p => `<label class="ma-row pick${ticked.has(p.id) && !o.draft ? " on" : ""}"><input type="checkbox" name="${esc(ns)}-member" value="${esc(p.id)}" data-act="pk-tick" data-ns="${esc(ns)}"${ticked.has(p.id) && !o.draft ? " checked" : ""}${dis}>${nameBlock(p)}${rankTag(p.board_role)}${teamsHTML(p)}</label>`;
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
// 進不了這一組的人看到的一頁（跟每一組自己的 noAccessHTML 一樣，字各自寫）。
export function noAccessHTML() {
  return pageHead(T("noAccess.title"), T("noAccess.lede"), []);
}
// ═══════════════════════════════════════════════════════════════════════
// BT Records（2026-12-01）。Paul 2026-11-06：「a data set ... for alumni, people, and also events feedback ...
// is there a way to systematically improve our work through tracking old data」，2026-11-07：「build the thing first」。
// 資料庫那一半在 supabase/migrations/2026-12-01-records.sql，門在那裡每一支函式的第一句。
// 這一半：純函式（記分卡怎麼算、結果怎麼統計、名單怎麼算）加畫面。**少畫一顆按鈕不是安全機制。**
// ═══════════════════════════════════════════════════════════════════════

// 回饋表收得了的題型（2026-12-24-feedback-engine.sql）：引擎的十五種拿掉「上傳檔案」。
// 回饋是不登入填的，檔案沒有地方放、也沒有人管得到誰讀得到，所以這一套不開。
export const TYPES = F.ALL_TYPES.filter(t => t !== "file");
// 還沒跑那一支的資料庫只收這五種（題目讀回來沒有 config 那一欄就是還沒跑）。
export const OLD_TYPES = ["short", "long", "single", "multi", "scale"];
export const isOldDb = questions => (questions || []).length > 0 && !("config" in questions[0]);
// 不收答案的排版區塊（小標題、一段說明、換頁）：結果頁、CSV、題號都跳過它們。
export const isLayout = q => !F.isInput(q);
// 題型的名字：舊的五種用這一組自己的字（跟以前一樣），其他照引擎的。
export const typeName = t => STRINGS["type." + t] ? T("type." + t) : F.typeLabel(t, lang() === "en");
export const RANKS = ["president", "senior_adviser", "director", "adviser", "member"];
export const ROLES = ["reader", "editor"];
export const EKINDS = ["bootcamp", "workshop", "roundtable", "meetup", "clinic", "info-session", "mentorship-term", "fair", "other"];
// 2027-01-26：profile 是「個人連結的故事題」，一套給一種人（講者、教授…），開個人連結的時候挑一套。只有管紀錄的人建得了。
export const FKINDS = ["post-event", "alumni-yearly", "pair-mentee", "pair-mentor", "other", "profile"];
// 一套故事題可以給哪些標籤的人（跟 rc_forms.for_labels 的檢查同一份）。
export const SET_LABELS = ["speaker", "professor", "admission_officer", "mentee", "mentor", "student", "member", "intern", "volunteer", "organizer", "connection"];
// 一套故事題的表單只有這三個分頁：沒有回覆、沒有讀者名單（答案在每一個人的頁面上）。
export const subsOf = f => (f && f.kind === "profile") ? ["questions", "settings", "log"] : SUBS;
export const PROLES = ["student", "mentee", "mentor", "speaker", "organizer", "volunteer", "alumni"];
export const PSTATUS = ["registered", "attended", "no-show", "cancelled"];
export const OKINDS = ["applied", "admitted", "enrolled", "transferred", "graduated", "working", "gap", "other"];
export const VIS = ["private", "internal", "aggregate", "public"];
// 2026-11-24：「題目與設定」拆成「題目」與「設定」兩個分頁（Paul 看過活動編輯頁的分頁之後：「do the same thing… for the whole BT… sign up form should be like that, feedback form should be like that」）。
// 設定那兩個框只在「設定」分頁裡畫，題目的畫布只在「題目」分頁裡畫：存設定的時候是把同名的框一起讀（allValues），兩個框都在同一個分頁，所以不會少讀。
// 那一排分頁跟活動編輯頁同一個樣子（.subtabs），不再是藥丸。
export const SUBS = ["questions", "settings", "people", "results", "log"];

// 我在側欄上的等級：my_access() 的 records 那一格（edit 管得了、view 看得到）。
export const rcLevel = me => String(((me && me.ws) || {})["records"] || "");

// ── 固定題目（計畫第 4 節）。同一個 key 每一年都一樣，年度比較靠它。畫面上的字照表單的語言。 ──
const Q = (key, type, zh, en, extra) => Object.assign({ key, type, label: { zh, en }, required: false, options: [], scale_min: 1, scale_max: 5, min_label: "", max_label: "" }, extra || {});
export const TEMPLATES = {
  "post-event": [
    Q("recommend", "scale", "你會不會推薦這場活動給跟你情況一樣的朋友？", "How likely are you to recommend this event to a friend in your situation?", { required: true, min_label: { zh: "不會", en: "Would not" }, max_label: { zh: "一定會", en: "Definitely" } }),
    Q("useful", "scale", "今天對你自己的下一步有多有用？", "How useful was today for your own next step?"),
    Q("clarity", "scale", "活動結束後，你清不清楚接下來要做什麼？", "Was it clear what to do next after this event?"),
    Q("best", "short", "最有用的部分是什麼？", "What was the most useful part?"),
    Q("change", "long", "下一次我們該改什麼？", "What should we change next time?"),
    Q("first_time", "single", "這是你第一次參加 BT 的活動嗎？", "Is this your first BT event?", { options: { zh: ["是", "不是"], en: ["Yes", "No"] } }),
  ],
  "alumni-yearly": [
    Q("where_now", "short", "你現在在哪裡？（學校或公司、城市、國家）", "Where are you now? (institution or employer, city, country)", { required: true }),
    Q("status", "single", "這一年最符合你的是？", "What best describes this year?", { options: { zh: ["在念書", "在工作", "Gap year", "其他"], en: ["Studying", "Working", "Gap year", "Other"] } }),
    Q("major", "short", "你在念或在做什麼領域？", "What are you studying or working in?"),
    Q("recommend", "scale", "你今天會不會推薦 BT 給一位公立高中生？", "How likely are you to recommend BT to a public high school student today?"),
    Q("helped", "long", "回頭看，BT 真的幫到你的是什麼？", "Looking back, what did BT actually help with?"),
    Q("give_back", "multi", "今年願不願意回來？", "Would you come back this year?", { options: { zh: ["當講者", "當 mentor", "幫忙看文件", "今年不行"], en: ["As a speaker", "As a mentor", "As a reviewer", "Not this year"] } }),
    Q("story_ok", "single", "我們可不可以在網站或募資頁引用你這段話？", "May we quote this on the website or in the campaign?", { options: { zh: ["可以，附名字", "可以，不附名字", "不要"], en: ["Yes, with my name", "Yes, without my name", "No"] } }),
    Q("comment", "long", "還有什麼想說的？", "Anything else?"),
  ],
  // 2027-01-26：個人連結的故事題，起手就是內建的六題（代號一樣，之前寫過的答案對得上）。
  profile: [
    Q("highschool", "long", "高中的你是什麼樣子？那時候想成為什麼樣的人？", "What were you like in high school, and what did you want to become then?"),
    Q("turning", "long", "是哪一個轉捩點，讓你走上現在這條路？", "What was the turning point that set you on your current path?"),
    Q("hardest", "long", "最難的一刻是什麼？你怎麼走過來的？", "What was the hardest moment, and how did you get through it?"),
    Q("decision", "long", "有哪一個決定你會再做一次？哪一個你會改？", "What's one decision you'd make again, and one you'd change?"),
    Q("wish17", "long", "你希望 17 歲的時候有人告訴你什麼？", "What do you wish someone had told you at 17?"),
    Q("first_step", "long", "如果一個台灣學生想走你這條路，他第一步該做什麼？", "If a Taiwanese student wanted your path, what should they do first?"),
  ],
  "pair-mentee": [
    Q("meetings", "single", "這段期間你跟 mentor 聊了幾次？", "How many times did you and your mentor talk this period?", { options: { zh: ["0 次", "1 次", "2 到 3 次", "4 次以上"], en: ["0", "1", "2 to 3", "4 or more"] } }),
    Q("useful", "scale", "這些對話對你有多有用？", "How useful have these conversations been for you?"),
    Q("comfortable", "scale", "你覺得問 mentor 任何事有多自在？", "How comfortable do you feel asking your mentor anything?"),
    Q("stuck", "long", "現在有沒有卡住的事？", "Is anything stuck right now?"),
    Q("change", "long", "什麼會讓這件事更好？", "What would make this better?"),
    Q("continue", "single", "你想不想跟同一位 mentor 繼續？", "Would you like to continue with the same mentor?", { options: { zh: ["想", "不想", "不確定"], en: ["Yes", "No", "Not sure"] } }),
  ],
  "pair-mentor": [
    Q("meetings", "single", "這段期間你們聊了幾次？", "How many times did you talk this period?", { options: { zh: ["0 次", "1 次", "2 到 3 次", "4 次以上"], en: ["0", "1", "2 to 3", "4 or more"] } }),
    Q("engaged", "scale", "你的 mentee 有多投入？", "How engaged is your mentee?"),
    Q("workload", "scale", "你花的時間撐不撐得住？", "Is the time you are spending sustainable?"),
    Q("support", "long", "什麼支援對你當 mentor 有幫助？", "What support would help you as a mentor?"),
    Q("flag", "long", "有沒有 Mentorship team 該知道的事？", "Is there anything the Mentorship team should know?"),
  ],
};
// 把樣板照表單的語言變成 rc_save_form 要的題目清單。
export function templateQuestions(kind, l) {
  const pick = v => (v && typeof v === "object" && !Array.isArray(v)) ? (v[l] != null ? v[l] : v.en) : v;
  return (TEMPLATES[kind] || []).map(q => ({ key: q.key, type: q.type, label: pick(q.label), help: "", required: !!q.required,
    options: (pick(q.options) || []), scale_min: q.scale_min, scale_max: q.scale_max, min_label: pick(q.min_label) || "", max_label: pick(q.max_label) || "" }));
}

// ── 引擎的形狀 ↔ rc_save_form 的形狀 ──
// 資料庫回的一題（rc_questions_json）變成引擎要的形狀：分數題的兩端收進 config，ord 與「有人答過」留著。
export function fromRow(row) { return Object.assign(F.normalize(row || {}), { ord: row && row.ord, answered: !!(row && row.answered) }); }
// 引擎的一題變成 rc_save_form 要的一列：分數題的兩端同時放進舊的四欄（資料庫兩邊寫成一樣）。
// id 一定帶著：新題是前端先配的 uuid，資料庫在「任何表單都沒有這個 id」的時候才用它（條件邏輯才指得到還沒存的題）。
export function toRow(q) {
  const n = F.normalize(q || {}), c = n.config || {};
  const row = { id: n.id || "", key: n.key || "", type: n.type, label: n.label, help: n.help || "", required: !!n.required,
    options: n.options || [], config: c, logic: n.logic || [] };
  if (n.type === "scale") Object.assign(row, { scale_min: c.scale_min, scale_max: c.scale_max, min_label: c.min_label || "", max_label: c.max_label || "" });
  return row;
}
export const rowsOf = qs => (qs || []).map(toRow);
// 新題目的 id：瀏覽器配一個 uuid（測試的時候沒有 crypto 就自己拼一個同形狀的）。
export function newId() {
  try { if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID(); } catch (e) { /* 舊瀏覽器 */ }
  const h = n => Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join("");
  return `${h(8)}-${h(4)}-4${h(3)}-a${h(3)}-${h(12)}`;
}
// 新加的一題先給一個題目文字（照表單的語言）：資料庫不收沒有題目的題，而每一次存都是整份送，
// 一題空著整份都存不進去。加完游標放在那一格、字是選起來的，直接打字就換掉。
export function withLabel(q, en) {
  if (!String(q.label || "").trim() && !["text", "page"].includes(q.type)) q.label = en ? "New question" : "新的一題";
  return q;
}
// 一題存檔前的兩道檢查（資料庫也擋，這裡是讓人當下就知道）。回空字串是沒問題，否則回字典的鍵。
export function blockProblem(q) {
  if (!String(q.label || "").trim() && !["text", "page"].includes(q.type)) return "says.needLabel";
  if (F.isChoice(q) && (q.options || []).length < 2) return "says.needOptions";
  return "";
}

// ── 名單怎麼算（跟資料庫的 tf_match 同一條規則，畫面上算人數用）──
const teamsOf = p => String((p && p.team) || "").split(/[,、;；]/).map(s => s.trim()).filter(Boolean);
export function matchItem(p, it) {
  if (!p || !it) return false;
  if (it.kind === "rank") return (p.rank || "member") === it.value;
  if (it.kind === "team") return teamsOf(p).some(t => t.toLowerCase() === String(it.value || "").trim().toLowerCase());
  if (it.kind === "person") return p.id === it.value;
  return false;
}
export const peopleIn = (people, items) => (people || []).filter(p => (items || []).some(it => matchItem(p, it)));
export function audOf(audience, role) { return (audience || []).filter(a => a.role === role).map(a => ({ kind: a.kind, value: a.value || "" })); }
const itemKey = it => `${it.kind}:${it.value || ""}`;
export function toggleItem(items, it) {
  const k = itemKey(it), has = (items || []).some(x => itemKey(x) === k);
  return has ? items.filter(x => itemKey(x) !== k) : [...(items || []), { kind: it.kind, value: it.value || "" }];
}
export const hasItem = (items, it) => (items || []).some(x => itemKey(x) === itemKey(it));
export const sameItems = (a, b) => JSON.stringify((a || []).map(itemKey).sort()) === JSON.stringify((b || []).map(itemKey).sort());
export function teamList(people) { const s = new Set(PK_TEAMS); for (const p of people || []) for (const t of teamsOf(p)) s.add(t); return [...s]; }
export function normName(s) { return String(s || "").normalize("NFKC").toLowerCase().replace(/[.,'’"()（）\-_/]+/g, " ").replace(/\s+/g, " ").trim(); }
export function findPeople(people, q, skip) {
  const n = normName(q); if (!n) return [];
  const no = new Set(skip || []);
  return (people || []).filter(p => !no.has(p.id) && [p.name, p.name_zh, p.name_en].some(x => normName(x).includes(n))).slice(0, 8);
}

// ── 記分卡怎麼算 ──
// 四個數字：出席率、推薦、有用、回饋份數。null 表示沒有資料（不是 0）。
export function scorecard(n) {
  const x = n || {};
  const num = v => (v == null || v === "" ? null : Number(v));
  return { attendance: num(x.attendance_rate), registered: num(x.registered) || 0, attended: num(x.attended) || 0,
    recommend: num(x.recommend_avg), recommend_n: num(x.recommend_n) || 0, useful: num(x.useful_avg), clarity: num(x.clarity_avg),
    responses: num(x.responses) || 0, response_rate: num(x.response_rate) };
}
// 跟上一場同類比：正數是進步。沒有上一場或任一邊沒資料就是 null。
export function delta(now, prev) { return now == null || prev == null ? null : Math.round((now - prev) * 100) / 100; }
export function fmtNum(v, d) { return v == null ? "–" : (Number(v).toFixed(d == null ? 2 : d)); }
export function fmtPct(v) { return v == null ? "–" : `${Number(v).toFixed(0)}%`; }
export function fmtDelta(v, unit) { if (v == null) return ""; const s = v > 0 ? "+" : ""; return `${s}${unit === "%" ? Math.round(v) : Number.isInteger(v) ? v : v.toFixed(2)}${unit || ""}`; }

// ── 結果怎麼統計（跟內部表單同一套，多一個 key）──
const splitMulti = v => String(v || "").split("\n").map(s => s.trim()).filter(Boolean);
// 2026-11-13 起題目可以有排版區塊（小標題、一段說明、換頁），那些不收答案，不列。
// 下拉跟單選同樣算票；同意勾選算「同意」幾個。
export function summarize(questions, responses) {
  const rs = responses || [];
  return (questions || []).filter(q => !isLayout(q)).map(q => {
    const vals = rs.map(r => String(((r.answers || {})[q.id]) || "")).filter(v => v !== "");
    if (q.type === "consent") return { q, n: vals.length, counts: [{ option: T("res.agreed"), n: vals.filter(v => v === "yes").length }], other: [] };
    if (q.type === "single" || q.type === "multi" || q.type === "dropdown") {
      const count = new Map((q.options || []).map(o => [o, 0])), other = new Map();
      for (const v of vals) for (const x of (q.type === "multi" ? splitMulti(v) : [v])) { if (count.has(x)) count.set(x, count.get(x) + 1); else other.set(x, (other.get(x) || 0) + 1); }
      return { q, n: vals.length, counts: [...count].map(([option, n]) => ({ option, n })), other: [...other].map(([option, n]) => ({ option, n })) };
    }
    if (q.type === "scale") {
      const nums = vals.map(Number).filter(Number.isFinite);
      const lo = Number(q.scale_min == null ? 1 : q.scale_min), hi = Number(q.scale_max == null ? 5 : q.scale_max);
      const dist = []; for (let v = lo; v <= hi; v++) dist.push({ v, n: nums.filter(x => x === v).length });
      const avg = nums.length ? Math.round(nums.reduce((s, x) => s + x, 0) / nums.length * 100) / 100 : null;
      return { q, n: nums.length, avg, dist };
    }
    return { q, n: vals.length, texts: rs.filter(r => String(((r.answers || {})[q.id]) || "") !== "").map(r => ({ name: r.name || "", v: r.answers[q.id] })) };
  });
}
export function csvCell(v) {
  const s = String(v == null ? "" : v);
  return /[",\n\r]/.test(s) || /^[=+\-@]/.test(s) ? `"${(/^[=+\-@]/.test(s) ? "'" : "") + s.replace(/"/g, '""')}"` : s;
}
export function resultsCSV(questions, responses, anonymous) {
  const qs = (questions || []).filter(q => !isLayout(q));
  const cell = (q, v) => q.type === "consent" && v === "yes" ? T("res.agreed") : String(v || "").replace(/\n/g, "; ");
  const head = [...(anonymous ? [] : [T("res.who")]), T("res.when"), T("res.age"), T("res.contact"), ...qs.map(q => (q.key ? q.key + " · " : "") + q.label)];
  const rows = (responses || []).map(r => [...(anonymous ? [] : [r.name || ""]), r.submitted_at || "", T("age." + (r.age_band || "unknown")), r.contact_ok ? "yes" : "",
    ...qs.map(q => cell(q, ((r.answers || {})[q.id])))]);
  return "﻿" + [head, ...rows].map(r => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
export function csvFilename(title) {
  const slug = String(title || "form").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "form";
  return `bt-${slug}.csv`;
}
// 年度比較也能下載。

// ── 日期 ──
export function fmtWhen(v) {
  if (!v) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const d = new Date(v); if (isNaN(d)) return String(v);
  try { return d.toLocaleString(lang() === "zh" ? "zh-TW" : "en-US", { timeZone: "Asia/Taipei", year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }); }
  catch (e) { return d.toISOString().slice(0, 16).replace("T", " "); }
}
export function fmtDay(v) { if (!v) return ""; const d = new Date(v); return isNaN(d) ? String(v) : new Date(d.getTime() + 8 * 3600000).toISOString().slice(0, 10); }
export function dtLocal(v) { if (!v) return ""; const d = new Date(v); if (isNaN(d)) return ""; return new Date(d.getTime() + 8 * 3600000).toISOString().slice(0, 16); }
export const fromLocal = s => s ? `${s}:00+08:00` : "";
export const evTitle = e => (e && (lang() === "zh" ? (e.title_zh || e.title_en) : (e.title_en || e.title_zh))) || "";
export const feedbackURL = token => `${typeof location === "undefined" ? "https://beyondtaiwannpo.com" : location.origin}/feedback/?t=${encodeURIComponent(token || "")}`;

// ── 畫面 ──
const statusTag = s => `<span class="tag ${s === "open" ? "open" : s === "closed" ? "closed" : "draft"}">${esc(T("st." + s))}</span>`;
const kindTag = k => `<span class="tag">${esc(T("ekind." + k))}</span>`;
const pickOpt = (v, label, sel) => `<option value="${esc(v)}"${String(v) === String(sel == null ? "" : sel) ? " selected" : ""}>${esc(label)}</option>`;
const sel = (name, opts, cur, dis, blank) => `<select name="${esc(name)}"${dis ? " disabled" : ""}>${blank ? pickOpt("", blank, cur) : ""}${opts.map(([v, l]) => pickOpt(v, l, cur)).join("")}</select>`;
const termOpts = terms => (terms || []).map(t => [t.id, t.id]);
const eventOpts = events => (events || []).map(e => [e.id, `${evTitle(e)} (${e.term_id || "?"})`]);

// 四個數字的格子，帶「上一場」的小字。
export function numbersHTML(n, prev) {
  const a = scorecard(n), b = prev ? scorecard(prev.numbers) : null;
  const tile = (label, value, hint, d, unit) => `<div class="kpi rc-kpi"><div class="kpi-n">${esc(value)}</div><div class="kpi-l">${esc(label)}</div>
    <div class="kpi-h">${esc(hint)}${b && d != null ? ` <b class="rc-delta ${d >= 0 ? "up" : "down"}">${esc(fmtDelta(d, unit))}</b>` : ""}</div></div>`;
  return `<div class="todo rc-nums">
    ${tile(T("num.attendance"), fmtPct(a.attendance), T("num.attendanceHint", { a: a.attended, r: a.registered }), b ? delta(a.attendance, b.attendance) : null, "%")}
    ${tile(T("num.recommend"), fmtNum(a.recommend), T("num.outOf", { n: a.recommend_n }), b ? delta(a.recommend, b.recommend) : null)}
    ${tile(T("num.useful"), fmtNum(a.useful), a.clarity == null ? "" : T("num.clarity", { v: fmtNum(a.clarity) }), b ? delta(a.useful, b.useful) : null)}
    ${tile(T("num.responses"), String(a.responses), a.response_rate == null ? "" : T("num.responseRate", { p: fmtPct(a.response_rate) }), b ? delta(a.responses, b.responses) : null)}
  </div>${b ? `<div class="mini rc-prev">${esc(T("num.prev", { title: evTitle(prev), when: fmtDay(prev.starts_at) }))}</div>` : ""}`;
}

// 總覽：數量、每一屆的活動與四個數字。
// top：要放在頁首正下面的東西（「加一場舊活動」的表單）。2026-11-23 以前那張表單接在整頁最下面，
// 可是打開它的按鈕在頁首，活動一多，按了看起來像沒反應（表單在好幾屏以下）。
export function overviewHTML(boot, msg, top) {
  const b = boot || {}, c = b.counts || {}, events = b.events || [];
  // 2026-11-13 Paul：「這些數字放最前面有什麼用？可以收起來嗎」。是整個 Records 的總數，不用處理什麼，收成一行；要看再打開。
  const kpis = b.can_view ? `${foldStart("ov-totals", "data-totals", T("ov.totals", { n: c.people == null ? "–" : c.people }), null)}<div class="todo">${[["ov.people", c.people], ["ov.students", c.students], ["ov.participation", c.participation], ["ov.responses", c.responses], ["ov.pairs", c.pairs], ["ov.outcomes", c.outcomes]]
    .map(([k, n]) => `<div class="kpi"><div class="kpi-n">${n == null ? "–" : esc(String(n))}</div><div class="kpi-l">${esc(T(k))}</div></div>`).join("")}</div></div></details>` : "";
  const terms = [...new Set(events.map(e => e.term_id || ""))].sort((x, y) => (y || "").localeCompare(x || ""));
  const row = e => { const n = scorecard(e.numbers); return `<tr>
      <td class="t-main"><a href="#overview/${esc(e.id)}" data-act="open-event" data-id="${esc(e.id)}"><b>${esc(evTitle(e))}</b></a><br>${kindTag(e.kind)} <span class="mini">${esc(fmtDay(e.starts_at))}${e.team ? "・" + esc(e.team) : ""}</span></td>
      <td>${esc(fmtPct(n.attendance))}<br><span class="mini">${n.attended}/${n.registered}</span></td><td>${esc(fmtNum(n.recommend))}</td><td>${esc(fmtNum(n.useful))}</td><td>${n.responses}</td>
      <td>${e.review && e.review.we_change ? `<span class="tag open">${esc(T("ov.reviewed"))}</span><br><span class="mini">${esc(e.review.we_change)}</span>` : `<span class="tag draft">${esc(T("ov.notReviewed"))}</span>`}</td></tr>`; };
  const tables = terms.map(t => sectionHTML(t || T("ov.noTerm"), `<div class="tf-scroll"><table class="table rc-table"><thead><tr><th>${esc(T("ov.event"))}</th><th>${esc(T("num.attendance"))}</th><th>${esc(T("num.recommend"))}</th><th>${esc(T("num.useful"))}</th><th>${esc(T("num.responses"))}</th><th>${esc(T("ov.review"))}</th></tr></thead>
    <tbody>${events.filter(e => (e.term_id || "") === t).map(row).join("")}</tbody></table></div>`)).join("");
  const acts = b.can_manage ? [{ act: "ev-new", label: T("ov.addPast") }] : [];
  return pageHead(T("ov.title"), T("ov.lede"), acts) + msgHTML(msg) + (top || "") + kpis
    + (events.length ? tables : emptyHTML(T("ov.none"), esc(T("ov.noneHint"))))
    + `<div class="note">${esc(T("ov.ritual"))}</div>`;
}
// 加一場舊活動的表單（管的人）。
export function pastEventFormHTML(terms, draft, busy) {
  const d = draft || {};
  return `<div class="card inline-form" data-past><h2>${esc(T("past.title"))}</h2><div class="mini">${esc(T("past.lede"))}</div>
    <div class="two"><label><i>${esc(T("past.titleZh"))}</i><input name="title_zh" value="${esc(d.title_zh || "")}" maxlength="120"></label>
    <label><i>${esc(T("past.titleEn"))}</i><input name="title_en" value="${esc(d.title_en || "")}" maxlength="120"></label></div>
    <div class="two"><label><i>${esc(T("past.slug"))}</i><input name="slug" value="${esc(d.slug || "")}" maxlength="40" placeholder="summer-bootcamp-2025"></label>
    <label><i>${esc(T("ev.kind"))}</i>${sel("kind", EKINDS.map(k => [k, T("ekind." + k)]), d.kind || "bootcamp")}</label></div>
    <div class="two"><label><i>${esc(T("ev.term"))}</i>${sel("term_id", termOpts(terms), d.term_id || "", false, T("ev.noTerm"))}</label>
    <label><i>${esc(T("past.team"))}</i><input name="team" value="${esc(d.team || "")}" maxlength="60" placeholder="Curriculum Team"></label></div>
    <div class="two"><label><i>${esc(T("past.starts"))}</i><input type="datetime-local" name="starts_at" value="${esc(d.starts_at || "")}"></label>
    <label><i>${esc(T("past.ends"))}</i><input type="datetime-local" name="ends_at" value="${esc(d.ends_at || "")}"></label></div>
    <div class="form-foot"><button class="btn" data-act="ev-create"${busy ? " disabled" : ""}>${esc(busy ? T("common.saving") : T("past.create"))}</button><button class="btn ghost" data-act="ev-new-cancel">${esc(T("common.cancel"))}</button></div></div>`;
}

// 一場活動：記分卡、設定、場次、出席、回饋表、留言、配對、檢討。
export function eventHTML(d, S) {
  const e = d.event || {}, edit = !!d.can_edit, dis = edit ? "" : " disabled", terms = (S.boot && S.boot.terms) || [], forms = d.forms || [];
  const isTerm = e.kind === "mentorship-term";
  const settings = sectionHTML(T("ev.settings"), `<div class="two" data-evmeta>
      <label><i>${esc(T("ev.kind"))}</i>${sel("kind", EKINDS.map(k => [k, T("ekind." + k)]), e.kind, !edit)}</label>
      <label><i>${esc(T("ev.term"))}</i>${sel("term_id", termOpts(terms), e.term_id || "", !edit, T("ev.noTerm"))}</label></div>
    ${edit ? `<div class="form-foot"><button class="btn ghost sm" data-act="ev-meta-save"${S.busy ? " disabled" : ""}>${esc(T("common.save"))}</button><span class="mini">${esc(T("ev.kindHint"))}</span></div>` : ""}`);
  const sessions = (d.sessions || []);
  const sessHTML = sectionHTML(T("ev.sessions"), (sessions.length ? `<ul class="flist" data-sessions>${sessions.map((s, i) => `<li data-sid="${esc(s.id)}"><div class="two"><label><i>${esc(T("ev.sessTitle"))} ${i + 1}</i><input name="title" value="${esc(s.title || "")}" maxlength="80"${dis}></label>
      <label><i>${esc(T("past.starts"))}</i><input type="datetime-local" name="starts_at" value="${esc(dtLocal(s.starts_at))}"${dis}></label></div>${edit ? `<button class="btn quiet sm" data-act="sess-del" data-i="${i}">${esc(T("common.delete"))}</button>` : ""}</li>`).join("")}</ul>` : `<div class="mini">${esc(T("ev.noSessions"))}</div>`)
    + (edit ? `<div class="form-foot"><button class="btn ghost sm" data-act="sess-add">${esc(T("ev.sessAdd"))}</button>${sessions.length ? `<button class="btn ghost sm" data-act="sess-save"${S.busy ? " disabled" : ""}>${esc(T("ev.sessSave"))}</button>` : ""}</div>` : ""));
  const parts = d.participation || [];
  const prow = p => `<tr><td class="t-main"><a href="#people/${esc(p.person_id)}" data-act="open-person" data-id="${esc(p.person_id)}"><b>${esc(p.name || T("common.noName"))}</b></a>${p.school ? `<br><span class="mini">${esc(p.school)}</span>` : ""}</td>
      <td>${esc(T("prole." + p.role))}</td><td>${edit ? sel("status", PSTATUS.map(s => [s, T("pstatus." + s)]), p.status, false) : esc(T("pstatus." + p.status))}</td><td><span class="mini">${esc(T("psrc." + p.source))}</span></td>
      <td>${edit ? `<button class="btn quiet sm" data-act="part-del" data-id="${esc(p.id)}">${esc(T("common.delete"))}</button>` : ""}</td></tr>`;
  // 2026-12-05：先找名單上已經有的人（名錄載進來之後 datalist 有名字），選到就帶 person_id；沒有的再填下面那幾格建新的人。
  const dirList = Array.isArray(S.dir) ? S.dir : [];
  const addPart = edit ? `${foldStart("partadd", "data-partadd", T("part.add"), S)}
      <label><i>${esc(T("part.who2"))}</i><input name="who" class="rc-who" list="rc-dir-list" autocomplete="off" placeholder="${esc(T("part.whoPh"))}" data-noauto="1"></label>
      <datalist id="rc-dir-list">${dirList.map(x => `<option value="${esc(dirLabel(x))}"></option>`).join("")}</datalist>
      <div class="mini">${esc(T("part.orNew"))}</div>
      <div class="two"><label><i>${esc(T("person.nameZh"))}</i><input name="name_zh" maxlength="60"></label><label><i>${esc(T("person.nameEn"))}</i><input name="name_en" maxlength="60"></label></div>
      <div class="two"><label><i>${esc(T("person.email"))}</i><input name="email" type="email" maxlength="120"></label><label><i>${esc(T("person.school"))}</i><input name="school" maxlength="80"></label></div>
      <div class="two"><label><i>${esc(T("part.role"))}</i>${sel("role", PROLES.map(r => [r, T("prole." + r)]), isTerm ? "mentee" : "student")}</label><label><i>${esc(T("part.status"))}</i>${sel("status", PSTATUS.map(s => [s, T("pstatus." + s)]), "attended")}</label></div>
      <div class="form-foot"><button class="btn sm" data-act="part-add"${S.busy ? " disabled" : ""}>${esc(T("part.addBtn"))}</button><span class="mini">${esc(T("part.addHint"))}</span></div></div></details>` : "";
  const partHTML = sectionHTML(T("ev.participation", { n: parts.length }), `${e.source === "site" ? `<div class="row"><span class="mini">${esc(T("part.syncHint"))}</span><span class="sp"></span><button class="btn ghost sm" data-act="part-sync"${S.busy ? " disabled" : ""}>${esc(T("part.sync"))}</button></div>` : ""}
    ${parts.length ? `<div class="tf-scroll" data-parts><table class="table rc-table"><thead><tr><th>${esc(T("part.who"))}</th><th>${esc(T("part.role"))}</th><th>${esc(T("part.status"))}</th><th>${esc(T("part.source"))}</th><th></th></tr></thead><tbody>${parts.map(prow).join("")}</tbody></table></div>
    ${edit ? `<div class="form-foot"><button class="btn ghost sm" data-act="part-save"${S.busy ? " disabled" : ""}>${esc(T("part.saveStatus"))}</button></div>` : ""}` : `<div class="mini">${esc(T("part.none"))}</div>`}${addPart}`);
  const formsHTML = sectionHTML(T("ev.forms"), `${forms.length ? `<ul class="flist">${forms.map(f => `<li><div class="fhead"><a href="#forms/${esc(f.id)}" data-act="open-form" data-id="${esc(f.id)}"><b>${esc(f.title)}</b></a> ${statusTag(f.status)} <span class="tag">${esc(T("fkind." + f.kind))}</span></div>
      <div class="fmeta">${esc(T("form.count", { n: f.responses || 0 }))}${f.status === "open" ? `・<a class="lnk" href="${esc(feedbackURL(f.token))}" target="_blank" rel="noopener">${esc(T("form.link"))}</a>` : ""}${f.can_read === false ? `・<span class="mini">${esc(T("form.cantRead"))}</span>` : ""}</div></li>`).join("")}</ul>` : `<div class="mini">${esc(T("ev.noForms"))}</div>`}
    ${edit ? `<div class="form-foot">${(isTerm ? ["pair-mentee", "pair-mentor"] : ["post-event"]).map(k => `<button class="btn ghost sm" data-act="form-template" data-kind="${k}" data-event="${esc(e.id)}"${S.busy ? " disabled" : ""}>${esc(T("form.newFrom", { kind: T("fkind." + k) }))}</button>`).join("")}<span class="mini">${esc(T("form.templateHint"))}</span></div>` : ""}`);
  const scales = (d.scales || []);
  const bar = (label, n, of) => `<div class="tf-bar"><span class="tf-bar-l">${esc(label)}</span><span class="tf-bar-t"><i style="width:${of ? Math.round(n / of * 100) : 0}%"></i></span><b>${n}</b></div>`;
  const scalesHTML = scales.length ? sectionHTML(T("ev.scales"), scales.map(s => bar(`${s.key ? s.key + " · " : ""}${s.label}  (${s.n})`, Number(s.avg || 0), Number(s.max || 5))).join("")) : "";
  const comments = d.comments || [];
  const byKey = {}; for (const c of comments) (byKey[c.key || c.label] = byKey[c.key || c.label] || { label: c.label, key: c.key, items: [] }).items.push(c.value);
  const commentsHTML = comments.length ? sectionHTML(T("ev.comments", { n: comments.length }), Object.values(byKey).map(g => `<div class="card tf-sum"><h3 class="tf-sq">${esc(g.label)}${g.key ? ` <span class="mini">${esc(g.key)}</span>` : ""}</h3>
    <ul class="tf-texts">${(S.more && S.more[g.key || g.label] ? g.items : g.items.slice(0, 8)).map(v => `<li><div>${esc(v).replace(/\n/g, "<br>")}</div></li>`).join("")}</ul>
    ${g.items.length > 8 && !(S.more && S.more[g.key || g.label]) ? `<button type="button" class="lnk" data-act="res-more" data-id="${esc(g.key || g.label)}">${esc(T("res.showAll", { n: g.items.length }))}</button>` : ""}</div>`).join("")) : "";
  const pairs = d.pairs || [];
  const pairsHTML = isTerm ? sectionHTML(T("ev.pairs", { n: pairs.length }), `${pairs.length ? `<div class="tf-scroll"><table class="table rc-table"><thead><tr><th>Mentor</th><th>Mentee</th><th>${esc(T("pair.matched"))}</th><th>${esc(T("pair.ended"))}</th><th></th></tr></thead><tbody>
      ${pairs.map(p => `<tr><td class="t-main">${p.mentor_id ? `<a href="#people/${esc(p.mentor_id)}" data-act="open-person" data-id="${esc(p.mentor_id)}">${esc(p.mentor || T("common.noName"))}</a>` : `<span class="mini">${esc(T("pair.forgotten"))}</span>`}</td>
        <td>${p.mentee_id ? `<a href="#people/${esc(p.mentee_id)}" data-act="open-person" data-id="${esc(p.mentee_id)}">${esc(p.mentee || T("common.noName"))}</a>` : `<span class="mini">${esc(T("pair.forgotten"))}</span>`}</td>
        <td>${esc(p.matched_on || "")}</td><td>${p.ended_on ? `${esc(p.ended_on)} <span class="mini">${esc(T("pend." + (p.end_reason || "other")))}</span>` : (S.boot && S.boot.can_manage ? `<button class="btn quiet sm" data-act="pair-end" data-id="${esc(p.id)}">${esc(T("pair.endBtn"))}</button>` : "")}</td>
        <td>${S.boot && S.boot.can_manage ? `<button class="btn quiet sm" data-act="pair-del" data-id="${esc(p.id)}">${esc(T("common.delete"))}</button>` : ""}</td></tr>`).join("")}</tbody></table></div>` : `<div class="mini">${esc(T("pair.none"))}</div>`}
    ${S.boot && S.boot.can_manage ? `${foldStart("pairadd", "data-pairadd", T("pair.add"), S)}
      <div class="two"><label><i>Mentor・${esc(T("part.who2"))}</i><input name="mentor_who" class="rc-who" list="rc-dir-list" autocomplete="off" placeholder="${esc(T("part.whoPh"))}" data-noauto="1"></label><label><i>Mentee・${esc(T("part.who2"))}</i><input name="mentee_who" class="rc-who" list="rc-dir-list" autocomplete="off" placeholder="${esc(T("part.whoPh"))}" data-noauto="1"></label></div>
      <datalist id="rc-dir-list">${(Array.isArray(S.dir) ? S.dir : []).map(x => `<option value="${esc(dirLabel(x))}"></option>`).join("")}</datalist>
      <div class="mini">${esc(T("part.orNew"))}</div>
      <div class="two"><label><i>Mentor ${esc(T("person.nameEn"))}</i><input name="mentor_name_en" maxlength="60"></label><label><i>Mentor ${esc(T("person.email"))}</i><input name="mentor_email" type="email" maxlength="120"></label></div>
      <div class="two"><label><i>Mentee ${esc(T("person.nameZh"))}</i><input name="mentee_name_zh" maxlength="60"></label><label><i>Mentee ${esc(T("person.email"))}</i><input name="mentee_email" type="email" maxlength="120"></label></div>
      <div class="two"><label><i>Mentee ${esc(T("person.school"))}</i><input name="mentee_school" maxlength="80"></label><label><i>${esc(T("pair.matched"))}</i><input type="date" name="matched_on"></label></div>
      <div class="form-foot"><button class="btn sm" data-act="pair-add"${S.busy ? " disabled" : ""}>${esc(T("pair.addBtn"))}</button><span class="mini">${esc(T("pair.addHint"))}</span></div></div></details>` : ""}`) : "";
  const r = d.review || {};
  const reviewHTML = sectionHTML(T("ev.review"), `<div class="mini">${esc(T("rev.lede"))}</div>
    ${r.updated_at ? `<div class="mini">${esc(T("rev.last", { when: fmtWhen(r.updated_at), who: r.owner || "" }))}</div>` : ""}
    <div data-review>
      <label><i>${esc(T("rev.wentWell"))}</i><textarea name="went_well" rows="2" maxlength="2000"${dis}>${esc(r.went_well || "")}</textarea></label>
      <label><i>${esc(T("rev.weChange"))}</i><textarea name="we_change" rows="2" maxlength="1000" placeholder="${esc(T("rev.weChangePh"))}"${dis}>${esc(r.we_change || "")}</textarea></label>
      ${d.previous && d.previous.review && d.previous.review.we_change ? `<div class="note">${esc(T("rev.prevChange", { title: evTitle(d.previous) }))}<br><b>${esc(d.previous.review.we_change)}</b></div>` : ""}
      <label class="check"><input type="checkbox" name="change_happened"${r.change_happened ? " checked" : ""}${dis}><span>${esc(T("rev.happened"))}</span></label>
      ${edit ? `<div class="form-foot"><button class="btn" data-act="rev-save"${S.busy ? " disabled" : ""}>${esc(T("rev.save"))}</button></div>` : ""}
    </div>`);
  return pageHead(`${esc(evTitle(e))} ${kindTag(e.kind)}`, `${esc(fmtDay(e.starts_at))}${e.term_id ? "・" + esc(e.term_id) : ""}${e.team ? "・" + esc(e.team) : ""}${e.source === "import" ? "・" + esc(T("ev.imported")) : ""}`,
      // 2026-11-10：網站上開的活動，連回那場活動的頁面（報名表、審核、簽到、場地都在那裡）。
      e.slug && e.source !== "import" ? [{ href: "/admin/#events/" + e.slug, label: T("ev.openSite") }] : [], { act: "back-overview", label: T("ev.back") })
    + msgHTML(S.msg) + numbersHTML(e.numbers, d.previous) + (edit ? "" : `<div class="note">${esc(T("ev.readonly"))}</div>`)
    // 2026-11-23：「種類與屆別」搬到最下面（跟活動編輯頁同一次重排，那邊也搬到「其他設定」）。它是分類用的、很少改。
    // 同一天第二輪（Paul：「do all of them」）：「檢討」從最上面搬到留言後面。那一段自己的說明寫的是先看完再填一句，
    // 所以順序是：誰來了（場次、出席、配對）→ 他們說了什麼（回饋表、分數、留言）→ 檢討 → 分類。
    // 2026-11-24：八塊疊成一長條，收成四個分頁（Paul：「do the same thing… for the whole BT」）。上面那一排數字留在分頁外面，換哪一個分頁都看得到。
    // 每一塊照樣都在畫面裡，沒選到的只是藏起來：main.js 存場次、出席、檢討、種類的時候是照 data-sessions、data-parts、data-review、data-evmeta 去找那一塊的。
    + RAIL.pageTabsHTML("rc-event", [
        { key: "attendance", label: T("rtab.attendance"), body: sessHTML + partHTML + pairsHTML, n: parts.length },
        { key: "feedback", label: T("rtab.feedback"), body: formsHTML + scalesHTML + commentsHTML, n: forms.length },
        { key: "review", label: T("rtab.review"), body: reviewHTML },
        { key: "settings", label: T("rtab.settings"), body: settings },
      ], { aria: T("rtab.evAria") });
}
// 從畫面讀：場次、出席狀態、檢討、活動設定。
export function readSessions(box) {
  return [...box.querySelectorAll("li[data-sid]")].map(li => ({ id: li.dataset.sid.startsWith("new-") ? "" : li.dataset.sid, title: li.querySelector('[name="title"]').value, starts_at: fromLocal(li.querySelector('[name="starts_at"]').value), ends_at: "" }));
}
export function readPartStatus(box) { return [...box.querySelectorAll("tr")].map(tr => ({ id: (tr.querySelector("[data-act='part-del']") || {}).dataset?.id, status: (tr.querySelector('[name="status"]') || {}).value })).filter(x => x.id && x.status); }
export function readReview(box) { const v = formValues(box); return { went_well: v.went_well || "", we_change: v.we_change || "", change_happened: !!v.change_happened }; }

// 回饋表清單與新建。
export function formsListHTML(boot, msg, busy, newDraft) {
  const b = boot || {}, forms = b.forms || [], events = b.events || [];
  const acts = (b.can_manage || events.length) && !newDraft ? [{ act: "form-new", label: T("form.new"), primary: true }] : [];
  const nd = newDraft || {};
  const nf = newDraft ? `<div class="card inline-form" data-newform><h2>${esc(T("form.newTitle"))}</h2>
      <label><i>${esc(T("ed.name"))}</i><input id="rc-new-title" value="${esc(nd.title || "")}" maxlength="200" placeholder="${esc(T("form.titlePh"))}"></label>
      <div class="two"><label><i>${esc(T("form.kind"))}</i>${sel("kind", FKINDS.filter(k => k !== "profile" || b.can_manage).map(k => [k, T("fkind." + k)]), nd.kind || "post-event")}</label>
      <label><i>${esc(T("form.event"))}</i>${sel("event_id", eventOpts(events), nd.event_id || "", false, T("form.noEvent"))}</label></div>
      <div class="two"><label><i>${esc(T("form.lang"))}</i>${sel("lang", [["zh", "中文"], ["en", "English"]], nd.lang || lang())}</label>
      <label class="check rc-tpl"><input type="checkbox" name="template" checked><span>${esc(T("form.useTemplate"))}</span></label></div>
      <div class="mini">${esc(T("form.kindHint"))}</div>
      <div class="form-foot"><button class="btn" data-act="form-create"${busy ? " disabled" : ""}>${esc(busy ? T("common.saving") : T("build.create"))}</button><button class="btn ghost" data-act="form-new-cancel">${esc(T("common.cancel"))}</button></div></div>` : "";
  const row = f => `<li><div class="fhead"><a href="#forms/${esc(f.id)}" data-act="open-form" data-id="${esc(f.id)}"><b>${esc(f.title)}</b></a> ${statusTag(f.status)} <span class="tag">${esc(T("fkind." + f.kind))}</span></div>
      <div class="fmeta">${f.event_title ? esc(f.event_title) + "・" : ""}${esc(T("form.count", { n: f.responses || 0 }))}${f.closes_at ? "・" + esc(T("fill.closes", { when: fmtWhen(f.closes_at) })) : ""}</div></li>`;
  // 三屆前的具名答案轉匿名（2026-12-02）：只畫給管的人看，按下去資料庫還會再問一次是不是 Co-President。
  const anon = b.can_manage ? `${foldStart("anon", "data-anon", T("anon.title"), null)}<p class="mini">${esc(T("anon.lede"))}</p>
      <div class="form-foot"><button class="btn ghost sm" data-act="anonymise"${busy ? " disabled" : ""}>${esc(T("anon.btn"))}</button></div></div></details>` : "";
  return pageHead(T("form.title"), T("form.lede"), acts) + msgHTML(msg) + nf
    + (forms.length ? `<ul class="flist">${forms.map(row).join("")}</ul>` : emptyHTML(T("form.none"), esc(T("form.noneHint"))))
    + anon;
}
export function formHeadHTML(r, sub) {
  const f = r.form || {}, edit = !!r.can_edit, acts = [];
  if (edit) {
    if (f.status === "draft") acts.push({ act: "form-status", id: "open", label: T("ed.open"), primary: true });
    if (f.status === "open") acts.push({ act: "form-status", id: "closed", label: T("ed.close") });
    if (f.status === "closed") acts.push({ act: "form-status", id: "open", label: T("ed.reopen") });
  }
  const tabs = `<nav class="subtabs ptabs" aria-label="${esc(T("ed.tabs"))}">${subsOf(f).map(s => `<a class="subtab${s === sub ? " on" : ""}"${s === sub ? ' aria-current="page"' : ""} href="#forms/${esc(f.id)}/${s}" data-act="sub" data-t="${s}">${esc(T("ed.tab." + s))}</a>`).join("")}</nav>`;
  // 一套故事題沒有自己的填寫連結：它跟著每一個人的個人連結走。
  const link = f.kind === "profile" ? `<div class="note">${esc(T(f.status === "open" ? "set.openNote" : "set.notOpenNote"))}</div>`
    : f.status === "open" ? `<div class="note rc-link"><b>${esc(T("form.linkLabel"))}</b> <input readonly value="${esc(feedbackURL(f.token))}" id="rc-link" data-noauto="1"> <button class="btn ghost sm" data-act="copy-link">${esc(T("form.copy"))}</button><div class="mini">${esc(T("form.linkHint"))}</div></div>` : "";
  return pageHead(`${esc(f.title || "")} ${statusTag(f.status)} <span class="tag">${esc(T("fkind." + f.kind))}</span>`, f.kind === "profile" ? "" : `${f.event_title ? esc(f.event_title) + "・" : ""}${esc(T("form.count", { n: f.responses || 0 }))}`, acts, { act: "back-forms", label: T("ed.back") })
    + (edit ? "" : `<div class="note">${esc(T("ed.readonly"))}</div>`) + link + tabs;
}
// 題目與設定。設定那一塊改了就存（main.js 的 onAutosave rc-save，只存設定）；
// 題目是引擎的畫布（2026-11-13，shared/forms.js 的 canvasHTML）：每一題一塊 data-autosave="q-save"，改字自己存，
// 兩題之間的「＋」或最底下打 / 加題，拖曳、上下移、複製、刪掉（有人答過的鎖住），條件邏輯，預覽。
// S.fx：{ mode: edit|preview, menuAt, filter, logicOpen: Set }。S.questions 是引擎形狀的題目（main.js 從 S.results.questions 轉）。
export function formEditHTML(r, S) {
  const f = r.form || {}, edit = !!r.can_edit, dis = edit ? "" : " disabled", events = (S.boot && S.boot.events) || [], terms = (S.boot && S.boot.terms) || [];
  const anonLocked = f.anonymous && (f.responses || 0) > 0;
  // 2026-11-23 照做事的順序拆成三段：名稱與說明 → 題目 → 截止時間。2026-11-24 題目自己一個分頁，另外兩段在「設定」分頁（S.sub）。
  // 語言與匿名會改畫布上加得了哪些題型，要在出題之前定；開一張新的表單的時候這兩個已經選過了。開放與關閉是頁首那顆鈕。
  // 存檔的框變成上下兩個，都是 rc-save；readFormEditor 兩個框一起讀，動哪一個都存整份。data-part 是存完要把「存好了」印回哪一個框。
  if (S.sub !== "settings") return msgHTML(S.msg) + sectionHTML(T("ed.questions"), questionsHTML(r, S));
  // 2027-01-26：個人連結的故事題只有名稱、開頭那一段話、語言、給哪些人。沒有活動、屆、匿名、截止時間。
  if (f.kind === "profile") {
    const on = new Set(f.for_labels || []);
    return msgHTML(S.msg) + `<div data-autosave="rc-save" data-part="top" data-id="${esc(f.id)}">`
      + sectionHTML(T("ed.basics"), `<div class="tf-settings">
        <label><i>${esc(T("ed.name"))}</i><input name="title" value="${esc(f.title)}" maxlength="200"${dis}></label>
        <div class="mini">${esc(T("set.nameNote"))}</div>
        <label><i>${esc(T("set.intro"))}</i><textarea name="intro" rows="3" placeholder="${esc(T("set.introPh"))}"${dis}>${esc(f.intro || "")}</textarea></label>
        <label><i>${esc(T("form.lang"))}</i>${sel("lang", [["zh", "中文"], ["en", "English"]], f.lang, !edit)}</label>
        <div class="mini">${esc(T("set.langNote"))}</div>
        <fieldset class="rc-setfor"><legend>${esc(T("set.for"))}</legend><div class="chips">${SET_LABELS.map(l => `<label class="check"><input type="checkbox" name="for_label" value="${l}"${on.has(l) ? " checked" : ""}${dis}><span>${esc(T("lab." + l))}</span></label>`).join("")}</div>
        <div class="mini">${esc(T("set.forNote"))}</div></fieldset>
        ${edit ? `<div class="form-foot">${autosaveHint("rc-save")}</div>` : ""}</div>`)
      + `</div>`
      + (S.boot && S.boot.can_manage ? sectionHTML("", `<div class="row"><span class="sp"></span><button class="btn quiet sm" data-act="form-delete" data-id="${esc(f.id)}">${esc(T("ed.delete"))}</button></div>`) : "");
  }
  return msgHTML(S.msg) + `<div data-autosave="rc-save" data-part="top" data-id="${esc(f.id)}">`
    + sectionHTML(T("ed.basics"), `<div class="tf-settings">
      <label><i>${esc(T("ed.name"))}</i><input name="title" value="${esc(f.title)}" maxlength="200"${dis}></label>
      <label><i>${esc(T("ed.intro"))}</i><textarea name="intro" rows="3" placeholder="${esc(T("form.introPh"))}"${dis}>${esc(f.intro || "")}</textarea></label>
      <div class="two"><label><i>${esc(T("form.event"))}</i>${sel("event_id", eventOpts(events), f.event_id || "", !edit, T("form.noEvent"))}</label>
      <label><i>${esc(T("ev.term"))}</i>${sel("term_id", termOpts(terms), f.term_id || "", !edit, T("ev.noTerm"))}</label></div>
      <label><i>${esc(T("form.lang"))}</i>${sel("lang", [["zh", "中文"], ["en", "English"]], f.lang, !edit)}</label>
      <label class="check"><input type="checkbox" name="anonymous"${f.anonymous ? " checked" : ""}${dis || (anonLocked ? " disabled" : "")}><span>${esc(T("form.anon"))}</span></label>
      ${anonLocked ? `<div class="mini">${esc(T("ed.anonLocked"))}</div>` : ""}
      <div class="mini">${esc(T("form.consentNote"))}</div>
      ${edit ? `<div class="form-foot">${autosaveHint("rc-save")}</div>` : ""}</div>`)
    + `</div>`
    + `<div data-autosave="rc-save" data-part="bottom" data-id="${esc(f.id)}">`
    + sectionHTML(T("ed.window"), `<div class="tf-settings">
      <label><i>${esc(T("ed.closes"))}</i><input type="datetime-local" name="closes_at" value="${esc(dtLocal(f.closes_at))}"${dis}></label>
      <div class="mini">${esc(T("ed.windowNote"))}</div>
      ${edit ? `<div class="form-foot">${autosaveHint("rc-save")}</div>` : ""}</div>`)
    + `</div>`
    + (S.boot && S.boot.can_manage ? sectionHTML("", `<div class="row"><span class="sp"></span><button class="btn quiet sm" data-act="form-delete" data-id="${esc(f.id)}">${esc(T("ed.delete"))}</button></div>`) : "");
}
// 題目那一區：編輯／預覽切換加畫布。預覽是一個空的框，main.js 在上面 mount 引擎（跟 /feedback/ 同一支，條件邏輯照樣會動）。
// 每一塊右上多一格「代號」：固定題目的名字（recommend、useful…），年度比較靠它，所以留在畫布上，不收進「進階」。
export function questionsHTML(r, S) {
  const f = r.form || {}, edit = !!r.can_edit, qs = S.questions || [], ed = S.fx || {};
  const en = lang() === "en", old = isOldDb(r.questions);
  if (!qs.length && !edit) return emptyHTML(T("ed.noQ"), "");
  const keyBox = q => F.isInput(q) && q.type !== "consent"
    ? `<label class="rc-key" title="${esc(T("q.keyNote"))}"><span>${esc(T("q.keyShort"))}</span><input name="key" value="${esc(q.key || "")}" maxlength="30" spellcheck="false" autocomplete="off"${edit ? "" : " disabled"}></label>` : "";
  const top = `<div class="mini" style="margin-bottom:10px">${esc(T("q.keyNote"))}</div>`
    + (old ? `<div class="note">${esc(T("ed.oldDb"))}</div>` : "")
    + (edit && TEMPLATES[f.kind] && !qs.length ? `<div class="row" style="margin-bottom:12px"><button type="button" class="btn ghost sm" data-act="q-template"${S.busy ? " disabled" : ""}>${esc(T("form.fillTemplate"))}</button></div>` : "");
  return top + F.modeHTML(ed.mode, en)
    + (ed.mode === "preview" ? `<div class="fx-pvbox" id="fx-pv" lang="${f.lang === "en" ? "en" : "zh-Hant"}"></div>`
      : (qs.length ? "" : `<p class="mini">${esc(T("ed.noQHint"))}</p>`)
        + F.canvasHTML(qs, { en, canEdit: edit, menuAt: ed.menuAt, filter: ed.filter, logicOpen: ed.logicOpen, prefill: false,
            types: old ? OLD_TYPES : f.kind === "profile" ? TYPES.filter(t => t !== "page") : f.anonymous ? TYPES.filter(t => t !== "email" && t !== "phone") : TYPES, lockedIds: new Set(qs.filter(q => q.answered).map(q => q.id)),
            hint: q => keyBox(q) + (edit ? autosaveHint("q-save") : "") }));
}
// 設定那一塊讀回來（題目各自存，不在這裡）。
export function readFormEditor(box) {
  const v = allValues(box, "rc-save");
  const data = { title: v.title || "", intro: v.intro || "", event_id: v.event_id || "", term_id: v.term_id || "", lang: v.lang || "zh", closes_at: fromLocal(v.closes_at || ""), anonymous: !!v.anonymous };
  // 一套故事題（2027-01-26）：給哪些人那一排勾，名字都叫 for_label，formValues 只留得住一個，所以另外讀。只送故事題要的幾格。
  const doc = box && box.ownerDocument, tags = doc && doc.querySelectorAll ? [...doc.querySelectorAll('[data-autosave="rc-save"] input[name="for_label"]')] : [];
  if (tags.length) return { data: { title: data.title, intro: data.intro, lang: data.lang, for_labels: tags.filter(t => t.checked).map(t => t.value) } };
  return { data };
}
// 畫布上讀回一題（引擎的 readBlock），代號照這一組的規矩：小寫英文、數字、底線（資料庫也擋）。
export function readBlock(box, old) {
  const q = F.readBlock(box, old);
  const k = box.querySelector('[name="key"]');
  if (k) q.key = String(k.value || "").trim().toLowerCase();
  return Object.assign(q, { ord: old && old.ord, answered: !!(old && old.answered) });
}
// 誰讀得到、誰改得動。配對回饋只能點名，mentor 加不進去（資料庫擋）。
export function audienceHTML(r, people, aud, saved, find, msg, busy) {
  const edit = !!r.can_edit, f = r.form || {}, pair = String(f.kind || "").startsWith("pair-");
  const block = role => {
    const can = role === "editor" ? !!(r.can_manage || f.owner_is_me) : edit;
    const items = aud[role] || [], dis = can ? "" : " disabled";
    const chip = (it, label) => `<button type="button" class="chip${hasItem(items, it) ? " on" : ""}" data-act="aud-toggle" data-role="${role}" data-kind="${it.kind}" data-value="${esc(it.value || "")}" aria-pressed="${hasItem(items, it)}"${dis}>${esc(label)}</button>`;
    const persons = items.filter(it => it.kind === "person").map(it => (people || []).find(p => p.id === it.value) || { id: it.value, name: it.value });
    const inNow = peopleIn(people, items), q = (find || {})[role] || "", hits = can ? findPeople(people, q, persons.map(p => p.id)) : [], dirty = !sameItems(items, saved[role]);
    return sectionHTML(esc(T("aud." + role)), `<div class="mini">${esc(T("aud." + role + "Hint"))}</div><div class="mini">${esc(T(pair ? "aud.alwaysPair" : "aud.always"))}</div>
      ${pair ? "" : `<div class="tf-aud-row"><b>${esc(T("aud.ranks"))}</b><div class="chips">${RANKS.map(x => chip({ kind: "rank", value: x }, T("rank." + x))).join("")}</div></div>
      <div class="tf-aud-row"><b>${esc(T("aud.teams"))}</b><div class="chips">${teamList(people).map(t => chip({ kind: "team", value: t }, t.replace(/\s*Team$/i, ""))).join("")}</div></div>`}
      <div class="tf-aud-row"><b>${esc(T("aud.people"))}</b><div class="chips">${persons.length ? persons.map(p => `<button type="button" class="chip on" data-act="aud-toggle" data-role="${role}" data-kind="person" data-value="${esc(p.id)}" aria-label="${esc(T("aud.remove", { name: p.name }))}"${dis}>${esc(p.name)} ×</button>`).join("") : `<span class="mini">${esc(T("aud.nobodyYet"))}</span>`}</div>
        ${can ? `<input type="search" class="tf-find" data-role="${role}" id="tf-find-${role}" value="${esc(q)}" placeholder="${esc(T("aud.search"))}" autocomplete="off" data-noauto="1">
        ${hits.length ? `<div class="chips tf-hits">${hits.map(p => `<button type="button" class="chip" data-act="aud-toggle" data-role="${role}" data-kind="person" data-value="${esc(p.id)}">+ ${esc(p.name)}${p.team ? `<small> ${esc(teamsOf(p).map(t => t.replace(/\s*Team$/i, "")).join(", "))}</small>` : ""}</button>`).join("")}</div>` : ""}` : ""}</div>
      ${role === "reader" && items.some(it => it.kind !== "person") ? `<div class="msg err" role="status"><span class="msg-k">!</span><span>${esc(T("aud.readerWarn"))}</span></div>` : ""}
      <details class="tf-count"><summary>${esc(T("aud.count", { n: inNow.length }))}</summary><div class="mini">${inNow.map(p => esc(p.name)).join(esc(T("punct.list")))}</div></details>
      ${can ? `<div class="form-foot"><button type="button" class="btn${dirty ? "" : " ghost"}" data-act="aud-save" data-role="${role}"${busy || !dirty ? " disabled" : ""}>${esc(T("aud.save"))}</button>${dirty ? `<span class="mini">${esc(T("aud.unsaved"))}</span>` : ""}</div>` : ""}`, { id: "aud-" + role });
  };
  return msgHTML(msg) + ROLES.map(block).join("");
}
export function resultsHTML(r, msg, showAll) {
  const f = r.form || {}, qs = r.questions || [], rs = r.responses || [], anon = !!f.anonymous;
  const bands = ["under18", "18plus", "unknown"].map(b => [b, rs.filter(x => (x.age_band || "unknown") === b).length]);
  const kpis = `<div class="todo"><div class="kpi"><div class="kpi-n">${rs.length}</div><div class="kpi-l">${esc(T("res.answered"))}</div></div>
    <div class="kpi"><div class="kpi-n">${rs.filter(x => x.contact_ok).length}</div><div class="kpi-l">${esc(T("res.contactOk"))}</div></div>
    <div class="kpi"><div class="kpi-n">${bands[0][1]}</div><div class="kpi-l">${esc(T("age.under18"))}</div><div class="kpi-h">${esc(T("res.bands", { a: bands[1][1], u: bands[2][1] }))}</div></div></div>`;
  if (!rs.length) return msgHTML(msg) + kpis + emptyHTML(T("res.none"), esc(T("res.noneHint")));
  const bar = (label, n, of) => `<div class="tf-bar"><span class="tf-bar-l">${esc(label)}</span><span class="tf-bar-t"><i style="width:${of ? Math.round(n / of * 100) : 0}%"></i></span><b>${n}</b></div>`;
  const sums = summarize(qs, rs).map((s, i) => {
    const head = `<h3 class="tf-sq">${i + 1}. ${esc(s.q.label)} <span class="mini">${s.q.key ? esc(s.q.key) + "・" : ""}${esc(typeName(s.q.type))}</span></h3>`;
    if (s.counts) { const of = Math.max(1, ...s.counts.map(c => c.n), ...s.other.map(c => c.n)); return `<div class="card tf-sum">${head}${s.counts.map(c => bar(c.option, c.n, of)).join("")}${s.other.map(c => bar(c.option + " " + T("res.other"), c.n, of)).join("")}</div>`; }
    if (s.dist) { const of = Math.max(1, ...s.dist.map(d => d.n)); return `<div class="card tf-sum">${head}<div class="tf-avg">${esc(T("res.avg", { avg: s.avg == null ? "–" : s.avg, n: s.n, min: s.q.scale_min, max: s.q.scale_max }))}</div>${s.dist.map(d => bar(String(d.v), d.n, of)).join("")}</div>`; }
    const list = showAll && showAll[s.q.id] ? s.texts : s.texts.slice(0, 6);
    return `<div class="card tf-sum">${head}<div class="mini">${esc(T("res.nAnswers", { n: s.n }))}</div><ul class="tf-texts">${list.map(t => `<li><div>${esc(t.v).replace(/\n/g, "<br>")}</div>${anon || !t.name ? "" : `<span class="mini">${esc(t.name)}</span>`}</li>`).join("")}</ul>
      ${s.texts.length > list.length ? `<button type="button" class="lnk" data-act="res-more" data-id="${esc(s.q.id)}">${esc(T("res.showAll", { n: s.texts.length }))}</button>` : ""}</div>`;
  }).join("");
  const each = `<table class="table tf-each"><thead><tr>${anon ? "" : `<th>${esc(T("res.who"))}</th>`}<th>${esc(T("res.when"))}</th><th>${esc(T("res.age"))}</th><th>${esc(T("res.contact"))}</th></tr></thead><tbody>${rs.map(x => `<tr>${anon ? "" : `<td class="t-main">${x.person_id ? `<a href="#people/${esc(x.person_id)}" data-act="open-person" data-id="${esc(x.person_id)}"><b>${esc(x.name || T("common.noName"))}</b></a>` : `<b>${esc(x.name || "")}</b>`}</td>`}<td>${esc(fmtWhen(x.submitted_at))}</td><td>${esc(T("age." + (x.age_band || "unknown")))}</td><td>${x.contact_ok ? "✓" : ""}</td></tr>`).join("")}</tbody></table>`;
  // 2026-11-09：「多半是未成年」那一句只在真的有未成年、或多數沒說的時候印；一份全是成年人的結果頁上印這句是自打嘴巴。
  const minorsLikely = bands[0][1] > 0 || bands[2][1] >= bands[1][1];
  return msgHTML(msg) + kpis + (anon ? `<div class="note">${esc(T("res.anon"))}</div>` : "") + (minorsLikely ? `<div class="note">${esc(T("res.minors"))}</div>` : "")
    + `<div class="row"><span class="sp"></span><button class="btn ghost sm" data-act="res-csv">${esc(T("res.csv"))}</button></div>`
    + sectionHTML(T("res.summary"), sums) + sectionHTML(T("res.each"), `<div class="tf-scroll">${each}</div>`);
}
export function logHTML(r) {
  const rows = r.log || [];
  if (!rows.length) return `<div class="mini">${esc(T("log.none"))}</div>`;
  const show = v => v == null ? "" : typeof v === "string" ? v : Array.isArray(v) ? v.map(x => x.kind === "rank" ? T("rank." + x.value) : x.value).join(", ") : JSON.stringify(v);
  return `<ul class="flist">${rows.map(l => `<li><div class="fhead"><b>${esc(T("log." + l.what) || l.what)}</b> <span class="mini">${esc(fmtWhen(l.at))}・${esc(l.who || "")}</span></div><div class="fmeta">${l.before != null ? esc(show(l.before)) + " → " : ""}${esc(show(l.after))}</div></li>`).join("")}</ul>`;
}

// 人：找、重複、加。
// ── 名錄（2026-12-03）：rc_directory() 整份拿回來，搜尋與篩選都在瀏覽器裡做（一千多個人的 JSON 幾百 KB，一次拿比每打一個字問一次快）。 ──
// 篩選的鍵跟 rc_directory 回的欄位一一對應。純函式，test/records.test.mjs 用假資料測。
// 2027-01-03（關係網）：多 label（標籤）與兩個快速篩選 speak、mentor（他自己舉手說願意演講、願意當 mentor）。
// kind 留在函式裡（遷移檔還沒跑的資料庫還在用那個下拉），跑過之後畫面上換成標籤那一格。
export const DIR_FILTERS = ["kind", "label", "who", "role", "team", "school", "grad", "term", "event", "country", "speak", "mentor"];
// 這個人在 BT 當過什麼（2026-11-10 Paul：名錄上用標籤，mentor 標 Mentor、mentee 標 Mentee、實習生標 Intern、其他參加活動的標 Student）。
// roles 是 rc_participation 的角色，account 是登入帳號的身分（intern 就是實習生）。講者、工作人員、志工、校友來賓照自己的名字標，
// 那些多半是幹部或外面的人，標成學員會錯。
export const WHO_ORDER = ["intern", "mentor", "mentee", "student", "speaker", "organizer", "volunteer", "alumni"];
export function whoTags(roles, account) {
  const have = new Set(roles || []);
  if (account === "intern") have.add("intern");
  return WHO_ORDER.filter(k => have.has(k));
}
export function whoTagsHTML(tags) { return tags.map(k => `<span class="tag who-${esc(k)}">${esc(T(k === "intern" ? "who.intern" : "prole." + k))}</span>`).join(" "); }
const norm = v => String(v == null ? "" : v).toLowerCase().replace(/\s+/g, "");
export function filterDirectory(list, q, f) {
  const qq = norm(q); const x = f || {};
  return (Array.isArray(list) ? list : []).filter(p => {
    if (qq && !(norm(p.name).includes(qq) || norm(p.name_zh).includes(qq) || norm(p.name_en).includes(qq) || norm(p.school).includes(qq)
      || (p.aliases || []).some(a => norm(a).includes(qq)) || (p.schools || []).some(a => norm(a).includes(qq)))) return false;
    if (x.kind && p.kind !== x.kind) return false;
    if (x.label && !(p.labels || []).some(c => labelFilterKey(c) === x.label)) return false;
    if (x.speak && !p.offer_speak) return false;
    if (x.mentor && !p.offer_mentor) return false;
    if (x.who && !whoTags(p.roles, p.role).includes(x.who)) return false;
    if (x.role === "none" ? p.has_account : (x.role && p.role !== x.role)) return false;
    if (x.team && !parseTeamsLoose(p.team).includes(x.team)) return false;
    if (x.school && (p.school || "") !== x.school && !(p.schools || []).includes(x.school)) return false;   // 讀過的學校也算（2026-12-10）
    if (x.grad && String(p.grad_year || "") !== String(x.grad)) return false;
    if (x.term && !(p.terms || []).includes(x.term)) return false;
    if (x.event && !(p.events || []).includes(x.event)) return false;
    if (x.country && !(p.countries || []).includes(x.country)) return false;
    return true;
  });
}
// profiles.team 是逗號字串（一個人可以在好幾個 team），這裡只拆不驗。
function parseTeamsLoose(raw) { return String(raw || "").split(/[,、;；]/).map(t => t.trim().replace(/\s+/g, " ")).filter(Boolean); }
// 下拉的選項從名錄本身長出來（有人在那個學校才有那個學校），每一個都帶人數。
export function dirOptions(list, events) {
  const L = Array.isArray(list) ? list : [];
  const count = (pick) => { const m = new Map(); for (const p of L) for (const v of pick(p)) if (v) m.set(v, (m.get(v) || 0) + 1); return [...m].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]))); };
  const evTitle = id => { const e = (events || []).find(e => e.id === id); return e ? ((lang() === "zh" ? e.title_zh : e.title_en) || e.title_en || e.title_zh || e.slug) : null; };
  return {
    kind: count(p => [p.kind]),
    label: count(p => [...new Set((p.labels || []).map(labelFilterKey))]).filter(x => LABEL_FILTERS.includes(x[0])).sort((a, b) => LABEL_FILTERS.indexOf(a[0]) - LABEL_FILTERS.indexOf(b[0])),
    who: count(p => whoTags(p.roles, p.role)).sort((a, b) => WHO_ORDER.indexOf(a[0]) - WHO_ORDER.indexOf(b[0])),
    role: count(p => [p.has_account ? p.role : "none"]),
    team: count(p => parseTeamsLoose(p.team)),
    school: count(p => [...new Set([p.school, ...(p.schools || [])].filter(Boolean))]),
    grad: count(p => [p.grad_year ? String(p.grad_year) : ""]).sort((a, b) => b[0].localeCompare(a[0])),
    term: count(p => p.terms || []).sort((a, b) => b[0].localeCompare(a[0])),
    event: count(p => p.events || []).map(([id, n]) => [id, n, evTitle(id)]).filter(x => x[2]),
    country: count(p => p.countries || []),
  };
}
export const DIR_PAGE = 100;
// 有帳號那個標籤：實習生、學員前面已經有 Intern、Student 標籤了，這裡只說「有帳號」，不再重複一次身分。
export function acctTag(p) {
  const role = p.role || "student", tags = whoTags(p.roles, p.role);
  return (role === "intern" && tags.includes("intern")) || (role === "student" && (tags.includes("student") || p.kind === "student")) ? T("acct.has") : T("acct." + role);
}
// 名字旁邊那排標籤：當過什麼在前；身分（成員、來賓、學員）只在跟後面重複時不印（學員又有 Student 標籤就只印一個）。
export function rowTags(p) {
  const tags = whoTags(p.roles, p.role);
  const kind = p.kind === "student" && tags.includes("student") ? "" : `<span class="tag">${esc(T("pkind." + p.kind))}</span>`;
  return [kind, whoTagsHTML(tags)].filter(Boolean).join(" ");
}
// 搜尋框右邊那顆「篩選」的圖示（三條由長到短的橫線）。
const FUNNEL = `<svg class="fbx-ic" viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><path d="M3 5h14M6 10h8M8.5 15h3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;
// 名錄現在有哪幾個篩選開著，各自印成什麼字（搜尋框底下那排可以按掉的 chip）。純函式。
export function dirActive(f, events) {
  const x = f || {}, lab = { kind: "dir.kind", label: "dir.label", who: "dir.who", role: "dir.role", team: "dir.team", school: "dir.school", grad: "dir.grad", term: "dir.term", event: "dir.event", country: "dir.country" };
  const val = (k, v) => k === "kind" ? T("pkind." + v) : k === "label" ? labelName(parseLabel(v).label, parseLabel(v).current) : k === "who" ? T(v === "intern" ? "who.intern" : "prole." + v)
    : k === "role" ? (v === "none" ? T("dir.noAccount") : T("acct." + v)) : k === "event" ? (((events || []).find(e => e.id === v) || {}).title || T("dir.event")) : v;
  return DIR_FILTERS.filter(k => x[k]).map(k => k === "speak" ? { k, text: T("dir.offerSpeak") } : k === "mentor" ? { k, text: T("dir.offerMentor") } : { k, text: `${T(lab[k])}${T("dir.sep")}${val(k, x[k])}` });
}
// 合併那張卡要的一欄，從 rc_person 回的那一包轉過來（跟「可能重複」那張卡吃同一個形狀）。
export function mergeMember(d) {
  const p = (d && d.person) || {};
  const emails = [...new Set((((d && d.identities) || []).filter(i => i.kind === "email").map(i => i.value)).concat(p.login_email ? [p.login_email] : []).map(e => String(e || "").trim().toLowerCase()).filter(Boolean))];
  return { id: p.id, name: p.name || "", name_zh: p.name_zh || "", name_en: p.name_en || "", emails, kind: p.kind || "student", has_account: !!p.has_account, role: p.role || "",
    school: p.school || "", schools: ((d && d.schools) || []).map(x => x.school).filter(Boolean), grad_year: p.grad_year || null,
    events: ((d && d.participation) || []).map(x => ({ title: x.event || "", year: x.starts_at ? String(x.starts_at).slice(0, 4) : "", role: x.role })),
    n_pairs: ((d && d.pairs) || []).length, n_outcomes: ((d && d.outcomes) || []).length, note: p.note || "", created_at: p.created_at || "" };
}
// 自己挑的那幾個人，建議留哪一個：有登入帳號的優先，再來是參與紀錄多的，再來是先建的。
export function mergeSuggest(members) {
  const m = (members || []).slice().sort((a, b) => (b.has_account ? 1 : 0) - (a.has_account ? 1 : 0) || (b.events || []).length - (a.events || []).length || String(a.created_at || "").localeCompare(String(b.created_at || "")));
  return m.length ? m[0].id : "";
}
export function directoryHTML(S) {
  const boot = S.boot || {}, dir = S.dir, f = S.df || {}, events = boot.events || [];
  if (S.dirErr) return `<div class="msg err" role="status"><span class="msg-k">${esc(T("msg.err"))}</span><span>${esc(S.dirErr)}</span></div>`;   // 不走 msgHTML：它只畫 err. 開頭的句子，這一句是「還沒跑遷移檔」
  if (!Array.isArray(dir)) return `<div class="mini">${esc(T("dir.loading"))}</div>`;
  const opts = dirOptions(dir, events);
  const hits = filterDirectory(dir, S.pq, f);
  const shown = hits.slice(0, S.dirN || DIR_PAGE);
  // 遷移檔跑過沒：名錄的每一列都帶 labels（陣列）。空的名錄當成跑過，不為了零個人印一句「要先跑遷移檔」。
  const net = !dir.length || dir.some(hasNetwork);
  const optLabel = (key, v) => key === "kind" ? T("pkind." + v) : key === "label" ? labelName(parseLabel(v).label, parseLabel(v).current) : key === "who" ? T(v === "intern" ? "who.intern" : "prole." + v) : key === "role" ? (v === "none" ? T("dir.noAccount") : T("acct." + v)) : v;
  const box = (key, labelKey, anyKey) => `<label><i>${esc(T(labelKey))}</i><select name="${key}" class="rc-dfilter" data-noauto="1">${pickOpt("", T(anyKey), f[key] || "")}${(opts[key] || []).map(([v, n, title]) => pickOpt(v, `${title || optLabel(key, v)} (${n})`, f[key] || "")).join("")}</select></label>`;
  const on = dirActive(f, events);
  const active = on.length + (S.pq ? 1 : 0);
  const dbHits = S.pq && S.pq.includes("@") && boot.can_manage ? (S.people || []) : null;
  // 合併（2026-11-25 Paul：「if I see two possible people that I think they're the same person, I can merge them by myself」）：
  // 按「合併」進到挑人的樣子，每一列前面多一格勾選；勾了兩個以上按「比一比」，底下出現跟「可能重複」一樣的那張卡。
  const mm = !!S.mergeMode && !!boot.can_manage, picked = mm ? (S.pick || []) : [];
  const nameOf = id => ((dir.find(p => p.id === id) || {}).name) || T("common.noName");
  // 一列：名字、標籤（沒跑遷移檔的退回舊的那排）、有沒有帳號；他自己舉的手；現在做什麼（領域、職稱、單位、城市，有填才印）；再來是原本那一行。
  const now = p => [p.field, p.job_title, p.job_org, [p.city, p.country_now].filter(Boolean).join(", ")].filter(Boolean);
  const offers = p => `${p.offer_speak ? ` <span class="tag ok">${esc(T("dir.offerSpeak"))}</span>` : ""}${p.offer_mentor ? ` <span class="tag ok">${esc(T("dir.offerMentor"))}</span>` : ""}`;
  const tick = p => mm ? `<label class="pick rc-pickbox"><input type="checkbox" class="rc-pick" value="${esc(p.id)}" data-noauto="1"${picked.includes(p.id) ? " checked" : ""} aria-label="${esc(T("mrg.tick", { name: p.name || T("common.noName") }))}"></label>` : "";
  const row = p => `<li${mm ? ' class="rc-pickrow"' : ""}>${tick(p)}<div><div class="fhead"><a href="#people/${esc(p.id)}" data-act="open-person" data-id="${esc(p.id)}"><b>${esc(p.name || T("common.noName"))}</b></a> ${hasNetwork(p) ? labelChipsHTML(p.labels) : rowTags(p)}${p.has_account ? ` <span class="tag open">${esc(acctTag(p))}</span>` : ""}${offers(p)}</div>
      ${now(p).length ? `<div class="fmeta rc-now">${now(p).map(v => esc(String(v))).join("・")}</div>` : ""}<div class="fmeta">${[p.school, p.grad_year, p.team, (p.terms || []).slice().sort().reverse().join(" "), p.n ? T("dir.events", { n: p.n }) : "", p.latest, (p.countries || []).join(" ")].filter(Boolean).map(v => esc(String(v))).join("・")}</div></div></li>`;
  // 篩選收在搜尋框右邊那一顆裡（2026-11-25 Paul：「they're not supposed to be there. Instead, can you build maybe a filter icon to the right」）。
  // 開著的篩選印成搜尋框底下一排 chip，按一下就拿掉；面板收著的時候也看得到現在篩了什麼。
  const panel = !S.dfOpen ? "" : `<div class="fbx-panel" id="rc-dfilters">
      <div class="fbx-grid">${net ? box("label", "dir.label", "dir.anyLabel") : box("kind", "dir.kind", "dir.anyKind") + box("who", "dir.who", "dir.anyWho")}${box("role", "dir.role", "dir.anyRole")}${box("team", "dir.team", "dir.anyTeam")}${box("school", "dir.school", "dir.anySchool")}${box("grad", "dir.grad", "dir.anyGrad")}${box("term", "dir.term", "dir.anyTerm")}${box("event", "dir.event", "dir.anyEvent")}${box("country", "dir.country", "dir.anyCountry")}</div>
      ${net ? `<div class="fbx-toggles" role="group" aria-label="${esc(T("dir.quick"))}">${[["speak", "dir.offerSpeak"], ["mentor", "dir.offerMentor"]].map(([k, l]) => `<button type="button" class="chip sm${f[k] ? " on" : ""}" aria-pressed="${f[k] ? "true" : "false"}" data-act="dir-quick" data-k="${k}">${esc(T(l))}</button>`).join("")}</div>` : ""}
      <div class="fbx-foot">${on.length ? `<button type="button" class="btn quiet sm" data-act="dir-clear">${esc(T("dir.clear"))}</button>` : ""}<button type="button" class="btn ghost sm" data-act="dir-filters">${esc(T("dir.filtersDone"))}</button></div>
    </div>`;
  const chips = on.length ? `<div class="fbx-chips">${on.map(c => `<button type="button" class="chip sm on" data-act="dir-unset" data-k="${esc(c.k)}" aria-label="${esc(T("dir.unset", { what: c.text }))}">${esc(c.text)} ×</button>`).join("")}</div>` : "";
  const mergeBar = !mm ? "" : `<div class="rc-mergebar">
      <p><b>${esc(T("mrg.title"))}</b> <span class="mini">${esc(T("mrg.hint"))}</span></p>
      ${picked.length ? `<div class="fbx-chips">${picked.map(id => `<button type="button" class="chip sm on" data-act="dir-unpick" data-id="${esc(id)}" aria-label="${esc(T("mrg.unpick", { name: nameOf(id) }))}">${esc(nameOf(id))} ×</button>`).join("")}</div>` : ""}
      <div class="form-foot"><button type="button" class="btn sm" data-act="dir-compare"${picked.length < 2 || S.busy ? " disabled" : ""}>${esc(picked.length < 2 ? T("mrg.compare0") : T("mrg.compare", { n: picked.length }))}</button><button type="button" class="btn quiet sm" data-act="dir-merge-mode">${esc(T("common.cancel"))}</button></div>
      ${S.manual && Array.isArray(S.manual.members) && S.manual.members.length >= 2 ? dupGroupHTML(S.manual, S.busy, !!(S.me && S.me.pres), true) : ""}
    </div>`;
  return `<div class="card">
    ${net ? "" : `<div class="note">${esc(T("net.noSql"))}</div>`}
    <div class="fbx">
      <div class="fbx-row"><input type="search" id="rc-pfind" class="rc-pfind" value="${esc(S.pq || "")}" placeholder="${esc(T("dir.searchPh"))}" aria-label="${esc(T("dir.search"))}" autocomplete="off" data-noauto="1"><button type="button" class="fbx-btn${on.length ? " on" : ""}" data-act="dir-filters" aria-expanded="${S.dfOpen ? "true" : "false"}" aria-controls="rc-dfilters">${FUNNEL}<span>${esc(T("dir.filters"))}</span>${on.length ? `<b class="fbx-n">${on.length}</b>` : ""}</button></div>
      ${chips}${panel}
    </div>
    <div class="row rc-dirbar"><b data-dir-count>${esc(active ? T("dir.countOf", { n: hits.length, total: dir.length }) : T("dir.count", { n: dir.length }))}</b>${active ? ` <button class="btn quiet sm" data-act="dir-clear">${esc(T("dir.clear"))}</button>` : ""}${boot.can_manage && !mm ? `<button type="button" class="btn ghost sm rc-mergego" data-act="dir-merge-mode">${esc(T("mrg.go"))}</button>` : ""}</div>
    ${mergeBar}
    ${dbHits ? (dbHits.length ? `<ul class="flist">${dbHits.map(p => row({ ...p, terms: [], countries: [] })).join("")}</ul>` : `<div class="mini">${esc(T("pp.noHit"))}</div>`)
      : hits.length ? `<ul class="flist">${shown.map(row).join("")}</ul>${hits.length > shown.length ? `<div class="form-foot"><button class="btn ghost sm" data-act="dir-more">${esc(T("dir.more", { n: Math.min(DIR_PAGE, hits.length - shown.length) }))}</button></div>` : ""}`
      : `<div class="mini">${esc(T("dir.empty"))}</div>`}
  </div>`;
}
// 名錄裡一個人在下拉清單上的那一行：名字 · 學校或身分 · 畢業年。選到之後用這一行反查 id（dirMatch）。
// 沒有學校的人第二段印他的第一個標籤（幹部、講者…）；遷移檔還沒跑、沒有標籤的資料庫才退回舊的身分。
export const dirLabel = x => [x.name || T("common.noName"), x.school || (hasNetwork(x) ? (x.labels.length ? labelName(parseLabel(x.labels[0]).label, parseLabel(x.labels[0]).current) : "") : T("pkind." + (x.kind || "student"))), x.grad_year || ""].filter(Boolean).join(" · ");
export function dirMatch(list, label) { const l = String(label || "").trim(); if (!l) return null; return (list || []).find(x => dirLabel(x) === l) || null; }
// 一組同名的人，一張卡 N 欄（2026-12-06；12-05 那版是兩兩一組，三個同名會變三張卡，Paul 問「第一張的左邊要跟第二張的右邊合怎麼辦」）。
// 每一欄：radio「留這一欄」（預設建議的那欄）、checkbox「併進留的那一欄」（預設勾，除了留的那欄、跟說過「不是同一個人」的）。
// 底下兩顆鈕：把勾起來的併進去；勾起來的不是留的那個人。沒有摘要（遷移檔還沒跑）就退回只印名字。
// 兩欄「可能是不同人」：兩邊都有 email 而且沒有一個相同，而且兩邊都有中文名而且不一樣（Paul 2026-11-09：
// 「if they have different emails and Chinese names they are probably different people」）。只有一邊有 email 或中文名的不算，資訊不夠。
export function likelyOther(m, k) {
  if (!m || !k || m.id === k.id) return false;
  const em = x => new Set((x.emails || []).map(e => String(e).trim().toLowerCase()).filter(Boolean));
  const zh = x => String(x.name_zh || "").replace(/\s+/g, "");
  const a = em(m), b = em(k);
  const emailDiff = a.size > 0 && b.size > 0 && ![...a].some(e => b.has(e));
  const zhDiff = zh(m) && zh(k) && zh(m) !== zh(k);
  return Boolean(emailDiff && zhDiff);
}
// 一欄跟建議留的那欄比：資料庫算好的 vs_keep（2026-12-09 的 rc_dup_verdict：same／unsure／different 加證據代號）。
// 遷移檔還沒跑、沒有 vs_keep 的時候退回瀏覽器這邊的粗略版：email 跟中文名都不同算 different，中文名一樣算 same，其他 unsure。
export function verdictOf(m, k) {
  if (!m || !k || m.id === k.id) return { verdict: "keep", same: [], diff: [] };
  if (m.vs_keep && m.vs_keep.verdict) return { verdict: m.vs_keep.verdict, same: m.vs_keep.same || [], diff: m.vs_keep.diff || [] };
  if (likelyOther(m, k)) return { verdict: "different", same: [], diff: ["email_disjoint", "zh_diff"] };
  const zh = x => String(x.name_zh || "").replace(/\s+/g, "");
  if (zh(m) && zh(m) === zh(k)) return { verdict: "same", same: ["zh_same"], diff: [] };
  return { verdict: "unsure", same: [], diff: [] };
}
const evText = codes => (codes || []).map(c => T("dup.ev." + c)).join(T("dup.listSep"));
// 一欄能不能併進留的那欄、併了會怎樣（2026-12-11）。回 null（沒事）或 { kind, text }：
//   block：這個人併不了（兩邊都有登入帳號、或這欄是幹部／有帳號，而現在的人不是 Co-President）；不勾、勾不了。
//   retire：兩邊都有登入帳號而且是 Co-President：併進去會把這欄的登入刪掉（rc_merge_accounts）。
//   takeover：這欄有登入、留的那欄沒有：留的那列接手這個登入（merge_people 那條路）。
export function dupBlocker(m, k, pres) {
  if (!m || !k || m.id === k.id) return null;
  const emails = (m.emails || []).join(", ");
  const mHas = !!m.has_account, kHas = !!k.has_account;
  if (mHas && kHas) return pres ? { kind: "retire", text: T("dup.retire", { emails }) } : { kind: "block", text: T("dup.needPresAcct") };
  if ((mHas || m.kind === "member") && !pres) return { kind: "block", text: T("dup.needPresMember") };
  if (mHas && !kHas) return { kind: "takeover", text: T("dup.takeover") };
  return null;
}
// 卡最上面那一句：這幾欄像不像同一個人、哪幾欄併不了或會刪登入、接下來按什麼。
export function dupVerdictLine(members, keep, pres) {
  const keepM = members.find(m => m.id === keep); if (!keepM || members.length < 2) return "";
  const col = m => members.indexOf(m) + 1;
  const others = members.filter(m => m.id !== keep).map(m => ({ m, v: verdictOf(m, keepM), b: dupBlocker(m, keepM, pres) }));
  const blocked = o => !!(o.b && o.b.kind === "block");
  // 「像同一個人、已經勾好」只數真的勾得了的；併不了的那幾欄另外一句講
  const same = others.filter(o => o.v.verdict === "same" && !blocked(o)), unsure = others.filter(o => o.v.verdict === "unsure" && !blocked(o)), diff = others.filter(o => o.v.verdict === "different" && !blocked(o));
  const parts = [];
  if (same.length) parts.push(T("dup.vSame", { n: same.length, ev: evText([...new Set(same.flatMap(o => o.v.same))]) }));
  if (unsure.length) parts.push(T("dup.vUnsure", { cols: unsure.map(o => col(o.m)).join(T("dup.listSep")) }));
  if (diff.length) parts.push(T("dup.vDiff", { cols: diff.map(o => col(o.m)).join(T("dup.listSep")), ev: evText([...new Set(diff.flatMap(o => o.v.diff))]) }));
  const bl = others.filter(o => o.b);
  const retire = bl.filter(o => o.b.kind === "retire"), block = bl.filter(o => o.b.kind === "block"), take = bl.filter(o => o.b.kind === "takeover");
  if (retire.length) parts.push(T("dup.vRetire", { cols: retire.map(o => col(o.m)).join(T("dup.listSep")), emails: retire.flatMap(o => o.m.emails || []).join(", ") }));
  if (block.length) parts.push(T("dup.vBlock", { cols: block.map(o => col(o.m)).join(T("dup.listSep")) }));
  if (take.length) parts.push(T("dup.vTakeover", { cols: take.map(o => col(o.m)).join(T("dup.listSep")) }));
  parts.push(T("dup.how", { col: col(keepM) }));
  return parts.join(" ");
}
// 合併那顆鈕的字：勾了幾欄、併進第幾欄。純函式，box 是那張卡的 DOM（或假的）。改勾選時 main.js 會重算。
export function dupBtnLabel(box) {
  const radios = [...box.querySelectorAll('input[type="radio"]')];
  const ki = radios.findIndex(r => r.checked); const k = ki >= 0 ? radios[ki].value : "";
  const n = [...box.querySelectorAll('input[type="checkbox"]:checked')].filter(c => c.value && c.value !== k).length;
  return n ? T("dup.mergeBtnN", { n, col: ki + 1 }) : T("dup.mergeBtn0");
}
// manual：名錄上自己挑的那幾個人（2026-11-25）。每一欄預設都勾（他已經說這些是同一個人）、最上面那句換成怎麼做、沒有「不是同一個人」那顆。
export function dupGroupHTML(g, busy, pres, manual) {
  const members = Array.isArray(g.members) && g.members.length ? g.members : [
    { id: g.a, name: g.a_name, kind: g.a_kind, school: g.a_school }, { id: g.b, name: g.b_name, kind: g.b_kind, school: g.b_school }].filter(m => m.id);
  const keep = g.suggest && members.some(m => m.id === g.suggest) ? g.suggest : (g.suggest === "b" && members[1] ? members[1].id : members[0].id);
  const notSame = new Set((g.not_same || []).map(([a, b]) => `${a}|${b}`));
  const isNotSame = (x, y) => notSame.has(`${x}|${y}`) || notSame.has(`${y}|${x}`);
  const keepM = members.find(m => m.id === keep);
  const vOf = m => verdictOf(m, keepM);
  const blk = m => dupBlocker(m, keepM, !!pres);
  const key = g.key || members.map(m => m.id).join(",");
  const evs = m => (m.events || []).map(e => `${esc(e.title)}${e.year ? ` ${esc(String(e.year))}` : ""}・${esc(T("prole." + e.role))}`).join("<br>");
  const rows = [
    ["person.nameZh", m => esc(m.name_zh || "")],
    ["person.nameEn", m => esc(m.name_en || "")],
    ["dup.email", m => (m.emails || []).map(esc).join("<br>")],
    ["person.kind", m => esc(T("pkind." + (m.kind || "student")))],
    ["dup.account", m => esc(m.has_account ? T("acct." + (m.role || "student")) : T("dup.noAccount"))],
    ["person.school", m => esc(m.school || "")],
    ["dup.schools", m => (m.schools || []).filter(x => (x || "").toLowerCase() !== (m.school || "").toLowerCase()).map(esc).join("<br>")],
    ["person.gradYear", m => esc(m.grad_year ? String(m.grad_year) : "")],
    ["dup.events", m => evs(m)],
    ["dup.pairs", m => m.n_pairs == null ? "" : esc(String(m.n_pairs))],
    ["dup.outcomes", m => m.n_outcomes == null ? "" : esc(String(m.n_outcomes))],
    ["dup.answers", m => m.n_answers == null ? "" : esc(String(m.n_answers))],
    ["dup.note", m => esc(m.note || "")],
    ["dup.created", m => esc(m.created_at ? fmtDay(m.created_at) : "")],
  ];
  const tr = ([k, fn]) => { const cells = members.map(fn); const diff = new Set(cells).size > 1; const allEmpty = cells.every(c => !c);
    if (allEmpty) return "";
    const lab = k === "dup.events" ? T(k, { n: "" }).replace(/\s*[（(].*$/, "") : T(k);
    return `<tr${diff ? ' class="diff"' : ""}><th>${esc(lab)}</th>${cells.map(c => `<td>${c}</td>`).join("")}</tr>`; };
  // 表頭：建議留的那欄橘底線加「建議留這一欄」；其他欄照跟它比的結果掛一個小標籤（像同一個人／資料不夠／像不同人）加證據。
  const tagOf = m => { if (m.id === keep) return members.length > 1 ? ` <span class="tag open">${esc(T("dup.suggest"))}</span>` : "";
    const v = vOf(m); const ev = v.verdict === "different" ? evText(v.diff) : evText(v.same); const b = blk(m);
    const cls = v.verdict === "same" ? "ok" : v.verdict === "different" ? "warn" : "draft";
    const extra = b && b.kind === "block" ? ` <span class="tag closed">${esc(T("dup.tagBlock"))}</span>` : b && b.kind === "retire" ? ` <span class="tag warn">${esc(T("dup.tagRetire"))}</span>` : "";
    return ` <span class="tag ${cls}" title="${esc(ev)}">${esc(T("dup.v." + v.verdict))}</span>${extra}${ev ? `<div class="mini">${esc(ev)}</div>` : ""}`; };
  const head = m => `<th class="${m.id === keep ? "kept" : vOf(m).verdict === "different" ? "other" : ""}"><a href="#people/${esc(m.id)}" data-act="open-person" data-id="${esc(m.id)}"><b>${esc(m.name || T("common.noName"))}</b></a>${tagOf(m)}</th>`;
  // 底下兩列：一列 radio「留這一欄」、一列 checkbox「併進去」，格子只放那一顆（文字在最左邊的表頭），圈圈才對得齊
  // （2026-11-09 Paul 截圖：三欄各自「Keep this one」「Merge into the kept one」擠在格子裡換行，圓圈沒對齊；radio 還吃到 input 的 width:100%）。
  // 預設只勾「像同一個人」的那幾欄；資料不夠、像不同人、說過不是的都不勾。
  const rad = m => `<td><label class="pick"><input type="radio" name="keep-${esc(key)}" value="${esc(m.id)}" data-noauto="1"${m.id === keep ? " checked" : ""} aria-label="${esc(T("dup.keepRadio"))}: ${esc(m.name || T("common.noName"))}"></label></td>`;
  const box = m => { const ns = isNotSame(m.id, keep), v = vOf(m).verdict, b = blk(m), blocked = !!(b && b.kind === "block");
    return `<td><label class="pick"><input type="checkbox" name="merge-${esc(key)}" value="${esc(m.id)}" data-noauto="1"${m.id !== keep && !ns && !blocked && (manual || v === "same") ? " checked" : ""}${m.id === keep || blocked ? " disabled" : ""} aria-label="${esc(T("dup.mergeCheck"))}: ${esc(m.name || T("common.noName"))}"></label><div class="mini" data-blk="${esc(m.id)}">${ns ? esc(T("dup.notSameTag")) : b ? esc(b.text) : ""}</div></td>`; };
  const n0 = members.filter(m => m.id !== keep && !isNotSame(m.id, keep) && (manual || vOf(m).verdict === "same") && !(blk(m) && blk(m).kind === "block")).length;
  const btn = n0 ? T("dup.mergeBtnN", { n: n0, col: members.indexOf(keepM) + 1 }) : T("dup.mergeBtn0");
  return `<div class="card dup" data-dup="${esc(key)}">
    <p class="rc-verdict">${esc(manual ? T("mrg.cardHint", { col: members.indexOf(keepM) + 1 }) : dupVerdictLine(members, keep, !!pres))}</p>
    <div class="tf-scroll"><table class="table rc-table rc-dup"><thead><tr><th></th>${members.map(head).join("")}</tr></thead>
    <tbody>${rows.map(tr).join("")}</tbody>
    <tfoot><tr><th>${esc(T("dup.keepRadio"))}</th>${members.map(rad).join("")}</tr><tr><th>${esc(T("dup.mergeCheck"))}</th>${members.map(box).join("")}</tr></tfoot></table></div>
    <div class="form-foot"><button class="btn sm" data-act="dup-merge" data-group="${esc(key)}"${busy ? " disabled" : ""}>${esc(btn)}</button>${manual ? "" : `<button class="btn quiet sm" data-act="dup-not-same" data-group="${esc(key)}"${busy ? " disabled" : ""}>${esc(T("dup.notSameBtn"))}</button>`}</div>
  </div>`;
}
// 「同名但不是同一個人」那一段 2026-11-25 拿掉了（Paul：「there's no need to show this section… Just delete that. Or maybe instead… make a possible way to merge two people」）。
// 要併兩個系統沒有列出來的人，到名錄按「合併」自己挑（directoryHTML 的 mergeBar）。
// 從卡上讀「留哪欄、勾了哪幾欄」。純函式：box 是那張卡的 DOM（或假的 querySelectorAll）。
export function dupPick(box) {
  const keep = box.querySelector('input[type="radio"]:checked'); const k = keep ? keep.value : "";
  const drops = [...box.querySelectorAll('input[type="checkbox"]:checked')].map(c => c.value).filter(v => v && v !== k);
  return { keep: k, drops };
}
// 「人」那一頁：三個分頁，名錄是主畫面，「可能重複」與「加一個人」在後面（2026-12-03 之前只有後兩樣，Paul 點進來以為壞了）。
export function peopleHTML(boot, S) {
  const b = boot || {}, dups = b.duplicates || [];
  const tab = S.ptab === "dups" || S.ptab === "add" ? S.ptab : "dir";
  const n = Array.isArray(S.dir) ? S.dir.length : ((b.counts || {}).people || 0);
  const tabs = [["dir", T("dir.tab", { n })], ["dups", T("dir.dupTab", { n: dups.filter(d => (Array.isArray(d.members) ? d.members.length >= 2 : !!d.a)).length })]].concat(b.can_manage ? [["add", T("dir.addTab")]] : []);
  const tabHTML = `<nav class="subtabs ptabs" aria-label="${esc(T("pp.title"))}">${tabs.map(([k, l]) => `<button type="button" class="subtab${k === tab ? " on" : ""}"${k === tab ? ' aria-current="page"' : ""} data-act="ptab" data-t="${k}">${esc(l)}</button>`).join("")}</nav>`;
  const cards = dups.filter(d => (Array.isArray(d.members) ? d.members.length >= 2 : !!d.a));   // 只剩 set_aside 的群不算一張卡
  const dupHTML = sectionHTML(T("pp.dups", { n: cards.length }), cards.length ? `<div class="mini">${esc(T("pp.dupsHint"))} ${esc(T("dup.groupHint"))}</div>${cards.map(d => dupGroupHTML(d, S.busy, !!(S.me && S.me.pres))).join("")}` : `<div class="mini">${esc(T("pp.noDups"))}</div>`) + `<div class="mini rc-duphow">${esc(T("mrg.fromDups"))}</div>`;
  const add = b.can_manage ? sectionHTML(T("pp.add"), `<div data-padd><div class="two"><label><i>${esc(T("person.nameZh"))}</i><input name="name_zh" maxlength="60"></label><label><i>${esc(T("person.nameEn"))}</i><input name="name_en" maxlength="60"></label></div>
      <div class="two"><label><i>${esc(T("person.email"))}</i><input name="email" type="email" maxlength="120"></label><label><i>${esc(T("person.school"))}</i><input name="school" maxlength="80"></label></div>
      <div class="two"><label><i>${esc(T("person.gradYear"))}</i><input name="grad_year" type="number" min="2000" max="2100"></label><span></span></div>
      ${hsCheckHTML(false, false)}
      <div class="form-foot"><button class="btn sm" data-act="person-add"${S.busy ? " disabled" : ""}>${esc(T("pp.addBtn"))}</button><span class="mini">${esc(T("pp.addHint"))}</span></div></div>`) : "";
  return pageHead(T("pp.title"), T("pp.lede"), []) + msgHTML(S.msg) + tabHTML + (tab === "dups" ? dupHTML : tab === "add" ? add : directoryHTML(S));
}
// 收起來的「加一個…」表單（2026-11-10 Paul：加學校、加聯絡方式這些一直開著，找資料的時候很干擾）。
// 預設收著只剩一行；打開過的在重畫之後還開著（例如加失敗、自動存檔重畫），換到別的人或別頁就是另一把 key。
const FOLD_OPEN = new Set();
export function foldKey(name, S) { return `${(S && S.view) || ""}:${(S && S.id) || ""}:${name}`; }
export function setFold(key, open) { if (open) FOLD_OPEN.add(key); else FOLD_OPEN.delete(key); }
export function foldStart(name, attr, title, S) {
  const key = foldKey(name, S);
  return `<details class="fold rc-fold" ${attr} data-fold="${esc(key)}"${FOLD_OPEN.has(key) ? " open" : ""}><summary><span class="chev" aria-hidden="true"></span><b>${esc(title)}</b></summary><div class="fold-body">`;
}
// 聯絡方式（2026-12-12）。順序就是加的時候下拉選單的順序。
export const CONTACT_KINDS = ["line", "email", "phone", "ig", "linkedin", "wechat", "whatsapp", "facebook", "website"];
// 貼進來的字如果一看就是某個網站的連結，就照那個網站歸類，不管選單選的是哪一種（2026-11-26）。
// Paul 貼著一條掛在 LinkedIn 底下的 facebook.com 連結：「this is obviously facebook then change it to facebook, check all others」。
// 正式站掛在 LinkedIn 底下的 120 筆裡只有 4 筆是 LinkedIn（舊名單那一欄叫 LinkedIn，大家填的多半是臉書），
// 資料由 2027-01-18-contact-kinds.sql 搬過一次，這一支是讓之後新加的不會再掛錯。**規則跟那一支遷移檔同一份**（測試逐條對）。
// 不是連結的字（一個名字、一個帳號）看不出是哪裡的，照選單選的；email 與電話不改。純函式。
export const CONTACT_SITES = [
  ["facebook", /\b(facebook\.com|fb\.com|fb\.me)\b/i],
  ["ig", /\binstagram\.com\b/i],
  ["linkedin", /\blinkedin\.com\b/i],
  ["line", /\b(line\.me|lin\.ee)\b/i],
  ["whatsapp", /\b(wa\.me|whatsapp\.com)\b/i],
];
export function contactKindFor(kind, value) {
  const v = String(value || "").trim();
  if (!v || kind === "email" || kind === "phone") return kind;
  const hit = CONTACT_SITES.find(([, re]) => re.test(v));
  if (hit) return hit[0];
  // 別的網址：原本選的是某個平台（LinkedIn、Facebook、Instagram…）就改成「網站」；選的本來就是網站或 WeChat 這種沒有網址的照舊。
  return /^(https?:\/\/|www\.)/i.test(v) && ["linkedin", "facebook", "ig", "line", "whatsapp", "wechat"].includes(kind) ? "website" : kind;
}
// login：登入用的 email（rc_person 的 login_email，或 identities 上 verified 的那個），刪不掉，所以沒有刪除鈕。
export function contactsOf(ids, login) {
  const lg = String(login || "").toLowerCase();
  const out = (ids || []).filter(i => CONTACT_KINDS.includes(i.kind))
    .map(i => ({ id: i.id, kind: i.kind, value: i.value, source: i.source || "", login: i.kind === "email" && (!!i.verified || (!!lg && String(i.value).toLowerCase() === lg)) }));
  if (lg && !out.some(c => c.kind === "email" && String(c.value).toLowerCase() === lg)) out.push({ id: null, kind: "email", value: lg, source: "login", login: true });
  return out
    .sort((a, b) => CONTACT_KINDS.indexOf(a.kind) - CONTACT_KINDS.indexOf(b.kind) || String(a.value).localeCompare(String(b.value)));
}
// 點得到的就給連結；WeChat 沒有公開網址，只顯示字。
export function contactHref(kind, value) {
  const v = String(value || "").trim();
  if (!v) return "";
  const web = x => /^https?:\/\//i.test(x) ? x : /^[\w-]+(\.[\w-]+)+(\/|$)/.test(x) ? "https://" + x : "";
  const digits = v.replace(/[^\d+]/g, "");
  switch (kind) {
    case "email":    return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v) ? "mailto:" + v : "";
    case "phone":    return digits.replace(/\D/g, "").length >= 6 ? "tel:" + digits : "";
    case "whatsapp": return digits.replace(/\D/g, "").length >= 6 ? "https://wa.me/" + digits.replace(/\D/g, "") : web(v);
    case "line":     return /^[\w.@-]+$/.test(v) ? "https://line.me/ti/p/~" + encodeURIComponent(v) : web(v);
    case "ig":       return /^[\w.]+$/.test(v) ? "https://www.instagram.com/" + v + "/" : web(v);
    case "linkedin": return web(v) || (/^[\w-]+$/.test(v) ? "https://www.linkedin.com/in/" + v : "");
    case "facebook": return web(v) || (/^[\w.]+$/.test(v) ? "https://www.facebook.com/" + v : "");
    case "website":  return web(v);
    default:         return "";
  }
}
// ═══════════════════════════════════════════════════════════════════════
// 關係網（2027-01-03，Paul 2026-11-23：「turn BT's people database… into a relationship network」）。
// 資料庫那一半在 supabase/migrations/2027-01-03-people-network.sql，門在那裡每一支函式的第一句。
// 這一半：標籤怎麼叫、怎麼排，加上一個人的頁面上那幾塊（個人檔案、跟 BT 的關係、他的故事、同意、當講者的活動、個人連結）。
// 遷移檔還沒跑的資料庫回的東西沒有 labels、profile、link：每一支都把「沒有」當成「還沒有這個功能」，畫面照舊，只多一句說要跑哪一支。
// ═══════════════════════════════════════════════════════════════════════
// 標籤的順序跟資料庫的 rc_labels_of() 一樣：前八種從紀錄算（賺來的），後三種是 BT 給的。
export const LABELS = ["member", "intern", "student", "mentee", "mentor", "speaker", "volunteer", "organizer", "professor", "admission_officer", "connection"];
// BT 自己加得了的標籤。2027-01-06-labels-and-schools.sql 起十一種都可以（原本只有教授、招生官、聯絡人三種）。
export const GIVEN_LABELS = LABELS.slice();
// 「以前是」有自己名字的只有兩種：幹部 → 校友（前幹部）、學員 → 以前的學員。其他幾種現在與以前同一個名字，畫面上只是變淡。
const PAST_NAMED = ["member", "student"];
// 名錄與搜尋回的短版："speaker"、"student:past"（:past 是現在不是了）。
export function parseLabel(code) { const [label, tail] = String(code || "").split(":"); return { label, current: tail !== "past" }; }
export function labelName(label, current) {
  const k = "lab." + label + (current === false && PAST_NAMED.includes(label) ? ".past" : "");
  return STRINGS[k] ? T(k) : String(label || "");
}
// 名錄篩選用的鍵：名字不一樣的才分開（幹部與校友、學員與以前的學員），其他不分現在與以前。
export const LABEL_FILTERS = ["member", "member:past", "intern", "student", "student:past", "mentee", "mentor", "speaker", "volunteer", "organizer", "professor", "admission_officer", "connection"];
export function labelFilterKey(code) { const { label, current } = parseLabel(code); return !current && PAST_NAMED.includes(label) ? label + ":past" : label; }
// 這一列（名錄的、搜尋的、rc_person 回的）有沒有標籤那一格。沒有就是遷移檔還沒跑。
export const hasNetwork = x => !!x && Array.isArray(x.labels);
// 一個標籤。顏色沿用名錄原本那四種（who-mentor、who-mentee、who-intern、who-student），其他是一般的徽章；現在不是了的變淡。
export function labelTag(label, current) { return `<span class="tag who-${esc(label)}${current === false ? " past" : ""}">${esc(labelName(label, current))}</span>`; }
// 名錄一列上的那排標籤。認不得的代碼不印（資料庫比這一頁新的時候）。
export function labelChipsHTML(codes) {
  return (codes || []).map(parseLabel).filter(l => LABELS.includes(l.label)).map(l => labelTag(l.label, l.current)).join(" ");
}
// 一個標籤後面那行小字：哪一年起（BT 給的可以有到哪一年）、幾次（超過一次才寫）、補充說明。
export function labelFacts(l) {
  const out = [];
  if (l.since && l.until) out.push(T("lab.range", { from: l.since, to: l.until }));
  else if (l.since) out.push(T("lab.since", { y: l.since }));
  else if (l.until) out.push(T("lab.until", { y: l.until }));
  const n = Number(l.n) || 0;
  if (n > 1) out.push(T(l.label === "member" ? "lab.nTerms" : l.label === "mentor" || l.label === "mentee" ? "lab.nPairs" : "lab.nEvents", { n }));
  if (l.detail) out.push(String(l.detail));
  return out;
}
// 個人連結的網址（不用登入的那一頁）。
export const profileURL = token => `${typeof location === "undefined" ? "https://beyondtaiwannpo.com" : location.origin}/profile/?t=${encodeURIComponent(token || "")}`;
// 還在念高中的學員開不了個人連結（跟資料庫的 minor_no_link 同一條：kind 是 student，而且畢業年是空的或還沒到）。
// 這裡先擋是為了不讓人按了才知道；真正的門在資料庫。
export function linkBlocked(p, year) {
  const y = year || new Date().getFullYear();
  return !!p && p.kind === "student" && (!p.grad_year || Number(p.grad_year) >= y);
}
// 個人連結現在是哪一種：none（沒有）、expired（過期了）、live（還有效）。
export function linkState(link) { return !link ? "none" : link.expired ? "expired" : "live"; }
// 照片：Storage 網址 → bucket 裡的路徑（刪檔用）。不是 people bucket 的網址回空字串。
export function personStoragePath(url) {
  const m = /\/object\/public\/people\/([^?#]+)/.exec(String(url || ""));
  if (!m) return "";
  try { return decodeURIComponent(m[1]); } catch (x) { return ""; }
}
// 選檔先擋一次：bucket 只收這三種。
export const photoFileOk = f => !!f && /^image\/(jpeg|png|webp)$/.test(String(f.type || ""));
// 傳上去之前縮到最長邊 800（大頭照用不到更大）。
export const PHOTO_MAX = 800;
export function photoFit(w, h, max) {
  const m = max || PHOTO_MAX, big = Math.max(w, h);
  if (big <= m) return { w, h };
  const r = m / big;
  return { w: Math.max(1, Math.round(w * r)), h: Math.max(1, Math.round(h * r)) };
}
// 自動儲存收的鍵（rc_save_profile 的 p）。**兩個同意不在裡面**：同意只有本人給得了，這一頁只能取消（data.js 的 withdrawConsent 寫死送 false）。
// 他自己舉的手（願意演講、願意當 mentor、可以聯絡）也不在：那是他在個人連結上說的，這一頁只讀。
// 2026-11-25：「跟 BT 的關係」那一塊拿掉了（Paul：「the relationship part in a people, I think that's kind of useless」），所以 rel_* 那四格不再從這一頁送。
// 資料庫那四欄還在（rc_profiles.rel_*），已經填的沒有刪，只是這一頁不畫、不存。
export const PF_KEYS = ["city", "country", "job_title", "job_org", "field", "bio"];
export const STORY_KEYS = ["highschool", "turning", "hardest", "decision", "wish17", "first_step"];
// 自動儲存的一格 → rc_save_profile 的 { 鍵: 值 }。回 { patch } 或 null（這一格不歸這裡存）。
export function profileFieldPatch(name, value) {
  const v = typeof value === "string" ? value.trim() : value;
  if (!PF_KEYS.includes(name)) return null;
  return { patch: { [name]: v == null ? "" : v } };
}
// 「現在還在念高中」那一格：取代以前的三選一（成員、學員、來賓）。勾了送 kind student，沒勾送 guest；成員不在這裡加。
function hsCheckHTML(on, locked) {
  return `<label class="check"><input type="checkbox" name="hs" data-noauto="1"${on ? " checked" : ""}${locked ? " disabled" : ""}><span>${esc(T("pp.hs"))}<br><span class="mini">${esc(T("pp.hsHint"))}</span></span></label>`;
}
// 基本資料存的時候 kind 要送什麼：成員照舊是成員（這一頁不改），其他人看那一格勾了沒。
export function kindFromForm(oldKind, hs) { return oldKind === "member" ? "member" : hs ? "student" : "guest"; }
const brText = v => esc(String(v || "")).replace(/\r?\n/g, "<br>");
const photoHTML = (url, name) => url ? `<img class="rc-photo" src="${esc(url)}" alt="">` : `<span class="rc-photo" aria-hidden="true">${esc((Array.from(String(name || "").trim())[0] || "").toUpperCase())}</span>`;

// 標籤那一塊（2026-11-25 重做，Paul：「why is it not editable from people?… Each people should be able to be given label… there's got to be detail…
// we should be able to edit that if we click into individual people」）。
// 標籤有兩個來源，資料庫的 rc_labels_of() 已經合成一列（2027-01-06-labels-and-schools.sql）：
//   earned 從紀錄算出來的（出席、職位、配對、當講者）。拿不掉，要拿掉就去改那一筆紀錄；但可以替它寫補充說明與年份。
//   given  BT 自己加的。十一種都可以加，寫補充說明、哪一年起、到哪一年，可以改、可以拿掉。
// 每一行：標籤、那行小字（年份、幾次、補充說明）、來源。管的人底下有一格「加、改標籤」：已經加過的每一種一塊（存、拿掉），最下面一塊是加新的（先選哪一種）。
// 還沒跑那一支的資料庫，每一列沒有 given／earned 這兩個鍵，就照 source 判斷；加那三種以外的標籤資料庫會回 bad_label，那一句會講要跑哪一支。
const isGiven = l => (l.given != null ? !!l.given : l.source === "given");
const isEarned = l => (l.earned != null ? !!l.earned : l.source !== "given");
// 加一個標籤的時候問什麼（2026-11-26）：term 問哪一屆、哪一季、哪一個 team（存成一筆職位）；event 問哪一場活動（存成一筆參與紀錄）；
// pair 問哪一期 mentorship 與配對的對象（存成一組配對，沒填對象就存成那一期的參與紀錄）；note 是原本的三格（補充說明、哪一年起、到哪一年）。
// 教授、招生官、聯絡人、實習生沒有對應的紀錄，只有 note。
export const LABEL_HOW = { member: "term", student: "event", speaker: "event", volunteer: "event", organizer: "event", mentee: "pair", mentor: "pair" };
export const labelHow = k => LABEL_HOW[k] || "note";
export function personLabelsHTML(d, S, canEdit) {
  const labs = (d.labels || []).filter(l => LABELS.includes(l.label));
  const src = l => T(isEarned(l) ? (isGiven(l) ? "lab.srcBoth" : "lab.srcEarned") : "lab.srcGiven");
  const list = labs.length ? `<ul class="rc-labels">${labs.map(l => { const facts = labelFacts(l);
      return `<li${l.current ? "" : ` title="${esc(T("lab.notNow"))}"`}>${labelTag(l.label, !!l.current)}${facts.length ? ` <span class="mini">${facts.map(esc).join("・")}</span>` : ""} <span class="mini rc-labsrc">${esc(src(l))}</span></li>`; }).join("")}</ul>`
    : `<div class="mini">${esc(T("lab.none"))}</div>`;
  const given = Object.fromEntries((d.given || []).map(g => [g.label, g]));
  const fields = g => `<div class="two"><label class="wide"><i>${esc(T("lab.detail"))}</i><input name="detail" value="${esc(g ? g.detail || "" : "")}" maxlength="160" autocomplete="off"></label>
          <label><i>${esc(T("lab.sinceYear"))}</i><input name="since" type="number" min="1950" max="2100" value="${esc(g && g.since ? g.since : "")}"></label><label><i>${esc(T("lab.untilYear"))}</i><input name="until" type="number" min="1950" max="2100" value="${esc(g && g.until ? g.until : "")}"></label></div>`;
  const one = k => { const g = given[k];
    // 舊資料庫留下來的那一句、而同一種現在有真的紀錄了：上面那一行已經照紀錄印，講一聲這一句可以拿掉（2026-11-26）。
    const stale = /^Old database:/.test(String(g.detail || "")) && labs.some(l => l.label === k && isEarned(l));
    return `<div class="rc-glabel" data-glabel="${k}"><div class="fhead"><b>${esc(T("lab." + k))}</b></div>
        ${stale ? `<div class="mini">${esc(T("lab.staleNote"))}</div>` : ""}${fields(g)}
        <div class="form-foot"><button class="btn sm" data-act="label-save" data-label="${k}"${S.busy ? " disabled" : ""}>${esc(T("lab.save"))}</button><button class="btn quiet sm" data-act="label-del" data-label="${k}"${S.busy ? " disabled" : ""}>${esc(T("lab.remove"))}</button></div></div>`; };
  // 加一個標籤（2026-11-26 重做）：選了哪一種，就問那一種真正的紀錄，存進去的是那一筆紀錄，標籤自己從紀錄算出來。
  // Paul：「adding a label should interact with our stuff for example if I add a member label it should asked me what terms and what teams,
  // student, what events she attends, mentee what year what pairs」。問什麼看 labelHow()；紀錄裡沒有那一場或那一屆的時候，勾「只記一句」退回原本的三格。
  const nw = (S && S.labNew) || {}, kind = GIVEN_LABELS.includes(nw.label) ? nw.label : GIVEN_LABELS[0], dis = S.busy ? " disabled" : "";
  const pt = S && S.personTerms, canTerm = !!(pt && pt.can_edit && (pt.terms || []).length);
  const evs = ((S.boot && S.boot.events) || []).slice().sort((a, b) => String(b.starts_at || "").localeCompare(String(a.starts_at || "")));
  const how = labelHow(kind), has = !!given[kind];
  // 做不到的情況：幹部要 Co-President 或 Senior Adviser 才加得了職位；一場活動都沒有就沒得選。
  const cant = (how === "term" && !canTerm) || ((how === "event" || how === "pair") && !evs.length);
  const pairEvs = evs.filter(e => e.kind === "mentorship-term");
  const noteBody = `${fields(null)}
        <div class="form-foot"><button class="btn sm" data-act="label-save" data-label=""${dis}>${esc(T("lab.add"))}</button><span class="mini">${esc(T("lab.addHint"))}</span></div>`;
  const recordBody = how === "term" && canTerm ? `<div class="two"><label><i>${esc(T("pt.term"))}</i>${sel("term", pt.terms.map(t => [t.id, t.id + (t.status === "current" ? T("pt.current") : "")]), (pt.terms.find(t => t.status !== "current") || pt.terms[0]).id)}</label><label><i>${esc(T("pt.season"))}</i>${sel("season", SEASONS.map(x => [x, seasonName(x)]), "")}</label></div>
        <div class="two"><label><i>${esc(T("pt.team"))}</i><input name="team" list="rc-lab-teams" maxlength="60" autocomplete="off"><datalist id="rc-lab-teams">${(pt.teams || []).map(t => `<option value="${esc(t)}"></option>`).join("")}</datalist></label><label><i>${esc(T("pt.title"))}</i><input name="title" maxlength="60" placeholder="Member" autocomplete="off"></label></div>
        <div class="form-foot"><button class="btn sm" data-act="label-record"${dis}>${esc(T("lab.addTerm"))}</button><span class="mini">${esc(T("lab.howTerm"))}</span></div>`
    : how === "event" ? `<div class="two"><label><i>${esc(T("lab.whichEvent"))}</i>${sel("event_id", eventOpts(evs), "", false, T("person.pickEvent"))}</label><label><i>${esc(T("part.status"))}</i>${sel("status", PSTATUS.map(st => [st, T("pstatus." + st)]), "attended")}</label></div>
        <div class="form-foot"><button class="btn sm" data-act="label-record"${dis}>${esc(T("lab.addEvent", { label: T("lab." + kind) }))}</button><span class="mini">${esc(T("lab.howEvent"))}</span></div>`
    : how === "pair" ? `<div class="two"><label><i>${esc(T("lab.whichTerm"))}</i>${sel("event_id", eventOpts(pairEvs.length ? pairEvs : evs), "", false, T("person.pickEvent"))}</label><label><i>${esc(T(kind === "mentor" ? "lab.pairMentee" : "lab.pairMentor"))}</i><input name="other_who" class="rc-who" list="rc-lab-dir" autocomplete="off" placeholder="${esc(T("part.whoPh"))}" data-noauto="1"><datalist id="rc-lab-dir">${(Array.isArray(S.dir) ? S.dir : []).filter(x => x.id !== (d.person || {}).id).map(x => `<option value="${esc(dirLabel(x))}"></option>`).join("")}</datalist></label></div>
        <div class="form-foot"><button class="btn sm" data-act="label-record"${dis}>${esc(T("lab.addPair", { label: T("lab." + kind) }))}</button><span class="mini">${esc(T("lab.howPair"))}</span></div>`
    : "";
  // 哪一塊要畫：
  //   note 那幾種（教授、招生官、聯絡人、實習生）：三格。已經給過的在上面改，這裡講一句。
  //   做不到（cant）：講為什麼；還沒給過就退回三格。
  //   這一種 BT 已經給過了：這裡只補紀錄（那一句在上面改，不會有第二個）。
  //   其他：預設問紀錄，勾了「只記一句」才是三格。
  const tick = `<label class="check"><input type="checkbox" name="note_only" data-labnote data-noauto="1"${nw.noteOnly ? " checked" : ""}><span>${esc(T("lab.noteOnly"))}</span></label>`;
  const above = `<div class="mini">${esc(T("lab.editAbove"))}</div>`;
  const inner = how === "note" ? (has ? above : noteBody)
    : cant ? `<div class="mini">${esc(T(how === "term" ? "lab.cantTerm" : "lab.cantEvent"))}</div>${has ? above : noteBody}`
    : has ? recordBody
    : (nw.noteOnly ? noteBody : recordBody) + tick;
  const add = `<div class="rc-glabel" data-glabel="new"><div class="fhead"><b>${esc(T("lab.addNew"))}</b></div>
        <label><i>${esc(T("lab.which"))}</i><select name="label" data-labnew${dis}>${GIVEN_LABELS.map(k => `<option value="${k}"${k === kind ? " selected" : ""}>${esc(T("lab." + k))}</option>`).join("")}</select></label>
        ${inner}</div>`;
  const editor = canEdit ? `${foldStart("glabels", "data-glabels", T("lab.given"), S)}<div class="mini">${esc(T("lab.givenHint"))}</div>${GIVEN_LABELS.filter(k => given[k]).map(one).join("")}${add}</div></details>` : "";
  return sectionHTML(T("lab.title"), `${list}<div class="mini rc-labhelp">${esc(T("lab.help"))}</div>${editor}`, { id: "rc-labels" });
}
// ── 在哪幾屆做過事（2026-11-26）──
// Paul：「if Andrea works in 2025 6, spring, I should be able to in her page add them into that term… they should appear on that term,
// and that terms should be connected to the front of the page where in things that says 2025 to 2026 alumni」。
// 這一塊讀寫的是 positions（人 × 屆 × team），跟「人與權限 → 屆別」、這一屆的團隊頁、對外「前幾屆的名單」是同一份，沒有第二張表。
// 有紀錄的人就有幹部或校友的標籤（rc_labels_of 從這裡算）。S.personTerms 是 person_terms() 回的那一包：
//   null 是那一支遷移檔還沒跑（或讀不到），這時候只印 rc_person 給的那幾行，沒有按鈕。
// 以前半年一期：屆別照舊一年一屆，另外記是哪一季（Paul 選的）。加、改、拿掉的門在資料庫（Co-President 與 Senior Adviser），can_edit 只決定畫不畫按鈕。
export const SEASONS = ["", "fall", "spring", "summer"];
export const seasonName = s => T("pt.season." + (SEASONS.includes(s) && s ? s : "year"));
export const posTitle = x => (lang() === "zh" ? x.title_zh : x.title_en) || x.title_en || x.title_zh || "";
// 加進某一屆那一格送出去的字 → set_position 要的兩個標題。空著就是「幹部／Member」；自己打的字兩邊放同一個。純函式。
export function termTitles(typed) {
  const t = String(typed || "").trim().slice(0, 60);
  return !t || /^member$/i.test(t) ? { zh: "幹部", en: "Member" } : { zh: t, en: t };
}
export function personTermsHTML(d, S) {
  const pt = S && S.personTerms ? S.personTerms : null, p = (d && d.person) || {};
  const pos = pt ? (pt.positions || []) : ((d && d.positions) || []);
  const can = !!(pt && pt.can_edit) && !p.forgotten_at, dis = S && S.busy ? " disabled" : "";
  if (!pos.length && !pt) return "";
  const row = x => `<li><div class="fhead"><b>${esc(x.term)}</b>${x.season ? ` <span class="tag draft">${esc(seasonName(x.season))}</span>` : ""}</div>
      <div class="fmeta">${esc(posTitle(x))}${x.team ? "・" + esc(x.team) : ""}</div>${can ? `
      <div class="form-foot"><label class="mini rc-ptseason">${esc(T("pt.season"))} <select data-ptseason data-term="${esc(x.term)}" data-team="${esc(x.team || "")}"${dis}>${SEASONS.map(s => `<option value="${s}"${(x.season || "") === s ? " selected" : ""}>${esc(seasonName(s))}</option>`).join("")}</select></label>
        <button class="btn quiet sm" data-act="pterm-del" data-term="${esc(x.term)}" data-team="${esc(x.team || "")}"${dis}>${esc(T("pt.remove"))}</button></div>` : ""}</li>`;
  const list = pos.length ? `<ul class="flist">${pos.map(row).join("")}</ul>` : `<div class="mini">${esc(T("pt.none"))}</div>`;
  const terms = (pt && pt.terms) || [], firstEnded = (terms.find(t => t.status !== "current") || terms[0] || {}).id || "";
  const add = can && terms.length ? `${foldStart("ptadd", "data-ptadd", T("pt.add"), S)}
      <div class="two"><label><i>${esc(T("pt.term"))}</i>${sel("term", terms.map(t => [t.id, t.id + (t.status === "current" ? T("pt.current") : "")]), firstEnded)}</label><label><i>${esc(T("pt.season"))}</i>${sel("season", SEASONS.map(s => [s, seasonName(s)]), "")}</label></div>
      <div class="two"><label><i>${esc(T("pt.team"))}</i><input name="team" list="rc-pt-teams" maxlength="60" autocomplete="off"><datalist id="rc-pt-teams">${((pt && pt.teams) || []).map(t => `<option value="${esc(t)}"></option>`).join("")}</datalist></label><label><i>${esc(T("pt.title"))}</i><input name="title" maxlength="60" placeholder="Member" autocomplete="off"></label></div>
      <div class="form-foot"><button class="btn sm" data-act="pterm-add"${dis}>${esc(T("pt.addBtn"))}</button><span class="mini">${esc(T("pt.addHint"))}</span></div></div></details>` : "";
  // 還勾著「現在還在念高中」的人：屆別的名單與對外的名單只列成員，他不會出現，講一聲（那一格不會自己取消）。
  const hs = pt && pos.length && p.kind === "student" ? `<div class="note">${esc(T("pt.stillHs"))}</div>` : "";
  const help = pt ? `${hs}<div class="mini rc-labhelp">${esc(T("pt.help"))}${can ? "" : " " + esc(T("pt.onlySenior"))}</div>` : "";
  return sectionHTML(T("person.positions"), list + help + add, { id: "rc-terms" });
}
// ── 現在在哪：學校與去向排成一條，最新的在最上面（2026-11-25）──
// Paul：「she used to be a student, but now she is in University of Washington… AIA… is her current school, which is not right… always put university or job
// in a chronologically order. And put the latest as their current status」。
// 以前「現在的學校」是名單上那一格（people.school，多半是高中），去向（就讀哪一所大學、在哪裡工作）另外列，所以念了大學的人「現在」還是高中。
// 現在把兩邊排成一條，第一列就是「現在」。純函式，不動資料：
//   去向只收「就讀、轉學、畢業、工作」而且有寫學校或公司的（申請、錄取不算，那還沒去）。同一個名字學校那邊也有一列的，只留去向那一列。
//   順序：去向在前（有年份的新到舊，沒年份的接在後面），學校在後（有年份的新到舊，名單上那一所排前面，沒年份的最後）。
//   例外：去向每一筆都有年份，而某一所學校的年份比它們都晚，那一所排最前面（例如工作之後又回去念書，只記在學校那一邊）。
export const PLACE_OKINDS = ["enrolled", "transferred", "graduated", "working"];
export function placesOf(d) {
  const key = v => String(v || "").trim().toLowerCase();
  const outs = ((d && d.outcomes) || []).filter(o => PLACE_OKINDS.includes(o.kind) && key(o.institution))
    .map(o => ({ from: "outcome", id: o.id, name: String(o.institution).trim(), year: Number(o.year) || null, kind: o.kind, extra: [o.title, o.major].filter(Boolean).join("・") }));
  const seen = new Set(outs.map(o => key(o.name)));
  const schs = ((d && d.schools) || []).filter(x => key(x.school) && !seen.has(key(x.school)))
    .map(x => ({ from: "school", id: x.id, name: String(x.school).trim(), year: Number(x.year_to) || Number(x.year_from) || null, year_from: x.year_from || null, year_to: x.year_to || null, note: x.note || "", source: x.source || "admin", listed: !!x.current }));
  const byYear = (a, b) => (b.year || 0) - (a.year || 0) || (a.year ? 0 : (b.listed ? 1 : 0) - (a.listed ? 1 : 0));
  outs.sort((a, b) => (a.year ? 0 : 1) - (b.year ? 0 : 1) || (b.year || 0) - (a.year || 0));
  schs.sort((a, b) => (a.year ? 0 : 1) - (b.year ? 0 : 1) || byYear(a, b) || (b.listed ? 1 : 0) - (a.listed ? 1 : 0));
  const top = outs.length && outs.every(o => o.year) ? Math.max(...outs.map(o => o.year)) : null;
  const later = top == null ? [] : schs.filter(x => x.year && x.year > top);
  return [...later, ...outs, ...schs.filter(x => !later.includes(x))];
}
// 個人檔案：照片、現在在哪、現在的工作、專長領域、一段介紹。管的人改了就存（一格一格送，rc_save_profile 只改有給的鍵）；看的人只讀。
// 2026-11-25 Paul：「her profile is like at the very last. Can we have her profile on the left and then obviously her detail and then her current job,
// organization, city, country, and then her short bio」。所以這一塊排在這個分頁的最上面：左邊照片，右邊先是基本資料（名字、學校、畢業年、備註，
// details 是 personHTML 給的那一段，有自己的「儲存」），接著才是現在的工作、城市、領域、介紹（改了就存）。
export function personProfileHTML(d, S, canEdit, details) {
  const p = d.person || {}, pf = d.profile || {};
  const done = pf.done_at ? `<span class="mini">${esc(T("pf.selfDone", { day: fmtDay(pf.done_at) }))}</span>` : "";
  if (!canEdit) {
    const lines = [[pf.job_title, pf.job_org].filter(Boolean).join("・"), pf.field, [pf.city, pf.country].filter(Boolean).join(", ")].filter(Boolean);
    const any = pf.photo_url || lines.length || pf.bio;
    return sectionHTML(T("pf.title"), any ? `<div class="rc-pf">${photoHTML(pf.photo_url, p.name)}<div class="rc-pf-f">${lines.map(l => `<div>${esc(l)}</div>`).join("")}${pf.bio ? `<p class="rc-a">${brText(pf.bio)}</p>` : ""}${done}</div></div>` : `<div class="mini">${esc(T("pf.empty"))}</div>`, { id: "rc-profile" });
  }
  const inp = (name, key, max) => `<label><i>${esc(T(key))}</i><input name="${name}" value="${esc(pf[name] || "")}" maxlength="${max}" autocomplete="off"></label>`;
  return sectionHTML(T("pf.title"), `<div class="rc-pf">
      <div class="rc-pf-photo">${photoHTML(pf.photo_url, p.name)}
        <label class="hi-upload"><i>${esc(T(pf.photo_url ? "pf.photoChange" : "pf.photoPick"))}</i><input type="file" accept="image/jpeg,image/png,image/webp" data-act="pf-photo" data-noauto="1"${S.busy ? " disabled" : ""}></label>
        <div class="mini" data-pf-up>${esc(T("pf.photoHint"))}</div>
        ${pf.photo_url ? `<button class="btn quiet sm" data-act="pf-photo-clear"${S.busy ? " disabled" : ""}>${esc(T("pf.photoClear"))}</button>` : ""}
      </div>
      <div class="rc-pf-main">${details ? `<h3 class="rc-pf-h">${esc(T("person.edit"))}</h3>${details}<h3 class="rc-pf-h">${esc(T("pf.work"))}</h3>` : ""}
      <div class="rc-pf-f" data-autosave="pf-save" data-part="profile">
        <div class="two">${inp("job_title", "pf.jobTitle", 120)}${inp("job_org", "pf.jobOrg", 120)}</div>
        <div class="two">${inp("city", "pf.city", 80)}${inp("country", "pf.country", 80)}</div>
        ${inp("field", "pf.field", 120)}
        <label><i>${esc(T("pf.bio"))}</i><textarea name="bio" rows="4" maxlength="600">${esc(pf.bio || "")}</textarea></label>
        <div class="form-foot">${autosaveHint("pf-save")}${done}</div>
      </div></div></div>`, { id: "rc-profile" });
}
// 他的故事一列一列：{ label（當時問的那一句）, answer, set（哪一套，內建六題是空的）}。
// 2027-01-26 起一個人可能答過好幾套（BT 換給他另一套，之前寫的還在）：story_q 記著每一個鍵當時的題目。
// 內建的六題：他寫過其中一題、或他從來沒答過任何一套的時候才列（沒寫的那幾題照舊印「這一題沒寫」）；
// 一套題目的：只列寫了的（沒寫的那幾題資料庫沒記），照套、照題號排。兩邊都對不到的鍵（不該有）就印鍵本身。
export function storyRows(pf) {
  const st = (pf && pf.story) || {}, q = (pf && pf.story_q) || {}, has = k => String(st[k] == null ? "" : st[k]).trim() !== "";
  const own = STORY_KEYS.filter(k => !q[k]);
  const showBuiltin = own.some(has) || !Object.keys(q).length;
  const out = showBuiltin ? own.map(k => ({ key: k, label: T("story.q." + k), answer: has(k) ? String(st[k]) : "", set: "" })) : [];
  const fromSets = Object.keys(q).filter(has).sort((a, b) => String(q[a].set || "").localeCompare(String(q[b].set || "")) || (Number(q[a].ord) || 0) - (Number(q[b].ord) || 0))
    .map(k => ({ key: k, label: String(q[k].label || k), answer: String(st[k]), set: String(q[k].set || "") }));
  const stray = Object.keys(st).filter(k => has(k) && !q[k] && !STORY_KEYS.includes(k)).map(k => ({ key: k, label: k, answer: String(st[k]), set: "" }));
  return out.concat(fromSets, stray);
}
// 他的故事：題目在上、他寫的在下。只讀：那是他自己的話，資料庫也沒有給管的人改的路。
export function personStoryHTML(d) {
  const pf = d.profile || {};
  const rows = storyRows(pf);
  const any = rows.some(r => r.answer);
  const body = !any ? `<div class="mini">${esc(T("story.empty"))}</div>`
    : `<div class="note">${esc(T(pf.share_story ? "story.shareYes" : "story.shareNo"))}</div>
      ${rows.map(r => `<div class="rc-story"><div class="rc-q">${esc(r.label)}${r.set ? ` <span class="mini">${esc(r.set)}</span>` : ""}</div>${r.answer ? `<p class="rc-a">${brText(r.answer)}</p>` : `<p class="rc-a mini">${esc(T("story.blank"))}</p>`}</div>`).join("")}
      <div class="mini">${esc(T("story.own"))}</div>`;
  return sectionHTML(T("story.title"), body, { id: "rc-story" });
}
// 他願意做的事與同意：五格都只讀（他自己在個人連結上勾的）。兩個同意勾著的時候，管的人各有一顆「替他取消」；沒有任何一格能在這裡勾起來。
export function personConsentHTML(d, S, canEdit) {
  const pf = d.profile || {};
  const tick = on => `<span class="tag ${on ? "ok" : "draft"}">${esc(T(on ? "cons.yes" : "cons.no"))}</span>`;
  const row = (key, label, withdraw) => `<li>${tick(!!pf[key])} ${esc(T(label))}${withdraw && canEdit && pf[key] ? ` <button class="btn quiet sm" data-act="pf-withdraw" data-k="${key}"${S.busy ? " disabled" : ""}>${esc(T("cons.withdraw"))}</button>` : ""}</li>`;
  return sectionHTML(T("cons.title"), `<ul class="flist rc-ticks">${row("offer_speak", "cons.speak")}${row("offer_mentor", "cons.mentor")}${row("contact_ok", "cons.contact")}${row("share_profile", "cons.profile", true)}${row("share_story", "cons.story", true)}</ul>
      ${pf.consent_at ? `<div class="mini">${esc(T("cons.at", { day: fmtDay(pf.consent_at) }))}</div>` : ""}<div class="mini">${esc(T("cons.selfOnly"))}</div>`, { id: "rc-consent" });
}
// 當講者的活動：活動頁的講者連到他的那幾場，點過去是那一場的編輯頁（/admin/#events/<代號>）。沒有就整塊不畫。
export function personSpeakingHTML(d) {
  const sp = d.speaking || [];
  if (!sp.length) return "";
  return sectionHTML(T("spk.title", { n: sp.length }), `<ul class="flist">${sp.map(x => `<li><div class="fhead">${x.slug ? `<a href="${esc(withLang("/admin/#events/" + encodeURIComponent(x.slug)))}"><b>${esc(x.event || x.slug)}</b></a>` : `<b>${esc(x.event || "")}</b>`} <span class="tag ${x.consent ? "ok" : "draft"}">${esc(T(x.consent ? "spk.consentYes" : "spk.consentNo"))}</span></div>
      <div class="fmeta">${[fmtDay(x.starts_at), x.subject].filter(Boolean).map(esc).join("・")}</div></li>`).join("")}</ul>`, { id: "rc-speaking" });
}
// 個人連結：一行狀態（沒有、哪天開的哪天過期、打開過沒、送出過沒、過期了），管的人有開、複製、QR、開新的、撤銷。
// QR code 那一格：svg 是 qr.js 的 qrSVG() 給的（空字串是連結太長畫不成）。白底留著，深色背景上才掃得到。
export function qrBoxHTML(svg) {
  return svg ? `<div class="rc-qrbox">${svg}</div><div class="mini">${esc(T("link.qrHint"))}</div>` : `<div class="mini">${esc(T("link.qrTooLong"))}</div>`;
}
// token 只有管的人拿得到（rc_person 只給他們）；看的人只看得到狀態。#rc-qr 是 QR code 的框（main.js 的 link-qr 按了才畫）。
export function personLinkHTML(d, S, canEdit) {
  const p = d.person || {}, link = d.link || null, state = linkState(link);
  const status = state === "none" ? `<div class="mini">${esc(T("link.none"))}</div>`
    : `<div class="rc-linkstate"><span class="tag ${state === "live" ? "open" : "closed"}">${esc(T(state === "live" ? "link.live" : "link.dead"))}</span> ${esc(T(state === "live" ? "link.made" : "link.expired", { day: fmtDay(link.created_at), exp: fmtDay(link.expires_at) }))}
        <span class="mini">${esc(T(link.opened_at ? "link.opened" : "link.notOpened", { day: fmtDay(link.opened_at) }))} ${esc(T(link.submitted_at ? "link.submitted" : "link.notSubmitted", { day: fmtDay(link.submitted_at) }))}</span>
        <div class="mini">${esc(T("link.usesSet", { set: link.form_id ? (link.form_title || T("link.setGone")) : T("link.setBuiltin") }))}</div></div>`;
  let tools = "";
  if (canEdit) {
    const dis = S.busy ? " disabled" : "";
    // 2027-01-26：故事那一步用哪一套題目。開新的時候挑（預設照他的標籤自己挑）；現在那一條也可以直接換，連結不變。
    const sets = ((S.boot && S.boot.forms) || []).filter(f => f.kind === "profile" && f.status === "open");
    const cur = state === "live" ? (link.form_id || "builtin") : "";
    const opts = [["", T("link.setAuto")], ["builtin", T("link.setBuiltin")]].concat(sets.map(f => [f.id, f.title]));
    if (cur && !opts.some(o => o[0] === cur)) opts.push([cur, link.form_title || T("link.setGone")]);
    const setSel = `<label><i>${esc(T("link.set"))}</i><select id="rc-linkset" data-noauto="1"${dis}>${opts.map(([v, l]) => `<option value="${esc(v)}"${v === cur ? " selected" : ""}>${esc(l)}</option>`).join("")}</select></label>
      <div class="mini">${esc(T(sets.length ? "link.setHint" : "link.setNone"))}</div>`;
    if (state !== "live" && linkBlocked(p)) tools = `<div class="note">${esc(T("link.minor"))}</div>`;
    else if (state !== "live") tools = `${setSel}<div class="form-foot"><button class="btn sm" data-act="link-create"${dis}>${esc(T(state === "none" ? "link.create" : "link.renew"))}</button></div>`;
    else {
      const url = link.token ? profileURL(link.token) : "";
      tools = `${url ? `<label><i>${esc(T("link.url"))}</i><input id="rc-plink" readonly value="${esc(url)}" data-noauto="1"></label>` : ""}
        <div class="form-foot">${url ? `<button class="btn sm" data-act="link-copy">${esc(T("link.copy"))}</button><button class="btn ghost sm" data-act="link-qr">${esc(T("link.qr"))}</button>` : ""}<button class="btn ghost sm" data-act="link-create"${dis}>${esc(T("link.renew"))}</button><button class="btn quiet sm" data-act="link-revoke"${dis}>${esc(T("link.revoke"))}</button></div>
        ${setSel}<div class="form-foot"><button class="btn ghost sm" data-act="link-set"${dis}>${esc(T("link.setApply"))}</button></div>
        ${url ? `<div id="rc-qr" data-link="${esc(url)}"></div>` : ""}`;
    }
  } else if (state === "live") tools = `<div class="mini">${esc(T("link.managerOnly"))}</div>`;
  return sectionHTML(T("link.title"), `<div class="mini">${esc(T("link.hint"))}</div>${status}${tools}`, { id: "rc-link-sec" });
}
// 一個人的時間軸。
export function personHTML(d, S) {
  const p = d.person || {}, manage = !!(S.boot && S.boot.can_manage), pres = !!(S.me && S.me.pres);
  // 關係網（2027-01-03）：rc_person 回了 labels 與 profile 才畫標籤與那幾塊；沒有（遷移檔還沒跑）就照舊，多一句說要跑哪一支。
  const net = hasNetwork(d) && !!d.profile, canEdit = manage && !p.forgotten_at;
  const places = placesOf(d), nowAt = places.length ? places[0].name : (p.school || "");
  const head = pageHead(`${esc(p.name || T("common.noName"))} ${net ? labelChipsHTML(d.labels.map(l => l.label + (l.current ? "" : ":past"))) : rowTags({ kind: p.kind, role: p.role, roles: [...new Set((d.participation || []).map(x => x.role).concat((d.pairs || []).map(x => x.as)))] })}${p.forgotten_at ? ` <span class="tag closed">${esc(T("person.forgotten"))}</span>` : ""}`,
    // 有的才印、用「・」接起來（以前學校是空的時候中文名後面會掛一個落單的「・」）。
    // 2026-11-25：名字底下那一行印「現在在哪」（placesOf 的第一列），不是名單上那一格學校；還在那一所學校的才接著印畢業年。
    [p.name_zh && p.name_en ? esc(p.name_zh) : "", esc(nowAt || ""), p.grad_year && (!places.length || (places[0].from === "school" && places[0].name === (p.school || ""))) ? esc(String(p.grad_year)) : "",
     p.has_account ? esc(T("pp.hasAccount")) + (p.role ? ` (${esc(p.role)})` : "") : ""].filter(Boolean).join("・"), [], { act: "back-people", label: T("person.back") });
  const editInner = manage && !p.forgotten_at ? `<div data-pedit><div class="two"><label><i>${esc(T("person.nameZh"))}</i><input name="name_zh" value="${esc(p.name_zh || "")}" maxlength="60"></label><label><i>${esc(T("person.nameEn"))}</i><input name="name_en" value="${esc(p.name_en || "")}" maxlength="60"></label></div>
      <div class="two"><label><i>${esc(T("person.school"))}</i><input name="school" value="${esc(p.school || "")}" maxlength="80"></label><label><i>${esc(T("person.gradYear"))}</i><input name="grad_year" type="number" min="2000" max="2100" value="${esc(p.grad_year || "")}"></label></div>
      <label><i>${esc(T("person.note"))}</i><input name="note" value="${esc(p.note || "")}" maxlength="500"></label>
      ${p.kind === "member" ? "" : hsCheckHTML(p.kind === "student", !!p.has_account)}
      <div class="form-foot"><button class="btn sm" data-act="person-save"${S.busy ? " disabled" : ""}>${esc(T("common.save"))}</button></div></div>` : "";
  // 個人檔案那一塊畫得出來的時候（有關係網的資料、人還在），基本資料放進它的右邊；畫不出來就照舊自己一塊。
  const inProfile = hasNetwork(d) && !!d.profile && !p.forgotten_at && canEdit;
  const edit = editInner && !inProfile ? sectionHTML(T("person.edit"), editInner) : "";
  // 聯絡方式（2026-12-12）：email、LINE、LinkedIn 這些一種一列，原本塞在備註裡。只有管紀錄的人看得到（rc_person 只給他們 identities）。
  const cts = contactsOf(d.identities, p.login_email);
  const ctList = cts.length ? `<ul class="flist rc-contacts">${cts.map(c => { const href = contactHref(c.kind, c.value);
      return `<li><div class="fhead"><span class="ckind">${esc(T("ckind." + c.kind))}</span> ${href ? `<a href="${esc(href)}" target="_blank" rel="noopener">${esc(c.value)}</a>` : `<b>${esc(c.value)}</b>`}${c.login ? ` <span class="tag ok">${esc(T("contact.login"))}</span>` : ""}${c.source === "note" ? ` <span class="mini">${esc(T("contact.fromNote"))}</span>` : ""}${!p.forgotten_at && !c.login ? ` <button class="btn quiet sm" data-act="contact-del" data-id="${esc(c.id)}"${S.busy ? " disabled" : ""}>${esc(T("common.delete"))}</button>` : ""}</div></li>`; }).join("")}</ul>` : `<div class="mini">${esc(T("person.noContacts"))}</div>`;
  const ctAdd = !p.forgotten_at ? `${foldStart("cadd", "data-cadd", T("contact.add"), S)}
      <div class="two"><label><i>${esc(T("contact.kind"))}</i>${sel("kind", CONTACT_KINDS.map(k => [k, T("ckind." + k)]), "line")}</label><label><i>${esc(T("contact.value"))}</i><input name="value" maxlength="200"></label></div>
      <div class="form-foot"><button class="btn sm" data-act="contact-add"${S.busy ? " disabled" : ""}>${esc(T("contact.addBtn"))}</button><span class="mini">${esc(T("contact.addHint"))}</span></div></div></details>` : "";
  const ctHTML = manage ? sectionHTML(T("person.contacts", { n: cts.length }), ctList + ctAdd) : "";
  // 學校與去向排成一條（2026-11-25，見 placesOf）：最新的在最上面、標「現在」。學校那幾列管的人可以刪；去向那幾列在「參與紀錄」分頁的去向那一塊改。
  // 以前每一所學校有一顆「設成現在的」，拿掉了：現在是哪一所照年份排，不用人指定。
  const sch = (d.schools || []).slice();
  const yrs = x => x.year_from && x.year_to ? T("school.years", { from: x.year_from, to: x.year_to }) : x.year_from ? T("school.from", { from: x.year_from }) : x.year_to ? T("school.to", { to: x.year_to }) : "";
  const placeRow = (x, i) => `<li><div class="fhead"><b>${esc(x.name)}</b>${i === 0 ? ` <span class="tag open">${esc(T("school.current"))}</span>` : ""}${x.from === "outcome" ? ` <span class="tag">${esc(T("okind." + x.kind))}</span>${x.year ? ` <span class="mini">${esc(String(x.year))}</span>` : ""}` : (yrs(x) ? ` <span class="mini">${esc(yrs(x))}</span>` : "")}</div><div class="fmeta">${x.from === "outcome"
      ? [x.extra, T("place.fromOutcome")].filter(Boolean).map(esc).join("・") + (manage && !p.forgotten_at ? ` <button class="btn quiet sm" data-act="out-del" data-id="${esc(x.id)}"${S.busy ? " disabled" : ""}>${esc(T("common.delete"))}</button>` : "")
      : [x.note, T("ssrc." + x.source)].filter(Boolean).map(esc).join("・") + (manage && !p.forgotten_at ? ` <button class="btn quiet sm" data-act="school-del" data-id="${esc(x.id)}"${S.busy ? " disabled" : ""}>${esc(T("common.delete"))}</button>` : "")}</div></li>`;
  const schList = places.length ? `<ul class="flist rc-places">${places.map(placeRow).join("")}</ul>` : `<div class="mini">${esc(T("person.noSchools"))}</div>`;
  const schAdd = manage && !p.forgotten_at ? `${foldStart("sadd", "data-sadd", T("school.add"), S)}
      <div class="two"><label><i>${esc(T("school.name"))}</i><input name="school" maxlength="80"></label><label><i>${esc(T("school.note"))}</i><input name="note" maxlength="200"></label></div>
      <div class="two"><label><i>${esc(T("school.yearFrom"))}</i><input name="year_from" type="number" min="2000" max="2100"></label><label><i>${esc(T("school.yearTo"))}</i><input name="year_to" type="number" min="2000" max="2100"></label></div>
      <label class="check"><input type="checkbox" name="make_current" data-noauto="1"${sch.length ? "" : " checked"}><span>${esc(T("school.makeCurrent"))}</span></label>
      <div class="form-foot"><button class="btn sm" data-act="school-add"${S.busy ? " disabled" : ""}>${esc(T("school.addBtn"))}</button><span class="mini">${esc(T("school.addHint"))}</span></div></div></details>` : "";
  const schHTML = sectionHTML(T("person.schools", { n: places.length }), schList + schAdd);
  const aliasHTML = (d.aliases || []).length ? `<div class="mini rc-alias">${esc(T("person.aliases"))}${esc(T("punct.colon"))}${d.aliases.map(esc).join(esc(T("punct.list")))}</div>` : "";
  const posHTML = personTermsHTML(d, S);
  const parts = d.participation || [];
  const evs = ((S.boot && S.boot.events) || []).slice().sort((a, b) => String(b.starts_at || "").localeCompare(String(a.starts_at || "")));
  const addEv = manage && !p.forgotten_at && evs.length ? `${foldStart("paddev", "data-paddev", T("person.addEvent"), S)}
      <label><i>${esc(T("ov.event"))}</i>${sel("event_id", eventOpts(evs), "", false, T("person.pickEvent"))}</label>
      <div class="two"><label><i>${esc(T("part.role"))}</i>${sel("role", PROLES.map(r => [r, T("prole." + r)]), p.kind === "member" ? "speaker" : "student")}</label><label><i>${esc(T("part.status"))}</i>${sel("status", PSTATUS.map(st => [st, T("pstatus." + st)]), "attended")}</label></div>
      <div class="form-foot"><button class="btn sm" data-act="person-add-event"${S.busy ? " disabled" : ""}>${esc(T("person.addEventBtn"))}</button><span class="mini">${esc(T("person.addEventHint"))}</span></div></div></details>` : "";
  const partHTML = sectionHTML(T("person.participation", { n: parts.length }), (parts.length ? `<ul class="flist">${parts.map(x => `<li><div class="fhead"><a href="#overview/${esc(x.event_id)}" data-act="open-event" data-id="${esc(x.event_id)}"><b>${esc(x.event)}</b></a> ${kindTag(x.kind)}</div><div class="fmeta">${esc(fmtDay(x.starts_at))}${x.term_id ? "・" + esc(x.term_id) : ""}・${esc(T("prole." + x.role))}・${esc(T("pstatus." + x.status))}</div></li>`).join("")}</ul>` : `<div class="mini">${esc(T("person.noParts"))}</div>`) + addEv);
  const pairs = d.pairs || [];
  const pairHTML = pairs.length ? sectionHTML(T("person.pairs"), `<ul class="flist">${pairs.map(x => `<li><div class="fhead"><b>${esc(x.event || "")}</b>・${esc(x.as === "mentor" ? "Mentor" : "Mentee")}</div><div class="fmeta">${esc(T("person.pairWith"))} ${x.with_id ? `<a href="#people/${esc(x.with_id)}" data-act="open-person" data-id="${esc(x.with_id)}">${esc(x.with || "")}</a>` : esc(T("pair.forgotten"))}${x.matched_on ? "・" + esc(x.matched_on) : ""}${x.ended_on ? "・" + esc(x.ended_on) + " " + esc(T("pend." + (x.end_reason || "other"))) : ""}</div></li>`).join("")}</ul>`) : "";
  const outs = d.outcomes || [];
  const outHTML = sectionHTML(T("person.outcomes", { n: outs.length }), `${outs.length ? `<ul class="flist">${outs.map(o => `<li><div class="fhead"><b>${esc(T("okind." + o.kind))}</b> ${o.institution ? esc(o.institution) : ""}${o.year ? ` <span class="mini">${esc(String(o.year))}</span>` : ""}</div><div class="fmeta">${[o.title, o.country, o.major, o.note].filter(Boolean).map(esc).join("・")}・<span class="mini">${esc(T("vis." + o.visibility))}・${esc(T("osrc." + o.source))}</span>${manage ? ` <button class="btn quiet sm" data-act="out-del" data-id="${esc(o.id)}">${esc(T("common.delete"))}</button>` : ""}</div></li>`).join("")}</ul>` : `<div class="mini">${esc(T("person.noOutcomes"))}</div>`}
    ${manage && !p.forgotten_at ? `${foldStart("oadd", "data-oadd", T("out.add"), S)}<div class="two"><label><i>${esc(T("out.kind"))}</i>${sel("kind", OKINDS.map(k => [k, T("okind." + k)]), "admitted")}</label><label><i>${esc(T("out.year"))}</i><input name="year" type="number" min="2000" max="2100"></label></div>
      <div class="two"><label><i>${esc(T("out.institution"))}</i><input name="institution" maxlength="120"></label><label><i>${esc(T("out.country"))}</i><input name="country" maxlength="60"></label></div>
      <div class="two"><label><i>${esc(T("out.major"))}</i><input name="major" maxlength="80"></label><label><i>${esc(T("out.visibility"))}</i>${sel("visibility", VIS.map(v => [v, T("vis." + v)]), "internal")}</label></div>
      <div class="form-foot"><button class="btn sm" data-act="out-add"${S.busy ? " disabled" : ""}>${esc(T("out.addBtn"))}</button><span class="mini">${esc(T("out.addHint"))} ${esc(T("out.minorHint"))}</span></div></div></details>` : ""}`);
  const resp = d.responses || [];
  const respHTML = resp.length ? sectionHTML(T("person.responses", { n: resp.length }), `<ul class="flist">${resp.map(r => `<li><div class="fhead"><a href="#forms/${esc(r.form_id)}/results" data-act="open-form" data-id="${esc(r.form_id)}"><b>${esc(r.title)}</b></a> <span class="mini">${esc(fmtWhen(r.submitted_at))}</span></div><div class="fmeta">${(r.answers || []).map(a => `${esc(a.key || a.label)}: ${esc(a.value)}`).join("・")}</div></li>`).join("")}</ul>`) : "";
  const forget = pres && !p.forgotten_at ? sectionHTML(T("person.remove"), `<div class="mini">${esc(T(p.has_account ? "person.removeAccount" : "person.removeHint"))}</div>${p.has_account ? "" : `<div class="form-foot"><button class="btn quiet sm" data-act="forget" data-id="${esc(p.id)}">${esc(T("person.forget"))}</button></div>`}`) : "";
  // 順序：他是誰（標籤、基本資料、個人檔案）→ 他在 BT 做過什麼 → 他自己寫的與同意的 → 當講者的活動 → 個人連結與聯絡方式（傳連結要用）→ 原本的時間軸。
  // 已經移除的人那幾塊不畫：個人檔案、標籤、連結在移除時一起清掉了。
  const network = !net ? `<div class="note">${esc(T("net.noSql"))}</div>` : p.forgotten_at ? "" : null;
  // 2026-11-24：這一頁疊到十幾塊，收成四個分頁（Paul：「do the same thing… for the whole BT」）。照上面那個順序分：
  //   details  基本資料    他是誰：個人檔案（左邊照片，右邊基本資料與現在的工作，2026-11-25 排到最上面）、標籤、聯絡方式、學校
  //   bt       參與紀錄    幹部職位、參加過的活動、當講者的活動、配對、去向（「跟 BT 的關係」那一塊 2026-11-25 拿掉了）
  //   voice    故事與同意  他自己寫的故事、他同意了什麼、個人連結、他填過的回饋
  //   settings 設定        移除的要求（只有 Co-President 有，其他人沒有這個分頁）
  // 遷移檔還沒跑的那一句提醒（network）留在分頁外面。看不到的那一塊是空字串，整個分頁都空的就不畫那個分頁。
  const on = network == null;
  return head + aliasHTML + msgHTML(S.msg) + (network || "") + RAIL.pageTabsHTML("rc-person", [
    { key: "details", label: T("ptab.details"), body: (on ? personProfileHTML(d, S, canEdit, inProfile ? editInner : "") : "") + edit + (on ? personLabelsHTML(d, S, canEdit) : "") + ctHTML + schHTML },
    { key: "bt", label: T("ptab.bt"), body: posHTML + partHTML + (on ? personSpeakingHTML(d) : "") + pairHTML + outHTML, n: parts.length },
    { key: "voice", label: T("ptab.voice"), body: (on ? personStoryHTML(d) + personConsentHTML(d, S, canEdit) + personLinkHTML(d, S, canEdit) : "") + respHTML },
    { key: "settings", label: T("ptab.settings"), body: forget },
  ], { aria: T("ptab.aria") });
}
// 年度比較。
// ── 年度比較（2026-12-04 改版，Paul：「it looks really messy and pointless, make filters」）──
// 資料從 boot.events 來（每一場的記分卡數字 rc_event_card 都在手上），不再另外問 rc_yearly()。
// yearlyRows：篩完的活動，每一屆、每一種一列，加上每一屆的小計；compareTable：種類 × 屆別的格子，空的列與欄不印。純函式，有測試。
export const YR_FILTERS = ["term", "kind", "team"];
export const YR_METRICS = ["attended", "registered", "rate", "responses", "recommend", "useful", "events"];
export function yearlyFilter(events, f) {
  const x = f || {};
  return (events || []).filter(e => (!x.term || (e.term_id || "") === x.term) && (!x.kind || e.kind === x.kind) && (!x.team || (e.team || "") === x.team));
}
export function yearlyRows(events) {
  const g = new Map();
  for (const e of events || []) {
    const n = e.numbers || {}; const key = `${e.term_id || ""}\u0000${e.kind || "other"}`;
    const r = g.get(key) || { term_id: e.term_id || "", kind: e.kind || "other", events: 0, registered: 0, attended: 0, responses: 0, rec_sum: 0, rec_n: 0, use_sum: 0, use_n: 0, changes: [] };
    r.events += 1; r.registered += Number(n.registered || 0); r.attended += Number(n.attended || 0); r.responses += Number(n.responses || 0);
    if (n.recommend_avg != null) { const w = Number(n.recommend_n || 1); r.rec_sum += Number(n.recommend_avg) * w; r.rec_n += w; }
    if (n.useful_avg != null) { const w = Number(n.responses || 1); r.use_sum += Number(n.useful_avg) * w; r.use_n += w; }
    if (e.review && e.review.we_change) r.changes.push({ event: evTitle(e), we_change: e.review.we_change, change_happened: e.review.change_happened });
    g.set(key, r);
  }
  return [...g.values()].map(r => ({ ...r, rate: r.registered ? Math.round(1000 * r.attended / r.registered) / 10 : null,
    recommend_avg: r.rec_n ? Math.round(100 * r.rec_sum / r.rec_n) / 100 : null, useful_avg: r.use_n ? Math.round(100 * r.use_sum / r.use_n) / 100 : null }))
    .sort((a, b) => (b.term_id || "").localeCompare(a.term_id || "") || EKINDS.indexOf(a.kind) - EKINDS.indexOf(b.kind));
}
export function yearlyTotals(rows) {
  const t = { events: 0, registered: 0, attended: 0, responses: 0, rec_sum: 0, rec_n: 0, use_sum: 0, use_n: 0 };
  for (const r of rows || []) { t.events += r.events; t.registered += r.registered; t.attended += r.attended; t.responses += r.responses; t.rec_sum += r.rec_sum || 0; t.rec_n += r.rec_n || 0; t.use_sum += r.use_sum || 0; t.use_n += r.use_n || 0; }
  return { ...t, rate: t.registered ? Math.round(1000 * t.attended / t.registered) / 10 : null, recommend_avg: t.rec_n ? Math.round(100 * t.rec_sum / t.rec_n) / 100 : null, useful_avg: t.use_n ? Math.round(100 * t.use_sum / t.use_n) / 100 : null };
}
const metricOf = (r, m) => m === "rate" ? r.rate : m === "recommend" ? r.recommend_avg : m === "useful" ? r.useful_avg : r[m];
export function compareTable(rows, metric) {
  const m = YR_METRICS.includes(metric) ? metric : "attended";
  const terms = [...new Set((rows || []).map(r => r.term_id || ""))].sort((a, b) => b.localeCompare(a));
  const kinds = EKINDS.filter(k => (rows || []).some(r => r.kind === k && metricOf(r, m) != null));
  const cols = terms.filter(t => (rows || []).some(r => (r.term_id || "") === t && metricOf(r, m) != null));
  const cell = (k, t) => { const r = (rows || []).find(x => x.kind === k && (x.term_id || "") === t); return r ? metricOf(r, m) : null; };
  return { metric: m, terms: cols, kinds, cells: kinds.map(k => cols.map(t => cell(k, t))) };
}
export function yearlyCSV(events, f) {
  const rows = yearlyRows(yearlyFilter(events, f));
  const head = ["term", "kind", "events", "registered", "attended", "attendance_pct", "responses", "recommend_avg", "useful_avg", "changes"];
  const body = rows.map(r => [r.term_id || "", r.kind, r.events, r.registered, r.attended, r.rate == null ? "" : r.rate, r.responses, r.recommend_avg == null ? "" : r.recommend_avg, r.useful_avg == null ? "" : r.useful_avg,
    (r.changes || []).map(c => `${c.event}: ${c.we_change}`).join(" | ")]);
  return "\ufeff" + [head, ...body].map(r => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
export function yearlyHTML(S) {
  const boot = S.boot || {}, all = boot.events || [], f = S.yf || {}, metric = YR_METRICS.includes(f.metric) ? f.metric : "attended";
  const evs = yearlyFilter(all, f), rows = yearlyRows(evs), tot = yearlyTotals(rows), cmp = compareTable(rows, metric);
  const count = pick => { const m = new Map(); for (const e of all) for (const v of pick(e)) if (v) m.set(v, (m.get(v) || 0) + 1); return [...m]; };
  const terms = count(e => [e.term_id]).sort((a, b) => b[0].localeCompare(a[0]));
  const kinds = EKINDS.map(k => [k, count(e => [e.kind]).find(x => x[0] === k)]).filter(x => x[1]).map(([k, x]) => [k, x[1]]);
  const teams = count(e => [e.team]).sort((a, b) => b[1] - a[1]);
  const box = (key, labelKey, anyKey, opts, label) => `<label><i>${esc(T(labelKey))}</i><select name="${key}" class="rc-yfilter" data-noauto="1">${pickOpt("", T(anyKey), f[key] || "")}${opts.map(([v, n]) => pickOpt(v, `${label ? label(v) : v} (${n})`, f[key] || "")).join("")}</select></label>`;
  const active = YR_FILTERS.filter(k => f[k]).length;
  const hasRec = rows.some(r => r.recommend_avg != null), hasUse = rows.some(r => r.useful_avg != null), hasResp = rows.some(r => r.responses), hasChg = rows.some(r => r.changes.length);
  const num = v => v == null ? "" : esc(String(v));
  const tr = (r, bold) => `<tr${bold ? ' class="total"' : ""}><td>${bold ? `<b>${esc(T("yr.total"))}</b>` : `<b>${esc(r.term_id || T("ov.noTerm"))}</b>`}</td><td>${bold ? "" : kindTag(r.kind)}</td><td>${r.events}</td><td>${r.attended}/${r.registered}</td><td>${num(r.rate)}</td>${hasResp ? `<td>${r.responses}</td>` : ""}${hasRec ? `<td>${num(r.recommend_avg)}</td>` : ""}${hasUse ? `<td>${num(r.useful_avg)}</td>` : ""}${hasChg ? `<td>${bold ? "" : (r.changes || []).map(c => `<div class="mini"><b>${esc(c.event)}</b>: ${esc(c.we_change)}${c.change_happened === true ? " ✓" : c.change_happened === false ? " ✗" : ""}</div>`).join("")}</td>` : ""}</tr>`;
  const table1 = rows.length ? `<div class="tf-scroll"><table class="table rc-table"><thead><tr><th>${esc(T("ev.term"))}</th><th>${esc(T("ev.kind"))}</th><th>${esc(T("yr.events"))}</th><th>${esc(T("num.attendance"))}</th><th>${esc(T("yr.rate"))}</th>${hasResp ? `<th>${esc(T("num.responses"))}</th>` : ""}${hasRec ? `<th>${esc(T("num.recommend"))}</th>` : ""}${hasUse ? `<th>${esc(T("num.useful"))}</th>` : ""}${hasChg ? `<th>${esc(T("yr.changesHead"))}</th>` : ""}</tr></thead><tbody>${rows.map(r => tr(r)).join("")}${rows.length > 1 ? tr(tot, true) : ""}</tbody></table></div>` : emptyHTML(T("yr.none"), esc(T("yr.noneHint")));
  const table2 = cmp.kinds.length && cmp.terms.length > 1 ? `<div class="tf-scroll"><table class="table rc-table rc-compare"><thead><tr><th>${esc(T("ev.kind"))}</th>${cmp.terms.map(t => `<th>${esc(t || T("ov.noTerm"))}</th>`).join("")}</tr></thead><tbody>${cmp.kinds.map((k, i) => `<tr><td>${kindTag(k)}</td>${cmp.cells[i].map(v => `<td>${num(v)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>` : `<div class="mini">${esc(T("yr.noneHint"))}</div>`;
  return pageHead(T("yr.title"), T("yr.lede"), all.length ? [{ act: "yr-csv", label: T("res.csv") }] : []) + msgHTML(S.msg)
    + `<div class="card"><div class="two">${box("term", "yr.term", "yr.anyTerm", terms)}${box("kind", "yr.kind", "yr.anyKind", kinds, k => T("ekind." + k))}</div>
      <div class="two">${box("team", "yr.team", "yr.anyTeam", teams)}<label><i>${esc(T("yr.metric"))}</i><select name="metric" class="rc-yfilter" data-noauto="1">${YR_METRICS.map(m => pickOpt(m, T("yr.m." + m), metric)).join("")}</select></label></div>
      <div class="row"><b data-yr-count>${esc(T("yr.filtered", { n: evs.length }))}</b>${active ? ` <button class="btn quiet sm" data-act="yr-clear">${esc(T("yr.clear"))}</button>` : ""}</div></div>`
    + sectionHTML(T("yr.byTerm"), table1)
    + sectionHTML(T("yr.compare") + "・" + T("yr.m." + metric), table2)
    + `<div class="note">${esc(T("yr.note"))}</div>`;
}
