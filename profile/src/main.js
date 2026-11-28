// /profile/ 的邏輯（2027-01-03，人的名錄變成關係網）。畫面與純函式在 ./ui.js，資料庫那一半在 supabase/migrations/2027-01-03-people-network.sql。
// ⚠ 這一頁沒登入也要能填。讀用 rc_public_profile(token)、存用 rc_public_profile_save(token, p)，兩支是開給 anon 的。
//   門在資料庫：連結不對、過期、被撤銷就回 null；一條連結一小時最多存 40 次；沒勾滿 18 歲不收。
// ⚠ 網址上的 token 等於那個人資料的鑰匙。它只出現在下面叫資料庫的那兩句與換語言的網址（UI.langHref），
//   **不要印到 console、不要放進 sessionStorage、不要接到任何別的網址後面**。草稿的鑰匙是它的雜湊（UI.draftKey）。
// 這裡管：載入、一步一步換、加一列拿一列、存、存完重讀一次、語言、填到一半的內容（只留在這個分頁）。
// 2027-01-25（Paul：「once they fill out the form, they should get their account… their account should be linked to that databases」）：
//   1. 存完之後叫 rc_public_profile_account(token)：名單上這個人還沒有帳號，資料庫就用他的 email 開一組碼、寄一封信，
//      存好的那一頁多一塊「你的帳號」，一顆馬上開帳號的鈕（連到 /app/?invite=碼）。
//   2. 網址上沒有 token、但這台瀏覽器有登入：跟資料庫要他自己的那一條（rc_my_profile_link），之後讀寫照舊走那兩支，
//      改的是名單上同一個人。這一條**只放在記憶體**（S.tok），不進網址、不進儲存空間；換語言的網址只帶網址上本來的那一條（urlToken）。
// 2027-01-26（Paul：「not every link is gonna be the same questions, because the link goes to different person」）：
//   連結帶著一套故事題的時候，第 4 步是表單引擎畫的那一套（格子名字是 fx-題目 id），讀回來走 UI.readSet，條件邏輯走 UI.refreshSet。
import { supabase } from "../../shared/supabase.js";
import * as UI from "./ui.js";

// view：loading（HTML 裡那一句）、form、done、wrong（連結不對）、fail（載不進來）
// self：登入的人改自己的那一份（沒有網址上的 token）。tok：那時候跟資料庫要來的那一條。account：存完之後開帳號那一步的結果。
const S = { view: "loading", data: null, form: UI.blank(), step: 1, errors: {}, msg: "", busy: false, offline: false, base: "", self: false, tok: "", account: null, mine: "" };
const root = () => document.getElementById("pf-root");
const isEn = () => document.documentElement.getAttribute("data-lang") === "en";
const urlToken = () => new URLSearchParams(location.search).get("t") || "";
const token = () => urlToken() || S.tok;
const meta = () => { const d = S.data || {}, pf = d.profile || {}; return { events: d.events, photo_url: pf.photo_url, expires_at: d.expires_at, done_at: pf.done_at, self: S.self, account: S.account }; };

