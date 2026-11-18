// /island/ 海的第三批（2026-11-18 Paul 看完第二批又說「More detail first」：要好看、要活，不是塞滿）。
// 這一支管水：整片海會動的漣漪（兩張自己畫的小貼圖，一張法線一張明暗，各自慢慢滑）、渡輪與帆船與水上飛機的尾浪（一次畫完、越舊越寬越淡）、
// 沙灘外的淺水區與海草區、北邊遠處每 36 秒浮上來一次的鯨魚（背、噴水、下潛時甩尾）、一座島邊的瀑布（島緣一座小山丘，山頂一池水，水從崖上落進海裡，
// 底下有霧與礁石，旁邊一段看台欄杆站兩個人，池裡兩隻鴨子）。
// 跟 sea.js 一樣的規矩：不 import three、不 import toy.js，THREE 跟引擎 E 從 scene.js 傳進來；放在島上的東西記進 blockersOf；會動的標 userData.dynamic，每一幀在 tick() 裡動。
// 要在 sea.js 之後建（沙灘的方向記在 E.seaStats.beachAngles、帆船與水上飛機在 E.seaObjs、渡輪在 E.ferryObj），在 E.flushInstances() 之前建（瀑布那一塊的樹要先拿掉）。
// 一次畫完的小東西：一個 InstancedMesh、一種幾何、每一個自己的位置大小顏色（顏色用 instanceColor，材質底色要是白的）。dyn 給了就每一幀可以改（尾浪、噴水、鴨子、行李拖車）。
// cap 是最多幾個；count 超過 24 或有 instanceColor 的引擎 mergeStatic() 不會去碰，所以一直是一個 draw call。sights.js 也用這一支。
export function makeInstancer(THREE, world) {
  return function instancer(geo, mat, cap, dyn, cast) {
    const im = new THREE.InstancedMesh(geo, mat, cap); im.count = 0; im.castShadow = !!cast; im.receiveShadow = false; im.frustumCulled = false; world.add(im);
    if (dyn) { im.userData.dynamic = true; im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); }
    const mx = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), v = new THREE.Vector3(), e = new THREE.Euler();
    const api = { im,
      set(i, x, y, z, sx, sy, sz, ry, col, rx, rz) { e.set(rx || 0, ry || 0, rz || 0); q.setFromEuler(e); s.set(sx, sy == null ? sx : sy, sz == null ? sx : sz); v.set(x, y, z); mx.compose(v, q, s); im.setMatrixAt(i, mx); if (col) im.setColorAt(i, col); },
      setM(i, m, col) { im.setMatrixAt(i, m); if (col) im.setColorAt(i, col); },
      add(x, y, z, sx, sy, sz, ry, col, rx, rz) { const i = im.count++; api.set(i, x, y, z, sx, sy, sz, ry, col, rx, rz); return i; },
      hide(i) { s.set(0, 0, 0); v.set(0, -50, 0); q.identity(); mx.compose(v, q, s); im.setMatrixAt(i, mx); },
      flush() { im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; } };
    return api;
  };
}
export function buildWater(THREE, E, c) {
  const { M, P, world, rbox, makePerson } = E;
  const { islands, blockersOf, groupOf, whale: W, bridgeAngles, lifePlaces } = c;
  const TAU = Math.PI * 2, ticks = [];
  const mesh = (geo, m, x, y, z, shadow) => { const o = new THREE.Mesh(geo, m); o.position.set(x || 0, y || 0, z || 0); o.castShadow = shadow !== false; o.receiveShadow = true; return o; };
  const std = (color, extra) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, ...(extra || {}) });
  const mix = (a, b, t) => a.clone().lerp(b, t);
  const smooth = k => { k = Math.max(0, Math.min(1, k)); return k * k * (3 - 2 * k); };
  const stats = { ripple: false, wakes: 0, shallows: 0, whale: null, waterfall: "", ducks: 0 }; E.waterStats = stats;   // 除錯：console 裡 __island._E.waterStats
  const instancer = makeInstancer(THREE, world);

  // ═══ 1. 漣漪：海的材質掛兩張 128 點的小貼圖（四組不同方向的正弦波疊起來的高度圖：一張算成法線、一張只是明暗 4%），各自往不同方向慢慢滑。═══
  // 太陽照在凹凸上就會有一點一點的亮光，像真的水面；兩張滑的方向不同，看起來不像一張格子紙在推。
  {
    const N = 128, h = new Float32Array(N * N); const waves = [[3, 1, 0.5, 0.3], [1, 4, 0.35, 2.1], [-2, 3, 0.3, 4.0], [5, -2, 0.2, 1.2]];
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { let s = 0; for (const [kx, ky, amp, ph] of waves) s += amp * Math.sin(TAU * (kx * x + ky * y) / N + ph); h[y * N + x] = s; }
    const at = (x, y) => h[((y + N) % N) * N + ((x + N) % N)];
    const canvas = (fill) => { const cv = document.createElement("canvas"); cv.width = cv.height = N; const ctx = cv.getContext("2d"); const img = ctx.createImageData(N, N); for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const [r, g, b] = fill(x, y); const i = (y * N + x) * 4; img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b; img.data[i + 3] = 255; } ctx.putImageData(img, 0, 0); const tex = new THREE.CanvasTexture(cv); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(64, 64); return tex; };
    const nTex = canvas((x, y) => { const dx = (at(x + 1, y) - at(x - 1, y)) * 1.6, dy = (at(x, y + 1) - at(x, y - 1)) * 1.6; const L = Math.hypot(dx, dy, 1); return [Math.round((-dx / L * 0.5 + 0.5) * 255), Math.round((-dy / L * 0.5 + 0.5) * 255), Math.round((1 / L * 0.5 + 0.5) * 255)]; });
    const cTex = canvas((x, y) => { const v = Math.round(Math.max(0, Math.min(255, 242 + at(x, y) * 9))); return [v, v, v]; }); cTex.colorSpace = THREE.SRGBColorSpace;
    const water = M.water; water.normalMap = nTex; water.normalScale.set(0.32, 0.32); water.map = cTex; water.roughness = 0.3; water.needsUpdate = true; stats.ripple = true;
    ticks.push(dt => { nTex.offset.x += dt * 0.011; nTex.offset.y += dt * 0.007; cTex.offset.x -= dt * 0.006; cTex.offset.y += dt * 0.009; });
  }

  // ═══ 2. 淺水區：每個沙灘灣外面一塊淡的（沙洲）、再外面一塊深一點的（海草），兩塊都是壓扁的橢圓，貼在海面上。沒有沙灘的島不放。═══
  {
    const lightM = new THREE.MeshStandardMaterial({ color: mix(P.water, P.shallow, 0.6), roughness: 0.35 }), darkM = new THREE.MeshStandardMaterial({ color: mix(mix(P.water, P.navy, 0.14), P.teal, 0.1), roughness: 0.4 });
    const disc = new THREE.CircleGeometry(1, 22); disc.rotateX(-Math.PI / 2);
    for (const isl of islands) {
      const b = E.seaStats && E.seaStats.beachAngles ? E.seaStats.beachAngles[isl.id] : null; if (b == null) continue;
      for (const [rad, da, sx, sz, m, y] of [[isl.r + 3.9, 0.0, 2.6, 1.6, lightM, -0.575], [isl.r + 6.3, 0.22, 2.8, 1.9, darkM, -0.57], [isl.r + 5.4, -0.42, 1.6, 1.1, darkM, -0.57]]) {
        const a = b + da; const o = mesh(disc, m, isl.x + Math.cos(a) * rad, y, isl.z + Math.sin(a) * rad, false); o.receiveShadow = false; o.scale.set(sx, 1, sz); o.rotation.y = -a + 0.3; world.add(o); stats.shallows++;
      }
    }
  }

  // ═══ 3. 尾浪：一個 InstancedMesh 放所有的白色小片。船每走 0.9 公尺在後面放一片，片會越來越寬、顏色從白慢慢混成海的顏色（跟海一樣就看不見了），2.8 秒後收回去。═══
  const wakes = (() => {
    const geo = new THREE.PlaneGeometry(1, 1); geo.rotateX(-Math.PI / 2);
    const ins = instancer(geo, new THREE.MeshBasicMaterial({ color: P.white, transparent: true, opacity: 0.55, depthWrite: false }), 160, true);
    const strips = []; for (let i = 0; i < 160; i++) { strips.push({ age: 9, x: 0, z: 0, ry: 0, len: 1 }); ins.add(0, -50, 0, 0, 0, 0, 0, P.white); }
    let next = 0; const col = new THREE.Color();
    const spawn = (x, z, ry, len) => { const s = strips[next]; next = (next + 1) % strips.length; s.age = 0; s.x = x; s.z = z; s.ry = ry; s.len = len; };
    const LIFE = 5.0;
    ticks.push(dt => { strips.forEach((s, i) => { if (s.age > LIFE) return; s.age += dt; if (s.age > LIFE) { ins.hide(i); return; } const k = s.age / LIFE; col.copy(P.white).lerp(P.water, Math.min(1, k * k * 1.3)); ins.set(i, s.x, -0.56, s.z, s.len, 1, 0.7 + k * 2.2, s.ry, col); }); ins.flush(); });
    // 跟著一艘船：記它上一次放片的位置，走了 0.9 公尺就放一片（長度就是那一段）。片放在船尾後面 back 公尺（照船走的方向往後算，不看船的朝向：渡輪掉頭的時候船頭船尾會對調），
    // 不然片全部藏在船底下，等露出來已經淡掉了（第一版就是這樣看不到）。onWater 回 false 的時候（飛機在天上）不放。
    const follow = (obj, onWater, back) => { let lx = null, lz = null; stats.wakes++;
      ticks.push(() => { if (!obj) return; const wx = obj.position.x, wz = obj.position.z;
        if (onWater && !onWater()) { lx = null; return; } if (lx == null) { lx = wx; lz = wz; return; }
        const d = Math.hypot(wx - lx, wz - lz); if (d < 0.9) return; if (d > 6) { lx = wx; lz = wz; return; }
        const ux = (wx - lx) / d, uz = (wz - lz) / d; spawn(wx - ux * ((back || 0) + d / 2), wz - uz * ((back || 0) + d / 2), -Math.atan2(uz, ux), d + 0.4); lx = wx; lz = wz; }); };
    return { spawn, follow };
  })();
  if (E.ferryObj) wakes.follow(E.ferryObj, null, 3.0);
  for (const s of (E.seaObjs && E.seaObjs.sail) || []) wakes.follow(s, null, 1.3);
  if (E.seaObjs && E.seaObjs.plane) { const pl = E.seaObjs.plane; wakes.follow(pl, () => pl.position.y < 0.6, 1.2); }

  // ═══ 4. 鯨魚：遠處北邊的空水域。每 36 秒浮上來一次：背先出水、往前游、噴水（一小把白球往上拋再落下）、再頭往下潛、尾巴翹起來甩一下。海面是不透明的，水下的部分自然看不到。═══
  if (W) {
    const g = new THREE.Group(); g.userData.dynamic = true; world.add(g); const body = new THREE.Group(); g.add(body); const tail = new THREE.Group(); tail.userData.dynamic = true; tail.position.set(-3.4, 0, 0); body.add(tail);
    const wM = std(mix(mix(P.navy, P.grey, 0.45), P.teal, 0.12), { roughness: 0.5 }), wM2 = std(mix(mix(P.navy, P.grey, 0.45), P.white, 0.35), { roughness: 0.6 });
    // 身體：前面一顆壓扁的大球當頭、後面一段往尾巴收細的圓錐，背上一片小背鰭、兩側一對胸鰭、一條白色的嘴線、兩顆眼睛；尾巴（會甩）在 tail 這個 group。
    const head = mesh(new THREE.SphereGeometry(1.0, 14, 10), wM, 1.3, 0, 0); head.scale.set(2.1, 1.3, 1.45); body.add(head);
    const back = mesh(new THREE.CylinderGeometry(1.28, 0.42, 4.4, 14), wM, -1.3, 0, 0); back.rotation.z = Math.PI / 2; body.add(back);
    const belly = mesh(new THREE.SphereGeometry(0.9, 10, 8), wM2, 1.2, -0.5, 0, false); belly.scale.set(2.0, 0.9, 1.25); body.add(belly);
    body.add(mesh(rbox(0.8, 0.7, 0.14, 0.06), wM, -0.9, 1.25, 0, false).rotateZ(0.5), mesh(rbox(1.3, 0.12, 0.55, 0.05), wM, 1.2, -0.65, 1.45, false).rotateX(0.5), mesh(rbox(1.3, 0.12, 0.55, 0.05), wM, 1.2, -0.65, -1.45, false).rotateX(-0.5),
      mesh(rbox(1.6, 0.05, 0.03, 0.01), M.white, 2.5, -0.25, 1.2, false).rotateY(0.5), mesh(rbox(1.6, 0.05, 0.03, 0.01), M.white, 2.5, -0.25, -1.2, false).rotateY(-0.5), mesh(new THREE.SphereGeometry(0.12, 7, 5), M.dark, 2.7, 0.3, 1.1, false), mesh(new THREE.SphereGeometry(0.12, 7, 5), M.dark, 2.7, 0.3, -1.1, false), mesh(new THREE.SphereGeometry(0.16, 7, 5), wM, 1.6, 1.25, 0, false));
    tail.add(mesh(rbox(1.4, 0.45, 0.38, 0.12), wM, -0.6, 0, 0, false), mesh(rbox(1.4, 0.1, 1.4, 0.05), wM, -1.6, 0, 0.8, false).rotateY(0.5), mesh(rbox(1.4, 0.1, 1.4, 0.05), wM, -1.6, 0, -0.8, false).rotateY(-0.5));
    E.mergeChildren(body); E.mergeChildren(tail);
    const spray = instancer(new THREE.SphereGeometry(1, 6, 5), new THREE.MeshStandardMaterial({ color: P.white, roughness: 1 }), 12, true); const drops = []; for (let k = 0; k < 12; k++) { drops.push([Math.cos(k * 2.4) * 0.5, Math.sin(k * 2.4) * 0.5, 2.6 + (k % 4) * 0.4]); spray.add(0, -50, 0, 0, 0, 0, 0); }
    const per = W.period || 36; let heading = 0.6, cx = W.x, cz = W.z, lastP = -1; stats.whale = { x: cx, z: cz, up: false };
    ticks.push((dt, t) => {
      const p = (t + per - 6) % per;   // 開場六秒後第一次浮上來
      if (p < lastP) { heading += 0.9; const d = Math.hypot(cx - W.x, cz - W.z); if (d > 5) heading = Math.atan2(W.z - cz, W.x - cx) + 0.4; }
      lastP = p; stats.whale.up = p < 10;
      if (p >= 10) { g.position.set(cx, -9, cz); drops.forEach((d, k) => spray.hide(k)); spray.flush(); return; }
      const u = p; const fwd = Math.min(u, 7) * 0.55; const x = cx + Math.cos(heading) * fwd, z = cz + Math.sin(heading) * fwd; if (u >= 9.9) { cx = x; cz = z; stats.whale.x = cx; stats.whale.z = cz; }
      let y, pitch = 0, flip = 0;
      if (u < 2.6) y = -4.4 + 3.45 * smooth(u / 2.6);
      else if (u < 6) { y = -0.95 + Math.sin(u * 1.4) * 0.05; pitch = Math.sin(u * 1.4) * 0.03; }
      else { const k = (u - 6) / 4; y = -0.95 - k * k * 5.5; pitch = -smooth(k * 1.2) * 0.9; flip = smooth(k * 1.5) * 0.9; }
      g.position.set(x, y, z); g.rotation.y = -heading; body.rotation.z = pitch; tail.rotation.z = flip;
      // 噴水：浮上來之後 2.3 到 4.3 秒，十二顆小球從噴氣孔往上拋，各自晚一點出發，落回水面就縮掉。
      drops.forEach(([vx, vz, vy], k) => { const age = (u - 2.3) - k * 0.06; if (age < 0 || age > 1.3) { spray.hide(k); return; } const bx = 1.6, by = 1.35; const lx = bx + vx * age * 1.3, ly = by + vy * age - 4.2 * age * age, lz = vz * age * 1.3;
        const wx = x + Math.cos(heading) * lx - Math.sin(heading) * lz, wz = z + Math.sin(heading) * lx + Math.cos(heading) * lz; const sc = (0.1 + age * 0.22) * (age > 0.9 ? Math.max(0, (1.3 - age) / 0.4) : 1); spray.set(k, wx, y + ly, wz, sc); });
      spray.flush(); });
  }

  // ═══ 5. 瀑布：挑一座島、一個朝向鏡頭又沒有橋沒有碼頭沒有沙灘的方向，島緣放一座小山丘（面海那一側是崖），山頂一池水、一段小溪流到崖邊、水落進海裡。═══
  // 山丘那一塊的樹、矮樹、桌椅、小店（town.js 的 fell）與引擎的圍欄（在島的 group 裡、半徑 r 減 1.1 那一圈）都清掉；山丘與看台記進 blockers（人會繞開，不會走到山上）。
  {
    const angDiff = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
    const edgeR = (isl, th) => { if (isl.shape !== "hex") return isl.r; let ph = (th - Math.PI / 6) % (Math.PI / 3); if (ph < 0) ph += Math.PI / 3; return isl.r * Math.cos(Math.PI / 6) / Math.cos(ph - Math.PI / 6); };
    const spots = E.townSpots; let done = false;
    const order = ["internship", "curriculum", "sponsorship", "cr", "marketing", "mentorship", "commons"];
    for (const pass of [[0.35, 2.8], [0, TAU]]) {   // 先找朝向鏡頭（+z）的方向，找不到才找任何方向
      for (const id of order) {
        if (done) break; const T = spots && spots.get(id); const isl = islands.find(i => i.id === id); if (!T || !isl || isl.sea) continue;
        const avoid = (bridgeAngles.get(id) || []).map(a => [a, 0.7]); for (const pl of lifePlaces.get(id) || []) if (pl.kind === "dock") avoid.push([pl.a, 0.6]);
        const ba = E.seaStats && E.seaStats.beachAngles && E.seaStats.beachAngles[id]; if (ba != null) avoid.push([ba, 1.0]);
        const hard = T.blockers.filter(b => (b.r || 1.2) >= 0.8 && !T.isSoft(b));
        const clearAt = (lx, lz, d) => !hard.some(b => Math.hypot(isl.x + lx - b.x, isl.z + lz - b.z) < (b.r || 1.2) + d);
        for (let k = 0; k < 72 && !done; k++) {
          const a = k / 72 * TAU; if (a < pass[0] || a > pass[1]) continue; if (avoid.some(([b, m]) => angDiff(a, b) < m)) continue;
          const eR = edgeR(isl, a); const ca = Math.cos(a), sa = Math.sin(a), px = -sa, pz = ca;
          const hx = ca * (eR - 2.5), hz = sa * (eR - 2.5);   // 山丘的中心：半徑 2.6，剛好貼到島緣
          // 山丘底下那一圈（半徑 2.4 取 5 乘 5 個點）每一點都要在島上（六邊形的島每個方向的島緣不一樣遠，各算各的）、不壓到硬的東西（房子、那座島自己的擺設、小店以外的大東西）。
          let ok = true; for (let i = -2; i <= 2 && ok; i++) for (let j = -2; j <= 2 && ok; j++) { if (Math.hypot(i, j) > 2.1) continue; const lx = hx + ca * i * 1.2 + px * j * 1.2, lz = hz + sa * i * 1.2 + pz * j * 1.2; if (Math.hypot(lx, lz) > edgeR(isl, Math.atan2(lz, lx)) + 0.2 || !clearAt(lx, lz, 0.3)) ok = false; }
          if (!ok) continue;
          // 看台欄杆在山丘的側邊（左邊放不下就放右邊）。
          let rx = 0, rz = 0, railOk = false; for (const side of [1, -1]) { rx = hx + px * side * 3.6 - ca * 0.6; rz = hz + pz * side * 3.6 - sa * 0.6; if (Math.hypot(rx, rz) <= edgeR(isl, Math.atan2(rz, rx)) - 1.0 && clearAt(rx, rz, 1.0)) { railOk = true; break; } }
          if (!railOk) continue;
          done = true; stats.waterfall = id + "@" + a.toFixed(2);
          T.fell(hx, hz, a, 3.0, 3.0); T.fell(rx, rz, a, 1.2, 1.2);
          const ig = groupOf.get(id); if (ig) for (const ch of ig.children.slice()) { const d = Math.hypot(ch.position.x, ch.position.z); if (Math.abs(d - (isl.r - 1.1)) < 0.2 && angDiff(Math.atan2(ch.position.z, ch.position.x), a) < 0.5) ig.remove(ch); }   // 引擎 furnish 的圍欄橫桿
          for (let i = E.postPlaces.length - 1; i >= 0; i--) { const [wx, , wz] = E.postPlaces[i]; const lx = wx - isl.x, lz = wz - isl.z; if (Math.abs(Math.hypot(lx, lz) - (isl.r - 1.1)) < 0.2 && angDiff(Math.atan2(lz, lx), a) < 0.5) E.postPlaces.splice(i, 1); }
          const bl = blockersOf.get(id) || []; bl.push({ x: isl.x + hx, z: isl.z + hz, r: 3.1 }, { x: isl.x + rx, z: isl.z + rz, r: 1.0 });
          const g = new THREE.Group(); g.position.set(isl.x + hx, 0, isl.z + hz); g.rotation.y = -a; world.add(g);   // 本地 +x 朝海
          const toW = (lx, lz) => [g.position.x + lx * Math.cos(a) - lz * Math.sin(a), g.position.z + lx * Math.sin(a) + lz * Math.cos(a)];   // 山丘的本地座標換成世界座標（石頭是一次畫完的，要世界座標）
          // 山丘：草的圓台、面海那一半包一層崖的殼、頂上一片草。
          const hillM = std(mix(mix(P.grass, P.teal, 0.2), P.navy, 0.06)), rockM = std(mix(mix(P.cliff, P.navy, 0.16), P.grey, 0.1), { roughness: 0.95 });   // 山比島的地深一點的綠、崖比島的崖深一點的灰，不然整座山跟地板糊在一起（第一版就是這樣）
          g.add(mesh(new THREE.CylinderGeometry(2.2, 2.7, 2.2, 20), hillM, 0, 1.1, 0), mesh(new THREE.CylinderGeometry(2.32, 2.85, 2.25, 12, 1, true, -Math.PI / 2 - 0.3, Math.PI + 0.6), rockM, 0, 1.1, 0).rotateY(Math.PI / 2), mesh(new THREE.CylinderGeometry(2.2, 2.2, 0.1, 20), hillM, 0, 2.2, 0, false));
          for (let k = 0; k < 7; k++) { const th = Math.PI - 1.3 + k * 0.43; const bsh = mesh(new THREE.SphereGeometry(0.42, 8, 6), M.tree[k % 3], Math.cos(th) * 2.9, 0.22, Math.sin(th) * 2.9, false); bsh.scale.set(1.1, 0.75, 1.1); g.add(bsh); }   // 山腳靠島內那一半一圈矮樹
          // 山頂的池：水盤、一圈石頭；一段小溪從池邊流到崖口；崖口兩塊大石頭。
          const stones = instancer(new THREE.DodecahedronGeometry(1, 0), rockM, 40, false, true);
          g.add(mesh(new THREE.CylinderGeometry(1.25, 1.25, 0.08, 20), std(mix(P.shallow, P.teal, 0.4), { roughness: 0.2 }), -0.5, 2.26, 0, false));
          for (let k = 0; k < 14; k++) { const th = k / 14 * TAU; const [wx, wz] = toW(-0.5 + Math.cos(th) * 1.38, Math.sin(th) * 1.38); stones.add(wx, 2.3, wz, 0.18 + (k % 3) * 0.05, 0.15, 0.18 + (k % 2) * 0.06, th * 1.3); }
          // 水的貼圖：直的條紋，往下滑；小溪與落水共用同一塊材質（小溪的 v 沿著流向），一起滑。
          const wc = document.createElement("canvas"); wc.width = 32; wc.height = 128; { const ctx = wc.getContext("2d"); const img = ctx.createImageData(32, 128); for (let y = 0; y < 128; y++) for (let x = 0; x < 32; x++) { const v = 236 + Math.round(13 * Math.sin(x * 0.9 + Math.sin(y * 0.15) * 1.5) + 8 * Math.sin(y * 0.4 + x * 0.3)); const i = (y * 32 + x) * 4; img.data[i] = v; img.data[i + 1] = v; img.data[i + 2] = v; img.data[i + 3] = 255; } ctx.putImageData(img, 0, 0); }
          const wTex = new THREE.CanvasTexture(wc); wTex.wrapS = wTex.wrapT = THREE.RepeatWrapping; wTex.repeat.set(1, 2); wTex.colorSpace = THREE.SRGBColorSpace;
          const wM = new THREE.MeshStandardMaterial({ color: mix(P.shallow, P.white, 0.6), emissive: mix(P.shallow, P.white, 0.5), emissiveIntensity: 0.25, map: wTex, transparent: true, opacity: 0.75, roughness: 0.2, side: THREE.DoubleSide, depthWrite: false });
          const sg = new THREE.PlaneGeometry(0.9, 2.0); sg.rotateX(-Math.PI / 2); sg.rotateY(Math.PI / 2);   // 躺平、v 朝 -x：貼圖往 -v 滑就是往海（+x）流
          const stream = new THREE.Mesh(sg, wM); stream.position.set(1.5, 2.27, 0); stream.userData.dynamic = true; g.add(stream);
          for (const [lx, lz, sx, sy, sz, ry] of [[2.3, 0.75, 0.32, 0.26, 0.3, 0.4], [2.3, -0.8, 0.3, 0.24, 0.28, 1.1]]) { const [wx, wz] = toW(lx, lz); stones.add(wx, 2.3, wz, sx, sy, sz, ry); }
          // 落水：兩片直的、一寬一窄前後錯開，從崖口（y 2.25）落到海面下（-0.7）；底下一圈白沫（會一明一暗）、三團霧往上飄再散掉、幾塊礁石。
          for (const [w, dx, dz] of [[1.1, 2.62, 0], [0.7, 2.85, 0.15]]) { const f = new THREE.Mesh(new THREE.PlaneGeometry(w, 2.95), wM); f.position.set(dx, 0.78, dz); f.rotation.y = Math.PI / 2; f.userData.dynamic = true; g.add(f); }
          const foamM = new THREE.MeshBasicMaterial({ color: P.white, transparent: true, opacity: 0.5, depthWrite: false }); const foam = mesh(new THREE.RingGeometry(0.3, 1.5, 20), foamM, 3.1, -0.47, 0.1, false); foam.rotation.x = -Math.PI / 2; foam.userData.dynamic = true; foam.receiveShadow = false; g.add(foam);
          const mist = []; for (let k = 0; k < 3; k++) { const pm = new THREE.MeshStandardMaterial({ color: P.white, transparent: true, opacity: 0.45, roughness: 1 }); const p = mesh(new THREE.SphereGeometry(0.35, 8, 6), pm, 3.0, -0.3, 0, false); p.userData.dynamic = true; g.add(p); mist.push(p); }
          for (const [dx, dz, s] of [[3.7, 1.0, 0.4], [3.5, -1.1, 0.34], [4.3, 0.2, 0.3], [2.9, 1.6, 0.26], [3.3, -0.2, 0.22]]) { const [wx, wz] = toW(dx, dz); stones.add(wx, -0.52, wz, s, s * 0.8, s, dx * 2); }
          stones.flush();
          // 看台：兩支柱一支橫桿（木頭），兩個人靠著看瀑布（一個指著）。
          const rail = new THREE.Group(); rail.position.set(isl.x + rx, 0, isl.z + rz); rail.rotation.y = -a; world.add(rail);
          for (const dz of [-0.9, 0.9]) rail.add(mesh(new THREE.CylinderGeometry(0.06, 0.07, 1.0, 6), M.wood, 0, 0.5, dz, false)); rail.add(mesh(rbox(0.08, 0.08, 2.0, 0.02), M.wood, 0, 1.0, 0, false), mesh(rbox(0.06, 0.06, 2.0, 0.02), M.wood, 0, 0.6, 0, false));
          [[-0.5, -0.45, 1, 0], [-0.5, 0.5, 4, 2]].forEach(([x, z, sh, sk], k) => { const pp = makePerson({ scale: 1.1, shirt: sh, skin: sk, hat: k === 1 }); pp.position.set(x, 0, z); pp.rotation.y = Math.PI / 2 - (z < 0 ? 0.6 : 0.9); rail.add(pp); pp.userData.parts.armR.rotation.x = k ? -0.3 : -1.6; pp.userData.parts.armL.rotation.x = -0.3; });
          // 鴨子：兩隻，身體與頭是奶油色的盒子、橘色的嘴，在池裡各自繞著小圈漂，身體輕輕搖。
          const duckM = std(mix(P.cream, P.white, 0.5)); const ducks = [];
          for (let k = 0; k < 2; k++) { const d = new THREE.Group(); d.userData.dynamic = true; g.add(d); d.add(mesh(rbox(0.42, 0.2, 0.26, 0.07), duckM, 0, 0.12, 0, false), mesh(rbox(0.16, 0.18, 0.16, 0.05), duckM, 0.18, 0.32, 0, false), mesh(rbox(0.12, 0.05, 0.08, 0.015), M.orange, 0.32, 0.3, 0, false), mesh(rbox(0.1, 0.08, 0.14, 0.02), duckM, -0.24, 0.2, 0, false).rotateZ(-0.5)); E.mergeChildren(d); ducks.push(d); stats.ducks++; }
          ticks.push((dt, t) => { wTex.offset.y += dt * 0.55; foamM.opacity = 0.35 + 0.2 * Math.sin(t * 2.6); foam.scale.setScalar(1 + Math.sin(t * 1.3) * 0.08);
            mist.forEach((p, k) => { const u = (t * 0.45 + k / 3) % 1; p.position.set(3.0 + Math.sin(t * 0.9 + k) * 0.4, -0.35 + u * 1.9, Math.cos(t * 0.8 + k * 2) * 0.5); p.scale.setScalar(0.5 + u * 1.5); p.material.opacity = 0.45 * (1 - u); });
            ducks.forEach((d, k) => { const th = t * (k ? -0.22 : 0.27) + k * 2.2; d.position.set(-0.5 + Math.cos(th) * 0.75, 2.3 + Math.sin(t * 2.1 + k) * 0.015, Math.sin(th) * 0.75); d.rotation.y = -th + (k ? Math.PI : 0) + Math.PI / 2; d.rotation.z = Math.sin(t * 1.9 + k) * 0.06; }); });
        }
      }
      if (done) break;
    }
  }
  return { tick: (dt, t) => { for (const f of ticks) f(dt, t); } };
}
