// 把每個人的時段換算成觀看者的格子。純函式，抽出來是為了測得到
// （main.js 一 import 就會跑 boot()）。
import { slotInstants, cellOf } from "./tz.js";
import { weekKeyOf } from "./weekkey.js";

// members: [{id, tz}]、slots: Map(id → Set("wd:min")）
// weekSlots: Map(id → Map(weekKey → Set("wd:min")）)、
// weekMarks: Map(id → Set(weekKey)）—— 後兩個參數省略時行為跟以前完全一樣（沒有例外）。
// 回 Map("dayIndex:minute" → [id]）。
//
// **沒設時區的人只跳過他自己，不影響其他人。** 三十個人裡有一個沒設，
// 其他二十九個照樣畫得出來 —— 那一個會出現在成員清單上被催。
//
// ⚠ **逐格判斷，不是逐人逐週判斷。**
// 觀看者的一週，對一個時差半天以上的成員來說可能橫跨他的兩個本地週：
// 一個在休士頓的人，他的「週日晚上」落在台北觀看者這一週的星期一凌晨，
// 那一格屬於他的**上一個**本地週。用「這個成員這一週有沒有例外」一次判斷的話，
// 跨週邊界那幾格會取錯那一邊，而畫面上只會看起來像「這個人的時間怪怪的」。
export function boardCounts(members, slots, weekStart, viewerTz,
                            weekSlots = new Map(), weekMarks = new Map()) {
  const counts = new Map();
  for (const m of members) {
    if (!m.tz) continue;
    const marks = weekMarks.get(m.id) || new Set();
    const byWeek = weekSlots.get(m.id) || new Map();

    // 候選格子 = 平常的，加上這個人所有例外週的（跨週邊界時兩邊都可能用得到）。
    const cand = new Set(slots.get(m.id) || []);
    for (const set of byWeek.values()) for (const k of set) cand.add(k);

    for (const k of cand) {
      const [wd, min] = k.split(":").map(Number);
      for (const inst of slotInstants(weekStart, wd, min, m.tz)) {
        // 這一格落在這個人自己時區的哪一週。
        const wk = weekKeyOf(inst, m.tz);
        // 那一週被動過就只看例外，沒動過就只看平常的。**取代，不是疊加。**
        const eff = marks.has(wk) ? (byWeek.get(wk) || new Set()) : (slots.get(m.id) || new Set());
        if (!eff.has(k)) continue;

        const c = cellOf(inst, weekStart, viewerTz);
        if (!c) continue;
        // 週起點就是星期一（setWeek 傳 firstWeekday = 1），畫面欄位也是
        // 星期一到星期日，所以 dayIndex 直接就是欄號，中間沒有轉換。
        const key = c.dayIndex + ":" + c.minute;
        if (!counts.has(key)) counts.set(key, []);
        if (!counts.get(key).includes(m.id)) counts.get(key).push(m.id);
      }
    }
  }
  return counts;
}

// 第一個有人有空的時刻（分鐘）。沒有人有空就回 null。
// 看板開起來要捲到這裡，理由見 main.js 呼叫它的地方。
export function firstBusyMinute(counts) {
  let best = null;
  for (const k of counts.keys()) {
    const min = Number(k.split(":")[1]);
    if (best === null || min < best) best = min;
  }
  return best;
}
