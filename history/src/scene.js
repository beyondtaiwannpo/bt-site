// /history/ 的場景：一條斜向的路、分層的低多邊形風景、每一站路邊的小場景，加上鏡頭怎麼跟著進度走。
//
// ── 讀這一支之前先知道三件事 ──
// 1. **資料與場景分開。** 這裡沒有任何一站的文字，只拿「有幾站」與「每站畫哪一種小場景」兩個數字性的輸入。
//    加一站永遠不碰這支（test/history-page.test.mjs 守著：場景 SVG 裡找不到任何站的標題）。
// 2. **顏色不寫色碼。** 每個形狀掛 class（c-navy、c-teal、c-orange、c-sand、c-cream、c-yellow、c-grey），
//    真正的顏色在 history.css 用 var(--bt-*) 給，深淺一律用 fill-opacity。check.sh 的七色白名單因此掃得到。
// 3. **會動的只有 motion()。** 這一支其他的函式全部是純函式，吃數字吐字串或座標。
//    gsap 與 ScrollTrigger 只准出現在 motion() 裡（check.sh 守著），使用者開了「減少動態效果」或 CDN 被擋就不呼叫它，
//    頁面退回直立時間軸，一站都不會少。
//
// 座標：世界高 800 單位（H），路在下三分之一；x 往右走就是往後的年份。站與站間距 GAP 單位。
// 畫面上每單位幾 px 由容器高度決定（scale = 容器高 / 800），寬度照比例算出 viewW 單位，所以手機與桌機看到的是同一條路，只是看到的寬度不同。

export const H = 800;
export const GAP = 760;
export const FIRST_X = 560;
export const LAYER_RATIO = { far: 0.22, mid: 0.5, road: 1, stops: 1, near: 1.45 };
// 鏡頭往上跟的比例：路一路往上爬，鏡頭跟六成，路在畫面上還是看得出來在爬。
export const Y_RATIO = { far: 0.15, mid: 0.35, road: 0.6, stops: 0.6, near: 0.8 };

// 路的高度：往右慢慢往上，再加一點起伏。這是整個場景的骨架，房子、樹、站都站在它上面。
export const roadY = x => 600 - 0.055 * x + 22 * Math.sin(x / 230);

// 世界：幾站就多寬。
export function world(n) {
  const stops = [];
  for (let i = 0; i < n; i++) { const x = FIRST_X + i * GAP; stops.push({ x, y: roadY(x) }); }
  const width = Math.max(1800, n ? stops[n - 1].x + GAP / 2 + 420 : 0);
  return { n, stops, width };
}
export const progressFor = (w, i) => w.n > 1 ? i / (w.n - 1) : 0;
export function camX(w, p) {
  if (!w.n) return 0;
  if (w.n === 1) return w.stops[0].x;
  const q = Math.min(1, Math.max(0, p));
  return w.stops[0].x + (w.stops[w.n - 1].x - w.stops[0].x) * q;
}
export const nearest = (w, p) => w.n ? Math.min(w.n - 1, Math.max(0, Math.round(Math.min(1, Math.max(0, p)) * (w.n - 1)))) : -1;

// 每一層在某個進度下要平移多少（單位）。viewW 是畫面寬幾單位。
export function transforms(w, p, viewW) {
  const cx = camX(w, p), x0 = w.n ? w.stops[0].x : 0, y0 = w.n ? w.stops[0].y : roadY(0);
  const cy = roadY(cx);
  const out = {};
  for (const k of Object.keys(LAYER_RATIO)) {
    out[k] = [ (viewW / 2 - x0) - (cx - x0) * LAYER_RATIO[k], -(cy - y0) * Y_RATIO[k] ];
  }
  return out;
}

// ── 畫 ──
// 假亂數：同一個輸入永遠畫出同一座山、同一棵樹，重新整理不會換風景。
const rnd = seed => { let s = (seed * 9301 + 49297) % 233280; return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; }; };
const f1 = v => Math.round(v * 10) / 10;
const pts = arr => arr.map(([x, y]) => `${f1(x)},${f1(y)}`).join(" ");

