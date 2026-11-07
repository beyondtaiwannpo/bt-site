// /feedback/ 的畫面（2026-12-01，BT Records）。**esc 是自己的一份**，不從別的資料夾 import。
// 字全部中英並排在這裡；哪一版顯示由 <html data-lang> 決定（brand.css 藏另一版），所以畫面同時印兩版。
export const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const both = (zh, en) => `<span class="zh">${esc(zh)}</span><span class="en">${esc(en)}</span>`;

// 資料告知（PDPA 第 8 條）：誰收、為什麼、什麼、多久、誰看得到、怎麼要求刪除。改字要跟 privacy/index.html 一致。
export const NOTICE = {
  zh: "這一份由臺灣理想行教育協會（Beyond Taiwan）收集，只用來辦好這個活動、把下一次辦得更好。我們存你的答案；只有在你自己留 email 的時候才存 email。答案由這場活動的負責幹部與 Co-President 看，不會公開、不會用在募資頁，也不會原文轉給被提到的人。具名的答案保存三屆（約三年），之後只留匿名的部分。要看、要改或要刪你的資料，寫信到 beyondtaiwan2020@gmail.com。",
  en: "This form is collected by Beyond Taiwan (臺灣理想行教育協會) only to run this programme and improve the next one. We keep your answers; your email only if you choose to leave it. Answers are read by the cadres responsible for this event and the Co-Presidents, never published, never used on fundraising pages, and never forwarded verbatim to anyone named. Named answers are kept for three terms (about three years), then only the anonymous part remains. To see, correct or delete your data, write to beyondtaiwan2020@gmail.com.",
};
export const ERR = {
  form_not_found: ["這個連結不對，或表單已經不在了。", "This link is not valid, or the form is gone."],
  form_closed: ["這一份已經收起來了，不收新的答案。", "This form is closed and no longer takes answers."],
  too_many: ["太多人同時在填，等一分鐘再試。", "Too many submissions right now; try again in a minute."],
  bad_email: ["email 的格式不對。", "That email does not look right."],
  required: ["有必填的題目還沒填。", "A required question is still empty."],
  bad_scale_value: ["分數要在範圍內。", "Pick a number on the scale."],
  bad_option: ["請從選項裡選。", "Pick one of the options."],
  too_long: ["有一題寫太長了。", "One answer is too long."],
};
export function says(err, en) {
  const m = String((err && err.message) || err || "");
  for (const [code, [zh, e]] of Object.entries(ERR)) if (m.includes(code)) return en ? e : zh;
  return en ? "Could not send. Please try again, or write to beyondtaiwan2020@gmail.com." : "送不出去。再試一次，或寄信到 beyondtaiwan2020@gmail.com。";
}

