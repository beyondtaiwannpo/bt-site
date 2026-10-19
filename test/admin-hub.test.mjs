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

test("★ 側欄：進得去的是連結、進不去的整組淡掉並說為什麼、當前那一行有標記", () => {
  for (const [label, M] of IMPL) {
    const rail = M.railHTML("site", "res", { ...ME.member, name: "王平" });
    assert.match(rail, /<a class="rail-item on" href="#res" data-act="tab" data-t="res" aria-current="page">資源/, label);
    assert.match(rail, /<a class="rail-item" href="\/admin\/#forms">申請表/, `${label}：別組的分頁是帶 # 的一般連結`);
    assert.match(rail, /<a class="rail-item" href="\/admin\/#home">首頁/, label);
    assert.match(rail, /class="rail-group off">護照<span class="why">只有 Internship team/, label);
    assert.match(rail, /class="rail-group off">人與權限<span class="why">只有 Co-President/, label);
    assert.doesNotMatch(rail, /href="\/admin\/people\/"/, `${label}：一般幹部不該拿到人與權限的連結`);
    assert.doesNotMatch(rail, /data-t="team"/, `${label}：一般幹部看不到團隊頁那一行`);
    assert.match(rail, /rail-me"><b>王平<\/b>\s*<span>一般幹部・Curriculum Team/, `${label}：側欄上要寫名字、職位、team`);
    const pres = M.railHTML("forms", "home", { ...ME.pres, name: "王平" });
    assert.equal((pres.match(/class="rail-item off"/g) || []).length, 0, `${label}：Co-President 沒有任何一行是淡的`);
    assert.equal((pres.match(/<a class="rail-item/g) || []).length, M.ITEMS.length, `${label}：Co-President 每一行都是連結`);
    assert.match(pres, /Co-President・還沒填 team/, label);
  }
});

test("★ 四份側欄與五個小零件逐字一樣（ITEMS、railHTML、shellHTML、pageHead、msgHTML、sectionHTML、emptyHTML）", () => {
  for (const [label, M] of IMPL) {
    assert.deepEqual(M.ITEMS, FORMS.ITEMS, `${label} 的 ITEMS 跟 admin/ 不一樣`);
    for (const fn of ["railHTML", "shellHTML", "pageHead", "msgHTML", "msgKind", "sectionHTML", "emptyHTML", "skeletonHTML", "canSee", "canEnter"]) {
      assert.equal(String(M[fn]), String(FORMS[fn]), `${label} 的 ${fn} 跟 admin/ 不一樣`);
    }
  }
});

test("訊息：做成了是綠的、沒做成是橘的、空的不畫", () => {
  assert.equal(FORMS.msgHTML(""), "");
  assert.match(FORMS.msgHTML("存好了。"), /class="msg ok"/);
  assert.match(FORMS.msgHTML("存不起來：你不是 Director"), /class="msg err"/);
  assert.match(FORMS.msgHTML("清單載不到：連不上"), /class="msg err"/);
  assert.match(FORMS.msgHTML("表單要有名字。"), /class="msg err"/);
  assert.match(FORMS.msgHTML("寄出 3 封。"), /class="msg ok"/);
  assert.match(FORMS.msgHTML("寄出 3 封，1 封失敗。"), /class="msg ok"/, "部分成功仍然算做了，訊息裡寫得清楚");
  assert.match(FORMS.msgHTML("<b>x</b>"), /&lt;b&gt;/, "訊息要跳脫");
});

test("頁首：標題、說明、動作、返回；空狀態三段", () => {
  const h = FORMS.pageHead("標題", "一句說明", [{ act: "go", label: "做", primary: true }, { label: "連", href: "/x/" }], { act: "back", label: "回去" });
  assert.match(h, /<button class="back" data-act="back">← 回去<\/button>/);
  assert.match(h, /<h1>標題<\/h1><div class="lede">一句說明<\/div>/);
  assert.match(h, /<button class="btn" data-act="go">做<\/button>/);
  assert.match(h, /<a class="btn ghost" href="\/x\/">連<\/a>/);
  const e = FORMS.emptyHTML("沒有東西", "怎麼開始", { act: "new", label: "加一個" });
  assert.match(e, /<b>沒有東西<\/b><div>怎麼開始<\/div>/);
  assert.match(e, /data-act="new"/);
  assert.match(FORMS.sectionHTML("段", "內", { id: "s1", hint: "提示", actions: [{ act: "a", label: "動", seq: "3" }] }),
    /<section class="section" id="s1"><h2>段<span class="hint">提示<\/span><span class="sp"><\/span><button class="btn quiet sm" data-act="a" data-seq="3">動<\/button><\/h2>內<\/section>/);
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
