// /stories/ 的機場版：/history/ 那座 3D 機場的登機門大廳（Three.js，全部程式幾何，沒有模型檔）。
// 旅客（你扮演的學生）站在走道上面對玻璃牆。牆上八個登機門，一關一個：一開始只有第一個亮（學測），
// 每走一關多亮一個。每一關選完，一個人從旁邊走過來站在你旁邊（這一年在你旁邊的人）。
// 走完一年，一架 BT 的飛機從停機坪滑進來停在你面前的門外，鏡頭拉高看整個停機坪。
//
// ── 四件事 ──
// 1. **資料與場景分開。** 門在哪、人站哪、鏡頭在哪，全部在 layout.js（純數學）。這裡只擺東西。
// 2. **Three 只有這一支與 plane.js、person.js 用。** 從 importmap 的 three 來，載不到整支載不進來，engine.js 接住走靜的島。
// 3. **會動的東西全部在 motion() 裡。** 開了減少動態效果 engine.js 不會載這一支。
// 4. **顏色七色進來混色出去。** 這裡沒有色碼；engine.js 從 brand.css 的 CSS 變數讀七色丟進來。
import * as THREE from "three";
import { buildAirliner, setGear } from "./plane.js";
import { buildPerson, posePerson } from "./person.js";
import * as L from "./layout.js";

