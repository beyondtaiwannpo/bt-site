// 大學介紹貼文（COLLEGE INTRO SERIES）的七張投影片（2026-11-27）。
//
// 一份版面，兩種輸出：
//   - drawSlide()：瀏覽器自己的 canvas 畫 1080x1350，預覽與下載 PNG 都是它。
//   - buildPptx()：同一份版面寫成 PowerPoint（vendor/pptxgen.bundle.js），拖進 Canva 每一個字、框、照片都改得到。
// 版面座標是照 Paul 給的 UW-Madison 那一套量的（~/Anson/outputs/bt-website/social/2026-10-31-vanderbilt-college-intro/work/reference/），
// 原型是那個資料夾的 work/build/build.py（Python 版，第一篇 Vanderbilt 就是它做的）。這一支照抄它的座標。
//
// 這一支**只**有投影片：沒有 DOM、沒有資料庫。layout() 是純函式（test/marketing-slides.test.mjs 驗），
// drawSlide() 與 buildPptx() 要瀏覽器。顏色與字體是投影片的資料，不是網站的樣式（check.sh 對這一支開例外，GOALS 2026-10-29 Paul 同意）。

export const W = 1080, H = 1350;
export const C = { bg: "#FFFAF3", sand: "#FFE8C5", orange: "#F1AB40", black: "#000000", grey: "#6E6E6E", line: "#8A8A8A" };
export const LATIN = "Barlow", CJK = "Noto Sans TC";
const CJK_RE = /[　-鿿＀-￯]/;
const SPLIT_RE = /[　-鿿＀-￯]+|[^　-鿿＀-￯]+/g;

// 要附來源、要有人勾「我點開看過」的數字，與它在 data 裡的位置。**跟資料庫 mkt_facts() 同一份**（測試比對兩邊）。
export const FACTS = [
  ["rank", ["basic", "ranking"]], ["type", ["basic", "type"]], ["setting", ["basic", "setting"]], ["enrollment", ["basic", "enrollment"]],
  ["acceptance", ["apply", "acceptance"]], ["applicants", ["apply", "applicants"]], ["gpa", ["apply", "gpa"]], ["sat", ["apply", "sat"]],
  ["act", ["apply", "act"]], ["test_note", ["apply", "test_note"]], ["toefl", ["apply", "toefl"]], ["ielts", ["apply", "ielts"]],
  ["duolingo", ["apply", "duolingo"]], ["timeline", ["timeline", "rows"]], ["majors", ["majors", "rows"]], ["alumni", ["fun", "alumni"]],
  ["cover_rank", ["cover", "tags1"]],
];
export const PHOTO_SLOTS = ["campus", "mascot", "alumni1", "alumni2", "city1", "city2"];

// 一篇新貼文的樣子。欄位名稱就是編輯畫面的欄位。
export function blankPost(school) {
  return {
    school: school || "",
    cover: { line1: "", line1_color: "#000000", line2: "", line2_color: "#C5050C", zh: "", accent: "#C5050C", pennant: "", pennant_text: "#FFFFFF",
             tags1: "", tags2: "" },
    photos: {},
    basic: { ranking: "", type: "", setting: "", enrollment: "", state: "", state_label: "" },
    apply: { acceptance: "", applicants: "", gpa: "", sat: "", act: "", test_note: "", toefl: "", ielts: "", duolingo: "",
             footer: "Sources: Common Data Set, the university's admissions website, College Board BigFuture. Requirements may change. Please refer to the university's official website." },
    timeline: { rows: [
      { date: "Aug 1", en: "Applications Open", zh: "申請開始" },
      { date: "", en: "Early Action (EA)", zh: "提早申請" },
      { date: "", en: "Regular Decision (RD)", zh: "正規申請" },
      { date: "", en: "EA Decision Release", zh: "提早申請結果公佈" },
      { date: "", en: "RD Decision Release", zh: "正規申請結果公佈" },
      { date: "May 1", en: "College Decision Day", zh: "大學錄取決定日" }],
      footer: "Sources: the university's admissions website, Common App. Deadlines may change. Please refer to the university's official website." },
    majors: { rows: [0, 1, 2, 3, 4, 5].map(() => ({ en: "", zh: "", rank: "" })),
              footnote: "*College Factual: uses core statistics from official government databases, primarily the Integrated Postsecondary Education Data System (IPEDS), under the U.S. Department of Education." },
    fun: { alumni: [{ name: "", desc: "" }, { name: "", desc: "" }], city_en: "Explore", city_zh: "城市探索", city: [{ label: "" }, { label: "" }] },
  };
}

