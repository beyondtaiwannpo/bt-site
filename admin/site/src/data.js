// 後台「對外」那一組的資料層：資源目錄、團隊頁核可、校友頁核可、信件文案。
// 2026-10-15 從 admin/src/data.js 原樣搬過來（後台拆成四個資料夾，見 README「後台的四個資料夾」）。
// 直接用 shared/，**不 import 別的功能資料夾**，也不 import admin/src/
//（一個資料夾壞掉不該讓別的資料夾打不開）。
import { supabase } from "../../../shared/supabase.js";
import { authMessage } from "../../../shared/auth.js";
import { T, lang } from "./strings.js";

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
    senior: data.board_role === "president" || data.board_role === "senior_adviser",
    pres: data.board_role === "president",
    ws: await loadMyWorkspaces(),
  };
}
// 我被派進哪幾個工作區（2026-10-24，my_access()）：{ "apps:Curriculum Team": "manage", … }。
// 這只決定側欄藏不藏、按鈕畫不畫；真正的門在資料庫。叫不到（遷移檔還沒跑）就當成空的，
// 側欄會少幾行，但 Co-President 與 Senior Adviser 靠職級照樣全部看得到。
async function loadMyWorkspaces() {
  const ws = {};
  try {
    const { data } = await supabase.rpc("my_access");
    if (data && Array.isArray(data.workspaces)) for (const w of data.workspaces) ws[w.id] = w.level;
  } catch (e) { /* 空的 */ }
  return ws;
}

// ── 資源（批 5）────────────────────────────────────────────────────────
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
  if (!clean.title) throw new Error(T("err.resName"));
  if (!clean.url) throw new Error(T("err.resUrl"));
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

// ── 團隊頁的核可（2026-09-08，補批 1 漏掉的一件）────────────────────
// 只列**已經自己打過勾**的人。沒打勾的人不該出現在這份清單上 ——
// 那會變成一份「還沒有人問過他們」的名單，而 Co-President 會很想直接核可。
export async function loadPublicCandidates() {
  need();
  const { data, error } = await supabase.from("profiles")
    .select("id, name_zh, name_en, team, avatar, public_profile, public_approved")
    .eq("role", "cadre").eq("public_profile", true);
  if (error) throw error;
  // 2026-10-24 起團隊頁的頭銜從這一屆的職位算（positions），不再有自由文字的 public_title。
  // 這兩張表 Co-President 與 Senior Adviser 讀得到全部（RLS），載不到就沒有頭銜，不擋核可。
  const titles = await loadCurrentTitles().catch(() => ({}));
  return (data || []).map(p => ({ ...p, title: titles[p.id] || "" })).sort((a, b) =>
    String(a.name_zh || a.name_en || "").localeCompare(String(b.name_zh || b.name_en || ""), "zh-Hant"));
}
// { profile_id: "Director, Curriculum Team · 2026-27" }，只有 current 那一屆。
async function loadCurrentTitles() {
  const { data: term } = await supabase.from("terms").select("id").eq("status", "current").maybeSingle();
  if (!term) return {};
  const [{ data: people }, { data: positions }] = await Promise.all([
    supabase.from("people").select("id, profile_id").not("profile_id", "is", null),
    supabase.from("positions").select("person_id, title_zh, title_en").eq("term_id", term.id),
  ]);
  const byPerson = Object.fromEntries((positions || []).map(x => [x.person_id, x]));
  const out = {};
  for (const pe of people || []) {
    const pos = byPerson[pe.id];
    if (pos) out[pe.profile_id] = `${pos.title_en || pos.title_zh || ""} · ${term.id}`;
  }
  return out;
}

export async function setApproved(id, ok) {
  need();
  const { error } = await supabase.rpc("set_public_approved", { p_target: id, p_ok: ok });
  if (error) throw error;
}

// ── 校友頁的核可（2026-09-11）────────────────────────────────────────
// 只列**已經自己打過勾**的人，理由跟團隊頁那一份一模一樣：
// 沒打勾的人出現在這裡，會變成一份「還沒有人問過他們」的名單。
//
// ⚠ **不要改成自己查 alumni_stories 再查 profiles 補名字。**
// profiles 的讀取政策（2026-09-13-public-team.sql）不涵蓋校友那幾列 ——
// 那樣查的結果是每一位校友都顯示「（沒有名字）」，而那正是要被核可的人。
// 名字在 stories_for_review() 裡就解析好了（2026-09-19-stories-for-review.sql），
// 順序也是那一支排的（等核可的在最上面）。
export async function loadStories() {
  need();
  const { data, error } = await supabase.rpc("stories_for_review");
  if (error) throw error;
  return data || [];
}

export async function setStoryApproved(id, ok) {
  need();
  const { error } = await supabase.rpc("set_story_approved", { p_target: id, p_ok: ok });
  if (error) throw error;
}

// ── 信件文案（2026-09-08）──────────────────────────────────────────────
export async function loadTemplates() {
  need();
  const { data, error } = await supabase.from("mail_templates")
    .select("kind, subject, body, updated_at").order("kind");
  if (error) throw error;
  return data || [];
}

export async function saveTemplate(kind, subject, body) {
  need();
  const { error } = await supabase.rpc("set_mail_template",
    { p_kind: kind, p_subject: subject, p_body: body });
  if (error) throw error;
}

