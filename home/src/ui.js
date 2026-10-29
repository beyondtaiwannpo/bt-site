// 幹部首頁與行事曆的畫面（2026-10-28）。**esc 是自己的一份**，資料夾之間不互相 import。
//
// 這一支分兩半：
//   上半是純函式（時間怎麼換算、哪幾場要回覆、月曆有哪幾天），test/home.test.mjs 直接測，不需要瀏覽器。
//   下半是 HTML（首頁、會議卡、行事曆、點開的那一場）。
//
// 時間一律照「看的人自己的時區」（profiles.tz，沒填就台北）。資料庫存的是絕對時間（timestamptz），
// 換成哪一天幾點是在這裡用 Intl 算，不自己加減時差（夏令時間會算錯）。
import { T, lang, setLang } from "./strings.js";
export { T, lang, setLang };

export const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const two = n => String(n).padStart(2, "0");

// ── 時間 ────────────────────────────────────────────────────────────
const fmtCache = new Map();
function fmt(tz) {
  if (!fmtCache.has(tz)) {
    let f;
    try { f = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23", weekday: "short" }); }
    catch (e) { f = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23", weekday: "short" }); }
    fmtCache.set(tz, f);
  }
  return fmtCache.get(tz);
}
const WD = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
// 某一刻在某個時區是幾年幾月幾日幾點幾分、星期幾（0 是星期日）。
export function partsIn(date, tz) {
  const o = {};
  for (const p of fmt(tz).formatToParts(new Date(date))) o[p.type] = p.value;
  return { y: +o.year, m: +o.month, d: +o.day, hh: +o.hour % 24, mm: +o.minute, wd: WD[o.weekday] };
}
// "YYYY-MM-DD"：那一刻在那個時區是哪一天。行事曆的格子用這個當鑰匙。
export function dayKey(date, tz) { const p = partsIn(date, tz); return `${p.y}-${two(p.m)}-${two(p.d)}`; }
export const minuteOfDay = (date, tz) => { const p = partsIn(date, tz); return p.hh * 60 + p.mm; };

// 日曆上的日期加減（跟時區無關：一天就是一格）。用 UTC 算，避開瀏覽器自己的夏令時間。
const keyToUtc = k => { const [y, m, d] = k.split("-").map(Number); return Date.UTC(y, m - 1, d); };
const utcToKey = t => { const d = new Date(t); return `${d.getUTCFullYear()}-${two(d.getUTCMonth() + 1)}-${two(d.getUTCDate())}`; };
export const addDaysKey = (k, n) => utcToKey(keyToUtc(k) + n * 86400000);
export const weekdayOfKey = k => new Date(keyToUtc(k)).getUTCDay();
// 那一週的星期一（看板也是星期一開頭）。
export const mondayOf = k => addDaysKey(k, -((weekdayOfKey(k) + 6) % 7));
export const weekKeys = k => { const mon = mondayOf(k); return [0, 1, 2, 3, 4, 5, 6].map(i => addDaysKey(mon, i)); };
// 月曆：從那個月 1 號那一週的星期一開始，六週 42 格（Google 日曆也是固定六列，月份換來換去版面不跳）。
export function monthKeys(k) {
  const first = k.slice(0, 8) + "01", start = mondayOf(first), month = k.slice(5, 7);
  return Array.from({ length: 42 }, (_, i) => { const key = addDaysKey(start, i); return { key, inMonth: key.slice(5, 7) === month }; });
}
export function shiftMonth(k, n) {
  let [y, m] = k.split("-").map(Number); m += n;
  while (m < 1) { m += 12; y--; } while (m > 12) { m -= 12; y++; }
  return `${y}-${two(m)}-01`;
}

const DOW = { zh: ["日", "一", "二", "三", "四", "五", "六"], en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] };
export const dowLabel = wd => DOW[lang() === "zh" ? "zh" : "en"][wd];
const MON_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function dateLabel(k) {
  const [y, m, d] = k.split("-").map(Number), wd = weekdayOfKey(k);
  return lang() === "zh" ? `${m}/${d}（${dowLabel(wd)}）` : `${dowLabel(wd)} ${MON_EN[m - 1]} ${d}`;
}
export function monthLabel(k) {
  const [y, m] = k.split("-").map(Number);
  return lang() === "zh" ? `${y} 年 ${m} 月` : `${MON_EN[m - 1]} ${y}`;
}
export const hhmm = min => `${two(Math.floor(min / 60))}:${two(min % 60)}`;
// 「11/15（日）10:00–11:00」。跨日的寫兩個日期。
export function whenText(start, end, tz) {
  const a = dayKey(start, tz), b = end ? dayKey(end, tz) : a;
  const t1 = hhmm(minuteOfDay(start, tz)), t2 = end ? hhmm(minuteOfDay(end, tz)) : "";
  if (!end) return `${dateLabel(a)} ${t1}`;
  return a === b ? `${dateLabel(a)} ${t1}–${t2}` : `${dateLabel(a)} ${t1} – ${dateLabel(b)} ${t2}`;
}

// ── 資料整理 ────────────────────────────────────────────────────────
// 會議與活動排成同一種東西，行事曆與首頁都吃這個形狀。
//   meetings：loadHome() 回的（每一場帶 attendees 陣列、notes 陣列）
//   events：public_events() 回的（已經放上網站的活動）
export function itemsOf(meetings, events, me) {
  const out = [];
  for (const m of meetings || []) {
    const mine = (m.attendees || []).find(a => a.user_id === me);
    out.push({ kind: "meeting", id: m.id, title: m.title, start: new Date(m.starts_at), end: new Date(m.ends_at),
      required: !!m.required, scope: m.scope || "board", agenda: m.agenda || "", doc_url: m.doc_url || "",
      created_by: m.created_by, attendees: m.attendees || [], notes: m.notes || [],
      invited: !!mine, status: mine ? mine.status : null, organizer: m.created_by === me });
  }
  for (const e of events || []) {
    if (!e.starts_at) continue;
    out.push({ kind: "event", id: "ev-" + (e.slug || e.id), slug: e.slug, title: (lang() === "zh" ? (e.title_zh || e.title_en) : (e.title_en || e.title_zh)) || "",
      start: new Date(e.starts_at), end: e.ends_at ? new Date(e.ends_at) : new Date(new Date(e.starts_at).getTime() + 3600000),
      place: e.place || "", summary: (lang() === "zh" ? (e.summary_zh || e.summary_en) : (e.summary_en || e.summary_zh)) || "" });
  }
  return out.sort((a, b) => a.start - b.start);
}
// 「只看我的」：我受邀的、我排的、所有活動。「整個 BT」：所有會議與活動。
export const visibleItems = (items, mode) => mode === "all" ? items : items.filter(i => i.kind === "event" || i.invited || i.organizer);
// 等你回覆：受邀、還沒回、還沒結束。最近的在最上面。
export const needsReply = (items, now) => items.filter(i => i.kind === "meeting" && i.invited && i.status === "invited" && i.end > now);
// 接下來：60 天內還沒結束的，扣掉上面那一批。
export function upcoming(items, now, days) {
  const until = new Date(now.getTime() + (days || 60) * 86400000);
  return items.filter(i => i.end > now && i.start < until && !(i.kind === "meeting" && i.invited && i.status === "invited")
    && (i.kind === "event" || i.invited || i.organizer));
}
// 排會的人（或能排這個範圍的人）看得到誰會到。senior 是 Co-President / Senior Adviser；ws 是 my_access 的對照表。
export function canSeeReplies(it, me, senior, ws) {
  if (it.kind !== "meeting") return false;
  if (it.created_by === me || senior) return true;
  return it.scope !== "board" && String((ws || {})["res:" + it.scope] || "") === "manage";
}
export function replyGroups(it, people) {
  const name = id => { const p = (people || []).find(x => x.id === id); return p ? ((lang() === "zh" ? (p.name_zh || p.name_en) : (p.name_en || p.name_zh)) || T("common.noName")) : T("common.noName"); };
  const note = id => { const n = (it.notes || []).find(x => x.user_id === id); return n ? n.note : ""; };
  const g = { yes: [], no: [], wait: [] };
  for (const a of it.attendees || []) {
    const row = { id: a.user_id, name: name(a.user_id), note: note(a.user_id) };
    if (a.status === "accepted") g.yes.push(row); else if (a.status === "declined") g.no.push(row); else g.wait.push(row);
  }
  for (const k of Object.keys(g)) g[k].sort((x, y) => x.name.localeCompare(y.name));
  return g;
}
// 行事曆：某一天有哪些（照開始時間）。跨日的東西兩天都出現。
export function itemsOnDay(items, key, tz) {
  return items.filter(i => {
    const a = dayKey(i.start, tz), b = dayKey(new Date(i.end.getTime() - 1), tz);
    return a <= key && key <= b;
  });
}

// ── 加到日曆 ────────────────────────────────────────────────────────
const stamp = d => d.getUTCFullYear() + two(d.getUTCMonth() + 1) + two(d.getUTCDate()) + "T" + two(d.getUTCHours()) + two(d.getUTCMinutes()) + "00Z";
export function googleCalUrl(it) {
  const p = ["action=TEMPLATE", "text=" + encodeURIComponent(it.title || "BT"), "dates=" + stamp(it.start) + "/" + stamp(it.end)];
  const details = [it.agenda, it.doc_url].filter(Boolean).join("\n");
  if (details) p.push("details=" + encodeURIComponent(details));
  return "https://calendar.google.com/calendar/render?" + p.join("&");
}
export const icsEscape = s => String(s == null ? "" : s).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
function icsFold(line) {
  const enc = new TextEncoder(), out = []; let cur = "";
  for (const ch of line) { if (enc.encode(cur + ch).length > 75) { out.push(cur); cur = " " + ch; } else cur += ch; }
  out.push(cur); return out.join("\r\n");
}
// UID 跟資料庫 meeting_ics() 一樣是 meeting-<id>@網域（2026-11-18），先收邀請再下載才不會變成兩筆。
const UID_DOMAIN = "beyondtaiwannpo.com";
export function icsText(it, now) {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Beyond Taiwan//bt-site//EN", "METHOD:PUBLISH", "BEGIN:VEVENT",
    "UID:meeting-" + it.id + "@" + UID_DOMAIN, "DTSTAMP:" + stamp(now || new Date()), "DTSTART:" + stamp(it.start), "DTEND:" + stamp(it.end), "SUMMARY:" + icsEscape(it.title)];
  if (it.agenda) lines.push("DESCRIPTION:" + icsEscape(it.agenda));
  if (it.doc_url) lines.push("URL:" + it.doc_url);
  lines.push("END:VEVENT", "END:VCALENDAR");
  return lines.map(icsFold).join("\r\n") + "\r\n";
}

