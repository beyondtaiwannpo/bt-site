// /history/ 的主程式：拿資料、開 3D 場景、滾輪與拖曳沿路走、年份帶、鍵盤、覆蓋層、網址 hash、中英、自動走。
// 這一支碰 DOM，純函式都在 data.js、ui.js、road.js。Three 不在這裡（只在 scene.js 與 shared/toy.js）；這一頁 2026-11-17 起沒有 GSAP。
// scene.js 是**動態 import** 的：它一載就會去 cdnjs 拿 Three，拿不到（離線、雜湊對不上、被擋）整支載不進來，這裡接住然後走直立時間軸，頁面不會白掉。
import * as D from "./data.js";
import * as UI from "./ui.js";
import * as R from "./road.js";
import { t } from "./strings.js";

const $ = id => document.getElementById(id);
const doc = document.documentElement;
// 開了「減少動態效果」就走直立時間軸。網址加 ?motion=off 也走同一條，給不會改系統設定的人檢查用（README 有寫）。
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const motionOff = new URLSearchParams(location.search).get("motion") === "off";
const phone = matchMedia("(pointer: coarse)").matches && Math.min(innerWidth, innerHeight) < 760;

let lang = doc.getAttribute("data-lang") || "en";
let stops = [], w = R.world(0), motifs = [];
let current = -1, progress = 0, eased = 0;
let sc = null;                  // scene.create() 回的場景；直立時間軸時是 null
let loop = null;                // 引擎 motion() 回的把手；減少動態時是 null
let cardsEl = null, cardEls = [], stripCentres = [], endEl = null;
let openedFrom = null, playing = false;
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
  if (sc) sc.labels({ back: t("backToIsland", l) });
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
// 卡貼在那一站的路標上方（3D 錨點投到螢幕的那一點）。卡不隨遠近縮放（字要讀得到），鏡頭快到了才浮出來。
function placeCards() {
  if (!sc) return;
  const W = $("stage").clientWidth || innerWidth;
  cardEls.forEach((c, i) => {
    const p = sc.anchor(i);
    const d = eased * (w.N - 1) - (i + 1);   // 離這一站幾站
    const near = p.visible && d > -0.55 && d < 0.55;
    c.classList.toggle("near", near);
    if (!p.visible) return;
    const half = (c.offsetWidth || 280) / 2 + 10;
    const x = Math.min(W - half, Math.max(half, p.x));
    c.style.setProperty("--x", x.toFixed(1)); c.style.setProperty("--y", Math.max(90, p.y - 8).toFixed(1));
  });
}
function renderStrip() { $("strip").innerHTML = UI.stripHTML(stops, current, lang); measureStrip(); placeDot(); }
function measureStrip() { const box = $("strip").querySelector(".strip-stops"); stripCentres = box ? [...box.querySelectorAll(".strip-stop")].map(b => b.offsetLeft + b.offsetWidth / 2) : []; }
// 年份帶上的那顆點：在兩站的中心之間照進度滑。進度是整條路的（機場到今天），站只佔中間那一段。
function placeDot() {
  const dot = $("strip").querySelector(".strip-dot"); if (!dot || stripCentres.length < 1) return;
  const q = Math.max(0, Math.min(stripCentres.length - 1, eased * (w.N - 1) - 1)), i = Math.min(stripCentres.length - 2, Math.max(0, Math.floor(q))), f = q - i;
  const x = stripCentres.length > 1 ? stripCentres[i] + (stripCentres[i + 1] - stripCentres[i]) * f : stripCentres[0];
  dot.style.left = x.toFixed(1) + "px";
}
function paintGhost() { const g = $("ghost"); if (g && current >= 0) g.textContent = UI.ghostHTML(stops[current].year); }
function setCurrent(i) {
  if (i === aim) aim = -1;
  if (i === current) return;
  current = i;
  renderStrip(); revealCurrent(); paintGhost();
  history.replaceState(null, "", location.pathname + location.search + D.hashFor(stops[i]));
}
function revealCurrent(instant) {
  const strip = $("strip"), on = strip.querySelector(".on");
  if (strip.hidden || !on) return;
  const box = strip.querySelector(".strip-stops");
  box.scrollTo({ left: on.offsetLeft - box.clientWidth / 2 + on.offsetWidth / 2, behavior: instant || reduce ? "auto" : "smooth" });
}

