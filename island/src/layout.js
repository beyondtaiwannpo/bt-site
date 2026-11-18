// /island/ 的位置：七座島在哪、每座島上做的事蓋在哪、人站哪。純數學，沒有 DOM、沒有 Three。測試直接算。
// 單位公尺，y 朝上。中間是 Co-President 那座，六個 team 繞一圈。每座島是一個六邊形的平台（跟 HEART 政策島一樣用六邊形）。
export const TAU = Math.PI * 2;
export const ISLAND_R = 9.5;       // 預設的六邊形外接圓半徑（沒寫在 SPEC 裡的島用它）
export const CENTER_R = 8.5;
export const RING_R = 28;          // 預設的距離（沒寫在 SPEC 裡的島用它）
export const TEAM_ORDER = ["commons", "sponsorship", "curriculum", "internship", "mentorship", "marketing", "cr", "airport"];
export const RING = TEAM_ORDER.slice(1, 7);   // 外圍六座的順序
export const AIRPORT_R = 54, AIRPORT_ANGLE = 0;             // 機場在海上、最右邊，接 Marketing 與 Community Relations
// 島排成蜂巢（Paul 2026-11-17 第二次：「every island is connected… smaller distance… it doesn't feel connected」，指 HEART 政策島那種島跟島之間只隔一條水道）：
// 六座外圍的島跟中間那座、跟相鄰的兩座，距離都是 SPACING；半徑各自不同（最大的 12、最小的 10），水道 2.5 到 5 公尺，橋就那麼短。
// 形狀全部六邊形（Paul：「you can make it the same shape」），只有聚會所是圓的。
// 改這裡就夠：scene.js 照 islands() 畫，wanderTarget 照 r 算，test/island.test.mjs 守「不重疊」「橋 2 到 8 公尺」「進得了全景」。
export const SPACING = 26;
export const SPEC = {
  commons:     { r: 10.0, shape: "round" },   // 聚會所：圓的，中間是遊樂場
  sponsorship: { r: 11.5, shape: "hex" },
  curriculum:  { r: 12.0, shape: "hex" },     // 最大的一座：探索營、講座、資料庫都在這
  internship:  { r: 10.5, shape: "hex" },
  mentorship:  { r: 11.0, shape: "hex" },
  marketing:   { r: 11.5, shape: "hex" },
  cr:          { r: 10.5, shape: "hex" },
  airport:     { r: 9.5,  dist: 47, shape: "sea" },   // 海上，最右邊，跟 Marketing 與 Community Relations 各隔一條水道
};

