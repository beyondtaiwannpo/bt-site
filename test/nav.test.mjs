// 站台頂欄（shared/nav.js）的契約。
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { FEATURES, featuresFor, barFor, navHTML, withLang, safeAvatar, ME_CACHE_KEY } from "../shared/nav.js";
// 頂欄 2026-10-19 起中英兩版，連結帶 ?lang=；這一支斷言中文，所以每一次都傳 lang: "zh"。

const count = (h, re) => (h.match(re) || []).length;

test("FEATURES 每一筆都有 key / label / href / roles / title / desc", () => {
  assert.ok(FEATURES.length >= 2);
  for (const f of FEATURES)
    for (const k of ["key", "label", "href", "roles", "title", "desc"]) {
      // label / title / desc 是 { zh, en } 兩句並排（2026-10-19 中英切換）。
      if (["label", "title", "desc"].includes(k)) { assert.ok(f[k] && f[k].zh && f[k].en, `${f.key || "?"} 的 ${k} 要有 zh 與 en`); continue; }
      assert.ok(f[k] != null && String(f[k]).length, `${f.key || "?"} 少了 ${k}`);
    }
});

// href 是根目錄相對路徑，而且那個資料夾真的存在。
// 寫錯路徑不會報錯，只會多一個點了 404 的入口。
test("FEATURES 的 href 都指到存在的資料夾", () => {
  for (const f of FEATURES) {
    // 2026-10-28：行事曆是 /home/#calendar（同一個資料夾的另一個畫面），所以後面可以帶 #xxx。
    // 2026-11-27：人與權限是 /admin/people/（後台底下的資料夾），所以可以兩層。
    assert.match(f.href, /^\/[a-z-]+\/([a-z-]+\/)?(#[a-z-]+)?$/, `${f.key} 的 href 不是 /xxx/ 的形狀：${f.href}`);
    assert.ok(existsSync("." + f.href.replace(/#.*$/, "") + "index.html"), `${f.href} 沒有 index.html`);
  }
});

// 2026-11-27 第二版（Paul：「there's like 100 different tabs on the left menu, and then there's setting on top, there's like home and everything」）：
// 幹部的頂欄只剩搜尋框與右上角的大頭照。每一頁都在左邊的側欄；我的故事、設定、人與權限（只有 Co-President 與 Senior Adviser）收在大頭照那一份選單裡。
// 2026-11-27 第三版（Paul：「my story and internal can be on top of the menu, and then once you click Paul… you can go into setting」，搜尋框「find somewhere else」）。
test("★ 幹部的頂欄：logo、我的故事（與人與權限）、大頭照加名字；點名字直接到設定；搜尋框與登出都不在頂欄", () => {
  const h = navHTML({ current: "settings", role: "cadre", name: "王平", lang: "zh", board: "member", avatar: "", ws: {} });
  assert.match(h, /<nav class="btnav btnav-c"/);
  assert.doesNotMatch(h, /btnav-q|type="search"/, "搜尋框搬到側欄最上面");
  assert.match(h, /<div class="btnav-items"><a href="\/settings\/\?lang=zh#story">我的故事<\/a><\/div>/);
  assert.match(h, /<a class="btnav-me" href="\/settings\/\?lang=zh" aria-label="王平 的設定" aria-current="page"><span class="btnav-av" aria-hidden="true">王<\/span><span class="btnav-nm">王平<\/span><\/a>/);
  assert.doesNotMatch(navHTML({ current: "home", role: "cadre", name: "王", lang: "zh" }), /aria-current/, "不在設定那一頁就不亮");
  assert.doesNotMatch(h, /popover|signout|btnav-menu/, "Paul 2026-11-27：點名字直接到設定，登出在設定那一頁最下面");
  assert.doesNotMatch(h, /\/admin\/people\//, "Associate 沒有人與權限");
  assert.ok(!navHTML({ current: "home", role: "cadre", name: "王", lang: "zh" }).includes("/admin/people/"), "沒傳職級就不畫，不會多給");
  for (const b of ["president", "senior_adviser"])
    assert.match(navHTML({ current: "people", role: "cadre", name: "王", lang: "zh", board: b }), /<div class="btnav-items"><a href="\/passport\/\?lang=zh">我的護照<\/a><a href="\/settings\/\?lang=zh#story">我的故事<\/a><a href="\/admin\/people\/\?lang=zh" aria-current="page">人與權限<\/a><\/div>/, b);
  // 首頁、行事曆、護照、時間看板、後台都在側欄，頂欄一項都不畫。
  for (const f of FEATURES.filter(x => x.roles.includes("cadre") && x.key !== "settings" && !x.bar)) assert.ok(!h.includes(`href="${withLang(f.href, "zh")}"`), `${f.key} 在側欄，頂欄不該再有`);
  assert.doesNotMatch(h, /btnav-toggle|btnav-burger/, "幹部的頂欄沒有「選單」那一顆");
});
test("★ 我的護照在頂欄（2026-11-28 Paul：「Move my passport to the top menu」）：被開了那一格的幹部才有，排在我的故事前面", () => {
  const items = h => (h.match(/<div class="btnav-items">([\s\S]*?)<\/div>/) || ["", ""])[1].match(/>[^<]+<\/a>/g) || [];
  const day = { "custom:my-passport": "edit" };
  assert.deepEqual(items(navHTML({ current: "passport", role: "cadre", name: "王", lang: "zh", board: "member", ws: day })), [">我的護照</a>", ">我的故事</a>"]);
  assert.match(navHTML({ current: "passport", role: "cadre", name: "王", lang: "zh", board: "member", ws: day }), /<a href="\/passport\/\?lang=zh" aria-current="page">我的護照<\/a>/, "在護照那一頁它亮著");
  assert.deepEqual(items(navHTML({ current: "home", role: "cadre", name: "王", lang: "zh", board: "member", ws: {} })), [">我的故事</a>"], "沒被開那一格就不畫（跟以前側欄一樣）");
  assert.deepEqual(items(navHTML({ current: "home", role: "cadre", name: "王", lang: "zh", board: "senior_adviser", ws: {} })), [">我的護照</a>", ">我的故事</a>", ">人與權限</a>"], "Senior Adviser 一定有");
  // 呼叫端沒傳 ws：讀這個分頁的 bt-me（shared/auth.js 存的）。
  const old = globalThis.sessionStorage;
  globalThis.sessionStorage = { getItem: k => k === ME_CACHE_KEY ? JSON.stringify({ row: {}, ws: day }) : null };
  try { assert.match(navHTML({ role: "cadre", name: "王", lang: "zh", board: "member" }), />我的護照</); }
  finally { globalThis.sessionStorage = old; }
  assert.equal(FEATURES.find(f => f.key === "passport").barWs, "custom:my-passport");
  for (const r of ["student", "alumni", "intern"]) assert.doesNotMatch(navHTML({ role: r, name: "x", lang: "zh" }), /href="\/passport\//, `${r} 沒有幹部護照`);
});

test("★ 右上角是自己的大頭照：呼叫端傳的先，沒傳讀這個分頁的 bt-me；只收圖片的 data URL 與 https", () => {
  const png = "data:image/png;base64,iVBORw0KGgo=";
  assert.match(navHTML({ role: "cadre", name: "王", lang: "zh", avatar: png }), /<img class="btnav-av" src="data:image\/png;base64,iVBORw0KGgo=" alt="" width="30" height="30"><span class="btnav-nm">王<\/span>/);
  for (const bad of ["javascript:alert(1)", "data:text/html;base64,PGI+", 'https://x.test/a.png" onerror="x', "http://x.test/a.png"]) assert.equal(safeAvatar(bad), "", bad);
  assert.equal(safeAvatar("https://lh3.googleusercontent.com/a/x=s96"), "https://lh3.googleusercontent.com/a/x=s96");
  const old = globalThis.sessionStorage;
  globalThis.sessionStorage = { getItem: k => k === ME_CACHE_KEY ? JSON.stringify({ row: { avatar: png } }) : null };
  try { assert.match(navHTML({ role: "cadre", name: "王", lang: "zh" }), /<img class="btnav-av" src="data:image\/png/); }
  finally { globalThis.sessionStorage = old; }
  assert.match(readFileSync("shared/auth.js", "utf8"), new RegExp(`const ME_KEY = "${ME_CACHE_KEY}";`), "跟 whoAmI 存的那一格同一個名字");
  assert.match(readFileSync("settings/src/main.js", "utf8"), /avatar: S\.me \? S\.me\.avatar \|\| "" : undefined/, "設定那一頁剛換的照片馬上出現");
});
test("★ 沒有側欄的那兩頁（設定、實習生進度牆）傳 rail: false，頂欄多一個「首頁」，不然回不去", () => {
  const h = navHTML({ current: "settings", role: "cadre", name: "王", lang: "zh", rail: false });
  assert.match(h, /<div class="btnav-items"><a href="\/home\/\?lang=zh">首頁<\/a><a href="\/settings\/\?lang=zh#story">我的故事<\/a><\/div>/);
  assert.doesNotMatch(navHTML({ current: "home", role: "cadre", name: "王", lang: "zh" }), />首頁<\/a>/);
  assert.match(readFileSync("settings/src/main.js", "utf8"), /board: S\.me && S\.me\.board_role, rail: false,/);
  assert.match(readFileSync("intern-passport/src/main.js", "utf8"), /rail: false \}\)/);
  // 搜尋那一頁讀 ?q=（側欄的搜尋框從別頁送過來）。
  assert.match(readFileSync("admin/search/src/main.js", "utf8"), /searchParams\.get\("q"\)/);
});
test("★ 登出在設定那一頁最下面（每一種人都有一顆）", () => {
  const ui = readFileSync("settings/src/ui.js", "utf8");
  assert.match(ui, /<div class="danger">[\s\S]*?<\/div>\s*\$\{[\s\S]*?\}\s*<div class="signout-row"><button class="btn ghost" data-act="signout">\$\{T\("common\.signout"\)\}<\/button><\/div>\s*<\/div>`;/);
  assert.match(readFileSync("settings/src/main.js", "utf8"), /if \(act === "signout"\) \{ await AUTH\.signOut\(\);/);
  assert.doesNotMatch(readFileSync("shared/nav.css", "utf8"), /btnav-menu/, "那一份選單的樣式一起拿掉");
});

// 學員、實習生、校友沒有側欄，頂欄照舊是 featuresFor 的全部。
test("★ 沒有側欄的角色頂欄不變", () => {
  for (const role of ["student", "intern", "alumni"])
    assert.deepEqual(barFor(role).map(f => f.key), featuresFor(role).map(f => f.key), role);
});

// ★ 學員：列照樣畫，只是功能項是空的。不整條藏起來——他知道自己在這個站裡，
// 只是還沒有功能；之後開放給學員的功能只要在 roles 加 "student"，列就自動長出來。
// 2026-09-08：學員不再是零項——/settings/ 是第一個 roles 含 student 的功能，
// 正是這個檔案檔頭一直在等的那一刻。
// **這一條守的仍然是同一件事**：學員只看得到屬於他的那幾項，
// 一項都不能多（多一項就是一條他點了會被彈回來的死路）。
test("★ 學員只看得到屬於學員的功能項，logo、名字、登出都在", () => {
  const h = navHTML({ current: null, role: "student", name: "小明", lang: "zh" });
  const mine = FEATURES.filter(f => f.roles.includes("student"));
  assert.ok(mine.length > 0, "學員一項都沒有的話，這一條就沒有在守任何東西了");
  assert.equal(count(h, /<a href="\/[a-z-]+\/\?lang=zh"/g), mine.length, "學員看到了他進不去的功能");
  for (const f of FEATURES.filter(x => !x.roles.includes("student")))
    assert.ok(!h.includes(`href="${f.href}?lang=zh"`), `學員看到了幹部才有的 ${f.key}`);
  // 2026-09-08：logo 改成回對外的首頁。/app/ 現在只剩登入表單，
  // 點 logo 回到一頁只有表單的地方沒有意義。
  assert.ok(h.includes('href="/"'), "沒有回首頁的 logo 連結");
  assert.ok(!h.includes('href="/app/"'), "logo 還指著只剩登入表單的 /app/");
  assert.ok(h.includes("小明"), "沒有名字");
  assert.ok(h.includes('data-act="signout"'), "沒有登出");
  assert.ok(h.includes('<nav class="btnav"'), "整條列不見了——空的列比消失誠實");
});

// 校友（2026-09-11）。校友沒有護照、沒有時間看板、沒有申請管理，
// 他在這個站上唯一的事情是「我的故事」，2026-11-27 起自己一頁（/settings/#story）。
test("★ 校友的頂欄只有我的故事與設定，一項都不能多", () => {
  const keys = featuresFor("alumni").map(f => f.key);
  assert.deepEqual(keys, ["story", "settings"]);
  assert.ok(!featuresFor("student").some(f => f.key === "story"), "學員沒有故事");
});

test("role 是 null（profiles 查不到）時也不會爆，當成沒有功能", () => {
  assert.doesNotThrow(() => navHTML({ current: null, role: null, name: "", lang: "zh" }));
  assert.equal(count(navHTML({ current: null, role: null, name: "", lang: "zh" }), /<a href="\/[a-z-]+\/\?lang=zh"/g), 0);
});

test("名字會跳脫，而且窄螢幕用的第一個字也跳脫", () => {
  const h = navHTML({ current: null, role: "student", name: '<b>x</b>', lang: "zh" });
  assert.ok(!h.includes("<b>x</b>"), "名字被原樣塞進 HTML");
  assert.ok(h.includes("&lt;b&gt;x&lt;/b&gt;"), "名字沒有被顯示");
  assert.ok(h.includes('<span class="short">&lt;</span>'), "第一個字沒有跳脫");
  // 幹部的頂欄（2026-11-27）：名字在大頭照那一顆上，也跳脫。
  const c = navHTML({ current: null, role: "cadre", name: '<b>x</b>', lang: "zh" });
  assert.ok(!c.includes("<b>x</b>")); assert.match(c, /<span class="btnav-av" aria-hidden="true">&lt;<\/span><span class="btnav-nm">&lt;b&gt;x&lt;\/b&gt;<\/span>/);
});

test("沒有名字時不畫名字那一格，但登出還在", () => {
  const h = navHTML({ current: null, role: "student", name: "", lang: "zh" });
  assert.ok(!h.includes("btnav-who"));
  assert.ok(h.includes('data-act="signout"'));
});

// 2026-09-08：原本這裡有一條「/app/ 的選單卡片跟頂欄用同一份 FEATURES」。
// 選單頁刪掉之後 FEATURES 只剩頂欄一個消費者，**那條保證不是消失，是變成不必要**。
// 哪天又要做一個樞紐頁，那條測試要跟著回來。

test("app/src/ui.js 不准自己寫死功能的 href", () => {
  const src = readFileSync("app/src/ui.js", "utf8").replace(/<!--[\s\S]*?-->|\/\/[^\n]*/g, "");
  assert.ok(!/href="\.\.\/(passport|availability)\/"/.test(src), "選單裡有寫死的 ../passport/ 或 ../availability/");
  assert.ok(!/href="\/(passport|availability)\/"/.test(src), "選單裡有寫死的 /passport/ 或 /availability/");
});

// shared/ 的依賴方向只能往下。反過來的話護照壞掉會讓每一頁的頂欄一起壞。
test("shared/ 不 import 任何功能資料夾", () => {
  for (const f of ["shared/nav.js", "shared/auth.js", "shared/supabase.js"]) {
    const src = readFileSync(f, "utf8");
    assert.ok(!/^\s*import .*\/(passport|availability|app)\//m.test(src), `${f} import 了功能資料夾`);
  }
});

// ── 窄螢幕的「選單」（2026-09-10）──────────────────────────────────
// 四個功能項在 390px 上一排放不下，所以窄螢幕收成一顆選單。
// 開合是純 CSS：一個看不見的 checkbox 加一個 label。（2026-11-27 起只有沒有側欄的角色有這一顆，幹部的頂欄見上面。）
test("★ 選單的開關是 checkbox 加 label，而且 for 對得上 id", () => {
  const h = navHTML({ current: "settings", role: "alumni", name: "王平", lang: "zh" });
  const id = (h.match(/<input class="btnav-toggle"[^>]*id="([^"]+)"/) || [])[1];
  assert.ok(id, "沒有那個開關的 checkbox");
  assert.ok(h.includes(`<label class="btnav-burger" for="${id}"`),
    "label 的 for 沒有對到 checkbox 的 id —— 點下去不會有反應，而且不會報錯");
  assert.match(h, /aria-label="展開選單"/, "讀螢幕的人聽不出那顆是什麼");
});

// ⚠ 這一條擋的是一個看起來像改良的改動。<details> 在還沒展開的時候
// 會把 summary 以外的小孩整個藏起來，而那不是能用 CSS 蓋掉的規則
// （瀏覽器用內部的 slot 做）。改過去的話**寬螢幕上四個功能項整排消失**，
// 而且不會報錯 —— 2026-09-10 是靠截圖才發現的。
test("★ 不准改用 <details> 做那顆選單", () => {
  // ⚠ 要先把 HTML 註解剝掉再看。navHTML 裡那段註解本身就寫著這個標籤名
  //（它在解釋為什麼不能用），不剝的話這條測試會抓到那段解釋自己。
  const h = navHTML({ current: null, role: "alumni", name: "", lang: "zh" })
    .replace(/<!--[\s\S]*?-->/g, "");
  assert.doesNotMatch(h, /<details/, "改成 details 的話寬螢幕上功能項會整排不見");
  assert.doesNotMatch(h, /<summary/);
});

// 面板與那排連結是同一個 div，不是兩份。兩份的話寬螢幕改了一邊、
// 窄螢幕還是舊的，而且沒有東西會報錯。
test("★ 功能項只有一份，不是寬窄各一份", () => {
  const h = navHTML({ current: null, role: "alumni", name: "王平", lang: "zh" });
  assert.equal((h.match(/class="btnav-items"/g) || []).length, 1);
  for (const f of barFor("alumni"))
    assert.equal(h.split(`href="${withLang(f.href, "zh")}"`).length - 1, 1,
      `${f.key} 出現了不只一次`);
});
