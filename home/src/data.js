// 幹部首頁與行事曆的資料層（2026-10-28）。直接用 shared/，不 import 別的功能資料夾。
//
// 讀的東西（全部走 RLS，幹部本來就讀得到）：
//   meetings、meeting_attendees：全部幹部都讀得到（2026-11-02 的政策）。
//   meeting_rsvp_notes：不能到的理由。RLS 只回「我自己的」與「我排的、我能排的那幾場」，其他人的理由這裡拿不到。
//   profiles：幹部的名字（誰會到那一欄要印名字）。
//   public_events()：已經放上網站的活動（跟對外的活動頁同一支）。
//   tf_todo()：發給我、還開著、我還沒填的內部表單（2026-11-29）。只回標題與截止時間，不回任何人的答案。
// 寫的東西兩件：set_rsvp（只改自己那一列）；schedule_meeting（從行事曆的某一天排會，2026-11-26，資料庫照 can_schedule 擋誰排得了）。
// 2026-11-26 也多讀時間看板那幾份（availability 三張表加名單），某一天要畫每半小時幾個人有空。
import { supabase } from "../../shared/supabase.js";

function need() { if (!supabase) throw new Error("offline"); }

// 還沒跑 2026-11-17-meetings-home.sql 的資料庫沒有 required 欄與理由表，退回舊的查法（全部當選擇參加），頁面不壞。
// 2026-11-22 Google 日曆：多 meet_url 與 gcal_event_id。還沒跑那支就先少這兩欄再讀。
// 2026-11-26 從行事曆排會：多 message（排會的人寫給大家的一段話）。還沒跑 2027-01-22-meeting-message.sql 就少這一欄再讀。
const MEET_COLS_M = "id, scope, title, starts_at, ends_at, agenda, doc_url, created_by, required, meet_url, gcal_event_id, message";
const MEET_COLS_G = "id, scope, title, starts_at, ends_at, agenda, doc_url, created_by, required, meet_url, gcal_event_id";
const MEET_COLS = "id, scope, title, starts_at, ends_at, agenda, doc_url, created_by, required";
const MEET_COLS_OLD = "id, scope, title, starts_at, ends_at, agenda, doc_url, created_by";
const since = () => new Date(Date.now() - 180 * 86400000).toISOString();

