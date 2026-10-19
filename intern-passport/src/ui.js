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

  return `<div class="wall">
    <h3>${T("wall.title")}</h3>
    <div class="wnote">${T("wall.note")}</div>
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
