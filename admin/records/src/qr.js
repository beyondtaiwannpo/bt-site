// QR Code 產生器（2026-11-23）。給「個人連結」那一顆「顯示 QR Code」用：活動當天把連結印出來或給人掃。
// 自己寫一支、不從 CDN 載、不放進 vendor：這個 repo 沒有打包工具，少一個外面的檔就少一樣下一屆要管的東西。
// 只做用得到的那一小塊：位元組模式、容錯等級 M、版本 1 到 10（最多 213 個位元組，一條個人連結大約 105 個）。
// 超過就回 null，畫面改顯示「連結太長」。標準是 ISO/IEC 18004；寫法照 Project Nayuki 的參考實作的步驟（MIT）。
//
// 匯出兩支純函式，沒有 DOM：
//   qrMatrix(text) → { size, rows: [[true|false, …], …] }，true 是黑的；塞不下回 null。
//   qrSVG(text, { px, margin }) → 一段 <svg>…</svg> 字串；塞不下回 ""。顏色固定黑底白（掃得到比好看重要）。

// 每個版本容錯 M 的分塊：[每塊的糾錯碼字數, 第一組幾塊, 第一組每塊資料碼字數, 第二組幾塊, 第二組每塊資料碼字數]
const BLOCKS = [null,
  [10, 1, 16, 0, 0], [16, 1, 28, 0, 0], [26, 1, 44, 0, 0], [18, 2, 32, 0, 0], [24, 2, 43, 0, 0],
  [16, 4, 27, 0, 0], [18, 4, 31, 0, 0], [22, 2, 38, 2, 39], [22, 3, 36, 2, 37], [26, 4, 43, 1, 44]];
// 對位圖案的中心座標
const ALIGN = [null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];
const dataCodewords = v => BLOCKS[v][1] * BLOCKS[v][2] + BLOCKS[v][3] * BLOCKS[v][4];

// GF(256) 的乘法（多項式 0x11D）與 Reed-Solomon
function mul(x, y) { let z = 0; for (let i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11D); z ^= ((y >>> i) & 1) * x; } return z & 0xFF; }
function rsGenerator(degree) {
  const r = new Array(degree).fill(0); r[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < degree; j++) { r[j] = mul(r[j], root); if (j + 1 < degree) r[j] ^= r[j + 1]; }
    root = mul(root, 2);
  }
  return r;
}
function rsRemainder(data, gen) {
  const r = new Array(gen.length).fill(0);
  for (const b of data) { const f = b ^ r.shift(); r.push(0); for (let i = 0; i < gen.length; i++) r[i] ^= mul(gen[i], f); }
  return r;
}