export const get = (o, path) => path.reduce((x, k) => (x == null ? undefined : x[k]), o);

// ── 元素 ───────────────────────────────────────────────────────────────
// text: { k, x, y, w, h, text, size, weight, italic, color, align, valign, lh, wrap }
// box:  { k, x, y, w, h, fill, stroke, sw, r }
// img:  { k, x, y, w, h, src, frame, fit }   src 是圖的名字：logo、qr、map 或 photo:<哪一張>
// line: { k, x1, y1, x2, y2, color, sw, arrow }
// pennant: { k, x, y, w, h, fill, text, color }
const T = (x, y, w, h, text, size, weight = 700, italic = false, color = C.black, align = "center", valign = "middle", lh = 1.15, wrap = false) =>
  ({ k: "text", x, y, w, h, text: String(text == null ? "" : text), size, weight, italic, color, align, valign, lh, wrap });
const B = (x, y, w, h, fill = C.sand, stroke = C.black, sw = 3, r = 30) => ({ k: "box", x, y, w, h, fill, stroke, sw, r });
const I = (x, y, w, h, src, frame = 0, fit = "cover") => ({ k: "img", x, y, w, h, src, frame, fit });
const L = (x1, y1, x2, y2, color = C.black, sw = 3, arrow = false) => ({ k: "line", x1, y1, x2, y2, color, sw, arrow });

function header() {
  return [T(108, 92, 240, 34, "COLLEGE INTRO SERIES", 20, 400, true, C.grey, "left"), L(335, 108, 858, 108, C.line, 1.2), I(872, 82, 128, 65, "logo", 0, "contain")];
}
const pill = (x, y, w, h, en, zh, size = 40) => [B(x, y, w, h), T(x, y, w, h, en + (zh ? " " + zh : ""), size, 700, true)];

