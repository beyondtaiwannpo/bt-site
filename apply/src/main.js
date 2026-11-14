// /apply/ 的邏輯。
//
// ⚠ **這一頁沒登入也要看得起來。** 它是對外頁面，路人從 IG 進來就該看到
// 現在開放什麼。登入只擋在「送出」那一步。
// 所以 boot() 裡任何跟登入有關的失敗都不能讓整頁停住。
import { supabase } from "../../shared/supabase.js";
import * as AUTH from "../../shared/auth.js";
import * as UI from "./ui.js";
// 表單引擎（2026-11-13）：題型、條件邏輯、分頁、驗證、草稿都在那一支，這一頁只管讀寫資料與外殼。
import * as F from "../../shared/forms.js";

let S = {
  forms: [], form: null, questions: [],
  user: null, profileOk: false, applied: false,
  view: "list", msg: "", busy: false, ready: false,
  // 填到哪：answers 是 { 題目 id: 答案 }，page 是第幾頁；guard 家長 email；meta 隱藏欄位的值；reason 關著的原因。
  answers: {}, page: 0, guard: "", meta: {}, reason: "", runner: null,
};

const root = () => document.getElementById("ap-root");
// 語言跟著整頁的 data-lang 走（那是 <head> 裡就決定好的，見對外頁的註解）。
// **不要在這裡再判斷一次瀏覽器語言** —— 判斷兩次就會有一個地方沒改到。
const isEn = () => document.documentElement.getAttribute("data-lang") === "en";

function state() {
  if (S.applied) return "already";
  if (S.reason) return "closed";
  if (!S.user) return "needIn";
  if (!S.profileOk) return "needProfile";
  return "signedIn";
}

function render() {
  const el = root();
  if (!el) return;
  if (!S.ready) return;
  if (S.view === "done") { el.innerHTML = UI.doneHTML(isEn()); return; }
  if (S.view === "error") { el.innerHTML = UI.errorHTML(S.msg); return; }
  if (S.view === "form" && S.form) {
    const st = state();
    el.innerHTML = UI.formHTML(S.form, S.questions, st, S.msg, S.busy, isEn(), "", S.reason);
    if (st === "signedIn") mountRun();
    return;
  }
  el.innerHTML = UI.listHTML(S.forms, isEn());
}

const formId = () => new URLSearchParams(location.search).get("f");

async function boot() {
  try {
    // 誰進來都讀得到開放中的表單（RLS 只放行 status = 'open'）。
    // 這一句不需要登入，也不該因為沒登入而失敗。
    // 2026-12-20-form-engine.sql 多了收滿與隱藏欄位兩欄；還沒跑那一支的資料庫退回舊的欄位（42703 = 沒有這一欄）。
    const COLS = "id, kind, title, intro, closes_at, notify_by, lang, opens_at, status";
    const q = cols => supabase.from("forms").select(cols).eq("status", "open").order("closes_at", { ascending: true, nullsFirst: false });
    let { data, error } = await q(COLS + ", max_responses, hidden_fields");
    if (error && String(error.code) === "42703") ({ data, error } = await q(COLS));
    if (error) throw error;
    const now = Date.now();
    // 開放時間還沒到的先不顯示。**資料庫那邊也擋著**（submit_application 會拒），
    // 這裡擋是為了不要畫出一顆按了會失敗的按鈕。
    S.forms = (data || []).filter(f =>
      (!f.opens_at || new Date(f.opens_at).getTime() <= now) &&
      (!f.closes_at || new Date(f.closes_at).getTime() >= now));
    // 有設「收幾份就關」的，問一次收滿了沒（只回是或否，不回幾份）。問不到就當沒滿，伺服器送出時還會再擋一次。
    await Promise.all(S.forms.filter(f => f.max_responses).map(async f => {
      try { const { data: full } = await supabase.rpc("form_is_full", { p_form: f.id }); f.is_full = !!full; } catch (e) { /* 照舊 */ }
    }));
    // 英文畫面：表單只有一個 title（多半是中文），改用那場活動的 title_en 與 summary_en（public_events() 誰都叫得到）。沒對到就照舊。
    if (isEn()) {
      try {
        const { data: evs } = await supabase.rpc("public_events");
        const byForm = {}; for (const e of evs || []) if (e.form_id) byForm[e.form_id] = e;
        S.forms = S.forms.map(f => byForm[f.id] ? { ...f, title: byForm[f.id].title_en || f.title, intro: byForm[f.id].summary_en || f.intro } : f);
      } catch (e) { /* 對不到就用表單自己的標題 */ }
    }

    // 登入狀態是**加分項**，拿不到就當沒登入，不要讓整頁掛掉。
    try {
      const who = await AUTH.currentUserDetailed();
      S.user = who.offline ? null : who.user;
      if (S.user) {
        const { data: p } = await supabase.from("profiles")
          .select("name_zh, name_en, school, grade").eq("id", S.user.id).maybeSingle();
        S.profileOk = !!(p && (p.name_zh || p.name_en) && p.school && p.grade);
      }
    } catch (e) { console.warn("讀不到登入狀態，當成沒登入。", e); }

    const id = formId();
    if (id) await openForm(id);
    S.ready = true;
    render();
  } catch (e) {
    console.error("/apply/ 載入失敗：", e);
    S.ready = true;
    S.view = "error";
    S.msg = isEn()
      ? "We cannot reach the database right now. Please try again later, or write to beyondtaiwan2020@gmail.com."
      : "現在連不上資料庫，等一下再試一次，或是寄信到 beyondtaiwan2020@gmail.com。";
    render();
  }
}

