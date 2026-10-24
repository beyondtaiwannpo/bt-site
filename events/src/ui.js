// /events/ 的畫面（2026-11-01 活動上架批 3）。純函式：吃 public_events() 回的列，吐 HTML。
// 兩種語言都畫（.zh 與 .en 各一塊），頁面上的語言切換只是顯示其中一塊，跟團隊頁同一個做法。
// 不載 supabase-js：資料是 main.js 用 fetch 打 public_events() 拿的。
export const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const T = {
  zh: { past: "過去的活動", upcoming: "近期活動", none: "現在沒有公開的活動。", signup: "報名", full: "額滿", closed: "報名已截止", ended: "已結束",
        opens: d => `${d} 開放報名`, cap: (n, c) => c ? `${n} / ${c} 人` : `${n} 人報名`, login: "報名要先登入，一分鐘。", back: "所有活動", notFound: "找不到這場活動。", place: "地點", when: "時間", by: t => `${t.replace(/\s*Team$/i, "")} 主辦` },
  en: { past: "Past events", upcoming: "Upcoming", none: "No public events right now.", signup: "Sign up", full: "Full", closed: "Sign-up closed", ended: "Ended",
        opens: d => `Sign-up opens ${d}`, cap: (n, c) => c ? `${n} / ${c} signed up` : `${n} signed up`, login: "Signing up takes a one-minute login.", back: "All events", notFound: "Event not found.", place: "Place", when: "When", by: t => `Hosted by ${t.replace(/\s*Team$/i, "")}` },
};
export const pick = (e, k, l) => (l === "zh" ? (e[k + "_zh"] || e[k + "_en"]) : (e[k + "_en"] || e[k + "_zh"])) || "";
// 日期印成「2027-01-20（三）10:00」這種，兩個語言一樣（數字最不會翻錯）。
export function fmtWhen(starts, ends, l) {
  if (!starts) return "";
  const a = new Date(starts), b = ends ? new Date(ends) : null;
  const d = x => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
  const t = x => `${String(x.getHours()).padStart(2, "0")}:${String(x.getMinutes()).padStart(2, "0")}`;
  if (!b) return `${d(a)} ${t(a)}`;
  return d(a) === d(b) ? `${d(a)} ${t(a)}–${t(b)}` : `${d(a)} – ${d(b)}`;
}
// 報名那一行的狀態：沒有表單就不印；過了就「已結束」；滿了「額滿」；開放中「報名」；還沒開「X 開放」；關了「截止」。
export function signupState(e) {
  if (!e.form_id) return "none";
  if (e.is_past) return "ended";
  if (e.is_full) return "full";
  if (e.signup_open) return "open";
  if (e.signup_opens_at && new Date(e.signup_opens_at) > new Date()) return "soon";
  return "closed";
}
export function split(events) {
  const now = new Date(), yearAgo = new Date(now.getTime() - 365 * 86400000);
  const list = events || [];
  return {
    upcoming: list.filter(e => !e.is_past).sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at)),
    past: list.filter(e => e.is_past && new Date(e.ends_at || e.starts_at) >= yearAgo).sort((a, b) => new Date(b.starts_at) - new Date(a.starts_at)),
  };
}
// 封面連結壞掉（team 貼錯、Drive 權限沒開）：卡片換成跟「沒有封面」一樣的色塊，不留破圖的圖示；一場活動的頁把那一塊整個拿掉，不留空位。
const NOIMG = "this.outerHTML='<span class=&quot;ev-noimg&quot;></span>'";
export function cardHTML(e, l, base) {
  const s = T[l], st = signupState(e);
  const tag = st === "open" ? `<span class="ev-tag on">${s.signup}</span>` : st === "full" ? `<span class="ev-tag">${s.full}</span>` : st === "ended" ? `<span class="ev-tag">${s.ended}</span>` : "";
  return `<a class="ev-card" href="${esc(base || "")}#${esc(e.slug)}">
    ${e.cover_url ? `<img src="${esc(e.cover_url)}" alt="" loading="lazy" onerror="${NOIMG}">` : `<span class="ev-noimg"></span>`}
    <span class="ev-body"><b>${esc(pick(e, "title", l))}</b><span class="ev-when">${esc(fmtWhen(e.starts_at, e.ends_at, l))}${e.place ? `・${esc(e.place)}` : ""}</span>${pick(e, "summary", l) ? `<span class="ev-sum">${esc(pick(e, "summary", l))}</span>` : ""}${tag}</span>
  </a>`;
}
export function listHTML(events, l) {
  const s = T[l], { upcoming, past } = split(events);
  const sec = (title, es) => `<section class="sec"><div class="sec-in"><h2>${title}</h2><div class="body">${es.length ? `<div class="ev-cards">${es.map(e => cardHTML(e, l, "./")).join("")}</div>` : `<p>${s.none}</p>`}</div></div></section>`;
  return sec(s.upcoming, upcoming) + (past.length ? sec(s.past, past) : "");
}
export function detailHTML(e, l) {
  const s = T[l], st = signupState(e);
  const signup = st === "none" ? "" : st === "open"
    ? `<p><a class="cta" href="../apply/?f=${esc(e.form_id)}">${s.signup}</a> <span class="ev-note">${s.cap(e.signed_up, e.capacity)}${l === "zh" ? "。" : ". "}${s.login}</span></p>`
    : `<p class="ev-note"><b>${st === "full" ? s.full : st === "ended" ? s.ended : st === "soon" ? s.opens(fmtWhen(e.signup_opens_at, null, l)) : s.closed}</b>${e.capacity ? `・${s.cap(e.signed_up, e.capacity)}` : ""}</p>`;
  return `<header class="hero ev-hero"><p class="ev-by">${esc(s.by(e.team))}</p><h1>${esc(pick(e, "title", l))}</h1>${pick(e, "summary", l) ? `<p class="lead">${esc(pick(e, "summary", l))}</p>` : ""}</header>
    ${e.cover_url ? `<section class="sec ev-cover-sec"><div class="sec-in"><img class="ev-cover" src="${esc(e.cover_url)}" alt="" onerror="this.closest('section').remove()"></div></section>` : ""}
    <section class="sec"><div class="sec-in"><div class="body">
      <ul class="rows"><li><b>${s.when}</b><span>${esc(fmtWhen(e.starts_at, e.ends_at, l))}</span></li>${e.place ? `<li><b>${s.place}</b><span>${esc(e.place)}</span></li>` : ""}</ul>
      ${pick(e, "body", l) ? `<div class="ev-text">${esc(pick(e, "body", l)).replace(/\n/g, "<br>")}</div>` : ""}
      ${signup}
      <p><a href="./">← ${s.back}</a></p>
    </div></div></section>`;
}
export function notFoundHTML(l) { return `<section class="sec"><div class="sec-in"><div class="body"><p>${T[l].notFound}</p><p><a href="./">← ${T[l].back}</a></p></div></div></section>`; }
// 首頁那一段：最多三張，沒有就回空字串（首頁那段 hidden）。
export function homeCardsHTML(events, l) {
  const up = split(events).upcoming.slice(0, 3);
  return up.length ? up.map(e => cardHTML(e, l, "./events/")).join("") : "";
}
