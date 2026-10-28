// 實習護照的渲染層：只吃 state（S）吐 HTML 字串。不碰儲存，不碰 DOM 事件。
// 從 passport/src/ui.js 抄「格子、蓋章、心得、進度牆」四件事，其他沒抄（見 data.js 檔頭）。
import { passportNo } from "./data.js";
// 2026-10-19 起畫面上的字全部從 ./strings.js 的字典來（T("鍵")），中英兩版並排在那一支裡。
// 格子的文案來自 intern_tasks 表，維持原樣，不翻。
import { T, lang, setLang } from "./strings.js";
export { T, lang, setLang };

// 三種分類的**唯一定義點**。對應 intern_tasks.category 的 check。
// 文案是暫定的，Internship team 看過再改；改這裡不影響資料庫，格子的文案在 intern_tasks 表。
// label / short / zh / body 是字典的鍵（2026-10-19 中英切換），畫的時候 T()；define 本來就是英文。
export const CATEGORY = {
  onboard: { label: "cat.onboard", short: "cat.onboard.short", zh: "cat.onboard.short",
             define: "What you do in the first month", body: "cat.onboard.body" },
  project: { label: "cat.project", short: "cat.project.short", zh: "cat.project.short",
             define: "The work itself", body: "cat.project.body" },
  reflect: { label: "cat.reflect", short: "cat.reflect.short", zh: "cat.reflect.short",
             define: "Written to yourself", body: "cat.reflect.body" }
};
export const CATNAME = Object.fromEntries(Object.entries(CATEGORY).map(([k, v]) => [k, v.label]));

// 分類的順序：入門 → 任務 → 反思。頁序與格子排序都問這一個陣列。
export const SLOT_ORDER = ["onboard", "project", "reflect"];

// 2026-11-14 起分類從資料庫來（intern_groups，後台「實習護照」改）。載到了就把上面三樣**原地換掉**，
// 所以其他地方照舊問 CATEGORY / CATNAME / SLOT_ORDER；載不到（遷移檔還沒跑）就維持上面寫死的三個。
// 中英文用 { zh, en } 物件放進去，T() 本來就吃這種物件。
export function setGroups(rows) {
  if (!Array.isArray(rows) || !rows.length) return;
  const list = rows.slice().sort((a, b) => a.seq - b.seq);
  for (const k of Object.keys(CATEGORY)) delete CATEGORY[k];
  for (const k of Object.keys(CATNAME)) delete CATNAME[k];
  SLOT_ORDER.length = 0;
  for (const g of list) {
    const tag = { zh: `${g.name_zh} ${String(g.name_en || "").toUpperCase()}`, en: String(g.name_en || "").toUpperCase() };
    CATEGORY[g.key] = {
      label: tag, short: { zh: g.name_zh, en: g.name_en }, zh: { zh: g.name_zh, en: g.name_en },
      define: { zh: g.tagline_zh || g.tagline_en || "", en: g.tagline_en || g.tagline_zh || "" },
      body: { zh: g.body_zh || g.body_en || "", en: g.body_en || g.body_zh || "" }
    };
    CATNAME[g.key] = tag;
    SLOT_ORDER.push(g.key);
  }
}
// 棋盤上的顏色（2026-11-14）：照分類的位置輪流用五種，原本三個分類的顏色不變。
const TONES = ["onboard", "project", "reflect", "t4", "t5"];
export const toneOf = cat => { const i = SLOT_ORDER.indexOf(cat); return i < 0 ? "" : TONES[i % TONES.length]; };

export const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const today = () => new Date().toISOString().slice(0, 10);

// 蓋了幾個章。**整個檔案只准在這裡數一次**（check.sh 守著）。
export function stampCount(S) {
  return Object.keys(S.stamps).length;
}

// 這一格現在哪一面朝上。未蓋章一律正面，而且不產生背面的 DOM。
export function faceOf(S, a) {
  if (!S.stamps[a.id]) return "front";
  return (S.flipped || {})[a.id] === "back" ? "back" : "front";
}

// 一個人在畫面上顯示的兩個名字（跟 passport/src/ui.js 的 namesOf 同一份規則）。
export function namesOf(p) {
  const zh = String(p.name_zh || "").trim();
  const en = String(p.name_en || "").trim();
  return { name: zh || en || T("common.noName"), alt: zh && en && zh !== en ? en : "" };
}
function nameHTML(p) {
  const n = namesOf(p);
  return esc(n.name) + (n.alt ? `<span class="alt">${esc(n.alt)}</span>` : "");
}

// 書的頁序：資料頁、說明頁，然後**一個分類一頁**（只畫有格子的分類）。
// 幹部護照是一個月一頁，這本是一個分類一頁 —— 實習的格子不綁月份，數量也不固定。
// 頁碼只有這裡一個定義點，dots、上一頁下一頁、鍵盤左右都問它。
export function pagesOf(S) {
  const cats = SLOT_ORDER.filter(c => (S.tasks || []).some(t => t.category === c));
  // 認不得的分類排到最後、不丟掉：category 改名而這裡沒跟上時，錯誤要是「順序不對」不是「格子消失」。
  const unknown = [...new Set((S.tasks || []).map(t => t.category).filter(c => !SLOT_ORDER.includes(c)))];
  return [
    // 蛇梯棋（2026-10-22）：這一屆的棋盤開著，它就是第一頁。沒開就跟以前一樣。
    ...(S.board ? [{ kind: "board", label: T("page.board") }] : []),
    { kind: "id", label: T("page.id") },
    { kind: "guide", label: T("page.guide") },
    ...[...cats, ...unknown].map(c => ({ kind: "cat", cat: c, label: CATEGORY[c] ? T(CATEGORY[c].zh) : c }))
  ];
}

