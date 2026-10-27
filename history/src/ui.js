// /history/ 的畫面：純函式，吃整理好的站，吐 HTML。沒有 document。
import { STR, t } from "./strings.js";
import { shortTitle } from "./data.js";

export const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pick = (stop, field, lang) => lang === "zh" ? (stop[field + "_zh"] || stop[field + "_en"] || "") : (stop[field + "_en"] || stop[field + "_zh"] || "");

const MONTHS_EN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
// 日期只到月：那七點的日期多半是「那一年的某個月」，印日會像在假裝精確。
export function dateText(iso, lang) {
  const m = /^(\d{4})-(\d{2})/.exec(iso || "");
  if (!m) return esc(iso || "");
  const y = m[1], mo = parseInt(m[2], 10);
  if (!mo || mo > 12) return y;
  return lang === "zh" ? `${y} 年 ${mo} 月` : `${MONTHS_EN[mo - 1]} ${y}`;
}

export const progressText = (i, n) => String(n ? i + 1 : 0).padStart(2, "0") + " / " + String(n).padStart(2, "0");

// 路邊那張卡。是 button：點或 Enter 都打開覆蓋層。data-i 是站的序號，main.js 用它找站。
export function cardHTML(stop, i, lang) {
  const title = pick(stop, "title", lang);
  // 不用 aria-label：讀螢幕的名字要以看得見的字開頭（WCAG 2.5.3），所以年份與標題照印，「打開這一站」用看不見的 span 接在後面。
  return `<button type="button" class="card" data-i="${i}">` +
    `<span class="card-year">${esc(stop.year)}</span>` +
    `<span class="card-title">${esc(title)}</span>` +
    `<span class="sr">（${esc(t("open", lang))}）</span>` +
    `<span class="card-plus" aria-hidden="true">+</span></button>`;
}

// 底部年份帶：每站一顆，現在那一站 aria-current。
export function stripHTML(stops, current, lang) {
  const items = (stops || []).map((s, i) =>
    `<button type="button" class="strip-stop${i === current ? " on" : ""}" data-i="${i}"${i === current ? ' aria-current="step"' : ""}>` +
    `<span class="strip-year">${esc(s.year)}</span><span class="strip-title">${esc(shortTitle(s, lang))}</span></button>`).join("");
  return `<div class="strip-stops" role="group" aria-label="${esc(t("strip", lang))}">${items}</div>` +
    `<div class="strip-progress" aria-live="polite"><span class="sr">${esc(t("progress", lang))} </span>${progressText(current, (stops || []).length)}</div>`;
}

const paras = text => String(text || "").split(/\n\s*\n/).map(p => p.trim()).filter(Boolean).map(p => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`).join("");

export function photosHTML(stop, lang) {
  const ph = stop.photos || [];
  if (!ph.length) return `<p class="no-photos">${esc(t("noPhotos", lang))}</p>`;
  return `<div class="gallery" data-count="${ph.length}">` + ph.map((p, k) => {
    const cap = lang === "zh" ? (p.caption_zh || p.caption_en) : (p.caption_en || p.caption_zh);
    return `<figure class="shot"><button type="button" class="shot-btn" data-k="${k}" aria-label="${esc(t("lightbox", lang))}">` +
      `<img src="${esc(p.url)}" alt="${esc(cap)}" loading="lazy" decoding="async"></button>` +
      (cap ? `<figcaption>${esc(cap)}</figcaption>` : "") + `</figure>`;
  }).join("") + `</div>`;
}

// 覆蓋層：日期、標題、一句話、說明、照片、回到路上。
export function overlayHTML(stop, lang) {
  const title = pick(stop, "title", lang), summary = pick(stop, "summary", lang), body = pick(stop, "body", lang);
  return `<div class="panel-head"><button type="button" class="back" data-close>` +
    `<span aria-hidden="true">←</span> ${esc(t("back", lang))}</button></div>` +
    `<article class="panel-body"><p class="panel-date">${dateText(stop.happened_on, lang)}</p>` +
    `<h2 class="panel-title" id="panel-title">${esc(title)}</h2>` +
    (summary ? `<p class="panel-summary">${esc(summary)}</p>` : "") +
    (body ? `<div class="panel-text">${paras(body)}</div>` : "") +
    `<h3 class="panel-photos-h">${esc(t("photos", lang))}</h3>${photosHTML(stop, lang)}</article>`;
}

// 減少動態效果、或 GSAP 載不到：同樣的站排成直立時間軸，卡一樣，點了一樣打開覆蓋層。
export function timelineHTML(stops, lang) {
  return `<ol class="timeline" aria-label="${esc(t("timelineTitle", lang))}">` +
    (stops || []).map((s, i) => `<li class="tl-item">${cardHTML(s, i, lang)}</li>`).join("") + `</ol>`;
}

export const loadingHTML = lang => `<p class="state" aria-busy="true"><span class="dot"></span>${esc(t("loading", lang))}</p>`;
export const errorHTML = lang => `<p class="state err" role="alert">${esc(t("loadError", lang))}</p>`;
export const emptyHTML = lang => `<p class="state">${esc(t("empty", lang))}</p>`;
export { STR };
