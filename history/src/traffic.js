// /history/ 機場外面會動的東西（2026-11-18 第二批）：進場落地的飛機、等起飛的飛機、行李拖車、餐勤車、鳥、旗；不動的燈與井蓋與貨運坪。
// 不 import three。tick(t, e) 多收捲動的進度 e：起飛那一段跑道要留給我們自己那一架，進場的那一架先躲開。
export function buildTraffic(THREE, c) {
  const { mats, P, A, box, cyl, instanced, figure, idleFigs, lam, world, truck, buildAirliner, setGear, shadowOn, tw } = c;
  const movers = [], R = A.RUNWAY;
  const dyn = g => { g.userData.dynamic = true; return g; };

  // ═══ 進場、落地、滾行的那一架（循環 110 秒：從東邊 1100 公尺外、60 公尺高下來，x 200 觸地，滾到 x -560，滑出去就先消失，等下一輪）═══
  {
    const pl = buildAirliner(THREE, { body: P.cream, tail: P.teal, mark: P.navy, dark: P.dark }); shadowOn(pl); dyn(pl); world.add(pl); setGear(pl, 1);
    pl.rotation.y = -Math.PI / 2; pl.rotation.order = "YXZ";   // 機頭朝 -x（跟我們起飛同一個方向）；先航向再俯仰
    const T = 110, ease = u => u * u * (3 - 2 * u);
    // 批 B：觸地前 15% 拉平（flare）、觸地之後從進場的速度減到滑行速度、一路滾到 x -615 才消失（之前觸地反而加速 1.9 倍、跑到一半消失）。
    movers.push({ fn: (t, e) => {
      if (e >= A.PHASES.takeoff[0]) { pl.visible = false; return; }
      const u = (t % T) / T;
      if (u < 0.32) { const k = u / 0.32; pl.visible = true; pl.position.set(1100 - 900 * k, A.PLANE_REST_Y + 56 * (1 - ease(k)), R.z); pl.rotation.z = 0; pl.rotation.x = 0.02 - 0.08 * ease(Math.max(0, (k - 0.85) / 0.15)); }
      else if (u < 0.82) { const s = u - 0.32, d = s < 0.1 ? 2812 * s - 6560 * s * s : 215.6 + 1500 * (s - 0.1); pl.visible = true; pl.position.set(200 - d, A.PLANE_REST_Y, R.z); pl.rotation.x = -0.06 * Math.max(0, 1 - s / 0.03); }
      else pl.visible = false;
    } });
  }
  // ═══ 在跑道頭等起飛的那一架（x 345、z 330，機頭朝跑道）：防撞信標紅燈一秒閃一次 ═══
  {
    const pad = new THREE.Mesh(new THREE.PlaneGeometry(70, 90), mats.taxi); pad.rotation.x = -Math.PI / 2; pad.position.set(345, 0.02, 325); pad.receiveShadow = true; world.add(pad);   // 等待區的水泥（不然飛機停在草地上）
    const stub = new THREE.Mesh(new THREE.PlaneGeometry(40, 30), mats.taxi); stub.rotation.x = -Math.PI / 2; stub.position.set(315, 0.02, 300); world.add(stub);
    world.add(box(0.3, 0.02, 80, mats.yellowLight, 345, 0.05, 330, false), box(26, 0.02, 0.5, mats.yellowLight, 345, 0.05, 362, false));   // 中線與等待線
    const pl = buildAirliner(THREE, { body: P.cream, tail: P.orange, mark: P.navy, dark: P.dark }); shadowOn(pl); pl.position.set(345, A.PLANE_REST_Y, 330); pl.rotation.y = 0; world.add(pl);
    const bk = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), lam(P.orange.clone().lerp(P.navy, 0.2), { emissive: P.orange, emissiveIntensity: 2 })); dyn(bk); bk.position.set(345, A.PLANE_REST_Y + 4.6, 330); world.add(bk);
    movers.push({ fn: t => { bk.visible = (t % 1.2) < 0.25; } });
  }
  // ═══ 行李拖車：一台拖車拉三節行李車，在服務道（z 34）上來回；轉頭的時候整組轉，行李車永遠在後面 ═══
  {
    const g = new THREE.Group(); dyn(g); world.add(g); const tug = truck(mats, false); tug.scale.setScalar(0.7); g.add(tug);
    for (let i = 1; i <= 3; i++) { g.add(box(1.6, 1.4, 2.6, mats.grey, 0, 1.0, -3.2 * i - 1.0), box(1.4, 1.0, 2.2, [mats.navy, mats.teal, mats.orange][i - 1], 0, 1.2, -3.2 * i - 1.0, false)); for (const s of [-1, 1]) { const w = cyl(0.3, 0.3, 0.2, mats.dark, s * 0.8, 0.3, -3.2 * i - 1.0, 8); w.rotation.z = Math.PI / 2; g.add(w); } }
    let ry = Math.PI / 2; movers.push({ fn: t => { const u = (t * 5 / 220) % 2, d = 55 - 55 * Math.cos(Math.PI * u); g.position.set(12 + d, 0, 87.5); ry += Math.atan2(Math.sin((u < 1 ? Math.PI / 2 : -Math.PI / 2) - ry), Math.cos((u < 1 ? Math.PI / 2 : -Math.PI / 2) - ry)) * 0.05; g.rotation.y = ry; } });   // 兩頭慢下來、整組繞著車頭掉頭（批 B）
  }
  // ═══ 餐勤車在 B2（x 47）升降台升上去又下來；B4（x 82）的推機車頂在機鼻前 ═══
  {
    const ct = truck(mats, false); ct.position.set(47 - 6, 0, 42); ct.rotation.y = Math.PI / 2; world.add(ct);
    const lift = box(2.2, 2.4, 3.6, mats.cream, 0, 2.4, -1.0); dyn(lift); ct.add(lift); const legs = instanced(new THREE.BoxGeometry(0.15, 2.4, 0.15), mats.grey, [[-0.9, 1.2, 0.6], [0.9, 1.2, 0.6], [-0.9, 1.2, -2.6], [0.9, 1.2, -2.6]], false); dyn(legs); ct.add(legs);
    movers.push({ fn: t => { const u = (t * 0.08) % 2, h = (u < 1 ? u : 2 - u) * 2.6; lift.position.y = 2.4 + h; legs.scale.y = 1 + h / 2.4; legs.position.y = h / 2; } });
    const pb = truck(mats, false); pb.scale.setScalar(0.8); pb.position.set(82 + 7, 0, 29); pb.rotation.y = Math.PI; world.add(pb);
  }
  // ═══ 兩群鳥（每群七隻，翅膀是兩片小板子，拍動；整群繞著停機坪上空轉）═══
  {
    const wingGeo = new THREE.BoxGeometry(1.4, 0.05, 0.4), m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3(), eul = new THREE.Euler();
    const flocks = [[150, 120, 32, 0.05, 0], [40, 160, 26, -0.04, 2.1]];
    for (const [cx, cz, y, w, off] of flocks) {
      const N = 7, L = new THREE.InstancedMesh(wingGeo, mats.dark, N), Rw = new THREE.InstancedMesh(wingGeo, mats.dark, N); dyn(L); dyn(Rw); L.castShadow = Rw.castShadow = false; world.add(L, Rw);
      movers.push({ fn: t => { const a = t * w + off; const hx = cx + Math.cos(a) * 110, hz = cz + Math.sin(a) * 110, yaw = a + (w > 0 ? Math.PI / 2 : -Math.PI / 2);
        for (let i = 0; i < N; i++) { const row = Math.ceil(i / 2), side = i % 2 ? 1 : -1; const bx = -row * 4, bz = side * row * 2.6 * (i ? 1 : 0); const x = hx + Math.cos(yaw) * bx - Math.sin(yaw) * bz, z = hz + Math.sin(yaw) * bx + Math.cos(yaw) * bz, yy = y + Math.sin(t * 2 + i) * 0.6; const flap = Math.sin(t * 9 + i * 0.7) * 0.7;
          for (const [im, sg] of [[L, 1], [Rw, -1]]) { eul.set(0, -yaw, sg * flap); q.setFromEuler(eul); p.set(x, yy, z); m.compose(p, q, s); m.multiply(new THREE.Matrix4().makeTranslation(0, 0, sg * 0.2)); im.setMatrixAt(i, m); } }
        L.instanceMatrix.needsUpdate = Rw.instanceMatrix.needsUpdate = true; } });
    }
  }
  // ═══ 航廈門口三面旗（橘、青、深藍）在飄 ═══
  {
    const flags = [];
    [[-37, mats.orange], [-31, mats.teal], [-25, mats.navy]].forEach(([x, mt], i) => { world.add(cyl(0.08, 0.1, 10, mats.grey, x, 5, -44.5, 6)); const f = box(2.4, 1.4, 0.05, mt, 0, 0, 0, false); dyn(f); f.position.set(x + 1.2, 9.2, -44.5); world.add(f); flags.push([f, i]); });
    movers.push({ fn: t => { for (const [f, i] of flags) { f.rotation.y = Math.sin(t * 2.2 + i) * 0.35; f.scale.x = 0.85 + Math.sin(t * 4 + i) * 0.15; } } });
  }
  // ═══ 不動的：滑行道兩側每 15 公尺一顆藍燈、跑道兩側每 60 公尺一顆白燈、跑道兩端的門檻燈（青色一排）、每一停機位的加油井蓋、貨運坪 ═══
  {
    const blue = [], white = [], thr = [];
    for (let s = 0; s < tw.length; s += 15) { const a = tw.at(s), nx = Math.cos(a.yaw), nz = -Math.sin(a.yaw); blue.push([a.x + nx * 13, 0.3, a.z + nz * 13], [a.x - nx * 13, 0.3, a.z - nz * 13]); }
    for (let x = R.x0; x <= R.x1; x += 60) white.push([x, 0.3, R.z - R.half - 1.5], [x, 0.3, R.z + R.half + 1.5]);
    for (let z = -R.half + 2; z <= R.half - 2; z += 4) thr.push([R.x1 + 3, 0.3, R.z + z], [R.x0 - 3, 0.3, R.z + z]);
    const lampGeo = new THREE.SphereGeometry(0.42, 6, 5);
    world.add(instanced(lampGeo, lam(P.teal.clone().lerp(P.navy, 0.3), { emissive: P.teal, emissiveIntensity: 1.2 }), blue, false), instanced(lampGeo, lam(P.cream, { emissive: P.cream, emissiveIntensity: 1.2 }), white, false), instanced(lampGeo, lam(P.teal, { emissive: P.teal, emissiveIntensity: 1.6 }), thr, false));
    world.add(instanced(new THREE.BoxGeometry(0.9, 0.04, 0.9), mats.navy, [25, 40, 58, 75, 92, 113].map(x => [x + 1, 0.05, 44]), false));
    // 貨運坪（x -30 到 -10、z 165 到 185）：十二個貨櫃分兩種顏色堆著、一台貨櫃升降車、一台堆高機、兩個地勤。
    const uld = [[], []]; for (let i = 0; i < 6; i++) for (let j = 0; j < 2; j++) uld[(i + j) % 2].push([-30 + i * 3.4, 1.2 + j * 2.5, 175 + (i % 2) * 3.2]);
    world.add(instanced(new THREE.BoxGeometry(3, 2.4, 3), mats.grey, uld[0]), instanced(new THREE.BoxGeometry(3, 2.4, 3), lam(P.navy.clone().lerp(P.grey, 0.4)), uld[1]));
    const ld = truck(mats, false); ld.position.set(-8, 0, 182); ld.rotation.y = -Math.PI / 2; world.add(ld); world.add(box(4, 0.3, 3, mats.grey, -8, 2.2, 179, false), instanced(new THREE.BoxGeometry(0.15, 2, 0.15), mats.grey, [[-9.8, 1.1, 177.8], [-6.2, 1.1, 177.8], [-9.8, 1.1, 180.2], [-6.2, 1.1, 180.2]], false));
    const fk = new THREE.Group(); fk.position.set(-14, 0, 186); world.add(fk); fk.add(box(1.4, 1.0, 2.0, mats.orange, 0, 0.8, 0), box(1.0, 1.2, 0.2, mats.dark, 0, 1.9, -0.4, false), instanced(new THREE.BoxGeometry(0.12, 2.6, 0.12), mats.grey, [[-0.5, 1.4, 1.1], [0.5, 1.4, 1.1]], false), instanced(new THREE.BoxGeometry(0.15, 0.1, 1.2), mats.grey, [[-0.35, 0.15, 1.8], [0.35, 0.15, 1.8]], false));
    for (const [x, z, ry] of [[-26, 171, 0.4], [-11, 184, 2.4]]) { const f = figure(mats, { shirt: P.navy, vest: true }); f.position.set(x, 0, z); f.rotation.y = ry; f.userData.baseY = 0; world.add(f); idleFigs.push(f); }
  }
  return { tick: (t, e) => { for (const m of movers) m.fn(t, e); } };
}