function skyLayer() {
  // 天空不平移，所以要畫得很寬。太陽是整頁唯一一顆亮黃（Brand Book：一個畫面不超過兩顆）。
  return `<g data-layer="sky"><rect x="-20000" y="-2000" width="60000" height="4000" class="c-cream"/>` +
    `<rect x="-20000" y="-2000" width="60000" height="2460" class="c-sand" fill-opacity=".55"/>` +
    `<circle cx="300" cy="150" r="46" class="c-yellow" fill-opacity=".9"/>` +
    `<circle cx="300" cy="150" r="78" class="c-yellow" fill-opacity=".18"/></g>`;
}
function farLayer(w) {
  // 遠山：兩排折線山脊，深藍很淡。往右跟路一起慢慢升高。
  const r = rnd(7), W = w.width * LAYER_RATIO.far + 3000;
  const ridge = (base, amp, step, op) => {
    const p = [[-1500, 900]];
    for (let x = -1500; x <= W; x += step) p.push([x, base - 0.012 * x + (r() - 0.5) * amp - (x % (step * 2) ? 0 : amp * 0.3)]);
    p.push([W, 900]);
    return `<polygon points="${pts(p)}" class="c-navy" fill-opacity="${op}"/>`;
  };
  // 幾朵雲，跟山同一層慢慢動。米白加一點透明，不是白色（Brand Book 沒有白）。
  let clouds = "";
  for (let x = -600; x <= W; x += 520 + r() * 700) {
    const y = 120 + r() * 160, k = 0.8 + r() * 0.8;
    clouds += `<g class="c-cream" fill-opacity=".85"><ellipse cx="${f1(x)}" cy="${f1(y)}" rx="${f1(70 * k)}" ry="${f1(22 * k)}"/><ellipse cx="${f1(x - 30 * k)}" cy="${f1(y + 6 * k)}" rx="${f1(40 * k)}" ry="${f1(18 * k)}"/><ellipse cx="${f1(x + 36 * k)}" cy="${f1(y + 4 * k)}" rx="${f1(46 * k)}" ry="${f1(20 * k)}"/></g>`;
  }
  return `<g data-layer="far">${clouds}${ridge(470, 120, 160, ".10")}${ridge(540, 90, 120, ".16")}</g>`;
}
const tree = (x, y, s, cls, op) =>
  `<polygon points="${pts([[x, y - 52 * s], [x - 20 * s, y], [x + 20 * s, y]])}" class="${cls}" fill-opacity="${op}"/>` +
  `<rect x="${f1(x - 3 * s)}" y="${f1(y)}" width="${f1(6 * s)}" height="${f1(10 * s)}" class="c-navy" fill-opacity=".55"/>`;
const house = (x, y, s, op) =>
  `<rect x="${f1(x - 22 * s)}" y="${f1(y - 30 * s)}" width="${f1(44 * s)}" height="${f1(30 * s)}" class="c-cream" fill-opacity="${op}"/>` +
  `<polygon points="${pts([[x - 26 * s, y - 30 * s], [x, y - 52 * s], [x + 26 * s, y - 30 * s]])}" class="c-navy" fill-opacity=".8"/>` +
  `<rect x="${f1(x - 5 * s)}" y="${f1(y - 16 * s)}" width="${f1(10 * s)}" height="${f1(16 * s)}" class="c-navy" fill-opacity=".7"/>` +
  `<rect x="${f1(x + 9 * s)}" y="${f1(y - 24 * s)}" width="${f1(8 * s)}" height="${f1(8 * s)}" class="c-sand"/>`;
