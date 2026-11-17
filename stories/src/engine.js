// /stories/ 的主程式：讀劇本、畫第一屏、一關一關走、結尾。這一支碰 DOM；純函式在 data.js、ui.js、layout.js。
// gsap 不在這裡（只在兩個殼的 motion() 裡），Three 也不在這裡（只在 shell-flight.js 與 plane.js、person.js）。
// 殼（島點燈或機場）是動態 import 的：載不到、開了減少動態效果、?motion=off，畫面照走，只是上面那塊是靜的。
import * as D from "./data.js";
import * as UI from "./ui.js";
import { t, ZECZEC_URL } from "./strings.js";
import { ISLAND } from "./island.js";
import * as L from "./layout.js";

const $ = id => document.getElementById(id);
const doc = document.documentElement;
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const motionOff = new URLSearchParams(location.search).get("motion") === "off";
const phone = matchMedia("(pointer: coarse)").matches && Math.min(innerWidth, innerHeight) < 760;
const fromZeczec = D.fromZeczec(location.search);
const shellName = D.shellFromSearch(location.search, "lamp");

let lang = doc.getAttribute("data-lang") || "zh";
let script = null, people = null;
let persona = null, sceneI = 0, picks = [];   // picks[i] = 0 或 1，還沒選是 undefined
let shell = null;                            // 殼的把手：{ start, scene, light, end, reset, setLang }
let view = "pick";                           // pick | scene | end

// ── 語言 ──
function setLang(l) {
  lang = l; doc.setAttribute("data-lang", l); doc.lang = l === "zh" ? "zh-Hant" : "en";
  document.title = `${t("title", l)} / Beyond Taiwan`;
  const u = new URL(location.href); u.searchParams.set("lang", l); history.replaceState(null, "", u);
  $("lang").textContent = t("lang", l); $("lang").setAttribute("aria-label", t("langLabel", l));
  $("back-top").textContent = t("back", l);
  const home = $("home"); if (home) home.href = "../?lang=" + l;
  if (shell) shell.setLang(l);
  render();
}

// ── 畫 ──
function render() {
  const main = $("story"); if (!script) return;
  if (view === "pick") { main.innerHTML = UI.pickerHTML(script, lang); setProgress(0, ""); return; }
  if (view === "end") {
    main.innerHTML = UI.endHTML(persona, D.peopleMet(persona, picks), lang, { zeczec: ZECZEC_URL, fromZeczec });
    setProgress(1, "");
    return;
  }
  main.innerHTML = UI.sceneHTML(persona, sceneI, lang, picks[sceneI], script.notes);
  setProgress(D.progressOf(sceneI, picks[sceneI] != null, persona.scenes.length), UI.progressLabel(sceneI, persona.scenes.length, lang));
}
function setProgress(p, label) {
  const bar = $("progress"), fill = $("progress-fill");
  bar.hidden = view === "pick";
  fill.style.width = (p * 100).toFixed(1) + "%";
  bar.setAttribute("aria-valuenow", Math.round(p * 100));
  $("progress-label").textContent = label;
}

// ── 走 ──
function pick(id) {
  persona = script.personas.find(p => p.id === id); if (!persona) return;
  sceneI = 0; picks = []; view = "scene";
  history.replaceState(null, "", location.pathname + location.search + D.hashFor(id));
  render(); scrollTop();
  if (shell) shell.start(persona, lang);
  if (shell) shell.scene(0, persona.scenes[0]);
}
function choose(k) {
  if (view !== "scene" || picks[sceneI] != null) return;
  picks[sceneI] = k; render();
  const c = persona.scenes[sceneI].choices[k];
  if (shell) shell.light(c.person, sceneI, k);
  const r = $("story").querySelector(".reveal"); if (r) r.scrollIntoView({ block: "nearest", behavior: reduce ? "auto" : "smooth" });
}
function next() {
  if (view !== "scene") return;
  if (sceneI + 1 >= persona.scenes.length) { view = "end"; render(); scrollTop(); if (shell) shell.end(persona, D.peopleMet(persona, picks)); return; }
  sceneI++; render(); scrollTop();
  if (shell) shell.scene(sceneI, persona.scenes[sceneI]);
}
function again() {
  persona = null; sceneI = 0; picks = []; view = "pick";
  history.replaceState(null, "", location.pathname + location.search);
  render(); scrollTop();
  if (shell) shell.reset();
}
function scrollTop() { const m = $("story"); const y = m.getBoundingClientRect().top + scrollY - 70; scrollTo({ top: Math.max(0, Math.min(y, scrollY)), behavior: "auto" }); }