// ?cat=project 對到 pagesOf 的哪一頁（2026-10-16，給後台的預覽用）。找不到就回 0（資料頁）。
export function pageForCat(S, cat) {
  if (!cat) return 0;
  const i = pagesOf(S).findIndex(pg => pg.kind === "cat" && pg.cat === cat);
  return i < 0 ? 0 : i;
}

// 樣書的持照人（2026-10-16）。staff 沒有自己那一列 intern_passports，
// 要看「這本護照長什麼樣」就用這個假的人填資料頁。只在畫面上，不寫進任何表。
export function sampleProfile(term) {
  return { id: "sample", name_zh: T("sample.name"), name_en: "INTERN NAME", motto: "",
           issued: today(), avatar: null, term: term ? term.id : null };
}

export function barHTML(S) {
  const done = stampCount(S);
  // staff（Internship team 的幹部）沒有自己的護照：進度牆，加一本「樣書」看格子長什麼樣。
  const tabs = S.staff
    ? `<button role="tab" aria-selected="${S.view !== "sample"}" data-act="tab" data-v="wall">${T("bar.wall")}</button>
       <button role="tab" aria-selected="${S.view === "sample"}" data-act="tab" data-v="sample">${T("bar.sample")}</button>`
    : `<button role="tab" aria-selected="${S.view === "passport"}" data-act="tab" data-v="passport">${T("bar.mine")}</button>
       <button role="tab" aria-selected="${S.view === "wall"}" data-act="tab" data-v="wall">${T("bar.wallShort")}</button>`;
  return `<div class="bar">
    <div class="tabs" role="tablist">${tabs}</div>
    <div class="sp"></div>
    ${S.staff ? "" : `<div class="prog"><small>${T("bar.stamps")}</small>${done} <span style="opacity:.4">/ ${S.tasks.length}</span></div>`}
  </div>`;
}

// 這一頁的圓點要不要塗橘色。**acts.length > 0 不可省**：[].every() 回 true。
function dotOn(S, cat) {
  const acts = S.tasks.filter(t => t.category === cat);
  return acts.length > 0 && acts.every(t => S.stamps[t.id]) ? 1 : 0;
}

export function bookHTML(S) {
  const pages = pagesOf(S);
  const cur = pages[S.page] || pages[0];
  return `<div class="cover"><div class="book">
    <div class="page turn">${pageBodyHTML(S, cur)}
      <div class="pageno">PAGE ${String(S.page + 1).padStart(2, "0")} / ${pages.length}</div>
    </div>
    <div class="nav">
      <button class="arrow" data-act="prev" ${S.page === 0 ? "disabled" : ""}>${T("nav.prev")}</button>
      <div class="dots">
        ${pages.map((p, i) => {
          const on = p.kind === "cat" ? ` data-on="${dotOn(S, p.cat)}"` : "";
          return `<button data-act="go" data-p="${i}"${on} aria-current="${S.page === i}" aria-label="${esc(p.label)}" title="${esc(p.label)}"></button>`;
        }).join("")}
      </div>
      <button class="arrow" data-act="next" ${S.page === pages.length - 1 ? "disabled" : ""}>${T("nav.next")}</button>
    </div>
  </div></div>`;
}

function pageBodyHTML(S, page) {
  if (page.kind === "board") return boardPageHTML(S);
  if (page.kind === "id") return idPageHTML(S);
  if (page.kind === "guide") return guidePageHTML();
  return catPageHTML(S, page.cat);
}

// total > 0 不可省：格子還沒建好時 0 === 0 會蓋一個「0 / 0 · FULL」。
export function idPageHTML(S) {
  const p = S.profile;
  const av = p.avatar ? `<img src="${esc(p.avatar)}" alt="">` : (S.sample ? `<span>${T("id.avatar")}</span>` : `<span>${T("id.upload")}</span>`);
  const done = stampCount(S);
  const total = S.tasks.length;
  const term = S.term;
  return `<div class="mhead">
      <div class="mnum">00</div>
      <div class="mzh">${T("id.title")}</div>
      <div class="mtheme"><b>BEYOND TAIWAN</b><span>Intern Passport · ${esc(term ? term.title_en : "")}</span></div>
    </div>
    <div class="idgrid">
      ${S.sample ? `<span class="photo">${av}</span>` : `<a class="photo" href="../settings/" title="${esc(T("id.changeAvatar"))}">${av}</a>`}
      <div>
        <div class="fields">
          <div class="f"><i>${T("id.type")}</i><b>INTERN</b></div>
          <div class="f"><i>${T("id.code")}</i><b>TWN</b></div>
          <div class="f"><i>${T("id.no")}</i><b>${passportNo(p.id)}</b></div>
          <div class="f"><i>${T("id.issue")}</i><b>${esc(p.issued)}</b></div>
          <div class="f wide"><i>${T("id.name")}</i><b>${esc(p.name_zh)} · ${esc(p.name_en).toUpperCase()}</b></div>
          <div class="f wide"><i>${T("id.term")}</i><b>${esc(term ? term.title_zh : (p.term || T("id.noTerm")))}</b></div>
        </div>
        ${p.motto ? `<div class="motto">「${esc(p.motto)}」</div>` : ""}
        ${S.board && !S.sample ? pawnPickerHTML(p.pawn || null, false) : ""}
      </div>
    </div>
    ${total > 0 && done === total ? `<div class="overprint" style="position:static;display:inline-block;margin-top:22px;transform:rotate(-3deg)">${total} / ${total} · FULL</div>` : ""}
    ${S.sample
      ? `<div class="row" style="margin-top:18px"><span class="mini">${T("id.sampleNote")}</span></div>`
      : `<div class="row" style="margin-top:18px"><button class="btn ghost sm" data-act="edit">${T("id.edit")}</button></div>`}`;
}

