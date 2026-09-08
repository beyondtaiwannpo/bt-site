// /apply/ 的畫面。**esc 是自己的一份**（資料夾之間不互相依賴）。
//
// 這一頁的外殼是中英雙語，但**表單的內容是單語的** ——
// 一份表單一種語言（2026-09-07 拍板），題目沒有雙語欄位。
// 所以：頁面的骨架文字走下面的 T()，題目與說明照原文顯示。
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const DICT = {
  program:  ["給高中生的計畫", "For high school students"],
  board:    ["加入我們的團隊", "Join the team"],
  none:     ["現在沒有開放中的申請。下一場會先公布在 Instagram。",
             "Nothing is open right now. The next one will be announced on Instagram first."],
  apply:    ["我要申請", "Apply"],
  closesAt: ["收件到 ", "Closes "],
  notify:   ["預計 ", "Decisions by "],
  notify2:  [" 前通知", ""],
  back:     ["← 回清單", "← Back"],
  needIn:   ["送出申請需要一個 BT 帳號。", "You need a Beyond Taiwan account to submit."],
  signin:   ["登入或註冊", "Sign in or sign up"],
  preview:  ["下面是這份申請會問的問題，可以先看過再決定。",
             "These are the questions. Have a look before you decide."],
  submit:   ["送出申請", "Submit"],
  sending:  ["送出中…", "Sending…"],
  done:     ["收到了。", "Received."],
  doneSub:  ["你可以在自己的帳號頁看到這份申請的狀態。",
             "You can see the status of this application on your account page."],
  toAcct:   ["去我的帳號", "Go to my account"],
  already:  ["你已經送出過這一份申請了。", "You have already submitted this one."],
  guardian: ["家長或監護人的 email", "Parent or guardian email"],
  guardHelp:["未滿 18 歲請填。我們會寄一封信告訴他你申請了什麼、我們保存哪些資料。不是要簽名。",
             "If you are under 18. We send them one email saying what you applied for and what we keep. No signature needed."],
  required: ["必填", "required"],
  profile:  ["先把你的姓名、學校、年級填一下，送出申請要用。",
             "Please fill in your name, school and year first."],
  toProfile:["去填", "Fill it in"],
};
const T = (k, en) => DICT[k][en ? 1 : 0];

