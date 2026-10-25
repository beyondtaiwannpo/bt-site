// 看板的畫面。**esc 是自己的一份**，不從 passport/ 或 app/ import
//（跟 app/ 同一條規矩：資料夾之間不互相依賴）。
import { labelOf } from "./tz-alias.js";
import { offsetLabel } from "./tz.js";
import { weekKeyOf, isPastWeek, weekKeyLabel } from "./weekkey.js";
// 2026-10-19 起畫面上的字全部從 ./strings.js 的字典來（T("鍵")），中英兩版並排在那一支裡。
import { T, lang, setLang } from "./strings.js";
export { T, lang, setLang };

export const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export const DAY_ZH = ["日", "一", "二", "三", "四", "五", "六"];
// 畫面上的星期（短、長）。DAY_ZH 留著當常數與測試的契約，畫面一律走這兩支。
export const dayShort = wd => T("day." + wd);
export const dayFull = wd => T("dayFull." + wd);
export const hhmm = m => String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");

// 一週的欄位順序。看板從星期一排到星期日（台灣人習慣），
// 但**儲存的 weekday 仍然是 0 = 星期日**（資料庫欄位註解寫著同一句）。
// 這個陣列就是那兩件事之間唯一的轉換點，不要在別的地方再轉一次。
export const COL_ORDER = [1, 2, 3, 4, 5, 6, 0];

// msg 一定要有地方畫。2026-09-02 加「只能往前看四週」時差點漏掉這件事：
// 設了 S.msg 卻沒有任何模板讀它，等於又做了一個「按了沒反應」的按鈕。
export function shellHTML(tab, inner, weekLabel, msg) {
  // 2026-09-04：logo 與「回入口」搬到 shared 的頂欄，這裡只剩看板內部的分頁與翻週。
  return `<div class="bar">
    <div class="tabs">
      <button data-act="tab" data-t="board" ${tab === "board" ? 'aria-current="true"' : ""}>${T("tab.board")}</button>
      <button data-act="tab" data-t="mine"  ${tab === "mine"  ? 'aria-current="true"' : ""}>${T("tab.mine")}</button>
      <button data-act="tab" data-t="who"   ${tab === "who"   ? 'aria-current="true"' : ""}>${T("tab.who")}</button>
    </div>
  </div>
  ${weekLabel ? `<div class="weeknav">
    <button class="btn ghost sm" data-act="week" data-d="-1">${T("week.prev")}</button>
    <b>${esc(weekLabel)}</b>
    <button class="btn ghost sm" data-act="week" data-d="1">${T("week.next")}</button>
    <button class="btn quiet sm" data-act="week" data-d="0">${T("week.this")}</button>
  </div>` : ""}
  ${msg ? `<div class="wnote" style="margin-bottom:12px">${esc(msg)}</div>` : ""}
  ${inner}`;
}

// ── 知情同意（規格 §4-5 第 3 點）─────────────────────────────────────
// **這一頁擋在編輯器前面，按了確認才寫 notice_seen_at。**
// 打開頁面就記的話，「他看過了」這件事會變成假的 —— 而這是這個功能
// 唯一的知情同意：看板會把三十個人的完整作息表送進每一個幹部的瀏覽器。
//
// ⚠ **msg 一定要畫出來。** 2026-09-02 的第一版沒有這個參數，於是存檔失敗時
// render() 畫出一模一樣的畫面 —— 使用者按了沒反應，只會再按一次、按五次、
// 然後關掉。這跟邀請碼那一輪學到的是同一件事：**失敗一定要說話。**
export function noticeHTML(msg, busy) {
  return `<div class="card">
    <h2>${T("n.title")}</h2>
    <div class="sub">${T("n.sub")}</div>
    ${msg ? `<div class="wnote big">${esc(msg)}</div>` : ""}
    <div class="wnote big">${T("n.body")}</div>
    <p>${T("n.p1")}</p>
    <p>${T("n.p2")}</p>
    <div class="row">
      <button class="btn" data-act="notice-ok" ${busy ? "disabled" : ""}>${busy ? T("n.busy") : T("n.ok")}</button>
      <a class="btn ghost" href="../app/">${T("n.no")}</a>
    </div>
  </div>`;
}