function stampInner(act, st, extraClass) {
  const ink = SLOT_ORDER.indexOf(act.category) % 2 === 1 ? "ink-fill" : "ink-navy";
  // 角度與高低都由 id 決定，不是亂數：重整不會跳。取 id 最後兩個字。
  const code = String(act.id).slice(-2);
  const rot = ((code.charCodeAt(0) * 7 + code.charCodeAt(1) * 3) % 11) - 5;
  const dy = (((code.charCodeAt(0) * 13 + code.charCodeAt(1)) % 9) * 7) - 24;
  return `<div class="stampwrap" style="--dy:${dy}px"><div class="tilt" style="transform:rotate(${rot}deg)">
    <div class="stamp ${ink}${extraClass ? " " + extraClass : ""}">
      <div class="s1">BT · Intern</div>
      <div class="s2">${esc(act.title_en)}</div>
      <div class="s3">${esc(st.date).replace(/-/g, ".")}</div>
    </div>
  </div></div>`;
}

export function stampHTML(act, st, animate, tearing) {
  if (tearing) {
    return `<div class="tearwrap">
      <div class="tearhalf l">${stampInner(act, st)}</div>
      <div class="tearhalf r">${stampInner(act, st)}</div>
    </div>`;
  }
  return stampInner(act, st, animate ? "land" : "");
}

// 一個分類一頁。格子數量不限，三欄 grid 自己往下排。
export function catPageHTML(S, cat) {
  const acts = S.tasks.filter(t => t.category === cat);
  const g = CATEGORY[cat] || { zh: { zh: cat, en: cat }, label: { zh: cat, en: cat }, define: "" };
  const done = acts.filter(t => S.stamps[t.id]).length;
  return `<div class="mhead">
      <div class="mnum">${String(SLOT_ORDER.indexOf(cat) + 1).padStart(2, "0")}</div>
      <div class="mzh">${esc(T(g.zh))}</div>
      <div class="mtheme"><b>${done} / ${acts.length}</b><span>${esc(T(g.define))}</span></div>
    </div>
    <div class="slots">${acts.map(a => slotHTML(S, a)).join("")}</div>`;
}

function flipBtnHTML(id, to) {
  return `<button class="flipbtn" data-act="flip" data-id="${esc(id)}" data-to="${to}" aria-label="${esc(to === "back" ? T("flip.back") : T("flip.front"))}">↻</button>`;
}

// 一格。正面：分類、標題、章、翻面鈕；背面：小字標題、說明、心得、照片。
// 未蓋章不產生背面的 DOM。這段註解在 template 外面，理由同 passport/src/ui.js。
export function slotHTML(S, a) {
  const st = S.stamps[a.id];
  const entry = S.entries[a.id] || {};
  const face = faceOf(S, a);
  const anim = st && S.justStamped === a.id;
  if (anim) S.justStamped = null;
  const turn = S.justFlipped === a.id;
  if (turn) S.justFlipped = null;
  const tearing = !!st && S.tearing === a.id;

  const front = `<div class="face front" data-act="open" data-id="${esc(a.id)}" aria-hidden="${face === "back"}">
      <button class="faceopen" data-act="open" data-id="${esc(a.id)}">
        <span class="cat">${esc(CATNAME[a.category] ? T(CATNAME[a.category]) : "")}</span>
        <span class="ttl">${esc(a.title_zh)}</span>
        ${st ? "" : `<span class="en">${esc(a.title_en)}</span><span class="hint">${esc(a.description)}</span><span class="cta">${T("slot.cta")}</span>`}
      </button>
      ${st ? stampHTML(a, st, anim, tearing) + flipBtnHTML(a.id, "back") : ""}
    </div>`;
  const back = !st ? "" : `<div class="face back" aria-hidden="${face === "front"}">
      <span class="btitle">${esc(a.title_zh)}</span>
      <span class="hint">${esc(a.description)}</span>
      ${entry.note ? `<span class="note">${esc(entry.note)}</span>` : ""}
      ${entry.photo ? `<img class="thumb" src="${esc(entry.photo)}" alt="">` : ""}
      ${flipBtnHTML(a.id, "front")}
    </div>`;
  return `<div class="slot" data-id="${esc(a.id)}" data-done="${st ? 1 : 0}" data-face="${face}">
    <div class="flip${turn ? (face === "back" ? " turning-back" : " turning-front") : ""}">${front}${back}</div>
  </div>`;
}

// ═══════════════════════════════════════════════════════════════════════
// 蛇梯棋（2026-10-22，docs/2026-10-19-實習護照蛇梯棋計畫.md）
// S.board = { term, size, active }，S.squares = [{ pos, kind, task_id, goes_to }]，
// S.positions = intern_positions() 的 [{ user_id, pos, rolls, tickets }]，S.lastRoll = roll_dice() 的結果，
// S.animPos = 棋子走到一半的位置（main.js 一格一格推），S.rolling = 骰子在轉。
// 骰子在資料庫擲；這裡只畫。不讀 entries。
// ═══════════════════════════════════════════════════════════════════════
export const BOARD_PER_ROW = 5;
// 蛇形排法。**跟 admin/passports/src/ui.js 的 boardRows 同一份規則**（資料夾之間不互相 import），test/intern-board.test.mjs 逐字比對。
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
// 我的位置、票、別人的位置，全部從 S.positions 來（資料庫算的）。
export function myStanding(S) {
  const me = S.profile && (S.positions || []).find(p => p.user_id === S.profile.id);
  return { pos: me ? me.pos : 0, tickets: me ? me.tickets : 0, rolls: me ? me.rolls : 0 };
}
const squareAt = (S, pos) => (S.squares || []).find(s => s.pos === pos) || null;
const taskOf = (S, id) => (S.tasks || []).find(t => t.id === id) || null;