function midLayer(w) {
  // 中景：一排樹與幾棟房子，站在比路高一點的地方（視差之後看起來在路後面）。
  const r = rnd(3), W = w.width * LAYER_RATIO.mid + 2400;
  let s = "";
  for (let x = -800; x <= W; x += 95 + r() * 70) {
    const y = roadY(x / LAYER_RATIO.mid) * Y_RATIO.mid + 330 - 0.02 * x;
    const k = r();
    if (k < 0.18) s += house(x, y, 0.9 + r() * 0.4, ".95");
    else s += tree(x, y, 0.7 + r() * 0.8, k < 0.6 ? "c-teal" : "c-navy", k < 0.6 ? ".85" : ".72");
  }
  return `<g data-layer="mid">${s}</g>`;
}
function roadLayer(w) {
  // 路：沿 roadY 的一條厚帶，上面一條虛的中線。草地鋪在路的兩側。
  const W = w.width + 1200, step = 40;
  const top = [], bot = [];
  for (let x = -600; x <= W; x += step) { const y = roadY(x); top.push([x, y - 26]); bot.unshift([x, y + 26]); }
  const centre = [];
  for (let x = -600; x <= W; x += step) centre.push([x, roadY(x)]);
  const grass = [[-600, 900], ...top.map(([x, y]) => [x, y + 10]), [W, 900]];
  return `<g data-layer="road">` +
    `<polygon points="${pts(grass)}" class="c-teal" fill-opacity=".28"/>` +
    `<polygon points="${pts([...top, ...bot])}" class="c-navy" fill-opacity=".92"/>` +
    `<polyline points="${pts(centre)}" fill="none" class="s-sand" stroke-width="3" stroke-dasharray="26 22" stroke-opacity=".9"/></g>`;
}
function nearLayer(w) {
  // 近景：路前面幾叢大草、幾顆圓石，動得最快，深度就是靶這一層撐出來的。
  const r = rnd(11), W = w.width * LAYER_RATIO.near + 3000;
  let s = "";
  for (let x = -1200; x <= W; x += 220 + r() * 260) {
    const y = 700 + r() * 70, k = r();
    if (k < 0.5) s += `<ellipse cx="${f1(x)}" cy="${f1(y)}" rx="${f1(70 + r() * 60)}" ry="${f1(28 + r() * 18)}" class="c-teal" fill-opacity=".55"/>`;
    else if (k < 0.8) s += `<polygon points="${pts([[x - 40, y], [x - 10, y - 70 - r() * 40], [x + 14, y], [x + 30, y - 50], [x + 54, y]])}" class="c-teal" fill-opacity=".7"/>`;
    else s += `<ellipse cx="${f1(x)}" cy="${f1(y)}" rx="${f1(30 + r() * 20)}" ry="${f1(16 + r() * 8)}" class="c-grey" fill-opacity=".8"/>`;
  }
  return `<g data-layer="near">${s}</g>`;
}

// ── 每一站路邊的小場景。原點在地面中央，往上畫（y 是負的）。 ──
const fig = (x, y, s, cls) =>
  `<circle cx="${f1(x)}" cy="${f1(y - 26 * s)}" r="${f1(6 * s)}" class="${cls}"/>` +
  `<rect x="${f1(x - 6 * s)}" y="${f1(y - 19 * s)}" width="${f1(12 * s)}" height="${f1(19 * s)}" rx="${f1(3 * s)}" class="${cls}"/>`;
