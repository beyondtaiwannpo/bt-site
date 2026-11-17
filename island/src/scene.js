// /island/ 的 3D 場景（Three.js，全部程式幾何，沒有模型檔）。照 HEART 政策島（puma.taipei/heart-island）的配方：
// 窄鏡頭（fov 32）從高處斜看、ACES 調色、圓角盒子組一切、MeshStandard、一盞暖太陽加天光加淡霧、大頭 chibi 小人、
// 拖曳轉、滾輪縮、鏡頭用阻尼追目標、點得到島、建築與人。
//
// ── 守的四件事 ──
// 1. 資料與場景分開：哪些 team、做什麼、誰，全部從 main.js 丟進來（teams.json）。這裡沒有任何一個 team 的字。
// 2. Three 只有這一支 import。載不到整支載不進來，main.js 接住只留清單。
// 3. 會動的東西全部在 motion() 裡（每一幀的迴圈）。開了減少動態效果 main.js 不呼叫它，畫面改一次畫一次。
// 4. 顏色七色進來混色出去，這裡沒有色碼。
import * as THREE from "three";
import * as L from "./layout.js";

export function webglOK() { try { const c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); } catch (e) { return false; } }
function mulberry(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const TAU = Math.PI * 2;
const angDiff = (a, b) => { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };

// 圓角盒子（cdnjs 沒有 three 的 addon，自己用擠出加斜角做一個）。
const rboxCache = new Map();
function rbox(w, h, d, r) {
  const key = [w, h, d, r].join(","); if (rboxCache.has(key)) return rboxCache.get(key);
  const rr = Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001);
  const s = new THREE.Shape(); const x0 = -w / 2 + rr, x1 = w / 2 - rr, y0 = -h / 2 + rr, y1 = h / 2 - rr;
  s.moveTo(x0, -h / 2); s.lineTo(x1, -h / 2); s.absarc(x1, y0, rr, -Math.PI / 2, 0, false); s.lineTo(w / 2, y1); s.absarc(x1, y1, rr, 0, Math.PI / 2, false);
  s.lineTo(x0, h / 2); s.absarc(x0, y1, rr, Math.PI / 2, Math.PI, false); s.lineTo(-w / 2, y0); s.absarc(x0, y0, rr, Math.PI, Math.PI * 1.5, false);
  const g = new THREE.ExtrudeGeometry(s, { depth: Math.max(0.01, d - rr * 2), bevelEnabled: true, bevelThickness: rr, bevelSize: rr, bevelSegments: 3, curveSegments: 6 });
  g.translate(0, 0, -(d - rr * 2) / 2); g.computeVertexNormals(); rboxCache.set(key, g); return g;
}
// 六邊形的柱子（島的身體）。
function hexPrism(r, h) { const s = new THREE.Shape(); L.hexPoints(0, 0, r).forEach(([x, z], i) => i ? s.lineTo(x, z) : s.moveTo(x, z)); s.closePath(); const g = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: true, bevelThickness: 0.5, bevelSize: 0.5, bevelSegments: 2 }); g.rotateX(Math.PI / 2); g.translate(0, 0.5, 0); return g; }

function colours(p) {
  const C = k => new THREE.Color(p[k]); const mix = (a, b, t) => a.clone().lerp(b, t);
  const navy = C("navy"), teal = C("teal"), orange = C("orange"), sand = C("sand"), cream = C("cream"), yellow = C("yellow"), grey = C("grey"), white = new THREE.Color(1, 1, 1);
  const grass = mix(mix(teal, yellow, 0.55), sand, 0.12).offsetHSL(0, 0.14, 0.02);
  return {
    navy, teal, orange, sand, cream, yellow, grey, white, sky: mix(cream, white, 0.35),
    water: mix(teal, cream, 0.22).offsetHSL(0, 0.08, 0), shallow: mix(teal, cream, 0.5), grass, beach: mix(sand, cream, 0.5), cliff: mix(mix(sand, grey, 0.35), teal, 0.25),
    road: mix(cream, grey, 0.35), wall: mix(cream, white, 0.5), wall2: mix(sand, white, 0.3), wood: mix(mix(sand, navy, 0.35), orange, 0.2), dark: mix(navy, grey, 0.15),
    tree: [mix(mix(teal, yellow, 0.5), navy, 0.1).offsetHSL(0, 0.2, -0.04), mix(mix(teal, yellow, 0.62), sand, 0.08).offsetHSL(0, 0.18, 0), mix(mix(teal, yellow, 0.45), navy, 0.24).offsetHSL(0, 0.2, -0.06)],
    trunk: mix(mix(sand, navy, 0.5), grey, 0.2), cloud: mix(cream, white, 0.7), light: mix(yellow, orange, 0.35),
    skin: [mix(mix(sand, orange, 0.15), white, 0.25), mix(mix(sand, orange, 0.35), white, 0.1), mix(mix(sand, orange, 0.5), navy, 0.08)],
    hair: [mix(navy, grey, 0.1).multiplyScalar(0.35), mix(mix(navy, orange, 0.4), grey, 0.1).multiplyScalar(0.45), mix(navy, grey, 0.05).multiplyScalar(0.25)],
    shirt: [mix(orange, white, 0.15), mix(teal, white, 0.1), mix(yellow, white, 0.2), mix(navy, white, 0.45), mix(cream, white, 0.4), mix(sand, orange, 0.4)],
    pants: [mix(navy, grey, 0.3), mix(mix(sand, grey, 0.4), navy, 0.2), mix(navy, white, 0.3)],
    // 每座島的主色（teams.json 的 colour 對到這裡），屋頂與旗子用它。
    team: { orange: mix(orange, white, 0.12), teal: mix(teal, white, 0.12), navy: mix(navy, white, 0.35), yellow: mix(yellow, orange, 0.3), sand: mix(sand, orange, 0.25), cream: mix(cream, sand, 0.5), grey: mix(grey, navy, 0.2) },
  };
}

