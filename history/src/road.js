// /history/ 的版面（2026-11-17 換骨：路改成跟 BT 島同一套做法）：一條彎彎的路在海上，從機場出發，一站一座小島，最後一座是「今天」。
// 純數學，沒有 DOM、沒有 Three，測試直接算。站不管幾個都照這裡排（站數變了路自己重排，程式不用改）。
// 單位公尺，y 朝上；路大致往 +x 走，z 方向彎三四個彎；鏡頭在 +z 那一側看過去。
import { TAU, mulberry, wanderTarget as wander, detour as detourNav, edge, route as routeNav, routePoints as routePointsNav } from "../../shared/toy-nav.js";
export { TAU };
export const SPACING = 21;        // 相鄰兩座的距離（島心到島心，沿路算）；島半徑 7.5，水道就 4 到 6 公尺，橋跟島那一頁一樣短
export const AMP = 13;            // 路左右彎多遠
export const AIRPORT_R = 9.5, STATION_R = 7.5, STATION_R_PHOTO = 8.5, END_R = 6;

// 一條路：n 站。回 { n, nodes, stations, airport, end, bridges, path, pathLen, pointAt(p), tangentAt(p) }。
// nodes 是機場、每一站、今天那座，照順序；每一座 { id, i（站的序號，機場 -1、今天 n）, x, z, r, p（在整條路上的位置 0 到 1）, angle（朝外的方向，放擺設用）, sea?, end? }。
// hasPhoto[i] 是 true 的站大一點（放得下照片牆）。
export function world(n, hasPhoto) {
  const N = Math.max(0, n | 0) + 2;                          // 機場 + n 站 + 今天
  const rr = mulberry(7 + N);
  // 密的折線：x 一直往前，z 走 sin；每一座落在等弧長的位置上。
  const L = (N - 1) * SPACING * 0.92, waves = Math.max(1, (N - 1) / 3.2);
  const dense = []; const K = 400;
  for (let k = 0; k <= K; k++) { const t = k / K; dense.push([t * L, Math.sin(t * waves * TAU * 0.5 + 0.4) * AMP]); }
  const cum = [0]; for (let k = 1; k < dense.length; k++) cum.push(cum[k - 1] + Math.hypot(dense[k][0] - dense[k - 1][0], dense[k][1] - dense[k - 1][1]));
  const total = cum[cum.length - 1];
  const at = s => { const d = Math.max(0, Math.min(total, s)); let k = 1; while (k < cum.length - 1 && cum[k] < d) k++; const f = cum[k] === cum[k - 1] ? 0 : (d - cum[k - 1]) / (cum[k] - cum[k - 1]); return [dense[k - 1][0] + (dense[k][0] - dense[k - 1][0]) * f, dense[k - 1][1] + (dense[k][1] - dense[k - 1][1]) * f]; };
  const nodes = [];
  for (let k = 0; k < N; k++) {
    const s = total * k / (N - 1); const [x, z] = at(s); const [x2, z2] = at(Math.min(total, s + 1)); const [x0, z0] = at(Math.max(0, s - 1));
    const heading = Math.atan2(z2 - z0, x2 - x0);   // 路的方向
    const i = k - 1;
    const isAir = k === 0, isEnd = k === N - 1;
    const r = isAir ? AIRPORT_R : isEnd ? END_R : (hasPhoto && hasPhoto[i] ? STATION_R_PHOTO : STATION_R);
    // 朝外的方向：垂直於路、朝鏡頭那一側（+z），擺設放那一半；做的事（場景那一棟）放另一半。
    nodes.push({ id: isAir ? "airport" : isEnd ? "end" : "s" + i, i, x: +x.toFixed(2), z: +z.toFixed(2), r, p: k / (N - 1), heading, angle: heading + Math.PI / 2, sea: isAir || undefined, end: isEnd || undefined });
  }
  // 整條路置中：x 從 -L/2 到 L/2。
  const cx = (nodes[0].x + nodes[N - 1].x) / 2; for (const nd of nodes) nd.x = +(nd.x - cx).toFixed(2);
  const path = dense.map(([x, z]) => [+(x - cx).toFixed(2), +z.toFixed(2)]);
  const bridges = []; for (let k = 1; k < N; k++) bridges.push(edge(nodes[k - 1], nodes[k]));
  const w = { n: Math.max(0, n | 0), N, nodes, stations: nodes.slice(1, N - 1), airport: nodes[0], end: nodes[N - 1], bridges, path, pathLen: total, rnd: rr };
  // 路上 0 到 1 的一點（沿著密的折線，等弧長）。
  w.pointAt = p => { const [x, z] = at(Math.max(0, Math.min(1, p)) * total); return { x: +(x - cx).toFixed(3), z: +z.toFixed(3) }; };
  w.tangentAt = p => { const a = w.pointAt(Math.max(0, p - 0.01)), b = w.pointAt(Math.min(1, p + 0.01)); return Math.atan2(b.z - a.z, b.x - a.x); };
  return w;
}
export const nodeOf = (w, id) => w.nodes.find(nd => nd.id === id) || null;

// 站 i 在路上的位置（0 到 1）；最近的那一站（機場那頭算第一站、今天那頭算最後一站）。
export const progressFor = (w, i) => w.N < 2 ? 0 : (i + 1) / (w.N - 1);
export function nearest(w, p) { if (!w.n) return -1; const k = Math.round(Math.max(0, Math.min(1, p)) * (w.N - 1)); return Math.max(0, Math.min(w.n - 1, k - 1)); }
// 離最近一站多近（1 正在那一站、0 在兩站中間）。
export function closeness(w, p) { if (w.N < 2) return 1; const q = p * (w.N - 1); return 1 - Math.min(1, Math.abs(q - Math.round(q)) * 2); }

