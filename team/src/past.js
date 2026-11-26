// /team/?term=2025-26：前幾屆的團隊（2026-11-25）。
//
// Paul：「we're adding alumni into Teams… a drop down that has current team, 2025 to 2026 alumni, 2024 to 2025 alumni」。
// 頂欄「團隊」底下那兩屆的連結就是開這一頁，網址後面帶 ?term=哪一屆。<head> 裡那一小段看到 ?term= 就在 <html> 上記 data-past，
// CSS 照它把照片那一排與六塊介紹收起來，只留 #past 這一塊；這支把那一屆的名單畫進去。
//
// 資料是 public_past_team()（supabase/migrations/2027-01-11-past-teams.sql）：只回 Co-President 在後台打開的那幾屆，
// 一列是名字、team、那一屆的職位。**沒有照片、沒有任何 id**，所以這裡畫的是名字的清單，不是 /team/ 那種有臉的卡片。
// 誰會出現、誰不會，全部是資料庫那一支決定的；這支不做任何過濾，拿到什麼畫什麼。
//
// 問不到（遷移檔還沒跑、那一屆還沒打開、網路斷了）都是同一句「這一屆的名單還沒有放上來」，不對讀者講內部的事。
import { supabase } from "../../shared/supabase.js";
import { toPerson, byTeam, rankWeight, leadRank, LEAD_KEY } from "./ui.js";

const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const both = (zh, en) => `<span class="zh">${zh}</span><span class="en">${en}</span>`;
export const isTerm = s => /^\d{4}-\d{2}$/.test(String(s || ""));

// 有哪幾屆：新的在前面。
export function termsOf(rows) {
  return [...new Set((rows || []).map(r => r && r.term).filter(isTerm))].sort().reverse();
}
// 一屆的名單分組：Leadership 在最前面，接著六個 team（順序跟 /team/ 同一份），其他的排後面。
// 組內：Leadership 照 Co-President、Senior Adviser；team 裡 Director 在前、Adviser 其次，同一種照英文名。
export function groupsOf(rows, term) {
  const people = (rows || []).filter(r => r && r.term === term)
    .map(r => toPerson({ ...r, term: "", avatar: "" })).filter(p => p.name)
    .sort((a, b) => rankWeight(a.title) - rankWeight(b.title) || a.name.localeCompare(b.name, "en"));
  return byTeam(people).map(g => g.key === LEAD_KEY
    ? { ...g, people: g.people.slice().sort((a, b) => leadRank(a.title) - leadRank(b.title)) } : g);
}
const HEAD = { [LEAD_KEY]: ["Leadership", "Leadership"], "": ["還有這些人", "Also on the team"], CR: ["Community Relations", "Community Relations"] };
export function rosterHTML(groups) {
  return (groups || []).map(g => {
    const h = HEAD[g.key] || [g.key, g.key];
    return `<section class="pt-group"><h2>${both(esc(h[0]), esc(h[1]))}</h2><ul class="pt-list">${g.people.map(p =>
      `<li><b>${esc(p.name)}</b>${p.title ? `<span>${esc(p.title)}</span>` : ""}</li>`).join("")}</ul></section>`;
  }).join("");
}
export function yearsHTML(terms, cur) {
  if (!terms || terms.length < 2 && terms[0] === cur) return "";
  return terms.map(t => `<a href="./?term=${esc(t)}"${t === cur ? ' aria-current="page"' : ""}>${esc(t)}</a>`).join("");
}
export const emptyHTML = () => `<p class="pt-note">${both("這一屆的名單還沒有放上來。", "This year's list is not up yet.")}</p>`;

if (typeof document !== "undefined") (async () => {
  const term = document.documentElement.getAttribute("data-past");
  if (!isTerm(term)) return;
  const root = document.getElementById("past-root"), years = document.getElementById("past-years");
  if (!root) return;
  for (const el of document.querySelectorAll("[data-past-term]")) el.textContent = term;
  document.title = `${term} / Beyond Taiwan`;
  let rows = [];
  try {
    const { data, error } = await supabase.rpc("public_past_team");
    if (error) throw error;
    rows = Array.isArray(data) ? data : [];
  } catch (e) {
    console.warn("/team/?term= 問不到那一屆的名單。", e);
  }
  const groups = groupsOf(rows, term);
  root.innerHTML = groups.length ? rosterHTML(groups) : emptyHTML();
  const links = yearsHTML(termsOf(rows), term);
  if (years && links) { years.innerHTML = links; years.hidden = false; }
  if (window.btKeepLang) window.btKeepLang();
})();
