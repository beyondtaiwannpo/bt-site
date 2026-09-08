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