// 鏡頭：跟著路走。target 是路上那一點（往 -z 一點，島的場景在路的那一側），pos 在它的右前上方，方向固定（路在鏡頭底下滑過去，不轉頭）。
// 到了一站（closeness 高）就靠近一點。
export function cameraAt(w, p, phone) {
  const q = w.pointAt(p); const near = closeness(w, p);
  const d = (phone ? 46 : 40) - near * (phone ? 7 : 6);
  return { pos: [q.x + d * 0.35, d * 0.78, q.z + d * 0.72], target: [q.x, 0.6, q.z - 1.5] };
}
// 全景：整條路都要進來（手機上太長，就只看前半）。
export function cameraOverview(w, phone) {
  const xs = w.nodes.map(nd => nd.x), zs = w.nodes.map(nd => nd.z); const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cz = (Math.min(...zs) + Math.max(...zs)) / 2;
  const half = (Math.max(...xs) - Math.min(...xs)) / 2 + 14;
  return { pos: [cx, 90, cz + 70], target: [cx, 0, cz], fit: [half, Math.max(30, (Math.max(...zs) - Math.min(...zs)) / 2 + 22)] };
}

// 代號對場景（跟 data.js 的 motifFor 同一組代號）：每一站畫哪一棟、哪一套擺設、哪一種地面。認不出來（signpost）就是路標加廣場。
export const MOTIF_SCENE = {
  seven:    { kind: "home",  scenery: "garden",    ground: "lawn" },
  seats:    { kind: "hall",  scenery: "garden",    ground: "grass" },
  board:    { kind: "booth", scenery: "plaza",     ground: "paving" },
  sign:     { kind: "stage", scenery: "square",    ground: "tiles" },
  boarding: { kind: "tent",  scenery: "classroom", ground: "patch" },
  tail:     { kind: "pier",  scenery: "square",    ground: "checker" },
  crew:     { kind: "tower", scenery: "studio",    ground: "brick" },
  signpost: { kind: "post",  scenery: "plaza",     ground: "grid" },
};
export const sceneFor = motif => MOTIF_SCENE[motif] || MOTIF_SCENE.signpost;

// 路邊的裝飾小島（跟島那一頁同一組：雲霄飛車、燈塔、野餐、棕櫚、礁石），放在路的兩側、離每一座至少 14 公尺。站少就少放。
export function islets(w) {
  const kinds = [["coaster", 7.5], ["lighthouse", 4], ["picnic", 5], ["palm", 4], ["rock", 3.5], ["palm", 4], ["picnic", 5]];
  const out = []; const want = Math.min(kinds.length, Math.max(2, w.N - 1));
  const rr = mulberry(31 + w.N);
  for (let k = 0; k < want; k++) {
    const [kind, r] = kinds[k];
    for (let tries = 0; tries < 40; tries++) {
      const p = (k + 0.5 + (rr() - 0.5) * 0.6) / want; const q = w.pointAt(p); const side = k % 2 ? 1 : -1; const off = 26 + rr() * 12;
      const x = q.x + (rr() - 0.5) * 10, z = q.z + side * off;
      if (w.nodes.every(nd => Math.hypot(x - nd.x, z - nd.z) > nd.r + r + 6) && out.every(o => Math.hypot(x - o.x, z - o.z) > o.r + r + 6)) { out.push({ id: kind + k, kind, x: +x.toFixed(1), z: +z.toFixed(1), r }); break; }
    }
  }
  return out;
}

// 人：每一站兩三個範例的人（沒有名字，角色而已），機場三個。code 只是序號，牌子不顯示。
export function people(w) {
  const out = []; const roles = ["student", "associate", "director", "advisor"];
  w.stations.forEach((st, i) => { const n = 2 + (i % 2); for (let k = 0; k < n; k++) out.push({ code: st.id + "-" + k, team: st.id, role: roles[(i + k) % roles.length], goes: k === 0 && i + 1 < w.n ? "s" + (i + 1) : (k === 1 && i > 0 ? "s" + (i - 1) : "") }); });
  for (let k = 0; k < 3; k++) out.push({ code: "airport-" + k, team: "airport", role: k ? "student" : "advisor", goes: w.n ? "s0" : "" });
  if (w.n) out.push({ code: "end-0", team: "end", role: "associate", goes: "s" + (w.n - 1) });
  return out;
}

// 導航（交給引擎的 motion(nav)）：哪座島、怎麼繞、橋怎麼走。
export function nav(w, blockersOf, poisOf) {
  return {
    islandOf: id => nodeOf(w, id),
    wanderTarget: wander, detour: detourNav,
    route: (a, b) => routeNav(a, b, w.bridges),
    routePoints: ids => routePointsNav(ids, id => nodeOf(w, id), w.bridges),
    blockersOf, poisOf,
  };
}
export { wander as wanderTarget, detourNav as detour };

// 走哪一條：沒開減少動態效果、沒有 ?motion=off、WebGL 開得出來、Three 載到了，才走 3D；少一樣就直立時間軸。這一頁沒有 GSAP 了。
export function pickMode({ reduce, motionOff, webgl, three }) { return (!reduce && !motionOff && webgl && three) ? "3d" : "list"; }
