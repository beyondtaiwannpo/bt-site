// 後台「內部表單」的資料層（2026-11-29）。直接用 shared/，**不 import 別的功能資料夾**，也不 import admin/src/。
// 讀和寫全部走資料庫的函式（tf_*），六張表對登入的人沒有任何直接權限，門在每一支函式第一句。
// 設計與理由在 supabase/migrations/2026-11-29-team-forms.sql 檔頭。
import { supabase } from "../../../shared/supabase.js";
import { authMessage, whoAmI } from "../../../shared/auth.js";
import { T, lang } from "./strings.js";

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
  const { row: data, ws } = await whoAmI(userId);
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
  };
}

export const loadBootstrap = () => rpc("tf_bootstrap");
export const loadFill      = id => rpc("tf_fill", { p_form: id });
export const loadAdmin     = id => rpc("tf_form_admin", { p_form: id });
export const loadResults   = id => rpc("tf_results", { p_form: id });
export const saveForm      = (id, data, questions) => rpc("tf_save_form", { p_form: id || null, p_data: data || {}, p_questions: questions == null ? null : questions });
export const setAudience   = (id, role, items) => rpc("tf_set_audience", { p_form: id, p_role: role, p_items: items || [] });
export const setStatus     = (id, status) => rpc("tf_set_status", { p_form: id, p_status: status });
export const deleteForm    = id => rpc("tf_delete_form", { p_form: id });
export const submit        = (id, answers) => rpc("tf_submit", { p_form: id, p_answers: answers });

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
  ["required:", "says.required"],
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
];
export function says(err) {
  const m = String((err && err.message) || err || "");
  for (const [code, key] of SAYS) if (m.includes(code)) return T(key);
  if (m.includes("not_signed_in")) return lang() === "zh" ? "你的登入已經過期了，重新登入一次就好。" : "Your sign-in has expired. Sign in again.";
  return m;
}
