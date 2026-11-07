// /feedback/ 的邏輯（2026-12-01，BT Records）。
// ⚠ 這一頁沒登入也要能填。題目用 rc_public_form(token)、送出用 rc_public_submit(token, answers, meta)，
//   兩支是開給 anon 的（supabase-js 帶公開金鑰就叫得到）。門在資料庫：開著才回題目、一小時最多 200 份。
import { supabase } from "../../shared/supabase.js";
import * as UI from "./ui.js";

let S = { data: null, view: "form", msg: "", busy: false };
const root = () => document.getElementById("fb-root");
const isEn = () => document.documentElement.getAttribute("data-lang") === "en";
const token = () => new URLSearchParams(location.search).get("t") || "";

function render() {
  const el = root(); if (!el) return;
  if (S.view === "done") { el.innerHTML = UI.doneHTML(); return; }
  if (S.view === "error") { el.innerHTML = UI.errorHTML(S.msg); return; }
  el.innerHTML = UI.formHTML(S.data, S.msg, S.busy);
  const ok = document.getElementById("fb-contact"), box = document.getElementById("fb-contact-box");
  if (ok && box) { box.hidden = !ok.checked; ok.addEventListener("change", () => { box.hidden = !ok.checked; }); }
}
async function boot() {
  try {
    if (!supabase) throw new Error("no_client");
    const { data, error } = await supabase.rpc("rc_public_form", { p_token: token() });
    if (error) throw error;
    if (!data || !data.form) { S.view = "error"; S.msg = UI.says("form_not_found", isEn()); render(); return; }
    S.data = data;
    // 網址上沒指定語言就照表單自己的語言。
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
document.addEventListener("click", async e => {
  const b = e.target.closest("[data-act]"); if (!b || b.dataset.act !== "send" || S.busy) return;
  const box = document.getElementById("fb-form"); if (!box || !S.data) return;
  const answers = UI.readAnswers(box, S.data.questions), meta = UI.readMeta(box);
  const miss = UI.missingRequired(S.data.questions, answers);
  if (miss) { S.msg = (isEn() ? `Question ${miss} is required.` : `第 ${miss} 題是必填的。`); render(); keep(answers, meta); return; }
  S.busy = true; S.msg = ""; render(); keep(answers, meta);
  try {
    const { error } = await supabase.rpc("rc_public_submit", { p_token: token(), p_answers: answers, p_meta: meta });
    if (error) throw error;
    S.view = "done"; render();
  } catch (err) {
    S.busy = false; S.msg = UI.says(err, isEn()); render(); keep(answers, meta);
  }
});
// 重畫會洗掉填的字，放回去。
function keep(answers, meta) {
  const box = document.getElementById("fb-form"); if (!box) return;
  for (const [k, v] of Object.entries(answers)) {
    const name = `q_${k}`;
    if (Array.isArray(v)) { for (const el of box.querySelectorAll(`[name="${name}"]`)) el.checked = v.includes(el.value); }
    else { const r = box.querySelector(`[name="${name}"][type="radio"][value="${CSS.escape(String(v))}"]`); if (r) r.checked = true; else { const el = box.querySelector(`[name="${name}"]`); if (el && el.type !== "radio") el.value = v; } }
  }
  const band = box.querySelector(`[name="age_band"][value="${meta.age_band}"]`); if (band) band.checked = true;
  const ok = document.getElementById("fb-contact"), cb = document.getElementById("fb-contact-box");
  if (ok) { ok.checked = !!meta.contact_ok; if (cb) cb.hidden = !ok.checked; }
  const em = document.getElementById("fb-email"), nm = document.getElementById("fb-name");
  if (em) em.value = meta.email || ""; if (nm) nm.value = meta.name || "";
}
document.addEventListener("bt-lang", render);
boot();
