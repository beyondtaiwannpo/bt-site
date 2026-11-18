// /island/ 的主程式：讀 teams.json、畫清單與卡、開 3D、接網址、把自己放上去。這一支碰 DOM；純函式在 data.js、ui.js、layout.js。
// Three 只在 scene.js（動態 import，載不到就只剩清單與卡，內容一樣）。
import * as D from "./data.js";
import * as UI from "./ui.js";
import { t } from "./strings.js";

const $ = id => document.getElementById(id);
const doc = document.documentElement;
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const motionOff = new URLSearchParams(location.search).get("motion") === "off";
const phone = matchMedia("(pointer: coarse)").matches && Math.min(innerWidth, innerHeight) < 760;
const ME_KEY = "bt-island-me";

let lang = doc.getAttribute("data-lang") || "zh";
let data = null, scene = null, loop = null, sel = null, me = null;
const ui = { names: false, paused: false, bird: false, flows: false };

// ── 語言 ──
function setLang(l) {
  lang = l; doc.setAttribute("data-lang", l); doc.lang = l === "zh" ? "zh-Hant" : "en";
  document.title = `${t("title", l)} / Beyond Taiwan`;
  const u = new URL(location.href); u.searchParams.set("lang", l); history.replaceState(null, "", u);
  $("lang").textContent = t("lang", l); $("lang").setAttribute("aria-label", t("langLabel", l));
  const home = $("home"); if (home) home.href = "../?lang=" + l;
  for (const b of document.querySelectorAll("[data-t]")) b.textContent = t(b.dataset.t, l);
  $("tb-pause").textContent = t(ui.paused ? "play" : "pause", l);
  renderIndex(); renderCard(); pushLabels();
}
function pushLabels() {
  if (!scene || !data) return;
  const teams = {}, people = { programs: {} };
  for (const tm of data.teams) { teams[tm.id] = tm["name_" + lang] || tm.name_zh; for (const p of tm.programs) people.programs[p.id] = p["name_" + lang] || p.name_zh; }
  for (const p of data.people) people[p.code] = D.label(p, lang) + (p.flow ? " · " + (p.flow["carry_" + lang] || p.flow.carry_zh) : "");
  const evs = (data.events || []).filter(e => e.state === "open"); if (scene) scene.events(evs.map(e => ({ team: e.team, title: e["title_" + lang] || e.title_zh, link: e.link })));
  scene.labels({ teams, people, me: me ? me.name + " " + t("meYou", lang) : "" });
}

// ── 畫 ──
function renderIndex() { if (data) $("tree").innerHTML = UI.indexHTML(data, lang, sel || {}); }
function renderCard() {
  const card = $("card"), body = $("card-content");
  if (!sel || !data) { card.hidden = true; body.innerHTML = ""; return; }
  if (sel.kind === "team") { const tm = D.teamById(data, sel.team); if (!tm) return close(); body.innerHTML = UI.teamCardHTML(tm, lang, data); }
  else if (sel.kind === "program") { const p = D.programById(data, sel.program), tm = p && D.teamById(data, p.team); if (!p) return close(); body.innerHTML = UI.programCardHTML(p, tm, lang, data); }
  else if (sel.kind === "person") { const p = D.personByCode(data, sel.code); if (!p) return close(); body.innerHTML = UI.personCardHTML(p, D.teamById(data, p.team), lang, data); }
  card.hidden = false; card.scrollTop = 0;
}
function select(s, fromHash) {
  sel = s;
  if (!fromHash) history.replaceState(null, "", location.pathname + location.search + (s ? D.hashFor(s) : ""));
  renderIndex(); renderCard();
  if (scene) scene.select(s);
  doc.classList.toggle("has-card", !!s);
  if (phone && s) $("sidebar").classList.remove("open");
}
function close() { select(null); }