export function create({ stage, pins, palette, phone, data, onSelect, onHover, freeCentre, freeWidth }) {
  if (!webglOK()) throw new Error("no webgl");
  const canvas = document.createElement("canvas"); canvas.className = "scene3d"; stage.appendChild(canvas);
  const P = colours(palette);
  const std = (color, extra) => new THREE.MeshStandardMaterial({ color, roughness: 0.82, metalness: 0, ...(extra || {}) });
  const M = { grass: std(P.grass), beach: std(P.beach), cliff: std(P.cliff), road: std(P.road, { roughness: 0.95 }), wall: std(P.wall), wall2: std(P.wall2), wood: std(P.wood), dark: std(P.dark),
    trunk: std(P.trunk), cloud: std(P.cloud, { emissive: P.cloud, emissiveIntensity: 0.25 }), light: std(P.light, { emissive: P.light, emissiveIntensity: 0.9 }), cream: std(P.cream), white: std(P.white), orange: std(P.orange), teal: std(P.teal), navy: std(P.navy), yellow: std(P.yellow),
    shallow: new THREE.MeshStandardMaterial({ color: P.shallow, roughness: 0.6, transparent: true, opacity: 0.85 }), water: new THREE.MeshStandardMaterial({ color: P.water, roughness: 0.35 }),
    tree: P.tree.map(c => std(c)), skin: P.skin.map(c => std(c, { roughness: 0.7 })), hair: P.hair.map(c => std(c, { roughness: 0.9 })), shirt: P.shirt.map(c => std(c)), pants: P.pants.map(c => std(c)), eye: std(P.dark, { roughness: 0.4 }),
    team: Object.fromEntries(Object.entries(P.team).map(([k, c]) => [k, std(c)])) };

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(phone ? 1.25 : 1.5, window.devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.shadowMap.autoUpdate = false;
  const scene = new THREE.Scene(); scene.background = P.sky.clone(); scene.fog = new THREE.Fog(P.sky.clone(), 170, 380);
  const camera = new THREE.PerspectiveCamera(32, 16 / 9, 0.5, 500); scene.add(camera);
  scene.add(new THREE.HemisphereLight(P.white.clone().lerp(P.teal, 0.08), P.sand.clone().lerp(P.grey, 0.4), 1.2));
  const sun = new THREE.DirectionalLight(P.cream.clone().lerp(P.white, 0.5), 2.6); sun.position.set(-40, 70, 30); sun.castShadow = true;
  sun.shadow.mapSize.set(phone ? 1024 : 2048, phone ? 1024 : 2048); sun.shadow.camera.near = 5; sun.shadow.camera.far = 220;
  const sc = sun.shadow.camera; sc.left = -52; sc.right = 52; sc.top = 52; sc.bottom = -52; sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03; sun.shadow.radius = 3; scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight(P.teal.clone().lerp(P.white, 0.6), 0.35); fill.position.set(40, 30, -40); scene.add(fill);
  const world = new THREE.Group(); scene.add(world);
  const rnd = mulberry(11);
  let shadowsDirty = true;

  // ═══ 海 ═══
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), M.water); sea.rotation.x = -Math.PI / 2; sea.position.y = -0.6; sea.receiveShadow = true; world.add(sea);

  // ═══ 七座島 ═══
  const islands = L.islands(); const isleObjs = new Map(); const blockersOf = new Map(); const treePlaces = [];
  const pickables = [];   // 射線打得到的東西：{ obj, sel }
  for (const isl of islands) {
    const tm = data.teams.find(x => x.id === isl.id); if (!tm) continue;
    const g = new THREE.Group(); g.position.set(isl.x, 0, isl.z); world.add(g);
    const fa = (isl.angle || Math.PI / 2); const fx = Math.cos(fa) * (isl.r * 0.62), fz = Math.sin(fa) * (isl.r * 0.62);
    let flag;
    if (isl.sea) {
      // 海上的機場：一塊水泥平台架在柱子上，沒有草、沒有樹、沒有旗，只有一支風向袋。
      const deck = new THREE.Mesh(rbox(isl.r * 2.3, 1.2, isl.r * 1.5, 0.3), M.road); deck.position.y = -0.6; deck.receiveShadow = true; deck.castShadow = true; deck.userData.sel = { kind: "team", team: isl.id }; g.add(deck); pickables.push(deck);
      for (const x of [-8, 0, 8]) for (const z of [-5, 5]) { const post = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 3, 8), M.dark); post.position.set(x, -2.4, z); g.add(post); }
      const edge_ = new THREE.Mesh(rbox(isl.r * 2.3 + 0.4, 0.2, isl.r * 1.5 + 0.4, 0.1), M.cream); edge_.position.y = -0.05; g.add(edge_);
      const sock = new THREE.Group(); sock.position.set(isl.r * 0.95, 0, -isl.r * 0.55); g.add(sock);
      sock.add(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 3, 6), M.dark).translateY(1.5), new THREE.Mesh(new THREE.ConeGeometry(0.35, 1.4, 8), M.orange).translateY(3.1).rotateZ(-Math.PI / 2).translateY(0.3));
      flag = sock.children[1];
    } else {
      const body = new THREE.Mesh(hexPrism(isl.r, 2.6), M.cliff); body.position.y = -2.6; body.receiveShadow = true; g.add(body);
      const top = new THREE.Mesh(hexPrism(isl.r - 0.1, 0.3), M.grass); top.position.y = -0.3; top.receiveShadow = true; top.userData.sel = { kind: "team", team: isl.id }; g.add(top); pickables.push(top);
      const rim = new THREE.Mesh(new THREE.RingGeometry(isl.r - 1.2, isl.r + 0.1, 6, 1, Math.PI / 6), M.beach); rim.rotation.x = -Math.PI / 2; rim.position.y = 0.02; g.add(rim);
      const shallow = new THREE.Mesh(new THREE.CircleGeometry(isl.r + 3.5, 6, Math.PI / 6), M.shallow); shallow.rotation.x = -Math.PI / 2; shallow.position.y = -0.5; g.add(shallow);
      // 旗桿加旗子（team 的顏色）在島的後方。聚會所的旗是奶油色。
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 5, 8), M.dark); pole.position.set(fx, 2.5, fz); pole.castShadow = true; g.add(pole);
      flag = new THREE.Mesh(rbox(1.8, 1.0, 0.06, 0.03), M.team[tm.colour]); flag.position.set(fx + 0.95, 4.4, fz); flag.castShadow = true; g.add(flag);
    }
    flag.userData.flag = true;
    // 做的事：一樣一棟。
    const spots = L.programSpots({ id: isl.id, x: 0, z: 0, r: isl.r, angle: isl.angle }, tm.programs.length); const blockers = [{ x: fx, z: fz }];
    tm.programs.forEach((p, k) => { const sp = spots[k]; const b = building(p.kind, M.team[tm.colour]); b.position.set(sp.x, 0, sp.z); b.rotation.y = sp.face; g.add(b); blockers.push({ x: sp.x, z: sp.z });
      b.traverse(o => { if (o.isMesh) { o.userData.sel = { kind: "program", team: tm.id, program: p.id }; pickables.push(o); } });
      const pin = document.createElement("button"); pin.type = "button"; pin.className = "pin pin-prog"; pin.dataset.goProgram = p.id; pin.dataset.team = tm.id; pin.hidden = true; pins.appendChild(pin);
      b.userData.pin = pin; b.userData.program = p; });
    // 樹（機場沒有）：位置先記下來，所有島的樹最後一次畫完（InstancedMesh）。
    for (let i = 0; i < (isl.sea ? 0 : (phone ? 5 : 8)); i++) { const a = rnd() * TAU, d = isl.r * (0.45 + rnd() * 0.4); const x = Math.cos(a) * d, z = Math.sin(a) * d; if (blockers.some(bk => Math.hypot(x - bk.x, z - bk.z) < 2.6)) continue;
      treePlaces.push([isl.x + x, isl.z + z, 0.55 + rnd() * 0.45, i % 3]); blockers.push({ x, z }); }
    // 島名的牌子（HTML）
    const pin = document.createElement("button"); pin.type = "button"; pin.className = "pin pin-team c-" + tm.colour; pin.dataset.goTeam = tm.id; pins.appendChild(pin);
    isleObjs.set(isl.id, { isl, tm, g, pin, flag, buildings: g.children.filter(c => c.userData.program) }); blockersOf.set(isl.id, blockers);
  }
  { const m = new THREE.Matrix4(), s3 = new THREE.Vector3(), q = new THREE.Quaternion();
    const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.12, 0.16, 0.8, 6), M.trunk, treePlaces.length);
    const crowns = [0, 1, 2].map(k => new THREE.InstancedMesh(new THREE.SphereGeometry(0.8, 12, 9), M.tree[k], treePlaces.length));
    const none = new THREE.Matrix4().makeScale(0.001, 0.001, 0.001);
    treePlaces.forEach(([x, z, sc_, k], i) => { s3.setScalar(sc_); m.compose(new THREE.Vector3(x, 0.4 * sc_, z), q, s3); trunks.setMatrixAt(i, m); crowns.forEach((c, kk) => { if (kk === k) { m.compose(new THREE.Vector3(x, 1.35 * sc_, z), q, s3); c.setMatrixAt(i, m); } else c.setMatrixAt(i, none); }); });
    trunks.instanceMatrix.needsUpdate = true; world.add(trunks); crowns.forEach(c => { c.instanceMatrix.needsUpdate = true; c.castShadow = true; world.add(c); }); }
  // 橋：中間到每一座。欄杆的柱子一次畫完（InstancedMesh）。
  const postPlaces = [];
  for (const br of L.bridges()) { const dx = br.x1 - br.x0, dz = br.z1 - br.z0, len = Math.hypot(dx, dz); const b = new THREE.Mesh(rbox(len, 0.28, 2.2, 0.08), M.wood); b.position.set((br.x0 + br.x1) / 2, 0.1, (br.z0 + br.z1) / 2); b.rotation.y = -Math.atan2(dz, dx); b.castShadow = true; b.receiveShadow = true; world.add(b);
    for (let s = 2; s < len - 1; s += 3) for (const side of [-1, 1]) { const tt = s / len; postPlaces.push([br.x0 + dx * tt + (-dz / len) * side * 1.0, 0.5, br.z0 + dz * tt + (dx / len) * side * 1.0]); } }
  { const im = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.07, 0.07, 0.9, 6), M.dark, postPlaces.length); const m = new THREE.Matrix4(); postPlaces.forEach((pp, i) => { m.makeTranslation(pp[0], pp[1], pp[2]); im.setMatrixAt(i, m); }); im.instanceMatrix.needsUpdate = true; world.add(im); }
  // 協作線：島跟島之間一條拱起來的細管（橘色），全景時收起，開了「協作線」或選了那座島才亮。
  const lines = [];
  for (const c of data.connections || []) {
    const A = L.islandOf(c.a), B = L.islandOf(c.b); if (!A || !B) continue;
    const mid = new THREE.Vector3((A.x + B.x) / 2, 4 + Math.hypot(B.x - A.x, B.z - A.z) * 0.14, (A.z + B.z) / 2);
    const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(A.x, 1.2, A.z), mid, new THREE.Vector3(B.x, 1.2, B.z));
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.14, 6, false), new THREE.MeshStandardMaterial({ color: P.orange, emissive: P.orange, emissiveIntensity: 0.6, roughness: 0.6 }));
    tube.visible = false; world.add(tube); lines.push({ a: c.a, b: c.b, mesh: tube });
  }
  // 雲
  const clouds = [];
  for (let i = 0; i < 8; i++) { const g = new THREE.Group(); const a = rnd() * TAU, d = 70 + rnd() * 40; g.position.set(Math.cos(a) * d, 26 + rnd() * 8, Math.sin(a) * d); for (let k = 0; k < 4; k++) { const b = new THREE.Mesh(new THREE.SphereGeometry(1.4 + rnd() * 1.4, 10, 8), M.cloud); b.position.set(k * 1.8 - 2.7, rnd() * 0.5, rnd() * 0.8); g.add(b); } g.userData.drift = 0.25 + rnd() * 0.3; world.add(g); clouds.push(g); }

  // ═══ 建築 ═══
  function house(w, h, d, wallM, roofM) { const g = new THREE.Group(); const b = new THREE.Mesh(rbox(w, h, d, 0.12), wallM); b.position.y = h / 2; b.castShadow = true; b.receiveShadow = true; g.add(b); const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, d) * 0.78, h * 0.6, 4), roofM); roof.position.y = h + h * 0.3; roof.rotation.y = Math.PI / 4; roof.castShadow = true; g.add(roof); return g; }
  function win(g, n, y, z, spread) { for (let i = 0; i < n; i++) { const wm = new THREE.Mesh(rbox(0.5, 0.5, 0.08, 0.06), M.light); wm.position.set((i - (n - 1) / 2) * spread, y, z); g.add(wm); } }
  function building(kind, roofM) {
    const g = new THREE.Group();
    if (kind === "hall") { const h = house(4, 2.2, 2.8, M.wall2, roofM); win(h, 3, 1.3, 1.44, 1.0); g.add(h); }
    else if (kind === "tent") { for (const [x, m] of [[-1.3, roofM], [1.3, M.yellow]]) { const t = new THREE.Mesh(new THREE.ConeGeometry(1.5, 1.9, 4), m); t.position.set(x, 0.95, 0); t.rotation.y = Math.PI / 4; t.castShadow = true; g.add(t); } }
    else if (kind === "booth") { const b = new THREE.Mesh(rbox(2.2, 2.0, 1.6, 0.14), M.wall); b.position.y = 1.0; b.castShadow = true; g.add(b); const roof = new THREE.Mesh(rbox(2.8, 0.2, 2.2, 0.06), roofM); roof.position.y = 2.1; roof.castShadow = true; g.add(roof); win(b, 2, 0.1, 0.84, 0.9); }
    else if (kind === "desk") { const h = house(3.2, 2.0, 2.6, M.wall, roofM); win(h, 2, 1.2, 1.34, 1.2); g.add(h); for (let i = 0; i < 3; i++) { const bk = new THREE.Mesh(rbox(0.5, 0.8 - i * 0.1, 0.3, 0.04), [M.navy, M.teal, M.orange][i]); bk.position.set(-2.2 + i * 0.55, 0.4, 0.8); bk.castShadow = true; g.add(bk); } }
    else if (kind === "home") { const h = house(3.4, 2.4, 3, M.wall2, roofM); win(h, 2, 1.4, 1.54, 1.4); g.add(h); const chim = new THREE.Mesh(rbox(0.5, 1.0, 0.5, 0.06), M.wall); chim.position.set(1.1, 3.1, -0.6); h.add(chim); }
    else if (kind === "post") { const bx = new THREE.Mesh(rbox(0.9, 1.5, 0.9, 0.2), roofM); bx.position.y = 1.05; bx.castShadow = true; g.add(bx); const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.4, 8), M.dark); leg.position.y = 0.2; g.add(leg); const sign = new THREE.Mesh(rbox(1.6, 0.9, 0.1, 0.06), M.cream); sign.position.set(1.6, 1.4, 0); sign.castShadow = true; g.add(sign); const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.0, 6), M.dark); sp.position.set(1.6, 0.5, 0); g.add(sp); }
    else if (kind === "pier") { const deck = new THREE.Mesh(rbox(3.6, 0.3, 1.8, 0.08), M.wood); deck.position.y = 0.2; deck.castShadow = true; g.add(deck); const booth = new THREE.Mesh(rbox(1.4, 1.6, 1.2, 0.12), M.wall); booth.position.set(-0.9, 1.1, 0); booth.castShadow = true; g.add(booth); const roof = new THREE.Mesh(rbox(1.8, 0.18, 1.6, 0.05), roofM); roof.position.set(-0.9, 2.0, 0); g.add(roof); const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), M.light); lamp.position.set(1.3, 2.0, -0.5); g.add(lamp); const lp = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 1.7, 6), M.dark); lp.position.set(1.3, 1.15, -0.5); g.add(lp); }
    else if (kind === "camp") {
      // Retreat：一圈石頭圍著營火，四張長凳。
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.18, 6, 12), M.dark); ring.rotation.x = Math.PI / 2; ring.position.y = 0.15; g.add(ring);
      const fire = new THREE.Mesh(new THREE.ConeGeometry(0.45, 1.0, 7), M.light); fire.position.y = 0.6; g.add(fire);
      for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + Math.PI / 4; const b = new THREE.Mesh(rbox(2.0, 0.3, 0.5, 0.08), M.wood); b.position.set(Math.cos(a) * 2.3, 0.45, Math.sin(a) * 2.3); b.rotation.y = -a + Math.PI / 2; b.castShadow = true; g.add(b); for (const dx of [-0.7, 0.7]) { const leg = new THREE.Mesh(rbox(0.2, 0.3, 0.4, 0.04), M.dark); leg.position.set(Math.cos(a) * 2.3 + Math.cos(a + Math.PI / 2) * dx, 0.15, Math.sin(a) * 2.3 + Math.sin(a + Math.PI / 2) * dx); g.add(leg); } }
      const tent = new THREE.Mesh(new THREE.ConeGeometry(1.4, 1.8, 4), M.teal); tent.position.set(-3.2, 0.9, -1.5); tent.rotation.y = Math.PI / 4; tent.castShadow = true; g.add(tent);
    }
    else if (kind === "airport") {
      // 一條跑道、一座小塔台、一架停著的小飛機。跑道橫過整座島，所以這一樣東西比別的大。
      const run = new THREE.Mesh(rbox(13, 0.12, 2.6, 0.05), M.road); run.position.y = 0.06; run.receiveShadow = true; g.add(run);
      for (let x = -5.5; x <= 5.5; x += 1.4) { const dash = new THREE.Mesh(rbox(0.7, 0.03, 0.18, 0.01), M.cream); dash.position.set(x, 0.13, 0); g.add(dash); }
      for (const x of [-6.2, 6.2]) for (const z of [-1.5, 1.5]) { const l = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), M.light); l.position.set(x, 0.2, z); g.add(l); }
      const tw = new THREE.Group(); tw.position.set(0, 0, -3.4); g.add(tw);
      tw.add(new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 3.2, 10), M.wall).translateY(1.6), new THREE.Mesh(new THREE.CylinderGeometry(1.1, 0.8, 0.9, 10), roofM).translateY(3.6), new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, 0.5, 10), M.dark).translateY(4.2));
      const pl = new THREE.Group(); pl.position.set(2.2, 0.75, 0); g.add(pl);
      pl.add(new THREE.Mesh(rbox(3.0, 0.75, 0.85, 0.32), M.cream), new THREE.Mesh(rbox(0.9, 0.1, 4.0, 0.05), M.teal).translateY(0.15), new THREE.Mesh(rbox(0.6, 0.75, 0.1, 0.05), M.orange).translateX(-1.3).translateY(0.6), new THREE.Mesh(rbox(0.5, 0.08, 1.5, 0.04), M.orange).translateX(-1.3).translateY(0.25), new THREE.Mesh(rbox(0.7, 0.28, 0.87, 0.1), M.dark).translateX(0.8).translateY(0.12));
      for (const [x, z] of [[0.9, -0.35], [0.9, 0.35], [-0.6, 0]]) { const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.12, 8), M.dark); wh.rotation.x = Math.PI / 2; wh.position.set(x, -0.5, z); pl.add(wh); }
      g.traverse(m => { if (m.isMesh) m.castShadow = true; });
    }
    else { /* tower */ const base = new THREE.Mesh(rbox(2.6, 3.4, 2.6, 0.2), M.wall); base.position.y = 1.7; base.castShadow = true; g.add(base); const cap = new THREE.Mesh(new THREE.ConeGeometry(2.0, 1.4, 4), roofM); cap.position.y = 4.1; cap.rotation.y = Math.PI / 4; cap.castShadow = true; g.add(cap); win(base, 2, 2.4, 1.34, 1.0); win(base, 2, 1.2, 1.34, 1.0); const clock = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.1, 16), M.cream); clock.rotation.x = Math.PI / 2; clock.position.set(0, 2.9, 1.36); g.add(clock); }
    return g;
  }

  // ═══ 人：大頭 chibi ═══
  const PG = { head: new THREE.SphereGeometry(0.36, 16, 12), cap: new THREE.SphereGeometry(0.38, 16, 8, 0, TAU, 0, Math.PI * 0.52), eye: new THREE.SphereGeometry(0.045, 8, 6), body: new THREE.CapsuleGeometry(0.24, 0.3, 4, 10), arm: new THREE.CapsuleGeometry(0.075, 0.26, 3, 8), leg: rbox(0.2, 0.3, 0.22, 0.07), pack: rbox(0.34, 0.4, 0.18, 0.06), bag: rbox(0.5, 0.42, 0.26, 0.06), hat: new THREE.CylinderGeometry(0.4, 0.4, 0.12, 14), shadow: new THREE.CircleGeometry(0.38, 16) };
  PG.shadow.rotateX(-Math.PI / 2);
  const shadowMat = new THREE.MeshBasicMaterial({ color: P.navy, transparent: true, opacity: 0.12, depthWrite: false });
  function makePerson(o) {
    o = o || {}; const g = new THREE.Group();
    const skin = M.skin[(o.skin || 0) % 3], hair = M.hair[(o.hair || 0) % 3], shirt = M.shirt[(o.shirt || 0) % 6], pants = M.pants[(o.pants || 0) % 3];
    const legL = new THREE.Mesh(PG.leg, pants), legR = new THREE.Mesh(PG.leg, pants); legL.position.set(-0.13, 0.15, 0); legR.position.set(0.13, 0.15, 0); legL.name = "legL"; legR.name = "legR"; g.add(legL, legR);
    const body = new THREE.Mesh(PG.body, shirt); body.position.y = 0.62; g.add(body);
    const armL = new THREE.Mesh(PG.arm, shirt), armR = new THREE.Mesh(PG.arm, shirt); armL.position.set(-0.33, 0.68, 0); armR.position.set(0.33, 0.68, 0); armL.name = "armL"; armR.name = "armR"; g.add(armL, armR);
    const head = new THREE.Mesh(PG.head, skin); head.position.y = 1.2; head.name = "head"; g.add(head);
    const cap = new THREE.Mesh(PG.cap, hair); cap.position.y = 1.23; cap.rotation.x = -0.25; g.add(cap);
    for (const sx of [-1, 1]) { const e = new THREE.Mesh(PG.eye, M.eye); e.position.set(sx * 0.13, 1.2, 0.33); g.add(e); }
    if (o.pack) { const pk = new THREE.Mesh(PG.pack, M.orange); pk.position.set(0, 0.7, -0.3); g.add(pk); }
    if (o.bag) { const bg = new THREE.Mesh(PG.bag, M.navy); bg.position.set(0.42, 0.21, 0); g.add(bg); }
    if (o.hat) { const h = new THREE.Mesh(PG.hat, M.navy); h.position.y = 1.5; g.add(h); }
    const sh = new THREE.Mesh(PG.shadow, shadowMat); sh.position.y = 0.02; g.add(sh);
    g.userData = { phase: rnd() * 6, moving: false, baseY: 0 };   // 人不投影：陰影貼圖是靜的，走動的人用腳下那一圈就好
    return g;
  }
  function pose(g, t) {
    const u = g.userData, legL = g.getObjectByName("legL"), legR = g.getObjectByName("legR"), armL = g.getObjectByName("armL"), armR = g.getObjectByName("armR"), head = g.getObjectByName("head");
    if (u.moving) { const s = Math.sin(t * 9 + u.phase); legL.rotation.x = s * 0.6; legR.rotation.x = -s * 0.6; armL.rotation.x = -s * 0.5; armR.rotation.x = s * 0.5; g.position.y = u.baseY + Math.abs(Math.cos(t * 9 + u.phase)) * 0.05; }
    else { legL.rotation.x = 0; legR.rotation.x = 0; armL.rotation.x = 0.05; armR.rotation.x = -0.05; g.position.y = u.baseY + Math.sin(t * 1.6 + u.phase) * 0.012; }
    head.rotation.y = Math.sin(t * 0.7 + u.phase) * 0.12;
  }
  // 每個人：站在自己的島上，偶爾走到島上另一個點。
  const walkers = [];
  function addWalker(person, opts) {
    const isl = L.islandOf(person.team); const o = opts || {};
    const g = makePerson({ skin: o.skin != null ? o.skin : walkers.length % 3, hair: o.hair != null ? o.hair : (walkers.length * 7) % 3, shirt: o.shirt != null ? o.shirt : (walkers.length * 5) % 6, pants: walkers.length % 3,
      hat: person.role === "copresident", pack: person.role === "director" || person.role === "student", bag: person.role === "advisor" });
    const start = L.wanderTarget(isl, blockersOf.get(person.team), rnd); g.position.set(start.x, 0, start.z); g.rotation.y = rnd() * TAU; world.add(g);
    g.traverse(m => { if (m.isMesh) { m.userData.sel = { kind: "person", code: person.code }; pickables.push(m); } });
    const pin = document.createElement("button"); pin.type = "button"; pin.className = "pin pin-person" + (o.me ? " is-me" : ""); pin.dataset.goPerson = person.code; pin.hidden = true; pins.appendChild(pin);
    const w = { person, g, pin, isl, home: isl, target: start, wait: rnd() * 4 + 1, me: !!o.me, label: "", trips: 0, path: null, pathI: 0, away: false }; walkers.push(w); shadowsDirty = true; return w;
  }
  for (const p of data.people) addWalker(p);
  function removeWalker(w) { world.remove(w.g); w.pin.remove(); const i = walkers.indexOf(w); if (i >= 0) walkers.splice(i, 1); for (let k = pickables.length - 1; k >= 0; k--) if (pickables[k].userData.sel && pickables[k].userData.sel.code === w.person.code) pickables.splice(k, 1); shadowsDirty = true; }

  // ═══ 鏡頭：拖曳轉、滾輪縮，每一幀阻尼追目標 ═══
  const cam = { pos: new THREE.Vector3(), tgt: new THREE.Vector3(), goalPos: new THREE.Vector3(), goalTgt: new THREE.Vector3(), yaw: 0, pitch: 0, dist: 0 };
  // 卡在左、清單在右：島要落在中間空出來的那一塊，不是視窗正中央。freeCentre() 回空出來那一塊的中心佔視窗寬的比例（0.5 就是正中央）。
  const setGoal = (c, centre) => {
    cam.goalPos.set(...c.pos); cam.goalTgt.set(...c.target);
    // 全景：距離照畫面空出來那一塊的長寬算，九座島都要進來（島群橫的半徑約 66、直的約 48，鏡頭斜看直的會縮）。
    if (c.fit) {
      const frac = typeof freeWidth === "function" ? freeWidth() : 1, tanH = Math.tan(camera.fov * Math.PI / 360), aspectFree = camera.aspect * frac;
      const D = Math.max(c.fit[0] / (tanH * aspectFree), c.fit[1] / tanH) * 0.98;
      const dir = cam.goalPos.clone().sub(cam.goalTgt).normalize(); cam.goalPos.copy(cam.goalTgt).addScaledVector(dir, D);
    }
    if (centre) {
      const f = (typeof freeCentre === "function" ? freeCentre() : 0.5) - 0.5; if (Math.abs(f) < 0.01) return;
      const dir = cam.goalTgt.clone().sub(cam.goalPos); const right = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
      const dist = dir.length(), halfW = Math.tan(camera.fov * Math.PI / 360) * dist * camera.aspect;   // 目標那個深度，視窗一半有多寬
      const shift = right.multiplyScalar(-f * 2 * halfW); cam.goalPos.add(shift); cam.goalTgt.add(shift);
    }
  };
  setGoal(L.cameraOverview(phone), true); cam.pos.copy(cam.goalPos); cam.tgt.copy(cam.goalTgt);
  function placeCam() { camera.position.copy(cam.pos); camera.lookAt(cam.tgt); }
  // 拖曳：繞著目標點轉（改 goalPos 的方位角與仰角），滾輪：改距離。
  let drag = null, dragged = false;
  function orbitBy(dyaw, dpitch, dzoom) {
    const off = cam.goalPos.clone().sub(cam.goalTgt); const r = off.length(); let yaw = Math.atan2(off.x, off.z), pitch = Math.asin(off.y / r);
    yaw += dyaw; pitch = Math.min(1.45, Math.max(0.35, pitch + dpitch)); const nr = Math.min(130, Math.max(14, r * (dzoom || 1)));
    cam.goalPos.set(cam.goalTgt.x + Math.sin(yaw) * Math.cos(pitch) * nr, cam.goalTgt.y + Math.sin(pitch) * nr, cam.goalTgt.z + Math.cos(yaw) * Math.cos(pitch) * nr);
  }
  canvas.addEventListener("pointerdown", e => { drag = { x: e.clientX, y: e.clientY, id: e.pointerId }; dragged = false; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener("pointermove", e => {
    if (drag && e.pointerId === drag.id) { const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (Math.abs(dx) + Math.abs(dy) > 3) dragged = true; if (dragged) { orbitBy(-dx * 0.005, dy * 0.004); drag.x = e.clientX; drag.y = e.clientY; if (!motionOn) snapCam(); } return; }
    const h = hit(e); setHover(h ? h.sel : null);
  });
  canvas.addEventListener("pointerup", e => { if (!drag) return; canvas.releasePointerCapture(e.pointerId); const was = dragged; drag = null; if (was) return; const h = hit(e); if (h && onSelect) onSelect(h.sel); else if (!h && onSelect) onSelect(null); });
  canvas.addEventListener("pointercancel", () => { drag = null; });
  canvas.addEventListener("wheel", e => { e.preventDefault(); orbitBy(0, 0, Math.exp(e.deltaY * 0.0012)); if (!motionOn) snapCam(); }, { passive: false });
  // 兩指縮放（手機）
  let pinch = null;
  canvas.addEventListener("touchstart", e => { if (e.touches.length === 2) { drag = null; pinch = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY); } }, { passive: true });
  canvas.addEventListener("touchmove", e => { if (pinch && e.touches.length === 2) { const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY); orbitBy(0, 0, pinch / d); pinch = d; if (!motionOn) snapCam(); } }, { passive: true });
  canvas.addEventListener("touchend", () => { pinch = null; }, { passive: true });

  // ═══ 射線、懸停、牌子 ═══
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  function hit(e) { const r = canvas.getBoundingClientRect(); ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); ray.setFromCamera(ndc, camera); const hs = ray.intersectObjects(pickables, false); return hs.length ? { sel: hs[0].object.userData.sel } : null; }
  let hoverSel = null;
  function setHover(sel) { const key = sel ? JSON.stringify(sel) : ""; if (key === (hoverSel ? JSON.stringify(hoverSel) : "")) return; hoverSel = sel; canvas.style.cursor = sel ? "pointer" : ""; if (onHover) onHover(sel); }
  const v3 = new THREE.Vector3();
  function project(x, y, z) { v3.set(x, y, z).project(camera); const w = stage.clientWidth, h = stage.clientHeight; return { x: (v3.x + 1) / 2 * w, y: (1 - v3.y) / 2 * h, visible: v3.z < 1 && Math.abs(v3.x) < 1.2 && Math.abs(v3.y) < 1.2 }; }
  function putPin(pin, p, dy) {
    if (!p.visible) { if (pin.dataset.v !== "0") { pin.style.opacity = 0; pin.dataset.v = "0"; } return; }
    const x = Math.round(p.x * 2) / 2, y = Math.round((p.y + (dy || 0)) * 2) / 2;
    if (pin.dataset.v === "1" && Math.abs(x - (+pin.dataset.x || 0)) < 0.5 && Math.abs(y - (+pin.dataset.y || 0)) < 0.5) return;
    pin.dataset.v = "1"; pin.dataset.x = x; pin.dataset.y = y; pin.style.opacity = 1;
    pin.style.transform = `translate(-50%,-100%) translate3d(${x}px,${y}px,0)`;
  }
  const show = { names: false, selectedTeam: "", flows: false };
  function paintLines() { for (const l of lines) l.mesh.visible = show.flows || (!!show.selectedTeam && (l.a === show.selectedTeam || l.b === show.selectedTeam)); }
  function placePins() {
    for (const o of isleObjs.values()) { putPin(o.pin, project(o.isl.x, 7.2, o.isl.z)); if (o.evPin) putPin(o.evPin, project(o.isl.x, 7.2, o.isl.z), 34); for (const b of o.buildings) { b.userData.pin.hidden = show.selectedTeam !== o.isl.id; if (!b.userData.pin.hidden) putPin(b.userData.pin, project(o.isl.x + b.position.x, 4.4, o.isl.z + b.position.z)); } }
    for (const w of walkers) { const on = show.names || w.me || show.selectedTeam === w.person.team; w.pin.hidden = !on; if (on) putPin(w.pin, project(w.g.position.x, 2.0, w.g.position.z)); }
  }
  function resize() { const w = stage.clientWidth || 300, h = stage.clientHeight || 200; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
  function render(t) { if (shadowsDirty) { renderer.shadowMap.needsUpdate = true; shadowsDirty = false; } renderer.render(scene, camera); placePins(); void t; }
  function snapCam() { cam.pos.copy(cam.goalPos); cam.tgt.copy(cam.goalTgt); placeCam(); render(0); }
  resize(); placeCam(); render(0);
  if ("ResizeObserver" in window) new ResizeObserver(() => { resize(); render(0); }).observe(stage);
  let motionOn = false;

  const api = {
    // 牌子上的字（語言換了 main.js 會再叫一次）。
    labels({ teams, people, me }) {
      for (const o of isleObjs.values()) o.pin.textContent = teams[o.isl.id] || "";
      for (const o of isleObjs.values()) for (const b of o.buildings) b.userData.pin.textContent = (people.programs && people.programs[b.userData.program.id]) || "";
      for (const w of walkers) w.pin.textContent = w.me ? (me || w.person.code) : (people[w.person.code] || "");
      placePins();
    },
    select(sel) {
      show.selectedTeam = sel && sel.team ? sel.team : (sel && sel.kind === "person" ? (walkers.find(w => w.person.code === sel.code) || {}).person?.team || "" : "");
      for (const o of isleObjs.values()) { const on = o.isl.id === show.selectedTeam; o.pin.classList.toggle("on", on); o.flag.material = on ? M.light : M.team[o.tm.colour]; }
      for (const w of walkers) w.pin.classList.toggle("on", !!(sel && sel.kind === "person" && sel.code === w.person.code));
      paintLines();
      for (const o of isleObjs.values()) for (const b of o.buildings) b.userData.pin.classList.toggle("on", !!(sel && sel.kind === "program" && sel.program === b.userData.program.id));
      shadowsDirty = true;
      if (!sel) setGoal(L.cameraOverview(phone), true);
      else if (sel.kind === "person") { const w = walkers.find(x => x.person.code === sel.code); if (w) setGoal(L.cameraIsland(w.isl, phone), true); }
      else setGoal(L.cameraIsland(L.islandOf(sel.team), phone), true);
      if (!motionOn) snapCam(); else placePins();
    },
    flows(on) { show.flows = !!on; paintLines(); if (!motionOn) render(0); },
    overview() { show.selectedTeam = ""; paintLines(); for (const o of isleObjs.values()) { o.pin.classList.remove("on"); o.flag.material = M.team[o.tm.colour]; } setGoal(L.cameraOverview(phone), true); if (!motionOn) snapCam(); },
    bird(on) { setGoal(on ? L.cameraBird(phone) : L.cameraOverview(phone), true); if (!motionOn) snapCam(); },
    names(on) { show.names = !!on; placePins(); },
    // 「我」：放一個人到那座島上；再叫一次就換；傳 null 就拿掉。
    me(info) {
      const old = walkers.find(w => w.me); if (old) removeWalker(old);
      if (!info) { if (!motionOn) render(0); return null; }
      const w = addWalker({ code: "me", team: info.team, role: "associate" }, { me: true, shirt: info.shirt, hair: info.hair, skin: 1 });
      w.pin.textContent = info.label || info.name; if (!motionOn) render(0); return w;
    },
    // 報名開著的活動：那座島上多一塊橘色的「報名中」牌子，按了直接去報名。
    events(list) {
      for (const o of isleObjs.values()) { if (o.evPin) { o.evPin.remove(); o.evPin = null; } }
      for (const e of list || []) { const o = isleObjs.get(e.team); if (!o || o.evPin) continue; const a = document.createElement("a"); a.className = "pin pin-event"; a.href = e.link; a.textContent = e.title; pins.appendChild(a); o.evPin = a; }
      placePins();
    },
    // 人換了一批（真的校友從資料庫來）：拿掉 sample 的校友、加新的。
    people(list) {
      for (const w of walkers.slice()) if (w.person.role === "alumni" && !list.some(p => p.code === w.person.code)) removeWalker(w);
      for (const p of list) if (!walkers.some(w => w.person.code === p.code)) addWalker(p);
      if (!motionOn) render(0);
    },
    render: () => render(0),
    motion() { motionOn = true; return motion({ cam, placeCam, render, walkers, clouds, pose, blockersOf, rnd }); },
  };
  return api;
}