export function webglOK() {
  try { const c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); } catch (e) { return false; }
}
const lam = (color, extra) => new THREE.MeshLambertMaterial({ color, flatShading: true, ...(extra || {}) });
function box(w, h, d, material, x, y, z, shadow) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material); m.position.set(x, y, z); m.castShadow = shadow !== false; m.receiveShadow = true; return m; }
function cyl(rt, rb, h, material, x, y, z, seg) { const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg || 10), material); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; return m; }
function instanced(geo, material, places, shadow) {
  const im = new THREE.InstancedMesh(geo, material, places.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  places.forEach(([x, y, z, ry, sc], i) => { q.setFromAxisAngle(up, ry || 0); s.setScalar(sc || 1); p.set(x, y, z); m.compose(p, q, s); im.setMatrixAt(i, m); });
  im.instanceMatrix.needsUpdate = true; im.castShadow = shadow !== false; im.receiveShadow = true; return im;
}
function textTexture(w, h, bg, lines) {
  const c = document.createElement("canvas"); c.width = w; c.height = h; const ctx = c.getContext("2d");
  ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
  for (const l of lines) { ctx.fillStyle = l.color; ctx.font = l.font; ctx.textAlign = l.align || "center"; ctx.textBaseline = "middle"; ctx.fillText(l.text, l.x, l.y); }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4; return tex;
}
function tileTexture(p) {
  const c = document.createElement("canvas"); c.width = c.height = 128; const ctx = c.getContext("2d");
  ctx.fillStyle = p.cream; ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = p.grey; ctx.globalAlpha = 0.5; ctx.lineWidth = 2; ctx.strokeRect(1, 1, 126, 126);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.anisotropy = 8; return tex;
}
function colours(p) {
  const C = k => new THREE.Color(p[k]);
  const navy = C("navy"), teal = C("teal"), orange = C("orange"), sand = C("sand"), cream = C("cream"), yellow = C("yellow"), grey = C("grey");
  return {
    navy, teal, orange, sand, cream, yellow, grey, white: new THREE.Color(1, 1, 1),
    sky: cream.clone().lerp(teal, 0.2), apron: cream.clone().lerp(grey, 0.42), grass: teal.clone().lerp(sand, 0.34).lerp(grey, 0.16),
    wall: cream.clone().lerp(sand, 0.35), roof: navy.clone().lerp(grey, 0.35), glass: teal.clone().lerp(cream, 0.35), floor: cream.clone().lerp(grey, 0.18),
    ceiling: cream.clone().lerp(grey, 0.1), dark: navy.clone().lerp(grey, 0.2), column: cream.clone().lerp(sand, 0.5),
    skin: sand.clone().lerp(orange, 0.25).lerp(cream, 0.2), hair: navy.clone().lerp(grey, 0.15).multiplyScalar(0.45),
    trousersNavy: navy.clone().lerp(grey, 0.25), trousersKhaki: sand.clone().lerp(grey, 0.45).lerp(navy, 0.15),
    plant: teal.clone().lerp(navy, 0.3).lerp(grey, 0.15),
  };
}

export async function create({ stage, palette, fonts, phone, lang }) {
  if (!webglOK()) throw new Error("no webgl");
  stage.innerHTML = "";
  const canvas = document.createElement("canvas"); canvas.className = "scene3d"; stage.appendChild(canvas);
  const P = colours(palette);
  const mats = {
    wall: lam(P.wall), roof: lam(P.roof), floor: lam(P.cream, { map: tileTexture(palette) }), ceiling: lam(P.ceiling, { emissive: P.cream, emissiveIntensity: 0.4 }),
    glass: lam(P.glass, { transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }), frame: lam(P.dark), navy: lam(P.navy), cream: lam(P.cream), sand: lam(P.sand),
    orange: lam(P.orange), teal: lam(P.teal), grey: lam(P.grey), apron: lam(P.apron), grass: lam(P.grass), column: lam(P.column), plant: lam(P.plant), pot: lam(P.navy.clone().lerp(P.grey, 0.5)),
    light: lam(P.sand, { emissive: P.sand, emissiveIntensity: 0.7 }), yellowLight: lam(P.yellow, { emissive: P.yellow, emissiveIntensity: 0.9 }),
  };
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(phone ? 1.5 : 2, window.devicePixelRatio || 1));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene(); scene.background = P.sky.clone(); scene.fog = new THREE.FogExp2(P.sky.clone(), 0.0035);
  const camera = new THREE.PerspectiveCamera(phone ? 70 : 58, 16 / 9, 0.3, 3000); scene.add(camera);
  scene.add(new THREE.HemisphereLight(P.sky, P.grass, 0.95));
  const sun = new THREE.DirectionalLight(P.cream, 1.6); sun.castShadow = true; sun.shadow.mapSize.set(phone ? 512 : 1024, phone ? 512 : 1024);
  sun.position.set(-40, 90, -50); sun.target.position.set(40, 0, 0); sun.shadow.camera.near = 10; sun.shadow.camera.far = 400;
  const sc = sun.shadow.camera; sc.left = -90; sc.right = 90; sc.top = 90; sc.bottom = -90; sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.6;
  scene.add(sun, sun.target);

  const H = L.HALL, tx = (H.x0 + H.x1) / 2, tz = (H.z0 + H.z1) / 2, tw = H.x1 - H.x0, td = H.z1 - H.z0;
  const world = new THREE.Group(); scene.add(world);
  // ═══ 地與停機坪 ═══
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000), mats.grass); ground.rotation.x = -Math.PI / 2; ground.position.y = -0.05; ground.receiveShadow = true; world.add(ground);
  const apron = new THREE.Mesh(new THREE.PlaneGeometry(400, 240), mats.apron); apron.rotation.x = -Math.PI / 2; apron.position.set(tx + 40, 0, 110); apron.receiveShadow = true; world.add(apron);
  { const lights = []; for (let x = H.x0 - 60; x < H.x1 + 160; x += 12) lights.push([x, 0.25, 70]); world.add(instanced(new THREE.SphereGeometry(0.3, 6, 4), mats.yellowLight, lights, false)); }
  // ═══ 大廳 ═══
  const hall = new THREE.Group(); world.add(hall);
  mats.floor.map.repeat.set(tw / 4, td / 4);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(tw, td), mats.floor); floor.rotation.x = -Math.PI / 2; floor.position.set(tx, 0.01, tz); floor.receiveShadow = true; hall.add(floor);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(tw, td), mats.ceiling); ceil.rotation.x = Math.PI / 2; ceil.position.set(tx, H.h - 0.6, tz); hall.add(ceil);
  { const panels = [], lights = []; for (let x = H.x0 + 3; x < H.x1 - 2; x += 6) for (let z = H.z0 + 3; z < H.z1 - 2; z += 6) panels.push([x, H.h - 0.9, z]);
    for (let x = H.x0 + 6; x < H.x1; x += 12) for (const z of [-24, -14, -5]) lights.push([x, H.h - 1.15, z]);
    hall.add(instanced(new THREE.BoxGeometry(5.4, 0.25, 5.4), lam(P.ceiling, { emissive: P.cream, emissiveIntensity: 0.3 }), panels, false), instanced(new THREE.BoxGeometry(5, 0.14, 0.7), mats.light, lights, false)); }
  hall.add(box(tw + 3, 0.8, td + 3, mats.roof, tx, H.h, tz, false));
  const sideM = lam(P.wall, { side: THREE.DoubleSide });
  for (const [w, h, d, x, y, z] of [[tw, H.h, 0.6, tx, H.h / 2, H.z0], [0.6, H.h, td, H.x0, H.h / 2, tz], [0.6, H.h, td, H.x1, H.h / 2, tz]]) hall.add(box(w, h, d, sideM, x, y, z, false));
  hall.add(box(tw, 1.0, 0.2, mats.navy, tx, H.h - 1.5, H.z0 + 0.4, false));
  // 玻璃牆：整面淡青的玻璃、直櫺每 4 公尺一支、兩條橫櫺。門是牆上的深藍門框（下面 gates 畫）。
  const gh = H.h - 0.8;
  const glassWall = new THREE.Mesh(new THREE.PlaneGeometry(tw, gh), mats.glass); glassWall.position.set(tx, gh / 2, H.z1); hall.add(glassWall);
  { const v = []; for (let x = H.x0; x <= H.x1; x += 4) v.push([x, gh / 2, H.z1]); hall.add(instanced(new THREE.BoxGeometry(0.25, gh, 0.35), mats.frame, v, false));
    hall.add(instanced(new THREE.BoxGeometry(tw, 0.22, 0.35), mats.frame, [[tx, 4, H.z1], [tx, 8, H.z1]], false)); }
  // 柱子、盆栽、候機座位。
  { const cols = []; for (let x = H.x0 + 11; x < H.x1; x += 15) cols.push([x, H.h / 2, -28]); hall.add(instanced(new THREE.CylinderGeometry(0.55, 0.55, H.h, 10), mats.column, cols)); }
  { const pots = [], leaves = []; for (const [x, z] of [[H.x0 + 4, -26], [H.x0 + 26, -26], [H.x0 + 56, -26], [H.x0 + 86, -26], [H.x0 + 40, -4], [H.x0 + 70, -4]]) { pots.push([x, 0.4, z]); leaves.push([x, 1.4, z]); }
    hall.add(instanced(new THREE.CylinderGeometry(0.55, 0.45, 0.8, 8), mats.pot, pots), instanced(new THREE.IcosahedronGeometry(0.75, 0), mats.plant, leaves)); }
  { const benches = [], seatsT = [], seatsO = []; let k = 0;
    for (let x = H.x0 + 8; x < H.x1 - 6; x += 9) for (const z of [-27, -4.5]) { benches.push([x, 0.28, z]); for (let i = 0; i < 5; i++) (k++ % 2 ? seatsT : seatsO).push([x - 2 + i, 0.62, z]); }
    hall.add(instanced(new THREE.BoxGeometry(5.2, 0.12, 0.9), mats.grey, benches), instanced(new THREE.BoxGeometry(0.8, 0.5, 0.8), mats.teal, seatsT), instanced(new THREE.BoxGeometry(0.8, 0.5, 0.8), mats.orange, seatsO)); }

  // ═══ 八個登機門 ═══
  // 每一個：深藍門框、門檻、一塊牌（canvas 貼圖寫 G1..G8 與這一關的名字）、牌上方一盞燈。亮不亮看 setLit。
  const gateFont = `700 ${phone ? 150 : 150}px ${fonts.display}`, labelFont = `700 54px ${fonts.han || fonts.body}`;
  const gates = [];
  function gateSign(label, text, lit) {
    const bg = lit ? palette.orange : palette.navy, fg = lit ? palette.navy : palette.cream;
    return textTexture(512, 256, bg, [{ text: label, font: gateFont, color: fg, x: 256, y: 92 }, { text, font: labelFont, color: fg, x: 256, y: 196 }]);
  }
  for (const g of L.gates(8)) {
    const grp = new THREE.Group(); grp.position.set(g.x, 0, g.z); hall.add(grp);
    grp.add(box(4.2, 0.35, 0.7, mats.navy, 0, 3.2, 0, false), box(0.35, 3.2, 0.7, mats.navy, -1.95, 1.6, 0, false), box(0.35, 3.2, 0.7, mats.navy, 1.95, 1.6, 0, false));
    const signMat = lam(P.white, { map: gateSign(g.label, "", false) });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 2.1), signMat); sign.position.set(0, 4.6, -0.42); sign.rotation.y = Math.PI; grp.add(sign);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6), lam(P.grey)); lamp.position.set(0, 6.0, -0.4); grp.add(lamp);
    gates.push({ g, grp, sign, signMat, lamp, text: "", lit: false });
  }
  function setGate(i, text, lit) {
    const G = gates[i]; if (!G) return;
    G.text = text == null ? G.text : text; G.lit = lit;
    if (G.signMat.map) G.signMat.map.dispose();
    G.signMat.map = gateSign(G.g.label, G.text, lit); G.signMat.needsUpdate = true;
    G.lamp.material = lit ? mats.yellowLight : lam(P.grey);
  }
  // ═══ 人 ═══
  const figMats = [P.cream, P.teal, P.orange, P.sand];
  function person(opts) {
    const o = opts || {};
    return buildPerson(THREE, { variant: o.variant || "default", skin: P.skin, hair: P.hair, shirt: o.shirt || P.cream, trousers: o.khaki ? P.trousersKhaki : P.trousersNavy, shoe: P.hair, accent: o.accent || P.orange, phase: o.phase });
  }
  const traveller = person({ variant: "backpack", shirt: P.cream }); { const t0p = L.travellerFor(0, 8); traveller.position.set(t0p.x, 0, t0p.z); } traveller.userData.baseY = 0; world.add(traveller);
  // 大廳裡本來就有的幾個人（坐著、站著）。
  const idle = [];
  for (const [x, z, i, seated] of [[H.x0 + 44, -27, 0, true], [H.x0 + 29, -4.5, 1, true], [H.x0 + 62, -27, 2, true], [H.x0 + 92, -4.5, 3, true], [H.x0 + 76, -26, 0, false]]) {
    const f = person({ variant: seated ? "seated" : i % 2 ? "bag" : "default", shirt: figMats[i % 4], khaki: i % 2 === 1, phase: i }); f.position.set(x, seated ? 0.05 : 0, z); f.userData.baseY = seated ? 0.05 : 0; f.rotation.y = z > -15 ? Math.PI : 0; world.add(f); idle.push(f);
  }
  // 停機坪：遠處一架停著的飛機（青尾翼）、塔台。
  const parked = buildAirliner(THREE, { body: P.cream, tail: P.teal, mark: P.cream, dark: P.dark }); parked.position.set(H.x1 + 60, 4.2, 70); parked.rotation.y = Math.PI * 0.9; world.add(parked);
  world.add(cyl(2.2, 3, 26, mats.wall, H.x0 - 40, 13, 90, 10), cyl(5.2, 4, 4, mats.roof, H.x0 - 40, 28, 90, 10));
  // 我們那一架（橘尾翼、台灣），一開始停在很右邊看不到，結尾滑進來。
  const plane = buildAirliner(THREE, { body: P.cream, tail: P.orange, mark: P.cream, dark: P.dark }); plane.position.set(L.PLANE_STAND.fromX, 4.2, L.PLANE_STAND.z); plane.rotation.y = -Math.PI / 2; setGear(plane, 1); plane.visible = false; world.add(plane);
  plane.traverse(o => { if (o.isMesh) o.castShadow = true; });

  // ═══ 鏡頭與狀態 ═══
  const look = new THREE.Vector3(10, 1.6, 0);
  const cam = { x: 0, y: 0, z: 0, lx: 0, ly: 0, lz: 0 };
  function placeCam() { camera.position.set(cam.x, cam.y, cam.z); look.set(cam.lx, cam.ly, cam.lz); camera.lookAt(look); }
  function camTo(c) { cam.x = c.x; cam.y = c.y; cam.z = c.z; cam.lx = c.lookX; cam.ly = c.lookY; cam.lz = c.lookZ; placeCam(); }
  const state = { lang, persona: null, met: [], walking: [], clock: 0, api: null, sceneI: 0 };
  const travellerPos = () => L.travellerFor(state.sceneI, 8);
  const SCENE_LABELS = { zh: ["學測", "", "", "", "", "", "", ""], en: ["Exam", "", "", "", "", "", "", ""] };
  function resize() { const w = stage.clientWidth || 300, h = stage.clientHeight || 200; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
  function render(t) { state.clock = t; posePerson(traveller, t, !!traveller.userData.moving); for (const f of idle) posePerson(f, t, false); for (const w of state.walking) posePerson(w.fig, t, w.moving); renderer.render(scene, camera); }
  resize(); camTo(L.cameraFor(0, 8)); setGate(0, SCENE_LABELS[lang][0], true); render(0);
  let ro = null; if ("ResizeObserver" in window) { ro = new ResizeObserver(() => { resize(); render(state.clock); }); ro.observe(stage); }

  const api = {
    setLang(l) { state.lang = l; gates.forEach((G, i) => { if (G.lit) setGate(i, i === 0 ? SCENE_LABELS[l][0] : G.text, true); }); render(state.clock); },
    start(persona) { state.persona = persona; api.reset(true); },
    scene(i, s) {
      state.sceneI = i;
      gates.forEach((G, k) => { if (k <= i && !G.lit) setGate(k, k === 0 ? SCENE_LABELS[state.lang][0] : (s && k === i ? (s["title_" + state.lang] || "") : G.text), true); });
      if (i > 0 && gates[i]) setGate(i, s ? (s["title_" + state.lang] || "") : "", true);
      // 旅客走到這一關的門前，這一年已經在旁邊的人跟著走（「你不是一個人走」就是這個畫面）。
      const tp = travellerPos();
      const moves = [{ fig: traveller, to: tp, w: null }].concat(state.walking.map((w, k) => ({ fig: w.fig, to: L.standSpot(k, tp), w })));
      if (state.api) { state.api.camTo(L.cameraFor(i, 8)); state.api.march(moves); }
      else { for (const m of moves) { m.fig.position.set(m.to.x, 0, m.to.z); } camTo(L.cameraFor(i, 8)); render(state.clock); }
    },
    light(person, i) {
      if (!person || state.met.some(m => m.code === person.code)) return;
      state.met.push(person);
      const k = state.met.length - 1, tp = travellerPos(), spot = L.standSpot(k, tp), variant = person.role === "parent" ? "bag" : person.role === "cadre" ? "staff" : "default";
      const fig = newcomer(variant, k); fig.position.set(spot.x + (spot.x > tp.x ? 22 : -22), 0, spot.z); fig.userData.baseY = 0; fig.rotation.y = spot.x > tp.x ? -Math.PI / 2 : Math.PI / 2;
      world.add(fig);
      const w = { fig, moving: true, spot }; state.walking.push(w);
      if (state.api) state.api.walk(w, tp); else { fig.position.set(spot.x, 0, spot.z); fig.rotation.y = (spot.x > tp.x ? 1 : -1) * 0.4; w.moving = false; render(state.clock); }
    },
    end() {
      gates.forEach((G, k) => { if (!G.lit) setGate(k, G.text, true); });
      plane.visible = true;
      if (state.api) state.api.land(L.PLANE_STAND, L.cameraFor(7, 8)); else { plane.position.x = L.PLANE_STAND.x; camTo(L.cameraFor(7, 8)); render(state.clock); }
    },
    reset(keep) {
      state.met = []; for (const w of state.walking) world.remove(w.fig); state.walking = [];
      gates.forEach((G, k) => setGate(k, k === 0 ? SCENE_LABELS[state.lang][0] : "", k === 0));
      plane.visible = false; plane.position.x = L.PLANE_STAND.fromX; state.sceneI = 0;
      const tp = travellerPos(); traveller.position.set(tp.x, 0, tp.z); traveller.rotation.y = 0;
      if (state.api) state.api.camTo(L.cameraFor(0, 8), keep); else { camTo(L.cameraFor(0, 8)); render(state.clock); }
    },
  };
  function newcomer(variant, k) { return person({ variant, shirt: figMats[k % 4], khaki: k % 2 === 1, phase: k * 1.7 }); }
  if (window.gsap) state.api = motion({ cam, placeCam, render, state, plane, stage });
  return api;
}

