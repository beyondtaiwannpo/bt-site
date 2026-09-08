// /team/ 上那幾張臉。**esc 是自己的一份**（資料夾之間不互相依賴）。
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// 六個 team 的顯示順序。**這是唯一一份順序**，畫面照這個排。
// 名單裡出現的、不在這裡面的 team 排在後面，照字母序；沒填 team 的排最後。
// 不在這裡硬性驗證誰是合法的 team —— profiles.team 是自由文字，
// 擋掉打錯字的人等於讓他整個人從頁面上消失，那比分錯組還糟。
export const TEAM_ORDER = ["Sponsorship", "Curriculum", "Internship", "Mentorship", "Marketing", "CR"];

// 每個 team 的中英文小標。查不到就直接用他填的字。
const TEAM_SUB = {
  Sponsorship: ["贊助與合作", "Partnerships and funding"],
  Curriculum:  ["活動內容", "Programme content"],
  Internship:  ["實習", "Internships"],
  Mentorship:  ["導生配對", "Mentor matching"],
  Marketing:   ["對外的內容與視覺", "Content and design"],
  CR:          ["校園關係", "Campus relations"],
};

// profiles.team 是自由文字，同一個 team 會有人填「Curriculum」、
// 有人填「Curriculum Team」、有人填「curriculum team」。
// **收斂在這裡做一次**，不然畫面上會出現三個只差一個字的分組，
// 而那看起來像資料壞掉，不像有人打字不一樣。
export function teamKey(raw) {
  const s = String(raw || "").trim().replace(/\s+/g, " ");
  if (!s) return "";
  const bare = s.replace(/\s*teams?$/i, "").trim();
  const hit = TEAM_ORDER.find(t => t.toLowerCase() === bare.toLowerCase());
  return hit || bare;
}

// 把資料庫那幾欄收斂成畫面要的形狀。**收斂只做這一次。**
//
// cut：這張照片是不是去背照（背景透明）。
// **判斷方式是圖檔格式，不是檔名。** 設定頁上傳的時候會看有沒有透明像素：
// 有就存成 webp/png（留住透明），沒有就存成 jpeg（比較小）。
// 所以「不是 jpeg」就等於「這是一張去背照」——
// 不用多開一個資料庫欄位，也不用要求誰記得去勾一個框。
// 見 settings/src/main.js 的 compress()。
export function toPerson(row) {
  const avatar = row.avatar || "";
  return {
    zh: row.name_zh || "",
    en: row.name_en || "",
    name: row.name_zh || row.name_en || "",
    team: teamKey(row.team),
    title: row.public_title || "",
    avatar,
    cut: !!avatar && !/^data:image\/jpe?g/i.test(avatar),
  };
}

// 依 TEAM_ORDER 分組。回傳 [{ key, people }]，空的組不會出現。
export function byTeam(people) {
  const map = new Map();
  for (const p of people) {
    if (!map.has(p.team)) map.set(p.team, []);
    map.get(p.team).push(p);
  }
  const known = TEAM_ORDER.filter(t => map.has(t));
  const rest = [...map.keys()].filter(t => t && !TEAM_ORDER.includes(t)).sort();
  const none = map.has("") ? [""] : [];
  return [...known, ...rest, ...none].map(key => ({ key, people: map.get(key) }));
}

// 沒有大頭照的人用名字的第一個字。
// **用 [...s][0] 不是 s[0]** —— s[0] 會把一個 emoji 或某些字切成半個字元，
// 畫面上出現一個問號方塊（護照的頂欄踩過同一件事）。
export function initial(name) {
  const s = String(name || "").trim();
  return s ? [...s][0] : "?";
}

// ⚠ **一個人都沒有的時候回空字串，不是「還沒有人公開」。**
// 這是對外頁面，「我們有三十個人但沒有人願意露臉」是內部資訊。
// 而且那一整段標題連同區塊都不該畫出來 —— 見 main.js 怎麼用這個回傳值。
//
// lang："zh" 或 "en"，只影響 team 底下那行小標。人名兩邊都出現。
export function peopleHTML(people, lang) {
  if (!people || !people.length) return "";
  return byTeam(people).map(g => {
    const sub = TEAM_SUB[g.key] ? TEAM_SUB[g.key][lang === "en" ? 1 : 0] : "";
    const head = g.key
      ? `<h3>${esc(g.key)}</h3>${sub ? `<p class="sub">${esc(sub)}</p>` : `<p class="sub"></p>`}`
      : `<h3>${lang === "en" ? "Also on the board" : "還有這些人"}</h3><p class="sub"></p>`;
    return `<section class="teamsec">${head}<ul class="crew">${g.people.map(cardHTML).join("")}</ul></section>`;
  }).join("");
}

// 一個人一張卡。照片掛在卡片上緣之外，所以頭會超出框。
// ⚠ **中文名那一格的 class 不准叫 zh。** 整站的語言切換靠
// `html[data-lang="en"] .zh{display:none}` 這一條，取名叫 zh 的話
// 英文版會把每個人的中文名整個藏起來（2026-09-08 第一版就是這樣，畫面上只剩英文名）。
// 主名字用哪一個：有英文名就英文名當大字（那是 --display 這套字體撐得起來的形狀），
// 中文名在下面一行。**兩個都沒有的人不會走到這裡**（main.js 已經濾掉）。
function cardHTML(p) {
  const big = p.en || p.zh;
  const small = p.en && p.zh ? p.zh : "";
  const face = !p.avatar
    ? `<span class="noface" aria-hidden="true">${esc(initial(p.name))}</span>`
    : `<img class="${p.cut ? "cut" : "por"}" src="${esc(p.avatar)}" alt="" loading="lazy">`;
  return `<li>${face}
    <b>${esc(big)}</b>${small ? `<span class="cname">${esc(small)}</span>` : ""}
    ${p.title ? `<span class="role">${esc(p.title)}</span>` : ""}
  </li>`;
}