// ── 時區設定 ────────────────────────────────────────────────────────
// 沒設時區就不讓填（設計提案裡使用者核可的）。**不給預設值** ——
// 猜錯的話他整週的時間會被安靜地畫到別的地方，而畫面看起來完全正常。
export function tzSetupHTML(guess, q, results, msg) {
  return `<div class="card">
    <h2>${T("tz.title")}</h2>
    <div class="sub">${T("tz.sub")}</div>
    ${msg ? `<div class="wnote">${esc(msg)}</div>` : ""}
    ${guess ? `<div class="wnote">${T("tz.guess", { place: esc(labelOf(guess)) })}
      <button class="btn sm" data-act="tz-pick" data-tz="${esc(guess)}">${T("tz.here")}</button></div>` : ""}
    <label><i>${T("tz.search")}</i>
      <input id="tzq" value="${esc(q || "")}" autocomplete="off" autocapitalize="off"
             autocorrect="off" spellcheck="false" placeholder="${esc(T("tz.searchPh"))}"></label>
    <div class="tzlist">${
      (results || []).map(r =>
        `<button class="tzitem" data-act="tz-pick" data-tz="${esc(r.tz)}">
           <b>${esc(r.label)}</b><span>${esc(r.tz)}</span></button>`).join("")
      || (q ? `<div class="empty sm">${T("tz.none", { q: esc(q) })}</div>` : "")
    }</div>
  </div>`;
}

// ── 團隊看板 ────────────────────────────────────────────────────────
// counts: Map("dayIndex:minute" → [memberId]）；viewerTz 只用來顯示欄位標題。
// profiles.team 存的是一串用逗號隔開的 team 名字（2026-09-10，一個人可以在好幾個）。
// **同一份規則在 settings/src/ui.js 與另外兩個資料夾也各有一份**
// （資料夾之間不互相 import）。test/teams.test.mjs 拿同一張輸入表比對三份。
// 全形逗號與頓號也吃：那是中文輸入法打出來的，而使用者不會知道差別。
export function parseTeams(raw) {
  const out = [];
  for (const part of String(raw || "").split(/[,、;；]/)) {
    const t = part.trim().replace(/\s+/g, " ");
    if (t && !out.includes(t)) out.push(t);
  }
  return out;
}

// ── team 篩選（2026-09-10）──────────────────────────────────────────
// Paul：「團隊看板那邊選一個 team 就可以只看到這個 team 的所有人」。
//
// ⚠ **選項是從名單本身長出來的，不是一份寫死的清單。**
// 寫死的話，team 欄位不在清單裡的人（舊資料、打錯字、之後新增的組）
// 就會整個從畫面上消失 —— 而那正是這一頁最不能發生的事：
// 看不到的人不會被催。從資料長出來的話，最糟也只是多一個選項。
//
// 同一個 team 的大小寫或前後空白不同會變成兩個選項。那是刻意不在這裡收斂的：
// 真正的修法是讓大家選不是打（/settings/ 2026-09-10 改成選單了），
// 而在這裡偷偷合併會讓「有人填錯了」這件事再也看不見。
export function teamsOf(members) {
  const seen = [];
  for (const m of members || []) {
    // 一個人可以在好幾個 team，每一個都要出現在選項裡。
    for (const t of parseTeams(m.team)) if (!seen.includes(t)) seen.push(t);
  }
  return seen.sort((a, b) => a.localeCompare(b, "en"));
}

// 選了不存在的 team（例如那個人剛改了 team）時回全部，不是回空的 ——
// 空白畫面看起來是壞掉，不是「這個 team 沒有人」。
export function filterByTeam(members, team) {
  if (!team) return members;
  const hit = (members || []).filter(m => parseTeams(m.team).includes(team));
  return hit.length ? hit : members;
}