// ── 棋子（2026-10-23）──────────────────────────────────────────────────
// 八顆自己畫的扁平向量棋子，全部用 Brand Book 的色票（style 裡寫 var(--bt-...)，check.sh 的色碼白名單掃得到），
// 沒有外部圖、沒有商標角色。代號跟 intern_passports.pawn 的 check 一樣，加一顆要兩邊一起加。
const O = "stroke:var(--bt-navy);stroke-width:1.4;stroke-linejoin:round";
// 八顆八個顏色（2026-10-24 上色）：七色裡拿橘、深藍、亮黃、蒂芬妮綠、中性灰五個，再用 color-mix 從七色調出三個
// （深蒂芬妮、鐵鏽橘、萊姆），定義在 index.html 的 :root（--pawn-*），還是只有品牌色，沒有新的色碼。
export const PAWN_COLORS = { meeple: "orange", checker: "navy", cat: "yellow", bird: "teal", fish: "deepteal", star: "rust", boat: "grey", kite: "lime" };
export const PAWNS = {
  meeple:  { color: "var(--bt-orange)", body: `<path d="M12 3a3 3 0 0 1 3 3c0 1.3-.7 2.3-1.6 2.8L17 12h3l-1 4h-2.4l.9 5H6.5l.9-5H5l-1-4h3l3.6-3.2A3 3 0 0 1 9 6a3 3 0 0 1 3-3z" style="fill:var(--bt-orange);${O}"/>` },
  checker: { color: "var(--bt-navy)",   body: `<circle cx="12" cy="12" r="9" style="fill:var(--bt-navy);${O}"/><circle cx="12" cy="12" r="5" style="fill:none;stroke:var(--bt-cream);stroke-width:1.6"/>` },
  cat:     { color: "var(--bt-yellow)", body: `<path d="M5 20V8l4 3h6l4-3v12z" style="fill:var(--bt-yellow);${O}"/><circle cx="9.5" cy="14" r="1.1" style="fill:var(--bt-navy)"/><circle cx="14.5" cy="14" r="1.1" style="fill:var(--bt-navy)"/>` },
  bird:    { color: "var(--bt-teal)",   body: `<path d="M3 13c3-5 9-6 13-4l5-1-3 3c1 6-5 10-11 9l-4-2 5-1z" style="fill:var(--bt-teal);${O}"/><circle cx="15" cy="10.5" r="1" style="fill:var(--bt-navy)"/>` },
  fish:    { color: "var(--pawn-deepteal)", body: `<path d="M3 12c3-5 8-6 13-3l5-4v10l-5-4c-5 3-10 2-13-3z" style="fill:var(--pawn-deepteal);${O}"/><circle cx="8" cy="11.5" r="1" style="fill:var(--bt-navy)"/>` },
  star:    { color: "var(--pawn-rust)",   body: `<path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4 6.1 20.5l1.2-6.5L2.5 9.4l6.6-.9z" style="fill:var(--pawn-rust);${O}"/>` },
  boat:    { color: "var(--bt-grey)",   body: `<path d="M12 3v11h7z" style="fill:var(--bt-sand);${O}"/><path d="M3 15h18l-3 5H6z" style="fill:var(--bt-grey);${O}"/>` },
  kite:    { color: "var(--pawn-lime)",   body: `<path d="M12 2l7 8-7 10-7-10z" style="fill:var(--pawn-lime);${O}"/><path d="M12 20c-1 2 1 3-1 4" style="fill:none;${O}"/><path d="M5 10h14M12 2v18" style="fill:none;stroke:var(--bt-navy);stroke-width:1"/>` },
};
export const PAWN_KEYS = Object.keys(PAWNS);
// 一顆棋子的 HTML：有代號畫向量，沒有就大頭照，再沒有就名字第一個字。
export function pawnHTML(p) {
  const cls = `pawn${p.me ? " me" : ""}`;
  const name = esc(p.name || "");
  if (p.pawn && PAWNS[p.pawn]) {
    return `<svg class="${cls}" viewBox="0 0 24 24" role="img" aria-label="${name}" title="${name}"><title>${name}</title>${PAWNS[p.pawn].body}</svg>`;
  }
  if (p.avatar) return `<img class="${cls}" src="${esc(p.avatar)}" alt="${name}" title="${name}">`;
  return `<span class="${cls}" title="${name}">${esc(String(p.name || "?").trim().slice(0, 1))}</span>`;
}
// 選棋子。current 是現在的代號（null 就是大頭照）。first 是「第一次上棋盤還沒選」那一版，多一顆「先用大頭照」。
export function pawnPickerHTML(current, first) {
  return `<div class="ppick${first ? " first" : ""}" id="pawn-picker">
    <div class="pphead"><b>${esc(first ? T("pawn.first") : T("pawn.title"))}</b><span>${esc(T("pawn.hint"))}</span></div>
    <div class="ppgrid">${PAWN_KEYS.map(k => `<button class="ppbtn${current === k ? " on" : ""}" data-act="pawn" data-key="${k}" aria-pressed="${current === k}" title="${esc(T("pawn." + k))}">
      <svg viewBox="0 0 24 24" aria-hidden="true">${PAWNS[k].body}</svg><span>${esc(T("pawn." + k))}</span></button>`).join("")}
      ${first ? `<button class="ppbtn skip" data-act="pawn-skip">${esc(T("pawn.skip"))}</button>` : `<button class="ppbtn${!current ? " on" : ""}" data-act="pawn" data-key="" aria-pressed="${!current}"><span>${esc(T("pawn.none"))}</span></button>`}
    </div>
  </div>`;
}

