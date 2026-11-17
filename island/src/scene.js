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
function roundPrism(r, h) { const sh = new THREE.Shape(); sh.absarc(0, 0, r, 0, TAU, false); const g = new THREE.ExtrudeGeometry(sh, { depth: h, bevelEnabled: true, bevelThickness: 0.5, bevelSize: 0.5, bevelSegments: 2, curveSegments: 40 }); g.rotateX(Math.PI / 2); g.translate(0, 0.5, 0); return g; }
function rectPrism(r, h) { const w = r * 2.0, d = r * 1.75; const sh = new THREE.Shape(); const rr = 1.6; sh.moveTo(-w / 2 + rr, -d / 2); sh.lineTo(w / 2 - rr, -d / 2); sh.absarc(w / 2 - rr, -d / 2 + rr, rr, -Math.PI / 2, 0, false); sh.lineTo(w / 2, d / 2 - rr); sh.absarc(w / 2 - rr, d / 2 - rr, rr, 0, Math.PI / 2, false); sh.lineTo(-w / 2 + rr, d / 2); sh.absarc(-w / 2 + rr, d / 2 - rr, rr, Math.PI / 2, Math.PI, false); sh.lineTo(-w / 2, -d / 2 + rr); sh.absarc(-w / 2 + rr, -d / 2 + rr, rr, Math.PI, Math.PI * 1.5, false); const g = new THREE.ExtrudeGeometry(sh, { depth: h, bevelEnabled: true, bevelThickness: 0.5, bevelSize: 0.5, bevelSegments: 2, curveSegments: 8 }); g.rotateX(Math.PI / 2); g.translate(0, 0.5, 0); return g; }
// 每座島照 layout.js 的 shape 選一種：六邊形、圓、方（學校的操場）。
function islandPrism(shape, r, h) { return shape === "round" ? roundPrism(r, h) : shape === "rect" ? rectPrism(r, h) : hexPrism(r, h); }
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
  const planes = [];      // 機場的飛機；有 userData.taxi 的那一架在 motion() 裡滑行
  const boards = [];      // Marketing 貼文牆上的三片板子；posts() 把真的圖貼上去
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
      const body = new THREE.Mesh(islandPrism(isl.shape, isl.r, 2.6), M.cliff); body.position.y = -2.6; body.receiveShadow = true; g.add(body);
      const top = new THREE.Mesh(islandPrism(isl.shape, isl.r - 0.1, 0.3), M.grass); top.position.y = -0.3; top.receiveShadow = true; top.userData.sel = { kind: "team", team: isl.id }; g.add(top); pickables.push(top);
      // 沙灘那一圈與淺水：六邊形的島跟著六邊形，圓的跟著圓，方的用淺水就好（操場邊沒有沙灘）。
      const segs = isl.shape === "hex" ? 6 : 40, rot = isl.shape === "hex" ? Math.PI / 6 : 0;
      if (isl.shape !== "rect") { const rim = new THREE.Mesh(new THREE.RingGeometry(isl.r - 1.2, isl.r + 0.1, segs, 1, rot), M.beach); rim.rotation.x = -Math.PI / 2; rim.position.y = 0.02; g.add(rim); }
      const shallow = new THREE.Mesh(isl.shape === "rect" ? rectPrism(isl.r + 2.6, 0.01) : new THREE.CircleGeometry(isl.r + 3.5, segs, rot), M.shallow); if (isl.shape !== "rect") shallow.rotation.x = -Math.PI / 2; shallow.position.y = isl.shape === "rect" ? -1.0 : -0.5; g.add(shallow);
      // 旗桿加旗子（team 的顏色）在島的後方。聚會所的旗是奶油色。
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 5, 8), M.dark); pole.position.set(fx, 2.5, fz); pole.castShadow = true; g.add(pole);
      flag = new THREE.Mesh(rbox(1.8, 1.0, 0.06, 0.03), M.team[tm.colour]); flag.position.set(fx + 0.95, 4.4, fz); flag.castShadow = true; g.add(flag);
    }
    flag.userData.flag = true;
    // 做的事：一樣一棟。
    const spots = L.programSpots({ id: isl.id, x: 0, z: 0, r: isl.r, angle: isl.angle }, tm.programs.length); const blockers = [{ x: fx, z: fz }];
    tm.programs.forEach((p, k) => { const sp = spots[k]; const b = building(p.kind, M.team[tm.colour]); b.position.set(sp.x, 0, sp.z); b.rotation.y = p.kind === "studio" ? 0.15 : sp.face; g.add(b);   // 貼文牆要面向鏡頭（+z），不是面向島心 blockers.push({ x: sp.x, z: sp.z });
      b.traverse(o => { if (o.isMesh) { o.userData.sel = { kind: "program", team: tm.id, program: p.id }; pickables.push(o); } });
      const pin = document.createElement("button"); pin.type = "button"; pin.className = "pin pin-prog"; pin.dataset.goProgram = p.id; pin.dataset.team = tm.id; pin.hidden = true; pins.appendChild(pin);
      b.userData.pin = pin; b.userData.program = p; });
    // 每座島自己的東西（Paul 2026-11-17：每座島要不一樣）：聚會所是遊樂場、Internship 是學校的操場、Curriculum 是露天教室……
    decorate(isl, tm, g, blockers, fa);
    // 樹（機場沒有）：位置先記下來，所有島的樹最後一次畫完（InstancedMesh）。每座島的樹不一樣多（學校的操場最少，Mentorship 的花園最多）。
    const treeN = isl.sea ? 0 : Math.round(({ internship: 3, mentorship: 11, commons: 6, curriculum: 7 }[isl.id] || 8) * (phone ? 0.6 : 1));
    for (let i = 0; i < treeN; i++) { const a = rnd() * TAU, d = isl.r * (0.45 + rnd() * 0.4); const x = Math.cos(a) * d, z = Math.sin(a) * d; if (blockers.some(bk => Math.hypot(x - bk.x, z - bk.z) < 2.6)) continue;
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
      // 幾架飛機（Paul 2026-11-17：「give it a few airplane at the airport」）：一架在跑道上來回滑行（motion() 裡動），兩架停在機坪，一座機棚。
      const taxi = makePlane(M.cream, M.teal); taxi.position.set(-4.5, 0.75, 0); taxi.userData.taxi = { x0: -5.4, x1: 5.4, dir: 1, wait: 0 }; g.add(taxi); planes.push(taxi);
      const p2 = makePlane(M.white, M.orange); p2.position.set(-3.2, 0.75, 3.4); p2.rotation.y = 0.35; g.add(p2);
      const p3 = makePlane(M.cream, M.navy); p3.position.set(1.6, 0.75, 3.6); p3.rotation.y = -0.25; g.add(p3);
      const hg = new THREE.Group(); hg.position.set(5.2, 0, -3.6); g.add(hg);
      hg.add(new THREE.Mesh(rbox(3.4, 2.0, 3.0, 0.14), M.wall).translateY(1.0), new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.7, 3.4, 12, 1, false, 0, Math.PI), roofM).translateY(2.0).rotateZ(Math.PI / 2).rotateY(Math.PI / 2), new THREE.Mesh(rbox(2.2, 1.5, 0.1, 0.05), M.dark).translateY(0.75).translateZ(1.52));
      const cart = new THREE.Group(); cart.position.set(3.2, 0, 1.9); g.add(cart);
      cart.add(new THREE.Mesh(rbox(1.0, 0.35, 0.6, 0.06), M.yellow).translateY(0.35), new THREE.Mesh(rbox(0.5, 0.4, 0.4, 0.05), M.navy).translateY(0.72).translateX(-0.15), new THREE.Mesh(rbox(0.5, 0.35, 0.4, 0.05), M.orange).translateY(0.7).translateX(0.3));
      g.traverse(m => { if (m.isMesh) m.castShadow = true; });
    }
    else if (kind === "school") {
      // 學校：一棟兩層的長樓、兩排窗、門口一面鐘、一支旗。操場在 decorate() 裡。
      const b = new THREE.Mesh(rbox(6.4, 3.2, 2.6, 0.14), M.wall); b.position.y = 1.6; b.castShadow = true; b.receiveShadow = true; g.add(b);
      const roof = new THREE.Mesh(rbox(6.9, 0.25, 3.1, 0.06), roofM); roof.position.y = 3.3; roof.castShadow = true; g.add(roof);
      win(g, 5, 2.4, 1.34, 1.15); win(g, 5, 1.0, 1.34, 1.15);
      const door = new THREE.Mesh(rbox(0.8, 1.3, 0.1, 0.05), M.dark); door.position.set(0, 0.65, 1.33); g.add(door);
      const clock = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.1, 16), M.cream); clock.rotation.x = Math.PI / 2; clock.position.set(0, 3.0, 1.36); g.add(clock);
      const steps = new THREE.Mesh(rbox(1.6, 0.25, 0.8, 0.05), M.road); steps.position.set(0, 0.12, 1.7); g.add(steps);
    }
    else if (kind === "studio") {
      // Marketing 的攝影棚加貼文牆：三塊海報板（Instagram 的貼文，點了看清單）、一支腳架相機、一圈環形燈。
      const wall = new THREE.Mesh(rbox(5.2, 2.6, 0.3, 0.08), M.wall2); wall.position.y = 1.3; wall.castShadow = true; g.add(wall);
      const cap = new THREE.Mesh(rbox(5.6, 0.2, 0.7, 0.05), roofM); cap.position.y = 2.7; g.add(cap);
      [[M.orange, M.teal], [M.teal, M.yellow], [M.navy, M.orange]].forEach(([a, b2], i) => {
        const x = (i - 1) * 1.65; const board = new THREE.Mesh(rbox(1.4, 1.6, 0.08, 0.04), M.white); board.position.set(x, 1.45, 0.2); g.add(board);
        const pic = new THREE.Mesh(rbox(1.2, 1.0, 0.04, 0.03), a); pic.position.set(x, 1.65, 0.26); g.add(pic);
        // 真的圖貼在板子前面那一片（posts() 來了才換；沒有圖就留顏色）。
        const photo = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.0), new THREE.MeshBasicMaterial({ color: P.white })); photo.position.set(x, 1.65, 0.29); photo.visible = false; g.add(photo); boards.push(photo);
        const bar = new THREE.Mesh(rbox(0.9, 0.12, 0.04, 0.02), b2); bar.position.set(x - 0.1, 0.95, 0.26); g.add(bar);
        const heart = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), M.orange); heart.position.set(x + 0.45, 0.95, 0.27); g.add(heart);
      });
      const tri = new THREE.Group(); tri.position.set(-2.2, 0, 1.9); g.add(tri);
      for (const a of [0, 2.1, 4.2]) { const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.5, 6), M.dark); leg.position.set(Math.cos(a) * 0.35, 0.72, Math.sin(a) * 0.35); leg.rotation.z = Math.cos(a) * 0.25; leg.rotation.x = -Math.sin(a) * 0.25; tri.add(leg); }
      tri.add(new THREE.Mesh(rbox(0.6, 0.4, 0.4, 0.08), M.dark).translateY(1.65), new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 0.3, 10), M.navy).translateY(1.65).translateZ(-0.33).rotateX(Math.PI / 2));
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.07, 8, 24), M.light); ring.position.set(2.3, 1.7, 1.6); g.add(ring);
      const rp = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 1.7, 6), M.dark); rp.position.set(2.3, 0.85, 1.6); g.add(rp);
    }
    else if (kind === "stage") {
      // Community Relations 的校園講座：一座涼亭式的小舞台，六根柱子、一個圓錐屋頂、台前三排小椅子。
      const base = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.3, 0.4, 12), M.wood); base.position.y = 0.2; base.castShadow = true; g.add(base);
      for (let k = 0; k < 6; k++) { const a = k * TAU / 6; const c = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 2.2, 8), M.cream); c.position.set(Math.cos(a) * 1.7, 1.5, Math.sin(a) * 1.7); g.add(c); }
      const roof = new THREE.Mesh(new THREE.ConeGeometry(2.6, 1.3, 6), roofM); roof.position.y = 3.2; roof.castShadow = true; g.add(roof);
      const mic = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.1, 6), M.dark); mic.position.set(0, 0.95, 1.2); g.add(mic); const mh = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), M.navy); mh.position.set(0, 1.5, 1.2); g.add(mh);
      for (let r = 0; r < 3; r++) for (let c = -1; c <= 1; c++) { const ch = new THREE.Mesh(rbox(0.5, 0.35, 0.5, 0.06), [M.teal, M.yellow, M.orange][(r + c + 3) % 3]); ch.position.set(c * 0.8, 0.18, 3.0 + r * 0.85); g.add(ch); }
    }
    else { /* tower */ const base = new THREE.Mesh(rbox(2.6, 3.4, 2.6, 0.2), M.wall); base.position.y = 1.7; base.castShadow = true; g.add(base); const cap = new THREE.Mesh(new THREE.ConeGeometry(2.0, 1.4, 4), roofM); cap.position.y = 4.1; cap.rotation.y = Math.PI / 4; cap.castShadow = true; g.add(cap); win(base, 2, 2.4, 1.34, 1.0); win(base, 2, 1.2, 1.34, 1.0); const clock = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.1, 16), M.cream); clock.rotation.x = Math.PI / 2; clock.position.set(0, 2.9, 1.36); g.add(clock); }
    return g;
  }

  // 一架小飛機（機身、機翼、尾翼、三個輪子）。機場停三架、一架會滑行。
  function makePlane(bodyM, wingM) {
    const pl = new THREE.Group();
    pl.add(new THREE.Mesh(rbox(3.0, 0.75, 0.85, 0.32), bodyM), new THREE.Mesh(rbox(0.9, 0.1, 4.0, 0.05), wingM).translateY(0.15), new THREE.Mesh(rbox(0.6, 0.75, 0.1, 0.05), M.orange).translateX(-1.3).translateY(0.6), new THREE.Mesh(rbox(0.5, 0.08, 1.5, 0.04), M.orange).translateX(-1.3).translateY(0.25), new THREE.Mesh(rbox(0.7, 0.28, 0.87, 0.1), M.dark).translateX(0.8).translateY(0.12));
    const prop = new THREE.Mesh(rbox(0.08, 1.1, 0.12, 0.03), M.dark); prop.position.set(1.55, 0, 0); prop.name = "prop"; pl.add(prop);
    for (const [x, z] of [[0.9, -0.35], [0.9, 0.35], [-0.6, 0]]) { const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.12, 8), M.dark); wh.rotation.x = Math.PI / 2; wh.position.set(x, -0.5, z); pl.add(wh); }
    pl.traverse(m => { if (m.isMesh) m.castShadow = true; });
    return pl;
  }

  // ═══ 每座島自己的東西 ═══
  // 做的事（programs）蓋在島朝向中心那一半；這裡的東西放在另一半（朝外）。
  // 全部都是小東西，只加幾個 mesh；每一樣的位置記進 blockers，人走路會繞開。
  function decorate(isl, tm, g, blockers, fa) {
    if (isl.sea) return;
    const at = (da, dist) => ({ x: Math.cos(fa + da) * dist, z: Math.sin(fa + da) * dist });   // 以島朝外的方向為 0
    const put = (obj, pos, ry) => { obj.position.set(pos.x, 0, pos.z); if (ry != null) obj.rotation.y = ry; g.add(obj); blockers.push({ x: pos.x, z: pos.z }); obj.traverse(m => { if (m.isMesh) m.castShadow = true; }); return obj; };
    const bench = (m) => { const b = new THREE.Group(); b.add(new THREE.Mesh(rbox(1.6, 0.14, 0.5, 0.05), m || M.wood).translateY(0.45), new THREE.Mesh(rbox(1.6, 0.5, 0.1, 0.04), m || M.wood).translateY(0.72).translateZ(-0.22)); for (const dx of [-0.6, 0.6]) b.add(new THREE.Mesh(rbox(0.14, 0.42, 0.42, 0.03), M.dark).translateY(0.21).translateX(dx)); return b; };
    const lamp = () => { const l = new THREE.Group(); l.add(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 2.2, 6), M.dark).translateY(1.1), new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), M.light).translateY(2.3)); return l; };
    const flowerbed = (seed) => { const f = new THREE.Group(); const rr = mulberry(seed); const bed = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.2, 0.25, 12), M.trunk); bed.position.y = 0.12; f.add(bed); for (let i = 0; i < 9; i++) { const a = rr() * TAU, d = rr() * 0.8; const fl = new THREE.Mesh(new THREE.SphereGeometry(0.13 + rr() * 0.08, 7, 5), [M.orange, M.yellow, M.white, M.teal][i % 4]); fl.position.set(Math.cos(a) * d, 0.38, Math.sin(a) * d); f.add(fl); } return f; };
    if (isl.id === "commons") {
      // 遊樂場：中間一塊圓形鋪面、溜滑梯、鞦韆、翹翹板、沙坑。大家都會走過來的地方。
      const plaza = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.4, 0.08, 32), M.road); plaza.position.set(0, 0.04, 0); plaza.receiveShadow = true; g.add(plaza);
      const slide = new THREE.Group(); slide.add(new THREE.Mesh(rbox(1.2, 0.2, 1.2, 0.05), M.wood).translateY(2.0), new THREE.Mesh(rbox(0.9, 0.12, 3.2, 0.05), M.yellow).translateY(1.15).translateZ(1.9).rotateX(0.55));
      for (const [x, z] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]]) slide.add(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.0, 6), M.teal).translateY(1.0).translateX(x).translateZ(z));
      for (let k = 0; k < 5; k++) slide.add(new THREE.Mesh(rbox(0.9, 0.06, 0.08, 0.02), M.dark).translateY(0.35 + k * 0.38).translateZ(-0.6));
      put(slide, at(0.35, 5.2), -(fa + 0.35) + Math.PI);
      const swing = new THREE.Group(); const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 3.2, 8), M.teal); bar.rotation.z = Math.PI / 2; bar.position.y = 2.3; swing.add(bar);
      for (const sx of [-1.5, 1.5]) for (const sz of [-0.5, 0.5]) { const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 2.5, 6), M.teal); leg.position.set(sx, 1.15, sz); leg.rotation.x = sz > 0 ? -0.2 : 0.2; swing.add(leg); }
      for (const sx of [-0.7, 0.7]) { for (const rz of [-0.25, 0.25]) { const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.6, 4), M.dark); rope.position.set(sx + rz, 1.5, 0); swing.add(rope); } swing.add(new THREE.Mesh(rbox(0.6, 0.08, 0.3, 0.02), M.orange).translateY(0.7).translateX(sx)); }
      put(swing, at(-0.5, 5.4), -(fa - 0.5));
      const seesaw = new THREE.Group(); seesaw.add(new THREE.Mesh(rbox(0.5, 0.45, 0.6, 0.08), M.dark).translateY(0.22), new THREE.Mesh(rbox(3.0, 0.1, 0.4, 0.03), M.orange).translateY(0.5).rotateZ(0.14));
      for (const sx of [-1.3, 1.3]) seesaw.add(new THREE.Mesh(rbox(0.2, 0.35, 0.1, 0.02), M.navy).translateX(sx).translateY(0.72 - sx * 0.14));
      put(seesaw, at(1.2, 5.0), -(fa + 1.2));
      const sand = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.6, 0.2, 14), M.beach); put(sand, at(-1.3, 5.2)); sand.position.y = 0.1;
      put(bench(), at(0.9, 3.9), -(fa + 0.9) + Math.PI / 2); put(bench(), at(-0.9, 3.9), -(fa - 0.9) + Math.PI / 2);
    } else if (isl.id === "internship") {
      // 學校：操場一圈跑道、籃球架、兩張長凳。島本身是方的。
      const track = new THREE.Mesh(new THREE.RingGeometry(3.4, 4.3, 48), M.road); track.rotation.x = -Math.PI / 2; track.position.y = 0.02; track.scale.set(1.25, 0.8, 1); const tp = at(0, 3.2); track.position.x = tp.x; track.position.z = tp.z; track.rotation.z = -fa; g.add(track);
      const hoop = new THREE.Group(); hoop.add(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 3.0, 6), M.dark).translateY(1.5), new THREE.Mesh(rbox(1.3, 0.9, 0.08, 0.04), M.white).translateY(2.9).translateZ(0.2), new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.03, 6, 16), M.orange).translateY(2.55).translateZ(0.5).rotateX(Math.PI / 2));
      put(hoop, at(0.9, 6.2), -(fa + 0.9) + Math.PI);
      put(bench(M.teal), at(-1.1, 6.0), -(fa - 1.1) + Math.PI / 2);
    } else if (isl.id === "curriculum") {
      // 露天教室：一面黑板、三排長凳面向黑板。探索營在這裡上課。
      const board = new THREE.Group(); board.add(new THREE.Mesh(rbox(3.0, 1.5, 0.12, 0.04), M.dark).translateY(1.55), new THREE.Mesh(rbox(3.2, 0.1, 0.2, 0.03), M.wood).translateY(0.85));
      for (const dx of [-1.3, 1.3]) board.add(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 2.2, 6), M.dark).translateY(1.1).translateX(dx));
      for (let i = 0; i < 3; i++) board.add(new THREE.Mesh(rbox(0.7 + i * 0.3, 0.05, 0.02, 0.01), M.white).translateY(1.9 - i * 0.3).translateX(-0.9 + i * 0.2).translateZ(0.07));
      const bp = at(0, 6.4); put(board, bp, -fa + Math.PI / 2);
      for (let r = 0; r < 3; r++) for (const side of [-0.55, 0.55]) put(bench(), at(side * (0.14 + r * 0.03), 4.6 - r * 1.1), -fa + Math.PI / 2);
    } else if (isl.id === "mentorship") {
      // 兩兩對坐的長凳、幾盞燈、花圃：mentor 跟學員在這裡聊。
      for (const [da, d] of [[0.9, 5.4], [-0.9, 5.4]]) { put(bench(), at(da, d), -(fa + da) + Math.PI / 2); put(bench(), at(da, d - 1.6), -(fa + da) - Math.PI / 2); put(lamp(), at(da + (da > 0 ? 0.25 : -0.25), d - 0.8)); }
      put(flowerbed(3), at(0, 6.2)); put(flowerbed(7), at(0, 3.4)); put(flowerbed(11), at(1.6, 4.2)); put(flowerbed(13), at(-1.6, 4.2));
    } else if (isl.id === "sponsorship") {
      // 廣場：鋪面、噴水池、兩盞燈、一塊合作夥伴的看板。
      const plaza = new THREE.Mesh(rbox(7.0, 0.08, 5.0, 0.3), M.road); const pp = at(0, 4.6); plaza.position.set(pp.x, 0.04, pp.z); plaza.rotation.y = -fa + Math.PI / 2; plaza.receiveShadow = true; g.add(plaza);
      const fountain = new THREE.Group(); fountain.add(new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.6, 0.5, 16), M.wall).translateY(0.25), new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 0.1, 16), M.shallow).translateY(0.5), new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 1.2, 8), M.wall).translateY(1.0), new THREE.Mesh(new THREE.SphereGeometry(0.35, 10, 8), M.shallow).translateY(1.7));
      put(fountain, at(0, 4.6));
      put(lamp(), at(0.55, 6.6)); put(lamp(), at(-0.55, 6.6));
      const sign = new THREE.Group(); sign.add(new THREE.Mesh(rbox(2.6, 1.2, 0.1, 0.04), M.white).translateY(1.9), new THREE.Mesh(rbox(2.0, 0.25, 0.02, 0.01), M.orange).translateY(2.15).translateZ(0.06), new THREE.Mesh(rbox(1.4, 0.2, 0.02, 0.01), M.navy).translateY(1.75).translateZ(0.06));
      for (const dx of [-1.0, 1.0]) sign.add(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 1.4, 6), M.dark).translateY(0.7).translateX(dx));
      put(sign, at(1.1, 6.2), -(fa + 1.1) + Math.PI);
    } else if (isl.id === "marketing") {
      // 幾面旗幟、一個大的「讚」看板、一條燈串。
      for (let i = 0; i < 4; i++) { const f = new THREE.Group(); f.add(new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 3.0, 6), M.dark).translateY(1.5), new THREE.Mesh(rbox(0.5, 1.3, 0.04, 0.02), [M.orange, M.teal, M.yellow, M.navy][i]).translateY(2.2).translateX(0.27)); put(f, at(-0.9 + i * 0.6, 6.0)); }
      const like = new THREE.Group(); like.add(new THREE.Mesh(rbox(1.8, 1.8, 0.2, 0.3), M.orange).translateY(1.9), new THREE.Mesh(new THREE.SphereGeometry(0.45, 10, 8), M.white).translateY(2.0).translateZ(0.2), new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 1.0, 6), M.dark).translateY(0.5));
      put(like, at(0, 3.6), -fa + Math.PI / 2);
    } else if (isl.id === "cr") {
      // 小鎮廣場：一排燈籠、佈告欄、一張長椅、一座小郵筒。社區就在隔壁。
      for (let i = 0; i < 5; i++) { const l = new THREE.Group(); l.add(new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 2.4, 6), M.dark).translateY(1.2), new THREE.Mesh(rbox(0.5, 0.6, 0.5, 0.18), [M.orange, M.yellow][i % 2]).translateY(2.0)); put(l, at(-1.0 + i * 0.5, 6.2)); }
      const bb = new THREE.Group(); bb.add(new THREE.Mesh(rbox(2.4, 1.4, 0.12, 0.04), M.wood).translateY(1.6), new THREE.Mesh(rbox(2.8, 0.2, 0.5, 0.04), M.dark).translateY(2.35));
      for (let i = 0; i < 5; i++) bb.add(new THREE.Mesh(rbox(0.5, 0.6, 0.02, 0.01), [M.white, M.cream, M.yellow, M.white, M.teal][i]).translateY(1.65 + (i % 2) * 0.25 - 0.1).translateX(-0.9 + i * 0.45).translateZ(0.07));
      for (const dx of [-1.0, 1.0]) bb.add(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 1.0, 6), M.dark).translateY(0.5).translateX(dx));
      put(bb, at(0, 3.8), -fa + Math.PI / 2);
      put(bench(), at(0.8, 4.8), -(fa + 0.8) + Math.PI / 2);
      const post = new THREE.Group(); post.add(new THREE.Mesh(rbox(0.5, 1.1, 0.5, 0.2), M.orange).translateY(0.85), new THREE.Mesh(rbox(0.3, 0.06, 0.06, 0.02), M.dark).translateY(1.1).translateZ(0.26)); put(post, at(-0.9, 4.8));
    }
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
  // ⚠ 這裡不准讀 DOM 的尺寸（clientWidth 之類）。每一幀先寫了幾十塊牌子的樣式再讀尺寸，瀏覽器就得當場重新排版一次，
  // 一幀讀六十次就是六十次排版，名牌全開會掉到個位數 fps（2026-11-17 量到 6）。尺寸只在 resize() 讀一次記起來。
  let SW = 1, SH = 1;
  function project(x, y, z) { v3.set(x, y, z).project(camera); return { x: (v3.x + 1) / 2 * SW, y: (1 - v3.y) / 2 * SH, visible: v3.z < 1 && Math.abs(v3.x) < 1.2 && Math.abs(v3.y) < 1.2 }; }
  // 牌子的位置記在 JS 的屬性上（不是 data-* attribute：改 attribute 會讓那一塊的樣式失效，每一幀幾十次就有感）。
  function putPin(pin, p, dy) {
    if (!p.visible) { if (pin._v !== 0) { pin.style.opacity = 0; pin._v = 0; } return; }
    const x = Math.round(p.x * 2) / 2, y = Math.round((p.y + (dy || 0)) * 2) / 2;
    if (pin._v === 1 && Math.abs(x - pin._x) < 0.5 && Math.abs(y - pin._y) < 0.5) return;
    if (pin._v !== 1) pin.style.opacity = 1;
    pin._v = 1; pin._x = x; pin._y = y;
    pin.style.transform = `translate(-50%,-100%) translate3d(${x}px,${y}px,0)`;
  }
  const setHidden = (pin, h) => { if (pin.hidden !== h) pin.hidden = h; };
  const show = { names: false, selectedTeam: "", flows: false };
  function paintLines() { for (const l of lines) l.mesh.visible = show.flows || (!!show.selectedTeam && (l.a === show.selectedTeam || l.b === show.selectedTeam)); }
  function placePins() {
    for (const o of isleObjs.values()) { putPin(o.pin, project(o.isl.x, 7.2, o.isl.z)); if (o.evPin) putPin(o.evPin, project(o.isl.x, 7.2, o.isl.z), 34); for (const b of o.buildings) { setHidden(b.userData.pin, show.selectedTeam !== o.isl.id); if (!b.userData.pin.hidden) putPin(b.userData.pin, project(o.isl.x + b.position.x, 4.4, o.isl.z + b.position.z)); } }
    for (const w of walkers) { const on = show.names || w.me || show.selectedTeam === w.person.team; setHidden(w.pin, !on); if (on) putPin(w.pin, project(w.g.position.x, 2.0, w.g.position.z)); }
  }
  function resize() { const w = stage.clientWidth || 300, h = stage.clientHeight || 200; SW = w; SH = h; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); for (const pin of pins.children) pin._v = -1; }
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
    // Marketing 的貼文牆：最上面三張有圖的貼文貼到板子上（島上的圖只有這裡，check.sh 守 island/posts/）。
    // 圖是 1:1 或 4:5，板子是 6:5：置中裁切。載不到就留顏色。
    posts(urls) {
      const loader = new THREE.TextureLoader();
      (urls || []).slice(0, boards.length).forEach((u, i) => loader.load(u, tex => {
        tex.colorSpace = THREE.SRGBColorSpace; const img = tex.image, ar = img && img.width ? img.width / img.height : 1, want = 1.2;
        if (ar < want) { tex.repeat.set(1, ar / want); tex.offset.set(0, (1 - ar / want) / 2); } else { tex.repeat.set(want / ar, 1); tex.offset.set((1 - want / ar) / 2, 0); }
        boards[i].material.map = tex; boards[i].material.needsUpdate = true; boards[i].visible = true; if (!motionOn) render(0);
      }, undefined, () => {}));
    },
    render: () => render(0),
    motion() { motionOn = true; return motion({ cam, placeCam, render, walkers, clouds, planes, pose, blockersOf, rnd }); },
  };
  return api;
}

