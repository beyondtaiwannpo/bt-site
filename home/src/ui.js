// 幹部首頁與行事曆的畫面（2026-10-28）。**esc 是自己的一份**，資料夾之間不互相 import。
//
// 這一支分兩半：
//   上半是純函式（時間怎麼換算、哪幾場要回覆、月曆有哪幾天），test/home.test.mjs 直接測，不需要瀏覽器。
//   下半是 HTML（首頁、會議卡、行事曆、點開的那一場）。
//
// 時間一律照「看的人自己的時區」（profiles.tz，沒填就台北）。資料庫存的是絕對時間（timestamptz），
// 換成哪一天幾點是在這裡用 Intl 算，不自己加減時差（夏令時間會算錯）。
import { T, lang, setLang } from "./strings.js";
import { canEditWs, withLang, senior, myTeams, canManageWs, peopleHref, boardName, teamShort } from "../../shared/rail.js";
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
      meet_url: /^https:\/\/meet\.google\.com\//.test(m.meet_url || "") ? m.meet_url : "", on_gcal: !!m.gcal_event_id,
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
  return it.scope !== "board" && ["edit", "manage"].includes(String((ws || {})["res:" + it.scope] || ""));
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
  // 2026-11-22：Google 日曆那邊已經有這場（BT 主帳號建的、Google 寄了邀請），就不再給「加到日曆」，免得同一場出現兩次。
  const links = o.full ? `<div class="links">
      ${it.on_gcal ? `<span class="muted">${T("m.onGcal")}</span>` : `<a href="${esc(googleCalUrl(it))}" target="_blank" rel="noopener">${T("m.gcal")}</a>
      <a download="bt-meeting.ics" href="data:text/calendar;charset=utf-8,${encodeURIComponent(icsText(it))}">${T("m.ics")}</a>`}
      ${canSeeReplies(it, ctx.me, ctx.senior, ctx.ws) ? `<a href="../admin/#meetings/${esc(it.id)}">${T("m.edit")}</a>` : ""}
    </div>` : "";
  return `<article class="item ${it.required ? "req" : "opt"}${o.full ? " full" : ""}${o.hi ? " hi" : ""}" id="m-${esc(it.id)}">
    <div class="tags">${tagsHTML(it)}</div>
    <h3><button type="button" class="lnk" data-act="open" data-id="${esc(it.id)}">${esc(it.title)}</button></h3>
    <p class="when">${when}<span class="scope">${scopeLabel(it.scope)}</span></p>
    ${it.meet_url && it.end.getTime() > Date.now() ? `<a class="btn sm meet" href="${esc(it.meet_url)}" target="_blank" rel="noopener">${T("m.join")}</a>` : ""}
    ${info}
    ${myReplyHTML(it, ctx)}
    ${repliesHTML(it, ctx)}
    ${links}
  </article>`;
}

