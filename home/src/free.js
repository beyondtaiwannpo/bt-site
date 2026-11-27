// 行事曆的「某一天」那一格（2026-11-26，Paul：時間看板那一頁拿掉，有空的人數搬到首頁行事曆點一天看到的那一天上）。
// 純函式：吃每個人填的時段，吐「這一天每半小時有誰有空」。不碰 DOM、不碰網路，test/home-day.test.mjs 直接測。
//
// 資料跟以前的時間看板（availability/）同一份：
//   availability       每個人「平常每週」有空的格子，weekday + minute 是**他自己時區**的當地時間（0 是星期日，minute 是 0、30、60…）
//   availability_week  某一週的例外格子；availability_week_mark 記哪幾週被他動過
//   那一週被動過就只看例外，沒動過就看平常的（**取代，不是疊加**，跟看板一樣）。
//
// 怎麼算（跟以前看板的 boardCounts 對得起來，2026-11-26 拿同一批輸入比過）：
//   觀看者那一天的每半小時 v（他自己時區的 00:00、00:30…），對每一個人：
//   v 換成那個人的當地時間，往後取到第一個整點或半點，那就是「開始時間落在 v 到 v+30 分之間」的那一格；
//   那一格在不在他那一週有效的格子裡。印度、尼泊爾這種差半小時或四十五分的時區，這樣才不會差一格。
//   「那一週」是那個人自己時區的星期一到星期日，所以休士頓的人週日晚上落在台北星期一早上的時候，看的是他的上一週。
// 沒設時區的人跳過（畫不出來），他會出現在 /availability/ 的成員那一頁被催。
import { partsIn, dayKey, minuteOfDay, mondayOf } from "./ui.js";

const two = n => String(n).padStart(2, "0");
const SLOT = 30 * 60000;

// 某個時區某一天某一分鐘的那個瞬間。夏令時間那一天不存在的時刻會收到前後最近的那一刻（跟看板的 tz.js 同一招）。
function offsetAt(t, tz) { const p = partsIn(t, tz), m = Math.floor(t / 60000) * 60000; return Date.UTC(p.y, p.m - 1, p.d, p.hh, p.mm) - m; }
export function instantOf(key, minute, tz) {
  const [y, m, d] = key.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d, Math.floor(minute / 60), minute % 60);
  const o1 = offsetAt(guess, tz);
  let t = guess - o1;
  const o2 = offsetAt(t, tz);
  if (o2 !== o1) t = guess - o2;
  return new Date(t);
}

// 觀看者那一天的每半小時：[{ min, at }]。平常 48 格；夏令時間開始那天少兩格、結束那天同一個 min 會出現兩次。
export function dayRows(key, tz) {
  const out = [];
  let t = instantOf(key, 0, tz).getTime();
  if (dayKey(new Date(t), tz) !== key) t += SLOT;
  for (let i = 0; i < 52 && dayKey(new Date(t), tz) === key; i++, t += SLOT) out.push({ min: minuteOfDay(new Date(t), tz), at: new Date(t) });
  return out;
}

// 一個瞬間 v 落在那個人自己時區的哪一格（開始時間在 v 到 v+30 分之間的那一格）、那一格屬於他的哪一週（星期一的日期）。
export function slotOf(at, tz) {
  const p = partsIn(at, tz), mm = p.hh * 60 + p.mm, delta = (30 - (mm % 30)) % 30;
  const q = delta ? partsIn(new Date(at.getTime() + delta * 60000), tz) : p;
  return { key: q.wd + ":" + (q.hh * 60 + q.mm), week: mondayOf(`${q.y}-${two(q.m)}-${two(q.d)}`) };
}

// 那一天每半小時誰有空。members: [{ id, tz }]；slots: Map(id → Set("wd:min"))；
// weekSlots: Map(id → Map(星期一 → Set))；weekMarks: Map(id → Set(星期一))。
// 回 { rows, free: Map(min → [id]) }。
export function dayFree(members, slots, weekSlots, weekMarks, key, viewerTz) {
  const rows = dayRows(key, viewerTz), free = new Map();
  for (const r of rows) if (!free.has(r.min)) free.set(r.min, []);
  for (const m of members || []) {
    if (!m.tz) continue;
    const usual = (slots && slots.get(m.id)) || new Set();
    const marks = (weekMarks && weekMarks.get(m.id)) || new Set();
    const byWeek = (weekSlots && weekSlots.get(m.id)) || new Map();
    for (const r of rows) {
      const s = slotOf(r.at, m.tz);
      const eff = marks.has(s.week) ? (byWeek.get(s.week) || new Set()) : usual;
      const list = free.get(r.min);
      if (eff.has(s.key) && !list.includes(m.id)) list.push(m.id);
    }
  }
  return { rows, free };
}

// 從 start（那一天的分鐘）開始、連續 minutes 分鐘都有空的人。跨過午夜的那一段不看（行事曆一次只看一天）。
export function freeThrough(free, start, minutes) {
  let out = null;
  for (let t = start; t < start + minutes; t += 30) {
    const ids = free.get(t);
    if (!ids) break;
    out = out === null ? ids.slice() : out.filter(id => ids.includes(id));
  }
  return out || [];
}
// 那一段裡至少有一格有空的人（「只有一部分有空」那個標要用）。
export function freeAny(free, start, minutes) {
  const out = new Set();
  for (let t = start; t < start + minutes; t += 30) for (const id of free.get(t) || []) out.add(id);
  return [...out];
}

// 顏色深淺：有空的人數除以這一天最多的那一格，0 到 1。全部都沒人就 0。
export function shade(n, max) { return max > 0 ? Math.round((n / max) * 100) / 100 : 0; }

// 填過時間的人（2026-11-27，排會那一塊每一個人後面的標要分「沒空」與「沒填」）：有時區，而且平常的格子或某一週的例外至少動過一次。
// 有 mark 但沒有格子也算填過（那一週他說自己完全沒空）。沒設時區算不出來，跟沒填一樣。
export function filledIds(members, slots, weekMarks) {
  const out = new Set();
  for (const m of members || []) {
    if (!m.tz) continue;
    if (((slots && slots.get(m.id)) || new Set()).size || ((weekMarks && weekMarks.get(m.id)) || new Set()).size) out.add(m.id);
  }
  return out;
}
