// 幹部首頁與行事曆的資料層（2026-10-28）。直接用 shared/，不 import 別的功能資料夾。
//
// 讀的東西（全部走 RLS，幹部本來就讀得到）：
//   meetings、meeting_attendees：全部幹部都讀得到（2026-11-02 的政策）。
//   meeting_rsvp_notes：不能到的理由。RLS 只回「我自己的」與「我排的、我能排的那幾場」，其他人的理由這裡拿不到。
//   profiles：幹部的名字（誰會到那一欄要印名字）。
//   public_events()：已經放上網站的活動（跟對外的活動頁同一支）。
// 寫的東西只有一件：set_rsvp（只改自己那一列）。
import { supabase } from "../../shared/supabase.js";

function need() { if (!supabase) throw new Error("offline"); }

// 還沒跑 2026-11-17-meetings-home.sql 的資料庫沒有 required 欄與理由表，退回舊的查法（全部當選擇參加），頁面不壞。
const MEET_COLS = "id, scope, title, starts_at, ends_at, agenda, doc_url, created_by, required";
const MEET_COLS_OLD = "id, scope, title, starts_at, ends_at, agenda, doc_url, created_by";
const since = () => new Date(Date.now() - 180 * 86400000).toISOString();

export async function loadHome() {
  need();
  let [m, a, n, p, e] = await Promise.all([
    supabase.from("meetings").select(MEET_COLS).gte("ends_at", since()).order("starts_at"),
    supabase.from("meeting_attendees").select("meeting_id, user_id, status, replied_at"),
    supabase.from("meeting_rsvp_notes").select("meeting_id, user_id, note"),
    supabase.from("profiles").select("id, name_zh, name_en, team").eq("role", "cadre"),
    Promise.resolve(supabase.rpc("public_events")).catch(() => ({ data: [] })),
  ]);
  if (m.error && String(m.error.code) === "42703") m = await supabase.from("meetings").select(MEET_COLS_OLD).gte("ends_at", since()).order("starts_at");
  if (m.error) throw m.error;
  if (a.error) throw a.error;
  if (p.error) throw p.error;
  const notes = n.error ? [] : (n.data || []);
  const byA = new Map(), byN = new Map();
  for (const x of a.data || []) { if (!byA.has(x.meeting_id)) byA.set(x.meeting_id, []); byA.get(x.meeting_id).push(x); }
  for (const x of notes) { if (!byN.has(x.meeting_id)) byN.set(x.meeting_id, []); byN.get(x.meeting_id).push(x); }
  return {
    meetings: (m.data || []).map(x => Object.assign({}, x, { attendees: byA.get(x.id) || [], notes: byN.get(x.id) || [] })),
    people: p.data || [],
    events: (e && Array.isArray(e.data)) ? e.data : [],
  };
}

// 回覆。必到的會不能到要帶理由（資料庫也擋：need_reason）。
// 還沒跑 11-17 的資料庫沒有 p_note 那一個參數，沒有理由的話退回兩個參數的叫法。
export async function setRsvp(id, status, note) {
  need();
  const args = { p_meeting: id, p_status: status };
  if (note) args.p_note = note;
  let { data, error } = await supabase.rpc("set_rsvp", args);
  if (error && !note && /Could not find the function/i.test(error.message || "")) ({ data, error } = await supabase.rpc("set_rsvp", { p_meeting: id, p_status: status }));
  if (error) throw error;
  return data;
}

const SAYS = [
  ["need_reason", "必到的會不能到，要寫一句理由。", "This meeting is required; please write a reason."],
  ["note_too_long", "理由最多 300 個字。", "The reason can be at most 300 characters."],
  ["not_invited", "這場會的名單上沒有你。", "You are not on this meeting's list."],
  ["no_such_meeting", "找不到這場會，可能已經刪了。", "Meeting not found; it may have been deleted."],
  ["Failed to fetch", "連不上網路，等一下再試。", "No connection. Try again in a moment."],
];
export function says(err, zh) {
  const m = String((err && err.message) || err || "");
  for (const r of SAYS) if (m.includes(r[0])) return zh ? r[1] : r[2];
  return m;
}
