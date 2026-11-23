// /year/（這一年）：把這一屆的活動與計畫畫成一張時間軸。
//
// 橫的是八月到隔年七月，一個 team 一列。有確定日期的寫日期，只知道大概的寫「大約幾月」，連月份都還沒有的排在那一列最後「日期還沒定」。
// 資料是後台「網站上的活動」發布的那幾筆（public_events()），誰都讀得到，不用登入。排版的判斷全部在 ./logic.js。
// 寬螢幕畫格子，手機畫照月份排的清單：兩份都畫，CSS 決定顯示哪一份。
// 問不到（四秒）或這一屆一筆都還沒有，就維持 HTML 裡原本那幾句話，不留一張空的表。
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "../../shared/supabase-config.js";
import { esc } from "../../events/src/ui.js";
import { TEAMS, TEAM_LABEL, TERM, termIndex, termStart, monthName, taipei, yearPlan, whenLabel, nameOf } from "./logic.js";

const T = {
  zh: { open: "開放報名中", past: "已結束", loose: "日期還沒定", team: "Team", now: "現在", term: (a, b) => `${a} 年 8 月到 ${b} 年 7 月`, none: "這個月還沒有排東西。" },
  en: { open: "Open now", past: "Done", loose: "Date to be confirmed", team: "Team", now: "Now", term: (a, b) => `August ${a} to July ${b}`, none: "Nothing planned for this month yet." },
};

// 一筆畫成一顆。點了到那一場的頁（/events/#代號），報名按鈕在那裡。
function chip(it, l, withTeam) {
  const s = T[l], n = nameOf(it, l), when = whenLabel(it, l === "en");
  const tag = it.state === "open" ? `<span class="yr-tag on">${s.open}</span>` : it.state === "past" ? `<span class="yr-tag">${s.past}</span>` : "";
  return `<a class="yr-chip is-${it.state}" href="../events/?lang=${l}#${esc(it.slug)}">` +
    (withTeam ? `<span class="yr-team">${esc(TEAM_LABEL[it.team_key])}</span>` : "") +
    `<b>${esc(n.main)}</b>${n.sub ? `<span class="yr-sub">${esc(n.sub)}</span>` : ""}` +
    `<span class="yr-when">${esc(when)}</span>${tag}</a>`;
}

function gridHTML(plan, l, nowM) {
  const s = T[l], en = l === "en";
  const head = TERM.map(m => `<span class="${m === nowM ? "is-now" : ""}">${monthName(m, en)}</span>`).join("");
  const rows = TEAMS.map(k => {
    const t = plan.teams[k];
    // 每一顆從它那個月的格線開始，往右佔三格（字才放得下）；排到十月以後的往左靠，不超出七月。
    const cells = t.placed.map(it => { const c = Math.min(termIndex(it.month) + 1, 10); return `<div class="yr-cell" style="grid-column:${c} / span 3">${chip(it, l, false)}</div>`; }).join("");
    const loose = t.loose.length ? `<div class="yr-loose"><span>${s.loose}</span>${t.loose.map(it => chip(it, l, false)).join("")}</div>` : "";
    return `<div class="yr-row"><h3>${esc(TEAM_LABEL[k])}</h3><div class="yr-lane"><div class="yr-track">${cells}</div>${loose}</div></div>`;
  }).join("");
  return `<div class="yr" style="--now:${termIndex(nowM)}"><div class="yr-row yr-head"><h3>${s.team}</h3><div class="yr-lane"><div class="yr-months">${head}</div></div></div>${rows}</div>`;
}

function listHTML(plan, l, nowM) {
  const s = T[l], en = l === "en";
  const months = TERM.filter(m => plan.months[m].length || m === nowM).map(m =>
    `<section class="yr-m${m === nowM ? " is-now" : ""}"><h3>${monthName(m, en)}${m === nowM ? `<span>${s.now}</span>` : ""}</h3>` +
    (plan.months[m].length ? plan.months[m].map(it => chip(it, l, true)).join("") : `<p class="yr-none">${s.none}</p>`) + `</section>`).join("");
  const loose = plan.loose.length ? `<section class="yr-m"><h3>${s.loose}</h3>${plan.loose.map(it => chip(it, l, true)).join("")}</section>` : "";
  return `<div class="yr-list">${months}${loose}</div>`;
}

(async () => {
  const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), 4000);
  try {
    const r = await fetch(SUPABASE_URL + "/rest/v1/rpc/public_events", { method: "POST", body: "{}", signal: ctl.signal,
      headers: { apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: "Bearer " + SUPABASE_PUBLISHABLE_KEY, "Content-Type": "application/json" } });
    if (!r.ok) throw new Error("public_events " + r.status);
    const now = new Date(), plan = yearPlan(await r.json(), now), nowM = taipei(now).m, y = termStart(now);
    if (!plan.count) return;                       // 這一屆一筆都還沒有：維持 HTML 裡那幾句話
    for (const l of ["zh", "en"]) {
      const el = document.getElementById("yr-" + l); if (!el) continue;
      el.innerHTML = `<p class="yr-term">${T[l].term(y, y + 1)}</p>` + gridHTML(plan, l, nowM) + listHTML(plan, l, nowM);
    }
    if (window.btKeepLang) window.btKeepLang();
  } catch (e) {
    console.warn("/year/ 問不到這一屆的行程，維持頁面上原本的說明。", e);
  } finally { clearTimeout(timer); }
})();