// ⚠ **只有日期的字串不可以交給 new Date()。**
// "2026-12-15" 會被當成 UTC 午夜，再用本地的 getDate() 讀出來，
// 在台灣以西的時區就會少一天 —— 而畫面上那是一個看起來完全正常的日期。
// 2026-09-08 實測：headless Chrome（美西時區）把 12/15 畫成 12/14。
// 帶時間的字串（timestamptz）就該用本地時間讀，那是對的，所以只有日期要特判。
export const fmtDate = (v, en) => {
  if (!v) return "";
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(String(v));
  const [y, m, day] = dateOnly
    ? String(v).split("-").map(Number)
    : (() => { const d = new Date(v); return isNaN(d) ? [] : [d.getFullYear(), d.getMonth() + 1, d.getDate()]; })();
  if (!y) return "";
  if (!en) return `${y} 年 ${m} 月 ${day} 日`;
  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${day} ${MON[m - 1]} ${y}`;
};

// ── 清單 ──────────────────────────────────────────────────────────────
// 分兩區：給高中生的計畫、幹部招募。**那兩區的讀者不是同一群人**，
// 混在一起的話高中生會看到一份他不該申請的東西。
export function listHTML(forms, en) {
  if (!forms.length) return `<p class="note">${esc(T("none", en))}</p>`;
  const group = kind => forms.filter(f => f.kind === kind);
  const block = (kind, forms) => !forms.length ? "" : `
    <h3 style="font-family:var(--display);font-size:clamp(20px,2vw,26px);margin:26px 0 2px">${esc(T(kind, en))}</h3>
    <ul class="alist">${forms.map(f => `<li>
      <h3>${esc(f.title)}</h3>
      ${f.intro ? `<p>${esc(f.intro)}</p>` : ""}
      <div class="when">${[
        f.closes_at ? esc(T("closesAt", en)) + fmtDate(f.closes_at, en) : "",
        f.notify_by ? esc(T("notify", en)) + fmtDate(f.notify_by, en) + esc(T("notify2", en)) : "",
      ].filter(Boolean).join("・")}</div>
      <a class="btn sm" href="?f=${encodeURIComponent(f.id)}">${esc(T("apply", en))}</a>
    </li>`).join("")}</ul>`;
  return block("program", group("program")) + block("board", group("board"));
}

// ── 一份表單 ──────────────────────────────────────────────────────────
// state：
//   signedIn  已登入而且資料齊了 → 畫得出可以填的表單
//   needIn    沒登入 → 只給預覽加登入按鈕
//   needProfile 登入了但姓名／學校／年級沒填完
//   already   已經送出過
export function formHTML(form, questions, state, msg, busy, en) {
  const editable = state === "signedIn";
  const q = questions.map(x => `<div class="q" data-q="${esc(x.id)}">
    <label for="q-${esc(x.id)}">${esc(x.label)}${x.required ? ` <span class="req">*${esc(T("required", en))}</span>` : ""}</label>
    ${x.help ? `<p class="help">${esc(x.help)}</p>` : ""}
    ${field(x, editable, en)}
  </div>`).join("");

  return `<p><button class="quiet" data-act="back">${esc(T("back", en))}</button></p>
    <h3 style="font-family:var(--display);font-size:clamp(24px,2.8vw,34px);margin:14px 0 8px">${esc(form.title)}</h3>
    ${form.intro ? `<p class="note" style="margin-bottom:16px">${esc(form.intro)}</p>` : ""}
    ${form.notify_by ? `<p class="when">${esc(T("notify", en))}${fmtDate(form.notify_by, en)}${esc(T("notify2", en))}</p>` : ""}
    ${msg ? `<div class="warn">${esc(msg)}</div>` : ""}
    ${state === "already" ? `<div class="warn">${esc(T("already", en))}</div>` : ""}
    ${state === "needIn" ? `<div class="warn">${esc(T("needIn", en))}<br>${esc(T("preview", en))}</div>
      <p><button class="btn" data-act="signin">${esc(T("signin", en))}</button></p>` : ""}
    ${state === "needProfile" ? `<div class="warn">${esc(T("profile", en))}</div>
      <p><button class="btn" data-act="signin">${esc(T("toProfile", en))}</button></p>` : ""}
    ${q}
    ${editable ? `<div class="q">
      <label for="guard">${esc(T("guardian", en))}</label>
      <p class="help">${esc(T("guardHelp", en))}</p>
      <input id="guard" type="text" inputmode="email" autocomplete="off" spellcheck="false">
    </div>
    <p><button class="btn" data-act="submit" ${busy ? "disabled" : ""}>${
      esc(busy ? T("sending", en) : T("submit", en))}</button></p>` : ""}`;
}

function field(x, editable, en) {
  const dis = editable ? "" : " disabled";
  if (x.type === "long") return `<textarea id="q-${esc(x.id)}"${dis}></textarea>`;
  if (x.type === "single" || x.type === "multi") {
    const t = x.type === "single" ? "radio" : "checkbox";
    return (x.options || []).map((o, i) => `<label class="opt">
      <input type="${t}" name="o-${esc(x.id)}" value="${esc(o)}"${dis}>
      <span>${esc(o)}</span></label>`).join("");
  }
  return `<input id="q-${esc(x.id)}" type="text"${dis}>`;
}

export function doneHTML(en) {
  return `<h3 style="font-family:var(--display);font-size:clamp(24px,2.8vw,34px);margin:0 0 8px">${esc(T("done", en))}</h3>
    <p class="note">${esc(T("doneSub", en))}</p>
    <p><a class="btn" href="../app/">${esc(T("toAcct", en))}</a></p>`;
}

export function errorHTML(text) {
  return `<div class="warn">${esc(text)}</div>
    <p><button class="quiet" data-act="back">← 回清單 / Back</button></p>`;
}
