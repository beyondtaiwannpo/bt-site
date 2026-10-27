// /history/ 的場景（批 5，2026-11-06 換成真的 3D）：一座 Three.js 的機場。航廈裡面走到登機門、空橋、上飛機、推出去滑行、起飛。
//
// ── 讀這一支之前先知道五件事 ──
// 1. **資料與場景分開。** 這裡沒有任何一站的文字，只拿「有幾站」與「每站畫哪一種小場景」兩個輸入。
//    出發看板的字是 CanvasTexture，內容只從 ui.js 的 boardRows 來（main.js 算好 rows 丟進 setBoard）。加一站永遠不碰這支。
// 2. **沒有模型檔、沒有貼圖檔。** 每一樣東西都是 Three 的基本幾何（Box、Cylinder、Lathe、Extrude、Capsule）在程式裡組起來；
//    地磚、看板、登機門牌、跑道號碼是程式畫的 canvas。repo 裡因此不多任何二進位檔，明年的幹部不用會建模。
// 3. **顏色不寫色碼。** main.js 開頁從 shared/brand.css 的 CSS 變數讀七色丟進來（palette），大面積用七色互相 lerp 的混色（草、柏油、玻璃），
//    沒有新色票。check.sh 的色碼掃描因此在這裡找不到任何 #。
// 4. **會動的只有 motion()。** gsap 與 ScrollTrigger 只准出現在 motion() 裡（check.sh 守著）。render() 每一幀照進度擺東西，那是算數學不是動畫；
//    誰呼叫它（捲動的追趕、閒置的時鐘）才在 motion() 裡。prefers-reduced-motion、?motion=off、沒有 WebGL、Three 或 GSAP 載不到，
//    main.js 都不會走到這裡（airport.js 的 pickMode），畫的是直立時間軸。
// 5. **數字都在 airport.js。** 飛機在哪、鏡頭在哪、旅客在哪、每一站的錨點在哪，全部是那一支的純函式（測試直接算）。這一支只負責把 Three 的物件擺到那些數字上。
//
// 單位公尺，y 朝上。航廈沿 x 軸（-10 到 125），玻璃牆在 z=0，停機坪 z>0，跑道在 z=400 沿 x 軸，飛機往 -x 起飛。

import * as THREE from "three";
import * as A from "./airport.js";
import { buildAirliner, setGear, steerNose, TAIWAN } from "./plane.js";
import { buildPerson, posePerson } from "./person.js";

