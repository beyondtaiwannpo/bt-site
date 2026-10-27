// /history/ 的場景（批 4，2026-11-06 換成機場）：一個人從航廈走到登機門上飛機，鏡頭換成整架飛機，滑過整個機場，最後起飛。
//
// ── 讀這一支之前先知道五件事 ──
// 1. **資料與場景分開。** 這裡沒有任何一站的文字，只拿「有幾站」與「每站畫哪一種小場景」兩個輸入。
//    加一站永遠不碰這支（test/history-page.test.mjs 守著：場景 SVG 裡找不到任何站的標題）。
//    出發看板上的字是 HTML（ui.js 的 boardHTML），這裡只畫看板的框。
// 2. **顏色不寫色碼。** 每個形狀掛 class（c-navy、c-teal、c-orange、c-sand、c-cream、c-yellow、c-grey），
//    真正的顏色在 history.css 用 var(--bt-*) 給，深淺一律用 fill-opacity。check.sh 的七色白名單因此掃得到。
// 3. **會動的只有 motion()。** gsap 與 ScrollTrigger 只准出現在 motion() 裡（check.sh 守著）。
//    frame() 每一幀改 DOM 的位置，但它只是算數學寫屬性，不是動畫；誰呼叫它（捲動的追趕、閒置的時鐘）才在 motion() 裡。
// 4. **四段，照捲動的比例切（PHASES）。** 0 到 30% 航廈裡面（側視）、30 到 40% 空橋與換鏡、40 到 80% 停機坪與滑行（批 3 的針孔投影）、
//    80 到 100% 跑道與起飛。站不管幾個都平均分在 0 到 1 上（第 i 站在 i/(n-1)），每一站照自己落在哪一段決定畫在哪裡：
//    航廈的站在走道旁、停機坪的站在滑行道旁、起飛那一段的站在跑道旁或雲上。後台多加一站，場景不會壞。
// 5. **兩個世界。** 室內（data-world="int"）是側視的平行層：牆 0.62 倍、小場景 0.8 倍、走道 1 倍、前景 1.4 倍，鏡頭跟著旅客橫移，
//    地板與天花板的跨線每一幀從遠（0.62）畫到近（1.4），透視就出來了。室外（data-world="ext"）是批 3 那台針孔鏡頭：
//    世界座標 X（橫向，滑行道中線是 0，正的那一邊靠鏡頭）、Y（高度）、Z（沿滑行道往前），每個物件是一張站在地上的平面貼圖（billboard）。
//    起飛時鏡頭跟著飛機升高、抬頭（viewCam），雲是有高度的貼圖，鏡頭爬到它們上面雲就掉到底下。
//
// 單位：viewBox 高 800（H）。室外的符號畫的是「距離鏡頭 f 時的大小」，投影的放大倍數 s = f / depth。室內的符號畫的是 1 倍那一層的大小。

export const H = 800;
const f1 = n => Math.round(n * 10) / 10;
const clamp01 = v => Math.min(1, Math.max(0, v));
const smooth = t => t * t * (3 - 2 * t);

// ── 四段 ──
export const PHASES = { terminal: [0, 0.3], bridge: [0.3, 0.4], apron: [0.4, 0.8], takeoff: [0.8, 1] };
export function phaseFor(e) {
  if (e < PHASES.bridge[0]) return "terminal";
  if (e < PHASES.apron[0]) return "bridge";
  if (e < PHASES.takeoff[0]) return "apron";
  return "takeoff";
}
const WALK_END = 0.35;       // 旅客走到機艙門的進度（空橋在 0.30 到 0.35）
const HAND = [0.36, 0.4];    // 換鏡：室內淡出、室外淡進
const STOP_SPLIT = 0.36;     // 站落在這之前畫在室內，之後畫在室外
const LIFT = [0.88, 0.98];   // 離地到爬升完成

// ── 站：平均分在 0 到 1 上 ──
export const MIN_STOPS = 10;   // 留著給 main.js（批 3 的介面）；這一版世界的長度跟站數無關
export const TERM_LEN = 5200;  // 航廈從入口到機艙門的長度（室內世界的 x）
export const APRON_LEN = 6000; // 登機門到跑道頭的滑行距離（室外世界的 Z）
export const STOP_X = 180;     // 室外的小場景站在滑行道的這一邊（靠鏡頭）
export const AHEAD = 480;      // 飛機在鏡頭前面這麼遠
export const ROAD_HALF = 90;   // 滑行道半寬
const RUNWAY_HALF = 150;
const FAR = 3800, FADE_FROM = 1400, NEAR_CLIP = 40;
const VIG_AHEAD = 220;         // 室內的小場景在旅客前面一點，不跟他疊在一起
const GATE_END = 4360;         // 登機門口：空橋從 BRIDGE_X（4480）開始

export const progressFor = (w, i) => w.n > 1 ? i / (w.n - 1) : 0;
export const nearest = (w, p) => w.n ? Math.min(w.n - 1, Math.max(0, Math.round(clamp01(p) * (w.n - 1)))) : -1;
// 慢下來的進度：站與站之間用一段 ease，靠近每一站慢下來、停一下。每一站的 p 對自己不變。
export function eased(w, p) {
  p = clamp01(p);
  if (w.n < 2) return p;
  const q = p * (w.n - 1), i = Math.min(w.n - 2, Math.floor(q)), t = q - i;
  return (i + 0.35 * t + 0.65 * smooth(t)) / (w.n - 1);
}
// 離最近那一站有多近（0 到 1），鏡頭靠近時用來稍微放大。
export function closeness(w, p) {
  if (w.n < 2) return 1;
  const q = clamp01(p) * (w.n - 1);
  return Math.max(0, 1 - Math.abs(q - Math.round(q)) * 2.6);
}
// 旅客在航廈裡的位置：0 到 WALK_END 走完 TERM_LEN，之後站在機艙門。
export const travellerX = e => TERM_LEN * clamp01(e / WALK_END);

// 飛機的位置（室外世界）：0.36 之前停在登機門，推出去、沿滑行道走、對正跑道、加速、離地。
export function planePose(e) {
  const u = clamp01((e - PHASES.apron[0]) / (PHASES.apron[1] - PHASES.apron[0]));
  let z = APRON_LEN * u, y = 0, x = -130 * (1 - smooth(clamp01(z / 700))), pitch = 0, lift = 0;
  if (e > PHASES.takeoff[0]) {
    const t = clamp01((e - PHASES.takeoff[0]) / (1 - PHASES.takeoff[0]));
    const roll = t < 0.15 ? 0 : (t - 0.15) / 0.85;
    z = APRON_LEN + 500 * Math.min(1, t / 0.15) + 9000 * roll * roll;
    lift = smooth(clamp01((e - LIFT[0]) / (LIFT[1] - LIFT[0])));
    y = 1100 * lift; pitch = 14 * Math.min(1, lift * 2.5);
  }
  return { x, y, z, pitch, lift };
}
// 鏡頭在飛機後面多遠：離地之後往後退一點，整架飛機與底下的地才都在畫面裡。
export const aheadAt = lift => AHEAD * (1 + 0.9 * lift);
export const camZ = (w, e) => { const q = planePose(typeof e === "number" ? e : 0); return q.z - aheadAt(q.lift); };

export function world(n) {
  const stops = []; let atGate = 0;
  for (let i = 0; i < n; i++) {
    const p = n > 1 ? i / (n - 1) : 0;
    let s;
    // 航廈的站在旅客前面一點；落在空橋那一小段的站留在登機門口（空橋裡放不下小場景），有好幾站就往回排。
    if (p < STOP_SPLIT) { const x = travellerX(p) + VIG_AHEAD; s = x > GATE_END ? { p, phase: "terminal", x: GATE_END - 170 * atGate++, gate: true } : { p, phase: "terminal", x }; }
    else {
      const q = planePose(p);
      if (p < PHASES.takeoff[0]) s = { p, phase: "apron", z: q.z, x: STOP_X, y: 0 };
      else s = { p, phase: "takeoff", z: q.z + 40, x: STOP_X + (q.y > 0 ? 80 : 0), y: Math.max(0, q.y - 30) };
    }
    stops.push(s);
  }
  return { n, stops, length: APRON_LEN + 12000 };
}

// ── 室外的鏡頭（批 3 的針孔投影） ──
// 橫式：滑行道斜斜往右上。直式（手機）：鏡頭更高、偏轉更小，路更陡，畫面窄也看得到路往前走。xT 是室內旅客站在畫面的哪裡。
export function camera(viewW, tall) {
  return tall
    ? { cx: viewW * 0.5, cy: 380, f: 600, h: 360, pitch: 0.52, yaw: 0.3, x: 240, viewW, tall: true, xT: viewW * 0.36 }
    : { cx: viewW * 0.5, cy: 430, f: 700, h: 330, pitch: 0.4, yaw: 0.52, x: 194, viewW, tall: false, xT: viewW * 0.4 };
}
export const horizonY = cam => cam.cy - cam.f * Math.tan(cam.pitch);
// 起飛時的鏡頭：跟著飛機升高、抬頭、往後退一點。地面時就是原來那台。
export function viewCam(cam, e) {
  const q = planePose(e);
  if (!q.lift) return cam;
  return { ...cam, h: cam.h + q.y + (110 - cam.h) * q.lift, pitch: cam.pitch - 0.27 * q.lift };
}
// 世界的一點投到畫面。回 { x, y, s, depth }，在鏡頭後面回 null。
export function project(cam, X, Y, Z, cz) {
  const dx = X - cam.x, dz = Z - cz, dy = Y - cam.h;
  const sy = Math.sin(cam.yaw), cy = Math.cos(cam.yaw);
  const xr = dx * cy + dz * sy, zr = -dx * sy + dz * cy;
  const sp = Math.sin(cam.pitch), cp = Math.cos(cam.pitch);
  const depth = -dy * sp + zr * cp;
  if (depth < NEAR_CLIP) return null;
  const k = cam.f / depth;
  return { x: cam.cx + xr * k, y: cam.cy - (dy * cp + zr * sp) * k, s: k, depth };
}
const order = (cam, X, Z) => -(X - cam.x) * Math.sin(cam.yaw) + Z * Math.cos(cam.yaw);

// ── 室內的幾何：側視，平行層 ──
// 地板遠端（牆腳）在 y=560、近端在 y=800；牆那一層 0.62 倍、近端 1.4 倍，中間照 1/深度線性內插。眼睛的高度算出來在 y≈369。
const INT = { wallY: 560, wallK: 0.62, nearK: 1.4, nearY: 800, ceilY: 150 };
const intY = k => INT.wallY + (k - INT.wallK) * ((INT.nearY - INT.wallY) / (INT.nearK - INT.wallK));
const eyeY = intY(0);
const ceilYAt = k => eyeY - (eyeY - INT.ceilY) * (k / INT.wallK);
const LAYERS_INT = [["outside", 0.5], ["wall", INT.wallK], ["vig", 0.8], ["mid", 1], ["fore", INT.nearK]];
const VIG_K = 0.8, VIG_H = 118, VIG_INT = 4.2;   // 小場景畫的是室外距離 f 的大小（人 24 高），室內放大 4.2 倍才跟旅客（150 高）同一個尺度
const vigInt = tall => tall ? VIG_INT * 0.75 : VIG_INT;   // 直式畫面窄，小一點才不會壓到旅客
// 換鏡：室內先淡出並往左上滑走（0.36 到 0.385），室外再縮進來（0.375 到 0.40），只重疊一小段，任何一刻兩邊不會同時超過一半。
export function handoff(e) {
  const out = smooth(clamp01((e - HAND[0]) / (0.025)));
  const inn = smooth(clamp01((e - (HAND[0] + 0.015)) / (HAND[1] - HAND[0] - 0.015)));
  return { int: 1 - out, ext: inn, slide: out };
}

