// /stories/ 的島版（3D，Three.js，全部程式幾何，沒有模型檔）。2026-11-16 第二版：Paul 看完機場版說「icky、不順」，
// 給了 HEART 政策島（puma.taipei/heart-island）當參考：可愛、低多邊形、圓角、柔和的影子、鏡頭滑得很順。這一支照那一套做：
//   窄鏡頭（fov 32）從高處斜看、ACES 調色、圓角盒子組一切、MeshStandard 粗糙度 0.8、一盞暖的太陽加天光、淡淡的霧接住背景、
//   小人是大頭的 chibi、鏡頭每一幀用阻尼追目標（不是關鍵影格），所以不管連按幾次都不會跳。
//
// 畫面：一座圓圓的小島在青色的海上，環島一條路，路上八個小地方就是那一年的八關：學校、禮堂、營隊帳篷、電話亭、書桌、家、郵筒、碼頭。
// 第一屏三個學生站在沙灘上，點一個（或點他頭上的牌子）就開始。每一關學生沿路走到那個地方，鏡頭跟著滑過去；
// 選完一個人從島的另一頭走過來站在他旁邊；下一關整群人一起走。走完一年一架小飛機降在碼頭外的海上，鏡頭拉遠看整座島。
//
// ── 守的四件事 ──
// 1. 資料與場景分開：誰、哪一關、什麼字，全部從 engine.js 丟進來；這裡沒有任何一句劇本。
// 2. Three 只有這一支 import（importmap 的 three）。載不到整支載不進來，engine.js 接住走點燈版或靜的島。
// 3. 會動的東西全部在 motion() 裡（每一幀的更新迴圈也在裡面）。開了減少動態效果 engine.js 不會載這一支。
// 4. 顏色七色進來混色出去，這裡沒有色碼。
import * as THREE from "three";
import * as L from "./layout.js";

export function webglOK() {
  try { const c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); } catch (e) { return false; }
}
// 可重現的亂數（樹、石頭、雲每次開都長一樣）。
function mulberry(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const TAU = Math.PI * 2;
const clamp01 = v => Math.min(1, Math.max(0, v));
const easeInOut = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
// 角度差（-π 到 π）。
const angDiff = (a, b) => { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };

// 圓角盒子：圓角矩形擠出來加斜角。Heart Island 用 RoundedBoxGeometry（addon），cdnjs 沒有 addon，自己做一個夠用的。
const rboxCache = new Map();
function rbox(w, h, d, r) {
  const key = [w, h, d, r].join(","); if (rboxCache.has(key)) return rboxCache.get(key);
  const rr = Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001);
  const s = new THREE.Shape();
  const x0 = -w / 2 + rr, x1 = w / 2 - rr, y0 = -h / 2 + rr, y1 = h / 2 - rr;
  s.moveTo(x0, -h / 2); s.lineTo(x1, -h / 2); s.absarc(x1, y0, rr, -Math.PI / 2, 0, false);
  s.lineTo(w / 2, y1); s.absarc(x1, y1, rr, 0, Math.PI / 2, false);
  s.lineTo(x0, h / 2); s.absarc(x0, y1, rr, Math.PI / 2, Math.PI, false);
  s.lineTo(-w / 2, y0); s.absarc(x0, y0, rr, Math.PI, Math.PI * 1.5, false);
  const g = new THREE.ExtrudeGeometry(s, { depth: Math.max(0.01, d - rr * 2), bevelEnabled: true, bevelThickness: rr, bevelSize: rr, bevelSegments: 3, curveSegments: 6 });
  g.translate(0, 0, -(d - rr * 2) / 2); g.computeVertexNormals();
  rboxCache.set(key, g); return g;
}
function colours(p) {
  const C = k => new THREE.Color(p[k]);
  const navy = C("navy"), teal = C("teal"), orange = C("orange"), sand = C("sand"), cream = C("cream"), yellow = C("yellow"), grey = C("grey"), white = new THREE.Color(1, 1, 1);
  const mix = (a, b, t) => a.clone().lerp(b, t);
  return {
    navy, teal, orange, sand, cream, yellow, grey, white,
    sky: mix(cream, white, 0.35),                                   // 背景：紙色再亮一點
    water: mix(teal, cream, 0.22).offsetHSL(0, 0.08, 0), waterDeep: mix(teal, navy, 0.18), shallow: mix(teal, cream, 0.5),
    grass: mix(mix(teal, yellow, 0.55), sand, 0.12).offsetHSL(0, 0.14, 0.02), grassDark: mix(mix(teal, yellow, 0.4), navy, 0.22),
    beach: mix(sand, cream, 0.5), cliff: mix(mix(sand, grey, 0.35), teal, 0.25), road: mix(cream, grey, 0.35),
    wall: mix(cream, white, 0.5), wall2: mix(sand, white, 0.3), roofO: mix(orange, white, 0.12), roofT: mix(teal, white, 0.12), roofN: mix(navy, white, 0.35), roofY: mix(yellow, orange, 0.3),
    wood: mix(mix(sand, navy, 0.35), orange, 0.2), dark: mix(navy, grey, 0.15), tree: [mix(mix(teal, yellow, 0.5), navy, 0.1).offsetHSL(0, 0.2, -0.04), mix(mix(teal, yellow, 0.62), sand, 0.08).offsetHSL(0, 0.18, 0), mix(mix(teal, yellow, 0.45), navy, 0.24).offsetHSL(0, 0.2, -0.06)],
    trunk: mix(mix(sand, navy, 0.5), grey, 0.2), rock: mix(grey, cream, 0.35), cloud: mix(cream, white, 0.7),
    skin: [mix(mix(sand, orange, 0.15), white, 0.25), mix(mix(sand, orange, 0.35), white, 0.1), mix(mix(sand, orange, 0.5), navy, 0.08)],
    hair: [mix(navy, grey, 0.1).multiplyScalar(0.35), mix(mix(navy, orange, 0.4), grey, 0.1).multiplyScalar(0.45), mix(navy, grey, 0.05).multiplyScalar(0.25)],
    shirt: [mix(orange, white, 0.15), mix(teal, white, 0.1), mix(yellow, white, 0.2), mix(navy, white, 0.45), mix(cream, white, 0.4), mix(sand, orange, 0.4)],
    pants: [mix(navy, grey, 0.3), mix(mix(sand, grey, 0.4), navy, 0.2), mix(navy, white, 0.3)],
    light: mix(yellow, orange, 0.35), pin: navy,
  };
}

