// /stories/ 的點燈版：首頁那座島，一開始是暗的。每一關選完，一個人亮起來：
// 在台灣的人亮在島上他出發的縣市；在海外的人亮在島外，一條航線從他的縣市飛過去（/alumni/ 的語言）。
// 走完一年，島上與島外都亮了，環繞島的那條線（logo 上的箭頭）畫出來。
//
// ── 兩件事 ──
// 1. **資料與動畫分開。** 誰在哪裡是 layout.js 算的；這裡只畫。
// 2. **會動的東西全部在 motion() 裡。** 開了減少動態效果 engine.js 根本不載這一支；就算載了，gsap 沒有也只是不動。
import { ISLAND } from "./island.js";
import * as L from "./layout.js";

const NS = "http://www.w3.org/2000/svg";
const el = (tag, attrs, parent) => { const n = document.createElementNS(NS, tag); for (const k in attrs) n.setAttribute(k, attrs[k]); if (parent) parent.appendChild(n); return n; };

export async function create({ stage, lang, phone }) {
  stage.innerHTML = "";
  // 手機的舞台接近正方形：用 slice 裁掉左右兩邊，島才夠大；桌機整張放進去。
  const svg = el("svg", { viewBox: "0 0 1200 780", class: "lamp", "aria-hidden": "true", preserveAspectRatio: phone ? "xMidYMid slice" : "xMidYMid meet" }, stage);
  const defs = el("defs", {}, svg);
  const mk = el("marker", { id: "lamp-arw", viewBox: "0 0 10 10", refX: "9", refY: "5", markerWidth: "14", markerHeight: "14", orient: "auto", markerUnits: "userSpaceOnUse" }, defs);
  el("path", { class: "lamp-arw", d: "M0 0 L10 5 L0 10 Z" }, mk);
  const glow = el("filter", { id: "lamp-glow", x: "-100%", y: "-100%", width: "300%", height: "300%" }, defs);
  el("feGaussianBlur", { stdDeviation: "6", result: "b" }, glow);
  const mg = el("feMerge", {}, glow); el("feMergeNode", { in: "b" }, mg); el("feMergeNode", { in: "SourceGraphic" }, mg);

  // 島：一開始是淡的（沒亮），走著走著變實。環繞線最後才畫。
  const isleG = el("g", { class: "isle", transform: `translate(${L.ISLE.tx},${L.ISLE.ty}) scale(${L.ISLE.s})` }, svg);
  ISLAND.forEach(d => el("path", { d, class: "isle-path" }, isleG));
  const ring = el("path", { class: "ring", "marker-end": "url(#lamp-arw)" }, svg);
  const routes = el("g", { class: "routes" }, svg);
  const lamps = el("g", { class: "lamps" }, svg);
  const labels = el("g", { class: "labels" }, svg);
  // 第一屏的字：島上一行小字（中英）。
  const cap = el("text", { class: "cap", x: 600, y: 740, "text-anchor": "middle" }, svg);

  const state = { lit: [], abroadCount: 0, persona: null, lang, api: null };
  const paintCap = () => { cap.textContent = state.persona ? "" : (state.lang === "zh" ? "每一盞燈都是一個人" : "Every lamp is a person"); };
  paintCap();

  // 環繞線：橢圓取樣成 path（只有 path 掛得上箭頭）。中心在島的中心。
  const cx = L.ISLE.tx + 245, cy = L.ISLE.ty + 345;
  const ringPath = () => { const rx = 300, ry = 400, a0 = 20 * Math.PI / 180, pts = []; for (let i = 0; i <= 120; i++) { const a = a0 + i / 120 * Math.PI * 2; pts.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]); } return "M" + pts.map(p => p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" L"); };
  ring.setAttribute("d", ringPath());
  const ringLen = ring.getTotalLength(); ring.style.strokeDasharray = ringLen; ring.style.strokeDashoffset = ringLen;

  // 畫一盞燈（靜態：直接放上去；有 motion 時 motion 會把它從 0 長出來）。
  function addLamp(person, index) {
    const spot = L.lampSpot(person, state.abroadCount);
    const p = spot.abroad ? spot : L.toView(spot.x, spot.y);
    const role = person.role === "parent" ? "y" : person.role === "student" ? "t" : "";
    const halo = el("circle", { class: "halo", cx: p.x, cy: p.y, r: 14, filter: "url(#lamp-glow)" }, lamps);
    const dot = el("circle", { class: "dot " + role, cx: p.x, cy: p.y, r: 7 }, lamps);
    let route = null;
    if (spot.abroad) {
      state.abroadCount++;
      const home = L.cityOf(person.county), from = L.toView(home[0], home[1]);
      // 弧線：中點往上抬（像 /alumni/ 的航線），抬的方向看目的地在左還是右。
      const mx = (from.x + p.x) / 2, my = Math.min(from.y, p.y) - Math.abs(p.x - from.x) * 0.28 - 40;
      route = el("path", { class: "route", d: `M${from.x.toFixed(1)} ${from.y.toFixed(1)} Q${mx.toFixed(1)} ${my.toFixed(1)} ${p.x.toFixed(1)} ${p.y.toFixed(1)}` }, routes);
      const len = route.getTotalLength(); route.style.strokeDasharray = len; route.style.strokeDashoffset = len;
    }
    const lab = el("text", { class: "lab", x: p.x + (spot.abroad && p.x < 600 ? -16 : 16), y: p.y + 5, "text-anchor": spot.abroad && p.x < 600 ? "end" : "start" }, labels);
    lab.textContent = person.city || "";
    const entry = { person, index, halo, dot, route, lab, x: p.x, y: p.y };
    state.lit.push(entry);
    return entry;
  }
  function clearAll() { routes.innerHTML = ""; lamps.innerHTML = ""; labels.innerHTML = ""; state.lit = []; state.abroadCount = 0; ring.style.strokeDashoffset = ringLen; isleG.classList.remove("lit"); }

  const api = {
    setLang(l) { state.lang = l; paintCap(); },
    start(persona) { state.persona = persona; clearAll(); paintCap(); if (state.api) state.api.start(); },
    scene(i, s) { if (state.api) state.api.scene(i, s); },
    light(person, i) {
      if (!person) return;
      if (state.lit.some(e => e.person.code === person.code)) { if (state.api) state.api.pulse(state.lit.find(e => e.person.code === person.code)); return; }
      const e = addLamp(person, i);
      if (state.api) state.api.lit(e); else { isleG.classList.add("lit"); if (e.route) e.route.style.strokeDashoffset = 0; }
    },
    end(persona, met) { isleG.classList.add("lit"); if (state.api) state.api.end(); else ring.style.strokeDashoffset = 0; },
    reset() { state.persona = null; clearAll(); paintCap(); if (state.api) state.api.reset(); },
  };
  if (window.gsap) state.api = motion({ svg, isleG, ring, ringLen, state });
  return api;
}

