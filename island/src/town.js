// /island/ 島上的第二批細節（2026-11-18 Paul 看完第一批：「More detail first」，要島看起來有人住、很熱鬧、很好看）。
// 這一支管陸地上的事：路（房子到島心、橋頭到島心、小店接最近的路）、最大那棟前面的小廣場、沿路的燈與長凳；
// 房子旁邊的矮樹籬、白色柵欄、一排一排的花圃、菜園、溫室、工具間；
// 球場（網球場、籃球半場，各在一座島）、第二座小遊樂場、游泳池、有人在吃的野餐桌、營火圈；
// 人：長凳上成對坐的、三個人站著聊的、餐車前排隊的、沙坑裡的小孩、遛狗的、慢跑的；
// 聚會所：市集攤位、有人在看的小舞台、會噴水的噴水池、掛在兩支桿子之間的燈串；機場：加油車、登機梯前排隊的旅客。
// 海上的事在 sea.js。跟 life.js 一樣的規矩：不 import three、不 import toy.js，THREE 跟引擎 E 從 scene.js 傳進來；
// 放在島上的每一樣東西都記進 blockersOf（人會繞開）、不放到 isl.r 減 1.8 以外（不然掉到海裡）；會動的標 userData.dynamic，每一幀在回傳的 tick() 裡動。
export function buildTown(THREE, E, c) {
  const { M, P, world, rbox, makePerson, pose } = E;
  const { islands, blockersOf, poisOf, buildingsOf, kindR, lifePlaces, bridgeAngles, airport, groupOf } = c;
  const TAU = Math.PI * 2, ticks = [];
  const mesh = (geo, m, x, y, z, shadow) => { const o = new THREE.Mesh(geo, m); o.position.set(x || 0, y || 0, z || 0); o.castShadow = shadow !== false; o.receiveShadow = true; return o; };
  const mulberry = seed => { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
  const std = (color, extra) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, ...(extra || {}) });
  const mix = (a, b, t) => a.clone().lerp(b, t);
  // 這一支自己的幾種材質（全部從七色混出來）：步道的奶油沙色、廣場的淺灰、球場的深綠、籃球場的硬地、泥土、溫室的玻璃、營火。
  const MM = { path: std(mix(P.cream, P.sand, 0.4)), plaza: std(mix(P.cream, P.grey, 0.22)), court: std(mix(mix(P.grass, P.teal, 0.3), P.navy, 0.12)), hard: std(mix(P.sand, P.navy, 0.3)), soil: std(mix(mix(P.sand, P.orange, 0.35), P.navy, 0.42)),
    hedge: M.tree[2], glass: new THREE.MeshStandardMaterial({ color: P.shallow, transparent: true, opacity: 0.4, roughness: 0.25 }), flame: std(P.orange, { emissive: P.orange, emissiveIntensity: 1.2 }), flame2: std(P.yellow, { emissive: P.yellow, emissiveIntensity: 1.4 }),
    tennis: std(mix(P.yellow, P.white, 0.3), { emissive: P.yellow, emissiveIntensity: 0.3 }), ball: std(mix(P.orange, P.navy, 0.35)), dog: std(mix(P.sand, P.white, 0.5)), stripeA: M.orange, stripeB: M.white };
  const stats = { at: {}, paths: 0, plazas: 0, lamps: 0, benches: 0, hedges: 0, fences: 0, beds: 0, plots: 0, greenhouses: 0, sheds: 0, tennis: "", basketball: "", playground: "", pool: "", picnics: 0, bonfire: "", pairs: 0, trios: 0, queues: 0, dog: "", jogger: "", stalls: 0, bandstand: "", fountain: "", strings: 0 };
  E.townStats = stats;   // 除錯：console 裡 __island._E.townStats 看每一樣放到哪
  // 一次畫完的小東西（InstancedMesh）：成排的花、菜園的菜、柵欄的木條、燈串的燈泡、營火的石頭。
  const rowFlowers = [], veg = [], pickets = [], bulbs = [], stones = [];
  const flowerCol = [P.orange, P.yellow, P.white, mix(P.teal, P.white, 0.3)];
  const bySpot = new Map();   // 每座島的工具（spot、put、free），球場那些跨島挑位置的要用
  E.townSpots = bySpot;   // 除錯：每座島找位置的那幾支（rectFree、isSoft、blockers），放不下的時候在 console 裡查

  // 人的姿勢：坐著（腿往前伸、手放腿上、整個人往下 0.2）、站著聊天（一隻手舉起來）。這些人不會動，姿勢一次擺好。
  const sit = (pp, y) => { const p = pp.userData.parts; p.legL.rotation.x = -1.4; p.legR.rotation.x = -1.4; p.armL.rotation.x = -0.6; p.armR.rotation.x = -0.6; pp.position.y = y == null ? 0.2 : y; return pp; };
  const chat = (pp, k) => { const p = pp.userData.parts; p.armL.rotation.x = k % 2 ? -0.5 : 0.1; p.armR.rotation.x = k % 2 ? 0.1 : -0.7; p.head.rotation.y = (k % 2 ? 1 : -1) * 0.15; return pp; };
  const person = (parent, x, z, ry, o) => { const pp = makePerson({ scale: 1.1, ...(o || {}) }); pp.position.set(x, 0, z); pp.rotation.y = ry; parent.add(pp); return pp; };

  for (const isl of islands) {
    if (isl.sea) continue;
    const rr = mulberry(isl.x * 53 + isl.z * 29 + 7);
    const blockers = blockersOf.get(isl.id) || [], pois = poisOf.get(isl.id) || [], places = lifePlaces.get(isl.id) || [], builds = buildingsOf.get(isl.id) || [];
    const g = new THREE.Group(); g.position.set(isl.x, 0, isl.z); world.add(g);
    const inside = (x, z, m) => Math.hypot(x, z) < isl.r - (m == null ? 1.8 : m);
    // 跟 life.js 一樣：半徑 0.8 以下的小東西（矮樹、燈）不算，不然什麼都放不下；minR 給了就改門檻。
    const clear = (x, z, dmin, minR) => !blockers.some(b => { const br = b.r || 1.2; if (br < (minR == null ? 0.8 : minR)) return false; return Math.hypot(isl.x + x - b.x, isl.z + z - b.z) < br + dmin; });
    const free = (x, z, dmin) => inside(x, z) && clear(x, z, dmin);
    const spot = (dmin, rMin, rMax, tries) => { for (let i = 0; i < (tries || 160); i++) { const a = rr() * TAU, d = isl.r * ((rMin == null ? 0.2 : rMin) + rr() * ((rMax == null ? 0.8 : rMax) - (rMin == null ? 0.2 : rMin))); const x = Math.cos(a) * d, z = Math.sin(a) * d; if (free(x, z, dmin)) return { x, z, a }; } return null; };
    const put = (obj, pos, ry, r) => { obj.position.set(pos.x, 0, pos.z); if (ry != null) obj.rotation.y = ry; g.add(obj); blockers.push({ x: isl.x + pos.x, z: isl.z + pos.z, r: r || 1.2 }); obj.traverse(m => { if (m.isMesh) m.castShadow = true; }); stats.at.last = [Math.round((isl.x + pos.x) * 10) / 10, Math.round((isl.z + pos.z) * 10) / 10]; return obj; };
    // 一塊長方形放不放得下：中心 (cx, cz)、轉 ry、半寬 hw、半深 hd。方格取樣每一點都要在島上、離大東西 dmin、不壓到矮樹那種小東西。
    // 球場那種大東西放不下的時候（2026-11-18 第一版六樣全部放不下：每座島內側是房子、外側是那座島自己的擺設、中間撒滿桌椅），
    // 可以讓路給它的是：樹與矮樹（這時候還沒畫，只是 E.treePlaces、E.bushPlaces 裡的座標）、引擎 furnish 撒的桌椅燈花台（島的 group 裡半徑 1.2 以下、不是房子不是旗桿的那些）。
    // 房子、那座島自己的擺設（遊樂場、黑板、噴水池）、小店餐車碼頭、纜車塔都不讓。
    const ig = groupOf && groupOf.get(isl.id);
    const furnishAt = b => ig ? ig.children.filter(ch => !ch.userData.program && !ch.userData.flag && !ch.userData.sel && Math.abs(ch.position.x + isl.x - b.x) < 0.02 && Math.abs(ch.position.z + isl.z - b.z) < 0.02) : [];
    // life.js 的小店、餐車、公車亭、晾衣繩那些也讓（它們記在 lifePlaces 裡、帶著自己的 group）；腳踏車架已經畫成 InstancedMesh 拿不掉，不讓。
    const lifeAt = b => places.filter(pl => pl.g && !pl.removed && Math.abs(isl.x + pl.x - b.x) < 0.02 && Math.abs(isl.z + pl.z - b.z) < 0.02);
    const isSoft = b => (b.r === 1.0 && E.treePlaces.some(t => Math.abs(t[0] - b.x) < 0.01 && Math.abs(t[1] - b.z) < 0.01)) || (b.r === 0.7 && E.bushPlaces.some(t => Math.abs(t[0] - b.x) < 0.01 && Math.abs(t[1] - b.z) < 0.01)) || ((b.r || 1.2) <= 1.2 && b.r !== 0.6 && furnishAt(b).length > 0) || ((b.r || 1.2) <= 1.95 && lifeAt(b).length > 0);
    const clearSoft = (x, z, dmin, minR) => !blockers.some(b => { const br = b.r || 1.2; if (br < minR || isSoft(b)) return false; return Math.hypot(isl.x + x - b.x, isl.z + z - b.z) < br + dmin; });
    const rectFree = (cx, cz, ry, hw, hd, dmin, soft) => { const cl = soft ? clearSoft : clear; for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) { const lx = i * hw / 2, lz = j * hd / 2; const x = cx + Math.cos(ry) * lx + Math.sin(ry) * lz, z = cz - Math.sin(ry) * lx + Math.cos(ry) * lz; if (!inside(x, z) || !cl(x, z, dmin, 0.8) || !cl(x, z, 0, 0.6)) return false; } return true; };
    // 砍掉落在這塊長方形（外推 0.8 公尺）裡的樹與矮樹：座標從 treePlaces／bushPlaces 拿掉、blockers 也拿掉。
    const fell = (cx, cz, ry, hw, hd) => { const inRect = (wx, wz) => { const dx = wx - isl.x - cx, dz = wz - isl.z - cz; const lx = Math.cos(ry) * dx - Math.sin(ry) * dz, lz = Math.sin(ry) * dx + Math.cos(ry) * dz; return Math.abs(lx) < hw + 0.8 && Math.abs(lz) < hd + 0.8; };
      for (const list of [E.treePlaces, E.bushPlaces, E.stoolPlaces]) for (let i = list.length - 1; i >= 0; i--) if (inRect(list[i][0], list[i][1])) list.splice(i, 1);
      for (let i = blockers.length - 1; i >= 0; i--) { const b = blockers[i]; if (!isSoft(b) || !inRect(b.x, b.z)) continue; for (const ch of furnishAt(b)) ig.remove(ch);
        for (const pl of lifeAt(b)) { pl.removed = true; pl.g.traverse(o => { if (o.userData && o.userData.parts) E.people.free(o); }); if (pl.g.parent) pl.g.parent.remove(pl.g); }
        blockers.splice(i, 1); }
      for (let i = pois.length - 1; i >= 0; i--) if (inRect(isl.x + pois[i].x, isl.z + pois[i].z)) pois.splice(i, 1); };
    const rectSpot = (hw, hd, dmin, tries, soft) => { for (let i = 0; i < (tries || 320); i++) { const a = rr() * TAU, d = isl.r * (rr() * 0.72); const cx = Math.cos(a) * d, cz = Math.sin(a) * d, ry = rr() * TAU; if (rectFree(cx, cz, ry, hw, hd, dmin, soft)) { if (soft) fell(cx, cz, ry, hw, hd); return { x: cx, z: cz, ry }; } } return null; };
    // 在某棟房子旁邊找位置：離房子的圓 rMin 到 rMax 公尺。
    const near = (b, dmin, rMin, rMax, tries) => { const R = kindR[b.kind] || 3; for (let i = 0; i < (tries || 140); i++) { const a = rr() * TAU, d = R + rMin + rr() * (rMax - rMin); const x = b.x + Math.cos(a) * d, z = b.z + Math.sin(a) * d; if (free(x, z, dmin)) return { x, z, a }; } return null; };
    bySpot.set(isl.id, { g, rr, blockers, pois, spot, put, free, rectSpot, rectFree, fell, inside, isSoft, isl, places, builds, near, strip: null });   // fell 也露出來：第三批（water.js 的瀑布山丘、sights.js 的機車排與溫泉）要在指定的位置清掉樹與桌椅

  }

  // ═══ 3. 球場與玩的地方：每一樣挑一座放得下的島（優先順序在陣列裡），放過的島不再放第二樣大的。═══
  // 球場、籃球場、遊樂場三樣各佔一座島（exclusive）；泳池、營火、舞台、噴水池比較小，哪座放得下就放哪座。
  const used = new Set();
  const pick = (order, fn, exclusive) => { for (const id of order) { const T = bySpot.get(id); if (!T || (exclusive && used.has(id))) continue; if (fn(T)) { if (exclusive) used.add(id); stats.at[id + ":" + stats.at.last] = (stats.at[id + ":" + stats.at.last] || 0) + 1; return id; } } return ""; };
  // 網球場（Paul 開網球公司）：深綠的場、白線、網（兩支柱、網面、白色的上緣）、兩個人在打、一顆球飛來飛去。
  stats.tennis = pick(["curriculum", "marketing", "sponsorship", "mentorship", "cr", "internship"], T => {
    const sp = T.rectSpot(4.0, 2.4, 0.4, 400, true); if (!sp) return false;
    const ct = new THREE.Group(); ct.add(mesh(rbox(8.0, 0.06, 4.8, 0.05), MM.court, 0, 0.04, 0, false));
    const line = (w, d, x, z) => ct.add(mesh(rbox(w, 0.02, d, 0.005), M.white, x, 0.14, z, false));
    line(6.8, 0.08, 0, -1.65); line(6.8, 0.08, 0, 1.65); line(0.08, 3.4, -3.4, 0); line(0.08, 3.4, 3.4, 0); line(0.08, 3.4, -1.9, 0); line(0.08, 3.4, 1.9, 0); line(3.8, 0.08, 0, 0); line(0.08, 0.9, -3.1, 0); line(0.08, 0.9, 3.1, 0);
    for (const z of [-1.85, 1.85]) ct.add(mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.95, 6), M.dark, 0, 0.5, z, false));
    ct.add(mesh(rbox(0.04, 0.8, 3.7, 0.01), std(mix(P.navy, P.white, 0.55), { transparent: true, opacity: 0.7 }), 0, 0.45, 0, false), mesh(rbox(0.06, 0.06, 3.7, 0.01), M.white, 0, 0.88, 0, false));
    // 兩個人：各站一邊的底線後面，拿球拍（手舉著），會左右小跑。
    const racket = (pp, sgn) => { const r = new THREE.Group(); r.userData.dynamic = true; r.position.set(sgn * 0.3, 0.85, 0.15); r.rotation.x = -1.2; pp.add(r); r.add(mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.5, 5), M.dark, 0, -0.25, 0, false), mesh(new THREE.TorusGeometry(0.17, 0.025, 5, 12), M.orange, 0, 0.12, 0, false)); return r; };
    const pA = person(ct, 0, 2.7, Math.PI, { shirt: 4, scale: 1.0 }), pB = person(ct, 0, -2.7, 0, { shirt: 1, scale: 1.0, hat: true });
    pA.userData.parts.armR.rotation.x = -2.2; pB.userData.parts.armR.rotation.x = -2.2; racket(pA, 1); racket(pB, 1);
    const ball = mesh(new THREE.SphereGeometry(0.11, 7, 5), MM.tennis, 0, 0.5, 0, false); ball.userData.dynamic = true; ct.add(ball);
    T.put(ct, sp, sp.ry, 4.2);
    ticks.push((dt, t) => { const u = (t * 0.45) % 2; const v = u < 1 ? u : 2 - u; ball.position.set(Math.sin(t * 0.9) * 1.2, 0.5 + Math.sin(v * Math.PI) * 1.4, 2.4 - v * 4.8); pA.position.x = Math.sin(t * 0.9) * 1.0; pB.position.x = Math.sin(t * 0.9 + 1.0) * 1.0; });
    return true;
  }, true);
  // 籃球半場：硬地、罰球區、三分線、籃架；一個人在投籃、球會彈。
  stats.basketball = pick(["cr", "sponsorship", "marketing", "mentorship", "curriculum", "internship"], T => {
    const sp = T.rectSpot(2.8, 2.6, 0.4, 400, true); if (!sp) return false;
    const bc = new THREE.Group(); bc.add(mesh(rbox(5.6, 0.06, 5.0, 0.05), MM.hard, 0, 0.04, 0, false));
    const line = (w, d, x, z) => bc.add(mesh(rbox(w, 0.02, d, 0.005), M.white, x, 0.14, z, false));
    line(5.2, 0.08, 0, -2.3); line(0.08, 4.6, -2.6, 0); line(0.08, 4.6, 2.6, 0); line(1.6, 0.08, 0, -0.6); line(0.08, 1.7, -0.8, -1.45); line(0.08, 1.7, 0.8, -1.45);
    const arc = mesh(new THREE.TorusGeometry(2.1, 0.04, 4, 24, Math.PI), M.white, 0, 0.14, -2.3, false); arc.rotation.x = -Math.PI / 2; arc.rotation.z = Math.PI; bc.add(arc);
    const hoop = new THREE.Group(); hoop.position.set(0, 0, -2.6); bc.add(hoop); hoop.add(mesh(new THREE.CylinderGeometry(0.07, 0.08, 3.0, 6), M.dark, 0, 1.5, -0.3, false), mesh(rbox(1.3, 0.9, 0.08, 0.04), M.white, 0, 2.9, 0, false), mesh(new THREE.TorusGeometry(0.28, 0.03, 6, 16), M.orange, 0, 2.55, 0.32, false).rotateX(Math.PI / 2));
    const shooter = person(bc, 0.6, -0.4, 0.3, { shirt: 0, scale: 1.0 }); shooter.userData.parts.armL.rotation.x = -2.6; shooter.userData.parts.armR.rotation.x = -2.6;
    const ball = mesh(new THREE.SphereGeometry(0.17, 8, 6), MM.ball, 0.6, 1.4, -0.4, false); ball.userData.dynamic = true; bc.add(ball);
    const watcher = person(bc, -1.9, 1.6, -0.6, { shirt: 3, scale: 1.0 }); chat(watcher, 1);
    T.put(bc, sp, sp.ry, 3.4);
    ticks.push((dt, t) => { const u = (t * 0.5) % 1; if (u < 0.5) { const v = u / 0.5; ball.position.set(0.6 - v * 0.6, 1.4 + Math.sin(v * Math.PI) * 1.8 + v * 1.0, -0.4 - v * 1.9); } else { const v = (u - 0.5) / 0.5; ball.position.set(0.1 + v * 0.5, 0.2 + Math.abs(Math.sin(v * Math.PI * 3)) * (1.2 - v) + 0.0, -2.2 + v * 1.8); } });
    return true;
  }, true);
  // 第二座小遊樂場：會蹺的翹翹板（兩個小孩坐兩頭）、沙坑（兩個小孩加水桶）、兩隻彈簧搖搖馬。
  stats.playground = pick(["internship", "mentorship", "marketing", "sponsorship", "curriculum", "cr"], T => {
    const sp = T.rectSpot(2.4, 2.2, 0.5, 400, true); if (!sp) return false;
    const pg = new THREE.Group(); pg.add(mesh(new THREE.CylinderGeometry(2.7, 2.8, 0.07, 24), E.groundMat("patch"), 0, 0.04, 0, false));
    const ss = new THREE.Group(); ss.position.set(0, 0, -1.2); pg.add(ss); ss.add(mesh(rbox(0.5, 0.45, 0.6, 0.08), M.dark, 0, 0.22, 0));
    const board = new THREE.Group(); board.userData.dynamic = true; board.position.y = 0.5; ss.add(board); board.add(mesh(rbox(3.2, 0.1, 0.4, 0.03), M.orange, 0, 0, 0));
    for (const sx of [-1.4, 1.4]) { board.add(mesh(rbox(0.2, 0.3, 0.1, 0.02), M.navy, sx, 0.2, 0, false)); const kid = person(board, sx, 0, sx < 0 ? Math.PI / 2 : -Math.PI / 2, { shirt: sx < 0 ? 2 : 0, scale: 0.8 }); sit(kid, -0.12); }
    const sand = new THREE.Group(); sand.position.set(1.4, 0, 1.0); pg.add(sand); sand.add(mesh(new THREE.CylinderGeometry(1.2, 1.3, 0.22, 14), M.beach, 0, 0.1, 0, false), mesh(new THREE.CylinderGeometry(0.14, 0.11, 0.22, 8), M.teal, 0.5, 0.32, 0.2, false), mesh(new THREE.CylinderGeometry(0.3, 0.35, 0.25, 8), M.beach, -0.4, 0.33, 0.3, false), mesh(new THREE.ConeGeometry(0.2, 0.3, 8), M.beach, -0.4, 0.58, 0.3, false));
    sit(person(sand, 0.2, -0.5, 2.6, { shirt: 5, scale: 0.75 }), 0.0); sit(person(sand, -0.5, -0.1, 1.2, { shirt: 1, scale: 0.75, hat: true }), 0.0);
    for (const [x, z, m] of [[-1.5, 1.0, M.yellow], [-1.5, 1.9, M.teal]]) { const r = new THREE.Group(); r.position.set(x, 0, z); pg.add(r); r.add(mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.45, 6), M.dark, 0, 0.22, 0, false), mesh(rbox(0.7, 0.3, 0.3, 0.1), m, 0, 0.6, 0), mesh(new THREE.SphereGeometry(0.16, 8, 6), m, 0.4, 0.75, 0, false)); }
    T.put(pg, sp, sp.ry, 3.0);
    ticks.push((dt, t) => { board.rotation.z = Math.sin(t * 1.4) * 0.16; });
    return true;
  }, true);
  // 游泳池：奶油色的池緣、水、梯子、兩個泡在裡面的人（會上下晃）、池邊一張躺椅一支陽傘。聚會所有位子就放聚會所。
  stats.pool = pick(["commons", "sponsorship", "marketing", "mentorship", "cr", "curriculum", "internship"], T => {
    const sp = T.rectSpot(3.0, 2.1, 0.5, 400, true); if (!sp) return false;
    // 池緣是四面矮牆加一塊池底（第一版是一整塊實心的盒子，水跟人都藏在裡面看不到）。
    const pool = new THREE.Group(); pool.add(mesh(rbox(5.4, 0.08, 3.6, 0.02), std(mix(P.shallow, P.white, 0.3)), 0, 0.08, 0, false));
    for (const [w, d, x, z] of [[6.0, 0.4, 0, -1.9], [6.0, 0.4, 0, 1.9], [0.4, 4.2, -2.8, 0], [0.4, 4.2, 2.8, 0]]) pool.add(mesh(rbox(w, 0.5, d, 0.06), M.cream, x, 0.22, z));
    const water = mesh(rbox(5.3, 0.06, 3.5, 0.02), M.shallow, 0, 0.42, 0, false); pool.add(water);
    pool.add(mesh(rbox(0.05, 0.9, 0.05, 0.01), M.dark, 2.5, 0.6, -0.9, false), mesh(rbox(0.05, 0.9, 0.05, 0.01), M.dark, 2.5, 0.6, -0.5, false)); for (let k = 0; k < 3; k++) pool.add(mesh(rbox(0.04, 0.04, 0.45, 0.01), M.dark, 2.5, 0.35 + k * 0.25, -0.7, false));
    const swimmers = [person(pool, -1.0, 0.4, 0.8, { shirt: 0, scale: 1.0 }), person(pool, 1.2, -0.6, -2.2, { shirt: 2, scale: 1.0 })]; swimmers.forEach(s => { s.position.y = -0.25; s.userData.parts.armL.rotation.x = -1.6; s.userData.parts.armR.rotation.x = -1.6; });
    const ring = mesh(new THREE.TorusGeometry(0.42, 0.12, 6, 14), M.orange, -1.0, 0.45, 0.4, false); ring.rotation.x = Math.PI / 2; ring.userData.dynamic = true; pool.add(ring);
    const chair = new THREE.Group(); chair.position.set(0, 0, 2.7); pool.add(chair); chair.add(mesh(rbox(1.6, 0.1, 0.6, 0.03), M.teal, 0, 0.35, 0, false), mesh(rbox(0.6, 0.1, 0.6, 0.03), M.teal, -0.9, 0.6, 0, false).rotateZ(0.6)); for (const dx of [-0.6, 0.6]) chair.add(mesh(rbox(0.08, 0.3, 0.5, 0.02), M.dark, dx, 0.15, 0, false));
    const u = E.parasol(M.yellow); u.position.set(1.4, 0, 2.7); pool.add(u);
    T.put(pool, sp, sp.ry, 3.8);
    ticks.push((dt, t) => { swimmers.forEach((s, k) => { s.position.y = -0.25 + Math.sin(t * 1.5 + k * 2) * 0.05; }); ring.position.y = 0.45 + Math.sin(t * 1.3) * 0.04; ring.rotation.z = Math.sin(t * 0.9) * 0.08; });
    return true;
  });
  // 野餐桌加四個在吃的人（盤子、杯子）：兩座島。
  for (const id of ["mentorship", "sponsorship", "curriculum", "marketing", "cr", "internship"]) { if (stats.picnics >= 2) break; const T = bySpot.get(id); if (!T) continue; const sp = T.spot(1.6); if (!sp) continue; stats.picnics++;
    const ry = T.rr() * TAU; const pt = E.picnic(); const grp = new THREE.Group(); grp.add(pt);
    for (const [x, z] of [[-0.5, -0.1], [0.5, -0.1], [-0.5, 0.1], [0.5, 0.1]]) grp.add(mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.02, 10), M.white, x, 0.82, z * 2.5, false), mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.12, 6), M.teal, x + 0.25, 0.87, z * 2.5, false), mesh(new THREE.SphereGeometry(0.07, 6, 5), M.orange, x, 0.86, z * 2.5, false));
    grp.add(mesh(rbox(0.5, 0.3, 0.35, 0.06), M.orange, 1.3, 0.6, 0.0, false));   // 野餐籃
    [[-0.6, -1.0, 0, 3], [0.6, -1.0, 0, 5], [-0.6, 1.0, Math.PI, 1], [0.6, 1.0, Math.PI, 2]].forEach(([x, z, r, sh], k) => { const pp = sit(person(grp, x, z, r, { shirt: sh, skin: k % 3 }), 0.2); pp.userData.parts.armR.rotation.x = -1.3; });
    T.put(grp, sp, ry, 1.9); }
  // 營火圈：一圈石頭、六根木頭當椅子、三個人坐著、火會閃、煙會飄。
  stats.bonfire = pick(["mentorship", "curriculum", "sponsorship", "marketing", "cr", "internship", "commons"], T => {
    const sp = T.rectSpot(1.9, 1.9, 0.5, 400, true); if (!sp) return false;
    const bf = new THREE.Group(); const fire = new THREE.Group(); fire.userData.dynamic = true; bf.add(fire);
    for (let k = 0; k < 4; k++) { const log = mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.9, 6), M.trunk, 0, 0.1, 0, false); log.rotation.z = Math.PI / 2; log.rotation.y = k * Math.PI / 4; bf.add(log); }
    const f1 = mesh(new THREE.ConeGeometry(0.32, 0.9, 7), MM.flame, 0, 0.55, 0, false), f2 = mesh(new THREE.ConeGeometry(0.18, 0.6, 6), MM.flame2, 0.05, 0.5, 0.05, false); fire.add(f1, f2);
    for (let k = 0; k < 10; k++) { const a = k / 10 * TAU; stones.push([T.isl.x + sp.x + Math.cos(a) * 0.65, 0.1, T.isl.z + sp.z + Math.sin(a) * 0.65, a, 0.5 + (k % 3) * 0.15]); }
    for (let k = 0; k < 6; k++) { const a = k / 6 * TAU + 0.3; const seat = mesh(new THREE.CylinderGeometry(0.16, 0.16, 1.2, 7), M.trunk, Math.cos(a) * 1.7, 0.16, Math.sin(a) * 1.7, false); seat.rotation.z = Math.PI / 2; seat.rotation.y = -a + Math.PI / 2; bf.add(seat);
      if (k % 2 === 0) sit(person(bf, Math.cos(a) * 1.7, Math.sin(a) * 1.7, Math.atan2(-Math.cos(a), -Math.sin(a)), { shirt: k, pack: k === 2 }), 0.02); }
    const smoke = new THREE.Group(); smoke.userData.dynamic = true; smoke.position.y = 1.0; bf.add(smoke); const puffs = [];
    for (let k = 0; k < 3; k++) { const pm = new THREE.MeshStandardMaterial({ color: P.white, transparent: true, opacity: 0.4, roughness: 1 }); const p = mesh(new THREE.SphereGeometry(0.2, 8, 6), pm, 0, 0, 0, false); smoke.add(p); puffs.push(p); }
    T.put(bf, sp, null, 2.0);
    ticks.push((dt, t) => { f1.scale.set(1 + Math.sin(t * 9) * 0.12, 1 + Math.sin(t * 13) * 0.18, 1 + Math.cos(t * 11) * 0.12); f2.scale.set(1 + Math.cos(t * 12) * 0.15, 1 + Math.sin(t * 15 + 1) * 0.25, 1); fire.rotation.y = t * 1.5;
      puffs.forEach((p, k) => { const u = (t * 0.3 + k / 3) % 1; p.position.set(Math.sin(t * 0.8 + k) * 0.3 * u, u * 2.4, Math.cos(t * 0.7 + k) * 0.3 * u); p.scale.setScalar(0.5 + u * 1.6); p.material.opacity = 0.4 * (1 - u); }); });
    return true;
  });

  // ═══ 5b. 遛狗的人與慢跑的人：沿島緣繞圈（六邊形的島照六邊形走，不然會走到海裡）。═══
  const edgeR = (isl, th) => { if (isl.shape !== "hex") return isl.r; let ph = (th - Math.PI / 6) % (Math.PI / 3); if (ph < 0) ph += Math.PI / 3; return isl.r * Math.cos(Math.PI / 6) / Math.cos(ph - Math.PI / 6); };
  const rimAt = (isl, th, inset) => { const R = edgeR(isl, th) - inset; return { x: Math.cos(th) * R, z: Math.sin(th) * R }; };
  const walkerLoop = (id, speed, inset, phase0, build) => { const T = bySpot.get(id); if (!T || T.isl.shape === "rect") return ""; const grp = new THREE.Group(); grp.userData.dynamic = true; T.g.add(grp); const out = build(grp); let th = phase0;
    ticks.push((dt, t) => { const R = edgeR(T.isl, th) - inset; th += dt * speed / R; const p = rimAt(T.isl, th, inset), q = rimAt(T.isl, th + 0.03, inset); grp.position.set(p.x, 0, p.z); grp.rotation.y = Math.atan2(q.x - p.x, q.z - p.z); out(dt, t); }); return id; };
  stats.dog = walkerLoop("mentorship", 0.9, 1.0, 0.4, grp => {
    const pp = person(grp, 0, 0, 0, { shirt: 3, scale: 1.1 }); pp.userData.moving = true; pp.userData.parts.armR.rotation.x = -0.5;
    const dog = new THREE.Group(); dog.userData.dynamic = true; dog.position.set(0.7, 0, 0.9); grp.add(dog);
    dog.add(mesh(rbox(0.55, 0.26, 0.24, 0.08), MM.dog, 0, 0.38, 0, false), mesh(rbox(0.26, 0.24, 0.22, 0.07), MM.dog, 0.05, 0.56, 0.3, false), mesh(rbox(0.1, 0.12, 0.05, 0.02), M.dark, -0.08, 0.68, 0.3, false), mesh(rbox(0.1, 0.12, 0.05, 0.02), M.dark, 0.18, 0.68, 0.3, false), mesh(new THREE.SphereGeometry(0.04, 5, 4), M.dark, 0.05, 0.55, 0.43, false), mesh(rbox(0.06, 0.06, 0.3, 0.02), MM.dog, 0, 0.5, -0.25, false).rotateX(-0.6));
    for (const [x, z] of [[-0.17, -0.08], [0.17, -0.08], [-0.17, 0.08], [0.17, 0.08]]) dog.add(mesh(rbox(0.09, 0.26, 0.09, 0.02), MM.dog, x, 0.13, z, false));
    E.mergeChildren(dog);
    const leash = mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.1, 4), M.dark, 0.5, 0.65, 0.55, false); leash.rotation.x = 0.9; leash.rotation.z = -0.4; grp.add(leash);
    return (dt, t) => { pose(pp, t); dog.position.y = Math.abs(Math.sin(t * 7)) * 0.05; dog.rotation.z = Math.sin(t * 7) * 0.05; };
  });
  stats.jogger = walkerLoop("curriculum", 2.4, 1.0, 2.0, grp => { const pp = person(grp, 0, 0, 0, { shirt: 2, scale: 1.1, hat: true }); pp.userData.moving = true; pp.userData.phase = 0; return (dt, t) => { pose(pp, t * 1.4); pp.userData.parts.armL.rotation.x -= 0.8; pp.userData.parts.armR.rotation.x -= 0.8; }; });

  // ═══ 6. 聚會所：市集攤位（五攤，有條紋雨棚與貨）、小舞台（三個人在演、四個人在看）、會噴水的噴水池。放不下的落到別座島。═══
  const stall = (k) => { const s = new THREE.Group(); const awnM = [M.orange, M.teal, M.yellow, M.navy, M.orange][k % 5];
    s.add(mesh(rbox(1.9, 0.1, 0.9, 0.03), M.wood, 0, 0.8, 0, false)); for (const [x, z] of [[-0.8, -0.35], [0.8, -0.35], [-0.8, 0.35], [0.8, 0.35]]) s.add(mesh(rbox(0.08, 0.8, 0.08, 0.02), M.wood, x, 0.4, z, false));
    s.add(mesh(rbox(1.9, 0.5, 0.06, 0.02), awnM, 0, 0.55, 0.45, false)); for (const x of [-0.85, 0.85]) s.add(mesh(new THREE.CylinderGeometry(0.03, 0.04, 2.2, 5), M.dark, x, 1.1, -0.4, false), mesh(new THREE.CylinderGeometry(0.03, 0.04, 1.9, 5), M.dark, x, 0.95, 0.6, false));
    for (let i = 0; i < 6; i++) { const st = mesh(rbox(0.36, 0.04, 1.3, 0.01), i % 2 ? M.white : awnM, -0.9 + i * 0.36, 2.05, 0.1, false); st.rotation.x = 0.2; s.add(st); }
    const goods = [[M.orange, "s"], [M.yellow, "s"], [M.teal, "b"], [M.navy, "b"], [M.cream, "s"], [M.white, "b"]];
    goods.forEach(([m, sh], i) => s.add(sh === "s" ? mesh(new THREE.SphereGeometry(0.12, 7, 5), m, -0.65 + i * 0.26, 0.97, (i % 2) * 0.3 - 0.15, false) : mesh(rbox(0.22, 0.18, 0.22, 0.03), m, -0.65 + i * 0.26, 0.95, (i % 2) * 0.3 - 0.15, false)));
    person(s, -0.3, -0.75, 0, { shirt: k % 6, hat: k % 3 === 0 }); return s; };
  for (const id of ["commons", "sponsorship", "cr", "marketing"]) { const T = bySpot.get(id); if (!T) continue; for (let i = 0; i < 3 && stats.stalls < 5; i++) { const sp = T.rectSpot(1.0, 0.7, 0.5, 200, true); if (!sp) break; const face = Math.atan2(-sp.x, -sp.z); T.put(stall(stats.stalls), sp, face, 1.4); stats.stalls++;
    T.pois.push({ kind: "stand", face: face + Math.PI, x: sp.x + Math.sin(face) * 1.6, z: sp.z + Math.cos(face) * 1.6 }); } }
  stats.bandstand = pick(["commons", "cr", "sponsorship", "marketing", "curriculum", "mentorship", "internship"], T => {
    const sp = T.rectSpot(2.0, 2.0, 0.4, 500, true); if (!sp) return false; const face = Math.atan2(-sp.x, -sp.z);
    const bs = new THREE.Group(); bs.add(mesh(new THREE.CylinderGeometry(2.1, 2.2, 0.4, 8), M.wall, 0, 0.2, 0), mesh(new THREE.CylinderGeometry(2.0, 2.0, 0.06, 8), E.groundMat("checker"), 0, 0.43, 0, false));
    for (let k = 0; k < 8; k++) { const a = k / 8 * TAU + Math.PI / 8; bs.add(mesh(new THREE.CylinderGeometry(0.06, 0.07, 2.4, 6), M.cream, Math.cos(a) * 1.8, 1.6, Math.sin(a) * 1.8, false)); }
    bs.add(mesh(new THREE.ConeGeometry(2.5, 1.2, 8), M.teal, 0, 3.3, 0), mesh(new THREE.SphereGeometry(0.2, 8, 6), M.yellow, 0, 4.0, 0, false), mesh(new THREE.TorusGeometry(1.85, 0.04, 5, 8), M.cream, 0, 0.85, 0, false).rotateX(Math.PI / 2));
    [[-0.8, 0.3, 0], [0, -0.2, 2], [0.8, 0.3, 5]].forEach(([x, z, sh], k) => { const pp = person(bs, x, z, 0, { shirt: sh, scale: 1.0, hat: k === 1 }); pp.position.y = 0.46; pp.userData.parts.armL.rotation.x = -1.4; pp.userData.parts.armR.rotation.x = k === 1 ? -2.4 : -1.0; });
    [[-1.0, 3.2, 1], [0.1, 3.5, 3], [1.2, 3.1, 4], [0.5, 4.3, 0]].forEach(([x, z, sh], k) => chat(person(bs, x, z, Math.PI, { shirt: sh, pack: k === 3 }), k));
    T.put(bs, sp, face, 2.4); T.blockers.push({ x: T.isl.x + sp.x + Math.sin(face) * 3.5, z: T.isl.z + sp.z + Math.cos(face) * 3.5, r: 1.4 });
    T.pois.push({ kind: "stand", face: face + Math.PI, x: sp.x + Math.sin(face) * 2.8 + Math.cos(face) * 1.4, z: sp.z + Math.cos(face) * 2.8 - Math.sin(face) * 1.4 });
    return true;
  });
  stats.fountain = pick(["commons", "cr", "marketing", "curriculum", "sponsorship"], T => {
    const sp = T.rectSpot(2.0, 2.0, 0.5, 400, true); if (!sp) return false; sp.a = Math.atan2(sp.z, sp.x);
    const fo = new THREE.Group(); fo.add(mesh(new THREE.CylinderGeometry(1.7, 1.8, 0.5, 16), M.wall, 0, 0.25, 0), mesh(new THREE.CylinderGeometry(1.5, 1.5, 0.08, 16), M.shallow, 0, 0.5, 0, false), mesh(new THREE.CylinderGeometry(0.22, 0.32, 1.0, 8), M.wall, 0, 0.9, 0, false), mesh(new THREE.CylinderGeometry(0.7, 0.5, 0.15, 12), M.wall, 0, 1.45, 0, false));
    const drops = new THREE.InstancedMesh(new THREE.SphereGeometry(0.09, 6, 5), M.shallow, 14); drops.userData.dynamic = true; drops.castShadow = false; fo.add(drops);
    const mx = new THREE.Matrix4(); const sitRy = sp.a;
    for (const sgn of [-1, 1]) { const b = E.bench(M.teal); b.position.set(Math.cos(sitRy + sgn * 0.9) * 2.9, 0, Math.sin(sitRy + sgn * 0.9) * 2.9); b.rotation.y = -(sitRy + sgn * 0.9) - Math.PI / 2; fo.add(b); }
    T.put(fo, sp, null, 3.2);
    ticks.push((dt, t) => { for (let k = 0; k < 14; k++) { const u = (t * 0.9 + k / 14) % 1; const a = k / 14 * TAU + t * 0.3; const rad = 0.2 + u * 1.1; mx.makeTranslation(Math.cos(a) * rad, 1.55 + Math.sin(u * Math.PI) * 1.1 - u * 1.0, Math.sin(a) * rad); drops.setMatrixAt(k, mx); } drops.instanceMatrix.needsUpdate = true; });
    return true;
  });

  // ═══ 大東西放好之後，每座島再鋪路、種菜園、放人群、掛燈串（順序反過來的話菜園會把球場的位置吃光，2026-11-18 第一版就是這樣六樣全沒放成）。═══
  for (const isl of islands) {
    if (isl.sea) continue;
    const { g, rr, blockers, pois, spot, put, free, inside, places, builds, near } = bySpot.get(isl.id);
    // ═══ 1. 路：房子正面到島心、小店與餐車接到最近的路口；最大那棟前面一塊圓形小廣場；沿路一盞燈一張長凳。═══
    // 房子的正面：building 的 rotation.y 是 ry，正面在本地 +z，所以正面那一點是 (sin ry, cos ry) 方向。
    const nodes = [{ x: 0, z: 0 }];
    for (const a of bridgeAngles.get(isl.id) || []) nodes.push({ x: Math.cos(a) * (isl.r - 0.6), z: Math.sin(a) * (isl.r - 0.6) });
    const strip = (ax, az, bx, bz, w) => { const len = Math.hypot(bx - ax, bz - az); if (len < 0.8) return null; const s = mesh(rbox(len, 0.05, w || 1.1, 0.02), MM.path, (ax + bx) / 2, 0.05, (az + bz) / 2, false); s.rotation.y = -Math.atan2(bz - az, bx - ax); g.add(s); stats.paths++; return { ax, az, bx, bz, len }; };
    const paths = [];
    let biggest = null;
    for (const b of builds) {
      const R = kindR[b.kind] || 3; const fx = b.x + Math.sin(b.ry) * (R * 0.8), fz = b.z + Math.cos(b.ry) * (R * 0.8);
      const d = Math.hypot(fx, fz); if (d < 1.5) continue;
      const ex = fx * (1 - 1.2 / d), ez = fz * (1 - 1.2 / d);   // 島心留 1.2 公尺不鋪（那裡是圓心，路都從那裡散出去）
      const pth = strip(fx, fz, ex, ez); if (pth) paths.push(pth); nodes.push({ x: fx, z: fz });
      if (!biggest || R > (kindR[biggest.kind] || 3)) biggest = b;
    }
    for (const pl of places) {
      if ((pl.kind !== "shop" && pl.kind !== "cart") || pl.removed) continue;
      const fx = pl.x + Math.sin(pl.face) * (pl.r + 0.3), fz = pl.z + Math.cos(pl.face) * (pl.r + 0.3);
      let best = null, bd = Infinity; for (const n of nodes) { const d = Math.hypot(n.x - fx, n.z - fz); if (d < bd) { bd = d; best = n; } }
      if (best && bd < isl.r * 1.2) strip(fx, fz, best.x, best.z, 0.9);
    }
    // 小廣場：最大那棟正面 1.6 公尺外一個圓盤，兩邊各一盞燈。
    if (biggest) { const R = kindR[biggest.kind] || 3; const px = biggest.x + Math.sin(biggest.ry) * (R + 1.4), pz = biggest.z + Math.cos(biggest.ry) * (R + 1.4);
      if (inside(px, pz, 2.8)) { stats.plazas++; const disc = mesh(new THREE.CylinderGeometry(2.3, 2.4, 0.07, 24), MM.plaza, px, 0.05, pz, false); g.add(disc);
        const sx = Math.cos(biggest.ry), sz = -Math.sin(biggest.ry);
        for (const sgn of [-1, 1]) { const lx = px + sx * sgn * 2.0, lz = pz + sz * sgn * 2.0; if (free(lx, lz, 0.3)) { stats.lamps++; put(E.lamp(), { x: lx, z: lz }, null, 0.4); } }
        for (let k = 0; k < 2; k++) { const px2 = px + sx * (k ? 1.1 : -1.1), pz2 = pz + sz * (k ? 1.1 : -1.1); if (free(px2, pz2, 0.6)) { const pl = E.planter(k ? M.cream : M.wall); put(pl, { x: px2, z: pz2 }, biggest.ry, 0.8); } } } }
    // 沿路：每條房子的路，四成處路左一盞燈、六成五處路右一張長凳（面向路）。第一張長凳坐一對人。
    let pairDone = false;
    for (const p of paths) { const ux = (p.bx - p.ax) / p.len, uz = (p.bz - p.az) / p.len, nx = -uz, nz = ux;
      { const x = p.ax + ux * p.len * 0.4 + nx * 1.0, z = p.az + uz * p.len * 0.4 + nz * 1.0; if (free(x, z, 0.5)) { stats.lamps++; put(E.lamp(), { x, z }, null, 0.4); } }
      for (const side of [-1, 1]) { const x = p.ax + ux * p.len * 0.65 + side * nx * 1.15, z = p.az + uz * p.len * 0.65 + side * nz * 1.15; if (!free(x, z, 0.6)) continue; stats.benches++; const ry = Math.atan2(nx, nz); const b = put(E.bench(rr() < 0.5 ? M.teal : undefined), { x, z }, ry, 0.9);
        if (!pairDone) { pairDone = true; stats.pairs++; for (const dx of [-0.4, 0.4]) sit(person(b, dx, 0.1, 0, { shirt: dx < 0 ? 1 : 4, skin: dx < 0 ? 0 : 2 })); chat(b.children[b.children.length - 1], 1); }
        else pois.push({ kind: "bench", face: ry, x: x + Math.sin(ry) * 0.35, z: z + Math.cos(ry) * 0.35 }); break; } }

    // ═══ 2. 房子旁邊：矮樹籬、白柵欄、一排花、菜園、溫室、工具間。═══
    for (const b of builds) {
      if (b.kind === "pier" || b.kind === "tower" || b.kind === "post" || b.kind === "airport") continue;
      // 樹籬：三顆圓角方塊排一排，轉成跟房子平行。
      { const sp = near(b, 1.0, 1.2, 2.6); if (sp) { stats.hedges++; const h = new THREE.Group(); for (let k = -1; k <= 1; k++) h.add(mesh(rbox(0.9, 0.55, 0.5, 0.14), MM.hedge, k * 0.95, 0.3, 0)); put(h, sp, b.ry, 1.3); } }
      // 柵欄：七根木條加兩條橫桿（木條一次畫完）。
      { const sp = near(b, 1.0, 1.5, 3.0); if (sp) { stats.fences++; const ry = sp.a + Math.PI / 2; const f = new THREE.Group(); for (const y of [0.3, 0.55]) f.add(mesh(rbox(2.6, 0.05, 0.04, 0.01), M.white, 0, y, 0, false)); put(f, sp, ry, 1.3);
        for (let k = 0; k < 7; k++) { const lx = -1.2 + k * 0.4; pickets.push([isl.x + sp.x + Math.cos(ry) * lx, 0.38, isl.z + sp.z - Math.sin(ry) * lx, ry]); } } }
      // 花圃：一條泥土，兩排花（顏色輪流）。
      if (b.kind === "home" || b.kind === "hall" || b.kind === "studio" || b.kind === "school") { const sp = near(b, 1.0, 1.2, 3.2); if (sp) { stats.beds++; const ry = rr() * TAU; put(mesh(rbox(2.4, 0.16, 1.0, 0.04), MM.soil, 0, 0.08, 0, false), sp, ry, 1.3);
        for (let i = 0; i < 6; i++) for (const row of [-0.25, 0.25]) { const lx = -1.0 + i * 0.4; rowFlowers.push([isl.x + sp.x + Math.cos(ry) * lx + Math.sin(ry) * row, 0.3, isl.z + sp.z - Math.sin(ry) * lx + Math.cos(ry) * row, (i + (row > 0 ? 1 : 0)) % 4]); } } }
      // 菜園：一塊泥土、三排綠色的菜、兩支竹竿、一個稻草人。
      if (b.kind === "home" || b.kind === "camp" || b.kind === "tent" || b.kind === "hall") { const sp = near(b, 0.9, 1.4, 4.0); if (sp) { stats.plots++; const ry = rr() * TAU; const pl = new THREE.Group(); pl.add(mesh(rbox(2.8, 0.18, 1.9, 0.04), MM.soil, 0, 0.09, 0, false));
        for (const sx of [-1.1, 1.1]) pl.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.1, 4), M.wood, sx, 0.65, -0.7, false));
        const sc = new THREE.Group(); sc.position.set(1.0, 0, 0.6); pl.add(sc); sc.add(mesh(new THREE.CylinderGeometry(0.03, 0.04, 1.3, 4), M.wood, 0, 0.65, 0, false), mesh(rbox(0.8, 0.06, 0.06, 0.01), M.wood, 0, 1.0, 0, false), mesh(rbox(0.5, 0.45, 0.2, 0.08), M.yellow, 0, 0.95, 0, false), mesh(new THREE.SphereGeometry(0.16, 8, 6), M.cream, 0, 1.35, 0, false), mesh(new THREE.ConeGeometry(0.3, 0.25, 8), M.wood, 0, 1.5, 0, false));
        put(pl, sp, ry, 1.6);
        for (let i = 0; i < 5; i++) for (const row of [-0.55, 0, 0.55]) { const lx = -1.0 + i * 0.5; veg.push([isl.x + sp.x + Math.cos(ry) * lx + Math.sin(ry) * row, 0.22, isl.z + sp.z - Math.sin(ry) * lx + Math.cos(ry) * row, rr() * TAU, 0.7 + rr() * 0.5]); } } }
      // 溫室：奶油色的框、玻璃的牆與兩片斜的玻璃屋頂、裡面幾盆綠的。
      if (b.kind === "home" || b.kind === "hall" || b.kind === "school") { const sp = near(b, 0.9, 1.5, 4.0); if (sp) { stats.greenhouses++; const gh = new THREE.Group();
        gh.add(mesh(rbox(2.6, 0.12, 1.8, 0.03), M.cream, 0, 0.06, 0, false), mesh(rbox(2.4, 1.2, 1.6, 0.04), MM.glass, 0, 0.72, 0, false));
        for (const [ox, oz] of [[-1.2, -0.8], [1.2, -0.8], [-1.2, 0.8], [1.2, 0.8]]) gh.add(mesh(rbox(0.08, 1.3, 0.08, 0.02), M.cream, ox, 0.72, oz, false));
        gh.add(mesh(rbox(2.6, 0.08, 0.08, 0.02), M.cream, 0, 1.85, 0, false));
        for (const sgn of [-1, 1]) { const roof = mesh(rbox(2.6, 0.04, 1.0, 0.01), MM.glass, 0, 1.6, sgn * 0.42, false); roof.rotation.x = -sgn * 0.6; gh.add(roof); }
        for (let i = 0; i < 4; i++) gh.add(mesh(new THREE.SphereGeometry(0.17, 7, 5), M.tree[i % 3], -0.9 + i * 0.6, 0.45, 0, false), mesh(new THREE.CylinderGeometry(0.1, 0.08, 0.18, 6), M.orange, -0.9 + i * 0.6, 0.25, 0, false));
        put(gh, sp, rr() * TAU, 1.7); } }
      // 工具間：木頭小屋、斜屋頂、門、靠著的掃帚。
      if (b.kind === "home" || b.kind === "camp" || b.kind === "hall") { const sp = near(b, 0.8, 1.4, 4.0); if (sp) { stats.sheds++; const sh = new THREE.Group();
        sh.add(mesh(rbox(1.3, 1.4, 1.1, 0.06), M.wood, 0, 0.7, 0)); const roof = mesh(rbox(1.6, 0.08, 1.4, 0.03), M.dark, 0, 1.5, 0, false); roof.rotation.x = 0.22; sh.add(roof);
        sh.add(mesh(rbox(0.45, 0.9, 0.05, 0.02), M.dark, 0.1, 0.45, 0.56, false), mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.1, 4), M.wood, -0.75, 0.55, 0.3, false).rotateZ(0.15), mesh(rbox(0.16, 0.22, 0.06, 0.02), M.yellow, -0.82, 0.12, 0.3, false));
        put(sh, sp, -sp.a + Math.PI / 2, 1.1); } }
    }

    // ═══ 5. 人在做事：三個人站著聊、餐車前面排隊、既有的一張長凳坐一對。═══
    { const sp = spot(0.9, 0.2, 0.7); if (sp) { stats.trios++; const grp = new THREE.Group(); put(grp, sp, null, 0.9);
      [[0, -0.6, 1], [0.55, 0.35, 3], [-0.55, 0.35, 5]].forEach(([x, z, sh], k) => chat(person(grp, x, z, Math.atan2(-x, -z), { shirt: sh, pack: k === 1, bag: k === 2 }), k)); } }
    for (const pl of places) { if (pl.kind !== "cart" || !pl.g || pl.removed) continue; stats.queues++;
      [[0.3, 2.3, 2], [0.45, 3.0, 0], [0.3, 3.7, 4]].forEach(([x, z, sh], k) => { person(pl.g, x, z, 0, { shirt: sh, bag: k === 1 }); blockers.push({ x: isl.x + pl.x + Math.cos(pl.face) * x + Math.sin(pl.face) * z, z: isl.z + pl.z - Math.sin(pl.face) * x + Math.cos(pl.face) * z, r: 0.5 }); }); }
    { const b = pois.find(p => p.kind === "bench" && !p.taken); if (b) { b.taken = true; stats.pairs++; const grp = new THREE.Group(); grp.position.set(b.x - Math.sin(b.face) * 0.35, 0, b.z - Math.cos(b.face) * 0.35); grp.rotation.y = b.face; g.add(grp);
      sit(person(grp, -0.4, 0.35, 0, { shirt: 2, skin: 1 })); chat(sit(person(grp, 0.4, 0.35, 0, { shirt: 5, skin: 2, hat: isl.id === "commons" })), 0); } }

    // ═══ 6. 燈串：兩支桿子之間一條垂下來的線，線上十二顆小燈。聚會所兩串、別的島一串。═══
    for (let n = 0; n < (isl.id === "commons" ? 2 : 1); n++) {
      let A = null, B = null; for (let i = 0; i < 40 && !B; i++) { A = spot(0.5, 0.2, 0.75); if (!A) break; const a = rr() * TAU; const bx = A.x + Math.cos(a) * 5.5, bz = A.z + Math.sin(a) * 5.5; if (free(bx, bz, 0.5)) B = { x: bx, z: bz }; }
      if (!B) break; stats.strings++;
      for (const q of [A, B]) { const pole = new THREE.Group(); pole.add(mesh(new THREE.CylinderGeometry(0.05, 0.07, 3.2, 6), M.dark, 0, 1.6, 0, false), mesh(new THREE.SphereGeometry(0.08, 6, 5), M.dark, 0, 3.2, 0, false)); put(pole, q, null, 0.4); }
      const cv = new THREE.QuadraticBezierCurve3(new THREE.Vector3(A.x, 3.15, A.z), new THREE.Vector3((A.x + B.x) / 2, 2.35, (A.z + B.z) / 2), new THREE.Vector3(B.x, 3.15, B.z));
      g.add(mesh(new THREE.TubeGeometry(cv, 16, 0.02, 4, false), M.dark, 0, 0, 0, false));
      for (let k = 1; k < 12; k++) { const p = cv.getPoint(k / 12); bulbs.push([isl.x + p.x, p.y - 0.12, isl.z + p.z]); }
    }
  }

  // ═══ 6b. 聚會所的門面（2026-11-18 第四批）：聚會所已經放不下東西，就把有的打扮起來。島心那塊圓形鋪面外面三圈深淺交錯的磚（平的，一次畫完，不壓到房子）、
  // 外圍一圈彩旗（八支桿子之間掛，哪一支放不下就跳過那一段）、幾盞燈、三群人：牽手的一對、推嬰兒車的加一個朋友、坐輪椅的加一個朋友。═══
  const tiles = [];
  { const T = bySpot.get("commons");
    if (T) { stats.commonsRing = { tiles: 0, poles: 0, lamps: 0, groups: 0 };
      const onBig = (x, z) => T.blockers.some(b => (b.r || 1.2) >= 1.0 && Math.hypot(T.isl.x + x - b.x, T.isl.z + z - b.z) < b.r - 0.2);
      for (const [ring, rad] of [[0, 3.95], [1, 5.1], [2, 6.25]]) { const n = Math.round(TAU * rad / 1.12); for (let i = 0; i < n; i++) { const a = i / n * TAU; const x = Math.cos(a) * rad, z = Math.sin(a) * rad; if (!T.inside(x, z, 1.4) || onBig(x, z)) continue; tiles.push([T.isl.x + x, 0.035, T.isl.z + z, -a, 1, (ring + i) % 2]); stats.commonsRing.tiles++; } }
      const poles = []; for (let k = 0; k < 8; k++) { const a = k / 8 * TAU + 0.2; let got = null; for (const rad of [7.3, 6.7, 7.9]) { const x = Math.cos(a) * rad, z = Math.sin(a) * rad; if (T.inside(x, z, 1.5) && T.free(x, z, 0.15)) { got = { x, y: 3.3, z }; break; } }
        if (got) { const pole = new THREE.Group(); pole.add(mesh(new THREE.CylinderGeometry(0.05, 0.07, 3.4, 6), M.dark, 0, 1.7, 0, false), mesh(new THREE.SphereGeometry(0.09, 6, 5), M.orange, 0, 3.4, 0, false)); T.put(pole, got, null, 0.3); stats.commonsRing.poles++; } poles.push(got); }
      for (let k = 0; k < 8; k++) { const A = poles[k], B = poles[(k + 1) % 8]; if (A && B) E.bunting(T.g, A, B, [M.orange, M.teal, M.yellow, M.white], 0.7); }
      for (let k = 0; k < 4; k++) { const a = k / 4 * TAU + 0.6; for (const rad of [6.3, 5.6, 7.0]) { const x = Math.cos(a) * rad, z = Math.sin(a) * rad; if (T.inside(x, z, 1.5) && T.free(x, z, 0.2)) { T.put(E.lamp(), { x, z }, null, 0.4); stats.commonsRing.lamps++; break; } } }
      // 三群人：在磚的那幾圈上找離大東西 0.35 公尺的空位。
      const groupAt = fn => { for (let i = 0; i < 200; i++) { const a = T.rr() * TAU, rad = 4.0 + T.rr() * 2.6; const x = Math.cos(a) * rad, z = Math.sin(a) * rad; if (!T.inside(x, z, 1.6) || !T.free(x, z, 0.35)) continue; const grp = new THREE.Group(); T.put(grp, { x, z }, Math.atan2(-x, -z), 0.8); fn(grp); stats.commonsRing.groups++; return; } };
      groupAt(grp => { const a = person(grp, -0.32, 0, 0, { shirt: 1, skin: 0 }), b = person(grp, 0.32, 0, 0, { shirt: 4, skin: 2, hat: true }); a.userData.parts.armR.rotation.z = -0.5; b.userData.parts.armL.rotation.z = 0.5; a.userData.parts.armR.rotation.x = -0.15; b.userData.parts.armL.rotation.x = -0.15; });   // 牽手：內側的手往對方伸
      groupAt(grp => { person(grp, -0.4, 0, 0.3, { shirt: 2, skin: 1, stroller: true }); chat(person(grp, 0.6, 0.3, -0.9, { shirt: 5, bag: true }), 1); });
      groupAt(grp => { person(grp, -0.3, 0.2, 0.4, { shirt: 0, skin: 2, chair: true }); chat(person(grp, 0.55, -0.2, -0.7, { shirt: 3, pack: true }), 0); });
    } }

  // ═══ 7. 機場：加油車（車頭、油罐、軟管）、登機梯加排隊的旅客與地勤。塔台與風向袋引擎已經有了。═══
  if (airport) {
    const g = new THREE.Group(); g.position.set(airport.x, 0, airport.z); world.add(g);
    const truck = new THREE.Group(); truck.position.set(10.2, 0, -4.6); truck.rotation.y = 0.3; g.add(truck);
    truck.add(mesh(rbox(0.9, 0.9, 1.0, 0.1), M.yellow, 0.9, 0.75, 0), mesh(rbox(0.5, 0.4, 0.9, 0.05), M.light, 1.15, 1.0, 0, false), mesh(new THREE.CylinderGeometry(0.5, 0.5, 1.9, 12), M.white, -0.5, 0.9, 0, false).rotateZ(Math.PI / 2), mesh(rbox(2.6, 0.2, 1.0, 0.04), M.dark, 0, 0.35, 0, false), mesh(rbox(0.4, 0.3, 0.3, 0.05), M.orange, -0.5, 1.55, 0, false));
    for (const x of [-0.8, 0.8]) for (const z of [-0.55, 0.55]) truck.add(mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.16, 10), M.dark, x, 0.24, z, false).rotateX(Math.PI / 2));
    const hose = new THREE.QuadraticBezierCurve3(new THREE.Vector3(-1.4, 0.9, 0.3), new THREE.Vector3(-2.4, 0.3, 0.9), new THREE.Vector3(-3.4, 0.6, 0.9)); truck.add(mesh(new THREE.TubeGeometry(hose, 12, 0.04, 5, false), M.dark, 0, 0, 0, false));
    person(truck, -1.2, 1.0, 2.6, { shirt: 2, hat: true, scale: 1.0 });
    // 登機梯靠在停著那架（本地 (1.0, -6.6)）的左側；三個旅客排隊、一個地勤在梯子前面。
    const st = new THREE.Group(); st.position.set(1.0, 0, -2.9); g.add(st);   // 梯子靠機身這一側的門（批 D：之前前兩階在機身裡、排隊的人頭穿機翼）
    for (let k = 0; k < 4; k++) st.add(mesh(rbox(0.9, 0.12, 0.3, 0.02), M.dark, 0, 0.15 + k * 0.17, 0.5 - k * 0.3, false));
    for (const x of [-0.45, 0.45]) { const rail = mesh(rbox(0.04, 0.04, 1.3, 0.01), M.dark, x, 0.9, -0.1, false); rail.rotation.x = -0.45; st.add(rail); st.add(mesh(rbox(0.04, 0.6, 0.04, 0.01), M.dark, x, 0.5, 0.5, false)); }
    st.add(mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.12, 8), M.dark, -0.4, 0.06, 0.7, false).rotateX(Math.PI / 2), mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.12, 8), M.dark, 0.4, 0.06, 0.7, false).rotateX(Math.PI / 2));
    [[0.3, 1.2, 1], [-0.3, 1.9, 3], [0.2, 2.6, 5]].forEach(([x, z, sh], k) => person(st, x, z, Math.PI, { shirt: sh, bag: k !== 1, pack: k === 1, scale: 1.0 }));
    const agent = person(st, 0.9, 0.9, -Math.PI / 2, { shirt: 3, hat: true, scale: 1.0 }); agent.userData.parts.armR.rotation.x = -1.2;
    for (const [x, z] of [[1.3, -1.7], [0.7, -1.0], [1.2, -0.3], [10.4, -4.6]]) (blockersOf.get("airport") || []).push({ x: airport.x + x, z: airport.z + z, r: 0.5 });
  }

  // ═══ 一次畫完的小東西 ═══
  const putAll = (geo, m, places, color, dyn) => { const im = new THREE.InstancedMesh(geo, m, Math.max(1, places.length)); const mx = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0); places.forEach(([x, y, z, ry, sc], i) => { q.setFromAxisAngle(up, ry || 0); s.setScalar(sc || 1); mx.compose(new THREE.Vector3(x, y, z), q, s); im.setMatrixAt(i, mx); if (color) im.setColorAt(i, color(places[i])); }); im.count = places.length; im.instanceMatrix.needsUpdate = true; if (color && im.instanceColor) im.instanceColor.needsUpdate = true; im.castShadow = false; im.receiveShadow = true; if (dyn) im.userData.dynamic = true; world.add(im); return im; };
  putAll(new THREE.SphereGeometry(0.13, 6, 5), new THREE.MeshStandardMaterial({ color: P.white, roughness: 0.8 }), rowFlowers, p => flowerCol[p[3] % flowerCol.length]);
  putAll(new THREE.CylinderGeometry(0.02, 0.025, 0.26, 4), M.tree[1], rowFlowers.map(([x, y, z]) => [x, y - 0.12, z]));
  putAll(new THREE.SphereGeometry(0.17, 6, 5), M.tree[1], veg.map(([x, y, z, ry, sc]) => [x, y, z, ry, sc]));
  putAll(rbox(0.1, 0.72, 0.04, 0.015), M.white, pickets);
  putAll(new THREE.SphereGeometry(0.07, 6, 5), M.amber, bulbs);
  putAll(new THREE.DodecahedronGeometry(0.2, 0), M.cliff, stones);
  { const a = mix(P.cream, P.sand, 0.55), b = mix(P.orange, P.white, 0.6); putAll(new THREE.BoxGeometry(0.95, 0.03, 0.95), new THREE.MeshStandardMaterial({ color: P.white, roughness: 0.9 }), tiles, p => p[5] ? a : b); }   // 聚會所的鋪面磚（兩色交錯）
  return { tick: (dt, t) => { for (const f of ticks) f(dt, t); } };
}