// 每一站在畫面上的點與卡要放的高度。不在現在這一段的站回 null（卡就藏起來）。near 是「鏡頭到了，卡要浮出來」。
export function stopPoints(w, cam, e) {
  const hd = handoff(e), vc = viewCam(cam, e), cz = camZ(w, e), tx = travellerX(e);
  return w.stops.map(s => {
    if (s.phase === "terminal") {
      if (hd.int <= 0) return null;
      const dx = s.x - tx, x = cam.xT + dx * VIG_K, y = intY(VIG_K);
      // 留在登機門口那一站：旅客走進空橋之後它在背後，卡還是要亮著（他的進度就是那一站）。
      const near = Math.abs(dx - VIG_AHEAD) < 520 || (s.gate && dx < VIG_AHEAD && dx > -1300);
      const k = VIG_K * vigInt(cam.tall);
      return { x, y, s: k, depth: Math.abs(dx), top: y - VIG_H * k, near };
    }
    if (hd.ext <= 0) return null;
    const p = project(vc, s.x, s.y, s.z, cz);
    if (!p) return null;
    return { x: p.x, y: p.y, s: p.s, depth: p.depth, top: p.y - VIG_H * p.s, near: p.depth < AHEAD + 560 };
  });
}

// ── 路（滑行道，到跑道頭變寬成跑道）：每一幀重算的多邊形 ──
const halfAt = Z => Z < APRON_LEN ? ROAD_HALF : Z < APRON_LEN + 400 ? ROAD_HALF + (RUNWAY_HALF - ROAD_HALF) * smooth((Z - APRON_LEN) / 400) : RUNWAY_HALF;
let farNow = FAR;   // 這一幀看多遠：地面時 FAR，起飛後更遠（frame() 每一幀設）
function samplesZ(cz, length) {
  const out = []; let dz = 70;
  for (let z = Math.max(cz + 60, -1800); z < Math.min(length, cz + farNow); z += dz, dz *= 1.09) out.push(z);
  out.push(Math.min(length, cz + farNow));
  return out;
}
const pts = list => list.map(p => `${f1(p.x)},${f1(p.y)}`).join(" ");
export function roadPolygon(cam, cz, length) {
  const zs = samplesZ(cz, length), L = [], R = [];
  for (const z of zs) { const h = halfAt(z), a = project(cam, -h, 0, z, cz), b = project(cam, h, 0, z, cz); if (a && b) { L.push(a); R.push(b); } }
  if (!L.length) return { points: "", nearWidth: 0, farWidth: 0 };
  return { points: pts(L.concat(R.reverse())), nearWidth: R[R.length - 1].x - L[0].x, farWidth: Math.abs(R[0].x - L[L.length - 1].x) };
}
function strip(cam, cz, length, x0, x1) {
  const zs = samplesZ(cz, length), L = [], R = [];
  for (const z of zs) { const h = halfAt(z) - ROAD_HALF, a = project(cam, x0 - (x0 < 0 ? h : -h), 0, z, cz), b = project(cam, x1 - (x1 < 0 ? h : -h), 0, z, cz); if (a && b) { L.push(a); R.push(b); } }
  return pts(L.concat(R.reverse()));
}
// 滑行道中線是一條黃線；跑道上是白色（cream）的虛線。
function centreline(cam, cz, length) {
  let d = "";
  for (let z = Math.floor(Math.max(cz + 60, -1800) / 120) * 120; z < Math.min(length, cz + FAR); z += 120) {
    const on = z < APRON_LEN ? 1 : 0.5, w = z < APRON_LEN ? 3 : 5;
    const a = project(cam, -w, 0, z, cz), b = project(cam, w, 0, z, cz), c = project(cam, w, 0, z + 120 * on, cz), e = project(cam, -w, 0, z + 120 * on, cz);
    if (a && b && c && e) d += `M${f1(a.x)},${f1(a.y)}L${f1(b.x)},${f1(b.y)}L${f1(c.x)},${f1(c.y)}L${f1(e.x)},${f1(e.y)}Z`;
  }
  return d;
}

