// /resources/ 的畫面。**esc 是自己的一份**（資料夾之間不互相依賴）。
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// 類型用文字不用圖示：圖示要另外學，而「PDF」三個字誰都看得懂。
const KIND = {
  pdf:    ["PDF", "PDF"],
  video:  ["影片", "Video"],
  slides: ["投影片", "Slides"],
  sheet:  ["表格", "Sheet"],
  book:   ["手冊", "Book"],
  link:   ["連結", "Link"],
};
const T = {
  open:    ["打開", "Open"],
  locked:  ["登入就拿得到", "Sign in to get it"],
  none:    ["還沒有放上來的東西。之後會陸續加。",
            "Nothing here yet. More is coming."],
  needIn:  ["這些東西是免費的，但要先有一個帳號。開帳號兩分鐘。",
            "These are free, but you need an account. It takes two minutes."],
  signin:  ["登入或註冊", "Sign in or sign up"],
};
const t = (k, en) => T[k][en ? 1 : 0];
const kindLabel = (k, en) => (KIND[k] || KIND.link)[en ? 1 : 0];

// signedIn 決定那顆按鈕是「打開」還是「登入就拿得到」。
//
// ⚠ **沒登入的時候，資料裡根本沒有 url 那一欄**（欄位層級授權擋著，
// 見 supabase/migrations/2026-09-11-resources.sql）。
// 所以這裡不是「有連結但不給點」，是真的沒有那個值 ——
// 前端就算被改掉也拿不到。畫面上的鎖不是那道門，資料庫才是。
const needInHTML = en => `<div class="warn">${esc(t("needIn", en))}
      <div style="margin-top:12px"><button class="btn" data-act="signin">${esc(t("signin", en))}</button></div>
    </div>`;
// 一排資源，不帶標題也不帶「要先登入」那一塊。
export function rowsHTML(items, signedIn, en) {
  return `<ul class="rlist">${items.map(r => `<li>
      <span class="kind">${esc(kindLabel(r.kind, en))}</span>
      <h3>${esc(r.title)}</h3>
      ${r.blurb ? `<p>${esc(r.blurb)}</p>` : ""}
      ${signedIn && r.url
        ? `<a class="btn" href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">${esc(t("open", en))}</a>`
        : `<button class="btn ghost" data-act="signin">${esc(t("locked", en))}</button>`}
    </li>`).join("")}</ul>`;
}
// 沒有大標的時候整頁就是這一塊，跟 2027-01-13 之前一模一樣。
export function listHTML(items, signedIn, en) {
  if (!items.length) return `<p class="note">${esc(t("none", en))}</p>`;
  return `${signedIn ? "" : needInHTML(en)}
    ${rowsHTML(items, signedIn, en)}`;
}

// ── 大標（2027-01-13-resource-sections.sql）──────────────────────────────
// 後台「資源」那一頁可以加大標（例如「大學介紹」），每一筆資源選一個放進去。
// 這裡把資源照大標分組，一個大標一塊，長得跟原本那個「資源」一樣重。
// 沒有大標、或大標那張表還讀不到的時候，回的就是原本那一塊，一個字都不會不一樣。
const num = v => (Number.isFinite(Number(v)) ? Number(v) : 100);

// 分組，不碰畫面。回 [{ section, items }]：
//   大標照 ord 排，一樣的照中文名（筆畫少的在前）；裡面的資源照自己的 ord，一樣的維持原本的先後。
//   沒有資源的大標不回（對外頁不畫空的大標）。
//   沒有分、或指到一個已經不在的大標的資源，放在最後一組，section 是 null。
export function groupBySection(items, sections) {
  const secs = (sections || []).filter(s => s && s.id).slice()
    .sort((a, b) => num(a.ord) - num(b.ord) || String(a.name_zh || "").localeCompare(String(b.name_zh || ""), "zh-Hant"));
  const known = new Set(secs.map(s => s.id));
  const sorted = (items || []).map((r, i) => [r, i]).sort((a, b) => num(a[0].ord) - num(b[0].ord) || a[1] - b[1]).map(x => x[0]);
  const out = [];
  for (const s of secs) {
    const mine = sorted.filter(r => r.section_id === s.id);
    if (mine.length) out.push({ section: s, items: mine });
  }
  const rest = sorted.filter(r => !r.section_id || !known.has(r.section_id));
  if (rest.length) out.push({ section: null, items: rest });
  return out;
}
// 大標的字：中文版用中文名；英文版用英文名，沒填就用中文名。
export function sectionName(s, en) {
  const zh = String(s.name_zh || "").trim(), enName = String(s.name_en || "").trim();
  return en ? (enName || zh) : zh;
}
// 每個大標一個錨點，可以直接連到那一段（/resources/#s-1a2b3c4d）。
export function sectionAnchor(id) {
  return "s-" + String(id || "").replace(/[^0-9a-z]/gi, "").slice(0, 8).toLowerCase();
}
const DEFAULT_HEAD = `<span class="zh">資源</span><span class="en">Resources</span>`;
const blockHTML = (id, head, body) => `<section class="sec"${id ? ` id="${esc(id)}"` : ""}>
  <div class="sec-in">
    <h2>${head}</h2>
    <div class="body">${body}</div>
  </div>
</section>`;
// 整個資源區。「要先登入」那一塊只出現一次，在第一個大標底下。
export function pageHTML(items, sections, signedIn, en) {
  const groups = groupBySection(items, sections);
  if (!groups.length) return blockHTML("", DEFAULT_HEAD, listHTML([], signedIn, en));
  return groups.map((g, i) => blockHTML(
    g.section ? sectionAnchor(g.section.id) : "",
    g.section ? esc(sectionName(g.section, en)) : DEFAULT_HEAD,
    (i === 0 && !signedIn ? needInHTML(en) : "") + rowsHTML(g.items, signedIn, en))).join("\n");
}

export function errorHTML(text) {
  return `<div class="warn">${esc(text)}</div>`;
}
// 連不上資料庫的時候：原本那個「資源」大標還在，底下是那一句話。
export function errorPageHTML(text) {
  return blockHTML("", DEFAULT_HEAD, errorHTML(text));
}
