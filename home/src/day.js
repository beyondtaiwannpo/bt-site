// 行事曆的「日」（2026-11-26，Paul：時間看板的團隊看板拿掉，改成在首頁行事曆點一天，像 Google 日曆的那一天）。
// 一欄 24 小時，每半小時一格，底色越深那半小時有空的人越多；那一天的會與活動疊在上面（點開跟月、週一樣）。
// 能排會的人（Co-President、Senior Adviser、某個 team 是「改」以上）點一格就打開排會（schedule.js）。其他人看得到人數，點不了。
// 純函式：吃狀態吐 HTML。人數是 main.js 用 free.js 算好傳進來的（d），這裡只畫。
import { esc, T, lang, visibleItems, itemsOnDay, dayKey, minuteOfDay, dateLabel, chipHTML, hhmm } from "./ui.js";
import { shade } from "./free.js";
import { teamsOf } from "./schedule.js";

const two = n => String(n).padStart(2, "0");
const joinNames = a => a.join(lang() === "zh" ? "、" : ", ");
export const HOUR_PX = 44;   // 跟週曆一樣一小時 44px

// d = null（還在讀）| { failed: true } | { rows, free, members, all, noTz: [name] }
// cal = { at, mode, team }
export function dayBodyHTML(items, ctx, cal, d) {
  const H = HOUR_PX, k = cal.at, now = ctx.now.getTime();
  const hours = Array.from({ length: 24 }, (_, h) => `<div class="hr" style="top:${h * H}px">${two(h)}:00</div>`).join("");
  const list = itemsOnDay(visibleItems(items, cal.mode), k, ctx.tz).map(i => {
    const s = dayKey(i.start, ctx.tz) === k ? minuteOfDay(i.start, ctx.tz) : 0;
    const e = dayKey(i.end, ctx.tz) === k ? Math.max(minuteOfDay(i.end, ctx.tz), s + 20) : 24 * 60;
    return `<div class="slot dslot" style="top:${s / 60 * H}px;height:${Math.max(18, (e - s) / 60 * H - 2)}px">${chipHTML(i, ctx, true)}</div>`;
  }).join("");

  let bands = "", status = "", chips = "";
  if (!d) status = `<p class="mini">${T("day.loading")}</p>`;
  else if (d.failed) status = `<p class="wnote">${T("day.failed")}</p>`;
  else {
    const byId = new Map((d.members || []).map(m => [m.id, m]));
    let max = 0;
    for (const ids of d.free.values()) max = Math.max(max, ids.length);
    const seen = new Set();
    bands = d.rows.filter(r => !seen.has(r.min) && seen.add(r.min)).map(r => {
      const ids = d.free.get(r.min) || [], n = ids.length;
      const past = r.at.getTime() + 30 * 60000 <= now;
      const names = joinNames(ids.map(id => (byId.get(id) || {}).name || T("common.noName")));
      const title = n ? T("day.freeNames", { n, names }) : "";
      const style = `top:${r.min / 60 * H}px;--a:${shade(n, max)}`;
      const label = n ? `<span>${T("day.free", { n })}</span>` : "";
      return ctx.canSchedule && !past
        ? `<button type="button" class="fb" data-act="day-pick" data-m="${r.min}" style="${style}" title="${esc(title)}" aria-label="${esc(hhmm(r.min) + " " + (title || T("day.free", { n: 0 })))}">${label}</button>`
        : `<div class="fb${past ? " past" : ""}" style="${style}" title="${esc(past ? T("day.past") : title)}">${label}</div>`;
    }).join("");
    const teams = teamsOf(d.all || d.members);
    chips = teams.length ? `<div class="dchips" role="group" aria-label="team">${[""].concat(teams).map(t =>
      `<button type="button" class="chip${(cal.team || "") === t ? " on" : ""}" data-act="day-team" data-v="${esc(t)}"${(cal.team || "") === t ? ' aria-pressed="true"' : ' aria-pressed="false"'}>${esc(t ? t.replace(/\s*Team$/i, "") : T("day.everyone"))}</button>`).join("")}</div>` : "";
    if (d.noTz && d.noTz.length) status = `<p class="mini">${esc(T("day.noTz", { n: d.noTz.length, names: joinNames(d.noTz) }))}</p>`;
  }
  const lede = `<p class="mini">${T(ctx.canSchedule ? "day.lede" : "day.ledeView")} <a href="../availability/">${T("day.myTime")}</a></p>`;
  const today = dayKey(ctx.now, ctx.tz) === k;
  return `${lede}${chips}${status}<div class="week dweek">
    <div class="whead dhead"><div></div><div class="dow${today ? " today" : ""}"><span class="dnum">${esc(dateLabel(k))}</span></div></div>
    <div class="wscroll" id="wscroll"><div class="wgrid dgrid" style="height:${24 * H}px"><div class="hours">${hours}</div>
      <div class="wcol dcol${today ? " today" : ""}">${bands}${list}</div></div></div></div>`;
}