// V.allTeams 與 V.team 由 main.js 給（見那邊 view() 的註解）。
// 只有一個 team 的時候不畫 —— 一顆按不出差別的按鈕比沒有按鈕糟。
export function teamFilterHTML(V) {
  const teams = V.allTeams || [];
  if (teams.length < 2) return "";
  const chip = (val, label) =>
    `<button class="chip${(V.team || "") === val ? " on" : ""}" data-act="team" data-team="${esc(val)}"
      aria-pressed="${(V.team || "") === val}">${esc(label)}</button>`;
  return `<div class="chips teamfilter">${chip("", T("tf.all"))}${
    teams.map(t => chip(t, t.replace(/\s*Team$/i, ""))).join("")}</div>`;
}

export function boardHTML(S, counts, dates) {
  const total = S.members.filter(m => m.tz).length;
  // ⚠ **空的看板要說話。** 一片空白同時可能是三件事：沒有人填、沒有人設時區、
  // 或者大家真的都沒空。三者長得一模一樣，而使用者只會得到「壞了」這個結論。
  // 2026-09-02 咬過一次類似的：格子其實畫出來了，只是在畫面外。
  const filled = S.members.filter(m => (S.slots.get(m.id) || new Set()).size > 0).length;
  const notice = counts.size === 0 ? `<div class="wnote big">${T("b.empty")}${
      total === 0 ? T("b.noTz")
    : filled === 0 ? T("b.noFill")
    : T("b.noMatch")
    }</div>` : "";
  const rows = [];
  for (let min = 0; min < 1440; min += 30) {
    const cells = COL_ORDER.map((_, col) => {
      const who = counts.get(col + ":" + min) || [];
      const lv = !who.length ? 0 : Math.min(4, Math.ceil(who.length / Math.max(1, total) * 4));
      return `<td><button class="cell lv${lv}" data-act="peek" data-c="${col}" data-m="${min}"
        aria-label="${T("b.cellAria", { t: esc(hhmm(min)), n: who.length })}">${who.length || ""}</button></td>`;
    }).join("");
    rows.push(`<tr><th class="hr">${min % 60 === 0 ? esc(hhmm(min)) : ""}</th>${cells}</tr>`);
  }
  return `${teamFilterHTML(S)}${notice}<div class="gridwrap"><table class="grid">
    <thead><tr><th></th>${COL_ORDER.map((wd, i) =>
      `<th>${esc(dayShort(wd))}<span>${esc(dates[i] || "")}</span></th>`).join("")}</tr></thead>
    <tbody>${rows.join("")}</tbody></table></div>
    <div class="wnote" style="margin-top:14px">${T("b.note")}</div>`;
}

