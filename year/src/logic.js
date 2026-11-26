// 「這一年」（/year/）、「團隊」（/team/）、首頁「現在開放」共用的判斷，全部是不碰畫面的小函式，test/whats-on.test.mjs 守著。
//
// 資料只有一份：後台「網站上的活動」那張表（events）。一筆可以是一場有日期的活動，也可以是一個「計畫」：
//   usual_month  通常在幾月（沒有確定日期的時候用）
//   recurring    多數年份都會辦（會出現在團隊頁那個 team 的固定計畫裡）
//   edition_zh / edition_en  這一屆叫什麼（例如寒假探索營這一屆叫 Overseas Unpacked）
// 這四格是 2026-12-31-programmes.sql 加的。那支還沒跑的資料庫不會回這四格，下面每一支都當它們是空的，不會壞。
// Director 在後台改一筆，「現在開放」「這一年」「團隊」三頁一起變（Paul 2026-11-22）。

// ── 表單（首頁「現在開放」用）──
// 現在真的填得了的表單：給高中生的（kind = program）、已經過了開放時間、還沒過截止時間。幹部招募（kind = board）不算。
export function openForms(forms, now) {
  const t = (now || new Date()).getTime();
  return (forms || []).filter(f => f && f.kind === "program" && f.status === "open" &&
    (!f.opens_at || new Date(f.opens_at).getTime() <= t) &&
    (!f.closes_at || new Date(f.closes_at).getTime() >= t));
}
// 沒有掛在任何一場活動上的開放表單（掛在活動上的由那一場活動的卡片帶）。
export function looseForms(forms, events, now) {
  const taken = new Set((events || []).map(e => e && e.form_id).filter(Boolean));
  return openForms(forms, now).filter(f => !taken.has(f.id));
}

// ── 日期：一律用台灣的日期，活動的時間是台灣的人定的 ──
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export function taipei(v) {
  const d = new Date(v); if (isNaN(d)) return null;
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", hourCycle: "h23" }).formatToParts(d);
  const g = t => Number(p.find(x => x.type === t).value);
  return { y: g("year"), m: g("month"), d: g("day"), hh: g("hour"), mm: g("minute") };
}
export const fmtDay = (v, en) => { const t = taipei(v); return !t ? "" : en ? `${t.d} ${MON[t.m - 1]}` : `${t.m} 月 ${t.d} 日`; };

// ── 一屆：八月到隔年七月 ──
export const TERM = [8, 9, 10, 11, 12, 1, 2, 3, 4, 5, 6, 7];
export const termIndex = m => TERM.indexOf(Number(m));                       // 八月是 0，七月是 11，不是月份回 -1
export function termStart(now) { const t = taipei(now || new Date()); return t.m >= 8 ? t.y : t.y - 1; }   // 這一屆八月的那一年
export const monthName = (m, en) => en ? MON[m - 1] : `${m} 月`;

// 這一筆排在哪個月：有日期看日期，沒有日期看「通常在幾月」，兩個都沒有回 0（日期還沒定）。
export function monthOf(e) {
  if (e && e.starts_at) { const t = taipei(e.starts_at); if (t) return t.m; }
  const u = Number(e && e.usual_month); return u >= 1 && u <= 12 ? u : 0;
}
// 這一筆算不算這一屆的：有日期的要落在這一屆的八月一日到隔年七月底；沒有日期的計畫每一屆都算。
export function inTerm(e, now) {
  if (!e || !e.starts_at) return true;
  const t = taipei(e.starts_at), y = termStart(now); if (!t) return true;
  return (t.y === y && t.m >= 8) || (t.y === y + 1 && t.m <= 7);
}
// 狀態：open 現在報得了名；past 已經過了；upcoming 還沒到。
// 沒有日期只有月份的，過了那個月才算過；連月份都沒有的一律算還沒到。
export function stateOf(e, now) {
  if (e && e.signup_open && !e.is_full) return "open";
  if (e && e.starts_at) return e.is_past ? "past" : "upcoming";
  const m = monthOf(e); if (!m) return "upcoming";
  return termIndex(m) < termIndex(taipei(now || new Date()).m) ? "past" : "upcoming";
}
// 什麼時候，寫給人看的：有日期寫日期，只有月份寫「大約幾月」，都沒有回空字串。
export function whenLabel(e, en) {
  if (e && e.starts_at) return fmtDay(e.starts_at, en);
  const m = monthOf(e); return !m ? "" : en ? `Around ${MONTH[m - 1]}` : `大約 ${m} 月`;
}
// 名字：這一屆有自己的名字就用它，計畫本來的名字放在後面當說明。
export function nameOf(e, l) {
  const pick = k => (l === "zh" ? (e[k + "_zh"] || e[k + "_en"]) : (e[k + "_en"] || e[k + "_zh"])) || "";
  const edition = pick("edition"), title = pick("title");
  return edition && edition !== title ? { main: edition, sub: title } : { main: title, sub: "" };
}