// ── HTML：共用的小東西 ─────────────────────────────────────────────
const scopeLabel = s => s === "board" ? T("scope.board") : esc(s);
function tagsHTML(it) {
  if (it.kind === "event") return `<span class="tag ev">${T("tag.event")}</span>`;
  return `<span class="tag ${it.required ? "req" : "opt"}">${T(it.required ? "tag.required" : "tag.optional")}</span>`
    + (it.organizer ? ` <span class="tag org">${T("tag.organizer")}</span>` : "");
}
function myReplyHTML(it, ctx) {
  if (it.kind !== "meeting") return "";
  if (!it.invited) return `<p class="ask muted">${T("me.notInvited")}</p>`;
  if (it.end <= ctx.now) return `<p class="mini">${T("home.past")}</p>`;
  const busy = ctx.busy ? " disabled" : "";
  if (ctx.reasonFor === it.id) {
    return `<div class="ask reason" data-reason="${esc(it.id)}">
      <label><i>${T("me.reason")}</i><textarea id="reason-${esc(it.id)}" maxlength="300" rows="2" placeholder="${esc(T("me.reasonPh"))}">${esc(ctx.reasonDraft || "")}</textarea></label>
      <p class="mini">${T("me.reasonNote")}</p>
      <div class="row"><button type="button" class="btn no" data-act="rsvp-send" data-id="${esc(it.id)}"${busy}>${T("me.send")}</button>
        <button type="button" class="btn quiet" data-act="rsvp-cancel"${busy}>${T("common.cancel")}</button></div>
    </div>`;
  }
  const mine = (it.notes || []).find(n => n.user_id === ctx.me);
  if (it.status === "invited" || ctx.changing === it.id) {
    return `<div class="ask"><p class="askq">${T("me.ask")}</p><div class="rsvp-btns">
      <button type="button" class="btn yes${it.status === "accepted" ? " on" : ""}" data-act="rsvp" data-st="accepted" data-id="${esc(it.id)}"${busy}>${T("me.yes")}</button>
      <button type="button" class="btn no${it.status === "declined" ? " on" : ""}" data-act="rsvp" data-st="declined" data-id="${esc(it.id)}"${busy}>${T("me.no")}</button>
    </div></div>`;
  }
  return `<div class="ask said ${it.status === "accepted" ? "yes" : "no"}"><b>${T(it.status === "accepted" ? "me.saidYes" : "me.saidNo")}</b>
    <button type="button" class="btn quiet" data-act="rsvp-change" data-id="${esc(it.id)}"${busy}>${T("me.change")}</button>
    ${mine ? `<span class="mini">${T("me.yourReason", { note: esc(mine.note) })}</span>` : ""}</div>`;
}
function repliesHTML(it, ctx) {
  if (!canSeeReplies(it, ctx.me, ctx.senior, ctx.ws)) return "";
  const g = replyGroups(it, ctx.people);
  const list = (rows, withNote) => rows.length
    ? `<ul>${rows.map(r => `<li>${esc(r.name)}${withNote && r.note ? `<span class="note">「${esc(r.note)}」</span>` : ""}</li>`).join("")}</ul>`
    : `<p class="mini">${T("org.none")}</p>`;
  return `<details class="org"${ctx.openReplies ? " open" : ""}>
    <summary><b>${T("org.title")}</b> <span>${T("org.counts", { yes: g.yes.length, no: g.no.length, wait: g.wait.length })}</span></summary>
    <div class="orgcols">
      <div><i>${T("org.yes")}</i>${list(g.yes)}</div>
      <div><i>${T("org.no")}</i>${list(g.no, true)}</div>
      <div><i>${T("org.wait")}</i>${list(g.wait)}</div>
    </div>
    <p class="mini">${T("org.mailNote")}</p>
  </details>`;
}