// ctx: { free, dayLabel, minute, lines, calUrl, title, copyMsg }
// 參數包成一個物件而不是排成一列：這一頁的參數已經七個了，排成一列的話
// 呼叫端漏傳或順序錯都不會報錯，只會靜靜地畫錯東西。
export function peekHTML(S, ctx) {
  const busy = S.members.filter(m => m.tz && !ctx.free.includes(m.id));
  const noTz = S.members.filter(m => !m.tz);
  return `<div class="scrim" data-act="close-peek"><div class="modal">
    <button class="x" data-act="close-peek" aria-label="${esc(T("pk.close"))}">✕</button>
    <h3>${esc(ctx.dayLabel)} ${esc(hhmm(ctx.minute))}</h3>
    <div class="sub">${T("pk.free", { n: ctx.free.length })}</div>
    <div class="two">
      <div><i>${T("pk.freeCol")}</i>${ctx.free.length
        ? `<ul>${ctx.free.map(id => `<li>${nameHTML(memberOf(S, id))}</li>`).join("")}</ul>`
        : `<div class="empty sm">${T("pk.nobody")}</div>`}</div>
      <div><i>${T("pk.busyCol")}</i>${busy.length
        ? `<ul class="dim">${busy.map(m => `<li>${nameHTML(m)}</li>`).join("")}</ul>`
        : `<div class="empty sm">${T("pk.nobody")}</div>`}</div>
    </div>
    ${noTz.length ? `<div class="wnote">${T("pk.noTz", { n: noTz.length, names: esc(noTz.map(m => m.name).join(T("punct.list"))) })}</div>` : ""}

    <div class="times">
      <i>${T("pk.local")}</i>
      <pre id="times">${ctx.lines.map(t => esc(t)).join("\n")}</pre>
      <div class="row">
        <button class="btn ghost sm" data-act="copy-times">${T("pk.copy")}</button>
        <span class="mini">${esc(ctx.copyMsg || "")}</span>
      </div>
    </div>

    <label style="margin-top:16px"><i>${T("pk.eventTitle")}</i>
      <input id="evtitle" value="${esc(ctx.title)}" autocomplete="off"></label>
    <div class="row">
      <!-- 用 <a> 不用 <button>：長按與中鍵開新分頁才會有作用。
           標題改的時候由 main.js 直接改這個 href。 -->
      <a class="btn" id="callink" href="${esc(ctx.calUrl)}" target="_blank" rel="noopener">${T("pk.gcal")}</a>
      ${ctx.canSchedule && !ctx.schedule ? `<button class="btn ghost" data-act="sch-open">${T("sch.open")}</button>` : ""}
      <button class="btn ghost" data-act="close-peek">${T("pk.close")}</button>
    </div>
    ${ctx.schedule || ""}
    <div class="wnote" style="margin-top:12px">${T("pk.note")}</div>
  </div></div>`;
}

const nameOf = (S, id) => (S.members.find(m => m.id === id) || {}).name || id;

// 名字要中英文都出現。**只在一行放得下的地方用這個** ——
// 成員清單與彈窗的兩欄名單都是一人一行，放得下；
// 而「還沒設定時區的是這幾個人」那一句是用頓號串起來的句子，
// 兩個名字串進去會變成一團讀不出來的字，那裡維持只印主要的名字。
function nameHTML(m) {
  if (!m) return "";
  return esc(m.name) + (m.alt ? `<span class="alt">${esc(m.alt)}</span>` : "");
}
const memberOf = (S, id) => S.members.find(m => m.id === id) || { name: id, alt: "" };

