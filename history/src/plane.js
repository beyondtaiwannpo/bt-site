// /history/ 的客機工廠（批 5）：全部用 Three 的基本幾何組，沒有模型檔。
// 吃一個 THREE（importmap 的 three，測試給替身），回一個 Group。機頭朝 +z、y 朝上、機身中心在原點、長 38 公尺，單位公尺。
// 零件都有名字（PLANE_PARTS），測試照名字數；setGear() 收放起落架、steerNose() 轉機鼻輪，停機坪上停著的幾架也用同一個工廠換尾翼色。
// 顏色由呼叫的人給（scene.js 從 CSS 變數讀七色），這裡沒有色碼。

export const PLANE_PARTS = ["fuselage", "door", "cockpit", "windows", "wingL", "wingR", "engineL", "engineR", "stabL", "stabR", "fin", "finTaiwan", "gearNose", "gearMainL", "gearMainR"];
export const LENGTH = 38, RADIUS = 2, GEAR_H = 2.1;

// 台灣的輪廓（簡化成十二個點，寬 1、高約 2.3、y 朝上），畫在尾翼上。首頁那座島是 370 點的真海岸線，尾翼上這麼小一片十二點就夠。
export const TAIWAN = [[0.55, 1.0], [0.72, 0.92], [0.8, 0.72], [0.76, 0.5], [0.64, 0.22], [0.54, 0.0], [0.44, 0.04], [0.3, 0.28], [0.18, 0.55], [0.2, 0.78], [0.33, 0.95], [0.45, 1.0]];

// 機身剖面：從機尾到機頭（半徑, 沿機身）。機頭圓、機尾收成錐。LatheGeometry 繞 y 轉，做完再把 y 轉成 z。
const PROFILE = [[0.25, -19], [0.7, -17.8], [1.25, -15.5], [1.7, -12.5], [RADIUS, -9], [RADIUS, 13], [1.9, 15.2], [1.55, 17], [1.0, 18.3], [0, 19]];

function mat(THREE, color, extra) { return new THREE.MeshLambertMaterial({ color, flatShading: true, ...(extra || {}) }); }
function shapeOf(THREE, pts) {
  const s = new THREE.Shape(); pts.forEach(([x, y], i) => i ? s.lineTo(x, y) : s.moveTo(x, y)); s.closePath(); return s;
}
function mesh(THREE, geo, material, name, shadow) {
  const m = new THREE.Mesh(geo, material); m.name = name || ""; m.castShadow = shadow !== false; m.receiveShadow = false; return m;
}