// ── 點 ──
// 貼文放大看：按一則先在中間放大，按圖或那顆按鈕才到 Instagram；× 或 Esc 或按旁邊關掉。
function openPost(id) { const x = data && data.instagram ? data.instagram.posts.find(p => p.id === id) : null; if (!x) return; $("lb-box").innerHTML = UI.postBigHTML(x, lang); $("lb").hidden = false; $("lb-box").querySelector(".lb-go").focus(); }
function closePost() { $("lb").hidden = true; }
document.addEventListener("keydown", e => { if (e.key === "Escape" && !$("lb").hidden) { closePost(); e.stopImmediatePropagation(); } });   // 關了放大看就停在這，不順手把卡也關掉
document.addEventListener("click", e => {
  const post = e.target.closest("[data-post]"); if (post) { openPost(Number(post.dataset.post)); return; }
  if (e.target.closest("[data-lb-close]") || (e.target.id === "lb")) { closePost(); return; }
  const tm = e.target.closest("[data-go-team]"); if (tm) { select({ kind: "team", team: tm.dataset.goTeam }); return; }
  const pr = e.target.closest("[data-go-program]"); if (pr) { select({ kind: "program", team: pr.dataset.team, program: pr.dataset.goProgram }); return; }
  const pp = e.target.closest("[data-go-person]"); if (pp) { if (pp.dataset.goPerson === "me") { openMe(); return; } select({ kind: "person", code: pp.dataset.goPerson }); return; }
  if (e.target.closest("[data-close]")) { close(); return; }
  if (e.target.closest("[data-me-cancel]")) { closeMe(); return; }
  if (e.target.closest("[data-me-remove]")) { saveMe(null); closeMe(); return; }
});
$("lang").addEventListener("click", () => setLang(lang === "zh" ? "en" : "zh"));
$("tb-home").addEventListener("click", () => { ui.bird = false; $("tb-bird").setAttribute("aria-pressed", "false"); select(null); });
$("tb-names").addEventListener("click", () => { ui.names = !ui.names; $("tb-names").setAttribute("aria-pressed", String(ui.names)); if (scene) scene.names(ui.names); });
$("tb-pause").addEventListener("click", () => { ui.paused = !ui.paused; $("tb-pause").setAttribute("aria-pressed", String(ui.paused)); $("tb-pause").textContent = t(ui.paused ? "play" : "pause", lang); if (loop) loop.pause(ui.paused); });
$("tb-flows").addEventListener("click", () => { ui.flows = !ui.flows; $("tb-flows").setAttribute("aria-pressed", String(ui.flows)); if (scene) scene.flows(ui.flows); });
$("tb-bird").addEventListener("click", () => { ui.bird = !ui.bird; $("tb-bird").setAttribute("aria-pressed", String(ui.bird)); if (scene) scene.bird(ui.bird); });
$("tb-index").addEventListener("click", () => $("sidebar").classList.toggle("open"));
$("sidebar-close").addEventListener("click", () => $("sidebar").classList.remove("open"));
$("tb-me").addEventListener("click", openMe);
addEventListener("hashchange", () => { const s = D.parseHash(location.hash); select(s.kind === "overview" ? null : s, true); });
addEventListener("keydown", e => { if (e.key === "Escape" && $("lb").hidden) { if (!$("me").hidden) closeMe(); else if (sel) close(); } });

// ── 把自己放上去（只存在這台裝置）──
function loadMe() { try { return D.normalizeMe(JSON.parse(localStorage.getItem(ME_KEY) || "null"), data.teams); } catch (e) { return null; } }
function saveMe(info) {
  me = info;
  try { if (info) localStorage.setItem(ME_KEY, JSON.stringify(info)); else localStorage.removeItem(ME_KEY); } catch (e) {}
  if (scene) { scene.me(info ? { ...info, label: info.name + " " + t("meYou", lang) } : null); if (info) select({ kind: "team", team: info.team }); }
  $("tb-me").classList.toggle("on", !!info);
}
function openMe() { const box = $("me"); $("me-form").innerHTML = UI.meFormHTML(data, lang, me); box.hidden = false; doc.classList.add("me-open"); const f = $("me-name"); if (f) f.focus(); }
function closeMe() { $("me").hidden = true; doc.classList.remove("me-open"); }
$("me-form").addEventListener("submit", e => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const info = D.normalizeMe({ name: fd.get("name"), team: fd.get("team"), shirt: fd.get("shirt"), hair: fd.get("hair") }, data.teams);
  if (!info) return;
  saveMe(info); closeMe();
});
$("me").addEventListener("click", e => { if (e.target === $("me")) closeMe(); });

// 畫面中間空出來的那一塊（卡與清單之間）的中心，佔視窗寬的比例。手機上卡與清單都在底下，就是正中央。
function freeCentre() {
  const W = innerWidth; if (W < 900) return 0.5;
  const card = $("card"), side = $("sidebar");
  const left = card.hidden ? 0 : card.getBoundingClientRect().right, right = doc.classList.contains("side-folded") ? W : side.getBoundingClientRect().left;
  return ((left + right) / 2) / W;
}

