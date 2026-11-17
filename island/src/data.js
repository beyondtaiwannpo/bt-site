// /island/ 的資料：讀 teams.json、整理成畫面要的形狀。純函式，測試直接 import。
import { TEAM_ORDER } from "./layout.js";
const str = v => (typeof v === "string" ? v : "");
export const COLOURS = ["orange", "teal", "navy", "yellow", "sand", "cream", "grey"];
export const KINDS = ["hall", "tent", "booth", "desk", "home", "post", "pier", "tower", "airport", "camp"];
export const ROLES = ["copresident", "director", "advisor", "associate", "alumni", "student"];

export function normalize(raw) {
  const teamsRaw = raw && Array.isArray(raw.teams) ? raw.teams : [];
  const teams = [];
  for (const id of TEAM_ORDER) {
    const tm = teamsRaw.find(x => x && x.id === id); if (!tm) continue;
    teams.push({
      id, colour: COLOURS.includes(tm.colour) ? tm.colour : "teal", lead: tm.lead === "a" || tm.lead === "b" ? tm.lead : "", sea: tm.sea === true,
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
    const also = (Array.isArray(p.also) ? p.also : []).filter(a => a && byId.has(a.team) && a.team !== p.team).map(a => ({ team: a.team, role: ROLES.includes(a.role) ? a.role : "associate", why_zh: str(a.why_zh), why_en: str(a.why_en) || str(a.why_zh) }));
    const flow = p.flow && byId.has(p.flow.to) && p.flow.to !== p.team ? { to: p.flow.to, carry_zh: str(p.flow.carry_zh), carry_en: str(p.flow.carry_en) || str(p.flow.carry_zh), why_zh: str(p.flow.why_zh), why_en: str(p.flow.why_en) || str(p.flow.why_zh) } : null;
    const person = { code: str(p.code), team: p.team, role, named, sample: p.sample === true,
      title_zh: str(p.title_zh) || role, title_en: str(p.title_en) || str(p.title_zh) || role,
      name_zh: named ? str(p.name_zh) : "", name_en: named ? (str(p.name_en) || str(p.name_zh)) : "",
      line_zh: str(p.line_zh), line_en: str(p.line_en) || str(p.line_zh), also, flow,
      // 他會走去哪座島（also 的第一個，或校友的 flow）。沒有就留在自己的島。
      goes: flow ? flow.to : (also[0] ? also[0].team : "") };
    people.push(person); byId.get(p.team).people.push(person);
  }
  const ids = new Set(teams.map(tm => tm.id));
  const connections = (raw && Array.isArray(raw.connections) ? raw.connections : []).filter(c => c && ids.has(c.a) && ids.has(c.b) && c.a !== c.b)
    .map(c => ({ a: c.a, b: c.b, why_zh: str(c.why_zh), why_en: str(c.why_en) || str(c.why_zh) }));
  return { teams, people, connections };
}
// 一座島跟誰連：{ team（另一邊）, why }。含島跟島的協作線，加上住在別座島但也參與這座的人、走來這座的校友。
export function connectionsOf(d, teamId) {
  const out = [];
  for (const c of d.connections) { if (c.a === teamId) out.push({ team: c.b, why_zh: c.why_zh, why_en: c.why_en }); else if (c.b === teamId) out.push({ team: c.a, why_zh: c.why_zh, why_en: c.why_en }); }
  return out;
}
export const visitorsOf = (d, teamId) => d.people.filter(p => p.team !== teamId && p.goes === teamId);
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
