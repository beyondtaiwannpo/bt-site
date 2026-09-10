// 站台頂欄（shared/nav.js）的契約。
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { FEATURES, featuresFor, navHTML } from "../shared/nav.js";

const count = (h, re) => (h.match(re) || []).length;

test("FEATURES 每一筆都有 key / label / href / roles / title / desc", () => {
  assert.ok(FEATURES.length >= 2);
  for (const f of FEATURES)
    for (const k of ["key", "label", "href", "roles", "title", "desc"])
      assert.ok(f[k] != null && String(f[k]).length, `${f.key || "?"} 少了 ${k}`);
});

// href 是根目錄相對路徑，而且那個資料夾真的存在。
// 寫錯路徑不會報錯，只會多一個點了 404 的入口。
test("FEATURES 的 href 都指到存在的資料夾", () => {
  for (const f of FEATURES) {
    assert.match(f.href, /^\/[a-z-]+\/$/, `${f.key} 的 href 不是 /xxx/ 的形狀：${f.href}`);
    assert.ok(existsSync("." + f.href + "index.html"), `${f.href} 沒有 index.html`);
  }
});

// 2026-09-08（批 3）加了第三項「申請管理」，所以這一條不再寫死數字。
// **改成對照 FEATURES 本身**：它守的是「頂欄畫出來的項數等於清單上該看到的項數」，
// 那才是真正會壞的地方（過濾寫錯、或是有人在 navHTML 裡多畫一個寫死的連結）。
// 順便把 key 列出來對一次，不然「數量對但畫錯項目」抓不到。
test("★ 幹部看到 FEATURES 上所有屬於他的項目，當前的那一項有標記", () => {
  const h = navHTML({ current: "availability", role: "cadre", name: "王平" });
  const mine = FEATURES.filter(f => f.roles.includes("cadre"));
  assert.equal(count(h, /<a href="\/[a-z-]+\/"/g), mine.length);
  for (const f of mine) assert.ok(h.includes(`href="${f.href}"`), `頂欄少了 ${f.key}`);
  assert.match(h, /href="\/availability\/" aria-current="page"/, "當前項沒有 aria-current");
  assert.ok(!/href="\/passport\/" aria-current/.test(h), "不是當前的項被標了");
});

// ★ 學員：列照樣畫，只是功能項是空的。不整條藏起來——他知道自己在這個站裡，
// 只是還沒有功能；之後開放給學員的功能只要在 roles 加 "student"，列就自動長出來。
// 2026-09-08：學員不再是零項——/settings/ 是第一個 roles 含 student 的功能，
// 正是這個檔案檔頭一直在等的那一刻。
// **這一條守的仍然是同一件事**：學員只看得到屬於他的那幾項，
// 一項都不能多（多一項就是一條他點了會被彈回來的死路）。
test("★ 學員只看得到屬於學員的功能項，logo、名字、登出都在", () => {
  const h = navHTML({ current: null, role: "student", name: "小明" });
  const mine = FEATURES.filter(f => f.roles.includes("student"));
  assert.ok(mine.length > 0, "學員一項都沒有的話，這一條就沒有在守任何東西了");
  assert.equal(count(h, /<a href="\/[a-z-]+\/"/g), mine.length, "學員看到了他進不去的功能");
  for (const f of FEATURES.filter(x => !x.roles.includes("student")))
    assert.ok(!h.includes(`href="${f.href}"`), `學員看到了幹部才有的 ${f.key}`);
  // 2026-09-08：logo 改成回對外的首頁。/app/ 現在只剩登入表單，
  // 點 logo 回到一頁只有表單的地方沒有意義。
  assert.ok(h.includes('href="/"'), "沒有回首頁的 logo 連結");
  assert.ok(!h.includes('href="/app/"'), "logo 還指著只剩登入表單的 /app/");
  assert.ok(h.includes("小明"), "沒有名字");
  assert.ok(h.includes('data-act="signout"'), "沒有登出");
  assert.ok(h.includes('<nav class="btnav"'), "整條列不見了——空的列比消失誠實");
});

test("role 是 null（profiles 查不到）時也不會爆，當成沒有功能", () => {
  assert.doesNotThrow(() => navHTML({ current: null, role: null, name: "" }));
  assert.equal(count(navHTML({ current: null, role: null, name: "" }), /<a href="\/[a-z-]+\/"/g), 0);
});

test("名字會跳脫，而且窄螢幕用的第一個字也跳脫", () => {
  const h = navHTML({ current: "passport", role: "cadre", name: '<b>x</b>' });
  assert.ok(!h.includes("<b>x</b>"), "名字被原樣塞進 HTML");
  assert.ok(h.includes("&lt;b&gt;x&lt;/b&gt;"), "名字沒有被顯示");
  assert.ok(h.includes('<span class="short">&lt;</span>'), "第一個字沒有跳脫");
});

test("沒有名字時不畫名字那一格，但登出還在", () => {
  const h = navHTML({ current: "passport", role: "cadre", name: "" });
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
// 開合是純 CSS：一個看不見的 checkbox 加一個 label。
test("★ 選單的開關是 checkbox 加 label，而且 for 對得上 id", () => {
  const h = navHTML({ current: "settings", role: "cadre", name: "王平" });
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
  const h = navHTML({ current: null, role: "cadre", name: "" })
    .replace(/<!--[\s\S]*?-->/g, "");
  assert.doesNotMatch(h, /<details/, "改成 details 的話寬螢幕上功能項會整排不見");
  assert.doesNotMatch(h, /<summary/);
});

// 面板與那排連結是同一個 div，不是兩份。兩份的話寬螢幕改了一邊、
// 窄螢幕還是舊的，而且沒有東西會報錯。
test("★ 功能項只有一份，不是寬窄各一份", () => {
  const h = navHTML({ current: "passport", role: "cadre", name: "王平" });
  assert.equal((h.match(/class="btnav-items"/g) || []).length, 1);
  for (const f of FEATURES.filter(x => x.roles.includes("cadre")))
    assert.equal((h.match(new RegExp(`href="${f.href}"`, "g")) || []).length, 1,
      `${f.key} 出現了不只一次`);
});
