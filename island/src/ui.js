// /island/ 畫面的純函式：吃資料與語言，吐 HTML 字串。不碰 DOM。
import { t } from "./strings.js";
import { label } from "./data.js";

export const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const L = (o, k, lang) => esc(o[k + "_" + lang] || o[k + "_zh"] || "");
const roleKey = r => ({ copresident: "roleCopresident", director: "roleDirector", advisor: "roleAdvisor", associate: "roleAssociate" }[r] || "roleAssociate");

// ── 右邊的清單：team 一列，底下做的事 ──
export function indexHTML(d, lang, selected) {
  const sel = selected || {};
  return `<ol class="tree">${d.teams.map((tm, i) => `
    <li class="tree-team${sel.team === tm.id ? " on" : ""}" data-team="${tm.id}">
      <button type="button" class="tree-btn" data-go-team="${tm.id}"><span class="tree-no">${String(i).padStart(2, "0")}</span><span class="tree-name">${L(tm, "name", lang)}</span><span class="tree-count">${tm.people.length}</span></button>
      <ul class="tree-kids">${tm.programs.map(p => `<li><button type="button" class="tree-kid${sel.program === p.id ? " on" : ""}" data-go-program="${p.id}" data-team="${tm.id}">${L(p, "name", lang)}</button></li>`).join("")}</ul>
    </li>`).join("")}</ol>`;
}

// ── 左邊的卡：一座島 ──
export function teamCardHTML(tm, lang) {
  const lead = tm.lead ? `<p class="card-lead">${esc(t("leadBy", lang))}</p>` : "";
  const programs = tm.programs.map(p => `<li><button type="button" class="prog" data-go-program="${p.id}" data-team="${tm.id}"><span class="prog-name">${L(p, "name", lang)}</span><span class="prog-line">${L(p, "line", lang)}</span></button></li>`).join("");
  const people = tm.people.map(p => `<li><button type="button" class="pp" data-go-person="${p.code}"><span class="pp-dot r-${p.role}"></span>${esc(label(p, lang))}</button></li>`).join("");
  return `<div class="card-head"><span class="card-kicker c-${tm.colour}">${esc(t("indexHead", lang))}</span><h2 class="card-h">${L(tm, "name", lang)}</h2><p class="card-tag">${L(tm, "tagline", lang)}</p></div>
    ${lead}<p class="card-about">${L(tm, "about", lang)}</p>
    <h3 class="card-sub">${esc(t("programs", lang))}</h3><ul class="progs">${programs}</ul>
    <h3 class="card-sub">${esc(t("people", lang))} <span class="card-n">${esc(t("countPeople", lang, { n: tm.people.length }))}</span></h3><ul class="pps">${people}</ul>
    <p class="card-note">${esc(t("unnamed", lang))} <a href="../team/?lang=${lang}">${esc(t("teamPage", lang))}</a></p>`;
}
// ── 一件在做的事 ──
export function programCardHTML(p, tm, lang) {
  const link = p.link ? `<a class="card-link" href="${esc(p.link)}"${/^https:/.test(p.link) ? ' rel="noopener"' : ""}>${esc(t("more", lang))}</a>` : "";
  return `<div class="card-head"><button type="button" class="card-back" data-go-team="${tm.id}">${L(tm, "name", lang)}</button><h2 class="card-h">${L(p, "name", lang)}</h2><p class="card-tag">${L(p, "line", lang)}</p></div>
    <p class="card-about">${L(p, "detail", lang)}</p>${link}`;
}
// ── 一個人 ──
export function personCardHTML(p, tm, lang) {
  return `<div class="card-head"><button type="button" class="card-back" data-go-team="${tm.id}">${L(tm, "name", lang)}</button><h2 class="card-h">${esc(label(p, lang))}</h2><p class="card-tag">${esc(t(roleKey(p.role), lang))}</p></div>
    <p class="card-about">${L(tm, "tagline", lang)}</p>
    ${p.named ? "" : `<p class="card-note">${esc(t("unnamed", lang))}</p>`}`;
}
// ── 把自己放上去 ──
export function meFormHTML(d, lang, me) {
  const m = me || { name: "", team: "exec", shirt: 0, hair: 0 };
  const teams = d.teams.map(tm => `<option value="${tm.id}"${tm.id === m.team ? " selected" : ""}>${L(tm, "name", lang)}</option>`).join("");
  const sw = (name, n, cur) => Array.from({ length: n }, (_, i) => `<label class="sw sw-${name}-${i}"><input type="radio" name="${name}" value="${i}"${i === cur ? " checked" : ""}><span></span></label>`).join("");
  return `<h2 id="me-h" class="me-h">${esc(t("meTitle", lang))}</h2><p class="me-lead">${esc(t("meLead", lang))}</p>
    <label class="me-field"><span>${esc(t("meName", lang))}</span><input id="me-name" name="name" type="text" maxlength="12" required value="${esc(m.name)}" autocomplete="nickname"></label>
    <label class="me-field"><span>${esc(t("meTeam", lang))}</span><select id="me-team" name="team">${teams}</select></label>
    <div class="me-field"><span>${esc(t("meShirt", lang))}</span><div class="sws">${sw("shirt", 6, m.shirt)}</div></div>
    <div class="me-field"><span>${esc(t("meHair", lang))}</span><div class="sws">${sw("hair", 3, m.hair)}</div></div>
    <div class="me-actions"><button type="submit" class="btn-primary">${esc(t("meSave", lang))}</button>${me ? `<button type="button" class="btn-quiet" data-me-remove>${esc(t("meRemove", lang))}</button>` : ""}<button type="button" class="btn-quiet" data-me-cancel>${esc(t("meCancel", lang))}</button></div>`;
}
export const errorHTML = lang => `<p class="state">${esc(t("loadFail", lang))}</p>`;
