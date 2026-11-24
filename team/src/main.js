// /team/ 上那幾張臉。
//
// ⚠ **這一頁沒有這一段也要讀得完。** 它是對外頁面，
// 資料庫連不上、或是一個人都還沒公開的時候，整段安靜地不出現，
// 而六個 team 的照片與介紹本來就自成一頁。
// 這一段是加分，不是骨幹。
//
// 2026-11-24 起人分兩個地方放（Paul：「under each team there's going to be their members」）：
//   六個 team 的人   → 那個 team 自己那一塊底下的 .tm-people（中英各一格）
//   其他（Co-President 與 Senior Adviser、填了別的 team、沒填 team）→ 頁面下面那一段 #faces-zh / #faces-en
// 怎麼分只有一份，在 ui.js 的 splitGroups()。
import { supabase } from "../../shared/supabase.js";
import { splitGroups, crewHTML, groupsHTML, teamSlug, toPerson, rankWeight, LEAD_KEY } from "./ui.js";

// 中英兩版各一個掛載點。**兩邊畫同一批人**，只有標題與那一句說明不一樣。
const MOUNTS = [["faces-zh", "zh"], ["faces-en", "en"]];
const T = {
  zh: { people: "這一屆的人", note: "這裡列的是這一屆願意具名的幹部。沒有出現的人一樣在做事，只是選擇不公開。", lead: "Co-President 與 Senior Adviser", other: "還有這些人" },
  en: { people: "This year's team", note: "These are the organisers who chose to be named. The others do the same work; they simply chose not to be public.", lead: "Co-Presidents and Senior Advisers", other: "Also on the board" },
};

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
    const { teams, rest } = splitGroups(people);
    for (const [id, lang] of MOUNTS) {
      for (const g of teams) {
        const box = document.querySelector(`.${lang} .tm[data-team="${teamSlug(g.key)}"] .tm-people`);
        if (!box) continue;
        box.innerHTML = `<h4>${T[lang].people}</h4>${crewHTML(g.people)}<p class="tm-note">${T[lang].note}</p>`;
        box.hidden = false;
      }
      const el = document.getElementById(id);
      if (!el || !rest.length) continue;
      const sec = el.closest("section"), hasLead = rest[0].key === LEAD_KEY;
      sec.querySelector("h2").textContent = hasLead ? T[lang].lead : T[lang].other;
      // 第一組的標題就是這一段的 h2，不再印一次：lead 那一組 groupsHTML 自己省掉，「還有這些人」那一組在這裡拿掉。
      const out = groupsHTML(rest, lang, true);
      el.innerHTML = !hasLead && rest[0].key === "" ? out.replace(/^<section class="teamsec"><h3>[^<]*<\/h3><p class="sub"><\/p>/, '<section class="teamsec">') : out;
      sec.hidden = false;
    }
  } catch (e) {
    // 安靜地不出現。**不要對讀者說任何話** —— 對他來說本來就沒有壞掉。
    console.warn("/team/ 的名單載不到，那一段不顯示。", e);
  }
})();
