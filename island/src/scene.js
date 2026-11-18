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

export const webglOK = T.webglOK;

// 每座島照 layout.js 的 shape 選一種：六邊形、圓、方（學校的操場）。
const prismFor = shape => shape === "round" ? T.roundPrism : shape === "rect" ? T.rectPrism : T.hexPrism;
// 五種橋輪流（木板、石拱、紅漆拱、繩索、滑水道）。
const BRIDGE_STYLE = [0, 1, 2, 3, 4, 1, 0, 4, 2, 3, 0, 1, 4, 2];

export function create({ stage, pins, palette, phone, data, onSelect, onHover, freeCentre, freeWidth }) {
  const E = T.createEngine({ stage, pins, palette, phone, onSelect, onHover, freeCentre, freeWidth, seed: 11 });
  const { M, rnd, pickables } = E;

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
    tm.programs.forEach((p, k) => { const sp = isl.sea ? (p.kind === "airport" ? { x: 0, z: -2.0, face: 0 } : { x: -8.5, z: 6.2, face: Math.PI }) : spots[k]; const b = E.building(p.kind, M.team[tm.colour]); b.position.set(sp.x, 0, sp.z); b.rotation.y = p.kind === "studio" ? 0.15 : sp.face; if (p.kind !== "airport") b.scale.setScalar(1.2); g.add(b);   // 貼文牆要面向鏡頭（+z），不是面向島心
      for (const eb of (b.userData.blockers || [])) { const c = Math.cos(sp.face), sn = Math.sin(sp.face); blockers.push({ x: sp.x + eb.x * c + eb.z * sn, z: sp.z - eb.x * sn + eb.z * c, r: eb.r }); }
      blockers.push({ x: sp.x, z: sp.z, r: T.KIND_R[p.kind] || 3.2 });
      b.traverse(o => { if (o.isMesh) { o.userData.sel = { kind: "program", team: tm.id, program: p.id }; pickables.push(o); } });
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
  L.bridges().forEach((br, bi) => E.bridge(br, BRIDGE_STYLE[bi % BRIDGE_STYLE.length]));
  // 協作線：島跟島之間一條拱起來的細管（橘色），全景時收起，開了「協作線」或選了那座島才亮。
  const lines = [];
  for (const c of data.connections || []) { const A = L.islandOf(c.a), B = L.islandOf(c.b); if (!A || !B) continue; lines.push({ a: c.a, b: c.b, mesh: E.arc(A, B) }); }
  // 海上的裝飾小島（layout.js 的 ISLETS）、小船、熱氣球、雲。
  for (const it of L.ISLETS) E.islet(it);
  E.addBoats(6, islands.map(il => ({ x: il.x, z: il.z, r: il.r, pad: il.sea ? 6 : 3 })).concat(L.ISLETS.map(il => ({ x: il.x, z: il.z, r: il.r, pad: 3 }))));
  E.addBalloons(3); E.addClouds(8);
  E.flushInstances();

  // ═══ 人：每個人住在自己的島上 ═══
  const walkers = E.walkers;
  function addWalker(person, opts) { const isl = L.islandOf(person.team); return E.addWalker(person, { ...(opts || {}), isl, start: L.wanderTarget(isl, blockersOf.get(person.team), rnd) }); }
  for (const p of data.people) addWalker(p);

  // ═══ 鏡頭與牌子 ═══
  const show = { names: false, selectedTeam: "", flows: false };
  function paintLines() { for (const l of lines) l.mesh.visible = show.flows || (!!show.selectedTeam && (l.a === show.selectedTeam || l.b === show.selectedTeam)); }
  E.placePins = () => {
    for (const o of isleObjs.values()) { E.putPin(o.pin, E.project(o.isl.x, 7.2, o.isl.z)); if (o.evPin) E.putPin(o.evPin, E.project(o.isl.x, 7.2, o.isl.z), 34); for (const b of o.buildings) { E.setHidden(b.userData.pin, show.selectedTeam !== o.isl.id); if (!b.userData.pin.hidden) E.putPin(b.userData.pin, E.project(o.isl.x + b.position.x, 5.0, o.isl.z + b.position.z)); } }
    for (const w of walkers) { const on = show.names || w.me || show.selectedTeam === w.person.team; E.setHidden(w.pin, !on); if (on) E.putPin(w.pin, E.project(w.g.position.x, 2.4, w.g.position.z)); }
  };
  E.setGoal(L.cameraOverview(phone), true); E.resize(); E.snapCam();

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
      for (const o of isleObjs.values()) { const on = o.isl.id === show.selectedTeam; o.pin.classList.toggle("on", on); o.flag.material = on ? M.light : M.team[o.tm.colour]; }
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
    overview() { show.selectedTeam = ""; paintLines(); for (const o of isleObjs.values()) { o.pin.classList.remove("on"); o.flag.material = M.team[o.tm.colour]; } E.setGoal(L.cameraOverview(phone), true); if (!E.motionOn) E.snapCam(); },
    bird(on) { E.setGoal(on ? L.cameraBird(phone) : L.cameraOverview(phone), true); if (!E.motionOn) E.snapCam(); },
    names(on) { show.names = !!on; E.placePins(); },
    // 「我」：放一個人到那座島上；再叫一次就換；傳 null 就拿掉。
    me(info) {
      const old = walkers.find(w => w.me); if (old) E.removeWalker(old);
      if (!info) { if (!E.motionOn) E.render(0); return null; }
      const w = addWalker({ code: "me", team: info.team, role: "associate" }, { me: true, shirt: info.shirt, hair: info.hair, skin: 1 });
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
    _scene: E.scene, _M: M, _cam: E.cam, _E: E,
    // 除錯用（?debug=1）：每個人現在在做什麼。
    debug: () => E.debugWalkers(),
    // 每一幀的迴圈（引擎的）。導航交給 layout.js：哪座島、怎麼繞、橋怎麼走。
    motion() { return E.motion({ islandOf: L.islandOf, wanderTarget: L.wanderTarget, detour: L.detour, route: L.route, routePoints: L.routePoints, blockersOf, poisOf, commons: "commons" }); },
  };
  return api;
}
