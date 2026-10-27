// /history/ 的主程式：拿資料、畫場景、接捲動、年份帶、鍵盤、覆蓋層、網址 hash、中英、自動走。
// 這一支碰 DOM，純函式都在 data.js、ui.js、scene.js。gsap 不在這裡（只在 scene.js 的 motion()）。
import * as D from "./data.js";
import * as UI from "./ui.js";
import * as S from "./scene.js";
import { t } from "./strings.js";

const $ = id => document.getElementById(id);
const doc = document.documentElement;
// 開了「減少動態效果」就走直立時間軸。網址加 ?motion=off 也走同一條，給不會改系統設定的人檢查用（README 有寫）。
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches || new URLSearchParams(location.search).get("motion") === "off";

let lang = doc.getAttribute("data-lang") || "en";
let stops = [], w = S.world(0), motifs = [];
let current = -1, progress = 0, viewW = 1000, scale = 1, tall = false, cam = S.camera(1000, false);
let api = null;                 // motion() 回的把手；減少動態或 gsap 沒載到就是 null
let reg = null;                 // scene.attach() 記下來的節點
let cardsEl = null, cardEls = [], stripCentres = [];
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
  if (stops.length) { renderCards(); renderStrip(); paintGhost(); if (!$("panel").hidden) $("panel").innerHTML = UI.overlayHTML(stops[current], lang); }
}
function paintPlay() { const b = $("play"); b.textContent = playing ? t("pause", lang) : t("play", lang); b.setAttribute("aria-pressed", playing ? "true" : "false"); }

