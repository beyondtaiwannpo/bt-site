// /island/ 島上的生活感（2026-11-18 Paul：「make it like somebody is living in there… right now it's still pretty much empty everywhere」）。
// 每座 team 的島：兩間有雨棚招牌的小店、一台餐車加老闆加客人、一座公車亭、腳踏車架、郵筒與消防栓、晾衣繩（會飄）、
// 一座伸到海上的小碼頭（兩艘船、一個釣魚的人、浮標會晃）、屋頂的空調與水塔與天線、煙囪的煙（會往上飄）、花、岸邊的石頭、草叢。
// 整片海：兩群鳥繞著島群飛（翅膀會拍）。機場：行李車、油槽、會轉的雷達。
// 研究的結論（docs/island/2026-11-18-島的生活感研究.md）：東西要成群（長凳加燈加垃圾桶加花台），平均撒開只是雜訊；每棟房子要有 2 到 4 樣屋頂的東西。
// 不 import three、不 import toy.js：THREE 跟引擎 E 從 scene.js 傳進來。每一樣東西的位置記進 blockersOf（人走路會繞開）、該站的點記進 poisOf。
export function buildLife(THREE, E, c) {
  const { M, P, world, rbox, makePerson } = E;
  const { islands, blockersOf, poisOf, buildingsOf, airport } = c;
  const TAU = Math.PI * 2, ticks = [];
  const mesh = (geo, m, x, y, z, shadow) => { const o = new THREE.Mesh(geo, m); o.position.set(x || 0, y || 0, z || 0); o.castShadow = shadow !== false; o.receiveShadow = true; return o; };
  const mulberry = seed => { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
  const flowers = [], rocks = [], tufts = [], bikeWheels = [], bikeFrames = [];
  const stats = { shops: 0, carts: 0, stops: 0, bikes: 0, lines: 0, docks: 0, roofs: 0, smoke: 0 }; E.lifeStats = stats;   // 除錯：console 裡 __island._E.lifeStats 看每一樣放了幾個
  const lifePlaces = new Map(); E.lifePlaces = lifePlaces;   // 每座島的小店、餐車、公車亭、碼頭落在哪（town.js 鋪路、排隊、挑沙灘的方向要看），記的是島的本地座標
  const flowerCol = [P.orange, P.yellow, P.white, P.teal, P.cream];

  for (const isl of islands) {
    if (isl.sea) continue;
    const rr = mulberry(isl.x * 31 + isl.z * 17 + 99);
    const blockers = blockersOf.get(isl.id) || [], pois = poisOf.get(isl.id) || [];
    const places = []; lifePlaces.set(isl.id, places);
    const g = new THREE.Group(); g.position.set(isl.x, 0, isl.z); world.add(g);
    // 矮樹、燈那些小東西（r 0.8 以下）不算：島上被它們佔掉的縫太多，什麼都放不下（2026-11-18 第一版每座島一間店都沒放成）。
    const free = (x, z, dmin) => Math.hypot(x, z) < isl.r - 1.8 && !blockers.some(b => (b.r || 1.2) >= 0.8 && Math.hypot(isl.x + x - b.x, isl.z + z - b.z) < (b.r || 1.2) + dmin);
    const spot = (dmin, rMin, rMax, tries) => { for (let i = 0; i < (tries || 160); i++) { const a = rr() * TAU, d = isl.r * ((rMin == null ? 0.2 : rMin) + rr() * ((rMax == null ? 0.8 : rMax) - (rMin == null ? 0.2 : rMin))); const x = Math.cos(a) * d, z = Math.sin(a) * d; if (free(x, z, dmin)) return { x, z, a }; } return null; };
    const put = (obj, pos, ry, r) => { obj.position.set(pos.x, 0, pos.z); if (ry != null) obj.rotation.y = ry; g.add(obj); blockers.push({ x: isl.x + pos.x, z: isl.z + pos.z, r: r || 1.2 }); places.push({ kind: "item", x: pos.x, z: pos.z, r: r || 1.2, g: obj }); obj.traverse(m => { if (m.isMesh) m.castShadow = true; }); return obj; };   // places 記 g：town.js 的球場放不下可以把它拿掉
    const stand = (pos, a, dist) => pois.push({ kind: "stand", face: a + Math.PI, x: pos.x + Math.sin(a) * dist, z: pos.z + Math.cos(a) * dist });
    const person = (parent, x, z, ry, o) => { const pp = makePerson({ scale: 1.1, ...(o || {}) }); pp.position.set(x, 0, z); pp.rotation.y = ry; parent.add(pp); return pp; };
    // 兩間小店：房子、斜的雨棚（team 的顏色與另一色輪流）、掛在牆上的招牌、門口的 A 字立牌、兩個窗台花箱、一張小桌兩張凳。店門口是人會站的點。
    for (let k = 0; k < 2; k++) {
      const sp = spot(1.3); if (!sp) break; stats.shops++;
      const s = new THREE.Group(); const face = Math.atan2(-sp.x, -sp.z);   // 門朝島心（批 D：之前的式子朝海，客人站到海上）
      const wallM = k ? M.wall2 : M.wall, awnM = k ? M.orange : M.teal;
      s.add(mesh(rbox(2.8, 2.3, 2.2, 0.12), wallM, 0, 1.15, 0), mesh(new THREE.ConeGeometry(2.0, 1.2, 4), k ? M.navy : M.orange, 0, 2.9, 0).rotateY(Math.PI / 4));
      const awn = mesh(rbox(3.0, 0.08, 1.2, 0.03), awnM, 0, 1.9, 1.55, false); awn.rotation.x = 0.35; s.add(awn);
      for (let i = 0; i < 4; i++) s.add(mesh(rbox(0.7, 0.3, 0.05, 0.02), i % 2 ? M.white : awnM, -1.05 + i * 0.7, 1.55, 2.1, false));
      s.add(mesh(rbox(0.7, 1.3, 0.08, 0.05), M.dark, -0.7, 0.65, 1.14, false), mesh(rbox(0.9, 0.7, 0.08, 0.06), M.light, 0.6, 1.2, 1.14, false));
      s.add(mesh(rbox(0.9, 0.2, 0.3, 0.04), M.wood, 0.6, 0.85, 1.25, false), mesh(new THREE.SphereGeometry(0.11, 6, 5), M.orange, 0.4, 1.0, 1.25, false), mesh(new THREE.SphereGeometry(0.11, 6, 5), M.yellow, 0.75, 1.0, 1.25, false));
      s.add(mesh(rbox(0.1, 0.1, 0.9, 0.02), M.dark, 1.45, 2.1, 0.9, false), mesh(rbox(0.06, 0.6, 0.8, 0.03), k ? M.yellow : M.navy, 1.5, 1.65, 1.2, false));
      const ab = new THREE.Group(); ab.position.set(-1.0, 0, 2.0); s.add(ab); for (const sgn of [-1, 1]) { const bd = mesh(rbox(0.5, 0.7, 0.04, 0.02), M.cream, 0, 0.35, sgn * 0.12, false); bd.rotation.x = sgn * 0.3; ab.add(bd); }
      put(s, sp, face, 1.9); stand(sp, face, 2.4); places.push({ kind: "shop", x: sp.x, z: sp.z, face, r: 1.9, g: s });
      person(s, 1.6, 2.6, Math.PI, { shirt: k ? 2 : 4, bag: true });
    }
    // 餐車：車身、兩個輪子、雨棚、鍋子、一個老闆站在後面、兩個客人在前面。
    { const sp = spot(1.2); if (sp) { stats.carts++; const f = new THREE.Group(); const face = Math.atan2(-sp.x, -sp.z);
      f.add(mesh(rbox(1.8, 1.0, 1.0, 0.1), M.white, 0, 0.75, 0), mesh(rbox(1.9, 0.08, 1.1, 0.03), M.wood, 0, 1.28, 0, false), mesh(rbox(2.2, 0.1, 1.6, 0.03), M.orange, 0, 2.3, 0.2, false), mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.0, 6), M.dark, -0.95, 1.8, 0.7, false), mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.0, 6), M.dark, 0.95, 1.8, 0.7, false));
      for (const x of [-0.6, 0.6]) f.add(mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.12, 10), M.dark, x, 0.28, 0, false).rotateX(Math.PI / 2));
      f.add(mesh(new THREE.CylinderGeometry(0.22, 0.2, 0.2, 10), M.dark, -0.4, 1.4, 0, false), mesh(rbox(0.5, 0.3, 0.3, 0.05), M.teal, 0.45, 1.45, 0, false));
      put(f, sp, face, 1.6); places.push({ kind: "cart", x: sp.x, z: sp.z, face, r: 1.6, g: f }); stand(sp, face, 1.6); stand({ x: sp.x + Math.cos(face) * 0.8, z: sp.z - Math.sin(face) * 0.8 }, face, 1.6);
      person(f, 0, -0.9, 0, { shirt: 3, hat: true }); person(f, -0.5, 1.4, Math.PI, { shirt: 1 }); } }
    // 公車亭：兩支柱、玻璃背板、雨棚、長凳、站牌（team 的顏色）。
    { // 公車亭站在第一條路（橋頭到島心那條）旁邊 1.7 公尺、面向路（批 E：之前隨機落點，沒有路）。
      const ra = (c.bridgeAngles.get(isl.id) || [])[0]; let sp = null;
      if (ra != null) { const d = isl.r * 0.55, px = Math.cos(ra) * d, pz = Math.sin(ra) * d, sx = -Math.sin(ra), sz = Math.cos(ra); for (const sg of [1, -1]) { const cx = px + sx * sg * 1.9, cz = pz + sz * sg * 1.9; if (free(cx, cz, 1.3)) { sp = { x: cx, z: cz, a: Math.atan2(cz, cx), face: Math.atan2(-sg * sx, -sg * sz) }; break; } } }
      if (sp) { stats.stops++; const b = new THREE.Group(); const face = sp.face;
      b.add(mesh(rbox(3.0, 0.15, 1.4, 0.04), M.navy, 0, 2.4, 0, false), mesh(new THREE.CylinderGeometry(0.06, 0.07, 2.4, 6), M.dark, -1.3, 1.2, -0.5, false), mesh(new THREE.CylinderGeometry(0.06, 0.07, 2.4, 6), M.dark, 1.3, 1.2, -0.5, false));
      const glass = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 1.8), M.shallow); glass.position.set(0, 1.3, -0.6); b.add(glass);
      const bench = E.bench(); bench.position.set(0, 0, -0.1); b.add(bench);
      b.add(mesh(new THREE.CylinderGeometry(0.04, 0.05, 2.6, 6), M.dark, 1.9, 1.3, 0.6, false), mesh(rbox(0.5, 0.5, 0.06, 0.1), M.team[isl.colour] || M.orange, 1.9, 2.5, 0.6, false));
      put(b, sp, face, 1.7); places.push({ kind: "stop", x: sp.x, z: sp.z, face, r: 1.7, g: b }); pois.push({ kind: "bench", face, x: sp.x + Math.sin(face) * 0.3, z: sp.z + Math.cos(face) * 0.3 });
      person(b, -0.9, 0.9, Math.PI, { shirt: 5, pack: true }); } }
    // 腳踏車架：三台車（輪子與車架一次畫完）、郵筒、消防栓、一個垃圾桶組。
    { const sp = spot(0.8); if (sp) { stats.bikes++; const ry = rr() * TAU; for (let k = 0; k < 3; k++) { const dx = (k - 1) * 0.7; const x = isl.x + sp.x + Math.cos(ry) * dx, z = isl.z + sp.z - Math.sin(ry) * dx; bikeWheels.push([x + Math.sin(ry) * 0.45, 0.3, z + Math.cos(ry) * 0.45, ry], [x - Math.sin(ry) * 0.45, 0.3, z - Math.cos(ry) * 0.45, ry]); bikeFrames.push([x, 0.45, z, ry]); } blockers.push({ x: isl.x + sp.x, z: isl.z + sp.z, r: 1.3 }); } }
    { const sp = spot(0.6); if (sp) put(new THREE.Group().add(mesh(rbox(0.45, 1.0, 0.45, 0.18), M.orange, 0, 0.8, 0), mesh(rbox(0.3, 0.06, 0.06, 0.02), M.dark, 0, 1.0, 0.24, false), mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.4, 6), M.dark, 0, 0.2, 0, false)), sp, null, 0.5); }
    { const sp = spot(0.6); if (sp) put(new THREE.Group().add(mesh(new THREE.CylinderGeometry(0.14, 0.16, 0.7, 8), M.teal, 0, 0.35, 0), mesh(new THREE.SphereGeometry(0.17, 8, 6), M.teal, 0, 0.75, 0, false), mesh(rbox(0.5, 0.12, 0.12, 0.04), M.teal, 0, 0.5, 0, false)), sp, null, 0.4); }
    { const sp = spot(0.8); if (sp) { const b = new THREE.Group(); [M.teal, M.orange, M.navy].forEach((m, k) => b.add(mesh(rbox(0.4, 0.7, 0.4, 0.06), m, (k - 1) * 0.5, 0.35, 0))); put(b, sp, rr() * TAU, 0.9); } }
    // 晾衣繩：兩支桿、一條線、四件衣服（會飄）。
    { const sp = spot(1.0); if (sp) { stats.lines++; const l = new THREE.Group(); const ry = rr() * TAU;
      for (const x of [-1.4, 1.4]) l.add(mesh(new THREE.CylinderGeometry(0.04, 0.05, 1.9, 6), M.dark, x, 0.95, 0, false));
      l.add(mesh(rbox(2.8, 0.03, 0.03, 0.01), M.dark, 0, 1.8, 0, false));
      const cloth = new THREE.Group(); cloth.userData.dynamic = true; cloth.position.y = 1.8; l.add(cloth);
      [M.teal, M.white, M.orange, M.yellow].forEach((m, k) => cloth.add(mesh(rbox(0.45, 0.55, 0.03, 0.02), m, -1.0 + k * 0.65, -0.3, 0, false)));
      put(l, sp, ry, 1.5); ticks.push((dt, t) => { cloth.rotation.x = Math.sin(t * 1.9 + sp.x) * 0.25; }); } }
    // 碼頭：從島緣伸出去（挑一個沒有橋的方向）、四支柱、兩艘停著的小船、一個釣魚的人（魚竿、線、浮標會晃）、一盞燈。
    { const ends = (c.bridgeAngles.get(isl.id) || []); let a = null; for (let i = 0; i < 24 && a == null; i++) { const cand = rr() * TAU; if (!ends.some(e => Math.abs(Math.atan2(Math.sin(cand - e), Math.cos(cand - e))) < 0.55)) a = cand; }
      if (a != null) { stats.docks++; places.push({ kind: "dock", a }); const d = new THREE.Group(); d.position.set(Math.cos(a) * (isl.r - 0.6), 0, Math.sin(a) * (isl.r - 0.6)); d.rotation.y = -a; g.add(d);
        d.add(mesh(rbox(4.6, 0.22, 1.6, 0.05), M.wood, 2.1, 0.08, 0, false)); for (const [ox, oz] of [[0.8, -0.6], [3.9, -0.6], [0.8, 0.6], [3.9, 0.6]]) d.add(mesh(new THREE.CylinderGeometry(0.09, 0.11, 1.5, 6), M.dark, ox, -0.6, oz, false));
        for (const [sx, sz, m, m2] of [[2.4, 1.8, M.white, M.orange], [3.6, -1.9, M.teal, M.navy]]) { const bt = new THREE.Group(); bt.position.set(sx, -0.4, sz); bt.rotation.y = 0.3; d.add(bt); bt.add(mesh(rbox(2.0, 0.45, 0.9, 0.16), m, 0, 0.1, 0), mesh(rbox(0.7, 0.4, 0.6, 0.08), m2, -0.2, 0.5, 0, false)); }
        const l = E.lamp(); l.position.set(0.6, 0, 0.55); d.add(l);
        const fisher = person(d, 3.9, 0.1, Math.PI / 2, { shirt: 0, hat: true }); void fisher;
        const rod = mesh(new THREE.CylinderGeometry(0.02, 0.025, 2.2, 5), M.wood, 4.6, 1.3, 0.1, false); rod.rotation.z = -0.9; d.add(rod);
        const line = mesh(rbox(0.015, 1.5, 0.015, 0.005), M.dark, 5.5, 0.75, 0.1, false); d.add(line);
        const bob = mesh(new THREE.SphereGeometry(0.08, 6, 5), M.orange, 5.5, -0.4, 0.1, false); bob.userData.dynamic = true; d.add(bob);
        ticks.push((dt, t) => { bob.position.y = -0.4 + Math.sin(t * 2.3 + isl.x) * 0.06; });
        blockers.push({ x: isl.x + Math.cos(a) * (isl.r - 0.6), z: isl.z + Math.sin(a) * (isl.r - 0.6), r: 1.2 }); } }
    // 屋頂的東西：做的事那幾棟平頂的（學校、小亭）放空調、水塔、天線；有煙囪的（家）冒煙。
    for (const b of buildingsOf.get(isl.id) || []) {
      const top = b.kind === "school" ? 3.45 : b.kind === "booth" ? 2.25 : b.kind === "desk" ? 0 : 0;
      if (top) { stats.roofs++; const r = new THREE.Group(); r.position.set(b.x, top, b.z); r.rotation.y = b.ry; g.add(r);
        r.add(mesh(rbox(0.7, 0.45, 0.6, 0.06), M.wall2, b.kind === "school" ? -2.0 : -0.6, 0.22, 0.3, false), mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.55, 10), M.cream, b.kind === "school" ? 1.6 : 0.5, 0.55, -0.3, false), mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.2, 4), M.dark, b.kind === "school" ? 0.2 : 0.7, 0.6, 0.6, false), mesh(rbox(0.36, 0.06, 0.36, 0.01), M.dark, b.kind === "school" ? 1.6 : 0.5, 0.2, -0.3, false));
        for (const [ox, oz] of [[-0.25, -0.25], [0.25, -0.25], [-0.25, 0.25], [0.25, 0.25]]) r.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.25, 4), M.dark, (b.kind === "school" ? 1.6 : 0.5) + ox, 0.12, -0.3 + oz, false)); }
      if (b.kind === "home") { stats.smoke++; const chimney = new THREE.Vector3(1.1 * 1.2, 3.1 * 1.2 + 0.5, -0.6 * 1.2).applyAxisAngle(new THREE.Vector3(0, 1, 0), b.ry); const smoke = new THREE.Group(); smoke.userData.dynamic = true; smoke.position.set(b.x + chimney.x, chimney.y, b.z + chimney.z); g.add(smoke);
        const puffs = []; for (let k = 0; k < 3; k++) { const pm = new THREE.MeshStandardMaterial({ color: P.white, transparent: true, opacity: 0.5, roughness: 1 }); const p = mesh(new THREE.SphereGeometry(0.22, 8, 6), pm, 0, 0, 0, false); smoke.add(p); puffs.push(p); }
        ticks.push((dt, t) => { puffs.forEach((p, k) => { const u = ((t * 0.35 + k / 3) % 1); p.position.set(Math.sin(t * 0.7 + k) * 0.25 * u, u * 2.2, Math.cos(t * 0.6 + k) * 0.2 * u); const s = 0.6 + u * 1.4; p.scale.setScalar(s); p.material.opacity = 0.5 * (1 - u); }); }); }
    }
    // 花（島緣、路邊）、岸邊的石頭、草叢：位置記下來，最後一次畫完。
    for (let k = 0; k < 28; k++) { const a = rr() * TAU, d = isl.r * (0.2 + rr() * 0.72); const x = Math.cos(a) * d, z = Math.sin(a) * d; if (!free(x, z, 0.2)) continue; flowers.push([isl.x + x, 0.18, isl.z + z, k % 5]); }
    for (let k = 0; k < 9; k++) { const a = rr() * TAU, d = isl.r + 0.3 + rr() * 1.2; rocks.push([isl.x + Math.cos(a) * d, -0.45 + rr() * 0.3, isl.z + Math.sin(a) * d, rr() * TAU, 0.5 + rr() * 0.8]); }
    for (let k = 0; k < 22; k++) { const a = rr() * TAU, d = isl.r * (0.3 + rr() * 0.62); const x = Math.cos(a) * d, z = Math.sin(a) * d; if (!free(x, z, 0.2)) continue; tufts.push([isl.x + x, 0.12, isl.z + z, rr() * TAU, 0.7 + rr() * 0.6]); }
  }
  // 一次畫完：花（五色，instanceColor）、石頭、草叢、腳踏車。
  const put = (geo, m, places, color) => { const im = new THREE.InstancedMesh(geo, m, Math.max(1, places.length)); const mx = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0); places.forEach(([x, y, z, ry, sc], i) => { q.setFromAxisAngle(up, ry || 0); s.setScalar(sc || 1); mx.compose(new THREE.Vector3(x, y, z), q, s); im.setMatrixAt(i, mx); if (color) im.setColorAt(i, color(places[i])); }); im.count = places.length; im.instanceMatrix.needsUpdate = true; if (color && im.instanceColor) im.instanceColor.needsUpdate = true; im.castShadow = false; im.receiveShadow = true; world.add(im); return im; };
  put(new THREE.SphereGeometry(0.14, 6, 5), new THREE.MeshStandardMaterial({ color: P.white, roughness: 0.8 }), flowers, p => flowerCol[p[3] % flowerCol.length]);
  put(new THREE.CylinderGeometry(0.02, 0.025, 0.3, 4), M.tree[1], flowers.map(([x, y, z]) => [x, y - 0.12, z]));
  put(new THREE.DodecahedronGeometry(0.5, 0), M.cliff, rocks);
  put(new THREE.ConeGeometry(0.22, 0.5, 5), M.tree[0], tufts);
  { const wheel = new THREE.TorusGeometry(0.3, 0.04, 6, 14); put(wheel, M.dark, bikeWheels); const frame = rbox(0.9, 0.08, 0.06, 0.02); put(frame, M.orange, bikeFrames); put(rbox(0.06, 0.5, 0.06, 0.01), M.orange, bikeFrames.map(([x, y, z, ry]) => [x + Math.sin(ry) * 0.1, y + 0.2, z + Math.cos(ry) * 0.1, ry])); }

  // ═══ 鳥：兩群各七隻（V 字），繞著島群飛，翅膀會拍。═══
  // 第四批：一群七隻的身體合成一個 Mesh（引擎的 mergeDynamic），十四片翅膀是一個 InstancedMesh，每一幀把每片的矩陣寫進去；之前一群 21 個 draw call，現在 2 個。
  const wingGeo = rbox(0.5, 0.03, 0.12, 0.01);
  for (let f = 0; f < 2; f++) {
    const flock = new THREE.Group(); flock.userData.dynamic = true; world.add(flock); const wings = [];
    const wim = new THREE.InstancedMesh(wingGeo, M.white, 14); wim.userData.dynamic = true; wim.castShadow = false; wim.frustumCulled = false; wim.instanceMatrix.setUsage(THREE.DynamicDrawUsage); flock.add(wim);
    for (let k = 0; k < 7; k++) { const b = new THREE.Group(); const row = Math.ceil(k / 2), side = k % 2 ? 1 : -1; b.position.set(-row * 1.4, -row * 0.15, side * row * 1.1); flock.add(b); b.updateMatrix();
      b.add(mesh(new THREE.ConeGeometry(0.12, 0.6, 5), M.white, 0, 0, 0, false).rotateX(Math.PI / 2).rotateZ(Math.PI)); for (const s of [-1, 1]) { const w = new THREE.Object3D(); w.position.set(s * 0.28, 0, 0); b.add(w); wings.push([w, s, b]); } }
    const R = 44 + f * 16, H = 16 + f * 5, sp = 0.055 - f * 0.012; let a = f * 2.2; const wm = new THREE.Matrix4();   // 翅膀要各自拍
    ticks.push((dt, t) => { a += dt * sp; flock.position.set(Math.cos(a) * R, H + Math.sin(t * 0.6 + f) * 0.8, Math.sin(a) * R * 0.75); flock.rotation.y = -a + Math.PI;
      wings.forEach(([w, s, b], i) => { w.rotation.x = s * Math.sin(t * 7 + w.position.x) * 0.6; w.updateMatrix(); wm.multiplyMatrices(b.matrix, w.matrix); wim.setMatrixAt(i, wm); }); wim.instanceMatrix.needsUpdate = true; });
  }
  // ═══ 機場：兩台行李車、一座油槽、會轉的雷達、走道上三盞燈。═══
  if (airport) {
    const g = new THREE.Group(); g.position.set(airport.x, 0, airport.z); world.add(g);
    for (const [x, z] of [[-3, 7.6], [-1.3, 7.6]]) g.add(mesh(rbox(1.2, 0.6, 0.7, 0.06), M.grey || M.dark, x, 0.45, z), mesh(rbox(0.5, 0.4, 0.5, 0.05), M.navy, x - 0.2, 0.95, z, false), mesh(rbox(0.5, 0.35, 0.5, 0.05), M.orange, x + 0.3, 0.92, z, false));
    g.add(mesh(new THREE.CylinderGeometry(0.9, 0.9, 1.6, 12), M.cream, -10.5, 0.8, -7.5), mesh(new THREE.CylinderGeometry(0.95, 0.95, 0.1, 12), M.dark, -10.5, 1.65, -7.5, false));
    const radar = new THREE.Group(); radar.userData.dynamic = true; radar.position.set(10.5, 0, -8.5); g.add(radar);
    radar.add(mesh(new THREE.CylinderGeometry(0.12, 0.16, 2.2, 6), M.dark, 0, 1.1, 0, false)); const dish = mesh(rbox(1.6, 0.4, 0.08, 0.04), M.cream, 0, 2.4, 0, false); radar.add(dish);
    ticks.push((dt) => { radar.rotation.y += dt * 1.4; });
    for (const x of [-7, 0, 7]) { const l = E.lamp(); l.position.set(x, 0, 8.6); g.add(l); }
  }
  return { tick: (dt, t) => { for (const f of ticks) f(dt, t); } };
}
