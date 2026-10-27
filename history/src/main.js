// /history/ 的主程式：拿資料、開 3D 場景、接捲動、年份帶、鍵盤、覆蓋層、網址 hash、中英、自動走。
// 這一支碰 DOM，純函式都在 data.js、ui.js、airport.js。gsap 不在這裡（只在 scene.js 的 motion()）；Three 也不在這裡（只在 scene.js 與 plane.js）。
// scene.js 是**動態 import** 的：它一載就會去 cdnjs 拿 Three，拿不到（離線、雜湊對不上、被擋）整支載不進來，這裡接住然後走直立時間軸，頁面不會白掉。
import * as D from "./data.js";
import * as UI from "./ui.js";
import * as A from "./airport.js";
import { t } from "./strings.js";

const $ = id => document.getElementById(id);
const doc = document.documentElement;
// 開了「減少動態效果」就走直立時間軸。網址加 ?motion=off 也走同一條，給不會改系統設定的人檢查用（README 有寫）。
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const motionOff = new URLSearchParams(location.search).get("motion") === "off";
const phone = matchMedia("(pointer: coarse)").matches && Math.min(innerWidth, innerHeight) < 760;

let lang = doc.getAttribute("data-lang") || "en";
let stops = [], w = A.world(0), motifs = [];
let current = -1, progress = 0, eased = 0;
let api = null;                 // motion() 回的把手；直立時間軸時是 null
let gl = null;                  // createScene() 回的場景；直立時間軸時是 null
let cardsEl = null, cardEls = [], stripCentres = [], endEl = null, stageEl = null, worldEl = null;
let openedFrom = null, savedY = 0, playing = false, raf = 0, clock = 0;
let aim = -1;   // 鍵盤連按時的目標站：鏡頭還在滑的時候 current 還沒變，連按三下要跳三站不是一站

// ── 語言 ──
function setLang(l) {
  lang = l; doc.setAttribute("data-lang", l); doc.lang = l === "zh" ? "zh-Hant" : "en";
  document.title = `${t("title", l)} / Beyond Taiwan`;
  // 語言跟著人走：寫到網址，不寫到裝置（對外頁不存東西）。hash 留著。
  const u = new URL(location.href); u.searchParams.set("lang", l); history.replaceState(null, "", u);
  const home = $("home"); if (home) home.href = "../?lang=" + l;
  $("lang").textContent = t("lang", l); $("lang").setAttribute("aria-label", t("langLabel", l));
  paintPlay();
  if (endEl) endEl.innerHTML = UI.endHTML(l);
  if (stops.length) { renderCards(); renderStrip(); paintGhost(); if (!$("panel").hidden) $("panel").innerHTML = UI.overlayHTML(stops[current], lang); }
}
function paintPlay() { const b = $("play"); b.textContent = playing ? t("pause", lang) : t("play", lang); b.setAttribute("aria-pressed", playing ? "true" : "false"); }