const clamp01 = v => Math.min(1, Math.max(0, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = t => t * t * (3 - 2 * t);
const DEG = Math.PI / 180;

// WebGL 能不能用：開不出 context 就走直立時間軸（舊機器、省電模式、被企業政策關掉都會這樣）。
export function webglOK() {
  try { const c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); } catch (e) { return false; }
}

// ── 顏色：七色進來，混色出去 ──
function colours(p) {
  const C = k => new THREE.Color(p[k]);
  const navy = C("navy"), teal = C("teal"), orange = C("orange"), sand = C("sand"), cream = C("cream"), yellow = C("yellow"), grey = C("grey");
  return {
    navy, teal, orange, sand, cream, yellow, grey,
    white: new THREE.Color(1, 1, 1),                           // 只給有貼圖的材質當底色（底色會乘上貼圖，深藍底會把字乘暗）
    sky: cream.clone().lerp(teal, 0.22),                       // 白天的天空：奶油白帶一點青
    skyHigh: navy.clone().lerp(teal, 0.45),                    // 高空的藍
    grass: teal.clone().lerp(sand, 0.34).lerp(grey, 0.16),     // 草：低飽和的灰綠
    grassDark: teal.clone().lerp(navy, 0.25).lerp(grey, 0.4),  // 樹冠
    asphalt: navy.clone().lerp(grey, 0.74),                    // 跑道：藍灰
    taxi: grey.clone().lerp(cream, 0.25),                      // 滑行道：淺灰
    apron: cream.clone().lerp(grey, 0.42),                     // 停機坪的水泥
    wall: cream.clone().lerp(sand, 0.35),                      // 建築的牆
    wallShade: cream.clone().lerp(grey, 0.3),
    roof: navy.clone().lerp(grey, 0.35),                       // 屋頂：深藍灰
    glass: teal.clone().lerp(cream, 0.35),
    floor: cream.clone().lerp(grey, 0.18),
    ceiling: cream.clone().lerp(grey, 0.1),
    dark: navy.clone().lerp(grey, 0.2),
    skin: sand.clone().lerp(orange, 0.25).lerp(cream, 0.2),             // 暖膚色
    hair: navy.clone().lerp(grey, 0.15).multiplyScalar(0.45),            // 深色的頭髮與鞋
    trousersNavy: navy.clone().lerp(grey, 0.25),
    trousersKhaki: sand.clone().lerp(grey, 0.45).lerp(navy, 0.15),
    cloud: cream.clone().lerp(new THREE.Color(1, 1, 1), 0.55),         // 雲：奶油白往白推（不是色票，是把奶油色打亮）
    column: cream.clone().lerp(sand, 0.5),                            // 柱子：淡淡的品牌沙色
    plant: teal.clone().lerp(navy, 0.3).lerp(grey, 0.15),             // 盆栽
    trunk: navy.clone().lerp(sand, 0.6).lerp(grey, 0.3),
  };
}
const lam = (color, extra) => new THREE.MeshLambertMaterial({ color, flatShading: true, ...(extra || {}) });

// ── 小工具 ──
function box(w, h, d, material, x, y, z, shadow) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z); m.castShadow = shadow !== false; m.receiveShadow = true; return m;
}
function cyl(rt, rb, h, material, x, y, z, seg) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg || 10), material);
  m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; return m;
}
// 一堆一樣的東西：InstancedMesh。places 是 [x,y,z,ry,s] 的陣列。
function instanced(geo, material, places, shadow) {
  const im = new THREE.InstancedMesh(geo, material, places.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  places.forEach(([x, y, z, ry, sc], i) => {
    q.setFromAxisAngle(up, ry || 0); s.setScalar(sc || 1); p.set(x, y, z);
    m.compose(p, q, s); im.setMatrixAt(i, m);
  });
  im.instanceMatrix.needsUpdate = true; im.castShadow = shadow !== false; im.receiveShadow = true;
  return im;
}
// 文字 canvas → 貼圖。lines 是 [{ text, size, color, x, y, align, font }]。
function textTexture(w, h, bg, lines, rects) {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const ctx = c.getContext("2d");
  ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
  for (const r of rects || []) { ctx.fillStyle = r.color; ctx.fillRect(r.x, r.y, r.w, r.h); }
  for (const l of lines) { ctx.fillStyle = l.color; ctx.font = l.font; ctx.textAlign = l.align || "left"; ctx.textBaseline = "middle"; ctx.fillText(l.text, l.x, l.y); }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  return tex;
}
// 地磚：一格 4 公尺的淺格線，重複貼。
function tileTexture(p) {
  const c = document.createElement("canvas"); c.width = c.height = 128;
  const ctx = c.getContext("2d");
  ctx.fillStyle = p.cream; ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = p.grey; ctx.globalAlpha = 0.55; ctx.lineWidth = 2; ctx.strokeRect(1, 1, 126, 126);
  ctx.globalAlpha = 0.25; ctx.beginPath(); ctx.moveTo(64, 0); ctx.lineTo(64, 128); ctx.moveTo(0, 64); ctx.lineTo(128, 64); ctx.stroke();
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.anisotropy = 8;
  return tex;
}

// 一個人：person.js 的工廠（七頭身、頭髮、臉、短袖、手、長褲、鞋）。這裡只是把場景慣用的參數換成工廠的參數。
// opts：shirt（上衣的顏色）、seated、backpack、bag（行李箱的顏色）、vest（地勤）、skirt、phase。
function figure(mats, opts) {
  const o = opts || {}, P = mats.P;
  const variant = o.seated ? "seated" : o.vest ? "crew" : o.bag ? "bag" : o.backpack ? "backpack" : o.skirt ? "skirt" : o.staff ? "staff" : "default";
  const trousers = (o.phase != null ? o.phase : Math.random()) % 1 < 0.5 ? P.trousersNavy : P.trousersKhaki;
  const g = buildPerson(THREE, { variant, skin: P.skin, hair: P.hair, shirt: o.shirt || P.cream, trousers, shoe: P.hair, accent: o.bag || o.vest ? (o.bag || P.orange) : P.orange, phase: o.phase });
  g.name = "figure"; g.userData.baseY = 0;
  return g;
}
function walkCycle(fig, t, walking) { posePerson(fig, t, walking); }

// 一棵低多邊形的樹：圓錐加圓柱，InstancedMesh 用。
const treeGeo = () => { const g = new THREE.ConeGeometry(2.6, 6, 6); g.translate(0, 5.2, 0); return g; };
const trunkGeo = () => { const g = new THREE.CylinderGeometry(0.35, 0.45, 2.4, 6); g.translate(0, 1.2, 0); return g; };

// ── 場景本體 ──
export function createScene({ canvas, palette, phone, fonts }) {
  const P = colours(palette), q = A.quality({ phone, dpr: window.devicePixelRatio || 1 });
  const mats = {
    grass: lam(P.grass), asphalt: lam(P.asphalt), taxi: lam(P.taxi), apron: lam(P.apron), wall: lam(P.wall), wallShade: lam(P.wallShade), roof: lam(P.roof),
    glass: lam(P.glass, { transparent: true, opacity: 0.38, side: THREE.DoubleSide, depthWrite: false }),
    frame: lam(P.dark), dark: lam(P.dark), cream: lam(P.cream), sand: lam(P.sand), orange: lam(P.orange), teal: lam(P.teal), navy: lam(P.navy), grey: lam(P.grey),
    yellowLight: lam(P.yellow, { emissive: P.yellow, emissiveIntensity: 0.9 }), orangeLight: lam(P.orange, { emissive: P.orange, emissiveIntensity: 1 }),
    skin: lam(P.skin),
    cloud: lam(P.cloud, { emissive: P.cloud, emissiveIntensity: 0.55, transparent: true, opacity: 0.96 }), ceiling: lam(P.ceiling, { emissive: P.cream, emissiveIntensity: 0.45 }), floor: null, trunk: lam(P.trunk), leaf: lam(P.grassDark), mark: lam(P.cream),
    column: lam(P.column), light: lam(P.sand, { emissive: P.sand, emissiveIntensity: 0.7 }), plant: lam(P.plant), pot: lam(P.navy.clone().lerp(P.grey, 0.5)),
    P,
  };
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(q.dpr);
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  scene.background = P.sky.clone();
  scene.fog = new THREE.FogExp2(P.sky.clone(), 0.0022);
  const camera = new THREE.PerspectiveCamera(A.CAM_FOV.inside, 16 / 9, 0.3, 6000);
  scene.add(camera);

  // 光：一盞半球（天空色照上面、草色照下面）加一盞方向光帶軟陰影。方向光跟著鏡頭看的點走，陰影貼圖才一直罩著畫面裡的東西。
  const hemi = new THREE.HemisphereLight(P.sky, P.grass, 0.95); scene.add(hemi);
  const sun = new THREE.DirectionalLight(P.cream, 1.7);
  sun.castShadow = true; sun.shadow.mapSize.set(q.shadow, q.shadow);
  sun.shadow.camera.near = 10; sun.shadow.camera.far = 900; sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.6; sun.shadow.radius = 4;
  scene.add(sun, sun.target);
  const SUN_OFF = new THREE.Vector3(-110, 170, -70);
  let shadowSpan = 0;
  const setShadowSpan = s => { if (s === shadowSpan) return; shadowSpan = s; const c = sun.shadow.camera; c.left = -s; c.right = s; c.top = s; c.bottom = -s; c.updateProjectionMatrix(); };

  const world = new THREE.Group(); scene.add(world);
  const T = A.TERMINAL;

  // ═══ 地 ═══
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(14000, 14000), mats.grass); ground.rotation.x = -Math.PI / 2; ground.position.y = -0.05; ground.receiveShadow = true; world.add(ground);
  const apron = new THREE.Mesh(new THREE.PlaneGeometry(340, 220), mats.apron); apron.rotation.x = -Math.PI / 2; apron.position.set(90, 0, 110); apron.receiveShadow = true; world.add(apron);
  // 滑行道：沿樣條鋪一條 18 公尺寬的帶子，中線一條黃線，兩邊每 12 公尺一顆邊燈。
  const tw = A.taxiway();
  world.add(ribbon(tw.points, 9, 0.02, mats.taxi), ribbon(tw.points, 0.3, 0.05, mats.yellowLight));
  {
    const places = [];
    for (let s = 6; s < tw.length; s += 12) { const p = tw.at(s), nx = Math.cos(p.yaw), nz = -Math.sin(p.yaw); places.push([p.x + nx * 10.5, 0.25, p.z + nz * 10.5], [p.x - nx * 10.5, 0.25, p.z - nz * 10.5]); }
    world.add(instanced(new THREE.SphereGeometry(0.3, 6, 4), mats.yellowLight, places, false));
  }
  // 跑道：長條、跑道頭的條紋、號碼、中線虛線、邊燈、等待線。
  const R = A.RUNWAY;
  world.add(box(R.x1 - R.x0, 0.1, R.half * 2, mats.asphalt, (R.x0 + R.x1) / 2, -0.02, R.z, false));
  {
    const stripes = []; for (let k = 0; k < 8; k++) stripes.push([R.x1 - 30, 0.06, R.z - 15.75 + k * 4.5]);
    world.add(instanced(new THREE.BoxGeometry(30, 0.04, 1.8), mats.cream, stripes, false));
    const dashes = []; for (let x = R.x1 - 80; x > R.x0 + 40; x -= 60) dashes.push([x, 0.06, R.z]);
    world.add(instanced(new THREE.BoxGeometry(30, 0.04, 0.9), mats.cream, dashes, false));
    const lights = []; for (let x = R.x0; x <= R.x1; x += 40) lights.push([x, 0.3, R.z - R.half - 1], [x, 0.3, R.z + R.half + 1]);
    world.add(instanced(new THREE.SphereGeometry(0.35, 6, 4), mats.yellowLight, lights, false));
    const num = new THREE.Mesh(new THREE.PlaneGeometry(14, 22), lam(P.white, { map: textTexture(256, 400, palette.cream, [{ text: "27", font: `700 300px ${fonts.display}`, color: palette.navy, x: 128, y: 200, align: "center" }]) }));
    num.rotation.x = -Math.PI / 2; num.rotation.z = Math.PI / 2; num.position.set(R.x1 - 60, 0.07, R.z); num.receiveShadow = false; world.add(num);
    // 等待線：滑行道接跑道前兩條黃線
    const hold = tw.at(tw.length - 36), hx = Math.cos(hold.yaw), hz = -Math.sin(hold.yaw);
    for (const d of [0, 1.4]) { const m = box(20, 0.04, 0.5, mats.yellowLight, hold.x - Math.sin(hold.yaw) * d, 0.06, hold.z - Math.cos(hold.yaw) * d, false); m.rotation.y = hold.yaw + Math.PI / 2; world.add(m); }
    void hx; void hz;
  }

  // ═══ 航廈 ═══
  const term = new THREE.Group(); world.add(term);
  const tx = (T.x0 + T.x1) / 2, tz = (T.z0 + T.z1) / 2, tw_ = T.x1 - T.x0, td = T.z1 - T.z0;
  const figMats = [P.cream, P.teal, P.orange, P.cream, P.sand, P.navy];
  const pick = i => figMats[i % figMats.length];
  // 地板（奶油色地磚）、天花板（一格一格的板子加燈條）、三面實牆（內外都看得到）、玻璃牆（直櫺，門口留洞）。屋頂不投影，裡面才亮得起來。
  const tile = tileTexture(palette); tile.repeat.set(tw_ / 4, td / 4); mats.floor = lam(P.cream, { map: tile });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(tw_, td), mats.floor); floor.rotation.x = -Math.PI / 2; floor.position.set(tx, 0.01, tz); floor.receiveShadow = true; term.add(floor);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(tw_, td), mats.ceiling); ceil.rotation.x = Math.PI / 2; ceil.position.set(tx, T.h - 0.7, tz); term.add(ceil);   // 比屋頂板的底面低 0.3，不然兩個面重疊會閃（z-fighting）
  {
    const panels = [], lights = [];
    for (let x = T.x0 + 3; x < T.x1 - 2; x += 6) for (let z = T.z0 + 3; z < T.z1 - 2; z += 6) panels.push([x, T.h - 1.0, z]);
    for (let x = T.x0 + 6; x < T.x1; x += 12) for (const z of [-30, -20, -10]) lights.push([x, T.h - 1.25, z]);
    term.add(instanced(new THREE.BoxGeometry(5.4, 0.25, 5.4), lam(P.ceiling, { emissive: P.cream, emissiveIntensity: 0.3 }), panels, false));
    term.add(instanced(new THREE.BoxGeometry(5, 0.14, 0.7), mats.light, lights, false));
  }
  const roof = box(tw_ + 3, 0.8, td + 3, mats.roof, tx, T.h, tz, false); roof.receiveShadow = false; term.add(roof);
  const sideM = lam(P.wall, { side: THREE.DoubleSide });
  for (const [w, h, d, x, y, z] of [[tw_, T.h, 0.6, tx, T.h / 2, T.z0], [0.6, T.h, td, T.x0, T.h / 2, tz], [0.6, T.h, td, T.x1, T.h / 2, tz]]) { const m = box(w, h, d, sideM, x, y, z, false); term.add(m); }
  // 陸側牆上一條深藍的帶子、幾扇門、幾面橘色的指標
  term.add(box(tw_, 1.0, 0.2, mats.navy, tx, T.h - 1.6, T.z0 + 0.4, false));
  term.add(instanced(new THREE.BoxGeometry(3, 3.2, 0.3), mats.frame, [[10, 1.6, T.z0 + 0.4], [60, 1.6, T.z0 + 0.4], [95, 1.6, T.z0 + 0.4]], false));
  // 玻璃牆：兩片淡青的玻璃，中間在登機門那裡留 4 公尺的洞（鏡頭要走過去）；直櫺每 4 公尺一支、橫櫺兩條。
  const gd = A.GATE_DOOR[0], gh = T.h - 0.8;
  for (const [x0, x1] of [[T.x0, gd - 2], [gd + 2, T.x1]]) { const gl = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, gh), mats.glass); gl.position.set((x0 + x1) / 2, gh / 2, T.z1); term.add(gl); }
  {
    const v = []; for (let x = T.x0; x <= T.x1; x += 4) if (Math.abs(x - gd) > 2.2) v.push([x, gh / 2, T.z1]);
    term.add(instanced(new THREE.BoxGeometry(0.25, gh, 0.35), mats.frame, v, false));
    term.add(instanced(new THREE.BoxGeometry(gd - 2 - T.x0, 0.22, 0.35), mats.frame, [[(T.x0 + gd - 2) / 2, 4, T.z1], [(T.x0 + gd - 2) / 2, 8, T.z1]], false));
    term.add(instanced(new THREE.BoxGeometry(T.x1 - gd - 2, 0.22, 0.35), mats.frame, [[(gd + 2 + T.x1) / 2, 4, T.z1], [(gd + 2 + T.x1) / 2, 8, T.z1]], false));
    term.add(box(4.4, gh - 3.4, 0.35, lam(P.wall), gd, 3.4 + (gh - 3.4) / 2, T.z1, false));   // 門上方的牆
  }
  // 登機門：深藍的門框、門檻；門上一塊牌（登機門號碼，setGate 填），面向走過來的人（-z）。
  term.add(box(4.2, 0.35, 0.7, mats.navy, gd, 3.2, T.z1, false), box(0.35, 3.2, 0.7, mats.navy, gd - 1.95, 1.6, T.z1, false), box(0.35, 3.2, 0.7, mats.navy, gd + 1.95, 1.6, T.z1, false));
  const gateSign = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 1.1), lam(P.navy)); gateSign.position.set(gd, 4.1, T.z1 - 0.4); gateSign.rotation.y = Math.PI; term.add(gateSign);
  const gateSign2 = gateSign.clone(); gateSign2.position.set(A.GATE_DESK[0] + 1.2, 1.9, A.GATE_DESK[1] - 0.62); gateSign2.rotation.y = Math.PI; gateSign2.scale.setScalar(0.5); term.add(gateSign2);
  // 柱子：兩排，每 15 公尺一支，淡沙色。
  {
    const cols = []; for (let x = 5; x < T.x1; x += 15) cols.push([x, T.h / 2, -30], [x, T.h / 2, -10]);
    term.add(instanced(new THREE.CylinderGeometry(0.55, 0.55, T.h, 10), mats.column, cols));
  }
  // 橘色的指標：掛在走道上方，面向走過來的人，上面一支奶油色的箭頭。
  for (const x of [18, 48, 78, 104]) {
    const g = new THREE.Group(); g.position.set(x, 4.6, -20); g.rotation.y = -Math.PI / 2;
    g.add(box(3.2, 0.9, 0.12, mats.orange, 0, 0, 0, false), box(1.2, 0.12, 0.14, mats.cream, 0.6, 0, 0.02, false));
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.4, 3), mats.cream); tip.rotation.z = -Math.PI / 2; tip.position.set(1.35, 0, 0.02); g.add(tip);
    g.add(instanced(new THREE.CylinderGeometry(0.04, 0.04, T.h - 6, 5), mats.grey, [[-1.2, (T.h - 6) / 2 + 0.45, 0], [1.2, (T.h - 6) / 2 + 0.45, 0]], false));
    term.add(g);
  }
  // 報到櫃台（x 5 到 45，靠陸側）：深藍的櫃台、奶油色的檯面、螢幕、站櫃台的人。
  {
    const desks = [], tops = [], screens = [];
    for (let x = 6; x <= 44; x += 6.5) { desks.push([x, 0.55, -34]); tops.push([x, 1.14, -34]); screens.push([x, 2.6, -33.4]); }
    term.add(instanced(new THREE.BoxGeometry(5, 1.1, 1.6), mats.navy, desks), instanced(new THREE.BoxGeometry(5.2, 0.08, 1.8), mats.cream, tops, false), instanced(new THREE.BoxGeometry(1.1, 0.7, 0.08), mats.dark, screens, false));
    term.add(instanced(new THREE.CylinderGeometry(0.05, 0.05, 1.4, 5), mats.grey, screens.map(([x, y, z]) => [x, 1.8, z]), false));
    for (const x of [12.5, 25.5, 38.5]) { const f = figure(mats, { shirt: P.navy, staff: true }); f.position.set(x, 0, -35.3); f.userData.baseY = 0; term.add(f); idleFigs.push(f); }
    for (const [x, k] of [[19, 0], [19.6, 2], [32, 3], [32.5, 1]]) { const f = figure(mats, { shirt: pick(k), bag: pick(k + 1) }); f.position.set(x, 0, -31.6 - (k % 2) * 1.2); f.userData.baseY = 0; term.add(f); idleFigs.push(f); }
  }
  // 出發看板：兩塊，掛在走道上方、正面朝 -x（迎著走過來的人），字是 CanvasTexture（setBoard 換）。
  const boardMat = lam(P.white, { emissive: P.navy, emissiveIntensity: 0.15 }); const boards = [];
  for (const x of [36, 84]) {
    const g = new THREE.Group(); g.position.set(x, 6.3, -20); g.rotation.y = -Math.PI / 2;
    g.add(box(8.6, 3.4, 0.5, mats.navy, 0, 0, 0, false));
    const face = new THREE.Mesh(new THREE.PlaneGeometry(8, 2.9), boardMat); face.position.z = 0.26; g.add(face);
    const hang = instanced(new THREE.CylinderGeometry(0.06, 0.06, T.h - 8, 5), mats.grey, [[-3.8, (T.h - 8) / 2 + 1.7, 0], [3.8, (T.h - 8) / 2 + 1.7, 0]], false); g.add(hang);
    term.add(g); boards.push(face);
  }
  // 安檢：一個深藍的門框、一條輸送帶、一個安檢員。
  { const x = 52; term.add(box(0.3, 2.3, 1.1, mats.navy, x, 1.15, -22.6, false), box(0.3, 2.3, 1.1, mats.navy, x, 1.15, -20.4, false), box(0.3, 0.25, 2.5, mats.navy, x, 2.4, -21.5, false));
    term.add(box(5, 0.9, 0.9, mats.grey, x, 0.45, -18.2), box(1.6, 1.4, 1.2, mats.dark, x - 0.4, 1.15, -18.2));
    const f = figure(mats, { shirt: P.navy, staff: true }); f.position.set(x + 1.2, 0, -16.8); f.userData.baseY = 0; f.rotation.y = Math.PI; term.add(f); idleFigs.push(f); }
  // 座位：候機區一排五張，青與橘輪流；有人坐著。
  {
    const seatsT = [], seatsO = [], benches = [];
    let k = 0;
    for (let x = 60; x <= 100; x += 7) for (const z of [-7, -11, -29, -33]) { benches.push([x, 0.28, z]); for (let i = 0; i < 5; i++) (k++ % 2 ? seatsT : seatsO).push([x - 2 + i, 0.62, z]); }
    term.add(instanced(new THREE.BoxGeometry(5.2, 0.12, 0.9), mats.grey, benches), instanced(new THREE.BoxGeometry(0.8, 0.5, 0.8), mats.teal, seatsT), instanced(new THREE.BoxGeometry(0.8, 0.5, 0.8), mats.orange, seatsO));
    for (const [x, z, i] of [[62, -7, 0], [71, -11, 1], [90, -29, 2], [96, -33, 3], [83, -7, 4], [67, -29, 1]]) { const f = figure(mats, { shirt: pick(i), seated: true, skirt: i % 3 === 1 }); f.position.set(x, 0.05, z + (z > -20 ? -0.15 : 0.15)); f.userData.baseY = 0.05; f.rotation.y = z > -20 ? Math.PI : 0; term.add(f); idleFigs.push(f); }
  }
  // 商店：陸側三間，各自一種顏色的門面與雨棚、一塊招牌、架上幾樣東西。
  for (const [x, front, awn] of [[58, mats.teal, mats.orange], [72, mats.orange, mats.navy], [90, mats.navy, mats.teal]]) {
    term.add(box(9, 4, 5, front, x, 2, -37), box(9.6, 0.3, 2.2, awn, x, 3.4, -33.6, false), box(6, 1, 0.2, mats.cream, x, 4.6, -34.4, false));
    term.add(instanced(new THREE.BoxGeometry(0.9, 0.9, 0.5), mats.sand, [[x - 2.6, 0.45, -34.9], [x - 1.4, 0.45, -34.9], [x + 1.4, 0.45, -34.9], [x + 2.6, 0.45, -34.9]], false));
  }
  // 盆栽：柱子旁與候機區幾盆。
  {
    const pots = [], leaves = [];
    for (const [x, z] of [[5, -27], [20, -13], [35, -27], [50, -13], [65, -27.5], [80, -12.5], [95, -27], [110, -27], [57, -8], [99, -8]]) { pots.push([x, 0.4, z]); leaves.push([x, 1.4, z, 0, 1]); }
    term.add(instanced(new THREE.CylinderGeometry(0.55, 0.45, 0.8, 8), mats.pot, pots), instanced(new THREE.IcosahedronGeometry(0.75, 0), mats.plant, leaves));
  }
  // 登機門櫃台：深藍的櫃台、奶油色檯面、一個站著的地勤、一支小牌。
  term.add(box(3.4, 1.1, 1.1, mats.navy, A.GATE_DESK[0], 0.55, A.GATE_DESK[1]), box(3.6, 0.1, 1.3, mats.cream, A.GATE_DESK[0], 1.12, A.GATE_DESK[1], false));
  { const f = figure(mats, { shirt: P.navy, staff: true }); f.position.set(A.GATE_DESK[0], 0, A.GATE_DESK[1] + 1.3); f.userData.baseY = 0; f.rotation.y = Math.PI; term.add(f); idleFigs.push(f); }
  let bridgeSign = null;
  // 空橋：兩段直的（A 段從門沿 +z、B 段轉 90 度沿 +x 到機身），是一條有燈的隧道：一邊實牆、一邊玻璃看得到機身；B 段的頂是玻璃，鏡頭從那裡升出去。
  {
    const B = A.BRIDGE, wallM = lam(P.cream, { side: THREE.DoubleSide, emissive: P.cream, emissiveIntensity: 0.35 }), inner = B.half - 0.08;
    const zA0 = T.z1, zA1 = B.zEnd + B.half, lenA = zA1 - zA0, y0 = 0, y1 = B.floorEnd;
    // A 段：地板是斜的（用一個旋轉的盒子），牆跟著斜。
    const gA = new THREE.Group(); const pitch = Math.atan2(y1 - y0, lenA); gA.position.set(B.x, (y0 + y1) / 2, (zA0 + zA1) / 2); gA.rotation.x = -pitch; term.add(gA);
    const L = Math.hypot(lenA, y1 - y0);
    gA.add(box(B.half * 2, 0.16, L, wallM, 0, -0.08, 0), box(1.0, 0.02, L, mats.navy, 0, 0.01, 0, false));   // 地板加一條深藍的地帶
    gA.add(new THREE.Mesh(new THREE.BoxGeometry(B.half * 2, 0.12, L), lam(P.ceiling)).translateY(B.h));   // 頂
    gA.add(box(0.15, B.h, L, wallM, -B.half, B.h / 2, 0, false));                            // 靠 -x 那一面實牆
    gA.add(box(0.15, 1.0, L, wallM, B.half, 0.5, 0, false), box(0.15, 0.4, L, wallM, B.half, B.h - 0.2, 0, false));   // 靠機身那一面：下半牆、上面一條，中間是窗
    gA.add(new THREE.Mesh(new THREE.PlaneGeometry(L, B.h - 1.4), mats.glass).rotateY(-Math.PI / 2).translateZ(-B.half).translateY(1.0 + (B.h - 1.4) / 2));
    gA.add(instanced(new THREE.BoxGeometry(0.1, B.h - 1.4, 0.1), mats.frame, Array.from({ length: Math.floor(L / 3) }, (_, i) => [B.half, 1.0 + (B.h - 1.4) / 2, -L / 2 + 1.5 + i * 3]), false));
    gA.add(instanced(new THREE.BoxGeometry(2.2, 0.08, 0.9), mats.light, Array.from({ length: Math.floor(L / 3) }, (_, i) => [0, B.h - 0.1, -L / 2 + 1.5 + i * 3]), false));
    gA.add(box(0.25, 0.08, L, mats.orange, -inner, 1.0, 0, false));                          // 扶手
    // B 段：平的，沿 +x 到機身；-z 那一面是窗（看得到機頭）、頂是玻璃。
    const xB0 = B.x - B.half, xB1 = A.PLANE_DOOR[0], lenB = xB1 - xB0;
    const gB = new THREE.Group(); gB.position.set((xB0 + xB1) / 2, y1, B.zEnd); term.add(gB);
    gB.add(box(lenB, 0.16, B.half * 2, wallM, 0, -0.08, 0), box(lenB, 0.02, 1.0, mats.navy, 0, 0.01, 0, false));
    gB.add(new THREE.Mesh(new THREE.PlaneGeometry(lenB, B.half * 2), mats.glass).rotateX(Math.PI / 2).translateZ(-B.h));
    gB.add(box(lenB, B.h, 0.15, wallM, 0, B.h / 2, B.half, false));                            // 靠 +z 那一面實牆
    gB.add(box(lenB, 1.0, 0.15, wallM, 0, 0.5, -B.half, false), box(lenB, 0.4, 0.15, wallM, 0, B.h - 0.2, -B.half, false));
    gB.add(new THREE.Mesh(new THREE.PlaneGeometry(lenB, B.h - 1.4), mats.glass).translateZ(-B.half).translateY(1.0 + (B.h - 1.4) / 2));
    gB.add(instanced(new THREE.BoxGeometry(0.9, 0.08, 2.2), mats.light, Array.from({ length: Math.floor(lenB / 2) }, (_, i) => [-lenB / 2 + 1 + i * 2, B.h - 0.1, 0]), false));
    // 盡頭上方一塊「BT GATE A3」的牌，面向走過來的人（setGate 填字）
    const bs = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.7), lam(P.navy)); bs.position.set(lenB / 2 - 1.6, B.h - 0.5, 0); bs.rotation.y = -Math.PI / 2; gB.add(bs); bridgeSign = bs;
    gB.add(box(lenB, 0.08, 0.25, mats.orange, 0, 1.0, inner, false));
    // 門口的圓亭、B 段底下的兩支腳
    term.add(cyl(2.4, 2.4, 3.6, mats.wallShade, B.x, 1.8, T.z1 + 1.2, 12));
    term.add(cyl(0.3, 0.3, y1, mats.frame, B.x - 1.2, y1 / 2, B.zEnd + B.half + 0.6, 6), cyl(0.3, 0.3, y1, mats.frame, xB1 - 1.5, y1 / 2, B.zEnd + B.half + 0.6, 6));
  }
  // 其他登機門的空橋與停著的飛機：兩座，直直伸出去。
  for (const [x, tail] of [[40, "teal"], [75, "navy"]]) {
    const g = new THREE.Group(); g.position.set(x, 2.6, 19);
    g.add(box(3.2, 2.9, 38, lam(P.wall), 0, 0, 0)); g.add(box(3.4, 0.5, 38, mats.teal, 0, 0.2, 0, false));
    term.add(g, cyl(0.3, 0.3, 2.6, mats.frame, x - 1.2, 1.3, 32, 6), cyl(0.3, 0.3, 2.6, mats.frame, x + 1.2, 1.3, 32, 6));
    const pl = buildAirliner(THREE, { body: P.cream, tail: P[tail], mark: P.cream, dark: P.dark }); pl.position.set(x + 7, A.PLANE_REST_Y, A.GATE_STAND[1]); pl.rotation.y = Math.PI; shadowOn(pl); world.add(pl);
  }

  // ═══ 停機坪上的東西 ═══
  // 塔台：桿、頂上的控制室、玻璃、旋轉信標。
  const tower = new THREE.Group(); tower.position.set(A.TOWER[0], 0, A.TOWER[1]); world.add(tower);
  tower.add(cyl(2.4, 3.2, 30, mats.wall, 0, 15, 0, 10), cyl(5.6, 4.2, 4.5, mats.roof, 0, 31.5, 0, 10), cyl(5.2, 5.2, 2.6, mats.glass, 0, 34.5, 0, 10), cyl(6, 5.4, 0.9, mats.roof, 0, 36.2, 0, 10));
  const beacon = new THREE.Group(); beacon.position.y = 37.4; beacon.add(cyl(0.3, 0.3, 1.2, mats.frame, 0, 0, 0, 6), box(2.6, 0.5, 0.5, mats.orangeLight, 0, 0.7, 0, false)); tower.add(beacon);
  // 機棚兩座：盒子加半圓的屋頂，大門是深色。
  for (const [x, z] of [[-70, 130], [-70, 190]]) {
    const g = new THREE.Group(); g.position.set(x, 0, z); world.add(g);
    g.add(box(44, 12, 36, mats.wallShade, 0, 6, 0));
    const arch = new THREE.Mesh(new THREE.CylinderGeometry(18, 18, 44, 14, 1, false, 0, Math.PI), mats.roof); arch.rotation.z = Math.PI / 2; arch.rotation.y = Math.PI / 2; arch.position.y = 12; arch.castShadow = true; arch.scale.set(0.45, 1, 1); g.add(arch);
    g.add(box(0.4, 13, 34, mats.dark, 22.1, 6.5, 0, false));
  }
  // 消防站：橘牆、三扇門、一台消防車探頭。
  { const g = new THREE.Group(); g.position.set(210, 0, 70); world.add(g);
    g.add(box(26, 7, 16, lam(P.sand.clone().lerp(P.orange, 0.35)), 0, 3.5, 0), box(27, 0.6, 17, mats.roof, 0, 7.2, 0, false));
    g.add(instanced(new THREE.BoxGeometry(5.5, 5, 0.4), mats.dark, [[-8, 2.5, -8.1], [0, 2.5, -8.1], [8, 2.5, -8.1]], false));
    g.add(box(7, 2.6, 3, mats.orange, 0, 1.4, -13), box(2.6, 1.6, 2.8, mats.frame, -3.2, 3.2, -13)); }
  // 停著的第三架：遠處機坪，黃尾翼。
  { const pl = buildAirliner(THREE, { body: P.cream, tail: P.yellow, mark: P.navy, dark: P.dark }); pl.position.set(190, A.PLANE_REST_Y, 150); pl.rotation.y = -2.2; shadowOn(pl); world.add(pl); }
  // 加油車兩台（一台會走）、行李拖車一組（會繞）、幾個地勤。
  const fuel = []; for (const [x, z] of [[150, 30], [60, 70]]) { const g = truck(mats, true); g.position.set(x, 0, z); world.add(g); fuel.push(g); }
  const tug = new THREE.Group(); { const t = truck(mats, false); tug.add(t); for (let k = 1; k <= 3; k++) { const c = box(2.2, 1.4, 2.4, mats.grey, 0, 0.9, -3.2 * k); c.add(box(2.2, 0.6, 2.2, mats.navy, 0, 0.9, 0)); tug.add(c); } world.add(tug); }
  for (const [x, z, ry] of [[112, 48, 0.4], [126, 30, -1.2], [88, 52, 2.2]]) { const f = figure(mats, { shirt: P.navy, vest: true }); f.position.set(x, 0, z); f.rotation.y = ry; f.userData.baseY = 0; world.add(f); idleFigs.push(f); }
  world.add(instanced(new THREE.ConeGeometry(0.35, 0.8, 6), mats.orange, [[108, 0.4, 44], [110, 0.4, 56], [132, 0.4, 44], [130, 0.4, 58]], false));
  // 樹：陸側一排、停機坪邊、跑道外幾叢。
  {
    const places = [];
    for (let x = -20; x <= 140; x += 9) places.push([x + (x % 2) * 2, 0, T.z0 - 10 - (x % 3) * 2, x, 0.9 + (x % 5) / 10]);
    for (let z = 20; z <= 220; z += 16) places.push([-25 + (z % 3) * 3, 0, z, z, 1]);
    for (let x = -300; x <= 300; x += 45) places.push([x, 0, 470 + (x % 4) * 6, x, 1.1], [x + 20, 0, 330 - (x % 3) * 5, x, 0.9]);
    for (let z = 240; z <= 320; z += 20) places.push([340, 0, z, z, 1]);
    world.add(instanced(treeGeo(), mats.leaf, places), instanced(trunkGeo(), mats.trunk, places));
  }
  // 雲：好幾顆低多邊形的球疊成一團，奶油白往白推、自己微微發光、不投影也不接影（才不會被地面的草色與影子染成褐色）。
  // 沿著爬升的路放（飛機往 -x 爬到 x 約 -1550、高 420），在飛機旁邊與底下，爬升時從旁邊過；慢慢飄。
  const clouds = [];
  const cloudGeo = [new THREE.IcosahedronGeometry(10, 1), new THREE.IcosahedronGeometry(14, 1), new THREE.IcosahedronGeometry(18, 1)];
  for (let i = 0; i < 14; i++) {
    const g = new THREE.Group(); const n = 4 + (i % 3);
    for (let k = 0; k < n; k++) { const s = new THREE.Mesh(cloudGeo[(i + k) % 3], mats.cloud); s.position.set((k - n / 2) * 13 + ((k * 7) % 5), (k % 2) * 4 - ((k * 3) % 4), ((k * 11) % 10) - 5); s.scale.set(1.15, 0.5 + (k % 2) * 0.1, 1); s.castShadow = false; s.receiveShadow = false; g.add(s); }
    const t = i / 13, side = i % 2 ? 1 : -1;
    g.position.set(-120 - t * 1500, 90 + t * 300 - 70 + (i % 3) * 30, A.RUNWAY.z + side * (80 + (i % 4) * 60));
    g.userData.v = 0.5 + (i % 3) * 0.3; world.add(g); clouds.push(g);
  }

  // ═══ 我們那一架 ═══
  const plane = buildAirliner(THREE, { body: P.cream, tail: P.orange, mark: P.cream, dark: P.dark }); shadowOn(plane); world.add(plane);
  // 旅客
  const traveller = figure(mats, { shirt: P.teal, backpack: true, phase: 0 }); traveller.userData.baseY = 0; world.add(traveller);
  // 走道上來回走的兩個人
  const walkers = [];
  for (const [x0, x1, z, sp, k] of [[10, 95, -17, 1.2, 0], [90, 20, -24, 1.0, 2], [30, 100, -14, 0.9, 3], [105, 5, -26.5, 1.1, 4]]) { const f = figure(mats, { shirt: figMats[k % figMats.length], bag: figMats[(k + 2) % figMats.length] }); f.userData.baseY = 0; f.userData.w = { x0, x1, z, sp }; term.add(f); walkers.push(f); }

  // ═══ 站：小場景與錨點記號 ═══
  const stopsGroup = new THREE.Group(); world.add(stopsGroup);
  let stopMarkers = [];
  function setStops(w, motifs) {
    stopsGroup.clear(); stopMarkers = [];
    w.stops.forEach((s, i) => {
      const g = new THREE.Group(); g.position.set(s.anchor[0], s.anchor[1], s.anchor[2]); g.rotation.y = s.yaw || 0;
      const scale = s.phase === "terminal" ? 1 : 2.2;   // 停機坪離鏡頭遠，小場景放大才看得到
      const v = vignette(motifs[i] || "signpost", mats, P, s); v.scale.setScalar(scale); g.add(v);
      // 地上（或空中）一個橘色的記號，卡的尾巴指到這裡。
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.9 * scale, 0.9 * scale, 0.08, 16), mats.orangeLight); disc.position.y = s.air ? 0 : 0.05; disc.receiveShadow = false; g.add(disc);
      // 在空中的站（起飛之後）：底下墊一小團雲，小場景才不是浮在半空。
      if (s.air) for (let k = 0; k < 3; k++) { const c = new THREE.Mesh(new THREE.IcosahedronGeometry(3.2 + k, 0), mats.cloud); c.position.set((k - 1) * 4.5, -2.6 - (k % 2), (k % 2) * 2); c.scale.y = 0.5; g.add(c); }
      stopsGroup.add(g); stopMarkers.push(g);
    });
  }

  // ═══ 看板與登機門牌 ═══
  // 出發看板：版面照 airport.js 的 boardLayout（寬 2048、列高至少 48 像素），現在這一站那一列整列橘底深藍字；站多到放不下就只畫現在這一站附近的幾列。
  // 換站的時候整塊翻一下（render() 看 boardFlip：先壓扁、換貼圖、再彈回來），翻牌看板的感覺。
  let boardFlip = null, boardCurrent = -1;
  function setBoard(rows) {
    const lines = A.boardLines(rows), n = lines.length, L = A.boardLayout(n), current = Math.max(0, lines.findIndex(l => l.now));
    const from = A.boardWindow(n, current, L.visible);
    const cols = [60, 340, 1240, 1500, 1720];
    const tl = ["TIME", "DESTINATION", "FLIGHT", "GATE", "STATUS"].map((t, k) => ({ text: t, x: cols[k], y: 70, font: `700 44px ${fonts.display}`, color: palette.grey }));
    const rects = [];
    lines.slice(from, from + L.visible).forEach((l, i) => {
      const y = L.top + i * L.rowH + L.rowH / 2;
      if (l.now) rects.push({ x: 24, y: y - L.rowH / 2 + 3, w: L.width - 48, h: L.rowH - 6, color: palette.orange });
      const col = l.now ? palette.navy : palette.cream;
      cols.forEach((x, k) => tl.push({ text: String(l.cells[k]).slice(0, k === 1 ? 34 : 12), x, y, font: `700 ${Math.round(L.rowH * 0.6)}px ${fonts.display}`, color: k === 4 && !l.now ? palette.sand : col }));
    });
    const tex = textTexture(L.width, L.height, palette.navy, tl, rects);
    if (boardCurrent >= 0 && boardCurrent !== current && boards[0].material.map) boardFlip = { tex, t0: null };
    else boards.forEach(b => { if (b.material.map) b.material.map.dispose(); b.material.map = tex; b.material.needsUpdate = true; });
    boardCurrent = current;
  }
  function setGate(label) {
    const tex = textTexture(512, 136, palette.navy, [{ text: "GATE", x: 40, y: 68, font: `700 48px ${fonts.display}`, color: palette.sand }, { text: label, x: 472, y: 68, font: `700 92px ${fonts.display}`, color: palette.cream, align: "right" }]);
    for (const s of [gateSign, gateSign2]) { if (s.material.map) s.material.map.dispose(); s.material = lam(P.white, { map: tex }); }
    if (bridgeSign) { const t2 = textTexture(1024, 276, palette.navy, [{ text: "BT", x: 60, y: 138, font: `700 150px ${fonts.display}`, color: palette.orange }, { text: "GATE " + label, x: 964, y: 138, font: `700 120px ${fonts.display}`, color: palette.cream, align: "right" }]); bridgeSign.material = lam(P.white, { map: t2, emissive: P.navy, emissiveIntensity: 0.2 }); }
  }

  // ═══ 每一幀 ═══
  let W = 1, Hh = 1, lastFov = -1;
  function resize(w, h) { W = w; Hh = h; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
  const tmpV = new THREE.Vector3(), lookV = new THREE.Vector3();
  function render(e, t) {
    // 鏡頭
    const c = A.cameraAt(e, phone);
    camera.position.set(c.pos[0], c.pos[1], c.pos[2]); lookV.set(c.look[0], c.look[1], c.look[2]); camera.lookAt(lookV);
    if (c.fov !== lastFov) { lastFov = c.fov; camera.fov = c.fov; camera.updateProjectionMatrix(); }
    // 飛機
    const qp = A.planePoseAt(e);
    plane.position.set(qp.x, qp.y + A.PLANE_REST_Y, qp.z); plane.rotation.set(-qp.pitch, qp.yaw, 0);
    if (plane.userData.gear !== qp.gear) setGear(plane, qp.gear);
    steerNose(plane, qp.steer);
    // 旅客
    const tr = A.travellerAt(e);
    traveller.visible = tr.visible;
    if (tr.visible) { traveller.position.set(tr.pos[0], tr.pos[1], tr.pos[2]); traveller.userData.baseY = tr.pos[1]; traveller.rotation.y = tr.yaw; walkCycle(traveller, t, tr.walking); }
    // 天空與霧：離地之後慢慢變成高空的藍、霧變薄（機場在底下的霧裡縮小）。
    const lift = qp.lift || 0;
    scene.background.copy(P.sky).lerp(P.skyHigh, lift * 0.85); scene.fog.color.copy(P.sky).lerp(P.skyHigh, lift * 0.5);
    // 室內（航廈與空橋）霧幾乎關掉、半球光的地面色換成沙色，裡面才不會灰綠；升出空橋的那一段慢慢換回室外的。
    const inside = 1 - smooth(clamp01((e - 0.335) / 0.065));
    scene.fog.density = lerp(lerp(0.0022, 0.0009, lift), 0.0005, inside);
    hemi.groundColor.copy(P.grass).lerp(P.sand, inside * 0.7); hemi.intensity = lerp(lerp(0.95, 0.7, lift), 1.1, inside);
    // 太陽跟著鏡頭看的點；室內陰影的範圍小、室外大。
    sun.target.position.copy(lookV); sun.position.copy(lookV).add(SUN_OFF);
    setShadowSpan(e < A.PHASES.apron[0] ? 70 : e < A.PHASES.takeoff[0] ? 220 : 400);
    // 閒置：信標、雲、加油車、行李車、走道上的人、原地的人。
    beacon.rotation.y = t * 2.4;
    if (boardFlip) {
      if (boardFlip.t0 == null) boardFlip.t0 = t;
      const u = (t - boardFlip.t0) / 0.5, sy = u < 0.5 ? 1 - u * 2 : Math.min(1, (u - 0.5) * 2);
      if (u >= 0.5 && boardFlip.tex) { boards.forEach(b => { if (b.material.map) b.material.map.dispose(); b.material.map = boardFlip.tex; b.material.needsUpdate = true; }); boardFlip.tex = null; }
      boards.forEach(b => { b.scale.y = Math.max(0.02, sy); });
      if (u >= 1) boardFlip = null;
    }
    for (const cl of clouds) cl.position.x += cl.userData.v * 0.016;
    fuel[0].position.x = 150 + Math.sin(t * 0.12) * 40; fuel[0].rotation.y = Math.cos(t * 0.12) > 0 ? Math.PI / 2 : -Math.PI / 2;
    { const u = (t * 0.03) % 1, ang = u * Math.PI * 2; tug.position.set(100 + Math.cos(ang) * 26, 0, 110 + Math.sin(ang) * 26); tug.rotation.y = -ang; }
    for (const f of walkers) { const w = f.userData.w, span = Math.abs(w.x1 - w.x0), u = (t * w.sp) % (span * 2), d = u < span ? u : span * 2 - u; const dir = (u < span) === (w.x1 > w.x0) ? 1 : -1; f.position.set(Math.min(w.x0, w.x1) + d, 0, w.z); f.rotation.y = dir > 0 ? Math.PI / 2 : -Math.PI / 2; walkCycle(f, t, true); }
    for (const f of idleFigs) walkCycle(f, t, false);
    renderer.render(scene, camera);
  }
  // 世界的一點投到螢幕（像素）。回 { x, y, visible, depth }。
  function project(anchor) {
    tmpV.set(anchor[0], anchor[1] + 1.2, anchor[2]).project(camera);
    return { x: (tmpV.x + 1) / 2 * W, y: (1 - tmpV.y) / 2 * Hh, visible: tmpV.z < 1 && tmpV.x > -1.3 && tmpV.x < 1.3 && tmpV.y > -1.3 && tmpV.y < 1.3, depth: tmpV.z };
  }
  function dispose() { renderer.dispose(); }
  return { setStops, setBoard, setGate, resize, render, project, dispose, renderer, scene, camera, stopMarkers: () => stopMarkers };
}
const idleFigs = [];

