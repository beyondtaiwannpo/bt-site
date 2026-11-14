// /feedback/ 的畫面（2026-12-01，BT Records；2026-11-13 換成共用的表單引擎 shared/forms.js）。**esc 是自己的一份**，不從別的資料夾 import。
// 外框（標題、活動、開頭說明、資料告知）的字中英並排在這裡，哪一版顯示由 <html data-lang> 決定。
// 題目本身由引擎畫（換頁、進度條、條件邏輯、驗證），它照 en 旗標只畫一種語言，切語言時 main.js 重新 mount 一次。
import * as F from "../../shared/forms.js";
export { F };

export const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const both = (zh, en) => `<span class="zh">${esc(zh)}</span><span class="en">${esc(en)}</span>`;
const pick = (en, zh, e) => esc(en ? e : zh);

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
  required: ["這一題要填。", "This one is required."],
  bad_scale_value: ["分數要在範圍內。", "Pick a number on the scale."],
  bad_option: ["請從選項裡選。", "Pick one of the options."],
  too_long: ["這一題寫太長了。", "This answer is too long."],
  bad_answer: ["這一題的格式不對，再看一下。", "This answer is not in the right format."],
};
export function says(err, en) {
  const m = String((err && err.message) || err || "");
  for (const [code, [zh, e]] of Object.entries(ERR)) if (m.includes(code)) return en ? e : zh;
  return en ? "Could not send. Please try again, or write to beyondtaiwan2020@gmail.com." : "送不出去。再試一次，或寄信到 beyondtaiwan2020@gmail.com。";
}
// 資料庫的錯誤後面接題號（required:3、bad_answer:5），換成那一題的 id，錯誤訊息就放得到那一題底下。
// 對不到題（沒有題號、或題號不在這份裡）回 null，main.js 就把訊息放在最上面。
export function errorTarget(err, items) {
  const m = String((err && err.message) || err || "").match(/\b(required|bad_option|bad_scale_value|too_long|bad_answer):(\d+)/);
  if (!m) return null;
  const q = (items || []).find(x => Number(x.ord) === Number(m[2]));
  return q ? q.id : null;
}

// 資料庫回的題目變成引擎的形狀（分數題的兩端收進 config）。還沒跑 2026-12-24 的資料庫沒有 config、logic，normalize 補預設，照舊能填。
// ord 留著：送出時資料庫的錯誤用題號指是哪一題（normalize 不帶 ord）。
export const itemsOf = d => ((d && d.questions) || []).map(q => Object.assign(F.normalize(q), { ord: q.ord }));
// 引擎交出來的答案（[{ q, v }]，v 是文字、多選用換行接起來）變成 rc_public_submit 要的 { 題目 id: 值 }。
// 多選送陣列：新舊兩版的資料庫都收陣列（新版也收換行接起來的字，舊版不收）。
export function toAnswers(payload, items) {
  const out = {}, byId = new Map((items || []).map(q => [q.id, q]));
  for (const a of payload || []) {
    const q = byId.get(a.q); if (!q) continue;
    out[a.q] = q.type === "multi" ? F.fromText(q, a.v) : a.v;
  }
  return out;
}

// 最上面：標題、活動、開頭說明、資料告知、訊息，底下一個空的框給引擎。收起來的表單只印標題加一句。
export function shellHTML(d, msg) {
  const f = (d && d.form) || {};
  if (!f.open) return `<h1>${esc(f.title || "")}</h1><div class="warn">${both("這一份已經收起來了，不收新的答案。", "This form is closed and no longer takes answers.")}</div>`;
  return `<h1>${esc(f.title || "")}</h1>
    ${f.event_title ? `<p class="mini">${esc(f.event_title)}</p>` : ""}
    ${f.intro ? `<p class="lead">${esc(f.intro).replace(/\n/g, "<br>")}</p>` : ""}
    <div class="notice"><b>${both("你的資料會怎麼用", "How your answers are used")}</b><br><span class="zh">${esc(NOTICE.zh)}</span><span class="en">${esc(NOTICE.en)}</span></div>
    <div id="fb-msg">${msg ? `<div class="warn" role="alert">${esc(msg)}</div>` : ""}</div>
    <div id="fx-run"></div>
    <p class="mini fb-keep">${both("填到一半的答案只留在這個分頁，重新整理不會不見；關掉分頁或送出之後就清掉。email 與名字不留。", "Your answers stay in this tab only, so a refresh does not lose them. Closing the tab or sending clears them. Your email and name are never kept.")}</p>`;
}

