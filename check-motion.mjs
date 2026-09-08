// prefers-reduced-motion 的涵蓋率檢查。由 check.sh 呼叫。
//
// 為什麼要有這支：2026-08-18 做 §11-17 驗收時發現 .overprint.land 漏在
// reduce 區塊之外——它只在集滿 33 格那一刻出現，平常根本測不到，
// 是人工用 CSSOM 逐條比對才抓到的。這支讓那件事不可能再發生。
//
// **這是無障礙需求不是視覺偏好**（使用者 2026-08-25 的裁定），所以由機器守門。
//
// 判準兩種：
//   animation  —— 一律要在 reduce 區塊裡被關掉
//   transition —— 只有動到 transform 或位置類屬性時才要求；
//                 顏色與透明度的過渡不是前庭刺激來源
import fs from "node:fs";

// ⚠ **2026-09-08：範圍從 passport 一頁擴到全部有 <style> 的頁面。**
// 在那之前這支只讀 passport/index.html —— 於是首頁的島、alumni 的航線、
// 對外那幾頁的任何 animation，這條無障礙守門通通看不到。
// 「這是無障礙需求不是視覺偏好」那句話，只守一頁是不成立的。
//
// 這是今天第三個「守門的範圍比現實窄」的例子（另外兩個：
// 前端寫進 profiles 的欄位只掃 passport/src/data.js、
// 變數名接非 ASCII 只掃 check.sh）。**加新頁面的時候要回來加。**
// 下面那條 files.length 的檢查會在有人漏加時出聲。
const PAGES = [
  "index.html", "about/index.html", "programs/index.html", "team/index.html",
  "impact/index.html", "partner/index.html", "apply/index.html", "resources/index.html",
  "alumni/index.html", "app/index.html", "admin/index.html", "settings/index.html",
  "availability/index.html", "passport/index.html", "privacy/index.html",
  "reset/index.html", "join/index.html",
];
const files = fs.readdirSync(".", { recursive: true })
  .filter(f => f.endsWith("index.html") && !f.includes("node_modules"));
const missed = files.filter(f => !PAGES.includes(f.split("\\").join("/")));
if (missed.length) {
  console.log("這幾頁不在 reduced-motion 的掃描清單裡：" + missed.join("、"));
  process.exit(1);
}

// 每一頁各自檢查。**不要把所有頁的 CSS 串起來一次掃** ——
// 那樣一頁的 reduce 區塊會被當成另一頁的，漏掉的那一條反而變成通過。
let totalAnim = 0, totalTrans = 0;
const ways = [];
const problems = [];
for (const page of PAGES) run(page);
if (problems.length) { console.log(problems.join("\n")); process.exit(1); }
console.log(`animation ${totalAnim} 個全部被 reduce 關掉；transition ${totalTrans} 個都沒動到位置或形狀（掃了 ${PAGES.length} 頁）`);
if (process.env.MOTION_VERBOSE) console.log(ways.join("\n"));
process.exit(0);

// 從第一個符合 re 的位置開始，數大括號取出整個區塊。
// 回傳 { whole, inner }：whole 含 @media 那一行本身，inner 只有大括號裡面。
function takeBlock(text, re) {
  const m = text.match(re);
  if (!m) return null;
  const open = m.index + m[0].length - 1;   // 指到那個 {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}") {
      depth--;
      if (depth === 0) return { whole: text.slice(m.index, i + 1), inner: text.slice(open + 1, i) };
    }
  }
  return null;   // 沒有收尾，當成沒有 reduce 區塊（下面會因此報漏掉的 animation）
}