function render() {
  const el = root(); if (!el) return;
  if (S.view === "wrong") el.innerHTML = UI.wrongLinkHTML(isEn());
  else if (S.view === "nomine") el.innerHTML = UI.noMineHTML(isEn(), S.mine);
  else if (S.view === "fail") el.innerHTML = UI.loadFailHTML(isEn(), S.offline);
  else if (S.view === "done") el.innerHTML = UI.doneHTML(S.form, meta(), isEn());
  else if (S.view === "form") el.innerHTML = UI.formHTML(S.form, { step: S.step, en: isEn(), errors: S.errors, msg: S.msg, busy: S.busy, meta: meta() });
}
// 換步或存完之後：捲回最上面，焦點放到那一步的標題（讀螢幕的人聽得到換到哪一步）；有錯就放到第一個有錯的格子。
function land() {
  const bad = document.querySelector('#pf-root [aria-invalid="true"]'), h = document.getElementById("pf-h");
  const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (bad) { bad.focus({ preventScroll: true }); bad.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" }); return; }
  window.scrollTo(0, 0);
  if (h) h.focus({ preventScroll: true });
}

// 畫面上的格子讀回 S.form（畫面上只有現在這一步的格子，別步的值留在 S.form 裡不動）。
function sync() {
  const f = document.getElementById("pf-form");
  if (S.view === "form" && f) S.form = UI.readSet(f, UI.readForm(f.elements, S.form));
}
// 填到一半的內容：停手 300 毫秒才寫一次；換步、離開分頁時馬上寫。
let draftTimer = 0;
function keep() { clearTimeout(draftTimer); draftTimer = 0; if (S.view === "form") UI.draftSave(token(), S.form, S.step, S.base); }
function keepSoon() { clearTimeout(draftTimer); draftTimer = setTimeout(keep, 300); }

function go(step) {
  sync();
  S.step = Math.min(Math.max(step, 1), UI.STEPS.length); S.msg = "";
  keep(); render(); land();
}
function next() {
  sync();
  // 只看現在這一步的格子。這一步舊的錯誤先收掉，照這一次看到的重新標。
  const v = UI.validate(S.form, S.step, isEn()), here = S.step;
  S.errors = Object.assign(Object.fromEntries(Object.entries(S.errors).filter(([p]) => UI.stepOf(p) !== here)), v.errors);
  if (!v.ok) { S.msg = UI.t("fix", isEn()); keep(); render(); land(); return; }
  go(S.step + 1);
}

async function load() {
  const { data, error } = await supabase.rpc("rc_public_profile", { p_token: token() });
  if (error) throw error;
  return data && data.person ? data : null;
}
async function save() {
  if (S.busy) return;
  sync();
  // 整份看一遍。沒勾「我已滿 18 歲」、名字空的、格式不對的，都在這裡擋下來，不叫資料庫。
  const v = UI.validate(S.form, null, isEn());
  if (!v.ok) { S.errors = v.errors; S.step = v.step; S.msg = v.step === UI.STEPS.length && Object.keys(v.errors).length === 1 && v.errors.adult ? "" : UI.t("fix", isEn()); keep(); render(); land(); return; }
  S.errors = {}; S.msg = ""; S.busy = true; keep(); render();
  try {
    if (!supabase) throw new Error("no_client");
    const { error } = await supabase.rpc("rc_public_profile_save", { p_token: token(), p: UI.toPayload(S.form) });
    if (error) throw error;
    UI.draftClear(token());
    // 存完重讀一次：新加的學歷與經歷這時候才有 id，下一次存才是「改那一列」而不是再加一列。
    // 讀不回來不算失敗（已經存進去了），留著畫面上那一份，照樣說存好了。
    try {
      const d = await load();
      if (d) { S.data = d; S.base = (d.profile && d.profile.updated_at) || ""; S.form = Object.assign(UI.fromServer(d), { adult: S.form.adult }); }
    } catch (e) { /* 留著原本那一份 */ }
    // 開帳號：登入的人本來就有帳號，不用問。這一步失敗不算沒存（檔案已經存進去了），那一塊講一句就好。
    S.account = S.self ? { state: "self" } : await accountFor();
    S.busy = false; S.view = "done"; render(); land();
  } catch (err) {
    // 沒存進去：他打的每一個字都留在 S.form 與草稿裡，畫面回到有錯的那一步，講原因。
    const at = UI.errorField(err);
    S.busy = false;
    const pe = UI.parseError(err);
    // 對得到格子的錯誤放在那一格底下（存的是代碼，換語言重畫時句子跟著換）；對不到的放最上面。
    if (at) { S.errors = { [at]: pe.code === "too_long" ? "too_long:" + pe.field : pe.code }; S.step = UI.stepOf(at); S.msg = ""; }
    else S.msg = UI.errorText(navigator.onLine === false ? "network" : err, isEn());
    console.error("/profile/ 沒存進去：", pe.code);
    keep(); render(); land();
  }
}

async function accountFor() {
  try {
    const { data, error } = await supabase.rpc("rc_public_profile_account", { p_token: token(), p_lang: isEn() ? "en" : "zh" });
    if (error) throw error;
    return data || { state: "error" };
  } catch (e) {
    const code = UI.parseError(e).code;
    console.error("/profile/ 開帳號那一步沒成功：", code);
    return { state: "error", code };
  }
}
// 登入的人：跟資料庫要他自己的那一條。沒登入、名單上沒有他、他是幹部，都回空字串（S.mine 記為什麼）。
async function mine() {
  let session = null;
  try { session = ((await supabase.auth.getSession()).data || {}).session; } catch (e) { return ""; }
  if (!session) return "";
  const { data, error } = await supabase.rpc("rc_my_profile_link");
  if (error) { S.mine = UI.parseError(error).code; return ""; }
  if (!data || !data.token) { S.mine = "no_record"; return ""; }
  return data.token;
}

async function boot() {
  try {
    // 網址上沒有 token，或短到不可能是真的（資料庫發的是 64 個字）：登入的人改自己的那一份；沒登入就說連結不對。
    if (urlToken().length < 32) {
      const mt = supabase ? await mine() : "";
      if (!mt) { S.view = S.mine ? "nomine" : "wrong"; render(); return; }
      S.tok = mt; S.self = true; langLink();
    }
    if (token().length < 32) { S.view = "wrong"; render(); return; }
    if (!supabase) throw new Error("no_client");
    const d = await load();
    if (!d) { S.view = "wrong"; render(); return; }
    S.data = d; S.base = (d.profile && d.profile.updated_at) || ""; S.form = UI.fromServer(d);
    const draft = UI.draftLoad(token(), S.base);
    // 草稿裡沒有題目（每次照資料庫那一份）；答案疊在資料庫那一份上面，草稿比較舊的那幾題不會把存過的蓋成空的。
    if (draft) { S.form = Object.assign(draft.state, { set: S.form.set, answers: Object.assign({}, S.form.answers, draft.state.answers) }); S.step = draft.step; }
    S.view = "form"; render();
  } catch (e) {
    console.error("/profile/ 載入失敗：", UI.parseError(e).code);
    S.view = "fail"; S.offline = navigator.onLine === false; render();
  }
}

// ── 事件 ────────────────────────────────────────────────────────────────
// 把一格底下的錯誤收起來（他正在改那一格）。
function clearError(name) {
  if (!S.errors[name]) return;
  delete S.errors[name];
  const el = document.getElementById(UI.fieldId(name)), line = document.getElementById(UI.fieldId(name) + "-e");
  if (el) { el.removeAttribute("aria-invalid"); const box = el.closest(".pf-f"); if (box) box.classList.remove("pf-bad"); }
  if (line) { line.hidden = true; line.textContent = ""; }
}
// 打字或勾選：讀回狀態、把那一格的錯誤收起來、更新自我介紹的字數、稍後寫草稿。**不重畫**，不然打到一半的那一格會失去游標。
function onInput(e) {
  const el = e.target; if (!el || !el.closest || !el.closest("#pf-form")) return;
  // 一套故事題裡的格子（引擎畫的）：整套讀回來、重算哪幾題藏起來，那一題的錯誤收起來。
  const fx = el.closest("[data-fx]");
  if (fx) {
    const f = document.getElementById("pf-form");
    S.form = UI.readSet(f, S.form); UI.refreshSet(f, S.form, isEn());
    const id = "ans." + fx.dataset.fx;
    if (S.errors[id]) { delete S.errors[id]; fx.classList.remove("fx-bad"); const er = fx.querySelector(".fx-err"); if (er) { er.hidden = true; er.textContent = ""; } }
    keepSoon(); return;
  }
  if (!el.name) return;
  S.form = UI.setField(S.form, el.name, el.type === "checkbox" ? el.checked : el.value);
  // 「名字至少填一個」標在英文名字那一格，填了中文名字也要把它收掉。
  for (const name of el.name === "name_zh" ? ["name_zh", "name_en"] : [el.name]) clearError(name);
  const count = document.getElementById(UI.fieldId(el.name) + "-c");
  if (count) count.textContent = UI.countText(el.value, el.maxLength);
  keepSoon();
}
document.addEventListener("input", onInput);
document.addEventListener("change", onInput);
document.addEventListener("click", e => {
  const b = e.target && e.target.closest && e.target.closest("#pf-root [data-nav],#pf-root [data-go],#pf-root [data-add],#pf-root [data-del]");
  if (!b || b.disabled) return;
  if (b.dataset.nav === "back") go(S.step - 1);
  else if (b.dataset.nav === "next") next();
  else if (b.dataset.nav === "save") save();
  else if (b.dataset.nav === "edit") { S.view = "form"; S.step = 1; S.errors = {}; S.msg = ""; render(); land(); }
  else if (b.dataset.go) go(Number(b.dataset.go));
  else if (b.dataset.add) {
    sync(); S.form = UI.addRow(S.form, b.dataset.add); keep(); render();
    // 焦點放到新那一列的第一格。
    const first = document.getElementById(UI.fieldId(`${b.dataset.add}.${S.form[b.dataset.add].length - 1}.institution`));
    if (first) first.focus();
  } else if (b.dataset.del) {
    const [list, i] = b.dataset.del.split(".");
    sync(); S.form = UI.removeRow(S.form, list, i);
    // 那一列底下的錯誤跟著列一起走；後面幾列的編號會往前移，乾脆把這一串的錯誤都收掉，按下一步時再看一次。
    S.errors = Object.fromEntries(Object.entries(S.errors).filter(([p]) => !p.startsWith(list)));
    keep(); render();
    const add = document.querySelector(`#pf-root [data-add="${list}"]`);
    if (add) add.focus();
  }
});
// 表單裡按 Enter 不送出（這一頁沒有「送出表單」這件事，只有下一步與儲存兩顆按鈕）。
document.addEventListener("submit", e => { e.preventDefault(); });
// 離開或切到別的分頁：把還沒寫的草稿寫掉。
window.addEventListener("pagehide", () => { sync(); keep(); });
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") { sync(); keep(); } });

// 右上角換語言：index.html 那段小程式已經把 <html data-lang> 換好，這裡把畫面上的字讀回來、照新的語言重畫，
// 再把網址換成帶著 token 與新語言的那一條（重新整理、把連結存起來，語言都還在）。
function langLink() {
  const a = document.getElementById("lang"); if (!a) return;
  a.setAttribute("href", UI.langHref(urlToken(), isEn() ? "zh" : "en"));
}
document.addEventListener("bt-lang", () => {
  sync();
  if (S.msg) S.msg = "";
  try { history.replaceState(null, "", UI.langHref(urlToken(), isEn() ? "en" : "zh")); } catch (e) { /* 換不了網址不影響填寫 */ }
  langLink(); render();
});
langLink();
UI.ensureFx(document);
boot();