// 一場會（或一個活動）的卡片。首頁與行事曆點開的那一場都用這個。
export function itemCardHTML(it, ctx, opts) {
  const o = opts || {};
  const when = esc(whenText(it.start, it.end, ctx.tz));
  if (it.kind === "event") {
    return `<article class="item ev${o.full ? " full" : ""}">
      <div class="tags">${tagsHTML(it)}</div>
      <h3>${esc(it.title)}</h3>
      <p class="when">${when}${it.place ? `<span class="scope">${esc(it.place)}</span>` : ""}</p>
      ${it.summary && o.full ? `<p>${esc(it.summary)}</p>` : ""}
      <div class="row"><a class="btn ghost sm" href="../events/#${encodeURIComponent(it.slug || "")}">${T("m.openEvent")}</a></div>
    </article>`;
  }
  // 2026-10-28 改版（Paul：「看起來很糟」）：標籤在標題上面、時間一行、議程與紀錄兩格、回覆放在一塊淡底的框裡，
  // 加日曆與後台改成最底下一排小字連結，不再跟回覆鈕搶。
  const info = o.full ? `<dl class="info">
      ${it.agenda ? `<div><dt>${T("m.agenda")}</dt><dd>${esc(it.agenda)}</dd></div>` : ""}
      <div><dt>${T("m.notes")}</dt><dd>${it.doc_url ? `<a href="${esc(it.doc_url)}" target="_blank" rel="noopener">${T("m.openNotes")}</a>` : `<span class="muted">${T("m.noNotes")}</span>`}</dd></div>
    </dl>` : (it.agenda ? `<p class="agenda">${esc(it.agenda)}</p>` : "");
  const links = o.full ? `<div class="links">
      <a href="${esc(googleCalUrl(it))}" target="_blank" rel="noopener">${T("m.gcal")}</a>
      <a download="bt-meeting.ics" href="data:text/calendar;charset=utf-8,${encodeURIComponent(icsText(it))}">${T("m.ics")}</a>
      ${canSeeReplies(it, ctx.me, ctx.senior, ctx.ws) ? `<a href="../admin/#meetings/${esc(it.id)}">${T("m.edit")}</a>` : ""}
    </div>` : "";
  return `<article class="item ${it.required ? "req" : "opt"}${o.full ? " full" : ""}${o.hi ? " hi" : ""}" id="m-${esc(it.id)}">
    <div class="tags">${tagsHTML(it)}</div>
    <h3><button type="button" class="lnk" data-act="open" data-id="${esc(it.id)}">${esc(it.title)}</button></h3>
    <p class="when">${when}<span class="scope">${scopeLabel(it.scope)}</span></p>
    ${info}
    ${myReplyHTML(it, ctx)}
    ${repliesHTML(it, ctx)}
    ${links}
  </article>`;
}