// ── 符號：每個形狀只掛 class。原點在地面中央，往上畫（y 負的方向）。 ──
// 影子：朝右下的長影，所有戶外的東西共用同一個方向（光從左上來）。
const shadow = (w, h) => `<polygon points="${-w * 0.45},0 ${w * 0.45},0 ${w * 0.45 + h * 0.9},${h * 0.32} ${-w * 0.45 + h * 0.9},${h * 0.32}" class="c-navy" fill-opacity=".14"/>`;
// ── 飛機怎麼畫 ──
// 2026-11-06 第三輪：不再把俯視圖轉角度送進投影（那樣沿滑行道一壓就變成一根棍子）。改成預先畫好的四分之三視角符號，
// 跟低多邊形等角插畫畫飛機的方法一樣（查過 "low poly airliner isometric illustration"：從側上方看，機身是一根長管，看得到亮的頂面與
// 帶一排窗的側面，機頭圓、尾錐往上收，機翼是平的平行四邊形往後掠，兩具短圓筒引擎掛在翼下、看得到後端的排氣口，
// 垂直尾翼直立、水平尾翼小，機頭指著滑行道的方向）。放的時候只 translate 加 scale 到投影出來的地面點，跟其他符號一樣。
// 座標系：t 沿機身（機頭是正，畫面上往右上，就是滑行道在畫面上的方向約 50 度）、w 橫向（正的靠觀看者）、z 高度。
// 畫面 = t * U + w * V + z * (0, -1)。U、V 是那兩個方向在畫面上的單位向量（V 壓扁一點，因為是從上面看）。
const HEAD = -50;
const U = [Math.cos(HEAD * Math.PI / 180), Math.sin(HEAD * Math.PI / 180)], V = [-U[1] * 0.85, U[0] * 0.85];
function airliner({ wing, fin, stripe, bt, pitch, gear, belly }) {
  const th = (pitch || 0) * Math.PI / 180, c = Math.cos(th), sn = Math.sin(th);
  // 機頭抬起：t、z 繞機身中點轉。
  const P = (t, w, z) => { const t2 = t * c - z * sn, z2 = t * sn + z * c; return `${f1(t2 * U[0] + w * V[0])},${f1(t2 * U[1] + w * V[1] - z2)}`; };
  const poly = (cls, pts, extra) => `<polygon class="${cls}" points="${pts.map(q => P(...q)).join(" ")}"${extra || ""}/>`;
  const finAttr = fin === "currentColor" ? `class="pl-fin" fill="currentColor"` : `class="pl-fin ${fin}"`;
  const out = [];
  // 比例照插畫的習慣放大：機身長 170 高 40（真飛機更細，畫成那樣在這個尺寸只剩一根棍子）、引擎大、機翼寬。線條：機身與機翼描一條淡藍邊。
  const edge = ' stroke-width="1.2" stroke-opacity=".35"';   // 配 s-navy 的 class 一起用（class 只能寫一次）
  // 遠的那一片機翼、引擎、水平尾翼（畫在機身後面）
  out.push(poly(`pl-wing ${wing} s-navy`, [[26, -8, 44], [-16, -8, 44], [-62, -72, 50], [-44, -72, 50]], edge));
  out.push(poly("pl-engine c-grey", [[8, -38, 40], [-30, -38, 40], [-30, -38, 24], [8, -38, 24]]));
  out.push(poly(`pl-stab ${wing}`, [[-66, -8, 46], [-84, -8, 46], [-98, -34, 50], [-86, -34, 50]]));
  // 機身：側面（帶窗）、機腹（深）、頂面（亮）；機頭圓、尾錐往上收
  const side = `M${P(-88, 12, 40)} L${P(-30, 12, 14)} L${P(70, 12, 14)} Q${P(96, 12, 16)} ${P(100, 12, 34)} Q${P(96, 12, 54)} ${P(72, 12, 56)} L${P(-30, 12, 56)} L${P(-88, 12, 52)} Z`;
  out.push(`<path class="pl-fuselage c-cream s-navy" d="${side}"${edge}/>`);
  out.push(`<path class="c-navy" d="M${P(-88, 12, 40)} L${P(-30, 12, 14)} L${P(70, 12, 14)} Q${P(96, 12, 16)} ${P(100, 12, 34)} L${P(94, 12, 26)} Q${P(88, 12, 22)} ${P(70, 12, 22)} L${P(-30, 12, 22)} L${P(-86, 12, 43)} Z" fill-opacity="${belly ? ".32" : ".18"}"/>`);
  out.push(`<path class="c-cream s-navy" d="M${P(-88, 12, 52)} L${P(-30, 12, 56)} L${P(72, 12, 56)} Q${P(96, 12, 54)} ${P(100, 12, 34)} L${P(96, -10, 38)} Q${P(90, -10, 56)} ${P(72, -10, 58)} L${P(-30, -10, 58)} L${P(-88, -10, 54)} Z"${edge}/>`);
  // 窗線、橘線、一排窗、駕駛艙窗（都在側面）
  out.push(poly("c-navy", [[-64, 12.2, 40], [66, 12.2, 40], [66, 12.2, 37.5], [-64, 12.2, 37.5]], ` fill-opacity="${stripe}"`));
  if (bt) out.push(poly("c-orange", [[-64, 12.3, 36.5], [66, 12.3, 36.5], [66, 12.3, 34.8], [-64, 12.3, 34.8]]));
  for (let t = -56; t <= 56; t += 11) out.push(poly("pl-window c-navy", [[t, 12.4, 46], [t + 5.5, 12.4, 46], [t + 5.5, 12.4, 42], [t, 12.4, 42]], ' fill-opacity=".62"'));
  out.push(poly("pl-cockpit c-navy", [[76, 12.4, 50], [92, 12.4, 46], [92, 12.4, 40], [76, 12.4, 41]], ' fill-opacity=".82"'));
  // 靠觀看者這一片機翼（翼根在機身中段，往後掠，翼尖稍微抬起）、引擎（看得到後端的排氣口）、水平尾翼
  out.push(poly(`pl-wing ${wing} s-navy`, [[26, 14, 30], [-18, 14, 30], [-74, 92, 36], [-52, 92, 36]], edge));
  out.push(poly("c-navy", [[-18, 14, 30], [-74, 92, 36], [-52, 92, 36], [4, 14, 30]], ' fill-opacity=".1"'));
  out.push(poly("pl-engine c-grey s-navy", [[12, 46, 26], [-30, 46, 26], [-30, 46, 6], [12, 46, 6]], edge));
  out.push(`<ellipse class="c-navy" cx="${P(-30, 46, 16).split(",")[0]}" cy="${P(-30, 46, 16).split(",")[1]}" rx="5" ry="10" fill-opacity=".6"/>`);
  out.push(poly("c-navy", [[12, 46, 26], [-30, 46, 26], [-30, 46, 21], [12, 46, 21]], ' fill-opacity=".12"'));
  out.push(poly(`pl-stab ${wing} s-navy`, [[-66, 14, 42], [-84, 14, 42], [-100, 44, 46], [-88, 44, 46]], edge));
  // 起落架：機頭一組、主輪兩組（離地的那一張沒有）
  if (gear) out.push(`<g class="pl-gear">` + [[76, 8], [-4, 24], [-4, -4]].map(([t, w]) => `<polygon class="c-navy" points="${[[t - 1.2, w, 16], [t + 1.2, w, 16], [t + 1.2, w, 5], [t - 1.2, w, 5]].map(q => P(...q)).join(" ")}"/><circle class="c-navy" cx="${P(t, w, 4).split(",")[0]}" cy="${P(t, w, 4).split(",")[1]}" r="4"/>`).join("") + `</g>`);
  // 垂直尾翼直直站在機尾，BT 那一架是橘色帶一片奶油色的台灣
  out.push(`<polygon ${finAttr} points="${[[-62, 0, 52], [-88, 0, 52], [-106, 0, 112], [-90, 0, 112]].map(q => P(...q)).join(" ")}"/>`);
  if (bt) { const [mx, my] = P(-90, 0, 80).split(",").map(Number); out.push(`<path class="pl-mark c-cream" d="M${mx + 1},${my - 15} Q${mx + 8},${my - 8} ${mx + 7},${my + 1} Q${mx + 6},${my + 13} ${mx - 1},${my + 18} Q${mx - 7},${my + 9} ${mx - 6},${my} Q${mx - 5},${my - 9} ${mx + 1},${my - 15} Z"/>`); }
  if (bt) out.push(`<g class="anim-strobe"><circle cx="${P(-63, 92, 36).split(",")[0]}" cy="${P(-63, 92, 36).split(",")[1]}" r="3.5" class="c-yellow"/><circle cx="${P(-53, -72, 50).split(",")[0]}" cy="${P(-53, -72, 50).split(",")[1]}" r="3" class="c-yellow"/><circle cx="${P(-92, 0, 50).split(",")[0]}" cy="${P(-92, 0, 50).split(",")[1]}" r="3" class="c-orange"/></g>`);
  return out.join("");
}
const planeBody = o => airliner({ pitch: 0, gear: true, ...o });
const win = (x, y, w, h, op) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" class="c-navy" fill-opacity="${op || ".5"}"/>`;
const SYMBOLS = {
  // ── 室內（1 倍那一層的大小：人約 150 高） ──
  // 旅客：沒有五官，藍褲、青上衣、橘背包。兩條腿各一個 group，frame() 照走的距離擺動。
  traveller: `<ellipse cx="6" cy="2" rx="26" ry="5" class="c-navy" fill-opacity=".16"/>` +
    `<g class="leg-b"><rect x="-3" y="-66" width="14" height="66" rx="5" class="c-navy"/><rect x="-5" y="-8" width="20" height="8" rx="3" class="c-navy" fill-opacity=".9"/></g>` +
    `<g class="leg-a"><rect x="-13" y="-66" width="14" height="66" rx="5" class="c-navy" fill-opacity=".85"/><rect x="-15" y="-8" width="20" height="8" rx="3" class="c-navy" fill-opacity=".8"/></g>` +
    `<rect x="-26" y="-118" width="24" height="54" rx="8" class="c-orange"/><rect x="-22" y="-108" width="16" height="12" rx="3" class="c-navy" fill-opacity=".25"/>` +
    `<rect x="-16" y="-124" width="32" height="64" rx="9" class="c-teal"/><rect x="-10" y="-124" width="20" height="10" class="c-navy" fill-opacity=".2"/>` +
    `<g class="arm"><rect x="12" y="-116" width="10" height="46" rx="5" class="c-teal"/></g>` +
    `<circle cx="0" cy="-142" r="17" class="c-sand"/><path d="M-17,-146 Q0,-166 17,-146 Z" class="c-navy"/>`,
  // 其他旅客：站著，一只行李箱。顏色 currentColor。
  pax: `<ellipse cx="4" cy="2" rx="20" ry="4" class="c-navy" fill-opacity=".14"/><rect x="-10" y="-58" width="9" height="58" rx="4" fill="currentColor" fill-opacity=".8"/><rect x="2" y="-58" width="9" height="58" rx="4" fill="currentColor"/>` +
    `<rect x="-15" y="-116" width="30" height="60" rx="8" fill="currentColor"/><circle cx="0" cy="-132" r="15" class="c-sand"/><path d="M-15,-135 Q0,-152 15,-135 Z" class="c-navy"/>` +
    `<rect x="22" y="-52" width="22" height="46" rx="4" class="c-navy" fill-opacity=".75"/><rect x="30" y="-70" width="5" height="20" class="c-navy" fill-opacity=".6"/>`,
  // 坐著的旅客。
  sitpax: `<rect x="-12" y="-76" width="24" height="46" rx="7" fill="currentColor"/><rect x="-14" y="-34" width="34" height="12" rx="5" fill="currentColor"/><rect x="12" y="-34" width="9" height="34" rx="4" class="c-navy"/><circle cx="0" cy="-90" r="13" class="c-sand"/><path d="M-13,-93 Q0,-108 13,-93 Z" class="c-navy"/>`,
  // 報到櫃台：桌、上面的螢幕桿、櫃員。
  counter: `<rect x="-80" y="-84" width="160" height="84" class="c-cream"/><rect x="-80" y="-84" width="160" height="10" class="c-navy"/><rect x="-80" y="-70" width="160" height="4" class="c-orange"/>` +
    `<rect x="-3" y="-250" width="6" height="166" class="c-grey"/><rect x="-40" y="-262" width="80" height="48" rx="4" class="c-navy"/><rect x="-34" y="-256" width="68" height="36" class="c-teal" fill-opacity=".7"/>` +
    `<rect x="-30" y="-250" width="30" height="5" class="c-cream"/><rect x="-30" y="-240" width="50" height="3" class="c-cream" fill-opacity=".6"/>` +
    `<circle cx="20" cy="-124" r="12" class="c-sand"/><rect x="8" y="-112" width="24" height="30" rx="6" class="c-navy"/>`,
  // 出發看板的框：深藍面板、橘色表頭。字由 HTML 疊在同一個位置（data-board）。
  boardframe: `<rect x="-270" y="-470" width="540" height="300" rx="6" class="c-navy"/><rect x="-262" y="-462" width="524" height="30" rx="3" class="c-orange"/><rect x="-262" y="-428" width="524" height="250" class="c-navy" fill-opacity=".6"/>` +
    `<rect x="-6" y="-170" width="12" height="40" class="c-grey"/>`,
  // 安檢：金屬探測門、輸送帶與掃描機。
  security: `<rect x="-140" y="-200" width="14" height="200" class="c-grey"/><rect x="-60" y="-200" width="14" height="200" class="c-grey"/><rect x="-146" y="-212" width="106" height="14" class="c-navy"/><rect x="-128" y="-194" width="54" height="8" class="c-teal"/>` +
    `<rect x="-20" y="-70" width="190" height="14" class="c-navy" fill-opacity=".8"/><rect x="-14" y="-56" width="12" height="56" class="c-grey"/><rect x="152" y="-56" width="12" height="56" class="c-grey"/>` +
    `<rect x="40" y="-140" width="80" height="84" rx="4" class="c-navy"/><rect x="48" y="-132" width="64" height="50" class="c-teal" fill-opacity=".45"/><rect x="-10" y="-82" width="30" height="14" class="c-orange"/><rect x="130" y="-82" width="30" height="14" class="c-orange"/>`,
  // 窗牆的一片：窗框加直欄，玻璃是透明的，外面那一層從這裡看出去。
  pane: `<rect x="-150" y="-440" width="300" height="12" class="c-navy"/><rect x="-150" y="-70" width="300" height="12" class="c-navy"/><rect x="-150" y="-440" width="8" height="382" class="c-navy"/><rect x="142" y="-440" width="8" height="382" class="c-navy"/><rect x="-4" y="-440" width="8" height="382" class="c-navy" fill-opacity=".8"/>` +
    `<rect x="-142" y="-428" width="284" height="358" class="c-teal" fill-opacity=".08"/><polygon points="-120,-420 -60,-420 -140,-100 -142,-160" class="c-cream" fill-opacity=".35"/>`,
  // 登機門的櫃台：矮桌、兩位地勤、上面一塊門牌。
  gatedesk: `<rect x="-70" y="-74" width="140" height="74" class="c-cream"/><rect x="-70" y="-74" width="140" height="8" class="c-navy"/><rect x="-70" y="-62" width="140" height="4" class="c-teal"/>` +
    `<circle cx="-22" cy="-110" r="12" class="c-sand"/><rect x="-34" y="-98" width="24" height="26" rx="6" class="c-navy"/><circle cx="24" cy="-110" r="12" class="c-sand"/><rect x="12" y="-98" width="24" height="26" rx="6" class="c-teal"/>` +
    `<rect x="-4" y="-330" width="8" height="256" class="c-grey"/><rect x="-60" y="-372" width="120" height="48" rx="4" class="c-navy"/><rect x="-52" y="-364" width="34" height="32" class="c-orange"/><rect x="-10" y="-358" width="60" height="6" class="c-cream"/><rect x="-10" y="-346" width="40" height="4" class="c-cream" fill-opacity=".6"/>`,
  // 一排四張座位。
  seats: `<rect x="-120" y="-16" width="240" height="6" class="c-navy"/><rect x="-104" y="-10" width="8" height="10" class="c-navy"/><rect x="96" y="-10" width="8" height="10" class="c-navy"/>` +
    [-90, -30, 30, 90].map(x => `<rect x="${x - 26}" y="-44" width="52" height="30" rx="5" class="c-teal"/><rect x="${x - 24}" y="-86" width="48" height="46" rx="6" class="c-teal" fill-opacity=".85"/>`).join(""),
  kiosk: `<rect x="-24" y="-150" width="48" height="150" rx="4" class="c-navy"/><rect x="-18" y="-140" width="36" height="52" class="c-teal" fill-opacity=".6"/><rect x="-12" y="-130" width="24" height="4" class="c-cream"/><rect x="-18" y="-80" width="36" height="6" class="c-orange"/>`,
  plant: `<rect x="-18" y="-34" width="36" height="34" class="c-orange"/><ellipse cx="0" cy="-60" rx="34" ry="30" class="c-teal"/><ellipse cx="-14" cy="-80" rx="20" ry="22" class="c-teal"/><ellipse cx="16" cy="-74" rx="18" ry="20" class="c-navy" fill-opacity=".25"/>`,
  pillar: `<rect x="-26" y="-700" width="52" height="700" class="c-cream"/><rect x="14" y="-700" width="12" height="700" class="c-navy" fill-opacity=".14"/>`,
  bin: `<rect x="-14" y="-50" width="28" height="50" rx="3" class="c-grey"/><rect x="-16" y="-54" width="32" height="8" class="c-navy"/>`,
  doors: `<rect x="-120" y="-280" width="240" height="280" class="c-navy"/><rect x="-108" y="-268" width="104" height="268" class="c-teal" fill-opacity=".35"/><rect x="4" y="-268" width="104" height="268" class="c-teal" fill-opacity=".35"/><rect x="-120" y="-300" width="240" height="20" class="c-orange"/>`,
  // 空橋的牆板：灰的、一條橫窗。
  bridgewall: `<rect x="-150" y="-430" width="300" height="430" class="c-grey"/><rect x="-150" y="-430" width="300" height="12" class="c-navy"/><rect x="-140" y="-330" width="280" height="110" class="c-navy" fill-opacity=".85"/><rect x="-132" y="-322" width="264" height="94" class="c-teal" fill-opacity=".12"/>` +
    `<rect x="-150" y="-60" width="300" height="10" class="c-navy" fill-opacity=".6"/>`,
  // 窗外（遠一層）的機身：奶油色、一排窗、艙門。
  fuselage: `<rect x="-900" y="-520" width="1800" height="470" rx="60" class="c-cream"/><rect x="-900" y="-320" width="1800" height="60" class="c-navy"/><rect x="-900" y="-258" width="1800" height="10" class="c-orange"/>` +
    [...Array(14)].map((_, i) => win(-820 + i * 120, -430, 34, 44, ".55")).join("") +
    `<rect x="-60" y="-470" width="120" height="250" rx="8" class="c-navy" fill-opacity=".9"/><rect x="-50" y="-460" width="100" height="230" rx="6" class="c-teal" fill-opacity=".2"/>`,
  // 窗外停著的飛機（側視）：尾翼 currentColor。
  sideplane: `<ellipse cx="60" cy="0" rx="260" ry="14" class="c-navy" fill-opacity=".12"/><rect x="-240" y="-120" width="440" height="64" rx="32" class="c-cream"/><path d="M200,-120 Q260,-100 250,-56 L200,-56Z" class="c-cream"/>` +
    `<path d="M-240,-120 L-140,-250 L-80,-250 L-130,-120Z" fill="currentColor"/><rect x="-250" y="-130" width="110" height="14" fill="currentColor"/>` +
    `<rect x="-200" y="-100" width="360" height="8" class="c-navy" fill-opacity=".5"/><rect x="-60" y="-60" width="120" height="30" rx="4" class="c-navy" fill-opacity=".85"/><rect x="-170" y="-40" width="50" height="30" rx="10" class="c-grey"/><rect x="-150" y="-10" width="8" height="12" class="c-navy"/><rect x="140" y="-10" width="8" height="12" class="c-navy"/>`,
  // ── 室外（距離 f 時的大小） ──
  // 航廈的一段：兩層玻璃立面、屋頂、一條橘線。寬 230，照 1.3 倍放每 300 一段剛好連成一棟。
  termseg: shadow(240, 90) + `<polygon points="-115,0 35,0 35,-100 -115,-100" class="c-cream"/><polygon points="35,0 115,-30 115,-130 35,-100" class="c-grey"/>` +
    `<polygon points="-120,-100 40,-100 120,-132 -40,-132" class="c-navy" fill-opacity=".85"/><rect x="-108" y="-92" width="136" height="4" class="c-orange"/>` +
    `<rect x="-108" y="-82" width="136" height="32" class="c-teal" fill-opacity=".35"/><rect x="-108" y="-40" width="136" height="30" class="c-teal" fill-opacity=".3"/>` +
    `<rect x="-108" y="-82" width="136" height="3" class="c-navy" fill-opacity=".5"/><rect x="-108" y="-40" width="136" height="3" class="c-navy" fill-opacity=".5"/>` +
    `<rect x="-62" y="-82" width="2" height="72" class="c-navy" fill-opacity=".4"/><rect x="-16" y="-82" width="2" height="72" class="c-navy" fill-opacity=".4"/>` +
    `<rect x="40" y="-96" width="70" height="26" class="c-teal" fill-opacity=".25" transform="skewY(-21)"/>`,
  // 空橋（伸向滑行道的一截）。
  jetway: `<rect x="-6" y="-40" width="8" height="40" class="c-grey"/><polygon points="-60,-54 60,-40 60,-24 -60,-36" class="c-grey"/><polygon points="-60,-54 60,-40 60,-44 -60,-58" class="c-navy" fill-opacity=".6"/>`,
  // 塔台：細身、頂上的玻璃艙、信標。
  tower: shadow(50, 220) + `<rect x="-12" y="-170" width="24" height="170" class="c-cream"/><rect x="6" y="-170" width="6" height="170" class="c-navy" fill-opacity=".18"/>` +
    `<polygon points="-30,-170 30,-170 36,-200 -36,-200" class="c-navy"/><polygon points="-36,-200 36,-200 30,-224 -30,-224" class="c-teal" fill-opacity=".65"/><rect x="-32" y="-230" width="64" height="8" class="c-navy"/>` +
    `<rect x="-2" y="-250" width="4" height="20" class="c-grey"/><g class="anim-beacon"><circle cx="0" cy="-252" r="5" class="c-orange"/><circle cx="0" cy="-252" r="12" class="c-orange" fill-opacity=".4"/></g>`,
  // 機棚：大圓頂、一扇大門。
  hangar: shadow(220, 90) + `<path d="M-110,0 L-110,-60 Q-110,-120 -30,-120 L30,-120 Q110,-120 110,-60 L110,0Z" class="c-cream"/><path d="M110,0 L110,-60 Q110,-120 30,-120 L170,-150 Q190,-100 190,-40 L170,-20Z" class="c-grey"/>` +
    `<rect x="-90" y="-80" width="140" height="80" class="c-navy" fill-opacity=".65"/><rect x="-90" y="-86" width="140" height="6" class="c-orange"/><rect x="-20" y="-80" width="3" height="80" class="c-cream" fill-opacity=".4"/>`,
  fueltruck: `<ellipse cx="14" cy="2" rx="34" ry="5" class="c-navy" fill-opacity=".16"/><rect x="-34" y="-24" width="20" height="20" rx="3" class="c-navy"/><rect x="-30" y="-20" width="12" height="8" class="c-teal" fill-opacity=".5"/>` +
    `<rect x="-14" y="-30" width="48" height="26" rx="12" class="c-cream"/><rect x="-14" y="-18" width="48" height="4" class="c-orange"/><circle cx="-24" cy="-3" r="4" class="c-navy"/><circle cx="0" cy="-3" r="4" class="c-navy"/><circle cx="24" cy="-3" r="4" class="c-navy"/>`,
  // 行李車：一台拖車拉兩節。
  carts: `<ellipse cx="10" cy="2" rx="44" ry="4" class="c-navy" fill-opacity=".16"/><rect x="-44" y="-18" width="18" height="14" rx="3" class="c-orange"/><rect x="-40" y="-26" width="10" height="8" class="c-navy"/>` +
    `<rect x="-20" y="-16" width="26" height="12" class="c-navy" fill-opacity=".8"/><rect x="-18" y="-24" width="22" height="8" class="c-teal"/><rect x="12" y="-16" width="26" height="12" class="c-navy" fill-opacity=".8"/><rect x="14" y="-24" width="22" height="8" class="c-sand"/>` +
    `<circle cx="-38" cy="-3" r="3.5" class="c-navy"/><circle cx="-10" cy="-3" r="3" class="c-navy"/><circle cx="22" cy="-3" r="3" class="c-navy"/>`,
  // 停著的飛機：沿滑行道的方向畫（planeBody，見上面），尾翼 currentColor。
  plane: planeBody({ wing: "c-grey", fin: "currentColor", stripe: ".55" }),
  // 我們那一架：BT 的顏色（奶油機身、藍窗線加一條橘線、橘尾翼帶一個白印、青機翼），翼尖與機尾有頻閃燈。
  btplane: planeBody({ wing: "c-teal", fin: "c-orange", stripe: ".6", bt: true }),
  // 爬升那一張：機頭抬 15 度、起落架收了、多看到一點機腹。起飛那一下兩張交叉淡入（frame()）。
  btclimb: airliner({ wing: "c-teal", fin: "c-orange", stripe: ".6", bt: true, pitch: 15, gear: false, belly: true }),
  // 飛機在地上的影子（離地之後縮小變淡）。
  planeshadow: `<ellipse cx="0" cy="0" rx="112" ry="26" class="c-navy" fill-opacity=".22" transform="translate(30 16) rotate(${HEAD})"/>`,
  // 地勤：橘背心、拿兩支指揮棒。顏色 currentColor（背心）。
  crew: `<ellipse cx="3" cy="1" rx="7" ry="1.8" class="c-navy" fill-opacity=".18"/><rect x="-4" y="-15" width="8" height="15" rx="2.5" class="c-navy"/><rect x="-5" y="-15" width="10" height="9" rx="2" fill="currentColor"/><circle cx="0" cy="-19" r="4" class="c-sand"/>` +
    `<g class="anim-flag" transform="translate(0,-14)"><rect x="-14" y="-6" width="10" height="2" class="c-orange"/><rect x="4" y="-6" width="10" height="2" class="c-orange"/></g>`,
  person: `<ellipse cx="3" cy="1" rx="6" ry="1.6" class="c-navy" fill-opacity=".18"/><circle cx="0" cy="-19" r="4" fill="currentColor"/><rect x="-4" y="-15" width="8" height="15" rx="2.5" fill="currentColor"/>`,
  // 滑行道邊燈（青）與跑道邊燈（黃）。
  edgelight: `<rect x="-1" y="-6" width="2" height="6" class="c-grey"/><circle cx="0" cy="-7" r="2.5" class="c-teal"/><circle cx="0" cy="-7" r="6" class="c-teal" fill-opacity=".25"/>`,
  rwylight: `<circle cx="0" cy="-2" r="2.5" class="c-yellow"/><g class="anim-glow"><circle cx="0" cy="-2" r="7" class="c-yellow" fill-opacity=".35"/></g>`,
  // 滑行道指示牌：黃底藍字（字是幾條線）。
  taxisign: `<rect x="-2" y="-30" width="4" height="30" class="c-grey"/><rect x="-28" y="-46" width="56" height="18" rx="2" class="c-yellow"/><rect x="-22" y="-40" width="18" height="6" class="c-navy"/><rect x="2" y="-40" width="20" height="6" class="c-navy" fill-opacity=".7"/>`,
  windsock: `<rect x="-1.5" y="-60" width="3" height="60" class="c-grey"/><g class="anim-flag" transform="translate(0,-60)"><polygon points="0,-6 34,-2 34,2 0,6" class="c-orange"/><polygon points="12,-5 22,-4 22,4 12,5" class="c-cream"/></g>`,
  grassclump: `<ellipse cx="0" cy="0" rx="14" ry="4" class="c-teal" fill-opacity=".5"/><ellipse cx="-6" cy="-2" rx="6" ry="4" class="c-teal" fill-opacity=".5"/>`,
  bird: `<path d="M-8,0 Q-4,-5 0,0 Q4,-5 8,0" fill="none" class="s-navy" stroke-width="1.6" stroke-opacity=".7"/>`,
  cloud: `<ellipse cx="0" cy="0" rx="70" ry="20"/><ellipse cx="-34" cy="6" rx="40" ry="16"/><ellipse cx="38" cy="4" rx="46" ry="18"/><ellipse cx="6" cy="-10" rx="34" ry="16"/>`,
  // 站的小場景站的雲（起飛那一段離地之後）。
  cloudbase: `<ellipse cx="0" cy="6" rx="90" ry="22" class="c-cream"/><ellipse cx="-40" cy="10" rx="50" ry="18" class="c-cream"/><ellipse cx="46" cy="8" rx="56" ry="20" class="c-cream"/><ellipse cx="10" cy="14" rx="80" ry="12" class="c-navy" fill-opacity=".08"/>`,
};
export const SYMBOL_NAMES = Object.keys(SYMBOLS);
const defs = () => `<defs>` + SYMBOL_NAMES.map(k => `<symbol id="s-${k}" overflow="visible">${SYMBOLS[k]}</symbol>`).join("") +
  `<linearGradient id="g-am" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="st-teal" stop-opacity=".5"/><stop offset=".55" class="st-cream" stop-opacity="0"/></linearGradient>` +
  `<linearGradient id="g-pm" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="st-orange" stop-opacity=".55"/><stop offset=".55" class="st-sand" stop-opacity=".4"/><stop offset="1" class="st-cream" stop-opacity="0"/></linearGradient>` +
  `<linearGradient id="g-alt" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="st-navy" stop-opacity=".9"/><stop offset=".3" class="st-navy" stop-opacity=".55"/><stop offset=".6" class="st-teal" stop-opacity=".45"/><stop offset=".85" class="st-cream" stop-opacity=".15"/><stop offset="1" class="st-cream" stop-opacity="0"/></linearGradient>` +
  `<linearGradient id="g-horizon" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="st-cream" stop-opacity=".95"/><stop offset="1" class="st-cream" stop-opacity="0"/></linearGradient>` +
  `<linearGradient id="g-corner" x1="0" y1="1" x2="1" y2="0"><stop offset=".45" class="st-cream" stop-opacity="0"/><stop offset="1" class="st-cream" stop-opacity=".85"/></linearGradient>` +
  `<linearGradient id="g-foot" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="st-navy" stop-opacity="0"/><stop offset="1" class="st-navy" stop-opacity=".12"/></linearGradient>` +
  `<linearGradient id="g-ghaze" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="st-cream" stop-opacity="0"/><stop offset=".08" class="st-cream" stop-opacity=".62"/><stop offset=".4" class="st-sand" stop-opacity=".3"/><stop offset="1" class="st-sand" stop-opacity=".1"/></linearGradient>` +
  `<linearGradient id="g-floor" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="st-sand" stop-opacity=".55"/><stop offset="1" class="st-cream" stop-opacity=".9"/></linearGradient>` +
  `<linearGradient id="g-ceil" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="st-navy" stop-opacity=".22"/><stop offset="1" class="st-navy" stop-opacity=".06"/></linearGradient>` +
  `</defs>`;