export async function create({ stage, palette, phone, lang, onPick }) {
  if (!webglOK()) throw new Error("no webgl");
  stage.innerHTML = "";
  const canvas = document.createElement("canvas"); canvas.className = "scene3d"; stage.appendChild(canvas);
  const pins = document.createElement("div"); pins.className = "pins"; stage.appendChild(pins);
  const P = colours(palette);
  const std = (color, extra) => new THREE.MeshStandardMaterial({ color, roughness: 0.82, metalness: 0, ...(extra || {}) });
  const M = {
    grass: std(P.grass), beach: std(P.beach), cliff: std(P.cliff), road: std(P.road, { roughness: 0.95 }), wall: std(P.wall), wall2: std(P.wall2),
    roofO: std(P.roofO), roofT: std(P.roofT), roofN: std(P.roofN), roofY: std(P.roofY), wood: std(P.wood), dark: std(P.dark), rock: std(P.rock, { flatShading: true }),
    trunk: std(P.trunk), cloud: std(P.cloud, { emissive: P.cloud, emissiveIntensity: 0.25 }), light: std(P.light, { emissive: P.light, emissiveIntensity: 0.9 }),
    orange: std(P.orange), teal: std(P.teal), navy: std(P.navy), cream: std(P.cream), yellow: std(P.yellow), white: std(P.white),
    shallow: new THREE.MeshStandardMaterial({ color: P.shallow, roughness: 0.6, transparent: true, opacity: 0.85 }),
    water: new THREE.MeshStandardMaterial({ color: P.water, roughness: 0.35, metalness: 0.05 }),
    tree: P.tree.map(c => std(c)), skin: P.skin.map(c => std(c, { roughness: 0.7 })), hair: P.hair.map(c => std(c, { roughness: 0.9 })),
    shirt: P.shirt.map(c => std(c)), pants: P.pants.map(c => std(c)), eye: std(P.dark, { roughness: 0.4 }),
  };

  // ═══ 渲染器、鏡頭、光（照 Heart Island 的配方）═══
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(phone ? 1.25 : 1.6, window.devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.shadowMap.autoUpdate = false;
  const scene = new THREE.Scene(); scene.background = P.sky.clone(); scene.fog = new THREE.Fog(P.sky.clone(), 60, 150);
  const camera = new THREE.PerspectiveCamera(32, 16 / 9, 0.5, 400); scene.add(camera);
  scene.add(new THREE.HemisphereLight(P.white.clone().lerp(P.teal, 0.08), P.sand.clone().lerp(P.grey, 0.4), 1.2));
  const sun = new THREE.DirectionalLight(P.cream.clone().lerp(P.white, 0.5), 2.6); sun.position.set(-26, 44, 18); sun.castShadow = true;
  sun.shadow.mapSize.set(phone ? 1024 : 2048, phone ? 1024 : 2048); sun.shadow.camera.near = 5; sun.shadow.camera.far = 140;
  const sc = sun.shadow.camera; sc.left = -34; sc.right = 34; sc.top = 34; sc.bottom = -34; sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03; sun.shadow.radius = 3;
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight(P.teal.clone().lerp(P.white, 0.6), 0.35); fill.position.set(30, 20, -30); scene.add(fill);

  const world = new THREE.Group(); scene.add(world);
  const rnd = mulberry(7);
  const R = L.ISLAND_R;

  // ═══ 海、淺灘、島 ═══
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), M.water); sea.rotation.x = -Math.PI / 2; sea.position.y = -0.3; sea.receiveShadow = true; world.add(sea);
  const shallow = new THREE.Mesh(new THREE.CircleGeometry(R + 6.5, 48), M.shallow); shallow.rotation.x = -Math.PI / 2; shallow.position.y = -0.22; world.add(shallow);
  // 島：圓柱側面是淡淡的崖，頂面是草，草的邊緣一圈沙灘。頂面的頂點微微起伏（不要平得像桌面）。
  const body = new THREE.Mesh(new THREE.CylinderGeometry(R, R + 1.2, 3.2, 40, 1, true), M.cliff); body.position.y = -1.6; body.receiveShadow = true; world.add(body);
  const top = new THREE.CircleGeometry(R, 40);
  { const pos = top.attributes.position; for (let i = 0; i < pos.count; i++) { const x = pos.getX(i), y = pos.getY(i), d = Math.hypot(x, y) / R; pos.setZ(i, d > 0.98 ? 0 : 0.12 * Math.sin(x * 0.4) * Math.cos(y * 0.35) * (1 - d)); } top.computeVertexNormals(); }
  const ground = new THREE.Mesh(top, M.grass); ground.rotation.x = -Math.PI / 2; ground.position.y = 0; ground.receiveShadow = true; world.add(ground);
  const beach = new THREE.Mesh(new THREE.RingGeometry(R - 1.6, R + 0.02, 48), M.beach); beach.rotation.x = -Math.PI / 2; beach.position.y = 0.015; beach.receiveShadow = true; world.add(beach);
  // 環島的路：一圈扁的圓環，一點點高出草地。
  const road = new THREE.Mesh(new THREE.RingGeometry(L.ROAD_R - 1.1, L.ROAD_R + 1.1, 64), M.road); road.rotation.x = -Math.PI / 2; road.position.y = 0.03; road.receiveShadow = true; world.add(road);
  { const dashes = new THREE.InstancedMesh(rbox(0.9, 0.04, 0.22, 0.02), M.cream, 40); const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < 40; i++) { const a = i / 40 * TAU; p.set(Math.cos(a) * L.ROAD_R, 0.055, Math.sin(a) * L.ROAD_R); q.setFromAxisAngle(up, -a); m.compose(p, q, s); dashes.setMatrixAt(i, m); } dashes.instanceMatrix.needsUpdate = true; world.add(dashes); }
  // 碼頭：從沙灘伸到海上的木棧道，第一屏三個學生站在這裡，最後飛機也停在它外面。
  { const pier = new THREE.Group(); const pa = L.PIER_ANGLE; pier.position.set(Math.cos(pa) * (R - 1), 0, Math.sin(pa) * (R - 1)); pier.rotation.y = -pa; world.add(pier);
    const deck = new THREE.Mesh(rbox(9, 0.3, 3.2, 0.08), M.wood); deck.position.set(4.2, 0.25, 0); deck.castShadow = true; deck.receiveShadow = true; pier.add(deck);
    for (const x of [1.5, 4.5, 7.5]) for (const z of [-1.3, 1.3]) { const post = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 1.4, 8), M.trunk); post.position.set(x, -0.3, z); pier.add(post); }
    const lamp = new THREE.Group(); lamp.position.set(8.2, 0.4, -1.2); lamp.add(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 2.2, 6), M.dark).translateY(1.1), new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), M.light).translateY(2.3)); pier.add(lamp); }
  // 樹：三種綠的球疊在短短的樹幹上，InstancedMesh。避開路與八個地方。
  { const spots = []; let tries = 0;
    while (spots.length < (phone ? 36 : 54) && tries++ < 4000) { const a = rnd() * TAU, d = Math.sqrt(rnd()) * (R - 2.6); const x = Math.cos(a) * d, z = Math.sin(a) * d; const rd = Math.hypot(x, z);
      if (Math.abs(rd - L.ROAD_R) < 2.2) continue; if (L.STATIONS.some(s => Math.hypot(x - s.x, z - s.z) < 3.6)) continue; if (spots.some(s => Math.hypot(x - s[0], z - s[2]) < 2.2)) continue;
      spots.push([x, 0, z, rnd() * TAU, 0.55 + rnd() * 0.45]); }
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.12, 0.16, 0.8, 6), M.trunk, spots.length);
    const crowns = M.tree.map(mat => new THREE.InstancedMesh(new THREE.SphereGeometry(0.8, 12, 9), mat, spots.length));
    spots.forEach(([x, y, z, ry, sc], i) => { q.setFromAxisAngle(up, ry); s.setScalar(sc); p.set(x, 0.4 * sc, z); m.compose(p, q, s); trunks.setMatrixAt(i, m);
      crowns.forEach((c, k) => { if (i % 3 === k) { p.set(x, (0.8 + 0.55) * sc, z); m.compose(p, q, s); c.setMatrixAt(i, m); } else { s.setScalar(0.0001); m.compose(p, q, s); c.setMatrixAt(i, m); s.setScalar(sc); } }); });
    trunks.instanceMatrix.needsUpdate = true; trunks.castShadow = true; world.add(trunks);
    crowns.forEach(c => { c.instanceMatrix.needsUpdate = true; c.castShadow = true; c.receiveShadow = true; world.add(c); }); }
  // 石頭、幾朵雲。
  { for (let i = 0; i < 14; i++) { const a = rnd() * TAU, d = R - 0.6 + rnd() * 1.2; const rk = new THREE.Mesh(new THREE.DodecahedronGeometry(0.25 + rnd() * 0.35, 0), M.rock); rk.position.set(Math.cos(a) * d, 0.1, Math.sin(a) * d); rk.rotation.set(rnd() * 3, rnd() * 3, 0); rk.castShadow = true; world.add(rk); }
    for (let i = 0; i < 7; i++) { const g = new THREE.Group(); const a = rnd() * TAU, d = R + 8 + rnd() * 24; g.position.set(Math.cos(a) * d, 14 + rnd() * 8, Math.sin(a) * d); for (let k = 0; k < 4; k++) { const b = new THREE.Mesh(new THREE.SphereGeometry(1.1 + rnd() * 1.2, 10, 8), M.cloud); b.position.set(k * 1.5 - 2.2, rnd() * 0.5, rnd() * 0.8); g.add(b); } g.userData.drift = 0.2 + rnd() * 0.3; world.add(g); clouds.push(g); } }

  // ═══ 島中間的小村子、燈塔、船、沙灘傘、花 ═══
  { const vill = new THREE.Group(); world.add(vill);
    const specs = [[-3, -2, 2.2, 2.0, M.wall, M.roofO], [1.5, -4, 2.6, 2.4, M.wall2, M.roofT], [4, 1, 2.0, 1.8, M.wall, M.roofN], [-1, 3.5, 2.4, 2.2, M.wall2, M.roofY], [-5.5, 2, 1.8, 1.7, M.wall, M.roofT], [2.5, 5, 2.0, 2.6, M.wall, M.roofO]];
    for (const [x, z, w, h, wm, rm] of specs) { const hs = house(w, h, w * 0.9, wm, rm); hs.position.set(x, 0, z); hs.rotation.y = rnd() * TAU; vill.add(hs); windows(hs, 2, h * 0.55, w * 0.46, w * 0.4).forEach(win => { win.material = M.light; }); }
    const sq = new THREE.Mesh(new THREE.CircleGeometry(3.2, 20), M.road); sq.rotation.x = -Math.PI / 2; sq.position.set(0, 0.035, 0); vill.add(sq);
    const fountain = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, 0.5, 14), M.wall); fountain.position.y = 0.25; vill.add(fountain); const fw = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.2, 14), M.water); fw.position.y = 0.45; vill.add(fw);
    // 燈塔在島的北邊
    const lh = new THREE.Group(); const la = L.PIER_ANGLE + Math.PI; lh.position.set(Math.cos(la) * (R - 2.2), 0, Math.sin(la) * (R - 2.2)); world.add(lh);
    lh.add(new THREE.Mesh(new THREE.CylinderGeometry(0.7, 1.0, 4.4, 12), M.wall).translateY(2.2), new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 0.5, 12), M.orange).translateY(1.6), new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 0.5, 12), M.orange).translateY(3.2), new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.6, 12), M.light).translateY(4.7), new THREE.Mesh(new THREE.ConeGeometry(0.75, 0.6, 12), M.roofN).translateY(5.3));
    lh.traverse(m => { if (m.isMesh) m.castShadow = true; });
    // 兩艘小船在海上
    for (const [a, d] of [[L.PIER_ANGLE + 0.5, R + 9], [L.PIER_ANGLE - 0.9, R + 13]]) { const b = new THREE.Group(); b.position.set(Math.cos(a) * d, -0.1, Math.sin(a) * d); b.rotation.y = rnd() * TAU; world.add(b);
      b.add(new THREE.Mesh(rbox(2.6, 0.6, 1.1, 0.3), M.wall), new THREE.Mesh(rbox(0.9, 0.5, 0.8, 0.15), M.teal).translateY(0.5).translateX(-0.4), new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2, 6), M.dark).translateY(1.2).translateX(0.4), new THREE.Mesh(rbox(0.9, 1.3, 0.04, 0.02), M.orange).translateY(1.4).translateX(0.9)); b.traverse(m => { if (m.isMesh) m.castShadow = true; }); b.userData.bob = rnd() * 6; boats.push(b); }
    // 沙灘傘與花
    for (const [dx, dz, mat] of [[-6.5, -1.5, M.orange], [6.8, -0.8, M.teal]]) { const u = new THREE.Group(); const c0 = L.CANDIDATE_SPOTS[1]; u.position.set(c0.x + dx, 0, c0.z + dz); world.add(u); u.add(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.2, 6), M.dark).translateY(1.1), new THREE.Mesh(new THREE.ConeGeometry(1.4, 0.6, 10), mat).translateY(2.3)); u.children[1].castShadow = true; }
    { const n = phone ? 60 : 120, fl = new THREE.InstancedMesh(new THREE.SphereGeometry(0.14, 6, 5), M.yellow, n), fl2 = new THREE.InstancedMesh(new THREE.SphereGeometry(0.14, 6, 5), M.orange, n); const m = new THREE.Matrix4();
      for (let i = 0; i < n; i++) { const a = rnd() * TAU, d = 4 + Math.sqrt(rnd()) * (R - 6); const x = Math.cos(a) * d, z = Math.sin(a) * d; if (Math.abs(Math.hypot(x, z) - L.ROAD_R) < 1.6) { m.makeScale(0.001, 0.001, 0.001); } else m.makeTranslation(x, 0.12, z); (i % 2 ? fl : fl2).setMatrixAt(i, m); (i % 2 ? fl2 : fl).setMatrixAt(i, new THREE.Matrix4().makeScale(0.001, 0.001, 0.001)); }
      fl.instanceMatrix.needsUpdate = true; fl2.instanceMatrix.needsUpdate = true; world.add(fl, fl2); }
    // 一台小巴士繞著環島的路開（在 motion 裡動）
    bus.add(new THREE.Mesh(rbox(2.4, 1.1, 1.2, 0.25), M.teal).translateY(0.75), new THREE.Mesh(rbox(1.6, 0.4, 1.24, 0.1), M.dark).translateY(0.95).translateX(0.1));
    for (const x of [-0.75, 0.75]) for (const z of [-0.5, 0.5]) bus.add(new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.2, 10), M.dark).translateX(x).translateY(0.22).translateZ(z).rotateX(Math.PI / 2));
    bus.traverse(m => { if (m.isMesh) m.castShadow = true; }); bus.userData.a = L.PIER_ANGLE + 2.5; world.add(bus); }

  // ═══ 八個小地方（一關一個）═══
  // 每一個是一個小 Group，原點在地面、面向路（朝島心）。亮不亮：窗戶的材質換成 light。
  const stationObjs = [];
  function house(w, h, d, wallM, roofM) { const g = new THREE.Group(); const b = new THREE.Mesh(rbox(w, h, d, 0.12), wallM); b.position.y = h / 2; b.castShadow = true; b.receiveShadow = true; g.add(b);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, d) * 0.78, h * 0.6, 4), roofM); roof.position.y = h + h * 0.3; roof.rotation.y = Math.PI / 4; roof.castShadow = true; g.add(roof); return g; }
  function windows(g, n, y, z, spread) { const ws = []; for (let i = 0; i < n; i++) { const wm = new THREE.Mesh(rbox(0.5, 0.5, 0.08, 0.06), M.dark); wm.position.set((i - (n - 1) / 2) * spread, y, z); g.add(wm); ws.push(wm); } return ws; }
  function sign(g, x, y, z) { const s = new THREE.Mesh(rbox(1.6, 0.6, 0.12, 0.08), M.cream); s.position.set(x, y, z); s.castShadow = true; g.add(s); return s; }
  const builders = {
    school(g) { const h = house(4.2, 2.6, 2.6, M.wall, M.roofN); g.add(h); g.userData.win = windows(h, 3, 1.5, 1.34, 1.1); const gate = new THREE.Mesh(rbox(0.9, 1.4, 0.2, 0.1), M.navy); gate.position.set(0, 0.7, 1.4); h.add(gate); g.userData.door = gate; sign(h, 0, 2.3, 1.4); },
    hall(g) { const h = house(4, 2.0, 2.8, M.wall2, M.roofT); g.add(h); g.userData.win = windows(h, 3, 1.2, 1.44, 1.0); const stage_ = new THREE.Mesh(rbox(2.2, 0.3, 1.2, 0.08), M.wood); stage_.position.set(0, 0.15, 2.4); g.add(stage_); },
    camp(g) { for (const [x, mat] of [[-1.3, M.roofO], [1.3, M.roofY]]) { const t = new THREE.Mesh(new THREE.ConeGeometry(1.5, 1.9, 4), mat); t.position.set(x, 0.95, 0); t.rotation.y = Math.PI / 4; t.castShadow = true; g.add(t); }
      const wall = new THREE.Mesh(rbox(3.6, 1.6, 0.14, 0.06), M.cream); wall.position.set(0, 0.8, 1.8); wall.castShadow = true; g.add(wall); g.userData.win = [];
      for (let i = 0; i < 9; i++) { const n = new THREE.Mesh(rbox(0.32, 0.32, 0.03, 0.02), [M.yellow, M.orange, M.teal][i % 3]); n.position.set(-1.2 + (i % 5) * 0.6, 1.2 - Math.floor(i / 5) * 0.5, 1.9); n.rotation.z = (i % 2 ? 0.08 : -0.08); wall.add(n); g.userData.win.push(n); } },
    phone(g) { const b = new THREE.Mesh(rbox(1.3, 2.4, 1.3, 0.12), M.orange); b.position.y = 1.2; b.castShadow = true; g.add(b); const glass = new THREE.Mesh(rbox(0.9, 1.3, 0.1, 0.06), M.dark); glass.position.set(0, 1.3, 0.66); g.add(glass); g.userData.win = [glass];
      const globe = new THREE.Mesh(new THREE.SphereGeometry(0.42, 14, 10), M.teal); globe.position.set(1.6, 1.25, 0); g.add(globe); const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.3, 0.8, 8), M.dark); stand.position.set(1.6, 0.4, 0); g.add(stand); },
    desk(g) { const h = house(3.2, 2.2, 2.6, M.wall, M.roofY); g.add(h); g.userData.win = windows(h, 2, 1.3, 1.34, 1.2); for (let i = 0; i < 3; i++) { const bk = new THREE.Mesh(rbox(0.5, 0.8 - i * 0.1, 0.3, 0.04), [M.navy, M.teal, M.orange][i]); bk.position.set(-2.2 + i * 0.55, 0.4, 0.6); bk.rotation.z = i === 1 ? -0.1 : 0; bk.castShadow = true; g.add(bk); } },
    home(g) { const h = house(3.6, 2.4, 3, M.wall2, M.roofO); g.add(h); g.userData.win = windows(h, 2, 1.4, 1.54, 1.4); const door = new THREE.Mesh(rbox(0.7, 1.2, 0.16, 0.08), M.wood); door.position.set(0, 0.6, 1.56); h.add(door);
      const chim = new THREE.Mesh(rbox(0.5, 1.0, 0.5, 0.06), M.wall); chim.position.set(1.1, 3.1, -0.6); h.add(chim); },
    post(g) { const bx = new THREE.Mesh(rbox(0.9, 1.5, 0.9, 0.2), M.orange); bx.position.y = 1.05; bx.castShadow = true; g.add(bx); const slot = new THREE.Mesh(rbox(0.5, 0.08, 0.06, 0.02), M.dark); slot.position.set(0, 1.45, 0.46); g.add(slot);
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.4, 8), M.dark); leg.position.y = 0.2; g.add(leg); g.userData.win = [slot]; const tree = new THREE.Mesh(new THREE.SphereGeometry(0.9, 12, 9), M.tree[1]); tree.position.set(1.8, 1.5, -0.4); tree.castShadow = true; g.add(tree); const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 1, 6), M.trunk); tr.position.set(1.8, 0.5, -0.4); g.add(tr); },
    pier(g) { const booth = new THREE.Mesh(rbox(2.2, 2.0, 1.4, 0.14), M.wall); booth.position.y = 1.0; booth.castShadow = true; g.add(booth); const roof = new THREE.Mesh(rbox(2.6, 0.2, 1.8, 0.06), M.roofT); roof.position.y = 2.1; roof.castShadow = true; g.add(roof);
      g.userData.win = windows(booth, 2, 0.1, 0.74, 0.9); const flagP = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 3, 6), M.dark); flagP.position.set(1.7, 1.5, 0); g.add(flagP); const flag = new THREE.Mesh(rbox(0.9, 0.5, 0.04, 0.02), M.orange); flag.position.set(2.2, 2.7, 0); g.add(flag); g.userData.flag = flag; },
  };
  for (const s of L.STATIONS) {
    const g = new THREE.Group(); g.position.set(s.x, 0, s.z); g.rotation.y = -Math.atan2(s.z, s.x) - Math.PI / 2 + Math.PI;   // 面向島心（朝路）
    builders[s.kind](g); g.scale.setScalar(1.3); world.add(g);
    const pin = document.createElement("div"); pin.className = "pin pin-station"; pin.hidden = true; pins.appendChild(pin);
    stationObjs.push({ s, g, pin, lit: false, text: "" });
  }
  function setStation(i, lit, text) {
    const S = stationObjs[i]; if (!S) return; S.lit = lit; if (text != null) S.text = text;
    for (const w of S.g.userData.win || []) w.material = lit ? M.light : M.dark;
    if (S.s.kind === "camp") for (const n of S.g.userData.win) n.material = lit ? [M.yellow, M.orange, M.teal][S.g.userData.win.indexOf(n) % 3] : M.grey;
    S.pin.hidden = !lit || !S.text; S.pin.textContent = S.text; S.pin.classList.toggle("now", false);
    shadowsDirty = true;
  }

  // ═══ 人：大頭的 chibi ═══
  // 高 1.55：腿 0.3、身體 0.55、頭直徑 0.7。頭髮一頂帽子，眼睛兩顆小黑球，手是兩根小膠囊，腳是兩塊圓角盒。
  const PG = { head: new THREE.SphereGeometry(0.36, 16, 12), cap: new THREE.SphereGeometry(0.38, 16, 8, 0, TAU, 0, Math.PI * 0.52), eye: new THREE.SphereGeometry(0.045, 8, 6),
    body: new THREE.CapsuleGeometry(0.24, 0.3, 4, 10), arm: new THREE.CapsuleGeometry(0.075, 0.26, 3, 8), leg: rbox(0.2, 0.3, 0.22, 0.07), pack: rbox(0.34, 0.4, 0.18, 0.06), bag: rbox(0.5, 0.42, 0.26, 0.06), cap2: new THREE.CylinderGeometry(0.4, 0.4, 0.12, 14), shadow: new THREE.CircleGeometry(0.38, 16) };
  PG.shadow.rotateX(-Math.PI / 2);
  function makePerson(o) {
    o = o || {}; const g = new THREE.Group(); g.name = "person";
    const skin = M.skin[o.skin % 3 || 0], hair = M.hair[o.hair % 3 || 0], shirt = M.shirt[(o.shirt || 0) % 6], pants = M.pants[(o.pants || 0) % 3];
    const legL = new THREE.Mesh(PG.leg, pants), legR = new THREE.Mesh(PG.leg, pants); legL.position.set(-0.13, 0.15, 0); legR.position.set(0.13, 0.15, 0); legL.name = "legL"; legR.name = "legR"; g.add(legL, legR);
    const body = new THREE.Mesh(PG.body, shirt); body.position.y = 0.62; body.name = "body"; g.add(body);
    const armL = new THREE.Mesh(PG.arm, shirt), armR = new THREE.Mesh(PG.arm, shirt); armL.position.set(-0.33, 0.68, 0); armR.position.set(0.33, 0.68, 0); armL.name = "armL"; armR.name = "armR"; g.add(armL, armR);
    const head = new THREE.Mesh(PG.head, skin); head.position.y = 1.2; head.name = "head"; g.add(head);
    const cap = new THREE.Mesh(PG.cap, hair); cap.position.y = 1.23; cap.rotation.x = -0.25; g.add(cap);
    for (const sx of [-1, 1]) { const e = new THREE.Mesh(PG.eye, M.eye); e.position.set(sx * 0.13, 1.2, 0.33); g.add(e); }
    if (o.pack) { const pk = new THREE.Mesh(PG.pack, M.orange); pk.position.set(0, 0.7, -0.3); g.add(pk); }
    if (o.bag) { const bg = new THREE.Mesh(PG.bag, M.navy); bg.position.set(0.42, 0.21, 0); g.add(bg); }
    if (o.hat) { const h = new THREE.Mesh(PG.cap2, M.navy); h.position.y = 1.5; g.add(h); }
    const sh = new THREE.Mesh(PG.shadow, new THREE.MeshBasicMaterial({ color: P.navy, transparent: true, opacity: 0.12, depthWrite: false })); sh.position.y = 0.02; g.add(sh);
    g.traverse(m => { if (m.isMesh && m !== sh) m.castShadow = true; });
    g.userData = { phase: Math.random() * 6, baseY: 0, moving: false, bob: 0 };
    return g;
  }
  function pose(g, t) {
    const u = g.userData, legL = g.getObjectByName("legL"), legR = g.getObjectByName("legR"), armL = g.getObjectByName("armL"), armR = g.getObjectByName("armR"), head = g.getObjectByName("head");
    if (u.moving) { const s = Math.sin(t * 9 + u.phase); legL.rotation.x = s * 0.6; legR.rotation.x = -s * 0.6; armL.rotation.x = -s * 0.5; armR.rotation.x = s * 0.5; g.position.y = u.baseY + Math.abs(Math.cos(t * 9 + u.phase)) * 0.05; }
    else { legL.rotation.x = 0; legR.rotation.x = 0; armL.rotation.x = 0.05; armR.rotation.x = -0.05; g.position.y = u.baseY + Math.sin(t * 1.6 + u.phase) * 0.012; }
    head.rotation.y = Math.sin(t * 0.7 + u.phase) * 0.12;
  }

  // 三個學生站在沙灘上等人挑（第一屏）。每個頭上一塊 HTML 牌子。
  const candidates = [];
  for (let i = 0; i < 3; i++) {
    const sp = L.CANDIDATE_SPOTS[i]; const g = makePerson({ skin: i, hair: i, shirt: [0, 1, 2][i], pants: i, pack: true }); g.position.set(sp.x, 0.3, sp.z); g.userData.baseY = 0.3; g.rotation.y = sp.face; g.userData.pick = ["a", "b", "c"][i]; world.add(g);
    const pin = document.createElement("button"); pin.type = "button"; pin.className = "pin pin-pick"; pin.dataset.pick = g.userData.pick; pins.appendChild(pin);
    candidates.push({ g, pin, id: g.userData.pick, label: "" });
  }
  // 小飛機（最後一關降在碼頭外的海上）。
  const plane = new THREE.Group(); { const fus = new THREE.Mesh(rbox(3.2, 0.8, 0.9, 0.35), M.cream); fus.castShadow = true; plane.add(fus); const wing = new THREE.Mesh(rbox(1.0, 0.1, 4.2, 0.05), M.teal); wing.position.set(0.1, 0.2, 0); wing.castShadow = true; plane.add(wing);
    const tail = new THREE.Mesh(rbox(0.7, 0.8, 0.1, 0.05), M.orange); tail.position.set(-1.4, 0.7, 0); plane.add(tail); const stab = new THREE.Mesh(rbox(0.6, 0.08, 1.6, 0.04), M.orange); stab.position.set(-1.4, 0.3, 0); plane.add(stab);
    for (const z of [-0.6, 0.6]) { const fl = new THREE.Mesh(rbox(2.4, 0.2, 0.3, 0.1), M.navy); fl.position.set(0.2, -0.65, z); plane.add(fl); } const win = new THREE.Mesh(rbox(0.8, 0.3, 0.92, 0.1), M.dark); win.position.set(0.8, 0.15, 0); plane.add(win); }
  plane.visible = false; world.add(plane);

  // ═══ 鏡頭 ═══
  const cam = { pos: new THREE.Vector3(), tgt: new THREE.Vector3(), goalPos: new THREE.Vector3(), goalTgt: new THREE.Vector3(), orbit: true, t0: 0 };
  function overview(t) {
    if (state.ended) { const a = L.PIER_ANGLE + Math.PI * 0.12 + Math.sin(t * 0.08) * 0.3; const d = phone ? 86 : 72; cam.goalPos.set(Math.cos(a) * d, d * 0.78, Math.sin(a) * d); cam.goalTgt.set(0, 0.5, 0); return; }
    // 第一屏：從海上看沙灘，三個學生在畫面中間，鏡頭慢慢左右晃。
    const c = L.CANDIDATE_SPOTS[1], a = L.PIER_ANGLE + Math.sin(t * 0.12) * 0.22, d = phone ? 30 : 26;
    cam.goalTgt.set(c.x, 1.0, c.z - 1.5); cam.goalPos.set(c.x + Math.cos(a) * d * 0.55, d * 0.62, c.z + Math.sin(a) * d * 0.9);
  }
  function lookAtStation(i) {
    // 從島的裡面（路這一側）斜上方看那個地方，鏡頭偏一點讓主角站在畫面左下、房子在右上。
    const s = L.STATIONS[i]; const dir = new THREE.Vector3(s.x, 0, s.z).normalize(); const side = new THREE.Vector3(-dir.z, 0, dir.x);
    cam.goalTgt.set(s.x - dir.x * 2.5, 1.4, s.z - dir.z * 2.5);
    const back = phone ? 24 : 21, up = phone ? 19 : 16;
    cam.goalPos.copy(cam.goalTgt).addScaledVector(dir, -back).addScaledVector(side, phone ? 2 : 6).setY(up);
  }
  function placeCam() { camera.position.copy(cam.pos); camera.lookAt(cam.tgt); }
  // ═══ 狀態與投影 ═══
  const state = { lang, persona: null, sceneI: -1, met: [], walkers: [], api: null, hover: null, ended: false };
  overview(0); cam.pos.copy(cam.goalPos); cam.tgt.copy(cam.goalTgt); placeCam();
  const traveller = { g: null, angle: L.PIER_ANGLE, goalAngle: L.PIER_ANGLE, radius: L.ROAD_R };
  const v3 = new THREE.Vector3();
  function project(x, y, z) { v3.set(x, y, z).project(camera); const w = stage.clientWidth, h = stage.clientHeight; return { x: (v3.x + 1) / 2 * w, y: (1 - v3.y) / 2 * h, visible: v3.z < 1 }; }
  function placePins() {
    for (const S of stationObjs) { if (S.pin.hidden) continue; const p = project(S.s.x, 5.0, S.s.z); S.pin.style.transform = `translate(-50%,-100%) translate(${p.x.toFixed(1)}px,${p.y.toFixed(1)}px)`; S.pin.style.opacity = p.visible ? 1 : 0; }
    for (const c of candidates) { if (c.pin.hidden) continue; const p = project(c.g.position.x, 2.1, c.g.position.z); c.pin.style.transform = `translate(-50%,-100%) translate(${p.x.toFixed(1)}px,${p.y.toFixed(1)}px)`; }
  }
  let shadowsDirty = true;
  function resize() { const w = stage.clientWidth || 300, h = stage.clientHeight || 200; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
  function render(t) { if (shadowsDirty) { renderer.shadowMap.needsUpdate = true; shadowsDirty = false; } renderer.render(scene, camera); placePins(); void t; }
  resize(); render(0);
  let ro = null; if ("ResizeObserver" in window) { ro = new ResizeObserver(() => { resize(); render(0); }); ro.observe(stage); }

  // 點學生（3D 的射線）或點他的牌子都算挑了他。
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  function hitCandidate(ev) { const r = canvas.getBoundingClientRect(); ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1); ray.setFromCamera(ndc, camera);
    const hits = ray.intersectObjects(candidates.map(c => c.g), true); if (!hits.length) return null; let o = hits[0].object; while (o && !o.userData.pick) o = o.parent; return o ? candidates.find(c => c.g === o) : null; }
  canvas.addEventListener("pointermove", ev => { if (state.persona) return; const c = hitCandidate(ev); state.hover = c; canvas.style.cursor = c ? "pointer" : ""; candidates.forEach(x => x.pin.classList.toggle("hover", x === c)); });
  canvas.addEventListener("click", ev => { if (state.persona) return; const c = hitCandidate(ev); if (c && onPick) onPick(c.id); });
  pins.addEventListener("click", ev => { const b = ev.target.closest("[data-pick]"); if (b && !state.persona && onPick) onPick(b.dataset.pick); });

  const api = {
    setLang(l) { state.lang = l; },
    // 第一屏：三個學生的牌子寫他們的一句話。
    candidates(list) { list.forEach((p, i) => { const c = candidates[i]; if (!c) return; c.label = p["tag_" + state.lang] || p.tag_zh || ""; c.pin.textContent = (p.id || "").toUpperCase() + " · " + c.label; c.pin.hidden = false; }); placePins(); },
    start(persona) {
      state.persona = persona; state.ended = false; state.sceneI = -1;
      // 挑中的那個學生變成主角；另外兩個留在沙灘上揮手（不動）。
      const idx = ["a", "b", "c"].indexOf(persona.id); candidates.forEach((c, i) => { c.pin.hidden = true; c.g.visible = i === idx || true; });
      traveller.g = candidates[idx >= 0 ? idx : 0].g; traveller.angle = L.PIER_ANGLE; traveller.goalAngle = L.PIER_ANGLE; traveller.g.userData.baseY = 0;
      cam.orbit = false;
      for (const w of state.walkers) world.remove(w.g); state.walkers = []; state.met = [];
      stationObjs.forEach((S, i) => setStation(i, false, ""));
      plane.visible = false;
      if (state.api) state.api.wake();
    },
    scene(i, s) {
      state.sceneI = i;
      const title = s ? (s["title_" + state.lang] || s.title_zh || "") : "";
      setStation(i, true, title); stationObjs.forEach((S, k) => S.pin.classList.toggle("now", k === i));
      traveller.goalAngle = L.STATIONS[i].angle;
      // 已經在旁邊的人跟著走：目標角度比主角落後一點。
      state.walkers.forEach((w, k) => { w.goalAngle = L.STATIONS[i].angle - (k + 1) * 0.045 * (k % 2 ? 1 : -1) - 0.05; w.goalRadius = L.ROAD_R + (k % 2 ? 0.9 : -0.9) - Math.floor(k / 2) * 0.3; });
      lookAtStation(i);
      if (!state.api) { snapAll(); render(0); }
    },
    light(person, i) {
      if (!person || state.met.some(m => m.code === person.code)) return;
      state.met.push(person); const k = state.met.length - 1;
      const g = makePerson({ skin: (k + 1) % 3, hair: (k + 2) % 3, shirt: (k + 3) % 6, pants: (k + 1) % 3, bag: person_role(person) === "parent", hat: person_role(person) === "cadre" });
      // 從路的另一邊走過來：起點在主角對面 120 度。
      const start = L.STATIONS[i].angle + (k % 2 ? 1 : -1) * 2.1; g.position.set(Math.cos(start) * L.ROAD_R, 0, Math.sin(start) * L.ROAD_R); world.add(g);
      const w = { g, angle: start, goalAngle: L.STATIONS[i].angle - (k + 1) * 0.045 * (k % 2 ? 1 : -1) - 0.05, radius: L.ROAD_R, goalRadius: L.ROAD_R + (k % 2 ? 0.9 : -0.9) - Math.floor(k / 2) * 0.3 };
      state.walkers.push(w); shadowsDirty = true;
      if (!state.api) { snapAll(); render(0); }
    },
    end() {
      state.ended = true; stationObjs.forEach((S, i) => setStation(i, true, S.text));
      plane.visible = true; plane.position.set(Math.cos(L.PIER_ANGLE) * (R + 40), 9, Math.sin(L.PIER_ANGLE) * (R + 40) + 14); plane.rotation.y = -L.PIER_ANGLE + Math.PI; plane.userData.t = 0;
      cam.orbit = true; cam.t0 = -1;
      if (!state.api) { plane.position.set(Math.cos(L.PIER_ANGLE) * (R + 12), 0.1, Math.sin(L.PIER_ANGLE) * (R + 12) + 2); overview(0); cam.pos.copy(cam.goalPos); cam.tgt.copy(cam.goalTgt); placeCam(); render(0); }
    },
    reset() {
      state.persona = null; state.ended = false; state.sceneI = -1; for (const w of state.walkers) world.remove(w.g); state.walkers = []; state.met = [];
      stationObjs.forEach((S, i) => setStation(i, false, "")); plane.visible = false; cam.orbit = true;
      candidates.forEach((c, i) => { const sp = L.CANDIDATE_SPOTS[i]; c.g.position.set(sp.x, 0.3, sp.z); c.g.userData.baseY = 0.3; c.g.rotation.y = sp.face; c.g.userData.moving = false; c.pin.hidden = !c.label; });
      traveller.g = null; shadowsDirty = true; placePins();
      if (!state.api) render(0);
    },
  };
  function person_role(p) { return p.role || "cadre"; }
  // 沒有動畫（理論上不會發生：沒 gsap 時 engine 不載這一支）：直接把人放到目標。
  function snapAll() { if (traveller.g) { traveller.angle = traveller.goalAngle; traveller.g.position.set(Math.cos(traveller.angle) * L.ROAD_R, 0, Math.sin(traveller.angle) * L.ROAD_R); } for (const w of state.walkers) { w.angle = w.goalAngle; w.radius = w.goalRadius; w.g.position.set(Math.cos(w.angle) * w.radius, 0, Math.sin(w.angle) * w.radius); } cam.pos.copy(cam.goalPos); cam.tgt.copy(cam.goalTgt); placeCam(); }
  if (window.gsap) state.api = motion({ cam, overview, placeCam, render, state, traveller, candidates, clouds, boats, bus, plane, pose, lookAtStation, R });
  return api;
}
const clouds = [], boats = [];
const bus = new THREE.Group();

