// 後台「人與權限」那一組的資料層：邀請碼（職位與 team 的改動是批 3 的事）。
// 2026-10-15 從 admin/src/data.js 原樣搬過來（後台拆成四個資料夾，見 README「後台的四個資料夾」）。
// 直接用 shared/，**不 import 別的功能資料夾**，也不 import admin/src/。
import { supabase } from "../../../shared/supabase.js";
import { authMessage } from "../../../shared/auth.js";

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
  };
}

// ── 邀請碼（2026-10-14）──────────────────────────────────────────────
// 只讀。invite_codes 與 invite_uses 兩張表對所有登入身分都是關的，
// 唯一的出口是 invite_codes_for_review()，門（is_president）寫在那一支的本文裡
// （2026-10-14-invite-uses.sql）。不是 Co-President 的人叫它會拿到空的清單。
export async function loadInvites() {
  need();
  const { data, error } = await supabase.rpc("invite_codes_for_review");
  if (error) throw error;
  return data || [];
}

// 新增與停用（2026-10-14）。門在資料庫那兩支函式的第一句（2026-10-15-invite-admin.sql）。
// uses 用 Number() 轉：input 的 value 是字串，送 "1" 給 int 參數 PostgREST 會找不到這支函式。
export async function createInvite(code, grants, uses, note) {
  need();
  const { data, error } = await supabase.rpc("create_invite",
    { p_code: code, p_grants: grants, p_uses: Number(uses), p_note: note });
  if (error) throw error;
  return data;
}

export async function disableInvite(code) {
  need();
  const { error } = await supabase.rpc("disable_invite", { p_code: code });
  if (error) throw error;
}

// ── 幹部名單、職位與 team（2026-10-21，批 3）────────────────────────────
// 名單讀走 RLS（幹部讀得到所有幹部的 profiles）。寫全部走函式：
// set_board_role() 與 set_team()，門在第一句 require_president()，每一筆都寫進 role_changes。
export async function loadRoster() {
  need();
  const { data, error } = await supabase.from("profiles")
    .select("id, name_zh, name_en, team, board_role")
    .eq("role", "cadre");
  if (error) throw error;
  return (data || []).sort((a, b) =>
    String(a.name_zh || a.name_en || "").localeCompare(String(b.name_zh || b.name_en || ""), "zh-Hant"));
}

// 變動紀錄。表的 RLS 只放 Co-President，別人讀回來是空的。最近的在前，只拿 30 筆。
export async function loadRoleChanges() {
  need();
  const { data, error } = await supabase.from("role_changes")
    .select("id, changed_by, target, target_name, field, old_value, new_value, created_at")
    .order("created_at", { ascending: false }).limit(30);
  if (error) throw error;
  return data || [];
}

export async function loadPrivilegedTeams() {
  need();
  const { data, error } = await supabase.from("privileged_teams").select("name, note").order("name");
  if (error) throw error;
  return data || [];
}

export async function setBoardRole(id, role) {
  need();
  const { data, error } = await supabase.rpc("set_board_role", { p_target: id, p_role: role });
  if (error) throw error;
  return data;
}

export async function setTeam(id, team) {
  need();
  const { data, error } = await supabase.rpc("set_team", { p_target: id, p_team: team || "" });
  if (error) throw error;
  return data;
}