// ── 我的每週時間 ────────────────────────────────────────────────────
// **批次填寫排在格線前面，而且是預設看得到的那一塊。**
// 規格 §4-3 B：拖曳塗一百個格子在手機上不可行，這點已經實測過。
// 格線留著給微調用，不是主要的填法。
// 2026-09-12 加「某一週」模式：平常的每週固定時間之外，
// 可以為看板目前正在看的那一週（S.weekStart）單獨蓋掉一次，不影響其他週。
// mineMode 沒有值就當 "usual" —— main.js 2026-09-12 接線完成，兩種模式都會傳。
export function mineHTML(S) {
  const week = S.mineMode === "week";
  const wk = week ? weekKeyOf(S.weekStart, S.myTz) : null;
  // 過去的週不能改：格線一起不畫（見下面 past ? ... : batchAndGrid），
  // 儲存鈕也要跟著不畫——不然那一週沒有任何可以點的格子，
  // 按了儲存不會有任何事發生，「按了沒反應」正是這一頁反覆出現的症狀
  // （controller 2026-09-12 裁定，見下面 row sticky 那一段）。
  const past = week && isPastWeek(wk, new Date(), S.myTz);
  // 兩種模式共用同一段畫格子與批次工具的程式碼，只有這裡切資料來源：
  // 平常模式讀 S.mine，某一週模式讀 S.weekMine。
  const grid = week ? S.weekMine : S.mine;

  const opts = [];
  for (let m = 0; m <= 1440; m += 30) opts.push(m);
  // 選單的值從 S 來，不是寫死的 —— 重畫之後使用者剛選的時段要還在，
  // 不然他每加一段就得重選一次，那在手機上就是放棄的理由。
  const sel = (id, val) => `<select id="${id}">${opts.filter(m => m < 1440 || id === "bto")
    .map(m => `<option value="${m}"${m === val ? " selected" : ""}>${m === 1440 ? "24:00" : hhmm(m)}</option>`).join("")}</select>`;

  const batchAndGrid = `<div class="batch">
      <div class="brow">
        <i>${T("mn.slot")}</i>${sel("bfrom", S.bfrom)} <span>${T("mn.to")}</span> ${sel("bto", S.bto)}
      </div>
      <div class="brow">
        <i>${T("mn.days")}</i>
        <div class="chips">${COL_ORDER.map(wd => {
          const on = S.chips.has(wd);
          return `<button class="chip${on ? " on" : ""}" data-act="chip" data-wd="${wd}"
            aria-pressed="${on}">${esc(dayShort(wd))}</button>`;
        }).join("")}</div>
      </div>
      <div class="brow">
        <i>${T("mn.quick")}</i>
        <button class="btn quiet sm" data-act="quick" data-q="weekday">${T("mn.weekday")}</button>
        <button class="btn quiet sm" data-act="quick" data-q="weekend">${T("mn.weekend")}</button>
        <button class="btn quiet sm" data-act="quick" data-q="all">${T("mn.all")}</button>
        <button class="btn quiet sm" data-act="quick" data-q="none">${T("mn.clear")}</button>
      </div>
      <div class="row">
        <button class="btn" data-act="apply" data-mode="add">${T("mn.add")}</button>
        <button class="btn ghost" data-act="apply" data-mode="del">${T("mn.del")}</button>
      </div>
    </div>

    <div class="brow copy">
      <i>${T("mn.copy")}</i>
      <select id="copyfrom">${COL_ORDER.map(wd =>
        `<option value="${wd}"${wd === S.copyFrom ? " selected" : ""}>${esc(dayFull(wd))}</option>`).join("")}</select>
      <span>${T("mn.copyTo")}</span>
      <button class="btn sm" data-act="copyday">${T("mn.copy")}</button>
    </div>

    <div class="gridwrap mine"><table class="grid">
      <thead><tr><th></th>${COL_ORDER.map(wd => `<th>${esc(dayShort(wd))}</th>`).join("")}</tr></thead>
      <tbody>${(() => {
        const rows = [];
        for (let min = 0; min < 1440; min += 30) {
          const cells = COL_ORDER.map(wd => {
            const on = grid.has(wd + ":" + min);
            return `<td><button class="cell ${on ? "on" : ""}" data-act="toggle"
              data-wd="${wd}" data-m="${min}" aria-pressed="${on}"
              aria-label="${T("mn.cellAria", { d: esc(lang() === "zh" ? DAY_ZH[wd] : dayFull(wd)), t: hhmm(min) })}"></button></td>`;
          }).join("");
          rows.push(`<tr><th class="hr">${min % 60 === 0 ? hhmm(min) : ""}</th>${cells}</tr>`);
        }
        return rows.join("");
      })()}</tbody></table></div>`;

  return `<div class="card">
    <h2>${week ? T("mn.titleWeek") : T("mn.titleUsual")}</h2>
    <div class="sub">${week
      ? T("mn.subWeek", { w: esc(weekKeyLabel(wk)) })
      : T("mn.subUsual")}</div>
    <div class="chips modeswitch">
      <button class="chip${week ? "" : " on"}" data-act="mine-mode" data-m="usual"
        aria-pressed="${!week}">${T("mn.modeUsual")}</button>
      <button class="chip${week ? " on" : ""}" data-act="mine-mode" data-m="week"
        aria-pressed="${week}">${T("mn.modeWeek")}</button>
    </div>
    ${week ? `<div class="row">
      <button class="btn quiet sm" data-act="week" data-d="-1">${T("mn.prevWeek")}</button>
      <button class="btn quiet sm" data-act="week" data-d="1">${T("mn.nextWeek")}</button>
    </div>` : ""}

    ${past ? `<div class="wnote big">${T("mn.past")}</div>` : batchAndGrid}

    ${week && S.weekMarksMine.size ? `<div class="wnote" style="margin-top:14px">
      ${T("mn.marked")}
      <ul class="wklist">${[...S.weekMarksMine].sort().map(k => {
        // 過去的週仍然要列出來（讓他知道自己設過哪幾週），但不能按 clear-week ——
        // 取消例外也是一種編輯，過去的週不能編輯是這一頁既有的規則（見上面 past 的說明），
        // I3（2026-09-12 總審查）：以前這裡對每一週都畫按鈕，過去的週也能按。
        const gone = isPastWeek(k, new Date(), S.myTz);
        return `<li>
        <span>${esc(weekKeyLabel(k))}</span>
        ${gone
          ? `<span class="mini">${T("mn.gone")}</span>`
          : `<button class="btn quiet sm" data-act="clear-week" data-w="${esc(k)}">${T("mn.revert")}</button>`}
      </li>`;
      }).join("")}</ul>
    </div>` : ""}

    <div class="row sticky">
      ${past ? "" : `<button class="btn" data-act="save" ${S.dirty ? "" : "disabled"}>${S.dirty ? T("mn.save") : T("mn.saved")}</button>`}
      ${week ? "" : `<button class="btn ghost sm" data-act="confirm-same">${T("mn.confirmSame")}</button>`}
      <span class="mini">${esc(S.mineMsg || "")}</span>
    </div>
    <div class="wnote" style="margin-top:14px">${T("mn.tz", { tz: esc(labelOf(S.myTz)) })}
      <button class="btn quiet sm" data-act="change-tz">${T("mn.change")}</button><br>
      ${T("mn.tzNote")}</div>
  </div>`;
}