// ── 每一站的小場景。原點在地面中央，往上畫。關鍵字不變（data.js），畫法換成機場的詞。每一種帶一個 anim-* 的鉤子給 motion() 動。 ──
// 室內的站畫在 0.8 倍那一層、室外的站是距離 f 的貼圖，所以這裡的大小介於兩者之間：人約 24 高。
const fig = (x, y, s, cls) => `<use href="#s-person" x="${x}" y="${y}" class="${cls}"${s !== 1 ? ` transform="translate(${x},${y}) scale(${s}) translate(${-x},${-y})"` : ""}/>`;
const gatepost = (x, cls) => `<rect x="${x - 2}" y="-70" width="4" height="70" class="c-grey"/><rect x="${x - 22}" y="-88" width="44" height="20" rx="2" class="c-navy"/><rect x="${x - 16}" y="-83" width="14" height="10" class="${cls || "c-orange"}"/><rect x="${x + 2}" y="-81" width="14" height="3" class="c-cream"/><rect x="${x + 2}" y="-76" width="10" height="2" class="c-cream" fill-opacity=".6"/>`;
const VIGNETTES = {
  // 成立：七個旅客在同一個登機門前面，門牌上的燈亮著。
  seven: () => `<ellipse cx="0" cy="2" rx="86" ry="12" class="c-sand" fill-opacity=".7"/>` + gatepost(0) +
    `<g class="anim-glow"><circle cx="-9" cy="-78" r="9" class="c-orange" fill-opacity=".35"/></g>` +
    [-58, -40, -22, 22, 40, 58].map((x, i) => fig(x, -2, 0.95, i % 2 ? "p-teal" : "p-navy")).join("") + fig(0, -10, 1.05, "p-orange"),
  // 導生：候機區的兩張座位，一個 mentor 一個學生面對面，中間一盞立燈。
  seats: () => `<ellipse cx="0" cy="2" rx="70" ry="12" class="c-sand" fill-opacity=".7"/>` +
    `<g transform="translate(-40,0)"><rect x="-16" y="-22" width="30" height="6" rx="2" class="c-teal"/><rect x="-16" y="-46" width="6" height="26" rx="2" class="c-teal"/><rect x="-14" y="-16" width="4" height="16" class="c-navy"/><rect x="9" y="-16" width="4" height="16" class="c-navy"/></g>` +
    `<g transform="translate(40,0) scale(-1,1)"><rect x="-16" y="-22" width="30" height="6" rx="2" class="c-teal"/><rect x="-16" y="-46" width="6" height="26" rx="2" class="c-teal"/><rect x="-14" y="-16" width="4" height="16" class="c-navy"/><rect x="9" y="-16" width="4" height="16" class="c-navy"/></g>` +
    fig(-36, -22, 1, "p-navy") + fig(36, -22, 1, "p-orange") +
    `<rect x="-2" y="-44" width="4" height="44" class="c-grey"/><circle cx="0" cy="-50" r="8" class="c-yellow"/><g class="anim-glow"><circle cx="0" cy="-50" r="26" class="c-yellow" fill-opacity=".18"/></g>`,
  // 線上博覽會：一塊出發看板前面站著兩個人抬頭看，看板上的格子會亮。
  board: () => `<ellipse cx="0" cy="2" rx="80" ry="12" class="c-sand" fill-opacity=".7"/>` +
    `<rect x="-3" y="-60" width="6" height="60" class="c-grey"/><rect x="-66" y="-112" width="132" height="54" rx="3" class="c-navy"/><rect x="-62" y="-108" width="124" height="8" class="c-orange"/>` +
    [0, 1, 2, 3].map(r => `<rect x="-60" y="${-96 + r * 9}" width="22" height="5" class="c-yellow" fill-opacity=".8"/><rect x="-32" y="${-96 + r * 9}" width="60" height="5" class="c-cream" fill-opacity=".7"/><rect x="34" y="${-96 + r * 9}" width="24" height="5" class="c-teal" fill-opacity=".8"/>`).join("") +
    `<g class="anim-glow"><rect x="-62" y="-100" width="124" height="42" class="c-cream" fill-opacity=".12"/></g>` + fig(-26, -2, 1, "p-navy") + fig(26, -2, 1, "p-teal"),
  // 校園大使：登機門的牌，上面一面會飄的小旗，兩個人。
  sign: () => `<ellipse cx="0" cy="2" rx="70" ry="12" class="c-sand" fill-opacity=".7"/>` + gatepost(0, "c-teal") +
    `<rect x="-1" y="-124" width="2" height="36" class="c-grey"/><g class="anim-flag" transform="translate(1,-124)"><polygon points="0,0 26,7 0,14" class="c-orange"/></g>` + fig(-24, 0, 1, "p-navy") + fig(20, 0, 1, "p-teal"),
  // 探索營：一組人排隊登機，前面一條橘色的伸縮帶，地勤在掃票。
  boarding: () => `<ellipse cx="6" cy="2" rx="96" ry="12" class="c-sand" fill-opacity=".7"/>` +
    `<rect x="-84" y="-30" width="4" height="30" class="c-grey"/><rect x="-24" y="-30" width="4" height="30" class="c-grey"/><rect x="36" y="-30" width="4" height="30" class="c-grey"/><g class="anim-flag" transform="translate(-82,-26)"><rect x="0" y="0" width="120" height="4" class="c-orange"/></g>` +
    [-70, -50, -30, -10, 10].map((x, i) => fig(x, -4, 0.95, i % 3 === 1 ? "p-orange" : i % 3 ? "p-teal" : "p-navy")).join("") +
    `<rect x="52" y="-26" width="36" height="26" class="c-cream"/><rect x="52" y="-26" width="36" height="4" class="c-navy"/>` + fig(70, -26, 0.9, "p-navy") + gatepost(92),
  // 校友：一片有地圖針的尾翼，兩個人，幾條航線。
  tail: () => `<ellipse cx="0" cy="2" rx="80" ry="12" class="c-sand" fill-opacity=".7"/>` +
    `<path d="M-70,-10 Q-30,-70 10,-40 Q30,-20 70,-60" fill="none" class="s-orange" stroke-width="2" stroke-dasharray="6 6" stroke-opacity=".8"/>` +
    `<path d="M-40,0 L-10,-96 L28,-96 L2,0Z" class="c-orange"/><path d="M-44,-4 L24,-4 L30,0 L-50,0Z" class="c-orange"/>` +
    `<g class="anim-glow"><circle cx="8" cy="-68" r="20" class="c-cream" fill-opacity=".3"/></g><polygon points="-2,-50 8,-78 18,-50" class="c-cream"/><circle cx="8" cy="-80" r="11" class="c-cream"/><circle cx="8" cy="-80" r="5" class="c-orange"/>` +
    fig(-56, 0, 1, "p-navy") + fig(54, 0, 1, "p-teal"),
  // 幹部：一排地勤，中間一位舉指揮棒，後面一台行李車。
  crew: () => `<ellipse cx="0" cy="2" rx="92" ry="12" class="c-sand" fill-opacity=".7"/>` +
    `<use href="#s-carts" x="30" y="-16" class="p-navy"/>` +
    [-62, -42, -22, 22, 42, 62].map((x, i) => `<use href="#s-crew" x="${x}" y="-2" class="${i % 2 ? "p-orange" : "p-teal"}"/>`).join("") +
    `<g class="anim-flag" transform="translate(0,-26)"><rect x="-1" y="-12" width="2" height="12" class="c-grey"/><rect x="-8" y="-14" width="16" height="3" class="c-orange"/></g><use href="#s-crew" x="0" y="0" class="p-orange" transform="translate(0,0) scale(1.1)"/>`,
  // 預設：一根指示牌（兩片箭頭板），一個人。
  signpost: () => `<ellipse cx="0" cy="2" rx="56" ry="10" class="c-sand" fill-opacity=".7"/><rect x="-3" y="-110" width="6" height="110" class="c-navy"/>` +
    `<g class="anim-flag" transform="translate(-6,-104)"><polygon points="0,0 50,0 62,11 50,22 0,22" class="c-orange"/><rect x="10" y="6" width="30" height="4" class="c-navy" fill-opacity=".6"/></g>` +
    `<polygon points="6,-74 -44,-74 -56,-63 -44,-52 6,-52" class="c-teal"/><rect x="-34" y="-68" width="30" height="4" class="c-navy" fill-opacity=".6"/>` + fig(30, 0, 1, "p-navy"),
};
export const MOTIFS = Object.keys(VIGNETTES);
export function vignetteSVG(motif) {
  const name = VIGNETTES[motif] ? motif : "signpost";
  return `<g class="vig vig-${name}">${VIGNETTES[name]()}</g>`;
}

