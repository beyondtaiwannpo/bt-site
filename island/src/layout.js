// /island/ 的位置：七座島在哪、每座島上做的事蓋在哪、人站哪。純數學，沒有 DOM、沒有 Three。測試直接算。
// 單位公尺，y 朝上。中間是 Co-President 那座，六個 team 繞一圈。每座島是一個六邊形的平台（跟 HEART 政策島一樣用六邊形）。
export const TAU = Math.PI * 2;
export const ISLAND_R = 9.5;       // 預設的六邊形外接圓半徑（沒寫在 SPEC 裡的島用它）
export const CENTER_R = 8.5;
export const RING_R = 28;          // 預設的距離（沒寫在 SPEC 裡的島用它）
export const TEAM_ORDER = ["commons", "sponsorship", "curriculum", "internship", "mentorship", "marketing", "cr", "airport"];
export const RING = TEAM_ORDER.slice(1, 7);   // 外圍六座的順序
export const AIRPORT_R = 54, AIRPORT_ANGLE = 0;             // 機場在海上、最右邊，接 Marketing 與 Community Relations
// 每座島長得不一樣（Paul 2026-11-17：「I want each island to be different」）：
// 大小（r）、離中心多遠（dist）、角度微調（turn，弧度）、形狀（hex 六邊形、round 圓、rect 方）。
// 橋從島的邊緣開始，所以 dist 越近橋越短；最短的那幾條約 5 公尺。
// 改這裡就夠：scene.js 照 islands() 畫，wanderTarget 照 r 算，test/island.test.mjs 守「不重疊」。
export const SPEC = {
  commons:     { r: 9.0,  dist: 0,  shape: "round" },   // 聚會所：圓的，中間是遊樂場
  sponsorship: { r: 10.0, dist: 27, turn: 0.05, shape: "hex" },
  curriculum:  { r: 11.0, dist: 30, turn: -0.08, shape: "hex" },   // 最大的一座：探索營、講座、資料庫都在這
  internship:  { r: 8.6,  dist: 25, turn: 0.06, shape: "rect" },   // 學校：方的操場
  mentorship:  { r: 9.2,  dist: 28, turn: -0.04, shape: "round" },
  marketing:   { r: 9.6,  dist: 29, turn: 0.07, shape: "hex" },
  cr:          { r: 8.8,  dist: 24, turn: -0.05, shape: "hex" },   // 最近的一座：社區就在隔壁
  airport:     { r: 9.5,  dist: 54, shape: "sea" },
};