function cover(d) {
  const c = d.cover || {};
  const els = [...header(),
    T(108, 230, 900, 100, c.line1, 96, 800, false, c.line1_color || C.black, "left"),
    T(108, 322, 940, 100, c.line2, 96, 800, false, c.line2_color || c.accent || C.black, "left"),
    T(108, 430, 900, 70, c.zh, 46, 700, false, C.black, "left"),
    I(152, 520, 738, 540, "photo:campus", 16)];
  if (c.pennant) els.push({ k: "pennant", x: 72, y: 968, w: 480, h: 160, fill: c.accent || C.black, text: c.pennant, color: c.pennant_text || "#FFFFFF" });
  if (d.photos && d.photos.mascot && d.photos.mascot.path) els.push(I(785, 865, 270, 260, "photo:mascot", 0, "contain"));
  els.push(T(168, 1178, 860, 48, c.tags1, 33, 400, true, C.black, "left"), T(168, 1222, 860, 48, c.tags2, 33, 400, true, C.black, "left"));
  return els;
}
function basic(d) {
  const b = d.basic || {};
  const els = [...header(), T(108, 168, 960, 110, "BASIC INFO <zh>學校資訊</zh>", 92, 800, true, C.black, "left")];
  [["Ranking", "排名", b.ranking], ["Type", "類型", b.type], ["Setting", "背景", b.setting], ["Enrollment", "學生數", b.enrollment], ["Location", "地點", null]]
    .forEach(([en, zh, v], i) => {
      const y = 332 + i * 142;
      els.push(...pill(108, y, 397, 88, en, zh, 40));
      if (v) els.push(T(550, y, 500, 88, v, 46, 700, false, C.black, "left"));
    });
  els.push(I(505, 950, 500, 310, "map", 0, "contain"), T(560, 1050, 260, 90, (b.state_label || "").replace(/\n/g, "<br>"), 30, 700, false, C.black, "center", "middle", 1.3));
  return els;
}
// 申請資訊：每一列一個框，右邊一到三行「標籤：值」，值是橘的。
export function applyRows(a) {
  const rows = [
    { label: "Acceptance Rate", lines: [["", a.acceptance]] },
    { label: "Total Applicants", lines: [["", a.applicants]] },
    { label: "GPA Average", lines: [["", a.gpa]] },
    { label: "Standardized Testing", lines: [["SAT: ", a.sat], ["ACT: ", a.act], ["", a.test_note]] },
    { label: "English Proficiency", lines: [["TOEFL: ", a.toefl], ["IELTS: ", a.ielts], ["Duolingo: ", a.duolingo]] },
  ];
  return rows.map(r => ({ label: r.label, lines: r.lines.filter(([, v]) => String(v || "").trim()) })).filter(r => r.lines.length);
}
function apply(d) {
  const a = d.apply || {};
  const els = [...header(), T(108, 205, 960, 100, "APPLICATION INFO <zh>申請資訊</zh>", 76, 800, true, C.black, "left")];
  let y = 368;
  for (const r of applyRows(a)) {
    const n = r.lines.length, h = 92, lh = 66;
    els.push(...pill(118, y, 430, h, r.label, "", 40));
    const top = y + h / 2 - n * lh / 2;
    r.lines.forEach(([k, v], j) => els.push(T(560, top + j * lh, 450, lh, k ? k + "<o>" + v + "</o>" : v, 46)));
    y += Math.max(150, n * lh + 70);
  }
  els.push(T(60, 1282, 960, 52, a.footer, 15, 400, true, C.grey, "center", "middle", 1.45, true));
  return els;
}
function timeline(d) {
  const t = d.timeline || {}, rows = (t.rows || []).filter(r => r.date || r.en);
  const els = [...header(), T(108, 160, 960, 100, "APPLICATION TIMELINE", 82, 800, true, C.black, "left"), L(420, 292, 420, 1240, C.black, 5, true)];
  const step = (1185 - 360) / Math.max(1, rows.length - 1);
  rows.forEach((r, i) => {
    const cy = 360 + i * step, bh = Math.min(120, step - 18);
    els.push(L(388, cy, 452, cy, C.black, 5), T(130, cy - 40, 260, 80, r.date, 46),
      B(513, cy - bh / 2, 430, bh), T(513, cy - bh / 2 + 6, 430, bh * 0.58, r.en, r.size || (String(r.en || "").length > 22 ? 34 : 40), 700, true),
      T(513, cy - bh / 2 + bh * 0.56, 430, bh * 0.36, r.zh, 25, 700, false, C.black, "center", "top"));
  });
  els.push(T(60, 1282, 960, 52, t.footer, 15, 400, true, C.grey, "center", "middle", 1.45, true));
  return els;
}
function majors(d) {
  const m = d.majors || {};
  const els = [...header(), T(108, 182, 960, 110, "POPULAR MAJORS <zhw>熱門科系</zhw>", 80, 800, true, C.black, "left")];
  (m.rows || []).slice(0, 6).forEach((r, i) => {
    const x = i % 2 === 0 ? 108 : 563, y = 336 + Math.floor(i / 2) * 298;
    els.push(B(x, y, 407, 205));
    const below = r.zh_below || (String(r.en || "").length > 10 && r.zh);
    if (below) els.push(T(x, y + 22, 407, 62, r.en, 40, 700, true), T(x, y + 82, 407, 50, "<zhl>" + (r.zh || "") + "</zhl>", 40, 400));
    else els.push(T(x, y + 30, 407, 90, r.en + (r.zh ? " <zhl>" + r.zh + "</zhl>" : ""), 52, 700, true));
    els.push(T(x, y + 135, 407, 50, r.rank, 29, 700, true));
  });
  els.push(T(170, 1236, 740, 64, m.footnote, 15, 400, true, C.black, "center", "middle", 1.45, true));
  return els;
}
function fun(d) {
  const f = d.fun || {};
  const els = [...header(), T(60, 158, 960, 100, "FUN FACTS", 80, 800, true), ...pill(302, 272, 486, 82, "Famous Alumni", "知名校友", 38)];
  (f.alumni || []).slice(0, 2).forEach((a, i) => {
    const x = i === 0 ? 252 : 609;
    els.push(I(x, 380, 218, 290, "photo:alumni" + (i + 1), 7), T(x - 70, 672, 358, 40, a.name, 27), T(x - 80, 706, 378, 40, a.desc, 27));
  });
  els.push(...pill(272, 769, 536, 82, f.city_en || "Explore", f.city_zh || "城市探索", 38));
  (f.city || []).slice(0, 2).forEach((c, i) => {
    const x = i === 0 ? 111 : 566;
    els.push(I(x, 893, 406, 304, "photo:city" + (i + 1), 8), T(x - 40, 1200, 486, 44, c.label, 27));
  });
  return els;
}
function cta() {
  return [...header(),
    T(140, 245, 800, 160, "More questions about<br>applications?", 64, 700, false, C.orange, "center", "middle", 1.35),
    T(60, 440, 960, 80, "加入 Beyond Taiwan 交流群", 64, 700, false, C.orange),
    T(140, 545, 800, 110, "和正在準備出國的同學、<br>學長姐一起分享資訊", 38, 400, false, C.orange, "center", "middle", 1.45),
    I(338, 698, 404, 404, "qr", 0, "contain"),
    T(140, 1145, 800, 56, "掃描QR CODE或點擊主頁連結加入", 32)];
}
export const SLIDES = [cover, basic, apply, timeline, majors, fun, cta];
export const SLIDE_NAMES = ["cover", "basic", "apply", "timeline", "majors", "fun", "cta"];
export function layout(data) { return SLIDES.map(fn => fn(data || {})); }