export async function loadHome() {
  need();
  let [m, a, n, p, e, f] = await Promise.all([
    supabase.from("meetings").select(MEET_COLS_M).gte("ends_at", since()).order("starts_at"),
    supabase.from("meeting_attendees").select("meeting_id, user_id, status, replied_at"),
    supabase.from("meeting_rsvp_notes").select("meeting_id, user_id, note"),
    supabase.from("profiles").select("id, name_zh, name_en, team").eq("role", "cadre"),
    Promise.resolve(supabase.rpc("public_events")).catch(() => ({ data: [] })),
    // 還沒跑 2026-11-29-team-forms.sql 的資料庫沒有這支，當作沒有表單要填。
    Promise.resolve(supabase.rpc("tf_todo")).catch(() => ({ data: [] })),
  ]);
  if (m.error && String(m.error.code) === "42703") m = await supabase.from("meetings").select(MEET_COLS_G).gte("ends_at", since()).order("starts_at");
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
// ── team 的頁（2026-11-23，/home/#team=<team>）──────────────────────────
// 一個 team 的專案、活動、申請表、資源、Director。**全部是幹部本來就讀得到的東西**：
// 這一頁沒有新的資料庫函式、沒有動 RLS，只是把散在後台四頁的清單照 team 收在一起。
// 五個查詢同時發、各自接住：哪一個讀不到，那一塊就是 null（畫面寫「載不到」），其他照畫。
export async function loadTeam(team) {
  need();
  const EV = "id, slug, team, workspace_id, form_id, title_zh, title_en, status, starts_at";
  const evq = cols => supabase.from("events").select(cols).eq("team", team).order("starts_at", { ascending: true, nullsFirst: false });
  const [pj, ev, fm, rs, pt] = await Promise.allSettled([
    supabase.rpc("projects_list"),
    // project_id（2026-12-26-projects.sql）與 source（2026-12-01-records.sql）還不在的資料庫，退回不帶這兩欄的查法。
    evq(EV + ", project_id, source").then(r => (r.error && String(r.error.code) === "42703") ? evq(EV) : r),
    supabase.from("forms").select("id, team, kind, title, status").eq("team", team).order("updated_at", { ascending: false }),
    supabase.from("resources").select("id, title, team, status, ord").eq("team", team).order("ord"),
    supabase.rpc("public_team"),
  ]);
  const rows = r => (r.status === "fulfilled" && r.value && !r.value.error && Array.isArray(r.value.data)) ? r.value.data : null;
  return { projects: rows(pj), events: rows(ev), forms: rows(fm), resources: rows(rs), people: rows(pt) };
}

// ── 某一天誰有空（2026-11-26，時間看板的「團隊看板」搬到行事曆的某一天）──────────────
// 跟以前看板 availability/src/data.js 的 loadAll() 讀同樣五份，RLS 只給幹部。**五個都要成功才算成功**：
// 只有名單回來、時段讀不到的話，畫面會變成「每個人都沒空」，看起來像大家還沒填，而不是像出錯。
// 第一次點進某一天才讀，讀過留著。
export async function loadAvail() {
  need();
  const [pf, av, wk, wm] = await Promise.all([
    supabase.from("profiles").select("id, name_zh, name_en, team, tz, board_role").eq("role", "cadre"),
    supabase.from("availability").select("user_id, weekday, minute"),
    supabase.from("availability_week").select("user_id, week_start, weekday, minute"),
    supabase.from("availability_week_mark").select("user_id, week_start"),
  ]);
  const bad = [pf, av, wk, wm].find(r => r.error);
  if (bad) throw bad.error;
  const k = r => r.weekday + ":" + r.minute;
  const slots = new Map(), weekSlots = new Map(), weekMarks = new Map();
  for (const r of av.data || []) { if (!slots.has(r.user_id)) slots.set(r.user_id, new Set()); slots.get(r.user_id).add(k(r)); }
  // week_start 從 date 欄回來就是 "YYYY-MM-DD"，跟 free.js 的星期一同一個樣子，不轉換。
  for (const r of wk.data || []) {
    if (!weekSlots.has(r.user_id)) weekSlots.set(r.user_id, new Map());
    const w = weekSlots.get(r.user_id); if (!w.has(r.week_start)) w.set(r.week_start, new Set()); w.get(r.week_start).add(k(r));
  }
  for (const r of wm.data || []) { if (!weekMarks.has(r.user_id)) weekMarks.set(r.user_id, new Set()); weekMarks.get(r.user_id).add(r.week_start); }
  const members = (pf.data || []).map(p => {
    const zh = (p.name_zh || "").trim(), en = (p.name_en || "").trim();
    return { id: p.id, name: zh || en, alt: zh && en && zh !== en ? en : "", team: p.team || "", board_role: p.board_role || "member", tz: p.tz || null };
  }).sort((a, b) => (a.name || "").localeCompare(b.name || "", "zh-Hant"));
  return { members, slots, weekSlots, weekMarks };
}

// 排一場會（從行事曆的某一天）。資料庫那一支先存會、寫留言、建 Google 事件（BT 主帳號主辦、自動加 Meet），再寄網站的邀請信。
// 還沒跑 2027-01-22-meeting-message.sql 的資料庫沒有 p_message：退回舊的叫法，留言接在議程最前面，不會不見。
export async function scheduleMeeting(d) {
  need();
  const args = { p_scope: d.scope, p_title: d.title, p_starts: d.starts, p_ends: d.ends, p_agenda: d.agenda || "", p_doc_url: d.doc || null,
    p_attendees: d.attendees, p_required: !!d.required };
  let { data, error } = await supabase.rpc("schedule_meeting", Object.assign({}, args, { p_message: d.message || "" }));
  if (error && /Could not find the function|PGRST202/i.test(String(error.message || "") + String(error.code || ""))) {
    const msg = (d.message || "").trim();
    ({ data, error } = await supabase.rpc("schedule_meeting", Object.assign({}, args, { p_agenda: msg ? msg + (args.p_agenda ? "\n\n" + args.p_agenda : "") : args.p_agenda })));
  }
  if (error) throw error;
  return data;
}

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
  ["not_allowed", "你排不了這個範圍的會：整個 BT 的要 Co-President 或 Senior Adviser，team 的要你在那個 team 是「改」以上。", "You can't schedule for this scope: BT-wide needs a Co-President or Senior Adviser; a team needs Edit or above on that team."],
  ["message_too_long", "留言最多 2000 個字。", "The message can be at most 2,000 characters."],
  ["bad_doc_url", "會議紀錄的連結要是 Google Docs 或 Drive 的。", "The notes link must be a Google Docs or Drive link."],
  ["bad_time", "結束要在開始之後。", "The end must be after the start."],
  ["empty_title", "會議要有標題。", "The meeting needs a title."],
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