// 資料庫丟出來的錯誤代碼翻成人話。
//
// **看到這幾句話的人多半是一個沒有設定過 Vault 的學生。**
// 「mail_not_configured」對他來說跟一段亂碼沒有兩樣，
// 而他需要知道的是「去哪裡做什麼」，不是那個代碼長什麼樣。
// 每一列是 [代碼, 中文, 英文]（2026-10-19 中英切換），says() 看現在的語言挑一句。代碼本身不動。
const SAYS = [
  // ⚠ mail_not_configured **不在這張表裡，它走下面的特例**。
  // 2026-09-08：Paul 照步驟設定了，但名字打成「Resend API」，
  // 而畫面上顯示的是這裡寫死的一句話 —— 看起來像他什麼都沒做。
  // 資料庫那一端已經改成會說「缺哪一個、Vault 裡實際有什麼」，
  // **那句話一定要傳到畫面上**，不能被這裡的罐頭訊息蓋掉。
  ["not_director_of:",
   "這裡面有一份不是你這個 team 的申請，所以整批都沒有動。",
   "One of these applications belongs to another team, so nothing was changed."],
  ["not_president", "只有當屆 Co-President 可以做這件事。", "Only this term's Co-Presidents can do this."],
  // set_story_approved() 的第二條失敗路徑（那一列不存在也走這裡）。
  // ⚠ 排在 not_a_cadre / not_cadre **前面**：這張表是「誰先被 includes 命中誰贏」，
  // 而這幾個代碼長得很像，哪天有人加一個含有它們的新代碼就會被前面那條吃掉。
  ["not_alumni_or_cadre", "這個人不是幹部也不是校友，不能放上校友頁。", "This person is neither a cadre nor an alumnus, so they cannot go on the alumni page."],
  ["not_a_cadre", "這個人不是幹部，不能放上團隊頁。", "This person is not a cadre, so they cannot go on the team page."],
  ["not_cadre", "這個動作只有幹部做得了。", "Only cadres can do this."],
  ["not_signed_in", "你的登入已經過期了，重新登入一次就好。", "Your sign-in has expired. Sign in again."],
  ["form_closed", "這份表單已經關閉了。", "This form is closed."],
  ["bad_invite_code", "碼只能用英文字母、數字和連字號，2 到 64 個字，不能有空白或中文。", "A code can only use letters, digits and hyphens, 2 to 64 characters, no spaces or Chinese."],
  ["bad_uses", "可以用幾次要填 1 到 100 之間的數字。", "Uses must be a number from 1 to 100."],
  ["bad_grants", "要選幹部碼、校友碼或實習生碼。", "Choose a cadre, alumni or intern code."],
  ["no_such_invite", "找不到這組碼，重新整理再試一次。", "Code not found. Refresh and try again."],
  ["empty_mail", "主旨與內容都要寫，不能只寫一個。", "Fill in both subject and body."],
  ["no_such_form", "找不到這份表單，可能已經被刪掉了。", "Form not found. It may have been deleted."],
  ["no_such_template", "找不到這一種信的文案，可能是遷移檔還沒跑完。", "Email copy for this kind not found. The migration may not have run yet."],
  // 實習護照的後台（2026-10-18）
  ["not_internship_team", "只有 Internship team 的幹部與 Co-President 改得動實習護照。", "Only Internship team cadres and Co-Presidents can edit the intern passport."],
  ["bad_term_id", "屆別的代號只能用英文字母、數字和連字號，例如 2027-28。", "A term id can only use letters, digits and hyphens, for example 2027-28."],
  ["bad_task_id", "格子的代號只能用英文字母、數字和連字號，例如 T2728-01。", "A box id can only use letters, digits and hyphens, for example T2728-01."],
  ["bad_dates", "結束日要在開始日之後。", "The end date must be after the start date."],
  ["empty_title", "中文標題與英文標題都要填。", "Fill in both the Chinese and English titles."],
  ["bad_category", "分類要選入門、任務或反思。", "Category must be onboarding, project or reflection."],
  ["no_such_term", "找不到這一屆，重新整理再試一次。", "Term not found. Refresh and try again."],
  ["no_such_task", "找不到這一格，重新整理再試一次。", "Box not found. Refresh and try again."],
  ["term_locked", "已經建好的格子不能換屆。要搬到別屆就另外建一格，這一格停用。", "An existing box cannot move to another term. Create a new box there and disable this one."],
  ["has_stamps", "已經有人蓋過這一格，不能刪，只能停用。停用之後他的章還在，新的人不會再看到這一格。", "Someone has already stamped this box, so it can only be disabled, not deleted. Their stamp stays. New people will not see the box."],
  ["Could not find the function", "後台的函式還不在資料庫裡，要先跑 2026-10-18-intern-admin.sql。", "The admin functions are not in the database yet. Run 2026-10-18-intern-admin.sql first."],
];
export function says(err) {
  const m = String((err && err.message) || err || "");
  const col = lang() === "zh" ? 1 : 2;
  // 信件設定的錯誤是特例：**保留資料庫講的細節**（缺哪一個、實際有什麼），
  // 後面才補上怎麼修。罐頭訊息蓋掉細節的話，看的人就少了唯一的線索。
  if (m.includes("mail_not_configured")) {
    return m.replace("mail_not_configured：", T("says.mailNotConfigured") + "：").replace("mail_not_configured", T("says.mailNotConfigured")) +
      T("says.mailFix");
  }
  // 撞碼也是特例：資料庫會說撞到的是哪一組，那一組的名字要留在畫面上。
  const clash = m.match(/invite_exists:\s*(\S+)/);
  if (clash) return T("says.inviteExists", { code: clash[1] });
  for (const row of SAYS) if (m.includes(row[0])) return row[col];
  return m;
}