async function openForm(id) {
  const f = S.forms.find(x => x.id === id);
  if (!f) {
    S.view = "error";
    S.msg = isEn() ? "That application is not open any more."
                   : "這一份申請已經不開放了。";
    return;
  }
  const QC = "id, label, help, type, required, options, ord";
  const load = cols => supabase.from("form_questions").select(cols).eq("form_id", id).order("ord").order("id");
  let { data: qs, error } = await load(QC + ", config, logic, key");
  if (error && String(error.code) === "42703") ({ data: qs, error } = await load(QC));
  if (error) throw error;
  S.form = f; S.questions = (qs || []).map(F.normalize); S.view = "form"; S.msg = "";
  S.reason = F.closedReason(f, Date.now());

  // 已經送過了嗎。RLS 讓他只讀得到自己那一筆，所以這一句對別人是空的。
  S.applied = false;
  if (S.user) {
    const { data: a } = await supabase.from("applications")
      .select("id").eq("form_id", id).eq("user_id", S.user.id).maybeSingle();
    S.applied = !!a;
  }
  restoreDraft();
}

// ── 填到哪 ─────────────────────────────────────────────────────────────
// 草稿一個人一份表單一格（shared/forms.js 的 draftKey）。還沒登入的人帶著 ?from=ig 或 ?q_… 進來、按「登入」離開這一頁，
// 回來的時候網址上已經沒有那些參數了，所以登入前先存一份「anon」的，登入後接過來再刪掉。
const dk = () => S.form ? F.draftKey(S.form.id, S.user ? S.user.id : "anon") : "";
function restoreDraft() {
  const search = location.search;
  const fromUrl = F.prefill(S.questions, search);
  const anon = S.user ? F.draftLoad(F.draftKey(S.form.id, "anon")) : null;
  const mine = F.draftLoad(dk()) || anon;
  if (anon && S.user) F.draftClear(F.draftKey(S.form.id, "anon"));
  // 網址帶入的只補還沒填的格子，不蓋掉他自己打過的字。
  S.answers = Object.assign({}, fromUrl, (mine && mine.answers) || {});
  S.page = (mine && mine.page) || 0;
  S.meta = Object.assign({}, (mine && mine.meta) || {}, F.hiddenFrom(S.form.hidden_fields || [], search));
  if (!S.user && (Object.keys(fromUrl).length || Object.keys(S.meta).length)) F.draftSave(dk(), S.answers, 0, S.meta);
}

