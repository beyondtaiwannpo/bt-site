// /programs/（活動與計畫）的判斷，全部是不碰畫面的小函式，test/whats-on.test.mjs 守著。
//
// 這一頁有四張寫死的計畫卡（探索營、導生配對、講座、高中生實習）。
// 卡片上「現在開不開放」不是寫死的：後台開了一份報名表，這裡看表單的標題認出它是哪一個計畫，那張卡就自己變成「開放報名中」加一顆報名按鈕。
//
// ⚠ 認的方法是看標題裡有沒有關鍵字（下面 KEYS）。後台的表單標題裡要有其中一個字，卡片才會亮；
//    認不出來的表單不會不見，它照樣排在最上面「現在開放」那一段，只是下面那張卡不會跟著亮。
export const KEYS = {
  bootcamp:   /探索營|bootcamp/i,
  mentorship: /導生|mentor/i,
  internship: /實習|intern/i,
  talks:      /講座|說明會|分享會|talk|info session|webinar/i,
};
export const PROGS = Object.keys(KEYS);

// 一份表單是哪一個計畫。對不到回空字串。順序就是 KEYS 的順序，先對到的算。
export function progOf(title) {
  const s = String(title || "");
  for (const k of PROGS) if (KEYS[k].test(s)) return k;
  return "";
}

// 現在真的填得了的表單：給高中生的（kind = program）、已經過了開放時間、還沒過截止時間。
// 幹部招募（kind = board）不放這一頁，它在團隊頁那一條連結後面。
export function openForms(forms, now) {
  const t = (now || new Date()).getTime();
  return (forms || []).filter(f => f && f.kind === "program" && f.status === "open" &&
    (!f.opens_at || new Date(f.opens_at).getTime() <= t) &&
    (!f.closes_at || new Date(f.closes_at).getTime() >= t));
}

// 每個 team 都在學期開始的時候開新的一輪：大約八月，和大約二月（Paul 2026-11-21）。
// 三月到八月回 8，九月到隔年二月回 2。只講月份不講日期，因為每一屆的日期都不一樣。
export function nextTerm(now) {
  const m = (now || new Date()).getMonth() + 1;
  return m >= 3 && m <= 8 ? 8 : 2;
}
export const termLabel = (month, en) => en
  ? (month === 8 ? "Next round opens around August" : "Next round opens around February")
  : (month === 8 ? "下一輪大約八月開放" : "下一輪大約二月開放");

// 每一張卡的狀態：{ bootcamp: { form } | null, ... }。同一個計畫有兩份開著的表單就取先截止的那一份。
// 已經掛在某一場活動上的表單（那場活動的報名表）不算計畫的報名表，它跟著活動卡走。
export function statusByProg(forms, events, now) {
  const taken = new Set((events || []).map(e => e && e.form_id).filter(Boolean));
  const out = {}; for (const k of PROGS) out[k] = null;
  const list = openForms(forms, now).filter(f => !taken.has(f.id))
    .sort((a, b) => (a.closes_at ? new Date(a.closes_at).getTime() : Infinity) - (b.closes_at ? new Date(b.closes_at).getTime() : Infinity));
  for (const f of list) { const k = progOf(f.title); if (k && !out[k]) out[k] = { form: f }; }
  return out;
}

// 排在最上面「現在開放」的表單：開著的、給高中生的、沒有掛在活動上的（掛在活動上的由活動卡帶）。
export function looseForms(forms, events, now) {
  const taken = new Set((events || []).map(e => e && e.form_id).filter(Boolean));
  return openForms(forms, now).filter(f => !taken.has(f.id));
}

export const fmtDay = (v, en) => {
  const d = new Date(v); if (isNaN(d)) return "";
  // 一律用台灣的日期：截止時間是台灣的人定的。
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei", year: "numeric", month: "numeric", day: "numeric" }).formatToParts(d);
  const g = t => Number(p.find(x => x.type === t).value);
  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return en ? `${g("day")} ${MON[g("month") - 1]}` : `${g("month")} 月 ${g("day")} 日`;
};