// 機翼：平面在 xz，x 是翼展、shape 的 y 等於 -z（rotation.x = -90 度之後 y 變成 -z）。後掠 25 度、上反角 6 度。sign 是 +1 右翼、-1 左翼。
function wing(THREE, material, sign, name) {
  const span = 17, sweep = 8, rootLE = 3.2, rootTE = -3.4, tipC = 1.9;
  const pts = [[0, -rootLE], [sign * span, -(rootLE - sweep)], [sign * span, -(rootLE - sweep - tipC)], [0, -rootTE]];
  if (sign < 0) pts.reverse();
  const geo = new THREE.ExtrudeGeometry(shapeOf(THREE, pts), { depth: 0.42, bevelEnabled: false });
  const m = mesh(THREE, geo, material, name);
  m.rotation.x = -Math.PI / 2; m.rotation.y = -sign * 0.105;   // 上反角
  m.position.set(0, -0.9, 0);
  return m;
}
function stab(THREE, material, sign, name) {
  const pts = [[0, 1.6], [sign * 6.2, -2.0], [sign * 6.2, -3.2], [0, -2.2]];
  if (sign < 0) pts.reverse();
  const m = mesh(THREE, new THREE.ExtrudeGeometry(shapeOf(THREE, pts), { depth: 0.25, bevelEnabled: false }), material, name);
  m.rotation.x = -Math.PI / 2; m.position.set(0, 0.6, -14.8);
  return m;
}
function engine(THREE, bodyMat, darkMat, sign, name) {
  const g = new THREE.Group(); g.name = name;
  const body = mesh(THREE, new THREE.CylinderGeometry(1.0, 1.15, 3.8, 12), bodyMat, "nacelle"); body.rotation.x = Math.PI / 2;
  const intake = mesh(THREE, new THREE.CylinderGeometry(1.15, 1.15, 0.3, 12), darkMat, "intake"); intake.rotation.x = Math.PI / 2; intake.position.z = 1.95;
  const core = mesh(THREE, new THREE.CylinderGeometry(0.35, 0.5, 1.2, 8), darkMat, "exhaust"); core.rotation.x = Math.PI / 2; core.position.z = -2.3;
  const pylon = mesh(THREE, new THREE.BoxGeometry(0.4, 1.3, 2.2), bodyMat, "pylon"); pylon.position.set(0, 1.0, 0);
  g.add(body, intake, core, pylon);
  g.position.set(sign * 5.6, -2.5, 1.6);
  return g;
}
function gear(THREE, darkMat, name, wheels, x, z) {
  const g = new THREE.Group(); g.name = name;
  const strut = mesh(THREE, new THREE.CylinderGeometry(0.14, 0.14, GEAR_H, 6), darkMat, "strut"); strut.position.y = -GEAR_H / 2;
  g.add(strut);
  for (let k = 0; k < wheels; k++) {
    const w = mesh(THREE, new THREE.CylinderGeometry(0.5, 0.5, 0.36, 10), darkMat, "wheel");
    w.rotation.z = Math.PI / 2; w.position.set((k - (wheels - 1) / 2) * 0.5, -GEAR_H, 0);
    g.add(w);
  }
  g.position.set(x, -RADIUS + 0.4, z);
  g.userData.base = { y: -RADIUS + 0.4 };
  return g;
}

