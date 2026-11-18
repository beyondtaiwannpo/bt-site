// /island/ 海上與岸邊的第二批細節（2026-11-18 Paul：「More detail first」）。
// 三座島各一個沙灘灣（沙從島上斜下去到水裡，有陽傘、浴巾、躺椅、沙堡、沙灘球、棕櫚樹、曬太陽的人）、每座島外圍兩圈會一明一暗的浪、
// 水道裡會上下晃的浮標、四艘有彩色帆的帆船各自繞一個橢圓、一對會跳出水面的海豚、一架繞著整個島群飛的水上飛機。
// 燈塔的光束引擎本來就會轉（toy.js 的 beacons），這裡不再加。
// 跟 life.js、town.js 一樣：不 import three、不 import toy.js，THREE 跟引擎 E 從 scene.js 傳進來；島上的東西記進 blockersOf；會動的標 userData.dynamic，每一幀在 tick() 裡動。
export function buildSea(THREE, E, c) {
  const { M, P, world, rbox, makePerson } = E;
  const { islands, blockersOf, bridgeAngles, lifePlaces } = c;
  const TAU = Math.PI * 2, ticks = [];
  const mesh = (geo, m, x, y, z, shadow) => { const o = new THREE.Mesh(geo, m); o.position.set(x || 0, y || 0, z || 0); o.castShadow = shadow !== false; o.receiveShadow = true; return o; };
  const std = (color, extra) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, ...(extra || {}) });
  const mix = (a, b, t) => a.clone().lerp(b, t);
  const stats = { beaches: [], beachAngles: {}, waves: 0, buoys: 0, sailboats: 0, dolphins: 0, seaplane: false }; E.seaStats = stats; const objs = { sail: [], dolphins: [], plane: null }; E.seaObjs = objs;   // 除錯：console 裡看帆船、海豚、水上飛機現在在哪；beachAngles 是每個沙灘灣朝哪個方向（water.js 的淺水區要靠著沙灘放）
  // 六邊形的島：某個方向上島緣離島心多遠（角是平頂六邊形，頂點在 30 度、90 度……）。圓的島就是 r。
  const edgeR = (isl, th) => { if (isl.shape !== "hex") return isl.r; let ph = (th - Math.PI / 6) % (Math.PI / 3); if (ph < 0) ph += Math.PI / 3; return isl.r * Math.cos(Math.PI / 6) / Math.cos(ph - Math.PI / 6); };
  const angDiff = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
  const person = (parent, x, z, ry, o) => { const pp = makePerson({ scale: 1.1, ...(o || {}) }); pp.position.set(x, 0, z); pp.rotation.y = ry; parent.add(pp); return pp; };

  // ═══ 1. 沙灘灣：三座島各一個。挑一個離橋頭與碼頭都遠的方向；沙是一張自己算的網格（島上平、過了島緣斜下去、到水面下攤平）。═══
  const sandM = std(mix(P.beach, P.yellow, 0.12), { roughness: 0.95 });
  for (const id of ["sponsorship", "mentorship", "cr"]) {
    const isl = islands.find(i => i.id === id); if (!isl || isl.shape === "rect") continue;
    const avoid = (bridgeAngles.get(id) || []).slice(); for (const pl of lifePlaces.get(id) || []) if (pl.kind === "dock") avoid.push(pl.a);
    let best = null, bestD = -1; for (let k = 0; k < 36; k++) { const a = k / 36 * TAU; const d = Math.min(...avoid.map(b => angDiff(a, b)), 9); if (d > bestD) { bestD = d; best = a; } }
    if (best == null || bestD < 0.8) continue;
    const g = new THREE.Group(); g.position.set(isl.x, 0, isl.z); world.add(g); stats.beaches.push(id); stats.beachAngles[id] = best;
    const halfW = 0.42, nA = 14, nR = 12, off0 = -3.8, off1 = 2.8;
    const yOf = off => { if (off <= -0.6) return 0.03; if (off <= 1.8) { const u = (off + 0.6) / 2.4; const s = u * u * (3 - 2 * u); return 0.03 - 0.53 * s; } return -0.5 - (off - 1.8) * 0.03; };
    const pos = [], idx = [];
    for (let i = 0; i <= nA; i++) { const a = best - halfW + (i / nA) * halfW * 2; const eR = edgeR(isl, a); for (let j = 0; j <= nR; j++) { const off = off0 + (j / nR) * (off1 - off0); const rad = eR + off; pos.push(Math.cos(a) * rad, yOf(off), Math.sin(a) * rad); } }
    for (let i = 0; i < nA; i++) for (let j = 0; j < nR; j++) { const a0 = i * (nR + 1) + j, a1 = a0 + 1, b0 = a0 + nR + 1, b1 = b0 + 1; idx.push(a0, b0, a1, a1, b0, b1); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
    const sand = new THREE.Mesh(geo, sandM); sand.receiveShadow = true; g.add(sand);
    // 沙灘上的東西：以灣的中線為準，lat 是往左右、d 是離島緣往島內幾公尺。
    const at = (lat, d) => { const eR = edgeR(isl, best); const cx = Math.cos(best), cz = Math.sin(best), px = -cz, pz = cx; return { x: cx * (eR - d) + px * lat, z: cz * (eR - d) + pz * lat }; };
    const put = (obj, p, ry, r) => { obj.position.set(p.x, 0, p.z); if (ry != null) obj.rotation.y = ry; g.add(obj); obj.traverse(m => { if (m.isMesh) m.castShadow = true; }); (blockersOf.get(id) || []).push({ x: isl.x + p.x, z: isl.z + p.z, r: r || 1.0 }); return obj; };
    const faceSea = -best + Math.PI / 2;   // 面向海的那個 rotation.y
    for (const [lat, m, tm] of [[-1.9, M.orange, M.teal], [1.9, M.teal, M.yellow]]) {
      const u = E.parasol(m); put(u, at(lat, 2.4), null, 0.9); u.children[1].rotation.z = lat < 0 ? 0.12 : -0.12;
      const towel = mesh(rbox(1.5, 0.04, 0.8, 0.01), tm, 0, 0.05, 0, false); towel.position.set(at(lat * 1.1, 2.0).x, 0.05, at(lat * 1.1, 2.0).z); towel.rotation.y = faceSea + Math.PI / 2; g.add(towel);
    }
    // 躺在浴巾上曬太陽的人（整個人翻 90 度躺平）、躺椅上坐著的人、蹲在沙堡旁邊的小孩。
    { const p = at(-2.1, 2.0); const ly = person(g, p.x, p.z, faceSea + Math.PI / 2, { shirt: 0, scale: 1.0, hat: true }); ly.rotation.x = -Math.PI / 2; ly.position.y = 0.32; ly.userData.parts.armL.rotation.x = 0.4; ly.userData.parts.armR.rotation.x = 0.4; }
    { const ch = new THREE.Group(); ch.add(mesh(rbox(0.7, 0.08, 1.4, 0.03), M.white, 0, 0.35, 0.1, false), mesh(rbox(0.7, 0.08, 0.7, 0.03), M.white, 0, 0.62, -0.75, false).rotateX(-0.9)); for (const [x, z] of [[-0.3, -0.4], [0.3, -0.4], [-0.3, 0.6], [0.3, 0.6]]) ch.add(mesh(rbox(0.06, 0.32, 0.06, 0.01), M.dark, x, 0.16, z, false));
      put(ch, at(0.2, 3.0), faceSea, 0.8); const sp = person(ch, 0, 0.1, 0, { shirt: 4, scale: 1.0 }); const pr = sp.userData.parts; pr.legL.rotation.x = -1.1; pr.legR.rotation.x = -1.1; pr.armL.rotation.x = -0.5; pr.armR.rotation.x = -0.5; sp.position.y = 0.1; }
    { const castle = new THREE.Group(); castle.add(mesh(new THREE.CylinderGeometry(0.42, 0.5, 0.45, 10), sandM, 0, 0.22, 0, false), mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.5, 8), sandM, 0, 0.6, 0, false), mesh(new THREE.ConeGeometry(0.26, 0.3, 8), sandM, 0, 0.98, 0, false), mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.45, 4), M.dark, 0, 1.3, 0, false), mesh(rbox(0.22, 0.14, 0.02, 0.01), M.orange, 0.11, 1.4, 0, false));
      for (const a of [0, 1.6, 3.2, 4.8]) castle.add(mesh(new THREE.CylinderGeometry(0.11, 0.12, 0.35, 7), sandM, Math.cos(a) * 0.45, 0.45, Math.sin(a) * 0.45, false));
      castle.add(mesh(new THREE.CylinderGeometry(0.13, 0.11, 0.2, 8), M.teal, 0.7, 0.1, 0.3, false), mesh(rbox(0.1, 0.02, 0.18, 0.005), M.orange, 0.75, 0.03, -0.3, false));
      put(castle, at(1.0, 1.5), null, 0.7); const kid = person(castle, -0.75, 0.3, Math.PI / 2, { shirt: 2, scale: 0.75 }); const pr = kid.userData.parts; pr.legL.rotation.x = -1.4; pr.legR.rotation.x = -1.4; pr.armL.rotation.x = -0.9; pr.armR.rotation.x = -0.9; }
    { const ball = mesh(new THREE.SphereGeometry(0.24, 10, 8), M.orange, 0, 0.26, 0, false); const bp = at(-0.6, 1.1); ball.position.set(bp.x, 0.26, bp.z); g.add(ball); const band = mesh(new THREE.SphereGeometry(0.245, 10, 8, 0, TAU, 1.2, 0.7), M.white, 0, 0, 0, false); ball.add(band); }
    // 棕櫚樹兩棵（灣的兩側、靠島內）。
    for (const [lat, lean] of [[-2.9, 0.2], [3.0, -0.18]]) { const p = at(lat, 3.4); if (Math.hypot(p.x, p.z) > isl.r - 1.8) continue; const t = new THREE.Group(); t.add(mesh(new THREE.CylinderGeometry(0.12, 0.2, 3.6, 7), M.trunk, 0, 1.8, 0).rotateZ(lean));
      // 葉子兩層：上層七片微微翹起、下層七片垂下來（第一版只有一層平的，從上面看像風車）。
      for (let k = 0; k < 14; k++) { const a = (k % 7) / 7 * TAU + (k < 7 ? 0 : 0.45), low = k >= 7; const leaf = mesh(rbox(low ? 1.7 : 2.0, 0.07, 0.42, 0.04), M.tree[low ? 2 : 0], Math.cos(a) * 0.8 - lean * 1.8, low ? 3.45 : 3.7, Math.sin(a) * 0.8, false); leaf.rotation.y = -a; leaf.rotation.z = low ? -0.55 : 0.25; t.add(leaf); }
      t.add(mesh(new THREE.SphereGeometry(0.14, 6, 5), M.wood, -lean * 1.8, 3.55, 0.2, false), mesh(new THREE.SphereGeometry(0.14, 6, 5), M.wood, 0.2 - lean * 1.8, 3.5, -0.1, false)); put(t, p, null, 0.8); }
  }

  // ═══ 2. 浪圈：每座島外圍兩圈半透明的白，透明度一明一暗（兩圈相位錯開，看起來像浪在推）。六邊形的島跟著六邊形。═══
  const waveM = new THREE.MeshBasicMaterial({ color: P.white, transparent: true, opacity: 0.3, depthWrite: false }), waveM2 = new THREE.MeshBasicMaterial({ color: P.white, transparent: true, opacity: 0.2, depthWrite: false });
  const hexShape = (r0, r1) => { const sh = new THREE.Shape(); for (let k = 0; k < 6; k++) { const a = k * TAU / 6 + Math.PI / 6; k ? sh.lineTo(Math.cos(a) * r1, Math.sin(a) * r1) : sh.moveTo(Math.cos(a) * r1, Math.sin(a) * r1); } sh.closePath(); const hole = new THREE.Path(); for (let k = 0; k < 6; k++) { const a = k * TAU / 6 + Math.PI / 6; k ? hole.lineTo(Math.cos(a) * r0, Math.sin(a) * r0) : hole.moveTo(Math.cos(a) * r0, Math.sin(a) * r0); } hole.closePath(); sh.holes.push(hole); return new THREE.ShapeGeometry(sh); };
  for (const isl of islands) {
    if (isl.sea || isl.shape === "rect") continue; stats.waves++;
    for (const [r0, r1, m, y] of [[isl.r + 1.5, isl.r + 2.0, waveM, -0.53], [isl.r + 2.5, isl.r + 2.8, waveM2, -0.54]]) {
      const geo = isl.shape === "hex" ? hexShape(r0, r1) : new THREE.RingGeometry(r0, r1, 48); const ring = new THREE.Mesh(geo, m.clone()); ring.rotation.x = -Math.PI / 2; ring.position.set(isl.x, y, isl.z); ring.castShadow = false; ring.receiveShadow = false; ring.userData.dynamic = true; ring.userData.ph = (m === waveM ? 0 : 2.2) + isl.x * 0.05; world.add(ring); E.foams.push(ring);   // 批 B：交給引擎的 foams 一推一推（放大同時變淡），每圈自己的材質
    }
  }

  // ═══ 3. 浮標：橘色、一支小桿頂一盞燈，一次畫完（InstancedMesh），每一幀上下晃、微微歪。放在每座外圍島朝外的兩側，離每座島與小島都 2 公尺以上。═══
  {
    const prof = [[0, 0], [0.42, 0], [0.48, 0.22], [0.34, 0.55], [0.1, 0.62], [0.1, 1.25], [0.2, 1.3], [0.2, 1.5], [0, 1.55]].map(([x, y]) => new THREE.Vector2(x, y));
    const all = islands.map(i => ({ x: i.x, z: i.z, r: i.sea ? 13 : i.r })).concat((c.islets || []).map(i => ({ x: i.x, z: i.z, r: i.r })));
    const spots = [];
    for (const isl of islands) { if (isl.sea || isl.id === "commons") continue; const a0 = Math.atan2(isl.z, isl.x); for (const da of [-0.6, 0.6]) { const a = a0 + da; const x = isl.x + Math.cos(a) * (isl.r + 3.4), z = isl.z + Math.sin(a) * (isl.r + 3.4); if (all.every(o => Math.hypot(x - o.x, z - o.z) > o.r + 2.0)) spots.push([x, z, a]); } }
    const air = islands.find(i => i.sea); if (air) for (const [dx, dz] of [[-14.5, -11.5], [14.5, -11.5], [14.5, 11.5]]) spots.push([air.x + dx, air.z + dz, 0]);
    const im = new THREE.InstancedMesh(new THREE.LatheGeometry(prof, 10), std(mix(P.orange, P.white, 0.1)), Math.max(1, spots.length)); im.count = spots.length; im.userData.dynamic = true; im.castShadow = false; world.add(im); stats.buoys = spots.length;
    const mx = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(1, 1, 1), v = new THREE.Vector3();
    ticks.push((dt, t) => { spots.forEach(([x, z, a], k) => { e.set(Math.sin(t * 1.4 + k) * 0.1, a, Math.cos(t * 1.1 + k * 2) * 0.1); q.setFromEuler(e); v.set(x, -0.95 + Math.sin(t * 1.6 + k * 1.7) * 0.12, z); mx.compose(v, q, s); im.setMatrixAt(k, mx); }); im.instanceMatrix.needsUpdate = true; });
  }

  // ═══ 4. 帆船：四艘，各自在一片空水域繞橢圓（橢圓的位置挑過，離每座島與小島都遠；test/island.test.mjs 守）。主帆一色、前帆白色、船尾一個掌舵的人；船會傾、會上下晃。═══
  for (const [k, L] of (c.sailLoops || []).entries()) {
    const g = new THREE.Group(); g.userData.dynamic = true; world.add(g); const inner = new THREE.Group(); inner.userData.dynamic = true; g.add(inner); stats.sailboats++; objs.sail.push(g);
    const sailM = [M.orange, M.teal, M.yellow, M.navy][k % 4], hullM = k % 2 ? M.cream : M.white;
    inner.add(mesh(rbox(2.8, 0.5, 1.1, 0.18), hullM, 0, 0.1, 0, false), mesh(rbox(2.6, 0.08, 0.9, 0.03), M.wood, 0, 0.4, 0, false), mesh(rbox(0.9, 0.35, 0.7, 0.08), sailM, 0.9, 0.55, 0, false), mesh(new THREE.CylinderGeometry(0.04, 0.05, 3.4, 6), M.dark, 0.3, 2.1, 0, false), mesh(rbox(1.7, 0.05, 0.05, 0.01), M.dark, -0.55, 0.75, 0, false));
    const tri = (pts, m) => { const sh = new THREE.Shape(); pts.forEach(([x, y], i) => i ? sh.lineTo(x, y) : sh.moveTo(x, y)); sh.closePath(); const o = new THREE.Mesh(new THREE.ShapeGeometry(sh), new THREE.MeshStandardMaterial({ color: m.color, emissive: m.color, emissiveIntensity: 0.35, roughness: 0.9, side: THREE.DoubleSide })); o.castShadow = false; return o; };   // 帆是一片薄的，背光那一面會整片黑，加一點自發光
    inner.add(tri([[0.28, 0.8], [0.28, 3.6], [-1.3, 0.85]], sailM), tri([[0.36, 0.85], [0.36, 3.0], [1.5, 0.85]], M.white), mesh(rbox(0.3, 0.18, 0.02, 0.01), M.orange, 0.45, 3.75, 0, false));
    const skipper = person(inner, -1.0, 0, Math.PI / 2, { shirt: k % 6, scale: 0.9, hat: true }); skipper.position.y = 0.42; skipper.userData.parts.legL.rotation.x = -1.4; skipper.userData.parts.legR.rotation.x = -1.4;
    E.mergeChildren(inner);
    const per = TAU * Math.sqrt((L.rx * L.rx + L.rz * L.rz) / 2); let u = L.u0 || 0;
    ticks.push((dt, t) => { u = (u + dt * (L.speed || 1.3) / per) % 1; const th = u * TAU; const x = L.cx + Math.cos(th) * L.rx, z = L.cz + Math.sin(th) * L.rz; const tx = -Math.sin(th) * L.rx, tz = Math.cos(th) * L.rz;
      g.position.set(x, -0.35 + Math.sin(t * 1.2 + k) * 0.07, z); g.rotation.y = Math.atan2(-tz, tx); inner.rotation.x = 0.16 + Math.sin(t * 0.7 + k) * 0.06; });
  }

  // ═══ 5. 海豚：一對，每七秒從水裡跳出來畫一道弧再鑽回去，每跳一次往前換一個位置（繞一個小圈）。═══
  if (c.dolphins) {
    const D = c.dolphins; const dM = std(mix(mix(P.navy, P.grey, 0.4), P.white, 0.25), { roughness: 0.5 }); const pair = [];
    for (let k = 0; k < 2; k++) {
      const g = new THREE.Group(); g.userData.dynamic = true; world.add(g); const body = new THREE.Group(); body.userData.dynamic = true; g.add(body); stats.dolphins++;
      body.add(mesh(new THREE.CapsuleGeometry(0.2, 0.9, 4, 8), dM, 0, 0, 0, false).rotateZ(Math.PI / 2), mesh(new THREE.ConeGeometry(0.1, 0.35, 6), dM, 0.75, -0.02, 0, false).rotateZ(-Math.PI / 2), mesh(rbox(0.25, 0.3, 0.05, 0.02), dM, -0.05, 0.3, 0, false).rotateZ(0.5), mesh(rbox(0.12, 0.05, 0.6, 0.02), dM, -0.75, 0, 0, false), mesh(rbox(0.3, 0.05, 0.12, 0.02), dM, 0.1, -0.15, 0.22, false), mesh(rbox(0.3, 0.05, 0.12, 0.02), dM, 0.1, -0.15, -0.22, false));
      E.mergeChildren(body); pair.push({ g, body, k, sp: [E.addSplash(0, 0), E.addSplash(0, 0)] }); objs.dolphins.push(g);   // 批 B：出水與入水各一組水花
    }
    let ang = 0, t0 = -10;
    ticks.push((dt, t) => { if (t - t0 > 7) { t0 = t; ang += 0.7; }
      // 兩隻不同的弧：第二隻晚 0.6 秒、跳矮一點、弧短一點（批 B，之前同一條弧只差 0.3 秒，看三次就機械）。出水、入水各噴一次水花。
      for (const d of pair) { const dur = d.k ? 1.5 : 1.7, len = d.k ? 4.2 : 5, hi = d.k ? 2.0 : 2.6, s = (t - t0 - d.k * 0.6) / dur; const cx = D.x + Math.cos(ang) * 3, cz = D.z + Math.sin(ang) * 3, ux = -Math.sin(ang), uz = Math.cos(ang), px = -uz, pz = ux, side = d.k ? 1.1 : -1.1;
        if (s < 0 || s > 1) { d.g.position.set(cx, -2.5, cz); d.was = s; continue; }
        if (d.was != null && d.was < 0) { const sp = d.sp[0]; sp.x = sp.ring.position.x = cx - ux * len / 2 + px * side; sp.z = sp.ring.position.z = cz - uz * len / 2 + pz * side; sp.t0 = t; }
        if (s > 0.9 && d.was <= 0.9) { const sp = d.sp[1]; sp.x = sp.ring.position.x = cx + ux * len / 2 + px * side; sp.z = sp.ring.position.z = cz + uz * len / 2 + pz * side; sp.t0 = t; }
        d.was = s;
        d.g.position.set(cx + ux * (s * len - len / 2) + px * side, -1.2 + Math.sin(s * Math.PI) * hi, cz + uz * (s * len - len / 2) + pz * side); d.g.rotation.y = Math.atan2(-uz, ux); d.body.rotation.z = (0.5 - s) * 1.7; } });
  }

  // ═══ 6. 水上飛機：引擎的小飛機加兩支浮筒，在 19 公尺高繞著整個島群飛，機身往圈內傾、螺旋槳會轉。═══
  {
    const g = new THREE.Group(); g.userData.dynamic = true; world.add(g); const inner = new THREE.Group(); inner.userData.dynamic = true; g.add(inner); stats.seaplane = true; objs.plane = g;
    const pl = E.makePlane(M.white, M.orange); inner.add(pl); pl.traverse(m => { if (m.isMesh) m.castShadow = false; });
    for (const z of [-0.55, 0.55]) { inner.add(mesh(rbox(2.4, 0.22, 0.32, 0.08), M.cream, 0.2, -0.95, z, false)); for (const x of [-0.5, 0.9]) inner.add(mesh(rbox(0.06, 0.6, 0.06, 0.01), M.dark, x, -0.6, z, false)); }
    inner.add(mesh(rbox(0.1, 0.1, 1.2, 0.02), M.dark, 0.2, -0.95, 0, false));
    const prop = pl.getObjectByName("prop"); if (prop) prop.userData.dynamic = true;
    E.mergeChildren(inner);
    const R = 64, H = 19, cx = 4, cz = -2; let a = 1.0;
    // 2026-11-18 第三批：每繞一圈在西南那一段空水域（角度 3.3 到 4.15，離棕櫚小島與野鼠飛車都 6 公尺以上）降到水面滑一段再拉起來，浮筒半泡在水裡，water.js 在後面畫尾浪。
    const smooth = k => { k = Math.max(0, Math.min(1, k)); return k * k * (3 - 2 * k); };
    const dip = am => am < 3.3 || am > 4.15 ? 0 : am < 3.55 ? smooth((am - 3.3) / 0.25) : am < 3.9 ? 1 : 1 - smooth((am - 3.9) / 0.25);
    ticks.push((dt, t) => { a += dt * 0.14; const am = a % TAU, w = dip(am), w2 = dip((am + 0.04) % TAU); const y = H + Math.sin(t * 0.4) * 0.6 * (1 - w) - (H - 0.35) * w;
      g.position.set(cx + Math.cos(a) * R, y, cz + Math.sin(a) * R); g.rotation.y = -a - Math.PI / 2; inner.rotation.x = (0.24 + Math.sin(t * 0.6) * 0.04) * (1 - w); inner.rotation.z = (w2 - w) * 9; if (prop) prop.rotation.x += dt * 22; });
  }
  return { tick: (dt, t) => { for (const f of ticks) f(dt, t); } };
}
