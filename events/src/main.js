// /events/（2026-11-01 活動上架批 3）。讀 public_events()，畫清單或一場活動。
// **不載 supabase-js**：只拿 shared/supabase-config.js 的網址與公開金鑰，用瀏覽器的 fetch 打 PostgREST。
// 公開金鑰本來就是公開的（每一頁的 supabase-js 都帶著它），真正的門是資料庫的 RLS 與 public_events() 只回 published。
// 讀不到就印一句「活動載不到」，不留壞掉的框。
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "../../shared/supabase-config.js";
import * as UI from "./ui.js";

// 網址：./#<代號> 是一場活動（用 # 不用 ?e=，因為這一站的語言切換會把 ? 後面的東西換掉）。語言可能黏在後面：#slug?lang=en。
const slugOf = () => (location.hash.slice(1).split("?")[0] || new URLSearchParams(location.search).get("e") || "").trim();
// 開了「減少動態效果」的人：照片那一排按左右鍵是直接跳過去，不是滑過去（CSS 那邊也關了，這裡是 scrollBy 自己帶的那一個）。
const reduce = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

async function rpc(name, body, timeoutMs) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
      method: "POST", signal: ctl.signal,
      headers: { apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return await r.json();
  } finally { clearTimeout(t); }
}
const load = () => rpc("public_events", {}, 4000);
// 一場活動除了那一列之外要印的東西（照片、講者、報名類型）：public_event_extras(代號)，2027-01-01-event-photos.sql 與 2027-01-02-event-speakers-tickets.sql。
// 載不到、逾時、函式還不在（遷移檔還沒跑）一律回 null，不印錯誤：那一頁就是沒有那幾塊，其他照畫。
// 問過的記下來（代號 → 回的東西），換語言或按上一頁重畫的時候不再問一次。
const extras = new Map();
async function loadExtras(slug) {
  if (extras.has(slug)) return extras.get(slug);
  let x = null;
  try { x = await rpc("public_event_extras", { p_slug: slug }, 2500); } catch (e) { x = null; }
  extras.set(slug, x);
  return x;
}
// 這一頁的網址（行事曆的說明裡放的那一條）：不帶 ?lang=，只有路徑與 #代號。
const pageUrl = slug => location.origin + location.pathname + "#" + slug;

function paint(events, slug, x) {
  const e = slug && (events || []).find(v => v.slug === slug);
  for (const l of ["zh", "en"]) {
    const el = document.getElementById("ev-" + l); if (!el) continue;
    el.innerHTML = !slug ? UI.listHTML(events, l) : e ? UI.detailHTML(e, l, x, { url: pageUrl(slug) }) : UI.notFoundHTML(l);
  }
  // 一場活動那一頁沒有最上面「活動」那一大塊標題（index.html 的 <head> 先照網址判斷過一次，這裡跟著換頁再對一次）。
  document.documentElement.classList.toggle("ev-single", !!slug);
  // 手機上有固定在最下面的報名條的時候，頁尾要多留一段，連結才不會被蓋住。
  document.documentElement.classList.toggle("ev-bar-on", !!document.querySelector(".ev-page.has-bar"));
  document.title = e ? `${e.edition_zh || e.edition_en || e.title_zh || e.title_en} / Beyond Taiwan` : "活動 / Beyond Taiwan";
  for (const list of document.querySelectorAll(".ev-strip-list")) { list.addEventListener("scroll", () => stripEnds(list), { passive: true }); stripEnds(list); }
  // 語言切換那支把連結上的 ? 換掉，這裡重跑一次讓新畫出來的連結也帶語言（只改 lang，f 與 ticket 都留著）。
  if (typeof window.btKeepLang === "function") window.btKeepLang();
}
// 一場活動：等那一場的講者、報名類型、照片回來才畫（最多等兩秒半），畫出來之後版面就不會再跳。清單不用等。
// 等的時候人已經換到別的地方（按了上一頁），就不畫這一次。
// 從清單點進一場活動（或從一場換到另一場）：回到最上面。清單捲到一半點進來，不回到上面的話會落在那一頁的中間。
let cache = null, shown = null;
async function render() {
  const slug = slugOf();
  if (!slug) { paint(cache, "", null); shown = ""; return; }
  const x = (cache || []).some(v => v.slug === slug) ? await loadExtras(slug) : null;
  if (slugOf() !== slug) return;
  paint(cache, slug, x);
  if (shown !== null && shown !== slug) window.scrollTo({ top: 0, behavior: "auto" });
  shown = slug;
}
// 照片那一排捲到頭或尾，那一邊的按鈕就按不了。
function stripEnds(list) {
  const box = list.parentElement; if (!box) return;
  const [prev, next] = box.querySelectorAll(".ev-strip-b");
  if (prev) prev.disabled = list.scrollLeft <= 2;
  if (next) next.disabled = list.scrollLeft + list.clientWidth >= list.scrollWidth - 2;
}
// 把一段字變成一個檔讓瀏覽器存下來（.ics）。全部在瀏覽器裡，沒有送到任何地方。
function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
document.addEventListener("click", ev => {
  // 點那一格外面的暗色地方也關得掉（點到的是 <dialog> 自己，不是它裡面的東西）。
  if (ev.target && ev.target.tagName === "DIALOG" && ev.target.classList.contains("ev-sp-dlg")) { ev.target.close(); return; }
  const b = ev.target.closest("[data-act]"); if (!b) return;
  const act = b.dataset.act;
  // 照片往前、往後：一次捲差不多一個畫面寬。
  if (act === "strip") {
    const list = b.parentElement.querySelector(".ev-strip-list"); if (!list) return;
    list.scrollBy({ left: Number(b.dataset.dir) * Math.max(200, list.clientWidth * 0.85), behavior: reduce ? "auto" : "smooth" });
    return;
  }
  // 講者的「看他的經歷」：開那一位的那一格（<dialog>，Esc 與那顆叉叉都關得掉）。
  if (act === "sp-open") { const d = document.getElementById(b.dataset.dlg); if (d && d.showModal) d.showModal(); return; }
  if (act === "sp-close") { const d = b.closest("dialog"); if (d) d.close(); return; }
  // 下載行事曆檔。
  if (act === "ics") {
    const e = (cache || []).find(v => v.slug === b.dataset.slug), l = b.dataset.l === "en" ? "en" : "zh";
    const c = e && UI.calData(e, l, pageUrl(e.slug));
    if (c) download(`${e.slug}.ics`, UI.icsText(c), "text/calendar;charset=utf-8");
    return;
  }
  // 手機最下面那一條的按鈕（活動有分報名類型的時候）：捲到那張卡的報名類型。
  if (act === "to-signup") {
    const page = b.closest(".ev-page"), box = page && page.querySelector("[data-ev-signup]");
    if (box) box.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
  }
});
async function boot() {
  try {
    // 網址上已經有代號的話，那一場的講者、報名類型、照片跟活動清單同時問，不多等一趟。
    const slug = slugOf();
    const [events] = await Promise.all([load(), slug ? loadExtras(slug) : null]);
    cache = events; await render();
  }
  catch (e) {
    for (const l of ["zh", "en"]) { const el = document.getElementById("ev-" + l); if (el) el.innerHTML = `<section class="sec"><div class="sec-in"><div class="body"><p>${l === "zh" ? "活動載不到，等一下再來。" : "Could not load events. Please try again shortly."}</p></div></div></section>`; }
  }
}
window.addEventListener("hashchange", () => { if (cache) render(); });
boot();
