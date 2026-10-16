// 實習護照的端對端測試：真的瀏覽器、真的前端、**真的本機 Supabase**（Docker）。
//
// 用法：  node scripts/e2e/intern.mjs          （印 ok / FAIL，最後一行是總數）
//         E2E_KEEP=1 node scripts/e2e/intern.mjs（跑完不關，可以自己開 http://127.0.0.1:8765 看）
// 需要：  Docker（OrbStack）、Supabase CLI、Google Chrome。第一次 supabase start 要拉 image。
//
// 每次從零開始：supabase start（已經在跑就直接用）、scripts/e2e/db.sh 重建資料庫
//（schema.sql → seed.sql → 33 支遷移檔，照 README 寫的重建順序），server.mjs 把網站放在 8765、
// 指向本機 Supabase，然後用 Chrome 的 DevTools 協定照一個真人會做的順序點過去：
//
//   Co-President 登入 → 後台「實習護照」改格子、加格子、停用、恢復、刪掉、開新的一屆、
//   發一組實習生碼 → 登出 → 新的人註冊 → **去收信匣點確認信** → 輸碼變成 intern → 領護照
//   → 蓋章 → 進度牆 → Internship team 的幹部只看得到牆 → 別組的幹部被導回登入頁
//   → 登入那一層：重複 email、打錯密碼、忘記密碼連按兩次被限流、重設信用的是 repo 裡的範本、
//     Google 那顆按鈕送去的網址帶對了 redirect
//   → 最後直接查資料庫，確認章、心得、使用紀錄都在。
//
// 2026-10-18 之前這支打的是一個假的登入層（PostgREST 加替身）。Paul 的 Mac 裝了 Docker 之後
// 換成真的 Supabase，email 確認、限流、錯誤的形狀都是 GoTrue 真的回的，不再是照註解模仿的。
// 還是驗不到的：真的 Google 同意畫面（要真的 Google 帳號）、Resend 真的寄信。
//
// 跟 smoke.sh 的分工：smoke.sh 驗資料庫那一半（函式邏輯、RLS），這一支驗「畫面接上去之後
// 一個人真的走得完」。兩邊都綠才算 work。
import { spawn, spawnSync, execFileSync } from "node:child_process";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { start, localSupabase } from "./server.mjs";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const CDP = 9333;
const PATH = `${process.env.HOME}/.orbstack/bin:/opt/homebrew/bin:${process.env.PATH}`;
const ENV = { ...process.env, PATH, PGPASSWORD: "postgres" };
let pass = 0, fail = 0;
const ok = m => { console.log("  ok   " + m); pass++; };
const bad = m => { console.log("  FAIL " + m); fail++; };
const wait = ms => new Promise(r => setTimeout(r, ms));
const psql = sql => execFileSync("psql", ["-h", "127.0.0.1", "-p", "54322", "-U", "postgres", "-d", "postgres", "-X", "-A", "-t", "-q", "-c", sql],
                                  { encoding: "utf8", env: ENV }).trim();

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