/* ── 這裡面才有動畫。外面不准有每一幀的迴圈。 ──
   鏡頭用阻尼追目標（1 - e^(-dt·k)）；人偶爾走到島上另一個點；雲慢慢飄。暫停就是不呼叫 tick。 */
function motion({ cam, placeCam, render, walkers, clouds, pose, blockersOf, rnd }) {
  let last = performance.now() / 1000, raf = 0, paused = false, t = 0;
  function tick() {
    raf = requestAnimationFrame(tick);
    const now = performance.now() / 1000, dt = Math.min(0.2, now - last); last = now; if (document.hidden) return;
    const k = 1 - Math.exp(-dt * 3.4); cam.pos.lerp(cam.goalPos, k); cam.tgt.lerp(cam.goalTgt, k); placeCam();
    if (!paused) {
      t += dt;
      for (const w of walkers) {
        const dx = w.target.x - w.g.position.x, dz = w.target.z - w.g.position.z, d = Math.hypot(dx, dz);
        if (d > 0.08) { const sp = Math.min(d, (w.path ? 1.6 : 1.1) * dt); w.g.position.x += dx / d * sp; w.g.position.z += dz / d * sp; w.g.rotation.y = Math.atan2(dx, dz); w.g.userData.moving = true; }
        else if (w.path) {
          // 在路上：走到下一個點；到了終點就換島。
          w.pathI++;
          if (w.pathI < w.path.length) { const [x, z] = w.path[w.pathI]; w.target = { x, z }; }
          else { w.path = null; w.isl = L.islandOf(w.dest) || w.home; w.target = L.wanderTarget(w.isl, blockersOf.get(w.isl.id), rnd); w.wait = 3 + rnd() * 5; }
        }
        else { w.g.userData.moving = false; w.wait -= dt;
          if (w.wait <= 0) {
            w.trips++;
            // 不在家就走回家；在家的話，也參與別座島的人與校友每逛幾次走去那座島，每個人偶爾走去中間的聚會所。
            let to = "";
            if (w.isl.id !== w.home.id) to = w.home.id;
            else if (w.person.goes && w.trips % 4 === 0) to = w.person.goes;
            else if (w.home.id !== "commons" && w.trips % 9 === 5) to = "commons";
            if (to) { const ids = L.route(w.isl.id, to); if (ids.length > 1) { w.path = L.routePoints(ids); w.pathI = 0; w.dest = to; const [x, z] = w.path[0]; w.target = { x, z }; } }
            if (!w.path) { w.target = L.wanderTarget(w.isl, blockersOf.get(w.isl.id), rnd); w.wait = 2 + rnd() * 6; }
          } }
        pose(w.g, t);
      }
      for (const c of clouds) c.position.x += c.userData.drift * dt;
    }
    render(t);
  }
  raf = requestAnimationFrame(tick);
  return { pause(v) { paused = !!v; }, stop() { cancelAnimationFrame(raf); } };
}
