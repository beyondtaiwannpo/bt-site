// /feedback/ 的邏輯（2026-12-01，BT Records；2026-11-13 換成共用的表單引擎 shared/forms.js，跟 /apply/ 同一支）。
// ⚠ 這一頁沒登入也要能填。題目用 rc_public_form(token)、送出用 rc_public_submit(token, answers, meta)，
//   兩支是開給 anon 的（supabase-js 帶公開金鑰就叫得到）。門在資料庫：開著才回題目、一小時最多 200 份。
// 引擎管換頁、進度條、條件邏輯、驗證；這裡管外框、最後一頁的年齡與聯絡、送出、語言、填到一半的答案（只留在這個分頁）。
import { supabase } from "../../shared/supabase.js";
import * as UI from "./ui.js";

const F = UI.F;
let S = { data: null, items: [], view: "form", msg: "", answers: {}, page: 0, meta: {}, runner: null };
const root = () => document.getElementById("fb-root");
const isEn = () => document.documentElement.getAttribute("data-lang") === "en";
const token = () => new URLSearchParams(location.search).get("t") || "";
const formId = () => (S.data && S.data.form && S.data.form.id) || "";

function render() {
  const el = root(); if (!el) return;
  if (S.view === "done") { el.innerHTML = UI.doneHTML(); return; }
  if (S.view === "error") { el.innerHTML = UI.errorHTML(S.msg); return; }
  el.innerHTML = UI.shellHTML(S.data, S.msg);
  mountRun();
}
// 引擎畫在 #fx-run。重畫外框（換語言）就再 mount 一次，答案與頁數從 S 帶回去。
function mountRun() {
  const host = document.getElementById("fx-run"); if (!host || !S.data || !S.data.form.open) return;
  S.runner = F.mount(host, S.items, {
    en: isEn(), answers: S.answers, page: S.page,
    submitLabel: isEn() ? "Send" : "送出",
    bottomHTML: () => UI.metaHTML(S.meta, isEn()),
    onChange: (answers, page) => { S.answers = answers; S.page = page; UI.draftSave(formId(), answers, page); },
    onSubmit: submit,
  });
}
function setMsg(text) {
  S.msg = text || "";
  const box = document.getElementById("fb-msg"); if (!box) return;
  box.innerHTML = S.msg ? `<div class="warn" role="alert">${UI.esc(S.msg)}</div>` : "";
  if (S.msg) box.scrollIntoView({ block: "center", behavior: "smooth" });
}
async function submit(payload, ev, answers) {
  S.answers = answers;
  const bad = UI.metaProblem(S.meta);
  if (bad) { setMsg(UI.says(bad, isEn())); const em = document.getElementById("fb-email"); if (em) em.focus(); return; }
  setMsg(""); S.runner.setBusy(true);
  try {
    const { error } = await supabase.rpc("rc_public_submit", { p_token: token(), p_answers: UI.toAnswers(payload, S.items), p_meta: UI.metaOut(S.meta) });
    if (error) throw error;
    UI.draftClear(formId());
    S.answers = {}; S.page = 0; S.meta = {};
    S.view = "done"; render(); window.scrollTo(0, 0);
  } catch (err) {
    const text = UI.says(err, isEn()), id = UI.errorTarget(err, S.items);
    S.runner.setBusy(false);
    // 對得到題的錯誤放在那一題底下（引擎會跳回那一頁），對不到的放最上面。
    if (id) S.runner.setErrors({ [id]: text }, ""); else setMsg(text);
  }
}
async function boot() {
  try {
    if (!supabase) throw new Error("no_client");
    const { data, error } = await supabase.rpc("rc_public_form", { p_token: token() });
    if (error) throw error;
    if (!data || !data.form) { S.view = "error"; S.msg = UI.says("form_not_found", isEn()); render(); return; }
    S.data = data; S.items = UI.itemsOf(data);
    const d = UI.draftLoad(data.form.id);
    if (d) { S.answers = d.answers; S.page = d.page; }
    // 網址上沒指定語言就照表單自己的語言（bt-lang-set 只換外框；引擎在 render 裡照新的語言畫）。
    if (!new URLSearchParams(location.search).get("lang") && (data.form.lang === "en" || data.form.lang === "zh")) {
      document.dispatchEvent(new CustomEvent("bt-lang-set", { detail: data.form.lang }));
    }
    render();
  } catch (e) {
    console.error("/feedback/ 載入失敗：", e);
    S.view = "error";
    S.msg = isEn() ? "We cannot reach the database right now. Please try again later, or write to beyondtaiwan2020@gmail.com."
                   : "現在連不上資料庫，等一下再試一次，或是寄信到 beyondtaiwan2020@gmail.com。";
    render();
  }
}
// 最後一頁的年齡與聯絡：記在 S.meta（記憶體），不進草稿。勾了「可以 email 我」才打開 email 與名字那兩格。
function onMeta(e) {
  const t = e.target; const k = t && t.dataset && t.dataset.meta; if (!k) return;
  S.meta = Object.assign({}, S.meta, { [k]: t.type === "checkbox" ? t.checked : t.value });
  if (k === "contact_ok") { const box = document.getElementById("fb-contact-box"); if (box) box.hidden = !t.checked; }
  if (k === "email" && S.msg) setMsg("");
}
document.addEventListener("input", onMeta);
document.addEventListener("change", onMeta);
// 右上角切語言：外框靠 CSS 換，引擎重新 mount（答案與頁數都在 S 裡）。
document.addEventListener("bt-lang", () => { if (S.view === "form" && S.data) { if (S.runner) { S.answers = S.runner.answers(); S.page = S.runner.page(); } render(); } else render(); });
boot();
