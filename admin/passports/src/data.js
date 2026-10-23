// 後台「護照」那一組的資料層：實習護照的屆別與格子（幹部護照的格子是批 2 的事）。
// 2026-10-15 從 admin/src/data.js 原樣搬過來（後台拆成四個資料夾，見 README「後台的四個資料夾」）。
// 直接用 shared/，**不 import 別的功能資料夾**，也不 import admin/src/。
import { supabase } from "../../../shared/supabase.js";
import { authMessage } from "../../../shared/auth.js";
import { T, lang } from "./strings.js";

const need = () => { if (!supabase) throw new Error(authMessage(null)); };

// 我是誰。role 決定看不看得到這一頁，board_role 決定改不改得動，
// team 決定看得到哪一份表單。**三個都要**，少一個就得在別的地方猜。
export async function loadMe(userId) {
  need();
  const { data, error } = await supabase
    .from("profiles").select("role, board_role, team, name_zh, name_en")
    .eq("id", userId).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    role: data.role,
    board: data.board_role || "member",
    team: data.team || "",
    name: data.name_zh || data.name_en || "",
    senior: data.board_role === "president" || data.board_role === "senior_adviser",
    pres: data.board_role === "president",
    ws: await loadMyWorkspaces(),
  };
}
// 我被派進哪幾個工作區（2026-10-24，my_access()）：{ "apps:Curriculum Team": "manage", … }。
// 這只決定側欄藏不藏、按鈕畫不畫；真正的門在資料庫。叫不到（遷移檔還沒跑）就當成空的，
// 側欄會少幾行，但 Co-President 與 Senior Adviser 靠職級照樣全部看得到。
async function loadMyWorkspaces() {
  const ws = {};
  try {
    const { data } = await supabase.rpc("my_access");
    if (data && Array.isArray(data.workspaces)) for (const w of data.workspaces) ws[w.id] = w.level;
  } catch (e) { /* 空的 */ }
  return ws;
}

// ── 實習護照的後台（2026-10-18）────────────────────────────────────────
// 讀是走 RLS（Internship team 讀得到五張 intern_* 表），寫全部走函式，
// 門在函式第一句 is_internship_team()。表本身對前端只有 select。
export async function loadInternAdmin() {
  need();
  const [te, ta, st, pe] = await Promise.all([
    supabase.from("intern_terms").select("*").order("starts_on", { ascending: false }),
    supabase.from("intern_tasks").select("*").order("term").order("seq"),
    supabase.from("intern_stamps").select("task_id"),
    supabase.from("profiles").select("id").eq("role", "intern"),
  ]);
  for (const r of [te, ta, st, pe]) if (r.error) throw r.error;
  // 每一格被蓋過幾次。後台只要知道「有沒有人蓋過」（刪不刪得掉）與數字，
  // 不要知道是誰 —— 那是進度牆的事。
  const stamped = {};
  for (const r of st.data || []) stamped[r.task_id] = (stamped[r.task_id] || 0) + 1;
  return { terms: te.data || [], tasks: ta.data || [], stamped, interns: (pe.data || []).length };
}

export async function saveInternTerm(t) {
  need();
  const { data, error } = await supabase.rpc("save_intern_term",
    { p_id: t.id, p_title_zh: t.title_zh, p_title_en: t.title_en, p_starts: t.starts_on, p_ends: t.ends_on });
  if (error) throw error;
  return data;
}

export async function activateInternTerm(id) {
  need();
  const { error } = await supabase.rpc("activate_intern_term", { p_id: id });
  if (error) throw error;
}

// seq 用 Number() 轉：input 的 value 是字串，送 "10" 給 int 參數 PostgREST 會找不到這支函式。
export async function saveInternTask(t) {
  need();
  const { data, error } = await supabase.rpc("save_intern_task",
    { p_id: t.id, p_term: t.term, p_seq: Number(t.seq) || 100, p_category: t.category,
      p_title_zh: t.title_zh, p_title_en: t.title_en, p_description: t.description });
  if (error) throw error;
  return data;
}

export async function setInternTaskActive(id, active) {
  need();
  const { error } = await supabase.rpc("set_intern_task_active", { p_id: id, p_active: !!active });
  if (error) throw error;
}

export async function deleteInternTask(id) {
  need();
  const { error } = await supabase.rpc("delete_intern_task", { p_id: id });
  if (error) throw error;
}