// 收信匣（本機 Supabase 附的 Mailpit）。
async function mailbox(mailUrl) {
  const list = await (await fetch(mailUrl + "/api/v1/messages?limit=50")).json();
  return list.messages || [];
}
async function mailFor(mailUrl, to, subjectPart, tries = 20) {
  for (let i = 0; i < tries; i++) {
    const m = (await mailbox(mailUrl)).find(x => (x.To || []).some(t => t.Address === to) && (!subjectPart || String(x.Subject).includes(subjectPart)));
    if (m) return await (await fetch(mailUrl + "/api/v1/message/" + m.ID)).json();
    await wait(400);
  }
  return null;
}
// 信是 HTML，連結裡的 & 會變成 &amp;，要還原；不然 GoTrue 會說「Verify requires a verification type」。
const linkIn = m => (((m && (m.HTML || m.Text) || "").match(/https?:\/\/[^\s"'<>]+\/auth\/v1\/verify[^\s"'<>]*/) || [])[0] || "").replace(/&amp;/g, "&");

async function main() {
  if (!existsSync(CHROME)) { console.log("SKIP 找不到 Google Chrome"); return 0; }
  if (spawnSync("supabase", ["--version"], { env: ENV }).status !== 0) { console.log("SKIP 沒有 Supabase CLI"); return 0; }

  let sb;
  try { sb = localSupabase(); } catch {
    console.log("supabase start…（第一次要幾分鐘）");
    const r = spawnSync("supabase", ["start"], { env: ENV, encoding: "utf8" });
    if (r.status !== 0) { console.log(r.stdout + r.stderr); return 1; }
    sb = localSupabase();
  }
  console.log("重建本機 Supabase 的資料庫");
  const db = spawnSync("./scripts/e2e/db.sh", [], { encoding: "utf8", env: ENV });
  if (db.status !== 0) { console.log(db.stdout + db.stderr); return 1; }
  ok("schema.sql、seed.sql、33 支遷移檔在乾淨的資料庫上全部跑過");

  // 三個既有的幹部：走真的註冊 API，再用 SQL 把 email 標成已確認、填身分。
  const SEED = [
    ["paul@example.com",   "paulpass",  "王平",   "Paul Wang",  "Sponsorship Team",                  "president"],
    ["istaff@example.com", "staffpass", "帶實習的", "Mentor Lin", "Curriculum Team, Internship Team",  "member"],
    ["other@example.com",  "otherpass", "別組的", "Other Chen", "Marketing Team",                    "director"],
  ];
  for (const [email, pw, zh, en, team, board] of SEED) {
    const r = await fetch(sb.url + "/auth/v1/signup", { method: "POST",
      headers: { "content-type": "application/json", apikey: sb.anon }, body: JSON.stringify({ email, password: pw }) });
    if (!r.ok) { console.log("放幹部帳號失敗：", await r.text()); return 1; }
    psql(`update auth.users set email_confirmed_at = now() where email = '${email}';
          update public.profiles set name_zh='${zh}', name_en='${en}', team='${team}', role='cadre', board_role='${board}'
            where id = (select id from auth.users where email='${email}');
          insert into public.passports (id) select id from auth.users where email='${email}' on conflict do nothing;`);
  }
  ok("三個幹部用真的註冊 API 建好，email 標成已確認");

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
  await send("Page.addScriptToEvaluateOnNewDocument", { source: `window.confirm = () => true;` });
  await send("Emulation.setDeviceMetricsOverride", { width: 1200, height: 900, deviceScaleFactor: 1, mobile: false });

  const ev = async expr => (await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true })).result.value;
  const go = async url => { await send("Page.navigate", { url: url.startsWith("http") ? url : base + url }); await wait(400); };
  const href = () => ev("location.href");
  const text = () => ev("document.body.innerText");
  async function until(expr, what, ms = 10000) {
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
    // 幹部護照本身也要打得開。2026-10-18 從零重建時這裡是「資料庫休眠中」——
    // 2026-08-25 那支遷移檔收走了三張表的權限沒發回去（見 2026-10-19-regrant-passport-tables.sql）。
    await go("/passport/");
    if (await until(`document.getElementById("fz") || document.querySelector(".book") || document.querySelector('[data-act="intro-done"]')`, "幹部護照")) ok("幹部護照打得開（從零重建後三張表的權限都在）");
    await go("/admin/");
    if (await until(`document.querySelector('a[data-group="passports"]')`, "後台首頁有「護照」那一組")) ok("Co-President 的後台首頁有「護照」那一組（是連結）");
    await go("/admin/passports/");
    await until(`document.querySelector('[data-act="intern-task-new"]')`, "實習護照那一頁載完");
    await has("目前 0 位 intern", "還沒有 intern 時數字是 0");
    expect(await count('[data-act="intern-task-edit"]') === 9, "九格範例格子都在");
    await has("目前這一屆", "2026-27 標著目前這一屆");

    await click('[data-act="intern-task-new"]');
    await until(`document.getElementById("ik-id")`, "加一格的表單");
    expect(await ev(`document.getElementById("ik-id").value`) === "T2627-10", "新格子的代號先填好 T2627-10");
    await click('[data-act="intern-task-save"]');
    await has("代號、中文標題、英文標題都要填", "空著按會被擋，而且說出缺什麼");
    expect(await ev(`document.getElementById("ik-id").value`) === "T2627-10", "被擋之後表單沒有被洗掉");
    await setv("ik-zh", "測試格"); await setv("ik-en", "TEST SLOT"); await setv("ik-seq", "10"); await setv("ik-desc", "端對端測試加的");
    await click('[data-act="intern-task-save"]');
    if (await until(`document.body.innerText.includes("加好了")`, "加一格的回饋")) ok("加好了，畫面有回饋");
    expect(await count('[data-act="intern-task-edit"]') === 10, "清單變成十格");

    await click('[data-act="intern-task-edit"][data-id="T2627-10"]');
    await until(`document.getElementById("ik-zh")`, "改一格的表單");
    expect(await ev(`document.getElementById("ik-id").disabled`) === true, "改的時候代號鎖住");
    await setv("ik-zh", "測試格（改）");
    await click('[data-act="intern-task-save"]');
    if (await until(`document.body.innerText.includes("改好了")`, "改一格的回饋")) ok("改好了，畫面有回饋");
    await has("測試格（改）", "標題真的改了");

    await click('[data-act="intern-task-off"][data-id="T2627-10"]');
    if (await until(`document.body.innerText.includes("停用了")`, "停用的回饋")) ok("停用了，畫面有回饋");
    await has("停用中", "格子標著停用中");
    await click('[data-act="intern-task-on"][data-id="T2627-10"]');
    if (await until(`document.body.innerText.includes("恢復了")`, "恢復的回饋")) ok("恢復了，畫面有回饋");
    await click('[data-act="intern-task-del"][data-id="T2627-10"]');
    if (await until(`document.body.innerText.includes("刪掉了")`, "刪掉的回饋")) ok("刪掉了，畫面有回饋");
    expect(await count('[data-act="intern-task-edit"]') === 9, "清單回到九格");

    await click('[data-act="intern-term-new"]');
    await until(`document.getElementById("it-id")`, "開新的一屆的表單");
    await setv("it-id", "2027 28"); await setv("it-zh", "2027-28 實習"); await setv("it-en", "INTERNSHIP 2027-28");
    await setv("it-start", "2027-09-01"); await setv("it-end", "2028-07-31");
    await click('[data-act="intern-term-save"]');
    if (await until(`document.body.innerText.includes("屆別的代號只能用")`, "代號有空白被擋")) ok("代號有空白：被擋，說得出原因");
    expect(await ev(`document.getElementById("it-zh").value`) === "2027-28 實習", "被擋之後填的東西還在");
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

    await click('[data-t="invites"]');
    if (await until(`document.getElementById("ic-code")`, "邀請碼分頁")) ok("從實習護照分頁切得到邀請碼分頁（Co-President 的分頁沒有不見）");
    await setv("ic-code", "bt-e2e-intern"); await setv("ic-grants", "intern"); await setv("ic-uses", "1"); await setv("ic-note", "端對端測試");
    await click('[data-act="invite-new"]');
    if (await until(`document.body.innerText.includes("建好了：bt-e2e-intern")`, "發碼的回饋")) ok("實習生碼發好了");
    await has("實習生碼", "清單上標著實習生碼");

    // ════════ 2. 新的人：註冊 → 收確認信 → 輸碼 → 領護照 → 蓋章 ════════
    console.log("\n新的 intern（真的註冊、真的確認信）：");
    await logout();
    await click('[data-act="switch-auth"][data-m="up"]');
    await until(`document.body.innerText.includes("至少 6 個字")`, "切到註冊表單");
    await setv("ae", "intern1@example.com"); await setv("ap", "12345");
    await click('[data-act="do-signup"]');
    if (await until(`document.body.innerText.includes("密碼至少要 6 個字")`, "密碼太短被擋")) ok("密碼太短：GoTrue 真的回 weak_password，畫面翻成「密碼至少要 6 個字」");
    await setv("ap", "internpass");
    await click('[data-act="do-signup"]');
    if (await until(`document.body.innerText.includes("去收一封信")`, "註冊完等確認信的畫面")) ok("註冊完畫面說「去收一封信」（email 確認是開的）");
    await has("intern1@example.com", "畫面上寫了寄去哪個信箱");
    const m = await mailFor(sb.mail, "intern1@example.com", "確認");
    expect(!!m, "收信匣裡有確認信");
    expect(!!m && m.Subject === "確認你的 Beyond Taiwan 帳號", "確認信的主旨對");
    expect(!!m && /Beyond Taiwan/.test(m.HTML || ""), "信的內容是 repo 裡 confirm-signup.html 那一份");
    const link = linkIn(m);
    expect(!!link, "信裡有確認連結");
    expect(psql("select email_confirmed_at is null from auth.users where email='intern1@example.com'") === "t", "點之前 email 還沒確認");
    await go("/app/");
    await until(`document.getElementById("ae")`, "登入表單");
    await setv("ae", "intern1@example.com"); await setv("ap", "internpass");
    await click('[data-act="do-signin"]');
    await wait(1500);
    expect((await href()).endsWith("/app/") && await count("#ae") === 1, "沒點確認信之前登不進去（還停在登入表單）");
    // 點信裡的連結。確認完 GoTrue 把人送回 Site URL；設計上的下一步是那顆「我點過了，去登入」，
    // 所以這裡照真人的走法：點完連結、回登入頁、用密碼登入。
    await go(link);
    await wait(1200);
    expect(psql("select email_confirmed_at is not null from auth.users where email='intern1@example.com'") === "t", "點了確認信，資料庫裡 email 確認了");
    await login("intern1@example.com", "internpass");
    if (await until(`document.getElementById("pn") || document.querySelector('[data-act="show-claim"]')`, "確認之後登入")) ok("確認之後登得進去，停在補資料頁");
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
    await click('[data-act="flip"][data-id="T2627-01"][data-to="back"]');
    await has("第一次開會很緊張", "翻到背面看得到心得");
    await click('[data-act="tab"][data-v="wall"]');
    if (await until(`document.body.innerText.includes("1 / 9") && document.querySelector(".person")`, "進度牆")) ok("進度牆載出來");
    await has("實習一號", "自己在牆上");
    await hasNot("第一次開會很緊張", "牆上沒有心得");
    await go("/settings/");
    await until(`document.getElementById("nzh")`, "設定頁");
    expect(await count("#nen") === 1 && await count("#school") === 0, "設定頁問中英文名，不問學校年級");
    expect(await count('[data-act="avatar"]') === 1, "設定頁有大頭照");
    await hasNot("我的故事", "intern 沒有「我的故事」");
    await has("去實習護照", "設定頁有回實習護照的入口");
    expect(await count('nav.btnav a[href="/intern-passport/"]') === 1 && await count('nav.btnav a[href="/passport/"]') === 0, "intern 的頂欄有實習護照、沒有幹部護照");
    await go("/passport/");
    if (await until(`location.pathname === "/intern-passport/"`, "intern 打幹部護照會被導走")) ok("intern 打 /passport/ 最後被送回自己的實習護照");
    await go("/admin/");
    await until(`document.body.innerText.includes("幹部")`, "後台的擋人頁");
    expect(await count('[data-group]') === 0, "intern 進不了後台");
    await go("/admin/passports/");
    await until(`document.body.innerText.includes("幹部")`, "護照那一組的擋人頁");
    expect(await count('[data-act="intern-task-new"]') === 0, "intern 硬打網址也進不了護照那一組");

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
    if (await until(`document.querySelector('a[data-group="passports"]')`, "後台首頁")) ok("後台首頁的「護照」那一組對 Internship team 是連結");
    expect(await count('a[data-group="people"]') === 0, "「人與權限」對 Internship team 的幹部是灰字");
    await go("/admin/passports/");
    await until(`document.querySelector('[data-act="intern-task-new"]')`, "護照那一組載完");
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
    await until(`document.querySelector('[data-group="forms"]')`, "後台");
    expect(await count('a[data-group="passports"]') === 0, "後台首頁的「護照」那一組是灰字");
    await go("/admin/passports/");
    await until(`document.body.innerText.includes("Internship team 用得到")`, "護照那一組的擋人頁");
    expect(await count('[data-act="intern-task-new"]') === 0, "硬打網址也改不到格子");
    expect(await count('nav.btnav a[href="/intern-passport/"]') === 0, "頂欄沒有實習護照");

    // ════════ 5. 登入那一層：以前替身模仿的，現在是 GoTrue 真的回的 ════════
    console.log("\n登入那一層（真的 GoTrue）：");
    await logout();
    await click('[data-act="switch-auth"][data-m="up"]');
    await until(`document.body.innerText.includes("至少 6 個字")`, "註冊表單");
    await setv("ae", "paul@example.com"); await setv("ap", "whatever1");
    await click('[data-act="do-signup"]');
    if (await until(`document.body.innerText.includes("這個 email 已經有帳號了")`, "重複 email")) ok("重複 email：帶回登入畫面，說「已經有帳號了」");
    expect(await ev(`document.getElementById("ae") && document.getElementById("ae").value`) === "paul@example.com", "email 留著，不用重打");
    await setv("ap", "wrongpass");
    await click('[data-act="do-signin"]');
    if (await until(`document.body.innerText.includes("email 或密碼不對")`, "密碼錯")) ok("密碼打錯：「email 或密碼不對」，而且指向忘記密碼");
    expect(await ev(`document.getElementById("ae").value`) === "paul@example.com", "密碼打錯 email 也留著");
    await click('[data-act="switch-auth"][data-m="forgot"]');
    await until(`document.getElementById("fpe")`, "忘記密碼表單");
    await setv("fpe", "paul@example.com");
    await click('[data-act="do-forgot"]');
    if (await until(`document.body.innerText.includes("信寄出去了")`, "重設信寄出")) ok("忘記密碼：畫面說「信寄出去了」（而且不說這個信箱有沒有帳號）");
    const rm = await mailFor(sb.mail, "paul@example.com", "重設");
    expect(!!rm && rm.Subject === "重設 Beyond Taiwan 的密碼", "收信匣裡有重設信，主旨對");
    expect(!!rm && /%2Freset%2F|\/reset\//.test(linkIn(rm) || ""), "重設連結的落點是 /reset/");
    await click('[data-act="switch-auth"][data-m="in"]');
    await until(`document.getElementById("ae")`, "回登入");
    await click('[data-act="switch-auth"][data-m="forgot"]');
    await until(`document.getElementById("fpe")`, "忘記密碼表單");
    await setv("fpe", "paul@example.com");
    await click('[data-act="do-forgot"]');
    if (await until(`document.body.innerText.includes("剛剛已經寄過一封了")`, "限流")) ok("5 秒內再按一次：GoTrue 真的回 429，畫面說「剛剛已經寄過一封了」");
    await go("/app/?next=passport");
    await until(`document.querySelector('[data-act="do-google"]')`, "登入表單");
    await click('[data-act="do-google"]');
    if (await until(`location.href.includes("/auth/v1/authorize")`, "跳去 Google 那一步", 8000)) {
      const u = new URL(await href());
      expect(u.searchParams.get("provider") === "google", "Google 按鈕送去 /auth/v1/authorize?provider=google");
      expect(/\/app\//.test(u.searchParams.get("redirect_to") || ""), "回來的落點是 /app/");
      expect(/next=passport/.test(u.searchParams.get("redirect_to") || ""), "redirect_to 帶著 next=passport（Google 回來之後要回護照）");
    }

    // ════════ 6. 資料庫收尾 ════════
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
  if (process.env.E2E_KEEP) console.log(`留著沒關：${base}（本機 Supabase ${sb.url}，收信匣 ${sb.mail}，Studio ${sb.studio}）`);
  return fail ? 1 : 0;
}

process.exit(await main());
