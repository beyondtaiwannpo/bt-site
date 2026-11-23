// /events/ 的畫面（2026-11-01 活動上架批 3）。純函式：吃 public_events() 回的列，吐 HTML。
// 兩種語言都畫（.zh 與 .en 各一塊），頁面上的語言切換只是顯示其中一塊，跟團隊頁同一個做法。
// 不載 supabase-js：資料是 main.js 用 fetch 打 public_events() 拿的。
export const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const T = {
  zh: { past: "過去的活動", upcoming: "近期活動", none: "現在沒有公開的活動。", signup: "報名", full: "額滿", closed: "報名已截止", ended: "已結束",
        opens: d => `${d} 開放報名`, cap: (n, c) => c ? `${n} / ${c} 人` : `${n} 人報名`, login: "報名要先登入，一分鐘。", back: "所有活動", notFound: "找不到這場活動。", place: "地點", when: "時間", around: m => `大約 ${m} 月`, tbc: "日期還沒定", by: t => `${t.replace(/\s*Team$/i, "")} 主辦`,
        speakers: "講者", types: "報名類型", left: n => `還有 ${n} 個名額` },
  en: { past: "Past events", upcoming: "Upcoming", none: "No public events right now.", signup: "Sign up", full: "Full", closed: "Sign-up closed", ended: "Ended",
        opens: d => `Sign-up opens ${d}`, cap: (n, c) => c ? `${n} / ${c} signed up` : `${n} signed up`, login: "Signing up takes a one-minute login.", back: "All events", notFound: "Event not found.", place: "Place", when: "When", around: m => `Around ${["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][m - 1]}`, tbc: "Date to be confirmed", by: t => `Hosted by ${t.replace(/\s*Team$/i, "")}`,
        speakers: "Speakers", types: "Sign-up types", left: n => `${n} ${n === 1 ? "place" : "places"} left` },
};
export const pick = (e, k, l) => (l === "zh" ? (e[k + "_zh"] || e[k + "_en"]) : (e[k + "_en"] || e[k + "_zh"])) || "";
// 日期印成「2027-01-20（三）10:00」這種，兩個語言一樣（數字最不會翻錯）。
export function fmtWhen(starts, ends, l) {
  if (!starts) return "";
  const a = new Date(starts), b = ends ? new Date(ends) : null;
  const d = x => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
  const t = x => `${String(x.getHours()).padStart(2, "0")}:${String(x.getMinutes()).padStart(2, "0")}`;
  // 只知道哪一天、還不知道幾點的，後台存的是台灣的半夜十二點（例如 2027-01-03 00:00）。那種只印日期，印「00:00」會讓人以為半夜開始。
  if (!b && new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Taipei", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(a) === "00:00")
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit" }).format(a);
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
// 名字：這一屆有自己的名字（後台「這一屆叫什麼」，例如寒假探索營這一屆叫 Overseas Unpacked）就用它當大字，計畫本來的名字放在旁邊當說明。
// 跟「這一年」那一頁同一個規則（year/src/logic.js 的 nameOf）。那一格是 2026-12-31-programmes.sql 加的，沒有就照舊只有標題。
export function names(e, l) {
  const edition = pick(e, "edition", l), title = pick(e, "title", l);
  return edition && edition !== title ? { main: edition, sub: title } : { main: title, sub: "" };
}
// 什麼時候：有日期照舊；沒有日期的計畫寫「大約幾月」，連月份都沒有就說還沒定，不留一格空的。
export function whenText(e, l) {
  const w = fmtWhen(e.starts_at, e.ends_at, l); if (w) return w;
  const m = Number(e.usual_month);
  return m >= 1 && m <= 12 ? T[l].around(m) : T[l].tbc;
}
export function split(events) {
  const now = new Date(), yearAgo = new Date(now.getTime() - 365 * 86400000);
  const list = events || [];
  return {
    // 沒有日期的是「計畫」（只知道大概幾月，見 year/src/logic.js），它們排在「這一年」與「團隊」，不排進有日期的近期活動。
    upcoming: list.filter(e => !e.is_past && e.starts_at).sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at)),
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
    <span class="ev-body"><b>${esc(names(e, l).main)}</b>${names(e, l).sub ? `<span class="ev-when">${esc(names(e, l).sub)}</span>` : ""}<span class="ev-when">${esc(fmtWhen(e.starts_at, e.ends_at, l))}${e.place ? `・${esc(e.place)}` : ""}</span>${pick(e, "summary", l) ? `<span class="ev-sum">${esc(pick(e, "summary", l))}</span>` : ""}${tag}</span>
  </a>`;
}
export function listHTML(events, l) {
  const s = T[l], { upcoming, past } = split(events);
  const sec = (title, es) => `<section class="sec"><div class="sec-in"><h2>${title}</h2><div class="body">${es.length ? `<div class="ev-cards">${es.map(e => cardHTML(e, l, "./")).join("")}</div>` : `<p>${s.none}</p>`}</div></div></section>`;
  return sec(s.upcoming, upcoming) + (past.length ? sec(s.past, past) : "");
}
// 說明的排版（2026-11-23 Paul：「I need the text to be like on a bold headline and stuff」）。後台打的是純文字，這裡只認四種寫法：
//   一行開頭「## 」是小標題（h3）；前後各兩個星號 **這樣** 是粗體；連續幾行開頭「- 」是清單；空一行是新的一段，單一個換行還是換行。
// 其他都是純文字，沒有連結、沒有圖、沒有別的標籤。
// **每一段字都先 esc() 再加標籤**，所以說明裡就算打了 <script> 或任何 HTML，印出來也只是字。純函式，test/event-speakers-tickets.test.mjs 有測。
export function richText(text) {
  const inline = s => esc(s).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
  const out = []; let para = [], list = [];
  const endP = () => { if (para.length) { out.push(`<p>${para.join("<br>")}</p>`); para = []; } };
  const endL = () => { if (list.length) { out.push(`<ul>${list.map(x => `<li>${x}</li>`).join("")}</ul>`); list = []; } };
  for (const raw of String(text == null ? "" : text).replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trim();
    if (!line) { endP(); endL(); continue; }
    const h = /^##\s+(.+)$/.exec(line), li = /^-\s+(.+)$/.exec(line);
    if (h) { endP(); endL(); out.push(`<h3>${inline(h[1])}</h3>`); }
    else if (li) { endP(); list.push(inline(li[1])); }
    else { endL(); para.push(inline(line)); }
  }
  endP(); endL();
  return out.join("");
}
// 一場活動那一頁。2026-11-23：這一頁是一欄（.ev-one），不是清單那種「左邊標題、右邊內容」的兩欄：
// 這裡沒有左邊的標題，照兩欄排的話內容會掉進左邊那一欄窄的，右邊三分之二是空的（Paul：「Why is text like all the way to the left?」）。
// 三個空的框是之後補的（main.js 的 fillExtras，資料從 public_event_extras() 來）：講者、報名那一段（有報名類型才換掉）、照片。
// 問不到、沒有資料，這一頁就是說明加原本那一顆報名按鈕。
export function detailHTML(e, l) {
  const s = T[l], st = signupState(e);
  const signup = st === "none" ? "" : st === "open"
    ? `<p><a class="cta" href="../apply/?f=${esc(e.form_id)}">${s.signup}</a> <span class="ev-note">${s.cap(e.signed_up, e.capacity)}${l === "zh" ? "。" : ". "}${s.login}</span></p>`
    : `<p class="ev-note"><b>${st === "full" ? s.full : st === "ended" ? s.ended : st === "soon" ? s.opens(fmtWhen(e.signup_opens_at, null, l)) : s.closed}</b>${e.capacity ? `・${s.cap(e.signed_up, e.capacity)}` : ""}</p>`;
  return `<header class="hero ev-hero"><p class="ev-by">${esc(s.by(e.team))}${names(e, l).sub ? "・" + esc(names(e, l).sub) : ""}</p><h1>${esc(names(e, l).main)}</h1>${pick(e, "summary", l) ? `<p class="lead">${esc(pick(e, "summary", l))}</p>` : ""}</header>
    ${e.cover_url ? `<section class="sec ev-cover-sec"><div class="sec-in"><img class="ev-cover" src="${esc(e.cover_url)}" alt="" onerror="this.closest('section').remove()"></div></section>` : ""}
    <section class="sec ev-one"><div class="sec-in"><div class="body">
      <ul class="rows"><li><b>${s.when}</b><span>${esc(whenText(e, l))}</span></li>${e.place ? `<li><b>${s.place}</b><span>${esc(e.place)}</span></li>` : ""}</ul>
      ${pick(e, "body", l) ? `<div class="ev-text">${richText(pick(e, "body", l))}</div>` : ""}
      <div class="ev-speakers" data-ev-speakers hidden></div>
      <div class="ev-signup" data-ev-signup>${signup}</div>
      <div class="ev-photos" data-ev-gallery hidden></div>
      <p><a href="./">← ${s.back}</a></p>
    </div></div></section>`;
}
// 講者（2026-11-23，2027-01-02-event-speakers-tickets.sql）。extras.speakers 是 [{ name, subject, school, photo_url }]：
// 資料庫只回本人同意、後台勾了的，照後台排的順序，只有這四個鍵。沒有、載不到、函式還不在，回空字串，那個框就一直藏著。
// 一格一位：圓的照片、名字、主題、學校。沒有照片或照片連結壞掉，是一個品牌色的圓加名字的第一個字（照片疊在那個字上面，載不到就自己拿掉）。
// 只印這四樣，物件裡就算多了別的鍵也不會被印出來。
export function speakersHTML(extras, l) {
  const sp = ((extras && Array.isArray(extras.speakers) && extras.speakers) || []).filter(x => x && String(x.name || "").trim());
  if (!sp.length) return "";
  const ini = n => (Array.from(String(n).trim())[0] || "").toUpperCase();
  const face = x => `<span class="ev-sp-face"><span aria-hidden="true">${esc(ini(x.name))}</span>${/^https:\/\//.test(String(x.photo_url || "")) ? `<img src="${esc(x.photo_url)}" alt="" loading="lazy" decoding="async" onerror="this.remove()">` : ""}</span>`;
  return `<h3>${T[l].speakers}</h3><ul class="ev-sp-grid">${sp.map(x => `<li>${face(x)}<b>${esc(String(x.name).trim())}</b>${x.subject ? `<span>${esc(x.subject)}</span>` : ""}${x.school ? `<span class="ev-sp-school">${esc(x.school)}</span>` : ""}</li>`).join("")}</ul>`;
}
// 報名類型（免費的，沒有價錢）。extras.tickets 是 [{ id, name_zh, name_en, note_zh, note_en, capacity, taken, full }]。
// 活動有分類型、而且現在報得了名（signupState 是 open）才畫：一種一列，有名額的寫還有幾個，一種一顆報名按鈕（連到 ../apply/?f=…&ticket=…）；
// 滿了的那一種寫「額滿」、沒有按鈕。其他情況（沒有分類型、還沒開放、活動整場額滿、已結束、載不到）回空字串，那一段照原本的畫。
export function ticketsHTML(e, extras, l) {
  const ts = ((extras && Array.isArray(extras.tickets) && extras.tickets) || []).filter(t => t && /^[0-9a-f-]{36}$/i.test(String(t.id || "")) && (t.name_zh || t.name_en));
  if (!ts.length || !e || !e.form_id || signupState(e) !== "open") return "";
  const s = T[l];
  const row = t => {
    const cap = Number(t.capacity) || 0, left = Math.max(0, cap - (Number(t.taken) || 0)), full = t.full === true || (cap > 0 && left === 0);
    return `<li><span class="ev-type-t"><b>${esc(pick(t, "name", l))}</b>${pick(t, "note", l) ? `<span>${esc(pick(t, "note", l))}</span>` : ""}${cap && !full ? `<span class="ev-note">${s.left(left)}</span>` : ""}</span>${
      full ? `<span class="ev-tag">${s.full}</span>` : `<a class="cta" href="../apply/?f=${esc(e.form_id)}&amp;ticket=${esc(t.id)}">${s.signup}</a>`}</li>`;
  };
  return `<h3>${s.types}</h3><ul class="ev-types">${ts.map(row).join("")}</ul><p class="ev-note">${s.cap(e.signed_up, e.capacity)}${l === "zh" ? "。" : ". "}${s.login}</p>`;
}
// 活動照片（2026-11-23，2027-01-01-event-photos.sql）。extras 是 public_event_extras() 回的 { photos: [{ url }] }：
// 資料庫只回同意勾了的、照後台排的順序。沒有照片、載不到、函式還不在（遷移檔還沒跑），都回空字串，
// 上面那個空的框就一直藏著，那一頁跟沒有這個功能的時候一模一樣。
// 照片沒有說明文字（資料庫沒有那一欄），所以 alt 是空的；捲到才載（lazy）；某一張連結壞掉就只拿掉那一張。
export function galleryHTML(extras) {
  const ps = ((extras && Array.isArray(extras.photos) && extras.photos) || []).filter(p => p && /^https:\/\//.test(String(p.url || "")));
  return ps.map(p => `<img src="${esc(p.url)}" alt="" loading="lazy" decoding="async" onerror="this.remove()">`).join("");
}
export function notFoundHTML(l) { return `<section class="sec"><div class="sec-in"><div class="body"><p>${T[l].notFound}</p><p><a href="./">← ${T[l].back}</a></p></div></div></section>`; }
// 首頁那一段：最多三張，沒有就回空字串（首頁那段 hidden）。
export function homeCardsHTML(events, l) {
  const up = split(events).upcoming.slice(0, 3);
  return up.length ? up.map(e => cardHTML(e, l, "./events/")).join("") : "";
}