// ── 首頁 ────────────────────────────────────────────────────────────
// ctx：{ me, tz, now, name, senior, ws, people, busy, reasonFor, reasonDraft, changing, linked, linkedMsg, canSchedule }
export function homeHTML(items, ctx) {
  const reply = needsReply(items, ctx.now), next = upcoming(items, ctx.now, 60);
  const linked = ctx.linked ? items.find(i => i.id === ctx.linked) : null;
  const top = linked ? `<section class="linked"><p class="mini">${T("home.linked")}</p>${itemCardHTML(linked, ctx, { full: true, hi: true })}</section>`
    : ctx.linkedMsg ? `<div class="wnote">${esc(ctx.linkedMsg)}</div>` : "";
  const dos = [
    { href: "../admin/#request", t: "home.doRequest", s: "home.doRequestSub" },
    { href: "../availability/", t: "home.doTime", s: "home.doTimeSub" },
    ctx.canSchedule ? { href: "../availability/", t: "home.doSchedule", s: "home.doScheduleSub" } : null,
    { href: "#calendar", t: "home.doCal", s: "home.doCalSub" },
    { href: "../passport/", t: "home.doPassport", s: "home.doPassportSub" },
  ].filter(Boolean);
  return `<div class="home">
    <header class="hello"><h1>${T("home.hi", { name: esc(ctx.name || "") })}</h1>
      <p class="mini">${T("home.today", { date: esc(dateLabel(dayKey(ctx.now, ctx.tz))), tz: esc(ctx.tz) })}</p></header>
    ${top}
    <section class="block">
      <h2>${T("home.reply")}${reply.length ? ` <span class="count">${reply.length}</span>` : ""}</h2>
      ${reply.length ? `<p class="mini">${T("home.replyLede")}</p>${reply.filter(i => i !== linked).map(i => itemCardHTML(i, ctx)).join("")}` : `<p class="mini ok">${T("home.allClear")}</p>`}
    </section>
    <section class="block">
      <h2>${T("home.next")}</h2>
      ${next.length ? next.filter(i => i !== linked).map(i => itemCardHTML(i, ctx)).join("") : `<p class="mini">${T("home.nothing")}</p>`}
    </section>
    <section class="block">
      <h2>${T("home.do")}</h2>
      <div class="dos">${dos.map(d => `<a class="do" href="${d.href}"><b>${T(d.t)}</b><span>${T(d.s)}</span></a>`).join("")}</div>
    </section>
  </div>`;
}