// ── 畫 ──
function renderCards() {
  if (!cardsEl) return;
  cardsEl.innerHTML = stops.map((s, i) => UI.cardHTML(s, i, lang)).join("");
  cardEls = [...cardsEl.querySelectorAll(".card")];
  placeCards();
}
// 卡貼在 3D 錨點投到螢幕的那一點上方（像素）。卡不隨遠近縮放（字要讀得到），鏡頭快到了才浮出來。
function placeCards() {
  if (!gl || !stageEl) return;
  const W = stageEl.clientWidth || innerWidth;
  cardEls.forEach((c, i) => {
    const s = w.stops[i]; if (!s) return;
    const p = gl.project(s.anchor);
    // 現在這一站，加上下一站在快到之前那一小段，卡才浮出來。
    const d = (eased - s.p) * Math.max(1, w.n - 1);
    const near = p.visible && d > -0.42 && d < 0.6;
    c.classList.toggle("near", near);
    if (!p.visible) return;
    // 卡不准被畫面左右切掉（手機上那一站可能靠邊）：夾在邊界內，尾巴可以歪一點沒關係。
    const half = (c.offsetWidth || 280) / 2 + 10;
    const x = Math.min(W - half, Math.max(half, p.x));
    c.style.setProperty("--x", x.toFixed(1)); c.style.setProperty("--y", Math.max(90, p.y - 8).toFixed(1));
  });
}
function renderStrip() {
  $("strip").innerHTML = UI.stripHTML(stops, current, lang);
  measureStrip(); placeDot();
}
function measureStrip() {
  const box = $("strip").querySelector(".strip-stops");
  stripCentres = box ? [...box.querySelectorAll(".strip-stop")].map(b => b.offsetLeft + b.offsetWidth / 2) : [];
}
// 年份帶上的那顆點：在兩站的中心之間照進度滑。
function placeDot() {
  const dot = $("strip").querySelector(".strip-dot"); if (!dot || stripCentres.length < 1) return;
  const q = progress * (stripCentres.length - 1), i = Math.min(stripCentres.length - 2, Math.max(0, Math.floor(q))), f = q - i;
  const x = stripCentres.length > 1 ? stripCentres[i] + (stripCentres[i + 1] - stripCentres[i]) * f : stripCentres[0];
  dot.style.left = x.toFixed(1) + "px";
}
// 左上淡淡的大年份，跟著現在那一站。
function paintGhost() { const g = $("ghost"); if (g && current >= 0) g.textContent = UI.ghostHTML(stops[current].year); }
function setCurrent(i) {
  if (i === aim) aim = -1;
  if (i === current) return;
  current = i;
  renderStrip(); revealCurrent(); paintGhost();
  if (gl) gl.setBoard(UI.boardRows(stops, current));
  // 網址寫上這一站。replaceState 不會讓瀏覽器自己跳。
  history.replaceState(null, "", location.pathname + location.search + D.hashFor(stops[i]));
}
// 年份帶把現在那一站捲到看得見的地方（手機上只放得下三站）。
function revealCurrent(instant) {
  const strip = $("strip"), on = strip.querySelector(".on");
  if (strip.hidden || !on) return;
  const box = strip.querySelector(".strip-stops");
  box.scrollTo({ left: on.offsetLeft - box.clientWidth / 2 + on.offsetWidth / 2, behavior: instant || reduce ? "auto" : "smooth" });
}
// 捲得快的時候頂欄與年份帶稍微淡掉，停下來就回來。
let lastP = 0, lastT = 0, rushTimer = 0;
function rush(p) {
  const now = performance.now(), dt = now - lastT;
  if (dt > 0 && dt < 200) {
    const v = Math.abs(p - lastP) / dt * 1000 * Math.max(1, w.n - 1);   // 每秒走幾站
    if (v > 1.6) { doc.classList.add("rushing"); clearTimeout(rushTimer); rushTimer = setTimeout(() => doc.classList.remove("rushing"), 260); }
  }
  lastP = p; lastT = now;
}
let measured = [0, 0];   // 上次量到的 stage 尺寸；每次推進度先比一下，變了就重量
function onProgress(p) {
  progress = p;
  if (stageEl && (stageEl.clientWidth !== measured[0] || stageEl.clientHeight !== measured[1])) size();
  if (!gl) return;
  eased = A.eased(w, p);
  gl.render(eased, clock);
  placeCards();
  if (endEl) endEl.classList.toggle("show", w.n > 0 && p > 1 - 0.5 / Math.max(1, w.n - 1) && (A.planePoseAt(eased).lift || 0) > 0.6);
  // 靠近一站整個世界（場景與卡）一起稍微放大。
  const zoom = 1 + 0.04 * A.closeness(w, p);
  if (worldEl) worldEl.style.transform = `scale(${zoom.toFixed(3)})`;
  placeDot(); rush(p);
  const n = A.nearest(w, p); if (n >= 0) setCurrent(n);
  if (p > 0.01) $("hint").classList.add("gone");
}
// 閒置的時鐘：信標、雲、車、人。進度沒變的時候也要重畫（它們在動）。分頁在背景就不畫。
function onTick(tsec) { clock = tsec; if (gl && !document.hidden) { gl.render(eased, clock); placeCards(); } }
function size() {
  if (!stageEl) return;
  const h = stageEl.clientHeight || innerHeight, ww = stageEl.clientWidth || innerWidth;
  measured = [stageEl.clientWidth, stageEl.clientHeight];
  if (gl) gl.resize(ww, h);
}

