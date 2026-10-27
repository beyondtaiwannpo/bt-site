// /history/ 的人（批 5 第三輪）：一個工廠做出場景裡每一個人，比例照真人（約七頭身、高 1.75），全部用基本幾何。
// 吃一個 THREE（importmap 的 three，測試給替身）與顏色，回一個 Group，零件都有名字（PERSON_PARTS，測試照名字數）。
// 樣子照參考站的人：圓頭、一頂深色的頭髮、暖膚色的臉（沒有五官）、脖子、短袖的上衣（白或品牌色）、看得到的手臂與手、深藍或卡其的長褲或裙、鞋。
// 站著的人微微重心偏一邊（contrapposto），走路的人腿與手真的擺，坐著的人髖與膝都彎。
// 幾何共用（同一個工廠裡建一次），顏色由呼叫的人給（scene.js 從 CSS 變數讀七色混出來），這裡沒有色碼。

export const PERSON_PARTS = ["head", "hair", "face", "neck", "torso", "armL", "armR", "handL", "handR", "legL", "legR", "shoeL", "shoeR"];
export const PERSON_VARIANTS = ["default", "backpack", "bag", "staff", "crew", "seated", "skirt"];
export const HEIGHT = 1.75;

// 尺寸（公尺）。頭 0.25，身體七個頭。
const D = { head: 0.115, neckH: 0.07, shoulderY: 1.43, hipY: 0.9, torsoW: 0.34, torsoD: 0.18, upperArm: 0.26, foreArm: 0.25, thigh: 0.42, shin: 0.4, shoe: 0.25 };

let cache = null;
function geos(THREE) {
  if (cache && cache.THREE === THREE) return cache;
  cache = {
    THREE,
    head: new THREE.SphereGeometry(D.head, 12, 10),
    hair: new THREE.SphereGeometry(D.head + 0.012, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55),   // 一頂帽子形的頭髮，蓋住頭頂與後腦
    face: new THREE.SphereGeometry(D.head + 0.004, 10, 8, -Math.PI * 0.35, Math.PI * 0.7, Math.PI * 0.3, Math.PI * 0.45),   // 臉：前面那一片，暖膚色
    neck: new THREE.CylinderGeometry(0.045, 0.05, D.neckH, 8),
    torso: new THREE.CapsuleGeometry(D.torsoW / 2, D.shoulderY - D.hipY - D.torsoW / 2, 2, 10),
    sleeve: new THREE.CapsuleGeometry(0.052, D.upperArm - 0.1, 2, 8),
    fore: new THREE.CapsuleGeometry(0.042, D.foreArm - 0.08, 2, 8),
    hand: new THREE.SphereGeometry(0.048, 8, 6),
    thigh: new THREE.CapsuleGeometry(0.075, D.thigh - 0.15, 2, 8),
    shin: new THREE.CapsuleGeometry(0.06, D.shin - 0.12, 2, 8),
    shoe: new THREE.BoxGeometry(0.11, 0.07, D.shoe),
    skirt: new THREE.CylinderGeometry(0.17, 0.25, 0.38, 10),
    pack: new THREE.BoxGeometry(0.3, 0.4, 0.16),
    vest: new THREE.CapsuleGeometry(D.torsoW / 2 + 0.03, 0.26, 2, 10),
    paddle: new THREE.BoxGeometry(0.1, 0.22, 0.02),
    stick: new THREE.CylinderGeometry(0.012, 0.012, 0.3, 5),
    bagBody: new THREE.BoxGeometry(0.36, 0.55, 0.24),
    bagHandle: new THREE.BoxGeometry(0.26, 0.03, 0.03),
    bagRod: new THREE.BoxGeometry(0.025, 0.55, 0.025),
  };
  return cache;
}
function mat(THREE, color) { return new THREE.MeshLambertMaterial({ color, flatShading: false }); }
function mesh(THREE, geo, material, name) { const m = new THREE.Mesh(geo, material); m.name = name || ""; m.castShadow = true; m.receiveShadow = false; return m; }