// ── 六個 team ──
export const TEAMS = ["sponsorship", "curriculum", "internship", "mentorship", "marketing", "cr"];
export const TEAM_LABEL = { sponsorship: "Sponsorship", curriculum: "Curriculum", internship: "Internship", mentorship: "Mentorship", marketing: "Marketing", cr: "Community Relations" };
// 後台那一格 team 是字（例如「Curriculum Team」「CR」），這裡認成六個代號之一；認不出來回空字串（那一筆只會出現在活動頁，不會排進六列裡）。
export function teamKey(text) {
  const s = String(text || "").toLowerCase();
  if (/sponsor/.test(s)) return "sponsorship";
  if (/curric/.test(s)) return "curriculum";
  if (/intern/.test(s)) return "internship";
  if (/mentor/.test(s)) return "mentorship";
  if (/market/.test(s)) return "marketing";
  if (/\bcr\b|community/.test(s)) return "cr";
  return "";
}

// ── 「這一年」的版面 ──
// 回 { teams: { 代號: { placed: [...], loose: [...] } }, months: { 月: [...] }, loose: [...], count }。
// placed 是排得進某一個月的，loose 是日期還沒定的。每一筆多三格：team 代號、month、state。
export function yearPlan(events, now) {
  const teams = {}; for (const k of TEAMS) teams[k] = { placed: [], loose: [] };
  const months = {}; for (const m of TERM) months[m] = [];
  const loose = []; let count = 0;
  const day = e => (e.starts_at ? new Date(e.starts_at).getTime() : 0);
  for (const e of (events || []).filter(e => e && inTerm(e, now))) {
    const key = teamKey(e.team); if (!key) continue;
    const it = { ...e, team_key: key, month: monthOf(e), state: stateOf(e, now) };
    count++;
    if (it.month) { teams[key].placed.push(it); months[it.month].push(it); } else { teams[key].loose.push(it); loose.push(it); }
  }
  const byWhen = (a, b) => termIndex(a.month) - termIndex(b.month) || day(a) - day(b);
  for (const k of TEAMS) teams[k].placed.sort(byWhen);
  for (const m of TERM) months[m].sort((a, b) => day(a) - day(b));
  return { teams, months, loose, count };
}

// ── 「團隊」頁每個 team 底下的固定計畫 ──
// 只拿勾了「多數年份都會辦」的。回 { 代號: [...] }，照月份排，沒有月份的排最後。
export function teamProgrammes(events, now) {
  const out = {}; for (const k of TEAMS) out[k] = [];
  for (const e of events || []) {
    if (!e || !e.recurring) continue;
    const key = teamKey(e.team); if (!key || !inTerm(e, now)) continue;
    out[key].push({ ...e, team_key: key, month: monthOf(e), state: stateOf(e, now) });
  }
  const pos = x => (x.month ? termIndex(x.month) : 99);
  for (const k of TEAMS) out[k].sort((a, b) => pos(a) - pos(b));
  return out;
}

// ── 首頁「活動與計畫」（2026-11-25）：全部 team 的固定計畫，一個 team 一組 ──
// Paul：「at homepage, there's going to be programs from all the teams」。資料跟團隊頁同一份（teamProgrammes），只是六個 team 排在一起。
// 回 [{ key, label, items: [{ slug, title, line, state }] }]，沒有計畫的 team 不在裡面；line 是「這一屆叫什麼，哪一天或大約幾月」，兩樣都沒有就是空字串。
export function homeProgrammes(events, now, l) {
  const by = teamProgrammes(events, now), en = l === "en";
  const pick = (e, k) => (en ? (e[k + "_en"] || e[k + "_zh"]) : (e[k + "_zh"] || e[k + "_en"])) || "";
  return TEAMS.filter(k => by[k].length).map(k => ({
    key: k, label: TEAM_LABEL[k],
    items: by[k].map(e => ({ slug: e.slug, title: pick(e, "title"), state: e.state,
      line: [pick(e, "edition"), whenLabel(e, en)].filter(Boolean).join(en ? ", " : "，") })),
  }));
}