// ── 跳站 ──
function goTo(i, instant) {
  if (i < 0 || i >= stops.length) return;
  if (api) api.jump(A.progressFor(w, i), instant);
  else {
    // 直立時間軸：捲到那張卡。
    const c = document.querySelector(`#timeline .card[data-i="${i}"]`);
    if (c) c.scrollIntoView({ block: "center", behavior: instant || reduce ? "auto" : "smooth" });
    setCurrent(i);
  }
}

// ── 覆蓋層 ──
function openStop(i, from) {
  if (i < 0 || i >= stops.length) return;
  stopPlay();
  openedFrom = from || null; savedY = scrollY;
  const panel = $("panel");
  panel.innerHTML = UI.overlayHTML(stops[i], lang);
  panel.hidden = false; doc.classList.add("panel-open");
  requestAnimationFrame(() => { panel.classList.add("in"); const b = panel.querySelector("[data-close]"); if (b) b.focus(); });
  history.replaceState(null, "", location.pathname + location.search + D.hashFor(stops[i]));
}
function closePanel() {
  const panel = $("panel"); if (panel.hidden) return;
  panel.classList.remove("in");
  const done = () => { panel.hidden = true; panel.innerHTML = ""; };
  if (reduce) done(); else setTimeout(done, 320);
  doc.classList.remove("panel-open");
  // 位置一樣：釘住的頁面關掉覆蓋層後捲軸可能動了一點，寫回去。
  scrollTo(0, savedY);
  closeLightbox();
  if (openedFrom && openedFrom.isConnected) openedFrom.focus(); else { const c = cardEls[current]; if (c) c.focus(); }
  openedFrom = null;
}
// 燈箱直接拿覆蓋層裡那張圖的網址與說明，不回頭查資料（覆蓋層畫的是什麼就放大什麼）。
function openLightbox(btn) {
  const img = btn.querySelector("img"); if (!img) return;
  const cap = img.getAttribute("alt") || "";
  const lb = $("lightbox");
  lb.innerHTML = `<button type="button" class="lb-close" data-lb-close aria-label="${UI.esc(t("closeLightbox", lang))}">×</button>` +
    `<figure><img src="${UI.esc(img.getAttribute("src"))}" alt="${UI.esc(cap)}" decoding="async">${cap ? `<figcaption>${UI.esc(cap)}</figcaption>` : ""}</figure>`;
  lb.hidden = false; lb.querySelector("[data-lb-close]").focus();
}
function closeLightbox() { const lb = $("lightbox"); if (lb.hidden) return; lb.hidden = true; lb.innerHTML = ""; const b = $("panel").querySelector(".shot-btn"); if (b) b.focus(); }

