// /island/ 的資料：讀 teams.json、整理成畫面要的形狀。純函式，測試直接 import。
import { TEAM_ORDER } from "./layout.js";
const str = v => (typeof v === "string" ? v : "");
export const COLOURS = ["orange", "teal", "navy", "yellow", "sand", "cream", "grey"];
export const KINDS = ["hall", "tent", "booth", "desk", "home", "post", "pier", "tower"];
export const ROLES = ["copresident", "director", "advisor", "associate"];

export function normalize(raw) {
  const teamsRaw = raw && Array.isArray(raw.teams) ? raw.teams : [];
  const teams = [];
  for (const id of TEAM_ORDER) {
    const tm = teamsRaw.find(x => x && x.id === id); if (!tm) continue;
    teams.push({
      id, colour: COLOURS.includes(tm.colour) ? tm.colour : "teal", lead: tm.lead === "a" || tm.lead === "b" ? tm.lead : "",
      name_zh: str(tm.name_zh), name_en: str(tm.name_en) || str(tm.name_zh),
      tagline_zh: str(tm.tagline_zh), tagline_en: str(tm.tagline_en) || str(tm.tagline_zh),
      about_zh: str(tm.about_zh), about_en: str(tm.about_en) || str(tm.about_zh),
      programs: (Array.isArray(tm.programs) ? tm.programs : []).filter(p => p && str(p.id)).map(p => ({
        id: str(p.id), team: id, kind: KINDS.includes(p.kind) ? p.kind : "hall",
        name_zh: str(p.name_zh), name_en: str(p.name_en) || str(p.name_zh),
        line_zh: str(p.line_zh), line_en: str(p.line_en) || str(p.line_zh),
        detail_zh: str(p.detail_zh), detail_en: str(p.detail_en) || str(p.detail_zh),
        link: /^(\.\.\/|https:\/\/)/.test(str(p.link)) ? str(p.link) : "",
      })),
      people: [],
    });
  }
  const byId = new Map(teams.map(tm => [tm.id, tm]));
  const people = [];
  for (const p of (raw && Array.isArray(raw.people) ? raw.people : [])) {
    if (!p || !str(p.code) || !byId.has(p.team)) continue;
    const role = ROLES.includes(p.role) ? p.role : "associate";
    // 只有 named 是 true 而且有名字才顯示名字；不然顯示角色。這是對外頁的紅線。
    const named = p.named === true && !!str(p.name_zh);
    const person = { code: str(p.code), team: p.team, role, named,
      title_zh: str(p.title_zh) || role, title_en: str(p.title_en) || str(p.title_zh) || role,
      name_zh: named ? str(p.name_zh) : "", name_en: named ? (str(p.name_en) || str(p.name_zh)) : "" };
    people.push(person); byId.get(p.team).people.push(person);
  }
  return { teams, people };
}
export const label = (p, lang) => (p.named ? p["name_" + lang] || p.name_zh : p["title_" + lang] || p.title_zh);
export const teamById = (d, id) => d.teams.find(tm => tm.id === id) || null;
export const programById = (d, id) => { for (const tm of d.teams) for (const p of tm.programs) if (p.id === id) return p; return null; };
export const personByCode = (d, code) => d.people.find(p => p.code === code) || null;

// 網址：#team、#team/program、#p/code。
export function parseHash(hash) {
  const h = (hash || "").replace(/^#/, "");
  if (!h) return { kind: "overview" };
  if (h.startsWith("p/")) return { kind: "person", code: h.slice(2) };
  const [team, program] = h.split("/");
  return program ? { kind: "program", team, program } : { kind: "team", team };
}
export const hashFor = sel => sel.kind === "team" ? "#" + sel.team : sel.kind === "program" ? "#" + sel.team + "/" + sel.program : sel.kind === "person" ? "#p/" + sel.code : "";

// 「我」：存在這台裝置的瀏覽器裡。只收這幾個欄位，名字最多 12 字。
export function normalizeMe(raw, teams) {
  if (!raw || typeof raw !== "object") return null;
  const name = str(raw.name).trim().slice(0, 12); if (!name) return null;
  const team = teams.some(tm => tm.id === raw.team) ? raw.team : "exec";
  const shirt = Math.min(5, Math.max(0, parseInt(raw.shirt, 10) || 0)), hair = Math.min(2, Math.max(0, parseInt(raw.hair, 10) || 0));
  return { name, team, shirt, hair };
}
export async function load(base) { const r = await fetch((base || "./") + "teams.json"); return normalize(await r.json()); }