// ── 幹部護照的後台（2026-10-20，批 2）────────────────────────────────────
// 讀走 RLS（幹部讀得到 months、activities、destinations 與所有人的 stamps），
// 寫全部走函式，門在函式第一句 require_president()。表本身對前端只有 select。
//
// ⚠ 只讀 stamps 的 act_id，不讀 user_id，**完全不讀 entries**：後台只要知道
// 「這一格有沒有人蓋過」（刪不刪得掉）與數字，不要知道是誰，更不要知道心得。
// entries 的 RLS 本來就只給本人，這裡連查都不查，是為了讓「不碰隱私界線」在程式碼裡看得出來。
export async function loadPassportAdmin() {
  need();
  const [mo, ac, de, st] = await Promise.all([
    supabase.from("months").select("seq, month, theme_zh, theme_en").order("seq"),
    supabase.from("activities").select("id, month, seq, category, title_zh, title_en, description, needs_host, callback_to, active")
      .order("seq").order("id"),
    supabase.from("destinations").select("code, city, active").order("code"),
    supabase.from("stamps").select("act_id"),
  ]);
  for (const r of [mo, ac, de, st]) if (r.error) throw r.error;
  const stamped = {};
  for (const r of st.data || []) stamped[r.act_id] = (stamped[r.act_id] || 0) + 1;
  return { months: mo.data || [], activities: ac.data || [], destinations: de.data || [], stamped };
}

// a = { id（null 是新增）, month, category, title_zh, title_en, description, needs_host, callback_to }
export async function saveActivity(a) {
  need();
  const { data, error } = await supabase.rpc("save_activity", {
    p_id: a.id || null, p_month: Number(a.month), p_category: a.category,
    p_title_zh: a.title_zh, p_title_en: a.title_en, p_description: a.description || null,
    p_needs_host: !!a.needs_host, p_callback_to: a.callback_to || null,
  });
  if (error) throw error;
  return data;
}

export async function setActivityActive(id, active) {
  need();
  const { error } = await supabase.rpc("set_activity_active", { p_id: id, p_active: !!active });
  if (error) throw error;
}

export async function deleteActivity(id) {
  need();
  const { error } = await supabase.rpc("delete_activity", { p_id: id });
  if (error) throw error;
}

export async function saveMonthTheme(seq, themeZh, themeEn) {
  need();
  const { error } = await supabase.rpc("save_month_theme",
    { p_seq: Number(seq), p_theme_zh: themeZh || "", p_theme_en: themeEn || "" });
  if (error) throw error;
}

export async function saveDestination(code, city, active) {
  need();
  const { data, error } = await supabase.rpc("save_destination",
    { p_code: code, p_city: city, p_active: !!active });
  if (error) throw error;
  return data;
}

// 資料庫丟出來的錯誤代碼翻成人話。
//
// **看到這幾句話的人多半是一個沒有設定過 Vault 的學生。**
// 「mail_not_configured」對他來說跟一段亂碼沒有兩樣，
// 而他需要知道的是「去哪裡做什麼」，不是那個代碼長什麼樣。
// 每一列是 [代碼, 中文, 英文]（2026-10-19 中英切換），says() 看現在的語言挑一句。代碼本身不動。
// ── 蛇梯棋的棋盤（2026-10-22）。讀走 RLS，寫走 save_board() 與 set_board_active()，門在函式第一句。 ──
export async function loadBoard(term) {
  need();
  const [b, sq] = await Promise.all([
    supabase.from("intern_boards").select("term, size, active").eq("term", term).maybeSingle(),
    supabase.from("intern_squares").select("pos, kind, task_id, goes_to").eq("term", term).order("pos"),
  ]);
  if (b.error) throw b.error;
  if (sq.error) throw sq.error;
  return { board: b.data || null, squares: sq.data || [] };
}
// squares 是 [{ pos, kind, task_id, goes_to }]，空格不用送。
export async function saveBoard(term, size, squares) {
  need();
  const { data, error } = await supabase.rpc("save_board", { p_term: term, p_size: Number(size), p_squares: squares });
  if (error) throw error;
  return data;
}
export async function setBoardActive(term, active) {
  need();
  const { error } = await supabase.rpc("set_board_active", { p_term: term, p_active: !!active });
  if (error) throw error;
}