// ── 自動走 ──
function startPlay() {
  if (!api || playing) return;
  playing = true; paintPlay();
  const { start, end } = api.range();
  const speed = Math.max(1.2, (end - start) / (stops.length * 240));   // 每站約四秒
  let last = 0;
  const step = ts => {
    if (!playing) return;
    if (last) scrollTo(0, Math.min(end, scrollY + speed * Math.min(2, (ts - last) / 16.7)));
    last = ts;
    if (scrollY >= end - 1) { stopPlay(); return; }
    raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
}
function stopPlay() { if (!playing) return; playing = false; cancelAnimationFrame(raf); paintPlay(); }
// 人一動就停：滾輪、手指、鍵盤。
for (const ev of ["wheel", "touchstart", "pointerdown"]) addEventListener(ev, e => { aim = -1; if (playing && !e.target.closest("#play")) stopPlay(); }, { passive: true });

// ── 鍵盤 ──
addEventListener("keydown", e => {
  if (e.key === "Escape") { if (!$("lightbox").hidden) closeLightbox(); else closePanel(); return; }
  if (!$("panel").hidden) return;
  if (e.altKey || e.ctrlKey || e.metaKey) return;
  const base = aim >= 0 ? aim : current;
  if (e.key === "ArrowRight") { e.preventDefault(); stopPlay(); if (base + 1 < stops.length) { aim = base + 1; goTo(aim); } }
  else if (e.key === "ArrowLeft") { e.preventDefault(); stopPlay(); if (base - 1 >= 0) { aim = base - 1; goTo(aim); } }
  else if (playing && /^(ArrowUp|ArrowDown|PageUp|PageDown|Home|End| )$/.test(e.key)) stopPlay();
});

// ── 點 ──
document.addEventListener("click", e => {
  const card = e.target.closest(".card"); if (card) { openStop(+card.dataset.i, card); return; }
  const strip = e.target.closest(".strip-stop"); if (strip) { stopPlay(); goTo(+strip.dataset.i); return; }
  if (e.target.closest("[data-close]")) { closePanel(); return; }
  const shot = e.target.closest(".shot-btn"); if (shot) { if (matchMedia("(min-width: 760px)").matches) openLightbox(shot); return; }
  if (e.target.closest("[data-lb-close]") || e.target === $("lightbox")) { closeLightbox(); return; }
});
$("lang").addEventListener("click", () => setLang(lang === "zh" ? "en" : "zh"));
$("play").addEventListener("click", () => playing ? stopPlay() : startPlay());
addEventListener("hashchange", () => { const i = D.indexFromHash(location.hash, stops); if (i >= 0 && i !== current) goTo(i); });
// 視窗變了就重量。用 ResizeObserver 不用 resize 事件：嵌在別的視窗裡（預覽面板、iframe）時 resize 不一定會來，而 stage 的大小變了是真的。
let roTimer = 0;
const onResize = () => { clearTimeout(roTimer); roTimer = setTimeout(() => { size(); measureStrip(); placeDot(); if (api) api.refresh(); onProgress(progress); }, 80); };
addEventListener("resize", onResize);
if ("ResizeObserver" in window) new ResizeObserver(onResize).observe(document.documentElement);

// GSAP 的兩支 script 排在 main.js 後面（這樣主程式先跑、先去拿資料）。等它們載完或失敗再決定走哪一條。
// 已經載到的（window.gsap 在）不等；還在路上的等 load 或 error；最多等四秒，之後當作沒載到走直立時間軸。
function gsapReady() {
  const waits = [...document.querySelectorAll('script[src*="cdnjs.cloudflare.com/ajax/libs/gsap"]')]
    .filter(s => !(/ScrollTrigger/.test(s.src) ? window.ScrollTrigger : window.gsap))
    .map(s => new Promise(res => { s.addEventListener("load", res, { once: true }); s.addEventListener("error", res, { once: true }); }));
  return Promise.race([Promise.all(waits), new Promise(res => setTimeout(res, 4000))]);
}
// 場景（跟著 Three）動態載進來：十秒內沒到、或載失敗，回 null。
function sceneReady() {
  return Promise.race([import("./scene.js").catch(e => { console.warn("3D 場景載不進來，走直立時間軸：", e); return null; }), new Promise(res => setTimeout(() => res(null), 10000))]);
}
// 七色從 shared/brand.css 的 CSS 變數讀，字體家族也是。場景程式裡因此沒有任何色碼。
function paletteFromCSS() {
  const cs = getComputedStyle(doc), v = k => cs.getPropertyValue(k).trim();
  return { palette: { navy: v("--bt-navy"), teal: v("--bt-teal"), orange: v("--bt-orange"), sand: v("--bt-sand"), cream: v("--bt-cream"), yellow: v("--bt-yellow"), grey: v("--bt-grey") }, fonts: { display: v("--display"), body: v("--body") } };
}

// 讓瀏覽器先畫一幀再繼續。分頁在背景時 requestAnimationFrame 不會來，所以最多等 150ms 就往下走，不會卡住。
const paintFirst = () => new Promise(r => { requestAnimationFrame(() => setTimeout(r, 0)); setTimeout(r, 150); });

// ── 開頁 ──
// 捲動位置由網址的 #代號 決定，不讓瀏覽器自己恢復上一次的位置（重新整理之後兩邊搶，鏡頭會跳兩次）。
try { history.scrollRestoration = "manual"; } catch (e) {}
async function boot() {
  setLang(lang);
  const state = $("state");
  const wantMove = !reduce && !motionOff;
  stageEl = wantMove ? $("stage") : null; worldEl = wantMove ? $("world") : null;
  endEl = wantMove ? $("end") : null; if (endEl) endEl.innerHTML = UI.endHTML(lang);
  (wantMove ? $("road-wrap") : $("static")).hidden = false;
  // 先放一張骨架卡，不等資料也不等 Three（手機上 public_milestones() 要幾百毫秒、Three 要幾百 KB，空白看起來像壞了）。
  $("skeleton").innerHTML = UI.skeletonHTML(lang);
  const fetching = D.fetchStops();
  await paintFirst();
  // 三樣東西一起等：GSAP、場景（Three，幾百 KB）、資料。減少動態或 ?motion=off 就不去載場景。
  // **資料先到就先畫年份帶與大年份**，不等 Three：大年份是 Lighthouse 量 LCP 的那個元素，批 5 第一次量讓它等 Three 下載完，慢了快一秒。
  const sceneP = wantMove ? Promise.all([gsapReady(), sceneReady()]).then(r => r[1]) : gsapReady().then(() => null);
  let rows;
  try { rows = await fetching; }
  catch (e) { console.error("public_milestones() 拿不到：", e); $("skeleton").innerHTML = ""; state.innerHTML = UI.errorHTML(lang); return; }
  stops = rows;
  $("skeleton").innerHTML = "";
  if (!stops.length) { state.innerHTML = UI.emptyHTML(lang); return; }
  state.innerHTML = "";
  w = A.world(stops.length); motifs = stops.map(s => D.motifFor(s.slug));
  const start = Math.max(0, D.indexFromHash(location.hash, stops));
  $("strip").hidden = false; setCurrent(start); revealCurrent(true);
  const S = await sceneP, webgl = !!(S && S.webglOK());
  // 走哪一條：沒開減少動態效果、沒有 ?motion=off、WebGL 開得出來、gsap 與 Three 都載到了，才走 3D（airport.js 的 pickMode）。
  const mode = A.pickMode({ reduce, motionOff, webgl, gsap: !!(window.gsap && window.ScrollTrigger), three: !!S });
  if (mode !== "3d" && wantMove) {
    // 本來準備走 3D 的，少了一樣：換到直立時間軸。
    $("road-wrap").hidden = true; $("static").hidden = false; stageEl = null; worldEl = null; endEl = null;
  }
  if (mode === "3d") {
    cardsEl = $("cards");
    const { palette, fonts } = paletteFromCSS();
    gl = S.createScene({ canvas: $("scene"), palette, phone, fonts });
    gl.setStops(w, motifs); gl.setBoard(UI.boardRows(stops, 0)); gl.setGate(A.boardingGate(stops.length));
    // 捲動的長度：每站一屏，最少九屏（四段要有地方走；站少的時候不能三下就起飛）。
    $("road-wrap").style.height = `${Math.max(stops.length + 1, 9) * 100}vh`;
    size(); renderCards();
    api = S.motion({ wrap: $("road-wrap"), stage: $("stage"), onProgress, onTick });
    api.refresh();
    // 帶 #代號 進來就直接站到那一站（瞬間，不滑），沒有就第一站。年份帶與網址由 onProgress 順手寫。
    api.jump(A.progressFor(w, start), true);
  } else {
    // 直立時間軸：每一站一張卡。
    $("timeline").innerHTML = UI.timelineHTML(stops, lang);
    cardEls = [...$("timeline").querySelectorAll(".card")];
    if (start > 0) goTo(start, true);
    // 捲到哪一張卡，年份帶就亮哪一站。
    if ("IntersectionObserver" in window) {
      const io = new IntersectionObserver(() => {
        const mid = innerHeight / 2; let best = -1, dist = Infinity;
        cardEls.forEach((c, i) => { const r = c.getBoundingClientRect(); if (r.bottom < 0 || r.top > innerHeight) return; const d = Math.abs((r.top + r.bottom) / 2 - mid); if (d < dist) { dist = d; best = i; } });
        if (best >= 0) setCurrent(best);
      }, { rootMargin: "-35% 0px -35% 0px", threshold: [0, 0.5, 1] });
      cardEls.forEach(c => io.observe(c));
    }
  }
  renderStrip(); revealCurrent(true);
}
boot();
