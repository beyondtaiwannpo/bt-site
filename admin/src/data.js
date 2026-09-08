// 申請管理的資料層。直接用 shared/，**不 import 別的功能資料夾**
//（跟 app/ 與 availability/ 同一條規矩：一個功能壞掉不該讓別的功能打不開）。
import { supabase } from "../../shared/supabase.js";
import { authMessage } from "../../shared/auth.js";

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
  if (!f.data) throw new Error("找不到這份表單，可能已經被刪掉了。");
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
  if ("title" in clean && !clean.title) throw new Error("表單要有名字。");
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

// ── 批 5：資源 ────────────────────────────────────────────────────────
// 後台這一邊一律用完整欄位（幹部一定是 authenticated，拿得到 url）。
// 對外那一頁的兩種查詢在 resources/src/main.js，**兩邊刻意分開**。
export async function loadResources() {
  need();
  const { data, error } = await supabase.from("resources")
    .select("id, title, blurb, kind, url, team, status, ord, updated_at")
    .order("ord");
  if (error) throw error;
  return data || [];
}

const RES_FIELDS = ["title", "blurb", "kind", "url", "team", "status", "ord"];
export async function saveResource(id, patch) {
  need();
  const clean = {};
  for (const k of RES_FIELDS) if (k in patch) clean[k] = patch[k];
  if (!clean.title) throw new Error("資源要有名字。");
  if (!clean.url) throw new Error("資源要有一條連結，不然這一列沒有用。");
  if (id) {
    const { error } = await supabase.from("resources").update(clean).eq("id", id);
    if (error) throw error;
    return id;
  }
  const { data, error } = await supabase.from("resources").insert(clean).select("id").single();
  if (error) throw error;
  return data.id;
}

export async function deleteResource(id) {
  need();
  const { error } = await supabase.from("resources").delete().eq("id", id);
  if (error) throw error;
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

// ── 團隊頁的核可（2026-09-08，補批 1 漏掉的一件）────────────────────
// 只列**已經自己打過勾**的人。沒打勾的人不該出現在這份清單上 ——
// 那會變成一份「還沒有人問過他們」的名單，而 Co-President 會很想直接核可。
export async function loadPublicCandidates() {
  need();
  const { data, error } = await supabase.from("profiles")
    .select("id, name_zh, name_en, team, avatar, public_title, public_profile, public_approved")
    .eq("role", "cadre").eq("public_profile", true);
  if (error) throw error;
  return (data || []).sort((a, b) =>
    String(a.name_zh || a.name_en || "").localeCompare(String(b.name_zh || b.name_en || ""), "zh-Hant"));
}

export async function setApproved(id, ok) {
  need();
  const { error } = await supabase.rpc("set_public_approved", { p_target: id, p_ok: ok });
  if (error) throw error;
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
  ["not_a_cadre", "這個人不是幹部，不能放上團隊頁。"],
  ["not_cadre", "這個動作只有幹部做得了。"],
  ["not_signed_in", "你的登入已經過期了，重新登入一次就好。"],
  ["form_closed", "這份表單已經關閉了。"],
  ["empty_mail", "主旨與內容都要寫，不能只寫一個。"],
  ["no_such_form", "找不到這份表單，可能已經被刪掉了。"],
];
export function says(err) {
  const m = String((err && err.message) || err || "");
  // 信件設定的錯誤是特例：**保留資料庫講的細節**（缺哪一個、實際有什麼），
  // 後面才補上怎麼修。罐頭訊息蓋掉細節的話，看的人就少了唯一的線索。
  if (m.includes("mail_not_configured")) {
    return m.replace("mail_not_configured：", "信件還沒設定好：").replace("mail_not_configured", "信件還沒設定好") +
      "　修法：到 Supabase 的 Vault 把那兩個 secret 的名字改成 RESEND_API_KEY 與 BT_MAIL_FROM（大小寫與底線要一樣），並確認 pg_net 已經打開。";
  }
  for (const [code, text] of SAYS) if (m.includes(code)) return text;
  return m;
}
