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
  const { row: data, ws, info } = await whoAmI(userId);
  if (!data) return null;
  return {
    id: userId, role: data.role, board: data.board_role || "member", team: data.team || "",
    name: data.name_zh || data.name_en || "",
    senior: data.board_role === "president" || data.board_role === "senior_adviser",
    pres: data.board_role === "president", ws, wsInfo: info || {},
  };
}

export const loadBootstrap = () => rpc("rc_bootstrap");
export const loadEvent     = id => rpc("rc_event", { p_event: id });
export const loadResults   = id => rpc("rc_results", { p_form: id });
export const loadPerson    = id => rpc("rc_person", { p_person: id });
export const findPeople    = q => rpc("rc_find_people", { p_q: q || "" });
export const loadDirectory = () => rpc("rc_directory");
export const markNotSame   = (a, b) => rpc("rc_mark_not_same", { p_a: a, p_b: b });
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
export const saveSchool    = (id, p) => rpc("rc_save_school", { p_school: id || null, p });
export const deleteSchool  = id => rpc("rc_delete_school", { p_school: id });
export const addContact    = (person, kind, value) => rpc("rc_contact_add", { p_person: person, p_kind: kind, p_value: value });
export const deleteContact = id => rpc("rc_contact_del", { p_id: Number(id) });
export const saveReview    = (id, p) => rpc("rc_save_review", { p_event: id, p });
export const savePerson    = (id, p) => rpc("rc_save_person", { p_person: id || null, p });
export const mergePeople   = (keep, drop) => rpc("rc_merge_people", { p_keep: keep, p_drop: drop });
export const mergeAccounts = (keep, drop) => rpc("rc_merge_accounts", { p_keep: keep, p_drop: drop });
export const forgetPerson  = id => rpc("forget_person", { p_person: id });
export const anonymiseOld  = doIt => rpc("rc_anonymise_old", { p_do: !!doIt });

