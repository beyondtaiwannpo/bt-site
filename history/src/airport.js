// /history/ 的機場（批 5，2026-11-06 換成真的 3D）：純數學，沒有 DOM、沒有 Three。
// 這一支回答「進度 e 的時候，飛機在哪、鏡頭在哪、旅客在哪、每一站的錨點在哪」。scene.js 拿這些數字去擺 Three 的物件，
// main.js 拿鏡頭把站的錨點投影到螢幕上貼卡。測試（test/history-page.test.mjs）直接 import 這一支，不用開瀏覽器。
//
// ── 讀這一支之前先知道四件事 ──
// 1. **資料與場景分開。** 這裡沒有任何一站的文字，只拿「有幾站」。加一站永遠不碰這支。
// 2. **單位是公尺，y 朝上。** 航廈沿 x 軸躺著（x 從 -10 到 125），玻璃牆在 z=0，停機坪在 z>0，跑道在 z=400 沿 x 軸。
//    航向 yaw 的定義跟 Three 一樣：rotation.y = yaw 會把模型的 +z 轉到 (sin yaw, 0, cos yaw)，所以模型的機頭要朝 +z。
// 3. **四段照捲動的比例切（PHASES）**，站不管幾個都平均分在 0 到 1 上（第 i 站在 i/(n-1)），每一站照自己落在哪一段決定錨點在哪。
// 4. **滑行道是一條 centripetal Catmull-Rom 樣條**（跟 Three 的 CatmullRomCurve3 同一個算法，這裡自己寫一份，
//    因為飛機的位置、卡的錨點、滑行道的路面都要同一條線，而卡的投影在測試裡要算得出來）。等弧長取樣，所以飛機的速度是均勻的。

const clamp01 = v => Math.min(1, Math.max(0, v));
const smooth = t => t * t * (3 - 2 * t);
const lerp = (a, b, t) => a + (b - a) * t;
const TAU = Math.PI * 2;
const wrapAngle = a => ((a + Math.PI) % TAU + TAU) % TAU - Math.PI;

// ── 四段 ──
export const PHASES = { terminal: [0, 0.3], bridge: [0.3, 0.4], apron: [0.4, 0.8], takeoff: [0.8, 1] };
export function phaseFor(e) {
  if (e < PHASES.bridge[0]) return "terminal";
  if (e < PHASES.apron[0]) return "bridge";
  if (e < PHASES.takeoff[0]) return "apron";
  return "takeoff";
}
// 八種小場景的名字（data.js 的 motifFor 從代號算出來的；scene.js 照名字擺東西）。
export const MOTIFS = ["seven", "seats", "board", "sign", "boarding", "tail", "crew", "signpost"];

// ── 場地 ──
export const TERMINAL = { x0: -10, x1: 125, z0: -40, z1: 0, h: 12 };   // 航廈的體積；玻璃牆在 z1
export const CORRIDOR_Z = -20;                                        // 旅客與鏡頭走的那一條走道
export const WALK = { x0: 0, x1: 100 };                               // 航廈那一段鏡頭從哪走到哪
export const GATE_DESK = [106, -12];                                  // 登機門櫃台
export const GATE_DOOR = [113, 0];                                    // 玻璃牆上通往空橋的門
export const GATE_STAND = [120, 40];                                  // 我們那一架停的位置（機身中心）
export const PLANE_DOOR = [119, 29];                                  // 機艙門（面向航廈停，左前門）。空橋的盡頭伸進機身皮一公尺，從裡面看出去才是門不是停機坪
export const RUNWAY = { z: 400, x0: -900, x1: 320, half: 22 };        // 跑道沿 x 軸，飛機往 -x 起飛
export const TOWER = [40, 80];
export const CAM_OFF = [80, 95, 115];                                 // 停機坪的鏡頭相對飛機的位置（高角度四分之三）
export const CHASE_OFF = [175, 62, 55];                               // 起飛追在後面、高一點的位置（飛機往 -x 飛，所以在 +x），底下的機場還看得到
export const CAM_FOV = { inside: 62, outside: 38, insideTall: 74 };   // 直式的手機室內視角開大一點，走道旁的小場景才進得了畫面
export const PLANE_REST_Y = 4.2;   // 停在地上時機身中心的高度（plane.js 的起落架放下來輪子剛好碰地）