// 每座島的圓心與半徑。commons 在中間，其他六個從正下方（+z，面向鏡頭）逆時針排，各自照 SPEC 的距離與角度微調。
export function islands() {
  const c = SPEC.commons; const out = [{ id: "commons", x: 0, z: 0, r: c.r, angle: 0, shape: c.shape }];
  RING.forEach((id, i) => { const sp = SPEC[id] || { r: ISLAND_R, dist: RING_R }; const a = Math.PI / 2 + i * TAU / 6 + (sp.turn || 0); out.push({ id, x: Math.cos(a) * sp.dist, z: Math.sin(a) * sp.dist, r: sp.r, angle: a, shape: sp.shape || "hex" }); });
  const ap = SPEC.airport; out.push({ id: "airport", x: Math.cos(AIRPORT_ANGLE) * ap.dist, z: Math.sin(AIRPORT_ANGLE) * ap.dist, r: ap.r, angle: AIRPORT_ANGLE, sea: true, shape: "sea" });
  return out;
}
export const islandOf = id => islands().find(i => i.id === id) || null;
// 六邊形的六個頂點（平頂）。
export function hexPoints(cx, cz, r) { const pts = []; for (let k = 0; k < 6; k++) { const a = k * TAU / 6 + Math.PI / 6; pts.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]); } return pts; }
// 橋：中間那座到外圍每一座（輻條）、外圍相鄰的兩座之間（環）、機場接右邊兩座。
// 每一條從兩邊的邊緣開始。a、b 是兩端的 team id，人沿橋走的時候用。
function edge(a, b) { const A = islandOf(a), B = islandOf(b); const dx = B.x - A.x, dz = B.z - A.z, d = Math.hypot(dx, dz), ux = dx / d, uz = dz / d; return { a, b, x0: A.x + ux * (A.r - 0.6), z0: A.z + uz * (A.r - 0.6), x1: B.x - ux * (B.r - 0.6), z1: B.z - uz * (B.r - 0.6) }; }
export function bridges() {
  const out = RING.map(id => edge("commons", id));
  RING.forEach((id, i) => out.push(edge(id, RING[(i + 1) % RING.length])));
  out.push(edge("airport", "marketing"), edge("airport", "cr"));
  return out;
}
// 從一座島走到另一座：沿橋，最少幾座（寬度優先）。回島 id 的陣列，含起點與終點；同一座回 [from]。
export function route(from, to) {
  if (from === to) return [from];
  const adj = new Map(); for (const e of bridges()) { (adj.get(e.a) || adj.set(e.a, []).get(e.a)).push(e.b); (adj.get(e.b) || adj.set(e.b, []).get(e.b)).push(e.a); }
  const prev = new Map([[from, null]]), q = [from];
  while (q.length) { const cur = q.shift(); if (cur === to) break; for (const n of adj.get(cur) || []) if (!prev.has(n)) { prev.set(n, cur); q.push(n); } }
  if (!prev.has(to)) return [from];
  const path = []; for (let c = to; c; c = prev.get(c)) path.unshift(c); return path;
}
// 一條路線攤成一串要走過的點：每座島的中心、橋的兩端。
export function routePoints(ids) {
  const pts = []; for (let i = 0; i < ids.length; i++) { const isl = islandOf(ids[i]); if (i > 0) { const e = edge(ids[i - 1], ids[i]); pts.push([e.x0, e.z0], [e.x1, e.z1]); } if (i === 0 || i === ids.length - 1) pts.push([isl.x, isl.z]); else pts.push([isl.x, isl.z]); }
  return pts;
}
// 做的事蓋在島上哪裡：n 樣東西繞島心排一小圈（1 樣在中間偏後），都面向島心偏向鏡頭。
export function programSpots(island, n) {
  const out = []; const base = island.angle || Math.PI / 2;
  if (n === 1) { out.push({ x: island.x, z: island.z - 1.0, face: island.id === "airport" ? 0.4 : Math.PI }); return out; }
  for (let k = 0; k < n; k++) { const a = base + Math.PI + (k - (n - 1) / 2) * (TAU / 7); const rr = island.r * 0.5; out.push({ x: island.x + Math.cos(a) * rr, z: island.z + Math.sin(a) * rr, face: Math.atan2(island.x - (island.x + Math.cos(a) * rr), island.z - (island.z + Math.sin(a) * rr)) }); }
  return out;
}
// 人在島上走：隨機一個目標點，在島上、不在建築的 2.2 公尺內、不在邊緣 1.5 公尺內。
export function wanderTarget(island, blockers, rnd) {
  for (let i = 0; i < 40; i++) {
    const a = rnd() * TAU, d = Math.sqrt(rnd()) * (island.r - 2.2);
    const x = island.x + Math.cos(a) * d, z = island.z + Math.sin(a) * d;
    if ((blockers || []).some(b => Math.hypot(x - b.x, z - b.z) < 2.3)) continue;
    return { x, z };
  }
  return { x: island.x, z: island.z + 2 };
}
// 鏡頭：全景、看一座島、鳥瞰。回 { pos, target }。
// fit：[橫的半徑, 直的半徑]，scene.js 照畫面的長寬把距離算出來；pos 只給方向。
export function cameraOverview(phone) { const d = phone ? 125 : 96; return { pos: [0, d * 1.0, d * 0.72], target: [0, 0, 0], fit: [64, 44] }; }
export function cameraIsland(island, phone) { const d = phone ? 38 : 32; const ux = island.x || 0, uz = island.z || 1; const n = Math.hypot(ux, uz) || 1; return { pos: [island.x + (ux / n) * d * 0.25, d * 0.78, island.z + d * 0.62 + (uz / n) * d * 0.1], target: [island.x, 0.8, island.z - 1] }; }
export function cameraBird(phone) { const d = phone ? 135 : 118; return { pos: [0, d, 0.01], target: [0, 0, 0], fit: [70, 70] }; }
