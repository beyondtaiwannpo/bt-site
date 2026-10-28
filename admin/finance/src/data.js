// 後台「財務」那一組的資料層（2026-11-08）。直接用 shared/，**不 import 別的功能資料夾**，也不 import admin/src/。
// 讀：fin_bootstrap()（屆、帳戶、類別、預算、我能不能改，一趟）加 fin_transactions 整張表（RLS 只放 can_view_finance 的人）。
// 寫：全部走資料庫的函式，門在每一支第一句（can_edit_finance），每一筆都寫進 fin_log。表沒有寫的政策。
// 收據：私人 bucket receipts。看走簽名網址（十分鐘），不用 getPublicUrl（那是公開讀的 bucket 才有的東西）。
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

// 我是誰。ws 裡 finance 那一格是 my_access() 算的（view / edit），側欄與這一頁的門都看它；真正的門在資料庫。
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

// 屆、帳戶、類別、預算，一趟。不是能看的人會拿到 not_finance_viewer。
export const loadBootstrap = () => rpc("fin_bootstrap");
// 所有的筆（含作廢的）。RLS 只放 can_view_finance 的人，別人讀回來是空的（不是錯）。幾百筆一年，整張讀下來比分頁簡單。
export async function loadTx() {
  need();
  const { data, error } = await supabase.from("fin_transactions")
    .select("id, happened_on, kind, amount, currency, amount_twd, fx_rate, account_id, to_account_id, category_id, counterparty, note, receipt_path, term_id, entered_by, created_at, updated_at, voided_at, voided_by, void_reason")
    .order("happened_on", { ascending: false }).order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}
// 寫。p 是 { happened_on, kind, amount, currency, fx_rate, account_id, to_account_id, category_id, counterparty, note }，台幣由資料庫算（金額 × 匯率）。
export const addTx       = p => rpc("fin_add_transaction", { p_row: p });
export const updateTx    = (id, patch) => rpc("fin_update_transaction", { p_id: id, p_patch: patch });
export const voidTx      = (id, reason) => rpc("fin_void_transaction", { p_id: id, p_reason: reason });
export const upsertAccount  = p => rpc("fin_upsert_account", { p_patch: p });
export const upsertCategory = p => rpc("fin_upsert_category", { p_patch: p });
export const setBudget   = (term, category, amount) => rpc("fin_set_budget", { p_term: term, p_category: category, p_amount: amount });

// 收據。路徑由 ui.receiptPath() 算（<筆的 id>/<時間>-<亂數>.<副檔名>）。傳好之後把路徑寫進那一筆（fin_update_transaction）。
export async function uploadReceipt(path, file) {
  need();
  const { error } = await supabase.storage.from("receipts").upload(path, file, { contentType: file.type, cacheControl: "3600", upsert: false });
  if (error) throw error;
  return path;
}
export async function receiptUrl(path) {
  need();
  const { data, error } = await supabase.storage.from("receipts").createSignedUrl(path, 600);
  if (error) throw error;
  return data.signedUrl;
}
export async function removeReceiptFile(path) {
  need();
  try { await supabase.storage.from("receipts").remove([path]); } catch (e) { /* 檔留著只是多佔空間，不擋 */ }
}

// 資料庫回的代碼翻成人話。三欄：代碼、中文、英文（切換語言會跟著換）。先命中先贏。
const SAYS = [
  ["not_finance_viewer", "says.notViewer"],
  ["not_finance_editor", "says.notEditor"],
  ["tx_voided", "says.voided"],
  ["need_fx_rate", "says.needRate"],
  ["transfer_needs_two_accounts", "says.twoAccounts"],
  ["same_account", "says.sameAccount"],
  ["bad_amount", "says.badAmount"],
  ["bad_kind", "says.badKind"],
  ["no_such_account", "says.noAccount"],
  ["need_category", "says.needCategory"],
  ["no_such_category", "says.noCategory"],
  ["bad_date", "says.badDate"],
  ["no_such_term", "says.noTerm"],
  ["category_kind_mismatch", "says.noCategory"],
  ["no_such_transaction", "says.noTx"],
  ["need_reason", "says.needReason"],
  ["need_name", "says.needName"],
  ["Bucket not found", "says.noBucket"],
  ["fin_bootstrap", "says.noFinance"],
  ["fin_transactions", "says.noFinance"],
];
export function says(err) {
  const m = String((err && err.message) || err || "");
  for (const [code, key] of SAYS) if (m.includes(code)) return T(key);
  if (m.includes("not_signed_in")) return lang() === "zh" ? "你的登入已經過期了，重新登入一次就好。" : "Your sign-in has expired. Sign in again.";
  return m;
}
