// 後台「內部表單」的資料層（2026-11-29）。直接用 shared/，**不 import 別的功能資料夾**，也不 import admin/src/。
// 讀和寫全部走資料庫的函式（tf_*），六張表對登入的人沒有任何直接權限，門在每一支函式第一句。
// 設計與理由在 supabase/migrations/2026-11-29-team-forms.sql 檔頭。
import { supabase } from "../../../shared/supabase.js";
import { authMessage, whoAmI } from "../../../shared/auth.js";
import { T, lang } from "./strings.js";
// 表單引擎（2026-12-23，shared/forms.js）：題目一律整理成引擎的形狀（config、logic 補預設）再交給畫面。
import * as F from "../../../shared/forms.js";

const need = () => { if (!supabase) throw new Error(authMessage(null)); };
async function rpc(fn, args) {
  need();
  const { data, error } = await supabase.rpc(fn, args || {});
  if (error) throw error;
  return data;
}

// 我是誰。ws 裡 team-forms 那一格是 my_access() 算的（edit 建得了、view 是某一份的讀者）。
export async function loadMe(userId) {
  need();
  const { row: data, ws, info } = await whoAmI(userId);
  if (!data) return null;
  return {
    id: userId,
    role: data.role,
    board: data.board_role || "member",
    team: data.team || "",
    name: data.name_zh || data.name_en || "",
    senior: data.board_role === "president" || data.board_role === "senior_adviser",
    pres: data.board_role === "president",
    ws,
    // 每個工作區是哪個 team 的、叫什麼（2026-11-23）：側欄的「我的工作區」用。
    wsInfo: info || {},
  };
}

// ── 題目的形狀（2026-12-23-team-forms-engine.sql）──────────────────────
// 資料庫回的一題轉成引擎的形狀。ord 與 answered（有人答過）留著：排序、鎖住不能刪不能換題型要用。
// 還沒跑 2026-12-23 那一支的資料庫沒有 config 與 logic：normalize 把分數題的四欄收進 config，條件邏輯是空的，照樣畫得出來。
export function normQuestions(qs) {
  return (qs || []).map(q => Object.assign(F.normalize(q), { ord: q.ord, answered: !!q.answered }));
}
// 讀回來的題目有沒有 config 那一格：沒有就是還沒跑 2026-12-23 的資料庫（只收得了五種題型，規則存不起來）。
// 一題都沒有的時候看不出來，當作有（存的時候資料庫會說 bad_question_type，畫面翻成「資料庫還沒更新」）。
export const engineReady = qs => !(qs || []).length || (qs || []).some(q => q && "config" in q);
// 存回去的一題。分數題的兩端同時放在最外層：還沒跑 2026-12-23 的資料庫只認最外層那四欄。
export function qPayload(q) {
  const n = F.normalize(q), c = n.config || {};
  const out = { id: n.id || null, type: n.type, label: n.label, help: n.help, required: n.required, options: n.options, config: c, logic: n.logic };
  if (n.type === "scale") Object.assign(out, { scale_min: c.scale_min, scale_max: c.scale_max, min_label: c.min_label || "", max_label: c.max_label || "" });
  return out;
}
const withQs = d => { if (d && Array.isArray(d.questions)) { d.engine = engineReady(d.questions); d.questions = normQuestions(d.questions); } return d; };

export const loadBootstrap = () => rpc("tf_bootstrap");
export const loadFill      = async id => withQs(await rpc("tf_fill", { p_form: id }));
export const loadAdmin     = async id => withQs(await rpc("tf_form_admin", { p_form: id }));
export const loadResults   = async id => withQs(await rpc("tf_results", { p_form: id }));
export const saveForm      = (id, data, questions) => rpc("tf_save_form", { p_form: id || null, p_data: data || {}, p_questions: questions == null ? null : questions.map(qPayload) });
export const setAudience   = (id, role, items) => rpc("tf_set_audience", { p_form: id, p_role: role, p_items: items || [] });
export const setStatus     = (id, status) => rpc("tf_set_status", { p_form: id, p_status: status });
export const deleteForm    = id => rpc("tf_delete_form", { p_form: id });
export const submit        = (id, answers) => rpc("tf_submit", { p_form: id, p_answers: answers });

// 「所有表單」（2026-11-27，#all）：報名表、回饋表、內部表單一次拿（my_forms()，2027-01-23-website-and-forms.sql）。
// 每一種照原本那一套的門過濾，回的只有標題、狀態、份數；「建一份」叫的是原本那兩支（attach_event_form、rc_save_form），誰建得了由它們決定。
// 後台的資料夾之間不互相 import，所以這兩句跟 admin/src/data.js 的 attachEventForm、createFeedbackForm 各抄一份。
export const loadMyForms   = () => rpc("my_forms");
export const attachEventForm = eventId => rpc("attach_event_form", { p_event: eventId });
export const createFeedback  = (eventId, title) => rpc("rc_save_form", { p_form: null, p_data: { title, kind: "post-event", event_id: eventId, lang: lang() }, p_questions: [] });

// 資料庫回的代碼翻成人話。先命中先贏。
const SAYS = [
  ["not_form_creator", "says.notCreator"],
  ["not_form_editor", "says.notEditor"],
  ["not_form_owner", "says.notOwner"],
  ["not_form_reader", "says.notReader"],
  ["not_for_you", "says.notForYou"],
  ["form_not_found", "says.notFound"],
  ["form_closed", "says.closed"],
  ["already_submitted", "says.already"],
  ["already_answered", "says.alreadyOne"],
  ["bad_question_type", "says.oldDb"],
  ["tf_questions_type_check", "says.oldDb"],
  ["required:", "says.required"],
  ["bad_answer", "says.badAnswer"],
  ["bad_option", "says.badOption"],
  ["bad_scale_value", "says.badScale"],
  ["too_long", "says.tooLong"],
  ["need_title", "says.needTitle"],
  ["need_question_label", "says.needLabel"],
  ["need_options", "says.needOptions"],
  ["bad_scale", "says.badScaleDef"],
  ["question_type_locked", "says.typeLocked"],
  ["question_has_answers", "says.hasAnswers"],
  ["anonymous_locked", "says.anonLocked"],
  ["need_questions", "says.needQuestions"],
  ["need_recipients", "says.needRecipients"],
  ["has_responses", "says.hasResponses"],
  ["editor_not_all", "says.editorAll"],
  ["bad_person", "says.badPerson"],
  ["need_name", "says.needName"],
  ["tf_bootstrap", "says.noTables"],
  ["tf_fill", "says.noTables"],
  ["my_forms", "says.noMyForms"],
  ["not_event_editor", "says.notEventEditor"],
  ["no_such_event", "says.noEvent"],
];
export function says(err) {
  const m = String((err && err.message) || err || "");
  for (const [code, key] of SAYS) if (m.includes(code)) return T(key);
  if (m.includes("not_signed_in")) return lang() === "zh" ? "你的登入已經過期了，重新登入一次就好。" : "Your sign-in has expired. Sign in again.";
  return m;
}
