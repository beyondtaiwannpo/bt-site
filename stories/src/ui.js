// /stories/ 畫面的純函式：吃資料與語言，吐 HTML 字串。不碰 DOM，測試直接比字串。
import { t } from "./strings.js";

export const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const L = (o, k, lang) => esc(o[k + "_" + lang] || o[k + "_zh"] || "");
const roleKey = r => ({ cadre: "roleCadre", alumni: "roleAlumni", parent: "roleParent", student: "roleStudent" }[r] || "roleCadre");
// 沒有照片就放代號的第一個字（跟 /alumni/ 同一招）。有照片而且有同意才放 <img>。
export function avatarHTML(p, lang) {
  if (p.photo) return `<img class="who-photo" src="${esc(p.photo)}" alt="" loading="lazy" decoding="async" width="56" height="56">`;
  const n = p["name_" + lang] || p.name_zh || "";
  return `<span class="who-initial" aria-hidden="true">${esc(n.trim().slice(0, 1))}</span>`;
}

// ── 第一屏：三張學生卡 ──
export function pickerHTML(script, lang) {
  const cards = script.personas.map(p => `
    <li class="pick" data-persona="${p.id}">
      <button type="button" class="pick-btn" data-pick="${p.id}">
        <span class="pick-id">${p.id.toUpperCase()}</span>
        <span class="pick-tag">${L(p, "tag", lang)}</span>
        <span class="pick-grade">${L(p, "grade", lang)}</span>
        <span class="pick-start">${L(p, "start", lang)}</span>
        <span class="pick-go">${esc(t("pickGo", lang))}</span>
      </button>
    </li>`).join("");
  return `<section class="picker" aria-labelledby="pick-h">
    <h2 id="pick-h" class="pick-h">${esc(t("pickTitle", lang))}</h2>
    <p class="pick-lead">${esc(t("pickLead", lang))}</p>
    <ul class="picks">${cards}</ul>
    ${script.demo ? `<p class="demo-badge">${esc(t("demoBadge", lang))}</p>` : ""}
  </section>`;
}

// ── 一關：情境、兩個選擇；選了之後下面長出引言、BT 做了什麼、出現的人 ──
export function sceneHTML(persona, i, lang, picked, notes) {
  const s = persona.scenes[i], total = persona.scenes.length;
  const choices = s.choices.map((c, k) => `
    <button type="button" class="choice${picked === k ? " on" : ""}" data-choice="${k}" ${picked != null ? `aria-pressed="${picked === k}"` : ""}>${L(c, "label", lang)}</button>`).join("");
  let extra = "";
  if (s.kind === "wall") extra = wallHTML(notes || [], lang);
  if (s.kind === "map") extra = `<p class="hint">${esc(t("mapHint", lang))}</p>`;
  if (s.kind === "letter") extra = `<p class="hint">${esc(t("letterHint", lang))}</p>`;
  const reveal = picked == null ? "" : revealHTML(persona, i, picked, lang);
  return `<article class="scene" data-scene="${s.id}" data-kind="${s.kind}">
    <p class="scene-n">${esc(t("sceneOf", lang, { n: i + 1, total }))}</p>
    <h2 class="scene-h">${L(s, "title", lang)}</h2>
    <p class="scene-sit">${L(s, "situation", lang)}</p>
    ${extra}
    <div class="choices" role="group">${choices}</div>
    <div class="reveal-wrap" aria-live="polite">${reveal}</div>
  </article>`;
}
export function revealHTML(persona, i, k, lang) {
  const s = persona.scenes[i], c = s.choices[k], last = i === persona.scenes.length - 1;
  const who = c.person ? `
    <div class="who">
      <p class="who-h">${esc(t("youMet", lang))}</p>
      <div class="who-card">
        ${avatarHTML(c.person, lang)}
        <div class="who-text">
          <p class="who-name">${L(c.person, "name", lang)} <span class="who-role">${esc(t(roleKey(c.person.role), lang))}</span></p>
          <p class="who-where">${esc(c.person.city)}${c.person["country_" + lang] ? ` · ${L(c.person, "country", lang)}` : ""}</p>
          <p class="who-line">${L(c.person, "line", lang)}</p>
        </div>
      </div>
    </div>` : "";
  const letter = s.kind === "letter" ? letterHTML(persona, lang) : "";
  return `<div class="reveal">
    <blockquote class="quote"><p>${L(c, "quote", lang)}</p><footer>${L(c, "quote_meta", lang)}</footer></blockquote>
    <div class="bt-did"><p class="bt-h">${esc(t("btDid", lang))}${c.team ? ` <span class="team">${esc(c.team)}</span>` : ""}</p><p>${L(c, "bt", lang)}</p></div>
    ${who}${letter}
    <button type="button" class="next" data-next>${esc(t(last ? "toEnd" : "next", lang))}</button>
  </div>`;
}
// 便利貼牆：探索營現場的便利貼，十二張，點一張放大（CSS 做）。
export function wallHTML(notes, lang) {
  if (!notes.length) return "";
  return `<p class="hint">${esc(t("wallHint", lang))}</p>
  <ul class="wall" aria-label="${esc(t("wallHint", lang))}">${notes.map((n, i) => `
    <li class="note r${i % 5}"><button type="button" class="note-btn" data-note="${esc(n.id)}"><span class="note-text">${L(n, "text", lang)}</span><span class="note-meta">${L(n, "session", lang)}</span></button></li>`).join("")}
  </ul>`;
}
// 給一年後自己的信：翻卡。按鈕翻開，翻開之後正面是信。
export function letterHTML(persona, lang) {
  return `<div class="letter" data-letter>
    <button type="button" class="letter-front" data-flip aria-expanded="false">${esc(t("flip", lang))}</button>
    <div class="letter-back" hidden><p class="letter-text">${L(persona, "letter", lang)}</p><p class="letter-meta">${L(persona, "letter_meta", lang)}</p></div>
  </div>`;
}

// ── 結尾 ──
export function endHTML(persona, met, lang, opts) {
  const o = opts || {};
  const who = met.length ? `<p class="end-with">${esc(t("endWith", lang))}</p><ul class="end-people">${met.map(p => `
    <li>${avatarHTML(p, lang)}<span class="end-name">${L(p, "name", lang)}</span><span class="end-where">${esc(p.city)}</span></li>`).join("")}</ul>` : "";
  return `<section class="end" aria-labelledby="end-h">
    <p class="end-gate"><span>${esc(t("endGate", lang))}</span> ${L(persona, "gate", lang)}</p>
    <p class="end-outcome">${L(persona, "outcome", lang)}</p>
    <h2 id="end-h" class="end-zero">${esc(t("endZero", lang))}</h2>
    ${who}
    <p class="end-ask">${esc(t("endAsk", lang))}</p>
    <a class="back-btn big" href="${esc(o.zeczec || "#")}" rel="noopener">${esc(t("back", lang))}</a>
    <div class="end-links">
      <button type="button" class="again" data-again>${esc(t("again", lang))}</button>
      ${o.fromZeczec ? "" : `<a class="explore" href="../?lang=${lang}">${esc(t("explore", lang))}</a>`}
    </div>
  </section>`;
}

export const errorHTML = lang => `<p class="state">${esc(t("loadFail", lang))}</p>`;
export const progressLabel = (i, total, lang) => t("sceneOf", lang, { n: i + 1, total });
