// 看板的資料層。直接用 shared/，**不 import passport/ 的任何東西**
//（跟 app/ 同一條規矩：護照壞掉不該讓別的功能一起打不開）。
import { supabase } from "../../shared/supabase.js";
import { authMessage, isOfflineError } from "../../shared/auth.js";
import { groupByWeekday } from "./edit.js";

const SLOT = 30;                      // 半小時一格
export const key = (wd, min) => wd + ":" + min;

// 一個人在畫面上要顯示的兩個名字。**純函式，好測** ——
// 上面那個 fetch 需要真的資料庫才跑得起來，而這裡的規則有四種邊界情況
// （只有中文、只有英文、兩欄一樣、兩欄都空），每一種寫錯的表現都是
// 「名單上少一個人或多一個重複的字」，不會報錯。見 test/availability-ui.test.mjs。
export function namesOf(p) {
  const zh = (p.name_zh || "").trim();
  const en = (p.name_en || "").trim();
  return {
    name: zh || en || "（沒有名字）",
    // 兩欄填了同一個字的人不重複顯示；只有一個名字的人也沒有第二個。
    alt: zh && en && zh !== en ? en : "",
  };
}

// 一次把看板需要的五份資料拿回來（profiles、availability、availability_meta，
// 加上 2026-09-12「某一週的例外」新增的 availability_week、availability_week_mark）。
//
// **五個查詢都要成功才算成功。** 只有 profiles 回來、availability 失敗的話，
// 畫面會變成「每個人都完全沒空」——那看起來像大家都還沒填，
// 而不是像出錯了，沒有人會回報。
export async function loadAll() {
  if (!supabase) throw new Error(authMessage(null));
  const [pf, av, mt, wk, wm] = await Promise.all([
    supabase.from("profiles").select("id, name_zh, name_en, team, tz").eq("role", "cadre"),
    supabase.from("availability").select("user_id, weekday, minute"),
    supabase.from("availability_meta").select("user_id, updated_at, notice_seen_at"),
    supabase.from("availability_week").select("user_id, week_start, weekday, minute"),
    supabase.from("availability_week_mark").select("user_id, week_start"),
  ]);
  const bad = [pf, av, mt, wk, wm].find(r => r.error);
  if (bad) throw bad.error;

  const meta = new Map(mt.data.map(r => [r.user_id, r]));
  const slots = new Map();
  for (const r of av.data) {
    if (!slots.has(r.user_id)) slots.set(r.user_id, new Set());
    slots.get(r.user_id).add(key(r.weekday, r.minute));
  }
  // Map(user_id → Map(weekKey → Set("wd:min")）)。
  // ⚠ week_start 從 Postgres 的 date 欄位回來就是 "YYYY-MM-DD" 字串，
  // 跟 weekKeyOf() 回的格式一模一樣，這裡不做任何轉換
  //（轉一次就有機會差一天，而那種 bug 在畫面上只會看起來像「這個人的時間怪怪的」）。
  const weekSlots = new Map();
  for (const r of wk.data || []) {
    if (!weekSlots.has(r.user_id)) weekSlots.set(r.user_id, new Map());
    const byWeek = weekSlots.get(r.user_id);
    if (!byWeek.has(r.week_start)) byWeek.set(r.week_start, new Set());
    byWeek.get(r.week_start).add(key(r.weekday, r.minute));
  }
  // Map(user_id → Set(weekKey)）—— 哪幾週被那個人動過。
  const weekMarks = new Map();
  for (const r of wm.data || []) {
    if (!weekMarks.has(r.user_id)) weekMarks.set(r.user_id, new Set());
    weekMarks.get(r.user_id).add(r.week_start);
  }
  // 2026-09-10：多帶一個 alt（另一個名字）。
  // Paul 的原話：「上面都是中文名不知道是誰」——
  // 幹部分布七個國家，很多人平常只用英文名互相稱呼，
  // 名單上只有中文名的話，看的人認不出那是誰，也就不知道該催誰，
  // 而「知道該催誰」正是這一頁存在的理由（規格 §4-3 C）。
  //
  // **收斂在這裡做一次**，畫面那邊不要再判斷一次哪個名字是主要的。
  const members = pf.data.map(p => ({
    id: p.id,
    ...namesOf(p),
    team: p.team || "",
    tz: p.tz || null,
    updatedAt: meta.get(p.id) ? meta.get(p.id).updated_at : null,
    noticeSeenAt: meta.get(p.id) ? meta.get(p.id).notice_seen_at : null,
  })).sort((a, b) => a.name.localeCompare(b.name, "zh-Hant"));
  return { members, slots, weekSlots, weekMarks };
}

// 存自己的時段。**算出差集只寫差的那幾格，不是先刪光再全部寫回。**
//
// 先刪光再寫回有兩個問題：刪成功而插入失敗的話，他整週的時間就沒了
//（而他以為只是存檔失敗）；就算都成功，trigger 也會為了沒有變的格子
// 白跑幾十次。差集寫法在「只改了一格」的常見情況下只送一個請求。
export async function saveMine(userId, wanted, current) {
  const add = [...wanted].filter(k => !current.has(k));
  const del = [...current].filter(k => !wanted.has(k));
  if (!add.length && !del.length) return { add: 0, del: 0 };

  if (del.length) {
    // 照星期分組刪（分組的理由與測試見 edit.js 的 groupByWeekday）。
    for (const [wd, mins] of groupByWeekday(del)) {
      const { error } = await supabase.from("availability")
        .delete().eq("user_id", userId).eq("weekday", wd).in("minute", mins);
      if (error) throw error;
    }
  }
  if (add.length) {
    const rows = add.map(k => {
      const [wd, min] = k.split(":").map(Number);
      return { user_id: userId, weekday: wd, minute: min };
    });
    const { error } = await supabase.from("availability").insert(rows);
    if (error) throw error;
  }
  return { add: add.length, del: del.length };
}

