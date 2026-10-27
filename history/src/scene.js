// /history/ 的場景（批 3，2026-11-06 重畫）：一台架得高、斜著往下看的鏡頭，一條退進霧裡的路，路邊的村子，每一站路邊的小場景。
//
// ── 讀這一支之前先知道四件事 ──
// 1. **資料與場景分開。** 這裡沒有任何一站的文字，只拿「有幾站」與「每站畫哪一種小場景」兩個輸入。
//    加一站永遠不碰這支（test/history-page.test.mjs 守著：場景 SVG 裡找不到任何站的標題）。
// 2. **顏色不寫色碼。** 每個形狀掛 class（c-navy、c-teal、c-orange、c-sand、c-cream、c-yellow、c-grey），
//    真正的顏色在 history.css 用 var(--bt-*) 給，深淺一律用 fill-opacity。check.sh 的七色白名單因此掃得到。
// 3. **會動的只有 motion()。** gsap 與 ScrollTrigger 只准出現在 motion() 裡（check.sh 守著）。
//    frame() 每一幀改 DOM 的位置，但它只是算數學寫屬性，不是動畫；誰呼叫它（捲動的追趕、閒置的時鐘）才在 motion() 裡。
// 4. **怎麼做出深度。** 這一版不是「幾層各自平移」，是真的針孔投影（pinhole）：
//    世界座標 X（橫向，路中央是 0，正的那一邊靠鏡頭）、Y（高度）、Z（沿路往前）。
//    鏡頭在路的右上方、高 h、往下俯 pitch、往左偏 yaw，所以路在畫面上從左下往右上退進霧裡，近寬遠窄。
//    每個物件是一張站在地上的平面貼圖（billboard）：自己畫了受光面、背光面、屋頂與朝右下的長影，
//    每一幀只算「它在畫面哪裡、放大幾倍、離多遠（霧）」三個數字。繞不到它背面，但在這條路上也不需要。
//
// 單位：viewBox 高 800（H）。符號（<symbol>）畫的是「距離鏡頭 f 時的大小」，投影的放大倍數 s = f / depth。

export const H = 800;
export const GAP = 900;          // 站與站沿路的距離
export const FIRST_Z = 600;      // 第一站在路上的位置
export const AHEAD = 560;        // 鏡頭停在每一站前面這麼遠
export const ROAD_HALF = 60;     // 路的半寬
export const STOP_X = 135;       // 小場景站在路的這一邊（靠鏡頭那一邊）
const FAR = 3600, FADE_FROM = 1300;   // 比 FAR 遠就不畫；從 FADE_FROM 開始淡進霧裡
const NEAR_CLIP = 40;

// ── 鏡頭 ──
// 橫式：路斜斜往右上。直式（手機）：鏡頭更高、偏轉更小，路更陡，畫面窄也看得到路往前走。
export function camera(viewW, tall) {
  return tall
    ? { cx: viewW * 0.5, cy: 380, f: 600, h: 360, pitch: 0.52, yaw: 0.3, x: 240, viewW }
    : { cx: viewW * 0.5, cy: 430, f: 700, h: 330, pitch: 0.4, yaw: 0.52, x: 194, viewW };
}
export const horizonY = cam => cam.cy - cam.f * Math.tan(cam.pitch);

// 世界的一點投到畫面。回 { x, y, s, depth }，在鏡頭後面回 null。
export function project(cam, X, Y, Z, camZ) {
  const dx = X - cam.x, dz = Z - camZ, dy = Y - cam.h;
  const sy = Math.sin(cam.yaw), cy = Math.cos(cam.yaw);
  const xr = dx * cy + dz * sy, zr = -dx * sy + dz * cy;
  const sp = Math.sin(cam.pitch), cp = Math.cos(cam.pitch);
  const depth = -dy * sp + zr * cp;
  if (depth < NEAR_CLIP) return null;
  const k = cam.f / depth;
  return { x: cam.cx + xr * k, y: cam.cy - (dy * cp + zr * sp) * k, s: k, depth };
}
// 物件之間誰在前面：鏡頭只沿 Z 走，所以相對順序永遠不變，建的時候排一次就好。
const order = (cam, X, Z) => -(X - cam.x) * Math.sin(cam.yaw) + Z * Math.cos(cam.yaw);

// ── 世界：幾站就多長。路與村子至少鋪 MIN_STOPS 站那麼長，站少的時候路還是一路退進霧裡，不會在最後一站後面突然沒了。 ──
export const MIN_STOPS = 10;
export function world(n) {
  const stops = [];
  for (let i = 0; i < n; i++) stops.push({ z: FIRST_Z + i * GAP, x: STOP_X });
  return { n, stops, length: FIRST_Z + (Math.max(n, MIN_STOPS) - 1) * GAP + 1400 };
}
export const progressFor = (w, i) => w.n > 1 ? i / (w.n - 1) : 0;
export const nearest = (w, p) => w.n ? Math.min(w.n - 1, Math.max(0, Math.round(Math.min(1, Math.max(0, p)) * (w.n - 1)))) : -1;
// 鏡頭沿路的位置。站與站之間用一段 ease：靠近每一站鏡頭慢下來、停一下，再往下一站走。
const smooth = t => t * t * (3 - 2 * t);
export function camZ(w, p) {
  if (!w.n) return 0;
  if (w.n === 1) return w.stops[0].z - AHEAD;
  const q = Math.min(1, Math.max(0, p)) * (w.n - 1);
  const i = Math.min(w.n - 2, Math.floor(q)), t = q - i;
  const z0 = w.stops[i].z, z1 = w.stops[i + 1].z;
  return z0 + (z1 - z0) * (0.35 * t + 0.65 * smooth(t)) - AHEAD;
}
// 離最近那一站有多近（0 到 1），鏡頭靠近時用來稍微放大。
export function closeness(w, p) {
  if (w.n < 2) return 1;
  const q = Math.min(1, Math.max(0, p)) * (w.n - 1);
  return Math.max(0, 1 - Math.abs(q - Math.round(q)) * 2.6);
}
// 每一站在畫面上的點（小場景的地面點）與卡要放的高度。
export const VIG_BASE = 1, VIG_H = 118;
export function stopPoints(w, cam, cz) {
  return w.stops.map(s => {
    const p = project(cam, s.x, 0, s.z, cz);
    return p ? { x: p.x, y: p.y, s: p.s, depth: p.depth, top: p.y - VIG_H * VIG_BASE * p.s } : null;
  });
}

