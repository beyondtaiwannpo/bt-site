// 後台「對外 → 團隊頁」下面那一塊：前幾屆的名單（2026-11-25）。
//
// 對外的 /team/?term=2025-26 那一頁放的是「那一屆的整份名單，只有名字與職位」（Paul 2026-11-25 選的：Whole roster, names only）。
// 整份名單沒有每個人自己的同意，所以這裡有兩道門，兩道都只有 Co-President 動得了（資料庫擋，見 supabase/migrations/2027-01-11-past-teams.sql）：
//   1. 一屆一個開關，預設關。沒打開的那一屆，對外一個名字都沒有。
//   2. 一個人一個「藏起來」。藏起來的人每一屆都不出現。**未滿 18 歲的人一律要藏**：資料庫不知道誰幾歲，只有看的人擋得住，
//      所以每個人旁邊印學校與畢業年。
// Senior Adviser 看得到這一塊，開關與勾選是灰的。
//
// 資料與畫面放在同一支，因為這一塊只有三件事：讀名單、開關一屆、藏一個人。字在 strings.js（past. 開頭的那幾句）。
import { supabase } from "../../../shared/supabase.js";
import { T } from "./strings.js";

const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const PAST_FILE = "2027-01-11-past-teams.sql";

// 遷移檔還沒跑的資料庫沒有那一支函式：回 null，畫面印一句要跑哪一支，不是整頁壞掉。
export const notInstalled = e => !!e && (["PGRST202", "42883", "404"].includes(String(e.code)) || /could not find the function|does not exist/i.test(String(e.message || "")));
export async function loadPast() {
  const { data, error } = await supabase.rpc("past_team_admin");
  if (error) { if (notInstalled(error)) return null; throw error; }
  return Array.isArray(data) ? data : [];
}
export async function setPastPublic(term, on) {
  const { error } = await supabase.rpc("set_past_team_public", { p_term: term, p_on: !!on });
  if (error) throw error;
}
export async function setPastHidden(person, on) {
  const { error } = await supabase.rpc("set_past_team_hidden", { p_person: person, p_on: !!on });
  if (error) throw error;
}

// 一個人在名單上可能有好幾筆職位（同一屆兼兩個 team）。收成一個人一列，職位並排；藏的是人，不是職位。
export function peopleOf(term) {
  const by = new Map();
  for (const p of (term && term.people) || []) {
    if (!p || !p.person) continue;
    const cur = by.get(p.person) || { ...p, titles: [] };
    const t = [p.title_en || p.title_zh, p.team].filter(Boolean).join("・");
    if (t && !cur.titles.includes(t)) cur.titles.push(t);
    by.set(p.person, cur);
  }
  return [...by.values()];
}
// 會出現在對外那一頁的有幾位（那一屆打開的話）。
export const shownCount = term => peopleOf(term).filter(p => !p.why).length;

const WHY = { hidden: "past.whyHidden", not_member: "past.whyNotMember", forgotten: "past.whyForgotten", no_name: "past.whyNoName" };

export function pastTeamsHTML(past, isPresident, busy) {
  const head = `<section class="section" id="past-teams"><h2>${T("past.title")}</h2><p class="lede">${T("past.lede")}</p>`;
  if (past === null) return head + `<div class="msg err">${T("past.notInstalled", { file: PAST_FILE })}</div></section>`;
  if (!past || !past.length) return head + `<div class="empty"><b>${T("past.none")}</b><div>${T("past.noneHint")}</div></div></section>`;
  const off = busy || !isPresident ? " disabled" : "";
  return head + `<div class="note">${T("past.warn")}</div>${isPresident ? "" : `<p class="fmeta">${T("past.onlyPresident")}</p>`}` + past.map(t => {
    const people = peopleOf(t), shown = people.filter(p => !p.why).length;
    return `<div class="past-term" data-term="${esc(t.term)}">
      <div class="arow">
        <label class="apick"><input type="checkbox" data-act="past-public" data-term="${esc(t.term)}"${t.public ? " checked" : ""}${off}
          aria-label="${T("past.openLabel", { term: esc(t.term) })}"></label>
        <div class="abody">
          <div class="fhead"><b>${esc(t.term)}</b>${t.public ? `<span class="tag open">${T("past.isOpen")}</span>` : `<span class="tag">${T("past.isClosed")}</span>`}</div>
          <div class="fmeta">${T("past.count", { n: shown, all: people.length })}・<a href="../../team/?term=${esc(t.term)}" target="_blank" rel="noopener">${T("past.view")}</a></div>
        </div>
      </div>
      ${people.length ? `<ul class="flist">${people.map(p => {
        const name = p.name_en || p.name_zh || T("common.noName"), alt = p.name_en && p.name_zh ? p.name_zh : "";
        const auto = p.why && p.why !== "hidden";
        return `<li><div class="arow">
          <label class="apick"><input type="checkbox" data-act="past-hide" data-id="${esc(p.person)}"${p.why === "hidden" ? " checked" : ""}${auto ? " disabled" : off}
            aria-label="${T("past.hideLabel", { name: esc(name) })}"></label>
          <div class="abody">
            <div class="fhead"><b>${esc(name)}${alt ? `<span class="alt">${esc(alt)}</span>` : ""}</b>
              ${p.why ? `<span class="tag">${T(WHY[p.why] || "past.whyHidden")}</span>` : `<span class="tag open">${T("past.willShow")}</span>`}</div>
            <div class="fmeta">${esc(p.titles.join(" / ") || T("past.noTitle"))}<br>${esc([p.school, p.grad_year ? T("past.grad", { y: p.grad_year }) : ""].filter(Boolean).join("・") || T("past.noSchool"))}</div>
          </div>
        </div></li>`;
      }).join("")}</ul>` : `<p class="fmeta">${T("past.emptyTerm")}</p>`}
    </div>`;
  }).join("") + `</section>`;
}
