// /history/ 航廈外面的東西（2026-11-18 Paul：「make it like an actual airport… plenty of details in and out of the terminal」）。
// 照真的機場分空側與陸側（研究在 docs/history/2026-11-18-真機場研究.md）：
// 空側：每一個停機位的地面線（黃色引導線、停止線、橘色設備限制線、白色地勤車停放框、位號）、每一位的地勤車（輸送帶車、地面電源、行李籠、錐桶、輪擋、地勤）、
//       五根高桿照明、停機坪的伸縮縫與服務道、滑行道的指示牌與等待線的牌、跑道兩端的號碼與瞄準點與觸地帶的白塊、PAPI、進場燈、ILS 天線陣、下滑台、擋焰牆、
//       周界圍籬、消防站第二台車與瞭望塔、直升機停機坪、小飛機機坪與小機棚、水塔、變電所、維修場。
// 陸側：航廈前整條雨棚與人行道與斑馬線與導盲磚、門架牌、計程車排班、接駁巴士、立體停車場、公車總站、加油站、圓環與機場入口招牌、捷運站出口、
//       機場公司辦公大樓、空廚、員工停車場、花台與圓樹、廣告看板、路上會跑的車。
// 不 import three：THREE 跟小工具從 scene.js 傳進來（跟 plane.js、terminal.js 同一招）。沒有任何一站的文字、沒有色碼。
import { makeSign } from "./signs.js";
export function buildGrounds(THREE, c) {
  const { mats, P, palette, fonts, T, A, box, cyl, instanced, figure, idleFigs, textTexture, lam, world, truck, buildAirliner, shadowOn, tw, pick } = c;
  const R = A.RUNWAY;
  const movers = [];   // 每一幀要動的東西：{ g, fn(t) }
  const person = (x, z, ry, o) => { const f = figure(mats, o || {}); f.position.set(x, 0, z); f.rotation.y = ry; f.userData.baseY = 0; world.add(f); idleFigs.push(f); return f; };
  const crew = (x, z, ry) => person(x, z, ry, { shirt: P.navy, vest: true });
  const sign = makeSign(THREE, { textTexture, lam, P, fonts, parent: world });
  const roadM = lam(P.asphalt.clone().lerp(P.grey, 0.3)), paveM = lam(P.cream.clone().lerp(P.grey, 0.25)), redM = lam(P.orange.clone().lerp(P.navy, 0.25));
  const carBody = new THREE.BoxGeometry(4.2, 1.1, 1.9), carTop = new THREE.BoxGeometry(2.2, 0.8, 1.7);
  const bus = (x, z, ry, m) => { const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; g.add(box(11, 3, 2.5, m, 0, 1.6, 0), box(10.6, 1.2, 2.55, mats.glass, 0, 2.1, 0, false), box(11, 0.5, 2.5, mats.navy, 0, 0.5, 0, false)); world.add(g); return g; };

  // ═══ 空側 ═══
  // 停機位：六個（五個 B 門加我們的 A 門），每一位：黃色引導線從服務道到停止點、停止線、橘色設備限制線框、白色地勤車停放框、位號寫在地上。
  const STANDS = [[25, "B1", true], [40, "B2", true], [58, "B3", false], [75, "B4", true], [92, "B5", true], [113, "", true]];
  {
    const lead = [], stop = [], eraX = [], eraZ = [], gse = [];
    for (const [x] of STANDS) { const px = x + 7; lead.push([px, 0.05, 60]); stop.push([px, 0.05, 40]); eraX.push([px, 0.04, 22], [px, 0.04, 76]); eraZ.push([px - 20, 0.04, 49], [px + 20, 0.04, 49]); gse.push([px - 15, 0.04, 31], [px - 15, 0.04, 37], [px - 20, 0.04, 34, Math.PI / 2], [px - 10, 0.04, 34, Math.PI / 2]); }
    world.add(instanced(new THREE.BoxGeometry(0.3, 0.02, 36), mats.yellowLight, lead, false), instanced(new THREE.BoxGeometry(6, 0.02, 0.4), mats.yellowLight, stop, false));
    world.add(instanced(new THREE.BoxGeometry(40, 0.02, 0.25), redM, eraX, false), instanced(new THREE.BoxGeometry(0.25, 0.02, 54), redM, eraZ, false), instanced(new THREE.BoxGeometry(10, 0.02, 0.2), mats.cream, gse.map(p => p.length > 3 ? [p[0], p[1], p[2], p[3], 0.6] : p), false));
    for (const [x, label] of STANDS) if (label) sign(label, "", 4, 4, palette.apron || palette.grey, palette.yellow, x + 7, 0.06, 70, Math.PI, { flat: true, align: "center", size: 560 });
    // 停機位的看板（一根柱子、A320 / B737 的字）
    for (const [x, label] of STANDS) { world.add(cyl(0.08, 0.1, 3.2, mats.grey, x + 7, 1.6, 78, 6)); sign((label || "A") + "  ·  A320 / B737", "", 3.0, 0.8, palette.navy, palette.cream, x + 7, 3.4, 78, Math.PI, { align: "center", size: 180 }); }
  }
  // 另外兩座空橋與停著的飛機（B1、B5）：跟 scene.js 的 B2、B4 一樣直直伸出去。B3 空著，只留一台拖車與地勤。
  for (const [x, tail] of [[25, "orange"], [92, "yellow"]]) {
    const g = new THREE.Group(); g.position.set(x, 2.6, 19);
    g.add(box(3.2, 2.9, 38, lam(P.wall), 0, 0, 0)); g.add(box(3.4, 0.5, 38, mats.teal, 0, 0.2, 0, false));
    world.add(g, cyl(0.3, 0.3, 2.6, mats.frame, x - 1.2, 1.3, 32, 6), cyl(0.3, 0.3, 2.6, mats.frame, x + 1.2, 1.3, 32, 6));
    const pl = buildAirliner(THREE, { body: P.cream, tail: P[tail], mark: P.navy, dark: P.dark }); pl.position.set(x + 7, A.PLANE_REST_Y, A.GATE_STAND[1]); pl.rotation.y = Math.PI; shadowOn(pl); world.add(pl);
  }
  // 每一個有飛機的停機位：輸送帶車、地面電源車、四個行李籠、錐桶、輪擋、兩個地勤。空著的 B3：拖車、兩節行李車、指揮的人（兩支橘棒）。
  {
    const ulds = [], cones = [], chocks = [], gpus = [], gpuWheels = [];
    for (const [x, , busy] of STANDS) {
      const px = x + 7;
      if (!busy) { const t = truck(mats, false); t.position.set(px - 14, 0, 34); t.rotation.y = 0.3; world.add(t); for (let k = 1; k <= 2; k++) { const cb = box(2.2, 1.4, 2.4, mats.grey, px - 14 - Math.sin(0.3) * 3.2 * k, 0.9, 34 - Math.cos(0.3) * 3.2 * k); cb.add(box(2.2, 0.6, 2.2, mats.navy, 0, 0.9, 0)); world.add(cb); } const m = crew(px, 41.5, Math.PI); world.add(box(0.08, 0.6, 0.08, mats.orangeLight, px - 0.5, 1.4, 41.2, false), box(0.08, 0.6, 0.08, mats.orangeLight, px + 0.5, 1.4, 41.2, false)); void m; continue; }
      // 輸送帶車：貼在機身前門旁（機身在 z 48，門在 x+5 那一側）
      const bl = truck(mats, false); bl.position.set(px - 6, 0, 42); bl.rotation.y = -0.6; const belt = box(0.9, 0.2, 6, mats.grey, 0, 1.6, -3.2, false); belt.rotation.x = 0.35; bl.add(belt); world.add(bl);
      gpus.push([px - 12, 0.8, 30]); gpuWheels.push([px - 12.9, 0.35, 30, 0, 1], [px - 11.1, 0.35, 30, 0, 1]);
      for (let i = 0; i < 4; i++) ulds.push([px - 18 + (i % 2) * 2.6, 0.75, 32 + Math.floor(i / 2) * 2.0]);
      cones.push([px - 4, 0.4, 36], [px + 4, 0.4, 36], [px - 9, 0.4, 56], [px + 9, 0.4, 56]); chocks.push([px - 2.2, 0.2, 40.2], [px + 2.2, 0.2, 40.2]);
      crew(px - 10, 39.5, 0.4); crew(px + 3, 56, 2.5);
    }
    world.add(instanced(new THREE.BoxGeometry(2.2, 1.5, 1.6), mats.grey, ulds), instanced(new THREE.ConeGeometry(0.35, 0.8, 6), mats.orange, cones, false), instanced(new THREE.BoxGeometry(0.6, 0.3, 0.3), mats.orange, chocks, false));
    world.add(instanced(new THREE.BoxGeometry(1.8, 1.4, 1.2), mats.navy, gpus), instanced(new THREE.CylinderGeometry(0.35, 0.35, 0.3, 8), mats.dark, gpuWheels.map(([x, y, z]) => [x, y, z]), false));
  }
  // 停機坪：伸縮縫（每 7.5 公尺一條深灰線，兩個方向）、沿航廈的服務道（白邊線、虛線）。
  {
    const jx = [], jz = []; for (let z = 7.5; z < 220; z += 7.5) jx.push([90, 0.025, z]); for (let x = -72.5; x < 260; x += 7.5) jz.push([x, 0.025, 110]);
    const jointM = lam(P.apron.clone().lerp(P.navy, 0.18));
    world.add(instanced(new THREE.BoxGeometry(340, 0.01, 0.16), jointM, jx, false), instanced(new THREE.BoxGeometry(0.16, 0.01, 220), jointM, jz, false));
    world.add(box(190, 0.03, 9, lam(P.apron.clone().lerp(P.grey, 0.35)), 45, 0.03, 12, false), instanced(new THREE.BoxGeometry(190, 0.01, 0.25), mats.cream, [[45, 0.05, 7.6], [45, 0.05, 16.4]], false));
    const dashes = []; for (let x = -48; x <= 138; x += 6) dashes.push([x, 0.05, 12]); world.add(instanced(new THREE.BoxGeometry(2.4, 0.01, 0.2), mats.cream, dashes, false));
  }
  // 高桿照明五根（25 公尺，頂上一排燈）。
  { const masts = [], heads = [], lights = []; for (const x of [-25, 15, 50, 85, 120]) { masts.push([x, 13, 8]); heads.push([x, 26.4, 8]); for (let i = 0; i < 4; i++) lights.push([x - 1.5 + i, 26.1, 8.7]); }
    world.add(instanced(new THREE.CylinderGeometry(0.3, 0.5, 26, 8), mats.grey, masts), instanced(new THREE.BoxGeometry(3.6, 0.8, 1.2), mats.dark, heads, false), instanced(new THREE.BoxGeometry(0.7, 0.3, 0.2), mats.yellowLight, lights, false)); }
  // 滑行道的指示牌（三個彎各一塊黃底黑字）、等待線旁的紅底白字牌。
  for (const u of [0.22, 0.5, 0.78]) { const p = tw.at(tw.length * u), nx = Math.cos(p.yaw), nz = -Math.sin(p.yaw); const x = p.x + nx * 13, z = p.z + nz * 13; world.add(box(2.4, 0.9, 0.2, mats.yellowLight, x, 1.1, z, false), box(0.9, 0.5, 0.22, mats.dark, x - 0.6, 1.1, z, false), instanced(new THREE.CylinderGeometry(0.05, 0.05, 0.7, 5), mats.grey, [[x - 0.9, 0.35, z], [x + 0.9, 0.35, z]], false)); }
  { const h = tw.at(tw.length - 36), nx = Math.cos(h.yaw), nz = -Math.sin(h.yaw); world.add(box(2.4, 0.9, 0.2, redM, h.x + nx * 13, 1.1, h.z + nz * 13, false), box(1.4, 0.3, 0.22, mats.cream, h.x + nx * 13, 1.1, h.z + nz * 13, false)); }
  // 跑道：另一端的號碼、瞄準點兩大塊、觸地帶白塊（3、2、1 對）、PAPI 四盞、進場燈（跑道頭前方每 30 公尺一排）、ILS 天線陣、下滑台、擋焰牆、距離標牌。
  {
    const num = new THREE.Mesh(new THREE.PlaneGeometry(14, 22), lam(P.white, { map: textTexture(256, 400, palette.cream, [{ text: "09", font: `700 300px ${fonts.display}`, color: palette.navy, x: 128, y: 200, align: "center" }]) }));
    num.rotation.x = -Math.PI / 2; num.rotation.z = -Math.PI / 2; num.position.set(R.x0 + 60, 0.07, R.z); num.receiveShadow = false; world.add(num);
    world.add(instanced(new THREE.BoxGeometry(45, 0.04, 9), mats.cream, [[R.x1 - 300, 0.06, R.z - 9], [R.x1 - 300, 0.06, R.z + 9]], false));
    const tdz = []; [[150, 3], [450, 2], [600, 1]].forEach(([d, n]) => { for (let i = 0; i < n; i++) for (const s of [-1, 1]) tdz.push([R.x1 - d, 0.06, R.z + s * (12 + i * 2.6)]); });
    world.add(instanced(new THREE.BoxGeometry(22, 0.04, 1.8), mats.cream, tdz, false));
    world.add(instanced(new THREE.BoxGeometry(1.0, 0.6, 0.6), mats.cream, [[R.x1 - 300, 0.4, R.z - R.half - 15], [R.x1 - 300, 0.4, R.z - R.half - 19]], false), instanced(new THREE.BoxGeometry(1.0, 0.6, 0.6), mats.orangeLight, [[R.x1 - 300, 0.4, R.z - R.half - 23], [R.x1 - 300, 0.4, R.z - R.half - 27]], false));
    const posts = [], bars = [], lights = []; for (let x = R.x1 + 30; x <= R.x1 + 330; x += 30) { posts.push([x, 1.2, R.z]); bars.push([x, 2.4, R.z]); for (let i = -2; i <= 2; i++) lights.push([x, 2.5, R.z + i * 1.5]); }
    world.add(instanced(new THREE.CylinderGeometry(0.1, 0.12, 2.4, 6), mats.grey, posts, false), instanced(new THREE.BoxGeometry(0.2, 0.2, 7), mats.grey, bars, false), instanced(new THREE.SphereGeometry(0.28, 6, 4), mats.yellowLight, lights, false));
    const loc = []; for (let i = 0; i < 12; i++) loc.push([R.x0 - 150, 1.2, R.z - 16.5 + i * 3]);
    world.add(instanced(new THREE.BoxGeometry(0.3, 2.4, 0.3), mats.orange, loc.filter((_, i) => i % 2 === 0), false), instanced(new THREE.BoxGeometry(0.3, 2.4, 0.3), mats.cream, loc.filter((_, i) => i % 2 === 1), false), box(36, 0.3, 0.3, mats.grey, R.x0 - 150, 0.15, R.z, false));
    { const x = R.x1 - 300, z = R.z + R.half + 120; world.add(cyl(0.3, 0.4, 12, mats.grey, x, 6, z, 6), box(4.4, 0.3, 0.3, mats.cream, x, 11.5, z, false), box(4.4, 0.3, 0.3, mats.cream, x, 8.0, z, false), box(3, 2, 2.4, mats.wallShade, x + 4, 1, z, false)); }
    { const f = box(60, 3.2, 0.4, mats.navy, R.x0 - 50, 1.6, R.z, false); f.rotation.x = -0.35; f.rotation.y = Math.PI / 2; world.add(f); }
    const ds = []; for (let x = R.x1 - 300; x > R.x0 + 200; x -= 300) ds.push([x, 0.8, R.z - R.half - 12]); world.add(instanced(new THREE.BoxGeometry(0.4, 1.4, 1.6), mats.navy, ds, false), instanced(new THREE.BoxGeometry(0.42, 0.5, 1.2), mats.cream, ds.map(([x, y, z]) => [x, y + 0.2, z]), false));
  }
  // 周界圍籬：繞整個空側一圈（航廈那一段不圍），每 6 公尺一根柱、上面一條橫桿。
  {
    const posts = [], rails = [];
    const seg = (x0, z0, x1, z1) => { const L = Math.hypot(x1 - x0, z1 - z0), n = Math.floor(L / 6); for (let i = 0; i <= n; i++) posts.push([x0 + (x1 - x0) * i / n, 1.2, z0 + (z1 - z0) * i / n]); const r = box(L, 0.08, 0.08, mats.grey, (x0 + x1) / 2, 2.3, (z0 + z1) / 2, false); r.rotation.y = -Math.atan2(z1 - z0, x1 - x0); rails.push(r); };
    seg(-1100, 2, -48, 2); seg(140, 2, 420, 2); seg(420, 2, 420, 560); seg(420, 560, -1100, 560); seg(-1100, 560, -1100, 2);
    world.add(instanced(new THREE.CylinderGeometry(0.06, 0.08, 2.4, 5), mats.grey, posts, false), ...rails);
    for (const [x, z] of [[-140, 2], [260, 2], [420, 270], [60, 560], [-1100, 270]]) sign("RESTRICTED AREA", "管制區", 2.2, 0.8, palette.yellow, palette.navy, x, 1.5, z + 0.3, 0);
  }
  // 消防站：第二台消防車、一座瞭望塔。直升機停機坪（圓、H、一架直升機，旋翼會轉）。
  { const g = new THREE.Group(); g.position.set(210, 0, 70); world.add(g); g.add(box(7, 2.6, 3, mats.orange, 9, 1.4, -13), box(2.6, 1.6, 2.8, mats.frame, 5.8, 3.2, -13), box(0.3, 0.3, 6, mats.grey, 9.5, 2.95, -13, false), cyl(0.5, 0.6, 14, mats.wall, -17, 7, 6, 8), box(3.6, 2.4, 3.6, mats.wallShade, -17, 15.2, 6), box(4, 0.3, 4, mats.roof, -17, 16.5, 6, false)); }
  { const x = 262, z = 28; world.add(cyl(9, 9, 0.06, mats.cream, x, 0.03, z, 24), cyl(8.3, 8.3, 0.08, mats.apron, x, 0.04, z, 24), instanced(new THREE.BoxGeometry(0.8, 0.02, 5), mats.cream, [[x - 1.8, 0.09, z], [x + 1.8, 0.09, z], [x, 0.09, z, Math.PI / 2, 0.75]], false));
    const h = new THREE.Group(); h.userData.dynamic = true; h.position.set(x, 0, z); h.rotation.y = 0.6; world.add(h);
    h.add(box(4.4, 1.7, 1.9, mats.teal, 0, 1.6, 0), box(2.0, 1.0, 1.6, mats.glass, 1.2, 2.2, 0, false), box(5, 0.5, 0.5, mats.teal, -4.2, 1.9, 0, false), box(0.3, 1.4, 0.2, mats.orange, -6.5, 2.4, 0, false), instanced(new THREE.BoxGeometry(5, 0.1, 0.12), mats.dark, [[0, 0.3, -0.9], [0, 0.3, 0.9]], false), instanced(new THREE.BoxGeometry(0.1, 0.5, 0.1), mats.dark, [[-1.2, 0.55, -0.9], [1.2, 0.55, -0.9], [-1.2, 0.55, 0.9], [1.2, 0.55, 0.9]], false), cyl(0.12, 0.12, 0.6, mats.dark, 0, 2.75, 0, 6));
    const rotor = new THREE.Group(); rotor.position.y = 3.05; rotor.add(box(11, 0.08, 0.3, mats.dark, 0, 0, 0, false), box(0.3, 0.08, 11, mats.dark, 0, 0, 0, false)); h.add(rotor);
    const tail = new THREE.Group(); tail.position.set(-6.5, 2.4, 0.15); tail.add(box(1.6, 0.06, 0.15, mats.dark, 0, 0, 0, false), box(0.15, 0.06, 1.6, mats.dark, 0, 0, 0, false)); tail.rotation.x = Math.PI / 2; h.add(tail);
    movers.push({ fn: t => { rotor.rotation.y = t * 1.2; tail.rotation.z = t * 4; } }); crew(x + 6, z + 5, -0.6); }
  // 小飛機機坪（跑道這一側）：兩架小螺旋槳機、一座小機棚；水塔；變電所；維修場（貨櫃、三台車）。
  {
    const wheelGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.2, 8); wheelGeo.rotateZ(Math.PI / 2);
    for (const [x, z, ry, m] of [[-20, 250, 0.4, mats.cream], [-5, 262, -0.3, mats.orange]]) { const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; world.add(g); const body = cyl(0.6, 0.75, 7, m, 0, 1.3, 0, 10); body.rotation.x = Math.PI / 2; g.add(body); g.add(box(9, 0.14, 1.4, m, 0, 1.2, 0.4), box(2.8, 0.14, 0.9, m, 0, 1.4, -3.3, false), box(0.12, 1.4, 1.0, m, 0, 2.0, -3.3, false), box(0.12, 1.4, 0.3, mats.dark, 0, 1.3, 3.6, false), cyl(0.14, 0.14, 0.5, mats.dark, 0, 1.3, 3.55, 6), instanced(wheelGeo, mats.dark, [[-1, 0.3, 1.2], [1, 0.3, 1.2], [0, 0.3, -2.4]], false)); }
    { const g = new THREE.Group(); g.position.set(-28, 0, 282); world.add(g); g.add(box(24, 6, 16, mats.wallShade, 0, 3, 0), box(25, 0.5, 17, mats.roof, 0, 6.2, 0, false), box(16, 5, 0.3, mats.dark, 0, 2.5, -8.1, false)); sign("GENERAL AVIATION", "小型機", 7, 1.1, palette.navy, palette.cream, 0, 7.0, -8.2, Math.PI); g.add(world.children.pop()); }
    world.add(cyl(0.25, 0.3, 14, mats.grey, -150, 7, 112, 6), cyl(0.25, 0.3, 14, mats.grey, -146, 7, 108, 6), cyl(0.25, 0.3, 14, mats.grey, -154, 7, 108, 6), cyl(0.25, 0.3, 14, mats.grey, -150, 7, 104, 6), cyl(5, 5, 6, mats.cream, -150, 17, 108, 14), cyl(0.5, 5.2, 2.4, mats.roof, -150, 21.2, 108, 14));
    { const g = new THREE.Group(); g.position.set(-160, 0, 300); world.add(g); g.add(box(20, 1.6, 0.2, mats.grey, 0, 0.8, -10, false), box(20, 1.6, 0.2, mats.grey, 0, 0.8, 10, false), box(0.2, 1.6, 20, mats.grey, -10, 0.8, 0, false), box(0.2, 1.6, 20, mats.grey, 10, 0.8, 0, false)); g.add(instanced(new THREE.BoxGeometry(3, 3, 2.4), mats.wallShade, [[-5, 1.5, -3], [0, 1.5, -3], [5, 1.5, -3]]), instanced(new THREE.CylinderGeometry(0.15, 0.15, 1.6, 6), mats.cream, [[-5, 3.8, -3], [0, 3.8, -3], [5, 3.8, -3], [-5, 3.8, 3], [0, 3.8, 3], [5, 3.8, 3]], false), instanced(new THREE.BoxGeometry(0.1, 0.1, 16), mats.grey, [[-5, 4.4, 0], [0, 4.4, 0], [5, 4.4, 0]], false)); }
    { const boxes = []; for (let i = 0; i < 8; i++) boxes.push([-125 + (i % 4) * 4.4, 1.3 + Math.floor(i / 4) * 2.6, 160]); world.add(instanced(new THREE.BoxGeometry(4, 2.5, 2.4), mats.navy, boxes.filter((_, i) => i % 2 === 0)), instanced(new THREE.BoxGeometry(4, 2.5, 2.4), mats.orange, boxes.filter((_, i) => i % 2 === 1))); for (const [x, z, ry] of [[-130, 172, 0.2], [-120, 174, -0.1], [-110, 170, 0.4]]) { const t = truck(mats, false); t.position.set(x, 0, z); t.rotation.y = ry; world.add(t); } }
  }
  // 會動的：跟隨車（黃色，頂燈）在服務道來回；接駁巴士在停機坪遠端來回；行李拖車（第二組）沿航廈前跑。
  {
    const fm = new THREE.Group(); fm.userData.dynamic = true; fm.add(box(4.2, 1.1, 1.9, mats.yellowLight, 0, 0.6, 0), box(2.0, 0.7, 1.7, mats.glass, -0.2, 1.5, 0, false), box(1.2, 0.3, 0.3, mats.orangeLight, 0, 2.0, 0, false), box(0.9, 0.3, 1.9, mats.dark, 1.7, 1.05, 0, false)); world.add(fm);
    movers.push({ fn: t => { const u = (t * 0.02) % 2, d = u < 1 ? u : 2 - u; fm.position.set(-30 + d * 160, 0, 85); fm.rotation.y = u < 1 ? Math.PI / 2 : -Math.PI / 2; } });
    const ab = bus(0, 0, 0, mats.cream); ab.userData.dynamic = true; movers.push({ fn: t => { const u = (t * 0.012) % 2, d = u < 1 ? u : 2 - u; ab.position.set(20 + d * 180, 0, 100); ab.rotation.y = u < 1 ? Math.PI / 2 : -Math.PI / 2; } });
  }

  // ═══ 陸側 ═══
  // 航廈前：整條雨棚（柱子每 12 公尺一根、底下有燈）、人行道與路緣、導盲磚、斑馬線、護柱、門架牌（出境、計程車、公車）。
  {
    const x0 = T.x0 - 2, x1 = T.x1 + 2, cx = (x0 + x1) / 2, L = x1 - x0;
    world.add(box(L, 0.5, 8, mats.roof, cx, 5.8, -45.5, false), box(L, 0.6, 0.3, mats.navy, cx, 5.3, -49.4, false));
    const cols = [], lights = []; for (let x = x0 + 4; x < x1; x += 12) { cols.push([x, 2.8, -48.6]); lights.push([x, 5.5, -45.5]); }
    world.add(instanced(new THREE.CylinderGeometry(0.35, 0.4, 5.6, 8), mats.column, cols), instanced(new THREE.BoxGeometry(5, 0.14, 0.7), mats.light, lights, false));
    world.add(box(L, 0.25, 2.6, paveM, cx, 0.12, -41.6, false), box(L, 0.02, 0.3, mats.yellowLight, cx, 0.26, -40.9, false));
    const zebra = []; for (const x of [-32, -4, 24, 52, 80, 108]) for (let i = 0; i < 7; i++) zebra.push([x - 2.4 + i * 0.8, 0.07, -46]); world.add(instanced(new THREE.BoxGeometry(0.4, 0.01, 8.5), mats.cream, zebra, false));
    const bollards = []; for (let x = x0 + 2; x < x1; x += 4) bollards.push([x, 0.5, -42.7]); world.add(instanced(new THREE.CylinderGeometry(0.12, 0.14, 1.0, 6), mats.navy, bollards, false));
    for (const [x, en, zh] of [[-31, "DEPARTURES", "出境"], [20, "BUS", "公車"], [60, "DROP-OFF", "臨停"], [94, "TAXI", "計程車"], [118, "SHUTTLE", "接駁車"]]) sign(en, zh, 5.2, 1.0, palette.navy, palette.cream, x, 4.6, -49.6, Math.PI);
    // 計程車排班再四台、臨停的三台車與下車的人、兩台接駁巴士、兩座花台。
    for (const x of [88, 94, 100, 106]) world.add(box(4.2, 1.1, 1.9, mats.yellowLight, x, 0.6, -46.8), box(2.0, 0.7, 1.7, mats.glass, x - 0.2, 1.5, -46.8, false), box(0.9, 0.3, 0.3, mats.navy, x, 2.0, -46.8, false));
    world.add(instanced(carBody, mats.navy, [[-22, 0.6, -45.0], [58, 0.6, -45.0]]), instanced(carBody, mats.teal, [[-2, 0.6, -45.0], [66, 0.6, -45.0]]), instanced(carTop, mats.glass, [[-22.2, 1.5, -45.0], [57.8, 1.5, -45.0], [-2.2, 1.5, -45.0], [65.8, 1.5, -45.0]], false));
    let k = 0; for (const [x, z, ry] of [[-19.5, -42.2, 0], [-18.2, -42.0, 1.2], [1, -42.3, 0], [60.5, -42.2, 0.4], [68.5, -42.5, -0.3], [-30, -42.6, 0], [-28.6, -42.3, 0], [110, -42.4, 0.6], [24, -42.5, 0], [22.6, -42.2, 0.2], [40, -42.4, 0], [94, -42.3, 0], [95.4, -42.6, 0]]) person(x, z, ry, { shirt: pick(k), bag: k % 2 === 0, backpack: k % 3 === 0 }), k++;
    bus(114, -46.8, Math.PI / 2, mats.orange); bus(128, -46.8, Math.PI / 2, mats.teal);
    const beds = [], flowers = []; for (const x of [-36, 10, 46, 74, 112, 126]) { beds.push([x, 0.2, -41.6]); for (let i = 0; i < 6; i++) flowers.push([x - 1 + (i % 3) * 1, 0.5, -42.1 + Math.floor(i / 3) * 0.9]); }
    world.add(instanced(new THREE.BoxGeometry(2.8, 0.4, 1.6), mats.wallShade, beds, false), instanced(new THREE.SphereGeometry(0.22, 6, 5), mats.orange, flowers.filter((_, i) => i % 2 === 0), false), instanced(new THREE.SphereGeometry(0.22, 6, 5), mats.yellow, flowers.filter((_, i) => i % 2 === 1), false));
    // 陸側牆上一排高窗（航廈外面看得到）、牆上的機場名字。
    const win = []; for (let x = T.x0 + 4; x < T.x1 - 2; x += 4) win.push([x, 9.2, T.z0 - 0.4]); world.add(instanced(new THREE.BoxGeometry(3, 2.0, 0.2), mats.glass, win, false));
    sign("BEYOND TAIWAN AIRPORT", "國際機場", 22, 2.4, palette.navy, palette.cream, 42, 7.4, T.z0 - 0.5, Math.PI);
  }
  // 立體停車場（x -85 到 -45，z -100 到 -60）：四層樓板、柱子、每層的矮牆、坡道、頂樓與一樓停的車、P 的牌子。
  {
    const gx = -72, gz = -80; const slabs = [], cols = [], paras = [];
    for (let f = 0; f < 4; f++) { const y = 0.3 + f * 3.4; slabs.push([gx, y, gz]); for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) if (f < 3) cols.push([gx - 16 + i * 8, y + 1.9, gz - 16 + j * 8]); paras.push([gx, y + 0.8, gz - 19.85], [gx, y + 0.8, gz + 19.85], [gx - 19.85, y + 0.8, gz, Math.PI / 2], [gx + 19.85, y + 0.8, gz, Math.PI / 2]); }
    world.add(instanced(new THREE.BoxGeometry(40, 0.6, 40), mats.wallShade, slabs), instanced(new THREE.CylinderGeometry(0.4, 0.4, 3.2, 8), mats.column, cols, false), instanced(new THREE.BoxGeometry(40, 1.0, 0.3), mats.wall, paras, false));
    const ramp = box(8, 0.4, 20, mats.taxi, gx - 24, 1.9, gz, false); ramp.rotation.x = -0.17; world.add(ramp);
    const cars = [[], [], []]; let n = 0; for (let i = 0; i < 6; i++) for (const zz of [gz - 12, gz - 4, gz + 4, gz + 12]) { n++; if (n % 4 === 0) continue; cars[n % 3].push([gx - 15 + i * 6, 10.5 + 0.6 + 0.3, zz]); if (n % 2) cars[(n + 1) % 3].push([gx - 15 + i * 6, 0.6 + 0.6, zz]); }
    [mats.navy, mats.cream, mats.teal].forEach((m, i) => world.add(instanced(carBody, m, cars[i]), instanced(carTop, mats.glass, cars[i].map(([x, y, z]) => [x - 0.2, y + 0.9, z]), false)));
    world.add(box(6, 6, 0.6, mats.navy, gx + 20.3, 13.8, gz - 12, false)); sign("PARKING", "停車場", 5, 5, palette.navy, palette.yellow, gx + 20.65, 13.8, gz - 12, Math.PI / 2, { align: "center", size: 150 });
    world.add(box(0.3, 1.0, 0.3, mats.navy, gx + 24, 0.5, gz + 12, false), box(4, 0.12, 0.12, mats.orange, gx + 24, 1.0, gz + 14, false));   // 入口柵欄
  }
  // 公車總站（x 128 到 164，z -62 到 -50）：雨棚、四台公車停在月台、等車的人、牌子。加油站（x -62，z -135）：雨棚、四支油槍、小店、一台車。
  {
    world.add(box(38, 0.3, 11, mats.roof, 137, 4.6, -57, false), instanced(new THREE.CylinderGeometry(0.25, 0.3, 4.6, 8), mats.column, [[121, 2.3, -53], [137, 2.3, -53], [153, 2.3, -53], [121, 2.3, -61], [137, 2.3, -61], [153, 2.3, -61]], false), box(38, 0.25, 3, paveM, 137, 0.12, -52.5, false));
    [mats.teal, mats.orange, mats.navy, mats.cream].forEach((m, i) => bus(123 + i * 9, -59.5, Math.PI / 2, m));
    let k = 3; for (const x of [122, 125, 132, 140, 147, 151]) person(x, -52.2, Math.PI, { shirt: pick(k++), bag: k % 2 === 0 });
    sign("BUS TERMINAL", "公車總站", 7, 1.2, palette.navy, palette.cream, 137, 5.4, -51.4, 0);
    const px = -95, pz = -140; world.add(box(18, 0.4, 10, mats.orange, px, 5, pz, false), instanced(new THREE.CylinderGeometry(0.25, 0.3, 5, 8), mats.column, [[px - 7, 2.5, pz - 3.5], [px + 7, 2.5, pz - 3.5], [px - 7, 2.5, pz + 3.5], [px + 7, 2.5, pz + 3.5]], false));
    world.add(instanced(new THREE.BoxGeometry(0.8, 1.6, 0.5), mats.teal, [[px - 4.5, 0.8, pz], [px - 1.5, 0.8, pz], [px + 1.5, 0.8, pz], [px + 4.5, 0.8, pz]], false), box(10, 3.5, 6, mats.wall, px, 1.75, pz + 10), box(10.5, 0.4, 6.5, mats.roof, px, 3.7, pz + 10, false));
    sign("FUEL", "加油站", 4, 1.0, palette.orange, palette.navy, px, 5.6, pz - 5.1, Math.PI); world.add(box(4.2, 1.1, 1.9, mats.cream, px - 3, 0.6, pz - 2.4), box(2.0, 0.7, 1.7, mats.glass, px - 3.2, 1.5, pz - 2.4, false));
  }
  // 圓環（x -45，z -110 的路口）：環狀路、中間的草地與三支旗桿與一片橘色尾翼雕塑、歡迎字牆；往外的進場道路、路燈、機場入口招牌牆。
  {
    const rx = -45, rz = -110; world.add(cyl(23, 23, 0.1, roadM, rx, 0.03, rz, 32), cyl(13, 13, 0.5, mats.grass, rx, 0.25, rz, 32), cyl(12, 12, 0.6, lam(P.grass.clone().lerp(P.teal, 0.2)), rx, 0.3, rz, 32));
    world.add(instanced(new THREE.CylinderGeometry(0.06, 0.08, 9, 6), mats.grey, [[rx - 3, 4.5, rz - 2], [rx, 4.5, rz - 3.5], [rx + 3, 4.5, rz - 2]], false), instanced(new THREE.BoxGeometry(1.8, 1.1, 0.06), mats.orange, [[rx - 2.1, 8.4, rz - 2], [rx + 0.9, 8.4, rz - 3.5], [rx + 3.9, 8.4, rz - 2]], false));
    const s = new THREE.Shape(); [[0, 0], [5, 0], [6.4, 6], [3.8, 6]].forEach(([x, y], i) => i ? s.lineTo(x, y) : s.moveTo(x, y)); s.closePath();
    const fin = new THREE.Mesh(new THREE.ExtrudeGeometry(s, { depth: 0.4, bevelEnabled: false }), mats.orange); fin.position.set(rx - 3, 0.6, rz + 3); fin.rotation.y = 0.4; fin.castShadow = true; world.add(fin);
    sign("WELCOME", "歡迎", 7, 1.6, palette.cream, palette.navy, rx, 1.6, rz + 11.5, 0);
    world.add(box(9, 0.08, 110, roadM, rx, 0.02, rz - 78, false)); const dashes = []; for (let z = rz - 28; z > rz - 132; z -= 6) dashes.push([rx, 0.07, z, Math.PI / 2]); world.add(instanced(new THREE.BoxGeometry(2.4, 0.02, 0.2), mats.cream, dashes, false));
    const lamps = []; for (let z = rz - 30; z > rz - 130; z -= 15) lamps.push([rx - 5.5, 4, z], [rx + 5.5, 4, z]); world.add(instanced(new THREE.CylinderGeometry(0.1, 0.14, 8, 6), mats.grey, lamps, false), instanced(new THREE.BoxGeometry(1.0, 0.25, 0.5), mats.light, lamps.map(([x, , z]) => [x + (x < rx ? 1 : -1), 8.1, z]), false));
    world.add(box(18, 3.6, 0.8, mats.navy, rx + 16, 1.8, rz - 150, false)); sign("INTERNATIONAL AIRPORT", "國際機場", 16, 2.6, palette.navy, palette.cream, rx + 16, 2.0, rz - 149.55, 0);
    for (const [x, z, en, zh] of [[rx + 8, rz - 40, "DEPARTURES  ·  PARKING", "出境  ·  停車場"], [rx - 8, rz + 18, "CARGO  ·  RENTAL CARS", "貨運  ·  租車"]]) { world.add(cyl(0.08, 0.1, 4, mats.grey, x, 2, z, 6)); sign(en, zh, 4.4, 1.0, palette.teal, palette.cream, x, 4.3, z, 0); }
  }
  // 捷運站出口（x -25，z -62）：玻璃亭、樓梯、牌子、幾個人。機場公司辦公大樓（x 0，z -140）：五層、一排排窗。空廚（x -110，z -25）：倉庫加兩台餐勤車。員工停車場（x -120，z -75）。
  {
    world.add(box(8, 4, 6, mats.frame, -25, 2, -62), box(7.4, 3.2, 5.4, mats.glass, -25, 2, -62, false), box(8.6, 0.4, 6.6, mats.navy, -25, 4.2, -62, false), instanced(new THREE.BoxGeometry(6, 0.3, 1), mats.wallShade, [[-25, 0.15, -57.5], [-25, 0.45, -56.5], [-25, 0.75, -55.5]], false));
    sign("METRO", "捷運", 4, 1.0, palette.navy, palette.yellow, -25, 4.9, -58.6, 0);
    let k = 9; for (const [x, z] of [[-31.5, -56], [-30.2, -55.4], [-31, -54.2]]) person(x, z, 0, { shirt: pick(k++), bag: true });
    { const g = new THREE.Group(); g.position.set(0, 0, -140); world.add(g); g.add(box(30, 17, 16, mats.wallShade, 0, 8.5, 0), box(31, 0.6, 17, mats.roof, 0, 17.3, 0, false)); const win = []; for (let f = 0; f < 5; f++) for (let i = 0; i < 8; i++) win.push([-12.25 + i * 3.5, 2.4 + f * 3.1, 8.05]); g.add(instanced(new THREE.BoxGeometry(2.2, 1.6, 0.1), mats.glass, win, false)); g.add(box(8, 3.2, 0.4, mats.navy, 0, 1.6, 8.2, false)); }
    { const g = new THREE.Group(); g.position.set(-110, 0, -25); world.add(g); g.add(box(30, 8, 20, mats.wallShade, 0, 4, 0), box(31, 0.6, 21, mats.roof, 0, 8.3, 0, false), instanced(new THREE.BoxGeometry(4, 3.5, 0.4), mats.dark, [[-8, 1.75, 10.2], [8, 1.75, 10.2]], false)); for (const x of [-8, 8]) { const t = new THREE.Group(); t.position.set(x, 0, 15); t.rotation.y = Math.PI; t.add(box(2.2, 1.6, 2.2, mats.cream, 0, 1.2, 2.0), box(2.4, 2.6, 5, mats.cream, 0, 2.2, -1.2), box(2.4, 0.5, 6.4, mats.grey, 0, 0.5, -0.6)); g.add(t); } }
    sign("CATERING", "空廚", 6, 1.2, palette.navy, palette.cream, -110, 9.2, -14.6, 0);
    { const px = -120, pz = -75; world.add(box(40, 0.06, 26, mats.taxi, px, 0.01, pz, false)); const lines = [], cars = [[], [], []]; let n = 0; for (const zr of [pz - 7, pz + 7]) for (let x = px - 18; x <= px + 18; x += 4) { lines.push([x - 2, 0.05, zr]); n++; if (n % 5 !== 0) cars[n % 3].push([x, 0.6, zr, Math.PI / 2]); } world.add(instanced(new THREE.BoxGeometry(0.15, 0.02, 5.2), mats.cream, lines, false)); [mats.navy, mats.cream, mats.teal].forEach((m, i) => world.add(instanced(carBody, m, cars[i]), instanced(carTop, mats.glass, cars[i].map(([x, y, z, ry]) => [x, y + 0.9, z + 0.2, ry]), false)));
      const posts = []; for (let x = px - 20; x <= px + 20; x += 5) posts.push([x, 0.9, pz - 13], [x, 0.9, pz + 13]); world.add(instanced(new THREE.CylinderGeometry(0.05, 0.06, 1.8, 5), mats.grey, posts, false)); }
  }
  // 圓樹（跟針葉的那一批不一樣的形狀）：陸側的路邊、停車場、圓環、旅館四周；廣告看板四面；路上會跑的車。
  {
    const crown = new THREE.IcosahedronGeometry(2.4, 1); crown.translate(0, 5.2, 0); const trunk = new THREE.CylinderGeometry(0.3, 0.4, 3.4, 6); trunk.translate(0, 1.7, 0);
    const places = []; for (let x = -40; x <= 130; x += 11) places.push([x + (x % 3), 0, -52 - (x % 2) * 1.5, x, 0.9 + (x % 4) / 10]);
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; places.push([-45 + Math.cos(a) * 9, 0.5, -110 + Math.sin(a) * 9, i, 0.7]); }
    for (const [x, z] of [[-95, -60], [-95, -75], [-95, -92], [130, -100], [140, -105], [170, -105], [185, -72], [-40, -150], [-28, -160], [20, -150], [-10, -118], [-80, -125], [-45, -170], [-45, -185], [-30, -250], [-60, -250], [-100, -40], [-130, -40]]) places.push([x, 0, z, x + z, 1 + ((x + z) % 3) / 10]);
    world.add(instanced(crown, lam(P.grassDark.clone().lerp(P.teal, 0.25)), places), instanced(trunk, mats.trunk, places));
    for (const [x, z, ry] of [[40, -150, 0], [120, -150, 0.3], [-130, -165, -0.3], [200, -40, Math.PI / 2]]) { const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; world.add(g); g.add(instanced(new THREE.CylinderGeometry(0.2, 0.25, 6, 6), mats.grey, [[-4, 3, 0], [4, 3, 0]], false), box(12, 5, 0.3, mats.frame, 0, 8.5, 0)); const m = new THREE.Mesh(new THREE.PlaneGeometry(11.4, 4.4), lam(P.white, { map: textTexture(1024, 400, palette.cream, [{ text: "BEYOND TAIWAN", x: 512, y: 230, font: `700 150px ${fonts.display}`, color: palette.navy, align: "center" }], [{ x: 0, y: 0, w: 1024, h: 90, color: palette.orange }, { x: 0, y: 330, w: 1024, h: 70, color: palette.teal }]) })); m.position.set(0, 8.5, 0.18); g.add(m); }
    const N = 10, bodies = new THREE.InstancedMesh(carBody, mats.navy, N), tops = new THREE.InstancedMesh(carTop, mats.glass, N); bodies.castShadow = false; tops.castShadow = false; world.add(bodies, tops);
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(1, 1, 1), V = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    movers.push({ fn: t => { for (let i = 0; i < N; i++) { const lane = i < 6; const sp = lane ? 9 + (i % 3) * 1.5 : 10 + (i % 2) * 2; const span = lane ? 230 : 230; const u = ((t * sp + i * 37) % span); const x = lane ? -50 + u : 180 - u, z = lane ? -48.3 + (i % 2) * 1.8 : -108 - (i % 2) * 2.2; Q.setFromAxisAngle(up, lane ? Math.PI / 2 : -Math.PI / 2); V.set(x, 0.6, z); M.compose(V, Q, S); bodies.setMatrixAt(i, M); V.set(x + (lane ? 0.2 : -0.2), 1.5, z); M.compose(V, Q, S); tops.setMatrixAt(i, M); } bodies.instanceMatrix.needsUpdate = true; tops.instanceMatrix.needsUpdate = true; } });
  }
  // ═══ 第三批（2026-11-18）：航廈的屋頂（從停機坪與空中看最大的一片）與跑道的胎痕 ═══
  // 屋頂：女兒牆、走道上方那條天窗的玻璃脊（跟裡面的天窗同一條 z -20）、十四台空調主機加管線、四十片太陽能板、兩支天線、逃生梯的出口小屋、幾個通風口。
  {
    const tx = (T.x0 + T.x1) / 2, tz = (T.z0 + T.z1) / 2, tw0 = T.x1 - T.x0, td = T.z1 - T.z0, y = T.h + 0.4;
    world.add(box(tw0 + 3, 0.9, 0.5, mats.wallShade, tx, y + 0.45, T.z0 - 1.5, false), box(tw0 + 3, 0.9, 0.5, mats.wallShade, tx, y + 0.45, T.z1 + 1.5, false), box(0.5, 0.9, td + 3, mats.wallShade, T.x0 - 1.5, y + 0.45, tz, false), box(0.5, 0.9, td + 3, mats.wallShade, T.x1 + 1.5, y + 0.45, tz, false));
    const ridge = new THREE.Mesh(new THREE.BoxGeometry(tw0 - 4, 1.6, 7), mats.glass); ridge.position.set(tx, y + 0.8, -20); world.add(ridge);
    const ribs = []; for (let x = T.x0 + 3; x < T.x1; x += 6) ribs.push([x, y + 0.8, -20]); world.add(instanced(new THREE.BoxGeometry(0.25, 1.7, 7.2), mats.frame, ribs, false), box(tw0 - 4, 0.25, 0.25, mats.frame, tx, y + 1.65, -20, false));
    const ac = [], fans = []; for (let i = 0; i < 14; i++) { const x = T.x0 + 8 + i * 8.4, z = i % 2 ? -33 : -7; ac.push([x, y + 1.0, z]); fans.push([x - 0.9, y + 2.05, z], [x + 0.9, y + 2.05, z]); }
    world.add(instanced(new THREE.BoxGeometry(3.6, 2.0, 2.4), mats.grey, ac), instanced(new THREE.CylinderGeometry(0.7, 0.7, 0.12, 12), mats.dark, fans, false));
    world.add(box(tw0 - 20, 0.6, 0.6, mats.cream, tx, y + 0.3, -30, false), box(tw0 - 20, 0.6, 0.6, mats.cream, tx, y + 0.3, -10, false));
    const pv = []; for (let i = 0; i < 20; i++) for (const z of [-27, -13]) pv.push([T.x0 + 12 + i * 5.2, y + 0.5, z]);
    const pvGeo = new THREE.BoxGeometry(4.6, 0.12, 2.6); pvGeo.rotateX(-0.35); world.add(instanced(pvGeo, lam(P.navy.clone().lerp(P.teal, 0.3), { emissive: P.teal, emissiveIntensity: 0.15 }), pv, false));
    world.add(cyl(0.08, 0.1, 9, mats.grey, T.x0 + 4, y + 4.5, -36, 6), cyl(0.08, 0.1, 7, mats.grey, T.x1 - 4, y + 3.5, -4, 6), box(1.2, 0.08, 0.08, mats.grey, T.x0 + 4, y + 8.5, -36, false), box(3, 2.6, 3, mats.wall, T.x0 + 10, y + 1.3, -4), box(3, 2.6, 3, mats.wall, T.x1 - 10, y + 1.3, -36));
    const vents = []; for (let i = 0; i < 10; i++) vents.push([T.x0 + 14 + i * 14, y + 0.5, -21 + (i % 2 ? 5.5 : -5.5)]); world.add(instanced(new THREE.CylinderGeometry(0.5, 0.6, 1.0, 8), mats.wallShade, vents, false));
  }
  // 跑道的胎痕：兩端觸地帶各二十幾條深色的刷痕（真的跑道落地那一段都是黑的）。
  {
    const marks = []; let a = 17; const rnd = () => { a = (a * 1103515245 + 12345) & 0x7fffffff; return a / 0x7fffffff; };
    for (let i = 0; i < 26; i++) { const dz = (rnd() - 0.5) * 16, len = 20 + rnd() * 40; marks.push([R.x1 - 120 - rnd() * 90, 0.04, R.z + dz, 0, 1 + rnd()], [R.x0 + 120 + rnd() * 90, 0.04, R.z + dz, 0, 1 + rnd()]); void len; }
    world.add(instanced(new THREE.BoxGeometry(30, 0.02, 0.9), lam(P.asphalt.clone().lerp(P.navy, 0.35).multiplyScalar(0.8), { transparent: true, opacity: 0.55 }), marks, false));
  }
  // ═══ 第四批（2026-11-18）：地平線。台灣的機場旁邊就是海與山：西邊一片海（跑道盡頭再過去）加一條沙灘，北邊與南邊兩排山（後排更高更藍），
  // 陸側遠處一座城市（四十幾棟高矮不一的樓、幾棟深藍的高塔）、幾條樹帶。全部在 1 到 2 公里外，霧讓它們只剩輪廓，那正是遠山該有的樣子。 ═══
  {
    const seaM = lam(P.teal.clone().lerp(P.navy, 0.35), { emissive: P.teal, emissiveIntensity: 0.12, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });   // 要比草地藍得多，不然隔著霧分不出來；polygonOffset 加抬高 1 公尺，遠處才不會跟草地的面打架（z-fighting 的階梯紋）
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(7000, 9000), seaM); sea.rotation.x = -Math.PI / 2; sea.position.set(-1250 - 3500, 1.0, R.z); sea.receiveShadow = false; world.add(sea);
    world.add(box(80, 2.2, 9000, mats.cream, -1250 + 40, 0.0, R.z, false), box(12, 0.14, 9000, lam(P.cream.clone().lerp(P.white, 0.6)), -1250 - 6, 1.02, R.z, false));   // 沙灘與一條白浪
    const front = [], back = []; let a = 23; const rnd = () => { a = (a * 1103515245 + 12345) & 0x7fffffff; return a / 0x7fffffff; };
    for (let i = 0; i < 16; i++) { const x = -1500 + i * 210 + rnd() * 80; front.push([x, 0, 1450 + rnd() * 120, rnd() * 3, 0.7 + rnd() * 0.6], [x + 90, 0, -1350 - rnd() * 120, rnd() * 3, 0.6 + rnd() * 0.6]); back.push([x + 60, 0, 1900 + rnd() * 150, rnd() * 3, 1.1 + rnd() * 0.8], [x - 40, 0, -1800 - rnd() * 150, rnd() * 3, 1.0 + rnd() * 0.8]); }
    const mtn = new THREE.ConeGeometry(260, 320, 6); mtn.translate(0, 160, 0);
    world.add(instanced(mtn, lam(P.grassDark.clone().lerp(P.sky, 0.25)), front, false), instanced(mtn, lam(P.navy.clone().lerp(P.sky, 0.55)), back, false));
    const bld = [], tall = []; for (let i = 0; i < 48; i++) { const x = -420 + rnd() * 840, z = -650 - rnd() * 320, h = 18 + rnd() * 50; (i % 9 ? bld : tall).push([x, (i % 9 ? h : h + 50) / 2, z, 0, 1]); }
    world.add(instanced(new THREE.BoxGeometry(22, 60, 22), mats.wallShade, bld.map(([x, y, z]) => [x, y, z]), false), instanced(new THREE.BoxGeometry(18, 130, 18), lam(P.navy.clone().lerp(P.grey, 0.35)), tall.map(([x, y, z]) => [x, y + 10, z]), false));
    const belt = []; for (let i = 0; i < 70; i++) belt.push([-900 + i * 26 + rnd() * 10, 0, -400 - rnd() * 30, 0, 1.6 + rnd()]);
    const tree = new THREE.ConeGeometry(2.6, 6, 6); tree.translate(0, 3, 0); world.add(instanced(tree, mats.leaf, belt, false));
  }
  return { tick: t => { for (const m of movers) m.fn(t); } };
}