// ── 路：每一幀重算的多邊形（近寬遠窄是投影算出來的，不是畫出來的）──
function samplesZ(cz, length) {
  const out = []; let dz = 70;
  while (cz + dz < length + 300 && dz < FAR) { out.push(cz + dz); dz *= 1.075; }
  out.push(Math.min(length + 300, cz + FAR));
  return out;
}
const f1 = v => Math.round(v * 10) / 10;
const pts = arr => arr.map(p => `${f1(p.x)},${f1(p.y)}`).join(" ");
export function roadPolygon(cam, cz, length) {
  const zs = samplesZ(cz, length);
  const L = [], R = [];
  for (const z of zs) { const l = project(cam, -ROAD_HALF, 0, z, cz), r = project(cam, ROAD_HALF, 0, z, cz); if (l && r) { L.push(l); R.push(r); } }
  const nearWidth = L.length ? Math.hypot(L[0].x - R[0].x, L[0].y - R[0].y) : 0;
  const farWidth = L.length ? Math.hypot(L[L.length - 1].x - R[R.length - 1].x, L[L.length - 1].y - R[R.length - 1].y) : 0;
  return { points: pts([...L, ...R.reverse()]), nearWidth, farWidth };
}
function strip(cam, cz, length, x0, x1) {
  const zs = samplesZ(cz, length); const A = [], B = [];
  for (const z of zs) { const a = project(cam, x0, 0, z, cz), b = project(cam, x1, 0, z, cz); if (a && b) { A.push(a); B.push(b); } }
  return pts([...A, ...B.reverse()]);
}
function dashes(cam, cz, length) {
  let d = ""; const start = Math.floor((cz + 60) / 60) * 60;
  for (let z = start; z < Math.min(length, cz + 2200); z += 60) {
    const a = project(cam, -3, 0, z, cz), b = project(cam, 3, 0, z, cz), c = project(cam, 3, 0, z + 28, cz), e = project(cam, -3, 0, z + 28, cz);
    if (a && b && c && e) d += `M${f1(a.x)} ${f1(a.y)}L${f1(b.x)} ${f1(b.y)}L${f1(c.x)} ${f1(c.y)}L${f1(e.x)} ${f1(e.y)}Z`;
  }
  return d;
}

