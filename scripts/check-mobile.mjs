// 手機版的版面守門：在**真的 390px 寬**的畫面上，找出跑出畫面或互相疊在一起的東西。
//
// 為什麼要有這一支：2026-09-08 與 09-10 Paul 兩次回報「選單跑掉了」，
// 兩次都是頂欄的東西在手機上擠不下 —— 而**那種壞法不會報錯**，
// 桌機上完全看不出來，只有拿手機的人看得到。守門看不到的東西就會一直壞。
//
// ⚠ **不要改用 `chrome --headless --window-size=390,844` 去量。**
// macOS 上視窗有最小寬度，實測那樣量到的 CSS 視寬是 500，不是 390 ——
// 畫面看起來會過關，而手機上照樣爆。所以這裡走 DevTools protocol 的
// Emulation.setDeviceMetricsOverride，那才是真的把視寬設成 390。
//
// 跑法：node scripts/check-mobile.mjs
// 它自己會開一個本機伺服器與一個 headless Chrome，跑完自己收掉。
// **不在 check.sh 裡面**：它要開瀏覽器，比整個 check.sh 還慢，
// 而且需要 Chrome。動到版面（尤其是頂欄）之後自己跑一次。
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, existsSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const WIDTHS = [390, 360];          // iPhone 常見的兩個寬度，360 是 Android 那一段
const PORT = 8907, CDP = 9333;
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

// 登入後的四頁沒有登入就是一個轉址，量不到內容。
// 那四頁由 scripts/mobile-fixtures.mjs 產生一份帶假資料的 _audit.html。
const PAGES = [
  "index.html", "about/index.html", "programs/index.html", "team/index.html",
  "join/index.html", "impact/index.html", "partner/index.html", "apply/index.html",
  "resources/index.html", "alumni/index.html", "privacy/index.html",
  "app/index.html", "reset/index.html",
  "passport/_audit.html", "availability/_audit.html", "admin/_audit.html", "settings/_audit.html",
];