// ── 沿路走 ──
// 進度 0 是機場、1 是今天；滾輪、拖曳、鍵盤、年份帶、自動走都只改 progress，每一幀 eased 用阻尼追上去再餵給場景。
function setProgress(p) {
  progress = Math.max(0, Math.min(1, p));
  if (p > 0.01) $("hint").classList.add("gone");
  if (!loop) { eased = progress; frame(0); }   // 沒有每一幀的迴圈（減少動態效果但有 WebGL）：改一次畫一次
}
function scrub(d) { stopPlay(); aim = -1; setProgress(progress + d); }
// 每一幀（引擎的 motion() 叫；減少動態時 setProgress 自己叫一次）。
function frame(dt) {
  if (!sc) return;
  if (playing) setProgress(progress + dt / ((w.N - 1) * 4));   // 自動走：每站約四秒
  if (playing && progress >= 1) stopPlay();
  eased += (progress - eased) * (loop ? 1 - Math.exp(-dt * 3.2) : 1);
  sc.at(eased);
  placeCards(); placeDot();
  if (endEl) endEl.classList.toggle("show", w.n > 0 && eased > 1 - 0.45 / (w.N - 1));
  const n = R.nearest(w, eased); if (n >= 0) setCurrent(n);
}

// ── 跳站 ──
function goTo(i, instant) {
  if (i < 0 || i >= stops.length) return;
  if (sc) { setProgress(R.progressFor(w, i)); if (instant) { eased = progress; frame(0); } }
  else {
    const c = document.querySelector(`#timeline .card[data-i="${i}"]`);
    if (c) c.scrollIntoView({ block: "center", behavior: instant || reduce ? "auto" : "smooth" });
    setCurrent(i);
  }
}

// ── 覆蓋層 ──
function openStop(i, from) {
  if (i < 0 || i >= stops.length) return;
  stopPlay();
  openedFrom = from || null;
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
  closeLightbox();
  if (openedFrom && openedFrom.isConnected) openedFrom.focus(); else { const c = cardEls[current]; if (c) c.focus(); }
  openedFrom = null;
}
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
function startPlay() { if (!loop || playing) return; if (progress >= 1) setProgress(0); playing = true; paintPlay(); }
function stopPlay() { if (!playing) return; playing = false; paintPlay(); }

// ── 鍵盤 ──
addEventListener("keydown", e => {
  if (e.key === "Escape") { if (!$("lightbox").hidden) closeLightbox(); else closePanel(); return; }
  if (!$("panel").hidden) return;
  if (e.altKey || e.ctrlKey || e.metaKey) return;
  const base = aim >= 0 ? aim : current;
  if (e.key === "ArrowRight" || e.key === "ArrowDown" || e.key === "PageDown") { e.preventDefault(); stopPlay(); if (base + 1 < stops.length) { aim = base + 1; goTo(aim); } else if (sc) setProgress(1); }
  else if (e.key === "ArrowLeft" || e.key === "ArrowUp" || e.key === "PageUp") { e.preventDefault(); stopPlay(); if (base - 1 >= 0) { aim = base - 1; goTo(aim); } else if (sc) setProgress(0); }
  else if (e.key === "Home") { e.preventDefault(); stopPlay(); if (sc) setProgress(0); else goTo(0); }
  else if (e.key === "End") { e.preventDefault(); stopPlay(); if (sc) setProgress(1); else goTo(stops.length - 1); }
  else if (playing && e.key === " ") { e.preventDefault(); stopPlay(); }
});

// ── 點 ──
document.addEventListener("click", e => {
  const card = e.target.closest(".card"); if (card) { openStop(+card.dataset.i, card); return; }
  const strip = e.target.closest(".strip-stop"); if (strip) { stopPlay(); goTo(+strip.dataset.i); return; }
  const st = e.target.closest("[data-go-station]"); if (st) { stopPlay(); goTo(+st.dataset.goStation); return; }
  if (e.target.closest("[data-close]") || e.target === $("panel")) { closePanel(); return; }
  const shot = e.target.closest(".shot-btn"); if (shot) { if (matchMedia("(min-width: 760px)").matches) openLightbox(shot); return; }
  if (e.target.closest("[data-lb-close]") || e.target === $("lightbox")) { closeLightbox(); return; }
});
$("lang").addEventListener("click", () => setLang(lang === "zh" ? "en" : "zh"));
$("play").addEventListener("click", () => playing ? stopPlay() : startPlay());
addEventListener("hashchange", () => { const i = D.indexFromHash(location.hash, stops); if (i >= 0 && i !== current) goTo(i); });
let roTimer = 0;
const onResize = () => { clearTimeout(roTimer); roTimer = setTimeout(() => { measureStrip(); placeDot(); if (sc && !loop) frame(0); }, 80); };
addEventListener("resize", onResize);

