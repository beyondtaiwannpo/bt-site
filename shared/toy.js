// 玩具島引擎（2026-11-17 從 island/src/scene.js 抽出來，Paul 說「Yes, shared file」）。
// /island/ 與 /history/ 共用的那一套 3D 做法：圓角盒子組一切、七色混色、canvas 地面、大頭 chibi 小人與人的狀態機、
// 橋四種加滑水道、建築十幾種、機場與小飛機、裝飾小島、小船、熱氣球、雲、牌子（DOM，只改 transform）、鏡頭阻尼。
// 照 HEART 政策島（puma.taipei/heart-island）的配方：窄鏡頭（fov 32）從高處斜看、ACES 調色、MeshStandard、一盞暖太陽加天光加淡霧。
//
// ── 守的四件事（跟 island/src/scene.js 原來一樣）──
// 1. 這裡沒有任何一頁的字、任何一個 team 的字、任何站的字。哪一座島叫什麼、放什麼，全部由頁面（island/history 的 scene.js）丟進來。
// 2. Three 只有這一支與各頁的 scene.js import（check.sh 守）。
// 3. 會動的東西全部在 motion() 裡（每一幀的迴圈）。頁面開了減少動態效果就不呼叫它，畫面改一次畫一次。
// 4. 顏色七色進來混色出去，這裡沒有色碼。
// 5. 依賴方向只往下：這支檔不 import 任何功能資料夾（check.sh 的 SHARED_UP 守）。頁面自己的版面（島在哪、路怎麼彎）用參數傳進來。
import * as THREE from "three";
export { THREE };

export function webglOK() { try { const c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); } catch (e) { return false; } }
export function mulberry(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export const TAU = Math.PI * 2;

// 圓角盒子（cdnjs 沒有 three 的 addon，自己用擠出加斜角做一個）。
// ⚠ 圓角是往外長的（bevelSize）：w h d 是中間那塊的尺寸，實際是 w+2r × h+2r × d。頂面要落在 0 的話中心要放 -(h/2+r)。
const rboxCache = new Map();
export function rbox(w, h, d, r) {
  const key = [w, h, d, r].join(","); if (rboxCache.has(key)) return rboxCache.get(key);
  const rr = Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001);
  const s = new THREE.Shape(); const x0 = -w / 2 + rr, x1 = w / 2 - rr, y0 = -h / 2 + rr, y1 = h / 2 - rr;
  s.moveTo(x0, -h / 2); s.lineTo(x1, -h / 2); s.absarc(x1, y0, rr, -Math.PI / 2, 0, false); s.lineTo(w / 2, y1); s.absarc(x1, y1, rr, 0, Math.PI / 2, false);
  s.lineTo(x0, h / 2); s.absarc(x0, y1, rr, Math.PI / 2, Math.PI, false); s.lineTo(-w / 2, y0); s.absarc(x0, y0, rr, Math.PI, Math.PI * 1.5, false);
  const g = new THREE.ExtrudeGeometry(s, { depth: Math.max(0.01, d - rr * 2), bevelEnabled: true, bevelThickness: rr, bevelSize: rr, bevelSegments: 3, curveSegments: 6 });
  g.translate(0, 0, -(d - rr * 2) / 2); g.computeVertexNormals(); rboxCache.set(key, g); return g;
}
// 直角盒子（2026-11-18 第四批）：門面的小零件（窗框、窗台、排水管、欄杆）用它，12 個三角形；rbox 一個兩千多個點，幾百個窗框會把三角形數撐大三成。
const boxCache = new Map();
export function box(w, h, d) { const key = [w, h, d].join(","); if (boxCache.has(key)) return boxCache.get(key); const g = new THREE.BoxGeometry(w, h, d); boxCache.set(key, g); return g; }
// 幾個有 index 的幾何黏成一個（嬰兒車、輪椅這種一個 InstancedMesh 畫完的道具）：parts 是 [幾何, x, y, z, sx, sy, sz, rx, ry, rz]。
export function joinGeo(parts) {
  const pos = [], nor = [], idx = []; let off = 0; const m = new THREE.Matrix4(), nm = new THREE.Matrix3(), v = new THREE.Vector3(), e = new THREE.Euler(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
  for (const [g, x, y, z, sx, sy, sz, rx, ry, rz] of parts) {
    e.set(rx || 0, ry || 0, rz || 0); q.setFromEuler(e); sc.set(sx == null ? 1 : sx, sy == null ? (sx == null ? 1 : sx) : sy, sz == null ? (sx == null ? 1 : sx) : sz); m.compose(v.set(x || 0, y || 0, z || 0), q, sc); nm.getNormalMatrix(m);
    const p = g.attributes.position, n = g.attributes.normal;
    for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).applyMatrix4(m); pos.push(v.x, v.y, v.z); v.fromBufferAttribute(n, i).applyMatrix3(nm).normalize(); nor.push(v.x, v.y, v.z); }
    for (let i = 0; i < g.index.count; i++) idx.push(g.index.getX(i) + off); off += p.count;
  }
  const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3)); geo.setIndex(idx); return geo;
}
// 一面兩層的三角旗（正面朝 +z、背面朝 -z 各一片，所以不用雙面材質，合色的時候才合得進去）。apex 是尖端在哪：right 尖端朝右（旗桿上的），down 尖端朝下（彩旗串上的）。
const flagCache = new Map();
export function flagGeo(w, h, apex) {
  const key = w + "," + h + "," + apex; if (flagCache.has(key)) return flagCache.get(key);
  const tri = apex === "down" ? [-w / 2, 0, 0, w / 2, 0, 0, 0, -h, 0] : apex === "up" ? [-w / 2, 0, 0, w / 2, 0, 0, 0, h, 0] : [0, 0, 0, w, h / 2, 0, 0, h, 0];
  const pos = tri.concat([tri[0], tri[1], tri[2], tri[6], tri[7], tri[8], tri[3], tri[4], tri[5]]); const nor = [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, -1, 0, 0, -1];
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3)); g.setIndex([0, 1, 2, 3, 4, 5]); flagCache.set(key, g); return g;
}
// 島的身體：圓柱、圓角長方、任意多邊形（六邊形）。擠出 h、轉平、再抬 0.5（斜角那一截），用法照 landmass()：放 -h 時頂面落在 0。
export function roundPrism(r, h) { const sh = new THREE.Shape(); sh.absarc(0, 0, r, 0, TAU, false); const g = new THREE.ExtrudeGeometry(sh, { depth: h, bevelEnabled: true, bevelThickness: 0.5, bevelSize: 0.5, bevelSegments: 2, curveSegments: 40 }); g.rotateX(Math.PI / 2); g.translate(0, 0.5, 0); return g; }
export function rectPrism(r, h) { const w = r * 2.0, d = r * 1.75; const sh = new THREE.Shape(); const rr = 1.6; sh.moveTo(-w / 2 + rr, -d / 2); sh.lineTo(w / 2 - rr, -d / 2); sh.absarc(w / 2 - rr, -d / 2 + rr, rr, -Math.PI / 2, 0, false); sh.lineTo(w / 2, d / 2 - rr); sh.absarc(w / 2 - rr, d / 2 - rr, rr, 0, Math.PI / 2, false); sh.lineTo(-w / 2 + rr, d / 2); sh.absarc(-w / 2 + rr, d / 2 - rr, rr, Math.PI / 2, Math.PI, false); sh.lineTo(-w / 2, -d / 2 + rr); sh.absarc(-w / 2 + rr, -d / 2 + rr, rr, Math.PI, Math.PI * 1.5, false); const g = new THREE.ExtrudeGeometry(sh, { depth: h, bevelEnabled: true, bevelThickness: 0.5, bevelSize: 0.5, bevelSegments: 2, curveSegments: 8 }); g.rotateX(Math.PI / 2); g.translate(0, 0.5, 0); return g; }
export function polyPrism(points, h) { const s = new THREE.Shape(); points.forEach(([x, z], i) => i ? s.lineTo(x, z) : s.moveTo(x, z)); s.closePath(); const g = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: true, bevelThickness: 0.5, bevelSize: 0.5, bevelSegments: 2 }); g.rotateX(Math.PI / 2); g.translate(0, 0.5, 0); return g; }
// 六邊形的六個頂點（平頂）。
export function hexPoints(cx, cz, r) { const pts = []; for (let k = 0; k < 6; k++) { const a = k * TAU / 6 + Math.PI / 6; pts.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]); } return pts; }
export function hexPrism(r, h) { return polyPrism(hexPoints(0, 0, r), h); }