// ── 符號：每一種東西畫一次，用 <use> 重複放。原點在地面接觸點，往上畫（y 是負的）。 ──
// 光從左上來：受光的面在左（cream），背光的面在右（grey），屋頂最亮（orange），影子往右下拉長。
const shadow = (w, len) => `<polygon points="${-w / 2},0 ${w / 2},0 ${w / 2 + len},${len * 0.45} ${-w / 2 + len},${len * 0.45}" class="c-navy" fill-opacity=".14"/>`;
const SYMBOLS = {
  // 一層樓的房子：正面受光、側面背光、橘屋頂、一扇門兩扇窗。
  house: shadow(70, 40) +
    `<polygon points="-35,0 8,0 8,-44 -35,-44" class="c-cream"/><polygon points="8,0 36,-14 36,-58 8,-44" class="c-grey"/>` +
    `<polygon points="-40,-44 12,-44 40,-60 -12,-60" class="c-orange"/><polygon points="12,-44 40,-60 40,-58 12,-42" class="c-navy" fill-opacity=".35"/>` +
    `<rect x="-26" y="-30" width="9" height="11" class="c-navy" fill-opacity=".55"/><rect x="-6" y="-30" width="9" height="11" class="c-navy" fill-opacity=".55"/>` +
    `<rect x="-17" y="-18" width="10" height="18" class="c-navy" fill-opacity=".7"/>`,
  // 兩層樓加陽台：街屋的樣子。
  house2: shadow(64, 52) +
    `<polygon points="-32,0 6,0 6,-70 -32,-70" class="c-cream"/><polygon points="6,0 32,-13 32,-83 6,-70" class="c-grey"/>` +
    `<polygon points="-36,-70 10,-70 36,-84 -10,-84" class="c-orange"/>` +
    `<rect x="-32" y="-40" width="38" height="3" class="c-navy" fill-opacity=".5"/><rect x="-30" y="-36" width="34" height="2" class="c-navy" fill-opacity=".25"/>` +
    `<rect x="-24" y="-60" width="8" height="12" class="c-navy" fill-opacity=".55"/><rect x="-8" y="-60" width="8" height="12" class="c-navy" fill-opacity=".55"/>` +
    `<rect x="-24" y="-28" width="8" height="12" class="c-navy" fill-opacity=".55"/><rect x="-10" y="-16" width="10" height="16" class="c-navy" fill-opacity=".7"/>`,
  // 轉角商店：大招牌三條色帶、遮雨棚、亮著的門。台灣街角那一間。
  shop: shadow(76, 40) +
    `<polygon points="-38,0 10,0 10,-46 -38,-46" class="c-cream"/><polygon points="10,0 38,-14 38,-60 10,-46" class="c-grey"/>` +
    `<polygon points="-42,-46 14,-46 42,-62 -14,-62" class="c-orange"/>` +
    `<rect x="-36" y="-42" width="44" height="12" class="c-cream"/><rect x="-36" y="-42" width="44" height="4" class="c-orange"/><rect x="-36" y="-38" width="44" height="4" class="c-teal"/><rect x="-36" y="-34" width="44" height="4" class="c-navy" fill-opacity=".85"/>` +
    `<polygon points="-40,-28 12,-28 16,-22 -36,-22" class="c-teal"/>` +
    `<rect x="-30" y="-20" width="30" height="20" class="c-sand"/><rect x="-26" y="-16" width="8" height="10" class="c-navy" fill-opacity=".35"/><rect x="-12" y="-16" width="8" height="10" class="c-navy" fill-opacity=".35"/>`,
  // 廟：石階、紅（橘）柱、翹起的屋脊兩層。
  temple: shadow(90, 46) +
    `<rect x="-46" y="-6" width="80" height="6" class="c-grey"/><polygon points="-40,-6 20,-6 20,-44 -40,-44" class="c-cream"/><polygon points="20,-6 44,-18 44,-56 20,-44" class="c-grey"/>` +
    `<rect x="-34" y="-40" width="5" height="34" class="c-orange"/><rect x="-14" y="-40" width="5" height="34" class="c-orange"/><rect x="6" y="-40" width="5" height="34" class="c-orange"/>` +
    `<path d="M-52,-44 Q-48,-40 -42,-44 L18,-44 Q24,-40 28,-44 L50,-58 Q44,-54 40,-58 L-20,-58 Q-26,-54 -30,-58 Z" class="c-orange"/>` +
    `<path d="M-40,-58 Q-36,-54 -30,-58 L10,-58 Q14,-54 18,-58 L34,-70 Q30,-66 26,-70 L-14,-70 Q-18,-66 -22,-70 Z" class="c-orange"/><rect x="-22" y="-72" width="48" height="3" class="c-navy" fill-opacity=".6"/>` +
    `<rect x="-26" y="-30" width="30" height="24" class="c-navy" fill-opacity=".55"/>`,
  // 校門：兩根柱子一道門楣、校名的牌、一面旗。
  gate: shadow(70, 30) +
    `<rect x="-36" y="-50" width="10" height="50" class="c-navy"/><rect x="26" y="-50" width="10" height="50" class="c-navy"/>` +
    `<rect x="-40" y="-58" width="80" height="9" class="c-navy"/><rect x="-22" y="-56" width="44" height="5" class="c-orange"/>` +
    `<rect x="-30" y="-22" width="20" height="22" class="c-navy" fill-opacity=".35"/><rect x="31" y="-86" width="2" height="36" class="c-grey"/><polygon points="33,-86 52,-80 33,-74" class="c-orange"/>`,
  // 公車亭。
  shelter: shadow(40, 24) +
    `<rect x="-20" y="-30" width="3" height="30" class="c-navy"/><rect x="17" y="-30" width="3" height="30" class="c-navy"/><rect x="-24" y="-34" width="48" height="5" class="c-navy"/>` +
    `<rect x="-20" y="-28" width="40" height="18" class="c-teal" fill-opacity=".45"/><rect x="-18" y="-14" width="36" height="3" class="c-navy" fill-opacity=".6"/>`,
  // 棕櫚：細幹，五片葉子。
  palm: `<ellipse cx="14" cy="4" rx="20" ry="5" class="c-navy" fill-opacity=".14"/>` +
    `<path d="M-2,0 Q0,-30 4,-56" fill="none" class="s-navy" stroke-width="4" stroke-opacity=".8"/>` +
    `<path d="M4,-56 Q-20,-60 -30,-44 Q-10,-50 4,-56Z M4,-56 Q28,-62 36,-46 Q18,-52 4,-56Z M4,-56 Q-14,-78 -26,-70 Q-6,-66 4,-56Z M4,-56 Q22,-80 32,-72 Q14,-66 4,-56Z M4,-56 Q2,-84 12,-86 Q8,-70 4,-56Z" class="c-teal"/>`,
  // 圓樹：兩球疊，受光那一邊淡一點。
  tree: `<ellipse cx="10" cy="3" rx="16" ry="4" class="c-navy" fill-opacity=".14"/><rect x="-2.5" y="-14" width="5" height="14" class="c-navy" fill-opacity=".7"/>` +
    `<circle cx="0" cy="-30" r="18" class="c-teal"/><circle cx="-6" cy="-36" r="12" class="c-teal"/><circle cx="6" cy="-26" r="12" class="c-navy" fill-opacity=".22"/>`,
  // 針葉樹。
  pine: `<ellipse cx="8" cy="2" rx="12" ry="3" class="c-navy" fill-opacity=".14"/><rect x="-2" y="-10" width="4" height="10" class="c-navy" fill-opacity=".7"/>` +
    `<polygon points="0,-52 -14,-10 14,-10" class="c-teal"/><polygon points="0,-52 0,-10 14,-10" class="c-navy" fill-opacity=".22"/>`,
  bush: `<ellipse cx="6" cy="2" rx="18" ry="4" class="c-navy" fill-opacity=".12"/><ellipse cx="0" cy="-8" rx="18" ry="9" class="c-teal"/><ellipse cx="-6" cy="-12" rx="10" ry="7" class="c-teal"/><ellipse cx="8" cy="-7" rx="9" ry="6" class="c-navy" fill-opacity=".2"/>`,
  rock: `<ellipse cx="4" cy="1" rx="12" ry="3" class="c-navy" fill-opacity=".12"/><polygon points="-10,0 -6,-9 4,-11 11,-4 10,0" class="c-grey"/>`,
  lamp: `<rect x="-1.5" y="-40" width="3" height="40" class="c-navy" fill-opacity=".8"/><rect x="-6" y="-46" width="12" height="6" rx="2" class="c-navy"/><circle cx="0" cy="-43" r="3" class="c-yellow"/>`,
  bench: `<rect x="-14" y="-10" width="28" height="3" class="c-navy"/><rect x="-14" y="-16" width="28" height="3" class="c-navy" fill-opacity=".8"/><rect x="-12" y="-7" width="2" height="7" class="c-navy"/><rect x="10" y="-7" width="2" height="7" class="c-navy"/>`,
  // 人：頭加身體。顏色用 currentColor，放的時候用 class 決定。
  person: `<ellipse cx="3" cy="1" rx="6" ry="1.6" class="c-navy" fill-opacity=".18"/><circle cx="0" cy="-19" r="4" fill="currentColor"/><rect x="-4" y="-15" width="8" height="15" rx="2.5" fill="currentColor"/>`,
  // 公車：橘色，一排窗。
  bus: `<ellipse cx="12" cy="2" rx="30" ry="5" class="c-navy" fill-opacity=".16"/>` +
    `<rect x="-30" y="-26" width="60" height="22" rx="3" class="c-orange"/><rect x="-26" y="-22" width="52" height="8" class="c-sand"/>` +
    `<rect x="-24" y="-22" width="8" height="8" class="c-navy" fill-opacity=".3"/><rect x="-12" y="-22" width="8" height="8" class="c-navy" fill-opacity=".3"/><rect x="0" y="-22" width="8" height="8" class="c-navy" fill-opacity=".3"/><rect x="12" y="-22" width="8" height="8" class="c-navy" fill-opacity=".3"/>` +
    `<circle cx="-18" cy="-3" r="4" class="c-navy"/><circle cx="18" cy="-3" r="4" class="c-navy"/>`,
  // 機車加騎士：台灣的路上一定有。
  scooter: `<ellipse cx="4" cy="1" rx="12" ry="2.5" class="c-navy" fill-opacity=".16"/>` +
    `<circle cx="-8" cy="-3" r="3.5" class="c-navy"/><circle cx="8" cy="-3" r="3.5" class="c-navy"/><rect x="-9" y="-9" width="18" height="5" rx="2" class="c-teal"/>` +
    `<rect x="-2" y="-21" width="6" height="13" rx="2" fill="currentColor"/><circle cx="1" cy="-25" r="3.5" fill="currentColor"/><rect x="6" y="-14" width="5" height="2" class="c-navy"/>`,
  bird: `<path d="M-8,0 Q-4,-5 0,0 Q4,-5 8,0" fill="none" class="s-navy" stroke-width="1.6" stroke-opacity=".7"/>`,
  cloud: `<ellipse cx="0" cy="0" rx="70" ry="20"/><ellipse cx="-34" cy="6" rx="40" ry="16"/><ellipse cx="38" cy="4" rx="46" ry="18"/><ellipse cx="6" cy="-10" rx="34" ry="16"/>`,
};
export const SYMBOL_NAMES = Object.keys(SYMBOLS);
const defs = () => `<defs>` + SYMBOL_NAMES.map(k => `<symbol id="s-${k}" overflow="visible">${SYMBOLS[k]}</symbol>`).join("") +
  `<linearGradient id="g-am" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="st-teal" stop-opacity=".5"/><stop offset=".55" class="st-cream" stop-opacity="0"/></linearGradient>` +
  `<linearGradient id="g-pm" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="st-orange" stop-opacity=".55"/><stop offset=".55" class="st-sand" stop-opacity=".4"/><stop offset="1" class="st-cream" stop-opacity="0"/></linearGradient>` +
  `<linearGradient id="g-horizon" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="st-cream" stop-opacity=".95"/><stop offset="1" class="st-cream" stop-opacity="0"/></linearGradient>` +
  `<linearGradient id="g-corner" x1="0" y1="1" x2="1" y2="0"><stop offset=".45" class="st-cream" stop-opacity="0"/><stop offset="1" class="st-cream" stop-opacity=".85"/></linearGradient>` +
  `<linearGradient id="g-foot" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="st-navy" stop-opacity="0"/><stop offset="1" class="st-navy" stop-opacity=".12"/></linearGradient>` +
  `</defs>`;