// ── 文字的小標記：<o>橘</o>、<zh>小一號的中文粗體</zh>、<zhw>小一號的中文細體</zhw>、<zhl>中文細體</zhl>、<br> 換行 ──
const TAGS = { o: { color: C.orange }, zh: { size: 50, weight: 700, italic: false }, zhw: { size: 48, weight: 400, italic: false }, zhl: { weight: 400, italic: false } };
// 回 [[run, ...], ...]：一行一個陣列，每個 run 是 { t, size, weight, italic, color, cjk }。中文一律不斜（Barlow 的斜體套在中文上是假的斜）。
export function lines(e) {
  const out = [[]]; const stack = [{ size: e.size, weight: e.weight, italic: e.italic, color: e.color }];
  for (const tok of e.text.split(/(<[^>]+>)/)) {
    if (!tok) continue;
    const m = tok.match(/^<(\/?)(\w+)>$/);
    if (m) {
      if (m[2] === "br") { out.push([]); continue; }
      if (m[1]) stack.pop(); else stack.push({ ...stack[stack.length - 1], ...(TAGS[m[2]] || {}) });
      continue;
    }
    const st = stack[stack.length - 1];
    for (const chunk of tok.match(SPLIT_RE) || []) {
      const cjk = CJK_RE.test(chunk);
      out[out.length - 1].push({ t: chunk, size: st.size, weight: st.weight, italic: st.italic && !cjk, color: st.color, cjk });
    }
  }
  return out;
}
const fontOf = r => `${r.italic ? "italic " : ""}${r.weight} ${r.size}px ${r.cjk ? `"${CJK}"` : `"${LATIN}"`}, "${CJK}", sans-serif`;
// 字型：Google Fonts（GOALS 2026-09-07 放開的那一條）。畫之前一定要等字型到，不然第一次下載的圖會是預設字型。
let fontsP = null;
export function ensureFonts(sampleText) {
  if (typeof document === "undefined") return Promise.resolve();
  if (!document.getElementById("mkt-fonts")) {
    const l = document.createElement("link");
    l.id = "mkt-fonts"; l.rel = "stylesheet";
    l.href = "https://fonts.googleapis.com/css2?family=Barlow:ital,wght@0,400;0,700;0,800;1,400;1,700;1,800&family=Noto+Sans+TC:wght@400;700&family=Rye&display=block";
    document.head.appendChild(l);
    fontsP = new Promise(r => { l.onload = r; l.onerror = r; });
  }
  const cjk = (String(sampleText || "").match(/[　-鿿＀-￯]/g) || []).join("") + "學校資訊申請熱門科系知名校友城市探索加入交流群";
  return fontsP.then(() => Promise.all([
    "400 20px Barlow", "italic 400 20px Barlow", "700 20px Barlow", "italic 700 20px Barlow", "800 20px Barlow", "italic 800 20px Barlow", "20px Rye",
  ].map(f => document.fonts.load(f, "AZaz09#%")).concat([`400 20px "${CJK}"`, `700 20px "${CJK}"`].map(f => document.fonts.load(f, cjk))))).catch(() => {});
}

