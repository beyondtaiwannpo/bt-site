// /team/ 上那幾張臉。**esc 是自己的一份**（資料夾之間不互相依賴）。
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// ⚠ **一個人都沒有的時候回空字串，不是「還沒有人公開」。**
// 這是對外頁面，「我們有三十個人但沒有人願意露臉」是內部資訊。
// 而且那一整段標題連同區塊都不該畫出來 —— 見 main.js 怎麼用這個回傳值。
export function peopleHTML(people) {
  if (!people || !people.length) return "";
  return `<ul class="faces">${people.map(p => `<li>
    ${p.avatar
      ? `<img src="${esc(p.avatar)}" alt="" width="120" height="120" loading="lazy">`
      : `<span class="noface" aria-hidden="true">${esc(initial(p.name))}</span>`}
    <b>${esc(p.name)}</b>
    <span>${esc([p.title, p.team].filter(Boolean).join("・"))}</span>
  </li>`).join("")}</ul>`;
}

// 沒有大頭照的人用名字的第一個字。
// **用 [...s][0] 不是 s[0]** —— s[0] 會把一個 emoji 或某些字切成半個字元，
// 畫面上出現一個問號方塊（護照的頂欄踩過同一件事）。
export function initial(name) {
  const s = String(name || "").trim();
  return s ? [...s][0] : "?";
}

// 把資料庫那幾欄收斂成畫面要的形狀。**收斂只做這一次。**
export function toPerson(row) {
  return {
    name: row.name_zh || row.name_en || "",
    team: row.team || "",
    title: row.public_title || "",
    avatar: row.avatar || "",
  };
}