const VIGNETTES = {
  // 成立：七個人圍一張桌。
  table() {
    let s = `<rect x="-46" y="-34" width="92" height="8" rx="2" class="c-cream"/><rect x="-38" y="-26" width="6" height="26" class="c-navy" fill-opacity=".8"/><rect x="32" y="-26" width="6" height="26" class="c-navy" fill-opacity=".8"/>`;
    const xs = [-62, -40, -18, 2, 22, 44, 66];
    xs.forEach((x, i) => { s += fig(x, i % 2 ? -36 : -8, 1, i === 3 ? "c-orange" : "c-navy"); });
    return s;
  },
  // 導生：兩把椅子面對面，中間一盞小燈。
  chairs() {
    const chair = (x, flip) => `<g transform="translate(${x},0) scale(${flip},1)"><rect x="-16" y="-24" width="30" height="6" class="c-navy"/><rect x="-16" y="-54" width="6" height="36" class="c-navy"/><rect x="-14" y="-18" width="5" height="18" class="c-navy" fill-opacity=".8"/><rect x="9" y="-18" width="5" height="18" class="c-navy" fill-opacity=".8"/></g>`;
    return chair(-44, 1) + chair(44, -1) + fig(-40, -24, 0.9, "c-navy") + fig(40, -24, 0.9, "c-orange") +
      `<rect x="-2" y="-40" width="4" height="40" class="c-grey"/><circle cx="0" cy="-46" r="9" class="c-yellow" fill-opacity=".95"/>`;
  },
  // 線上博覽會：三台筆電，螢幕亮著。
  laptops() {
    const lap = (x, y, s) => `<g transform="translate(${x},${y}) scale(${s})"><rect x="-26" y="-36" width="52" height="34" rx="2" class="c-navy"/><rect x="-22" y="-32" width="44" height="26" class="c-sand"/><rect x="-30" y="-2" width="60" height="4" rx="1" class="c-grey"/><rect x="-10" y="-24" width="20" height="3" class="c-orange"/><rect x="-14" y="-17" width="28" height="3" class="c-navy" fill-opacity=".35"/></g>`;
    return lap(-60, 0, 0.9) + lap(0, -4, 1.1) + lap(60, 0, 0.9);
  },
  // 校園大使：校門，兩根柱子一道橫樑，一面小旗。
  gate() {
    return `<rect x="-62" y="-80" width="16" height="80" class="c-navy"/><rect x="46" y="-80" width="16" height="80" class="c-navy"/>` +
      `<rect x="-70" y="-92" width="140" height="14" rx="2" class="c-navy"/><rect x="-44" y="-78" width="88" height="5" class="c-orange"/>` +
      `<rect x="52" y="-130" width="3" height="40" class="c-grey"/><polygon points="55,-130 84,-122 55,-114" class="c-orange"/>` + fig(-20, 0, 1, "c-navy") + fig(14, 0, 1, "c-teal");
  },
  // 探索營：三個帳篷加一座小舞台。
  tents() {
    const tent = (x, s, cls) => `<polygon points="${pts([[x - 36 * s, 0], [x, -56 * s], [x + 36 * s, 0]])}" class="${cls}"/><polygon points="${pts([[x - 8 * s, 0], [x, -22 * s], [x + 8 * s, 0]])}" class="c-cream"/>`;
    return tent(-78, 0.8, "c-teal") + tent(-24, 1, "c-orange") + tent(30, 0.8, "c-teal") +
      `<rect x="56" y="-16" width="70" height="16" class="c-navy"/><rect x="60" y="-70" width="4" height="54" class="c-navy"/><rect x="118" y="-70" width="4" height="54" class="c-navy"/><rect x="60" y="-70" width="62" height="10" class="c-sand"/>` + fig(91, -16, 0.9, "c-orange");
  },
  // 校友：一根地圖針，底下一圈光。
  pin() {
    return `<ellipse cx="0" cy="0" rx="34" ry="8" class="c-orange" fill-opacity=".35"/><ellipse cx="0" cy="0" rx="18" ry="4" class="c-orange" fill-opacity=".6"/>` +
      `<polygon points="-24,-62 0,-6 24,-62" class="c-orange"/><circle cx="0" cy="-70" r="30" class="c-orange"/><circle cx="0" cy="-70" r="12" class="c-cream"/>` + fig(-50, 0, 0.9, "c-navy") + fig(50, 0, 0.9, "c-teal");
  },
  // 預設：一根路牌，兩片箭頭板。
  signpost() {
    return `<rect x="-3" y="-110" width="6" height="110" class="c-navy"/>` +
      `<polygon points="-6,-104 44,-104 56,-93 44,-82 -6,-82" class="c-orange"/><polygon points="6,-74 -44,-74 -56,-63 -44,-52 6,-52" class="c-teal"/>` +
      `<rect x="4" y="-98" width="30" height="4" class="c-navy" fill-opacity=".6"/><rect x="-34" y="-68" width="30" height="4" class="c-navy" fill-opacity=".6"/>` + fig(30, 0, 1, "c-navy");
  },
};
export const MOTIFS = Object.keys(VIGNETTES);
export function vignetteSVG(motif, x, y) {
  const draw = VIGNETTES[motif] || VIGNETTES.signpost;
  return `<g class="vig vig-${VIGNETTES[motif] ? motif : "signpost"}" transform="translate(${f1(x)},${f1(y)})">${draw()}</g>`;
}
function stopsLayer(w, motifs) {
  // 每一站：路邊一塊小地、小場景站在上面、路上一顆橘點標出位置。data-stop 讓 main.js 找得到這一站的群組。
  return `<g data-layer="stops">` + w.stops.map((s, i) => {
    const gy = s.y - 34;   // 路的上緣再往上一點，就是路邊
    return `<g class="stop" data-stop="${i}"><ellipse cx="${f1(s.x)}" cy="${f1(gy + 4)}" rx="118" ry="14" class="c-sand" fill-opacity=".9"/>` +
      vignetteSVG(motifs[i], s.x, gy) +
      `<circle cx="${f1(s.x)}" cy="${f1(s.y)}" r="7" class="c-orange"/><circle cx="${f1(s.x)}" cy="${f1(s.y)}" r="13" class="c-orange" fill-opacity=".35"/></g>`;
  }).join("") + `</g>`;
}