// 空出來那一塊佔視窗寬的比例（卡與清單之外）。手機上是 1。
function freeWidth() { const W = innerWidth; if (W < 900) return 1; const card = $("card"), side = $("sidebar"); const left = card.hidden ? 0 : card.getBoundingClientRect().right, right = doc.classList.contains("side-folded") ? W : side.getBoundingClientRect().left; return Math.max(0.3, (right - left) / W); }
// 收起、打開（Paul 2026-11-17：清單與品牌框要收得起來，讓人看島）。記在這台裝置的瀏覽器裡。
const UI_KEY = "bt-island-ui";
function readUi() { try { return JSON.parse(localStorage.getItem(UI_KEY) || "{}") || {}; } catch (e) { return {}; } }
function writeUi(patch) { try { localStorage.setItem(UI_KEY, JSON.stringify({ ...readUi(), ...patch })); } catch (e) { /* 存不了就算了 */ } }
function applyFolds(ui) {
  doc.classList.toggle("side-folded", !!ui.sideFolded); doc.classList.toggle("brand-folded", !!ui.brandFolded);
  $("side-tab").hidden = !ui.sideFolded; $("side-fold").setAttribute("aria-expanded", String(!ui.sideFolded));
  $("brand-fold").setAttribute("aria-expanded", String(!ui.brandFolded)); $("brand-fold").textContent = ui.brandFolded ? "+" : "−";
  // 空出來那一塊變了，鏡頭要重新對：有選的對那座島，沒有就全景。
  if (scene) { if (sel) scene.select(sel); else scene.overview(); }
}
$("side-fold").addEventListener("click", () => { writeUi({ sideFolded: true }); applyFolds(readUi()); });
$("side-tab").addEventListener("click", () => { writeUi({ sideFolded: false }); applyFolds(readUi()); });
$("brand-fold").addEventListener("click", () => { writeUi({ brandFolded: !readUi().brandFolded }); applyFolds(readUi()); });

// ── 角落那一句（批 C）：鯨魚要浮上來、飛機要起飛，發生前兩秒出現，點了鏡頭飛過去。──
let eventId = "";
function showEvent(id, on) { const el = $("event-line"); if (!on) { if (eventId === id) { eventId = ""; el.hidden = true; } return; } eventId = id; el.textContent = t(id === "whale" ? "evWhale" : "evPlane", lang); el.hidden = false; }
$("event-line").addEventListener("click", () => { if (scene && eventId) scene.goEvent(eventId); });
// ── 開頁 ──
function paletteFromCSS() { const cs = getComputedStyle(doc), v = k => cs.getPropertyValue(k).trim(); return { navy: v("--bt-navy"), teal: v("--bt-teal"), orange: v("--bt-orange"), sand: v("--bt-sand"), cream: v("--bt-cream"), yellow: v("--bt-yellow"), grey: v("--bt-grey") }; }
async function boot() {
  doc.classList.add("js");
  setLang(lang);
  try { data = await D.load("./"); } catch (e) { console.error("teams.json 載不到：", e); $("tree").innerHTML = UI.errorHTML(lang); return; }
  renderIndex();
  const start = D.parseHash(location.hash);
  // 3D：動態 import（Three 從 cdnjs 來）。載不到或沒有 WebGL：留清單與卡，上面印一句。
  const mod = await Promise.race([import("./scene.js").catch(e => { console.warn("3D 載不進來：", e); return null; }), new Promise(r => setTimeout(() => r(null), 10000))]);
  if (mod) {
    try { scene = mod.create({ stage: $("stage"), pins: $("pins"), palette: paletteFromCSS(), phone, data, onSelect: s => select(s), onHover: s => { if (scene) scene.hover(s); }, onEvent: (id, on) => showEvent(id, on), freeCentre, freeWidth }); }
    catch (e) { console.warn("3D 開不起來：", e); scene = null; }
  }
  if (!scene) { doc.classList.add("no3d"); $("no3d").hidden = false; }
  else if (!reduce && !motionOff) loop = scene.motion();
  else { doc.classList.add("still"); scene.still(); }
  if (new URLSearchParams(location.search).get("debug") === "1") window.__island = scene;   // 除錯：console 打 __island.debug()
  $("loading").hidden = true;
  applyFolds(readUi());
  me = loadMe(); if (me && scene) { scene.me({ ...me, label: me.name + " " + t("meYou", lang) }); $("tb-me").classList.add("on"); }
  pushLabels();
  if (start.kind !== "overview") select(start, true);
  // 跟官網其他頁接起來：活動（/events/ 那一份）與真的校友（/alumni/ 那一份）。拿不到就當沒有。
  const [events, alumni, instagram, roster] = await Promise.all([D.loadEvents(), D.loadAlumni(), D.loadPosts("./", data.teams), D.loadRoster(data.teams)]);
  // 團隊頁那一份名單進來：teams.json 裡自己打的幹部讓位。
  if (roster.length) { D.mergeRoster(data, roster); if (scene) scene.people(data.people); renderIndex(); renderCard(); pushLabels(); }
  data.instagram = instagram; if (sel && sel.kind === "program") renderCard();
  if (scene) scene.posts(D.postsOf(instagram, "instagram").filter(x => x.image).map(x => "./" + x.image));
  data.events = events;
  if (alumni.length) { D.mergeAlumni(data, alumni); if (scene) scene.people(data.people); }
  if (scene) scene.events(events.filter(e => e.state === "open").map(e => ({ team: e.team, title: e["title_" + lang] || e.title_zh, link: e.link })));
  pushLabels(); renderIndex(); renderCard();
}
boot();