// 工廠。opts：variant（PERSON_VARIANTS 之一）、skin、hair、shirt、trousers、shoe、accent（背包、背心、行李箱的顏色）、phase（走路循環的起點）。
export function buildPerson(THREE, opts) {
  const o = opts || {}, G = geos(THREE), variant = PERSON_VARIANTS.includes(o.variant) ? o.variant : "default";
  const M = { skin: mat(THREE, o.skin), hair: mat(THREE, o.hair), shirt: mat(THREE, o.shirt), trousers: mat(THREE, o.trousers), shoe: mat(THREE, o.shoe == null ? o.hair : o.shoe), accent: mat(THREE, o.accent == null ? o.shirt : o.accent) };
  const p = new THREE.Group(); p.name = "person"; p.userData.variant = variant; p.userData.phase = o.phase == null ? Math.random() * 6.28 : o.phase;

  // 軀幹（髖到肩）、脖子、頭、頭髮、臉。上半身掛在 hips 這個群組上，坐姿與重心偏移都轉它。
  const hips = new THREE.Group(); hips.name = "hips"; hips.position.y = D.hipY; p.add(hips);
  const torso = mesh(THREE, G.torso, M.shirt, "torso"); torso.position.y = (D.shoulderY - D.hipY) / 2; hips.add(torso);
  const neck = mesh(THREE, G.neck, M.skin, "neck"); neck.position.y = D.shoulderY - D.hipY + D.neckH / 2 + 0.02; hips.add(neck);
  const headY = D.shoulderY - D.hipY + D.neckH + D.head + 0.03;
  const head = mesh(THREE, G.head, M.skin, "head"); head.position.y = headY; hips.add(head);
  const hair = mesh(THREE, G.hair, M.hair, "hair"); hair.position.y = headY + 0.01; hair.rotation.x = -0.35; hips.add(hair);
  const face = mesh(THREE, G.face, M.skin, "face"); face.position.y = headY; hips.add(face);
  // 手臂：肩是樞紐，上臂穿短袖（衣服色）、前臂膚色、手一顆球。肘再一個樞紐，走路時會彎。
  for (const [name, sx] of [["armL", -1], ["armR", 1]]) {
    const shoulder = new THREE.Group(); shoulder.name = name; shoulder.position.set(sx * (D.torsoW / 2 + 0.04), D.shoulderY - D.hipY - 0.03, 0); shoulder.rotation.z = sx * 0.08;
    const upper = mesh(THREE, G.sleeve, M.shirt, "sleeve"); upper.position.y = -D.upperArm / 2; shoulder.add(upper);
    const elbow = new THREE.Group(); elbow.name = "elbow"; elbow.position.y = -D.upperArm; shoulder.add(elbow);
    const fore = mesh(THREE, G.fore, M.skin, "fore"); fore.position.y = -D.foreArm / 2; elbow.add(fore);
    const hand = mesh(THREE, G.hand, M.skin, name === "armL" ? "handL" : "handR"); hand.position.y = -D.foreArm - 0.02; elbow.add(hand);
    hips.add(shoulder);
  }
  // 腿：髖是樞紐，大腿、膝的樞紐、小腿、鞋。裙裝的人大腿外面罩一個圓錐。
  for (const [name, sx] of [["legL", -1], ["legR", 1]]) {
    const hip = new THREE.Group(); hip.name = name; hip.position.set(sx * 0.09, 0, 0);
    const thigh = mesh(THREE, G.thigh, M.trousers, "thigh"); thigh.position.y = -D.thigh / 2; hip.add(thigh);
    const knee = new THREE.Group(); knee.name = "knee"; knee.position.y = -D.thigh; hip.add(knee);
    const shin = mesh(THREE, G.shin, variant === "skirt" ? M.skin : M.trousers, "shin"); shin.position.y = -D.shin / 2; knee.add(shin);
    const shoe = mesh(THREE, G.shoe, M.shoe, name === "legL" ? "shoeL" : "shoeR"); shoe.position.set(0, -D.shin - 0.02, 0.05); knee.add(shoe);
    hips.add(hip);
  }
  if (variant === "skirt") { const sk = mesh(THREE, G.skirt, M.trousers, "skirt"); sk.position.y = -0.17; hips.add(sk); }
  if (variant === "backpack") { const bp = mesh(THREE, G.pack, M.accent, "backpack"); bp.position.set(0, (D.shoulderY - D.hipY) / 2 + 0.02, -(D.torsoD / 2 + 0.1)); hips.add(bp); }
  if (variant === "crew") {
    const v = mesh(THREE, G.vest, M.accent, "vest"); v.position.y = (D.shoulderY - D.hipY) / 2 - 0.02; hips.add(v);
    for (const side of ["armL", "armR"]) { const hand = p.getObjectByName(side === "armL" ? "handL" : "handR"); const stick = mesh(THREE, G.stick, M.shoe, "paddleStick"); stick.position.y = 0.12; const pad = mesh(THREE, G.paddle, M.accent, "paddle"); pad.position.y = 0.32; hand.add(stick, pad); }
  }
  if (variant === "bag") {
    const bag = new THREE.Group(); bag.name = "bag";
    const body = mesh(THREE, G.bagBody, M.accent, "bagBody"); body.position.y = 0.3; bag.add(body);
    for (const sx of [-0.1, 0.1]) { const rod = mesh(THREE, G.bagRod, M.shoe, "bagRod"); rod.position.set(sx, 0.85, -0.08); bag.add(rod); }
    const h = mesh(THREE, G.bagHandle, M.shoe, "bagHandle"); h.position.set(0, 1.12, -0.08); bag.add(h);
    bag.position.set(0.36, 0, -0.42); bag.rotation.x = -0.3; p.add(bag);
  }
  p.userData.baseY = 0;
  posePerson(p, 0, false);
  return p;
}