// ── 首頁 ────────────────────────────────────────────────────────────
// ctx：{ me, tz, now, name, senior, ws, people, busy, reasonFor, reasonDraft, changing, linked, linkedMsg, canSchedule }
// 內部表單（2026-11-29）：發給我、還沒填的。沒有就整塊不出現，不佔位置。
export function formsHTML(ctx) {
  const forms = (ctx && ctx.forms) || [];
  if (!forms.length) return "";
  return `<section class="block">
      <h2>${T("home.forms")} <span class="count">${forms.length}</span></h2>
      <p class="mini">${T("home.formsLede")}</p>
      <div class="dos">${forms.map(f => `<a class="do" href="../admin/team-forms/#fill/${encodeURIComponent(f.id)}"><b>${esc(f.title || "")}</b><span>${f.closes_at ? T("home.formCloses", { date: esc(dateLabel(dayKey(new Date(f.closes_at), ctx.tz))) }) : T("home.formOpen")}</span></a>`).join("")}</div>
    </section>`;
}
// ── 等你處理的事（2026-11-14）────────────────────────────────────────
// 首頁只有一張清單：每一件要你動手的事，照日期排，最急的在最上面（Paul 2026-11-14，計畫第 1 步）。
// 以前後台的「待辦」那一頁跟這裡各有一份，兩頁講同一件事；現在後台那一頁改叫「各 team」，待辦都在這裡。
// 一行一件事，點下去就到那件事的那一頁。等回覆的會照舊直接在這裡按到／不能到。
// 誰看得到哪一行跟後台那幾頁同一條規則（shared/rail.js 的 canEditWs / canManageWs）；**真正的門在資料庫**，這裡只決定畫不畫。
// ctx.w 是 data.js 的 loadWaiting() 回的：每一項讀不到是 null，就當沒有。
const RQ_OPEN = ["submitted", "in_progress", "in_review"];
const rqSt = s => !s || s === "new" ? "submitted" : s === "done" ? "published" : s;
const dayStart = d => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(d || "").slice(0, 10)); return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 15, 59)) : null; };
const evTitle = e => (lang() === "zh" ? (e.title_zh || e.title_en) : (e.title_en || e.title_zh)) || e.slug || "";
const A = (href) => withLang(href, lang());
export function waitingList(items, ctx) {
  const now = ctx.now, me = { id: ctx.me, role: "cadre", board: ctx.board || (ctx.senior ? "president" : "member"), ws: ctx.ws || {} };
  const sen = !!ctx.senior, w = ctx.w || {}, out = [];
  const push = (o) => out.push(o);
  // 1. 等你回覆的會：卡片照舊（到／不能到直接按），日期是開會那天。
  for (const it of needsReply(items, now)) if (it.id !== ctx.linked) push({ kind: "rsvp", due: it.start, it });
  // 2. 發給你的內部表單（tf_todo）與該填的活動回饋（rc_my_feedback 還沒填的）。
  for (const f of ctx.forms || []) push({ kind: "form", due: f.closes_at ? new Date(f.closes_at) : null, tag: T("w.form"), title: f.title || "",
    href: `../admin/team-forms/#fill/${encodeURIComponent(f.id)}`, sub: f.closes_at ? T("home.formCloses", { date: dateLabel(dayKey(new Date(f.closes_at), ctx.tz)) }) : T("home.formOpen") });
  for (const f of (ctx.feedback || []).filter(x => !x.done)) push({ kind: "fb", due: null, tag: T("w.fb"), title: lang() === "zh" ? (f.event_zh || f.event) : f.event,
    href: `../feedback/?t=${encodeURIComponent(f.token)}&lang=${lang()}`, sub: f.title || "" });
  // 3. 報名等審核：你改得動的那幾份（活動的跟著那一場的工作區或 team，其他申請跟著「計畫與招募」）。
  const evs = w.events || [], byForm = new Map(evs.filter(e => e.form_id).map(e => [e.form_id, e]));
  const recv = new Map(); for (const a of w.received || []) recv.set(a.form_id, (recv.get(a.form_id) || 0) + 1);
  for (const f of w.forms || []) {
    const n = recv.get(f.id) || 0; if (!n) continue;
    const ev = byForm.get(f.id);
    const can = sen || (ev ? (canEditWs(me, ev.workspace_id) || canEditWs(me, "res:" + ev.team)) : canEditWs(me, "apps"));
    if (!can) continue;
    push({ kind: "apps", due: ev && ev.starts_at ? new Date(ev.starts_at) : f.closes_at ? new Date(f.closes_at) : null, tag: T("w.apps"),
      title: ev ? evTitle(ev) : f.title || "", sub: T("w.appsN", { n }), n, href: A(`/admin/#forms/${f.id}`) });
  }
  // 4. 行銷需求：派給你的；你是 Marketing（需求工作區改以上）就加上還沒有人接的新單。
  const rq = w.requests || [], mkt = canEditWs(me, "custom:marketing-requests");
  for (const r of rq) {
    const st = rqSt(r.status), due = dayStart(r.publish_on || r.needed_by);
    if (RQ_OPEN.includes(st) && r.assignee && r.assignee === ctx.me) push({ kind: "rq", due, tag: T("w.rqMine"), title: r.title || "", sub: T("w.rqSt", { st: T("rq.st." + st) }), href: A(`/admin/#requests/${r.id}`) });
    else if (mkt && st === "submitted" && !r.assignee) push({ kind: "rq", due, tag: T("w.rqNew"), title: r.title || "", sub: T("w.rqNobody"), href: A(`/admin/#requests/${r.id}`) });
  }
  // 5. 等你核可的大學介紹貼文（核可的人：senior 或 Marketing 的「管」；自己開的那一篇不能自己核可）。
  for (const p of w.posts || []) if (p.created_by !== ctx.me) push({ kind: "post", due: null, tag: T("w.post"), title: p.school || "", sub: T("w.postSub"), href: A(`/admin/marketing/#post/${p.id}`) });
  // 6. 你改得動的活動，七天內開始：簽到在那一場的報名表裡。
  const week = new Date(now.getTime() + 7 * 86400000);
  for (const e of evs) {
    const st = e.starts_at ? new Date(e.starts_at) : null;
    if (!st || st < now || st > week || ["cancelled", "archived"].includes(e.status)) continue;
    if (!(sen || canEditWs(me, e.workspace_id) || canEditWs(me, "res:" + e.team))) continue;
    push({ kind: "event", due: st, tag: T("w.event"), title: evTitle(e), sub: e.form_id ? T("w.eventCheckin") : T("w.eventOpen"),
      href: A(e.form_id ? `/admin/#forms/${e.form_id}/checkin` : `/admin/#events/${e.slug}`) });
  }
  // 7. 你送的需求單：Marketing 接了、在審、或退件（退件兩週內）都要你知道。
  for (const r of rq) {
    if (r.requester !== ctx.me) continue;
    const st = rqSt(r.status), fresh = r.updated_at && (now - new Date(r.updated_at)) < 14 * 86400000;
    if (!(["in_progress", "in_review"].includes(st) || (st === "rejected" && fresh))) continue;
    push({ kind: "myrq", due: dayStart(r.publish_on || r.needed_by), tag: T("w.myrq"), title: r.title || "", sub: T("w.rqSt", { st: T("rq.st." + st) }), href: A(`/admin/#request/${r.id}`) });
  }
  // 8. senior 才有的：團隊頁、校友故事等核可，活動等上線，寄不出去的信。
  if (sen) {
    const tn = (w.team || []).length; if (tn) push({ kind: "team", due: null, tag: T("w.team"), title: T("w.teamT", { n: tn }), sub: T("w.teamSub"), href: A("/admin/site/#team") });
    const sn = (w.stories || []).filter(r => !r.story_approved).length; if (sn) push({ kind: "stories", due: null, tag: T("w.stories"), title: T("w.storiesT", { n: sn }), sub: T("w.teamSub"), href: A("/admin/site/#stories") });
    for (const e of evs.filter(x => x.status === "ready")) push({ kind: "ready", due: e.starts_at ? new Date(e.starts_at) : null, tag: T("w.ready"), title: evTitle(e), sub: T("w.readySub"), href: A(`/admin/#events/${e.slug}`) });
    const nt = (w.roster || []).filter(p => !String(p.team || "").trim()).length; if (nt) push({ kind: "roster", due: null, tag: T("w.roster"), title: T("w.rosterT", { n: nt }), sub: T("w.rosterSub"), href: A("/admin/people/#roster") });
    const mn = (w.stuck || []).length; if (mn) push({ kind: "mail", due: null, tag: T("w.mail"), title: T("w.mailT", { n: mn }), sub: T("w.mailSub"), href: A("/admin/#teams") });
  }
  // 照日期排：有日期的在前、越早越上面；沒有日期的（等核可、回饋）排在後面，照原本的順序。
  return out.map((o, i) => ({ o, i })).sort((a, b) => {
    const x = a.o.due ? +a.o.due : Infinity, y = b.o.due ? +b.o.due : Infinity;
    return x - y || a.i - b.i;
  }).map(z => z.o);
}
function dueText(o, ctx) {
  if (!o.due) return "";
  const k = dayKey(o.due, ctx.tz), today = dayKey(ctx.now, ctx.tz), tmr = addDaysKey(today, 1);
  const d = k === today ? T("w.today") : k === tmr ? T("w.tomorrow") : dateLabel(k);
  return o.due < ctx.now ? T("w.late", { d }) : d;
}
function waitRowHTML(o, ctx) {
  if (o.kind === "rsvp") return itemCardHTML(o.it, ctx);
  const due = dueText(o, ctx);
  return `<a class="wrow w-${esc(o.kind)}${o.due && o.due < ctx.now ? " late" : ""}" href="${esc(o.href)}">
      <span class="wtag">${esc(o.tag)}</span>
      <span class="wmain"><b>${esc(o.title)}</b>${o.sub ? `<span>${esc(o.sub)}</span>` : ""}</span>
      ${due ? `<span class="wdue">${esc(due)}</span>` : ""}
    </a>`;
}
// 我的護照：蓋了幾格、一共幾格（stamps 只讀自己的，activities 是大家都一樣的格子）。讀不到就不畫。
export function passportHTML(w) {
  const n = w && w.stamps, t = w && w.boxes;
  if (n == null || !t) return "";
  const pct = Math.max(0, Math.min(100, Math.round(n / t * 100)));
  return `<section class="block pp">
      <h2>${T("home.pp")}</h2>
      <a class="pprow" href="${esc(A("../passport/"))}">
        <span class="ppbar" aria-hidden="true"><i style="width:${pct}%"></i></span>
        <span class="ppn">${esc(T("home.ppN", { n, t }))}</span>
        <span class="ppgo">${esc(T("home.ppGo"))}</span>
      </a>
    </section>`;
}
export function homeHTML(items, ctx) {
  const next = upcoming(items, ctx.now, 60);
  const linked = ctx.linked ? items.find(i => i.id === ctx.linked) : null;
  const top = linked ? `<section class="linked"><p class="mini">${T("home.linked")}</p>${itemCardHTML(linked, ctx, { full: true, hi: true })}</section>`
    : ctx.linkedMsg ? `<div class="wnote">${esc(ctx.linkedMsg)}</div>` : "";
  const wait = waitingList(items, ctx);
  return `<div class="home">
    <header class="hello"><div class="hello-t"><h1>${T("home.hi", { name: esc(ctx.name || "") })}</h1>
      <p class="mini">${T("home.today", { date: esc(dateLabel(dayKey(ctx.now, ctx.tz))), tz: esc(ctx.tz) })}</p></div>
      <a class="btn sm" href="${esc(A("/admin/#request"))}">${T("home.newRq")}</a></header>
    ${top}
    <section class="block wait">
      <h2>${T("home.wait")}${wait.length ? ` <span class="count">${wait.length}</span>` : ""}</h2>
      ${wait.length ? `<p class="mini">${T("home.waitLede")}</p><div class="wlist">${wait.map(o => waitRowHTML(o, ctx)).join("")}</div>` : `<p class="mini ok">${T("home.waitNone")}</p>`}
    </section>
    <section class="block">
      <h2>${T("home.next")}</h2>
      ${next.length ? next.filter(i => i !== linked).map(i => itemCardHTML(i, ctx)).join("") : `<p class="mini">${T("home.nothing")}</p>`}
    </section>
    ${passportHTML(ctx.w)}
    ${pairsHTML(ctx.pairs)}
  </div>`;
}
// 我帶的 mentee／我的 mentor（2026-12-07）。pairs 是 rc_my_pairs() 回的：as、with、event、term_id、matched_on、ended_on、forms[{title, token, done}]。
// 沒有配對就不畫（一個空的區塊只是在說「這裡本來該有東西」）。check-in 連結指到 /feedback/?t=（不登入也能填，填過的打勾）。
export function pairsHTML(pairs) {
  const L = Array.isArray(pairs) ? pairs : [];
  if (!L.length) return "";
  const asMentor = L.filter(p => p.as === "mentor"), asMentee = L.filter(p => p.as === "mentee");
  const row = p => `<li class="pair${p.ended_on ? " ended" : ""}"><b>${esc(p.with || "")}</b>
      <span class="mini">${esc(T("home.pairTerm", { event: lang() === "zh" ? (p.event_zh || p.event) : p.event, term: p.term_id || "" }))}${p.matched_on ? "・" + esc(T("home.pairSince", { d: p.matched_on })) : ""}${p.ended_on ? "・" + esc(T("home.pairEnded", { d: p.ended_on })) : ""}</span>
      ${(p.forms || []).map(f => f.done ? `<span class="mini ok">✓ ${esc(T("home.filled", { title: f.title }))}</span>` : `<a class="lnk" href="../feedback/?t=${encodeURIComponent(f.token)}&lang=${lang()}">${esc(T("home.fill", { title: f.title }))}</a>`).join(" ")}</li>`;
  const block = (title, list) => list.length ? `<section class="block pairs"><h2>${T(title)}${list.length > 1 ? ` <span class="count">${list.length}</span>` : ""}</h2><ul class="pairlist">${list.map(row).join("")}</ul><p class="mini">${T("home.pairHint")}</p></section>` : "";
  return block("home.mentees", asMentor) + block("home.myMentor", asMentee);
}
// 該填的活動回饋（2026-12-07）：rc_my_feedback() 回的，有才畫。
export function feedbackHTML(list) {
  const L = Array.isArray(list) ? list : [];
  if (!L.length) return "";
  return `<section class="block pairs feedback"><h2>${T("home.feedback")}${L.length > 1 ? ` <span class="count">${L.length}</span>` : ""}</h2><ul class="pairlist">${L.map(f => `<li class="pair"><b>${esc(lang() === "zh" ? (f.event_zh || f.event) : f.event)}</b>${f.done ? `<span class="mini ok">✓ ${esc(T("home.filled", { title: f.title }))}</span>` : `<a class="lnk" href="../feedback/?t=${encodeURIComponent(f.token)}&lang=${lang()}">${esc(T("home.fill", { title: f.title }))}</a>`}</li>`).join("")}</ul><p class="mini">${T("home.fbHint")}</p></section>`;
}

