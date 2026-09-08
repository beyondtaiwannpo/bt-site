// /resources/ 的邏輯。
//
// ⚠ **沒登入也要看得起來。** 標題與介紹是公開的，那是這一頁能被 Google
// 找到的唯一途徑，也是 2026-09-07「全部要登入」那個決定的補償設計。
// 只有 url 那一欄要登入（欄位層級授權，見那支遷移檔）。
import { supabase } from "../../shared/supabase.js";
import * as AUTH from "../../shared/auth.js";
import * as UI from "./ui.js";

let S = { items: [], signedIn: false, ready: false, msg: "" };
const root = () => document.getElementById("rs-root");
const isEn = () => document.documentElement.getAttribute("data-lang") === "en";

function render() {
  const el = root();
  if (!el || !S.ready) return;
  el.innerHTML = S.msg ? UI.errorHTML(S.msg) : UI.listHTML(S.items, S.signedIn, isEn());
}

// 兩種身分兩種查詢，**欄位清單刻意不共用**。
// 共用一份的話，遲早有人為了「順手」把 url 加進去，
// 而那一刻整個資源庫就變成公開的，畫面上完全看不出來
//（anon 那一份會直接被資料庫拒絕，所以真正的後果是這一頁整個壞掉，
//  但那是在有人先改壞授權之後 —— 兩道門要各自成立）。
const PUBLIC_COLS = "id, title, blurb, kind, ord";
const MEMBER_COLS = "id, title, blurb, kind, ord, url";

async function boot() {
  try {
    try {
      const who = await AUTH.currentUserDetailed();
      S.signedIn = !who.offline && !!who.user;
    } catch (e) { console.warn("讀不到登入狀態，當成沒登入。", e); }

    const { data, error } = await supabase
      .from("resources")
      .select(S.signedIn ? MEMBER_COLS : PUBLIC_COLS)
      .eq("status", "published")
      .order("ord");
    if (error) throw error;
    S.items = data || [];
  } catch (e) {
    console.error("/resources/ 載入失敗：", e);
    S.msg = isEn()
      ? "We cannot reach the database right now. Please try again later."
      : "現在連不上資料庫，等一下再試一次。";
  }
  S.ready = true;
  render();
}

document.addEventListener("click", e => {
  const b = e.target.closest('[data-act="signin"]');
  if (!b) return;
  const back = location.pathname + location.search;
  location.href = "../app/?next=" + encodeURIComponent(back);
});

// 語言按鈕改 data-lang，這一區的字是 JavaScript 畫的，要自己跟著換。
new MutationObserver(() => render())
  .observe(document.documentElement, { attributes: true, attributeFilter: ["data-lang"] });

boot();
