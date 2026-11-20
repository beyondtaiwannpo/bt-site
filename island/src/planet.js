// /island/planet.html 的 3D 場景：BT 星球（2026-11-19）。
//
// 為什麼有這一支：幹部覺得 BT 島跟 HEART 政策島太像。Paul 要「另一頁，不要拿掉島，島上的資料與做法全部帶過來，畫風跟島一樣」。
// 所以這一支只換「世界的形狀」：一顆可以轉的小星球，聚會所在北極，六個 team 繞一圈，機場在南半球，路全部接起來。
// 其他全部跟島共用：main.js（卡、清單、網址、把自己放上去、團隊頁的名單、校友、活動、貼文）、引擎（材質、燈、建築、大頭小人、牌子、射線、每一幀的迴圈）。
//
// ── 守的事，跟 scene.js 一樣 ──
// 1. 這一支不 import three 也不 import 引擎：scene.js 的 createPlanet() 把 THREE 與引擎模組傳進來（check.sh 守「只有 scene.js 碰 three 與引擎」）。
// 2. 沒有自己的每一幀迴圈：每一幀要做的事交給引擎 motion() 的 tickExtra。開了減少動態效果 main.js 不叫 motion()，畫面改一次畫一次。
// 3. 沒有色碼：顏色全部是引擎從七色混出來的材質（M、P）。
// 4. 資料與場景分開：哪些 team、做什麼、誰，全部從 data 來，這裡沒有任何一個 team 的字。

