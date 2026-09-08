// /team/ 上那幾張臉。
//
// ⚠ **這一頁沒有這一段也要讀得完。** 它是對外頁面，
// 資料庫連不上、或是一個人都還沒公開的時候，整段安靜地不出現，
// 而上面那幾節（怎麼運作、六個 team、每年換一批人）本來就自成一頁。
// 這一段是加分，不是骨幹。
import { supabase } from "../../shared/supabase.js";
import { peopleHTML, toPerson } from "./ui.js";

const MOUNTS = ["faces-zh", "faces-en"];

(async () => {
  try {
    // **只讀 anon 讀得到的那幾欄。** 資料庫的欄位授權只發了這幾欄給沒登入的人
    // （見 supabase/migrations/2026-09-13-public-team.sql），
    // 多要一欄整句會被拒，而那個拒絕會讓整段消失 —— 對使用者來說看不出差別，
    // 對維護的人來說是一個很難找的 bug。
    const { data, error } = await supabase
      .from("profiles")
      .select("id, name_zh, name_en, team, avatar, public_title")
      .eq("public_profile", true)
      .eq("public_approved", true);
    if (error) throw error;
    const people = (data || []).map(toPerson).filter(p => p.name)
      .sort((a, b) => a.name.localeCompare(b.name, "zh-Hant"));
    if (!people.length) return;
    const html = peopleHTML(people);
    for (const id of MOUNTS) {
      const el = document.getElementById(id);
      if (el) { el.innerHTML = html; el.closest("section").hidden = false; }
    }
  } catch (e) {
    // 安靜地不出現。**不要對讀者說任何話** —— 對他來說本來就沒有壞掉。
    console.warn("/team/ 的名單載不到，那一段不顯示。", e);
  }
})();