// ── 滑行道：路點（x, z）。從停機位開始：先倒退推出去，再轉三個彎到跑道頭。 ──
export const TAXI_WAYPOINTS = [
  [120, 40],    // 停機位（登機門）
  [120, 95],    // 推出去到這裡（倒退）
  [150, 125],   // 第一個彎：轉向 +x
  [230, 130],
  [285, 165],   // 第二個彎：轉向 +z
  [300, 230],
  [300, 320],
  [285, 375],   // 第三個彎：轉向 -x，對正跑道
  [250, 400],   // 跑道頭（在跑道中線上）
];
export const PUSHBACK_LEN = 55;   // 推出去那一段的弧長（到第二個路點）

// centripetal Catmull-Rom：四個控制點、t 在 0 到 1 之間，回 p1 到 p2 之間的一點。alpha 0.5 是 centripetal。
function crPoint(p0, p1, p2, p3, t) {
  const d = (a, b) => Math.pow(Math.hypot(b[0] - a[0], b[1] - a[1]), 0.5) || 1e-6;
  const t0 = 0, t1 = t0 + d(p0, p1), t2 = t1 + d(p1, p2), t3 = t2 + d(p2, p3);
  const tt = lerp(t1, t2, t);
  const L = (a, b, ta, tb) => [lerp(a[0], b[0], (tt - ta) / (tb - ta)), lerp(a[1], b[1], (tt - ta) / (tb - ta))];
  const A1 = L(p0, p1, t0, t1), A2 = L(p1, p2, t1, t2), A3 = L(p2, p3, t2, t3);
  const B1 = L(A1, A2, t0, t2), B2 = L(A2, A3, t1, t3);
  return L(B1, B2, t1, t2);
}
// 整條樣條上的一點：u 在 0 到 1（不是弧長）。頭尾各補一個控制點（延長）。
export function curvePoint(pts, u) {
  const n = pts.length - 1; if (n < 1) return pts[0] ? [...pts[0]] : [0, 0];
  const q = clamp01(u) * n, i = Math.min(n - 1, Math.floor(q)), t = q - i;
  const P = k => pts[Math.min(n, Math.max(0, k))];
  const ext = (a, b) => [a[0] * 2 - b[0], a[1] * 2 - b[1]];
  const p0 = i === 0 ? ext(pts[0], pts[1]) : P(i - 1), p3 = i + 2 > n ? ext(pts[n], pts[n - 1]) : P(i + 2);
  return crPoint(p0, P(i), P(i + 1), p3, t);
}
// 轉彎數：相鄰兩段的航向差超過 minDeg 度就算一個彎。
export function polylineTurns(pts, minDeg) {
  let turns = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const a = Math.atan2(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]), b = Math.atan2(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
    if (Math.abs(wrapAngle(b - a)) * 180 / Math.PI >= (minDeg || 30)) turns++;
  }
  return turns;
}
// 等弧長的樣條：at(s) 回 { x, z, yaw }（s 是公尺）。先細取樣再累積長度，查的時候二分。
export function makeCurve(pts, samples) {
  const N = samples || 1600, P = [], cum = [0];
  for (let k = 0; k <= N; k++) P.push(curvePoint(pts, k / N));
  for (let k = 1; k <= N; k++) cum.push(cum[k - 1] + Math.hypot(P[k][0] - P[k - 1][0], P[k][1] - P[k - 1][1]));
  const length = cum[N];
  const at = s => {
    s = Math.min(length, Math.max(0, s));
    let lo = 0, hi = N; while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (cum[mid] <= s) lo = mid; else hi = mid; }
    const seg = cum[hi] - cum[lo] || 1e-9, t = (s - cum[lo]) / seg;
    const a = P[lo], b = P[hi];
    return { x: lerp(a[0], b[0], t), z: lerp(a[1], b[1], t), yaw: Math.atan2(b[0] - a[0], b[1] - a[1]) };
  };
  return { at, length, points: P };
}
let _taxi = null;
export const taxiway = () => _taxi || (_taxi = makeCurve(TAXI_WAYPOINTS));