// ── 真的蛇與梯（2026-10-23）──────────────────────────────────────────
// centers = { <pos>: { x, y } } 是每一格的中心（main.js 畫完格子之後量的，相對於 .bwrap），cell 是一格的寬。
// 回傳 svg 裡面的內容：梯子兩條軌加橫檔（橘），蛇一條彎彎的粗線加頭（蒂芬妮綠），深藍描邊。
// 每條線有 id="line-<pos>"，棋子落在蛇梯上就沿著這條線走（main.js 用 getPointAtLength）。純函式，測試守著。
export function boardLinesSVG(squares, centers, cell) {
  const f = n => Math.round(n * 10) / 10;
  const out = [];
  for (const sq of squares || []) {
    if ((sq.kind !== "ladder" && sq.kind !== "snake") || !sq.goes_to) continue;
    const a = centers[sq.pos], b = centers[sq.goes_to];
    if (!a || !b) continue;
    const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len, ny = dx / len;                       // 垂直方向
    if (sq.kind === "ladder") {
      const w = cell * 0.16;
      const rails = [-1, 1].map(s => `M${f(a.x + nx * w * s)} ${f(a.y + ny * w * s)} L${f(b.x + nx * w * s)} ${f(b.y + ny * w * s)}`).join(" ");
      const n = Math.max(2, Math.floor(len / (cell * 0.42)));
      let rungs = "";
      for (let i = 1; i < n; i++) {
        const t = i / n, cx = a.x + dx * t, cy = a.y + dy * t;
        rungs += `M${f(cx + nx * w)} ${f(cy + ny * w)} L${f(cx - nx * w)} ${f(cy - ny * w)} `;
      }
      out.push(`<g class="ladder" data-from="${sq.pos}" data-to="${sq.goes_to}">
        <path d="${rails} ${rungs}" style="fill:none;stroke:var(--bt-navy);stroke-width:${f(cell * 0.09)};stroke-linecap:round"/>
        <path id="line-${sq.pos}" d="M${f(a.x)} ${f(a.y)} L${f(b.x)} ${f(b.y)}" style="fill:none;stroke:none"/>
        <path d="${rails} ${rungs}" style="fill:none;stroke:var(--bt-orange);stroke-width:${f(cell * 0.045)};stroke-linecap:round"/>
        <path class="grain" d="${rails}" style="fill:none;stroke:var(--bt-cream);stroke-width:${f(cell * 0.012)};stroke-dasharray:${f(cell * 0.06)} ${f(cell * 0.05)};stroke-opacity:.8"/>
      </g>`);
    } else {
      // 蛇：頭在 pos（上面），尾在 goes_to（下面）。三段三次曲線，左右各扭一次。
      const wig = cell * 0.55;
      const p1 = { x: a.x + dx * 0.33 + nx * wig, y: a.y + dy * 0.33 + ny * wig };
      const p2 = { x: a.x + dx * 0.66 - nx * wig, y: a.y + dy * 0.66 - ny * wig };
      const d = `M${f(a.x)} ${f(a.y)} C${f(a.x + nx * wig)} ${f(a.y + ny * wig)}, ${f(p1.x)} ${f(p1.y)}, ${f(a.x + dx * 0.5)} ${f(a.y + dy * 0.5)} S${f(p2.x)} ${f(p2.y)}, ${f(b.x)} ${f(b.y)}`;
      const hr = cell * 0.16;
      out.push(`<g class="snake" data-from="${sq.pos}" data-to="${sq.goes_to}">
        <path d="${d}" style="fill:none;stroke:var(--bt-navy);stroke-width:${f(cell * 0.17)};stroke-linecap:round"/>
        <path id="line-${sq.pos}" d="${d}" style="fill:none;stroke:var(--bt-teal);stroke-width:${f(cell * 0.11)};stroke-linecap:round"/>
        <path class="spine" d="${d}" style="fill:none;stroke:var(--bt-navy);stroke-width:${f(cell * 0.025)};stroke-dasharray:${f(cell * 0.1)} ${f(cell * 0.07)};stroke-opacity:.45;stroke-linecap:round"/>
        <path class="tongue" d="M${f(a.x - (dx / len) * hr)} ${f(a.y - (dy / len) * hr)} l${f(-(dx / len) * hr * 0.9)} ${f(-(dy / len) * hr * 0.9)} m${f((dx / len) * hr * 0.35)} ${f((dy / len) * hr * 0.35)} l${f(nx * hr * 0.3 - (dx / len) * hr * 0.25)} ${f(ny * hr * 0.3 - (dy / len) * hr * 0.25)} m${f(-nx * hr * 0.3 + (dx / len) * hr * 0.25)} ${f(-ny * hr * 0.3 + (dy / len) * hr * 0.25)} l${f(-nx * hr * 0.3 - (dx / len) * hr * 0.25)} ${f(-ny * hr * 0.3 - (dy / len) * hr * 0.25)}" style="fill:none;stroke:var(--bt-orange);stroke-width:${f(cell * 0.03)};stroke-linecap:round"/>
        <circle cx="${f(a.x)}" cy="${f(a.y)}" r="${f(hr)}" style="fill:var(--bt-teal);stroke:var(--bt-navy);stroke-width:${f(cell * 0.04)}"/>
        <circle cx="${f(a.x - nx * hr * 0.45 + (dx / len) * hr * 0.2)}" cy="${f(a.y - ny * hr * 0.45 + (dy / len) * hr * 0.2)}" r="${f(hr * 0.18)}" style="fill:var(--bt-navy)"/>
        <circle cx="${f(a.x + nx * hr * 0.45 + (dx / len) * hr * 0.2)}" cy="${f(a.y + ny * hr * 0.45 + (dy / len) * hr * 0.2)}" r="${f(hr * 0.18)}" style="fill:var(--bt-navy)"/>
      </g>`);
    }
  }
  return out.join("");
}

