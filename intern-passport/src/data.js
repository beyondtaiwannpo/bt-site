// 實習護照的儲存層。這個資料夾裡唯一碰資料庫的檔案，跟 /passport/ 的 data.js 同一個分工：
// ui.js 只畫畫面、main.js 只接事件，兩者都不認識 supabase client。
//
// 這本護照 2026-10-15 Paul 拍板走方案 C：**跟幹部護照完全分開的表**
// （intern_terms / intern_tasks / intern_passports / intern_stamps / intern_entries），
// 前端也是另一份。兩份程式碼長得像是刻意的：抄的是「格子、蓋章、心得、進度牆」四件事，
// 入境章、機讀碼、匯出匯入、里程碑都沒抄。幹部護照改了什麼，這裡要不要跟，是另一個決定。
//
// 安全性不在這個檔案裡，在資料庫裡。這裡每一句 .eq("user_id", ...) 都只是少傳一點資料，
// 真正擋住別人心得的是 intern_entries 那四條 RLS（2026-10-17-intern-passport.sql）。
import { supabase } from "../../shared/supabase.js";
import { T } from "./strings.js";
import { currentUser } from "../../shared/auth.js";

export { signOut, isOfflineError, sessionGone, currentUserDetailed, currentUser } from "../../shared/auth.js";

async function requireUser() {
  const user = await currentUser();
  if (!user) throw new Error(T("err.notSignedIn"));
  return user;
}

// 彼此不相依的查詢一起發（手機網路上序列發很有感）。
// 這一屆是哪一屆由 intern_terms.active 決定，格子只拿那一屆的。
// Internship team 的幹部（S.staff）也走這一條：他讀得到 terms / tasks / 別人的 stamps，
// 自己的 intern_passports 與 intern_entries 會回空的，畫面上只會給他進度牆。
function fetchAll(user) {
  return Promise.all([
    supabase.from("intern_terms").select("*").eq("active", true).maybeSingle(),
    supabase.from("profiles").select("id, name_zh, name_en, avatar, role, team, board_role").eq("id", user.id).maybeSingle(),
    supabase.from("intern_passports").select("*").eq("id", user.id).maybeSingle(),
    supabase.from("intern_stamps").select("task_id, stamped_on").eq("user_id", user.id),
    supabase.from("intern_entries").select("task_id, note, photo").eq("user_id", user.id)
  ]);
}

// 任何一個查詢失敗就整批視為失敗，理由跟幹部護照一樣：少了 stamps 的畫面
// 看起來就是「一個章都沒蓋」，intern 會以為自己的紀錄不見了然後重蓋一次。
const firstError = rs => (rs.find(r => r.error) || {}).error || null;

export async function loadAll() {
  const user = await currentUser();
  if (!user) return { role: null, staff: false, term: null, profile: null, tasks: [], stamps: {}, entries: {} };

  let [te, pf, pa, st, en] = await fetchAll(user);
  let firstErr = firstError([te, pf, pa, st, en]);
  // PGRST303（剛註冊那一瞬間的時鐘誤差）只重試這一種、只重試一次。
  // 2000ms 不要調小，理由在 passport/src/data.js 同一段。
  if (firstErr && firstErr.code === "PGRST303") {
    await new Promise(r => setTimeout(r, 2000));
    [te, pf, pa, st, en] = await fetchAll(user);
    firstErr = firstError([te, pf, pa, st, en]);
  }
  if (firstErr) throw firstErr;

  // 格子要等知道是哪一屆才查得到。沒有 active 的屆別就是空的，畫面會說。
  const term = te.data || null;
  let tasks = [];
  if (term) {
    const ta = await supabase.from("intern_tasks").select("*").eq("term", term.id).eq("active", true).order("seq");
    if (ta.error) throw ta.error;
    tasks = ta.data || [];
  }

  // 蛇梯棋（2026-10-22）：這一屆開著的棋盤、格子、大家在第幾格。
  // **三個查詢載不到不讓護照打不開**（遷移檔還沒跑、或棋盤沒開都會是空的）：棋盤是護照上面的一層，不是護照。
  let board = null, squares = [], positions = [];
  if (term) {
    const [bo, sq, po] = await Promise.all([
      supabase.from("intern_boards").select("term, size, active").eq("term", term.id).eq("active", true).maybeSingle(),
      supabase.from("intern_squares").select("pos, kind, task_id, goes_to").eq("term", term.id).order("pos"),
      supabase.rpc("intern_positions"),
    ]);
    if (!bo.error && bo.data) { board = bo.data; squares = sq.error ? [] : (sq.data || []); positions = po.error ? [] : (po.data || []); }
  }

  const stamps = {};
  (st.data || []).forEach(r => { stamps[r.task_id] = { date: r.stamped_on }; });
  const entries = {};
  (en.data || []).forEach(r => { entries[r.task_id] = { note: r.note, photo: r.photo }; });

  const me = pf.data || {};
  // staff：Internship team 的幹部或 Co-President。這裡算的只是「畫哪個畫面」，
  // 真正決定他讀得到什麼的是資料庫的 is_internship_team()。
  const staff = me.role === "cadre" &&
    (me.board_role === "president" || String(me.team || "").includes("Internship Team"));
  return {
    role: me.role ?? null,
    staff,
    term,
    // 有沒有護照由 intern_passports 那一列決定（claim_invite 建的）。
    // intern 沒有那一列只有一種可能：身分那支遷移檔先跑、護照那支還沒跑的空窗。
    profile: pa.data ? {
      id: user.id,
      name_zh: me.name_zh ?? null,
      name_en: me.name_en ?? null,
      avatar: me.avatar ?? null,
      motto: pa.data.motto,
      issued: pa.data.issued,
      term: pa.data.term
    } : null,
    tasks, stamps, entries,
    board, squares, positions
  };
}

