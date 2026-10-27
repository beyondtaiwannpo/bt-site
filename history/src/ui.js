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
// 有勾了同意的照片就把第一張當小縮圖（參考站的卡也是這樣）；沒有就沒有 <img>，不會有破圖。
export function cardHTML(stop, i, lang) {
  const title = pick(stop, "title", lang), summary = pick(stop, "summary", lang);
  const thumb = stop.photos && stop.photos[0] ? `<img class="card-thumb" src="${esc(stop.photos[0].url)}" alt="" loading="lazy" decoding="async" width="72" height="72">` : "";
  // 不用 aria-label：讀螢幕的名字要以看得見的字開頭（WCAG 2.5.3），所以年份與標題照印，「打開這一站」用看不見的 span 接在後面。
  return `<button type="button" class="card${thumb ? " has-thumb" : ""}" data-i="${i}">` + thumb +
    `<span class="card-plus" aria-hidden="true">+</span>` +
    `<span class="card-text"><span class="card-year">${esc(stop.year)}</span>` +
    `<span class="card-title">${esc(title)}</span>` +
    (summary ? `<span class="card-sub">${esc(summary)}</span>` : "") +
    `<span class="sr">（${esc(t("open", lang))}）</span></span></button>`;
}

// 一進來先畫的骨架：一張卡的形狀加「路在鋪」那一句，資料到了就換成真的卡。沒有任何一站的文字。
export const skeletonHTML = lang =>
  `<div class="skeleton card-skeleton" aria-busy="true"><span class="sk-plus"></span><span class="sk-text"><span class="sk-line sk-year"></span><span class="sk-line sk-title"></span></span>` +
  `<span class="sr">${esc(t("loading", lang))}</span></div>`;

// 底部年份帶：每站一顆（大年份、小標籤），現在那一站 aria-current；一顆小點隨捲動在帶上滑（位置 main.js 每一幀寫）。
export function stripHTML(stops, current, lang) {
  const items = (stops || []).map((s, i) =>
    `<button type="button" class="strip-stop${i === current ? " on" : ""}" data-i="${i}"${i === current ? ' aria-current="step"' : ""}>` +
    `<span class="strip-year">${esc(s.year)}</span><span class="strip-title">${esc(shortTitle(s, lang))}</span></button>`).join("");
  return `<div class="strip-stops" role="group" aria-label="${esc(t("strip", lang))}"><span class="strip-dot" aria-hidden="true"></span>${items}</div>` +
    `<div class="strip-progress" aria-live="polite"><span class="sr">${esc(t("progress", lang))} </span>${progressText(current, (stops || []).length)}</div>`;
}

// 出發看板（批 4）：航廈牆上那一塊翻牌看板，列的是真的站。年份當起飛時間、英文標題當目的地、班次 BT 加兩位序號、登機門 A 開頭、
// 狀態照現在走到哪一站（走過的 DEPARTED、現在 BOARDING、還沒到 ON TIME）。
// **只有英文**：翻牌看板的慣例，而且英文大寫才像那一塊板子；沒有英文標題的站退回中文（空白更糟）。其他地方照常中英。
// 這是裝飾（aria-hidden）：同樣的站在年份帶與卡上給讀螢幕的人。字在 HTML 不在 SVG，場景 SVG 裡仍然找不到任何一站的文字。
export const flipWord = s => String(s).split("").map(c => `<span class="flip">${esc(c)}</span>`).join("");
export function boardRows(stops, current) {
  return (stops || []).map((s, i) => ({
    time: String(s.year || ""),
    dest: (s.title_en ? shortTitle({ title_en: s.title_en, title_zh: "" }, "en").toUpperCase() : shortTitle(s, "zh")),
    flight: "BT" + String(i + 1).padStart(2, "0"),
    gate: "A" + (i + 1),
    status: i < current ? "DEPARTED" : i === current ? "BOARDING" : "ON TIME",
  }));
}
export function boardHTML(stops, current) {
  const rows = boardRows(stops, current);
  if (!rows.length) return "";
  return `<div class="board" aria-hidden="true"><div class="board-head"><span>TIME</span><span>DESTINATION</span><span>FLIGHT</span><span>GATE</span><span>STATUS</span></div>` +
    rows.map((r, i) => `<div class="board-row${i === current ? " now" : ""}"><span class="b-time">${flipWord(r.time)}</span><span class="b-dest">${flipWord(r.dest)}</span><span class="b-flight">${flipWord(r.flight)}</span><span class="b-gate">${flipWord(r.gate)}</span><span class="b-status">${flipWord(r.status)}</span></div>`).join("") + `</div>`;
}
// 最後一站之後那一句安靜的結尾。
export const endHTML = lang => `<p class="end-line">${esc(t("endLine", lang))}</p><p class="end-sub">${esc(t("endSub", lang))}</p>`;

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

// 左上淡淡的大年份：顯示字型（Barlow Condensed）的真文字，只留數字。
// 批 3 原本用七段式的方塊數字避開 Lighthouse 把它當 LCP 量，Paul 2026-11-06 覺得突兀，改回文字並接受那個模擬數字。
export const ghostHTML = year => esc(String(year || "").replace(/\D/g, ""));

export const loadingHTML = lang => `<p class="state" aria-busy="true"><span class="dot"></span>${esc(t("loading", lang))}</p>`;
export const errorHTML = lang => `<p class="state err" role="alert">${esc(t("loadError", lang))}</p>`;
export const emptyHTML = lang => `<p class="state">${esc(t("empty", lang))}</p>`;
export { STR };