function shadowOn(g) { g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; } }); }
// 一輛小車：駕駛室加車斗（或油罐）。
function truck(mats, tank) {
  const g = new THREE.Group();
  g.add(box(2.2, 1.6, 2.2, mats.orange, 0, 1.2, 1.9), box(2.3, 0.6, 6.4, mats.grey, 0, 0.5, -0.6));
  if (tank) { const t = cyl(1.0, 1.0, 4.4, mats.sand, 0, 1.6, -1.2, 10); t.rotation.x = Math.PI / 2; g.add(t); } else g.add(box(2, 0.9, 2, mats.navy, 0, 1.2, -0.6));
  for (const [x, z] of [[-1.1, 1.6], [1.1, 1.6], [-1.1, -2.6], [1.1, -2.6]]) { const w = cyl(0.42, 0.42, 0.3, mats.dark, x, 0.42, z, 8); w.rotation.z = Math.PI / 2; g.add(w); }
  return g;
}
// 沿一串點鋪一條帶子（滑行道、中線）。half 是半寬、y 是離地高度。
function ribbon(points, half, y, material) {
  const step = 6, pos = [], idx = [];
  const pts = points.filter((_, i) => i % step === 0 || i === points.length - 1);
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1, nx = dz / l, nz = -dx / l;
    pos.push(pts[i][0] + nx * half, y, pts[i][1] + nz * half, pts[i][0] - nx * half, y, pts[i][1] - nz * half);
    if (i) { const k = i * 2; idx.push(k - 2, k - 1, k, k - 1, k + 1, k); }
  }
  const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, material); m.receiveShadow = true; return m;
}