// 每座島的圓心與半徑。commons 在中間，其他六個從正下方（+z，面向鏡頭）逆時針排，各自照 SPEC 的距離與角度微調。
export function islands() {
  const c = SPEC.commons; const out = [{ id: "commons", x: 0, z: 0, r: c.r, angle: 0, shape: c.shape }];
  RING.forEach((id, i) => { const sp = SPEC[id] || { r: ISLAND_R }; const a = Math.PI / 2 + i * TAU / 6; out.push({ id, x: Math.cos(a) * SPACING, z: Math.sin(a) * SPACING, r: sp.r, angle: a, shape: sp.shape || "hex" }); });
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
// blockers 是世界座標的圓 { x, z, r }（房子、桌椅、樹）。目標點不可以落在任何一個圓裡。
export function wanderTarget(island, blockers, rnd) {
  for (let i = 0; i < 40; i++) {
    // 機場是長方形的平台（跑道在後半），人只在前面那一條（z 3 到 8.5）走；島是圓的範圍。
    let x, z;
    if (island.sea) { x = island.x + (rnd() - 0.5) * 22; z = island.z + 3 + rnd() * 5.5; }
    else { const a = rnd() * TAU, d = Math.sqrt(rnd()) * (island.r - 2.0); x = island.x + Math.cos(a) * d; z = island.z + Math.sin(a) * d; }
    if ((blockers || []).some(b => Math.hypot(x - b.x, z - b.z) < (b.r || 1.2) + 0.6)) continue;
    return { x, z };
  }
  return { x: island.x, z: island.z + 2 };
}
// 從 a 走到 b 不穿過任何一個圓（Paul 2026-11-17：「people are walking inside the building」）。
// 回要經過的點（不含 a，含 b）。做法：這一段線碰到哪個圓，就在最靠近圓心的那一點往外推一個點，兩段再各自檢查一次，最多拆六層。
// 2026-11-17 第九次：之前一條路會拆成三四十個點（每繞一個矮樹就再拆），人就一直在走。現在只繞大東西（半徑 0.9 以上；矮樹、燈每一幀往外推就夠）、
// 最多拆四層，拆完再拉直：中間的點能直走就拿掉。
export function detour(a, b, blockers, depth) {
  const big = (blockers || []).filter(c => (c.r || 1.2) >= 0.6);   // 燈（0.4）不算，矮樹以上都繞
  const pts = detourRaw(a, b, big, depth == null ? 4 : depth);
  // 拉直
  const crosses = (p, q) => big.some(c => { const dx = q.x - p.x, dz = q.z - p.z, len2 = dx * dx + dz * dz; if (len2 < 1e-6) return false; const tt = Math.max(0, Math.min(1, ((c.x - p.x) * dx + (c.z - p.z) * dz) / len2)); return Math.hypot(p.x + dx * tt - c.x, p.z + dz * tt - c.z) < (c.r || 1.2) + 0.3; });
  const out = []; let from = a;
  for (let i = 0; i < pts.length; i++) { const isLast = i === pts.length - 1; if (!isLast && !crosses(from, pts[i + 1])) continue; out.push(pts[i]); from = pts[i]; }
  return out.length ? out : [b];
}
function detourRaw(a, b, blockers, depth) {
  const dep = depth; const list = blockers || [];
  const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz); if (len < 0.01 || dep <= 0) return [b];
  let hit = null, hitT = 0, hitD = Infinity;
  for (const c of list) { const R = (c.r || 1.2) + 0.5; const tt = Math.max(0, Math.min(1, ((c.x - a.x) * dx + (c.z - a.z) * dz) / (len * len))); const px = a.x + dx * tt, pz = a.z + dz * tt; const dd = Math.hypot(px - c.x, pz - c.z);
    if (dd < R && tt > 0.02 && tt < 0.98 && tt < hitT + 1e9 && (!hit || tt < hitT)) { hit = c; hitT = tt; hitD = dd; } }
  if (!hit) return [b];
  const R = (hit.r || 1.2) + 0.7; const px = a.x + dx * hitT, pz = a.z + dz * hitT;
  let nx = px - hit.x, nz = pz - hit.z; const nd = Math.hypot(nx, nz); if (nd < 0.05) { nx = -dz / len; nz = dx / len; } else { nx /= nd; nz /= nd; }
  // 往外推的那一點不可以落在別的圓裡（2026-11-17 大家卡在同一點就是這個：目標在圓裡，每一幀被推出來，永遠到不了）。
  // 落在圓裡就再往外推，推不出來就換另一邊。
  const inside = q => list.some(c => c !== hit && Math.hypot(q.x - c.x, q.z - c.z) < (c.r || 1.2) + 0.4);
  let via = { x: hit.x + nx * R, z: hit.z + nz * R };
  for (let k = 1; k <= 4 && inside(via); k++) via = { x: hit.x + nx * (R + k * 1.2), z: hit.z + nz * (R + k * 1.2) };
  if (inside(via)) { via = { x: hit.x - nx * R, z: hit.z - nz * R }; for (let k = 1; k <= 4 && inside(via); k++) via = { x: hit.x - nx * (R + k * 1.2), z: hit.z - nz * (R + k * 1.2) }; }
  // 兩段再各自檢查一次（同一個圓也要再看：往外推的點在圓外，但到它的那一段可能還切到圓的邊）。
  return detourRaw(a, via, list, dep - 1).concat(detourRaw(via, b, list, dep - 1));
}
// 鏡頭：全景、看一座島、鳥瞰。回 { pos, target }。
// fit：[橫的半徑, 直的半徑]，scene.js 照畫面的長寬把距離算出來；pos 只給方向。
export function cameraOverview(phone) { const d = phone ? 125 : 96; return { pos: [0, d * 1.0, d * 0.72], target: [0, 0, 0], fit: [68, 48] }; }
// 海上的裝飾小島（Paul 2026-11-17：「a couple of decorative islands on the side… a few roller coaster around」）：沒有功能、不能點、人不會去。
// kind 決定畫什麼：coaster 雲霄飛車、lighthouse 燈塔、picnic 幾棵樹一張桌、palm 棕櫚、rock 礁石。位置跟每座島都隔得開（測試守）。
// 2026-11-18 Paul：「add more coaster, add more stuff」：多了迴圈雲霄飛車（loop）、野鼠式小飛車（mouse）、摩天輪加旋轉木馬的遊樂小島（fair），
// 這三種在 island/src/rides.js 畫（引擎的 islet() 只認前五種，scene.js 用 ENGINE_ISLETS 分）。礁石往東挪一點讓位給迴圈飛車。
export const ISLETS = [
  { id: "coaster", kind: "coaster", x: -52, z: 26, r: 7.5 },
  { id: "lighthouse", kind: "lighthouse", x: -27, z: -45, r: 4 },
  { id: "picnic", kind: "picnic", x: 29, z: 41, r: 5 },
  { id: "palm", kind: "palm", x: -57, z: -17, r: 4 },
  { id: "rock", kind: "rock", x: 70, z: -20, r: 3.5 },
  { id: "loop", kind: "loop", x: 62, z: -46, r: 9 },
  { id: "mouse", kind: "mouse", x: -64, z: -44, r: 8.5 },
  { id: "fair", kind: "fair", x: 60, z: 36, r: 10 },
];
export const ENGINE_ISLETS = ["coaster", "lighthouse", "picnic", "palm", "rock"];
// 纜車（Paul 2026-11-18：「a gondola over the whole island from airport all the way to curriculum」）：
// 機場平台上的站 → 水上的塔（機場與 Marketing／Community Relations 之間）→ 聚會所東邊的塔 → 聚會所與 Curriculum 之間水上的塔 → Curriculum 北緣的塔 → Curriculum 旁水上架高的站。
// 站與塔都在 11 公尺高，廂吊在纜繩下 2.6 公尺，比島上任何一棟房子都高。stilts 是哪幾站架在水上的柱子上。
export const GONDOLA = { pts: [[53, 6.5], [31, -1], [8, -3], [-9, 10], [-22.5, 22], [-30, 26]], h: 11, stilts: [5], speed: 1.5, cabins: 12 };
// 渡輪：在島群南邊的水道來回，兩頭各一座浮動碼頭。
export const FERRY = { a: [-45, 50], b: [40, 50] };
// 橋的樣式（0 木板、1 石拱、2 紅漆拱、3 繩索、4 滑水道）。
// Paul 2026-11-18：「the water slide should be only at the commons」：滑水道只在聚會所那六條輻條上（三條滑水道三條別的輪流），外圍的環與機場的橋不用。
export function bridgeStyle(br, i) { if (br.a === "commons" || br.b === "commons") return i % 2 === 0 ? 4 : [0, 1, 2][Math.floor(i / 2) % 3]; return [0, 1, 2, 3][i % 4]; }
export function cameraIsland(island, phone) {
  const d = phone ? 38 : 32; const ux = island.x || 0, uz = island.z || 1; const n = Math.hypot(ux, uz) || 1;
  // 機場的平台是 24.7 × 19，鏡頭要退遠、再俯一點，跑道（在後半）才進得來。
  if (island.sea) { const D = d * 1.6; return { pos: [island.x + (ux / n) * D * 0.1, D * 1.0, island.z + D * 0.5], target: [island.x, 0.5, island.z - 2] }; }
  return { pos: [island.x + (ux / n) * d * 0.25, d * 0.78, island.z + d * 0.62 + (uz / n) * d * 0.1], target: [island.x, 0.8, island.z - 1] };
}
export function cameraBird(phone) { const d = phone ? 135 : 118; return { pos: [0, d, 0.01], target: [0, 0, 0], fit: [70, 70] }; }
