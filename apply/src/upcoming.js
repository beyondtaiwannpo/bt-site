// /apply/（報名）最上面那一段：近期的活動（2026-11-20 對外頁重整）。
//
// 原本「報名」分在兩頁：/events/ 放活動、/apply/ 放申請，學生要猜該點哪一頁。
// 現在頂欄只有一顆「報名」，點進來先看到近期活動，再往下是申請。
// 活動的資料跟 /events/ 與首頁是同一個來源：後台「網站上的活動」發布的，經 public_events() 回來的那幾筆。
// 畫卡片的函式跟它們共用（events/src/ui.js，首頁也是這樣 import），這裡不另寫一份。
//
// ⚠ 這一段是加分，不是骨幹：讀不到就把整段藏起來，下面的申請照樣看得到。
// 點一張卡到 /events/#<代號> 看那一場的細節與報名按鈕（那顆按鈕再回到這一頁的 ?f=<表單>）。
import { supabase } from "../../shared/supabase.js";
import { cardHTML, split } from "../../events/src/ui.js";

const sec = document.getElementById("upcoming");
(async () => {
  if (!sec) return;
  try {
    const { data, error } = await supabase.rpc("public_events");
    if (error) throw error;
    const up = split(data || []).upcoming;
    for (const l of ["zh", "en"]) {
      const el = document.getElementById("up-" + l);
      if (!el) continue;
      el.innerHTML = up.length
        ? `<div class="ev-cards">${up.map(e => cardHTML(e, l, `../events/?lang=${l}`)).join("")}</div>`
        : `<p class="note">${l === "zh" ? "現在沒有公開的活動。下一場會先公布在 Instagram。" : "No public events right now. The next one will be on Instagram first."}</p>`;
    }
    sec.hidden = false;
  } catch (e) {
    console.warn("/apply/ 近期活動載不到，整段先不出現。", e);
  }
})();
