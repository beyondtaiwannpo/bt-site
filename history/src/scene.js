// /history/ 的 3D 場景（2026-11-17 換骨）：一條路在海上，用 shared/toy.js 那一套畫（跟 BT 島同一個引擎：圓角盒子、七色、小人、橋、滑水道、機場、裝飾小島）。
// 這裡只管「這條路長什麼樣」：機場在起點、一站一座小島（road.js 算位置）、每站一棟那一年的小場景（代號對 road.js 的 MOTIF_SCENE）、年份路標、照片牆、
// 最後一座「今天」；人在站上做事、沿路走、坐滑水道；飛機從機場起飛沿整條路飛到底再回來。
//
// ── 守的四件事 ──
// 1. 資料與場景分開：站的字一個都不在這裡。年份、照片網址、結尾那一句，全部 main.js 用參數丟進來。
// 2. Three 只有 shared/toy.js 與這一支 import。載不到整支載不進來，main.js 接住走直立時間軸。
// 3. 會動的東西全部在引擎的 motion() 裡；開了減少動態效果 main.js 不呼叫它。
// 4. 顏色七色進來混色出去，這裡沒有色碼。
import * as THREE from "three";
import * as T from "../../shared/toy.js";
import * as R from "./road.js";

export const webglOK = T.webglOK;
const BRIDGE_STYLE = [0, 1, 4, 2, 3, 1, 4, 0, 2, 4, 3, 1];