// ── 每一站路邊的小場景。原點在地面中央，往上畫。每一種三到六組形狀，帶一個 anim-* 的鉤子給 motion() 動。 ──
const fig = (x, y, s, cls) => `<use href="#s-person" x="${x}" y="${y}" class="${cls}"${s !== 1 ? ` transform="translate(${x},${y}) scale(${s}) translate(${-x},${-y})"` : ""}/>`;
const VIGNETTES = {
  // 成立：七個人圍一張桌，桌上一面小旗，後面一張白板。
  table: () => `<ellipse cx="0" cy="2" rx="80" ry="14" class="c-sand"/>` +
    `<rect x="-60" y="-64" width="54" height="34" class="c-cream"/><rect x="-62" y="-66" width="58" height="3" class="c-navy" fill-opacity=".7"/><rect x="-52" y="-56" width="30" height="3" class="c-orange"/><rect x="-52" y="-48" width="38" height="2" class="c-navy" fill-opacity=".35"/><rect x="-52" y="-42" width="24" height="2" class="c-navy" fill-opacity=".35"/>` +
    `<ellipse cx="6" cy="-26" rx="44" ry="11" class="c-cream"/><rect x="-34" y="-26" width="5" height="26" class="c-navy" fill-opacity=".75"/><rect x="38" y="-26" width="5" height="26" class="c-navy" fill-opacity=".75"/>` +
    fig(-44, -10, 1, "p-navy") + fig(-24, -32, 0.9, "p-navy") + fig(-4, -36, 0.9, "p-navy") + fig(18, -36, 0.9, "p-navy") + fig(38, -32, 0.9, "p-navy") + fig(56, -10, 1, "p-navy") + fig(8, -4, 1.05, "p-orange") +
    `<g class="anim-flag" transform="translate(6,-26)"><rect x="-1" y="-34" width="2" height="30" class="c-grey"/><polygon points="1,-34 22,-28 1,-22" class="c-orange"/></g>`,
  // 導生：兩把椅子面對面，中間一盞燈、一盆植物。
  chairs: () => `<ellipse cx="0" cy="2" rx="70" ry="12" class="c-sand"/>` +
    `<g transform="translate(-42,0)"><rect x="-16" y="-24" width="30" height="5" class="c-navy"/><rect x="-16" y="-54" width="5" height="36" class="c-navy"/><rect x="-14" y="-18" width="4" height="18" class="c-navy" fill-opacity=".8"/><rect x="9" y="-18" width="4" height="18" class="c-navy" fill-opacity=".8"/></g>` +
    `<g transform="translate(42,0) scale(-1,1)"><rect x="-16" y="-24" width="30" height="5" class="c-navy"/><rect x="-16" y="-54" width="5" height="36" class="c-navy"/><rect x="-14" y="-18" width="4" height="18" class="c-navy" fill-opacity=".8"/><rect x="9" y="-18" width="4" height="18" class="c-navy" fill-opacity=".8"/></g>` +
    fig(-38, -24, 1, "p-navy") + fig(38, -24, 1, "p-orange") +
    `<rect x="-2" y="-44" width="4" height="44" class="c-grey"/><circle cx="0" cy="-50" r="8" class="c-yellow"/><circle cx="0" cy="-50" r="18" class="c-yellow" fill-opacity=".35"/>` +
    `<g class="anim-glow"><circle cx="0" cy="-50" r="30" class="c-yellow" fill-opacity=".18"/></g>` +
    `<rect x="60" y="-14" width="12" height="14" class="c-orange"/><ellipse cx="66" cy="-22" rx="12" ry="10" class="c-teal"/>`,
  // 線上博覽會：一個攤位、背板一條橫幅、三台亮著的筆電。
  laptops: () => `<ellipse cx="0" cy="2" rx="80" ry="12" class="c-sand"/>` +
    `<rect x="-70" y="-74" width="140" height="40" class="c-teal" fill-opacity=".9"/><rect x="-60" y="-66" width="120" height="6" class="c-cream"/><rect x="-60" y="-54" width="80" height="4" class="c-cream" fill-opacity=".7"/>` +
    `<rect x="-76" y="-30" width="152" height="6" class="c-navy"/><rect x="-70" y="-24" width="6" height="24" class="c-navy" fill-opacity=".8"/><rect x="64" y="-24" width="6" height="24" class="c-navy" fill-opacity=".8"/>` +
    [-52, 0, 52].map((x, i) => `<g transform="translate(${x},-30)"><rect x="-20" y="-28" width="40" height="26" rx="2" class="c-navy"/><rect x="-17" y="-25" width="34" height="20" class="c-sand"/><g class="anim-glow"><rect x="-17" y="-25" width="34" height="20" class="c-yellow" fill-opacity=".5"/></g><rect x="-8" y="-19" width="16" height="3" class="c-orange"/><rect x="-11" y="-13" width="22" height="2" class="c-navy" fill-opacity=".35"/><rect x="-24" y="-2" width="48" height="3" rx="1" class="c-grey"/></g>`).join("") +
    fig(-30, -4, 1, "p-navy") + fig(30, -4, 1, "p-orange"),
  // 校園大使：校門、校名的牌、一面會飄的旗、兩個人。
  gate: () => `<ellipse cx="0" cy="2" rx="76" ry="12" class="c-sand"/>` +
    `<rect x="-62" y="-82" width="16" height="82" class="c-navy"/><rect x="46" y="-82" width="16" height="82" class="c-navy"/>` +
    `<rect x="-70" y="-94" width="140" height="14" rx="2" class="c-navy"/><rect x="-44" y="-80" width="88" height="6" class="c-orange"/><rect x="-30" y="-91" width="60" height="8" class="c-cream"/>` +
    `<rect x="-56" y="-40" width="8" height="40" class="c-navy" fill-opacity=".35"/><rect x="52" y="-134" width="3" height="52" class="c-grey"/>` +
    `<g class="anim-flag" transform="translate(55,-134)"><polygon points="0,0 30,8 0,16" class="c-orange"/></g>` + fig(-20, 0, 1, "p-navy") + fig(14, 0, 1, "p-teal"),
  // 探索營：三個帳篷（布會動）、一座舞台、一條橫幅。
  tents: () => `<ellipse cx="10" cy="2" rx="96" ry="12" class="c-sand"/>` +
    [[-84, 0.8, "c-teal"], [-30, 1, "c-orange"], [22, 0.8, "c-teal"]].map(([x, s, c]) => `<g class="anim-tent" transform="translate(${x},0)"><polygon points="${-36 * s},0 0,${-58 * s} ${36 * s},0" class="${c}"/><polygon points="${8 * s},0 0,${-58 * s} ${36 * s},0" class="c-navy" fill-opacity=".2"/><polygon points="${-8 * s},0 0,${-22 * s} ${8 * s},0" class="c-cream"/></g>`).join("") +
    `<rect x="52" y="-16" width="72" height="16" class="c-navy"/><rect x="56" y="-72" width="4" height="56" class="c-navy"/><rect x="116" y="-72" width="4" height="56" class="c-navy"/><rect x="56" y="-72" width="64" height="12" class="c-orange"/><rect x="62" y="-68" width="52" height="4" class="c-cream"/>` + fig(88, -16, 0.95, "p-orange") + fig(10, -2, 0.9, "p-navy") + fig(-56, -2, 0.9, "p-teal"),
  // 校友：一根地圖針、底下一圈光、兩個人、幾條航線。
  pin: () => `<ellipse cx="0" cy="2" rx="70" ry="12" class="c-sand"/>` +
    `<path d="M-60,-10 Q-20,-70 20,-40 Q40,-20 70,-60" fill="none" class="s-orange" stroke-width="2" stroke-dasharray="6 6" stroke-opacity=".8"/>` +
    `<g class="anim-glow"><ellipse cx="0" cy="0" rx="36" ry="9" class="c-orange" fill-opacity=".35"/></g><ellipse cx="0" cy="0" rx="18" ry="4" class="c-orange" fill-opacity=".6"/>` +
    `<polygon points="-22,-60 0,-6 22,-60" class="c-orange"/><circle cx="0" cy="-68" r="28" class="c-orange"/><circle cx="0" cy="-68" r="11" class="c-cream"/>` + fig(-48, 0, 1, "p-navy") + fig(48, 0, 1, "p-teal"),
  // 幹部：一排人站在一條橫幅前面，中間舉一面旗。
  cadre: () => `<ellipse cx="0" cy="2" rx="90" ry="12" class="c-sand"/>` +
    `<rect x="-80" y="-66" width="160" height="22" class="c-navy"/><rect x="-70" y="-60" width="110" height="5" class="c-orange"/><rect x="-70" y="-52" width="70" height="4" class="c-cream" fill-opacity=".8"/>` +
    `<rect x="-84" y="-66" width="4" height="66" class="c-navy" fill-opacity=".8"/><rect x="80" y="-66" width="4" height="66" class="c-navy" fill-opacity=".8"/>` +
    [-60, -40, -20, 20, 40, 60].map((x, i) => fig(x, -2, 0.95, i % 3 === 0 ? "p-teal" : "p-navy")).join("") + fig(0, 0, 1.05, "p-orange") +
    `<g class="anim-flag" transform="translate(4,-24)"><rect x="-1" y="-40" width="2" height="40" class="c-grey"/><polygon points="1,-40 26,-33 1,-26" class="c-orange"/></g>`,
  // 預設：一根路牌，兩片箭頭板，一個人。
  signpost: () => `<ellipse cx="0" cy="2" rx="56" ry="10" class="c-sand"/>` +
    `<rect x="-3" y="-110" width="6" height="110" class="c-navy"/>` +
    `<g class="anim-flag" transform="translate(-6,-104)"><polygon points="0,0 50,0 62,11 50,22 0,22" class="c-orange"/><rect x="10" y="6" width="30" height="4" class="c-navy" fill-opacity=".6"/></g>` +
    `<polygon points="6,-74 -44,-74 -56,-63 -44,-52 6,-52" class="c-teal"/><rect x="-34" y="-68" width="30" height="4" class="c-navy" fill-opacity=".6"/>` + fig(30, 0, 1, "p-navy"),
};
export const MOTIFS = Object.keys(VIGNETTES);
export function vignetteSVG(motif) {
  const name = VIGNETTES[motif] ? motif : "signpost";
  return `<g class="vig vig-${name}">${VIGNETTES[name]()}</g>`;
}