const SAYS = [
  ["ladder_must_go_up", "梯子要往上：通到的格子要比這一格大。", "A ladder must go up: the target must be a higher square."],
  ["snake_must_go_down", "蛇要往下：通到的格子要比這一格小。", "A snake must go down: the target must be a lower square."],
  ["last_square_cannot_be_snake", "最後一格不能是蛇頭。", "The last square cannot be a snake."],
  ["bad_task", "有一個任務格綁的格子不是這一屆的。", "A task square points at a box that is not in this term."],
  ["board_locked", "棋盤開著，格數與蛇梯鎖住了。要大改先關掉棋盤，或開新的一屆。", "The board is on, so size, snakes and ladders are locked. Turn it off first, or open a new term."],
  ["bad_size", "格數要在 10 到 60 之間。", "Size must be between 10 and 60."],
  ["no_board", "這一屆還沒有棋盤。", "This term has no board yet."],
  ["public.save_board", "蛇梯棋的函式還不在資料庫裡，要先跑 2026-10-22-intern-board.sql。", "The board functions are not in the database yet. Run 2026-10-22-intern-board.sql first."],
  ["public.set_board_active", "蛇梯棋的函式還不在資料庫裡，要先跑 2026-10-22-intern-board.sql。", "The board functions are not in the database yet. Run 2026-10-22-intern-board.sql first."],
  // ⚠ mail_not_configured **不在這張表裡，它走下面的特例**。
  // 2026-09-08：Paul 照步驟設定了，但名字打成「Resend API」，
  // 而畫面上顯示的是這裡寫死的一句話 —— 看起來像他什麼都沒做。
  // 資料庫那一端已經改成會說「缺哪一個、Vault 裡實際有什麼」，
  // **那句話一定要傳到畫面上**，不能被這裡的罐頭訊息蓋掉。
  ["not_director_of:",
   "這裡面有一份不是你這個 team 的申請，所以整批都沒有動。",
   "One of these applications belongs to another team, so nothing was changed."],
  ["not_president", "只有當屆 Co-President 可以做這件事。", "Only this term's Co-Presidents can do this."],
  // set_story_approved() 的第二條失敗路徑（那一列不存在也走這裡）。
  // ⚠ 排在 not_a_cadre / not_cadre **前面**：這張表是「誰先被 includes 命中誰贏」，
  // 而這幾個代碼長得很像，哪天有人加一個含有它們的新代碼就會被前面那條吃掉。
  ["not_alumni_or_cadre", "這個人不是幹部也不是校友，不能放上校友頁。", "This person is neither a cadre nor an alumnus, so they cannot go on the alumni page."],
  ["not_a_cadre", "這個人不是幹部，不能放上團隊頁。", "This person is not a cadre, so they cannot go on the team page."],
  ["not_cadre", "這個動作只有幹部做得了。", "Only cadres can do this."],
  ["not_signed_in", "你的登入已經過期了，重新登入一次就好。", "Your sign-in has expired. Sign in again."],
  ["form_closed", "這份表單已經關閉了。", "This form is closed."],
  ["bad_invite_code", "碼只能用英文字母、數字和連字號，2 到 64 個字，不能有空白或中文。", "A code can only use letters, digits and hyphens, 2 to 64 characters, no spaces or Chinese."],
  ["bad_uses", "可以用幾次要填 1 到 100 之間的數字。", "Uses must be a number from 1 to 100."],
  ["bad_grants", "要選幹部碼、校友碼或實習生碼。", "Choose a cadre, alumni or intern code."],
  ["no_such_invite", "找不到這組碼，重新整理再試一次。", "Code not found. Refresh and try again."],
  ["empty_mail", "主旨與內容都要寫，不能只寫一個。", "Fill in both subject and body."],
  ["no_such_form", "找不到這份表單，可能已經被刪掉了。", "Form not found. It may have been deleted."],
  ["no_such_template", "找不到這一種信的文案，可能是遷移檔還沒跑完。", "Email copy for this kind not found. The migration may not have run yet."],
  // 實習護照的後台（2026-10-18）
  ["not_internship_team", "只有 Internship team 的幹部與 Co-President 改得動實習護照。", "Only Internship team cadres and Co-Presidents can edit the intern passport."],
  ["bad_term_id", "屆別的代號只能用英文字母、數字和連字號，例如 2027-28。", "A term id can only use letters, digits and hyphens, for example 2027-28."],
  ["bad_task_id", "格子的代號只能用英文字母、數字和連字號，例如 T2728-01。", "A box id can only use letters, digits and hyphens, for example T2728-01."],
  ["bad_dates", "結束日要在開始日之後。", "The end date must be after the start date."],
  ["empty_title", "中文標題與英文標題都要填。", "Fill in both the Chinese and English titles."],
  ["bad_category", "分類要選入門、任務或反思。", "Category must be onboarding, project or reflection."],
  ["no_such_term", "找不到這一屆，重新整理再試一次。", "Term not found. Refresh and try again."],
  ["no_such_task", "找不到這一格，重新整理再試一次。", "Box not found. Refresh and try again."],
  ["term_locked", "已經建好的格子不能換屆。要搬到別屆就另外建一格，這一格停用。", "An existing box cannot move to another term. Create a new box there and disable this one."],
  ["has_stamps", "已經有人蓋過這一格，不能刪，只能停用。停用之後他的章還在，新的人不會再看到這一格。", "Someone has already stamped this box, so it can only be disabled, not deleted. Their stamp stays. New people will not see the box."],
  // 幹部護照的後台（2026-10-20）。**排在下面那條泛用的「Could not find the function」前面**，
  // 不然會被它吃掉、指到錯的遷移檔。
  ["bad_month", "月份要是護照上那 11 個月之一（9 月到隔年 7 月）。", "The month must be one of the 11 passport months (September to the following July)."],
  ["month_full", "這個月的格子已經排到 Z 了，不能再加。", "This month's boxes already go up to Z. No more can be added."],
  ["no_such_activity", "找不到這一格，重新整理再試一次。", "Box not found. Refresh and try again."],
  ["month_locked", "已經建好的格子不能換月份：章是照月份算入境章的。要搬到別的月份就另外建一格，這一格停用。", "An existing box cannot move to another month: entry stamps are counted by month. Create a new box in the other month and disable this one."],
  ["bad_callback", "回望要指向另一個存在的格子編號，例如 09B，不能指向自己。", "Looks back must point to another existing box id, for example 09B, not to itself."],
  ["has_callback", "有別的格子回望這一格，不能刪。先把那一格的回望拿掉。", "Another box looks back at this one, so it cannot be deleted. Remove that box's look-back first."],
  ["no_such_month", "找不到這個月份，重新整理再試一次。", "Month not found. Refresh and try again."],
  ["bad_code", "城市代碼只能用 2 到 8 個英文字母或數字，例如 TPE。", "A city code can only use 2 to 8 letters or digits, for example TPE."],
  ["empty_city", "城市名字要填。", "Enter the city name."],
  ["public.save_activity", "幹部護照後台的函式還不在資料庫裡，要先跑 2026-10-20-passport-admin.sql。", "The cadre passport admin functions are not in the database yet. Run 2026-10-20-passport-admin.sql first."],
  ["public.set_activity_active", "幹部護照後台的函式還不在資料庫裡，要先跑 2026-10-20-passport-admin.sql。", "The cadre passport admin functions are not in the database yet. Run 2026-10-20-passport-admin.sql first."],
  ["public.delete_activity", "幹部護照後台的函式還不在資料庫裡，要先跑 2026-10-20-passport-admin.sql。", "The cadre passport admin functions are not in the database yet. Run 2026-10-20-passport-admin.sql first."],
  ["public.save_month_theme", "幹部護照後台的函式還不在資料庫裡，要先跑 2026-10-20-passport-admin.sql。", "The cadre passport admin functions are not in the database yet. Run 2026-10-20-passport-admin.sql first."],
  ["public.save_destination", "幹部護照後台的函式還不在資料庫裡，要先跑 2026-10-20-passport-admin.sql。", "The cadre passport admin functions are not in the database yet. Run 2026-10-20-passport-admin.sql first."],
  ["Could not find the function", "後台的函式還不在資料庫裡，要先跑 2026-10-18-intern-admin.sql。", "The admin functions are not in the database yet. Run 2026-10-18-intern-admin.sql first."],
];
export function says(err) {
  const m = String((err && err.message) || err || "");
  const col = lang() === "zh" ? 1 : 2;
  // 信件設定的錯誤是特例：**保留資料庫講的細節**（缺哪一個、實際有什麼），
  // 後面才補上怎麼修。罐頭訊息蓋掉細節的話，看的人就少了唯一的線索。
  if (m.includes("mail_not_configured")) {
    return m.replace("mail_not_configured：", T("says.mailNotConfigured") + "：").replace("mail_not_configured", T("says.mailNotConfigured")) +
      T("says.mailFix");
  }
  // 撞碼也是特例：資料庫會說撞到的是哪一組，那一組的名字要留在畫面上。
  const clash = m.match(/invite_exists:\s*(\S+)/);
  if (clash) return T("says.inviteExists", { code: clash[1] });
  for (const row of SAYS) if (m.includes(row[0])) return row[col];
  return m;
}