// ── 關係網（2027-01-03，supabase/migrations/2027-01-03-people-network.sql）──
// 三支都是管紀錄的人才叫得動（門在函式第一句）。rc_person、rc_directory、rc_find_people 多回的東西不用另外叫。
// 給或拿掉「BT 給的標籤」（教授、招生官、聯絡人）。賺來的標籤沒有寫的函式：那些是從紀錄算的。
export const setLabel = (person, label, on, detail, since, until) => rpc("rc_label_set", { p_person: person, p_label: label, p_on: !!on, p_detail: detail || "", p_since: since == null ? null : since, p_until: until == null ? null : until });
// 改個人檔案與關係紀錄。p 只帶要改的鍵；故事不在這裡（那是他自己的話）。
// **兩個同意不走這一支**：share_profile、share_story 混在 p 裡會被拿掉，要取消走下面的 withdrawConsent()。
export function saveProfile(person, p) {
  const patch = Object.assign({}, p || {});
  delete patch.share_profile; delete patch.share_story;
  return rpc("rc_save_profile", { p_person: person, p: patch });
}
// 替他取消一個同意。寫死送 false：同意只有本人在個人連結上給得了（資料庫的 consent_needs_self 也擋 true），這一頁沒有任何一條路送得出 true。
export const withdrawConsent = (person, which) => rpc("rc_save_profile", { p_person: person, p: { [which === "share_story" ? "share_story" : "share_profile"]: false } });
// 個人連結：action 是 create（舊的撤掉、開一條新的，回 { token, expires_at }）或 revoke。
export const profileLink = (person, action) => rpc("rc_profile_link", { p_person: person, p_action: action === "revoke" ? "revoke" : "create" });
// 照片傳到 Storage 的 people bucket（公開讀；上傳與刪除只給管紀錄的人；5 MB；只收圖）。做法跟活動照片同一套（admin/src/data.js 的 uploadEventImage），
// 這裡自己一份（後台資料夾之間不互相 import）。路徑 <人的 id>/<時間>-<亂數>.jpg，不用原檔名（原檔名可能有人名）。
// 傳進來的 blob 是 main.js 已經縮好的 JPEG。傳得上去不代表掛得上去：網址要再走 saveProfile({ photo_url })。
export async function uploadPersonPhoto(personId, blob) {
  need();
  const name = `${personId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
  const { error } = await supabase.storage.from("people").upload(name, blob, { contentType: "image/jpeg", cacheControl: "31536000", upsert: false });
  if (error) throw error;
  return supabase.storage.from("people").getPublicUrl(name).data.publicUrl;
}
// 把 bucket 裡的一個檔刪掉。path 是 UI.personStoragePath(網址) 算的；空的（不是我們的檔）就不做事。刪不掉只是多佔一點空間，不擋。
export async function removePersonFile(path) {
  if (!path || !supabase) return;
  try { await supabase.storage.from("people").remove([path]); } catch (e) { /* 檔留著，不擋 */ }
}

// 資料庫回的代碼翻成人話。先命中先贏。
const SAYS = [
  ["not_records_manager", "says.notManager"], ["not_records_viewer", "says.notViewer"],
  ["not_event_editor", "says.notEventEditor"], ["not_event_viewer", "says.notEventViewer"],
  ["not_form_creator", "says.notCreator"], ["not_form_editor", "says.notEditor"], ["not_form_owner", "says.notOwner"], ["not_form_reader", "says.notReader"],
  ["form_not_found", "says.notFound"], ["no_such_person", "says.noPerson"], ["no_such_school", "says.notFound"], ["need_school", "says.needSchool"], ["years_backwards", "says.yearsBackwards"], ["no_such_event", "says.noEvent"], ["no_such_term", "says.noTerm"], ["no_such_pair", "says.notFound"],
  ["bad_question_type", "says.badType"], ["bad_logic", "says.badLogic"], ["bad_config", "says.badLogic"], ["anon_contact_q", "says.anonContact"],
  ["need_title", "says.needTitle"], ["need_question_label", "says.needLabel"], ["need_options", "says.needOptions"], ["bad_scale", "says.badScaleDef"], ["bad_key", "says.badKey"],
  ["question_type_locked", "says.typeLocked"], ["question_has_answers", "says.hasAnswers"], ["anonymous_locked", "says.anonLocked"],
  ["need_questions", "says.needQuestions"], ["has_responses", "says.hasResponses"], ["bad_person", "says.badPerson"],
  ["mentor_cannot_read", "says.mentorRead"], ["pair_readers_by_person", "says.pairByPerson"],
  ["same_person", "says.samePerson"], ["both_have_accounts", "says.bothAccounts"], ["has_account", "says.hasAccount"], ["email_taken", "says.emailTaken"],
  ["slug_taken", "says.slugTaken"], ["bad_slug", "says.badSlug"], ["not_president", "says.notPresident"], ["both_have_accounts", "says.bothAccounts"], ["not_both_accounts", "says.notBothAccounts"], ["has_unused_invite", "says.unusedInvite"], ["cannot_remove_self", "says.cannotSelf"], ["cannot_retire_president", "says.cannotPresident"], ["need_name_or_email", "err.needName"],
  // 關係網（2027-01-03）。too_long:bio 這幾條要排在下面那句 too_long 前面（誰先被 includes 命中誰贏）。
  ["consent_needs_self", "says.consentSelf"], ["minor_no_link", "link.minor"], ["bad_label", "says.badLabel"], ["bad_years", "says.badYears"], ["bad_rel_open", "says.badRelOpen"],
  ["photo_not_https", "says.photoNotHttps"], ["too_long:bio", "says.longBio"], ["too_long:rel_note", "says.longNote"], ["too_long:", "says.longField"],
  ["contact_taken", "says.contactTaken"], ["need_value", "says.needValue"], ["bad_email", "says.badEmail"], ["login_email", "says.loginEmail"], ["bad_contact_kind", "says.badContactKind"], ["too_long", "says.tooLong"],
  ["rc_bootstrap", "says.noTables"], ["rc_event", "says.noTables"],
  // 函式還不在（2027-01-03-people-network.sql 沒跑）：PostgREST 回的句子裡有函式的名字。
  ["rc_label_set", "says.noNetwork"], ["rc_save_profile", "says.noNetwork"], ["rc_profile_link", "says.noNetwork"],
];
export function says(err) {
  const m = String((err && err.message) || err || "");
  for (const [code, key] of SAYS) if (m.includes(code)) return T(key);
  if (m.includes("not_signed_in")) return lang() === "zh" ? "你的登入已經過期了，重新登入一次就好。" : "Your sign-in has expired. Sign in again.";
  // 資料庫的原文（duplicate key、violates…）不給人看：翻成一句人話（2026-12-11，Paul 看到 rc_identities_one 那串）
  if (/duplicate key|violates|constraint|syntax error|null value in column/i.test(m)) return T("says.dbClash");
  return m;
}
// 照片傳不上去的原因。Storage 回的句子跟資料庫函式的不一樣（沒有我們的代碼），先認這幾種，認不得的再交給 says()。
export function saysUpload(err) {
  const m = String((err && err.message) || err || "");
  if (/bucket not found/i.test(m)) return T("says.noBucket");
  if (/row-level security|unauthorized|not authorized/i.test(m)) return T("says.notManager");
  if (/exceeded the maximum|too large/i.test(m)) return T("says.photoBig");
  if (/mime type/i.test(m)) return T("says.photoType");
  return says(err);
}
