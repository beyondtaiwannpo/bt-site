// /history/ 的場景：一座 Three.js 的機場。航廈走到登機門、空橋、上飛機、推出去滑行、起飛。
//
// ── 讀這一支之前先知道五件事 ──
// 1. **資料與場景分開。** 沒有任何一站的文字；看板的字只從 ui.js 的 boardRows 來。
// 2. **沒有模型檔、沒有貼圖檔。** 全部是基本幾何與程式畫的 canvas。
// 3. **顏色不寫色碼。** 七色從 shared/brand.css 讀進來（palette），
//    沒有新色票。check.sh 的色碼掃描因此在這裡找不到任何 #。
// 4. **會動的只有 motion()。** gsap 只准出現在 motion() 裡。
//    減少動態、?motion=off、沒有 WebGL、Three 或 GSAP 載不到，
//    main.js 都不會走到這裡（airport.js 的 pickMode），畫的是直立時間軸。
// 5. **數字都在 airport.js**（純函式）。
//
// 單位公尺，y 朝上。航廈沿 x 軸，玻璃牆 z=0，跑道 z=400，飛機往 -x 起飛。

import * as THREE from "three";
import * as A from "./airport.js";
import { buildAirliner, setGear, steerNose, TAIWAN } from "./plane.js";
import { peopleFromPalette } from "../../shared/toy.js";
import { buildTerminal } from "./terminal.js";
import { buildGrounds } from "./grounds.js";
import { buildDecor } from "./decor.js";
import { buildTraffic } from "./traffic.js";

