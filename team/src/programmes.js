// /team/ 每個 team 底下那張「固定在做的」清單。
//
// 資料是後台「網站上的活動」發布的那幾筆裡，勾了「多數年份都會辦」的（public_events() 的 recurring）。
// 一個計畫一列：上面是計畫的名字，下面一行是這一屆的版本（這一屆叫什麼、哪一天或大約幾月、現在報不報得了名）。
// 那個 team 在後台還沒有這種資料，那一格就維持 hidden：不留空位，也不編內容。
// 問不到資料庫（四秒）整頁照舊，六塊的介紹都還在。判斷在 ../../year/src/logic.js，跟「這一年」同一份。
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "../../shared/supabase-config.js";
import { esc } from "../../events/src/ui.js";
import { TEAMS, teamProgrammes, whenLabel } from "../../year/src/logic.js";

const T = {
  zh: { head: "固定在做的", this: "這一屆：", tbc: "這一屆的時間還沒定", open: "開放報名中", past: "已結束" },
  en: { head: "Runs most years", this: "This year: ", tbc: "This year's date is not set yet", open: "Open now", past: "Done" },
};
const pick = (e, k, l) => (l === "zh" ? (e[k + "_zh"] || e[k + "_en"]) : (e[k + "_en"] || e[k + "_zh"])) || "";

export function rowHTML(e, l) {
  const s = T[l], edition = pick(e, "edition", l), when = whenLabel(e, l === "en");
  const line = [edition, when].filter(Boolean).join(l === "zh" ? "，" : ", ");
  const tag = e.state === "open" ? `<em>${s.open}</em>` : e.state === "past" ? `<em>${s.past}</em>` : "";
  return `<li><a href="../events/?lang=${l}#${esc(e.slug)}"><b>${esc(pick(e, "title", l))}</b><span>${line ? s.this + esc(line) : s.tbc}${tag}</span></a></li>`;
}

if (typeof document !== "undefined") (async () => {
  if (document.documentElement.hasAttribute("data-past")) return;   // 前幾屆那一頁（?term=）沒有這幾格，見 past.js
  const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), 4000);
  try {
    const r = await fetch(SUPABASE_URL + "/rest/v1/rpc/public_events", { method: "POST", body: "{}", signal: ctl.signal,
      headers: { apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: "Bearer " + SUPABASE_PUBLISHABLE_KEY, "Content-Type": "application/json" } });
    if (!r.ok) throw new Error("public_events " + r.status);
    const by = teamProgrammes(await r.json(), new Date());
    for (const l of ["zh", "en"]) for (const k of TEAMS) {
      const box = document.querySelector(`.${l} .tm[data-team="${k}"] .tm-live`);
      if (!box || !by[k].length) continue;
      box.innerHTML = `<small>${T[l].head}</small><ul>${by[k].map(e => rowHTML(e, l)).join("")}</ul>`;
      box.hidden = false;
    }
    if (window.btKeepLang) window.btKeepLang();
  } catch (e) {
    console.warn("/team/ 問不到固定計畫的清單，六塊的介紹照舊。", e);
  } finally { clearTimeout(timer); }
})();
