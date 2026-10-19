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
      </div>
    </div>
    ${total > 0 && done === total ? `<div class="overprint" style="position:static;display:inline-block;margin-top:22px;transform:rotate(-3deg)">${total} / ${total} · FULL</div>` : ""}
    ${S.sample
      ? `<div class="row" style="margin-top:18px"><span class="mini">${T("id.sampleNote")}</span></div>`
      : `<div class="row" style="margin-top:18px"><button class="btn ghost sm" data-act="edit">${T("id.edit")}</button></div>`}`;
}

function stampInner(act, st, extraClass) {
  const ink = act.category === "project" ? "ink-fill" : "ink-navy";
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
      <div class="mtheme"><b>${done} / ${acts.length}</b><span>${esc(g.define)}</span></div>
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

// 棋盤本體。pawns = [{ user_id, pos, me, name, avatar }]。
export function boardGridHTML(S, pawns, opts) {
  const size = S.board ? S.board.size : 0;
  if (!size) return "";
  const o = opts || {};
  const byPos = {};
  for (const p of pawns || []) { (byPos[p.pos] = byPos[p.pos] || []).push(p); }
  const pawn = p => p.avatar
    ? `<img class="pawn${p.me ? " me" : ""}" src="${esc(p.avatar)}" alt="${esc(p.name)}" title="${esc(p.name)}">`
    : `<span class="pawn${p.me ? " me" : ""}" title="${esc(p.name)}">${esc(String(p.name || "?").trim().slice(0, 1))}</span>`;
  const cell = pos => {
    const sq = squareAt(S, pos);
    const kind = sq ? sq.kind : "plain";
    const t = sq && sq.kind === "task" ? taskOf(S, sq.task_id) : null;
    const done = t && S.stamps && S.stamps[t.id];
    const here = byPos[pos] || [];
    const lit = o.lit === pos;
    let label = "";
    if (kind === "ladder") label = `<span class="sk">↑${esc(String(sq.goes_to))}</span>`;
    else if (kind === "snake") label = `<span class="sk">↓${esc(String(sq.goes_to))}</span>`;
    else if (t) label = `<span class="st${done ? " done" : ""}">${esc(t.title_zh || t.title_en)}</span>`;
    return `<div class="bq ${kind}${pos === size ? " finish" : ""}${lit ? " lit" : ""}${done ? " stamped" : ""}" data-pos="${pos}"${t && !o.sample ? ` data-act="open" data-id="${esc(t.id)}" role="button" tabindex="0"` : ""}>
      <span class="bn">${pos === size ? esc(T("board.finish")) : pos}</span>${label}
      ${here.length ? `<span class="pawns">${here.map(pawn).join("")}</span>` : ""}
    </div>`;
  };
  const start = byPos[0] || [];
  return `<div class="bwrap"><div class="bgrid" style="grid-template-columns:repeat(${BOARD_PER_ROW},1fr)">${
    boardRows(size).map(r => r.map(cell).join("")).join("")}</div>
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
    return { user_id: p.user_id, pos: p.pos, me: false, name: namesOf(who).name, avatar: who.avatar || null };
  });
  const pawns = S.sample ? others : others.concat([{ user_id: "me", pos, me: true, name: S.profile ? namesOf(S.profile).name : T("board.me"), avatar: S.profile && S.profile.avatar }]);
  const canRoll = !S.sample && !S.rolling && my.tickets > 0 && !finished;
  const btnText = S.rolling ? T("board.rolling") : finished ? T("board.finished") : my.tickets > 0 ? T("board.roll") : T("board.noTicket");
  return `<div class="mhead">
      <div class="mnum">${String(size).padStart(2, "0")}</div>
      <div class="mzh">${T("board.title")}</div>
      <div class="mtheme"><b>${my.pos >= size ? esc(T("board.finished")) : my.pos ? esc(T("board.pos", { n: my.pos })) : esc(T("board.atStart"))}</b><span>${esc(T("board.sub"))}</span></div>
    </div>
    <div class="bbar">
      ${diceHTML(S.lastRoll ? S.lastRoll.rolled : 6, !!S.rolling)}
      <div class="btix"><b>${esc(T("board.tickets", { n: my.tickets }))}</b></div>
      <button class="btn" data-act="roll"${canRoll ? "" : " disabled"}>${esc(btnText)}</button>
    </div>
    ${waiting ? `<div class="bresult">${T("board.waiting", { t: esc(lastTask.title_zh || lastTask.title_en) })}</div>` : rollResultHTML(S)}
    ${boardGridHTML(S, pawns, { lit: S.lastRoll ? S.lastRoll.to_pos : null, sample: !!S.sample })}
    <div class="blegend"><span class="task">${esc(T("board.legendTask"))}</span><span class="ladder">${esc(T("board.legendLadder"))}</span><span class="snake">${esc(T("board.legendSnake"))}</span></div>
    <div class="wnote" style="margin-top:14px">${esc(S.sample ? T("board.sampleNote") : T("board.rules"))}</div>`;
}

export function guideCardsHTML() {
  return `<div class="slots guide">${SLOT_ORDER.map(c => {
    const g = CATEGORY[c];
    return `<div class="slot">
      <span class="cat">${esc(T(g.label))}</span>
      <span class="ttl">${esc(g.define)}</span>
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
    const posOf = id => ((S.positions || []).find(x => x.user_id === id) || {}).pos || 0;
    const pawns = people.map(p => ({ user_id: p.id, pos: posOf(p.id), me: !!(S.profile && p.id === S.profile.id), name: namesOf(p).name, avatar: p.avatar }));
    const rank = people.slice().sort((a, b) => posOf(b.id) - posOf(a.id) || b.count - a.count);
    boardPart = `<h3>${T("wall.board")}</h3>
      <div class="wboard">${boardGridHTML(S, pawns, { sample: true })}
      <ol class="wrank">${rank.map(p => `<li><b>${nameHTML(p)}</b><span>${posOf(p.id) >= S.board.size ? esc(T("wall.rankDone")) : esc(T("wall.rank", { n: posOf(p.id) }))}・${p.count} / ${total}</span></li>`).join("")}</ol></div>`;
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
export function setupHTML(p, user) {
  p = p || {};
  return `<div class="card">
    <img src="../shared/logo.png" alt="Beyond Taiwan" style="height:30px;display:block;margin-bottom:18px">
    <h2>${p.name_zh || p.name_en ? T("setup.edit") : T("setup.claim")}</h2>
    <div class="sub">${p.name_zh || p.name_en ? T("setup.editSub") : T("setup.claimSub")}</div>
    <label><i>${T("setup.nameZh")}</i><input id="fz" value="${esc(p.name_zh || "")}" placeholder="王小明" maxlength="20"></label>
    <label><i>${T("setup.nameEn")}</i><input id="fe" value="${esc(p.name_en || "")}" placeholder="Ming Wang" maxlength="30"></label>
    <label><i>${T("setup.motto")}</i><textarea id="fm" maxlength="60" placeholder="${esc(T("setup.mottoPh"))}">${esc(p.motto || "")}</textarea></label>
    <div class="wnote" style="margin:0 0 16px">${T("setup.note")}</div>
    <div class="row">
      <button class="btn" data-act="issue">${p.name_zh || p.name_en ? T("common.save") : T("setup.claimBtn")}</button>
      ${p.name_zh || p.name_en ? `<button class="btn ghost" data-act="cancel">${T("common.cancel")}</button>` : ""}
      ${user ? `<button class="btn ghost sm" data-act="signout" style="margin-left:auto">${T("common.signout")}</button>` : ""}
    </div>
  </div>`;
}