export function colours(p) {
  const C = k => new THREE.Color(p[k]); const mix = (a, b, t) => a.clone().lerp(b, t);
  const navy = C("navy"), teal = C("teal"), orange = C("orange"), sand = C("sand"), cream = C("cream"), yellow = C("yellow"), grey = C("grey"), white = new THREE.Color(1, 1, 1);
  const grass = mix(mix(teal, yellow, 0.55), sand, 0.12).offsetHSL(0, 0.14, 0.02);
  return {
    navy, teal, orange, sand, cream, yellow, grey, white, sky: mix(cream, white, 0.35),
    water: mix(teal, cream, 0.22).offsetHSL(0, 0.08, 0), shallow: mix(teal, cream, 0.5), grass, beach: mix(sand, cream, 0.5), cliff: mix(mix(sand, grey, 0.35), teal, 0.25),
    road: mix(cream, grey, 0.35), asphalt: mix(grey, navy, 0.5).multiplyScalar(0.55), /* 真的柏油色：灰藍再壓暗，不然跟平台一樣淡（Paul 2026-11-17「where's the runway?」）*/ wall: mix(cream, white, 0.5), wall2: mix(sand, white, 0.3), wood: mix(mix(sand, navy, 0.35), orange, 0.2), dark: mix(navy, grey, 0.15),
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

// 每種建築在地上佔多大（人走路繞開的圓）。頁面放一棟就 push 一個這個半徑的圓。
export const KIND_R = { airport: 1.5, post: 1.4, tent: 2.6, camp: 3.2, hall: 3.2, desk: 2.6, home: 2.8, booth: 2.0, pier: 2.6, tower: 2.2, stage: 3.0, studio: 3.9, school: 4.4 };
// 四種橋加滑水道，頁面照這個表輪流。
export const BRIDGE_STYLES = 5;

// ═══ 人：大頭 chibi。一個工廠，/island/ 與 /history/ 的機場都用它（Paul 2026-11-17：「I want the people to be like the BT Island people」）。═══
// 吃 { P（colours() 的結果）, M（至少 skin hair shirt pants eye orange navy 這幾個材質）, rnd }，回 { makePerson, pose }。
// makePerson(o)：skin hair shirt pants 是色票的序號，pack 背包、bag 行李、hat 帽子、scale 大小（預設 1.25）。回一個 Group，零件有名字（legL legR armL armR head）。
// pose(g, t)：照 g.userData 擺姿勢：sitting 坐、moving 走（腿手擺、身體上下）、talking 手在比、都不是就站著微微晃。y 用 userData.baseY 當底。
export function peopleKit({ P, rnd, parent, capacity }) {
  // 2026-11-17 順不順批 1b：人改成 InstancedMesh。之前一個人十二三個 mesh，航廈裡三十幾個人就是四百多個 draw call（一幀 525 個裡約 470 個是人）。
  // 現在每一種零件一個 InstancedMesh（腿、手、身體、頭、頭髮、眼睛、背包、行李、帽子、腳下那一圈），不管幾個人都是 12 個 draw call。
  // 每個人還是一個 Group，零件是空的 Object3D（名字照舊：legL legR armL armR head），pose() 照舊轉它們；每一幀 sync() 把零件的世界矩陣抄進 instance。
  // 顏色用 instanceColor（材質底色白，乘上每個人自己的膚色、髮色、衣服色）。
  const PG = { head: new THREE.SphereGeometry(0.36, 16, 12), cap: new THREE.SphereGeometry(0.38, 16, 8, 0, TAU, 0, Math.PI * 0.52), eye: new THREE.SphereGeometry(0.045, 8, 6), body: new THREE.CapsuleGeometry(0.24, 0.3, 4, 10), arm: new THREE.CapsuleGeometry(0.075, 0.26, 3, 8), leg: rbox(0.2, 0.3, 0.22, 0.07).clone(), pack: rbox(0.34, 0.4, 0.18, 0.06), bag: rbox(0.5, 0.42, 0.26, 0.06), hat: new THREE.LatheGeometry([[0, 0.34], [0.22, 0.32], [0.36, 0.2], [0.4, 0.04], [0.5, 0.02], [0.5, -0.02], [0.4, -0.02], [0, -0.02]].map(([r, y]) => new THREE.Vector2(r, y)), 14), shadow: new THREE.CircleGeometry(0.38, 16) };
  PG.shadow.rotateX(-Math.PI / 2);
  // 第四批的道具（Paul 2026-11-18：人要有變化）：陽傘（傘面加傘柄，舉在右手上方）、抱著的箱子、推的嬰兒車、輪椅。每一樣一個 InstancedMesh，不管幾個人都是一個 draw call。
  // 幾個幾何黏成一個（joinGeo），輪子另外一個（顏色不一樣）。嬰兒車在人前面 0.75；輪椅的座位在髖的高度（0.3）下面，人照坐姿擺（腿往前伸）就是坐在裡面。
  const cyl = (r, h, n) => new THREE.CylinderGeometry(r, r, h, n || 8);
  PG.brolly = new THREE.ConeGeometry(0.58, 0.2, 10); PG.stick = cyl(0.015, 0.62, 5); PG.box = new THREE.BoxGeometry(0.46, 0.36, 0.36);
  PG.stroller = joinGeo([[new THREE.BoxGeometry(0.5, 0.26, 0.56), 0, 0.46, 0.08], [new THREE.BoxGeometry(0.52, 0.3, 0.3), 0, 0.72, 0.26], [new THREE.BoxGeometry(0.5, 0.04, 0.04), 0, 0.96, -0.36], [new THREE.BoxGeometry(0.04, 0.52, 0.04), -0.23, 0.72, -0.3, 1, 1, 1, 0.25], [new THREE.BoxGeometry(0.04, 0.52, 0.04), 0.23, 0.72, -0.3, 1, 1, 1, 0.25]]);
  PG.strollerWheels = joinGeo([[-0.28, 0.12, 0.26], [0.28, 0.12, 0.26], [-0.28, 0.12, -0.22], [0.28, 0.12, -0.22]].map(([x, y, z]) => [cyl(0.12, 0.06, 10), x, y, z, 1, 1, 1, 0, 0, Math.PI / 2]));
  PG.chair = joinGeo([[new THREE.BoxGeometry(0.56, 0.06, 0.5), 0, 0.26, 0.05], [new THREE.BoxGeometry(0.56, 0.5, 0.06), 0, 0.52, -0.2], [new THREE.BoxGeometry(0.4, 0.04, 0.2), 0, 0.08, 0.5], [new THREE.BoxGeometry(0.04, 0.04, 0.6), -0.3, 0.1, 0.2], [new THREE.BoxGeometry(0.04, 0.04, 0.6), 0.3, 0.1, 0.2], [new THREE.BoxGeometry(0.04, 0.4, 0.04), -0.3, 0.9, -0.22], [new THREE.BoxGeometry(0.04, 0.4, 0.04), 0.3, 0.9, -0.22], [new THREE.BoxGeometry(0.66, 0.04, 0.04), 0, 1.1, -0.22]]);
  PG.chairWheels = joinGeo([[new THREE.TorusGeometry(0.3, 0.045, 6, 16), -0.34, 0.3, -0.05, 1, 1, 1, 0, Math.PI / 2], [new THREE.TorusGeometry(0.3, 0.045, 6, 16), 0.34, 0.3, -0.05, 1, 1, 1, 0, Math.PI / 2], [cyl(0.07, 0.05, 8), -0.22, 0.07, 0.42, 1, 1, 1, 0, 0, Math.PI / 2], [cyl(0.07, 0.05, 8), 0.22, 0.07, 0.42, 1, 1, 1, 0, 0, Math.PI / 2]]);
  // 腿從髖關節轉、手從肩膀轉（Paul 2026-11-17：「the leg, they look weird」「people walking backward」）：之前零件的原點在正中間，一轉就是整條腿繞著膝蓋轉，看起來像倒著走。
  // 幾何往下移半截，原點就在最上面；零件的位置改成髖（0.3）與肩（0.85）。
  PG.leg.translate(0, -0.15, 0); PG.arm.translate(0, -0.17, 0);
  const CAP = capacity || 256;
  const white = new THREE.Color(1, 1, 1);
  const std = extra => new THREE.MeshStandardMaterial({ color: white, roughness: 0.82, metalness: 0, ...(extra || {}) });
  // 零件表：名字、幾何、材質、本地位置與旋轉。一個人的零件就是這張表的一份（pack、bag、hat 看選項）。
  const PARTS = {
    legL: { geo: PG.leg, mat: std(), pos: [-0.13, 0.3, 0] }, legR: { geo: PG.leg, mat: null, pos: [0.13, 0.3, 0] },
    body: { geo: PG.body, mat: std(), pos: [0, 0.62, 0] },
    armL: { geo: PG.arm, mat: null, pos: [-0.33, 0.85, 0] }, armR: { geo: PG.arm, mat: null, pos: [0.33, 0.85, 0] },
    head: { geo: PG.head, mat: std({ roughness: 0.7 }), pos: [0, 1.2, 0] },
    cap: { geo: PG.cap, mat: std({ roughness: 0.9 }), pos: [0, 1.23, 0], rot: [-0.25, 0, 0] },
    eyeL: { geo: PG.eye, mat: std({ roughness: 0.4 }), pos: [-0.13, 1.2, 0.33] }, eyeR: { geo: PG.eye, mat: null, pos: [0.13, 1.2, 0.33] },
    pack: { geo: PG.pack, mat: std(), pos: [0, 0.7, -0.3] }, bag: { geo: PG.bag, mat: null, pos: [0.42, 0.21, 0] }, hat: { geo: PG.hat, mat: null, pos: [0, 1.42, 0] },
    shadow: { geo: PG.shadow, mat: new THREE.MeshBasicMaterial({ color: white, transparent: true, opacity: 0.12, depthWrite: false }), pos: [0, 0.02, 0] },
    // 道具（opt 是 makePerson 的選項名，沒給就不畫）
    brolly: { geo: PG.brolly, mat: null, pos: [0.33, 1.82, 0.05], opt: "brolly" }, stick: { geo: PG.stick, mat: null, pos: [0.33, 1.5, 0.05], opt: "brolly" },
    box: { geo: PG.box, mat: null, pos: [0, 0.72, 0.42], opt: "box" },
    stroller: { geo: PG.stroller, mat: null, pos: [0, 0, 0.78], opt: "stroller" }, strollerWheels: { geo: PG.strollerWheels, mat: null, pos: [0, 0, 0.78], opt: "stroller" },
    chair: { geo: PG.chair, mat: null, pos: [0, 0, 0], opt: "chair" }, chairWheels: { geo: PG.chairWheels, mat: null, pos: [0, 0, 0], opt: "chair" },
  };
  PARTS.legR.mat = PARTS.legL.mat; PARTS.armL.mat = PARTS.body.mat; PARTS.armR.mat = PARTS.body.mat; PARTS.eyeR.mat = PARTS.eyeL.mat; PARTS.bag.mat = PARTS.pack.mat; PARTS.hat.mat = PARTS.pack.mat;
  for (const k of ["brolly", "stick", "box", "stroller", "strollerWheels", "chair", "chairWheels"]) PARTS[k].mat = PARTS.pack.mat;
  const NONE = new THREE.Matrix4().makeScale(0, 0, 0);
  const pools = {}; const owners = {};   // owners[name][slot] = 那個人的 Group
  for (const name in PARTS) {
    const im = new THREE.InstancedMesh(PARTS[name].geo, PARTS[name].mat, CAP); im.name = "people-" + name; im.frustumCulled = false; im.castShadow = false; im.receiveShadow = false;
    for (let i = 0; i < CAP; i++) { im.setMatrixAt(i, NONE); im.setColorAt(i, white); }
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); im.count = 0; im.userData.peoplePool = name; pools[name] = im; owners[name] = [];
    if (parent) parent.add(im);
  }
  const free = []; let next = 0;   // 一個人一個 slot（所有零件用同一個號碼）
  const brollyC = [P.orange, P.teal, P.yellow], boxC = P.cream.clone().lerp(P.sand, 0.5), strollerC = P.navy.clone().lerp(P.white, 0.25);
  const colourOf = (o, g) => ({ legL: o.pantsC, legR: o.pantsC, body: o.shirtC, armL: o.shirtC, armR: o.shirtC, head: o.skinC, cap: o.hairC, eyeL: P.dark, eyeR: P.dark, pack: P.orange, bag: P.navy, hat: P.navy, shadow: P.navy,
    brolly: brollyC[o.brolly % 3], stick: P.dark, box: boxC, stroller: strollerC, strollerWheels: P.dark, chair: strollerC, chairWheels: P.dark })[g];
  // o 的選項：skin hair shirt pants 色票序號；pack 背包、bag 行李、hat 帽子；brolly 陽傘（1 到 3 是顏色）、box 抱箱子、stroller 推嬰兒車、chair 坐輪椅；scale 大小。
  function makePerson(o) {
    o = o || {}; const g = new THREE.Group();
    const col = { skinC: P.skin[(o.skin || 0) % 3], hairC: P.hair[(o.hair || 0) % 3], shirtC: P.shirt[(o.shirt || 0) % 6], pantsC: P.pants[(o.pants || 0) % 3], brolly: (o.brolly | 0) + 2 };
    const parts = {}; const slot = free.length ? free.pop() : (next < CAP ? next++ : -1);
    if (slot < 0) console.warn("peopleKit：人超過 " + CAP + " 個，這一個畫不出來");
    for (const name in PARTS) {
      if ((name === "pack" && !o.pack) || (name === "bag" && !o.bag) || (name === "hat" && !o.hat)) continue;
      const d = PARTS[name]; if (d.opt && !o[d.opt]) continue;
      const node = new THREE.Object3D(); node.name = name; node.position.set(...d.pos); if (d.rot) node.rotation.set(...d.rot); g.add(node); parts[name] = node;
      if (slot >= 0) { pools[name].setColorAt(slot, colourOf(col, name)); pools[name].instanceColor.needsUpdate = true; owners[name][slot] = g; pools[name].count = Math.max(pools[name].count, slot + 1); }
    }
    g.scale.setScalar(o.scale != null ? o.scale : 1.15);   // 批 D：1.25 跟站著的人（1.1）差 14%，拉近   // 島上放大一點（Paul 2026-11-17「push further」：HEART 的人跟島的比例比較大）；機場那一頁 1.0
    g.userData = { phase: rnd() * 6, moving: false, baseY: 0, parts, slot, brolly: !!o.brolly, box: !!o.box, stroller: !!o.stroller, chair: !!o.chair };
    return g;
  }
  // 人拿掉：slot 還回去，所有零件縮成 0。
  function freePerson(g) {
    const slot = g.userData.slot; if (slot == null || slot < 0) return;
    for (const name in PARTS) { if (owners[name][slot] === g) { owners[name][slot] = null; pools[name].setMatrixAt(slot, NONE); pools[name].instanceMatrix.needsUpdate = true; } }
    g.userData.slot = -1; free.push(slot);
  }
  // 每一幀（畫之前）：每個人每個零件的世界矩陣抄進 instance。人不在畫面上（visible false）就縮成 0。
  // 2026-11-18：每個人的世界矩陣一幀只算一次（之前每一種零件都叫一次 updateMatrixWorld，一個人算十三次，機場兩百多人一幀 10 ms 都在算矩陣）。
  function sync() {
    const own0 = owners.legL;
    for (let i = 0; i < pools.legL.count; i++) { const g = own0[i]; if (g && g.visible) g.updateMatrixWorld(); }
    for (const name in PARTS) { const im = pools[name], own = owners[name]; let any = false;
      for (let i = 0; i < im.count; i++) { const g = own[i]; if (!g) continue; const node = g.userData.parts[name]; if (!node) continue;
        if (!g.visible) im.setMatrixAt(i, NONE); else im.setMatrixAt(i, node.matrixWorld); any = true; }
      if (any) im.instanceMatrix.needsUpdate = true; }
  }
  // 射線打到一個 pool：instanceId 對回那個人的 Group。
  const ownerOf = (im, instanceId) => (owners[im.userData.peoplePool] || [])[instanceId] || null;
  function pose(g, t) {
    const u = g.userData, { legL, legR, armL, armR, head } = u.parts;
    if (u.sitting || u.chair) { legL.rotation.x = -1.4; legR.rotation.x = -1.4; armL.rotation.x = -0.6; armR.rotation.x = -0.6; if (u.chair) g.position.y = u.baseY; }   // 坐著：腿伸前面，手放腿上（高度由 motion() 決定）；坐輪椅的一直是這個姿勢
    else if (u.moving) { const tt = u.wt != null ? u.wt : t, s = Math.sin(tt * 9 + u.phase); legL.rotation.x = s * 0.6; legR.rotation.x = -s * 0.6; armL.rotation.x = -s * 0.5; armR.rotation.x = s * 0.5; g.position.y = u.baseY + Math.abs(Math.cos(tt * 9 + u.phase)) * 0.05; }
    else if (u.talking) { legL.rotation.x = 0; legR.rotation.x = 0; const s = Math.sin(t * 3.1 + u.phase); armL.rotation.x = -0.4 + s * 0.25; armR.rotation.x = -0.3 - s * 0.2; g.position.y = u.baseY; }   // 聊天：手在比
    else { legL.rotation.x = 0; legR.rotation.x = 0; const b = Math.sin(t * 1.6 + u.phase); armL.rotation.x = 0.05 + b * 0.04; armR.rotation.x = -0.05 - b * 0.04; g.position.y = u.baseY + b * 0.02; g.rotation.z = Math.sin(t * 0.9 + u.phase) * 0.012; }   // 站著：呼吸、手微擺、重心微移（批 B，之前近看像雕像）
    head.rotation.y = u.talking ? Math.sin(t * 2.2 + u.phase) * 0.08 : Math.sin(t * 0.7 + u.phase) * 0.12 + Math.sin(t * 0.23 + u.phase * 2) * 0.14;
    head.rotation.x = u.talking ? Math.sin(t * 4 + u.phase) * 0.06 : 0;
    // 道具的手：舉傘的右手舉著、抱箱子的兩手往前抱、推車的兩手往前推（蓋掉上面擺的）。
    if (u.brolly) armR.rotation.x = -2.7; if (u.box) { armL.rotation.x = -1.3; armR.rotation.x = -1.3; } if (u.stroller) { armL.rotation.x = -0.9; armR.rotation.x = -0.9; }
  }
  return { makePerson, pose, sync, free: freePerson, ownerOf, pools: Object.values(pools) };
}
// 只要人不要整個引擎（/history/ 的機場自己有場景）：從七色直接做。parent 是 pool 要掛在哪個 Group 底下。
export function peopleFromPalette(palette, seed, parent, capacity) {
  return peopleKit({ P: colours(palette), rnd: mulberry(seed == null ? 5 : seed), parent, capacity });
}

// ═══ 引擎：畫布、材質、燈、海、所有的建造函式、人、鏡頭、牌子。頁面拿回來的 E 上面全部都有。═══
export function createEngine({ stage, pins, palette, phone, onSelect, onHover, freeCentre, freeWidth, seed }) {
  if (!webglOK()) throw new Error("no webgl");
  const canvas = document.createElement("canvas"); canvas.className = "scene3d"; stage.appendChild(canvas);
  const P = colours(palette);
  const std = (color, extra) => new THREE.MeshStandardMaterial({ color, roughness: 0.82, metalness: 0, ...(extra || {}) });
  const M = { grass: std(P.grass), beach: std(P.beach), cliff: std(P.cliff), road: std(P.road, { roughness: 0.95 }), asphalt: std(P.asphalt, { roughness: 0.95 }), wall: std(P.wall), wall2: std(P.wall2), wood: std(P.wood), dark: std(P.dark),
    trunk: std(P.trunk), cloud: std(P.cloud, { emissive: P.cloud, emissiveIntensity: 0.25 }), light: std(P.light, { emissive: P.light, emissiveIntensity: 0.9 }), amber: std(P.yellow, { emissive: P.yellow, emissiveIntensity: 0.8 }), cream: std(P.cream), white: std(P.white), orange: std(P.orange), teal: std(P.teal), navy: std(P.navy), yellow: std(P.yellow),
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
  const rnd = mulberry(seed == null ? 11 : seed);
  let shadowsDirty = true;

  // 海（一片，900 公尺）
  // 海面有一點起伏（2026-11-18 批 B）：180×180 格，頂點著色器加兩道正弦的湧浪（5 公分，波長 12 到 15 公尺），uT 每幀餵時間。之前只有貼圖在滑。
  const waveU = { value: 0 };
  M.water.onBeforeCompile = sh => { sh.uniforms.uT = waveU; sh.vertexShader = "uniform float uT;\n" + sh.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\ntransformed.z += sin(position.x * 0.5 + uT) * 0.03 + sin(position.y * 0.42 - uT * 1.3 + 1.7) * 0.02;"); };
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(900, 900, 180, 180), M.water); sea.rotation.x = -Math.PI / 2; sea.position.y = -0.63; sea.receiveShadow = true; world.add(sea);

  // 頁面往這些清單 push，最後 flushInstances() 一次畫完（InstancedMesh）。
  const pickables = [];   // 射線打得到的東西：mesh 的 userData.sel 是點到時回給頁面的那包
  const planes = [];      // 機場的飛機；有 userData.flight 的那一架在 motion() 裡飛
  const boards = [];      // 貼文牆上的板子；paintBoards() 把真的圖貼上去
  const treePlaces = [], bushPlaces = [], stoolPlaces = [], postPlaces = [];
  const coasters = [], beacons = [], boats = [], balloons = [], clouds = [], flags = [], foams = [], bounces = [], events = [];   // events：會發生的事（鯨魚、飛機），{ id, when(t), dur, pos() }，頁面拿去帶鏡頭
  const slides = new Map();   // "a>b" → { curve, dir, splash }：人過這條不是走的，是坐著溜
  const noPlant = [];   // 路與步道（世界座標的線段 { x0, z0, x1, z1, w }），flushInstances() 畫樹與矮樹之前把長在上面的挑掉（批 E）
  const onPath = (x, z, pad) => noPlant.some(s => { const dx = s.x1 - s.x0, dz = s.z1 - s.z0, l2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - s.x0) * dx + (z - s.z0) * dz) / l2)); return Math.hypot(x - (s.x0 + dx * t), z - (s.z0 + dz * t)) < s.w / 2 + pad; });
  const bridgeYs = new Map(), BRIDGE_Y = { 1: t => 0.5 * Math.sin(Math.PI * t), 2: t => 0.62 * Math.sin(Math.PI * t), 3: t => -0.28 * Math.sin(Math.PI * t) };   // 橋面高度（0 到 1 沿橋）：石拱、紅拱升，吊橋垂（批 D：之前人在拱橋裡沉、在吊橋上浮）
  const splashes = [];        // 滑水道底的水花（第四批）：{ ring, mat, drops, x, z, t0 }，人溜到最低點 motion() 把 t0 設成現在，接下來 1.3 秒水圈放大、水珠往上噴
  const groundCache = new Map();

  // ═══ 地面：一種花紋畫在 canvas 上當貼圖，沒有圖檔 ═══
  // 一格 4 公尺；ExtrudeGeometry 的 UV 就是公尺，所以 repeat 設 1/4 就會對齊。顏色全部從七色混出來。
  function groundMat(kind) {
    if (groundCache.has(kind)) return groundCache.get(kind);
    const c = document.createElement("canvas"); c.width = c.height = 256; const x = c.getContext("2d"); const css = col => "#" + col.getHexString();
    const mixc = (a, b, t) => a.clone().lerp(b, t);
    const fill = (col) => { x.fillStyle = css(col); x.fillRect(0, 0, 256, 256); };
    const lines = (col, w, step, both) => { x.strokeStyle = css(col); x.lineWidth = w; for (let i = 0; i <= 256; i += step) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 256); x.stroke(); if (both) { x.beginPath(); x.moveTo(0, i); x.lineTo(256, i); x.stroke(); } } };
    // 顏色要夠飽和（Paul 2026-11-17 第二次拿 HEART 比：那邊的地是磚紅、條紋綠、暖木色，不是淡淡的）。
    if (kind === "lawn") { fill(P.grass); x.fillStyle = css(mixc(P.grass, P.yellow, 0.18)); for (let i = 0; i < 256; i += 64) x.fillRect(i, 0, 32, 256); }
    else if (kind === "patch") { const cs = [mixc(P.cream, P.yellow, 0.3), mixc(P.teal, P.white, 0.45), mixc(P.yellow, P.white, 0.35), mixc(P.orange, P.white, 0.5), mixc(P.sand, P.orange, 0.3)]; for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { x.fillStyle = css(cs[(i * 3 + j * 5 + (i & 1)) % cs.length]); x.fillRect(i * 64, j * 64, 64, 64); } lines(mixc(P.cream, P.white, 0.6), 3, 64, true); }
    else if (kind === "tiles") { fill(mixc(P.orange, P.sand, 0.35)); lines(mixc(P.orange, P.white, 0.45), 4, 32, true); x.fillStyle = css(mixc(P.orange, P.sand, 0.2)); for (let i = 0; i < 8; i++) x.fillRect(((i * 5) % 8) * 32 + 4, ((i * 3) % 8) * 32 + 4, 24, 24); }
    else if (kind === "grid") { fill(mixc(mixc(P.teal, P.yellow, 0.4), P.navy, 0.08)); lines(mixc(P.white, P.cream, 0.3), 4, 128, true); x.strokeStyle = css(mixc(P.white, P.cream, 0.3)); x.lineWidth = 4; x.beginPath(); x.arc(128, 128, 40, 0, TAU); x.stroke(); }
    else if (kind === "paving") { fill(mixc(P.sand, P.grey, 0.45)); lines(mixc(P.cream, P.white, 0.4), 3, 64, true); x.fillStyle = css(mixc(P.sand, P.grey, 0.3)); for (let i = 0; i < 16; i += 3) x.fillRect((i % 4) * 64 + 3, Math.floor(i / 4) * 64 + 3, 58, 58); }
    else if (kind === "checker") { const a = mixc(P.cream, P.sand, 0.4), b = mixc(P.orange, P.white, 0.55); for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) { x.fillStyle = css((i + j) % 2 ? a : b); x.fillRect(i * 32, j * 32, 32, 32); } }
    else if (kind === "brick") { fill(mixc(P.sand, P.orange, 0.15)); x.fillStyle = css(mixc(P.orange, P.sand, 0.45)); for (let r = 0; r < 8; r++) for (let i = 0; i < 4; i++) x.fillRect(i * 64 + (r % 2 ? 32 : 0) + 2, r * 32 + 2, 60, 28); }
    else { fill(P.grass); x.fillStyle = css(mixc(P.grass, P.navy, 0.08)); for (let i = 0; i < 60; i++) { const a = (i * 97) % 256, b = (i * 61) % 256; x.fillRect(a, b, 5, 3); } }
    const tex = new THREE.CanvasTexture(c); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(0.25, 0.25); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.92, metalness: 0 }); groundCache.set(kind, mat); return mat;
  }

  // ═══ 一塊陸地：身體（崖）、頂面（地面花紋）、沙灘那一圈、浪花、淺水。shape 是 hex、round 或 rect；prism(r, h) 給那個形狀的幾何。回頂面那一片（頁面給它 userData.sel 就點得到）。═══
  function landmass(g, { shape, r, prism, top: topM }) {
    const body = new THREE.Mesh(prism(r, 2.6), M.cliff); body.position.y = -2.6; body.receiveShadow = true; g.add(body);
    const top = new THREE.Mesh(prism(r - 0.1, 0.3), topM || M.grass); top.position.y = -1.0; /* 圓角柱體的頂在本地 +1.0，放 -1.0 頂面才在 0 */ top.receiveShadow = true; g.add(top);
    // 沙灘那一圈與淺水：六邊形的島跟著六邊形，圓的跟著圓，方的用淺水就好（操場邊沒有沙灘）。
    const segs = shape === "hex" ? 6 : 40, rot = shape === "hex" ? Math.PI / 6 : 0;
    if (shape !== "rect") { const rim = new THREE.Mesh(new THREE.RingGeometry(r - 1.2, r + 0.1, segs, 1, rot), M.beach); rim.rotation.x = -Math.PI / 2; rim.position.y = 0.02; g.add(rim); }
    // 島邊一圈白色的浪花（HEART 的島邊都有）
    { const foam = new THREE.Mesh(new THREE.RingGeometry(r + 0.5, r + 1.2, segs, 1, rot), new THREE.MeshBasicMaterial({ color: P.white, transparent: true, opacity: 0.45, depthWrite: false })); foam.rotation.x = -Math.PI / 2; foam.position.y = -0.55; foam.userData.dynamic = true; foam.userData.ph = rnd() * TAU; g.add(foam); foams.push(foam); }   // 浪圈在 motion() 裡一推一推地放大縮小（批 B）
    const shallow = new THREE.Mesh(shape === "rect" ? rectPrism(r + 2.0, 0.01) : new THREE.CircleGeometry(r + 2.2, segs, rot), M.shallow); if (shape !== "rect") shallow.rotation.x = -Math.PI / 2; shallow.position.y = shape === "rect" ? -1.0 : -0.5; g.add(shallow);
    return top;
  }
  // 海上的水泥平台（機場用）：架在柱子上，沒有草、沒有樹、沒有旗，只有一支風向袋。平台 r*2.6 × r*2.0 公尺。回 { deck, flag }。
  // ⚠ rbox 的圓角是往外長的，h 1.2、r 0.3 的盒子其實高 1.8：要讓頂面在 0，中心就要放 -0.9（之前放 -0.6，跑道被埋在平台裡，Paul 2026-11-17「where's the runway?」）。
  function platform(g, r) {
    const deck = new THREE.Mesh(rbox(r * 2.6, 1.2, r * 2.0, 0.3), M.road); deck.position.y = -0.9; deck.receiveShadow = true; deck.castShadow = true; g.add(deck);
    for (const x of [-10, 0, 10]) for (const z of [-7, 7]) { const post = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 3, 8), M.dark); post.position.set(x, -2.4, z); g.add(post); }
    const edge_ = new THREE.Mesh(rbox(r * 2.6 + 0.4, 0.2, r * 2.0 + 0.4, 0.1), M.cream); edge_.position.y = -0.2; g.add(edge_);
    const sock = new THREE.Group(); sock.position.set(r * 1.2, 0, r * 0.85); g.add(sock);
    sock.add(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 3, 6), M.dark).translateY(1.5), new THREE.Mesh(new THREE.ConeGeometry(0.35, 1.4, 8), M.orange).translateY(3.1).rotateZ(-Math.PI / 2).translateY(0.3));
    sock.children[1].userData.dynamic = true; sock.children[1].userData.ph = rnd() * TAU; flags.push(sock.children[1]);   // 風向袋跟旗子一起飄（批 D）
    return { deck, flag: sock.children[1] };
  }
  // 旗桿加旗子（放在 x, z）。回旗子那一片（選中時頁面換它的材質）。
  function flagpole(g, x, z, flagM) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 5, 8), M.dark); pole.position.set(x, 2.5, z); pole.castShadow = true; g.add(pole);
    // 旗子的原點在旗桿那一邊，motion() 裡繞旗桿擺、沿風向縮放才像在飄（2026-11-18 批 A：之前標了 dynamic 但沒有人動它）。
    const flag = new THREE.Mesh(rbox(1.8, 1.0, 0.06, 0.03).clone().translate(0.9, 0, 0), flagM); flag.userData.dynamic = true; flag.userData.ph = rnd() * TAU; flag.position.set(x + 0.05, 4.4, z); flag.castShadow = true; g.add(flag); flags.push(flag); return flag;
  }

  // ═══ 建築 ═══
  function house(w, h, d, wallM, roofM) { const g = new THREE.Group(); const b = new THREE.Mesh(rbox(w, h, d, 0.12), wallM); b.position.y = h / 2; b.castShadow = true; b.receiveShadow = true; g.add(b); const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, d) * 0.78, h * 0.6, 4), roofM); roof.position.y = h + h * 0.3; roof.rotation.y = Math.PI / 4; roof.castShadow = true; g.add(roof); return g; }
  // ═══ 門面的零件（2026-11-18 第四批，Paul 第四次「More detail first」：之前的房子都是一個盒子加一個屋頂）═══
  // 全部都是小零件，加在房子的 group 裡，scene.js 的 mergeChildren 照樣把整棟合成一兩個 Mesh。座標照房子本地：正面朝 +z，地面 y 0。
  const mk = (geo, m, x, y, z, cast) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = cast !== false; return o; };
  // 窗：白框（比牆面凸一點）、發光的窗、窗台、中間一條直的窗櫺。
  function win(g, n, y, z, spread) { for (let i = 0; i < n; i++) { const x = (i - (n - 1) / 2) * spread; g.add(mk(box(0.66, 0.66, 0.06), M.white, x, y, z - 0.03, false), mk(rbox(0.5, 0.5, 0.08, 0.06), M.light, x, y, z, false), mk(box(0.78, 0.07, 0.18), M.white, x, y - 0.35, z + 0.05), mk(box(0.035, 0.52, 0.02), M.dark, x, y, z + 0.05, false)); } }
  // 門：白框、深色的門、黃色的門把、門口一塊台階；awning 給材質就有一片斜的雨棚加兩支撐桿；light 給 true 門邊一盞燈。
  function door(g, x, z, o) { o = o || {}; g.add(mk(box(0.9, 1.74, 0.05), M.white, x, 0.86, z - 0.02, false), mk(rbox(0.74, 1.58, 0.08, 0.04), M.dark, x, 0.79, z + 0.02), mk(new THREE.SphereGeometry(0.04, 6, 5), M.yellow, x + 0.27, 0.8, z + 0.08, false), mk(box(1.1, 0.12, 0.6), M.road, x, 0.06, z + 0.3, false));
    if (o.awning) { const a = mk(box(1.3, 0.05, 0.75), o.awning, x, 1.46, z + 0.32); a.rotation.x = 0.28; g.add(a); for (const sg of [-1, 1]) rod(g, [x + sg * 0.55, 1.1, z], [x + sg * 0.55, 1.36, z + 0.62], 0.02); }
    if (o.light) g.add(mk(box(0.08, 0.08, 0.22), M.dark, x + 0.62, 1.36, z + 0.1, false), mk(new THREE.SphereGeometry(0.09, 7, 6), M.light, x + 0.62, 1.28, z + 0.22, false)); }
  // 招牌：奶油色的板、一條顏色的字帶、一條深色的小字。
  function sign(g, x, y, z, w, stripeM) { g.add(mk(box(w, 0.4, 0.08), M.white, x, y, z + 0.04), mk(box(w + 0.06, 0.05, 0.1), M.dark, x, y + 0.2, z + 0.04, false), mk(box(w - 0.3, 0.14, 0.02), stripeM, x, y + 0.05, z + 0.09, false), mk(box(w - 0.5, 0.05, 0.02), M.dark, x, y - 0.11, z + 0.09, false)); }   // 白板加深色的上緣，不然跟牆同色看不到
  // 屋簷排水：前後各一條水槽（e 是屋簷離中心多遠）、一支落水管從屋簷接到牆角再下到地。
  function gutter(g, e, h, w, d) { for (const sg of [1, -1]) g.add(mk(box(e * 2 + 0.1, 0.07, 0.08), M.dark, 0, h + 0.02, sg * e, false)); const cx = w / 2 + 0.08, cz = d / 2 + 0.08; if (e - cz > 0.05) g.add(mk(box(0.06, 0.06, e - cz + 0.1), M.dark, cx, h + 0.02, (e + cz) / 2, false)); g.add(mk(new THREE.CylinderGeometry(0.03, 0.03, h, 5), M.dark, cx, h / 2, cz, false)); }
  function chimney(g, x, y, z) { g.add(mk(rbox(0.45, 0.9, 0.45, 0.05), M.wall, x, y, z), mk(box(0.6, 0.08, 0.6), M.dark, x, y + 0.52, z, false)); }
  // 欄杆：從 (x0, z0) 到 (x1, z1) 一排細柱加一條橫桿（屋頂、陽台、碼頭都用）。
  function rail(g, x0, z0, x1, z1, y, m) { const L = Math.hypot(x1 - x0, z1 - z0), n = Math.max(2, Math.round(L / 0.45)); for (let i = 0; i <= n; i++) g.add(mk(new THREE.CylinderGeometry(0.025, 0.025, 0.7, 5), m || M.dark, x0 + (x1 - x0) * i / n, y + 0.35, z0 + (z1 - z0) * i / n, false)); const r = mk(box(L + 0.05, 0.05, 0.05), m || M.dark, (x0 + x1) / 2, y + 0.7, (z0 + z1) / 2, false); r.rotation.y = -Math.atan2(z1 - z0, x1 - x0); g.add(r); }
  // 旗桿加一面三角旗（旗子朝 +x 飄）。
  function pennant(g, x, y, z, m, len) { const L = len || 1.2; g.add(mk(new THREE.CylinderGeometry(0.025, 0.03, L, 5), M.dark, x, y + L / 2, z, false), mk(flagGeo(0.6, 0.3, "right"), m, x + 0.03, y + L - 0.34, z, false)); }
  // 彩旗串：A 到 B 一條垂下來的線，線上一面一面倒三角的小旗，顏色輪流。
  function bunting(g, A, B, mats, sag) { const cv = new THREE.QuadraticBezierCurve3(new THREE.Vector3(A.x, A.y, A.z), new THREE.Vector3((A.x + B.x) / 2, (A.y + B.y) / 2 - (sag == null ? 0.5 : sag), (A.z + B.z) / 2), new THREE.Vector3(B.x, B.y, B.z));
    g.add(mk(new THREE.TubeGeometry(cv, 8, 0.015, 4, false), M.dark, 0, 0, 0, false)); const n = Math.max(3, Math.round(cv.getLength() / 0.42)), ry = Math.atan2(-(B.z - A.z), B.x - A.x);
    for (let i = 1; i < n; i++) { const p = cv.getPoint(i / n); const f = mk(flagGeo(0.26, 0.24, "down"), mats[i % mats.length], p.x, p.y, p.z, false); f.rotation.y = ry; g.add(f); } }
  // 一台停著的腳踏車（車頭朝本地 +x）。
  function bike(g, x, z, ry, m) { const b = new THREE.Group(); b.position.set(x, 0, z); b.rotation.y = ry; g.add(b); for (const dx of [-0.42, 0.42]) b.add(mk(new THREE.TorusGeometry(0.27, 0.035, 5, 12), M.dark, dx, 0.27, 0, false)); b.add(mk(box(0.84, 0.06, 0.05), m || M.orange, 0, 0.42, 0, false), mk(box(0.05, 0.4, 0.05), m || M.orange, 0.12, 0.6, 0, false), mk(box(0.04, 0.04, 0.36), M.dark, 0.14, 0.82, 0, false), mk(box(0.22, 0.05, 0.12), M.dark, -0.16, 0.76, 0, false)); return b; }
  // 兩點之間一根細桿（營繩、支撐桿）。
  const rodUp = new THREE.Vector3(0, 1, 0), rodV = new THREE.Vector3();
  function rod(g, a, b, r, m) { rodV.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]); const L = rodV.length(); const o = mk(new THREE.CylinderGeometry(r, r, L, 4), m || M.dark, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, false); o.quaternion.setFromUnitVectors(rodUp, rodV.normalize()); g.add(o); return o; }
  const pot = (g, x, z, m, ry) => { const pl = planter(m); pl.scale.setScalar(0.6); pl.position.set(x, 0, z); if (ry) pl.rotation.y = ry; g.add(pl); };
  function building(kind, roofM) {
    const g = new THREE.Group();
    if (kind === "hall") { const h = house(4, 2.2, 2.8, M.wall2, roofM); g.add(h); win(h, 2, 1.38, 1.44, 1.9); door(h, 0, 1.4, { awning: roofM, light: true }); sign(h, 0, 1.92, 1.4, 1.5, roofM); gutter(h, 2.2, 2.2, 4, 2.8); chimney(h, 1.3, 2.65, -0.8); pennant(h, 0, 3.5, 0, roofM, 1.3); pot(h, 1.75, 1.95, M.wall); bike(h, -2.45, 0.9, 0.35, M.teal); }
    else if (kind === "tent") {
      for (const [x, m] of [[-1.3, roofM], [1.3, M.yellow]]) { const t = new THREE.Mesh(new THREE.ConeGeometry(1.5, 1.9, 4), m); t.position.set(x, 0.95, 0); t.rotation.y = Math.PI / 4; t.castShadow = true; g.add(t); pennant(g, x, 1.85, 0, m === roofM ? M.yellow : roofM, 0.6);
        const flap = mk(flagGeo(0.7, 1.0, "up"), M.dark, x, 0.02, 1.06, false); flap.rotation.x = -0.52; flap.rotation.y = 0; g.add(flap);   // 門簾：一片深色的三角貼在面向前面那一面上
        for (const [dx, dz] of [[-1.3, 0.9], [1.3, 0.9], [0, -1.6]]) { rod(g, [x, 1.85, 0], [x + dx * 1.2, 0.06, dz * 1.2], 0.012, M.sand); g.add(mk(box(0.08, 0.14, 0.08), M.dark, x + dx * 1.2, 0.05, dz * 1.2, false)); } }   // 三條營繩加地釘
      g.add(mk(new THREE.CylinderGeometry(0.03, 0.04, 1.2, 5), M.dark, 0, 0.6, 1.5, false), mk(box(0.9, 0.4, 0.05), M.cream, 0, 1.3, 1.5), mk(box(0.6, 0.1, 0.02), roofM, 0, 1.34, 1.54, false));   // 入口的牌子
      g.add(mk(new THREE.CylinderGeometry(0.03, 0.04, 1.6, 5), M.dark, 0, 0.8, -0.6, false), mk(box(0.22, 0.26, 0.22), M.light, 0, 1.72, -0.6, false));   // 燈籠桿
    }
    else if (kind === "booth") { const b = new THREE.Mesh(rbox(2.2, 2.0, 1.6, 0.14), M.wall); b.position.y = 1.0; b.castShadow = true; g.add(b); const roof = new THREE.Mesh(rbox(2.8, 0.2, 2.2, 0.06), roofM); roof.position.y = 2.1; roof.castShadow = true; g.add(roof); win(b, 2, 0.1, 0.84, 0.9);
      g.add(mk(box(2.0, 0.08, 0.42), M.wood, 0, 0.72, 0.98), mk(box(1.5, 0.4, 0.08), M.cream, 0, 2.5, 0.7), mk(box(1.1, 0.12, 0.02), roofM, 0, 2.54, 0.75, false), mk(box(0.9, 0.05, 0.02), M.dark, 0, 2.4, 0.75, false));   // 櫃台、屋頂上的招牌
      const awn = mk(box(2.4, 0.05, 0.7), roofM === M.yellow ? M.orange : M.yellow, 0, 1.72, 1.15); awn.rotation.x = 0.3; g.add(awn); rail(g, -1.3, 1.0, 1.3, 1.0, 2.24); pennant(g, 1.2, 2.24, -0.8, roofM, 0.9); pot(g, -1.5, 0.9, M.cream); }
    else if (kind === "desk") { const h = house(3.2, 2.0, 2.6, M.wall, roofM); g.add(h); win(h, 2, 1.22, 1.34, 1.5); door(h, 0, 1.3, { light: true }); sign(h, 0, 1.78, 1.3, 1.5, roofM); gutter(h, 1.76, 2.0, 3.2, 2.6); chimney(h, 1.0, 2.4, -0.6); for (let i = 0; i < 3; i++) { const bk = new THREE.Mesh(rbox(0.5, 0.8 - i * 0.1, 0.3, 0.04), [M.navy, M.teal, M.orange][i]); bk.position.set(-2.2 + i * 0.55, 0.4, 0.8); bk.castShadow = true; g.add(bk); } pot(g, 1.9, 1.5, M.wall2); }
    else if (kind === "home") { const h = house(3.4, 2.4, 3, M.wall2, roofM); g.add(h); win(h, 2, 1.42, 1.54, 1.5); door(h, 0, 1.5, { awning: roofM, light: true }); gutter(h, 1.87, 2.4, 3.4, 3); chimney(h, 1.1, 2.95, -0.6); pot(h, 1.5, 1.85, M.wall); pot(h, -1.5, 1.85, M.cream); bike(h, -2.25, 0.6, 0.2, M.orange); }
    else if (kind === "post") { const bx = new THREE.Mesh(rbox(0.9, 1.5, 0.9, 0.2), roofM); bx.position.y = 1.05; bx.castShadow = true; g.add(bx); const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.4, 8), M.dark); leg.position.y = 0.2; g.add(leg); const sign_ = new THREE.Mesh(rbox(1.6, 0.9, 0.1, 0.06), M.cream); sign_.position.set(1.6, 1.4, 0); sign_.castShadow = true; g.add(sign_); const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.0, 6), M.dark); sp.position.set(1.6, 0.5, 0); g.add(sp);
      g.add(mk(box(0.5, 0.06, 0.06), M.dark, 0, 1.3, 0.58, false), mk(box(1.1, 0.08, 1.1), M.dark, 0, 2.0, 0, false), mk(box(1.1, 0.14, 0.02), M.orange, 1.6, 1.58, 0.08, false), mk(box(0.9, 0.07, 0.02), M.dark, 1.6, 1.3, 0.08, false), mk(rbox(0.5, 0.35, 0.4, 0.04), M.cream, -0.9, 0.2, 0.4), mk(rbox(0.36, 0.3, 0.3, 0.03), M.sand, -0.85, 0.52, 0.42));   // 投信口、小屋頂、招牌的字、門口兩個包裹
      const l = lamp(); l.position.set(-1.2, 0, -0.6); g.add(l); }
    else if (kind === "pier") { const deck = new THREE.Mesh(rbox(3.6, 0.3, 1.8, 0.08), M.wood); deck.position.y = 0.2; deck.castShadow = true; g.add(deck); const booth = new THREE.Mesh(rbox(1.4, 1.6, 1.2, 0.12), M.wall); booth.position.set(-0.9, 1.1, 0); booth.castShadow = true; g.add(booth); const roof = new THREE.Mesh(rbox(1.8, 0.18, 1.6, 0.05), roofM); roof.position.set(-0.9, 2.0, 0); g.add(roof); const lamp_ = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), M.light); lamp_.position.set(1.3, 2.0, -0.5); g.add(lamp_); const lp = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 1.7, 6), M.dark); lp.position.set(1.3, 1.15, -0.5); g.add(lp);
      for (const sg of [-1, 1]) rail(g, -0.1, sg * 0.86, 1.75, sg * 0.86, 0.35, M.white); for (const sg of [-1, 1]) g.add(mk(new THREE.CylinderGeometry(0.08, 0.1, 0.4, 7), M.dark, 1.7, 0.5, sg * 0.6, false));   // 欄杆、兩支繫船柱
      g.add(mk(new THREE.TorusGeometry(0.2, 0.05, 6, 14), M.orange, -0.9, 1.25, 0.66, false), mk(box(1.2, 0.3, 0.06), M.cream, -0.9, 2.3, 0.5), mk(box(0.8, 0.1, 0.02), roofM, -0.9, 2.33, 0.54, false), mk(new THREE.TorusGeometry(0.16, 0.05, 5, 10), M.sand, 0.6, 0.4, -0.5, false).rotateX(Math.PI / 2), mk(box(0.6, 0.5, 0.05), M.dark, -0.9, 0.6, 0.63, false)); }   // 救生圈、招牌、一捲繩子、門
    else if (kind === "camp") {
      // 一圈石頭圍著營火，四張長凳，一頂帳篷。
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.18, 6, 12), M.dark); ring.rotation.x = Math.PI / 2; ring.position.y = 0.15; g.add(ring);
      const fire = new THREE.Mesh(new THREE.ConeGeometry(0.45, 1.0, 7), M.light); fire.position.y = 0.6; g.add(fire);
      for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + Math.PI / 4; const b = new THREE.Mesh(rbox(2.0, 0.3, 0.5, 0.08), M.wood); b.position.set(Math.cos(a) * 2.3, 0.45, Math.sin(a) * 2.3); b.rotation.y = -a + Math.PI / 2; b.castShadow = true; g.add(b); for (const dx of [-0.7, 0.7]) { const leg = new THREE.Mesh(rbox(0.2, 0.3, 0.4, 0.04), M.dark); leg.position.set(Math.cos(a) * 2.3 + Math.cos(a + Math.PI / 2) * dx, 0.15, Math.sin(a) * 2.3 + Math.sin(a + Math.PI / 2) * dx); g.add(leg); } }
      const tent = new THREE.Mesh(new THREE.ConeGeometry(1.4, 1.8, 4), M.teal); tent.position.set(-3.2, 0.9, -1.5); tent.rotation.y = Math.PI / 4; tent.castShadow = true; g.add(tent); pennant(g, -3.2, 1.75, -1.5, M.orange, 0.5);
      g.add(mk(new THREE.CylinderGeometry(0.03, 0.04, 1.7, 5), M.dark, 2.7, 0.85, 1.3, false), mk(box(0.22, 0.26, 0.22), M.light, 2.7, 1.8, 1.3, false));   // 燈籠桿
      for (const [x, y, z] of [[-2.5, 0.12, 1.7], [-2.5, 0.12, 1.95], [-2.5, 0.33, 1.82]]) g.add(mk(new THREE.CylinderGeometry(0.12, 0.12, 0.9, 6), M.trunk, x, y, z, false).rotateZ(Math.PI / 2));   // 一堆柴
    }
    else if (kind === "airport") {
      // 機場（Paul 2026-11-17 第二次：飛機不要穿過機場，要有滑行道）：跑道在前（local z = +2.6）、滑行道在後（z = -1.4）、
      // 機坪在最後面（z = -4.6），停兩架，塔台在左後角，機棚在右後角。一架會動的飛機：機坪滑出、上跑道、起飛、繞一圈、降落、滑回機坪（motion() 裡）。
      // 人走路會繞開跑道與滑行道（userData.blockers，頁面轉成那座島的座標）。
      const strip = (len, w, z, m) => { const r = new THREE.Mesh(rbox(len, 0.16, w, 0.05), m); r.position.set(0, 0.08, z); r.receiveShadow = true; g.add(r); return r; };
      strip(16, 2.8, 2.6, M.asphalt); strip(16, 1.6, -1.4, M.asphalt); strip(15, 2.6, -4.6, M.asphalt);
      for (const z of [0.6, -3.0]) { const link = new THREE.Mesh(rbox(1.6, 0.16, 2.4, 0.05), M.asphalt); link.position.set(-6.0, 0.08, z); g.add(link); const link2 = new THREE.Mesh(rbox(1.6, 0.16, 2.4, 0.05), M.asphalt); link2.position.set(6.0, 0.08, z); g.add(link2); }
      for (let x = -6.5; x <= 6.5; x += 1.3) { const dash = new THREE.Mesh(rbox(0.7, 0.03, 0.16, 0.01), M.white); dash.position.set(x, 0.17, 2.6); g.add(dash); }
      for (const x of [-7.3, 7.3]) for (let k = -3; k <= 3; k++) { if (k === 0) continue; const th = new THREE.Mesh(rbox(1.2, 0.03, 0.18, 0.01), M.white); th.position.set(x, 0.17, 2.6 + k * 0.32); g.add(th); }   /* 跑道頭的白線 */
      for (let x = -6.5; x <= 6.5; x += 1.3) { const dash = new THREE.Mesh(rbox(0.5, 0.03, 0.1, 0.01), M.yellow); dash.position.set(x, 0.17, -1.4); g.add(dash); }
      for (const x of [-7.3, 7.3]) for (const dz of [-1.2, 1.2]) { const l = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), M.light); l.position.set(x, 0.2, 2.6 + dz); g.add(l); }
      for (const x of [-4.5, 0, 4.5]) { const l = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), M.amber); l.position.set(x, 0.2, -0.45); g.add(l); }   /* 滑行道邊三顆黃燈（Paul 2026-11-17：「three yellow dots on the taxiway」）*/
      const tw = new THREE.Group(); tw.position.set(-6.6, 0, -6.2); g.add(tw);
      tw.add(new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 3.6, 10), M.wall).translateY(1.8), new THREE.Mesh(new THREE.CylinderGeometry(1.1, 0.8, 0.9, 10), roofM).translateY(4.0), new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, 0.5, 10), M.dark).translateY(4.6));
      // 會動的那一架包在一個 group 裡，機身轉成機鼻朝 +z，motion() 用 lookAt 讓它朝著下一個點（轉彎、爬升、下降都對）。
      const fly = new THREE.Group(); const body = makePlane(M.cream, M.teal); body.rotation.y = -Math.PI / 2; fly.add(body); body.getObjectByName("prop").userData.dynamic = true;   // 螺旋槳在 motion() 裡轉，標 dynamic 才不會被 mergeDynamic() 烤進機身
      // 2026-11-18 批 C：上面那句註解之前把下面這一行吞掉了（寫在同一行），飛機從第四批起就沒飛過。
      fly.position.set(-3.0, 0.75, -4.6); fly.userData.flight = { t: 0 }; fly.userData.dynamic = true; g.add(fly); planes.push(fly);
      const fv = new THREE.Vector3(); events.push({ id: "plane", dur: 14, when: t => t + ((22 - fly.userData.flight.t) % 72 + 72) % 72, pos: () => { fly.getWorldPosition(fv); return [fv.x, fv.y, fv.z]; } });   // 22 秒起飛滾行、26 到 32 爬升
      const p2 = makePlane(M.white, M.orange); p2.position.set(1.0, 0.75, -4.6); p2.rotation.y = 0.15; g.add(p2);
      const p3 = makePlane(M.cream, M.navy); p3.position.set(3.6, 0.75, -4.6); p3.rotation.y = -0.1; g.add(p3);
      const hg = new THREE.Group(); hg.position.set(6.4, 0, -7.0); g.add(hg);
      hg.add(new THREE.Mesh(rbox(3.4, 2.0, 3.0, 0.14), M.wall).translateY(1.0), new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.7, 3.4, 12, 1, false, 0, Math.PI), roofM).translateY(2.0).rotateZ(Math.PI / 2).rotateY(Math.PI / 2), new THREE.Mesh(rbox(2.2, 1.5, 0.1, 0.05), M.dark).translateY(0.75).translateZ(1.52));
      const cart = new THREE.Group(); cart.position.set(-1.0, 0, -6.4); g.add(cart);
      cart.add(new THREE.Mesh(rbox(1.0, 0.35, 0.6, 0.06), M.yellow).translateY(0.35), new THREE.Mesh(rbox(0.5, 0.4, 0.4, 0.05), M.navy).translateY(0.72).translateX(-0.15), new THREE.Mesh(rbox(0.5, 0.35, 0.4, 0.05), M.orange).translateY(0.7).translateX(0.3));
      // 人不走跑道、滑行道、機坪：一串圓把它們蓋起來（本地座標）。
      const bl = []; for (let x = -7; x <= 7; x += 2.4) { bl.push({ x, z: 2.6, r: 1.7 }); bl.push({ x, z: -1.4, r: 1.2 }); bl.push({ x, z: -4.6, r: 1.7 }); } bl.push({ x: -6.6, z: -6.2, r: 1.2 }, { x: 6.4, z: -7.0, r: 2.2 });
      g.userData.blockers = bl;
      g.traverse(m => { if (m.isMesh) m.castShadow = true; });
    }
    else if (kind === "school") {
      // 學校：一棟兩層的長樓、兩排窗、門口一面鐘、一支旗。操場在 decorate() 裡。第四批：窗框、門的雨棚、招牌、屋簷排水、屋頂欄杆、屋頂的旗、門口的腳踏車架與花箱。
      const b = new THREE.Mesh(rbox(6.4, 3.2, 2.6, 0.14), M.wall); b.position.y = 1.6; b.castShadow = true; b.receiveShadow = true; g.add(b);
      const roof = new THREE.Mesh(rbox(6.9, 0.25, 3.1, 0.06), roofM); roof.position.y = 3.3; roof.castShadow = true; g.add(roof);
      win(g, 5, 2.4, 1.34, 1.15); win(g, 4, 1.0, 1.34, 1.5);   // 樓下四扇（之前五扇，正中間那一扇被門擋住）
      door(g, 0, 1.3, { awning: roofM, light: true }); sign(g, 0, 1.82, 1.34, 1.8, roofM);
      const clock = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.1, 16), M.cream); clock.rotation.x = Math.PI / 2; clock.position.set(0, 3.0, 1.36); g.add(clock); g.add(mk(box(0.04, 0.28, 0.02), M.dark, 0, 3.08, 1.42, false), mk(box(0.2, 0.04, 0.02), M.dark, 0.08, 3.0, 1.42, false));
      for (const sg of [1, -1]) g.add(mk(box(7.0, 0.07, 0.08), M.dark, 0, 3.2, sg * 1.58, false)); for (const x of [-3.3, 3.3]) g.add(mk(new THREE.CylinderGeometry(0.03, 0.03, 3.2, 5), M.dark, x, 1.6, 1.4, false));
      rail(g, -3.3, 1.45, 3.3, 1.45, 3.45); pennant(g, -3.0, 3.45, -1.1, roofM, 2.0);
      for (let k = 0; k < 3; k++) bike(g, 3.6, 0.7 + k * 0.55, Math.PI / 2, [M.orange, M.teal, M.navy][k]); pot(g, -1.4, 1.85, M.cream); pot(g, 1.4, 1.85, M.cream);
    }
    else if (kind === "studio") {
      // 攝影棚加貼文牆：三塊海報板（Instagram 的貼文，點了看清單）、一支腳架相機、一圈環形燈。板子前面那一片記進 boards，paintBoards() 貼真的圖。
      const wall = new THREE.Mesh(rbox(5.2, 2.6, 0.3, 0.08), M.wall2); wall.position.y = 1.3; wall.castShadow = true; g.add(wall);
      const cap = new THREE.Mesh(rbox(5.6, 0.2, 0.7, 0.05), roofM); cap.position.y = 2.7; g.add(cap);
      [[M.orange, M.teal], [M.teal, M.yellow], [M.navy, M.orange]].forEach(([a, b2], i) => {
        const x = (i - 1) * 1.65; const board = new THREE.Mesh(rbox(1.4, 1.6, 0.08, 0.04), M.white); board.position.set(x, 1.45, 0.2); g.add(board);
        const pic = new THREE.Mesh(rbox(1.2, 1.0, 0.04, 0.03), a); pic.position.set(x, 1.65, 0.26); g.add(pic);
        const photo = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.0), new THREE.MeshBasicMaterial({ color: P.white })); photo.position.set(x, 1.65, 0.29); photo.visible = false; photo.userData.dynamic = true; g.add(photo); boards.push(photo);
        const bar = new THREE.Mesh(rbox(0.9, 0.12, 0.04, 0.02), b2); bar.position.set(x - 0.1, 0.95, 0.26); g.add(bar);
        const heart = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), M.orange); heart.position.set(x + 0.45, 0.95, 0.27); g.add(heart);
      });
      const tri = new THREE.Group(); tri.position.set(-2.2, 0, 1.9); g.add(tri);
      for (const a of [0, 2.1, 4.2]) { const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.5, 6), M.dark); leg.position.set(Math.cos(a) * 0.35, 0.72, Math.sin(a) * 0.35); leg.rotation.z = Math.cos(a) * 0.25; leg.rotation.x = -Math.sin(a) * 0.25; tri.add(leg); }
      tri.add(new THREE.Mesh(rbox(0.6, 0.4, 0.4, 0.08), M.dark).translateY(1.65), new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 0.3, 10), M.navy).translateY(1.65).translateZ(-0.33).rotateX(Math.PI / 2));
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.07, 8, 24), M.light); ring.position.set(2.3, 1.7, 1.6); g.add(ring);
      const rp = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 1.7, 6), M.dark); rp.position.set(2.3, 0.85, 1.6); g.add(rp);
      // 第四批：牆頂的招牌、「錄影中」的燈、牆前一塊鋪面、兩端的旗桿、兩個花箱。
      sign(g, 0, 3.05, 0.12, 2.2, M.orange); g.add(mk(box(0.3, 0.2, 0.1), M.dark, 2.2, 2.95, 0.28, false), mk(new THREE.SphereGeometry(0.08, 7, 6), M.amber, 2.2, 2.95, 0.36, false));
      g.add(mk(box(5.6, 0.08, 1.4), M.road, 0, 0.04, 0.85, false)); pennant(g, -2.9, 0, -0.1, M.teal, 3.2); pennant(g, 2.9, 0, -0.1, M.orange, 3.2); pot(g, -2.5, 1.2, M.cream); pot(g, 2.5, 1.2, M.wall);
    }
    else if (kind === "stage") {
      // 校園講座：一座涼亭式的小舞台，六根柱子、一個圓錐屋頂、台前三排小椅子。
      const base = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.3, 0.4, 12), M.wood); base.position.y = 0.2; base.castShadow = true; g.add(base);
      for (let k = 0; k < 6; k++) { const a = k * TAU / 6; const c = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 2.2, 8), M.cream); c.position.set(Math.cos(a) * 1.7, 1.5, Math.sin(a) * 1.7); g.add(c); }
      const roof = new THREE.Mesh(new THREE.ConeGeometry(2.6, 1.3, 6), roofM); roof.position.y = 3.2; roof.castShadow = true; g.add(roof);
      const mic = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.1, 6), M.dark); mic.position.set(0, 0.95, 1.2); g.add(mic); const mh = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), M.navy); mh.position.set(0, 1.5, 1.2); g.add(mh);
      for (let r = 0; r < 3; r++) for (let c = -1; c <= 1; c++) { const ch = new THREE.Mesh(rbox(0.5, 0.35, 0.5, 0.06), [M.teal, M.yellow, M.orange][(r + c + 3) % 3]); ch.position.set(c * 0.8, 0.18, 3.0 + r * 0.85); g.add(ch); }
      // 第四批：六根柱子之間一圈彩旗、屋頂尖一面旗、台前一級台階、兩邊各一個喇叭。
      for (let k = 0; k < 6; k++) { const a0 = k * TAU / 6, a1 = (k + 1) * TAU / 6; bunting(g, { x: Math.cos(a0) * 1.7, y: 2.45, z: Math.sin(a0) * 1.7 }, { x: Math.cos(a1) * 1.7, y: 2.45, z: Math.sin(a1) * 1.7 }, [M.orange, M.teal, M.yellow, M.white], 0.25); }
      pennant(g, 0, 3.8, 0, roofM, 0.9); g.add(mk(box(1.4, 0.2, 0.5), M.wood, 0, 0.1, 2.35, false)); for (const sg of [-1, 1]) g.add(mk(box(0.4, 0.6, 0.35), M.dark, sg * 2.0, 0.3, 1.3), mk(new THREE.CylinderGeometry(0.1, 0.1, 0.03, 10), M.navy, sg * 2.0, 0.35, 1.49, false).rotateX(Math.PI / 2));
    }
    else { /* tower */ const base = new THREE.Mesh(rbox(2.6, 3.4, 2.6, 0.2), M.wall); base.position.y = 1.7; base.castShadow = true; g.add(base); const cap = new THREE.Mesh(new THREE.ConeGeometry(2.0, 1.4, 4), roofM); cap.position.y = 4.1; cap.rotation.y = Math.PI / 4; cap.castShadow = true; g.add(cap);
      // 第四批：窗改到牆上（之前上面兩扇的高度在屋頂裡）、門加台階、二樓一個陽台加欄杆、屋簷排水、塔尖一面旗。
      win(g, 2, 2.65, 1.34, 1.3); win(g, 2, 1.25, 1.34, 1.5); door(g, 0, 1.3, { light: true }); const clock = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.1, 16), M.cream); clock.rotation.x = Math.PI / 2; clock.position.set(0, 3.3, 1.36); g.add(clock); g.add(mk(box(0.04, 0.3, 0.02), M.dark, 0, 3.38, 1.42, false), mk(box(0.22, 0.04, 0.02), M.dark, 0.09, 3.3, 1.42, false));
      g.add(mk(box(1.9, 0.1, 0.7), M.wood, 0, 2.2, 1.6)); rail(g, -0.95, 1.92, 0.95, 1.92, 2.25); rail(g, -0.95, 1.3, -0.95, 1.92, 2.25); rail(g, 0.95, 1.3, 0.95, 1.92, 2.25); for (const sg of [-1, 1]) g.add(mk(box(0.06, 0.06, 0.5), M.dark, sg * 0.8, 1.95, 1.55, false).rotateX(-0.6));
      gutter(g, 1.42, 3.4, 2.6, 2.6); pennant(g, 0, 4.78, 0, roofM, 1.2); pot(g, -1.0, 1.75, M.wall2); }
    return g;
  }

  // 一架小飛機（機身、機翼、尾翼、三個輪子）。機鼻朝 +x。
  function makePlane(bodyM, wingM) {
    const pl = new THREE.Group();
    pl.add(new THREE.Mesh(rbox(3.0, 0.75, 0.85, 0.32), bodyM), new THREE.Mesh(rbox(0.9, 0.1, 4.0, 0.05), wingM).translateY(0.15), new THREE.Mesh(rbox(0.6, 0.75, 0.1, 0.05), M.orange).translateX(-1.3).translateY(0.6), new THREE.Mesh(rbox(0.5, 0.08, 1.5, 0.04), M.orange).translateX(-1.3).translateY(0.25), new THREE.Mesh(rbox(0.7, 0.28, 0.87, 0.1), M.dark).translateX(0.8).translateY(0.12));
    const prop = new THREE.Mesh(rbox(0.08, 1.1, 0.12, 0.03), M.dark); prop.position.set(1.55, 0, 0); prop.name = "prop"; pl.add(prop);
    for (const [x, z] of [[0.9, -0.35], [0.9, 0.35], [-0.6, 0]]) { const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.12, 8), M.dark); wh.rotation.x = Math.PI / 2; wh.position.set(x, -0.5, z); pl.add(wh); }
    pl.traverse(m => { if (m.isMesh) m.castShadow = true; });
    return pl;
  }

  // ═══ 小東西（每座島都用得到）═══
  function bench(m) { const b = new THREE.Group(); b.add(new THREE.Mesh(rbox(1.6, 0.14, 0.5, 0.05), m || M.wood).translateY(0.45), new THREE.Mesh(rbox(1.6, 0.5, 0.1, 0.04), m || M.wood).translateY(0.72).translateZ(-0.22)); for (const dx of [-0.6, 0.6]) b.add(new THREE.Mesh(rbox(0.14, 0.42, 0.42, 0.03), M.dark).translateY(0.21).translateX(dx)); return b; }
  function lamp() { const l = new THREE.Group(); l.add(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 2.2, 6), M.dark).translateY(1.1), new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), M.light).translateY(2.3)); return l; }
  function flowerbed(seed) { const f = new THREE.Group(); const rr = mulberry(seed); const bed = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.2, 0.25, 12), M.trunk); bed.position.y = 0.12; f.add(bed); for (let i = 0; i < 9; i++) { const a = rr() * TAU, d = rr() * 0.8; const fl = new THREE.Mesh(new THREE.SphereGeometry(0.13 + rr() * 0.08, 7, 5), [M.orange, M.yellow, M.white, M.teal][i % 4]); fl.position.set(Math.cos(a) * d, 0.38, Math.sin(a) * d); f.add(fl); } return f; }
  function table(topM) { const t = new THREE.Group(); t.add(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.7, 8), M.dark).translateY(0.35), new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 0.08, 16), topM || M.wall2).translateY(0.74), new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.06, 8), M.orange).translateY(0.81)); return t; }
  function parasol(m) { const u = new THREE.Group(); u.add(new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 2.4, 6), M.dark).translateY(1.2), new THREE.Mesh(new THREE.ConeGeometry(1.5, 0.7, 8), m || M.orange).translateY(2.5)); return u; }
  function picnic(m) { const t = new THREE.Group(); t.add(new THREE.Mesh(rbox(2.2, 0.12, 0.9, 0.03), m || M.wood).translateY(0.75)); for (const dz of [-0.75, 0.75]) t.add(new THREE.Mesh(rbox(2.2, 0.1, 0.35, 0.03), m || M.wood).translateY(0.45).translateZ(dz)); for (const dx of [-0.8, 0.8]) t.add(new THREE.Mesh(rbox(0.12, 0.72, 1.6, 0.03), M.dark).translateY(0.36).translateX(dx)); return t; }
  function kiosk(roofM) { const k = new THREE.Group(); k.add(new THREE.Mesh(rbox(1.8, 1.1, 1.0, 0.08), M.wall).translateY(0.55), new THREE.Mesh(rbox(2.2, 0.16, 1.5, 0.05), roofM || M.orange).translateY(2.1)); for (const dx of [-0.9, 0.9]) k.add(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.0, 6), M.dark).translateY(1.6).translateX(dx).translateZ(0.5)); for (let i = 0; i < 3; i++) k.add(new THREE.Mesh(new THREE.SphereGeometry(0.16, 7, 5), [M.orange, M.yellow, M.teal][i]).translateY(1.25).translateX(-0.5 + i * 0.5)); return k; }
  function planter(m) { const pl = new THREE.Group(); pl.add(new THREE.Mesh(rbox(1.4, 0.5, 0.6, 0.06), m || M.wall).translateY(0.25)); for (let i = 0; i < 4; i++) pl.add(new THREE.Mesh(new THREE.SphereGeometry(0.17, 7, 5), [M.orange, M.yellow, M.teal, M.white][i]).translateY(0.6).translateX(-0.45 + i * 0.3)); return pl; }
  // 一塊牌子（白板加兩支腳，板面朝 +z）。頁面在板面貼字或照片：回 { group, face }，face 是板面那一片（PlaneGeometry w×h）。
  function signboard(w, h, frameM) {
    const g = new THREE.Group(); const back = new THREE.Mesh(rbox(w + 0.2, h + 0.2, 0.1, 0.04), frameM || M.white); back.position.y = 1.0 + h / 2; back.castShadow = true; g.add(back);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: P.white })); face.position.set(0, 1.0 + h / 2, 0.07); g.add(face);
    for (const dx of [-w / 2 + 0.2, w / 2 - 0.2]) g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 1.0, 6), M.dark).translateY(0.5).translateX(dx));
    return { group: g, face };
  }

  // 每座島都有的：從每個橋頭鋪一條路到島心（roadEnds 是本地座標的 [x, z]）、三張圓桌各四張凳子（人會去坐）、野餐桌、三張長凳、一個小攤子、燈、花箱、一段圍欄、一圈矮樹。
  // 桌椅與長凳的位置記進 pois（人會走過去坐著、面向桌子），全部的東西記進 blockers（人走路會繞開）。
  function furnish(isl, g, blockers, fa, pois, roadEnds) {
    const rr = mulberry(isl.x * 7 + isl.z * 13 + 5);
    const free = (x, z, dmin) => Math.hypot(x, z) < isl.r - 1.6 && !blockers.some(b => Math.hypot(x - b.x, z - b.z) < (b.r || 1.2) + (dmin || 1.4));
    const spot = (dmin, tries) => { for (let i = 0; i < (tries || 40); i++) { const a = rr() * TAU, d = isl.r * (0.25 + rr() * 0.55); const x = Math.cos(a) * d, z = Math.sin(a) * d; if (free(x, z, dmin)) return { x, z, a }; } return null; };
    const put = (obj, pos, ry, r) => { obj.position.set(pos.x, 0, pos.z); if (ry != null) obj.rotation.y = ry; g.add(obj); blockers.push({ x: pos.x, z: pos.z, r: r || 1.2 }); obj.traverse(m => { if (m.isMesh) m.castShadow = true; }); return obj; };
    // 路：橋頭到島心
    for (const end of roadEnds || []) { const len = Math.hypot(end[0], end[1]) - 1.5; if (len <= 0) continue; const road = new THREE.Mesh(rbox(len, 0.06, 1.5, 0.02), M.road); road.position.set(end[0] / 2, 0.03, end[1] / 2); road.rotation.y = -Math.atan2(end[1], end[0]); road.receiveShadow = true; g.add(road); noPlant.push({ x0: isl.x, z0: isl.z, x1: isl.x + end[0], z1: isl.z + end[1], w: 1.5 }); }
    // 三張圓桌、各四張凳子，一張有陽傘
    for (let k = 0; k < 3; k++) { const sp = spot(2.6); if (!sp) break; put(table(k ? M.wall : M.wall2), sp, null, 1.0); if (k === 0) { const u = parasol([M.orange, M.teal, M.yellow][Math.floor(rr() * 3)]); u.position.set(sp.x, 0, sp.z); g.add(u); }
      for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + sp.a; const x = sp.x + Math.cos(a) * 1.35, z = sp.z + Math.sin(a) * 1.35; stoolPlaces.push([isl.x + x, isl.z + z]); pois.push({ x, z, face: Math.atan2(sp.x - x, sp.z - z), kind: "seat" }); } }
    // 一張野餐桌（兩邊各坐兩個人）
    { const sp = spot(2.4); if (sp) { const ry = rr() * TAU; put(picnic(), sp, ry, 0.8); for (const side of [-1, 1]) for (const along of [-0.6, 0.6]) { const x = sp.x + Math.cos(ry) * along + Math.sin(ry) * side * 1.0, z = sp.z - Math.sin(ry) * along + Math.cos(ry) * side * 1.0; pois.push({ x, z, face: Math.atan2(sp.x - x, sp.z - z), kind: "seat" }); } } }
    // 長凳三張（坐的人面向長凳的正面）
    for (let k = 0; k < 3; k++) { const sp = spot(2.6); if (!sp) break; const ry = Math.atan2(-sp.x, -sp.z); put(bench(k === 1 ? M.teal : k === 2 ? M.orange : undefined), sp, ry, 1.0); pois.push({ x: sp.x + Math.sin(ry) * 0.35, z: sp.z + Math.cos(ry) * 0.35, face: ry, kind: "bench" }); }
    // 一個小攤子
    { const sp = spot(2.4); if (sp) { const a = Math.atan2(-sp.x, -sp.z); put(kiosk(rr() < 0.5 ? M.orange : M.teal), sp, a, 1.4); pois.push({ x: sp.x + Math.sin(a) * 1.9, z: sp.z + Math.cos(a) * 1.9, face: a + Math.PI, kind: "stand" }); } }
    for (let k = 0; k < 3; k++) { const sp = spot(1.2); if (sp) put(lamp(), sp, null, 0.4); }
    for (let k = 0; k < 3; k++) { const sp = spot(1.6); if (sp) put(planter(k ? M.cream : M.wall), sp, rr() * TAU, 0.9); }
    // 圍欄：隨便挑一段島緣
    { const a0 = rr() * TAU, n = 5; const rad = isl.r - 1.1; for (let i = 0; i <= n; i++) { const a = a0 + i * 0.16; postPlaces.push([isl.x + Math.cos(a) * rad, 0.45, isl.z + Math.sin(a) * rad]); if (i < n) { const a1 = a + 0.16; const x0 = Math.cos(a) * rad, z0 = Math.sin(a) * rad, x1 = Math.cos(a1) * rad, z1 = Math.sin(a1) * rad; const rail = new THREE.Mesh(rbox(Math.hypot(x1 - x0, z1 - z0), 0.06, 0.08, 0.02), M.wood); rail.position.set((x0 + x1) / 2, 0.7, (z0 + z1) / 2); rail.rotation.y = -Math.atan2(z1 - z0, x1 - x0); g.add(rail); } } }
    // 矮樹：島緣一圈
    for (let i = 0; i < 16; i++) { const a = rr() * TAU, d = isl.r - 1.6 - rr() * 1.8; const x = Math.cos(a) * d, z = Math.sin(a) * d; if (blockers.some(b => Math.hypot(x - b.x, z - b.z) < (b.r || 1.2) + 0.9)) continue; bushPlaces.push([isl.x + x, isl.z + z, 0.6 + rr() * 0.5]); blockers.push({ x, z, r: 0.7 }); }
  }
  // 樹：位置先記下來（世界座標），flushInstances() 一次畫完。幾棵、不放在哪（blockers 本地座標）由頁面給。
  function plantTrees(isl, blockers, n) {
    for (let i = 0; i < n; i++) { const a = rnd() * TAU, d = isl.r * (0.5 + rnd() * 0.4); const x = Math.cos(a) * d, z = Math.sin(a) * d; if (blockers.some(bk => Math.hypot(x - bk.x, z - bk.z) < (bk.r || 1.2) + 1.2)) continue;
      treePlaces.push([isl.x + x, isl.z + z, 0.95 + rnd() * 0.7, i % 3]); blockers.push({ x, z, r: 1.0 }); }
  }

  // ═══ 每座島自己的那一套（scenery 的代號）═══
  // 做的事（programs）蓋在島朝向中心那一半；這裡的東西放在另一半（朝外，fa 是朝外的方向）。
  // 全部都是小東西，只加幾個 mesh；每一樣的位置記進 blockers，人走路會繞開。
  function decorate(scenery, isl, g, blockers, fa, pois) {
    const at = (da, dist) => ({ x: Math.cos(fa + da) * dist, z: Math.sin(fa + da) * dist });   // 以島朝外的方向為 0
    const put = (obj, pos, ry, r) => { obj.position.set(pos.x, 0, pos.z); if (ry != null) obj.rotation.y = ry; g.add(obj); blockers.push({ x: pos.x, z: pos.z, r: r || 1.4 }); obj.traverse(m => { if (m.isMesh) m.castShadow = true; }); return obj; };
    const sit = (pos, ry) => pois.push({ x: pos.x + Math.sin(ry) * 0.35, z: pos.z + Math.cos(ry) * 0.35, face: ry, kind: "bench" });
    const putBench = (m, pos, ry) => { put(bench(m), pos, ry, 1.0); sit(pos, ry); };
    // 本地座標換成世界座標再減掉島心（溜滑梯與鞦韆的點用）。島的 group 還沒進畫面，先把矩陣算出來。
    const world_ = (obj, x, y, z) => { g.updateMatrixWorld(true); obj.updateMatrixWorld(true); const v = obj.localToWorld(new THREE.Vector3(x, y, z)); return { x: v.x - isl.x, y: v.y, z: v.z - isl.z }; };
    if (scenery === "playground") {
      // 遊樂場：中間一塊圓形鋪面、溜滑梯、鞦韆、翹翹板、沙坑。大家都會走過來的地方。
      const plaza = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.4, 0.08, 32), M.road); plaza.position.set(0, 0.04, 0); plaza.receiveShadow = true; g.add(plaza);
      const slide = new THREE.Group(); slide.add(new THREE.Mesh(rbox(1.2, 0.2, 1.2, 0.05), M.wood).translateY(2.0), new THREE.Mesh(rbox(0.9, 0.12, 3.2, 0.05), M.yellow).translateY(1.15).translateZ(1.9).rotateX(0.55));
      for (const [x, z] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]]) slide.add(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.0, 6), M.teal).translateY(1.0).translateX(x).translateZ(z));
      for (let k = 0; k < 5; k++) slide.add(new THREE.Mesh(rbox(0.9, 0.06, 0.08, 0.02), M.dark).translateY(0.35 + k * 0.38).translateZ(-0.6));
      const slideRy = -(fa + 0.35) + Math.PI; put(slide, at(0.35, 5.2), slideRy, 1.6);
      // 溜滑梯怎麼玩（motion() 裡）：走到梯子腳（foot）、爬到頂（top）、滑到底（end）。三個點是相對島心的座標。
      { const foot = world_(slide, 0, 0, -1.6); pois.push({ kind: "slide", face: slideRy, x: foot.x, z: foot.z, foot, top: world_(slide, 0, 2.1, 0), end: world_(slide, 0, 0.3, 3.8) }); }
      const swing = new THREE.Group(); const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 3.2, 8), M.teal); bar.rotation.z = Math.PI / 2; bar.position.y = 2.3; swing.add(bar);
      for (const sx of [-1.5, 1.5]) for (const sz of [-0.5, 0.5]) { const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 2.5, 6), M.teal); leg.position.set(sx, 1.15, sz); leg.rotation.x = sz > 0 ? -0.2 : 0.2; swing.add(leg); }
      // 鞦韆的座位掛在一個 pivot 上，pivot 繞橫桿轉就是在盪（motion() 裡轉）。坐上去的人跟著 pivot 走。
      const swingRy = -(fa - 0.5); const pivots = [];
      for (const sx of [-0.7, 0.7]) { const pv = new THREE.Group(); pv.userData.dynamic = true; pv.position.set(sx, 2.3, 0); swing.add(pv); pivots.push(pv);
        for (const rz of [-0.25, 0.25]) { const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.6, 4), M.dark); rope.position.set(rz, -0.8, 0); pv.add(rope); }
        pv.add(new THREE.Mesh(rbox(0.6, 0.08, 0.3, 0.02), M.orange).translateY(-1.6)); }
      put(swing, at(-0.5, 5.4), swingRy, 1.9);
      pivots.forEach((pv, i) => { const stand = world_(pv, 0, -2.3, -1.2); pois.push({ kind: "swing", pivot: pv, face: swingRy, x: stand.x, z: stand.z, phase: i * 1.3 }); });
      const seesaw = new THREE.Group(); seesaw.add(new THREE.Mesh(rbox(0.5, 0.45, 0.6, 0.08), M.dark).translateY(0.22), new THREE.Mesh(rbox(3.0, 0.1, 0.4, 0.03), M.orange).translateY(0.5).rotateZ(0.14));
      for (const sx of [-1.3, 1.3]) seesaw.add(new THREE.Mesh(rbox(0.2, 0.35, 0.1, 0.02), M.navy).translateX(sx).translateY(0.72 - sx * 0.14));
      put(seesaw, at(1.2, 5.0), -(fa + 1.2), 1.6);
      const sand = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.6, 0.2, 14), M.beach); put(sand, at(-1.3, 5.2), null, 1.7); sand.position.y = 0.1;
      putBench(undefined, at(0.9, 3.9), -(fa + 0.9) + Math.PI / 2); putBench(undefined, at(-0.9, 3.9), -(fa - 0.9) + Math.PI / 2);
    } else if (scenery === "school") {
      // 學校：操場一圈跑道、籃球架、兩張長凳。島本身是方的。
      const track = new THREE.Mesh(new THREE.RingGeometry(3.4, 4.3, 48), M.road); track.rotation.x = -Math.PI / 2; track.position.y = 0.02; track.scale.set(1.25, 0.8, 1); const tp = at(0, 3.2); track.position.x = tp.x; track.position.z = tp.z; track.rotation.z = -fa; g.add(track);
      const hoop = new THREE.Group(); hoop.add(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 3.0, 6), M.dark).translateY(1.5), new THREE.Mesh(rbox(1.3, 0.9, 0.08, 0.04), M.white).translateY(2.9).translateZ(0.2), new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.03, 6, 16), M.orange).translateY(2.55).translateZ(0.5).rotateX(Math.PI / 2));
      put(hoop, at(0.9, 6.2), -(fa + 0.9) + Math.PI, 0.6); pois.push({ kind: "stand", face: -(fa + 0.9) + Math.PI, x: at(0.9, 3.8).x, z: at(0.9, 3.8).z });
      putBench(M.teal, at(-1.1, 6.0), -(fa - 1.1) + Math.PI / 2);
    } else if (scenery === "classroom") {
      // 露天教室：一面黑板、三排長凳面向黑板。
      const board = new THREE.Group(); board.add(new THREE.Mesh(rbox(3.0, 1.5, 0.12, 0.04), M.dark).translateY(1.55), new THREE.Mesh(rbox(3.2, 0.1, 0.2, 0.03), M.wood).translateY(0.85));
      for (const dx of [-1.3, 1.3]) board.add(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 2.2, 6), M.dark).translateY(1.1).translateX(dx));
      for (let i = 0; i < 3; i++) board.add(new THREE.Mesh(rbox(0.7 + i * 0.3, 0.05, 0.02, 0.01), M.white).translateY(1.9 - i * 0.3).translateX(-0.9 + i * 0.2).translateZ(0.07));
      const bp = at(0, 6.4); put(board, bp, -fa + Math.PI / 2, 1.6);
      for (let r = 0; r < 3; r++) for (const side of [-0.55, 0.55]) putBench(undefined, at(side * (0.14 + r * 0.03), 4.6 - r * 1.1), -fa + Math.PI / 2);
    } else if (scenery === "garden") {
      // 兩兩對坐的長凳、幾盞燈、花圃：mentor 跟學員在這裡聊。
      for (const [da, d] of [[0.9, 5.4], [-0.9, 5.4]]) { putBench(undefined, at(da, d), -(fa + da) + Math.PI / 2); putBench(undefined, at(da, d - 1.6), -(fa + da) - Math.PI / 2); put(lamp(), at(da + (da > 0 ? 0.25 : -0.25), d - 0.8)); }
      put(flowerbed(3), at(0, 6.2), null, 1.3); put(flowerbed(7), at(0, 3.4), null, 1.3); put(flowerbed(11), at(1.6, 4.2), null, 1.3); put(flowerbed(13), at(-1.6, 4.2), null, 1.3);
    } else if (scenery === "plaza") {
      // 廣場：鋪面、噴水池、兩盞燈、一塊看板。
      const plaza = new THREE.Mesh(rbox(7.0, 0.08, 5.0, 0.3), M.road); const pp = at(0, 4.6); plaza.position.set(pp.x, 0.04, pp.z); plaza.rotation.y = -fa + Math.PI / 2; plaza.receiveShadow = true; g.add(plaza);
      const fountain = new THREE.Group(); fountain.add(new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.6, 0.5, 16), M.wall).translateY(0.25), new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 0.1, 16), M.shallow).translateY(0.5), new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 1.2, 8), M.wall).translateY(1.0), new THREE.Mesh(new THREE.SphereGeometry(0.35, 10, 8), M.shallow).translateY(1.7));
      put(fountain, at(0, 4.6), null, 1.8);
      put(lamp(), at(0.55, 6.6), null, 0.4); put(lamp(), at(-0.55, 6.6), null, 0.4);
      const sign = new THREE.Group(); sign.add(new THREE.Mesh(rbox(2.6, 1.2, 0.1, 0.04), M.white).translateY(1.9), new THREE.Mesh(rbox(2.0, 0.25, 0.02, 0.01), M.orange).translateY(2.15).translateZ(0.06), new THREE.Mesh(rbox(1.4, 0.2, 0.02, 0.01), M.navy).translateY(1.75).translateZ(0.06));
      for (const dx of [-1.0, 1.0]) sign.add(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 1.4, 6), M.dark).translateY(0.7).translateX(dx));
      put(sign, at(1.1, 6.2), -(fa + 1.1) + Math.PI, 1.3);
    } else if (scenery === "studio") {
      // 幾面旗幟、一個大的「讚」看板。
      for (let i = 0; i < 4; i++) { const f = new THREE.Group(); f.add(new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 3.0, 6), M.dark).translateY(1.5), new THREE.Mesh(rbox(0.5, 1.3, 0.04, 0.02), [M.orange, M.teal, M.yellow, M.navy][i]).translateY(2.2).translateX(0.27)); put(f, at(-0.9 + i * 0.6, 6.0), null, 0.4); }
      const like = new THREE.Group(); like.add(new THREE.Mesh(rbox(1.8, 1.8, 0.2, 0.3), M.orange).translateY(1.9), new THREE.Mesh(new THREE.SphereGeometry(0.45, 10, 8), M.white).translateY(2.0).translateZ(0.2), new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 1.0, 6), M.dark).translateY(0.5));
      put(like, at(0, 3.6), -fa + Math.PI / 2, 1.1);
    } else if (scenery === "square") {
      // 小鎮廣場：一排燈籠、佈告欄、一張長椅、一座小郵筒。
      for (let i = 0; i < 5; i++) { const l = new THREE.Group(); l.add(new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 2.4, 6), M.dark).translateY(1.2), new THREE.Mesh(rbox(0.5, 0.6, 0.5, 0.18), [M.orange, M.yellow][i % 2]).translateY(2.0)); put(l, at(-1.0 + i * 0.5, 6.2), null, 0.4); }
      const bb = new THREE.Group(); bb.add(new THREE.Mesh(rbox(2.4, 1.4, 0.12, 0.04), M.wood).translateY(1.6), new THREE.Mesh(rbox(2.8, 0.2, 0.5, 0.04), M.dark).translateY(2.35));
      for (let i = 0; i < 5; i++) bb.add(new THREE.Mesh(rbox(0.5, 0.6, 0.02, 0.01), [M.white, M.cream, M.yellow, M.white, M.teal][i]).translateY(1.65 + (i % 2) * 0.25 - 0.1).translateX(-0.9 + i * 0.45).translateZ(0.07));
      for (const dx of [-1.0, 1.0]) bb.add(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 1.0, 6), M.dark).translateY(0.5).translateX(dx));
      put(bb, at(0, 3.8), -fa + Math.PI / 2, 1.4); pois.push({ kind: "stand", face: -fa + Math.PI / 2, x: at(0, 3.8).x + Math.sin(-fa + Math.PI / 2) * 1.5, z: at(0, 3.8).z + Math.cos(-fa + Math.PI / 2) * 1.5 });
      putBench(undefined, at(0.8, 4.8), -(fa + 0.8) + Math.PI / 2);
      const post = new THREE.Group(); post.add(new THREE.Mesh(rbox(0.5, 1.1, 0.5, 0.2), M.orange).translateY(0.85), new THREE.Mesh(rbox(0.3, 0.06, 0.06, 0.02), M.dark).translateY(1.1).translateZ(0.26)); put(post, at(-0.9, 4.8), null, 0.5);
    }
  }

  // ═══ 橋：五種輪流（Paul 2026-11-17：「make the bridges different material」「island and island can connect through water slide」）═══
  // 0 木板橋、1 石拱橋、2 紅漆拱橋、3 繩索橋、4 滑水道（兩頭各一座小塔，透明水藍的管子從塔頂下來、在水道中間沉到水面、再升到另一頭；人坐著溜過去）。
  // br 是 { a, b, x0, z0, x1, z1 }（兩端的 id 與世界座標）。滑水道記進 slides（"a>b" 與 "b>a"）。
  // 第四批：每座橋兩頭各一盞燈；木板橋一片一片深淺交錯的板子加兩邊的欄杆；石拱橋欄杆的橫桿跟著拱；紅拱橋欄杆上掛彩旗；滑水道底下會噴的水花。
  function bridge(br, style) {
    const dx = br.x1 - br.x0, dz = br.z1 - br.z0, len = Math.hypot(dx, dz); const ry = -Math.atan2(dz, dx);
    const grp = new THREE.Group(); grp.position.set((br.x0 + br.x1) / 2, 0, (br.z0 + br.z1) / 2); grp.rotation.y = ry; world.add(grp);
    const add = m => { m.castShadow = true; m.receiveShadow = true; grp.add(m); return m; };
    if (style !== 4) for (const sg of [-1, 1]) { const l = lamp(); l.position.set(sg * (len / 2 + 0.3), 0, sg * 1.3); grp.add(l); }   // 燈立在兩頭的岸上（批 D：之前在橋面外懸空）
    bridgeYs.set(br.a + ">" + br.b, BRIDGE_Y[style] || null); bridgeYs.set(br.b + ">" + br.a, BRIDGE_Y[style] || null);
    if (style === 4) {
      // 批 E：滑水道是單向的，所以一條水道兩管並排（各偏 1 公尺）：每管一頭是 3.6 公尺的塔、另一頭落在水面的小池子，a→b 溜 A 管、b→a 溜 B 管（之前一管兩頭都是塔，人往上溜）。
      const top = 3.6, nx = -dz / len, nz = dx / len, slM = new THREE.MeshStandardMaterial({ color: P.shallow, roughness: 0.3, transparent: true, opacity: 0.55, side: THREE.DoubleSide });
      const lane = (sx, sz, ex, ez, ox, oz) => {
        const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(sx + ox, top, sz + oz), new THREE.Vector3(sx + (ex - sx) * 0.3 + ox, 1.5, sz + (ez - sz) * 0.3 + oz), new THREE.Vector3(sx + (ex - sx) * 0.62 + ox, 0.3, sz + (ez - sz) * 0.62 + oz), new THREE.Vector3(ex + ox, 0.3, ez + oz)], false, "catmullrom", 0.5);
        world.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 40, 0.75, 10, false), slM), new THREE.Mesh(new THREE.TubeGeometry(curve, 40, 0.5, 8, false), M.shallow));
        const tw = new THREE.Group(); tw.position.set(sx + ox, 0, sz + oz); world.add(tw);
        for (const [cx, cz] of [[-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7], [0.7, 0.7]]) tw.add(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, top, 6), M.teal).translateY(top / 2).translateX(cx).translateZ(cz));
        tw.add(new THREE.Mesh(rbox(1.8, 0.16, 1.8, 0.05), M.wood).translateY(top), new THREE.Mesh(new THREE.ConeGeometry(1.3, 0.9, 4), M.orange).translateY(top + 0.6).rotateY(Math.PI / 4));
        for (let k = 0; k < 6; k++) tw.add(new THREE.Mesh(rbox(0.9, 0.05, 0.08, 0.02), M.dark).translateY(0.5 + k * 0.55).translateZ(-0.9));
        tw.traverse(m => { if (m.isMesh) m.castShadow = true; });
        const pool = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 0.3, 14), M.shallow); pool.position.set(ex + ox, 0.15, ez + oz); world.add(pool); const pb = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.3, 1.0, 14), M.cliff); pb.position.set(ex + ox, -0.5, ez + oz); world.add(pb);   /* 池子有座，水上也站得住 */
        tw.add(new THREE.Mesh(rbox(2.2, 1.2, 2.2, 0.1), M.cliff).translateY(-0.6));   /* 塔有腳座 */
        return { curve, dir: 1, splash: addSplash(sx + (ex - sx) * 0.62 + ox, sz + (ez - sz) * 0.62 + oz) };
      };
      slides.set(br.a + ">" + br.b, lane(br.x0, br.z0, br.x1, br.z1, nx * 1.3, nz * 1.3)); slides.set(br.b + ">" + br.a, lane(br.x1, br.z1, br.x0, br.z0, -nx * 1.3, -nz * 1.3));
      for (const [sx, sz, sg] of [[br.x0, br.z0, 1], [br.x1, br.z1, -1]]) { const l = lamp(); l.position.set(sx - sg * dx / len * 1.0 + nx * 2.6, 0, sz - sg * dz / len * 1.0 + nz * 2.6); world.add(l); }   /* 燈在岸上、兩管的外側 */
    }
    else if (style === 0) { add(new THREE.Mesh(rbox(len, 0.28, 2.2, 0.08), M.wood)).position.y = 0.1;
      // 欄杆的柱子：兩頭各一支、中間每 1.5 公尺一支（短的橋之前只有一對柱子、沒有橫桿）；橫桿從頭到尾。
      const x0 = -len / 2 + 0.8, x1 = len / 2 - 0.8, np = Math.max(1, Math.round((x1 - x0) / 1.5)); for (let i = 0; i <= np; i++) { const tt = (x0 + (x1 - x0) * i / np + len / 2) / len; for (const side of [-1, 1]) postPlaces.push([br.x0 + dx * tt + (-dz / len) * side * 1.0, 0.5, br.z0 + dz * tt + (dx / len) * side * 1.0]); }
      let k = 0; for (let x = -len / 2 + 0.9; x < len / 2 - 0.6; x += 0.6, k++) add(new THREE.Mesh(box(0.5, 0.04, 2.1), k % 2 ? M.trunk : M.wood)).position.set(x, 0.33, 0);   // 一片一片的板子，深淺交錯
      for (const side of [-1, 1]) { const r = add(new THREE.Mesh(box(x1 - x0 + 0.1, 0.05, 0.07), M.dark)); r.position.set(0, 0.93, side * 1.0); } }
    else if (style === 1) { const n = 7; for (let i = 0; i < n; i++) { const u = (i + 0.5) / n - 0.5; const seg = add(new THREE.Mesh(rbox(len / n + 0.05, 0.34, 2.4, 0.06), M.cliff)); seg.position.set(u * len, 0.1 + Math.cos(u * Math.PI) * 0.45, 0); }
      for (const side of [-1, 1]) { for (let i = 0; i <= 6; i++) { const u = i / 6 - 0.5; const bal = add(new THREE.Mesh(rbox(0.22, 0.7, 0.22, 0.05), M.wall)); bal.position.set(u * len, 0.6 + Math.cos(u * Math.PI) * 0.45, side * 1.1); }
        for (let i = 0; i < 6; i++) { const u0 = i / 6 - 0.5, u1 = (i + 1) / 6 - 0.5; const y0 = 1.0 + Math.cos(u0 * Math.PI) * 0.45, y1 = 1.0 + Math.cos(u1 * Math.PI) * 0.45; const L = Math.hypot((u1 - u0) * len, y1 - y0); const r = add(new THREE.Mesh(box(L + 0.05, 0.08, 0.26), M.wall)); r.position.set((u0 + u1) / 2 * len, (y0 + y1) / 2, side * 1.1); r.rotation.z = Math.atan2(y1 - y0, (u1 - u0) * len); } } }   // 欄杆的橫桿一段一段跟著拱
    else if (style === 2) { const n = 7; for (let i = 0; i < n; i++) { const u = (i + 0.5) / n - 0.5; const seg = add(new THREE.Mesh(rbox(len / n + 0.05, 0.22, 2.0, 0.05), M.orange)); seg.position.set(u * len, 0.1 + Math.cos(u * Math.PI) * 0.6, 0); }
      for (const side of [-1, 1]) { for (let i = 0; i <= 4; i++) { const u = i / 4 - 0.5; const pst = add(new THREE.Mesh(rbox(0.12, 1.0, 0.12, 0.03), M.orange)); pst.position.set(u * len, 0.7 + Math.cos(u * Math.PI) * 0.6, side * 0.95); } const rail = add(new THREE.Mesh(rbox(len, 0.08, 0.1, 0.03), M.orange)); rail.position.set(0, 1.25, side * 0.95);
        for (let i = 0; i < 4; i++) { const u0 = i / 4 - 0.5, u1 = (i + 1) / 4 - 0.5; bunting(grp, { x: u0 * len, y: 1.22, z: side * 0.95 }, { x: u1 * len, y: 1.22, z: side * 0.95 }, [M.teal, M.yellow, M.white, M.navy], 0.22); } } }   // 欄杆之間掛彩旗
    else { const n = 9; for (let i = 0; i < n; i++) { const u = (i + 0.5) / n - 0.5; const plank = add(new THREE.Mesh(rbox(len / n - 0.08, 0.1, 1.6, 0.03), M.trunk)); plank.position.set(u * len, 0.05 - Math.cos(u * Math.PI) * 0.35, 0); plank.rotation.z = Math.sin(u * Math.PI) * 0.12; }
      for (const side of [-1, 1]) { const rope = add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(new THREE.Vector3(-len / 2, 1.0, side * 0.8), new THREE.Vector3(0, 0.45, side * 0.8), new THREE.Vector3(len / 2, 1.0, side * 0.8)), 10, 0.04, 5, false), M.sand)); rope.castShadow = false; for (const e of [-1, 1]) { const pst = add(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 1.2, 6), M.trunk)); pst.position.set(e * len / 2, 0.5, side * 0.8); } } }
    return grp;
  }
  // 兩點之間一條拱起來的細管（橘色、發光、半透明），一開始藏著。頁面決定什麼時候亮。
  function arc(A, B) {
    const mid = new THREE.Vector3((A.x + B.x) / 2, 4 + Math.hypot(B.x - A.x, B.z - A.z) * 0.14, (A.z + B.z) / 2);
    const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(A.x, 1.2, A.z), mid, new THREE.Vector3(B.x, 1.2, B.z));
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.07, 6, false), new THREE.MeshStandardMaterial({ color: P.orange, emissive: P.orange, emissiveIntensity: 0.45, roughness: 0.6, transparent: true, opacity: 0.85 }));
    tube.visible = false; world.add(tube); return tube;
  }

  // ═══ 海上的裝飾小島：雲霄飛車、燈塔、野餐、棕櫚、礁石。不能點、人不會去。雲霄飛車的車與燈塔的光在 motion() 裡動。it 是 { kind, x, z, r }。═══
  function islet(it) {
    const g = new THREE.Group(); g.position.set(it.x, 0, it.z); world.add(g);
    const r = it.r;
    if (it.kind !== "rock") { const body = new THREE.Mesh(roundPrism(r, 2.2), M.cliff); body.position.y = -2.2; g.add(body); const top = new THREE.Mesh(roundPrism(r - 0.1, 0.3), it.kind === "picnic" ? groundMat("lawn") : it.kind === "lighthouse" ? M.cliff : M.grass); top.position.y = -1.0; top.receiveShadow = true; g.add(top);
      const foam = new THREE.Mesh(new THREE.RingGeometry(r + 0.4, r + 1.0, 36), new THREE.MeshBasicMaterial({ color: P.white, transparent: true, opacity: 0.4, depthWrite: false })); foam.rotation.x = -Math.PI / 2; foam.position.y = -0.55; foam.userData.dynamic = true; foam.userData.ph = rnd() * TAU; g.add(foam); foams.push(foam); }
    if (it.kind === "coaster") {
      // 雲霄飛車：一條閉合的軌道（CatmullRom 過幾個高高低低的點）、柱子撐著、一列小車沿軌道跑。
      const pts = [[-5, 1.2, 0], [-3.5, 4.5, -3.5], [0, 6.5, -2], [3.5, 2.0, -4], [5.5, 4.0, 0], [3.5, 1.5, 3.5], [0, 5.0, 3.0], [-3.5, 2.2, 3.5], [-5.5, 1.5, 1.5]].map(a => new THREE.Vector3(...a));
      const curve = new THREE.CatmullRomCurve3(pts, true, "catmullrom", 0.6);
      const rail = new THREE.Mesh(new THREE.TubeGeometry(curve, 120, 0.12, 6, true), M.orange); rail.castShadow = true; g.add(rail);
      const rail2 = new THREE.Mesh(new THREE.TubeGeometry(curve, 120, 0.06, 5, true), M.dark); rail2.position.y = -0.28; g.add(rail2);
      for (let k = 0; k < 18; k++) { const q = curve.getPointAt(k / 18); const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, Math.max(0.3, q.y - 0.1), 6), M.wall); post.position.set(q.x, (q.y - 0.1) / 2, q.z); g.add(post); }
      const cars = []; for (let c = 0; c < 3; c++) { const car = new THREE.Group(); car.userData.dynamic = true; const body = new THREE.Mesh(rbox(0.9, 0.5, 0.6, 0.12), [M.yellow, M.teal, M.orange][c]); body.castShadow = true; car.add(body); for (const dz of [-0.15, 0.15]) { const h = new THREE.Mesh(new THREE.SphereGeometry(0.2, 7, 5), M.skin[c % 3]); h.position.set(0.1, 0.42, dz); car.add(h); } g.add(car); mergeChildren(car); cars.push(car); }
      coasters.push({ curve, cars, t: rnd() });
      const booth = new THREE.Mesh(rbox(1.6, 1.3, 1.2, 0.1), M.wall); booth.position.set(0, 0.65, 6.0); g.add(booth); const br = new THREE.Mesh(rbox(2.0, 0.15, 1.6, 0.05), M.orange); br.position.set(0, 1.4, 6.0); g.add(br);
      // 月台（批 D）：軌道起點 (-5,1.2,0) 旁一塊板子、一條欄、兩個排隊的人；之前只有一個售票亭。
      const plat = new THREE.Mesh(rbox(3.2, 0.12, 1.0, 0.03), M.wood); plat.position.set(-4.6, 0.95, 1.1); g.add(plat); const prail = new THREE.Mesh(rbox(3.2, 0.04, 0.04, 0.01), M.dark); prail.position.set(-4.6, 1.75, 1.55); g.add(prail);
      for (const [px, sh] of [[-5.4, 1], [-3.9, 4]]) { const pp = makePerson({ shirt: sh, scale: 1.1 }); pp.position.set(px, 1.0, 1.3); pp.rotation.y = Math.PI; g.add(pp); }
      for (let k = 0; k < 6; k++) { const a = k / 6 * TAU; const f = new THREE.Mesh(rbox(0.3, 0.5, 0.03, 0.02), [M.orange, M.teal, M.yellow][k % 3]); f.position.set(Math.cos(a) * (r - 1.0), 2.4, Math.sin(a) * (r - 1.0)); g.add(f); const fp = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 2.6, 5), M.dark); fp.position.set(Math.cos(a) * (r - 1.0) - 0.15, 1.3, Math.sin(a) * (r - 1.0)); g.add(fp); }
    } else if (it.kind === "lighthouse") {
      const base = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.3, 5.5, 12), M.white); base.position.y = 2.75; base.castShadow = true; g.add(base);
      for (const y of [1.2, 3.0]) { const band = new THREE.Mesh(new THREE.CylinderGeometry(1.14, 1.2, 0.5, 12), M.orange); band.position.y = y; g.add(band); }
      const lamp_ = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 0.9, 12), M.light); lamp_.position.y = 5.95; g.add(lamp_);
      const cap = new THREE.Mesh(new THREE.ConeGeometry(1.0, 0.8, 12), M.navy); cap.position.y = 6.8; g.add(cap);
      const beam = new THREE.Mesh(new THREE.ConeGeometry(0.5, 6, 10, 1, true), new THREE.MeshBasicMaterial({ color: P.light, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide })); beam.rotation.z = Math.PI / 2; beam.position.set(3, 5.95, 0); const pivot = new THREE.Group(); pivot.userData.dynamic = true; pivot.position.y = 0; pivot.add(beam); g.add(pivot); beacons.push(pivot);
      const hut = new THREE.Mesh(rbox(1.8, 1.2, 1.4, 0.1), M.wall2); hut.position.set(2.2, 0.6, 1.2); hut.castShadow = true; g.add(hut); const hr = new THREE.Mesh(new THREE.ConeGeometry(1.4, 0.8, 4), M.orange); hr.rotation.y = Math.PI / 4; hr.position.set(2.2, 1.6, 1.2); g.add(hr);
    } else if (it.kind === "picnic") {
      const t2 = table(M.wall2); t2.position.set(0.5, 0, 0.5); g.add(t2); const u = parasol(M.teal); u.position.set(0.5, 0, 0.5); g.add(u);
      for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + 0.4; stoolPlaces.push([it.x + 0.5 + Math.cos(a) * 1.3, it.z + 0.5 + Math.sin(a) * 1.3]); }
      for (let k = 0; k < 5; k++) { const a = k / 5 * TAU + 0.7; treePlaces.push([it.x + Math.cos(a) * (r - 1.6), it.z + Math.sin(a) * (r - 1.6), 1.0 + (k % 2) * 0.4, k % 3]); }
    } else if (it.kind === "palm") {
      for (const [px, pz, lean] of [[-0.8, 0.3, 0.25], [1.0, -0.6, -0.2], [0.3, 1.4, 0.1]]) { const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, 4.0, 7), M.trunk); trunk.position.set(px, 2.0, pz); trunk.rotation.z = lean; trunk.castShadow = true; g.add(trunk);
        for (let k = 0; k < 6; k++) { const a = k / 6 * TAU; const leaf = new THREE.Mesh(rbox(2.2, 0.08, 0.5, 0.04), M.tree[0]); leaf.position.set(px + Math.cos(a) * 1.0 - lean * 2.0, 4.1, pz + Math.sin(a) * 1.0); leaf.rotation.y = -a; leaf.rotation.z = 0.35; g.add(leaf); } }
      const towel = new THREE.Mesh(rbox(1.4, 0.04, 0.8, 0.02), M.orange); towel.position.set(1.6, 0.02, 1.4); g.add(towel);
    } else {
      for (let k = 0; k < 5; k++) { const rk = new THREE.Mesh(new THREE.DodecahedronGeometry(0.6 + rnd() * 0.9, 0), M.cliff); rk.position.set((rnd() - 0.5) * 3, 0.1 + rnd() * 0.4, (rnd() - 0.5) * 3); rk.rotation.set(rnd(), rnd(), rnd()); rk.castShadow = true; g.add(rk); }
      const bird = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.6, 6), M.white); bird.position.set(0.4, 1.5, 0.2); bird.rotation.x = Math.PI / 2; g.add(bird);
    }
    return g;
  }
  // 一組水花（水圈加十顆水珠）放在 (x, z) 的水面上；把 sp.t0 設成現在的時間它就噴一次。滑水道底與海豚入水都用這個。
  function addSplash(x, z) {
    const splashM = new THREE.MeshBasicMaterial({ color: P.white, transparent: true, opacity: 0.45, depthWrite: false });
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.0, 1.9, 20), splashM); ring.rotation.x = -Math.PI / 2; ring.position.set(x, -0.5, z); ring.userData.dynamic = true; world.add(ring);
    const drops = new THREE.InstancedMesh(new THREE.SphereGeometry(0.11, 6, 5), M.white, 10); drops.userData.dynamic = true; drops.frustumCulled = false; drops.castShadow = false; const none = new THREE.Matrix4().makeScale(0, 0, 0); for (let k = 0; k < 10; k++) drops.setMatrixAt(k, none); drops.instanceMatrix.setUsage(THREE.DynamicDrawUsage); world.add(drops);
    const sp = { ring, mat: splashM, drops, x, z, t0: -9, on: false }; splashes.push(sp); return sp;
  }
  // 小船：水道裡幾艘，慢慢搖（motion() 裡動）。位置隨機（半徑 14 到 54），離 avoid 裡每一個圓（{ x, z, r, pad }）的邊 pad 公尺以上。
  function addBoats(n, avoid) {
    for (let i = 0; i < n; i++) {
      let x = 0, z = 0, ok = false;
      for (let t = 0; t < 60 && !ok; t++) { const a = rnd() * TAU, d = 14 + rnd() * 40; x = Math.cos(a) * d; z = Math.sin(a) * d; ok = (avoid || []).every(il => Math.hypot(x - il.x, z - il.z) > il.r + (il.pad == null ? 3 : il.pad)); }
      if (!ok) continue;
      const b = new THREE.Group(); b.position.set(x, -0.35, z); b.rotation.y = rnd() * TAU; b.userData.ry = b.rotation.y;
      b.add(new THREE.Mesh(rbox(2.4, 0.5, 1.0, 0.18), [M.white, M.cream, M.teal][i % 3]).translateY(0.1), new THREE.Mesh(rbox(0.9, 0.5, 0.7, 0.08), [M.orange, M.navy, M.yellow][i % 3]).translateY(0.55).translateX(-0.2), new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.6, 5), M.dark).translateY(1.2).translateX(0.5));
      b.traverse(m => { if (m.isMesh) m.castShadow = true; }); b.userData.phase = rnd() * 6; b.userData.dynamic = true; world.add(b); boats.push(b); mergeChildren(b);
    }
  }
  // 熱氣球（Paul 2026-11-17：「make it more cute」）：n 顆在上空慢慢繞（圓心 cx, cz），motion() 裡動。
  function addBalloons(n, cx, cz) {
    for (let i = 0; i < n; i++) {
      const g = new THREE.Group(); const env = new THREE.Mesh(new THREE.SphereGeometry(2.0, 16, 12), [M.orange, M.teal, M.yellow][i % 3]); env.scale.y = 1.15; env.position.y = 3.2; env.castShadow = true; g.add(env);
      for (let k = 0; k < 4; k++) { const stripe = new THREE.Mesh(new THREE.SphereGeometry(2.02, 16, 12, k * Math.PI / 2, 0.35), M.white); stripe.scale.y = 1.15; stripe.position.y = 3.2; g.add(stripe); }
      const basket = new THREE.Mesh(rbox(1.0, 0.7, 1.0, 0.12), M.wood); basket.position.y = 0.35; g.add(basket);
      for (const [ox, oz] of [[-0.4, -0.4], [0.4, -0.4], [-0.4, 0.4], [0.4, 0.4]]) { const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.3, 4), M.dark); rope.position.set(ox, 1.3, oz); g.add(rope); }
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), M.skin[i % 3]); head.position.y = 0.95; g.add(head);
      g.userData = { a: i * TAU / 3, r: 30 + i * 9, h: 20 + i * 3, sp: 0.045 - i * 0.008, cx: cx || 0, cz: cz || 0, dynamic: true }; world.add(g); balloons.push(g); mergeChildren(g);
      g.traverse(m => { if (m.isMesh) m.castShadow = false; }); const bs = new THREE.Mesh(new THREE.CircleGeometry(2.4, 18), new THREE.MeshBasicMaterial({ color: P.navy, transparent: true, opacity: 0.1, depthWrite: false })); bs.rotation.x = -Math.PI / 2; bs.position.y = -0.58; bs.userData.dynamic = true; world.add(bs); g.userData.shadow = bs;   /* 影子用一片淡圓（2026-11-19 Paul「the shadow for balloon looks bad」：陰影貼圖每 1/3 秒才重算，影子一跳一跳） */
    }
  }
  // 雲：n 團，圓心外 70 到 110 公尺、高 26 到 34，慢慢往 +x 飄。
  function addClouds(n, cx, cz) {
    for (let i = 0; i < n; i++) { const g = new THREE.Group(); const a = rnd() * TAU, d = 70 + rnd() * 40; g.position.set((cx || 0) + Math.cos(a) * d, 36 + rnd() * 8, (cz || 0) + Math.sin(a) * d); for (let k = 0; k < 4; k++) { const b = new THREE.Mesh(new THREE.SphereGeometry(1.4 + rnd() * 1.4, 10, 8), M.cloud); b.position.set(k * 1.8 - 2.7, rnd() * 0.5, rnd() * 0.8); g.add(b); } g.userData.drift = 0.25 + rnd() * 0.3; g.userData.cx = cx || 0; g.userData.dynamic = true; world.add(g); clouds.push(g); mergeChildren(g); }
  }
  // 樹、矮樹、小凳子、欄杆柱子：全部一次畫完（InstancedMesh）。頁面蓋完所有東西再叫一次。
  function flushInstances() {
    for (const list of [treePlaces, bushPlaces]) { const keep = list.filter(p => !onPath(p[0], p[1], 0.35)); list.length = 0; list.push(...keep); }   // 路上不長樹（批 E）
    { const m = new THREE.Matrix4(), s3 = new THREE.Vector3(), q = new THREE.Quaternion();
      const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.12, 0.16, 0.8, 6), M.trunk, Math.max(1, treePlaces.length));
      const crowns = [0, 1, 2].map(k => new THREE.InstancedMesh(new THREE.SphereGeometry(0.8, 12, 9), M.tree[k], Math.max(1, treePlaces.length)));
      const none = new THREE.Matrix4().makeScale(0.001, 0.001, 0.001);
      treePlaces.forEach(([x, z, sc_, k], i) => { s3.setScalar(sc_); m.compose(new THREE.Vector3(x, 0.4 * sc_, z), q, s3); trunks.setMatrixAt(i, m); crowns.forEach((c, kk) => { if (kk === k) { m.compose(new THREE.Vector3(x, 1.35 * sc_, z), q, s3); c.setMatrixAt(i, m); } else c.setMatrixAt(i, none); }); });
      trunks.count = treePlaces.length; trunks.instanceMatrix.needsUpdate = true; world.add(trunks); crowns.forEach(c => { c.count = treePlaces.length; c.instanceMatrix.needsUpdate = true; c.castShadow = true; world.add(c); }); }
    { const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s3 = new THREE.Vector3();
      const bush = new THREE.InstancedMesh(new THREE.SphereGeometry(0.5, 10, 8), M.tree[1], Math.max(1, bushPlaces.length)); bushPlaces.forEach(([x, z, sc_], i) => { s3.set(sc_ * 1.1, sc_ * 0.8, sc_ * 1.1); m.compose(new THREE.Vector3(x, 0.3 * sc_, z), q, s3); bush.setMatrixAt(i, m); }); bush.count = bushPlaces.length; bush.instanceMatrix.needsUpdate = true; bush.castShadow = true; world.add(bush);
      const stool = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.22, 0.2, 0.42, 10), M.wood, Math.max(1, stoolPlaces.length)); stoolPlaces.forEach(([x, z], i) => { m.makeTranslation(x, 0.21, z); stool.setMatrixAt(i, m); }); stool.count = stoolPlaces.length; stool.instanceMatrix.needsUpdate = true; stool.castShadow = true; world.add(stool); }
    { const im = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.07, 0.07, 0.9, 6), M.dark, Math.max(1, postPlaces.length)); const m = new THREE.Matrix4(); postPlaces.forEach((pp, i) => { m.makeTranslation(pp[0], pp[1], pp[2]); im.setMatrixAt(i, m); }); im.count = postPlaces.length; im.instanceMatrix.needsUpdate = true; world.add(im); }
  }

  // ═══ 靜態的東西合併（2026-11-18）═══
  // 同一種材質、同一個 60 公尺格子裡的靜態 Mesh 合成一個；24 個以下的小 InstancedMesh 也攤開合進去。
  // 不碰：會動的（userData.dynamic，含它底下的）、點得到的（userData.sel）、有貼圖的、人（peoplePool）。頁面蓋完所有東西、加完人之後叫一次。
  // 把一串 Mesh（含 InstancedMesh 的每一個 instance）烤成一個幾何：pre 是最後再乘上去的矩陣（合到世界用單位矩陣、合到某個 group 的本地用它的反矩陣）。
  // rbox 是 ExtrudeGeometry，沒有 index，這裡自己補（2026-11-18 第一版漏了這個，六百多個圓角盒子全部沒合到）。
  const bakeM = { nm: new THREE.Matrix3(), mw: new THREE.Matrix4(), im: new THREE.Matrix4(), v: new THREE.Vector3() };
  // colours 給 true：每個點多記一個顏色（那個 Mesh 的材質底色，已經合過色的就抄它自己的顏色），合出來的那一個用白底加 vertexColors 的材質，不同顏色的零件就能合成同一個。
  function bake(list, pre, colours) {
    const { nm, mw, im, v } = bakeM; const pos = [], nor = [], col = [], idx = []; let off = 0;
    for (const m of list) {
      const g = m.geometry, p = g.attributes.position, n = g.attributes.normal, reps = m.isInstancedMesh ? m.count : 1;
      const ca = g.attributes.color, mc = m.material.color;
      for (let k = 0; k < reps; k++) {
        if (colours) { for (let i = 0; i < p.count; i++) { if (ca) col.push(ca.getX(i) * mc.r, ca.getY(i) * mc.g, ca.getZ(i) * mc.b); else col.push(mc.r, mc.g, mc.b); } }
        if (m.isInstancedMesh) { m.getMatrixAt(k, im); mw.multiplyMatrices(m.matrixWorld, im); } else mw.copy(m.matrixWorld);
        if (pre) mw.premultiply(pre);
        nm.getNormalMatrix(mw);
        for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).applyMatrix4(mw); pos.push(v.x, v.y, v.z); v.fromBufferAttribute(n, i).applyMatrix3(nm).normalize(); nor.push(v.x, v.y, v.z); }
        if (g.index) { const ix = g.index.array; for (let i = 0; i < ix.length; i++) idx.push(ix[i] + off); } else for (let i = 0; i < p.count; i++) idx.push(i + off);
        off += p.count;
      }
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3)); if (colours) geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3)); geo.setIndex(idx);
    return geo;
  }
  const mergeable = m => m.isMesh && !m.userData.peoplePool && !(m.isInstancedMesh && (m.count > 24 || m.instanceColor)) && !Array.isArray(m.material) && !m.material.map && m.geometry.attributes.position && m.geometry.attributes.normal;
  const dynSet = root => { const dyn = new Set(); root.traverse(o => { if (o !== root && (o.userData.dynamic || (o.parent && dyn.has(o.parent)))) dyn.add(o); }); return dyn; };
  // ═══ 合色（2026-11-18 第四批）：只差底色的材質合成同一個 Mesh ═══
  // 島上大部分的材質都是 std() 出來的：只有顏色不一樣，粗糙度、金屬度都一樣。這種「平的」材質合併的時候不照材質分，照「粗糙度加金屬度」分，
  // 顏色寫在每個點上（vertexColors），合出來的那一個用白底的共用材質。畫面一模一樣（底色乘上點的顏色就是原來的顏色），draw call 少一大半。
  // 不算平的（各自照材質分，跟以前一樣）：會發光的、透明的、雙面的、有貼圖的、本來就有 vertexColors 的。頁面叫 E.setMerge({ colours: true }) 才開；/history/ 沒開，行為照舊。
  const mergeOpts = { colours: false, cell: 60 };
  const plainMats = new Map();
  const isPlain = mt => mt.isMeshStandardMaterial && !mt.map && !mt.normalMap && !mt.emissiveMap && !mt.transparent && mt.opacity === 1 && mt.side === THREE.FrontSide && !mt.flatShading && !mt.wireframe && mt.depthWrite && mt.depthTest && !mt.alphaTest && (mt.emissive.r + mt.emissive.g + mt.emissive.b === 0 || mt.emissiveIntensity === 0);
  const plainKey = mt => "plain|" + mt.roughness + "|" + mt.metalness;
  const plainMat = (key, mt) => plainMats.get(key) || plainMats.set(key, new THREE.MeshStandardMaterial({ color: P.white, vertexColors: true, roughness: mt.roughness, metalness: mt.metalness })).get(key);
  // 一個 Mesh 合併的時候照什麼分組：開了合色而且材質是平的就照粗糙度分，不然照材質。回 { key, mat, colours }。
  const mergeKeyOf = m => (mergeOpts.colours && isPlain(m.material)) ? { key: plainKey(m.material), colours: true } : { key: m.material.uuid, colours: false };
  const mergedMat = (list, colours) => colours ? plainMat(plainKey(list[0].material), list[0].material) : list[0].material;
  // 同一種材質、同一個 60 公尺格子裡的靜態 Mesh 合成一個；24 個以下的小 InstancedMesh 也攤開合進去。
  // 不碰：會動的（userData.dynamic，含它底下的）、點得到的（userData.sel）、有貼圖的、人。頁面蓋完所有東西、加完人之後叫一次。
  // 格子的大小是 mergeOpts.cell（預設 60 公尺；島那一頁開合色之後設大一點，整片合成一個也沒關係，全景本來就全部都在畫面裡）。
  function mergeStatic() {
    const groups = new Map(); world.updateMatrixWorld(true); const dyn = dynSet(world); const cell = mergeOpts.cell || 60;
    world.traverse(m => {
      if (!mergeable(m) || dyn.has(m) || m.userData.sel) return;
      const mk = mergeKeyOf(m);
      const key = mk.key + "|" + (m.castShadow ? 1 : 0) + (m.receiveShadow ? 1 : 0) + "|" + Math.floor(m.matrixWorld.elements[12] / cell) + "," + Math.floor(m.matrixWorld.elements[14] / cell);
      (groups.get(key) || groups.set(key, { colours: mk.colours, list: [] }).get(key)).list.push(m);
    });
    let merged = 0;
    for (const { colours, list } of groups.values()) {
      if (list.length < 2 && !list[0].isInstancedMesh) continue;
      const mesh = new THREE.Mesh(bake(list, null, colours), mergedMat(list, colours)); mesh.castShadow = list[0].castShadow; mesh.receiveShadow = list[0].receiveShadow; mesh.userData.merged = true; world.add(mesh);
      for (const m of list) { m.parent.remove(m); merged++; }
    }
    shadowsDirty = true; return merged;
  }
  // 一個 group 底下的零件合成幾個（同材質一個），留在它的本地座標：會動的 group（摩天輪、纜車廂、旋轉木馬、船）整個一起動，底下的零件不用一個一個畫。
  // sel 給了就把它寫到合成的那幾個上（房子要點得到）。底下再有 dynamic 的子樹不碰。回合成的那幾個 Mesh。
  function mergeChildren(root, sel) {
    root.updateMatrixWorld(true); const inv = new THREE.Matrix4().copy(root.matrixWorld).invert(); const dyn = dynSet(root); const groups = new Map();
    root.traverse(m => { if (m === root || !mergeable(m) || dyn.has(m)) return; const mk = mergeKeyOf(m); const key = mk.key + "|" + (m.castShadow ? 1 : 0); (groups.get(key) || groups.set(key, { colours: mk.colours, list: [] }).get(key)).list.push(m); });
    const out = [];
    for (const { colours, list } of groups.values()) {
      if (list.length < 2 && !list[0].isInstancedMesh) { if (sel) list[0].userData.sel = sel; out.push(list[0]); continue; }
      const mesh = new THREE.Mesh(bake(list, inv, colours), mergedMat(list, colours)); mesh.castShadow = list[0].castShadow; mesh.receiveShadow = true; mesh.userData.merged = true; if (sel) mesh.userData.sel = sel; root.add(mesh); out.push(mesh);
      for (const m of list) m.parent.remove(m);
    }
    return out;
  }
  // 會動的 group 全部再合一次（2026-11-18 第四批）：世界裡每一個標了 dynamic 的東西，底下的零件照 mergeChildren 合（底下再有 dynamic 的不碰、點得到的不碰）。
  // 頁面各支模組自己叫過 mergeChildren 的也會再合一次：開了合色之後，之前照材質分成四五個的會合成一兩個。
  // ⚠ 會動的零件一定要自己標 dynamic（翅膀、螺旋槳、旋轉木馬的馬），不然會被烤進它的 group 裡不動了。回合了幾個 group。
  function mergeDynamic() {
    const roots = []; world.traverse(o => { if (o !== world && o.userData.dynamic && !o.userData.sel) roots.push(o); });
    let n = 0; for (const r of roots) { let any = false; const dyn = dynSet(r); r.traverse(m => { if (m !== r && mergeable(m) && !dyn.has(m) && !m.userData.sel) any = true; }); if (!any) continue; mergeChildren(r); n++; }
    shadowsDirty = true; return n;
  }
  function setMerge(o) { Object.assign(mergeOpts, o || {}); return mergeOpts; }

  // ═══ 人：大頭 chibi（peopleKit，/history/ 的機場也用同一批人）═══
  const people = peopleKit({ P, rnd, parent: world }); const { makePerson, pose } = people;
  for (const pm of people.pools) pickables.push(pm);   // 點人：射線打到 pool，instanceId 對回那個人
  // 一個會走的人。person 是 { code, team, role, avatar? }；o 是 { isl（住哪座島，{ id, x, z, r }）, start（起點 { x, z }）, skin, hair, shirt, me }。
  // 牌子是一顆 button（class pin pin-person），大頭照一顆小的在名字前面，字放 span 裡。回 walker 那包（motion() 用的狀態都在上面）。
  const walkers = [];
  function addWalker(person, o) {
    o = o || {}; const isl = o.isl;
    const n = walkers.length;
    const g = makePerson({ skin: o.skin != null ? o.skin : n % 3, hair: o.hair != null ? o.hair : (n * 7) % 3, shirt: o.shirt != null ? o.shirt : (n * 5) % 6, pants: n % 3,
      hat: person.role === "copresident", pack: person.role === "director" || person.role === "student", bag: person.role === "advisor",
      brolly: o.brolly != null ? o.brolly : (n % 7 === 3 ? 1 + n % 3 : 0), box: o.box != null ? o.box : n % 11 === 6 });   // 第四批：每七個人一個撐陽傘、每十一個人一個抱箱子（「我」不給）
    const start = o.start || { x: isl.x, z: isl.z + 2 }; g.position.set(start.x, 0, start.z); g.rotation.y = rnd() * TAU; world.add(g);
    g.userData.sel = { kind: "person", code: person.code };
    const pin = document.createElement("button"); pin.type = "button"; pin.className = "pin pin-person" + (o.me ? " is-me" : ""); pin.dataset.goPerson = person.code; pin.hidden = true; pins.appendChild(pin);
    if (person.avatar) { const im = document.createElement("img"); im.src = person.avatar; im.alt = ""; im.width = 18; im.height = 18; pin.appendChild(im); }
    pin.appendChild(document.createElement("span"));
    const w = { person, g, pin, isl, home: isl, target: start, wait: rnd() * 4 + 1, me: !!o.me, label: "", trips: 0, path: null, pathI: 0, dest: "", poi: null, partner: null, act: null }; walkers.push(w); shadowsDirty = true; return w;
  }
  function removeWalker(w) { world.remove(w.g); people.free(w.g); w.pin.remove(); const i = walkers.indexOf(w); if (i >= 0) walkers.splice(i, 1); shadowsDirty = true; }

  // ═══ 鏡頭：拖曳轉、滾輪縮，每一幀阻尼追目標 ═══
  const cam = { pos: new THREE.Vector3(), tgt: new THREE.Vector3(), goalPos: new THREE.Vector3(), goalTgt: new THREE.Vector3() };
  // 卡在左、清單在右：要看的東西要落在中間空出來的那一塊，不是視窗正中央。freeCentre() 回空出來那一塊的中心佔視窗寬的比例（0.5 就是正中央）。
  // c 是 { pos: [x,y,z], target: [x,y,z], fit?: [橫的半徑, 直的半徑] }；有 fit 就照畫面空出來那一塊的長寬把距離算出來，pos 只給方向。
  const setGoal = (c, centre) => {
    const far = cam.goalPos.distanceTo(new THREE.Vector3(...c.pos));
    if (far > 25) { cam.lift = Math.min(14, far * 0.12); cam.liftT = 0; }   // 飛得遠就先抬高再落下（批 B：之前是直線滑過去）
    idle.at = performance.now();
    cam.goalPos.set(...c.pos); cam.goalTgt.set(...c.target);
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
  function placeCam() { camera.position.copy(cam.pos); if (cam.lift) camera.position.y += cam.lift * Math.sin(Math.min(1, cam.liftT / 1.2) * Math.PI); camera.lookAt(cam.tgt); }
  // 拖曳：繞著目標點轉（改 goalPos 的方位角與仰角），滾輪：改距離。
  let drag = null, dragged = false, motionOn = false;
  function orbitBy(dyaw, dpitch, dzoom) {
    const off = cam.goalPos.clone().sub(cam.goalTgt); const r = off.length(); let yaw = Math.atan2(off.x, off.z), pitch = Math.asin(off.y / r);
    const nr = Math.min(Math.max(130, r), Math.max(14, r * (dzoom || 1)));   // 全景比 130 遠時，往內滾不會先跳一下
    // 靠得越近仰角的下限越高（14 公尺時 0.6、54 公尺起 0.35），鏡頭才不會鑽進帳篷與屋頂裡（批 B）。
    const pmin = 0.35 + 0.25 * (1 - Math.min(1, Math.max(0, (nr - 14) / 40)));
    yaw += dyaw; pitch = Math.min(1.45, Math.max(pmin, pitch + dpitch));
    cam.goalPos.set(cam.goalTgt.x + Math.sin(yaw) * Math.cos(pitch) * nr, cam.goalTgt.y + Math.sin(pitch) * nr, cam.goalTgt.z + Math.cos(yaw) * Math.cos(pitch) * nr);
  }
  // 手感（2026-11-18 批 B）：放手帶一點慣性（fling，每秒衰減到 2%）；8 秒沒碰就慢慢自轉（一碰就停）。
  const fling = { yaw: 0, pitch: 0, x: 0, z: 0 }, idle = { at: performance.now() }; let lastMove = 0;
  const touched = () => { idle.at = performance.now(); fling.yaw = fling.pitch = fling.x = fling.z = 0; };
  // 2026-11-20 Paul「when I zoom in … it only goes to the commons and it's hard to shift around」：
  // 拖曳改成抓著地圖移動（像地圖 app），右鍵拖或 Shift 拖才是轉視角；滾輪與兩指往游標（手指中間）那一點縮放，不再只往正中間。
  canvas.addEventListener("pointerdown", e => { drag = { x: e.clientX, y: e.clientY, id: e.pointerId, pan: !(e.button === 2 || e.shiftKey) }; dragged = false; canvas.setPointerCapture(e.pointerId); touched(); if (E.onInput) E.onInput(); });
  canvas.addEventListener("contextmenu", e => e.preventDefault());
  // 平移（2026-11-19 起）：一指或左鍵拖、兩指拖、方向鍵。目標點夾在 85 公尺內（島上最遠的東西約 75 公尺，再遠只看得到海；超出就停在邊上）。
  // 一個像素在地上是幾公尺：看目標點那個深度的視窗高度；往前後拖再除以仰角的 sin，手指下面那塊地跟著手走。
  function moveTgt(mv) { const nt = cam.goalTgt.clone().add(mv); nt.y = cam.goalTgt.y; const L = Math.hypot(nt.x, nt.z); if (L > 85) { nt.x *= 85 / L; nt.z *= 85 / L; } mv.subVectors(nt, cam.goalTgt); cam.goalTgt.add(mv); cam.goalPos.add(mv); return mv; }
  function panBy(dx, dy) { const off = cam.goalTgt.clone().sub(cam.goalPos); const d = off.length(); const sp = Math.max(0.35, -off.y / d); off.y = 0; off.normalize(); const right = new THREE.Vector3(-off.z, 0, off.x); const px = 2 * Math.tan(camera.fov * Math.PI / 360) * d / Math.max(1, canvas.clientHeight); return moveTgt(right.multiplyScalar(-dx * px).addScaledVector(off, dy * px / sp)); }
  const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), gp = new THREE.Vector3();
  function zoomAt(x, y, k) {
    const r = cam.goalPos.distanceTo(cam.goalTgt), f = Math.min(Math.max(130, r), Math.max(14, r * k)) / r;
    const rc = canvas.getBoundingClientRect(); ndc.set(((x - rc.left) / rc.width) * 2 - 1, -((y - rc.top) / rc.height) * 2 + 1); ray.setFromCamera(ndc, camera); ground.constant = -cam.goalTgt.y;
    if (f !== 1 && ray.ray.intersectPlane(ground, gp)) moveTgt(gp.sub(cam.goalTgt).multiplyScalar(1 - f));
    orbitBy(0, 0, k);
  }
  addEventListener("keydown", e => { if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return; const c = { q: "ccw", Q: "ccw", e: "cw", E: "cw", "+": "in", "=": "in", "-": "out" }[e.key]; if (c && !e.metaKey && !e.ctrlKey) { e.preventDefault(); camStep(c); return; } const k = { ArrowLeft: [-40, 0], ArrowRight: [40, 0], ArrowUp: [0, 40], ArrowDown: [0, -40] }[e.key]; if (!k) return; e.preventDefault(); touched(); panBy(k[0], k[1]); if (!motionOn) snapCam(); });
  canvas.addEventListener("pointermove", e => {
    if (drag && e.pointerId === drag.id) { const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (Math.abs(dx) + Math.abs(dy) > 3) dragged = true; if (dragged) { const now = performance.now(), dtm = Math.max(8, now - lastMove) / 1000; lastMove = now; if (E.onDrag) E.onDrag(dx, dy); else if (drag.pan) { const mv = panBy(dx, dy), cap = cam.goalPos.distanceTo(cam.goalTgt) * 0.8, v = Math.hypot(mv.x, mv.z) / dtm, k = v > cap ? cap / v : 1; fling.x = mv.x / dtm * k; fling.z = mv.z / dtm * k; } else { orbitBy(-dx * 0.005, dy * 0.004); fling.yaw = -dx * 0.005 / dtm; fling.pitch = dy * 0.004 / dtm; } drag.x = e.clientX; drag.y = e.clientY; if (!motionOn) snapCam(); } return; }
    const h = hit(e); setHover(h ? h.sel : null);
  });
  canvas.addEventListener("pointerup", e => { if (!drag) return; canvas.releasePointerCapture(e.pointerId); const was = dragged; drag = null; if (performance.now() - lastMove > 80) fling.yaw = fling.pitch = fling.x = fling.z = 0; if (was) return; const h = hit(e); if (h && onSelect) onSelect(h.sel); else if (!h && onSelect) onSelect(null); });
  canvas.addEventListener("pointercancel", () => { drag = null; });
  // 名牌蓋在畫布上面，滾輪停在名牌上也要縮放（不然島中間名牌一多就滾不動）。
  // 觸控板（2026-11-20 Paul「still hard to move around … I can't turn things around」）：兩指滑動是移動、捏合是縮放，跟地圖 app 一樣。
  // 分辨方法：捏合在 Chrome 是帶 ctrlKey 的滾輪、數字有小數；兩指滑動幾乎都帶一點左右的 deltaX。看過一次就記住是觸控板。滑鼠滾輪照舊是縮放。
  let pad = false;
  const onWheel = e => { e.preventDefault(); touched(); if ((e.deltaX && !e.shiftKey) || (e.ctrlKey && e.deltaY % 1)) pad = true;
    if (E.onWheel) E.onWheel(e.deltaY); else if (pad && !e.ctrlKey) panBy(-e.deltaX, -e.deltaY); else zoomAt(e.clientX, e.clientY, Math.exp(Math.max(-0.3, Math.min(0.3, e.deltaY * (e.ctrlKey ? 0.01 : 0.0012))))); if (!motionOn) snapCam(); };
  canvas.addEventListener("wheel", onWheel, { passive: false }); if (pins) pins.addEventListener("wheel", onWheel, { passive: false });
  // Mac 的 Safari：觸控板兩指轉動與捏合走 gesture 事件。iPhone、iPad 也會發，但那邊下面的兩指觸控已經處理，跳過免得轉兩次。
  if (!navigator.maxTouchPoints) { let gs = null; const gOpt = { passive: false };
    canvas.addEventListener("gesturestart", e => { e.preventDefault(); gs = { s: 1, r: 0 }; }, gOpt);
    canvas.addEventListener("gesturechange", e => { e.preventDefault(); if (!gs) return; touched(); zoomAt(e.clientX, e.clientY, gs.s / e.scale); orbitBy((e.rotation - gs.r) * Math.PI / 180, 0); gs = { s: e.scale, r: e.rotation }; if (!motionOn) snapCam(); }, gOpt);
    canvas.addEventListener("gestureend", e => { e.preventDefault(); gs = null; }, gOpt); }
  // 轉向與縮放按鈕：頁面上有 data-cam="ccw|cw|in|out" 的按鈕就接起來（右鍵拖在觸控板上很難按，轉方向一定要有按鈕）。鍵盤 Q、E 轉，+、- 縮放。
  function camStep(k) { touched(); if (k === "in" || k === "out") orbitBy(0, 0, k === "in" ? 0.7 : 1 / 0.7); else orbitBy(k === "ccw" ? -Math.PI / 4 : Math.PI / 4, 0); if (!motionOn) snapCam(); }
  for (const b of document.querySelectorAll("[data-cam]")) b.addEventListener("click", () => camStep(b.dataset.cam));
  // 每一幀：慣性與閒置自轉（motion() 的 tick 叫）。
  function camIdle(dt, paused) {
    if (drag) return;
    if (Math.abs(fling.yaw) + Math.abs(fling.pitch) > 1e-3) { orbitBy(fling.yaw * dt, fling.pitch * dt); const k = Math.exp(-dt * 4); fling.yaw *= k; fling.pitch *= k; }
    if (Math.abs(fling.x) + Math.abs(fling.z) > 0.05) { moveTgt(new THREE.Vector3(fling.x * dt, 0, fling.z * dt)); const k = Math.exp(-dt * 5); fling.x *= k; fling.z *= k; }

  }
  // 兩指縮放（手機）
  let pinch = null;
  // 兩指：捏合往兩指中間縮放、一起滑是移動、轉動是轉視角。一指拖就是抓著地圖移動（上面的 pointer 事件）。
  const twoF = e => { const a = e.touches[0], b = e.touches[1]; return { d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), cx: (a.clientX + b.clientX) / 2, cy: (a.clientY + b.clientY) / 2, ang: Math.atan2(b.clientY - a.clientY, b.clientX - a.clientX) }; };
  canvas.addEventListener("touchstart", e => { if (e.touches.length === 2) { drag = null; pinch = twoF(e); } }, { passive: true });
  canvas.addEventListener("touchmove", e => { if (pinch && e.touches.length === 2) { const n = twoF(e); let da = n.ang - pinch.ang; if (da > Math.PI) da -= TAU; else if (da < -Math.PI) da += TAU; zoomAt(n.cx, n.cy, pinch.d / n.d); panBy(n.cx - pinch.cx, n.cy - pinch.cy); orbitBy(da, 0); pinch = n; if (!motionOn) snapCam(); } }, { passive: true });
  canvas.addEventListener("touchend", () => { pinch = null; }, { passive: true });

  // ═══ 射線、懸停、牌子 ═══
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  function hit(e) { const r = canvas.getBoundingClientRect(); ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); ray.setFromCamera(ndc, camera); const hs = ray.intersectObjects(pickables, false); if (!hs.length) return null; const h = hs[0]; if (h.object.userData.peoplePool) { const g = people.ownerOf(h.object, h.instanceId); return g && g.userData.sel ? { sel: g.userData.sel } : null; } return { sel: h.object.userData.sel }; }
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
  // 一顆牌子（DOM）。cls 是 class（pin 之外的），data 是 dataset。
  function pin(cls, data, hidden) { const el = document.createElement("button"); el.type = "button"; el.className = "pin " + cls; for (const k in (data || {})) el.dataset[k] = data[k]; if (hidden) el.hidden = true; pins.appendChild(el); return el; }
  function resize() { const w = stage.clientWidth || 300, h = stage.clientHeight || 200; SW = w; SH = h; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); for (const p of pins.children) p._v = -1; }
  // 影子平常不每幀算（陰影貼圖 2048 的 PCFSoft 一次不便宜），但會動的東西（纜車、渡輪、熱氣球、飛車）每三分之一秒要跟上，不然影子釘在原地（2026-11-18 批 A）。
  let lastShadow = -1;
  function render(t) { people.sync(); if (shadowsDirty || t - lastShadow > 0.33) { renderer.shadowMap.needsUpdate = true; shadowsDirty = false; lastShadow = t; } renderer.render(scene, camera); E.placePins(); }
  function snapCam() { cam.pos.copy(cam.goalPos); cam.tgt.copy(cam.goalTgt); placeCam(); render(0); }
  if ("ResizeObserver" in window) new ResizeObserver(() => { resize(); render(0); }).observe(stage);

  // 貼文牆：最上面幾張有圖的貼文貼到板子上。圖是 1:1 或 4:5，板子是 6:5：置中裁切。載不到就留顏色。
  function paintBoards(urls, list) {
    const bs = list || boards; const loader = new THREE.TextureLoader();
    (urls || []).slice(0, bs.length).forEach((u, i) => loader.load(u, tex => {
      tex.colorSpace = THREE.SRGBColorSpace; const img = tex.image, ar = img && img.width ? img.width / img.height : 1, want = bs[i].geometry.parameters ? (bs[i].geometry.parameters.width / bs[i].geometry.parameters.height) : 1.2;
      if (ar < want) { tex.repeat.set(1, ar / want); tex.offset.set(0, (1 - ar / want) / 2); } else { tex.repeat.set(want / ar, 1); tex.offset.set((1 - want / ar) / 2, 0); }
      bs[i].material.map = tex; bs[i].material.needsUpdate = true; bs[i].visible = true; if (!motionOn) render(0);
    }, undefined, () => {}));
  }
  // 一塊畫了字的板子（canvas 貼圖）：年份路標、牌子上的字。w×h 公尺，text 幾行，colour 是 P 裡的顏色。
  function textPlane(w, h, lines, opt) {
    const o = opt || {}; const c = document.createElement("canvas"); const px = 64; c.width = Math.round(w * px); c.height = Math.round(h * px); const x = c.getContext("2d"); const css = col => "#" + col.getHexString();
    x.fillStyle = css(o.bg || P.white); x.fillRect(0, 0, c.width, c.height);
    x.fillStyle = css(o.fg || P.navy); x.textAlign = "center"; x.textBaseline = "middle";
    const n = lines.length, size = o.size || Math.min(c.height / (n + 0.6), c.width / Math.max(...lines.map(s => s.length)) * 1.7);
    x.font = (o.weight || "700") + " " + Math.round(size) + "px " + (o.font || "system-ui, sans-serif");
    lines.forEach((s, i) => x.fillText(s, c.width / 2, c.height / 2 + (i - (n - 1) / 2) * size * 1.15));
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex }));
  }

  // 除錯用（?debug=1）：每個人現在在做什麼。
  const debugWalkers = () => walkers.map(w => ({ code: w.person.code, isl: w.isl && w.isl.id, home: w.home && w.home.id, trips: w.trips, stuck: +(w.stuck || 0).toFixed(1), goes: w.person.goes || "", x: +w.g.position.x.toFixed(1), z: +w.g.position.z.toFixed(1), moving: !!w.g.userData.moving, sitting: !!w.g.userData.sitting, talking: !!w.g.userData.talking, path: w.path ? w.path.length - w.pathI : 0, dest: w.dest || "", poi: w.poi ? w.poi.kind : "", partner: w.partner ? w.partner.person.code : "", act: w.act ? w.act.kind + ":" + (w.act.stage || "") : "", wait: +w.wait.toFixed(1), target: w.target ? [+w.target.x.toFixed(1), +w.target.z.toFixed(1)] : null }));

  const E = {
    THREE, canvas, renderer, scene, camera, world, sun, P, M, std, rnd, pickables, planes, boards, treePlaces, bushPlaces, stoolPlaces, postPlaces, coasters, beacons, boats, balloons, clouds, flags, foams, bounces, waveU, addSplash, slides, bridgeYs, noPlant, onPath, splashes, walkers,
    rbox, box, flagGeo, roundPrism, rectPrism, polyPrism, hexPrism, groundMat, landmass, platform, flagpole, building, makePlane, bench, lamp, flowerbed, table, parasol, picnic, kiosk, planter, signboard, textPlane, bunting, pennant, bike, rail,
    furnish, plantTrees, decorate, bridge, arc, islet, addBoats, addBalloons, addClouds, flushInstances, mergeStatic, mergeChildren, mergeDynamic, setMerge, mergeOpts,
    makePerson, pose, addWalker, removeWalker, people,
    cam, setGoal, placeCam, orbitBy, snapCam, camIdle, idleFor: () => performance.now() - idle.at, events, project, putPin, setHidden, pin, resize, render, hit, paintBoards, debugWalkers,
    get motionOn() { return motionOn; },
    dirty() { shadowsDirty = true; },
    bounce(o) { if (!bounces.some(b => b.o === o)) bounces.push({ o, t0: E.now || 0 }); },
    placePins() {},            // 頁面蓋掉：每一幀把牌子放到該放的地方（用 project / putPin / setHidden）
    onDrag: null, onWheel: null,   // 頁面蓋掉就換掉預設的「拖曳繞轉、滾輪縮放」（路要沿路走）
    // 每一幀的迴圈。nav 是頁面的導航：{ islandOf(id), wanderTarget(isl, blockers, rnd), detour(a, b, blockers), route(from, to), routePoints(ids), blockersOf: Map, poisOf: Map, commons?: id }。
    // tickExtra(dt, t) 是頁面自己每一幀要動的東西（有就叫）。
    motion(nav, tickExtra) { motionOn = true; return motion(E, nav, tickExtra); },
  };
  return E;
}