// 棋盤本體。pawns = [{ user_id, pos, me, name, avatar, pawn }]。
export function boardGridHTML(S, pawns, opts) {
  const size = S.board ? S.board.size : 0;
  if (!size) return "";
  const o = opts || {};
  const byPos = {};
  for (const p of pawns || []) { (byPos[p.pos] = byPos[p.pos] || []).push(p); }
  const pawn = pawnHTML;
  // 分區（2026-10-24 上色）：從起點走到終點，每個任務格把它的分類帶給後面的空格，直到下一個任務格。
  // 任務格本身上同一色但深一點（class c-<分類>），空格淡淡的（class z-<分類>）；蛇梯格保留自己的顏色。
  const zone = {}; let cur = "";
  for (let p = 1; p <= size; p++) {
    const s = squareAt(S, p), t0 = s && s.kind === "task" ? taskOf(S, s.task_id) : null;
    if (t0 && SLOT_ORDER.includes(t0.category)) cur = toneOf(t0.category);
    zone[p] = cur;
  }
  const cell = pos => {
    const sq = squareAt(S, pos);
    const kind = sq ? sq.kind : "plain";
    const t = sq && sq.kind === "task" ? taskOf(S, sq.task_id) : null;
    const done = t && S.stamps && S.stamps[t.id];
    const here = byPos[pos] || [];
    const lit = o.lit === pos;
    const mine = here.some(p => p.me);
    const tint = t && zone[pos] ? ` c-${zone[pos]}` : kind === "plain" && zone[pos] ? ` z-${zone[pos]}` : "";
    let label = "";
    if (kind === "ladder") label = `<span class="sk">↑${esc(String(sq.goes_to))}</span>`;
    else if (kind === "snake") label = `<span class="sk">↓${esc(String(sq.goes_to))}</span>`;
    else if (t) label = `<span class="st${done ? " done" : ""}">${esc(t.title_zh || t.title_en)}</span>`;
    return `<div class="bq ${kind}${tint}${pos === size ? " finish" : ""}${lit ? " lit" : ""}${mine ? " here" : ""}${done ? " stamped" : ""}" data-pos="${pos}"${t && !o.sample ? ` data-act="open" data-id="${esc(t.id)}" role="button" tabindex="0"` : ""}>
      <span class="bn">${pos === size ? esc(T("board.finish")) : pos}</span>${label}
      ${here.length ? `<span class="pawns">${here.map(pawn).join("")}</span>` : ""}
    </div>`;
  };
  const start = byPos[0] || [];
  // .blines 是空的，main.js 畫完格子量到中心之後才用 boardLinesSVG() 填進去（視窗大小變了再量一次）。
  return `<div class="bwrap"><div class="bgrid" style="grid-template-columns:repeat(${BOARD_PER_ROW},1fr)">${
    boardRows(size).map(r => r.map(cell).join("")).join("")}</div>
    <svg class="blines" aria-hidden="true"></svg>
    <div class="bstart"><span class="bn">${esc(T("board.start"))}</span>${start.length ? `<span class="pawns">${start.map(pawn).join("")}</span>` : ""}</div></div>`;
}

// 骰子：轉的時候是問號，停了是點數。
function diceHTML(n, rolling) {
  const pips = { 1: [5], 2: [1, 9], 3: [1, 5, 9], 4: [1, 3, 7, 9], 5: [1, 3, 5, 7, 9], 6: [1, 3, 4, 6, 7, 9] }[n] || [];
  return `<span class="dice${rolling ? " rolling" : ""}" aria-hidden="true">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(i => `<i${pips.includes(i) ? ' class="on"' : ""}></i>`).join("")}</span>`;
}

// 擲完那一行：擲到幾、落在哪、爬了還是滑了，加推薦下一格。
export function rollResultHTML(S) {
  const r = S.lastRoll; if (!r) return "";
  let s = T("board.rolled", { r: r.rolled, l: r.landed });
  if (r.kind === "ladder" && r.goes_to) s += T("board.ladder", { t: r.to_pos });
  else if (r.kind === "snake" && r.goes_to) s += T("board.snake", { t: r.to_pos });
  else if (r.to_pos !== r.landed) s += T("board.stop", { t: r.to_pos });
  const sq = squareAt(S, r.to_pos);
  const t = sq && sq.kind === "task" ? taskOf(S, sq.task_id) : null;
  const suggest = t && !S.stamps[t.id]
    ? `<div class="bsuggest">${T("board.suggest", { t: esc(t.title_zh || t.title_en) })} <button class="btn ghost sm" data-act="open" data-id="${esc(t.id)}">${T("board.goStamp")}</button></div>` : "";
  return `<div class="bresult" role="status">${s}。${suggest}</div>`;
}

