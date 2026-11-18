// /history/ 航廈裡的第二批細節（2026-11-18 Paul「More detail first」）：三間店做成走得進去的店面、免稅店與美食區補滿、柱子與牆上的裝飾、
// 世界時鐘、布幔、大廳的小亭子、走道兩側的小島、更多在做事的人。清單在 README「歷史之路（2026-11-18 第二批）」。跟 terminal.js 同一招：不 import three、沒有站名、沒有色碼。
import { makeSign } from "./signs.js";
export function buildDecor(THREE, c) {
  const { mats, P, palette, fonts, T, box, cyl, instanced, figure, idleFigs, walkers, textTexture, lam, term, pick } = c;
  const ticks = [];
  const person = (x, z, ry, o) => { const f = figure(mats, o || {}); f.position.set(x, 0, z); f.rotation.y = ry; f.userData.baseY = 0; term.add(f); idleFigs.push(f); return f; };
  const seated = (x, z, ry, o) => { const f = figure(mats, { ...(o || {}), seated: true }); f.position.set(x, 0.3, z); f.rotation.y = ry; f.userData.baseY = 0.3; term.add(f); idleFigs.push(f); return f; };
  const sign = makeSign(THREE, { textTexture, lam, P, fonts, parent: term });
  const whiteM = lam(P.cream.clone().lerp(P.white, 0.6)), woodM = lam(P.sand.clone().lerp(P.orange, 0.25).lerp(P.navy, 0.15)), redM = lam(P.orange.clone().lerp(P.navy, 0.25)), darkFloor = lam(P.navy.clone().lerp(P.grey, 0.55)), tealLight = lam(P.teal, { emissive: P.teal, emissiveIntensity: 0.8 });
  const glassPane = (w, h, x, y, z, ry) => { const g = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mats.glass); g.position.set(x, y, z); g.rotation.y = ry || 0; term.add(g); return g; };
  const smallBox = (w, h, d) => new THREE.BoxGeometry(w, h, d);

  // ═══ 1. 三間店（x 58 藥局、72 服飾、90 禮品）：走得進去的店面 ═══
  // 殼：背牆、兩面側牆、天花板加兩條燈、地板、玻璃門面（中間留 2.4 公尺的門）。招牌與雨棚是既有的（scene.js 的雨棚、terminal.js 的字）。
  function shell(cx, wallM, floorM) {
    term.add(box(9, 4.6, 0.3, wallM, cx, 2.3, -39.4, false), box(0.3, 4.6, 5, wallM, cx - 4.5, 2.3, -37, false), box(0.3, 4.6, 5, wallM, cx + 4.5, 2.3, -37, false));
    term.add(box(9, 0.25, 5, lam(P.ceiling), cx, 4.5, -37, false), instanced(smallBox(3.6, 0.1, 0.4), mats.light, [[cx - 2, 4.33, -36], [cx + 2, 4.33, -36], [cx - 2, 4.33, -38.2], [cx + 2, 4.33, -38.2]], false));
    term.add(box(9, 0.04, 5, floorM, cx, 0.03, -37, false));
    for (const s of [-1, 1]) { glassPane(3.3, 4.2, cx + s * 2.85, 2.1, -34.5); term.add(box(0.12, 4.3, 0.12, mats.frame, cx + s * 1.2, 2.15, -34.5, false), box(0.12, 4.3, 0.12, mats.frame, cx + s * 4.42, 2.15, -34.5, false)); }
    term.add(box(9, 0.12, 0.12, mats.frame, cx, 4.3, -34.5, false));
  }
  // 藥局（x 58）：白色的中島貨架兩座（三色小盒子）、背牆三層架、青色的櫃台加藥師、玻璃上青色的十字、購物籃。
  { const cx = 58; shell(cx, whiteM, whiteM);
    const goods = [[], [], []]; let n = 0;
    for (const gx of [cx - 2, cx + 2]) { term.add(box(2.6, 1.5, 0.8, whiteM, gx, 0.75, -36.3)); for (let i = 0; i < 8; i++) for (const dz of [-0.28, 0.28]) goods[n++ % 3].push([gx - 1.1 + i * 0.32, 1.62, -36.3 + dz]); }
    for (const y of [1.4, 2.2, 3.0]) { term.add(box(8.2, 0.05, 0.4, whiteM, cx, y, -39.0, false)); for (let i = 0; i < 20; i++) goods[n++ % 3].push([cx - 3.9 + i * 0.41, y + 0.16, -39.0]); }
    term.add(...goods.map((g, i) => instanced(smallBox(0.24, 0.28, 0.24), [mats.teal, mats.orange, whiteM][i], g, false)));
    term.add(box(3, 1.0, 0.8, mats.teal, cx + 2.6, 0.5, -38.2), box(3.1, 0.08, 0.9, mats.cream, cx + 2.6, 1.04, -38.2, false), box(0.8, 0.5, 0.06, mats.dark, cx + 3.4, 1.4, -38.3, false));
    term.add(box(0.5, 0.16, 0.06, tealLight, cx + 3.4, 3.3, -34.4, false), box(0.16, 0.5, 0.06, tealLight, cx + 3.4, 3.3, -34.4, false));
    term.add(instanced(smallBox(0.5, 0.3, 0.4), mats.teal, [[cx - 3.8, 0.15, -35.0], [cx - 3.8, 0.45, -35.0], [cx - 3.8, 0.75, -35.0]], false));
    person(cx + 2.6, -38.9, 0, { shirt: P.cream, staff: true }); person(cx + 2.2, -37.3, Math.PI, { shirt: pick(11), bag: true }); person(cx - 2.4, -35.3, 0, { shirt: pick(12) });
  }
  // 服飾（x 72）：兩座衣架（橫桿加六件掛著的衣服）、摺衣桌、兩個人台（白衣、圓底座）、鏡子、橘色的試衣間布簾。
  { const cx = 72; shell(cx, lam(P.wall), darkFloor);
    const shirts = [[], [], [], []]; let n = 0;
    for (const gx of [cx - 2.2, cx + 2.2]) { term.add(instanced(new THREE.CylinderGeometry(0.03, 0.03, 1.5, 5), mats.grey, [[gx - 1.1, 0.75, -36.3], [gx + 1.1, 0.75, -36.3]], false)); const rail = cyl(0.025, 0.025, 2.4, mats.grey, gx, 1.5, -36.3, 5); rail.rotation.z = Math.PI / 2; term.add(rail); for (let i = 0; i < 6; i++) shirts[n++ % 4].push([gx - 1.0 + i * 0.4, 1.12, -36.3]); }
    term.add(...shirts.map((s, i) => instanced(smallBox(0.42, 0.68, 0.06), [mats.navy, mats.teal, mats.orange, whiteM][i], s, false)));
    term.add(box(1.8, 0.8, 1.0, woodM, cx, 0.4, -38.2), instanced(smallBox(0.4, 0.12, 0.5), mats.cream, [[cx - 0.6, 0.86, -38.3], [cx - 0.6, 0.98, -38.3], [cx, 0.86, -38.3], [cx + 0.6, 0.86, -38.3], [cx + 0.6, 0.98, -38.3], [cx + 0.6, 1.1, -38.3]], false));
    for (const s of [-1, 1]) { term.add(cyl(0.38, 0.38, 0.1, whiteM, cx + s * 3.5, 0.05, -35.4, 12)); const m = person(cx + s * 3.5, -35.4, 0, { shirt: P.cream }); m.position.y = 0.1; m.userData.baseY = 0.1; }
    term.add(box(0.9, 2.1, 0.06, mats.navy, cx - 3.4, 1.2, -39.2, false)); glassPane(0.8, 2.0, cx - 3.4, 1.2, -39.15);
    term.add(box(1.4, 2.4, 0.08, mats.orange, cx + 3.7, 1.25, -38.3, false), box(1.6, 0.06, 0.06, mats.grey, cx + 3.7, 2.5, -38.3, false));
    person(cx - 0.4, -37.2, Math.PI, { shirt: pick(13), bag: true }); person(cx + 1.6, -35.6, 0.5, { shirt: pick(14) }); person(cx + 2.2, -38.9, 0, { shirt: P.navy, staff: true });
  }
  // 禮品（x 90）：背牆「TAIWAN 台灣」、茶葉罐牆（三層三色）、中央的鳳梨酥與禮盒展示桌、絨毛玩偶架、明信片旋轉架、天花板吊的燈籠。
  { const cx = 90; shell(cx, mats.navy, woodM);
    sign("TAIWAN", "台灣", 5, 1.1, palette.navy, palette.yellow, cx, 3.7, -39.2, 0, { align: "center" });
    const tins = [[], [], []]; let n = 0;
    for (const y of [1.0, 1.7, 2.4]) { term.add(box(7.6, 0.05, 0.35, woodM, cx, y, -39.0, false)); for (let i = 0; i < 18; i++) tins[n++ % 3].push([cx - 3.5 + i * 0.41, y + 0.18, -39.0]); }
    term.add(...tins.map((g, i) => instanced(new THREE.CylinderGeometry(0.14, 0.14, 0.3, 8), [mats.teal, mats.orange, mats.cream][i], g, false)));
    term.add(box(2.4, 0.7, 1.3, woodM, cx, 0.35, -36.2)); const cakes = [], gifts = [];
    for (let i = 0; i < 5; i++) { cakes.push([cx - 0.9 + i * 0.3, 0.78, -36.6], [cx - 0.9 + i * 0.3, 0.9, -36.6]); gifts.push([cx - 0.8 + i * 0.4, 0.84, -35.9]); }
    term.add(instanced(smallBox(0.26, 0.1, 0.18), mats.yellowLight, cakes, false), instanced(smallBox(0.3, 0.2, 0.3), mats.orange, gifts, false), instanced(smallBox(0.32, 0.03, 0.06), mats.navy, gifts.map(([x, y, z]) => [x, y + 0.11, z]), false));
    term.add(box(0.8, 1.6, 2.4, whiteM, cx - 3.6, 0.8, -37.6)); const plush = [[], [], []]; n = 0; for (let i = 0; i < 5; i++) for (const y of [1.1, 1.75]) plush[n++ % 3].push([cx - 3.2, y, -38.6 + i * 0.5]);
    term.add(...plush.map((g, i) => instanced(new THREE.SphereGeometry(0.2, 7, 6), [mats.teal, mats.orange, mats.cream][i], g, false)));
    term.add(cyl(0.03, 0.03, 1.7, mats.grey, cx + 3.2, 0.85, -35.8, 5), cyl(0.3, 0.3, 0.04, mats.grey, cx + 3.2, 0.02, -35.8, 10)); const cards = []; for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; cards.push([cx + 3.2 + Math.cos(a) * 0.22, 0.9 + (i % 2) * 0.45, -35.8 + Math.sin(a) * 0.22, -a]); }
    term.add(instanced(smallBox(0.02, 0.36, 0.26), mats.cream, cards, false));
    const lanterns = []; for (let i = 0; i < 6; i++) lanterns.push([cx - 3.5 + i * 1.4, 3.85, -36.4]);
    term.add(instanced(new THREE.SphereGeometry(0.24, 8, 6), mats.orangeLight, lanterns, false), instanced(new THREE.CylinderGeometry(0.01, 0.01, 0.4, 4), mats.grey, lanterns.map(([x, y, z]) => [x, y + 0.4, z]), false), instanced(new THREE.CylinderGeometry(0.03, 0.03, 0.14, 6), mats.yellowLight, lanterns.map(([x, y, z]) => [x, y - 0.3, z]), false));
    person(cx - 2.2, -36.0, 0.6, { shirt: pick(15), bag: true }); person(cx + 1.2, -37.4, Math.PI, { shirt: pick(16) }); person(cx + 2.8, -38.6, 0, { shirt: P.navy, staff: true });
  }

  // ═══ 2. 免稅店（x 8 到 26）補：兩面側牆、背牆的酒牆（三層、三色瓶子、每層一條燈）、兩座香水玻璃櫃、購物籃、吊著的「TAX FREE」牌、天花板燈條 ═══
  { term.add(box(0.3, 5, 8.6, mats.navy, 8, 2.5, -35.0, false), box(0.3, 5, 8.6, mats.navy, 26, 2.5, -35.0, false));
    const bottles = [[], [], []]; let n = 0;
    for (const y of [1.3, 2.1, 2.9]) { term.add(box(15.6, 0.06, 0.45, mats.cream, 17, y, -38.9, false), box(15.4, 0.04, 0.08, mats.light, 17, y - 0.06, -38.7, false)); for (let i = 0; i < 34; i++) bottles[n++ % 3].push([9.6 + i * 0.44, y + 0.24, -38.9]); }
    term.add(...bottles.map((b, i) => instanced(new THREE.CylinderGeometry(0.075, 0.09, 0.42, 6), [mats.teal, mats.orange, mats.navy][i], b, false)));
    for (const x of [14.5, 19.5]) { term.add(box(1.8, 0.9, 0.8, mats.navy, x, 0.45, -31.6)); const g = box(1.8, 0.9, 0.8, mats.glass, x, 1.35, -31.6, false); term.add(g); term.add(instanced(smallBox(0.12, 0.2, 0.12), mats.yellowLight, Array.from({ length: 8 }, (_, i) => [x - 0.6 + (i % 4) * 0.4, 1.05, -31.8 + Math.floor(i / 4) * 0.4]), false)); }
    term.add(instanced(smallBox(0.5, 0.3, 0.4), mats.orange, [[9.0, 0.15, -30.5], [9.0, 0.45, -30.5], [9.0, 0.75, -30.5], [9.0, 1.05, -30.5]], false));
    for (const x of [12, 17.5, 23]) { sign("TAX FREE", "免稅", 1.4, 0.5, palette.yellow, palette.navy, x, 3.9, -35.9, 0, { both: true }); term.add(cyl(0.01, 0.01, 0.9, mats.grey, x, 4.6, -35.9, 4)); }
    term.add(instanced(smallBox(5, 0.1, 0.5), mats.light, [[11.5, 4.9, -37.6], [17, 4.9, -37.6], [22.5, 4.9, -37.6], [11.5, 4.9, -33.4], [17, 4.9, -33.4], [22.5, 4.9, -33.4]], false));
    person(14.5, -30.4, 0, { shirt: pick(17), bag: true }); person(19.8, -30.6, 0.3, { shirt: pick(18) });
  }

  // ═══ 3. 美食區（x 30 到 44）補：每一攤一台飲料冰箱（玻璃門、三色罐子）、櫃台上的玻璃展示櫃（麵包）、桌子上方的吊燈、珍珠奶茶攤、回收餐盤台、調味料台、麵攤的蒸氣 ═══
  { for (const x of [32.5, 37, 41.5]) {
      term.add(box(0.9, 2.0, 0.7, mats.grey, x + 1.9, 1.0, -38.7)); glassPane(0.8, 1.7, x + 1.9, 1.05, -38.34); const cans = [[], [], []]; let n = 0; for (const y of [0.45, 0.95, 1.45]) for (let i = 0; i < 4; i++) cans[n++ % 3].push([x + 1.6 + i * 0.2, y, -38.6]);
      term.add(...cans.map((g, i) => instanced(new THREE.CylinderGeometry(0.06, 0.06, 0.16, 6), [mats.teal, mats.orange, mats.navy][i], g, false)));
      term.add(box(1.2, 0.5, 0.5, mats.glass, x - 1.1, 1.43, -37.2, false), instanced(new THREE.SphereGeometry(0.11, 6, 5), mats.sand, [[x - 1.4, 1.3, -37.3], [x - 1.1, 1.3, -37.3], [x - 0.8, 1.3, -37.3], [x - 1.25, 1.3, -37.05], [x - 0.95, 1.3, -37.05]], false));
    }
    const lamps = []; for (const x of [31.5, 35, 38.5, 42]) for (const z of [-33.5, -29.5]) lamps.push([x, 2.7, z]);
    term.add(instanced(new THREE.ConeGeometry(0.32, 0.3, 10, 1, true), mats.orange, lamps, false), instanced(new THREE.SphereGeometry(0.07, 6, 5), mats.yellowLight, lamps.map(([x, y, z]) => [x, y - 0.1, z]), false), instanced(new THREE.CylinderGeometry(0.01, 0.01, T.h - 3.6, 4), mats.grey, lamps.map(([x, , z]) => [x, 2.85 + (T.h - 3.6) / 2, z]), false));
    // 珍珠奶茶攤（x 28.3，免稅店與麵攤之間）：橘色的攤、杯子、招牌、一個老闆、一個客人。
    term.add(box(2.4, 1.1, 1.2, mats.orange, 28.3, 0.55, -37.2), box(2.6, 0.08, 1.4, mats.cream, 28.3, 1.14, -37.2, false), box(2.6, 1.2, 0.1, mats.frame, 28.3, 3.2, -39.2, false));
    sign("BUBBLE TEA", "珍珠奶茶", 2.4, 1.0, palette.orange, palette.navy, 28.3, 3.2, -39.12, 0, { size: 150 });
    term.add(instanced(new THREE.CylinderGeometry(0.07, 0.06, 0.2, 7), mats.teal, Array.from({ length: 6 }, (_, i) => [27.5 + i * 0.3, 1.28, -36.8]), false));
    person(28.3, -38.2, 0, { shirt: P.navy, staff: true }); person(28.0, -35.8, Math.PI, { shirt: pick(19) });
    // 回收餐盤台（x 44.6）與調味料台（x 29.8）。
    term.add(box(1.2, 1.0, 0.6, mats.grey, 44.6, 0.5, -30.0), box(1.2, 0.06, 0.6, mats.navy, 44.6, 1.03, -30.0, false)); sign("TRAY RETURN", "回收餐盤", 1.2, 0.5, palette.navy, palette.cream, 44.6, 1.5, -30.3, Math.PI, { size: 120 });
    term.add(box(0.8, 1.0, 0.5, mats.cream, 29.8, 0.5, -30.0), instanced(new THREE.CylinderGeometry(0.04, 0.04, 0.16, 6), mats.orange, [[29.6, 1.08, -30.1], [29.8, 1.08, -30.1], [30.0, 1.08, -30.1], [29.7, 1.08, -29.9], [29.9, 1.08, -29.9]], false));
    // 麵攤的蒸氣：五顆半透明的小球往上飄、越高越小（會動，所以整組標 dynamic，mergeStatic 不會把它們合掉）。
    const steam = new THREE.Group(); steam.userData.dynamic = true; steam.position.set(32.5, 1.4, -37.6); term.add(steam); const steamM = lam(P.cloud, { transparent: true, opacity: 0.45, depthWrite: false });
    const puffs = Array.from({ length: 5 }, (_, i) => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.16, 6, 5), steamM); m.castShadow = false; steam.add(m); return m; });
    ticks.push(t => puffs.forEach((m, i) => { const u = (t * 0.35 + i * 0.2) % 1; m.position.set(Math.sin(t + i) * 0.15 + (i - 2) * 0.12, u * 1.1, Math.cos(t * 0.7 + i) * 0.1); m.scale.setScalar(0.4 + u * 1.1); }));
  }

  // ═══ 4. 柱子：指標帶（深藍的環）、每兩根一塊登機門的指標、陸側那排的滅火器、空側那排的監視器、每根一個喇叭 ═══
  { const cols = []; for (let x = T.x0 + 5; x < T.x1; x += 15) cols.push([x, -30], [x, -10]);
    term.add(instanced(smallBox(1.4, 0.7, 1.4), mats.navy, cols.map(([x, z]) => [x, 2.75, z]), false));
    term.add(instanced(smallBox(0.22, 0.4, 0.22), mats.dark, cols.map(([x, z]) => [x + 0.5, 6.0, z + 0.5]), false));
    cols.forEach(([x, z], i) => { if (i % 2 === 0) sign("GATES", "登機門", 1.3, 0.5, palette.navy, palette.yellow, x, 2.75, z + (z > -20 ? -0.72 : 0.72), z > -20 ? Math.PI : 0, { arrow: "→", size: 110 }); });
    term.add(instanced(new THREE.CylinderGeometry(0.09, 0.09, 0.5, 8), redM, cols.filter(([, z]) => z < -20).map(([x, z]) => [x + 0.7, 0.9, z]), false), instanced(smallBox(0.3, 0.7, 0.2), mats.cream, cols.filter(([, z]) => z < -20).map(([x, z]) => [x + 0.7, 0.9, z - 0.2]), false));
    term.add(instanced(smallBox(0.32, 0.14, 0.14), mats.dark, cols.filter(([, z]) => z > -20).map(([x, z]) => [x - 0.6, 5.2, z - 0.1, 0.6]), false), instanced(new THREE.CylinderGeometry(0.05, 0.05, 0.3, 6), mats.grey, cols.filter(([, z]) => z > -20).map(([x, z]) => [x - 0.5, 5.4, z]), false));
  }

  // ═══ 5. 牆上：世界時鐘（照現在的時間算五個城市）、壁畫、置物櫃、育嬰室、出口燈 ═══
  { const fmt = tz => { try { return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: tz }).format(new Date()); } catch (e) { return "--:--"; } };
    const cities = [["TAIPEI", "Asia/Taipei"], ["TOKYO", "Asia/Tokyo"], ["LONDON", "Europe/London"], ["NEW YORK", "America/New_York"], ["LOS ANGELES", "America/Los_Angeles"]];
    const W = 1024, H = 160, lines = [], rects = [];
    cities.forEach(([name, tz], i) => { const x = 20 + i * 200; rects.push({ x: x - 8, y: 20, w: 184, h: 120, color: palette.navy }); lines.push({ text: name, x: x + 84, y: 52, font: `700 26px ${fonts.display}`, color: palette.yellow, align: "center" }, { text: fmt(tz), x: x + 84, y: 104, font: `700 58px ${fonts.display}`, color: palette.cream, align: "center" }); });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(9, 9 * H / W), lam(P.white, { map: textTexture(W, H, palette.grey, lines, rects) })); m.position.set(49, 7.3, -39.6); m.castShadow = false; term.add(m);
    sign("WORLD CLOCK", "世界時間", 3, 0.6, palette.navy, palette.cream, 49, 8.5, -39.6, 0, { align: "center" });
    // 壁畫（x 81，服飾與禮品之間）：幾塊深藍的樓、一個橘色的太陽、青色的海，加「WELCOME 歡迎」。
    const art = [{ x: 0, y: 360, w: 1024, h: 100, color: palette.teal }, { x: 60, y: 200, w: 70, h: 160, color: palette.navy }, { x: 150, y: 120, w: 60, h: 240, color: palette.navy }, { x: 230, y: 240, w: 90, h: 120, color: palette.navy }, { x: 340, y: 60, w: 50, h: 300, color: palette.navy }, { x: 420, y: 180, w: 80, h: 180, color: palette.navy }, { x: 760, y: 60, w: 120, h: 120, color: palette.orange }, { x: 560, y: 220, w: 100, h: 140, color: palette.navy }, { x: 700, y: 260, w: 140, h: 100, color: palette.navy }, { x: 880, y: 160, w: 60, h: 200, color: palette.navy }];
    const mural = new THREE.Mesh(new THREE.PlaneGeometry(8, 3.6), lam(P.white, { map: textTexture(1024, 460, palette.cream, [{ text: "WELCOME", x: 512, y: 410, font: `700 60px ${fonts.display}`, color: palette.navy, align: "center" }], art) })); mural.position.set(81, 3.0, -39.6); mural.castShadow = false; term.add(mural);
    term.add(box(8.3, 3.9, 0.08, mats.navy, 81, 3.0, -39.66, false));
    // 置物櫃（x 65，藥局與服飾之間）：一座灰櫃加三十二個門（深藍與青交錯）。
    term.add(box(4, 2.2, 0.5, mats.grey, 65, 1.1, -39.3)); const doors = [[], []]; for (let i = 0; i < 8; i++) for (let j = 0; j < 4; j++) doors[(i + j) % 2].push([63.25 + i * 0.5, 0.3 + j * 0.52, -39.02]);
    term.add(instanced(smallBox(0.44, 0.46, 0.04), mats.navy, doors[0], false), instanced(smallBox(0.44, 0.46, 0.04), mats.teal, doors[1], false)); sign("LOCKERS", "置物櫃", 2.4, 0.6, palette.navy, palette.cream, 65, 2.6, -39.3, 0);
    // 育嬰室（x 96.5）、出口燈（x 50 與 95 的門上方）。
    term.add(box(1.6, 2.4, 0.2, mats.teal, 96.5, 1.2, -39.5, false)); sign("BABY CARE", "育嬰室", 1.8, 0.5, palette.teal, palette.cream, 96.5, 2.7, -39.5, 0, { size: 120 });
    for (const x of [50, 95, -39.2]) { const w = x < -30; sign("EXIT", "出口", 1.0, 0.4, palette.teal, palette.cream, x, 3.5, w ? -6 : -39.5, w ? Math.PI / 2 : 0, { size: 150, align: "center" }); }
  }

  // ═══ 6. 天花板垂下的布幔（五條，橘青藍輪流，「WELCOME 歡迎」）；大廳的 SIM 卡亭、旅遊資訊架、會面點、地上的圓徽；西牆的置物櫃 ═══
  { [[20, palette.orange], [44, palette.teal], [64, palette.navy], [86, palette.orange], [110, palette.teal]].forEach(([x, bg]) => { sign("WELCOME", "歡迎", 1.2, 4.0, bg, palette.cream, x, 8.6, -4.6, Math.PI / 2, { align: "center", size: 170, both: true }); term.add(box(0.06, 0.06, 1.3, mats.grey, x, 10.65, -4.6, false)); });
    term.add(box(2.4, 2.4, 1.6, mats.teal, -28, 1.2, -4.2), box(2.6, 0.3, 1.8, mats.navy, -28, 2.55, -4.2, false)); sign("SIM CARD", "電信", 2.2, 0.7, palette.navy, palette.cream, -28, 2.55, -5.11, Math.PI, { size: 130 }); glassPane(2.0, 0.9, -28, 1.6, -5.02); person(-28, -3.6, Math.PI, { shirt: P.navy, staff: true }); person(-27.6, -6.4, 0, { shirt: pick(21), backpack: true });
    term.add(box(1.0, 1.5, 0.4, mats.grey, -34, 0.75, -6)); const bro = [[], [], [], []]; let n = 0; for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) bro[n++ % 4].push([-34.36 + i * 0.24, 0.45 + j * 0.3, -5.78]);
    term.add(...bro.map((b, i) => instanced(smallBox(0.2, 0.26, 0.03), [mats.orange, mats.teal, mats.navy, mats.cream][i], b, false))); sign("TOURIST INFO", "旅遊資訊", 1.1, 0.4, palette.orange, palette.navy, -34, 1.7, -5.78, 0, { size: 110 });
    term.add(cyl(0.05, 0.05, 2.8, mats.grey, -14, 1.4, -16, 5)); sign("MEETING POINT", "會面點", 1.8, 0.55, palette.orange, palette.navy, -14, 2.9, -16, 0, { size: 120, both: true });
    term.add(cyl(2.2, 2.2, 0.03, mats.navy, -18, 0.015, -20, 32), cyl(2.35, 2.35, 0.02, mats.orange, -18, 0.012, -20, 32)); sign("TERMINAL", "航廈", 3.0, 1.0, palette.navy, palette.cream, -18, 0.04, -20, Math.PI / 2, { flat: true, align: "center" });
    term.add(box(0.5, 2.2, 4, mats.grey, -39.4, 1.1, -14)); const d2 = [[], []]; for (let i = 0; i < 8; i++) for (let j = 0; j < 4; j++) d2[(i + j) % 2].push([-39.12, 0.3 + j * 0.52, -15.75 + i * 0.5, Math.PI / 2]);
    term.add(instanced(smallBox(0.44, 0.46, 0.04), mats.navy, d2[0], false), instanced(smallBox(0.44, 0.46, 0.04), mats.teal, d2[1], false));
  }

  // ═══ 7. 人：推推車的旅客兩位（推車是人的孩子物件，跟著走）、坐輪椅的加推的人、三個人站著聊天兩組、巡邏的兩位 ═══
  // 行李推車（2026-11-18 Paul「why is there a box in front of this person」：之前是一個灰盒子）：底盤、四根細柱、上層的籃框、推把、四個輪子、一個橫放的橘色行李箱。
  { const trolley = f => { const g = new THREE.Group(); g.userData.dynamic = true;
      g.add(box(0.62, 0.04, 0.95, mats.grey, 0, 0.18, 0.8, false), box(0.62, 0.04, 0.5, mats.grey, 0, 0.72, 0.62, false), box(0.62, 0.04, 0.04, mats.grey, 0, 1.0, 0.36, false));
      g.add(instanced(smallBox(0.03, 0.9, 0.03), mats.grey, [[-0.29, 0.6, 0.38], [0.29, 0.6, 0.38], [-0.29, 0.45, 1.24], [0.29, 0.45, 1.24]], false), instanced(smallBox(0.03, 0.03, 0.9), mats.grey, [[-0.29, 0.95, 0.8], [0.29, 0.95, 0.8]], false));
      const wg = new THREE.CylinderGeometry(0.07, 0.07, 0.04, 8); wg.rotateZ(Math.PI / 2);
      g.add(instanced(wg, mats.dark, [[-0.3, 0.07, 0.42], [0.3, 0.07, 0.42], [-0.3, 0.07, 1.2], [0.3, 0.07, 1.2]], false));
      g.add(box(0.5, 0.26, 0.7, mats.orange, 0, 0.35, 0.8, false), box(0.52, 0.03, 0.1, mats.navy, 0, 0.49, 0.8, false)); f.add(g); f.userData.stroller = true; };
    for (const [x0, x1, z, sp, k] of [[-36, 20, -24.6, 0.85, 22], [40, 118, -15.4, 0.8, 23]]) { const f = figure(mats, { shirt: pick(k), bag: true }); f.userData.baseY = 0; f.userData.w = { x0, x1, z, sp }; trolley(f); term.add(f); walkers.push(f); }
    { const f = figure(mats, { shirt: P.navy, staff: true }); f.userData.baseY = 0; f.userData.w = { x0: 100, x1: 0, z: -14.0, sp: 0.75 }; // 輪椅（2026-11-18 Paul「wheelchair people backward」）：大輪在後面（推的人那一側）、小輪在前面、椅背在後、腳踏板在前，坐的人臉朝前，推的人兩手往前推。
      const g = new THREE.Group(); g.userData.dynamic = true; g.add(box(0.56, 0.08, 0.5, mats.navy, 0, 0.5, 0.85, false), box(0.56, 0.55, 0.08, mats.navy, 0, 0.82, 0.58, false), box(0.5, 0.05, 0.14, mats.grey, 0, 0.12, 1.22, false), instanced(smallBox(0.04, 0.04, 0.5), mats.grey, [[-0.3, 0.72, 0.85], [0.3, 0.72, 0.85]], false));
      for (const s of [-1, 1]) { const w = cyl(0.3, 0.3, 0.05, mats.dark, s * 0.34, 0.3, 0.62, 12); w.rotation.z = Math.PI / 2; g.add(w); const c = cyl(0.08, 0.08, 0.04, mats.dark, s * 0.24, 0.08, 1.18, 8); c.rotation.z = Math.PI / 2; g.add(c); }
      const r = figure(mats, { shirt: pick(24), seated: true }); r.position.set(0, 0.28, 0.85); r.userData.baseY = 0.28; g.add(r); idleFigs.push(r); f.add(g); f.userData.stroller = true; term.add(f); walkers.push(f); }
    for (const [cx, cz, k] of [[26, -16, 25], [85, -24, 28]]) for (let i = 0; i < 3; i++) { const a = i * 2.1 + 0.3; person(cx + Math.cos(a) * 0.75, cz + Math.sin(a) * 0.75, Math.atan2(-Math.cos(a), -Math.sin(a)), { shirt: pick(k + i), backpack: i === 1 }); }
    for (const [x0, x1, z, sp] of [[-30, 118, -25.2, 0.7], [-30, 118, -26.0, 0.7]]) { const f = figure(mats, { shirt: P.navy, staff: true }); f.userData.baseY = 0; f.userData.w = { x0, x1, z, sp }; term.add(f); walkers.push(f); }
  }
  // ═══ 8. 走道兩側的小島（鏡頭走 z -20，這些放在 z -25.5 與 -14.5）：書報攤、花店推車、充電桌、拍貼機、按摩椅；天花板一串紙飛機慢慢轉 ═══
  { // 書報攤（x 15，z -25.5）：圓的攤、雜誌架三面、老闆。
    term.add(cyl(1.3, 1.3, 1.0, mats.navy, 15, 0.5, -25.5, 12), cyl(1.4, 1.4, 0.08, mats.cream, 15, 1.04, -25.5, 12), cyl(1.6, 1.6, 0.12, mats.orange, 15, 3.0, -25.5, 12), cyl(0.05, 0.05, 2.0, mats.grey, 15, 2.0, -25.5, 5));
    const mags = [[], [], []]; let n = 0; for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; mags[n++ % 3].push([15 + Math.cos(a) * 1.32, 1.3 + (i % 2) * 0.35, -25.5 + Math.sin(a) * 1.32, -a]); }
    term.add(...mags.map((g, i) => instanced(smallBox(0.03, 0.3, 0.22), [mats.orange, mats.teal, mats.cream][i], g, false))); sign("NEWS", "書報", 1.6, 0.5, palette.orange, palette.navy, 15, 3.0, -24.6, 0, { align: "center", size: 150 }); person(15, -25.5, 0, { shirt: P.navy, staff: true }); person(16.9, -24.0, Math.PI + 0.6, { shirt: pick(30) });
    // 花店推車（x 50，z -14.5）：木推車、三色的花、兩盆高的。
    term.add(box(2.2, 0.9, 1.1, woodM, 50, 0.6, -14.5), instanced(new THREE.CylinderGeometry(0.3, 0.3, 0.1, 8), mats.dark, [[49.3, 0.3, -14.5], [50.7, 0.3, -14.5]], false), box(2.4, 0.08, 1.4, mats.teal, 50, 2.3, -14.5, false), instanced(new THREE.CylinderGeometry(0.03, 0.03, 1.2, 4), mats.grey, [[49, 1.7, -15], [51, 1.7, -15], [49, 1.7, -14], [51, 1.7, -14]], false));
    const fl = [[], [], []]; n = 0; for (let i = 0; i < 12; i++) fl[n++ % 3].push([49.2 + (i % 6) * 0.32, 1.25 + Math.floor(i / 6) * 0.15, -14.8 + Math.floor(i / 6) * 0.5]);
    term.add(...fl.map((g, i) => instanced(new THREE.SphereGeometry(0.13, 6, 5), [mats.orangeLight, mats.yellowLight, mats.cream][i], g, false)), instanced(new THREE.CylinderGeometry(0.02, 0.02, 0.5, 4), mats.plant, fl.flat().map(([x, y, z]) => [x, y - 0.2, z]), false));
    sign("FLOWERS", "花店", 1.6, 0.5, palette.teal, palette.cream, 50, 2.0, -15.26, Math.PI, { align: "center", size: 150 }); person(51.6, -13.4, -Math.PI / 2, { shirt: pick(31), bag: true });
    // 充電桌（x 65，z -25.5）：高桌、四張高腳凳、桌上的充電孔與三支手機、兩個人坐著滑。
    term.add(box(2.6, 0.08, 0.9, whiteM, 65, 1.1, -25.5, false), instanced(new THREE.CylinderGeometry(0.05, 0.05, 1.1, 6), mats.dark, [[64, 0.55, -25.5], [66, 0.55, -25.5]], false), instanced(new THREE.CylinderGeometry(0.2, 0.18, 0.7, 8), mats.teal, [[64.2, 0.35, -26.4], [65.8, 0.35, -26.4], [64.2, 0.35, -24.6], [65.8, 0.35, -24.6]], false));
    term.add(instanced(smallBox(0.1, 0.02, 0.18), mats.dark, [[64.3, 1.15, -25.7], [65.1, 1.15, -25.3], [65.9, 1.15, -25.6]], false), box(0.5, 0.12, 0.2, mats.navy, 65, 1.2, -25.5, false), instanced(new THREE.SphereGeometry(0.04, 5, 4), mats.yellowLight, [[64.85, 1.28, -25.5], [65.15, 1.28, -25.5]], false));
    { const a = seated(64.2, -26.6, 0, { shirt: pick(32) }); a.position.y = 0.65; a.userData.baseY = 0.65; const b = seated(65.8, -24.4, Math.PI, { shirt: pick(33), backpack: true }); b.position.y = 0.65; b.userData.baseY = 0.65; }
    // 拍貼機（x 80，z -14.5）：橘色的亭子、簾子、燈箱；按摩椅兩張（x 95，z -25.5）。
    term.add(box(1.8, 2.3, 1.6, mats.orange, 80, 1.15, -14.5), box(0.8, 1.8, 0.05, mats.navy, 80, 1.0, -15.33, false), box(1.6, 0.4, 0.1, mats.light, 80, 2.0, -15.36, false)); sign("PHOTO", "拍貼", 1.5, 0.4, palette.navy, palette.cream, 80, 2.48, -15.33, Math.PI, { align: "center", size: 150 }); person(79.2, -16.4, 0.3, { shirt: pick(34) });
    for (const x of [94, 96]) { term.add(box(0.9, 0.5, 1.4, mats.navy, x, 0.4, -25.5), box(0.9, 1.0, 0.3, mats.navy, x, 1.1, -26.2, false), instanced(smallBox(0.22, 0.5, 0.9), mats.teal, [[x - 0.4, 0.75, -25.4], [x + 0.4, 0.75, -25.4]], false)); }
    { const m = seated(94, -25.4, 0, { shirt: pick(35) }); m.position.y = 0.6; m.userData.baseY = 0.6; } sign("MASSAGE", "按摩椅", 1.2, 0.4, palette.teal, palette.cream, 95, 1.9, -26.3, 0, { align: "center", size: 150 }); term.add(cyl(0.03, 0.03, 1.8, mats.grey, 95, 0.9, -26.4, 4));
    // 天花板的紙飛機（x 30 到 60，z -27 與 -13）：十二架奶油色的紙飛機吊著，各自慢慢轉。
    const planes = new THREE.Group(); planes.userData.dynamic = true; term.add(planes); const pg = new THREE.ConeGeometry(0.25, 1.2, 3); pg.rotateX(Math.PI / 2);
    const arr = []; for (let i = 0; i < 12; i++) { const m = new THREE.Mesh(pg, mats.cream); m.castShadow = false; m.position.set(30 + (i % 6) * 6, 7.5 + (i % 3) * 0.8, i < 6 ? -27 : -13); planes.add(m); arr.push(m); const w = cyl(0.01, 0.01, T.h - 1 - m.position.y, mats.grey, m.position.x, (T.h - 1 + m.position.y) / 2, m.position.z, 3); w.castShadow = false; term.add(w); }
    ticks.push(t => arr.forEach((m, i) => { m.rotation.y = t * 0.4 + i; m.rotation.z = Math.sin(t * 0.8 + i) * 0.15; }));
  }
  return { tick: t => { for (const f of ticks) f(t); } };
}
