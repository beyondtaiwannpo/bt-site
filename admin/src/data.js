// 申請管理的資料層。直接用 shared/，**不 import 別的功能資料夾**
//（跟 app/ 與 availability/ 同一條規矩：一個功能壞掉不該讓別的功能打不開）。
import { supabase } from "../../shared/supabase.js";
import { authMessage, whoAmI } from "../../shared/auth.js";
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
  // id 一定要帶（2026-11-09 補）：之前沒帶，r.requester === me.id 那幾處永遠對不上，
  // 「我送過的」需求單、總覽的「你送的需求單」與「下一場會議」兩張卡都是空的，需求單的草稿也變成大家共用一格。
  return {
    id: userId,
    role: data.role,
    board: data.board_role || "member",
    team: data.team || "",
    name: data.name_zh || data.name_en || "",
    senior: data.board_role === "president" || data.board_role === "senior_adviser",
    pres: data.board_role === "president",
    ws,
  };
}

// 表單清單加每一份收到幾件。
//
// **兩個查詢，不是一句 join。** PostgREST 的巢狀 count 在 RLS 下的行為
// 不好預測（申請那張表的政策跟表單那張不一樣），而「數字少算了」
// 在畫面上看起來完全正常 —— 那是最糟的一種錯。
// 兩句各自誠實，然後在這裡對起來。
export async function loadForms() {
  need();
  const [fs, as] = await Promise.all([
    supabase.from("forms")
      .select("id, team, kind, title, status, lang, opens_at, closes_at, notify_by, updated_at")
      .order("updated_at", { ascending: false }),
    supabase.from("applications").select("form_id, status"),
  ]);
  if (fs.error) throw fs.error;
  if (as.error) throw as.error;
  const byForm = new Map();
  for (const a of as.data) {
    if (!byForm.has(a.form_id)) byForm.set(a.form_id, { total: 0, received: 0 });
    const c = byForm.get(a.form_id);
    c.total++;
    if (a.status === "received") c.received++;
  }
  return fs.data.map(f => ({ ...f, counts: byForm.get(f.id) || { total: 0, received: 0 } }));
}

export async function loadForm(id) {
  need();
  const [f, q] = await Promise.all([
    supabase.from("forms").select("*").eq("id", id).maybeSingle(),
    supabase.from("form_questions").select("*").eq("form_id", id).order("ord"),
  ]);
  if (f.error) throw f.error;
  if (q.error) throw q.error;
  if (!f.data) throw new Error(T("err.noForm"));
  return { form: f.data, questions: q.data || [] };
}

// 新表單一律是 draft。**沒有「建立就開放」這條路**：
// 一份沒有題目的表單開放出去，路人看到的是一個空表單。
export async function createForm(team, title, kind) {
  need();
  const { data, error } = await supabase.from("forms")
    .insert({ team, title, kind, status: "draft" }).select("id").single();
  if (error) throw error;
  return data.id;
}

// 只送畫面上真的有那一格的欄位。**不要整個物件送回去** ——
// 送回一個我們沒有權限寫的欄位（created_at、updated_at）整句會被拒，
// 而那個拒絕長得像「存檔失敗」，看不出是哪一欄的問題（2026-09-01 的坑）。
const FORM_FIELDS = ["title", "intro", "kind", "lang", "status",
                     "opens_at", "closes_at", "notify_by", "interview_url", "team"];
export async function saveForm(id, patch) {
  need();
  const clean = {};
  for (const k of FORM_FIELDS) if (k in patch) clean[k] = patch[k] === "" ? null : patch[k];
  // title 不准變成 null，那會讓清單上出現一份沒有名字的表單。
  if ("title" in clean && !clean.title) throw new Error(T("err.formName"));
  const { error } = await supabase.from("forms").update(clean).eq("id", id);
  if (error) throw error;
}

export async function deleteForm(id) {
  need();
  const { error } = await supabase.from("forms").delete().eq("id", id);
  if (error) throw error;
}

// ord 取現有最大值加一。**不是題目數量加一** ——
// 中間刪過題目的話數量會跟號碼對不上，新題目就會插到中間。
export async function addQuestion(formId, q, existing) {
  need();
  const ord = existing.reduce((m, x) => Math.max(m, x.ord), 0) + 1;
  const { error } = await supabase.from("form_questions").insert({ ...q, form_id: formId, ord });
  if (error) throw error;
}