// ── 點 ──
document.addEventListener("click", e => {
  const p = e.target.closest("[data-pick]"); if (p) { pick(p.dataset.pick); return; }
  const c = e.target.closest("[data-choice]"); if (c) { choose(+c.dataset.choice); return; }
  if (e.target.closest("[data-next]")) { next(); return; }
  if (e.target.closest("[data-again]")) { again(); return; }
  const flip = e.target.closest("[data-flip]");
  if (flip) { const box = flip.closest("[data-letter]"); box.classList.add("open"); flip.setAttribute("aria-expanded", "true"); box.querySelector(".letter-back").hidden = false; flip.hidden = true; return; }
  const note = e.target.closest("[data-note]");
  if (note) { const li = note.closest(".note"); const was = li.classList.contains("big"); document.querySelectorAll(".note.big").forEach(n => n.classList.remove("big")); if (!was) li.classList.add("big"); return; }
});
$("lang").addEventListener("click", () => setLang(lang === "zh" ? "en" : "zh"));
addEventListener("hashchange", () => { const id = D.personaFromHash(location.hash); if (id && (!persona || persona.id !== id)) pick(id); if (!id && view !== "pick") again(); });
addEventListener("keydown", e => { if (e.key === "Escape") document.querySelectorAll(".note.big").forEach(n => n.classList.remove("big")); });

// ── 殼 ──
// 走哪一條：沒開減少動態效果、沒有 ?motion=off、gsap 載到了，才去載殼。機場版還要 WebGL 與 Three（shell-flight.js 自己判斷，不行就回 null）。
function gsapReady() {
  const waits = [...document.querySelectorAll('script[src*="cdnjs.cloudflare.com/ajax/libs/gsap"]')]
    .filter(s => !window.gsap)
    .map(s => new Promise(res => { s.addEventListener("load", res, { once: true }); s.addEventListener("error", res, { once: true }); }));
  return Promise.race([Promise.all(waits), new Promise(res => setTimeout(res, 4000))]);
}
function paletteFromCSS() {
  const cs = getComputedStyle(doc), v = k => cs.getPropertyValue(k).trim();
  return { palette: { navy: v("--bt-navy"), teal: v("--bt-teal"), orange: v("--bt-orange"), sand: v("--bt-sand"), cream: v("--bt-cream"), yellow: v("--bt-yellow"), grey: v("--bt-grey") }, fonts: { display: v("--display"), body: v("--body"), han: v("--han") } };
}
async function loadShell() {
  if (reduce || motionOff) return null;
  await gsapReady();
  if (!window.gsap) return null;
  const file = shellName === "flight" ? "./shell-flight.js" : "./shell-lamp.js";
  const mod = await Promise.race([import(file).catch(e => { console.warn("殼載不進來，畫面照走：", e); return null; }), new Promise(res => setTimeout(() => res(null), 10000))]);
  if (!mod) return null;
  const { palette, fonts } = paletteFromCSS();
  try { return await mod.create({ stage: $("stage"), palette, fonts, phone, lang, people }); }
  catch (e) { console.warn("殼開不起來，畫面照走：", e); return null; }
}

// ── 開頁 ──
try { history.scrollRestoration = "manual"; } catch (e) {}
async function boot() {
  doc.classList.add("js");
  if (reduce || motionOff) doc.classList.add("still");
  doc.setAttribute("data-shell", shellName);
  setLang(lang);
  try { const all = await D.loadAll("./"); script = all.script; people = all.people; }
  catch (e) { console.error("劇本載不到：", e); $("story").innerHTML = UI.errorHTML(lang); return; }
  if (!script.personas.length) { $("story").innerHTML = UI.errorHTML(lang); return; }
  const start = D.personaFromHash(location.hash);
  if (start) pick(start); else render();
  shell = await loadShell();
  if (shell) {
    shell.setLang(lang);
    if (persona) { shell.start(persona, lang); shell.scene(sceneI, persona.scenes[sceneI]); persona.scenes.forEach((s, i) => { if (picks[i] != null) shell.light(s.choices[picks[i]].person, i, picks[i]); }); }
  } else {
    doc.classList.add("still"); stillStage();
  }
}
// 沒有殼（減少動態效果、?motion=off、gsap 或殼載不到）：舞台上一張靜的島，整座亮著。
function stillStage() {
  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg"); svg.setAttribute("viewBox", "0 0 1200 780"); svg.setAttribute("class", "lamp still-isle"); svg.setAttribute("aria-hidden", "true");
  const g = document.createElementNS(NS, "g"); g.setAttribute("class", "isle lit"); g.setAttribute("transform", `translate(${L.ISLE.tx},${L.ISLE.ty}) scale(${L.ISLE.s})`);
  for (const d of ISLAND) { const p = document.createElementNS(NS, "path"); p.setAttribute("d", d); p.setAttribute("class", "isle-path"); g.appendChild(p); }
  svg.appendChild(g); $("stage").innerHTML = ""; $("stage").appendChild(svg);
}
boot();
