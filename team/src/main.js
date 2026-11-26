// /team/ 上那幾張臉。
//
// ⚠ **這一頁沒有這一段也要讀得完。** 它是對外頁面，
// 資料庫連不上、或是一個人都還沒公開的時候，整段安靜地不出現，
// 而六個 team 的照片與介紹本來就自成一頁。
// 這一段是加分，不是骨幹。
//
// 2026-11-24 起人分兩個地方放（Paul：「under each team there's going to be their members」，
// 同一天又說 Co-President 與 Senior Adviser「I dont need them to show up every page」，另外給一張）：
//   六個 team 的人   → 那個 team 自己那一塊底下的 .tm-people（中英各一格）
//   其他（Founder、Co-President 與 Senior Adviser、填了別的 team、沒填 team）→ 第七張 Leadership 那一塊的 .tm-people
// 怎麼分只有一份，在 ui.js 的 splitGroups()。
import { supabase } from "../../shared/supabase.js";
import { splitGroups, crewHTML, groupsHTML, teamSlug, toPerson, rankWeight, leadRank, leadHeading, withFounders, LEAD_KEY } from "./ui.js";

// 中英兩版**畫同一批人**，只有標題與那一句說明不一樣。
const T = {
  zh: { people: "這一屆的人", note: "這裡列的是這一屆願意具名的幹部。沒有出現的人一樣在做事，只是選擇不公開。" },
  en: { people: "This year's team", note: "These are the organisers who chose to be named. The others do the same work; they simply chose not to be public." },
};

(async () => {
  if (document.documentElement.hasAttribute("data-past")) return;   // 前幾屆那一頁（?term=）畫的是另一份名單，見 past.js
  try {
    // 2026-10-24 起走 public_team()（2026-10-24-ranks-and-workspaces.sql）：
    // 只回「本人同意、Co-President 核可、而且這一屆有職位」的幹部，頭銜從職位算（title_en · term），
    // 分組用職位上的 team（空的退回 profiles.team 第一個）。換屆之後沒留下的人自動消失。
    // 它是 security definer，沒登入也叫得動；不再直接讀 profiles 那幾欄。
    // 創辦人另外一支（public_founders()，2027-01-04-founders.sql）：Co-President 標了、本人也同意了才回。
    // **那一支載不到不擋名單**：遷移檔還沒跑、或資料庫那一支壞了，就當作沒有創辦人，其他人照畫。
    const [{ data, error }, founders] = await Promise.all([
      supabase.rpc("public_team"),
      Promise.resolve(supabase.rpc("public_founders")).then(r => (r && !r.error && Array.isArray(r.data)) ? r.data : [], () => []),
    ]);
    if (error) throw error;
    // ⚠ **排序要是固定的，而且要看得懂為什麼。**
    // 拍照那天的姿勢是照這個順序配的（往右看的人，右邊那個比「噠噠」），
    // 所以「誰在誰旁邊」不能每次載入都不一樣。
    // 用英文名的字母序：不用誰去維護一個順序欄位，加一個人也不會把別人的姿勢錯開太多。
    // 2026-10-28 Paul：同一組裡 Director 在前、Adviser 其次、其他（Associate）照英文名。看的是職位開頭那個字。
    const people = withFounders((data || []).map(toPerson).filter(p => p.name), founders)
      .sort((a, b) => rankWeight(a.title) - rankWeight(b.title) || (a.en || a.zh).localeCompare(b.en || b.zh, "en"));
    if (!people.length) return;
    const { teams, rest } = splitGroups(people);
    // Leadership 那一組裡：Founder 在前、Co-President 其次、Senior Adviser 最後，同一種照英文名（上面已經排過）。
    const lead = rest.filter(g => g.key === LEAD_KEY).flatMap(g => g.people).sort((a, b) => leadRank(a.title) - leadRank(b.title));
    const others = rest.filter(g => g.key !== LEAD_KEY);
    for (const lang of ["zh", "en"]) {
      const fill = (slug, html) => {
        const box = document.querySelector(`.${lang} .tm[data-team="${slug}"] .tm-people`);
        if (box && html) { box.innerHTML = html + `<p class="tm-note">${T[lang].note}</p>`; box.hidden = false; }
      };
      for (const g of teams) fill(teamSlug(g.key), `<h4>${T[lang].people}</h4>${crewHTML(g.people)}`);
      fill("leadership", (lead.length ? `<h4>${leadHeading(lead, lang)}</h4>${crewHTML(lead)}` : "") + groupsHTML(others, lang));
    }
  } catch (e) {
    // 安靜地不出現。**不要對讀者說任何話** —— 對他來說本來就沒有壞掉。
    console.warn("/team/ 的名單載不到，那一段不顯示。", e);
  }
})();