// ── 畫 ──
function renderCards() {
  if (!cardsEl) return;
  cardsEl.innerHTML = stops.map((s, i) => UI.cardHTML(s, i, lang)).join("");
  cardEls = [...cardsEl.querySelectorAll(".card")];
  placeCards(S.stopPoints(w, cam, S.camZ(w, progress)));
}
// 卡站在小場景上方：--x --y 是畫面座標（單位），--s 是每單位幾 px。卡不隨遠近縮放（字要讀得到），靠近才浮出來。
function placeCards(pts) {
  cardEls.forEach((c, i) => {
    const p = pts[i]; if (!p) { c.classList.remove("near"); return; }
    // 卡不准被畫面左右切掉（手機上那一站靠右邊）：夾在邊界內，尾巴可以歪一點沒關係。
    const half = (c.offsetWidth || 280) / 2 / scale + 10 / scale;
    const x = Math.min(viewW - half, Math.max(half, p.x));
    c.style.setProperty("--x", x.toFixed(1)); c.style.setProperty("--y", p.top.toFixed(1));
    // 鏡頭快到了卡才浮出來：現在這一站，加上下一站在快到之前那一小段。
    c.classList.toggle("near", p.depth < S.AHEAD + 520);
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
// 左上淡淡的大年份，跟著現在那一站。方塊數字不是文字（ui.js 的 ghostHTML 有理由）。
function paintGhost() { const g = $("ghost"); if (g && current >= 0) g.innerHTML = UI.ghostHTML(stops[current].year); }
function setCurrent(i) {
  if (i === aim) aim = -1;
  if (i === current) return;
  current = i;
  renderStrip(); revealCurrent(); paintGhost();
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
let measured = [0, 0];   // 上次量到的 stage 尺寸；每次推進度先比一下，變了就重量（事件來不來都不靠）
function onProgress(p) {
  progress = p;
  if (stageEl && (stageEl.clientWidth !== measured[0] || stageEl.clientHeight !== measured[1])) { size(); return; }
  if (!reg) return;
  const pts = S.frame(reg, w, cam, p, clock);
  placeCards(pts);
  // 靠近一站鏡頭稍微放大：整個世界（場景與卡）一起。
  const zoom = 1 + 0.05 * S.closeness(w, p);
  if (worldEl) worldEl.style.transform = `scale(${zoom.toFixed(3)})`;
  placeDot(); rush(p);
  const n = S.nearest(w, p); if (n >= 0) setCurrent(n);
  if (p > 0.01) $("hint").classList.add("gone");
}
// 閒置的時鐘：路上的車與人。進度沒變的時候 frame() 只動它們。
function onTick(tsec) { clock = tsec; if (reg && !document.hidden) S.frame(reg, w, cam, progress, clock); }
let stageEl = null, sceneEl = null, worldEl = null;   // 會動的那一條或靜的那一張，boot() 決定
function buildScene() {
  sceneEl.innerHTML = S.sceneSVG(w, motifs, tall);
  reg = S.attach(sceneEl); reg.lastP = undefined;
  S.layout(reg, cam);
  if (api) api.rebind();
}
// 資料來了：站數在村子鋪好的長度內就只放站，不重鋪（重鋪一次是這一頁最重的排版）。
function placeStops() {
  if (!reg || stops.length > S.MIN_STOPS) { buildScene(); return; }
  S.placeStops(reg, w, motifs);
  if (api) api.rebind();
}
function size() {
  if (!stageEl) return;
  const h = stageEl.clientHeight || innerHeight, ww = stageEl.clientWidth || innerWidth;
  measured = [stageEl.clientWidth, stageEl.clientHeight];
  scale = h / S.H; viewW = ww / scale;
  const nowTall = ww < h * 0.9;
  cam = S.camera(viewW, nowTall);
  sceneEl.setAttribute("viewBox", `0 0 ${viewW.toFixed(1)} ${S.H}`);
  if (cardsEl) cardsEl.style.setProperty("--s", scale);
  if (nowTall !== tall || !reg) { tall = nowTall; buildScene(); } else S.layout(reg, cam);
  reg.lastP = undefined;
  onProgress(progress);
}

// ── 跳站 ──
function goTo(i, instant) {
  if (i < 0 || i >= stops.length) return;
  if (api) api.jump(S.progressFor(w, i), instant);
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
const onResize = () => { clearTimeout(roTimer); roTimer = setTimeout(() => { size(); measureStrip(); placeDot(); if (api) api.refresh(); }, 80); };
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

// 讓瀏覽器先畫一幀再繼續。分頁在背景時 requestAnimationFrame 不會來，所以最多等 150ms 就往下走，不會卡住。
const paintFirst = () => new Promise(r => { requestAnimationFrame(() => setTimeout(r, 0)); setTimeout(r, 150); });

// ── 開頁 ──
// 捲動位置由網址的 #代號 決定，不讓瀏覽器自己恢復上一次的位置（重新整理之後兩邊搶，鏡頭會跳兩次）。
try { history.scrollRestoration = "manual"; } catch (e) {}
async function boot() {
  setLang(lang);
  // 先把路畫出來、放一張骨架卡，不等資料（手機上 public_milestones() 要幾百毫秒，空白幾百毫秒看起來像壞了）。
  const state = $("state");
  stageEl = reduce ? $("stage-static") : $("stage"); sceneEl = stageEl.querySelector("svg"); worldEl = stageEl.querySelector(".world");
  (reduce ? $("static") : $("road-wrap")).hidden = false;
  $("skeleton").innerHTML = UI.skeletonHTML(lang);
  const fetching = D.fetchStops();
  // 先讓瀏覽器把頂欄與骨架畫出來，再畫路（擋在第一次繪製前面就是白畫面）。
  await paintFirst();
  size();
  let rows;
  await gsapReady();
  try { rows = await fetching; }
  catch (e) { console.error("public_milestones() 拿不到：", e); $("skeleton").innerHTML = ""; state.innerHTML = UI.errorHTML(lang); return; }
  stops = rows;
  $("skeleton").innerHTML = "";
  if (!stops.length) { state.innerHTML = UI.emptyHTML(lang); return; }
  state.innerHTML = "";
  w = S.world(stops.length); motifs = stops.map(s => D.motifFor(s.slug));
  const start = Math.max(0, D.indexFromHash(location.hash, stops));
  // 能動的條件：沒開減少動態效果，而且 gsap 真的載到了（CDN 被擋、雜湊對不上都算沒載到）。
  const canMove = !reduce && window.gsap && window.ScrollTrigger;
  if (!canMove && !reduce) {
    // 本來準備走動的，gsap 沒來：換到靜的那一張。
    $("road-wrap").hidden = true; $("static").hidden = false;
    stageEl = $("stage-static"); sceneEl = stageEl.querySelector("svg"); worldEl = null; reg = null;
  }
  if (canMove) {
    cardsEl = $("cards");
    $("road-wrap").style.height = `${(stops.length + 1) * 100}vh`;
    placeStops(); size(); renderCards();
    api = S.motion({ wrap: $("road-wrap"), stage: $("stage"), svg: sceneEl, onProgress, onTick });
    api.rebind(); api.refresh();
    // 帶 #代號 進來就直接站到那一站（瞬間，不滑），沒有就第一站。年份帶與網址由 onProgress 順手寫。
    api.jump(S.progressFor(w, start), true);
  } else {
    // 直立時間軸：場景畫一張靜的在上面（進度 0），底下每一站一張卡。
    placeStops(); size(); onProgress(0);
    $("timeline").innerHTML = UI.timelineHTML(stops, lang);
    cardEls = [...$("timeline").querySelectorAll(".card")];
    if (start > 0) goTo(start, true); else setCurrent(0);
    // 捲到哪一張卡，年份帶就亮哪一站。
    if ("IntersectionObserver" in window) {
      // 看畫面中間那一條帶子裡是哪一張卡；同時有兩張就挑離中心近的那一張。
      const io = new IntersectionObserver(() => {
        const mid = innerHeight / 2; let best = -1, dist = Infinity;
        cardEls.forEach((c, i) => { const r = c.getBoundingClientRect(); if (r.bottom < 0 || r.top > innerHeight) return; const d = Math.abs((r.top + r.bottom) / 2 - mid); if (d < dist) { dist = d; best = i; } });
        if (best >= 0) setCurrent(best);
      }, { rootMargin: "-35% 0px -35% 0px", threshold: [0, 0.5, 1] });
      cardEls.forEach(c => io.observe(c));
    }
  }
  $("strip").hidden = false;
  renderStrip(); revealCurrent(true);
}
boot();