// 擲骰子。骰子在資料庫裡擲（roll_dice()），這裡只收結果：{ rolled, landed, to_pos, kind, goes_to, tickets_left, finished }。
// 沒票、到終點、棋盤沒開，資料庫會用 no_ticket / finished / no_board 擋，main.js 翻成人話。
export async function rollDice() {
  await requireUser();
  const { data, error } = await supabase.rpc("roll_dice");
  if (error) throw error;
  return data;
}
// 大家在第幾格（進度牆與棋盤上別人的棋子）。只有位置、擲過幾次、幾張票，沒有流水。
export async function loadPositions() {
  const { data, error } = await supabase.rpc("intern_positions");
  if (error) throw error;
  return data || [];
}

// 名字住在 profiles（這個人），一句話住在 intern_passports（這本護照）。
// 兩次寫入不是原子的，但都是冪等的 update，失敗看得見，再按一次就補上。
// **不寫 updated_at**：intern_passports 只發了 motto 一欄的 update 權限，多送一欄整句被拒。
export async function saveProfile(p) {
  const user = await requireUser();
  const a = await supabase.from("profiles").update({ name_zh: p.name_zh, name_en: p.name_en }).eq("id", user.id);
  if (a.error) throw a.error;
  const b = await supabase.from("intern_passports").update({ motto: p.motto }).eq("id", user.id);
  if (b.error) throw b.error;
}

// 章先寫、心得後寫：中間斷線的結果是「章在、心得空」，補打一次心得就好。
export async function saveStamp(taskId, { date, note, photo }) {
  const user = await requireUser();
  const s = await supabase.from("intern_stamps")
    .upsert({ user_id: user.id, task_id: taskId, stamped_on: date }, { onConflict: "user_id,task_id" });
  if (s.error) throw s.error;
  const e = await supabase.from("intern_entries")
    .upsert({ user_id: user.id, task_id: taskId, note: note || "", photo: photo || null },
            { onConflict: "user_id,task_id" });
  if (e.error) throw e.error;
}

export async function removeStamp(taskId) {
  const user = await requireUser();
  const e = await supabase.from("intern_entries").delete().eq("user_id", user.id).eq("task_id", taskId);
  if (e.error) throw e.error;
  const s = await supabase.from("intern_stamps").delete().eq("user_id", user.id).eq("task_id", taskId);
  if (s.error) throw s.error;
}

// 進度牆：這一屆每一位 intern 與他蓋了哪幾格。
// intern_stamps(task_id, stamped_on) 是 PostgREST 的關聯查詢，靠 intern_stamps.user_id → profiles.id 那條外鍵。
// ★ select 裡沒有 intern_entries，但真正擋住心得外洩的是 RLS，不是這一行。
// .eq("role","intern") 只是少傳一點：讀得到哪幾列由 profiles_read_interns 那條政策決定。
export async function loadWall() {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, name_zh, name_en, avatar, intern_stamps(task_id, stamped_on)")
    .eq("role", "intern");
  if (error) throw error;
  // 還沒填名字的人不上牆，牆上出現一個沒有名字的人只會讓大家問「那是誰」。
  return (data || []).filter(p => p.name_zh || p.name_en);
}

// 護照號碼由 id 決定、固定不變。前綴 IN 跟幹部護照的 BT 分開。
export function passportNo(id) {
  let h = 0;
  for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return "IN" + String(h % 10000000).padStart(7, "0");
}
