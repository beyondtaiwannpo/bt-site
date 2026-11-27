// 從行事曆的某一天排一場會（2026-11-26）。以前在時間看板點一格打開的那一塊（availability/src/schedule.js）搬來這裡，
// 多了開始時間、留言兩格。純函式：吃狀態吐 HTML，不碰 DOM 也不碰網路。資料夾之間不 import，所以自己一份。
import { esc, hhmm, dateLabel } from "./ui.js";
import { T } from "./strings.js";
import { freeThrough, freeAny } from "./free.js";

export const SCOPE_BOARD = "board";
// 職級的兩個字母（跟後台成員區同一張表：CP SA DR AD AS）。
export const RANK_TAG = { president: "CP", senior_adviser: "SA", director: "DR", adviser: "AD", member: "AS" };
// profiles.team 是一串用逗號隔開的 team。**同一條規則另外三個資料夾各有一份**，test/teams.test.mjs 比對。
export function parseTeams(raw) {
  const out = [];
  for (const part of String(raw || "").split(/[,、;；]/)) {
    const t = part.trim().replace(/\s+/g, " ");
    if (t && !out.includes(t)) out.push(t);
  }
  return out;
}
// team 篩選的選項從名單長出來（不是寫死的清單），team 填錯的人才不會從畫面上消失。
export function teamsOf(members) {
  const seen = [];
  for (const m of members || []) for (const t of parseTeams(m.team)) if (!seen.includes(t)) seen.push(t);
  return seen.sort((a, b) => a.localeCompare(b, "en"));
}
export const inTeam = (members, team) => !team ? (members || []) : (members || []).filter(m => parseTeams(m.team).includes(team));
// 我能排哪些範圍：senior 全部（整個 BT 加每個 team）；其他人是自己在那個 team 是「改」以上的那幾個（跟資料庫的 can_schedule 同一條）。
export function scopesFor(senior, ws, teams) {
  if (senior) return [SCOPE_BOARD].concat(teams || []);
  return Object.entries(ws || {}).filter(([id, lv]) => id.startsWith("res:") && ["edit", "manage"].includes(lv)).map(([id]) => id.slice(4));
}
export const matches = (m, q) => { const s = String(q || "").trim().toLowerCase(); return !s || String(m.name || "").toLowerCase().includes(s) || String(m.alt || "").toLowerCase().includes(s); };

// 打開的時候先勾誰：整段時間都有空的人。
export const preTicked = (free, min, minutes) => freeThrough(free, min, minutes);

// 一個人在選的那一段時間：free 整段有空、part 一部分有空、busy 填了時間但這一段沒空、none 沒填過時間（或沒設時區，算不出來）。
// filled 是填過時間的人（Set）；沒給（還在讀）就只分得出有空、一部分有空，其他都不標。
export function statusOf(id, whole, part, filled) {
  if (whole.has(id)) return "free";
  if (part.has(id)) return "part";
  if (!filled) return "";
  return filled.has(id) ? "busy" : "none";
}
const MARK = { free: "sch.isFree", part: "sch.partFree", busy: "sch.busy", none: "sch.noTimes" };
// 「1 小時 30 分」。
export function lenText(minutes) {
  const h = Math.floor(minutes / 60), m = minutes % 60;
  return h && m ? T("sch.lenHM", { h, m }) : h ? T("sch.lenH", { h }) : T("sch.lenM", { m });
}
// 結束時間可以選的：開始之後每半小時，到那一天的 24:00 為止。
export const endChoices = min => { const out = []; for (let e = +min + 30; e <= 1440; e += 30) out.push(e); return out; };

