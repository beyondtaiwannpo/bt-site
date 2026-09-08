// /resources/ 的畫面。**esc 是自己的一份**（資料夾之間不互相依賴）。
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// 類型用文字不用圖示：圖示要另外學，而「PDF」三個字誰都看得懂。
const KIND = {
  pdf:    ["PDF", "PDF"],
  video:  ["影片", "Video"],
  slides: ["投影片", "Slides"],
  sheet:  ["表格", "Sheet"],
  book:   ["手冊", "Book"],
  link:   ["連結", "Link"],
};
const T = {
  open:    ["打開", "Open"],
  locked:  ["登入就拿得到", "Sign in to get it"],
  none:    ["還沒有放上來的東西。之後會陸續加。",
            "Nothing here yet. More is coming."],
  needIn:  ["這些東西是免費的，但要先有一個帳號。開帳號兩分鐘。",
            "These are free, but you need an account. It takes two minutes."],
  signin:  ["登入或註冊", "Sign in or sign up"],
};
const t = (k, en) => T[k][en ? 1 : 0];
const kindLabel = (k, en) => (KIND[k] || KIND.link)[en ? 1 : 0];

// signedIn 決定那顆按鈕是「打開」還是「登入就拿得到」。
//
// ⚠ **沒登入的時候，資料裡根本沒有 url 那一欄**（欄位層級授權擋著，
// 見 supabase/migrations/2026-09-11-resources.sql）。
// 所以這裡不是「有連結但不給點」，是真的沒有那個值 ——
// 前端就算被改掉也拿不到。畫面上的鎖不是那道門，資料庫才是。
export function listHTML(items, signedIn, en) {
  if (!items.length) return `<p class="note">${esc(t("none", en))}</p>`;
  return `${signedIn ? "" : `<div class="warn">${esc(t("needIn", en))}
      <div style="margin-top:12px"><button class="btn" data-act="signin">${esc(t("signin", en))}</button></div>
    </div>`}
    <ul class="rlist">${items.map(r => `<li>
      <span class="kind">${esc(kindLabel(r.kind, en))}</span>
      <h3>${esc(r.title)}</h3>
      ${r.blurb ? `<p>${esc(r.blurb)}</p>` : ""}
      ${signedIn && r.url
        ? `<a class="btn" href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">${esc(t("open", en))}</a>`
        : `<button class="btn ghost" data-act="signin">${esc(t("locked", en))}</button>`}
    </li>`).join("")}</ul>`;
}

export function errorHTML(text) {
  return `<div class="warn">${esc(text)}</div>`;
}