/* ── 這裡面才有動畫。外面不准出現 gsap。 ──
   每一幀：鏡頭用阻尼追目標（1 - e^(-dt·k)，所以連按不會跳、停下來還會滑半拍）；主角與跟著的人沿路走（角度追目標）；
   第一屏鏡頭慢慢繞島；雲慢慢飄；最後飛機滑下來降在海上。 */
function motion({ cam, overview, placeCam, render, state, traveller, candidates, clouds, boats, bus, plane, pose, lookAtStation, R }) {
  const t0 = gsap.ticker.time; let last = 0;
  const step = (angle, goal, dt, speed) => { const d = angDiff(angle, goal); const mv = Math.sign(d) * Math.min(Math.abs(d), speed * dt); return { angle: angle + mv, moving: Math.abs(d) > 0.004 }; };
  gsap.ticker.add(() => {
    if (document.hidden) return;
    const t = gsap.ticker.time - t0, dt = Math.min(0.05, t - last || 0.016); last = t;
    if (cam.orbit) overview(cam.t0 < 0 ? (cam.t0 = t, 0) : t - cam.t0);
    const k = 1 - Math.exp(-dt * (cam.orbit ? 1.6 : 2.4));
    cam.pos.lerp(cam.goalPos, k); cam.tgt.lerp(cam.goalTgt, k); placeCam();
    // 主角沿路走
    if (traveller.g) {
      const r = step(traveller.angle, traveller.goalAngle, dt, 0.55); traveller.angle = r.angle; traveller.g.userData.moving = r.moving;
      const x = Math.cos(traveller.angle) * traveller.radius, z = Math.sin(traveller.angle) * traveller.radius;
      if (r.moving) traveller.g.rotation.y = Math.atan2(x - traveller.g.position.x, z - traveller.g.position.z); else traveller.g.rotation.y = -traveller.angle + Math.PI / 2 + Math.PI;   // 停下來面向那個地方
      traveller.g.position.x = x; traveller.g.position.z = z;
    }
    for (const w of state.walkers) {
      const r = step(w.angle, w.goalAngle, dt, 0.62); w.angle = r.angle; w.radius += (w.goalRadius - w.radius) * Math.min(1, dt * 2); w.g.userData.moving = r.moving;
      const x = Math.cos(w.angle) * w.radius, z = Math.sin(w.angle) * w.radius;
      if (r.moving) w.g.rotation.y = Math.atan2(x - w.g.position.x, z - w.g.position.z); else w.g.rotation.y = -w.angle + Math.PI / 2 + Math.PI;
      w.g.position.x = x; w.g.position.z = z; pose(w.g, t);
    }
    for (const c of candidates) pose(c.g, t);
    for (const c of clouds) c.position.x += c.userData.drift * dt;
    for (const b of boats) { b.position.y = -0.1 + Math.sin(t * 1.1 + b.userData.bob) * 0.06; b.rotation.z = Math.sin(t * 0.9 + b.userData.bob) * 0.03; }
    bus.userData.a += dt * 0.18; bus.position.set(Math.cos(bus.userData.a) * (L.ROAD_R + 0.55), 0.05, Math.sin(bus.userData.a) * (L.ROAD_R + 0.55)); bus.rotation.y = -bus.userData.a;
    if (plane.visible && plane.userData.t < 1) { plane.userData.t = Math.min(1, plane.userData.t + dt / 4.5); const u = easeInOut(plane.userData.t); const a = L.PIER_ANGLE;
      plane.position.set(Math.cos(a) * (R + 40 - 28 * u), 9 - 8.9 * u, Math.sin(a) * (R + 40 - 28 * u) + 14 - 12 * u); plane.rotation.z = Math.sin(u * Math.PI) * 0.08; }
    render(t);
  });
  return {
    wake() { last = 0; },
    stop() {},
  };
  void lookAtStation;
}