// 存某一週的例外。**差集寫法**，理由跟 saveMine() 一樣：
// 先刪光再寫回的話，刪成功而插入失敗等於他那一週的資料沒了，
// 而他以為只是存檔失敗；就算兩句都成功，也會白跑幾十次不需要的請求。
//
// ⚠ **不准用 .upsert()。** availability_week 完全沒有發 update 權限
//（見遷移檔 2026-09-20-availability-week.sql：只發了 select / insert / delete，
// 一個 update 都沒有 —— 這跟「欄位層級授權」不一樣，欄位層級授權是像
// availability_meta 那樣只開放某幾欄可以 update，這裡是整張表的 update 都沒開），
// upsert 會把 payload 每一欄都塞進 ON CONFLICT DO UPDATE 的 SET 清單，
// 而這張表沒有任何一欄拿得到 update 授權，整句就會被 Postgres 拒絕。
// 症狀是「按了存檔沒反應」——availability_meta 2026-09-02 就是這樣壞掉的，
// 抄同一個教訓，這裡從一開始就不要犯。
export async function saveWeek(userId, weekKey, wanted, current) {
  const add = [...wanted].filter(k => !current.has(k));
  const del = [...current].filter(k => !wanted.has(k));

  // mark 一定要在，**就算一格都沒勾** —— 那正是「這一週我完全沒空」，
  // 不是「沒填過例外」。兩種狀態在 availability_week 都是零列，
  // 沒有 mark 就分不出來。
  const m = await supabase.from("availability_week_mark")
    .insert({ user_id: userId, week_start: weekKey });
  // 23505 = 主鍵重複，代表這一週本來就被動過（mark 已經存在），
  // 那不是錯誤，吞掉繼續往下走。
  if (m.error && m.error.code !== "23505") throw m.error;

  if (del.length) {
    // 照星期分組刪，理由與測試見 edit.js 的 groupByWeekday。
    for (const [wd, mins] of groupByWeekday(del)) {
      const { error } = await supabase.from("availability_week")
        .delete().eq("user_id", userId).eq("week_start", weekKey)
        .eq("weekday", wd).in("minute", mins);
      if (error) throw error;
    }
  }
  if (add.length) {
    const rows = add.map(k => {
      const [wd, min] = k.split(":").map(Number);
      return { user_id: userId, week_start: weekKey, weekday: wd, minute: min };
    });
    const { error } = await supabase.from("availability_week").insert(rows);
    if (error) throw error;
  }
  return { add: add.length, del: del.length };
}

// 取消某一週的例外，回到平常的時間。**格子先刪、mark 後刪** ——
// 反過來的話，中間失敗會留下「有格子沒有 mark」的狀態，而那些格子
// 因為沒有 mark 永遠不會被讀到（見 board.js 的判斷邏輯），資料留在庫裡但沒人看得到。
export async function clearWeek(userId, weekKey) {
  const a = await supabase.from("availability_week")
    .delete().eq("user_id", userId).eq("week_start", weekKey);
  if (a.error) throw a.error;
  const b = await supabase.from("availability_week_mark")
    .delete().eq("user_id", userId).eq("week_start", weekKey);
  if (b.error) throw b.error;
}

// 看過告知。規格 §4-5 第 3 點 —— 這是這個功能唯一的知情同意，
// 所以是「按了確認才記」，不是「打開頁面就記」。
// ⚠ **不要用 .upsert()。** 2026-09-02 就是這樣壞掉的，而且是所有人第一次
// 進看板都會撞到的那一道門。
//
// PostgREST 的 upsert 會把 payload 裡的**每一欄**都放進 ON CONFLICT DO UPDATE
// 的 SET 清單，包含 user_id。而 availability_meta 只發了
// `grant update (notice_seen_at)` —— 沒有 user_id。Postgres 要求 SET 清單上
// 每一欄都有權限，所以整句被拒：
//   ERROR: permission denied for table availability_meta
// **欄位授權是對的**（主鍵本來就不該讓前端改），錯的是這裡用錯動詞。
//
// 改成先 update、沒有那一列再 insert。兩句都落在已發的權限裡。
// update 帶 .select() 是為了知道有沒有改到列 —— 沒有它就分不出
// 「改好了」跟「那一列還不存在」。
export async function markNoticeSeen(userId) {
  const at = new Date().toISOString();
  const up = await supabase.from("availability_meta")
    .update({ notice_seen_at: at }).eq("user_id", userId).select("user_id");
  if (up.error) throw up.error;
  if (up.data && up.data.length) return;
  const ins = await supabase.from("availability_meta")
    .insert({ user_id: userId, notice_seen_at: at });
  // 兩個人同時第一次進來的話，第二句可能撞主鍵（23505）。
  // 那代表「已經有那一列了」，跟成功是同一個結果，不該報錯給使用者。
  if (ins.error && ins.error.code !== "23505") throw ins.error;
}

// 「我確認過了，沒有變」。updated_at 前端寫不動，只能走這支 RPC。
export async function confirmUnchanged() {
  const { data, error } = await supabase.rpc("confirm_availability_unchanged");
  if (error) throw error;
  return data;
}

// 設定自己的時區。tz 存在 profiles，欄位授權裡有它。
export async function saveTz(userId, tz) {
  const { error } = await supabase.from("profiles").update({ tz }).eq("id", userId);
  if (error) throw error;
}

export { SLOT, isOfflineError, authMessage };