// 場景（跟著 Three）動態載進來：十秒內沒到、或載失敗，回 null。
function sceneReady() {
  return Promise.race([import("./scene.js").catch(e => { console.warn("3D 場景載不進來，走直立時間軸：", e); return null; }), new Promise(res => setTimeout(() => res(null), 10000))]);
}
// 七色從 shared/brand.css 的 CSS 變數讀。場景程式裡因此沒有任何色碼。
function paletteFromCSS() { const cs = getComputedStyle(doc), v = k => cs.getPropertyValue(k).trim(); return { navy: v("--bt-navy"), teal: v("--bt-teal"), orange: v("--bt-orange"), sand: v("--bt-sand"), cream: v("--bt-cream"), yellow: v("--bt-yellow"), grey: v("--bt-grey") }; }
const paintFirst = () => new Promise(r => { requestAnimationFrame(() => setTimeout(r, 0)); setTimeout(r, 150); });

// ── 開頁 ──
try { history.scrollRestoration = "manual"; } catch (e) {}
async function boot() {
  const hadHash = D.indexFromHash(location.hash, []) === -1 && !!location.hash.replace(/^#/, "").split("?")[0];   // 帶著 #代號 進來的（setCurrent 之後網址就一定有 hash，所以先記）
  setLang(lang);
  const state = $("state");
  const wantMove = !reduce && !motionOff;
  endEl = wantMove ? $("end") : null; if (endEl) endEl.innerHTML = UI.endHTML(lang);
  (wantMove ? $("road-wrap") : $("static")).hidden = false;
  $("skeleton").innerHTML = UI.skeletonHTML(lang);
  const fetching = D.fetchStops();
  await paintFirst();
  // 兩樣東西一起等：場景（Three，幾百 KB）與資料。減少動態或 ?motion=off 就不去載場景。
  // **資料先到就先畫年份帶與大年份**，不等 Three：大年份是 Lighthouse 量 LCP 的那個元素。
  const sceneP = wantMove ? sceneReady() : Promise.resolve(null);
  let rows;
  try { rows = await fetching; }
  catch (e) { console.error("public_milestones() 拿不到：", e); $("skeleton").innerHTML = ""; state.innerHTML = UI.errorHTML(lang); return; }
  stops = rows;
  $("skeleton").innerHTML = "";
  if (!stops.length) { state.innerHTML = UI.emptyHTML(lang); return; }
  state.innerHTML = "";
  w = R.world(stops.length, stops.map(s => s.photos.length > 0)); motifs = stops.map(s => D.motifFor(s.slug));
  const start = Math.max(0, D.indexFromHash(location.hash, stops));
  $("strip").hidden = false; setCurrent(start); revealCurrent(true);
  const S = await sceneP, webgl = !!(S && S.webglOK());
  // 走哪一條：沒開減少動態效果、沒有 ?motion=off、WebGL 開得出來、Three 載到了，才走 3D（road.js 的 pickMode）。
  const mode = R.pickMode({ reduce, motionOff, webgl, three: !!S });
  if (mode !== "3d" && wantMove) { $("road-wrap").hidden = true; $("static").hidden = false; endEl = null; }
  if (mode === "3d") {
    cardsEl = $("cards"); doc.classList.add("road3d");
    try {
      sc = S.create({ stage: $("world"), pins: $("pins"), palette: paletteFromCSS(), phone, w, motifs,
        photos: stops.map(s => s.photos.map(p => p.url)), years: stops.map(s => s.year),
        endText: [t("endLine", lang), t("endSub", lang)], backLink: { href: "../island/?lang=" + lang, label: t("backToIsland", lang) },
        onSelect: i => openStop(i), onScrub: scrub });
    } catch (e) { console.warn("3D 開不起來，走直立時間軸：", e); sc = null; }
  }
  if (sc) {
    renderCards();
    if (!reduce && !motionOff) loop = sc.motion(frame);
    // 帶 #代號 進來就直接站到那一站（瞬間，不滑），沒有就從機場出發。
    if (hadHash) goTo(start, true); else { setProgress(0); eased = 0; frame(0); }
    sc.paintPhotos();
    if (new URLSearchParams(location.search).get("debug") === "1") window.__road = sc;   // 除錯：console 打 __road.debug()
  } else {
    doc.classList.remove("road3d"); $("road-wrap").hidden = true; $("static").hidden = false;
    $("timeline").innerHTML = UI.timelineHTML(stops, lang);
    cardEls = [...$("timeline").querySelectorAll(".card")];
    if (start > 0) goTo(start, true);
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