// ── 八種小場景（名字由 data.js 的 motifFor 決定，認不出來就是指示牌）。每一種三個以上的東西。 ──
// 要加一種：在這裡加一個 case，再到 data.js 的 MOTIF_RULES 加關鍵字，airport.js 的 MOTIFS 加名字。
function vignette(motif, mats, P, stop) {
  const g = new THREE.Group();
  const person = (x, z, ry, shirt, vest) => { const f = figure(mats, { shirt, vest }); f.position.set(x, 0, z); f.rotation.y = ry; f.userData.baseY = 0; idleFigs.push(f); g.add(f); return f; };
  const post = (x, z, h) => g.add(cyl(0.06, 0.06, h, mats.frame, x, h / 2, z, 6));
  switch (motif) {
    case "seven":   // 成立：七個人圍成一圈
      for (let k = 0; k < 7; k++) { const a = k / 7 * Math.PI * 2; person(Math.sin(a) * 1.6, Math.cos(a) * 1.6, a + Math.PI, k % 2 ? P.teal : P.navy); }
      g.add(cyl(0.5, 0.5, 0.9, mats.sand, 0, 0.45, 0, 8));
      break;
    case "seats":   // 導生：兩張椅子面對面、一張小桌
      g.add(box(0.8, 0.5, 0.8, mats.navy, -1, 0.25, 0), box(0.8, 0.5, 0.8, mats.navy, 1, 0.25, 0), cyl(0.5, 0.4, 0.7, mats.sand, 0, 0.35, 0, 8));
      person(-1, 0, Math.PI / 2, P.teal); person(1, 0, -Math.PI / 2, P.sand);
      break;
    case "board":   // 博覽會：一面立牌、一張桌、兩個人
      post(-1.2, -0.6, 2.2); post(1.2, -0.6, 2.2); g.add(box(2.6, 1.4, 0.1, mats.navy, 0, 1.6, -0.6, false), box(2.4, 0.8, 1, mats.sand, 0, 0.4, 0.4));
      person(-0.6, 1.6, Math.PI, P.teal); person(0.8, 1.9, Math.PI + 0.4, P.navy);
      break;
    case "sign":    // 大使：一支立牌加兩個學生
      post(0, 0, 2.6); g.add(box(1.8, 1.0, 0.1, mats.orange, 0, 2.2, 0, false), box(1.2, 0.3, 0.12, mats.navy, 0, 1.5, 0, false));
      person(-0.9, 0.9, -0.5, P.sand); person(0.9, 0.9, 0.5, P.teal);
      break;
    case "boarding":   // 探索營：排隊登機的一排人、一支分隔柱
      for (let k = 0; k < 5; k++) person(-2 + k * 0.9, 0, Math.PI / 2, k % 2 ? P.teal : P.sand);
      post(-2.8, 0.8, 1); post(2.8, 0.8, 1); g.add(box(5.6, 0.04, 0.04, mats.orange, 0, 0.9, 0.8, false));
      break;
    case "tail": {  // 校友：一片放大的橘尾翼站在台座上，上面一片台灣
      g.add(box(2.4, 0.3, 1.2, mats.grey, 0, 0.15, 0));
      const s = new THREE.Shape(); [[0, 0], [2.4, 0], [3.0, 2.6], [1.8, 2.6]].forEach(([x, y], i) => i ? s.lineTo(x, y) : s.moveTo(x, y)); s.closePath();
      const fin = new THREE.Mesh(new THREE.ExtrudeGeometry(s, { depth: 0.16, bevelEnabled: false }), mats.orange); fin.position.set(-1.4, 0.3, 0); fin.castShadow = true; g.add(fin);
      const isl = new THREE.Shape(); TAIWAN.forEach(([x, y], i) => isl[i ? "lineTo" : "moveTo"](x * 0.9, y * 0.9)); isl.closePath();
      const island = new THREE.Mesh(new THREE.ExtrudeGeometry(isl, { depth: 0.04, bevelEnabled: false }), mats.cream); island.position.set(0.6, 0.9, 0.16); g.add(island);
      person(1.6, 1.2, -0.6, P.teal);
      break; }
    case "crew":    // 幹部：地勤三個人、三角錐、一台行李車
      person(-1.2, 0.4, 0.3, P.navy, true); person(0.4, -0.6, -0.8, P.navy, true); person(1.6, 0.6, 2.4, P.navy, true);
      g.add(instanced(new THREE.ConeGeometry(0.22, 0.55, 6), mats.orange, [[-2, 0.28, -1.2], [2.2, 0.28, -1.4], [0, 0.28, 1.8]], false));
      g.add(box(2, 1.2, 1.6, mats.grey, 0, 0.7, -2.6), box(1.9, 0.5, 1.5, mats.navy, 0, 1.5, -2.6));
      break;
    default:        // 指示牌：一支柱、兩片箭頭板、一個看牌的人
      post(0, 0, 3);
      g.add(box(1.8, 0.4, 0.08, mats.orange, 0.6, 2.6, 0, false), box(1.5, 0.4, 0.08, mats.teal, -0.5, 2.0, 0.05, false));
      person(0.8, 1.4, Math.PI, P.sand);
  }
  void P; void stop;
  return g;
}

