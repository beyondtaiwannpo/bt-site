// /island/ 的資料：讀 teams.json、整理成畫面要的形狀。純函式，測試直接 import。
import { TEAM_ORDER } from "./layout.js";
const str = v => (typeof v === "string" ? v : "");
export const COLOURS = ["orange", "teal", "navy", "yellow", "sand", "cream", "grey"];
export const KINDS = ["hall", "tent", "booth", "desk", "home", "post", "pier", "tower", "airport", "camp", "school", "studio", "stage"];
export const ROLES = ["copresident", "director", "advisor", "associate", "alumni", "student", "intern"];
// 島的地面與擺設都是 teams.json 說了算（scene.js 裡不准出現 team 的名字）：
export const GROUNDS = ["grass", "lawn", "patch", "tiles", "grid", "paving", "checker", "brick"];
export const SCENERIES = ["", "playground", "plaza", "classroom", "school", "garden", "studio", "square"];

export function normalize(raw) {
  const teamsRaw = raw && Array.isArray(raw.teams) ? raw.teams : [];
  const teams = [];
  for (const id of TEAM_ORDER) {
    const tm = teamsRaw.find(x => x && x.id === id); if (!tm) continue;
    teams.push({
      id, colour: COLOURS.includes(tm.colour) ? tm.colour : "teal", lead: tm.lead === "a" || tm.lead === "b" ? tm.lead : "", sea: tm.sea === true,
      workspace: str(tm.workspace), ground: GROUNDS.includes(tm.ground) ? tm.ground : "grass", scenery: SCENERIES.includes(tm.scenery) ? tm.scenery : "", trees: Number.isInteger(tm.trees) ? Math.max(0, Math.min(20, tm.trees)) : 10,
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

// ── 跟官網其他頁接起來（2026-11-16 Paul：「I want them to be connected」）──
// 活動：/events/ 讀的 public_events() 同一份。每一場有 team（例如 "Curriculum Team"），對到這裡的島。
// 報名開著的活動在島上掛一塊「報名中」的牌子，卡上列出來，按了到 /apply/?f=表單 或 /events/#代號。
export function teamIdFor(teamText) {
  const t = String(teamText || "").toLowerCase();
  if (/community|\bcr\b/.test(t)) return "cr";
  for (const id of ["sponsorship", "curriculum", "internship", "mentorship", "marketing"]) if (t.includes(id)) return id;
  return "commons";   // 認不出 team 的活動當成全 BT 的，掛在聚會所
}
export function eventState(e) {
  const now = Date.now();
  if (e.ends_at ? new Date(e.ends_at) < now : (e.starts_at && new Date(e.starts_at) < now - 864e5)) return "ended";
  if (!e.form_id) return "info";
  if (e.capacity && e.signed_up >= e.capacity) return "full";
  if (e.signup_open) return "open";
  if (e.signup_opens_at && new Date(e.signup_opens_at) > now) return "soon";
  return "closed";
}
export function normalizeEvents(rows) {
  return (Array.isArray(rows) ? rows : []).filter(e => e && str(e.slug)).map(e => ({
    slug: str(e.slug), team: teamIdFor(e.team), title_zh: str(e.title_zh) || str(e.title_en), title_en: str(e.title_en) || str(e.title_zh),
    starts_at: str(e.starts_at), ends_at: str(e.ends_at), form_id: str(e.form_id), state: eventState(e),
    link: e.form_id && eventState(e) === "open" ? "../apply/?f=" + encodeURIComponent(str(e.form_id)) : "../events/#" + encodeURIComponent(str(e.slug)),
  })).filter(e => e.state !== "ended").sort((a, b) => (a.starts_at || "").localeCompare(b.starts_at || ""));
}
export const eventsOf = (events, teamId) => (events || []).filter(e => e.team === teamId);

// 校友：/alumni/ 讀的 public_alumni() 同一份（校友自己填、自己勾同意、Co-President 核可才會在裡面）。
// 他走去哪座島、帶著什麼，照他自己在設定頁填的「在 BT 做過什麼」（bt_role 六選一、bt_team 可空；
// supabase/migrations/2026-12-28-alumni-bt-role.sql）：
//   1. 填了 team 就去那座島；
//   2. 沒填 team 的講者去 Curriculum、mentor 去 Mentorship、實習生去 Internship、校園大使去 Community Relations、
//      學員去 Mentorship（他的 mentor 在那裡），幹部照最後一屆的職位字樣（title）；
//   3. 什麼都認不出來的走去聚會所。
// 這些人住在機場。真的校友進來之後，teams.json 裡 sample 的那幾筆就不顯示。
export const BT_ROLES = {
  cadre:      { zh: "幹部",    en: "Organiser", to: "" },
  speaker:    { zh: "講者",    en: "Speaker",   to: "curriculum" },
  mentor:     { zh: "Mentor",  en: "Mentor",    to: "mentorship" },
  intern:     { zh: "實習生",  en: "Intern",    to: "internship" },
  ambassador: { zh: "校園大使", en: "Ambassador", to: "cr" },
  student:    { zh: "學員",    en: "Student",   to: "mentorship" },
};
export function alumniTeamFor(r) {
  if (str(r.bt_team)) return teamIdFor(r.bt_team);
  const br = BT_ROLES[str(r.bt_role)];
  if (br && br.to) return br.to;
  return str(r.title) ? teamIdFor(r.title) : "commons";
}
export function alumniToPeople(rows) {
  const out = [];
  for (const r of Array.isArray(rows) ? rows : []) {
    if (!r || !str(r.name)) continue;
    const title = str(r.title), team = alumniTeamFor(r), br = BT_ROLES[str(r.bt_role)];
    const fromTitle = (title.match(/^(Co-President|Director|Advisor|Associate|Speaker|Mentor|Intern|Ambassador)/i) || [, ""])[1];
    const carry_zh = br ? br.zh : (fromTitle || "回來"), carry_en = br ? br.en : (fromTitle || "Back");
    const did_zh = br ? `在 BT 是${br.zh}${str(r.bt_team) ? `（${r.bt_team}）` : ""}。` : "", did_en = br ? `Was a BT ${br.en.toLowerCase()}${str(r.bt_team) ? ` (${r.bt_team})` : ""}.` : "";
    out.push({ code: "db-" + str(r.id || r.name), team: "airport", role: "alumni", named: true, sample: false, db: true,
      title_zh: "校友", title_en: "Alumni", name_zh: str(r.name), name_en: str(r.name),
      line_zh: str(r.quote), line_en: str(r.quote_en) || str(r.quote), also: [],
      flow: { to: team, carry_zh, carry_en,
        why_zh: [did_zh, title ? `最後一屆在 BT 是 ${title}。` : ""].filter(Boolean).join("") || "回來看看。",
        why_en: [did_en, title ? `Last BT role: ${title}.` : ""].filter(Boolean).join(" ") || "Back for a visit." },
      goes: team, where: [str(r.city), str(r.country_en) || str(r.country)].filter(Boolean).join(", ") });
  }
  return out;
}
// 真的校友進來：換掉機場上 sample 的那幾筆（學員的 sample 留著，他們不是從校友名單來的）。
export function mergeAlumni(d, dbPeople) {
  if (!dbPeople.length) return d;
  const airport = d.teams.find(tm => tm.id === "airport"); if (!airport) return d;
  const keep = p => !(p.role === "alumni" && p.sample);
  d.people = d.people.filter(keep).concat(dbPeople); airport.people = airport.people.filter(keep).concat(dbPeople);
  return d;
}
async function rpc(name, timeoutMs) {
  const cfg = await import("../../shared/supabase-config.js");
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), timeoutMs || 4000);
  try {
    const r = await fetch(`${cfg.SUPABASE_URL}/rest/v1/rpc/${name}`, { method: "POST", signal: ctl.signal, headers: { apikey: cfg.SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${cfg.SUPABASE_PUBLISHABLE_KEY}`, "Content-Type": "application/json" }, body: "{}" });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return await r.json();
  } finally { clearTimeout(t); }
}
// 兩份都是「拿不到就當沒有」：島照樣畫，只是沒有活動與真校友。
export const loadEvents = () => rpc("public_events").then(normalizeEvents).catch(() => []);
export const loadAlumni = () => rpc("public_alumni").then(alumniToPeople).catch(() => []);

// ── Marketing 的貼文牆（Paul 2026-11-17：「get a few posts from our Instagram and put it up there」）──
// instagram.json 是 Marketing 自己貼的連結清單（抓 Instagram 要 token 與外站程式，這個 repo 不做）。
// 只收 https://www.instagram.com/ 開頭的連結；壞的一筆丟掉，整份拿不到就當沒有。
// 每一則掛在一樣「在做的事」底下（program），點那一棟才列出來；program 填錯的那一則不顯示（有 teams 的話對得到才算）。
export function normalizePosts(raw, teams) {
  const posts = raw && Array.isArray(raw.posts) ? raw.posts : [];
  const known = teams ? new Set(teams.flatMap(tm => tm.programs.map(p => p.id))) : null;
  return { handle: str(raw && raw.handle).replace(/^@/, ""), profile: /^https:\/\/www\.instagram\.com\//.test(str(raw && raw.profile)) ? str(raw.profile) : "",
    posts: posts.filter(x => x && /^https:\/\/www\.instagram\.com\/[A-Za-z0-9_./-]+$/.test(str(x.url)) && (!known || known.has(str(x.program) || "instagram"))).map((x, i) => ({
      id: i, program: str(x.program) || "instagram",
      url: str(x.url), kind: x.kind === "reel" ? "reel" : "post", date: str(x.date).slice(0, 10),
      image: /^posts\/[A-Za-z0-9_-]+\.jpg$/.test(str(x.image)) || /^https:\/\//.test(str(x.image)) ? str(x.image) : "",   // island/posts/ 裡的檔名，或資料庫那邊 Storage 的 https 網址
      caption_zh: str(x.caption_zh) || str(x.caption_en), caption_en: str(x.caption_en) || str(x.caption_zh) })).slice(0, 12) };
}
export const postsOf = (ig, programId) => (ig && ig.posts ? ig.posts : []).filter(x => x.program === programId);
// 貼文先讀資料庫（後台 /admin/site/#island 貼的，public_island_posts()），有東西就用它；沒有或讀不到就退回 island/posts.json。
// 兩邊的形狀一樣（program、url、kind、date、caption、image）；資料庫那邊的 image 是 Storage 的 https 網址。
export async function loadPosts(base, teams) {
  const file = await fetch((base || "./") + "posts.json").then(r => r.json()).catch(() => null);
  const db = await rpc("public_island_posts").catch(() => null);
  const raw = Array.isArray(db) && db.length ? { handle: file && file.handle, profile: file && file.profile, posts: db } : file;
  return normalizePosts(raw, teams);
}