/* ── 這裡面才有動畫。外面不准出現 gsap。 ── */
function motion({ svg, isleG, ring, ringLen, state }) {
  // 島平常慢慢呼吸（很慢、很小），環繞線一開始不在。
  const breathe = gsap.to(isleG, { attr: { transform: `translate(${L.ISLE.tx},${L.ISLE.ty - 4}) scale(${L.ISLE.s})` }, duration: 6, yoyo: true, repeat: -1, ease: "sine.inOut" });
  return {
    start() { gsap.fromTo(isleG, { opacity: 0.35 }, { opacity: 0.55, duration: 0.8, ease: "power2.out" }); },
    scene(i, s) {
      // 每一關鏡頭稍微換一下：往有燈的那一邊偏一點。
      const vb = i < 2 ? "100 0 1000 780" : i < 5 ? "40 0 1120 780" : "0 0 1200 780";
      gsap.to(svg, { attr: { viewBox: vb }, duration: 1.1, ease: "power2.inOut" });
    },
    lit(e) {
      isleG.classList.add("lit");
      gsap.to(isleG, { opacity: Math.min(1, 0.55 + state.lit.length * 0.06), duration: 0.6 });
      const tl = gsap.timeline();
      if (e.route) tl.to(e.route, { strokeDashoffset: 0, duration: 0.9, ease: "power2.inOut" }, 0);
      tl.fromTo(e.dot, { attr: { r: 0 }, opacity: 0 }, { attr: { r: 7 }, opacity: 1, duration: 0.45, ease: "back.out(2)" }, e.route ? 0.8 : 0);
      tl.fromTo(e.halo, { attr: { r: 2 }, opacity: 0 }, { attr: { r: 14 }, opacity: 0.9, duration: 0.6, ease: "power2.out" }, "<");
      tl.fromTo(e.lab, { opacity: 0, x: -6 }, { opacity: 1, x: 0, duration: 0.4 }, "<0.2");
      // 之後這一盞慢慢呼吸
      tl.add(() => gsap.to(e.halo, { attr: { r: 18 }, opacity: 0.55, duration: 2.2 + Math.random(), yoyo: true, repeat: -1, ease: "sine.inOut" }));
    },
    pulse(e) { gsap.fromTo(e.halo, { attr: { r: 14 } }, { attr: { r: 26 }, duration: 0.5, yoyo: true, repeat: 1, ease: "power2.out" }); },
    end() {
      gsap.to(svg, { attr: { viewBox: "0 0 1200 780" }, duration: 1.2, ease: "power2.inOut" });
      gsap.to(isleG, { opacity: 1, duration: 0.8 });
      gsap.fromTo(ring, { strokeDashoffset: ringLen }, { strokeDashoffset: 0, duration: 2.4, ease: "power2.inOut", delay: 0.4 });
      state.lit.forEach((e, i) => gsap.fromTo(e.halo, { attr: { r: 14 } }, { attr: { r: 24 }, duration: 0.6, yoyo: true, repeat: 1, delay: 0.1 * i }));
    },
    reset() { gsap.killTweensOf(ring); ring.style.strokeDashoffset = ringLen; gsap.to(isleG, { opacity: 0.35, duration: 0.5 }); gsap.to(svg, { attr: { viewBox: "0 0 1200 780" }, duration: 0.6 }); },
    stop() { breathe.kill(); },
  };
}