function mountRun() {
  const host = document.getElementById("fx-run");
  if (!host) return;
  S.runner = F.mount(host, S.questions, {
    en: isEn(), answers: S.answers, page: S.page, busy: S.busy, meta: S.meta,
    draftKey: dk(), showDraftNote: true, submitLabel: isEn() ? "Submit" : "送出申請",
    bottomHTML: () => UI.guardianHTML(S.guard, isEn()),
    onChange: (a, p) => { S.answers = a; S.page = p; },
    onUpload: upload, onSubmit: submit,
  });
}

// 上傳：放進私人的 form-uploads（2026-12-22-form-uploads.sql）。路徑是 <表單>/<本人>/<題目>-<亂數>.<副檔名>，
// 不放原本的檔名（常常就是學生的全名）。**只有那份表單改得動的人讀得到**，連上傳的人自己都讀不回來。
async function upload(q, file) {
  const path = F.uploadPath(S.form.id, S.user.id, q.id, file.name);
  const { error } = await supabase.storage.from("form-uploads").upload(path, file, { upsert: false, contentType: file.type || undefined });
  if (error) throw new Error((isEn() ? "Upload failed: " : "上傳失敗：") + (error.message || error));
  return path;
}

async function submit(payload) {
  const g = document.getElementById("guard");
  if (g) S.guard = g.value.trim();
  S.busy = true; S.msg = ""; if (S.runner) S.runner.setBusy(true);
  try {
    const args = { p_form_id: S.form.id, p_answers: payload, p_guardian_email: S.guard || null, p_meta: S.meta };
    let { error } = await supabase.rpc("submit_application", args);
    // 還沒跑 2026-12-20-form-engine.sql 的資料庫沒有 p_meta 這個參數（PostgREST 說找不到函式），拿掉再送一次。
    if (error && (String(error.code) === "PGRST202" || /p_meta/.test(error.message || ""))) {
      delete args.p_meta; ({ error } = await supabase.rpc("submit_application", args));
    }
    if (error) throw error;
    F.draftClear(dk());
    S.busy = false; S.view = "done"; S.answers = {}; S.page = 0; render();
    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch (err) {
    // ⚠ 失敗一定要說話。送出失敗卻畫出一模一樣的畫面，他會再按一次、按五次、然後關掉。
    S.busy = false;
    S.msg = UI.says(err, isEn());
    if (/form_closed|\bfull\b/.test(String(err && err.message))) S.reason = /full/.test(String(err.message)) ? "full" : "closed";
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
}

document.addEventListener("click", async e => {
  const b = e.target.closest("[data-act]");
  if (!b) return;
  const act = b.dataset.act;

  if (act === "back") {
    // 回清單。**用 pushState 不用 location** —— 整頁重載會再打一次資料庫，
    // 而清單已經在手上了。
    history.pushState({}, "", location.pathname + (isEn() ? "?lang=en" : "?lang=zh"));
    S.view = "list"; S.form = null; S.msg = ""; render();
    return;
  }

  if (act === "signin" ) {
    // 登入完帶他回這一份表單。next 的白名單與存放方式在 app/src/nav.js，
    // 這裡只負責把去處寫進網址。
    // 2026-11-09：鑰匙是「apply:<表單 id>」（app/src/nav.js 的 resolveKey 只收 uuid 的形狀），不再送整條路徑（那對不到表，登入完會停在 dashboard）。
    const id = formId();
    if (S.form && !S.user) F.draftSave(dk(), S.answers, 0, S.meta);
    location.href = "../app/?next=" + encodeURIComponent(id ? "apply:" + id : "apply") + (isEn() ? "&lang=en" : "");
    return;
  }

});

// 家長 email 那一格不在引擎裡（它不是題目），打的字記在 S，換頁或重畫不會不見。
document.addEventListener("input", e => { if (e.target && e.target.id === "guard") S.guard = e.target.value; });

// 語言按鈕會改 data-lang，但這一區的字是 JavaScript 畫的，不會自己跟著換。
// 監看那個屬性，改了就重畫。
new MutationObserver(() => render())
  .observe(document.documentElement, { attributes: true, attributeFilter: ["data-lang"] });

window.addEventListener("popstate", () => {
  const id = formId();
  if (!id) { S.view = "list"; S.form = null; render(); }
});

boot();