// ── 畫 ────────────────────────────────────────────────────────────────
function rrect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
// 把一張圖照「填滿並置中裁切」或「整張放進去」畫進框。focus = "top" 時從上面裁（人像不會切到頭）。
export function fitRect(iw, ih, w, h, fit, focus) {
  if (fit === "contain") { const s = Math.min(w / iw, h / ih); return { sx: 0, sy: 0, sw: iw, sh: ih, dx: (w - iw * s) / 2, dy: (h - ih * s) / 2, dw: iw * s, dh: ih * s }; }
  const s = Math.max(w / iw, h / ih), sw = w / s, sh = h / s;
  return { sx: (iw - sw) / 2, sy: focus === "top" ? 0 : (ih - sh) / 2, sw, sh, dx: 0, dy: 0, dw: w, dh: h };
}
function wrapRuns(ctx, line, maxW) {
  // 只給註腳用：一行裡同一種樣式，照空白斷行。
  const words = line.map(r => r.t).join("").split(/(\s+)/); const st = line[0]; const out = []; let cur = "";
  ctx.font = fontOf(st);
  for (const w of words) { if (ctx.measureText(cur + w).width > maxW && cur.trim()) { out.push(cur.trim()); cur = w.trimStart(); } else cur += w; }
  if (cur.trim()) out.push(cur.trim());
  return out.map(t => [{ ...st, t }]);
}
// 一個文字元素排成幾行、每一段字放在哪裡。畫圖與 .pptx 共用，所以 Canva 拿到的位置就是預覽上的位置。
export function layoutText(ctx, e) {
  let ls = lines(e);
  if (e.wrap && ls.length === 1 && ls[0].length) ls = wrapRuns(ctx, ls[0], e.w);
  const lineH = ls.map(l => Math.max(e.size, ...l.map(r => r.size)) * e.lh);
  const total = lineH.reduce((a, b) => a + b, 0);
  let y = e.valign === "top" ? e.y : e.valign === "bottom" ? e.y + e.h - total : e.y + (e.h - total) / 2;
  return ls.map((l, i) => {
    const widths = l.map(r => { ctx.font = fontOf(r); return ctx.measureText(r.t).width; });
    const lw = widths.reduce((a, b) => a + b, 0);
    let x = e.align === "left" ? e.x : e.align === "right" ? e.x + e.w - lw : e.x + (e.w - lw) / 2;
    const maxS = Math.max(e.size, ...l.map(r => r.size));
    const items = l.map((r, j) => { const it = { r, x, w: widths[j] }; x += widths[j]; return it; });
    const out = { top: y, h: lineH[i], base: y + lineH[i] / 2 + maxS * 0.35, items };
    y += lineH[i];
    return out;
  });
}