// 資料庫丟出來的錯誤代碼翻成人話。
//
// **看到這幾句話的人多半是一個沒有設定過 Vault 的學生。**
// 「mail_not_configured」對他來說跟一段亂碼沒有兩樣，
// 而他需要知道的是「去哪裡做什麼」，不是那個代碼長什麼樣。
const SAYS = [
  // ⚠ mail_not_configured **不在這張表裡，它走下面的特例**。
  // 2026-09-08：Paul 照步驟設定了，但名字打成「Resend API」，
  // 而畫面上顯示的是這裡寫死的一句話 —— 看起來像他什麼都沒做。
  // 資料庫那一端已經改成會說「缺哪一個、Vault 裡實際有什麼」，
  // **那句話一定要傳到畫面上**，不能被這裡的罐頭訊息蓋掉。
  ["not_director_of:",
   "這裡面有一份不是你這個 team 的申請，所以整批都沒有動。"],
  ["not_president", "只有當屆 Co-President 可以做這件事。"],
  // set_story_approved() 的第二條失敗路徑（那一列不存在也走這裡）。
  // ⚠ 排在 not_a_cadre / not_cadre **前面**：這張表是「誰先被 includes 命中誰贏」，
  // 而這幾個代碼長得很像，哪天有人加一個含有它們的新代碼就會被前面那條吃掉。
  ["not_alumni_or_cadre", "這個人不是幹部也不是校友，不能放上校友頁。"],
  ["not_a_cadre", "這個人不是幹部，不能放上團隊頁。"],
  ["not_cadre", "這個動作只有幹部做得了。"],
  ["not_signed_in", "你的登入已經過期了，重新登入一次就好。"],
  ["form_closed", "這份表單已經關閉了。"],
  ["bad_invite_code", "碼只能用英文字母、數字和連字號，2 到 64 個字，不能有空白或中文。"],
  ["bad_uses", "可以用幾次要填 1 到 100 之間的數字。"],
  ["bad_grants", "要選幹部碼、校友碼或實習生碼。"],
  ["no_such_invite", "找不到這組碼，重新整理再試一次。"],
  ["empty_mail", "主旨與內容都要寫，不能只寫一個。"],
  ["no_such_form", "找不到這份表單，可能已經被刪掉了。"],
  ["no_such_template", "找不到這一種信的文案，可能是遷移檔還沒跑完。"],
  // 實習護照的後台（2026-10-18）
  ["not_internship_team", "只有 Internship team 的幹部與 Co-President 改得動實習護照。"],
  ["bad_term_id", "屆別的代號只能用英文字母、數字和連字號，例如 2027-28。"],
  ["bad_task_id", "格子的代號只能用英文字母、數字和連字號，例如 T2728-01。"],
  ["bad_dates", "結束日要在開始日之後。"],
  ["empty_title", "中文標題與英文標題都要填。"],
  ["bad_category", "分類要選入門、任務或反思。"],
  ["no_such_term", "找不到這一屆，重新整理再試一次。"],
  ["no_such_task", "找不到這一格，重新整理再試一次。"],
  ["term_locked", "已經建好的格子不能換屆。要搬到別屆就另外建一格，這一格停用。"],
  ["has_stamps", "已經有人蓋過這一格，不能刪，只能停用。停用之後他的章還在，新的人不會再看到這一格。"],
  // 人與權限（2026-10-21）。排在泛用的那一條前面。
  ["bad_role", "職位只有一般幹部、Director、Co-President 三種。"],
  ["cannot_demote_self", "不能把自己降級。要交棒的話，先把對方升成 Co-President，再請對方把你降下來。"],
  ["team_locked", "這個人的 team 鎖住了，只能從這裡改。重新整理再試一次。"],
  ["team_needs_president", "勾進那個 team 會多出後台的權限，要從這裡改。重新整理再試一次。"],
  ["public.set_team", "人與權限的函式還不在資料庫裡，要先跑 2026-10-21-people-admin.sql。"],
  ["public.set_board_role", "人與權限的函式還不在資料庫裡，要先跑 2026-10-21-people-admin.sql。"],
  ["role_changes", "變動紀錄那張表還不在資料庫裡，要先跑 2026-10-21-people-admin.sql。"],
  ["Could not find the function", "後台的函式還不在資料庫裡，要先跑 2026-10-18-intern-admin.sql。"],
];
export function says(err) {
  const m = String((err && err.message) || err || "");
  // 信件設定的錯誤是特例：**保留資料庫講的細節**（缺哪一個、實際有什麼），
  // 後面才補上怎麼修。罐頭訊息蓋掉細節的話，看的人就少了唯一的線索。
  if (m.includes("mail_not_configured")) {
    return m.replace("mail_not_configured：", "信件還沒設定好：").replace("mail_not_configured", "信件還沒設定好") +
      "　修法：到 Supabase 的 Vault 把那兩個 secret 的名字改成 RESEND_API_KEY 與 BT_MAIL_FROM（大小寫與底線要一樣），並確認 pg_net 已經打開。";
  }
  // 撞碼也是特例：資料庫會說撞到的是哪一組，那一組的名字要留在畫面上。
  const clash = m.match(/invite_exists:\s*(\S+)/);
  if (clash) return `已經有一組「${clash[1]}」了。大小寫和前後空白不算差別，換一組碼。`;
  for (const [code, text] of SAYS) if (m.includes(code)) return text;
  return m;
}