// ── team 的頁（2026-11-23，/home/#team=<team>）──────────────────────────
// Paul：「I don't want my members to be confused if they're in two workspaces」。側欄「我的工作區」點一個 team 進來，
// 這一頁把那個 team 的專案、活動、申請表、資源收在一起，每一樣都連回後台原本那一頁。這裡只看、不改。
// 為什麼這樣做、另外兩個沒選的做法：docs/2026-11-23-工作區怎麼分.md。
//
// teamView() 是純函式（test/home-team.test.mjs 直接測）：d 是 data.js loadTeam() 回的，me 是側欄那個「我是誰」。
// 回 { mine, projects, loose, old, forms, resources, directors }；哪一塊讀不到就是 null。
//   mine：我在這個 team 的那一列（shared/rail.js myTeams() 的同一份），沒有就是 null。
//   每一個專案、每一場活動都帶 level（"manage" / "edit" / "view" / ""）。空字串就是沒開給我，畫面標「只能看」。
export function teamView(team, d, me) {
  const data = d || {}, ws = (me && me.ws) || {}, top = senior(me);
  const lvOf = id => top ? "manage" : String(ws[id] || "");
  const evs = data.events ? data.events.filter(e => e.source !== "import") : null;
  const evRow = e => ({ id: e.id, slug: e.slug, title_zh: e.title_zh, title_en: e.title_en, status: e.status, starts_at: e.starts_at, hasForm: !!e.form_id, level: lvOf(e.workspace_id) });
  const projects = data.projects ? data.projects.filter(p => (p.team || "") === team)
    .sort((a, b) => (a.active === false) - (b.active === false))
    .map(p => ({ id: p.id, title_zh: p.title_zh, title_en: p.title_en, active: p.active !== false, level: top ? "manage" : String(p.level || ""),
      forms: (p.forms || []).length, events: (evs || []).filter(e => e.project_id === p.id).map(evRow) })) : null;
  // 活動的報名表掛在那一場活動上、專案的報名表掛在專案上，這裡只留兩邊都不是的（計畫與招募）。
  const taken = new Set([...(data.events || []).map(e => e.form_id), ...(data.projects || []).flatMap(p => (p.forms || []).map(f => f.id))].filter(Boolean));
  return {
    mine: myTeams(me).find(t => t.team === team) || null,
    projects,
    loose: evs ? evs.filter(e => !e.project_id).map(evRow) : null,
    old: data.events ? data.events.filter(e => e.source === "import").length : 0,
    forms: data.forms ? data.forms.filter(f => !taken.has(f.id) && f.kind !== "post-event") : null,
    resources: data.resources || null,
    directors: (data.people || []).filter(p => p.team === team && /director/i.test(String(p.title_en || p.title_zh || "")))
      .map(p => String((lang() === "zh" ? (p.name_zh || p.name_en) : (p.name_en || p.name_zh)) || "").trim()).filter(Boolean),
  };
}
const tName = o => (lang() === "zh" ? (o.title_zh || o.title_en) : (o.title_en || o.title_zh)) || "";
const lvTag = lv => lv ? `<span class="tag lv" title="${esc(T("team.yours"))}">${esc(T("team.lv." + lv))}</span>` : `<span class="tag lv dim">${esc(T("team.viewOnly"))}</span>`;
const stTag = st => `<span class="tag st ${esc(st)}">${esc(T("team.st." + st))}</span>`;
function teamEventRow(e, tz) {
  const when = e.starts_at ? dateLabel(dayKey(new Date(e.starts_at), tz || "Asia/Taipei")) : T("team.noDate");
  return `<li class="trow"><a class="lnk" href="${esc(A("/admin/#events/" + encodeURIComponent(e.slug)))}">${esc(tName(e) || e.slug)}</a>${stTag(e.status)}${lvTag(e.level)}<span class="mini">${esc(when)}</span></li>`;
}
export function teamHTML(team, d, me, tz) {
  const short = esc(teamShort(team));
  if (!d) return `<div class="home team"><header class="hello"><div class="hello-t"><p class="kicker">${T("team.kicker")}</p><h1>${short}</h1></div></header><div class="empty loading">${T("team.loading")}</div></div>`;
  const v = teamView(team, d, me), m = v.mine;
  const lede = senior(me) ? T("team.ledeRank", { rank: esc(boardName(me.board, lang())) })
    : m && m.level ? T("team.ledeLevel", { lv: T("team.lv." + m.level), what: T("team.what" + m.level[0].toUpperCase() + m.level.slice(1)) })
    : m && m.some ? T("team.ledeSome") : T("team.ledeView");
  const canEdit = senior(me) || (m && ["edit", "manage"].includes(m.level));
  const gone = `<p class="mini">${T("team.gone")}</p>`;
  const people = canManageWs(me, "res:" + team) ? `<a class="btn ghost sm" href="${esc(peopleHref("res:" + team, lang()))}">${T("team.people")}</a>` : "";
  const pj = v.projects === null ? gone : v.projects.length ? `<div class="tcards">${v.projects.map(p => `<article class="tcard${p.active ? "" : " off"}">
      <h3><a class="lnk" href="${esc(A("/admin/#projects/" + encodeURIComponent(p.id)))}">${esc(tName(p) || p.id)}</a>${lvTag(p.level)}${p.active ? "" : `<span class="tag st archived">${T("team.pjArchived")}</span>`}</h3>
      ${p.events.length ? `<ul class="tlist">${p.events.map(e => teamEventRow(e, tz)).join("")}</ul>` : `<p class="mini">${T("team.pjNoEvents")}</p>`}
      ${p.forms ? `<p class="mini">${esc(T("team.pjForms", { n: p.forms }))}</p>` : ""}
    </article>`).join("")}</div>` : `<p class="mini">${T("team.pjNone")}</p>`;
  const ev = v.loose === null ? gone : (v.loose.length ? `<ul class="tlist">${v.loose.map(e => teamEventRow(e, tz)).join("")}</ul>` : `<p class="mini">${T("team.evNone")}</p>`)
    + (v.old ? `<p class="mini">${esc(T("team.evOld", { n: v.old }))}</p>` : "");
  const fm = v.forms === null ? gone : v.forms.length ? `<ul class="tlist">${v.forms.map(f => `<li class="trow"><span>${esc(f.title || "")}</span>${stTag(["open", "closed"].includes(f.status) ? f.status : "draft")}</li>`).join("")}</ul>` : `<p class="mini">${T("team.fmNone")}</p>`;
  const rs = v.resources === null ? gone : v.resources.length ? `<ul class="tlist">${v.resources.map(r => `<li class="trow"><span>${esc(r.title || "")}</span>${stTag(r.status === "published" ? "published" : "draft")}</li>`).join("")}</ul>` : `<p class="mini">${T("team.rsNone")}</p>`;
  const n = list => list && list.length ? ` <span class="count">${list.length}</span>` : "";
  const go = (href, key) => `<a class="btn ghost sm" href="${esc(A(href))}">${T(key)}</a>`;
  return `<div class="home team">
    <header class="hello"><div class="hello-t"><p class="kicker">${T("team.kicker")}</p><h1>${short}</h1>
      <p class="mini">${lede}</p>
      <p class="mini">${v.directors.length ? esc(T("team.director", { names: v.directors.join(T("punct.list")) })) : T("team.noDirector")}</p></div>${people}</header>
    <section class="block"><h2>${T("team.pj")}${n(v.projects)}${canEdit ? go("/admin/#projects", "team.pjNew") : ""}</h2>${pj}</section>
    <section class="block"><h2>${T("team.ev")}${n(v.loose)}${canEdit ? go("/admin/#events", "team.evNew") : ""}</h2>${ev}</section>
    <section class="block"><h2>${T("team.fm")}${n(v.forms)}${go("/admin/#forms", "team.fmGo")}</h2>${fm}</section>
    <section class="block"><h2>${T("team.rs")}${n(v.resources)}${go("/admin/site/#res", "team.rsGo")}</h2>${rs}</section>
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
