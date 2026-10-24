// /team/ 上那幾張臉。
//
// ⚠ **這一頁沒有這一段也要讀得完。** 它是對外頁面，
// 資料庫連不上、或是一個人都還沒公開的時候，整段安靜地不出現，
// 而上面那幾節（怎麼運作、六個 team、每年換一批人）本來就自成一頁。
// 這一段是加分，不是骨幹。
import { supabase } from "../../shared/supabase.js";
import { peopleHTML, toPerson, rankWeight } from "./ui.js";

// 中英兩版各一個掛載點。**兩邊畫同一批人**，只有 team 底下那行小標不一樣。
const MOUNTS = [["faces-zh", "zh"], ["faces-en", "en"]];

(async () => {
  try {
    // 2026-10-24 起走 public_team()（2026-10-24-ranks-and-workspaces.sql）：
    // 只回「本人同意、Co-President 核可、而且這一屆有職位」的幹部，頭銜從職位算（title_en · term），
    // 分組用職位上的 team（空的退回 profiles.team 第一個）。換屆之後沒留下的人自動消失。
    // 它是 security definer，沒登入也叫得動；不再直接讀 profiles 那幾欄。
    const { data, error } = await supabase.rpc("public_team");
    if (error) throw error;
    // ⚠ **排序要是固定的，而且要看得懂為什麼。**
    // 拍照那天的姿勢是照這個順序配的（往右看的人，右邊那個比「噠噠」），
    // 所以「誰在誰旁邊」不能每次載入都不一樣。
    // 用英文名的字母序：不用誰去維護一個順序欄位，加一個人也不會把別人的姿勢錯開太多。
    // 2026-10-28 Paul：同一組裡 Director 在前、Adviser 其次、其他（Associate）照英文名。看的是職位開頭那個字。
    const people = (data || []).map(toPerson).filter(p => p.name)
      .sort((a, b) => rankWeight(a.title) - rankWeight(b.title) || (a.en || a.zh).localeCompare(b.en || b.zh, "en"));
    if (!people.length) return;
    for (const [id, lang] of MOUNTS) {
      const el = document.getElementById(id);
      if (el) { el.innerHTML = peopleHTML(people, lang); el.closest("section").hidden = false; }
    }
  } catch (e) {
    // 安靜地不出現。**不要對讀者說任何話** —— 對他來說本來就沒有壞掉。
    console.warn("/team/ 的名單載不到，那一段不顯示。", e);
  }
})();