// .pptx 的文字框怎麼放（純函式，test/ 有測）。兩個 Canva 的習慣要繞開：
//   1. 同一行裡每個字都會被改成第一個字的大小。「POPULAR MAJORS」82 px 加「熱門科系」60 px 會一起變 82 px，
//      太長就換行、第二行被切掉。所以同一行有兩種字級，就拆成一個字級一個框，放在預覽上的位置。
//   2. Canva 的字比瀏覽器量的寬一點，一行剛好塞滿的字會被換行。所以單行的框往對齊方向留寬，會換行的框多 4%。
export function pptxTextBoxes(e, layout) {
  const mixed = layout.some(L => new Set(L.items.map(it => it.r.size)).size > 1);
  if (!mixed) {
    let x = e.x, w = e.w;
    if (!e.wrap) {
      if (e.align === "left") w = Math.max(w, W - 8 - x);
      else if (e.align === "right") { w = Math.max(w, x + w - 8); x = Math.min(x, 8); }
      else { const g = Math.max(0, Math.min(x - 8, W - 8 - (x + w))); x -= g; w += 2 * g; }
    } else { const g = w * 0.04; if (e.align === "right") x -= g; else if (e.align !== "left") x -= g / 2; w += g; }
    return [{ x, y: e.y, w, h: e.h, align: e.align, valign: e.valign, lh: e.lh, wrap: !!e.wrap, lines: lines(e) }];
  }
  const out = [];
  for (const L of layout) {
    let g = null;
    for (const it of L.items) {
      if (g && g.size === it.r.size) { g.runs.push(it.r); g.w += it.w; continue; }
      g = { size: it.r.size, x: it.x, w: it.w, runs: [it.r] }; out.push(g);
      const h = it.r.size * 1.3; g.y = L.base - it.r.size * 0.35 - h / 2; g.h = h;
    }
  }
  return out.map(g => ({ x: g.x, y: g.y, w: g.w * 1.15 + 10, h: g.h, align: "left", valign: "middle", lh: 1, wrap: false, lines: [g.runs] }));
}

