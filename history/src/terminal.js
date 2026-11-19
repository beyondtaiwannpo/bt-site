// /history/ 航廈裡面的東西，照真的機場分區、照走的順序。
// 不 import three。
import { makeSign } from "./signs.js";
export function buildTerminal(THREE, c) {
  const { mats, P, palette, fonts, T, A, box, cyl, instanced, figure, idleFigs, walkers, textTexture, lam, term, pick } = c;
  const made = [];   // 回給 scene.js 的「每一幀」要做的事（這一支沒有，留著跟 grounds.js 一致）
  const person = (x, z, ry, o) => { const f = figure(mats, o || {}); f.position.set(x, 0, z); f.rotation.y = ry; f.userData.baseY = 0; term.add(f); idleFigs.push(f); return f; };
  const seated = (x, z, ry, o) => { const f = figure(mats, { ...(o || {}), seated: true }); f.position.set(x, 0.3, z); f.rotation.y = ry; f.userData.baseY = 0.3; term.add(f); idleFigs.push(f); return f; };
  // 牌子。
  const sign = makeSign(THREE, { textTexture, lam, P, fonts, parent: term });
  // 吊牌：深藍的板子加兩條吊桿，正面朝 -x（迎著走過來的人）。
  function hanging(x, z, en, zh, arrow) {
    term.add(box(4.4, 1.1, 0.14, mats.navy, x, 4.7, z, false), instanced(new THREE.CylinderGeometry(0.03, 0.03, T.h - 5.9, 5), mats.grey, [[x, 4.7 + 0.55 + (T.h - 5.9) / 2, z - 1.6], [x, 4.7 + 0.55 + (T.h - 5.9) / 2, z + 1.6]], false));
    sign(en, zh, 4.2, 1.0, palette.navy, palette.cream, x - 0.08, 4.7, z, -Math.PI / 2, { arrow });
  }
  // 拉帶欄柱：一串點，柱子加帶子。
  function stanchions(pts, tapeM) {
    const posts = pts.map(([x, z]) => [x, 0.5, z]); term.add(instanced(new THREE.CylinderGeometry(0.05, 0.07, 1.0, 6), mats.grey, posts, false));
    for (let i = 1; i < pts.length; i++) { const [x0, z0] = pts[i - 1], [x1, z1] = pts[i]; const L = Math.hypot(x1 - x0, z1 - z0); const t = box(L, 0.04, 0.04, tapeM || mats.orange, (x0 + x1) / 2, 0.95, (z0 + z1) / 2, false); t.rotation.y = -Math.atan2(z1 - z0, x1 - x0); term.add(t); }
  }
  // 一排連椅：四張一組，面向 face（0 看 +z、π 看 -z），有幾個人坐著。
  const seatLists = { benchA: [], seatT: [], seatO: [], seatN: [], charge: [], chargeLight: [] };
  function seatRow(x0, z, groups, face, sitters) {
    for (let g = 0; g < groups; g++) { const x = x0 + g * 5; seatLists.benchA.push([x, 0.28, z, face]); for (let i = 0; i < 4; i++) [seatLists.seatT, seatLists.seatO, seatLists.seatN][(g + i) % 3].push([x - 1.5 + i, 0.62, z]); if (g % 2 === 1) { seatLists.charge.push([x + 2.5, 0.6, z]); seatLists.chargeLight.push([x + 2.5, 1.22, z]); } }
    for (const [k, i] of (sitters || [])) seated(x0 + k, z + (face ? 0.15 : -0.15), face, { shirt: pick(i) });
  }

  // ═══ A. 陸側大廳（x -40 到 -1）═══
  // 入口。
  {
    const z = T.z0 + 0.5, x0 = -4;   /* 入口在航空公司牆（x -38 到 -14）東邊，之前三道門畫在那面牆的體積裡 */
    for (const dx of [-3.2, 0, 3.2]) { term.add(box(3.0, 3.4, 0.2, mats.navy, x0 + dx, 1.7, z, false)); const g = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 2.9), mats.glass); g.position.set(x0 + dx, 1.6, z + 0.12); term.add(g); }
    term.add(box(10.4, 0.5, 0.3, mats.navy, x0, 3.65, z, false));
    sign("DEPARTURES", "出境大廳", 9.6, 1.6, palette.navy, palette.cream, x0, 5.1, z + 0.2, 0);
    for (const x of [-11.8]) { term.add(box(4.2, 2.3, 0.3, mats.frame, x, 3.0, z, false)); sign("FLIGHT INFORMATION", "航班資訊", 3.8, 1.9, palette.navy, palette.yellow, x, 3.0, z + 0.2, 0, { size: 150 }); }
    // 入口旁：推車停放處（兩排二十台）、行李打包機、兩台 ATM、外幣兌換小亭。
    const carts = []; for (let i = 0; i < 10; i++) carts.push([-38.6 + i * 0.5, 0.5, -31.5], [-38.6 + i * 0.5, 0.5, -29.9]);
    term.add(instanced(new THREE.BoxGeometry(0.7, 0.9, 1.0), mats.grey, carts, false), instanced(new THREE.BoxGeometry(0.7, 0.05, 0.6), mats.navy, carts.map(([x, , z]) => [x, 0.3, z]), false));
    term.add(box(1.6, 1.8, 1.2, mats.teal, -13.5, 0.9, -38.6, false), cyl(0.5, 0.5, 0.3, mats.navy, -13.5, 1.95, -38.6, 10));
    term.add(instanced(new THREE.BoxGeometry(1.0, 1.9, 0.6), mats.teal, [[-17.2, 0.95, -39.2], [-15.9, 0.95, -39.2]], false), instanced(new THREE.BoxGeometry(0.6, 0.5, 0.05), mats.light, [[-17.2, 1.4, -38.88], [-15.9, 1.4, -38.88]], false));
    term.add(box(3.4, 2.8, 2.0, mats.frame, -6, 1.4, -38.5, false)); { const g = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 1.2), mats.glass); g.position.set(-6, 1.5, -37.49); term.add(g); } sign("EXCHANGE", "外幣兌換", 3.2, 0.8, palette.orange, palette.navy, -6, 3.2, -37.48, 0);
    person(-6.2, -36.2, Math.PI, { shirt: pick(3), bag: true }); person(-13.5, -37.2, Math.PI, { shirt: pick(1) });
  }
  // 報到櫃台十二個（x -37 到 -15，每 2 公尺一個）。
  {
    const desks = [], tops = [], screens = [], scales = [], belts = [], poles = [];
    for (let i = 0; i < 12; i++) { const x = -37 + i * 2; desks.push([x, 0.55, -34.5]); tops.push([x, 1.14, -34.5]); screens.push([x + 0.5, 1.7, -33.9]); scales.push([x - 0.5, 0.1, -33.2]); belts.push([x, 0.5, -36.6]); poles.push([x + 0.5, 1.4, -33.9]); }
    term.add(instanced(new THREE.BoxGeometry(1.8, 1.1, 1.2), mats.navy, desks), instanced(new THREE.BoxGeometry(1.9, 0.08, 1.4), mats.cream, tops, false), instanced(new THREE.BoxGeometry(0.6, 0.45, 0.06), mats.dark, screens, false), instanced(new THREE.BoxGeometry(0.6, 0.2, 0.7), mats.grey, scales, false), instanced(new THREE.BoxGeometry(1.6, 0.9, 1.6), mats.grey, belts, false), instanced(new THREE.CylinderGeometry(0.03, 0.03, 0.6, 5), mats.grey, poles, false));
    term.add(box(24.5, 3.2, 0.3, mats.navy, -26, 1.6 + 0.9, T.z0 + 0.5, false), box(24.5, 0.12, 0.34, mats.orange, -26, 4.2, T.z0 + 0.5, false));
    "ABCDEF".split("").forEach((L, i) => sign(L, "", 1.4, 1.4, palette.orange, palette.navy, -36 + i * 4, 5.4, T.z0 + 0.5, 0, { align: "center", size: 520 }));
    sign("CHECK-IN", "報到", 6, 1.2, palette.navy, palette.cream, -24, 7.0, T.z0 + 0.5, 0);
    for (let i = 0; i < 12; i += 2) person(-37 + i * 2, -35.6, 0, { shirt: P.navy, staff: true });
    // 前四個櫃台前面 Z 字形排隊（三折），有九個人在排；後面幾個櫃台是空的，才像真的。
    stanchions([[-38.2, -32.6], [-30.8, -32.6], [-30.8, -31.2], [-38.2, -31.2], [-38.2, -29.8], [-30.8, -29.8]]);
    let k = 7; for (const [x, z] of [[-36.5, -33.3], [-35.3, -33.3], [-32.8, -33.3], [-31.6, -31.9], [-33.6, -31.9], [-36, -31.9], [-37.4, -30.5], [-34.5, -30.5], [-31.8, -30.5]]) person(x, z, z < -32 ? Math.PI : Math.PI / 2, { shirt: pick(k), bag: k % 2 === 0, backpack: k % 3 === 0 }), k++;
    for (const [x, z] of [[-26, -33.4], [-20, -33.4], [-23, -33.4]]) person(x, z, Math.PI, { shirt: pick(k++), bag: true });   /* 三個都貼著櫃台（z -33.4）：旅客沿 z -32.4 走到自己的櫃台，不會撞到人 */
    // 行李託運兩台（x -11、-9）、自助報到機八台（背靠背四組，x -12 到 -6、z -27 與 -25）。
    term.add(instanced(new THREE.BoxGeometry(1.8, 1.1, 1.2), mats.teal, [[-11, 0.55, -34.5], [-9, 0.55, -34.5]]), instanced(new THREE.BoxGeometry(1.9, 0.08, 1.4), mats.cream, [[-11, 1.14, -34.5], [-9, 1.14, -34.5]], false));
    sign("BAG DROP", "行李託運", 3.6, 0.9, palette.teal, palette.cream, -10, 3.0, T.z0 + 0.32, 0);
    const kiosks = []; for (let i = 0; i < 4; i++) kiosks.push([-12 + i * 1.6, 0.75, -27.4], [-12 + i * 1.6, 0.75, -24.6]);
    term.add(instanced(new THREE.BoxGeometry(0.6, 1.5, 0.5), mats.navy, kiosks, false), instanced(new THREE.BoxGeometry(0.5, 0.4, 0.04), mats.light, kiosks.map(([x, , z]) => [x, 1.2, z + (z > -26 ? 0.27 : -0.27)]), false));
    for (const [x, z, ry] of [[-12, -23.6, Math.PI], [-8.8, -23.6, Math.PI], [-10.4, -28.4, 0]]) person(x, z, ry, { shirt: pick(k++), backpack: true });
  }
  // 大廳中央：服務台、看板底下的長凳與抬頭看的人、會面點的柱子。
  {
    term.add(cyl(1.6, 1.6, 1.1, mats.navy, -30, 0.55, -12, 16), cyl(1.75, 1.75, 0.08, mats.cream, -30, 1.14, -12, 16), cyl(0.05, 0.05, 2.4, mats.grey, -30, 2.3, -12, 5), box(0.9, 0.9, 0.08, mats.orange, -30, 3.7, -12, false), box(0.14, 0.5, 0.1, mats.navy, -30, 3.62, -12, false), cyl(0.07, 0.07, 0.08, mats.navy, -30, 4.0, -12, 6));
    sign("INFORMATION", "服務台", 3.4, 0.7, palette.navy, palette.cream, -30, 2.6, -12.06, Math.PI);
    person(-30, -12, 0, { shirt: P.navy, staff: true }); person(-30.4, -10.0, Math.PI, { shirt: pick(2), bag: true });
    const benches = [[-24, 0.28, -15], [-19, 0.28, -15], [-24, 0.28, -27], [-19, 0.28, -27]];
    term.add(instanced(new THREE.BoxGeometry(4.6, 0.12, 0.9), mats.grey, benches), instanced(new THREE.BoxGeometry(4.6, 0.5, 0.8), mats.teal, benches.map(([x, , z]) => [x, 0.62, z])));
    for (const [x, z, i] of [[-25, -15, 0], [-23, -15, 1], [-18, -15, 2], [-24, -27, 3], [-19.5, -27, 4]]) seated(x, z + (z > -20 ? -0.1 : 0.1), z > -20 ? Math.PI : 0, { shirt: pick(i) });
    let k = 20; for (const [x, z] of [[-22, -18.6], [-20.6, -18.2], [-22.8, -21.5], [-19.2, -22]]) person(x, z, Math.PI / 2, { shirt: pick(k++), backpack: k % 2 === 0 });
    // 玻璃牆這一側：便利商店與麵包咖啡店（門面朝 -z），店門口的架子，幾個人。
    for (const [x, front, awn, en, zh] of [[-18, mats.orange, mats.navy, "CONVENIENCE", "便利商店"], [-6, mats.sand, mats.teal, "BAKERY CAFÉ", "麵包咖啡"]]) {
      term.add(box(9, 4, 4, front, x, 2, -3.5), box(9.6, 0.3, 2.2, awn, x, 3.4, -6.4, false));
      sign(en, zh, 6, 1.0, palette.cream, palette.navy, x, 4.6, -5.6, Math.PI);
      term.add(instanced(new THREE.BoxGeometry(0.9, 0.9, 0.5), mats.sand, [[x - 2.6, 0.45, -6.4], [x - 1.4, 0.45, -6.4], [x + 1.4, 0.45, -6.4], [x + 2.6, 0.45, -6.4]], false));
      person(x - 1.6, -8.4, 0, { shirt: pick(k++), bag: true }); person(x + 2.2, -8.0, 0.3, { shirt: pick(k++) });
    }
    // 便利商店門口賣水（2026-11-19 Paul：「turn right to a shop, buy a water」）：架上一排瓶子、牆上的小招牌、架子之間站一位店員；旅客站在 (-18,-8) 面向店。
    term.add(instanced(new THREE.BoxGeometry(0.16, 0.3, 0.16), mats.light, [[-16.9, 1.05, -6.4], [-16.65, 1.05, -6.4], [-16.4, 1.05, -6.4], [-16.15, 1.05, -6.4]], false));
    sign("WATER · SNACKS", "飲料 · 零食", 2.4, 0.5, palette.navy, palette.cream, -18, 2.4, -5.58, Math.PI, { size: 110 });   /* 深藍底：店的牆是橘的，橘底的牌會看不見。z -5.58 在店的牆（-5.5）外面，-5.44 會埋進牆裡 */ person(-18, -6.4, Math.PI, { shirt: pick(k++), staff: true });
    const tables = []; for (const x of [-9, -7, -5, -3]) tables.push([x, 0.72, -9.5]);
    term.add(instanced(new THREE.CylinderGeometry(0.5, 0.5, 0.06, 12), mats.cream, tables, false), instanced(new THREE.CylinderGeometry(0.06, 0.08, 0.72, 6), mats.dark, tables.map(([x, , z]) => [x, 0.36, z]), false), instanced(new THREE.CylinderGeometry(0.22, 0.2, 0.42, 8), mats.teal, tables.flatMap(([x, , z]) => [[x - 0.7, 0.3, z], [x + 0.7, 0.3, z]])));
    seated(-9.7, -9.5, Math.PI / 2, { shirt: pick(1) }); seated(-4.3, -9.5, -Math.PI / 2, { shirt: pick(3) });
    // 植栽島：大廳裡三盆大的（圓盆加樹）。
    for (const [x, z] of [[-37, -27], [-14, -31], [-2, -12]]) term.add(cyl(1.2, 1.3, 0.6, mats.pot, x, 0.3, z, 12), cyl(0.12, 0.14, 2.2, mats.trunk, x, 1.6, z, 6), new THREE.Mesh(new THREE.IcosahedronGeometry(1.4, 0), mats.plant).translateX(x).translateY(3.2).translateZ(z));
  }

  // ═══ B. 安檢前（x -8 到 -1） ═══
  {
    stanchions([[-8, -30.5], [-1.5, -30.5], [-1.5, -28.9], [-8, -28.9], [-8, -27.3], [-1.5, -27.3], [-1.5, -25.7], [-8, -25.7]]);
    stanchions([[-8, -9.5], [-1.5, -9.5], [-1.5, -11.1], [-8, -11.1], [-8, -12.7], [-1.5, -12.7], [-1.5, -14.3], [-8, -14.3]]);
    let k = 30;
    for (const [x, z] of [[-7, -29.7], [-5.6, -29.7], [-3.2, -29.7], [-2.4, -28.1], [-4.8, -28.1], [-7.2, -28.1], [-6, -26.5], [-3, -26.5], [-6.5, -10.3], [-4, -10.3], [-2.6, -11.9], [-5.4, -11.9], [-7, -13.5]]) person(x, z, Math.PI / 2, { shirt: pick(k), bag: k % 2 === 0, backpack: k % 3 === 1 }), k++;
    // 快速通道：牌子、兩根柱子，鏡頭跟旅客從這裡過（z -20 與 -17.5）。
    sign("FAST TRACK", "快速通道", 2.4, 0.6, palette.orange, palette.navy, -3, 3.7, -20.2, -Math.PI / 2);   // 掛高一點（3.7），鏡頭（1.7）從底下過，不會撞進牌子裡
    term.add(cyl(0.04, 0.04, 3.4, mats.grey, -3, 1.7, -22.2, 5), cyl(0.04, 0.04, 3.4, mats.grey, -3, 1.7, -18.2, 5), box(0.06, 0.06, 4.0, mats.grey, -3, 3.4, -20.2, false));
    sign("SECURITY CHECK", "安全檢查", 4.4, 1.0, palette.navy, palette.cream, -9, 5.4, -20.5, -Math.PI / 2);
    term.add(instanced(new THREE.CylinderGeometry(0.03, 0.03, T.h - 7.4, 5), mats.grey, [[-9, 5.9 + (T.h - 7.4) / 2, -22.1], [-9, 5.9 + (T.h - 7.4) / 2, -18.9]], false));
    for (const z of [-31.6, -8.4]) { term.add(cyl(0.04, 0.05, 2.0, mats.grey, -5, 1.0, z, 5)); sign("LIQUIDS 100 ml  ·  LAPTOPS OUT", "液體 100 毫升以下  筆電拿出來", 2.6, 0.7, palette.cream, palette.navy, -5, 2.2, z, z > -20 ? Math.PI : 0, { size: 90 }); }
    // 托盤台（安檢後）與托盤：x 6.5，兩邊各一台；人體掃描門在 z -23 那條。
    for (const z of [-26.2, -14.4]) { term.add(box(4.0, 0.9, 1.0, mats.grey, 7.5, 0.45, z), instanced(new THREE.BoxGeometry(0.5, 0.08, 0.4), mats.grey, Array.from({ length: 6 }, (_, i) => [6 + (i % 3) * 0.6, 0.96 + Math.floor(i / 3) * 0.1, z + 0.2]), false)); }
    term.add(cyl(1.1, 1.1, 2.4, mats.cream, 2.5, 1.2, -23, 12, true), box(1.4, 0.5, 2.0, mats.navy, 2.5, 2.6, -23, false));
    // 安檢區兩側的玻璃隔牆；安檢之後是證照查驗。
    for (const [z0, z1] of [[-40, -31.8], [-8.2, 0]]) term.add(box(0.12, 3.0, z1 - z0, mats.glass, 1.0, 1.5, (z0 + z1) / 2, false), box(0.12, 0.2, z1 - z0, mats.frame, 1.0, 3.05, (z0 + z1) / 2, false));
    for (const [z, oz] of [[-22.8, -0.9], [-17.2, 0.9]]) { term.add(box(2.2, 1.1, 1.4, mats.navy, 11, 0.55, z), box(2.4, 0.08, 1.6, mats.cream, 11, 1.12, z, false), box(0.5, 0.4, 0.06, mats.dark, 11.6, 1.4, z, false)); person(11, z + oz, oz < 0 ? 0 : Math.PI, { shirt: pick(k++), staff: true }); }   /* 在 x 11：托盤台（到 9.5）之後、走道上來回的人的車道（8 與 10 起）之前；官員面向鏡頭那條 */
    sign("IMMIGRATION", "證照查驗", 4.4, 1.0, palette.navy, palette.cream, 11, 5.4, -20.5, -Math.PI / 2);
    term.add(instanced(new THREE.CylinderGeometry(0.03, 0.03, T.h - 7.4, 5), mats.grey, [[11, 5.9 + (T.h - 7.4) / 2, -22.1], [11, 5.9 + (T.h - 7.4) / 2, -18.9]], false));
  }

  // ═══ C. 空側（x 6 到 125）═══
  // 免稅店（x 8 到 26）。
  {
    term.add(box(18, 5, 0.3, mats.navy, 17, 2.5, -39.3, false), box(18.4, 0.3, 9, mats.orange, 17, 5.1, -34.5, false));
    sign("DUTY FREE", "免稅店", 8, 1.6, palette.cream, palette.navy, 17, 6.1, -30.2, 0);
    const shelves = [], goods = [[], [], []]; let n = 0;
    for (const z of [-37.4, -34.6]) for (let x = 10; x <= 24; x += 3.5) { shelves.push([x, 0.8, z]); for (let i = 0; i < 6; i++) goods[n++ % 3].push([x - 1.25 + i * 0.5, 1.75, z + (i % 2) * 0.2 - 0.1]); }
    term.add(instanced(new THREE.BoxGeometry(3, 1.6, 0.7), mats.sand, shelves), ...goods.map((g, i) => instanced(new THREE.BoxGeometry(0.3, 0.32, 0.3), [mats.teal, mats.orange, mats.navy][i], g, false)));
    term.add(instanced(new THREE.BoxGeometry(2.4, 1.0, 0.8), mats.navy, [[11, 0.5, -31.4], [23, 0.5, -31.4]]), instanced(new THREE.BoxGeometry(2.5, 0.06, 0.9), mats.cream, [[11, 1.03, -31.4], [23, 1.03, -31.4]], false));
    for (const x of [8.4, 25.6]) { term.add(box(0.8, 2.6, 0.2, mats.frame, x, 1.6, -31.5, false)); sign("", "", 0.6, 2.2, palette.sand, palette.orange, x, 1.6, -31.38, 0); }
    let k = 44; for (const [x, z, ry] of [[12, -36.0, 0], [15.5, -36.0, 0], [19, -36.0, Math.PI], [22.5, -36.0, 0], [13, -33.2, Math.PI], [17, -33.2, 0], [21, -33.2, Math.PI], [11, -30.4, 0], [23, -30.4, 0], [24.5, -33.2, Math.PI]]) person(x, z, ry, { shirt: pick(k), bag: k % 2 === 1 }), k++;
    person(11, -32.4, 0, { shirt: P.navy, staff: true }); person(23, -32.4, 0, { shirt: P.navy, staff: true });
  }
  // 美食區（x 30 到 44）。
  {
    let k = 60;
    [[32.5, mats.teal, "NOODLES", "麵"], [37, mats.orange, "COFFEE", "咖啡"], [41.5, mats.navy, "BENTO", "便當"]].forEach(([x, m, en, zh]) => {
      term.add(box(4.0, 1.1, 1.2, m, x, 0.55, -37.2), box(4.2, 0.08, 1.4, mats.cream, x, 1.14, -37.2, false), box(3.2, 1.2, 0.1, mats.frame, x, 3.2, -39.2, false));
      sign(en, zh, 3.0, 1.0, palette.navy, palette.yellow, x, 3.2, -39.12, 0);
      person(x, -38.2, 0, { shirt: P.navy, staff: true }); person(x - 0.6, -35.8, Math.PI, { shirt: pick(k++), bag: true });
    });
    term.add(box(14, 0.06, 7.5, mats.navy, 37, 0.03, -31.2, false));   // 一塊深色的地毯框出用餐區
    const tables = [], stools = [];
    for (const x of [31.5, 35, 38.5, 42]) for (const z of [-33.5, -29.5]) { tables.push([x, 0.72, z]); stools.push([x - 0.8, 0.3, z], [x + 0.8, 0.3, z], [x, 0.3, z - 0.8], [x, 0.3, z + 0.8]); }
    term.add(instanced(new THREE.CylinderGeometry(0.55, 0.55, 0.06, 12), mats.cream, tables, false), instanced(new THREE.CylinderGeometry(0.06, 0.08, 0.72, 6), mats.dark, tables.map(([x, , z]) => [x, 0.36, z]), false), instanced(new THREE.CylinderGeometry(0.22, 0.2, 0.42, 8), mats.orange, stools));
    for (const [x, z, ry] of [[30.7, -33.5, Math.PI / 2], [35.8, -33.5, -Math.PI / 2], [38.5, -34.3, 0], [42.8, -29.5, -Math.PI / 2], [31.5, -28.7, Math.PI], [35, -30.3, 0], [41.2, -33.5, Math.PI / 2], [38.5, -28.7, Math.PI]]) seated(x, z, ry, { shirt: pick(k++) });
    sign("FOOD COURT", "美食區", 5, 1.0, palette.orange, palette.navy, 37, 5.6, -33.2, 0);
    term.add(instanced(new THREE.CylinderGeometry(0.03, 0.03, T.h - 7.4, 5), mats.grey, [[35, 6.1 + (T.h - 7.4) / 2, -33.2], [39, 6.1 + (T.h - 7.4) / 2, -33.2]], false));
  }
  // 洗手間兩處（x 46 與 100，靠陸側）。
  for (const x of [46, 100]) {
    term.add(box(3.2, 3.0, 0.6, mats.dark, x, 1.5, -39.2, false), box(4.0, 0.3, 1.2, mats.navy, x, 3.1, -38.9, false));
    term.add(instanced(new THREE.BoxGeometry(0.22, 0.5, 0.05), mats.cream, [[x - 0.8, 2.3, -38.85], [x + 0.8, 2.3, -38.85]], false), instanced(new THREE.SphereGeometry(0.11, 6, 5), mats.cream, [[x - 0.8, 2.72, -38.85], [x + 0.8, 2.72, -38.85]], false), box(0.5, 0.18, 0.05, mats.cream, x + 0.8, 2.2, -38.84, false));
    sign("TOILETS", "洗手間", 2.6, 0.6, palette.navy, palette.cream, x, 3.6, -38.84, 0);
    term.add(cyl(0.3, 0.3, 1.1, mats.grey, x - 2.6, 0.55, -38.8, 8), box(0.4, 0.1, 0.4, mats.teal, x - 2.6, 1.15, -38.8, false));   // 飲水機
  }
  {
    const x = 113; term.add(box(18, 4.6, 0.3, mats.frame, x, 2.3, -33.5), box(18.4, 0.4, 0.6, mats.navy, x, 4.8, -33.5, false));
    const g = new THREE.Mesh(new THREE.PlaneGeometry(17.2, 3.6), lam(P.navy, { transparent: true, opacity: 0.55 })); g.position.set(x, 2.3, -33.3); term.add(g);
    term.add(box(2.4, 3.2, 0.2, mats.navy, x - 5, 1.6, -33.2, false));   // 門
    sign("LOUNGE", "貴賓室", 5, 1.1, palette.navy, palette.yellow, x, 5.8, -33.3, 0);
    term.add(box(2.6, 1.1, 0.9, mats.navy, x - 1.5, 0.55, -31.6), box(2.8, 0.08, 1.1, mats.cream, x - 1.5, 1.14, -31.6, false)); person(x - 1.5, -32.6, 0, { shirt: P.navy, staff: true }); person(x - 5, -31.2, Math.PI, { shirt: pick(5), bag: true });
    for (const dx of [-8, 8]) term.add(cyl(0.6, 0.7, 0.9, mats.pot, x + dx, 0.45, -32.2, 10), cyl(0.07, 0.09, 0.9, mats.trunk, x + dx, 1.3, -32.2, 6), new THREE.Mesh(new THREE.IcosahedronGeometry(0.9, 0), mats.plant).translateX(x + dx).translateY(1.9).translateZ(-32.2));
  }
  // 既有三間店（x 58、72、90）的招牌補字：藥局、服飾、禮品。
  [[58, "PHARMACY", "藥局"], [72, "FASHION", "服飾"], [90, "GIFTS", "禮品"]].forEach(([x, en, zh]) => sign(en, zh, 5.6, 0.9, palette.cream, palette.navy, x, 4.6, -34.27, 0));

  // ═══ D. 登機門（沿玻璃牆）═══
  // 我們那一門是 A（號碼由 setGate 填），其他五門是 B1 到 B5。
  const GATES = [[25, "B1"], [40, "B2"], [58, "B3"], [75, "B4"], [92, "B5"]];
  for (const [x, label] of GATES) {
    term.add(box(3.2, 1.1, 0.8, mats.navy, x, 0.55, -3.0), box(3.4, 0.08, 1.0, mats.cream, x, 1.14, -3.0, false), cyl(0.06, 0.06, 2.6, mats.grey, x + 1.3, 2.3, -3.0, 5), box(1.0, 0.6, 0.06, mats.dark, x - 0.6, 1.44, -2.6, false));
    sign(label, "", 1.2, 1.2, palette.orange, palette.navy, x + 1.3, 3.9, -3.0, Math.PI, { align: "center", size: 520 });
    sign(label, "", 2.2, 2.2, palette.navy, palette.cream, x, 9.6, -0.45, Math.PI, { align: "center", size: 520 });   // 玻璃牆上方的大門號
    term.add(instanced(new THREE.BoxGeometry(0.3, 1.0, 0.8), mats.grey, [[x - 2.4, 0.5, -1.6], [x - 1.4, 0.5, -1.6]], false), instanced(new THREE.BoxGeometry(0.06, 0.3, 0.7), mats.orangeLight, [[x - 2.25, 1.05, -1.6], [x - 1.55, 1.05, -1.6]], false));
    stanchions([[x + 3, -6.5], [x - 3, -6.5], [x - 3, -5.0]], mats.navy);
    person(x - 0.4, -3.9, 0, { shirt: P.navy, staff: true });
    const q = [[x + 2.4, -5.8], [x + 1.2, -5.8], [x - 0.2, -5.8]]; q.forEach(([qx, qz], i) => person(qx, qz, -Math.PI / 2, { shirt: pick(x + i), backpack: i % 2 === 0 }));
  }
  // 我們那一門（登機門櫃台在 airport.js 的 GATE_DESK）。
  // 2026-11-18。
  { const [gx, gz] = A.GATE_DESK; stanchions([[gx + 2.5, gz - 3.6], [gx + 8.5, gz - 3.6], [gx + 8.5, gz - 2.2]], mats.navy); for (let i = 0; i < 4; i++) person(gx + 3.2 + i * 1.2, gz - 2.9, Math.PI / 2, { shirt: pick(90 + i), bag: i % 2 === 1 }); term.add(instanced(new THREE.BoxGeometry(0.3, 1.0, 0.8), mats.grey, [[gx + 4.4, 0.5, gz - 0.2], [gx + 5.4, 0.5, gz - 0.2]], false)); }
  // 座位。
  seatRow(16, -7, 6, 0, [[0, 1], [5.5, 2], [10, 3], [16, 4], [25, 5]]); seatRow(16, -11, 6, Math.PI, [[2, 7], [11.5, 8], [21, 9], [27, 10]]);   /* 六組不是七組：第七組（x 46）把咖啡店的走道封死 */
  seatRow(116, -7, 2, 0, [[1, 11], [6.5, 12]]); seatRow(116, -11, 2, Math.PI, [[3, 14]]);   // 2026-11-18：原本從 104 起四組，鏡頭往登機門的斜線（100,-20 → 106,-14 → 112,-5）會穿過座位，改從 116 起兩組
  seatRow(26, -29, 3, Math.PI, [[0.5, 16], [10, 17]]);   /* 從 26 起不是 16：免稅店門口（x 8 到 26）留空，旅客站在 (17,-31) 看店，走出來不會撞到連椅 */
  term.add(instanced(new THREE.BoxGeometry(5.2, 0.12, 0.9), mats.grey, seatLists.benchA), instanced(new THREE.BoxGeometry(0.8, 0.5, 0.8), mats.teal, seatLists.seatT), instanced(new THREE.BoxGeometry(0.8, 0.5, 0.8), mats.orange, seatLists.seatO), instanced(new THREE.BoxGeometry(0.8, 0.5, 0.8), mats.navy, seatLists.seatN));
  term.add(instanced(new THREE.BoxGeometry(0.3, 1.2, 0.3), mats.navy, seatLists.charge, false), instanced(new THREE.BoxGeometry(0.32, 0.06, 0.32), mats.yellowLight, seatLists.chargeLight, false));
  // 候機區地毯：登機門那一帶鋪深藍的毯子。
  for (const [x, w] of [[33, 40], [80, 44], [113, 20]]) term.add(box(w, 0.04, 9, lam(P.navy.clone().lerp(P.grey, 0.5)), x, 0.02, -9, false));
  // 窗邊吧檯：每十幾公尺一組（避開登機門），三張高腳凳、看飛機的人。
  { let k = 100; for (const x of [18, 33, 50, 67, 84, 100]) { term.add(box(4.0, 0.08, 0.5, mats.cream, x, 1.1, -1.3, false), instanced(new THREE.CylinderGeometry(0.05, 0.05, 1.1, 6), mats.dark, [[x - 1.5, 0.55, -1.3], [x + 1.5, 0.55, -1.3]], false), instanced(new THREE.CylinderGeometry(0.2, 0.18, 0.7, 8), mats.navy, [[x - 1.3, 0.35, -2.1], [x, 0.35, -2.1], [x + 1.3, 0.35, -2.1]], false)); person(x - 1.3, -2.4, 0, { shirt: pick(k++) }); if (x % 2) person(x + 1.3, -2.4, 0, { shirt: pick(k++), backpack: true }); } }
  // 航班資訊柱（雙面螢幕）、回收桶組、每二十公尺一組。
  { const poles = [], scr = [], binsA = [], binsB = [], binsC = []; for (const x of [12, 36, 66, 98]) { poles.push([x, 1.4, -11.2]); scr.push([x, 2.6, -11.2]); binsA.push([x + 1.5, 0.45, -11.2]); binsB.push([x + 2.1, 0.45, -11.2]); binsC.push([x + 2.7, 0.45, -11.2]); }   // z -13 → -11.2（2026-11-18 自查：之前在走的人那條線上）
    term.add(instanced(new THREE.CylinderGeometry(0.08, 0.1, 2.0, 6), mats.grey, poles, false), instanced(new THREE.BoxGeometry(1.2, 0.9, 0.12), mats.dark, scr, false), instanced(new THREE.BoxGeometry(1.1, 0.75, 0.14), mats.light, scr, false));
    term.add(instanced(new THREE.BoxGeometry(0.5, 0.9, 0.5), mats.teal, binsA, false), instanced(new THREE.BoxGeometry(0.5, 0.9, 0.5), mats.orange, binsB, false), instanced(new THREE.BoxGeometry(0.5, 0.9, 0.5), mats.navy, binsC, false)); }
  // 兒童遊戲區（x 104 到 110，靠玻璃）：橘色軟墊、小滑梯、三塊積木、兩個小孩。
  { const x = 120, z = -3.6; /* 原本在 107，鏡頭往門的斜線會穿過遊戲區 */ term.add(box(6, 0.12, 4, mats.orange, x, 0.06, z, false), box(1.2, 1.0, 1.2, mats.teal, x - 1.8, 0.5, z - 0.8), instanced(new THREE.BoxGeometry(0.5, 0.5, 0.5), mats.navy, [[x + 1.2, 0.25, z + 1.0], [x + 1.8, 0.25, z + 1.0], [x + 1.5, 0.75, z + 1.0]], false));
    const sl = box(0.9, 0.08, 2.2, mats.cream, x - 0.4, 0.55, z + 0.5, false); sl.rotation.x = 0.45; term.add(sl);
    for (const [kx, kz, ry] of [[x + 0.6, z - 1.0, 0.8], [x - 2.2, z + 1.3, -2.2]]) { const f = person(kx, kz, ry, { shirt: pick(kx), backpack: true }); f.scale.setScalar(0.68); }
    sign("KIDS", "兒童遊戲區", 2.4, 0.6, palette.orange, palette.navy, x, 2.2, z - 2.0, Math.PI); term.add(cyl(0.04, 0.04, 1.9, mats.grey, x, 0.95, z - 2.1, 5)); }
  // 電動步道（x 60 到 96，z -26）。
  { term.add(box(36, 0.12, 1.6, mats.dark, 78, 0.06, -26, false), box(36, 0.02, 1.4, lam(P.dark.clone().lerp(P.grey, 0.3)), 78, 0.13, -26, false));
    for (const dz of [-1.0, 1.0]) { const g = new THREE.Mesh(new THREE.PlaneGeometry(36, 0.9), mats.glass); g.position.set(78, 0.6, -26 + dz); term.add(g); term.add(box(36, 0.06, 0.06, mats.navy, 78, 1.08, -26 + dz, false)); }
    term.add(instanced(new THREE.BoxGeometry(1.8, 0.4, 0.2), mats.navy, [[59.2, 0.3, -27.1], [59.2, 0.3, -24.9], [96.8, 0.3, -27.1], [96.8, 0.3, -24.9]], false));
    for (const [x0, x1, sp, k] of [[61, 95, 0.55, 1]]) { const f = figure(mats, { shirt: pick(k), bag: k % 2 === 0 }); f.userData.baseY = 0.13; f.userData.w = { x0, x1, z: -26.5, sp, stand: true }; term.add(f); walkers.push(f); } }   /* 步道上只留一個人（旅客也搭這條，三個人會跟他疊） */
  // 柱子上的廣告燈箱（幾塊有顏色方塊的板子）、吊牌（走道上方，每二十幾公尺一組）。
  { const panels = [[8, -30], [38, -10], [68, -30], [98, -10], [-22, -30], [-7, -10]];
    const tex = textTexture(512, 768, palette.cream, [{ text: "BEYOND", x: 256, y: 300, font: `700 110px ${fonts.display}`, color: palette.navy, align: "center" }, { text: "TAIWAN", x: 256, y: 420, font: `700 110px ${fonts.display}`, color: palette.navy, align: "center" }], [{ x: 0, y: 0, w: 512, h: 180, color: palette.orange }, { x: 0, y: 588, w: 512, h: 180, color: palette.teal }]);
    for (const [x, z] of panels) { term.add(box(1.5, 2.3, 0.14, mats.frame, x + 0.65, 2.2, z, false)); const m = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 2.0), lam(P.white, { map: tex })); m.position.set(x + 0.65, 2.2, z + (z > -20 ? -0.08 : 0.08)); m.rotation.y = z > -20 ? Math.PI : 0; term.add(m); } }
  hanging(-34, -20, "CHECK-IN  ·  SECURITY", "報到  ·  安檢", "→"); hanging(-12, -20, "SECURITY", "安檢", "→"); hanging(8, -20, "GATES A · B", "登機門", "→"); hanging(30, -20, "FOOD · TOILETS", "美食區 · 洗手間", "↑"); hanging(70, -20, "GATES B4 · B5 · A", "登機門", "→"); hanging(90, -20, "GATE A · LOUNGE", "登機門 · 貴賓室", "→");
  // 清潔人員兩位（推車）、機組員三位（制服、帽、行李箱）走去登機門、拍照的、牽小孩的。
  { for (const [x, z, ry] of [[44, -31.8, 0.4], [86, -11.4, 2.6]]) { person(x, z, ry, { shirt: P.teal, staff: true }); term.add(box(0.8, 0.9, 0.6, mats.grey, x + 0.8, 0.5, z, false), box(0.1, 1.1, 0.1, mats.grey, x + 0.8, 1.3, z - 0.2, false), cyl(0.18, 0.15, 0.4, mats.orange, x + 0.8, 1.15, z, 8)); }
    for (const [off, k] of [[0, 0], [1.3, 1], [2.6, 2]]) { const f = figure(mats, { shirt: P.navy, staff: true, bag: true }); f.userData.baseY = 0; f.userData.w = { x0: 13 + off, x1: 104 + off, z: -22.6 + (k % 2) * 0.9, sp: 1.25 }; term.add(f); walkers.push(f); }
    person(50, -2.6, 0.2, { shirt: pick(7), backpack: true }); term.add(box(0.2, 0.14, 0.3, mats.dark, 50.1, 1.35, -2.3, false));
    const kid = person(30.5, -26.3, Math.PI / 2, { shirt: pick(8) }); kid.scale.setScalar(0.68); person(29.7, -26.9, Math.PI / 2, { shirt: pick(9), bag: true }); }
  return { tick: null, made };
}