// ── 行事曆 ──────────────────────────────────────────────────────────
// cal：{ view: "month" | "week", at: "YYYY-MM-DD", mode: "mine" | "all" }
function chipHTML(it, ctx, withTime) {
  const t = withTime ? `<span class="t">${hhmm(minuteOfDay(it.start, ctx.tz))}</span> ` : "";
  const cls = it.kind === "event" ? "ev" : it.required ? "req" : "opt";
  const st = it.kind === "meeting" && it.invited ? (it.status === "accepted" ? " yes" : it.status === "declined" ? " no" : " wait") : "";
  return `<button type="button" class="chipi ${cls}${st}" data-act="open" data-id="${esc(it.id)}" title="${esc(it.title)}">${t}${esc(it.title)}</button>`;
}
export function calendarHTML(items, ctx, cal) {
  const shown = visibleItems(items, cal.mode);
  const today = dayKey(ctx.now, ctx.tz);
  const label = cal.view === "month" ? monthLabel(cal.at) : `${dateLabel(weekKeys(cal.at)[0])} – ${dateLabel(weekKeys(cal.at)[6])}`;
  const bar = `<div class="calbar">
    <div class="seg"><button type="button" data-act="cal-view" data-v="month"${cal.view === "month" ? ' aria-current="true"' : ""}>${T("cal.month")}</button><button type="button" data-act="cal-view" data-v="week"${cal.view === "week" ? ' aria-current="true"' : ""}>${T("cal.week")}</button></div>
    <button type="button" class="btn ghost sm" data-act="cal-move" data-n="-1" aria-label="${esc(T("cal.prev"))}">←</button>
    <button type="button" class="btn ghost sm" data-act="cal-today">${T("cal.today")}</button>
    <button type="button" class="btn ghost sm" data-act="cal-move" data-n="1" aria-label="${esc(T("cal.next"))}">→</button>
    <b class="callabel">${esc(label)}</b>
    <span class="sp"></span>
    <div class="seg"><button type="button" data-act="cal-mode" data-v="mine"${cal.mode !== "all" ? ' aria-current="true"' : ""}>${T("cal.mine")}</button><button type="button" data-act="cal-mode" data-v="all"${cal.mode === "all" ? ' aria-current="true"' : ""}>${T("cal.all")}</button></div>
  </div>`;
  const heads = [1, 2, 3, 4, 5, 6, 0].map(wd => `<div class="dow">${dowLabel(wd)}</div>`).join("");
  let body;
  if (cal.view === "month") {
    body = `<div class="month">${heads}${monthKeys(cal.at).map(c => {
      const list = itemsOnDay(shown, c.key, ctx.tz), max = 3;
      return `<div class="day${c.inMonth ? "" : " out"}${c.key === today ? " today" : ""}">
        <button type="button" class="dnum" data-act="cal-day" data-k="${c.key}">${Number(c.key.slice(8))}</button>
        ${list.slice(0, max).map(i => chipHTML(i, ctx, true)).join("")}
        ${list.length > max ? `<button type="button" class="more" data-act="cal-day" data-k="${c.key}">${T("cal.more", { n: list.length - max })}</button>` : ""}
      </div>`;
    }).join("")}</div>`;
  } else {
    const keys = weekKeys(cal.at), H = 44;   // 一小時 44px
    const hours = Array.from({ length: 24 }, (_, h) => `<div class="hr" style="top:${h * H}px">${two(h)}:00</div>`).join("");
    const cols = keys.map(k => {
      const list = itemsOnDay(shown, k, ctx.tz).map(i => {
        const s = dayKey(i.start, ctx.tz) === k ? minuteOfDay(i.start, ctx.tz) : 0;
        const e = dayKey(i.end, ctx.tz) === k ? Math.max(minuteOfDay(i.end, ctx.tz), s + 20) : 24 * 60;
        return `<div class="slot" style="top:${s / 60 * H}px;height:${Math.max(18, (e - s) / 60 * H - 2)}px">${chipHTML(i, ctx, true)}</div>`;
      }).join("");
      return `<div class="wcol${k === today ? " today" : ""}">${list}</div>`;
    }).join("");
    const whead = keys.map(k => `<div class="dow${k === today ? " today" : ""}"><button type="button" class="dnum" data-act="cal-day" data-k="${k}">${esc(dateLabel(k))}</button></div>`).join("");
    body = `<div class="week"><div class="whead"><div></div>${whead}</div>
      <div class="wscroll" id="wscroll"><div class="wgrid" style="height:${24 * H}px"><div class="hours">${hours}</div>${cols}</div></div></div>`;
  }
  return `<div class="cal"><h1 class="caltitle">${T("cal.title")}</h1>${bar}<p class="mini">${T("cal.legend")}</p>${body}</div>`;
}