// ── 在頁面裡跑的那一段 ────────────────────────────────────────────────
// 回傳兩種問題：
//   over  = 右邊界跑出視窗的元素（會出現橫向捲軸，或被切掉）
//   clash = 同一個橫向排列裡兩個相鄰元素疊在一起（「選單跑掉了」長這樣）
// 刻意**不看左邊界**：裝飾用的東西常常故意往左溢出，而那不會產生橫向捲軸。
// ── 在頁面裡跑的那一段 ────────────────────────────────────────────────
// 三種問題，刻意分開，因為它們的判準不一樣：
//
//   scroll = 整份文件可以左右捲。這一種沒有模糊空間，一定是壞的。
//   escape = 一排橫著放的東西（flex row）裡，有小孩跑出容器的內容範圍。
//            **這是「選單跑掉了」的形狀**，而它多半不會產生橫向捲軸 ——
//            頂欄外面有東西把它切掉，所以上面那條看不到它。
//   clash  = 同一排裡相鄰兩個小孩疊在一起。
//   offcentre = 說好置中的一排，裡面某個東西的中心線跟其他人對不上。
//            **這一種既不溢出也不重疊，只是看起來歪**，而人一眼就看得出來
//            （2026-09-10 Paul 看出「選單跟登出」差 7px，那時這支腳本說全過）。
//
// ⚠ **不要只看「有沒有超出視窗」。** 首頁那座島是刻意畫到畫面外、
// 靠 html{overflow-x:clip} 切掉的，那是設計不是 bug；
// 而頂欄的項目被切掉是 bug。兩者對「超出視窗」的答案一樣，
// 所以判準要放在「有沒有跑出自己那一排」，不是「有沒有跑出畫面」。
const PROBE = `(() => {
  const de = document.documentElement;
  const vw = de.clientWidth;
  const px = v => parseFloat(v) || 0;
  const name = el => el.tagName.toLowerCase() +
    (typeof el.className === "string" && el.className.trim()
      ? "." + el.className.trim().split(/\\s+/).join(".") : "");
  const txt = el => (el.textContent || "").replace(/\\s+/g, " ").trim().slice(0, 16);

  const escape = [], clash = [], offcentre = [];
  for (const box of document.querySelectorAll("body *")) {
    const cs = getComputedStyle(box);
    if (cs.display !== "flex" && cs.display !== "inline-flex") continue;
    if (cs.flexDirection.startsWith("column")) continue;
    // 會自己捲、或刻意讓內容換行的容器不算 —— 那兩種本來就裝得下。
    if (cs.overflowX === "auto" || cs.overflowX === "scroll") continue;
    if (cs.flexWrap === "wrap" || cs.flexWrap === "wrap-reverse") continue;
    const r = box.getBoundingClientRect();
    // 內容範圍 = 邊框盒扣掉框線與內距。小孩該待在這裡面。
    const L = r.left + px(cs.borderLeftWidth) + px(cs.paddingLeft);
    const R = r.right - px(cs.borderRightWidth) - px(cs.paddingRight);
    const kids = [...box.children].filter(k => {
      const s = getComputedStyle(k);
      return s.display !== "none" && s.position !== "absolute" && s.position !== "fixed"
        && k.getBoundingClientRect().width > 0;
    });
    for (const k of kids) {
      const b = k.getBoundingClientRect();
      const out = Math.max(b.right - R, L - b.left);
      if (out > 1) escape.push({ box: name(box), kid: name(k), text: txt(k), px: Math.round(out) });
    }
    for (let i = 1; i < kids.length; i++) {
      const a = kids[i - 1].getBoundingClientRect(), b = kids[i].getBoundingClientRect();
      const dx = a.right - b.left, dy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (dx > 1 && dy > 1) clash.push({ box: name(box), a: txt(kids[i - 1]), b: txt(kids[i]),
                                         px: Math.round(dx) });
    }
    // 說好要置中的一排，裡面的東西中心線就該對齊。
    // 2026-09-10 Paul 一眼看出「選單跟登出」沒對齊（差 7px），而這支腳本沒抓到 ——
    // 因為它們既沒有跑出容器也沒有互相重疊，只是**一個的外框盒多了一截下邊界**
    //（頁面自己的 label{margin-bottom:14px} 套到了共用頂欄的那顆按鈕上）。
    // 置中對齊的是外框盒，所以看起來就是其中一顆往上跑。
    if (cs.alignItems === "center" && kids.length > 1) {
      const mids = kids.map(k => { const r = k.getBoundingClientRect(); return r.top + r.height / 2; });
      const sorted = [...mids].sort((a, b) => a - b);
      const med = sorted[Math.floor(sorted.length / 2)];
      kids.forEach((k, i) => {
        // 3px 以內不算（字體度量與 subpixel 本來就會有零點幾）。
        if (Math.abs(mids[i] - med) > 3)
          offcentre.push({ box: name(box), kid: name(k), text: txt(k),
                           px: Math.round(mids[i] - med) });
      });
    }
  }
  return { vw, scroll: Math.round(de.scrollWidth - vw),
           escape: escape.slice(0, 8), clash: clash.slice(0, 8),
           offcentre: offcentre.slice(0, 8) };
})()`;

// ── CDP 的最小客戶端（Node 24 內建 WebSocket，不用裝任何東西）──────────
function cdp(ws) {
  let id = 0;
  const waiting = new Map();
  ws.addEventListener("message", e => {
    const m = JSON.parse(e.data);
    if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); }
  });
  return (method, params = {}) => new Promise((res, rej) => {
    const n = ++id;
    waiting.set(n, m => m.error ? rej(new Error(method + ": " + m.error.message)) : res(m.result));
    ws.send(JSON.stringify({ id: n, method, params }));
  });
}

const wait = ms => new Promise(r => setTimeout(r, ms));

// ⚠ /json/new 只收 PUT。用 GET 的話 Chrome 回的是一句英文說明（不是 JSON），
// 而 JSON.parse 會炸在一個跟版面完全無關的地方。2026-09-10 踩過。
async function getJSON(path, method = "GET") {
  const res = await fetch("http://127.0.0.1:" + CDP + path, { method });
  return res.json();
}