// 整個場景的 <svg> 內容。motifs[i] 是第 i 站要畫的小場景名字。
export function sceneSVG(w, motifs) {
  const m = Array.isArray(motifs) ? motifs : [];
  return skyLayer() + farLayer(w) + midLayer(w) + roadLayer(w) + stopsLayer(w, m) + nearLayer(w);
}

// 把一層的平移套到 <g> 上。純 DOM，不是動畫。
export function applyTransforms(layers, tr) {
  for (const k of Object.keys(tr)) {
    const g = layers[k]; if (!g) continue;
    g.setAttribute("transform", `translate(${f1(tr[k][0])} ${f1(tr[k][1])})`);
  }
}

/* ── 這裡面才有動畫。外面不准出現 gsap。 ──
   釘住 stage、用捲動進度推鏡頭。回傳幾個外面會用到的把手（跳到某一站、重算），
   外面拿到的只是函式，碰不到 gsap。 */
export function motion({ wrap, stage, onProgress }) {
  gsap.registerPlugin(ScrollTrigger);
  // 進度先經過一個很短的追趕，捲動停下來鏡頭還會滑半拍，比直接貼著捲軸自然。
  // ⚠ 不用 gsap.quickTo：它記得自己上一次的起點，直接改 proxy.p 它不會知道，鏡頭會從舊值一路滑過去
  //（2026-11-06 實測：帶 #代號 進來，捲軸對了，畫面卻從第一站滑到第五站）。每次開一個新 tween、overwrite 掉舊的，起點永遠是現在的值。
  const proxy = { p: 0 };
  const chase = (p, instant) => {
    gsap.killTweensOf(proxy);
    if (instant) { proxy.p = p; onProgress(p); return; }
    gsap.to(proxy, { p, duration: 0.45, ease: "power2.out", overwrite: true, onUpdate: () => onProgress(proxy.p) });
  };
  const st = ScrollTrigger.create({
    trigger: wrap, start: "top top", end: "bottom bottom", pin: stage, pinSpacing: false, anticipatePin: 1,
    onUpdate: self => chase(self.progress),
    onRefresh: self => chase(self.progress, true),
  });
  return {
    refresh: () => ScrollTrigger.refresh(),
    scrollFor: p => st.start + (st.end - st.start) * Math.min(1, Math.max(0, p)),
    range: () => ({ start: st.start, end: st.end }),
    jump: (p, instant) => {
      const y = st.start + (st.end - st.start) * Math.min(1, Math.max(0, p));
      if (instant) { chase(p, true); window.scrollTo(0, y); }
      else { const o = { y: window.scrollY }; gsap.to(o, { y, duration: 0.9, ease: "power2.inOut", onUpdate: () => window.scrollTo(0, o.y) }); }
    },
  };
}