// 點開的那一場（行事曆與首頁都用）。
export function detailHTML(it, ctx) {
  return `<div class="scrim" data-act="close-detail"><div class="modal" role="dialog" aria-modal="true" aria-label="${esc(it.title)}" data-stop="1">
    <button type="button" class="x" data-act="close-detail" aria-label="${esc(T("m.close"))}">×</button>
    ${itemCardHTML(it, Object.assign({}, ctx, { openReplies: true }), { full: true })}
  </div></div>`;
}

export function downHTML() {
  return `<div class="card"><h2>${T("down.title")}</h2><div class="wnote">${T("down.lede")}</div>
    <div class="row"><button class="btn ghost" data-act="retry">${T("common.retry")}</button></div></div>`;
}
export function notCadreHTML() {
  return `<div class="card"><h2>${T("nc.title")}</h2><div class="wnote">${T("nc.lede")}</div>
    <div class="row"><a class="btn ghost" href="../app/">${T("common.back")}</a></div></div>`;
}

// 左下角的一句（記下來了／沒記下來）。四秒後自己收起來。
export function toast(msg, isErr) {
  if (typeof document === "undefined") return;
  document.querySelectorAll(".toast").forEach(n => n.remove());
  const d = document.createElement("div");
  d.className = "toast" + (isErr ? " err" : ""); d.setAttribute("role", "status"); d.textContent = msg;
  document.body.appendChild(d);
  setTimeout(() => d.remove(), isErr ? 7000 : 4000);
}