// 工廠。opts：body（機身色）、tail（尾翼色）、mark（尾翼上台灣的顏色）、dark（窗與輪子）、scale。
export function buildAirliner(THREE, opts) {
  const o = opts || {};
  const bodyMat = mat(THREE, o.body), tailMat = mat(THREE, o.tail), darkMat = mat(THREE, o.dark == null ? o.tail : o.dark), markMat = mat(THREE, o.mark == null ? o.body : o.mark);
  const plane = new THREE.Group(); plane.name = "airliner";

  // 機身：LatheGeometry 繞 y，轉 90 度讓長軸變成 z。機尾那一段往上翹：y 低於 -9 的頂點依比例抬高。
  const lathe = new THREE.LatheGeometry(PROFILE.map(([r, y]) => new THREE.Vector2(r, y)), 14);
  lathe.rotateX(Math.PI / 2);
  const pos = lathe.attributes && lathe.attributes.position;
  if (pos && pos.count) {
    for (let i = 0; i < pos.count; i++) { const z = pos.getZ(i); if (z < -9) pos.setY(i, pos.getY(i) + (-9 - z) / 10 * 1.1); }
    lathe.computeVertexNormals();
  }
  plane.add(mesh(THREE, lathe, bodyMat, "fuselage"));

  // 駕駛艙窗：機頭兩側各兩片，一片正面。
  const cockpit = new THREE.Group(); cockpit.name = "cockpit";
  for (const [x, z, ry] of [[-1.45, 15.6, -0.9], [1.45, 15.6, 0.9], [-0.75, 16.9, -0.35], [0.75, 16.9, 0.35]]) {
    const w = mesh(THREE, new THREE.BoxGeometry(0.9, 0.55, 0.12), darkMat, "pane", false); w.position.set(x, 0.75, z); w.rotation.y = ry; cockpit.add(w);
  }
  plane.add(cockpit);
  // 一排窗：兩側各一條細長的帶子，稍微嵌在機身外。
  const windows = new THREE.Group(); windows.name = "windows";
  // 窗帶在門那一段斷開（門在 z=11），不然窗帶會橫穿過門變成一個十字。
  for (const sx of [-1, 1]) {
    const a = mesh(THREE, new THREE.BoxGeometry(0.1, 0.5, 19.6), darkMat, "strip", false); a.position.set(sx * (RADIUS - 0.02), 0.55, 0.3); windows.add(a);
    const b = mesh(THREE, new THREE.BoxGeometry(0.1, 0.5, 1.2), darkMat, "strip", false); b.position.set(sx * (RADIUS - 0.02), 0.55, 12.5); windows.add(b);
  }
  plane.add(windows);
  // 左前的機艙門（空橋接的那一扇）：機頭後 8 公尺、模型的 +x 那一側（面向航廈停的時候是靠航廈那一邊）。深藍的門加一圈奶油色的門框。
  const door = new THREE.Group(); door.name = "door";
  door.add(mesh(THREE, new THREE.BoxGeometry(0.1, 2.2, 1.3), markMat, "frame", false), mesh(THREE, new THREE.BoxGeometry(0.14, 1.9, 1.0), darkMat, "leaf", false));
  door.position.set(RADIUS - 0.04, 0.05, 11); plane.add(door);

  plane.add(wing(THREE, bodyMat, 1, "wingR"), wing(THREE, bodyMat, -1, "wingL"));
  plane.add(engine(THREE, bodyMat, darkMat, 1, "engineR"), engine(THREE, bodyMat, darkMat, -1, "engineL"));
  plane.add(stab(THREE, bodyMat, 1, "stabR"), stab(THREE, bodyMat, -1, "stabL"));

  // 垂直尾翼：平面在 yz。shape 的 x 等於 -z（rotation.y = 90 度之後 x 變成 -z），y 朝上。
  const finPts = [[11.5, 0.6], [17.6, 0.6], [18.6, 6.2], [16.0, 6.2]];
  const fin = mesh(THREE, new THREE.ExtrudeGeometry(shapeOf(THREE, finPts), { depth: 0.3, bevelEnabled: false }), tailMat, "fin");
  fin.rotation.y = Math.PI / 2; fin.position.x = 0.15;
  plane.add(fin);
  // 尾翼上那一片台灣：奶油色，兩面各一片。
  const tw = new THREE.Group(); tw.name = "finTaiwan";
  const island = shapeOf(THREE, TAIWAN.map(([x, y]) => [x * 1.6, y * 1.6]));
  for (const sx of [-1, 1]) {
    const m = mesh(THREE, new THREE.ExtrudeGeometry(island, { depth: 0.06, bevelEnabled: false }), markMat, "island", false);
    m.rotation.y = sx * Math.PI / 2; m.position.set(sx * 0.19, 2.4, -16.4 + (sx < 0 ? -1.6 : 0) + 0.8 * sx);
    tw.add(m);
  }
  plane.add(tw);

  plane.add(gear(THREE, darkMat, "gearNose", 2, 0, 12.5), gear(THREE, darkMat, "gearMainL", 2, -2.6, -1.0), gear(THREE, darkMat, "gearMainR", 2, 2.6, -1.0));
  if (o.scale) plane.scale.set(o.scale, o.scale, o.scale);
  plane.userData.gear = 1;
  setGear(plane, 1);
  return plane;
}

// 起落架：g 是 1 放下、0 收起。鼻輪往上縮進機身、主輪往翼根摺。
export function setGear(plane, g) {
  g = Math.min(1, Math.max(0, g)); plane.userData.gear = g;
  const nose = plane.getObjectByName("gearNose"), L = plane.getObjectByName("gearMainL"), R = plane.getObjectByName("gearMainR");
  if (nose) { nose.position.y = nose.userData.base.y + (1 - g) * (GEAR_H + 0.3); nose.rotation.x = (1 - g) * 1.3; }
  for (const [m, sign] of [[L, -1], [R, 1]]) if (m) { m.position.y = m.userData.base.y + (1 - g) * (GEAR_H - 0.2); m.rotation.z = sign * (1 - g) * 1.5; m.rotation.x = (1 - g) * 0.25; }
}
// 機鼻輪轉向（弧度，左負右正）。
export function steerNose(plane, rad) { const nose = plane.getObjectByName("gearNose"); if (nose) nose.rotation.y = rad; }
