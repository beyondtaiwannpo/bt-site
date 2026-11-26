// /resources/ 的邏輯。
//
// ⚠ **沒登入也要看得起來。** 標題與介紹是公開的，那是這一頁能被 Google
// 找到的唯一途徑，也是 2026-09-07「全部要登入」那個決定的補償設計。
// 只有 url 那一欄要登入（欄位層級授權，見那支遷移檔）。
import { supabase } from "../../shared/supabase.js";
import * as AUTH from "../../shared/auth.js";
import * as UI from "./ui.js";

let S = { items: [], sections: [], signedIn: false, ready: false, msg: "" };
const root = () => document.getElementById("rs-root");
const isEn = () => document.documentElement.getAttribute("data-lang") === "en";

function render() {
  let el = root();
  if (!el || !S.ready) return;
  // HTML 裡 #rs-root 在原本那個「資源」大標那一塊的裡面。第一次畫的時候把那一整塊換成 #rs-root 自己，
  // 之後每個大標各畫一塊。HTML 那一段刻意沒有改：瀏覽器的快取裡新舊 HTML 配新舊程式，四種配法都畫得對。
  const host = el.closest("section.sec");
  if (host) {
    const box = document.createElement("div");
    box.id = "rs-root";
    el.removeAttribute("id");
    host.replaceWith(box);
    el = box;
  }
  el.innerHTML = S.msg ? UI.errorPageHTML(S.msg) : UI.pageHTML(S.items, S.sections, S.signedIn, isEn());
  // 捲動效果（shared/public.js）：新畫出來的那幾列也要浮上來。那一支沒載到就算了。
  if (window.btRise) window.btRise(el);
}

// 兩種身分兩種查詢，**欄位清單刻意不共用**。
// 共用一份的話，遲早有人為了「順手」把 url 加進去，
// 而那一刻整個資源庫就變成公開的，畫面上完全看不出來
//（anon 那一份會直接被資料庫拒絕，所以真正的後果是這一頁整個壞掉，
//  但那是在有人先改壞授權之後 —— 兩道門要各自成立）。
const PUBLIC_COLS = "id, title, blurb, kind, ord";
const MEMBER_COLS = "id, title, blurb, kind, ord, url";
// 大標（2027-01-13-resource-sections.sql）：每一筆多讀一欄 section_id，沒登入的人也讀得到這一欄。
// 那一支還沒在資料庫上跑的時候這一欄不存在，查詢會整個失敗，所以失敗了就退回上面那兩份再問一次，
// 這一頁照舊是一整排。**退回去的那一份一樣分兩種身分**，不會因為退路就多讀到 url。
const SECTION_COL = ", section_id";

const listResources = cols => supabase.from("resources").select(cols).eq("status", "published").order("ord");
export async function loadResources(signedIn, ask = listResources) {
  const base = signedIn ? MEMBER_COLS : PUBLIC_COLS;
  const first = await ask(base + SECTION_COL);
  if (!first.error) return first.data || [];
  const again = await ask(base);
  if (again.error) throw again.error;
  return again.data || [];
}
// 大標讀不到（那張表還不在、或一時連不上）就當作沒有大標：資源照樣一整排畫出來。
const listSections = () => supabase.from("resource_sections").select("id, name_zh, name_en, ord").order("ord");
export async function loadSections(ask = listSections) {
  try {
    const { data, error } = await ask();
    if (error) throw error;
    return data || [];
  } catch (e) {
    console.warn("/resources/ 讀不到大標，資源照一整排畫。", e);
    return [];
  }
}

async function boot() {
  try {
    try {
      const who = await AUTH.currentUserDetailed();
      S.signedIn = !who.offline && !!who.user;
    } catch (e) { console.warn("讀不到登入狀態，當成沒登入。", e); }

    const [items, sections] = await Promise.all([loadResources(S.signedIn), loadSections()]);
    S.items = items; S.sections = sections;
  } catch (e) {
    console.error("/resources/ 載入失敗：", e);
    S.msg = isEn()
      ? "We cannot reach the database right now. Please try again later."
      : "現在連不上資料庫，等一下再試一次。";
  }
  S.ready = true;
  render();
}

if (typeof document !== "undefined") {
document.addEventListener("click", e => {
  const b = e.target.closest('[data-act="signin"]');
  if (!b) return;
  // 2026-11-09：鑰匙「resources」（app/src/nav.js），不送整條路徑（對不到表，登入完會停在 dashboard）。
  location.href = "../app/?next=resources" + (isEn() ? "&lang=en" : "");
});

// 語言按鈕改 data-lang，這一區的字是 JavaScript 畫的，要自己跟著換。
new MutationObserver(() => render())
  .observe(document.documentElement, { attributes: true, attributeFilter: ["data-lang"] });

boot();
}