// stage 放畫布、pins 放牌子；w 是 road.world()；motifs 每站的代號；photos 每站有同意的照片網址（最多兩張）；years 每站的年份字；
// endText 是結尾那塊牌子的兩行字；backLink 是「回 BT 島」那顆牌子 { href, label }；onSelect(i) 點了站 i；onScrub(delta) 滾輪或拖曳要走路。
export function create({ stage, pins, palette, phone, w, motifs, photos, years, endText, backLink, onSelect, onScrub }) {
  const E = T.createEngine({ stage, pins, palette, phone, onSelect: sel => { if (sel && sel.kind === "station" && onSelect) onSelect(sel.i); }, onHover: () => {}, seed: 23 });
  const { M, P, rnd, pickables } = E;
  const blockersOf = new Map(), poisOf = new Map(); const nodeObjs = new Map(); const boardsOf = [];
  let airportG = null;

  for (const nd of w.nodes) {
    const g = new THREE.Group(); g.position.set(nd.x, 0, nd.z); E.world.add(g);
    const fa = nd.angle; const blockers = []; const pois = [];
    if (nd.sea) {
      // 起點：海上的機場（跟島那一頁同一座）。跑道在平台後半，人只在前面那一條走。
      const { deck } = E.platform(g, nd.r); void deck;
      const b = E.building("airport", M.teal); b.position.set(0, 0, -2.0); g.add(b); airportG = b;
      for (const eb of (b.userData.blockers || [])) blockers.push({ x: eb.x, z: eb.z - 2.0, r: eb.r });
      // 機場前面一塊「出發」的小牌子（年份是第一站的）。
      const sign = E.signboard(2.2, 1.0, M.white); sign.group.position.set(-8.5, 0, 6.0); sign.group.rotation.y = 0.3; g.add(sign.group); blockers.push({ x: -8.5, z: 6.0, r: 1.2 });
      sign.face.material = E.textPlane(2.2, 1.0, [years && years[0] ? "→ " + years[0] : "→"], { bg: P.white, fg: P.navy }).material;
    } else if (nd.end) {
      // 終點：「今天」那座小島。一支旗、一塊牌子（兩行字從 main.js 來）、一棟聚會所、長凳。
      const top = E.landmass(g, { shape: "round", r: nd.r, prism: T.roundPrism, top: E.groundMat("lawn") }); void top;
      E.flagpole(g, Math.cos(fa) * 3.2, Math.sin(fa) * 3.2, M.light); blockers.push({ x: Math.cos(fa) * 3.2, z: Math.sin(fa) * 3.2, r: 0.6 });
      const sb = E.signboard(3.2, 1.5, M.orange); sb.group.position.set(Math.cos(fa + Math.PI) * 2.2, 0, Math.sin(fa + Math.PI) * 2.2); sb.group.rotation.y = -fa + Math.PI / 2; g.add(sb.group); blockers.push({ x: sb.group.position.x, z: sb.group.position.z, r: 1.7 });
      if (endText && endText.length) sb.face.material = E.textPlane(3.2, 1.5, endText, { bg: P.cream, fg: P.navy }).material;
      for (const da of [1.1, -1.1]) { const b = E.bench(); const px = Math.cos(fa + da) * 3.6, pz = Math.sin(fa + da) * 3.6; b.position.set(px, 0, pz); b.rotation.y = -(fa + da) + Math.PI / 2; b.traverse(m => { if (m.isMesh) m.castShadow = true; }); g.add(b); blockers.push({ x: px, z: pz, r: 1.0 }); pois.push({ x: px + Math.sin(b.rotation.y) * 0.35, z: pz + Math.cos(b.rotation.y) * 0.35, face: b.rotation.y, kind: "bench" }); }
      for (let i = 0; i < 4; i++) { const a = fa + Math.PI + (i - 1.5) * 0.5; E.treePlaces.push([nd.x + Math.cos(a) * (nd.r - 1.8), nd.z + Math.sin(a) * (nd.r - 1.8), 1.0 + (i % 2) * 0.3, i % 3]); }
      if (backLink) { const a = document.createElement("a"); a.className = "pin pin-back"; a.href = backLink.href; a.textContent = backLink.label; pins.appendChild(a); nodeObjs.set(nd.id, { nd, g, pin: a }); }
    } else {
      // 一站一座島：地面照那一站的場景、一棟那一年的小場景（朝路的那一側，也就是 -z 那一半）、年份路標在路邊、照片牆、每座島都有的桌椅燈樹。
      const sc = R.sceneFor(motifs[nd.i]);
      const top = E.landmass(g, { shape: "round", r: nd.r, prism: T.roundPrism, top: E.groundMat(sc.ground) });
      top.userData.sel = { kind: "station", i: nd.i }; pickables.push(top);
      const bx = Math.cos(fa + Math.PI) * nd.r * 0.42, bz = Math.sin(fa + Math.PI) * nd.r * 0.42;
      const b = E.building(sc.kind, [M.team.orange, M.team.teal, M.team.yellow, M.team.navy][nd.i % 4]); b.position.set(bx, 0, bz); b.rotation.y = Math.atan2(-bx, -bz) + Math.PI; b.scale.setScalar(1.05); g.add(b);
      blockers.push({ x: bx, z: bz, r: (T.KIND_R[sc.kind] || 3.2) * 0.9 });
      b.traverse(o => { if (o.isMesh) { o.userData.sel = { kind: "station", i: nd.i }; pickables.push(o); } });
      // 年份路標：一支木柱、一塊畫了年份的板子，立在島朝鏡頭那一側的邊上，面向鏡頭。
      const yx = Math.cos(fa) * (nd.r - 2.2), yz = Math.sin(fa) * (nd.r - 2.2);
      const post = new THREE.Mesh(T.rbox(0.18, 2.6, 0.18, 0.04), M.wood); post.position.set(yx, 1.3, yz); post.castShadow = true; g.add(post);
      const yp = E.textPlane(2.0, 0.9, [years[nd.i] || ""], { bg: P.cream, fg: P.navy }); yp.position.set(yx, 2.3, yz + 0.12); g.add(yp);
      const yb = new THREE.Mesh(T.rbox(2.2, 1.1, 0.12, 0.05), M.cream); yb.position.set(yx, 2.3, yz); yb.castShadow = true; yb.userData.sel = { kind: "station", i: nd.i }; g.add(yb); pickables.push(yb);
      blockers.push({ x: yx, z: yz, r: 0.7 });
      // 照片牆：有同意的照片才有（最多兩塊），立在路標旁邊。圖在 paintBoards 來了才貼。
      const ph = (photos && photos[nd.i]) || []; const faces = [];
      ph.slice(0, 2).forEach((u, k) => { const sb = E.signboard(1.5, 1.2, M.white); const a = fa + (k ? -0.55 : 0.55); const px = Math.cos(a) * (nd.r - 2.6), pz = Math.sin(a) * (nd.r - 2.6); sb.group.position.set(px, 0, pz); sb.group.rotation.y = -a + Math.PI / 2; g.add(sb.group); blockers.push({ x: px, z: pz, r: 1.0 }); faces.push(sb.face); pois.push({ kind: "stand", face: -a + Math.PI / 2 + Math.PI, x: px + Math.cos(a) * 1.6, z: pz + Math.sin(a) * 1.6 }); });
      boardsOf[nd.i] = { faces, urls: ph.slice(0, 2) };
      // 每座島自己的擺設（朝外那一半）與每座島都有的桌椅燈樹。島小，放不下的 furnish 自己跳過。
      E.decorate(sc.scenery, nd, g, blockers, fa, pois);
      const roadEnds = w.bridges.map(br => br.a === nd.id ? [br.x0 - nd.x, br.z0 - nd.z] : br.b === nd.id ? [br.x1 - nd.x, br.z1 - nd.z] : null).filter(Boolean);
      E.furnish(nd, g, blockers, fa, pois, roadEnds);
      E.plantTrees(nd, blockers, phone ? 4 : 7);
      const pin = E.pin("pin-station", { goStation: String(nd.i) }, true);
      nodeObjs.set(nd.id, { nd, g, pin });
    }
    poisOf.set(nd.id, pois);
    blockersOf.set(nd.id, blockers.map(b => ({ x: nd.x + b.x, z: nd.z + b.z, r: b.r || 1.2 })));
  }
  // 橋：五種輪流，滑水道隔幾條一條。
  w.bridges.forEach((br, bi) => E.bridge(br, BRIDGE_STYLE[bi % BRIDGE_STYLE.length]));
  // 路邊的裝飾小島、小船、熱氣球、雲。
  const islets = R.islets(w); for (const it of islets) E.islet(it);
  const mid = w.pointAt(0.5);
  E.addBoats(Math.min(10, 3 + w.N), w.nodes.map(nd => ({ x: nd.x, z: nd.z, r: nd.r, pad: nd.sea ? 6 : 3 })).concat(islets.map(it => ({ x: it.x, z: it.z, r: it.r, pad: 3 }))));
  // 小船的圓心在原點；路很長，再補幾艘在路的兩頭。
  E.addBalloons(3, mid.x, mid.z); E.addClouds(10, mid.x, mid.z);
  E.flushInstances();
  // 飛機繞的那一段：沿整條路飛到「今天」再飛回來（本地座標 = 世界座標減機場那一棟的位置）。
  for (const pl of E.planes) { const fl = pl.userData.flight; if (!fl) continue; const ax = w.airport.x, az = w.airport.z - 2.0;
    fl.tour = (k, v) => { const f = k < 0.5 ? k * 2 : 2 - k * 2; const q = w.pointAt(0.04 + f * 0.96); v.set(q.x - ax, 14 + Math.sin(k * Math.PI * 4) * 0.8, q.z - az); }; }

  // 人：每站兩三個，機場三個。沒有名字，牌子永遠藏著。
  const walkers = E.walkers;
  for (const p of R.people(w)) { const isl = R.nodeOf(w, p.team); E.addWalker(p, { isl, start: R.wanderTarget(isl, blockersOf.get(p.team), rnd) }); }
  E.placePins = () => { for (const wk of walkers) E.setHidden(wk.pin, true); for (const o of nodeObjs.values()) if (o.pin) E.putPin(o.pin, E.project(o.nd.x, o.nd.end ? 6.5 : 7.0, o.nd.z)); };

  // 鏡頭：滾輪與拖曳不是縮放與繞轉，是沿路走（main.js 管進度，這裡只回報）。兩指縮放照引擎預設。
  E.onWheel = dy => { if (onScrub) onScrub(dy / 2600); };   // 一格滾輪約 100px：十格走三站
  E.onDrag = (dx, dy) => { if (onScrub) onScrub(-(dy + dx * 0.4) / 1400); };
  let shadowAt = null;
  function aim(p, snap) {
    E.setGoal(R.cameraAt(w, p, phone));
    // 太陽的影子只蓋 ±52 公尺：鏡頭走遠了就把影子搬過去（換一次重畫一次陰影貼圖，不是每一幀）。
    const q = w.pointAt(p); if (!shadowAt || Math.hypot(q.x - shadowAt.x, q.z - shadowAt.z) > 25) { shadowAt = q; E.sun.position.set(q.x - 40, 70, q.z + 30); E.sun.target.position.set(q.x, 0, q.z); E.sun.target.updateMatrixWorld(); E.dirty(); }
    if (snap || !E.motionOn) E.snapCam();
  }
  E.resize(); aim(0, true);
  for (const o of nodeObjs.values()) if (o.pin && o.pin.tagName !== "A") o.pin.hidden = true;

  const api = {
    // 進度 0 到 1（main.js 每一幀餵平滑過的那一個）。
    at(p) { aim(p); },
    // 站 i 的錨點投到畫面上（卡貼在這裡）。
    anchor(i) { const st = w.stations[i]; if (!st) return { visible: false }; return E.project(st.x + Math.cos(st.angle) * (st.r - 2.2), 3.4, st.z + Math.sin(st.angle) * (st.r - 2.2)); },
    overview(snap) { E.setGoal(R.cameraOverview(w, phone)); if (snap || !E.motionOn) E.snapCam(); },
    // 照片牆：每一站的圖貼上去（載不到留白板）。
    paintPhotos() { boardsOf.forEach(b => { if (b && b.faces.length) E.paintBoards(b.urls, b.faces); }); },
    labels({ back }) { for (const o of nodeObjs.values()) if (o.pin && o.pin.tagName === "A" && back) o.pin.textContent = back; },
    render: () => E.render(0),
    _E: E, _w: w,
    debug: () => E.debugWalkers(),
    motion(tickExtra) { return E.motion(R.nav(w, blockersOf, poisOf), tickExtra); },
  };
  void airportG;
  return api;
}
