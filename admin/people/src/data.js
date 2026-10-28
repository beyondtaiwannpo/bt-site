// 後台「人與權限」那一組的資料層：邀請碼（職位與 team 的改動是批 3 的事）。
// 2026-10-15 從 admin/src/data.js 原樣搬過來（後台拆成四個資料夾，見 README「後台的四個資料夾」）。
// 直接用 shared/，**不 import 別的功能資料夾**，也不 import admin/src/。
import { supabase } from "../../../shared/supabase.js";
import { authMessage, whoAmI } from "../../../shared/auth.js";
import { T, lang } from "./strings.js";

const need = () => { if (!supabase) throw new Error(authMessage(null)); };

// 我是誰。role 決定看不看得到這一頁，board_role 決定改不改得動，
// team 決定看得到哪一份表單。**三個都要**，少一個就得在別的地方猜。
export async function loadMe(userId) {
  need();
  // 2026-11-06 起從 shared/auth.js 的 whoAmI() 拿：profiles 與 my_access() 同時查、同一個分頁十分鐘內不重問
  //（理由與清除時機寫在那裡）。這裡只負責把那一列整理成這一組要的形狀。
  const { row: data, ws } = await whoAmI(userId);
  if (!data) return null;
  return {
    role: data.role,
    board: data.board_role || "member",
    team: data.team || "",
    name: data.name_zh || data.name_en || "",
    // 2026-10-24 起職級四級。senior 是「Co-President 或 Senior Adviser」，跟資料庫的 is_senior() 同一條規則：
    // 這一組整組開給他們；發碼、改名、刪人、改職級、結束這一屆仍然只有 Co-President（pres）。
    senior: data.board_role === "president" || data.board_role === "senior_adviser",
    pres: data.board_role === "president",
    ws,
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

// ── 邀請信（2026-10-29）。門在資料庫：邀請與重寄 require_senior、撤銷 require_president、清單 is_senior。 ──
export const loadInviteList = () => rpc("invites_for_review");
export const invitePerson   = d => rpc("invite_person", { p_email: d.email, p_grants: d.grants, p_rank: d.rank || null,
  p_name_zh: d.name_zh || null, p_name_en: d.name_en || null, p_title_en: d.title_en || null, p_title_zh: d.title_zh || null,
  p_team: d.team || null, p_term: d.term || null, p_line: d.line || null, p_note: d.note || null,
  p_lang: lang(),      // 被邀請的人還沒有帳號，邀請信用邀請人此刻的介面語言（Paul 2026-10-26）
  // 2026-11-07：掛到名單上既有的一筆。null 讓資料庫自己對名字（剛好一筆就掛）、某一筆的 id 是畫面選定的、全零是「一定建新的」。
  p_person: d.person || null });
export const resendInvite   = code => rpc("resend_invite", { p_code: code, p_lang: lang() });
export const revokeInvite   = code => rpc("revoke_invite", { p_code: code });
// 排進 outbox 之後立刻寄（跟審核那一頁同一支函式）。
export const sendMail       = () => rpc("send_pending_mail", { p_limit: 40 });
// 把老幹部請回來（2026-11-07）：對名單上沒有帳號的一筆直接寄邀請信、一次一批、名單上每一筆最近一組邀請的狀態。
// 門都在資料庫（invite_back 與 invite_back_many 是 require_senior，roster_invites 的 where 裡是 is_senior）。
export const inviteBack      = (person, email, lg, line) => rpc("invite_back", { p_person: person, p_email: email, p_lang: lg || lang(), p_line: line || null });
export const inviteBackMany  = rows => rpc("invite_back_many", { p_rows: rows });
export const loadRosterInvites = () => rpc("roster_invites");

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

// ── 職級與指派（2026-10-24，權限重新設計批 2）─────────────────────────
// 設計：docs/2026-10-23-權限重新設計.md。名單從 roster() 讀（含沒有帳號的人與歷屆職位，
// 門 is_senior() 在函式本文裡，別人叫回來是空的）。寫全部走函式，每一筆都記 role_changes。
// 這一支裡沒有任何一句直接 insert / update 新的那五張表：表對前端只有讀的權限。
const rpc = async (fn, args) => {
  need();
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw error;
  return data;
};
export const loadPeople      = () => rpc("roster");
export const loadTerms       = async () => {
  need();
  const { data, error } = await supabase.from("terms")
    .select("id, title_zh, title_en, starts_on, ends_on, status").order("starts_on", { ascending: false });
  if (error) throw error;
  return data || [];
};
export const loadWorkspaces  = async () => {
  need();
  const { data, error } = await supabase.from("workspaces")
    .select("id, kind, team, title_zh, title_en, owner, active").order("id");
  if (error) throw error;
  return data || [];
};
export const loadMembers     = ws => rpc("workspace_members", { p_ws: ws });
export const assign          = (id, ws, level) => rpc("assign", { p_target: id, p_ws: ws, p_level: level });
export const unassign        = (id, ws) => rpc("unassign", { p_target: id, p_ws: ws });
export const createWorkspace = (slug, zh, en, owner) => rpc("create_workspace", { p_slug: slug, p_title_zh: zh, p_title_en: en, p_owner: owner || null });
export const setPosition     = (person, term, zh, en, team) => rpc("set_position", { p_person: person, p_term: term, p_title_zh: zh, p_title_en: en, p_team: team || null });
export const deletePosition  = (person, term, team) => rpc("delete_position", { p_person: person, p_term: term, p_team: team || null });
// 註冊用的 email，只有 Co-President 與 Senior Adviser 拿得到（門在函式裡）；沒有帳號回 null。
export const personEmail     = person => rpc("person_email", { p_person: person });
export const renamePerson    = (person, zh, en) => rpc("rename_person", { p_person: person, p_name_zh: zh, p_name_en: en });
export const addPerson       = (zh, en, note) => rpc("add_person", { p_name_zh: zh, p_name_en: en, p_note: note || null });
export const removeMember    = person => rpc("remove_member", { p_person: person });
export const deletePerson    = person => rpc("delete_person", { p_person: person });
export const mergePeople     = (keep, drop) => rpc("merge_people", { p_keep: keep, p_drop: drop });
export const createInviteFor = (person, code, note) => rpc("create_invite_for", { p_person: person, p_code: code, p_note: note || null });
export const createTerm      = (id, zh, en, starts, ends) => rpc("create_term", { p_id: id, p_title_zh: zh, p_title_en: en, p_starts: starts, p_ends: ends });
export const importPositions = (term, rows) => rpc("import_positions", { p_term: term, p_rows: rows });
export const endTerm         = (id, zh, en, starts, ends, keep) => rpc("end_term", { p_next_id: id, p_next_title_zh: zh, p_next_title_en: en, p_starts: starts, p_ends: ends, p_keep: keep });

// 資料庫丟出來的錯誤代碼翻成人話。
//
// **看到這幾句話的人多半是一個沒有設定過 Vault 的學生。**
// 「mail_not_configured」對他來說跟一段亂碼沒有兩樣，
// 而他需要知道的是「去哪裡做什麼」，不是那個代碼長什麼樣。
// 每一列是 [代碼, 中文, 英文]（2026-10-19 中英切換），says() 看現在的語言挑一句。代碼本身不動。
const SAYS = [
  // 邀請信（2026-10-29）
  // 2026-11-07 改成三欄的寫法：原本用 T({zh,en}) 在載入那一刻就定了語言，切換之後不會跟著換。
  ["invite_pending",     "這個 email 或這一筆紀錄還有一組活著的邀請（還沒過期、還沒撤銷）。要換就先撤銷，或直接重寄那一組。", "This email or record still has a live invite (not expired, not revoked). Revoke it first, or resend that one."],
  ["email_has_account",  "這個 email 已經有登入帳號了，他直接登入就好。是別人的話換一個 email。", "This email already has a login account; they can just sign in. If it is a different person, use another email."],
  ["bad_email",          T({ zh: "email 的格式不對。", en: "That is not a valid email." }), ""],
  ["already_claimed",    T({ zh: "這組邀請已經被認領了，不用重寄。", en: "This invite was already claimed; no need to resend." }), ""],
  ["not_an_invite",      T({ zh: "這不是邀請信的碼。", en: "That is not an invite code." }), ""],
  ["term_required",      T({ zh: "填了職位就要選屆別。", en: "Pick a term when you give a position." }), ""],
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
  // 職級與指派（2026-10-24）。排在泛用的那幾條前面。
  ["not_senior", "只有 Co-President 與 Senior Adviser 可以做這件事。", "Only Co-Presidents and Senior Advisers can do this."],
  ["not_ws_manage:", "你對這個工作區不是「管」，派不了人。找這個工作區的管理者或 Co-President。", "You do not manage this workspace, so you cannot assign people. Ask its manager or a Co-President."],
  ["not_ws_edit:", "你沒有被派進這個工作區，改不了。", "You are not assigned to this workspace, so you cannot edit it."],
  ["bad_level", "等級只有看、改、管三種。", "A level is one of view, edit or manage."],
  ["no_such_workspace", "找不到這個工作區，重新整理再試一次。", "Workspace not found. Refresh and try again."],
  ["bad_slug", "工作區代號只能用小寫英文字母、數字和連字號，2 到 40 個字。", "A workspace id can only use lowercase letters, digits and hyphens, 2 to 40 characters."],
  ["no_such_person", "找不到這個人，重新整理再試一次。", "Person not found. Refresh and try again."],
  // 把老幹部請回來（2026-11-07）。排在泛用的那幾條前面。
  // person_has_account 一定要排在 has_account 前面：says() 用 includes 比對，排後面永遠輪不到它（2026-11-07 抓到的）。
  ["person_has_account", "這個人已經有登入帳號了，不用邀請。", "This person already has a login account, so no invite is needed."],
  ["ambiguous_person", "名單上有好幾筆同名、沒有帳號的紀錄，先選一筆再寄。", "The roster has several records with this name and no account. Pick one first."],
  ["empty_name", "中文名或英文名至少要填一個。", "Fill in at least one of the Chinese or English name."],
  ["no_account", "這個人沒有帳號，沒有東西可以從平台移除。要拿掉名單上的紀錄用「刪除紀錄」。", "This person has no account, so there is nothing to remove from the platform. Use \"Delete record\" to drop the roster record."],
  ["has_account", "這個人有帳號，不能只刪紀錄。要先用「刪除成員」把帳號移除。", "This person has an account, so the record alone cannot be deleted. Use \"Remove member\" first."],
  ["cannot_remove_self", "不能刪自己。要離開的話，先把另一位 Co-President 升上來，再請他刪你。", "You cannot remove yourself. To leave, promote another Co-President first and have them remove you."],
  ["has_unused_invite", "這一筆還綁著一組活著的邀請或校友碼。先在上面「邀請回來」那一塊撤銷它，或到邀請頁停用那組碼。", "This record still has a live invite or alumni code. Revoke it under \"Invite back\" above, or disable the code on the Invites page."],
  ["record_claimed", "這一筆紀錄已經被別的帳號認走了。", "This record has already been claimed by another account."],
  ["both_have_accounts", "兩筆都有帳號，不能合併。先確認哪一個帳號是對的，把另一個用「刪除成員」移除。", "Both records have accounts, so they cannot be merged. Decide which account is right and remove the other with \"Remove member\"."],
  ["same_person", "選到同一筆了。", "That is the same record."],
  ["term_exists", "已經有這個屆別代號了。", "That term id already exists."],
  ["no_current_term", "現在沒有哪一屆是這一屆，要先在 Supabase 把一屆設成 current。", "No term is current right now. Set one to current in Supabase first."],
  ["must_keep_self", "留下的名單裡一定要有你自己，不然按下去你就變成校友了。", "You must be on the keep list, or you would become an alumnus the moment you press it."],
  ["bad_rows", "貼進來的內容讀不出來，一行一個人，欄位用逗號隔開。", "Could not read the pasted lines. One person per line, fields separated by commas."],
  ["public.roster", "職級與指派的函式還不在資料庫裡，要先跑 2026-10-24-ranks-and-workspaces.sql。", "The ranks and workspaces functions are not in the database yet. Run 2026-10-24-ranks-and-workspaces.sql first."],
  ["public.assign", "職級與指派的函式還不在資料庫裡，要先跑 2026-10-24-ranks-and-workspaces.sql。", "The ranks and workspaces functions are not in the database yet. Run 2026-10-24-ranks-and-workspaces.sql first."],
  ["public.terms", "屆別那張表還不在資料庫裡，要先跑 2026-10-24-ranks-and-workspaces.sql。", "The terms table is not in the database yet. Run 2026-10-24-ranks-and-workspaces.sql first."],
  ["public.workspaces", "工作區那張表還不在資料庫裡，要先跑 2026-10-24-ranks-and-workspaces.sql。", "The workspaces table is not in the database yet. Run 2026-10-24-ranks-and-workspaces.sql first."],
  // 人與權限（2026-10-21）。排在泛用的那一條前面。
  ["bad_role", "職級只有 Associate、Director、Senior Adviser、Co-President 四種。", "A rank is one of Associate, Director, Senior Adviser or Co-President."],
  ["cannot_demote_self", "不能把自己降級。要交棒的話，先把對方升成 Co-President，再請對方把你降下來。", "You cannot demote yourself. To hand over, promote the other person to Co-President first and have them demote you."],
  ["team_locked", "這個人的 team 鎖住了，只能從這裡改。重新整理再試一次。", "This person's team is locked and can only be changed here. Refresh and try again."],
  ["team_needs_president", "勾進那個 team 會多出後台的權限，要從這裡改。重新整理再試一次。", "Joining that team grants admin access, so it has to be changed here. Refresh and try again."],
  ["public.set_team", "人與權限的函式還不在資料庫裡，要先跑 2026-10-21-people-admin.sql。", "The people admin functions are not in the database yet. Run 2026-10-21-people-admin.sql first."],
  ["public.set_board_role", "人與權限的函式還不在資料庫裡，要先跑 2026-10-21-people-admin.sql。", "The people admin functions are not in the database yet. Run 2026-10-21-people-admin.sql first."],
  ["role_changes", "變動紀錄那張表還不在資料庫裡，要先跑 2026-10-21-people-admin.sql。", "The change log table is not in the database yet. Run 2026-10-21-people-admin.sql first."],
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