/* ── 這裡面才有動畫。外面不准有每一幀的迴圈。 ──
   鏡頭用阻尼追目標（1 - e^(-dt·k)）；人在島上做事、偶爾過橋；雲慢慢飄；雲霄飛車、燈塔、熱氣球、小船、飛機各自動。暫停就是不呼叫 tick。 */
function motion(E, nav, tickExtra) {
  const { cam, placeCam, render, walkers, clouds, flags, foams, bounces, planes, boats, coasters, beacons, balloons, slides, bridgeYs, splashes, pose, rnd } = E;
  const SM = new THREE.Matrix4(), NONE4 = new THREE.Matrix4().makeScale(0, 0, 0), CT = new THREE.Vector3(), CS = new THREE.Vector3(), CN = new THREE.Vector3(), CB = new THREE.Vector3(), CL = new THREE.Vector3(), CM = new THREE.Matrix4(), UPV = new THREE.Vector3(0, 1, 0);
  const { blockersOf, poisOf } = nav;
  // ── 人在島上做的事（Paul 2026-11-17：「make people doing what they do make sense… they are there for meaning」）──
  // 每個人輪流做這幾件：走去坐（桌子、長凳、野餐桌）、站在攤子或佈告欄前面、找一個也閒著的人聊天（面對面、手會比）、
  // 鞦韆盪一盪、溜滑梯爬上去滑下來；偶爾過橋去別座島。走路會繞開房子與桌椅（nav.detour 加每一幀往外推）。
  // 挑一個空著的位子；有得玩的（鞦韆、溜滑梯）六成先挑它。
  const freePoi = isl => { const all = (poisOf.get(isl.id) || []).filter(p => !p.taken); const play = all.filter(p => p.kind === "swing" || p.kind === "slide"); const list = play.length && rnd() < 0.6 ? play : all; return list.length ? list[Math.floor(rnd() * list.length)] : null; };
  const blockersFor = (islId, target) => (blockersOf.get(islId) || []).filter(b => !target || Math.hypot(target.x - b.x, target.z - b.z) > b.r + 0.4);   // 目標本身在圓裡的那一個不算（要坐的那張桌子）
  const V = new THREE.Vector3(), Q = new THREE.Quaternion(), S = new THREE.Vector3();
  function stopDoing(w) {
    if (w.poi) { w.poi.taken = false; if (w.poi.kind === "swing") w.poi.pivot.rotation.x = 0; w.poi = null; }
    if (w.partner) { const p = w.partner; p.partner = null; p.g.userData.talking = false; if (p.wait > 1.5) p.wait = 1 + rnd(); w.partner = null; }
    w.act = null; w.g.userData.sitting = false; w.g.userData.talking = false; w.g.position.y = 0;
  }
  // 設一條在同一座島上的路（會繞開東西）。
  function walkTo(w, target, islId) { const id = islId || w.isl.id; const pts = nav.detour({ x: w.g.position.x, z: w.g.position.z }, target, blockersFor(id, target)); w.path = pts.map(q => ({ x: q.x, z: q.z, isl: id })); w.pathI = 0; w.target = w.path[0]; }
  // 選下一件事：在這座島上。
  function pickHere(w) {
    const r = rnd();
    if (r < 0.6) { const poi = freePoi(w.isl); if (poi) { poi.taken = true; w.poi = poi; walkTo(w, { x: w.isl.x + poi.x, z: w.isl.z + poi.z }); return; } }
    if (r < 0.85) { const mate = walkers.find(o => o !== w && o.isl === w.isl && !o.g.userData.moving && !o.poi && !o.partner && !o.act && !o.path && Math.hypot(o.g.position.x - w.g.position.x, o.g.position.z - w.g.position.z) < 10); if (mate) { w.partner = mate; mate.partner = w; const ddx = w.g.position.x - mate.g.position.x, ddz = w.g.position.z - mate.g.position.z, dd = Math.hypot(ddx, ddz) || 1; const spot = { x: mate.g.position.x + ddx / dd * 1.3, z: mate.g.position.z + ddz / dd * 1.3 }; if (!(blockersOf.get(w.isl.id) || []).some(b => Math.hypot(spot.x - b.x, spot.z - b.z) < b.r + 0.3)) { walkTo(w, spot); mate.wait = Math.max(mate.wait, 6); return; } w.partner = null; mate.partner = null; } }
    walkTo(w, nav.wanderTarget(w.isl, blockersOf.get(w.isl.id), rnd)); w.wait = 4 + rnd() * 8;
  }
  // 過橋去另一座島：橋的點照 routePoints，島上的每一段各自繞開東西；到了那座島再選下一件事。
  function travel(w, to) {
    const ids = nav.route(w.isl.id, to); if (ids.length < 2) return false;
    const raw = nav.routePoints(ids).slice(1); const path = []; let from = { x: w.g.position.x, z: w.g.position.z };
    raw.forEach(([x, z], j) => { const k = Math.floor(j / 3), what = j % 3; const pt = { x, z };
      if (what === 1) { const key = ids[k] + ">" + ids[k + 1], sl = slides.get(key); path.push({ x, z, isl: ids[k + 1], slide: sl || null, by: bridgeYs.get(key) || null, len: Math.hypot(x - from.x, z - from.z) || 1 }); from = pt; return; }   // 橋的另一頭：橋上走直線；滑水道就溜過去
      if (what === 2 && j === raw.length - 1) return;                                  // 最後那座島的島心不用走到
      const onIsl = what === 0 ? ids[k] : ids[k + 1];
      for (const q of nav.detour(from, pt, blockersFor(onIsl, pt))) path.push({ x: q.x, z: q.z, isl: onIsl }); from = pt; });
    if (!path.length) return false;
    w.path = path; w.pathI = 0; w.target = path[0]; w.dest = to; return true;
  }
  // 轉身用追的（每秒追 8 成），不瞬轉（批 B）。
  const turnTo = (g, yaw, dt) => { const d = ((yaw - g.rotation.y + Math.PI) % TAU + TAU) % TAU - Math.PI; g.rotation.y += d * (1 - Math.exp(-dt * 8)); };
  function arrived(w) {
    const u = w.g.userData; u.moving = false;
    if (w.poi) {
      const poi = w.poi;
      if (poi.kind === "seat" || poi.kind === "bench") { u.sitting = true; w.g.position.y = 0.22; w.faceTo = poi.face; w.wait = 8 + rnd() * 10; }
      else if (poi.kind === "stand") { w.faceTo = poi.face; u.talking = true; w.wait = 5 + rnd() * 6; }
      else if (poi.kind === "swing") { w.act = { kind: "swing", t0: t, dur: 9 + rnd() * 7 }; w.g.rotation.y = poi.face; u.sitting = true; }
      else if (poi.kind === "slide") { w.act = { kind: "slide", stage: "climb", t0: t }; w.g.rotation.y = poi.face; }
      return;
    }
    if (w.partner) { const p = w.partner; const ddx = p.g.position.x - w.g.position.x, ddz = p.g.position.z - w.g.position.z; w.faceTo = Math.atan2(ddx, ddz); p.faceTo = Math.atan2(-ddx, -ddz); u.talking = true; p.g.userData.talking = true; w.wait = 6 + rnd() * 8; p.wait = w.wait; return; }
    if (w.wait <= 0) w.wait = 3 + rnd() * 6;
  }
  function doAct(w) {
    const a = w.act, poi = w.poi, isl = w.isl, el = t - a.t0;
    if (a.kind === "swing") {
      const amp = Math.min(1, el / 2.5) * (el > a.dur - 2.5 ? Math.max(0, (a.dur - el) / 2.5) : 1);
      poi.pivot.rotation.x = Math.sin(el * 2.0 + poi.phase) * 0.6 * amp;
      poi.pivot.getWorldPosition(V); poi.pivot.getWorldQuaternion(Q); S.set(0, -1.6, 0).applyQuaternion(Q).add(V);
      w.g.position.set(S.x, S.y - 0.25, S.z);
      if (el >= a.dur) { const sx = isl.x + poi.x, sz = isl.z + poi.z; stopDoing(w); w.g.position.set(sx, 0, sz); w.wait = 1 + rnd(); }
    } else if (a.kind === "slide") {
      if (a.stage === "climb") { const k = Math.min(1, el / 1.8); w.g.position.set(isl.x + poi.foot.x, k * poi.top.y, isl.z + poi.foot.z); w.g.userData.moving = true; if (k >= 1) { a.stage = "top"; a.t0 = t; w.g.position.set(isl.x + poi.top.x, poi.top.y, isl.z + poi.top.z); w.g.userData.moving = false; } }
      else if (a.stage === "top") { if (el > 0.8) { a.stage = "slide"; a.t0 = t; w.g.userData.sitting = true; } }
      else { const k = Math.min(1, el / 1.0), e = k * k; w.g.position.set(isl.x + poi.top.x + (poi.end.x - poi.top.x) * e, poi.top.y + (poi.end.y - poi.top.y) * e, isl.z + poi.top.z + (poi.end.z - poi.top.z) * e);
        if (k >= 1) { const ex = isl.x + poi.end.x, ez = isl.z + poi.end.z; stopDoing(w); w.g.position.set(ex, 0, ez); w.wait = 1 + rnd() * 2; } }
    }
  }
  const islOf = id => nav.islandOf(id);
  let last = performance.now() / 1000, raf = 0, paused = false, t = 0;
  function tick() {
    raf = requestAnimationFrame(tick);
    const now = performance.now() / 1000, dt = Math.min(0.2, now - last); last = now; if (document.hidden) return;
    if (E.camIdle) E.camIdle(dt, paused);
    const k = 1 - Math.exp(-dt * 3.4); cam.pos.lerp(cam.goalPos, k); cam.tgt.lerp(cam.goalTgt, k); if (cam.lift) { cam.liftT += dt; if (cam.liftT > 1.2) cam.lift = 0; } placeCam();
    if (!paused) {
      t += dt;
      for (const w of walkers) {
        if (w.act) { doAct(w); pose(w.g, t); continue; }
        if (w.path) {
          const dx = w.target.x - w.g.position.x, dz = w.target.z - w.g.position.z, d = Math.hypot(dx, dz);
          // 卡住的保險：一秒半都沒前進（被東西推回來）就當作到了這一點，走下一點；是最後一點就當作到了。
          const px0 = w.g.position.x, pz0 = w.g.position.z;
          // ⚠ 門檻要跟 dt 走：60 fps 時一幀只走 0.017 公尺，寫死 0.02 會把正常走路當成卡住（2026-11-17 第九次就是這樣，大家一直被跳點）。
          if (d > 0.1 && w.lastX != null && Math.hypot(px0 - w.lastX, pz0 - w.lastZ) < 0.25 * dt) { w.stuck = (w.stuck || 0) + dt; } else w.stuck = 0;
          w.lastX = px0; w.lastZ = pz0;
          if (w.target.slide) {
            // 坐著溜：沿管子走，y 跟著管子；到另一頭站起來。
            const sl = w.target.slide; if (w.slideT == null) { w.slideT = 0; w.g.userData.sitting = true; }
            const was = w.slideT; w.slideT = Math.min(1, w.slideT + dt * 0.45); if (was < 0.6 && w.slideT >= 0.6 && sl.splash) sl.splash.t0 = t;   // 溜到最低點：水花噴起來
            const k = sl.dir > 0 ? w.slideT : 1 - w.slideT; const q = sl.curve.getPointAt(k), q2 = sl.curve.getPointAt(Math.min(1, Math.max(0, k + sl.dir * 0.02)));
            w.g.position.set(q.x, q.y - 0.3, q.z); w.g.rotation.y = Math.atan2(q2.x - q.x, q2.z - q.z); w.g.userData.moving = false;
            if (w.slideT >= 1) { w.slideT = null; w.g.userData.sitting = false; w.g.position.y = 0; w.pathI++; if (w.pathI < w.path.length) { w.target = w.path[w.pathI]; if (w.target.isl) w.isl = islOf(w.target.isl) || w.isl; } else { w.path = null; if (w.dest) { w.isl = islOf(w.dest) || w.home; w.dest = ""; pickHere(w); if (!w.path) arrived(w); } else arrived(w); } }
            pose(w.g, t); continue;
          }
          // 快到了（1.5 公尺內）就直接到，不要在最後那一小段跟東西推來推去；真的卡住兩秒半才跳下一點。
          if (d > 0.1 && w.stuck > 2.5 && d < 1.5) { w.stuck = 0; w.g.position.x = w.target.x; w.g.position.z = w.target.z; }
          if (d > 0.1 && w.stuck > 2.5) { w.stuck = 0; w.pathI++; if (w.pathI < w.path.length) { w.target = w.path[w.pathI]; if (w.target.isl) w.isl = islOf(w.target.isl) || w.isl; } else { w.path = null; if (w.dest) { w.isl = islOf(w.dest) || w.home; w.dest = ""; } w.g.userData.moving = false; stopDoing(w); w.wait = 1 + rnd() * 2; } }
          else if (d > 0.1) {
            const sp = Math.min(d, (w.dest ? 1.5 : 1.0) * dt); let nx = w.g.position.x + dx / d * sp, nz = w.g.position.z + dz / d * sp;
            // 每一幀再往外推一次：快碰到東西就沿著它的邊走（detour 算的是大方向，這裡擋細節）。
            if (w.target.isl) for (const b of blockersFor(w.target.isl, w.target)) { const bx = nx - b.x, bz = nz - b.z, bd = Math.hypot(bx, bz); if (bd < b.r + 0.35 && bd > 0.01) { nx = b.x + bx / bd * (b.r + 0.35); nz = b.z + bz / bd * (b.r + 0.35); } }
            w.g.position.x = nx; w.g.position.z = nz; turnTo(w.g, Math.atan2(dx, dz), dt); w.g.userData.moving = true; w.g.userData.baseY = w.target.by ? w.target.by(1 - d / w.target.len) : 0; w.g.userData.wt = (w.g.userData.wt || 0) + sp / 1.2;   // 步頻照走的距離（1.2 公尺一步），過橋走快的人腳才不會滑
          } else {
            w.pathI++;
            if (w.pathI < w.path.length) { w.target = w.path[w.pathI]; if (w.target.isl) w.isl = islOf(w.target.isl) || w.isl; }
            else { w.path = null; if (w.dest) { w.isl = islOf(w.dest) || w.home; w.dest = ""; w.g.userData.moving = false; pickHere(w); if (!w.path) arrived(w); } else arrived(w); }
          }
        } else {
          w.wait -= dt; if (w.faceTo != null) turnTo(w.g, w.faceTo, dt);
          if (w.wait <= 0) {
            w.trips++; stopDoing(w); w.faceTo = null;
            let to = "";
            // 走動少一點、做事多一點（Paul 2026-11-17：「they are just walking relentlessly」）：每做三四件事才過一次橋。
            // 用機率不用「第幾次」：之前 trips % 7 === 3 讓四十個人同一刻一起出發（2026-11-17 第九次）。
            if (w.isl.id !== w.home.id && rnd() < 0.35) to = w.home.id;
            else if (w.person.goes && rnd() < 0.18) to = w.person.goes;
            else if (nav.commons && w.home.id !== nav.commons && rnd() < 0.1) to = nav.commons;   // 聚會所沒有人住，要常常有人走過來才像聚會所
            if (!(to && travel(w, to))) pickHere(w);
          }
        }
        pose(w.g, t);
      }
      for (const c of clouds) { c.position.x += c.userData.drift * dt; if (c.position.x > c.userData.cx + 130) c.position.x = c.userData.cx - 130; }   // 飄出 130 公尺就從另一邊回來（之前飄進霧裡就沒了）
      for (const f of flags) { f.rotation.y = Math.sin(t * 2.3 + f.userData.ph) * 0.22; f.scale.x = 0.92 + Math.sin(t * 3.7 + f.userData.ph) * 0.08; }
      for (const f of foams) { const k = 0.5 + 0.5 * Math.sin(t * 1.1 + f.userData.ph); f.scale.setScalar(1 + 0.035 * k); f.material.opacity = 0.2 + 0.3 * (1 - k); }   // 浪往外推：放大的同時變淡
      E.waveU.value = t;
      for (let i = bounces.length - 1; i >= 0; i--) { const b = bounces[i], k = (t - b.t0) / 0.45; if (k >= 1) { b.o.scale.setScalar(1); bounces.splice(i, 1); } else b.o.scale.setScalar(1 + 0.035 * Math.sin(k * Math.PI)); }
      E.now = t;   // 除錯用：現在的時間（秒），console 裡可以把水花的 t0 設成它來看噴水
      // 滑水道底的水花：水圈放大變淡、十顆水珠往外往上噴再落回水裡，1.3 秒收掉。
      for (const sp of splashes) { const age = t - sp.t0; if (age > 1.3) { if (sp.on) { sp.on = false; sp.ring.scale.setScalar(1); sp.mat.opacity = 0.45; for (let k = 0; k < 10; k++) sp.drops.setMatrixAt(k, NONE4); sp.drops.instanceMatrix.needsUpdate = true; } continue; }
        sp.on = true; sp.ring.scale.setScalar(1 + age * 1.4); sp.mat.opacity = 0.8 * (1 - age / 1.3);
        for (let k = 0; k < 10; k++) { const a = k / 10 * TAU + 0.3; const r = 0.4 + age * 2.4, y = -0.45 + 3.6 * age - 7.5 * age * age; if (y < -0.5) sp.drops.setMatrixAt(k, NONE4); else sp.drops.setMatrixAt(k, SM.makeTranslation(sp.x + Math.cos(a) * r, y, sp.z + Math.sin(a) * r)); } sp.drops.instanceMatrix.needsUpdate = true; }
      // 雲霄飛車：小車沿軌道跑，速度照能量守恆（離最高點越低越快，sqrt(2g·落差) 乘 0.6），最慢 1.6 m/s 當拉升鏈。
      // 2026-11-18 批 A：之前用「前方 1% 軌道的高度差」算速度，陡坡算出負的，車退到坡度剛好那一點就停，五列有三列是停著的。
      // 2026-11-19 Paul「they're floating on the coaster」：每一節車廂各自放在軌道上，車身的「上」沿著軌道傳遞（平行移動的框架），過迴圈時倒過來貼著軌道，不再用世界的上。
      for (const c of coasters) {
        if (!c.L) { c.L = c.curve.getLength(); c.top = -1e9; for (let k = 0; k < 64; k++) c.top = Math.max(c.top, c.curve.getPointAt(k / 64).y); c.cars = c.cars || [c.train]; }
        const p0 = c.curve.getPointAt(c.t), v = Math.max(1.6, Math.sqrt(2 * 9.8 * Math.max(0, c.top + 0.3 - p0.y)) * 0.6);
        c.t = (c.t + dt * v / c.L) % 1;
        c.cars.forEach((car, k) => { const u = ((c.t - k * 1.1 / c.L) % 1 + 1) % 1; const p1 = c.curve.getPointAt(u), p2 = c.curve.getPointAt((u + 0.006) % 1);
          CT.subVectors(p2, p1).normalize(); const ud = car.userData; if (!ud.side) ud.side = new THREE.Vector3().crossVectors(UPV, CT).normalize();
          CS.copy(ud.side).addScaledVector(CT, -ud.side.dot(CT)); if (CS.lengthSq() < 0.01) CS.crossVectors(UPV, CT); CS.normalize();
          if (Math.abs(CT.y) < 0.7) { CL.crossVectors(UPV, CT).normalize(); CS.lerp(CL, 0.12).normalize(); }   // 平的路段慢慢回到水平，不然繞幾圈會歪掉
          ud.side.copy(CS); CN.crossVectors(CT, CS).normalize(); CB.copy(CS).negate(); CM.makeBasis(CT, CN, CB); car.quaternion.setFromRotationMatrix(CM); car.position.copy(p1).addScaledVector(CN, 0.3); }); }
      for (const b of beacons) b.rotation.y += dt * 0.9;
      for (const b of balloons) { const u = b.userData; u.a += dt * u.sp; b.position.set(u.cx + Math.cos(u.a) * u.r, u.h + Math.sin(t * 0.5 + u.a) * 0.6, u.cz + Math.sin(u.a) * u.r * 0.8); b.rotation.y += dt * 0.1; if (u.shadow) u.shadow.position.set(b.position.x + 2.5, -0.58, b.position.z - 1.5); }
      for (const b of boats) { b.position.y = -0.35 + Math.sin(t * 1.3 + b.userData.phase) * 0.08; b.rotation.z = Math.sin(t * 0.9 + b.userData.phase) * 0.04; b.rotation.y = b.userData.ry + Math.sin(t * 0.3 + b.userData.phase) * 0.06; }   // 停著的船繞錨繩微微擺，不再原地自轉（批 B）
      // 機場那架會動的飛機：機坪滑到滑行道、上跑道、加速起飛、繞一圈（高度 14）、降落、滑回機坪，一輪 72 秒。螺旋槳一直轉。
      // 位置是 u（秒）的分段函式；朝向用 lookAt 看下一個點，所以轉彎、爬升、下降都自然；繞圈時側傾。
      // 繞的那一段（32 到 58 秒）頁面可以換：userData.flight.tour(k, v) 給 0..1 的 k 填 v（機場的本地座標）；沒給就繞一個半徑 30 的圈。
      for (const pl of planes) { const fl = pl.userData.flight; if (!fl) continue; const prop = pl.getObjectByName("prop"); if (prop) prop.rotation.x += dt * 18;
        fl.t = (fl.t + dt) % 72;
        const lerp = (a, b, k) => a + (b - a) * k, ease = k => k * k * (3 - 2 * k);
        const at = u => { const v = new THREE.Vector3();
          if (u < 6) v.set(lerp(-3.0, -6.0, u / 6), 0.75, -4.6);
          else if (u < 10) v.set(-6.0, 0.75, lerp(-4.6, -1.4, (u - 6) / 4));
          else if (u < 18) v.set(lerp(-6.0, 6.0, (u - 10) / 8), 0.75, -1.4);
          else if (u < 22) v.set(6.0, 0.75, lerp(-1.4, 2.6, (u - 18) / 4));
          else if (u < 26) v.set(lerp(6.0, -7.0, ease((u - 22) / 4)), 0.75, 2.6);
          else if (u < 32) { const k = (u - 26) / 6; v.set(lerp(-7.0, -24, k), lerp(0.75, 14, ease(k)), 2.6); }
          else if (u < 58) { const k = (u - 32) / 26; if (fl.tour) fl.tour(k, v); else { const a = k * TAU; v.set(-24 - 30 + Math.cos(a) * 30, 14 + Math.sin(a * 2) * 0.8, -9 - Math.sin(a) * 30); /* 圓心往南 6 公尺，不跨纜線（批 D）*/ } }
          else if (u < 64) { const k = (u - 58) / 6; v.set(lerp(-24, -7.0, k), lerp(14, 0.75, ease(k)), 2.6); }
          else if (u < 68) v.set(lerp(-7.0, 6.0, 1 - Math.pow(1 - (u - 64) / 4, 2)), 0.75, 2.6);
          else { const k = (u - 68) / 4; if (k < 0.5) v.set(6.0, 0.75, lerp(2.6, -4.6, k * 2)); else v.set(lerp(6.0, -3.0, (k - 0.5) * 2), 0.75, -4.6); }
          return v; };
        const now_ = at(fl.t), next = at((fl.t + 0.25) % 72);
        pl.position.copy(now_);
        if (next.distanceToSquared(now_) > 1e-6) { pl.parent.localToWorld(next); pl.lookAt(next); }
        const flying = fl.t >= 32 && fl.t < 58; pl.rotateZ(flying ? 0.35 : 0); }
      if (tickExtra) tickExtra(dt, t);
    }
    render(t);
  }
  raf = requestAnimationFrame(tick);
  return { pause(v) { paused = !!v; }, stop() { cancelAnimationFrame(raf); } };
}
