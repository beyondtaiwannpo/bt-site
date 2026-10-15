// 實習護照的端對端測試：真的瀏覽器、真的前端、真的 PostgREST、真的 RLS。
//
// 用法：  node scripts/e2e/intern.mjs          （印 ok / FAIL，最後一行是總數）
//         E2E_KEEP=1 node scripts/e2e/intern.mjs（跑完不關，可以自己開 http://127.0.0.1:54321 看）
// 需要：  本機 postgres、brew install postgrest、Google Chrome。
//
// 每次從零開始：./scripts/e2e/db.sh 重建資料庫、跑完 18 支遷移檔、放三個幹部，
// 然後 server.mjs 起假的 Supabase（見那支檔頭：驗得到什麼、驗不到什麼），
// 最後用 Chrome 的 DevTools 協定照一個真人會做的順序點過去：
//
//   Co-President 登入 → 後台「實習護照」改格子、加格子、停用、恢復、刪掉、開新的一屆、
//   發一組實習生碼 → 登出 → 新的人註冊 → 輸碼變成 intern → 領護照 → 蓋章 → 進度牆
//   → Internship team 的幹部登入看得到牆、看不到書 → 別組的幹部被導回登入頁
//   → 最後直接查資料庫，確認章、心得、使用紀錄都在。
//
// 跟 smoke.sh 的分工：smoke.sh 驗資料庫那一半（函式邏輯、RLS），這一支驗「畫面接上去之後
// 一個人真的走得完」。兩邊都綠才算 work。
import { spawn, spawnSync, execFileSync } from "node:child_process";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { start } from "./server.mjs";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const CDP = 9333;
const DB = "bt_e2e";
let pass = 0, fail = 0;
const ok = m => { console.log("  ok   " + m); pass++; };
const bad = m => { console.log("  FAIL " + m); fail++; };
const wait = ms => new Promise(r => setTimeout(r, ms));
const psql = sql => execFileSync("psql", ["-d", DB, "-X", "-A", "-t", "-q", "-c", sql], { encoding: "utf8" }).trim();