const clamp01 = v => Math.min(1, Math.max(0, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = t => t * t * (3 - 2 * t);
const DEG = Math.PI / 180;

// WebGL 開不出 context 就走直立時間軸。
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
  // 磨石子（2026-11-18 第三批）：撒一些灰與沙色的小點，地板才不是一片平的奶油色。
  let a = 7; const rnd = () => { a = (a * 1103515245 + 12345) & 0x7fffffff; return a / 0x7fffffff; };
  for (let i = 0; i < 260; i++) { ctx.fillStyle = i % 3 ? p.grey : p.sand; ctx.globalAlpha = 0.12 + rnd() * 0.16; const r = 0.6 + rnd() * 1.6; ctx.beginPath(); ctx.arc(rnd() * 128, rnd() * 128, r, 0, Math.PI * 2); ctx.fill(); }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.anisotropy = 8;
  return tex;
}
// 表面的貼圖：底色加斑點，可選每 spacing 像素一條格線。重複貼。
function surfaceTexture(base, spots, n, lines, seed) {
  const c = document.createElement("canvas"); c.width = c.height = 256;
  const ctx = c.getContext("2d"); ctx.fillStyle = base; ctx.fillRect(0, 0, 256, 256);
  let a = seed || 3; const rnd = () => { a = (a * 1103515245 + 12345) & 0x7fffffff; return a / 0x7fffffff; };
  for (let i = 0; i < n; i++) { ctx.fillStyle = spots[i % spots.length]; ctx.globalAlpha = 0.025 + rnd() * 0.06; const r = 3 + rnd() * 11; ctx.beginPath(); ctx.arc(rnd() * 256, rnd() * 256, r, 0, Math.PI * 2); ctx.fill(); }
  if (lines) { ctx.globalAlpha = 0.22; ctx.strokeStyle = spots[0]; ctx.lineWidth = 2; for (let k = 0; k < 256; k += lines.x || 256) { ctx.beginPath(); ctx.moveTo(k + 1, 0); ctx.lineTo(k + 1, 256); ctx.stroke(); } for (let k = 0; k < 256; k += lines.y || 256) { ctx.beginPath(); ctx.moveTo(0, k + 1); ctx.lineTo(256, k + 1); ctx.stroke(); } }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.anisotropy = 8;
  return tex;
}

// 一個人：BT 島那一批大頭 chibi（shared/toy.js 的 peopleKit）。
// opts：shirt、seated、backpack、bag、vest（地勤，戴帽）、staff（戴帽）、skirt、phase。
let people = null, figN = 0;
function figure(mats, opts) {
  const o = opts || {}, P = mats.P;
  if (!people) people = peopleFromPalette(mats.palette, 5, mats.world, 420);   // 2026-11-18 機場裡外兩百八十幾個人，預設的 256 不夠
  const shirtIdx = c => { const list = [P.orange, P.teal, P.yellow, P.navy, P.cream, P.sand]; let best = 4, bd = Infinity; list.forEach((x, i) => { const d = c ? Math.hypot(x.r - c.r, x.g - c.g, x.b - c.b) : Infinity; if (d < bd) { bd = d; best = i; } }); return best; };
  const k = o.phase != null ? Math.floor(o.phase * 97) : figN++;
  const g = people.makePerson({ shirt: o.shirt ? shirtIdx(o.shirt) : k % 6, hair: (k * 7) % 3, skin: k % 3, pants: (k * 5) % 3, pack: !!o.backpack, bag: !!o.bag, hat: !!(o.vest || o.staff), scale: 1.0 });
  g.name = "figure"; g.userData.baseY = 0; if (o.seated) g.userData.sitting = true;
  return g;
}
const wr = a => Math.atan2(Math.sin(a), Math.cos(a));   // 角度差折到 -π 到 π
function walkCycle(fig, t, walking) { fig.userData.moving = !!walking && !fig.userData.sitting; people.pose(fig, t); }

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
    yellowLight: lam(P.yellow, { emissive: P.yellow, emissiveIntensity: 1.25 }), orangeLight: lam(P.orange, { emissive: P.orange, emissiveIntensity: 1 }),
    skin: lam(P.skin),
    cloud: lam(P.cloud, { emissive: P.cloud, emissiveIntensity: 0.55, transparent: true, opacity: 0.96 }), ceiling: lam(P.ceiling, { emissive: P.cream, emissiveIntensity: 0.45 }), floor: null, trunk: lam(P.trunk), leaf: lam(P.grassDark), mark: lam(P.cream),
    column: lam(P.column), light: lam(P.sand, { emissive: P.sand, emissiveIntensity: 0.7 }), plant: lam(P.plant), pot: lam(P.navy.clone().lerp(P.grey, 0.5)),
    P, palette,
  };
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(q.dpr);
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  // 陰影貼圖不是每一幀重畫（之前每一幀重畫，一幀一半的 draw call 在畫影子）。
  // 看的點走了 3 公尺、飛機動了 2 公尺、或半秒沒畫過才重畫（shadowTick）。
  renderer.shadowMap.autoUpdate = false; renderer.shadowMap.needsUpdate = true;
  const scene = new THREE.Scene();
  scene.background = P.sky.clone();
  scene.fog = new THREE.FogExp2(P.sky.clone(), 0.0022);
  const camera = new THREE.PerspectiveCamera(A.CAM_FOV.inside, 16 / 9, 0.3, 6000);
  scene.add(camera);

  // 光：半球光加方向光帶軟陰影，方向光跟著鏡頭看的點走。
  const hemi = new THREE.HemisphereLight(P.sky, P.grass, 0.95); scene.add(hemi);
  const sun = new THREE.DirectionalLight(P.cream, 1.7);
  sun.castShadow = true; sun.shadow.mapSize.set(q.shadow, q.shadow);
  sun.shadow.camera.near = 10; sun.shadow.camera.far = 900; sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.6; sun.shadow.radius = 2;   /* 順不順批 4：影子收緊（之前 4，飛機的影子糊成一團）*/
  scene.add(sun, sun.target);
  const SUN_OFF = new THREE.Vector3(-110, 170, -70);
  let shadowSpan = 0;
  const setShadowSpan = s => { if (s === shadowSpan) return; shadowSpan = s; const c = sun.shadow.camera; c.left = -s; c.right = s; c.top = s; c.bottom = -s; c.updateProjectionMatrix(); };

  const world = new THREE.Group(); scene.add(world); mats.world = world;   // 人的 InstancedMesh 掛在這裡（figure() 第一次叫的時候建）
  const T = A.TERMINAL;

  // ═══ 地 ═══
  // 地面與停機坪：草地有深淺的斑塊、停機坪有水泥板的縫與污漬。
  const grassTex = surfaceTexture(palette.sand, [palette.teal, palette.navy, palette.cream], 140, null, 5); grassTex.repeat.set(14000 / 48, 14000 / 48);
  const apronTex = surfaceTexture(palette.cream, [palette.grey, palette.navy], 50, { x: 128, y: 128 }, 9); apronTex.repeat.set(340 / 12, 220 / 12);
  mats.ground = lam(P.grass.clone().lerp(P.sand, 0.15), { map: grassTex }); mats.apronTex = lam(P.apron.clone().lerp(P.grey, 0.1), { map: apronTex });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(14000, 14000), mats.ground); ground.rotation.x = -Math.PI / 2; ground.position.y = -0.05; ground.receiveShadow = true; world.add(ground);
  const apron = new THREE.Mesh(new THREE.PlaneGeometry(340, 220), mats.apronTex); apron.rotation.x = -Math.PI / 2; apron.position.set(90, 0, 110); apron.receiveShadow = true; world.add(apron);
  // 滑行道：沿樣條鋪一條 18 公尺寬的帶子，中線一條黃線，兩邊每 12 公尺一顆邊燈。
  const tw = A.taxiway(), R0 = A.RUNWAY;
  const twp = tw.points.slice(165, -341);   // 停機位那 18 公尺不鋪、進跑道那 60 公尺不鋪（跑道本身是柏油）
  world.add(ribbon(twp, 9, 0.02, mats.taxi), ribbon(tw.points, 0.45, 0.05, mats.yellowLight));   /* 中線 0.9 公尺寬，從高處看才像真的那條黃線 */
  { const ch = []; for (let k = 0; k < 4; k++) for (const s of [-1, 1]) ch.push([R0.x1 + 36 + k * 11, 0.06, R0.z + s * 7, s * Math.PI / 4, 1]); world.add(instanced(new THREE.BoxGeometry(18, 0.04, 1.2), mats.yellowLight, ch, false)); }   /* 跑道 27 端前的擋風坪：黃色人字 */
  for (const o of [-8.6, -8.2, 8.2, 8.6]) world.add(ribbon(twp, 0.1, 0.05, mats.yellowLight, o));   // 滑行道兩邊各兩條黃邊線（批 D，Paul：滑行道上什麼都沒有）；燈在 traffic.js
  // 跑道：長條、跑道頭的條紋、號碼、中線虛線、邊燈、等待線。
  const R = A.RUNWAY;
  world.add(box(R.x1 - R.x0, 0.1, R.half * 2, mats.asphalt, (R.x0 + R.x1) / 2, -0.02, R.z, false));
  {
    const stripes = []; for (let k = 0; k < 12; k++) stripes.push([R.x1 - 30, 0.06, R.z - 19.25 + k * 3.5], [R.x0 + 30, 0.06, R.z - 19.25 + k * 3.5]);   // 兩端各 12 條鋼琴鍵（44 公尺寬的跑道）
    world.add(instanced(new THREE.BoxGeometry(30, 0.04, 1.8), mats.cream, stripes, false), instanced(new THREE.BoxGeometry(R.x1 - R.x0, 0.04, 0.9), mats.cream, [[(R.x0 + R.x1) / 2, 0.06, R.z - R.half + 1], [(R.x0 + R.x1) / 2, 0.06, R.z + R.half - 1]], false));   // 白色邊線
    const dashes = []; for (let x = R.x1 - 80; x > R.x0 + 40; x -= 60) dashes.push([x, 0.06, R.z]);
    world.add(instanced(new THREE.BoxGeometry(30, 0.04, 0.9), mats.cream, dashes, false));
    const num = new THREE.Mesh(new THREE.PlaneGeometry(14, 22), lam(P.white, { map: textTexture(256, 400, palette.cream, [{ text: "27", font: `700 300px ${fonts.display}`, color: palette.navy, x: 128, y: 200, align: "center" }]) }));
    num.rotation.x = -Math.PI / 2; num.rotation.z = Math.PI / 2; num.position.set(R.x1 - 60, 0.07, R.z); num.receiveShadow = false; world.add(num);
  }

  // ═══ 航廈 ═══
  const term = new THREE.Group(); world.add(term);
  const tx = (T.x0 + T.x1) / 2, tz = (T.z0 + T.z1) / 2, tw_ = T.x1 - T.x0, td = T.z1 - T.z0;
  const figMats = [P.cream, P.teal, P.orange, P.cream, P.sand, P.navy];
  const pick = i => figMats[i % figMats.length];
  // 地板、天花板、三面實牆、玻璃牆。屋頂不投影，裡面才亮。
  const tile = tileTexture(palette); tile.repeat.set(tw_ / 4, td / 4); mats.floor = lam(P.cream, { map: tile });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(tw_, td), mats.floor); floor.rotation.x = -Math.PI / 2; floor.position.set(tx, 0.01, tz); floor.receiveShadow = true; term.add(floor);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(tw_, td), mats.ceiling); ceil.rotation.x = Math.PI / 2; ceil.position.set(tx, T.h - 0.7, tz); term.add(ceil);   // 比屋頂板的底面低 0.3，不然兩個面重疊會閃（z-fighting）
  {
    const panels = [], lights = [];
    for (let x = T.x0 + 3; x < T.x1 - 2; x += 6) for (let z = T.z0 + 3; z < T.z1 - 2; z += 6) if (Math.abs(z + 20) > 3.5) panels.push([x, T.h - 1.0, z]);
    for (let x = T.x0 + 6; x < T.x1; x += 12) for (const z of [-30, -20, -10]) lights.push([x, T.h - 1.25, z]);
    term.add(instanced(new THREE.BoxGeometry(5.4, 0.25, 5.4), lam(P.ceiling, { emissive: P.cream, emissiveIntensity: 0.3 }), panels, false));
    term.add(instanced(new THREE.BoxGeometry(5, 0.14, 0.7), mats.light, lights, false));
    // 走道上方一條天窗（2026-11-18）：玻璃帶加橫框，白天的光從上面下來。
    { const sky = new THREE.Mesh(new THREE.PlaneGeometry(tw_, 6), mats.glass); sky.rotation.x = Math.PI / 2; sky.position.set(tx, T.h - 0.95, -20); term.add(sky); const bars = []; for (let x = T.x0 + 3; x < T.x1; x += 6) bars.push([x, T.h - 0.95, -20]); term.add(instanced(new THREE.BoxGeometry(0.2, 0.2, 6), mats.frame, bars, false), box(tw_, 0.2, 0.2, mats.frame, tx, T.h - 0.95, -23, false), box(tw_, 0.2, 0.2, mats.frame, tx, T.h - 0.95, -17, false)); }
  }
  const roof = box(tw_ + 3, 0.8, td + 3, mats.roof, tx, T.h, tz, false); roof.receiveShadow = false; term.add(roof);
  // 牆：牆板每 3 公尺一道縫、每 4 公尺一道橫縫，長牆與短牆各一個材質。
  const wallTexOf = (len, h) => { const t = surfaceTexture(palette.cream, [palette.grey, palette.sand], 30, { x: 256, y: 256 }, 13); t.repeat.set(len / 3, h / 4); return lam(P.wall, { side: THREE.DoubleSide, map: t }); };
  const sideM = wallTexOf(tw_, T.h), endM = wallTexOf(td, T.h);
  for (const [w, h, d, x, y, z, m_] of [[tw_, T.h, 0.6, tx, T.h / 2, T.z0, sideM], [0.6, T.h, td, T.x0, T.h / 2, tz, endM], [0.6, T.h, td, T.x1, T.h / 2, tz, endM]]) { const m = box(w, h, d, m_, x, y, z, false); term.add(m); }
  // 陸側牆上一條深藍的帶子、幾扇門、幾面橘色的指標
  term.add(box(tw_, 1.0, 0.2, mats.navy, tx, T.h - 1.6, T.z0 + 0.4, false));
  term.add(instanced(new THREE.BoxGeometry(3, 3.2, 0.3), mats.frame, [[10, 1.6, T.z0 + 0.4], [60, 1.6, T.z0 + 0.4], [95, 1.6, T.z0 + 0.4]], false));
  // 玻璃牆：登機門那裡留 4 公尺的洞；直櫺每 4 公尺一支。
  const gd = A.GATE_DOOR[0], gh = T.h - 0.8;
  for (const [x0, x1] of [[T.x0, gd - 2], [gd + 2, T.x1]]) { const gl = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, gh), mats.glass); gl.position.set((x0 + x1) / 2, gh / 2, T.z1); term.add(gl); }
  {
    const v = []; for (let x = T.x0; x <= T.x1; x += 4) if (Math.abs(x - gd) > 2.2) v.push([x, gh / 2, T.z1]);
    term.add(instanced(new THREE.BoxGeometry(0.25, gh, 0.35), mats.frame, v, false));
    term.add(instanced(new THREE.BoxGeometry(gd - 2 - T.x0, 0.22, 0.35), mats.frame, [[(T.x0 + gd - 2) / 2, 4, T.z1], [(T.x0 + gd - 2) / 2, 8, T.z1]], false));
    term.add(instanced(new THREE.BoxGeometry(T.x1 - gd - 2, 0.22, 0.35), mats.frame, [[(gd + 2 + T.x1) / 2, 4, T.z1], [(gd + 2 + T.x1) / 2, 8, T.z1]], false));
    term.add(box(4.4, gh - 3.4, 0.35, lam(P.wall), gd, 3.4 + (gh - 3.4) / 2, T.z1, false));   // 門上方的牆
  }
  // 登機門：門框、門檻、門上的牌（setGate 填），面向 -z。
  term.add(box(4.2, 0.35, 0.7, mats.navy, gd, 3.2, T.z1, false), box(0.35, 3.2, 0.7, mats.navy, gd - 1.95, 1.6, T.z1, false), box(0.35, 3.2, 0.7, mats.navy, gd + 1.95, 1.6, T.z1, false));
  const gateSign = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 1.1), lam(P.navy)); gateSign.position.set(gd, 4.1, T.z1 - 0.4); gateSign.rotation.y = Math.PI; term.add(gateSign);
  gateSign.userData.dynamic = true; const gateSign2 = gateSign.clone(); gateSign2.position.set(A.GATE_DESK[0] + 1.2, 1.9, A.GATE_DESK[1] - 0.62); gateSign2.rotation.y = Math.PI; gateSign2.scale.setScalar(0.5); term.add(gateSign2);
  // 柱子：兩排，每 15 公尺一支，淡沙色。
  {
    const cols = []; for (let x = T.x0 + 5; x < T.x1; x += 15) cols.push([x, T.h / 2, -30], [x, T.h / 2, -10]);
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
  // 報到櫃台在陸側大廳（terminal.js）。
  // 出發看板：三塊，掛在走道上方、正面朝 -x，字是 CanvasTexture（setBoard 換）。
  const boardMat = lam(P.white, { emissive: P.navy, emissiveIntensity: 0.15 }); const boards = [];
  for (const x of [-22, 60, 100]) {
    const g = new THREE.Group(); g.position.set(x, 6.3, -20); g.rotation.y = -Math.PI / 2;
    g.add(box(8.6, 3.4, 0.5, mats.navy, 0, 0, 0, false));
    const face = new THREE.Mesh(new THREE.PlaneGeometry(8, 2.9), boardMat); face.position.z = 0.26; g.add(face);
    const hang = instanced(new THREE.CylinderGeometry(0.06, 0.06, T.h - 8, 5), mats.grey, [[-3.8, (T.h - 8) / 2 + 1.7, 0], [3.8, (T.h - 8) / 2 + 1.7, 0]], false); g.add(hang);
    face.userData.dynamic = true; term.add(g); boards.push(face);
  }
  // 安檢在 x 0.5 到 5：鏡頭走 z -20、旅客走 z -17.5。
  {
    const x = 2.5, lanes = [-23, -20, -17.5];
    for (const z of lanes) term.add(box(0.3, 2.3, 0.3, mats.navy, x, 1.15, z - 0.75, false), box(0.3, 2.3, 0.3, mats.navy, x, 1.15, z + 0.75, false), box(0.3, 0.25, 1.8, mats.navy, x, 2.4, z, false), box(0.3, 0.06, 1.5, mats.orangeLight, x, 2.22, z, false));
    for (const z of [-26.2, -14.4]) { term.add(box(4.6, 0.9, 1.0, mats.grey, x, 0.45, z), box(1.8, 1.5, 1.3, mats.dark, x - 0.3, 1.2, z), box(0.5, 0.3, 0.9, mats.cream, x + 1.6, 1.0, z, false)); }
    term.add(box(0.5, 0.9, 14, mats.navy, x, 3.5, -20.3, false), box(0.52, 0.5, 3.6, mats.cream, x, 3.5, -20.3, false), box(0.5, 0.06, 14, mats.orangeLight, x, 3.0, -20.3, false));   // 頭上一條深藍的招牌
    for (const [z, ry] of [[-25.3, -Math.PI / 2], [-15.3, -Math.PI / 2], [-11.8, Math.PI / 2]]) { const f = figure(mats, { shirt: P.navy, staff: true }); f.position.set(x + 1.6, 0, z); f.userData.baseY = 0; f.rotation.y = ry; term.add(f); idleFigs.push(f); }
    const f2 = figure(mats, { shirt: pick(2), bag: pick(1) }); f2.position.set(x - 1.2, 0, -22.9); f2.userData.baseY = 0; f2.rotation.y = Math.PI / 2; term.add(f2); idleFigs.push(f2);
  }
  // 座位：候機區一排五張，青與橘輪流；有人坐著。
  {
    const seatsT = [], seatsO = [], benches = [];
    let k = 0;
    for (let x = 60; x <= 100; x += 7) for (const z of [-7, -11, -29, -33]) { benches.push([x, 0.28, z]); for (let i = 0; i < 5; i++) (k++ % 2 ? seatsT : seatsO).push([x - 2 + i, 0.62, z]); }
    term.add(instanced(new THREE.BoxGeometry(5.2, 0.12, 0.9), mats.grey, benches), instanced(new THREE.BoxGeometry(0.8, 0.5, 0.8), mats.teal, seatsT), instanced(new THREE.BoxGeometry(0.8, 0.5, 0.8), mats.orange, seatsO));
    for (const [x, z, i] of [[62, -7, 0], [71, -11, 1], [90, -29, 2], [96, -33, 3], [83, -7, 4], [67, -29, 1]]) { const f = figure(mats, { shirt: pick(i), seated: true, skirt: i % 3 === 1 }); f.position.set(x, 0.57, z + (z > -20 ? -0.15 : 0.15)); f.userData.baseY = 0.57; f.rotation.y = z > -20 ? Math.PI : 0; term.add(f); idleFigs.push(f); }
  }
  // 商店：陸側三間，各自一種顏色的門面與雨棚、一塊招牌、架上幾樣東西。
  // 店本身在 decor.js，這裡只剩雨棚與招牌的板子。
  for (const [x, , awn] of [[58, mats.teal, mats.orange], [72, mats.orange, mats.navy], [90, mats.navy, mats.teal]]) term.add(box(9.6, 0.3, 2.2, awn, x, 3.4, -33.6, false), box(6, 1, 0.2, mats.cream, x, 4.6, -34.4, false));
  // 盆栽：柱子旁與候機區幾盆。
  {
    const pots = [], leaves = [];
    for (const [x, z] of [[5, -27], [20, -13], [35, -27], [50, -13], [65, -27.5], [80, -12.5], [101, -30.2], [110, -27], [57, -8], [99, -8]]) { pots.push([x, 0.4, z]); leaves.push([x, 1.4, z, 0, 1]); }
    term.add(instanced(new THREE.CylinderGeometry(0.55, 0.45, 0.8, 8), mats.pot, pots), instanced(new THREE.IcosahedronGeometry(0.75, 0), mats.plant, leaves));
  }
  // ═══ 航廈裡再多一點東西 ═══
  // 咖啡店（x 48 到 56）：櫃台、咖啡機、菜單板、圓桌、坐著的人。
  {
    const cx = 52, cz = -6.5;
    term.add(box(5.5, 1.1, 1.2, mats.teal, cx, 0.55, cz - 2.2), box(5.7, 0.08, 1.4, mats.cream, cx, 1.14, cz - 2.2, false), box(0.9, 0.8, 0.6, mats.dark, cx - 1.6, 1.58, cz - 2.3, false), box(3.2, 1.0, 0.1, mats.navy, cx, 3.0, cz - 2.7, false), box(2.6, 0.12, 0.06, mats.cream, cx, 3.25, cz - 2.62, false), box(1.8, 0.12, 0.06, mats.cream, cx - 0.3, 2.95, cz - 2.62, false));
    const tables = [], stools = [];
    for (const [x, z] of [[cx - 3, cz + 1.4], [cx - 1, cz + 1.4], [cx + 1, cz + 1.4], [cx + 3, cz + 1.4]]) { tables.push([x, 0.72, z]); stools.push([x - 0.7, 0.3, z], [x + 0.7, 0.3, z]); }
    term.add(instanced(new THREE.CylinderGeometry(0.55, 0.55, 0.06, 12), mats.cream, tables, false), instanced(new THREE.CylinderGeometry(0.06, 0.08, 0.72, 6), mats.dark, tables.map(([x, , z]) => [x, 0.36, z]), false), instanced(new THREE.CylinderGeometry(0.22, 0.2, 0.42, 8), mats.orange, stools));
    for (const [x, z, i, ry] of [[cx - 3.7, cz + 1.4, 0, Math.PI / 2], [cx - 2.3, cz + 1.4, 1, -Math.PI / 2], [cx + 1.7, cz + 1.4, 2, -Math.PI / 2], [cx + 3.7, cz + 1.4, 3, Math.PI / 2]]) { const f = figure(mats, { shirt: pick(i), seated: true }); f.position.set(x, 0.3, z); f.userData.baseY = 0.3; f.rotation.y = ry; term.add(f); idleFigs.push(f); }
    { const f = figure(mats, { shirt: P.navy, staff: true }); f.position.set(cx + 0.6, 0, cz - 3.2); f.userData.baseY = 0; f.rotation.y = 0; term.add(f); idleFigs.push(f); }
  }
  // 書報攤（走道旁 x 28）：一個小亭子、雨棚、兩面雜誌架。（服務台搬到大廳，terminal.js）
  {
    term.add(box(4, 2.6, 3, mats.sand, 28, 1.3, -10.5), box(4.6, 0.25, 3.8, mats.orange, 28, 2.75, -10.5, false), box(2.6, 0.7, 0.1, mats.cream, 28, 3.3, -8.6, false));   // 2026-11-18 自查：往玻璃牆挪 3 公尺，走道上走的人才不會穿過它
    term.add(instanced(new THREE.BoxGeometry(0.34, 0.5, 0.04), [mats.teal, mats.navy, mats.orange, mats.cream][0], Array.from({ length: 8 }, (_, i) => [26.4 + (i % 4) * 1.05, 1.0 + Math.floor(i / 4) * 0.7, -8.9]), false));
    term.add(instanced(new THREE.BoxGeometry(0.34, 0.5, 0.04), mats.navy, Array.from({ length: 8 }, (_, i) => [26.9 + (i % 4) * 1.05, 1.35 + Math.floor(i / 4) * 0.7, -8.9]), false));
    { const f = figure(mats, { shirt: pick(4) }); f.position.set(27.2, 0, -7.6); f.userData.baseY = 0; f.rotation.y = Math.PI; term.add(f); idleFigs.push(f); }
  }
  // 販賣機三台、ATM、行李推車兩堆、垃圾桶、柱子上的螢幕、掛在走道上方的旗子。
  {
    term.add(instanced(new THREE.BoxGeometry(1.1, 2.0, 0.8), mats.navy, [[48, 1.0, -39.1], [49.4, 1.0, -39.1], [50.8, 1.0, -39.1]], false), instanced(new THREE.BoxGeometry(0.8, 1.3, 0.05), mats.light, [[48, 1.15, -38.68], [49.4, 1.15, -38.68], [50.8, 1.15, -38.68]], false));
    term.add(box(1.0, 1.9, 0.6, mats.teal, 53.2, 0.95, -39.2, false), box(0.6, 0.5, 0.05, mats.light, 53.2, 1.4, -38.88, false));
    const carts = []; for (let i = 0; i < 6; i++) carts.push([116 + i * 0.5, 0.5, -29]);
    term.add(instanced(new THREE.BoxGeometry(0.7, 0.9, 1.0), mats.grey, carts, false), instanced(new THREE.BoxGeometry(0.7, 0.05, 0.6), mats.navy, carts.map(([x, , z]) => [x, 0.3, z]), false));
    const bins = []; for (let x = 5; x < T.x1; x += 15) { bins.push([x + 0.9, 0.45, -30.8]); if (x < 100) bins.push([x - 0.9, 0.45, -9.2]); }   // 2026-11-18：x 110 那一個（109.1,-9.2）正好在鏡頭往登機門的斜線上，拿掉
    term.add(instanced(new THREE.CylinderGeometry(0.3, 0.28, 0.9, 8), mats.frame, bins, false));
    const screens = []; for (let x = 20; x < T.x1; x += 30) screens.push([x, 3.2, -29.3], [x, 3.2, -10.7]);
    term.add(instanced(new THREE.BoxGeometry(1.4, 0.8, 0.08), mats.dark, screens, false), instanced(new THREE.BoxGeometry(1.2, 0.6, 0.02), mats.light, screens.map(([x, y, z]) => [x, y, z + (z > -20 ? 0.05 : -0.05)]), false));
    const flags = []; for (let x = 12; x < T.x1 - 6; x += 10) flags.push([x, T.h - 3.6, -20]);
    term.add(instanced(new THREE.BoxGeometry(0.05, 3.2, 1.6), mats.orange, flags.filter((_, i) => i % 3 === 0), false), instanced(new THREE.BoxGeometry(0.05, 3.2, 1.6), mats.teal, flags.filter((_, i) => i % 3 === 1), false), instanced(new THREE.BoxGeometry(0.05, 3.2, 1.6), mats.navy, flags.filter((_, i) => i % 3 === 2), false));
    term.add(instanced(new THREE.CylinderGeometry(0.03, 0.03, 1.4, 5), mats.grey, flags.map(([x, y, z]) => [x, y + 2.3, z]), false));
  }
  // 人再多一點：報到的隊伍、兩兩聊天的、看商店的、看板前的、小孩。
  {
    let k = 5;
    for (const [x, z] of [[54, -30], [55.2, -28.6], [74, -30.6], [75.4, -31.3], [95, -29.6], [96.2, -30.9]]) { const f = figure(mats, { shirt: pick(k), bag: pick(k + 1), phase: (k * 0.37) % 1 }); f.position.set(x, 0, z); f.userData.baseY = 0; f.rotation.y = Math.PI; term.add(f); idleFigs.push(f); k++; }
    for (const [x, z, ry] of [[41, -26.2, 0.6], [42.3, -25.8, Math.PI + 0.6], [70, -22.2, -0.4], [71.2, -21.8, Math.PI - 0.4], [100, -15.5, 2.0], [101.4, -15.8, 2.0 + Math.PI], [86, -17, 1.1], [86.9, -18.2, 1.1 + Math.PI]]) { const f = figure(mats, { shirt: pick(k), backpack: k % 2 === 0 }); f.position.set(x, 0, z); f.userData.baseY = 0; f.rotation.y = ry; term.add(f); idleFigs.push(f); k++; }
    for (const [x, z] of [[58.6, -33.5], [73.5, -33.6], [89, -33.4], [91.8, -33.7]]) { const f = figure(mats, { shirt: pick(k), bag: pick(k + 2) }); f.position.set(x, 0, z); f.userData.baseY = 0; f.rotation.y = Math.PI; term.add(f); idleFigs.push(f); k++; }
    for (const [x, z] of [[31.5, -26.2], [34.6, -21.6], [81.6, -19]]) { const f = figure(mats, { shirt: pick(k) }); f.position.set(x, 0, z); f.userData.baseY = 0; f.rotation.y = Math.PI / 2; term.add(f); idleFigs.push(f); k++; }
    for (const [x, z, ry] of [[63, -9.2, 0.3], [97.5, -31.4, -2.4]]) { const f = figure(mats, { shirt: pick(k), backpack: true }); f.scale.setScalar(0.68); f.position.set(x, 0, z); f.userData.baseY = 0; f.rotation.y = ry; term.add(f); idleFigs.push(f); k++; }
  }
  // 登機門櫃台：深藍的櫃台、奶油色檯面、一個站著的地勤、一支小牌。
  term.add(box(3.4, 1.1, 1.1, mats.navy, A.GATE_DESK[0], 0.55, A.GATE_DESK[1]), box(3.6, 0.1, 1.3, mats.cream, A.GATE_DESK[0], 1.12, A.GATE_DESK[1], false));
  { const f = figure(mats, { shirt: P.navy, staff: true }); f.position.set(A.GATE_DESK[0], 0, A.GATE_DESK[1] + 1.3); f.userData.baseY = 0; f.rotation.y = Math.PI; term.add(f); idleFigs.push(f); }
  let bridgeSign = null;
  // 空橋：兩段直的（A 段從門沿 +z、B 段轉 90 度沿 +x 到機身），一邊實牆、一邊玻璃；B 段的頂是玻璃，鏡頭從那裡升出去。
  {
    const B = A.BRIDGE, wallM = lam(P.cream, { side: THREE.DoubleSide, emissive: P.cream, emissiveIntensity: 0.35 }), inner = B.half - 0.08;
    const zA0 = T.z1, zA1 = B.zEnd + B.half, lenA = zA1 - zA0, y0 = 0, y1 = B.floorEnd;
    // A 段：地板是斜的（用一個旋轉的盒子），牆跟著斜。
    const gA = new THREE.Group(); const pitch = Math.atan2(y1 - y0, lenA); gA.position.set(B.x, (y0 + y1) / 2, (zA0 + zA1) / 2); gA.rotation.x = -pitch; term.add(gA);
    const L = Math.hypot(lenA, y1 - y0);
    gA.add(box(B.half * 2, 0.16, L, wallM, 0, -0.08, 0), box(1.0, 0.02, L, mats.navy, 0, 0.01, 0, false));   // 地板加一條深藍的地帶
    gA.add(new THREE.Mesh(new THREE.BoxGeometry(B.half * 2, 0.12, L), lam(P.ceiling)).translateY(B.h));   // 頂
    gA.add(box(0.15, B.h, L, wallM, -B.half, B.h / 2, 0, false));                            // 靠 -x 那一面實牆
    // 靠機身那一面：下半牆、上面一條，中間是窗。B 段接上來的那 3.2 公尺不封（不然鏡頭轉進 B 段時穿牆）。
    const Lo = L - 4.8;
    gA.add(box(0.15, 1.0, Lo, wallM, B.half, 0.5, -2.4, false), box(0.15, 0.4, Lo, wallM, B.half, B.h - 0.2, -2.4, false));
    gA.add(new THREE.Mesh(new THREE.PlaneGeometry(Lo, B.h - 1.4), mats.glass).rotateY(-Math.PI / 2).translateZ(-B.half).translateY(1.0 + (B.h - 1.4) / 2).translateX(-2.4));
    gA.add(instanced(new THREE.BoxGeometry(0.1, B.h - 1.4, 0.1), mats.frame, Array.from({ length: Math.floor(Lo / 3) }, (_, i) => [B.half, 1.0 + (B.h - 1.4) / 2, -L / 2 + 1.5 + i * 3]), false));
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
    const bs = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.7), lam(P.navy)); bs.userData.dynamic = true; bs.position.set(lenB / 2 - 1.6, B.h - 0.5, 0); bs.rotation.y = -Math.PI / 2; gB.add(bs); bridgeSign = bs;
    gB.add(box(lenB, 0.08, 0.25, mats.orange, 0, 1.0, inner, false));
    // 門口的圓亭、B 段底下的兩支腳
    // 門口的圓亭：只有頂蓋加四根柱子，人從中間走過去（實心的會壓在鏡頭走的線上）。
    term.add(cyl(2.6, 2.6, 0.4, mats.wallShade, B.x, 3.5, T.z1 + 1.2, 12), instanced(new THREE.CylinderGeometry(0.1, 0.1, 3.3, 6), mats.frame, [45, 135, 225, 315].map(a => [B.x + Math.cos(a * DEG) * 2.3, 1.65, T.z1 + 1.2 + Math.sin(a * DEG) * 2.3]), false));
    term.add(cyl(0.3, 0.3, y1, mats.frame, B.x - 1.2, y1 / 2, B.zEnd + B.half + 0.6, 6), cyl(0.3, 0.3, y1, mats.frame, xB1 - 1.5, y1 / 2, B.zEnd + B.half + 0.6, 6));
    // 空橋裡面：A 段板縫、踢腳、海報；B 段盡頭是機艙門：門框、推開的門板、門裡一張畫了座位的「機艙」、迎接的機組員、WELCOME ABOARD。
    {
      const ribs = Array.from({ length: Math.floor(L / 1.5) }, (_, i) => [-B.half + 0.12, B.h / 2, -L / 2 + 0.75 + i * 1.5]);
      gA.add(instanced(new THREE.BoxGeometry(0.06, B.h - 0.3, 0.08), lam(P.cream.clone().lerp(P.grey, 0.35)), ribs, false), box(0.3, 0.03, L, mats.dark, -inner + 0.15, 0.02, 0, false), box(0.3, 0.03, L, mats.dark, inner - 0.15, 0.02, 0, false));
      const posterTex = (en, zh, bg, fg) => textTexture(512, 768, bg, [{ text: en, x: 256, y: 330, font: `700 64px ${fonts.display}`, color: fg, align: "center" }, { text: zh, x: 256, y: 430, font: `900 56px ${fonts.han || fonts.display}`, color: fg, align: "center" }], [{ x: 0, y: 0, w: 512, h: 120, color: fg }, { x: 0, y: 648, w: 512, h: 120, color: fg }]);
      [["WELCOME ABOARD", "歡迎登機", palette.navy, palette.cream], ["SEVEN COUNTRIES", "七個國家", palette.orange, palette.navy], ["SEE YOU THERE", "那裡見", palette.teal, palette.cream]].forEach(([en, zh, bg, fg], i) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 1.5), lam(P.white, { map: posterTex(en, zh, bg, fg) })); m.position.set(-B.half + 0.2, 1.7, -L / 2 + 5 + i * 9); m.rotation.y = Math.PI / 2; m.castShadow = false; gA.add(m); });
      const dx = lenB / 2;   // B 段的盡頭（機身皮）
      gB.add(box(0.2, 2.2, 0.18, mats.navy, dx - 0.1, 1.1, -0.65, false), box(0.2, 2.2, 0.18, mats.navy, dx - 0.1, 1.1, 0.65, false), box(0.2, 0.18, 1.5, mats.navy, dx - 0.1, 2.2, 0, false));
      const door = box(0.06, 1.9, 1.1, lam(P.cream.clone().lerp(P.grey, 0.15)), 0, 0, 0, false); door.position.set(dx - 0.55, 1.05, 0.95); door.rotation.y = -0.9; gB.add(door);
      const cabinTex = textTexture(512, 768, palette.navy, [], [{ x: 40, y: 120, w: 90, h: 70, color: palette.teal }, { x: 40, y: 220, w: 90, h: 70, color: palette.teal }, { x: 40, y: 320, w: 90, h: 70, color: palette.teal }, { x: 160, y: 120, w: 90, h: 70, color: palette.teal }, { x: 160, y: 220, w: 90, h: 70, color: palette.teal }, { x: 160, y: 320, w: 90, h: 70, color: palette.teal }, { x: 330, y: 100, w: 120, h: 90, color: palette.cream }, { x: 330, y: 260, w: 120, h: 90, color: palette.cream }, { x: 0, y: 420, w: 512, h: 30, color: palette.grey }, { x: 0, y: 0, w: 512, h: 60, color: palette.grey }]);
      const cabin = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.9), lam(P.white, { map: cabinTex })); cabin.position.set(dx - 0.15, 1.05, 0); cabin.rotation.y = -Math.PI / 2; cabin.castShadow = false; gB.add(cabin);
      const crew = figure(mats, { shirt: P.navy, staff: true }); crew.position.set(dx - 1.5, 0, 1.05); crew.rotation.y = -Math.PI / 2 - 0.6; crew.userData.baseY = 0; gB.add(crew); idleFigs.push(crew);
      const wb = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 0.5), lam(P.white, { map: textTexture(1024, 256, palette.orange, [{ text: "WELCOME ABOARD", x: 36, y: 90, font: `700 100px ${fonts.display}`, color: palette.navy }, { text: "歡迎登機", x: 36, y: 195, font: `900 70px ${fonts.han || fonts.display}`, color: palette.navy }]) })); wb.position.set(dx - 3.6, 2.05, B.half - 0.1); wb.rotation.y = Math.PI; /* 貼在 +z 那面實牆上 */ wb.castShadow = false; gB.add(wb);
      gB.add(instanced(new THREE.BoxGeometry(0.06, B.h - 0.3, 0.08), lam(P.cream.clone().lerp(P.grey, 0.35)), Array.from({ length: Math.floor(lenB / 1.5) }, (_, i) => [-lenB / 2 + 0.75 + i * 1.5, B.h / 2, B.half - 0.12]), false));
    }
  }
  // 其他登機門的空橋與停著的飛機：兩座，直直伸出去。
  // 批 D：B2 與 B4 的飛機拿掉（翼展 34 公尺、停機位只隔 15 到 21 公尺，鄰機翼尖互穿），空橋留著當空的登機門；橋對著機艙門（x + 3.4）。
  for (const x of [40, 75]) {   /* 沒飛機的門空橋縮回（24 公尺） */
    const g = new THREE.Group(); g.position.set(x + 3.4, 2.6, 12);
    g.add(box(3.2, 2.9, 24, lam(P.wall), 0, 0, 0)); g.add(box(3.4, 0.5, 24, mats.teal, 0, 0.2, 0, false));
    term.add(g, cyl(0.3, 0.3, 2.6, mats.frame, x + 2.2, 1.3, 20, 6), cyl(0.3, 0.3, 2.6, mats.frame, x + 4.6, 1.3, 20, 6));
  }

  // ═══ 停機坪上的東西 ═══
  // 塔台：桿、頂上的控制室、玻璃、旋轉信標。
  const tower = new THREE.Group(); tower.position.set(A.TOWER[0], 0, A.TOWER[1]); world.add(tower);
  tower.add(cyl(2.4, 3.2, 30, mats.wall, 0, 15, 0, 10), cyl(5.6, 4.2, 4.5, mats.roof, 0, 31.5, 0, 10), cyl(5.2, 5.2, 2.6, mats.glass, 0, 34.5, 0, 10), cyl(6, 5.4, 0.9, mats.roof, 0, 36.2, 0, 10));
  const beacon = new THREE.Group(); beacon.userData.dynamic = true; beacon.position.y = 37.4; beacon.add(cyl(0.3, 0.3, 1.2, mats.frame, 0, 0, 0, 6), box(2.6, 0.5, 0.5, mats.orangeLight, 0, 0.7, 0, false)); tower.add(beacon);
  // 機棚兩座：盒子加半圓的屋頂，大門是深色。
  for (const [x, z] of [[-70, 130], [-70, 190]]) {
    const g = new THREE.Group(); g.position.set(x, 0, z); world.add(g);
    g.add(box(44, 12, 36, mats.wallShade, 0, 6, 0));
    const arch = new THREE.Mesh(new THREE.CylinderGeometry(18, 18, 44, 14, 1, false, 0, Math.PI), mats.roof); arch.rotation.z = Math.PI / 2; arch.rotation.y = Math.PI / 2; arch.position.y = 12; arch.castShadow = true; arch.scale.set(0.45, 1, 1); g.add(arch);
    g.add(box(0.4, 13, 34, mats.dark, 22.1, 6.5, 0, false));
  }
  // 消防站：橘牆、三扇門、一台消防車探頭。
  { const g = new THREE.Group(); g.position.set(210, 0, 70); g.rotation.y = Math.PI; world.add(g); world.add(box(7, 0.04, 38, mats.asphalt, 210, 0.012, 99, false));   // 門朝跑道那一側，一條直通跑道的消防道（批 D）
    g.add(box(26, 7, 16, lam(P.sand.clone().lerp(P.orange, 0.35)), 0, 3.5, 0), box(27, 0.6, 17, mats.roof, 0, 7.2, 0, false));
    g.add(instanced(new THREE.BoxGeometry(5.5, 5, 0.4), mats.dark, [[-8, 2.5, -8.1], [0, 2.5, -8.1], [8, 2.5, -8.1]], false));
    g.add(box(7, 2.6, 3, mats.orange, 0, 1.4, -13), box(2.6, 1.6, 2.8, mats.frame, -3.2, 3.2, -13)); }
  // 停著的第三架：遠處機坪，黃尾翼。
  // 遠端停機位三個（批 D，Paul「make sense」：之前三架飛機隨便斜停在停機坪空地上）：水泥墊、引導線、停止線、位號牌、兩個錐桶，機頭朝滑行道（-z）。
  const remote = (x, tail, n) => { const z = 186; world.add(box(50, 0.04, 46, mats.apronTex || mats.apron, x, 0.015, z, false), box(0.4, 0.04, 34, mats.yellowLight, x, 0.05, z - 30, false), box(10, 0.04, 0.5, mats.yellowLight, x, 0.05, z - 10, false), box(1.4, 0.9, 0.1, mats.navy, x - 22, 1.3, z + 20, false), cyl(0.06, 0.06, 1.0, mats.grey, x - 22, 0.5, z + 20, 5));
    for (const dx of [-9, 9]) world.add(cyl(0.2, 0.45, 0.8, mats.orange, x + dx, 0.4, z - 14, 6));
    const pl = buildAirliner(THREE, { body: P.cream, tail, mark: P.navy, dark: P.dark }); pl.position.set(x, A.PLANE_REST_Y, z); pl.rotation.y = Math.PI; shadowOn(pl); world.add(pl); void n; };
  remote(40, P.yellow, 1); remote(120, P.teal, 2); remote(200, P.navy, 3);
  // 加油車兩台（一台會走）、行李拖車一組（會繞）、幾個地勤。
  const fuel = []; for (const [x, z] of [[150, 90], [60, 70]]) { const g = truck(mats, true); g.userData.dynamic = true; g.position.set(x, 0, z); world.add(g); fuel.push(g); }
  const tug = new THREE.Group(); tug.userData.dynamic = true; { const t = truck(mats, false); tug.add(t); for (let k = 1; k <= 3; k++) { const c = box(2.2, 1.4, 2.4, mats.grey, 0, 0.9, -3.2 * k); c.add(box(2.2, 0.6, 2.2, mats.navy, 0, 0.9, 0)); tug.add(c); } world.add(tug); }
  for (const [x, z, ry] of [[112, 48, 0.4], [126, 30, -1.2], [88, 52, 2.2]]) { const f = figure(mats, { shirt: P.navy, vest: true }); f.position.set(x, 0, z); f.rotation.y = ry; f.userData.baseY = 0; world.add(f); idleFigs.push(f); }
  world.add(instanced(new THREE.ConeGeometry(0.35, 0.8, 6), mats.orange, [[108, 0.4, 44], [110, 0.4, 56], [132, 0.4, 44], [130, 0.4, 58]], false));
  // 樹：陸側一排、停機坪邊、跑道外幾叢。
  {
    const places = [];
    for (let x = -20; x <= 140; x += 9) places.push([x + (x % 2) * 2, 0, T.z0 - 10 - (x % 3) * 2, x, 0.9 + (x % 5) / 10]);
    for (let z = 20; z <= 220; z += 16) places.push([-25 + (z % 3) * 3, 0, z, z, 1]);
    for (let x = -300; x <= 300; x += 45) places.push([x, 0, 520 + (x % 4) * 6, x, 1.1], [x + 20, 0, 280 - (x % 3) * 5, x, 0.9]);   // 跑道帶（中線 ±75）外
    // 周邊再多一些樹：停車場中間、車道兩旁、旅館四周、貨運站與燃油庫旁、租車場後面。
    for (let x = 0; x <= 120; x += 8) places.push([x, 0, -76 + (x % 3), x, 0.8 + (x % 4) / 10]);
    for (let x = -50; x <= 180; x += 10) places.push([x + (x % 3), 0, -53.5, x, 0.9], [x + 2, 0, -115 - (x % 2) * 2, x, 1.0]);
    for (const [x, z] of [[140, -95], [146, -100], [185, -95], [190, -62], [142, -62], [-40, -80], [-44, -90], [-18, -58], [-10, -58]]) places.push([x, 0, z, x + z, 1.1]);
    for (let x = -110; x <= -40; x += 9) places.push([x, 0, 62 + (x % 3) * 2, x, 1.0]);
    for (let z = 220; z <= 285; z += 11) places.push([-138, 0, z, z, 1.0]);
    for (let x = 350; x <= 400; x += 12) places.push([x, 0, 205 + (x % 2) * 4, x, 0.9]);
    world.add(instanced(treeGeo(), mats.leaf, places), instanced(trunkGeo(), mats.trunk, places));
  }
  // ═══ 機場的周邊 ═══
  // 陸側（z < -40）：車道、停車場、巴士與計程車、旅館、租車場；空側：貨運站、燃油庫、雷達、風向袋、
  // 更多停著的飛機與地勤車。全部用盒子與圓柱，重複的東西（車、路燈、貨櫃）一次畫完。
  {
    const carBody = new THREE.BoxGeometry(4.2, 1.1, 1.9), carTop = new THREE.BoxGeometry(2.2, 0.8, 1.7);
    // 車道：航廈後面一條沿 x 的路（z -46，寬 9），兩條接出去的路，路燈每 15 公尺一支。
    const roadM = lam(P.asphalt.clone().lerp(P.grey, 0.3));
    world.add(box(240, 0.08, 9, roadM, 60, 0.02, -46, false), box(9, 0.08, 70, roadM, -45, 0.02, -75, false), box(9, 0.08, 70, roadM, 175, 0.02, -75, false), box(240, 0.08, 9, roadM, 60, 0.02, -110, false));
    const dashes = []; for (let x = -50; x <= 180; x += 6) dashes.push([x, 0.07, -46], [x, 0.07, -110]);
    world.add(instanced(new THREE.BoxGeometry(2.4, 0.02, 0.2), mats.cream, dashes, false));
    const lamps = []; for (let x = -40; x <= 170; x += 15) lamps.push([x, 4, -51.5], [x, 4, -104.5]);
    world.add(instanced(new THREE.CylinderGeometry(0.1, 0.14, 8, 6), mats.grey, lamps, false), instanced(new THREE.BoxGeometry(0.5, 0.25, 1.0), mats.light, lamps.map(([x, , z]) => [x, 8.1, z + (z > -80 ? 1.0 : -1.0)]), false));
    // 停車場（z -56 到 -100、x 0 到 120）：淺灰的場、白線、三種顏色的車，每一格七成有車。
    world.add(box(126, 0.06, 44, mats.taxi, 60, 0.01, -78, false));
    const lines = [], cars = [[], [], []];
    let n = 0;
    for (const zr of [-60, -68, -84, -92]) for (let x = 4; x <= 116; x += 5.4) { lines.push([x - 2.7, 0.05, zr]); n++; if ((n * 7) % 10 < 7) cars[n % 3].push([x, 0.6, zr + ((n % 2) ? 0.3 : -0.3), (n % 5) * 0.03 - 0.06]); }
    world.add(instanced(new THREE.BoxGeometry(0.15, 0.02, 5.2), mats.cream, lines, false));
    [mats.navy, mats.cream, mats.teal].forEach((m, i) => { world.add(instanced(carBody, m, cars[i]), instanced(carTop, mats.glass, cars[i].map(([x, y, z, ry]) => [x - 0.2, y + 0.9, z, ry]), false)); });
    // 航廈門口：一台巴士、三台計程車、候車亭。
    world.add(box(11, 3, 2.5, mats.teal, 40, 1.6, -45.2), box(10.6, 1.2, 2.55, mats.glass, 40, 2.1, -45.2, false), instanced(new THREE.CylinderGeometry(0.5, 0.5, 0.4, 8), mats.dark, [[36, 0.5, -43.9], [44, 0.5, -43.9], [36, 0.5, -46.5], [44, 0.5, -46.5]].map(([x, y, z]) => [x, y, z, Math.PI / 2]), false));
    for (const x of [70, 76, 82]) { world.add(box(4.2, 1.1, 1.9, mats.yellowLight, x, 0.6, -46.8), box(2.0, 0.7, 1.7, mats.glass, x - 0.2, 1.5, -46.8, false), box(0.9, 0.3, 0.3, mats.navy, x, 2.0, -46.8, false)); }
    world.add(box(7, 0.5, 0.5, mats.grey, 20, 0.5, -41.2, false));   // 公車站的長凳（雨棚換成 grounds.js 整條的）
    // 旅館（陸側東邊）：一棟六層的樓、一排排的窗、屋頂招牌；租車場：小棚子加幾台車。
    { const g = new THREE.Group(); g.position.set(165, 0, -78); world.add(g);
      g.add(box(34, 20, 22, mats.wallShade, 0, 10, 0), box(35, 0.8, 23, mats.roof, 0, 20.3, 0, false), box(12, 2.2, 0.6, mats.navy, 0, 22.4, 0, false), box(9, 1.2, 0.2, mats.cream, 0, 22.4, 0.45, false));
      const win = []; for (let fl = 0; fl < 6; fl++) for (let i = 0; i < 9; i++) { win.push([-14 + i * 3.5, 2.6 + fl * 3.1, 11.05]); win.push([-14 + i * 3.5, 2.6 + fl * 3.1, -11.05]); }
      g.add(instanced(new THREE.BoxGeometry(2.0, 1.6, 0.1), mats.glass, win, false));
      g.add(box(16, 0.3, 8, mats.roof, 0, 4.2, 15, false), instanced(new THREE.CylinderGeometry(0.2, 0.2, 4.2, 6), mats.column, [[-7, 2.1, 12], [7, 2.1, 12], [-7, 2.1, 18], [7, 2.1, 18]], false));
    }
    world.add(box(14, 0.2, 7, mats.orange, -30, 3.0, -62, false), instanced(new THREE.CylinderGeometry(0.1, 0.1, 3.0, 6), mats.grey, [[-36, 1.5, -59], [-24, 1.5, -59], [-36, 1.5, -65], [-24, 1.5, -65]], false));
    world.add(instanced(carBody, mats.cream, [[-35, 0.6, -70], [-30, 0.6, -70], [-25, 0.6, -70], [-20, 0.6, -70]].map(([x, y, z]) => [x, y, z, Math.PI / 2])));
    // 貨運站、燃油庫（三個白色大圓桶）、雷達、風向袋。
    { const g = new THREE.Group(); g.position.set(-75, 0, 40); world.add(g);
      g.add(box(56, 9, 26, mats.wallShade, 0, 4.5, 0), box(57, 0.6, 27, mats.roof, 0, 9.3, 0, false), box(30, 1.6, 0.4, mats.navy, 0, 7.4, 13.2, false));
      g.add(instanced(new THREE.BoxGeometry(5, 4, 0.4), mats.dark, [[-18, 2, 13.2], [-6, 2, 13.2], [6, 2, 13.2], [18, 2, 13.2]], false));
      for (const x of [-18, -6, 18]) { const t = truck(mats, false); t.position.set(x, 0, 19); t.rotation.y = Math.PI; g.add(t); }
      const boxes = []; for (let i = 0; i < 14; i++) boxes.push([-26 + (i % 7) * 4.2, 1.3 + Math.floor(i / 7) * 2.6, -20 + (i % 2) * 0.5]);
      g.add(instanced(new THREE.BoxGeometry(4, 2.5, 2.4), mats.teal, boxes.filter((_, i) => i % 2 === 0)), instanced(new THREE.BoxGeometry(4, 2.5, 2.4), mats.orange, boxes.filter((_, i) => i % 2 === 1)));
    }
    for (const z of [235, 252, 269]) world.add(cyl(6, 6, 8, mats.cream, -115, 4, z, 16), cyl(6.2, 6.2, 0.4, mats.grey, -115, 8.2, z, 16));
    world.add(box(28, 1.2, 0.4, mats.wall, -115, 0.6, 224), box(28, 1.2, 0.4, mats.wall, -115, 0.6, 280), box(0.4, 1.2, 56, mats.wall, -129, 0.6, 252), box(0.4, 1.2, 56, mats.wall, -101, 0.6, 252));
    { const g = new THREE.Group(); g.position.set(380, 0, 200); world.add(g); g.add(cyl(0.8, 1.2, 14, mats.wall, 0, 7, 0, 8), box(2.4, 2.4, 2.4, mats.wallShade, 0, 15, 0)); const dish = new THREE.Mesh(new THREE.SphereGeometry(4, 12, 8, 0, Math.PI * 2, 0, Math.PI / 3), mats.cream); dish.rotation.x = Math.PI * 0.8; dish.position.y = 17.5; dish.castShadow = true; g.add(dish); }
    { const g = new THREE.Group(); g.position.set(250, 0, 300); world.add(g); g.add(cyl(0.08, 0.1, 7, mats.grey, 0, 3.5, 0, 6)); const sock = new THREE.Mesh(new THREE.ConeGeometry(0.6, 3.2, 8), mats.orange); sock.rotation.z = -Math.PI / 2; sock.position.set(1.6, 6.8, 0); g.add(sock); }
    // 停機坪上再多一點：遠端停機位的飛機、巴士、登機梯車、餐勤車、行李拖車、錐桶與地勤。
    for (const [x, z, ry] of [[70, 128, 0.3], [160, 60, -1.2]]) { const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; world.add(g); g.add(box(11, 3, 2.5, mats.cream, 0, 1.6, 0), box(10.6, 1.2, 2.55, mats.glass, 0, 2.1, 0, false), box(11, 0.5, 2.5, mats.navy, 0, 0.5, 0, false)); }
    { const g = new THREE.Group(); g.position.set(70, 0, 150); g.rotation.y = 0.5; world.add(g); g.add(box(2.2, 1.4, 2.4, mats.orange, 0, 1.0, 2.6), box(2.4, 0.5, 6, mats.grey, 0, 0.5, -0.8)); const st = box(1.6, 0.3, 5, mats.grey, 0, 3.0, -1.5); st.rotation.x = 0.45; g.add(st); g.add(instanced(new THREE.BoxGeometry(0.08, 1.0, 5), mats.grey, [[-0.8, 3.6, -1.5, 0], [0.8, 3.6, -1.5, 0]].map(([x, y, z]) => [x, y, z]), false)); }
    { const g = new THREE.Group(); g.position.set(95, 0, 20); g.rotation.y = -0.3; world.add(g); g.add(box(2.2, 1.6, 2.2, mats.cream, 0, 1.2, 2.0), box(2.4, 2.6, 5, mats.cream, 0, 3.2, -1.2), box(2.4, 0.5, 6.4, mats.grey, 0, 0.5, -0.6), instanced(new THREE.CylinderGeometry(0.12, 0.12, 2.2, 6), mats.dark, [[-0.9, 1.9, -1.2, 0], [0.9, 1.9, -1.2, 0]], false)); }
    for (const [x, z, ry] of [[75, 36, 0.2], [150, 95, 1.3]]) { const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; world.add(g); const t = truck(mats, false); g.add(t); for (let k = 1; k <= 3; k++) { const c = box(2.2, 1.4, 2.4, mats.grey, 0, 0.9, -3.2 * k); c.add(box(2.2, 0.6, 2.2, [mats.navy, mats.orange, mats.teal][k % 3], 0, 0.9, 0)); g.add(c); } }
    world.add(instanced(new THREE.ConeGeometry(0.35, 0.8, 6), mats.orange, [[60, 0.4, 100], [64, 0.4, 118], [155, 0.4, 70], [162, 0.4, 56], [-10, 0.4, 140], [2, 0.4, 162], [240, 0.4, 112], [258, 0.4, 134]], false));
    for (const [x, z, ry] of [[66, 104, 0.9], [158, 66, -0.5], [8, 146, 1.6], [246, 118, 2.4]]) { const f = figure(mats, { shirt: P.navy, vest: true }); f.position.set(x, 0, z); f.rotation.y = ry; f.userData.baseY = 0; world.add(f); idleFigs.push(f); }
    // 航廈屋頂的空調箱與天線。
    world.add(instanced(new THREE.BoxGeometry(3, 1.6, 2.2), mats.wallShade, [[20, T.h + 1.6, -30], [50, T.h + 1.6, -12], [80, T.h + 1.6, -30], [110, T.h + 1.6, -12]], false), cyl(0.1, 0.1, 6, mats.grey, 100, T.h + 3.8, -34, 5));
  }
  // 雲：低多邊形的球疊成一團，奶油白往白推、微微發光、不投影不接影。沿著爬升的路放，慢慢飄。
  const clouds = [];
  const cloudGeo = [new THREE.IcosahedronGeometry(10, 1), new THREE.IcosahedronGeometry(14, 1), new THREE.IcosahedronGeometry(18, 1)];
  for (let i = 0; i < 14; i++) {
    const g = new THREE.Group(); const n = 4 + (i % 3);
    for (let k = 0; k < n; k++) { const s = new THREE.Mesh(cloudGeo[(i + k) % 3], mats.cloud); s.position.set((k - n / 2) * 13 + ((k * 7) % 5), (k % 2) * 4 - ((k * 3) % 4), ((k * 11) % 10) - 5); s.scale.set(1.15, 0.5 + (k % 2) * 0.1, 1); s.castShadow = false; s.receiveShadow = false; g.add(s); }
    const t = i / 13, side = i % 2 ? 1 : -1;
    g.position.set(-120 - t * 1500, 90 + t * 300 - 70 + (i % 3) * 30, A.RUNWAY.z + side * (80 + (i % 4) * 60));
    g.userData.v = 0.5 + (i % 3) * 0.3; g.userData.x0 = g.position.x; g.userData.dynamic = true; world.add(g); clouds.push(g);
  }
  { const cf = A.cameraAt(0.93).pos, g = clouds[13]; g.position.set(cf[0], cf[1], cf[2]); g.userData.x0 = cf[0]; g.userData.v = 0; }   // 批 C：這一團放在追鏡的路上，鏡頭穿過去畫面白一下

  // ═══ 我們那一架 ═══
  const plane = buildAirliner(THREE, { body: P.cream, tail: P.orange, mark: P.cream, dark: P.dark }); shadowOn(plane); plane.userData.dynamic = true; world.add(plane);
  // 批 A：先航向、再俯仰、再側傾（預設 XYZ 對正 -x 之後抬頭其實是在滾）。
  plane.rotation.order = "YXZ";
  // 批 C：翼尖的兩條白氣（離地之後淡入）。
  const trailM = lam(P.cloud, { transparent: true, opacity: 0, emissive: P.cloud, emissiveIntensity: 0.6, depthWrite: false });
  for (const sx of [-1, 1]) { const tr = box(0.22, 0.22, 70, trailM, sx * 17.2, 0.9, -40, false); tr.castShadow = false; plane.add(tr); }
  const wheels = []; plane.traverse(m => { if (m.name === "wheel") wheels.push(m); }); let wheelSpin = 0, lastS = 0;
  const pbt = truck(mats, false); pbt.scale.setScalar(0.8); pbt.userData.dynamic = true; pbt.visible = false; world.add(pbt);   /* 推機車：推出去的時候頂在機鼻前 */
  // 旅客
  const traveller = figure(mats, { shirt: P.teal, backpack: true, phase: 0 }); traveller.userData.baseY = 0; world.add(traveller);
  // 走道上來回走的兩個人
  const walkers = [];
  for (const [x0, x1, z, sp, k] of [[10, 95, -15.5, 1.2, 0], [90, 20, -23.4, 1.0, 2], [30, 100, -13, 0.9, 3], [105, 9, -24.2, 1.1, 4], [8, 104, -14.2, 1.05, 1], [104, 8, -16.6, 0.85, 5], [-36, -14, -23.0, 0.95, 2], [104, 62, -16.2, 1.15, 3]]) { const f = figure(mats, { shirt: figMats[k % figMats.length], bag: figMats[(k + 2) % figMats.length] }); f.userData.baseY = 0; f.userData.w = { x0, x1, z, sp }; term.add(f); walkers.push(f); }

  // ═══ 航廈裡面與外面的細節（2026-11-18）：terminal.js 與 grounds.js，THREE 跟小工具傳進去 ═══
  const ctx = { mats, P, palette, fonts, T, A, box, cyl, instanced, figure, idleFigs, walkers, textTexture, lam, term, world, pick, truck, buildAirliner, setGear, shadowOn, tw };
  const extras = [buildTerminal(THREE, ctx), buildGrounds(THREE, ctx), buildDecor(THREE, ctx), buildTraffic(THREE, ctx)];

  // ═══ 站：小場景與錨點記號 ═══
  const stopsGroup = new THREE.Group(); stopsGroup.userData.dynamic = true; world.add(stopsGroup);
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
    pruneCasters();
  }

  // ═══ 看板與登機門牌 ═══
  // 出發看板：版面照 airport.js 的 boardLayout，現在這一站整列橘底；站多就只畫附近幾列。
  // 換站的時候整塊翻一下（render() 看 boardFlip：先壓扁、換貼圖、再彈回來），翻牌看板的感覺。
  let boardFlip = null, boardCurrent = -1;
  // 看板的貼圖一站一張、做過就留著（每換一站重畫 2048 寬的 canvas 會卡 50 到 80 ms）。
  // 8 站以內開頁後先把每一站那張做好上傳，換站只是換 map；站多就用到才做、最多留 8 張。
  const boardCache = new Map(); const BOARD_KEEP = 8;
  function buildBoardTex(rows) {
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
    return { tex: textTexture(L.width, L.height, palette.navy, tl, rects), current };
  }
  function boardTexFor(rows) {
    const lines = A.boardLines(rows), current = Math.max(0, lines.findIndex(l => l.now));
    let tex = boardCache.get(current);
    if (!tex) { tex = buildBoardTex(rows).tex; boardCache.set(current, tex); renderer.initTexture(tex);
      if (boardCache.size > BOARD_KEEP) for (const k of boardCache.keys()) { if (k !== current && k !== boardCurrent) { boardCache.get(k).dispose(); boardCache.delete(k); break; } } }
    return { tex, current };
  }
  function setBoard(rows) {
    const { tex, current } = boardTexFor(rows);
    if (boardCurrent >= 0 && boardCurrent !== current && boards[0].material.map) boardFlip = { tex, t0: null };
    else boards.forEach(b => { b.material.map = tex; b.material.needsUpdate = true; });
    boardCurrent = current;
  }
  function prepareBoard(rowsByIndex) {
    if (!rowsByIndex || rowsByIndex.length > BOARD_KEEP) return;
    const idle = window.requestIdleCallback ? (f => window.requestIdleCallback(f, { timeout: 2000 })) : (f => setTimeout(f, 60));
    let i = 0; const step = () => { while (i < rowsByIndex.length && boardCache.has(i)) i++; if (i >= rowsByIndex.length) return; boardTexFor(rowsByIndex[i]); i++; idle(step); };
    idle(step);
  }
  function setGate(label) {
    const tex = textTexture(512, 136, palette.navy, [{ text: "GATE", x: 40, y: 68, font: `700 48px ${fonts.display}`, color: palette.sand }, { text: label, x: 472, y: 68, font: `700 92px ${fonts.display}`, color: palette.cream, align: "right" }]);
    for (const s of [gateSign, gateSign2]) { if (s.material.map) s.material.map.dispose(); s.material = lam(P.white, { map: tex }); }
    if (bridgeSign) { const t2 = textTexture(1024, 276, palette.navy, [{ text: "BT", x: 60, y: 138, font: `700 150px ${fonts.display}`, color: palette.orange }, { text: "GATE " + label, x: 964, y: 138, font: `700 120px ${fonts.display}`, color: palette.cream, align: "right" }]); bridgeSign.material = lam(P.white, { map: t2, emissive: P.navy, emissiveIntensity: 0.2 }); }
  }

  // ═══ 每一幀 ═══
  let W = 1, Hh = 1, lastFov = -1;
  const shadowAt = new THREE.Vector3(1e9, 0, 0), planeAt = new THREE.Vector3(1e9, 0, 0); let shadowT = -1;
  function shadowTick(e, t) {
    const span = e < A.PHASES.apron[0] ? 70 : e < A.PHASES.takeoff[0] ? 150 : 170; const spanChanged = span !== shadowSpan;   /* 室外的範圍收小（之前 220／400）：1024 的貼圖罩 300 公尺一格就是 0.3 公尺，飛機的影子才有邊 */
    const moved = lookV.distanceTo(shadowAt) > (span < 100 ? 3 : 8), planeMoved = plane.position.distanceTo(planeAt) > 2, stale = t - shadowT > 0.5;
    if (!spanChanged && !moved && !planeMoved && !stale) return;
    setShadowSpan(span);
    sun.target.position.copy(lookV); sun.position.copy(lookV).add(SUN_OFF);
    shadowAt.copy(lookV); planeAt.copy(plane.position); shadowT = t;
    renderer.shadowMap.needsUpdate = true;
  }
  function resize(w, h) { W = w; Hh = h; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
  // 靠近一站稍微放大。zoom 變了超過千分之一才重算投影矩陣。
  let zoomNow = 1, walkT = 0, walkOn = false, trLast = [0, 0, 0], lastT = 0;
  function setZoom(z) { if (Math.abs(z - zoomNow) < 0.001) return; zoomNow = z; camera.zoom = z; camera.updateProjectionMatrix(); }
  const tmpV = new THREE.Vector3(), lookV = new THREE.Vector3();
  function render(e, t) {
    const dt = Math.min(0.1, Math.max(0, t - lastT)); lastT = t;
    // 鏡頭
    const c = A.cameraAt(e, phone);
    camera.position.set(c.pos[0], c.pos[1], c.pos[2]); lookV.set(c.look[0], c.look[1], c.look[2]); camera.lookAt(lookV);
    if (c.fov !== lastFov) { lastFov = c.fov; camera.fov = c.fov; camera.zoom = zoomNow; camera.updateProjectionMatrix(); }
    // 飛機
    const qp = A.planePoseAt(e);
    plane.position.set(qp.x, qp.y + A.PLANE_REST_Y, qp.z); plane.rotation.set(-qp.pitch, qp.yaw, qp.roll || 0);
    if (plane.userData.gear !== qp.gear) setGear(plane, qp.gear);
    steerNose(plane, qp.steer);
    // 輪子照走過的距離轉（半徑 0.5）；推出去的時候倒轉；離地就不轉。
    if (qp.y < 0.5) { wheelSpin += (qp.s - lastS) / 0.5 * (qp.pushback ? -1 : 1); for (const w of wheels) w.rotation.x = wheelSpin; } lastS = qp.s;
    if (qp.pushback) { pbt.visible = true; pbt.position.set(qp.x, 0, qp.z - 22.5); pbt.rotation.y = Math.PI; } else if (e < A.PHASES.apron[0]) pbt.visible = false;
    // 旅客：腳照他真的走了多遠擺（1.2 公尺一步的節奏），不是照時間。停下來先把腿收齊再站好，不會立正。
    // （2026-11-18 批 A；之前腿擺固定 9 rad/s 跟捲動快慢無關，而且捲動一停 180 毫秒就立正。）
    const tr = A.travellerAt(e);
    traveller.visible = tr.visible;
    if (tr.visible) {
      traveller.position.set(tr.pos[0], tr.pos[1], tr.pos[2]); traveller.userData.baseY = tr.pos[1]; traveller.rotation.y += wr(tr.yaw - traveller.rotation.y) * Math.min(1, dt * 9);
      const d = Math.min(0.35, Math.hypot(tr.pos[0] - trLast[0], tr.pos[2] - trLast[2])); trLast = tr.pos;
      if (d > 0.002) { walkT += d / 1.2; walkOn = true; }
      else if (walkOn) { const rem = (Math.PI - (walkT * 9 + traveller.userData.phase) % Math.PI) / 9; if (rem < 0.06) { walkT += rem; walkOn = false; } else walkT += 0.05; }
      walkCycle(traveller, walkT, walkOn);
    }
    // 天空與霧：離地之後慢慢變成高空的藍、霧變薄（機場在底下的霧裡縮小）。
    const lift = qp.lift || 0;
    // 批 C：時間在走。停機坪那段從正午走到黃昏，起飛是 golden hour：太陽往西沉（飛機往 -x 飛，正對落日）、光變暖、天空帶橘；離地之後再混成高空的藍。
    const tod = smooth(clamp01((e - 0.45) / 0.55));
    sun.color.copy(P.cream).lerp(P.orange, tod * 0.55); sun.intensity = lerp(1.7, 1.5, tod); hemi.color.copy(P.sky).lerp(P.orange, tod * 0.22);
    SUN_OFF.set(lerp(-110, -230, tod), lerp(170, 55, tod), lerp(-70, -30, tod)); sun.position.copy(lookV).add(SUN_OFF);
    // 鏡頭穿雲：離雲 26 公尺內霧變濃變白。
    let fl = 0; for (const cl of clouds) { const d = camera.position.distanceTo(cl.position); if (d < 26) fl = Math.max(fl, 1 - d / 26); }
    trailM.opacity = 0.5 * smooth(clamp01((lift - 0.04) / 0.3));
    scene.background.copy(P.sky).lerp(P.orange, tod * 0.3 * (1 - lift)).lerp(P.skyHigh, lift * 0.85).lerp(P.cloud, fl); scene.fog.color.copy(scene.background).lerp(P.sky, 0.3 * (1 - fl));
    // 室內（航廈與空橋）霧幾乎關掉、半球光的地面色換成沙色，裡面才不會灰綠；升出空橋的那一段慢慢換回室外的。
    const inside = 1 - smooth(clamp01((e - 0.335) / 0.065));
    scene.fog.density = lerp(lerp(0.0013, 0.0006, lift), 0.0005, inside) + fl * 0.05;   // 2026-11-18 第四批：外面的霧變淡（0.0022 → 0.0013，起飛 0.0009 → 0.0006），遠處的山、海、城市才看得到
    hemi.groundColor.copy(P.grass).lerp(P.sand, inside * 0.7); hemi.intensity = lerp(lerp(0.95, 0.7, lift), 1.1, inside);
    // 太陽跟著鏡頭看的點；室內陰影的範圍小、室外大。影子只在該重畫的時候重畫（上面 autoUpdate 那段）。
    shadowTick(e, t);
    // 閒置：信標、雲、加油車、行李車、走道上的人、原地的人。
    beacon.rotation.y = t * 2.4;
    if (boardFlip) {
      if (boardFlip.t0 == null) boardFlip.t0 = t;
      const u = (t - boardFlip.t0) / 0.5, sy = u < 0.5 ? 1 - u * 2 : Math.min(1, (u - 0.5) * 2);
      if (u >= 0.5 && boardFlip.tex) { boards.forEach(b => { b.material.map = boardFlip.tex; b.material.needsUpdate = true; }); boardFlip.tex = null; }   /* 舊的 map 不 dispose：在快取裡，下次換回來直接用 */
      boards.forEach(b => { b.scale.y = Math.max(0.02, sy); });
      if (u >= 1) boardFlip = null;
    }
    for (const cl of clouds) { cl.position.x += cl.userData.v * dt; if (cl.position.x > cl.userData.x0 + 300) cl.position.x -= 600; }   /* 用 dt、飄出 300 公尺就繞回來（之前每幀固定加、永遠不回來）*/
    fuel[0].position.x = 60 + Math.sin(t * 0.12) * 30; fuel[0].rotation.y += wr((Math.cos(t * 0.12) > 0 ? Math.PI / 2 : -Math.PI / 2) - fuel[0].rotation.y) * Math.min(1, dt * 4);
    { const u = (t * 0.03) % 1, ang = u * Math.PI * 2; tug.position.set(40 + Math.cos(ang) * 14, 0, 148 + Math.sin(ang) * 14); tug.rotation.y = -ang; }
    // 走道上來回的人：到頭站 1.2 秒、轉身用追的（批 B，之前瞬間翻面）。從 x0 走到 x1，臉跟著方向；stand：站在電動步道上。
    for (const f of walkers) { const w = f.userData.w, span = Math.abs(w.x1 - w.x0), T = span / w.sp, H = 1.2, u = t % (2 * (T + H)), sgn = w.x1 >= w.x0 ? 1 : -1;
      const d = u < T ? u * w.sp : u < T + H ? span : u < 2 * T + H ? span - (u - T - H) * w.sp : 0, mv = u < T || (u >= T + H && u < 2 * T + H), dir = (u < T || u >= 2 * T + H ? 1 : -1) * sgn;
      f.position.set(w.x0 + sgn * d, f.userData.baseY || 0, w.z); f.rotation.y += wr((dir > 0 ? Math.PI / 2 : -Math.PI / 2) - f.rotation.y) * Math.min(1, dt * 7); walkCycle(f, t, mv && !w.stand); }
    for (const f of idleFigs) walkCycle(f, t, false);
    for (const x of extras) if (x.tick) x.tick(t, e);
    if (people) people.sync();   // 人的零件世界矩陣抄進 InstancedMesh（2026-11-17 批 1b）
    renderer.render(scene, camera);
  }
  // 世界的一點投到螢幕（像素）。回 { x, y, visible, depth }。
  function project(anchor) {
    tmpV.set(anchor[0], anchor[1] + 1.2, anchor[2]).project(camera);
    return { x: (tmpV.x + 1) / 2 * W, y: (1 - tmpV.y) / 2 * Hh, visible: tmpV.z < 1 && tmpV.x > -1.3 && tmpV.x < 1.3 && tmpV.y > -1.3 && tmpV.y < 1.3, depth: tmpV.z };
  }
  function dispose() { renderer.dispose(); }
  // 半徑 0.6 公尺以下的小東西不投影（影子看不出來，但各是陰影貼圖裡的一個 draw call）。
  // createScene 蓋完叫一次，setStops 放完小場景再叫一次。
  function pruneCasters() { world.traverse(m => { if (!m.isMesh || !m.castShadow || m.isInstancedMesh) return; const g = m.geometry; if (!g.boundingSphere) g.computeBoundingSphere(); const r = g.boundingSphere ? g.boundingSphere.radius * Math.max(m.scale.x, m.scale.y, m.scale.z) : 1; if (r < 0.6) m.castShadow = false; }); renderer.shadowMap.needsUpdate = true; }
  pruneCasters();
  // 靜態的東西合併：同材質、同一格的靜態 Mesh 合成一個。會動的、有貼圖的、InstancedMesh、人，都不碰。
  if (new URLSearchParams(location.search).get("merge") !== "0") mergeStatic();   // ?merge=0：不合併，給除錯用的射線檢查（合併後一個 mesh 幾萬個三角形，射線慢到當掉）
  function mergeStatic() {
    const groups = new Map(); const dyn = new Set();
    world.updateMatrixWorld(true);
    world.traverse(o => { if (o.userData.dynamic || (o.parent && dyn.has(o.parent))) { dyn.add(o); return; } });
    // 小的 InstancedMesh（24 個以下）也攤開合進去：道具一組組各自 instanced，加起來兩百多個 draw call，攤開合併比留著省。
    world.traverse(m => {
      if (!m.isMesh || dyn.has(m) || m.userData.peoplePool) return;
      if (m.isInstancedMesh && m.count > 24) return;
      const g = m.geometry, mt = m.material; if (!g.attributes.position || !g.attributes.normal || Array.isArray(mt) || mt.map) return;
      const key = mt.uuid + "|" + (m.castShadow ? 1 : 0) + (m.receiveShadow ? 1 : 0) + "|" + Math.floor(m.matrixWorld.elements[12] / 80) + "," + Math.floor(m.matrixWorld.elements[14] / 80);
      (groups.get(key) || groups.set(key, []).get(key)).push(m);
    });
    const nm = new THREE.Matrix3(), mw = new THREE.Matrix4(), im = new THREE.Matrix4();
    for (const list of groups.values()) {
      if (list.length < 2 && !list[0].isInstancedMesh) continue;
      const pos = [], nor = [], idx = []; let off = 0;
      for (const m of list) {
        const g = m.geometry, p = g.attributes.position, n = g.attributes.normal, ix = g.index ? g.index.array : null, reps = m.isInstancedMesh ? m.count : 1;
        for (let k = 0; k < reps; k++) {
          if (m.isInstancedMesh) { m.getMatrixAt(k, im); mw.multiplyMatrices(m.matrixWorld, im); } else mw.copy(m.matrixWorld);
          nm.getNormalMatrix(mw);
          for (let i = 0; i < p.count; i++) { tmpV.fromBufferAttribute(p, i).applyMatrix4(mw); pos.push(tmpV.x, tmpV.y, tmpV.z); tmpV.fromBufferAttribute(n, i).applyMatrix3(nm).normalize(); nor.push(tmpV.x, tmpV.y, tmpV.z); }
          if (ix) for (let i = 0; i < ix.length; i++) idx.push(ix[i] + off); else for (let i = 0; i < p.count; i++) idx.push(i + off);   /* ExtrudeGeometry 沒有 index */
          off += p.count;
        }
        m.parent.remove(m);
      }
      const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3)); geo.setIndex(idx);
      const mesh = new THREE.Mesh(geo, list[0].material); mesh.castShadow = list[0].castShadow; mesh.receiveShadow = list[0].receiveShadow; world.add(mesh);
    }
    renderer.shadowMap.needsUpdate = true;
  }
  return { setStops, setBoard, prepareBoard, setGate, setZoom, resize, render, project, dispose, renderer, scene, camera, stopMarkers: () => stopMarkers };
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
function ribbon(points, half, y, material, off) {
  const step = 6, pos = [], idx = [], o = off || 0;
  const pts = points.filter((_, i) => i % step === 0 || i === points.length - 1);
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1, nx = dz / l, nz = -dx / l;
    pos.push(pts[i][0] + nx * (o + half), y, pts[i][1] + nz * (o + half), pts[i][0] + nx * (o - half), y, pts[i][1] + nz * (o - half));
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
