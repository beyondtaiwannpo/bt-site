// /island/ 的 3D 場景：這一頁長什麼樣。引擎（圓角盒子、七色、地面、建築、人、橋、鏡頭、牌子、每一幀的迴圈）在 shared/toy.js，
// 2026-11-17 從這裡抽出去跟 /history/ 共用（Paul：「Yes, shared file」）。這裡只剩：哪座島在哪（layout.js）、島上放什麼（teams.json）、牌子怎麼排、點了怎麼辦。
//
// ── 守的四件事 ──
// 1. 資料與場景分開：哪些 team、做什麼、誰，全部從 main.js 丟進來（teams.json）。這裡沒有任何一個 team 的字。
// 2. Three 只有 shared/toy.js 與這一支 import。載不到整支載不進來，main.js 接住只留清單。
// 3. 會動的東西全部在引擎的 motion() 裡。開了減少動態效果 main.js 不呼叫它，畫面改一次畫一次。
// 4. 顏色七色進來混色出去，這裡沒有色碼。
import * as THREE from "three";
import * as T from "../../shared/toy.js";
import * as L from "./layout.js";
import { buildRides } from "./rides.js";
import { buildLife } from "./life.js";
import { buildTown } from "./town.js";
import { buildSea } from "./sea.js";
import { buildWater } from "./water.js";
import { buildSights } from "./sights.js";

export const webglOK = T.webglOK;

// 每座島照 layout.js 的 shape 選一種：六邊形、圓、方（學校的操場）。
const prismFor = shape => shape === "round" ? T.roundPrism : shape === "rect" ? T.rectPrism : T.hexPrism;

