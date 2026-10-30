// 後台「Marketing」那一組的資料層（2026-11-26）。直接用 shared/，**不 import 別的功能資料夾**，也不 import admin/src/。
// 讀：ig_status()（連線狀態，不含通行證）。寫：ig_check_now()（管的人按「再檢查一次」）。
// 門在資料庫每一支函式第一句（ig_can_view / ig_can_manage）；ig_connection 那張表任何角色都讀不到。
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

// 我是誰。ws 是 my_access() 回的 { 工作區: 等級 }，側欄靠它；真正的門在資料庫。
export async function loadMe(userId) {
  need();
  const { row: data, ws } = await whoAmI(userId);
  if (!data) return null;
  return {
    role: data.role,
    board: data.board_role || "member",
    team: data.team || "",
    name: data.name_zh || data.name_en || "",
    senior: data.board_role === "president" || data.board_role === "senior_adviser",
    pres: data.board_role === "president",
    ws,
  };
}

export const loadIgStatus = () => rpc("ig_status");
export const igCheckNow = () => rpc("ig_check_now");

// 資料庫回的代碼翻成人話。先命中先贏。
const SAYS = [
  ["not_marketing_manager", "says.notManager"],
  ["not_marketing", "says.notMarketing"],
  ["ig_not_ready", "says.notReady"],
  ["ig_status", "says.noTable"],
  ["ig_check_now", "says.noTable"],
];
export function says(err) {
  const m = String((err && err.message) || err || "");
  for (const [code, key] of SAYS) if (m.includes(code)) return T(key);
  if (m.includes("not_signed_in")) return lang() === "zh" ? "你的登入已經過期了，重新登入一次就好。" : "Your sign-in has expired. Sign in again.";
  return m;
}
