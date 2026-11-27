// 後台「搜尋」的資料層（2026-11-26）。直接用 shared/，**不 import 別的功能資料夾**，也不 import admin/src/。
// 讀全部走資料庫的函式（search_*），四張表對登入的人沒有任何直接權限，門在每一支函式第一句。
// 每一筆結果資料庫都先問過原本那一頁的門（會議、回饋表、內部表單、活動檢討各一支），
// 所以這裡拿到的就是這個人點開原本那一頁也看得到的。設計與理由在 supabase/migrations/2027-01-21-smart-search.sql 檔頭。
import { supabase } from "../../../shared/supabase.js";
import { authMessage, whoAmI } from "../../../shared/auth.js";
import { T, lang } from "./strings.js";

const need = () => { if (!supabase) throw new Error(authMessage(null)); };
async function rpc(fn, args) {
  need();
  const { data, error } = await supabase.rpc(fn, args || {});
  if (error) throw error;
  return data;
}

export async function loadMe(userId) {
  need();
  const { row: data, ws, info } = await whoAmI(userId);
  if (!data) return null;
  return {
    id: userId,
    role: data.role,
    board: data.board_role || "member",
    team: data.team || "",
    name: data.name_zh || data.name_en || "",
    senior: data.board_role === "president" || data.board_role === "senior_adviser",
    pres: data.board_role === "president",
    ws,
    wsInfo: info || {},
  };
}

export const loadOptions = () => rpc("search_options");
export const searchAll   = (q, f) => rpc("search_all", { p_q: q, p_filters: f || {} });
export const ask         = (q, f) => rpc("search_ask", { p_q: q, p_filters: f || {} });
export const askStatus   = id => rpc("search_ask_status", { p_id: id });
export const setAi       = sources => rpc("search_set_ai", { p_sources: sources });
// 背景那一條的退路（沒有 pg_cron 的時候靠每次開這一頁跑一次）。失敗不影響搜尋，安靜吞掉。
export const tick        = () => rpc("search_tick").catch(() => null);

// 資料庫回的代碼翻成人話。先命中先贏。
const SAYS = [
  ["not_cadre", "says.notCadre"],
  ["not_president", "says.notPresident"],
  ["ai_not_ready", "says.aiNotReady"],
  ["too_many_today", "says.tooMany"],
  ["too_short", "says.tooShort"],
  ["not_found", "says.notFound"],
  ["search_all", "says.noTables"],
  ["search_options", "says.noTables"],
];
export function says(err) {
  const m = String((err && err.message) || err || "");
  for (const [code, key] of SAYS) if (m.includes(code)) return T(key);
  if (m.includes("not_signed_in")) return lang() === "zh" ? "你的登入已經過期了，重新登入一次就好。" : "Your sign-in has expired. Sign in again.";
  return m;
}