function field(q) {
  const name = `q_${q.id}`;
  if (q.type === "long") return `<textarea name="${esc(name)}" maxlength="10000"></textarea>`;
  if (q.type === "single" || q.type === "multi") {
    const t = q.type === "single" ? "radio" : "checkbox";
    return (q.options || []).map(o => `<label class="opt"><input type="${t}" name="${esc(name)}" value="${esc(o)}"><span>${esc(o)}</span></label>`).join("");
  }
  if (q.type === "scale") {
    const nums = []; for (let n = Number(q.scale_min); n <= Number(q.scale_max); n++) nums.push(n);
    return `<div class="scale" role="radiogroup">${q.min_label ? `<span class="mini">${esc(q.min_label)}</span>` : ""}${nums.map(n => `<label class="num"><input type="radio" name="${esc(name)}" value="${n}"><span>${n}</span></label>`).join("")}${q.max_label ? `<span class="mini">${esc(q.max_label)}</span>` : ""}</div>`;
  }
  return `<input type="text" name="${esc(name)}" maxlength="500">`;
}
export function formHTML(d, msg, busy) {
  const f = d.form || {}, qs = d.questions || [];
  if (!f.open) return `<h1>${esc(f.title || "")}</h1><div class="warn">${both("這一份已經收起來了，不收新的答案。", "This form is closed and no longer takes answers.")}</div>`;
  const items = qs.map((q, i) => `<div class="q"><label class="lbl">${i + 1}. ${esc(q.label)}${q.required ? `<span class="req">${both("必填", "required")}</span>` : ""}</label>${q.help ? `<p class="help">${esc(q.help)}</p>` : ""}${field(q)}</div>`).join("");
  return `<h1>${esc(f.title || "")}</h1>
    ${f.event_title ? `<p class="mini">${esc(f.event_title)}</p>` : ""}
    ${f.intro ? `<p class="lead">${esc(f.intro).replace(/\n/g, "<br>")}</p>` : ""}
    <div class="notice"><b>${both("你的資料會怎麼用", "How your answers are used")}</b><br><span class="zh">${esc(NOTICE.zh)}</span><span class="en">${esc(NOTICE.en)}</span></div>
    ${msg ? `<div class="warn">${esc(msg)}</div>` : ""}
    <form id="fb-form" onsubmit="return false">${items}
      <div class="q"><label class="lbl">${both("你 18 歲以下嗎？", "Are you under 18?")}</label>
        <label class="opt"><input type="radio" name="age_band" value="under18"><span>${both("是", "Yes")}</span></label>
        <label class="opt"><input type="radio" name="age_band" value="18plus"><span>${both("不是", "No")}</span></label>
        <label class="opt"><input type="radio" name="age_band" value="unknown" checked><span>${both("不想說", "Prefer not to say")}</span></label></div>
      <div class="q"><label class="opt"><input type="checkbox" name="contact_ok" id="fb-contact"><span>${both("可以用 email 通知我下一步與明年的活動", "You may email me about next steps and next year's events")}</span></label>
        <div id="fb-contact-box" hidden><label class="lbl" for="fb-email">Email</label><input type="email" id="fb-email" name="email" maxlength="120" autocomplete="email"><label class="lbl" for="fb-name">${both("名字（選填）", "Name (optional)")}</label><input type="text" id="fb-name" name="name" maxlength="60"></div>
        <p class="mini">${both("留了 email 這一份才會對到你本人；不留就是匿名的。", "Only if you leave an email is this linked to you; otherwise it is anonymous.")}</p></div>
      <p><button class="btn" type="button" data-act="send"${busy ? " disabled" : ""}>${busy ? both("送出中…", "Sending…") : both("送出", "Send")}</button></p>
    </form>`;
}
export function readAnswers(box, questions) {
  const out = {};
  for (const q of questions || []) {
    const name = `q_${q.id}`;
    if (q.type === "single" || q.type === "scale") { const el = box.querySelector(`[name="${name}"]:checked`); out[q.id] = el ? el.value : ""; }
    else if (q.type === "multi") out[q.id] = [...box.querySelectorAll(`[name="${name}"]:checked`)].map(el => el.value);
    else { const el = box.querySelector(`[name="${name}"]`); out[q.id] = el ? el.value : ""; }
  }
  return out;
}
export function readMeta(box) {
  const band = box.querySelector('[name="age_band"]:checked'), ok = box.querySelector("#fb-contact");
  return { age_band: band ? band.value : "unknown", contact_ok: !!(ok && ok.checked), email: (box.querySelector("#fb-email") || {}).value || "", name: (box.querySelector("#fb-name") || {}).value || "" };
}
export function missingRequired(questions, answers) {
  const i = (questions || []).findIndex(q => q.required && (Array.isArray(answers[q.id]) ? !answers[q.id].length : !String(answers[q.id] || "").trim()));
  return i < 0 ? 0 : i + 1;
}
export function doneHTML() {
  return `<div class="done"><h1>${both("送出了，謝謝。", "Sent. Thank you.")}</h1><p class="lead">${both("你寫的每一句都會在下一次辦活動前被讀過。", "Every line you wrote will be read before the next event.")}</p><p><a class="btn" href="../">${both("回 Beyond Taiwan", "Back to Beyond Taiwan")}</a></p></div>`;
}
export function errorHTML(text) { return `<div class="warn">${esc(text)}</div>`; }