// 姿勢。t 是秒，walking 是不是在走。坐著的人（variant seated）髖與膝都彎 90 度、整個人要放在椅面上（呼叫的人給 y）。
// 站著的人微微把重心放一邊、一腳略彎；走路的人腿與手反向擺、後面那條腿的膝彎、手肘彎。
export function posePerson(p, t, walking) {
  const ph = p.userData.phase || 0, hips = p.getObjectByName("hips");
  const L = p.getObjectByName("legL"), R = p.getObjectByName("legR"), kL = L.getObjectByName("knee"), kR = R.getObjectByName("knee");
  const aL = p.getObjectByName("armL"), aR = p.getObjectByName("armR"), eL = aL.getObjectByName("elbow"), eR = aR.getObjectByName("elbow");
  if (p.userData.variant === "seated") {
    hips.rotation.z = 0; L.rotation.x = -Math.PI / 2 + 0.1; R.rotation.x = -Math.PI / 2 + 0.05; kL.rotation.x = Math.PI / 2 - 0.1; kR.rotation.x = Math.PI / 2 - 0.15;
    aL.rotation.x = -0.5; aR.rotation.x = -0.5; eL.rotation.x = -0.9; eR.rotation.x = -0.9;
    p.position.y = p.userData.baseY + Math.sin(t * 1.1 + ph) * 0.006;
    return;
  }
  if (walking) {
    const s = Math.sin(t * 6.5 + ph), c = Math.cos(t * 6.5 + ph);
    L.rotation.x = s * 0.55; R.rotation.x = -s * 0.55;
    kL.rotation.x = Math.max(0, -c) * 0.9; kR.rotation.x = Math.max(0, c) * 0.9;   // 後面那條腿的膝彎
    aL.rotation.x = -s * 0.45; aR.rotation.x = s * 0.45; eL.rotation.x = -0.35; eR.rotation.x = -0.35;
    hips.rotation.z = 0; hips.rotation.y = s * 0.06;
    p.position.y = p.userData.baseY + Math.abs(c) * 0.03;
    return;
  }
  // 站著：重心偏一邊，一腳略彎，手自然下垂微彎，整個人慢慢呼吸。
  const side = ph % 2 < 1 ? 1 : -1;
  hips.rotation.z = side * 0.05; hips.rotation.y = 0;
  L.rotation.x = side > 0 ? 0.08 : 0; R.rotation.x = side > 0 ? 0 : 0.08; kL.rotation.x = side > 0 ? 0.15 : 0; kR.rotation.x = side > 0 ? 0 : 0.15;
  aL.rotation.x = 0.05; aR.rotation.x = -0.05; eL.rotation.x = -0.25; eR.rotation.x = -0.25;
  p.position.y = p.userData.baseY + Math.sin(t * 1.3 + ph) * 0.008;
}