// ── 把室內鋪出來（側視，x 是沿走道的距離，單位是 1 倍那一層的大小）──
const at = (name, x, extra) => `<use href="#s-${name}" x="${x}" y="0"${extra || ""}/>`;
export const BOARD_X = 1050;        // 出發看板掛在牆上這個位置（HTML 的字照這個點疊上去）
const GATE_X = 3900, BRIDGE_X = 4480;
function interior(tall) {
  // 牆（0.62 倍）：入口、報到、看板、安檢、窗牆、登機門、空橋。
  // 窗牆那一段牆是透明的（看得到外面），所以牆底只鋪到窗牆前，窗牆後再接回來。
  const wall = `<rect x="-1400" y="-700" width="3300" height="700" class="c-cream"/><rect x="1900" y="-700" width="1900" height="260" class="c-cream"/><rect x="1900" y="-60" width="1900" height="60" class="c-cream"/><rect x="3800" y="-700" width="${BRIDGE_X - 3800}" height="700" class="c-cream"/>` +
    `<rect x="-1400" y="-262" width="${BRIDGE_X + 1400}" height="6" class="c-navy" fill-opacity=".85"/><rect x="-1400" y="-254" width="${BRIDGE_X + 1400}" height="3" class="c-orange"/>` +
    at("doors", -300) + at("counter", 150) + at("counter", 420) + at("counter", 690) +
    `<g data-board="1" transform="translate(${BOARD_X},0)">${SYMBOLS.boardframe}</g>` +
    at("security", 1500) + [2050, 2350, 2650, 2950, 3250, 3550].map(x => at("pane", x)).join("") +
    at("gatedesk", GATE_X + 100) + `<rect x="${BRIDGE_X - 60}" y="-440" width="60" height="440" class="c-navy" fill-opacity=".9"/>` +
    [BRIDGE_X + 150, BRIDGE_X + 450, BRIDGE_X + 750, BRIDGE_X + 1050].map(x => at("bridgewall", x)).join("");
  // 窗外（0.5 倍）：停機坪、幾架飛機、遠處的機棚與塔台；空橋外面是機身。
  const outside = `<rect x="-2000" y="-30" width="9000" height="400" class="c-grey" fill-opacity=".35"/><rect x="-2000" y="-34" width="9000" height="4" class="c-navy" fill-opacity=".3"/>` +
    `<g data-mover="glide" data-x0="1200" data-v="-26" data-span="3600"><use href="#s-sideplane" class="p-teal" transform="scale(.55)"/></g>` +
    `<use href="#s-sideplane" x="2800" y="-40" class="p-orange" transform="translate(2800,-40) scale(.8) translate(-2800,40)"/><use href="#s-sideplane" x="4400" y="-80" class="p-navy" transform="translate(4400,-80) scale(.6) translate(-4400,80)"/>` +
    `<use href="#s-fueltruck" x="3400" y="-10" transform="translate(3400,-10) scale(1.6) translate(-3400,10)"/>` +
    `<g transform="translate(${(BRIDGE_X + 1300) * 1}, 0)">${SYMBOLS.fuselage}</g>`;
  // 走道（1 倍）：旅客（位置 frame() 寫）、排隊與候機的人、座位、資訊機、盆栽、垃圾桶。
  const idle = (x, cls, s) => `<g class="anim-idle" transform="translate(${x},0)"><use href="#s-pax" class="${cls}"${s ? ` transform="scale(${s})"` : ""}/></g>`;
  const mid = idle(300, "p-navy") + idle(560, "p-teal") + at("kiosk", 1250) + at("bin", 1330) + idle(1700, "p-orange") + at("plant", 1950) +
    idle(2900, "p-teal") + at("bin", 3350) + at("plant", 3450) +
    [GATE_X - 160, GATE_X + 320].map(x => at("seats", x)).join("") +
    `<use href="#s-sitpax" x="${GATE_X - 250}" y="-14" class="p-navy"/><use href="#s-sitpax" x="${GATE_X + 290}" y="-14" class="p-orange"/><use href="#s-sitpax" x="${GATE_X + 410}" y="-14" class="p-teal"/>` +
    `<g data-traveller="1"><use href="#s-traveller"/></g>`;
  // 前景（1.4 倍）：柱子、椅背、盆栽，掃過畫面的近處。
  const fore = (tall ? [] : [-700, 1100, 2900]).map(x => at("pillar", x, ' class="fore-pillar"')).join("") + (tall ? "" : at("plant", 2200) + at("seats", GATE_X + 60)) + at("pillar", BRIDGE_X - 40, ' class="fore-pillar"');
  return { outside, wall, mid, fore };
}

