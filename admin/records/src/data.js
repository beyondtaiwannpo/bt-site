// 後台「紀錄」的資料層（2026-12-01，BT Records）。直接用 shared/，**不 import 別的功能資料夾**，也不 import admin/src/。
// 讀和寫全部走資料庫的函式（rc_*），十二張表對登入的人沒有任何直接權限，門在每一支函式第一句。
// 設計與理由在 supabase/migrations/2026-12-01-records.sql 檔頭。
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

// 我是誰。ws 裡 records 那一格是 my_access() 算的（edit 管得了、view 看得到）。
export async function loadMe(userId) {
  need();
  const { row: data, ws } = await whoAmI(userId);
  if (!data) return null;
  return {
    id: userId, role: data.role, board: data.board_role || "member", team: data.team || "",
    name: data.name_zh || data.name_en || "",
    senior: data.board_role === "president" || data.board_role === "senior_adviser",
    pres: data.board_role === "president", ws,
  };
}

export const loadBootstrap = () => rpc("rc_bootstrap");
export const loadEvent     = id => rpc("rc_event", { p_event: id });
export const loadResults   = id => rpc("rc_results", { p_form: id });
export const loadPerson    = id => rpc("rc_person", { p_person: id });
export const findPeople    = q => rpc("rc_find_people", { p_q: q || "" });
export const loadDirectory = () => rpc("rc_directory");
export const loadYearly    = () => rpc("rc_yearly");
export const saveEventMeta = (id, p) => rpc("rc_save_event_meta", { p_event: id, p });
export const setSessions   = (id, sessions) => rpc("rc_set_sessions", { p_event: id, p_sessions: sessions || [] });
export const setParticipation = (id, p) => rpc("rc_set_participation", { p_event: id, p });
export const removeParticipation = id => rpc("rc_remove_participation", { p_id: id });
export const syncEvent     = id => rpc("rc_sync_event", { p_event: id });
export const addPastEvent  = p => rpc("rc_add_past_event", { p });
export const saveForm      = (id, data, questions) => rpc("rc_save_form", { p_form: id || null, p_data: data || {}, p_questions: questions == null ? null : questions });
export const setAudience   = (id, role, items) => rpc("rc_set_audience", { p_form: id, p_role: role, p_items: items || [] });
export const setStatus     = (id, status) => rpc("rc_set_status", { p_form: id, p_status: status });
export const deleteForm    = id => rpc("rc_delete_form", { p_form: id });
export const savePair      = (id, p) => rpc("rc_save_pair", { p_pair: id || null, p });
export const deletePair    = id => rpc("rc_delete_pair", { p_pair: id });
export const saveOutcome   = (id, p) => rpc("rc_save_outcome", { p_outcome: id || null, p });
export const deleteOutcome = id => rpc("rc_delete_outcome", { p_outcome: id });
export const saveReview    = (id, p) => rpc("rc_save_review", { p_event: id, p });
export const savePerson    = (id, p) => rpc("rc_save_person", { p_person: id || null, p });
export const mergePeople   = (keep, drop) => rpc("rc_merge_people", { p_keep: keep, p_drop: drop });
export const forgetPerson  = id => rpc("forget_person", { p_person: id });
export const anonymiseOld  = doIt => rpc("rc_anonymise_old", { p_do: !!doIt });

// 資料庫回的代碼翻成人話。先命中先贏。
const SAYS = [
  ["not_records_manager", "says.notManager"], ["not_records_viewer", "says.notViewer"],
  ["not_event_editor", "says.notEventEditor"], ["not_event_viewer", "says.notEventViewer"],
  ["not_form_creator", "says.notCreator"], ["not_form_editor", "says.notEditor"], ["not_form_owner", "says.notOwner"], ["not_form_reader", "says.notReader"],
  ["form_not_found", "says.notFound"], ["no_such_person", "says.noPerson"], ["no_such_event", "says.noEvent"], ["no_such_term", "says.noTerm"], ["no_such_pair", "says.notFound"],
  ["need_title", "says.needTitle"], ["need_question_label", "says.needLabel"], ["need_options", "says.needOptions"], ["bad_scale", "says.badScaleDef"], ["bad_key", "says.badKey"],
  ["question_type_locked", "says.typeLocked"], ["question_has_answers", "says.hasAnswers"], ["anonymous_locked", "says.anonLocked"],
  ["need_questions", "says.needQuestions"], ["has_responses", "says.hasResponses"], ["bad_person", "says.badPerson"],
  ["mentor_cannot_read", "says.mentorRead"], ["pair_readers_by_person", "says.pairByPerson"],
  ["same_person", "says.samePerson"], ["both_have_accounts", "says.bothAccounts"], ["has_account", "says.hasAccount"], ["email_taken", "says.emailTaken"],
  ["slug_taken", "says.slugTaken"], ["bad_slug", "says.badSlug"], ["not_president", "says.notPresident"], ["need_name_or_email", "err.needName"],
  ["rc_bootstrap", "says.noTables"], ["rc_event", "says.noTables"],
];
export function says(err) {
  const m = String((err && err.message) || err || "");
  for (const [code, key] of SAYS) if (m.includes(code)) return T(key);
  if (m.includes("not_signed_in")) return lang() === "zh" ? "你的登入已經過期了，重新登入一次就好。" : "Your sign-in has expired. Sign in again.";
  return m;
}