export function createPlanet(THREE, T, { stage, pins, palette, phone, data, onSelect, onHover }) {
  // 卡在星球頁是正中間的彈出視窗（Paul 2026-11-19，照 /history/ 那一個），不佔左邊，所以鏡頭只扣掉右邊的清單。
  // 卡打開時 <html> 加 pop-on，CSS 才把 #pop 變成模糊的底；這支沒載到時卡照島的樣子貼在左邊，不會整個看不到。
  const doc = document.documentElement, $ = id => document.getElementById(id), card = $("card"), pop = $("pop");
  const free = () => { const W = innerWidth; return W < 900 || doc.classList.contains("side-folded") ? W : $("sidebar").getBoundingClientRect().left; };
  const freeCentre = () => free() / 2 / innerWidth, freeWidth = () => Math.max(0.3, free() / innerWidth);
  if (card && pop) {
    new MutationObserver(() => doc.classList.toggle("pop-on", !card.hidden)).observe(card, { attributes: true, attributeFilter: ["hidden"] });
    pop.addEventListener("click", e => { if (e.target === pop) card.querySelector("[data-close]").click(); });
  }
  const E = T.createEngine({ stage, pins, palette, phone, onSelect, onHover, freeCentre, freeWidth, seed: 11 });
  const { M, P, rnd, pickables } = E;
  const TAU = Math.PI * 2, D2R = Math.PI / 180, YV = new THREE.Vector3(0, 1, 0);

  // 星球不需要海（引擎預設一片 900 公尺的海）與遠方的霧。
  for (const o of E.world.children) if (o.isMesh && o.geometry && o.geometry.type === "PlaneGeometry") o.visible = false;
  E.scene.fog = null;
  // 太陽的影子要罩住整顆星球。
  E.sun.position.set(-60, 85, 70); E.sun.target.position.set(0, 0, 0);
  { const sc = E.sun.shadow.camera; sc.left = -50; sc.right = 50; sc.top = 50; sc.bottom = -50; sc.near = 20; sc.far = 260; sc.updateProjectionMatrix(); }

  // ═══ 尺寸 ═══
  const R = 34;            // 星球半徑（公尺；人 1.7 公尺高，跟島同一個比例）
  const CAP_M = 13.5;      // 每個地方（廣場）的半徑
  const CAP = CAP_M / R;   // 同一個半徑換成角度
  const WANDER_M = 3.6;    // 人在廣場中間閒晃的範圍
  const ROAD_W = 1.4;      // 路的半寬

  // ═══ 球面的小工具 ═══
  const dirFrom = (lat, lon) => new THREE.Vector3(Math.cos(lat * D2R) * Math.sin(lon * D2R), Math.sin(lat * D2R), Math.cos(lat * D2R) * Math.cos(lon * D2R));
  function frame(up) { const ref = Math.abs(up.y) > 0.99 ? new THREE.Vector3(0, 0, 1) : YV; const east = new THREE.Vector3().crossVectors(ref, up).normalize(); return { up, east, north: new THREE.Vector3().crossVectors(up, east) }; }
  function offsetDir(f, bearing, ang) { const v = f.north.clone().multiplyScalar(Math.cos(bearing)).addScaledVector(f.east, Math.sin(bearing)); return f.up.clone().multiplyScalar(Math.cos(ang)).addScaledVector(v, Math.sin(ang)).normalize(); }
  function bearingTo(f, target) { const t = target.clone().addScaledVector(f.up, -f.up.dot(target)); return Math.atan2(t.dot(f.east), t.dot(f.north)); }
  function slerpDir(a, b, t) { const ang = a.angleTo(b); if (ang < 1e-6) return a.clone(); const s = Math.sin(ang); return a.clone().multiplyScalar(Math.sin((1 - t) * ang) / s).addScaledVector(b, Math.sin(t * ang) / s); }
  function arcPts(a, b, stepM) { const n = Math.max(1, Math.ceil(a.angleTo(b) * R / (stepM || 1))); const out = []; for (let i = 0; i <= n; i++) out.push(slerpDir(a, b, i / n)); return out; }
  const angDiff = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
  // 東西擺在球面上：up 是那一點的法線，本地 +z 朝 face（球面上的另一點）。
  const basisM = new THREE.Matrix4(), bx = new THREE.Vector3(), bz = new THREE.Vector3();
  function orient(obj, dir, faceDir, lift) {
    bz.copy(faceDir).addScaledVector(dir, -dir.dot(faceDir)); if (bz.lengthSq() < 1e-10) bz.copy(frame(dir).north); bz.normalize();
    bx.crossVectors(dir, bz); basisM.makeBasis(bx, dir, bz); obj.quaternion.setFromRotationMatrix(basisM);
    obj.position.copy(dir).multiplyScalar(R + (lift || 0));
  }

  // ═══ 地方：聚會所在北極，六個 team 一圈（北緯 22 度），機場在南半球 ═══
  const teams = data.teams;
  const outer = teams.filter(t => t.id !== "commons" && !t.sea);
  const airport = teams.find(t => t.sea);
  const place = {};
  if (teams.some(t => t.id === "commons")) place.commons = new THREE.Vector3(0, 1, 0);
  const lonOf = {}; outer.forEach((t, i) => { lonOf[t.id] = i * 360 / outer.length; place[t.id] = dirFrom(22, lonOf[t.id]); });
  if (airport) place[airport.id] = dirFrom(-36, 180 / outer.length);
  const frames = Object.fromEntries(Object.entries(place).map(([k, v]) => [k, frame(v)]));

  // ═══ 路：聚會所到每個 team、六個 team 一圈、機場接最近的兩個 team ═══
  const roads = [];
  if (place.commons) outer.forEach(t => roads.push({ a: "commons", b: t.id, pts: arcPts(place.commons, place[t.id], 1) }));
  outer.forEach((t, i) => { const u = outer[(i + 1) % outer.length]; if (u === t) return; const pts = [], n = 60, span = 360 / outer.length; for (let k = 0; k <= n; k++) pts.push(dirFrom(22, lonOf[t.id] + span * k / n)); roads.push({ a: t.id, b: u.id, pts }); });
  if (airport) outer.map(t => [t.id, place[t.id].angleTo(place[airport.id])]).sort((x, y) => x[1] - y[1]).slice(0, 2).forEach(([id]) => roads.push({ a: airport.id, b: id, pts: arcPts(place[airport.id], place[id], 1) }));
  const adj = {}; for (const k in place) adj[k] = [];
  for (const r of roads) { adj[r.a].push({ to: r.b, r, rev: false }); adj[r.b].push({ to: r.a, r, rev: true }); }
  function route(from, to) {
    const prev = { [from]: null }, q = [from];
    while (q.length) { const n = q.shift(); if (n === to) break; for (const e of adj[n] || []) if (!(e.to in prev)) { prev[e.to] = { n, e }; q.push(e.to); } }
    if (!(to in prev)) return null; const out = []; let n = to; while (prev[n]) { out.unshift(prev[n].e); n = prev[n].n; } return out;
  }

  // ═══ 星球本體：草地 ═══
  const planet = new THREE.Mesh(new THREE.SphereGeometry(R, 128, 96), M.grass); planet.receiveShadow = true; E.world.add(planet); pickables.push(planet);   // 擋住背面的東西（點不到星球另一面）

  // 一塊貼在球面上的圓：環形幾何的每一點照它離圓心多遠、往哪個方向，搬到球面上。UV 用公尺，引擎的地面花紋才對得上。
  function patch(dir, radiusM, lift, mat, segs) {
    const f = frame(dir); const g = new THREE.RingGeometry(0.001, radiusM, segs || 64, Math.max(4, Math.round(radiusM / 1.5)));
    const pos = g.attributes.position, uv = g.attributes.uv, nrm = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), d = Math.hypot(x, y), b = Math.atan2(x, y);
      const p = offsetDir(f, b, d / R); pos.setXYZ(i, p.x * (R + lift), p.y * (R + lift), p.z * (R + lift)); uv.setXY(i, x, y); nrm[i * 3] = p.x; nrm[i * 3 + 1] = p.y; nrm[i * 3 + 2] = p.z;
    }
    g.setAttribute("normal", new THREE.BufferAttribute(nrm, 3));
    const m = new THREE.Mesh(g, mat); m.receiveShadow = true; E.world.add(m); return m;
  }
  // 廣場的邊：一圈白色的路緣，從地面下一點到廣場面。
  function curb(dir, radiusM, lift, mat) {
    const f = frame(dir), n = 96, posA = [], idx = [];
    for (let k = 0; k <= n; k++) { const p = offsetDir(f, k / n * TAU, radiusM / R); const lo = p.clone().multiplyScalar(R - 0.3), hi = p.clone().multiplyScalar(R + lift); posA.push(lo.x, lo.y, lo.z, hi.x, hi.y, hi.z); if (k) { const j = k * 2; idx.push(j - 2, j - 1, j, j - 1, j + 1, j); } }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(posA, 3)); g.setIndex(idx); g.computeVertexNormals();
    const m = new THREE.Mesh(g, mat); m.castShadow = false; m.receiveShadow = true; E.world.add(m); return m;
  }
  // 路：一條平的帶子貼在球面上。
  function ribbon(pts, w, lift, mat) {
    const pos = [], idx = [], uvs = []; let run = 0;
    pts.forEach((p, i) => {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      const tan = b.clone().sub(a).normalize(), side = new THREE.Vector3().crossVectors(p, tan).normalize(), c = p.clone().multiplyScalar(R + lift);
      if (i) run += pts[i - 1].angleTo(p) * R;
      const l = c.clone().addScaledVector(side, w), r = c.clone().addScaledVector(side, -w); pos.push(l.x, l.y, l.z, r.x, r.y, r.z); uvs.push(0, run, w * 2, run);
      if (i) { const k = i * 2; idx.push(k - 2, k - 1, k, k - 1, k + 1, k); }
    });
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2)); g.setIndex(idx); g.computeVertexNormals();
    const m = new THREE.Mesh(g, mat); m.receiveShadow = true; E.world.add(m); return m;
  }
  for (const r of roads) { ribbon(r.pts, ROAD_W + 0.25, 0.04, M.wall); ribbon(r.pts, ROAD_W, 0.07, M.road); }

  // ═══ 每個地方：一塊廣場（地面花紋跟島一樣用 teams.json 的 ground）、旗桿、做的事一樣一棟、島上那一套擺設 ═══
  // 擺設（桌椅、長凳、燈、花台、遊樂場、教室、菜園⋯）直接叫引擎蓋島用的 decorate() 與 furnish()：先蓋在一塊平的本地座標上（+x 東、-z 北），
  // 再一樣一樣搬到球面上（rehome）。所以島上那一套細節不用重寫，島改了這裡也跟著改。
  const placeObjs = new Map(); const LIFT = 0.28; const curbMat = E.std(P.white.clone().lerp(P.cream, 0.4), { side: THREE.DoubleSide });
  const qT = new THREE.Quaternion(), qB = new THREE.Quaternion(), mB = new THREE.Matrix4(), south = new THREE.Vector3(), up3 = new THREE.Vector3();
  const local2dir = (f, x, z) => offsetDir(f, Math.atan2(x, -z), Math.hypot(x, z) / R);
  function rehome(f, obj) {
    const p = obj.position, d = local2dir(f, p.x, p.z);
    south.copy(f.north).negate(); mB.makeBasis(f.east, f.up, south); qB.setFromRotationMatrix(mB); qT.setFromUnitVectors(f.up, d);
    const q = qT.clone().multiply(qB); const y = p.y;
    obj.quaternion.premultiply(q); obj.position.copy(d).multiplyScalar(R + LIFT).addScaledVector(up3.copy(d), y);
    (obj.userData.program ? E.world : deco).add(obj);   // 房子自己合過了（點得到）；其他擺設全部進 deco，最後合成幾個
  }
  // 引擎把桌邊的椅凳、矮樹、樹、柱子記在清單裡最後一次畫完（平面座標）。這裡把每個地方新增的那幾筆拿走，自己在球面上畫。
  const extra = { trees: [], bushes: [], stools: [], posts: [] };
  const deco = new THREE.Group(); E.world.add(deco);
  for (const [id, dir] of Object.entries(place)) {
    const tm = teams.find(t => t.id === id); const f = frames[id];
    const top = patch(dir, CAP_M, LIFT, tm.sea ? M.road : E.groundMat(tm.ground)); top.userData.sel = { kind: "team", team: id }; pickables.push(top);
    curb(dir, CAP_M, LIFT, curbMat);
    const g = new THREE.Group(); E.world.add(g);
    const roadB = adj[id].map(e => bearingTo(f, e.rev ? e.r.pts[e.r.pts.length - 6] || e.r.pts[0] : e.r.pts[5] || e.r.pts[1]));
    const lx = (b, d) => Math.sin(b) * d, lz = (b, d) => -Math.cos(b) * d;
    // 路的那幾條走廊先佔起來，擺設才不會擺到路上；中間閒晃的那一圈也空著。
    const blockers = [{ x: 0, z: 0, r: WANDER_M }];
    for (const b of roadB) for (let d = WANDER_M; d < CAP_M + 1; d += 1.5) blockers.push({ x: lx(b, d), z: lz(b, d), r: ROAD_W + 0.6 });
    // 做的事一樣一棟，排在路之間（大的先排），旗桿也找一個空位。
    const items = (tm.programs || []).map(p => ({ p, r: Math.min(4.6, (T.KIND_R[p.kind] || 3) * 1.05) })).sort((a, b) => b.r - a.r);
    items.push({ flag: true, r: 0.9 });
    const placed = [], buildings = []; let flag = null;
    for (const it of items) {
      const d = Math.max(WANDER_M + it.r + 0.8, CAP_M - it.r - 0.8);
      let best = 0, bestScore = -1e9;
      for (let deg = 0; deg < 360; deg += 4) {
        const b = deg * D2R; let score = 1e9;
        for (const rb of roadB) { const ad = angDiff(b, rb); const lateral = ad >= Math.PI / 2 ? 99 : d * Math.sin(ad); score = Math.min(score, lateral - (it.r + ROAD_W + 0.6)); }
        for (const q of placed) score = Math.min(score, Math.hypot(lx(b, d) - lx(q.b, q.d), lz(b, d) - lz(q.b, q.d)) - (it.r + q.r + 0.6));
        if (score > bestScore) { bestScore = score; best = b; }
      }
      placed.push({ b: best, d, r: it.r }); const x = lx(best, d), z = lz(best, d);
      if (it.flag) { flag = E.flagpole(g, x, z, M.team[tm.colour]); blockers.push({ x, z, r: 0.6 }); }
      else {
        const b = E.building(it.p.kind, M.team[tm.colour]); b.position.set(x, 0, z); b.rotation.y = Math.atan2(-x, -z); g.add(b);   // 正面（+z）朝廣場中心
        blockers.push({ x, z, r: T.KIND_R[it.p.kind] || 3.2 });
        for (const o of E.mergeChildren(b, { kind: "program", team: id, program: it.p.id })) pickables.push(o);
        b.userData.pin = E.pin("pin-prog", { goProgram: it.p.id, team: id }, true); b.userData.program = it.p; b.userData.dir = local2dir(f, x, z); buildings.push(b);
      }
    }
    if (!tm.sea) {
      const fa = placed.length ? Math.atan2(lz(placed[placed.length - 1].b, 1), lx(placed[placed.length - 1].b, 1)) : 0;
      const isl = { id, x: 0, z: 0, r: CAP_M, shape: "round", angle: fa };
      const n0 = { t: E.treePlaces.length, b: E.bushPlaces.length, s: E.stoolPlaces.length, p: E.postPlaces.length };
      E.decorate(tm.scenery, isl, g, blockers, fa, []); E.furnish(isl, g, blockers, fa, [], []);
      for (const [x, z, sc, k] of E.treePlaces.splice(n0.t)) extra.trees.push({ d: local2dir(f, x, z), s: sc, k: k | 0, lift: LIFT });
      for (const [x, z, sc] of E.bushPlaces.splice(n0.b)) extra.bushes.push({ d: local2dir(f, x, z), s: sc });
      for (const [x, z] of E.stoolPlaces.splice(n0.s)) extra.stools.push({ d: local2dir(f, x, z) });
      for (const [x, y, z] of E.postPlaces.splice(n0.p)) extra.posts.push({ d: local2dir(f, x, z), y });
    }
    for (const c of g.children.slice()) rehome(f, c);
    E.world.remove(g);
    const pin = E.pin("pin-team c-" + tm.colour, { goTeam: id });
    placeObjs.set(id, { id, tm, dir, top, pin, flag, buildings, blockers, f });
  }

  // 擺設合併（跟島一樣只差底色的合成同一個）：幾千個小零件變成十幾個 draw call。deco 跟著星球一起轉，所以合在它的本地座標就對。
  E.setMerge({ colours: true, cell: 400 }); E.mergeChildren(deco);

  // ═══ 湖與樹（避開廣場與路）═══
  const roadPts = roads.flatMap(r => r.pts.filter((_, i) => i % 2 === 0));
  const nearRoad = (d, m) => roadPts.some(p => p.angleTo(d) * R < m);
  const nearPlace = (d, m) => Object.values(place).some(p => p.angleTo(d) * R < CAP_M + m);
  const randDir = () => new THREE.Vector3(rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1).normalize();
  const lakes = [];
  for (let tries = 0; lakes.length < 5 && tries < 600; tries++) {
    const d = randDir(), r = 5 + rnd() * 3.5;
    if (nearPlace(d, r + 3) || nearRoad(d, r + 3) || lakes.some(l => l.d.angleTo(d) * R < l.r + r + 6)) continue;
    lakes.push({ d, r }); patch(d, r + 1.6, 0.03, M.beach, 48); patch(d, r, 0.06, M.water, 48);
  }
  {
    const spots = [];
    for (let tries = 0; spots.length < (phone ? 170 : 260) && tries < 9000; tries++) {
      const d = randDir();
      if (nearPlace(d, 1.5) || nearRoad(d, ROAD_W + 1.2) || lakes.some(l => l.d.angleTo(d) * R < l.r + 2.2) || spots.some(s => s.d.angleTo(d) * R < 2.2)) continue;
      spots.push({ d, s: 0.8 + rnd() * 0.6, k: Math.floor(rnd() * 3), lift: 0 });
    }
    spots.push(...extra.trees);   // 廣場上的擺設種的樹
    // 跟島上同一種樹：一根樹幹加一顆圓的樹冠，三種綠輪流。
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s3 = new THREE.Vector3(), p3 = new THREE.Vector3();
    const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.12, 0.16, 0.8, 6).translate(0, 0.4, 0), M.trunk, spots.length);
    const crowns = [0, 1, 2].map(k => new THREE.InstancedMesh(new THREE.SphereGeometry(0.8, 12, 9).translate(0, 1.35, 0), M.tree[k], spots.length));
    const counts = [0, 0, 0];
    spots.forEach((sp, i) => { q.setFromUnitVectors(YV, sp.d); p3.copy(sp.d).multiplyScalar(R + (sp.lift || 0)); s3.setScalar(sp.s); m4.compose(p3, q, s3); trunks.setMatrixAt(i, m4); crowns[sp.k].setMatrixAt(counts[sp.k]++, m4); });
    trunks.castShadow = true; E.world.add(trunks);
    crowns.forEach((c, k) => { c.count = counts[k]; c.castShadow = true; c.receiveShadow = true; E.world.add(c); });
    // 矮樹、桌邊的椅凳、柱子（跟引擎畫島的那幾樣同樣的形狀）。
    const inst = (geo, mat, list, mk) => { if (!list.length) return; const im = new THREE.InstancedMesh(geo, mat, list.length); list.forEach((it, i) => { mk(it); im.setMatrixAt(i, m4); }); im.castShadow = true; im.receiveShadow = true; E.world.add(im); };
    inst(new THREE.SphereGeometry(0.5, 10, 8).translate(0, 0.6, 0), M.tree[1], extra.bushes, it => { q.setFromUnitVectors(YV, it.d); p3.copy(it.d).multiplyScalar(R + LIFT); s3.set(it.s * 1.1, it.s * 0.5, it.s * 1.1); m4.compose(p3, q, s3); });
    inst(new THREE.CylinderGeometry(0.22, 0.2, 0.42, 10).translate(0, 0.21, 0), M.wood, extra.stools, it => { q.setFromUnitVectors(YV, it.d); p3.copy(it.d).multiplyScalar(R + LIFT); s3.setScalar(1); m4.compose(p3, q, s3); });
    inst(new THREE.CylinderGeometry(0.07, 0.07, 0.9, 6), M.dark, extra.posts, it => { q.setFromUnitVectors(YV, it.d); p3.copy(it.d).multiplyScalar(R + LIFT + it.y); s3.setScalar(1); m4.compose(p3, q, s3); });
  }

  // ═══ 雲與一架繞著星球飛的飛機 ═══
  const orbiters = [];
  function orbit(obj, r, tilt, speed, start) {
    const pivot = new THREE.Object3D(); pivot.quaternion.setFromEuler(new THREE.Euler(tilt[0], tilt[1], 0)); pivot.rotateZ(start);
    obj.position.set(0, r, 0); pivot.add(obj); E.world.add(pivot); orbiters.push({ pivot, speed }); return pivot;
  }
  for (let i = 0; i < (phone ? 6 : 9); i++) {
    const c = new THREE.Group();
    for (const [x, y, z, r] of [[0, 0, 0, 1.6], [1.6, -0.3, 0.3, 1.2], [-1.5, -0.35, -0.1, 1.1], [0.4, 0.5, -0.6, 1.0]]) { const s = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 9), M.cloud); s.position.set(x, y, z); c.add(s); }
    c.rotation.z = Math.PI / 2;
    orbit(c, R + 9 + rnd() * 5, [rnd() * Math.PI, rnd() * Math.PI], 0.02 + rnd() * 0.02, rnd() * TAU);
  }
  {
    const pl = E.makePlane(M.white, M.team.orange); pl.scale.setScalar(0.9);
    const holder = new THREE.Object3D(); holder.add(pl); pl.rotation.y = -Math.PI / 2;   // 飛機的頭朝 +z；繞圈時往 -x 走，所以轉 -90 度
    orbit(holder, R + 16, [0.9, 0.5], 0.07, 0);
  }

  // ═══ 人：跟島上同一批大頭小人。引擎的 addWalker 做人與牌子，走路由這裡管（球面上走）═══
  const ws = [];
  const SEP = 0.9 / R;
  function addWalker(person, opts) {
    const home = place[person.team] ? person.team : (airport && person.role === "alumni" ? airport.id : null); if (!home) return null;
    const w = E.addWalker(person, { ...(opts || {}), isl: { id: home, x: 0, z: 0, r: CAP_M }, start: { x: 0, z: 0 } });
    const i = E.walkers.indexOf(w); if (i >= 0) E.walkers.splice(i, 1);   // 引擎的平面導航不管這些人
    const carrier = new THREE.Object3D(); E.world.add(carrier); carrier.add(w.g); w.g.position.set(0, 0, 0); w.g.rotation.set(0, 0, 0);
    const goes = person.goes || (person.flow && person.flow.to) || "";
    Object.assign(w, { carrier, homeId: home, at: home, travelTo: "", visits: 0, sp: null, si: 0, sf: 0, wait2: rnd() * 3,
      dir: offsetDir(frames[home], rnd() * TAU, Math.sqrt(rnd()) * WANDER_M / R), head: offsetDir(frames[home], rnd() * TAU, 0.2), goes: place[goes] ? goes : "", speed: 0.9 + rnd() * 0.3 });
    ws.push(w); placeWalker(w); return w;
  }
  function removeWalker(w) { E.world.remove(w.carrier); E.people.free(w.g); w.pin.remove(); const i = ws.indexOf(w); if (i >= 0) ws.splice(i, 1); }
  function placeWalker(w) { orient(w.carrier, w.dir, w.head, LIFT * (onPlaza(w.dir) ? 1 : 0) + 0.07); }
  const onPlaza = d => Object.values(place).some(p => p.angleTo(d) < CAP);
  const partners = {}; for (const c of data.connections || []) { (partners[c.a] ||= []).push(c.b); (partners[c.b] ||= []).push(c.a); }
  function setPath(w, pts) { w.sp = pts; w.si = 0; w.sf = 0; }
  function go(w, dest) {
    const edges = route(w.at, dest); if (!edges) return false;
    let pts = arcPts(w.dir, place[w.at], 0.8);
    for (const e of edges) { const seg = e.rev ? e.r.pts.slice().reverse() : e.r.pts; pts = pts.concat(seg.slice(1)); }
    w.travelTo = dest; setPath(w, pts); return true;
  }
  function plan(w) {
    if (w.at !== w.homeId && w.visits <= 0 && go(w, w.homeId)) return;
    if (w.at === w.homeId && rnd() < (w.goes ? 0.45 : 0.18)) {
      const opts = (partners[w.homeId] || []).filter(x => place[x]);
      const dest = w.goes || (place.commons && rnd() < 0.35 ? "commons" : opts[Math.floor(rnd() * opts.length)] || (adj[w.homeId][0] || {}).to);
      if (dest && dest !== w.at) { w.visits = 2 + Math.floor(rnd() * 3); if (go(w, dest)) return; }
    }
    if (w.at !== w.homeId) w.visits--;
    setPath(w, arcPts(w.dir, offsetDir(frames[w.at], rnd() * TAU, Math.sqrt(rnd()) * WANDER_M / R), 0.5));   // 中間那一圈是空著的（擺設的 blockers 第一個就是它）
  }
  function stepWalker(w, dt, t) {
    const u = w.g.userData;
    if (!w.sp) { w.wait2 -= dt; u.moving = false; if (w.wait2 <= 0) plan(w); E.pose(w.g, t); return; }
    let ds = (w.travelTo ? 1.5 : 1.0) * w.speed * dt / R; const S = w.sp;
    while (ds > 0 && w.si < S.length - 1) { const len = S[w.si].angleTo(S[w.si + 1]) || 1e-6, rem = len * (1 - w.sf); if (ds < rem) { w.sf += ds / len; ds = 0; } else { ds -= rem; w.si++; w.sf = 0; } }
    if (w.si >= S.length - 1) {
      w.dir = S[S.length - 1].clone(); w.sp = null; u.moving = false;
      if (w.travelTo) { w.at = w.travelTo; w.travelTo = ""; w.wait2 = 0.5 + rnd() * 1.5; } else w.wait2 = 2 + rnd() * 6;
    } else {
      w.dir = slerpDir(S[w.si], S[w.si + 1], w.sf).normalize();
      const want = S[w.si + 1].clone().sub(S[w.si]); w.head.lerp(want.normalize(), 1 - Math.exp(-dt * 8));
      u.moving = true; u.wt = (u.wt || 0) + w.speed * dt / 1.2;
    }
    placeWalker(w); E.pose(w.g, t);
  }
  function separate() {
    for (let i = 0; i < ws.length; i++) for (let j = i + 1; j < ws.length; j++) {
      const a = ws[i], b = ws[j], ang = a.dir.angleTo(b.dir); if (ang >= SEP || ang < 1e-7) continue;
      const v = a.dir.clone().sub(b.dir).normalize().multiplyScalar((SEP - ang) * 0.5); a.dir.add(v).normalize(); b.dir.sub(v).normalize();
    }
  }
  for (const p of data.people) addWalker(p);
  for (let k = 0; k < 30; k++) separate(); ws.forEach(placeWalker);

  // ═══ 協作線：地方跟地方之間一條拱在天上的橘色細管，開了「協作線」或選了那個地方才亮 ═══
  const lineMat = E.std(P.orange, { emissive: P.orange, emissiveIntensity: 0.35 });
  const lines = [];
  for (const c of data.connections || []) {
    if (!place[c.a] || !place[c.b]) continue; const pts = [];
    for (let i = 0; i <= 48; i++) { const k = i / 48; pts.push(slerpDir(place[c.a], place[c.b], k).normalize().multiplyScalar(R + 2 + 9 * Math.sin(Math.PI * k))); }
    const m = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 96, 0.18, 6), lineMat); m.visible = false; E.world.add(m); lines.push({ a: c.a, b: c.b, mesh: m });
  }

  // ═══ 鏡頭：星球在中間轉（拖曳轉星球、滾輪縮放）；選一個地方就把它轉到前面斜著看；選一個人就跟在他後面 ═══
  const show = { names: false, selectedTeam: "", flows: false };
  const view = { focus: null, dist: 0, zoom: 1, follow: null, bird: false, spin: { x: 0, y: 0 }, qGoal: null };
  const CAM_DIR = new THREE.Vector3(0, 0.22, 1).normalize(), AX = new THREE.Vector3(1, 0, 0);
  let SW = stage.clientWidth || 300, SH = stage.clientHeight || 200;
  const measure = () => { SW = stage.clientWidth || 300; SH = stage.clientHeight || 200; };
  if ("ResizeObserver" in window) new ResizeObserver(measure).observe(stage);
  const halfV = () => E.camera.fov * D2R / 2;
  function fitDist(radius) { const fw = typeof freeWidth === "function" ? freeWidth() : 1; const hh = Math.atan(Math.tan(halfV()) * E.camera.aspect * fw); return Math.max(radius / Math.sin(halfV()), radius / Math.sin(hh)); }
  // 要看的東西落在卡與清單中間空出來的那一塊：投影整個往旁邊挪。
  let lastOff = "";
  function viewOffset() {
    const fc = typeof freeCentre === "function" ? freeCentre() : 0.5; const x = Math.round(-(fc - 0.5) * SW), key = x + "," + SW + "," + SH;
    if (key === lastOff) return; lastOff = key;
    if (x === 0) E.camera.clearViewOffset(); else E.camera.setViewOffset(SW, SH, x, 0, SW, SH);
  }
  const wq = new THREE.Quaternion(), tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();
  function faceToCamera(localDir, tilt) {
    const now = localDir.clone().applyQuaternion(E.world.quaternion).normalize();
    const target = CAM_DIR.clone().applyAxisAngle(AX, -tilt);
    view.qGoal = new THREE.Quaternion().setFromUnitVectors(now, target).multiply(E.world.quaternion);
  }
  // 每一幀（或沒有動畫時改一次）算鏡頭要去哪：寫進引擎的 cam.goalPos / goalTgt，引擎自己阻尼追過去。
  function aim() {
    viewOffset();
    const cam = E.cam;
    if (view.follow && ws.includes(view.follow)) {
      const w = view.follow; const p = tmp.copy(w.dir).multiplyScalar(R + LIFT); E.world.localToWorld(p);
      const n = tmp2.copy(w.dir).applyQuaternion(E.world.quaternion).normalize();
      const back = new THREE.Vector3(0, -1, 0).addScaledVector(n, n.y).normalize();
      cam.goalTgt.copy(p).addScaledVector(n, 1.2); cam.goalPos.copy(p).addScaledVector(n, 11 * view.zoom).addScaledVector(back, 15 * view.zoom);
      E.camera.up.lerp(n, 0.15).normalize();
      return;
    }
    E.camera.up.lerp(YV, 0.15).normalize();
    if (view.focus) {
      const p = tmp.copy(place[view.focus]).multiplyScalar(R); E.world.localToWorld(p);
      const d = fitDist(CAP_M + 9) * view.zoom;
      cam.goalTgt.copy(p); cam.goalPos.copy(p).addScaledVector(CAM_DIR, d);
      return;
    }
    cam.goalTgt.set(0, 0, 0); cam.goalPos.copy(CAM_DIR).multiplyScalar(fitDist(R + 12) * view.zoom);
  }
  let lastGoalD = 0;
  function zoomBy(k) { view.zoom = Math.min(1.6, Math.max(view.focus || view.follow ? 0.45 : 0.42, view.zoom * k)); }
  E.onDrag = (dx, dy) => {
    if (view.follow) { view.follow = null; selectTeamLook(show.selectedTeam); }
    view.qGoal = null;
    const k = 2.6 / Math.max(SW, SH) * Math.min(1, view.zoom + 0.2);
    wq.setFromAxisAngle(YV, dx * k); E.world.quaternion.premultiply(wq); wq.setFromAxisAngle(AX, dy * k); E.world.quaternion.premultiply(wq);
    view.spin.x = dx * k * 60; view.spin.y = dy * k * 60; E.dirty();
    if (!E.motionOn) { aim(); E.snapCam(); }
  };
  E.onWheel = dy => { zoomBy(Math.exp(dy * 0.0012)); aim(); lastGoalD = E.cam.goalPos.distanceTo(E.cam.goalTgt); };

  // ═══ 牌子 ═══
  const wp = new THREE.Vector3(), nW = new THREE.Vector3(), toCam = new THREE.Vector3();
  function facing(localDir, worldPos) { nW.copy(localDir).applyQuaternion(E.world.quaternion); toCam.copy(E.camera.position).sub(worldPos).normalize(); return nW.dot(toCam) > 0.12; }
  E.placePins = () => {
    for (const o of placeObjs.values()) {
      wp.copy(o.dir).multiplyScalar(R + 10); E.world.localToWorld(wp);
      const p = E.project(wp.x, wp.y, wp.z); if (!facing(o.dir, wp)) p.visible = false;
      const hw = (o.pin._w || (o.pin._w = o.pin.offsetWidth)) / 2 + 8, sw = E.canvas.clientWidth; if (hw * 2 < sw) p.x = Math.min(sw - hw, Math.max(hw, p.x));   // 星球邊上的名牌不要被螢幕切掉
      E.putPin(o.pin, p);
      if (o.evPin) E.putPin(o.evPin, p, 34);
      for (const b of o.buildings) {
        E.setHidden(b.userData.pin, show.selectedTeam !== o.id); if (b.userData.pin.hidden) continue;
        wp.copy(b.userData.dir).multiplyScalar(R + 6.5); E.world.localToWorld(wp); const q = E.project(wp.x, wp.y, wp.z); if (!facing(b.userData.dir, wp)) q.visible = false; E.putPin(b.userData.pin, q);
      }
    }
    for (const w of ws) {
      const on = show.names || w.me || show.selectedTeam === w.at || view.follow === w; E.setHidden(w.pin, !on); if (!on) continue;
      wp.copy(w.dir).multiplyScalar(R + 2.9); E.world.localToWorld(wp); const p = E.project(wp.x, wp.y, wp.z); if (!facing(w.dir, wp)) p.visible = false; E.putPin(w.pin, p);
    }
  };

  // ═══ 每一幀（引擎的 motion() 叫）═══
  function tick(dt, t) {
    // 選了地方：星球轉過去（阻尼追）；放手後的慣性；八秒沒人碰、也沒選東西就慢慢自轉。
    if (view.qGoal) { E.world.quaternion.slerp(view.qGoal, 1 - Math.exp(-dt * 3)); if (E.world.quaternion.angleTo(view.qGoal) < 0.002) view.qGoal = null; E.dirty(); }
    else if (Math.abs(view.spin.x) + Math.abs(view.spin.y) > 0.002) { wq.setFromAxisAngle(YV, view.spin.x * dt); E.world.quaternion.premultiply(wq); wq.setFromAxisAngle(AX, view.spin.y * dt); E.world.quaternion.premultiply(wq); const k = Math.exp(-dt * 3); view.spin.x *= k; view.spin.y *= k; E.dirty(); }
    else if (!view.focus && !view.follow && E.idleFor() > 8000) { wq.setFromAxisAngle(YV, 0.03 * dt); E.world.quaternion.premultiply(wq); E.dirty(); }
    if (view.follow && ws.includes(view.follow)) { const n = view.follow.dir.clone().applyQuaternion(E.world.quaternion); const target = CAM_DIR.clone().applyAxisAngle(AX, -0.55); wq.setFromUnitVectors(n, n.clone().lerp(target, 1 - Math.exp(-dt * 1.5)).normalize()); E.world.quaternion.premultiply(wq); E.dirty(); }
    // 手機兩指縮放：引擎改的是 goalPos 的距離，這裡讀回來換成 zoom。
    const gd = E.cam.goalPos.distanceTo(E.cam.goalTgt); if (lastGoalD && Math.abs(gd / lastGoalD - 1) > 0.002) zoomBy(gd / lastGoalD);
    for (const w of ws) stepWalker(w, dt, t);
    separate();
    for (const o of orbiters) o.pivot.rotateZ(o.speed * dt);
    aim(); lastGoalD = E.cam.goalPos.distanceTo(E.cam.goalTgt);
  }

  function selectTeamLook(id) {
    show.selectedTeam = id || "";
    for (const o of placeObjs.values()) { const on = o.id === show.selectedTeam; o.pin.classList.toggle("on", on); if (o.flag) o.flag.material = on ? M.light : M.team[o.tm.colour]; }
    for (const l of lines) l.mesh.visible = !view.follow && (show.flows || (!!show.selectedTeam && (l.a === show.selectedTeam || l.b === show.selectedTeam)));   // 跟著一個人走的時候弧線會從鏡頭前面穿過，先收起來
    for (const o of placeObjs.values()) for (const b of o.buildings) b.userData.pin.classList.remove("on");
  }
  function settle() { aim(); if (!E.motionOn) { if (view.qGoal) { E.world.quaternion.copy(view.qGoal); view.qGoal = null; aim(); } E.snapCam(); } else E.placePins(); lastGoalD = E.cam.goalPos.distanceTo(E.cam.goalTgt); }

  // 開頁：從遠處拉近（引擎阻尼追）。
  E.resize(); measure(); aim(); E.cam.pos.copy(E.cam.goalPos).multiplyScalar(1.8); E.cam.tgt.set(0, 0, 0); E.placeCam(); lastGoalD = E.cam.goalPos.distanceTo(E.cam.goalTgt);
  // ═══ 漫畫風（?look=comic，2026-11-19 Paul 喜歡第一版原型的「漫畫感」）═══
  // 兩件事：光照只留三階（亮、中、暗，像賽璐璐上色），每個東西外面一圈深藍描邊（把模型往外推一點、只畫背面）。
  // 不換材質，只在每個材質的著色器裡加幾行，所以人換衣服、新加的人也一樣。描邊會讓 draw call 變兩倍，所以只在網址帶 look=comic 時開。
  const COMIC = new URLSearchParams(location.search).get("look") === "comic";
  const inkMats = {};
  function inkMat(w) {
    if (inkMats[w]) return inkMats[w];
    const m = new THREE.MeshBasicMaterial({ color: P.navy, side: THREE.BackSide });
    m.onBeforeCompile = sh => { sh.vertexShader = sh.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\n transformed += normalize(normal) * " + w.toFixed(3) + ";"); };
    m.customProgramCacheKey = () => "ink" + w; return (inkMats[w] = m);
  }
  const celDone = new WeakSet();
  function cel(m) {
    if (!m || !m.isMeshStandardMaterial || celDone.has(m)) return; celDone.add(m);
    m.onBeforeCompile = sh => { sh.fragmentShader = sh.fragmentShader.replace("#include <lights_fragment_end>", `#include <lights_fragment_end>
      vec3 irr = reflectedLight.directDiffuse / max(diffuseColor.rgb, vec3(0.002)); float lv = max(max(irr.r, irr.g), irr.b);
      reflectedLight.directDiffuse = diffuseColor.rgb * (lv < 0.3 ? 0.3 : lv < 0.75 ? 0.68 : 1.0) * irr / max(lv, 0.002); reflectedLight.directSpecular *= 0.15;`); };
    m.customProgramCacheKey = () => "cel"; m.needsUpdate = true;
  }
  function ink(root) {
    if (!COMIC) return;
    const list = []; root.traverse(o => { if (o.isMesh && !o.userData.ink && o.geometry && o.geometry.attributes.normal) list.push(o); });
    for (const o of list) {
      o.userData.ink = true; [].concat(o.material).forEach(cel);
      if ([].concat(o.material).some(m => m.transparent && m.opacity < 0.95)) continue;
      if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
      const w = o === planet ? 0.2 : o.geometry.boundingSphere.radius > 6 ? 0.07 : 0.045;
      const h = o.isInstancedMesh ? new THREE.InstancedMesh(o.geometry, inkMat(w), o.count) : new THREE.Mesh(o.geometry, inkMat(w));
      if (o.isInstancedMesh) h.instanceMatrix = o.instanceMatrix;
      h.userData.ink = true; h.castShadow = h.receiveShadow = false; h.raycast = () => {}; o.add(h);
    }
  }
  ink(E.scene);

  // 不做引擎的整體合併（mergeStatic）：它照世界座標烤，星球會一直轉，烤進去就錯位。每一棟房子已經各自合成幾個（mergeChildren）。

  return {
    labels({ teams: names, people, me }) {
      for (const o of placeObjs.values()) { o.pin.textContent = names[o.id] || ""; o.pin._w = 0; }
      for (const o of placeObjs.values()) for (const b of o.buildings) b.userData.pin.textContent = (people.programs && people.programs[b.userData.program.id]) || "";
      for (const w of ws) { const sp = w.pin.querySelector("span"); (sp || w.pin).textContent = w.me ? (me || w.person.code) : (people[w.person.code] || ""); }
      E.placePins();
    },
    select(sel) {
      view.zoom = 1; view.bird = false;
      const w = sel && sel.kind === "person" ? ws.find(x => x.person.code === sel.code) : null;
      view.follow = w || null; view.focus = !w && sel && sel.team && place[sel.team] ? sel.team : null;
      selectTeamLook(sel && sel.team ? sel.team : (w ? w.at : ""));
      for (const x of ws) x.pin.classList.toggle("on", !!(w && x === w));
      for (const o of placeObjs.values()) for (const b of o.buildings) b.userData.pin.classList.toggle("on", !!(sel && sel.kind === "program" && sel.program === b.userData.program.id));
      if (view.focus) faceToCamera(place[view.focus], 0.62);
      else if (!w) view.qGoal = null;
      E.dirty(); settle();
    },
    flows(on) { show.flows = !!on; selectTeamLook(show.selectedTeam); if (!E.motionOn) E.render(0); },
    hover(sel) { const team = sel && sel.team ? sel.team : ""; for (const o of placeObjs.values()) o.pin.classList.toggle("hover", o.id === team); },
    overview() { view.focus = null; view.follow = null; view.zoom = 1; selectTeamLook(""); settle(); },
    // 鳥瞰：從聚會所正上方往下看，六個 team 一圈都看得到。
    bird(on) { view.follow = null; view.focus = null; view.zoom = on ? 0.82 : 1; if (on && place.commons) faceToCamera(place.commons, 0); settle(); },
    names(on) { show.names = !!on; E.placePins(); },
    me(info) {
      const old = ws.find(w => w.me); if (old) removeWalker(old);
      if (!info) { if (!E.motionOn) E.render(0); return null; }
      const w = addWalker({ code: "me", team: info.team, role: "associate" }, { me: true, shirt: info.shirt, hair: info.hair, skin: 1, brolly: 0, box: false });
      ink(E.scene);
      if (w) w.pin.querySelector("span").textContent = info.label || info.name; if (!E.motionOn) E.render(0); return w;
    },
    events(list) {
      for (const o of placeObjs.values()) if (o.evPin) { o.evPin.remove(); o.evPin = null; }
      for (const e of list || []) { const o = placeObjs.get(e.team); if (!o || o.evPin) continue; const a = document.createElement("a"); a.className = "pin pin-event"; a.href = e.link; a.textContent = e.title; pins.appendChild(a); o.evPin = a; }
      E.placePins();
    },
    people(list) {
      for (const w of ws.slice()) if (!w.me && !list.some(p => p.code === w.person.code)) removeWalker(w);
      for (const p of list) if (!ws.some(w => w.person.code === p.code)) addWalker(p);
      ink(E.scene);
      if (!E.motionOn) E.render(0);
    },
    posts(urls) { E.paintBoards(urls); },
    render: () => E.render(0),
    _scene: E.scene, _M: M, _cam: E.cam, _E: E, _tick: tick, _ws: ws,
    debug: () => ws.map(w => ({ code: w.person.code, home: w.homeId, at: w.at, to: w.travelTo, moving: !!w.g.userData.moving })),
    motion() { return E.motion({ islandOf: () => null, wanderTarget: () => ({ x: 0, z: 0 }), detour: (a, b) => [b], route: () => [], routePoints: () => [], blockersOf: new Map(), poisOf: new Map() }, tick); },
    goEvent() {},
    still() { aim(); E.snapCam(); },
  };
}