// ── 把室外鋪出來 ──
// 假亂數：同一個輸入永遠畫出同一座機場，重新整理不會換風景。
const rnd = seed => { let s = (seed * 9301 + 49297) % 233280; return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; }; };
const use = (name, X, Z, base, extra, Y) => ({ X, Z, base, svg: `<use href="#s-${name}" data-x="${f1(X)}" data-z="${f1(Z)}" data-b="${base}"${Y ? ` data-y="${f1(Y)}"` : ""}${extra || ""}/>` });
const TAILS = ["p-orange", "p-teal", "p-navy"];
function airportObjects(tall) {
  // 遠的那一邊（X 負，畫面左上）：航廈一路排到登機門之後、每三段一座空橋與一架停著的飛機；再過去是塔台與機棚。
  const r = rnd(5), out = [];
  for (let z = -1500, i = 0; z < 2700; z += 300, i++) {
    out.push(use("termseg", -330, z, 1.3));
    if (i % 3 === 1 && z !== 0) { out.push(use("jetway", -220, z, 1.2)); out.push(use("plane", -170, z + 30, 1, ` class="${TAILS[i % 3]}"`)); }
  }
  out.push(use("jetway", -220, 0, 1.2));   // 我們那一架一開始停的登機門
  out.push(use("tower", -560, 1700, 1.4));
  out.push(use("hangar", -520, 3300, 1.2)); out.push(use("hangar", -520, 4000, 1.2));
  out.push(use("termseg", -400, 4900, 1)); out.push(use("termseg", -400, 5200, 1));
  // 靠鏡頭這一邊（X 正）：遠端停機位的飛機、加油車、指示牌、草叢、風向袋。每一站前後留空給小場景。
  for (const [Z, c] of [[1150, "p-teal"], [2500, "p-orange"], [3600, "p-navy"], [5000, "p-teal"]]) out.push(use("plane", 360, Z, 1, ` class="${c}"`));
  out.push(use("fueltruck", 150, 850, 1)); out.push(use("fueltruck", 150, 3100, 1));
  for (let z = 400; z < APRON_LEN; z += 1400) out.push(use("taxisign", 125, z, 1));
  out.push(use("windsock", 280, APRON_LEN - 700, 1));
  if (!tall) for (let z = -600; z < APRON_LEN + 9000; z += 420 + r() * 400) out.push(use("grassclump", 260 + r() * 400, z, 1 + r() * 0.6));
  // 滑行道邊燈（青）每 220 一對；跑道邊燈（黃）每 160 一對。
  for (let z = -1200; z < APRON_LEN; z += 260) { out.push(use("edgelight", -ROAD_HALF - 12, z, 1)); out.push(use("edgelight", ROAD_HALF + 12, z, 1)); }
  for (let z = APRON_LEN + 400; z < APRON_LEN + 9500; z += 300) { out.push(use("rwylight", -RUNWAY_HALF - 14, z, 1)); out.push(use("rwylight", RUNWAY_HALF + 14, z, 1)); }
  return out;
}
function stopObjects(w, motifs) {
  const out = [];
  w.stops.forEach((s, i) => {
    if (s.phase === "terminal") return;
    const base = s.y > 0 ? 1.15 : 1;
    const cloud = s.y > 0 ? `<use href="#s-cloudbase"/>` : `<g class="stop-dot"><circle cx="${-s.x + ROAD_HALF + 14}" cy="0" r="12" class="c-orange" fill-opacity=".3"/><circle cx="${-s.x + ROAD_HALF + 14}" cy="0" r="6" class="c-orange"/></g>`;
    out.push({ X: s.x, Z: s.z, base, svg: `<g class="stop" data-stop="${i}" data-x="${s.x}" data-z="${f1(s.z)}" data-y="${f1(s.y)}" data-b="${base}">${cloud}${vignetteSVG(motifs[i])}</g>` });
  });
  return out;
}
function terminalStops(w, motifs, tall) {
  return w.stops.map((s, i) => s.phase === "terminal" ? `<g class="stop" data-stop="${i}" transform="translate(${f1(s.x)},0) scale(${vigInt(tall)})">${vignetteSVG(motifs[i])}</g>` : "").join("");
}
function lifeObjects() {
  // 地上會動的東西：Z 由 frame() 照時間算，這裡只給起點、速度與哪一條線。我們那一架與它的影子位置由 frame() 照進度寫。
  const m = (name, X, z0, v, cls) => `<g data-mover="${name}" data-x="${X}" data-z0="${z0}" data-v="${v}"><use href="#s-${name === "walker" ? "crew" : name === "fuel" ? "fueltruck" : name}" class="${cls}"/></g>`;
  return m("carts", 150, 300, 95, "p-navy") + m("carts", 150, 1900, 80, "p-navy") + m("fuel", 130, 1200, -120, "p-teal") +
    m("walker", 115, 500, 18, "p-orange") + m("walker", 118, 1600, -16, "p-teal") +
    `<g data-shadow="1"><use href="#s-planeshadow"/></g><g data-plane="1"><use href="#s-btplane" class="pl-ground"/><use href="#s-btclimb" class="pl-climb" opacity="0"/></g>`;
}
function fields(tall) {
  // 草地的色塊與航廈前的混凝土：每一幀投影四個角。
  const r = rnd(21), out = [];
  const quad = (X0, X1, z, L, cls, op) => out.push(`<polygon data-paddy="1" data-x0="${f1(X0)}" data-x1="${f1(X1)}" data-z0="${f1(z)}" data-z1="${f1(z + L)}" class="${cls}" fill-opacity="${op}"/>`);
  quad(-130, -330, -1700, 4400, "c-grey", ".3");       // 航廈前的停機坪
  quad(130, 520, -1700, 7400, "c-grey", ".22");        // 這一邊的機坪與服務道
  quad(-RUNWAY_HALF - 60, -1400, APRON_LEN - 300, 12000, "c-teal", ".18");
  if (!tall) for (let z = -1500; z < APRON_LEN + 9000; z += 500 + r() * 400) { const X0 = -500 - r() * 200; quad(X0, X0 - 300 - r() * 300, z, 200 + r() * 200, "c-teal", r() < 0.5 ? ".2" : ".3"); }
  for (let z = -1500; z < APRON_LEN + 9000; z += 600 + r() * 500) { const X0 = 560 + r() * 200; quad(X0, X0 + 300 + r() * 300, z, 200 + r() * 260, "c-teal", ".14"); }
  // 跑道頭的白條（鋼琴鍵）。
  for (let k = -3; k <= 3; k++) if (k) quad(k * 36 - 10, k * 36 + 10, APRON_LEN + 460, 220, "c-cream", ".85");
  return out.join("");
}
function clouds3d(tall) {
  // 有高度的雲：起飛之後鏡頭爬到它們上面，它們就從底下過。離地前藏著（frame() 看 lift）。
  const r = rnd(33), out = [];
  for (let i = 0; i < (tall ? 10 : 16); i++) out.push(use("cloud", -1800 + r() * 3600, APRON_LEN + 1500 + r() * 12000, 2 + r() * 2.5, ' class="c-cream cloud3d" fill-opacity=".9"', 380 + r() * 520));
  return out;
}
function mountains() {
  const r = rnd(7);
  const ridge = (base, amp, step, op) => {
    const p = [[-1600, 6]];
    for (let x = -1600; x <= 2800; x += step) p.push([x, base + (r() - 0.5) * amp - (Math.round(x / step) % 3 ? 0 : amp * 0.35)]);
    p.push([2800, 6]);
    return `<polygon points="${p.map(([x, y]) => `${f1(x)},${f1(y)}`).join(" ")}" class="c-navy" fill-opacity="${op}"/>`;
  };
  return ridge(-70, 60, 110, ".1") + ridge(-36, 44, 80, ".16") + ridge(-10, 26, 60, ".22");
}

