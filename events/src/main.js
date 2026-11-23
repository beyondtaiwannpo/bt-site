// /events/（2026-11-01 活動上架批 3）。讀 public_events()，畫清單或一場活動。
// **不載 supabase-js**：只拿 shared/supabase-config.js 的網址與公開金鑰，用瀏覽器的 fetch 打 PostgREST。
// 公開金鑰本來就是公開的（每一頁的 supabase-js 都帶著它），真正的門是資料庫的 RLS 與 public_events() 只回 published。
// 讀不到就印一句「活動載不到」，不留壞掉的框。
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "../../shared/supabase-config.js";
import * as UI from "./ui.js";

// 網址：./#<代號> 是一場活動（用 # 不用 ?e=，因為這一站的語言切換會把 ? 後面的東西換掉）。語言可能黏在後面：#slug?lang=en。
const slugOf = () => (location.hash.slice(1).split("?")[0] || new URLSearchParams(location.search).get("e") || "").trim();

async function load(timeoutMs) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), timeoutMs || 4000);
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/public_events`, {
      method: "POST", signal: ctl.signal,
      headers: { apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`, "Content-Type": "application/json" }, body: "{}" });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return await r.json();
  } finally { clearTimeout(t); }
}
// 一場活動除了那一列之外要印的東西（照片、講者、報名類型）：public_event_extras(代號)，2027-01-01-event-photos.sql 與 2027-01-02-event-speakers-tickets.sql。
// 載不到、逾時、函式還不在（遷移檔還沒跑）一律回 null，不印錯誤：那一頁跟原本一模一樣。
async function loadExtras(slug, timeoutMs) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), timeoutMs || 4000);
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/public_event_extras`, {
      method: "POST", signal: ctl.signal,
      headers: { apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ p_slug: slug }) });
    return r.ok ? await r.json() : null;
  } catch (e) { return null; } finally { clearTimeout(t); }
}
// 問過的記下來（代號 → 回的東西），換語言或按上一頁重畫的時候不再問一次。
const extras = new Map();
// 三樣東西各填進自己的框。照片與講者：沒有就一直藏著。報名類型：有才把原本那一顆報名按鈕換成一種一列，沒有就不動。
function fillExtras(slug) {
  const x = extras.get(slug), e = (cache || []).find(v => v.slug === slug);
  const put = (el, html) => { if (el) { el.innerHTML = html; el.hidden = !html; } };
  for (const l of ["zh", "en"]) {
    const root = document.getElementById("ev-" + l); if (!root) continue;
    put(root.querySelector("[data-ev-gallery]"), UI.galleryHTML(x));
    put(root.querySelector("[data-ev-speakers]"), UI.speakersHTML(x, l));
    const types = e ? UI.ticketsHTML(e, x, l) : "", box = root.querySelector("[data-ev-signup]");
    if (types && box) box.innerHTML = types;
  }
  // 報名類型的按鈕是新畫的連結，語言要再補一次（只改 lang，f 與 ticket 都留著）。
  if (typeof window.btKeepLang === "function") window.btKeepLang();
}
function render(events) {
  const slug = slugOf();
  for (const l of ["zh", "en"]) {
    const el = document.getElementById("ev-" + l); if (!el) continue;
    if (slug) { const e = (events || []).find(x => x.slug === slug); el.innerHTML = e ? UI.detailHTML(e, l) : UI.notFoundHTML(l); }
    else el.innerHTML = UI.listHTML(events, l);
  }
  const e = slug && (events || []).find(x => x.slug === slug);
  if (e) document.title = `${e.edition_zh || e.edition_en || e.title_zh || e.title_en} / Beyond Taiwan`;
  // 這一場的照片、講者、報名類型另外問。先把頁面畫出來，回來了再補進去；回不來就什麼都不動。
  if (e) {
    if (extras.has(slug)) fillExtras(slug);
    else loadExtras(slug).then(x => { extras.set(slug, x); if (slugOf() === slug) fillExtras(slug); });
  }
  // 語言切換那支把連結上的 ? 換掉，這裡重跑一次讓新畫出來的連結也帶語言。
  if (typeof window.btKeepLang === "function") window.btKeepLang();
}
let cache = null;
async function boot() {
  try { cache = await load(); render(cache); }
  catch (e) {
    for (const l of ["zh", "en"]) { const el = document.getElementById("ev-" + l); if (el) el.innerHTML = `<section class="sec"><div class="sec-in"><div class="body"><p>${l === "zh" ? "活動載不到，等一下再來。" : "Could not load events. Please try again shortly."}</p></div></div></section>`; }
  }
}
window.addEventListener("hashchange", () => { if (cache) render(cache); });
boot();