// ── 成員清單 ────────────────────────────────────────────────────────
// 規格 §4-3 C：**這一區是讓看板活下去的關鍵**，沒有它就不知道該催誰。
// 所以「從沒填過」與「沒設時區」的人也要出現（使用者 2026-09-02 裁定）。
export function membersHTML(S, now) {
  const days = t => t == null ? null : Math.floor((now - new Date(t).getTime()) / 86400000);
  return `<div class="card">
    <h2>${T("mb.title")}</h2>
    <div class="sub">${T("mb.sub")}</div>
    ${teamFilterHTML(S)}
    <table class="who"><thead><tr><th>${T("mb.name")}</th><th>${T("mb.where")}</th><th>${T("mb.updated")}</th></tr></thead><tbody>
    ${S.members.map(m => {
      const d = days(m.updatedAt);
      const stale = d == null || d > 30;
      const filled = (S.slots.get(m.id) || new Set()).size;
      return `<tr class="${stale ? "stale" : ""}">
        <td>${nameHTML(m)}${m.team ? `<span class="team">${esc(m.team)}</span>` : ""}</td>
        <td>${m.tz
              ? `${esc(labelOf(m.tz))}<span class="team">${esc(offsetLabel(new Date(now), m.tz))}</span>`
              : `<span class="warn">${T("mb.noTz")}</span>`}</td>
        <td>${d == null ? `<span class="warn">${T("mb.never")}</span>`
              : `${T("mb.daysAgo", { d })}${d > 30 ? `<span class="warn">${T("mb.stale")}</span>` : ""}${filled ? "" : `<span class="warn">${T("mb.zero")}</span>`}`}</td>
      </tr>`;
    }).join("")}
    </tbody></table>
    <div class="wnote" style="margin-top:14px">${T("mb.note")}</div>
  </div>`;
}

export function downHTML() {
  return `<div class="card">
    <h2>${T("down.title")}</h2>
    <div class="wnote">${T("down.lede")}</div>
    <div class="row"><button class="btn ghost" data-act="retry">${T("common.retry")}</button></div>
  </div>`;
}

export function notCadreHTML() {
  return `<div class="card">
    <h2>${T("nc.title")}</h2>
    <div class="wnote">${T("nc.lede")}</div>
    <div class="row"><a class="btn ghost" href="../app/">${T("common.back")}</a></div>
  </div>`;
}