const sortedBy = (cam, list) => list.sort((a, b) => order(cam, b.X, b.Z) - order(cam, a.X, a.Z)).map(o => o.svg).join("");
// 只有站那一層：資料來了之後塞進已經鋪好的機場裡（main.js 的 placeStops），不用整個場景重鋪。
export function stopsSVG(w, motifs) {
  const m = Array.isArray(motifs) ? motifs : [];
  return sortedBy(camera(1000, false), stopObjects(w, m));
}
export const terminalStopsSVG = (w, motifs, tall) => terminalStops(w, Array.isArray(motifs) ? motifs : [], !!tall);
// 整個場景的 <svg> 內容。motifs[i] 是第 i 站要畫的小場景名字。tall 是直式（手機）：少畫一些。
// 資料還沒來就可以鋪（world(0) 沒有站，機場與航廈照鋪），來了用 placeStops() 把站放進去。
export function sceneSVG(w, motifs, tall) {
  const m = Array.isArray(motifs) ? motifs : [];
  const cam = camera(1000, !!tall);
  const sorted = list => sortedBy(cam, list);
  const sky = `<g data-layer="sky"><rect class="sky-base c-cream" x="-4000" y="-3000" width="12000" height="6000"/><rect class="sky-am" x="-4000" y="-3000" width="12000" height="6000" fill="url(#g-am)"/><rect class="sky-pm" x="-4000" y="-3000" width="12000" height="6000" fill="url(#g-pm)" opacity="0"/><rect class="sky-alt" x="-4000" y="-3000" width="12000" height="6000" fill="url(#g-alt)" opacity="0"/>` +
    `<g class="sun"><circle cx="0" cy="0" r="80" class="c-yellow" fill-opacity=".16"/><circle cx="0" cy="0" r="44" class="c-yellow" fill-opacity=".95"/><circle cx="0" cy="0" r="44" class="sun-pm c-orange" fill-opacity="0"/></g>` +
    [0, 1, 2, 3, 4].map(i => `<g class="cloud" transform="translate(${-200 + i * 420} ${30 + (i % 3) * 30}) scale(${0.6 + (i % 2) * 0.35})"><use href="#s-cloud" class="c-navy" fill-opacity=".06" y="8"/><use href="#s-cloud" class="c-cream"/></g>`).join("") +
    [0, 1, 2].map(i => `<g data-mover="bird" data-i="${i}"><use href="#s-bird" x="${120 + i * 36}" y="${150 + i * 14}"/></g>`).join("") + `</g>`;
  // 室外。
  const far = `<g data-layer="far"><g class="ridges">${mountains()}</g><rect class="horizon-haze" x="-4000" y="0" width="12000" height="200" fill="url(#g-horizon)"/></g>`;
  const back = `<g data-layer="back"><rect class="ground c-teal" fill-opacity=".3" x="-4000" y="0" width="12000" height="4000"/></g>`;
  const field = `<g data-layer="field">${fields(tall)}</g>`;
  const town = `<g data-layer="town">${sorted(airportObjects(tall))}</g>`;
  const road = `<g data-layer="road"><polygon class="verge-l c-grey" fill-opacity=".5"/><polygon class="verge-r c-grey" fill-opacity=".5"/><polygon class="asphalt c-navy" fill-opacity=".62"/><path class="dashes c-yellow" fill-opacity=".9"/></g>`;
  const stops = `<g data-layer="stops">${stopsSVG(w, m)}</g>`;
  const life = `<g data-layer="life">${lifeObjects()}</g>`;
  const near = `<g data-layer="near"></g>`;
  const cl = `<g data-layer="clouds">${sorted(clouds3d(tall))}</g>`;
  const groundHaze = `<rect class="ground-haze" x="-4000" y="0" width="12000" height="1400" fill="url(#g-ghaze)" opacity="0"/>`;
  const ext = `<g data-world="ext">${far}${back}${field}${town}${road}${stops}${life}${near}${cl}${groundHaze}</g>`;
  // 室內。每一層的 transform 由 frame() 寫；地板與天花板的跨線也是。
  const it = interior(!!tall);
  const int = `<g data-world="int"${tall ? ' data-tall="1"' : ""}>` +
    `<g data-layer="ceiling"><polygon class="ceil-base c-cream" points="0,0 1000,0 1000,${INT.ceilY} 0,${INT.ceilY}"/><polygon class="ceil-slab" points="0,0 1000,0 1000,${INT.ceilY} 0,${INT.ceilY}" fill="url(#g-ceil)"/><path class="ceil-beams s-navy" fill="none" stroke-width="3" stroke-opacity=".18"/><path class="ceil-lights c-yellow" fill-opacity=".55"/></g>` +
    `<g data-layer="floor"><polygon class="floor-slab" points="0,${INT.wallY} 1000,${INT.wallY} 1000,800 0,800" fill="url(#g-floor)"/><path class="floor-lines s-navy" fill="none" stroke-width="2" stroke-opacity=".12"/><path class="floor-rows s-navy" fill="none" stroke-width="1.5" stroke-opacity=".1"/></g>` +
    `<g data-layer="outside">${it.outside}</g><g data-layer="wall">${it.wall}</g><g data-layer="vig">${terminalStops(w, m, !!tall)}</g><g data-layer="mid">${it.mid}</g><g data-layer="fore">${it.fore}</g></g>`;
  const haze = `<g data-layer="haze"><rect class="corner-haze" x="0" y="0" width="1000" height="800" fill="url(#g-corner)"/><rect class="foot-haze" x="-4000" y="600" width="12000" height="200" fill="url(#g-foot)"/></g>`;
  return defs() + sky + ext + int + haze;
}

// ── 每一幀：把世界投到畫面上。純 DOM 寫入，沒有動畫。 ──
export function attach(svg) {
  const q = s => [...svg.querySelectorAll(s)];
  const sprite = el => ({ el, X: +el.dataset.x, Y: +el.dataset.y || 0, Z: +el.dataset.z, base: +el.dataset.b || 1, cloud: el.classList.contains("cloud3d"), last: "" });
  const reg = {
    svg, tall: !!svg.querySelector('[data-tall]'), stopsLayer: svg.querySelector('[data-layer="stops"]'), vigLayer: svg.querySelector('[data-layer="vig"]'),
    sprites: q("[data-z]").map(sprite),
    movers: q("[data-mover]").filter(el => !/bird|glide/.test(el.dataset.mover)).map(el => ({ el, X: +el.dataset.x, z0: +el.dataset.z0, v: +el.dataset.v, base: 1, last: "" })),
    glides: q("[data-mover='glide']").map(el => ({ el, x0: +el.dataset.x0, v: +el.dataset.v, span: +el.dataset.span, last: "" })),
    paddies: q("[data-paddy]").map(el => ({ el, x0: +el.dataset.x0, x1: +el.dataset.x1, z0: +el.dataset.z0, z1: +el.dataset.z1, last: "" })),
    road: { asphalt: svg.querySelector(".asphalt"), l: svg.querySelector(".verge-l"), r: svg.querySelector(".verge-r"), dashes: svg.querySelector(".dashes") },
    sky: { pm: svg.querySelector(".sky-pm"), alt: svg.querySelector(".sky-alt"), sun: svg.querySelector(".sun"), sunPm: svg.querySelector(".sun-pm") },
    ridges: svg.querySelector(".ridges"), horizon: svg.querySelector(".horizon-haze"), ground: svg.querySelector(".ground"), groundHaze: svg.querySelector(".ground-haze"),
    corner: svg.querySelector(".corner-haze"), foot: svg.querySelector(".foot-haze"),
    ext: svg.querySelector('[data-world="ext"]'), int: svg.querySelector('[data-world="int"]'),
    layers: Object.fromEntries(LAYERS_INT.map(([n, k]) => [n, { el: svg.querySelector(`[data-layer="${n}"]`), k, last: "" }])),
    ceil: { slab: svg.querySelector(".ceil-slab"), base: svg.querySelector(".ceil-base"), beams: svg.querySelector(".ceil-beams"), lights: svg.querySelector(".ceil-lights") },
    floor: { slab: svg.querySelector(".floor-slab"), lines: svg.querySelector(".floor-lines"), rows: svg.querySelector(".floor-rows") },
    traveller: svg.querySelector("[data-traveller]"), legA: svg.querySelector(".leg-a"), legB: svg.querySelector(".leg-b"), arm: svg.querySelector(".arm"),
    plane: { el: svg.querySelector("[data-plane]"), base: 1.15, last: "" }, planeGround: svg.querySelector("[data-plane] .pl-ground"), planeClimb: svg.querySelector("[data-plane] .pl-climb"), shadow: { el: svg.querySelector("[data-shadow]"), base: 1, last: "" },
    board: svg.querySelector("[data-board]"),
  };
  return reg;
}
// 資料來了：把站放進鋪好的機場（室外那一層）與航廈（室內那一層），重新記一次要動的節點。
export function placeStops(reg, w, motifs) {
  reg.stopsLayer.innerHTML = stopsSVG(w, motifs);
  reg.vigLayer.innerHTML = terminalStopsSVG(w, motifs, reg.tall);
  const sprite = el => ({ el, X: +el.dataset.x, Y: +el.dataset.y || 0, Z: +el.dataset.z, base: +el.dataset.b || 1, cloud: el.classList.contains("cloud3d"), last: "" });
  reg.sprites = [...reg.svg.querySelectorAll("[data-z]")].map(sprite);
  reg.lastP = undefined;
}
// 視窗大小變了：地平線、霧、地面、地板與天花板的位置跟著鏡頭算。
export function layout(reg, cam) {
  horizonLayout(reg, cam);
  reg.corner.setAttribute("width", f1(cam.viewW)); reg.corner.setAttribute("height", H);
  reg.foot.setAttribute("y", f1(H - 160)); reg.foot.setAttribute("height", "160");
  reg.ceil.slab.setAttribute("points", `0,0 ${f1(cam.viewW)},0 ${f1(cam.viewW)},${INT.ceilY} 0,${INT.ceilY}`);
  reg.ceil.base.setAttribute("points", `0,0 ${f1(cam.viewW)},0 ${f1(cam.viewW)},${INT.ceilY} 0,${INT.ceilY}`);
  reg.floor.slab.setAttribute("points", `0,${INT.wallY} ${f1(cam.viewW)},${INT.wallY} ${f1(cam.viewW)},800 0,800`);
  reg.lastP = undefined;
}
function horizonLayout(reg, cam) {
  const hy = horizonY(cam);
  reg.ground.setAttribute("y", f1(hy - 2));
  reg.horizon.setAttribute("y", f1(hy - 40)); reg.horizon.setAttribute("height", "260");
  reg.groundHaze.setAttribute("y", f1(hy - 30));
}
const set = (o, attr, v) => { if (o.last !== v) { o.last = v; o.el.setAttribute(attr, v); } };
const hide = o => { if (o.hidden !== true) { o.hidden = true; o.el.setAttribute("visibility", "hidden"); } };
const show = o => { if (o.hidden !== false) { o.hidden = false; o.el.removeAttribute("visibility"); } };
function place(o, p, extra) {
  if (!p || p.depth > farNow) { hide(o); return; }
  show(o);
  const k = p.s * o.base, flip = o.v < 0 ? -1 : 1;
  set(o, "transform", `translate(${f1(p.x)} ${f1(p.y)}) ${extra || ""}scale(${f1(k * flip * 100) / 100} ${f1(k * 100) / 100})`);
  const fadeFrom = FADE_FROM * (farNow / FAR);
  const fade = p.depth > fadeFrom ? Math.max(0.06, 1 - (p.depth - fadeFrom) / (farNow - fadeFrom)) : 1;
  const fv = String(Math.round(fade * 20) / 20);
  if (o.fade !== fv) { o.fade = fv; o.el.setAttribute("opacity", fv); }
}
// 室內一層的 transform：畫面 x = xT + (x - 旅客x) * k，y 是那一層的地面線。
const layerT = (cam, tx, k) => `translate(${f1(cam.xT - tx * k)} ${f1(intY(k))}) scale(${k})`;
// 地板的跨線（從牆腳到近端）與天花板的橫樑：每 200 一條，只畫看得到的。
function crossLines(cam, tx, yFar, kFar, yNear, kNear, step, off) {
  let d = "";
  const x0 = Math.floor((tx - cam.viewW * 1.2 / kFar) / step) * step + (off || 0), x1 = tx + cam.viewW * 1.2 / kFar;
  for (let x = x0; x < x1; x += step) d += `M${f1(cam.xT + (x - tx) * kFar)},${yFar}L${f1(cam.xT + (x - tx) * kNear)},${yNear}`;
  return d;
}
// p 是進度（已經慢下來的 e 由這裡算）、t 是秒（閒置動畫的時鐘，靜態時給 0）。回這一幀每一站在畫面上的點與看板的位置，給 HTML 用。
export function frame(reg, w, cam, p, t) {
  const e = eased(w, p), hd = handoff(e), vc = viewCam(cam, e), q = planePose(e), cz = camZ(w, e), tx = travellerX(e);
  const still = reg.lastP === p && reg.lastCam === cam;
  reg.lastP = p; reg.lastCam = cam;
  if (!still) {
    // 兩個世界的顯示與換鏡。室內以空橋的窗為中心放大淡出，室外從大一點縮回來。
    const intOn = hd.int > 0, extOn = hd.ext > 0;
    reg.int.setAttribute("opacity", f1(hd.int * 10) / 10); reg.int.style.display = intOn ? "" : "none";
    reg.ext.setAttribute("opacity", f1(hd.ext * 10) / 10); reg.ext.style.display = extOn ? "" : "none";
    const ox = cam.xT + 140, oy = 400, sl = hd.slide || 0;
    reg.int.setAttribute("transform", sl > 0 ? `translate(${f1(-sl * 260)} ${f1(-sl * 90)}) translate(${f1(ox)} ${oy}) scale(${f1(1 + 0.25 * sl)}) translate(${f1(-ox)} ${-oy})` : "");
    reg.ext.setAttribute("transform", hd.ext < 1 ? `translate(${f1(cam.cx)} ${cam.cy}) scale(${f1(1.2 - 0.2 * hd.ext)}) translate(${f1(-cam.cx)} ${-cam.cy})` : "");
    if (intOn) {
      for (const n in reg.layers) { const L = reg.layers[n]; set(L, "transform", layerT(cam, tx, L.k)); }
      reg.floor.lines.setAttribute("d", crossLines(cam, tx, INT.wallY, INT.wallK, INT.nearY, INT.nearK, 200));
      reg.floor.rows.setAttribute("d", [0.72, 0.86, 1.02, 1.2].map(k => `M0,${f1(intY(k))}L${f1(cam.viewW)},${f1(intY(k))}`).join(""));
      reg.ceil.beams.setAttribute("d", crossLines(cam, tx, INT.ceilY, INT.wallK, 0, INT.wallK * (eyeY / (eyeY - INT.ceilY)), 400, 100));
      reg.ceil.lights.setAttribute("d", ceilLights(cam, tx));
      // 旅客：站在畫面固定的位置，腿照走的距離擺（到了機艙門就站定）。
      const walking = e < WALK_END, a = walking ? Math.sin(tx / 34) * 24 : 0;
      reg.traveller.setAttribute("transform", `translate(${f1(tx)},0)`);
      reg.legA.setAttribute("transform", `rotate(${f1(a)} 0 -66)`); reg.legB.setAttribute("transform", `rotate(${f1(-a)} 0 -66)`);
      reg.arm.setAttribute("transform", `rotate(${f1(-a * 0.8)} 16 -112)`);
    }
    if (extOn) {
      farNow = FAR + 3000 * q.lift;
      if (q.lift) horizonLayout(reg, vc); else if (reg.lifted) horizonLayout(reg, cam);
      reg.lifted = q.lift > 0;
      const rd = roadPolygon(vc, cz, w.length);
      reg.road.asphalt.setAttribute("points", rd.points);
      reg.road.l.setAttribute("points", strip(vc, cz, w.length, -ROAD_HALF - 26, -ROAD_HALF));
      reg.road.r.setAttribute("points", strip(vc, cz, w.length, ROAD_HALF, ROAD_HALF + 26));
      reg.road.dashes.setAttribute("d", centreline(vc, cz, w.length));
      for (const qd of reg.paddies) {
        if (qd.z1 < cz - 100 || qd.z0 > cz + farNow) { hide(qd); continue; }
        const a = project(vc, qd.x0, 0, Math.max(qd.z0, cz + 50), cz), b = project(vc, qd.x1, 0, Math.max(qd.z0, cz + 50), cz), c = project(vc, qd.x1, 0, qd.z1, cz), d = project(vc, qd.x0, 0, qd.z1, cz);
        if (!(a && b && c && d)) { hide(qd); continue; }
        show(qd); set(qd, "points", pts([a, b, c, d]));
      }
      for (const o of reg.sprites) {
        if (o.cloud && !q.lift) { hide(o); continue; }
        if (o.cloud) { const pp = project(vc, o.X, o.Y, o.Z, cz); if (pp) pp.depth = Math.min(pp.depth, FADE_FROM); place(o, pp); continue; }
        place(o, project(vc, o.X, o.Y, o.Z, cz));
      }
      // 我們那一架與它的影子。
      const pp = project(vc, q.x, q.y, q.z, cz);
      place(reg.plane, pp);
      // 離地那一下：地面那一張淡出、爬升那一張淡入（兩張都是預先畫好的四分之三視角）。
      const k = String(Math.round(smooth(clamp01((q.lift - 0.04) / 0.22)) * 10) / 10);
      if (reg.planeClimb && reg.climbLast !== k) { reg.climbLast = k; reg.planeClimb.setAttribute("opacity", k); reg.planeGround.setAttribute("opacity", String(1 - k)); }
      const sh = project(vc, q.x, 0, q.z, cz);
      if (sh) { sh.s *= Math.max(0.35, 1 - q.lift * 0.6); place(reg.shadow, sh); reg.shadow.el.setAttribute("opacity", f1(1 - q.lift * 0.8)); } else hide(reg.shadow);
      // 地面退進霧裡、天空變高空的藍。
      reg.groundHaze.setAttribute("opacity", f1(q.lift * 10) / 10);
      reg.sky.alt.setAttribute("opacity", f1(q.lift * 10) / 10);
      reg.sky.pm.setAttribute("opacity", f1((1 - q.lift * 0.7) * 10) / 10);
      reg.horizon.setAttribute("opacity", f1((1 - q.lift * 0.55) * 20) / 20);
      // 跑道與地面退遠：離地之後霧從更遠的地方開始、也更遠才消失，跑道一路收細進去。
      if (reg.ridges) reg.ridges.setAttribute("transform", `translate(${f1(-cz * 0.025 + cam.viewW * 0.3)} ${f1(horizonY(vc) + 2)})`);
    }
    // 天空：早晨到黃昏（到跑道頭），太陽慢慢往右下走、變橘。
    const day = clamp01(e / PHASES.takeoff[0]);
    reg.sky.pm.setAttribute("opacity", f1(day * (1 - q.lift * 0.7) * 10) / 10);
    reg.sky.sunPm.setAttribute("fill-opacity", f1(day * 8) / 10);
    reg.sky.sun.setAttribute("transform", `translate(${f1(cam.viewW * (0.2 + 0.55 * day))} ${f1(horizonY(vc) - 110 + 60 * day - 120 * q.lift)})`);
  }
  // 會動的：地上的車與人永遠在鏡頭前面那一段路上繞圈；窗外的飛機慢慢滑。
  if (hd.ext > 0) for (const o of reg.movers) {
    const lo = cz - 160, span = 2600;
    const z = lo + (((o.z0 + o.v * t - lo) % span) + span) % span;
    place(o, project(vc, o.X, 0, z, cz));
  }
  if (hd.int > 0) for (const g of reg.glides) { const x = g.x0 + (((g.v * t) % g.span) + g.span) % g.span - g.span / 2; set(g, "transform", `translate(${f1(x)} 0)`); }
  const stops = stopPoints(w, cam, e);
  const bx = cam.xT + (BOARD_X - tx) * INT.wallK, board = hd.int > 0 && bx > -400 && bx < cam.viewW + 400 ? { x: bx, y: intY(INT.wallK) - 470 * INT.wallK, s: INT.wallK } : null;
  return { stops, board, e, end: e > 0.985 };
}
// 天花板的燈：每根橫樑上一條短的亮條。
function ceilLights(cam, tx) {
  let d = "";
  const kFar = INT.wallK, kNear = INT.wallK * ((eyeY - 40) / (eyeY - INT.ceilY));
  for (let x = Math.floor((tx - cam.viewW * 2) / 400) * 400 + 300; x < tx + cam.viewW * 2; x += 400) {
    const xf = cam.xT + (x - tx) * kFar, xn = cam.xT + (x - tx) * kNear;
    const t0 = 0.35, t1 = 0.7, ax = xf + (xn - xf) * t0, ay = INT.ceilY - 6 + (40 - INT.ceilY + 6) * t0, bx = xf + (xn - xf) * t1, by = INT.ceilY - 6 + (40 - INT.ceilY + 6) * t1;
    d += `M${f1(ax - 3)},${f1(ay)}L${f1(bx - 4)},${f1(by)}L${f1(bx + 4)},${f1(by)}L${f1(ax + 3)},${f1(ay)}Z`;
  }
  return d;
}