export async function saveQuestion(id, q) {
  need();
  const { error } = await supabase.from("form_questions")
    .update({ label: q.label, help: q.help, type: q.type, required: q.required, options: q.options })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteQuestion(id) {
  need();
  const { error } = await supabase.from("form_questions").delete().eq("id", id);
  if (error) throw error;
}

// 上下移動：跟旁邊那一題交換 ord。
// **兩句 update，中間會有一瞬間兩題同號** —— 這是可以接受的，
// 因為 form_questions 刻意沒有 unique(form_id, ord)（見那張表的註解）。
// 有 unique 的話這裡就要先搬到一個暫時號碼再搬回來，三句換一個沒人在意的性質。
export async function swapOrd(a, b) {
  need();
  const r1 = await supabase.from("form_questions").update({ ord: b.ord }).eq("id", a.id);
  if (r1.error) throw r1.error;
  const r2 = await supabase.from("form_questions").update({ ord: a.ord }).eq("id", b.id);
  if (r2.error) throw r2.error;
}

// president 開表單的時候要選 team。清單就是現有幹部填過的 team。
// **不寫死六個 team 的名字**：BT 每年換屆，team 會改名也會增減，
// 寫死的那一份會在某一年變成錯的，而且沒有人會想到要來改這裡。
export async function loadTeams() {
  need();
  const { data, error } = await supabase.from("profiles").select("team").eq("role", "cadre");
  if (error) throw error;
  return [...new Set((data || []).map(r => (r.team || "").trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "zh-Hant"));
}

// ── 批 4：申請與寄信 ──────────────────────────────────────────────────

// 一份表單收到的申請，連同答案。
//
// **答案一次全部拿回來，不是點開才查。** 一份表單一百多件、每件十題，
// 是一千多列 —— 對 Postgres 是小事，但「點開才查」會讓審核的人每看一個人
// 就等一次網路，而審核就是一個一個看。
export async function loadApplications(formId) {
  need();
  const [ap, an] = await Promise.all([
    supabase.from("applications")
      .select("id, user_id, applicant_name, applicant_school, applicant_grade, " +
              "applicant_email, guardian_email, status, submitted_at, decided_at, checked_in_at")
      .eq("form_id", formId)
      .order("submitted_at", { ascending: true }),
    supabase.from("application_answers").select("application_id, question_id, value"),
  ]);
  if (ap.error) throw ap.error;
  if (an.error) throw an.error;
  const byApp = new Map();
  for (const a of an.data || []) {
    if (!byApp.has(a.application_id)) byApp.set(a.application_id, new Map());
    byApp.get(a.application_id).set(a.question_id, a.value);
  }
  return (ap.data || []).map(a => ({ ...a, answers: byApp.get(a.id) || new Map() }));
}

// 一次改很多筆。**回傳真的改了幾筆** —— 狀態本來就一樣的不算，
// 那正是「按兩次錄取不會寄兩封信」的地方。
export async function decide(ids, status) {
  need();
  const { data, error } = await supabase.rpc("decide_applications",
    { p_ids: ids, p_status: status });
  if (error) throw error;
  return data;
}

export async function sendMail() {
  need();
  const { data, error } = await supabase.rpc("send_pending_mail", { p_limit: 100 });
  if (error) throw error;
  // 這支函式回的是一列 (sent, failed)。PostgREST 把它包成陣列。
  const row = Array.isArray(data) ? data[0] : data;
  return { sent: (row && row.sent) || 0, failed: (row && row.failed) || 0 };
}

// 還沒寄出去的信。**這一句是用資料庫寄信那個取捨成立的前提** ——
// 看不見的東西壞掉沒有人會發現。
export async function loadPending(formId) {
  need();
  const { data, error } = await supabase.from("mail_outbox")
    .select("id, to_email, kind, created_at, tries, error")
    .eq("form_id", formId).is("sent_at", null)
    .order("created_at");
  if (error) throw error;
  return data || [];
}
// 全部還沒寄出去的信，不分表單（2026-10-15，後台首頁那一句「還有 N 封信沒寄出去」）。
// RLS 決定看得到哪幾封：自己 team 的表單那幾封，Co-President 全部。
// 只拿數字要用的欄位，不拿 to_email 與 body：首頁不需要知道寄給誰。
export async function loadPendingAll() {
  need();
  const { data, error } = await supabase.from("mail_outbox")
    .select("id, form_id, tries, error").is("sent_at", null);
  if (error) throw error;
  return data || [];
}

// 首頁「今天要處理的事」與「你的 team」（2026-10-19，後台第二次重整批 2）。**只讀，沒有寫入。**
// Paul 2026-10-19 拍板加這一支。規矩兩條（設計文件第 3 段第三輪）：
//   1. **只查 canEnter 說進得去的那幾項，其他連問都不問。** 一般幹部不該看到「等你核可 0 人」，
//      那等於告訴他有一個他進不去的功能；而 stories_for_review() 對非 president 回空清單不報錯，光靠結果分不出來。
//   2. intern 的進度**只數筆數，不拿人名**；完全不讀 entries（test/admin-hub.test.mjs 守著）。
// 每一項各自接住：載不到是 null，不是 0。0 跟載不到是兩回事，首頁要分開畫。
export async function loadTodo(me) {
  need();
  // 2026-10-24：pres 這裡的意思是 senior（Co-President 或 Senior Adviser）；istaff 是被派進實習護照工作區的人。
  const pres = !!me && !!me.senior;
  const istaff = pres || !!((me && me.ws) || {})["intern-passport"];
  const q = {
    // 所有幹部讀得到：資源（算每個 team 有幾條）、幹部名單（找每個 team 的 Director；進度牆本來就看得到名字）。
    resources: supabase.from("resources").select("id, team, status"),
    roster: supabase.from("profiles").select("id, name_zh, name_en, team, board_role").eq("role", "cadre"),
    // 2026-10-23 批 4：「你的 team」從工作區算；「你的存取」印工作區的名字；Director 讀不到名單時從公開團隊頁算（公開資料）。
    workspaces: supabase.from("workspaces").select("id, kind, team, title_zh, title_en, active"),
    directors: supabase.rpc("public_team"),
  };
  if (pres) {
    q.team = supabase.from("profiles").select("id").eq("role", "cadre").eq("public_profile", true).eq("public_approved", false);
    q.stories = supabase.rpc("stories_for_review");
  }
  if (istaff) {
    q.interns = supabase.from("profiles").select("id").eq("role", "intern");
    q.stamps = supabase.from("intern_stamps").select("task_id");
  }
  const keys = Object.keys(q);
  const rs = await Promise.allSettled(keys.map(k => q[k]));
  const out = {};
  keys.forEach((k, i) => {
    const r = rs[i];
    out[k] = r.status === "fulfilled" && !r.value.error ? (r.value.data || []) : null;
  });
  return out;
}

// ── 批 6：活動營運 ────────────────────────────────────────────────────
export async function setCheckIn(ids, present) {
  need();
  const { data, error } = await supabase.rpc("set_check_in",
    { p_ids: ids, p_present: present });
  if (error) throw error;
  return data;
}

export async function sendNotice(formId, statuses, subject, body) {
  need();
  const { data, error } = await supabase.rpc("send_notice",
    { p_form_id: formId, p_statuses: statuses, p_subject: subject, p_body: body });
  if (error) throw error;
  return data;
}

// 資料庫丟出來的錯誤代碼翻成人話。
//
// **看到這幾句話的人多半是一個沒有設定過 Vault 的學生。**
// 「mail_not_configured」對他來說跟一段亂碼沒有兩樣，
// 而他需要知道的是「去哪裡做什麼」，不是那個代碼長什麼樣。

// ── 成員分頁（2026-10-23，第三次重整批 3）：讀誰在工作區裡、找人的名單、派與移出。門都在資料庫那三支函式裡。 ──
export async function loadWorkspaces() {
  need();
  const { data, error } = await supabase.from("workspaces").select("id, kind, team, title_zh, title_en, owner, active").order("id");
  if (error) throw error;
  return data || [];
}
export async function loadMembers(ws) {
  need();
  const { data, error } = await supabase.rpc("workspace_members", { p_ws: ws });
  if (error) throw error;
  return data || [];
}
// 找人用：幹部的名字與職級。幹部本來就讀得到所有幹部的這幾欄（profiles_read），**不讀 email**。
export async function loadCadres() {
  need();
  const { data, error } = await supabase.from("profiles").select("id, name_zh, name_en, board_role, team").eq("role", "cadre").order("name_en");
  if (error) throw error;
  return data || [];
}
export async function assign(id, ws, level) {
  need();
  const { data, error } = await supabase.rpc("assign", { p_target: id, p_ws: ws, p_level: level });
  if (error) throw error;
  return data;
}
export async function unassign(id, ws) {
  need();
  const { data, error } = await supabase.rpc("unassign", { p_target: id, p_ws: ws });
  if (error) throw error;
  return data;
}

// 每一列是 [代碼, 中文, 英文]（2026-10-19 中英切換），says() 看現在的語言挑一句。代碼本身不動。
const SAYS = [
  // 會議（2026-11-02）
  ["not_invited", "這場會的名單上沒有你。", "You are not on this meeting's list."],
  ["bad_doc_url", "會議紀錄的連結要是 Google Docs 或 Drive 的。", "The notes link must be a Google Docs or Drive link."],
  ["bad_time", "結束要在開始之後。", "The end must be after the start."],
  ["no_such_meeting", "找不到這場會，可能已經刪了。", "Meeting not found; it may have been deleted."],
  // 活動上架（2026-11-01）
  ["not_team_manager", "開活動要是那個 team 的 Director（資源工作區「管」）或 Co-President。", "Creating an event needs that team's Director (Manage on its resources) or a Co-President."],
  ["slug_taken", "這個代號已經有活動用了，換一個。", "That slug is already used by another event."],
  ["bad_slug", "代號只能用小寫英文、數字和連字號，2 到 40 個字。", "The slug can only use lowercase letters, digits and hyphens, 2 to 40 characters."],
  ["cover_not_https", "封面網址要是 https:// 開頭。", "The cover URL must start with https://."],
  ["consent_required", "封面有填就要勾「照片裡的人與那場活動都在拍攝同意範圍內」。", "With a cover image you must tick the photo-consent box."],
  ["need_both_titles", "中英標題都要填才能準備好。", "Both titles are needed before it can be marked ready."],
  ["need_start", "要填開始時間才能準備好。", "A start time is needed before it can be marked ready."],
  ["already_published", "已經在對外頁上了，要改先請 Co-President 撤下來。", "Already published; ask a Co-President to unpublish first."],
  ["not_ready", "要先按「準備好了」。", "Mark it ready first."],
  ["not_published", "這場活動不在對外頁上。", "This event is not published."],
  ["no_such_event", "找不到這場活動，重新整理再試一次。", "Event not found. Refresh and try again."],
  ["full", "額滿了。", "Full."],
  // 行銷需求單（2026-10-31）
  ["not_allowed", "你對行銷需求單是「看」，改狀態要「改」以上，找 Marketing 的 Director。", "You have View on Marketing requests; changing status needs Edit. Ask the Marketing Director."],
  ["already_started", "Marketing 已經在做了，收不回；直接跟他們講。", "Marketing has already started; it cannot be withdrawn. Talk to them directly."],
  ["not_yours", "這不是你送的單。", "This is not your request."],
  ["withdrawn", "這張單已經收回了。", "This request was withdrawn."],
  ["no_such_request", "找不到這張單，重新整理再試一次。", "Request not found. Refresh and try again."],
  // 第二版（2026-11-09）
  ["not_in_workspace", "接的人只能選需求工作區裡的人，要先在 People 的 Workspaces 把他加進來。", "The assignee must be in the Marketing requests workspace. Add them under People, Workspaces first."],
  ["bad_platform", "平台只能勾表單上那五個。", "Pick platforms from the five on the form."],
  ["bad_owner", "需求負責人要是幹部，重新選一次。", "The request owner must be a cadre. Pick again."],
  ["bad_date", "預計發布日的格式不對。", "The publish date is not a valid date."],
  ["bad_status", "狀態只能是已送出、進行中、待審核、已發布。", "Status must be Submitted, In progress, In review or Published."],
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

// ── 行銷需求單（2026-10-31，第二版 2026-11-09）──────────────────────────
// 讀 requests（RLS：送單的人自己的、需求工作區「看」以上全部）；寫一律走函式。
// 第二版的欄要等 2026-11-09 那支遷移檔跑過才有。網站比資料庫先上線的那段時間，讀新欄會整句失敗（欄位不存在），
// 所以失敗時退回第一版的欄再讀一次，舊的清單至少看得到。
const RQ_V1 = "id, kind, title, purpose, needed_by, brief, asset_links, contact, requester, status, reply, created_at, updated_at";
const RQ_V2 = RQ_V1 + ", owner_id, owner_team, goal_cta, platforms, platform_other, key_line, must_have, draft, draft_doc_url, visual_refs, publish_on, other_notes, assignee, shots, published_at";
export async function loadRequests() {
  need();
  let r = await supabase.from("requests").select(RQ_V2).order("created_at", { ascending: false });
  if (r.error && /column|42703/.test(String(r.error.code || "") + String(r.error.message || ""))) {
    r = await supabase.from("requests").select(RQ_V1).order("created_at", { ascending: false });
  }
  if (r.error) throw r.error;
  return r.data || [];
}
// p 是 UI.rqPayload() 整理好的那一包（沒有 assignee，資料庫也不收）。
export async function submitRequest(p) {
  need();
  const { data, error } = await supabase.rpc("submit_request", { p_req: p });
  if (error) throw error;
  return data;
}
// 接的人：只有需求工作區「改」以上叫得動，只能指定工作區裡的人（null 是清空）。
export async function setRequestAssignee(id, uid) {
  need();
  const { data, error } = await supabase.rpc("set_request_assignee", { p_id: id, p_assignee: uid || null });
  if (error) throw error;
  return data;
}
// 「接的人」下拉的名單：需求工作區的成員。「看」以上拿得到，拿不到回空的（下拉只剩「還沒有人接」）。
export async function loadAssignees() {
  need();
  const { data, error } = await supabase.rpc("request_assignees");
  if (error) throw error;
  return data || [];
}
export async function setRequestStatus(id, status, reply) {
  need();
  const { data, error } = await supabase.rpc("set_request_status", { p_id: id, p_status: status, p_reply: reply == null ? null : reply });
  if (error) throw error;
  return data;
}
export async function withdrawRequest(id) {
  need();
  const { data, error } = await supabase.rpc("withdraw_request", { p_id: id });
  if (error) throw error;
  return data;
}

// ── 活動上架（2026-11-01）──────────────────────────────────────────────
// 讀 events（RLS：工作區「看」以上自己那場，senior 全部）；寫一律走函式。報名數從 applications 算（RLS 決定看不看得到）。
export async function loadEvents() {
  need();
  const { data, error } = await supabase.from("events")
    .select("id, slug, team, workspace_id, form_id, title_zh, title_en, summary_zh, summary_en, body_zh, body_en, cover_url, cover_consent, starts_at, ends_at, place, capacity, status, published_by, published_at, created_by, created_at")
    .order("starts_at", { ascending: true, nullsFirst: false });
  if (error) throw error;
  return data || [];
}
export async function loadSignedUp(formId) {
  need();
  const { count, error } = await supabase.from("applications").select("id", { count: "exact", head: true }).eq("form_id", formId).neq("status", "rejected");
  if (error) throw error;
  return count || 0;
}
export async function createEvent(team, slug, titleZh, titleEn, withForm) {
  need();
  const { data, error } = await supabase.rpc("create_event", { p_team: team, p_slug: slug, p_title_zh: titleZh, p_title_en: titleEn, p_with_form: !!withForm });
  if (error) throw error;
  return data;
}
export async function saveEvent(id, patch) {
  need();
  const { data, error } = await supabase.rpc("save_event", { p_id: id, p_patch: patch });
  if (error) throw error;
  return data;
}
export async function setEventReady(id, ready) {
  need();
  const { data, error } = await supabase.rpc("set_event_ready", { p_id: id, p_ready: !!ready });
  if (error) throw error;
  return data;
}
export async function publishEvent(id, on) {
  need();
  const { data, error } = await supabase.rpc(on ? "publish_event" : "unpublish_event", { p_id: id });
  if (error) throw error;
  return data;
}

// ── 會議紀錄（2026-11-02）──────────────────────────────────────────────
// 讀兩張表（幹部都讀得到）；寫走 save_meeting / delete_meeting。tick_mail() 開頁叫一次：排 24 小時內的提醒信並把 outbox 寄出去（pg_cron 沒開的退路）。
export async function loadMeetings() {
  need();
  const [m, a] = await Promise.all([
    supabase.from("meetings").select("id, scope, title, starts_at, ends_at, agenda, doc_url, reminded_at, created_by").order("starts_at", { ascending: false }),
    supabase.from("meeting_attendees").select("meeting_id, user_id, status, replied_at"),
  ]);
  if (m.error) throw m.error;
  if (a.error) throw a.error;
  const by = new Map();
  for (const x of a.data || []) { if (!by.has(x.meeting_id)) by.set(x.meeting_id, []); by.get(x.meeting_id).push(x); }
  return (m.data || []).map(x => Object.assign({}, x, { attendees: by.get(x.id) || [] }));
}
export async function saveMeeting(id, d) {
  need();
  const { data, error } = await supabase.rpc("save_meeting", { p_id: id || null, p_scope: d.scope, p_title: d.title, p_starts: d.starts_at, p_ends: d.ends_at, p_agenda: d.agenda || "", p_doc_url: d.doc_url || null, p_attendees: d.attendees || [] });
  if (error) throw error;
  return data;
}
export async function deleteMeeting(id) {
  need();
  const { data, error } = await supabase.rpc("delete_meeting", { p_id: id });
  if (error) throw error;
  return data;
}
export async function tickMail() {
  need();
  const { data, error } = await supabase.rpc("tick_mail");
  if (error) throw error;
  return data;
}