/* ── 這裡面才有動畫。外面不准出現 gsap。 ──
   釘住 stage、用捲動進度推鏡頭；閒置的時鐘（信標、雲、加油車、行李車、人）也從這裡發出去（onTick），render() 照時鐘擺它們。
   回傳幾個外面會用到的把手（跳到某一站、重算），外面拿到的只是函式，碰不到 gsap。 */
export function motion({ wrap, stage, onProgress, onTick }) {
  gsap.registerPlugin(ScrollTrigger);
  // 進度先經過一個很短的追趕，捲動停下來鏡頭還會滑半拍。
  // ⚠ 不用 gsap.quickTo：它記得自己上一次的起點，直接改 proxy.p 它不會知道（2026-11-06 實測帶 #代號 進來畫面會從第一站滑到第五站）。
  const proxy = { p: 0 };
  const chase = (p, instant) => {
    gsap.killTweensOf(proxy);
    if (instant) { proxy.p = p; onProgress(p); return; }
    gsap.to(proxy, { p, duration: 0.55, ease: "power2.out", overwrite: true, onUpdate: () => onProgress(proxy.p) });
  };
  const st = ScrollTrigger.create({
    trigger: wrap, start: "top top", end: "bottom bottom", pin: stage, pinSpacing: false, anticipatePin: 1,
    onUpdate: self => chase(self.progress),
    onRefresh: self => chase(self.progress, true),
  });
  const t0 = gsap.ticker.time;
  gsap.ticker.add(() => onTick(gsap.ticker.time - t0));
  return {
    refresh: () => ScrollTrigger.refresh(),
    scrollFor: p => st.start + (st.end - st.start) * clamp01(p),
    range: () => ({ start: st.start, end: st.end }),
    jump: (p, instant) => {
      const y = st.start + (st.end - st.start) * clamp01(p);
      if (instant) { chase(p, true); window.scrollTo(0, y); }
      else { const o = { y: window.scrollY }; gsap.to(o, { y, duration: 0.9, ease: "power2.inOut", onUpdate: () => window.scrollTo(0, o.y) }); }
    },
  };
}
void smooth; void DEG;