// ── 站：平均分在 0 到 1 上 ──
export const progressFor = (w, i) => w.n > 1 ? i / (w.n - 1) : 0;
export const nearest = (w, p) => w.n ? Math.min(w.n - 1, Math.max(0, Math.round(clamp01(p) * (w.n - 1)))) : -1;
// 慢下來的進度：站與站之間用一段 ease，靠近每一站慢下來、停一下。每一站的 p 對自己不變。
export function eased(w, p) {
  p = clamp01(p);
  if (w.n < 2) return p;
  const q = p * (w.n - 1), i = Math.min(w.n - 2, Math.floor(q)), t = q - i;
  return (i + 0.35 * t + 0.65 * smooth(t)) / (w.n - 1);
}
// 離最近那一站有多近（0 到 1）。
export function closeness(w, p) {
  if (w.n < 2) return 1;
  const q = clamp01(p) * (w.n - 1);
  return Math.max(0, 1 - Math.abs(q - Math.round(q)) * 2.6);
}

// ── 飛機 ──
const TAKEOFF_ROLL = 1800;   // 起飛段在跑道上與空中往 -x 走的距離（t 的平方，所以是加速）
export function planePoseAt(e) {
  e = clamp01(e);
  const tw = taxiway();
  const base = { x: GATE_STAND[0], y: 0, z: GATE_STAND[1], yaw: Math.PI, pitch: 0, roll: 0, gear: 1, steer: 0, s: 0, pushback: false, speed: 0 };
  if (e < PHASES.apron[0]) return base;
  if (e < PHASES.takeoff[0]) {
    const u = (e - PHASES.apron[0]) / (PHASES.apron[1] - PHASES.apron[0]);
    const s = tw.length * u, here = tw.at(s);
    const pushback = s < PUSHBACK_LEN;
    // 推出去：尾巴先走，機頭還是朝航廈（航向是切線的反方向）；推完之後 20 公尺內轉成順著滑行道。
    // 推出去那一段機頭固定朝航廈（yaw = π），推完之後 22 公尺內轉成順著滑行道的切線。
    const k = pushback ? 0 : smooth(clamp01((s - PUSHBACK_LEN) / 22));
    const yaw = pushback ? Math.PI : wrapAngle(here.yaw + wrapAngle(Math.PI - here.yaw) * (1 - k));
    const ahead = tw.at(Math.min(tw.length, s + 8));
    const steer = pushback ? 0 : Math.max(-0.6, Math.min(0.6, wrapAngle(ahead.yaw - here.yaw)));
    return { ...base, x: here.x, z: here.z, yaw, steer, s, pushback, speed: 1 };
  }
  // 起飛：對正跑道（往 -x），加速、抬頭、離地、收輪、爬升。
  const t = (e - PHASES.takeoff[0]) / (1 - PHASES.takeoff[0]);
  const x = TAXI_WAYPOINTS[TAXI_WAYPOINTS.length - 1][0] - TAKEOFF_ROLL * t * t;
  const lift = smooth(clamp01((t - 0.4) / 0.6));
  const rotate = smooth(clamp01((t - 0.35) / 0.25));
  const y = 420 * lift;
  const pitch = 0.2 * rotate + 0.08 * lift;
  const gear = 1 - smooth(clamp01((t - 0.45) / 0.25));
  return { ...base, x, y, z: RUNWAY.z, yaw: -Math.PI / 2, pitch, gear, s: tw.length + TAKEOFF_ROLL * t * t, speed: 2 + 6 * t, lift };
}

// ── 旅客與鏡頭 ──
// 空橋那一段的路：走道盡頭 → 轉向門 → 門 → 空橋裡 → 機艙門。走的人與鏡頭都沿這一條。
const BOARD_PATH = [[WALK.x1, CORRIDOR_Z], [107, -14], [GATE_DOOR[0], -3], [GATE_DOOR[0] + 0.5, 4], [116, 16], [PLANE_DOOR[0], PLANE_DOOR[1]]];
let _board = null;
const boardPath = () => _board || (_board = makeCurve(BOARD_PATH, 600));
const WALK_END = 0.335;      // 鏡頭走到空橋盡頭（機艙門前 4 公尺）的進度
const STOP_SHORT = 4;        // 鏡頭在機艙門前停住的距離：再近就只看得到引擎的進氣口
const BOARD_IN = 0.345;      // 旅客走進機艙、看不到的進度
// 空橋地板從門口的 0 升到機艙門的 2.4（空橋本來就是斜的）。
const bridgeFloorY = s => { const bp = boardPath(); const door = bp.length * 0.42; return s < door ? 0 : 2.4 * clamp01((s - door) / (bp.length - door)); };

