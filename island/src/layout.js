// /island/ 的位置：七座島在哪、每座島上做的事蓋在哪、人站哪。純數學，沒有 DOM、沒有 Three。測試直接算。
// 單位公尺，y 朝上。中間是 Co-President 那座，六個 team 繞一圈。每座島是一個六邊形的平台（跟 HEART 政策島一樣用六邊形）。
export const TAU = Math.PI * 2;
export const ISLAND_R = 9.5;       // 六邊形外接圓半徑
export const CENTER_R = 8.5;       // 中間那座小一點
export const RING_R = 28;          // 外圍六座的圓心離中心多遠
export const TEAM_ORDER = ["exec", "sponsorship", "curriculum", "internship", "mentorship", "marketing", "cr"];

// 每座島的圓心與半徑。exec 在中間，其他六個從正下方（+z，面向鏡頭）逆時針排。
export function islands() {
  const out = [{ id: "exec", x: 0, z: 0, r: CENTER_R, angle: 0 }];
  TEAM_ORDER.slice(1).forEach((id, i) => { const a = Math.PI / 2 + i * TAU / 6; out.push({ id, x: Math.cos(a) * RING_R, z: Math.sin(a) * RING_R, r: ISLAND_R, angle: a }); });
  return out;
}
export const islandOf = id => islands().find(i => i.id === id) || null;
// 六邊形的六個頂點（平頂）。
export function hexPoints(cx, cz, r) { const pts = []; for (let k = 0; k < 6; k++) { const a = k * TAU / 6 + Math.PI / 6; pts.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]); } return pts; }
// 橋：中間那座到外圍每一座，從兩邊的邊緣開始。
export function bridges() { return islands().slice(1).map(i => { const d = Math.hypot(i.x, i.z), ux = i.x / d, uz = i.z / d; return { to: i.id, x0: ux * (CENTER_R - 0.6), z0: uz * (CENTER_R - 0.6), x1: i.x - ux * (ISLAND_R - 0.6), z1: i.z - uz * (ISLAND_R - 0.6) }; }); }
// 做的事蓋在島上哪裡：n 樣東西繞島心排一小圈（1 樣在中間偏後），都面向島心偏向鏡頭。
export function programSpots(island, n) {
  const out = []; const base = island.angle || Math.PI / 2;
  if (n === 1) { out.push({ x: island.x, z: island.z - 1.5, face: Math.PI }); return out; }
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
export function cameraOverview(phone) { const d = phone ? 86 : 70; return { pos: [0, d * 0.95, d * 0.72], target: [0, 0, 2] }; }
export function cameraIsland(island, phone) { const d = phone ? 38 : 32; const ux = island.x || 0, uz = island.z || 1; const n = Math.hypot(ux, uz) || 1; return { pos: [island.x + (ux / n) * d * 0.25, d * 0.78, island.z + d * 0.62 + (uz / n) * d * 0.1], target: [island.x, 0.8, island.z - 1] }; }
export function cameraBird(phone) { const d = phone ? 95 : 78; return { pos: [0, d, 0.01], target: [0, 0, 0] }; }
