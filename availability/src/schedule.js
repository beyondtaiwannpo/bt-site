// 從看板排一場會（2026-11-02 活動與排程批 2）。純函式：吃狀態吐 HTML，不碰 DOM 也不碰網路。
// 勾出席的人那一塊是後台 membersAreaHTML 的精簡版（找名字、全勾、全取消、一人一列）；資料夾之間不 import，所以自己一份。
import { esc } from "./ui.js";
import { T } from "./strings.js";

export const SCOPE_BOARD = "board";
// 職級的兩個字母（跟後台成員區同一張表：CP SA DR AD AS）。
export const RANK_TAG = { president: "CP", senior_adviser: "SA", director: "DR", adviser: "AD", member: "AS" };
export const parseTeams = raw => String(raw || "").split(/[,、;；]/).map(s => s.trim()).filter(Boolean);
// 我能排哪些範圍：senior 全部（整個 BT 加六個 team）；其他人是自己資源工作區「管」的那幾個 team。ws 是 my_access() 回的 { 工作區: 等級 }。
export function scopesFor(senior, ws, teams) {
  if (senior) return [SCOPE_BOARD].concat(teams || []);
  return Object.entries(ws || {}).filter(([id, lv]) => id.startsWith("res:") && lv === "manage").map(([id]) => id.slice(4));
}
export function shown(members, q) {
  const s = String(q || "").trim().toLowerCase();
  return (members || []).filter(m => !s || String(m.name || "").toLowerCase().includes(s) || String(m.alt || "").toLowerCase().includes(s));
}
// sch = { scope, title, minutes, agenda, doc, ticked: [id…], q, msg }。ctx = { scopes, members, free: [id…], when }
export function scheduleHTML(sch, ctx, busy) {
  const d = Object.assign({ scope: ctx.scopes[0] || SCOPE_BOARD, title: "", minutes: 60, agenda: "", doc: "", ticked: [], q: "" }, sch || {});
  const dis = busy ? " disabled" : "";
  const ticked = new Set(d.ticked);
  const list = shown(ctx.members, d.q);
  // 一列：☑ 中文名 (English) · 職級標 · team 淡字（· 有空），全部同一行、靠左，跟後台的成員區一樣。
  const row = m => `<label class="check sch-row"><input type="checkbox" name="sch-member" value="${esc(m.id)}" data-act="sch-tick"${ticked.has(m.id) ? " checked" : ""}${dis}><b>${esc(m.name)}</b>${m.alt ? `<span class="alt">${esc(m.alt)}</span>` : ""}<span class="rk">${RANK_TAG[m.board_role] || "AS"}</span>${parseTeams(m.team).map(t => `<span class="mini">${esc(t.replace(/\s*Team$/i, ""))}</span>`).join(" ")}${ctx.free.includes(m.id) ? `<span class="mini free">${T("sch.isFree")}</span>` : ""}</label>`;
  return `<div class="sch" id="sch">
    <h3>${T("sch.title")}</h3>
    <div class="sub">${esc(ctx.when)}</div>
    <div class="two">
      <label><i>${T("sch.scope")}</i><select id="sch-scope"${dis}>${ctx.scopes.map(s => `<option value="${esc(s)}"${d.scope === s ? " selected" : ""}>${esc(s === SCOPE_BOARD ? T("sch.board") : s.replace(/\s*Team$/i, ""))}</option>`).join("")}</select></label>
      <label><i>${T("sch.minutes")}</i><select id="sch-minutes"${dis}>${[30, 60, 90, 120].map(n => `<option value="${n}"${+d.minutes === n ? " selected" : ""}>${n}</option>`).join("")}</select></label>
      <label><i>${T("sch.evTitle")}</i><input id="sch-title" value="${esc(d.title)}" placeholder="${esc(T("cal.title"))}"${dis}></label>
      <label><i>${T("sch.doc")}</i><input id="sch-doc" value="${esc(d.doc)}" placeholder="https://docs.google.com/…"${dis}></label>
      <label class="wide"><i>${T("sch.agenda")}</i><input id="sch-agenda" value="${esc(d.agenda)}" placeholder="${esc(T("sch.agendaPh"))}"${dis}></label>
    </div>
    <div class="sch-who"><i>${T("sch.who", { n: d.ticked.length })}</i>
      <div class="row"><input id="sch-q" value="${esc(d.q)}" placeholder="${esc(T("sch.find"))}" autocomplete="off" data-act="sch-q"${dis}>
        <button type="button" class="btn ghost sm" data-act="sch-all"${dis}>${T("sch.all")}</button>
        <button type="button" class="btn ghost sm" data-act="sch-none"${dis}>${T("sch.none")}</button></div>
      <div class="sch-list">${list.length ? list.map(row).join("") : `<div class="empty sm">${T("pk.nobody")}</div>`}</div>
    </div>
    ${d.msg ? `<div class="wnote err">${esc(d.msg)}</div>` : ""}
    <div class="row">
      <button class="btn" data-act="sch-send"${dis || !d.ticked.length ? " disabled" : ""}>${busy ? T("common.saving") : T("sch.send", { n: d.ticked.length })}</button>
      <button class="btn ghost" data-act="sch-cancel"${dis}>${T("common.cancel")}</button>
    </div>
    <div class="wnote">${T("sch.note")}</div>
  </div>`;
}
// 回覆那一塊（信裡的連結帶 ?meeting=<id> 進來）。m = { id, title, scope, starts_at, ends_at, agenda, doc_url, my_status }，when 是照我時區印好的字。
export function rsvpHTML(m, when, calUrl, icsHref, busy) {
  const dis = busy ? " disabled" : "";
  const st = m.my_status || "invited";
  return `<section class="rsvp" id="rsvp">
    <h3>${esc(m.title)}</h3>
    <div class="sub">${esc(m.scope === SCOPE_BOARD ? T("sch.board") : m.scope.replace(/\s*Team$/i, ""))}・${esc(when)}</div>
    ${m.agenda ? `<p>${esc(m.agenda)}</p>` : ""}
    ${m.doc_url ? `<p><a href="${esc(m.doc_url)}" target="_blank" rel="noopener">${T("rsvp.doc")}</a></p>` : ""}
    <div class="row">
      <button class="btn${st === "accepted" ? "" : " ghost"}" data-act="rsvp" data-v="accepted"${dis}>${T("rsvp.yes")}${st === "accepted" ? " ✓" : ""}</button>
      <button class="btn${st === "declined" ? "" : " ghost"}" data-act="rsvp" data-v="declined"${dis}>${T("rsvp.no")}${st === "declined" ? " ✓" : ""}</button>
      <a class="btn ghost sm" href="${esc(calUrl)}" target="_blank" rel="noopener">${T("pk.gcal")}</a>
      <a class="btn ghost sm" href="${esc(icsHref)}" download="meeting.ics">${T("rsvp.ics")}</a>
      <button class="btn quiet sm" data-act="rsvp-close">${T("pk.close")}</button>
    </div>
  </section>`;
}
