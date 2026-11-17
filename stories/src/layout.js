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

// ── 機場版 ──
// 單位公尺，y 朝上。大廳沿 x 軸躺著，玻璃牆在 z = 0，停機坪在 z > 0。旅客站在走道上（z 約 -11）面對玻璃牆。
export const HALL = { x0: -6, x1: 96, z0: -30, z1: 0, h: 11 };
// 八個登機門沿玻璃牆每 9 公尺一個，每一關一個：第 i 關旅客走到第 i 個門前面，那個門亮起來。第一個門（學測）在最左。門號 A1 到 A8（跟 /history/ 一樣）。
export function gates(n) {
  const out = [], step = 9, x0 = 10;
  for (let i = 0; i < n; i++) out.push({ i, x: x0 + step * i, z: HALL.z1, label: "A" + (i + 1) });
  return out;
}
// 第 i 關旅客站哪：那個門前面偏左一點。
export function travellerFor(i, n) { const g = gates(n)[Math.min(i, n - 1)]; return { x: g.x - 1.2, z: -11 }; }
// 走過來的人站在旅客旁邊：左右交錯、越來越外面，像一群人慢慢圍過來。base 是旅客現在的位置。
export function standSpot(k, base) {
  const b = base || { x: 0, z: -11 }, side = k % 2 ? 1 : -1, ring = Math.floor(k / 2);
  return { x: b.x + side * (1.6 + ring * 1.3), z: b.z - 0.6 - ring * 0.9 + (k % 4 >= 2 ? 0.5 : 0) };
}
// 每一關鏡頭在哪：在旅客後方偏右、人眼略高，看著那一關的門；最後一關拉高拉遠看得到停機坪上的飛機。
export function cameraFor(i, n) {
  const g = gates(n)[Math.min(i, n - 1)];
  if (i >= n - 1) return { x: g.x + 2, y: 7.5, z: -27, lookX: g.x + 4, lookY: 2.5, lookZ: 40 };
  return { x: g.x + 3.2, y: 2.7, z: -22, lookX: g.x - 0.5, lookY: 2.2, lookZ: HALL.z1 };
}
// 飛機停的位置（最後一關從右邊滑進來停在最後那個門外）。
export const PLANE_STAND = { x: gates(8)[7].x + 8, z: 44, fromX: 300 };