// 最後一頁、送出鈕上面那一段：年齡、可不可以 email 你、email 與名字。這幾格不進草稿（main.js 自己記在記憶體裡）。
// 用引擎的樣式（fx-q、fx-opt），看起來跟題目是同一份。en 決定印哪一種語言（引擎畫的部分只有一種語言）。
export function metaHTML(meta, en) {
  const m = Object.assign({ age_band: "unknown", contact_ok: false, email: "", name: "" }, meta || {});
  const band = (v, zh, e) => `<label class="fx-opt"><input type="radio" name="fb-age" data-meta="age_band" value="${v}"${m.age_band === v ? " checked" : ""}><span>${pick(en, zh, e)}</span></label>`;
  return `<div class="fb-meta">
    <div class="fx-q"><p class="fx-label" id="fb-age-l">${pick(en, "你 18 歲以下嗎？", "Are you under 18?")}</p>
      <div class="fx-opts" role="radiogroup" aria-labelledby="fb-age-l">${band("under18", "是", "Yes")}${band("18plus", "不是", "No")}${band("unknown", "不想說", "Prefer not to say")}</div></div>
    <div class="fx-q"><label class="fx-opt"><input type="checkbox" id="fb-contact" data-meta="contact_ok"${m.contact_ok ? " checked" : ""}><span>${pick(en, "可以用 email 通知我下一步與明年的活動", "You may email me about next steps and next year's events")}</span></label>
      <div id="fb-contact-box"${m.contact_ok ? "" : " hidden"}>
        <div class="fx-q fb-sub"><label class="fx-label" for="fb-email">Email</label><input type="email" id="fb-email" data-meta="email" maxlength="120" autocomplete="email" inputmode="email" spellcheck="false" value="${esc(m.email)}"></div>
        <div class="fx-q fb-sub"><label class="fx-label" for="fb-name">${pick(en, "名字（選填）", "Name (optional)")}</label><input type="text" id="fb-name" data-meta="name" maxlength="60" autocomplete="name" value="${esc(m.name)}"></div>
      </div>
      <p class="fx-help fb-note">${pick(en, "留了 email 這一份才會對到你本人；不留就是匿名的。", "Only if you leave an email is this linked to you; otherwise it is anonymous.")}</p></div>
  </div>`;
}
// 送出前看一下聯絡那一段：勾了「可以 email 我」就要一個格式對的 email。回錯誤代碼或空字串。
export function metaProblem(meta) {
  const m = meta || {};
  if (m.contact_ok && !F.isEmail(m.email)) return "bad_email";
  return "";
}
// 送出去的 meta：沒勾「可以 email 我」就不帶 email 與名字（打了又取消勾的字不送）。
export function metaOut(meta) {
  const m = Object.assign({ age_band: "unknown", contact_ok: false, email: "", name: "" }, meta || {});
  const band = ["under18", "18plus", "unknown"].includes(m.age_band) ? m.age_band : "unknown";
  return m.contact_ok ? { age_band: band, contact_ok: true, email: String(m.email || "").trim(), name: String(m.name || "").trim() }
                      : { age_band: band, contact_ok: false, email: "", name: "" };
}

// 填到一半的答案：只放 sessionStorage（這個分頁關掉就沒了），不放 localStorage。
// 這一頁的填寫人多半是未成年、常用學校或家裡的共用電腦，答案留在裝置上十四天，下一個人打開同一個連結就看得到。
// store 是給測試換掉用的；每一句都包 try，無痕視窗或擋了網站資料的瀏覽器照樣能填，只是不留。
export const draftKey = formId => `bt.fb.draft.${formId}`;
const ss = store => store || (typeof sessionStorage !== "undefined" ? sessionStorage : null);
export function draftLoad(formId, store) {
  try { const raw = ss(store) && ss(store).getItem(draftKey(formId)); if (!raw) return null; const d = JSON.parse(raw); return d && d.answers ? { answers: d.answers, page: Number(d.page) || 0 } : null; }
  catch (e) { return null; }
}
export function draftSave(formId, answers, page, store) {
  try { if (ss(store)) ss(store).setItem(draftKey(formId), JSON.stringify({ answers: answers || {}, page: page || 0 })); } catch (e) { /* 存不了就算了 */ }
}
export function draftClear(formId, store) { try { if (ss(store)) ss(store).removeItem(draftKey(formId)); } catch (e) { /* 同上 */ } }

export function doneHTML() {
  return `<div class="done"><h1>${both("送出了，謝謝。", "Sent. Thank you.")}</h1><p class="lead">${both("你寫的每一句都會在下一次辦活動前被讀過。", "Every line you wrote will be read before the next event.")}</p><p><a class="btn" href="../">${both("回 Beyond Taiwan", "Back to Beyond Taiwan")}</a></p></div>`;
}
export function errorHTML(text) { return `<div class="warn">${esc(text)}</div>`; }
