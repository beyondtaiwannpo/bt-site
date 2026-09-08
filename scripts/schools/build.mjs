// 產生 app/schools.json：全國一般高級中等學校名錄，給註冊表單的「就讀學校」自動完成用。
//
// 用法：node scripts/schools/build.mjs
//       node scripts/schools/build.mjs <已經下載好的 high.json>
// 第一種要網路。第二種給網路連不出去的環境用（有些機器擋得掉 node 的 fetch
// 但 curl 通得過），先 curl 下來再指給它。兩種產出的東西一模一樣。
// 跑完會覆蓋 app/schools.json 並印出幾間學校、幾個縣市。
//
// ── 為什麼存腳本不只存結果 ──
// 跟 scripts/taiwan/ 同一個理由：app/schools.json 裡是五百多筆資料，
// 下一個人看到那個檔案不會知道它從哪來、能不能改、什麼時候該更新。
// 有腳本就有答案：資料來自教育部統計處，一學年更新一次，重跑就好。
//
// ── 資料來源 ──
// 政府資料開放平臺「一般高級中等學校名錄」dataset 6089，
// 提供機關是教育部統計處，每學年更新。
// 我們抓的是 stats.moe.gov.tw 上的 JSON 檔。
// **學年度寫在網址裡**（115 學年 = 2026-08 到 2027-07），所以每年要換一次數字。
// 換的時候先用瀏覽器打開確認那一年的檔案存在，不存在的話會拿到一頁 HTML，
// 而 JSON.parse 會炸在一個看不懂的地方 —— 下面有針對這件事的檢查。
//
// ── 這份清單刻意「不完整」的地方 ──
// 它只有「一般高級中等學校」，不含高職（技術型）、進修部、五專、國中。
// BT 服務的是準備海外升學的高中生，一般型高中是主要對象；
// 而註冊表單的學校欄位**允許自己打字**，不在清單裡的人照樣填得進去。
// 換句話說這份清單是「打兩個字就選得到」的方便，不是一道門。
// 要放寬的話，dataset 6238 是含進修部的完整版，欄位名一樣。

import fs from "node:fs";

const YEAR = "115";                     // 學年度。每年更新一次。
const URL = `https://stats.moe.gov.tw/files/school/${YEAR}/high.json`;
const OUT = "app/schools.json";

const local = process.argv[2];
let text;
if (local) {
  text = fs.readFileSync(local, "utf8");
  console.log(`從本機檔案讀：${local}`);
} else {
  const res = await fetch(URL);
  if (!res.ok) throw new Error(`抓不到 ${URL}：HTTP ${res.status}`);
  text = await res.text();
}

// 學年度不存在的時候，那個網址會回一頁 HTML 的 404，而不是 404 狀態碼。
// 先看第一個字元，錯的話給一句看得懂的話，不要讓 JSON.parse 丟一個
// 「Unexpected token <」出來 —— 那句話不會讓任何人知道要去改 YEAR。
if (!text.trimStart().startsWith("[")) {
  throw new Error(`${URL} 回的不是 JSON（多半是那個學年度的檔案還沒出，改上面的 YEAR）`);
}
const raw = JSON.parse(text);

// 縣市名稱長這樣：「[01]新北市」。前面那個代碼對我們沒有用途，切掉。
const county = s => String(s || "").replace(/^\[\d+\]/, "").trim();

const rows = raw.map(r => ({
  name: String(r["學校名稱"] || "").trim(),
  county: county(r["縣市名稱"]),
  // 「公立」/「私立」。BT 服務的是公立高中生，但私校學生也可以申請，
  // 所以兩種都留著，只是標出來 —— 之後要統計「來自公立學校的比例」用得到。
  pub: String(r["公/私立"] || "").trim() === "公立",
})).filter(r => r.name);

if (rows.length < 400) throw new Error(`只抓到 ${rows.length} 間，太少了，資料來源可能改了格式`);

// 同名的校名真的存在（不同縣市各有一間同名的私立高中）。
// 自動完成上出現兩個一模一樣的選項，使用者只能亂猜一個，
// 而我們拿到的字串也分不出是哪一間。所以**只有重複的那幾間**後面補上縣市，
// 其他維持乾淨的校名。這一步要在排序之前做完，label 才是排序的依據。
const count = new Map();
for (const r of rows) count.set(r.name, (count.get(r.name) || 0) + 1);
for (const r of rows) r.label = count.get(r.name) > 1 ? `${r.name}（${r.county}）` : r.name;
const dupLabels = rows.length - new Set(rows.map(r => r.label)).size;
if (dupLabels) throw new Error(`補了縣市之後還有 ${dupLabels} 個重複的選項，要再想辦法分辨`);
console.log(`同名補上縣市的有 ${[...count.values()].filter(n => n > 1).length} 個校名`);

rows.sort((a, b) => a.label.localeCompare(b.label, "zh-Hant"));

const out = {
  _readme: [
    "這個檔案是產生出來的，不要手改。改了下次重跑腳本就會被蓋掉。",
    "來源：教育部統計處「一般高級中等學校名錄」，" + YEAR + " 學年度。",
    "重新產生：node scripts/schools/build.mjs（要網路），一學年跑一次就夠。",
    "用途：/app/ 註冊時「就讀學校」欄位的自動完成。清單外的學校可以自己打字。",
    "label 才是顯示與存下來的字串：同名的學校後面補了縣市，其他的就是校名本身。",
  ],
  year: YEAR,
  source: URL,
  built: new Date().toISOString().slice(0, 10),
  schools: rows,
};
fs.writeFileSync(OUT, JSON.stringify(out, null, 0) + "\n");

const counties = new Set(rows.map(r => r.county));
console.log(`寫出 ${OUT}：${rows.length} 間學校、${counties.size} 個縣市、` +
            `公立 ${rows.filter(r => r.pub).length} 間、` +
            `${(fs.statSync(OUT).size / 1024).toFixed(1)}KB`);
