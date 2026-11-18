// /history/ 的資料：從 public_milestones() 拿、整理成站、代號對場景、網址 hash、語言。
// 全部是純函式，瀏覽器才有的東西（fetch、location）只在 fetchStops() 用到，而且是參數傳進來。
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "../../shared/supabase-config.js";

// 打 public_milestones()。**不載 supabase-js**：對外頁只拿網址與公開金鑰，用瀏覽器的 fetch 打 PostgREST（跟 /events/ 同一招）。
// 公開金鑰本來就是公開的，真正的門是資料庫：那支函式只回 published 的站與 consent=true 的照片。
// 用 GET、金鑰放在查詢字串、不加自訂標頭：這樣是瀏覽器眼中的「簡單請求」，不用先送一趟 CORS 預檢，
// 冷啟動少一個來回（2026-11-06 批 2 量到預檢加 POST 約 440ms，批 3 改掉）。那支函式沒有參數，GET 跟 POST 拿到的一樣。
export async function fetchStops(timeoutMs) {
  const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), timeoutMs || 6000);
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/public_milestones?apikey=${encodeURIComponent(SUPABASE_PUBLISHABLE_KEY)}`, { signal: ctl.signal });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return normalize(await r.json());
  } finally { clearTimeout(tm); }
}

// 整理：照日期排（資料庫已照 sort 排，但這裡再排一次日期，年份帶才一定是遞增的）、算年份、照片一定是陣列。
export function normalize(rows) {
  if (!Array.isArray(rows)) return [];
  return rows
    .filter(r => r && typeof r === "object" && r.slug)
    .map(r => ({
      slug: String(r.slug), happened_on: String(r.happened_on || ""), year: String(r.happened_on || "").slice(0, 4),
      title_zh: r.title_zh || "", title_en: r.title_en || "", summary_zh: r.summary_zh || "", summary_en: r.summary_en || "",
      body_zh: r.body_zh || "", body_en: r.body_en || "",
      photos: Array.isArray(r.photos) ? r.photos.filter(p => p && p.url).map(p => ({ url: String(p.url), caption_zh: p.caption_zh || "", caption_en: p.caption_en || "" })) : [],
    }))
    .sort((a, b) => a.happened_on < b.happened_on ? -1 : a.happened_on > b.happened_on ? 1 : 0);
}

// 年份帶上的短標題：取第一個逗號（中英都認）前面那一段，太長就截。那一格只有幾十 px 寬。
export function shortTitle(stop, lang) {
  const full = (lang === "zh" ? (stop.title_zh || stop.title_en) : (stop.title_en || stop.title_zh)) || "";
  const cut = full.split(/[，,、]/)[0].trim();
  const max = lang === "zh" ? 12 : 22;
  return cut.length > max ? cut.slice(0, max - 1).trimEnd() + "…" : cut;
}

// 代號裡的關鍵字決定路邊畫哪一個小場景。順序有意義：先命中的贏。
// 批 4 換成機場的詞：成立是七個旅客在登機門、導生是兩個座位、博覽會是看板前、大使是登機門的牌、探索營是一組登機的人、校友是有地圖針的尾翼、幹部是地勤。
// 認不出來就是指示牌 —— 後台加一站的人不用知道這張表，加什麼代號都有東西畫。
const MOTIF_RULES = [
  ["seven",    /found|start|birth|origin/],
  ["seats",    /mentor|pair|guide/],
  ["board",    /fair|expo|online|webinar|talk|forum/],
  ["sign",     /ambassador|campus|school|visit/],
  ["boarding", /bootcamp|camp|retreat|workshop/],
  ["tail",     /alumni|account|network|community/],
  ["crew",     /cadre|officer|organis|team|thirty|today|now/],
];
export function motifFor(slug) {
  const s = String(slug || "").toLowerCase();
  for (const [m, re] of MOTIF_RULES) if (re.test(s)) return m;
  return "signpost";
}

// 網址：每一站是 #代號。語言可能黏在後面（#slug?lang=en），切掉再比。
export const hashFor = stop => "#" + stop.slug;
export function indexFromHash(hash, stops) {
  const slug = String(hash || "").replace(/^#/, "").split("?")[0].trim();
  if (!slug) return -1;
  return (stops || []).findIndex(s => s.slug === slug);
}

// 語言：?lang= 先（上一頁選過的要跟著走），再 localStorage 的 bt-lang（跟登入後那些頁同一把鍵，只讀不寫，對外頁不在裝置上存東西），
// 再瀏覽器的語言；都沒有就英文。三個都是參數，測試不用假裝有 window。
export function pickLang(search, stored, navLang) {
  const q = new URLSearchParams(search || "").get("lang");
  if (q === "zh" || q === "en") return q;
  if (stored === "zh" || stored === "en") return stored;
  return /^zh/i.test(navLang || "") ? "zh" : "en";
}

// 每一站的「選擇」（2026-11-18 第五批，Paul 2026-11-17：每一站不是一張卡讓人點，是一個情境兩三個選擇，BT 像空服員從頭到尾都在，沒有對錯）。
// 字全部在 history/choices.json（空服員的三句、每一站的情境與選擇、後台新加的站用的 fallback），這裡只負責拿與挑。拿不到就回 null，頁面照舊沒有選擇。
export async function fetchChoices(url, timeoutMs) {
  const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), timeoutMs || 6000);
  try { const r = await fetch(url || "./choices.json", { signal: ctl.signal }); if (!r.ok) return null; const j = await r.json(); return j && j.stops ? j : null; }
  catch (e) { return null; } finally { clearTimeout(tm); }
}
// 這一站的情境與選擇：代號對不到就用 fallback；兩邊都沒有就 null。只回有兩個以上選擇的。
export function choiceFor(ch, slug) {
  if (!ch) return null;
  const c = (ch.stops && ch.stops[String(slug || "")]) || ch.fallback || null;
  return c && Array.isArray(c.choices) && c.choices.length >= 2 ? c : null;
}
// 空服員的一句（intro、outro、neutral）或某一站某一個選擇的回話：照語言挑，沒有那個語言就退回另一個。
const say = (o, key, lang) => o ? (lang === "zh" ? (o[key + "_zh"] || o[key + "_en"] || "") : (o[key + "_en"] || o[key + "_zh"] || "")) : "";
export const attendantLine = (ch, key, lang) => say(ch && ch.attendant, key, lang);
export const choiceText = (c, key, lang) => say(c, key, lang);
export function replyFor(ch, slug, k, lang) {
  const c = choiceFor(ch, slug); const pick = c && c.choices[k];
  return pick ? choiceText(pick, "reply", lang) : attendantLine(ch, "neutral", lang);
}
