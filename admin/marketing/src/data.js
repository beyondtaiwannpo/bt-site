// 後台「Marketing」那一組的資料層（2026-11-26）。直接用 shared/，**不 import 別的功能資料夾**，也不 import admin/src/。
// 讀：ig_status()（連線狀態，不含通行證）。寫：ig_check_now()（管的人按「再檢查一次」）。
// 門在資料庫每一支函式第一句（ig_can_view / ig_can_manage）；ig_connection 那張表任何角色都讀不到。
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

// 我是誰。ws 是 my_access() 回的 { 工作區: 等級 }，側欄靠它；真正的門在資料庫。
export async function loadMe(userId) {
  need();
  const { row: data, ws } = await whoAmI(userId);
  if (!data) return null;
  return {
    role: data.role,
    board: data.board_role || "member",
    team: data.team || "",
    name: data.name_zh || data.name_en || "",
    senior: data.board_role === "president" || data.board_role === "senior_adviser",
    pres: data.board_role === "president",
    ws,
  };
}

export const loadIgStatus = () => rpc("ig_status");

// ── 大學介紹貼文（2026-11-27）──────────────────────────────────────────
// 讀：mkt_bootstrap()（我能做什麼、每一篇還差什麼、雜湊、人名）加 college_posts 整張表（RLS 只放 Marketing 的人）。
// 寫：全部走資料庫的函式（mkt_post_*），每一支第一句是門。照片放私人 bucket marketing-media，看用簽名網址。
export const loadMkt = () => rpc("mkt_bootstrap");
export async function loadPosts() {
  need();
  const { data, error } = await supabase.from("college_posts")
    .select("id, school, status, data, sources, checks, caption, review_note, created_by, created_at, updated_by, updated_at, submitted_at, approved_by, approved_at, posted_by, posted_at, posted_url")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return data || [];
}
export const createPost  = (school, data, sources, caption) => rpc("mkt_post_create", { p_school: school, p_data: data || {}, p_sources: sources || {}, p_caption: caption || "" });
export const savePost    = (id, data, sources, caption) => rpc("mkt_post_save", { p_id: id, p_data: data, p_sources: sources, p_caption: caption || "" });
export const checkFact   = (id, key, on) => rpc("mkt_post_check", { p_id: id, p_key: key, p_on: !!on });
export const submitPost  = id => rpc("mkt_post_submit", { p_id: id });
export const approvePost = (id, hash) => rpc("mkt_post_approve", { p_id: id, p_hash: hash });
export const returnPost  = (id, note) => rpc("mkt_post_return", { p_id: id, p_note: note });
export const markPosted  = (id, url) => rpc("mkt_post_mark_posted", { p_id: id, p_url: url });
export const archivePost = id => rpc("mkt_post_archive", { p_id: id });

const BUCKET = "marketing-media";
export async function uploadPhoto(path, blob) {
  need();
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: blob.type, cacheControl: "3600", upsert: false });
  if (error) throw error;
  return path;
}
const urlCache = new Map();
export async function photoUrl(path) {
  need();
  const hit = urlCache.get(path);
  if (hit && hit.until > Date.now()) return hit.url;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
  if (error) throw error;
  urlCache.set(path, { url: data.signedUrl, until: Date.now() + 50 * 60 * 1000 });
  return data.signedUrl;
}
export const igCheckNow = () => rpc("ig_check_now");

// 資料庫回的代碼翻成人話。先命中先贏。
const SAYS = [
  ["not_marketing_manager", "says.notManager"],
  ["not_marketing_editor", "says.notEditor"],
  ["not_approver", "says.notApprover"],
  ["cannot_approve_own", "says.own"],
  ["changed_since_viewed", "says.changedViewed"],
  ["changed_since_approved", "says.changedApproved"],
  ["already_in_series", "says.already"],
  ["need_school", "says.needSchool"],
  ["need_source_url", "says.needUrl"],
  ["need_instagram_url", "says.needIg"],
  ["need_note", "says.needNote"],
  ["not_ready", "says.notReady2"],
  ["not_draft", "says.notDraft"],
  ["not_in_review", "says.notInReview"],
  ["not_approved", "says.notApproved"],
  ["post_locked", "says.locked"],
  ["no_such_post", "says.noPost"],
  ["Bucket not found", "says.noBucket"],
  ["college_posts", "says.noPostsTable"],
  ["mkt_bootstrap", "says.noPostsTable"],
  ["not_marketing", "says.notMarketing"],
  ["ig_not_ready", "says.notReady"],
  ["ig_status", "says.noTable"],
  ["ig_check_now", "says.noTable"],
];
export function says(err) {
  const m = String((err && err.message) || err || "");
  for (const [code, key] of SAYS) if (m.includes(code)) return T(key);
  if (m.includes("not_signed_in")) return lang() === "zh" ? "你的登入已經過期了，重新登入一次就好。" : "Your sign-in has expired. Sign in again.";
  return m;
}
