// Supabase 的專案網址與公開金鑰。**這支檔案不 import 任何東西，也不要讓它 import。**
//
// 為什麼要單獨一支：/alumni/ 是對外頁面，刻意不載 supabase-js（見那一頁的檔頭），
// 但它要讀已核可的校友名單就需要這兩個值。直接 import shared/supabase.js 的話，
// 那支一被載入就會 createClient，整包套件跟著進來，每一個路人都多下載一份他用不到的東西。
//
// 換專案時只改這裡。後台 Project Settings → API Keys，
// URL 形如 https://xxxxxxxx.supabase.co，key 以 sb_publishable_ 開頭。
//
// publishable key 出現在原始碼裡是正常的，不是外洩 —— 真正的防線是資料庫的 RLS。
// 絕對不要把 sb_secret_ 開頭的金鑰放進這個 repo 的任何地方。
export const SUPABASE_URL = "https://norjaglyaotzewxavmhv.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_Zizio16gUuM97qjhtD4Qaw_Sb_GKkyx";