// ── 把世界鋪出來 ──
// 假亂數：同一個輸入永遠畫出同一座村子，重新整理不會換風景。
const rnd = seed => { let s = (seed * 9301 + 49297) % 233280; return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; }; };
const use = (name, X, Z, base, extra) => ({ X, Z, base, svg: `<use href="#s-${name}" data-x="${f1(X)}" data-z="${f1(Z)}" data-b="${base}"${extra || ""}/>` });
// 每一個「可能是站」的位置（FIRST_Z 起每 GAP 一個）都留空，資料還沒來也不會跟小場景撞在一起。
const nearStop = (w, z, pad) => Math.abs(((z - FIRST_Z) % GAP + GAP) % GAP) < pad || Math.abs(((z - FIRST_Z) % GAP + GAP) % GAP - GAP) < pad;

function townObjects(w, cam, tall) {
  // 路的另一邊（遠的那一邊，畫面左上）：房子、商店、廟、樹，站在 X -230 到 -120 之間。
  const r = rnd(5), out = [];
  let temples = 0;
  for (let z = -300; z < w.length; z += 120 + r() * 70) {
    const k = r(), X = -125 - r() * 100;
    if (k < 0.34) out.push(use("house", X, z, 1));
    else if (k < 0.5) out.push(use("house2", X, z, 1));
    else if (k < 0.58) out.push(use("shop", X, z, 1));
    else if (k < 0.63 && temples < 2 && z > 800) { temples++; out.push(use("temple", X - 20, z, 1.1)); }
    else if (k < 0.8) out.push(use("palm", X + 20, z, 0.9 + r() * 0.4));
    else if (k < 0.93) out.push(use("tree", X + 10, z, 0.8 + r() * 0.5));
    else out.push(use("pine", X, z, 0.9 + r() * 0.4));
  }
  return out;
}
function backObjects(w, cam) {
  // 更遠的一帶（X -700 到 -330）：田、零星的樹、小房子，畫小一點。
  const r = rnd(9), out = [];
  for (let z = -400; z < w.length; z += 200 + r() * 120) {
    const k = r(), X = -340 - r() * 360;
    if (k < 0.4) out.push(use("palm", X, z, 0.7 + r() * 0.3));
    else if (k < 0.7) out.push(use("pine", X, z, 0.7 + r() * 0.3));
    else if (k < 0.9) out.push(use("house", X, z, 0.7));
    else out.push(use("tree", X, z, 0.7));
  }
  return out;
}
function nearObjects(w, cam) {
  // 靠鏡頭這一邊（畫面右下）：路燈、長椅、灌木、幾棟房子、公車亭；每一站前後留空給小場景。
  const r = rnd(13), out = [];
  for (let z = -300; z < w.length; z += 140 + r() * 80) {
    if (nearStop(w, z, 210)) continue;
    const k = r();
    if (k < 0.22) out.push(use("lamp", 86, z, 1));
    else if (k < 0.36) out.push(use("bench", 92, z, 1));
    else if (k < 0.56) out.push(use("bush", 120 + r() * 60, z, 0.9 + r() * 0.5));
    else if (k < 0.72) out.push(use("palm", 150 + r() * 60, z, 1 + r() * 0.3));
    else if (k < 0.88) out.push(use(r() < 0.5 ? "house" : "house2", 240 + r() * 40, z, 1));
    else if (k < 0.95) out.push(use("shelter", 96, z, 1));
    else out.push(use("rock", 130 + r() * 40, z, 1));
  }
  // 框住角落的近景植物：離路更遠，鏡頭經過時會很大，掃過畫面的右下角。
  for (let z = -200; z < w.length; z += 480 + r() * 300) out.push(use(r() < 0.6 ? "palm" : "bush", 330 + r() * 80, z, 1.2 + r() * 0.4, ' class="near-plant"'));
  return out;
}
function stopObjects(w, motifs) {
  const out = [];
  w.stops.forEach((s, i) => {
    // 路邊一顆橘點標出這一站在路上的位置，小場景站在旁邊的空地上。
    out.push({ X: ROAD_HALF + 10, Z: s.z, base: 1, svg: `<g class="stop-dot" data-x="${ROAD_HALF + 10}" data-z="${s.z}" data-b="1"><circle cx="0" cy="0" r="12" class="c-orange" fill-opacity=".3"/><circle cx="0" cy="0" r="6" class="c-orange"/></g>` });
    out.push({ X: s.x, Z: s.z, base: VIG_BASE, svg: `<g class="stop" data-stop="${i}" data-x="${s.x}" data-z="${s.z}" data-b="${VIG_BASE}">${vignetteSVG(motifs[i])}</g>` });
  });
  return out;
}
function lifeObjects() {
  // 路上會動的東西：Z 由 frame() 照時間算，這裡只給起點、速度與哪一條車道。
  const m = (name, X, z0, v) => `<g data-mover="${name}" data-x="${X}" data-z0="${z0}" data-v="${v}"><use href="#s-${name === "walker" ? "person" : name}" class="${name === "walker" ? "p-navy" : "p-teal"}"/></g>`;
  return m("bus", 30, 300, 110) + m("scooter", -30, 900, -170) + m("scooter", 30, 1500, 150) +
    m("walker", -78, 400, 22) + m("walker", 80, 1200, -18) + m("walker", -78, 1800, 26);
}
function paddies(w) {
  // 田與草地的色塊：遠的那一帶是田（深一點），路兩邊是草地的深淺（草不會一整片同一個顏色）。每一幀投影四個角。
  const r = rnd(21), out = [];
  const quad = (X0, X1, z, L, op) => out.push(`<polygon data-paddy="1" data-x0="${f1(X0)}" data-x1="${f1(X1)}" data-z0="${f1(z)}" data-z1="${f1(z + L)}" class="c-teal" fill-opacity="${op}"/>`);
  for (let z = -300; z < w.length; z += 240 + r() * 160) { const X0 = -360 - r() * 120; quad(X0, X0 - 200 - r() * 200, z, 150 + r() * 80, r() < 0.5 ? ".22" : ".34"); }
  for (let z = -300; z < w.length; z += 300 + r() * 260) { const X0 = -95 - r() * 60; quad(X0, X0 - 120 - r() * 120, z, 120 + r() * 120, ".12"); }
  for (let z = -300; z < w.length; z += 320 + r() * 260) { const X0 = 95 + r() * 80; quad(X0, X0 + 120 + r() * 160, z, 120 + r() * 140, ".12"); }
  return out.join("");
}
function mountains() {
  // 遠山：三道山脊，越遠越淡。畫在地平線上，跟鏡頭幾乎不動（frame() 只平移一點點）。
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
// 只有站那一層：資料來了之後塞進已經鋪好的村子裡（main.js 的 placeStops），不用整個場景重鋪。
export function stopsSVG(w, motifs) {
  const m = Array.isArray(motifs) ? motifs : [];
  return sortedBy(camera(1000, false), stopObjects(w, m));
}
// 整個場景的 <svg> 內容。motifs[i] 是第 i 站要畫的小場景名字。tall 是直式（手機）：少一層遠景、少一點東西。
// 資料還沒來就可以鋪（world(0) 也有 MIN_STOPS 站那麼長的路與村子），來了用 placeStops() 把站放進去。
export function sceneSVG(w, motifs, tall) {
  const m = Array.isArray(motifs) ? motifs : [];
  const cam = camera(1000, !!tall);
  const sorted = list => sortedBy(cam, list);
  const sky = `<g data-layer="sky"><rect class="sky-base c-cream" x="-4000" y="-3000" width="12000" height="6000"/><rect class="sky-am" x="-4000" y="-3000" width="12000" height="6000" fill="url(#g-am)"/><rect class="sky-pm" x="-4000" y="-3000" width="12000" height="6000" fill="url(#g-pm)" opacity="0"/>` +
    `<g class="sun"><circle cx="0" cy="0" r="80" class="c-yellow" fill-opacity=".16"/><circle cx="0" cy="0" r="44" class="c-yellow" fill-opacity=".95"/><circle cx="0" cy="0" r="44" class="sun-pm c-orange" fill-opacity="0"/></g>` +
    [0, 1, 2, 3, 4].map(i => `<g class="cloud" transform="translate(${-200 + i * 420} ${30 + (i % 3) * 30}) scale(${0.6 + (i % 2) * 0.35})"><use href="#s-cloud" class="c-navy" fill-opacity=".06" y="8"/><use href="#s-cloud" class="c-cream"/></g>`).join("") +
    [0, 1, 2].map(i => `<g data-mover="bird" data-i="${i}"><use href="#s-bird" x="${120 + i * 36}" y="${150 + i * 14}"/></g>`).join("") + `</g>`;
  const far = `<g data-layer="far"><g class="ridges">${mountains()}</g><rect class="horizon-haze" x="-4000" y="0" width="12000" height="200" fill="url(#g-horizon)"/></g>`;
  const back = `<g data-layer="back"><rect class="ground c-teal" fill-opacity=".24" x="-4000" y="0" width="12000" height="4000"/>${paddies(w)}${tall ? "" : sorted(backObjects(w, cam))}</g>`;
  const town = `<g data-layer="town">${sorted(townObjects(w, cam, tall))}</g>`;
  const road = `<g data-layer="road"><polygon class="verge-l c-sand" fill-opacity=".9"/><polygon class="verge-r c-sand" fill-opacity=".9"/><polygon class="asphalt c-navy" fill-opacity=".9"/><path class="dashes c-sand" fill-opacity=".9"/></g>`;
  const stops = `<g data-layer="stops">${stopsSVG(w, m)}</g>`;
  const life = `<g data-layer="life">${lifeObjects()}</g>`;
  const near = `<g data-layer="near">${sorted(nearObjects(w, cam))}</g>`;
  const haze = `<g data-layer="haze"><rect class="corner-haze" x="0" y="0" width="1000" height="800" fill="url(#g-corner)"/><rect class="foot-haze" x="-4000" y="600" width="12000" height="200" fill="url(#g-foot)"/></g>`;
  return defs() + sky + far + back + town + road + stops + life + near + haze;
}

// ── 每一幀：把世界投到畫面上。純 DOM 寫入，沒有動畫。 ──
// attach() 先把要動的節點找出來記著，frame() 之後每一幀只算數學、寫屬性。
export function attach(svg) {
  const q = s => [...svg.querySelectorAll(s)];
  const reg = {
    svg, stopsLayer: svg.querySelector('[data-layer="stops"]'),
    sprites: q("[data-z]").map(el => ({ el, X: +el.dataset.x, Z: +el.dataset.z, base: +el.dataset.b || 1, last: "" })),
    movers: q("[data-mover]").filter(el => el.dataset.mover !== "bird").map(el => ({ el, X: +el.dataset.x, z0: +el.dataset.z0, v: +el.dataset.v, base: +el.dataset.b || 1, last: "" })),
    paddies: q("[data-paddy]").map(el => ({ el, x0: +el.dataset.x0, x1: +el.dataset.x1, z0: +el.dataset.z0, z1: +el.dataset.z1, last: "" })),
    road: { asphalt: svg.querySelector(".asphalt"), l: svg.querySelector(".verge-l"), r: svg.querySelector(".verge-r"), dashes: svg.querySelector(".dashes") },
    sky: { pm: svg.querySelector(".sky-pm"), sun: svg.querySelector(".sun"), sunPm: svg.querySelector(".sun-pm") },
    ridges: svg.querySelector(".ridges"), horizon: svg.querySelector(".horizon-haze"), ground: svg.querySelector(".ground"),
    corner: svg.querySelector(".corner-haze"), foot: svg.querySelector(".foot-haze"),
  };
  return reg;
}
// 資料來了：把站放進鋪好的村子，重新記一次要動的節點。
export function placeStops(reg, w, motifs) {
  reg.stopsLayer.innerHTML = stopsSVG(w, motifs);
  reg.sprites = [...reg.svg.querySelectorAll("[data-z]")].map(el => ({ el, X: +el.dataset.x, Z: +el.dataset.z, base: +el.dataset.b || 1, last: "" }));
  reg.lastP = undefined;
}
// 視窗大小變了：地平線、霧、地面的位置跟著鏡頭算。
export function layout(reg, cam) {
  const hy = horizonY(cam);
  reg.ground.setAttribute("y", f1(hy - 2));
  reg.horizon.setAttribute("y", f1(hy - 40)); reg.horizon.setAttribute("height", "260");
  reg.corner.setAttribute("width", f1(cam.viewW)); reg.corner.setAttribute("height", H);
  reg.foot.setAttribute("y", f1(H - 160)); reg.foot.setAttribute("height", "160");
}
const set = (o, attr, v) => { if (o.last !== v) { o.last = v; o.el.setAttribute(attr, v); } };
const hide = o => { if (o.hidden !== true) { o.hidden = true; o.el.setAttribute("visibility", "hidden"); } };
const show = o => { if (o.hidden !== false) { o.hidden = false; o.el.removeAttribute("visibility"); } };
function place(o, cam, p) {
  if (!p || p.depth > FAR) { hide(o); return; }
  show(o);
  const k = p.s * o.base, flip = o.v < 0 ? -1 : 1;
  set(o, "transform", `translate(${f1(p.x)} ${f1(p.y)}) scale(${f1(k * flip * 100) / 100} ${f1(k * 100) / 100})`);
  const fade = p.depth > FADE_FROM ? Math.max(0.06, 1 - (p.depth - FADE_FROM) / (FAR - FADE_FROM)) : 1;
  const fv = String(Math.round(fade * 20) / 20);
  if (o.fade !== fv) { o.fade = fv; o.el.setAttribute("opacity", fv); }
}
// p 是進度、t 是秒（閒置動畫的時鐘，靜態時給 0）。回這一幀每一站在畫面上的點，給卡用。
export function frame(reg, w, cam, p, t) {
  const cz = camZ(w, p), length = w.length;
  // 進度與鏡頭都沒變（只是閒置的時鐘在走）就只動路上的車與人，其餘不重算。
  const still = reg.lastP === p && reg.lastCam === cam;
  reg.lastP = p; reg.lastCam = cam;
  if (!still) {
    const rd = roadPolygon(cam, cz, length);
    reg.road.asphalt.setAttribute("points", rd.points);
    reg.road.l.setAttribute("points", strip(cam, cz, length, -ROAD_HALF - 22, -ROAD_HALF));
    reg.road.r.setAttribute("points", strip(cam, cz, length, ROAD_HALF, ROAD_HALF + 22));
    reg.road.dashes.setAttribute("d", dashes(cam, cz, length));
    for (const q of reg.paddies) {
      if (q.z1 < cz - 100 || q.z0 > cz + FAR) { hide(q); continue; }
      const a = project(cam, q.x0, 0, Math.max(q.z0, cz + 50), cz), b = project(cam, q.x1, 0, Math.max(q.z0, cz + 50), cz), c = project(cam, q.x1, 0, q.z1, cz), d = project(cam, q.x0, 0, q.z1, cz);
      if (!(a && b && c && d)) { hide(q); continue; }
      show(q); set(q, "points", pts([a, b, c, d]));
    }
    for (const o of reg.sprites) place(o, cam, project(cam, o.X, 0, o.Z, cz));
    // 天空：早晨到黃昏，太陽慢慢往右下走、變橘。
    if (reg.sky.pm) {
      reg.sky.pm.setAttribute("opacity", f1(p * 10) / 10);
      reg.sky.sunPm.setAttribute("fill-opacity", f1(p * 8) / 10);
      reg.sky.sun.setAttribute("transform", `translate(${f1(cam.viewW * (0.2 + 0.55 * p))} ${f1(horizonY(cam) - 110 + 60 * p)})`);
    }
    // 遠山：地平線上，跟鏡頭一點點視差。
    if (reg.ridges) reg.ridges.setAttribute("transform", `translate(${f1(-cz * 0.025 + cam.viewW * 0.3)} ${f1(horizonY(cam) + 2)})`);
  }
  // 路上會動的：永遠在鏡頭前面那一段路上繞圈。
  for (const o of reg.movers) {
    const lo = cz - 160, span = 2600;
    const z = lo + (((o.z0 + o.v * t - lo) % span) + span) % span;
    place(o, cam, project(cam, o.X, 0, z, cz));
  }
  return stopPoints(w, cam, cz);
}

/* ── 這裡面才有動畫。外面不准出現 gsap。 ──
   釘住 stage、用捲動進度推鏡頭；閒置的時鐘（路上的車、天上的鳥、旗子、燈的光）也在這裡。
   回傳幾個外面會用到的把手（跳到某一站、重算、停掉時鐘），外面拿到的只是函式，碰不到 gsap。 */
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
  // 閒置的時鐘：路上的車與人要一直走，所以每一幀給 onTick 一個秒數；分頁藏起來時 gsap 自己會停。
  const t0 = gsap.ticker.time;
  const tick = () => onTick(gsap.ticker.time - t0);
  gsap.ticker.add(tick);
  // 小場景裡的閒置動畫與天上的東西。只碰 class，不碰位置（位置每一幀由 frame() 寫）。
  const bindIdle = () => gsap.context(() => {
    gsap.to(".anim-flag", { skewY: 4, scaleX: 0.96, transformOrigin: "0% 100%", duration: 1.4, ease: "sine.inOut", yoyo: true, repeat: -1, stagger: 0.2 });
    gsap.to(".anim-glow", { opacity: 0.35, duration: 1.6, ease: "sine.inOut", yoyo: true, repeat: -1, stagger: 0.3 });
    gsap.to(".anim-tent", { skewX: 2.5, transformOrigin: "50% 100%", duration: 2.2, ease: "sine.inOut", yoyo: true, repeat: -1, stagger: 0.4 });
    gsap.utils.toArray(".cloud").forEach((c, i) => gsap.to(c, { x: "+=" + (160 + i * 40), duration: 70 + i * 15, ease: "none", repeat: -1, yoyo: true }));
    gsap.utils.toArray("[data-mover='bird']").forEach((b, i) => {
      gsap.fromTo(b, { x: -200 - i * 120 }, { x: 1600, duration: 48 + i * 9, ease: "none", repeat: -1, delay: i * 6 });
      gsap.to(b, { y: "+=12", duration: 1.1 + i * 0.2, ease: "sine.inOut", yoyo: true, repeat: -1 });
      gsap.to(b.firstElementChild, { scaleY: 0.3, transformOrigin: "50% 50%", duration: 0.32, ease: "sine.inOut", yoyo: true, repeat: -1 });
    });
  }, svg);
  let idle = bindIdle();
  return {
    refresh: () => ScrollTrigger.refresh(),
    scrollFor: p => st.start + (st.end - st.start) * Math.min(1, Math.max(0, p)),
    range: () => ({ start: st.start, end: st.end }),
    jump: (p, instant) => {
      const y = st.start + (st.end - st.start) * Math.min(1, Math.max(0, p));
      if (instant) { chase(p, true); window.scrollTo(0, y); }
      else { const o = { y: window.scrollY }; gsap.to(o, { y, duration: 0.9, ease: "power2.inOut", onUpdate: () => window.scrollTo(0, o.y) }); }
    },
    // 場景重畫（直式橫式切換）之後，閒置動畫要重新掛在新的節點上。
    rebind: () => { idle.revert(); idle = bindIdle(); },
  };
}
