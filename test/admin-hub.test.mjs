// 後台拆成四個資料夾（2026-10-15）：/admin/ 申請、/admin/site/ 對外、
// /admin/passports/ 護照、/admin/people/ 人與權限。
//
// 分組列（GROUPS、canEnter、groupBarHTML）在四個資料夾各有一份，因為資料夾之間不互相 import
//（跟 esc() 同一條規矩）。這個檔案是接縫：四份漂移的表現是「在 A 頁看得到的組，到 B 頁不見了」，
// 不會報錯。跑法：node --test test/*.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as FORMS from "../admin/src/ui.js";
import * as SITE from "../admin/site/src/ui.js";
import * as PASS from "../admin/passports/src/ui.js";
import * as PEOPLE from "../admin/people/src/ui.js";

const IMPL = [["admin", FORMS], ["admin/site", SITE], ["admin/passports", PASS], ["admin/people", PEOPLE]];

const ME = {
  member:   { role: "cadre",   board: "member",    team: "Curriculum Team" },
  director: { role: "cadre",   board: "director",  team: "Marketing Team" },
  istaff:   { role: "cadre",   board: "member",    team: "Marketing Team, Internship Team" },
  pres:     { role: "cadre",   board: "president", team: "" },
  student:  { role: "student", board: "president", team: "Internship Team" },
  intern:   { role: "intern",  board: "member",    team: "Internship Team" },
};

test("★ 四個資料夾的 GROUPS 一字不差", () => {
  for (const [label, M] of IMPL) {
    assert.deepEqual(M.GROUPS, FORMS.GROUPS, `${label} 的 GROUPS 跟 admin/ 不一樣`);
  }
  assert.deepEqual(FORMS.GROUPS.map(g => g.key), ["forms", "site", "passports", "people"]);
  for (const g of FORMS.GROUPS) assert.match(g.href, /^\/admin\//, "每一組都在 /admin/ 底下");
});

test("★ 四份 canEnter 對同一個人講一樣的話", () => {
  const want = {
    member:   { forms: true, site: true, passports: false, people: false },
    director: { forms: true, site: true, passports: false, people: false },
    istaff:   { forms: true, site: true, passports: true,  people: false },
    pres:     { forms: true, site: true, passports: true,  people: true },
    // 學員與 intern 什麼都進不去，就算 board_role 或 team 被誤設也一樣。
    student:  { forms: false, site: false, passports: false, people: false },
    intern:   { forms: false, site: false, passports: false, people: false },
  };
  for (const [label, M] of IMPL) {
    for (const [who, me] of Object.entries(ME)) {
      for (const g of M.GROUPS) {
        assert.equal(M.canEnter(g, me), want[who][g.key], `${label}：${who} 對 ${g.key}`);
      }
    }
  }
});

test("★ 分組列：進得去的是連結、進不去的是灰字，當前的那一組有標記", () => {
  for (const [label, M] of IMPL) {
    const bar = M.groupBarHTML("site", ME.member);
    assert.match(bar, /<a class="chip wide on" data-group="site"[^>]*aria-current="page"/, label);
    assert.match(bar, /<a class="chip wide" data-group="forms" href="\/admin\/"/, label);
    assert.match(bar, /<span class="chip wide off" title="[^"]*Internship team[^"]*">護照<\/span>/, label);
    assert.match(bar, /<span class="chip wide off" title="[^"]*Co-President[^"]*">人與權限<\/span>/, label);
    assert.doesNotMatch(bar, /href="\/admin\/people\/"/, `${label}：一般幹部不該拿到人與權限的連結`);
    const pres = M.groupBarHTML("forms", ME.pres);
    assert.equal((pres.match(/<a /g) || []).length, 4, `${label}：Co-President 四組都是連結`);
  }
});

test("後台首頁那張卡：四組各一句、進不去的灰掉、待寄的信有數字", () => {
  const h = FORMS.hubHTML(ME.director, [{ id: 1, tries: 0 }, { id: 2, tries: 2, error: "boom" }], true, false);
  assert.match(h, /還有 <b>2<\/b> 封信沒有寄出去/);
  assert.match(h, /1 封試過但失敗了：boom/);
  assert.match(h, /data-act="send-mail-all"/);
  assert.match(h, /<li class="off">\s*<b>人與權限<\/b>/);
  assert.match(h, /對外七頁/, "要講清楚對外文案不在後台");
  // 一般幹部看得到數字，但沒有那顆會寄信的按鈕。
  assert.doesNotMatch(FORMS.hubHTML(ME.member, [{ id: 1, tries: 0 }], false, false), /send-mail-all/);
  // 沒有待寄的信就完全不畫那一塊。
  assert.doesNotMatch(FORMS.hubHTML(ME.member, [], false, false), /沒有寄出去/);
});

test("★ 四個資料夾互不 import，子資料夾也不 import admin/src/", () => {
  const files = [
    "admin/src/data.js", "admin/src/ui.js", "admin/src/main.js",
    "admin/site/src/data.js", "admin/site/src/ui.js", "admin/site/src/main.js",
    "admin/passports/src/data.js", "admin/passports/src/ui.js", "admin/passports/src/main.js",
    "admin/people/src/data.js", "admin/people/src/ui.js", "admin/people/src/main.js",
  ];
  for (const f of files) {
    const src = readFileSync(f, "utf8");
    for (const m of src.matchAll(/^\s*import .*from "([^"]+)"/gm)) {
      const to = m[1];
      assert.ok(to.startsWith("./") || /\/shared\//.test(to), `${f} import 了 ${to}（只准 ./ 與 shared/）`);
    }
  }
});

test("子資料夾的 shared 路徑是三層、admin/ 是兩層（路徑寫錯畫面只會「載入中…」）", () => {
  for (const f of ["admin/site", "admin/passports", "admin/people"]) {
    for (const s of ["data.js", "main.js"]) {
      const src = readFileSync(`${f}/src/${s}`, "utf8");
      assert.ok(/from "\.\.\/\.\.\/\.\.\/shared\//.test(src), `${f}/src/${s} 的 shared 路徑不是 ../../../`);
      assert.ok(!/"\.\.\/\.\.\/shared\//.test(src), `${f}/src/${s} 還留著兩層的 shared 路徑`);
    }
    const html = readFileSync(`${f}/index.html`, "utf8");
    assert.ok(!/href="\.\.\/shared\//.test(html), `${f}/index.html 還留著兩層的 shared 路徑`);
    assert.ok(/href="\.\.\/\.\.\/shared\/brand\.css"/.test(html), `${f}/index.html 沒有讀 brand.css`);
  }
  for (const s of ["admin/src/data.js", "admin/src/main.js"]) {
    assert.ok(/from "\.\.\/\.\.\/shared\//.test(readFileSync(s, "utf8")), `${s} 的 shared 路徑不是 ../../`);
  }
});

test("學員走到後台任何一組都不說「你沒有權限」", () => {
  for (const [label, M] of IMPL) {
    const h = M.notCadreHTML();
    assert.doesNotMatch(h, /權限/, label);
    assert.match(h, /給幹部用的/, label);
  }
});