export function qrMatrix(text) {
  const bytes = Array.from(new TextEncoder().encode(String(text == null ? "" : text)));
  let ver = 0;
  for (let v = 1; v <= 10; v++) { if (4 + (v < 10 ? 8 : 16) + bytes.length * 8 <= dataCodewords(v) * 8) { ver = v; break; } }
  if (!ver) return null;

  // 1. 資料變成碼字：模式（0100）、長度、內容、結尾、補滿
  const bits = [];
  const push = (val, len) => { for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
  push(4, 4); push(bytes.length, ver < 10 ? 8 : 16);
  for (const b of bytes) push(b, 8);
  const cap = dataCodewords(ver) * 8;
  push(0, Math.min(4, cap - bits.length));
  while (bits.length % 8) bits.push(0);
  for (let pad = 0xEC; bits.length < cap; pad ^= 0xEC ^ 0x11) push(pad, 8);
  const cw = [];
  for (let i = 0; i < bits.length; i += 8) { let x = 0; for (let j = 0; j < 8; j++) x = (x << 1) | bits[i + j]; cw.push(x); }

  // 2. 分塊、算糾錯碼、交錯
  const [ecLen, n1, d1, n2, d2] = BLOCKS[ver];
  const gen = rsGenerator(ecLen), blocks = [];
  for (let i = 0, k = 0; i < n1 + n2; i++) { const len = i < n1 ? d1 : d2; const dat = cw.slice(k, k + len); k += len; blocks.push({ dat, ec: rsRemainder(dat, gen) }); }
  const all = [];
  for (let i = 0; i < Math.max(d1, d2); i++) for (const b of blocks) if (i < b.dat.length) all.push(b.dat[i]);
  for (let i = 0; i < ecLen; i++) for (const b of blocks) all.push(b.ec[i]);

  // 3. 畫固定的圖案
  const size = 17 + 4 * ver;
  const m = Array.from({ length: size }, () => new Array(size).fill(false));
  const fn = Array.from({ length: size }, () => new Array(size).fill(false));
  const set = (x, y, dark) => { m[y][x] = !!dark; fn[y][x] = true; };
  for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
  for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]]) {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const x = cx + dx, y = cy + dy, d = Math.max(Math.abs(dx), Math.abs(dy));
      if (x >= 0 && x < size && y >= 0 && y < size) set(x, y, d !== 2 && d !== 4);
    }
  }
  const al = ALIGN[ver];
  for (let i = 0; i < al.length; i++) for (let j = 0; j < al.length; j++) {
    if ((i === 0 && j === 0) || (i === 0 && j === al.length - 1) || (i === al.length - 1 && j === 0)) continue;   // 三個角是定位圖案
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(al[i] + dx, al[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }
  const drawFormat = mask => {
    const data = mask;                                  // 容錯 M 的兩個位元是 00
    let rem = data;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const f = ((data << 10) | rem) ^ 0x5412;
    const bit = i => ((f >>> i) & 1) !== 0;
    for (let i = 0; i <= 5; i++) set(8, i, bit(i));
    set(8, 7, bit(6)); set(8, 8, bit(7)); set(7, 8, bit(8));
    for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(i));
    set(8, size - 8, true);
  };
  drawFormat(0);
  if (ver >= 7) {
    let rem = ver;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1F25);
    const vb = (ver << 12) | rem;
    for (let i = 0; i < 18; i++) { const dark = ((vb >>> i) & 1) !== 0, a = size - 11 + (i % 3), b = Math.floor(i / 3); set(a, b, dark); set(b, a, dark); }
  }

  // 4. 把碼字照之字形填進去（第 6 欄是時序圖案，跳過）
  let k = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) for (let j = 0; j < 2; j++) {
      const x = right - j, up = ((right + 1) & 2) === 0, y = up ? size - 1 - vert : vert;
      if (!fn[y][x] && k < all.length * 8) { m[y][x] = ((all[k >>> 3] >>> (7 - (k & 7))) & 1) !== 0; k++; }
    }
  }

  // 5. 八種遮罩都試一次，挑扣分最少的
  const MASKS = [(x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, (x, y) => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
    (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => (x * y) % 2 + (x * y) % 3 === 0,
    (x, y) => ((x * y) % 2 + (x * y) % 3) % 2 === 0, (x, y) => ((x + y) % 2 + (x * y) % 3) % 2 === 0];
  const applyMask = n => { for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!fn[y][x] && MASKS[n](x, y)) m[y][x] = !m[y][x]; };
  const penalty = () => {
    let p = 0, dark = 0;
    const line = get => {
      for (let a = 0; a < size; a++) {
        let run = 1;
        for (let b = 1; b < size; b++) {
          if (get(a, b) === get(a, b - 1)) { run++; if (run === 5) p += 3; else if (run > 5) p++; } else run = 1;
        }
        for (let b = 0; b + 10 < size; b++) {
          const s = []; for (let c = 0; c < 11; c++) s.push(get(a, b + c) ? 1 : 0);
          const t = s.join("");
          if (t === "10111010000" || t === "00001011101") p += 40;
        }
      }
    };
    line((y, x) => m[y][x]); line((x, y) => m[y][x]);
    for (let y = 0; y < size - 1; y++) for (let x = 0; x < size - 1; x++) { const c = m[y][x]; if (c === m[y][x + 1] && c === m[y + 1][x] && c === m[y + 1][x + 1]) p += 3; }
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (m[y][x]) dark++;
    p += Math.floor(Math.abs(dark * 20 - size * size * 10) / (size * size)) * 10;
    return p;
  };
  let best = 0, bestP = Infinity;
  for (let n = 0; n < 8; n++) { applyMask(n); drawFormat(n); const p = penalty(); if (p < bestP) { bestP = p; best = n; } applyMask(n); }
  applyMask(best); drawFormat(best);
  return { size, version: ver, mask: best, rows: m };
}

export function qrSVG(text, opts) {
  const q = qrMatrix(text);
  if (!q) return "";
  const o = opts || {}, margin = o.margin == null ? 4 : o.margin, n = q.size + margin * 2, px = o.px || 240;
  let d = "";
  for (let y = 0; y < q.size; y++) for (let x = 0; x < q.size; x++) if (q.rows[y][x]) d += `M${x + margin} ${y + margin}h1v1h-1z`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" width="${px}" height="${px}" role="img" aria-label="QR Code" shape-rendering="crispEdges">`
    + `<rect width="${n}" height="${n}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}