export function boardPageHTML(S) {
  const size = S.board ? S.board.size : 0;
  const my = myStanding(S);
  const pos = S.animPos != null ? S.animPos : my.pos;
  const finished = my.pos >= size;
  const lastSq = squareAt(S, size);
  const lastTask = lastSq && lastSq.kind === "task" ? taskOf(S, lastSq.task_id) : null;
  const waiting = !finished && my.pos === size - 1 && lastTask && !S.stamps[lastTask.id];
  const others = (S.positions || []).filter(p => !S.profile || p.user_id !== S.profile.id).map(p => {
    const who = (S.wall || []).find(w => w.id === p.user_id) || {};
    return { user_id: p.user_id, pos: p.pos, me: false, name: namesOf(who).name, avatar: who.avatar || null, pawn: p.pawn || null };
  });
  const mine = { user_id: "me", pos, me: true, name: S.profile ? namesOf(S.profile).name : T("board.me"), avatar: S.profile && S.profile.avatar, pawn: S.profile && S.profile.pawn };
  // S.flying：棋子正沿著蛇或梯飛（main.js 用另一顆浮在上面的棋子畫），格子裡先不畫我。
  const pawns = S.sample || S.flying ? others : others.concat([mine]);
  const needPick = !S.sample && S.profile && !S.profile.pawn && !S.pawnSkipped;
  const canRoll = !S.sample && !S.rolling && my.tickets > 0 && !finished;
  const btnText = S.rolling ? T("board.rolling") : finished ? T("board.finished") : my.tickets > 0 ? T("board.roll") : T("board.noTicket");
  return `<div class="mhead bhead">
      <div class="mnum">${String(size).padStart(2, "0")}</div>
      <div class="mzh">${T("board.title")}</div>
      <div class="mtheme"><b>${my.pos >= size ? esc(T("board.finished")) : my.pos ? esc(T("board.pos", { n: my.pos })) : esc(T("board.atStart"))}</b><span>${esc(T("board.sub"))}</span></div>
    </div>
    <div class="bbar">
      ${diceHTML(S.lastRoll ? S.lastRoll.rolled : 6, !!S.rolling)}
      <div class="btix"><b>${esc(T("board.tickets", { n: my.tickets }))}</b></div>
      <button class="btn" data-act="roll"${canRoll ? "" : " disabled"}>${esc(btnText)}</button>
    </div>
    ${needPick ? pawnPickerHTML(null, true) : ""}
    ${waiting ? `<div class="bresult">${T("board.waiting", { t: esc(lastTask.title_zh || lastTask.title_en) })}</div>` : rollResultHTML(S)}
    ${boardGridHTML(S, pawns, { lit: S.lastRoll ? S.lastRoll.to_pos : null, sample: !!S.sample })}
    <div class="blegend">${SLOT_ORDER.map(c => `<span class="c-${toneOf(c)}">${esc(T(CATEGORY[c].short))}</span>`).join("")}<span class="ladder">${esc(T("board.legendLadder"))}</span><span class="snake">${esc(T("board.legendSnake"))}</span></div>
    <div class="wnote" style="margin-top:14px">${esc(S.sample ? T("board.sampleNote") : T("board.rules"))}</div>`;
}

export function guideCardsHTML() {
  return `<div class="slots guide">${SLOT_ORDER.map(c => {
    const g = CATEGORY[c];
    return `<div class="slot">
      <span class="cat">${esc(T(g.label))}</span>
      <span class="ttl">${esc(T(g.define))}</span>
      <span class="hint">${esc(T(g.body))}</span>
    </div>`;
  }).join("")}</div>`;
}

export function guidePageHTML() {
  return `<div class="mhead solo"><div class="mzh">${T("guide.title")}</div></div>
    ${guideCardsHTML()}
    <div class="wnote" style="margin-top:22px">${T("guide.note")}</div>`;
}

