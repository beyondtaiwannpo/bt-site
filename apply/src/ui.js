// /apply/ 的畫面。**esc 是自己的一份**（資料夾之間不互相依賴）。
//
// 這一頁的外殼是中英雙語，但**表單的內容是單語的** ——
// 一份表單一種語言（2026-09-07 拍板），題目沒有雙語欄位。
// 所以：頁面的骨架文字走下面的 T()，題目與說明照原文顯示。
import * as F from "../../shared/forms.js";
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
  back:     ["← 看全部開放中的", "← Everything that is open"],
  backEvent:["← 回到這場活動", "← Back to the event"],
  preHead:  ["這張表會問的問題（現在還不能填）", "What this form asks (you cannot fill it in yet)"],
  needIn:   ["報名要先登入，或開一個免費的 BT 帳號，一分鐘。登入之後會回到這張表。", "Sign in or create a free Beyond Taiwan account to sign up. It takes a minute, and you come straight back to this form."],
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
  toProfile:["填我的資料，填完會回到這張表", "Fill in my details, then come back here"],
  full:     ["這一份已經收滿了，謝謝你的興趣。下一場會先公布在 Instagram。", "This one is full. Thank you for your interest. The next one will be on Instagram first."],
  notYet:   ["這一份還沒開始收件。", "This one is not open yet."],
  closed:   ["這一份已經不收了。", "This one is closed."],
  justClosed:["這一份申請剛剛關閉了。", "This application has just closed."],
  emailUsed:["這個 email 已經送過這一份了。", "This email has already been used for this application."],
  missing:  ["這幾題還沒填：", "Still missing: "],
  badAnswer:["這一題的答案格式不對：", "This answer does not look right: "],
  sendFail: ["送不出去：", "Could not send: "],
  fullTag:  ["已收滿", "Full"],
  // 報名類型（2026-11-23，2027-01-02-event-speakers-tickets.sql）。都是免費的，沒有價錢。
  ticketPick:   ["這場活動分成幾種報名，先選一種。", "This event has more than one way to sign up. Pick one first."],
  ticketChoose: ["選這一種", "Choose this"],
  ticketYours:  ["你報名的是：", "You are signing up as: "],
  ticketChange: ["換一種", "Change"],
  ticketFullTag:["額滿", "Full"],
  ticketAllFull:["每一種都額滿了，謝謝你想參加。下一場會先公布在 Instagram。", "Every type is full. Thank you for wanting to join. The next one will be on Instagram first."],
  ticketRequired:["這場活動要先選一種報名類型，選好再送出。", "Pick a sign-up type for this event, then submit again."],
  badTicket:    ["這個報名類型不是這場活動的，重新選一次。", "That sign-up type does not belong to this event. Please pick again."],
  ticketFull:   ["你選的那一種剛剛額滿了，換一種試試看。你填的答案還在。", "The type you picked has just filled up. Try another one. Your answers are still here."],
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
      ${f.is_full ? `<span class="tagline">${esc(T("fullTag", en))}</span>` : `<a class="btn sm" href="?f=${encodeURIComponent(f.id)}">${esc(T("apply", en))}</a>`}
    </li>`).join("")}</ul>`;
  return block("program", group("program")) + block("board", group("board"));
}

// ── 報名類型 ──────────────────────────────────────────────────────────
// 活動有分報名類型（後台設的，免費的）才會用到。tickets 是 public_form_tickets() 回的
// [{ id, name_zh, name_en, note_zh, note_en, capacity, taken, full }]，picked 是選好的那一種的 id（網址上的 ticket，或在這一頁按的）。
// 還有幾個名額：有名額才寫。
export const ticketLeft = (t, en) => {
  const cap = Number(t && t.capacity) || 0; if (!cap) return "";
  const n = Math.max(0, cap - (Number(t.taken) || 0));
  return en ? `${n} ${n === 1 ? "place" : "places"} left` : `還有 ${n} 個名額`;
};
export const ticketIsFull = t => !!t && (t.full === true || ((Number(t.capacity) || 0) > 0 && (Number(t.taken) || 0) >= Number(t.capacity)));
const tkName = (t, en) => (en ? (t.name_en || t.name_zh) : (t.name_zh || t.name_en)) || "";
const tkNote = (t, en) => (en ? (t.note_en || t.note_zh) : (t.note_zh || t.note_en)) || "";
// 網址上的 ticket 對不對得上：要是這份表單的類型、而且還沒滿。對不上回 null（那就先選一種）。
export function ticketFromUrl(tickets, id) {
  const t = (tickets || []).find(x => x && x.id === id);
  return t && !ticketIsFull(t) ? t.id : null;
}
// 選好了：一行「你報名的是哪一種」，有兩種以上才有「換一種」。還沒選：一種一列，一顆「選這一種」，滿了的寫「額滿」沒有按鈕。
export function ticketsHTML(tickets, picked, en) {
  const ts = tickets || [];
  if (!ts.length) return "";
  const mine = ts.find(t => t.id === picked);
  if (mine) return `<p class="tk-yours">${esc(T("ticketYours", en))}<b>${esc(tkName(mine, en))}</b>${
    ts.length > 1 ? ` <button class="quiet" data-act="ticket-clear">${esc(T("ticketChange", en))}</button>` : ""}</p>`;
  const allFull = ts.every(ticketIsFull);
  return `<div class="warn">${esc(T(allFull ? "ticketAllFull" : "ticketPick", en))}</div>
    <ul class="tklist">${ts.map(t => `<li>
      <span class="tk-t"><b>${esc(tkName(t, en))}</b>${tkNote(t, en) ? `<span>${esc(tkNote(t, en))}</span>` : ""}${!ticketIsFull(t) && ticketLeft(t, en) ? `<span class="when">${esc(ticketLeft(t, en))}</span>` : ""}</span>
      ${ticketIsFull(t) ? `<span class="tagline">${esc(T("ticketFullTag", en))}</span>` : `<button class="btn sm" data-act="ticket-pick" data-id="${esc(t.id)}">${esc(T("ticketChoose", en))}</button>`}
    </li>`).join("")}</ul>`;
}