export function travellerAt(e) {
  const camS = walkArc(e), bp = boardPath();
  // 走到機艙門就進去了（看不到）；鏡頭還在後面幾公尺，不會跟他疊在一起。
  if (e >= BOARD_IN || camS + 6 >= bp.length - 0.6) return { visible: false, walking: false, pos: [PLANE_DOOR[0], 2.4, PLANE_DOOR[1]], yaw: 0 };
  if (e < PHASES.bridge[0]) {
    const x = lerp(WALK.x0, WALK.x1, e / PHASES.bridge[0]) + 7;
    return { visible: true, walking: true, pos: [x, 0, CORRIDOR_Z + 0.4], yaw: Math.PI / 2 };
  }
  const s = Math.min(bp.length - 0.2, camS + 6), q = bp.at(s);
  return { visible: true, walking: true, pos: [q.x, bridgeFloorY(s), q.z], yaw: q.yaw };
}
// 空橋那一段鏡頭走到哪（弧長）：0.30 在走道盡頭，WALK_END 在機艙門。
function walkArc(e) { return (boardPath().length - STOP_SHORT) * clamp01((e - PHASES.bridge[0]) / (WALK_END - PHASES.bridge[0])); }

// 鏡頭：回 { pos:[x,y,z], look:[x,y,z], fov }。
// 航廈：人的高度沿走道往前。空橋：沿 BOARD_PATH 走到機艙門，再沿一條升高後退的曲線到停機坪的視角，兩段接在同一點。
// 停機坪：飛機加一個固定的偏移（高角度四分之三，方向不變，建築才讀得出體積）。起飛：偏移慢慢換成追在後面的那一個。
let _rise = null;
function risePath() {
  if (_rise) return _rise;
  const g = GATE_STAND, o = CAM_OFF, end = [g[0] + o[0], o[1], g[1] + o[2]];
  const bp = boardPath(), q = bp.at(bp.length - STOP_SHORT), y0 = 1.7 + bridgeFloorY(bp.length - STOP_SHORT);
  // 先直直往上穿過空橋的頂，再斜著退到停機坪的視角；不從機身上面貼著飛過去（那幾幀只看得到一片奶油色）。
  return (_rise = [[q.x, y0, q.z], [q.x + 2, 30, q.z - 4], [lerp(q.x, end[0], 0.5), lerp(30, end[1], 0.6), lerp(q.z, end[2], 0.45)], end]);
}
function rise3(u) {
  // 三維的 Catmull-Rom（用兩個二維的：xz 與 y 各算一次，同一個 u）
  const RP = risePath(), xz = curvePoint(RP.map(p => [p[0], p[2]]), u), y = curvePoint(RP.map((p, i) => [i, p[1]]), u)[1];
  return [xz[0], y, xz[1]];
}
export function cameraAt(e, tall) {
  e = clamp01(e);
  const EYE = 1.7, inside = tall ? CAM_FOV.insideTall : CAM_FOV.inside;
  if (e < PHASES.bridge[0]) {
    const x = lerp(WALK.x0, WALK.x1, e / PHASES.bridge[0]);
    return { pos: [x, EYE, CORRIDOR_Z], look: [x + 14, 1.4, CORRIDOR_Z - (tall ? 1.5 : 0.5)], fov: inside };
  }
  if (e < WALK_END) {
    const bp = boardPath(), s = walkArc(e), q = bp.at(s), ahead = bp.at(Math.min(bp.length, s + 5));
    const y = EYE + bridgeFloorY(s);
    // 最後十公尺慢慢轉頭看機艙門（門在左前方的機身上），不然看出去只有門旁邊的引擎與停機坪。
    const k = smooth(clamp01((s - (bp.length - STOP_SHORT - 10)) / 10));
    const door = [PLANE_DOOR[0] + 1.2, 2.6 + 0.9, PLANE_DOOR[1] + 0.5];
    const look = [lerp(ahead.x, door[0], k), lerp(y - 0.3 + (bridgeFloorY(Math.min(bp.length, s + 5)) - bridgeFloorY(s)), door[1], k), lerp(ahead.z, door[2], k)];
    return { pos: [q.x, y, q.z], look, fov: inside };
  }
  if (e < PHASES.apron[0]) {
    const u = smooth((e - WALK_END) / (PHASES.apron[0] - WALK_END));
    const pos = rise3(u), g = GATE_STAND;
    // 一開始看著機艙門前方，慢慢轉成看飛機中心
    const look = [lerp(PLANE_DOOR[0] + 1.2, g[0], u), lerp(3.5, 2, u), lerp(PLANE_DOOR[1] + 0.5, g[1], u)];   // 先看著機艙門，升起來之後慢慢轉成看飛機中心
    return { pos, look, fov: lerp(inside, CAM_FOV.outside, u) };
  }
  const q = planePoseAt(e);
  if (e < PHASES.takeoff[0]) return { pos: [q.x + CAM_OFF[0], q.y + CAM_OFF[1], q.z + CAM_OFF[2]], look: [q.x, q.y + 2, q.z], fov: CAM_FOV.outside };
  const k = smooth(clamp01((e - PHASES.takeoff[0]) / 0.12));
  const off = CAM_OFF.map((v, i) => lerp(v, CHASE_OFF[i], k));
  return { pos: [q.x + off[0], q.y + off[1], q.z + off[2]], look: [q.x - 20 * k, q.y + 2 - 14 * k, q.z], fov: CAM_FOV.outside };
}

