const TAU_ = Math.PI * 2;
// /stories/ 兩個殼共用的數字：純數學，沒有 DOM、沒有 Three、沒有 gsap。測試直接算。
// 點燈版：一個人要亮在哪（島上照縣市，海外照國家分散在島外）。
// 機場版：八個登機門在玻璃牆上哪裡、走過來的人站哪裡、每一關鏡頭在哪。
import { CITIES } from "./island.js";

// ── 點燈版 ──
// 島的座標系大約 0..490 寬、0..690 高；SVG 的 viewBox 是 0 0 1200 780，島放在中間偏左（shell-lamp.js 的 ISLE 變換）。
// 海外的光點放在 viewBox 的座標裡，不在島的座標裡：abroad 為 true 的點 shell 不套島的變換。
export const ISLE = { tx: 330, ty: 40, s: 1.0 };
const REGIONS = {
  // 名字對到 people.json 的 country_en（不分大小寫、只看開頭）。每一區一個基準點與一個方向，第 i 個人往那個方向排開。
  // 手機上 SVG 是裁切的（看得到 x 約 210 到 990），所以海外的點都放在這個範圍裡。
  usa:        { x: 960, y: 250, dx: 0, dy: 70 },
  "united s": { x: 960, y: 250, dx: 0, dy: 70 },
  canada:     { x: 900, y: 110, dx: 50, dy: 0 },
  uk:         { x: 240, y: 160, dx: 0, dy: 60 },
  "united k": { x: 240, y: 160, dx: 0, dy: 60 },
  europe:     { x: 240, y: 160, dx: 0, dy: 60 },
  netherlands:{ x: 250, y: 260, dx: 0, dy: 60 },
  belgium:    { x: 250, y: 260, dx: 0, dy: 60 },
  japan:      { x: 760, y: 90, dx: 60, dy: 0 },
  korea:      { x: 640, y: 60, dx: 60, dy: 0 },
  australia:  { x: 880, y: 660, dx: 60, dy: 0 },
  singapore:  { x: 520, y: 720, dx: 70, dy: 0 },
};
const FALLBACK = { x: 960, y: 500, dx: 0, dy: 60 };
export function regionFor(countryEn) {
  const c = String(countryEn || "").trim().toLowerCase();
  if (!c || c === "taiwan" || c === "台灣") return null;
  for (const k of Object.keys(REGIONS)) if (c.startsWith(k)) return REGIONS[k];
  return FALLBACK;
}
// 一個人要亮在哪。回 { x, y, abroad }。島上的人用島的座標（shell 會套 ISLE 變換），海外的人直接是 viewBox 座標。
export function lampSpot(person, index) {
  const r = regionFor(person.country_en);
  if (!r) {
    const c = CITIES[person.county] || CITIES["台北"];
    return { x: c[0], y: c[1], abroad: false };
  }
  const i = index || 0;
  return { x: r.x + r.dx * i, y: r.y + r.dy * i, abroad: true };
}
// 一個縣市在島上的座標；填錯或沒填就當台北（人還在，只是點的位置是預設的）。
export const cityOf = county => CITIES[county] || CITIES["台北"];
// 把島的座標換成 viewBox 座標（航線的起點要用）。
export const toView = (x, y) => ({ x: ISLE.tx + x * ISLE.s, y: ISLE.ty + y * ISLE.s });

// ── 島版（3D，2026-11-16 第二版）──
// 單位公尺，y 朝上。一座半徑 ISLAND_R 的圓島，環島一條半徑 ROAD_R 的路。八關是路上八個小地方，照角度排一圈，從碼頭旁邊開始逆時針走。
export const ISLAND_R = 24, ROAD_R = 16.5;
export const PIER_ANGLE = Math.PI * 0.5;   // 碼頭在島的「南邊」（+z），第一屏鏡頭從這一側看過去
const KINDS = ["school", "hall", "camp", "phone", "desk", "home", "post", "pier"];
export const STATIONS = KINDS.map((kind, i) => { const angle = PIER_ANGLE + 0.35 + i * (TAU_ / 8) * 0.92; return { i, kind, angle, x: Math.cos(angle) * (ROAD_R + 3.2), z: Math.sin(angle) * (ROAD_R + 3.2) }; });
// 三個學生在沙灘上站的位置（碼頭旁邊），face 是面向鏡頭的角度。
export const CANDIDATE_SPOTS = [-4.6, 0, 4.6].map((dx, i) => ({ x: dx + Math.cos(PIER_ANGLE) * (ISLAND_R - 3.4), z: Math.sin(PIER_ANGLE) * (ISLAND_R - 3.4) + (i === 1 ? 1.4 : -0.6), face: Math.PI * 0.5 + (i - 1) * 0.2 }));
