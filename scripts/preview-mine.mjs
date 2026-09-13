// 把「我的時間」那一頁渲染成一個可以用瀏覽器打開的靜態頁，兩種模式並排。
//
// ── 為什麼需要這支 ──
// 那一頁要登入才看得到，所以改完 UI 沒辦法直接開來確認。
// 測試與 check.sh 抓得到「壞掉」，抓不到「難看」與「間距不對」——
// 2026-09-12 就是這樣：三個用眼睛看截圖判斷的「間距問題」，實際量之後兩個是我看錯的。
// 有了這一頁就可以在瀏覽器裡量真正的數字，而不是憑印象改。
//
// ── 用法 ──
//   node scripts/preview-mine.mjs      產生 availability/_audit.html
//   用瀏覽器開 http://localhost:8000/availability/_audit.html
//   看完之後：rm -f */_audit.html
//
// ⚠ **看完一定要刪。** `_audit.html` 是 .gitignore 裡既有的暫存頁名字
//（check-mobile.mjs 也用同一個），而 check.sh 有一條守門會在它被留下時變紅 ——
// 那條守門是對的：假頁面留在 repo 裡遲早會有人以為它是真的。
//
// ⚠ 這一頁是**靜態的**：按鈕不會有反應，因為它沒有接上 main.js 的事件。
// 它要回答的問題是「長什麼樣」，不是「能不能用」。
import fs from "node:fs";
import { mineHTML } from "../availability/src/ui.js";
import { startOfWeek } from "../availability/src/tz.js";

const TZ = "Asia/Taipei";
const WEEK = startOfWeek(new Date(), TZ, 1);

// 一份看起來像真人的資料：晚上有空、跨幾天、不是整齊的區塊。
// 全空或全滿都會讓間距問題看不出來。
const mine = new Set(["1:1140", "1:1170", "1:1200", "2:1140", "2:1170", "3:1140", "5:1230"]);

const base = {
  mine, saved: new Set(mine), dirty: false, mineMsg: "",
  chips: new Set([1, 3]), bfrom: 19 * 60, bto: 22 * 60, copyFrom: 1,
  myTz: TZ, mineMode: "usual", weekStart: WEEK,
  weekMine: new Set(), weekSaved: new Set(), weekMarksMine: new Set(), weekTouched: false,
};

const week = {
  ...base, mineMode: "week",
  weekMine: new Set(mine),
  weekMarksMine: new Set(["2026-09-14", "2026-09-21"]),
};

// 頁面自己的 <style> 要一起帶進來，不然量到的間距是錯的（2026-09-12 踩過）。
const inline = fs.readFileSync("availability/index.html", "utf8").match(/<style>([\s\S]*?)<\/style>/)[1];

const head = `<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><title>我的時間 UI 檢查</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;500;600;700&family=Inter:wght@400;500;600;700&display=swap">
<link rel="stylesheet" href="../shared/brand.css">
<link rel="stylesheet" href="../shared/nav.css">
<style>${inline}</style>`;

const label = t => `<p style="max-width:940px;margin:24px auto 4px;font:600 12px/1.4 system-ui;
  letter-spacing:.12em;color:rgba(16,42,134,.65)">${t}</p>`;

fs.writeFileSync("availability/_audit.html",
  `${head}<body>
${label("平常的時間")}<div id="bt-root">${mineHTML(base)}</div>
${label("某一週")}<div id="bt-root">${mineHTML(week)}</div>
</body></html>`);

console.log("產好了：availability/_audit.html");
console.log("用瀏覽器開 http://localhost:8000/availability/_audit.html");
console.log("看完之後記得刪：rm -f */_audit.html");