let measureCtx = null;
export function drawSlide(ctx, els, images, data) {
  ctx.save(); ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
  for (const e of els) {
    if (e.k === "box") {
      rrect(ctx, e.x + e.sw / 2, e.y + e.sw / 2, e.w - e.sw, e.h - e.sw, e.r); ctx.fillStyle = e.fill; ctx.fill();
      ctx.lineWidth = e.sw; ctx.strokeStyle = e.stroke; ctx.stroke();
    } else if (e.k === "line") {
      ctx.beginPath(); ctx.moveTo(e.x1, e.y1); ctx.lineTo(e.x2, e.y2); ctx.lineWidth = e.sw; ctx.strokeStyle = e.color; ctx.stroke();
      if (e.arrow) { ctx.beginPath(); ctx.moveTo(e.x2 - 13, e.y2 - 4); ctx.lineTo(e.x2 + 13, e.y2 - 4); ctx.lineTo(e.x2, e.y2 + 18); ctx.closePath(); ctx.fillStyle = e.color; ctx.fill(); }
    } else if (e.k === "img") {
      const im = images[e.src];
      if (e.frame) {
        ctx.save(); ctx.shadowColor = "rgba(16,42,134,.16)"; ctx.shadowBlur = 6; ctx.shadowOffsetY = 2;
        ctx.fillStyle = "#FFFFFF"; ctx.fillRect(e.x, e.y, e.w, e.h); ctx.restore();
        ctx.strokeStyle = "#E6E1D8"; ctx.lineWidth = 1; ctx.strokeRect(e.x + .5, e.y + .5, e.w - 1, e.h - 1);
      }
      const x = e.x + e.frame, y = e.y + e.frame, w = e.w - 2 * e.frame, h = e.h - 2 * e.frame;
      if (im) {
        const focus = e.src.startsWith("photo:") ? get(data, ["photos", e.src.slice(6), "focus"]) : "";
        const f = fitRect(im.width, im.height, w, h, e.fit, focus);
        ctx.drawImage(im, f.sx, f.sy, f.sw, f.sh, x + f.dx, y + f.dy, f.dw, f.dh);
      } else if (e.src.startsWith("photo:")) {
        ctx.fillStyle = "#EFE7DA"; ctx.fillRect(x, y, w, h);
        ctx.fillStyle = C.grey; ctx.font = `italic 400 22px "${LATIN}", sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText("photo: " + e.src.slice(6), x + w / 2, y + h / 2);
      }
    } else if (e.k === "pennant") {
      ctx.save(); ctx.translate(e.x, e.y + e.h / 2); ctx.rotate(-6 * Math.PI / 180);
      ctx.shadowColor = "rgba(16,42,134,.18)"; ctx.shadowBlur = 6; ctx.shadowOffsetY = 2;
      ctx.beginPath(); ctx.moveTo(0, -e.h / 2); ctx.lineTo(e.w, 0); ctx.lineTo(0, e.h / 2); ctx.closePath(); ctx.fillStyle = e.fill; ctx.fill();
      ctx.shadowColor = "transparent"; ctx.fillStyle = e.color; ctx.textAlign = "left"; ctx.textBaseline = "middle";
      let size = e.h * 0.36; ctx.font = `${size}px Rye, serif`;
      while (ctx.measureText(e.text).width > e.w * 0.62 && size > 20) { size -= 2; ctx.font = `${size}px Rye, serif`; }
      ctx.fillText(e.text, 28, 2); ctx.restore();
    } else if (e.k === "text") {
      for (const L of layoutText(ctx, e)) for (const it of L.items) {
        ctx.font = fontOf(it.r); ctx.fillStyle = it.r.color; ctx.textAlign = "left"; ctx.textBaseline = "alphabetic"; ctx.fillText(it.r.t, it.x, L.base);
      }
    }
  }
  ctx.restore();
}

// 美國地圖：只有外框（州跟州之間的線被白色蓋掉），加一根橘色的針插在那一州。states 是 slides/us-states.json。
export function drawMap(states, code) {
  const c = document.createElement("canvas"); c.width = 1000; c.height = 618;
  const ctx = c.getContext("2d"); const s = 1000 / 959; ctx.scale(s, s);
  const ps = Object.values(states.states).map(x => new Path2D(x.d));
  ctx.lineWidth = 2.4; ctx.strokeStyle = "#5a5a5a"; ps.forEach(p => ctx.stroke(p));
  ctx.fillStyle = "#FFFFFF"; ps.forEach(p => ctx.fill(p));
  const st = states.states[String(code || "").toLowerCase()];
  if (st) {
    const [bx, by, bw, bh] = st.bbox, x = bx + bw * 0.62, y = by + bh * 0.7;
    ctx.save(); ctx.translate(x, y); ctx.scale(2.1, 2.1);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.bezierCurveTo(-22, -30, -30, -44, -30, -58); ctx.arc(0, -58, 30, Math.PI, 0); ctx.bezierCurveTo(30, -44, 22, -30, 0, 0);
    ctx.closePath(); ctx.fillStyle = C.orange; ctx.fill(); ctx.beginPath(); ctx.arc(0, -55, 10.5, 0, Math.PI * 2); ctx.fillStyle = "#FFFFFF"; ctx.fill(); ctx.restore();
  }
  return c;
}

// ── PowerPoint（Canva 匯入用）────────────────────────────────────────────
const px = v => v / 96;                 // PowerPoint 用英吋，1080 px = 11.25 吋
const pt = v => v * 0.75;               // 字級 px → pt
const hex = s => String(s || "#000000").replace("#", "").toUpperCase();
// 照片先照框裁好（canvas 轉 PNG），Canva 拿到的就是一張已經裁好的照片。
function cropped(im, w, h, fit, focus) {
  const c = document.createElement("canvas"); c.width = Math.round(w); c.height = Math.round(h);
  const f = fitRect(im.width, im.height, w, h, fit, focus);
  c.getContext("2d").drawImage(im, f.sx, f.sy, f.sw, f.sh, f.dx, f.dy, f.dw, f.dh);
  return c.toDataURL(fit === "contain" ? "image/png" : "image/jpeg", 0.92);
}
export function buildPptx(Pptx, slides, images, data) {
  const p = new Pptx();
  p.defineLayout({ name: "IG45", width: px(W), height: px(H) }); p.layout = "IG45";
  p.title = "COLLEGE INTRO SERIES " + (data.school || "");
  for (const els of slides) {
    const s = p.addSlide(); s.background = { color: hex(C.bg) };
    for (const e of els) {
      if (e.k === "box") {
        s.addShape(p.ShapeType.roundRect, { x: px(e.x), y: px(e.y), w: px(e.w), h: px(e.h), rectRadius: px(e.r), fill: { color: hex(e.fill) }, line: { color: hex(e.stroke), width: pt(e.sw) } });
      } else if (e.k === "line") {
        s.addShape(p.ShapeType.line, { x: px(Math.min(e.x1, e.x2)), y: px(Math.min(e.y1, e.y2)), w: px(Math.abs(e.x2 - e.x1)), h: px(Math.abs(e.y2 - e.y1)),
          line: { color: hex(e.color), width: pt(e.sw), endArrowType: e.arrow ? "triangle" : undefined } });
      } else if (e.k === "img") {
        const im = images[e.src]; if (!im) continue;
        if (e.frame) s.addShape(p.ShapeType.rect, { x: px(e.x), y: px(e.y), w: px(e.w), h: px(e.h), fill: { color: "FFFFFF" }, line: { color: "E6E1D8", width: 0.75 } });
        const w = e.w - 2 * e.frame, h = e.h - 2 * e.frame;
        const focus = e.src.startsWith("photo:") ? get(data, ["photos", e.src.slice(6), "focus"]) : "";
        s.addImage({ data: cropped(im, w, h, e.fit, focus), x: px(e.x + e.frame), y: px(e.y + e.frame), w: px(w), h: px(h) });
      } else if (e.k === "pennant") {
        s.addShape(p.ShapeType.triangle, { x: px(e.x + e.w / 2 - e.h / 2), y: px(e.y + e.h / 2 - e.w / 2), w: px(e.h), h: px(e.w), rotate: 84, fill: { color: hex(e.fill) }, line: { type: "none" } });
        s.addText(e.text, { x: px(e.x + 20), y: px(e.y + 10), w: px(e.w * 0.62), h: px(e.h - 20), rotate: -6, fontFace: "Rye", fontSize: pt(e.h * 0.3), color: hex(e.color), margin: 0, valign: "middle" });
      } else if (e.k === "text") {
        if (!measureCtx) measureCtx = document.createElement("canvas").getContext("2d");
        for (const b of pptxTextBoxes(e, layoutText(measureCtx, e))) {
          const runs = [];
          b.lines.forEach((l, i, all) => l.forEach((r, j) => runs.push({ text: r.t, options: {
            fontFace: r.cjk ? CJK : LATIN, fontSize: pt(r.size), bold: r.weight >= 700, italic: r.italic, color: hex(r.color),
            breakLine: j === l.length - 1 && i < all.length - 1 } })));
          if (!runs.length) continue;
          s.addText(runs, { x: px(b.x), y: px(b.y), w: px(b.w), h: px(b.h), align: b.align, valign: b.valign, margin: 0, fit: "none",
            lineSpacingMultiple: b.lh, wrap: b.wrap });
        }
      }
    }
  }
  return p;
}

// 檔名用的：學校名變成小寫、只留英數與連字號。
export const slug = s => String(s || "post").toLowerCase().replace(/university|college|of\b/g, " ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "post";
// 還沒好的地方翻成給人看的一句（資料庫 mkt_post_problems 回的是 unchecked:rank、photo:campus）。
export function problemKeys(list) { return (list || []).map(s => String(s).split(":")); }
