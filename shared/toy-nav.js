// 玩具島引擎的純數學那一半（2026-11-17 跟 shared/toy.js 一起從 island/src/layout.js 抽出來）：人在島上走路的那幾條算式。
// 沒有 DOM、沒有 Three，測試直接 import。toy.js（Three 那一半）不 import 這支：頁面把這裡的函式用參數交給引擎的 motion(nav)。
// /island/ 的 layout.js 與 /history/ 的 road.js 都用它；兩頁各自只管「島在哪」，「怎麼繞開東西」在這裡只有一份。
export const TAU = Math.PI * 2;
export function mulberry(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// 人在島上走：隨機一個目標點，在島上、不在建築的 2.2 公尺內、不在邊緣 1.5 公尺內。
// blockers 是世界座標的圓 { x, z, r }（房子、桌椅、樹）。目標點不可以落在任何一個圓裡。
// island 是 { x, z, r, sea? }：機場（sea）是長方形的平台（跑道在後半），人只在前面那一條（z 3 到 8.5）走；島是圓的範圍。
export function wanderTarget(island, blockers, rnd) {
  for (let i = 0; i < 40; i++) {
    let x, z;
    if (island.sea) { x = island.x + (rnd() - 0.5) * 22; z = island.z + 3 + rnd() * 5.5; }
    else { const a = rnd() * TAU, d = Math.sqrt(rnd()) * (island.r - 2.0); x = island.x + Math.cos(a) * d; z = island.z + Math.sin(a) * d; }
    if ((blockers || []).some(b => Math.hypot(x - b.x, z - b.z) < (b.r || 1.2) + 0.6)) continue;
    return { x, z };
  }
  return { x: island.x, z: island.z + 2 };
}
// 從 a 走到 b 不穿過任何一個圓（Paul 2026-11-17：「people are walking inside the building」）。
// 回要經過的點（不含 a，含 b）。做法：這一段線碰到哪個圓，就在最靠近圓心的那一點往外推一個點，兩段再各自檢查一次，最多拆幾層。
// 2026-11-17 第九次：之前一條路會拆成三四十個點（每繞一個矮樹就再拆），人就一直在走。現在只繞大東西（半徑 0.6 以上；矮樹、燈每一幀往外推就夠）、
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
  let hit = null, hitT = 0;
  for (const c of list) { const R = (c.r || 1.2) + 0.5; const tt = Math.max(0, Math.min(1, ((c.x - a.x) * dx + (c.z - a.z) * dz) / (len * len))); const px = a.x + dx * tt, pz = a.z + dz * tt; const dd = Math.hypot(px - c.x, pz - c.z);
    if (dd < R && tt > 0.02 && tt < 0.98 && (!hit || tt < hitT)) { hit = c; hitT = tt; } }
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
// 一條橋：從 A 的邊緣到 B 的邊緣（各留 0.6 在島裡）。a、b 是兩端的 id，人沿橋走的時候用。
export function edge(A, B) { const dx = B.x - A.x, dz = B.z - A.z, d = Math.hypot(dx, dz), ux = dx / d, uz = dz / d; return { a: A.id, b: B.id, x0: A.x + ux * (A.r - 0.6), z0: A.z + uz * (A.r - 0.6), x1: B.x - ux * (B.r - 0.6), z1: B.z - uz * (B.r - 0.6) }; }
// 最少幾座橋（寬度優先）。bridges 是 edge() 的陣列。回 id 的陣列，含起點與終點；同一座回 [from]。
export function route(from, to, bridges) {
  if (from === to) return [from];
  const adj = new Map(); for (const e of bridges) { (adj.get(e.a) || adj.set(e.a, []).get(e.a)).push(e.b); (adj.get(e.b) || adj.set(e.b, []).get(e.b)).push(e.a); }
  const prev = new Map([[from, null]]), q = [from];
  while (q.length) { const cur = q.shift(); if (cur === to) break; for (const n of adj.get(cur) || []) if (!prev.has(n)) { prev.set(n, cur); q.push(n); } }
  if (!prev.has(to)) return [from];
  const path = []; for (let c = to; c; c = prev.get(c)) path.unshift(c); return path;
}
// 一條路線攤成一串要走過的點：每座島的中心、橋的兩端（motion() 的 travel 照「島心、橋頭、橋尾」三個一組讀）。
export function routePoints(ids, islandOf, bridges) {
  const pts = [];
  for (let i = 0; i < ids.length; i++) { const isl = islandOf(ids[i]); if (i > 0) { const A = islandOf(ids[i - 1]); const e = bridges.find(b => (b.a === A.id && b.b === isl.id) || (b.a === isl.id && b.b === A.id)); const flip = e && e.a !== A.id; pts.push(flip ? [e.x1, e.z1] : [e.x0, e.z0], flip ? [e.x0, e.z0] : [e.x1, e.z1]); } pts.push([isl.x, isl.z]); }
  return pts;
}