export function create({ stage, pins, palette, phone, data, onSelect, onHover, onEvent, freeCentre, freeWidth }) {
  const E = T.createEngine({ stage, pins, palette, phone, onSelect, onHover, freeCentre, freeWidth, seed: 11 });
  const { M, rnd, pickables } = E;
  // 合併的時候合色（2026-11-18 第四批：831 個 draw call 要先降下來才放得下門面的細節）：只差底色的材質合成同一個 Mesh，顏色寫在點上。
  // cell 設到 400 公尺是整個世界合成一格：全景本來就全部都在畫面裡，切格子只是多幾十個 draw call。
  E.setMerge({ colours: true, cell: 400 });

  // ═══ 八座島（七座加機場）═══
  const islands = L.islands(); const isleObjs = new Map(); const blockersOf = new Map(); const poisOf = new Map();
  for (const isl of islands) {
    const tm = data.teams.find(x => x.id === isl.id); if (!tm) continue;
    const g = new THREE.Group(); g.position.set(isl.x, 0, isl.z); E.world.add(g);
    const fa = (isl.angle || Math.PI / 2); const fx = Math.cos(fa) * (isl.r * 0.62), fz = Math.sin(fa) * (isl.r * 0.62);
    let flag;
    if (isl.sea) {
      // 海上的機場：水泥平台。後半是跑道、滑行道、機坪（building 的 airport 那一段），前面一條（z 3 到 8.5）是人走的地方與回來的碼頭。
      const { deck, flag: f } = E.platform(g, isl.r); deck.userData.sel = { kind: "team", team: isl.id }; pickables.push(deck); flag = f;
    } else {
      const top = E.landmass(g, { shape: isl.shape, r: isl.r, prism: prismFor(isl.shape), top: E.groundMat(tm.ground) });
      top.userData.sel = { kind: "team", team: isl.id }; pickables.push(top);
      // 旗桿加旗子（team 的顏色）在島的後方。
      flag = E.flagpole(g, fx, fz, M.team[tm.colour]);
    }
    flag.userData.flag = true;
    // 做的事：一樣一棟。機場那座：機場在中間偏後，別的（碼頭）在前面左邊。
    const spots = L.programSpots({ id: isl.id, x: 0, z: 0, r: isl.r, angle: isl.angle }, tm.programs.length); const blockers = [{ x: fx, z: fz, r: 0.6 }];
    tm.programs.forEach((p, k) => { let sp = isl.sea ? (p.kind === "airport" ? { x: 0, z: -2.0, face: 0 } : { x: -4, z: 9.0, face: 0 }) : spots[k];
      if (p.kind === "pier" && !isl.sea) { const a = fa + 0.6, d = isl.r - 1.3; sp = { x: Math.cos(a) * d, z: Math.sin(a) * d, face: Math.atan2(Math.cos(a), Math.sin(a)) }; } /* 碼頭在島緣、甲板伸進水裡（批 D：之前照 programSpots 放在草地中間）*/ const b = E.building(p.kind, M.team[tm.colour]); b.position.set(sp.x, 0, sp.z); b.rotation.y = p.kind === "studio" ? 0.15 : sp.face; if (p.kind !== "airport") b.scale.setScalar(1.2); g.add(b);   // 貼文牆要面向鏡頭（+z），不是面向島心
      for (const eb of (b.userData.blockers || [])) { const c = Math.cos(sp.face), sn = Math.sin(sp.face); blockers.push({ x: sp.x + eb.x * c + eb.z * sn, z: sp.z - eb.x * sn + eb.z * c, r: eb.r }); }
      blockers.push({ x: sp.x, z: sp.z, r: T.KIND_R[p.kind] || 3.2 });
      for (const o of E.mergeChildren(b, { kind: "program", team: tm.id, program: p.id })) pickables.push(o);   // 一棟房子的零件合成幾個，點得到的就是合成的那幾個（2026-11-18）
      b.userData.pin = E.pin("pin-prog", { goProgram: p.id, team: tm.id }, true); b.userData.program = p; });
    // 每座島自己的那一套擺設（teams.json 的 scenery）＋每座島都有的桌椅、路、矮樹、燈、圍欄（furnish）。
    // Paul 2026-11-17 第二次：「everything on it has different stuff on it and it's actually working… right now our island looks empty」。
    const pois = [];
    if (!isl.sea) {
      E.decorate(tm.scenery, isl, g, blockers, fa, pois);
      const roadEnds = L.bridges().map(br => br.a === isl.id ? [br.x0 - isl.x, br.z0 - isl.z] : br.b === isl.id ? [br.x1 - isl.x, br.z1 - isl.z] : null).filter(Boolean);
      E.furnish(isl, g, blockers, fa, pois, roadEnds);
    }
    poisOf.set(isl.id, pois);
    // 樹（機場沒有）：幾棵看 teams.json 的 trees。
    if (!isl.sea) E.plantTrees(isl, blockers, Math.round(tm.trees * (phone ? 0.6 : 1)));
    // 島名的牌子（HTML）
    const pin = E.pin("pin-team c-" + tm.colour, { goTeam: tm.id });
    isleObjs.set(isl.id, { isl, tm, g, pin, flag, buildings: g.children.filter(c => c.userData.program) });
    // 人走路用的是世界座標：這裡把島上每一樣東西的位置加上島的位置。
    blockersOf.set(isl.id, blockers.map(b => ({ x: isl.x + b.x, z: isl.z + b.z, r: b.r || 1.2 })));
  }
  // 橋：五種輪流（Paul 2026-11-17：「make the bridges different material」「island and island can connect through water slide」）。
  L.bridges().forEach((br, bi) => E.bridge(br, L.bridgeStyle(br, bi)));   // 滑水道只在聚會所那六條（layout.js 的 bridgeStyle）
  // 協作線：島跟島之間一條拱起來的細管（橘色），全景時收起，開了「協作線」或選了那座島才亮。
  const lines = [];
  for (const c of data.connections || []) { const A = L.islandOf(c.a), B = L.islandOf(c.b); if (!A || !B) continue; lines.push({ a: c.a, b: c.b, mesh: E.arc(A, B) }); }
  // 海上的裝飾小島（layout.js 的 ISLETS）、小船、熱氣球、雲。
  for (const it of L.ISLETS) if (L.ENGINE_ISLETS.includes(it.kind)) E.islet(it);
  E.addBoats(6, islands.map(il => ({ x: il.x, z: il.z, r: il.r, pad: il.sea ? 6 : 3 })).concat(L.ISLETS.map(il => ({ x: il.x, z: il.z, r: il.r, pad: 3 })), L.GONDOLA.pts.map(p => ({ x: p[0], z: p[1], r: 2.5, pad: 1 })), [{ x: (L.FERRY.a[0] + L.FERRY.b[0]) / 2, z: (L.FERRY.a[1] + L.FERRY.b[1]) / 2, r: Math.hypot(L.FERRY.b[0] - L.FERRY.a[0], L.FERRY.b[1] - L.FERRY.a[1]) / 2, pad: 2 }]));   // 錨泊的小船也避開纜車塔與渡輪航線（批 D）
  E.addBalloons(3); E.addClouds(8);
  // 遊樂設施（rides.js：纜車、兩座新的雲霄飛車、遊樂小島、渡輪）與生活感（life.js：小店、餐車、公車亭、碼頭、晾衣繩、煙、花、石頭、鳥）。
  // 兩支都不碰 three，THREE 跟引擎傳進去；它們每一幀要動的東西從 motion() 的 tickExtra 叫。位置記進 blockersOf（人會繞開）、站的點記進 poisOf。
  const buildingsOf = new Map(); for (const o of isleObjs.values()) buildingsOf.set(o.isl.id, o.buildings.map(b => ({ x: b.position.x, z: b.position.z, ry: b.rotation.y, kind: b.userData.program.kind })));
  const bridgeAngles = new Map(); for (const br of L.bridges()) { const A = L.islandOf(br.a), B = L.islandOf(br.b); (bridgeAngles.get(br.a) || bridgeAngles.set(br.a, []).get(br.a)).push(Math.atan2(br.z0 - A.z, br.x0 - A.x)); (bridgeAngles.get(br.b) || bridgeAngles.set(br.b, []).get(br.b)).push(Math.atan2(br.z1 - B.z, br.x1 - B.x)); }
  for (const [id, x, z, r] of [["commons", 8, -3, 1.3], ["curriculum", -22.5, 22, 1.3], ["airport", 53, 6.5, 3.2]]) (blockersOf.get(id) || blockersOf.set(id, []).get(id)).push({ x, z, r });   // 纜車的塔與站
  const rides = buildRides(THREE, E, { gondola: L.GONDOLA, islets: L.ISLETS, blockersOf, ferry: L.FERRY });
  const life = buildLife(THREE, E, { islands: islands.map(i => ({ ...i, colour: (data.teams.find(x => x.id === i.id) || {}).colour })), blockersOf, poisOf, buildingsOf, bridgeAngles, airport: islands.find(i => i.sea) });
  // 第二批細節（2026-11-18 Paul：「More detail first」）：town.js 管陸上的（路、球場、菜園、市集、舞台、噴水池、燈串、更多在做事的人、機場的加油車與登機梯），
  // sea.js 管海上的（沙灘灣、浪圈、浮標、帆船、海豚、水上飛機）。town 要在 life 之後（鋪路要知道小店在哪，E.lifePlaces）、sea 在最後（沙灘要避開碼頭）。
  const groupOf = new Map([...isleObjs.values()].map(o => [o.isl.id, o.g]));
  const town = buildTown(THREE, E, { islands, blockersOf, poisOf, buildingsOf, kindR: T.KIND_R, lifePlaces: E.lifePlaces, bridgeAngles, airport: islands.find(i => i.sea), groupOf });
  const sea = buildSea(THREE, E, { islands, blockersOf, bridgeAngles, lifePlaces: E.lifePlaces, islets: L.ISLETS, sailLoops: L.SAIL_LOOPS, dolphins: L.DOLPHINS });
  // 第三批（2026-11-18 Paul 第三次「More detail first」：要好看、要活）：water.js 管水（漣漪、尾浪、淺水、鯨魚、瀑布），sights.js 管看得到的地標與味道
  // （觀景塔、風車、溫泉、兩種新的樹、機車、燈籠、夜市招牌、高一層的雲、滑翔翼、機場的信標與行李拖車）。兩支都要在 sea 之後（要知道沙灘、帆船、渡輪在哪）、flushInstances 之前（換掉三分之一的樹、清掉山丘那一塊的樹）。
  const water = buildWater(THREE, E, { islands, blockersOf, groupOf, whale: L.WHALE, bridgeAngles, lifePlaces: E.lifePlaces });
  const sights = buildSights(THREE, E, { islands, blockersOf, poisOf, lifePlaces: E.lifePlaces, airport: islands.find(i => i.sea), glider: L.GLIDER, cartLoop: L.CART_LOOP, gondola: L.GONDOLA, fair: L.ISLETS.find(i => i.kind === "fair") });
  const extraTick = (dt, t) => { rides.tick(dt, t); life.tick(dt, t); town.tick(dt, t); sea.tick(dt, t); water.tick(dt, t); sights.tick(dt, t); };
  E.flushInstances();

  // ═══ 人：每個人住在自己的島上 ═══
  const walkers = E.walkers;
  function addWalker(person, opts) { const isl = L.islandOf(person.team); return E.addWalker(person, { ...(opts || {}), isl, start: L.wanderTarget(isl, blockersOf.get(person.team), rnd) }); }
  for (const p of data.people) addWalker(p);
  // 靜態的東西合併（2026-11-18：加了這麼多道具之後一幀 1171 個 draw call；同材質同一格的合成一個，會動的與點得到的不碰）。
  const noMerge = new URLSearchParams(location.search).get("merge") === "0";   // ?merge=0：不合併，給除錯用的射線檢查（2026-11-18 自查）
  // 會動的 group 也再合一次（第四批）：纜車廂、摩天輪、船、晾衣繩那些底下的零件，照「只差底色就合」再合成一兩個。會動的零件各支模組自己標了 dynamic。
  // 批 C：合併烤的是世界座標，所以開場島浮起來那 1.6 秒之內不能合；motion() 開場演完才合（merged = true）。沒有 motion（減少動態）就馬上合。
  let merged = false; const mergeAll = () => { if (merged) return; merged = true; if (!noMerge) { E.mergeStatic(); E.mergeDynamic(); } };

  // ═══ 鏡頭與牌子 ═══
  const show = { names: false, selectedTeam: "", flows: false };
  function paintLines() { for (const l of lines) l.mesh.visible = show.flows || (!!show.selectedTeam && (l.a === show.selectedTeam || l.b === show.selectedTeam)); }
  E.placePins = () => {
    for (const o of isleObjs.values()) { E.putPin(o.pin, E.project(o.isl.x, 7.2, o.isl.z)); if (o.evPin) E.putPin(o.evPin, E.project(o.isl.x, 7.2, o.isl.z), 34); for (const b of o.buildings) { E.setHidden(b.userData.pin, show.selectedTeam !== o.isl.id); if (!b.userData.pin.hidden) E.putPin(b.userData.pin, E.project(o.isl.x + b.position.x, 5.0, o.isl.z + b.position.z)); } }
    for (const w of walkers) { const on = show.names || w.me || show.selectedTeam === w.person.team; E.setHidden(w.pin, !on); if (on) E.putPin(w.pin, E.project(w.g.position.x, 2.4, w.g.position.z)); }
  };
  E.setGoal(L.cameraOverview(phone), true); E.resize(); E.snapCam();
  // ═══ 開場（批 C）：鏡頭從雲上俯衝下來、整個世界從水裡浮上來，八座島一座接一座再冒一下。演完才合併。═══
  const isleList = [...isleObjs.values()]; let openT = -1;
  function startOpening() {
    const o = L.cameraOverview(phone); E.cam.pos.set(o.pos[0] * 0.3, o.pos[1] * 2.1, o.pos[2] * 2.3); E.cam.tgt.set(0, 0, 0); E.cam.lift = 0; E.placeCam();
    E.world.position.y = -11; openT = 0;
  }
  const openTick = dt => {
    if (openT < 0) return; openT += dt; const ease = k => 1 - Math.pow(1 - Math.min(1, Math.max(0, k)), 3);
    E.world.position.y = -11 * (1 - ease(openT / 1.4));
    isleList.forEach((o, i) => { o.g.position.y = -4 * (1 - ease((openT - 0.5 - i * 0.09) / 0.8)); });
    if (openT > 1.9) { openT = -1; E.world.position.y = 0; for (const o of isleList) o.g.position.y = 0; mergeAll(); E.dirty(); }
  };
  // ═══ 事件導覽（批 C）：鯨魚每 36 秒浮上來、飛機每 72 秒起飛。發生前 2 秒角落出一句（main.js 畫）；十秒沒人碰、也沒有點開哪座島，鏡頭就自己飛過去看。═══
  const guided = new Map(); let guideBack = -1, lineOn = "";
  const camFor = ev => { const p = ev.pos(); return { pos: [p[0] + 16, 15, p[2] + 24], target: [p[0], 0.5, p[2]] }; };
  const guideTick = (dt, t) => {
    for (const ev of E.events) {
      const at = ev.when(t), left = at - t, key = ev.id + ":" + Math.round(at);
      if (left <= 2 && left > -ev.dur) { if (lineOn !== key) { lineOn = key; if (onEvent) onEvent(ev.id, true); } if (left <= 2 && !guided.has(key) && !show.selectedTeam && E.idleFor() > 10000 && openT < 0) { guided.set(key, 1); E.setGoal(camFor(ev)); guideBack = t + ev.dur + 1; } }
      else if (lineOn === key) { lineOn = ""; if (onEvent) onEvent(ev.id, false); }
    }
    if (guideBack > 0 && t > guideBack) { guideBack = -1; if (!show.selectedTeam && E.idleFor() > 10000) E.setGoal(L.cameraOverview(phone), true); }
    if (guided.size > 8) guided.delete(guided.keys().next().value);
  };

  const api = {
    // 牌子上的字（語言換了 main.js 會再叫一次）。
    labels({ teams, people, me }) {
      for (const o of isleObjs.values()) o.pin.textContent = teams[o.isl.id] || "";
      for (const o of isleObjs.values()) for (const b of o.buildings) b.userData.pin.textContent = (people.programs && people.programs[b.userData.program.id]) || "";
      for (const w of walkers) { const sp = w.pin.querySelector("span"); (sp || w.pin).textContent = w.me ? (me || w.person.code) : (people[w.person.code] || ""); }
      E.placePins();
    },
    select(sel) {
      show.selectedTeam = sel && sel.team ? sel.team : (sel && sel.kind === "person" ? (walkers.find(w => w.person.code === sel.code) || {}).person?.team || "" : "");
      for (const o of isleObjs.values()) { const on = o.isl.id === show.selectedTeam; o.pin.classList.toggle("on", on); o.flag.material = on ? M.light : M.team[o.tm.colour]; if (on && sel && sel.kind !== "person") E.bounce(o.g); }   // 點到的島彈一下（批 B）
      for (const w of walkers) w.pin.classList.toggle("on", !!(sel && sel.kind === "person" && sel.code === w.person.code));
      paintLines();
      for (const o of isleObjs.values()) for (const b of o.buildings) b.userData.pin.classList.toggle("on", !!(sel && sel.kind === "program" && sel.program === b.userData.program.id));
      E.dirty();
      if (!sel) E.setGoal(L.cameraOverview(phone), true);
      else if (sel.kind === "person") { const w = walkers.find(x => x.person.code === sel.code); if (w) E.setGoal(L.cameraIsland(w.isl, phone), true); }
      else E.setGoal(L.cameraIsland(L.islandOf(sel.team), phone), true);
      if (!E.motionOn) E.snapCam(); else E.placePins();
    },
    flows(on) { show.flows = !!on; paintLines(); if (!E.motionOn) E.render(0); },
    // 滑鼠移到哪座島的東西上，那座島的牌子亮起來（批 B）。
    hover(sel) { const team = sel && sel.team ? sel.team : ""; for (const o of isleObjs.values()) o.pin.classList.toggle("hover", o.isl.id === team); },
    overview() { show.selectedTeam = ""; paintLines(); for (const o of isleObjs.values()) { o.pin.classList.remove("on"); o.flag.material = M.team[o.tm.colour]; } E.setGoal(L.cameraOverview(phone), true); if (!E.motionOn) E.snapCam(); },
    bird(on) { E.setGoal(on ? L.cameraBird(phone) : L.cameraOverview(phone), true); if (!E.motionOn) E.snapCam(); },
    names(on) { show.names = !!on; E.placePins(); },
    // 「我」：放一個人到那座島上；再叫一次就換；傳 null 就拿掉。
    me(info) {
      const old = walkers.find(w => w.me); if (old) E.removeWalker(old);
      if (!info) { if (!E.motionOn) E.render(0); return null; }
      const w = addWalker({ code: "me", team: info.team, role: "associate" }, { me: true, shirt: info.shirt, hair: info.hair, skin: 1, brolly: 0, box: false });   // 「我」不拿道具，名牌才看得清楚
      w.pin.querySelector("span").textContent = info.label || info.name; if (!E.motionOn) E.render(0); return w;
    },
    // 報名開著的活動：那座島上多一塊橘色的「報名中」牌子，按了直接去報名。
    events(list) {
      for (const o of isleObjs.values()) { if (o.evPin) { o.evPin.remove(); o.evPin = null; } }
      for (const e of list || []) { const o = isleObjs.get(e.team); if (!o || o.evPin) continue; const a = document.createElement("a"); a.className = "pin pin-event"; a.href = e.link; a.textContent = e.title; pins.appendChild(a); o.evPin = a; }
      E.placePins();
    },
    // 人換了一批（真的名單或真的校友從資料庫來）：不在新名單上的拿掉（「我」除外）、新的加上去。
    people(list) {
      for (const w of walkers.slice()) if (!w.me && !list.some(p => p.code === w.person.code)) E.removeWalker(w);
      for (const p of list) if (!walkers.some(w => w.person.code === p.code)) addWalker(p);
      if (!E.motionOn) E.render(0);
    },
    // Marketing 的貼文牆：最上面三張有圖的貼文貼到板子上（島上的圖只有這裡，check.sh 守 island/posts/）。
    posts(urls) { E.paintBoards(urls); },
    render: () => E.render(0),
    // 除錯用（?debug=1）：場景物件與材質也露出來，console 裡好查。
    _scene: E.scene, _M: M, _cam: E.cam, _E: E, _extraTick: extraTick,   // _extraTick：除錯時可以手動推進 rides／life／town／sea／water／sights 的動畫（畫面沒在跑 rAF 的時候）
    // 除錯用（?debug=1）：每個人現在在做什麼。
    debug: () => E.debugWalkers(),
    // 每一幀的迴圈（引擎的）。導航交給 layout.js：哪座島、怎麼繞、橋怎麼走。
    motion() { startOpening(); return E.motion({ islandOf: L.islandOf, wanderTarget: L.wanderTarget, detour: L.detour, route: L.route, routePoints: L.routePoints, blockersOf, poisOf, commons: "commons" }, (dt, t) => { extraTick(dt, t); openTick(dt); guideTick(dt, t); }); },
    // 角落那一句被點了：鏡頭飛去看那件事。
    goEvent(id) { const ev = E.events.find(x => x.id === id); if (ev) { E.setGoal(camFor(ev)); if (!E.motionOn) E.snapCam(); } },
    // 沒有 motion（減少動態效果）：main.js 叫這個，直接合併。
    still() { mergeAll(); E.render(0); },
  };
  return api;
}