// ── 一份表單 ──────────────────────────────────────────────────────────
// 2026-11-13 起題目由 shared/forms.js 畫（三套表單共用的引擎）：十五種題型、條件邏輯、分頁與進度條。
// state：
//   signedIn    已登入而且資料齊了 → 一頁一頁填的表單（main.js 在 #fx-run 上 mount 引擎）
//   needIn      沒登入 → 整份攤開給人看過，每一格鎖住，加登入按鈕
//   needProfile 登入了但姓名／學校／年級沒填完
//   already     已經送出過
//   closed      收滿了、還沒開放、或剛剛關了（reason 說是哪一種）
// run：signedIn 時引擎第一次畫的那一頁（F.pageHTML 的結果），沒給就留一個空的 #fx-run。
// tk：{ tickets, picked }，活動有分報名類型才有東西。還沒選的時候只畫「先選一種」，選好才畫表單（或登入的按鈕）；
//     已經送過、已經關了的不畫。沒給 tk（活動沒有分類型）這一頁跟原本一模一樣。
// ev：這張表是哪一場活動的報名表（public_events() 的那一列），沒有就是一般的申請。有的話上面印那一場的時間與地點，「回去」那顆寫回這場活動。
export function eventLine(ev, en) {
  if (!ev) return "";
  const when = ev.starts_at ? fmtDate(ev.starts_at, en) : "";
  return [when, ev.place].filter(Boolean).join(en ? " · " : "・");
}
export function formHTML(form, questions, state, msg, busy, en, run, reason, tk, ev) {
  const editable = state === "signedIn";
  const head = `<p><button class="quiet" data-act="back">${esc(T(ev ? "backEvent" : "back", en))}</button></p>
    <h3 style="font-family:var(--display);font-size:clamp(24px,2.8vw,34px);margin:14px 0 8px">${esc(form.title)}</h3>
    ${eventLine(ev, en) ? `<p class="ap-ev">${esc(eventLine(ev, en))}</p>` : ""}
    ${form.intro ? `<p class="note" style="margin-bottom:16px">${esc(form.intro).replace(/\n/g, "<br>")}</p>` : ""}
    ${form.notify_by ? `<p class="when">${esc(T("notify", en))}${fmtDate(form.notify_by, en)}${esc(T("notify2", en))}</p>` : ""}
    ${form.closes_at && state !== "closed" ? `<p class="when">${esc(T("closesAt", en))}${fmtDate(form.closes_at, en)}</p>` : ""}
    ${msg ? `<div class="warn" role="alert">${esc(msg)}</div>` : ""}`;
  const types = tk && state !== "already" && state !== "closed" ? ticketsHTML(tk.tickets, tk.picked, en) : "";
  if (types && !(tk.tickets || []).some(t => t.id === tk.picked)) return head + types;
  if (editable) return head + types + `<div id="fx-run">${run || ""}</div>`;
  return head + types
    + (state === "already" ? `<div class="warn">${esc(T("already", en))}</div>` : "")
    + (state === "closed" ? `<div class="warn">${esc(T(reason === "full" ? "full" : reason === "not_yet" ? "notYet" : "closed", en))}</div>` : "")
    + (state === "needIn" ? `<div class="warn">${esc(T("needIn", en))}<br>${esc(T("preview", en))}</div>
      <p><button class="btn" data-act="signin">${esc(T("signin", en))}</button></p>` : "")
    + (state === "needProfile" ? `<div class="warn">${esc(T("profile", en))}</div>
      <p><button class="btn" data-act="signin">${esc(T("toProfile", en))}</button></p>` : "")
    // 還不能填的時候，底下的題目只是給他先看過（每一格都鎖著）。上面加一行字講清楚，不然看起來像一張壞掉的表。
    + (state === "already" || state === "closed" ? "" : `<p class="ap-pre">${esc(T("preHead", en))}</p>` + F.flatHTML(questions, en));
}

// 最後一頁送出鈕上面那一格：家長或監護人的 email（2026-09-07 拍板，未滿 18 歲請填）。
export function guardianHTML(value, en) {
  return `<div class="fx-q">
      <label class="fx-label" for="guard">${esc(T("guardian", en))}</label>
      <p class="fx-help">${esc(T("guardHelp", en))}</p>
      <input id="guard" type="email" inputmode="email" autocomplete="off" spellcheck="false" value="${esc(value || "")}">
    </div>`;
}

// 送出時伺服器回的錯誤翻成人話。**沒對到的原樣顯示，不要吞掉。**
export function says(err, en) {
  const m = String((err && err.message) || err || "");
  if (m.startsWith("missing:")) return T("missing", en) + m.slice(8);
  if (m.startsWith("bad_answer:")) return T("badAnswer", en) + m.slice(11);
  if (m.includes("form_closed")) return T("justClosed", en);
  if (m.includes("email_used")) return T("emailUsed", en);
  // 報名類型的三種。ticket_full 要排在下面那句 full 前面（那一句是整場活動額滿）。
  if (m.includes("ticket_required")) return T("ticketRequired", en);
  if (m.includes("bad_ticket")) return T("badTicket", en);
  if (m.includes("ticket_full")) return T("ticketFull", en);
  if (/\bfull\b/.test(m)) return T("full", en);
  if (m.includes("profile_incomplete")) return T("profile", en);
  return T("sendFail", en) + m;
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
