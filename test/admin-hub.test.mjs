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
// 後台 2026-10-19 起有中英切換，字典預設英文；這一支大部分斷言的是中文，所以先切成中文。英文那幾條自己切。
for (const [, M] of IMPL) M.setLang("zh");

const ME = {
  member:   { role: "cadre",   board: "member",    team: "Curriculum Team" },
  director: { role: "cadre",   board: "director",  team: "Marketing Team" },
  istaff:   { role: "cadre",   board: "member",    team: "Marketing Team, Internship Team", ws: { "intern-passport": "edit" } },
  senior:   { role: "cadre",   board: "senior_adviser", team: "" },
  pdir:     { role: "cadre",   board: "director",  team: "Curriculum Team", ws: { "apps:Curriculum Team": "manage", "passport": "edit" } },
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
    senior:   { forms: true, site: true, passports: true,  people: true },
    pdir:     { forms: true, site: true, passports: true,  people: false },
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
    assert.match(rail, /<a class="rail-item" href="\/admin\/\?lang=zh#forms">申請表/, `${label}：別組的分頁是帶 ?lang= 與 # 的一般連結`);
    // 2026-10-23 批 4：「首頁」改叫「總覽」；進不去的組只留組名變淡，為什麼放在 title（滑過去才看得到），不再是一段灰字。
    assert.match(rail, /<a class="rail-item" href="\/admin\/\?lang=zh#home">總覽/, label);
    assert.match(rail, /class="rail-group off" title="只有被派進護照工作區[^"]*">護照<\/div>/, label);
    assert.match(rail, /class="rail-group off" title="只有 Co-President[^"]*">人與權限<\/div>/, label);
    assert.doesNotMatch(rail, /class="why"/, `${label}：側欄不再有灰色長文`);
    assert.doesNotMatch(rail, /href="\/admin\/people\/"/, `${label}：一般幹部不該拿到人與權限的連結`);
    assert.doesNotMatch(rail, /data-t="team"/, `${label}：一般幹部看不到團隊頁那一行`);
    assert.match(rail, /rail-me"><b>王平<\/b>\s*<span>Associate・Curriculum Team/, `${label}：側欄上要寫名字、職級、team`);
    const pres = M.railHTML("forms", "home", { ...ME.pres, name: "王平" });
    assert.equal((pres.match(/class="rail-item off"/g) || []).length, 0, `${label}：Co-President 沒有任何一行是淡的`);
    assert.equal((pres.match(/<a class="rail-item/g) || []).length, M.ITEMS.length, `${label}：Co-President 每一行都是連結`);
    // 2026-10-24：Co-President 與 Senior Adviser 是整個組織的，側欄印「全部 team」，不印標籤也不印「還沒填」。
    assert.match(pres, /Co-President・全部 team/, label);
    assert.match(M.railHTML("forms", "home", { ...ME.senior, name: "顧", team: "Marketing Team" }), /Senior Adviser・全部 team/, `${label}：Senior Adviser 就算勾了標籤也印全部 team`);
  }
});

test("★ 四份側欄與五個小零件逐字一樣（ITEMS、railHTML、shellHTML、pageHead、msgHTML、sectionHTML、emptyHTML）", () => {
  for (const [label, M] of IMPL) {
    assert.deepEqual(M.ITEMS, FORMS.ITEMS, `${label} 的 ITEMS 跟 admin/ 不一樣`);
    for (const fn of ["railHTML", "langSwitchHTML", "shellHTML", "pageHead", "msgHTML", "msgKind", "sectionHTML", "emptyHTML", "skeletonHTML", "canSee", "canEnter", "boardName",
                       "toast", "needAsk", "mountAsk", "cancelAsk", "afterRender", "downHTML",
                       "mpName", "mpFind", "mpItems", "mpLinksHTML", "membersPanelHTML",
                       "pkTeamsOf", "pkCandidates", "pkShown", "pkTickAll", "pkToggle", "pkPicked", "pkReduce", "batchUndo", "pkRefocus", "rankTag", "membersAreaHTML",
                       "prefetchTargets", "bindPrefetch", "loadedVersion", "versionDiffers", "checkVersion",
                       "debounce", "saveMode", "dirtyTracker", "formValues", "autosaveHint", "autosaveState", "bindAutosave"]) {
      if (fn === "PK_TEAMS") continue;
      assert.equal(String(M[fn]), String(FORMS[fn]), `${label} 的 ${fn} 跟 admin/ 不一樣`);
    }
  }
});

// 2026-10-23 批 1：做成了的訊息改走 toast（afterRender），頁首只畫沒做成的。
test("訊息：沒做成是橘的留在頁首、做成了不畫在頁首（走 toast）、空的不畫", () => {
  assert.equal(FORMS.msgHTML(""), "");
  assert.equal(FORMS.msgHTML("存好了。"), "");
  assert.match(FORMS.msgHTML("存不起來：你不是 Director"), /class="msg err"/);
  assert.match(FORMS.msgHTML("清單載不到：連不上"), /class="msg err"/);
  assert.match(FORMS.msgHTML("表單要有名字。"), /class="msg err"/);
  assert.equal(FORMS.msgHTML("寄出 3 封。"), "");
  assert.equal(FORMS.msgKind("寄出 3 封，1 封失敗。"), "ok", "部分成功仍然算做了，訊息裡寫得清楚");
  assert.match(FORMS.msgHTML("存不起來：<b>x</b>"), /&lt;b&gt;/, "訊息要跳脫");
});

// 2026-10-23 批 1：十處瀏覽器原生 confirm() 全換成 inline confirm（needAsk）。跟守 prompt( 那條同一個做法。
test("★ 四個 main.js 不准再用瀏覽器的 confirm()，會丟東西的按鈕走 needAsk", () => {
  for (const f of ["admin/src/main.js", "admin/site/src/main.js", "admin/passports/src/main.js", "admin/people/src/main.js"]) {
    const body = readFileSync(f, "utf8");
    assert.doesNotMatch(body, /(^|[^.\w])confirm\(/m, `${f} 還在用 confirm()`);
    assert.match(body, /UI\.afterRender\(S, el\)/, `${f} 的 render() 沒有叫 afterRender（toast、inline confirm、捲回最上面都靠它）`);
    assert.match(body, /addEventListener\("popstate"/, `${f} 沒接 popstate（上一頁與網址列改 # 要能換分頁）`);
    assert.match(body, /history\.pushState/, `${f} 側欄切分頁要用 pushState，不然上一頁回不去`);
  }
});

// needAsk：第一次按回 true 並記住要問什麼；按了「確定」（data-confirmed="1"）再進來回 false。沒有 document 也能跑（測試環境）。
test("needAsk：第一次問、第二次放行", () => {
  const S = {};
  const b = { dataset: { act: "ws-unassign", id: "u1" } };
  assert.equal(FORMS.needAsk(S, b, "真的要移出？"), true);
  assert.deepEqual(S.ask, { act: "ws-unassign", id: "u1", text: "真的要移出？" });
  const yes = { dataset: { act: "ws-unassign", id: "u1", confirmed: "1" } };
  assert.equal(FORMS.needAsk(S, yes, "真的要移出？"), false);
  assert.equal(S.ask, null);
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

// 首頁三塊（2026-10-19，批 2）。forms 是 loadForms() 的形狀，todo 是 loadTodo() 的形狀。
const FORMS_DATA = [
  { id: "f1", title: "探索營", team: "Curriculum Team", status: "open", counts: { total: 5, received: 3 } },
  { id: "f2", title: "招募", team: "Marketing Team", status: "draft", counts: { total: 0, received: 0 } },
];
const ROSTER = [
  { id: "u1", name_zh: "王平", team: "Sponsorship Team", board_role: "president" },
  { id: "u2", name_zh: "林育安", team: "Curriculum Team, Internship Team", board_role: "director" },
  { id: "u3", name_zh: "", name_en: "", team: "", board_role: "member" },
];
const TODO = { resources: [{ id: "r1", team: "Curriculum Team", status: "published" }], roster: ROSTER,
  team: [{ id: "u2" }], stories: [{ id: "s1", story_approved: false }, { id: "s2", story_approved: true }],
  interns: [{ id: "i1" }, { id: "i2" }], stamps: [{ task_id: "T1" }, { task_id: "T1" }, { task_id: "T2" }] };

test("首頁：Co-President 看到六張卡，每張一個數字、一顆直達的按鈕", () => {
  const h = FORMS.hubHTML({ ...ME.pres, name: "王平", team: "Sponsorship Team" }, [{ id: 1, tries: 0 }, { id: 2, tries: 2, error: "boom" }], true, false, FORMS_DATA, TODO);
  assert.match(h, /王平，Co-President，全部 team/, "總覽那一行：Co-President 印全部 team，不印標籤");
  assert.match(h, /<div class="kpi-n">3<span class="kpi-u">件<\/span><\/div>\s*<div class="kpi-l">還沒處理的申請/);
  assert.match(h, /data-act="open-apps" data-id="f1">去審/, "按下去直接到第一份有待審的表單");
  assert.match(h, /<div class="kpi-n">2<span class="kpi-u">封/);
  assert.match(h, /1 封試過但失敗了：boom/);
  assert.match(h, /data-act="send-mail-all"/);
  assert.match(h, /<div class="kpi-n">1<span class="kpi-u">人<\/span><\/div>\s*<div class="kpi-l">等你核可上團隊頁/);
  assert.match(h, /href="\/admin\/site\/\?lang=zh#team"/, "直達的連結帶著語言");
  assert.match(h, /<div class="kpi-n">1<span class="kpi-u">人<\/span><\/div>\s*<div class="kpi-l">等你核可上校友頁/, "只算還沒核可的");
  assert.match(h, /<div class="kpi-n">2<span class="kpi-u">位<\/span><\/div>\s*<div class="kpi-l">這一屆的 intern/);
  assert.match(h, /平均蓋了 1\.5 格/);
  assert.match(h, /<div class="kpi-n">3<span class="kpi-u">位<\/span><\/div>\s*<div class="kpi-l">幹部/);
  assert.match(h, /其中 1 位還沒填 team/);
  assert.doesNotMatch(h, /i1|T1/, "intern 那張卡只有數字，不列任何 id 或名字");
});

test("首頁：一般幹部只看到自己管得到的，沒有核可、沒有幹部名單、沒有寄信那顆按鈕", () => {
  const h = FORMS.hubHTML({ ...ME.member, name: "左芷君", team: "Marketing Team" }, [{ id: 1, tries: 0 }], false, false, FORMS_DATA, { resources: [], roster: ROSTER });
  assert.doesNotMatch(h, /核可|這一屆的 intern|幹部<\/div>/);
  assert.match(h, /還沒寄出去的信/);
  assert.doesNotMatch(h, /send-mail-all/);
  // 你的 team：只有自己的那一個。
  assert.match(h, /<h3>Marketing/);
  assert.doesNotMatch(h, /<h3>Curriculum/);
});

test("首頁：Internship team 的一般幹部多一張 intern 的卡", () => {
  const h = FORMS.hubHTML({ ...ME.istaff, name: "謝卉芸" }, [], false, false, [], { resources: [], roster: ROSTER, interns: [{ id: "i1" }], stamps: [] });
  assert.match(h, /這一屆的 intern/);
  assert.match(h, /平均蓋了 0\.0 格/);
  assert.doesNotMatch(h, /核可/);
});

test("首頁：載不到寫「載不到」不寫 0；整排都是 0 收成一行", () => {
  const h = FORMS.hubHTML({ ...ME.pres, name: "王平" }, [], true, false, [], { resources: [], roster: null, team: null, stories: [], interns: [], stamps: [] });
  assert.match(h, /class="kpi zero"/);
  assert.match(h, /class="kpi gone"[\s\S]*?載不到/);
  const z = FORMS.hubHTML({ ...ME.member, name: "a", team: "Marketing Team" }, [], false, false, [], { resources: [], roster: [] });
  assert.match(z, /今天沒有待辦/);
  assert.doesNotMatch(z, /class="kpi/);
});

test("首頁：你的 team 每段三行，Co-President 看到全部的 team，Director 的名字從名單來", () => {
  const h = FORMS.teamBlocksHTML({ ...ME.pres }, FORMS_DATA, TODO);
  assert.match(h, /<h3>Curriculum<span class="hint">1 人<\/span><\/h3>/);
  assert.match(h, /申請表<\/a>：1 份，1 份開放中，<b>3 件還沒處理<\/b>/);
  assert.match(h, /資源<\/a>：1 條，1 條已發布/);
  assert.match(h, /Director：林育安/);
  assert.match(h, /<h3>Marketing/);
  assert.match(h, /<h3>Internship/);
  assert.match(FORMS.teamBlocksHTML({ ...ME.member, team: "" }, [], TODO), /你還沒有 team/);
});

test("★ 首頁的資料層不讀心得：admin/src/data.js 不准出現 entries", () => {
  const src = readFileSync("admin/src/data.js", "utf8");
  assert.doesNotMatch(src, /from\("(intern_)?entries"\)/);
  assert.doesNotMatch(src, /intern_entries/);
  assert.match(src, /from\("intern_stamps"\)\.select\("task_id"\)/, "intern 的章只拿 task_id，不拿 user_id");
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

// ── 申請那一組（2026-10-19，批 3）────────────────────────────────────
const AF = { id: "f1", title: "探索營", team: "Curriculum Team", status: "open", counts: { total: 2, received: 1 } };

test("開新表單是內嵌表單，不是 prompt()", () => {
  assert.doesNotMatch(readFileSync("admin/src/main.js", "utf8"), /\bprompt\(/, "main.js 不准再用瀏覽器的 prompt()");
  const closed = FORMS.listHTML([AF], true, "", false, null, [], "Curriculum Team", false);
  assert.match(closed, /data-act="new-form"/);
  assert.doesNotMatch(closed, /id="new-form"/);
  const open = FORMS.listHTML([AF], true, "", true, { title: "", team: "Marketing Team", kind: "board" }, ["Curriculum Team", "Marketing Team"], "", false);
  assert.match(open, /id="new-form"/);
  assert.match(open, /<option selected>Marketing Team<\/option>/);
  assert.match(open, /<option value="board" selected>/);
  assert.match(open, /data-act="new-form-save"/);
  assert.match(open, /data-act="new-form-cancel"/);
  assert.doesNotMatch(open, /class="btn" data-act="new-form">/, "表單展開著的時候頁首那顆收起來");
  // 不是 Co-President：team 是固定的，不能選。
  const mine = FORMS.listHTML([AF], true, "", false, { title: "x", team: "Curriculum Team", kind: "program" }, [], "Curriculum Team", false);
  assert.match(mine, /id="nf-team" value="Curriculum Team" disabled/);
});

test("Co-President 的申請表清單照 team 分段，Director 的不分", () => {
  const two = [AF, { ...AF, id: "f2", title: "招募", team: "Marketing Team" }];
  const pres = FORMS.listHTML(two, true, "", true, null, [], "", false);
  assert.match(pres, /<h2>Curriculum<span class="hint">1 份/);
  assert.match(pres, /<h2>Marketing<span class="hint">1 份/);
  // 2026-10-30 起申請是整個 BT 一個工作區：看得到的人看得到全部，team 只是標籤，有兩個以上的 team 就照標籤分段，Director 也一樣。
  const dir = FORMS.listHTML(two, true, "", false, null, [], "", false);
  assert.match(dir, /<h2>Curriculum/);
  assert.doesNotMatch(FORMS.listHTML([AF], true, "", false, null, [], "", false), /<h2>Curriculum/, "只有一個 team 就不分段");
});

test("一份表單裡的三個分頁：申請、設定、活動，當前的有標記，四個畫面都有同一條", () => {
  assert.match(FORMS.formTabsHTML(AF, "apps"), /class="subtab on" data-act="open-apps" data-id="f1" aria-current="page">申請/);
  assert.match(FORMS.formTabsHTML(AF, "question"), /class="subtab on" data-act="open-form"[^>]*>設定/);
  assert.match(FORMS.formTabsHTML(AF, "notice"), /class="subtab on" data-act="open-checkin"[^>]*>活動/);
  for (const h of [
    FORMS.formHTML(AF, [], true, [], "", false),
    FORMS.appsHTML(AF, [], [], true, new Set(), "all", [], "", false),
    FORMS.checkinHTML(AF, [], true, "", false),
    FORMS.noticeHTML(AF, [], new Set(), "", false),
  ]) {
    assert.match(h, /class="subtabs"/);
    assert.match(h, /data-act="back-list"/);
  }
});

// ── 中英切換（2026-10-19，docs/2026-10-19-後台中英切換.md）────────────────
// 四份 strings.js 的 COMMON 與機制要一模一樣；每個鍵中英都要有；每個畫面用英文畫出來不能剩中文。
import * as FORMS_S from "../admin/src/strings.js";
import * as SITE_S from "../admin/site/src/strings.js";
import * as PASS_S from "../admin/passports/src/strings.js";
import * as PEOPLE_S from "../admin/people/src/strings.js";
const STR = [["admin", FORMS_S], ["admin/site", SITE_S], ["admin/passports", PASS_S], ["admin/people", PEOPLE_S]];

test("★ 四份字典的 COMMON 與機制（T、pickLang、withLang、isErr）逐字一樣", () => {
  for (const [label, S] of STR) {
    assert.deepEqual(S.COMMON, FORMS_S.COMMON, `${label} 的 COMMON 跟 admin/ 不一樣`);
    for (const fn of ["T", "pickLang", "withLang", "isErr", "setLang", "lang"]) {
      assert.equal(String(S[fn]), String(FORMS_S[fn]), `${label} 的 ${fn} 跟 admin/ 不一樣`);
    }
    assert.equal(S.STORE_KEY, FORMS_S.STORE_KEY);
  }
});

test("★ 每一個鍵 zh 與 en 都有，MINE 不跟 COMMON 撞鍵", () => {
  for (const [label, S] of STR) {
    for (const [k, row] of Object.entries(S.STRINGS)) {
      assert.equal(typeof row.zh, "string", `${label} 的 ${k} 少了 zh`);
      assert.equal(typeof row.en, "string", `${label} 的 ${k} 少了 en`);
      assert.ok(row.zh.length, `${label} 的 ${k} 的 zh 是空的`);
    }
    for (const k of Object.keys(S.MINE)) assert.ok(!(k in S.COMMON), `${label} 的 MINE 跟 COMMON 都有 ${k}`);
  }
});

test("語言怎麼決定：網址先、再存的、都沒有就英文；連結帶 ?lang=；單複數", () => {
  const S = FORMS_S;
  assert.equal(S.pickLang("?lang=zh", "en"), "zh");
  assert.equal(S.pickLang("?tab=forms", "zh"), "zh");
  assert.equal(S.pickLang("", null), "en");
  assert.equal(S.pickLang("?lang=fr", "de"), "en", "認不得的值當成沒有");
  S.setLang("en");
  assert.equal(S.withLang("/admin/site/#team"), "/admin/site/?lang=en#team");
  assert.equal(S.withLang("/admin/?tab=forms#x"), "/admin/?tab=forms&lang=en#x");
  assert.equal(S.withLang("/admin/?lang=zh#x"), "/admin/?lang=zh#x", "已經有的不重複加");
  assert.equal(S.T("forms.perTeam", { n: 1 }), "1 form");
  assert.equal(S.T("forms.perTeam", { n: 3 }), "3 forms");
  assert.equal(S.T({ zh: "甲", en: "A" }), "A", "T 也吃 { zh, en } 物件");
  assert.equal(S.T("no.such.key"), "no.such.key", "鍵不存在就回鍵本身，畫面上看得到");
  S.setLang("zh");
  assert.equal(S.T("forms.perTeam", { n: 3 }), "3 份");
  assert.ok(S.isErr("存不起來：x") && S.isErr("Could not save: x") && !S.isErr("寄出 3 封，1 封失敗。") && !S.isErr("Saved."));
});

test("★ 側欄有中英切換的兩顆按鈕，現在的那一顆亮著", () => {
  for (const [label, M] of IMPL) {
    const rail = M.railHTML("forms", "home", { ...ME.member, name: "a" });
    assert.match(rail, /<button class="lang on" data-act="lang" data-lang="zh" aria-pressed="true">中文<\/button><button class="lang" data-act="lang" data-lang="en" aria-pressed="false">English<\/button>/, label);
  }
  FORMS.setLang("en");
  try {
    const rail = FORMS.railHTML("forms", "home", { ...ME.member, name: "a" });
    assert.match(rail, /class="lang" data-act="lang" data-lang="zh"/);
    assert.match(rail, /class="lang on" data-act="lang" data-lang="en"/);
    assert.match(rail, /Admin menu/);
  } finally { FORMS.setLang("zh"); }
});

// 英文畫出來不能剩中文。餵進去的假資料全部用英文，剩下的中文就是漏翻的。
// 剔除：HTML 註解（樣板裡的中文註解）、placeholder（有幾格本來就要填中文）、切換鈕上的「中文」、
// 信件預覽（信是寄給台灣學生的，範例與系統加的那段本來就是中文）。
const CJK = /[一-鿿]/;
function leftover(html) {
  const h = String(html)
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/ placeholder="[^"]*"/g, "")
    .replace(/<div class="rail-lang"[\s\S]*?<\/div>/g, "")
    .replace(/<div class="mailprev">[\s\S]*?<\/div>/g, "")
    .replace(/<div class="mini" style="margin-bottom:8px">[^<]*<\/div>/g, "")   // 「用「陳小安」當範例」那一句：範例是信裡真的會出現的中文
    .replace(/\{姓名\}|\{活動名稱\}/g, "");   // 代換符號跟資料庫的 mail_fill() 一樣是中文，不翻
  const m = h.match(CJK);
  return m ? h.slice(Math.max(0, m.index - 40), m.index + 40) : "";
}
function allEn(label, M, screens) {
  M.setLang("en");
  try {
    for (const [name, fn] of Object.entries(screens)) {
      const left = leftover(fn());
      assert.equal(left, "", `${label} 的 ${name} 用英文畫還剩中文：…${left}…`);
    }
  } finally { M.setLang("zh"); }
}
const EN_ME = { role: "cadre", board: "president", team: "Marketing Team, Internship Team", name: "Paul", senior: true, pres: true, ws: {} };

test("★ admin/ 每一個畫面用英文畫出來不剩中文", () => {
  const form = { id: "f1", title: "Camp", team: "Curriculum Team", status: "open", kind: "board", intro: "", lang: "en", counts: { total: 2, received: 1 } };
  const qs = [{ id: "q1", label: "Why", help: "h", type: "single", required: true, options: ["a", "b"] }, { id: "q2", label: "What", type: "short", options: [] }];
  const app = { id: "a1", applicant_name: "Amy", applicant_school: "", applicant_grade: "G11", applicant_email: "a@x.io", guardian_email: "g@x.io", status: "accepted", submitted_at: "2026-10-01T00:00:00Z", checked_in_at: null, answers: new Map([["q1", "a"]]) };
  const todo = { resources: [{ id: "r1", team: "Marketing Team", status: "published" }], roster: [{ id: "u1", name_zh: "", name_en: "Paul", team: "Marketing Team", board_role: "director" }, { id: "u2", team: "", board_role: "member" }],
    team: [{ id: "u2" }], stories: [{ id: "s1", story_approved: false }], interns: [{ id: "i1" }], stamps: [] };
  allEn("admin", FORMS, {
    rail: () => FORMS.railHTML("forms", "home", { ...ME.member, name: "a" }, { forms: 2 }),
    railPres: () => FORMS.railHTML("site", "res", EN_ME),
    hub: () => FORMS.hubHTML(EN_ME, [{ id: 1, tries: 2, error: "boom" }], true, false, [form], todo),
    hubZero: () => FORMS.hubHTML({ ...ME.member, name: "a", team: "" }, [], false, false, [], { resources: [], roster: null }),
    hubGone: () => FORMS.hubHTML(EN_ME, [], true, true, [], { resources: [], roster: null, team: null, stories: null, interns: null, stamps: [] }),
    list: () => FORMS.listHTML([form, { ...form, id: "f2", team: "", kind: "program", status: "draft" }], true, "Saved.", true, null, [], "", false),
    listMember: () => FORMS.listHTML([], false, "", false, null, [], "", false),
    listNew: () => FORMS.listHTML([form], true, "", true, { title: "", team: "Marketing Team", kind: "board" }, ["Marketing Team"], "", true),
    form: () => FORMS.formHTML(form, qs, true, ["Marketing Team"], "", true),
    formRo: () => FORMS.formHTML({ ...form, status: "closed" }, [], false, [], "Could not save: x", false),
    question: () => FORMS.questionHTML(qs[0], "", false) + FORMS.questionHTML(null, "", true),
    apps: () => FORMS.appsHTML(form, [app, { ...app, id: "a2", status: "received", applicant_school: "X" }], qs, true, new Set(["a1"]), "all", [{ id: 1, tries: 1, error: "" }], "", false),
    appsEmpty: () => FORMS.appsHTML(form, [app], qs, true, new Set(), "rejected", [], "", true) + FORMS.appsHTML(form, [], qs, false, new Set(), "all", [], "", false),
    checkin: () => FORMS.checkinHTML(form, [app, { ...app, id: "a3", checked_in_at: "2026-10-01" }], true, "", false) + FORMS.checkinHTML(form, [], false, "", false),
    notice: () => FORMS.noticeHTML(form, [app], new Set(["accepted"]), "", false) + FORMS.noticeHTML(form, [app], new Set(), "", true),
    other: () => FORMS.notCadreHTML() + FORMS.downHTML() + FORMS.skeletonHTML() + FORMS.msgHTML("Saved.") + FORMS.msgHTML("Could not save: x") + FORMS.tabsHTML("forms", true),
  });
});

test("★ admin/site 每一個畫面用英文畫出來不剩中文", () => {
  const people = [{ id: "1", name_zh: "", name_en: "Ming", team: "Curriculum Team", title: "Director · 2026-27", avatar: "x", public_approved: true }, { id: "2", name_en: "Amy", team: "", public_approved: false }];
  const stories = [{ id: "s1", name: "Amy", school: "X High", county: "", country: "US", city: "NYC", place: "NYU", quote: "q", note: "n", story_approved: false, updated_at: "2026-10-01" },
                   { id: "s2", name: "Bo", school: "Y", county: "Taipei", country: "UK", city: "", place: "", quote: "", note: "", story_approved: true, approved_at: "2026-10-02" }];
  const res = [{ id: "r1", title: "Guide", blurb: "", kind: "pdf", url: "https://x.io", team: "Marketing Team", status: "published", ord: 1 }, { id: "r2", title: "Vid", blurb: "b", kind: "zzz", url: "https://y.io", status: "draft", ord: 2 }];
  allEn("admin/site", SITE, {
    rail: () => SITE.railHTML("site", "team", EN_ME),
    team: () => SITE.publicTeamHTML(people, "", false) + SITE.publicTeamHTML([], "Could not change: x", true),
    stories: () => SITE.alumniStoriesHTML(stories, "", false) + SITE.alumniStoriesHTML(undefined, "", false),
    resList: () => SITE.resListHTML(res, true, "", true) + SITE.resListHTML([], false, "", false) + SITE.resListHTML([], true, "", false),
    resEdit: () => SITE.resEditHTML(res[0], "", false) + SITE.resEditHTML(null, "", true),
    mailList: () => SITE.mailListHTML([{ kind: "accepted", subject: "Hi", body: "b" }], ""),
    mailEdit: () => SITE.mailEditHTML("interview", null, "", false) + SITE.mailEditHTML("guardian", { subject: "s", body: "b" }, "", true),
    other: () => SITE.notCadreHTML() + SITE.downHTML() + SITE.tabsHTML("res", true),
  });
});

test("★ admin/passports 每一個畫面用英文畫出來不剩中文", () => {
  const terms = [{ id: "2026-27", title_zh: "", title_en: "INTERNSHIP 2026-27", starts_on: "2026-09-01", ends_on: "2027-07-31", active: true }, { id: "2027-28", title_zh: "", title_en: "NEXT", starts_on: "2027-09-01", ends_on: "2028-07-31", active: false }];
  const tasks = [{ id: "T2627-01", term: "2026-27", seq: 1, category: "onboard", title_zh: "", title_en: "HELLO", description: "d", active: true },
                 { id: "T2627-02", term: "2026-27", seq: 2, category: "zzz", title_zh: "", title_en: "ODD", description: "", active: false }];
  const intern = { terms, tasks, stamped: { "T2627-01": 2 }, interns: 3 };
  const months = [{ seq: 1, month: 9, theme_zh: "07:00", theme_en: "" }, { seq: 2, month: 10, theme_zh: "", theme_en: "" }];
  const acts = [{ id: "09A", month: 9, category: "gather", title_zh: "", title_en: "OPENING", description: "d", active: true, needs_host: true, callback_to: "" },
                { id: "09B", month: 9, category: "frame", title_zh: "", title_en: "PHOTO", description: "", active: false, needs_host: false, callback_to: "09A" }];
  const dests = [{ code: "TPE", city: "TAIPEI", active: true }, { code: "NRT", city: "TOKYO", active: false }];
  const pass = { months, activities: acts, destinations: dests, stamped: { "09A": 1 } };
  allEn("admin/passports", PASS, {
    rail: () => PASS.railHTML("passports", "interns", EN_ME),
    noAccess: () => PASS.noAccessHTML(ME.member) + PASS.notCadreHTML() + PASS.downHTML() + PASS.tabsHTML("cadre", true),
    interns: () => PASS.internAdminHTML(intern, "2027-28", "", false, true, "project") + PASS.internAdminHTML({ terms: [], tasks: [], stamped: {}, interns: 0 }, null, "", true, false, null),
    termEdit: () => PASS.internTermEditHTML(terms[0], "", false, null) + PASS.internTermEditHTML(null, "", true, null),
    taskEdit: () => PASS.internTaskEditHTML(tasks[0], "2026-27", "", "", false, null) + PASS.internTaskEditHTML(null, "2026-27", "T2627-03", "", true, null),
    cadre: () => PASS.passportAdminHTML(pass, "", false, 9) + PASS.passportAdminHTML({ months: [], activities: [], destinations: [], stamped: {} }, "", true, null),
    cities: () => PASS.citiesHTML(pass, "", false) + PASS.citiesHTML({ destinations: [] }, "", true),
    actEdit: () => PASS.activityEditHTML(acts[0], 9, months, "", false, null) + PASS.activityEditHTML(null, 10, months, "", true, null),
    monthEdit: () => PASS.monthEditHTML(months[0], "", false, null),
    destEdit: () => PASS.destinationEditHTML(dests[0], "", false, null) + PASS.destinationEditHTML(null, "", true, null),
  });
});

test("★ admin/people 每一個畫面用英文畫出來不剩中文", () => {
  const terms = [{ id: "2026-27", title_zh: "", title_en: "TERM 2026-27", starts_on: "2026-08-01", ends_on: "2027-07-31", status: "current" },
                 { id: "2025-26", title_zh: "", title_en: "", starts_on: "2025-08-01", ends_on: "2026-07-31", status: "ended" }];
  const people = [
    { person_id: "p1", profile_id: "u1", name_zh: "", name_en: "Paul", role: "cadre", board_role: "president", team: "Sponsorship Team, Internship Team",
      positions: [{ term: "2026-27", title_zh: "", title_en: "Co-President", team: "" }], workspaces: [], note: "", pending_code: null, maybe_dup: null },
    { person_id: "p2", profile_id: "u2", name_zh: "", name_en: "", role: "cadre", board_role: "member", team: "", positions: [], workspaces: [{ id: "apps:Curriculum Team", level: "view" }], maybe_dup: null },
    { person_id: "p3", profile_id: "u3", name_en: "Amy", role: "cadre", board_role: "director", team: "Curriculum Team",
      positions: [{ term: "2026-27", title_en: "Director, Curriculum Team", team: "Curriculum Team" }, { term: "2025-26", title_en: "Associate", team: "" }], workspaces: [{ id: "apps:Curriculum Team", level: "manage" }], maybe_dup: ["p4"] },
    { person_id: "p4", profile_id: null, name_en: "amy", role: null, board_role: null, team: null, positions: [{ term: "2025-26", title_en: "Associate", team: "Marketing Team" }], workspaces: [], pending_code: "bt-old", maybe_dup: ["p3"] },
    { person_id: "p5", profile_id: "u5", name_en: "Old", role: "alumni", board_role: "member", team: "", positions: [], workspaces: [], maybe_dup: null },
  ];
  const changes = [{ target: "u3", target_name: "", field: "board_role", old_value: "member", new_value: "director", changed_by: "u1", created_at: "2026-10-19T10:00:00Z" },
                   { target: "zz", field: "team", old_value: "", new_value: "Curriculum Team", changed_by: "zz", created_at: "2026-10-19T10:00:00Z" },
                   { target: "u2", field: "assignment", old_value: "@apps:X", new_value: "edit@apps:X", changed_by: null, created_at: "2026-10-19T10:00:00Z" },
                   { target: null, target_name: "Gone", field: "removed", old_value: "cadre", new_value: "p9", changed_by: "u1", created_at: "2026-10-19T10:00:00Z" },
                   { target: "u5", field: "role", old_value: "cadre", new_value: "alumni", changed_by: "u1", created_at: "2026-10-19T10:00:00Z" }];
  const ws = [{ id: "passport", kind: "passport", team: null, title_zh: "", title_en: "Cadre passport", owner: "u1", active: true },
              { id: "apps:Curriculum Team", kind: "apps", team: "Curriculum Team", title_zh: "", title_en: "", owner: "u3", active: true }];
  const members = [{ user_id: "u3", name_zh: "", name_en: "Amy", board_role: "director", level: "manage", granted_by: null, created_at: "" }];
  const codes = [{ code: "bt-abc", grants: "cadre", uses_left: 2, note: "n", created_at: "2026-10-01", uses: [{ name: "", email: "", used_at: "2026-10-02", grants: "alumni", role: "cadre" }] },
                 { code: "bt-def", grants: "intern", uses_left: 0, created_at: "", uses: [] }];
  const paste = { term: "2025-26", text: "a, b, c, d", preview: { rows: [{ name_zh: "", name_en: "b", title_en: "c", title_zh: "c", team: "d" }], bad: [2] } };
  allEn("admin/people", PEOPLE, {
    rail: () => PEOPLE.railHTML("people", "roster", EN_ME),
    roster: () => PEOPLE.rosterHTML(people, terms, "u1", true, "", false, null) + PEOPLE.rosterHTML(people, terms, "u1", false, "", true, { term: "all", team: "__none" })
      + PEOPLE.rosterHTML(people, terms, "u1", true, "", false, { term: "2025-26", team: "Nope" }) + PEOPLE.rosterHTML([], [], "u1", true, "", false, null),
    changes: () => PEOPLE.changesHTML(changes, people, "") + PEOPLE.changesHTML([], [], ""),
    person: () => PEOPLE.personEditHTML(people[0], terms, "u1", true, "", false, null, people, null)
      + PEOPLE.personEditHTML(people[2], terms, "u1", true, "", true, { board_role: "member", team: "Odd Team", term: "2025-26" }, people, { typed: "x" })
      + PEOPLE.personEditHTML(people[2], terms, "u1", false, "", false, null, people, null)
      + PEOPLE.personEditHTML(people[3], terms, "u1", true, "", false, null, people, null)
      + PEOPLE.personEditHTML({ ...people[3], pending_code: null }, terms, "u1", true, "", false, null, [], null)
      + PEOPLE.personEditHTML(people[4], terms, "u1", true, "", false, null, people, null),
    personNew: () => PEOPLE.personNewHTML(terms, "", false, null) + PEOPLE.personNewHTML([], "", true, { name_en: "x" }),
    workspaces: () => PEOPLE.workspacesHTML(ws, "apps:Curriculum Team", members, people, "", false, null, true) + PEOPLE.workspacesHTML(ws, null, [], people, "", true, { slug: "x" }, true)
      + PEOPLE.workspacesHTML([], null, [], [], "", false, null, false) + PEOPLE.workspacesHTML(ws, "passport", [], people, "", false, null, false),
    terms: () => PEOPLE.termsHTML(terms, people, "u1", true, "", false, { paste }, null) + PEOPLE.termsHTML(terms, people, "u1", true, "", false, null, { step: 1, next: {}, keep: [], typed: "" })
      + PEOPLE.termsHTML(terms, people, "u1", true, "", true, null, { step: 2, next: { id: "2027-28" }, keep: ["u3"], typed: "" })
      + PEOPLE.termsHTML(terms, people, "u1", true, "", false, null, { step: 3, next: { id: "2027-28" }, keep: ["u3"], typed: "x" })
      + PEOPLE.termsHTML([], [], "u1", false, "", false, null, null),
    invites: () => PEOPLE.inviteCodesHTML(codes, "", false, { code: "bt-x", grants: "alumni", uses: 2, note: "" }) + PEOPLE.inviteCodesHTML([], "", true, null),
    other: () => PEOPLE.noAccessHTML(ME.member) + PEOPLE.notCadreHTML() + PEOPLE.downHTML() + PEOPLE.tabsHTML("invites"),
  });
});

// 2026-10-23 第三次重整批 3：成員分頁。對一個工作區是「管」的人在那個東西自己的頁面上加人、改等級、移出。
test("★ 成員分頁：誰在裡面、等級下拉、移出、打字找人只列還沒在裡面的幹部；入口只給「管」的人，senior 全部", () => {
  const ws = [{ id: "apps:Curriculum Team", kind: "apps", title_zh: "Curriculum Team 的申請", title_en: "Curriculum Team applications", active: true },
              { id: "apps:Marketing Team", kind: "apps", title_zh: "Marketing Team 的申請", title_en: "", active: true },
              { id: "res:Curriculum Team", kind: "res", title_zh: "Curriculum Team 的資源", title_en: "", active: true },
              { id: "apps:Old Team", kind: "apps", title_zh: "舊", active: false }];
  const dir = { role: "cadre", board: "director", team: "Curriculum Team", ws: { "apps:Curriculum Team": "manage", "res:Curriculum Team": "edit" } };
  const items = FORMS.mpItems(dir, "apps:", ws);
  assert.deepEqual(items, [{ ws: "apps:Curriculum Team", name: "Curriculum Team 的申請" }], "只列自己是「管」的，不列「改」的、不列停用的");
  assert.equal(FORMS.mpItems(dir, "res:", ws).length, 0, "資源只有「改」，沒有入口");
  assert.equal(FORMS.mpItems(ME.senior, "apps:", ws).length, 2, "senior 全部");
  assert.equal(FORMS.mpItems(ME.member, "apps:", ws).length, 0);
  assert.equal(FORMS.mpItems(ME.senior, "intern-passport", [{ id: "intern-passport", kind: "intern-passport", title_zh: "實習護照", active: true }]).length, 1, "整個代號也可以");
  assert.match(FORMS.mpLinksHTML(items), /data-act="members-open" data-ws="apps:Curriculum Team" data-name="Curriculum Team 的申請"/);
  assert.equal(FORMS.mpLinksHTML([]), "");
  const mp = { ws: "apps:Curriculum Team", name: "Curriculum Team 的申請", meId: "u1",
    rows: [{ user_id: "u1", name_zh: "王平", name_en: "Paul", board_role: "president", level: "manage" }, { user_id: "u3", name_zh: "", name_en: "Mei", board_role: "member", level: "view" }],
    cadres: [{ id: "u1", name_zh: "王平", name_en: "Paul", board_role: "president" }, { id: "u3", name_zh: "", name_en: "Mei", board_role: "member" }, { id: "u4", name_zh: "小新", name_en: "Shin", board_role: "member" }] };
  const h = FORMS.membersPanelHTML(mp, "", false);
  assert.match(h, /<h1>Curriculum Team 的申請的成員<\/h1>/);
  assert.match(h, /data-act="members-back"/);
  assert.match(h, /這是你/);
  assert.match(h, /<select data-act="members-level" data-id="u3"[^>]*><option value="view" selected>看/);
  assert.match(h, /data-act="members-unassign" data-id="u3"/);
  // 2026-10-24 兩欄成員區（membersAreaHTML，ns "mp"）：左「在這個工作區裡（N）」右「還沒在裡面（M）」，各自一個 ma-col；右欄只列還沒在裡面的幹部。
  const cols = h.split('<section class="ma-col">'); assert.equal(cols.length, 3, "兩欄");
  const [, L, R] = cols;
  assert.match(L, /在這個工作區裡（2）/, "算人：王平（依職級，雖然也有一筆指派）加 Mei"); assert.match(R, /還沒在裡面（1）/);
  // 2026-10-24：王平是 Co-President 卻還留著一筆指派，只能畫成一列灰的「全部（職級）」，不畫下拉與移出；底下給 senior 一條清掉。
  assert.equal((L.match(/王平/g) || []).length, 1, "一個人一列");
  assert.match(L, /<div class="ma-row byrank"><span class="nm"><b>王平<\/b><span class="nm-en">Paul<\/span><\/span><span class="rk" title="Co-President">CP<\/span><span class="mini">全部（職級）/);
  assert.doesNotMatch(L, /data-act="members-level" data-id="u1"|data-act="members-unassign" data-id="u1"/, "依職級的人沒有下拉與移出");
  assert.doesNotMatch(L, /members-cleanup/, "不是 senior 看不到清掉");
  const Ls = FORMS.membersPanelHTML(Object.assign({}, mp, { senior: true }), "", false).split('<section class="ma-col">')[1];
  assert.match(Ls, /另外有 1 筆指派是給靠職級就有一切的人的，多餘。 <button type="button" class="lnk" data-act="members-cleanup" data-ids="u1">清掉這 1 筆<\/button>/);
  assert.doesNotMatch(R, /王平/, "依職級的人也不在右邊");
  assert.match(R, /name="mp-member" value="u4" data-act="pk-tick" data-ns="mp"/);
  assert.match(R, /<span class="nm"><b>小新<\/b><span class="nm-en">Shin<\/span><\/span><span class="rk" title="Associate">AS<\/span>/, "職級是兩個字母的標，不是 pill");
  assert.doesNotMatch(R, /Mei/, "已經在裡面的不列在右邊");
  assert.doesNotMatch(R, /王平/, "Co-President 靠職級就有，不列在右邊");
  assert.match(L, /<input id="mp-mq" class="ma-find"/, "左欄也有找名字");
  assert.match(R, /<div class="ma-head">[\s\S]*<input id="mp-q" class="ma-find"[\s\S]*data-act="pk-all"[\s\S]*data-act="pk-none"[\s\S]*<select id="mp-level"[\s\S]*data-act="members-assign"[\s\S]*<\/div>\s*<div class="ma-list">/, "控制項全在右欄的頭（釘住），名單在底下");
  assert.match(h, /data-act="members-assign" data-ns="mp" data-ws="apps:Curriculum Team" disabled>加 0 個人</, "沒勾人那顆是灰的");
  assert.equal(FORMS.mpFind(mp.cadres, "小新 (Shin)").id, "u4");
  assert.equal(FORMS.mpFind(mp.cadres, "mei").id, "u3");
  assert.equal(FORMS.mpFind(mp.cadres, "x"), null);
  assert.match(FORMS.membersPanelHTML({ ws: "x", rows: [], cadres: [] }, "", false), /還沒有人被派進來/);
  assert.match(FORMS.membersPanelHTML({ ws: "x", rows: [], cadres: [] }, "", false), /每一位幹部都已經在裡面了/);
  assert.match(FORMS.membersPanelHTML(mp, "", true), /disabled/);
  // 清單頁接得上：最後一個參數給了就畫入口，沒給就沒有。
  assert.match(FORMS.listHTML([], true, "", false, null, [], "", false, items), /data-act="members-open"/);
  assert.doesNotMatch(FORMS.listHTML([], true, "", false, null, [], "", false), /members-open/);
  assert.match(SITE.resListHTML([], true, "", false, items), /data-act="members-open"/);
});

// 2026-10-24 Paul：「一次很難加好幾個人」。加人改成多選：篩名字、team chip、全勾看到的、一個等級、加 N 個人、復原移出那 N 個。
test("★ 多選加人：不列在裡面的與靠職級的；找名字含中英；team chip 是其中任何一個；全勾只勾篩出來的；人數在按鈕上；復原只移這一批", async () => {
  const people = [
    { id: "u1", name_zh: "王平", name_en: "Paul", board_role: "president", team: "Curriculum Team" },
    { id: "u2", name_zh: "小安", name_en: "", board_role: "director", team: "Curriculum Team" },
    { id: "u3", name_zh: "", name_en: "Mei", board_role: "member", team: "Marketing Team, Internship Team" },
    { id: "u4", name_zh: "小新", name_en: "Shin", board_role: "member", team: "Marketing Team" },
    { id: "u5", name_zh: "阿顧", name_en: "Gu", board_role: "senior_adviser", team: "" },
    { id: "u6", name_zh: "小美", name_en: "May", board_role: "adviser", team: "" }];
  const cands = FORMS.pkCandidates(people, ["u2"]);
  assert.deepEqual(cands.map(p => p.id), ["u3", "u4", "u6"], "在裡面的 u2 不列，Co-President 與 Senior Adviser 不列");
  assert.deepEqual(FORMS.pkShown(cands, { q: "shin" }).map(p => p.id), ["u4"], "英文名包含就算");
  assert.deepEqual(FORMS.pkShown(cands, { q: "小" }).map(p => p.id), ["u4", "u6"], "中文名包含就算");
  assert.deepEqual(FORMS.pkShown(cands, { teams: ["Internship Team"] }).map(p => p.id), ["u3"], "team chip 看的是他勾的每一個 team");
  assert.deepEqual(FORMS.pkShown(cands, { teams: ["Internship Team", "Marketing Team"] }).map(p => p.id), ["u3", "u4"], "勾兩個 chip 是其中任何一個");
  assert.deepEqual(FORMS.pkShown(cands, { q: "mei", teams: ["Curriculum Team"] }), [], "名字與 team 都要對得上");
  // 全勾看到的：只勾篩出來的那幾個，原本勾的留著；全部取消是空。
  const el = (act, extra) => ({ dataset: Object.assign({ act, ns: "mp" }, extra || {}) });
  let pk = FORMS.pkReduce(null, people, ["u2"], Object.assign(el("pk-q"), { value: "小" }));
  assert.equal(pk.q, "小");
  pk = FORMS.pkReduce(pk, people, ["u2"], el("pk-all"));
  assert.deepEqual(pk.ticked, ["u4", "u6"], "全勾只勾篩出來的");
  pk = FORMS.pkReduce(pk, people, ["u2"], Object.assign(el("pk-q"), { value: "" }));
  pk = FORMS.pkReduce(pk, people, ["u2"], Object.assign(el("pk-tick"), { value: "u3", checked: true }));
  assert.deepEqual(pk.ticked, ["u4", "u6", "u3"]);
  pk = FORMS.pkReduce(pk, people, ["u2"], Object.assign(el("pk-tick"), { value: "u6", checked: false }));
  assert.deepEqual(pk.ticked, ["u4", "u3"]);
  pk = FORMS.pkReduce(pk, people, ["u2"], el("pk-team", { team: "Marketing Team" }));
  assert.deepEqual(pk.teams, ["Marketing Team"]);
  pk = FORMS.pkReduce(pk, people, ["u2"], el("pk-team", { team: "Marketing Team" }));
  assert.deepEqual(pk.teams, [], "再按一次就拿掉");
  pk = FORMS.pkReduce(pk, people, ["u2"], Object.assign(el("pk-level"), { value: "edit" }));
  assert.equal(pk.level, "edit");
  // 勾過的人後來被加進去了（在裡面）就不算：pkPicked 只算還列得出來的。
  assert.deepEqual(FORMS.pkPicked(people, ["u2", "u3"], pk), ["u4"]);
  const rows = [{ user_id: "u2", name_zh: "小安", name_en: "", board_role: "director", level: "manage" }];
  const area = (r, p, extra) => FORMS.membersAreaHTML("mp", Object.assign({ rows: r, people, pk: p, busy: false, acts: { level: "members-level", remove: "members-unassign" }, go: { act: "members-assign", ws: "apps" } }, extra || {}));
  const h = area(rows, pk);
  assert.match(h, /<button class="btn sm" data-act="members-assign" data-ns="mp" data-ws="apps">加 2 個人<\/button>/, "按鈕上的數字是勾了幾個人");
  assert.match(h, /還沒在裡面（3）/);
  assert.match(h, /data-team="Marketing Team"/); assert.match(h, /data-team="Internship Team"/);
  assert.doesNotMatch(h, /data-team="Curriculum Team"/, "沒有可加的人的 team 不出 chip");
  assert.match(h, /<label class="ma-row pick on"><input type="checkbox" name="mp-member" value="u4" data-act="pk-tick" data-ns="mp" checked/, "勾起來的那一列有底色");
  assert.match(h, /<select id="mp-level" data-act="pk-level" data-ns="mp"[^>]*><option value="view">看<\/option><option value="edit" selected>/);
  assert.match(h, /<span class="mini">Marketing<\/span> <span class="mini">Internship<\/span>/, "team 標籤，不帶 Team 那個字");
  assert.match(h, /<span class="rk" title="Director">DR<\/span>/); assert.match(h, /<span class="rk" title="顧問">AD<\/span>/);
  // 左欄：在裡面的人一列一行，等級下拉與移出；Co-President 與 Senior Adviser 置頂、標依職級、沒有下拉與移出。
  const L = h.split('<section class="ma-col">')[1];
  assert.match(L, /在這個工作區裡（3）/, "算人：兩位依職級加小安");
  // 同一個人兩筆指派只畫一列；依職級的人就算有指派也只有一列灰的。
  const dup = area(rows.concat([{ user_id: "u2", level: "view" }, { user_id: "u5", name_zh: "阿顧", name_en: "Gu", board_role: "senior_adviser", level: "edit" }]), {}, { canCleanup: true, acts: { level: "members-level", remove: "members-unassign", cleanup: "members-cleanup" } }).split('<section class="ma-col">')[1];
  assert.equal((dup.match(/data-id="u2"/g) || []).length, 2, "小安一列（下拉加移出各一個 data-id）");
  assert.equal((dup.match(/阿顧/g) || []).length, 1); assert.match(dup, /在這個工作區裡（3）/);
  assert.match(dup, /data-act="members-cleanup" data-ids="u5"/);
  assert.match(L, /<div class="ma-row byrank"><span class="nm"><b>王平<\/b><span class="nm-en">Paul<\/span><\/span><span class="rk" title="Co-President">CP<\/span><span class="mini">全部（職級）<\/span>/);
  assert.match(L, /<div class="ma-row byrank"><span class="nm"><b>阿顧<\/b><span class="nm-en">Gu<\/span><\/span><span class="rk" title="Senior Adviser">SA<\/span>/);
  assert.match(L, /<div class="ma-row"><span class="nm"><b>小安<\/b><span class="nm-en"><\/span><\/span><span class="rk" title="Director">DR<\/span>[\s\S]*?<select data-act="members-level" data-id="u2"[^>]*><option value="view">看<\/option><option value="edit">改<\/option><option value="manage" selected>管<\/option><\/select>\s*<button type="button" class="lnk" data-act="members-unassign" data-id="u2">移出<\/button>/);
  assert.ok(L.indexOf('class="ma-row byrank"') < L.indexOf('data-id="u2"'), "依職級的置頂");
  // 左欄的找名字只篩左欄。
  const Lq = area(rows, Object.assign({}, pk, { mq: "小安" })).split('<section class="ma-col">')[1];
  assert.doesNotMatch(Lq, /王平/); assert.match(Lq, /小安/);
  assert.match(area(rows, Object.assign({}, pk, { mq: "zzz" })), /沒有對得上的人/);
  // 空狀態與存檔中。
  assert.match(area([], {}, { people: people.filter(p => !["president", "senior_adviser"].includes(p.board_role)) }), /還沒有人被派進來。右邊勾人加進來。/);
  assert.doesNotMatch(area([], {}), /還沒有人被派進來/, "沒有指派但有依職級的人，左欄不算空");
  assert.match(area(rows.concat([{ user_id: "u3", level: "view" }, { user_id: "u4", level: "view" }, { user_id: "u6", level: "view" }]), {}), /每一位幹部都已經在裡面了/);
  assert.match(area(rows, { q: "zzz" }), /沒有對得上的人/);
  assert.match(area(rows, pk, { busy: true }), /存檔中…/);
  // draft 模式（加一個專案或營隊）：左欄是勾起來的人（取消 = pk-untick），右欄是還沒勾的，沒有「加 N 個人」。
  const d = FORMS.membersAreaHTML("wsn", { people, pk: { ticked: ["u4"], level: "edit" }, busy: false, draft: true });
  const [, dL, dR] = d.split('<section class="ma-col">');
  assert.match(dL, /建好就放進去（1）/); assert.match(dL, /<span class="nm"><b>小新<\/b><span class="nm-en">Shin<\/span><\/span>[\s\S]*?data-act="pk-untick" data-ns="wsn" data-id="u4"/);
  assert.doesNotMatch(dR, /value="u4"/, "勾了的人搬到左邊"); assert.match(dR, /value="u3"/); assert.match(dR, /value="u2"/, "draft 模式沒有「已經在裡面」這回事");
  assert.doesNotMatch(d, /members-assign|ws-assign/, "沒有加 N 個人那顆，建立鈕自己算");
  assert.deepEqual(FORMS.pkReduce({ ticked: ["u4", "u3"] }, people, [], { dataset: { act: "pk-untick", id: "u4" } }).ticked, ["u3"]);
  assert.equal(FORMS.pkReduce({}, people, [], { dataset: { act: "pk-mq" }, value: "x" }).mq, "x");
  assert.equal(FORMS.pkReduce(pk, people, [], el("pk-none")).ticked.length, 0);
  // 復原只移出這一批：做出復原之後清單再變也不影響。
  const removed = []; const ids = ["u4", "u3"];
  const undo = FORMS.batchUndo(ids, async id => { removed.push(id); });
  ids.push("u6");
  assert.equal(await undo(), 2);
  assert.deepEqual(removed, ["u4", "u3"], "後來多勾的 u6 不會被移出");
  // 英文的單複數。
  const { T: Ten, setLang: setL } = await import("../admin/src/strings.js");
  setL("en");
  assert.equal(Ten("pk.addN", { n: 1 }), "Add 1 person"); assert.equal(Ten("pk.addN", { n: 3 }), "Add 3 people");
  setL("zh");
});

test("成員區的列：名字不裁斷（可以換行）、下拉縮小、team 淡字先讓；四個 main.js 接了清掉多餘指派", () => {
  const css = readFileSync("admin/admin.css", "utf8");
  // 2026-10-24 第四版：名字是兩行的 .nm（中文一行、英文一行），不縮不裁；列是 min-height 不是固定高。
  assert.match(css, /\.nm\{[^}]*flex:0 0 auto/, "名字那一塊不縮");
  assert.doesNotMatch(css, /\.nm b\{[^}]*text-overflow:ellipsis/, "名字不裁斷");
  assert.match(css, /\.nm \.nm-en\{[^}]*min-height:14px/, "沒有英文名第二行也留高度，列才齊");
  assert.match(css, /\.ma-row\{[^}]*min-height:40px/, "列是 min-height，不是固定高");
  // 四份一樣的 nameBlock：永遠兩個元素，中文在 b、英文在 nm-en；沒有英文名第二個是空的；只有英文名就放在第一行。
  for (const [label, M] of IMPL) {
    assert.equal(String(M.nameBlock), String(FORMS.nameBlock), `${label} 的 nameBlock 跟 admin/ 不一樣`);
    assert.equal(M.nameBlock({ name_zh: "王宥媗", name_en: "Sophie Wang" }), '<span class="nm"><b>王宥媗</b><span class="nm-en">Sophie Wang</span></span>');
    assert.equal(M.nameBlock({ name_zh: "小安", name_en: "" }), '<span class="nm"><b>小安</b><span class="nm-en"></span></span>');
    assert.equal(M.nameBlock({ name_zh: "", name_en: "Mei" }), '<span class="nm"><b>Mei</b><span class="nm-en"></span></span>');
    assert.equal(M.nameBlock({}), '<span class="nm"><b>（沒有名字）</b><span class="nm-en"></span></span>');
  }
  assert.match(css, /\.ma-row select\{[^}]*width:72px/);
  for (const f of ["admin/src", "admin/site/src", "admin/passports/src"]) assert.match(readFileSync(`${f}/main.js`, "utf8"), /act === "members-cleanup"[\s\S]*?D\.unassign\(id, ws\)[\s\S]*?S\.undo = [\s\S]*?D\.assign\(w\.id, ws, w\.level\)/, `${f} 清掉要有復原`);
  assert.match(readFileSync("admin/people/src/main.js", "utf8"), /act === "ws-cleanup"[\s\S]*?D\.unassign\(id, ws\)[\s\S]*?S\.undo = [\s\S]*?D\.assign\(w\.id, ws, w\.level\)/);
});

test("★ 三個功能資料夾的 main.js 都接了成員分頁：開、回、加、移出、改等級，寫的是 assign / unassign，不讀 email", () => {
  for (const f of ["admin/src", "admin/site/src", "admin/passports/src"]) {
    const m = readFileSync(`${f}/main.js`, "utf8"), d = readFileSync(`${f}/data.js`, "utf8");
    for (const act of ["members-open", "members-back", "members-assign", "members-unassign", "members-level"]) assert.match(m, new RegExp(act), `${f} 沒接 ${act}`);
    assert.match(m, /UI\.needAsk\(S, b, T\("confirm\.mpRemove"/, `${f} 移出要先問一次`);
    assert.match(m, /S\.undo = /, `${f} 要有復原`);
    assert.match(d, /rpc\("workspace_members"/); assert.match(d, /rpc\("assign"/); assert.match(d, /rpc\("unassign"/);
    assert.match(d, /from\("profiles"\)\.select\("id, name_zh, name_en, board_role, team"\)/, `${f} 找人只讀名字、職級、team`);
    // 2026-10-24 一次加一批：每個人一支 assign() 同時送、復原是 batchUndo 那一批、勾選與打字走 pkReduce。
    assert.match(m, /UI\.pkPicked\(S\.mp\.cadres/, `${f} 加人要從勾起來的人算`);
    assert.match(m, /Promise\.all\(ids\.map\(id => D\.assign\(id, ws, level\)/, `${f} 一批人同時送`);
    assert.match(m, /UI\.batchUndo\(done, id => D\.unassign\(id, ws\)\)/, `${f} 復原移出的是這一批`);
    assert.match(m, /UI\.pkReduce\(S\.mp\.pk/, `${f} 勾選與打字走 pkReduce`);
    assert.match(m, /UI\.pkRefocus\(/, `${f} 打字重畫後游標要放回去`);
    assert.match(m, /e\.key !== "Enter"/, `${f} Enter 要送出`);
    assert.doesNotMatch(d, /person_email/, `${f} 不准讀 email`);
  }
});

// 2026-10-23 第三次重整批 4：總覽的「你的存取」、「你的 team」從工作區算、只能看的人卡上寫「去看」。
test("★ 總覽「你的存取」：被派的人一行一個工作區加直達；senior 一句；什麼都沒有的人看到找誰加各 team 公開的 Director；頂欄四項各一句", () => {
  const WS = [{ id: "apps", kind: "apps", title_zh: "申請（表單與審核）", active: true },
              { id: "res:Curriculum Team", kind: "res", title_zh: "Curriculum Team 的資源", active: true },
              { id: "intern-passport", kind: "intern-passport", title_zh: "實習護照", active: true },
              { id: "res:Community Relations Team", kind: "res", title_zh: "Community Relations 的資源", active: true }];
  const DIRS = [{ id: "u2", name_zh: "林育安", team: "Curriculum Team", title_en: "Director, Curriculum Team" }, { id: "u9", name_zh: "某某", team: "Curriculum Team", title_en: "Associate, Curriculum Team" }];
  const FEAT = [{ label: "護照", desc: "這一年的活動、章、心得與照片", href: "/passport/" }];
  const istaff = FORMS.accessHTML({ ...ME.istaff, ws: { "intern-passport": "edit", "apps": "view" } }, { workspaces: WS, directors: DIRS }, FEAT);
  // 2026-10-24 照 team 分組：Internship 那一段底下是「實習護照（格子與棋盤）」加等級，Curriculum 那一段是「申請（表單與審核）」。
  assert.match(istaff, /<b>Internship<\/b><\/div><div class="row"><span>實習護照（格子與棋盤）<\/span><span class="tag">改<\/span>/);
  assert.match(istaff, /href="\/intern-passport\/\?lang=zh">進度牆/, "被派進實習護照的人從這裡直達進度牆（頂欄對幹部沒有這一項）");
  assert.match(istaff, /href="\/admin\/passports\/\?lang=zh#interns">後台/);
  assert.match(istaff, /<b>整個 BT<\/b><\/div><div class="row"><span>申請（表單與審核）<\/span><span class="tag">看<\/span>/, "2026-10-30 起申請在整個 BT 那一段");
  assert.match(istaff, /玩護照是身分帶來的/); assert.match(istaff, /時間看板沒有指派/);
  assert.match(istaff, /<ul class="feat"><li><a href="\/passport\/\?lang=zh">護照<\/a>：這一年的活動/);
  const none = FORMS.accessHTML({ ...ME.member, ws: {} }, { workspaces: WS, directors: DIRS }, []);
  assert.match(none, /你還沒被派進任何工作區/);
  assert.match(none, /<b>Curriculum<\/b>：林育安/, "各 team 公開的 Director");
  assert.doesNotMatch(none, /某某/, "Associate 不算 Director");
  assert.match(FORMS.accessHTML({ ...ME.member, ws: {} }, { workspaces: WS, directors: [] }, []), /還沒有人公開在團隊頁上/);
  assert.match(FORMS.accessHTML(ME.pres, {}, []), /不用派/);
  assert.match(FORMS.hubHTML({ ...ME.pres, name: "王平" }, [], true, false, [], { resources: [], roster: [] }), /<h1>總覽<\/h1>[\s\S]*<h2>你的存取/);
  // 你的 team 從工作區算：Community Relations 沒有人勾標籤也會出現；Director 讀不到名單時從公開團隊頁算。
  const blocks = FORMS.teamBlocksHTML({ ...ME.pres }, [], { resources: [], roster: [], workspaces: WS, directors: DIRS });
  assert.match(blocks, /<h3>Community Relations/);
  assert.match(blocks, /Director：林育安/);
  assert.match(blocks, /href="\/admin\/people\/\?lang=zh#ws=res%3ACurriculum%20Team">誰在這個 team 的工作區/, "2026-10-30 起 team 的工作區只剩資源，連到那裡");
  const dir = FORMS.teamBlocksHTML({ ...ME.director, team: "", ws: { "res:Marketing Team": "manage" } }, [], { resources: [], roster: [], workspaces: WS, directors: [] });
  assert.match(dir, /<h3>Marketing/, "被派進去的 team 就算沒勾標籤也有一段");
  assert.match(dir, /誰在做/);
  // 只能看的人，卡上寫「去看」不寫「去審」。
  const view = FORMS.hubHTML({ ...ME.member, name: "a", team: "Curriculum Team", ws: { "apps:Curriculum Team": "view" } }, [], false, false, FORMS_DATA, { resources: [], roster: [] });
  assert.match(view, /data-act="open-apps" data-id="f1">去看/);
  assert.match(readFileSync("app/src/main.js", "utf8"), /S\.profile && S\.profile\.name \? "\.\.\/admin\/" : "\.\.\/settings\/"/, "幹部登入後進總覽，沒名字的才進設定");
});

test("成員分頁：Co-President 與 Senior Adviser 置頂標「依職級」，沒有下拉與移出", () => {
  const mp = { ws: "apps:Curriculum Team", name: "x", meId: "u1",
    rows: [{ user_id: "u3", name_zh: "", name_en: "Mei", board_role: "member", level: "view" }],
    cadres: [{ id: "u1", name_zh: "王平", name_en: "Paul", board_role: "president" }, { id: "u3", name_zh: "", name_en: "Mei", board_role: "member" }, { id: "u5", name_zh: "", name_en: "Sa", board_role: "senior_adviser" }] };
  const h = FORMS.membersPanelHTML(mp, "", false);
  const first = h.indexOf('<div class="ma-list">'), lead = h.indexOf('class="ma-row byrank"'), mei = h.indexOf('data-act="members-level" data-id="u3"');
  assert.ok(first > 0 && first < lead && lead < mei);
  assert.equal((h.match(/class="ma-row byrank"/g) || []).length, 2);
  assert.doesNotMatch(h.slice(0, mei), /members-unassign/);
  assert.match(FORMS.membersPanelHTML({ ws: "x", rows: [], cadres: mp.cadres }, "", false), /依職級|全部（職級）/, "沒有指派也列得出依職級的人");
});

test("總覽「你的存取」：Co-President 看到一顆「全部（職級）」徽章加一句，不列十四個工作區", () => {
  const h = FORMS.accessHTML({ ...ME.pres, ws: {} }, { workspaces: [{ id: "apps:Curriculum Team", kind: "apps", title_zh: "x", active: true }], directors: [] }, []);
  assert.match(h, /<span class="tag open">全部（職級）<\/span>/);
  assert.match(h, /不用派/);
  assert.doesNotMatch(h, /class="flist access"/, "不列工作區");
});

// 2026-10-24 工作區照 team 分組：四份同一套 wsTeamOf / wsCellLabel / wsCellHref / wsRows。
test("★ 工作區屬於哪一列、叫什麼、連到哪（四份一樣）", () => {
  for (const [label, M] of IMPL) {
    for (const fn of ["wsTeamOf", "wsCellLabel", "wsCellHref", "wsRows"]) assert.equal(String(M[fn]), String(FORMS[fn]), `${label} 的 ${fn} 跟 admin/ 不一樣`);
  }
  assert.equal(FORMS.wsTeamOf({ id: "apps:Curriculum Team" }), "Curriculum Team");
  assert.equal(FORMS.wsTeamOf({ id: "intern-passport" }), "Internship Team", "實習護照在 Internship 底下");
  assert.equal(FORMS.wsTeamOf({ id: "passport" }), "", "幹部護照是整個 BT");
  assert.equal(FORMS.wsTeamOf({ id: "custom:camp", team: "Marketing Team" }), "Marketing Team");
  assert.equal(FORMS.wsTeamOf({ id: "custom:camp", owner: "u2" }, [{ profile_id: "u2", team: "Curriculum Team, Internship Team" }]), "Curriculum Team", "自訂的沒有 team 欄就看擁有人的第一個 team");
  assert.equal(FORMS.wsTeamOf({ id: "custom:camp" }), "", "都沒有就放整個 BT");
  assert.equal(FORMS.wsCellLabel({ id: "passport" }), "幹部護照（格子與城市）");
  assert.equal(FORMS.wsCellLabel({ id: "intern-passport" }), "實習護照（格子與棋盤）");
  assert.equal(FORMS.wsCellLabel({ id: "apps:Curriculum Team" }), "申請（表單與審核）");
  assert.equal(FORMS.wsCellHref({ id: "apps:X" }), "/admin/#forms"); assert.equal(FORMS.wsCellHref({ id: "intern-passport" }), "/admin/passports/#interns");
  const rows = FORMS.wsRows([{ id: "passport" }, { id: "apps" }, { id: "intern-passport" }, { id: "res:Internship Team" }, { id: "custom:camp", team: "Internship Team" }], ["Curriculum Team", "Internship Team"]);
  assert.deepEqual(rows.map(r => [r.label, r.cells.map(c => c.id)]), [["整個 BT", ["apps", "passport"]], ["Curriculum", []], ["Internship", ["res:Internship Team", "intern-passport", "custom:camp"]]], "整個 BT 列：申請、幹部護照；Internship 列：資源、實習護照、自訂（2026-10-30 起申請不分 team）");
  assert.equal(FORMS.wsTeamOf({ id: "apps" }), ""); assert.equal(FORMS.wsCellLabel({ id: "apps" }), "申請（表單與審核）"); assert.equal(FORMS.wsCellHref({ id: "apps" }), "/admin/#forms");
});

// 2026-10-25 Paul：「I can't get into events」。側欄的 tab handler 曾經把 home 以外的一律當 forms。
// 守住：main.js 的 tab 分支直接拿 data-t 交給 openTab，不再寫死成 forms。
test("★ 側欄點擊把 data-t 原樣交給 openTab（活動、會議、需求單從側欄進得去）", () => {
  const src = readFileSync(new URL("../admin/src/main.js", import.meta.url), "utf8");
  const i = src.indexOf('act === "tab"');
  const block = src.slice(i, i + 400);
  assert.match(block, /const t = b\.dataset\.t \|\| "forms"/);
  assert.doesNotMatch(block, /=== "home" \? "home" : "forms"/);
});