function run(page) {
const html = fs.readFileSync(page, "utf8");
const m0 = html.match(/<style>([\s\S]*?)<\/style>/);
if (!m0) return;   // 沒有 <style> 的頁面沒有 CSS 動畫可以漏
const css = m0[1]
  .replace(/\/\*[\s\S]*?\*\//g, "");   // 先剝註解，否則註解裡的文字會被當成選擇器

const rules = block => [...block.matchAll(/([^{}]+)\{([^}]*)\}/g)];
const selectorsOf = sel => sel.split(",").map(s => s.trim()).filter(Boolean);

const declared = new Set(), transitions = [];
let declaredRules = 0;   // 條數，不是選擇器數——一條規則可以有逗號分隔的多個選擇器
for (const [, sel, body] of rules(css)) {
  const s = sel.trim();
  if (s.startsWith("@") || s.includes("%") || s === "from" || s === "to") continue;
  const a = body.match(/(?<![-\w])animation\s*:\s*([^;]+)/);
  // ⚠ `animation:none!important` 也是 none。
  // 2026-09-08 擴大範圍時抓到：對外那幾頁的 reduce 區塊寫的是 `none!important`，
  // 而原本只比對 `!== "none"`，於是那一條被算成「有動畫」，
  // 對帳的數字就差一個 —— 而那個差是**因為守門自己讀錯**，不是真的有漏。
  if (a && a[1].trim().replace(/\s*!important$/i, "") !== "none") {
    selectorsOf(s).forEach(x => declared.add(x));
    declaredRules++;
  }
  const t = body.match(/(?<![-\w])transition\s*:\s*([^;]+)/);
  if (t) transitions.push([s, t[1].trim()]);
}

// ⚠ 用數大括號抓 reduce 區塊，不要用正則。
// 原本的正則要求收尾的 `}` 前面有換行，所以**寫成一行的 reduce 區塊它抓不到**
// —— 對外那九頁全部是寫成一行的。抓不到的後果是：那一頁的 reduce 完全不算數，
// 而畫面上看起來一切正常。
const rmMatch = takeBlock(css, /@media\s*\(prefers-reduced-motion\s*:\s*reduce\)\s*\{/);
const rm = rmMatch ? rmMatch.inner : "";
const disabled = new Set();
let wildcard = false;   // reduce 區塊裡有 `*{animation:none}` 就等於全關
for (const [, sel, body] of rules(rm)) {
  if (/animation\s*:\s*none/.test(body)) {
    selectorsOf(sel).forEach(x => { disabled.add(x); if (x === "*") wildcard = true; });
  }
}
// ⚠ 2026-09-08：**`*{animation:none!important}` 是合法而且更強的寫法**，
// 但原本的比對只看選擇器字面，於是 alumni 的 #ring 與 .orbiter 被誤報成漏掉。
// 那是守門讀不懂，不是真的漏 —— 而誤報的守門會被人習慣性忽略，
// 久了真的漏掉也不會有人看。
// 兩種寫法都算數，但**輸出要說出這一頁用的是哪一種**：
// 逐條列名比較精確（改了選擇器名字會露出來），萬用字元比較穩（不會漏）。
// 看得到差別，下一個人才選得出要用哪一種。

const MOTION = ["transform", "top", "left", "right", "bottom", "width", "height", "inset", "margin"];
const missing = wildcard ? [] : [...declared].filter(s => !disabled.has(s));
// 同一個道理：`*{transition:none!important}` 也把所有過渡關掉了。
const transWildcard = /(^|[},])\s*\*\s*\{[^}]*transition\s*:\s*none/.test(rm);
const risky = transWildcard ? [] : transitions.filter(([, v]) =>
  v.split(",").map(p => p.trim().split(/\s/)[0]).some(p => MOTION.some(k => p.startsWith(k))));

// ---- 控制端追加的對帳（2026-08-25 的裁定：這是無障礙需求，機器守門要能證明
// 自己沒有盲點）----
//
// 上面的 rules() 走法有一個它自己看不見的盲點：`s.startsWith("@")` 會把整個
// @media 選擇器跳過，而 [^{}]+\{[^}]*\} 這個正則不認得巢狀大括號，於是
// @media 區塊「第一條」子規則的內容會被當成 @media 選擇器自己的 body 一起吞掉、
// 一起被跳過——寫在那個位置的 animation 宣告，守門對它是瞎的。
//
// 這裡自己再數一次：把註解（css 已經剝過一次）、@keyframes 區塊、reduce 區塊
// （含 @media 那一行本身，不只內容）都剝掉之後，剩下的 CSS 裡還有幾個
// `animation:` 宣告（排除 animation:none）？這個數字要跟上面走規則時真正算進
// declaredRules 的條數相等，對不上就代表有宣告落在解析不到的地方。
let reconcileCss = css.replace(
  /@keyframes\s+[\w-]+\s*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g,
  ""
);
if (rmMatch) reconcileCss = reconcileCss.replace(rmMatch.whole, "");

const totalAnimationDecls = (
  reconcileCss.match(/(?<![-\w])animation\s*:\s*(?!none\b)[^;}]+/g) || []
).length;

if (totalAnimationDecls !== declaredRules) {
  const diff = totalAnimationDecls - declaredRules;
  problems.push(`${page}：有 ${diff} 個 animation 宣告落在這支腳本解析不到的地方（例如 @media 內）—— 守門對它們是瞎的`);
  return;
}

totalAnim += declared.size;
totalTrans += transitions.length;
ways.push(`${page}：${declared.size} 個 animation ${wildcard ? "由 * 一次關掉" : "逐條關掉"}`);
for (const s of missing) problems.push(`  ${page} 漏掉的 animation：${s}`);
for (const [s, v] of risky) problems.push(`  ${page} 會動位置/形狀的 transition：${s} { ${v} }`);
}