async function main() {
  if (!existsSync(CHROME)) { console.log("SKIP 找不到 Google Chrome，跳過手機版檢查"); return 0; }
  // 四頁假資料自己產生、自己刪掉（見 scripts/mobile-fixtures.mjs）。
  const fx = spawnSync("node", ["scripts/mobile-fixtures.mjs"], { encoding: "utf8" });
  if (fx.status !== 0) { console.log("BAD 產生假頁面失敗：\n" + (fx.stderr || fx.stdout)); return 1; }
  const FIXTURES = PAGES.filter(p => p.endsWith("_audit.html"));

  const profile = mkdtempSync(join(tmpdir(), "bt-mobile-"));
  const server = spawn("python3", ["-m", "http.server", String(PORT)], { stdio: "ignore" });
  const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", "--no-first-run",
    "--remote-debugging-port=" + CDP, "--user-data-dir=" + profile, "about:blank"],
    { stdio: "ignore" });

  const bad = [];
  try {
    // 等 Chrome 把 debugging port 打開。**不要用固定的 sleep** ——
    // 機器慢的時候會拿到「連不上」而不是「版面有問題」，那是最難查的假失敗。
    let ok = false;
    for (let i = 0; i < 60 && !ok; i++) {
      try { await getJSON("/json/version"); ok = true; } catch { await wait(250); }
    }
    if (!ok) throw new Error("Chrome 的 debugging port 沒開起來");

    const tab = await getJSON("/json/new?about:blank", "PUT");
    const ws = new WebSocket(tab.webSocketDebuggerUrl);
    await new Promise((res, rej) => {
      ws.addEventListener("open", res, { once: true });
      ws.addEventListener("error", rej, { once: true });
    });
    const send = cdp(ws);
    await send("Page.enable");
    await send("Runtime.enable");
    // ⚠ **要用登入後的狀態量。** 對外頁面右上角那顆按鈕，登入之後字會變長
    // （登入 / Sign in → 我的 BT 帳號 / Account），而那正是 2026-09-08
    // 把「選單」擠出玻璃外面的那一種。登出的狀態一定比較窄，量了不算數。
    // 只放一把假鑰匙進 localStorage，那幾頁刻意不驗證內容（見 index.html 的註解）。
    await send("Page.addScriptToEvaluateOnNewDocument", { source:
      `try{localStorage.setItem("sb-audit-auth-token","x")}catch(e){}` });

    for (const w of WIDTHS) {
      // 真的把 CSS 視寬設成 w。這一行就是這支腳本存在的理由。
      await send("Emulation.setDeviceMetricsOverride",
        { width: w, height: 844, deviceScaleFactor: 2, mobile: true });
      for (const p of PAGES) {
        await send("Page.navigate", { url: `http://127.0.0.1:${PORT}/${p}` });
        await wait(700);
        const r = await send("Runtime.evaluate", { expression: PROBE, returnByValue: true });
        const v = r.result.value;
        if (!v) { bad.push(`${w}px ${p}：量不到（頁面沒載起來？）`); continue; }
        if (v.vw !== w) { bad.push(`${w}px ${p}：視寬其實是 ${v.vw}，模擬沒生效`); continue; }
        if (v.scroll > 1) bad.push(`${w}px ${p}：整頁可以左右捲，多出 ${v.scroll}px`);
        for (const o of v.escape)
          bad.push(`${w}px ${p}：${o.box} 裡的 ${o.kid} 跑出去 ${o.px}px${o.text ? `（${o.text}）` : ""}`);
        for (const c of v.clash)
          bad.push(`${w}px ${p}：${c.box} 裡「${c.a}」與「${c.b}」疊了 ${c.px}px`);
        for (const o of v.offcentre)
          bad.push(`${w}px ${p}：${o.box} 說好置中，但 ${o.kid} 的中心線差 ${o.px}px` +
                   `${o.text ? `（${o.text}）` : ""}`);
      }
    }
    ws.close();
  } finally {
    chrome.kill(); server.kill();
    try { rmSync(profile, { recursive: true, force: true }); } catch {}
    for (const f of FIXTURES) { try { unlinkSync(f); } catch {} }
  }

  if (bad.length) {
    console.log("BAD 手機版的版面有問題（跑出畫面、疊在一起、或該對齊卻沒對齊）：");
    for (const b of bad) console.log("  " + b);
    return 1;
  }
  console.log(`OK 手機版版面（${WIDTHS.join(" / ")}px，${PAGES.length} 頁）沒有跑出畫面、沒有疊在一起、該對齊的都對齊`);
  return 0;
}

process.exit(await main());