/* ── 這裡面才有動畫。外面不准出現 gsap。 ──
   釘住 stage、用捲動進度推鏡頭；閒置的時鐘（行李車、窗外滑行的飛機、鳥、信標、頻閃、看板翻牌、旅客的晃）也在這裡。
   回傳幾個外面會用到的把手（跳到某一站、重算、重新掛閒置動畫），外面拿到的只是函式，碰不到 gsap。 */
export function motion({ wrap, stage, svg, onProgress, onTick }) {
  gsap.registerPlugin(ScrollTrigger);
  // 進度先經過一個很短的追趕，捲動停下來鏡頭還會滑半拍，比直接貼著捲軸自然。
  // ⚠ 不用 gsap.quickTo：它記得自己上一次的起點，直接改 proxy.p 它不會知道，鏡頭會從舊值一路滑過去
  //（2026-11-06 實測：帶 #代號 進來，捲軸對了，畫面卻從第一站滑到第五站）。每次開一個新 tween、overwrite 掉舊的，起點永遠是現在的值。
  const proxy = { p: 0 };
  const chase = (p, instant) => {
    gsap.killTweensOf(proxy);
    if (instant) { proxy.p = p; onProgress(p); return; }
    gsap.to(proxy, { p, duration: 0.5, ease: "power2.out", overwrite: true, onUpdate: () => onProgress(proxy.p) });
  };
  const st = ScrollTrigger.create({
    trigger: wrap, start: "top top", end: "bottom bottom", pin: stage, pinSpacing: false, anticipatePin: 1,
    onUpdate: self => chase(self.progress),
    onRefresh: self => chase(self.progress, true),
  });
  const t0 = gsap.ticker.time;
  const tick = () => onTick(gsap.ticker.time - t0);
  gsap.ticker.add(tick);
  // 閒置動畫。只碰 class，不碰位置（位置每一幀由 frame() 寫）。範圍是整個 stage（看板的 HTML 也在裡面）。
  const bindIdle = () => gsap.context(() => {
    gsap.to(".anim-flag", { skewY: 4, scaleX: 0.96, transformOrigin: "0% 100%", duration: 1.4, ease: "sine.inOut", yoyo: true, repeat: -1, stagger: 0.2 });
    gsap.to(".anim-glow", { opacity: 0.35, duration: 1.6, ease: "sine.inOut", yoyo: true, repeat: -1, stagger: 0.3 });
    gsap.to(".anim-idle", { y: -3, duration: 1.3, ease: "sine.inOut", yoyo: true, repeat: -1, stagger: 0.35 });
    gsap.to(".anim-beacon", { opacity: 0.15, duration: 0.5, ease: "power2.inOut", yoyo: true, repeat: -1 });
    gsap.fromTo(".anim-strobe", { opacity: 1 }, { opacity: 0.05, duration: 0.12, ease: "none", repeat: -1, repeatDelay: 1.1, yoyo: true });
    gsap.utils.toArray(".cloud").forEach((c, i) => gsap.to(c, { x: "+=" + (160 + i * 40), duration: 70 + i * 15, ease: "none", repeat: -1, yoyo: true }));
    gsap.utils.toArray("[data-mover='bird']").forEach((b, i) => {
      gsap.fromTo(b, { x: -200 - i * 120 }, { x: 1600, duration: 48 + i * 9, ease: "none", repeat: -1, delay: i * 6 });
      gsap.to(b, { y: "+=12", duration: 1.1 + i * 0.2, ease: "sine.inOut", yoyo: true, repeat: -1 });
      gsap.to(b.firstElementChild, { scaleY: 0.3, transformOrigin: "50% 50%", duration: 0.32, ease: "sine.inOut", yoyo: true, repeat: -1 });
    });
    // 出發看板：每幾秒整面翻一次（每一片從上往下翻下來）。
    const flips = gsap.utils.toArray(".board .flip");
    if (flips.length) gsap.fromTo(flips, { rotateX: -90, transformOrigin: "50% 0%" }, { rotateX: 0, duration: 0.45, ease: "power2.out", stagger: { each: 0.035, from: "start" }, repeat: -1, repeatDelay: 7 });
  }, stage);
  let idle = bindIdle();
  return {
    refresh: () => ScrollTrigger.refresh(),
    scrollFor: p => st.start + (st.end - st.start) * clamp01(p),
    range: () => ({ start: st.start, end: st.end }),
    jump: (p, instant) => {
      const y = st.start + (st.end - st.start) * clamp01(p);
      if (instant) { chase(p, true); window.scrollTo(0, y); }
      else { const o = { y: window.scrollY }; gsap.to(o, { y, duration: 0.9, ease: "power2.inOut", onUpdate: () => window.scrollTo(0, o.y) }); }
    },
    // 場景重畫（直式橫式切換、看板重畫）之後，閒置動畫要重新掛在新的節點上。
    rebind: () => { idle.revert(); idle = bindIdle(); },
  };
}