// sch = { key, min, minutes, scope, required, title, agenda, message, doc, ticked: [id], q, msg }
// ctx = { key, rows: [{min, at}], free: Map, members, filled: Set | null, failed, scopes, now, today }
// 2026-11-27 Paul：「if I press the 8th, it just pop up to schedule a meeting… starts at 9 and then ends at what time, and then the length is automatically gonna appear」。
//   所以開始、結束兩格，長度自己算出來；日期也改得了；每一個人後面一個標，跟著選的時間變。
export function scheduleHTML(sch, ctx, busy) {
  const d = Object.assign({ key: ctx.key, min: 540, minutes: 60, scope: ctx.scopes[0] || SCOPE_BOARD, required: "1", title: "", agenda: "", message: "", doc: "", ticked: [], q: "" }, sch || {});
  const dis = busy ? " disabled" : "";
  const ticked = new Set(d.ticked);
  const whole = new Set(freeThrough(ctx.free, +d.min, +d.minutes)), part = new Set(freeAny(ctx.free, +d.min, +d.minutes));
  const filled = ctx.filled || null;
  const rank = { free: 0, part: 1, busy: 2, none: 3, "": 2 };
  // 有空的排前面，再來一部分有空、沒空、沒填，同一種照名字（名單本來就照名字排好）。
  const people = (ctx.members || []).slice().sort((a, b) => rank[statusOf(a.id, whole, part, filled)] - rank[statusOf(b.id, whole, part, filled)]);
  const now = ctx.now ? ctx.now.getTime() : 0;
  const seen = new Set();
  const starts = (ctx.rows || []).filter(r => !seen.has(r.min) && seen.add(r.min)).map(r =>
    `<option value="${r.min}"${+d.min === r.min ? " selected" : ""}${r.at.getTime() < now && +d.min !== r.min ? " disabled" : ""}>${hhmm(r.min)}</option>`).join("");
  const end = +d.min + +d.minutes;
  const ends = endChoices(d.min).map(e => `<option value="${e}"${e === end ? " selected" : ""}>${hhmm(e)}</option>`).join("");
  const row = m => { const st = statusOf(m.id, whole, part, filled);
    return `<label class="check sch-row"${matches(m, d.q) ? "" : " hidden"}><input type="checkbox" name="sch-member" value="${esc(m.id)}"${ticked.has(m.id) ? " checked" : ""}${dis}><b>${esc(m.name || T("common.noName"))}</b>${m.alt ? `<span class="alt">${esc(m.alt)}</span>` : ""}<span class="rk">${RANK_TAG[m.board_role] || "AS"}</span>${parseTeams(m.team).map(t => `<span class="mini">${esc(t.replace(/\s*Team$/i, ""))}</span>`).join(" ")}${st ? `<span class="mini ${st}">${T(MARK[st])}</span>` : ""}</label>`; };
  const n = d.ticked.length;
  const list = ctx.failed ? `<div class="wnote">${T("sch.failed")}</div>`
    : !ctx.members ? `<p class="mini">${T("day.loading")}</p>`
    : `${people.map(row).join("")}<div class="empty sm" id="sch-nobody"${people.some(m => matches(m, d.q)) ? " hidden" : ""}>${T("sch.nobody")}</div>`;
  return `<div class="scrim" data-act="sch-close"><div class="modal sch" id="sch-modal" role="dialog" aria-modal="true" aria-label="${esc(T("sch.title"))}" data-stop="1">
    <button type="button" class="x" data-act="sch-close" aria-label="${esc(T("m.close"))}">×</button>
    <h2>${T("sch.title")}</h2>
    <p class="sub">${esc(dateLabel(d.key))}・<button type="button" class="lnk" data-act="sch-day">${T("sch.dayView")}</button></p>
    <div class="when">
      <label class="dt"><i>${T("sch.date")}</i><input type="date" id="sch-key" data-sch="key" value="${esc(d.key)}"${ctx.today ? ` min="${esc(ctx.today)}"` : ""}${dis}></label>
      <label><i>${T("sch.start")}</i><select id="sch-min" data-sch="min"${dis}>${starts}</select></label>
      <label><i>${T("sch.end")}</i><select id="sch-end" data-sch="end"${dis}>${ends}</select></label>
      <p class="mini len" id="sch-len">${T("sch.len", { len: lenText(+d.minutes) })}</p>
    </div>
    <div class="two">
      <label><i>${T("sch.scope")}</i><select id="sch-scope" data-sch="scope"${dis}>${ctx.scopes.map(s => `<option value="${esc(s)}"${d.scope === s ? " selected" : ""}>${esc(s === SCOPE_BOARD ? T("sch.board") : s.replace(/\s*Team$/i, ""))}</option>`).join("")}</select></label>
      <label><i>${T("sch.required")}</i><select id="sch-required" data-sch="required"${dis}><option value="1"${d.required !== "0" ? " selected" : ""}>${T("sch.req1")}</option><option value="0"${d.required === "0" ? " selected" : ""}>${T("sch.req0")}</option></select></label>
      <label class="wide"><i>${T("sch.head")}</i><input id="sch-title" data-sch="title" maxlength="120" value="${esc(d.title)}" placeholder="${esc(T("sch.headPh"))}"${dis}></label>
      <label class="wide"><i>${T("sch.agenda")}</i><textarea id="sch-agenda" data-sch="agenda" rows="2" maxlength="2000" placeholder="${esc(T("sch.agendaPh"))}"${dis}>${esc(d.agenda)}</textarea></label>
      <label class="wide"><i>${T("sch.message")}</i><textarea id="sch-message" data-sch="message" rows="3" maxlength="2000" placeholder="${esc(T("sch.messagePh"))}"${dis}>${esc(d.message)}</textarea></label>
      <label class="wide"><i>${T("sch.doc")}</i><input id="sch-doc" data-sch="doc" value="${esc(d.doc)}" placeholder="https://docs.google.com/…"${dis}></label>
    </div>
    <div class="sch-who"><i id="sch-who-n">${T("sch.who", { n })}</i>
      <p class="mini sch-key"><span class="mini free">${T("sch.isFree")}</span> ${T("sch.keyFree")} <span class="mini part">${T("sch.partFree")}</span> ${T("sch.keyPart")} <span class="mini busy">${T("sch.busy")}</span> ${T("sch.keyBusy")} <span class="mini none">${T("sch.noTimes")}</span> ${T("sch.keyNone")}</p>
      <div class="row"><input id="sch-q" data-sch="q" value="${esc(d.q)}" placeholder="${esc(T("sch.find"))}" autocomplete="off"${dis}>
        <button type="button" class="btn ghost sm" data-act="sch-all"${dis}>${T("sch.all")}</button>
        <button type="button" class="btn ghost sm" data-act="sch-none"${dis}>${T("sch.none")}</button></div>
      <div class="sch-list">${list}</div>
    </div>
    ${d.msg ? `<div class="wnote err" role="alert">${esc(d.msg)}</div>` : ""}
    <div class="row">
      <button type="button" class="btn" id="sch-send" data-act="sch-send"${dis || !n ? " disabled" : ""}>${busy ? T("sch.sending") : T("sch.send", { n })}</button>
      <button type="button" class="btn ghost" data-act="sch-close"${dis}>${T("common.cancel")}</button>
    </div>
    <p class="mini">${T("sch.note")}</p>
  </div></div>`;
}
