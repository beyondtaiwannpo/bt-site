// 「哪一週」的運算。純函式，不碰 DOM、不碰資料庫。
//
// ⚠ **這一支的每一個函式都要收時區，而且那個時區是「那個人自己的」。**
// availability.weekday 與 minute 存的本來就是他自己時區的當地時間
//（那一欄的註解寫著同一句話），週的邊界必須用同一把尺 ——
// 否則一個在休士頓的人與一個在台北的人，「同一週」會指到不同的七天。
//
// 底層一律用 tz.js 既有的三支（partsIn / toInstant 與它們之上的 startOfWeek），
// **不要自己寫日期運算**，理由見 tz.js 的檔頭。
import { partsIn, startOfWeek, addDays } from "./tz.js";

const pad = n => String(n).padStart(2, "0");

// 某個瞬間落在 tz 當地的哪一週。回那一週**星期一**的當地日期，"YYYY-MM-DD"。
//
// 回字串而不是 Date 是刻意的：它是一個曆法上的標籤，不是時間點。
// 資料庫那一欄也是 date，兩邊同一個意思，比對就是字串比對。
export function weekKeyOf(instant, tz) {
  // firstWeekday = 1：一週從星期一開始，跟畫面欄位一致。
  const mon = startOfWeek(instant, tz, 1);
  const p = partsIn(mon, tz);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

// 那一週是不是已經過去（比 now 所在的那一週早）。
// 過去的週不能編輯 —— 改已經過去的時間沒有意義，而且會讓人以為自己在改未來。
export function isPastWeek(weekKey, now, tz) {
  return weekKey < weekKeyOf(now, tz);   // "YYYY-MM-DD" 的字串序就是日期序
}

// 給畫面看的範圍，例如 "9/7 – 9/13"。
export function weekKeyLabel(weekKey) {
  const [y, m, d] = weekKey.split("-").map(Number);
  const e = addDays(y, m, d, 6);
  return `${m}/${d} – ${e.month}/${e.day}`;
}
