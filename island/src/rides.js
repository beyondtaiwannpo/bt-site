// /island/ 的遊樂設施（2026-11-18 Paul：「add more coaster, add more stuff… maybe a gondola over the whole island from airport all the way to curriculum… make it beautiful」）。
// 纜車（機場 → 聚會所上空 → Curriculum 旁的水上站）、迴圈雲霄飛車、野鼠式小飛車、摩天輪加旋轉木馬的遊樂小島、繞著島群跑的渡輪。
// 不 import three、不 import toy.js：THREE 跟引擎 E 從 scene.js 傳進來（check.sh：島這一頁只有 scene.js 准碰那兩個）。位置從 layout.js 來（純數字）。
// 會動的東西（纜車廂、飛車、摩天輪、木馬、渡輪）標 userData.dynamic，引擎合併靜態 Mesh 的時候不碰；每一幀的動作在回傳的 tick() 裡，由 toy.js 的 motion() 叫。
export function buildRides(THREE, E, c) {
  const { M, P, world, rbox, rnd, coasters, makePerson } = E;
  const { gondola, islets, blockersOf } = c;
  const ticks = [];
  const TAU = Math.PI * 2;
  const mesh = (geo, m, x, y, z, shadow) => { const o = new THREE.Mesh(geo, m); o.position.set(x || 0, y || 0, z || 0); o.castShadow = shadow !== false; o.receiveShadow = true; return o; };
  const head = (x, y, z, i) => mesh(new THREE.SphereGeometry(0.16, 8, 6), M.skin[i % 3], x, y, z, false);
  // 一座小島的底（跟 toy.js 的 islet 一樣：崖、頂面、一圈浪花）。
  function base(x, z, r, top) {
    const g = new THREE.Group(); g.position.set(x, 0, z); world.add(g);
    g.add(mesh(E.roundPrism(r, 2.2), M.cliff, 0, -2.2, 0, false), mesh(E.roundPrism(r - 0.1, 0.3), top || M.grass, 0, -1.0, 0, false));   // 頂面那一片放 -1.0 頂面才在 0（圓角柱體的頂在本地 +1.0，見 scene.js landmass 那一段）
    const foam = new THREE.Mesh(new THREE.RingGeometry(r + 0.4, r + 1.0, 36), new THREE.MeshBasicMaterial({ color: P.white, transparent: true, opacity: 0.4, depthWrite: false })); foam.rotation.x = -Math.PI / 2; foam.position.y = -0.55; g.add(foam);
    return g;
  }

  // ═══ 纜車 ═══
  // 塔：四支斜的腳、頂上一支橫臂、臂上兩組滑輪、一顆紅燈。站：一棟小房子、月台、兩端各一個大輪（纜繩繞著轉）、排隊欄。
  // 纜繩：過每一座塔頂的 CatmullRom，兩塔之間多一個往下垂的點（垂度是跨距的 2.5%）；左右各一條（去程、回程），接成一個閉環。
  // 廂：十二個，沿閉環平均分，速度 1.5 公尺每秒，輕輕晃；一半的廂裡坐兩個人。
  {
    const pts = gondola.pts.map(([x, z]) => new THREE.Vector3(x, gondola.h, z));
    const first = 0, last = pts.length - 1;
    const sideAt = i => { const a = pts[Math.max(0, i - 1)], b = pts[Math.min(last, i + 1)]; const dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz) || 1; return new THREE.Vector3(dz / L, 0, -dx / L); };
    for (let i = 0; i <= last; i++) {
      const p = pts[i], station = i === first || i === last, side = sideAt(i);
      const g = new THREE.Group(); g.position.set(p.x, 0, p.z); g.rotation.y = Math.atan2(side.x, side.z); world.add(g);
      if (station) {
        // 水上的站架在柱子上（Curriculum 那一頭）；機場那一頭直接站在平台上。
        if (gondola.stilts && gondola.stilts.includes(i)) { g.add(mesh(rbox(7, 0.5, 6, 0.1), M.road, 0, -0.25, 0)); for (const [ox, oz] of [[-2.8, -2.3], [2.8, -2.3], [-2.8, 2.3], [2.8, 2.3]]) g.add(mesh(new THREE.CylinderGeometry(0.3, 0.35, 2.6, 8), M.dark, ox, -1.6, oz, false)); }
        g.add(mesh(rbox(5.2, 3.0, 4.2, 0.12), M.wall, 0, 1.5, 0), mesh(rbox(5.8, 0.3, 4.8, 0.06), M.orange, 0, 3.15, 0), mesh(rbox(2.2, 0.2, 5.2, 0.05), M.wood, 0, 0.1, 0, false));
        for (let k = 0; k < 3; k++) g.add(mesh(rbox(0.5, 0.5, 0.08, 0.06), M.light, -1.4 + k * 1.4, 1.6, 2.12, false));
        const wheel = mesh(new THREE.CylinderGeometry(1.3, 1.3, 0.25, 20), M.dark, 0, gondola.h, 0, false); g.add(wheel);
        g.add(mesh(new THREE.CylinderGeometry(0.12, 0.14, gondola.h - 3.2, 8), M.dark, -1.6, 3.2 + (gondola.h - 3.2) / 2, 0, false), mesh(new THREE.CylinderGeometry(0.12, 0.14, gondola.h - 3.2, 8), M.dark, 1.6, 3.2 + (gondola.h - 3.2) / 2, 0, false), mesh(rbox(3.6, 0.3, 0.3, 0.05), M.dark, 0, gondola.h - 0.2, 0, false));
        for (let k = 0; k < 4; k++) g.add(mesh(new THREE.CylinderGeometry(0.05, 0.06, 1.0, 6), M.dark, -2.4 + (k % 2) * 4.8, 0.5, 2.6 + Math.floor(k / 2) * 1.2, false));
        for (const z of [2.6, 3.8]) g.add(mesh(rbox(4.8, 0.04, 0.04, 0.01), M.orange, 0, 0.95, z, false));
        const q = [makePerson({ shirt: 1, pack: true }), makePerson({ shirt: 3, bag: true }), makePerson({ shirt: 5 })]; q.forEach((pp, k) => { pp.position.set(-1.8 + k * 1.2, 0, 3.2); pp.rotation.y = Math.PI; g.add(pp); });
        const op = makePerson({ shirt: 3, hat: true }); op.position.set(2.0, 0, -1.2); op.rotation.y = Math.PI / 2; g.add(op);
      } else {
        for (const [ox, oz] of [[-1.1, -1.1], [1.1, -1.1], [-1.1, 1.1], [1.1, 1.1]]) { const leg = mesh(new THREE.CylinderGeometry(0.1, 0.16, gondola.h + 0.4, 6), M.wall, ox * 0.5, gondola.h / 2, oz * 0.5, false); leg.rotation.z = -ox * 0.07; leg.rotation.x = oz * 0.07; g.add(leg); }
        for (let y = 2.5; y < gondola.h - 1; y += 3) { g.add(mesh(rbox(1.3, 0.08, 0.08, 0.02), M.wall, 0, y, 0.55, false), mesh(rbox(1.3, 0.08, 0.08, 0.02), M.wall, 0, y, -0.55, false), mesh(rbox(0.08, 0.08, 1.3, 0.02), M.wall, 0.55, y, 0, false), mesh(rbox(0.08, 0.08, 1.3, 0.02), M.wall, -0.55, y, 0, false)); }
        g.add(mesh(rbox(3.2, 0.25, 0.3, 0.05), M.dark, 0, gondola.h + 0.2, 0, false), mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.25, 12), M.dark, -1.2, gondola.h, 0, false), mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.25, 12), M.dark, 1.2, gondola.h, 0, false), mesh(new THREE.SphereGeometry(0.16, 8, 6), M.amber, 0, gondola.h + 0.5, 0, false));
      }
    }
    // 兩條纜繩：去程在 side 的 +1.2、回程在 -1.2，兩塔之間垂一點。
    const line = sgn => { const out = []; for (let i = 0; i <= last; i++) { const s = sideAt(i).multiplyScalar(1.2 * sgn); out.push(pts[i].clone().add(s)); if (i < last) { const n = pts[i + 1].clone().add(sideAt(i + 1).multiplyScalar(1.2 * sgn)); const mid = pts[i].clone().add(s).lerp(n, 0.5); mid.y -= pts[i].distanceTo(pts[i + 1]) * 0.025; out.push(mid); } } return out; };
    const A = line(1), B = line(-1).reverse();
    const loop = new THREE.CatmullRomCurve3(A.concat(B), true, "catmullrom", 0.5);
    for (const seg of [A, B]) { const cv = new THREE.CatmullRomCurve3(seg, false, "catmullrom", 0.5); const tube = new THREE.Mesh(new THREE.TubeGeometry(cv, 160, 0.05, 5, false), M.dark); tube.castShadow = false; world.add(tube); }
    const cabins = []; const N = gondola.cabins || 12;
    for (let i = 0; i < N; i++) {
      const g = new THREE.Group(); g.userData.dynamic = true; world.add(g);
      const body = mesh(rbox(1.5, 1.5, 1.4, 0.3), i % 2 ? M.teal : M.orange, 0, -2.6, 0); g.add(body);
      g.add(mesh(rbox(1.56, 0.5, 1.46, 0.08), M.dark, 0, -2.45, 0, false), mesh(rbox(0.1, 1.6, 0.1, 0.02), M.dark, 0, -1.05, 0, false), mesh(rbox(0.5, 0.3, 0.3, 0.05), M.dark, 0, -0.1, 0, false));
      if (i % 2 === 0) g.add(head(-0.3, -2.3, 0.2, i), head(0.3, -2.3, -0.2, i + 1));
      E.mergeChildren(g); cabins.push(g);
    }
    const L = loop.getLength(); let u0 = 0; const tangent = new THREE.Vector3();
    ticks.push((dt, t) => { u0 = (u0 + dt * (gondola.speed || 1.5) / L) % 1; for (let i = 0; i < N; i++) { const u = (u0 + i / N) % 1; const p = loop.getPointAt(u); loop.getTangentAt(u, tangent); const g = cabins[i]; g.position.copy(p); g.rotation.set(Math.sin(t * 1.7 + i) * 0.025, Math.atan2(tangent.x, tangent.z), Math.sin(t * 1.3 + i * 2) * 0.03); } });
  }

  // ═══ 雲霄飛車（共用的軌道工廠）═══
  // 一條 CatmullRom 軌道：主管、下面一支細管、每 1.2 公尺一根枕木、每 2.5 公尺一支柱子；一列車（幾節車廂、每節兩個人頭）。
  // 動的那一段交給引擎（E.coasters：爬坡慢、下坡快）。
  function track(g, points, railM, cars, opts) {
    const o = opts || {}; const curve = new THREE.CatmullRomCurve3(points.map(a => new THREE.Vector3(...a)), true, "catmullrom", o.tension == null ? 0.5 : o.tension);
    const rail = mesh(new THREE.TubeGeometry(curve, 240, 0.12, 6, true), railM, 0, 0, 0); g.add(rail);
    const spine = mesh(new THREE.TubeGeometry(curve, 240, 0.06, 5, true), M.dark, 0, -0.3, 0, false); g.add(spine);
    const len = curve.getLength(), ties = Math.floor(len / 1.2), posts = Math.floor(len / 2.5);
    const tie = new THREE.InstancedMesh(new THREE.BoxGeometry(0.9, 0.08, 0.2), M.dark, ties); const mx = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0), fwd = new THREE.Vector3(), m3 = new THREE.Matrix4();
    for (let k = 0; k < ties; k++) { const p = curve.getPointAt(k / ties); curve.getTangentAt(k / ties, fwd); m3.lookAt(fwd, new THREE.Vector3(0, 0, 0), up); q.setFromRotationMatrix(m3); mx.compose(new THREE.Vector3(p.x, p.y - 0.15, p.z), q, s); tie.setMatrixAt(k, mx); }
    tie.castShadow = false; g.add(tie);
    const post = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.07, 0.1, 1, 6), M.wall, posts); q.identity();
    for (let k = 0; k < posts; k++) { const p = curve.getPointAt(k / posts); const h = Math.max(0.3, p.y - 0.35); s.set(1, h, 1); mx.compose(new THREE.Vector3(p.x, h / 2, p.z), q, s); post.setMatrixAt(k, mx); }
    g.add(post); s.set(1, 1, 1);
    const train = new THREE.Group(); train.userData.dynamic = true;
    for (let ci = 0; ci < cars; ci++) { const car = mesh(rbox(1.0, 0.5, 0.7, 0.12), [M.yellow, M.teal, M.orange, M.navy][ci % 4], -ci * 1.1, 0, 0); train.add(car); train.add(head(-ci * 1.1 + 0.1, 0.42, -0.17, ci), head(-ci * 1.1 + 0.1, 0.42, 0.17, ci + 1)); if (o.armsUp) for (const dz of [-0.17, 0.17]) train.add(mesh(rbox(0.08, 0.4, 0.08, 0.02), M.skin[ci % 3], -ci * 1.1 + 0.1, 0.72, dz * 1.6, false)); }
    g.add(train); coasters.push({ curve, train, t: rnd() }); E.mergeChildren(train);
    return curve;
  }
  // 車站：一棟有雨棚的小房子、入口的拱門、排隊的欄與人、身高牌。
  function station(g, x, z, ry, roofM, short) {
    const s = new THREE.Group(); s.position.set(x, 0, z); s.rotation.y = ry; g.add(s);
    s.add(mesh(rbox(3.0, 1.4, 1.6, 0.1), M.wall, 0, 0.7, 0), mesh(rbox(3.6, 0.18, 2.2, 0.05), roofM, 0, 1.55, 0, false), mesh(rbox(0.1, 2.2, 0.1, 0.02), M.dark, -1.2, 1.1, 1.6, false), mesh(rbox(0.1, 2.2, 0.1, 0.02), M.dark, 1.2, 1.1, 1.6, false), mesh(rbox(2.6, 0.5, 0.12, 0.05), roofM, 0, 2.3, 1.6, false));
    for (let k = 0; k < 4; k++) s.add(mesh(new THREE.CylinderGeometry(0.05, 0.06, 1.0, 6), M.dark, -1.5 + k, 0.5, 2.4, false));
    s.add(mesh(rbox(3.0, 0.04, 0.04, 0.01), M.orange, 0, 0.95, 2.4, false), mesh(rbox(0.5, 1.0, 0.06, 0.02), M.cream, 1.9, 0.9, 1.4, false), mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 5), M.dark, 1.9, 0.25, 1.4, false));
    // 小島太小的（野鼠飛車）排隊的人站近一點，不然站到海裡去（2026-11-18 第一版）。
    (short ? [[-1.2, 2.2, 1], [-0.2, 2.2, 2], [0.9, 2.2, 4], [0.2, 3.0, 0]] : [[-1.2, 2.9, 1], [-0.2, 2.9, 2], [0.9, 2.9, 4], [0.2, 3.9, 0]]).forEach(([px, pz, sh], k) => { const pp = makePerson({ shirt: sh, pack: k % 2 === 0, scale: 1.1 }); pp.position.set(px, 0, pz); pp.rotation.y = Math.PI; s.add(pp); });
    return s;
  }
  // 迴圈雲霄飛車（青色）：先爬一段高坡、俯衝、一個直立的迴圈（進出的 z 錯開一點才不會撞到自己）、兩個駝峰、一個傾斜的彎回到站。
  for (const it of islets.filter(i => i.kind === "loop")) {
    const g = base(it.x, it.z, it.r);
    const r = it.r;
    track(g, [[-6, 1.0, 2.0], [-3, 1.0, 2.0], [0, 6.5, 2.0], [3, 7.5, 2.0], [5.5, 2.0, 1.6], [7.0, 3.6, 0.6], [6.4, 7.0, -0.4], [4.2, 8.2, -1.0], [2.0, 7.0, -1.4], [1.4, 3.6, -1.0], [2.6, 1.4, -0.2], [5.5, 1.2, -3.0], [3.0, 4.2, -5.5], [-1.0, 1.2, -5.5], [-4.5, 3.8, -4.5], [-6.5, 1.4, -1.5]], M.teal, 4, { tension: 0.4, armsUp: true });
    station(g, -6, 2.0, Math.PI / 2, M.teal);
    for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; g.add(mesh(rbox(0.3, 0.5, 0.03, 0.02), [M.orange, M.teal, M.yellow][k % 3], Math.cos(a) * (r - 1.0), 2.4, Math.sin(a) * (r - 1.0), false), mesh(new THREE.CylinderGeometry(0.03, 0.04, 2.6, 5), M.dark, Math.cos(a) * (r - 1.0) - 0.15, 1.3, Math.sin(a) * (r - 1.0), false)); }
    const kiosk = E.kiosk(M.orange); kiosk.position.set(-2, 0, -2.5); kiosk.rotation.y = 0.4; g.add(kiosk);
    const b = E.bench(M.teal); b.position.set(2, 0, 5); b.rotation.y = Math.PI; g.add(b);
    E.treePlaces.push([it.x + 5, it.z + 5.5, 1.1, 0], [it.x - 5.5, it.z - 5, 1.0, 2], [it.x + 6.5, it.z - 5.5, 0.9, 1]);
  }
  // 野鼠式小飛車（黃色）：平的、很多個急轉彎、一台一台單節的車，三台一起跑。
  for (const it of islets.filter(i => i.kind === "mouse")) {
    const g = base(it.x, it.z, it.r, E.groundMat("paving"));
    const pts = [[-4.5, 3.2, -5], [4.5, 3.2, -5], [4.5, 3.2, -3], [-4.5, 3.0, -3], [-4.5, 2.8, -1], [4.5, 2.6, -1], [4.5, 2.4, 1], [-4.5, 2.0, 1], [-4.5, 1.4, 3], [4.0, 1.0, 3.2], [5.5, 1.0, 0], [5.5, 3.2, -6.5], [-4.5, 3.4, -6.5]];
    const curve = track(g, pts, M.yellow, 1, { tension: 0.15 });
    for (let k = 1; k < 3; k++) { const train = new THREE.Group(); train.userData.dynamic = true; train.add(mesh(rbox(1.0, 0.5, 0.7, 0.12), [M.orange, M.navy][k - 1], 0, 0, 0), head(0.1, 0.42, -0.17, k), head(0.1, 0.42, 0.17, k + 1)); g.add(train); coasters.push({ curve, train, t: k / 3 }); E.mergeChildren(train); }
    station(g, 0, 5.0, 0, M.yellow, true);
    E.treePlaces.push([it.x - 6.8, it.z + 2.5, 0.9, 1], [it.x + 7, it.z + 3, 1.0, 0]);
  }
  // 遊樂小島：摩天輪（最高的東西）、旋轉木馬、票亭、一排燈、長凳、幾個人。
  for (const it of islets.filter(i => i.kind === "fair")) {
    const g = base(it.x, it.z, it.r, E.groundMat("checker"));
    // 摩天輪：兩座 A 字腳、軸、輪（兩個環加十二支輻條）、十二個廂（每一幀擺到輪緣上、一直是正的）。
    const R = 6.0, wx = -2.5, wz = 0, hubY = R + 1.2;
    for (const dz of [-1.2, 1.2]) for (const dx of [-2.2, 2.2]) { const leg = mesh(new THREE.CylinderGeometry(0.12, 0.18, Math.hypot(hubY, 2.2) + 0.2, 6), M.wall, wx + dx / 2, hubY / 2, wz + dz, false); leg.rotation.z = -Math.atan2(dx, hubY); g.add(leg); }
    g.add(mesh(rbox(0.3, 0.3, 3.2, 0.05), M.dark, wx, hubY, wz, false), mesh(rbox(5.0, 0.3, 0.3, 0.05), M.wall, wx, 0.4, wz - 1.2, false), mesh(rbox(5.0, 0.3, 0.3, 0.05), M.wall, wx, 0.4, wz + 1.2, false));
    const wheel = new THREE.Group(); wheel.userData.dynamic = true; wheel.position.set(wx, hubY, wz); g.add(wheel);
    for (const dz of [-0.6, 0.6]) { const ring = mesh(new THREE.TorusGeometry(R, 0.1, 6, 36), M.orange, 0, 0, dz, false); wheel.add(ring); for (let k = 0; k < 12; k++) { const a = k / 12 * TAU; const sp = mesh(rbox(R, 0.08, 0.08, 0.02), M.orange, Math.cos(a) * R / 2, Math.sin(a) * R / 2, dz, false); sp.rotation.z = a; wheel.add(sp); } }
    for (let k = 0; k < 24; k++) { const a = k / 24 * TAU; wheel.add(mesh(new THREE.SphereGeometry(0.1, 6, 5), k % 2 ? M.light : M.amber, Math.cos(a) * R, Math.sin(a) * R, 0, false)); }
    wheel.add(mesh(new THREE.CylinderGeometry(0.5, 0.5, 1.4, 12), M.navy, 0, 0, 0, false).rotateX(Math.PI / 2));
    const pods = [];
    for (let k = 0; k < 12; k++) { const pod = new THREE.Group(); pod.userData.dynamic = true; g.add(pod); pod.add(mesh(rbox(1.0, 0.9, 1.0, 0.25), [M.teal, M.yellow, M.navy, M.cream][k % 4], 0, -0.9, 0), mesh(rbox(1.1, 0.2, 1.1, 0.05), M.orange, 0, -0.35, 0, false), mesh(rbox(0.06, 0.5, 0.06, 0.01), M.dark, 0, -0.15, 0, false)); if (k % 3 !== 2) pod.add(head(-0.2, -0.75, 0.1, k), head(0.2, -0.75, -0.1, k + 2)); E.mergeChildren(pod); pods.push(pod); }
    E.mergeChildren(wheel);
    let ang = 0; ticks.push((dt) => { ang += dt * 0.09; wheel.rotation.z = ang; for (let k = 0; k < 12; k++) { const a = ang + k / 12 * TAU; pods[k].position.set(wx + Math.cos(a) * R, hubY + Math.sin(a) * R, wz); } });
    // 旋轉木馬：圓台、中柱、八匹馬（身體、脖子、頭、一支桿）、十二片波浪的頂、一圈小燈。整座轉、馬上下。
    const cx = 4.0, cz = 2.5; const car = new THREE.Group(); car.userData.dynamic = true; car.position.set(cx, 0, cz); g.add(car);
    car.add(mesh(new THREE.CylinderGeometry(2.6, 2.7, 0.3, 24), M.cream, 0, 0.15, 0), mesh(new THREE.CylinderGeometry(0.25, 0.3, 3.0, 10), M.orange, 0, 1.8, 0, false), mesh(new THREE.ConeGeometry(3.0, 1.3, 12), M.teal, 0, 3.9, 0), mesh(new THREE.SphereGeometry(0.35, 10, 8), M.yellow, 0, 4.7, 0, false));
    for (let k = 0; k < 12; k++) { const a = k / 12 * TAU; car.add(mesh(new THREE.SphereGeometry(0.1, 6, 5), M.amber, Math.cos(a) * 2.9, 3.3, Math.sin(a) * 2.9, false)); }
    const horses = [];
    for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; const h = new THREE.Group(); h.userData.dynamic = true; h.position.set(Math.cos(a) * 1.9, 0, Math.sin(a) * 1.9); h.rotation.y = -a + Math.PI / 2; car.add(h); h.add(mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.9, 6), M.dark, 0, 1.75, 0, false), mesh(rbox(0.9, 0.4, 0.3, 0.12), [M.white, M.orange, M.teal, M.yellow][k % 4], 0, 1.0, 0), mesh(rbox(0.25, 0.5, 0.2, 0.06), [M.white, M.orange, M.teal, M.yellow][k % 4], 0.4, 1.35, 0, false), mesh(new THREE.SphereGeometry(0.17, 8, 6), M.navy, 0.55, 1.65, 0, false)); if (k % 2 === 0) h.add(head(0, 1.45, 0, k)); horses.push(h); }
    for (const h of horses) E.mergeChildren(h);
    ticks.push((dt, t) => { car.rotation.y += dt * 0.35; horses.forEach((h, k) => { h.position.y = 0.2 + Math.sin(t * 2.2 + k) * 0.18; }); });
    // 票亭、燈、長凳、幾個人在逛。
    const kiosk = E.kiosk(M.teal); kiosk.position.set(0.5, 0, -6.2); kiosk.rotation.y = Math.PI; g.add(kiosk);
    for (let k = 0; k < 4; k++) { const l = E.lamp(); const a = k / 4 * TAU + 0.4; l.position.set(Math.cos(a) * (it.r - 1.8), 0, Math.sin(a) * (it.r - 1.8)); g.add(l); }
    const b = E.bench(M.orange); b.position.set(-1, 0, 6.5); b.rotation.y = Math.PI; g.add(b);
    [[-5.5, 4, 0.5, 2], [1.5, -3, -0.4, 5], [6.5, -1, 1.6, 1], [-6, -3, 2.4, 4]].forEach(([px, pz, ry, sh], k) => { const pp = makePerson({ shirt: sh, pack: k % 2 === 1, scale: 1.1 }); pp.position.set(px, 0, pz); pp.rotation.y = ry; g.add(pp); });
    E.treePlaces.push([it.x + 7, it.z + 5.5, 1.0, 0], [it.x - 7, it.z + 6, 1.1, 2]);
  }

  // ═══ 渡輪：在島群南邊的水道來回（兩頭各一座小碼頭），船上有人；到頭停一下再掉頭。═══
  if (c.ferry) {
    const f = c.ferry; const g = new THREE.Group(); g.userData.dynamic = true; world.add(g);
    g.add(mesh(rbox(6.4, 0.9, 2.4, 0.3), M.cream, 0, 0.1, 0), mesh(rbox(3.4, 1.1, 1.9, 0.12), M.teal, -0.4, 1.1, 0), mesh(rbox(3.5, 0.3, 2.0, 0.05), M.white, -0.4, 1.8, 0, false), mesh(new THREE.CylinderGeometry(0.22, 0.26, 1.0, 8), M.orange, -1.4, 2.4, 0, false), mesh(rbox(0.08, 1.4, 0.08, 0.02), M.dark, 2.4, 1.3, 0, false), mesh(rbox(0.6, 0.4, 0.04, 0.02), M.orange, 2.4, 1.9, 0.3, false));
    for (let k = 0; k < 3; k++) g.add(mesh(rbox(0.6, 0.6, 0.06, 0.06), M.light, -1.2 + k * 0.9, 1.15, 0.97, false), mesh(rbox(0.6, 0.6, 0.06, 0.06), M.light, -1.2 + k * 0.9, 1.15, -0.97, false));
    [[2.0, 0.6, 1], [2.6, -0.5, 3], [1.4, -0.7, 5]].forEach(([px, pz, sh]) => { const pp = makePerson({ shirt: sh, scale: 1.0 }); pp.position.set(px, 0.55, pz); pp.rotation.y = -Math.PI / 2; g.add(pp); });
    for (const [x, z] of [f.a, f.b]) { const d = new THREE.Group(); d.position.set(x, 0, z); world.add(d); d.add(mesh(rbox(5, 0.25, 2.2, 0.06), M.wood, 0, 0.1, -2.4, false)); for (const [ox, oz] of [[-2, -1.5], [2, -1.5], [-2, -3.3], [2, -3.3]]) d.add(mesh(new THREE.CylinderGeometry(0.1, 0.12, 1.6, 6), M.dark, ox, -0.5, oz, false)); const l = E.lamp(); l.position.set(2, 0.2, -3.2); d.add(l); }
    E.mergeChildren(g); E.ferryObj = g;   // water.js 畫渡輪的尾浪要知道它在哪
    const span = Math.hypot(f.b[0] - f.a[0], f.b[1] - f.a[1]), ux = (f.b[0] - f.a[0]) / span, uz = (f.b[1] - f.a[1]) / span; let s = 0, dir = 1, hold = 0;
    ticks.push((dt, t) => { if (hold > 0) hold -= dt; else { s += dt * 1.6 * dir; if (s >= span) { s = span; dir = -1; hold = 6; } else if (s <= 0) { s = 0; dir = 1; hold = 6; } }
      g.position.set(f.a[0] + ux * s, -0.3 + Math.sin(t * 1.1) * 0.06, f.a[1] + uz * s); g.rotation.set(0, Math.atan2(ux * dir, uz * dir) + Math.PI / 2, Math.sin(t * 0.8) * 0.02); });
  }
  void blockersOf;
  return { tick: (dt, t) => { for (const f of ticks) f(dt, t); } };
}
