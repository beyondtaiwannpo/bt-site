// /island/ 第三批的地標與味道（2026-11-18 Paul 第三次「More detail first」：要好看、要活，不是塞滿）。
// 這一支管陸上與天上看得到的東西：觀景塔（玻璃電梯會上下、頂上有人有旗）、會轉的風車、冒煙的溫泉（兩個人泡著）、兩種新的樹（三顆球的圓樹冠、奶油橘的櫻花樹，
// 換掉既有三分之一的樹）、台灣味（小店旁一排停著的機車、一台在島緣繞圈的機車、聚會所一串紅橘燈籠、一支夜市招牌）、高一層更小的雲、繞著雲霄飛車小島轉的滑翔翼、
// 機場塔台上會轉的信標、沿著服務車道跑的三列行李拖車。
// 跟 town.js 一樣的規矩：不 import three、不 import toy.js，THREE 跟引擎 E 從 scene.js 傳進來；放在島上的東西記進 blockersOf、找位置用 town.js 露出來的 E.townSpots（rectFree、fell）；
// 會動的標 userData.dynamic；重複的小東西一次畫完（water.js 的 makeInstancer）。要在 E.flushInstances() 之前建（樹是在那裡畫的，這裡先把三分之一換掉）。
import { makeInstancer } from "./water.js";
export function buildSights(THREE, E, c) {
  const { M, P, world, rbox, makePerson } = E;
  const { islands, blockersOf, lifePlaces, airport, glider: GL, cartLoop: CL } = c;
  const TAU = Math.PI * 2, ticks = [], spots = E.townSpots;
  const mesh = (geo, m, x, y, z, shadow) => { const o = new THREE.Mesh(geo, m); o.position.set(x || 0, y || 0, z || 0); o.castShadow = shadow !== false; o.receiveShadow = true; return o; };
  const std = (color, extra) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, ...(extra || {}) });
  const mix = (a, b, t) => a.clone().lerp(b, t);
  const smooth = k => { k = Math.max(0, Math.min(1, k)); return k * k * (3 - 2 * k); };
  const instancer = makeInstancer(THREE, world);
  const person = (parent, x, z, ry, o) => { const pp = makePerson({ scale: 1.1, ...(o || {}) }); pp.position.set(x, 0, z); pp.rotation.y = ry; parent.add(pp); return pp; };
  const sit = (pp, y) => { const p = pp.userData.parts; p.legL.rotation.x = -1.4; p.legR.rotation.x = -1.4; p.armL.rotation.x = -0.6; p.armR.rotation.x = -0.6; pp.position.y = y == null ? 0.2 : y; return pp; };
  const stats = { trees: { round: 0, blossom: 0 }, tower: "", windmill: "", hotspring: "", scooters: 0, scootersAt: {}, rider: "", lanterns: 0, sign: "", clouds: 0, glider: false, beacon: false, carts: 0, at: {} }; E.sightStats = stats;   // 除錯：__island._E.sightStats
  // 這一支共用的兩個「一次畫完」：單位大小的盒子（每一個自己的大小與顏色：機車、燈籠的蓋子、車道的虛線）與單位圓柱（輪子）。會動的行李拖車另外兩個。
  const boxGeo = new THREE.BoxGeometry(1, 1, 1), wheelGeo = new THREE.CylinderGeometry(0.5, 0.5, 1, 10); wheelGeo.rotateX(Math.PI / 2);
  const whiteM = () => new THREE.MeshStandardMaterial({ color: P.white, roughness: 0.8 });
  const boxes = instancer(boxGeo, whiteM(), 600, false, true), wheels = instancer(wheelGeo, M.dark, 160, false, false);
  const put = (T, obj, x, z, ry, r) => { obj.position.set(x, 0, z); if (ry != null) obj.rotation.y = ry; T.g.add(obj); T.blockers.push({ x: T.isl.x + x, z: T.isl.z + z, r: r || 1.2 }); obj.traverse(m => { if (m.isMesh) m.castShadow = true; }); stats.at[T.isl.id + ":" + (r || 1.2)] = [Math.round((T.isl.x + x) * 10) / 10, Math.round((T.isl.z + z) * 10) / 10]; return obj; };
  // 幾個幾何黏成一個（雲的四顆球）：只收有 index 的幾何、只縮放不旋轉。
  const mergeGeos = parts => { const pos = [], nor = [], idx = []; let off = 0; for (const [g, x, y, z, s] of parts) { const p = g.attributes.position, n = g.attributes.normal; for (let i = 0; i < p.count; i++) { pos.push(p.getX(i) * s + x, p.getY(i) * s + y, p.getZ(i) * s + z); nor.push(n.getX(i), n.getY(i), n.getZ(i)); } for (let i = 0; i < g.index.count; i++) idx.push(g.index.getX(i) + off); off += p.count; } const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3)); geo.setIndex(idx); return geo; };

  // ═══ 1. 樹：既有的樹（引擎 treePlaces，還沒畫）每六棵抽兩棵換掉：一棵圓樹冠（三顆深淺不同的綠球疊起來）、一棵櫻花樹（四顆奶油橘的球）。樹幹比原來的高一點。═══
  {
    const sph = instancer(new THREE.SphereGeometry(1, 10, 8), whiteM(), 700, false, true), trunks = instancer(new THREE.CylinderGeometry(0.09, 0.14, 1, 6), M.trunk, 180, false, true);
    const pink = [mix(mix(P.cream, P.orange, 0.3), P.white, 0.4), mix(mix(P.cream, P.orange, 0.42), P.white, 0.3), mix(mix(P.cream, P.orange, 0.2), P.white, 0.5)];
    const tp = E.treePlaces;
    for (let i = tp.length - 1; i >= 0; i--) {
      const kind = i % 6 === 1 ? "round" : i % 6 === 4 ? "blossom" : ""; if (!kind) continue;
      const [x, z, sc] = tp[i]; tp.splice(i, 1); stats.trees[kind]++;
      trunks.add(x, 0.7 * sc, z, sc, 1.4 * sc, sc, i * 0.7);
      const balls = kind === "round" ? [[0, 1.55, 0, 0.78, P.tree[0]], [0.42, 1.3, 0.22, 0.6, P.tree[1]], [-0.4, 1.35, -0.26, 0.55, P.tree[2]], [0.05, 1.2, 0.45, 0.42, P.tree[1]]]
        : [[0, 1.45, 0, 0.7, pink[0]], [0.5, 1.3, 0.1, 0.5, pink[1]], [-0.45, 1.25, -0.2, 0.5, pink[2]], [0.1, 1.1, 0.5, 0.42, pink[1]], [-0.1, 1.15, -0.5, 0.4, pink[0]]];
      for (const [bx, by, bz, br, col] of balls) sph.add(x + bx * sc, by * sc, z + bz * sc, br * sc, br * sc, br * sc, 0, col);
    }
    sph.flush(); trunks.flush();
  }

  // ═══ 2. 觀景塔：聚會所有 3.2 公尺見方又離纜車線 4.5 公尺以上的位置就放聚會所，沒有就放機場平台東邊的角落（2026-11-18 的實測是沒有：聚會所早就滿了）。═══
  // 四支往內收的腳、中間一根柱、兩圈橫撐、頂上一個圓的觀景台（欄杆、錐形屋頂、信標、小旗子會飄）、一個玻璃電梯廂沿柱子上下（裡面一個人）、台上三個人、底下兩個排隊的。
  {
    const H = 9.6; let site = null;
    const T = spots && spots.get("commons");
    if (T) { const cab = (x, z) => { const [ax, az, bx, bz] = [8, -3, -9, 10]; const dx = bx - ax, dz = bz - az; const tt = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz))); return Math.hypot(x - (ax + dx * tt), z - (az + dz * tt)); };
      for (let i = 0; i < 400 && !site; i++) { const a = T.rr() * TAU, d = T.isl.r * T.rr() * 0.7; const x = Math.cos(a) * d, z = Math.sin(a) * d; if (cab(x, z) >= 4.5 && T.rectFree(x, z, 0, 1.6, 1.6, 0.3, true)) { T.fell(x, z, 0, 1.6, 1.6); site = { parent: T.g, x, z, id: "commons", bl: T.blockers, wx: T.isl.x + x, wz: T.isl.z + z }; } } }
    if (!site && c.fair) { const f = c.fair; site = { parent: world, x: f.x - 6, z: f.z - 4, id: "fair", bl: [], wx: f.x - 6, wz: f.z - 4 }; }   // 批 D：聚會所放不下就去遊樂小島（之前落在機場跑道的延長線上）
    if (site) {
      stats.tower = site.id; const tw = new THREE.Group(); tw.position.set(site.x, 0, site.z); site.parent.add(tw); site.bl.push({ x: site.wx, z: site.wz, r: 1.9 });
      tw.add(mesh(new THREE.CylinderGeometry(2.0, 2.1, 0.16, 20), std(mix(P.cream, P.grey, 0.25)), 0, 0.08, 0, false), mesh(new THREE.CylinderGeometry(0.3, 0.36, H, 10), M.wall, 0, H / 2, 0));
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const x0 = sx * 1.4, z0 = sz * 1.4, x1 = sx * 0.7, z1 = sz * 0.7; const len = Math.hypot(x1 - x0, H, z1 - z0); const leg = mesh(new THREE.CylinderGeometry(0.07, 0.11, len, 6), M.dark, (x0 + x1) / 2, H / 2, (z0 + z1) / 2); leg.rotation.z = -Math.atan2(x1 - x0, H); leg.rotation.x = Math.atan2(z1 - z0, H); tw.add(leg); }
      for (const y of [3.2, 6.4]) { const r = 1.4 - 0.7 * y / H; tw.add(mesh(new THREE.TorusGeometry(r * 1.3, 0.045, 5, 16), M.dark, 0, y, 0, false).rotateX(Math.PI / 2)); }
      tw.add(mesh(new THREE.CylinderGeometry(2.3, 2.1, 0.35, 20), M.cream, 0, H + 0.1, 0), mesh(new THREE.CylinderGeometry(2.2, 2.2, 0.06, 20), E.groundMat("checker"), 0, H + 0.3, 0, false), mesh(new THREE.TorusGeometry(2.15, 0.04, 5, 24), M.dark, 0, H + 1.25, 0, false).rotateX(Math.PI / 2));
      for (let k = 0; k < 14; k++) { const a = k / 14 * TAU; tw.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.0, 5), M.dark, Math.cos(a) * 2.15, H + 0.8, Math.sin(a) * 2.15, false)); }
      for (let k = 0; k < 4; k++) { const a = k / 4 * TAU + 0.4; tw.add(mesh(new THREE.CylinderGeometry(0.06, 0.07, 2.6, 6), M.cream, Math.cos(a) * 1.9, H + 1.6, Math.sin(a) * 1.9, false)); }
      tw.add(mesh(new THREE.ConeGeometry(2.6, 1.3, 20), M.orange, 0, H + 3.4, 0), mesh(new THREE.CylinderGeometry(0.04, 0.05, 1.4, 5), M.dark, 0, H + 4.7, 0, false), mesh(new THREE.SphereGeometry(0.16, 8, 6), M.amber, 0, H + 4.1, 0, false));
      const flag = mesh(rbox(0.7, 0.42, 0.03, 0.01), M.teal, 0.38, H + 5.1, 0, false); flag.userData.dynamic = true; tw.add(flag);
      // 電梯：玻璃廂（透明）加深色的框與底，沿柱子從 0.7 到 H 減 0.9，上去停兩秒再下來。裡面一個人（跟著廂走）。
      const lift = new THREE.Group(); lift.userData.dynamic = true; lift.position.set(0.75, 0.7, 0); tw.add(lift);
      lift.add(mesh(rbox(0.9, 1.5, 0.9, 0.04), new THREE.MeshStandardMaterial({ color: P.shallow, transparent: true, opacity: 0.35, roughness: 0.2 }), 0, 0.8, 0, false), mesh(rbox(0.95, 0.1, 0.95, 0.02), M.dark, 0, 0.05, 0, false), mesh(rbox(0.95, 0.08, 0.95, 0.02), M.dark, 0, 1.58, 0, false));
      for (const [ox, oz] of [[-0.45, -0.45], [0.45, -0.45], [-0.45, 0.45], [0.45, 0.45]]) lift.add(mesh(rbox(0.05, 1.5, 0.05, 0.01), M.dark, ox, 0.8, oz, false));
      const rider = person(lift, 0, 0.1, 0.9, { shirt: 2, scale: 0.9, pack: true }); rider.position.y = 0.1;
      [[1.3, 0.4, Math.PI / 2, 0], [-0.6, 1.3, 0, 3], [-1.0, -1.0, -2.4, 5]].forEach(([x, z, ry, sh], k) => { const pp = person(tw, x, z, ry, { shirt: sh, hat: k === 1, scale: 1.0 }); pp.position.y = H + 0.33; pp.userData.parts.armR.rotation.x = k === 0 ? -1.9 : -0.3; });
      [[1.6, 1.2, 0.8, 1], [1.9, 1.9, 0.6, 4]].forEach(([x, z, ry, sh], k) => person(tw, x, z, ry, { shirt: sh, bag: k === 0 }));
      let dir = 1, y = 0.7, hold = 0;
      ticks.push((dt, t) => { if (hold > 0) hold -= dt; else { y += dir * dt * 1.1; if (y >= H - 0.9) { y = H - 0.9; dir = -1; hold = 2.5; } else if (y <= 0.7) { y = 0.7; dir = 1; hold = 3.5; } } lift.position.y = y; flag.rotation.y = Math.sin(t * 2.3) * 0.25; });
    }
  }

  // ═══ 3. 風車：圓錐塔身、門、兩扇窗、深藍的帽、四片一白一橘的葉會轉。挑一座放得下的島。═══
  for (const id of ["mentorship", "internship", "curriculum", "cr", "marketing", "sponsorship"]) {
    const T = spots && spots.get(id); if (!T) continue; const sp = T.rectSpot(1.3, 1.3, 0.4, 400, true); if (!sp) continue; stats.windmill = id;
    const wm = new THREE.Group();
    wm.add(mesh(new THREE.CylinderGeometry(0.7, 1.05, 4.2, 12), M.wall2, 0, 2.1, 0), mesh(new THREE.ConeGeometry(1.0, 1.1, 12), M.navy, 0, 4.7, 0), mesh(rbox(0.5, 0.9, 0.08, 0.04), M.dark, 0, 0.45, 1.02, false), mesh(rbox(0.4, 0.4, 0.08, 0.05), M.light, 0, 2.0, 0.92, false), mesh(rbox(0.4, 0.4, 0.08, 0.05), M.light, 0, 3.0, 0.85, false), mesh(rbox(0.6, 0.45, 0.7, 0.08), M.navy, 0, 4.1, 0.75, false));
    const rotor = new THREE.Group(); rotor.userData.dynamic = true; rotor.position.set(0, 4.1, 1.18); wm.add(rotor); rotor.add(mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.3, 8), M.dark, 0, 0, 0, false).rotateX(Math.PI / 2));
    for (let k = 0; k < 4; k++) { const b = new THREE.Group(); b.rotation.z = k * Math.PI / 2; rotor.add(b); b.add(mesh(rbox(0.1, 2.5, 0.06, 0.02), M.dark, 0, 1.3, 0, false), mesh(rbox(0.5, 2.2, 0.03, 0.01), k % 2 ? M.orange : M.white, 0.3, 1.4, 0.04, false), mesh(rbox(0.6, 0.05, 0.05, 0.01), M.dark, 0.25, 2.5, 0, false)); }
    E.mergeChildren(rotor);
    put(T, wm, sp.x, sp.z, 0, 1.6);
    ticks.push(dt => { rotor.rotation.z += dt * 0.7; });
    break;
  }

  // ═══ 4. 溫泉（台灣味）：石頭圍的圓池、池水、兩個泡著的人（只露肩膀與頭）、木桶、木牌、一盞石燈、五團蒸氣往上飄。Curriculum 或 Internship。═══
  for (const id of ["curriculum", "internship", "mentorship", "sponsorship", "marketing", "cr"]) {
    const T = spots && spots.get(id); if (!T) continue; const sp = T.rectSpot(1.9, 1.9, 0.4, 400, true); if (!sp) continue; stats.hotspring = id;
    const hs = new THREE.Group(); const rockM = std(mix(mix(P.cliff, P.navy, 0.16), P.grey, 0.1), { roughness: 0.95 });
    hs.add(mesh(new THREE.CylinderGeometry(1.55, 1.65, 0.3, 18), rockM, 0, 0.15, 0, false), mesh(new THREE.CylinderGeometry(1.42, 1.42, 0.06, 18), std(mix(mix(P.shallow, P.white, 0.35), P.teal, 0.12), { roughness: 0.15, transparent: true, opacity: 0.92 }), 0, 0.32, 0, false));
    const stones = instancer(new THREE.DodecahedronGeometry(1, 0), rockM, 24, false, true);
    for (let k = 0; k < 16; k++) { const a = k / 16 * TAU; const s = 0.22 + (k % 3) * 0.06; stones.add(T.isl.x + sp.x + Math.cos(sp.ry) * Math.cos(a) * 1.62 + Math.sin(sp.ry) * Math.sin(a) * 1.62, 0.2, T.isl.z + sp.z - Math.sin(sp.ry) * Math.cos(a) * 1.62 + Math.cos(sp.ry) * Math.sin(a) * 1.62, s, s * 0.8, s, a * 1.7); }
    stones.flush();
    for (const [x, z, ry, sh, sk] of [[-0.55, 0.3, 0.9, 1, 0], [0.6, -0.4, -2.2, 4, 2]]) { const pp = person(hs, x, z, ry, { shirt: sh, skin: sk, scale: 1.1 }); pp.position.y = -0.5; pp.userData.parts.armL.rotation.x = -1.5; pp.userData.parts.armR.rotation.x = -1.5; pp.userData.parts.armL.rotation.z = 0.9; pp.userData.parts.armR.rotation.z = -0.9; }
    hs.add(mesh(new THREE.CylinderGeometry(0.2, 0.17, 0.28, 10), M.wood, 1.75, 0.14, 0.9, false), mesh(rbox(0.5, 0.06, 0.4, 0.02), M.white, 1.6, 0.42, -1.1, false));
    const sign = new THREE.Group(); sign.position.set(-1.6, 0, -1.6); hs.add(sign); sign.add(mesh(new THREE.CylinderGeometry(0.04, 0.05, 1.5, 6), M.wood, 0, 0.75, 0, false), mesh(rbox(0.9, 0.5, 0.06, 0.03), M.wood, 0, 1.45, 0, false), mesh(rbox(0.6, 0.08, 0.02, 0.01), M.orange, 0, 1.52, 0.04, false), mesh(rbox(0.4, 0.06, 0.02, 0.01), M.cream, 0, 1.36, 0.04, false));
    const lantern = new THREE.Group(); lantern.position.set(1.7, 0, -1.3); hs.add(lantern); lantern.add(mesh(rbox(0.36, 0.5, 0.36, 0.03), rockM, 0, 0.25, 0, false), mesh(rbox(0.3, 0.3, 0.3, 0.03), M.light, 0, 0.65, 0, false), mesh(rbox(0.46, 0.1, 0.46, 0.03), rockM, 0, 0.86, 0, false));
    const steam = []; for (let k = 0; k < 5; k++) { const pm = new THREE.MeshStandardMaterial({ color: P.white, transparent: true, opacity: 0.4, roughness: 1 }); const p = mesh(new THREE.SphereGeometry(0.26, 8, 6), pm, 0, 0.5, 0, false); p.userData.dynamic = true; hs.add(p); steam.push(p); }
    put(T, hs, sp.x, sp.z, sp.ry, 2.4);
    ticks.push((dt, t) => { steam.forEach((p, k) => { const u = (t * 0.28 + k / 5) % 1; p.position.set(Math.cos(k * 1.3 + t * 0.4) * (0.5 + u * 0.4), 0.4 + u * 2.4, Math.sin(k * 1.3 + t * 0.35) * (0.5 + u * 0.4)); p.scale.setScalar(0.5 + u * 1.8); p.material.opacity = 0.4 * (1 - u) * Math.min(1, u * 6); }); });
    break;
  }

  // ═══ 5. 台灣味：機車。每座島小店旁邊一排停著的（五到七台，一次畫完）；一座島上一台載著人的在島緣繞圈。═══
  {
    const cols = [P.orange, P.teal, P.yellow, P.white, mix(P.navy, P.white, 0.4), P.cream]; const seatC = mix(P.navy, P.grey, 0.3), lampC = P.light;
    // 一台機車 = 五個盒子（踏板與車身、椅墊、前擋板、頭燈、把手）加兩個輪子。sx sz 是這台車的朝向（車頭朝 ry），col 是車身的顏色。
    const S = 1.15;   // 機車比真的大一點，不然在這些大頭的人旁邊像玩具（1.4 又太大，三台排在一起像一台車）
    const scooter = (x, z, ry, col) => { const c = Math.cos(ry), s = Math.sin(ry); const at = (lx, lz) => [x + c * lx * S + s * lz * S, z - s * lx * S + c * lz * S];
      for (const [lx, ly, lz, w, h, d, cc] of [[0, 0.5, 0, 1.1, 0.26, 0.3, col], [-0.42, 0.66, 0, 0.36, 0.3, 0.4, col], [-0.3, 0.84, 0, 0.5, 0.1, 0.34, seatC], [0.45, 0.72, 0, 0.1, 0.55, 0.42, col], [0.51, 0.82, 0, 0.06, 0.12, 0.18, lampC], [0.4, 1.0, 0, 0.08, 0.06, 0.62, P.dark], [0.42, 0.86, 0, 0.08, 0.36, 0.08, P.dark], [-0.05, 0.36, 0, 0.5, 0.06, 0.5, P.dark]]) { const [wx, wz] = at(lx, lz); boxes.add(wx, ly * S, wz, w * S, h * S, d * S, ry, cc); }
      for (const lx of [0.47, -0.45]) { const [wx, wz] = at(lx, 0); wheels.add(wx, 0.22 * S, wz, 0.44 * S, 0.44 * S, 0.12 * S, ry); } };
    for (const isl of islands) {
      if (isl.sea) continue; const T = spots && spots.get(isl.id); if (!T) continue; let n = 0;
      // 一排：中心 (cx, cz)、排的方向 (ux, uz)、車頭朝 (hx, hz)、幾台。位置要空（town.js 的 rectFree，樹與桌椅可以讓）、清掉讓位的東西、記進 blockers。
      const row = (cx, cz, ux, uz, hx, hz, want) => { const ry = -Math.atan2(uz, ux); if (!T.rectFree(cx, cz, ry, want * 0.37 + 0.2, 0.8, 0.3, true)) return false;
        T.fell(cx, cz, ry, want * 0.37 + 0.2, 0.8); T.blockers.push({ x: isl.x + cx, z: isl.z + cz, r: want * 0.37 + 0.5 }); (stats.scootersAt[isl.id] = stats.scootersAt[isl.id] || []).push([Math.round((isl.x + cx) * 10) / 10, Math.round((isl.z + cz) * 10) / 10, want]);
        for (let k = 0; k < want; k++) { const off = (k - (want - 1) / 2) * 0.72; scooter(isl.x + cx + ux * off, isl.z + cz + uz * off, -Math.atan2(hz, hx) + (T.rr() - 0.5) * 0.16, cols[(n + k + (isl.x > 0 ? 1 : 0)) % cols.length]); stats.scooters++; }
        n += want; return true; };
      // 先試小店旁邊（店的兩側、離店 2.9 到 3.8 公尺、前後幾個位置，一排四台或三台）。小店多半貼著島緣，旁邊常常已經是海或是別的東西。
      for (const pl of (lifePlaces.get(isl.id) || [])) {
        if (pl.kind !== "shop" || pl.removed || n >= 7) continue;
        const dx = Math.sin(pl.face), dz = Math.cos(pl.face), tx = Math.cos(pl.face), tz = -Math.sin(pl.face);   // d 是店門朝的方向、t 是店的側邊
        let placed = false;
        for (const dist of [2.9, 3.3, 3.8]) { for (const side of [1, -1]) { for (const fwd of [0.5, -0.5, 1.5, -1.5, 2.6]) { for (const want of [4, 3]) { if (placed) break; placed = row(pl.x + tx * side * dist + dx * fwd, pl.z + tz * side * dist + dz * fwd, dx, dz, tx * side, tz * side, want); } if (placed) break; } if (placed) break; } if (placed) break; }
      }
      // 不夠就在島上任何放得下的地方補到五台以上（最多七台）：一排三台，車頭朝排的側邊。
      for (let tries = 0; n < 5 && tries < 6; tries++) { const want = Math.min(tries < 3 ? 3 : 2, 7 - n); const sp = T.rectSpot(want * 0.37 + 0.2, 0.8, 0.3, 300, true); if (!sp) continue; const ux = Math.cos(sp.ry), uz = -Math.sin(sp.ry); row(sp.x, sp.z, ux, uz, -uz, ux, want); }
    }
    boxes.flush(); wheels.flush();
    // 繞圈的那一台：Marketing 的島緣（六邊形的島照六邊形走），一個人坐著騎，車會隨著轉彎微微傾。
    const edgeR = (isl, th) => { if (isl.shape !== "hex") return isl.r; let ph = (th - Math.PI / 6) % (Math.PI / 3); if (ph < 0) ph += Math.PI / 3; return isl.r * Math.cos(Math.PI / 6) / Math.cos(ph - Math.PI / 6); };
    for (const id of ["marketing", "internship", "cr", "sponsorship"]) {
      const T = spots && spots.get(id); if (!T || T.isl.shape === "rect") continue; stats.rider = id;
      const grp = new THREE.Group(); grp.userData.dynamic = true; T.g.add(grp); const bike = new THREE.Group(); bike.userData.dynamic = true; bike.scale.setScalar(S); grp.add(bike);
      bike.add(mesh(rbox(1.1, 0.26, 0.3, 0.06), M.teal, 0, 0.5, 0), mesh(rbox(0.36, 0.3, 0.4, 0.05), M.teal, -0.42, 0.66, 0, false), mesh(rbox(0.5, 0.1, 0.34, 0.03), M.dark, -0.3, 0.84, 0, false), mesh(rbox(0.1, 0.55, 0.42, 0.03), M.teal, 0.45, 0.72, 0, false), mesh(rbox(0.06, 0.12, 0.18, 0.02), M.light, 0.51, 0.82, 0, false), mesh(rbox(0.08, 0.06, 0.62, 0.02), M.dark, 0.4, 1.0, 0, false), mesh(rbox(0.08, 0.36, 0.08, 0.02), M.dark, 0.42, 0.86, 0, false), mesh(rbox(0.5, 0.06, 0.5, 0.02), M.dark, -0.05, 0.36, 0, false));
      for (const lx of [0.47, -0.45]) bike.add(mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.12, 10), M.dark, lx, 0.22, 0, false).rotateX(Math.PI / 2));
      E.mergeChildren(bike);
      const rider = sit(person(bike, -0.2, 0, Math.PI / 2, { shirt: 0, scale: 1.0 / S, hat: true }), 0.6); rider.userData.parts.armL.rotation.x = -1.3; rider.userData.parts.armR.rotation.x = -1.3;
      let th = 1.0; const inset = 1.35;
      ticks.push((dt, t) => { const R = edgeR(T.isl, th) - inset; th -= dt * 2.3 / R; const p = { x: Math.cos(th) * R, z: Math.sin(th) * R }; const R2 = edgeR(T.isl, th - 0.03) - inset; const q = { x: Math.cos(th - 0.03) * R2, z: Math.sin(th - 0.03) * R2 };
        grp.position.set(p.x, 0, p.z); grp.rotation.y = -Math.atan2(q.z - p.z, q.x - p.x); bike.rotation.x = 0.12 + Math.sin(t * 9) * 0.01; });
      break;
    }
  }

  // ═══ 6. 聚會所：一串紅橘燈籠（兩支桿子之間，八顆會微微發光的燈籠加深色的蓋子與黃色的穗）、一支夜市招牌（直立的深藍板、三塊顏色、頂上一個箭頭、一圈會一明一暗的小燈）。═══
  {
    const T = spots && spots.get("commons");
    if (T) {
      let A = null, B = null; for (let i = 0; i < 60 && !B; i++) { A = T.spot(0.5, 0.2, 0.75); if (!A) break; const a = T.rr() * TAU; const bx = A.x + Math.cos(a) * 6.0, bz = A.z + Math.sin(a) * 6.0; if (T.free(bx, bz, 0.5)) B = { x: bx, z: bz }; }
      if (B) {
        for (const q of [A, B]) { const pole = new THREE.Group(); pole.add(mesh(new THREE.CylinderGeometry(0.05, 0.07, 3.6, 6), M.dark, 0, 1.8, 0, false), mesh(new THREE.SphereGeometry(0.08, 6, 5), M.dark, 0, 3.6, 0, false)); put(T, pole, q.x, q.z, null, 0.4); }
        const cv = new THREE.QuadraticBezierCurve3(new THREE.Vector3(A.x, 3.55, A.z), new THREE.Vector3((A.x + B.x) / 2, 2.75, (A.z + B.z) / 2), new THREE.Vector3(B.x, 3.55, B.z)); T.g.add(mesh(new THREE.TubeGeometry(cv, 16, 0.02, 4, false), M.dark, 0, 0, 0, false));
        const lantern = instancer(new THREE.SphereGeometry(1, 10, 8), new THREE.MeshStandardMaterial({ color: P.white, emissive: P.orange.clone().multiply(new THREE.Color(1, 0.45, 0.35)), emissiveIntensity: 0.6, roughness: 0.9 }), 10, false, false);
        const red = P.orange.clone().multiply(new THREE.Color(1, 0.5, 0.42)), red2 = P.orange.clone().multiply(new THREE.Color(1, 0.62, 0.5));   // 色票裡沒有紅，拿橘色把綠藍壓掉就是燈籠的紅
        for (let k = 1; k < 9; k++) { const p = cv.getPoint(k / 9); const x = T.isl.x + p.x, z = T.isl.z + p.z; lantern.add(x, p.y - 0.38, z, 0.21, 0.26, 0.21, 0, k % 2 ? red : red2); boxes.add(x, p.y - 0.1, z, 0.16, 0.08, 0.16, 0, P.dark); boxes.add(x, p.y - 0.66, z, 0.14, 0.06, 0.14, 0, P.dark); boxes.add(x, p.y - 0.82, z, 0.05, 0.26, 0.05, 0, P.yellow); stats.lanterns++; }
        lantern.flush(); boxes.flush();
      }
      const sp = T.spot(0.5, 0.25, 0.7);
      if (sp) { stats.sign = "commons"; const sg = new THREE.Group(); const face = Math.atan2(-sp.x, -sp.z);   // 板面朝島心（人多的那邊）
        const neonM = new THREE.MeshStandardMaterial({ color: P.yellow, emissive: P.yellow, emissiveIntensity: 1.0, roughness: 0.6 });
        sg.add(mesh(new THREE.CylinderGeometry(0.06, 0.08, 4.4, 6), M.dark, 0, 2.2, 0, false), mesh(rbox(0.9, 2.4, 0.14, 0.04), M.navy, 0, 2.9, 0.1), mesh(rbox(0.5, 0.5, 0.1, 0.04), M.orange, 0, 4.45, 0.1, false).rotateZ(Math.PI / 4));
        [[M.orange, 3.6], [M.yellow, 2.9], [M.white, 2.2]].forEach(([m, y]) => sg.add(mesh(rbox(0.68, 0.56, 0.03, 0.02), m, 0, y, 0.19, false)));
        for (let k = 0; k < 14; k++) { const u = k / 14; const [x, y] = u < 0.5 ? [-0.5, 1.75 + u * 2 * 2.3] : [0.5, 1.75 + (u - 0.5) * 2 * 2.3]; sg.add(mesh(new THREE.SphereGeometry(0.05, 5, 4), neonM, x, y, 0.19, false)); }
        put(T, sg, sp.x, sp.z, face, 0.6);
        ticks.push((dt, t) => { neonM.emissiveIntensity = 0.55 + 0.5 * (Math.sin(t * 3.2) > 0 ? 1 : 0.2); });
      }
    }
  }

  // ═══ 7. 天空：高一層更小的雲（一次畫完，七團，慢慢往東飄、飄出去就從西邊回來）、繞著雲霄飛車小島上空轉的滑翔翼（三角翼、龍骨、操縱桿、趴著的人）。═══
  {
    const sg = new THREE.SphereGeometry(1, 9, 7); const cloudGeo = mergeGeos([[sg, 0, 0, 0, 1.5], [sg, 1.6, 0.2, 0.3, 1.2], [sg, -1.5, 0.1, -0.2, 1.1], [sg, 0.3, 0.7, -0.6, 1.0], [sg, 3.0, -0.1, 0.1, 0.8]]);
    const hi = instancer(cloudGeo, M.cloud, 8, true, false); const cl = [];
    for (let k = 0; k < 7; k++) { const a = k / 7 * TAU + 0.5, d = 45 + (k % 3) * 35; cl.push({ x: Math.cos(a) * d, z: Math.sin(a) * d * 0.8, y: 40 + (k % 4) * 2.5, s: 0.55 + (k % 3) * 0.15, ry: k * 0.9, v: 0.1 + (k % 3) * 0.05 }); hi.add(0, 0, 0, 1); stats.clouds++; }
    ticks.push(dt => { cl.forEach((c, k) => { c.x += c.v * dt; if (c.x > 175) c.x = -175; hi.set(k, c.x, c.y, c.z, c.s, c.s * 0.7, c.s, c.ry); }); hi.flush(); });
    if (GL) {
      const g = new THREE.Group(); g.userData.dynamic = true; world.add(g); const inner = new THREE.Group(); inner.userData.dynamic = true; g.add(inner); stats.glider = true;
      const tri = (pts, m, y) => { const sh = new THREE.Shape(); pts.forEach(([x, z], i) => i ? sh.lineTo(x, -z) : sh.moveTo(x, -z)); sh.closePath(); const o = new THREE.Mesh(new THREE.ShapeGeometry(sh), new THREE.MeshStandardMaterial({ color: m, emissive: m, emissiveIntensity: 0.3, roughness: 0.9, side: THREE.DoubleSide })); o.rotation.x = -Math.PI / 2; o.position.y = y; o.castShadow = true; return o; };
      inner.add(tri([[2.4, 0], [-1.4, 2.8], [-1.0, 0], [-1.4, -2.8]], P.orange, 0), tri([[1.8, 0], [-1.1, 1.5], [-0.9, 0], [-1.1, -1.5]], P.white, 0.02), mesh(rbox(3.8, 0.06, 0.06, 0.01), M.dark, 0.4, -0.04, 0, false));
      for (const s of [-1, 1]) { const bar = mesh(rbox(0.05, 1.5, 0.05, 0.01), M.dark, 0.5, -0.75, s * 0.35, false); bar.rotation.x = s * 0.45; inner.add(bar); } inner.add(mesh(rbox(0.05, 0.05, 1.3, 0.01), M.dark, 0.5, -1.45, 0, false));
      const pilot = makePerson({ scale: 0.95, shirt: 3, hat: true }); pilot.position.set(-0.3, -1.05, 0); pilot.rotation.set(Math.PI / 2, 0, -Math.PI / 2); inner.add(pilot); pilot.userData.parts.armL.rotation.x = -2.2; pilot.userData.parts.armR.rotation.x = -2.2; pilot.userData.parts.legL.rotation.x = 0.1; pilot.userData.parts.legR.rotation.x = -0.1;
      E.mergeChildren(inner);
      let a = 0.3; ticks.push((dt, t) => { a += dt * 0.26; g.position.set(GL.x + Math.cos(a) * GL.r, GL.h + Math.sin(t * 0.5) * 1.2 + Math.sin(a * 2) * 0.6, GL.z + Math.sin(a) * GL.r); g.rotation.y = -a - Math.PI / 2; inner.rotation.x = 0.32 + Math.sin(t * 0.7) * 0.05; inner.rotation.z = Math.sin(t * 0.45) * 0.06; });
    }
  }

  // ═══ 8. 機場：塔台頂上會轉的信標（兩色的燈加一道淡淡的光束）、一條服務車道（跑道與人走的那一條之間）、三列行李拖車（車頭加兩節拖車，各自沿車道跑，過彎各轉各的）。═══
  if (airport) {
    const g = new THREE.Group(); g.position.set(airport.x, 0, airport.z); world.add(g); stats.beacon = true;
    const bc = new THREE.Group(); bc.position.set(-6.6, 4.9, -8.2); g.add(bc); bc.add(mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.7, 6), M.dark, 0, 0.35, 0, false));
    const head = new THREE.Group(); head.userData.dynamic = true; head.position.y = 0.8; bc.add(head);
    head.add(mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.22, 8), M.dark, 0, 0, 0, false), mesh(rbox(0.14, 0.14, 0.14, 0.03), M.light, 0.16, 0, 0, false), mesh(rbox(0.14, 0.14, 0.14, 0.03), M.orange, -0.16, 0, 0, false));
    const beam = new THREE.Mesh(new THREE.ConeGeometry(0.35, 5, 8, 1, true), new THREE.MeshBasicMaterial({ color: P.light, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide })); beam.rotation.z = Math.PI / 2; beam.position.x = 2.7; head.add(beam);
    E.mergeChildren(head);
    ticks.push(dt => { head.rotation.y += dt * 1.6; });
    if (CL) {
      // 車道：比平台深一點的一條，中間一排虛線。
      const w = CL.x1 - CL.x0 + 2.6, zc = (CL.z0 + CL.z1) / 2; g.add(mesh(rbox(w, 0.03, CL.z1 - CL.z0 + 1.1, 0.02), std(mix(P.road, P.navy, 0.14), { roughness: 0.95 }), (CL.x0 + CL.x1) / 2, 0.02, zc, false));
      for (let x = CL.x0 + 0.5; x < CL.x1; x += 1.4) boxes.add(airport.x + x, 0.045, airport.z + zc, 0.7, 0.02, 0.1, 0, P.white); boxes.flush();
      const pts = [[CL.x0 + 0.8, CL.z0], [CL.x1 - 0.8, CL.z0], [CL.x1, CL.z0 + 0.25], [CL.x1, CL.z1 - 0.25], [CL.x1 - 0.8, CL.z1], [CL.x0 + 0.8, CL.z1], [CL.x0, CL.z1 - 0.25], [CL.x0, CL.z0 + 0.25]].map(([x, z]) => new THREE.Vector3(airport.x + x, 0, airport.z + z));
      const loop = new THREE.CatmullRomCurve3(pts, true, "catmullrom", 0.4); const L = loop.getLength();
      const vb = instancer(boxGeo, whiteM(), 60, true, true), vw = instancer(wheelGeo, M.dark, 60, true, false);
      // 每一台車：車頭（黃色的身、深藍的駕駛艙、座位）或拖車（灰色的床、三件行李），四個輪子。parts 是本地的盒子，每一幀照車的位置與朝向擺。
      const bagC = [P.orange, P.teal, P.navy, P.yellow, P.cream];
      const tractor = () => ({ parts: [[0, 0.45, 0, 1.2, 0.4, 0.7, P.yellow], [-0.25, 0.9, 0, 0.6, 0.5, 0.62, mix(P.navy, P.white, 0.2)], [0.2, 0.72, 0, 0.5, 0.14, 0.5, P.dark], [0.58, 0.55, 0, 0.06, 0.12, 0.3, P.light]], wheels: [[0.4, 0.3], [0.4, -0.3], [-0.4, 0.3], [-0.4, -0.3]] });
      const trailer = k => ({ parts: [[0, 0.4, 0, 1.1, 0.1, 0.7, mix(P.grey, P.navy, 0.3)], [-0.3, 0.64, 0.1, 0.4, 0.36, 0.3, bagC[k % 5]], [0.15, 0.6, -0.15, 0.45, 0.3, 0.32, bagC[(k + 2) % 5]], [0.15, 0.95, -0.15, 0.3, 0.3, 0.26, bagC[(k + 4) % 5]], [-0.6, 0.55, 0, 0.06, 0.4, 0.5, P.dark]], wheels: [[0.35, 0.3], [0.35, -0.3], [-0.35, 0.3], [-0.35, -0.3]] });
      const vehicles = []; const trains = 3;
      for (let n = 0; n < trains; n++) { const u0 = n / trains; for (let k = 0; k < 3; k++) { const v = k === 0 ? tractor() : trailer(n * 2 + k); v.u = u0 - k * 1.35 / L; v.ib = v.parts.map(() => vb.add(0, -50, 0, 0.001)); v.iw = v.wheels.map(() => vw.add(0, -50, 0, 0.001)); vehicles.push(v); } stats.carts++; }
      const vm = new THREE.Matrix4(), pm = new THREE.Matrix4(), q = new THREE.Quaternion(), s3 = new THREE.Vector3(), p3 = new THREE.Vector3(), tan = new THREE.Vector3(), e = new THREE.Euler();
      ticks.push(dt => { for (const v of vehicles) { v.u = (v.u + dt * 1.25 / L + 1) % 1; const p = loop.getPointAt(v.u); loop.getTangentAt(v.u, tan); const ry = Math.atan2(-tan.z, tan.x);   // 車頭朝 +x，所以朝向是 atan2(-tz, tx)
          e.set(0, ry, 0); q.setFromEuler(e); vm.compose(p, q, s3.set(1, 1, 1));
          v.parts.forEach(([x, y, z, w, h, d, col], i) => { pm.compose(p3.set(x, y, z), q.identity(), s3.set(w, h, d)); pm.premultiply(vm); vb.setM(v.ib[i], pm, col); });
          e.set(0, 0, -(v.u * L) / 0.18); q.setFromEuler(e);   // 輪子照走過的距離轉（半徑 0.18；批 B）
          v.wheels.forEach(([x, z], i) => { pm.compose(p3.set(x, 0.18, z), q, s3.set(0.36, 0.36, 0.12)); pm.premultiply(vm); vw.setM(v.iw[i], pm); }); }
        vb.flush(); vw.flush(); });
    }
  }
  return { tick: (dt, t) => { for (const f of ticks) f(dt, t); } };
}
