// 幹部首頁與行事曆的資料層（2026-10-28）。直接用 shared/，不 import 別的功能資料夾。
//
// 讀的東西（全部走 RLS，幹部本來就讀得到）：
//   meetings、meeting_attendees：全部幹部都讀得到（2026-11-02 的政策）。
//   meeting_rsvp_notes：不能到的理由。RLS 只回「我自己的」與「我排的、我能排的那幾場」，其他人的理由這裡拿不到。
//   profiles：幹部的名字（誰會到那一欄要印名字）。
//   public_events()：已經放上網站的活動（跟對外的活動頁同一支）。
//   tf_todo()：發給我、還開著、我還沒填的內部表單（2026-11-29）。只回標題與截止時間，不回任何人的答案。
// 寫的東西只有一件：set_rsvp（只改自己那一列）。
import { supabase } from "../../shared/supabase.js";

function need() { if (!supabase) throw new Error("offline"); }

// 還沒跑 2026-11-17-meetings-home.sql 的資料庫沒有 required 欄與理由表，退回舊的查法（全部當選擇參加），頁面不壞。
// 2026-11-22 Google 日曆：多 meet_url 與 gcal_event_id。還沒跑那支就先少這兩欄再讀。
const MEET_COLS_G = "id, scope, title, starts_at, ends_at, agenda, doc_url, created_by, required, meet_url, gcal_event_id";
const MEET_COLS = "id, scope, title, starts_at, ends_at, agenda, doc_url, created_by, required";
const MEET_COLS_OLD = "id, scope, title, starts_at, ends_at, agenda, doc_url, created_by";
const since = () => new Date(Date.now() - 180 * 86400000).toISOString();

export async function loadHome() {
  need();
  let [m, a, n, p, e, f] = await Promise.all([
    supabase.from("meetings").select(MEET_COLS_G).gte("ends_at", since()).order("starts_at"),
    supabase.from("meeting_attendees").select("meeting_id, user_id, status, replied_at"),
    supabase.from("meeting_rsvp_notes").select("meeting_id, user_id, note"),
    supabase.from("profiles").select("id, name_zh, name_en, team").eq("role", "cadre"),
    Promise.resolve(supabase.rpc("public_events")).catch(() => ({ data: [] })),
    // 還沒跑 2026-11-29-team-forms.sql 的資料庫沒有這支，當作沒有表單要填。
    Promise.resolve(supabase.rpc("tf_todo")).catch(() => ({ data: [] })),
  ]);
  if (m.error && String(m.error.code) === "42703") m = await supabase.from("meetings").select(MEET_COLS).gte("ends_at", since()).order("starts_at");
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
    forms: (f && !f.error && Array.isArray(f.data)) ? f.data : [],
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

// Google 日曆（2026-11-23）：開頁拉一次大家在 Google 的回覆（同一場 2 分鐘內不重拉），回改了幾個人。還沒跑那支就當 0。
export async function gcalRefresh() {
  need();
  const { data, error } = await supabase.rpc("gcal_refresh");
  if (error) return 0;
  return Number(data) || 0;
}

// 我帶的 mentee／我的 mentor（2026-12-07）：rc_my_pairs() 只回本人在裡面的配對（另一邊只有名字、那個學期、開著的 check-in 連結）。
export async function myPairs() {
  const { data, error } = await supabase.rpc("rc_my_pairs");
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}
export async function myFeedback() {
  const { data, error } = await supabase.rpc("rc_my_feedback");
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

// ── 等你處理的事（2026-11-14，Paul：「do the new menu and merged home」）──────────────
// 以前後台有一頁「待辦」、這裡有一頁首頁，兩頁講同一件事。合併成首頁的一張清單之後，後台那幾張卡要讀的東西搬到這裡。
// 規矩跟後台那一支（admin/src/data.js 的 loadTodo）一樣：
//   1. 只問看得到的人。不是 Marketing 核可的人不問貼文，不是 senior 不問團隊頁與校友故事。
//   2. 每一項各自接住，讀不到是 null，不是 0（資料庫還沒跑那支遷移檔、或 RLS 不給，首頁照樣畫得出來）。
//   3. 只讀，不寫。只拿畫一行要用的欄位：不讀申請的答案、不讀信寄給誰、不讀需求單的內容。
// me = { id, role, board, team, ws, senior }，approver 是能不能核可大學介紹貼文（跟 mkt_can_approve() 同一條）。
const RQ_COLS = "id, title, kind, status, assignee, requester, needed_by, publish_on, updated_at";
const RQ_COLS_OLD = "id, title, kind, status, requester, needed_by, updated_at";
export async function loadWaiting(me, approver) {
  need();
  const q = {
    forms: supabase.from("forms").select("id, title, team, closes_at, status"),
    received: supabase.from("applications").select("form_id").eq("status", "received"),
    events: supabase.from("events").select("id, slug, team, workspace_id, form_id, title_zh, title_en, starts_at, ends_at, status"),
    requests: supabase.from("requests").select(RQ_COLS).then(r => (r.error && /column|42703/.test(String(r.error.code || "") + String(r.error.message || ""))) ? supabase.from("requests").select(RQ_COLS_OLD) : r),
    stamps: supabase.from("stamps").select("act_id", { count: "exact", head: true }).eq("user_id", me.id),
    boxes: supabase.from("activities").select("id", { count: "exact", head: true }).eq("active", true),
  };
  if (approver) q.posts = supabase.from("college_posts").select("id, school, created_by, submitted_at").eq("status", "in_review");
  if (me.senior) {
    q.team = supabase.from("profiles").select("id").eq("role", "cadre").eq("public_profile", true).eq("public_approved", false);
    q.stories = supabase.rpc("stories_for_review");
    q.stuck = supabase.from("mail_outbox").select("id").is("sent_at", null).gt("tries", 0);
    q.roster = supabase.from("profiles").select("id, team").eq("role", "cadre");
  }
  const keys = Object.keys(q);
  const rs = await Promise.allSettled(keys.map(k => q[k]));
  const out = {};
  keys.forEach((k, i) => {
    const r = rs[i];
    const ok = r.status === "fulfilled" && !r.value.error;
    out[k] = !ok ? null : (k === "stamps" || k === "boxes") ? (r.value.count == null ? null : r.value.count) : (r.value.data || []);
  });
  return out;
}
