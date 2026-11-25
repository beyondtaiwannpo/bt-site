// /events/ 的畫面（2026-11-01 活動上架批 3）。純函式：吃 public_events() 回的列，吐 HTML。
// 兩種語言都畫（.zh 與 .en 各一塊），頁面上的語言切換只是顯示其中一塊，跟團隊頁同一個做法。
// 不載 supabase-js：資料是 main.js 用 fetch 打 public_events() 拿的。
export const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const T = {
  zh: { past: "過去的活動", upcoming: "近期活動", none: "現在沒有公開的活動。", signup: "報名", full: "額滿", closed: "報名已截止", ended: "已結束",
        opens: d => `${d} 開放報名`, cap: (n, c) => c ? `${n} / ${c} 人` : `${n} 人報名`, login: "報名要先登入，一分鐘。", back: "所有活動", notFound: "找不到這場活動。", place: "地點", map: "在 Google 地圖上看", when: "時間", around: m => `大約 ${m} 月`, tbc: "日期還沒定", by: t => `${t.replace(/\s*Team$/i, "")} 主辦`,
        speakers: "講者", types: "報名類型", left: n => `還有 ${n} 個名額`,
        register: "立即報名", deadline: d => `報名到 ${d} 截止`, cal: "加入行事曆", gcal: "Google 日曆", ics: "下載行事曆檔（Apple、Outlook）",
        photos: "活動照片", prev: "看前面的照片", next: "看後面的照片",
        starts: "開始", noTime: "時間還沒定", tw: "台灣時間", view: "看這場活動", opensShort: d => `${d} 開放報名`,
        tkDate: "日期", tkTime: "時間", seats: "名額", more: n => `還有 ${n} 場活動，看全部` },
  en: { past: "Past events", upcoming: "Upcoming", none: "No public events right now.", signup: "Sign up", full: "Full", closed: "Sign-up closed", ended: "Ended",
        opens: d => `Sign-up opens ${d}`, cap: (n, c) => c ? `${n} / ${c} signed up` : `${n} signed up`, login: "Signing up takes a one-minute login.", back: "All events", notFound: "Event not found.", place: "Place", map: "Open in Google Maps", when: "When", around: m => `Around ${["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][m - 1]}`, tbc: "Date to be confirmed", by: t => `Hosted by ${t.replace(/\s*Team$/i, "")}`,
        speakers: "Speakers", types: "Sign-up types", left: n => `${n} ${n === 1 ? "place" : "places"} left`,
        register: "Register now", deadline: d => `Sign-up closes ${d}`, cal: "Add to calendar", gcal: "Google Calendar", ics: "Download calendar file (Apple, Outlook)",
        photos: "Photos", prev: "Previous photos", next: "Next photos",
        starts: "Starts", noTime: "Time to be confirmed", tw: "Taiwan time", view: "View event", opensShort: d => `Opens ${d}`,
        tkDate: "Date", tkTime: "Time", seats: "Seats", more: n => `${n} more ${n === 1 ? "event" : "events"} coming up. See all` },
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
// ── 活動的卡片是一張機票（2026-11-24；2026-11-25 照 Marketing Director 的意見重排）─────────
// Paul 拿一張演唱會售票頁的截圖當參考：「I like the style, especially the airplane air ticket thing… I want each event boxes looking like this…
// obviously our colour」。隔天 Marketing Director 說這張卡看起來怪、字體不對，給了兩張登機證當參考，Paul：「change the font to inter or make it
// look aligned」。所以現在整張卡只有一種字（內文那一套 Inter，中文走系統的黑體，名字也是），每一塊的左邊對齊同一條線。
// 一張卡兩塊，中間是撕線：上面那一塊由上到下是一行抬頭（Beyond Taiwan 加主辦的 team，底下一條橘線；只寫 team 的名字，前面再加「Hosted by」手機上會被切掉）、封面（留邊，沒有封面就用日期當海報）、名字；
// 撕線下面是票根：日期、時間、地點、名額最多四格（小字是欄位名，大字是內容，像登機證上的 FLIGHT、GATE、SEAT；沒填地點或不限名額的那一格不畫），最下面一條條碼加一句話（現在報得了名是橘色的「立即報名」）。
// 整張卡是一條連結，點哪裡都到那一場活動的頁，報名的按鈕在那一頁。
// /events/ 的清單與 /apply/ 的近期活動用小張的；首頁只放一張大的（feat，見最下面的 homeCardsHTML），寬的時候票根在右邊。
// 樣式三頁各一份（.ev-card 那一段），要改三份一起改，test/events-public.test.mjs 守著三份一樣；大張多出來的樣式只有首頁有。
// 時間一律是台灣時間（跟一場活動那一頁同一個規則）。純函式。
const MON = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const valid = v => !!v && !isNaN(new Date(v));
// 票上的日期。中文「2027.01.03（日）」，英文「SUN JAN 3 · 2027」；跨天的印頭尾兩天；沒有日期照 whenText（大約幾月、日期還沒定）。
export function ticketDate(e, l) {
  if (!e || !valid(e.starts_at)) return whenText({ ...(e || {}), starts_at: null }, l);
  const a = tpe(new Date(e.starts_at)), b = valid(e.ends_at) ? tpe(new Date(e.ends_at)) : null;
  const multi = b && !(a.y === b.y && a.m === b.m && a.d === b.d);
  if (l === "zh") return multi ? `${a.y}.${a.m}.${a.d} – ${a.y === b.y ? "" : b.y + "."}${b.m}.${b.d}` : `${a.y}.${a.m}.${a.d}（${WD_ZH[a.wd]}）`;
  const md = p => `${MON[+p.m - 1]} ${+p.d}`;
  if (!multi) return `${a.wd.toUpperCase()} ${md(a)} · ${a.y}`;
  return `${md(a)} – ${a.m === b.m && a.y === b.y ? +b.d : md(b)} · ${b.y}`;
}
// 票根上的幾點開始（台灣時間）。只知道哪一天、還不知道幾點的回空字串。
export function ticketTime(e) {
  if (!e || !valid(e.starts_at) || dateOnly(e.starts_at, e.ends_at)) return "";
  const a = tpe(new Date(e.starts_at)); return `${a.hh}:${a.mm}`;
}
// 票根「時間」那一格：同一天有結束時間就印「09:00 – 17:00」，不然只印開始；不知道幾點回空字串。
export function ticketHours(e) {
  const t = ticketTime(e); if (!t || !valid(e.ends_at)) return t;
  const a = tpe(new Date(e.starts_at)), b = tpe(new Date(e.ends_at)), end = `${b.hh}:${b.mm}`;
  return a.y === b.y && a.m === b.m && a.d === b.d && end !== t ? `${t} – ${end}` : t;
}
// 最下面那一條寫什麼、什麼顏色。on：橘色（現在報得了名）；off：淡的（額滿、截止、結束）；其他是深藍。
export function ticketAction(e, l) {
  const s = T[l], st = signupState(e);
  if (st === "open") return { cls: "on", text: s.register };
  if (st === "full") return { cls: "off", text: s.full };
  if (st === "closed") return { cls: "off", text: s.closed };
  if (st === "ended") return { cls: "off", text: s.ended };
  if (st === "soon") { const o = tpe(new Date(e.signup_opens_at)); return { cls: "", text: s.opensShort(`${o.m}.${o.d}`) }; }
  return { cls: e.is_past ? "off" : "", text: s.view };
}
// 沒有封面的時候，海報那一塊是日期：小字是星期與年，大字是月與日。沒有日期就只有深藍的一塊。
function posterHTML(e, l) {
  if (!valid(e.starts_at)) return `<span class="ev-noimg"></span>`;
  const a = tpe(new Date(e.starts_at));
  const small = l === "zh" ? `${a.y}（${WD_ZH[a.wd]}）` : `${a.wd} · ${a.y}`, big = l === "zh" ? `${a.m}.${a.d}` : `${MON[+a.m - 1]} ${a.d}`;
  return `<span class="ev-noimg"><span class="tk-big"><i>${esc(small)}</i>${esc(big)}</span></span>`;
}
// 抬頭那一架飛機（機頭朝右）。只是裝飾，讀螢幕的人聽不到。
const PLANE = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M22 12c0 .8-.7 1.5-1.5 1.5H15l-5 8H8l2.5-8H5l-1.5 2H2l1-3.5L2 8.5h1.5l1.5 2h5.5L8 2.5h2l5 8h5.5c.8 0 1.5.7 1.5 1.5z"/></svg>`;
// 封面連結壞掉（team 貼錯、Drive 權限沒開）：卡片換成跟「沒有封面」一樣的色塊，不留破圖的圖示；一場活動的頁把那一塊整個拿掉，不留空位。
const NOIMG = "this.outerHTML='<span class=&quot;ev-noimg&quot;></span>'";
// feat：首頁那一張大的。字與順序一模一樣，只多一個 class，樣子差在哪裡都寫在首頁的樣式裡。
export function cardHTML(e, l, base, feat) {
  const s = T[l], n = names(e, l), hours = ticketHours(e), act = ticketAction(e, l), sum = pick(e, "summary", l);
  const f = (label, value, note) => `<span class="tk-f"><i>${label}</i><b>${esc(value)}</b>${note ? `<em>${note}</em>` : ""}</span>`;
  return `<a class="ev-card${feat ? " feat" : ""}" href="${esc(base || "")}#${esc(e.slug)}" data-l="${l === "zh" ? "zh" : "en"}">
    <span class="tk-top">
      <span class="tk-head"><span class="tk-brand">${PLANE}Beyond Taiwan</span>${e.team ? `<span class="tk-by">${esc(e.team)}</span>` : ""}</span>
      ${e.cover_url ? `<img src="${esc(e.cover_url)}" alt="" loading="lazy" onerror="${NOIMG}">` : posterHTML(e, l)}
      <span class="ev-body"><b>${esc(n.main)}</b>${n.sub ? `<span class="ev-when">${esc(n.sub)}</span>` : ""}${sum ? `<span class="ev-sum">${esc(sum)}</span>` : ""}</span>
    </span>
    <span class="tk-stub">
      <span class="tk-fields">${f(s.tkDate, ticketDate(e, l))}${valid(e.starts_at) ? f(s.tkTime, hours || s.noTime, hours ? s.tw : "") : ""}${e.place ? f(s.place, e.place) : ""}${e.capacity > 0 ? f(s.seats, e.capacity) : ""}</span>
      <span class="tk-go${act.cls ? " " + act.cls : ""}"><span class="tk-bars" aria-hidden="true"></span><span class="tk-go-t">${esc(act.text)}</span><span class="tk-arrow" aria-hidden="true">→</span></span>
    </span>
  </a>`;
}
export function listHTML(events, l) {
  const s = T[l], { upcoming, past } = split(events);
  const sec = (title, es) => `<section class="sec sec-cards"><div class="sec-in"><h2>${title}</h2><div class="body">${es.length ? `<div class="ev-cards">${es.map(e => cardHTML(e, l, "./")).join("")}</div>` : `<p>${s.none}</p>`}</div></div></section>`;
  return sec(s.upcoming, upcoming) + (past.length ? sec(s.past, past) : "");
}
// ── 說明的排版 ─────────────────────────────────────────────────────────
// 後台打的是純文字，這裡認下面幾種寫法，其他都是純文字（沒有連結、沒有圖、沒有別的標籤）：
//   整行的：一行開頭「## 」是大標題（h3）、「### 」是小標題（h4）、「- 」是清單（連續幾行是同一份）、「> 」是引言（連續幾行是同一段）。
//           空一行是新的一段，單一個換行還是換行。
//   一行裡面的：**粗體**、==橘色螢光==、{{綠色螢光}}、[[藍底橘字]]。可以包在一起（例如 ==**重點**==），標題、清單、引言裡也都能用。
// 記號挑的是平常寫中文或英文不會連著打出來的：兩個等號、兩個大括號、兩個中括號。單一個的（a = b、[註]、{x}）不會被當成記號。
// 2026-11-23 Paul：「I need the text to be bold, highlight, or in different colors」。品牌色裡在米白底上讀得清楚的字色只有深藍（內文本來就是），
// 所以「不同顏色的字」做成深藍底配橘色字；橘色與綠色太淺，只拿來當螢光的底色，不當字色。
// **每一段字都先 esc() 再加標籤**，所以說明裡就算打了 <script> 或任何 HTML，印出來也只是字。純函式，test/event-page.test.mjs 有測。
// ⚠ 後台的預覽有一份一樣的（admin/src/ui.js 的 evRichText，資料夾之間不互相 import）。這裡改了那邊要跟著改，測試拿同一批字餵兩份、要一模一樣。
export function richInline(s) {
  return esc(s)
    .replace(/==(.+?)==/g, "<mark>$1</mark>")
    .replace(/\{\{(.+?)\}\}/g, '<mark class="hl2">$1</mark>')
    .replace(/\[\[(.+?)\]\]/g, '<span class="rt-c">$1</span>')
    .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
}
export function richText(text) {
  const out = []; let para = [], list = [], quote = [];
  const endP = () => { if (para.length) { out.push(`<p>${para.join("<br>")}</p>`); para = []; } };
  const endL = () => { if (list.length) { out.push(`<ul>${list.map(x => `<li>${x}</li>`).join("")}</ul>`); list = []; } };
  const endQ = () => { if (quote.length) { out.push(`<blockquote>${quote.join("<br>")}</blockquote>`); quote = []; } };
  for (const raw of String(text == null ? "" : text).replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trim();
    if (!line) { endP(); endL(); endQ(); continue; }
    const h = /^(#{2,3})\s+(.+)$/.exec(line), li = /^-\s+(.+)$/.exec(line), q = /^>\s+(.+)$/.exec(line);
    if (h) { endP(); endL(); endQ(); out.push(h[1].length === 2 ? `<h3>${richInline(h[2])}</h3>` : `<h4>${richInline(h[2])}</h4>`); }
    else if (li) { endP(); endQ(); list.push(richInline(li[1])); }
    else if (q) { endP(); endL(); quote.push(richInline(q[1])); }
    else { endL(); endQ(); para.push(richInline(line)); }
  }
  endP(); endL(); endQ();
  return out.join("");
}

// ── 時間（台灣時間，帶星期）─────────────────────────────────────────────
// 一場活動那一頁右邊那張卡與行事曆用的。活動在台灣辦，所以不管看的人在哪裡，印的都是台灣時間，後面寫明是台灣時間。
const TPE = "Asia/Taipei";
const WD_ZH = { Sun: "日", Mon: "一", Tue: "二", Wed: "三", Thu: "四", Fri: "五", Sat: "六" };
function tpe(d) {
  const p = {};
  for (const x of new Intl.DateTimeFormat("en-GB", { timeZone: TPE, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short", hourCycle: "h23" }).formatToParts(d)) p[x.type] = x.value;
  return { y: p.year, m: p.month, d: p.day, hh: p.hour, mm: p.minute, wd: p.weekday };
}
// 只知道哪一天、還不知道幾點：後台存的是台灣的半夜十二點、沒有結束時間（跟 fmtWhen 同一條規則）。
export function dateOnly(starts, ends) {
  if (!starts || ends) return false;
  const p = tpe(new Date(starts));
  return p.hh === "00" && p.mm === "00";
}
// 一個時間點印成「2027.01.03（日）09:00」；noTime 只印日期。
export function stampText(v, l, noTime) {
  const d = new Date(v); if (!v || isNaN(d)) return "";
  const p = tpe(d), day = l === "zh" ? `${p.y}.${p.m}.${p.d}（${WD_ZH[p.wd]}）` : `${p.y}.${p.m}.${p.d} (${p.wd})`;
  return noTime ? day : `${day}${l === "zh" ? "" : " "}${p.hh}:${p.mm}`;
}
// 卡片上「時間」那一格：有日期印日期、星期、幾點到幾點（台灣時間）；只知道哪一天就只印日期與星期；沒有日期照 whenText（大約幾月、日期還沒定）。
export function whenLong(e, l) {
  if (!e || !e.starts_at || isNaN(new Date(e.starts_at))) return whenText({ ...(e || {}), starts_at: null }, l);
  if (dateOnly(e.starts_at, e.ends_at)) return stampText(e.starts_at, l, true);
  const tz = l === "zh" ? "（台灣時間）" : " (Taiwan time, GMT+8)";
  const a = tpe(new Date(e.starts_at)), b = e.ends_at && !isNaN(new Date(e.ends_at)) ? tpe(new Date(e.ends_at)) : null;
  if (!b) return stampText(e.starts_at, l) + tz;
  const same = a.y === b.y && a.m === b.m && a.d === b.d;
  return `${stampText(e.starts_at, l)} - ${same ? `${b.hh}:${b.mm}` : stampText(e.ends_at, l)}${tz}`;
}

// ── 加入行事曆 ─────────────────────────────────────────────────────────
// 只有有日期的活動才有（沒有日期的計畫，行事曆上沒有地方放）。兩條路：Google 日曆的連結，與在瀏覽器裡產生的 .ics 檔（Apple、Outlook 都收）。
// 都在瀏覽器裡做，不經過任何伺服器，也不知道誰按了。
// calData：一場活動 → 行事曆要的那幾樣。只知道哪一天的是整天的行程；有時間的用 UTC 的時間點（行事曆會照看的人的時區換算）。
// 沒有結束時間的不亂猜一個長度：結束等於開始（Google 那邊），.ics 不寫 DTEND。url 是這場活動那一頁的網址，放在說明的最後。
export function calData(e, l, url) {
  if (!e || !e.starts_at) return null;
  const start = new Date(e.starts_at); if (isNaN(start)) return null;
  const end = e.ends_at ? new Date(e.ends_at) : null;
  // uid 是這一筆行程在行事曆裡的身分（同一場再加一次會蓋掉舊的，不會變兩筆）。不寫成「代號@網域」：那個樣子像一個信箱，
  // check.sh 有一條在守「除了組織信箱，站上不出現別的信箱」，不要為了這個去放寬它。
  return { uid: `event-${e.slug || "x"}.beyondtaiwannpo.com`, title: names(e, l).main || "Beyond Taiwan", allDay: dateOnly(e.starts_at, e.ends_at), start,
    end: end && !isNaN(end) && end > start ? end : null, place: String(e.place || "").trim(),
    details: [pick(e, "summary", l), url].filter(Boolean).join("\n\n"), url: url || "" };
}
const z2 = n => String(n).padStart(2, "0");
const utcStamp = d => `${d.getUTCFullYear()}${z2(d.getUTCMonth() + 1)}${z2(d.getUTCDate())}T${z2(d.getUTCHours())}${z2(d.getUTCMinutes())}${z2(d.getUTCSeconds())}Z`;
const tpeDay = (d, plus) => { const p = tpe(new Date(d.getTime() + (plus || 0) * 86400000)); return `${p.y}${p.m}${p.d}`; };
// 開始與結束，行事曆的寫法。整天的：台灣那一天與隔天（結束那一天不算在內，行事曆的規矩）。有時間的：UTC。
export function calDates(c) { return c.allDay ? [tpeDay(c.start), tpeDay(c.start, 1)] : [utcStamp(c.start), utcStamp(c.end || c.start)]; }
// Google 日曆的連結。每一格都經過 URLSearchParams 編碼（中文、空白、&、換行都安全）。
export function gcalUrl(c) {
  if (!c) return "";
  const [a, b] = calDates(c), q = new URLSearchParams({ action: "TEMPLATE", text: c.title, dates: `${a}/${b}` });
  if (c.place) q.set("location", c.place);
  if (c.details) q.set("details", c.details);
  return "https://calendar.google.com/calendar/render?" + q.toString();
}
// .ics 的文字要逃脫四樣：反斜線、分號、逗號、換行（RFC 5545）。
export const icsEscape = s => String(s == null ? "" : s).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
// 一行最多 75 個位元組（中文一個字三個），超過就折行：下一行開頭一個空白。照字切，不會把一個中文字切成兩半。
function icsFold(line) {
  const enc = new TextEncoder(); let out = "", cur = "", n = 0;
  for (const ch of line) { const b = enc.encode(ch).length; if (n + b > 75) { out += cur + "\r\n "; cur = ""; n = 1; } cur += ch; n += b; }
  return out + cur;
}
// 整份 .ics。now 是產生的時間（測試會給固定的）。行尾是 CRLF。
export function icsText(c, now) {
  if (!c) return "";
  const [a, b] = calDates(c);
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Beyond Taiwan//Events//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "BEGIN:VEVENT",
    `UID:${icsEscape(c.uid)}`, `DTSTAMP:${utcStamp(now || new Date())}`,
    c.allDay ? `DTSTART;VALUE=DATE:${a}` : `DTSTART:${a}`,
    c.allDay ? `DTEND;VALUE=DATE:${b}` : (c.end ? `DTEND:${b}` : ""),
    `SUMMARY:${icsEscape(c.title)}`, c.place ? `LOCATION:${icsEscape(c.place)}` : "", c.details ? `DESCRIPTION:${icsEscape(c.details)}` : "",
    c.url ? `URL:${c.url}` : "", "END:VEVENT", "END:VCALENDAR"].filter(Boolean);
  return lines.map(icsFold).join("\r\n") + "\r\n";
}
// 卡片最下面那一段。Google 是連結（開新分頁），.ics 是按鈕（main.js 聽 data-act="ics"，在瀏覽器裡產生檔案）。沒有日期回空字串。
export function calendarHTML(e, l, url) {
  const c = calData(e, l, url); if (!c) return "";
  const s = T[l];
  return `<div class="ev-cal"><b>${s.cal}</b><span class="ev-cal-b"><a class="ev-cal-a" href="${esc(gcalUrl(c))}" target="_blank" rel="noopener">${s.gcal}</a><button type="button" class="ev-cal-a" data-act="ics" data-slug="${esc(e.slug)}" data-l="${l}">${s.ics}</button></span></div>`;
}

// ── 一場活動那一頁 ─────────────────────────────────────────────────────
// 講者（2027-01-02-event-speakers-tickets.sql）。extras.speakers 是 [{ name, subject, school, photo_url }]：
// 資料庫只回本人同意、後台勾了的，照後台排的順序，只有這四個鍵。沒有、載不到、函式還不在，回空字串。
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
// 滿了的那一種寫「額滿」、沒有按鈕。其他情況（沒有分類型、還沒開放、活動整場額滿、已結束、載不到）回空字串，卡片上就是一顆「立即報名」或一句現況。
export function ticketsHTML(e, extras, l) {
  const ts = ((extras && Array.isArray(extras.tickets) && extras.tickets) || []).filter(t => t && /^[0-9a-f-]{36}$/i.test(String(t.id || "")) && (t.name_zh || t.name_en));
  if (!ts.length || !e || !e.form_id || signupState(e) !== "open") return "";
  const s = T[l];
  const row = t => {
    const cap = Number(t.capacity) || 0, left = Math.max(0, cap - (Number(t.taken) || 0)), full = t.full === true || (cap > 0 && left === 0);
    return `<li><span class="ev-type-t"><b>${esc(pick(t, "name", l))}</b>${pick(t, "note", l) ? `<span>${esc(pick(t, "note", l))}</span>` : ""}${cap && !full ? `<span class="ev-note">${s.left(left)}</span>` : ""}</span>${
      full ? `<span class="ev-tag">${s.full}</span>` : `<a class="cta" href="../apply/?f=${esc(e.form_id)}&amp;ticket=${esc(t.id)}">${s.signup}</a>`}</li>`;
  };
  return `<b class="ev-card-h">${s.types}</b><ul class="ev-types">${ts.map(row).join("")}</ul>`;
}
// 卡片上報名那一段。現在報得了名：一顆「立即報名」（活動有分類型就換成一種一列），下面一行還有幾個名額與報名到什麼時候，再一行「報名要先登入」。
// 報不了名：一句現況（額滿、已結束、哪一天開放、已截止）。沒有報名表回空字串。
export function signupHTML(e, extras, l) {
  const s = T[l], st = signupState(e);
  if (st === "none") return "";
  if (st !== "open") return `<p class="ev-note"><b>${st === "full" ? s.full : st === "ended" ? s.ended : st === "soon" ? s.opens(fmtWhen(e.signup_opens_at, null, l)) : s.closed}</b>${e.capacity ? `・${s.cap(e.signed_up, e.capacity)}` : ""}</p>`;
  const cap = Number(e.capacity) || 0;
  const facts = [cap > 0 ? s.left(Math.max(0, cap - (Number(e.signed_up) || 0))) : "", e.signup_closes_at ? s.deadline(stampText(e.signup_closes_at, l)) : ""].filter(Boolean);
  return (ticketsHTML(e, extras, l) || `<a class="cta ev-go" href="../apply/?f=${esc(e.form_id)}">${s.register}</a>`)
    + (facts.length ? `<p class="ev-note">${facts.join("・")}</p>` : "") + `<p class="ev-note">${s.login}</p>`;
}
// 活動照片（2027-01-01-event-photos.sql）：橫的一排，往左往右滑。extras.photos 是 [{ url }]，資料庫只回同意勾了的、照後台排的順序。
// 每一張固定 4:3（寬高在 CSS 裡定死，照片還沒載到版面也不會跳）、捲到才載（lazy）、沒有說明文字所以 alt 是空的；某一張連結壞掉就只拿掉那一張。
// 左右兩顆是真的按鈕（有名字、鍵盤按得到），桌機才出現；手機用手滑。那一排自己也能用鍵盤的左右鍵捲（tabindex）。
// 沒有照片、載不到、函式還不在，回空字串。
export function galleryHTML(extras, l) {
  const ps = ((extras && Array.isArray(extras.photos) && extras.photos) || []).filter(p => p && /^https:\/\//.test(String(p.url || "")));
  if (!ps.length) return "";
  const s = T[l === "en" ? "en" : "zh"];
  return `<h3>${s.photos}</h3><div class="ev-strip"><button type="button" class="ev-strip-b" data-act="strip" data-dir="-1" aria-label="${s.prev}">←</button><ul class="ev-strip-list" tabindex="0" aria-label="${s.photos}">${
    ps.map(p => `<li><img src="${esc(p.url)}" alt="" loading="lazy" decoding="async" onerror="this.closest('li').remove()"></li>`).join("")
  }</ul><button type="button" class="ev-strip-b" data-act="strip" data-dir="1" aria-label="${s.next}">→</button></div>`;
}
// 一場活動那一頁（2026-11-23 重排，Paul 拿 Accupass 的活動頁當樣子）：
//   - 最上面沒有「活動」那一大塊標題，只有一行「← 所有活動」。
//   - 桌機兩欄。左邊：封面、主辦、活動名稱、一句話、說明、講者、照片。右邊一張卡，往下捲的時候一直在畫面上：
//     主辦、活動名稱、時間（台灣時間、帶星期）、地點、報名（一顆「立即報名」，或一種一列的報名類型，或一句現況）、加入行事曆。
//   - 手機一欄：那張卡接在活動名稱下面；現在報得了名的話，螢幕最下面多一條細細的、固定的「立即報名」。
// x 是 public_event_extras() 回的（講者、報名類型、照片），沒有（null、還沒跑遷移檔）就是沒有那幾塊，其他照畫。
// main.js 會等 x 回來才畫這一頁，所以畫出來之後版面不會再跳。o.url 是這一頁的網址（行事曆的說明裡用）。
// 地點那一行（2026-11-24，2027-01-05-map-links.sql）：地點的字，後面一條「在 Google 地圖上看」（後台有貼連結才有）。
// 連結從 public_event_extras() 來（x.map_url）。資料庫只收 Google 地圖的連結，這裡印之前再對一次同一條規則：
// 不是 https、不是 Google 地圖的網域、帶空白或引號的，一律當作沒有。沒有地點的字但有連結，那一行照樣印（只有連結）。
export const MAP_RE = /^https:\/\/(maps\.app\.goo\.gl\/|goo\.gl\/maps\/|(www\.)?google\.com(\.tw)?\/maps[/?]|maps\.google\.com(\.tw)?\/)[^\s<>"'`\\]*$/;
export const mapUrl = x => { const u = x && typeof x.map_url === "string" ? x.map_url.trim() : ""; return u && u.length <= 600 && MAP_RE.test(u) ? u : ""; };
export function placeHTML(e, x, l) {
  const u = mapUrl(x), place = String(e.place || "").trim();
  if (!place && !u) return "";
  return `<li><b>${T[l].place}</b><span>${esc(place)}${u ? `${place ? " " : ""}<a class="ev-map" href="${esc(u)}" target="_blank" rel="noopener">${T[l].map}</a>` : ""}</span></li>`;
}
export function detailHTML(e, l, x, o) {
  const s = T[l], n = names(e, l), st = signupState(e), opt = o || {};
  const speakers = speakersHTML(x, l), photos = galleryHTML(x, l), types = st === "open" && !!ticketsHTML(e, x, l);
  const body = pick(e, "body", l);
  const bar = st !== "open" ? "" : `<div class="ev-bar"><span class="ev-bar-t"><b>${esc(n.main)}</b><span>${esc(whenLong(e, l))}</span></span>${
    types ? `<button type="button" class="cta" data-act="to-signup">${s.register}</button>` : `<a class="cta" href="../apply/?f=${esc(e.form_id)}">${s.register}</a>`}</div>`;
  return `<article class="ev-page body${bar ? " has-bar" : ""}">
    <p class="ev-back"><a href="./">← ${s.back}</a></p>
    <div class="ev-grid">
      <header class="ev-head">
        ${e.cover_url ? `<img class="ev-cover" src="${esc(e.cover_url)}" alt="" onerror="this.remove()">` : ""}
        <p class="ev-by">${esc(s.by(e.team))}${n.sub ? "・" + esc(n.sub) : ""}</p><h1>${esc(n.main)}</h1>${pick(e, "summary", l) ? `<p class="lead">${esc(pick(e, "summary", l))}</p>` : ""}
      </header>
      <aside class="ev-side"><div class="ev-card2" data-ev-card>
        <p class="ev-card-by">${esc(s.by(e.team))}</p><p class="ev-card-t">${esc(n.main)}</p>
        <ul class="rows"><li><b>${s.when}</b><span>${esc(whenLong(e, l))}</span></li>${placeHTML(e, x, l)}</ul>
        <div class="ev-signup" data-ev-signup>${signupHTML(e, x, l)}</div>
        ${calendarHTML(e, l, opt.url)}
      </div></aside>
      <div class="ev-rest">
        ${body ? `<div class="ev-text">${richText(body)}</div>` : ""}
        ${speakers ? `<div class="ev-speakers">${speakers}</div>` : ""}
        ${photos ? `<div class="ev-photos">${photos}</div>` : ""}
        ${body || speakers || photos ? `<p class="ev-back"><a href="./">← ${s.back}</a></p>` : ""}
      </div>
    </div>
    ${bar}
  </article>`;
}
export function notFoundHTML(l) { return `<section class="sec"><div class="sec-in"><div class="body"><p>${T[l].notFound}</p><p><a href="./">← ${T[l].back}</a></p></div></div></section>`; }
// 首頁那一段：只放一張大的（2026-11-25 Paul：「the home page should only showcase 1 event and make it look super good. and events list can have multiple」）。
// 挑哪一張：現在報得了名的裡面最近的那一場；都還不能報就是最近的那一場。還有別場就在下面多一行連到 /events/。沒有就回空字串。
export function homeCardsHTML(events, l) {
  const up = split(events).upcoming; if (!up.length) return "";
  const first = up.find(e => signupState(e) === "open") || up[0], more = up.length - 1;
  return cardHTML(first, l, "./events/", true) + (more ? `<p class="tk-more"><a class="more" href="./events/">${T[l].more(more)}</a></p>` : "");
}