/* ── 這裡面才有動畫。外面不准出現 gsap。 ── */
function motion({ cam, placeCam, render, state, plane, stage }) {
  const t0 = gsap.ticker.time;
  gsap.ticker.add(() => { if (!document.hidden) render(gsap.ticker.time - t0); });
  return {
    camTo(c, instant) {
      gsap.killTweensOf(cam);
      gsap.to(cam, { x: c.x, y: c.y, z: c.z, lx: c.lookX, ly: c.lookY, lz: c.lookZ, duration: instant ? 0.01 : 1.4, ease: "power2.inOut", onUpdate: placeCam });
    },
    walk(w, tp) {
      const { fig, spot } = w;
      gsap.to(fig.position, { x: spot.x, z: spot.z, duration: 2.2, ease: "power1.inOut", onComplete: () => { w.moving = false; gsap.to(fig.rotation, { y: (spot.x > tp.x ? 1 : -1) * 0.45, duration: 0.5 }); } });
    },
    // 一群人一起走到下一個門：每個人面向走的方向，到了再轉回來面向玻璃牆。
    march(moves) {
      for (const m of moves) {
        const dx = m.to.x - m.fig.position.x; if (Math.abs(dx) < 0.3) continue;
        if (m.w) m.w.moving = true; else m.fig.userData.moving = true;
        gsap.killTweensOf(m.fig.position); gsap.killTweensOf(m.fig.rotation);
        gsap.to(m.fig.rotation, { y: dx > 0 ? -Math.PI / 2 : Math.PI / 2, duration: 0.3 });
        gsap.to(m.fig.position, { x: m.to.x, z: m.to.z, duration: 1.6 + Math.random() * 0.4, ease: "power1.inOut", onComplete: () => { if (m.w) m.w.moving = false; else m.fig.userData.moving = false; gsap.to(m.fig.rotation, { y: 0, duration: 0.5 }); } });
      }
    },
    land(stand, c) {
      // 飛機從右邊滑進來停在門外；鏡頭同時拉高拉遠。
      gsap.killTweensOf(plane.position);
      gsap.fromTo(plane.position, { x: stand.fromX }, { x: stand.x, duration: 3.6, ease: "power2.out" });
      this.camTo(c);
    },
  };
  void stage;
}
