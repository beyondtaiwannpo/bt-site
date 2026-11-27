// 站台頂欄（shared/nav.js）的契約。
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { FEATURES, featuresFor, barFor, navHTML, withLang } from "../shared/nav.js";
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
test("★ 幹部的頂欄：logo、搜尋框、大頭照；選單裡是我的故事、設定（人與權限只給 Co-President 與 Senior Adviser）與登出", () => {
  const h = navHTML({ current: "settings", role: "cadre", name: "王平", lang: "zh", board: "member" });
  assert.match(h, /<nav class="btnav btnav-c"/);
  assert.match(h, /<form class="btnav-q" role="search" action="\/admin\/search\/" method="get" data-form="search">/, "送出到搜尋那一頁（它讀 ?q=）");
  assert.match(h, /<input type="search" name="q"[^>]*aria-label="搜尋"/);
  assert.match(h, /<input type="hidden" name="lang" value="zh">/, "語言跟著過去");
  assert.match(h, /<button type="button" class="btnav-me" popovertarget="btnav-menu" aria-label="我的帳號：王平"><span class="btnav-av" aria-hidden="true">王<\/span>/);
  const menu = h.slice(h.indexOf('<div class="btnav-menu" id="btnav-menu" popover>'));
  assert.match(menu, /href="\/settings\/\?lang=zh#story">我的故事<\/a><a href="\/settings\/\?lang=zh" aria-current="page">設定<\/a><button class="btnav-out" data-act="signout">登出/);
  assert.doesNotMatch(h, /\/admin\/people\//, "Associate 沒有人與權限");
  assert.ok(!navHTML({ current: "home", role: "cadre", name: "王", lang: "zh" }).includes("/admin/people/"), "沒傳職級就不畫，不會多給");
  for (const b of ["president", "senior_adviser"])
    assert.match(navHTML({ current: "people", role: "cadre", name: "王", lang: "zh", board: b }), /<a href="\/admin\/people\/\?lang=zh" aria-current="page">人與權限<\/a>/, b);
  // 首頁、行事曆、護照、時間看板、後台都在側欄，頂欄一項都不畫。
  for (const f of FEATURES.filter(x => x.roles.includes("cadre") && !x.menu)) assert.ok(!h.includes(`href="${withLang(f.href, "zh")}"`), `${f.key} 在側欄，頂欄不該再有`);
  assert.doesNotMatch(h, /btnav-toggle|btnav-burger/, "幹部的頂欄沒有「選單」那一顆");
});
test("★ 沒有側欄的那兩頁（設定、實習生進度牆）傳 rail: false，頂欄多一個「首頁」，不然回不去", () => {
  const h = navHTML({ current: "settings", role: "cadre", name: "王", lang: "zh", rail: false });
  assert.match(h, /<div class="btnav-items"><a href="\/home\/\?lang=zh">首頁<\/a><\/div>/);
  assert.doesNotMatch(navHTML({ current: "home", role: "cadre", name: "王", lang: "zh" }), /btnav-items/);
  assert.match(readFileSync("settings/src/main.js", "utf8"), /board: S\.me && S\.me\.board_role, rail: false \}\)/);
  assert.match(readFileSync("intern-passport/src/main.js", "utf8"), /rail: false \}\)/);
  // 搜尋那一頁讀 ?q=（頂欄的搜尋框從別頁送過來）。
  assert.match(readFileSync("admin/search/src/main.js", "utf8"), /searchParams\.get\("q"\)/);
});
test("★ 大頭照那一份選單用瀏覽器的 popover，不寫程式、不用 details", () => {
  const h = navHTML({ current: null, role: "cadre", name: "a", lang: "zh" }).replace(/<!--[\s\S]*?-->/g, "");
  assert.match(h, /popovertarget="btnav-menu"/); assert.match(h, /id="btnav-menu" popover>/);
  assert.doesNotMatch(h, /<details|onclick=/);
  const css = readFileSync("shared/nav.css", "utf8");
  assert.match(css, /\.btnav-menu:not\(:popover-open\)\{display:none\}/, "不認得 popover 的舊瀏覽器：這一條整條不算，選單直接攤開，還是點得到");
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