function cdp(ws) {
  let id = 0; const waiting = new Map();
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

async function main() {
  if (!existsSync(CHROME)) { console.log("SKIP 找不到 Google Chrome"); return 0; }
  if (spawnSync("which", ["postgrest"]).status !== 0) { console.log("SKIP 沒有 postgrest（brew install postgrest）"); return 0; }

  console.log("重建資料庫 " + DB);
  const db = spawnSync("./scripts/e2e/db.sh", [DB], { encoding: "utf8" });
  if (db.status !== 0) { console.log(db.stdout + db.stderr); return 1; }

  const server = await start();
  const base = server.url;
  const profile = mkdtempSync(join(tmpdir(), "bt-e2e-chrome-"));
  const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", "--no-first-run",
    "--remote-debugging-port=" + CDP, "--user-data-dir=" + profile, "about:blank"], { stdio: "ignore" });

  const getJSON = async (path, method = "GET") => (await fetch("http://127.0.0.1:" + CDP + path, { method })).json();
  let up = false;
  for (let i = 0; i < 60 && !up; i++) { try { await getJSON("/json/version"); up = true; } catch { await wait(250); } }
  if (!up) { console.log("Chrome 沒起來"); return 1; }
  const tab = await getJSON("/json/new?about:blank", "PUT");
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.addEventListener("open", res, { once: true }); ws.addEventListener("error", rej, { once: true }); });
  const send = cdp(ws);
  await send("Page.enable"); await send("Runtime.enable");
  // confirm() 一律按「確定」：停用、刪掉、設成目前這一屆都會先問一次。
  await send("Page.addScriptToEvaluateOnNewDocument", { source: `window.confirm = () => true;` });
  await send("Emulation.setDeviceMetricsOverride", { width: 1200, height: 900, deviceScaleFactor: 1, mobile: false });

  // ── 小工具 ──
  const ev = async expr => (await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true })).result.value;
  const go = async path => { await send("Page.navigate", { url: base + path }); await wait(400); };
  const href = () => ev("location.pathname");
  const text = () => ev("document.body.innerText");
  // 等某個條件成立。畫面是 innerHTML 整個重畫的，所以一律用輪詢不用事件。
  async function until(expr, what, ms = 8000) {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) { if (await ev(`!!(${expr})`)) return true; await wait(150); }
    bad(`等不到：${what}（${expr}）`);
    console.log("       現在在 " + await href() + "，畫面上：" + String(await text()).replace(/\s+/g, " ").slice(0, 160));
    return false;
  }
  const click = sel => ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return "no:"+${JSON.stringify(sel)};e.click();return "ok"})()`);
  const setv = (id, v) => ev(`(()=>{const e=document.getElementById(${JSON.stringify(id)});if(!e)return "no:"+${JSON.stringify(id)};e.value=${JSON.stringify(v)};e.dispatchEvent(new Event("input",{bubbles:true}));return "ok"})()`);
  const count = sel => ev(`document.querySelectorAll(${JSON.stringify(sel)}).length`);
  const has = async (s, what) => (await text()).includes(s) ? ok(what || `看到「${s}」`) : bad(`${what || "沒看到"}：找不到「${s}」`);
  const hasNot = async (s, what) => (await text()).includes(s) ? bad(`${what}：不該出現「${s}」`) : ok(what);
  const expect = (cond, what) => cond ? ok(what) : bad(what);

  async function login(email, pw) {
    await go("/app/");
    await until(`document.getElementById("ae")`, "登入表單");
    await setv("ae", email); await setv("ap", pw);
    await click('[data-act="do-signin"]');
  }
  async function logout() {
    await ev(`(async()=>{try{localStorage.clear();sessionStorage.clear()}catch(e){}})()`);
    await go("/app/");
    await until(`document.getElementById("ae")`, "登出後回到登入表單");
  }

  try {
    // ════════ 1. Co-President：後台的實習護照 ════════
    console.log("\nCo-President 的後台：");
    await login("paul@example.com", "paulpass");
    if (await until(`location.pathname === "/settings/"`, "幹部登入後進設定頁")) ok("幹部登入後直接進 /settings/");
    await go("/admin/");
    if (await until(`document.querySelector('[data-t="interns"]')`, "後台有「實習護照」分頁")) ok("Co-President 的後台有「實習護照」分頁");
    await click('[data-t="interns"]');
    await until(`document.querySelector('[data-act="intern-task-new"]')`, "實習護照分頁載完");
    await has("目前 0 位 intern", "還沒有 intern 時數字是 0");
    expect(await count('[data-act="intern-task-edit"]') === 9, "九格範例格子都在");
    await has("目前這一屆", "2026-27 標著目前這一屆");

    // 加一格：先空著按，要被擋；填好再按。
    await click('[data-act="intern-task-new"]');
    await until(`document.getElementById("ik-id")`, "加一格的表單");
    expect(await ev(`document.getElementById("ik-id").value`) === "T2627-10", "新格子的代號先填好 T2627-10");
    await click('[data-act="intern-task-save"]');
    await has("代號、中文標題、英文標題都要填", "空著按會被擋，而且說出缺什麼");
    await setv("ik-zh", "測試格"); await setv("ik-en", "TEST SLOT"); await setv("ik-seq", "10"); await setv("ik-desc", "端對端測試加的");
    await click('[data-act="intern-task-save"]');
    if (await until(`document.body.innerText.includes("加好了")`, "加一格的回饋")) ok("加好了，畫面有回饋");
    expect(await count('[data-act="intern-task-edit"]') === 10, "清單變成十格");
    await has("測試格", "新格子在清單上");

    // 改：
    await click('[data-act="intern-task-edit"][data-id="T2627-10"]');
    await until(`document.getElementById("ik-zh")`, "改一格的表單");
    expect(await ev(`document.getElementById("ik-id").disabled`) === true, "改的時候代號鎖住");
    await setv("ik-zh", "測試格（改）");
    await click('[data-act="intern-task-save"]');
    if (await until(`document.body.innerText.includes("改好了")`, "改一格的回饋")) ok("改好了，畫面有回饋");
    await has("測試格（改）", "標題真的改了");

    // 停用、恢復、刪掉：
    await click('[data-act="intern-task-off"][data-id="T2627-10"]');
    if (await until(`document.body.innerText.includes("停用了")`, "停用的回饋")) ok("停用了，畫面有回饋");
    await has("停用中", "格子標著停用中");
    await click('[data-act="intern-task-on"][data-id="T2627-10"]');
    if (await until(`document.body.innerText.includes("恢復了")`, "恢復的回饋")) ok("恢復了，畫面有回饋");
    await click('[data-act="intern-task-del"][data-id="T2627-10"]');
    if (await until(`document.body.innerText.includes("刪掉了")`, "刪掉的回饋")) ok("刪掉了，畫面有回饋");
    expect(await count('[data-act="intern-task-edit"]') === 9, "清單回到九格");

    // 開新的一屆：兩種錯都要說得出來，對的會成功，而且不會變成目前這一屆。
    await click('[data-act="intern-term-new"]');
    await until(`document.getElementById("it-id")`, "開新的一屆的表單");
    await setv("it-id", "2027 28"); await setv("it-zh", "2027-28 實習"); await setv("it-en", "INTERNSHIP 2027-28");
    await setv("it-start", "2027-09-01"); await setv("it-end", "2028-07-31");
    await click('[data-act="intern-term-save"]');
    if (await until(`document.body.innerText.includes("屆別的代號只能用")`, "代號有空白被擋")) ok("代號有空白：被擋，說得出原因");
    await setv("it-id", "2027-28"); await setv("it-start", "2028-09-01"); await setv("it-end", "2027-07-31");
    await click('[data-act="intern-term-save"]');
    if (await until(`document.body.innerText.includes("結束日要在開始日之後")`, "日期反了被擋")) ok("日期反了：被擋，說得出原因");
    await setv("it-start", "2027-09-01"); await setv("it-end", "2028-07-31");
    await click('[data-act="intern-term-save"]');
    if (await until(`document.body.innerText.includes("開好了")`, "開屆的回饋")) ok("開好了，畫面有回饋");
    expect(await count('[data-act="intern-term-activate"][data-id="2027-28"]') === 1, "新的一屆有「設成目前這一屆」那顆");
    expect(await count('[data-act="intern-term-activate"][data-id="2026-27"]') === 0, "2026-27 仍然是目前這一屆");
    expect(psql("select id from public.intern_terms where active") === "2026-27", "資料庫裡 active 的還是 2026-27");
    await click('[data-act="intern-see"][data-id="2027-28"]');
    await until(`document.body.innerText.includes("這一屆還沒有格子")`, "切到新的一屆");
    await has("這一屆還沒有格子", "切到新的一屆看得到它是空的");

    // 發一組實習生碼。
    await click('[data-t="invites"]');
    await until(`document.getElementById("ic-code")`, "邀請碼分頁");
    await setv("ic-code", "bt-e2e-intern"); await setv("ic-grants", "intern"); await setv("ic-uses", "1"); await setv("ic-note", "端對端測試");
    await click('[data-act="invite-new"]');
    if (await until(`document.body.innerText.includes("建好了：bt-e2e-intern")`, "發碼的回饋")) ok("實習生碼發好了");
    await has("實習生碼", "清單上標著實習生碼");

    // ════════ 2. 新的人：註冊 → 輸碼 → 領護照 → 蓋章 ════════
    console.log("\n新的 intern：");
    await logout();
    await click('[data-act="switch-auth"][data-m="up"]');
    await until(`document.body.innerText.includes("至少 6 個字")`, "切到註冊表單");
    await setv("ae", "intern1@example.com"); await setv("ap", "internpass");
    await click('[data-act="do-signup"]');
    if (await until(`document.getElementById("pn") || document.querySelector('[data-act="show-claim"]')`, "註冊完的畫面")) ok("註冊完登入了，停在補資料頁");
    expect(await count('[data-act="show-claim"]') === 1, "補資料頁上有「我有邀請碼」的入口（不用先填高中）");
    await click('[data-act="show-claim"]');
    await until(`document.getElementById("ci")`, "輸碼的表單");
    await setv("ci", "WRONG-CODE");
    await click('[data-act="do-claim"]');
    if (await until(`document.body.innerText.includes("這個邀請碼不對")`, "錯的碼被擋")) ok("打錯碼：畫面說「這個邀請碼不對」");
    await setv("ci", " BT-E2E-INTERN ");
    await click('[data-act="do-claim"]');
    if (await until(`location.pathname === "/intern-passport/"`, "輸碼之後被送進實習護照", 10000)) ok("大小寫與空白不算，輸碼後直接進 /intern-passport/");
    expect(psql("select role from public.profiles where id=(select id from auth.users where email='intern1@example.com')") === "intern", "資料庫裡身分是 intern");
    expect(psql("select uses_left from public.invite_codes where code='bt-e2e-intern'") === "0", "那組碼用掉了");

    await until(`document.getElementById("fz")`, "領護照的表單");
    expect(await count("#ft") === 0, "領護照的表單沒有 team 那一格");
    await setv("fz", "實習一號"); await setv("fe", "Intern One"); await setv("fm", "想帶走一件事");
    await click('[data-act="issue"]');
    if (await until(`document.querySelector(".book")`, "護照本體")) ok("領到護照，書畫出來了");
    await has("0 / 9", "頂欄 0 / 9");
    await has("持照人資料", "第一頁是資料頁");
    await has("實習一號", "名字在資料頁上");
    await has("2026-27 實習", "屆別在資料頁上");
    // 翻到第三頁（入門），開第一格，蓋章。
    await click('[data-act="go"][data-p="2"]');
    await until(`document.querySelector('[data-act="open"][data-id="T2627-01"]')`, "入門那一頁");
    await click('button.faceopen[data-id="T2627-01"]');
    await until(`document.getElementById("mn")`, "蓋章的視窗");
    await setv("mn", "第一次開會很緊張");
    await click('[data-act="stamp"]');
    if (await until(`document.querySelector('.slot[data-id="T2627-01"][data-done="1"]')`, "章蓋上去")) ok("章蓋上去了");
    if (await until(`document.querySelector(".toast") && document.querySelector(".toast").textContent.includes("蓋好了")`, "蓋章的 toast", 3000)) ok("蓋章有回饋（蓋好了。）");
    await has("1 / 9", "頂欄變 1 / 9");
    await wait(600);
    expect(psql("select count(*) from public.intern_stamps where task_id='T2627-01'") === "1", "資料庫裡有那個章");
    expect(psql("select note from public.intern_entries where task_id='T2627-01'") === "第一次開會很緊張", "資料庫裡有那句心得");
    // 翻面看心得
    await click('[data-act="flip"][data-id="T2627-01"][data-to="back"]');
    await has("第一次開會很緊張", "翻到背面看得到心得");
    // 進度牆
    await click('[data-act="tab"][data-v="wall"]');
    if (await until(`document.body.innerText.includes("1 / 9") && document.querySelector(".person")`, "進度牆")) ok("進度牆載出來");
    await has("實習一號", "自己在牆上");
    await hasNot("第一次開會很緊張", "牆上沒有心得");
    // 設定頁：intern 看得到名字兩格與大頭照，沒有故事、沒有學校
    await go("/settings/");
    await until(`document.getElementById("nzh")`, "設定頁");
    expect(await count("#nen") === 1 && await count("#school") === 0, "設定頁問中英文名，不問學校年級");
    expect(await count('[data-act="avatar"]') === 1, "設定頁有大頭照");
    await hasNot("我的故事", "intern 沒有「我的故事」");
    await has("去實習護照", "設定頁有回實習護照的入口");
    // 頂欄
    expect(await count('nav.btnav a[href="/intern-passport/"]') === 1 && await count('nav.btnav a[href="/passport/"]') === 0, "intern 的頂欄有實習護照、沒有幹部護照");
    // 幹部護照、後台進不去
    // 幹部護照把他導去 /app/，/app/ 認出他是 intern 又把他送進實習護照：最後停在自己的護照上。
    await go("/passport/");
    if (await until(`location.pathname === "/intern-passport/"`, "intern 打幹部護照會被導走")) ok("intern 打 /passport/ 最後被送回自己的實習護照");
    await go("/admin/");
    await until(`document.body.innerText.includes("幹部")`, "後台的擋人頁");
    expect(await count('[data-t="interns"]') === 0, "intern 進不了後台");

    // ════════ 3. Internship team 的幹部：只有牆 ════════
    console.log("\nInternship team 的幹部：");
    await logout();
    await login("istaff@example.com", "staffpass");
    await until(`location.pathname === "/settings/"`, "登入");
    await has("實習生進度牆", "設定頁的護照那一段有「實習生進度牆」");
    await go("/intern-passport/");
    if (await until(`document.querySelector(".person")`, "進度牆")) ok("Internship team 的幹部打開實習護照直接是進度牆");
    await has("實習一號", "牆上看得到 intern");
    await has("1 / 9", "看得到他蓋了一格");
    expect(await count('[data-v="passport"]') === 0 && await count(".book") === 0, "沒有自己的書，只有牆");
    await hasNot("第一次開會很緊張", "看不到心得");
    expect(psql("select count(*) from public.intern_entries") === "1", "（心得在資料庫裡，是 RLS 不給看）");
    await go("/admin/");
    if (await until(`document.querySelector('[data-t="interns"]')`, "後台分頁")) ok("後台有「實習護照」分頁");
    await click('[data-t="interns"]');
    await until(`document.querySelector('[data-act="intern-task-new"]')`, "分頁載完");
    await has("1 人蓋過", "後台看得到那一格被蓋過");
    expect(await count('[data-act="intern-task-del"][data-id="T2627-01"]') === 0, "蓋過的格子沒有刪掉按鈕");
    expect(await count('[data-act="intern-task-del"][data-id="T2627-02"]') === 1, "沒人蓋過的有");
    await has("目前 1 位 intern", "後台數到 1 位 intern");

    // ════════ 4. 別組的幹部：什麼都看不到 ════════
    console.log("\n別組的幹部：");
    await logout();
    await login("other@example.com", "otherpass");
    await until(`location.pathname === "/settings/"`, "登入");
    await hasNot("實習生進度牆", "設定頁沒有實習生進度牆的入口");
    await go("/intern-passport/");
    if (await until(`location.pathname === "/app/"`, "被導走")) ok("打 /intern-passport/ 被導回 /app/");
    await go("/admin/");
    await until(`document.querySelector('[data-t="forms"]')`, "後台");
    expect(await count('[data-t="interns"]') === 0, "後台沒有「實習護照」分頁");
    expect(await count('nav.btnav a[href="/intern-passport/"]') === 0, "頂欄沒有實習護照");

    // ════════ 5. 資料庫收尾 ════════
    expect(psql("select count(*) from public.invite_uses where code='bt-e2e-intern' and grants='intern'") === "1", "使用紀錄一筆");
    expect(psql("select count(*) from public.intern_passports") === "1", "實習護照一本");
  } catch (e) {
    bad("腳本本身炸了：" + (e.stack || e.message));
  } finally {
    ws.close();
    if (!process.env.E2E_KEEP) { chrome.kill(); server.stop(); }
  }
  console.log();
  if (fail === 0) console.log(`全部通過（${pass} 項）。`); else console.log(`有 ${fail} 項沒過（通過 ${pass} 項）。`);
  if (process.env.E2E_KEEP) console.log(`留著沒關：${base}（Chrome 的 CDP 在 ${CDP}）`);
  return fail ? 1 : 0;
}

process.exit(await main());