// ── 站的錨點 ──
// 航廈的站在走道旁（櫃台那一側），鏡頭前面一點；落在空橋那一段的站留在登機門櫃台旁（空橋裡放不下小場景），有好幾站就往回排。
// 停機坪的站在滑行道旁、靠鏡頭那一側（卡才不會被飛機擋到）；起飛的站跟著飛機（在空中就浮在旁邊）。
export function world(n) {
  const stops = []; let atGate = 0;
  const side = (() => { const l = Math.hypot(CAM_OFF[0], CAM_OFF[2]); return [CAM_OFF[0] / l, CAM_OFF[2] / l]; })();
  for (let i = 0; i < n; i++) {
    const p = n > 1 ? i / (n - 1) : 0;
    if (p < PHASES.apron[0]) {
      if (p < PHASES.bridge[0]) stops.push({ p, phase: "terminal", anchor: [cameraAt(p).pos[0] + 9, 0, TERMINAL.z0 + 11], yaw: 0 });
      else stops.push({ p, phase: "terminal", anchor: [GATE_DESK[0] - 2 - 3.2 * atGate++, 0, GATE_DESK[1] - 4], yaw: 0, gate: true });
    } else {
      const q = planePoseAt(p);
      if (p < PHASES.takeoff[0]) stops.push({ p, phase: "apron", anchor: [q.x + side[0] * 20, 0, q.z + side[1] * 20], yaw: q.yaw });
      else stops.push({ p, phase: "takeoff", anchor: [q.x + 18, q.y + (q.y > 0 ? 10 : 2), q.z + 24], yaw: q.yaw, air: q.y > 0 });
    }
  }
  return { n, stops };
}

// ── 登機門與看板 ──
export const gateFor = i => "A" + (i + 1);
// 旅客登機的那一個登機門：空橋結束之前的站都算，取最後一站的號碼。
export const boardingGate = n => gateFor(Math.max(0, world(n).stops.filter(s => s.p < PHASES.bridge[1]).length - 1));
// 看板上的字：一列一行，欄位 TIME DESTINATION FLIGHT GATE STATUS，全部從 ui.js 的 boardRows 來（那裡是唯一的來源）。
export const boardLines = rows => (rows || []).map(r => ({ cells: [r.time, r.dest, r.flight, r.gate, r.status], now: r.status === "BOARDING" }));

// ── 退路與畫質 ──
export function pickMode(o) {
  o = o || {};
  return !o.reduce && !o.motionOff && o.webgl && o.gsap && o.three ? "3d" : "timeline";
}
export const quality = o => ({ dpr: Math.min(o.phone ? 1.5 : 2, o.dpr || 1), shadow: o.phone ? 512 : 1024 });