export function wallHTML(S) {
  if (S.wallLoading) return `<div class="wall"><div class="empty">${T("wall.loading")}</div></div>`;
  if (S.wallError) return `<div class="wall">
    <h3>${T("wall.title")}</h3>
    <div class="empty">${T("wall.error", { own: S.staff ? "" : T("wall.errorOwn") })}</div>
    <div class="row" style="margin-top:20px"><button class="btn ghost sm" data-act="refresh">${T("wall.refresh")}</button></div>
  </div>`;
  const total = S.tasks.length;
  const people = (S.wall || []).map(p => Object.assign({}, p, { count: (p.intern_stamps || []).length }))
    .sort((a, b) => b.count - a.count);
  const feed = [];
  people.forEach(p => (p.intern_stamps || []).forEach(s => feed.push({ who: p, id: s.task_id, d: s.stamped_on })));
  feed.sort((a, b) => a.d < b.d ? 1 : a.d > b.d ? -1 : 0);
  const cats = SLOT_ORDER.filter(c => S.tasks.some(t => t.category === c));

  // 棋盤開著：牆的最上面是大家的棋子在同一張棋盤上，旁邊一排名次（位置優先，章數其次）。
  let boardPart = "";
  if (S.board && people.length) {
    const rowOf = id => (S.positions || []).find(x => x.user_id === id) || {};
    const posOf = id => rowOf(id).pos || 0;
    const pawns = people.map(p => ({ user_id: p.id, pos: posOf(p.id), me: !!(S.profile && p.id === S.profile.id), name: namesOf(p).name, avatar: p.avatar, pawn: rowOf(p.id).pawn || null }));
    const rank = people.slice().sort((a, b) => posOf(b.id) - posOf(a.id) || b.count - a.count);
    boardPart = `<h3>${T("wall.board")}</h3>
      <div class="wboard">${boardGridHTML(S, pawns, { sample: true })}
      <div><div class="wwho">${esc(T("wall.who"))}</div>
      <ol class="wrank">${rank.map(p => `<li>${pawnHTML(pawns.find(x => x.user_id === p.id))}<div><b>${nameHTML(p)}</b><span>${posOf(p.id) >= S.board.size ? esc(T("wall.rankDone")) : esc(T("wall.rank", { n: posOf(p.id) }))}・${p.count} / ${total}</span></div></li>`).join("")}</ol></div></div>`;
  }

  return `<div class="wall">
    <h3>${T("wall.title")}</h3>
    <div class="wnote">${T("wall.note")}</div>
    ${boardPart}
    ${people.length === 0 ? `<div class="empty">${T("wall.empty")}</div>` :
      `<div class="people">${people.map(p => {
        const on = new Set((p.intern_stamps || []).map(s => s.task_id));
        const av = p.avatar
          ? `<img src="${esc(p.avatar)}" alt="" style="width:34px;height:34px;border-radius:50%;object-fit:cover;float:right;border:1px solid rgba(16,42,134,.2)">`
          : "";
        return `<div class="person">
          ${av}
          <b>${nameHTML(p)}</b>
          <span class="team">${esc((S.term && S.term.title_en) || "")}</span>
          <div class="track" style="grid-template-columns:repeat(${cats.length || 1},1fr)">${cats.map(c => {
            const acts = S.tasks.filter(t => t.category === c);
            const got = acts.filter(t => on.has(t.id)).length;
            const op = got === 0 ? 1 : (0.34 + 0.66 * got / acts.length);
            return `<i data-on="${got > 0 ? 1 : 0}" style="opacity:${op.toFixed(2)}" title="${esc(T(CATEGORY[c].zh))} ${got}/${acts.length}"></i>`;
          }).join("")}</div>
          <div class="cnt">${p.count || 0} / ${total}</div>
        </div>`;
      }).join("")}</div>`}
    ${feed.length ? `<div class="feed"><h3>${T("wall.recent")}</h3>
      ${feed.slice(0, 20).map(f => {
        const a = S.tasks.find(x => x.id === f.id);
        return `<div class="fitem"><time>${esc(f.d)}</time><span>${T("wall.stamped", { who: nameHTML(f.who), what: a ? esc(a.title_zh) : esc(f.id) })}</span></div>`;
      }).join("")}</div>` : ""}
    <div class="row" style="margin-top:20px"><button class="btn ghost sm" data-act="refresh">${T("wall.refresh")}</button></div>
  </div>`;
}

// 文案逐字照 spec §8.1，不加任何人的名字或私人聯絡方式。
export function downHTML() {
  return `<div class="card">
    <img src="../shared/logo.png" alt="Beyond Taiwan" style="height:30px;display:block;margin-bottom:18px">
    <h2>${T("down.title")}</h2>
    <div class="wnote" style="margin:16px 0 0">
      ${T("down.lede")}
    </div>
    <div class="row" style="margin-top:18px"><button class="btn ghost" data-act="retry">${T("common.retry")}</button></div>
  </div>`;
}

// 升級成 intern 之後、還沒填名字之前停在這一頁。沒有 team 那一格：intern 不屬於任何 team。
// 2026-11-06 自動儲存：第一次領護照（還沒有名字）留「領護照」那顆鈕，按下去畫面整個換掉（boot() 重讀）；
// 已經有名字、從資料頁按「編輯資料」進來的，每一格改了就存（data-autosave="issue"），旁邊留一顆「回到護照」。
export function setupHTML(p, user) {
  p = p || {};
  const editing = !!(p.name_zh || p.name_en);
  return `<div class="card">
    <img src="../shared/logo.png" alt="Beyond Taiwan" style="height:30px;display:block;margin-bottom:18px">
    <h2>${editing ? T("setup.edit") : T("setup.claim")}</h2>
    <div class="sub">${editing ? T("setup.editSub") : T("setup.claimSub")}</div>
    <div${editing ? ` data-autosave="issue" data-id="${esc(p.id || "")}"` : ""}>
    <label><i>${T("setup.nameZh")}</i><input id="fz" name="name_zh" value="${esc(p.name_zh || "")}" placeholder="王小明" maxlength="20"></label>
    <label><i>${T("setup.nameEn")}</i><input id="fe" name="name_en" value="${esc(p.name_en || "")}" placeholder="Ming Wang" maxlength="30"></label>
    <label><i>${T("setup.motto")}</i><textarea id="fm" name="motto" maxlength="60" placeholder="${esc(T("setup.mottoPh"))}">${esc(p.motto || "")}</textarea></label>
    </div>
    <div class="wnote" style="margin:0 0 16px">${T("setup.note")}</div>
    <div class="row">
      ${editing
        ? `${autosaveHint("issue")}<button class="btn ghost" data-act="cancel">${T("setup.done")}</button>`
        : `<button class="btn" data-act="issue">${T("setup.claimBtn")}</button>`}
      ${user ? `<button class="btn ghost sm" data-act="signout" style="margin-left:auto">${T("common.signout")}</button>` : ""}
    </div>
  </div>`;
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
    if (!box || box === root) return;   // 不在任何存檔框裡（例如找名字的搜尋框）就不存；root 自己也掛著 data-autosave="1"
    let d = timers.get(box);
    if (!d) { d = debounce(f => run(box, f), TYPED_MS); timers.set(box, d); }
    if (now) d.flush(field); else d(field);
  };
  root.addEventListener("input", e => { const m = saveMode(e.target); if (m === "typed") schedule(e.target, false); });
  root.addEventListener("change", e => { const m = saveMode(e.target); if (m === "now") schedule(e.target, true); else if (m === "typed") schedule(e.target, true); });
  root.addEventListener("focusout", e => { const m = saveMode(e.target); if (m === "typed") { const d = timers.get(e.target.closest("[data-autosave]")); if (d) d.flush(e.target); } });
}