/* ── 這裡面才有動畫。外面不准有每一幀的迴圈。 ──
   鏡頭用阻尼追目標（1 - e^(-dt·k)）；人偶爾走到島上另一個點；雲慢慢飄。暫停就是不呼叫 tick。 */
function motion({ cam, placeCam, render, walkers, clouds, planes, pose, blockersOf, rnd }) {
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
      // 機場那架會滑行的飛機：沿跑道走到底，停一下，轉頭再走。螺旋槳一直轉。
      for (const pl of planes) { const tx = pl.userData.taxi; if (!tx) continue; const prop = pl.getObjectByName("prop"); if (prop) prop.rotation.x += dt * 18;
        if (tx.wait > 0) { tx.wait -= dt; continue; }
        pl.position.x += tx.dir * 1.3 * dt; pl.rotation.y = tx.dir > 0 ? 0 : Math.PI;
        if (tx.dir > 0 && pl.position.x >= tx.x1) { pl.position.x = tx.x1; tx.dir = -1; tx.wait = 2.5 + rnd() * 3; }
        else if (tx.dir < 0 && pl.position.x <= tx.x0) { pl.position.x = tx.x0; tx.dir = 1; tx.wait = 2.5 + rnd() * 3; } }
    }
    render(t);
  }
  raf = requestAnimationFrame(tick);
  return { pause(v) { paused = !!v; }, stop() { cancelAnimationFrame(raf); } };
}
